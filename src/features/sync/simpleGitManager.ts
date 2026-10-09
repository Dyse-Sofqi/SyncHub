import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";
import { logger } from "../../core/logger";
import type { SecretStore } from "../../core/secretStore";
import { credentialForRemote, withAuth, type RemoteCredential } from "./auth";
import type { GitManager } from "./gitManager";
import {
    ConflictError,
    GitAuthError,
    GitBinaryMissingError,
    GitCredentialUsernameRejectedError,
    GitNotRepoError,
    GitNetworkError,
    GitTimeoutError,
    HistoryRewriteBlockedError,
    NoUpstreamError,
    DetachedHeadError,
    PushRejectedError,
} from "./errors";
import type {
    CommitInfo,
    FileChange,
    RepoSize,
    RepoStatus,
    RewriteResult,
    SyncOutcome,
    SyncStrategy,
} from "./types";
import { mapStatusChar } from "./gitManager";
import { parseCountObjects } from "./repoSize";
import {
    parseBatchCheck,
    parseRevListObjects,
    summarizeHistory,
    type HistorySummary,
} from "./historyObjects";
import {
    BACKUP_REF_PREFIX,
    backupRefName,
    estimateRewriteSeconds,
    shellQuote,
} from "./cleanup";
import type { FileStatusResult, StatusResult } from "simple-git";

/**
 * 桌面端 GitManager：基于系统 git（simple-git 封装）。
 *
 * ## 与参考项目 obsidian-git 的实现差异
 *
 * - **鉴权**：它用 SSH_ASKPASS 脚本 + 文件监听 + 弹窗收集输入（交互式）；
 *   我们的令牌已在 secretStore 里，直接 `http.extraheader` 注入（见 `auth.ts`），
 *   不需要脚本和监听。
 * - **pull 的实现**：同它一样「先 fetch 再比较引用再整合」而不是裸 `git pull` ——
 *   这样能区分「远端没有新东西」和「整合失败」，也能在整合前拿到双方的提交号。
 * - **子模块**：v1 不做（PLAN.md 范围外），相关分支全部省略。
 * - **错误分派**：它把错误转成少数几类后多数原样上抛、靠字符串猜；
 *   这里统一在 `mapError` 一处收口成领域错误。
 */

/**
 * 识别「HEAD 还没有出生」（仓库建好但一次都没提交过）。
 *
 * 注意 git 的输出里 HEAD 是**带引号**的：`fatal: could not resolve 'HEAD'`。
 * 第一版正则写的是不带引号的 `could not resolve HEAD`，于是永远匹配不上，
 * 回退分支形同虚设 —— 表现为「全新仓库里取消暂存直接报错」。
 * 这里用 `['"\`]?` 容忍引号，同时保留其他措辞以覆盖不同 git 版本。
 */
const HEAD_UNBORN_RE =
    /could not resolve ['"`]?HEAD|unborn|unknown revision|ambiguous argument ['"`]?HEAD/i;

/**
 * 「一个字节的输出来都没有」多久就认定卡死（毫秒）。
 *
 * simple-git 的 `timeout.block` 是**无输出**超时：只要 git 还在往
 * stdout/stderr 写东西（拉取的进度、推送的对象计数都在 stderr 上），计时就重置。
 * 所以它拦的是「完全僵住」，而不是「大仓库比较慢」。
 *
 * 为什么必须有这条出路：这里是 Obsidian 的界面进程 —— 没有人能回答 git 的提问，
 * 也没有 Ctrl+C。没有超时的话，一次卡住会**永久**占住同步队列
 * （`isBusy` 一直为 true，自动定时器一直跳过），用户只能重载插件。
 *
 * 120 秒的依据是本机实测的网络动作：Gitee `ls-remote` 1.7 秒、
 * GitHub 冷连接 17~25 秒（见第七节第 19 条）。真正毫无输出的两分钟不可能是正常传输。
 */
const GIT_BLOCK_TIMEOUT_MS = 120_000;

/**
 * 长任务（回收、重写历史）的块超时上限。
 *
 * 重写历史不按这个值走 —— 它按**预计耗时**算（见 `rewriteHistory`）。
 * 这个是给 `gc` 用的：大仓库重新打包可能很久，但没有可估的依据，
 * 所以给一个足够宽的上限，而不是让它落回 2 分钟那个会误杀的默认值。
 */
const LONG_TASK_TIMEOUT_MS = 30 * 60_000;

/** filter-branch 的临时目录名（中断后会留下它，下次运行会被它挡住）。 */
const REWRITE_TEMP_DIR = ".git-rewrite";

/**
 * 每次 `git rm --cached` 最多带多少条路径。
 *
 * 命令行长度有上限（Windows 约 32k 字符），而「按扩展名忽略图片」会**逐个文件**
 * 列出路径 —— 几千张图的库一次塞进去必然失败，而报错是「命令行过长」，与
 * 「停止跟踪」毫无关系。200 条 × 平均 60 字符 ≈ 12k，留足余量。
 */
const UNTRACK_BATCH_SIZE = 200;

/**
 * 索引里的 gitlink 模式位 —— 「这一条指向另一个 git 仓库」。
 *
 * git 用它记子模块与「意外嵌进来的仓库」（`.gitmodules` 里没有登记的那些）。
 * 见 `nestedRepoPaths`。
 */
const GITLINK_MODE = "160000";

/**
 * 绝不让「人机交互」挂住 git。
 *
 * ## 为什么必须禁掉
 *
 * git 拿不到凭据时会**问用户**（终端提问，或 Windows 上 Git Credential Manager
 * 的弹窗 —— 实测环境里 `credential.helper` 就是 PortableGit 带的 GCM）。
 * Obsidian 里没有人能回答它：那个提问读的 stdin 是一根没人写的管子，
 * 命令就这么挂着。症状是状态栏永远停在「正在推送…」，而且**没有任何报错**。
 *
 * - `GIT_TERMINAL_PROMPT=0` —— git 自己的终端提问直接失败，报
 *   `could not read Username ... terminal prompts disabled`，被 `mapError`
 *   归到鉴权失败，于是用户得到「请检查访问令牌」这句有用的话。
 * - `GCM_INTERACTIVE=never` —— GCM 只用已经存好的凭据，不再弹窗。
 *   **注意它禁的是「问人」，不是「用凭据」**：依赖系统凭据助手的那类用户
 *   （自建 GitLab / 内网 git，见设置页的说明）照常能用。
 */
const GIT_NONINTERACTIVE_ENV = {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    /**
     * 合并时**不要开编辑器写提交信息**。
     *
     * 我们是非交互子进程（stdio 是管道），而 `git merge` 默认会为合并提交打开编辑器。
     * 今天没出事只是因为 git 发现 stdin 不是终端就跳过了 —— 那是**它的实现细节**，
     * 不是我们的保证。这一条把它变成明确的约定：合并提交用默认信息，不等人。
     */
    GIT_MERGE_AUTOEDIT: "no",
    /**
     * 关掉 `filter-branch` 每次开头打的那段弃用警告（十几行，纯噪音）。
     *
     * 我们**知情**：它在 git 官方文档里被标为「弃用、建议换 filter-repo」，
     * 而 filter-repo 是个需要 Python 的第三方脚本 —— 对一个 Obsidian 插件来说
     * 不能要求用户装它。代价是慢（实测 3.5 秒/提交），所以界面上会先把预计耗时算给
     * 用户看（见 `cleanup.ts` 的 `estimateRewriteSeconds`）。
     *
     * 留着这段警告的话，它会被 `wrap` 当成错误输出的一部分带进日志，
     * 排查时反倒要多跳十几行。
     */
    FILTER_BRANCH_SQUELCH_WARNING: "1",
} as const;

/**
 * 绝不能从父进程继承的变量：它们会让 git **去找另一个仓库**。
 *
 * 用户从终端里带着 `GIT_DIR`（或在一个 `git --git-dir=…` 的 shell 里）启动 Obsidian
 * 时，这些变量会原样传给我们的 git 子进程 —— 于是插件操作的不再是库里那个仓库，
 * 而是**别的仓库**，而且看起来一切正常（命令都成功）。这类「静默操作错对象」的坑
 * 必须在这里一刀切掉。
 */
const GIT_REPO_LOCATING_ENV = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
] as const;

