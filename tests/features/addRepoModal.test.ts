import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { createdSettings, resetCreatedSettings, type ButtonComponent, type TextComponent } from "../stubs/obsidian";
import { AddRepoModal } from "../../src/features/installer/ui/AddRepoModal";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { Notifier } from "../../src/core/notice";
import type { CommunityPluginIndex } from "../../src/features/installer/communityPlugins";
import { InstallerError } from "../../src/features/installer/errors";
import type { InstallerService } from "../../src/features/installer/installerService";
import type {
    InstallResult,
    ThemeInstallResult,
    TrackedKind,
} from "../../src/features/installer/types";

/**
 * 「添加插件仓库」弹窗的交互契约。
 *
 * 这个文件专门守住一类**逻辑测试看不见的缺陷**：`render()` 会把 `contentEl` 清空重建，
 * 因此「渲染一次算出来的状态」如果在输入变化后没有就地更新，界面就会永久停在初始态。
 * 曾经的实际表现是：「识别」按钮在填了地址之后依然是灰的 ——
 * 因为它的 `setDisabled` 只在 render 时算过一次，而打字不会触发 render。
 *
 * 关键点：断言取「当前渲染出来的那一行」而不是缓存引用，这样即便将来有人改用重建
 * 内容区的方式实现（另一条错误路径），测试也能给出正确判断。
 */

/** 记录被识别过的地址，用于断言按钮点击真的把输入交了出去。 */
let resolvedInputs: string[] = [];
/** 记录识别过的**主题**地址（主题那半边走的是另一个服务方法）。 */
let resolvedThemeInputs: string[] = [];
/** 记录安装请求，用于断言「用的是源仓库还是镜像」。 */
let installRequests: Array<{ repo: string; origin?: { host: string } }> = [];
/** 记录主题安装请求。 */
let themeInstallRequests: Array<{ repo: string }> = [];
/** `looksLikeKind` 的答案 —— 由各用例设定（默认「不是另一类对象」）。 */
let looksLikeAnswer = false;

function makeService(): InstallerService {
    const notifier = new Notifier({ getShowNotices: () => false, getT: () => zhCN });
    const result: InstallResult = {
        manifest: {
            id: "trefoil",
            name: "Trefoil",
            version: "1.2.0",
            minAppVersion: "1.0.0",
        },
        channel: "release",
        version: "1.2.0",
        replaced: false,
        enabled: true,
        repoRef: { host: "gitee", owner: "sofqi", repo: "Trefoil" },
    };
    const themeResult: ThemeInstallResult = {
        manifest: { name: "Minimal", version: "9.1.0" },
        channel: "raw",
        version: "9.1.0",
        id: "Minimal",
        replaced: false,
        wasActive: false,
        repoRef: { host: "github", owner: "kepano", repo: "obsidian-minimal" },
    };
    return {
        resolveRepo: async (input: string) => {
            resolvedInputs.push(input);
            // 识别到的是源仓库，另外**提出**一个疑似镜像（默认不采用）
            return {
                ref: { host: "github", owner: "sofqi", repo: "Trefoil" },
                mirror: { host: "gitee", owner: "sofqi", repo: "Trefoil" },
            };
        },
        resolveThemeRepo: async (input: string) => {
            resolvedThemeInputs.push(input);
            return {
                ref: { host: "github", owner: "kepano", repo: "obsidian-minimal" },
                manifest: { name: "Minimal", version: "9.1.0" },
            };
        },
        listVersions: async () => [{ value: "latest", label: zhCN.installer.versionLatest, prerelease: false }],
        install: async (request: { repo: string; origin?: { host: string } }) => {
            installRequests.push(request);
            return result;
        },
        installTheme: async (request: { repo: string }) => {
            themeInstallRequests.push(request);
            return themeResult;
        },
        looksLikeKind: async () => looksLikeAnswer,
        deps: { notifier },
    } as unknown as InstallerService;
}

/** 最近一次打开的弹窗（弹窗的渲染都挂在 contentEl 上，断言要读它）。 */
let openedModal: AddRepoModal | undefined;

function currentModal(): AddRepoModal {
    if (!openedModal) throw new Error("还没有打开过弹窗");
    return openedModal;
}

