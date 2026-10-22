import { ParseError, UnsupportedHostError } from "./errors";
import { redactUrl } from "./redact";
import type { HostKind, RepoId, RepoRef } from "./types";

/**
 * 仓库地址解析。
 *
 * 参考项目 BRAT 把这件事拆在两处做（`scrubRepositoryUrl` 做字符串清洗，
 * `AddNewPluginModal` 里一个正则做识别），结果只能认 GitHub 一种形态。
 * 这里合并成一个真正的解析器：能认 URL、scp 形式、`host/owner/repo`、
 * 以及 `owner/repo` 简写，并且**明确区分「平台不支持」和「地址写错了」**，
 * 因为这两种情况该给用户的提示完全不同。
 */

/** 平台域名 → HostKind。含常见别名。 */
const HOST_BY_DOMAIN: Record<string, HostKind> = {
    "github.com": "github",
    "www.github.com": "github",
    "gitee.com": "gitee",
    "www.gitee.com": "gitee",
};

/** 明确不支持、但用户很可能粘进来的平台，用于给出更准确的报错。 */
const KNOWN_UNSUPPORTED_DOMAINS = [
    "gitlab.com",
    "bitbucket.org",
    "codeberg.org",
    "git.sr.ht",
    "gitcode.com",
    "coding.net",
    "gitlab.cn",
];

const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** 看起来像域名、但未必是我们支持的平台。 */
function looksLikeDomain(segment: string): boolean {
    if (!DOMAIN_RE.test(segment)) return false;
    const lower = segment.toLowerCase();
    if (lower in HOST_BY_DOMAIN || KNOWN_UNSUPPORTED_DOMAINS.includes(lower)) return true;
    // 是个域名，但不是已知平台 —— 也要走「平台不支持」分支，
    // 否则会被当成 owner/repo 简写，报出让人摸不着头脑的错误。
    return /\.(?:com|cn|org|net|io|dev|app|co|me|xyz|top|cc)$/i.test(lower);
}

/**
 * 错误消息里回显地址前先去掉凭据。
 *
 * 用户粘进来的可能是 Gitee 界面自己给的「带令牌的克隆地址」
 * （`https://oauth2:TOKEN@gitee.com/owner/repo.git`），甚至整条
 * `git clone ...` 命令。这些输入一旦进了 `ParseError` / `UnsupportedHostError`，
 * 就会被 `Notifier` **原样弹在屏幕上**（`unsupportedHost` / `parseFailed`
 * 文案都是直接回显用户输入的），令牌于是随着一张截图出去。
 *
 * 解析本身不受影响：带 scheme 的分支走 `new URL().hostname`，本来就不含 userinfo。
 */
function redactForMessage(input: string): string {
    return redactUrl(input);
}

function resolveHost(domain: string, input: string): HostKind {
    const known = HOST_BY_DOMAIN[domain.toLowerCase()];
    if (known) return known;
    throw new UnsupportedHostError(
        `Unsupported host "${domain}" for repository "${redactForMessage(input)}".`,
        redactForMessage(input)
    );
}

