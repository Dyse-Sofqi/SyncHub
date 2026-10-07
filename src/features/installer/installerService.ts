import type { App } from "obsidian";
import { requireApiVersion } from "obsidian";
import type { LocaleStrings } from "../../core/i18n";
import { logger } from "../../core/logger";
import type { Notifier } from "../../core/notice";
import { availableUpdateKey, type ObsyncSettings } from "../../core/settings";
import type { SecretStore } from "../../core/secretStore";
import { RateLimitError } from "../../host/errors";
import { getHost } from "../../host/hostRegistry";
import { formatRepoId, isSameRepo, parseRepoRef } from "../../host/repoRef";
import type { HostKind, RepoRef } from "../../host/types";
import { InstallerError } from "./errors";
import type { BindCandidate } from "./existingPlugins";
import type { ThemeBindCandidate } from "./existingThemes";
import { findGiteeMirror, findGiteeMirrorForTheme } from "./mirrorFinder";
import { fetchFiles, PLUGIN_SPEC, THEME_SPEC, type FetchSpec } from "./installFiles";
import { createBackup, writeItemFiles } from "./itemFolder";
import { parsePluginManifest, parseThemeManifest } from "./manifest";
import { isValidThemeName } from "../../core/themeName";
import {
    enablePlugin,
    isPluginEnabled,
    readManifestInFolder,
    refreshPluginManifests,
    reloadPlugin,
    resolvePluginFolder,
    resolvePluginFolderInfo,
} from "./pluginFolder";
import {
    resolveSelfRepo,
    selfRepoAttempts,
    selfSourceLabel,
    setPendingRestart,
    SELF_PLUGIN_ID,
} from "./selfUpdate";
import {
    getActiveTheme,
    readThemeManifestInFolder,
    readThemeManifestVersion,
    requestThemeReload,
    resolveThemeFolder,
} from "./themeFolder";
import { compareVersions } from "./versions";
import {
    itemRepoRef,
    KIND_MARKER_FILE,
    MANIFEST_FILE,
    type InstallChannel,
    type InstallResult,
    type InstallSource,
    type PluginFileName,
    type PluginManifest,
    type ThemeInstallResult,
    type ThemeManifest,
    type ThemeUpdateResult,
    type TrackedItem,
    type TrackedKind,
    type TrackedPlugin,
    type TrackedTheme,
    type SelfUpdateCheck,
    type UpdateCheckResult,
} from "./types";

/**
 * 安装编排。
 *
 * 一次安装的完整链路：
 *   解析仓库 → （可选）镜像发现 → 解析安装目标 → 取文件 → 兼容性检查
 *   → 备份 → 写盘 → 启用/重载 → 记录
 *
 * 与参考项目 BRAT 的三处关键差异：
 * 1. **写入前备份，失败回滚**（BRAT 没有回滚）。
 * 2. **逐文件回退到源码通道**（BRAT 要求三个文件都在 release 资产里）。
 * 3. **API 不可用时降级到源码通道**并明确告知用户 —— Gitee 的匿名 API
 *    配额极低，实测会直接 403 限流，没有这条降级路径就完全装不了。
 *
 * ## 插件与主题共用到哪一步
 *
 * 前半段（解析仓库、解析来源、取文件、兼容性检查、备份、写盘、记录）两者**逐字
 * 相同**，只有两个地方分叉：
 *
 * - **身份从哪来**：插件是 `manifest.id`，主题是已记录的那个目录名；
 * - **写完之后的动作**：插件要 enable / reload，主题只在「更新的正是当前主题」
 *   时请求重载（绝不替用户切换主题）。
 *
 * 后半段因此各写一个方法（`install` / `updateTheme`），但不复制前半段 ——
 * 那段抽在 `fetchItem` 与 `recordItem` 里。
 */

export interface InstallerHost {
    app: App;
    notifier: Notifier;
    secretStore: SecretStore;
    getSettings(): ObsyncSettings;
    getT(): LocaleStrings;
    saveSettings(): Promise<void>;
}

export interface InstallRequest {
    /** 用户输入的仓库地址（`owner/repo`、URL、scp 形式均可）。 */
    repo: string;
    /** `"latest"` 或具体 tag。 */
    version?: string;
    /** 安装后是否启用。 */
    enableAfterInstall?: boolean;
    /** 是否允许用 Gitee 镜像替换 GitHub 源。 */
    allowMirror?: boolean;
    /** 用于 `owner/repo` 简写时的默认平台。 */
    defaultHost?: HostKind;
    /**
     * 已经识别过的**源仓库地址**（来自「添加插件仓库」弹窗的「识别」那一步）。
     *
     * 弹窗在那里已经做过镜像发现，安装时不该再打一遍网络请求（所以那边传
     * `allowMirror: false`）—— 但「用户填的是哪个地址」只存在于弹窗手上。
     * 不传进来，走了镜像的安装就再也说不出源仓库在哪：`repo` 那一栏这时装的是
     * 镜像地址，源地址没有任何位置可放。跟踪列表要同时展示两个地址，靠的就是它。
     *
     * 只在它与 `repo` 不同时才有意义（相同的话本来就没丢信息）。
     */
    origin?: RepoRef;
    /**
     * 取文件时的逐文件回调（`manifest.json` → `main.js` → `styles.css`）。
     *
     * 存在的理由：这一步最慢 —— 国内网络下对 GitHub 资产域名的**第一次**请求
     * 常常要等 17~20 秒（见 HANDOVER 第七节第 19 条）。调用方拿它把「正在获取
     * 哪一个文件」显示出来，否则用户只看到一个不动的界面，分不清是在下载还是卡住。
     */
    onProgress?: (file: string) => void;
}

export interface VersionOption {
    value: string;
    label: string;
    publishedAt?: string;
    prerelease: boolean;
}

/**
 * **新装**一个主题的请求。
 *
 * 比 `InstallRequest` 少三样东西（版本、镜像、启用）—— 这不是「还没实现」，
 * 而是主题没有那些概念：没有版本钉选（身份是目录名，更新恒取最新的源码文件）、
 * 新装不做镜像发现（见 `installTheme`）、也没有「启用」这个状态（只有「当前用的是
 * 哪一个」，而那件事我们绝不替用户做）。
 */
export interface ThemeInstallRequest {
    /** 用户输入的仓库地址（`owner/repo`、URL、scp 形式均可）。 */
    repo: string;
    /** 用于 `owner/repo` 简写时的默认平台。 */
    defaultHost?: HostKind;
    /** 取文件时的逐文件回调（理由见 `InstallRequest.onProgress` —— 这一步最慢）。 */
    onProgress?: (file: string) => void;
}

/** 主题仓库的识别结果（「添加主题」弹窗的「识别」那一步）。 */
export interface ResolvedThemeRepo {
    ref: RepoRef;
    manifest: ThemeManifest;
}

/**
 * 仓库地址的解析结果。
 *
 * 三个字段说的是三件事，别合并：
 * - `ref`：**这次要用**的地址（`acceptMirror` 时为镜像，否则就是用户填的那个）；
 * - `origin`：用户填的地址 —— 只在 `ref` 是镜像时才有值（列表要同时显示两个地址）；
 * - `mirror`：**疑似镜像**（通过了 manifest `id` 校验但**没有被采用**）。
 *
 * `mirror` 存在才是常态：镜像发现**从不自动采用**，它只提出候选，由用户确认
 * （见 `InstallerService.confirmMirror` 与 `mirrorSuggestions` 的注释）。
 */
export interface ResolvedRepo {
    ref: RepoRef;
    origin?: RepoRef;
    mirror?: RepoRef;
}

/** 安装目标的解析结果，带上「是否降级」的信息。 */
interface ResolvedSource {
    source: InstallSource;
    /** 非空表示发生了降级，内容是要告诉用户的原因。 */
    degradedReason?: string;
}

