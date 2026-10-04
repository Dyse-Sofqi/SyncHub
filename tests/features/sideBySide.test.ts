import { describe, expect, it } from "vitest";
import { sideBySideRows } from "../../src/features/sync/sideBySide";
import type { DiffLine } from "../../src/features/sync/diff";

/**
 * 双栏对照的**配对规则**（2026-10-04 加，用户要求「类似 vscode 那种双栏对照」）。
 *
 * `git diff` 给的是一列行，并排显示要先决定「谁和谁同处一行」—— 这是纯逻辑，
 * 所以单独测；渲染那半边只管画。
 */

function context(oldLine: number, newLine: number, text = "上下文"): DiffLine {
    return { kind: "context", text, oldLine, newLine };
}

function del(oldLine: number, text = "删掉的"): DiffLine {
    return { kind: "del", text, oldLine, newLine: null };
}

function add(newLine: number, text = "新增的"): DiffLine {
    return { kind: "add", text, oldLine: null, newLine };
}

/** 只取左右两侧的「标记」，方便断言（`+` / `-` / 空格 / `∅`）。 */
function marks(lines: DiffLine[]): string[] {
    return sideBySideRows(lines).map((row) => {
        const mark = (line: DiffLine | null): string =>
            line === null ? "∅" : line.kind === "add" ? "+" : line.kind === "del" ? "-" : "=";
        return `${mark(row.left)}|${mark(row.right)}`;
    });
}

describe("sideBySideRows", () => {
    it("上下文行左右各一份", () => {
        expect(marks([context(1, 1)])).toEqual(["=|="]);
    });

    it("纯删除：右栏补空，不会把后面的行挤上来", () => {
        expect(marks([del(1), del(2)])).toEqual(["-|∅", "-|∅"]);
    });

    it("纯新增：左栏补空", () => {
        expect(marks([add(1), add(2)])).toEqual(["∅|+", "∅|+"]);
    });

    it("删 2 增 2：成对并排（这才是双栏的意义）", () => {
        expect(marks([del(1), del(2), add(1), add(2)])).toEqual(["-|+", "-|+"]);
    });

    it("删 2 增 3：多出来的那一行**只有右栏**（一眼看出新增了哪一行）", () => {
        expect(marks([del(1), del(2), add(1), add(2), add(3)])).toEqual([
            "-|+",
            "-|+",
            "∅|+",
        ]);
    });

    it("删 3 增 1：多出来的那两行只有左栏", () => {
        expect(marks([del(1), del(2), del(3), add(1)])).toEqual(["-|+", "-|∅", "-|∅"]);
    });

    it("删增交错出现也按同一规则配对（不依赖谁先出现）", () => {
        expect(marks([del(1), add(1), del(2), add(2)])).toEqual(["-|+", "-|+"]);
    });

    it("一段改动前后的上下文各归各位（分段不会串行）", () => {
        expect(marks([context(1, 1), del(2), add(2), context(3, 3)])).toEqual([
            "=|=",
            "-|+",
            "=|=",
        ]);
    });

    it("行号各取一边：左栏用旧号、右栏用新号", () => {
        const rows = sideBySideRows([del(7), add(9)]);

        expect(rows[0]!.left!.oldLine).toBe(7);
        expect(rows[0]!.left!.newLine).toBeNull();
        expect(rows[0]!.right!.newLine).toBe(9);
        expect(rows[0]!.right!.oldLine).toBeNull();
    });

    it("`\\ No newline` 两边都显示（它说的是两个文件各自的性质）", () => {
        const note: DiffLine = {
            kind: "no-newline",
            text: "（此文件末尾没有换行）",
            oldLine: null,
            newLine: null,
        };

        expect(sideBySideRows([note])).toEqual([{ left: note, right: note }]);
    });

    it("空输入给空结果（没有 hunk 的文件不该凭空多出一行）", () => {
        expect(sideBySideRows([])).toEqual([]);
    });
});
