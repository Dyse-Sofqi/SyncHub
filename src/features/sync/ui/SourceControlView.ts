import { ItemView, setIcon, Setting, WorkspaceLeaf, type ButtonComponent } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import {
    changeFilterOptions,
    changeRows,
    matchesFilter,
    type ChangeRow,
} from "../changeRows";
import { formatCountdown } from "../countdown";
import { formatBytes } from "../repoSize";
import { IDLE_ACTIVITY, type BusyActivity, type SyncActivity } from "../statusBar";
import { isFullyInSync } from "../syncState";
import type { SyncService } from "../syncService";
import type { SimpleGitManager } from "../simpleGitManager";
import type { DiffRequest } from "./DiffView";
import type { CommitInfo, FileChangeStatus, RepoSize, RepoStatus } from "../types";

/**
 * 仓库同步视图（侧边栏面板）。
 *
 * 类名与视图类型仍是 `SourceControlView` / `obsync-sync-view`：改名只动了**显示
 * 的名字**（`t.sync.viewTitle`），没动标识符 —— 视图类型是持久化在用户
 * `workspace.json` 里的，改了会让已经打开的标签页失效。
 *
 * ## 它现在的样子与为什么
 *
 * 原先这里只有「一个标题 + 四个按钮 + 一串文件名」：没有分支的上游信息、
 * 看不出哪些文件已暂存、看不到提交历史、不是仓库时是一条死路（只提示
 * 「尚未初始化」而没有任何入口）。用户的原话是「我希望能在侧边栏打开查看详情，
 * 就像 git 插件一样」—— 于是参考 obsidian-git 的面板补成了现在这份：
 * 状态摘要（远端 / 领先落后）、冲突区、分组的更改列表（逐个文件
 * 暂存与取消暂存、点文件名打开、在远端打开）、最近提交（点 hash 在远端查看）。
 *
 * ## 顶部只有一行
 *
 * 2026-09-19：用户要求去掉面板内的「源码控制」标题，并把「标题右边的刷新按钮」
 * 「四个动作按钮」「下一行的分支下拉」并成一行 —— 侧边栏里垂直空间比横向更稀缺。
 * 同一天稍后又指定了顺序：**分步动作在左、立即同步在右、刷新最右**；体积那两块
 * （仓库大小 / 待提交改动）也从两行改成并排两栏。见 `renderToolbar` 与 `renderRepo`。
 *
 * 仍然**刻意不做**的（PLAN.md 的「明确不做」清单）：树形目录、hunk 级暂存、
 * blame。这些是 obsidian-git 那个 3k 行可选增强的部分。
 *
 * ## 差异看在这里，但渲染在别处（2026-09-24）
 *
 * 面板每行（含冲突行）与每条提交都给了差异入口，但**内容**是弹窗
 * （`DiffModal`）画的：这个面板窄、常驻、要一眼扫完「哪些文件变了」，
 * 而 diff 行很长、要看行号、看完就关 —— 两件事的形态正好相反。
 * 硬塞进来只会让两边都难用。
 *
 * ## 状态是活的
 *
 * 面板打开后会一直挂着，而状态会在它背后变（自动提交定时器到点、库外的编辑器
 * 改了文件、命令面板触发了一次拉取）。所以 `onOpen` 里订阅 `service.onStatusChange`
 * —— 谁刷新了状态谁就通知这个面板重绘，而不是让面板自己轮询。
 *
 * ## 布局加载不能被 git 挡住（2026-10-01）
 *
 * 原来的 `onOpen()` 是 `await this.render()`，而 render 的第一件事就是
 * `service.refresh()`（一次 `git status`），后面还有分支 / 远端 / 体积 / 历史。
 * 这在真机上不只是「面板慢一点」：Obsidian 恢复布局时会 **await 每一个视图的
 * `onOpen()`**（`Workspace.deserializeLayout` → `withTimeout(leaf.setViewState(…), 10s)`
 * → `WorkspaceLeaf.setViewState` → `View.open()` → `await this.onOpen()`），
 * 而那段等待正记在启动时序的「Load layout」里。实测一次渲染 754 ms /
 * 10 个 git 子进程（其中 `git status` 一项 300 ms）—— 侧边栏挂着这个面板，
 * 重启时「Load layout」就多出这么长；超过那 10 秒超时还会连面板一起被丢掉
 * （控制台只留一句 `Failed to restore view of type "obsync-sync-view"`）。
 *
 * 所以现在 `onOpen()` **一次 git 都不跑**（只同步画一条工具条），真正的渲染
 * 排到布局就绪之后。这样布局不被拖长，面板内容照样会自己长出来
 * （首屏有一句「正在读取…」，见 `renderShell`）。
 *
 * ## 一次动作 = 一次重绘（2026-10-01）
 *
 * 状态推送与重绘是**多对一**的：一次动作会推好几次状态（`withActivity` 收尾一次、
 * 视图刷新又一次），而每次重绘都要跑「分支 / 远端 / 体积 / 历史」那几条 git 命令。
 * 现在重绘统一走 `requestRender()`：同一轮里的多次请求合并成一次；渲染期间到来的
 * 更新记在 `dirty` 上、本轮结束后补跑。**补跑这件事不能省** —— 原来的
 * `rendering` 守卫是把这些更新直接扔掉的，面板会停在旧内容上。
 *
 * 另外两处「省掉一次 git status」的约定见 `currentStatus()` 与 `run()`：
 * 状态优先用 service 推过来的那一份，而不是自己再读一次。
 */

export const SYNC_VIEW_TYPE = "obsync-sync-view";

/** 面板里的标签（见 `renderViewTabs`）。 */
type ViewTabId = "changes" | "history";

/** 历史里显示多少条提交。面板窄，再多也读不完，而每次都要跑一次 git log。 */
const HISTORY_LIMIT = 10;

/**
 * 把多次重绘请求合并进同一轮的时间窗（毫秒）。
 *
 * 用 0（下一个宏任务）而不是几十毫秒的防抖：这是个「点一下要看结果」的面板，
 * 人为拖慢反馈比多跑一次重绘更糟；而同一轮事件里到达的多次推送
 * （`withActivity` 收尾 + 视图自己刷新）本来就会合并进同一个宏任务。
 * 跨越更久的连续变化由 `dirty` 补跑兜住（见 `requestRender`）。
 */
const RENDER_COALESCE_MS = 0;