/** 取文件阶段的结果（两条安装路径共用的前半段）。 */
interface FetchedItem<M, N extends string> {
    files: Map<N, string>;
    manifest: M;
    channel: InstallChannel;
    repoRef: RepoRef;
    /** 走了镜像时的源地址；见 `ResolvedRepo`。 */
    origin?: RepoRef;
    /**
     * **疑似镜像**（通过了 `id` 校验但没被采用）。
     * 调用方负责把它记成「待用户确认」，见 `InstallerService.confirmMirror`。
     */
    mirror?: RepoRef;
}

export class InstallerService {
    /**
     * 解析出来的 Gitee 账号名（镜像探测的第二个候选 owner）。
     * 只缓存**成功**的结果，理由见 `giteeAccountName`。
     */
    private giteeAccount: string | undefined;

    constructor(readonly deps: InstallerHost) {}

    private get app(): App {
        return this.deps.app;
    }

    private get settings(): ObsyncSettings {
        return this.deps.getSettings();
    }

    private tokenFor(kind: HostKind): string | undefined {
        return this.deps.secretStore.getToken(kind);
    }

    /**
     * 取某个平台的访问令牌。**给同模块的协作者用**（`UpdateChecker`）。
     *
     * 公开它是因为「检查更新」和「安装」必须用同一套凭据，而这两条路曾经不一致：
     * `resolveSource` 传令牌、`checkOne` 不传。后果有两层 ——
     *
     * 1. 私有仓库在不带令牌时两个平台都返回 **404**（刻意不泄漏「仓库存在与否」），
     *    于是检查会把它读成「这个仓库没有 release」→ 永远报「已是最新」，
     *    而用户其实装得上、也有得更新（安装路径带令牌，一切正常）；
     * 2. 不带令牌走的是**匿名配额**。Gitee 的匿名配额极低，项目为此专门做了
     *    「进入设置页 10 分钟节流」—— 在这里花掉它，等于自己制造那些 403。
     */
    tokenForHost(kind: HostKind): string | undefined {
        return this.tokenFor(kind);
    }

    /**
     * 自身更新的来源（**默认就是 Gitee 镜像**，见 `resolveSelfRepo`）。
     *
     * 公开它是因为「检查更新」与「执行更新」必须是**同一个来源** —— 与
     * `tokenForHost` 同一个理由：两条路各读一次设置、各写一遍解析，迟早会有一条
     * 读漏或读错（那正是「检查说没有更新、更新却从另一个仓库拉」的来源）。
     * `UpdateChecker.checkSelf` 拿它当默认参数，`updateSelf` 也用它。
     */
    selfRepo(): RepoRef {
        return resolveSelfRepo(this.settings.installer.selfUpdateUseGitee);
    }

    /**
     * 回退到官方仓库时提示一次（**每次回退都提示**）。
     *
     * 公开给同模块的协作者（`UpdateChecker`）：检查与更新的回退必须长得一模一样，
     * 而两边各写一遍文案迟早会有一边漏掉 —— 那正是「悄悄换了来源」。
     */
    notifySelfFallback(from: RepoRef): void {
        this.deps.notifier.warn(
            this.deps.getT().installer.selfSourceFallback(selfSourceLabel(from))
        );
    }

    // ── 解析 ──────────────────────────────────────────────────────────────

    /**
     * 解析用户输入，并按需做 Gitee 镜像发现。
     *
     * 镜像发现用 manifest 的 `id` 做二次校验，而不是只比仓库名 ——
     * 同名不同项目在 Gitee 上很常见，只比名字会装错插件。
     *
     * ## 发现了也**不自动采用**（`acceptMirror` 是唯一的采用方式）
     *
     * `id` 一致只说明「是同一个插件」，说明不了「是同一份代码、同一个作者、
     * 同样的新鲜度」—— fork、或者别人用同一个 `id` 重新上传都能过这一关，而插件
     * 是能读写整个库的代码。候选地址又常常来自「猜 owner」（同名、或你 Gitee 账号
     * 名的同名仓库），所以**采用必须由人拍板**：默认只把候选放在结果里
     * （`mirror`），由界面列出来请用户确认。
     */
    async resolveRepo(
        input: string,
        options: {
            allowMirror?: boolean;
            defaultHost?: HostKind;
            origin?: RepoRef;
            /** 用户已经确认过这个镜像（弹窗里勾了「使用镜像」）—— 只有这时才采用。 */
            acceptMirror?: boolean;
        } = {}
    ): Promise<ResolvedRepo> {
        const ref = parseRepoRef(input, options.defaultHost ?? "github");

        // 调用方自己带来了源地址，说明镜像那一步已经做过了（弹窗路径）。
        const providedOrigin =
            options.origin && !isSameRepo(options.origin, ref) ? options.origin : undefined;

        const shouldLookForMirror =
            !providedOrigin &&
            (options.allowMirror ?? this.settings.installer.discoverGiteeMirrors) &&
            ref.host === "github";

        if (!shouldLookForMirror) {
            return providedOrigin ? { ref, origin: providedOrigin } : { ref };
        }

        try {
            const mirror = await findGiteeMirror(
                ref,
                this.tokenFor("github"),
                await this.mirrorOwnerCandidates(ref)
            );
            if (mirror && options.acceptMirror) {
                logger.info(`using Gitee mirror ${formatRepoId(mirror)} for ${formatRepoId(ref)}`);
                // `origin`（用户填的地址）**必须一路带到 `recordItem`**：`ref` 这时
                // 已经被镜像占了，源地址只此一份，丢了就只能等用户重新发现。
                return { ref: mirror, origin: ref, mirror };
            }
            if (mirror) {
                logger.info(
                    `found a possible Gitee mirror ${formatRepoId(mirror)} for ` +
                        `${formatRepoId(ref)} — waiting for the user to confirm it`
                );
                return { ref, mirror };
            }
        } catch (err) {
            // 镜像发现是「锦上添花」，任何失败都不该阻断安装。
            logger.debug(`mirror discovery failed for ${formatRepoId(ref)}`, err);
        }

        return { ref };
    }

    /**
     * 镜像探测的候选 owner（按可信度排序）。
     *
     * 第二个候选是**配置的 Gitee 账号名**：作者常把仓库镜像到自己的 Gitee 账号下，
     * 而那个账号名与 GitHub 上的 owner 往往不同名（实测 `Dyse-Sofqi` ↔ `sofqi`）。
     * 没有令牌时拿不到账号名，那就只探同名那一个。
     */
    private async mirrorOwnerCandidates(ref: RepoRef): Promise<string[]> {
        const owners = [ref.owner];
        const account = await this.giteeAccountName();
        if (account && account.toLowerCase() !== ref.owner.toLowerCase()) owners.push(account);
        return owners;
    }

    /**
     * 用配置的 Gitee 令牌解析账号名（`GET /v5/user`）。
     *
     * **只在成功时缓存**：失败（或还没填令牌）不缓存 —— 这样用户在同一个会话里
     * 补上令牌之后，下一次探测就能用上，不必重启 Obsidian。
     */
    private async giteeAccountName(): Promise<string | undefined> {
        if (this.giteeAccount) return this.giteeAccount;
        const token = this.tokenFor("gitee");
        if (!token) return undefined;
        try {
            const info = await getHost("gitee").validateToken(token);
            if (!info.valid || !info.account) return undefined;
            this.giteeAccount = info.account;
            return this.giteeAccount;
        } catch (err) {
            logger.debug("could not resolve the Gitee account name", err);
            return undefined;
        }
    }

    /**
     * 识别一个**主题**仓库，并把它的 manifest 读回来校验（弹窗「识别」那一步）。
     *
     * 与 `resolveRepo` 分开而不是给它加一个 kind 参数：那一个是围绕**插件的镜像
     * 发现**写的（判据是 manifest 的 `id`），而主题既没有 id，新装时也没有可用的
     * 镜像判据（见 `installTheme`）。这里只做一件事：地址解析成 `RepoRef`，再把
     * 远端 manifest 读回来解析一次 —— 地址打错、或者那其实是个插件仓库时，用户
     * 在**安装之前**就能看到原因（与 `bindThemeToRepo` 的校验同一条思路）。
     */
    async resolveThemeRepo(
        input: string,
        defaultHost: HostKind = "github"
    ): Promise<ResolvedThemeRepo> {
        const ref = parseRepoRef(input, defaultHost);
        const repoLabel = formatRepoId(ref);
        const raw = await getHost(ref.host).readFile(ref, MANIFEST_FILE, {
            token: this.tokenFor(ref.host),
            ref: "HEAD",
        });

        if (raw === undefined) {
            throw new InstallerError({ kind: "missingManifest", repo: repoLabel, of: "theme" });
        }
        return { ref, manifest: parseThemeManifest(raw, repoLabel) };
    }

