import { normalizePath, TFile, type App, type Vault } from "obsidian";
import { logger } from "../../core/logger";
import type { LocaleStrings } from "../../core/i18n";
import type { Notifier } from "../../core/notice";
import { renderCommitMessage } from "./commitMessage";
import { changeRows } from "./changeRows";
import {
    buildAddedFileDiff,
    MAX_UNTRACKED_DIFF_BYTES,
    parseUnifiedDiff,
    type FileDiff,
} from "./diff";
import { formatBytes, sumFileBytes } from "./repoSize";
import { isFullyInSync } from "./syncState";
import { ignoreRuleFor, mergeRuleLines } from "./imagesIgnore";
import {
    localStateRules,
    matchesLocalState,
    mergeRecommendedRules,
    recommendedRules,
    type RecommendedRule,
} from "./recommendedIgnores";
import {
    findLargeFiles,
    pendingFilesForCommit,
    thresholdBytesFromMb,
    type LargePendingFile,
} from "./largeFiles";
import type { GitManager } from "./gitManager";
import { ConflictError, describeSyncError } from "./errors";
import type { SecretStore } from "../../core/secretStore";
import { parseGitRemoteUrl } from "../../host/repoRef";
import { redactUrl } from "../../host/redact";
import type {
    DiagnosticCheck,
    DiagnosticsReport,
    RepoStatus,
    RewriteResult,
    SyncOutcome,
    SyncStrategy,
} from "./types";
import type { HistorySummary } from "./historyObjects";
import { corePluginEnabled } from "./corePluginState";
import { IDLE_ACTIVITY, StatusBar, type StatusBarActivity, type SyncActivity } from "./statusBar";

/**
 * 同步编排：把 GitManager 的原子操作组合成用户语义的动作。
 *
 * ## 并发模型
 *
 * 所有会动仓库的操作都串行执行（一条 promise 链）。理由：
 * 自动提交定时器、手动命令、文件事件可能在同一时刻触发，
 * 而 git 的 index 是共享状态 —— 并发 stage/commit 会互相踩。
 * 参考项目 obsidian-git 的 PromiseQueue 解决的是同一个问题。
 *
 * ## 冲突的处理哲学
 *
 * 检测到冲突时**不自动解决**（自动 rebase --theirs/--ours 都是替用户丢数据），
 * 而是：留下冲突现场 + 在库里写一份「冲突指南」文件 + 明确告知用户。
 * 用户要么手动编辑后提交，要么用「放弃本次合并」回到 pull 之前。
 */

export interface SyncHost {
    app: App;
    notifier: Notifier;
    /** 诊断要判断「该平台的令牌配了没有」。 */
    secretStore: SecretStore;
    getT(): LocaleStrings;
    /** 提交信息模板（settings.sync.commitMessage）。 */
    getCommitTemplate(): string;
    /** 同步策略（settings.sync.syncStrategy）。 */
    getStrategy(): SyncStrategy;
    /** 冲突指南文件名（已本地化），空串表示不写指南。 */
    getConflictGuideName(): string;
    /** 大文件阈值（MB）；0 = 关闭提交前的大文件检查。 */
    getLargeFileThresholdMb(): number;
    /** 是否把插件目录也加进推荐忽略规则（设置项，默认关）。 */
    getIgnorePluginFolder(): boolean;
}

/**
 * 一个文件的差异，两侧分开。
 *
 * 为什么不合成一份：同一个文件完全可能**既有已暂存又有未暂存的改动**
 * （`git status` 里的 `MM`），而这两份内容回答的是不同的问题 ——
 * 「我接下来要提交什么」与「我还没放进这次提交的是什么」。
 * 合成一份就必须挑一边，那等于把另一半藏起来。
 */
export interface FileDiffSet {
    path: string;
    /** 工作区 ↔ 索引：还没暂存的内容。 */
    unstaged: FileDiff;
    /** 索引 ↔ HEAD：即将被提交的内容。 */
    staged: FileDiff;
}

/**
 * 状态读出来之后多久算「还新鲜」，可以直接复用（毫秒）。
 *
 * ## 为什么要有它
 *
 * `git status` 是这一层最贵的一步，而**同一个瞬间有好几处都想要状态**是常态：
 * 启动时 `applyDerivedSettings()`→`reload()`、`onLayoutReady`→`start()`、
 * 面板首次渲染各要一次；一次动作里 `withActivity` 收尾要一次、视图重绘又要一次。
 * 实测（2026-10-01，Plugin-Test 库）：一次 `git status` 约 300 ms，
 * 而一次面板重绘合计 754 ms / 10 个 git 子进程 —— 重复的那几次纯属白烧。
 *
 * ## 400 ms 是怎么定的
 *
 * 吃掉「同一轮事件里的重复读」绰绰有余（这些都发生在几十毫秒内），
 * 而短到用户不可能察觉到「我明明刚改完，面板怎么没变」—— 何况任何**动过仓库**
 * 的动作都会立刻让缓存失效（见 `enqueue`），所以「暂存完还显示未暂存」这种
 * 新鲜度问题不存在。
 */
const STATUS_TTL_MS = 400;

export class SyncService {
    /** 串行队列：队尾 promise。 */
    private tail: Promise<unknown> = Promise.resolve();
    /** 排队中 + 执行中的任务数。 */
    private pending = 0;
    /** 状态变化订阅者（仓库同步视图）。见 `onStatusChange`。 */
    private readonly statusListeners = new Set<(status: RepoStatus | undefined) => void>();

    /**
     * 动作变化订阅者（仓库同步视图的「正在同步」横幅）。见 `onActivityChange`。
     *
     * 与 `statusListeners` **刻意分开**：两者推的时机与频率都不一样 ——
     * 状态在动作**结束后**才刷新一次，而动作横幅必须**立刻**出现，
     * 否则用户点了「立即同步」要等第一个 git 命令跑完才看到任何反应。
     */
    private readonly activityListeners = new Set<(activity: SyncActivity) => void>();

    /** 当前正在跑的动作。`idle` 表示没有。 */
    private activity: SyncActivity = IDLE_ACTIVITY;

    /**
     * 最近一次读出来的状态与读它的时刻（`undefined` 也是有效结果：不是仓库）。
     *
     * `statusCache === undefined` 表示「还没读过」，与「读出来是 undefined」是
     * 两件不同的事 —— 混在一起会让「不是仓库」这个结论被当成「没缓存」而反复重读。
     */
    private statusCache: { status: RepoStatus | undefined; at: number } | undefined;

    /**
     * 正在进行的这一次状态读取。
     *
     * 单飞（single-flight）：同一时刻的第二次调用直接复用这个 promise。
     * 这是与缓存**不同**的一层 —— 缓存管「刚读过就别再读」，它管「正在读就别再开一个」。
     * 启动时那三次刷新间隔很近，只靠 TTL 的话它们会同时冲进 `git.status()`
     * （三个 git 进程做同一件事），有了它就只有第一个真的跑。
     */
    private inFlightStatus: Promise<RepoStatus | undefined> | undefined;

    constructor(
        readonly git: GitManager,
        readonly deps: SyncHost,
        private readonly statusBar: StatusBar
    ) {}

    /**
     * 是否有动作在进行中（含**已排队但还没轮到**的）。
     *
     * 用计数器而不是布尔量：`enqueue` 里若写成「任务 settle 时置 false」，
     * 那么队列里还有第二个任务时它就已经变 false 了 —— 于是 `isBusy` 在
     * 真正有活干的时候报"空闲"。automatics 靠它决定"跳过本轮"，
     * 状态栏与视图也靠它显示忙碌状态，语义错了会连锁出错。
     */
    get isBusy(): boolean {
        return this.pending > 0;
    }

