import {
    PluginSettingTab,
    Setting,
    setIcon,
    type App,
    type ButtonComponent,
    type TextComponent,
} from "obsidian";
import { type LocaleStrings } from "./core/i18n";
import { logger } from "./core/logger";
import { DEFAULT_SETTINGS } from "./core/settings";
import { pickFile } from "./core/desktopFileDialog";
import { formatCountdown } from "./features/sync/countdown";
import { bindRemoteInput } from "./features/sync/remoteEditor";
import { SYNC_EXTENSIONS } from "./features/images/imageScan";
import {
    extensionIgnoreRules,
    ignoreRuleFor,
    isImagePath,
    mergeRuleLines,
} from "./features/sync/imagesIgnore";
import {
    ConfirmUntrackImagesModal,
    type UntrackMode,
} from "./features/sync/ui/ConfirmUntrackImagesModal";
import { normalizeFolders } from "./features/images/imageScan";
import {
    FolderSuggestModal,
    filterFolderOptions,
    folderOptions,
    type FolderOption,
} from "./features/images/ui/FolderSuggestModal";
import type { ImageSyncService } from "./features/images/imageSyncService";
import type { SyncPlan, SyncSummary } from "./features/images/types";
import type {
    DiagnosticCheck,
    DiagnosticsReport,
} from "./features/sync/types";
import { describeSelfState } from "./features/installer/selfUpdate";
import { shouldCheckOnSettingsOpen } from "./features/installer/updateChecker";
import type { SelfUpdateCheck } from "./features/installer/types";
import { renderTrackedItems } from "./features/installer/ui/TrackedItemsList";
import type ObsyncPlugin from "./main";
import { getHost } from "./host/hostRegistry";
import { SUPPORTED_HOSTS, type HostKind } from "./host/types";

/**
 * 设置页的五个标签页。
 *
 * 顺序即显示顺序。把「插件与主题」放第一页：用户进设置页多半是想看
 * 哪个有更新、或再装一个，而不是来调开关的。
 *
 * 「图片同步」紧跟在「仓库同步」后面：两者都是「把库里的东西同步到远端」，
 * 用户找它们时的心智是连着的 —— 中间插一个「通用」会让它变得难找。
 */
type SettingsTabId = "tracked" | "installer" | "sync" | "images" | "general";

/**
 * 设置页。
 *
 * 与参考项目 BRAT 的一个明显不同：BRAT 的 `SettingsTab.ts` 有 30KB，
 * 并且**新旧两套渲染方式并存**（声明式的 `getSettingDefinitions()` 与
 * 手写的 `display()`），因为要兼容不同 Obsidian 版本。这里只用后者 ——
 * 兼容包袱不值得背。
 *
 * ## 进入设置页自动检查更新
 *
 * Obsidian 每次打开页签都会调用 `display()`，关闭时调用 `hide()` ——
 * 用这两个时机区分「用户打开了设置页」与「页内重绘」（commit/refresh 也会
 * 调 display()）。再加一层时间节流（见 shouldCheckOnSettingsOpen），
 * 避免反复开合把接口配额打光。
 */
export class ObsyncSettingsTab extends PluginSettingTab {
    /** 页签当前是否打开（用于识别 display() 是「打开」还是「重绘」）。 */
    private tabOpen = false;

    /** 当前选中的标签页。显示顺序即数组顺序（见 renderTabs）。 */
    private activeTab: SettingsTabId = "tracked";

    /**
     * 打开设置页时发现的「重复插件 id」条目（列表上方据此给出警告）。
     *
     * 实测坑：`plugins/` 里多出一份同 id 的残留备份，Obsidian 重启后加载了那份
     * 旧版本，而 SyncHub 记录里还写着新版本 —— 更新检查永远报「已是最新」。
     * 这种状态只能靠人清理，所以必须摆到界面上，而不是只写进日志。
     */
    private duplicateFolders: Array<{ name: string; count: number }> = [];

    /**
     * 页面上正在跑的倒计时刷新器（`window.setInterval` 的 id）。
     *
     * 记下来是为了**能清掉**：`display()` 每次都会重建整页 DOM，而 `hide()` 是
     * 用户关掉这一页。不清的话每重绘一次就多一个永不停止的 interval，而且它守着
     * 的是已经脱离文档的节点 —— 页面开着久了就是一个缓慢的泄漏。
     */
    private countdowns: number[] = [];

    /**
     * 上次问出来的「这个库是不是 git 仓库」（`undefined` = 还没问过 / 没问出来）。
     *
     * 2026-10-06 用户要求：「监测过已经是 git 仓库的话，每次点进仓库同步设置页就
     * 不用再主动检测了，直接将标识固定就行，等同步时再验证即可」。那一行原来每次
     * 重绘都起一个 `git is-repo` 子进程，结果回来才填徽标 —— 于是每次切进这一页都
     * 能看到徽标「弹」出来（见 `renderInitRow`）。
     *
     * ## 为什么只在内存里，不落盘
     *
     * 这个值**会变**：用户可能在别处 `rm -rf .git`、也可能从别的设备同步回来一个
     * 还没初始化的库。写进 `data.json` 的话，那种情况下它就是一句没人会去纠正的
     * 假话。只放内存 → 重启插件后重新问一次，代价是一次子进程。
     *
     * 用户也认了这一点：「等同步时再验证即可」—— 真的不是仓库时，同步链路自己会报
     * 「请先初始化仓库」，那比一个徽标更靠得住。
     */
    private vaultIsRepo?: boolean;

    constructor(private readonly obsync: ObsyncPlugin) {
        super(obsync.app, obsync);
    }

    display(): void {
        const justOpened = !this.tabOpen;
        this.tabOpen = true;

        // 先清掉上一轮重绘留下的倒计时（见 `countdowns`）。
        this.stopCountdowns();

        const { containerEl } = this;
        containerEl.empty();
        // 样式作用域标记：下面的规则都挂在 .obsync-settings 下，
        // 避免污染 Obsidian 与其他插件的设置页（.setting-item-* 是全局类）。
        containerEl.addClass("obsync-settings");

        this.renderTabs();

        switch (this.activeTab) {
            case "tracked":
                this.renderTrackedTab();
                break;
            case "installer":
                this.renderInstaller();
                break;
            case "sync":
                this.renderSync();
                break;
            case "images":
                this.renderImages();
                break;
            case "general":
                this.renderGeneral();
                break;
        }

        if (justOpened) {
            void this.autoCheckOnOpen();
            void this.reconcileOnOpen();
        }
    }

    /**
     * 打开设置页并停靠「通用」标签。
     *
     * 功能区头像点它就走这条（2026-10-09 用户要求：「点击后打开设置窗口，
     * 跳转插件通用设置页」）。顺序很重要：**先把 `activeTab` 定下来再开窗** ——
     * Obsidian 是在页签被选中的那一刻调 `display()` 的，那时读的就是这个值。
     *
     * `tabOpen` 那条路是给「设置窗已经开着」用的：就地重绘，不再开一次窗。
     * 头像被点时其实走不到（设置模态框挡着功能区），但将来从别处调也一样对。
     */
    openGeneral(): void {
        this.activeTab = "general";
        if (this.tabOpen) {
            this.display();
            return;
        }
        this.obsync.openSettings();
    }

    /**
     * 打开设置页时用**磁盘上的事实**校正记录里的版本号。
     *
     * 记录里的 `installedVersion` 是装的那一刻的快照，之后被别的工具改过、被同步回来
     * 的旧文件覆盖过，它都不会知道 —— 于是更新检查拿着过期版本去比远端，永远报
     * 「已是最新」。这里顺手校正并告知用户（不静默改数据）。
     */
    private async reconcileOnOpen(): Promise<void> {
        const t = this.obsync.t;
        try {
            const { corrected, duplicated } =
                await this.obsync.installer.service.reconcileInstalledVersions();

            const duplicatesChanged =
                JSON.stringify(duplicated) !== JSON.stringify(this.duplicateFolders);
            this.duplicateFolders = duplicated;

            if (corrected.length > 0) {
                this.obsync.notifier.info(t.installer.versionCorrected(corrected.join("、")));
            }
            // 有变化才重绘：`display()` 这一次的 `justOpened` 已是 false，不会递归。
            if (corrected.length > 0 || duplicatesChanged) this.display();
        } catch (err) {
            // 校正失败不该影响设置页。
            logger.debug("could not reconcile installed versions", err);
        }
    }

    /**
     * 关掉设置页时收尾。
     *
     * `tabOpen = false` 让下次打开重新走一遍「打开时」的动作（校正版本、查更新）；
     * `stopCountdowns()` 停掉「定时同步」那一行上的倒计时刷新器 —— 页面都不在了，
     * 每秒还去改一个脱离文档的节点是纯浪费（见 `countdowns`）。
     */
    hide(): void {
        this.tabOpen = false;
        this.stopCountdowns();
        super.hide();
    }

    /**
     * 标签栏。
     *
     * Obsidian 的 PluginSettingTab 没有内建分页，自己画一条 ——
     * 用普通 button 而不是 Setting，因为它们只是导航，不承载设置语义。
     * 选中项存在内存里：页内重绘（改设置、刷新列表）后仍停在原标签，
     * 不会把用户弹回第一页。
     */
    private renderTabs(): void {
        const t = this.obsync.t;
        const tabs: Array<{ id: SettingsTabId; label: string }> = [
            { id: "tracked", label: t.settings.tabs.tracked },
            { id: "installer", label: t.settings.tabs.installer },
            { id: "sync", label: t.settings.tabs.sync },
            { id: "images", label: t.settings.tabs.images },
            { id: "general", label: t.settings.tabs.general },
        ];

        const nav = this.containerEl.createDiv({ cls: "obsync-tabs" });
        for (const tab of tabs) {
            const button = nav.createEl("button", {
                text: tab.label,
                cls: "obsync-tab",
            });
            if (tab.id === this.activeTab) button.addClass("is-active");

            if (tab.id === "tracked") this.renderTrackedCounts(button);
            if (tab.id === "installer") this.renderInstallerBadge(button);

            button.addEventListener("click", () => {
                if (this.activeTab === tab.id) return;
                this.activeTab = tab.id;
                // 切标签不触发自动检查（tabOpen 已为 true），只换内容。
                this.display();
            });
        }
    }

    /**
     * 在「已追踪插件」标签上挂计数。
     *
     * 有可更新项时用强调色 —— 用户不必点进去就知道有几处要处理。
     */
    private renderTrackedCounts(button: HTMLElement): void {
        const installer = this.obsync.settings.installer;
        const tracked = installer.tracked.length;
        if (tracked === 0) return;

        button.createSpan({ text: String(tracked), cls: "obsync-tab-count" });

        const updates = Object.keys(installer.availableUpdates).length;
        if (updates > 0) {
            button.createSpan({
                text: `${updates}`,
                cls: "obsync-tab-count is-update",
            });
        }
    }

    /**
     * 在「插件安装器」标签上挂数字徽标：**SyncHub 自己有可用更新**时显示。
     *
     * 2026-10-06 用户要求（与同一轮「进入设置页时也检查 SyncHub 自身」配套）：
     * 那个更新藏在设置页第二页里，不点进去就不知道 —— 与「已追踪插件」那个
     * 计数徽标同一个目的：**不必点进去就知道有东西要处理**。
     *
     * 数据来自 `installer.selfUpdateAvailable`（持久化，见
     * `InstallerService.recordSelfUpdateCheck`），所以重启之后徽标还在，
     * 不必等这一轮检查跑完。
     *
     * 只写 `1`：这一页上「要处理的事」只有 SyncHub 自身这一件
     * （跟踪列表那些归「已追踪插件」页，它有自己的徽标）。写成 `1` 而不是版本号，
     * 是因为标签栏上那点位置放不下版本号，而徽标的职责只是「这里有东西」——
     * 具体版本在那一行的状态文字里。
     */
    private renderInstallerBadge(button: HTMLElement): void {
        if (!this.obsync.settings.installer.selfUpdateAvailable) return;
        button.createSpan({ text: "1", cls: "obsync-tab-count is-update" });
    }

    /** 标签一：插件与主题 —— 主操作按钮行 + 列表。 */
    private renderTrackedTab(): void {
        const t = this.obsync.t;

        /**
         * 主操作按钮行。
         *
         * 2026-10-05 用户要求两件事：
         *
         * 1. **「把这排按钮的卡片去掉，只留按钮展示」** —— 这一行原来是一个
         *    `.obsync-section-header` 卡片：左边「已跟踪的插件与主题」标题 + 说明，
         *    右边四个按钮。页签名已经叫「插件与主题」、列表下方还有一句空状态提示，
         *    标题与说明都是重复信息，所以**连同卡片一起去掉了**（那两个 locale 键
         *    也删了 —— `pnpm check` 的「未使用的 i18n 键」会盯着这件事）。
         *    外观由 `.obsync-tracked-actions` 负责（背景/边框/内边距全部重置）。
         * 2. **「在文本前面添加 lucide 图标」**（绑定用 `link`、检查更新用
         *    `refresh-cw`）—— 见 `addButtonIcon` 的说明：Obsidian 的
         *    `setButtonText` 与 `setIcon` 不能连用。
         *
         * 用 `Setting` 而不是裸 `new ButtonComponent(...)`：设置页的按钮一律经它创建，
         * 因为「点了没反应」那类问题在测试里靠 `createdSettings` 找按钮 ——
         * 直接 new 出来的按钮对那套断言是不可见的。
         */
        const actions = new Setting(this.containerEl).setClass("obsync-tracked-actions");

        actions.addButton((button) =>
            button
                .setButtonText(t.installer.modalTitle)
                .setCta()
                // 装完立刻重绘列表 —— 否则新条目要等下一次「检查更新」
                // 顺带的那次重绘才出现（用户以为没装上）。
                .onClick(() => this.obsync.installer.openAddRepoModal(() => this.display()))
        );

        // 「添加主题仓库」是 2026-10-05 加的独立入口：在此之前主题**没有新装入口**
        // （只有「绑定库里已装的」与「更新已跟踪的」），而把主题地址填进上面
        // 那个按钮只会得到「缺少必需文件：main.js」。
        actions.addButton((button) =>
            button
                .setButtonText(t.installer.addTheme)
                .onClick(() => this.obsync.installer.openAddThemeModal(() => this.display()))
        );

        actions.addButton((button) => {
            button
                .setButtonText(t.installer.bindTitle)
                .onClick(() => this.obsync.installer.openBindExistingModal(() => this.display()));
            addButtonIcon(button, "link");
        });

        actions.addButton((button) => {
            /**
             * 「检查更新」在跑的时候要把文字换成「正在检查更新…」（用户得知道它在动，
             * 见原来的注释），而 `setButtonText` 会把按钮**清空** —— 所以每次换文字
             * 都要把图标重新插一次（这也是 `addButtonIcon` 的调用约定）。
             */
            const relabel = (label: string): void => {
                button.setButtonText(label);
                addButtonIcon(button, "refresh-cw");
            };

            relabel(t.installer.checkAll);
            button.onClick(async () => {
                // 检查要逐个仓库打接口，可能好几秒 —— 得让用户知道在跑。
                // 旁边的「测试」令牌按钮就是这么做的，保持一致。
                button.setDisabled(true);
                relabel(t.installer.checking);
                try {
                    await this.checkAllUpdates();
                } finally {
                    button.setDisabled(false);
                    relabel(t.installer.checkAll);
                }
            });
        });

        // 重复 id 警告放在列表**上方**：它说的是「你看到的不一定是你跑的」，
        // 放在列表下面会被当成脚注忽略掉。
        for (const duplicate of this.duplicateFolders) {
            this.containerEl.createEl("p", {
                cls: "obsync-duplicate-warning",
                text: t.installer.duplicateFolders(duplicate.name, duplicate.count),
            });
        }

        renderTrackedItems(this.containerEl, {
            app: this.obsync.app,
            t,
            service: this.obsync.installer.service,
            checker: this.obsync.installer.checker,
            getTracked: () => this.obsync.settings.installer.tracked,
            // 键是 `<kind>:<id>`（见 availableUpdateKey）—— 插件 id 与主题目录名
            // 是两个命名空间，用裸 id 会让两者互相覆盖。
            getUpdateFor: (key) => this.obsync.settings.installer.availableUpdates[key],
            // 疑似镜像的提议：**列出来等用户确认**，绝不自动采用（见
            // installer.mirrorSuggestions 的注释与 ConfirmMirrorModal 的警告）。
            getMirrorSuggestion: (key) =>
                this.obsync.settings.installer.mirrorSuggestions[key],
            refresh: () => this.display(),
        });
    }

