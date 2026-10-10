import { describe, expect, it } from "vitest";
import { gitChildEnv, mapError } from "../../src/features/sync/simpleGitManager";
import {
    GitAuthError,
    GitBinaryMissingError,
    GitCredentialUsernameRejectedError,
    GitNetworkError,
    GitNotRepoError,
    GitTimeoutError,
    HistoryRewriteRefusedError,
    PushRejectedError,
    UnrelatedHistoriesError,
} from "../../src/features/sync/errors";

/**
 * git 失败的**分类**。
 *
 * ## 为什么单独测这一层
 *
 * `mapError` 是一串正则，判定的是「这个失败该引导用户做什么」。
 * 这些正则只能靠**真实的 git 输出**校准 —— 而用真实仓库去触发每一条代价很高：
 * 有的要私有仓库和令牌，有的要制造 non-fast-forward，有的要卸载 git。
 * 所以这里直接拿真实输出的原文当 fixture 测分类，比等集成测试偶发覆盖可靠。
 *
 * 同理，正则写错（凭记忆写而不是照抄真实输出）会**静默**退化：
 * 错误类型对不上 → 文案退回原始 git 输出 → 用户看到一堆英文
 * （见 MEMORY.md 里 `HEAD_UNBORN_RE` 那条踩坑记录，同一个坑）。
 *
 * ## 分类的准则是「应对方式」，不是「像什么」
 *
 * 下面「用户名被拒」那条最能说明问题：它**看起来**像鉴权失败，
 * 但令牌是好的，让用户去查令牌等于指错方向。
 */

/** 把 git 的原始输出包成 `mapError` 的输入。 */
function gitFailed(output: string): Error {
    return new Error(output);
}

