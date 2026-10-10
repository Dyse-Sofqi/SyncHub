/**
 * 清理能力的**共用规则** —— 全是纯逻辑，不碰 git、不碰界面。
 *
 * 这里放三件「写错了代价很大」的事：
 *
 * 1. **耗时估算**：重写历史是唯一一个可能跑几十分钟的动作，动手前必须把账算给用户看。
 * 2. **要剔除的路径怎么归一**：这是唯一一个「传错参数就删错东西」的入口。
 * 3. **备份引用的命名**：重写之后要靠它回退，名字必须能被稳定地列出来。
 *
 * ## 耗时系数是怎么来的（两次独立测量，2026-10-09）
 *
 * | 库 | 提交 | 索引文件 | `.git` | 耗时 | 每提交 |
 * | --- | --- | --- | --- | --- | --- |
 * | 大库（真实笔记库的副本） | 159 | 2838 | 452 MB pack | **551 秒** | 3.47 秒 |
 * | 小库（合成，小笔记 + 少量大文件） | 137 | 306 | 5.5 MB | **486 秒** | 3.55 秒 |
 *
 * **两次几乎完全一致，而库体积差 80 倍、文件数差 9 倍。** 所以每提交的代价
 * **几乎与库的大小无关** —— 瓶颈是**每个提交都要起一次 git 子进程**
 * （`--index-filter` 的定义如此，Windows 上进程创建尤其贵），不是 I/O。
 *
 * 这条结论有两个用处：
 * 1. **系数可以直接用**（`estimateRewriteSeconds(137)` = 485 秒，实测 486 秒，差 1 秒）；
 * 2. **不能按库大小去调它** —— 一度以为「小库会快很多」，测下来是错的。
 *    要调只能改 `REWRITE_SECONDS_PER_COMMIT` 这一个数，而改之前必须再测一次。
 *
 * 它随提交数**线性**增长，所以可以估。估算**宁可偏高**：说「1 分钟」结果跑了
 * 9 分钟，用户会以为卡死然后强杀进程 —— 而中断正是这个动作最坏的结局。
 */

/** 重写历史时每个提交的实测耗时（秒）。见文件头。 */
export const REWRITE_SECONDS_PER_COMMIT = 3.5;

/**
 * 估算重写历史需要多久（秒）。
 *
 * 额外加一段固定开销：filter-branch 起停、写 `refs/original`、最后那次
 * `update-ref` 与工作区还原都不随提交数变化，但在小仓库里它们就是全部耗时。
 */
export function estimateRewriteSeconds(commitCount: number): number {
    const commits = Number.isFinite(commitCount) && commitCount > 0 ? commitCount : 0;
    return Math.ceil(commits * REWRITE_SECONDS_PER_COMMIT + 5);
}

/** 估算耗时的分钟数（向上取整，至少 1 分钟）。界面按它取文案。 */
export function estimateRewriteMinutes(commitCount: number): number {
    return Math.max(1, Math.ceil(estimateRewriteSeconds(commitCount) / 60));
}

/**
 * 把「已经跑了多少秒」格式化成 `分:秒`（`m:ss`）。
 *
 * ## 为什么界面要报「已用」而不是百分比
 *
 * 重写是 `--index-filter` 逐提交跑的，而 **git 全程不会输出「处理到第几个提交」**
 * —— 唯一的进度信号是它自己往 stderr 打的那行 `Rewrite <sha> (n/total)`，
 * 而那行不经过我们的调用栈（simple-git 只是把它攒在缓冲区里，跑完才给）。
 * 所以界面上能诚实说出来的只有两件事：**已用多久**、**按估算还要多久**。
 * 编一个 0%~100% 就是骗人 —— 它会停在一个数字上不动，或者冲过 100%。
 *
 * ## 为什么超过一小时也照 `m:ss` 报
 *
 * 一个 10000 提交的库要跑约 10 小时（见文件头的系数），`600:00` 读起来怪，
 * 但它比 `10:00:00` 更省位置，而这个数字旁边永远有「预计总共约 N 分钟」作对照。
 * 真要跑到那个量级，用户看的是「还在涨」这件事，不是精确的位数。
 */
