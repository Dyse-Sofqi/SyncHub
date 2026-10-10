import type { LocaleStrings } from "../../core/i18n";
import { ObsyncError } from "../../host/errors";

/**
 * git 层的错误类型。
 *
 * 与 host 层的划分同理（见 `host/errors.ts`）：按**应对方式**分类，
 * 上层 UI 靠 `instanceof` 分派提示文案，而不是解析错误消息字符串。
 *
 * 这些错误必须从 `gitManager` 的实现里抛出，`syncService` 才能做出正确的
 * 用户引导 —— 比如 `GitBinaryMissingError` 要引导去设置页填 gitPath，
 * `ConflictError` 要引导打开冲突清单，普通 git 失败则展示原始错误。
 *
 * ## 消息文案的归属
 *
 * 抛错处（`simpleGitManager`）**拿不到 `t`** —— 它是纯逻辑层，不该依赖 i18n。
 * 所以那里抛的 `message` 是**技术性描述**（英文、给日志和排查用），
 * 面向用户的话由 `describeSyncError` 在展示层按类型拼出来。
 *
 * 不做这层的话，症状是**英文界面下冒出一句中文错误** —— 因为早期实现把
 * 中文文案直接烘焙进了 `message`，而 `Notifier` 对 `ObsyncError` 是原样返回。
 */

/** 当前 vault 不是 git 仓库（或 git 目录损坏）。引导用户执行「初始化仓库」。 */
export class GitNotRepoError extends ObsyncError {}

/** 找不到 git 可执行文件。引导用户去设置页指定 gitPath。 */
export class GitBinaryMissingError extends ObsyncError {}

/** 拉取时遇到未解决的冲突。`files` 是冲突文件列表，用于生成冲突引导。 */
export class ConflictError extends ObsyncError {
    constructor(
        message: string,
        readonly files: string[],
        options?: { cause?: unknown }
    ) {
        super(message, options);
    }
}

/** 鉴权失败：令牌缺失 / 无效 / 权限不足。引导用户去设置页填令牌。 */
export class GitAuthError extends ObsyncError {}

/**
 * 平台不接受凭据里的**用户名** —— 与令牌本身无关。
 *
 * 为什么不并进 `GitAuthError`：**应对方式不同**。
 * `GitAuthError` 引导用户去查令牌，那是对的（令牌确实可能是问题）；
 * 但这一条里令牌是好的，问题在插件填的用户名 —— 并进前者会让用户
 * 去反复检查一个没问题的令牌。**错误类型用错比没有类型更糟。**
 *
 * 实测依据：Gitee 只接受 账号名 / `oauth2` / `gitee.com` 三种用户名，
 * 其余一律拒绝（服务端原文见 `docs/reference-analysis.md` 差异 6）。
 * 症状极隐蔽：公开仓库照常能读，只有推送失败。
 */
export class GitCredentialUsernameRejectedError extends ObsyncError {}

/** 远端拒绝推送（本地落后，需要先 pull）。 */
export class PushRejectedError extends ObsyncError {}

/**
 * 没有可用的远端分支，无法拉取 —— 现状是**没有配置远端**。
 *
 * 单独一个类型而不是复用 `GitNotRepoError`：那是「压根不是 git 仓库」，
 * 提示语是「请先初始化仓库」—— 用在这里会让用户去初始化一个已经存在的仓库，
 * 完全指错方向。**错误类型用错比没有类型更糟。**
 *
 * 2026-10-10 收窄：**「当前分支没配置上游」不再算这一类**。那时只要远端有同名分支
 * 就照常拉取，连分支都没有就当作「没有东西可拉」（上游由推送的 `-u` 建立）——
 * 详情见 `SimpleGitManager.pull`。所以现在它专指「连远端都没配」。
 */
export class NoUpstreamError extends ObsyncError {}

/** 处于游离 HEAD 状态（没有指向任何分支），无法推送。 */
export class DetachedHeadError extends ObsyncError {}

/**
 * git 命令卡住了（长时间没有任何输出）而被中止。
 *
 * 为什么要单独一个类型：它的**应对方式与别的错误都不一样**。用户看到的
 * 症状是「状态栏一直在推送/拉取，什么都没有发生」，而这句话本身不含任何
 * 可行动信息 —— 不知道是网络、是凭据、还是插件坏了。明确说「超时、已中止、
 * 检查网络或代理」才是他能做的事。
 *
 * 现实触发路径：网络中断后的连接悬挂、需要凭据却无人可问（见
 * `simpleGitManager` 里的 `GIT_NONINTERACTIVE_ENV`）、巨大的仓库在传输中僵住。
 */
