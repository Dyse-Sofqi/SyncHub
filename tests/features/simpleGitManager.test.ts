import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { SimpleGitManager, createGitInstance } from "../../src/features/sync/simpleGitManager";
import {
    ConflictError,
    GitNotRepoError,
    PushRejectedError,
} from "../../src/features/sync/errors";

/**
 * 直接对**真实 git 仓库**做测试（临时目录 + 系统 git 二进制）。
 *
 * 理由：git 的行为面（合并、冲突标记、引用更新）远比 mock 能表达的真实；
 * 单测 mock 出来的 simpleGitManager 只能证明「我们按预期拼了参数」，
 * 证明不了参数拼对后 git 真的会按我们的语义动作。这一层等价于 host 层的
 * live 测试，但它跑的是本地 git，不碰网络、不依赖配额，可以进 `pnpm test`。
 */

let root: string;

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "obsync-git-"));
});

afterEach(async () => {
    // Windows 上 git 进程退出后短时间内仍会占着目录句柄，直接 rm 会 EBUSY。
    // maxRetries 让 Node 自己退避重试，比在测试里 sleep 可靠。
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** 建一个带初始提交的仓库，返回 manager 与目录。 */
async function makeReadyRepo(name: string): Promise<{ manager: SimpleGitManager; dir: string }> {
    const dir = path.join(root, name);
    await fs.mkdir(dir);
    const manager = new SimpleGitManager({ baseDir: dir });
    await manager.init();
    // 提交身份只设在仓库本地，不碰全局配置。
    await simpleGit(dir).addConfig("user.email", "test@example.com");
    await simpleGit(dir).addConfig("user.name", "SyncHub Test");
    // 不同 git 版本的 init 默认分支名不同，统一成 main 让断言稳定。
    await simpleGit(dir).raw(["checkout", "-b", "main"]);
    return { manager, dir };
}

async function makeBareRepo(name: string): Promise<string> {
    const dir = path.join(root, name);
    await fs.mkdir(dir);
    await simpleGit(dir).raw(["init", "--bare"]);
    return dir;
}

async function write(dir: string, file: string, content: string): Promise<void> {
    const filePath = path.join(dir, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
}

async function read(dir: string, file: string): Promise<string> {
    const content = await fs.readFile(path.join(dir, file), "utf8");
    // 测试机的全局 core.autocrlf=true 会把检出的 \n 变成 \r\n，
    // 断言关心的是内容语义，统一归一掉。
    return content.replace(/\r\n/g, "\n");
}

describe("仓库判定", () => {
    it("非仓库目录 isRepo 为 false，status 抛 GitNotRepoError", async () => {
        const dir = path.join(root, "plain");
        await fs.mkdir(dir);
        const manager = new SimpleGitManager({ baseDir: dir });

        await expect(manager.isRepo()).resolves.toBe(false);
        await expect(manager.status()).rejects.toBeInstanceOf(GitNotRepoError);
    });

    it("init 后 isRepo 为 true，且可再次 init（幂等）", async () => {
        const { manager } = await makeReadyRepo("idempotent");
        await expect(manager.isRepo()).resolves.toBe(true);
        await expect(manager.init()).resolves.toBeUndefined();
    });
});

describe("状态与提交", () => {
    it("未跟踪/暂存/未暂存三类状态映射正确", async () => {
        const { manager, dir } = await makeReadyRepo("status");
        await manager.stage([]);
        await manager.commit("init");

        await write(dir, "new.md", "new"); // untracked
        await write(dir, "tracked.md", "v1");
        await manager.stage(["tracked.md"]);
        await manager.commit("add tracked");
        await write(dir, "tracked.md", "v2"); // modified（未暂存）

        const status = await manager.status();

        expect(status.branch).toBe("main");
        expect(status.untracked.map((change) => change.path)).toEqual(["new.md"]);
        expect(status.staged).toHaveLength(0);
        expect(status.unstaged.map((change) => change.path)).toEqual(["tracked.md"]);
    });

    it("stage 全部 → commit 成功；空提交返回 false", async () => {
        const { manager, dir } = await makeReadyRepo("commit");
        await write(dir, "a.md", "hello");

        await manager.stage([]);
        await expect(manager.commit("first")).resolves.toBe(true);

        // 工作区干净时 commit 是无操作
        await expect(manager.commit("second")).resolves.toBe(false);
    });

    it("unstage 把已跟踪文件的修改退回未暂存", async () => {
        const { manager, dir } = await makeReadyRepo("unstage");
        await write(dir, "base.md", "base");
        await manager.stage([]);
        await manager.commit("init");

        await write(dir, "x.md", "v1");
        await manager.stage(["x.md"]);
        await manager.commit("add x");

        await write(dir, "x.md", "v2");
        await manager.stage(["x.md"]);
        expect((await manager.status()).staged).toHaveLength(1);

        await manager.unstage(["x.md"]);
        const status = await manager.status();
        expect(status.staged).toHaveLength(0);
        expect(status.unstaged.map((change) => change.path)).toEqual(["x.md"]);
    });

    it("unstage 在 HEAD 未出生时（全新仓库）也能退回", async () => {
        // restore --staged 需要 HEAD 作基准；全新仓库还没有提交，
        // 此时等价做法是把文件从 index 摘掉（退回 untracked）。
        const { manager, dir } = await makeReadyRepo("unstage-unborn");
        await write(dir, "fresh.md", "new");

        await manager.stage(["fresh.md"]);
        expect((await manager.status()).staged).toHaveLength(1);

        await manager.unstage(["fresh.md"]);
        const status = await manager.status();
        expect(status.staged).toHaveLength(0);
        expect(status.untracked.map((change) => change.path)).toEqual(["fresh.md"]);
    });

    /**
     * 「停止跟踪」（`git rm -r --cached`）—— 这一条必须在**真仓库**上跑。
     *
     * 它守的正是「`.gitignore` 只对未跟踪的文件生效」这条 git 语义：光写忽略规则，
     * 已提交的图片照旧每次提交都带着。所以这里连着验三件事：
     *
     * 1. 忽略规则 + `untrack` 之后，**本地文件还在**（工作区一个字节都不能少 ——
     *    这是这个动作敢做的唯一理由）；
     * 2. 那个文件**退出了跟踪**（出现在 `untracked`，而不是 `unstaged`）；
     * 3. 提交之后仓库里记下的是**删除**，且 `git status` 不再把它当成待提交的改动
     *    （因为 `.gitignore` 已经覆盖它）。
     */
    it("untrack 让已提交的文件退出跟踪，而本地文件原封不动", async () => {
        const { manager, dir } = await makeReadyRepo("untrack");
        // 一个「图片文件夹」+ 一篇笔记
        await write(dir, "attachments/a.png", "PNG-A");
        await write(dir, "attachments/b.png", "PNG-B");
        await write(dir, "note.md", "笔记");
        await manager.stage([]);
        await manager.commit("add images");

        // 只加 .gitignore 不会改变任何事：文件仍然被跟踪
        await write(dir, ".gitignore", "attachments/\n");
        let status = await manager.status();
        expect(status.untracked.map((change) => change.path)).not.toContain("attachments/");

        await manager.untrack(["attachments"]);

        // 1) 本地文件还在
        expect(await read(dir, "attachments/a.png")).toBe("PNG-A");
        expect(await read(dir, "attachments/b.png")).toBe("PNG-B");

        // 2) 退出跟踪 → 以「删除」的形式进了暂存区
        status = await manager.status();
        expect(status.staged.map((change) => change.path).sort()).toEqual([
            "attachments/a.png",
            "attachments/b.png",
        ]);

        // 3) 提交之后不再有任何待提交的图片改动，且笔记没被牵连
        await manager.commit("stop tracking images");
        status = await manager.status();
        expect(status.staged).toHaveLength(0);
        expect(status.unstaged).toHaveLength(0);
        // 只剩刚写下的 .gitignore 自己是未跟踪的（它还没提交）——
        // `attachments/` 已经被忽略，所以不会出现在这里。
        expect(status.untracked.map((change) => change.path)).toEqual([".gitignore"]);
        expect(await read(dir, "attachments/a.png")).toBe("PNG-A");
    });

    it("untrack 对「一个已跟踪文件都没有」的路径不报错（--ignore-unmatch）", async () => {
        // 刚配好、还没提交过任何图片的常见情形：git rm 不带这个开关会以
        // 「pathspec did not match」失败，并中止整条命令 —— 那样前面匹配上的
        // 文件夹也白摘了。
        const { manager, dir } = await makeReadyRepo("untrack-unmatch");
        await write(dir, "note.md", "笔记");
        await manager.stage([]);
        await manager.commit("init");

        await expect(manager.untrack(["attachments"])).resolves.toBeUndefined();
        // 空数组直接返回，不惊动 git
        await expect(manager.untrack([])).resolves.toBeUndefined();
        expect(await read(dir, "note.md")).toBe("笔记");
    });

    /**
     * `listTracked` 是「按扩展名忽略图片」的眼睛：`.gitignore` 对已跟踪的文件毫无作用，
     * 所以必须先问 git「哪些图片已经被跟踪」，才能把它们摘出索引。
     *
     * 顺带钉住两件事：
     * - `-z` 解析：路径里有空格、中文、`\` 也不会被拆错（`-z` 是 NUL 分隔）；
     * - 非仓库时返回**空数组**而不是抛错（界面已经在别处确认过仓库存在，
     *   这里再抛一次只会把「什么都没有」变成一句技术性报错）。
     */
    /**
     * 「放弃更改」（`git restore --source=HEAD --staged --worktree`，2026-10-10）。
     *
     * 两件事都要真跑一遍 —— 它们是同一个动作的两个用途，而**第二件最值钱**：
     * 用户在文件管理器里误删了一篇笔记，工作区里那份没了，但上次提交里有。
     * 这条测试就是「能不能把它找回来」。
     */
    it("restore 把改动退回上次提交，并把误删的文件找回来", async () => {
        const { manager, dir } = await makeReadyRepo("restore");
        await write(dir, "note.md", "第一版");
        await write(dir, "keep.md", "别动我");
        await manager.stage([]);
        await manager.commit("first");

        // 改坏一个 + 删掉一个
        await write(dir, "note.md", "被改坏了");
        await fs.rm(path.join(dir, "keep.md"));
        let status = await manager.status();
        expect(status.unstaged.map((change) => change.path).sort()).toEqual([
            "keep.md",
            "note.md",
        ]);

        await manager.restore(["note.md", "keep.md"]);

        // 1) 改坏的退回上一版
        expect(await read(dir, "note.md")).toBe("第一版");
        // 2) 误删的**回来了**
        expect(await read(dir, "keep.md")).toBe("别动我");
        // 3) 工作区干净了 —— 否则用户会看到「放弃了但还挂在更改里」
        status = await manager.status();
        expect(status.unstaged).toHaveLength(0);
        expect(status.staged).toHaveLength(0);
    });

    it("restore 也清掉索引里那一份（只清工作区会留下一条「已暂存的改动」）", async () => {
        const { manager, dir } = await makeReadyRepo("restore-staged");
        await write(dir, "note.md", "第一版");
        await manager.stage([]);
        await manager.commit("first");

        await write(dir, "note.md", "改过而且暂存了");
        await manager.stage(["note.md"]);
        expect((await manager.status()).staged.map((change) => change.path)).toEqual(["note.md"]);

        await manager.restore(["note.md"]);

        expect(await read(dir, "note.md")).toBe("第一版");
        const status = await manager.status();
        expect(status.staged).toHaveLength(0);
        expect(status.unstaged).toHaveLength(0);
    });

    it("restore 只动传进去的路径，别的文件一个字都不碰", async () => {
        const { manager, dir } = await makeReadyRepo("restore-scope");
        await write(dir, "a.md", "A1");
        await write(dir, "b.md", "B1");
        await manager.stage([]);
        await manager.commit("first");

        await write(dir, "a.md", "A2");
        await write(dir, "b.md", "B2");

        await manager.restore(["a.md"]);

        expect(await read(dir, "a.md")).toBe("A1");
        // b.md 的改动必须还在 —— 一次「放弃」误伤别的文件就是丢用户的内容
        expect(await read(dir, "b.md")).toBe("B2");
        expect((await manager.status()).unstaged.map((change) => change.path)).toEqual(["b.md"]);
    });

    it("listTracked 列出全部已跟踪路径（含中文与空格），非仓库时返回空数组", async () => {
        const plain = path.join(root, "plain-list");
        await fs.mkdir(plain);
        await expect(new SimpleGitManager({ baseDir: plain }).listTracked()).resolves.toEqual([]);

        const { manager, dir } = await makeReadyRepo("list-tracked");
        await write(dir, "attachments/中文 图.png", "PNG");
        await write(dir, "notes/note.md", "笔记");
        await manager.stage([]);
        await manager.commit("init");

        const tracked = await manager.listTracked();
        expect(tracked.sort()).toEqual(["attachments/中文 图.png", "notes/note.md"]);
    });

    it("untrack 分批下发（一次几千个路径会撞上命令行长度上限）", async () => {
        const { manager, dir } = await makeReadyRepo("untrack-batches");
        // 造 250 个文件：超过一批（200）但不至于让测试变慢
        const files = Array.from({ length: 250 }, (_unused, index) => `img/${index}.png`);
        for (const file of files) await write(dir, file, "P");
        await manager.stage([]);
        await manager.commit("many images");

        await manager.untrack(["img"]);

        const status = await manager.status();
        expect(status.staged).toHaveLength(250);
        // 本地文件一个都没少
        expect(await read(dir, "img/249.png")).toBe("P");
    });

    /**
     * 「嵌套仓库」（gitlink）的识别（2026-10-04）。
     *
     * 用户在库的插件目录里就地开发插件，那些目录各自带 `.git`，而库把它们记成了
     * **指针**（模式 160000）。这种行在面板里表现为「文件夹地址 + 没有具体改动 +
     * 怎么点都消不掉」—— 用户看不出原因，所以面板要能认出它们。
     *
     * 这里连着验三件事：认得出、**不误报普通文件**、以及「摘索引之后目录与里面的
     * 东西一个都不动」（这是那个「不再跟踪」按钮敢做的唯一理由）。
     */
    it("nestedRepoPaths 认得出嵌套仓库，且不误报普通文件", async () => {
        const { dir } = await makeReadyRepo("nested-detect");
        // 一个真正的嵌套仓库：它自己是 git 仓库
        const nested = path.join(dir, "plugins", "demo");
        await fs.mkdir(nested, { recursive: true });
        await simpleGit(nested).raw(["init", "-q"]);
        await simpleGit(nested).addConfig("user.email", "t@example.com");
        await simpleGit(nested).addConfig("user.name", "T");
        await write(nested, "a.md", "A");
        await simpleGit(nested).add("-A");
        await simpleGit(nested).commit("nested A");

        await write(dir, "note.md", "笔记");
        const manager = new SimpleGitManager({ baseDir: dir });
        await manager.stage([]);
        await manager.commit("init");

        // 嵌套仓库的 HEAD 动了 → 库这边把它报成一条「更改」
        await write(nested, "b.md", "B");
        await simpleGit(nested).add("-A");
        await simpleGit(nested).commit("nested B");
        await write(dir, "note.md", "笔记改了");

        const changed = ["plugins/demo", "note.md"];
        await expect(manager.nestedRepoPaths(changed)).resolves.toEqual(["plugins/demo"]);

        // 空数组不碰 git
        await expect(manager.nestedRepoPaths([])).resolves.toEqual([]);
    });

    it("摘索引之后，嵌套仓库的目录、.git 与未提交的代码都还在", async () => {
        const { dir } = await makeReadyRepo("nested-untrack");
        const nested = path.join(dir, "plugins", "demo");
        await fs.mkdir(nested, { recursive: true });
        await simpleGit(nested).raw(["init", "-q"]);
        await simpleGit(nested).addConfig("user.email", "t@example.com");
        await simpleGit(nested).addConfig("user.name", "T");
        await write(nested, "a.md", "A");
        await simpleGit(nested).add("-A");
        await simpleGit(nested).commit("nested A");
        // 开发中：一份**未提交**的改动
        await write(nested, "wip.md", "未提交的代码");

        await write(dir, "note.md", "笔记");
        const manager = new SimpleGitManager({ baseDir: dir });
        await manager.stage([]);
        await manager.commit("init");
        await expect(manager.nestedRepoPaths(["plugins/demo"])).resolves.toEqual(["plugins/demo"]);

        await manager.untrack(["plugins/demo"]);

        expect(await fs.readFile(path.join(nested, "a.md"), "utf8")).toBe("A");
        expect(await fs.readFile(path.join(nested, "wip.md"), "utf8")).toBe("未提交的代码");
        expect(await fs.readdir(path.join(nested, ".git"))).not.toHaveLength(0);
    });

    /**
     * git 子进程**继承父进程环境**（2026-10-02 修的一个真 bug）。
     *
     * 修之前：`simpleGit().env(name, value)` 是**替换**子进程环境，于是 git 里没有
     * PATH、没有代理变量、没有 USERPROFILE —— 症状是「本机终端里好、插件里坏」，
     * 而且只在有代理或自定义凭据助手时才现形（用户报的
     * `getaddrinfo() thread failed to start` 就在这一类里）。
     *
     * 探针用 `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL`：它们是**放行**的普通变量（不在
     * simple-git 拒绝的那批里），而 git 环境里的作者身份**优先于仓库配置** —— 所以
     * `git var GIT_AUTHOR_IDENT` 会给出环境里的那个名字。环境被剥掉的话，读到的就是
     * 仓库本地配置里的 `SyncHub Test`。整条路不碰网络。
     */
    it("git 子进程继承父进程环境（GIT_AUTHOR_NAME 探针）", async () => {
        const { dir } = await makeReadyRepo("child-env");

        const previousName = process.env.GIT_AUTHOR_NAME;
        const previousEmail = process.env.GIT_AUTHOR_EMAIL;
        process.env.GIT_AUTHOR_NAME = "Probe From Parent Env";
        process.env.GIT_AUTHOR_EMAIL = "probe@example.com";
        try {
            // 实例必须在设好环境**之后**创建（环境在创建时快照进 spawn 选项）
            const git = createGitInstance({ baseDir: dir });
            const ident = await git.raw(["var", "GIT_AUTHOR_IDENT"]);

            expect(ident).toContain("Probe From Parent Env");
            expect(ident).toContain("probe@example.com");
        } finally {
            if (previousName === undefined) delete process.env.GIT_AUTHOR_NAME;
            else process.env.GIT_AUTHOR_NAME = previousName;
            if (previousEmail === undefined) delete process.env.GIT_AUTHOR_EMAIL;
            else process.env.GIT_AUTHOR_EMAIL = previousEmail;
        }
    });

    it("log 返回按时间倒序的提交，短 hash 可用", async () => {
        const { manager, dir } = await makeReadyRepo("log");
        await write(dir, "a.md", "1");
        await manager.stage([]);
        await manager.commit("first commit");
        await write(dir, "b.md", "2");
        await manager.stage([]);
        await manager.commit("second commit");

        const entries = await manager.log(2);

        expect(entries).toHaveLength(2);
        expect(entries[0]!.message).toBe("second commit");
        expect(entries[0]!.hash).toMatch(/^[0-9a-f]{40}$/);
        expect(entries[0]!.shortHash).toHaveLength(7);
        expect(entries[0]!.author).toBe("SyncHub Test");
        expect(entries[1]!.message).toBe("first commit");
    });
});

describe("差异", () => {
    /**
     * 这一组跑的是**真实 git**：三个选项（`--no-color` / `--no-ext-diff` /
     * `-c core.quotePath=false`）各自防的是一种真实环境，而它们的效果只有
     * 真的问一次 git 才知道。拼参数的那一半用 mock 是验不出来的 ——
     * mock 只能证明「我们拼了我们以为对的东西」。
     */
    it("工作区差异：中文 + 含空格的路径不被转义成八进制", async () => {
        const { manager, dir } = await makeReadyRepo("diff-cjk");
        await write(dir, "中文 文件.md", "第一行\n");
        await manager.stage([]);
        await manager.commit("init");
        await write(dir, "中文 文件.md", "第一行\n第二行\n");

        const raw = await manager.diffFile("中文 文件.md");

        // 不加 core.quotePath=false 时这里是 "a/\344\270\255..."，路径读不出来
        expect(raw).toContain("a/中文 文件.md");
        expect(raw).toContain("+第二行");
        expect(raw).not.toContain("\\344");
    });

    it("已暂存与工作区是两份不同的差异", async () => {
        const { manager, dir } = await makeReadyRepo("diff-staged");
        await write(dir, "a.md", "v1\n");
        await manager.stage([]);
        await manager.commit("init");

        // 先暂存一次改动，再在工作区继续改 —— 这时两侧内容不同
        await write(dir, "a.md", "v2\n");
        await manager.stage(["a.md"]);
        await write(dir, "a.md", "v3\n");

        const working = await manager.diffFile("a.md");
        const staged = await manager.diffFile("a.md", { staged: true });

        expect(working).toContain("+v3");
        expect(working).not.toContain("+v2");
        expect(staged).toContain("+v2");
        expect(staged).not.toContain("+v3");
    });

    it("未跟踪文件没有任何差异输出（由 service 层兜底）", async () => {
        const { manager, dir } = await makeReadyRepo("diff-untracked");
        await write(dir, "seed.md", "seed");
        await manager.stage([]);
        await manager.commit("init");
        await write(dir, "新笔记.md", "内容");

        // git 的行为就是这样 —— 这里把它钉住，免得有人以为是自己写错了
        await expect(manager.diffFile("新笔记.md")).resolves.toBe("");
    });

    it("commitPatch 给出该提交引入的改动，且不含提交头", async () => {
        const { manager, dir } = await makeReadyRepo("diff-commit");
        await write(dir, "a.md", "v1\n");
        await manager.stage([]);
        await manager.commit("first");
        const [commit] = await manager.log(1);

        const patch = await manager.commitPatch(commit!.hash);

        expect(patch).toContain("+v1");
        // `--format=` 抑制了提交头 —— 否则「作者 / 日期 / message」会混进补丁里
        expect(patch).not.toContain("first");
        expect(patch).not.toContain("SyncHub Test");
    });

    it("合并提交也给得出内容（默认 git 是空输出）", async () => {
        // 这是真实会遇到的：拉取产生的合并提交在历史里点开，默认一片空白。
        const { manager, dir } = await makeReadyRepo("diff-merge");
        const git = simpleGit(dir);
        await write(dir, "base.md", "base");
        await manager.stage([]);
        await manager.commit("base");

        await manager.createBranch("feature");
        await write(dir, "feature.md", "只在 feature 上");
        await manager.stage([]);
        await manager.commit("feature work");

        await manager.checkout("main");
        await write(dir, "main.md", "只在 main 上");
        await manager.stage([]);
        await manager.commit("main work");

        await git.raw(["merge", "--no-ff", "-m", "merge feature", "feature"]);
        const [mergeCommit] = await manager.log(1);

        const patch = await manager.commitPatch(mergeCommit!.hash);

        expect(patch).toContain("feature.md");
        expect(patch).toContain("+只在 feature 上");
    });
});

describe("分支", () => {
    it("创建、切换、列出、删除", async () => {
        const { manager, dir } = await makeReadyRepo("branches");
        // 没有任何提交的仓库里 `git branch` 输出为空，先造一个提交。
        await write(dir, "seed.md", "seed");
        await manager.stage([]);
        await manager.commit("seed");

        await manager.createBranch("feature/x");
        let branches = await manager.listBranches();
        expect(branches.find((branch) => branch.current)?.name).toBe("feature/x");

        await manager.checkout("main");
        branches = await manager.listBranches();
        expect(branches.find((branch) => branch.current)?.name).toBe("main");
        expect(branches.some((branch) => branch.name === "feature/x")).toBe(true);

        await manager.deleteBranch("feature/x");
        branches = await manager.listBranches();
        expect(branches.some((branch) => branch.name === "feature/x")).toBe(false);
    });
});

describe("远端：push / pull / 冲突", () => {
    interface Cluster {
        origin: string;
        a: { manager: SimpleGitManager; dir: string };
        b: { manager: SimpleGitManager; dir: string };
    }

    /**
     * 建一套「远端 + 两个克隆」的最小同步环境。
     * A 先提交并推送（形成 origin 的初始历史），B 从 origin 克隆。
     */
    async function makeCluster(): Promise<Cluster> {
        const origin = await makeBareRepo("origin.git");
        const { manager: aManager, dir: aDir } = await makeReadyRepo("clone-a");
        await simpleGit(aDir).raw(["remote", "add", "origin", origin]);
        await write(aDir, "shared.md", "base\n");
        await aManager.stage([]);
        await aManager.commit("base");
        await aManager.push();
        // push 不会更新裸仓库的 HEAD（它仍指向 init 时的默认分支），
        // 不改的话 clone 出来的 b 会停在未出生的 master 上、没有 tracking。
        await simpleGit(origin).raw(["symbolic-ref", "HEAD", "refs/heads/main"]);

        const bDir = path.join(root, "clone-b");
        await simpleGit(root).clone(origin, bDir);
        await simpleGit(bDir).addConfig("user.email", "test@example.com");
        await simpleGit(bDir).addConfig("user.name", "SyncHub Test");
        const bManager = new SimpleGitManager({ baseDir: bDir });

        return { origin, a: { manager: aManager, dir: aDir }, b: { manager: bManager, dir: bDir } };
    }

    it("push 设置 upstream，status 报告 ahead/behind", async () => {
        const { b } = await makeCluster();

        const status = await b.manager.status();
        expect(status.branch).toBe("main");
        // 克隆自带 tracking
        expect(status.ahead).toBe(0);
        expect(status.behind).toBe(0);

        await write(b.dir, "new.md", "x");
        await b.manager.stage([]);
        await b.manager.commit("b change");
        const after = await b.manager.status();
        expect(after.ahead).toBe(1);
    });

    it("pull merge 把远端提交带下来", async () => {
        const { a, b } = await makeCluster();

        await write(a.dir, "shared.md", "from A\n");
        await a.manager.stage([]);
        await a.manager.commit("a writes");
        await a.manager.push();

        const outcome = await b.manager.pull("merge");
        expect(outcome.kind).toBe("pulled");
        expect(outcome.files).toBe(1);
        await expect(read(b.dir, "shared.md")).resolves.toBe("from A\n");
    });

    it("没有新东西时 pull 返回 up-to-date", async () => {
        const { b } = await makeCluster();
        await expect(b.manager.pull("merge")).resolves.toEqual({ kind: "up-to-date" });
    });

    it("pull reset 丢弃本地提交、以远端为准", async () => {
        const { a, b } = await makeCluster();

        // 本地提交一个远端没有的文件
        await write(b.dir, "local-only.md", "will be dropped\n");
        await b.manager.stage([]);
        await b.manager.commit("local only");

        // 远端前进
        await write(a.dir, "shared.md", "remote truth\n");
        await a.manager.stage([]);
        await a.manager.commit("a writes");
        await a.manager.push();

        await b.manager.pull("reset");

        await expect(read(b.dir, "shared.md")).resolves.toBe("remote truth\n");
        // reset 语义「以远端为准」：本地提交被丢弃，其中新增的文件一并消失。
        const status = await b.manager.status();
        expect(status.ahead).toBe(0);
        await expect(fs.access(path.join(b.dir, "local-only.md"))).rejects.toThrow();
    });

    it("双方改同一行时 pull 抛 ConflictError，abortMerge 可恢复", async () => {
        const { a, b } = await makeCluster();

        await write(a.dir, "shared.md", "version A\n");
        await a.manager.stage([]);
        await a.manager.commit("a edits");
        await a.manager.push();

        await write(b.dir, "shared.md", "version B\n");
        await b.manager.stage([]);
        await b.manager.commit("b edits");

        await expect(b.manager.pull("merge")).rejects.toBeInstanceOf(ConflictError);

        // 冲突现场：文件在 conflicted 列表里
        const conflicted = await b.manager.status();
        expect(conflicted.conflicted).toContain("shared.md");

        // 恢复：回到 pull 之前，B 的内容还在，冲突清空
        await b.manager.abortMerge();
        const after = await b.manager.status();
        expect(after.conflicted).toHaveLength(0);
        await expect(read(b.dir, "shared.md")).resolves.toBe("version B\n");
    });

    it("本地落后时 push 被拒绝（PushRejectedError）", async () => {
        const { a, b } = await makeCluster();

        // A 先推，B 在旧历史上提交
        await write(a.dir, "shared.md", "a first\n");
        await a.manager.stage([]);
        await a.manager.commit("a writes");
        await a.manager.push();

        await write(b.dir, "b-file.md", "b\n");
        await b.manager.stage([]);
        await b.manager.commit("b writes");

        await expect(b.manager.push()).rejects.toBeInstanceOf(PushRejectedError);
    });

    it("getRemoteUrl / setRemoteUrl 往返", async () => {
        const { origin, b } = await makeCluster();

        await expect(b.manager.getRemoteUrl()).resolves.toBe(origin);

        const other = await makeBareRepo("other.git");
        await b.manager.setRemoteUrl(other);
        await expect(b.manager.getRemoteUrl()).resolves.toBe(other);
    });

    /**
     * 远端地址的探测结果会被**复用**（2026-10-01）。
     *
     * 以前 `git()` 每次都先探一遍远端（`git remote -v`），而一次面板重绘要调
     * `git()` 四次 —— 实测一次 `git remote -v` 约 46 ms，也就是每画一次面板就
     * 白烧近 200 ms（见 `REMOTE_PROBE_TTL_MS`）。
     *
     * 复用是有代价的：在**插件外面**改了远端地址，最多 5 秒内我们还按旧地址算。
     * 这条用例把这个取舍钉下来 —— 连同它的边界：走我们自己的入口改地址
     * （`setRemoteUrl`）会立刻作废缓存，不存在「换了远端还用旧令牌」。
     */
    it("远端探测结果在 TTL 内复用：插件外改地址不会立刻看到，走我们自己入口会立刻作废", async () => {
        const { origin, b } = await makeCluster();
        await expect(b.manager.getRemoteUrl()).resolves.toBe(origin);

        // 绕过 manager 直接改仓库配置 —— 模拟「在插件外面改了远端」
        const direct = await makeBareRepo("direct.git");
        await simpleGit(b.dir).remote(["set-url", "origin", direct]);

        // 仍然是旧值：这正是「复用」的证据
        await expect(b.manager.getRemoteUrl()).resolves.toBe(origin);

        // 而经由 `setRemoteUrl` 改的地址立刻生效（缓存被显式作废）
        const viaPlugin = await makeBareRepo("via-plugin.git");
        await b.manager.setRemoteUrl(viaPlugin);
        await expect(b.manager.getRemoteUrl()).resolves.toBe(viaPlugin);
    });
});

/**
 * 非交互环境变量**真的到了 git 子进程**。
 *
 * 上面 `gitInstanceGuards.test.ts` 验的是「我们把这个设置交给了 simple-git」，
 * 但那一层是替身：它只能证明我们**调了** `.env()`，证明不了 git 真的**看见**了。
 * 而这里要防的正是「看见了没有」—— 没看见的话，git 拿不到凭据时就会去提问，
 * 而在 Obsidian 里没有人能回答它（见 `GIT_NONINTERACTIVE_ENV` 的说明）。
 *
 * 做法：让 git 自己把环境打出来。`alias.x=!<命令>` 是 git 用 `sh -c` 执行的
 * 外部命令，它拿到的正是 git 进程的环境 —— 这是从外面唯一能观察到的证据。
 */
describe("非交互设置真的传到了 git 进程", () => {
    it("GIT_TERMINAL_PROMPT / GCM_INTERACTIVE 在子进程里可见", async () => {
        const { dir, manager } = await makeReadyRepo("noninteractive");

        // 观察点用 **git 钩子**：钩子是 git 自己用 `sh` 起的子进程，
        // 它拿到的正是 git 进程的环境 —— 这是从外面唯一能观察到的证据。
        // （本想用 `-c alias.x=!…`，但 simple-git 默认禁止配置 alias。）
        const hook = path.join(dir, ".git", "hooks", "pre-commit");
        await fs.writeFile(
            hook,
            '#!/bin/sh\necho "$GIT_TERMINAL_PROMPT/$GCM_INTERACTIVE" > .git/obsync-env.txt\n',
            { mode: 0o755 }
        );

        await write(dir, "probe.md", "probe\n");
        await manager.stage([]);
        await manager.commit("probe env");

        const seen = await fs.readFile(path.join(dir, ".git", "obsync-env.txt"), "utf8");
        expect(seen.trim()).toBe("0/never");
    });
});
