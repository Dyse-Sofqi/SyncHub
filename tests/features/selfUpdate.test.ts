import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setApiVersion, __setRequestUrlHandler, Notice } from "../stubs/obsidian";
import { Notifier } from "../../src/core/notice";
import { SecretStore } from "../../src/core/secretStore";
import { normalizeSettings, type ObsyncSettings } from "../../src/core/settings";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { en } from "../../src/core/i18n/locales/en";
import type { RepoRef } from "../../src/host/types";
import {
    InstallerService,
    type InstallerHost,
} from "../../src/features/installer/installerService";
import {
    clearPendingRestart,
    describeSelfState,
    readPendingRestart,
    resolveSelfRepo,
    selfRepoAttempts,
    selfSourceLabel,
    selfUpdateUsesGitee,
    SELF_MIRROR,
    SELF_REPO,
} from "../../src/features/installer/selfUpdate";
import {
    createFakeApp,
    readPluginFile,
    seedPlugin,
    type FakeApp,
} from "../helpers/fakeApp";
import { expectInstallerError } from "../helpers/expectInstallerError";

/**
 * SyncHub 更新自己这条链路。
 *
 * 要守的东西按重要性排：
 *
 * 1. **不重载自己**。别的插件更新完 disable → enable；对自己是先卸载正在执行
 *    这段代码的实例 —— 能成也是靠副作用成功，失败就停在「已禁用」。所以这里
 *    只写文件 + 记「待重启」。这条如果被谁改回 reload，本文件会红。
 * 2. **不把自己记进跟踪列表**（那张表是「用户装了什么」）。
 * 3. 两道守卫：远端 id 必须是 `ob-sync`（常量写错时会覆盖别的插件）、不允许降级。
 * 4. 「待重启」标记与写盘同生共死：写失败回滚了就不能留下标记。
 */

interface Route {
    match: RegExp;
    respond: () => { status: number; text?: string };
}

let routes: Route[] = [];
let calls: string[] = [];

function route(match: RegExp, respond: Route["respond"]): void {
    routes.push({ match, respond });
}

beforeEach(() => {
    routes = [];
    calls = [];
    // 提示条是**全局收集**的（`Notice.instances`）—— 不清就会跨用例串味，
    // 而「回退有没有说一声」正是靠它断言的。
    Notice.instances.length = 0;
    __setApiVersion("1.13.1");
    __setRequestUrlHandler(async (request) => {
        calls.push(request.url);
        for (const candidate of routes) {
            if (candidate.match.test(request.url)) {
                const result = candidate.respond();
                return { status: result.status, text: result.text ?? "" };
            }
        }
        throw new Error(`no route for ${request.url}`);
    });
});

afterEach(() => {
    __setRequestUrlHandler(undefined);
});

function createService(fake: FakeApp): {
    service: InstallerService;
    settings: ObsyncSettings;
} {
    const settings = normalizeSettings({});
    const notifier = new Notifier({ getShowNotices: () => true, getT: () => zhCN });
    const host: InstallerHost = {
        app: fake.app,
        notifier,
        secretStore: new SecretStore(fake.app),
        getSettings: () => settings,
        getT: () => zhCN,
        saveSettings: async () => {},
    };
    return { service: new InstallerService(host), settings };
}

const OLD_MANIFEST = JSON.stringify({
    id: "ob-sync",
    name: "SyncHub",
    version: "0.1.0",
    minAppVersion: "1.8.7",
});

