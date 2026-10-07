import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setApiVersion, __setRequestUrlHandler } from "../stubs/obsidian";
import { Notifier } from "../../src/core/notice";
import { SecretStore } from "../../src/core/secretStore";
import { normalizeSettings, type ObsyncSettings } from "../../src/core/settings";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import {
    InstallerService,
    type InstallerHost,
} from "../../src/features/installer/installerService";
import type { TrackedTheme } from "../../src/features/installer/types";
import {
    createFakeApp,
    readThemeFile,
    seedTheme,
    themeManifestRaw,
    type FakeApp,
} from "../helpers/fakeApp";
import { expectInstallerError } from "../helpers/expectInstallerError";

/**
 * 主题那半条安装链路：绑定、更新、移除、手填仓库。
 *
 * 与插件侧共享前半段（解析仓库 → 解析来源 → 取文件 → 兼容性检查），
 * 本文件要守的是**分叉处**的行为：
 *
 * 1. 更新写回**记录的那个目录名**（主题的身份就是它），绝不按远端名字改名；
 * 2. 更新**绝不改变当前主题**，只在「更新的正是当前主题」时请求一次重载；
 * 3. 移除正在使用的主题前先切回默认 —— 否则会留下一个指向不存在主题的配置。
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

/**
 * 主题仓库最常见的那条路：**没有 release**，文件在默认分支上。
 *
 * 这正好也是主题与插件最大的生态差异 —— 插件那半的更新检查在「没有 release」
 * 时停下（配额考虑），主题必须往下读默认分支的 manifest.json。
 */
function setupRawThemeRepo(input: {
    owner?: string;
    repo?: string;
    css?: string;
    manifest?: string;
} = {}): void {
    const owner = input.owner ?? "kepano";
    const repo = input.repo ?? "obsidian-minimal";
    const css = input.css ?? "/* theme v2 */";
    const manifest = input.manifest ?? themeManifestRaw("Minimal", "9.1.0");

    route(/releases\/latest$/, () => ({ status: 404, text: '{"message":"Not Found"}' }));
    route(/\/releases\?/, () => ({ status: 200, text: "[]" }));
    route(new RegExp(`raw\\.githubusercontent\\.com/${owner}/${repo}/HEAD/theme\\.css$`), () => ({
        status: 200,
        text: css,
    }));
    route(
        new RegExp(`raw\\.githubusercontent\\.com/${owner}/${repo}/HEAD/manifest\\.json$`),
        () => ({ status: 200, text: manifest })
    );
}

function themeRecord(overrides: Partial<TrackedTheme> = {}): TrackedTheme {
    return {
        kind: "theme",
        host: "github",
        owner: "kepano",
        repo: "obsidian-minimal",
        id: "Minimal",
        name: "Minimal",
        installedVersion: "8.0.0",
        frozen: false,
        installedAt: 0,
        ...overrides,
    };
}

/** 摸到替身内部，用来模拟「非公开 API 在这个版本里不存在」。 */
function dropCustomCss(fake: FakeApp): void {
    delete (fake.app as unknown as { customCss?: unknown }).customCss;
}

