import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDesktop, __setRequestUrlHandler } from "./stubs/obsidian";
import ObsyncPlugin from "../src/main";
import { createFakeApp, type FakeApp } from "./helpers/fakeApp";

/**
 * 装配路径的冒烟测试 —— `main.ts` 的 `onload()` 整个跑一遍。
 *
 * ## 为什么需要它
 *
 * 这是**目前唯一没有别的测试覆盖的路径**，而它恰恰踩过坑：曾经把状态栏元素
 * 挂到 `app.workspace.addStatusBarItem()` 上，而真实 API 在 `Plugin` 类上 ——
 * 单测全绿，**真机启动才 TypeError**。那类错误（方法挂在哪个对象上、
 * 调用了不存在的方法、初始化顺序）靠模块级单测是发现不了的。
 *
 * 做法：把 Obsidian 基类的方法补全（`tests/stubs/obsidian.ts` 的 `Plugin`），
 * 让真实的 `onload()` 跑在假的 app 上，断言它注册了什么。
 * 只要 `onload` 里调用了 stub 没有的 API，这里就会以 TypeError 失败。
 *
 * 它不能替代真机验证（渲染、真实网络、Obsidian 内部 API 的实际行为仍要手测），
 * 但能把「装配写错」这一类问题从"真机才发现"提前到"跑测试就发现"。
 */

const MANIFEST = {
    id: "ob-sync",
    name: "SyncHub",
    version: "0.1.0",
    minAppVersion: "1.5.0",
    description: "test",
    author: "test",
};

function createPlugin(fake: FakeApp): ObsyncPlugin & {
    registered: {
        commands: Array<{ id: string; name: string }>;
        views: string[];
        settingTabs: number;
        ribbonIcons: number;
        ribbons: Array<{ icon: string; title: string; onClick: () => void }>;
        statusBarItems: number;
        postProcessors: number;
    };
} {
    // 真实签名是 (app, manifest)，stub 与之对齐。
    return new ObsyncPlugin(fake.app, MANIFEST) as never;
}

/**
 * 替身 Plugin 上的落盘记录。
 *
 * 类型层面用的是**官方 obsidian 类型**（没有 `savedData` / `__data` —— 它们是
 * 我们替身加的），所以这里显式取值。运行时走的才是替身（vitest 别名）。
 */
function savedDataOf(plugin: ObsyncPlugin): unknown[] {
    return (plugin as unknown as { savedData: unknown[] }).savedData;
}

function setLoadedData(plugin: ObsyncPlugin, data: unknown): void {
    (plugin as unknown as { __data: unknown }).__data = data;
}

let fake: FakeApp;

beforeEach(() => {
    fake = createFakeApp();
    __setDesktop(true);
});

afterEach(() => {
    __setDesktop(true);
});

