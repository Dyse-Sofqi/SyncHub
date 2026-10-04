import type { DiffLine } from "./diff";

/**
 * 双栏对照（side-by-side）的行配对 —— 与 VS Code 那种「左右各一栏」的差异视图同一个形状。
 *
 * ## 为什么需要一个纯函数
 *
 * `git diff` 给的是**一列**行：上下文的行同时属于两边，删除的行只属于旧文件，新增的行
 * 只属于新文件。要并排显示就得先决定「哪一行和哪一行同处一行」—— 这是纯逻辑，
 * 与 DOM 无关，所以单独放这里测（渲染那半边只负责画）。
 *
 * ## 配对规则（与 VS Code 的观感一致）
 *
 * - **上下文行**：左右各一份，同一行 ✓
 * - **一段改动**（连续的删/增）：把这段里的删除按顺序放左栏、新增按顺序放右栏，
 *   然后**按序号对齐**；短的那一边补空单元格。
 *   于是「删 2 行、增 3 行」会得到 3 行：前两行左右都有，第三行只有右边 ✓
 *   —— 一眼就能看出「多出来的是哪一行」。
 * - `\ No newline`（文件末尾没有换行）**两边都显示**：它说的是两个文件各自的性质，
 *   放在某一栏会让人以为只跟那一边有关。
 *
 * 连续段里删与增**交错**出现（某些 diff 算法会这样）也按同一规则处理：先各自收集，
 * 再按序号配对 —— 不依赖它们谁先出现。
 */
export interface SideBySideRow {
    /** 左栏（旧文件）这一行；空单元格时为 `null`。 */
    left: DiffLine | null;
    /** 右栏（新文件）这一行；空单元格时为 `null`。 */
    right: DiffLine | null;
}

export function sideBySideRows(lines: DiffLine[]): SideBySideRow[] {
    const rows: SideBySideRow[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        if (!line) break;

        if (line.kind === "context" || line.kind === "no-newline") {
            rows.push({ left: line, right: line });
            index += 1;
            continue;
        }

        // 一段连续的改动：把删/增各自收集起来，再按序号配对。
        const deletions: DiffLine[] = [];
        const additions: DiffLine[] = [];
        while (index < lines.length) {
            const current = lines[index];
            if (!current) break;
            if (current.kind === "del") deletions.push(current);
            else if (current.kind === "add") additions.push(current);
            else break;
            index += 1;
        }

        const pairs = Math.max(deletions.length, additions.length);
        for (let i = 0; i < pairs; i += 1) {
            rows.push({ left: deletions[i] ?? null, right: additions[i] ?? null });
        }
    }

    return rows;
}