    /** 串行执行一个动作；错误原样上抛给调用方决定怎么提示。 */
    private enqueue<T>(run: () => Promise<T>): Promise<T> {
        // **任何排队过的动作都会动仓库**（暂存、提交、切换分支、甚至只读的
        // `fileDiff` 都会读 index），所以缓存在这里一律作废：这是唯一的口子，
        // 补在新加的写操作上不如补在这一处可靠。
        this.forgetStatus();

        this.pending += 1;
        // 前一个任务无论成功失败都要接着跑下一个，所以 onRejected 也传 run。
        const task = this.tail.then(run, run);
        this.tail = task.catch(() => {});
        return task.finally(() => {
            this.pending -= 1;
        });
    }

    /** 丢掉状态缓存（下次 `refresh()` 一定真去读一次）。 */
    private forgetStatus(): void {
        this.statusCache = undefined;
    }

    /** 动作结束后统一刷新状态栏，并把新状态交给需要它的调用方。 */
    private async refreshStatus(): Promise<RepoStatus | undefined> {
        return this.refresh();
    }

    // ── 状态订阅（仓库同步视图） ──────────────────────────────────────────

    /**
     * 状态变化订阅者。
     *
     * 视图是**常驻**的（打开后一直挂在侧边栏），而状态会在它背后变 ——
     * 自动提交定时器到点、库外的编辑器改了文件、键盘上的命令面板触发了一次拉取。
     * 只在 `onOpen` 时渲染一次的话，面板上的内容就停在打开它的那一刻，
     * 用户看着「3 个文件有改动」而实际上已经提交完了。
     *
     * 参考项目 obsidian-git 靠一个固定间隔的定时器轮询状态；这里有真实的
     * 变化点（每次动作结束、每次 `refresh`），所以改成推送式：谁刷新了状态，
     * 谁负责通知订阅者。
     */
    onStatusChange(listener: (status: RepoStatus | undefined) => void): () => void {
        this.statusListeners.add(listener);
        return () => {
            this.statusListeners.delete(listener);
        };
    }

    private publish(status: RepoStatus | undefined): void {
        for (const listener of this.statusListeners) {
            try {
                listener(status);
            } catch (err) {
                // 订阅者（界面）出错绝不能影响同步本身。
                logger.debug("status listener failed", err);
            }
        }
    }

    // ── 动作订阅（仓库同步视图的「正在同步」横幅） ────────────────────────

    /**
     * 当前动作（`idle` 表示没有动作在跑）。
     *
     * 面板**打开的那一刻**就得知道：一次同步完全可能在面板关闭时开始
     * （命令面板 / 定时器），打开时不能只等下一次变化 —— 那时已经是 idle 了，
     * 「正在同步」横幅就永远出不来。
     */
    get currentActivity(): SyncActivity {
        return this.activity;
    }

    /**
     * 订阅动作变化（开始 / 换阶段 / 结束）。
     *
     * 面板用它画那条「正在同步」的横幅。与 `onStatusChange` 同构：
     * 谁改了动作谁通知，订阅者出错绝不影响同步本身。
     */
    onActivityChange(listener: (activity: SyncActivity) => void): () => void {
        this.activityListeners.add(listener);
        return () => {
            this.activityListeners.delete(listener);
        };
    }

    /**
     * 标记「正在干什么」——**状态栏与面板的唯一出口**。
     *
     * 收在一处是必须的：`sync()` 那条链路要中途换三次阶段
     * （提交 → 拉取 → 推送），散着写 `statusBar.setActivity()` 的话，
     * 新加的订阅者迟早会漏掉某一处，症状就是「面板上还写着正在拉取，
     * 其实已经在推送」。任何新增阶段都必须走这里。
     */
    private setActivity(kind: StatusBarActivity, chain = false): void {
        this.activity = { kind, chain };
        this.statusBar.setActivity(kind, { chain });
        for (const listener of this.activityListeners) {
            try {
                listener(this.activity);
            } catch (err) {
                logger.debug("activity listener failed", err);
            }
        }
    }

    // ── 用户动作 ──────────────────────────────────────────────────────────

    /**
     * 跑一个动作：期间状态栏显示「正在…」，结束后**无论成败都恢复**成仓库状态。
     *
     * ## 为什么这件事必须收在一处（真 bug 的修复）
     *
     * `activity` 是 `StatusBar` 的实例状态，而它的 `render()` 在
     * `activity !== "idle"` 时**只显示活动文案并直接返回** —— 也就是说
     * 一旦没人把它改回 `idle`，状态栏就永远停在「正在推送…」，
     * 而且**连分支 / ahead / behind / 脏文件数都一起不显示了**，
     * 一直到重载插件为止。在此之前 `setActivity("idle")` 在整个 `src` 里
     * **一次都没出现过**（只有测试里手工调用过，所以没被发现）。
     *
     * 用户报的就是这个症状：「尝试推送后一直看到正在推送」——
     * 推送早就结束（成功或失败）了，界面却还在说它正在进行。
     *
     * 收在 `finally` 里，是因为**出错时更需要恢复**：失败会让用户盯着
     * 「正在推送…」等一个永远不会来的结果。
     *
     * `after` 是**成功之后**的收尾反馈（拿到刚刷新出来的状态）—— 失败时不调，
     * 因为「与远端一致」这种话在出错后说出来只会让人困惑。
     *
     * `chain` 一路透给 `setActivity`：链路里的文案与单独动作不同（见 `activityText`）。
     */
    private async withActivity<T>(
        activity: StatusBarActivity,
        run: () => Promise<T>,
        after?: (result: T, status: RepoStatus | undefined) => Promise<void>,
        chain = false
    ): Promise<T> {
        this.setActivity(activity, chain);
        try {
            const result = await run();
            this.setActivity("idle");
            const status = await this.refreshStatus();
            if (after) await after(result, status);
            return result;
        } catch (err) {
            this.setActivity("idle");
            await this.refreshStatus();
            throw err;
        }
    }

    /**
     * 提交全部更改（暂存所有 + 提交）。没有更改时是静默的空操作。
     *
     * `allowLargeFiles` 由「用户已经看过大文件清单并选了仍然提交」的路径传 true ——
     * 那是**一次性的放行**，只对这一次提交有效（下一次仍会重新问）。
     */
    async commitAll(
        options: { announce?: boolean; allowLargeFiles?: boolean } = {}
    ): Promise<SyncOutcome> {
        return this.enqueue(() =>
            this.withActivity(
                "committing",
                () => this.doCommitAll({ allowLargeFiles: options.allowLargeFiles }),
                options.announce ? (_result, status) => this.announceAfterCommit(status) : undefined
            )
        );
    }

    /** 拉取。冲突时写指南文件并把 `ConflictError` 转成用户提示（不抛出）。 */
    async pull(): Promise<SyncOutcome> {
        return this.enqueue(() => this.withActivity("pulling", () => this.doPull()));
    }

