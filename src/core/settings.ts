import { isSameRepo } from "../host/repoRef";
import { SUPPORTED_HOSTS, type HostKind, type RepoRef } from "../host/types";
import {
    TRACKED_KINDS,
    itemRepoRef,
    type InstallChannel,
    type TrackedItem,
    type TrackedKind,
} from "../features/installer/types";
import { normalizeFolders } from "../features/images/imageScan";
import { selfUpdateUsesGitee } from "../features/installer/selfUpdate";
import { isValidPluginId } from "./pluginId";
import { isValidThemeName } from "./themeName";

/**
 * 插件设置。
 *
 * 与参考项目 obsidian-git 的做法一致：**敏感项不进这里**。
 * 访问令牌存在 `core/secretStore`（SecretStorage 或 localStorage），
 * 这样 `data.json` 可以安全地随仓库同步到多设备而令牌不跟着走。
 */

export const SETTINGS_VERSION = 10;

export interface InstallerSettings {
    /**
     * 启动后是否自动检查已跟踪插件的更新。**默认关闭**（v2 起）——
     * 由「进入设置页时自动检查」承接，后者时机更准（用户正在看列表）。
     *
     * ## 它曾经上面还有一个「启用插件安装器」总开关（2026-10-06 删掉）
     *
     * 那个 `enabled` 只被两个地方读：本字段与下面 `autoCheckOnSettingsOpen`
     * 的**前置条件**。也就是说 `enabled = false` 与「把这两个检查开关都关掉」
     * 完全等价 —— 同一个 off 的第二种说法（与 v7 消掉 `autoCommitMinutes === 0`、
     * v8 消掉图片周期里的 `0 = 关闭` 同一个方向）。而它的名字比职责大得多：
     * 功能区图标、命令面板里的安装命令、设置页的按钮**从来不看它**，
     * 关掉之后「不装了」是错觉。迁移见 `migrateV9ToV10`。
     */
    autoCheckOnStartup: boolean;
    /** 启动检查的延迟秒数 —— 避开 Obsidian 自身的启动流程。 */
    autoCheckDelaySeconds: number;
    /** 打开 SyncHub 设置页时自动检查更新。默认开启。 */
    autoCheckOnSettingsOpen: boolean;
    /** 安装 GitHub 插件时是否优先探测 Gitee 镜像。 */
    discoverGiteeMirrors: boolean;
    /**
     * 上次成功跑完一轮更新检查的时间戳（毫秒）。
     *
     * 给「进入设置页自动检查」做节流：设置页的重绘很频繁，
     * 没有它会在反复开合设置页时把 API 配额打光（Gitee 匿名配额尤其紧张）。
     */
    lastUpdateCheckAt: number;
    /**
     * 上次把 SyncHub 自己更新到了哪个版本、但还没重启（空串 = 没有待重启的更新）。
     *
     * SyncHub **不重载自己**：对普通插件是 disable → enable，对自己则是先卸载正在
     * 执行这段代码的实例（剩下半段靠闭包才活着）—— 能成也是靠副作用成功，
     * 失败就停在「已禁用」。所以更新只写文件，由用户重启完成剩下的事，
     * 而这段时间磁盘上的版本比运行中的代码新，这个字段就是唯一的凭据：
     * 设置页据此常驻提示，**每次加载时清空**（加载成功即代表跑的就是磁盘那份）。
     *
     * 用字符串而不是 `{ version, at }` 对象：`mergeWithDefaults` 对「默认值为
     * undefined 的对象字段」无法透传（类型对不上就回落默认值），而这里并不需要
     * 时间戳 —— 加载即清除，没有过期判断要做。
     */
    pendingRestartVersion: string;
    /**
     * 最近一次检查发现的 **SyncHub 自身可用更新**的版本号（空串 = 没有）。
     *
     * ## 为什么持久化，而不是只留在设置页的内存里
     *
     * 两个地方要读它，而它们都可能发生在**这一轮没查过**的时候：
     *
     * 1. 「插件安装器」标签上那个数字徽标（`renderInstallerBadge`）—— 标签栏是在
     *    页面内容**之前**画的，而检查是异步的，只放内存的话徽标永远慢一拍；
     * 2. 自身更新那一行的状态文字 —— 用户没点过「检查更新」时也该看得到上次的结论。
     *
     * 与 `availableUpdates` 同一条理由（那里写着「持久化而不是只存内存」）：
     * 重启之后徽标还在，不必等用户先手动点一次才出现 —— 而徽标的意义正是
     * 「不用点也知道」。
     *
     * 用字符串而不是对象：与 `pendingRestartVersion` 同一个取舍（`mergeWithDefaults`
     * 对「默认值为 undefined 的对象字段」透传不了），而这里也确实只需要版本号。
     *
     * **清除时机**：检查报「无更新」时清掉；`updateSelf` 成功后也清掉（那个版本已经
     * 落盘了，再挂着「有可用更新」就是假话）。
     */
    selfUpdateAvailable: string;
    /**
     * **自身更新是否走 Gitee 镜像**（默认 `true`）。
     *
     * 开（默认）→ `gitee.com/sofqi/SyncHub`；关 → 官方仓库
     * `github.com/Dyse-Sofqi/SyncHub`。两个地址写死在 `selfUpdate.ts`
     * （`SELF_MIRROR` / `SELF_REPO`），由 `resolveSelfRepo(useGitee)` 二选一。
     *
     * ## 为什么默认走镜像
     *
     * `github.com` 在目标用户的网络里是**时段性阻断**的，而 Gitee 镜像能直连。
     * 默认走官方的话，「检查更新」这个动作本身就经常失败，而失败的样子只是
     * 「一直报错」—— 用户得自己去翻设置页才知道有个来源可以换。
     *
     * ## 为什么从「填地址」改成开关（2026-10-06 用户要求）
     *
     * 用户的原话是「插件的自更新来源用开关的形式选择」。原先是一个自由文本
     * `selfUpdateSource`，而它要用户先读懂一串规则才敢动：空串算用默认、
     * `owner/repo` 简写按 GitHub 解释、非法地址会抛错。两个固定地址之间切换
     * 本来就是二选一，做成开关就不需要那些规则了。
     *
     * 代价说清楚：**不再支持自定义来源**（例如从自己的 fork 更新）。那个场景
     * 本来也不成立 —— 写盘前校验远端 manifest 的 `id` 必须是 `ob-sync`，
     * fork 之后 id 通常也改了，填进去只会被拒。
     *
     * ## 镜像连不上会自动回退到官方仓库，并提示一次
     *
     * 见 `selfRepoAttempts`：Gitee 的匿名接口配额很低，没填令牌时被限流是常事，
     * 那条路不该是死路。回退**一定说出来** —— 悄悄换来源正是这个模块一直避免的。
     */
    selfUpdateUseGitee: boolean;
    /**
     * 已跟踪的插件与主题（同一个列表，靠 `kind` 判别）。
     *
     * 类型定义在 `features/installer/types.ts`（那里才是它的业务归属），
     * 这里是 type-only 引入 —— 设置模块负责的是「持久化什么形状」，
     * 不必也不该把业务类型复制一份。
     */
    tracked: TrackedItem[];
    /**
     * 最近一次更新检查发现的可更新项，键为 `availableUpdateKey()` 的结果
     * （`<kind>:<id>`，见那里的注释）。
     *
     * 持久化而不是只存内存：徽标要常驻在已跟踪列表里（Notice 一闪就错过），
     * 且启动时的自动检查也能写入。更新成功后由 recordInstalled 清除。
     */
    availableUpdates: Record<string, { latestVersion: string; checkedAt: number }>;
    /**
     * **待用户确认**的疑似 Gitee 镜像（键同 `availableUpdates`：`<kind>:<id>`）。
     *
     * 镜像发现**从不自动采用**一个镜像：它只把「疑似镜像」记在这里，由用户在界面上
     * 确认（`InstallerService.confirmMirror`）之后才改写记录、把下载与更新检查切过去。
     *
     * 为什么值得多这一层：判据只是「两边 manifest 的 `id` 相同」，那只证明**是同一个
     * 插件**，不证明是同一份代码、同一个作者、同一个新鲜度 —— fork、或者别人用同一个
     * `id` 重新上传都能通过，而插件是能读写整个库的代码。地址又常常来自「猜 owner」，
     * 所以这一步必须由人拍板。
     */
    mirrorSuggestions: Record<string, RepoRef>;
}

