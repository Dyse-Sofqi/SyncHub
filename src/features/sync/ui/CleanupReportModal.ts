import { Modal, Setting, type App, type ButtonComponent } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import type { Notifier } from "../../../core/notice";
import type { SyncService } from "../syncService";
import { formatBytes } from "../repoSize";
import { ROOT_DIRECTORY, type HistorySummary } from "../historyObjects";
import { estimateRewriteMinutes, normalizeRemovalPaths } from "../cleanup";
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
 * | 结果 | 「现在该怎么办」 | 备份在哪、为什么空间还没变小、接下来要强制推送 |
 *
 * ## 关掉弹窗 = 什么都不做
 *
 * 与 `ConfirmUntrackImagesModal` 一致：这一步什么都不做才是安全的那一侧。
 * 重写历史没有「点了才后悔」的余地 —— 它不可逆。
 */

export interface CleanupModalDeps {
    service: SyncService;
    notifier: Notifier;
}

/** 弹窗当前处在哪个阶段。 */
type CleanupStage = "loading" | "report" | "confirm" | "running" | "result";

export class CleanupReportModal extends Modal {
    private stage: CleanupStage = "loading";
    private summary: HistorySummary | undefined;
    private commitCount = 0;
    /** 用户勾选的顶层目录。 */
    private readonly selected = new Set<string>();
    private outcome: { result: RewriteResult; ignoredRules: number } | undefined;
    /** 「开始重写」那颗按钮 —— 一个都没勾时置灰。 */
    private primaryButton: ButtonComponent | undefined;

    constructor(
        app: App,
        private readonly t: LocaleStrings,
        private readonly deps: CleanupModalDeps
    ) {
        super(app);
    }

    onOpen(): void {
        this.render();
        void this.load();
    }

    onClose(): void {
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
        this.contentEl.empty();
        this.primaryButton = undefined;

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

    private renderRunning(): void {
        const t = this.t.sync.cleanup.running;
        this.titleEl.setText(t.title);
        this.contentEl.createEl("p", { text: t.text, cls: "setting-item-description" });
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

        this.addButtons([
            { text: t.push, onClick: () => void this.runForcePush() },
            { text: t.done, cta: true, onClick: () => this.close() },
        ]);
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
        this.render();
        try {
            this.outcome = await this.deps.service.rewriteHistory(normalized.paths);
            this.stage = "result";
            this.render();
        } catch (err) {
            this.close();
            this.deps.notifier.reportError(err);
        }
    }

    private async runForcePush(): Promise<void> {
        try {
            await this.deps.service.forcePush();
            this.deps.notifier.success(this.t.sync.cleanup.pushDone);
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