    /**
     * 打开设置页时的自动检查（受设置与节流控制）。
     *
     * ## 两件事一起做（2026-10-06 用户要求）
     *
     * 用户的原话是「打开该设置项时，进入设置页检查更新的同时也检查 SyncHub 自身」。
     * 在此之前这里只查跟踪列表，自己那一份得手动点「检查更新」才会查 —— 于是
     * 「插件安装器」标签上的徽标永远不会自己出现。
     *
     * 自己那一份**不受「有没有跟踪项」影响**：它跟跟踪列表没有关系，一个插件都没
     * 跟踪的用户同样该知道 SyncHub 有没有新版本（`trackedCount` 因此从
     * `shouldCheckOnSettingsOpen` 的入参里去掉了）。
     *
     * 两次检查都会落盘（`recordUpdateChecks` / `recordSelfUpdateCheck`），所以
     * 收尾这一次重绘同时更新了标签栏的徽标与自身更新那一行的状态文字。
     */
    private async autoCheckOnOpen(): Promise<void> {
        const installer = this.obsync.settings.installer;
        const due = shouldCheckOnSettingsOpen({
            autoCheckOnSettingsOpen: installer.autoCheckOnSettingsOpen,
            lastCheckAt: installer.lastUpdateCheckAt,
            now: Date.now(),
        });
        if (!due) return;

        try {
            await this.checkSelfUpdate();
            // `redraw: false`：重绘由下面统一负责（见 `checkAllUpdates` 的说明）。
            // 跟踪列表为空时它直接返回 —— 那次重绘同样落在下面。
            await this.checkAllUpdates({ quietWhenNone: true, redraw: false });
        } finally {
            this.display();
        }
    }

    /**
     * 静默查一次 SyncHub 自身。
     *
     * **只在真有更新时说一句**：它是「顺手做的事」，没更新或查不动都不该打扰用户
     * （失败的样子是状态行里那句「检查失败」，不必再弹一次）。
     *
     * 结果由 `checkSelf` 内部落盘（`recordSelfUpdateCheck`），所以调用方不必关心
     * 记录 —— 徽标与状态行下一次重绘就是对的。
     */
    private async checkSelfUpdate(): Promise<void> {
        const t = this.obsync.t;
        const currentVersion = this.obsync.manifest.version;

        try {
            const check = await this.obsync.installer.checker.checkSelf(currentVersion);
            if (check.hasUpdate) {
                this.obsync.notifier.info(
                    t.installer.selfUpdateAvailable(currentVersion, check.latestVersion)
                );
            }
        } catch (err) {
            // `checkSelf` 自己吞掉了网络错误（结果里带 `error`），走到这里只可能是
            // 意料之外的问题 —— 记一笔日志，不打扰用户。
            logger.debug("the automatic self-update check failed", err);
        }
    }

    /** 设置改完后统一走这里：落盘 + 重算派生状态 + 重绘。 */
    private async commit(redraw = false): Promise<void> {
        await this.obsync.saveSettings();
        this.obsync.applyDerivedSettings();
        if (redraw) this.display();
    }

    /**
     * 开一个「设置组」，返回组内放各设置行的容器。
     *
     * ## 为什么需要它
     *
     * Obsidian 1.13 起，**一条 `Setting` 自己就是一张卡片**（
     * `--setting-items-background` 的圆角块，见 app.css 的 `.setting-item`）。
     * 照原样一条条画出来，一页就是十几张紧挨着的卡片：没有层次，每一行都在
     * 同样大声地喊 —— 用户的原话是「图中展示的布局样式是丑陋的」。
     *
     * 官方自己的设置页把**相关**的几条放进 `.setting-group > .setting-items`：
     * 整组只有一张卡片，组内用发丝线分隔。这里用同一套 DOM 结构（不是 API，
     * 只是类名）：1.13 以上直接得到原生观感，连主题里的 `--setting-items-*`
     * 变量都照常生效；老版本上这几个类没有样式，退化成原来的逐行排布 —— 不会坏。
     *
     * ## 返回的是「行容器」，不是组
     *
     * 组标题必须是 `.setting-group` 的**直接子节点**，而行要放进 `.setting-items`
     * —— 两个位置不同，所以带标题的那种由 `openSection` 负责；这里给的是
     * 「标题已经在上面了」的那一组（页面标题正下方）。
     */
    private openGroup(): HTMLElement {
        return this.containerEl
            .createDiv({ cls: "setting-group obsync-group" })
            .createDiv({ cls: "setting-items" });
    }

    /**
     * 开一个**带标题**的设置组：标题 + 说明 + 右侧动作按钮在同一行。
     *
     * 没有名称的那种「按钮行」是这一页最丑的地方 —— 一整条卡片上只有最右边
     * 挂着一个按钮（用户截图里正是它）。把按钮挂到**组标题**上就不需要那种行了：
     * 标题在左、按钮在右，中间没有空白（与「已跟踪」页的头部栏同一形状）。
     *
     * 返回的 `rows` 是该组的行容器；`heading` 是标题那一行，可以接着
     * `.setDesc(...)` / `.addButton(...)`。
     */
    private openSection(title: string): { rows: HTMLElement; heading: Setting } {
        const group = this.containerEl.createDiv({ cls: "setting-group obsync-group" });
        const heading = new Setting(group)
            .setName(title)
            .setHeading()
            .setClass("obsync-group-heading");
        const rows = group.createDiv({ cls: "setting-items" });
        return { rows, heading };
    }

    /**
     * 在元素上挂一个**每秒刷新**的「距离下次同步还有多久」（2026-10-02 用户要求：
     * 「如果仓库同步里的定时同步是开启的状态，请显示距离下次同步的倒计时」）。
     *
     * ## 数据从哪来
     *
     * `Automatics.nextRunAt()` —— 定时器自己记下的**预定触发时刻**。没有定时器
     * （开关关着 / 策略是 `reset` 挂起 / 刚触发还没重新起表）时它是 `undefined`，
     * 这里就把文字清空，元素由 CSS 的 `:empty` 收起来（不写内联样式：
     * 社区审核的 `no-static-styles-assignment` 会拦）。
     *
     * ## 同步进行中显示另一句话
     *
     * 那一轮的表已经烧掉了，显示「还剩 0:00」是错的；`service.isBusy` 为真时说
     * 「正在同步…」。两者都拿不到就什么都不显示 —— 倒计时的前提是**真有一个表**。
     *
     * ## 每秒一次 + 必须能停
     *
     * 显示到秒，所以一秒一次。定时器 id 记进 `countdowns`，由 `display()`（重绘）
     * 与 `hide()`（关闭）清掉 —— 否则每重绘一次就多一个永不停止的 interval。
     */
    private startCountdown(el: HTMLElement): void {
        const tick = (): void => {
            const sync = this.obsync.sync;
            const nextRunAt = sync?.automatics.nextRunAt();
            if (nextRunAt === undefined) {
                el.setText("");
                return;
            }
            el.setText(
                sync?.service.isBusy
                    ? this.obsync.t.settings.sync.countdownRunning
                    : this.obsync.t.settings.sync.countdown(formatCountdown(nextRunAt - Date.now()))
            );
        };

        tick();
        this.countdowns.push(window.setInterval(tick, 1000));
    }

    /** 停掉所有倒计时刷新器（重绘与关闭这一页时都要调）。 */
    private stopCountdowns(): void {
        for (const id of this.countdowns) window.clearInterval(id);
        this.countdowns = [];
    }

    /**
     * 数字输入框：**合法输入立即生效，出界的输入在失焦时把框里的显示对齐回真正生效的值**。
     *
     * ## 为什么要这一层
     *
     * 这些框原先各写各的「解析失败就 `return`」，于是框里能留下一个**不生效**的数字：
     * 在「按周期同步」里打 `0`，什么都没发生、框里却写着 0，而真正生效的还是 10 ——
     * 存储、定时器、界面三者互相不一致。用户的实测原话是
     * 「输入 0-4 的值不会被视觉修正是吗？这不合理吧」。**界面在撒谎比拒绝输入更糟**：
     * 拒绝至少是「没反应」，撒谎会让人以为设置已经生效。
     *
     * 同样的毛病另外四处都有（`compressQuality` 更糟：它把越界的 5 直接存下去，
     * 直到下次加载被 `normalizeSettings` 改成 10，框里写的与生效的一直不是一回事）。
     *
     * ## 为什么在失焦修，而不是在 onChange 里改
     *
     * Obsidian 的 `TextComponent.onChange` 绑的是 `input` 事件 —— **每按一个键都会来一次**。
     * 在 onChange 里改框，用户打「15」的第一个键「1」就会被立刻改掉，接着那个「5」
     * 拼出来已经不是他想输的数。所以 onChange 只接受合法值，失焦时再对齐显示。
     *
     * ## 为什么出界是「不接受」而不是「钳到边界」
     *
     * 这些数字里有一类是**周期**：更小 = 更激进（1 分钟提交一次、5 分钟跑一轮整库比对）。
     * 把误输入的 `0` 钳成下限，等于替用户选了一个比默认更激进的档 —— 比拒绝危险。
     * 所以一律不写、并把框改回当前值。`min` / `max` 仍然设上：浏览器的步进按钮与
     * 校验提示都靠它们，而**它们的值必须与 `normalizeSettings` 的钳制一致** ——
     * 不一致就会出现「框里能填、存下去又被改掉」那种新的谎。
     *
     * @param spec.get 当前生效值（失焦时把框对齐到它）
     * @param spec.apply 写入设置 —— 调用方在这里顺带 `commit()`
     * @returns 那个 `TextComponent`（调用方可能要事后 `setDisabled`）
     */
    private addNumberField(
        setting: Setting,
        spec: {
            get: () => number;
            apply: (value: number) => Promise<void>;
            min: number;
            max: number;
            ariaLabel: string;
            /** 单位后缀（跟在框后面，见 styles.css 的 `.obsync-unit`）。 */
            unit?: string;
            disabled?: boolean;
        }
    ): TextComponent {
        let component: TextComponent | undefined;

        setting.addText((text) => {
            component = text;
            text.inputEl.type = "number";
            text.inputEl.min = String(spec.min);
            text.inputEl.max = String(spec.max);
            // 框旁边没有自己的文字说明（单位是后面那个 span），所以给它一个无障碍标签。
            text.inputEl.setAttribute("aria-label", spec.ariaLabel);
            text.setValue(String(spec.get()));
            if (spec.disabled) text.setDisabled(true);

            text.onChange(async (value) => {
                const parsed = Number.parseInt(value, 10);
                // 打字过程中每个键都会到这里：出界的先**不写**（见方法说明）。
                if (!Number.isFinite(parsed) || parsed < spec.min || parsed > spec.max) return;
                await spec.apply(parsed);
            });
        });

        if (spec.unit !== undefined) {
            setting.controlEl.createSpan({ cls: "obsync-unit", text: spec.unit });
        }

        const field = component;
        if (field) {
            // 失焦：框里留着一个不生效的数字是最糟的状态，对齐回去。
            field.inputEl.addEventListener("blur", () => {
                const current = String(spec.get());
                if (field.inputEl.value !== current) field.setValue(current);
            });
        }

        // `addText` 的回调是同步执行的，所以到这里一定已经赋值。
        return component as TextComponent;
    }

    /**
     * 访问令牌一节。
     *
     * 由 `renderGeneral()` 调用（2026-10-06 从「插件安装器」页移来）—— 令牌是
     * 私有仓库访问与接口配额的凭据，安装器与仓库同步都要用，不属于安装器。
     */
    private renderTokens(): void {
        const t = this.obsync.t;

        new Setting(this.containerEl).setName(t.settings.token.heading).setHeading();
        this.containerEl.createEl("p", {
            cls: "setting-item-description",
            text: t.settings.token.desc,
        });

        // 由 `SUPPORTED_HOSTS` 驱动 —— 之前是两个写死的平台名，
        // 加平台时这里会静默漏掉一个输入框。
        for (const host of SUPPORTED_HOSTS) this.renderTokenField(host);
    }