describe("mapError 的分类", () => {
    it("git 没装（spawn ENOENT）", () => {
        expect(mapError(gitFailed("spawn git ENOENT"), "checking")).toBeInstanceOf(
            GitBinaryMissingError
        );
    });

    it("不是 git 仓库", () => {
        // 真实输出原文
        expect(
            mapError(
                gitFailed("fatal: not a git repository (or any of the parent directories): .git"),
                "checking repository state"
            )
        ).toBeInstanceOf(GitNotRepoError);
    });

    it("**平台拒绝凭据里的用户名**（Gitee 服务端原文）", () => {
        // 这段是 Gitee 官方仓库 issue I1BGZG 里的原文，逐字照抄 ——
        // 凭记忆改写会让这条用例失去校准作用。
        const raw =
            'remote: Username, "oauth2" or "gitee.com" is supported as username when using access token to pull or push the repository\n' +
            "fatal: unable to access 'https://gitee.com/owner/repo.git/': The requested URL returned error: 403";

        const error = mapError(gitFailed(raw), "pushing");

        expect(error).toBeInstanceOf(GitCredentialUsernameRejectedError);
        // **不能**落进 GitAuthError：那会让用户去检查一个没问题的令牌。
        expect(error).not.toBeInstanceOf(GitAuthError);
    });

    it("**同时出现「用户名不被支持」和「认证失败」时，取更具体的那条**", () => {
        // 这条锁的是 mapError 里的**判断顺序**：某些平台会两行一起打，
        // 若鉴权判断排在前面，用户就会看到「请检查令牌」—— 而令牌是好的。
        const raw =
            'remote: Username, "oauth2" or "gitee.com" is supported as username when using access token to pull or push the repository\n' +
            "fatal: Authentication failed for 'https://gitee.com/owner/repo.git/'";

        expect(mapError(gitFailed(raw), "pushing")).toBeInstanceOf(
            GitCredentialUsernameRejectedError
        );
    });

    it("令牌无效 / 认证失败仍然是 GitAuthError", () => {
        expect(
            mapError(
                gitFailed("fatal: Authentication failed for 'https://gitee.com/o/r.git/'"),
                "pushing"
            )
        ).toBeInstanceOf(GitAuthError);

        // 无凭据时 git 想交互要用户名，非交互环境下报这句
        expect(
            mapError(
                gitFailed("fatal: could not read Username for 'https://github.com': terminal prompts disabled"),
                "testing remote access"
            )
        ).toBeInstanceOf(GitAuthError);
    });

    /**
     * 「本地与远端没有共同提交」（2026-10-10，用户实测报的原文）。
     *
     * 它**必须**有自己的类型：兜底分支会把这句英文原文直接弹给用户，
     * 而它不含任何可行动信息 —— 用户该做的是**强制推送**（重写历史之后还没推），
     * 而不是去解冲突、查令牌或重试。
     *
     * 也不能落进 `PushRejectedError`（那句说的是「先拉取」）—— 在这个状态下
     * 拉取同样走不通，用户照做只会原地打转。
     */
    it("本地与远端没有共同提交 → UnrelatedHistoriesError（不是推送被拒，也不是兜底）", () => {
        // git 2.35.1.windows.2 的真实输出原文
        expect(
            mapError(
                gitFailed("fatal: refusing to merge unrelated histories"),
                "pulling (merge)"
            )
        ).toBeInstanceOf(UnrelatedHistoriesError);
        // rebase 策略下是同一句话，同样要认出来。
        expect(
            mapError(
                gitFailed("fatal: refusing to merge unrelated histories"),
                "pulling (rebase)"
            )
        ).toBeInstanceOf(UnrelatedHistoriesError);
    });

    /**
     * 「上一次重写留下的 `refs/original/` 还在，git 拒绝开始」（2026-10-10，用户实测报的）。
     *
     * 用户看到的是那段英文原文（`Cannot create a new backup. A previous backup already
     * exists in refs/original/`）—— 它不含任何可行动信息，而用户该做的是**重试一次**。
     * `rewriteHistory` 现在带 `--force`，正常路径上碰不到；留着是兜底。
     */
    it("filter-branch 拒绝开始（refs/original 残留）→ HistoryRewriteRefusedError", () => {
        // git 2.35.1.windows.2 的真实输出原文
        expect(
            mapError(
                gitFailed(
                    "Cannot create a new backup.\n" +
                        "A previous backup already exists in refs/original/\n" +
                        "Force overwriting the backup with -f"
                ),
                "rewriting history"
            )
        ).toBeInstanceOf(HistoryRewriteRefusedError);
    });

    it("推送被拒（本地落后）是 PushRejectedError", () => {
        expect(
            mapError(
                gitFailed(
                    "! [rejected]        main -> main (non-fast-forward)\n" +
                        "error: failed to push some refs to 'https://gitee.com/o/r.git'"
                ),
                "pushing"
            )
        ).toBeInstanceOf(PushRejectedError);
    });

    it("**卡住被中止**是 GitTimeoutError（simple-git 超时插件 kill 后的原话）", () => {
        // 用户报的症状是「尝试推送后一直看到正在推送」—— 那种「什么都不发生」
        // 必须被说成「超时、已中止、去查网络」，而不是让他继续等。
        expect(
            mapError(
                gitFailed("block timeout reached"),
                "pushing"
            )
        ).toBeInstanceOf(GitTimeoutError);
    });

    it("git/curl 自己的网络超时也归到同一条（对用户是同一件事）", () => {
        expect(
            mapError(
                gitFailed(
                    "fatal: unable to access 'https://github.com/o/r.git/': " +
                        "Failed to connect to github.com port 443: Operation timed out"
                ),
                "pulling (merge)"
            )
        ).toBeInstanceOf(GitTimeoutError);
    });

    it("超时判断排在鉴权之前 —— 卡死时若还带了别的输出，别报成「令牌不对」", () => {
        // 超时插件 kill 进程后，某些 git 版本还会补一句鉴权/连接的话。
        // 那只是症状；报成鉴权失败会把用户指去查一个没问题的令牌。
        expect(
            mapError(
                gitFailed("block timeout reached\nfatal: Authentication failed"),
                "pushing"
            )
        ).toBeInstanceOf(GitTimeoutError);
    });

    it("认不出的失败原样透传（保留 git 的原话，便于排查）", () => {
        const original = gitFailed("fatal: something nobody has seen before");
        expect(mapError(original, "pushing")).toBe(original);
    });

    it("非 Error 的抛出物也能处理（不假设抛的是 Error）", () => {
        const mapped = mapError("plain string failure", "pushing");
        expect(mapped).toBeInstanceOf(Error);
        expect(mapped.message).toContain("plain string failure");
    });

    it("技术性描述里带上「在做什么时失败的」（日志排查要用）", () => {
        const mapped = mapError(gitFailed("fatal: Authentication failed"), "pulling (merge)");

        // 消息是**技术性**的（英文、进日志），用户文案由 describeSyncError 拼 ——
        // 早期版本把中文文案写进 message，导致英文界面冒出中文。
        expect(mapped.message).toContain("pulling (merge)");
        expect(mapped.message).not.toMatch(/[\u4e00-\u9fff]/);
    });
});