export interface SyncSettings {
    /**
     * 「定时同步」的开关 —— 它**唯一**的作用就是让下面那条定时器跑或不跑。
     *
     * 由 `SyncModule` 的装配读走（注入 `Automatics`）。
     *
     * 2026-10-02 之前它叫「启用笔记同步」，而那个名字比职责大：命令面板里的
     * 同步命令从来不受它影响（那是用户当下主动发起的），它管的只有定时器。
     * 现在它就叫「定时同步」，与周期同处一行。
     *
     * 这一行是给下一个人的提醒：这个字段曾经**只被写、从没被读过** ——
     * 设置页有开关、`data.json` 里存着值、README 也列着它，但代码里没有
     * 任何一处读它，于是「关掉同步」之后自动提交照样每 N 分钟把笔记推到远端。
     * 加字段时顺手确认一下有没有读取方（`installer.autoCheckOnStartup` 是正例）。
     *
     * 边界：只管后台自动动作，不管命令面板里的显式命令（与
     * `installer.autoCheckOnStartup` 同一个边界 —— 那一份管的是「启动时自动检查」，
     * 手动入口始终可用）。
     */
    enabled: boolean;
    /**
     * 定时同步的周期（分钟）。到点执行的是**完整链路** `提交 → 拉取 → 推送`。
     *
     * ## 为什么只有一个数字（2026-10-02 由三个合成）
     *
     * 原先有三个：`autoCommitMinutes` / `autoPushMinutes` / `autoPullMinutes`。
     * 而主间隔跑到点执行的**本来就是完整链路**，另外两个只是在它之上额外加的
     * 单动作定时器 —— 在绝大多数配置下都是多余的，却要求用户先读懂
     * 「推送/拉取间隔设为 0 也会随主间隔一起发生」才敢动它们。
     *
     * 代价说清楚：**「只拉取」「只推送」这两种定时配置没有了**（手动按钮仍可用）。
     * 换掉它们换来的是「一个数字 = 整条同步」。
     *
     * ## 这里没有「0 = 关闭」
     *
     * 开与关只由 `enabled` 表达，这个数字纯是周期，`normalizeSettings` 把它钳在
     * 1–1440。留一个「0 = 关闭」在周期里，就是同一个 off 的第二种说法 ——
     * 那正是这次要消掉的东西。
     */
    intervalMinutes: number;
    commitMessage: string;
    /** 拉取整合策略：merge（默认）/ rebase / reset（本地以远端为准）。 */
    syncStrategy: "merge" | "rebase" | "reset";
    /** git 可执行文件路径。空表示用 PATH 里的 git。 */
    gitPath: string;
}

/**
 * 图片同步（Cloudflare R2）。
 *
 * ## 为什么类型定义在这里，而不是像 `TrackedItem` 那样放在功能模块里
 *
 * 惯例本来是「业务类型归 `features/`，这里只 type-only 引入」。这里反过来，
 * 有一个具体的理由：`scripts/checks.mjs` 的「设置项无人读取」只扫
 * `core/settings.ts` 里的接口声明。把这一组放到 `features/images/types.ts`，
 * 那二十来个字段就会**整体落进那个检查的盲区** —— 而它拦的正是
 * 「设置页能改、`data.json` 里存着、功能代码却从没读过」这种最坑的状态。
 * 保住这个检查比守住目录惯例重要。
 *
 * ## 密钥不在这里
 *
 * `secretAccessKey` 走 `core/secretStore`（键 `r2`），与平台令牌同一条路径。
 * `accessKeyId` 留在设置里：它是**标识**不是秘密（相当于用户名），
 * 放在 `data.json` 里方便多设备同步配置，而泄漏它单独没有用。
 */
export interface ImageSyncSettings {
    /**
     * 总开关。**由装配层读走**（`features/images/index.ts`），关掉后
     * 启动同步与定时同步都不跑，命令面板里的手动同步仍然可用
     * （与 `sync.enabled` 同一个边界：只管后台自动动作）。
     */
    enabled: boolean;
    /**
     * 受管的图片文件夹（vault 相对路径，一行一个；`.` 表示整个库）。
     *
     * 这是**唯一的边界**：只有落在这里的文件会被同步，也只有它们会被删除传播。
     * 默认 `["."]`（仓库根目录 = 整个库）—— 这个插件服务的场景就是「库本身是一个
     * git 仓库，图片要有云端副本」，而仓库文件夹是那个场景里最自然的范围：
     * 用户已经用 git 管着整个库，R2 这条链路没有理由只覆盖其中几个目录。
     * 想要更窄的范围（比如只同步 `attachments/`）改这一格即可，设置页上也有
     * 「恢复默认」一键回到这个值。
     */
    folders: string[];
    /**
     * R2 账号标识。允许三种写法（见 `normalizeEndpoint`）：
     * 纯账号 ID、一个主机名、或完整 URL。少让用户去查文档。
     */
    accountId: string;
    /** 桶名。 */
    bucket: string;
    /** R2 的 Access Key ID（相当于用户名，不是秘密）。 */
    accessKeyId: string;
    /** 云端对象键前缀（空 = 桶根）。改它不会让状态清单失效 —— 见 `syncState.ts`。 */
    prefix: string;
    /**
     * 公网访问地址（自定义域名或 r2.dev 域名）。留空则「复制云端链接」不可用。
     *
     * 不能拿存储端点顶替：那个端点每次读都要签名，粘到笔记里必然 403。
     * 所以这里**不猜**，留空就是明确地表示「还没配」。
     */
    publicBaseUrl: string;
    /** 两边都被改过时以哪边为准。`newer` 比时间戳，依赖两台设备的时钟。 */
    conflictPolicy: "newer" | "local" | "remote";
    /**
     * 在本机删掉一张受管图片时，**云端那份备份怎么处理**。
     *
     * 三档（2026-09-23 从开关 `askDeleteRemote` 改来）：
     *
     * - `ask`（默认）—— 弹一次窗问「要不要连云端一起删」；
     * - `always` —— 不问，直接连云端一起删；
     * - `never` —— 不问，云端永远不动。
     *
     * ## 为什么删除只剩这一条路
     *
     * 这里原本是两个开关（`deleteLocalWhenRemoteDeleted` /
     * `deleteRemoteWhenLocalDeleted`），对应「双向删除同步」。那套东西在
     * 2026-09-23 被去掉了：判断「一边少了文件 = 用户删的」本质上做不准
     * （清单丢失、两台设备各删一边都会错），而错的代价是删掉用户没打算删的东西。
     *
     * 现在 `run()` 只复制、不删除，删除一律由用户拍板 —— 而用户拍板的时机
     * 就是他删掉本地那张图的时候。
     *
     * ## `never` 的后果（写在这里，因为它反直觉）
     *
     * 选 `never` 时「删本地」完全不动云端，也不记墓碑 —— 于是下一轮同步会把
     * 那一份从云端**下载回来**。这是符合逻辑的（镜像嘛），但会让人以为删除
     * 没生效，所以设置页的描述里要写清楚。
     */
    deleteRemotePolicy: "ask" | "always" | "never";
    /**
     * 「按周期同步」的开关。**与 `autoSyncMinutes` 分开是两个字段，不是冗余**：
     * 周期里的数字**没有「0 = 关闭」的含义**，否则那个 0 既要表达「不按周期跑」
     * 又要表达「每 0 分钟」，而用户看到的就是一个不知道该填什么的空档。
     *
     * 2026-10-02 从「`autoSyncMinutes === 0` 即关闭」拆出来（v7 → v8）。拆的直接
     * 起因是用户问「最小值设成 5 是不是更合适」—— 而 0 一旦被禁，就得把默认周期
     * 改成非 0；`images.enabled` 默认又是 **true**，那等于让每个新用户开箱就
     * 「每 5 分钟跑一轮整库比对」。有了这个字段，默认周期可以是 10 而定时器仍然
     * 是关的。
     *
     * 注意它**不是**这一页的总开关：`enabled` 管的是「允不允许在背后动云端」
     * （启动那一轮、改名换键、删除处置），这个只管「要不要按周期跑」。
     */
    autoSyncEnabled: boolean;
    /**
     * 按周期的间隔（分钟），只在 `autoSyncEnabled` 为真时有意义。
     *
     * 范围 **5–1440**，默认 **30**（2026-10-06 由 10 改来）。下限 5 的理由与
     * `compressQuality` 的下限 10 同源：每 1 分钟跑一轮整库比对没有意义，
     * 而用户多半是手滑拖到底。
     *
     * ## 为什么默认从 10 改成 30
     *
     * 2026-10-06 加了「变动后自动同步」之后，这一条的**职责变了**：本机改动的
     * 那半边交给那一项（用户停手 30 秒就同步），它只剩「把别处的变化拉回来」
     * （另一台设备传的图、桶里被手工改动的对象）—— 而那种变化的时效要求低得多。
     * 详见 `docs/image-sync-design.md`。
     *
     * 改默认值**只影响新用户**：老用户的 `data.json` 里存着 10，`mergeWithDefaults`
     * 优先用存着的值（那是他们自己的设置，不该被默认值改写）。
     */
    autoSyncMinutes: number;
    /**
     * 库里新增 / 改动了受管图片之后，自动同步一次（默认**开**）。
     *
     * ## 它解决什么
     *
     * 在此之前，用户在库里**直接**动图（拖进来、用外部程序替换、在 Obsidian
     * 之外编辑）之后，云端要等到「下一轮周期」或「重启后的启动那一轮」才更新 ——
     * 而 `autoSyncEnabled` 默认是关的，所以实际要等到重启。
     *
     * ## 为什么默认开，而 `autoSyncEnabled` 默认关
     *
     * 两者不是一类东西：周期同步是「**每隔 N 分钟无条件跑一轮**」（用户没动任何
     * 东西它也会跑），而这一项是「**你真的动了图之后跑一次**」—— 代价与收益
     * 一一对应。而且 `enabled` 默认就是 `true`，它的理由（「配好之后还要求用户
     * 再找一个开关才生效，是多余的一步」）在这里同样成立。
     *
     * ## 触发形状：静默期攒批，不是「一有变动就跑」
     *
     * 攒批与「什么时候真的跑」全在 `ImageChangeQueue` 里（静默期 + 硬上限 +
     * 正在跑时不丢）。为什么必须攒：见那个文件的说明（一半是省请求，一半是
     * **不在用户还在写文件的时候去读它**）。
     */
    imageChangeSyncEnabled: boolean;
    /**
     * 上面那一项的**静默期**（秒）：这段时间内没有新的变动就同步一次。
     *
     * 范围 **5–600**，默认 30。上限 600 的理由：再长就与「按周期同步」那一轮
     * 重了，没有意义。下限 5：比这更密的话，一次编辑会话会被切成好几轮。
     *
     * 另有一个**硬上限**（`maxWaitForQuietMs`）：一直在动时也至少攒那么久就跑，
     * 否则「连续动几百张图」会让静默期永远不满足、永远不跑。
     */
    imageChangeDelaySeconds: number;
    /** 裁剪 / 压缩弹窗里的默认质量（10–100）。png 用不到，界面会灰掉它。 */
    compressQuality: number;
    /** 默认最长边（像素）。0 = 不缩放。**只缩不放**。 */
    compressMaxEdge: number;
    /** 默认输出格式。`keep` = 保持原扩展名（不是「不压缩」）。 */
    compressFormat: "keep" | "jpeg" | "webp" | "png";
}