export class GitTimeoutError extends ObsyncError {}

/**
 * 连不上远端：DNS 解析失败、TCP 连不上、TLS 握手失败、连接被中途掐断。
 *
 * ## 为什么要单独一类（2026-10-02）
 *
 * 用户报的那条是：
 *
 * ```
 * fatal: unable to access 'https://gitee.com/…': getaddrinfo() thread failed to start
 * ```
 *
 * 这是 git 的网络传输层（libcurl）**连解析线程都没起来**时的原话 —— 没有类型的话
 * 它就这么原样落在控制台里，用户看不出「是网络/代理的问题，还是插件坏了、还是令牌错了」。
 * 而它的应对方式很明确：**查网络与代理**（不是查令牌，也不是重装插件）。
 *
 * 与 `GitTimeoutError` 分开：那个是「连上了但一直没动静」，这个是「压根没连上」。
 * 两者都发生在网络上，但一个该查代理/防火墙，一个该查连接是否卡死 —— 混在一起
 * 用户只能瞎试。
 *
 * 现实触发路径（按常见程度）：公司/校园网或本人的**代理**没被 git 看见（插件 0.1.8
 * 之前会把代理变量丢掉，见 `gitChildEnv`）、安全软件/沙箱拦了 socketpair 与线程创建、
 * 系统资源紧张（内存/句柄/线程耗尽）、以及单纯的断网。
 */
export class GitNetworkError extends ObsyncError {}

/**
 * 重写历史被**前置条件**拦下 —— 不是「失败了」，是「还没到能动手的时候」。
 *
 * ## 为什么单独一个类型（而不是复用普通失败）
 *
 * 这三类的**应对方式**与「git 跑挂了」完全不同：
 *
 * - `dirty-tree` —— 工作区有未提交改动，filter-branch 会直接拒绝
 *   （`Cannot rewrite branches: Your index contains uncommitted changes.`）。
 *   用户该做的是**先提交或撤销**，而不是「重试一次」。
 * - `no-commits` —— 这个仓库还没有任何提交，本来就没东西可清。
 * - `no-paths` —— 一个路径都没选中。
 *
 * 混进通用提示的话，用户拿到的是一句「重写历史失败」：它不含任何可行动信息，
 * 而下一步该做什么恰恰是他唯一需要知道的。**错误类型用错比没有类型更糟。**
 *
 * `reason` 是**类型码**而不是文案（与 `DiagnosticCheck.id` 同一套约定）：
 * 逻辑层产出码，展示层按码取 locale 文案。
 */
export type RewriteBlockedReason = "dirty-tree" | "no-commits" | "no-paths";

export class HistoryRewriteBlockedError extends ObsyncError {
    constructor(
        message: string,
        readonly reason: RewriteBlockedReason,
        options?: { cause?: unknown }
    ) {
        super(message, options);
    }
}

/**
 * git **拒绝开始**重写：仓库里还留着上一次重写写的中间引用（`refs/original/`）。
 *
 * ## 现场（2026-10-10 用户实测报的）
 *
 * 用户第一次深度清理成功、强制推送也做完了，想再清一轮时拿到的是：
 *
 * ```
 * Cannot create a new backup.
 * A previous backup already exists in refs/original/
 * Force overwriting the backup with -f
 * ```
 *
 * `filter-branch` 把「改写前的引用」备份在 `refs/original/` 下，见到它已经存在就
 * **拒绝开始**。而本插件只在「丢弃备份并回收」里清它 —— 也就是**清理过两次
 * 之间必须先丢弃备份**，否则第二次必然失败。而 `cleanup.ts` 里备份引用带时间戳的
 * 理由恰恰是「用户可能清理多次」，所以这是实现与设计意图不符，已改（见下）。
 *
 * ## 为什么单独一个类型
 *
 * 它的应对方式与 `HistoryRewriteBlockedError` 那三种都不同 —— 用户没有做错什么，
 * 该做的是**重试**（`rewriteHistory` 现在会带 `--force`，git 直接覆盖那份中间引用）。
 * 混进兜底分支的话，用户拿到的就是上面那段英文原文，看不出下一步该做什么。
 */
export class HistoryRewriteRefusedError extends ObsyncError {}