function releaseJson(input: { version: string; id?: string; mainJs?: string }): string {
    const id = input.id ?? "ob-sync";
    const assets = [
        { name: "manifest.json", url: "https://dl.test/manifest.json" },
        { name: "main.js", url: "https://dl.test/main.js" },
    ];

    // manifest 的资产内容要跟着参数走（id 变了是守卫用例）
    route(/^https:\/\/dl\.test\/manifest\.json$/, () => ({
        status: 200,
        text: JSON.stringify({
            id,
            name: "SyncHub",
            version: input.version,
            minAppVersion: "1.8.7",
        }),
    }));
    route(/^https:\/\/dl\.test\/main\.js$/, () => ({
        status: 200,
        text: input.mainJs ?? `// main ${input.version}`,
    }));
    // styles.css 不在资产里，raw 也 404 —— 可选文件应被静默跳过
    route(/raw\.githubusercontent\.com\/Dyse-Sofqi\/SyncHub\/[^/]+\/styles\.css$/, () => ({
        status: 404,
        text: "not found",
    }));

    return JSON.stringify({
        id: 1,
        tag_name: input.version,
        name: input.version,
        prerelease: false,
        draft: false,
        created_at: "2026-01-01T00:00:00Z",
        assets: assets.map((asset, index) => ({
            id: index + 1,
            name: asset.name,
            size: 10,
            browser_download_url: asset.url,
            url: `https://api.github.com/assets/${index + 1}`,
        })),
    });
}

/** 装好「SyncHub 自己发了新版本」的一组路由。 */
function setupSelfRelease(input: { version: string; id?: string; mainJs?: string }): void {
    const body = releaseJson(input);
    route(/releases\/latest$/, () => ({ status: 200, text: body }));
    route(new RegExp(`releases\\/tags\\/${input.version.replace(/\./g, "\\.")}$`), () => ({
        status: 200,
        text: body,
    }));
}

function installedObsync(): Record<string, string> {
    return seedPlugin("ob-sync", {
        "manifest.json": OLD_MANIFEST,
        "main.js": "// old main",
    });
}