    /**
     * 这个仓库里装的是**另一类**对象吗？
     *
     * 只服务于一件事：用户在错误的入口里填了地址时给出下一步（「改为按主题安装」）。
     * 所以它读的是**标志性文件**（`main.js` / `theme.css`）而不是 manifest ——
     * 后者两类对象都有，分辨不出来。
     *
     * ## 为什么只在失败之后调
     *
     * 它要真的把一个文件读下来（走源码 raw 通道，**不花 API 配额**，但 `main.js`
     * 可能有几百 KB）。正常路径上一次都不调；只有安装已经失败、用户正卡在那里时，
     * 多读一个文件换取一句能走下去的提示是划算的。
     */
    async looksLikeKind(ref: RepoRef, kind: TrackedKind): Promise<boolean> {
        const marker = KIND_MARKER_FILE[kind];
        try {
            const raw = await getHost(ref.host).readFile(ref, marker, {
                token: this.tokenFor(ref.host),
                ref: "HEAD",
            });
            return raw !== undefined;
        } catch (err) {
            logger.debug(`could not probe ${marker} in ${formatRepoId(ref)}`, err);
            return false;
        }
    }

    /** 列出可安装的版本，供版本选择弹窗使用。 */
    async listVersions(repoRef: RepoRef): Promise<VersionOption[]> {
        const host = getHost(repoRef.host);
        const token = this.tokenFor(repoRef.host);
        const releases = await host.listReleases(repoRef, { token, limit: 100 });

        const options: VersionOption[] = [
            { value: "latest", label: this.deps.getT().installer.versionLatest, prerelease: false },
        ];

        for (const release of releases) {
            options.push({
                value: release.tag,
                label: release.tag + (release.prerelease ? " (pre)" : ""),
                publishedAt: release.publishedAt,
                prerelease: release.prerelease,
            });
        }

        return options;
    }

    /**
     * 解析实际要安装的来源。
     *
     * 优先级：指定 tag → 最新正式版 → 最新预发布版 → 源码默认分支。
     * API 调用失败（限流 / 网络）时降级到源码通道，并记录原因。
     */
    private async resolveSource(
        repoRef: RepoRef,
        requestedVersion: string
    ): Promise<ResolvedSource> {
        const token = this.tokenFor(repoRef.host);
        const host = getHost(repoRef.host);

        if (requestedVersion !== "latest") {
            return { source: { kind: "release", tag: requestedVersion, ref: requestedVersion } };
        }

        try {
            const latest = await host.getLatestRelease(repoRef, token);
            if (latest) {
                return { source: { kind: "release", tag: latest.tag, ref: latest.tag } };
            }

            // 没有正式版 —— 看看有没有预发布版（这是 beta 安装的路径）。
            const releases = await host.listReleases(repoRef, { token, limit: 20 });
            const first = releases[0];
            if (first) {
                return { source: { kind: "release", tag: first.tag, ref: first.tag } };
            }

            // 一个 release 都没有：Gitee 上这是常态，不是异常。
            return { source: { kind: "raw", ref: "HEAD" } };
        } catch (err) {
            // 这是一条**提示**（不是异常），所以在这里用 `t` 直接拼 ——
            // 本类持有 `t`，不必绕经错误的翻译器。
            const e = this.deps.getT().installer.errors;
            const reason =
                err instanceof RateLimitError
                    ? e.rateLimitFallback(host.displayName)
                    : e.apiUnavailableFallback(host.displayName);
            logger.warn(`falling back to source files for ${formatRepoId(repoRef)}`, err);
            return { source: { kind: "raw", ref: "HEAD" }, degradedReason: reason };
        }
    }

    /**
     * 解析仓库 → 解析来源 → 取文件 → 兼容性检查。
     *
     * 两条安装路径的**共同前半段**。写盘之前做兼容性检查是刻意的 ——
     * 写完才发现不兼容就要走回滚了。
     */
    private async fetchItem<M extends { name: string; minAppVersion?: string }, N extends string>(
        spec: FetchSpec<N, M>,
        repoInput: string,
        requestedVersion: string,
        options: {
            allowMirror?: boolean;
            defaultHost?: HostKind;
            origin?: RepoRef;
            acceptMirror?: boolean;
            onProgress?: (file: string) => void;
        }
    ): Promise<FetchedItem<M, N>> {
        const { ref: repoRef, origin, mirror } = await this.resolveRepo(repoInput, options);
        const { source, degradedReason } = await this.resolveSource(repoRef, requestedVersion);

        if (degradedReason) {
            this.deps.notifier.warn(degradedReason);
        }

        const host = getHost(repoRef.host);
        const token = this.tokenFor(repoRef.host);
        const { files, manifest, channel } = await fetchFiles(
            host,
            repoRef,
            source,
            token,
            spec,
            options.onProgress
        );

        if (manifest.minAppVersion && !requireApiVersion(manifest.minAppVersion)) {
            throw new InstallerError({
                kind: "incompatibleApp",
                name: manifest.name,
                minVersion: manifest.minAppVersion,
            });
        }

        return { files, manifest, channel, repoRef, origin, mirror };
    }

    // ── 安装（插件） ──────────────────────────────────────────────────────

    /** 安装或更新一个插件。 */
    async install(request: InstallRequest): Promise<InstallResult> {
        const requestedVersion = request.version ?? "latest";
        const { files, manifest, channel, repoRef, origin, mirror } = await this.fetchItem(
            PLUGIN_SPEC,
            request.repo,
            requestedVersion,
            {
                allowMirror: request.allowMirror,
                defaultHost: request.defaultHost,
                origin: request.origin,
                onProgress: request.onProgress,
            }
        );

        const folder = await resolvePluginFolder(this.app, manifest.id);
        const alreadyInstalled = await readManifestInFolder(this.app, folder);
        const wasEnabled = isPluginEnabled(this.app, manifest.id);

        // 插件目录名可能和用户输入的仓库不一致（仓库名 ≠ manifest id），
        // 这种情况下如果 id 已经装了别的插件，就是冲突，必须拦下。
        if (alreadyInstalled && alreadyInstalled.id !== manifest.id) {
            throw new InstallerError({
                kind: "pluginIdConflict",
                pluginId: manifest.id,
                // 报用户填的那个地址（走镜像时它不是 `repoRef`）——
                // 提示语要能对上他刚才在弹窗里输入的东西。
                repo: formatRepoId(origin ?? repoRef),
            });
        }

        const backup = await createBackup(this.app, "plugin", manifest.id, folder);

        try {
            await writeItemFiles(this.app, files, backup);
            await refreshPluginManifests(this.app);

            let enabled = false;
            if (wasEnabled) {
                // 更新场景：用户本来就开着，保持开着。
                await reloadPlugin(this.app, manifest.id);
                enabled = isPluginEnabled(this.app, manifest.id);
            } else if (request.enableAfterInstall) {
                await enablePlugin(this.app, manifest.id);
                enabled = isPluginEnabled(this.app, manifest.id);
            }

            // 先把「疑似镜像」记下来（写在 recordItem 之前，共用它那次落盘）——
            // 只提议、不采用，采用与否由用户在界面上拍板（confirmMirror）。
            this.rememberMirrorSuggestion("plugin", manifest.id, mirror);

            await this.recordItem({
                kind: "plugin",
                repoRef,
                origin,
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                channel,
                requestedVersion,
            });

            return {
                manifest,
                channel,
                version: manifest.version,
                replaced: alreadyInstalled !== undefined,
                enabled,
                repoRef,
                origin,
                mirror,
            };
        } catch (err) {
            // writeItemFiles 内部已经回滚过一次；这里只处理写盘之后
            // （启用/重载）失败的场景 —— 文件是好的，只是没能启用。
            logger.error(`install of ${manifest.id} failed after writing files`, err);
            throw err;
        }
    }