/**
 * 「连不上远端」这一类（2026-10-02，用户报来的一条实际警告）。
 *
 * 用户的原话是：
 *
 * ```
 * [SyncHub] auto sync failed st: fatal: unable to access 'https://gitee.com/…':
 * getaddrinfo() thread failed to start
 * ```
 *
 * 没有这一类的后果不是「少一句好话」，而是**方向指错**：这句话既不含令牌、也不含
 * 仓库问题，却会被当成「插件坏了」或「令牌不对」——用户会去重装、去重配令牌，而
 * 真正该看的是网络与代理。
 */
describe("mapError：网络层失败", () => {
    it("getaddrinfo 解析线程起不来（用户实际报的那条）", () => {
        const raw =
            "fatal: unable to access 'https://gitee.com/sofqi/plugin-test.git/': " +
            "getaddrinfo() thread failed to start\nPushing to https://gitee.com/sofqi/plugin-test.git";

        expect(mapError(gitFailed(raw), "pushing")).toBeInstanceOf(GitNetworkError);
    });

    it("域名解析失败 / 连不上 / 连接被重置", () => {
        for (const raw of [
            "fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com",
            "fatal: unable to access 'https://gitee.com/o/r.git/': Failed to connect to gitee.com port 443: Connection refused",
            "fatal: unable to access 'https://github.com/o/r.git/': Recv failure: Connection was reset",
            "fatal: unable to access 'https://github.com/o/r.git/': schannel: failed to receive handshake",
            "fatal: unable to access 'https://github.com/o/r.git/': Couldn't connect to server",
        ]) {
            expect(mapError(gitFailed(raw), "pushing"), raw).toBeInstanceOf(GitNetworkError);
        }
    });

    it("**HTTP 状态码不是网络问题** —— 403/404 不能被吞进这一类", () => {
        // 这是这条判据最容易写错的地方：`unable to access` 同样是 403 的开头
        // （Gitee 的「用户名不被支持」原文），把它算成网络失败会让用户去查
        // 一个没问题的网络，而真正要改的是凭据里的用户名。
        const raw =
            'remote: Username, "oauth2" or "gitee.com" is supported as username when using access token to pull or push the repository\n' +
            "fatal: unable to access 'https://gitee.com/owner/repo.git/': The requested URL returned error: 403";

        expect(mapError(gitFailed(raw), "pushing")).not.toBeInstanceOf(GitNetworkError);
    });

    it("网络失败要排在鉴权之前（连不上时 git 还会补一句「读不到用户名」）", () => {
        const raw =
            "fatal: could not read Username for 'https://gitee.com': terminal prompts disabled\n" +
            "fatal: unable to access 'https://gitee.com/o/r.git/': getaddrinfo() thread failed to start";

        expect(mapError(gitFailed(raw), "pushing")).toBeInstanceOf(GitNetworkError);
    });
});

/**
 * 交给 git 子进程的环境（2026-10-02 修的一个真 bug）。
 *
 * `simpleGit().env(name, value)` 是**替换**环境而不是追加：simple-git 把
 * `_executor.env` 原样交给 `child_process.spawn` 的 `env`。修之前我们只设了两个
 * 非交互开关，于是 git 子进程里**没有 PATH、没有代理变量、没有 USERPROFILE** ——
 * 表现是「本机终端里好、插件里坏」，而且只在有代理/自定义凭据助手时才现形。
 */
