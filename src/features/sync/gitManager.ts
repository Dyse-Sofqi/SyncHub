import type { CommitInfo, FileChange, FileChangeStatus, RepoSize, RepoStatus, RewriteResult, SyncOutcome, SyncStrategy } from "./types";
import type { HistorySummary } from "./historyObjects";

/**
 * Git 操作的抽象接口。
 *
 * 为什么要接口而不是直接用 simple-git：阶段一决策「仅桌面」，但接口层
 * 留扩展位是 PLAN.md 的既定设计（v2 若做移动端 isomorphic-git，只需新增实现）。
 * 同时接口也是单测的接缝 —— syncService 的测试可以注入内存实现。
 *
 * 错误约定：实现必须把 git 的失败翻译成 `errors.ts` 里的类型
 * （`GitNotRepoError` / `GitBinaryMissingError` / `ConflictError` / ...），
 * 上层不允许解析 git 的原始 stderr。
 *
 * 约定：这里的所有操作都**不带凭据参数** —— 鉴权由实现内部处理
 * （见 `auth.ts`），调用方不感知平台差异。
 *
 * 同步策略三态（pull 的 `strategy` 参数）：
 * - `merge`  —— fetch + merge（可能产生合并提交）
 * - `rebase` —— fetch + rebase（历史线性）
 * - `reset`  —— 本地分支直接指向远端提交（丢弃本地未推送提交，「强制以远端为准」）
 */
export interface GitManager {
    /** vault 是否已经是 git 仓库。git 目录损坏时返回 false 并记日志。 */
    isRepo(): Promise<boolean>;

    /** 初始化仓库（`git init`）。已初始化时是幂等操作。 */
    init(): Promise<void>;

    /** 当前状态快照。非仓库时抛 `GitNotRepoError`。 */
    status(): Promise<RepoStatus>;

    /** 暂存指定文件；`paths` 为空数组时暂存全部变更（`git add -A`）。 */
    stage(paths: string[]): Promise<void>;

    /** 取消暂存。 */
    unstage(paths: string[]): Promise<void>;

    /**
     * 让 git **不再跟踪**这些路径（`git rm -r --cached`）—— 工作区文件保留。
     *
     * 与 `unstage` 的区别是根本性的：那是「撤回暂存」，文件仍被跟踪、下次提交照旧带上；
     * 这是「退出跟踪」，下次提交会记下一条删除。用来把图片文件夹交给 `.gitignore` 管
     * （见 `features/sync/imagesIgnore.ts` 的文件头）。
     */
    untrack(paths: string[]): Promise<void>;

    /**
     * 当前**已被跟踪**的所有路径（`git ls-files`）。
     *
     * 「按扩展名忽略图片」要用它：`.gitignore` 只管未跟踪的文件，所以必须知道
     * 哪些已跟踪的图片得摘索引，而这只能问 git（自己扫库会漏掉「已删除但仍在
     * 索引里」之类的状态，也分不清索引里的路径大小写）。
     */
    listTracked(): Promise<string[]>;

    /**
     * 这批路径里，哪些在索引里记的是**嵌套仓库**（gitlink，模式 `160000`）。
     *
     * 用户在库的插件目录里就地开发插件时，那些目录各自带 `.git`，库就把它们记成了
     * 一个「指针」—— 这种行暂存不掉、没有文件级差异、会永远挂在「更改」里，
     * 面板要靠这个方法认出它们并给出「不再跟踪」的出口。
     */
    nestedRepoPaths(paths: string[]): Promise<string[]>;

    /** 创建提交。没有可提交内容时返回 false 而不是报错。 */
    commit(message: string): Promise<boolean>;

    /** 拉取远端并按策略整合：详见实现处的策略说明。遇冲突抛 `ConflictError`。 */
    pull(strategy: SyncStrategy): Promise<SyncOutcome>;

    /** 放弃进行中的合并（冲突恢复的出路之一：回到 pull 之前的状态）。 */
    abortMerge(): Promise<void>;

