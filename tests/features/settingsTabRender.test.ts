import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { createdSettings, openedModals, resetCreatedSettings, resetOpenedModals } from "../stubs/obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, type ObsyncSettings } from "../../src/core/settings";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { Notifier } from "../../src/core/notice";
import { SecretStore } from "../../src/core/secretStore";
import type { InstallerService } from "../../src/features/installer/installerService";
import type { UpdateChecker } from "../../src/features/installer/updateChecker";
import { ObsyncSettingsTab } from "../../src/settingsTab";
import { createFakeApp, type FakeApp } from "../helpers/fakeApp";

/**
 * 设置页的**渲染冒烟**（安装器那一页）。
 *
 * 这页没有别的测试：它依赖真实 DOM 与 Obsidian 的设置页组件，节点环境里只能
 * 验证「渲染不抛错 + 关键行在场」。之所以值得单独跑一遍，是因为启动冒烟
 * （`pluginBoot.test.ts`）的教训：**装配/渲染里的 TypeError 只有真机才会暴露**，
 * 而设置页是用户每天要点的地方。
 *
 * 这里不测交互（那需要更完整的 fake 组件），只把「这一页能不能画出来」钉住 ——
 * 加上 `describeSelfState` 覆盖的文案逻辑，就够拦住常见的回归了。
 */

/**
 * @param raw 原始设置（会被 `normalizeSettings` 归一化）。默认空对象 ——
 * 只有「仓库同步页」的用例需要构造特定的拉取策略，其余页面用默认值就够。
 * @param sync 同步模块的替身。不传时 `this.obsync.sync` 是 undefined ——
 * 那正是移动端 / 装配失败时的状态，「仓库同步页」必须能扛住它。
 * @param images 图片同步模块的替身。不传时 `this.obsync.images` 是 undefined ——
 * 「操作」那一节会走「没装配出服务」的分支（只画一行说明）。
 */
function createTab(
    fake: FakeApp,
    raw: Record<string, unknown> = {},
    sync?: unknown,
    images?: unknown
): ObsyncSettingsTab {
    const settings = normalizeSettings(raw);
    const notifier = new Notifier({ getShowNotices: () => true, getT: () => zhCN });

    const plugin = {
        app: fake.app,
        manifest: { id: "ob-sync", version: "0.9.0" },
        t: zhCN,
        settings,
        notifier,
        // 同步那一页先问这个。为 false（移动端）时它只画一行说明就 return，
        // 于是「仓库同步页」的用例什么也验不到 —— 必须为 true。
        isSyncAvailable: true,
        secretStore: new SecretStore(fake.app),
        sync,
        images,
        // `commit()` 会调这两个。**必须真的记一笔**：不记的话
        // 「拨了开关有没有生效」这件事就验不了 —— 而设置页最容易犯的错正是
        // 「改了值但没落盘 / 没重算派生状态」（那表现为「拨了没用」）。
        saved: 0,
        applied: 0,
        async saveSettings(): Promise<void> {
            plugin.saved += 1;
        },
        applyDerivedSettings(): void {
            plugin.applied += 1;
        },
        // 渲染阶段只用到这两个协作者的**存在**（点击回调查用），这里不构造它们。
        installer: {
            service: {} as InstallerService,
            checker: {} as UpdateChecker,
        },
        openImageManager(): void {},
        /**
         * `openGeneral()`（功能区头像点它）在设置窗没开时会调它去开窗。
         * **必须记一笔**：不记的话「点了头像到底有没有去开设置」验不了。
         */
        openSettingsCalls: 0,
        openSettings(): void {
            plugin.openSettingsCalls += 1;
        },
        // 令牌输入框在保存 / 测试 / 清除后会调它重画功能区头像（见 `main.ts`）。
        // 这一页的用例不驱动那几个入口，但替身上缺了它，将来补一条令牌用例时
        // 会以一个与被测行为无关的 TypeError 失败。
        refreshRibbonAvatar(): void {},
        /**
         * 「初始化 git 仓库」那一行点了按钮之后走它 —— **与命令面板、侧边栏面板
         * 是同一个方法**（`ObsyncPlugin.initRepo`），所以这一页的用例只要断言
         * 「它被调了」就够了，提示文案与 `.gitignore` 的处理都在那一份实现里。
         */
        initCalls: 0,
        async initRepo(): Promise<boolean> {
            plugin.initCalls += 1;
            return true;
        },
    };

    return new ObsyncSettingsTab(plugin as never);
}

/**
 * 设置页正在编辑的那份设置对象。
 *
 * 两页都要用，所以放在模块作用域（原先它只在「图片同步页」那个 describe 里，
 * 于是「仓库同步页」的用例读不到设置 —— 而那正是「拨了开关有没有生效」要验的东西）。
 */
function settingsOf(tab: ObsyncSettingsTab): ObsyncSettings {
    return (tab as unknown as { obsync: { settings: ObsyncSettings } }).obsync.settings;
}

/**
 * 同步模块的替身：只实现 `.gitignore` 一节与连接测试用到的那几个方法，
 * 并把写入记下来。
 */
function createSyncStub(initial?: string) {
    const stub = {
        writes: [] as string[],
        opened: 0,
        /** 「打开仓库同步面板」被点了几次（2026-10-02 加的按钮）。 */
        viewOpened: 0,
        /** 下一次自动同步的时刻（`Automatics.nextRunAt()` 的替身，倒计时读它）。 */
        nextRunAt: undefined as number | undefined,
        /** 同步是否正在进行（倒计时这时改说「正在同步…」）。 */
        busy: false,
        automatics: {
            nextRunAt(): number | undefined {
                return stub.nextRunAt;
            },
        },
        /** `openGitignore` 的返回值 —— false 模拟「Obsidian 打不开它」。 */
        openResult: true,
        /** 设了就让读失败。 */
        readError: undefined as Error | undefined,
        /** 设了就让写失败（模拟磁盘/权限问题）。 */
        writeError: undefined as Error | undefined,
        /** `untrackPaths` 收到的路径（「让 git 不再跟踪图片」那一步）。 */
        untracked: [] as string[][],
        /** `listTrackedPaths()` 返回的已跟踪路径（「按扩展名」靠它找图片）。 */
        tracked: [] as string[],
        /**
         * Obsidian「文件恢复」核心插件的状态（`fileRecoveryEnabled()` 的替身）。
         *
         * 默认 `true`（开着）→ 页面顶部**不长**那个警告框，这一页的既有用例
         * 看到的就是原来那张「注意事项」。设成 `false` 才多一个警告框。
         * 设成 `undefined` 模拟「读不出来」—— 那种情况也**不长**（不猜）。
         */
        fileRecovery: true as boolean | undefined,
        /** 远端地址（「远端地址」那一行读它、改它）。 */
        remoteUrl: "https://github.com/owner/repo.git" as string | undefined,
        /** `setRemoteUrl` 收到的地址（就地编辑远端那一条用例看它）。 */
        savedRemotes: [] as string[],
        /** `service.refresh()` 被调了几次（远端改完要强制刷新）。 */
        refreshes: 0,
        /**
         * 当前库是不是 git 仓库 —— 「初始化 git 仓库」那一行的徽标与按钮读它
         * （2026-10-05 加的那一行；这是它在设置页里的唯一数据来源）。
         */
        isRepo: true,
        /**
         * `git.isRepo()` 被问了几次。
         *
         * 2026-10-06 起设置页**只问一次**（问过就缓存，见 `renderInitRow` 与
         * `ObsyncSettingsTab.vaultIsRepo`）—— 没有这个计数，「每次重绘都重新起
         * 一个 git 子进程」这条回归就没人拦得住。
         */
        isRepoCalls: 0,
        /** 设了就让 `isRepo()` 抛错（模拟 git 不在 PATH）。 */
        isRepoError: undefined as Error | undefined,
        git: {
            async isRepo(): Promise<boolean> {
                stub.isRepoCalls += 1;
                if (stub.isRepoError) throw stub.isRepoError;
                return stub.isRepo;
            },
            async getRemoteUrl(): Promise<string | undefined> {
                return stub.remoteUrl;
            },
            async setRemoteUrl(url: string): Promise<void> {
                stub.savedRemotes.push(url);
                stub.remoteUrl = url;
            },
        },
        content: initial,
        openView(): void {
            stub.viewOpened += 1;
        },
        service: {
            get isBusy(): boolean {
                return stub.busy;
            },
            async readGitignore(): Promise<string | undefined> {
                if (stub.readError) throw stub.readError;
                return stub.content;
            },
            async writeGitignore(value: string): Promise<void> {
                if (stub.writeError) throw stub.writeError;
                stub.writes.push(value);
                stub.content = value;
            },
            async openGitignore(): Promise<boolean> {
                stub.opened += 1;
                return stub.openResult;
            },
            async untrackPaths(paths: string[]): Promise<void> {
                stub.untracked.push([...paths]);
            },
            async listTrackedPaths(): Promise<string[]> {
                return [...stub.tracked];
            },
            async fileRecoveryEnabled(): Promise<boolean | undefined> {
                return stub.fileRecovery;
            },
            async diagnose() {
                return { ok: true, checks: [] };
            },
            async refresh(): Promise<void> {
                stub.refreshes += 1;
            },
        },
    };
    return stub;
}

/** 图片同步服务的替身：三个动作各返回一个固定结果。 */
function createImagesStub(options: {
    /** R2 配好了没（`isConfigured()`）—— 没配好时「停止跟踪图片」必须拒绝执行。 */
    configured?: boolean;
    /** 下一轮清单里**待上传**的条目数（大于 0 时同样拒绝执行）。 */
    pendingUploads?: number;
    /** 让 `plan()` 抛错（列不出远端清单）。 */
    planError?: Error;
} = {}) {
    const pending = options.pendingUploads ?? 0;
    return {
        service: {
            isConfigured(): boolean {
                return options.configured ?? true;
            },
            async testConnection() {
                return { ok: true };
            },
            async plan() {
                if (options.planError) throw options.planError;
                return {
                    truncated: false,
                    entries: Array.from({ length: pending }, (_unused, index) => ({
                        path: `attachments/${index}.png`,
                        action: "upload" as const,
                        reason: "local-new" as const,
                    })),
                };
            },
            async run() {
                return { uploaded: 0, downloaded: 0, failed: 0, errors: [], truncated: false };
            },
        },
    };
}

function renderInstallerPage(tab: ObsyncSettingsTab): void {
    // 私有方法：这些用例只关心「这一页画得出来」，不引入设置页的页签切换机制。
    (tab as unknown as { renderInstaller(): void }).renderInstaller();
}

/**
 * 让「先渲染、再异步读内容」那条路（`.gitignore` 一节）跑完。
 *
 * 设置页的渲染是同步的，而读文件是异步的 —— 不 await 就断言不到读回来的内容。
 */
async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * `.gitignore` 代码框 —— 挂在页面上的块级 `textarea`（不是 `Setting` 的控件）。
 *
 * 之所以要单独一个类型：放进 `.setting-item-control` 只有右侧几百像素宽，
 * 读不了规则清单（用户原话：「只占了右侧有限空间，太丑了」），所以它是裸 DOM
 * 节点，`value` 与 `trigger` 都得自己按 shim 的形状声明。
 */
type TextAreaEl = {
    cls?: string;
    /** shim 的 `createEl` 会记下标签名 —— 用它证明它真的是 `textarea`。 */
    tagName?: string;
    value: string;
    /** 内联样式表（用来证明元素上**没有**写静态样式 —— 那是审核规则拦的形态）。 */
    style?: Record<string, string>;
    trigger: (name: string, ...args: unknown[]) => void;
};

beforeEach(() => {
    resetCreatedSettings();
    resetOpenedModals();
});

describe("设置页 · 安装器页", () => {
    it("渲染不抛错，且模型里的每一行都在", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        expect(() => renderInstallerPage(tab)).not.toThrow();

        const names = createdSettings.map((setting) => setting.name);
        // 2026-10-06 起这一页**没有页首标题**（页签「插件安装器」已经是页名），
        // 也**没有**「启用插件安装器」总开关了（它只挡两个自动检查，等价于把它们
        // 都关掉）—— 下面那两条自动检查各自还在。
        expect(names).toContain(zhCN.settings.installer.autoCheck);
        expect(names).toContain(zhCN.settings.installer.autoCheckOnSettingsOpen);
        expect(names).toContain(zhCN.settings.installer.mirrorDiscovery);
        expect(names).toContain(zhCN.settings.installer.selfHeading);
    });

    it("**没有页首标题**：第一条内容就是状态小字（2026-10-06）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        // 标题行是 `Setting`（挂在它自己的 `settingEl` 里），而状态小字是裸 `<p>`。
        expect((container.children as Array<{ cls?: string }>)[0]?.cls).toBe(
            "setting-item-description"
        );
    });

    it("「SyncHub 自身」一节有检查更新与更新两个按钮", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const selfRow = createdSettings.find(
            (setting) => setting.name === zhCN.settings.installer.selfHeading
        );
        expect(selfRow?.buttons.map((button) => button.text)).toEqual([
            zhCN.installer.checkOne,
            zhCN.installer.updateToLatest,
        ]);
    });

    it("「SyncHub 自身」一节有「启用 Gitee 镜像源」开关，初值来自设置", () => {
        const fake = createFakeApp();
        const tab = createTab(fake, {
            installer: { selfUpdateUseGitee: false },
        });

        renderInstallerPage(tab);

        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.installer.selfUseGitee
        );
        expect(row).toBeDefined();
        expect(row?.desc).toBe(zhCN.settings.installer.selfUseGiteeDesc);
        expect(row?.toggles[0]?.value).toBe(false);
    });

    it("改「启用 Gitee 镜像源」会**真的写进设置**（否则「拨了没用」）", async () => {
        const fake = createFakeApp();
        const tab = createTab(fake);
        const plugin = (
            tab as unknown as {
                obsync: { settings: ReturnType<typeof normalizeSettings>; saved: number };
            }
        ).obsync;

        renderInstallerPage(tab);
        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.installer.selfUseGitee
        );

        // 默认开 → 拨到关（改用官方仓库）
        expect(plugin.settings.installer.selfUpdateUseGitee).toBe(true);
        row!.toggles[0]!.toggle(false);
        await Promise.resolve();

        expect(plugin.settings.installer.selfUpdateUseGitee).toBe(false);
        expect(plugin.saved).toBe(1);
    });

    it("状态行显示当前版本（还没查过时）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        const texts = (container.children as Array<{ text?: string }>).map(
            (child) => child.text ?? ""
        );

        expect(texts).toContain(zhCN.installer.selfNotChecked("0.9.0"));
    });

    /**
     * 页内顺序（2026-10-06 用户要求）：
     *
     * 「将当前版本 0.1.9 · 尚未检查更新的小字提示放到最前面，然后展示 SyncHub 自身
     * 更新卡片，然后是启用 gitee 镜像源更新 SyncHub 设置项，再然后是进入设置页时
     * 自动检查设置项，……最后展示启动时检查更新、启动检查延迟、自动发现 gitee 镜像
     * 设置项。」
     */
    it("顺序：自身卡片 → 镜像源开关 → 进入设置页检查 → 启动检查 → 延迟 → 镜像发现", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const names = createdSettings.map((setting) => setting.name);
        const order = [
            zhCN.settings.installer.selfHeading,
            zhCN.settings.installer.selfUseGitee,
            zhCN.settings.installer.autoCheckOnSettingsOpen,
            zhCN.settings.installer.autoCheck,
            zhCN.settings.installer.autoCheckDelay,
            zhCN.settings.installer.mirrorDiscovery,
        ];
        const positions = order.map((name) => names.indexOf(name));

        // 六个都在（-1 会让下面那条「严格递增」在某种情况下假通过）
        expect(positions).not.toContain(-1);
        // 严格递增 = 顺序就是上面写的那样
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(new Set(positions).size).toBe(positions.length);
    });

    it("状态小字排在自身更新卡片**之前**（这一页的第一条内容）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        const children = container.children as Array<{ text?: string }>;
        const statusIndex = children.findIndex(
            (child) => child.text === zhCN.installer.selfNotChecked("0.9.0")
        );
        expect(statusIndex, "找不到状态小字那一行").toBeGreaterThanOrEqual(0);

        const card = createdSettings.find(
            (setting) => setting.name === zhCN.settings.installer.selfHeading
        );
        const cardIndex = children.indexOf(card!.settingEl as unknown as { text?: string });
        expect(cardIndex).toBeGreaterThan(statusIndex);
    });

    it("上一轮查到过更新时，状态小字直接用**落盘的结果**（不必等这一轮检查）", () => {
        // 没有这一条的话，用户打开设置页看到「尚未检查更新」，而标签栏那个徽标
        // 同时亮着 —— 两处自相矛盾。
        const fake = createFakeApp();
        const tab = createTab(fake, { installer: { selfUpdateAvailable: "0.9.9" } });

        renderInstallerPage(tab);

        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        const texts = (container.children as Array<{ text?: string }>).map(
            (child) => child.text ?? ""
        );

        expect(texts).toContain(zhCN.installer.selfUpdateAvailable("0.9.0", "0.9.9"));
    });

    it("有待重启标记时，状态行显示的是「重启后生效」而不是版本号", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);
        // 直接改设置对象：等价于「上次更新完还没重启」
        (tab as unknown as { obsync: { settings: ReturnType<typeof normalizeSettings> } }).obsync.settings.installer.pendingRestartVersion = "0.9.1";

        renderInstallerPage(tab);

        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        const texts = (container.children as Array<{ text?: string }>).map(
            (child) => child.text ?? ""
        );

        expect(texts).toContain(zhCN.installer.selfPendingRestart("0.9.1"));
    });

    it("app 只是被透传（这页不碰 vault）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        // 真正的意图是断言上面那些构造不需要真实 vault —— 这里只确认 app 到了位
        expect((tab as unknown as { app: App }).app).toBe(fake.app);
    });
});