export interface SourceControlViewDeps {
    service: SyncService;
    git: SimpleGitManager;
    /**
     * **每次渲染时取**文案，不要传 `t` 本身。
     *
     * 视图是**常驻**的（打开后一直挂在侧边栏），构造时快照 `t` 会让它
     * 在切换语言后一直显示旧语言 —— 这就是 `StatusBar` 踩过的那个坑
     * （见 statusBar.ts 里 `getT` 的说明），全项目统一用这个约定。
     */
    getT: () => LocaleStrings;
    /** 初始化仓库（含 .gitignore，以及给用户的那两条提示），由主类实现。 */
    onInitRepo: () => void;
    /**
     * 定时同步**下一次触发**的时刻（毫秒）；没有定时器时为 `undefined`。
     *
     * 与设置页那一行的倒计时**同一份数据**（`Automatics.nextRunAt()`）：
     * 面板是用户盯着同步的地方，开了定时同步却看不到「下次什么时候跑」是个空洞
     * （2026-10-04 用户要求）。
     *
     * 三种情形是 `undefined`：开关关着、策略是 `reset`（挂起）、刚触发还没重新起表
     * —— 那时徽标自己收起来，而不是显示一个假的倒计时。
     */
    nextRunAt: () => number | undefined;
    /** 在浏览器里打开某个文件 / 某条提交的远端页面。 */
    onOpenFileOnRemote: (path: string) => void;
    onOpenCommitOnRemote: (hash: string) => void;
    /**
     * 打开差异（**主工作区的标签页**，2026-10-04 起不再是弹窗 —— 用户原话：
     * 「点击查看diff页面时，应该以标签页形式打开而不是模态框，模态框太小了」）。
     *
     * 真正开标签的是主类（它才拿得到 `WorkspaceLeaf`），与 `openSourceControlView`
     * 同一个约定；面板只交「看什么」。
     */
    openDiff: (request: DiffRequest) => void;
}

export class SourceControlView extends ItemView {
    /** 正在渲染（含它内部的 await）。见 `render`。 */
    private rendering = false;
    /** 渲染期间又来了新状态 → 本轮结束后补跑一次。见 `requestRender`。 */
    private dirty = false;
    /** 已经排进定时器的那次重绘。**合并**靠它，见 `requestRender`。 */
    private scheduled = false;
    /** 倒计时那个每秒刷新的定时器（`window.setInterval` 的 id）。见 `renderCountdown`。 */
    private countdown: number | undefined;
    /**
     * 当前选中的标签（`changes` = 更改，`history` = 最近提交）。
     *
     * 记在实例上而不是每次渲染重置：面板会因为状态推送频繁重绘，用户切到「最近提交」
     * 看两眼时被重绘踢回「更改」是很烦的（设置页的 `activeTab` 同一个理由）。
     *
     * `viewTabs` 只是切标签时快速改类名用的引用，每轮渲染重建。
     */
    private activeTab: ViewTabId = "changes";
    /**
     * 更改列表的格式筛选：`all` 或某个扩展名（小写，不含点）。
     *
     * 记在实例上（同 `activeTab`）：面板会被状态推送频繁重绘，用户刚筛好的视图
     * 不该被一次重绘清掉。
     */
    private changeFilter = "all";    private viewTabs: Array<{
        id: ViewTabId;
        button: HTMLElement;
        panels: { changes: HTMLElement; history: HTMLElement };
        nav: HTMLElement;
    }> = [];    /** 视图自己发起的动作进行中。见 `run`。 */
    private acting = false;
    /** 视图已关闭：关闭后到达的定时器与状态推送都不该再画。 */
    private closed = false;
    private unsubscribe: (() => void) | undefined;

    /**
     * 正在进行的动作（由 service 推送，`idle` 表示没有）。见 `applyActivity`。
     *
     * 与 `latest` 那套**分开**：`onStatusChange` 推的是仓库状态，而它在动作
     * **进行中**不会变（`withActivity` 要等收尾才刷新一次）。所以「面板上看得见
     * 正在同步」只能靠 `onActivityChange` 这条独立的推送。
     */
    private activity: SyncActivity = IDLE_ACTIVITY;

    /** 动作横幅的容器；每轮渲染重建（见 `renderToolbar`）。 */
    private activityEl: HTMLElement | undefined;

    /**
     * 动作进行中要禁用的按钮（提交 / 拉取 / 推送 / 立即同步）。
     *
     * 不禁用也不坏（service 是串行队列），但用户会看到「点了没反应」——
     * 其实只是排在了后面。**刷新不在这一列**：它只读，同步中随时可点。
     */
    private actionButtons: ButtonComponent[] = [];

    /** 动作订阅的退订函数。见 `onActivityChange`。 */
    private unsubscribeActivity: (() => void) | undefined;

    /**
     * service 推过来的最近一次状态，以及「我们是否已经知道当前状态」。
     *
     * `hasStatus` 不能省：`undefined` 是个**有效结论**（不是仓库），
     * 光看 `latest === undefined` 分不出「读出来就是不是仓库」与「还没读过」。
     */
    private latest: RepoStatus | undefined;
    private hasStatus = false;

