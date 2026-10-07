import { beforeEach, describe, expect, it } from "vitest";
import {
    createdSettings,
    resetCreatedSettings,
    type ButtonComponent,
    type Setting,
} from "../stubs/obsidian";
import { normalizeSettings } from "../../src/core/settings";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { Notifier } from "../../src/core/notice";
import { SecretStore } from "../../src/core/secretStore";
import type { InstallerService } from "../../src/features/installer/installerService";
import type { UpdateChecker } from "../../src/features/installer/updateChecker";
import { ObsyncSettingsTab } from "../../src/settingsTab";
import { createFakeApp, type FakeApp } from "../helpers/fakeApp";

/**
 * 「插件与主题」页顶部那一行**主操作按钮**。
 *
 * 2026-10-05 用户一次提了四件事，这个文件把它们全钉住：
 *
 * 1. 「添加主题」→「添加主题仓库」；
 * 2. 「绑定已安装的插件与主题」→「绑定已有插件或主题」；
 * 3. 「检查全部更新」→「检查更新」；
 * 4. 绑定那个按钮文字前加 lucide `link` 图标、检查那个加 `refresh-cw`；
 * 5. **「把这排按钮的卡片去掉，只留按钮展示」** —— 标题与说明（连同它们的 locale 键）
 *    一并下掉，只剩按钮。
 *
 * ## 为什么图标要在这里钉
 *
 * Obsidian 的 `setButtonText` / `setIcon` **不能连用**（前者清空按钮、后者删掉第一个
 * 子节点，见 `settingsTab.addButtonIcon` 的说明），所以「图标在文字前面」这件事是
 * 手拼出来的、很容易在下次改动里悄悄坏掉 —— 而界面上的表现只是「图标不见了」，
 * 没有任何报错。
 */

/** 假 UI 里记下的节点形状（见 `tests/setup.ts`）。 */
type ShimEl = {
    cls?: string;
    text?: string;
    tagName?: string;
    attrs?: Record<string, string>;
    children?: ShimEl[];
};

interface Harness {
    tab: ObsyncSettingsTab;
    /** 三个「打开某个弹窗」的入口各被点了几次，按入口名记。 */
    opened: string[];
}

function createTab(fake: FakeApp): Harness {
    const notifier = new Notifier({ getShowNotices: () => false, getT: () => zhCN });
    const opened: string[] = [];

    const plugin = {
        app: fake.app,
        manifest: { id: "ob-sync", version: "0.9.0" },
        t: zhCN,
        settings: normalizeSettings({}),
        notifier,
        secretStore: new SecretStore(fake.app),
        isSyncAvailable: true,
        saved: 0,
        applied: 0,
        async saveSettings(): Promise<void> {
            plugin.saved += 1;
        },
        applyDerivedSettings(): void {
            plugin.applied += 1;
        },
        installer: {
            service: {} as InstallerService,
            // 空跟踪列表时 `checkAllUpdates` 根本走不到它，但方法必须在（见那条用例）。
            checker: {
                async checkAll() {
                    return { outdated: 0, failed: 0, results: [] };
                },
            } as unknown as UpdateChecker,
            openAddRepoModal: () => opened.push("plugin"),
            openAddThemeModal: () => opened.push("theme"),
            openBindExistingModal: () => opened.push("bind"),
        },
        openImageManager(): void {},
        refreshRibbonAvatar(): void {},
        async initRepo(): Promise<boolean> {
            return true;
        },
    };

    return { tab: new ObsyncSettingsTab(plugin as never), opened };
}

function renderTab(tab: ObsyncSettingsTab): void {
    (tab as unknown as { renderTrackedTab(): void }).renderTrackedTab();
}

/** 最近一次渲染出来的那一行主操作按钮（带 `.obsync-tracked-actions` 标记）。 */
function actionsRow(): Setting {
    const row = [...createdSettings]
        .reverse()
        .find((setting) => setting.classes.includes("obsync-tracked-actions"));
    if (!row) throw new Error("渲染出来的内容里找不到主操作按钮行");
    return row;
}

function button(text: string): ButtonComponent {
    const found = actionsRow().buttons.find((candidate) => candidate.text === text);
    if (!found) throw new Error(`按钮行里找不到「${text}」`);
    return found;
}

/** 按钮里的子节点（`setButtonText` 写进去的文字 + `addButtonIcon` 插的图标容器）。 */
function buttonChildren(target: ButtonComponent): ShimEl[] {
    return ((target.buttonEl as unknown as ShimEl).children ?? []) as ShimEl[];
}