    // ── 安装（主题） ──────────────────────────────────────────────────────

    /**
     * 从仓库地址**新装**一个主题：写进 `{configDir}/themes/{名字}` 并记入跟踪列表。
     *
     * ## 为什么需要它
     *
     * 在它之前，主题只有两条路：**绑定**库里已经装好的（`bindExistingThemes` /
     * `bindThemeToRepo`）和**更新**已跟踪的（`updateTheme`）。也就是说 SyncHub 从来
     * 没能把一个主题装到磁盘上 —— 把主题仓库地址填进「添加插件仓库」只会得到一句
     * 「缺少必需文件：main.js」（2026-10-05 用户报的正是这个）。
     *
     * ## 四处与插件安装不同的地方
     *
     * 1. **目录名由远端 manifest 的 `name` 现算**（不能当目录名时回落到仓库名）——
     *    主题没有 id，目录名就是它的身份，官方主题商店也是这么落的
     *    （`themes/Minimal`）。`updateTheme` 那条「绝不改名」说的是**已存在**的主题，
     *    与这里不冲突。
     * 2. **不做镜像发现**：主题的镜像判据是「名字相同 + 版本不比源旧」，它依赖本地
     *    已经装好的那一版；新装时手上没有它，判据不成立（见 `findGiteeMirrorForTheme`）。
     *    所以这里 `allowMirror: false`，而不是让它去跑插件那套（按 `manifest.id`
     *    判断的）发现。
     * 3. **兼容性检查照跑**：`fetchItem` 里那段对两类对象都生效（主题的
     *    `minAppVersion` 是可选字段，写了就检查，这是主题唯一的「不兼容」信号）。
     * 4. **绝不替用户切换主题**：装完只提示「到 设置 → 外观 → 主题 里选它」。
     *    主题没有启用/禁用，唯一的对应动作是切换，而那是用户的界面 —— 与
     *    `themeFolder.ts` 刻意不收 `setTheme` 是同一条规矩。
     *
     * 覆盖已有的**同名不同主题**会被拦下（`themeNameConflict`），见
     * `assertThemeFolderFree`。
     */
    async installTheme(request: ThemeInstallRequest): Promise<ThemeInstallResult> {
        const { files, manifest, channel, repoRef } = await this.fetchItem(
            THEME_SPEC,
            request.repo,
            "latest",
            {
                allowMirror: false,
                defaultHost: request.defaultHost,
                onProgress: request.onProgress,
            }
        );

        const id = this.themeFolderName(manifest, repoRef);
        const folder = await resolveThemeFolder(this.app, id);
        await this.assertThemeFolderFree(folder, repoRef, manifest);

        const backup = await createBackup(this.app, "theme", id, folder);
        await writeItemFiles(this.app, files, backup);

        const active = getActiveTheme(this.app);
        const wasActive = active !== undefined && active.toLowerCase() === id.toLowerCase();
        if (wasActive) requestThemeReload(this.app);

        await this.recordItem({
            kind: "theme",
            repoRef,
            id,
            name: manifest.name,
            version: manifest.version,
            channel,
        });

        return {
            manifest,
            channel,
            version: manifest.version,
            id,
            // 目录本来就在 = 重装/替换，与新装是两句不同的话（「已安装」/「已更新」）。
            replaced: backup.folderExisted,
            wasActive,
            repoRef,
        };
    }

    /**
     * 新装的主题写进哪个目录名。
     *
     * 优先 manifest 的 `name`：那既是用户在「外观」里看到的名字，也是官方主题商店
     * 用的目录名（`themes/Minimal`），两者一致时用户核对起来最省事。
     *
     * 它不能当目录名时（`isValidThemeName`：空串、`.`、路径分隔符、首尾空白……）
     * 回落到**仓库名**。仓库名同样是远端数据、同样要过一遍校验 —— 两条都不行就报错，
     * 而不是「随便拼一个」：目录名会成为 `rmdir(folder, true)` 递归删除的目标
     * （见 `core/themeName.ts` 的文件头）。
     */
    private themeFolderName(manifest: ThemeManifest, ref: RepoRef): string {
        const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
        if (isValidThemeName(name)) return name;

        logger.warn(
            `theme name ${JSON.stringify(manifest.name)} cannot be used as a folder name — ` +
                `falling back to the repository name for ${formatRepoId(ref)}`
        );
        if (isValidThemeName(ref.repo)) return ref.repo;

        throw new InstallerError({
            kind: "themeNameInvalid",
            repo: formatRepoId(ref),
            name: String(manifest.name),
        });
    }

    /**
     * `themes/{名字}` 已经被**另一个**主题占着吗？占着就抛错，绝不覆盖。
     *
     * 两种「不算冲突」要分清：
     *
     * - **读不到 manifest 的目录**：Obsidian 自己会把这种目录当成版本 `0.0.0` 的主题
     *   加载（可能是损坏的、也可能是用户手工拷进来的半个主题），而它的目录名与我们
     *   要写的是同一个 —— 那就是同一个主题，覆盖它正是「重装」该做的事；
     * - **同名（大小写不敏感）**：`themes/minimal` 与 manifest 里的 `Minimal` 在
     *   Windows / macOS 上本就是同一个目录。
     *
     * 除了这两种，其余一律拦下：两个不同的主题完全可以同名，而覆盖掉的可能是用户
     * 正在用的那一个 —— 它不在跟踪列表里，没有「重新下载」这条路。
     */
    private async assertThemeFolderFree(
        folder: string,
        ref: RepoRef,
        incoming: ThemeManifest
    ): Promise<void> {
        const existing = await readThemeManifestInFolder(this.app, folder);
        if (!existing) return;
        // 两边都 trim 再比：manifest 的 `name` 只要非空就过解析，带空白的
        // `"Minimal "` 与 `"Minimal"` 在这里必须是同一个主题
        // （`themeFolderName` 也是先 trim 再当目录名的）。
        if (existing.name.trim().toLowerCase() === incoming.name.trim().toLowerCase()) return;

        throw new InstallerError({
            kind: "themeNameConflict",
            id: folder.slice(folder.lastIndexOf("/") + 1),
            repo: formatRepoId(ref),
            existing: existing.name,
        });
    }

    // ── 更新（主题） ──────────────────────────────────────────────────────

    /**
     * 更新一个已跟踪的主题。
     *
     * 三处刻意的行为：
     *
     * 1. **写回记录的那个目录名**，绝不按远端 manifest 的 `name` 改名 ——
     *    目录名就是主题的身份（Obsidian 的「外观」里显示的是它，`setTheme()`
     *    收的也是它），改名等于换了一个主题。
     * 2. **绝不改变用户当前用的主题**。主题没有「启用/禁用」，唯一对应的动作
     *    就是切换，而「更新一下」显然不该有那种副作用。
     * 3. 但如果更新的**正是**当前主题，写完请求一次重载 —— 否则用户看到
     *    「更新成功」而页面观感毫无变化（Obsidian 不会自己去读被换掉的文件）。
     */
    async updateTheme(
        tracked: TrackedTheme,
        onProgress?: (file: string) => void
    ): Promise<ThemeUpdateResult> {
        // 主题的镜像**只提议、不采用**（判据与插件不同，见 findGiteeMirrorForTheme）——
        // 采用同样要经确认弹窗。探测在这里单独做，因为 `resolveRepo` 那套判据是
        // 为插件 manifest 的 `id` 写的，主题没有 id。
        const mirror = await this.proposeThemeMirror(tracked);

        const { files, manifest, channel, repoRef, origin } = await this.fetchItem(
            THEME_SPEC,
            formatRepoId(tracked),
            "latest",
            // 上面已经探过了，这里不要重复打网络请求。
            { allowMirror: false, defaultHost: tracked.host, onProgress }
        );

        const folder = await resolveThemeFolder(this.app, tracked.id);
        const backup = await createBackup(this.app, "theme", tracked.id, folder);

        await writeItemFiles(this.app, files, backup);

        const active = getActiveTheme(this.app);
        const wasActive =
            active !== undefined && active.toLowerCase() === tracked.id.toLowerCase();
        if (wasActive) requestThemeReload(this.app);

        await this.recordItem({
            kind: "theme",
            repoRef,
            origin,
            id: tracked.id,
            name: manifest.name,
            version: manifest.version,
            channel,
        });

        // 与插件侧一致：提议写在 recordItem 之前，共用它那次落盘。
        this.rememberMirrorSuggestion("theme", tracked.id, mirror);

        return {
            manifest,
            channel,
            version: manifest.version,
            replaced: backup.folderExisted,
            wasActive,
            repoRef,
            origin,
            mirror,
        };
    }