/**
 * 重写把**整条历史都清空了**，git 因此删掉了当前分支 —— 已**自动还原**。
 *
 * ## 它是怎么发生的（实测确认，不是推测）
 *
 * `--prune-empty` 会摘掉「剔除这些路径之后变空」的提交。用户勾选的路径若覆盖了
 * 每个提交的**全部**内容，就没有任何提交能活下来，`filter-branch` 会直接把这条
 * 分支删掉（原话 `Ref 'refs/heads/master' was deleted`），仓库落到「HEAD 未出生」
 * 的状态。合成仓实测：只剩一个提交、而它被摘掉时就是这样。
 *
 * ## 为什么必须单独一个类型，而且必须还原
 *
 * 这是**插件自己造出来的坏状态**：用户会看到一个「没有分支、没有提交」的仓库，
 * 而他从头到尾只点了一个「确认重写」。备份引用在动手前就建好了，所以
 * `rewriteHistory` 会**当场把分支接回去**（回到重写前一模一样的状态）再抛这个错。
 * 文案的重点因此不是「失败了」，而是「**已经还原了，库是好的**」+「少勾一些路径」。
 */
export class HistoryRewriteEmptiedError extends ObsyncError {}

/**
 * 本地与远端**没有任何共同提交** —— 普通拉取与推送两条路都堵死。
 *
 * ## 它几乎只有一个来源：刚做过「深度清理」而还没强制推送
 *
 * `filter-branch` 会把**每一个**提交都换成新哈希（连根提交也是，因为它的树也变了），
 * 于是本地那条链与远端那条链在 git 眼里是**两条互不相干的历史**：
 *
 * - `git pull`（merge）直接拒绝 —— `fatal: refusing to merge unrelated histories`；
 * - `git push` 因为不是快进也会被拒绝。
 *
 * 唯一的出路是一次**强制推送**（`GitManager.forcePush`）。
 *
 * ## 为什么必须单独一个类型
 *
 * 它的应对方式与别的失败都不一样：不是去解冲突、不是去查令牌、也不是重试 ——
 * 是**去强制推送一次**。没有类型的话它落进兜底分支，用户拿到的就是
 * `fatal: refusing to merge unrelated histories` 这句英文原文：
 * 它不含任何可行动信息，而「重写之后必须强制推送」恰恰是他唯一需要知道的事。
 *
 * 用户实测报的就是这一条（2026-10-10）：他在测试库里做完深度清理、**关掉弹窗
 * 重启了 Obsidian**，然后点「立即同步」—— 那个弹窗里的「强制推送」按钮已经
 * 随窗口一起没了，于是他卡在一个插件自己造出来、却没有任何出口的状态里。
 * 所以修这一条是**两件事**：把这个错误翻译成人话，以及给强制推送一个
 * 关掉弹窗、重启之后仍然找得到的入口（设置页「清理」那一节）。
 */
export class UnrelatedHistoriesError extends ObsyncError {}

/**
 * 把 git 层的错误翻译成用户可读文案。
 *
 * 在 `createSyncModule` 里注册进 `Notifier`，这样任何调用点
 * （命令、状态栏、视图）报错时都会自动走这里，不会漏。
 *
 * @returns 认不出的错误返回 undefined，交回 `Notifier` 的通用规则。
 */
export function describeSyncError(err: unknown, t: LocaleStrings): string | undefined {
    if (err instanceof GitBinaryMissingError) return t.sync.gitNotFound;
    if (err instanceof GitNotRepoError) return t.sync.notARepo;
    if (err instanceof GitCredentialUsernameRejectedError) {
        return t.sync.gitCredentialUsernameRejected;
    }
    if (err instanceof GitAuthError) return t.sync.gitAuthFailed;
    if (err instanceof PushRejectedError) return t.sync.pushRejected;
    if (err instanceof NoUpstreamError) return t.sync.noUpstream;
    if (err instanceof DetachedHeadError) return t.sync.detachedHead;
    if (err instanceof GitTimeoutError) return t.sync.gitTimeout;
    if (err instanceof GitNetworkError) return t.sync.gitNetworkFailed;
    if (err instanceof UnrelatedHistoriesError) return t.sync.unrelatedHistories;
    if (err instanceof ConflictError) return t.sync.conflictDetected(err.files.length);
    if (err instanceof HistoryRewriteBlockedError) {
        return t.sync.cleanup.blocked[err.reason];
    }
    if (err instanceof HistoryRewriteRefusedError) return t.sync.cleanup.rewriteRefused;
    if (err instanceof HistoryRewriteEmptiedError) return t.sync.cleanup.rewriteEmptied;
    return undefined;
}