export interface ObsyncSettings {
    version: number;
    /**
     * **没有「界面语言」这个设置**（2026-10-01 移除）。
     *
     * 它曾经是 `language: "auto" | "zh-cn" | "en"`，而三态里只有 `auto` 真正
     * 跟得上 Obsidian：选另外两个之后，用户把 Obsidian 切成别的语言，插件界面
     * 还是老语言 —— 看起来像坏了，而原因藏在设置页的一个下拉里。
     * 现在一律跟随 Obsidian（见 `core/i18n/index.ts` 的 `getTranslations`）。
     *
     * 老 `data.json` 里残留的 `language` 不需要迁移代码：`mergeWithDefaults`
     * 只保留**默认值里存在**的键，于是它自己就没了。版本号也因此不跳 ——
     * 没有要执行的迁移（下一次真正的迁移再从 7 开始）。
     */
    showNotices: boolean;
    debugLogging: boolean;
    /**
     * 同步条目是否贴靠状态栏最左侧（默认开）。
     *
     * ## 为什么默认开
     *
     * 默认与既有行为一致（条目一直是贴最左的）—— 加开关不该悄悄改变任何人的界面。
     *
     * ## 开与关各是什么
     *
     * 开：条目排在状态栏那一簇的**最左侧**（`order: -1` + `margin-right: auto`，
     * 见 `styles.css`）。它回答「现在同步到哪了」，不该藏在右下角。
     * 关：**不作任何特殊处理** —— 条目按 Obsidian 默认顺序排（追加在其他条目
     * 后面，落在那一簇的右端）。
     *
     * ## 与 2026-10-09 删掉的 `statusBarFullWidth` 是两件事
     *
     * 那个开关控制**把状态栏拉成全屏宽**（为了贴**屏幕**最左），代价是改变状态栏
     * 整体观感，已整条删除。这里只管**条目在状态栏里的顺序**，不碰状态栏本身的
     * 宽度 —— 关掉它状态栏也仍是 Obsidian 原样。
     */
    statusBarLeftAlign: boolean;
    /**
     * 功能区（左侧 ribbon）底部是否显示**圆形账号头像**（默认关）。
     *
     * ## 为什么默认关
     *
     * 这是一个**新增的视觉元素**，而且它要把用户的账号头像摆在界面上。
     * 加一个开关不该悄悄改变任何人的界面 —— 想要的人自己打开。
     *
     * ## 数据从哪来
     *
     * 平台各自的 `validateToken()` —— 头像地址与账号名在同一次响应里
     * （见 `TokenInfo.avatarUrl`）。**那个平台没配令牌就什么都不显示**：
     * 匿名问 `/user` 只会拿到 401（实测），而没有令牌也无从知道「是谁的头像」。
     *
     * 所以这个开关的实际效果是「有令牌时，把那个账号的头像挂到功能区底部」；
     * 设置页那一行的说明必须把这一点写出来，否则没配令牌的用户会以为开关坏了。
     *
     * **用哪个平台的头像由 `ribbonAvatarUseGitee` 决定**（2026-10-06 拆出来）。
     *
     * ## 为什么它值得进设置
     *
     * 头像本身不承载功能（点它没有任何动作），但它回答了插件别处回答不了的
     * 一个问题：**当前配的令牌是哪个账号**。镜像探测拿这个账号名当候选
     * （见 `installerService.mirrorOwnerCandidates`），出了偏差时用户以前只能去
     * 「测试」那个按钮的提示里翻。
     */
    ribbonAvatar: boolean;
    /**
     * 功能区（左侧 ribbon）底部那张圆形头像**用哪个平台**的（默认 `true` = Gitee）。
     *
     * 开（默认）→ Gitee；关 → GitHub。两个平台的头像地址都来自各自的
     * `validateToken()`（Gitee `GET /v5/user`、GitHub `GET /user`）——
     * 都是「拿令牌换账号资料」那一次调用，不多打接口。
     *
     * ## 为什么从「功能区展示用户头像」里拆出来（2026-10-06 用户要求）
     *
     * 用户的原话是「将功能区展示用户头像中gitee部分拆分出来单独设置一个设置项，
     * 默认开启，开启时使用gitee头像，关闭时使用GitHub头像」。原来那一行把两件事
     * 挤在一起说：**要不要显示头像**（那个开关）与**显示哪个账号的**（写死的 Gitee）。
     * 于是没配 Gitee 令牌、只用 GitHub 的用户，那一行对他来说等于「坏掉的开关」——
     * 而其实换个平台就有头像了。
     *
     * 默认 Gitee 是**沿用既有行为**（拆之前写死的正是它），不是新偏好。
     *
     * 它只在 `ribbonAvatar` 开着时有意义（设置页在总开关关着时把它置灰）。
     */
    ribbonAvatarUseGitee: boolean;
    installer: InstallerSettings;
    sync: SyncSettings;
    images: ImageSyncSettings;
}