/**
 * 标签栏上的数字徽标。
 *
 * 「已追踪插件」那个（跟踪数 / 可更新数）是早就有的；2026-10-06 用户要求
 * **「插件安装器」也来一个** —— 那个更新藏在第二页里，不点进去就不知道。
 * 它读的是落盘的 `installer.selfUpdateAvailable`，所以重启之后徽标还在。
 */
describe("设置页 · 标签栏徽标", () => {
    interface FakeNode {
        text?: string;
        cls?: string;
        children: FakeNode[];
    }

    /** 画一次标签栏，返回那五个按钮（顺序即 `tabs` 数组）。 */
    function renderTabBar(tab: ObsyncSettingsTab): FakeNode[] {
        (tab as unknown as { renderTabs(): void }).renderTabs();
        const container = (tab as unknown as { containerEl: { children: FakeNode[] } })
            .containerEl;
        const nav = container.children.find((child) => child.cls === "obsync-tabs");
        expect(nav, "没画出标签栏").toBeDefined();
        return nav!.children;
    }

    const countBadges = (node: FakeNode): FakeNode[] =>
        node.children.filter((child) => child.cls?.includes("obsync-tab-count"));

    it("SyncHub 自身有可用更新时，「插件安装器」标签上挂一个数字徽标", () => {
        const fake = createFakeApp();
        const tab = createTab(fake, { installer: { selfUpdateAvailable: "0.9.9" } });

        const buttons = renderTabBar(tab);
        // 顺序：插件与主题 / 插件安装器 / 仓库同步 / 图片同步 / 通用
        const installerButton = buttons[1]!;
        const badges = countBadges(installerButton);

        expect(badges).toHaveLength(1);
        expect(badges[0]!.text).toBe("1");
        // 强调色那一条类名（与「已追踪插件」那个可更新徽标同一套样式）
        expect(badges[0]!.cls).toContain("is-update");
    });

    it("没有可用更新时那个标签上什么都不挂", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        const buttons = renderTabBar(tab);

        expect(countBadges(buttons[1]!)).toHaveLength(0);
    });
});

/**
 * 设置页「通用」标签。
 *
 * 这一页此前**一个用例都没有**（上面那组是安装器页）。这里补上状态栏全宽那个开关：
 * 它在不在、默认值对不对、拨动之后设置**真的被写进去**。
 *
 * 「写进去了没有」必须验：设置页里 toggle 的 `onChange` 忘了赋值 / 忘了 `commit()`
 * 都是很容易犯的错，而那种错在界面上只表现为「拨了开关没用」——
 * 与当年那个「启用笔记同步」的死开关是同一类问题（见第三节的检查 6）。
 */
describe("设置页 · 通用页", () => {
    function renderGeneralPage(tab: ObsyncSettingsTab): void {
        (tab as unknown as { renderGeneral(): void }).renderGeneral();
    }

    it("渲染不抛错，且各行都在（提示 / 调试日志 / 条目贴最左 / 功能区头像 / 头像平台）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        expect(() => renderGeneralPage(tab)).not.toThrow();

        const names = createdSettings.map((setting) => setting.name);
        expect(names).toContain(zhCN.settings.general.showNotices);
        expect(names).toContain(zhCN.settings.general.debugLogging);
        expect(names).toContain(zhCN.settings.general.statusBarLeftAlign);
        expect(names).toContain(zhCN.settings.general.ribbonAvatar);
        // 2026-10-06 从上面那一行里拆出来的「用哪个平台」。
        expect(names).toContain(zhCN.settings.general.ribbonAvatarSource);
        // 「状态栏占满整屏宽」那一行 2026-10-09 删了（连同拉全宽的规则）——
        // 状态栏整体观感是用户自己的界面，不值得为贴屏幕最左把它变成底部一条。
        expect(names).not.toContain("状态栏占满整屏宽");
    });

    it("**没有页首标题**：第一条内容就是「显示操作结果提示」（2026-10-06）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderGeneralPage(tab);

        const names = createdSettings.map((setting) => setting.name);
        expect(names[0]).toBe(zhCN.settings.general.showNotices);
    });

    /**
     * `openGeneral()` —— 功能区头像的点击动作（2026-10-09 用户要求：
     * 「点击后打开设置窗口，跳转插件通用设置页」）。
     *
     * 两半各自钉住：
     * - **没开窗时**：`activeTab` 先被定成「通用」再开窗。顺序要紧 ——
     *   Obsidian 是在页签被选中的那一刻调 `display()` 的，那时读的就是这个值；
     *   先开窗再切页会闪一下用户上次看的那一页。
     * - **已经开着时**：就地重绘，不再开一次窗（连开两次设置窗是很显眼的错）。
     */
    describe("openGeneral（功能区头像点它）", () => {
        /** 私有状态读出来断言（与这个文件里其它地方同一套做法）。 */
        function stateOf(tab: ObsyncSettingsTab): {
            activeTab: string;
            openSettingsCalls: number;
        } {
            const inner = tab as unknown as {
                activeTab: string;
                obsync: { openSettingsCalls: number };
            };
            return {
                activeTab: inner.activeTab,
                openSettingsCalls: inner.obsync.openSettingsCalls,
            };
        }

        it("没开窗时：切到「通用」页并打开设置窗", () => {
            const tab = createTab(createFakeApp());

            (tab as unknown as { openGeneral(): void }).openGeneral();

            expect(stateOf(tab).activeTab).toBe("general");
            expect(stateOf(tab).openSettingsCalls).toBe(1);
        });

        it("已经开着时：就地重绘到「通用」页，不再开一次窗", () => {
            const tab = createTab(createFakeApp());
            // `tabOpen` 是 Obsidian 每次选中这个页签时由 `display()` 置 true 的。
            (tab as unknown as { tabOpen: boolean }).tabOpen = true;

            (tab as unknown as { openGeneral(): void }).openGeneral();

            expect(stateOf(tab).activeTab).toBe("general");
            expect(stateOf(tab).openSettingsCalls).toBe(0);
            // 就地重绘的证据：容器里画出来的是通用页的内容。
            const names = createdSettings.map((setting) => setting.name);
            expect(names).toContain(zhCN.settings.general.showNotices);
            expect(names).toContain(zhCN.settings.general.ribbonAvatar);
        });
    });

    /**
     * 访问令牌 2026-10-06 从「插件安装器」页移到了这里（用户要求）。
     *
     * 两条都要验：**这一页有它**（否则用户按新位置找不到），以及**安装器页没有它了**
     * （留着就是两处入口，改一处另一处看着像没生效）。
     */
    it("访问令牌一节在通用页（含平台标题与说明）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderGeneralPage(tab);

        const names = createdSettings.map((setting) => setting.name);
        expect(names).toContain(zhCN.settings.token.heading);
        expect(names).toContain(zhCN.settings.token.githubName);
        expect(names).toContain(zhCN.settings.token.giteeName);
    });

    it("安装器页**不再**渲染访问令牌（避免两处入口）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderInstallerPage(tab);

        const names = createdSettings.map((setting) => setting.name);
        expect(names).not.toContain(zhCN.settings.token.heading);
        expect(names).not.toContain(zhCN.settings.token.githubName);
    });

    /**
     * 「条目贴靠最左侧」默认是**开着**的（加开关不该悄悄改掉所有人的界面）。
     *
     * 2026-10-09 删掉的「状态栏占满整屏宽」曾经占着这个位置 —— 那个碰的是
     * **状态栏宽度**（贴屏幕最左，代价是整体观感从一簇变成一条），已整条删除。
     * 这一行只管**条目在状态栏里的顺序**，默认开 = 一直以来的表现。
     */
    it("「状态栏同步条目贴靠最左侧」**默认开着**，描述说清关掉会怎样", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderGeneralPage(tab);

        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.statusBarLeftAlign
        );
        expect(row?.toggles[0]?.value).toBe(true);
        expect(DEFAULT_SETTINGS.statusBarLeftAlign).toBe(true);
        expect(row?.desc).toBe(zhCN.settings.general.statusBarLeftAlignDesc);
    });

    /**
     * 拨开关的落盘路径（`commit()` → 保存 + 重算派生状态）。
     *
     * 拨的是「条目贴靠最左侧」那一行 —— 它的效果**依赖** `applyDerivedSettings()`
     * （那里才给 body 加/摘类，见 pluginBoot 的用例），所以这条用例盯的正是
     * 「拨了要落盘 + 要立刻重算」。
     */
    it("拨动开关会把设置**真的写进去**，并立刻重算派生状态（不用重载插件）", async () => {
        const fake = createFakeApp();
        const tab = createTab(fake);
        const plugin = (
            tab as unknown as {
                obsync: {
                    settings: ReturnType<typeof normalizeSettings>;
                    saved: number;
                    applied: number;
                };
            }
        ).obsync;

        renderGeneralPage(tab);
        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.statusBarLeftAlign
        );

        row!.toggles[0]!.toggle(false);
        await Promise.resolve();

        expect(plugin.settings.statusBarLeftAlign).toBe(false);
        // 落盘 + 重算派生状态（后者才会给 body 加/摘那个类 —— 见 pluginBoot 的用例）
        expect(plugin.saved).toBe(1);
        expect(plugin.applied).toBe(1);
    });

    /**
     * 功能区（左侧 ribbon）底部的 Gitee 头像。
     *
     * 2026-10-05 用户要求的那一条：**默认关闭**，打开后在功能区底部显示圆形头像。
     * 「默认关」不是风格问题 —— 它是一个新增的视觉元素，而且展示的是用户的账号头像，
     * 默认打开等于替所有人改了界面。
     */
    it("「功能区展示用户头像」**默认关着**，且描述指向下面那一项", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderGeneralPage(tab);

        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatar
        );
        expect(row?.toggles[0]?.value).toBe(false);
        expect(DEFAULT_SETTINGS.ribbonAvatar).toBe(false);
        // 「没配令牌就没有头像」那句 2026-10-06 挪到了**平台那一行**（它讲的是
        // 哪个平台的令牌）—— 这里只剩一句「用哪个平台由下面那一项决定」。
        expect(row?.desc).toBe(zhCN.settings.general.ribbonAvatarDesc);
    });

    /**
     * 头像用哪个平台（2026-10-06 用户要求拆出来的那一项）。
     *
     * 用户的原话：「将功能区展示用户头像中gitee部分拆分出来单独设置一个设置项，
     * 默认开启，开启时使用gitee头像，关闭时使用GitHub头像」。
     */
    it("「使用 Gitee 头像」**默认开着**（沿用拆之前写死的 Gitee）", () => {
        const tab = createTab(createFakeApp());

        renderGeneralPage(tab);

        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatarSource
        );
        expect(row?.toggles[0]?.value).toBe(true);
        expect(DEFAULT_SETTINGS.ribbonAvatarUseGitee).toBe(true);
        // 「没配对应令牌就没有头像」必须写在这一行 —— 不写的话，选了没配令牌的
        // 那个平台的用户只会以为开关坏了。
        expect(row?.desc).toBe(zhCN.settings.general.ribbonAvatarSourceDesc);
        expect(row?.desc).toContain(zhCN.settings.token.heading);
    });

    it("总开关关着时那一行**置灰**（但值不改写：再打开时选择还在）", () => {
        const tab = createTab(createFakeApp(), { ribbonAvatarUseGitee: false });

        renderGeneralPage(tab);

        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatarSource
        );
        expect(row?.toggles[0]?.disabled).toBe(true);
        // 置灰不改值 —— 与「启动检查延迟」那一行同一条规矩。
        expect(row?.toggles[0]?.value).toBe(false);
    });

    it("拨动那一行会写进设置（否则「拨了没反应」）", async () => {
        const tab = createTab(createFakeApp(), { ribbonAvatar: true });
        const plugin = (
            tab as unknown as {
                obsync: { settings: ReturnType<typeof normalizeSettings>; saved: number };
            }
        ).obsync;

        renderGeneralPage(tab);
        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatarSource
        );

        row!.toggles[0]!.toggle(false);
        await Promise.resolve();

        expect(plugin.settings.ribbonAvatarUseGitee).toBe(false);
        expect(plugin.saved).toBe(1);
    });

    /**
     * 「换头像」的入口（2026-10-05 用户要求）。
     *
     * 用户的原话：「在功能区展示头像设置项中，添加用户的 gitee 设置页链接，方便用户
     * 更换头像」。头像**不可能在插件里改**（那是 Gitee 账号的资料），所以这一条的
     * 全部意义就在那个链接上 —— 因此钉的是网址本身、`_blank`，以及它确实挂在
     * **平台那一行**的描述里（挂到别处就等于没做）。2026-10-06 它随平台开关一起从
     * 「功能区展示用户头像」那一行挪过来 —— 留在总开关那一行会与「用哪个平台」脱节、
     * 指错地方。
     */
    function avatarSourceLink(): { href?: string; text?: string; target?: string } {
        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatarSource
        );
        if (!row) throw new Error("通用页里没有「使用 Gitee 头像」那一行");

        const children =
            (row.descEl as unknown as {
                children?: Array<{ tagName?: string; text?: string; attrs?: Record<string, string> }>;
            }).children ?? [];
        // 引导语与链接是同一个元素里的两个节点
        expect(children[0]?.text).toBe(zhCN.settings.general.ribbonAvatarChangeLead);

        const link = children.find((child) => child.tagName === "A");
        if (!link) throw new Error("描述里没有链接");
        return { href: link.attrs?.href, text: link.text, target: link.attrs?.target };
    }

    it("平台那一行的描述里带可点的个人资料页链接（默认 Gitee）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderGeneralPage(tab);

        const link = avatarSourceLink();
        expect(link.href).toBe("https://gitee.com/profile");
        expect(link.text).toBe(zhCN.settings.general.ribbonAvatarChangeLinkGitee);
        // `_blank`：交给系统浏览器打开，而不是把设置弹窗导航走
        expect(link.target).toBe("_blank");
    });

    it("选了 GitHub 时链接指向 GitHub 的资料页（跟着平台走）", () => {
        const tab = createTab(createFakeApp(), { ribbonAvatarUseGitee: false });

        renderGeneralPage(tab);

        const link = avatarSourceLink();
        expect(link.href).toBe("https://github.com/settings/profile");
        expect(link.text).toBe(zhCN.settings.general.ribbonAvatarChangeLinkGithub);
    });

    it("拨开「功能区展示用户头像」会写进设置并重算派生状态（否则拨了没反应）", async () => {
        const fake = createFakeApp();
        const tab = createTab(fake);
        const plugin = (
            tab as unknown as {
                obsync: {
                    settings: ReturnType<typeof normalizeSettings>;
                    saved: number;
                    applied: number;
                };
            }
        ).obsync;

        renderGeneralPage(tab);
        const row = createdSettings.find(
            (setting) => setting.name === zhCN.settings.general.ribbonAvatar
        );

        row!.toggles[0]!.toggle(true);
        await Promise.resolve();

        expect(plugin.settings.ribbonAvatar).toBe(true);
        // 落盘 + 重算派生状态：后者会调 `RibbonAvatar.apply()` 把头像画上去。
        expect(plugin.saved).toBe(1);
        expect(plugin.applied).toBe(1);
    });
});