    private renderTokenField(host: HostKind): void {
        const t = this.obsync.t;
        const name =
            host === "github" ? t.settings.token.githubName : t.settings.token.giteeName;
        const desc =
            host === "github" ? t.settings.token.githubDesc : t.settings.token.giteeDesc;

        let pending = this.obsync.secretStore.getToken(host) ?? "";
        let dirty = false;

        // 状态徽标要跟着输入/清除即时变（渲染时机在构造 Setting 之后，
        // 所以用闭包持有元素引用，而不是等下一次 display()）。
        let statusEl: HTMLElement | undefined;
        const refreshStatus = (): void => {
            if (!statusEl) return;
            const configured = pending.trim().length > 0;
            statusEl.setText(
                configured ? t.settings.token.configured : t.settings.token.notConfigured
            );
            statusEl.toggleClass("obsync-badge-ok", configured);
            statusEl.toggleClass("obsync-badge-muted", !configured);
        };

        const setting = new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((text) => {
                text.inputEl.type = "password";
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.setPlaceholder(t.settings.token.placeholder);
                text.setValue(pending);
                // 每次按键都写密钥存储太浪费，改成内存暂存 + 失焦落盘。
                text.onChange((value) => {
                    pending = value;
                    dirty = true;
                });
                text.inputEl.addEventListener("blur", () => {
                    if (!dirty) return;
                    dirty = false;
                    this.obsync.secretStore.setToken(host, pending);
                    refreshStatus();
                    // 令牌可能换了一个账号 —— 功能区底部那张头像跟着换。
                    // 头像那个开关就在本页上面，但改令牌不必重画整页：直接刷新即可。
                    this.obsync.refreshRibbonAvatar();
                });
            })
            .addButton((button) =>
                button.setButtonText(t.settings.token.test).onClick(async () => {
                    const token = pending.trim();
                    if (!token) {
                        this.obsync.secretStore.clearToken(host);
                        refreshStatus();
                        this.obsync.refreshRibbonAvatar();
                        this.obsync.notifier.info(t.settings.token.cleared);
                        return;
                    }

                    this.obsync.secretStore.setToken(host, token);
                    dirty = false;
                    refreshStatus();
                    this.obsync.refreshRibbonAvatar();

                    button.setDisabled(true);
                    button.setButtonText(t.settings.token.testing);
                    try {
                        const info = await getHost(host).validateToken(token);
                        if (info.valid) {
                            this.obsync.notifier.success(
                                t.settings.token.valid(
                                    getHost(host).displayName,
                                    info.account ?? t.common.unknown
                                )
                            );
                        } else {
                            this.obsync.notifier.error(
                                t.settings.token.invalid(getHost(host).displayName)
                            );
                        }
                    } catch (err) {
                        this.obsync.notifier.reportError(
                            err,
                            t.settings.token.invalid(getHost(host).displayName)
                        );
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText(t.settings.token.test);
                    }
                })
            )
            .addExtraButton((button) =>
                button
                    .setIcon("trash")
                    .setTooltip(t.common.delete)
                    .onClick(async () => {
                        this.obsync.secretStore.clearToken(host);
                        pending = "";
                        dirty = false;
                        setting.settingEl.empty();
                        this.display();
                        // 令牌没了 → 功能区那张头像也得摘掉（同 blur 那条）。
                        this.obsync.refreshRibbonAvatar();
                        this.obsync.notifier.info(t.settings.token.cleared);
                    })
            );

        void setting;

        // 一眼看出这个平台有没有配令牌（状态类信息做成徽标，不塞进描述文字）。
        statusEl = setting.nameEl.createSpan({ cls: "obsync-badge" });
        refreshStatus();
    }

