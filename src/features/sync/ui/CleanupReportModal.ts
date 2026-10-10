import { Modal, Setting, type App, type ButtonComponent } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import { logger } from "../../../core/logger";
import type { Notifier } from "../../../core/notice";
import type { SyncService } from "../syncService";
import { formatBytes } from "../repoSize";
import { ROOT_DIRECTORY, type HistorySummary } from "../historyObjects";
import { estimateRewriteMinutes, formatElapsed, normalizeRemovalPaths } from "../cleanup";
import { HistoryRewriteBlockedError } from "../errors";
import type { RewriteResult } from "../types";

/**
 * 「仓库体积体检 → 深度清理」的弹窗 —— **这个动作的唯一入口**。
 *
 * ## 为什么三步挤在一个弹窗里，而不是三个弹窗
 *
 * 体检、确认、结果天然是一件事的三个阶段，而「返回上一步」在这件事上**必须存在**：
 * 用户看到「所有提交的哈希都会变、其他设备要重新 clone」之后，最常见的反应是
 * 「等等，我再看一眼要剔哪些」。做成三个独立弹窗的话，返回就得重开一遍、
 * 重新读一遍历史（那要几秒），于是没人会返回 —— 而这里返回的成本应该是零。
 *
 * ## 每一步各要回答一个问题
 *
 * | 阶段 | 用户的问题 | 这里怎么回答 |
 * | --- | --- | --- |
 * | 体检 | 「空间被什么占了」 | 按**目录**汇总（因为剔除的单位就是目录）+ 最大的单个对象 |
 * | 确认 | 「动手会失去什么」 | 三条后果逐条列出，预计耗时当场算出来 |
 * | 重写中 | 「跑到哪了、还要多久、能不能先干别的」 | 已用时长 / 预计时长 + 不确定进度条 + 「在后台继续」 |
 * | 结果 | 「现在该怎么办」 | 备份在哪、为什么空间还没变小、接下来要强制推送 |
 *
 * ## 关掉弹窗：动手前 = 什么都不做；动手后 = 结果会弹回来
 *
 * **还没点「确认重写」时**关掉 = 什么都不做（与 `ConfirmUntrackImagesModal` 一致）——
 * 重写历史没有「点了才后悔」的余地，它不可逆。
 *
 * **已经开始重写之后**关掉则另当别论：那时事情已经在跑了，用户的意思只是
 * 「我不想一直盯着看」。所以重写跑完会把结果页**重新弹出来**（见 `runRewrite`），
 * 并在状态栏与仓库同步面板上留一个「正在重写历史…」的活动态 ——
 * 这两件事是 2026-10-10 那次修复的核心，用户报的原话是
 * 「重写进行时只有一个弹框提示，退出弹框后，没有任何正在进行的提示，无法判断进度和状态」。
 */

export interface CleanupModalDeps {
    service: SyncService;
    notifier: Notifier;
}

/** 弹窗当前处在哪个阶段。 */
type CleanupStage =
    | "loading"
    | "report"
    | "confirm"
    | "running"
    | "result"
    | "settle"
    | "settled";

/**
 * 打开弹窗时从哪一步开始。
 *
 * - `"inspect"`：体检 → 确认 → 重写 → 结果（从零开始一次清理）；
 * - `"settle"`：直接跳到**收尾**那一页（重写已经做完了，只剩
 *   「强制推送 → 确认库没问题 → 丢弃备份」）。
 */
export type CleanupStartAt = "inspect" | "settle";

export class CleanupReportModal extends Modal {
    private stage: CleanupStage = "loading";
    private summary: HistorySummary | undefined;
    private commitCount = 0;
    /** 用户勾选的顶层目录。 */
    private readonly selected = new Set<string>();
    private outcome: { result: RewriteResult; ignoredRules: number } | undefined;
    /** 「开始重写」那颗按钮 —— 一个都没勾时置灰。 */
    private primaryButton: ButtonComponent | undefined;