    /**
     * 正在进行的这次状态读取是**我们自己**发起的。
     *
     * 用来忽略「自己那次 refresh 的回声」：`refresh()` 会同步通知订阅者，
     * 而那一刻我们正在渲染里等它的返回值 —— 再安排一次重绘就是白跑一轮
     * （见 `currentStatus`）。
     */
    private ownRefresh = false;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly deps: SourceControlViewDeps
    ) {
        super(leaf);
    }

    getViewType(): string {
        return SYNC_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.deps.getT().sync.viewTitle;
    }

    getIcon(): string {
        return "git-fork";
    }

    /**
     * 打开面板。
     *
     * **这个方法必须立刻返回。** Obsidian 恢复布局时会 await 它，而这段等待
     * 记在启动的「Load layout」里 —— 任何 git 操作放在这里都是直接拖慢启动
     * （见类注释里的实测数字与那条 10 秒超时）。
     */
    async onOpen(): Promise<void> {
        this.closed = false;

        // 订阅要在首次渲染**之前**挂上：重活排在布局就绪之后，而那一刻
        // `sync.start()` 很可能已经推了一次状态 —— 早挂一次就能直接用上它。
        this.unsubscribe = this.deps.service.onStatusChange((status) => {
            this.latest = status;
            this.hasStatus = true;
            // 自己发起的动作：`run()` 结束时会安排一次重绘，两处都排会白跑一遍。
            if (this.acting) return;
            // 我们自己那次 refresh 的回声：它的返回值就在渲染手上。
            if (this.ownRefresh) return;
            this.requestRender();
        });

        /**
         * 动作订阅（2026-10-05，用户要求：「侧边栏同步时也要添加同步特效，
         * 不然用户不知道是否正在同步」）。
         *
         * **不整块重绘**：横幅是纯 DOM（转圈 + 阶段 + 进度条），一次 git 都不用跑。
         * 走 `requestRender()` 的话，一次「立即同步」会因为三个阶段的变化白跑
         * 三遍「分支 / 远端 / 体积 / 历史」（实测一次重绘 10 个 git 子进程，
         * 见类注释）。所以这里直接改那一小块。
         */
        this.activity = this.deps.service.currentActivity;
        this.unsubscribeActivity = this.deps.service.onActivityChange((activity) => {
            this.activity = activity;
            this.applyActivity();
        });

        // 首屏只画工具条 —— 一次 git 都不跑。
        this.renderShell();

        // 重活排到布局加载之后。已经就绪时 `onLayoutReady` 会立刻回调。
        this.afterLayoutReady(() => this.requestRender());
    }

    async onClose(): Promise<void> {
        // 先立起关闭标记：排在定时器里的那次重绘可能马上就醒（见 `requestRender`）。
        this.closed = true;
        this.dirty = false;
        // 倒计时那个每秒的表也要停掉：视图关了它还在跑的话，改的是一个已经脱离
        // 文档的节点（而且关一个开一个，表会越积越多）。
        this.stopCountdown();
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.unsubscribeActivity?.();
        this.unsubscribeActivity = undefined;
        this.contentEl.empty();
    }

    /**
     * 布局就绪后跑一次（已经就绪就立刻跑）。
     *
     * 为什么不直接 `setTimeout(0)`：那只是让出**当前这一轮**，布局加载还在进行中
     * 时它照样会插进去 —— 不再挡住 `onOpen` 的 await，但会和 Obsidian 自己的
     * 启动抢 CPU 与磁盘（这台机器上一次 `git status` 就是 300 ms）。
     * `onLayoutReady` 是 Obsidian 给插件的准确时机（已就绪时同步回调）。
     *
     * 拿不到 workspace 时退回 `setTimeout`：那只会发生在单测的替身上
     * （视图先于 app 就绪被构造，也没有真 git 要跑），不影响真机的时机。
     */
    private afterLayoutReady(run: () => void): void {
        // 类型上 `App.workspace.onLayoutReady` 一定存在；替身里不是（见上），
        // 所以按「可能没有」取。
        const workspace: { onLayoutReady?: (callback: () => void) => void } | undefined =
            this.app?.workspace;

        if (workspace?.onLayoutReady) {
            workspace.onLayoutReady(run);
            return;
        }
        window.setTimeout(run, 0);
    }

    /**
     * 首屏：只画工具条 + 一句「正在读取」。
     *
     * 工具条上的按钮不需要状态就能画（唯一依赖状态的是分支下拉，首屏空着，
     * 内容渲染时会补上），所以这一步是纯 DOM、零 git。
     */
    private renderShell(): void {
        this.contentEl.empty();
        void this.renderToolbar(this.contentEl, undefined);
        this.contentEl.createEl("p", {
            text: this.deps.getT().sync.loadingRepo,
            cls: "obsync-empty",
        });
    }

    /**
     * 安排一次重绘（同一轮里的多次请求合并成一次）。
     *
     * 三种情况分开处理，各自挡一个真实的问题：
     * - **正在渲染** → 只标脏，本轮结束后补跑。原来的守卫是把这种情况直接
     *   `return` 掉的，于是「渲染期间到来的新状态」永远不会被画出来；
     * - **已经排好** → 什么都不做（合并，这就是「一次动作一次重绘」）；
     * - 否则排进下一个宏任务。
     */
    private requestRender(): void {
        if (this.closed) return;
        if (this.rendering) {
            this.dirty = true;
            return;
        }
        if (this.scheduled) return;

        this.scheduled = true;
        window.setTimeout(() => {
            this.scheduled = false;
            // 定时器排好之后视图可能已经被关掉了。
            if (this.closed) return;
            void this.render();
        }, RENDER_COALESCE_MS);
    }

    /** 渲染整个面板；失败报出去，绝不留下一个没人管的 Promise 拒绝。 */
    private async render(): Promise<void> {
        if (this.closed || this.rendering) {
            if (this.rendering) this.dirty = true;
            return;
        }

        this.rendering = true;
        try {
            await this.renderContent();
        } catch (err) {
            // 渲染失败的症状是「面板一片空白」，而它本身是异步的 —— 不报出来
            // 用户在控制台之外拿不到任何线索。
            this.deps.service.deps.notifier.reportError(err);
        } finally {
            this.rendering = false;
            if (this.dirty) {
                this.dirty = false;
                this.requestRender();
            }
        }
    }

    /**
     * 当前该显示的状态。
     *
     * **优先用 service 推过来的那一份**：它是刚刚那次变化的结论，而我们自己
     * 再 `refresh()` 一次只会拿到同一个结果 —— 那是一次白跑的 `git status`
     * （实测 300 ms，见类注释）。只有「还没人推过」（面板先于任何刷新被打开）
     * 时才自己去读一次。
     */
    private async currentStatus(): Promise<RepoStatus | undefined> {
        if (this.hasStatus) return this.latest;

        const status = await this.readStatus();
        this.latest = status;
        this.hasStatus = true;
        return status;
    }

    /**
     * 自己去读一次状态（只有 `currentStatus` 的兜底路径与「刷新」按钮用它）。
     *
     * `force` 只给「刷新」按钮：service 那一层有 400 ms 的复用窗
     * （见 `STATUS_TTL_MS`），而用户点「刷新」的意思就是**现在**读一次 ——
     * 拿 400 ms 前的结论回答他，等于这个按钮时灵时不灵。
     */
    private async readStatus(force = false): Promise<RepoStatus | undefined> {
        this.ownRefresh = true;
        try {
            return await this.deps.service.refresh(force ? { force: true } : {});
        } finally {
            this.ownRefresh = false;
        }
    }

    /** 工具条上的「刷新」：真的去读一次状态，然后重绘。 */
    private async reload(): Promise<void> {
        await this.readStatus(true);
        this.requestRender();
    }

    private async renderContent(): Promise<void> {
        const { contentEl } = this;
        const t = this.deps.getT();

        // 状态先拿到：工具条里的分支下拉属于它，而「不是仓库」时那一格要空着
        // （没有分支可切，也不该显示一个假的当前分支）。
        const status = await this.currentStatus();

        contentEl.empty();
        await this.renderToolbar(contentEl, status);

        if (!status) {
            // 不是仓库时的**出路**：原来只有一句提示，用户只能自己去命令面板
            // 找「初始化仓库」。这里直接把入口放在眼前。
            const box = contentEl.createDiv({ cls: "obsync-view-empty" });
            box.createEl("p", { text: t.sync.notARepo, cls: "obsync-empty" });
            new Setting(box).addButton((button) =>
                button.setButtonText(t.sync.actInit).setCta().onClick(() => this.deps.onInitRepo())
            );
            return;
        }

        this.renderConflicts(contentEl, status);

        /**
         * 标签组（2026-10-04，用户要求：「各种列表可以以标签组切换的方式展示，
         * 可以避免冗长列表下需要频繁滚动」）。
         *
         * 此前「更改」与「最近提交」上下排在同一条滚动列里 —— 改动一多，想看历史
         * 就得先把改动滚过去，看完历史想点「暂存」又得滚回来。两者是**两个问题**
         * （「这一轮要提交什么」与「之前提交过什么」），本来就该各自占一屏。
         *
         * **冲突区留在标签之外**（上面 `renderConflicts`）：冲突是「现在就得处理」
         * 的状态，藏进标签页意味着用户可能看不到它 —— 那是这个面板最不能出的事。
         *
         * 两个面板都渲染、只显示当前那个（`is-active`）：这样每轮重绘的 git 调用
         * 与以前完全一致（`git log` 照旧每次渲染跑一次），而隐藏的那个不占高度。
         */
        const panels = this.renderViewTabs(contentEl, changeRows(status).length);
        await this.renderChanges(panels.changes, status);
        await this.renderHistory(panels.history);
        this.applyActiveTab(panels);
    }

    /**
     * 标签栏 + 两个内容面板。
     *
     * 计数挂在「更改」上（与设置页标签上的计数同一个做法）—— 侧边栏里一眼能看到
     * 有几处改动，不必先切到那一页。
     */
    private renderViewTabs(
        contentEl: HTMLElement,
        changeCount: number
    ): { changes: HTMLElement; history: HTMLElement } {
        const t = this.deps.getT();
        const nav = contentEl.createDiv({ cls: "obsync-tabs obsync-view-tabs" });
        const panels = {
            changes: contentEl.createDiv({ cls: "obsync-view-tabpanel" }),
            history: contentEl.createDiv({ cls: "obsync-view-tabpanel" }),
        };

        const tabs: Array<{ id: ViewTabId; label: string; count?: number }> = [
            { id: "changes", label: t.sync.sectionChanges(changeCount), count: changeCount },
            { id: "history", label: t.sync.sectionHistory },
        ];
        this.viewTabs = [];
        for (const tab of tabs) {
            const button = nav.createEl("button", { text: tab.label, cls: "obsync-tab" });
            if (tab.id === this.activeTab) button.addClass("is-active");
            button.addEventListener("click", () => {
                if (this.activeTab === tab.id) return;
                this.activeTab = tab.id;
                // **不重绘**：只换两个面板的可见性。重绘会白跑一遍分支/远端/体积/
                // 历史那几条 git 命令，而用户只是换看了一眼。
                this.applyActiveTab(panels, nav);
            });
            this.viewTabs.push({ id: tab.id, button, panels, nav });
        }
        return panels;
    }

    /** 把 `is-active` 落到当前标签与对应的面板上（切标签时只走这一步）。 */
    private applyActiveTab(
        panels: { changes: HTMLElement; history: HTMLElement },
        nav?: HTMLElement
    ): void {
        const bar = nav ?? this.viewTabs[0]?.nav;
        // 用自己记下的引用改类名，而不是 `nav.findAll("button…")`：
        // 一来不必依赖样式选择器，二来测试替身里没有 `findAll`。
        for (const entry of this.viewTabs) {
            if (entry.nav !== bar) continue;
            entry.button.toggleClass("is-active", entry.id === this.activeTab);
        }
        panels.changes.toggleClass("is-active", this.activeTab === "changes");
        panels.history.toggleClass("is-active", this.activeTab === "history");
    }

    // ── 工具条 ────────────────────────────────────────────────────────────

    /**
     * 顶部工具条：提交 / 拉取 / 推送、分支下拉、立即同步、刷新，**都在一行**。
     *
     * 这里原来是三行 ——「源码控制」标题 + 刷新按钮、四个动作、分支下拉各占一行。
     * 标题不携带任何信息（标签页上已经写着视图名了）却占掉侧边栏一行；分支下拉
     * 独占一行更是浪费 —— 侧边栏本来就窄，垂直空间才是稀缺的。
     *
     * **排布由用户定过三次**：2026-09-19 是「三个分步动作在左，立即同步在右，
     * 刷新在最右」；2026-10-04 又改了两处（原话：「将分支移到三个按钮前面展示。
     * 刷新按钮移到立即同步按钮前面展示」）——
     *
     * ```
     * [分支▾] [提交] [拉取] [推送] [刷新] ……… [立即同步] (下次同步 3:00)
     * ```
     *
     * - **分支在最前**：它决定「这三个动作作用在哪条分支上」，是前提，放在动作前面
     *   读起来才是「先看在哪、再决定做什么」；
     * - **刷新紧挨在立即同步前面**：两个都是「让面板动一下」的入口，挨着好找；刷新
     *   是随时可点的工具、立即同步是收尾那一下，先后也符合手感；
     * - 立即同步仍然靠右（`margin-left: auto`）—— 它是「一个顶三个」的那一下。
     *
     * 曾经这里还有第五个按钮「提交并推送」（= 立即同步去掉拉取）。用户判定它是
     * 多余的：立即同步已经是万全之策，而「不想拉取」的人用「提交」+「推送」
     * 两步就够 —— 于是连同命令与服务方法一起删掉了（别再加回来，除非有人
     * 真需要「不拉取」的单步动作）。
     *
     * 侧边栏窄，这些控件一行多半放不下 —— 交给 CSS（`.obsync-actions`）换行，
     * 总比溢出把控件挤没了好。
     *
     * 每个按钮都收进 `this.actionButtons`：动作进行中要把它们禁用（见
     * `applyActivity`）。工具条下面那一条 `.obsync-sync-banner` 是同步的**特效**
     * 落点 —— 按钮在哪，进度就在哪。
     */
    private async renderToolbar(
        contentEl: HTMLElement,
        status: RepoStatus | undefined
    ): Promise<void> {
        const t = this.deps.getT();

        // 每轮渲染重建这个列表：按钮是新造的，旧引用已经不挂在文档上了。
        this.actionButtons = [];

        const row = new Setting(contentEl).setClass("obsync-actions");

        // 分支在最前（它决定下面三个动作作用在哪条分支上）
        if (status) await this.addBranchDropdown(row, status);

        row.addButton((button) => {
            button
                .setButtonText(t.sync.actCommit)
                .setTooltip(t.sync.actCommitHint)
                .onClick(() =>
                    void this.run(() => this.deps.service.commitAll({ announce: true }))
                );
            this.actionButtons.push(button);
        });
        row.addButton((button) => {
            button
                .setButtonText(t.sync.actPull)
                .onClick(() => void this.run(() => this.deps.service.pull()));
            this.actionButtons.push(button);
        });
        row.addButton((button) => {
            button
                .setButtonText(t.sync.actPush)
                .setTooltip(t.sync.actPushHint)
                .onClick(() =>
                    void this.run(() => this.deps.service.push({ announceIfUpToDate: true }))
                );
            this.actionButtons.push(button);
        });

        // 刷新紧挨在立即同步前面（两个都是「让面板动一下」的入口）。
        // 2026-10-04 用户要求：「刷新按钮从图标改成文字吧，和前面三个按钮一样的样式展示」——
        // 图标按钮在侧边栏里太容易与「工具」混在一起，而这一排本来就是文字动作。
        row.addButton((button) =>
            button
                .setButtonText(t.sync.actRefresh)
                .setTooltip(t.sync.actRefresh)
                // 这是面板上唯一还会**主动去读一次 git** 的入口：其余重绘都
                // 直接吃 service 推过来的状态（见 `currentStatus`）。
                .onClick(() => void this.reload())
        );

        row.addButton((button) => {
            button
                .setButtonText(t.sync.actSync)
                .setTooltip(t.sync.actSyncHint)
                .setCta()
                .onClick(() =>
                    void this.run(() => this.deps.service.sync({ announceInSync: true }))
                );
            // 侧边栏够宽时用 `margin-left: auto` 把它顶到右侧（见 styles.css）——
            // 要的是「在右侧」这个位置，而不只是「排在后面」。
            button.buttonEl.addClass("obsync-action-sync");
            this.actionButtons.push(button);
        });

        // 动作横幅挂在工具条**正下方**：按钮在哪，进度在哪。
        // 没有动作时它是空的，由 CSS 的 `:empty` 整块收起来（不占高度）。
        this.activityEl = contentEl.createDiv({ cls: "obsync-sync-banner" });
        // 面板比动作晚打开的场合（同步已经在跑，或正好在渲染中间）——
        // 渲染结束时补画一次，横幅才不会等到下一个阶段才出现。
        this.applyActivity();
    }

    // ── 动作横幅（同步特效） ──────────────────────────────────────────────

    /**
     * 把「正在干什么」画到面板上（**纯 DOM，一次 git 都不跑**）。
     *
     * 三件事一起吃：
     *
     * 1. 根类 `obsync-syncing` —— CSS 用它给「立即同步」按钮加呼吸感；
     * 2. 四个动作按钮禁用 —— 同步中再点一次只会往队列里多排一个任务；
     * 3. 横幅本身：转圈 + 标题 +（链路里的）三个阶段 + 一根不确定进度条。
     *
     * 它会在**渲染进行中**被动作推送调起来，那时 `activityEl` 可能刚被
     * `contentEl.empty()` 摘掉 —— 写到一个脱离文档的节点上不会报错，只是看不见；
     * 而每轮渲染结束都会再调一次（见 `renderToolbar`），所以不会停在半路。
     *
     * 为什么是**不确定**进度条：git 不会报「推到第几个对象」，编一个百分比
     * 就是骗人。三个阶段本身才是真实可得的进度信息。
     */
    private applyActivity(): void {
        const t = this.deps.getT();
        const kind = this.activity.kind;
        const chain = this.activity.chain;
        const busy = kind !== "idle";

        this.contentEl.toggleClass("obsync-syncing", busy);
        for (const button of this.actionButtons) button.setDisabled(busy);

        const banner = this.activityEl;
        if (!banner) return;

        banner.empty();
        // 空横幅交给 CSS 的 `:empty`（不占高度、不占视线）。
        if (kind === "idle") return;

        const head = banner.createDiv({ cls: "obsync-sync-banner-head" });
        head.createSpan({ cls: "obsync-spinner" });
        head.createSpan({ text: busyTitle(t, kind, chain), cls: "obsync-sync-banner-title" });

        if (chain) {
            const steps = banner.createDiv({ cls: "obsync-sync-steps" });
            for (const stage of SYNC_STAGES) {
                steps.createSpan({
                    text: stage.label(t),
                    cls:
                        stage.kind === kind
                            ? "obsync-sync-step is-active"
                            : "obsync-sync-step",
                });
            }
        }

        const hint = busyHint(t, kind, chain);
        if (hint) banner.createDiv({ text: hint, cls: "obsync-sync-banner-hint" });

        banner.createDiv({ cls: "obsync-sync-progress" });
    }

    /**
     * 「距离下一次自动同步还有多久」的徽标（2026-10-04，用户要求）。
     *
     * ## 为什么放在工具条这一行
     *
     * 侧边栏的垂直空间是稀缺的（见 `renderToolbar` 的说明：这一行本身就是从三行
     * 压成一行省出来的），而工具条本来就是「同步相关动作与状态」的家 —— 徽标跟
     * `立即同步` / `刷新` 同一行，是它的自然位置。没开定时同步时它**完全不占位**
     * （`undefined` → 不创建元素）。
     *
     * ## 为什么每秒只改文字、不重绘
     *
     * 这个面板一次重绘要跑「分支 / 远端 / 体积 / 历史」好几条 git 命令，每秒重绘
     * 等于每秒几条子进程 —— 那是不能接受的。所以这里只更新一个 `span` 的文本，
     * 与设置页那个倒计时同一个手法（`settingsTab` 的 `startCountdown`）。
     *
     * 定时器在**每次重绘**时重建、并在 `onClose` 里停掉：不重建的话每次重绘都会再起
     * 一个永不停止的表（面板开着久了就是缓慢泄漏），它们守着的还是已经脱离文档的节点。
     */
    private renderCountdown(parent: HTMLElement): void {
        this.stopCountdown();
        if (this.deps.nextRunAt() === undefined) return;

        const el = parent.createSpan({
            cls: "obsync-badge obsync-countdown obsync-view-countdown",
        });
        const tick = (): void => {
            const nextRunAt = this.deps.nextRunAt();
            if (nextRunAt === undefined) {
                el.setText("");
                return;
            }
            const t = this.deps.getT();
            el.setText(
                this.deps.service.isBusy
                    ? t.settings.sync.countdownRunning
                    : t.settings.sync.countdown(formatCountdown(nextRunAt - Date.now()))
            );
        };
        tick();
        this.countdown = window.setInterval(tick, 1000);
    }

    private stopCountdown(): void {
        if (this.countdown === undefined) return;
        window.clearInterval(this.countdown);
        this.countdown = undefined;
    }

    /**
     * 分支下拉框 —— 工具条里没有「分支」两个字的位置了，所以那个标签挪到
     * `aria-label` 上：视觉上靠下拉框里的分支名自证，读屏仍然听得出它是什么。
     */
    private async addBranchDropdown(row: Setting, status: RepoStatus): Promise<void> {
        const t = this.deps.getT();
        const branches = await this.safeListBranches();

        row.addDropdown((dropdown) => {
            dropdown.selectEl.setAttribute("aria-label", t.sync.branchLabel);

            if (status.branch === null) {
                // 游离 HEAD：没有分支可切，但**这件事必须说出来** —— 这一格
                // 是它唯一的落点，藏起来的话用户只会觉得「少了点什么」。
                dropdown.addOption("", t.sync.detachedHeadLabel);
                dropdown.setValue("");
                dropdown.setDisabled(true);
                return;
            }
            const current = status.branch;

            if (branches.length === 0) {
                // 列不出分支（git 出错，或仓库还没有任何分支）。这时给一个
                // 能切的下拉框是**假象** —— 里面只有它自己，选了也不会有事发生。
                dropdown.addOption(current, current);
                dropdown.setValue(current);
                dropdown.setDisabled(true);
                return;
            }

            for (const branch of branches) dropdown.addOption(branch.name, branch.name);
            // 状态里的当前分支不一定在 listBranches 的结果里（别的窗口刚切过），
            // 少了这个补位，下拉框会显示成空的。
            if (!branches.some((branch) => branch.name === current)) {
                dropdown.addOption(current, current);
            }
            dropdown.setValue(current);
            // 走 service 而不是 git：切分支要排在同步队列里，否则可能与
            // 正在跑的拉取/提交并发写索引（视图原来就是直接调 git.checkout）。
            dropdown.onChange((value) =>
                void this.run(() => this.deps.service.checkoutBranch(value))
            );
        });
    }

    // ── 冲突 ──────────────────────────────────────────────────────────────

    private renderConflicts(contentEl: HTMLElement, status: RepoStatus): void {
        if (status.conflicted.length === 0) return;
        const t = this.deps.getT();

        new Setting(contentEl)
            .setName(t.sync.sectionConflicts(status.conflicted.length))
            .setDesc(t.sync.conflictHint)
            .setHeading()
            .addButton((button) =>
                button
                    .setButtonText(t.sync.actAbortMerge)
                    .setWarning()
                    .onClick(() => void this.run(() => this.deps.service.abortMerge()))
            );

        const list = contentEl.createDiv({ cls: "obsync-change-list" });
        for (const path of status.conflicted) {
            // 冲突行**不提供暂存开关**：`git add` 会让 git 认为冲突已解决，
            // 而这个面板看不到文件内容 —— 用户可能没改就把带 <<<<<<< 的文件
            // 暂存并提交上去。这里的职责是「告诉你哪些文件要处理 + 给你出路」。
            this.renderFileRow(list, { path, mark: "⚠", conflicted: true });
        }
    }

    // ── 更改列表 ──────────────────────────────────────────────────────────

    private async renderChanges(contentEl: HTMLElement, status: RepoStatus): Promise<void> {
        const t = this.deps.getT();
        const rows = changeRows(status);

        /**
         * 状态摘要 + 「体积 / 待提交」两栏**搬到了这一页**（2026-10-04 用户要求）。
         *
         * 它们回答的正是「更改」这一页的问题：我现在处于什么状态（与远端一致 /
         * 领先落后）、这一轮要提交多少、仓库多大。搬进来之后还省掉一句重复文案 ——
         * 列表为空时不需要再写一行「没有需要提交的更改。」，因为右边那一栏已经说了。
         *
         * **「下次同步」胶囊也挂在这一行**（同一天用户要求：「将下次同步胶囊下移到
         * 『与远端一致』同一行展示」）：两者都是「我现在处于什么状态」，摆在一行读起来
         * 才是同一件事；放在工具条上时它挤在动作按钮中间，看不出它说的是状态。
         */
        const summary = contentEl.createDiv({ cls: "obsync-state-row" });
        summary.createEl("p", {
            text: remoteStateText(status, t),
            cls: isFullyInSync(status)
                ? "obsync-remote-state obsync-remote-synced"
                : "obsync-remote-state",
        });
        this.renderCountdown(summary);

        // 体积两栏：仓库多大、这次要提交多少。两个问题不一样（见 repoSize.ts 的说明），
        // 但都是「一个标签 + 一个数值」，各占一行太浪费侧边栏的垂直空间 ——
        // 横向排成一行两栏（`.obsync-metrics` 是个 flex 容器）。
        // 取不到体积就写「读不到」—— 不编一个 0 B，那会被当成「空仓库」。
        const repoSize = await this.safeRepoSize();
        const pendingBytes = await this.deps.service.pendingChangeBytes(status);
        const metrics = contentEl.createDiv({ cls: "obsync-metrics" });
        new Setting(metrics)
            .setName(t.sync.repoSizeLabel)
            .setDesc(
                repoSize
                    ? t.sync.repoSizeDesc(formatBytes(repoSize.bytes), repoSize.objects)
                    : t.sync.sizeUnknown
            );
        new Setting(metrics)
            .setName(t.sync.pendingChangesLabel)
            .setDesc(
                rows.length === 0
                    ? t.sync.nothingToCommit
                    : t.sync.pendingChangesDesc(formatBytes(pendingBytes), rows.length)
            );

        // 没有改动时到此为止 —— **不再另写一句**（上面那栏就是那句话，见方法注释）。
        if (rows.length === 0) return;

        /**
         * 按**文件格式**筛选（2026-10-04 用户要求）。
         *
         * 原话：「我希望更改列表提供修改文件的格式筛选，尤其是 md 格式的文件，因为笔记同步
         * 主要还是同步的 md 文档」。库里的改动常常混着笔记与附件（图片、canvas、json…），
         * 而用户多数时候只想看笔记那几条。
         *
         * 形状用下拉而不是一排按钮：侧边栏窄，而选项是**这次改动里真实出现的格式**
         * （`.md` 单独一条，其余按扩展名各一条，带数量）—— 既覆盖「只看 md」这个主要诉求，
         * 也能筛出「只看这次的图片」。选项由数据生成，所以不会出现一个永远筛不出东西的入口。
         */
        const filter = this.renderChangeFilter(contentEl, rows);
        const visible = rows.filter((row) => matchesFilter(row, filter));
        if (visible.length === 0) {
            contentEl.createEl("p", { text: t.sync.filterEmpty, cls: "obsync-empty" });
            return;
        }

        const staged = visible.filter((row) => row.staged);
        const unstaged = visible.filter((row) => !row.staged);

        // 「已暂存」在前 —— 马上要被提交的是它们，用户最先想知道的是这个。
        this.renderChangeGroup(contentEl, t.sync.sectionStaged(staged.length), staged, true);
        this.renderChangeGroup(
            contentEl,
            t.sync.sectionChanges(unstaged.length),
            unstaged,
            false
        );
    }

    /**
     * 更改列表上方的「格式」筛选下拉；返回当前生效的筛选项（`all` 或某个扩展名）。
     *
     * 选中的值记在实例上（与 `activeTab` 同理）：面板会被状态推送频繁重绘，
     * 用户刚筛好的视图不该被一次重绘清掉。
     */
    private renderChangeFilter(contentEl: HTMLElement, rows: ChangeRow[]): string {
        const t = this.deps.getT();
        const options = changeFilterOptions(rows, {
            all: t.sync.filterAll,
            markdown: t.sync.filterMarkdown,
            noExtension: t.sync.filterNoExtension,
        });

        // 选项没了（比如刚提交完、或筛的那个格式这一轮没有改动）→ 回到「全部」，
        // 否则会停在一个下拉里根本没有的选项上。
        if (!options.some((option) => option.value === this.changeFilter)) {
            this.changeFilter = "all";
        }

        new Setting(contentEl)
            .setName(t.sync.filterLabel)
            .setClass("obsync-change-filter")
            .addDropdown((dropdown) => {
                for (const option of options) {
                    dropdown.addOption(option.value, option.label);
                }
                dropdown.setValue(this.changeFilter);
                dropdown.onChange((value) => {
                    this.changeFilter = value;
                    // 重绘整页：分组标题里的计数、空筛选提示都要跟着变。
                    // （这里不像标签切换那样能只换可见性 —— 分组是重新分出来的。）
                    this.requestRender();
                });
            });

        return this.changeFilter;
    }

    private renderChangeGroup(
        contentEl: HTMLElement,
        title: string,
        rows: ChangeRow[],
        staged: boolean
    ): void {
        if (rows.length === 0) return;
        const t = this.deps.getT();
        const paths = rows.map((row) => row.path);

        new Setting(contentEl)
            .setName(title)
            .setHeading()
            .addButton((button) =>
                button
                    .setButtonText(staged ? t.sync.actUnstageAll : t.sync.actStageAll)
                    .onClick(() =>
                        void this.run(() =>
                            staged
                                ? this.deps.service.unstageFiles(paths)
                                : this.deps.service.stageFiles(paths)
                        )
                    )
            );

        const list = contentEl.createDiv({ cls: "obsync-change-list" });

        // 认出嵌套仓库时**顺手解释一句**（2026-10-04）。这三个反直觉之处
        // （暂存不掉、没有文件级差异、消不掉）用户一个人猜不出来 ——
        // 而面板是唯一能说这句话的地方。
        if (rows.some((row) => row.nestedRepo)) {
            list.createEl("p", {
                text: t.sync.nestedRepoHint,
                cls: "obsync-nested-hint",
            });
        }

        for (const row of rows) {
            this.renderFileRow(list, {
                path: row.path,
                mark: markOf(row.status),
                staged: row.staged,
                nestedRepo: row.nestedRepo,
            });
        }
    }

    /**
     * 一行文件：状态位 + 可点开的文件名 + 「查看差异」+「在远端打开」+「暂存 / 取消暂存」。
     *
     * 用 `Setting` 而不是裸 DOM：控件由 Obsidian 渲染，主题、键盘、无障碍
     * 都不用自己管；测试里也能直接驱动这些控件（`createdSettings` 那套）。
     *
     * 「查看差异」排在最前：它是「这个文件变了」之后最自然的下一步，
     * 也是这一行上唯一能回答「变了什么」的按钮 —— 其余三个都是「打开 / 挪一格」。
     */
    private renderFileRow(list: HTMLElement, spec: FileRowSpec): void {
        const t = this.deps.getT();
        const row = new Setting(list).setClass("obsync-change-row");
        // 一次只传一个类名：`setClass` 最终落到 `classList.add()`，
        // 而带空格的字符串在真实 DOM 里会抛 InvalidCharacterError。
        if (spec.conflicted) row.setClass("obsync-conflict");

        // 文件名做成可点的 —— 点开对应笔记去改，是看到「这个文件变了」之后
        // 最自然的下一步。这里重建 nameEl 的内容只是为了把状态位和路径分成
        // 两个元素（一个带样式、一个可点）。
        row.nameEl.empty();
        row.nameEl.createSpan({ text: spec.mark, cls: "obsync-change-mark" });
        const link = row.nameEl.createSpan({ text: spec.path, cls: "obsync-change-path" });
        link.setAttribute("title", t.sync.actOpenFile);
        link.addEventListener("click", () => void this.openFile(spec.path));

        /**
         * 嵌套仓库行（gitlink）**换一套按钮**（2026-10-04）。
         *
         * 对 gitlink，原来那三个按钮有两个是空的或误导的：`git diff` 对 gitlink
         * 输出为空（实测）、`git add` 也暂存不下任何东西（指针没变）—— 用户点了
         * 「暂存」看不出任何反应，只会以为插件坏了。所以这里只留一个真正能了结
         * 这件事的动作：「不再跟踪」（摘索引 + 写进 .gitignore，本地文件不动）。
         */
        if (spec.nestedRepo) {
            row.nameEl.createSpan({
                text: t.sync.nestedRepoBadge,
                cls: "obsync-badge obsync-badge-kind obsync-nested-badge",
            });
            row.addExtraButton((button) =>
                button
                    .setIcon("unlink")
                    .setTooltip(t.sync.nestedRepoUntrack)
                    .onClick(() => this.untrackNestedRepo(spec.path))
            );
            return;
        }

        // 冲突行也给差异入口：那里正是最需要看清内容的地方（只读，不会替用户
        // 做任何决定 —— 暂存开关仍然不给）。
        row.addExtraButton((button) =>
            button
                .setIcon("file-diff")
                .setTooltip(t.sync.actDiff)
                .onClick(() => this.openFileDiff(spec.path))
        );

        row.addExtraButton((button) =>
            button
                .setIcon("external-link")
                .setTooltip(t.sync.actOpenFileOnRemote)
                .onClick(() => this.deps.onOpenFileOnRemote(spec.path))
        );

        if (spec.staged === undefined) return;

        const staged = spec.staged;
        row.addExtraButton((button) =>
            button
                .setIcon(staged ? "minus" : "plus")
                .setTooltip(staged ? t.sync.actUnstage : t.sync.actStage)
                .onClick(() =>
                    void this.run(() =>
                        staged
                            ? this.deps.service.unstageFiles([spec.path])
                            : this.deps.service.stageFiles([spec.path])
                    )
                )
        );
    }

    // ── 最近提交 ──────────────────────────────────────────────────────────

    private async renderHistory(contentEl: HTMLElement): Promise<void> {
        const t = this.deps.getT();
        // **没有标题行**：标签页上已经写着「最近提交」，再来一行同名标题纯属多余
        // （2026-10-04 用户要求去掉）。侧边栏的垂直空间本来就稀缺。

        const commits = await this.safeLog();
        if (!commits) {
            contentEl.createEl("p", { text: t.sync.historyFailed, cls: "obsync-empty" });
            return;
        }
        if (commits.length === 0) {
            contentEl.createEl("p", { text: t.sync.historyEmpty, cls: "obsync-empty" });
            return;
        }

        const list = contentEl.createDiv({ cls: "obsync-history" });
        for (const commit of commits) {
            const row = list.createDiv({ cls: "obsync-commit" });

            // hash 与「看差异」同一行：提交行是三段堆叠的（hash / 信息 / 作者），
            // 把差异按钮单独放会再占一行 —— 侧边栏里那一行太贵了。
            const head = row.createDiv({ cls: "obsync-commit-head" });

            const hash = head.createSpan({ text: commit.shortHash, cls: "obsync-commit-hash" });
            hash.setAttribute("title", t.sync.commitOnRemote);
            hash.addEventListener("click", () => this.deps.onOpenCommitOnRemote(commit.hash));

            const diff = head.createSpan({ cls: "obsync-commit-diff" });
            setIcon(diff, "file-diff");
            diff.setAttribute("title", t.sync.actDiffCommit);
            diff.addEventListener("click", () => this.openCommitDiff(commit));

            // 提交信息只取第一行：`git log` 的 message 可能是多行的
            // （合并提交、用户写了正文），面板里塞不下。
            row.createSpan({
                text: commit.message.split("\n")[0] ?? "",
                cls: "obsync-commit-message",
            });
            row.createSpan({
                text: `${commit.author} · ${shortDate(commit.date)}`,
                cls: "obsync-commit-meta",
            });
        }
    }

    // ── 差异 ──────────────────────────────────────────────────────────────

    /**
     * 打开某个文件的差异。
     *
     * 两节都取（工作区 + 已暂存）—— 同一个文件完全可能两边都有改动，
     * 只给一边等于把另一半藏起来（见 `FileDiffSet` 的说明）。
     */
    private openFileDiff(path: string): void {
        this.deps.openDiff({ kind: "file", target: path });
    }

    /** 打开某条提交引入的改动。 */
    private openCommitDiff(commit: CommitInfo): void {
        // 只写 hash 认不出是哪一条 —— 把信息第一行一起放上（与列表里一致）。
        this.deps.openDiff({
            kind: "commit",
            target: commit.hash,
            label: `${commit.shortHash}  ${commit.message.split("\n")[0] ?? ""}`.trim(),
        });
    }

    // ── 动作与容错 ────────────────────────────────────────────────────────

    /**
     * 跑一个动作，然后重绘面板。
     *
     * **错误必须在这里报出去。** `SyncService` 只对「拉取冲突」与「没有远端」
     * 两种情况做了提示，其余错误（推送被拒、鉴权失败、找不到 git、网络问题）
     * 会原样上抛。早先这里静默吞掉，症状是：用户在视图里点「推送」，
     * 远端拒绝了，**界面上什么都不会发生** —— 连一句提示都没有。
     *
     * `acting` 标志让状态订阅在这期间不重绘：动作结束后的那次重绘就够，
     * 两处都渲染会白跑一遍。而这里**只安排重绘、不再自己读状态** ——
     * `withActivity` 收尾已经读过一次并把新状态推过来了（见 `currentStatus`）。
     */
    private async run(action: () => Promise<unknown>): Promise<void> {
        this.acting = true;
        try {
            await action();
        } catch (err) {
            this.deps.service.deps.notifier.reportError(err);
        } finally {
            this.acting = false;
        }
        this.requestRender();
    }

    /**
     * 「不再跟踪」一个嵌套仓库（2026-10-04）。
     *
     * 两件事一起做（`service.untrackAndIgnore`）：摘索引 + 写进 `.gitignore`。
     * **只摘索引是不够的** —— 下一轮自动同步的 `git add -A` 会把 gitlink 加回来，
     * 而那正是它当初进索引的方式。
     *
     * 不弹确认框：这个动作**不丢任何东西**（gitlink 里从来没有文件内容，
     * 嵌套仓库自己的历史与工作区都在），而且 `git add` 随时能加回来。
     * 但要把结果说清楚：摘了什么、文件为什么还在。
     */
    private async untrackNestedRepo(path: string): Promise<void> {
        const t = this.deps.getT();
        await this.run(async () => {
            await this.deps.service.untrackAndIgnore([path]);
            this.deps.service.deps.notifier.success(t.sync.nestedRepoUntracked);
        });
    }

    /** 在 Obsidian 里打开库里某个路径。 */
    private async openFile(path: string): Promise<void> {
        try {
            await this.app.workspace.openLinkText(path, "", false);
        } catch (err) {
            // 文件可能刚被删掉（状态是几秒前的），这时报出来比静默好 ——
            // 用户点了却没反应，只会以为面板坏了。
            this.deps.service.deps.notifier.reportError(err);
        }
    }

    private async safeListBranches(): Promise<Array<{ name: string; current: boolean }>> {
        try {
            return await this.deps.git.listBranches();
        } catch {
            return [];
        }
    }

    private async safeLog(): Promise<CommitInfo[] | undefined> {
        try {
            return await this.deps.git.log(HISTORY_LIMIT);
        } catch {
            return undefined;
        }
    }

    /** 仓库体积；读不到时 undefined（面板显示「读不到」而不是编一个 0）。 */
    private async safeRepoSize(): Promise<RepoSize | undefined> {
        try {
            return await this.deps.git.repoSize();
        } catch {
            return undefined;
        }
    }
}

