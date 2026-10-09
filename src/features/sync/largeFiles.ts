/**
 * 「这次要提交的文件里，哪些大得该问一句」—— 「别让大文件进 git」的第二层。
 *
 * ## 为什么光有 .gitignore 不够
 *
 * 忽略规则只能挡住**已经想到的**类型（`recommendedIgnores.ts` 那几类）。
 * 而真正把仓库撑起来的东西往往是意料之外的：某个插件的向量库缓存、
 * 一段录屏、一个几百 MB 的 PDF、用户自己写的数据库文件。
 * 它们第一次进 git 时没有任何提示，等到发现仓库已经几百 MB 就晚了 ——
 * **git 的历史是不可逆的**，事后清理要重写全部提交（本插件明确不做）。
 *
 * 所以这一层的作用是「在它进历史之前问一句」。这是唯一来得及的时机。
 *
 * ## 为什么按「大小」而不是按「类型」判
 *
 * 按类型判需要一张不断增长的清单（而且永远追不上新插件）。按大小判只需要一个数字，
 * 而且**用户自己就能理解**：超过这个大小的文件，值得单独确认一次。
 * 类型信息（扩展名）留给界面做展示，不参与判断。
 *
 * ## 为什么要标出「是否已跟踪」
 *
 * 退出跟踪那一步对两种文件做法不同：
 * - **已跟踪**：要 `git rm --cached` 把它从索引里摘掉，否则下一次 `git add -A`
 *   会把它加回来（这正是它当初进索引的方式）；
 * - **未跟踪**：对不存在的索引项执行 `git rm --cached` 会直接报错
 *   （`did not match any files`），它只需要一条忽略规则。
 *
 * 把这一位算清楚放在结果里，调用方就不用再去猜 —— 猜错的那一侧是报错。
 */

import type { RepoStatus } from "./types";

/** 一个「大得该问一句」的待提交文件。 */
export interface LargePendingFile {
    path: string;
    bytes: number;
    /** 已在 git 索引里（决定退出跟踪时要不要 `git rm --cached`）。 */
    tracked: boolean;
}

/** 待提交的文件 + 它是否已被跟踪。 */
export interface PendingFile {
    path: string;
    tracked: boolean;
}

/**
 * 从仓库状态里取出「这次要提交的文件」以及各自是否已跟踪。
 *
 * 去重规则与 `changeRows` 一致（同一个文件可能同时出现在 `staged` 与 `unstaged` 里：
 * `mapStatus` 按 `git status` 的两位状态位分别归类，`AM` / `MM` 的文件两个位都非空）。
 * 冲突文件不参与 —— 有冲突时根本不该走到提交这一步（`doCommitAll` 会先拦住）。
 *
 * 这里与 `changeRows` 不合并成一个函数：那个要的是「给用户看的行」（含状态、嵌套仓库
 * 标记），这个要的是「提交会带上哪些路径」。两者的**去重规则必须一致**，
 * 所以顺序与集合的取法刻意写成同一套。
 */
export function pendingFilesForCommit(status: RepoStatus): PendingFile[] {
    const untracked = new Set(status.untracked.map((change) => change.path));
    const paths = [
        ...new Set(
            [...status.staged, ...status.unstaged, ...status.untracked]
                .filter((change) => change.status !== "conflicted")
                .map((change) => change.path)
        ),
    ];

    return paths.map((path) => ({ path, tracked: !untracked.has(path) }));
}

/**
 * 挑出超过阈值的文件（纯函数：不碰文件系统，便于单测）。
 *
 * 用 `>` 而不是 `>=`：文案说的是「超过 N MB」，那么正好等于 N MB 的文件就不该被点名 ——
 * 否则用户把阈值设成 5、一个 5.00 MB 的文件被拦下，他会觉得这个数字说了不算。
 *
 * 排序：**大的在前**，同样大按路径。用户点开这个清单是想先看最占地方的那个，
 * 而且顺序必须稳定（同一个列表两次打开顺序不同会让人以为内容变了）。
 */
export function pickLargeFiles(
    entries: ReadonlyArray<{ path: string; bytes: number; tracked: boolean }>,
    thresholdBytes: number
): LargePendingFile[] {
    return entries
        .filter((entry) => Number.isFinite(entry.bytes) && entry.bytes > thresholdBytes)
        .map((entry) => ({ path: entry.path, bytes: entry.bytes, tracked: entry.tracked }))
        .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

/**
 * 取每个待提交文件的大小，再挑出超过阈值的那些。
 *
 * `statSize` 取不到大小（文件刚被删、读不了）时返回 undefined —— 那部分直接跳过。
 * 删除的文件本来就不增加体积，而「读不了」也不该让整条提交链路失败。
 *
 * **串行**而不是 `Promise.all`：一次改动可能涉及上千个文件，同时发上千个 stat
 * 会把文件系统打满（与 `sumFileBytes` 同一个理由），而这里没有任何实时性要求。
 */
export async function findLargeFiles(
    files: ReadonlyArray<PendingFile>,
    statSize: (path: string) => Promise<number | undefined>,
    thresholdBytes: number
): Promise<LargePendingFile[]> {
    const entries: Array<{ path: string; bytes: number; tracked: boolean }> = [];

    for (const file of files) {
        const bytes = await statSize(file.path);
        if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) continue;
        entries.push({ path: file.path, bytes, tracked: file.tracked });
    }

    return pickLargeFiles(entries, thresholdBytes);
}

/** 阈值（MB）→ 字节。设置项存的是人能读的 MB。 */
export function thresholdBytesFromMb(megabytes: number): number {
    return megabytes * 1024 * 1024;
}