    /** 本次会话里强制推送成功了没有（决定收尾页那一行显示按钮还是「已推过」）。 */
    private pushed = false;
    /** 丢弃备份释放的字节数（`undefined` = 读不出来，与 `discardBackups` 同一口径）。 */
    private freedBytes: number | undefined;

    /**
     * 弹窗**已经关掉**了。
     *
     * 重写要跑几分钟，而用户完全可能在这期间把窗口关掉 —— 那之后 `runRewrite`
     * 那个 `await` 还挂着，回来时会接着调 `render()`。没有这个标记的话，
     * 那些绘制会落到一个**已经脱离文档**的 `contentEl` 上：不报错、也看不见，
     * 症状正是用户报的「退出弹框后什么都没了」（结果页连同那颗「强制推送」
     * 一起消失，用户根本没法收尾）。
     */
    private closed = false;

    /** 「已用时长」那一行 —— 每秒只改它的文本，不重绘整个弹窗。 */
    private elapsedEl: HTMLElement | undefined;
    /** 重写开始的时刻（算已用时长用）。0 = 还没开始。 */
    private startedAt = 0;
    /** 每秒刷新「已用时长」的定时器。 */
    private timer: number | undefined;

    constructor(
        app: App,
        private readonly t: LocaleStrings,
        private readonly deps: CleanupModalDeps,
        /**
         * 从哪一步开始（见 `CleanupStartAt`）。
         *
         * `"settle"` 是给设置页那条「继续上次的清理」用的 —— 它**不读历史**
         * （`load()` 要跑几秒，而收尾这一步根本不需要那些数据）。
         */
        private readonly startAt: CleanupStartAt = "inspect"
    ) {
        super(app);
    }

    onOpen(): void {
        if (this.startAt === "settle") {
            this.stage = "settle";
            this.render();
            return;
        }

        // 重开只发生在一种情况下（见 `runRewrite`）：重写跑完了，而窗口在跑的过程中
        // 被关掉过。那时结果已经拿到，直接画结果页 —— 再 `load()` 一次等于重读几秒
        // 历史，还会把用户已经做完的选择抹掉。
        this.render();
        if (this.stage === "loading") void this.load();
    }

    onClose(): void {
        this.closed = true;
        this.stopTimer();
        this.contentEl.empty();
    }

    /** 读历史（只读、可能要几秒），读完切到报告态。 */
    private async load(): Promise<void> {
        try {
            // 两条并行：汇总要跑 `rev-list --objects --all`，提交数是另一条命令，
            // 串起来等于白等一倍。
            const [summary, commits] = await Promise.all([
                this.deps.service.historySummary(),
                this.deps.service.commitCount(),
            ]);
            this.summary = summary;
            this.commitCount = commits;
            this.stage = "report";
            this.render();
        } catch (err) {
            // 读不出来就没有报告可看 —— 关掉弹窗，把原因交给统一的错误出口。
            this.close();
            this.deps.notifier.reportError(err);
        }
    }

    private render(): void {
        // 关掉之后绝不再往已经脱离文档的节点上画（见 `closed`）。
        if (this.closed) return;

        this.contentEl.empty();
        this.primaryButton = undefined;

        try {
            this.renderStage();
        } catch (err) {
            // 画不出来时**别留一个白框**。
            //
            // 用户报过「重写途中窗口白屏」—— 静态读代码没能定位到那个现场（见
            // HANDOVER 里这一轮的记录），但这类症状最难查的地方恰恰是「什么都没留下」：
            // 一个空的 `contentEl` 与「正在加载」长得一样，用户没法区分、
            // 也没法告诉你他去到哪一步。所以这里至少把原因写进控制台，
            // 并在窗口里留一句人话 —— 仓库本身不受影响，重开一次即可。
            logger.error("cleanup modal render failed", err);
            this.contentEl.empty();
            this.contentEl.createEl("p", { text: this.t.sync.cleanup.renderFailed });
        }
    }

    private renderStage(): void {
        switch (this.stage) {
            case "loading":
                this.renderLoading();
                return;
            case "report":
                this.renderReport();
                return;
            case "confirm":
                this.renderConfirm();
                return;
            case "running":
                this.renderRunning();
                return;
            case "result":
                this.renderResult();
                return;
            case "settle":
                this.renderSettle();
                return;
            case "settled":
                this.renderSettled();
                return;
        }
    }