/**
 * **simple-git 会拒绝**的变量：它把这些名字当「危险配置」拦下来，直接让整条命令失败。
 *
 * 报错原文（实测）：
 *
 * ```
 * Use of "GIT_PAGER" is not permitted without enabling allowUnsafePager
 * ```
 *
 * 依据是 `@simple-git/argv-parser` 里那张「配置键 → 需要 allowUnsafe* 开关」的表
 * （`core.pager`、`core.editor`、`core.askPass`、`core.sshCommand`、`diff.external`、
 * `init.templateDir`、`sequence.editor`、`credential.helper` …），它同时也校验**子进程环境**，
 * 而 simple-git 3.36 没有把这个开关暴露出来（它的产物里根本没有 `allowUnsafe*` 字样）
 * —— 所以唯一的做法就是**不把这些变量交给它**。
 *
 * 2026-10-02 逐个实测出来的清单（同一批里 `HTTPS_PROXY`、`ALL_PROXY`、`VISUAL`、
 * `SSH_AUTH_SOCK` 等是放行的）：
 *
 * - `GIT_PAGER` / `PAGER` —— 我们的输出是**管道**，分页器毫无意义，还可能挂住子进程；
 * - `GIT_EDITOR` / `EDITOR` / `GIT_SEQUENCE_EDITOR` —— 非交互本来就不该开编辑器；
 * - `GIT_ASKPASS` / `SSH_ASKPASS` —— 我们靠令牌，不靠弹窗问人；
 * - `GIT_SSH` / `GIT_SSH_COMMAND` —— 交给 git 自己的 ssh 配置与 agent（`SSH_AUTH_SOCK` 照常继承）；
 * - `GIT_EXTERNAL_DIFF` —— 我们自己在界面里画 diff；
 * - `GIT_TEMPLATE_DIR` —— 建仓库时的模板目录，与同步无关；
 * - `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` —— **不能覆盖**用户真实的全局/系统配置：
 *   覆盖之后插件里的 git 与用户终端里的 git 读到的配置不是同一份（身份、代理、凭据助手
 *   都可能不同），那正是最难查的一类「终端里好、插件里坏」；
 * - `GIT_PROXY_COMMAND` —— `git://` 的代理命令，本插件不用这个传输。
 */
const GIT_UNSAFE_ENV = [
    "GIT_PAGER",
    "PAGER",
    "GIT_EDITOR",
    "EDITOR",
    "GIT_SEQUENCE_EDITOR",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "GIT_EXTERNAL_DIFF",
    "GIT_TEMPLATE_DIR",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
    "GIT_PROXY_COMMAND",
] as const;

/**
 * 交给 git 子进程的环境：**父进程的环境打底**，再盖上我们的非交互开关。
 *
 * ## 为什么必须打底（2026-10-02 修）
 *
 * `simpleGit().env(...)` 的语义是**替换**环境，不是追加：simple-git 把
 * `_executor.env` 原样交给 `child_process.spawn` 的 `env` 选项，而 Node 的 `env`
 * 选项是**整份替换**。所以原来那两行 `.env(name, value)` 之后，git 子进程的环境里
 * **只剩** `GIT_TERMINAL_PROMPT` 与 `GCM_INTERACTIVE`（实测 `_executor.env` 就是那两
 * 个键）。
 *
 * 后果全是「本机终端里好、插件里坏」那一类：
 * - **代理变量（`HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY`）被丢掉** ——
 *   国内访问 GitHub 大多靠它；丢掉之后 git 只能直连，症状是
 *   「unable to access …」「连不上远端」，而用户在终端里推同一个库完全正常。
 * - `PATH` 丢掉 → `credential.helper`（GCM 等）找不到，鉴权失败会指向错误的方向。
 * - `USERPROFILE` / `HOME` 丢掉 → 全局 `~/.gitconfig` 不一定还生效（代理、凭据助手、
 *   `core.autocrlf`、用户身份都在里面）。
 * - `TEMP`、`SystemRoot`、`SSL_CERT_FILE` 等平台变量丢掉 → 证书与网络栈的一些边角
 *   行为和用户终端里的 git 不一致。
 *
 * 实测（本机 git 2.35.1.windows.2）：环境被剥光的 git 仍然能 `ls-remote`，也就是说这
 * 不是必然立刻失败，而是**看环境** —— 有代理、有自定义凭据助手、或系统资源紧张时才
 * 现形。正因为它不必然失败，这类问题最难查。
 *
 * ## 打底之后必须减掉两批
 *
 * 打底意味着把父进程的一切都带进去，其中两批**必须**去掉：`GIT_REPO_LOCATING_ENV`
 * （会让 git 去找另一个仓库）与 `GIT_UNSAFE_ENV`（simple-git 会因此拒绝执行整条命令）。
 * 两批的取值都是实测出来的，不靠记忆 —— 见各自的注释。
 */
export function gitChildEnv(
    /**
     * 默认取父进程的环境。
     *
     * 走 `process.env`（`eslint.config.mjs` 里给 `src` 声明了这个 Node 全局）而不是
     * `globalThis.process` —— 社区审核有一条 `obsidianmd/no-global-this`，用 `globalThis`
     * 会换来另一条告警。
     */
    parent: Record<string, string | undefined> = process.env
): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [name, value] of Object.entries(parent)) {
        if (value === undefined) continue;
        env[name] = value;
    }
    for (const name of GIT_REPO_LOCATING_ENV) delete env[name];
    for (const name of GIT_UNSAFE_ENV) delete env[name];
    return { ...env, ...GIT_NONINTERACTIVE_ENV };
}

/**
 * 「远端地址是多少」这个探测结果能复用多久（毫秒）。
 *
 * ## 为什么要缓存它（2026-10-01）
 *
 * 鉴权是按远端地址算出来的（GitHub 与 Gitee 注入的用户名不同），所以每次
 * 拿 SimpleGit 实例之前都得先知道远端是谁。原来的写法是**每次都探一遍**：
 * `git()` 先 `rawGetRemoteUrl()`、拿它的结果去比缓存 —— 于是**每一次 git 操作
 * 都白搭一个 `git remote -v` 子进程**。实测这个库上一次 `git remote -v` 约 46 ms，
 * 而一次面板重绘要调 `git()` 四次（大约 185 ms 里外里白烧）、外加
 * `getRemoteUrl()` 自己那一次。
 *
 * 远端地址在**我们自己的代码以外**几乎不会变，变了也只需要最多这么久就自动跟上；
 * 而经由本插件改地址（`setRemoteUrl`）与改设置（`applySettings`）都会**立刻
 * 让缓存作废**，所以「换远端后还用旧令牌」不会发生。
 *
 * 探测本身仍然走 `createGitInstance`（非交互环境变量 + 超时一个都不能少）。
 */
const REMOTE_PROBE_TTL_MS = 5_000;