export const DEFAULT_SETTINGS: ObsyncSettings = {
    version: SETTINGS_VERSION,
    showNotices: true,
    debugLogging: false,
    // 默认与既有行为一致（条目一直贴最左）—— 加开关不该悄悄改变任何人的界面。
    statusBarLeftAlign: true,
    // 默认**关**：这是新增的视觉元素，而且它展示的是用户的账号头像。
    // 理由与「不改变任何人的界面」同源，但方向相反 —— 这里是「不替用户加东西」。
    ribbonAvatar: false,
    // 默认 Gitee：拆之前写死的就是它 —— 拆出来是为了能换，不是为了改默认。
    ribbonAvatarUseGitee: true,
    installer: {
        // v2 起默认关闭：把「检查」放在用户真正在看列表的时刻（进入设置页），
        // 而不是每次启动都无条件打一遍各平台的 API。
        autoCheckOnStartup: false,
        autoCheckDelaySeconds: 60,
        autoCheckOnSettingsOpen: true,
        // 默认关闭。实测抽样 40 个社区插件，Gitee 上同 owner 同名的镜像命中 0 个 ——
        // 这个功能服务的是「用户知道某插件有镜像」的少数场景，不是普遍优化，
        // 而每次探测都要花掉 Gitee 稀缺的配额。详见 features/installer/mirrorFinder.ts。
        discoverGiteeMirrors: false,
        lastUpdateCheckAt: 0,
        pendingRestartVersion: "",
        // 还没查过 —— 空串表示「没有已知的可用更新」，不是「已是最新」。
        selfUpdateAvailable: "",
        // 默认走 Gitee 镜像（国内可直连）—— 见字段说明。
        selfUpdateUseGitee: true,
        tracked: [],
        availableUpdates: {},
        mirrorSuggestions: {},
    },
    sync: {
        // 默认**关**。定时同步会真的提交并推送到远端 —— 与图片那条
        // `autoSyncMinutes` 同一条理由：不该在用户没要求时自己跑起来。
        // 旧数据里存着的 `true` 由 v6 → v7 迁移按它当时的**实际行为**
        // 处理，见 `migrateV6ToV7`。
        enabled: false,
        // 拨开「定时同步」时的周期。10 分钟是「备份/同步一个笔记库」的常见粒度：
        // 比它密会让 git 一直在为半成品写提交，比它疏则会让人以为没生效。
        intervalMinutes: 10,
        // 提交信息模板。默认带上文件数（2026-10-02 用户要求），因为翻提交历史时
        // 「这一次动了多少」是第一个想知道的，而模板里不写就没有别的地方能看出来。
        //
        // 注意 **`{{numFiles}}` 只是个数字**，不区分单复数 —— 只动一个文件时这条
        // 默认值读作 `(1 files)`。要更准就自己在模板里写 `file(s)`，或者干脆删掉
        // 括号那段（`commitMessage.test.ts` 钉的是变量的展开，不管语法）。
        //
        // 改这个默认值**不会**动到已有用户的 `data.json`：`mergeWithDefaults` 里存着
        // 的值优先，所以老用户仍是旧模板（那是他们自己的设置，不该被默认值改写）。
        commitMessage: "vault backup: {{date}} ({{numFiles}} files)",
        // merge 是 git 的默认行为，对普通用户最不容易丢数据；
        // rebase/reset 交给明确知道自己要什么的用户。
        syncStrategy: "merge",
        gitPath: "",
    },
    images: {
        // 默认开着：没配好之前它什么也不做（`isConfigured()` 为假），
        // 而配好之后还要求用户再找一个开关才生效，是多余的一步。
        enabled: true,
        // 仓库根目录（= 整个库）。写成 `.` 而不是归一后的空串：这一份是给人看的
        // 默认值，`normalizeSettings` 会把它归一成 `[""]`（见 imageScan.ts）；
        // 设置页把空串那一项显示成「仓库根目录（整个库）」，不会显示成一个空行。
        // 曾经这里是 `[]`（一个都不预设），理由是「猜错的代价是动了不该动的文件」；
        // 但删除早已不是同步流程的一部分（删本地时会问一句），而默认空值意味着
        // 每个新用户都要先想清楚填什么才能用 —— 对「库即仓库」这个目标场景是白工。
        folders: ["."],
        accountId: "",
        bucket: "",
        accessKeyId: "",
        prefix: "",
        publicBaseUrl: "",
        // merge 是 git 的默认行为，这里的对应物是「谁新听谁的」：两边都被改过时
        // 它至少不会无条件用某一边覆盖另一边。
        conflictPolicy: "newer",
        // 默认问一句。删除是不可逆的（R2 没有回收站），而「不问」意味着用户的
        // 云端备份会在他毫无察觉的情况下一直留着 —— 或者更糟：某天发现它又
        // 回到本地了（见 ImageSyncSettings.deleteRemotePolicy 的说明）。
        deleteRemotePolicy: "ask",
        // 默认关闭：图片同步会真的读写文件与网络，不该在用户没要求时自己跑起来。
        // 周期另给一个默认值 30（下限 5）—— 上一个开关关着时它不起作用，
        // 而用户打开开关的那一刻就该看到一个合理的数字，而不是 0。
        //
        // 2026-10-06 由 10 改成 30：本机改动那半边交给下面 `imageChangeSyncEnabled`
        // 之后，这一条只剩「把别处的变化拉回来」—— 那种变化的时效要求低得多。
        autoSyncEnabled: false,
        autoSyncMinutes: 30,
        // 默认**开**：它与上面那条不是一类东西（见 `imageChangeSyncEnabled` 的说明）
        // —— 它只在用户真的动了图之后跑一次，代价与收益一一对应。
        imageChangeSyncEnabled: true,
        // 静默 30 秒：一次编辑会话（拖一批图、批量压缩）会被收成一轮，
        // 而且不会在用户还在写文件的时候去读它。
        imageChangeDelaySeconds: 30,
        compressQuality: 82,
        compressMaxEdge: 1600,
        compressFormat: "keep",
    },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype
    );
}

/** 读磁盘数据里的设置版本号；缺失或非法时当作 0（最老的形态）。 */
function readVersion(loaded: unknown): number {
    if (!isPlainObject(loaded)) return 0;
    const version = loaded.version;
    return typeof version === "number" && Number.isFinite(version) ? version : 0;
}

/** 读磁盘数据里的 `images` 原文（迁移要读已经被删掉的字段）。 */
function readRawImages(loaded: unknown): Record<string, unknown> | undefined {
    if (!isPlainObject(loaded)) return undefined;
    const images = loaded.images;
    return isPlainObject(images) ? images : undefined;
}

/** 读磁盘数据里的 `sync` 原文（同上：v6 → v7 要读已经删掉的三个间隔）。 */
function readRawSync(loaded: unknown): Record<string, unknown> | undefined {
    if (!isPlainObject(loaded)) return undefined;
    const sync = loaded.sync;
    return isPlainObject(sync) ? sync : undefined;
}

/** 读磁盘数据里的 `installer` 原文（v8 → v9 要读已经删掉的 `selfUpdateSource`）。 */
function readRawInstaller(loaded: unknown): Record<string, unknown> | undefined {
    if (!isPlainObject(loaded)) return undefined;
    const installer = loaded.installer;
    return isPlainObject(installer) ? installer : undefined;
}

/**
 * 深拷贝一份默认值。
 *
 * **必须有这一步**：`mergeWithDefaults` 返回的是 `{ ...defaults }` 浅拷贝，
 * 嵌套对象仍是 `DEFAULT_SETTINGS` 里那两个引用。早先的写法在「磁盘数据里缺这个
 * 键」时直接把默认值本身放进结果，于是运行时的写入 —— `installer.tracked.push()`、
 * 拨一个同步开关 —— 会**就地改写模块级的 DEFAULT_SETTINGS**。
 *
 * 症状很隐蔽：此后每次 `normalizeSettings`（重载设置、读第二遍）都从一份脏的
 * 默认值开始，于是「这次会话里加过的跟踪条目」会在一个全新库（没有 data.json）
 * 里凭空出现。测试里表现为跨用例污染，生产里表现为「删掉的条目又回来了」。
 */
function cloneDefault<T>(value: T): T {
    if (Array.isArray(value)) return [...value] as unknown as T;
    if (isPlainObject(value)) {
        const copy: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value)) copy[key] = cloneDefault(nested);
        return copy as T;
    }
    return value;
}

/**
 * 用默认值补全缺失字段。
 *
 * 参考项目 obsidian-git 的做法是「浅合并 + 对个别嵌套对象深合并」，
 * 结果是每加一个嵌套设置就要手动补一行。这里改成通用递归合并 ——
 * 新增设置项时不需要动任何迁移代码。
 */
