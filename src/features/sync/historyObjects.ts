/**
 * 「这个仓库的空间到底被什么占了」—— 清理能力的**第一层：体检**。
 *
 * ## 为什么需要体检
 *
 * 用户在「清理」这件事上最缺的不是按钮，而是**判断依据**：该剔哪个目录、剔了能省多少。
 * 光看「仓库 460 MB」这个数字没法做决定 —— 实测里那 460 MB 是插件构建产物 319 MB、
 * 字体 186 MB、向量库缓存 84 MB 凑出来的，而真正的 markdown 只有 63 MB。
 * 三者剔掉哪一个、还是都剔，是三个完全不同的决定。
 *
 * ## 为什么按「顶层目录」汇总
 *
 * 因为**剔除的单位就是路径**：`git rm -r --cached -- <path>` 的粒度是目录。
 * 按目录汇总，报告里的每一行就正好是一个可以拿去执行的动作 ——
 * 这比「最大的 20 个文件」有用得多（后者剔起来还得一个个挑）。
 *
 * 根目录下的文件归到 `.` 这一行（与 `normalizeFolders` 的约定一致）——
 * 它们通常是 README / .gitignore 这类小文件，**不提供勾选**，只是让账目对得上。
 *
 * ## 为什么按对象算而不是按文件算
 *
 * 同一个文件改 100 次就是 100 个对象（git 每次存一份完整内容），
 * 「这个目录有几个文件」回答不了「它占了多少」。所以这里统计的是
 * **出现过的 blob 对象**，`objects` 那个字段是对象数而不是文件数 ——
 * 一个 8 MB 的 `main.js` 存了 22 个版本，账面上就是 22 个对象。
 *
 * ## 这些函数全是纯的
 *
 * git 的输出由调用方取（见 `SimpleGitManager.historyObjects`），这里只解析与汇总 ——
 * 于是「怎么读 git 的输出」可以被单测钉死，而不用真造一个几百 MB 的仓库。
 */

/** 历史里的一个 blob（带它当时的路径）。 */
export interface HistoryBlob {
    path: string;
    bytes: number;
}

/** 按顶层目录汇总的一行 —— 一行正好是一个可以执行的动作。 */
export interface HistoryDirectory {
    /**
     * 顶层目录名；库根下的文件是 `.`（与 `normalizeFolders` 同一约定）。
     */
    path: string;
    bytes: number;
    /**
     * 这个目录下出现过的 **blob 对象**数（含同一文件的历史版本），
     * **不是文件数** —— 见文件头「为什么按对象算」。
     */
    objects: number;
}

export interface HistorySummary {
    /** 可达 blob 的原始字节之和（**未压缩**，所以会明显大于 `.git` 的实际占用）。 */
    totalBytes: number;
    /** 可达对象总数（blob + tree + commit）。 */
    objectCount: number;
    /** 按顶层目录汇总，**降序**（占得最多的在最前）。 */
    directories: HistoryDirectory[];
    /** 最大的单个 blob，**降序**。 */
    largest: HistoryBlob[];
}

/** `git cat-file --batch-check` 给出的一条对象信息。 */
export interface ObjectInfo {
    type: string;
    bytes: number;
}

/** 根目录文件归到的那一行。 */
export const ROOT_DIRECTORY = ".";

/**
 * 解析 `git rev-list --objects --all` 的输出。
 *
 * 每行是 `<sha>` 或 `<sha> <path>`：**提交对象没有路径**，blob 与 tree 有。
 * 用**第一个空格**切分而不是 `split(" ")` —— 路径里可以有空格（`我的 笔记.md`），
 * 切错了路径就少一截，而那种错误在汇总里表现为「有个目录凭空少了几 MB」。
 *
 * 取输出时必须带 `-c core.quotePath=false`，否则中文路径会被转义成
 * `"\342\221\243..."` 这种八进制串 —— 报告里就会出现一屏看不懂的东西。
 */
export function parseRevListObjects(
    output: string
): Array<{ sha: string; path?: string }> {
    const entries: Array<{ sha: string; path?: string }> = [];
    for (const rawLine of output.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.length === 0) continue;
        const space = line.indexOf(" ");
        if (space === -1) {
            entries.push({ sha: line });
            continue;
        }
        entries.push({ sha: line.slice(0, space), path: line.slice(space + 1) });
    }
    return entries;
}

/**
 * 解析 `git cat-file --batch-all-objects --batch-check='...'` 的输出。
 *
 * 每行 `<sha> <type> <size>`。取不到的对象（`<sha> missing`）只有两段，
 * 直接跳过 —— 这里读的是「这个仓库里有什么」，缺一条不该让整份报告失败。
 *
 * 用 `--batch-all-objects` 而不是「把 sha 喂给 `--batch-check` 的标准输入」：
 * 后者要求我们往子进程写 stdin，而本项目的 git 调用统一走 simple-git 的 `raw()`，
 * 它没有 stdin 通道。代价是这份输出**包含不可达对象** —— 调用方按可达集合取用即可。
 */
export function parseBatchCheck(output: string): Map<string, ObjectInfo> {
    const map = new Map<string, ObjectInfo>();
    for (const rawLine of output.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.length === 0) continue;
        const parts = line.split(" ");
        if (parts.length < 3) continue;
        const bytes = Number.parseInt(parts[2]!, 10);
        if (!Number.isFinite(bytes)) continue;
        map.set(parts[0]!, { type: parts[1]!, bytes });
    }
    return map;
}

/** 一个路径的顶层目录；库根下的文件返回 `.`。 */
export function topLevelOf(path: string): string {
    const slash = path.indexOf("/");
    return slash === -1 ? ROOT_DIRECTORY : path.slice(0, slash);
}

/**
 * 汇总体检结果。
 *
 * 只统计 **blob**：tree 与 commit 加起来通常不到千分之一，把它们混进「谁占得多」
 * 只会让目录之间的差距变小、判断变糊。`objectCount` 仍然是全部可达对象 ——
 * 那个数字回答的是另一个问题（「对象多不多、gc 会不会慢」）。
 *
 * `entries` 必须来自 `rev-list --objects --all`（**可达**集合），
 * `objects` 来自 `--batch-all-objects`（全量）；两者的交集才是我们要的。
 */
export function summarizeHistory(
    entries: ReadonlyArray<{ sha: string; path?: string }>,
    objects: ReadonlyMap<string, ObjectInfo>,
    options: { topDirectories?: number; topObjects?: number } = {}
): HistorySummary {
    const topDirectories = options.topDirectories ?? 30;
    const topObjects = options.topObjects ?? 20;

    const byDirectory = new Map<string, HistoryDirectory>();
    const blobs: HistoryBlob[] = [];
    let totalBytes = 0;

    for (const entry of entries) {
        if (entry.path === undefined) continue;
        const info = objects.get(entry.sha);
        // 认不出类型就不猜 —— 少一行好过编一行。
        if (!info || info.type !== "blob") continue;

        totalBytes += info.bytes;
        blobs.push({ path: entry.path, bytes: info.bytes });

        const directory = topLevelOf(entry.path);
        const current = byDirectory.get(directory);
        if (current) {
            current.bytes += info.bytes;
            current.objects += 1;
        } else {
            byDirectory.set(directory, { path: directory, bytes: info.bytes, objects: 1 });
        }
    }

    return {
        totalBytes,
        objectCount: entries.length,
        directories: [...byDirectory.values()]
            // 大的在前；同样大按名字 —— 顺序必须稳定，两次打开顺序不同会让人以为内容变了。
            .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
            .slice(0, topDirectories),
        largest: blobs
            .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
            .slice(0, topObjects),
    };
}