/**
 * 构造 simple-git 实例。
 *
 * **所有 spawn 路径都要走这里。** 之前有两处各自 `simpleGit(options)`：
 * `git()`（带鉴权）与 `rawGetRemoteUrl()`（不带）—— 逐处补设置必然漏一处，
 * 而漏掉的那一处照样能挂住整个同步。
 *
 * 导出是为了能单独验「非交互环境变量与超时真的挂上去了」：这两条只能验
 * 「我们交给了库什么」，库内部的行为（超时到点 kill 掉子进程）由它自己的
 * 实现保证，而**要观察它就得真造一个卡死的 git 进程** —— 那正是它要防的事。
 */
export function createGitInstance(options: {
    baseDir: string;
    gitPath?: string;
    /** `-c key=value`，来自 `withAuth()` 的令牌注入。 */
    config?: string[];
    /**
     * 块超时（毫秒）；不给就用 `GIT_BLOCK_TIMEOUT_MS`。
     *
     * 只有**按分钟计的长任务**（重写历史）才传别的值 —— 见
     * `SimpleGitManager.gitForLongTask`。默认那个 2 分钟对同步的每一步都够，
     * 但会让一个 9 分钟的重写在第 2 分钟被杀掉，而那时它已经改了一半引用。
     */
    timeoutMs?: number;
}): SimpleGit {
    const instanceOptions: Partial<SimpleGitOptions> = {
        baseDir: options.baseDir,
        timeout: { block: options.timeoutMs ?? GIT_BLOCK_TIMEOUT_MS },
    };
    if (options.gitPath) instanceOptions.binary = options.gitPath;
    if (options.config && options.config.length > 0) instanceOptions.config = options.config;

    const instance = simpleGit(instanceOptions);
    /**
     * 用**对象形式**一次设完（而不是逐个 `env(name, value)`）：对象形式直接替换
     * `_executor.env`，逐个设是往同一个对象里加键 —— 两种写法都会**替换**子进程环境，
     * 所以必须先把父进程环境打底进去，见 `gitChildEnv`。
     */
    instance.env(gitChildEnv());
    return instance;
}

export interface SimpleGitManagerOptions {
    /** vault（git 仓库）的绝对路径。 */
    baseDir: string;
    /** git 可执行文件路径；空用 PATH 里的 git。 */
    gitPath?: string;
    /** 令牌存储。远端是 GitHub/Gitee 且有令牌时自动注入鉴权。 */
    secretStore?: SecretStore;
}

export class SimpleGitManager implements GitManager {
    private baseDir: string;
    private gitPath?: string;
    private readonly secretStore?: SecretStore;

    /** 实例缓存：远端 URL 变化时（setRemoteUrl）要重建以刷新鉴权。 */
    private git_: SimpleGit | undefined;
    private authedForRemote: string | undefined;

    /**
     * 最近一次「远端地址」探测的结果与时刻（见 `REMOTE_PROBE_TTL_MS`）。
     * `url: undefined` 也是有效结果（仓库还没有远端），照样缓存。
     */
    private remoteProbe: { url: string | undefined; at: number } | undefined;

    constructor(options: SimpleGitManagerOptions) {
        this.baseDir = options.baseDir;
        this.gitPath = options.gitPath;
        this.secretStore = options.secretStore;
    }

    /** 设置变化后更新 gitPath（下次调用会重建 SimpleGit 实例）。 */
    applySettings(options: { gitPath?: string }): void {
        if (options.gitPath === this.gitPath) return;
        this.gitPath = options.gitPath;
        this.git_ = undefined;
        this.authedForRemote = undefined;
        // gitPath 变了意味着之前那次探测可能是拿别的 git 跑的，不要复用。
        this.remoteProbe = undefined;
    }

    /**
     * 按当前远端构造带鉴权的 SimpleGit 实例。
     *
     * 注意远端地址走的是**带缓存的** `probeRemoteUrl()`：一次操作里 `git()` 会被
     * 调好几次，每次真去 spawn 一个 `git remote -v` 是本文件历史上最大的一笔
     * 白烧（见 `REMOTE_PROBE_TTL_MS`）。
     */
    private async git(): Promise<SimpleGit> {
        let remoteUrl: string | undefined;
        try {
            // 远端可能还不存在（刚 init）—— 取不到就当无鉴权实例。
            remoteUrl = await this.probeRemoteUrl(REMOTE_PROBE_TTL_MS);
        } catch {
            remoteUrl = undefined;
        }

        if (this.git_ && this.authedForRemote === remoteUrl) return this.git_;

        const credential = remoteUrl
            ? credentialForRemote(remoteUrl, this.secretStore!)
            : undefined;

        this.git_ = createGitInstance({
            baseDir: this.baseDir,
            gitPath: this.gitPath,
            config: withAuth({}, credential).config,
        });
        this.authedForRemote = remoteUrl;
        return this.git_;
    }

    private async revalidateAuth(): Promise<void> {
        this.git_ = undefined;
        this.authedForRemote = undefined;
        await this.git();
    }

    // ── 仓库 ──────────────────────────────────────────────────────────────

    async isRepo(): Promise<boolean> {
        try {
            const git = await this.git();
            return await git.checkIsRepo();
        } catch (err) {
            // 只有「git 都跑不起来」才算失败；目录不是仓库时 checkIsRepo 返回 false。
            throw mapError(err, "checking repository state");
        }
    }

    async init(): Promise<void> {
        const git = await this.git();
        await git.init();
    }

    // ── 状态 ──────────────────────────────────────────────────────────────

    async status(): Promise<RepoStatus> {
        const git = await this.git();
        if (!(await git.checkIsRepo())) {
            // 技术性描述，用户文案由 describeSyncError 拼（见 mapError 的说明）。
            throw new GitNotRepoError("status: not a git repository");
        }
        const raw = await wrap("reading status", () => git.status());
        return mapStatus(raw);
    }

    async fileChanges(): Promise<FileChange[]> {
        const status = await this.status();
        return [...status.staged, ...status.unstaged, ...status.untracked];
    }

    // ── 差异 ──────────────────────────────────────────────────────────────

    /**
     * 某个文件的差异原文。
     *
     * ## 三个选项都不是装饰
     *
     * - `-c core.quotePath=false` —— 不加它，**非 ASCII 路径会被转义成八进制**
     *   （`"a/\344\270\255.md"`），而中文文件名在这个插件的目标场景里是常态。
     *   实测：加与不加的输出差别见 `tests/features/simpleGitManager.test.ts`。
     * - `--no-color` —— 用户可能配了 `color.ui=always`，那样输出里会混进 ANSI
     *   转义序列，行号会解析错、界面会出现乱码方块。
     * - `--no-ext-diff` —— 不加它会走用户在 `.gitconfig` 里配的外部 diff 工具，
     *   而那类工具（比如 difftastic）输出的**不是 unified diff**，
     *   解析器会把它当成一片上下文行。
     *
     * 未跟踪文件这里什么都不会输出（git 的行为），由 `SyncService` 兜底 ——
     * 那是展示层的决策，不该塞进这一层。
     */
    async diffFile(path: string, options: { staged?: boolean } = {}): Promise<string> {
        const git = await this.git();
        const args = [
            "-c",
            "core.quotePath=false",
            "diff",
            "--no-color",
            "--no-ext-diff",
        ];
        if (options.staged) args.push("--cached");
        args.push("--", path);
        return wrap("reading file diff", () => git.raw(args));
    }

    /**
     * 某条提交引入的改动。
     *
     * `-m --first-parent` 是为了**合并提交**：git 对合并提交默认不输出任何差异
     * （它不知道该跟哪个父提交比），于是用户在历史里点开一个合并提交会看到一片
     * 空白。加上这两个选项后它跟第一父提交比 —— 那正是「这次合并带进来了什么」。
     * 对普通提交这两个选项没有副作用（实测）。
     *
     * `--format=` 抑制提交头（作者、日期、message），这里只要补丁本身。
     */
    async commitPatch(hash: string): Promise<string> {
        const git = await this.git();
        return wrap("reading commit diff", () =>
            git.raw([
                "-c",
                "core.quotePath=false",
                "show",
                "--no-color",
                "--no-ext-diff",
                "--format=",
                "-m",
                "--first-parent",
                hash,
                "--",
            ])
        );
    }

