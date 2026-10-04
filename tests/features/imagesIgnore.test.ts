import { describe, expect, it } from "vitest";
import {
    extensionIgnoreRules,
    ignoreRuleFor,
    isImagePath,
    mergeIgnoreRules,
    mergeRuleLines,
} from "../../src/features/sync/imagesIgnore";

/**
 * `.gitignore` 的合并规则（纯函数）。
 *
 * 这一层值得单独测，因为它错起来是**静默**的：幂等没做对 → 用户每点一次就多几行
 * （文件很快没法读）；「已忽略」判断反了 → 以为加过了其实没有，图片照旧进 git。
 * 两种错都不会报错、也不会让功能「看起来坏掉」，只会在仓库里慢慢积出来。
 */
describe("图片文件夹并进 .gitignore", () => {
    it("规则给文件夹加结尾斜杠（只匹配目录，不连带同名文件）", () => {
        expect(ignoreRuleFor("attachments")).toBe("attachments/");
        expect(ignoreRuleFor("assets/img")).toBe("assets/img/");
    });

    it("空内容时写出规则并以换行收尾", () => {
        const result = mergeIgnoreRules("", ["attachments"]);
        expect(result.content).toBe("attachments/\n");
        expect(result.added).toEqual(["attachments/"]);
    });

    it("已有内容末尾没有换行时先补一个（否则会和最后一行黏在一起）", () => {
        const result = mergeIgnoreRules(".trash/", ["attachments"]);
        expect(result.content).toBe(".trash/\nattachments/\n");
    });

    it("已有内容以换行收尾时直接追加，不产生空行", () => {
        const result = mergeIgnoreRules(".trash/\n", ["attachments"]);
        expect(result.content).toBe(".trash/\nattachments/\n");
    });

    it("已经忽略过的文件夹不再追加，added 为空（幂等）", () => {
        const result = mergeIgnoreRules("attachments/\n", ["attachments"]);
        expect(result.added).toEqual([]);
        expect(result.content).toBe("attachments/\n");
    });

    it("同一件事的另一种写法也算已忽略（/attachments、attachments）", () => {
        expect(mergeIgnoreRules("/attachments\n", ["attachments"]).added).toEqual([]);
        expect(mergeIgnoreRules("attachments\n", ["attachments"]).added).toEqual([]);
        // 两边都不带斜杠的写法同样认
        expect(mergeIgnoreRules("  attachments/  \n", ["attachments"]).added).toEqual([]);
    });

    it("用户手写的通配符规则不会误判成「已忽略」", () => {
        // `attach*` 匹配得上，但这一层不做推导 —— 宁可多写一行冗余规则。
        // 反过来（以为忽略过、其实没有）才是要命的错。
        expect(mergeIgnoreRules("attach*\n", ["attachments"]).added).toEqual(["attachments/"]);
    });

    it("多个文件夹只加缺的那些", () => {
        const result = mergeIgnoreRules(".trash/\nassets/img/\n", [
            "assets/img",
            "attachments",
            "photos",
        ]);
        expect(result.added).toEqual(["attachments/", "photos/"]);
        expect(result.content).toBe(".trash/\nassets/img/\nattachments/\nphotos/\n");
    });

    it("「整个库」（空串）被跳过 —— 忽略整个库等于什么都不同步", () => {
        const result = mergeIgnoreRules(".trash/\n", ["", "attachments"]);
        expect(result.added).toEqual(["attachments/"]);
    });

    it("全是空串时什么都不做，内容原样返回", () => {
        const result = mergeIgnoreRules(".trash/\n", [""]);
        expect(result.added).toEqual([]);
        expect(result.content).toBe(".trash/\n");
    });

    it("同一个文件夹在一批里出现两次也只写一行", () => {
        const result = mergeIgnoreRules("", ["attachments", "attachments"]);
        expect(result.added).toEqual(["attachments/"]);
    });
});

/**
 * 「按扩展名」那一套（2026-10-02 用户问「.gitignore 只能写文件夹吗？不能写图片格式吗」之后加的）。
 *
 * 三点都是踩过或**实测**过的，不是想当然：
 * 1. 花括号**不被支持**（实测 `*.{png,webp}` 一条都不命中）→ 一个扩展名一条规则；
 * 2. 大小写各写一条（Linux 上 git 真的区分大小写，只写小写会漏掉 `cover.PNG`）；
 * 3. 筛已跟踪文件用**不区分大小写**的比较 —— 与上面那条正好互补。
 */
describe("图片扩展名并进 .gitignore", () => {
    it("一个扩展名两条规则：小写与大写", () => {
        expect(extensionIgnoreRules(["png", "webp"])).toEqual([
            "*.png",
            "*.PNG",
            "*.webp",
            "*.WEBP",
        ]);
    });

    it("传进来的扩展名已经是大写也不会重复出三条", () => {
        expect(extensionIgnoreRules(["PNG"])).toEqual(["*.png", "*.PNG"]);
    });

    it("不用花括号（gitignore 的 wildmatch 不支持展开）", () => {
        const rules = extensionIgnoreRules(["png", "jpg"]);
        expect(rules.some((rule) => rule.includes("{"))).toBe(false);
    });

    it("isImagePath 不区分大小写，且只看扩展名", () => {
        const extensions = ["png", "jpg"];
        expect(isImagePath("attachments/a.png", extensions)).toBe(true);
        expect(isImagePath("cover.PNG", extensions)).toBe(true);
        expect(isImagePath("notes/photo.JPG", extensions)).toBe(true);
        expect(isImagePath("notes/note.md", extensions)).toBe(false);
        // 没有扩展名 / 只是名字里带点，都不是图片
        expect(isImagePath("notes/README", extensions)).toBe(false);
        expect(isImagePath("a.png/note.md", extensions)).toBe(false);
    });

    it("扩展名规则走同一套合并逻辑（幂等 + 只追加缺的）", () => {
        const first = mergeRuleLines("", extensionIgnoreRules(["png"]));
        expect(first.added).toEqual(["*.png", "*.PNG"]);

        const second = mergeRuleLines(first.content, extensionIgnoreRules(["png"]));
        expect(second.added).toEqual([]);
        expect(second.content).toBe(first.content);

        // 再加一个格式：只补新的两条
        const third = mergeRuleLines(first.content, extensionIgnoreRules(["png", "svg"]));
        expect(third.added).toEqual(["*.svg", "*.SVG"]);
    });
});
