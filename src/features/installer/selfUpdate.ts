import type { LocaleStrings } from "../../core/i18n";
import { logger } from "../../core/logger";
import type { ObsyncSettings } from "../../core/settings";
import { isSameRepo, repoWebUrl, tryParseRepoRef } from "../../host/repoRef";
import type { RepoRef } from "../../host/types";
import type { SelfUpdateCheck } from "./types";

/**
 * SyncHub 自身的更新：检查、写盘、以及「待重启」这件事的记账。
 *
 * ## 为什么不把它自己塞进跟踪列表
 *
 * 跟踪列表是「用户装了什么」的清单，每一项旁边都挂着「冻结 / 取消绑定」这类操作 ——
 * 对自己没有意义；而绑定弹窗也刻意跳过自己（见 `existingPlugins.ts` 的
 * `SELF_PLUGIN_ID`）。所以自己走设置页里单独的一节：当前版本 + 检查更新 + 更新。
 *
 * ## 更新只写文件，**不重载自己**（这块的核心取舍）
 *
 * 别的插件更新完是 disable → enable 重载；对自己这么干是**先卸载正在执行这段
 * 更新代码的实例**，剩下半段靠闭包才活着。它能成，但那是靠副作用成功 ——
 * 中途任一步失败就停在「已禁用」，而来得及提示你的代码已经不在了。
 *
 * 所以这里写盘后只做一件事：把版本号记进设置（`pendingRestartVersion`）。
 * 用户重启 Obsidian 后加载的就是新代码；在那之前，设置页那一行会一直显示
 * 「已下载 x，重启后生效」——**不能默默把徽标清掉**，否则用户以为已经在用新版本了，
 * 实际跑的还是旧的。
 *
 * 标记在**每次加载时清空**：加载成功即代表跑的就是磁盘上那份（见 `clearPendingRestart`）。
 */

/**
 * SyncHub 自己的**官方**仓库坐标（GitHub）。
 *
 * 写死在代码里，不从 manifest / authorUrl 推导 —— manifest 没有 repo 字段，
 * 而 `authorUrl` 是作者主页。也正因如此，`updateSelf` 在写盘前必须校验远端
 * manifest 的 id 是不是 `ob-sync`：这个常量万一指错了地方，拦住远比
 * 按错的 id 去解析目录、覆盖掉别的插件强。
 *
 * **它不再是默认来源**（2026-10-01）：默认走下面的 Gitee 镜像，这里是设置页那个
 * 开关**关掉时**用的地址。
 */
export const SELF_REPO: RepoRef = {
    host: "github",
    owner: "Dyse-Sofqi",
    repo: "SyncHub",
};

/**
 * 指定的 **Gitee 镜像** —— 自身更新的默认来源（2026-10-01）。
 *
 * ## 为什么默认换成它
 *
 * `github.com` 在目标用户的网络里是**时段性阻断**的（见下面 `resolveSelfRepo`
 * 的说明与 README）：默认走官方，意味着「检查更新」这个动作本身经常失败，
 * 而失败的样子是「一直报错 / 一直转圈」，用户只能自己去翻设置页才知道有个开关
 * 可以关。把默认换成镜像之后，开箱即用的那条路是通的。
 *
 * ## 它不是「镜像发现」那套
 *
 * 那套是自动探测 + 只提议 + 要确认（给用户装的插件用）；这里是**固定的默认来源**。
 * 两者互不影响：`discoverGiteeMirrors` 关着也照样从这里更新自己。
 */
export const SELF_MIRROR: RepoRef = {
    host: "gitee",
    owner: "sofqi",
    repo: "SyncHub",
};

/**
 * 这次该从哪个仓库更新自己。
 *
 * `useGitee` 是设置页那个开关（`settings.installer.selfUpdateUseGitee`）：
 * 开 → `SELF_MIRROR`（Gitee 镜像），关 → `SELF_REPO`（官方仓库）。
 *
 * ## 为什么还留一个函数，而不是让调用方直接 `useGitee ? A : B`
 *
 * 因为「哪个开关对应哪个地址」是这一节的**唯一事实**，而它有两个调用方
 * （检查与更新，都经 `InstallerService.selfRepo()`）。散在各处写三元，迟早
 * 有一处写反 —— 那正是「检查说没有更新、更新却从另一个仓库拉」的来源。
 * 顺带也让「镜像地址是什么」只在这一处出现。
 *
 * 与「镜像发现」的区别很重要：那套是**自动探测 + 只提议、要用户确认**，每次都要
 * 探一次；这里是用户**选定的固定来源**，选一次就一直用它 —— 所以它不需要探测，
 * 也不该被 `discoverGiteeMirrors` 那个开关影响。
 */
