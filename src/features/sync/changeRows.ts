import type { FileChangeStatus, RepoStatus } from "./types";

/**
 * 「有哪些文件变了、各自暂存了没有」。
 *
 * 抽出来是因为它现在有**两个**消费方，而两边的数字必须一致：
 *
 * - 仓库同步视图的文件列表（几行、每行什么状态）；
 * - 点「推送」而本地没有新提交时的那句提示 —— 要告诉用户「还有 N 个更改没有提交」，
 *   这个 N 必须与他在面板里看到的一致，否则他会以为插件在乱数。
 *
 * 两处各写一遍规则，就是那种「改了其中一处、另一处悄悄不对」的老问题。
 */

/** 更改列表里的一行。 */
export interface ChangeRow {
    path: string;
    status: FileChangeStatus;
    /** 已经在索引里 —— 点一下是「取消暂存」而不是「暂存」。 */
    staged: boolean;
    /**
     * 这一行在索引里记的是**嵌套仓库**（gitlink，模式 `160000`）。
     *
     * 面板据此换一套呈现：加「嵌套仓库」徽标、不给「查看差异 / 暂存」按钮
     * （对 gitlink 它们是空操作），改给「不再跟踪」——见 `SourceControlView`。
     */
    nestedRepo?: boolean;
}

/** 路径的扩展名（小写、不含点）；没有扩展名时返回空串。 */
export function extensionOf(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    // 开头的点不算扩展名（`.gitignore` 这类隐藏文件不该被当成「gitignore 格式」）
    if (dot <= 0) return "";
    return name.slice(dot + 1).toLowerCase();
}

/** Markdown 笔记的扩展名 —— 「笔记同步主要还是同步 md」那个主要诉求。 */
const MARKDOWN_EXTENSIONS = ["md", "markdown"];

/** 这一行是不是 Markdown 笔记。 */
export function isMarkdown(row: ChangeRow): boolean {
    return MARKDOWN_EXTENSIONS.includes(extensionOf(row.path));
}

/** 一行是否符合筛选（`filter` 为 `all` 时恒真）。 */
export function matchesFilter(row: ChangeRow, filter: string): boolean {
    if (filter === "all") return true;
    if (filter === "md") return isMarkdown(row);
    return extensionOf(row.path) === filter;
}

/**
 * 筛选下拉的选项：**由这次的改动生成**。
 *
 * 只有真实出现的格式才列出来 —— 固定一份清单的话，用户会看到一堆筛出空结果的入口。
 * `.md` 单独并成一条（`md` / `markdown` 都算），其余按扩展名各一条；无扩展名的文件
 * 归到 `(无扩展名)`。
 *
 * 顺序：全部 → Markdown → 其余按出现次数倒序（多的在前，最可能是他要找的）。
 */
export function changeFilterOptions(
    rows: ChangeRow[],
    labels: { all: (count: number) => string; markdown: (count: number) => string; noExtension: string }
): Array<{ value: string; label: string }> {
    const counts = new Map<string, number>();
    let markdown = 0;
    let noExtension = 0;

    for (const row of rows) {
        if (isMarkdown(row)) {
            markdown += 1;
            continue;
        }
        const extension = extensionOf(row.path);
        if (!extension) {
            noExtension += 1;
            continue;
        }
        counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }

    const options = [
        { value: "all", label: labels.all(rows.length) },
        ...(markdown > 0 ? [{ value: "md", label: labels.markdown(markdown) }] : []),
        ...[...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([extension, count]) => ({
                value: extension,
                label: `.${extension} (${count})`,
            })),
        ...(noExtension > 0
            ? [{ value: "no-extension", label: `${labels.noExtension} (${noExtension})` }]
            : []),
    ];

    return options;
}

/**
 * 更改列表里该显示的文件（含「已暂存吗」这一位）。
 *
 * 两处过滤，都是为了**同一个文件不要出现多次**：
 *
 * 1. **冲突文件滤掉。** 它们在 `git status` 里是 `UU`，于是 `mapStatus`
 *    会把它同时归进 `staged` 与 `unstaged`。不滤的话同一个冲突文件会出现三次：
 *    staged 一次、unstaged 一次、外加冲突区单独渲染的那一行。
 * 2. **按路径去重。** 「改了又暂存」的文件（`AM` / `MM`）两个状态位都非空，
 *    同样会进两个数组。列表是给人看的「有哪些文件变了」，
 *    同一个路径出现两遍只会让人以为有两处改动。
 *
 * 去重时**保留第一次出现的那个**（staged → unstaged → untracked 的顺序），
 * 于是「已暂存」优先 —— 与 `git status` 的阅读顺序一致。
 */
export function changeRows(status: RepoStatus): ChangeRow[] {
    const stagedPaths = new Set(status.staged.map((change) => change.path));
    const nestedPaths = new Set(status.nestedRepos ?? []);
    const seen = new Set<string>();
    const rows: ChangeRow[] = [];

    for (const change of [...status.staged, ...status.unstaged, ...status.untracked]) {
        if (change.status === "conflicted") continue;
        if (seen.has(change.path)) continue;
        seen.add(change.path);
        const row: ChangeRow = {
            path: change.path,
            status: change.status,
            staged: stagedPaths.has(change.path),
        };
        if (nestedPaths.has(change.path)) row.nestedRepo = true;
        rows.push(row);
    }

    return rows;
}