function mergeWithDefaults<T extends Record<string, unknown>>(
    defaults: T,
    loaded: unknown
): T {
    if (!isPlainObject(loaded)) return cloneDefault(defaults);

    const result = { ...defaults } as Record<string, unknown>;
    for (const [key, defaultValue] of Object.entries(defaults)) {
        const loadedValue = loaded[key];
        if (loadedValue === undefined) {
            // 缺这个键 —— 连默认值也要拷贝一份，理由见 cloneDefault。
            result[key] = cloneDefault(defaultValue);
            continue;
        }

        if (isPlainObject(defaultValue)) {
            // 空对象默认值是「映射表」（如 installer.availableUpdates）——
            // 形状由数据决定，必须整体透传给下游校验，否则遍历 defaults 的键
            // 会把整张表丢掉。校验仍由专门的 sanitize 函数负责。
            result[key] =
                Object.keys(defaultValue).length === 0
                    ? (isPlainObject(loadedValue) ? { ...loadedValue } : cloneDefault(defaultValue))
                    : mergeWithDefaults(defaultValue, loadedValue);
        } else if (typeof loadedValue === typeof defaultValue) {
            result[key] = loadedValue;
        } else {
            // 类型不匹配的旧值直接丢弃，回退到默认值。
            // 静默接受错误类型会在后面引发难以定位的问题。
            result[key] = cloneDefault(defaultValue);
        }
    }
    return result as T;
}

/** 把磁盘上读到的原始数据变成一份完整、可信的设置对象。 */
export function normalizeSettings(loaded: unknown): ObsyncSettings {
    // 迁移判断要在覆盖 version 之前取原始值。
    const loadedVersion = readVersion(loaded);
    // 迁移还要读**已经删掉的**字段（见 migrateV4ToV5），而 `mergeWithDefaults`
    // 只保留默认值里存在的键 —— 所以原始那一份也要留着。
    const loadedImages = readRawImages(loaded);
    const loadedSync = readRawSync(loaded);
    const loadedInstaller = readRawInstaller(loaded);

    const merged = mergeWithDefaults(
        DEFAULT_SETTINGS as unknown as Record<string, unknown>,
        loaded
    ) as unknown as ObsyncSettings;

    merged.version = SETTINGS_VERSION;

    // v1 → v2：启动检查改为默认关闭，由「进入设置页自动检查」承接。
    // 老 data.json 里往往已经持久化了旧的默认 true（用户从没动过这个开关），
    // 不纠正的话新默认形同虚设 —— 所以这里对 v1 数据一并置为 false。
    // 用户之后手动打开不会再被改回。
    if (loadedVersion < 2) {
        merged.installer.autoCheckOnStartup = false;
    }

    // v2 → v3：启用主题支持。必须在 sanitize 之前 —— 见 migrateV2ToV3。
    if (loadedVersion < 3) {
        migrateV2ToV3(merged.installer);
    }

    // v4 → v5：取消双向删除，改成「删本地时问一句」。见 migrateV4ToV5。
    if (loadedVersion < 5) {
        migrateV4ToV5(merged.images, loadedImages);
    }

    // v5 → v6：问一句从开关变成三态下拉。见 migrateV5ToV6。
    if (loadedVersion < 6) {
        migrateV5ToV6(merged.images, loadedImages);
    }

    // v6 → v7：三个自动间隔合成一个「定时同步」周期。见 migrateV6ToV7。
    if (loadedVersion < 7) {
        migrateV6ToV7(merged.sync, loadedSync);
    }

    // v7 → v8：「按周期同步」的开关从「间隔为 0」拆成独立字段。见 migrateV7ToV8。
    if (loadedVersion < 8) {
        migrateV7ToV8(merged.images, loadedImages);
    }

    // v8 → v9：自身更新来源从「自由地址」改成「是否走 Gitee 镜像」。见 migrateV8ToV9。
    if (loadedVersion < 9) {
        migrateV8ToV9(merged.installer, loadedInstaller);
    }

    // v9 → v10：删掉「启用插件安装器」那个总开关。见 migrateV9ToV10。
    if (loadedVersion < 10) {
        migrateV9ToV10(merged.installer, loadedInstaller);
    }

    // 数值范围钳制 —— data.json 是用户可以手改的。
    merged.installer.autoCheckDelaySeconds = clamp(
        merged.installer.autoCheckDelaySeconds,
        0,
        3600
    );
    if (!Number.isFinite(merged.installer.lastUpdateCheckAt) || merged.installer.lastUpdateCheckAt < 0) {
        merged.installer.lastUpdateCheckAt = 0;
    }
    if (typeof merged.installer.pendingRestartVersion !== "string") {
        merged.installer.pendingRestartVersion = "";
    }
    // 自身可用更新的版本号：与上一行同一个口径（非字符串当没写过）。
    // 它只是个「记下上次查到了什么」的备忘，不参与任何判断 —— 所以这里不做
    // 版本号格式校验：真出现脏值时，最多是状态行多写一句，而不是功能出错。
    if (typeof merged.installer.selfUpdateAvailable !== "string") {
        merged.installer.selfUpdateAvailable = "";
    }
    // 「自身更新是否走 Gitee 镜像」是个布尔：`mergeWithDefaults` 已经把类型不对的
    // 旧值回退到默认 `true`，这里不必再兜。老数据里那个字符串字段的折算在
    // `migrateV8ToV9` 里做（要读磁盘原文，见那里的说明）。
    // 定时同步的周期：0 / 负数 / 非数字都收敛到默认 —— 新模型里「关」由
    // `enabled` 表达，周期里没有 0 的含义（见 `SyncSettings.intervalMinutes`），
    // 落进一个 0 只会变成「开着却永不触发」的假状态。
    if (!(merged.sync.intervalMinutes >= 1)) {
        merged.sync.intervalMinutes = DEFAULT_SETTINGS.sync.intervalMinutes;
    }
    merged.sync.intervalMinutes = clamp(merged.sync.intervalMinutes, 1, 24 * 60);

    if (!["merge", "rebase", "reset"].includes(merged.sync.syncStrategy)) {
        merged.sync.syncStrategy = "merge";
    }

    // ── 图片同步 ──
    //
    // 这一组全是「字符串 / 数组 / 枚举」，`mergeWithDefaults` 只保证**类型**
    // 大致对得上（数组是对象，所以任何数组形状都会被原样放行），内容一概不管。
    // 而 `data.json` 可以被手改，也会随笔记仓库同步到别的设备 —— 所以逐项校验。
    const images = merged.images;
    images.accountId = asString(images.accountId);
    images.bucket = asString(images.bucket);
    images.accessKeyId = asString(images.accessKeyId);
    images.prefix = asString(images.prefix);
    images.publicBaseUrl = asString(images.publicBaseUrl);

    // 文件夹是**唯一决定「插件能动哪些文件」**的字段，它的校验最要紧：
    // 非字符串的条目会让 `isInsideFolders` 抛错（整轮同步挂掉），
    // 而没归一化的路径（`/attachments/`、`a//b`）会让范围判断悄悄失准。
    //
    // 这里读**磁盘原文**而不是 `merged.images.folders`：`mergeWithDefaults` 对
    // 「类型不匹配的旧值」的处置是回退默认值，而默认值现在是整个库 —— 于是一个
    // 手改坏的 `folders`（字符串、数字、对象）会被悄悄变成「同步全部」。
    // 坏形状只能退到空列表（设置页会提示「一个文件夹都没指定」），
    // **缺失**才拿默认值：前者是「数据坏了，别猜」，后者是「还没配过」。
    const rawFolders = loadedImages?.folders;
    images.folders =
        rawFolders === undefined
            ? normalizeFolders(DEFAULT_SETTINGS.images.folders)
            : normalizeFolders(Array.isArray(rawFolders) ? rawFolders.filter(isString) : []);

    if (!["newer", "local", "remote"].includes(images.conflictPolicy)) {
        images.conflictPolicy = "newer";
    }
    if (!["ask", "always", "never"].includes(images.deleteRemotePolicy)) {
        images.deleteRemotePolicy = "ask";
    }
    if (!["keep", "jpeg", "webp", "png"].includes(images.compressFormat)) {
        images.compressFormat = "keep";
    }
    // 「按周期同步」的周期：下限 **5**。理由与下面 `compressQuality` 的下限 10 同源：
    // 每 1 分钟跑一轮整库比对（ListObjects + 逐文件算 hash，还会真的上传下载）没有
    // 意义，而用户多半是手滑拖到底。
    //
    // 0 / 负数 / 非数字收敛到**默认值**而不是钳到 5 —— 5 分钟一轮比默认值更激进，
    // 不该是「填错」的结果。新模型里「关」由 `autoSyncEnabled` 表达，
    // 这个数字里没有 0 的含义。
    if (!(images.autoSyncMinutes >= 5)) {
        images.autoSyncMinutes = DEFAULT_SETTINGS.images.autoSyncMinutes;
    }
    images.autoSyncMinutes = clamp(images.autoSyncMinutes, 5, 24 * 60);
    // 「变动后自动同步」的静默期：下限 **5 秒**（比这更密的话，一次编辑会话会被
    // 切成好几轮），上限 **600 秒**（再长就与「按周期同步」那一轮重了）。
    // 与上面同一条取舍：0 / 负数 / 非数字收敛到**默认值**，不钳到边界 ——
    // 5 秒一轮比默认值激进得多，不该是「填错」的结果。
    if (!(images.imageChangeDelaySeconds >= 5)) {
        images.imageChangeDelaySeconds = DEFAULT_SETTINGS.images.imageChangeDelaySeconds;
    }
    images.imageChangeDelaySeconds = clamp(images.imageChangeDelaySeconds, 5, 600);
    // 下限 10 而不是 1：质量 1 的 jpeg 基本不可看，而用户多半是手滑拖到底。
    images.compressQuality = clamp(images.compressQuality, 10, 100);
    // 上限 20000 像素：再大也不是「压缩」，且画布在部分设备上会直接失败。
    images.compressMaxEdge = clamp(images.compressMaxEdge, 0, 20_000);

    // 数组不能靠递归合并校验 —— 它会被整体替换，条目内容没人检查过。
    merged.installer.tracked = sanitizeTrackedItems(merged.installer.tracked);

    // 可更新记录同理：逐条校验，并剪掉已不在跟踪列表里的条目。
    merged.installer.availableUpdates = sanitizeAvailableUpdates(
        merged.installer.availableUpdates,
        merged.installer.tracked
    );

    // 待确认的镜像提议同上一行：值要逐条校验（`data.json` 可以手改），
    // 键也要剪掉已不跟踪的条目（否则列表里会留下一条没有对应行的提议）。
    merged.installer.mirrorSuggestions = sanitizeMirrorSuggestions(
        merged.installer.mirrorSuggestions,
        merged.installer.tracked
    );

    return merged;
}