/**
 * 设置页「仓库同步」标签。
 *
 * 这一页此前也没有用例。这里钉住两件事，都是**组合条件**才出问题的地方：
 *
 * 1. 注意事项在标题正下方 —— 它说的是「这样配会丢东西」，位置错了（比如沉到
 *    页面底部）就等于没写。
 * 2. 策略为「重置」时总开关被禁用且换了描述。这是 UI 那一半；**真正拦住定时器
 *    的是 `Automatics.start()`**，那条在 `automatics.test.ts` 里单独测 ——
 *    只测这里会漏掉「库里已经存着 enabled + reset」的用户（他们根本不碰设置页）。
 */
describe("设置页 · 仓库同步页", () => {
    /** DOM shim 记下的节点形状（见 `tests/setup.ts`）。 */
    type ShimEl = {
        cls?: string;
        text?: string;
        children?: ShimEl[];
        /** `createEl` 记下的标签名（大写，与真实 DOM 一致）。 */
        tagName?: string;
        /** `createEl({ attr })` 记下的属性 —— 断言链接的 `href` 用。 */
        attrs?: Record<string, string>;
    };

    function renderSyncPage(tab: ObsyncSettingsTab): void {
        (tab as unknown as { renderSync(): void }).renderSync();
    }

    function childrenOf(tab: ObsyncSettingsTab): ShimEl[] {
        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        return container.children as ShimEl[];
    }

    /**
     * 在节点树里**递归**找。
     *
     * 设置行自 2026-10-02 起收进了 `.setting-group > .setting-items`（见
     * `settingsTab.openGroup`），于是代码框、结果区、提示段都不再是
     * `containerEl` 的直接子节点 —— 只看一层会全部找不到。
     */
    function findAll(root: ShimEl, predicate: (el: ShimEl) => boolean): ShimEl[] {
        const out: ShimEl[] = [];
        const walk = (el: ShimEl): void => {
            for (const child of el.children ?? []) {
                if (predicate(child)) out.push(child);
                walk(child);
            }
        };
        walk(root);
        return out;
    }

    /** 某个节点落在哪一组里（找不到就是不在任何组里）。 */
    function groupOf(tab: ObsyncSettingsTab, target: ShimEl): ShimEl | undefined {
        const container = (tab as unknown as { containerEl: ShimEl }).containerEl;
        const contains = (el: ShimEl): boolean =>
            el === target || (el.children ?? []).some((child) => contains(child));
        return findAll(container, (el) => el.cls === "setting-items").find((group) =>
            (group.children ?? []).some((child) => contains(child))
        );
    }

    it("渲染不抛错，且注意事项紧跟在页首（前面只有那个零占位的警告槽）", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        expect(() => renderSyncPage(tab)).not.toThrow();

        // 2026-10-06 起这一页**没有页首标题**（页签「仓库同步」已经是页名），
        // 注意事项因此直接成为第一条内容。被挪到页面别处这条就红。
        //
        // 2026-10-10 起它前面多了一个**零占位**的警告槽（`display: contents`，
        // 「文件恢复关着」时往里长一个警告框）—— 所以比的是「它前面只有那个槽」。
        const children = childrenOf(tab);
        const notesIndex = children.findIndex((child) => child.cls === "obsync-sync-notes");
        expect(notesIndex).toBeGreaterThanOrEqual(0);
        expect(children.slice(0, notesIndex).map((child) => child.cls)).toEqual([
            "obsync-sync-alert-slot",
        ]);
    });

    /**
     * 「文件恢复关着」的警告框（2026-10-10）。
     *
     * 三种状态都要对，因为它的存在**只由那一个判据决定**：
     * 关着 → 长出来且排在注意事项之前；开着 / 读不出来 → **什么都不长**。
     * 「读不出来不长」那条最要紧 —— 提示的前提是「我们知道它关着」，
     * 猜成 false 会让每个没关它的用户都看到一条凭空捏造的警告。
     */
    it("「文件恢复」关着 → 页首长出一个警告框，排在注意事项之前", async () => {
        const fake = createFakeApp();
        const stub = createSyncStub();
        stub.fileRecovery = false;
        const tab = createTab(fake, {}, stub);

        renderSyncPage(tab);
        // 渲染是同步的，而「读 core-plugins.json」那一步是 await 的 —— 让它跑完。
        await new Promise((resolve) => setTimeout(resolve, 0));

        const slot = childrenOf(tab).find((child) => child.cls === "obsync-sync-alert-slot");
        const alert = slot?.children?.find((child) => child.cls === "obsync-sync-alert");
        expect(alert).toBeDefined();
        expect(alert!.children![0]!.text).toBe(zhCN.settings.sync.fileRecoveryHeading);

        // **排在注意事项之前** —— 它讲的是数据安全，不是补充说明。
        const notes = childrenOf(tab).find((child) => child.cls === "obsync-sync-notes");
        expect(childrenOf(tab).indexOf(slot!)).toBeLessThan(childrenOf(tab).indexOf(notes!));
    });

    it("「文件恢复」开着或**读不出来** → 页首什么都不长（不猜）", async () => {
        for (const value of [true, undefined]) {
            const fake = createFakeApp();
            const stub = createSyncStub();
            stub.fileRecovery = value;
            const tab = createTab(fake, {}, stub);

            renderSyncPage(tab);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const slot = childrenOf(tab).find((child) => child.cls === "obsync-sync-alert-slot");
            expect(slot?.children ?? []).toEqual([]);
        }
    });

    it("注意事项里是 locale 里的那两条，标题也在", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderSyncPage(tab);

        const notes = childrenOf(tab).find((child) => child.cls === "obsync-sync-notes");
        const [heading, list] = notes!.children!;

        expect(heading?.cls).toBe("obsync-sync-notes-heading");
        expect(heading?.text).toBe(zhCN.settings.sync.notesHeading);
        // 逐条比对，而不是只看「有一条」：漏掉 reset 那条就等于没写。
        expect(list?.children?.map((item) => item.text)).toEqual(zhCN.settings.sync.notes);
    });

    /**
     * 分节：相关的设置行收进**同一张卡片**。
     *
     * 由来（2026-10-02）：Obsidian 1.13 起一条 `Setting` 自己就是一张卡片，
     * 于是这一页变成十几张紧挨着的卡片 —— 没有层次，每一行都在同样大声地喊。
     * 用户的原话是「图中展示的布局样式是丑陋的」。
     */
    describe("分节（.setting-group）", () => {
        it("同一节里的几行落在同一组，跨节的落在不同组", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const el = (name: string): ShimEl =>
                createdSettings.find((setting) => setting.name === name)!.settingEl as unknown as ShimEl;

            // 定时同步、提交模板、整合策略是「怎么同步」那一组
            const basics = groupOf(tab, el(zhCN.settings.sync.enabled));
            expect(basics).toBeDefined();
            expect(groupOf(tab, el(zhCN.settings.sync.commitMessage))).toBe(basics);
            expect(groupOf(tab, el(zhCN.settings.sync.strategy))).toBe(basics);

            // git 路径自 2026-10-04 起**提到「连接测试」之前**（它是测试能通过的前提），
            // 所以不再属于「怎么同步」那一组
            expect(groupOf(tab, el(zhCN.settings.sync.gitPath))).not.toBe(basics);

            // 但「忽略规则」与「连接测试」是**另外两节**（各自一节一张卡片）
            expect(groupOf(tab, el(zhCN.settings.sync.gitignoreHeading))).not.toBe(basics);
            expect(groupOf(tab, el(zhCN.sync.diagnoseHeading))).not.toBe(basics);
        });

        /**
         * 这一页的结构约定（2026-10-04 用户的话）：
         *
         * **「连接测试」之前的每一项都必须是「测试能通过」的充要条件。**
         *
         * 连接测试查的就是这几件事 —— **这个库是不是 git 仓库**、git 能不能跑
         * （git 可执行文件路径）、远端能不能连（远端地址）。别的一律排在它后面，
         * 免得用户为了「为什么连不上」先滑过一堆与连接无关的设置。
         *
         * 第一项是 2026-10-05 补的（用户要求「把仓库初始化按钮也放入设置页，
         * 保证仓库同步的基本设置能全部在设置页中就完成」）—— 在此之前新库的第一步
         * 断在侧边栏面板里，而地址已经在这一页了。
         */
        it("「连接测试」之前有三个前提项：初始化仓库、远端地址与 git 可执行文件路径", async () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);
            await flush();

            const before = createdSettings
                .slice(0, createdSettings.findIndex((s) => s.name === zhCN.sync.diagnoseHeading))
                .map((setting) => setting.name)
                // 空名字的行是 `openGroup()` 建的分组容器，不算设置项
                // （页首标题 2026-10-06 删了，所以不再需要把它滤掉）
                .filter((name) => name);

            expect(before).toEqual([
                zhCN.settings.sync.initRepo,
                zhCN.sync.remoteLabel,
                zhCN.settings.sync.gitPath,
            ]);
        });

        /**
         * 「打开仓库同步面板」按钮（2026-10-02）。
         *
         * 用户的原话：「仓库同步设置页下，应该添加打开仓库同步视图的按钮」——
         * 面板本来有三个入口（命令面板 / 侧栏图标 / 状态栏），唯独这一页没有，
         * 而这里恰恰是用户会想「让我看一眼现在什么状态」的地方。
         */
        it("「打开仓库同步面板」按钮与远端地址同一行（2026-10-04 合并）", async () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);
            await flush();

            const remote = createdSettings.find(
                (setting) => setting.name === zhCN.sync.remoteLabel
            );
            expect(remote, "页面上没有远端地址那一行").toBeDefined();
            // 同一个 `Setting` 上：一个输入框 + 一个按钮 —— 原先那个只剩一个按钮的
            // 「操作」一节已经并进来了
            expect(remote!.texts).toHaveLength(1);
            expect(remote!.buttons.map((button) => button.text)).toEqual([
                zhCN.settings.sync.openView,
            ]);
            // 说明文字改挂 tooltip（那一行放不下两段描述）
            expect(remote!.buttons[0]!.tooltip).toBe(zhCN.settings.sync.openViewDesc);

            // 页面上的区块第一位仍然是「注意事项」之后紧接着这一行
            const children = (tab as unknown as { containerEl: ShimEl }).containerEl.children ?? [];
            const notesIndex = children.findIndex((child) => child.cls === "obsync-sync-notes");
            expect(notesIndex).toBeGreaterThanOrEqual(0);
        });

        it("点「打开仓库同步面板」→ 调到同步模块上那个入口", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(createFakeApp(), {}, sync);
            renderSyncPage(tab);
            await flush();

            const remote = createdSettings.find(
                (setting) => setting.name === zhCN.sync.remoteLabel
            )!;
            remote.buttons[0]!.click();

            expect(sync.viewOpened).toBe(1);
        });

        /**
         * 没有同步模块时按钮点了也不抛 —— 钉的是 `this.obsync.sync?.openView()` 上
         * 那个可选链。
         *
         * 真机上这一页只在桌面端渲染（`isSyncAvailable` 与模块一起为假），所以这条
         * 在这个替身里构造的情形只是为了让「少了 `?.`」立刻变成红：那时点一下就是
         * `TypeError: Cannot read properties of undefined`。
         */
        it("没有同步模块时按钮点了也不抛（可选链那一层）", () => {
            const tab = createTab(createFakeApp());
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.openView
            );
            expect(() => row?.buttons[0]?.click()).not.toThrow();
        });

        /**
         * 「连接测试」在这一页的**顶部区域**（2026-10-02 用户要求：「放到最上边展示」）。
         *
         * 与图片同步页把「操作」提到最前同一条理由：它是动作，而下面两节是配一次
         * 就不再翻的设置。位置是「注意事项之后」（现在它上面多了「操作」那一节，
         * 面板入口比它更常用 —— 见上一条用例），并且在「定时同步」之前。
         */
        it("「连接测试」排在所有设置组之前，且紧跟注意事项", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const children = (tab as unknown as { containerEl: ShimEl }).containerEl.children ?? [];
            const notesIndex = children.findIndex((child) => child.cls === "obsync-sync-notes");
            const firstGroupIndex = children.findIndex(
                (child) => child.cls === "setting-group obsync-group"
            );
            expect(notesIndex).toBeGreaterThanOrEqual(0);
            // 第一个设置组就是「连接测试」那一组：它的标题行在建组时最先登记
            expect(firstGroupIndex).toBeGreaterThan(notesIndex);

            const indexOf = (name: string): number =>
                createdSettings.findIndex((setting) => setting.name === name);
            expect(indexOf(zhCN.sync.diagnoseHeading)).toBeLessThan(
                indexOf(zhCN.settings.sync.enabled)
            );
            // 「忽略规则」仍排在它后面
            expect(indexOf(zhCN.sync.diagnoseHeading)).toBeLessThan(
                indexOf(zhCN.settings.sync.gitignoreHeading)
            );
        });

        /**
         * 「初始化 git 仓库」那一行（2026-10-05 用户要求）。
         *
         * 用户的原话：「把仓库同步中远端地址的设置项移到了设置页了，但是把仓库 git
         * 初始化漏在了侧边栏面板里，请把仓库初始化按钮也放入设置页，保证仓库同步的
         * 基本设置能全部在设置页中就完成」。
         *
         * 这一行要钉住两件事：**它真的去做那件事**（走插件那个公共方法 ——
         * 与命令面板、侧边栏面板同一个），以及**它说的话与磁盘上的事实一致**
         * （徽标由 `git.isRepo()` 填；问不出来时留空，而不是猜「还没有仓库」）。
         */
        describe("初始化 git 仓库", () => {
            function initRow() {
                const row = createdSettings.find(
                    (setting) => setting.name === zhCN.settings.sync.initRepo
                );
                if (!row) throw new Error("找不到「初始化 git 仓库」那一行");
                return row;
            }

            /** 名称后面那个状态徽标（替身把 `createSpan` 记成 nameEl 的一个子节点）。 */
            function badgeText(): string | undefined {
                const nameEl = initRow().nameEl as unknown as {
                    children?: Array<{ text?: string }>;
                };
                return nameEl.children?.find((child) => child.text)?.text;
            }

            it("排在远端地址之前（三者里它最底层：没有仓库，地址填了也没用）", () => {
                const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
                renderSyncPage(tab);

                const names = createdSettings.map((setting) => setting.name);
                expect(names.indexOf(zhCN.settings.sync.initRepo)).toBeLessThan(
                    names.indexOf(zhCN.sync.remoteLabel)
                );
            });

            it("库还不是仓库：徽标说「还不是」，按钮可用", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.isRepo = false;
                const tab = createTab(createFakeApp(), {}, sync);

                renderSyncPage(tab);
                await flush();

                expect(badgeText()).toBe(zhCN.settings.sync.initNeeded);
                expect(initRow().buttons[0]!.disabled).toBe(false);
            });

            it("已经是仓库：徽标说「已是」，按钮**置灰**（幂等也不该让人以为插件坏了）", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.isRepo = true;
                const tab = createTab(createFakeApp(), {}, sync);

                renderSyncPage(tab);
                await flush();

                expect(badgeText()).toBe(zhCN.settings.sync.initDone);
                expect(initRow().buttons[0]!.disabled).toBe(true);
            });

            it("点按钮走的是插件那个公共方法，完事重新读一次状态", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.isRepo = false;
                const tab = createTab(createFakeApp(), {}, sync);
                const plugin = (tab as unknown as { obsync: { initCalls: number } }).obsync;

                renderSyncPage(tab);
                await flush();

                // 初始化成功之后磁盘上就有仓库了 —— 替身在这里翻转，模拟那一步
                sync.isRepo = true;
                await initRow().buttons[0]!.click();
                await flush();

                expect(plugin.initCalls).toBe(1);
                expect(badgeText()).toBe(zhCN.settings.sync.initDone);
                expect(initRow().buttons[0]!.disabled).toBe(true);
            });

            /**
             * 只问一次（2026-10-06 用户要求）。
             *
             * 用户的原话：「监测过已经是 git 仓库的话，每次点进仓库同步设置页就不用再
             * 主动检测了，直接将标识固定就行，等同步时再验证即可」。原来每次重绘都起
             * 一个 `git is-repo` 子进程，结果回来才填徽标 —— 于是每次切进这一页都能
             * 看到徽标「弹」出来（还会把下面的说明文字挤下去几像素）。
             */
            it("第二次进这一页**不再问 git**，且徽标是**同步**就位的", async () => {
                const sync = createSyncStub("# 规则\n");
                const tab = createTab(createFakeApp(), {}, sync);

                renderSyncPage(tab);
                await flush();
                expect(sync.isRepoCalls).toBe(1);

                // 等价于「切走再切回来」：同一个页签实例再画一次。
                renderSyncPage(tab);

                expect(sync.isRepoCalls).toBe(1);
                // **不等异步** —— 徽标此刻就该在。没有这一条，用户看到的还是「弹出来」。
                expect(badgeText()).toBe(zhCN.settings.sync.initDone);
            });

            it("问不出来时**不记**：徽标留空、按钮仍可用（真不行时会有具体报错）", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.isRepoError = new Error("git 不在 PATH");
                const tab = createTab(createFakeApp(), {}, sync);

                renderSyncPage(tab);
                await flush();

                expect(badgeText()).toBeUndefined();
                expect(initRow().buttons[0]!.disabled).toBe(false);

                // 「问不出来」不是一种结果，所以不缓存 —— 下一次还要再问。
                renderSyncPage(tab);
                await flush();
                expect(sync.isRepoCalls).toBe(2);
            });
        });

        /**
         * 远端地址（2026-10-04 用户要求：「远端地址应该在仓库同步的设置页中设置才对，
         * 移到测试连接之前展示」）。
         *
         * 位置是关键的一半：**先填地址，再测连接** —— 连接测试测的正是这个地址。
         */
        describe("远端地址", () => {
            it("排在「连接测试」之前，且在「注意事项」与「打开面板」之后", async () => {
                const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
                renderSyncPage(tab);
                await flush();

                const indexOf = (name: string): number =>
                    createdSettings.findIndex((setting) => setting.name === name);

                expect(indexOf(zhCN.sync.remoteLabel)).toBeGreaterThanOrEqual(0);
                // 先填地址，再测连接
                expect(indexOf(zhCN.sync.remoteLabel)).toBeLessThan(
                    indexOf(zhCN.sync.diagnoseHeading)
                );
                // 不抢「打开仓库同步面板」的位置
                expect(indexOf(zhCN.settings.sync.openView)).toBeLessThan(
                    indexOf(zhCN.sync.remoteLabel)
                );
            });

            it("就地改地址：失焦保存 + 强制刷新（与面板那一行同一份行为）", async () => {
                const stub = createSyncStub("# 规则\n");
                const tab = createTab(createFakeApp(), {}, stub);
                renderSyncPage(tab);
                await flush();

                const row = createdSettings.find(
                    (setting) => setting.name === zhCN.sync.remoteLabel
                );
                const input = row!.texts[0]!.inputEl as unknown as {
                    value: string;
                    trigger?: (name: string) => void;
                };
                expect(input.value).toBe(stub.remoteUrl);

                input.value = "https://gitee.com/other/repo.git";
                input.trigger!("blur");
                await flush();

                expect(stub.savedRemotes).toEqual(["https://gitee.com/other/repo.git"]);
                expect(stub.refreshes).toBe(1);
            });

            it("带令牌的地址回显脱敏（这一页同样显示在屏幕上）", async () => {
                const stub = createSyncStub("# 规则\n");
                stub.remoteUrl = "https://user:secret-token@github.com/owner/repo.git";
                const tab = createTab(createFakeApp(), {}, stub);
                renderSyncPage(tab);
                await flush();

                const row = createdSettings.find(
                    (setting) => setting.name === zhCN.sync.remoteLabel
                );
                const value = (
                    row!.texts[0]!.inputEl as unknown as { value: string }
                ).value;
                expect(value).not.toContain("secret-token");
                expect(value).toContain("github.com/owner/repo.git");
            });
        });

        it("节标题是组内的标题行（原生 `.setting-item-heading`），不是又一张卡片", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const heading = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.gitignoreHeading
            );
            expect(heading).toBeDefined();

            // 标题行直属于 `.setting-group`，**不在** `.setting-items` 里 ——
            // 这正是原生结构：标题在卡片外、行在卡片内。放错了标题会变成一张
            // 单独的空卡片（那正是这次要修掉的形态）。
            const group = findAll(
                (tab as unknown as { containerEl: ShimEl }).containerEl,
                (el) => el.cls === "setting-group obsync-group"
            ).find((candidate) =>
                (candidate.children ?? []).includes(heading!.settingEl as unknown as ShimEl)
            );
            expect(group).toBeDefined();
        });

        it("「填默认内容」那排按钮贴左（`obsync-inline-actions`）", () => {
            // 没有名称/描述的行，`.setting-item-info` 会把控件一路顶到最右，
            // 离上面那个代码框很远 —— 看不出按钮是给它的。
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const row = createdSettings.find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.settings.sync.gitignoreRestore)
            );
            expect(row?.classes).toContain("obsync-inline-actions");
        });

        it("「连接测试」的说明与按钮在**同一行**，按钮不再单占一条空卡片", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const heading = createdSettings.find(
                (setting) =>
                    setting.name === zhCN.sync.diagnoseHeading &&
                    setting.buttons.some((button) => button.text === zhCN.sync.diagnoseRun)
            );
            expect(heading).toBeDefined();
            // 说明挂在这一行上（而不是页面上一段裸 `<p>` + 一条只有按钮的卡片）
            expect(heading?.desc).toBe(zhCN.sync.diagnoseDesc);
            expect(heading?.classes).toContain("obsync-group-heading");
        });

        it("结果区在那一组里，且在动作按钮**下面**", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));
            renderSyncPage(tab);

            const container = (tab as unknown as { containerEl: ShimEl }).containerEl;
            const results = findAll(container, (el) => el.cls === "obsync-diagnostics");
            expect(results).toHaveLength(1);
            expect(groupOf(tab, results[0]!)).toBeDefined();
        });
    });

    /**
     * 「定时同步」那一行（2026-10-02 重做）。
     *
     * 之前是「一个总开关」+「三个间隔」，两处都能表达关，而默认又是
     * 「开着 + 全 0」（拨到哪边都不动）—— 读起来像重复的设置项。
     * 现在：**周期框 + 单位 + 开关同一行**，开关是唯一的开 / 关，
     * 周期里没有「0 = 关闭」。
     */
    describe("定时同步那一行", () => {
        /** 落盘计数（`commit()` 会 +1）。 */
        function saveCount(tab: ObsyncSettingsTab): number {
            return (tab as unknown as { obsync: { saved: number } }).obsync.saved;
        }

        /**
         * 「定时同步」名称后面那个倒计时徽标。
         *
         * 用户的原话：「如果仓库同步里的定时同步是开启的状态，请显示距离下次同步的
         * 倒计时」。开着才显示（关掉 / 策略为「重置」挂起时没有定时器），而且**每秒**
         * 都在走 —— 所以这里用假时钟推着它走，而不是只看一眼初值。
         */
        describe("倒计时", () => {
            function badge() {
                const row = createdSettings.find(
                    (setting) => setting.name === zhCN.settings.sync.enabled
                )!;
                const nameEl = row.nameEl as unknown as { children?: Array<{ text?: string }> };
                return nameEl.children!.find((child) =>
                    (child as { cls?: string }).cls?.includes("obsync-countdown")
                ) as { text?: string } | undefined;
            }

            beforeEach(() => {
                vi.useFakeTimers();
            });
            afterEach(() => {
                vi.useRealTimers();
            });

            it("定时同步开着时显示「下次同步 M:SS」，并且每秒递减", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.nextRunAt = Date.now() + 90_000;
                const tab = createTab(createFakeApp(), {}, sync);
                renderSyncPage(tab);

                expect(badge()?.text).toBe(zhCN.settings.sync.countdown("1:30"));

                await vi.advanceTimersByTimeAsync(1_000);
                expect(badge()?.text).toBe(zhCN.settings.sync.countdown("1:29"));

                await vi.advanceTimersByTimeAsync(60_000);
                expect(badge()?.text).toBe(zhCN.settings.sync.countdown("0:29"));
            });

            it("超过一小时时带上小时那一段", () => {
                const sync = createSyncStub("# 规则\n");
                sync.nextRunAt = Date.now() + 3 * 3600_000 + 5 * 60_000;
                const tab = createTab(createFakeApp(), {}, sync);
                renderSyncPage(tab);

                expect(badge()?.text).toBe(zhCN.settings.sync.countdown("3:05:00"));
            });

            it("没有定时器（关掉 / 挂起）时徽标是空的（CSS 的 :empty 把它收起来）", () => {
                const sync = createSyncStub("# 规则\n");
                sync.nextRunAt = undefined;
                const tab = createTab(createFakeApp(), {}, sync);
                renderSyncPage(tab);

                expect(badge()?.text).toBe("");
            });

            it("正在同步时改说「正在同步…」（这时「还剩 0:00」是错的）", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.nextRunAt = Date.now() + 30_000;
                const tab = createTab(createFakeApp(), {}, sync);
                renderSyncPage(tab);
                expect(badge()?.text).toBe(zhCN.settings.sync.countdown("0:30"));

                sync.busy = true;
                await vi.advanceTimersByTimeAsync(1_000);
                expect(badge()?.text).toBe(zhCN.settings.sync.countdownRunning);
            });

            /**
             * 关掉这一页之后**不再刷新**：那个 interval 守着的是已经脱离文档的节点，
             * 不清掉就是每开合一次泄漏一个。
             */
            it("关闭设置页后停止刷新", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.nextRunAt = Date.now() + 90_000;
                const tab = createTab(createFakeApp(), {}, sync);
                renderSyncPage(tab);

                const before = badge()?.text;
                tab.hide();
                await vi.advanceTimersByTimeAsync(5_000);

                expect(badge()?.text).toBe(before);
            });
        });

        it("周期框在开关**前面**，中间是单位；初始值来自设置", () => {
            const tab = createTab(createFakeApp(), { sync: { intervalMinutes: 25 } });
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            expect(row).toBeDefined();
            expect(row!.texts[0]?.value).toBe("25");
            // 1–1440：0 在新模型里没有含义
            expect(row!.texts[0]?.inputEl.min).toBe("1");
            expect(row!.texts[0]?.inputEl.max).toBe(String(24 * 60));
            // 顺序：先框、后开关（控件按调用顺序进 `.setting-item-control`）
            expect(row!.controls.map((control) => control.constructor.name)).toEqual([
                "TextComponent",
                "ToggleComponent",
            ]);
            // 单位是框后面那个 span
            const unit = (
                row!.controlEl.children as unknown as Array<{ cls?: string; text?: string }>
            ).find((child) => child.cls === "obsync-unit");
            expect(unit?.text).toBe(zhCN.settings.sync.minutesUnit);
        });

        it("改周期会写进设置并落盘", async () => {
            const tab = createTab(createFakeApp());
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            await row!.texts[0]!.type("30");

            expect(settingsOf(tab).sync.intervalMinutes).toBe(30);
            expect(saveCount(tab)).toBe(1);
        });

        it("0 / 非法值被忽略（不会把周期写成 0）", async () => {
            const tab = createTab(createFakeApp(), { sync: { intervalMinutes: 25 } });
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            await row!.texts[0]!.type("0");
            await row!.texts[0]!.type("abc");

            expect(settingsOf(tab).sync.intervalMinutes).toBe(25);
        });

        /**
         * 出界的输入**不能在框里留着一个不生效的数字**。
         *
         * 用户的原话：「按周期同步如果输入 0-4 的值不会被视觉修正是吗？这不合理吧」
         * —— 同一个毛病「仓库同步」页的周期也有。现在失焦会把显示对齐回生效值；
         * 为什么修在失焦而不是 onChange，见 `addNumberField` 的说明。
         */
        it("出界的输入：失焦时把框里的显示对齐回生效值", async () => {
            const tab = createTab(createFakeApp(), { sync: { intervalMinutes: 25 } });
            renderSyncPage(tab);

            const field = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            )!.texts[0]!;

            await field.type("0");
            expect(settingsOf(tab).sync.intervalMinutes).toBe(25);

            field.inputEl.trigger?.("blur");
            expect(field.value).toBe("25");

            // 合法值照旧立即生效，失焦不改它
            await field.type("45");
            expect(settingsOf(tab).sync.intervalMinutes).toBe(45);
            field.inputEl.trigger?.("blur");
            expect(field.value).toBe("45");
        });

        it("开关默认是**关**（新装不该自己跑起来）", () => {
            const tab = createTab(createFakeApp());
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            expect(row!.toggles[0]?.value).toBe(false);
            expect(DEFAULT_SETTINGS.sync.enabled).toBe(false);
        });

        it("拨开开关会写进设置，且**不改动**周期", async () => {
            const tab = createTab(createFakeApp(), { sync: { intervalMinutes: 25 } });
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            await row!.toggles[0]!.toggle(true);

            expect(settingsOf(tab).sync.enabled).toBe(true);
            expect(settingsOf(tab).sync.intervalMinutes).toBe(25);
        });

        it("策略为「重置」时两个控件都灰掉（周期也跟着没用）", () => {
            const tab = createTab(createFakeApp(), { sync: { syncStrategy: "reset" } });
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.enabled
            );
            expect(row?.toggles[0]?.disabled).toBe(true);
            expect(row?.texts[0]?.disabled).toBe(true);
        });
    });

    it("策略为「重置」时总开关被禁用，描述说明为什么", () => {
        const fake = createFakeApp();
        const tab = createTab(fake, { sync: { syncStrategy: "reset" } });

        renderSyncPage(tab);

        const row = createdSettings.find((setting) => setting.name === zhCN.settings.sync.enabled);
        expect(row?.toggles[0]?.disabled).toBe(true);
        expect(row?.desc).toBe(zhCN.settings.sync.enabledSuspendedByReset);
    });

    it("策略不是「重置」时开关可用，描述是常规说明", () => {
        const fake = createFakeApp();
        const tab = createTab(fake);

        renderSyncPage(tab);

        const row = createdSettings.find((setting) => setting.name === zhCN.settings.sync.enabled);
        expect(row?.toggles[0]?.disabled).toBe(false);
        expect(row?.desc).toBe(zhCN.settings.sync.enabledDesc);
    });

    it("开关被禁用时**值不被改写** —— 改回「合并」后才会自动恢复", () => {
        const fake = createFakeApp();
        // 写 `version: 7`：不然 v6 → v7 迁移会按「老数据里开关开着但周期是 0」
        // 把开关置回关（那是对老数据的正确处置，但会盖掉这条用例要验的东西）。
        const tab = createTab(fake, {
            version: 7,
            sync: { enabled: true, intervalMinutes: 10, syncStrategy: "reset" },
        });

        renderSyncPage(tab);

        const row = createdSettings.find((setting) => setting.name === zhCN.settings.sync.enabled);
        // 灰掉的是「能不能拨」，不是「值是多少」。若这里被写成 setValue(false)，
        // 用户改回 merge 之后定时同步就再也不会自己恢复 —— 而文案承诺了会。
        expect(row?.toggles[0]?.value).toBe(true);
    });

    /**
     * git 可执行文件路径那一行（2026-10-02）。
     *
     * 用户要求「输入框应该单独一行，并提供浏览按钮打开资源管理器」。两件事都要钉：
     * ① 形状 —— 名称/描述与控件上下两行（`.obsync-stacked`），输入框与按钮同一行；
     * ② 「浏览…」真的走到系统对话框，并把选中的路径写回设置 **与那个框**。
     *
     * `window.electron` 是**替身**：真机上它由 Obsidian 注入
     * （`electron.remote.dialog`，Obsidian 自己开文件框用的就是它，见
     * `core/desktopFileDialog.ts`）。这里注入一个假的，验的是「我们怎么用它」。
     */
    describe("git 可执行文件路径", () => {
        type FakeElectron = {
            remote: {
                dialog: {
                    showOpenDialog?: (options: unknown) => Promise<unknown>;
                    showOpenDialogSync?: (options: unknown) => string[] | undefined;
                };
            };
        };

        function installFakeElectron(dialog: FakeElectron["remote"]["dialog"]): void {
            (globalThis as unknown as { window: { electron?: unknown } }).window.electron = {
                remote: { dialog },
            };
        }

        afterEach(() => {
            delete (globalThis as unknown as { window: { electron?: unknown } }).window.electron;
        });

        function gitPathRow() {
            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.gitPath
            );
            expect(row, "页面上没有 git 路径那一行").toBeDefined();
            return row!;
        }

        it("输入框与「浏览…」同一行，且整行排在名称/描述下面", () => {
            const tab = createTab(createFakeApp());
            renderSyncPage(tab);

            const row = gitPathRow();
            expect(row.classes.join(" ")).toContain("obsync-stacked");
            // 第二个类**单独加**（`setClass` 一次只能给一个类名，见替身里的说明）——
            // `obsync-git-path` 挂在元素上，描述里那个下载链接的样式用它
            expect(
                (row.settingEl as unknown as { cls?: string }).cls ?? ""
            ).toContain("obsync-git-path");
            expect(row.texts[0]?.placeholder).toBe("C:\\Program Files\\Git\\cmd\\git.exe");
            expect(row.buttons.map((button) => button.text)).toEqual([
                zhCN.settings.sync.gitPathBrowse,
            ]);
        });

        /**
         * 「去哪儿装 git」那半句 —— 缺 git 是这条链路最常见的第一道坎，而插件不捆绑它
         * （2026-10-02 加）。
         *
         * 2026-10-04 用户两次要求：先是「SyncHub 不捆绑 git 的那句提示，放到留空使用
         * 系统 PATH 那条提示后面展示」（并进同一段描述，别分成两段像另一项设置），
         * 随后是「那句应该换行显示」—— 所以现在是**同一段描述 + 一个 `<br>`**。
         *
         * 钉三件事：两句在同一段里、中间确实换了行、以及那个链接是**可点的、指向官方
         * 下载页**（提示的全部意义就在那个网址上）。
         */
        it("「不捆绑 git」并进 git 路径那一行的描述并**换行**，链接指向官方下载页", () => {
            const tab = createTab(createFakeApp());
            renderSyncPage(tab);

            const row = createdSettings.find(
                (setting) => setting.name === zhCN.settings.sync.gitPath
            );
            expect(row, "页面上没有 git 可执行文件路径那一行").toBeDefined();
            // 描述**只剩 PATH 那句**：下载那句是同一个元素里的另一个文本节点
            expect(row!.desc).toBe(zhCN.settings.sync.gitPathDesc);

            const children = (row!.descEl as unknown as ShimEl).children ?? [];
            // `<br>` 在中间 —— 换行是用户明确要求的（同一段里不换行会被读成半句话）
            expect(children[0]?.tagName).toBe("BR");
            expect(children[1]?.text).toBe(zhCN.settings.sync.gitPathDownload);

            const link = children.find((child) => child.tagName === "A");
            expect(link, "描述里没有链接").toBeDefined();
            expect((link!.attrs as Record<string, string>).href).toBe(
                "https://git-scm.com/downloads"
            );
            expect(link!.text).toBe(zhCN.settings.sync.gitPathLink);
            // `_blank`：交给系统浏览器打开，而不是把设置弹窗导航走
            expect((link!.attrs as Record<string, string>).target).toBe("_blank");

            // 不再单独占一段（原来那个 `.obsync-git-download` 段落已并进来）
            expect(
                findAll(
                    (tab as unknown as { containerEl: ShimEl }).containerEl,
                    (child) => child.cls === "setting-item-description obsync-git-download"
                )
            ).toHaveLength(0);
        });

        /**
         * 找不到 git 时那句提示也要能指路。
         *
         * 原文案是「请在设置中指定路径」—— 只说了「怎么指」，没说「去哪儿弄」，
         * 而后者才是缺 git 的人唯一需要的信息。
         */
        it("「找不到 git」的文案里带上下载地址", () => {
            expect(zhCN.sync.gitNotFound).toContain("git-scm.com");
        });

        it("点「浏览…」→ 用系统对话框挑文件 → 写回设置与输入框", async () => {
            const calls: unknown[] = [];
            installFakeElectron({
                showOpenDialog: async (options) => {
                    calls.push(options);
                    return { canceled: false, filePaths: ["C:\\Git\\cmd\\git.exe"] };
                },
            });

            const fake = createFakeApp();
            const tab = createTab(fake);
            renderSyncPage(tab);

            await gitPathRow().buttons[0]!.click();

            expect(settingsOf(tab).sync.gitPath).toBe("C:\\Git\\cmd\\git.exe");
            // 输入框要跟着变：否则用户以为没挑上
            expect(gitPathRow().texts[0]?.inputEl.value).toBe("C:\\Git\\cmd\\git.exe");
            // 桌面上的路径可能带空格，所以只挑文件、不带 `openDirectory`
            expect(calls[0]).toMatchObject({ properties: ["openFile", "dontAddToRecent"] });
        });

        it("用户取消时什么都不改", async () => {
            installFakeElectron({
                showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
            });

            const tab = createTab(createFakeApp(), { sync: { gitPath: "C:\\old\\git.exe" } });
            renderSyncPage(tab);

            await gitPathRow().buttons[0]!.click();

            expect(settingsOf(tab).sync.gitPath).toBe("C:\\old\\git.exe");
        });

        /**
         * 开不了对话框的环境（移动端 / 将来的 Electron 换掉 `remote`）：
         * 按钮点了什么都不做，**不能抛**。旁边那个输入框一直在，路径照旧能填。
         */
        it("没有 electron（移动端）时点了不抛错、不改设置", async () => {
            const tab = createTab(createFakeApp(), { sync: { gitPath: "C:\\old\\git.exe" } });
            renderSyncPage(tab);

            await expect(gitPathRow().buttons[0]!.click()).resolves.toBeUndefined();
            expect(settingsOf(tab).sync.gitPath).toBe("C:\\old\\git.exe");
        });

        it("对话框抛错时也不抛（只当作没挑）", async () => {
            installFakeElectron({
                showOpenDialog: async () => {
                    throw new Error("remote is gone");
                },
            });

            const tab = createTab(createFakeApp(), { sync: { gitPath: "C:\\old\\git.exe" } });
            renderSyncPage(tab);

            await expect(gitPathRow().buttons[0]!.click()).resolves.toBeUndefined();
            expect(settingsOf(tab).sync.gitPath).toBe("C:\\old\\git.exe");
        });
    });

    /**
     * `.gitignore` 那一节（2026-09-24）。
     *
     * 这是设置页上**唯一能直接改文件内容**的地方，所以三件事都要钉住：
     * 内容真的显示出来了、改完真的写进磁盘了、写失败时用户知道「没写下去」。
     * 只验「渲染不抛错」等于没验 —— 一个连不上任何东西的输入框看起来完全一样。
     */
    describe(".gitignore 一节", () => {
        /** 状态徽标挂在标题那一行的 `nameEl` 上。 */
        function statusText(): string | undefined {
            const setting = createdSettings.find(
                (item) => item.name === zhCN.settings.sync.gitignoreHeading
            );
            const nameEl = setting?.nameEl as unknown as { children?: Array<{ text?: string }> };
            return nameEl?.children?.[0]?.text;
        }

        /**
         * 代码框是**块级 `textarea`**，不是 `Setting` 的控件
         * （放进 `.setting-item-control` 只有右侧几百像素宽，读不了规则清单）。
         * 所以它从节点树里按类名找，而不是从 `createdSettings`。
         */
        function gitignoreArea(tab: ObsyncSettingsTab): TextAreaEl {
            const container = (tab as unknown as { containerEl: ShimEl }).containerEl;
            const found = findAll(container, (child) => child.cls === "obsync-gitignore")[0];
            expect(found, "页面上没有找到 .gitignore 代码框").toBeDefined();
            return found as unknown as TextAreaEl;
        }

        /** 模拟用户输入（真实 DOM 里 `input` 事件）。 */
        function typeIn(area: TextAreaEl, value: string): void {
            area.value = value;
            area.trigger("input");
        }

        function saveButton() {
            return createdSettings
                .flatMap((setting) => setting.buttons)
                .find((button) => button.text === zhCN.settings.sync.gitignoreSave)!;
        }

        it("代码框是块级 textarea，**不在** `Setting` 的控件区里", () => {
            // 用户原话：「.gitignore的编辑框只占了右侧有限空间，太丑了，应该全宽才对」。
            // `.setting-item-control` 在 Obsidian 的设置页里只有右侧几百像素宽，
            // 12 行的规则清单挤在里面根本没法读 —— 所以它必须是块级元素。
            // 2026-10-02 起它挪进了设置组（左右缩进由组给），但**仍然不是**控件。
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));

            renderSyncPage(tab);

            const area = gitignoreArea(tab);
            expect(area.tagName).toBe("TEXTAREA");
            // 一个 `Setting` 控件都没占：它不可能被塞进某个控件区
            expect(createdSettings.flatMap((setting) => setting.textAreas)).toHaveLength(0);
            // 它在设置组的行容器里 —— 于是代码框与上面那行说明、下面那排按钮同一张卡片
            expect(groupOf(tab, area as unknown as ShimEl)).toBeDefined();
        });

        /**
         * 宽度与 `box-sizing` 走 CSS 类 `.obsync-gitignore`，**不内联**。
         *
         * 这里曾经钉的是反面 ——「宽度必须内联给，否则插件样式表不重读会让它缩回右侧
         * 那几百像素」（一次开发期的样式表缓存问题）。但那正是审核规则
         * `obsidianmd/no-static-styles-assignment` 要拦的事：静态宽度本来就该待在类里；
         * 规则只拦**字面量**赋值，用一个 `const` 就能绕过 —— 绕过的是形式，不是判据。
         * 所以现在钉「元素上不写内联样式」，宽度留给类。
         * （开发时改了 CSS 不生效，用完整重载 Obsidian 解决，而不是写进元素。）
         */
        it("宽度与 box-sizing 交给 CSS 类，元素上不写内联样式", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"));

            renderSyncPage(tab);

            const area = gitignoreArea(tab);
            expect(area.cls).toBe("obsync-gitignore");
            expect(area.style?.["width"]).toBeUndefined();
            expect(area.style?.["boxSizing"]).toBeUndefined();
        });

        it("文件已经存在时：内容显示在框里，徽标是「已保存」", async () => {
            const sync = createSyncStub("# 我的规则\n.obsidian/workspace.json\n");
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            expect(gitignoreArea(tab).value).toBe(
                "# 我的规则\n.obsidian/workspace.json\n"
            );
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreSaved);
            // 没有未保存的改动 → 保存按钮置灰（点了什么都不发生只会让人怀疑它坏了）
            expect(saveButton().disabled).toBe(true);
        });

        it("文件还不存在时：框是空的、徽标是「尚未创建」，且**不自动建文件**", async () => {
            const sync = createSyncStub(undefined);
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            expect(gitignoreArea(tab).value).toBe("");
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreMissing);
            // 打开设置页不该往用户库里多出一个文件
            expect(sync.writes).toEqual([]);
        });

        it("改内容 → 徽标变「有未保存的修改」，保存按钮可用；点保存真的写盘", async () => {
            const sync = createSyncStub("# 旧\n");
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            typeIn(gitignoreArea(tab), "# 新\n*.tmp\n");
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreDirty);
            expect(saveButton().disabled).toBe(false);

            await saveButton().click();

            expect(sync.writes).toEqual(["# 新\n*.tmp\n"]);
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreSaved);
            expect(saveButton().disabled).toBe(true);
        });

        it("失焦也会保存（不点按钮就点到别处不会丢）", async () => {
            const sync = createSyncStub("# 旧\n");
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            const area = gitignoreArea(tab);
            typeIn(area, "# 忘了点保存\n");
            area.trigger("blur");
            await flush();

            expect(sync.writes).toEqual(["# 忘了点保存\n"]);
        });

        it("写失败时**说清磁盘上还是旧内容**，且徽标仍显示有未保存的改动", async () => {
            const sync = createSyncStub("# 旧\n");
            sync.writeError = new Error("EACCES");
            const tab = createTab(createFakeApp(), {}, sync);
            const notifier = (tab as unknown as { obsync: { notifier: { reportError: unknown } } })
                .obsync.notifier;
            const reported: unknown[] = [];
            notifier.reportError = (error: unknown) => reported.push(error);

            renderSyncPage(tab);
            await flush();

            typeIn(gitignoreArea(tab), "# 写不下去\n");
            await saveButton().click();

            expect(reported).toHaveLength(1);
            // 不能翻成「已保存」—— 用户会以为改完了，而 git 那边一点没变
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreDirty);
        });

        it("「填入默认内容」只填进框里，**不直接覆盖磁盘**", async () => {
            // 覆盖掉用户自己的规则是数据损失 —— 要让他先看一眼再决定保存。
            const sync = createSyncStub("# 用户自己的规则\n");
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            const restore = createdSettings
                .flatMap((setting) => setting.buttons)
                .find((button) => button.text === zhCN.settings.sync.gitignoreRestore)!;
            restore.click();

            // 模板按**本库的配置目录名**展开（可以不是 `.obsidian`）
            const configDir = (tab.app as { vault: { configDir: string } }).vault.configDir;
            expect(gitignoreArea(tab).value).toBe(zhCN.sync.gitignoreTemplate(configDir));
            expect(sync.writes).toEqual([]);
            expect(statusText()).toBe(zhCN.settings.sync.gitignoreDirty);
        });

        it("「在编辑器中打开」走服务（而不是自己拼一条路径）", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(createFakeApp(), {}, sync);

            renderSyncPage(tab);
            await flush();

            const open = createdSettings
                .flatMap((setting) => setting.buttons)
                .find((button) => button.text === zhCN.settings.sync.gitignoreOpen)!;
            await open.click();

            expect(sync.opened).toBe(1);
        });

        /**
         * Obsidian 的库索引里不一定有以点开头的文件 —— 那时 `openGitignore` 打不开它。
         * **点了没反应**是最容易被当成「插件坏了」的一种失败，所以必须说一句，
         * 并且把用户指回上面那个确实能改的框。
         */
        it("打不开时给一句说明（而不是点了没反应）", async () => {
            const sync = createSyncStub("# 规则\n");
            sync.openResult = false;
            const tab = createTab(createFakeApp(), {}, sync);
            const warnings: string[] = [];
            (
                tab as unknown as { obsync: { notifier: { warn: (message: string) => void } } }
            ).obsync.notifier.warn = (message) => warnings.push(message);

            renderSyncPage(tab);
            await flush();

            await createdSettings
                .flatMap((setting) => setting.buttons)
                .find((button) => button.text === zhCN.settings.sync.gitignoreOpen)!
                .click();

            expect(warnings).toEqual([zhCN.sync.gitignoreOpenFailed]);
        });

        it("读失败不让整页崩：徽标留在「尚未创建」，框仍然可用", async () => {
            const sync = createSyncStub();
            sync.readError = new Error("EIO");
            const tab = createTab(createFakeApp(), {}, sync);

            expect(() => renderSyncPage(tab)).not.toThrow();
            await flush();

            expect(statusText()).toBe(zhCN.settings.sync.gitignoreMissing);
        });

        it("没有装配同步模块时这一节**不渲染**（移动端不会看到一堆点了没反应的按钮）", () => {
            const tab = createTab(createFakeApp());

            renderSyncPage(tab);

            expect(
                createdSettings.find(
                    (setting) => setting.name === zhCN.settings.sync.gitignoreHeading
                )
            ).toBeUndefined();
        });
    });

    /**
     * 「让 git 不再跟踪图片」（2026-10-02）。
     *
     * 用户的原话是：「我希望仓库同步不同步仓库里的图片，因为图片已经交给图片同步干了」。
     *
     * 这个动作有**三道闸**，每一道挡的都是一种真会丢东西的情形 —— 所以测试重点不是
     * 「能不能跑通」，而是「该拒绝的时候真的拒绝了、而且拒绝的理由是对的」：
     *
     * 1. 图片文件夹得是具体的（「整个库」=让 git 什么都不同步）；
     * 2. 图片同步得配好（否则图片从 git 里摘出去就没有第二个家）；
     * 3. 每一张都已在 R2 上（别的设备拉取这次改动时，靠云端把本地那份补回来）。
     */
    describe("让 git 不再跟踪图片", () => {
        const copy = zhCN.settings.sync.untrack;

        /** 找到那一行的按钮并点下去。 */
        async function clickUntrack(): Promise<void> {
            const button = createdSettings
                .flatMap((setting) => setting.buttons)
                .find((candidate) => candidate.text === copy.action);
            expect(button, "页面上没有找到「停止跟踪」按钮").toBeDefined();
            await button!.click();
            await flush();
        }

        /**
         * 弹窗里的所有文本：**标题也要**（`titleEl` 不在 `contentEl` 里 —— 真机就是
         * 这样，只走 `contentEl` 的话标题永远断言不到）。
         */
        function modalTexts(modal: { contentEl: unknown; titleEl: unknown }): string[] {
            const walk = (node: unknown): string[] => {
                const el = node as { text?: string; children?: unknown[] };
                return [...(el.text ? [el.text] : []), ...(el.children ?? []).flatMap(walk)];
            };
            return [modal.titleEl, modal.contentEl].flatMap((el) => walk(el));
        }

        /** 把通知记下来（三道闸的拒绝理由都要能断言）。 */
        function spyNotices(tab: ObsyncSettingsTab) {
            const notices = { warn: [] as string[], info: [] as string[], success: [] as string[] };
            const notifier = (
                tab as unknown as {
                    obsync: {
                        notifier: {
                            warn: (message: string) => void;
                            info: (message: string) => void;
                            success: (message: string) => void;
                        };
                    };
                }
            ).obsync.notifier;
            notifier.warn = (message) => notices.warn.push(message);
            notifier.info = (message) => notices.info.push(message);
            notifier.success = (message) => notices.success.push(message);
            return notices;
        }

        it("那一行在 `.gitignore` 一节里：名称、描述、按钮都在", () => {
            const tab = createTab(createFakeApp(), {}, createSyncStub("# 规则\n"), createImagesStub());

            renderSyncPage(tab);

            const row = createdSettings.find((setting) => setting.name === copy.name);
            expect(row).toBeDefined();
            expect(row!.desc).toBe(copy.desc);
            expect(row!.buttons.map((button) => button.text)).toEqual([copy.action]);
        });

        it("图片文件夹配成「整个库」→ 不拒绝，而是默认用**按扩展名**那种规则", async () => {
            // 默认设置里图片文件夹就是 [""]（整个库）。这种配置下「按文件夹」等于让
            // git 什么都不同步，所以按钮改成默认选「按扩展名」—— 这正是用户问
            // 「不能写图片格式吗」时想要的那种形状。
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(createFakeApp(), {}, sync, createImagesStub());
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            expect(notices.warn).toEqual([]);
            expect(openedModals).toHaveLength(1);
            expect(sync.writes).toEqual([]);
            // 弹窗里列的是扩展名，不是文件夹
            const texts = modalTexts(openedModals[0]!);
            expect(texts).toContain(copy.modal.extensionsLabel);
            expect(texts.some((text) => text.includes("*.png"))).toBe(true);
        });

        it("图片文件夹为空（用户把默认值删了）→ 拒绝，并指去图片同步页", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: [] } },
                sync,
                createImagesStub()
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            expect(notices.warn).toEqual([copy.needFolders]);
            expect(sync.writes).toEqual([]);
            expect(openedModals).toHaveLength(0);
        });

        it("图片同步没配好（缺 R2 凭据）→ 拒绝：那些图片没有第二个家", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments"] } },
                sync,
                createImagesStub({ configured: false })
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            expect(notices.warn).toEqual([copy.needCloud]);
            expect(sync.writes).toEqual([]);
            expect(openedModals).toHaveLength(0);
        });

        it("还有图片没传到 R2 → 拒绝，并把数量说出来", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments"] } },
                sync,
                createImagesStub({ pendingUploads: 3 })
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            expect(notices.warn).toEqual([copy.notUploaded.replace("{count}", "3")]);
            expect(sync.writes).toEqual([]);
            expect(openedModals).toHaveLength(0);
        });

        it("列不出远端清单（网络/凭据）→ 拒绝，不能默认「云端都有」", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments"] } },
                sync,
                createImagesStub({ planError: new Error("offline") })
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            // reportError 走 fallback 文案（替身里 warn 没被调用，但绝不能执行）
            expect(sync.writes).toEqual([]);
            expect(sync.untracked).toEqual([]);
            expect(notices.warn).toEqual([]);
        });

        it("三道闸都过了 → 先弹确认框，**确认之前什么都不改**", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments"] } },
                sync,
                createImagesStub()
            );
            spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();

            expect(openedModals).toHaveLength(1);
            // 关键：还没点「继续」，仓库与文件都没动
            expect(sync.writes).toEqual([]);
            expect(sync.untracked).toEqual([]);

            // 弹窗里要把三步与两条警告都写出来（用户问的就是「流程是什么」）
            const texts = modalTexts(openedModals[0]!);
            expect(texts).toContain(copy.modal.title);
            for (const step of copy.modal.steps) expect(texts).toContain(step);
            expect(texts).toContain(copy.modal.warningOthers);
            expect(texts).toContain(copy.modal.warningHistory);
            // 要停止跟踪的文件夹列出来了
            expect(texts.some((text) => text.includes("attachments"))).toBe(true);
        });

        it("确认之后：写 .gitignore + 摘索引 + 汇报数量，并把代码框刷新成磁盘上的新内容", async () => {
            const sync = createSyncStub("# 规则\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments", "assets/img"] } },
                sync,
                createImagesStub()
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await flush();
            await clickUntrack();

            // 点弹窗里的「继续」
            const confirm = createdSettings
                .flatMap((setting) => setting.buttons)
                .filter((button) => button.text === copy.modal.confirm)
                .at(-1)!;
            await confirm.click();
            await flush();

            expect(sync.writes[0]).toBe("# 规则\nattachments/\nassets/img/\n");
            expect(sync.untracked).toEqual([["attachments", "assets/img"]]);
            expect(notices.success).toEqual([copy.done.replace("{rules}", "2").replace("{files}", "2")]);

            // 代码框必须显示刚写下去的规则：它是**失焦即保存**的，停在旧内容上
            // 意味着用户下一次编辑会把新规则整份覆盖掉。
            const area = findAll(
                (tab as unknown as { containerEl: ShimEl }).containerEl,
                (child) => child.cls === "obsync-gitignore"
            )[0] as unknown as { value: string } | undefined;
            expect(area?.value).toBe("# 规则\nattachments/\nassets/img/\n");
        });

        it("重复点一次：规则already在、索引里也没有 → 不重复加，只说明情况", async () => {
            const sync = createSyncStub("attachments/\n");
            const tab = createTab(
                createFakeApp(),
                { images: { folders: ["attachments"] } },
                sync,
                createImagesStub()
            );
            const notices = spyNotices(tab);

            renderSyncPage(tab);
            await clickUntrack();
            await createdSettings
                .flatMap((setting) => setting.buttons)
                .filter((button) => button.text === copy.modal.confirm)
                .at(-1)!
                .click();
            await flush();

            // 没写文件（内容没变），但索引那一步照走（幂等）
            expect(sync.writes).toEqual([]);
            expect(sync.untracked).toEqual([["attachments"]]);
            // 先有「正在确认…」那条即时反馈，再有结论
            expect(notices.info).toEqual([copy.checking, copy.nothing]);
        });

        /**
         * 「按扩展名」那条路（2026-10-02 加）。
         *
         * 它与「按文件夹」的差别在于**摘索引的名单从哪来**：文件夹模式直接给 git 几个
         * 文件夹；扩展名模式得先问 git「哪些文件已被跟踪」，再挑出图片 —— 只摘图片，
         * 笔记一个都不能碰（多摘一个就是「git 不管这篇笔记了」，而且没有任何提示）。
         */
        describe("按扩展名", () => {
            /** 点弹窗里的「继续」。 */
            async function confirmModal(): Promise<void> {
                await createdSettings
                    .flatMap((setting) => setting.buttons)
                    .filter((button) => button.text === copy.modal.confirm)
                    .at(-1)!
                    .click();
                await flush();
            }

            it("确认之后：写扩展名规则，且只摘图片、不碰笔记", async () => {
                const sync = createSyncStub("# 规则\n");
                sync.tracked = [
                    "attachments/a.png",
                    "notes/cover.PNG",
                    "assets/photo.jpg",
                    "notes/note.md",
                    "notes/diagram.excalidraw.md",
                ];
                const tab = createTab(createFakeApp(), {}, sync, createImagesStub());
                const notices = spyNotices(tab);

                renderSyncPage(tab);
                await flush();
                await clickUntrack();
                await confirmModal();

                // 规则：小写 + 大写各一条（Linux 上 git 区分大小写）
                const written = sync.writes[0]!;
                expect(written.startsWith("# 规则\n")).toBe(true);
                expect(written).toContain("*.png\n");
                expect(written).toContain("*.PNG\n");
                expect(written).toContain("*.jpg\n");
                // 笔记一个都没进规则
                expect(written).not.toContain("notes/");

                // 摘索引：只有图片（.PNG 也要命中 —— 比较不区分大小写）
                expect(sync.untracked).toEqual([
                    ["attachments/a.png", "notes/cover.PNG", "assets/photo.jpg"],
                ]);
                // 汇报：规则条数与文件数都对得上
                const rules = written.trim().split("\n").length - 1; // 减去原来那一行
                expect(notices.success).toEqual([
                    copy.done.replace("{rules}", String(rules)).replace("{files}", "3"),
                ]);
            });

            it("索引里一张图片都没有 → 规则照写，摘索引那一步是空操作", async () => {
                const sync = createSyncStub("");
                sync.tracked = ["notes/note.md"];
                const tab = createTab(createFakeApp(), {}, sync, createImagesStub());

                renderSyncPage(tab);
                await flush();
                await clickUntrack();
                await confirmModal();

                expect(sync.writes[0]).toContain("*.png\n");
                // 空数组直接返回（服务层判空），不会拿空名单去碰 git
                expect(sync.untracked).toEqual([[]]);
            });
        });
    });
});