    /**
     * 为主题找一个**疑似镜像**（不采用）。
     *
     * 只在「当前跟的是 GitHub + 打开了镜像发现 + 还没在用镜像」时才探：
     * 已经在走镜像的条目没什么可提议的（`ref.host !== "github"`）。
     */
    private async proposeThemeMirror(tracked: TrackedTheme): Promise<RepoRef | undefined> {
        const ref = itemRepoRef(tracked);
        if (ref.host !== "github") return undefined;
        if (tracked.origin) return undefined;
        if (!this.settings.installer.discoverGiteeMirrors) return undefined;

        try {
            return await findGiteeMirrorForTheme(
                ref,
                this.tokenFor("github"),
                await this.mirrorOwnerCandidates(ref),
                { name: tracked.name, version: tracked.installedVersion }
            );
        } catch (err) {
            // 锦上添花，任何失败都不该阻断更新。
            logger.debug(`theme mirror discovery failed for ${formatRepoId(ref)}`, err);
            return undefined;
        }
    }

    // ── 绑定 ──────────────────────────────────────────────────────────────

    /**
     * 绑定库里已安装的插件（来源经社区索引识别）。
     *
     * 绑定只是「加入跟踪列表」—— 不写任何文件、不改启用状态。
     * `installedVersion` 取本地 manifest 的版本（它就是磁盘上的事实），
     * `requestedVersion` 固定 latest，更新检查从此刻开始生效。
     *
     * @returns 实际新增的条数（已在跟踪列表里的会被跳过）。
     */
    async bindExisting(candidates: BindCandidate[]): Promise<number> {
        return this.addTracked(
            candidates.map((candidate) => ({
                kind: "plugin" as const,
                id: candidate.id,
                name: candidate.name,
                version: candidate.version,
                repo: candidate.repo,
            }))
        );
    }

    /** 绑定库里已安装的主题（来源经官方主题索引识别）。 */
    async bindExistingThemes(candidates: ThemeBindCandidate[]): Promise<number> {
        return this.addTracked(
            candidates.map((candidate) => ({
                kind: "theme" as const,
                id: candidate.id,
                name: candidate.name,
                version: candidate.version,
                repo: candidate.repo,
            }))
        );
    }

    /**
     * 手动绑定一个来源未识别的主题（用户手填仓库地址）。
     *
     * 为什么主题需要这条路、插件不需要：插件有「添加插件仓库」那个入口，
     * 官方索引里查不到时用户可以去那里手动装；本次范围里主题**没有**新装入口，
     * 手填仓库地址就是未识别主题唯一的纳入方式。
     *
     * 绑定前会先读一次远端的 manifest.json 做校验 —— 一个打错的仓库地址若被
     * 静默记下，要等到下次「更新」时才会以写错文件的形式暴露出来。
     *
     * @returns 新增条数（0 表示已经在跟踪列表里）。
     */
    async bindThemeToRepo(
        theme: { id: string; name: string; version: string },
        repoInput: string
    ): Promise<number> {
        const ref = parseRepoRef(repoInput, "github");
        const repoLabel = formatRepoId(ref);
        const raw = await getHost(ref.host).readFile(ref, MANIFEST_FILE, {
            token: this.tokenFor(ref.host),
            ref: "HEAD",
        });

        if (raw === undefined) {
            throw new InstallerError({ kind: "missingManifest", repo: repoLabel, of: "theme" });
        }
        // 解析一次就够：manifest 不合法会在此抛出带类型码的错误。
        parseThemeManifest(raw, repoLabel);

        return this.addTracked([
            { kind: "theme", id: theme.id, name: theme.name, version: theme.version, repo: ref },
        ]);
    }

    /** 绑定条目的共同落库路径。 */
    private async addTracked(
        entries: Array<{
            kind: TrackedKind;
            id: string;
            name: string;
            version: string;
            repo: RepoRef;
        }>
    ): Promise<number> {
        const tracked = this.settings.installer.tracked;
        let added = 0;

        for (const entry of entries) {
            // 用**同一个身份键**判重，而不是就地写一个 `kind === kind && id === id`：
            // 键里还编着「主题的目录名不区分大小写」这条规则（见 `availableUpdateKey`），
            // 就地比较会漏掉它 —— 于是同一个主题能被记两条，各自指向同一个目录。
            const key = availableUpdateKey(entry);
            if (tracked.some((item) => availableUpdateKey(item) === key)) {
                continue;
            }

            const common = {
                host: entry.repo.host,
                owner: entry.repo.owner,
                repo: entry.repo.repo,
                id: entry.id,
                name: entry.name,
                installedVersion: entry.version,
                frozen: false,
                installedAt: Date.now(),
            };

            tracked.push(
                entry.kind === "plugin"
                    ? {
                          ...common,
                          kind: "plugin",
                          requestedVersion: "latest",
                          // 历史未知 —— 当作 release 通道，更新检查会按实际回退。
                          channel: "release",
                      }
                    : {
                          ...common,
                          kind: "theme",
                          // 主题连通道都不编造：绑定没经过任何下载，
                          // 第一次更新后才有真实值。
                      }
            );
            added += 1;
        }

        if (added > 0) await this.deps.saveSettings();
        return added;
    }

    // ── 更新自己 ──────────────────────────────────────────────────────────