    /**
     * 测试远端可达性与鉴权（只读）。
     *
     * 用 `ls-remote` 而不是 `fetch`：前者不写任何本地状态（不动 refs、不动 index），
     * 纯粹是「能不能连上、凭据认不认」的探测。
     *
     * 这里**不吞异常** —— 让 `mapError` 把 git 的失败翻译成领域错误
     * （鉴权失败 → `GitAuthError`，连不上 → 原始网络错误），
     * 上层就能给出「令牌无效」和「网络不通」这两种完全不同的引导。
     */
    async testRemoteAccess(): Promise<number> {
        // 传 0：这一步的结论必须基于**现在**这个远端地址，不能复用缓存
        // （见 `probeRemoteUrl`）。它只由诊断入口调用，多一个子进程无所谓。
        const remoteUrl = await this.probeRemoteUrl(0);
        if (!remoteUrl) {
            throw new NoUpstreamError("test remote access: no remote configured");
        }

        const git = await this.git();
        const output = await wrap("testing remote access", () =>
            git.raw(["ls-remote", "--heads", "origin"])
        );

        return output.split("\n").filter((line) => line.trim().length > 0).length;
    }

    // ── 暂存与提交 ────────────────────────────────────────────────────────

    async stage(paths: string[]): Promise<void> {
        const git = await this.git();
        await wrap("staging files", () =>
            paths.length > 0 ? git.add(paths) : git.add("-A")
        );
    }

    async unstage(paths: string[]): Promise<void> {
        const git = await this.git();
        try {
            // restore --staged 对已跟踪与新增文件都成立，但要求 HEAD 存在。
            await wrap("unstaging files", () =>
                git.raw(["restore", "--staged", "--", ...paths])
            );
        } catch (err) {
            // 全新仓库还没有任何提交（HEAD 未出生），restore 拿不到基准；
            // 等价做法是把文件从 index 里摘掉、保留工作区内容。
            const message = err instanceof Error ? err.message : String(err);
            if (!HEAD_UNBORN_RE.test(message)) {
                throw mapError(err, "unstaging files");
            }
            await wrap("unstaging files (no HEAD)", () =>
                git.raw(["rm", "--cached", "--", ...paths])
            );
        }
    }

    /**
     * 把路径从**索引**里摘掉，工作区文件一个都不动 —— `git rm -r --cached`。
     *
     * ## 与 `unstage` 的区别
     *
     * `unstage`（`restore --staged`）只是把「已暂存的改动」撤回，文件仍然是**已跟踪**的
     * —— 下一次 `git add -A` 再提交，它照样在。这里要的是「退出跟踪」：从索引里消失，
     * 于是下次提交记下的是一条**删除**，而工作区那份还在（`.gitignore` 也才真正生效）。
     *
     * ## 为什么必须带 `--ignore-unmatch`
     *
     * 某个文件夹里一个已跟踪文件都没有时（刚配好、还没提交过），`git rm` 会以
     * 「pathspec did not match」失败并**中止整条命令** —— 那样前面匹配上的文件夹
     * 也白摘了。带上它，不匹配的路径被安静跳过。
     *
     * ## 为什么要分批
     *
     * 「按扩展名忽略图片」时路径是**逐个文件**列出来的（一次可能几千条），而命令行
     * 有长度上限（Windows 约 32k 字符）—— 一次塞进去会以「命令行过长」失败，
     * 那条错误跟「摘索引」毫无关系，用户根本猜不到。分批是纯保险，不影响语义。
     *
     * 不做提示、不额外刷新：调用方（`SyncService.untrackPaths`）负责排队与刷新，
     * 设置页负责把结果讲给用户听。
     */
    async untrack(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        const git = await this.git();
        for (let index = 0; index < paths.length; index += UNTRACK_BATCH_SIZE) {
            const batch = paths.slice(index, index + UNTRACK_BATCH_SIZE);
            await wrap("untracking paths", () =>
                git.raw(["rm", "-r", "--cached", "--ignore-unmatch", "--", ...batch])
            );
        }
    }

    /**
     * 放弃这些文件的未提交改动（`git restore --source=HEAD --staged --worktree`）。
     *
     * 详见接口注释。两点实现上的讲究：
     *
     * - **分批**：与 `untrack` 同一个理由 —— 一次几千个路径会撞上命令行长度上限，
     *   而「放弃全部更改」在改动很多时是真实用法；
     * - `--source=HEAD` 显式写出来：不带它时 `git restore` 默认从**索引**取内容，
     *   那对「索引里也有改动」的文件等于什么都没做（用户会看到「点了没反应」）。
     */
    async restore(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        const git = await this.git();
        for (let index = 0; index < paths.length; index += UNTRACK_BATCH_SIZE) {
            const batch = paths.slice(index, index + UNTRACK_BATCH_SIZE);
            await wrap("discarding changes", () =>
                git.raw(["restore", "--source=HEAD", "--staged", "--worktree", "--", ...batch])
            );
        }
    }

    /**
     * 当前已被跟踪的所有路径（`git ls-files`）。
     *
     * 用 `-z`：路径里的空格、中文、换行都不会把它拆错（`-z` 是 NUL 分隔）。
     * 非仓库时返回空数组而不是抛错 —— 调用它的界面（「按扩展名忽略图片」）已经在
     * 上游确认过仓库存在，这里再抛一次只会把「什么都没有」变成一句技术性报错。
     */
    async listTracked(): Promise<string[]> {
        const git = await this.git();
        try {
            const raw = await wrap("listing tracked files", () => git.raw(["ls-files", "-z"]));
            return raw.split("\0").filter((path) => path.length > 0);
        } catch (err) {
            if (err instanceof GitNotRepoError) return [];
            throw mapError(err, "listing tracked files");
        }
    }

    /**
     * 这批路径里，哪些在索引里记的是**嵌套仓库**（gitlink，模式 `160000`）。
     *
     * ## 为什么需要它（2026-10-04，用户看着面板问「为什么这三项是文件夹地址、没有具体改动却算进了更改」）
     *
     * 用户在库的插件目录里**就地**开发插件，那些目录各自带一个 `.git`，于是库把
     * 它们当成「指针」记进了索引。这种行有三个反直觉之处，用户一个人是猜不出来的：
     * 暂存不掉（指针没变，`git add` 什么也记不下）、没有文件级差异、会永远挂在
     * 「更改」里。面板认出它们之后才能说清这件事，并给一个能真正了结它的按钮。
     *
     * ## 为什么问 git 而不是自己看
     *
     * 判断「这是不是嵌套仓库」有几种土办法（看目录里有没有 `.git`），但都会漏：
     * 索引里记着 gitlink 而目录已经被删掉也是同一件事，而这种情形只有索引知道。
     * `git ls-files -s` 给的是**权威答案**（模式位 160000），而且一次就能问一批。
     *
     * 传空数组时**不碰 git**：没人会因为这个功能白搭一个子进程。
     */
    async nestedRepoPaths(paths: string[]): Promise<string[]> {
        if (paths.length === 0) return [];
        const git = await this.git();
        try {
            const raw = await wrap("listing index entries", () =>
                git.raw(["ls-files", "-s", "-z", "--", ...paths])
            );
            const nested: string[] = [];
            for (const record of raw.split("\0")) {
                if (record.length === 0) continue;
                // 形状：`<mode> <object> <stage>\t<path>`（`-z` 时制表符后只有路径）
                const tab = record.indexOf("\t");
                if (tab < 0) continue;
                if (record.slice(0, tab).startsWith(GITLINK_MODE)) {
                    nested.push(record.slice(tab + 1));
                }
            }
            return nested;
        } catch (err) {
            if (err instanceof GitNotRepoError) return [];
            throw mapError(err, "listing index entries");
        }
    }