    /**
     * 推送。
     *
     * **只推送已提交的内容** —— 它不会顺手提交（那是「立即同步」和「提交」的事）。
     * 这个区别必须让用户看得见：按钮上只有「推送」两个字，而用户带着一堆未提交的
     * 改动点它，预期多半是「我的改动该上去了」。
     *
     * `announceIfUpToDate` 只由**用户主动**的入口传 true（命令面板、视图里的按钮）。
     * 自动推送定时器不传：本地没有新提交是常态，每 N 分钟弹一次纯属噪音。
     */
    async push(options: { announceIfUpToDate?: boolean } = {}): Promise<SyncOutcome> {
        return this.enqueue(() =>
            this.withActivity(
                "pushing",
                () => this.doPush(),
                options.announceIfUpToDate
                    ? (outcome, status) => this.announceAfterPush(outcome, status)
                    : undefined
            )
        );
    }

    /**
     * 完整同步：提交 → 拉取 → 推送。
     *
     * 这是自动同步和「立即同步」命令共用的链路。拉取产生冲突时**必须停**：
     * 继续提交会把冲突标记写进历史，继续推送会把它们推上远端。
     *
     * 曾经还有一个 `commitAndPush()`（= 这一条去掉拉取），被用户判定为多余：
     * 「立即同步已经是万全之策」，而不想拉取的人用「提交」+「推送」两步即可。
     * 别再把它加回来 —— 除非有人真需要那个单步动作。
     */
    async sync(
        options: { announceInSync?: boolean; allowLargeFiles?: boolean } = {}
    ): Promise<SyncOutcome> {
        return this.enqueue(() =>
            this.withActivity(
                "committing",
                async () => {
                    const committed = await this.doCommitAll({
                        allowLargeFiles: options.allowLargeFiles,
                    });
                    // 被大文件拦下时**链路必须停住**：继续拉取/推送没有意义，
                    // 而且用户会看到「同步完成」而那个文件其实没提交 —— 比直接
                    // 告诉他更糟。与 `conflict` 同一个处置。
                    if (committed.kind === "large-files-pending") return committed;

                    // 每个阶段都更新活动状态 —— 只在开头设一次的话，
                    // 整条链路（含拉取、推送）都会显示「正在提交」，与实际不符。
                    // `chain = true`：这是链路里的一步，文案要说成「正在同步：…」
                    // （面板那条横幅也靠它把三个阶段画出来）。
                    this.setActivity("pulling", true);
                    const pulled = await this.doPull();
                    if (pulled.kind === "conflict") return pulled;
                    if (pulled.kind === "pulled") {
                        // 拉下来的文件可能又和本地未提交内容合并出新东西 ——
                        // 二次提交后再推送，保证推上去的是完整状态。
                        this.setActivity("committing", true);
                        // 第二次提交：内容就是刚提交的那批（拉取合并出来的），
                        // 第一次已经问过了 —— 不再重复问，否则用户确认完还会被弹第二次。
                        await this.doCommitAll({ allowLargeFiles: true });
                    }

                    this.setActivity("pushing", true);
                    return await this.doPush();
                },
                options.announceInSync
                    ? async (_outcome, status) => {
                          await this.announceInSync(status);
                      }
                    : undefined,
                // 整条链路都算「立即同步」：横幅上的三个阶段才有意义。
                true
            )
        );
    }

    // ── 结束反馈（只给用户主动发起的动作） ────────────────────────────────

    /**
     * 与远端完全一致时给一条**醒目**的成功提示，并返回是否说了话。
     *
     * 用户的原话：「当提交结束与远端一致时，给出醒目的反馈」。所以这条提示
     * 走 `Notifier.synced`（带绿色对勾、停留更久），而不是一闪而过的普通提示。
     *
     * 判据在 `isFullyInSync` 里（只有一处定义，状态栏与面板共用同一个）。
     */
    private async announceInSync(status: RepoStatus | undefined): Promise<boolean> {
        if (!isFullyInSync(status)) return false;
        this.deps.notifier.synced(
            this.deps.getT().sync.syncedInSync(await this.repoSizeText())
        );
        return true;
    }

    /** 仓库体积文案；读不到时返回 undefined（提示里就不提体积，不编数字）。 */
    private async repoSizeText(): Promise<string | undefined> {
        try {
            return formatBytes((await this.git.repoSize()).bytes);
        } catch (err) {
            logger.debug("repository size unavailable", err);
            return undefined;
        }
    }

    /**
     * 「提交」结束后的反馈。
     *
     * 三种情况各说各的：
     * - **与远端完全一致** → 醒目提示（一切正常）；
     * - **有提交但没推上去** → 明确说出来，否则用户以为提交完就上去了
     *   （他此前的困惑就是这一类：「推送按钮是单纯的推送还是提交加推送」）；
     * - 没有远端 / 没有 upstream → 什么都不说（`ahead` 为 null），
     *   前面的警告或状态栏已经说明了。
     */
    private async announceAfterCommit(status: RepoStatus | undefined): Promise<void> {
        if (await this.announceInSync(status)) return;
        const ahead = status?.ahead;
        if (ahead !== null && ahead !== undefined && ahead > 0) {
            this.deps.notifier.info(this.deps.getT().sync.commitsNotPushed(ahead));
        }
    }

    /**
     * 「推送」结束后的反馈。
     *
     * 顺序有讲究：**先判「完全一致」**——那是最好的一句话，也是用户要的那条
     * （推送成功且工作区干净时，说「已同步」比说「已推送到远端」信息更全：
     * 它同时确认了没有遗留的改动）。
     */
    private async announceAfterPush(
        outcome: SyncOutcome,
        status: RepoStatus | undefined
    ): Promise<void> {
        const t = this.deps.getT();

        // `ahead` 为 null = 没有跟踪的远端分支（可能是「没配远端」）——
        // 那时无从谈「一致」，而 doPush 已经就「没有远端」给过警告了。
        if (!status || status.ahead === null) return;

        if (await this.announceInSync(status)) return;

        const pending = changeRows(status).length;
        if (outcome.kind === "pushed") {
            // 推成功了，但本地还有没提交的东西 —— 不说的话用户会以为
            // 「推送」把工作区一起带上去了。
            this.deps.notifier.info(
                pending > 0 ? t.sync.pushDonePending(pending) : t.sync.pushDone
            );
            return;
        }

        // 没有需要推送的内容：本地没有新提交。若工作区还有改动，说清「推送只发送
        // 已提交的内容」并给出数量（不然听起来像「一切正常」，而真实情况是
        // 「你的改动一个都没上去」）。
        this.deps.notifier.info(
            pending > 0 ? t.sync.pushNeedsCommit(pending) : t.sync.pushUpToDate
        );
    }

    /**
     * 本次待提交改动的体积（字节）。
     *
     * git 不直接给这个数，只能把有改动的文件大小加起来 —— 所以是**近似值**
     * （实际传输量还看压缩率；删除的文件本来没有体积）。取不到大小的文件按 0 计。
     *
     * 公开是因为仓库同步视图也要显示它，而它需要 `app.vault.adapter`（在 service 手上）。
     */
    async pendingChangeBytes(status: RepoStatus): Promise<number> {
        const paths = changeRows(status).map((row) => row.path);
        return sumFileBytes(paths, async (path) => {
            try {
                const stats = await this.deps.app.vault.adapter.stat(path);
                return stats?.size;
            } catch (err) {
                // 文件可能刚被删掉（状态是几秒前的）—— 这只是个参考数字，
                // 不该因为它失败而让面板画不出来。
                logger.debug("could not stat changed file", err);
                return undefined;
            }
        });
    }