// ── 纯函数（可直接单测） ────────────────────────────────────────────────────

/** 渲染一行文件所需的全部信息。`staged` 为 undefined 表示不给暂存开关。 */
interface FileRowSpec {
    path: string;
    mark: string;
    staged?: boolean;
    conflicted?: boolean;
    /** 索引里记的是嵌套仓库（gitlink）—— 换一套按钮，见 `renderFileRow`。 */
    nestedRepo?: boolean;
}

/**
 * 「本地和远端差多少」这一行的文案。
 *
 * `ahead` / `behind` 为 null 的语义是**没有 upstream**（见 `RepoStatus` 的注释），
 * 不是「0 个」—— 把它当 0 显示成「与远端一致」就正好说反了：那可能是
 * 一个从没推送过的分支，本地有几十个提交远端一个都没有。
 *
 * ## 不领先不落后**还不够**（2026-10-04 用户指出）
 *
 * 原话：「『与远端一致』在有新更改的时候，只是颜色不同，显示的文本依旧是『与远端一致』，
 * 文案描述并不准确」。确实：`ahead = behind = 0` 只说明**已提交的部分**对齐了，
 * 而工作区里可能躺着一堆没提交的改动 —— 那时说「与远端一致」是错的（用户会以为
 * 可以关电脑了）。所以这一档文案拆成两句：
 *
 * - 干净 → 「与远端一致」（这一行还会标绿）；
 * - 有未提交的改动 → 「与远端一致，但有未提交的改动」（**不标绿**）。
 *
 * 判据与 `isFullyInSync` 同一套（`changeRows` 为空才算干净）—— 状态栏那个 `✓`
 * 与同步结束时的提示也用它，三处必须给出同一个答案。
 */