describe("updateSelf（更新自己）", () => {
    it("写入新文件、记下待重启，且**不重载、不记入跟踪列表**", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        await fake.plugins.enablePluginAndSave("ob-sync"); // 运行中
        setupSelfRelease({ version: "0.2.0" });

        const result = await service.updateSelf("0.1.0");

        expect(result).toEqual({ version: "0.2.0", replaced: true });
        expect(readPluginFile(fake, "ob-sync", "main.js")).toBe("// main 0.2.0");

        // 磁盘上已是新版本，运行中的还是旧的 —— 标记是这段时间的唯一凭据
        expect(settings.installer.pendingRestartVersion).toBe("0.2.0");

        // **没有**被禁用/重载（`reloadPlugin` 会先 disable 再 enable）
        expect(fake.plugins.enabledPlugins.has("ob-sync")).toBe(true);

        // 不把自己塞进跟踪列表
        expect(settings.installer.tracked).toEqual([]);
    });

    it("开着镜像开关时从 Gitee 拉，不碰官方仓库", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        settings.installer.selfUpdateUseGitee = true;
        setupSelfRelease({ version: "0.2.0" });

        await service.updateSelf("0.1.0");

        expect(calls.some((url) => url.includes("gitee.com/api/v5/repos/sofqi/SyncHub"))).toBe(true);
        // 关键：**没有**任何请求打到官方仓库 —— 否则「我选了镜像」就是句空话
        expect(
            calls.some((url) => url.includes("api.github.com/repos/Dyse-Sofqi/SyncHub"))
        ).toBe(false);
    });

    /**
     * **不动设置**时走的就是 Gitee 镜像（2026-10-01 起的默认，2026-10-06 换成开关）。
     *
     * 与上一条的区别很重要：上一条验的是「开着会生效」，这一条验的是
     * 「什么都不动也走镜像」—— 而绝大多数用户永远不会去碰那个开关。
     */
    it("默认就是 Gitee 镜像：不碰任何设置也从 Gitee 更新，不碰官方", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        setupSelfRelease({ version: "0.2.0" });

        // 出厂设置（测试里就是 normalizeSettings({}) 的结果）
        expect(settings.installer.selfUpdateUseGitee).toBe(true);

        await service.updateSelf("0.1.0");

        expect(calls.some((url) => url.includes("gitee.com/api/v5/repos/sofqi/SyncHub"))).toBe(true);
        expect(
            calls.some((url) => url.includes("api.github.com/repos/Dyse-Sofqi/SyncHub"))
        ).toBe(false);
    });

    it("**可以重装同一个版本**（把一个坏掉的安装修回来是合理需求）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        setupSelfRelease({ version: "0.1.0", mainJs: "// same version, rebuilt" });

        await service.updateSelf("0.1.0");

        expect(readPluginFile(fake, "ob-sync", "main.js")).toBe("// same version, rebuilt");
        expect(settings.installer.pendingRestartVersion).toBe("0.1.0");
    });

    it("更新成功后清掉落盘的「可用更新」（否则标签页那个徽标一直亮着）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        // 模拟「上一轮检查查到了 0.2.0」
        settings.installer.selfUpdateAvailable = "0.2.0";
        setupSelfRelease({ version: "0.2.0" });

        await service.updateSelf("0.1.0");

        expect(settings.installer.selfUpdateAvailable).toBe("");
    });

    /**
     * **镜像失败 → 改用官方仓库重试**（2026-10-01 用户要求）。
     *
     * 三件事要同时成立：顺序（先镜像）、结果（从官方拿到了文件）、
     * 以及**说出来**（提示里必须点明换了来源 —— 悄悄换等于「来源不明」）。
     */
    it("镜像不可用时回退到官方仓库，并从官方把新版本装好", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);

        // 镜像先失败：按注册顺序匹配，所以这条要压在 setupSelfRelease 前头。
        route(/gitee\.com\/api\/v5\/repos\/sofqi\/SyncHub\/releases\/latest$/, () => ({
            status: 403,
            text: '{"message":"rate limit"}',
        }));
        setupSelfRelease({ version: "0.2.0" });

        const result = await service.updateSelf("0.1.0");

        // 先试镜像、再试官方 —— 顺序本身是被要求的行为
        const giteeAt = calls.findIndex((url) => url.includes("gitee.com/api/v5/repos/sofqi"));
        const githubAt = calls.findIndex((url) => url.includes("api.github.com/repos/Dyse-Sofqi"));
        expect(giteeAt).toBeGreaterThanOrEqual(0);
        expect(githubAt).toBeGreaterThan(giteeAt);

        // 结果是「更新成功」，且来自官方那份资产
        expect(result).toEqual({ version: "0.2.0", replaced: true });
        expect(readPluginFile(fake, "ob-sync", "main.js")).toBe("// main 0.2.0");
        expect(settings.installer.pendingRestartVersion).toBe("0.2.0");

        // 回退**说了出来**：提示里带上失败的那个地址与官方地址
        const warned = Notice.instances.map((notice) => String(notice.message));
        expect(warned.some((message) => message.includes("gitee.com/sofqi/SyncHub"))).toBe(true);
        expect(
            warned.some((message) => message.includes("github.com/Dyse-Sofqi/SyncHub"))
        ).toBe(true);
    });

    it("两边都失败时抛出**官方那次**的原因（回退本身已经提示过了）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);

        route(/gitee\.com\/api\/v5\/repos\/sofqi\/SyncHub\/releases\/latest$/, () => ({
            status: 403,
            text: '{"message":"rate limit"}',
        }));
        route(/api\.github\.com\/repos\/Dyse-Sofqi\/SyncHub\/releases\/latest$/, () => ({
            status: 404,
            text: '{"message":"Not Found"}',
        }));

        await expect(service.updateSelf("0.1.0")).rejects.toThrow();

        // 两次都打过了，一个文件都没写
        expect(calls.some((url) => url.includes("gitee.com/api/v5/repos/sofqi"))).toBe(true);
        expect(calls.some((url) => url.includes("api.github.com/repos/Dyse-Sofqi"))).toBe(true);
        expect(fake.writes).toEqual([]);
        expect(settings.installer.pendingRestartVersion).toBe("");
        // 回退提示仍然只有一条（不是每次重试都嚷一句）
        expect(
            Notice.instances.filter((notice) =>
                String(notice.message).includes("gitee.com/sofqi/SyncHub")
            )
        ).toHaveLength(1);
    });

    it("关掉镜像开关（配的就是官方）时**不做无谓的第二次尝试**（回退到自己没有意义）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        settings.installer.selfUpdateUseGitee = false;
        route(/api\.github\.com\/repos\/Dyse-Sofqi\/SyncHub\/releases\/latest$/, () => ({
            status: 403,
            text: '{"message":"rate limit"}',
        }));

        await expect(service.updateSelf("0.1.0")).rejects.toThrow();

        const attempts = calls.filter(
            (url) => url === "https://api.github.com/repos/Dyse-Sofqi/SyncHub/releases/latest"
        );
        expect(attempts).toHaveLength(1);
        expect(Notice.instances.map((notice) => String(notice.message)).join(" ")).not.toContain(
            "已改用官方仓库"
        );
    });

    it("镜像正常时不提示回退（别让每一行都挂一串废话）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service } = createService(fake);
        setupSelfRelease({ version: "0.2.0" });

        await service.updateSelf("0.1.0");

        expect(Notice.instances.map((notice) => String(notice.message)).join(" ")).not.toContain(
            "已改用官方仓库"
        );
    });
    it("**远端 id 不是 ob-sync 就中止**（常量写错时不能覆盖别的插件）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        setupSelfRelease({ version: "0.2.0", id: "some-other-plugin" });

        await expectInstallerError(() => service.updateSelf("0.1.0"), "selfIdMismatch");

        expect(fake.writes).toEqual([]);
        expect(readPluginFile(fake, "ob-sync", "main.js")).toBe("// old main");
        expect(settings.installer.pendingRestartVersion).toBe("");
    });

    it("**不允许降级**（远端比当前旧时中止）", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        setupSelfRelease({ version: "0.1.0" });

        await expectInstallerError(
            () => service.updateSelf("0.3.0"),
            "selfUpdateDowngrade"
        );

        expect(fake.writes).toEqual([]);
        expect(settings.installer.pendingRestartVersion).toBe("");
    });

    it("写盘失败时回滚，且**不留待重启标记**", async () => {
        const fake = createFakeApp(installedObsync());
        const { service, settings } = createService(fake);
        setupSelfRelease({ version: "0.2.0" });
        fake.failWriteOnceOn = (path) => path.endsWith("main.js");

        await expectInstallerError(() => service.updateSelf("0.1.0"), "writeFailedRolledBack");

        expect(readPluginFile(fake, "ob-sync", "main.js")).toBe("// old main");
        // 标记与写盘同生共死：标记在而磁盘是旧的，就成了假话
        expect(settings.installer.pendingRestartVersion).toBe("");
    });
});