describe("桌面端启动", () => {
    it("onload 不抛错", async () => {
        const plugin = createPlugin(fake);

        await expect(plugin.onload()).resolves.toBeUndefined();
    });

    it("两个功能模块都装配上了", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.installer).toBeDefined();
        expect(plugin.sync).toBeDefined();
        // 图片同步是**第三个**模块，两个平台都装。
        expect(plugin.images).toBeDefined();
        expect(plugin.secretStore).toBeDefined();
        expect(plugin.notifier).toBeDefined();
    });

    it("注册了图片同步的四条命令", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        expect(ids).toContain("sync-images");
        expect(ids).toContain("preview-image-sync");
        expect(ids).toContain("edit-image");
        expect(ids).toContain("copy-image-link");
    });

    /**
     * 阅读视图的图片工具条挂在 Markdown 后处理器上。
     *
     * 这条断言看着琐碎，但它守的是一类**真机才炸**的错误：`onload` 里调了
     * stub 没有的方法会直接 TypeError，而症状是「插件加载失败」——
     * 与真正的原因（API 用错）隔得很远。
     */
    it("注册了 Markdown 后处理器（阅读视图的图片工具条）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.postProcessors).toBe(1);
    });

    /**
     * 「删掉一张本地图片 → 问一句要不要连云端一起删」靠 `vault.on("delete")`。
     *
     * 这是删除的**唯一**入口：同步本身只复制、不删除。挂不上这个事件，
     * 功能就整个不存在，而界面上看不出任何异常 —— 只是「删了图之后从来没人问」。
     */
    it("挂在 vault 的 delete 事件上（本地删除的唯一入口）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(fake.vaultEvents.map((entry) => entry.event)).toContain("delete");
    });

    /**
     * 改名必须跟着搬云端那一份，否则下一轮同步会「重传新路径 + 把旧路径下载
     * 回来」—— 库里出现两批同样的图片（2026-10-01 用户报的问题）。
     *
     * **文件夹改名也走这一个事件**：Obsidian 的适配器会为文件夹里的每个文件
     * 各发一次 `rename`，所以这里挂一次就够了。
     */
    it("挂在 vault 的 rename 事件上（改名后云端那一份要跟着换键）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(fake.vaultEvents.map((entry) => entry.event)).toContain("rename");
    });

    it("加载时清掉「待重启」标记（否则重启完还会看到「重启后生效」）", async () => {
        const plugin = createPlugin(fake);
        setLoadedData(plugin, { installer: { pendingRestartVersion: "0.2.0" } });

        await plugin.onload();

        // 存回过一次，且标记被清空 —— 这次加载跑的就是那个新版本了
        expect(savedDataOf(plugin)).toHaveLength(1);
        expect(
            (savedDataOf(plugin)[0] as { installer: { pendingRestartVersion: string } })
                .installer.pendingRestartVersion
        ).toBe("");
        expect(plugin.settings.installer.pendingRestartVersion).toBe("");
    });

    it("没有待重启标记时**不做多余的保存**（否则每次启动都写一次 data.json）", async () => {
        const plugin = createPlugin(fake);

        await plugin.onload();

        expect(savedDataOf(plugin)).toEqual([]);
    });

    it("注册了设置页、侧栏图标与状态栏元素", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.settingTabs).toBe(1);
        // 三个图标：同步面板、安装器、图片管理。原来只有一个，而它打开的是
        // 安装器 —— 于是「同步面板在哪」在界面上无解。
        expect(plugin.registered.ribbonIcons).toBe(3);
        // 状态栏元素由主类创建后传给 sync 模块 —— 这条断言锁的就是当年踩的那个坑
        // （挂到 workspace 上而不是 Plugin 上）。
        expect(plugin.registered.statusBarItems).toBe(1);
    });

    it("侧栏的同步图标真的会请求打开仓库同步视图", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ribbons = plugin.registered.ribbons;
        expect(ribbons.map((ribbon) => ribbon.icon)).toEqual(["git-fork", "download", "images"]);

        // 点第一个（同步）→ 让 Obsidian 在右侧边栏打开那个视图
        ribbons[0]!.onClick();
        await Promise.resolve();

        expect(fake.workspaceLeaves.viewStates.map((state) => state.type)).toContain(
            "obsync-sync-view"
        );

        // 再点一次不该开第二个（已经开着就把它显示出来）
        ribbons[0]!.onClick();
        await Promise.resolve();
        expect(fake.workspaceLeaves.viewStates).toHaveLength(1);
        expect(fake.workspaceLeaves.revealed).toHaveLength(2);
    });

    it("侧栏图标的悬停文案各自说清打开的是什么", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ribbons = plugin.registered.ribbons;

        expect(ribbons[0]!.title).toBe(plugin.t.plugin.ribbonSync);
        expect(ribbons[1]!.title).toBe(plugin.t.plugin.ribbonInstaller);
        expect(ribbons[2]!.title).toBe(plugin.t.plugin.ribbonImages);
        // 三个文案两两不同 —— 两个图标共用一句话时，用户分不出该点哪个。
        expect(new Set(ribbons.map((ribbon) => ribbon.title)).size).toBe(3);
    });

    it("注册了仓库同步视图", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.views).toContain("obsync-sync-view");
    });

    /**
     * 图片管理视图**桌面端也注册**（不是「只有桌面端」）。
     *
     * 它与同步视图的分屏条件正好相反：图片模块移动端也装，工厂函数解引用
     * `this.images` 不会踩空。写成 `if (this.sync)` 那样的守卫会让手机上
     * 的「打开图片管理」命令点下去什么也不发生。
     */
    it("注册了图片管理视图（主工作区标签页）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.views).toContain("obsync-image-view");
    });

    /**
     * 图片图标真的去开**主工作区**的标签页，而不是又弹一个模态窗。
     *
     * 2026-09-23 从弹窗改成标签页：整理图片时要一边看着笔记一边决定哪张能删。
     * 这条断言守的是「走的是 getLeaf 这条路」—— 走成右侧边栏（getRightLeaf）
     * 或走回弹窗，都表现为「打开了，但不在该在的地方」。
     */
    it("侧栏的图片图标打开主工作区的图片管理标签页", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ribbons = plugin.registered.ribbons;
        const images = ribbons[2]!;
        expect(images.icon).toBe("images");

        images.onClick();
        await Promise.resolve();

        expect(fake.workspaceLeaves.viewStates.map((state) => state.type)).toContain(
            "obsync-image-view"
        );
        expect(fake.workspaceLeaves.revealed).toHaveLength(1);

        // 再点一次不该开第二个（已经开着就把它显示出来）——
        // 两个标签页扫的是同一批图，而每扫一遍要好几秒。
        images.onClick();
        await Promise.resolve();
        expect(fake.workspaceLeaves.viewStates).toHaveLength(1);
        expect(fake.workspaceLeaves.revealed).toHaveLength(2);
    });

    it("所有命令名都带插件名前缀（否则命令面板里搜不到）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const commands = plugin.registered.commands;
        expect(commands.length).toBeGreaterThan(0);

        for (const command of commands) {
            expect(command.name, `${command.id} 缺少 SyncHub 前缀`).toMatch(/^SyncHub/);
        }
    });

    it("命令 id 不重复", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("桌面端注册了同步相关命令", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        for (const expected of ["sync-now", "pull", "push", "init-repo", "open-source-control-view"]) {
            expect(ids, `缺少命令 ${expected}`).toContain(expected);
        }
    });

    /**
     * 「添加主题仓库」那条命令（2026-10-05）。
     *
     * 在此之前主题**没有新装入口**：把主题地址填进「添加插件仓库」只会得到
     * 「缺少必需文件：main.js」。命令面板是插件在设置页之外唯一能挂的入口。
     */
    it("注册了「添加主题仓库」命令（主题的新装入口）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        expect(ids).toContain("add-theme-repo");
    });

    it("注册了文件右键菜单（在远端打开）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const events = fake.workspaceEvents.map((entry) => entry.event);
        expect(events).toContain("file-menu");
    });

    it("onunload 不抛错", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(() => plugin.onunload()).not.toThrow();
    });

    /**
     * 「同步条目贴靠状态栏最左侧」开关（设置页「通用」，默认开）。
     *
     * 位置规则只能写在 CSS 里（`order` 作用于 flex 布局），所以开关的做法是
     * **给 body 加类**（见 `main.ts` 的 `applyStatusBarLeftAlign`）。三件事都要
     * 钉住：开着时加上、关掉时摘掉、**卸载时也摘掉**。
     *
     * 最后那条最容易漏：不摘的话插件禁用后那条贴最左的规则还挂在 body 上
     * （CSS 由 Obsidian 继续加载到下次重载）。条目本身随插件消失，所以实际无害，
     * 但谁也说不好下一条挂在同一类下的规则会不会有副作用。
     *
     * 注意这与 2026-10-09 删掉的「状态栏占满整屏宽」是两件事：那个碰的是
     * **状态栏的宽度**（贴屏幕最左），已整条删除；这个只管**条目在状态栏里
     * 的顺序**。
     */
    it("按设置给 body 加/摘「条目贴靠最左侧」的类，卸载时也会摘掉", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        // 默认开着（与既有行为一致）
        expect(document.body.hasClass("obsync-status-bar-left")).toBe(true);

        plugin.settings.statusBarLeftAlign = false;
        plugin.applyDerivedSettings();
        expect(document.body.hasClass("obsync-status-bar-left")).toBe(false);

        plugin.settings.statusBarLeftAlign = true;
        plugin.applyDerivedSettings();
        expect(document.body.hasClass("obsync-status-bar-left")).toBe(true);

        plugin.onunload();
        expect(document.body.hasClass("obsync-status-bar-left")).toBe(false);
    });

    /**
     * 状态栏拉全宽（2026-10-09 按用户要求删除，含当时的开关）。
     *
     * 拉全宽能让同步条目贴到屏幕最左，但会把状态栏的整体观感从「右下角一簇」
     * 变成「底部一条」—— 用户选择不要这个代价，规则连同类一起删了。
     * 这条用例守着「别再悄悄加回来」：插件**不碰状态栏的宽度**。
     */
    it("不给 body 加「状态栏全宽」的类（规则已删）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(document.body.hasClass("obsync-status-bar-full-width")).toBe(false);

        plugin.onunload();
        expect(document.body.hasClass("obsync-status-bar-full-width")).toBe(false);
    });

    it("启动完成回调不抛同步异常（会起定时器与后台检查）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        // 只断言「不抛同步异常」：回调里是异步的定时器与网络检查，
        // 这里跑的是装配，不是那些行为本身。
        expect(() => fake.runLayoutReady()).not.toThrow();
    });

    /**
     * 功能区底部的 Gitee 头像（设置页「通用」）。
     *
     * 这两条验的是**接线**，不是渲染细节（渲染在 `ribbonAvatar.test.ts` 里验）：
     * 插件装配有没有把「设置 → 令牌 → host → 挂到功能区」这条链子接上。
     * 这类断线在界面上只表现为「拨了开关，左边什么也没出现」—— 与当年那个
     * 从没被读过的 `sync.enabled` 是同一类问题（见 `scripts/checks.mjs` 第 6 项）。
     */
    describe("功能区头像", () => {
        /** 把 `document.querySelector` 换成一个能记数的替身，并在用例结束时还原。 */
        function spyQuerySelector(): { calls: number } {
            const state = { calls: 0 };
            (document as unknown as { querySelector: () => null }).querySelector = () => {
                state.calls += 1;
                return null;
            };
            return state;
        }

        function restoreQuerySelector(): void {
            delete (document as unknown as { querySelector?: unknown }).querySelector;
        }

        it("**默认关着**时不碰功能区 DOM（一次查询都不发）", async () => {
            const plugin = createPlugin(fake);
            const spy = spyQuerySelector();

            try {
                await plugin.onload();
                fake.runLayoutReady();
                await Promise.resolve();

                expect(spy.calls).toBe(0);
            } finally {
                restoreQuerySelector();
            }
        });

        it("开关打开且有 Gitee 令牌时，真的会去功能区找位置（装配没有断在这一段）", async () => {
            const plugin = createPlugin(fake);
            // 令牌走 localStorage：`fake.app` 上没有 secretStorage，
            // `SecretStore` 会回退到那条路（与真机上老版本 Obsidian 同一条）。
            fake.app.saveLocalStorage("obsync-token-gitee", "tok");
            __setRequestUrlHandler(async () => ({
                status: 200,
                text: JSON.stringify({
                    login: "sofqi",
                    avatar_url: "https://foruda.gitee.com/avatar/1_sofqi_2.png",
                }),
            }));
            setLoadedData(plugin, { ribbonAvatar: true });
            const spy = spyQuerySelector();

            try {
                await plugin.onload();
                fake.runLayoutReady();
                // 网络那一段是异步的：多让两个微任务跑完。
                await Promise.resolve();
                await Promise.resolve();

                expect(spy.calls).toBeGreaterThan(0);
            } finally {
                restoreQuerySelector();
                __setRequestUrlHandler(undefined);
            }
        });

        /**
         * 点头像 → 打开设置窗口并停靠「通用」页（2026-10-09 用户要求）。
         *
         * 这条用例盯的是**装配层那根线**：头像节点自己的点击在
         * `ribbonAvatar.test.ts` 里验，`openGeneral()` 的逻辑在
         * `settingsTabRender.test.ts` 里验，这里验「main.ts 把三者接上了」——
         * 具体说就是 `onClick` 真的传进了 `RibbonAvatar`，并且一路走到
         * `app.setting.openTabById(插件 id)`。
         *
         * 这类断线的症状是「点了头像什么也没发生」，而它是**纯粹的接线错**：
         * 三个部件各自都对，只有装配那一行漏了。
         */
        it("点头像走完整条链：打开设置窗并选中 SyncHub 页签", async () => {
            const plugin = createPlugin(fake);
            const opened: string[] = [];
            let openCalls = 0;
            // `app.setting` 不在 obsidian.d.ts 里（`main.ts` 里有说明），
            // 这里按同一形状垫一个可断言的替身。
            (fake.app as unknown as {
                setting: { open(): void; openTabById(id: string): void };
            }).setting = {
                open: () => {
                    openCalls += 1;
                },
                openTabById: (id) => opened.push(id),
            };

            await plugin.onload();

            // 从装配好的 RibbonAvatar 里取出注入的 onClick 再调它 —— 这才是
            // 「点头像」真正走的那条路。直接调 openGeneralSettings 会绕过
            // 「传没传 onClick」这个最可能的接线错，所以必须走这里。
            const onClick = (
                plugin.ribbonAvatar as unknown as { deps: { onClick?: () => void } }
            ).deps.onClick;
            expect(typeof onClick).toBe("function");
            onClick!();

            expect(openCalls).toBe(1);
            expect(opened).toEqual(["ob-sync"]);
        });
    });

    it("功能区头像模块挂在布局变化上（功能区被重建时要自己挂回去）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.ribbonAvatar).toBeDefined();
        expect(fake.workspaceEvents.map((entry) => entry.event)).toContain("layout-change");
    });
});