describe("gitChildEnv", () => {
    it("父进程的环境打底（代理、PATH、USERPROFILE 都在）", () => {
        const env = gitChildEnv({
            PATH: "C:\\Windows\\System32",
            USERPROFILE: "C:\\Users\\me",
            HTTPS_PROXY: "http://127.0.0.1:7890",
        });

        expect(env.PATH).toBe("C:\\Windows\\System32");
        expect(env.USERPROFILE).toBe("C:\\Users\\me");
        // 代理是这一类里最要紧的：国内访问 GitHub 大多靠它
        expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    });

    it("我们的非交互开关盖在最上面（父进程设了也拦不住）", () => {
        const env = gitChildEnv({ GIT_TERMINAL_PROMPT: "1", GCM_INTERACTIVE: "always" });

        expect(env.GIT_TERMINAL_PROMPT).toBe("0");
        expect(env.GCM_INTERACTIVE).toBe("never");
        // 非交互子进程不该为合并提交开编辑器（stdio 是管道，等不到人）
        expect(env.GIT_MERGE_AUTOEDIT).toBe("no");
    });

    it("**删掉 simple-git 会拒绝的那批变量** —— 留着的话整条命令都跑不起来", () => {
        // 实测报错：`Use of "GIT_PAGER" is not permitted without enabling
        // allowUnsafePager`。simple-git 3.36 没有暴露那个开关，所以唯一做法是不传。
        // 这份清单是 2026-10-02 逐个实测出来的（同一批里 HTTPS_PROXY、ALL_PROXY、
        // VISUAL、SSH_AUTH_SOCK 等是**放行**的，必须留着）。
        const env = gitChildEnv({
            PATH: "C:\\Windows",
            GIT_PAGER: "cat",
            PAGER: "cat",
            GIT_EDITOR: "vim",
            EDITOR: "vim",
            GIT_SEQUENCE_EDITOR: "vim",
            GIT_ASKPASS: "askpass",
            SSH_ASKPASS: "askpass",
            GIT_SSH: "ssh.exe",
            GIT_SSH_COMMAND: "ssh -v",
            GIT_EXTERNAL_DIFF: "difftool",
            GIT_TEMPLATE_DIR: "C:\\templates",
            GIT_CONFIG_GLOBAL: "C:\\other-gitconfig",
            GIT_CONFIG_SYSTEM: "C:\\system-gitconfig",
            GIT_PROXY_COMMAND: "proxy.exe",
        });

        for (const name of [
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
        ]) {
            expect(env[name], name).toBeUndefined();
        }
        expect(env.PATH).toBe("C:\\Windows");
    });

    it("放行的变量仍然继承（代理、ssh agent、编辑器兜底）", () => {
        const env = gitChildEnv({
            HTTPS_PROXY: "http://127.0.0.1:7890",
            ALL_PROXY: "socks5://127.0.0.1:1080",
            NO_PROXY: "localhost",
            SSH_AUTH_SOCK: "/tmp/agent.sock",
            SSL_CERT_FILE: "C:\\certs\\ca.pem",
        });

        expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
        expect(env.ALL_PROXY).toBe("socks5://127.0.0.1:1080");
        expect(env.NO_PROXY).toBe("localhost");
        expect(env.SSH_AUTH_SOCK).toBe("/tmp/agent.sock");
        expect(env.SSL_CERT_FILE).toBe("C:\\certs\\ca.pem");
    });

    it("**删掉「指定另一个仓库」的变量** —— 否则插件会静默操作错的仓库", () => {
        // 用户从终端启动 Obsidian 时可能带着 GIT_DIR（或在一个 git --git-dir 的
        // shell 里）。继承它之后命令全都会「成功」，但动的是别的仓库。
        const env = gitChildEnv({
            PATH: "C:\\Windows",
            GIT_DIR: "D:\\other-repo\\.git",
            GIT_WORK_TREE: "D:\\other-repo",
            GIT_INDEX_FILE: "D:\\other\\.git\\index",
            GIT_OBJECT_DIRECTORY: "D:\\other\\.git\\objects",
            GIT_ALTERNATE_OBJECT_DIRECTORIES: "D:\\a\\.git\\objects",
            GIT_COMMON_DIR: "D:\\other\\.git",
        });

        for (const name of [
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_COMMON_DIR",
        ]) {
            expect(env[name], name).toBeUndefined();
        }
        expect(env.PATH).toBe("C:\\Windows");
    });

    it("undefined 的环境项不会变成字符串 \"undefined\"", () => {
        const env = gitChildEnv({ FOO: undefined, BAR: "1" });

        expect("FOO" in env).toBe(false);
        expect(env.BAR).toBe("1");
    });
});