function openModal(
    onInstalled?: (result: InstallResult | ThemeInstallResult) => void,
    service: InstallerService = makeService(),
    kind: TrackedKind = "plugin"
): AddRepoModal {
    const modal = new AddRepoModal(
        {} as App,
        service,
        {} as CommunityPluginIndex,
        zhCN,
        kind,
        onInstalled
    );
    openedModal = modal;
    modal.open();
    return modal;
}

/** 当前渲染出来的仓库地址行（render 会重建内容区，所以取最后一条匹配项）。 */
function repoRow() {
    const row = [...createdSettings]
        .reverse()
        .find((setting) => setting.buttons.some((button) => button.text === zhCN.installer.resolve));
    if (!row) throw new Error("当前内容区里找不到「仓库地址」这一行");
    return row;
}

function resolveButton(): ButtonComponent {
    return repoRow().buttons.find((button) => button.text === zhCN.installer.resolve)!;
}

function repoInput(): TextComponent {
    return repoRow().texts[0];
}

describe("AddRepoModal 的「识别」按钮", () => {
    beforeEach(() => {
        resetCreatedSettings();
        resolvedInputs = [];
        installRequests = [];
    });

    it("地址为空时置灰", () => {
        openModal();
        expect(resolveButton().disabled).toBe(true);
    });

    it("填入地址后立即变为可用", () => {
        openModal();
        repoInput().type("sofqi/Trefoil");
        expect(resolveButton().disabled).toBe(false);
    });

    it("粘贴完整 Gitee 链接后同样可用", () => {
        openModal();
        repoInput().type("https://gitee.com/sofqi/Trefoil");
        expect(resolveButton().disabled).toBe(false);
    });

    it("清空地址后重新置灰", () => {
        openModal();
        repoInput().type("sofqi/Trefoil");
        expect(resolveButton().disabled).toBe(false);

        repoInput().type("");
        expect(resolveButton().disabled).toBe(true);
    });

    it("只输入空白字符仍然置灰", () => {
        openModal();
        repoInput().type("   ");
        expect(resolveButton().disabled).toBe(true);
    });

    it("输入只更新按钮状态，不重建内容区（否则会丢焦点与光标）", () => {
        openModal();
        const before = createdSettings.length;

        repoInput().type("sofqi/Trefoil");

        expect(createdSettings.length).toBe(before);
    });

    it("点击后把地址原样交给服务去识别", async () => {
        openModal();
        repoInput().type("sofqi/Trefoil");

        resolveButton().click();

        await vi.waitFor(() => expect(resolvedInputs).toEqual(["sofqi/Trefoil"]));
    });
});

/**
 * 安装成功后的回调。
 *
 * 设置页靠它重绘「已跟踪」列表（见 `settingsTabRefresh.test.ts`）—— 弹窗自己不
 * 碰界面，要是这里不发通知，列表就只能等下一次「检查全部更新」顺带那次重绘。
 */
describe("AddRepoModal 的安装回调", () => {
    beforeEach(() => {
        resetCreatedSettings();
        resolvedInputs = [];
        installRequests = [];
    });

    /** 当前渲染出来的「安装」按钮（识别 → 选版本之后才有这一行）。 */
    function installButton(): ButtonComponent {
        const row = [...createdSettings]
            .reverse()
            .find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.installer.install)
            );
        if (!row) throw new Error("当前内容区里找不到「安装」按钮");
        return row.buttons.find((button) => button.text === zhCN.installer.install)!;
    }

    async function resolveRepo(): Promise<void> {
        repoInput().type("sofqi/Trefoil");
        resolveButton().click();
        await vi.waitFor(() => installButton());
    }

    it("安装成功后把结果交给回调", async () => {
        const results: Array<InstallResult | ThemeInstallResult> = [];
        openModal((result) => results.push(result));

        await resolveRepo();
        installButton().click();

        await vi.waitFor(() => expect(results).toHaveLength(1));
        // 插件模式回传的一定是插件结果 —— 这里窄化一次，顺带钉住回调的载荷类型。
        const result = results[0] as InstallResult;
        expect(result.manifest.name).toBe("Trefoil");
        expect(result.version).toBe("1.2.0");
    });

    it("提示里报出实际来源（用户看不出「没走镜像」与「没探测」的区别）", async () => {
        const service = makeService();
        const notices: string[] = [];
        (
            service as unknown as { deps: { notifier: { success(message: string): void } } }
        ).deps.notifier.success = (message: string) => notices.push(message);
        openModal(undefined, service);

        await resolveRepo();
        installButton().click();

        await vi.waitFor(() => expect(notices).toHaveLength(1));
        expect(notices[0]).toBe(zhCN.installer.installed("Trefoil", "1.2.0", "Gitee"));
    });

    it("安装失败时不调回调（设置页不该重绘出一个并不存在的条目）", async () => {
        const service = makeService();
        (service as unknown as { install: () => Promise<never> }).install = async () => {
            throw new Error("boom");
        };
        const results: Array<InstallResult | ThemeInstallResult> = [];
        openModal((result) => results.push(result), service);

        await resolveRepo();
        installButton().click();

        // 失败路径把弹窗重绘回可重试状态，而不是通知调用方「装好了」
        await vi.waitFor(() => expect(installButton().disabled).toBe(false));
        expect(results).toEqual([]);
    });
});

