import { describe, expect, it } from "vitest";
import {
    ROOT_DIRECTORY,
    parseBatchCheck,
    parseRevListObjects,
    summarizeHistory,
    topLevelOf,
    type ObjectInfo,
} from "../../src/features/sync/historyObjects";

/**
 * 体检的解析与汇总。
 *
 * 这一层是纯的，所以可以拿**真实形状的 git 输出**当 fixture 直接测 ——
 * 不用为了验「中文路径会不会被算错」去造一个几百 MB 的仓库。
 */

describe("parseRevListObjects", () => {
    it("提交对象没有路径，blob 与 tree 有", () => {
        // 真实输出里提交那一行**只有 sha**（没有第二个字段）。
        const output = ["9f2a", "a1b2 README.md", "c3d4 notes", "e5f6 notes/a.md"].join("\n");
        expect(parseRevListObjects(output)).toEqual([
            { sha: "9f2a" },
            { sha: "a1b2", path: "README.md" },
            { sha: "c3d4", path: "notes" },
            { sha: "e5f6", path: "notes/a.md" },
        ]);
    });

    it("只有 sha 的一行按「没有路径」解析", () => {
        // `git rev-list --objects` 对提交对象就只打 sha 一个字段。
        expect(parseRevListObjects("9f2a1b\n")).toEqual([{ sha: "9f2a1b" }]);
    });

    it("路径里的空格不会被切掉（按第一个空格切，而不是 split 全切）", () => {
        // 切错了路径就少一截，而那种错误在汇总里表现为「某个目录凭空少了几 MB」——
        // 不会报错，只会算错。
        expect(parseRevListObjects("a1b2 notes/我的 笔记.md")).toEqual([
            { sha: "a1b2", path: "notes/我的 笔记.md" },
        ]);
    });

    it("忽略空行与 CRLF 的回车", () => {
        expect(parseRevListObjects("a1b2 x.md\r\n\r\ne5f6 y.md\r\n")).toEqual([
            { sha: "a1b2", path: "x.md" },
            { sha: "e5f6", path: "y.md" },
        ]);
    });
});

describe("parseBatchCheck", () => {
    it("解析 sha / 类型 / 大小", () => {
        const map = parseBatchCheck("a1b2 blob 1234\n9f2a commit 250\nc3d4 tree 100\n");
        expect(map.get("a1b2")).toEqual({ type: "blob", bytes: 1234 });
        expect(map.get("9f2a")).toEqual({ type: "commit", bytes: 250 });
    });

    it("取不到的对象（`<sha> missing`）跳过，不影响其他行", () => {
        const map = parseBatchCheck("a1b2 missing\nc3d4 blob 10\n");
        expect(map.has("a1b2")).toBe(false);
        expect(map.get("c3d4")).toEqual({ type: "blob", bytes: 10 });
    });
});

describe("topLevelOf", () => {
    it("库根下的文件归到 `.`（与 normalizeFolders 同一约定）", () => {
        expect(topLevelOf("README.md")).toBe(ROOT_DIRECTORY);
        expect(ROOT_DIRECTORY).toBe(".");
    });

    it("多级路径取第一段", () => {
        expect(topLevelOf("a/b/c.md")).toBe("a");
        expect(topLevelOf("④忌-复原/附件/Fonts/x.ttf")).toBe("④忌-复原");
    });
});