    /**
     * 更新 SyncHub 自己 —— 写盘后**不重载、不记入跟踪列表**。
     *
     * ## 为什么不重载（这块的核心取舍）
     *
     * 别的插件更新完走 disable → enable；对**自己**是先卸载正在执行这段代码的
     * 实例，剩下半段靠闭包才活着 —— 能成也是靠副作用成功，中途失败就停在
     * 「已禁用」，而来得及提示你的代码已经不在了。所以这里只写文件，然后记一个
     * 「待重启」的版本号（设置页据此常驻提示，用户重启后新代码才生效）。
     *
     * 不记入跟踪列表：那张表是「用户装了什么」的清单，自己不是其中一项
     * （绑定弹窗也刻意跳过自己）。所以它没有徽标、没有取消绑定。
     *
     * ## 两道守卫
     *
     * - 远端 manifest 的 id 必须是 `ob-sync`。来源可能是写死的官方常量，也可能是
     *   用户在设置里填的地址 —— 无论哪个，按错的 id 解析目录都会把**别的插件**
     *   覆盖掉。拦住，而不是赌它没写错。
     * - **不允许降级**（远端比当前旧就中止）：「更新」不该把用户降回旧版本。
     *   版本相同则放行 —— 那是「重装修复」，把一个坏掉的安装修回来是合理需求。
     *
     * ## 来源会**依次尝试**（2026-10-01）
     *
     * 设置里那个来源（默认 Gitee 镜像）失败时改用官方仓库重试，**每次回退都提示**
     * （`notifySelfFallback`）。取回文件与两道校验都算「这一次尝试」—— 镜像给了一个
     * id 不对的 manifest、或者落后到比当前版本还旧，同样该改用官方。
     * 写盘**只做一次**：它不属于任何一次尝试（磁盘错误的回退到另一个来源没有意义）。
     *
     * @param currentVersion 运行中的版本（来自插件 manifest）。传进来而不是读磁盘：
     *   待重启期间磁盘上那份比运行中的新，拿它比就永远比不出「降级」。
     */
    async updateSelf(currentVersion: string): Promise<{ version: string; replaced: boolean }> {
        // 来源由设置决定（默认 = Gitee 镜像）；与「检查更新」共用 `selfRepo()`，
        // 于是两条路不可能分叉（见那个方法的说明）。
        //
        // **不做镜像发现**：那套是「自动探测 + 只提议、要用户确认」，每次都要探一遍；
        // 而这里的来源是写死的固定来源，再探一次只会让「到底从哪更新」变得不确定。
        const { files, manifest } = await this.firstWorkingSelfSource(
            selfRepoAttempts(this.selfRepo()),
            (repoRef) => this.fetchSelfUpdate(repoRef, currentVersion)
        );

        const folder = await resolvePluginFolder(this.app, SELF_PLUGIN_ID);
        const backup = await createBackup(this.app, "plugin", SELF_PLUGIN_ID, folder);

        // 写入失败会整体回滚（`writeItemFiles` 内部），此时**不会**留下待重启标记 ——
        // 标标记与写盘是同一个成功条件，这是「磁盘比运行中新」这个断言成立的前提。
        await writeItemFiles(this.app, files, backup);

        setPendingRestart(this.settings, manifest.version);
        // 那个「可用更新」已经落盘了，再挂着它会让标签页的徽标一直亮着
        // （徽标读的正是 `selfUpdateAvailable`）—— 用户会以为更新没生效。
        // 重启之后状态行由「待重启」那条接管，不需要这一份。
        this.settings.installer.selfUpdateAvailable = "";
        await this.deps.saveSettings();

        logger.info(`SyncHub updated to ${manifest.version}; restart required`);

        return { version: manifest.version, replaced: backup.folderExisted };
    }

    /**
     * 依次尝试各个来源，返回**第一次成功**的结果；全部失败时抛出最后一次的错误。
     *
     * 每次回退都提示用户（`notifySelfFallback`）—— 悄悄换成官方仓库正是这里要避免的。
     * 抛的是**最后一次**（也就是官方那次）的原因：用户看到的该是「最后为什么没成」，
     * 而回退本身已经单独提示过了。
     */
    private async firstWorkingSelfSource<T>(
        attempts: RepoRef[],
        run: (repoRef: RepoRef) => Promise<T>
    ): Promise<T> {
        for (const [index, repoRef] of attempts.entries()) {
            try {
                return await run(repoRef);
            } catch (error) {
                const fallback = attempts[index + 1];
                // 最后一次也失败了 —— 原样上抛（调用方按错误路径显示）。
                if (!fallback) {
                    throw error instanceof Error ? error : new Error(String(error));
                }
                logger.warn(
                    `self update from ${formatRepoId(repoRef)} failed; retrying with ${formatRepoId(fallback)}`,
                    error
                );
                this.notifySelfFallback(repoRef);
            }
        }

        // 只有 `attempts` 为空才可能走到这里，而 `selfRepoAttempts` 保证它至少有一项。
        throw new Error("self update: no source to try");
    }

    /**
     * 从**某一个**来源取回自身更新的文件并做两道校验（不写盘）。
     *
     * 抽出来是为了让「尝试」有明确的边界：取文件、id 校验、降级校验三者一起构成
     * 「这一次来源可不可用」；写盘不算（见 `updateSelf`）。
     */
    private async fetchSelfUpdate(
        repoRef: RepoRef,
        currentVersion: string
    ): Promise<FetchedItem<PluginManifest, PluginFileName>> {
        const fetched = await this.fetchItem(
            PLUGIN_SPEC,
            formatRepoId(repoRef),
            "latest",
            // `formatRepoId` 只给 `owner/repo`（它**不带 host** —— 持久化与去重都用那个
            // 形式），所以必须把 host 一并传下去。否则 `sofqi/SyncHub` 会被当成 **GitHub**
            // 上的同名仓库，用户填的 Gitee 地址就悄悄失效了 —— 而界面看起来一切正常
            // （2026-09-20 被测试抓到，见 `selfUpdate.test.ts` 的「来源取设置里的地址」）。
            { allowMirror: false, defaultHost: repoRef.host }
        );

        if (fetched.manifest.id !== SELF_PLUGIN_ID) {
            throw new InstallerError({
                kind: "selfIdMismatch",
                repo: formatRepoId(fetched.repoRef),
                id: fetched.manifest.id,
            });
        }

        if (compareVersions(fetched.manifest.version, currentVersion) === -1) {
            throw new InstallerError({
                kind: "selfUpdateDowngrade",
                current: currentVersion,
                latest: fetched.manifest.version,
            });
        }

        return fetched;
    }

    // ── 取消绑定 ──────────────────────────────────────────────────────────

    /**
     * 取消跟踪 —— **不碰磁盘上的任何东西**。
     *
     * 这个方法以前叫 `uninstall`，它会禁用插件、递归删掉整个目录，主题那边还会
     * 先把正在使用的主题切回默认。那是**越界**的：跟踪列表记的是「我在跟哪个仓库」，
     * 而插件 / 主题的安装与移除归 Obsidian 自己管（设置里的「已安装插件」与「外观」）。
     *
     * 对**绑定**进来的对象来说这一点尤其要紧：用户从官方商店或手工装好之后让 SyncHub
     * 认下它，此时点「移除」想表达的几乎一定是「别再跟了」，而不是「把它从库里删掉」。
     * 后者不可逆（尤其是他自己放进去的附加文件），而前者一条命令就能加回来。
     *
     * 所以这里只做两件事：从跟踪列表里去掉、清掉它的更新徽标。
     * 要真删文件，去 Obsidian 自己的界面删 —— 那里有它自己的确认流程。
     */
    async unbind(tracked: TrackedItem): Promise<void> {
        const settings = this.settings;

        // 按 kind + id 移除：跟踪列表的不变量就是「每个 (kind, id) 只有一条」，
        // 与 recordItem / sanitize 的去重口径一致。
        settings.installer.tracked = settings.installer.tracked.filter(
            (item) => !(item.kind === tracked.kind && item.id === tracked.id)
        );

        // 顺手清掉徽标记录：跟踪列表是「谁该有徽标」的唯一事实来源。留着它，
        // 用户重新绑定时会先看到一条过期的「可更新」。
        delete settings.installer.availableUpdates[availableUpdateKey(tracked)];

        // 待确认的镜像提议同理：条目都没了，提议自然作废。
        delete settings.installer.mirrorSuggestions[availableUpdateKey(tracked)];

        await this.deps.saveSettings();
    }

    // ── 记录与磁盘的校正 ──────────────────────────────────────────────────