export function resolveSelfRepo(useGitee: boolean): RepoRef {
    return useGitee ? SELF_MIRROR : SELF_REPO;
}

/**
 * 老 `selfUpdateSource` 字符串（v8 及以前）折算成「是否用 Gitee 镜像」。
 *
 * 只在 `normalizeSettings` 的 v8 → v9 迁移里用一次，但折算规则必须与**当年那套
 * 解析**保持一致，否则老用户的来源会在升级时悄悄换掉：
 *
 * - **空串 / 全空白 → `true`**：当年空串表示「用默认」，而默认就是镜像；
 * - **能解析出 host 的 → `host === "gitee"`**：`owner/repo` 简写当年按 GitHub
 *   解释（`parseRepoRef(trimmed, "github")`），所以这里也用同一个默认平台 ——
 *   一个填 `sofqi/SyncHub` 的用户当年走的是 GitHub 上的同名仓库，现在仍是 GitHub；
 * - **解析不出来（自定义地址 / 手改坏）→ `true`**：退回默认。当年这种值会让更新
 *   直接抛错，而新模型没有地方放它 —— 选默认（镜像，可直连）比选官方更可能成功。
 */
export function selfUpdateUsesGitee(raw: unknown): boolean {
    if (typeof raw !== "string") return true;

    const trimmed = raw.trim();
    if (trimmed.length === 0) return true;

    return tryParseRepoRef(trimmed, "github")?.host !== "github";
}

/**
 * 我们自己的插件 id —— 必须与 `manifest.json` 的 `id` 一致。
 *
 * 两个用途：绑定列表跳过自己（`existingPlugins.ts`），
 * 以及自我更新时校验远端身份（不是这个 id 就不写盘）。
 *
 * ## id 的来历（**别再改它了**）
 *
 * 1. `obsync` → `ob-sync`（0.1.4）：插件市场里 `obsync` **已被别的插件占用**，
 *    id 撞车的插件无法上架。
 * 2. 0.1.5 曾改成 `synchub`（想与显示名 SyncHub 统一），**0.1.6 又回退了** ——
 *    社区审核报 *The plugin ID in (manifest.json) does not match the existing
 *    plugin ID* ：审核系统在 0.1.4 那次提交时就把本插件登记为 `ob-sync`，
 *    **id 是与既有登记绑定的，不是想改就能改**。
 *
 * 所以：**id 就定在 `ob-sync`**。它与显示名 `SyncHub` 不一致是**有意的** ——
 * 审核登记决定了 id，商标规则决定了显示名，两者各有各的来源，不必也不该统一。
 *
 * 它与那些 `obsync-` 前缀的内部标识（CSS 类名、`obsync-sync-view` 视图类型、
 * `obsync-token-` 密钥 id）同样刻意不一致：后者是各自的命名空间，不是插件身份，
 * 跟着改只会白白作废用户已存的令牌与视图状态。换句话说，看到 `obsync-` 不必跟着改
 * —— 只有这一个常量跟着 manifest 走。
 */
export const SELF_PLUGIN_ID = "ob-sync";

/**
 * 自身更新的**尝试顺序**：选定的来源 → 官方仓库（2026-10-01）。
 *
 * ## 为什么要有回退
 *
 * 默认来源是 Gitee 镜像（国内可直连），但镜像会挂、会被匿名配额限流、也可能
 * 落后到根本没有那次 release。没有回退时这些情况就是一条死路 —— 而官方仓库
 * 还能用，用户却得自己发现并跑去改设置页。
 *
 * ## 为什么不静默回退
 *
 * 回退必须**说出来**（提示文案见 `installer.selfSourceFallback`）：用户以为在走镜像、
 * 实际是从官方拉的，正是这个模块一直避免的「来源不明」。所以调用方每回退一次
 * 就提示一次，并且提示里带上失败的那个地址。
 *
 * 配的那个来源**本来就是官方**时只有一次尝试 —— 回退到自己没有意义，还会白打一遍请求。
 */
export function selfRepoAttempts(configured: RepoRef): RepoRef[] {
    if (isSameRepo(configured, SELF_REPO)) return [SELF_REPO];
    return [configured, SELF_REPO];
}