describe("summarizeHistory", () => {
    const objects = new Map<string, ObjectInfo>([
        ["sha-commit", { type: "commit", bytes: 200 }],
        ["sha-tree", { type: "tree", bytes: 90 }],
        ["sha-md1", { type: "blob", bytes: 1000 }],
        ["sha-md2", { type: "blob", bytes: 500 }],
        ["sha-font1", { type: "blob", bytes: 30000 }],
        ["sha-font2", { type: "blob", bytes: 20000 }],
        ["sha-root", { type: "blob", bytes: 50 }],
    ]);

    const entries = [
        { sha: "sha-commit" },
        { sha: "sha-tree", path: "notes" },
        { sha: "sha-md1", path: "notes/a.md" },
        { sha: "sha-md2", path: "notes/b.md" },
        { sha: "sha-font1", path: "字体/大.ttf" },
        { sha: "sha-font2", path: "字体/小.ttf" },
        { sha: "sha-root", path: ".gitignore" },
    ];

    it("只统计 blob，tree 与 commit 不进目录账", () => {
        const summary = summarizeHistory(entries, objects);
        const notes = summary.directories.find((entry) => entry.path === "notes");
        // tree 的 90 字节**不该**算进来 —— 混进去只会让目录之间的差距变小、判断变糊。
        expect(notes).toEqual({ path: "notes", bytes: 1500, objects: 2, notes: 2 });
    });

    it("目录按体积降序，且顺序稳定", () => {
        const summary = summarizeHistory(entries, objects);
        expect(summary.directories.map((entry) => entry.path)).toEqual([
            "字体",
            "notes",
            ROOT_DIRECTORY,
        ]);
    });

    it("库根文件归到 `.` 这一行", () => {
        const summary = summarizeHistory(entries, objects);
        const root = summary.directories.find((entry) => entry.path === ROOT_DIRECTORY);
        expect(root).toEqual({ path: ROOT_DIRECTORY, bytes: 50, objects: 1, notes: 0 });
    });

    /**
     * 「这个目录里有几篇笔记」（2026-10-10，用户提问引出来的）。
     *
     * 用户问「清理完 .gitignore 多出目录，那以后这些目录岂不是不进同步了」——
     * 答案是「对」，而最危险的误操作是**勾一个装着笔记的目录**：那些笔记从此
     * 不再跟着 git 走，别的设备 clone 之后再也看不到。所以界面要在他勾之前
     * 就能说出「这里有 N 篇笔记」。
     *
     * 判据按**路径去重**：`entries` 是每个版本一条，直接数会把「改过 20 次的
     * 一篇笔记」报成 20 篇 —— 而用户想知道的是「有几篇」，不是「存了几份」。
     */
    it("notes 数的是「有几篇笔记」，同一篇的多个版本只算一篇", () => {
        const withVersions = [
            { sha: "sha-md1", path: "notes/a.md" },
            { sha: "sha-md2", path: "notes/a.md" },
            { sha: "sha-md2", path: "notes/b.canvas" },
            { sha: "sha-font1", path: "字体/大.ttf" },
            { sha: "sha-root", path: "README.md" },
        ];
        const summary = summarizeHistory(withVersions, objects);

        const notes = summary.directories.find((entry) => entry.path === "notes");
        // a.md 两个版本 → 1 篇；b.canvas → 1 篇；共 2 篇（而 objects 是 3）。
        expect(notes).toMatchObject({ notes: 2, objects: 3 });
        // 字体目录里没有笔记。
        expect(summary.directories.find((entry) => entry.path === "字体")).toMatchObject({
            notes: 0,
        });
        // 库根那一行的 README.md 也照数 —— 它不提供勾选，但账目要一致。
        expect(summary.directories.find((entry) => entry.path === ROOT_DIRECTORY)).toMatchObject({
            notes: 1,
        });
    });

    it("totalBytes 只算 blob；objectCount 是全部可达对象", () => {
        const summary = summarizeHistory(entries, objects);
        expect(summary.totalBytes).toBe(1000 + 500 + 30000 + 20000 + 50);
        // 7 条 entries = 1 commit + 1 tree + 5 blob —— 这是「对象多不多」那个问题。
        expect(summary.objectCount).toBe(7);
    });

    it("最大的单个对象按体积降序", () => {
        const summary = summarizeHistory(entries, objects);
        expect(summary.largest.map((entry) => entry.path)).toEqual([
            "字体/大.ttf",
            "字体/小.ttf",
            "notes/a.md",
            "notes/b.md",
            ".gitignore",
        ]);
    });

    it("认不出类型的对象不猜 —— 少一行好过编一行", () => {
        const summary = summarizeHistory([{ sha: "unknown", path: "x.md" }], objects);
        expect(summary.totalBytes).toBe(0);
        expect(summary.directories).toEqual([]);
    });

    it("topDirectories / topObjects 可以截断", () => {
        const summary = summarizeHistory(entries, objects, {
            topDirectories: 1,
            topObjects: 2,
        });
        expect(summary.directories).toHaveLength(1);
        expect(summary.directories[0]!.path).toBe("字体");
        expect(summary.largest).toHaveLength(2);
    });
});