describe("bindExistingThemes", () => {
    it("只写跟踪列表，不碰任何文件，也不编造通道", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);

        const added = await service.bindExistingThemes([
            {
                id: "Minimal",
                name: "Minimal",
                version: "9.1.0",
                repo: { host: "github", owner: "kepano", repo: "obsidian-minimal" },
            },
        ]);

        expect(added).toBe(1);
        expect(fake.writes).toEqual([]);
        expect(settings.installer.tracked).toEqual([
            {
                kind: "theme",
                host: "github",
                owner: "kepano",
                repo: "obsidian-minimal",
                id: "Minimal",
                name: "Minimal",
                installedVersion: "9.1.0",
                frozen: false,
                // 绑定没经过任何下载 —— 不编造一个「release」通道
                channel: undefined,
                installedAt: expect.any(Number),
            },
        ]);
    });

    it("已在跟踪列表里的不重复添加", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        const candidate = {
            id: "Minimal",
            name: "Minimal",
            version: "9.1.0",
            repo: { host: "github" as const, owner: "kepano", repo: "obsidian-minimal" },
        };

        await service.bindExistingThemes([candidate]);
        const second = await service.bindExistingThemes([candidate]);

        expect(second).toBe(0);
    });

    /**
     * **大小写不同 = 同一个主题。**
     *
     * 主题的身份是目录名，而 macOS / Windows 的文件系统本就不区分大小写 ——
     * 代码里另外三处都按这个口径办（`resolveThemeFolder` 找目录、
     * `listInstalledThemes` 去重、`getActiveTheme` 判断当前主题），
     * 只有去重这里漏了，于是同一个主题能被记两条。
     *
     * 后果不是「多一行」这么轻：两条记录都指向**同一个目录**
     * （`resolveThemeFolder` 会把它们解析到一起），更新其中一个等于更新两个；
     * 而徽标的键是 `<kind>:<id>`，`theme:Minimal` 与 `theme:minimal` 是两条不同的
     * 记录 —— 检查完只有一条会亮，用户看着两行一模一样的主题，
     * 分不出哪一行是真的。
     */
    it("**大小写不同视为同一个主题**（身份是目录名，文件系统本就不区分）", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        const repo = { host: "github" as const, owner: "kepano", repo: "obsidian-minimal" };

        await service.bindExistingThemes([
            { id: "Minimal", name: "Minimal", version: "9.1.0", repo },
        ]);
        const second = await service.bindExistingThemes([
            { id: "minimal", name: "Minimal", version: "9.1.0", repo },
        ]);

        expect(second).toBe(0);
        expect(settings.installer.tracked).toHaveLength(1);
    });

    it("**同名的插件与主题互不干扰**（键空间按 kind 分开）", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        settings.installer.tracked = [
            {
                kind: "plugin",
                host: "github",
                owner: "someone",
                repo: "minimal-plugin",
                id: "minimal",
                name: "Minimal Plugin",
                installedVersion: "1.0.0",
                requestedVersion: "latest",
                frozen: false,
                channel: "release",
                installedAt: 0,
            },
        ];

        const added = await service.bindExistingThemes([
            {
                id: "minimal",
                name: "Minimal",
                version: "9.1.0",
                repo: { host: "github", owner: "kepano", repo: "obsidian-minimal" },
            },
        ]);

        expect(added).toBe(1);
        expect(settings.installer.tracked.map((item) => item.kind)).toEqual([
            "plugin",
            "theme",
        ]);
    });
});