/**
 * 从 `SUPPORTED_HOSTS` 派生 —— **不要**在这里再列一遍平台名。
 *
 * 这份名单决定 `data.json` 里哪些跟踪条目能活下来：漏掉一个平台的后果是
 * 用户在**那个平台**上装的插件下次加载时被当成非法条目**无声丢弃**
 * （不是报错，是列表里就没了）。它和「有哪些平台」本来就是同一个事实。
 */
const VALID_HOSTS = new Set<string>(SUPPORTED_HOSTS);
const VALID_CHANNELS = new Set(["release", "raw"]);

/**
 * 从 `TRACKED_KINDS` 派生 —— **不要**在这里再列一遍种类。
 *
 * 与平台名单同理：漏掉一个 kind 的后果是用户在**那种对象**上的跟踪记录
 * 下次加载时被当成非法条目**无声丢弃**（不报错，列表里就没了）。
 */
const VALID_KINDS = new Set<string>(TRACKED_KINDS);

/**
 * 身份键：`<kind>:<id>`。更新记录（`availableUpdates`）与各处去重都用它。
 *
 * **必须带 kind 前缀**：插件 id 与主题目录名是两个独立的命名空间，而
 * `availableUpdates` 是一张表。不带前缀的话，一个 id 为 `minimal` 的插件与一个
 * 目录名为 `minimal` 的主题会共用一条记录 —— 更新完其中一个清掉徽标，
 * 另一个的徽标跟着消失，且没人看得出为什么。
 *
 * **主题的 id 归一成小写**：主题的身份是目录名，而 macOS / Windows 的文件系统
 * 不区分大小写 —— `resolveThemeFolder` / `listInstalledThemes` / `getActiveTheme`
 * 都按这个口径办，身份键也必须跟上。不归一的话同一个主题能存在两条记录：它们
 * 指向**同一个目录**（更新其中一个等于更新两个），却各有一个徽标，
 * 列表上就是两行一模一样的主题，用户分不出哪行是真的。
 *
 * 插件侧**不**归一：`manifest.id` 有 `/^[a-z0-9-]+$/` 的校验，本来就不可能出现大写。
 */
export function availableUpdateKey(item: { kind: TrackedKind; id: string }): string {
    const id = item.kind === "theme" ? item.id.toLowerCase() : item.id;
    return `${item.kind}:${id}`;
}

/**
 * v2 → v3：引入主题支持。
 *
 * 三件事：
 * 1. 老条目补上 `kind: "plugin"` —— v2 的列表里只可能有插件；
 * 2. 把 v2 的 `pluginId` 字段改名为 `id`（判别联合里两种 kind 用同一个名字，
 *    见 `TrackedBase.id`）。**漏了这一条 `data.json` 会被清空**：迁移之后
 *    sanitize 按 `id` 取值，拿不到就按「结构不完整」把每一条都丢掉，
 *    用户的跟踪列表会在一轮重启后无声消失；
 * 3. `availableUpdates` 的键从裸 `id` 换成 `<kind>:<id>`（见 availableUpdateKey）。
 *
 * 必须在 sanitize **之前**做，而不是让 sanitize 兼容两种形状：那样会把
 * 「版本较老」和「格式非法」混成同一件事，而这两者要采取的行动完全不同
 * （前者该迁移，后者该丢弃）。
 */
function migrateV2ToV3(installer: InstallerSettings): void {
    for (const entry of installer.tracked as unknown[]) {
        if (!isPlainObject(entry)) continue;

        if (entry.kind === undefined) entry.kind = "plugin";

        if (entry.id === undefined && typeof entry.pluginId === "string") {
            entry.id = entry.pluginId;
            delete entry.pluginId;
        }
    }

    const legacy = installer.availableUpdates;
    const upgraded: InstallerSettings["availableUpdates"] = {};
    for (const [key, value] of Object.entries(legacy)) {
        // 已经带前缀的键原样保留。正常情况下 v2 数据的键都是裸 id，
        // 但 `data.json` 可以手改、也会随笔记仓库同步 —— 万一版本号缺失
        // （或被人删掉）而键已经是新格式，再套一层前缀会让**所有徽标消失**，
        // 且看不出原因。
        const alreadyKeyed = TRACKED_KINDS.some((kind) => key.startsWith(`${kind}:`));
        upgraded[alreadyKeyed ? key : availableUpdateKey({ kind: "plugin", id: key })] = value;
    }
    installer.availableUpdates = upgraded;
}

/**
 * v4 → v5：取消双向删除，改成「删本地时问一句」。
 *
 * 两个老开关里只有**一个**有对应物，所以这不是机械改名：
 *
 * - `deleteRemoteWhenLocalDeleted`（本地删了 → 云端也删）问的正是「删本地时
 *   要不要动云端」，与新字段同一个问题 —— 把它接过来。关掉过它的用户明确
 *   表达过「别动云端」，那就别拿询问去打扰他。
 * - `deleteLocalWhenRemoteDeleted`（云端删了 → 本地也删）**没有**对应物：
 *   那个方向的行为被整个去掉了。它被静默丢弃是有意的 —— 留着它没有意义，
 *   而把它翻译成 `deleteRemotePolicy` 会让「云端的变化影响本地」以另一种形式
 *   复活（新字段管的是本地删除，方向正好相反）。
 *
 * 必须在 sanitize 之前做：`mergeWithDefaults` 只保留默认值里存在的键，
 * 所以老字段在 `merged.images` 上已经看不到了，只能从原始数据里读。
 */
function migrateV4ToV5(
    images: ImageSyncSettings,
    loaded: Record<string, unknown> | undefined
): void {
    const previous = loaded?.deleteRemoteWhenLocalDeleted;
    if (typeof previous === "boolean") images.deleteRemotePolicy = previous ? "ask" : "never";
}