    async commit(message: string): Promise<boolean> {
        const git = await this.git();
        try {
            const result = await git.commit(message);
            // simple-git 对「nothing to commit」不抛错，返回 changes=0 的摘要。
            const summary = Array.isArray(result) ? result[0]!.summary : result.summary;
            return summary.changes > 0;
        } catch (err) {
            if (isNothingToCommit(err)) return false;
            throw mapError(err, "committing");
        }
    }

    // ── 远端操作 ──────────────────────────────────────────────────────────

    /**
     * 拉取并整合。
     *
     * 流程照搬 obsidian-git 验证过的形态：
     * `fetch` → 比较本地/远端引用 → 没有新东西直接返回 →
     * 按策略整合 → 用两次引用的 diff 统计受影响文件。
     *
     * merge/rebase 失败时检查冲突文件：有冲突就抛 `ConflictError`
     * （仓库留在冲突状态，等用户处理或 abortMerge）；否则抛原始错误。
     */
    async pull(strategy: SyncStrategy): Promise<SyncOutcome> {
        const git = await this.git();

        const status = await wrap("reading status before pull", () => git.status());
        if (!status.current || !status.tracking) {
            // 技术性描述；用户文案由 describeSyncError 按类型拼。
            throw new NoUpstreamError("pull: current branch has no tracking remote branch");
        }

        const localCommit = await wrap("resolving local head", () =>
            git.revparse([status.current!])
        );

        // `--progress` 是必需的，不是好看：git 在 stderr **不是终端**时默认
        // **不输出传输进度**（我们正是这种情况 —— 子进程的 stderr 是管道）。
        // 而上面那个无输出超时全靠「有没有输出」来判断死活：没有进度输出时，
        // 一次慢但正常的传输会被当成卡死杀掉。带上它，传输中就有输出 → 计时重置。
        await wrap("fetching", () => git.fetch(["--progress"]));

        const upstreamCommit = await wrap("resolving remote head", () =>
            git.revparse([status.tracking!])
        );

        if (localCommit === upstreamCommit) {
            return { kind: "up-to-date" };
        }

        try {
            if (strategy === "merge") {
                await git.merge([status.tracking]);
            } else if (strategy === "rebase") {
                await git.rebase([status.tracking]);
            } else {
                await this.resetToRemote(git, upstreamCommit);
            }
        } catch (err) {
            const conflicted = await this.conflictedFiles(git);
            if (conflicted.length > 0) {
                // 消息是技术性描述；`files` 才是给用户看的（数量与清单）。
                throw new ConflictError(
                    `pull (${strategy}): ${conflicted.length} conflicted file(s)`,
                    conflicted,
                    { cause: err }
                );
            }
            throw mapError(err, `pulling (${strategy})`);
        }

        const afterCommit = await wrap("resolving head after pull", () =>
            git.revparse([status.current!])
        );
        const diff = await wrap("diffing pulled changes", () =>
            git.raw(["diff", "--name-only", `${localCommit}..${afterCommit}`])
        );
        const files = diff.split(/\r\n|\r|\n/).filter((line) => line.length > 0);

        return { kind: "pulled", files: files.length };
    }

    /**
     * reset 策略的实现：「以远端为准」。
     *
     * 参考项目 obsidian-git 用 update-ref + 普通_reset_，那会让工作区停在
     * 旧内容、与移动后的 HEAD 脱节 —— 下一次自动提交会把远端的修改倒推回去。
     * 这里用 `reset --hard` 真正对齐；为避免不可恢复的丢失，先把未提交改动
     * （含未跟踪文件）stash 起来，用户仍可从 stash 里找回。
     */
    private async resetToRemote(git: SimpleGit, upstreamCommit: string): Promise<void> {
        // 冲突现场先放弃（merge/rebase --abort），reset 的语义就是放弃本地整合。
        try {
            const pre = await git.status();
            if (pre.conflicted.length > 0) {
                await this.abortMerge();
            }
            const mid = await git.status();
            if (mid.files.length > 0) {
                await git.stash([
                    "push",
                    "--include-untracked",
                    "--message",
                    "SyncHub: auto-stash before reset pull",
                ]);
            }
        } catch (err) {
            logger.debug("pre-reset stash skipped", err);
        }
        await git.raw(["reset", "--hard", upstreamCommit]);
    }

    async abortMerge(): Promise<void> {
        const git = await this.git();
        // merge --abort 对「不在合并中」的仓库会报错，这里吞掉 ——
        // 调用方是「有冲突就放弃」的恢复路径，多余调用不是错误。
        try {
            await git.raw(["merge", "--abort"]);
        } catch (err) {
            logger.debug("merge --abort failed (probably not merging)", err);
        }
        try {
            await git.raw(["rebase", "--abort"]);
        } catch (err) {
            logger.debug("rebase --abort failed (probably not rebasing)", err);
        }
    }

    async push(): Promise<SyncOutcome> {
        const git = await this.git();

        const status = await wrap("reading status before push", () => git.status());
        if (!status.current) {
            throw new DetachedHeadError("push: HEAD is detached");
        }

        // `--progress` 是必需的，不是好看：git 在 stderr **不是终端**时默认
        // **不输出传输进度**（我们正是这种情况 —— 子进程的 stderr 是管道）。
        // 而无输出超时全靠「有没有输出」判断死活：没有进度输出时，
        // 一次慢但正常的推送会被当成卡死杀掉。带上它，传输中就有输出 → 计时重置。
        await wrap("pushing", () => git.push(["--progress", "-u", "origin", status.current!]));
        return { kind: "pushed" };
    }

    async fetch(): Promise<void> {
        const git = await this.git();
        await wrap("fetching", () => git.fetch(["--progress"]));
    }

    // ── 分支 ──────────────────────────────────────────────────────────────

    async listBranches(): Promise<Array<{ name: string; current: boolean }>> {
        const git = await this.git();
        const summary = await wrap("listing branches", () => git.branchLocal());
        return Object.values(summary.branches).map((branch) => ({
            name: branch.name,
            current: branch.current,
        }));
    }

    async checkout(branch: string): Promise<void> {
        const git = await this.git();
        await wrap(`checking out ${branch}`, () => git.checkout(branch));
    }

    async createBranch(name: string): Promise<void> {
        const git = await this.git();
        await wrap(`creating branch ${name}`, () =>
            git.raw(["checkout", "-b", name])
        );
    }

    async deleteBranch(name: string): Promise<void> {
        const git = await this.git();
        await wrap(`deleting branch ${name}`, () => git.deleteLocalBranch(name));
    }

    async log(limit: number): Promise<CommitInfo[]> {
        const git = await this.git();
        // 注意选项键：simple-git 把对象键转成 --max-count=N；写成 max 会原样传给 git 报错。
        const result = await wrap("reading log", () => git.log({ maxCount: limit }));
        return result.all.map((entry) => ({
            hash: entry.hash,
            shortHash: entry.hash.slice(0, 7),
            message: entry.message,
            author: entry.author_name,
            // simple-git 默认的 date 就是 ISO 字符串，直接透传。
            date: new Date(entry.date).toISOString(),
        }));
    }

    // ── 远端地址 ──────────────────────────────────────────────────────────