describe("updateTheme", () => {
    it("从默认分支取文件，写进**记录的那个目录**，并更新版本记录", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Minimal", "8.0.0"),
                "theme.css": "/* theme v1 */",
            })
        );
        const { service, settings } = createService(fake);
        setupRawThemeRepo();

        const result = await service.updateTheme(themeRecord());

        expect(result.version).toBe("9.1.0");
        expect(result.channel).toBe("raw");
        expect(result.replaced).toBe(true);
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* theme v2 */");
        expect(readThemeFile(fake, "Minimal", "manifest.json")).toBe(
            themeManifestRaw("Minimal", "9.1.0")
        );
        expect(settings.installer.tracked[0]).toMatchObject({
            kind: "theme",
            id: "Minimal",
            installedVersion: "9.1.0",
            channel: "raw",
        });
    });

    it("**远端 manifest 改了名字也不改名目录**（目录名就是主题的身份）", async () => {
        const fake = createFakeApp(
            seedTheme("MyMinimal", {
                "manifest.json": themeManifestRaw("Old Name", "1.0.0"),
                "theme.css": "/* old */",
            })
        );
        const { service } = createService(fake);
        // 远端把主题改名了：连目录名都不该动，否则等于换了一个主题
        setupRawThemeRepo({ manifest: themeManifestRaw("Renamed Theme", "9.1.0") });

        await service.updateTheme(themeRecord({ id: "MyMinimal", name: "Old Name" }));

        expect(readThemeFile(fake, "MyMinimal", "theme.css")).toBe("/* theme v2 */");
        expect(fake.folders.has(".obsidian/themes/Renamed Theme")).toBe(false);
    });

    it("更新的正是当前主题 → 请求一次重载，但**不切换**主题", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Minimal", "8.0.0"),
                "theme.css": "/* old */",
            })
        );
        fake.customCss.theme = "Minimal";
        const { service } = createService(fake);
        setupRawThemeRepo();

        const result = await service.updateTheme(themeRecord());

        expect(result.wasActive).toBe(true);
        expect(fake.customCss.reloadRequests).toBe(1);
        // 关键：绝不替用户换主题
        expect(fake.customCss.setThemeCalls).toEqual([]);
        expect(fake.customCss.theme).toBe("Minimal");
    });

    it("更新的不是当前主题 → 连重载都不做（别打扰当前观感）", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Minimal", "8.0.0"),
                "theme.css": "/* old */",
            })
        );
        fake.customCss.theme = "Things";
        const { service } = createService(fake);
        setupRawThemeRepo();

        const result = await service.updateTheme(themeRecord());

        expect(result.wasActive).toBe(false);
        expect(fake.customCss.reloadRequests).toBe(0);
        expect(fake.customCss.setThemeCalls).toEqual([]);
    });

    it("写盘失败时整体回滚，并报「已还原」", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Minimal", "8.0.0"),
                "theme.css": "/* old */",
            })
        );
        const { service } = createService(fake);
        setupRawThemeRepo();
        // theme.css 在 manifest 之后写，这里让第二次写入失败
        fake.failWriteOnceOn = (path) => path.endsWith("theme.css");

        await expectInstallerError(
            () => service.updateTheme(themeRecord()),
            "writeFailedRolledBack"
        );

        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* old */");
        expect(readThemeFile(fake, "Minimal", "manifest.json")).toBe(
            themeManifestRaw("Minimal", "8.0.0")
        );
    });

    it("主题的更新不碰同 id 的插件记录", async () => {
        const fake = createFakeApp(
            seedTheme("minimal", {
                "manifest.json": themeManifestRaw("minimal", "8.0.0"),
                "theme.css": "/* old */",
            })
        );
        const { service, settings } = createService(fake);
        settings.installer.tracked = [
            {
                kind: "plugin",
                host: "github",
                owner: "someone",
                repo: "minimal-plugin",
                id: "minimal",
                name: "Minimal Plugin",
                installedVersion: "1.0.0",
                requestedVersion: "latest",
                frozen: false,
                channel: "release",
                installedAt: 0,
            },
        ];
        setupRawThemeRepo({ owner: "someone", repo: "minimal-theme" });

        await service.updateTheme(
            themeRecord({ id: "minimal", owner: "someone", repo: "minimal-theme" })
        );

        expect(settings.installer.tracked[0]).toMatchObject({
            kind: "plugin",
            installedVersion: "1.0.0",
        });
        expect(settings.installer.tracked[1]).toMatchObject({
            kind: "theme",
            installedVersion: "9.1.0",
        });
    });
});

/**
 * 取消绑定 —— 只把条目移出跟踪列表，**不碰磁盘、不碰当前主题**。
 *
 * 这个动作以前叫 `uninstall`：它会先把正在使用的主题切回默认，再递归删掉主题目录。
 * 那是越界的 —— 主题的安装与移除归 Obsidian 自己管（设置里的「外观」），
 * 而跟踪列表只管「我在跟哪个仓库」。它以前还依赖一整套非公开 API 来判断
 * 「这个主题正在被使用吗」，现在那套判断连同删除一起消失了。
 */
