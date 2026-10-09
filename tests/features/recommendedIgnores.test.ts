import { describe, expect, it } from "vitest";
import {
    localStateRules,
    matchesLocalState,
    mergeRecommendedRules,
    recommendedRules,
} from "../../src/features/sync/recommendedIgnores";

/**
 * 推荐忽略规则。
 *
 * 这个模块的两条硬要求，都来自「用户点了一次，之后不能出问题」：
 *
 * 1. **幂等** —— 用户可能在两台设备各点一次，也可能手滑连点两次。
 *    每次追加一遍会让 `.gitignore` 很快变得没法读，而它是用户要长期维护的文件。
 * 2. **不动已有内容** —— 用户自己写的规则（甚至别的工具写的）必须原样保留。
 *    覆盖掉那是数据损失，比少补一条严重得多。
 *
 * 另外几条用例盯着「大小写两条」与「不写死 .obsidian」这两个具体坑 ——
 * 它们都不会报错，只会在 Linux 上或改名配置目录之后静默失效。
 */

describe("recommendedRules", () => {
    it("字体规则大小写各一条 —— Linux 上只写小写会漏掉 .TTF", () => {
        const rules = recommendedRules({ configDir: ".obsidian", ignorePluginFolder: false });
        const font = rules.filter((entry) => entry.group === "font").map((entry) => entry.rule);

        expect(font).toContain("*.ttf");
        expect(font).toContain("*.TTF");
        expect(font).toContain("*.woff2");
        expect(font).toContain("*.WOFF2");
        // 5 个扩展名 × 大小写两条
        expect(font).toHaveLength(10);
    });

    it("默认**不**忽略插件目录 —— 那会改变换设备之后的体验", () => {
        // 默认忽略它 = 换设备 clone 之后插件不会自动就位。这是取舍，该由用户选。
        const rules = recommendedRules({ configDir: ".obsidian", ignorePluginFolder: false });

        expect(rules.some((entry) => entry.group === "pluginFolder")).toBe(false);
        expect(rules.map((entry) => entry.rule)).not.toContain(".obsidian/plugins/");
    });

    it("开关打开时按 vault.configDir 生成插件目录规则", () => {
        const rules = recommendedRules({ configDir: "my-config", ignorePluginFolder: true });

        expect(rules.map((entry) => entry.rule)).toContain("my-config/plugins/");
    });

    it("不写死 .obsidian —— 用户改了配置目录名也得匹配得上", () => {
        // 与 gitignoreTemplate 同一个坑：写死的话那条规则一条都匹配不上，
        // 表现是「明明配了忽略，插件目录还是被同步出去」。
        const rules = recommendedRules({ configDir: "我的配置", ignorePluginFolder: true });
        const lines = rules.map((entry) => entry.rule);

        expect(lines).toContain("我的配置/plugins/");
        expect(lines).not.toContain(".obsidian/plugins/");
    });

    it("Office 临时文件也列在里面（它们只制造噪音提交）", () => {
        const rules = recommendedRules({ configDir: ".obsidian", ignorePluginFolder: false });
        const office = rules.filter((entry) => entry.group === "officeTemp").map((entry) => entry.rule);

        expect(office).toContain("~$*");
    });
});

describe("mergeRecommendedRules", () => {
    const all = (ignorePluginFolder = false) =>
        recommendedRules({ configDir: ".obsidian", ignorePluginFolder });

    it("空的 .gitignore → 规则全部追加，末尾留一个换行", () => {
        const { content, added } = mergeRecommendedRules("", all());

        expect(added).toHaveLength(all().length);
        expect(content.endsWith("\n")).toBe(true);
        expect(content).toContain("*.ttf");
    });

    it("已有规则不重复添加 —— 幂等是硬要求", () => {
        const existing = "# 我的规则\n*.ttf\nnotes/\n";
        const { content, added } = mergeRecommendedRules(existing, all());

        // *.ttf 已经有了，只有 *.TTF 该补
        expect(content.match(/\*\.ttf\n/g)).toHaveLength(1);
        expect(added.map((entry) => entry.rule)).not.toContain("*.ttf");
        expect(added.map((entry) => entry.rule)).toContain("*.TTF");
    });

    it("用户自己写的内容一行都不动", () => {
        const existing = "# 我精心配的\n*.pdf\n!keep-this.pdf\n";
        const { content } = mergeRecommendedRules(existing, all());

        expect(content.startsWith(existing)).toBe(true);
    });

    it("连点两次：第二次一条都不加", () => {
        const first = mergeRecommendedRules("", all());
        const second = mergeRecommendedRules(first.content, all());

        expect(second.added).toEqual([]);
        expect(second.content).toBe(first.content);
    });

    it("尾部没有换行时先补一个，新规则不会和最后一行黏在一起", () => {
        const { content } = mergeRecommendedRules("*.pdf", all());

        expect(content.startsWith("*.pdf\n")).toBe(true);
        expect(content).not.toContain("*.pdf*.ttf");
    });

    it("added 带着分组回来 —— 界面要按类别说「补了哪几条、为什么」", () => {
        const { added } = mergeRecommendedRules("", all(true));

        const groups = new Set(added.map((entry) => entry.group));
        expect(groups).toEqual(new Set(["font", "officeTemp", "localState", "pluginFolder"]));
    });

    it("写法不同但含义相同的规则算「已经有了」（去斜杠后比较）", () => {
        // `.obsidian/plugins` 与 `.obsidian/plugins/` 对「忽略了吗」是同一个答案，
        // 不该因为末尾少一个斜杠就再补一条。
        const { added } = mergeRecommendedRules(".obsidian/plugins\n", all(true));

        expect(added.some((entry) => entry.group === "pluginFolder")).toBe(false);
    });
});