export function remoteStateText(status: RepoStatus, t: LocaleStrings): string {
    if (status.ahead === null || status.behind === null) return t.sync.noUpstreamHint;

    const parts: string[] = [];
    if (status.ahead > 0) parts.push(t.sync.aheadOf(status.ahead));
    if (status.behind > 0) parts.push(t.sync.behindOf(status.behind));
    if (parts.length > 0) return parts.join(" · ");
    return changeRows(status).length === 0
        ? t.sync.inSyncWithRemote
        : t.sync.inSyncWithPendingChanges;
}

/**
 * 动作横幅上的三个阶段（「立即同步」那条链路）。
 *
 * 阶段名直接用**工具条上那三个按钮**的字（提交 / 拉取 / 推送）：用户在按钮上
 * 刚点过它们，横幅上再看到同样的词，两边一眼就对得上，不必再造一套说法。
 *
 * 顺序就是链路顺序 —— `chain` 为真时按它画三个胶囊，亮的是当前那一个。
 */
export const SYNC_STAGES: Array<{ kind: BusyActivity; label: (t: LocaleStrings) => string }> = [
    { kind: "committing", label: (t) => t.sync.actCommit },
    { kind: "pulling", label: (t) => t.sync.actPull },
    { kind: "pushing", label: (t) => t.sync.actPush },
];