describe("unbind（取消绑定，主题）", () => {
    it("主题目录与文件原样保留，也不动当前主题", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", { "theme.css": "/* x */", "manifest.json": "{ }" })
        );
        fake.customCss.theme = "Minimal";
        const { service, settings } = createService(fake);
        settings.installer.tracked = [themeRecord()];

        await service.unbind(themeRecord());

        expect(settings.installer.tracked).toEqual([]);
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* x */");
        expect(fake.customCss.theme).toBe("Minimal");
        expect(fake.customCss.setThemeCalls).toEqual([]);
    });

    it("连非公开 API 都不需要了：没有 customCss 也照样完成", async () => {
        const fake = createFakeApp(seedTheme("Minimal", { "theme.css": "/* x */" }));
        dropCustomCss(fake);
        const { service, settings } = createService(fake);
        settings.installer.tracked = [themeRecord()];

        await service.unbind(themeRecord());

        expect(settings.installer.tracked).toEqual([]);
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* x */");
    });

    it("清掉该主题的更新徽标，且只影响同 kind 同 id 的那条", async () => {
        const fake = createFakeApp(
            seedTheme("minimal", { "theme.css": "/* x */" })
        );
        const { service, settings } = createService(fake);
        settings.installer.tracked = [themeRecord({ id: "minimal" })];
        settings.installer.availableUpdates["theme:minimal"] = {
            latestVersion: "9.9.9",
            checkedAt: 1,
        };

        await service.unbind(themeRecord({ id: "minimal" }));

        expect(settings.installer.availableUpdates["theme:minimal"]).toBeUndefined();
        // 同 id 的插件目录本来就与主题无关 —— 更不该被碰
        expect(fake.folders.has(".obsidian/plugins/minimal")).toBe(false);
    });
});

describe("bindThemeToRepo（手填仓库地址）", () => {
    it("先验证远端确实是个主题仓库，再记入跟踪列表", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        setupRawThemeRepo();

        const added = await service.bindThemeToRepo(
            { id: "Minimal", name: "Minimal", version: "" },
            "kepano/obsidian-minimal"
        );

        expect(added).toBe(1);
        expect(fake.writes).toEqual([]);
        expect(settings.installer.tracked[0]).toMatchObject({
            kind: "theme",
            host: "github",
            owner: "kepano",
            repo: "obsidian-minimal",
            id: "Minimal",
            // 版本仍是**本地**的事实（空 = 未知），不被远端覆盖
            installedVersion: "",
        });
    });

    it("**仓库里没有 manifest.json 时报错**（打错的地址不该被静默记下）", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        route(/releases\/latest$/, () => ({ status: 404, text: "{}" }));
        route(/\/releases\?/, () => ({ status: 200, text: "[]" }));
        route(/raw\.githubusercontent\.com\/owner\/nope\/HEAD\/manifest\.json$/, () => ({
            status: 404,
            text: "not found",
        }));

        await expectInstallerError(
            () => service.bindThemeToRepo({ id: "X", name: "X", version: "" }, "owner/nope"),
            "missingManifest"
        );
        expect(settings.installer.tracked).toEqual([]);
    });

    it("远端 manifest 不合法时按主题规则报错", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        setupRawThemeRepo({ manifest: JSON.stringify({ version: "1.0.0" }) });

        let detail: unknown;
        try {
            await service.bindThemeToRepo(
                { id: "X", name: "X", version: "" },
                "kepano/obsidian-minimal"
            );
        } catch (err) {
            detail = (err as { detail?: unknown }).detail;
        }

        expect(detail).toMatchObject({ kind: "manifestMissingField", field: "name" });
    });

    it("Gitee 上的主题也能绑定（host 取自用户填的地址）", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        // 无令牌时 Gitee 走的是网页 raw 通道：gitee.com/{owner}/{repo}/raw/{ref}/{path}
        route(/gitee\.com\/someone\/theme\/raw\/HEAD\/manifest\.json$/, () => ({
            status: 200,
            text: themeManifestRaw("Gitee Theme", "1.2.3"),
        }));

        const added = await service.bindThemeToRepo(
            { id: "Gitee Theme", name: "Gitee Theme", version: "" },
            "https://gitee.com/someone/theme"
        );

        expect(added).toBe(1);
        expect(settings.installer.tracked[0]).toMatchObject({
            kind: "theme",
            host: "gitee",
            owner: "someone",
            repo: "theme",
        });
    });
});

/**
 * `installTheme` —— 从仓库地址**新装**一个主题（2026-10-05）。
 *
 * 这条路径此前**不存在**：主题只能「绑定库里已装的」或「更新已跟踪的」。用户把
 * 主题仓库地址填进「添加插件仓库」时，拿到的是「缺少必需文件：main.js」——
 * 而主题根本没有那个文件（见 `FILE_SETS.theme`）。
 *
 * 本组要守的是「新装」与「更新」的**三处分叉**（都在 `installTheme` 的注释里）：
 * 目录名由远端 manifest 现算、不做镜像发现、绝不替用户切换主题。再加一条最要紧的
 * 安全线：**同名目录里是别的主题时拒绝覆盖**。
 */