    /** 放弃冲突现场（回到 pull 之前）。 */
    async abortMerge(): Promise<void> {
        await this.enqueue(async () => {
            await this.git.abortMerge();
            // 必须给反馈：这是个"撤销"类动作，做完之后库里的冲突标记消失了，
            // 但用户如果不看文件是不知道发生了什么 —— 静默会让人怀疑到底成没成。
            this.deps.notifier.success(this.deps.getT().sync.mergeAborted);
            await this.refreshStatus();
        });
    }

    // ── 仓库同步视图里的逐文件操作（2026-09-19） ──────────────────────────

    /**
     * 这里原有 `stageFiles` / `unstageFiles`（逐个文件暂存、取消暂存），
     * **2026-10-10 删掉了**，连同面板上那两个按钮。
     *
     * ## 为什么删：它们做不到看起来在做的事
     *
     * `doCommitAll` 无条件 `git add -A`，所以手动暂存了什么**对最终提交毫无影响**；
     * 更要紧的是**自动同步到点会把它们一起提交掉** —— 这个按钮**连「暂时不提交」
     * 都做不到**。用户暂存 A 想只提交 A，结果 B 一起进去了。
     *
     * 面板上仍然按暂存状态**分组**（冲突文件在 `git status` 里同时进 staged 与
     * unstaged，去重后落在「已暂存」那一组），但不再提供任何**改变**暂存状态的动作 ——
     * SyncHub 不做选择性提交。
     *
     * ## git 层那两个方法（`GitManager.stage` / `unstage`）**保留**
     *
     * 那是抽象层的词汇（`stage` 还被 `doCommitAll` 用着），而且 `unstage` 的
     * `HEAD_UNBORN_RE` 分支守着一条真实的坑 —— HEAD 未出生时 `git restore --staged`
     * 报的是 `fatal: could not resolve 'HEAD'`（**HEAD 带单引号**），那条守卫有集成测试钉着。
     */

    /**
     * 让 git **不再跟踪**这些路径（工作区文件保留）。
     *
     * 走串行队列：它写的是 git 索引，而索引是全局状态 ——
     * 和自动提交定时器并发写索引是真实会发生的。
     *
     * 调用方（设置页那个「让 git 不再跟踪图片」）负责先把同样的规则写进
     * `.gitignore`：**只做这一步文件会被下一次 `git add -A` 加回来**，
     * 只做 `.gitignore` 则已跟踪的那些照旧同步（见 `features/sync/imagesIgnore.ts`）。
     */
    async untrackPaths(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        await this.enqueue(async () => {
            await this.git.untrack(paths);
            await this.refreshStatus();
        });
    }

    /**
     * 当前已被跟踪的所有路径（`git ls-files`）。
     *
     * **不走队列**：它只读、不改索引，和 `readGitignore` 同一类。走队列反而有害 ——
     * 「按扩展名忽略图片」要在**摘索引之前**拿到这份清单，而摘索引本身在队列里，
     * 排在它前面只会让用户多点一次等待。
     */
    async listTrackedPaths(): Promise<string[]> {
        return this.git.listTracked();
    }

    async checkoutBranch(name: string): Promise<void> {
        await this.enqueue(async () => {
            await this.git.checkout(name);
            await this.refreshStatus();
        });
    }

    /**
     * 初始化仓库，并在**没有** `.gitignore` 时建一个默认的。
     *
     * ## 为什么自动建
     *
     * `.obsidian/workspace.json` 存的是面板与标签布局 —— **每开关一个标签它就变**。
     * 多设备同步它必然冲突，而且冲突内容是整份 JSON，用户根本没法手工合并。
     * 这是 Obsidian 同步最常见的坑，但用户不会预见到 —— 等冲突发生了再处理，
     * 成本高得多。所以初始化时顺手挡掉，并**明确告知建了什么**（不偷偷摸摸）。
     *
     * 已经存在 `.gitignore` 时**绝不覆盖** —— 用户可能有自己的规则，
     * 覆盖掉是数据损失。（实测用户的测试库里就有一份别的同步插件建的。）
     */
    async initRepo(): Promise<{ createdGitignore: boolean }> {
        return this.enqueue(async () => {
            await this.git.init();
            const createdGitignore = await this.ensureGitignore();
            await this.refreshStatus();
            return { createdGitignore };
        });
    }

    /**
     * `.gitignore` 模板，已按**本库的配置目录名**展开。
     *
     * 走 `vault.configDir` 而不是写死 `.obsidian`：配置目录可以改名，写死的话
     * 那些排除规则一条都匹配不上 —— 表现是「明明建了 .gitignore，
     * workspace.json 还是被同步出去了」，而用户根本看不出为什么。
     * 审核的 `hardcoded-config-path` 报的也是这件事。
     */
    private gitignoreTemplate(): string {
        return this.deps.getT().sync.gitignoreTemplate(this.deps.app.vault.configDir);
    }

    private async ensureGitignore(): Promise<boolean> {
        const vault: Vault = this.deps.app.vault;
        const path = normalizePath(".gitignore");

        try {
            if (await vault.adapter.exists(path)) return false;
            await vault.adapter.write(path, this.gitignoreTemplate());
            return true;
        } catch (err) {
            // 建不了 .gitignore 不该让初始化失败 —— 只是少了一层保护。
            logger.warn("could not create .gitignore", err);
            return false;
        }
    }

    /**
     * 打开 `.gitignore` 供用户编辑；不存在就先建一个默认的。
     *
     * 复用初始化时的那份模板，所以用户看到的是一个**有注释解释为什么**的文件，
     * 而不是空文件 —— 空文件没法教人该忽略什么。
     *
     * @returns 是否真的在编辑器里打开了。
     *
     * ## 为什么要返回这个布尔量（而不是默默返回 void）
     *
     * `getAbstractFileByPath` 查的是 **Obsidian 的库索引**，而以点开头的文件
     * 不一定在索引里 —— 那时 `openFile` 根本不会被调用，界面上的表现是
     * **点了一个按钮什么也没发生**（这是最容易被当成「插件坏了」的一种失败）。
     * 调用方据此给一句说明，并指向设置页里那个能直接改的代码框。
     *
     * 注意它仍然会**先建文件**：建了没打开，用户拿系统编辑器也能立刻改到。
     */
    async openGitignore(): Promise<boolean> {
        const vault: Vault = this.deps.app.vault;
        const path = normalizePath(".gitignore");

        if (!(await vault.adapter.exists(path))) {
            await vault.adapter.write(path, this.gitignoreTemplate());
        }

        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;

        await this.deps.app.workspace.getLeaf(false).openFile(file);
        return true;
    }

    /**
     * 读 `.gitignore` 的原文；**不存在时返回 undefined**。
     *
     * 刻意不在这里自动创建（`openGitignore` 会）：设置页只是被打开一下，
     * 不该因此往用户的库里多出一个文件。「还没建」是设置页要显示的状态之一，
     * 不是需要被悄悄修掉的问题。
     */
    async readGitignore(): Promise<string | undefined> {
        const path = normalizePath(".gitignore");
        const adapter = this.deps.app.vault.adapter;
        if (!(await adapter.exists(path))) return undefined;
        return await adapter.read(path);
    }

    /**
     * 写 `.gitignore`（不存在则创建）。
     *
     * 走同步队列：`commitAll` 的 `git add -A` 与这里同时发生的话，
     * 用户正在敲的那份半成品会被卷进一次提交（内容不完整，但记录是完整的）。
     * 排队几百毫秒换掉这个可能性，值得。
     *
     * 写完刷新状态 —— `.gitignore` 本身就是「哪些文件该出现在改动列表里」的
     * 依据，改完之后面板上的列表**应该**跟着变（否则用户会以为没生效）。
     */
    async writeGitignore(content: string): Promise<void> {
        await this.enqueue(() => this.writeGitignoreNow(content));
    }

