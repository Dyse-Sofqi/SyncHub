import { describe, expect, it } from "vitest";
import {
    availableUpdateKey,
    DEFAULT_SETTINGS,
    SETTINGS_VERSION,
    normalizeSettings,
} from "../../src/core/settings";

describe("availableUpdateKey（身份键）", () => {
    it("带 kind 前缀 —— 插件 id 与主题目录名是两个命名空间", () => {
        expect(availableUpdateKey({ kind: "plugin", id: "minimal" })).toBe("plugin:minimal");
        expect(availableUpdateKey({ kind: "theme", id: "minimal" })).toBe("theme:minimal");
    });

    /**
     * **两边刻意不对称**，与 `pluginId.ts` / `themeName.ts` 那对判据同一个道理：
     * 主题的身份是目录名，而 macOS / Windows 的文件系统不区分大小写；
     * 插件的身份是 `manifest.id`，有 `/^[a-z0-9-]+$/` 的校验，本来就只可能是小写。
     *
     * 所以「把两边并成一个 `toLowerCase()`」看起来像简化，实际是把插件侧
     * 「id 不同就是不同的对象」这条语义也一起改掉了。这条用例把它钉住。
     */
    it("只有主题归一成小写，插件原样保留", () => {
        expect(availableUpdateKey({ kind: "theme", id: "Minimal" })).toBe("theme:minimal");
        expect(availableUpdateKey({ kind: "plugin", id: "Minimal" })).toBe("plugin:Minimal");
    });
});