    /**
     * 通用 —— 提示、日志、两个界面开关，以及访问令牌。
     *
     * 这里原来第一行是「界面语言」下拉，2026-10-01 删了：界面语言一律跟随
     * Obsidian（见 `core/i18n/index.ts` 的文件头），留一个能与 Obsidian 不一致的
     * 开关只会让「界面语言不对」变成用户自己能造出来的状态。
     *
     * 两个开关都走 `commit()` → `applyDerivedSettings()`，所以拨完**立刻**生效
     * （一个给 body 加类，一个画/摘功能区底部那张头像，见 `main.ts`）。
     *
     * ## 令牌为什么在这一页（2026-10-06 用户要求）
     *
     * 用户的原话是「将访问令牌的设置项移到通用里」。它原先挂在「插件安装器」页
     * 末尾，而它管的从来不只是安装器：仓库同步（私有仓库 push/pull）与
     * 「功能区展示用户头像」都要读同一个令牌。放在「通用」才配得上它的作用范围。
     */
    private renderGeneral(): void {
        const t = this.obsync.t;

        // 这一页**没有页首标题**（2026-10-06 删）：页签「通用」已经写着页名，
        // 再顶一行同名标题是重复信息。下面「访问令牌」那个小标题是**节内**的，
        // 留着 —— 它管的是页面中段那一块，不是页名。

        new Setting(this.containerEl)
            .setName(t.settings.general.showNotices)
            .setDesc(t.settings.general.showNoticesDesc)
            .addToggle((toggle) =>
                toggle.setValue(this.obsync.settings.showNotices).onChange(async (value) => {
                    this.obsync.settings.showNotices = value;
                    await this.commit();
                })
            );

        new Setting(this.containerEl)
            .setName(t.settings.general.debugLogging)
            .setDesc(t.settings.general.debugLoggingDesc)
            .addToggle((toggle) =>
                toggle.setValue(this.obsync.settings.debugLogging).onChange(async (value) => {
                    this.obsync.settings.debugLogging = value;
                    await this.commit();
                })
            );

        new Setting(this.containerEl)
            .setName(t.settings.general.statusBarLeftAlign)
            .setDesc(t.settings.general.statusBarLeftAlignDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(this.obsync.settings.statusBarLeftAlign)
                    .onChange(async (value) => {
                        this.obsync.settings.statusBarLeftAlign = value;
                        // `commit()` → `applyDerivedSettings()` → 给 body 加/摘那个类，
                        // 所以拨开关是**立刻**生效的（不用重载插件、也不用重开设置页）。
                        await this.commit();
                    })
            );

        new Setting(this.containerEl)
            .setName(t.settings.general.ribbonAvatar)
            .setDesc(t.settings.general.ribbonAvatarDesc)
            .addToggle((toggle) =>
                toggle.setValue(this.obsync.settings.ribbonAvatar).onChange(async (value) => {
                    this.obsync.settings.ribbonAvatar = value;
                    // `commit(true)` → `applyDerivedSettings()` → `RibbonAvatar.apply()`
                    // 按新值立刻画/摘。没有令牌时它什么都不画 —— 描述里已经写明
                    // 这一点，否则用户会以为开关坏了。
                    //
                    // **`redraw = true` 是必须的**：下面那一行的可用性由它决定，
                    // 不重绘的话置灰状态要等切走再切回来才跟上（见 `commit` 的说明）。
                    await this.commit(true);
                })
            );

        /**
         * 头像用哪个平台（2026-10-06 用户要求从上面那一行里拆出来）。
         *
         * 用户的原话是「将功能区展示用户头像中gitee部分拆分出来单独设置一个设置项，
         * 默认开启，开启时使用gitee头像，关闭时使用GitHub头像」。拆之前平台是写死的
         * Gitee，于是**只用 GitHub 的用户那一行等于坏掉的开关** —— 其实换个平台
         * 就有头像了。
         *
         * 总开关关着时它没有意义 → 置灰（**不改它的值**：`setDisabled` 而不是
         * `setValue(false)`，用户关掉头像再打开时选择还在）。这与「启动检查延迟」
         * 那一行的做法一致。
         */
        const avatarSourceRow = new Setting(this.containerEl)
            .setName(t.settings.general.ribbonAvatarSource)
            .setDesc(t.settings.general.ribbonAvatarSourceDesc)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.obsync.settings.ribbonAvatarUseGitee)
                    .setDisabled(!this.obsync.settings.ribbonAvatar)
                    .onChange(async (value) => {
                        this.obsync.settings.ribbonAvatarUseGitee = value;
                        await this.commit();
                    });
            });

        /**
         * 「换头像」的入口（2026-10-05 用户要求：「在功能区展示头像设置项中，添加用户的
         * gitee 设置页链接，方便用户更换头像」）。
         *
         * 头像**不可能在插件里改** —— 它是平台账号的资料，只能去那个平台换。所以这一行
         * 能做的就是把人送过去，并且说清**去哪儿**（两个常量见文件末尾那段说明：
         * 网址不随语言变，所以不进 locale）。
         *
         * 2026-10-06 随平台开关一起从上面那一行挪到这里：链接指向**当前选中的**平台
         * （选 GitHub 就把人送去 GitHub 的 profile 页）—— 留在总开关那一行的话，
         * 它会与「用哪个平台」脱节，指错地方。
         *
         * 链接接在描述**末尾**（同一个元素里，与 git 路径那一行的下载链接同一套做法）：
         * 设置页的描述是纯文本，光写网址用户得自己复制到浏览器；而 `target=_blank`
         * 就够了 —— Obsidian 的主进程把 http(s) 一律交给系统浏览器。
         */
        const useGitee = this.obsync.settings.ribbonAvatarUseGitee;
        avatarSourceRow.descEl.appendText(t.settings.general.ribbonAvatarChangeLead);
        avatarSourceRow.descEl.createEl("a", {
            text: useGitee
                ? t.settings.general.ribbonAvatarChangeLinkGitee
                : t.settings.general.ribbonAvatarChangeLinkGithub,
            attr: {
                href: useGitee ? GITEE_PROFILE_URL : GITHUB_PROFILE_URL,
                target: "_blank",
                rel: "noopener",
            },
        });

        // 访问令牌放本页最后（2026-10-06 从「插件安装器」页移来）——
        // 它是各平台/功能共用的凭据，不专属于安装器，见 `renderGeneral` 的说明。
        this.renderTokens();
    }

    /**
     * 标签二：插件安装器 —— 自身更新、自动检查时机、镜像发现。
     *
     * ## 顺序（2026-10-06 用户要求）
     *
     * 「将当前版本 0.1.9 · 尚未检查更新的小字提示放到最前面，然后展示 SyncHub 自身
     * 更新卡片，然后是启用 gitee 镜像源更新 SyncHub 设置项，再然后是进入设置页时
     * 自动检查设置项，……最后展示启动时检查更新、启动检查延迟、自动发现 gitee 镜像
     * 设置项。」
     *
     * 也就是把原来沉在本页最后的「SyncHub 自身」整块提到最前 —— 它是这一页里
     * **用户最常来办的事**（看看自己是不是最新、顺手更新），而上面那几个开关是
     * 配一次就不再动的。**没有页首标题**（2026-10-06 删，与其余三页一致）：页签
     * 「插件安装器」已经写着页名，状态小字就是这一页的第一条内容。
     *
     * 三块内容分居三个方法/段落，顺序即 DOM 顺序：
     * `renderSelfUpdate()`（状态行 → 卡片 → 镜像源开关）→ 进入设置页时自动检查 →
     * 启动检查 / 延迟 → 镜像发现。
     */
    private renderInstaller(): void {
        const t = this.obsync.t;
        const settings = this.obsync.settings.installer;

        // 这里原来第一行是「启用插件安装器」总开关（2026-10-06 删掉）：它只挡下面
        // 那两个自动检查，等价于把它们都关掉 —— 是同一个 off 的第二种说法，而名字
        // 却让人以为关掉就不装了（功能区图标与安装命令从来不看它）。
        // 见 `core/settings.ts` 的 `migrateV9ToV10`。

        // ① 状态小字 + ② 自身更新卡片 + ③ 镜像源开关（见 `renderSelfUpdate`）。
        this.renderSelfUpdate();

        // ④ 进入设置页时自动检查。开着时这一页打开就会跑一轮：跟踪列表 + SyncHub 自身。
        new Setting(this.containerEl)
            .setName(t.settings.installer.autoCheckOnSettingsOpen)
            .setDesc(t.settings.installer.autoCheckOnSettingsOpenDesc)
            .addToggle((toggle) =>
                toggle.setValue(settings.autoCheckOnSettingsOpen).onChange(async (value) => {
                    settings.autoCheckOnSettingsOpen = value;
                    await this.commit();
                })
            );

        // 「启动检查」关着时延迟项没有意义 —— 置灰比藏起来更少困惑（用户能看到它还在）。
        // 但置灰状态必须跟着开关**即时**变：只在渲染时算一次的话，
        // 用户打开开关后会发现下面的输入框还是灰的，得切走再切回来。
        let delayField: TextComponent | undefined;

        // ⑤ 启动时检查更新 + 启动检查延迟。
        new Setting(this.containerEl)
            .setName(t.settings.installer.autoCheck)
            .setDesc(t.settings.installer.autoCheckDesc)
            .addToggle((toggle) =>
                toggle.setValue(settings.autoCheckOnStartup).onChange(async (value) => {
                    settings.autoCheckOnStartup = value;
                    delayField?.setDisabled(!value);
                    await this.commit();
                })
            );

        delayField = this.addNumberField(
            new Setting(this.containerEl)
                .setName(t.settings.installer.autoCheckDelay)
                .setDesc(t.settings.installer.autoCheckDelayDesc),
            {
                get: () => settings.autoCheckDelaySeconds,
                apply: async (value) => {
                    settings.autoCheckDelaySeconds = value;
                    await this.commit();
                },
                // 与 `normalizeSettings` 里那一句钳制一致。
                min: 0,
                max: 3600,
                ariaLabel: t.settings.installer.autoCheckDelay,
                disabled: !settings.autoCheckOnStartup,
            }
        );

        // ⑥ 自动发现 Gitee 镜像。
        new Setting(this.containerEl)
            .setName(t.settings.installer.mirrorDiscovery)
            .setDesc(t.settings.installer.mirrorDiscoveryDesc)
            .addToggle((toggle) =>
                toggle.setValue(settings.discoverGiteeMirrors).onChange(async (value) => {
                    settings.discoverGiteeMirrors = value;
                    await this.commit();
                })
            );
    }

    /**
     * 「SyncHub 自身」一节：**状态行 → 检查/更新卡片 → 镜像源开关**。
     *
     * 顺序是 2026-10-06 用户要求的：「将当前版本 0.1.9 · 尚未检查更新的小字提示
     * 放到最前面，然后展示 SyncHub 自身更新卡片，然后是启用 gitee 镜像源更新
     * SyncHub 设置项」。所以状态行**先于**卡片创建（DOM 顺序即创建顺序），
     * 镜像源开关跟在卡片后面。
     *
     * 状态行由 `describeSelfState` 拼（纯函数，单测覆盖）—— 这里只负责在合适的
     * 时机重绘它：**不能**用 `this.display()` 重绘整页来刷新状态，那会把用户
     * 正在看的滚动位置与焦点一起丢掉（`AddRepoModal` 的按钮可用性踩过同一个坑）。
     */
    private renderSelfUpdate(): void {
        const t = this.obsync.t;
        const settings = this.obsync.settings.installer;
        const currentVersion = this.obsync.manifest.version;

        let check: SelfUpdateCheck | undefined;
        let busy: "checking" | "updating" | undefined;
        let checkButton: ButtonComponent | undefined;
        let updateButton: ButtonComponent | undefined;
        let status: HTMLElement | undefined;

        /**
         * 这一轮没查过时，用**上次落盘的结果**兜底。
         *
         * 没有它的话，用户打开设置页看到的是「尚未检查更新」，即使上一轮刚查出来
         * 有新版本 —— 而标签栏那个徽标同时亮着，两处自相矛盾。
         * `describeSelfState` 的优先级（待重启 > 出错 > 有更新 > 已是最新）不受影响：
         * 它只是把 `check` 从「本轮结果」放宽成「已知的最近结果」。
         */
        const knownCheck = (): SelfUpdateCheck | undefined => {
            if (check) return check;
            if (!settings.selfUpdateAvailable) return undefined;
            return {
                currentVersion,
                latestVersion: settings.selfUpdateAvailable,
                hasUpdate: true,
            };
        };

        const renderStatus = (): void => {
            status?.setText(
                describeSelfState(
                    {
                        currentVersion,
                        check: knownCheck(),
                        pendingRestartVersion: settings.pendingRestartVersion,
                        busy,
                    },
                    t
                )
            );
        };

        const setBusy = (value: "checking" | "updating" | undefined): void => {
            busy = value;
            checkButton?.setDisabled(value !== undefined);
            updateButton?.setDisabled(value !== undefined);
            renderStatus();
        };

        // ① 状态行 —— 本页第一条内容，先于卡片创建。
        status = this.containerEl.createEl("p", { cls: "setting-item-description" });
        renderStatus();

        // ② 自身更新卡片：标题 + 说明 + 检查 / 更新两个按钮。
        new Setting(this.containerEl)
            .setName(t.settings.installer.selfHeading)
            .setDesc(t.settings.installer.selfDesc)
            .addButton((button) => {
                checkButton = button;
                return button.setButtonText(t.installer.checkOne).onClick(async () => {
                    setBusy("checking");
                    try {
                        // 不传来源：`checkSelf` 的默认值就是 `service.selfRepo()`
                        // —— 与 `updateSelf` **同一个入口**。传一份解析结果进来
                        // 也能对，但那就多了一处「两边各读一次设置」的机会，而
                        // 分叉的症状正是「检查说没有更新、更新却从另一个仓库拉」。
                        //
                        // 结果由 `checkSelf` 自己落盘（`recordSelfUpdateCheck`），
                        // 所以标签栏的徽标要等下一次重绘才更新 —— 那一次重绘由
                        // 状态行之外的路径负责，这里不 `display()`（会丢滚动位置）。
                        check = await this.obsync.installer.checker.checkSelf(currentVersion);
                    } finally {
                        setBusy(undefined);
                    }
                });
            })
            .addButton((button) => {
                updateButton = button;
                return button
                    .setButtonText(t.installer.updateToLatest)
                    .onClick(async () => {
                        setBusy("updating");
                        try {
                            const result = await this.obsync.installer.service.updateSelf(
                                currentVersion
                            );
                            this.obsync.notifier.success(
                                t.installer.selfUpdateDone(result.version)
                            );
                            // 检查结果作废：磁盘上已经是那个版本了，接下来该显示的是
                            // 「待重启」（由 pendingRestartVersion 驱动，重启后自动消失）。
                            // `updateSelf` 也顺手清掉了落盘的 `selfUpdateAvailable`
                            // —— 否则标签栏那个徽标会一直亮着。
                            check = undefined;
                        } catch (err) {
                            this.obsync.notifier.reportError(err, t.installer.selfUpdateFailed);
                        } finally {
                            setBusy(undefined);
                        }
                    });
            });

        // ③ 自身更新的来源开关。
        //
        // 用户的原话是「插件的自更新来源用开关的形式选择，即『启用 gitee 镜像源
        // 更新 SyncHub』，默认开启，开启后使用 gitee.com/sofqi/SyncHub 更新，
        // 关闭时则使用 GitHub 地址」。所以它从自由文本框换成了一个开关：
        // 开 → `SELF_MIRROR`，关 → `SELF_REPO`（见 `resolveSelfRepo`）。
        //
        // 默认**开**（走 Gitee 镜像，国内可直连）。镜像不可用时会自动回退到官方
        // 仓库重试并提示一次，所以默认开是安全的。
        new Setting(this.containerEl)
            .setName(t.settings.installer.selfUseGitee)
            .setDesc(t.settings.installer.selfUseGiteeDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.selfUpdateUseGitee)
                    .onChange(async (value) => {
                        settings.selfUpdateUseGitee = value;
                        await this.commit();
                    })
            );
    }

    private async checkAllUpdates(
        options: { quietWhenNone?: boolean; redraw?: boolean } = {}
    ): Promise<void> {
        const t = this.obsync.t;
        const tracked = this.obsync.settings.installer.tracked;

        if (tracked.length === 0) {
            if (!options.quietWhenNone) {
                this.obsync.notifier.info(t.settings.installer.trackedEmpty);
            }
            return;
        }

        try {
            const summary = await this.obsync.installer.checker.checkAll(tracked);
            if (summary.outdated === 0 && summary.failed === 0) {
                if (!options.quietWhenNone) {
                    this.obsync.notifier.success(t.installer.checkNone);
                }
                return;
            }
            this.obsync.notifier.info(t.installer.checkSummary(summary.outdated, summary.failed));
        } catch (err) {
            this.obsync.notifier.reportError(err, t.installer.checkFailed);
        } finally {
            // 徽标常驻在列表里（availableUpdates 已由 checkAll 落盘），重绘让它可见。
            //
            // `redraw: false` 给「打开设置页自动检查」那条路用：它还要顺手查一次
            // SyncHub 自身，两件事合并成**一次**重绘（否则刚打开的页面会被连着
            // 重画两遍，用户正在读的那一行会闪）。
            if (options.redraw !== false) this.display();
        }
    }

    private renderSync(): void {
        const t = this.obsync.t;

        // 这一页**没有页首标题**（2026-10-06 删）：页签「仓库同步」已经写着页名。
        // 于是「注意事项」直接成为这一页的第一条内容（见下）。

        // 移动端没有系统 git，直接说明原因，而不是给一堆点了没用的控件。
        if (!this.obsync.isSyncAvailable) {
            this.containerEl.createEl("p", {
                cls: "setting-item-description",
                text: t.settings.sync.desktopOnly,
            });
            return;
        }

        // 注意事项：放在**页面最上方**，而不是塞进各设置项的描述里。
        // 两条都是**组合条件**才踩得到的坑（策略选「重置」+ 开着自动同步；
        // 多设备同时编辑同一个文件），写进单项描述没人读得到 ——
        // 用户是在配好之后才出问题，那时早就不翻设置了。
        const notes = this.containerEl.createDiv({ cls: "obsync-sync-notes" });
        notes.createDiv({ cls: "obsync-sync-notes-heading", text: t.settings.sync.notesHeading });
        const noteList = notes.createEl("ul");
        for (const note of t.settings.sync.notes) {
            noteList.createEl("li", { text: note });
        }

        /**
         * **连接测试的三个前提**：库本身是 git 仓库、远端地址、git 可执行文件路径。
         *
         * 这一页的结构约定（2026-10-04 用户的话）：**「连接测试」之前的每一项都必须是
         * 「测试能通过」的充要条件**。连接测试的第一项就是「这个库是不是 git 仓库」
         * （`SyncService.diagnose` 的第 2 步），不通过就停在那里 —— 所以 2026-10-05
         * 又补了最前面那一行「初始化 git 仓库」（用户要求：「把仓库初始化按钮也放入
         * 设置页，保证仓库同步的基本设置能全部在设置页中就完成」）。
         *
         * 另外两条是 2026-10-04 的用户要求：
         *
         * 1. 「git 可执行文件路径应该移上来，在远端地址设置项后面展示」——
         *    连接测试查的正是这些事（git 能不能跑、远端能不能连），原来 git 路径
         *    沉在「定时同步 / 提交模板 / 整合策略」后面。
         * 2. 「这两个设置项之间用分割线隔开就好，不用分成两个圆角背景」——
         *    所以几行放**同一个设置组**里（一张卡片、行之间一条分割线），
         *    而不是各自一行各占一张卡片。
         *
         * 远端那一行里还并着「打开仓库同步面板」按钮：地址是**配置**，打开面板是配完
         * 之后**去看它**，本来就挨着（原来那个只剩这一个按钮的「操作」一节占了整张
         * 卡片加一行标题）。按钮的说明文字挂在它的 tooltip 上。
         */
        const prerequisites = this.openGroup();
        // 初始化排最前：三者里它最底层 —— 没有仓库，地址与 git 路径都谈不上。
        this.renderInitRow(prerequisites);
        this.renderRemoteRow(prerequisites);
        this.renderGitPathRow(prerequisites);

        // 「连接测试」提到这一页最前面（2026-10-02 用户要求：「放到最上边展示」）。
        // 与图片同步页把「操作」提到最前是同一条理由：它是**动作**，而下面那两节
        // 是配一次就不再翻的设置。放在「注意事项」**之后**而不是之前 —— 那两段
        // 提醒是刻意钉在标题正下方的（有用例守着），而且它们说的是「别这么配」，
        // 摆在动作前面比摆在一个按钮后面更有用。
        this.renderDiagnostics();

        const settings = this.obsync.settings.sync;

        // 这一节没有自己的标题（页面标题「仓库同步」就在上面），所以开一个无标题的组。
        // 相关的几条收进同一张卡片：这一页原本是十几张彼此独立的卡片。
        const rows = this.openGroup();

        /**
         * 策略为「重置」时把这一行的两个控件都灰掉。
         *
         * 真正的拦截在 `Automatics.start()`（那里读同一个字段），这里只是
         * **说明** —— 只灰不说，用户会以为插件坏了。
         *
         * 值刻意不动：用户改回「合并」后自动恢复，不用重新拨一次。
         */
        const suspended = settings.syncStrategy === "reset";

        /**
         * 「定时同步」：**周期框 + 单位 + 开关，同一行**（2026-10-02）。
         *
         * 之前这里是「一个总开关」+「三个间隔」两处都能表达关：
         * 总开关关掉 = 三个间隔全设 0，行为完全一样，而默认又是「开着 + 全 0」
         * （拨到哪边都不动），于是读起来像重复的设置项。
         *
         * 现在开与关只有开关说了算，周期里的数字**没有「0 = 关闭」的含义**
         * （`normalizeSettings` 钳在 1–1440）。两个控件各表达一件事。
         */
        const timer = new Setting(rows)
            .setName(t.settings.sync.enabled)
            .setDesc(
                suspended ? t.settings.sync.enabledSuspendedByReset : t.settings.sync.enabledDesc
            );

        // 倒计时徽标（2026-10-02 用户要求）挂在名称后面，每秒刷新一次；
        // 没有定时器时它是空的，由 CSS 的 `:empty` 收起来。
        this.startCountdown(timer.nameEl.createSpan({ cls: "obsync-badge obsync-countdown" }));

        this.addNumberField(timer, {
            get: () => settings.intervalMinutes,
            apply: async (value) => {
                settings.intervalMinutes = value;
                await this.commit();
            },
            // 1–1440：0 在新模型里没有含义，24 小时是「还算定时同步」的上限。
            // 与 `normalizeSettings` 里 `sync.intervalMinutes` 的钳制一致。
            min: 1,
            max: 24 * 60,
            ariaLabel: t.settings.sync.intervalAria,
            unit: t.settings.sync.minutesUnit,
            disabled: suspended,
        });

        timer.addToggle((toggle) =>
            toggle
                .setValue(settings.enabled)
                .setDisabled(suspended)
                .onChange(async (value) => {
                    settings.enabled = value;
                    await this.commit();
                })
        );

        new Setting(rows)
            .setName(t.settings.sync.commitMessage)
            .setDesc(t.settings.sync.commitMessageDesc)
            .addText((text) =>
                text.setValue(settings.commitMessage).onChange(async (value) => {
                    settings.commitMessage = value;
                    await this.commit();
                })
            );

        new Setting(rows)
            .setName(t.settings.sync.strategy)
            .setDesc(t.settings.sync.strategyDesc)
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("merge", t.settings.sync.strategyMerge)
                    .addOption("rebase", t.settings.sync.strategyRebase)
                    .addOption("reset", t.settings.sync.strategyReset);
                dropdown.setValue(settings.syncStrategy);
                dropdown.onChange(async (value) => {
                    settings.syncStrategy = value as typeof settings.syncStrategy;
                    // 必须重绘：策略决定上面那个总开关是否可用（见 `suspended`）。
                    // 不重绘的话，用户切到「重置」后开关看起来还是能拨的 ——
                    // 而实际行为已经停了，那比不灰掉更让人困惑。
                    await this.commit(true);
                });
            });

        this.renderGitignore();
    }

    /**
     * `.gitignore` 一节：**在这里直接改内容**，不用另开编辑器。
     *
     * ## 为什么值得放进设置页
     *
     * `.gitignore` 不是「一个顺带的文件」，它是同步行为的一部分：哪些文件根本
     * 不会进版本控制由它决定（`workspace.json` 那种每次开关标签都会变的文件，
     * 不同步它是避免多设备冲突的关键）。而此前唯一的入口是命令面板里的
     * 「编辑 .gitignore」——**只有已经知道有这个功能的人才找得到**。
     *
     * 更要紧的是「看得见」：用户配好之后最想确认的一件事是
     * 「`workspace.json` 到底排除了没有」，而那需要把内容显示出来。
     *
     * ## 落盘时机
     *
     * 失焦落盘 + 一个显式的「保存」按钮。理由与令牌那一行不同（那里是密钥），
     * 但同源：**每敲一个键就写一次文件**会让 git 在用户还在打字的中间态上做判断
     * （`.gitignore` 一改，面板上的改动列表立刻就变）。失焦保存保证「点到别处
     * 不会丢」，显式按钮保证「我知道什么时候写下去了」。
     *
     * 文件不存在时**不自动创建**（`readGitignore` 的说明）：设置页只是被打开一下，
     * 不该因此往用户库里多出一个文件。要建就点「填入默认内容」再保存。
     */
    private renderGitignore(): void {
        const t = this.obsync.t;
        const sync = this.obsync.sync;
        if (!sync) return;

        // 这一节自带标题，所以开一个**带标题的组**：说明、代码框、三个按钮
        // 都落在同一张卡片里。代码框以前是裸挂在页面上的（全宽是当时唯一的
        // 诉求），现在卡片本身就给了它左右边距（见 styles.css 的 `.obsync-group`）。
        const { rows, heading } = this.openSection(t.settings.sync.gitignoreHeading);
        rows.createEl("p", {
            cls: "setting-item-description",
            text: t.settings.sync.gitignoreDesc,
        });

        // 状态徽标：用户最需要一眼确认的两件事 —— 磁盘上有没有这个文件、
        // 框里的改动写下去了没有。
        const statusEl = heading.nameEl.createSpan({ cls: "obsync-badge" });

        /** 框里的内容（内存暂存）。 */
        let pending = "";
        let dirty = false;
        let created = false;
        let saving = false;
        let saveButton: ButtonComponent | undefined;

        const refreshStatus = (): void => {
            statusEl.setText(
                saving
                    ? t.settings.sync.gitignoreSaving
                    : dirty
                      ? t.settings.sync.gitignoreDirty
                      : created
                        ? t.settings.sync.gitignoreSaved
                        : t.settings.sync.gitignoreMissing
            );
            statusEl.toggleClass("obsync-badge-update", dirty && !saving);
            statusEl.toggleClass("obsync-badge-ok", !dirty && created);
            statusEl.toggleClass("obsync-badge-muted", !dirty && !created);
            // 没有未保存的改动时按钮置灰：点了什么都不发生，只会让人怀疑它坏了。
            // 保存中也要灰 —— 写盘走同步队列，前面排着一个拉取时可能等几秒。
            saveButton?.setDisabled(saving || !dirty);
        };

        /**
         * 写下去。
         *
         * `announce` 只给显式点「保存」用 —— 失焦保存如果每次都弹一条提示，
         * 用户每点一下别处就被打扰一次；那时徽标从「有未保存的修改」翻成
         * 「已保存」本身就是反馈。
         */
        const save = async (announce: boolean): Promise<void> => {
            if (!dirty || saving) return;
            const value = pending;
            saving = true;
            refreshStatus();
            try {
                await sync.service.writeGitignore(value);
                // 只在内容没被继续改动时才清掉「未保存」：写盘期间用户接着敲的字
                // 不在刚写下去的那一份里，标成已保存就是撒谎。
                if (pending === value) dirty = false;
                created = true;
                if (announce) {
                    this.obsync.notifier.success(t.settings.sync.gitignoreSavedNotice);
                }
            } catch (err) {
                // 失败必须说清「磁盘上还是旧内容」：用户以为自己改了，
                // 而 git 那边一点变化都没有。
                this.obsync.notifier.reportError(err, t.settings.sync.gitignoreSaveFailed);
            } finally {
                saving = false;
                refreshStatus();
            }
        };

        /**
         * 代码框**是块级元素**，不是某个 `Setting` 的控件。
         *
         * 放进 `.setting-item-control` 的话，它只会拿到右侧那几百像素宽 ——
         * 那是 Obsidian 给「一个下拉 / 一个输入框」留的宽度，而 12 行的规则清单
         * 挤在里面根本没法读。
         *
         * 外面还套了一层 `.obsync-block-wrap`，**只为缩进**：组内的行内边距
         * 长在 `.setting-item` 上，不会传给兄弟节点；而代码框的宽度是内联写死的
         * `100%`，直接给它 `margin-inline` 会溢出。包一层最省事。
         * （这一层壳现在两处共用：这里，以及图片同步页的文件夹那一格。）
         */
        const areaWrap = rows.createDiv({ cls: "obsync-block-wrap" });
        const areaEl = areaWrap.createEl("textarea", { cls: "obsync-gitignore" });
        // 一行一条规则，12 行够看清一整套排除规则（模板大约 20 行，滚动即可）。
        areaEl.rows = 12;
        // 示例值用**本库的配置目录名**（可以不是 `.obsidian`）——
        // 写死的话用户在自定义配置目录的库里会照着填错。
        areaEl.placeholder = `${this.obsync.app.vault.configDir}/workspace.json`;
        areaEl.spellcheck = false;
        areaEl.value = pending;
        /**
         * 宽度与 `box-sizing` 写在 CSS 类 `.obsync-gitignore` 里，**不内联**。
         *
         * 这里曾经内联过（`el.style.width = FULL_WIDTH`，`FULL_WIDTH` 是个常量），
         * 理由是「插件样式表不保证在重载时被重新读入，宽度只写在类里会回归」。
         * 但那正是 `obsidianmd/no-static-styles-assignment` 要拦的事 ——
         * 规则只拦**字面量**赋值，用一个 `const` 就能绕过，绕过的是形式、不是判据：
         * 静态宽度本来就该待在类里（社区审核原文：Sets styles directly instead of
         * using CSS classes）。现在按审核规范收回类里。
         *
         * 开发时的「改了 CSS 不生效」用**完整重载 Obsidian** 解决，而不是写进元素。
         */
        areaEl.addEventListener("input", () => {
            pending = areaEl.value;
            dirty = true;
            refreshStatus();
        });
        // 失焦也保存 —— 点到别处不会丢
        areaEl.addEventListener("blur", () => void save(false));

        // 按钮另起一行，并**贴左**：代码框是全宽的，而这一行没有名称/描述 ——
        // 按钮跟到最右会离框太远，看不出它们是给上面那个框用的。
        // （与图片同步页的「浏览… / 恢复默认」同一形状，共用
        // `obsync-inline-actions`。）
        new Setting(rows)
            .setClass("obsync-inline-actions")
            .addButton((button) => {
                saveButton = button;
                return button
                    .setButtonText(t.settings.sync.gitignoreSave)
                    .setCta()
                    .setDisabled(true)
                    .onClick(() => void save(true));
            })
            .addButton((button) =>
                button
                    .setButtonText(t.settings.sync.gitignoreRestore)
                    // 只**填进框里**，不直接写盘：覆盖掉用户自己的规则是数据损失，
                    // 让他先看一眼再决定要不要保存。
                    .onClick(() => {
                        pending = t.sync.gitignoreTemplate(this.obsync.app.vault.configDir);
                        dirty = true;
                        areaEl.value = pending;
                        refreshStatus();
                    })
            )
            .addButton((button) =>
                button.setButtonText(t.settings.sync.gitignoreOpen).onClick(async () => {
                    try {
                        if (!(await sync.service.openGitignore())) {
                            // 点了一个按钮什么也没发生是最容易被当成「插件坏了」
                            // 的一种失败 —— 说清发生了什么，并指向上面那个框。
                            this.obsync.notifier.warn(t.sync.gitignoreOpenFailed);
                        }
                    } catch (err) {
                        this.obsync.notifier.reportError(err);
                    }
                })
            );

        refreshStatus();

        /**
         * 把框里的内容**按磁盘上的现状**重新读一遍。
         *
         * 「停止跟踪图片」写完 `.gitignore` 之后必须走这一步：框里那份是旧的，
         * 而框是**失焦即保存**的 —— 用户接着点进去改一个字再点走，就会把刚写下去的
         * 忽略规则整份覆盖掉（看起来像「加了规则又没了」）。
         *
         * 之所以不整个重绘设置页：`PluginSettingTab.display()` 在 1.13 起是 deprecated
         * （社区审核的 `no-deprecated` 会报），而这里真正需要刷新的只有徽标与这个框。
         */
        const reload = async (): Promise<void> => {
            try {
                const content = await sync.service.readGitignore();
                if (content !== undefined) {
                    created = true;
                    pending = content;
                    areaEl.value = content;
                    dirty = false;
                }
            } catch (err) {
                logger.debug("could not re-read .gitignore", err);
            }
            refreshStatus();
        };

        // 「让 git 不再跟踪图片」（2026-10-02，用户要求：图片已经交给图片同步了）。
        //
        // 放在 `.gitignore` 一节里：它改的就是这个文件，而这一页才是用户排查
        // 「什么东西进了 git」的地方。为什么是一个动作而不是「自己加两行」——
        // 见 `imagesIgnore.ts` 的文件头（`.gitignore` 对**已跟踪**的文件毫无作用）。
        new Setting(rows)
            .setName(t.settings.sync.untrack.name)
            .setDesc(t.settings.sync.untrack.desc)
            .addButton((button) =>
                button
                    .setButtonText(t.settings.sync.untrack.action)
                    .onClick(() => void this.untrackImageFolders(reload))
            );

        // 读内容要 await，而渲染是同步的 —— 先把框画出来，读到了再填。
        void (async () => {
            try {
                const content = await sync.service.readGitignore();
                // 用户可能在读盘那几百毫秒里已经动手了 —— 别把输入盖掉。
                if (content !== undefined && !dirty) {
                    created = true;
                    pending = content;
                    areaEl.value = content;
                }
            } catch (err) {
                // 读不出来不该让整页崩：徽标留在「尚未创建」，用户仍然可以写一份新的。
                logger.debug("could not read .gitignore", err);
            }
            refreshStatus();
        })();
    }

    /**
     * 「让 git 不再跟踪图片」：**检查 → 确认 → 执行**（2026-10-02）。
     *
     * ## 为什么是三步而不是直接改
     *
     * 这个动作把图片从 git 里摘出去，而摘出去之后它们只剩 R2 那一份 —— 别的设备拉取
     * 这次改动时，工作区里那些图片会被 git 删掉、再由图片同步补回来。所以在此之前
     * 必须确认「云端已经有每一张」，否则丢的是真东西。那一步要列一次远端清单，
     * 花一两秒，因此先给一条即时反馈。
     *
     * ## 三道闸
     *
     * 1. **图片同步得配好**（否则这些图片没有第二个家）；
     * 2. **每一张都已经在 R2 上**（`plan()` 里没有待上传的条目）—— 要问一次远端；
     * 3. **规则形状与图片同步的范围必须对得上**，见下。
     *
     * ## 第 3 道闸：两种形状各有各的前提（2026-10-02 用户问「不能写图片格式吗」之后加的）
     *
     * - 图片文件夹是**具体的**（`attachments` 之类）→ 用**按文件夹**：范围与图片同步
     *   镜像的文件夹完全重合，一条原则「图片同步管的，git 不管」。
     * - 图片文件夹是**整个库**（默认的 `[""]`）→ 用**按扩展名**：那种配置下按文件夹写
     *   等于让 git 什么都不同步，而按扩展名只放走图片、不动别的文件。
     *
     * 反过来用会漏东西：扩展名规则管的是**全库**，而图片同步只镜像你配的那几个文件夹
     * —— 文件夹之外的图片会同时退出 git 和 R2（两边都不管）。所以这里**不让**用户在
     * 错误的配置下选错形状，而是直接拒绝并告诉他该怎么改。
     *
     * @param onDone 执行完之后刷新那个代码框（见 `renderGitignore` 里 `reload` 的说明）。
     */
    private async untrackImageFolders(onDone: () => Promise<void>): Promise<void> {
        const t = this.obsync.t;
        const copy = t.settings.sync.untrack;
        const sync = this.obsync.sync;
        if (!sync) return;

        const raw = normalizeFolders(this.obsync.settings.images.folders);
        // 空串 = 整个库（见 `normalizeFolder`）：它既是「没有具体文件夹」，
        // 也是「按扩展名」那种形状成立的前提。
        const wholeVault = raw.includes("");
        const folders = raw.filter((folder) => folder !== "");
        if (wholeVault) {
            // 整个库 → 只有按扩展名说得通；但图片同步覆盖全库时，扩展名清单必须
            // 与它的判断一致，所以这里直接把两道前提并成一条话说清楚。
        } else if (folders.length === 0) {
            this.obsync.notifier.warn(copy.needFolders);
            return;
        }

        const service = this.obsync.images?.service;
        if (!service || !service.isConfigured()) {
            this.obsync.notifier.warn(copy.needCloud);
            return;
        }

        // 远端清单要一会儿，先给一条反馈 —— 否则点了按钮像是没反应。
        this.obsync.notifier.info(copy.checking);

        let pendingUploads: number;
        try {
            const plan = await service.plan();
            pendingUploads = plan.entries.filter((entry) => entry.action === "upload").length;
        } catch (err) {
            // 列不出清单（网络 / 凭据）时**不放行**：这一步的意义就是确认云端有每一张。
            this.obsync.notifier.reportError(err, copy.needCloud);
            return;
        }
        if (pendingUploads > 0) {
            this.obsync.notifier.warn(copy.notUploaded.replace("{count}", String(pendingUploads)));
            return;
        }

        new ConfirmUntrackImagesModal(
            this.obsync.app,
            t,
            folders,
            wholeVault ? "extensions" : "folders",
            SYNC_EXTENSIONS,
            (mode) => this.runUntrackImages(mode, folders, onDone)
        ).open();
    }

    /** 确认之后的执行：写 `.gitignore` → 摘索引 → 汇报。 */
    private async runUntrackImages(
        mode: UntrackMode,
        folders: string[],
        onDone: () => Promise<void>
    ): Promise<void> {
        const t = this.obsync.t;
        const copy = t.settings.sync.untrack;
        const sync = this.obsync.sync;
        if (!sync) return;

        try {
            // 先把要摘的路径算出来 —— 按扩展名那种形状得**问 git** 哪些图片已被跟踪
            // （`.gitignore` 对已跟踪的文件毫无作用，见 `imagesIgnore.ts` 的文件头）。
            let untrackPaths: string[];
            let rules: string[];
            if (mode === "extensions") {
                rules = extensionIgnoreRules(SYNC_EXTENSIONS);
                const tracked = await sync.service.listTrackedPaths();
                untrackPaths = tracked.filter((path) => isImagePath(path, SYNC_EXTENSIONS));
            } else {
                rules = folders.map((folder) => ignoreRuleFor(folder));
                untrackPaths = folders;
            }

            // 先读磁盘上的现状再合并：设置页那个框里可能有**没保存**的改动，
            // 而这一步必须以磁盘为准（否则会把用户没保存的编辑悄悄写下去）。
            const current = (await sync.service.readGitignore()) ?? "";
            const merged = mergeRuleLines(current, rules);
            if (merged.added.length > 0) {
                await sync.service.writeGitignore(merged.content);
            }

            // 摘索引。`--ignore-unmatch` 保证「本来就没跟踪」时不报错。
            await sync.service.untrackPaths(untrackPaths);

            if (merged.added.length === 0) {
                this.obsync.notifier.info(copy.nothing);
            } else {
                this.obsync.notifier.success(
                    copy.done
                        .replace("{rules}", String(merged.added.length))
                        .replace("{files}", String(untrackPaths.length))
                );
            }
            // 框里那份现在是旧的（我们刚在磁盘上加了规则），而框是失焦即保存的 ——
            // 不刷新的话，用户接着改一个字再点走就会把新规则整份覆盖掉。
            await onDone();
        } catch (err) {
            this.obsync.notifier.reportError(err, copy.failed);
        }
    }

    /**
     * 标签四：图片同步（R2 双副本）。
     *
     * 与「仓库同步」页同构：**注意事项 → 设置项 → 操作与结果**（两页都没有页首标题，
     * 2026-10-06 删 —— 页签名就是页名）。
     * 差别在注意事项的分量 —— 那页的坑是「数据可能丢」，这页的坑是
     * 「文件可能被**删掉**」，所以三条提示必须留在最上方，不能塞进单项描述。
     */
    private renderImages(): void {
        const t = this.obsync.t;
        const images = this.obsync.settings.images;
        const service = this.obsync.images?.service;

        const notes = this.containerEl.createDiv({ cls: "obsync-image-notes" });
        notes.createDiv({
            cls: "obsync-image-notes-heading",
            text: t.settings.images.notesHeading,
        });
        const noteList = notes.createEl("ul");
        for (const note of t.settings.images.notes) {
            noteList.createEl("li", { text: note });
        }

        // ── 操作 ──
        //
        // **放在这一页最前面**（2026-10-02）：用户的原话是「图中的功能比较常用，应该放到
        // 页面最前面才对」。三个动作按钮与「打开图片管理」都是进这一页就想点的东西，
        // 而此前它们沉在四个设置节的最底下 —— 要滚过 R2 连接、冲突策略、压缩默认值
        // 才能看到，而一旦配好这三段就再也不会去看。
        //
        // 三个动作按钮挂在**组标题那一行**：以前它们是「一整条只有按钮的卡片」，
        // 左半边空着 —— 用户截图里那条最丑的横条就是它（仓库同步页的
        // 「连接测试」同病，同样改掉了）。
        const actions = this.openSection(t.settings.images.actionsHeading);

        if (service) {
            // 结果区在动作按钮**下面**、入口行**上面**：它说的就是刚点的那一下。
            const resultEl = actions.rows.createDiv({ cls: "obsync-diagnostics" });
            this.renderImageActions(actions.heading, resultEl, service);
        } else {
            // 装配层没给出服务（理论上不会发生）—— 说明白，而不是给一堆点了没反应的按钮。
            // 注意这里**不能 return**：这一节现在排在最前面，早退会把整页剩下的设置
            // 全部吞掉（它们并不需要这个服务）。
            actions.rows.createEl("p", {
                cls: "setting-item-description",
                text: t.images.notice.notConfigured,
            });
        }

        // 图片管理标签页的入口。挂在这里而不是只留命令面板：设置页是用户排查
        // 「我库里这些图到底是什么状态」时的必经之路，而命令面板只有**已经知道
        // 有这个功能**的人才找得到。
        new Setting(actions.rows)
            .setName(t.settings.images.openManager)
            .setDesc(t.settings.images.openManagerDesc)
            .addButton((button) =>
                button.setButtonText(t.settings.images.openManager).onClick(() => {
                    void this.obsync.openImageManager();
                })
            );

        // 这一节没有自己的标题（页面标题「图片同步」就在上面），所以开一个无标题的组。
        const basics = this.openGroup();

        new Setting(basics)
            .setName(t.settings.images.enabled)
            .setDesc(t.settings.images.enabledDesc)
            .addToggle((toggle) =>
                toggle.setValue(images.enabled).onChange(async (value) => {
                    images.enabled = value;
                    // 不重绘：这一页没有「可用性由 enabled 决定」的控件。
                    // 定时器在**逻辑层**读同一个字段（features/images/index.ts），
                    // 所以这里不需要额外做什么，拨完即生效。
                    await this.commit();
                })
            );

        // 「变动后自动同步」：`[延时] 秒 [开关]`，与下面「按周期同步」同一形状。
        //
        // 2026-10-06 加（用户提议、讨论后定形，见 `docs/image-sync-design.md`）。
        // 它排在总开关下面、周期那一行上面，因为它是**本机改动的主力**：
        // 周期那条现在只管「把别处的变化拉回来」。
        const changeSync = new Setting(basics)
            .setName(t.settings.images.changeSync)
            .setDesc(t.settings.images.changeSyncDesc);

        this.addNumberField(changeSync, {
            get: () => images.imageChangeDelaySeconds,
            apply: async (value) => {
                images.imageChangeDelaySeconds = value;
                await this.commit();
            },
            // 与 `normalizeSettings` 里那一句钳制一致。
            // 下限 5 秒：比这更密的话，一次编辑会话会被切成好几轮；
            // 上限 600 秒：再长就与下面「按周期同步」那一轮重了。
            min: 5,
            max: 600,
            ariaLabel: t.settings.images.changeSyncDelayAria,
            unit: t.settings.images.secondsUnit,
        });

        changeSync.addToggle((toggle) =>
            toggle
                .setValue(images.imageChangeSyncEnabled)
                .onChange(async (value) => {
                    images.imageChangeSyncEnabled = value;
                    await this.commit();
                })
        );

        // 「按周期同步」紧跟在总开关下面（2026-10-02 挪的；原先它排在「冲突与删除」
        // 那一节的**末尾**，与它实际管的事毫无关系）。
        //
        // 形状与「仓库同步」页的「定时同步」一致：`[周期] 单位 [开关]`。周期**没有**
        // 「0 = 关闭」的含义（`normalizeSettings` 钳在 5–1440）——「关」由这个开关
        // 表达，于是数字里不必再有一个魔法值。
        const periodic = new Setting(basics)
            .setName(t.settings.images.autoSync)
            .setDesc(t.settings.images.autoSyncDesc);

        this.addNumberField(periodic, {
            get: () => images.autoSyncMinutes,
            apply: async (value) => {
                images.autoSyncMinutes = value;
                await this.commit();
            },
            // 下限 5：每 1 分钟跑一轮整库比对没有意义（与 compressQuality 下限 10 同源）。
            // 与 `normalizeSettings` 里 `images.autoSyncMinutes` 的钳制一致。
            min: 5,
            max: 24 * 60,
            ariaLabel: t.settings.images.intervalAria,
            unit: t.settings.images.minutesUnit,
        });

        periodic.addToggle((toggle) =>
            toggle
                .setValue(images.autoSyncEnabled)
                .onChange(async (value) => {
                    images.autoSyncEnabled = value;
                    await this.commit();
                })
        );

        // 「需要图片同步的文件夹」：名称/描述一行，下面**同一行**是
        // `[输入框] [浏览…] [恢复默认]`，再下面列出已经加入的文件夹（各带一个删除按钮）。
        //
        // 2026-10-02 用户两次要求定下的形状：
        // ① 先要「路径文本框和浏览、恢复默认按钮在下一行展示」（框挤在
        //    `.setting-item-control` 里只有几百像素，描述四行、框里只看得见一个 `.`）；
        // ② 再要「输入框和浏览、恢复默认按钮在同一行」「不需要拉高度」「输入时下方给
        //    候选辅助」「可以添加多个文件夹，在下方列出并提供删除按钮」。
        //
        // 于是它从「一个多行文本框 = 整个列表」改成「一个**添加**输入框 + 一份列表」：
        // 手打路径的错法（`/attachments/`、`assets//img`、根本不存在的目录）以前全都
        // 没有任何提示，现在一边有候选可选、一边有列表能看见加进去的是什么。
        new Setting(basics)
            .setName(t.settings.images.folders)
            .setDesc(t.settings.images.foldersDesc);

        const addRow = new Setting(basics)
            // 两个类分两次给：`setClass` 在 Obsidian 里是 `addClass`（追加），
            // 一次给一整串会被当成一个类名。
            .setClass("obsync-inline-actions")
            .setClass("obsync-inline-field");

        // 候选下拉：绝对定位在输入框下方（CSS 里给 `position: absolute`），
        // 默认收起，有候选时才加 `is-open`。
        const suggestEl = addRow.settingEl.createDiv({ cls: "obsync-path-suggest" });

        // 加一个文件夹。`normalizeFolders` 负责去重与归一（`.` → 整个库），
        // 重复加入是**无害的空操作** —— 用户从候选里挑一个已经加过的，不该报错。
        const addFolder = (raw: string): void => {
            const next = normalizeFolders([...images.folders, raw]);
            const changed = next.length !== images.folders.length;
            if (changed) images.folders = next;
            // **无论有没有真的加进去都清空输入框**：留着原文会让下一次回车
            // 把同一个路径再加一遍（看起来像「加了两次」）。
            folderInput?.setValue("");
            if (!changed) return;
            // 重绘：列表要立刻出现新那一行，「还没有指定文件夹」的提示也要消失。
            void this.commit(true);
        };

        let folderInput: TextComponent | undefined;
        let active = -1;

        const options = (): FolderOption[] =>
            folderOptions(this.obsync.app, t, images.folders).slice(0, 50);

        const closeSuggest = (): void => {
            active = -1;
            suggestEl.removeClass("is-open");
            suggestEl.empty();
        };

        const renderSuggest = (query: string): void => {
            const matches = filterFolderOptions(options(), query);
            suggestEl.empty();
            active = -1;
            if (matches.length === 0) {
                closeSuggest();
                return;
            }

            matches.forEach((option, index) => {
                const item = suggestEl.createDiv({ cls: "obsync-path-suggest-item" });
                item.createDiv({ cls: "obsync-path-suggest-label", text: option.label });
                if (option.included) {
                    item.createEl("small", {
                        cls: "obsync-suggestion-meta",
                        text: t.settings.images.folderPickerIncluded,
                    });
                }
                // 用 `mousedown` 而不是 `click`：`click` 之前输入框会先 blur，
                // 那个处理器会把整张列表收起来，点击就落空了。
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    addFolder(option.path);
                });
                item.addEventListener("mouseenter", () => {
                    active = index;
                });
            });

            suggestEl.addClass("is-open");
        };

        const highlight = (): void => {
            const items = Array.from(suggestEl.children) as HTMLElement[];
            items.forEach((item, index) => item.toggleClass("is-active", index === active));
        };

        addRow.addText((text) => {
            folderInput = text;
            text.inputEl.addClass("obsync-folders-input");
            text.setPlaceholder(t.settings.images.foldersPlaceholder).setValue("");
            text.inputEl.addEventListener("input", () => renderSuggest(text.inputEl.value));
            text.inputEl.addEventListener("focus", () => renderSuggest(text.inputEl.value));
            text.inputEl.addEventListener("blur", () => {
                // 延后一点再收：点候选时这条会先跑，早收就等于点不到（见上面的 mousedown）。
                window.setTimeout(closeSuggest, 150);
            });
            text.inputEl.addEventListener("keydown", (event) => {
                const items = Array.from(suggestEl.children) as HTMLElement[];
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    if (items.length === 0) return;
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    active = (active + step + items.length) % items.length;
                    highlight();
                    return;
                }
                if (event.key === "Escape") {
                    closeSuggest();
                    return;
                }
                if (event.key !== "Enter") return;
                event.preventDefault();
                // 有高亮就加它，否则加用户打进去的那一串（归一与去重交给 addFolder）。
                const chosen = active >= 0 ? filterFolderOptions(options(), text.inputEl.value)[active] : undefined;
                const raw = chosen ? chosen.path : text.inputEl.value;
                if (!raw.trim()) return;
                addFolder(raw);
            });
        });

        addRow.addButton((button) =>
            button.setButtonText(t.settings.images.foldersBrowse).onClick(() => {
                new FolderSuggestModal(this.obsync.app, t, images.folders, (folder) => {
                    addFolder(folder);
                }).open();
            })
        );

        addRow.addButton((button) =>
            button
                .setButtonText(t.settings.images.foldersReset)
                // 已经是默认值就置灰：点了什么都不发生，只会让人怀疑按钮是坏的。
                // 置灰而不改值 —— 与仓库同步页的总开关同一个道理。
                .setDisabled(isDefaultFolders(images.folders))
                .onClick(async () => {
                    images.folders = normalizeFolders([...DEFAULT_SETTINGS.images.folders]);
                    await this.commit(true);
                })
        );

        // 已经加入的文件夹：一行一个 + 删除按钮。
        //
        // 用一整行 `Setting` 而不是一堆小药丸：这一页的行都是这个形状，而路径本身
        // 可能很长（`assets/images/inbox`），药丸挤在输入框下面会折成两三行。
        if (images.folders.length === 0) {
            basics.createEl("p", {
                cls: "setting-item-description",
                text: t.settings.images.foldersEmpty,
            });
        }

        for (const folder of images.folders) {
            new Setting(basics)
                .setClass("obsync-folder-row")
                // 空串 = 整个库，直接显示成空行会像「坏了一行」。
                .setName(folder === "" ? t.settings.images.folderPickerRoot : folder)
                .addExtraButton((button) =>
                    button
                        .setIcon("trash")
                        .setTooltip(t.settings.images.foldersRemove)
                        .onClick(async () => {
                            // 删掉最后一个 = 一个文件夹都不管（`normalizeSettings` 允许
                            // 空列表），页面会改成「一个文件夹都没指定」的提示。
                            images.folders = images.folders.filter((item) => item !== folder);
                            await this.commit(true);
                        })
                );
        }

        // ── 连接 ──
        const connection = this.openSection(t.settings.images.connectionHeading).rows;

        new Setting(connection)
            .setName(t.settings.images.accountId)
            .setDesc(t.settings.images.accountIdDesc)
            .addText((text) =>
                text
                    .setPlaceholder(t.settings.images.accountIdPlaceholder)
                    .setValue(images.accountId)
                    .onChange(async (value) => {
                        images.accountId = value.trim();
                        await this.commit();
                    })
            );

        new Setting(connection)
            .setName(t.settings.images.bucket)
            .setDesc(t.settings.images.bucketDesc)
            .addText((text) =>
                text.setValue(images.bucket).onChange(async (value) => {
                    images.bucket = value.trim();
                    await this.commit();
                })
            );

        new Setting(connection)
            .setName(t.settings.images.accessKeyId)
            .setDesc(t.settings.images.accessKeyIdDesc)
            .addText((text) =>
                text.setValue(images.accessKeyId).onChange(async (value) => {
                    images.accessKeyId = value.trim();
                    await this.commit();
                })
            );

        this.renderR2Secret(connection);

        new Setting(connection)
            .setName(t.settings.images.prefix)
            .setDesc(t.settings.images.prefixDesc)
            .addText((text) =>
                text
                    // 刻意**不给占位符**：示例值（对象键前缀）大小写敏感，而审核的
                    // `ui/sentence-case` 会把它报成「应为 'Images'」——照着改会让用户
                    // 填出一个不对的前缀。示例已经在描述里（「例如 images」）。
                    .setValue(images.prefix)
                    .onChange(async (value) => {
                        images.prefix = value.trim();
                        await this.commit();
                    })
            );

        new Setting(connection)
            .setName(t.settings.images.publicBaseUrl)
            .setDesc(t.settings.images.publicBaseUrlDesc)
            .addText((text) =>
                text
                    .setPlaceholder("https://img.example.com")
                    .setValue(images.publicBaseUrl)
                    .onChange(async (value) => {
                        images.publicBaseUrl = value.trim();
                        await this.commit();
                    })
            );

        // ── 冲突与删除 ──
        const conflict = this.openSection(t.settings.images.conflictHeading).rows;

        new Setting(conflict)
            .setName(t.settings.images.conflictPolicy)
            .setDesc(t.settings.images.conflictPolicyDesc)
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("newer", t.settings.images.conflictNewer)
                    .addOption("local", t.settings.images.conflictLocal)
                    .addOption("remote", t.settings.images.conflictRemote);
                dropdown.setValue(images.conflictPolicy);
                dropdown.onChange(async (value) => {
                    images.conflictPolicy = value as typeof images.conflictPolicy;
                    await this.commit();
                });
            });

        new Setting(conflict)
            .setName(t.settings.images.deleteRemotePolicy)
            .setDesc(t.settings.images.deleteRemotePolicyDesc)
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("ask", t.settings.images.deleteRemoteAsk)
                    .addOption("always", t.settings.images.deleteRemoteAlways)
                    .addOption("never", t.settings.images.deleteRemoteNever);
                dropdown.setValue(images.deleteRemotePolicy);
                dropdown.onChange(async (value) => {
                    images.deleteRemotePolicy = value as typeof images.deleteRemotePolicy;
                    await this.commit();
                });
            });

        // ── 裁剪与压缩的默认值 ──
        const compress = this.openSection(t.settings.images.compressHeading).rows;

        this.addNumberField(
            new Setting(compress)
                .setName(t.settings.images.compressQuality)
                .setDesc(t.settings.images.compressQualityDesc),
            {
                get: () => images.compressQuality,
                apply: async (value) => {
                    images.compressQuality = value;
                    await this.commit();
                },
                // 下限 10 而不是 1：质量 1 的 jpeg 基本不可看，而用户多半是手滑拖到底。
                // 与 `normalizeSettings` 里 `images.compressQuality` 的钳制一致。
                min: 10,
                max: 100,
                ariaLabel: t.settings.images.compressQuality,
            }
        );

        this.addNumberField(
            new Setting(compress)
                .setName(t.settings.images.compressMaxEdge)
                .setDesc(t.settings.images.compressMaxEdgeDesc),
            {
                get: () => images.compressMaxEdge,
                apply: async (value) => {
                    images.compressMaxEdge = value;
                    await this.commit();
                },
                // 0 是**有意义**的：表示不缩放。上限与 `normalizeSettings` 的钳制一致。
                min: 0,
                max: 20_000,
                ariaLabel: t.settings.images.compressMaxEdge,
            }
        );

        new Setting(compress)
            .setName(t.settings.images.compressFormat)
            .setDesc(t.settings.images.compressFormatDesc)
            .addDropdown((dropdown) => {
                for (const format of ["keep", "jpeg", "webp", "png"] as const) {
                    dropdown.addOption(format, t.images.formatOption[format]);
                }
                dropdown.setValue(images.compressFormat);
                dropdown.onChange(async (value) => {
                    images.compressFormat = value as typeof images.compressFormat;
                    await this.commit();
                });
            });
    }

    /**
     * R2 的 Secret Access Key。
     *
     * 与平台令牌同一套做法（内存暂存 + 失焦落盘 + 状态徽标），但多一个「保存」按钮：
     * 这个字段没有「测试」可以顺带触发落盘，而用户粘完密钥之后最常见的动作是
     * 直接去点下面的「测试连接」—— 那时如果还没落盘，测的就是**旧值**，
     * 报出来的错会让人去怀疑一个根本没被使用的密钥。
     */
    private renderR2Secret(container: HTMLElement): void {
        const t = this.obsync.t;
        const label = t.settings.images.secretKey;

        let pending = this.obsync.secretStore.getSecretValue("r2") ?? "";
        let statusEl: HTMLElement | undefined;

        const refreshStatus = (): void => {
            if (!statusEl) return;
            const configured = pending.trim().length > 0;
            statusEl.setText(
                configured
                    ? t.settings.images.secretConfigured
                    : t.settings.images.secretNotConfigured
            );
            statusEl.toggleClass("obsync-badge-ok", configured);
            statusEl.toggleClass("obsync-badge-muted", !configured);
        };

        const setting = new Setting(container)
            .setName(label)
            .setDesc(t.settings.images.secretKeyDesc)
            .addText((text) => {
                text.inputEl.type = "password";
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.setPlaceholder(t.settings.images.secretPlaceholder);
                text.setValue(pending);
                text.onChange((value) => {
                    pending = value;
                });
            })
            .addButton((button) =>
                button.setButtonText(t.settings.images.secretSave).onClick(() => {
                    this.obsync.secretStore.setSecretValue("r2", pending);
                    refreshStatus();
                    this.obsync.notifier.success(t.settings.images.secretSaved);
                })
            )
            .addExtraButton((button) =>
                button
                    .setIcon("trash")
                    .setTooltip(t.settings.images.secretClear)
                    .onClick(() => {
                        this.obsync.secretStore.clearSecretValue("r2");
                        pending = "";
                        setting.settingEl.empty();
                        this.display();
                        this.obsync.notifier.info(t.settings.images.secretCleared);
                    })
            );

        statusEl = setting.nameEl.createSpan({ cls: "obsync-badge" });
        refreshStatus();
    }

    /**
     * 三个操作按钮（挂在「操作」那一节的**标题行**上）+ 结果区。
     *
     * 按钮不自己占一行：没有名称的设置行会把控件顶到最右边，左半边空着 ——
     * 那正是用户截图里最丑的一处。挂到标题行上之后，标题在左、按钮在右。
     */
    private renderImageActions(
        heading: Setting,
        resultEl: HTMLElement,
        service: ImageSyncService
    ): void {
        const t = this.obsync.t;

        heading
            .addButton((button) =>
                button.setButtonText(t.settings.images.test).onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText(t.settings.images.testing);
                    resultEl.empty();
                    try {
                        const result = await service.testConnection();
                        if (result.ok) {
                            resultEl.createEl("p", {
                                cls: "obsync-diag-ok",
                                text: t.settings.images.testOk(this.obsync.settings.images.bucket),
                            });
                        } else {
                            resultEl.createEl("p", {
                                cls: "obsync-diag-failed",
                                text: this.obsync.notifier.describeError(
                                    result.error,
                                    t.settings.images.testFailed
                                ),
                            });
                        }
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText(t.settings.images.test);
                    }
                })
            )
            .addButton((button) =>
                button.setButtonText(t.settings.images.preview).onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText(t.settings.images.previewing);
                    try {
                        this.renderPlanResult(
                            resultEl,
                            t.images.plan.heading,
                            await service.plan()
                        );
                    } catch (err) {
                        resultEl.empty();
                        resultEl.createEl("p", {
                            cls: "obsync-diag-failed",
                            text: this.obsync.notifier.describeError(err, t.images.notice.previewFailed),
                        });
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText(t.settings.images.preview);
                    }
                })
            )
            .addButton((button) =>
                button
                    .setButtonText(t.settings.images.syncNow)
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        button.setButtonText(t.settings.images.syncing);
                        try {
                            const summary = await service.run();
                            this.renderSummaryResult(resultEl, summary);
                        } catch (err) {
                            resultEl.empty();
                            resultEl.createEl("p", {
                                cls: "obsync-diag-failed",
                                text: this.obsync.notifier.describeError(err, t.images.notice.syncFailed),
                            });
                        } finally {
                            button.setDisabled(false);
                            button.setButtonText(t.settings.images.syncNow);
                        }
                    })
            );
    }

    /** 把一份计划渲染成用户能逐条核对的清单。 */
    private renderPlanResult(container: HTMLElement, heading: string, plan: SyncPlan): void {
        const t = this.obsync.t;
        container.empty();

        const counts = { upload: 0, download: 0, skip: 0, conflict: 0 };
        for (const entry of plan.entries) counts[entry.action] += 1;

        container.createEl("p", {
            cls: "obsync-diag-ok",
            // 冲突数单独列出来：它是这一页上唯一「有一边的改动会消失」的情况，
            // 而它不是用户主动要求的动作。
            text: `${heading} — ${t.images.plan.counts(
                counts.upload,
                counts.download,
                counts.conflict,
                counts.skip
            )}`,
        });

        // 截断要说出来：它意味着「云端有这一份但没被列到」会被当成缺一份而重传。
        // 那不是错误，但用户看到「明明一样却要重传」会以为是 bug。
        if (plan.truncated) {
            container.createEl("p", { cls: "obsync-diag-failed", text: t.images.plan.truncated });
        }

        const interesting = plan.entries.filter((entry) => entry.action !== "skip");
        if (interesting.length === 0) {
            container.createEl("p", { cls: "obsync-diag-skipped", text: t.images.plan.empty });
            return;
        }

        const list = container.createEl("ul", { cls: "obsync-diag-list" });
        // 只列前 50 条：一次列几千行既没人看，也会让设置页卡住。
        for (const entry of interesting.slice(0, 50)) {
            // 冲突用失败色标出来 —— 它是这一页上唯一「有东西会被覆盖掉」的情况。
            // 这一页存在的意义就是让用户在执行前看清那些。
            const cls = entry.action === "conflict" ? "obsync-diag-failed" : "obsync-diag-ok";
            const item = list.createEl("li", { cls });
            item.createSpan({
                text: `${t.images.plan.action[entry.action]} · ${t.images.plan.reason[entry.reason]} · `,
            });
            item.createSpan({ text: entry.path });
        }
        if (interesting.length > 50) {
            container.createEl("p", {
                cls: "obsync-diag-skipped",
                text: t.images.plan.more(interesting.length - 50),
            });
        }
    }

    /** 一轮执行之后的结果。 */
    private renderSummaryResult(container: HTMLElement, summary: SyncSummary): void {
        const t = this.obsync.t;
        container.empty();

        const didNothing = summary.uploaded === 0 && summary.downloaded === 0;

        container.createEl("p", {
            cls: summary.failed > 0 ? "obsync-diag-failed" : "obsync-diag-ok",
            text: didNothing
                ? t.images.notice.syncNothing
                : t.images.notice.syncDone(summary.uploaded, summary.downloaded),
        });

        // 截断只影响「结果完不完整」，不再是「不敢删」的说明（删除已经不在计划里）。
        if (summary.truncated) {
            container.createEl("p", { cls: "obsync-diag-failed", text: t.images.plan.truncated });
        }

        if (summary.errors.length > 0) {
            container.createEl("p", {
                cls: "obsync-diag-failed",
                text: t.images.notice.syncFailedMany(summary.errors.length),
            });
            const list = container.createEl("ul", { cls: "obsync-diag-list" });
            for (const entry of summary.errors.slice(0, 20)) {
                const item = list.createEl("li", { cls: "obsync-diag-failed" });
                item.createSpan({ text: `${entry.path}：` });
                item.createSpan({ text: entry.message });
            }
        }
    }

    /**
     * 连接测试。
     *
     * 存在的理由：**鉴权配得对不对，光看设置项判断不了** —— 令牌填了不代表有效，
     * 只有真的去连一次才有答案。而这个按钮就是「真的去连一次」。
     *
     * 放在同步设置的最后：用户配完远端与令牌，顺手就能验一下。
     */
    /**
     * 远端地址那一行（就地可改的输入框，排在「连接测试」之前）。
     *
     * 行为与仓库同步面板顶部那一行**完全一致**（`bindRemoteInput`）：脱敏回显、
     * 失焦/回车才保存、明显写错的输入拦住并把框恢复原样、成功后强制刷新。
     *
     * **行要同步建出来、地址异步填进去**：`git.getRemoteUrl()` 是异步的，若把建行
     * 也放进 `await` 之后，这一行会被追加到整页的最后（实测：跑到「忽略规则」后面），
     * 而用户要的是它排在「连接测试」之前 —— 那正是「先填地址再测连接」的读法。
     */
    private renderRemoteRow(container: HTMLElement): void {
        const sync = this.obsync.sync;
        if (!sync) return;
        const t = this.obsync.t;

        let input: HTMLInputElement | undefined;
        new Setting(container)
            .setName(t.sync.remoteLabel)
            .setClass("obsync-remote-row")
            .addText((text) => {
                input = text.inputEl;
                text.setPlaceholder(t.sync.editRemotePlaceholder);
                text.inputEl.addClass("obsync-remote-input");
            })
            // 「打开仓库同步面板」与地址同一行（2026-10-04 用户要求合并）。
            // 面板本身还有三个入口（命令面板 / 侧栏图标 / 状态栏），但**正在配置它的
            // 这一页**最该有一个 —— 那正是用户会想「让我看一眼现在什么状态」的地方。
            .addButton((button) =>
                button
                    .setButtonText(t.settings.sync.openView)
                    .setTooltip(t.settings.sync.openViewDesc)
                    .onClick(() => sync.openView())
            );

        // 读不到（还没配远端 / 不是仓库）就当空 —— 空框正是「可以填一个」的样子，
        // 而不是显示一个假的地址。
        void sync.git
            .getRemoteUrl()
            .catch(() => undefined)
            .then((currentUrl) => {
                if (!input) return;
                bindRemoteInput(input, {
                    currentUrl,
                    setRemoteUrl: (url) => sync.git.setRemoteUrl(url),
                    refresh: async () => {
                        await sync.service.refresh({ force: true });
                    },
                    notify: this.obsync.notifier,
                    t,
                });
            });
    }

    /**
     * git 可执行文件路径那一行（+ 「git 从哪儿来」的下载链接）。
     *
     * 2026-10-04 从无标题设置组里**提到「连接测试」之前**：这一页的结构约定是
     * 「测试按钮之前的每一项都是测试能通过的充要条件」，而 git 能不能跑正是
     * 连接测试查的头一件事。原来它沉在「定时同步 / 提交模板 / 整合策略」后面。
     */
    private renderGitPathRow(container: HTMLElement): void {
        const t = this.obsync.t;
        const settings = this.obsync.settings.sync;

        // git 可执行文件路径：**输入框整行、旁边一个「浏览…」**（2026-10-02 用户要求：
        // 「输入框应该单独一行，并提供浏览按钮打开资源管理器」）。
        //
        // 桌面上的路径（`C:\Program Files\Git\cmd\git.exe`）比 `.setting-item-control`
        // 那几百像素长得多，挤在右边只能看见开头一截；`.obsync-stacked` 把名称/描述
        // 与控件排成上下两行、控件占满整行（app.css 在窄容器里就是这么折的）。
        // 2026-10-04 用户要求：「SyncHub 不捆绑 git 的那句提示，放到留空使用系统 PATH 那条
        // 提示后面展示」，随后又说「那句应该换行显示」—— 所以两句在**同一段描述里**，
        // 中间一个 `<br>`。分成两段（两个 `<p>`）时下载提示看起来像**另一项设置**；
        // 而同一段里不换行又会读成一句话，看起来像 PATH 那半句还没说完。
        //
        // 链接接在描述**末尾**（同一个元素里）：设置页的描述是纯文本，光写
        // `git-scm.com` 用户得自己复制到浏览器；而 `target=_blank` 就够了 ——
        // Obsidian 主进程注册了 `setWindowOpenHandler`，http(s) 一律交给系统浏览器
        // （`will-navigate` 那道守卫保证它不会把设置弹窗导航走）。
        const row = new Setting(container)
            .setName(t.settings.sync.gitPath)
            .setDesc(t.settings.sync.gitPathDesc)
            .setClass("obsync-stacked");

        row.descEl.createEl("br");
        row.descEl.appendText(t.settings.sync.gitPathDownload);

        // 第二个类**单独加**：`Setting.setClass()` 走的是 `classList.add`，一次只能给
        // 一个 token —— 传 `"a b"` 在真机上直接抛 `InvalidCharacterError`（测试替身
        // 原样存字符串，所以这条路只有真机/预览能发现，2026-10-04 被预览抓到）。
        row.settingEl.addClass("obsync-git-path");

        row.descEl.createEl("a", {
            text: t.settings.sync.gitPathLink,
            // 用 `attr` 而不是 `href`：`createEl` 的 `attr` 在真机与测试替身里都生效，
            // 而测试要能读到这个网址（它是这条提示的全部意义）。
            attr: { href: GIT_DOWNLOAD_URL, target: "_blank", rel: "noopener" },
        });

        // 「浏览…」挑完要把值写回这个框（用户得看得见发生了什么），所以留住引用。
        let field: TextComponent | undefined;

        row.addText((text) => {
            field = text;
            text.setPlaceholder("C:\\Program Files\\Git\\cmd\\git.exe")
                .setValue(settings.gitPath)
                .onChange(async (value) => {
                    settings.gitPath = value.trim();
                    await this.commit();
                });
        });

        row.addButton((button) =>
            button.setButtonText(t.settings.sync.gitPathBrowse).onClick(async () => {
                const picked = await pickFile({
                    title: t.settings.sync.gitPathBrowseTitle,
                    // 已经填过就落在它所在的位置：第二次挑（换版本）时省一次翻目录。
                    defaultPath: settings.gitPath.trim() || undefined,
                    // `dontAddToRecent`：别让 git.exe 进系统的「最近使用」
                    // （Obsidian 自己开文件框时也带着这一条）。
                    properties: ["openFile", "dontAddToRecent"],
                    filters: [
                        { name: "git", extensions: ["exe"] },
                        { name: t.settings.sync.gitPathBrowseAllFiles, extensions: ["*"] },
                    ],
                });
                // 用户取消、或者这个环境开不了对话框（移动端 / 将来的 Electron 换了
                // 实现）：什么都不做 —— 上面那个输入框仍然可以手输。
                if (!picked) return;
                settings.gitPath = picked.trim();
                field?.setValue(settings.gitPath);
                await this.commit();
            })
        );
    }

    /**
     * 「初始化 git 仓库」那一行（2026-10-05 用户要求）。
     *
     * ## 为什么它必须在这一页
     *
     * 用户的原话：「把仓库同步中远端地址的设置项移到了设置页了，但是把仓库 git 初始化
     * 漏在了侧边栏面板里，请把仓库初始化按钮也放入设置页，保证仓库同步的基本设置能
     * 全部在设置页中就完成」。在此之前「初始化」只在两处：仓库同步面板「不是仓库」
     * 时的那个按钮、命令面板。而远端地址已经在这一页 —— 于是**新库**上第一步就断了：
     * 没有仓库，地址填了也没用（`diagnose` 第 2 项就是「是不是 git 仓库」，不通过就停）。
     *
     * ## 状态徽标只问**一次**（2026-10-06 用户要求）
     *
     * 用户的原话：「我认为监测过已经是 git 仓库的话，每次点进仓库同步设置页就不用再
     * 主动检测了，直接将标识固定就行，等同步时再验证即可」。在此之前每次重绘都起一个
     * `git is-repo` 子进程，结果回来才填徽标 —— 于是**每切进这一页都能看到徽标「弹」
     * 出来**，既分散注意力、又把下面的说明文字挤下去（那一截由
     * `vaultIsRepo` 与 `.obsync-badge` 的样式一起解决：前者让它一开始就有，后者让
     * 它出现时不再改变行高）。
     *
     * 缓存只活在**内存**里（见 `vaultIsRepo`），所以重启插件后会重新问一次。
     *
     * ## 读不到时什么都不说
     *
     * **不猜「不是仓库」**：把「问不出来」说成「还没有仓库」会让用户去点一个不该点的
     * 按钮 —— 真的不行时 `initRepo` 会报出具体原因，那比这里的猜测准。
     *
     * 已经是仓库时按钮**置灰**（`git init` 幂等，点了也不会坏，但一个「点了什么都不会
     * 发生」的按钮会让人怀疑插件坏了）。为此这一行用了 `initRunning` 那种进度文案 ——
     * 与连接测试那个按钮同一套做法。
     */
    private renderInitRow(container: HTMLElement): void {
        const t = this.obsync.t;
        const sync = this.obsync.sync;
        if (!sync) return;

        const row = new Setting(container)
            .setName(t.settings.sync.initRepo)
            .setDesc(t.settings.sync.initRepoDesc);

        // 状态徽标（「已是 git 仓库」/「还不是 git 仓库」）—— 与令牌那一行同一个类。
        const badge = row.nameEl.createSpan({ cls: "obsync-badge" });

        let button: ButtonComponent | undefined;

        /** 把已知的结果填上去（徽标 + 按钮可用性）。 */
        const apply = (isRepo: boolean): void => {
            badge.setText(isRepo ? t.settings.sync.initDone : t.settings.sync.initNeeded);
            badge.toggleClass("obsync-badge-ok", isRepo);
            badge.toggleClass("obsync-badge-muted", !isRepo);
            button?.setDisabled(isRepo);
        };

        const refresh = (): void => {
            // 已经问过了 → **同步**填上，不再起子进程、也就不会有「弹出来」那一下。
            if (this.vaultIsRepo !== undefined) {
                apply(this.vaultIsRepo);
                return;
            }

            void sync.git
                .isRepo()
                .then((isRepo) => {
                    this.vaultIsRepo = isRepo;
                    apply(isRepo);
                })
                .catch((err) => {
                    logger.debug("could not tell whether the vault is a git repository", err);
                    // 问不出来**不记**（下一次还会再试），界面上也什么都不说。
                    badge.setText("");
                    button?.setDisabled(false);
                });
        };

        row.addButton((created) => {
            button = created;
            created.setButtonText(t.sync.actInit).onClick(async () => {
                created.setDisabled(true);
                created.setButtonText(t.settings.sync.initRunning);
                try {
                    // 与命令面板 / 侧边栏面板走**同一个**插件方法：提示文案与
                    // `.gitignore` 的处理完全一致（见 `ObsyncPlugin.initRepo`）。
                    if (await this.obsync.initRepo()) {
                        // 刚跑完 `git init` 就是答案，**不再去问一次 git**。
                        this.vaultIsRepo = true;
                        apply(true);
                    }
                } finally {
                    created.setButtonText(t.sync.actInit);
                    // 可用性按**已知的事实**恢复 —— 这里不能无条件
                    // `setDisabled(false)`：那会把刚被 `apply(true)` 置灰的按钮
                    // 重新点亮，于是「点完之后还能再点」。
                    created.setDisabled(this.vaultIsRepo === true);
                }
            });
        });

        refresh();
    }

    private renderDiagnostics(): void {
        const t = this.obsync.t;
        const sync = this.obsync.sync;
        if (!sync) return;

        // 「说明 + 一个按钮」合成组标题那一行：以前它们分别是「一段说明」和
        // 「一整条只有按钮的卡片」，后者就是截图里那条空荡荡的横条。
        const { rows, heading } = this.openSection(t.sync.diagnoseHeading);
        heading.setDesc(t.sync.diagnoseDesc);

        // 结果区在按钮**下面**：它说的就是上面那一下的结果。
        const resultEl = rows.createDiv({ cls: "obsync-diagnostics" });

        heading.addButton((button) =>
            button
                .setButtonText(t.sync.diagnoseRun)
                .setCta()
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText(t.sync.diagnoseRunning);
                    resultEl.empty();
                    try {
                        this.renderDiagnosticsResult(resultEl, await sync.service.diagnose());
                    } catch (err) {
                        // diagnose 内部已经把每一步的失败收进报告了，走到这里说明
                        // 是意料之外的异常（比如 statusBar 渲染崩了）。
                        this.obsync.notifier.reportError(err, t.sync.diagnoseHasFailures);
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText(t.sync.diagnoseRun);
                    }
                })
        );
    }

    private renderDiagnosticsResult(
        container: HTMLElement,
        report: DiagnosticsReport
    ): void {
        const t = this.obsync.t;

        container.createEl("p", {
            text: report.ok ? t.sync.diagnoseAllPassed : t.sync.diagnoseHasFailures,
            cls: report.ok ? "obsync-diag-ok" : "obsync-diag-failed",
        });

        // 通过时**必须**说清验到了哪一步。否则「全部通过」会被读成
        // 「推送也没问题」，而这个检查走的是 ls-remote —— 推送路径根本不在范围内
        // （实测：Gitee 的凭据用户名规则只在 push 路径执行，这里发现不了）。
        // 失败时不显示：那时用户手上已经有待处理的条目了。
        if (report.ok) {
            container.createEl("p", {
                text: t.sync.diagnoseScopeNote,
                cls: "obsync-diag-skipped",
            });
        }

        const list = container.createEl("ul", { cls: "obsync-diag-list" });
        for (const check of report.checks) {
            const mark = check.status === "ok" ? "✓" : check.status === "failed" ? "✗" : "–";
            // 类名写成显式字面量而不是模板串拼接：拼出来的类名 grep 不到，
            // 项目自查（scripts/checks.mjs）会把它们报成「定义了没用到」。
            const cls =
                check.status === "ok"
                    ? "obsync-diag-ok"
                    : check.status === "failed"
                      ? "obsync-diag-failed"
                      : "obsync-diag-skipped";
            const item = list.createEl("li", { cls });
            item.createSpan({ text: `${mark} ${t.sync.diagnoseCheck[check.id]}：` });
            item.createSpan({ text: describeCheck(check, t) });
        }
    }
}