describe("待重启标记", () => {
    it("记下之后读得回来，清掉返回 true", () => {
        const settings = normalizeSettings({});

        expect(readPendingRestart(settings)).toBe("");
        settings.installer.pendingRestartVersion = "0.2.0";
        expect(readPendingRestart(settings)).toBe("0.2.0");

        expect(clearPendingRestart(settings)).toBe(true);
        expect(readPendingRestart(settings)).toBe("");
    });

    it("没有标记时清它什么也不做（返回 false，调用方据此不做多余的保存）", () => {
        const settings = normalizeSettings({});

        expect(clearPendingRestart(settings)).toBe(false);
    });

    it("非字符串的脏值在加载时被纠正为空串", () => {
        const settings = normalizeSettings({
            installer: { pendingRestartVersion: { version: "0.2.0" } },
        });

        expect(settings.installer.pendingRestartVersion).toBe("");
    });
});

describe("describeSelfState（设置页那一行状态）", () => {
    const base = { currentVersion: "0.1.0", pendingRestartVersion: "" };

    it("没查过时显示当前版本", () => {
        expect(describeSelfState(base, zhCN)).toBe(zhCN.installer.selfNotChecked("0.1.0"));
    });

    it("检查中 / 下载中让位给进度提示", () => {
        expect(describeSelfState({ ...base, busy: "checking" }, zhCN)).toBe(
            zhCN.installer.checking
        );
        expect(describeSelfState({ ...base, busy: "updating" }, zhCN)).toBe(
            zhCN.installer.selfUpdating
        );
    });

    it("有新版本 / 已是最新", () => {
        expect(
            describeSelfState(
                { ...base, check: { currentVersion: "0.1.0", latestVersion: "0.2.0", hasUpdate: true } },
                zhCN
            )
        ).toBe(zhCN.installer.selfUpdateAvailable("0.1.0", "0.2.0"));

        expect(
            describeSelfState(
                { ...base, check: { currentVersion: "0.1.0", latestVersion: "0.1.0", hasUpdate: false } },
                zhCN
            )
        ).toBe(zhCN.installer.selfUpToDate("0.1.0"));
    });

    it("失败时把原因写出来", () => {
        expect(
            describeSelfState(
                {
                    ...base,
                    check: {
                        currentVersion: "0.1.0",
                        latestVersion: "0.1.0",
                        hasUpdate: false,
                        error: "网络不可达",
                    },
                },
                zhCN
            )
        ).toBe(zhCN.installer.selfCheckFailed("网络不可达"));
    });

    it("**「待重启」压在检查结果之上** —— 它讲的是现在跑的不是最新那份", () => {
        const text = describeSelfState(
            {
                currentVersion: "0.1.0",
                pendingRestartVersion: "0.2.0",
                check: { currentVersion: "0.1.0", latestVersion: "0.3.0", hasUpdate: true },
            },
            zhCN
        );

        expect(text).toBe(zhCN.installer.selfPendingRestart("0.2.0"));
        expect(text).toContain("重启");
    });

    it("英文侧也有对应文案（这条链路存在的理由）", () => {
        const text = describeSelfState({ ...base, pendingRestartVersion: "0.2.0" }, en);

        expect(text).toBe(en.installer.selfPendingRestart("0.2.0"));
        expect(text).not.toMatch(/[\u4e00-\u9fff]/);
    });

    /**
     * 回退过官方仓库时，状态行末尾要一直写着这件事（2026-10-01）。
     *
     * 提示条几秒就没了，而「这次是从哪儿查的」是用户判断这条结论可不可信的依据。
     * 三种主体（有更新 / 已是最新 / 出错）都要带上它 —— 回退是**过程**，与结论无关。
     */
    it("回退过时在末尾注明（有更新 / 已是最新 / 出错都带）", () => {
        const fallback = "gitee.com/sofqi/SyncHub";

        const withUpdate = describeSelfState(
            {
                ...base,
                check: {
                    currentVersion: "0.1.0",
                    latestVersion: "0.2.0",
                    hasUpdate: true,
                    fellBackFrom: fallback,
                },
            },
            zhCN
        );
        expect(withUpdate).toBe(
            `${zhCN.installer.selfUpdateAvailable("0.1.0", "0.2.0")} ${zhCN.installer.selfCheckFellBack(fallback)}`
        );

        const upToDate = describeSelfState(
            {
                ...base,
                check: {
                    currentVersion: "0.1.0",
                    latestVersion: "0.1.0",
                    hasUpdate: false,
                    fellBackFrom: fallback,
                },
            },
            zhCN
        );
        expect(upToDate).toContain(zhCN.installer.selfCheckFellBack(fallback));

        const failed = describeSelfState(
            {
                ...base,
                check: {
                    currentVersion: "0.1.0",
                    latestVersion: "0.1.0",
                    hasUpdate: false,
                    error: "网络不可达",
                    fellBackFrom: fallback,
                },
            },
            zhCN
        );
        expect(failed).toBe(
            `${zhCN.installer.selfCheckFailed("网络不可达")} ${zhCN.installer.selfCheckFellBack(fallback)}`
        );
    });

    it("没回退过时不加那半句（别让每一行都挂一串废话）", () => {
        const text = describeSelfState(
            {
                ...base,
                check: { currentVersion: "0.1.0", latestVersion: "0.1.0", hasUpdate: false },
            },
            zhCN
        );

        expect(text).toBe(zhCN.installer.selfUpToDate("0.1.0"));
    });
});