describe("normalizeSettings", () => {
    it("空数据返回完整默认值", () => {
        // folders 要单独比：默认值写的是 `.`（给人看），归一之后是 `[""]`
        // （整个库）—— 这正是 normalizeSettings 该做的事。
        const expected = { ...DEFAULT_SETTINGS, images: { ...DEFAULT_SETTINGS.images, folders: [""] } };
        expect(normalizeSettings(undefined)).toEqual(expected);
        expect(normalizeSettings(null)).toEqual(expected);
        expect(normalizeSettings("garbage")).toEqual(expected);
    });

    /**
     * 默认的提交信息模板（2026-10-02 用户要求加上文件数）。
     *
     * 钉住它，是因为它出现在**用户永远看得到的地方**：库里每一条自动提交的信息
     * 都是这句话。换措辞是有意的产品决定，不该被顺手改掉。
     *
     * 后半段钉的是另一半事实：**改默认值不动老数据**。模板属于用户可编辑的设置，
     * `mergeWithDefaults` 让存着的值优先 —— 老库升级后仍是它们自己的模板。
     */
    it("默认的提交信息模板带文件数，但不会改写老库里存着的模板", () => {
        expect(DEFAULT_SETTINGS.sync.commitMessage).toBe(
            "vault backup: {{date}} ({{numFiles}} files)"
        );
        // 没有这一项时补上默认值
        expect(normalizeSettings({ version: 8, sync: {} }).sync.commitMessage).toBe(
            DEFAULT_SETTINGS.sync.commitMessage
        );
        // 老库里存着旧模板 → 原样保留
        expect(
            normalizeSettings({
                version: 8,
                sync: { commitMessage: "vault backup: {{date}}" },
            }).sync.commitMessage
        ).toBe("vault backup: {{date}}");
    });

    it("保留用户已设置的值", () => {
        const settings = normalizeSettings({
            debugLogging: true,
            sync: { commitMessage: "我的模板" },
        });

        expect(settings.debugLogging).toBe(true);
        expect(settings.sync.commitMessage).toBe("我的模板");
        // 同一层里没提到的字段要被补上，而不是整层被替换
        expect(settings.sync.gitPath).toBe("");
        expect(settings.sync.intervalMinutes).toBe(DEFAULT_SETTINGS.sync.intervalMinutes);
    });

    /**
     * 老 `data.json` 里还留着 `language`（那个设置项 2026-10-01 删了）。
     *
     * 它不需要迁移代码就**自动消失**：`mergeWithDefaults` 只保留默认值里存在的
     * 键。但这条断言还是要有 —— 它守的是「那个设置项真的没了」，而不是
     * 「代码里没人读它了」。

     * 顺带说明为什么它该消失：界面语言一律跟随 Obsidian，留一个能与 Obsidian
     * 不一致的开关只会让「界面语言不对」变成用户自己造得出来的状态。
     */
    it("丢掉已经删掉的 `language` 字段（界面语言跟随 Obsidian）", () => {
        const settings = normalizeSettings({ language: "zh-cn" }) as unknown as Record<
            string,
            unknown
        >;

        expect("language" in settings).toBe(false);
    });

    /**
     * **自身更新的默认来源是 Gitee 镜像**（2026-10-01）。
     *
     * 这一组盯的是「已经装过插件的人也会跟着走镜像」：当年这个字段是**自由地址
     * 字符串**，默认是空串（空串表示官方仓库），所以老 `data.json` 里存着的正是
     * 空串 —— 不把它折算成「用镜像」，「默认改走镜像」对老用户**一个都不生效**。
     *
     * 2026-10-06 该字段从字符串换成了布尔开关（`selfUpdateUseGitee`），所以这一组
     * 同时验两件事：默认值是 `true`，以及 v8 及以前的老字符串被正确折算。
     */
    describe("自身更新来源开关（v8 → v9）", () => {
        it("出厂设置默认**开着**（走 Gitee 镜像）", () => {
            expect(DEFAULT_SETTINGS.installer.selfUpdateUseGitee).toBe(true);
        });

        it("老数据里的空串被折算成「用镜像」（当年空串 = 官方）", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "" },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(true);
        });

        it("全空白也算「用镜像」", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "   " },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(true);
        });

        it("老数据里填的是官方地址 → 关掉开关", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "https://github.com/Dyse-Sofqi/SyncHub" },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(false);
        });

        it("老数据里填的是 Gitee 地址 → 保持开着", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "https://gitee.com/sofqi/SyncHub" },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(true);
        });

        it("老数据里的 `owner/repo` 简写按 GitHub 解释（当年就是这么解析的）→ 关", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "sofqi/SyncHub" },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(false);
        });

        it("类型不对（手改坏了）也回落到默认（开），而不是留一个空值", () => {
            expect(
                normalizeSettings({ installer: { selfUpdateSource: 42 } }).installer
                    .selfUpdateUseGitee
            ).toBe(true);
        });

        it("解析不出来的自定义地址退回默认（开）", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateSource: "这不是一个仓库地址" },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(true);
        });

        it("已经是 v9 数据（有布尔开关）时不被老字段覆盖", () => {
            const settings = normalizeSettings({
                installer: {
                    selfUpdateUseGitee: false,
                    // 老字段只是残留 —— 两台设备版本不一致时就会这样。
                    selfUpdateSource: "https://gitee.com/sofqi/SyncHub",
                },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(false);
        });

        it("开关字段类型不对（手改成数字）时回落到默认（开）", () => {
            const settings = normalizeSettings({
                installer: { selfUpdateUseGitee: 42 },
            });

            expect(settings.installer.selfUpdateUseGitee).toBe(true);
        });
    });

    /**
     * 「启用插件安装器」总开关的删除（2026-10-06，v9 → v10）。
     *
     * 那个字段只挡下面两个自动检查（`enabled && autoCheckOnStartup`、
     * `enabled && autoCheckOnSettingsOpen`），所以它等价于「把这两个都关掉」——
     * 同一个 off 的第二种说法。删掉它时，**明确关过它的用户**必须把「不要自动检查」
     * 这件事落到两个子开关上，否则升级后行为会变（他们会开始被自动检查）。
     */
    describe("删掉「启用插件安装器」总开关（v9 → v10）", () => {
        it("关过它的用户 → 两个自动检查开关都置为关（行为不变）", () => {
            const settings = normalizeSettings({
                version: 9,
                installer: { enabled: false },
            });

            expect(settings.installer.autoCheckOnStartup).toBe(false);
            expect(settings.installer.autoCheckOnSettingsOpen).toBe(false);
        });

        it("开着它的用户（默认）→ 两个子开关保持各自的值，不被迁移动", () => {
            const settings = normalizeSettings({
                version: 9,
                installer: { enabled: true, autoCheckOnSettingsOpen: true },
            });

            expect(settings.installer.autoCheckOnStartup).toBe(false);
            expect(settings.installer.autoCheckOnSettingsOpen).toBe(true);
        });

        it("缺这个字段（更老的数据）→ 同样不动两个子开关", () => {
            const settings = normalizeSettings({ version: 9, installer: {} });

            expect(settings.installer.autoCheckOnStartup).toBe(false);
            expect(settings.installer.autoCheckOnSettingsOpen).toBe(true);
        });

        it("手改成坏值（`\"false\"`）不算「关过」—— 当年它其实是开着的", () => {
            // 当年 `mergeWithDefaults` 会把类型不匹配的值换成默认 `true`，
            // 也就是那台设备上它一直是**开着**的。跟着同一个口径才不会凭空改行为。
            const settings = normalizeSettings({
                version: 9,
                installer: { enabled: "false" },
            });

            expect(settings.installer.autoCheckOnSettingsOpen).toBe(true);
        });

        it("v10 数据里那个字段只是残留，迁移不再触发", () => {
            const settings = normalizeSettings({
                version: 10,
                installer: { enabled: false, autoCheckOnSettingsOpen: true },
            });

            expect(settings.installer.autoCheckOnSettingsOpen).toBe(true);
        });
    });

    it("补齐新增的嵌套设置项，不需要写迁移代码", () => {
        // 模拟「旧版本 data.json 里没有 installer.autoCheckDelaySeconds」
        const settings = normalizeSettings({
            installer: { discoverGiteeMirrors: true },
        });

        expect(settings.installer.discoverGiteeMirrors).toBe(true);
        expect(settings.installer.autoCheckDelaySeconds).toBe(
            DEFAULT_SETTINGS.installer.autoCheckDelaySeconds
        );
    });

    it("丢弃类型不匹配的旧值", () => {
        const settings = normalizeSettings({
            showNotices: "yes",
            installer: { discoverGiteeMirrors: "true" },
        });

        expect(settings.showNotices).toBe(DEFAULT_SETTINGS.showNotices);
        expect(settings.installer.discoverGiteeMirrors).toBe(
            DEFAULT_SETTINGS.installer.discoverGiteeMirrors
        );
    });

    it("旧的 data.json 里没有「状态栏占满整屏宽」时补成默认值（**保持既有观感**）", () => {
        // 这个开关是后加的：老用户的库里没有这个字段，而他们看到的一直是全宽状态栏。
        // 补成 false 会**悄悄改掉所有人的界面** —— 那不是加开关该有的行为。
        const settings = normalizeSettings({ language: "zh-cn" });

        expect(settings.statusBarFullWidth).toBe(true);
        expect(DEFAULT_SETTINGS.statusBarFullWidth).toBe(true);
    });

    it("用户关掉它之后会被保留（不会被当成非法值丢掉）", () => {
        expect(normalizeSettings({ statusBarFullWidth: false }).statusBarFullWidth).toBe(
            false
        );
    });

    it("钳制越界或非法的数值", () => {
        const settings = normalizeSettings({
            installer: { autoCheckDelaySeconds: -10 },
            version: 7,
            sync: { intervalMinutes: 99999 },
        });

        expect(settings.installer.autoCheckDelaySeconds).toBe(0);
        expect(settings.sync.intervalMinutes).toBe(24 * 60);
    });

    /**
     * 周期里**没有「0 = 关闭」**（2026-10-02 起）—— 开与关只由 `enabled` 表达。
     *
     * 落进一个 0 会变成「开着却永不触发」的假状态，所以 0 / 负数 / 非数字都收敛
     * 到默认值（而不是钳到 1：每分钟自动提交一次比「用默认值」更糟）。
     */
    it("周期是 0 / 负数 / 非数字时收敛到默认值", () => {
        for (const bad of [0, -5, Number.NaN]) {
            const settings = normalizeSettings({
                version: 7,
                sync: { intervalMinutes: bad },
            });
            expect(settings.sync.intervalMinutes).toBe(DEFAULT_SETTINGS.sync.intervalMinutes);
        }
    });

    /**
     * v6 → v7（2026-10-02）：三个自动间隔合成一个「定时同步」周期。
     *
     * 这一组守的是**升级不会自己跑起来**：老模型里「开关开着 + 三个间隔全是 0」
     * 的实际行为是什么都不做，而新模型里一旦开着就会每 N 分钟提交并推送 ——
     * 迁移不能替用户把前者变成后者。
     */
    describe("v6 → v7：三个间隔合成一个周期", () => {
        it("老的主间隔（完整链路那条）原样接过来，开关照旧", () => {
            const settings = normalizeSettings({
                version: 6,
                sync: {
                    enabled: true,
                    autoCommitMinutes: 30,
                    autoPushMinutes: 30,
                    autoPullMinutes: 30,
                },
            });

            expect(settings.sync.intervalMinutes).toBe(30);
            expect(settings.sync.enabled).toBe(true);
        });

        it("三个都是 0 时开关置回关 —— 否则升级后立刻每 10 分钟跑一次", () => {
            const settings = normalizeSettings({
                version: 6,
                sync: {
                    enabled: true,
                    autoCommitMinutes: 0,
                    autoPushMinutes: 0,
                    autoPullMinutes: 0,
                },
            });

            expect(settings.sync.enabled).toBe(false);
            expect(settings.sync.intervalMinutes).toBe(DEFAULT_SETTINGS.sync.intervalMinutes);
        });

        it("「只拉取」的老配置不会变成「开始推送」", () => {
            // 这台设备当初刻意避开推送 —— 取最小正数当新周期就会让它开始推。
            const settings = normalizeSettings({
                version: 6,
                sync: {
                    enabled: true,
                    autoCommitMinutes: 0,
                    autoPushMinutes: 0,
                    autoPullMinutes: 30,
                },
            });

            expect(settings.sync.enabled).toBe(false);
        });

        it("已经是 v7 的数据一个字段都不碰（旧字段只是残留）", () => {
            const settings = normalizeSettings({
                version: 7,
                sync: { enabled: true, intervalMinutes: 45, autoCommitMinutes: 0 },
            });

            expect(settings.sync.intervalMinutes).toBe(45);
            expect(settings.sync.enabled).toBe(true);
        });

        it("升级后**不再有**那三个旧字段（旧的 data.json 残留会被丢掉）", () => {
            const settings = normalizeSettings({
                version: 6,
                sync: { enabled: true, autoCommitMinutes: 30, autoPushMinutes: 5 },
            }) as unknown as { sync: Record<string, unknown> };

            expect("autoCommitMinutes" in settings.sync).toBe(false);
            expect("autoPushMinutes" in settings.sync).toBe(false);
            expect("autoPullMinutes" in settings.sync).toBe(false);
        });
    });

    it("返回的设置**不与 DEFAULT_SETTINGS 共享嵌套对象**（改它不会污染默认值）", () => {
        // 守的是一个很隐蔽的 bug：`mergeWithDefaults` 只做浅拷贝，
        // 「磁盘数据里缺这个键」时它直接把默认值本身放进结果 —— 于是
        // `installer.tracked.push(...)`、拨一个同步开关，都写进了模块级的
        // DEFAULT_SETTINGS。此后每次 normalizeSettings（重载、读第二遍）都从
        // 一份脏默认值开始，表现为「删掉的条目又回来了」或全新库凭空多出条目。
        const first = normalizeSettings({});
        first.installer.tracked.push({
            kind: "theme",
            host: "github",
            owner: "owner",
            repo: "repo",
            id: "Polluted",
            name: "Polluted",
            installedVersion: "1.0.0",
            frozen: false,
            installedAt: 0,
        });
        first.sync.intervalMinutes = 99;

        // 默认值本身没被改动
        expect(DEFAULT_SETTINGS.installer.tracked).toEqual([]);
        expect(DEFAULT_SETTINGS.sync.intervalMinutes).toBe(10);

        // 再读一次也看不到上一次的写入
        const second = normalizeSettings({});
        expect(second.installer.tracked).toEqual([]);
        expect(second.sync.intervalMinutes).toBe(10);
    });

    it("始终写入当前设置版本号", () => {
        expect(normalizeSettings({ version: 0 }).version).toBe(SETTINGS_VERSION);
    });

    it("不把数组误当成嵌套对象合并", () => {
        const settings = normalizeSettings({ showNotices: ["true"] });
        expect(settings.showNotices).toBe(DEFAULT_SETTINGS.showNotices);
    });

    it("空白仓库默认不参与自动更新检查", () => {
        // v2 起的默认：启动检查关闭，改由「进入设置页自动检查」承接。
        expect(DEFAULT_SETTINGS.installer.autoCheckOnStartup).toBe(false);
        expect(DEFAULT_SETTINGS.installer.autoCheckOnSettingsOpen).toBe(true);
        expect(DEFAULT_SETTINGS.installer.lastUpdateCheckAt).toBe(0);
    });

    it("v1 → v2 迁移：把老数据里持久化的启动检查一并纠正为关闭", () => {
        // 旧的默认值是 true，用户从没动过开关也会被持久化成 true ——
        // 不纠正的话「新默认关闭」形同虚设。
        const migrated = normalizeSettings({
            version: 1,
            installer: { autoCheckOnStartup: true },
        });
        expect(migrated.installer.autoCheckOnStartup).toBe(false);
        expect(migrated.version).toBe(SETTINGS_VERSION);
    });

    it("v2 数据里的启动检查保持用户选择，不被迁移覆盖", () => {
        const kept = normalizeSettings({
            version: 2,
            installer: { autoCheckOnStartup: true },
        });
        expect(kept.installer.autoCheckOnStartup).toBe(true);
    });

    it("非法的时间戳回退为 0", () => {
        const settings = normalizeSettings({
            version: 2,
            installer: { lastUpdateCheckAt: -5 },
        });
        expect(settings.installer.lastUpdateCheckAt).toBe(0);

        const nan = normalizeSettings({
            version: 2,
            installer: { lastUpdateCheckAt: "yesterday" },
        });
        expect(nan.installer.lastUpdateCheckAt).toBe(0);
    });

    it("可更新记录：剪掉不在跟踪列表里的条目，丢弃形状不对的条目", () => {
        // 跟踪列表是「谁该有徽标」的唯一事实来源 —— 残留已移除对象的
        // 记录会在重新装上同名对象时显示过期徽标。
        //
        // 键是 `<kind>:<id>`（见 availableUpdateKey）：插件 id 与主题目录名
        // 是两个命名空间，共用一张表就必须带前缀，否则两者互相覆盖。
        const settings = normalizeSettings({
            installer: {
                tracked: [
                    {
                        kind: "plugin",
                        host: "github",
                        owner: "owner",
                        repo: "kept",
                        id: "kept",
                        name: "Kept",
                        installedVersion: "1.0.0",
                        requestedVersion: "latest",
                        frozen: false,
                        channel: "release",
                        installedAt: 0,
                    },
                ],
                availableUpdates: {
                    "plugin:kept": { latestVersion: "v2.0.0", checkedAt: 42 },
                    "plugin:removed": { latestVersion: "v3.0.0", checkedAt: 42 },
                    "theme:kept": { latestVersion: "v9.0.0", checkedAt: 42 },
                    malformed: { latestVersion: 123, checkedAt: "yesterday" },
                },
            },
        });

        expect(settings.installer.availableUpdates).toEqual({
            "plugin:kept": { latestVersion: "v2.0.0", checkedAt: 42 },
        });
    });

    it("v2 → v3 迁移：老条目补上 kind: plugin，并给更新记录换上新键", () => {
        // v2 的列表里只可能有插件 —— 迁移必须补 kind，否则 sanitize 会把
        // 用户装过的每一个插件都当成非法条目丢掉。
        const migrated = normalizeSettings({
            version: 2,
            installer: {
                tracked: [
                    {
                        host: "github",
                        owner: "owner",
                        repo: "repo",
                        pluginId: "demo",
                        name: "Demo",
                        installedVersion: "1.0.0",
                        requestedVersion: "latest",
                        frozen: true,
                        channel: "raw",
                        installedAt: 7,
                    },
                ],
                availableUpdates: {
                    demo: { latestVersion: "2.0.0", checkedAt: 42 },
                },
            },
        });

        expect(migrated.version).toBe(SETTINGS_VERSION);
        expect(migrated.installer.tracked).toEqual([
            {
                kind: "plugin",
                host: "github",
                owner: "owner",
                repo: "repo",
                id: "demo",
                name: "Demo",
                installedVersion: "1.0.0",
                requestedVersion: "latest",
                frozen: true,
                channel: "raw",
                installedAt: 7,
            },
        ]);
        // 旧键 `demo` 要变成 `plugin:demo`，否则徽标数据会被剪掉
        expect(migrated.installer.availableUpdates).toEqual({
            "plugin:demo": { latestVersion: "2.0.0", checkedAt: 42 },
        });
    });

    it("v2 → v3 迁移不碰 v3 数据（不会给主题补上 kind: plugin）", () => {
        const kept = normalizeSettings({
            version: 3,
            installer: {
                tracked: [
                    {
                        kind: "theme",
                        host: "github",
                        owner: "kepano",
                        repo: "obsidian-minimal",
                        id: "Minimal",
                        name: "Minimal",
                        installedVersion: "9.1.0",
                        frozen: false,
                        installedAt: 1,
                    },
                ],
            },
        });

        expect(kept.installer.tracked).toEqual([
            {
                kind: "theme",
                host: "github",
                owner: "kepano",
                repo: "obsidian-minimal",
                id: "Minimal",
                name: "Minimal",
                installedVersion: "9.1.0",
                frozen: false,
                channel: undefined,
                installedAt: 1,
            },
        ]);
    });

    /**
     * `id` 的**内容**必须校验，不能只校验「是不是非空字符串」。
     *
     * 理由不是洁癖：`manifest.ts` 对同一个字段有严格校验，注释写着
     * 「id 会被用作目录名，非法字符会造成路径问题，必须在写入前拦下」。
     * 而 `data.json` 是**可以手改、也会随笔记仓库同步到多设备**的东西 ——
     * 它是这个字段唯一不经过 manifest 解析的来源。
     *
     * 下游拿它干什么：移除时按 id 定位目录，找不到就回落到
     * `{configDir}/{plugins|themes}/{id}`，然后 `rmdir(folder, true)` **递归**删 ——
     * 路径算术与「真的会发出这个调用」在 `tests/features/itemFolder.test.ts` 里实测过。
     *
     * ## 两种 kind 的判据不同，所以分两组
     *
     * 插件 id 是作者定的技术标识（`/^[a-z0-9-]+$/`），主题名是给用户看的名词
     * （`Minimal`、`Blue Topaz`）。判据共用的后果不是「严一点」而是
     * **主题一条都活不下来**，且不会有任何提示。
     */
    describe("tracked 里的 id 内容校验（插件）", () => {
        function trackedWith(id: string) {
            return {
                installer: {
                    tracked: [
                        {
                            kind: "plugin",
                            host: "github",
                            owner: "owner",
                            repo: "repo",
                            id,
                            name: "X",
                        },
                    ],
                },
            };
        }

        /**
         * 这组会**逃出 `plugins/`** —— 路径算术在
         * `tests/features/itemFolder.test.ts` 里用 `resolvePluginFolder` +
         * `removeItemFolder` 实测过（含「真的会发出递归删除调用」一条）。
         */
        it.each([
            ["..", "上跳一级 → .obsidian 本身"],
            ["../..", "上跳两级 → 库根目录"],
            ["../../evil", "上跳后进别的目录 → 库根下的 evil"],
        ])("丢弃 %s 的条目（%s）", (id) => {
            const settings = normalizeSettings(trackedWith(id));
            expect(settings.installer.tracked).toEqual([]);
        });

        /**
         * 这组**不会**逃出 `plugins/` —— 别把它们和上面那组混为一谈。
         * 但同样要丢：这些值都不可能是真 manifest 的 id（那必须先过
         * `/^[a-z0-9-]+$/`），留着只会让移除/更新去操作一个错的目录。
         *
         * 顺带记两个容易被想当然的点（都实算过）：
         * - `/abs` 的**前导斜杠会被 `normalizePath` 吃掉**，结果落在
         *   `plugins/abs`，不是绝对路径 —— 所以它不逃逸；
         * - `a\b` 的反斜杠会被换成 `/`，与 `a/b` 等价。
         */
        it.each([
            ["a/b", "注入子目录（归一后仍在 plugins/ 内）"],
            ["a\\b", "反斜杠归一成斜杠，同 a/b"],
            ["/abs", "前导斜杠被吃掉 → plugins/abs"],
            ["has space", "含空格"],
            ["UPPER", "含大写"],
            ["dot.name", "含点"],
        ])("丢弃 %s 的条目（不是合法 id：%s）", (id) => {
            const settings = normalizeSettings(trackedWith(id));
            expect(settings.installer.tracked).toEqual([]);
        });

        it("合法的 id 一个都不能丢", () => {
            // 这条是上面那组的安全网：收紧校验时最容易连合法值一起误伤，
            // 而那些 id 会带着用户的跟踪列表一起消失。
            const valid = ["demo", "obsidian-git", "my-plugin-2", "a", "9", "x-1-2"];
            for (const id of valid) {
                const settings = normalizeSettings(trackedWith(id));
                expect(settings.installer.tracked.map((item) => item.id)).toEqual([id]);
            }
        });
    });

    describe("tracked 里的 id 内容校验（主题）", () => {
        function trackedWith(id: string) {
            return {
                installer: {
                    tracked: [
                        {
                            kind: "theme",
                            host: "github",
                            owner: "owner",
                            repo: "repo",
                            id,
                            name: "X",
                        },
                    ],
                },
            };
        }

        it.each([
            ["..", "上跳一级 → .obsidian 本身"],
            ["../../evil", "上跳后进别的目录"],
            ["a/b", "含路径分隔符"],
            ["a\\b", "含反斜杠"],
            // Windows 会静默去掉结尾的点、以及首尾空白 —— 写进去与读出来
            // 就不是同一个名字了，那种「找不到自己刚建的目录」最难查。
            ["Minimal.", "以点结尾"],
            [" Minimal", "前导空格"],
            ["Minimal ", "结尾空格"],
        ])("丢弃 %s 的条目（%s）", (id) => {
            const settings = normalizeSettings(trackedWith(id));
            expect(settings.installer.tracked).toEqual([]);
        });

        it("**真实主题名一律保留**（空格、大写、非 ASCII 都是常态）", () => {
            for (const id of ["Minimal", "Blue Topaz", "AnuPpuccin", "玫瑰紫", "Things"]) {
                const settings = normalizeSettings(trackedWith(id));
                expect(settings.installer.tracked.map((item) => item.id)).toEqual([id]);
            }
        });

        it("同一串名字在两种 kind 下判据不同 —— 不能把两边并成一个正则", () => {
            // 这条守的是「有人图省事共用一个判据」：那会让上面那组合法主题名
            // 全部消失（没有任何提示），而插件侧本就不该接受它。
            const asTheme = normalizeSettings(trackedWith("Blue Topaz"));
            expect(asTheme.installer.tracked).toHaveLength(1);

            const asPlugin = normalizeSettings({
                installer: {
                    tracked: [
                        {
                            kind: "plugin",
                            host: "github",
                            owner: "o",
                            repo: "r",
                            id: "Blue Topaz",
                            name: "X",
                        },
                    ],
                },
            });
            expect(asPlugin.installer.tracked).toEqual([]);
        });
    });

    it("同一个 id 的插件与主题可以共存（键空间按 kind 前缀分开）", () => {
        const settings = normalizeSettings({
            installer: {
                tracked: [
                    {
                        kind: "plugin",
                        host: "github",
                        owner: "o",
                        repo: "r",
                        id: "minimal",
                        name: "Plugin Minimal",
                    },
                    {
                        kind: "theme",
                        host: "github",
                        owner: "kepano",
                        repo: "obsidian-minimal",
                        id: "minimal",
                        name: "Theme Minimal",
                    },
                ],
            },
        });

        expect(settings.installer.tracked.map((item) => item.kind)).toEqual([
            "plugin",
            "theme",
        ]);
    });

    /**
     * 主题的身份是目录名，而 macOS / Windows 的文件系统不区分大小写 ——
     * 代码里另外三处都按这个口径办（`resolveThemeFolder` / `listInstalledThemes` /
     * `getActiveTheme`），去重也必须跟上。
     *
     * `data.json` 是可以手改、也会随笔记仓库同步到多设备的：一台机器上目录叫
     * `Minimal`、另一台叫 `minimal` 完全可能。两条记录指向的是**同一个目录**
     * （`resolveThemeFolder` 会把它们解析到一起），于是列表里两行一模一样的主题，
     * 更新其中一个等于更新两个，而徽标只会在其中一行亮 —— 用户分不出哪行是真的。
     *
     * 插件侧不受影响：`manifest.id` 有 `/^[a-z0-9-]+$/` 的校验，不可能出现大写。
     */
    it("tracked 里同一个主题的大小写变体只保留第一条", () => {
        const settings = normalizeSettings({
            installer: {
                tracked: [
                    {
                        kind: "theme",
                        host: "github",
                        owner: "kepano",
                        repo: "obsidian-minimal",
                        id: "Minimal",
                        name: "Minimal",
                    },
                    {
                        kind: "theme",
                        host: "github",
                        owner: "kepano",
                        repo: "obsidian-minimal",
                        id: "minimal",
                        name: "Minimal",
                    },
                ],
            },
        });

        expect(settings.installer.tracked).toHaveLength(1);
        // 保留的是**先出现的那条**（与「同一个身份只保留第一条」一致），
        // 不悄悄改写成后一条的写法 —— 记录里的名字是磁盘上那个名字。
        expect(settings.installer.tracked[0]!.id).toBe("Minimal");
    });

    it("缺 kind 的条目被丢弃（v3 起 kind 是必填，老数据由迁移负责补齐）", () => {        const settings = normalizeSettings({
            version: 3,
            installer: {
                tracked: [{ host: "github", owner: "o", repo: "r", id: "demo", name: "D" }],
            },
        });
        expect(settings.installer.tracked).toEqual([]);
    });

    /**
     * `origin`（走了 Gitee 镜像时记下的**源仓库地址**）的校验。
     *
     * 它的判据与别的字段不同：**坏值只丢它自己，不丢整个条目**。
     * 它纯粹是展示用的补充信息（列表在源仓库下面多画一行），为了一个多余的地址
     * 把用户在跟的插件扔出列表，代价完全不成比例 —— 而这条数据来自
     * `data.json`，可以被手改，也会随笔记仓库同步到别的设备。
     */
    describe("tracked 里的 origin 校验", () => {
        function trackedWith(origin: unknown) {
            return {
                installer: {
                    tracked: [
                        {
                            kind: "plugin",
                            host: "gitee",
                            owner: "owner",
                            repo: "demo",
                            id: "demo",
                            name: "Demo",
                            origin,
                        },
                    ],
                },
            };
        }

        it("合法值原样保留", () => {
            const settings = normalizeSettings(
                trackedWith({ host: "github", owner: "owner", repo: "demo" })
            );

            expect(settings.installer.tracked[0]!.origin).toEqual({
                host: "github",
                owner: "owner",
                repo: "demo",
            });
        });

        it.each([
            ["不是对象", "github"],
            ["是数组", [{ host: "github", owner: "owner", repo: "demo" }]],
            ["平台不认识", { host: "gitlab", owner: "owner", repo: "demo" }],
            ["owner 为空", { host: "github", owner: "", repo: "demo" }],
            ["repo 为空", { host: "github", owner: "owner", repo: "" }],
            ["缺 repo", { host: "github", owner: "owner" }],
        ])("丢弃坏值但**保留条目**（%s）", (_label, origin) => {
            const settings = normalizeSettings(trackedWith(origin));

            expect(settings.installer.tracked).toHaveLength(1);
            expect(settings.installer.tracked[0]!.origin).toBeUndefined();
        });

        it("**与主来源相同的值视为没写**（否则列表画出两行同一个地址）", () => {
            const settings = normalizeSettings(
                trackedWith({ host: "gitee", owner: "owner", repo: "demo" })
            );

            expect(settings.installer.tracked).toHaveLength(1);
            expect(settings.installer.tracked[0]!.origin).toBeUndefined();
        });

        it("没写这个字段时不影响任何旧数据（v2/v3 记录照常加载）", () => {
            const settings = normalizeSettings(trackedWith(undefined));

            expect(settings.installer.tracked[0]!.id).toBe("demo");
            expect(settings.installer.tracked[0]!.origin).toBeUndefined();
        });
    });
});