    /**
     * `writeGitignore` 的**无锁**版本。
     *
     * 拆出来是因为「深度清理」要在**自己的锁里**写忽略规则（重写完立刻写，
     * 否则那几百毫秒里排队的 `commitAll` 会把刚清掉的文件又加回来）。
     * 在锁里调 `writeGitignore` 就是**自己等自己** —— 队列永远不往前走，
     * 而症状是「点了深度清理之后界面卡住不动」（2026-10-09 实测踩到）。
     */
    private async writeGitignoreNow(content: string): Promise<void> {
        await this.deps.app.vault.adapter.write(normalizePath(".gitignore"), content);
        await this.refresh();
    }

    // ── 差异（仓库同步面板 / 命令面板） ──────────────────────────────────

    /**
     * 一个文件的差异：工作区与已暂存两侧各一份。
     *
     * ## 未跟踪文件为什么要兜底
     *
     * `git diff` 对**未跟踪**文件什么都不输出 —— 而库里新增的笔记恰恰是最想看
     * 一眼的那一类。所以两侧都为空、且这个路径确实在未跟踪列表里时，把文件内容
     * 读出来当成「全部新增」。
     *
     * 「确实在未跟踪列表里」这一步不能省：一个**干净**的已跟踪文件两侧也全为空，
     * 把它读出来当成「全部新增」就是在编造一个不存在的改动。
     */
    async fileDiff(path: string): Promise<FileDiffSet> {
        return this.enqueue(async () => {
            const [unstagedRaw, stagedRaw] = await Promise.all([
                this.git.diffFile(path),
                this.git.diffFile(path, { staged: true }),
            ]);

            let unstaged = firstFileDiff(parseUnifiedDiff(unstagedRaw), path);
            const staged = firstFileDiff(parseUnifiedDiff(stagedRaw), path);

            if (unstaged.kind === "empty" && staged.kind === "empty") {
                const added = await this.addedFileDiff(path);
                if (added) unstaged = added;
            }

            return { path, unstaged, staged };
        });
    }

    /**
     * 某条提交引入的改动（可能跨多个文件）。
     *
     * 合并提交也能给出内容 —— 实现里带了 `--first-parent`（见
     * `SimpleGitManager.commitPatch` 的说明）。
     */
    async commitDiff(hash: string): Promise<FileDiff[]> {
        return this.enqueue(async () =>
            parseUnifiedDiff(await this.git.commitPatch(hash))
        );
    }

    /** 未跟踪文件 → 「全部新增」；读不到、太大、或它其实是已跟踪的 → undefined。 */
    private async addedFileDiff(path: string): Promise<FileDiff | undefined> {
        try {
            const status = await this.git.status();
            if (!status.untracked.some((change) => change.path === path)) return undefined;
        } catch (err) {
            // 不是仓库时连「未跟踪」都无从谈起。
            logger.debug("could not read status for diff", err);
            return undefined;
        }

        const normalized = normalizePath(path);
        try {
            const stats = await this.deps.app.vault.adapter.stat(normalized);
            if (!stats || stats.type !== "file") return undefined;

            // 库里放一个几十 MB 的日志是常事 —— 读进来会把界面卡住。
            if (stats.size > MAX_UNTRACKED_DIFF_BYTES) {
                return {
                    path,
                    kind: "too-large",
                    hunks: [],
                    additions: 0,
                    deletions: 0,
                    truncated: false,
                };
            }

            return buildAddedFileDiff(path, await this.deps.app.vault.adapter.read(normalized));
        } catch (err) {
            // 读不到就当没有差异 —— 差异视图读不出内容不该是个错误弹窗。
            logger.debug("could not read untracked file for diff", err);
            return undefined;
        }
    }

    /**
     * 只刷新状态（不打扰任何 git 写操作）。
     *
     * ## 它是全插件唯一读状态的地方，所以去重也收在这里
     *
     * 三层防护，各自挡一个真实的浪费（见 `STATUS_TTL_MS` 与两个字段的说明）：
     * 1. **单飞**：正在读就直接复用那次 promise；
     * 2. **短 TTL**：刚读过（400 ms 内）就直接返回上一次的结果；
     * 3. **动作让缓存失效**（`enqueue` 里的 `forgetStatus`）：动过仓库之后
     *    一定重新读，界面不会显示旧状态。
     *
     * 命中缓存时**故意不再 `publish`**：订阅者拿到的就是这份状态对象
     * （同一次读取的结果），状态栏显示的也已经是它 —— 再推一次只是让界面
     * 白重绘一遍，而重绘正是我们要省的。
     *
     * @param options.force 跳过缓存与单飞，**立刻**去读一次。
     *   只给「我们刚在 git 之外动了仓库」这类调用点用：改远端地址
     *   （`main.ts` 的 `editRemote`）与面板上那次手动「刷新」。前者会让
     *   领先/落后重新算，而用户刚点完保存，缓存那 400 ms 就是「改了没反应」；
     *   后者的全部意义就是「现在读一次」，拿 400 ms 前的结论回答是骗人的。
     */
    async refresh(options: { force?: boolean } = {}): Promise<RepoStatus | undefined> {
        if (!options.force) {
            if (this.inFlightStatus) return this.inFlightStatus;

            const cached = this.statusCache;
            if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status;
        }

        const task = this.readStatus();
        this.inFlightStatus = task;
        try {
            return await task;
        } finally {
            this.inFlightStatus = undefined;
        }
    }

    /** 真的去读一次状态：更新缓存、状态栏，并推给订阅者。 */
    private async readStatus(): Promise<RepoStatus | undefined> {
        let status: RepoStatus | undefined;

        try {
            status = await this.git.status();
        } catch (err) {
            // 刷不出状态（比如刚卸载 git）不影响动作本身的结论。
            logger.debug("status refresh failed", err);
            status = undefined;
        }

        // 认出「嵌套仓库」行（2026-10-04）。**问一次 git、只问变了的那些路径**：
        // 这类行（用户在插件目录里就地开发留下的 gitlink）暂存不掉、没有文件级差异，
        // 面板必须能把它和普通文件区分开，否则只能看着一条永远消不掉的「更改」。
        // 放在状态快照里而不是让视图自己问 —— 视图只管画，git 只在这里碰。
        if (status) {
            const changed = [
                ...status.staged,
                ...status.unstaged,
                ...status.untracked,
            ].map((change) => change.path);
            if (changed.length > 0) {
                try {
                    const nested = await this.git.nestedRepoPaths(changed);
                    if (nested.length > 0) status.nestedRepos = nested;
                } catch (err) {
                    // 认不出来只是少了那个标记，不该让整个面板读不出状态。
                    logger.debug("could not detect nested repositories", err);
                }
            }
        }

        this.statusCache = { status, at: Date.now() };
        this.statusBar.update(status);
        this.publish(status);
        return status;
    }

    /**
     * 让 git 不再跟踪这些路径，**并把它们写进 `.gitignore`**（一步到位）。
     *
     * 「只摘索引」是不够的：下一次 `git add -A`（自动同步每轮都会跑）会把它们加回来
     * —— 这正是它们当初进索引的方式。所以忽略规则和摘索引必须一起做。
     *
     * 只动索引与 `.gitignore`：**工作区文件一个都不碰**（对「就地开发的插件目录」
     * 尤其要紧 —— 里面有用户没提交的代码）。
     *
     * @returns 这次真正写进 `.gitignore` 的规则条数（0 = 本来就有）。
     */
    async untrackAndIgnore(paths: string[]): Promise<number> {
        if (paths.length === 0) return 0;
        const current = (await this.readGitignore()) ?? "";
        const merged = mergeRuleLines(
            current,
            paths.map((path) => ignoreRuleFor(path))
        );
        if (merged.added.length > 0) await this.writeGitignore(merged.content);
        await this.untrackPaths(paths);
        return merged.added.length;
    }