/**
 * v5 → v6：「删本地时问一句」从开关变成三态下拉。
 *
 * 老开关的两端各自有对应物，**没有 Default 丢失**：
 *
 * - `askDeleteRemote: true`（默认）→ `ask`；
 * - `askDeleteRemote: false` → `never`（用户明确表达过「别动云端」，
 *   不能悄悄改回「询问」—— 那会让他开始被弹窗追问自己拒绝过的行为）。
 *
 * 新字段已经写过值时不碰它：那是 v6 的数据（或手改过的），此时旧字段只是
 * 残留。`data.json` 会随笔记仓库同步，两台设备版本不一致时就会这样。
 *
 * 与 v4 → v5 同一条理由：必须在 sanitize 之前、从**原始数据**里读旧字段。
 */
function migrateV5ToV6(
    images: ImageSyncSettings,
    loaded: Record<string, unknown> | undefined
): void {
    if (loaded?.deleteRemotePolicy !== undefined) return;

    const previous = loaded?.askDeleteRemote;
    if (typeof previous === "boolean") images.deleteRemotePolicy = previous ? "ask" : "never";
}

/**
 * v6 → v7：三个自动间隔（提交 / 推送 / 拉取）合成一个「定时同步」周期。
 *
 * ## 为什么不是「取三个里最小的那个非零值」
 *
 * 主间隔（`autoCommitMinutes`）跑到点执行的本就是**完整链路**
 * `提交 → 拉取 → 推送`，另外两个只是在它之上额外加的单动作定时器。
 * 取最小值会**改变语义**：一台刻意配成「只拉取」（主间隔 0、拉取 30）的设备，
 * 迁移后会开始提交并推送 —— 而那正是它当初避开的动作。
 *
 * ## 三条分支
 *
 * - **主间隔 > 0**：它本来就是「每 N 分钟整条同步一次」，原样接过来，开关照旧；
 * - **主间隔 = 0**（三个都是 0，或压根没配过）：周期留在默认值，
 *   而开关**一律置回关**。老模型里「开着 + 全 0」的实际行为是什么都不做；
 *   新模型里一旦开着就会每 N 分钟提交并推送 —— 迁移**不能**替用户把它变成后者。
 *   实测本机两个库都是这一档（三个间隔全是 0），所以这一步同时是
 *   「升级后不会自己跑起来」的保证；
 * - **v7 数据**（已经有 `intervalMinutes`）：一个字段都不碰，旧字段只是残留
 *   —— `data.json` 会随笔记仓库同步，两台设备版本不一致时就会这样。
 *
 * 与 v4 → v5、v5 → v6 同一条理由：必须在 sanitize 之前、从**原始数据**里读旧字段
 * （`mergeWithDefaults` 只保留默认值里存在的键，三个旧字段在 `merged.sync` 上
 * 已经看不到了）。
 */
function migrateV6ToV7(sync: SyncSettings, loaded: Record<string, unknown> | undefined): void {
    if (loaded?.intervalMinutes !== undefined) return;

    const previous = loaded?.autoCommitMinutes;
    if (typeof previous === "number" && previous > 0) {
        sync.intervalMinutes = previous;
        return;
    }

    sync.enabled = false;
}

/**
 * v7 → v8：「按周期同步」的开关从「间隔为 0」拆成独立字段。
 *
 * 起因是用户问「把最小值设成 5 是不是更合适」。0 那一条下限一旦收紧，就得有个
 * 别的东西表达「不按周期跑」—— 否则只能把默认周期改成非 0，而 `images.enabled`
 * 默认是 `true`，那等于让每个新用户（以及所有存量库）开箱就「每 5 分钟跑一轮
 * 整库比对」。所以周期与开关分成两个字段：周期取下限 5，开关单独表达关。
 *
 * 两条分支：
 *
 * - **旧周期 > 0**：那本来就是「每 N 分钟跑一轮」，原样接过来，开关置为开；
 * - **旧周期 = 0**（默认，绝大多数）：开关置为**关**，周期留在默认值。
 *   这一条同时是「升级后不会自己跑起来」的保证 —— 存量库里 `autoSyncMinutes`
 *   是 0 的占绝大多数（实测本机两个库都是 0）。
 *
 * v8 数据（已经有 `autoSyncEnabled`）一个字段都不碰，旧值只是残留 ——
 * `data.json` 会随笔记仓库同步，两台设备版本不一致时就会这样。
 *
 * 与 v4→v5、v5→v6、v6→v7 同一条理由：必须在 sanitize 之前、从**原始数据**里读。
 */
function migrateV7ToV8(
    images: ImageSyncSettings,
    loaded: Record<string, unknown> | undefined
): void {
    if (typeof loaded?.autoSyncEnabled === "boolean") return;

    const previous = loaded?.autoSyncMinutes;
    if (typeof previous === "number" && previous > 0) {
        images.autoSyncEnabled = true;
        images.autoSyncMinutes = previous;
        return;
    }

    images.autoSyncEnabled = false;
}

/**
 * v8 → v9：自身更新来源从「自由地址字符串」改成「是否走 Gitee 镜像」开关。
 *
 * 2026-10-06 用户要求「插件的自更新来源用开关的形式选择」—— 于是
 * `selfUpdateSource: string` 变成了 `selfUpdateUseGitee: boolean`。老数据里
 * 那个字符串只能折成二选一，折算规则（含「空串 = 老默认 = 镜像」「简写按 GitHub
 * 解释」这些历史语义）写在 `selfUpdateUsesGitee` 里，与它同源。
 *
 * ## 为什么要版本化迁移，而不是像别的字段那样「每次读都归一化」
 *
 * 老的 `selfUpdateSource` 是个**保留用户输入**的自由字段，不是「空 = 用默认」的
 * 那种可直接归一化的形状：一个手改坏的值、一个自定义地址，都可能存在。折算它
 * 需要读**磁盘原文**（`mergeWithDefaults` 只保留默认值里存在的键，老字段在
 * `merged.installer` 上已经看不到了），所以必须走 `readRawInstaller` 这条路。
 *
 * 已经有 `selfUpdateUseGitee`（v9 数据，或两台设备版本不一致时较新那台写的）就
 * 一个字段都不碰 —— 老字段只是残留。
 */
function migrateV8ToV9(
    installer: InstallerSettings,
    loaded: Record<string, unknown> | undefined
): void {
    if (typeof loaded?.selfUpdateUseGitee === "boolean") return;

    installer.selfUpdateUseGitee = selfUpdateUsesGitee(loaded?.selfUpdateSource);
}

/**
 * v9 → v10：删掉「启用插件安装器」总开关（2026-10-06）。
 *
 * 那个字段只被两处读，且都是**前置条件**：启动检查（`enabled &&
 * autoCheckOnStartup`）与进入设置页检查（`enabled && autoCheckOnSettingsOpen`）。
 * 功能区图标、命令面板里的安装命令、设置页的按钮从来不看它 —— 所以它的实际语义
 * 就是「关掉那两个自动检查」，而那件事下面两个开关各自就能表达。
 *
 * 迁移只需处理**关过它**的用户：把他明确表达过的「不要自动检查」落到两个子开关上，
 * 行为才与升级前一致。`true`（默认）或缺失都不动 —— 那本来就是「没表过态」，
 * 两个子开关各自保持自己的值即可。
 *
 * 读磁盘原文的理由与 `migrateV8ToV9` 同：`mergeWithDefaults` 只保留默认值里存在的
 * 键，老字段在 `merged.installer` 上已经看不到了。
 *
 * 边界（**只有 false 才触发**）：手改成 `"false"` / `0` 这类坏值不当成「用户关过」——
 * 当年 `mergeWithDefaults` 会把它换成默认 `true`，也就是当年那台设备上它其实是**开着**
 * 的。这里跟着同一个口径，免得迁移把两个检查开关关掉、凭空改了行为。
 */
function migrateV9ToV10(
    installer: InstallerSettings,
    loaded: Record<string, unknown> | undefined
): void {
    if (loaded?.enabled !== false) return;

    installer.autoCheckOnStartup = false;
    installer.autoCheckOnSettingsOpen = false;
}