    /**
     * 用**磁盘上真实的 manifest** 校正记录里的版本号，并报告有哪些目录在抢同一个 id。
     *
     * 为什么必须有这一步：`installedVersion` 是**装的那一刻**的事实，写进 `data.json`
     * 之后就再没人核对过。任何外部改动都会让它变成谎话 —— 别的工具/安装器动过文件、
     * 随库同步时把旧文件带了回来、或者像实测那样 `plugins/` 里多出一份同 id 的残留
     * 备份（Obsidian 重启后加载了那份 2.5.16，而记录里还是 2.6.4）。后果是更新检查
     * 拿着过期的版本去比远端，于是**永远报「已是最新」**，用户被卡在旧版本上还查不出原因。
     *
     * 判据取 Obsidian 实际加载的那个目录（`resolvePluginFolderInfo` 会优先问它）——
     * 那才是用户真正在跑的代码，也才是「装了什么」的正确答案。
     *
     * @returns 校正过的条目名（供调用方提示），以及发现重复 id 的条目名
     */
    async reconcileInstalledVersions(items?: TrackedItem[]): Promise<{
        corrected: string[];
        duplicated: Array<{ name: string; count: number }>;
    }> {
        const settings = this.settings;
        const targets = items ?? settings.installer.tracked;
        const corrected: string[] = [];
        const duplicated: Array<{ name: string; count: number }> = [];
        let dirty = false;

        for (const item of targets) {
            const record = settings.installer.tracked.find(
                (candidate) => candidate.kind === item.kind && candidate.id === item.id
            );
            if (!record) continue;

            const actual = await this.installedVersionOnDisk(record, duplicated);
            // `undefined` = **读不到**（目录在，但 manifest 读不出来/不合法）：
            // 这时保持记录不动。曾经在这里一律写成空字符串，后果是「本地版本未知」
            // 与「远端有版本」被拿去比较 —— `isNewerVersion` 退化成「字符串不同」，
            // 于是**永远报可更新**，而点更新又装不出新版本号（死循环，实测踩过）。
            if (actual === undefined) continue;

            if (record.installedVersion !== actual) {
                logger.info(
                    `${record.id}: recorded version ${record.installedVersion || "(none)"} ` +
                        `does not match the installed files (${actual || "missing"}) — correcting`
                );
                record.installedVersion = actual;
                corrected.push(record.name);
                dirty = true;
            }
        }

        if (dirty) await this.deps.saveSettings();
        return { corrected, duplicated };
    }

    // ── 疑似镜像的确认 ────────────────────────────────────────────────────

    /**
     * 记下一条「疑似镜像」提议（**不采用**）。
     *
     * 界面据此在列表里把地址列出来请用户确认。不在这里清理：提议的出口只有三条 ——
     * 用户确认（`confirmMirror`）、用户忽略（`dismissMirrorSuggestion`）、条目被移除
     * （`unbind`）；此外 `normalizeSettings` 在读取时还会剪掉「坏值」与「与当前来源
     * 相同」的条目（见 `sanitizeMirrorSuggestions`）。
     */
    private rememberMirrorSuggestion(
        kind: TrackedKind,
        id: string,
        suggestion: RepoRef | undefined
    ): void {
        if (!suggestion) return;
        const current = this.settings.installer.tracked.find(
            (item) => item.kind === kind && item.id === id
        );
        // 已经在用这个地址了就没什么可确认的（也避免列表画出两行一样的地址）。
        if (current && isSameRepo(itemRepoRef(current), suggestion)) return;
        this.settings.installer.mirrorSuggestions[availableUpdateKey({ kind, id })] = suggestion;
    }

    /**
     * **用户确认**：把这一项的来源改成这个疑似镜像。
     *
     * 这是镜像被采用的**唯一**入口。改写的是记录里的 `host/owner/repo`（下载与更新
     * 检查都读它），原来源挪进 `origin` 保留下来 —— 列表那两行地址就是从这里来的。
     *
     * 刻意**不顺手重新下载**：确认是「以后跟这个源走」的决定，不是一次安装动作；
     * 用户接着点「更新」就会从新源取文件（完成提示会写明来源）。
     */
    async confirmMirror(tracked: TrackedItem, mirror: RepoRef): Promise<void> {
        const settings = this.settings;
        const record = settings.installer.tracked.find(
            (item) => item.kind === tracked.kind && item.id === tracked.id
        );
        if (!record) return;

        const previous = itemRepoRef(record);
        // 同一个地址不重复确认（列表那两行会一模一样）。
        if (isSameRepo(previous, mirror)) return;

        record.host = mirror.host;
        record.owner = mirror.owner;
        record.repo = mirror.repo;
        // 源地址取**原来那条**；但记录里已经有 `origin` 时保留它 —— 那是真正的家。
        // 场景：记录已经挂在镜像 A 上（origin = GitHub），用户又确认了镜像 B ——
        // 这时若写成 `previous`（= A），GitHub 那一行就从列表里消失了，
        // 而用户正是来看「这个插件到底跟谁走」的。
        record.origin = record.origin ?? previous;
        // 通道是上一个源的事实（相对路径、版本列表都按它取过），换了源就不成立：
        // 删掉，等下一次更新重新确定。留着会让列表那句「来源：仓库源码文件」指错。
        delete (record as { channel?: InstallChannel }).channel;

        // 换了源，之前按旧源查出来的「可更新」也就作废了。
        delete settings.installer.availableUpdates[availableUpdateKey(record)];
        delete settings.installer.mirrorSuggestions[availableUpdateKey(record)];

        await this.deps.saveSettings();
    }

    /**
     * 读「这一项现在实际装的是什么版本」。
     *
     * - 返回 `""`：**确实没装**（解析出来的目录不存在）—— 记成空版本，更新检查会
     *   给出「可更新」，用户点一下就能装回来。
     * - 返回 `undefined`：**读不到**（目录在，manifest 缺了/不合法/缺 version）——
     *   调用方必须保持记录不动，否则会造出「永远可更新」的死循环。
     */
    private async installedVersionOnDisk(
        record: TrackedItem,
        duplicated: Array<{ name: string; count: number }>
    ): Promise<string | undefined> {
        const exists = async (folder: string): Promise<boolean> => {
            try {
                return await this.app.vault.adapter.exists(folder);
            } catch {
                return false;
            }
        };

        if (record.kind === "theme") {
            const folder = await resolveThemeFolder(this.app, record.id);
            if (!(await exists(folder))) return "";
            // 主题要用**主题的**解析器（它没有 `id`）—— 用错正是那个 bug 的来路。
            return readThemeManifestVersion(this.app, record.id);
        }

        const lookup = await resolvePluginFolderInfo(this.app, record.id);
        if (lookup.duplicates.length > 0) {
            // count 含正在使用的那一份 —— 提示语说的是「有几个目录抢这个 id」
            duplicated.push({ name: record.name, count: lookup.duplicates.length + 1 });
            logger.warn(
                `${record.id} is declared by several plugin folders ` +
                    `(using ${lookup.folder}): ${lookup.duplicates.join(", ")}`
            );
        }
        if (!(await exists(lookup.folder))) return "";
        return (await readManifestInFolder(this.app, lookup.folder))?.version;
    }

    /**
     * **用户忽略**：丢掉这条提议，别再提（记录本身不动）。 */
    async dismissMirrorSuggestion(tracked: TrackedItem): Promise<void> {
        delete this.settings.installer.mirrorSuggestions[availableUpdateKey(tracked)];
        await this.deps.saveSettings();
    }

    /**
     * 手动把一个已跟踪插件的下载来源改成指定仓库（镜像）。
     *
     * ## 为什么需要「手填」这条路
     *
     * 自动探测只能猜两个候选：**同名仓库**，以及**你 Gitee 账号名下的同名仓库** ——
     * 而第二个候选要先调 `GET /v5/user` 解析账号名，**那需要 Gitee 令牌**。
     * 镜像挂在第三个地方（作者自己的 Gitee 账号，名字与 GitHub 不同名、
     * 与你的账号也不同名）时，自动探测**永远找不到** —— 实测：Trefoil 的镜像是
     * `gitee.com/sofqi/Trefoil`，而它的 GitHub owner 是 `Dyse-Sofqi`（Gitee 上没这个
     * owner），用户没填 Gitee 令牌时两个候选都不成立，于是他既看不到镜像、
     * 也没有任何别的入口能把它指出来。
     *
     * ## 校验用 manifest 的 `id`（与自动探测同一条判据）
     *
     * 只比仓库名会装错东西：同名不同项目在 Gitee 上很常见，而插件是能读写整个库的
     * 代码。id 不一致直接拒绝 —— 这里不做「差不多就行」的妥协。
     *
     * 确认之后走 `confirmMirror`：记录的主来源换成它、原来源挪进 `origin` 保留，
     * 此后下载、更新检查、重装都按新来源走（列表上两行地址都还看得见）。
     *
     * @returns 实际采用的地址（供调用方提示）。
     */
    async setMirror(tracked: TrackedPlugin, repoInput: string): Promise<RepoRef> {
        // 简写默认按 Gitee 解析 —— 这个功能的语义就是「换到 Gitee 镜像」；
        // 想指向别的平台就直接粘贴完整链接（`parseRepoRef` 认 URL）。
        const ref = parseRepoRef(repoInput, "gitee");
        const repoLabel = formatRepoId(ref);

        const raw = await getHost(ref.host).readFile(ref, MANIFEST_FILE, {
            token: this.tokenFor(ref.host),
            ref: "HEAD",
        });
        if (raw === undefined) {
            throw new InstallerError({ kind: "missingManifest", repo: repoLabel, of: "plugin" });
        }

        const manifest = parsePluginManifest(raw, repoLabel);
        if (manifest.id !== tracked.id) {
            throw new InstallerError({
                kind: "mirrorIdMismatch",
                repo: repoLabel,
                expected: tracked.id,
                found: manifest.id,
            });
        }

        await this.confirmMirror(tracked, ref);
        return ref;
    }