    /**
     * 把若干路径加进忽略规则并退出跟踪。
     *
     * 与 `untrackAndIgnore` 的区别只有一处，但那一处会决定成败：**只对已跟踪的路径
     * 摘索引**。对不存在的索引项执行 `git rm --cached` 会直接报错
     * （`did not match any files`），而大文件清单里必然混着未跟踪的新文件 ——
     * 用 `untrackAndIgnore` 一把梭会让整批操作失败，用户看到的是「点了没反应」。
     *
     * 忽略规则则对**所有**路径都要加：未跟踪的文件下次会被 `git add -A` 带上，
     * 少了规则就等于没处理。
     *
     * 只动索引与 `.gitignore`：**工作区文件一个都不碰**。
     */
    async ignorePaths(paths: string[], trackedPaths: string[]): Promise<number> {
        if (paths.length === 0) return 0;
        const added = await this.writeIgnoreRules(paths);
        if (trackedPaths.length > 0) await this.untrackPaths(trackedPaths);
        return added;
    }

    /**
     * 把若干路径写进 `.gitignore`，返回新增的规则数（幂等：已有的不重复加）。
     *
     * `locked` 为假时走无锁写入 —— 只给「已经在队列里」的调用方用（见
     * `rewriteHistory`）。默认走 `writeGitignore`（自己进队列），
     * 因为 `ignorePaths` 的常规调用方（面板、大文件守卫）不在锁里。
     */
    private async writeIgnoreRules(paths: string[], locked = true): Promise<number> {
        // 路径走 `ignoreRuleFor`（它会补上目录用的尾斜杠）—— 规则行本身别走，
        // 所以下面另开一个 `writeIgnoreLines` 给「已经是规则」的调用方用。
        return this.writeIgnoreLines(
            paths.map((path) => ignoreRuleFor(path)),
            locked
        );
    }

    /**
     * 把**规则行**并进 `.gitignore`（不再经过 `ignoreRuleFor`）。
     *
     * 「本地状态文件」那一组用的是**文件**路径（`…/workspace.json`），补尾斜杠会变成
     * `…/workspace.json/` —— 那条规则一条都匹配不上，而且**不会报错**，
     * 用户看到的是「加了规则但文件照样被提交」。
     */
    private async writeIgnoreLines(lines: string[], locked = true): Promise<number> {
        const current = (await this.readGitignore()) ?? "";
        const merged = mergeRuleLines(current, lines);
        if (merged.added.length === 0) return 0;
        if (locked) await this.writeGitignore(merged.content);
        else await this.writeGitignoreNow(merged.content);
        return merged.added.length;
    }

    /**
     * 「退出跟踪并忽略」大文件清单里的那些文件。
     *
     * 拆出这一层而不是让界面自己拼 `ignorePaths`：`tracked` 这一位的来源
     * （`largeFiles.ts` 的 `pendingFilesForCommit`）与消费必须成对出现，
     * 分开写迟早会有人漏掉它。
     */
    async ignoreLargeFiles(files: LargePendingFile[]): Promise<number> {
        return this.ignorePaths(
            files.map((file) => file.path),
            files.filter((file) => file.tracked).map((file) => file.path)
        );
    }

    /**
     * Obsidian 的「文件恢复」核心插件现在开着吗？
     *
     * ## 为什么要问这个（2026-10-10）
     *
     * 「高频保护」和「进 git 的历史」是两条独立的轴：git 的恢复粒度是**全库提交**，
     * 而高频恢复要的是**单文件回滚** —— 用提交去满足它，每次都得写一个全库提交，
     * 提交数于是等于编辑次数，这正是「历史变脏、清理变难」的来源。
     * 而 Obsidian 自带的「文件恢复」默认每 5 分钟给每个改过的文件存一份快照、保留 7 天，
     * 存在 IndexedDB 里，**完全不碰 git**。
     *
     * 所以用户想把间隔调得很短时，正确的回答不是「调吧」，而是「那件事该由它来做」——
     * 但**它默认是开的，而这个用户关掉了**，于是两边都没兜住。
     *
     * 只读 `core-plugins.json`（不写：改它要重启才生效，而且不该由插件动别人的配置）。
     *
     * @returns `undefined` 表示**读不出来** —— 界面据此**不提示**（宁可不提示也不猜）。
     */
    async fileRecoveryEnabled(): Promise<boolean | undefined> {
        const adapter = this.deps.app.vault.adapter;
        const path = normalizePath(`${this.deps.app.vault.configDir}/core-plugins.json`);
        try {
            if (!(await adapter.exists(path))) return undefined;
            return corePluginEnabled(await adapter.read(path), "file-recovery");
        } catch (err) {
            logger.debug("could not read core-plugins.json", err);
            return undefined;
        }
    }

    /**
     * 当前**被跟踪**的本地状态文件（`workspace.json` / `workspaces.json` / 位置缓存…）。
     *
     * 给界面用：先让用户看见「到底哪几个文件还在 git 里」，再决定要不要处理。
     * 只读，不进队列。
     */
    async listTrackedLocalState(): Promise<string[]> {
        const configDir = this.deps.app.vault.configDir;
        const tracked = await this.git.listTracked();
        return tracked.filter((path) => matchesLocalState(path, configDir));
    }

    /**
     * 停止跟踪本地状态文件：**写忽略规则 + 把已跟踪的从索引里摘掉**。
     *
     * ## 为什么必须是两件事
     *
     * `.gitignore` 只管**未跟踪**的文件。对已经跟踪的 `workspace.json` 加一条规则，
     * 它照样每次同步都被提交 —— 用户会得出「这功能没用」的结论，而根因是少做了半步。
     * 这与「让图片退出 git」是同一条 git 语义（那个弹窗里把三步都列了出来）。
     *
     * ## 为什么不像 `rewriteHistory` 那样包在一个 enqueue 里
     *
     * `writeIgnoreLines`（走 `writeGitignore`）与 `untrackPaths` **各自都进队列** ——
     * 包一层就是自己等自己（2026-10-09 在 `rewriteHistory` 上踩过一次，
     * 症状是界面卡住不动）。两步顺序执行、各自排队即可。
     */
    async untrackLocalState(): Promise<{ files: string[]; rules: number }> {
        const configDir = this.deps.app.vault.configDir;
        const files = await this.listTrackedLocalState();
        const rules = await this.writeIgnoreLines(localStateRules(configDir));
        await this.untrackPaths(files);
        return { files, rules };
    }

