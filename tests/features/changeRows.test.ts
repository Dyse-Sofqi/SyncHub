import { describe, expect, it } from "vitest";
import {
    changeFilterOptions,
    changeRows,
    extensionOf,
    isMarkdown,
    matchesFilter,
} from "../../src/features/sync/changeRows";
import type { FileChange, RepoStatus } from "../../src/features/sync/types";

/**
 * 更改列表的**内容与顺序**。
 *
 * 它现在有两个消费方，而两边的数字必须一致：
 *
 * 1. 仓库同步视图的文件列表；
 * 2. 点「推送」而本地没有新提交时的那句提示（「你有 N 个更改还没提交」）——
 *    N 与用户在面板里看到的不一样，他就会以为插件在乱数。
 *
 * 所以规则只有这一份，两个消费方都从这里取。
 *
 * 抽成纯函数还有一个理由：这类「列表里多了一项 / 少了一项」的问题读代码很难发现，
 * 而视图要做 DOM 级断言代价太高。
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

describe("changeRows", () => {
    it("普通变更按 staged / unstaged / untracked 汇总", () => {
        const rows = changeRows(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("b.md", "modified")],
                untracked: [change("c.md", "untracked")],
            })
        );

        expect(rows.map((row) => row.path)).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("**冲突文件不出现在变更列表里**（它由调用方单独渲染）", () => {
        // 模拟真实状态：冲突文件同时被算进 staged 与 unstaged
        const rows = changeRows(
            status({
                staged: [change("notes/会打架.md", "conflicted")],
                unstaged: [change("notes/会打架.md", "conflicted")],
                conflicted: ["notes/会打架.md"],
            })
        );

        expect(rows).toEqual([]);
    });

    it("冲突与普通变更并存时，只滤掉冲突", () => {
        const rows = changeRows(
            status({
                staged: [change("notes/会打架.md", "conflicted"), change("a.md", "added")],
                unstaged: [change("notes/会打架.md", "conflicted")],
                untracked: [change("b.md", "untracked")],
                conflicted: ["notes/会打架.md"],
            })
        );

        expect(rows.map((row) => row.path)).toEqual(["a.md", "b.md"]);
    });

    it("干净仓库返回空", () => {
        expect(changeRows(status({}))).toEqual([]);
    });

    it("「改了又暂存」的文件（AM / MM）只显示一次", () => {
        // mapStatus 按 git status 的两位状态位分别归类，AM/MM 的文件
        // 两个位都非空 → 同时进 staged 与 unstaged。列表是给人看的
        // 「有哪些文件变了」，同一个路径出现两遍会让人以为有两处改动。
        const rows = changeRows(
            status({
                staged: [change("a.md", "added"), change("b.md", "modified")],
                unstaged: [change("b.md", "modified")],
            })
        );

        expect(rows.map((row) => row.path)).toEqual(["a.md", "b.md"]);
    });

    it("保留第一次出现的那个（staged 优先）", () => {
        const rows = changeRows(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("a.md", "modified")],
            })
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe("added");
    });

    it("标出「已暂存」，未暂存与未跟踪都是 false", () => {
        // 这一位决定那一行给的是「暂存」还是「取消暂存」按钮 —— 反了会让
        // 用户点了之后文件往相反的方向动。
        const rows = changeRows(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("b.md", "modified")],
                untracked: [change("c.md", "untracked")],
            })
        );

        expect(rows.map((row) => row.staged)).toEqual([true, false, false]);
    });

    it("去重不影响不同路径的文件", () => {
        const rows = changeRows(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("b.md", "modified")],
                untracked: [change("c.md", "untracked")],
            })
        );

        expect(rows.map((row) => row.path)).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("数量就是「还有几个更改没提交」的那个数", () => {
        // 「推送」的提示直接用它 —— 用户会拿这个数和面板里的列表对着看。
        const rows = changeRows(
            status({
                staged: [change("a.md", "added")],
                unstaged: [change("a.md", "modified"), change("b.md", "modified")],
                untracked: [change("c.md", "untracked")],
                conflicted: ["notes/会打架.md"],
            })
        );

        expect(rows).toHaveLength(3);
    });
});

/**
 * 格式筛选（2026-10-04 用户要求「更改列表提供修改文件的格式筛选，尤其是 md」）。
 *
 * 这一组是**纯函数**的用例：面板那边只负责把选项画出来并把选中的值传回来。
 */
describe("扩展名与筛选", () => {
    const labels = {
        all: (count: number) => `全部 (${count})`,
        markdown: (count: number) => `Markdown (${count})`,
        noExtension: "无扩展名",
    };

    function row(path: string): { path: string; status: "modified"; staged: boolean } {
        return { path, status: "modified", staged: false };
    }

    it("extensionOf：小写、去点；隐藏文件不算扩展名", () => {
        expect(extensionOf("notes/A.md")).toBe("md");
        expect(extensionOf("attachments/图.PNG")).toBe("png");
        expect(extensionOf("a/b/c.canvas")).toBe("canvas");
        // `.gitignore` 的「扩展名」不是 gitignore —— 开头的点不算
        expect(extensionOf(".gitignore")).toBe("");
        expect(extensionOf("notes/README")).toBe("");
        // 目录里的点不该被当成分隔符
        expect(extensionOf("notes/2026.10/daily")).toBe("");
    });

    it("isMarkdown：md 与 markdown 都算，别的都不算", () => {
        expect(isMarkdown(row("a.md"))).toBe(true);
        expect(isMarkdown(row("a.MARKDOWN"))).toBe(true);
        expect(isMarkdown(row("a.canvas"))).toBe(false);
        expect(isMarkdown(row("a.mdx"))).toBe(false);
    });

    it("matchesFilter：all 恒真，md 只挑笔记，扩展名精确匹配", () => {
        expect(matchesFilter(row("a.png"), "all")).toBe(true);
        expect(matchesFilter(row("a.md"), "md")).toBe(true);
        expect(matchesFilter(row("a.png"), "md")).toBe(false);
        expect(matchesFilter(row("a.png"), "png")).toBe(true);
        expect(matchesFilter(row("a.PNG"), "png")).toBe(true);
        expect(matchesFilter(row("a.md"), "png")).toBe(false);
    });

    it("选项只列真实出现的格式，.md 并成一条，其余按数量倒序", () => {
        const options = changeFilterOptions(
            [
                row("笔记.md"),
                row("另一篇.markdown"),
                row("图.png"),
                row("图2.png"),
                row("图3.png"),
                row("data.json"),
                row("LICENSE"),
            ],
            labels
        );

        expect(options).toEqual([
            { value: "all", label: "全部 (7)" },
            { value: "md", label: "Markdown (2)" },
            { value: "png", label: ".png (3)" },
            { value: "json", label: ".json (1)" },
            { value: "no-extension", label: "无扩展名 (1)" },
        ]);
    });

    it("没有笔记时**不出现** Markdown 选项（不给筛出空结果的入口）", () => {
        const options = changeFilterOptions([row("图.png")], labels);

        expect(options.map((option) => option.value)).toEqual(["all", "png"]);
    });

    it("数量相同按扩展名字母序 —— 顺序要稳定，不能随 Map 插入顺序抖", () => {
        const options = changeFilterOptions([row("a.png"), row("b.json")], labels);

        expect(options.map((option) => option.label)).toEqual(["全部 (2)", ".json (1)", ".png (1)"]);
    });
});