/** 把一项检查渲染成用户能看懂的一句话。 */
function describeCheck(check: DiagnosticCheck, t: LocaleStrings): string {
    const d = t.sync.diagnoseDetail;
    const detail = check.detail ?? "";

    switch (check.id) {
        case "git":
            return check.status === "ok" ? d.gitOk : d.gitFailed(detail);
        case "repo":
            return check.status === "ok" ? d.repoOk : d.repoFailed;
        case "remote":
            return check.status === "ok" ? d.remoteOk(detail) : d.remoteFailed;
        case "platform":
            if (check.status === "ok") return d.platformOk(detail);
            // skipped 且带 detail = 平台认得出但没配令牌；不带 = 平台认不出
            return detail ? d.platformNoToken(detail) : d.platformUnknown;
        case "access":
            return check.status === "ok" ? d.accessOk(detail) : detail;
    }
}

/** 供测试与将来复用：从 app 构造设置页。 */
export function createSettingsTab(app: App, plugin: ObsyncPlugin): ObsyncSettingsTab {
    void app;
    return new ObsyncSettingsTab(plugin);
}

/**
 * 当前列表是否就是默认值（仓库根目录）。
 *
 * 两边都过一遍 `normalizeFolders`：设置里的形状保证是归一后的（加载与每次写入
 * 都归一遍），而默认值写的是 `.` —— 不归一的话 `["."]` 与 `[""]` 会被判成不同，
 * 「恢复默认」在刚刚重置完的状态下仍然是可点的。
 */