/**
 * 图片同步页。
 *
 * 这一页比别的页更值得渲染冒烟：它是**唯一能让用户指定「插件能动哪些文件」**
 * 的地方，而那一格填错的表现是「一个文件都不动」或「动了不该动的」——
 * 两种都没有任何提示。所以除了「画得出来」，这里还验「改了就真的写进设置」
 * 与「归一之后才写」。
 */
describe("设置页 · 图片同步页", () => {
    type ShimEl = {
        cls?: string;
        text?: string;
        children?: ShimEl[];
        /** 裸 DOM 上的监听器（见 `tests/setup.ts` 的 `addEventListener`）。 */
        trigger?: (name: string, ...args: unknown[]) => void;
    };

    /**
     * 裸输入元素在测试里的形状（`tests/setup.ts` 的替身）。
     *
     * 监听器与 `trigger` 都记在元素上，所以裸 DOM 上的交互（回车加入、点候选）
     * 测得到 —— 见 `tests/setup.ts` 里 `addEventListener` 的说明。
     */
    type TestInput = {
        value: string;
        trigger: (name: string, ...args: unknown[]) => void;
    };

    function renderImagesPage(tab: ObsyncSettingsTab): void {
        (tab as unknown as { renderImages(): void }).renderImages();
    }

    function childrenOf(tab: ObsyncSettingsTab): ShimEl[] {
        const container = (tab as unknown as { containerEl: { children: unknown[] } }).containerEl;
        return container.children as ShimEl[];
    }

    /**
     * 在节点树里**递归**找。
     *
     * 设置行自 2026-10-02 起收进了 `.setting-group > .setting-items`（见
     * `settingsTab.openGroup`），提示段与结果区都不再是 `containerEl` 的直接
     * 子节点 —— 只看一层会全部找不到。
     */
    function findAllIn(tab: ObsyncSettingsTab, predicate: (el: ShimEl) => boolean): ShimEl[] {
        const out: ShimEl[] = [];
        const walk = (el: ShimEl): void => {
            for (const child of el.children ?? []) {
                if (predicate(child)) out.push(child);
                walk(child);
            }
        };
        walk((tab as unknown as { containerEl: ShimEl }).containerEl);
        return out;
    }

    /**
     * 「需要图片同步的文件夹」那一格的**添加输入框**。
     *
     * 2026-10-02 起那一格是「输入一个路径 → 加入列表」，不是多行文本框：
     * 所以这里拿的是添加行（`obsync-inline-field`）里的那个输入元素。
     *
     * **取最后一行的那个**：`commit(true)` 会重绘，`createdSettings` 只增不减
     * （见 `tests/stubs/obsidian.ts` 的 `resetCreatedSettings`），所以「第一条」
     * 可能是上一次渲染留下的旧节点。
     */
    function foldersInput(): TestInput {
        const rows = createdSettings.filter((setting) =>
            setting.buttons.some((button) => button.text === zhCN.settings.images.foldersBrowse)
        );
        expect(rows.length, "页面上没有找到文件夹添加行").toBeGreaterThan(0);
        const input = rows.at(-1)!.texts[0];
        expect(input, "添加行里没有输入框").toBeDefined();
        return input!.inputEl as unknown as TestInput;
    }

    /** 按回车（真实 DOM 里 `keydown`）。 */
    function pressEnter(input: TestInput): void {
        input.trigger("keydown", { key: "Enter", preventDefault: () => {} });
    }

    /** 在添加框里打字（真实 DOM 里 `input` 事件驱动候选下拉）。 */
    function typeFolders(value: string): void {
        const input = foldersInput();
        input.value = value;
        input.trigger("input");
    }

    /** 候选下拉里当前列出的项目文字。 */
    function suggestions(tab: ObsyncSettingsTab): string[] {
        return findAllIn(tab, (child) => child.cls === "obsync-path-suggest-item").map(
            (item) => item.children?.[0]?.text ?? ""
        );
    }

    /** 某个节点落在哪一组里（找不到 = 不在任何组里）。 */
    function groupOf(tab: ObsyncSettingsTab, target: ShimEl): ShimEl | undefined {
        const contains = (el: ShimEl): boolean =>
            el === target || (el.children ?? []).some((child) => contains(child));
        return findAllIn(tab, (el) => el.cls === "setting-items").find((group) =>
            (group.children ?? []).some((child) => contains(child))
        );
    }

    /** 某个设置行落在哪一组里。 */
    function rowGroup(tab: ObsyncSettingsTab, name: string): ShimEl | undefined {
        const setting = row(name);
        return setting ? groupOf(tab, setting.settingEl as unknown as ShimEl) : undefined;
    }

    function row(name: string) {
        return createdSettings.find((setting) => setting.name === name);
    }

    /** 设置页的落盘计数（`commit()` 会 +1）。 */
    function saveCount(tab: ObsyncSettingsTab): number {
        return (tab as unknown as { obsync: { saved: number } }).obsync.saved;
    }

    it("渲染不抛错，且注意事项是这一页的第一条内容", () => {
        const tab = createTab(createFakeApp());

        expect(() => renderImagesPage(tab)).not.toThrow();

        // 2026-10-06 起这一页**没有页首标题**（页签「图片同步」已经是页名），
        // 注意事项因此直接成为第一条内容。被挪到页面别处这条就红。
        expect(childrenOf(tab)[0]?.cls).toBe("obsync-image-notes");
    });

    it("注意事项逐条来自 locale（漏一条就等于没写）", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const notes = childrenOf(tab).find((child) => child.cls === "obsync-image-notes");
        const [heading, list] = notes!.children!;

        expect(heading?.text).toBe(zhCN.settings.images.notesHeading);
        expect(list?.children?.map((item) => item.text)).toEqual(zhCN.settings.images.notes);
    });

    /**
     * 默认值已经是仓库根目录，所以这行提示**不再**随默认设置出现。
     * 要验它，必须显式给一个空列表 —— 那才是「用户把文件夹全删了」的状态。
     */
    it("一个受管文件夹都没配时多一行说明（否则用户不知道下一步做什么）", () => {
        const tab = createTab(createFakeApp(), { images: { folders: [] } });
        renderImagesPage(tab);

        const hint = findAllIn(
            tab,
            (child) =>
                child.cls === "setting-item-description" &&
                child.text === zhCN.settings.images.foldersEmpty
        );
        expect(hint).toHaveLength(1);
    });

    it("配了文件夹之后那行提示消失", () => {
        const tab = createTab(createFakeApp(), { images: { folders: ["attachments"] } });
        renderImagesPage(tab);

        expect(
            findAllIn(tab, (child) => child.text === zhCN.settings.images.foldersEmpty)
        ).toHaveLength(0);
    });

    /**
     * 「需要图片同步的文件夹」= **一个添加输入框 + 一份已加入的列表**（2026-10-02）。
     *
     * 用户两次要求定下的形状：① 框不要挤在右边（描述四行、框里只看得见一个 `.`）；
     * ② 「路径输入框应该和浏览、恢复默认按钮在同一行」「不需要拉高度」「输入时下方
     * 提供候选辅助」「可以添加多个文件夹，在下方列出并提供删除按钮」。
     *
     * 多行文本框因此整个去掉了 —— 它的高度、`resize`、「一行一个」的写盘方式都
     * 不再存在，所以这一组用例钉的是**新形状**。
     */
    it("添加行：输入框与「浏览…」「恢复默认」在同一行", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const addRow = createdSettings.find((setting) =>
            setting.buttons.some((button) => button.text === zhCN.settings.images.foldersBrowse)
        );
        expect(addRow).toBeDefined();
        // 输入框与两个按钮**同一条 `Setting`** = 同一行
        expect(addRow!.texts[0]?.placeholder).toBe(zhCN.settings.images.foldersPlaceholder);
        expect(addRow!.buttons.map((button) => button.text)).toEqual([
            zhCN.settings.images.foldersBrowse,
            zhCN.settings.images.foldersReset,
        ]);
        // 排在名称/描述那一行之后
        expect(createdSettings.indexOf(addRow!)).toBeGreaterThan(
            createdSettings.indexOf(row(zhCN.settings.images.folders)!)
        );
        // **贴左**：它给的是上面那一格，顶到最右会看不出这层关系；
        // `obsync-inline-field` 再让输入框吃掉整行剩余宽度。
        expect(addRow!.classes).toContain("obsync-inline-actions");
        expect(addRow!.classes).toContain("obsync-inline-field");

        // 页面上**没有**多行文本框了（「不需要拉高度」）
        expect(createdSettings.flatMap((setting) => setting.textAreas)).toHaveLength(0);
        expect(findAllIn(tab, (child) => child.cls === "obsync-folders")).toHaveLength(0);
    });

    it("已加入的文件夹各占一行，带删除按钮", () => {
        const tab = createTab(createFakeApp(), {
            images: { folders: ["attachments", "assets/img"] },
        });
        renderImagesPage(tab);

        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-folder-row")
        );
        expect(rows.map((setting) => setting.name)).toEqual(["attachments", "assets/img"]);
        for (const folderRow of rows) {
            const remove = folderRow.buttons.find(
                (button) => button.tooltip === zhCN.settings.images.foldersRemove
            );
            expect(remove, `${folderRow.name} 那一行没有删除按钮`).toBeDefined();
        }
    });

    /**
     * 「浏览…」与「恢复默认」之间没有任何多余的东西，且都挂在添加行上 ——
     * 这一条是给「两个按钮被拆到另一行」那种回归准备的。
     */
    it("两个按钮与输入框同属一行（不再单独占一行）", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const rowsWithButtons = createdSettings.filter(
            (setting) =>
                setting.buttons.some((button) => button.text === zhCN.settings.images.foldersBrowse) ||
                setting.buttons.some((button) => button.text === zhCN.settings.images.foldersReset)
        );
        expect(rowsWithButtons).toHaveLength(1);
        expect(rowsWithButtons[0].texts).toHaveLength(1);
    });

    /**
     * 默认值是仓库根目录（整个库），归一后的形状是 `[""]`。
     *
     * 列表里必须显示**人话**：一个空行读起来像「坏了一行」，用户会以为插件坏了，
     * 然后去手动填一个更窄的范围。（旧版是把它显示成 `.`。）
     */
    it("默认的仓库根目录在列表里显示成「仓库根目录（整个库）」", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        expect(settingsOf(tab).images.folders).toEqual([""]);
        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-folder-row")
        );
        expect(rows.map((setting) => setting.name)).toEqual([
            zhCN.settings.images.folderPickerRoot,
        ]);
    });

    it("删除按钮把那一项从设置里去掉（并落盘 + 重绘）", async () => {
        const tab = createTab(createFakeApp(), {
            images: { folders: ["attachments", "assets/img"] },
        });
        renderImagesPage(tab);

        const before = saveCount(tab);
        const folderRow = createdSettings.find((setting) => setting.name === "attachments")!;
        await folderRow.buttons.find(
            (button) => button.tooltip === zhCN.settings.images.foldersRemove
        )!.click();

        expect(settingsOf(tab).images.folders).toEqual(["assets/img"]);
        expect(saveCount(tab)).toBeGreaterThan(before);
    });

    /**
     * 默认值是仓库根目录（整个库），归一后的形状是 `[""]`。
     *
     * 列表里必须显示**人话**：一个空行读起来像「坏了一行」，用户会以为插件坏了，
     * 然后去手动填一个更窄的范围。（旧版是把它显示成 `.`。）
     */
    it("默认的仓库根目录在列表里显示成「仓库根目录（整个库）」", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        expect(settingsOf(tab).images.folders).toEqual([""]);
        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-folder-row")
        );
        expect(rows.map((setting) => setting.name)).toEqual([
            zhCN.settings.images.folderPickerRoot,
        ]);
    });

    /**
     * 分节与动作行的形状（2026-10-02）。
     *
     * 用户给的两张截图说的都是同一件事：**没有名称的设置行**会把按钮顶到
     * 最右边、左半边空着，看起来就是一条空荡荡的横条；而十几张彼此独立的
     * 卡片让整页没有层次。这一组用例把修好的形状钉住：
     *
     *   - 相关的行在同一个 `.setting-group` 里（一整组一张卡片）；
     *   - 动作按钮挂在**节标题**那一行（`obsync-group-heading`）；
     *   - 「浏览… / 恢复默认」这类行贴左（`obsync-inline-actions`）。
     */
    describe("分节与动作行", () => {
        /**
         * 常用动作排在这一页最前面（2026-10-02）。
         *
         * 用户的原话是「图中的功能比较常用，应该放到页面最前面才对」——
         * 此前「操作」沉在四个设置节的最底下，而配好之后那三段基本不会再翻。
         */
        it("「操作」紧跟注意事项，排在所有设置节之前", () => {
            const tab = createTab(createFakeApp(), {}, undefined, createImagesStub());
            renderImagesPage(tab);

            const children = childrenOf(tab);
            const notesIndex = children.findIndex((child) => child.cls === "obsync-image-notes");
            const firstGroupIndex = children.findIndex(
                (child) => child.cls === "setting-group obsync-group"
            );
            expect(notesIndex).toBeGreaterThanOrEqual(0);
            expect(firstGroupIndex).toBeGreaterThan(notesIndex);

            // 第一个设置组就是「操作」那一组：它的标题行在建组时最先登记
            expect(createdSettings.indexOf(row(zhCN.settings.images.actionsHeading)!)).toBeLessThan(
                createdSettings.indexOf(row(zhCN.settings.images.enabled)!)
            );
        });

        /**
         * 空的结果区排在**第一行之前**。
         *
         * 这与 styles.css 里那条「上一行不是设置行时不画分隔线」是一对：
         * `display: none` 的它**仍然占着 `:first-child`**，于是 Obsidian 会给真正
         * 显示在最上面的那一行画出分隔线 —— 一条悬空的横线（用户截图指出的那条）。
         * 改这个排列（或删那条 CSS）之前先读两边的注释。
         */
        it("空的结果区在第一行之前 —— 第一行的分隔线不能靠 `:first-child` 豁免", () => {
            const tab = createTab(createFakeApp(), {}, undefined, createImagesStub());
            renderImagesPage(tab);

            const rows = rowGroup(tab, zhCN.settings.images.openManager);
            // 第一个是那个**空的**结果区，第二个才是「打开图片管理」那一行
            expect(rows?.children?.[0]?.cls).toBe("obsync-diagnostics");
            expect(rows?.children?.[1]).toBe(
                row(zhCN.settings.images.openManager)!.settingEl as unknown as ShimEl
            );
        });

        it("变动同步与周期紧跟在总开关下面，且不在「冲突与删除」那一节里", () => {
            // 2026-10-02 挪的：原先「自动同步间隔」排在「冲突与删除」那一节的**末尾**，
            // 与它实际管的事（多久自动跑一轮）毫无关系 —— 而用户正是从那里读出了
            // 「设为 0 = 图片同步关着」这个误会。
            //
            // 2026-10-06 在总开关与周期之间插进了「变动后自动同步」：它是本机改动的
            // 主力（周期那条现在只管把别处的变化拉回来），所以排在周期上面。
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            const basics = rowGroup(tab, zhCN.settings.images.enabled);
            expect(basics).toBeDefined();
            expect(rowGroup(tab, zhCN.settings.images.changeSync)).toBe(basics);
            expect(rowGroup(tab, zhCN.settings.images.autoSync)).toBe(basics);

            const index = (name: string): number => createdSettings.indexOf(row(name)!);
            expect(index(zhCN.settings.images.changeSync)).toBe(
                index(zhCN.settings.images.enabled) + 1
            );
            expect(index(zhCN.settings.images.autoSync)).toBe(
                index(zhCN.settings.images.changeSync) + 1
            );
            expect(index(zhCN.settings.images.autoSync)).toBeLessThan(
                index(zhCN.settings.images.folders)
            );
            // 「冲突与删除」那一节里只剩两个策略下拉
            expect(rowGroup(tab, zhCN.settings.images.conflictPolicy)).not.toBe(basics);
            expect(rowGroup(tab, zhCN.settings.images.deleteRemotePolicy)).not.toBe(basics);
        });

        /**
         * 「变动后自动同步」那一行：`[延时] 秒 [开关]`（2026-10-06 加）。
         *
         * 与下面「按周期同步」同一形状。默认**开**、静默 30 秒 ——
         * 理由见 `ImageSyncSettings.imageChangeSyncEnabled`（它与「每隔 N 分钟
         * 无条件跑一轮」不是一类东西）。
         */
        it("变动同步：框在开关前面、单位在中间；范围 5–600，默认开 / 30 秒", () => {
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            const row_ = row(zhCN.settings.images.changeSync);
            expect(row_).toBeDefined();
            expect(row_!.texts[0]?.value).toBe("30");
            expect(row_!.texts[0]?.inputEl.min).toBe("5");
            expect(row_!.texts[0]?.inputEl.max).toBe("600");
            expect(row_!.toggles[0]?.value).toBe(true);
            expect(DEFAULT_SETTINGS.images.imageChangeSyncEnabled).toBe(true);
            expect(DEFAULT_SETTINGS.images.imageChangeDelaySeconds).toBe(30);
            // 顺序：先框、后开关
            expect(row_!.controls.indexOf(row_!.texts[0]!)).toBeLessThan(
                row_!.controls.indexOf(row_!.toggles[0]!)
            );
            // 单位「秒」跟在框后面
            const unitSpans = Array.from(
                row_!.controlEl.children as unknown as Array<{ text?: string }>
            ).map((child) => child.text);
            expect(unitSpans).toContain(zhCN.settings.images.secondsUnit);
        });

        it("拨动变动同步会写进设置（否则拨了没反应）", async () => {
            const tab = createTab(createFakeApp(), {
                images: { imageChangeSyncEnabled: true },
            });
            const plugin = (
                tab as unknown as {
                    obsync: { settings: ReturnType<typeof normalizeSettings>; saved: number };
                }
            ).obsync;

            renderImagesPage(tab);
            row(zhCN.settings.images.changeSync)!.toggles[0]!.toggle(false);
            await Promise.resolve();

            expect(plugin.settings.images.imageChangeSyncEnabled).toBe(false);
            expect(plugin.saved).toBe(1);
        });

        /**
         * 「按周期同步」那一行：`[周期] 单位 [开关]`（2026-10-02 第二次改）。
         *
         * 用户的原话是「自动同步间隔为 0 的情况也是不太好让人理解，如果把最小值设置为
         * 5 是不是更合适」—— 0 一旦收紧就得有别的东西表达「关」，于是拆出
         * `autoSyncEnabled`：**数字里不再有 0 的含义**，范围 5–1440。
         */
        it("周期框在开关前面、单位在中间；下限是 5，初始值来自设置", () => {
            const tab = createTab(createFakeApp(), {
                version: 8,
                images: { autoSyncEnabled: true, autoSyncMinutes: 30 },
            });
            renderImagesPage(tab);

            const periodic = createdSettings.find(
                (setting) => setting.name === zhCN.settings.images.autoSync
            );
            expect(periodic).toBeDefined();
            expect(periodic!.texts[0]?.value).toBe("30");
            expect(periodic!.texts[0]?.inputEl.min).toBe("5");
            expect(periodic!.texts[0]?.inputEl.max).toBe(String(24 * 60));
            expect(periodic!.toggles[0]?.value).toBe(true);
            // 顺序：先框、后开关
            expect(periodic!.controls.map((control) => control.constructor.name)).toEqual([
                "TextComponent",
                "ToggleComponent",
            ]);
            const unit = (
                periodic!.controlEl.children as unknown as Array<{ cls?: string; text?: string }>
            ).find((child) => child.cls === "obsync-unit");
            expect(unit?.text).toBe(zhCN.settings.images.minutesUnit);
        });

        it("周期默认是关的（总开关开着也不会自己按周期跑）", () => {
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            const periodic = createdSettings.find(
                (setting) => setting.name === zhCN.settings.images.autoSync
            );
            expect(periodic!.toggles[0]?.value).toBe(false);
            expect(DEFAULT_SETTINGS.images.autoSyncEnabled).toBe(false);
        });

        it("周期低于 5 会被忽略；拨开关会写进设置，且不动周期值", async () => {
            const tab = createTab(createFakeApp(), {
                version: 8,
                images: { autoSyncEnabled: true, autoSyncMinutes: 30 },
            });
            renderImagesPage(tab);

            const periodic = createdSettings.find(
                (setting) => setting.name === zhCN.settings.images.autoSync
            );
            await periodic!.texts[0]!.type("0");
            await periodic!.texts[0]!.type("abc");
            expect(settingsOf(tab).images.autoSyncMinutes).toBe(30);

            await periodic!.toggles[0]!.toggle(false);
            expect(settingsOf(tab).images.autoSyncEnabled).toBe(false);
            // 关掉周期**不动**周期值 —— 再打开时还是 30
            expect(settingsOf(tab).images.autoSyncMinutes).toBe(30);
        });

        /**
         * 出界的输入**不能在框里留着一个不生效的数字**。
         *
         * 用户的原话：「按周期同步如果输入 0-4 的值不会被视觉修正是吗？这不合理吧」
         * —— 对，之前就是那样：框里写着 0、真正生效的却是 10。现在失焦会把显示
         * 对齐回生效值。`addNumberField` 的说明里写了为什么修在失焦而不是 onChange
         * （onChange 每按一个键都触发，改框会打断「15」这种两位数输入）。
         */
        it("出界的输入：失焦时把框里的显示对齐回生效值", async () => {
            const tab = createTab(createFakeApp(), {
                version: 8,
                images: { autoSyncEnabled: true, autoSyncMinutes: 30 },
            });
            renderImagesPage(tab);

            const field = createdSettings.find(
                (setting) => setting.name === zhCN.settings.images.autoSync
            )!.texts[0]!;

            // 打字过程中出界：不写、也不打断输入
            await field.type("0");
            expect(settingsOf(tab).images.autoSyncMinutes).toBe(30);

            // 失焦：显示对齐回 30（而不是留着 0）
            field.inputEl.trigger?.("blur");
            expect(field.value).toBe("30");

            // 合法值照旧立即生效，失焦不改它
            await field.type("45");
            expect(settingsOf(tab).images.autoSyncMinutes).toBe(45);
            field.inputEl.trigger?.("blur");
            expect(field.value).toBe("45");
        });

        it("压缩默认质量也在同一套规则里（越界的 5 不再被偷偷存下去）", async () => {
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            const field = createdSettings.find(
                (setting) => setting.name === zhCN.settings.images.compressQuality
            )!.texts[0]!;

            // 以前这里会把 5 存进设置，直到下次加载才被钳回 10 —— 框里写的与生效的
            // 一直不是一回事。现在直接不接受，失焦对齐。
            await field.type("5");
            expect(settingsOf(tab).images.compressQuality).toBe(82);
            field.inputEl.trigger?.("blur");
            expect(field.value).toBe("82");
        });

        it("总开关叫「自动同步图片」而不是「启用图片同步」", () => {
            // 旧名字听起来像「图片同步的总开关」，于是「间隔设为 0」被读成
            // 「图片同步关着」—— 而**启动时仍会同步一轮**。
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            expect(zhCN.settings.images.enabled).toBe("自动同步图片");
            expect(row("自动同步图片")).toBeDefined();
            expect(row("启用图片同步")).toBeUndefined();
            // 两行描述都要把「关掉周期 ≠ 关掉这一页的自动动作」说出来
            // （2026-10-06 起「周期」那一行上面的开关变成了两个，所以文案写的是
            // 「上面的总开关」—— 说「上面的开关」会指代不清）。
            expect(zhCN.settings.images.autoSyncDesc).toContain("上面的总开关开着时，启动仍会同步一轮");
            expect(zhCN.settings.images.enabledDesc).toContain("启动时跑一轮");
        });

        /**
         * 「按周期同步」那一行的描述在 2026-10-06 **被重写过**，这条用例也跟着换了前提。
         *
         * 原来守的是「别把『改名 / 删除当场处理』写成『有变化就同步』」——
         * 那时新加或修改的图片确实不会立刻上传。加了「变动后自动同步」之后，
         * 那句话不再成立（本机改动由那一项负责），于是这里改守**新的分工**：
         * 周期那条必须说清它管的是**别处**的变化，本机的交给上面那一项。
         */
        it("周期那一行的描述说清它只管「别处」的变化", () => {
            // 用户的原话是「并在你改名或删除图片时同步云端那一份，不就是有变化就同步
            // 的意思吗」—— 当年要靠描述纠正这个误读；现在分工更清楚了：
            // 本机改动归「变动后自动同步」，周期只管把其他设备的改动拉回来。
            expect(zhCN.settings.images.autoSyncDesc).toContain("其他设备");
            expect(zhCN.settings.images.autoSyncDesc).toContain("本机的改动由上面那一项负责");
            // 反过来，「变动后自动同步」那一行必须说清它只管本机
            expect(zhCN.settings.images.changeSyncDesc).toContain("本机");
            expect(zhCN.settings.images.changeSyncDesc).toContain("按周期同步");
            // 总开关的描述仍然要说「改名 / 删除是当场处理的」
            expect(zhCN.settings.images.enabledDesc).toContain("当场跟着处理");
        });

        it("同一个「Cloudflare R2 连接」里的几行同组，跨节的异组", () => {
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            const connection = rowGroup(tab, zhCN.settings.images.accountId);
            expect(connection).toBeDefined();
            expect(rowGroup(tab, zhCN.settings.images.bucket)).toBe(connection);
            expect(rowGroup(tab, zhCN.settings.images.secretKey)).toBe(connection);

            // 开关、受管文件夹在「基础」那一组；压缩默认值是另一组
            const basics = rowGroup(tab, zhCN.settings.images.enabled);
            expect(basics).toBeDefined();
            expect(rowGroup(tab, zhCN.settings.images.folders)).toBe(basics);
            expect(rowGroup(tab, zhCN.settings.images.compressQuality)).not.toBe(connection);
            expect(rowGroup(tab, zhCN.settings.images.compressQuality)).not.toBe(basics);
        });

        it("三个动作按钮挂在「操作」标题行上，**不再**单占一条空卡片", () => {
            // 用户截图里最丑的一处：一条卡片上只有最右边三个按钮。
            const tab = createTab(createFakeApp(), {}, undefined, createImagesStub());
            renderImagesPage(tab);

            const heading = createdSettings.find(
                (setting) =>
                    setting.name === zhCN.settings.images.actionsHeading &&
                    setting.buttons.some((button) => button.text === zhCN.settings.images.syncNow)
            );
            expect(heading).toBeDefined();
            expect(heading!.classes).toContain("obsync-group-heading");
            expect(heading!.buttons.map((button) => button.text)).toEqual([
                zhCN.settings.images.test,
                zhCN.settings.images.preview,
                zhCN.settings.images.syncNow,
            ]);

            // 那一行**没有**按钮：按钮全在标题行上（否则又是那条空横条）
            const namelessButtonRows = createdSettings.filter(
                (setting) => !setting.name && setting.buttons.length > 0
            );
            expect(
                namelessButtonRows.map((setting) => setting.buttons.map((button) => button.text))
            ).toEqual([[zhCN.settings.images.foldersBrowse, zhCN.settings.images.foldersReset]]);
        });

        it("结果区在「操作」组里，且在标题行的按钮**下面**", () => {
            const tab = createTab(createFakeApp(), {}, undefined, createImagesStub());
            renderImagesPage(tab);

            const results = findAllIn(tab, (el) => el.cls === "obsync-diagnostics");
            expect(results).toHaveLength(1);
            expect(groupOf(tab, results[0]!)).toBeDefined();
        });
    });

    /**
     * 「恢复默认」把列表重置回仓库根目录。
     *
     * 两件事都要验：值**真的被改写**（而不是只重绘一遍），以及落盘 ——
     * 「改了没存」是设置页最容易犯的错，表现为「重置完重启又变回去」。
     */
    it("「恢复默认」把列表重置回仓库根目录，并落盘", async () => {
        const tab = createTab(createFakeApp(), {
            images: { folders: ["attachments", "assets/img"] },
        });
        renderImagesPage(tab);

        const before = saveCount(tab);
        const reset = createdSettings
            .find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.settings.images.foldersReset)
            )!
            .buttons.find((button) => button.text === zhCN.settings.images.foldersReset)!;
        await reset.click();

        expect(settingsOf(tab).images.folders).toEqual([""]);
        expect(saveCount(tab)).toBe(before + 1);
    });

    it("已经是默认值时「恢复默认」置灰（点了什么都不发生，只会让人怀疑按钮坏了）", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const reset = createdSettings
            .find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.settings.images.foldersReset)
            )!
            .buttons.find((button) => button.text === zhCN.settings.images.foldersReset)!;
        expect(reset.disabled).toBe(true);
    });

    /**
     * 「浏览…」的完整链路：点下去 → 弹出选择器 → 选中一个文件夹 → 并进受管
     * 列表（归一后）并落盘。
     *
     * 为什么要验到这一步：入口按钮最常见的坏法是「弹是弹了，选中之后什么都
     * 没有发生」—— 那在界面上只是「选完就没了」，没有任何提示。
     */
    it("点「浏览…」弹出选择器，选中后并进受管列表并落盘", async () => {
        const fake = createFakeApp({ "attachments/a.png": "x" });
        const tab = createTab(fake, { images: { folders: ["assets/img"] } });
        renderImagesPage(tab);

        const before = saveCount(tab);
        createdSettings
            .find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.settings.images.foldersBrowse)
            )!
            .buttons.find((button) => button.text === zhCN.settings.images.foldersBrowse)!
            .click();

        // 拿到真弹窗：选择器的建议列表由 vault 的文件夹生成，
        // 所以「选了什么」不必手捏一个选项对象。
        const modal = openedModals.at(-1) as unknown as {
            getSuggestions: (query: string) => Array<{ path: string }>;
            onChooseSuggestion: (option: { path: string }) => void;
        };
        expect(modal).toBeDefined();

        const option = modal.getSuggestions("attach")[0]!;
        expect(option.path).toBe("attachments");
        modal.onChooseSuggestion(option);
        await Promise.resolve();

        expect(settingsOf(tab).images.folders).toEqual(["assets/img", "attachments"]);
        expect(saveCount(tab)).toBe(before + 1);
    });

    /**
     * 归一必须在**加入的时候**做一次。
     *
     * 用户手打 `/attachments/`、`assets//img`、`.` 是常事，而没归一化的前缀会让
     * 范围判断悄悄失准 —— 表现是「填了却一个文件都不动」，且没有任何提示。
     */
    it("在框里打完按回车 → 归一后加进列表，并落盘", async () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const before = saveCount(tab);
        // 一次拿到这个框就一直用它：加入之后会重绘，但**驱动的是同一个元素**，
        // 而设置对象是共用的（重绘只换 DOM）。
        const input = foldersInput();

        input.value = "/attachments/";
        pressEnter(input);
        expect(settingsOf(tab).images.folders).toEqual(["", "attachments"]);
        // 加进去之后框要清空：不清的话下一次回车会把同一个路径再加一遍
        expect(input.value).toBe("");

        input.value = "assets//img";
        pressEnter(input);
        expect(settingsOf(tab).images.folders).toEqual(["", "attachments", "assets/img"]);

        // 「改了值但没落盘」是设置页最容易犯的错
        expect(saveCount(tab)).toBeGreaterThan(before);
    });

    it("空输入 / 纯空白按回车什么都不加", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const input = foldersInput();
        input.value = "";
        pressEnter(input);
        input.value = "   ";
        pressEnter(input);

        expect(settingsOf(tab).images.folders).toEqual([""]);
    });

    it("加一个已经加过的文件夹是无害的空操作（不报错、不重复）", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const input = foldersInput();
        input.value = "/attachments/";
        pressEnter(input);
        input.value = "attachments";
        pressEnter(input);

        expect(settingsOf(tab).images.folders).toEqual(["", "attachments"]);
    });

    /**
     * 输入时下方给候选（2026-10-02 用户要求），点一个就加进去。
     *
     * 候选来自 vault 里现成的文件夹 —— 手打路径的错法（`/attachments/`、
     * 根本不存在的目录）以前全都没有提示，从列表里挑一次性消失。
     */
    it("打字时列出候选，点候选即加入", () => {
        const fake = createFakeApp({ "attachments/a.png": "x", "assets/img/b.png": "y" });
        const tab = createTab(fake, { images: { folders: [] } });
        renderImagesPage(tab);

        typeFolders("attach");
        const labels = suggestions(tab);
        expect(labels).toContain("attachments");
        expect(labels).not.toContain("assets/img");

        // 点候选（真实 DOM 里是 mousedown —— `click` 之前输入框会先 blur）
        const item = findAllIn(tab, (child) => child.cls === "obsync-path-suggest-item")[0]!;
        (item.trigger as (name: string, ...args: unknown[]) => void).call(item, "mousedown", { preventDefault: () => {} });

        expect(settingsOf(tab).images.folders).toEqual(["attachments"]);
    });

    it("候选里标出「已在同步范围」，且打字为空时不显示", () => {
        const fake = createFakeApp({ "attachments/a.png": "x" });
        const tab = createTab(fake, { images: { folders: ["attachments"] } });
        renderImagesPage(tab);

        typeFolders("attach");
        const item = findAllIn(tab, (child) => child.cls === "obsync-path-suggest-item")[0]!;
        expect(
            (item.children ?? []).some(
                (child) => child.text === zhCN.settings.images.folderPickerIncluded
            )
        ).toBe(true);
    });

    it("总开关的初值来自设置，拨动会写进设置", async () => {
        const tab = createTab(createFakeApp(), { images: { enabled: false } });
        renderImagesPage(tab);

        const toggle = row(zhCN.settings.images.enabled)?.toggles[0];
        expect(toggle?.value).toBe(false);

        await toggle?.toggle(true);
        expect(settingsOf(tab).images.enabled).toBe(true);
    });

    it("冲突策略下拉的初值来自设置，改它会写进设置", async () => {
        const tab = createTab(createFakeApp(), { images: { conflictPolicy: "remote" } });
        renderImagesPage(tab);

        const dropdown = row(zhCN.settings.images.conflictPolicy)?.dropdowns[0];
        expect(dropdown?.value).toBe("remote");

        await dropdown?.select("local");
        expect(settingsOf(tab).images.conflictPolicy).toBe("local");
    });

    /**
     * 这一页有**两个**开关，且只能是这两个。
     *
     * 断言「有哪些开关」而不只是「某个开关在不在」：删除本地图片时的云端处置
     * 已经从开关改成下拉（`deleteRemotePolicy`），旧的询问开关必须**消失** ——
     * 留着它会是「能拨但没有任何作用」的假控件，而这个项目里正是靠「设置项
     * 无人读取」那类检查在防这个，那一项只扫 `core/settings.ts` 的字段，
     * 管不到界面上多出来的开关。
     *
     * 两个开关是 2026-10-02（v8）之后的形状，各有各的职责、**不重叠**：
     * 「自动同步图片」= 允不允许在背后动云端（启动一轮 / 改名换键 / 删除处置）；
     * 「按周期同步」= 要不要按周期跑。第二个是拆出来的，因为周期那个数字不再
     * 兼职表达「关闭」（下限也提到了 5）。
     */
    it("这一页只有三个开关：自动同步图片、变动后自动同步、按周期同步（删除时的云端处置是下拉）", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const toggleRows = createdSettings.filter((setting) => setting.toggles.length > 0);
        expect(toggleRows.map((setting) => setting.name)).toEqual([
            zhCN.settings.images.enabled,
            zhCN.settings.images.changeSync,
            zhCN.settings.images.autoSync,
        ]);
    });

    it("「删除本地图片时」下拉的初值来自设置，改它会写进设置", async () => {
        const tab = createTab(createFakeApp(), { images: { deleteRemotePolicy: "always" } });
        renderImagesPage(tab);

        const dropdown = row(zhCN.settings.images.deleteRemotePolicy)?.dropdowns[0];
        expect(dropdown?.value).toBe("always");

        await dropdown?.select("never");
        expect(settingsOf(tab).images.deleteRemotePolicy).toBe("never");
    });

    /**
     * 三个选项都必须在，且顺序固定（默认值排最前）。
     *
     * 少一个选项的下拉等于把用户锁在当前行为里；而顺序漂移会让「默认是哪一档」
     * 在视觉上变得不确定。
     */
    it("下拉的三个选项与默认值", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        const dropdown = row(zhCN.settings.images.deleteRemotePolicy)?.dropdowns[0];
        expect(dropdown?.options).toEqual([
            { value: "ask", label: zhCN.settings.images.deleteRemoteAsk },
            { value: "always", label: zhCN.settings.images.deleteRemoteAlways },
            { value: "never", label: zhCN.settings.images.deleteRemoteNever },
        ]);
        expect(dropdown?.value).toBe("ask");
    });

    /**
     * Secret Access Key 这一行。
     *
     * 它**不在** `data.json` 里（走 `SecretStore`），所以「初值从哪儿来」与
     * 「保存按钮真的写进去了没有」这两件事必须验 —— 而后者尤其重要：
     * 用户粘完密钥最可能的下一步是直接点「测试连接」，若还没落盘，
     * 测的就是**旧值**，报出来的错会让人去怀疑一个根本没被使用的密钥。
     */
    describe("R2 密钥行", () => {
        /**
         * 状态徽标里的文字。
         *
         * 它挂在**那一行的 `nameEl`** 上（`renderR2Secret` 里 `setting.nameEl.createSpan`），
         * 所以从 `createdSettings` 里按名字找那一行即可 —— 不需要 tab 实例。
         */
        function statusText(): string | undefined {
            const setting = row(zhCN.settings.images.secretKey);
            const nameEl = setting?.nameEl as unknown as { children?: ShimEl[] };
            return nameEl?.children?.[0]?.text;
        }

        it("没配密钥时状态是「未配置」", () => {
            const tab = createTab(createFakeApp());
            renderImagesPage(tab);

            expect(statusText()).toBe(zhCN.settings.images.secretNotConfigured);
        });

        it("已经存过密钥时状态是「已配置」，且输入框里是那个值", () => {
            const fake = createFakeApp();
            fake.app.saveLocalStorage("obsync-token-r2", "secret-value");

            const tab = createTab(fake);
            renderImagesPage(tab);

            expect(statusText()).toBe(zhCN.settings.images.secretConfigured);
            expect(row(zhCN.settings.images.secretKey)?.texts[0]?.value).toBe("secret-value");
        });

        it("保存按钮把密钥写进 SecretStore，并把状态翻成「已配置」", () => {
            const fake = createFakeApp();
            const tab = createTab(fake);
            renderImagesPage(tab);

            const setting = row(zhCN.settings.images.secretKey)!;
            setting.texts[0]!.type("pasted-secret");
            setting.buttons[0]!.click();

            // 落进 SecretStore（而不是 data.json）
            expect(fake.app.loadLocalStorage("obsync-token-r2")).toBe("pasted-secret");
            expect(statusText()).toBe(zhCN.settings.images.secretConfigured);
        });

        it("密钥**不进设置对象**（data.json 会随笔记仓库同步到别的设备）", () => {
            const fake = createFakeApp();
            const tab = createTab(fake);
            renderImagesPage(tab);

            const setting = row(zhCN.settings.images.secretKey)!;
            setting.texts[0]!.type("pasted-secret");
            setting.buttons[0]!.click();

            expect(JSON.stringify(settingsOf(tab))).not.toContain("pasted-secret");
        });
    });

    it("没有装配出同步服务时给出说明，而不是一堆点了没反应的按钮", () => {
        const tab = createTab(createFakeApp());
        renderImagesPage(tab);

        // 操作区的小标题还在（用户知道这里有东西），下面是一行说明
        expect(row(zhCN.settings.images.actionsHeading)).toBeDefined();
        expect(
            findAllIn(tab, (child) => child.text === zhCN.images.notice.notConfigured)
        ).toHaveLength(1);
    });
});