/** 按钮里那几个图标容器。 */
function iconsOf(target: ButtonComponent): ShimEl[] {
    return buttonChildren(target).filter((child) => child.cls === "obsync-button-icon");
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    resetCreatedSettings();
});

describe("插件与主题页 · 主操作按钮行", () => {
    it("四个按钮的文字是改过的那四个", () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        expect(actionsRow().buttons.map((candidate) => candidate.text)).toEqual([
            zhCN.installer.modalTitle,
            zhCN.installer.addTheme,
            zhCN.installer.bindTitle,
            zhCN.installer.checkAll,
        ]);

        // 用户点名的三处改名（连文案一起钉住 —— 改错了不能只有肉眼看得出来）
        expect(zhCN.installer.addTheme).toBe("添加主题仓库");
        expect(zhCN.installer.bindTitle).toBe("绑定已有插件或主题");
        expect(zhCN.installer.checkAll).toBe("检查更新");
    });

    /**
     * 「把这排按钮的卡片去掉，只留按钮展示」。
     *
     * CSS 那一半（背景/边框/内边距归零）在 `styles.css` 的 `.obsync-tracked-actions`
     * 里；这里能钉的是**内容**那一半：这一行不该再有标题与说明
     * （原来那张卡片左边写着「已跟踪的插件与主题 / 通过 SyncHub 绑定…」）。
     */
    it("这一行只有按钮：没有标题、没有说明", () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        const row = actionsRow();
        expect(row.name).toBe("");
        expect(row.desc).toBe("");
        expect(row.buttons).toHaveLength(4);
    });

    it("绑定那个按钮：`link` 图标在**文字前面**", () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        const children = buttonChildren(button(zhCN.installer.bindTitle));

        expect(children[0]?.cls).toBe("obsync-button-icon");
        expect(children[0]?.attrs?.["data-icon"]).toBe("link");
        // 顺序就是这条用例的全部意义：图标必须在文字前面
        expect(children[1]?.text).toBe(zhCN.installer.bindTitle);
    });

    it("检查更新那个按钮：`refresh-cw` 图标在**文字前面**", () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        const children = buttonChildren(button(zhCN.installer.checkAll));

        expect(children[0]?.cls).toBe("obsync-button-icon");
        expect(children[0]?.attrs?.["data-icon"]).toBe("refresh-cw");
        expect(children[1]?.text).toBe(zhCN.installer.checkAll);
    });

    it("另外两个按钮没有图标（只加了用户点名的那两个）", () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        expect(iconsOf(button(zhCN.installer.modalTitle))).toHaveLength(0);
        expect(iconsOf(button(zhCN.installer.addTheme))).toHaveLength(0);
    });

    /**
     * 「检查更新」在跑的时候文字会换成「正在检查更新…」—— 而 `setButtonText` 会把
     * 按钮**清空**（图标一起没），所以换文字之后必须把图标重新插回去。
     *
     * 这条用例盯的就是那一步：**换文字前后都恰好有一个图标**（0 个 = 忘了插回来，
     * 2 个 = 没有把上一次的清掉）。
     */
    it("「正在检查更新…」期间图标仍在，而且始终只有一个", async () => {
        const { tab } = createTab(createFakeApp());
        renderTab(tab);

        const check = button(zhCN.installer.checkAll);

        // 同步地看：空跟踪列表时 `checkAllUpdates` 立刻返回，但按钮状态已经先换好了
        void check.click();
        expect(check.text).toBe(zhCN.installer.checking);
        expect(check.disabled).toBe(true);
        expect(iconsOf(check)).toHaveLength(1);
        expect(iconsOf(check)[0]?.attrs?.["data-icon"]).toBe("refresh-cw");

        await flush();

        expect(check.text).toBe(zhCN.installer.checkAll);
        expect(check.disabled).toBe(false);
        expect(iconsOf(check)).toHaveLength(1);
    });

    it("三个弹窗入口各自连着自己那颗按钮", () => {
        const { tab, opened } = createTab(createFakeApp());
        renderTab(tab);

        button(zhCN.installer.modalTitle).click();
        button(zhCN.installer.addTheme).click();
        button(zhCN.installer.bindTitle).click();

        expect(opened).toEqual(["plugin", "theme", "bind"]);
    });
});