    private renderLoading(): void {
        this.titleEl.setText(this.t.sync.cleanup.report.title);
        this.contentEl.createEl("p", {
            text: this.t.sync.cleanup.report.loading,
            cls: "setting-item-description",
        });
    }

    private renderReport(): void {
        const t = this.t.sync.cleanup.report;
        const summary = this.summary;
        this.titleEl.setText(t.title);

        if (!summary || summary.directories.length === 0) {
            this.contentEl.createEl("p", { text: t.empty, cls: "setting-item-description" });
            this.addButtons([{ text: t.cancel, onClick: () => this.close() }]);
            return;
        }

        this.contentEl.createEl("p", {
            text: t.summary(
                formatBytes(summary.totalBytes),
                summary.objectCount,
                this.commitCount
            ),
        });
        // 这个数字比 .git 的实际占用大得多，不说清的话用户会以为插件算错了。
        this.contentEl.createEl("p", { text: t.note, cls: "setting-item-description" });

        this.contentEl.createEl("p", { text: t.dirsHeading, cls: "obsync-warning-heading" });
        // 这一句回答的是「我勾多勾少，耗时会不会变」—— 不会（重写是逐提交的），
        // 但不说的话，用户在确认页看到那个**恒定**的耗时数字会以为它是写死的。
        this.contentEl.createEl("p", { text: t.selectNote, cls: "setting-item-description" });

        // 库根目录的文件只报账、不提供勾选 —— 剔掉它们等于清空整个库（见 rootNote）。
        const root = summary.directories.find((entry) => entry.path === ROOT_DIRECTORY);
        if (root) {
            this.contentEl.createEl("p", {
                text: `${t.rootLabel} ${t.dirMeta(formatBytes(root.bytes), root.objects)}`,
                cls: "setting-item-description",
            });
        }

        for (const directory of summary.directories) {
            if (directory.path === ROOT_DIRECTORY) continue;
            new Setting(this.contentEl)
                .setName(directory.path)
                .setDesc(t.dirMeta(formatBytes(directory.bytes), directory.objects))
                .addToggle((toggle) =>
                    toggle.setValue(this.selected.has(directory.path)).onChange((value) => {
                        if (value) this.selected.add(directory.path);
                        else this.selected.delete(directory.path);
                        this.syncPrimaryButton();
                    })
                );
        }

        this.contentEl.createEl("p", { text: t.rootNote, cls: "setting-item-description" });

        this.contentEl.createEl("p", { text: t.largestHeading, cls: "obsync-warning-heading" });
        const list = this.contentEl.createEl("ul", { cls: "obsync-diag-list" });
        for (const blob of summary.largest) {
            const item = list.createEl("li");
            item.createSpan({ cls: "obsync-large-file-size", text: formatBytes(blob.bytes) });
            item.createSpan({ cls: "obsync-large-file-path", text: blob.path });
        }

        this.primaryButton = this.addButtons([
            { text: t.cancel, onClick: () => this.close() },
            {
                text: t.toConfirm,
                cta: true,
                onClick: () => {
                    this.stage = "confirm";
                    this.render();
                },
            },
        ]).at(-1);
        this.syncPrimaryButton();
    }

    /** 一个都没勾时把「开始重写」置灰 —— 而不是让用户点了才知道白点。 */
    private syncPrimaryButton(): void {
        this.primaryButton?.setDisabled(this.selected.size === 0);
    }