/**
 * 「疑似镜像」在安装弹窗里的样子：**默认不用镜像，勾了才用**。
 *
 * 判据只是「两边 manifest 的 id 相同」—— 那只证明是同一个插件，证明不了是同一份
 * 代码/同一个作者（详见 ConfirmMirrorModal 的警告）。所以采用必须由用户明示，
 * 而且界面要同时说清「检测到了什么」与「现在会用哪个地址」。
 */
describe("AddRepoModal 的镜像开关", () => {
    beforeEach(() => {
        resetCreatedSettings();
        resolvedInputs = [];
        installRequests = [];
    });

    async function resolveRepoTarget(): Promise<void> {
        repoInput().type("sofqi/Trefoil");
        resolveButton().click();
        await vi.waitFor(() => expect(installButton()).toBeDefined());
    }

    function installButton(): ButtonComponent {
        const row = [...createdSettings]
            .reverse()
            .find((setting) =>
                setting.buttons.some((button) => button.text === zhCN.installer.install)
            );
        if (!row) throw new Error("当前内容区里找不到「安装」按钮");
        return row.buttons.find((button) => button.text === zhCN.installer.install)!;
    }

    /** 弹窗内容区里所有文本（含 Setting 的名字与描述）。 */
    function modalTexts(): string[] {
        const walk = (node: unknown): string[] => {
            const el = node as { text?: string; children?: unknown[] };
            const own = el.text ? [el.text] : [];
            return [...own, ...(el.children ?? []).flatMap(walk)];
        };
        return ((currentModal().contentEl.children as unknown) as unknown[]).flatMap(walk);
    }

    /** 镜像开关所在那一行（名字是「疑似镜像：Gitee · sofqi/Trefoil」）。 */
    function mirrorToggle() {
        const row = [...createdSettings]
            .reverse()
            .find(
                (setting) =>
                    setting.toggles.length > 0 &&
                    setting.name === zhCN.installer.mirrorConfirmCandidate("Gitee", "sofqi/Trefoil")
            );
        if (!row) throw new Error("找不到镜像开关");
        return row.toggles[0]!;
    }

    it("检测到镜像就把地址说出来，并且**默认不勾**", async () => {
        openModal();
        await resolveRepoTarget();

        expect(mirrorToggle().value).toBe(false);
        // 「已识别为」那行报的是**实际会用**的地址 —— 默认就是源仓库；
        // 同时必须说明「检测到了镜像但没用」，否则用户分不清「没探测到」与「探测到没用」
        const statuses = modalTexts().join("\n");
        expect(statuses).toContain(zhCN.installer.resolved("GitHub", "sofqi/Trefoil"));
        expect(statuses).toContain(zhCN.installer.mirrorUnused("Gitee", "sofqi/Trefoil"));
    });

    it("不勾就装源仓库（不给 origin）", async () => {
        openModal();
        await resolveRepoTarget();
        installButton().click();

        await vi.waitFor(() => expect(installRequests).toHaveLength(1));
        expect(installRequests[0]!.repo).toBe("sofqi/Trefoil");
        expect(installRequests[0]!.origin).toBeUndefined();
    });

    it("勾上之后装镜像，并把源地址交出去", async () => {
        openModal();
        await resolveRepoTarget();

        mirrorToggle().toggle(true);
        installButton().click();

        await vi.waitFor(() => expect(installRequests).toHaveLength(1));
        expect(installRequests[0]!.repo).toBe("sofqi/Trefoil");
        expect(installRequests[0]!.origin).toEqual({
            host: "github",
            owner: "sofqi",
            repo: "Trefoil",
        });
    });

    it("重新识别时勾选作废（换了地址就是另一件事）", async () => {
        openModal();
        await resolveRepoTarget();
        mirrorToggle().toggle(true);

        resolveButton().click();
        await vi.waitFor(() => expect(mirrorToggle().value).toBe(false));
    });
});