/** 去掉用户从浏览器或聊天窗口复制时带上的噪音。 */
function cleanInput(raw: string): string {
    let s = raw.trim();
    // 包裹的引号、尖括号、反引号
    s = s.replace(/^[<"'`\s]+/, "").replace(/[>"'`\s]+$/, "");
    // URL 片段与查询串
    s = s.replace(/[?#].*$/, "");
    // 尾部斜杠
    s = s.replace(/\/+$/, "");
    // .git 后缀
    s = s.replace(/\.git$/i, "");
    return s;
}

interface HostAndPath {
    host: HostKind;
    path: string;
    /**
     * 平台是不是**地址里写明的**。
     *
     * `owner/repo` 简写为 `false` —— 这时平台是猜的（调用方给的默认值），
     * 而猜错了的后果是「悄悄指向另一个平台的同名仓库」，所以调用方需要
     * 知道「这个结论有多少依据」，才能决定要不要再去探测一次
     * （见 `InstallerService.resolveRepo` 的 `defaultHost: "auto"`）。
     */
    hostExplicit: boolean;
}

function splitHostAndPath(input: string, defaultHost: HostKind): HostAndPath {
    // 1) 带 scheme：https:// / http:// / ssh:// / git://
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
        let url: URL;
        try {
            url = new URL(input);
        } catch (cause) {
            throw new ParseError(
                `Malformed repository URL: "${redactForMessage(input)}".`,
                { cause }
            );
        }
        return { host: resolveHost(url.hostname, input), path: url.pathname, hostExplicit: true };
    }

    // 2) scp 形式：git@github.com:owner/repo
    const scp = /^(?:[^@/\s]+@)?([^:/\s]+\.[^:/\s]+):(.+)$/.exec(input);
    if (scp) {
        return { host: resolveHost(scp[1]!, input), path: scp[2]!, hostExplicit: true };
    }

    // 3) 无 scheme 的域名开头：github.com/owner/repo
    const slash = input.indexOf("/");
    if (slash > 0) {
        const first = input.slice(0, slash);
        if (looksLikeDomain(first)) {
            return {
                host: resolveHost(first, input),
                path: input.slice(slash + 1),
                hostExplicit: true,
            };
        }
    }

    // 4) owner/repo 简写 —— 平台未知，交给调用方给默认值
    return { host: defaultHost, path: input, hostExplicit: false };
}

function splitOwnerRepo(path: string, original: string): [string, string] {
    const segments = path.split("/").filter((segment) => segment.length > 0);
    if (segments.length < 2) {
        throw new ParseError(
            `Repository "${redactForMessage(original)}" is incomplete — expected owner/repo.`
        );
    }
    const owner = segments[0]!;
    const repo = segments[1]!;
    if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo)) {
        throw new ParseError(
            `Repository "${redactForMessage(original)}" contains invalid characters.`
        );
    }
    return [owner, repo];
}

/**
 * 解析结果 + 「平台这个结论是怎么来的」。
 *
 * `parseRepoRef` 只回 `RepoRef`，调用方分不出「用户写了 gitee.com」与
 * 「用户只写了 owner/repo，我们按默认值猜成了 GitHub」—— 而这两件事的
 * 处置完全不同：前者不该再探测（地址是用户自己写的），后者可以探测。
 */
export interface ParsedRepoRef {
    ref: RepoRef;
    /** 见 `HostAndPath.hostExplicit`。 */
    hostExplicit: boolean;
}

/**
 * 解析仓库标识，并说明平台是地址里写明的还是按默认值猜的。
 *
 * @param defaultHost `owner/repo` 简写无法判断平台时使用的默认值。
 * @throws {ParseError} 地址格式不对
 * @throws {UnsupportedHostError} 平台不受支持
 */
export function parseRepoRefDetailed(
    input: string,
    defaultHost: HostKind = "github"
): ParsedRepoRef {
    const raw = (input ?? "").trim();
    if (!raw) throw new ParseError("Repository identifier is empty.");

    const cleaned = cleanInput(raw);
    const { host, path, hostExplicit } = splitHostAndPath(cleaned, defaultHost);
    const [owner, repo] = splitOwnerRepo(path, cleaned);

    return { ref: { host, owner, repo }, hostExplicit };
}

/**
 * 解析仓库标识。
 *
 * 支持以下全部形态：
 * - `owner/repo`
 * - `https://github.com/owner/repo`（含 `/tree/main` 之类的多余路径）
 * - `https://gitee.com/owner/repo.git`
 * - `git@gitee.com:owner/repo.git`
 * - `github.com/owner/repo`
 *
 * @param defaultHost `owner/repo` 简写无法判断平台时使用的默认值。
 * @throws {ParseError} 地址格式不对
 * @throws {UnsupportedHostError} 平台不受支持
 */
export function parseRepoRef(input: string, defaultHost: HostKind = "github"): RepoRef {
    return parseRepoRefDetailed(input, defaultHost).ref;
}

/**
 * 地址里是否写明了平台。
 *
 * 界面用它决定「平台选择器要不要灰掉」：地址里写了 `gitee.com` 之后，
 * 用户再选「GitHub」也不会有任何效果 —— 灰掉并说明原因，比让它看起来能改要好。
 * 地址还解析不出 owner/repo 时（用户正在打字）一律算 `false`，选择器保持可用。
 */
export function hasExplicitHost(input: string): boolean {
    try {
        return parseRepoRefDetailed(input).hostExplicit;
    } catch {
        return false;
    }
}

/** 不抛异常的版本，用于「猜一下这是不是仓库地址」的场景。 */
export function tryParseRepoRef(
    input: string,
    defaultHost: HostKind = "github"
): RepoRef | undefined {
    try {
        return parseRepoRef(input, defaultHost);
    } catch {
        return undefined;
    }
}

/** `owner/repo`。持久化与去重比较都用这个形式。 */
export function formatRepoId(ref: RepoRef): RepoId {
    return `${ref.owner}/${ref.repo}`;
}

/** 判断两个引用是否指向同一个仓库（大小写不敏感 —— GitHub 与 Gitee 的 owner 都不区分大小写）。 */
export function isSameRepo(a: RepoRef, b: RepoRef): boolean {
    return (
        a.host === b.host &&
        a.owner.toLowerCase() === b.owner.toLowerCase() &&
        a.repo.toLowerCase() === b.repo.toLowerCase()
    );
}

/**
 * 规范化 git 远端地址。
 *
 * 参考项目 obsidian-git 的 `formatRemoteUrl()` 只对 `github.com` 和 `gitlab.com`
 * 补 `.git` 后缀（见 docs/reference-analysis.md 1.5），Gitee 走的是同一种
 * HTTPS 约定，所以这里把平台判断交给域名表，而不是硬编码字符串。
 */
export function formatRemoteUrl(url: string): string {
    if (url.endsWith(".git")) return url;

    const lower = url.toLowerCase();
    for (const domain of Object.keys(HOST_BY_DOMAIN)) {
        if (lower.startsWith(`https://${domain}/`) || lower.startsWith(`http://${domain}/`)) {
            return `${url}.git`;
        }
    }
    return url;
}

/** 从 git 远端地址反推仓库引用。认不出来时返回 undefined。 */
export function parseGitRemoteUrl(remote: string): RepoRef | undefined {
    return tryParseRepoRef(remote);
}

/** 仓库主页。 */
export function repoWebUrl(ref: RepoRef): string {
    const domain = ref.host === "gitee" ? "gitee.com" : "github.com";
    return `https://${domain}/${ref.owner}/${ref.repo}`;
}

/** 文件在网页端的地址。两个平台的路径格式一致。 */
export function fileWebUrl(ref: RepoRef, branch: string, path: string): string {
    return `${repoWebUrl(ref)}/blob/${branch}/${path}`;
}

/** 文件历史在网页端的地址。两个平台的路径格式一致。 */
export function fileHistoryWebUrl(ref: RepoRef, branch: string, path: string): string {
    return `${repoWebUrl(ref)}/commits/${branch}/${path}`;
}

/** 提交在网页端的地址。 */
export function commitWebUrl(ref: RepoRef, hash: string): string {
    return `${repoWebUrl(ref)}/commit/${hash}`;
}