    /**
     * 探测一个已跟踪插件**可能**的 Gitee 镜像（只提议，不采用）。
     *
     * 抽出来给界面用（版本管理弹窗）：那里要先把候选摆出来，用户点了才采用 ——
     * 与列表里那条「疑似镜像 · 尚未使用，待确认」是同一套判据、同一个出口。
     * 已经在走镜像的条目（host 不是 GitHub）没什么可提议的，返回 undefined。
     */
    async probeMirror(tracked: TrackedPlugin): Promise<RepoRef | undefined> {
        const ref = itemRepoRef(tracked);
        if (ref.host !== "github") return undefined;
        if (!this.settings.installer.discoverGiteeMirrors) return undefined;

        try {
            const resolved = await this.resolveRepo(formatRepoId(ref), {
                defaultHost: ref.host,
                allowMirror: true,
            });
            return resolved.mirror;
        } catch (err) {
            // 锦上添花：探不到不影响别的功能。
            logger.debug(`mirror probe failed for ${formatRepoId(ref)}`, err);
            return undefined;
        }
    }

    // ── 记录 ──────────────────────────────────────────────────────────────

    /** 把一次成功安装/更新的结果写进跟踪列表。两种 kind 共用。 */
    private async recordItem(input: {
        kind: TrackedKind;
        repoRef: RepoRef;
        /** 走了镜像时的源地址；见 `InstallRequest.origin`。 */
        origin?: RepoRef;
        id: string;
        name: string;
        version: string;
        channel: InstallChannel;
        /** 只对插件有意义（主题没有版本钉选）。 */
        requestedVersion?: string;
    }): Promise<void> {
        const settings = this.settings;
        const tracked = settings.installer.tracked;

        const existingIndex = tracked.findIndex(
            (item) => item.kind === input.kind && item.id === input.id
        );
        const previous = existingIndex >= 0 ? tracked[existingIndex] : undefined;

        // 源地址要**继承**，不能只取这一次的值：更新路径上（「更新到最新」、
        // 「更新全部」、重装）传进来的 `repo` 是记录里那个地址 —— 它已经是镜像了，
        // 镜像发现不会再跑（`shouldLookForMirror` 要求 `ref.host === "github"`），
        // 于是这次调用手里没有源地址。不继承的话，用户更新一次插件，
        // 列表里的 GitHub 那一行就凭空消失 —— 而他什么都没做。
        //
        // 但**只在来源没变时**继承。身份是 `(kind, id)`，所以「同一个插件换个
        // 仓库装」会落在同一条记录上（上游 ↔ 自己的 fork 之间切换，真会发生）——
        // 而 `origin` 说的是**上一个**仓库的地址，继承下来列表就会显示一个早就
        // 不是它来源的地址，偏偏用户正是来看「它到底跟谁走」的。
        //
        // 与 `frozen` 的继承正好形成对照：冻结是**这个已安装的东西**的属性，
        // 换个仓库装它仍然成立；`origin` 是关于**仓库**的，仓库换了就不成立。
        const previousRef = previous ? itemRepoRef(previous) : undefined;
        const inheritedOrigin =
            previousRef && isSameRepo(input.repoRef, previousRef) ? previous!.origin : undefined;
        const origin = input.origin ?? inheritedOrigin;

        const common = {
            host: input.repoRef.host,
            owner: input.repoRef.owner,
            repo: input.repoRef.repo,
            // 与主来源相同就不记（列表会画出两行同一个地址）。写入侧兜一道，
            // 读取侧 `sanitizeOrigin` 再兜一道 —— data.json 是可以手改的。
            origin: origin && !isSameRepo(origin, input.repoRef) ? origin : undefined,
            id: input.id,
            name: input.name,
            installedVersion: input.version,
            // 更新时保留用户之前设的冻结状态。
            frozen: previous?.frozen ?? false,
            channel: input.channel,
            installedAt: Date.now(),
        };

        const record: TrackedItem =
            input.kind === "plugin"
                ? {
                      ...common,
                      kind: "plugin",
                      requestedVersion: input.requestedVersion ?? "latest",
                  }
                : { ...common, kind: "theme" };

        if (existingIndex >= 0) {
            tracked[existingIndex] = record;
        } else {
            tracked.push(record);
        }

        // 装上了新版本，旧的可更新徽标就该消失 —— 否则列表永远挂着过期提示。
        delete settings.installer.availableUpdates[availableUpdateKey(record)];

        await this.deps.saveSettings();
    }

    /** 切换冻结状态。 */
    async setFrozen(tracked: TrackedItem, frozen: boolean): Promise<void> {
        const record = this.settings.installer.tracked.find(
            (item) => item.kind === tracked.kind && item.id === tracked.id
        );
        if (!record) return;
        record.frozen = frozen;
        await this.deps.saveSettings();
    }

    /**
     * 把检查结果写进 `installer.availableUpdates` 并落盘。
     *
     * 有更新 → 记入（列表据此渲染常驻徽标，Notice 一闪就错过）；
     * 无更新 → 清除旧记录；检查失败 → **不动**旧记录（过期信息好过没有）。
     *
     * 顺带刷新 `lastUpdateCheckAt`：即使这一轮全部失败也算「检查过了」——
     * 否则限流期间每次打开设置页都会再打一遍 API，情况只会更糟。
     */
    async recordUpdateChecks(results: UpdateCheckResult[]): Promise<void> {
        if (results.length === 0) return;
        const settings = this.settings;
        settings.installer.lastUpdateCheckAt = Date.now();
        const store = settings.installer.availableUpdates;

        for (const result of results) {
            if (result.error !== undefined) continue;
            const key = availableUpdateKey(result.tracked);
            if (result.hasUpdate) {
                store[key] = { latestVersion: result.latestVersion, checkedAt: Date.now() };
            } else {
                delete store[key];
            }
        }

        await this.deps.saveSettings();
    }

    /**
     * 把自身更新检查的结果写进 `installer.selfUpdateAvailable` 并落盘。
     *
     * 与 `recordUpdateChecks` 同一套取舍：
     *
     * - **有更新** → 记下版本号（「插件安装器」标签上的数字徽标与那一行的状态文字
     *   都读它，见 `InstallerSettings.selfUpdateAvailable`）；
     * - **无更新** → 清掉旧记录（那个版本已经装上了 / 远端撤了）；
     * - **检查失败** → 不动旧记录（过期信息好过没有 —— 与那里一字不差）。
     *
     * 顺带刷新 `lastUpdateCheckAt`：**即使这次失败也算「检查过了」**。这一条在这里
     * 比在 `recordUpdateChecks` 更要紧 —— 那边只在 `results.length > 0` 时才写，
     * 而一个跟踪项都没有的用户走不到那条路；不在这里写的话，他每次打开设置页都会
     * 重新打一遍 Gitee 的接口。
     */
    async recordSelfUpdateCheck(result: SelfUpdateCheck): Promise<void> {
        const settings = this.settings;
        settings.installer.lastUpdateCheckAt = Date.now();

        if (result.error === undefined) {
            settings.installer.selfUpdateAvailable = result.hasUpdate ? result.latestVersion : "";
        }

        await this.deps.saveSettings();
    }
}