    async getRemoteUrl(): Promise<string | undefined> {
        // 与 `git()` 共用同一次探测：面板一次重绘里两处都要远端地址，
        // 以前这是两个 `git remote -v` 子进程。
        return this.probeRemoteUrl(REMOTE_PROBE_TTL_MS);
    }

    /**
     * 仓库对象库的体积（`git count-objects -v`）。
     *
     * 只读、只碰本地：不连远端、不动引用、不写任何文件。解析交给
     * `parseCountObjects`（纯函数，单独测）—— 这条命令的输出格式很稳定，
     * 但认不出时**抛错**比返回一个 0 好：调用方会显示「读不到」，
     * 而 0 B 会被当成「空仓库」。
     */
    async repoSize(): Promise<RepoSize> {
        const git = await this.git();
        const output = await wrap("reading repository size", () =>
            git.raw(["count-objects", "-v"])
        );
        const size = parseCountObjects(output);
        if (!size) {
            throw new Error(`unrecognised count-objects output: ${output.trim().slice(0, 120)}`);
        }
        return size;
    }

    /**
     * 远端地址；`maxAgeMs` 以内的探测结果直接复用（见 `REMOTE_PROBE_TTL_MS`）。
     *
     * 传 0 就是「立刻重新探测」—— 只读的诊断（`testRemoteAccess`）用得到：
     * 它存在的意义就是**现在**能不能连上，不能拿几秒前的结论回答。
     */
    private async probeRemoteUrl(maxAgeMs: number): Promise<string | undefined> {
        if (this.remoteProbe && Date.now() - this.remoteProbe.at < maxAgeMs) {
            return this.remoteProbe.url;
        }

        const url = await this.rawGetRemoteUrl();
        this.remoteProbe = { url, at: Date.now() };
        return url;
    }

    private async rawGetRemoteUrl(): Promise<string | undefined> {
        // 也走 createGitInstance：这条路径每次 `git()` 都会跑，
        // 而且同样会 spawn 一个 git 子进程（漏掉守卫就漏掉一个能挂住的地方）。
        const git = createGitInstance({
            baseDir: this.baseDir,
            gitPath: this.gitPath,
        });
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((remote) => remote.name === "origin");
        return origin?.refs.push ?? origin?.refs.fetch;
    }

    async setRemoteUrl(url: string): Promise<void> {
        const git = await this.git();
        const remotes = await wrap("listing remotes", () => git.getRemotes());
        const exists = remotes.some((remote) => remote.name === "origin");
        if (exists) {
            await wrap("setting remote url", () =>
                git.remote(["set-url", "origin", url])
            );
        } else {
            await wrap("adding remote", () => git.addRemote("origin", url));
        }
        // 远端变了，缓存里那条探测结果立刻作废 —— 否则接下来这 5 秒里
        // 回显与鉴权都还按旧地址算。
        this.remoteProbe = undefined;
        // 远端变了鉴权对象可能也变了（GitHub → Gitee）。
        await this.revalidateAuth();
    }

    // ── 清理：体检 / 回收 / 深度清理 ────────────────────────────────────────

    /**
     * 体检（只读）：历史里哪些东西占了空间。
     *
     * 两条命令**并行**发：它们互不依赖，而 `rev-list --objects --all` 在历史长的库上
     * 要几秒 —— 串起来等于白等一倍。
     *
     * 用 `--batch-all-objects` 而不是「把 sha 喂给 `--batch-check` 的标准输入」：
     * 后者要求往子进程写 stdin，而本项目的 git 调用统一走 simple-git 的 `raw()`，
     * 它没有 stdin 通道。代价是这份输出包含不可达对象 —— 由 `summarizeHistory`
     * 按可达集合取用（见 `historyObjects.ts`）。
     *
     * `-c core.quotePath=false` 不能省：不加它中文路径会被转义成八进制串，
     * 报告里会出现一屏看不懂的东西（同 `diffFile`）。
     */
    async historyObjects(): Promise<HistorySummary> {
        const git = await this.git();
        const [listing, objects] = await Promise.all([
            wrap("listing history objects", () =>
                git.raw(["-c", "core.quotePath=false", "rev-list", "--objects", "--all"])
            ),
            wrap("reading object sizes", () =>
                git.raw(["cat-file", "--batch-all-objects", "--batch-check"])
            ),
        ]);
        return summarizeHistory(parseRevListObjects(listing), parseBatchCheck(objects));
    }

    /**
     * 当前分支的提交数（用来估算重写耗时）。
     *
     * HEAD 还没出生（全新仓库、一次都没提交过）时 `rev-list` 会失败 ——
     * 那是**0 个提交**，不是错误：调用方据此给出「没东西可清」而不是一句技术性报错。
     * 但 git 跑不起来、目录不是仓库这类错误照常往上抛，否则用户拿到的是
     * 「0 个提交」这种看起来正常、实际完全不对的结论。
     */
    async countCommits(): Promise<number> {
        const git = await this.git();
        try {
            const output = await wrap("counting commits", () =>
                git.raw(["rev-list", "--count", "HEAD"])
            );
            const count = Number.parseInt(output.trim(), 10);
            return Number.isFinite(count) ? count : 0;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (/unknown revision|bad revision|does not have any commits/i.test(message)) return 0;
            throw err;
        }
    }

    /** 回收：`git gc --prune=now`。只清不可达对象，不碰任何引用（见接口注释）。 */
    async gc(): Promise<void> {
        const git = await this.gitForLongTask(LONG_TASK_TIMEOUT_MS);
        await wrap("garbage collecting", () => git.raw(["gc", "--prune=now"]));
    }

    /**
     * 深度清理：把指定路径从全部历史里剔除。**本插件唯一不可逆的动作**，
     * 完整的设计理由见 `GitManager.rewriteHistory` 的接口注释。
     *
     * 执行顺序上有三处是刻意的：
     *
     * 1. **备份引用在动手之前建**。万一重写中途被强杀（用户关掉 Obsidian、
     *    系统休眠），退路已经在 refs 里 —— 事后补建是补不出来的，
     *    那时 `previousHead` 已经从所有引用上消失了。
     * 2. **超时按预计耗时放宽**。默认的 2 分钟块超时会让一个 9 分钟的重写
     *    在第 2 分钟被杀掉，而那时它已经改了一半引用 —— 这种「报错与后果对不上」
     *    的失败最难收拾。宁可等。
     * 3. **重写的引用集合是 `--branches --tags --remotes` 而不是 `--all`**。
     *    `--all` 会把 `refs/obsync-backup/*` 也一起改写 —— 备份于是**安静地**
     *    指向新历史，等于没有备份。2026-10-09 在合成仓上实测确认过这个差别。
     */
    async rewriteHistory(paths: string[]): Promise<RewriteResult> {
        if (paths.length === 0) {
            throw new HistoryRewriteBlockedError("rewrite history: no paths given", "no-paths");
        }

        const git = await this.git();

        // filter-branch 自己会拒绝脏工作区（`Cannot rewrite branches: Your index
        // contains uncommitted changes.`），但它的原话是一句英文技术描述 ——
        // 用户不知道要先去提交。所以这里先拦，抛一个带类型码的错误。
        //
        // 只看 staged / unstaged：**未跟踪文件不拦** —— 库里有未跟踪文件是常态
        // （笔记草稿、临时文件），filter-branch 也不在乎它们。
        const status = await this.status();
        if (status.staged.length > 0 || status.unstaged.length > 0) {
            throw new HistoryRewriteBlockedError(
                "rewrite history: uncommitted changes in the index or working tree",
                "dirty-tree"
            );
        }

        const commitsBefore = await this.countCommits();
        if (commitsBefore === 0) {
            throw new HistoryRewriteBlockedError("rewrite history: no commits yet", "no-commits");
        }

        // 上一次被中断留下的临时目录会让 filter-branch 直接退出
        // （`fatal: .git-rewrite already exists, please remove it`），
        // 而用户看到的是「点了没反应」。它只可能是我们自己留下的，清掉。
        await this.removeStaleRewriteDir();

        const previousHead = await this.headHash();
        const backupRef = backupRefName(new Date());
        await wrap("creating backup ref", () =>
            git.raw(["update-ref", backupRef, previousHead])
        );

        const timeoutMs = Math.max(
            GIT_BLOCK_TIMEOUT_MS,
            estimateRewriteSeconds(commitsBefore) * 1000 * 3
        );
        const longGit = await this.gitForLongTask(timeoutMs);

        // 路径来自用户勾选，**不是可信输入**：`--index-filter` 的值是一段交给 `sh`
        // 跑的脚本，空格、`$`、反引号都会被解释。`shellQuote` 负责这件事。
        const filter = `git rm -r --cached --ignore-unmatch -- ${paths
            .map(shellQuote)
            .join(" ")}`;

        try {
            await wrap("rewriting history", () =>
                longGit.raw([
                    "filter-branch",
                    "--index-filter",
                    filter,
                    "--prune-empty",
                    "--",
                    "--branches",
                    "--tags",
                    "--remotes",
                ])
            );
        } catch (err) {
            // 失败也要让日志里留下备份引用的名字 —— 用户此刻最需要知道的是「退路在哪」。
            logger.error("history rewrite failed", { backupRef, paths, err });
            throw err;
        }

        return {
            previousHead,
            head: await this.headHash(),
            backupRef,
            commitsBefore,
            commitsAfter: await this.countCommits(),
        };
    }

