import { describe, expect, it } from "vitest";
import {
    findLargeFiles,
    pendingFilesForCommit,
    pickLargeFiles,
    thresholdBytesFromMb,
} from "../../src/features/sync/largeFiles";
import type { FileChange, RepoStatus } from "../../src/features/sync/types";

/**
 * 「哪些文件大得该问一句」。
 *
 * 这个模块的价值全在**时机**上：git 的历史不可逆，事后清理要重写全部提交
 * （本插件明确不做）。所以它是唯一来得及的一步，判错的代价是双向的：
 *
 * - 漏报（该拦的没拦）→ 大文件进了历史，之后只能重写仓库；
 * - 误报（不该拦的拦了）→ 每次提交都弹窗，用户很快学会无脑点「仍然提交」，
 *   防护就名存实亡。
 *
 * 所以下面的用例集中在边界上：阈值本身、取不到大小的文件、以及
 * 「已跟踪 / 未跟踪」这一位（它决定退出跟踪时要不要 `git rm --cached`，猜错会报错）。
 */

function change(path: string, status: FileChange["status"]): FileChange {
    return { path, status };
}

function status(partial: Partial<RepoStatus>): RepoStatus {
    return {
        branch: "main",
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        ahead: 0,
        behind: 0,
        ...partial,
    };
}

describe("pendingFilesForCommit", () => {
    it("汇总三类变更并去重", () => {
        const files = pendingFilesForCommit(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("a.md", "modified"), change("b.md", "modified")],
                untracked: [change("c.md", "untracked")],
            })
        );

        expect(files.map((file) => file.path)).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("untracked 的文件标成「未跟踪」—— 它们不需要 rm --cached", () => {
        // 对不存在的索引项执行 git rm --cached 会直接报错（did not match any files）。
        const files = pendingFilesForCommit(
            status({
                unstaged: [change("已跟踪.md", "modified")],
                untracked: [change("新文件.md", "untracked")],
            })
        );

        const byPath = new Map(files.map((file) => [file.path, file.tracked]));
        expect(byPath.get("已跟踪.md")).toBe(true);
        expect(byPath.get("新文件.md")).toBe(false);
    });

    it("冲突文件不参与 —— 有冲突时根本不该走到提交", () => {
        const files = pendingFilesForCommit(
            status({
                staged: [change("会打架.md", "conflicted")],
                unstaged: [change("会打架.md", "conflicted"), change("正常.md", "modified")],
                conflicted: ["会打架.md"],
            })
        );

        expect(files.map((file) => file.path)).toEqual(["正常.md"]);
    });

    it("干净仓库返回空", () => {
        expect(pendingFilesForCommit(status({}))).toEqual([]);
    });
});

describe("pickLargeFiles", () => {
    const MB = 1024 * 1024;

    it("超过阈值的才入选，正好等于阈值的不算", () => {
        // 文案说的是「超过 N MB」。设成 5 却拦住一个正好 5.00 MB 的文件，
        // 会让用户觉得这个数字说了不算。
        const picked = pickLargeFiles(
            [
                { path: "正好.bin", bytes: 5 * MB, tracked: true },
                { path: "超了.bin", bytes: 5 * MB + 1, tracked: true },
                { path: "很小.md", bytes: 1024, tracked: true },
            ],
            5 * MB
        );

        expect(picked.map((file) => file.path)).toEqual(["超了.bin"]);
    });

    it("按大小降序 —— 先看最占地方的那个", () => {
        const picked = pickLargeFiles(
            [
                { path: "中.bin", bytes: 20 * MB, tracked: true },
                { path: "大.bin", bytes: 80 * MB, tracked: true },
                { path: "小.bin", bytes: 10 * MB, tracked: true },
            ],
            5 * MB
        );

        expect(picked.map((file) => file.path)).toEqual(["大.bin", "中.bin", "小.bin"]);
    });

    it("同样大按路径 —— 顺序必须稳定，两次打开不能变", () => {
        const picked = pickLargeFiles(
            [
                { path: "b.bin", bytes: 10 * MB, tracked: true },
                { path: "a.bin", bytes: 10 * MB, tracked: true },
            ],
            5 * MB
        );

        expect(picked.map((file) => file.path)).toEqual(["a.bin", "b.bin"]);
    });

    it("非有限数不参与（NaN / Infinity 不该冒出来）", () => {
        const picked = pickLargeFiles(
            [
                { path: "nan.bin", bytes: Number.NaN, tracked: true },
                { path: "inf.bin", bytes: Number.POSITIVE_INFINITY, tracked: true },
                { path: "正常.bin", bytes: 10 * MB, tracked: true },
            ],
            5 * MB
        );

        expect(picked.map((file) => file.path)).toEqual(["正常.bin"]);
    });

    it("保留「是否已跟踪」这一位", () => {
        const picked = pickLargeFiles([{ path: "新来的.bin", bytes: 10 * MB, tracked: false }], 5 * MB);

        expect(picked[0]!.tracked).toBe(false);
    });

    it("没有超标的文件时返回空数组（不是 undefined）", () => {
        expect(pickLargeFiles([{ path: "a.md", bytes: 100, tracked: true }], 5 * MB)).toEqual([]);
    });
});

describe("findLargeFiles", () => {
    const MB = 1024 * 1024;

    it("取不到大小的文件跳过 —— 删除的文件本来就不增加体积", async () => {
        const sizes = new Map<string, number | undefined>([
            ["在的.bin", 30 * MB],
            ["已删.bin", undefined],
        ]);

        const found = await findLargeFiles(
            [
                { path: "在的.bin", tracked: true },
                { path: "已删.bin", tracked: true },
            ],
            async (path) => sizes.get(path),
            5 * MB
        );

        expect(found.map((file) => file.path)).toEqual(["在的.bin"]);
    });

    it("0 字节的文件跳过", async () => {
        const found = await findLargeFiles(
            [{ path: "空.bin", tracked: true }],
            async () => 0,
            5 * MB
        );

        expect(found).toEqual([]);
    });

    it("按顺序逐个取大小（串行，不并发打满文件系统）", async () => {
        const order: string[] = [];
        await findLargeFiles(
            [
                { path: "a.bin", tracked: true },
                { path: "b.bin", tracked: true },
                { path: "c.bin", tracked: true },
            ],
            async (path) => {
                order.push(path);
                return 1024;
            },
            5 * MB
        );

        expect(order).toEqual(["a.bin", "b.bin", "c.bin"]);
    });
});

describe("thresholdBytesFromMb", () => {
    it("MB → 字节", () => {
        expect(thresholdBytesFromMb(5)).toBe(5 * 1024 * 1024);
        expect(thresholdBytesFromMb(0.5)).toBe(524288);
    });
});