/**
 * 回退顺序（2026-10-01）。
 *
 * 用户的要求原话是「先试镜像、失败再试官方，回退发生时要告诉用户」——
 * 这一组钉的就是这三件事：**顺序**、**只回退到官方**、**回退要说出来**。
 */
describe("selfRepoAttempts / selfSourceLabel（回退顺序与称呼）", () => {
    const custom: RepoRef = { host: "github", owner: "someone", repo: "fork" };

    it("默认（镜像）→ 先镜像、再官方", () => {
        expect(selfRepoAttempts(SELF_MIRROR)).toEqual([SELF_MIRROR, SELF_REPO]);
    });

    it("用户自己填的别的来源也回退到官方", () => {
        expect(selfRepoAttempts(custom)).toEqual([custom, SELF_REPO]);
    });

    it("配的就是官方时**只有一次尝试**（回退到自己没有意义，还会白打一遍请求）", () => {
        expect(selfRepoAttempts(SELF_REPO)).toEqual([SELF_REPO]);
    });

    it("提示里把来源写成可读地址", () => {
        expect(selfSourceLabel(SELF_MIRROR)).toBe("gitee.com/sofqi/SyncHub");
        expect(selfSourceLabel(SELF_REPO)).toBe("github.com/Dyse-Sofqi/SyncHub");
    });
});