function isDefaultFolders(folders: string[]): boolean {
    const current = normalizeFolders(folders);
    const fallback = normalizeFolders(DEFAULT_SETTINGS.images.folders);
    return current.length === fallback.length && current.every((item, index) => item === fallback[index]);
}

/**
 * 在按钮的**文字前面**插一个 lucide 图标。
 *
 * ## 为什么不能直接用 `button.setIcon()`
 *
 * Obsidian 的两个实现都在这条路上埋了坑（从真实的 `main.js` 里读出来的）：
 *
 * - `setButtonText(text)` → `buttonEl.setText(text)`，而那一位是
 *   **清空整个元素再写一段文字**（`setText` 收字符串时就是 `textContent = text`）；
 * - `setIcon(icon)`（`ButtonComponent` 上那个）→ `setIcon(buttonEl, icon)`，而
 *   `setIcon` 的实现是「若第一个子节点不是同一个图标，**先删掉它**，再把图标
 *   append 进去」。
 *
 * 两者连用的后果是**只剩图标**：`setButtonText("绑定…").setIcon("link")` 时，
 * 第一个子节点正是刚写进去的那段文字，被 `setIcon` 删掉了。
 *
 * ## 所以自己拼
 *
 * 建一个 `.obsync-button-icon` 容器装图标，再 `prepend` 到文字前面。
 * **顺序**：先 `setButtonText`，再调这个函数；**每次换文字之后都要重新调一次**
 * （「检查更新」那个按钮就是：`setButtonText` 会把上一个图标一起清掉）。
 * 换文字时旧图标已经被 `setText` 清走了，所以这里不需要（也没办法可靠地）去清理它。
 */