    private renderConfirm(): void {
        const t = this.t.sync.cleanup.confirm;
        this.titleEl.setText(t.title);

        this.contentEl.createEl("p", { text: t.pathsHeading, cls: "obsync-warning-heading" });
        const list = this.contentEl.createEl("ul", { cls: "obsync-diag-list" });
        for (const path of this.selected) list.createEl("li", { text: path });

        // 预计耗时按**提交数**算（实测 3.5 秒/提交，见 `cleanup.ts`）——
        // 这是用户唯一能判断「现在动手还是晚上动手」的依据。
        this.contentEl.createEl("p", {
            text: t.estimate(this.commitCount, estimateRewriteMinutes(this.commitCount)),
        });

        const warning = this.contentEl.createDiv();
        warning.createEl("p", { text: t.warningHeading, cls: "obsync-warning-heading" });
        warning.createEl("p", { text: t.warningHashes });
        warning.createEl("p", { text: t.warningRemote });
        warning.createEl("p", { text: t.warningBackup });
        // 「本地文件会留着」—— 这句是**承诺**，不是安慰：`rewriteHistory` 里那一步
        // `restoreRemovedPaths` 就是为它存在的（filter-branch 的收尾会删掉它们）。
        warning.createEl("p", { text: t.warningLocalFiles });

        this.addButtons([
            {
                text: t.back,
                onClick: () => {
                    this.stage = "report";
                    this.render();
                },
            },
            { text: t.go, cta: true, onClick: () => void this.runRewrite() },
        ]);
    }

    /**
     * 重写进行中的那一页。
     *
     * ## 为什么必须有「已用时长」和一颗「在后台继续」
     *
     * 用户报的原话是「重写进行时只有一个弹框提示，退出弹框后，没有任何正在进行的
     * 提示，无法判断进度和状态」。那一页原来只有两句话，既答不了「跑到哪了」，
     * 也没告诉他关掉之后去哪看 —— 于是用户关掉窗口，屏幕上就真的什么都没有了。
     *
     * 现在这一页给三样东西：
     *
     * 1. **已用时长 / 预计时长**（每秒刷新，只改一个文本节点，不重绘整个弹窗）——
     *    这是界面上唯一能诚实说出来的进度信息，见 `formatElapsed`；
     * 2. **一条不确定进度条**（复用面板横幅那条样式）—— 它只表达「在动」；
     * 3. **「在后台继续」** + 一句明确的话，告诉他关掉之后进度会显示在
     *    **状态栏与仓库同步面板**上（那是这次修复的另一半，见
     *    `SyncService.rewriteHistory` 的 `withActivity("rewriting")`）。
     */
    private renderRunning(): void {
        const t = this.t.sync.cleanup.running;
        this.titleEl.setText(t.title);
        this.contentEl.createEl("p", { text: t.text, cls: "setting-item-description" });

        this.elapsedEl = this.contentEl.createEl("p", { cls: "obsync-modal-status" });
        this.elapsedEl.setText(this.elapsedText());

        this.contentEl.createDiv({ cls: "obsync-sync-progress" });

        this.contentEl.createEl("p", {
            text: t.backgroundHint,
            cls: "setting-item-description",
        });

        this.addButtons([{ text: t.background, onClick: () => this.close() }]);
    }

    /** 「已用 X，预计总共约 N 分钟」那一句（`renderRunning` 与定时器共用）。 */
    private elapsedText(): string {
        return this.t.sync.cleanup.running.progress(
            formatElapsed(this.elapsedSeconds()),
            estimateRewriteMinutes(this.commitCount)
        );
    }

    private elapsedSeconds(): number {
        return this.startedAt === 0 ? 0 : (Date.now() - this.startedAt) / 1000;
    }