/** 当前渲染出来的、按钮文字为 `text` 的那个按钮（render 会重建内容区，取最后一条匹配）。 */
function buttonByText(text: string): ButtonComponent {
    const row = [...createdSettings]
        .reverse()
        .find((setting) => setting.buttons.some((button) => button.text === text));
    if (!row) throw new Error(`当前内容区里找不到「${text}」按钮`);
    return row.buttons.find((button) => button.text === text)!;
}

/**
 * 从第 `from` 个 Setting 起，内容区里还有没有这个按钮。
 *
 * `from` 不能省：`createdSettings` 是**累计**的（每次 render 都往里加），
 * 不切片的话「当前渲染里已经撤掉它」会被之前那些渲染留下的同名按钮误判成「还在」。
 */
function hasButton(text: string, from = 0): boolean {
    return createdSettings
        .slice(from)
        .some((setting) => setting.buttons.some((button) => button.text === text));
}

/** 弹窗标题的当前文字（`titleEl` 是 Obsidian 的元素类型，`text` 是替身记下来的）。 */
function modalTitle(): string {
    return (currentModal().titleEl as unknown as { text: string }).text;
}

/** 弹窗内容区里所有文本，拼成一段（断言「界面上说了什么」）。 */
function contentTexts(): string {
    const walk = (node: unknown): string[] => {
        const el = node as { text?: string; children?: unknown[] };
        return [...(el.text ? [el.text] : []), ...(el.children ?? []).flatMap(walk)];
    };
    return ((currentModal().contentEl.children as unknown) as unknown[])
        .flatMap(walk)
        .join("\n");
}

function resetModalState(): void {
    resetCreatedSettings();
    resolvedInputs = [];
    resolvedThemeInputs = [];
    installRequests = [];
    themeInstallRequests = [];
    looksLikeAnswer = false;
}

/**
 * 主题模式（`kind: "theme"`）——「添加主题」那个入口。
 *
 * 2026-10-05 用户报的问题：把**主题**仓库地址填进「添加插件仓库」，只会拿到
 * 「缺少必需文件：main.js」。根因不是文案，而是主题**根本没有新装入口**
 * （在此之前只有「绑定库里已装的」与「更新已跟踪的」）。
 */
describe("AddRepoModal · 主题模式", () => {
    beforeEach(resetModalState);

    it("标题说的是主题，并且不画「浏览社区插件」（那个走的是官方插件索引）", () => {
        openModal(undefined, makeService(), "theme");

        expect(modalTitle()).toBe(zhCN.installer.themeModalTitle);
        expect(hasButton(zhCN.installer.browse)).toBe(false);
    });

    it("识别走主题那一套：显示主题名与版本，且**没有版本选择**（主题没有版本钉选）", async () => {
        openModal(undefined, makeService(), "theme");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();

        await vi.waitFor(() => expect(buttonByText(zhCN.installer.themeInstall)).toBeDefined());

        expect(resolvedThemeInputs).toEqual(["kepano/obsidian-minimal"]);
        const texts = contentTexts();
        expect(texts).toContain(zhCN.installer.resolved("GitHub", "kepano/obsidian-minimal"));
        expect(texts).toContain(zhCN.installer.themeResolved("Minimal", "9.1.0"));
        expect(texts).not.toContain(zhCN.installer.versionLabel);
        // 「装好后去哪儿选它」必须在**点安装之前**就说出来（我们不替用户切主题）
        expect(texts).toContain(zhCN.installer.themeAfterInstallHint);
    });

    it("点「安装主题」走 installTheme，成功提示里带上「去哪儿选它」", async () => {
        const notices: string[] = [];
        const service = makeService();
        (
            service as unknown as { deps: { notifier: { success(message: string): void } } }
        ).deps.notifier.success = (message: string) => notices.push(message);
        openModal(undefined, service, "theme");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.themeInstall)).toBeDefined());

        buttonByText(zhCN.installer.themeInstall).click();

        await vi.waitFor(() => expect(notices).toHaveLength(1));
        expect(themeInstallRequests[0]!.repo).toBe("kepano/obsidian-minimal");
        expect(notices[0]).toContain(
            zhCN.installer.themeInstalled("Minimal", "9.1.0", zhCN.host.github)
        );
        expect(notices[0]).toContain(zhCN.installer.themeAfterInstallHint);
    });
});