describe("移动端启动", () => {
    beforeEach(() => {
        __setDesktop(false);
    });

    it("onload 不抛错，且不创建同步模块", async () => {
        const plugin = createPlugin(fake);

        await expect(plugin.onload()).resolves.toBeUndefined();
        // 决策是 v1 不支持移动端 git（见 PLAN.md），所以这里是 undefined 而不是抛错。
        expect(plugin.sync).toBeUndefined();
        // 但安装器是纯 HTTP 的，移动端照常可用。
        expect(plugin.installer).toBeDefined();
    });

    it("不注册仓库同步视图（工厂函数会解引用 sync 模块）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.views).not.toContain("obsync-sync-view");
        // 但图片管理视图**要**注册：图片模块移动端也装，而这是它在手机上
        // 唯一的图形入口（命令面板在手机上很难用）。
        expect(plugin.registered.views).toContain("obsync-image-view");
    });

    it("不注册同步命令，但保留安装器命令", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        expect(ids).not.toContain("sync-now");
        expect(ids).toContain("add-plugin-repo");
    });

    it("不创建状态栏元素", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.registered.statusBarItems).toBe(0);
    });

    /**
     * 图片同步模块**移动端也装** —— 与笔记同步（依赖系统 git，只装桌面端）相反。
     *
     * 它走的是 Obsidian 的 `requestUrl` + vault 文件读写，两者在移动端都有，
     * 所以「在手机上看笔记时图片能显示、裁剪压缩也能用」是成立的。
     * 这条断言与 `scripts/checks.mjs` 的「移动端安全」是两回事：那个查静态
     * 导入图有没有碰到 Node 依赖，这个查装配有没有真的把它装上。
     */
    it("装配图片同步模块（移动端也能裁剪 / 压缩图片）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(plugin.images).toBeDefined();
        expect(plugin.registered.postProcessors).toBe(1);
    });

    it("图片同步的四条命令在移动端也注册", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        const ids = plugin.registered.commands.map((command) => command.id);
        for (const id of ["sync-images", "preview-image-sync", "edit-image", "copy-image-link"]) {
            expect(ids, id).toContain(id);
        }
    });

    it("onunload 不抛错（sync 为 undefined）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        expect(() => plugin.onunload()).not.toThrow();
    });

    /**
     * 「初始化 git 仓库」在移动端是**空转**。
     *
     * 设置页那一行在移动端根本不渲染（`renderSync` 见到 `isSyncAvailable` 为假就
     * 提前返回），但这个方法是公开的（命令面板 / 面板 / 设置页三个入口共用），
     * 所以它自己也得扛得住 `sync` 不在场 —— 返回 false 而不是抛错。
     */
    it("移动端调用 initRepo 是空转（返回 false，不抛错）", async () => {
        const plugin = createPlugin(fake);
        await plugin.onload();

        await expect(plugin.initRepo()).resolves.toBe(false);
    });
});