    /** 推送。没有 upstream 时自动设置（`-u origin <branch>`）。远端拒绝时抛 `PushRejectedError`。 */
    push(): Promise<SyncOutcome>;

    /** 只取回远端信息不合并。用于状态栏的 ahead/behind 展示。 */
    fetch(): Promise<void>;

    /** 列出本地分支，`*` 标注当前分支的语义用 `current` 字段表达。 */
    listBranches(): Promise<Array<{ name: string; current: boolean }>>;

    /** 切换分支。工作区有未提交变更时由调用方决定先提交还是 stash。 */
    checkout(branch: string): Promise<void>;

    /** 创建并切换到新分支。 */
    createBranch(name: string): Promise<void>;

    /** 删除本地分支。 */
    deleteBranch(name: string): Promise<void>;

    /** 最近 N 条提交（当前分支）。 */
    log(limit: number): Promise<CommitInfo[]>;

    /** 远端 URL（origin）。没有远端时返回 undefined。 */
    getRemoteUrl(): Promise<string | undefined>;

    /**
     * 仓库对象库的体积与对象数（`git count-objects -v`）。
     *
     * **只读且只碰本地** —— 不连远端、不动任何引用。用它回答「我这个库有多大」。
     * 解析不出体积时抛错（调用方显示「读不到」，而不是编一个 0）。
     */
    repoSize(): Promise<RepoSize>;

    /** 设置 / 修改 origin 的 URL。 */
    setRemoteUrl(url: string): Promise<void>;

    /** 单个文件的变更明细（用于差异查看，v1 只列文件级状态）。 */
    fileChanges(): Promise<FileChange[]>;

    /**
     * 某个文件的差异（unified diff **原文**）。
     *
     * 为什么返回原文而不是解析结果：解析是纯函数（见 `diff.ts`），
     * 放在实现里会让「怎么拼参数」与「怎么读行号」缠在一起 ——
     * 而后者才是最容易错、也最该被单独测的部分。
     *
     * `staged` 为真时比较「索引 ↔ HEAD」（即将被提交的内容），
     * 否则比较「工作区 ↔ 索引」（还没暂存的内容）。
     *
     * **只读**：不写 index、不动引用，也不产生任何输出文件。
     * 不是仓库时抛 `GitNotRepoError`。
     */
    diffFile(path: string, options?: { staged?: boolean }): Promise<string>;

    /**
     * 某条提交引入的改动（unified diff 原文，不含提交信息本身）。
     *
     * 合并提交默认不产出差异（git 的行为），实现应当带上「与第一父提交比较」
     * 的选项 —— 否则用户在历史里点开一个合并提交只会看到一片空白。
     */
    commitPatch(hash: string): Promise<string>;

    /**
     * 测试能否访问远端（**只读**，不改变任何东西）。
     *
     * 这是「鉴权配置对不对」的唯一权威检查：私有仓库令牌不对时，
     * 只有真的去连一次才知道 —— 光看配置项无法判断令牌是否有效。
     * 用 `ls-remote` 而不是 `fetch`：前者不写任何本地状态。
     *
     * @returns 远端引用数量（>= 0）。失败时抛 `errors.ts` 里的领域错误
     *          （`GitAuthError` / `NetworkError` / …），由上层翻译成提示。
     * @throws 没有配置远端时抛 `NoUpstreamError`。
     */
    testRemoteAccess(): Promise<number>;

    // ── 清理：体检 / 回收 / 深度清理 ────────────────────────────────────────
    //
    // 三层的能力与风险递增：体检只是看，回收只动不可达对象，深度清理**改写全部提交**。
    // 三者分开成三个方法而不是合成一个「清理」，就是为了让「风险」这件事在
    // 类型层面也看得出来 —— 调用方不可能不小心把重写当成体检跑掉。

    /**
     * **体检**：历史里哪些东西占了空间（只读）。
     *
     * 不写引用、不动索引、不产生任何文件。它是三层里唯一可以随手点的一个 ——
     * 也正是这个原因，它必须足够快且绝不失败：用户点它是为了**做决定**，
     * 一个会报错的体检等于没有体检。
     */
    historyObjects(): Promise<HistorySummary>;