/**
 * 填错入口时的下一步。
 *
 * 这是用户那条反馈的**正面回答**：不要只说「缺少必需文件：main.js」，要说清
 * 「这个仓库里其实是什么」，并给一个能走下去的按钮。
 */
describe("AddRepoModal · 填错了入口", () => {
    beforeEach(resetModalState);

    /** 让安装失败于「这个仓库里没有这类对象的标志性文件」。 */
    function failAsWrongKind(service: InstallerService, of: "plugin" | "theme"): void {
        const files = of === "plugin" ? "main.js" : "theme.css";
        const failed = async () => {
            throw new InstallerError({
                kind: "missingRequiredFiles",
                repo: "kepano/obsidian-minimal",
                files,
                of,
            });
        };
        (service as unknown as { install: () => Promise<never> }).install = failed;
        (service as unknown as { installTheme: () => Promise<never> }).installTheme = failed;
    }

    it("插件模式下装到主题仓库：报错之后给出「改为按主题安装」，并且**撤掉**原来的安装按钮", async () => {
        const service = makeService();
        looksLikeAnswer = true;
        failAsWrongKind(service, "plugin");
        openModal(undefined, service, "plugin");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.install)).toBeDefined());

        const beforeFailure = createdSettings.length;
        buttonByText(zhCN.installer.install).click();

        await vi.waitFor(() => expect(buttonByText(zhCN.installer.switchToTheme)).toBeDefined());
        expect(contentTexts()).toContain(zhCN.installer.looksLikeTheme);
        // 再点一次「安装」还是同样的失败，所以那个按钮让位给这一个
        expect(hasButton(zhCN.installer.install, beforeFailure)).toBe(false);
    });

    it("点「改为按主题安装」会切到主题模式并**重新识别**（识别结论不能搬过来用）", async () => {
        const service = makeService();
        looksLikeAnswer = true;
        failAsWrongKind(service, "plugin");
        openModal(undefined, service, "plugin");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.install)).toBeDefined());
        buttonByText(zhCN.installer.install).click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.switchToTheme)).toBeDefined());

        buttonByText(zhCN.installer.switchToTheme).click();

        await vi.waitFor(() => expect(resolvedThemeInputs).toEqual(["kepano/obsidian-minimal"]));
        // 标题跟着换 —— 用户得看出自己现在在哪一类的弹窗里
        expect(modalTitle()).toBe(zhCN.installer.themeModalTitle);
        expect(buttonByText(zhCN.installer.themeInstall)).toBeDefined();
    });

    it("主题模式下填的是插件仓库 → 「改为按插件安装」（反方向同样管）", async () => {
        const service = makeService();
        looksLikeAnswer = true;
        failAsWrongKind(service, "theme");
        openModal(undefined, service, "theme");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.themeInstall)).toBeDefined());

        buttonByText(zhCN.installer.themeInstall).click();

        await vi.waitFor(() => expect(buttonByText(zhCN.installer.switchToPlugin)).toBeDefined());
        expect(contentTexts()).toContain(zhCN.installer.looksLikePlugin);
    });

    it("网络类失败**不**给这个建议（换了入口照样装不上，那是把人指错路）", async () => {
        const service = makeService();
        looksLikeAnswer = true;
        (service as unknown as { install: () => Promise<never> }).install = async () => {
            throw new InstallerError({
                kind: "assetDownloadFailed",
                repo: "kepano/obsidian-minimal",
                files: "main.js",
                of: "plugin",
            });
        };
        openModal(undefined, service, "plugin");
        repoInput().type("kepano/obsidian-minimal");
        resolveButton().click();
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.install)).toBeDefined());

        const beforeFailure = createdSettings.length;
        buttonByText(zhCN.installer.install).click();

        // 回到可重试的状态，且不出现换入口的按钮
        await vi.waitFor(() => expect(buttonByText(zhCN.installer.install).disabled).toBe(false));
        expect(hasButton(zhCN.installer.switchToTheme, beforeFailure)).toBe(false);
    });
});