function addButtonIcon(button: ButtonComponent, icon: string): void {
    const { buttonEl } = button;
    const holder = buttonEl.createSpan({ cls: "obsync-button-icon" });
    setIcon(holder, icon);
    // `createSpan` 是**追加**在文字后面的，所以还要挪到最前面去。
    // （DOM 的 `prepend` 对已在文档里的节点是「移动」，不会产生第二份。）
    buttonEl.prepend(holder);
}

/**
 * git 官方下载页。设置页「git 可执行文件路径」那一行下方的链接指向它。
 *
 * 写成常量而不是放进 locale：**网址不随语言变**，而且这是唯一一处用到它的地方。
 */
const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";

/**
 * Gitee 的**个人资料页**（设置 → 基本设置 → 个人资料），头像就在这一页换。
 *
 * 实测 2026-10-05：`https://gitee.com/profile` 可用；`/profile/avatar` 是 404 ——
 * 头像没有独立的子页面。Gitee 帮助中心的「个人信息设置」里，`个人资料` / `基本信息`
 * 两个链接指向的也正是这个地址。
 *
 * 与 `GIT_DOWNLOAD_URL` 同一条规矩：**网址不随语言变**，所以是常量而不是 locale。
 * （链接的**文字**在 locale 里，与 `gitPathLink` 一致。）
 */
const GITEE_PROFILE_URL = "https://gitee.com/profile";

/**
 * GitHub 的**个人资料页**（头像就在这一页换）。
 *
 * 与 `GITEE_PROFILE_URL` 成对：设置页那个平台开关选哪个，链接就指向哪个。
 * 网址不随语言变，所以是常量而不是 locale（链接的**文字**在 locale 里）。
 */
const GITHUB_PROFILE_URL = "https://github.com/settings/profile";