/**
 * 图片同步（Cloudflare R2）的设置。
 *
 * 这一组**没有专门的迁移代码** —— `mergeWithDefaults` 会把缺失的键补上，
 * 于是 v3 的 `data.json`（里面根本没有 `images`）读出来就是一份完整的默认值。
 * 这一点值得单独测：它是「新增一整组设置项不需要写迁移」这个设计的兑现处，
 * 而一旦有人把它改成「按版本号逐项补」，漏掉一项的后果是**那个字段是
 * `undefined`** —— 后续 `images.folders.some(...)` 之类的调用直接抛错。
 *
 * 另一条主线是**校验**：`data.json` 可以被手改，也会随笔记仓库同步到别的设备，
 * 而这一组字段里有一个（`folders`）决定「插件能动哪些文件」—— 它错了的代价
 * 是「动了不该动的文件」或「一个文件都不动」，两种都没有提示。
 */
describe("normalizeSettings：图片同步（v3 → v4）", () => {
    it("v3 的 data.json 里没有 images 时补上完整默认值", () => {
        const settings = normalizeSettings({ version: 3, language: "zh-cn" });

        expect(settings.version).toBe(SETTINGS_VERSION);
        // folders 要单独比：默认值写的是 `.`（给人看），归一之后是 `[""]`
        // （整个库）—— 这正是 normalizeSettings 该做的事。
        expect(settings.images).toEqual({ ...DEFAULT_SETTINGS.images, folders: [""] });
    });

    it("默认：受管文件夹是仓库根目录（整个库）", () => {
        // 这个插件服务的场景是「库本身是一个 git 仓库」，仓库文件夹就是那个
        // 场景里最自然的范围；曾经这里是 `[]`（一个都不预设）。
        expect(DEFAULT_SETTINGS.images.folders).toEqual(["."]);
        // 落地的形状是归一后的：`.` → 空串（见 normalizeFolder）。
        expect(normalizeSettings({}).images.folders).toEqual([""]);
    });

    it("默认：删本地图片时会问一句「云端那份也删吗」", () => {
        // 删除是不可逆的（R2 没有回收站），而「不问」意味着用户的云端备份
        // 会在他毫无察觉的情况下一直留着 —— 或者更糟：某天发现它又回到本地了。
        expect(DEFAULT_SETTINGS.images.deleteRemotePolicy).toBe("ask");
    });

    it("默认：按周期同步关着（它真的读写文件与网络，不该自己跑起来）", () => {
        // 2026-10-02（v8）起「关」是**独立的开关**，不是「间隔为 0」：
        // 数字里没有 0 的含义，范围 5–1440。
        expect(DEFAULT_SETTINGS.images.autoSyncEnabled).toBe(false);
        // 而周期本身有个合理默认值 —— 用户打开开关的那一刻就该看到一个数字，
        // 不是一个 0。2026-10-06 由 10 改成 30：本机改动那半边交给
        // 「变动后自动同步」之后，这一条只剩「把别处的变化拉回来」。
        expect(DEFAULT_SETTINGS.images.autoSyncMinutes).toBe(30);
    });

    /**
     * 「变动后自动同步」默认**开**（2026-10-06 加）。
     *
     * 它与上面那条默认关的**不是一类东西**：周期是「每隔 N 分钟无条件跑一轮」，
     * 而这一项是「你真的动了图之后跑一次」—— 代价与收益一一对应。
     */
    it("默认：变动后自动同步**开着**，静默 30 秒", () => {
        expect(DEFAULT_SETTINGS.images.imageChangeSyncEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.images.imageChangeDelaySeconds).toBe(30);
    });

    it("变动同步的静默期会被钳在 5–600 秒，填错则回落到默认值", () => {
        const withDelay = (value: unknown): number =>
            normalizeSettings({ images: { imageChangeDelaySeconds: value } }).images
                .imageChangeDelaySeconds;

        expect(withDelay(60)).toBe(60);
        // 上限那一侧钳到边界
        expect(withDelay(10_000)).toBe(600);
        // 下限那一侧**回落到默认值**，不钳到 5 —— 5 秒比默认激进得多，
        // 不该是「填错」的结果（与 `autoSyncMinutes` 同一条取舍）
        expect(withDelay(1)).toBe(30);
        expect(withDelay(0)).toBe(30);
        expect(withDelay(-1)).toBe(30);
        expect(withDelay("30")).toBe(30);
    });

    it("默认：总开关开着，但没配好之前它什么也不做", () => {
        expect(DEFAULT_SETTINGS.images.enabled).toBe(true);
        // 「开着」不等于「会跑」—— 配置不全时 `isConfigured()` 为假。
        expect(DEFAULT_SETTINGS.images.accountId).toBe("");
        expect(DEFAULT_SETTINGS.images.bucket).toBe("");
    });

    it("保留用户填的值", () => {
        const settings = normalizeSettings({
            images: {
                accountId: "abc123",
                bucket: "notes",
                accessKeyId: "AKIA",
                prefix: "sync",
                publicBaseUrl: "https://img.example.com",
                folders: ["attachments"],
                conflictPolicy: "local",
                compressFormat: "webp",
                compressQuality: 60,
                compressMaxEdge: 2400,
                autoSyncMinutes: 30,
                autoSyncEnabled: true,
                enabled: false,
                deleteRemotePolicy: "never",
            },
        });

        expect(settings.images).toMatchObject({
            accountId: "abc123",
            bucket: "notes",
            accessKeyId: "AKIA",
            prefix: "sync",
            publicBaseUrl: "https://img.example.com",
            folders: ["attachments"],
            conflictPolicy: "local",
            compressFormat: "webp",
            compressQuality: 60,
            compressMaxEdge: 2400,
            autoSyncMinutes: 30,
            autoSyncEnabled: true,
            enabled: false,
            deleteRemotePolicy: "never",
        });
    });

    /**
     * `folders` 是**唯一决定「插件能动哪些文件」**的字段，它的校验最要紧：
     * 非字符串的条目会让 `isInsideFolders` 抛错（整轮同步挂掉），
     * 而没归一化的路径（`/attachments/`、`a//b`）会让范围判断悄悄失准。
     */
    it("folders 逐项归一、去重，并丢掉非字符串的条目", () => {
        const settings = normalizeSettings({
            images: {
                folders: ["/attachments/", "attachments", "   ", "assets//img", ".", 42, null, {}],
            },
        });

        // `attachments` 的两种写法合成一条；`.` 归一成空串（整个库）
        expect(settings.images.folders).toEqual(["attachments", "assets/img", ""]);
    });

    it("folders 不是数组时退回空数组（**绝不能把整个库变成受管范围**）", () => {
        for (const value of ["attachments", {}, 42, null, true]) {
            expect(normalizeSettings({ images: { folders: value } }).images.folders).toEqual([]);
        }
    });

    /**
     * 「还没配过」与「配坏了」是两件事，处置必须相反。
     *
     * 缺失拿默认值（仓库根目录）；坏形状宁可退到空数组 —— 拿默认值兜底的话，
     * 一个手改坏的 `folders` 会被悄悄变成「同步整个库」，而那正是上一行那条
     * 用例要防的事（默认值不再是空数组之后，光靠 mergeWithDefaults 兜不住）。
     */
    it("folders 缺失时拿默认值（仓库根目录）", () => {
        expect(normalizeSettings({}).images.folders).toEqual([""]);
        expect(normalizeSettings({ images: {} }).images.folders).toEqual([""]);
    });

    it("枚举非法时回退默认", () => {
        const settings = normalizeSettings({
            images: {
                conflictPolicy: "whatever",
                compressFormat: "gif",
                deleteRemotePolicy: "sometimes",
            },
        });

        expect(settings.images.conflictPolicy).toBe("newer");
        expect(settings.images.compressFormat).toBe("keep");
        expect(settings.images.deleteRemotePolicy).toBe("ask");
    });

    it("数值越界时钳制", () => {
        const settings = normalizeSettings({
            images: {
                autoSyncMinutes: 99_999,
                compressQuality: 500,
                compressMaxEdge: 999_999,
            },
        });

        expect(settings.images.autoSyncMinutes).toBe(24 * 60);
        expect(settings.images.compressQuality).toBe(100);
        expect(settings.images.compressMaxEdge).toBe(20_000);
    });

    /**
     * 「按周期同步」的周期下限是 **5**（2026-10-02 用户提出）。
     *
     * 与 `compressQuality` 下限 10 同源：每 1 分钟跑一轮整库比对没有意义，
     * 而用户多半是手滑拖到底。低于下限（含 0 / 负数 / 非数字）收敛到**默认值**
     * 而不是钳到 5 —— 5 分钟一轮比默认值更激进，不该是「填错」的结果。
     */
    it("周期低于 5（含 0 / 负数 / 非数字）收敛到默认值，而不是钳到 5", () => {
        for (const bad of [0, 1, 4, -10, Number.NaN]) {
            const settings = normalizeSettings({
                version: 8,
                images: { autoSyncEnabled: true, autoSyncMinutes: bad },
            });
            expect(settings.images.autoSyncMinutes).toBe(DEFAULT_SETTINGS.images.autoSyncMinutes);
        }

        // 5 本身是合法的
        expect(
            normalizeSettings({ version: 8, images: { autoSyncMinutes: 5 } }).images.autoSyncMinutes
        ).toBe(5);
    });

    /**
     * v7 → v8：「按周期同步」的开关从「间隔为 0」拆成独立字段。
     *
     * 守的是**升级不会自己跑起来**：老模型里 `autoSyncMinutes === 0` 就是关闭，
     * 而那正是绝大多数存量库的状态。
     */
    describe("v7 → v8：开关从「间隔为 0」拆出来", () => {
        it("旧周期 > 0：接过来，并把开关置为开", () => {
            const settings = normalizeSettings({
                version: 7,
                images: { autoSyncMinutes: 30 },
            });

            expect(settings.images.autoSyncEnabled).toBe(true);
            expect(settings.images.autoSyncMinutes).toBe(30);
        });

        it("旧周期 = 0（默认，绝大多数）：开关置为关，周期留默认值", () => {
            const settings = normalizeSettings({
                version: 7,
                images: { enabled: true, autoSyncMinutes: 0 },
            });

            expect(settings.images.autoSyncEnabled).toBe(false);
            expect(settings.images.autoSyncMinutes).toBe(DEFAULT_SETTINGS.images.autoSyncMinutes);
        });

        it("已经是 v8 的数据一个字段都不碰", () => {
            const settings = normalizeSettings({
                version: 8,
                images: { autoSyncEnabled: false, autoSyncMinutes: 45 },
            });

            expect(settings.images.autoSyncEnabled).toBe(false);
            expect(settings.images.autoSyncMinutes).toBe(45);
        });

        it("旧数据里那些低于 5 的周期也会被抬到默认值（不会钳到 5 那样更激进）", () => {
            const settings = normalizeSettings({
                version: 7,
                images: { autoSyncMinutes: 2 },
            });

            expect(settings.images.autoSyncEnabled).toBe(true);
            expect(settings.images.autoSyncMinutes).toBe(DEFAULT_SETTINGS.images.autoSyncMinutes);
        });
    });

    it("质量下限是 10 而不是 1（质量 1 的 jpeg 基本不可看，而用户多半是手滑拖到底）", () => {
        expect(normalizeSettings({ images: { compressQuality: 0 } }).images.compressQuality).toBe(
            10
        );
        expect(normalizeSettings({ images: { compressQuality: -5 } }).images.compressQuality).toBe(
            10
        );
    });

    it("最长边可以为 0（表示不缩放）", () => {
        expect(normalizeSettings({ images: { compressMaxEdge: 0 } }).images.compressMaxEdge).toBe(0);
    });

    it("字符串字段拿到非字符串时当没写", () => {
        const settings = normalizeSettings({
            images: {
                accountId: 42,
                bucket: null,
                accessKeyId: ["AKIA"],
                prefix: {},
                publicBaseUrl: true,
            },
        });

        expect(settings.images).toMatchObject({
            accountId: "",
            bucket: "",
            accessKeyId: "",
            prefix: "",
            publicBaseUrl: "",
        });
    });

    /**
     * 密钥**不在设置里** —— 它走 `core/secretStore`（键 `r2`），与平台令牌
     * 同一条路径。这条断言守的是「不要为了方便把它加回设置」：
     * `data.json` 会随笔记仓库同步到别的设备，密钥跟着走等于泄漏。
     */
    it("Secret Access Key 不在设置里（它走 SecretStore）", () => {
        expect(Object.keys(DEFAULT_SETTINGS.images)).not.toContain("secretAccessKey");
    });

    it("不与 DEFAULT_SETTINGS 共享嵌套对象（改它不会污染默认值）", () => {
        // 与 installer.tracked 同一个坑：`mergeWithDefaults` 只做浅拷贝，
        // 「磁盘数据里缺这个键」时若不深拷贝，`images.folders.push(...)`
        // 会就地改写模块级的 DEFAULT_SETTINGS —— 此后每次读设置都从一份
        // 脏默认值开始，表现为「删掉的文件夹又回来了」。
        const first = normalizeSettings({});
        first.images.folders.push("attachments");

        expect(DEFAULT_SETTINGS.images.folders).toEqual(["."]);
        expect(normalizeSettings({}).images.folders).toEqual([""]);
    });

    /**
     * v4 → v5：取消双向删除，改成「删本地时问一句」。
     *
     * 这组用例存在的理由：两个老开关里**只有一个**有对应物，所以迁移不是
     * 机械改名。搞错方向的后果是「用户明明关掉了『删本地时动云端』，
     * 却开始被弹窗追问」—— 而那是他自己明确拒绝过的行为。
     */
    describe("v4 → v5 迁移（双向删除 → 询问）", () => {
        function v4(images: Record<string, unknown>) {
            return normalizeSettings({ version: 4, images });
        }

        it("把「本地删除时，云端也删除」的选择接过来", () => {
            // 关掉过它的用户明确表达过「删本地别动云端」——
            // 那就别拿询问去打扰他。
            expect(v4({ deleteRemoteWhenLocalDeleted: false }).images.deleteRemotePolicy).toBe("never");
            expect(v4({ deleteRemoteWhenLocalDeleted: true }).images.deleteRemotePolicy).toBe("ask");
        });

        it("没写过这个字段（老数据里没有）时用默认值", () => {
            expect(v4({}).images.deleteRemotePolicy).toBe("ask");
        });

        it("字段是坏值时用默认值（data.json 可以手改）", () => {
            expect(v4({ deleteRemoteWhenLocalDeleted: "yes" }).images.deleteRemotePolicy).toBe("ask");
            expect(v4({ deleteRemoteWhenLocalDeleted: null }).images.deleteRemotePolicy).toBe("ask");
        });

        /**
         * `deleteLocalWhenRemoteDeleted`（云端删了 → 本地也删）**没有**对应物：
         * 那个方向的行为被整个去掉了。它被静默丢弃是有意的 —— 把它翻译成
         * `deleteRemotePolicy` 会让「云端的变化影响本地」以另一种形式复活
         * （新字段管的是本地删除，方向正好相反）。
         */
        it("另一个开关不影响新字段（方向相反，不能混为一谈）", () => {
            expect(v4({ deleteLocalWhenRemoteDeleted: false }).images.deleteRemotePolicy).toBe("ask");
            expect(v4({ deleteLocalWhenRemoteDeleted: true }).images.deleteRemotePolicy).toBe("ask");
        });

        it("两个老字段都不会留在结果里（它们已经从类型里去掉）", () => {
            const settings = v4({
                deleteLocalWhenRemoteDeleted: true,
                deleteRemoteWhenLocalDeleted: true,
            });

            expect(Object.keys(settings.images)).not.toContain("deleteLocalWhenRemoteDeleted");
            expect(Object.keys(settings.images)).not.toContain("deleteRemoteWhenLocalDeleted");
        });
    });

    /**
     * v5 → v6：「问一句」从开关变成三态下拉。
     *
     * 两端都有对应物，所以**没有默认值丢失**：`false` 必须翻成 `never` 而不是
     * 回落默认的 `ask` —— 否则关掉过询问的用户会开始被弹窗追问他自己拒绝过的
     * 行为。
     */
    describe("v5 → v6 迁移（询问开关 → 三态下拉）", () => {
        function v5(images: Record<string, unknown>) {
            return normalizeSettings({ version: 5, images });
        }

        it("开关的两端各自接过来", () => {
            expect(v5({ askDeleteRemote: true }).images.deleteRemotePolicy).toBe("ask");
            expect(v5({ askDeleteRemote: false }).images.deleteRemotePolicy).toBe("never");
        });

        it("没写过这个字段（v5 默认就是问）时用默认值", () => {
            expect(v5({}).images.deleteRemotePolicy).toBe("ask");
        });

        it("字段是坏值时用默认值（data.json 可以手改）", () => {
            expect(v5({ askDeleteRemote: "yes" }).images.deleteRemotePolicy).toBe("ask");
            expect(v5({ askDeleteRemote: null }).images.deleteRemotePolicy).toBe("ask");
        });

        /**
         * 新字段已经写过值时不碰它。data.json 会随笔记仓库同步，两台设备版本
         * 不一致时旧字段只是残留 —— 此时听新字段的。
         */
        it("新字段已写过值时不动它（旧字段只是残留）", () => {
            const settings = v5({ deleteRemotePolicy: "always", askDeleteRemote: false });
            expect(settings.images.deleteRemotePolicy).toBe("always");
        });

        it("v4 数据先迁到 v5 再迁到 v6，两步都不丢", () => {
            // v4 的 `deleteRemoteWhenLocalDeleted: false` → v5 的「不问」→ v6 的 never。
            // 这条链是最可能被「一次只跑一个迁移」的写法剪断的地方。
            expect(
                normalizeSettings({
                    version: 4,
                    images: { deleteRemoteWhenLocalDeleted: false },
                }).images.deleteRemotePolicy
            ).toBe("never");
        });

        it("v5 数据不再被迁移覆盖（用户之后手动改过的值要留住）", () => {
            const settings = normalizeSettings({
                version: 5,
                images: { askDeleteRemote: false, deleteRemoteWhenLocalDeleted: true },
            });

            expect(settings.images.deleteRemotePolicy).toBe("never");
        });

        /**
         * 版本号是**写死的**：加迁移时这一步会红，逼人回来看一眼
         * 「新迁移接在所有旧迁移后面了吗」。
         *
         * 2026-10-02 从 6 提到 7（`migrateV6ToV7`：三个间隔合成一个「定时同步」周期），
         * 同一天又提到 8（`migrateV7ToV8`：图片那条「按周期同步」的开关从间隔里拆出来）。
         * 2026-10-06 提到 9（`migrateV8ToV9`：自身更新来源从自由地址换成「是否走 Gitee
         * 镜像」开关），同一天再提到 10（`migrateV9ToV10`：删掉「启用插件安装器」总开关）。
         * 每一个都必须排在它前面的那一个之后（与上面的链条用例同一个理由）。
         */
        it("版本号升到 10", () => {
            expect(SETTINGS_VERSION).toBe(10);
            expect(v5({}).version).toBe(10);
        });
    });
});