    /** 本插件建的历史备份引用（新的在前）。见 `cleanup.ts` 的 `backupRefName`。 */
    async listBackups(): Promise<string[]> {
        const refs = await this.listRefs(BACKUP_REF_PREFIX);
        // 名字里的时间戳可排序（`20261009-231500`），倒过来就是新的在前。
        return refs.sort((a, b) => b.localeCompare(a));
    }

    /**
     * 丢弃备份并回收空间 —— 重写的第二步，也是真正释放空间的那一步。
     *
     * 为什么必须分两步（而不是重写完顺手 gc 掉）：重写之后旧对象仍然被
     * 备份引用与 `refs/original/*` 拉着，**体积一点都不会降**。这是刻意的 ——
     * 先让用户确认库还能正常用，再丢退路。把两步合成一步的话，用户在
     * 「库看起来坏了」的同时也失去了唯一的回退点。
     */
    async discardBackups(): Promise<void> {
        const git = await this.git();

        for (const ref of await this.listBackups()) {
            await wrap("deleting backup ref", () => git.raw(["update-ref", "-d", ref]));
        }

        // filter-branch 自己留下的 `refs/original/*` 同样拉着全部旧对象 ——
        // 不删它空间永远释放不出来。这正是「跑完重写、体积一点没变」的原因。
        for (const ref of await this.listRefs("refs/original/")) {
            await wrap("deleting original ref", () => git.raw(["update-ref", "-d", ref]));
        }

        // 过期 reflog：旧提交在被「最近引用过」期间不算不可达，不清它 gc 也收不走。
        // **这一步会清掉用户的 reflog**（那是他撤销误操作的凭据）—— 所以它属于
        // 「丢弃备份」这个明确的动作，不能藏在「回收」里。
        await wrap("expiring reflog", () =>
            git.raw(["reflog", "expire", "--expire=now", "--all"])
        );

        const longGit = await this.gitForLongTask(LONG_TASK_TIMEOUT_MS);
        await wrap("garbage collecting", () => longGit.raw(["gc", "--prune=now"]));
    }

    /**
     * 强制推送 —— 重写历史之后本地与远端必然分叉，普通 `push` 会被拒绝。
     *
     * 为什么是 `--force` 而不是更安全的 `--force-with-lease`：lease 比对的是
     * 本地记录的远端值，而重写时 `refs/remotes/*` 也被一起改写了 ——
     * 于是那个值已经是新的，lease 永远不会拒绝，**看起来安全实际没有保护**。
     * 与其留一个假的保护，不如用 `--force` 并在界面上把话说清楚。
     */
    async forcePush(): Promise<SyncOutcome> {
        const git = await this.git();
        const status = await wrap("reading status before push", () => git.status());
        if (!status.current) {
            throw new DetachedHeadError("force push: HEAD is detached");
        }
        // `--progress` 同 `push()`：子进程的 stderr 是管道，不加它 git 不输出传输进度，
        // 而无输出超时全靠「有没有输出」判断死活。
        await wrap("force pushing", () =>
            git.push(["--progress", "--force", "-u", "origin", status.current!])
        );
        return { kind: "pushed" };
    }

    // ── 内部 ──────────────────────────────────────────────────────────────

    /**
     * 为「按分钟计的长任务」造一个实例：与 `git()` 同源（同样的鉴权与非交互环境），
     * 但**块超时由调用方给**。
     *
     * 不缓存实例：这些动作一次跑一个，缓存只会带来「拿到一个超时不对的实例」的风险。
     */
    private async gitForLongTask(timeoutMs: number): Promise<SimpleGit> {
        let remoteUrl: string | undefined;
        try {
            remoteUrl = await this.probeRemoteUrl(REMOTE_PROBE_TTL_MS);
        } catch {
            remoteUrl = undefined;
        }
        const credential = remoteUrl
            ? credentialForRemote(remoteUrl, this.secretStore!)
            : undefined;
        return createGitInstance({
            baseDir: this.baseDir,
            gitPath: this.gitPath,
            config: withAuth({}, credential).config,
            timeoutMs,
        });
    }

    /** 当前 HEAD 的完整哈希。 */
    private async headHash(): Promise<string> {
        const git = await this.git();
        return (await wrap("reading HEAD", () => git.raw(["rev-parse", "HEAD"]))).trim();
    }

    /** 某个前缀下的全部引用名（`for-each-ref`）。不是仓库时返回空数组。 */
    private async listRefs(prefix: string): Promise<string[]> {
        const git = await this.git();
        try {
            const output = await wrap("listing refs", () =>
                git.raw(["for-each-ref", "--format=%(refname)", prefix])
            );
            return output
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        } catch (err) {
            if (err instanceof GitNotRepoError) return [];
            throw mapError(err, "listing refs");
        }
    }

    /**
     * 清掉上一次中断留下的 `.git-rewrite`。
     *
     * 两个候选位置都看：标准位置是 `$GIT_DIR/.git-rewrite`，但如果上一次运行时
     * `GIT_DIR` 被显式设成了仓库根（终端里带变量启动 Obsidian 就会这样），
     * 临时目录会落在**库根**。实测两种都遇到过，所以两个都清 —— 代价是两次 stat。
     *
     * 拿不到文件系统（非桌面端）时安静跳过：那种环境里同步模块本来就不加载，
     * 真走到了也让 filter-branch 自己报错，比在这里抛一个看不懂的异常好。
     */
    private async removeStaleRewriteDir(): Promise<void> {
        // 用 `require` 而不是静态 import：审核规则 `obsidianmd/no-nodejs-modules` 禁止
        // 静态导入 Node 内置模块（移动端没有 Node，静态导入会让整个插件在移动端加载失败）。
        // 同步模块只在桌面端动态加载，所以这里是安全的 —— 与 `commitMessage.ts` 同一写法。
        let fs: typeof import("node:fs");
        let path: typeof import("node:path");
        try {
            fs = require("node:fs") as typeof import("node:fs");
            path = require("node:path") as typeof import("node:path");
        } catch (err) {
            logger.debug("no filesystem access, skipping rewrite temp cleanup", err);
            return;
        }

        const git = await this.git();
        let gitDir: string;
        try {
            gitDir = (
                await wrap("locating git directory", () => git.raw(["rev-parse", "--git-dir"]))
            ).trim();
        } catch (err) {
            logger.debug("could not locate git dir for rewrite cleanup", err);
            return;
        }

        const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(this.baseDir, gitDir);
        const candidates = [
            path.join(absoluteGitDir, REWRITE_TEMP_DIR),
            path.join(this.baseDir, REWRITE_TEMP_DIR),
        ];

        for (const candidate of candidates) {
            if (!fs.existsSync(candidate)) continue;
            try {
                fs.rmSync(candidate, { recursive: true, force: true });
                logger.debug("removed stale filter-branch temp dir", candidate);
            } catch (err) {
                logger.warn("could not remove stale filter-branch temp dir", candidate, err);
            }
        }
    }