/**
 * 横幅标题。
 *
 * 链路里三个阶段**共用一个标题**（「正在同步…」）：当前走到哪一步由下面那排
 * 胶囊回答。分开写三句的话，标题与胶囊说的就是同一件事，反而看不出「这是一条链」。
 */
export function busyTitle(t: LocaleStrings, activity: BusyActivity, chain: boolean): string {
    if (chain) return t.sync.statusSyncing;
    if (activity === "pulling") return t.sync.statusPulling;
    if (activity === "pushing") return t.sync.statusPushing;
    return t.sync.statusCommitting;
}

/**
 * 横幅副标题 —— 复用按钮上的那句悬停提示（「提交 → 拉取 → 推送，一条链走完」）。
 *
 * 链路里那句话正好回答了「同步到底做了什么」；单独动作各用各的。
 * **拉取没有对应的提示**（工具条上它本来也没写 tip），返回 undefined ——
 * 宁可不画这一行，也不编一句话。
 */
export function busyHint(
    t: LocaleStrings,
    activity: BusyActivity,
    chain: boolean
): string | undefined {
    if (chain) return t.sync.actSyncHint;
    if (activity === "committing") return t.sync.actCommitHint;
    if (activity === "pushing") return t.sync.actPushHint;
    return undefined;
}

/** ISO 时间 → 简短的本地时间（`YYYY-MM-DD HH:mm`）。解不出来的原样返回。 */
export function shortDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    const pad = (value: number): string => String(value).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

function markOf(status: FileChangeStatus): string {
    switch (status) {
        case "added":
            return "A";
        case "modified":
            return "M";
        case "deleted":
            return "D";
        case "renamed":
            return "R";
        case "conflicted":
            return "⚠";
        default:
            return "?";
    }
}