    /**
     * 把 SyncHub 推荐的一组忽略规则**补齐**到 `.gitignore`。
     *
     * ## 为什么是「补齐」而不是复用「恢复默认模板」
     *
     * 设置页里那个按钮是**覆盖式**的：它把模板原文填进代码框，用户保存后自己写的
     * 规则就没了。那是给「我想推倒重来」用的。这个动作不一样 —— 它走 `mergeRuleLines`，
     * **只追加缺的那些，已有的一行都不动**，所以可以随手点（幂等），
     * 也可以在两台设备各点一次。
     *
     * ## 为什么不干脆改 `gitignoreTemplate`
     *
     * 模板只在**初始化仓库时**写入一次（`ensureGitignore` 见文件已存在就直接返回）。
     * 所以对已经用了一阵子的库，改模板一个字都不会生效 —— 而恰恰是这些库才需要它
     * （体积已经涨上去了）。补齐动作对新库和老库都有效，这是它存在的理由。
     *
     * @returns 这次真正写进去的规则（带分组），空数组 = 本来就已经配好了。
     */
    async applyRecommendedIgnores(): Promise<RecommendedRule[]> {
        const current = (await this.readGitignore()) ?? "";
        const rules = recommendedRules({
            configDir: this.deps.app.vault.configDir,
            ignorePluginFolder: this.deps.getIgnorePluginFolder(),
        });
        const merged = mergeRecommendedRules(current, rules);
        if (merged.added.length > 0) await this.writeGitignore(merged.content);
        return merged.added;
    }

    // ── 清理：体检 / 回收 / 深度清理 ────────────────────────────────────────

    /**
     * 体检（只读）。
     *
     * **不进 `enqueue`**：它不写任何东西，排队只会让用户点一下之后干等前面的同步跑完。
     * 三个清理动作里只有它是可以随手点的，这一点必须在实现里也成立。
     */
    async historySummary(): Promise<HistorySummary> {
        return this.git.historyObjects();
    }

    /** 当前分支的提交数（估算重写耗时用）。只读，同样不排队。 */
    async commitCount(): Promise<number> {
        return this.git.countCommits();
    }

    /** 本插件建的历史备份引用（新的在前）。只读。 */
    async listBackups(): Promise<string[]> {
        return this.git.listBackups();
    }

    /**
     * 回收空间（`git gc --prune=now`），返回释放的字节数。
     *
     * 返回 `undefined` 表示**体积读不出来**（`count-objects` 的输出认不出）——
     * 那种情况下宁可说「读不到」也不编一个 0，因为 0 在这里是有含义的结论
     * （「没有可回收的对象」），两者完全不同。
     */
    async collectGarbage(): Promise<number | undefined> {
        return this.enqueue(async () => {
            const before = await this.repoBytes();
            await this.git.gc();
            const after = await this.repoBytes();
            if (before === undefined || after === undefined) return undefined;
            return Math.max(0, before - after);
        });
    }

    /**
     * 丢弃备份并回收，返回释放的字节数（含义同上）。
     *
     * **不可逆**：调用之后没有任何办法回到重写前的历史。界面必须把这句话说出来，
     * 而不是只给一个按钮。
     */
    async discardBackups(): Promise<number | undefined> {
        return this.enqueue(async () => {
            const before = await this.repoBytes();
            await this.git.discardBackups();
            const after = await this.repoBytes();
            if (before === undefined || after === undefined) return undefined;
            return Math.max(0, before - after);
        });
    }

    /**
     * 深度清理：把路径从全部历史里剔除。
     *
     * ## 为什么重写之后必须顺手写忽略规则
     *
     * 重写只把那些路径从**历史**里拿掉，工作区里的文件一个都没动 —— 于是它们变成
     * 未跟踪文件，下一次 `git add -A` 会原样加回来。用户看到的是「清理完又自己长回来了」，
     * 而根因是「历史清了、忽略没加」。这两件事本来就是一件：清历史的目的是让它
     * **以后也别进来**。
     *
     * 走 `ignorePaths(paths, [])` 而不是 `untrackAndIgnore`：这些路径此刻已经不在索引里了
     * （刚被重写掉），而 `git rm --cached` 对不存在的索引项会直接报错 —— 见 `ignorePaths`。
     *
     * 整个过程进 `enqueue`：重写要跑几分钟，这期间任何同步动作都必须排队等着，
     * 否则会有另一个 git 进程在历史被改写的中途去读写引用。
     */
    async rewriteHistory(
        paths: string[]
    ): Promise<{ result: RewriteResult; ignoredRules: number }> {
        return this.enqueue(async () => {
            const result = await this.git.rewriteHistory(paths);
            // 走无锁写入：我们此刻**就在队列里**，再进一次队列就是自己等自己。
            const ignoredRules = await this.writeIgnoreRules(paths, false);
            return { result, ignoredRules };
        });
    }

    /** 强制推送（重写之后本地与远端必然分叉，普通 push 会被拒绝）。 */
    async forcePush(): Promise<SyncOutcome> {
        return this.enqueue(() => this.withActivity("pushing", () => this.git.forcePush()));
    }

    /** 仓库体积（字节）；读不出来时返回 undefined（见 `collectGarbage`）。 */
    private async repoBytes(): Promise<number | undefined> {
        try {
            return (await this.git.repoSize()).bytes;
        } catch (err) {
            logger.debug("repository size unavailable", err);
            return undefined;
        }
    }

    /**
     * 把错误翻译成用户可读文案。
     *
     * **先用自己的翻译器**，而不是只依赖 `notifier.describeError` ——
     * 后者要靠「`createSyncModule` 已经注册过翻译器」这个隐式前提，
     * 而诊断是个自包含的工具，不该依赖模块的装配顺序。
     * （这个隐式依赖是被测试抓出来的：单独构造 SyncService 时，
     * 鉴权失败只显示英文技术描述。）
     */
    private describe(err: unknown): string {
        return describeSyncError(err, this.deps.getT()) ?? this.deps.notifier.describeError(err);
    }

    /**
     * 诊断同步配置。
     *
     * 存在的理由：**鉴权配得对不对，光看设置项判断不了** —— 令牌填了不代表有效，
     * 仓库是私有的才知道。只有真的去连一次才有答案。所以这里跑一条递进的检查链，
     * 任何一步失败就停（后面的检查依赖前面的前提）。
     *
     * 只读：最后一步用 `ls-remote`，不动 refs、不动 index、不写任何文件。
     *
     * 返回结构化结果（类型码 + 状态），文案由展示层按 `id` 取 locale ——
     * 与错误处理同一套约定，所以这个函数不依赖 i18n，可以单独测。
     */
    async diagnose(): Promise<DiagnosticsReport> {
        const checks: DiagnosticCheck[] = [];
        /**
         * `detail` 会被设置页**渲染出来**，所以在这里统一脱敏 ——
         * 这是「原始数据」变成「给人看的报告」的唯一收口点。
         *
         * 为什么不能只在 `remote` 那条上做：这个报告里凡是带 `detail` 的条目
         * 都可能夹带地址（git 的报错、平台的失败原因），逐条去记该脱哪些必然漏。
         * 在收口点做一次，将来新加的检查也自动受保护。
         *
         * 现实触发路径：库的远端本来就写着带令牌的地址
         * （用户以前用别的方式配的，或在「编辑远端地址」里粘的），
         * 那这条检查就会把令牌显示在设置页上。
         */
        const add = (
            id: DiagnosticCheck["id"],
            status: DiagnosticCheck["status"],
            detail?: string
        ): void => {
            const safe = detail === undefined ? undefined : redactUrl(detail);
            checks.push(safe === undefined ? { id, status } : { id, status, detail: safe });
        };

        // 1) git 可执行文件。这一步失败的话后面全都做不了，直接停。
        let repoExists = false;
        try {
            repoExists = await this.git.isRepo();
            add("git", "ok");
        } catch (err) {
            add("git", "failed", this.describe(err));
            return { checks, ok: false };
        }

        // 2) 当前库是不是 git 仓库。
        if (!repoExists) {
            add("repo", "failed");
            return { checks, ok: false };
        }
        add("repo", "ok");

        // 3) 有没有配远端。
        const remoteUrl = await this.git.getRemoteUrl();
        if (!remoteUrl) {
            add("remote", "failed");
            return { checks, ok: false };
        }
        add("remote", "ok", remoteUrl);

        // 4) 平台认不认得出 —— 认不出就注入不了令牌（但可以用系统凭据助手，不算失败）。
        const ref = parseGitRemoteUrl(remoteUrl);
        if (!ref) {
            add("platform", "skipped", remoteUrl);
        } else {
            const hasToken = this.deps.secretStore.getToken(ref.host) !== undefined;
            add("platform", hasToken ? "ok" : "skipped", ref.host);
        }

        // 5) 真的连一次 —— **鉴权是否有效看这一条**。
        try {
            const refCount = await this.git.testRemoteAccess();
            add("access", "ok", String(refCount));
        } catch (err) {
            add("access", "failed", this.describe(err));
        }

        return { checks, ok: checks.every((check) => check.status !== "failed") };
    }