/**
 * 提示文案里怎么称呼一个来源：`gitee.com/sofqi/SyncHub`。
 *
 * 去掉 scheme 是为了在提示条里读起来像「一个地址」而不是「一个链接」
 * （提示条里的文字不可点，写成 `https://…` 反而像漏了样式）。
 */
export function selfSourceLabel(ref: RepoRef): string {
    return repoWebUrl(ref).replace(/^https?:\/\//, "");
}

/** 上次会话下载了新版本但还没重启时，记录的是哪个版本（空串 = 没有）。 */
export function readPendingRestart(settings: ObsyncSettings): string {
    return settings.installer.pendingRestartVersion;
}

/** 记下「磁盘上的新版本已就位、等重启」。 */
export function setPendingRestart(settings: ObsyncSettings, version: string): void {
    settings.installer.pendingRestartVersion = version;
}

/**
 * 加载时清掉待重启标记。
 *
 * 每次加载都该清：这次加载跑的就是磁盘上的那份（写盘失败会回滚，不会留下
 * 「磁盘新、运行旧」而标记没设上的组合）。反过来，不清的话设置页会一直挂着
 * 「待重启」——用户重启了却发现提示还在，那才是真的说不清。
 *
 * @returns 是否真的清掉了（调用方据此决定要不要落盘）。
 */
export function clearPendingRestart(settings: ObsyncSettings): boolean {
    const pending = settings.installer.pendingRestartVersion;
    if (!pending) return false;

    logger.info(`SyncHub ${pending} is running now; clearing the pending-restart flag`);
    settings.installer.pendingRestartVersion = "";
    return true;
}

/** 设置页那一行状态该显示什么。 */
export interface SelfStateInput {
    /** 运行中的版本。 */
    currentVersion: string;
    /** 最近一次检查的结果（没查过时为 undefined）。 */
    check?: SelfUpdateCheck;
    /** 待重启的版本（`readPendingRestart`）。 */
    pendingRestartVersion: string;
    /** 正在做什么 —— 忙碌时状态行要让位给进度提示。 */
    busy?: "checking" | "updating";
}

/**
 * 把上面那些状态拼成一行给用户看的话。
 *
 * 抽成纯函数是为了能单测：真正渲染的那一段依赖 Obsidian 的设置页 DOM，
 * 在 node 环境里测不了（与 `shouldCheckOnSettingsOpen` 同一个理由）。
 *
 * 优先级：忙碌 > 待重启 > 未检查 > 出错 > 有更新 > 已是最新。
 * 「待重启」压在检查结果之上是刻意的：它讲的是**现在跑的**不是最新的那份，
 * 远端有没有更新的都要等重启之后再说。
 *
 * ## 回退过的来源要**跟在后面**（2026-10-01）
 *
 * 提示条几秒就没了，而「这次是从哪儿查的」是用户判断这条结论可不可信的依据 ——
 * 所以它拼在状态行末尾，无论这一行是「有更新」「已是最新」还是「出错」。
 * 只拼一次，且不改上面那套优先级。
 */
export function describeSelfState(input: SelfStateInput, t: LocaleStrings): string {
    return withFallbackNote(baseSelfState(input, t), input.check, t);
}

/** 状态行的主体（不含「回退过」那条附注）。 */
function baseSelfState(input: SelfStateInput, t: LocaleStrings): string {
    if (input.busy === "checking") return t.installer.checking;
    if (input.busy === "updating") return t.installer.selfUpdating;

    if (input.pendingRestartVersion) {
        return t.installer.selfPendingRestart(input.pendingRestartVersion);
    }
    if (!input.check) return t.installer.selfNotChecked(input.currentVersion);
    if (input.check.error !== undefined) {
        return t.installer.selfCheckFailed(input.check.error);
    }
    if (input.check.hasUpdate) {
        return t.installer.selfUpdateAvailable(
            input.currentVersion,
            input.check.latestVersion
        );
    }
    return t.installer.selfUpToDate(input.currentVersion);
}

/** 把「回退过」附在状态行末尾（没有回退过时原样返回）。 */
function withFallbackNote(
    message: string,
    check: SelfUpdateCheck | undefined,
    t: LocaleStrings
): string {
    if (!check?.fellBackFrom) return message;
    return `${message} ${t.installer.selfCheckFellBack(check.fellBackFrom)}`;
}