    /** 当前分支的提交数（`git rev-list --count HEAD`）。用来估算重写要多久。 */
    countCommits(): Promise<number>;

    /**
     * **回收**：`git gc --prune=now`。
     *
     * 只清**不可达**对象（悬空的、被删分支留下的），不碰任何引用、不改任何提交 ——
     * 所以它是安全的。代价是**常常一点也回收不到**：大文件基本都躺在可达历史里，
     * 实测一个 452 MB 的库跑完 gc 还是 452 MB。这不是 bug，是 git 的语义，
     * 界面上要说清这一点，否则用户会以为功能坏了。
     */
    gc(): Promise<void>;

    /**
     * **深度清理**：把指定路径从**全部历史**里剔除 —— 重写每一个提交。
     *
     * ## 这是本插件里唯一不可逆的动作
     *
     * 它改变所有提交的哈希，因此：
     * - 远端会与本地分叉，**必须强制推送**，其他设备要重新 clone；
     * - 已经推出去的旧历史在别人的克隆里仍然存在，**这里清不掉**。
     *
     * ## 实现必须做到的四件事
     *
     * 1. **先建备份引用**（`refs/obsync-backup/<时间戳>` → 重写前的 HEAD），
     *    返回结果里带上它。没有退路的重写不该存在。
     * 2. **重写的引用集合是 `--branches --tags --remotes`，不是 `--all`** ——
     *    `--all` 会把备份引用也一起改写，于是备份**安静地**指向新历史（等于没有）。
     * 3. **清掉上次中断留下的 `.git-rewrite`**：filter-branch 见到它会直接
     *    `fatal: .git-rewrite already exists` 退出，症状是「点了没反应」。
     * 4. **工作区不干净时抛 `HistoryRewriteBlockedError("dirty-tree")`** ——
     *    filter-branch 自己会拒绝，但那时错误消息是一句英文技术描述，
     *    用户不知道要先去提交。
     *
     * 跑完之后旧对象仍然活着（备份引用与 `refs/original` 拉着它们），
     * 所以**空间不会立刻释放** —— 那要等用户确认库没问题之后调用 `discardBackups`。
     * 这是刻意的：先确认能用，再丢退路。
     */
    rewriteHistory(paths: string[]): Promise<RewriteResult>;

    /** 列出本插件建的历史备份引用（`refs/obsync-backup/*`），新的在前。 */
    listBackups(): Promise<string[]>;

    /**
     * **丢弃备份并回收空间**：删掉备份引用与 filter-branch 留下的 `refs/original/*`，
     * 过期全部 reflog，再 `gc --prune=now`。
     *
     * 这是重写的**第二步**，也是真正释放空间的那一步（第一步跑完空间不会变小，
     * 因为备份还拉着旧对象）。**不可逆**：调用之后没有任何办法回到重写前的历史。
     */
    discardBackups(): Promise<void>;

    /**
     * 强制推送。
     *
     * 重写历史之后本地与远端**必然分叉**，普通的 `push` 会被拒绝
     * （`PushRejectedError`）。这里用 `--force`：用 `--force-with-lease` 是没用的 ——
     * 重写时 `refs/remotes/*` 也被一起改写了，lease 比对的是那个新值，永远不会拒绝。
     *
     * 调用方必须先让用户明确知道「这会覆盖远端的全部历史」。
     */
    forcePush(): Promise<SyncOutcome>;
}

/** simple-git 的状态字符 → 我们的领域类型。 */
export function mapStatusChar(index: string, workingDir: string): FileChangeStatus | undefined {
    if (index === "?" || workingDir === "?") return "untracked";
    if (index === "U" || workingDir === "U") return "conflicted";
    if (index === "A" || workingDir === "A") return "added";
    if (index === "D" || workingDir === "D") return "deleted";
    if (index === "R") return "renamed";
    if (index === "M" || workingDir === "M") return "modified";
    return undefined;
}