    private async conflictedFiles(git: SimpleGit): Promise<string[]> {
        try {
            const status = await git.status();
            return status.conflicted;
        } catch {
            return [];
        }
    }
}

// ── 状态映射 ────────────────────────────────────────────────────────────────

function mapStatus(raw: StatusResult): RepoStatus {
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const untracked: FileChange[] = [];

    for (const file of raw.files as FileStatusResult[]) {
        const change = toFileChange(file);
        if (!change) continue;

        if (change.status === "untracked") {
            untracked.push(change);
            continue;
        }

        // 同一个文件可能既有暂存部分又有未暂存部分（改了又改），
        // simple-git 会把它拆成两条 —— 按各自的状态位归类。
        if (file.index !== " " && file.index !== "?") staged.push(change);
        if (file.working_dir !== " " && file.working_dir !== "?") {
            unstaged.push(change);
        }
    }

    return {
        branch: raw.current ?? null,
        staged,
        unstaged,
        untracked,
        conflicted: raw.conflicted,
        // simple-git 在没有 upstream 时 ahead/behind 均为 0，无法与「真 0」区分，
        // 所以用 tracking 的有无来表达 null 语义。
        ahead: raw.tracking ? raw.ahead : null,
        behind: raw.tracking ? raw.behind : null,
    };
}

function toFileChange(file: FileStatusResult): FileChange | undefined {
    const status = mapStatusChar(file.index, file.working_dir);
    if (!status) {
        logger.debug(`unrecognized git status chars: ${file.index}/${file.working_dir} for ${file.path}`);
        return undefined;
    }
    return {
        path: file.path,
        status,
        previousPath: file.from,
    };
}

// ── 错误映射 ────────────────────────────────────────────────────────────────

/**
 * 把 simple-git 的错误翻译成领域错误。
 *
 * 只依赖错误文本做分类是无奈之举（git 的退出码不区分鉴权与网络），
 * 所以匹配词表尽量取自 git 各版本的稳定输出，宁漏勿错 ——
 * 认不出来的原样上抛，调用方还能看到原始信息。
 *
 * **这里抛的 message 是技术性描述，不是给用户看的话。**
 * 本层拿不到 `t`（纯逻辑不该依赖 i18n），所以只写清「在做什么时失败了 + git 的原话」，
 * 面向用户的文案由 `describeSyncError` 在展示层按类型拼。
 * 早期版本把中文文案直接写在这里，结果英文界面下会冒出中文 —— 别再走回头路。
 */
/**
 * 把 git 的失败翻译成领域错误。
 *
 * 导出是为了能单独测这些正则 —— 它们只能靠**真实的 git 输出**校准，
 * 而靠真实仓库去触发每一条代价很高（有些还要私有仓库和令牌）。
 * 用真实输出当 fixture 直接测分类，比等集成测试偶发覆盖可靠得多。
 */
export function mapError(err: unknown, what: string): Error {
    const message = err instanceof Error ? err.message : String(err);
    const detail = `${what}: ${message}`;

    if (/spawn .* ENOENT|command not found|not recognized as/i.test(message)) {
        return new GitBinaryMissingError(`git executable not found (${detail})`, {
            cause: err,
        });
    }
    if (/not a git repository/i.test(message)) {
        return new GitNotRepoError(`not a git repository (${detail})`, { cause: err });
    }
    // 放在鉴权判断**之前**：simple-git 的超时插件 kill 掉进程后，有些 git 版本
    // 还会补一句「Authentication failed」之类的输出 —— 那只是症状，
    // 真正的结论是「它卡住了」，报成鉴权失败会把用户指去查一个没问题的令牌。
    // 两种措辞都收：`block timeout reached` 是 simple-git 自己的，
    // `timed out` 是 git/curl 的（连接层面超时，对用户是同一件事）。
    if (/block timeout reached|timed out/i.test(message)) {
        return new GitTimeoutError(`git operation timed out (${detail})`, { cause: err });
    }
    /**
     * 连不上远端。**放在鉴权判断之前**：连不上时 git 常把
     * 「could not read Username」一起打出来（它连凭据助手都还没问到），
     * 那只是症状 —— 报成鉴权失败会把用户指去反复检查一个没问题的令牌
     * （与超时那条同一个理由）。
     *
     * ## 判据必须要求「网络层」的措辞
     *
     * `unable to access` 单独**不能**当判据：HTTP 层的失败也是这句话 ——
     * Gitee 的「用户名不被支持」服务端原文就是
     * `fatal: unable to access '…': The requested URL returned error: 403`
     * （见 `gitErrorMapping.test.ts` 里逐字照抄的那条）。用它当判据会把鉴权类错误
     * 一并吞掉，而那恰好是最需要说清方向的一类。
     *
     * 所以：出现明确的网络层措辞就算；只有 `unable to access` 时，还要**不是**
     * `returned error: <HTTP 状态码>`（那是服务端答复了，只是答复是拒绝）。
     */
    const networkHints =
        /getaddrinfo|could ?n[o']?t resolve host|name or service not known|temporary failure in name resolution|nodename nor servname|failed to connect|connection (refused|reset|timed out)|network is unreachable|ssl certificate problem|schannel|proxy connect/i;
    const httpStatusAnswer = /returned error:\s*\d{3}/i;
    if (networkHints.test(message) || (/unable to access/i.test(message) && !httpStatusAnswer.test(message))) {
        return new GitNetworkError(`cannot reach the remote (${detail})`, { cause: err });
    }
    // 放在鉴权判断**之前**：某些平台会把「用户名不被支持」和
    // 「Authentication failed」一起打出来，此时更具体的这条应当胜出
    // （用例锁着这个顺序，见 gitErrorMapping.test.ts）。
    // 另外它绝不能落进 GitAuthError —— 那会让用户去反复检查一个没问题的令牌。
    if (/supported as username/i.test(message)) {
        return new GitCredentialUsernameRejectedError(
            `platform rejected the credential username (${detail})`,
            { cause: err }
        );
    }
    if (
        /authentication failed|could not read username|invalid username or password|access denied|http basic/i.test(
            message
        )
    ) {
        return new GitAuthError(`remote authentication failed (${detail})`, {
            cause: err,
        });
    }
    if (/non-fast-forward|fetch first|updates were rejected|failed to push/i.test(message)) {
        return new PushRejectedError(`push rejected by remote (${detail})`, {
            cause: err,
        });
    }
    return err instanceof Error ? err : new Error(message);
}

function isNothingToCommit(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /nothing to commit|nothing added to commit/i.test(message);
}

/** 统一给 git 调用包一层错误映射。 */
async function wrap<T>(what: string, run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (err) {
        throw mapError(err, what);
    }
}

/** 重新导出，避免上层直接 import auth.ts 的内部细节。 */
export type { RemoteCredential };