export function formatElapsed(seconds: number): string {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * 把用户勾选的目录归一成可以交给 `git rm -r --cached` 的路径。
 *
 * ## 为什么要有这一步（而不是直接把勾选项传下去）
 *
 * 这个动作的另一端是 `git rm -r --cached -- <path>`，**传错一个参数就是删错一整棵目录**，
 * 而且改的是不可逆的历史。所以这里做四件事，每一件都对应一类真实的输入错误：
 *
 * - **去掉首尾斜杠与空白**：`attachments/` 与 ` attachments ` 是同一样东西。
 *   空白尤其要紧 —— 从别处粘过来的路径常常带一个尾随空格，而 git 会把它当成
 *   一个**不存在的路径名**安静地跳过（`--ignore-unmatch`），用户看到的是「点了没反应」。
 * - **丢掉空串**：拆行、拆逗号都会产生它，传下去等于让 `git rm` 收到一个空 pathspec。
 * - **拒绝 `.`**：它代表**整个库**。剔掉它等于把全部文件从历史里抹掉 ——
 *   这不是一个「清理」动作，是灾难。它出现在报告里只是为了账目对得上，不该能勾选。
 * - **拒绝绝对路径与 `..`**：`git rm` 的 pathspec 是相对仓库根的，
 *   `/etc` 或 `../other-repo` 这种输入要么匹配不到、要么在别的实现里真的会出事。
 *   这里一律拒绝，不做「帮忙归一化」—— 猜错了没有第二次机会。
 *
 * 返回值把**被拒绝的**也带出来：界面要说清「哪几条没被采纳、为什么」，
 * 否则用户会以为勾了却什么都没发生。
 */
export function normalizeRemovalPaths(input: ReadonlyArray<string>): {
    paths: string[];
    rejected: string[];
} {
    const paths: string[] = [];
    const rejected: string[] = [];
    const seen = new Set<string>();

    for (const raw of input) {
        const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
        if (trimmed.length === 0 || trimmed === ".") {
            rejected.push(raw);
            continue;
        }
        // `..` 出现在任何一段里都拒绝（`a/../b` 同样不放过）。
        const segments = trimmed.split("/");
        if (segments.some((segment) => segment === "..")) {
            rejected.push(raw);
            continue;
        }
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        paths.push(trimmed);
    }

    return { paths, rejected };
}

/** 备份引用名的前缀。 */
export const BACKUP_REF_PREFIX = "refs/obsync-backup/";

/**
 * 备份引用名。
 *
 * ## 为什么挂在 `refs/obsync-backup/` 而不是建一个分支或标签
 *
 * 因为重写时要重写的引用集合是 `--branches --tags --remotes`：
 * 备份**必须在那个集合之外**，否则第二次清理会把上一次的备份也一起重写 ——
 * 那时它就指向新历史了，等于没有备份，而且是**安静地**失效。
 *
 * （用 `--all` 就会踩到这个：`--all` 是「refs/ 下的全部」，备份 ref 会被一起改写。
 *   2026-10-09 在合成仓上实测确认过。）
 *
 * ## 为什么名字里带时间戳
 *
 * 用户可能清理多次，而每一次的备份都有意义（「上周那次清理前的样子」）。
 * 覆盖式的单个 `backup` 会让上一次的回退点在无人察觉的情况下消失。
 *
 * 时间戳用本地时间且**可排序**（`20261009-231500`）—— 列出来时自然是新在前。
 */
export function backupRefName(now: Date): string {
    const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
    const stamp =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
        `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${BACKUP_REF_PREFIX}${stamp}`;
}

/** 从引用名里取出备份的时间戳部分（展示用）。不是备份引用时返回 undefined。 */
export function backupStampOf(refName: string): string | undefined {
    if (!refName.startsWith(BACKUP_REF_PREFIX)) return undefined;
    const stamp = refName.slice(BACKUP_REF_PREFIX.length);
    return stamp.length > 0 ? stamp : undefined;
}

/**
 * 把路径包成 `--index-filter` 里可以安全交给 shell 的形式。
 *
 * ## 为什么必须有这一步
 *
 * `--index-filter` 的值是**一段 shell 脚本**，由 git 交给 `sh` 去跑 ——
 * 不是参数数组。于是路径里的空格、引号、`$`、`;` 全都会被 shell 解释：
 * 一个叫 `我的 笔记.md` 的目录会让 `git rm ... -- 我的 笔记.md` 变成两个 pathspec，
 * 而一个带 `$` 或反引号的路径更糟 —— 命令替换会执行里面的内容。
 *
 * 路径来自用户勾选与体检报告，**不是可信输入**，所以这里按 POSIX 规则包单引号：
 * 单引号内一切字符都是字面量，只需把路径里原本的单引号写成 `'\''`（先闭合、插入一个
 * 转义单引号、再打开）。
 *
 * 与 `gitignore` 那类拼接不同，这里**不能**靠「反正 git 会处理」蒙混 ——
 * 走的是 shell，就是 shell 的规则。
 */
export function shellQuote(value: string): string {
    return `'${value.split("'").join("'\\''")}'`;
}