/**
 * 校验已跟踪列表，丢弃结构不完整的条目。
 *
 * 这里的取舍是「宁可少一个条目，也不要一个半坏的条目」：一个缺 `id` 的记录
 * 会让移除功能删错目录，风险远大于重新添加一次。
 *
 * ## 为什么 `id` 必须查内容，不能只查「是非空字符串」
 *
 * 这个字段会成为**路径的一截**，而这条路径上仍然有**递归删除**：
 *
 * - 主题：`updateTheme()` 按 `tracked.id` 解析目录 → 写盘失败时回滚 →
 *   若目录原本不存在就 `rmdir(folder, true)` **递归**删掉它；
 * - 插件：全新安装失败时同样会递归删掉刚建的目录（那条路径用的是
 *   `manifest.id`，已被 `parseManifest` 校验过）。
 *
 * 于是一个手改出来的 `"../../evil"` 会让主题那条路的删除目标跑出 `themes/`
 * （路径算术与「真的会发出这个 rmdir」的证明见 `tests/features/itemFolder.test.ts`）。
 *
 * > 注意别把「取消跟踪」算进这条理由里 —— 它**不删任何文件**（见
 * > `InstallerService.unbind`）。真正需要校验的是上面那些**写入失败后的回滚**路径。
 *
 * > 有一处**没有**验证：真机上 Obsidian 的 adapter 会不会主动拒绝越界路径。
 * > 所以要守的是「移除只碰插件 / 主题目录」这条不变量本身 —— 至于它是靠这里
 * > 拦住、还是靠 adapter 兜住，不该由我们来赌。
 *
 * 而 `data.json` 恰恰是这个字段**唯一**不经过 manifest 解析的来源 —— 它可以被手改，
 * 也会随笔记仓库同步到别的设备（包括那些设备上版本更旧的插件写出的旧格式）。
 *
 * ## 两种 kind 的判据不同，**不能**共用一个正则
 *
 * 插件 id 是作者自己定的技术标识（`/^[a-z0-9-]+$/`），而主题没有 id 字段 ——
 * 它的身份来自 manifest 的 `name`，`Minimal`、`Blue Topaz` 这种带空格与大写的
 * 名字才是常态。共用一个正则的后果是「主题一条都绑不上」。两者的完整理由分别写在
 * `core/pluginId.ts` 与 `core/themeName.ts`。
 */
function sanitizeTrackedItems(value: unknown): TrackedItem[] {
    if (!Array.isArray(value)) return [];

    const result: TrackedItem[] = [];
    const seen = new Set<string>();

    for (const entry of value) {
        if (!isPlainObject(entry)) continue;

        const { host, owner, repo, id, kind, name } = entry;
        if (typeof host !== "string" || !VALID_HOSTS.has(host)) continue;
        if (typeof owner !== "string" || !owner) continue;
        if (typeof repo !== "string" || !repo) continue;
        if (!isTrackedKind(kind)) continue;
        if (!isValidId(kind, id)) continue;

        // 同一个身份只保留第一条 —— 重复记录会让更新检查跑两遍。
        const key = availableUpdateKey({ kind, id });
        if (seen.has(key)) continue;
        seen.add(key);

        const channel =
            typeof entry.channel === "string" && VALID_CHANNELS.has(entry.channel)
                ? (entry.channel as InstallChannel)
                : undefined;

        const common = {
            host: host as HostKind,
            owner,
            repo,
            origin: sanitizeOrigin(entry.origin, { host: host as HostKind, owner, repo }),
            id,
            name: typeof name === "string" && name ? name : id,
            installedVersion:
                typeof entry.installedVersion === "string" ? entry.installedVersion : "",
            frozen: entry.frozen === true,
            installedAt:
                typeof entry.installedAt === "number" && Number.isFinite(entry.installedAt)
                    ? entry.installedAt
                    : 0,
        };

        if (kind === "plugin") {
            result.push({
                ...common,
                kind: "plugin",
                // 绑定进来的插件（v2 时代就有的路径）历史未知，沿用 release。
                // 列表只在通道为 raw 时追加来源说明，这个默认值不会造成误报。
                channel: channel ?? "release",
                requestedVersion:
                    typeof entry.requestedVersion === "string" && entry.requestedVersion
                        ? entry.requestedVersion
                        : "latest",
            });
        } else {
            // 主题：channel 允许为空（绑定进来的那批还没走过更新）。
            result.push({ ...common, kind: "theme", channel });
        }
    }

    return result;
}

function isTrackedKind(value: unknown): value is TrackedKind {
    return typeof value === "string" && VALID_KINDS.has(value);
}

/**
 * 校验条目上的 `origin`（走了 Gitee 镜像时记下的**源仓库地址**）。
 *
 * 两条规则，都不是洁癖：
 *
 * 1. **坏值只丢它自己，不丢整个条目** —— 它纯粹是展示用的补充信息，
 *    为了一个多余的地址把用户在跟的插件扔出列表，代价完全不成比例。
 * 2. **与主来源相同的值视为没写** —— 否则列表会画出两行一模一样的地址
 *    （一行「GitHub」一行「Gitee 镜像」，指的却是同一个仓库）。
 *    `data.json` 可以被手改，也会随笔记仓库同步到别的设备，所以这条得在
 *    读取时兜住，而不是只靠写入方自觉。
 */
function sanitizeOrigin(value: unknown, primary: RepoRef): RepoRef | undefined {
    if (!isPlainObject(value)) return undefined;

    const { host, owner, repo } = value;
    if (typeof host !== "string" || !VALID_HOSTS.has(host)) return undefined;
    if (typeof owner !== "string" || !owner) return undefined;
    if (typeof repo !== "string" || !repo) return undefined;

    const origin: RepoRef = { host: host as HostKind, owner, repo };
    return isSameRepo(origin, primary) ? undefined : origin;
}

/** 两种 kind 的身份判据不同 —— 理由见上面的函数注释与 `core/themeName.ts`。 */
function isValidId(kind: TrackedKind, value: unknown): value is string {
    return kind === "plugin" ? isValidPluginId(value) : isValidThemeName(value);
}

/**
 * 校验可更新记录：形状不对的丢弃，不在跟踪列表里的剪掉。
 *
 * 剪枝是关键 —— 跟踪列表是「哪些对象该有徽标」的唯一事实来源，记录里残留
 * 已移除对象的条目会在重新装上同名对象时显示过期徽标。
 */
function sanitizeAvailableUpdates(
    value: unknown,
    tracked: TrackedItem[]
): Record<string, { latestVersion: string; checkedAt: number }> {
    if (!isPlainObject(value)) return {};

    const trackedKeys = new Set(tracked.map((item) => availableUpdateKey(item)));
    const result: Record<string, { latestVersion: string; checkedAt: number }> = {};

    for (const [key, entry] of Object.entries(value)) {
        if (!trackedKeys.has(key)) continue;
        if (!isPlainObject(entry)) continue;
        if (typeof entry.latestVersion !== "string" || !entry.latestVersion) continue;
        if (typeof entry.checkedAt !== "number" || !Number.isFinite(entry.checkedAt)) continue;
        result[key] = { latestVersion: entry.latestVersion, checkedAt: entry.checkedAt };
    }

    return result;
}

/**
 * 校验「待确认的疑似镜像」记录：值逐条校验，键不在跟踪列表里的剪掉。
 *
 * 与 `sanitizeAvailableUpdates` 同一套取舍，但多一条**自洽性**检查：
 * 提议的地址不能与记录当前用的地址相同（那说明它早就被采用了，留着这条提议
 * 只会在列表上挂一句「疑似镜像」而地址和上面那行一模一样）。
 */
function sanitizeMirrorSuggestions(
    value: unknown,
    tracked: TrackedItem[]
): Record<string, RepoRef> {
    if (!isPlainObject(value)) return {};

    const primary = new Map(tracked.map((item) => [availableUpdateKey(item), itemRepoRef(item)]));
    const result: Record<string, RepoRef> = {};

    for (const [key, entry] of Object.entries(value)) {
        const current = primary.get(key);
        if (!current) continue;

        const suggestion = sanitizeOrigin(entry, current);
        // sanitizeOrigin 已经把「坏值」与「与主来源相同」两种情况都判成 undefined，
        // 正好是这里要的两条规则。
        if (suggestion) result[key] = suggestion;
    }

    return result;
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
}

/** `data.json` 里读出来的字符串字段：非字符串一律当没写（空串）。 */
function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}