/**
 * 「自身更新来源」的选择。
 *
 * 存在的理由：`github.com` 在本机会被时段性阻断，而 Gitee 镜像能直连。用户选一次
 * 就该一直用它 —— 所以这是个**纯函数**，不需要探测，也不受「自动发现 Gitee 镜像」
 * 开关影响（那套是给用户装的插件用的：自动探测、只提议、要确认）。
 *
 * 2026-10-06 用户要求把来源从自由地址改成开关，于是这里从「解析字符串」变成了
 * 「二选一」—— 断言也跟着变成「开 → 镜像、关 → 官方」。
 */
describe("resolveSelfRepo（自身更新来源开关）", () => {
    it("开着（默认）→ **Gitee 镜像**", () => {
        expect(resolveSelfRepo(true)).toEqual(SELF_MIRROR);
    });

    it("关掉 → 官方仓库", () => {
        expect(resolveSelfRepo(false)).toEqual(SELF_REPO);
    });

    it("两个地址不许漂：镜像在 gitee/sofqi，官方在 github/Dyse-Sofqi", () => {
        // 漂开的话，设置页显示的是一个地址、实际请求的是另一个 —— 而那种错
        // 只会在真机上表现为「从想不到的地方拉了个包」。
        expect(SELF_MIRROR).toEqual({ host: "gitee", owner: "sofqi", repo: "SyncHub" });
        expect(SELF_REPO).toEqual({ host: "github", owner: "Dyse-Sofqi", repo: "SyncHub" });
    });
});

/**
 * 老 `selfUpdateSource` 字符串（v8 及以前）→ 布尔开关的折算。
 *
 * 这一组守着升级那一刻：折算规则必须与**当年那套解析**一致，否则老用户的来源会
 * 在升级时被悄悄换掉。规则本身写在 `selfUpdateUsesGitee` 的注释里。
 */
describe("selfUpdateUsesGitee（老字段折算）", () => {
    it("空串 / 全空白 / 非字符串 → 用镜像（当年空串表示默认 = 镜像）", () => {
        expect(selfUpdateUsesGitee("")).toBe(true);
        expect(selfUpdateUsesGitee("   ")).toBe(true);
        expect(selfUpdateUsesGitee(undefined)).toBe(true);
        expect(selfUpdateUsesGitee(42)).toBe(true);
    });

    it("Gitee 完整地址 → 用镜像", () => {
        expect(selfUpdateUsesGitee("https://gitee.com/sofqi/SyncHub")).toBe(true);
    });

    it("官方地址 → 不用镜像", () => {
        expect(selfUpdateUsesGitee("https://github.com/Dyse-Sofqi/SyncHub")).toBe(false);
    });

    it("`owner/repo` 简写按 GitHub 解释（与当年 parseRepoRef 的默认平台一致）", () => {
        expect(selfUpdateUsesGitee("sofqi/SyncHub")).toBe(false);
    });

    it("解析不出来的自定义地址退回默认（用镜像）", () => {
        expect(selfUpdateUsesGitee("这不是一个仓库地址")).toBe(true);
    });
});