/**
 * 本地状态文件（2026-10-10）。
 *
 * 这一组存在的理由与其他组不同：字体与 Office 临时文件是**体积**问题，
 * 而这一组是**提交数**问题 —— 重写历史的开销只吃提交数，而 `workspace.json`
 * 这类文件每开关一个标签就变，留着它等于每个同步周期都白多一个提交。
 *
 * 所以用例要钉住两件事：规则**别写死 `.obsidian`**，以及判据**只认配置目录正下方
 * 那一层**（否则 `.obsidian/plugins/某插件/workspace.json` 会被误伤）。
 */
describe("localStateRules", () => {
    it("三个本机状态文件 + 位置缓存 glob，都跟着 configDir 走", () => {
        const rules = localStateRules(".obsidian");

        expect(rules).toContain(".obsidian/workspace.json");
        expect(rules).toContain(".obsidian/workspace-mobile.json");
        expect(rules).toContain(".obsidian/workspaces.json");
        expect(rules).toContain(".obsidian/*-position-cache.json");
        expect(rules).toHaveLength(4);
    });

    it("不写死 .obsidian —— 改了配置目录名也得匹配得上", () => {
        const rules = localStateRules("我的配置");

        expect(rules).toContain("我的配置/workspace.json");
        expect(rules.some((rule) => rule.startsWith(".obsidian/"))).toBe(false);
    });

    it("被 recommendedRules 收进 localState 组", () => {
        const rules = recommendedRules({ configDir: ".obsidian", ignorePluginFolder: false });
        const local = rules.filter((entry) => entry.group === "localState").map((entry) => entry.rule);

        expect(local).toContain(".obsidian/workspace.json");
        expect(local).toContain(".obsidian/*-position-cache.json");
    });

    it("**不**补尾斜杠 —— 补了会变成 workspace.json/ 而一条都匹配不上", () => {
        // `ignoreRuleFor` 是给**目录**用的（会补斜杠）。这一组是文件路径，
        // 走那条路会静默失效：规则加了，文件照样被提交。
        expect(localStateRules(".obsidian").some((rule) => rule.endsWith(".json/"))).toBe(false);
    });
});

describe("matchesLocalState", () => {
    it("认得出三个状态文件与位置缓存", () => {
        expect(matchesLocalState(".obsidian/workspace.json", ".obsidian")).toBe(true);
        expect(matchesLocalState(".obsidian/workspace-mobile.json", ".obsidian")).toBe(true);
        expect(matchesLocalState(".obsidian/workspaces.json", ".obsidian")).toBe(true);
        expect(matchesLocalState(".obsidian/md-razor-position-cache.json", ".obsidian")).toBe(true);
    });

    it("只认配置目录正下方那一层 —— 插件自己的同名文件不归这一组管", () => {
        // `.obsidian/plugins/x/workspace.json` 是插件的数据，归「插件目录」那一组。
        // 误伤它会让「停止跟踪本地状态文件」顺手摘掉别人插件的数据文件。
        expect(matchesLocalState(".obsidian/plugins/ziping/workspace.json", ".obsidian")).toBe(false);
        expect(matchesLocalState(".obsidian/plugins/ziping/x-position-cache.json", ".obsidian")).toBe(false);
    });

    it("不碰笔记与别的东西", () => {
        expect(matchesLocalState("notes/workspace.json", ".obsidian")).toBe(false);
        expect(matchesLocalState(".obsidian/appearance.json", ".obsidian")).toBe(false);
        expect(matchesLocalState(".obsidian/workspace.json", "我的配置")).toBe(false);
    });

    it("跟着 configDir 走", () => {
        expect(matchesLocalState("我的配置/workspace.json", "我的配置")).toBe(true);
    });
});