    /** 每秒刷新「已用时长」；只改那个文本节点，绝不重绘（重绘会丢滚动位置）。 */
    private startTimer(): void {
        this.stopTimer();
        this.timer = window.setInterval(() => {
            const el = this.elapsedEl;
            if (!el) return;
            el.setText(this.elapsedText());
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timer === undefined) return;
        window.clearInterval(this.timer);
        this.timer = undefined;
    }

    private renderResult(): void {
        const t = this.t.sync.cleanup.result;
        const outcome = this.outcome;
        if (!outcome) return;
        this.titleEl.setText(t.title);

        this.contentEl.createEl("p", {
            text: t.summary(outcome.result.commitsBefore, outcome.result.commitsAfter),
        });
        this.contentEl.createEl("p", { text: t.backup(outcome.result.backupRef) });
        // 这一句不能省：不说的话用户会拿「体积没变小」当成「清理没生效」。
        this.contentEl.createEl("p", { text: t.noShrink });
        if (outcome.ignoredRules > 0) {
            this.contentEl.createEl("p", { text: t.ignored(outcome.ignoredRules) });
        }
        this.contentEl.createEl("p", { text: t.pushHint, cls: "obsync-warning-heading" });
        // 「还剩一步」必须说出来：原来这一页的次要按钮写着「完成」，会让用户以为
        // 整件事结束了 —— 而空间要到「丢弃备份」那一步才真正释放（见 `renderSettle`）。
        this.contentEl.createEl("p", { text: t.nextSteps, cls: "setting-item-description" });

        this.addButtons([
            // 强制推送是这一页的**主操作**：它是下一步，而且推完会直接切到收尾页。
            { text: t.push, cta: true, onClick: () => void this.runForcePush() },
            // 「稍后再说」而不是「完成」—— 见上。收尾页在设置页那条
            // 「继续上次的清理」里随时能回来。
            { text: this.t.sync.cleanup.settle.later, onClick: () => this.close() },
        ]);
    }

    /**
     * 「收尾」这一页 —— 重写已经做完，只剩两件事。
     *
     * ## 为什么必须有它（用户要「小白也能操作的方案」）
     *
     * 一次深度清理真正的完整流程是四步：**体检 → 重写 → 强制推送 → 丢弃备份**。
     * 而后两步原来散在两个地方（弹窗结果页 + 设置页的另一行），中间还要用户
     * 自己去判断「库是不是没问题了」—— 于是最常见的结局是：他做完重写就走了，
     * 备份一直拉着旧对象，**空间根本没释放**，而他会得出「这个清理没用」的结论。
     *
     * 现在这一页把「还剩什么」直接列出来，而且**两条入口都能到**：
     * 重写完成后点「强制推送」会走到这里；设置页那条「继续上次的清理」也直接开到这里。
     *
     * ## 检查清单为什么写得这么具体
     *
     * 「确认库一切正常」这种话对用户等于没说 —— 他不知道该看什么、看到什么算正常。
     * 所以列成三件**可执行**的事（打开几篇笔记、看图能不能显示、别的设备重新 clone）。
     * 这一步不能由插件代劳：它要判断的是「笔记内容有没有被清坏」，
     * 而那是只有人看得出来的事。
     */
    private renderSettle(): void {
        const t = this.t.sync.cleanup.settle;
        this.titleEl.setText(t.title);
        this.contentEl.createEl("p", { text: t.intro, cls: "setting-item-description" });

        // ① 强制推送
        this.contentEl.createEl("p", { text: t.pushHeading, cls: "obsync-warning-heading" });
        this.contentEl.createEl("p", { text: t.pushDesc, cls: "setting-item-description" });
        if (this.pushed) {
            this.contentEl.createEl("p", { text: t.pushDone, cls: "obsync-modal-status" });
        }

        // ② 检查清单 + 丢弃备份
        this.contentEl.createEl("p", { text: t.verifyHeading, cls: "obsync-warning-heading" });
        const list = this.contentEl.createEl("ul", { cls: "obsync-steps" });
        for (const item of t.verifyItems) list.createEl("li", { text: item });
        this.contentEl.createEl("p", { text: t.discardDesc, cls: "obsync-warning-heading" });

        const buttons: Array<{ text: string; cta?: boolean; onClick: () => void }> = [];
        // 推过之后就不再给这颗按钮 —— 再推一次没有意义，留着只会让人以为「还没成功」。
        if (!this.pushed) {
            buttons.push({ text: t.push, onClick: () => void this.runForcePush() });
        }
        buttons.push({ text: t.discard, cta: true, onClick: () => void this.runDiscardBackups() });
        // 「稍后再说」：收尾不必现在做完，但**下次进来还能找到它**
        // （设置页那条「继续上次的清理」）。没有这颗按钮，用户会被困在这一页。
        buttons.push({ text: t.later, onClick: () => this.close() });
        this.addButtons(buttons);
    }

    private renderSettled(): void {
        const t = this.t.sync.cleanup.settled;
        this.titleEl.setText(t.title);
        const freed = this.freedBytes;
        this.contentEl.createEl("p", {
            text: freed === undefined ? t.doneUnknown : t.done(formatBytes(freed)),
        });
        this.contentEl.createEl("p", { text: t.after, cls: "setting-item-description" });
        this.addButtons([{ text: t.close, cta: true, onClick: () => this.close() }]);
    }

    private async runRewrite(): Promise<void> {
        const normalized = normalizeRemovalPaths([...this.selected]);
        if (normalized.paths.length === 0) {
            // 按钮在没勾选时是置灰的，所以这里只在「勾了但全被归一化拒掉」时到达。
            this.close();
            this.deps.notifier.reportError(
                new HistoryRewriteBlockedError("cleanup: no usable paths selected", "no-paths")
            );
            return;
        }

        this.stage = "running";
        // 记开始时刻必须在 `render()` **之前** —— `renderRunning` 会立刻按它算一次
        // 「已用时长」，否则第一秒里显示的是 `startedAt` 为 0 时的那个巨大数字。
        this.startedAt = Date.now();
        this.render();
        this.startTimer();
        try {
            this.outcome = await this.deps.service.rewriteHistory(normalized.paths);
            this.stopTimer();
            this.stage = "result";
            if (this.closed) {
                // 用户在重写期间把窗口关掉了。结果页上有一个**必须做的动作**
                // （强制推送 —— 重写之后本地与远端必然分叉，不推就同步不上去），
                // 丢掉它等于让用户没法收尾。所以把它弹回来。
                //
                // 这是刻意的取舍：关窗口的意思是「我不想一直盯着看」，
                // 不是「结果不用告诉我」—— 与「关掉弹窗 = 什么都不做」那条
                // 完全相反，因为那时还没动手，而现在**已经动过了**。
                this.closed = false;
                this.open();
                return;
            }
            this.render();
        } catch (err) {
            this.stopTimer();
            // 已经关掉时不再 close 一次（真实 Modal 的 close 会 pop 一次键位作用域，
            // 重复调用没有意义）。
            if (!this.closed) this.close();
            this.deps.notifier.reportError(err);
        }
    }

    /**
     * 强制推送。成功之后**接着往下走一步**（切到收尾页）——
     * 让整条流程在一个窗口里走完，用户不必记住「还要回设置页丢弃备份」，
     * 而那一步才是空间真正释放的地方。
     */
    private async runForcePush(): Promise<void> {
        try {
            await this.deps.service.forcePush();
            this.pushed = true;
            this.deps.notifier.success(this.t.sync.cleanup.pushDone);
            if (this.stage === "result") this.stage = "settle";
            this.render();
        } catch (err) {
            this.deps.notifier.reportError(err);
        }
    }

    /**
     * 丢弃备份并回收 —— 整个清理流程的最后一步，也是空间真正释放的那一步。
     *
     * **不可逆**：调用之后没有任何办法回到重写前的历史。所以它只出现在收尾页，
     * 而且上面就是那张「先确认这几件事」的清单。
     */
    private async runDiscardBackups(): Promise<void> {
        try {
            this.freedBytes = await this.deps.service.discardBackups();
            this.stage = "settled";
            this.render();
        } catch (err) {
            this.deps.notifier.reportError(err);
        }
    }

    /**
     * 画底部按钮行，并返回按钮组件（调用方可能要置灰其中某一颗）。
     *
     * 用 `Setting` 包一层而不是裸 `createEl("button")`：这样按钮的样式与
     * 设置页里那些一致，不用自己维护一套 `.obsync-*` 按钮类。
     */
    private addButtons(
        buttons: Array<{ text: string; cta?: boolean; onClick: () => void }>
    ): ButtonComponent[] {
        const created: ButtonComponent[] = [];
        const row = new Setting(this.contentEl);
        for (const spec of buttons) {
            row.addButton((button) => {
                button.setButtonText(spec.text).onClick(spec.onClick);
                if (spec.cta) button.setCta();
                created.push(button);
            });
        }
        return created;
    }
}