describe("installTheme（从仓库新装主题）", () => {
    it("写进 themes/{manifest.name} 并记入跟踪列表", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        setupRawThemeRepo();

        const result = await service.installTheme({ repo: "kepano/obsidian-minimal" });

        // 目录名取**远端 manifest 的 name**（`Minimal`），不是仓库名
        // （`obsidian-minimal`）—— 官方主题商店也是这么落的。
        expect(result.id).toBe("Minimal");
        expect(result.version).toBe("9.1.0");
        expect(result.channel).toBe("raw");
        expect(result.replaced).toBe(false);
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* theme v2 */");
        expect(readThemeFile(fake, "Minimal", "manifest.json")).toBe(
            themeManifestRaw("Minimal", "9.1.0")
        );
        expect(settings.installer.tracked[0]).toMatchObject({
            kind: "theme",
            host: "github",
            owner: "kepano",
            repo: "obsidian-minimal",
            id: "Minimal",
            name: "Minimal",
            installedVersion: "9.1.0",
            channel: "raw",
        });
    });

    it("**绝不替用户切换主题**（装的正好是当前主题时只请求一次重载）", async () => {
        const fake = createFakeApp();
        fake.customCss.theme = "Minimal";
        const { service } = createService(fake);
        setupRawThemeRepo();

        const result = await service.installTheme({ repo: "kepano/obsidian-minimal" });

        expect(result.wasActive).toBe(true);
        // 文件被换了，所以要让 Obsidian 重读一次 —— 否则用户看到「装好」但观感没变
        expect(fake.customCss.reloadRequests).toBe(1);
        // 但切换主题是用户的动作：`themeFolder.ts` 刻意连 `setTheme` 都没收进来
        expect(fake.customCss.setThemeCalls).toEqual([]);
        expect(fake.customCss.theme).toBe("Minimal");
    });

    it("主题名首尾的空白会被去掉，再当目录名", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        // `"Minimal "` 与 `"Minimal"` 在 Windows 上是同一个目录、在 Linux 上不是 ——
        // 留着空白只会在跨设备时制造「主题凭空消失」。
        setupRawThemeRepo({ manifest: themeManifestRaw("Minimal ", "9.1.0") });

        const result = await service.installTheme({ repo: "kepano/obsidian-minimal" });

        expect(result.id).toBe("Minimal");
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* theme v2 */");
    });

    it("主题名不能当目录名时回落到仓库名（目录名会成为路径的一截）", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        // 带路径分隔符的名字过得了 manifest 的解析（`name` 只要非空），
        // 但过不了 `isValidThemeName` —— 而它会成为 `rmdir(folder, true)` 的目标。
        setupRawThemeRepo({ manifest: themeManifestRaw("Minimal / 9", "9.1.0") });

        const result = await service.installTheme({ repo: "kepano/obsidian-minimal" });

        expect(result.id).toBe("obsidian-minimal");
        expect(readThemeFile(fake, "obsidian-minimal", "theme.css")).toBe("/* theme v2 */");
        expect(settings.installer.tracked[0]).toMatchObject({ id: "obsidian-minimal" });
        // 记录里的显示名仍然是远端那个（界面上要按作者给的名字显示）
        expect(settings.installer.tracked[0]).toMatchObject({ name: "Minimal / 9" });
    });

    it("目标目录里是**另一个**主题时拒绝覆盖", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Rose Red", "1.0.0"),
                "theme.css": "/* 别人的主题 */",
            })
        );
        const { service, settings } = createService(fake);
        setupRawThemeRepo();

        await expectInstallerError(
            () => service.installTheme({ repo: "kepano/obsidian-minimal" }),
            "themeNameConflict"
        );

        // 别人的主题一个字节都不许动，也不该出现在跟踪列表里
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* 别人的主题 */");
        expect(settings.installer.tracked).toEqual([]);
    });

    it("目标目录里是**同一个**主题（或没有 manifest）时允许重装", async () => {
        const fake = createFakeApp(
            seedTheme("Minimal", {
                "manifest.json": themeManifestRaw("Minimal", "8.0.0"),
                "theme.css": "/* 旧版 */",
            })
        );
        const { service } = createService(fake);
        setupRawThemeRepo();

        const result = await service.installTheme({ repo: "kepano/obsidian-minimal" });

        expect(result.replaced).toBe(true);
        expect(readThemeFile(fake, "Minimal", "theme.css")).toBe("/* theme v2 */");
    });

    it("**不做镜像发现**：新装时主题的镜像判据（本地已装的那一版）还不存在", async () => {
        const fake = createFakeApp();
        const { service, settings } = createService(fake);
        setupRawThemeRepo();

        await service.installTheme({ repo: "kepano/obsidian-minimal" });

        expect(calls.some((url) => url.includes("gitee.com"))).toBe(false);
        expect(settings.installer.mirrorSuggestions).toEqual({});
    });

    it("不满足 minAppVersion 时中止，不写任何文件", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        setupRawThemeRepo({
            manifest: themeManifestRaw("Minimal", "9.1.0", { minAppVersion: "99.0.0" }),
        });

        await expectInstallerError(
            () => service.installTheme({ repo: "kepano/obsidian-minimal" }),
            "incompatibleApp"
        );
        expect(fake.writes).toEqual([]);
    });

    it("仓库里没有 theme.css 时报 missingRequiredFiles（**带的 kind 是主题**）", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        // 一个插件仓库：有 manifest 与 main.js，没有 theme.css
        route(/releases\/latest$/, () => ({ status: 404, text: "{}" }));
        route(/\/releases\?/, () => ({ status: 200, text: "[]" }));
        route(/HEAD\/manifest\.json$/, () => ({
            status: 200,
            text: JSON.stringify({
                id: "trefoil",
                name: "Trefoil",
                version: "1.0.0",
                minAppVersion: "1.0.0",
            }),
        }));
        route(/HEAD\/theme\.css$/, () => ({ status: 404, text: "not found" }));

        let detail: unknown;
        try {
            await service.installTheme({ repo: "kepano/obsidian-minimal" });
        } catch (err) {
            detail = (err as { detail?: unknown }).detail;
        }

        // 文案要按 kind 选词（「无法安装该主题」而不是「该插件」）——
        // 这条钉的正是 `errors.ts` 里 `of` 参数的来路。
        expect(detail).toMatchObject({ kind: "missingRequiredFiles", files: "theme.css", of: "theme" });
    });

    it("looksLikeKind 认得对面那一类对象的标志性文件", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        route(/HEAD\/theme\.css$/, () => ({ status: 200, text: "/* theme */" }));
        route(/HEAD\/main\.js$/, () => ({ status: 404, text: "not found" }));
        const ref = { host: "github", owner: "kepano", repo: "obsidian-minimal" } as const;

        expect(await service.looksLikeKind(ref, "theme")).toBe(true);
        expect(await service.looksLikeKind(ref, "plugin")).toBe(false);
    });

    it("looksLikeKind 探测失败时返回 false（不给一个走不通的建议）", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        // 没有 route：任何请求都会抛错
        const ref = { host: "github", owner: "kepano", repo: "obsidian-minimal" } as const;

        expect(await service.looksLikeKind(ref, "theme")).toBe(false);
    });
});

describe("resolveThemeRepo", () => {
    it("识别成功时回传地址与 manifest", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        route(/HEAD\/manifest\.json$/, () => ({
            status: 200,
            text: themeManifestRaw("Minimal", "9.1.0"),
        }));

        const resolved = await service.resolveThemeRepo("kepano/obsidian-minimal");

        expect(resolved.ref).toEqual({ host: "github", owner: "kepano", repo: "obsidian-minimal" });
        expect(resolved.manifest.name).toBe("Minimal");
    });

    it("没有 manifest.json 时报 missingManifest（kind 是主题）", async () => {
        const fake = createFakeApp();
        const { service } = createService(fake);
        route(/HEAD\/manifest\.json$/, () => ({ status: 404, text: "not found" }));

        await expectInstallerError(
            () => service.resolveThemeRepo("kepano/nope"),
            "missingManifest"
        );
    });
});