    // ── 内部（不加锁版本，供已持锁的链路复用） ────────────────────────────

    private async doCommitAll(options: { allowLargeFiles?: boolean } = {}): Promise<SyncOutcome> {
        const status = await this.git.status();

        // 冲突未解决时**绝不能提交**。
        //
        // 这里有个不显眼的陷阱：冲突文件在 `git status` 里是 `UU`，
        // 于是它**同时**被归进 `staged`（index 位非空）与 `unstaged`（worktree 位非空），
        // 所以"有没有改动"的判断在有冲突时必然为真 —— 光看 dirty 是拦不住的。
        // 不拦的话 `git add -A` 会把 `<<<<<<<` / `>>>>>>>` 冲突标记当普通内容暂存并提交，
        // 把冲突写进历史。这正是本模块的设计要避免的事。
        //
        // 现实触发路径：上次同步遇到冲突没处理 → 自动提交定时器到点 → sync() 第一步就是这里。
        if (status.conflicted.length > 0) {
            throw new ConflictError(
                `commit: ${status.conflicted.length} unresolved conflict(s)`,
                status.conflicted
            );
        }

        const dirty =
            status.staged.length + status.unstaged.length + status.untracked.length;
        if (dirty === 0) {
            return { kind: "nothing-to-commit" };
        }

        /**
         * 本次提交涉及的文件（去重 + 标出是否已跟踪）。
         *
         * 去重规则搬进了 `pendingFilesForCommit` —— 大文件检查要用**同一份**规则，
         * 两处各写一遍就是那种「改了其中一处、另一处悄悄不对」的老问题。
         * 「是否已跟踪」那一笔是给大文件清单用的：未跟踪的文件不需要 `git rm --cached`
         * （对不存在的索引项执行它会直接报错）。
         */
        const pending = pendingFilesForCommit(status);

        // 提交前的大文件检查 —— **这是唯一来得及的一步**。git 的历史不可逆：
        // 大文件一旦进了提交，就只能重写全部历史才能清掉（本插件明确不做）。
        //
        // 忽略规则挡的是「想到过的类型」，而把仓库撑起来的多半是意料之外的东西
        // （插件的向量库缓存、录屏、PDF）。所以这里按**大小**再兜一道。
        //
        // `allowLargeFiles` 由「用户看过清单并选了仍然提交」的路径传 true；
        // 阈值 0 = 关闭检查（见 `SyncSettings.largeFileThresholdMb`）。
        const thresholdMb = this.deps.getLargeFileThresholdMb();
        if (!options.allowLargeFiles && thresholdMb > 0) {
            const largeFiles = await findLargeFiles(
                pending,
                async (path) => {
                    try {
                        const stats = await this.deps.app.vault.adapter.stat(path);
                        return stats?.size;
                    } catch (err) {
                        // 取不到大小（文件刚被删、读不了）时跳过：那部分不增加体积，
                        // 也不该让整条提交链路失败 —— 只是少一条提示。
                        logger.debug("could not stat pending file", path, err);
                        return undefined;
                    }
                },
                thresholdBytesFromMb(thresholdMb)
            );
            if (largeFiles.length > 0) return { kind: "large-files-pending", largeFiles };
        }

        const files = pending.map((file) => file.path);

        await this.git.stage([]);
        const message = renderCommitMessage(this.deps.getCommitTemplate(), { files });
        const committed = await this.git.commit(message);
        return { kind: committed ? "committed" : "nothing-to-commit" };
    }

    private async doPull(): Promise<SyncOutcome> {
        const t = this.deps.getT();
        try {
            return await this.git.pull(this.deps.getStrategy());
        } catch (err) {
            if (err instanceof ConflictError) {
                await this.writeConflictGuide(err.files);
                this.deps.notifier.error(t.sync.conflictDetected(err.files.length));
                // 用独立的 kind 让调用方知道链路要停，而不是当一次普通拉取。
                return { kind: "conflict" };
            }
            throw err;
        }
    }

    /**
     * 推送的**唯一**实现：`git push -u origin <当前分支>`。
     *
     * 里面**没有提交** —— 这个函数只把已经存在的提交送上去。用户带着未提交的改动
     * 点「推送」时会得到一句说明（见 `announceAfterPush`），而不是让他以为改动
     * 已经在远端了。
     */
    private async doPush(): Promise<SyncOutcome> {
        const status = await this.git.status();
        // 没有远端时 push 必然失败 —— 提前给出更有指导性的错误。
        if (!(await this.git.getRemoteUrl())) {
            this.deps.notifier.warn(this.deps.getT().sync.noRemote);
            return { kind: "up-to-date" };
        }
        if (status.ahead === 0) return { kind: "up-to-date" };
        return this.git.push();
    }

    // ── 冲突指南 ──────────────────────────────────────────────────────────

    /** 冲突文件清单 + 处理指引，写在库根目录。 */
    private async writeConflictGuide(files: string[]): Promise<void> {
        const name = this.deps.getConflictGuideName();
        if (!name) return;

        const t = this.deps.getT();
        const vault: Vault = this.deps.app.vault;
        const lines: string[] = [
            `# ${t.sync.conflictGuideTitle}`,
            "",
            t.sync.conflictGuideIntro,
            "",
            t.sync.conflictGuideFiles,
            ...files.map((file) => `- [[${file}]]`),
            "",
            t.sync.conflictGuideResolve,
            "",
            t.sync.conflictGuideAbort,
            "",
            `> ${t.sync.conflictGuideFooter(new Date().toLocaleString())}`,
        ];

        try {
            const path = normalizePath(name);
            if (await vault.adapter.exists(path)) {
                await vault.adapter.remove(path);
            }
            await vault.adapter.write(path, lines.join("\n"));
        } catch (err) {
            // 指南写不进去不该吞掉冲突本身的信息。
            logger.error("failed to write conflict guide", err);
        }
    }
}

/**
 * 取单文件差异里的那一段；git 什么都没给时返回一份「没有差异」。
 *
 * `git diff -- <path>` 通常只回一段，但传进来的是目录时会有多段 ——
 * 那时取第一段，不假装它代表了全部（面板与命令永远只传文件路径，
 * 这一条是防御）。
 */
function firstFileDiff(files: FileDiff[], path: string): FileDiff {
    return (
        files[0] ?? {
            path,
            kind: "empty",
            hunks: [],
            additions: 0,
            deletions: 0,
            truncated: false,
        }
    );
}
