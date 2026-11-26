import {
    avatarDataUrl,
    bytesToBase64,
    imageDataUrl,
    tokenFingerprint,
    type AvatarStore,
    type StoredAvatar,
} from "./avatarCache";
import { logger } from "../../core/logger";
import type { HostKind, TokenInfo } from "../../host/types";

/**
 * 功能区（左侧 ribbon）底部的**圆形账号头像**。
 *
 * 2026-10-05 用户要求：「在设置页通用下添加『功能区展示用户头像』的设置项，
 * 默认关闭，打开后在左侧功能区底部展示圆形 gitee 头像」。
 * 2026-10-06 又要求把平台拆成单独一项（默认 Gitee，关掉用 GitHub）——
 * 于是这个模块不再写死 Gitee，而是每次 `apply()` 问一次 `deps.avatarHost()`。
 * 2026-10-09 再要求把它做成**可点的**：点开设置窗口并停靠「通用」页
 * （见下面「点击它打开设置」）。
 *
 * ## 本地副本与更新校验（2026-11-26）
 *
 * 用户要求：「头像保存在本地，这样就算离线也能显示；每次加载插件时只对头像
 * 作更新校验，没有新的头像则沿用旧的」。于是加载时不再是「发请求 → 成功才
 * 画图」，而是两段：
 *
 * 1. **先读本地缓存并立刻画**（`store.read`）—— 离线、接口超时、插件刚启动
 *    而网络还没通，屏幕上的那张脸都在；
 * 2. 再做**一次**更新校验（`lookup`）：接口返回的头像地址与缓存里的一致
 *    → 沿用旧图，不下载、不写盘；地址变了 → 下载新图、落盘、重画。
 *    校验失败（离线 / 令牌暂时失效）→ **保留旧图**，当作这次没有新头像。
 *
 * `checked` 记的是「本次插件会话里已经校验过的身份」：布局变化、`applyDerivedSettings`
 * 等都会反复调 `apply()`，但不能每次都去问接口 —— 那在离线时会变成一条不停
 * 重试的请求队列。换令牌 / 换平台是新身份，会重新校验；插件重载则是新会话。
 *
 * ## 为什么不用 `addRibbonIcon`
 *
 * Obsidian 那个 API 建的是**动作按钮**：它要求一个 lucide 图标名与一个点击回调，
 * 而且固定插在功能区**顶部**那一组（`.side-dock-actions`）里。这里要的是一个
 * 位于**底部**的账号头像（不是 lucide 图标）—— 两个条件它都不满足。
 * 点击动作是自己挂的 `click` 监听（见 `render`），与那个 API 无关。
 *
 * ## 挂在哪一个节点上
 *
 * 桌面端左功能区的 DOM（实测自 `app.css` / `app.js`，2026-10-05 于 1.13.7、
 * 2026-10-06 复核于 1.14.4）：
 *
 *     .workspace-ribbon.side-dock-ribbon.mod-primary   display:flex; flex-direction:column
 *       .side-dock-actions                顶部那一组（所有 addRibbonIcon 都在这）
 *       .side-dock-settings               margin-top:auto → **被推到最底部**
 *
 * ⚠ 修饰类 `mod-primary` 在 1.13 及以前叫 **`mod-left`** —— 1.14 改了名，
 * 而漏掉新名字的症状只是「头像不出现」。完整说明见 `findRibbonContainer`。
 *
 * 所以挂进 `.side-dock-settings`（追加成最后一个孩子）就落在功能区最底部。
 * **不能**挂到 `.workspace-ribbon` 自己身上再加 `margin-top: auto`：那个容器里
 * 已经有一个 auto 边距的孩子，在 flex 列布局里两个 auto 边距会**平分**剩余空间，
 * 后果是设置齿轮被顶到中间 —— 我们装个头像把别人的布局弄乱了。
 *
 * ## 点击它打开设置（2026-10-09）
 *
 * 用户原话：「将功能区展示的用户头像做成可点击的……点击后打开设置窗口，
 * 跳转插件通用设置页」。做法与状态栏条目同构：`deps.onClick` 由装配层注入
 * （`main.ts` 的 `openGeneralSettings()` → 设置页的 `openGeneral()`），
 * 这里只负责在节点创建时把监听挂上。
 *
 * 两条刻意的设计（都写在 `styles.css` 的 `.obsync-ribbon-avatar` 上）：
 * - **光标保持默认**（`cursor: default`）—— 用户原话「悬停时光标保持默认」。
 *   这张头像首先回答「这是谁」，点击只是顺手的入口，不该摆出按钮的样子；
 * - 头像外侧那圈**环状虚影**（`box-shadow`）—— 同样只是「认得出来」，
 *   不是「快来点我」。
 *
 * ## 什么时候画、什么时候摘
 *
 * 三条输入：设置里那个开关、用哪个平台、以及那个平台有没有令牌。`apply()` 是
 * **幂等**的，装配层可以在「启动完成」「设置变更」「令牌变更」「布局变化」时
 * 都调它一次：
 *
 * - 开关关着 / 那个平台没令牌 → 摘掉（连本地缓存都不读，更不发请求）；
 * - 都有 → 先画本地缓存（若有），再在本次会话里校验一次。
 *
 * ## 换平台 = 换一份缓存
 *
 * 缓存与「正在校验」都按 **`平台 + 令牌`** 认身份（见 `avatarIdentity` /
 * `tokenFingerprint`）：只按令牌认的话，两个平台恰好存了同一串令牌时会把上一张
 * 头像画到新平台上 —— 而那种错没有任何报错，只是「头像不对」。
 *
 * ## 拿不到令牌时为什么不显示
 *
 * 头像地址本身是公网可访问的，但「这个地址是谁的」只有拿着令牌问 `/user` 才知道：
 * 没有令牌时接口是 401（实测）。所以这里**不发匿名请求** —— 那既拿不到东西，
 * 又会消耗本就紧张的匿名配额（见 `giteeHost.ts` 文件头）。
 */

export interface RibbonAvatarDeps {
    /** 设置页「通用」里那个总开关（`settings.ribbonAvatar`）。 */
    isEnabled(): boolean;
    /**
     * 用哪个平台的头像（`settings.ribbonAvatarUseGitee` 决定，默认 Gitee）。
     *
     * 做成**每次问一次**而不是构造时快照：用户拨那个开关之后要立刻换头像，
     * 而 `apply()` 是同步调用的（见 `apply` 的说明）。
     */
    avatarHost(): HostKind;
    /** 那个平台当前的令牌；没配就是 `undefined`。 */
    getToken(host: HostKind): string | undefined;
    /**
     * 用令牌换账号资料（`account` + `avatarUrl`）。
     *
     * 注入而不是在这里 `import` host 层：这个模块只管「把一张图挂上去」，
     * 而测试要能不经过 HTTP 就驱动它（真正的实现见装配层传进来的
     * 各平台 `validateToken`）。
     */
    lookup(host: HostKind, token: string): Promise<TokenInfo>;
    /**
     * 本地副本的读写（实现见 `avatarCache.ts`）。先读它再校验，离线才有图。
     */
    store: AvatarStore;
    /** 按头像地址取回图片字节。装配层走 Obsidian 的 `requestUrl`。 */
    download(url: string): Promise<AvatarImage>;
    /**
     * 头像的 alt / 悬停文案。入参是平台与账号名（账号名**可能为空串** ——
     * 接口没给 `login` 时那种残句由文案自己兜，见 locale 里那条注释）。
     *
     * 注意这句话回答的是「这是谁」—— 头像 2026-10-09 起**可以点**（打开设置
     * 窗口的「通用」页），但悬停文案刻意不提那个动作：光标保持默认、
     * 不摆出按钮的样子（用户原话「悬停时光标保持默认」）。
     */
    getLabel(host: HostKind, account: string): string;
    /**
     * 点头像时的动作 —— 打开设置窗口并停靠「通用」页。
     *
     * 与 `StatusBarDeps.onClick` 同一条理由：节点由 Obsidian 创建、**不会被
     * 重建**，所以监听在 `render()` 建节点时挂一次就够。不传则头像不可点
     * （测试与将来的复用场景）。
     */
    onClick?: () => void;
    /** 挂载点。省掉时走 `findRibbonContainer()`；测试注入一个假节点。 */
    getContainer?(): HTMLElement | null;
}

/** 下载一张头像得到的字节及其 MIME。 */
export interface AvatarImage {
    bytes: Uint8Array;
    mime: string;
}

/** 头像元素的类名（样式见 `styles.css` 的 `.obsync-ribbon-avatar`）。 */
const AVATAR_CLASS = "obsync-ribbon-avatar";

/**
 * 找功能区底部的挂载点。顺序即优先级。
 *
 * 1. `.workspace-ribbon.mod-primary .side-dock-settings` —— 桌面端左（主）功能区
 *    底部那一组。**1.14 起的类名**；
 * 2. `.workspace-ribbon.mod-left .side-dock-settings` —— 同一处，**1.13 及以前**
 *    的类名。两个都要留着，理由见下面那段「修饰类改过名」；
 * 3. `.workspace-drawer-ribbon .side-dock-settings` —— **移动端**：手机上没有
 *    `.workspace-ribbon`，功能区在抽屉里；
 * 4. `.workspace-ribbon .side-dock-settings` —— **不依赖版本修饰类**的兜底。
 *    它不会误取到右侧那一条：`.side-dock-settings` 只有左/主功能区才有
 *    （1.14 的 app.js 里那句 `"primary" === i && (… createDiv("side-dock-settings") …)`）。
 *    把它排在 1–3 之后是为了「优先精确匹配」，但**它才是真正扛住版本变化的那一条**；
 * 5. 最后退到整个功能区 —— 挂在这里不再保证「贴着底部」（见文件头那条 auto 边距的
 *    说明），但**至少还看得见**；彻底找不到就返回 null，由调用方等下一次 `apply()`。
 *
 * ## 修饰类改过名（2026-10-06 实测，踩过一次）
 *
 * Obsidian **1.14.0 把功能区的修饰类从 `mod-left` / `mod-right` 改成了
 * `mod-primary` / `mod-secondary`** —— 两个版本的 `app.js` 里都是
 * `addClass("mod-" + 映射(t))`，差别只在那个映射函数：
 *
 * - 1.13.7：直接拼 `t`（`"left"` / `"right"`）；
 * - 1.14.4：先过一层映射，`"left" → "primary"`、`"right" → "secondary"`。
 *
 * 只写 `mod-left` 的后果是**在 1.14 上四个选择器全部落空**，`findRibbonContainer()`
 * 恒返回 null，而症状只是「头像不出现」—— 没有任何报错。所以这里既保留两个旧类名，
 * 也留了那条不依赖修饰类的兜底。
 */
export function findRibbonContainer(root: ParentNode = document): HTMLElement | null {
    const selectors = [
        ".workspace-ribbon.mod-primary .side-dock-settings",
        ".workspace-ribbon.mod-left .side-dock-settings",
        ".workspace-drawer-ribbon .side-dock-settings",
        ".workspace-ribbon .side-dock-settings",
        ".workspace-ribbon.mod-primary",
        ".workspace-ribbon.mod-left",
        ".workspace-ribbon",
        ".workspace-drawer-ribbon",
    ];
    for (const selector of selectors) {
        const found = root.querySelector(selector);
        if (found) return found as HTMLElement;
    }
    return null;
}

/**
 * 一次成功解析的结果，连同它的来源（换平台或换令牌就作废）。
 *
 * 平台也要记：两个平台可能恰好存了同一串令牌（用户把同一个粘贴了两遍），
 * 只按令牌认身份的话，切平台之后会把上一张头像当成新平台的画上去 ——
 * 而那种错没有任何报错，只是「头像不对」。
 */
interface ResolvedAvatar {
    host: HostKind;
    token: string;
    /** 远端头像地址（缓存命中时来自本地文件）。用于比对是否有新头像。 */
    avatarUrl: string;
    account?: string;
    /** 真正给 `<img src>` 的值：本地副本与新下载的都是 data URL。 */
    src: string;
}

/** 缓存/在途的身份：平台 + 令牌。 */
function avatarIdentity(host: HostKind, token: string): string {
    // 分隔符用 `\0`：令牌里不可能出现它，于是这个键不会有歧义。
    return `${host}\u0000${token}`;
}

export class RibbonAvatar {
    private element?: HTMLImageElement;

    /**
     * 当前画着的头像。**只在拿到一张图时写入** —— 本地缓存命中会写，新下载
     * 成功也会写；校验失败不写，屏幕上那张旧图就留在那儿。
     */
    private resolved?: ResolvedAvatar;

    /**
     * 正在处理的身份（`avatarIdentity()`）。覆盖「读缓存 → 校验 → 下载 → 落盘」
     * 整条链，两个作用：同一身份不重复开工（`apply()` 会被布局事件反复调用），
     * 以及**丢弃过期结果**（用户换了令牌或平台之后，先前那次响应回来时不能
     * 再画上去）。
     */
    private inFlight?: string;

    /**
     * 本次插件会话里已经做过更新校验的身份。
     *
     * 失败也算校验过 —— 否则离线时每一次布局变化都会再发一次请求。想再试
     * 就换令牌 / 换平台（新身份），或者重载插件（新会话）。
     */
    private checked?: string;

    /** 插件已卸载。卸载后回到来的异步结果不能再往功能区挂节点。 */
    private destroyed = false;

    constructor(private readonly deps: RibbonAvatarDeps) {}

    /**
     * 按当前设置、平台与令牌把头像画出来（或摘掉）。幂等，可反复调用。
     *
     * 同步返回：读盘与网络那几段在内部自己跑完再把图挂上 —— 调用方（装配层）
     * 是在 `applyDerivedSettings()` 这种同步路径里调它的，不该为了一个装饰去 await。
     */
    apply(): void {
        // 平台**每次都问**（用户可能刚拨了那个开关）—— 关着时问都不必问。
        const host = this.deps.isEnabled() ? this.deps.avatarHost() : undefined;
        const token = host ? this.currentToken(host) : undefined;
        if (!host || !token) {
            this.remove();
            return;
        }

        if (this.resolved?.host === host && this.resolved.token === token) {
            this.render(this.resolved);
            return;
        }

        const identity = avatarIdentity(host, token);
        // 正在进行中，或者这次会话已经校验过（但没图）—— 都不再开工。
        if (this.inFlight === identity || this.checked === identity) return;

        void this.activate(host, token, identity);
    }

    /**
     * 卸载时调：摘掉节点并清掉内存缓存（令牌不该在插件禁用后留在内存里）。
     * **磁盘上的头像副本不动** —— 下次加载还要靠它离线显示。
     */
    destroy(): void {
        this.destroyed = true;
        this.remove();
        this.resolved = undefined;
        this.inFlight = undefined;
        this.checked = undefined;
    }

    /** 当前令牌（去掉空白，空串算没配 —— 与 `SecretStore` 的口径一致）。 */
    private currentToken(host: HostKind): string | undefined {
        const token = this.deps.getToken(host)?.trim();
        return token ? token : undefined;
    }

    /** 请求期间设置可能变了；变了的结果不能画上去。 */
    private isCurrent(host: HostKind, token: string): boolean {
        return (
            !this.destroyed &&
            this.deps.isEnabled() &&
            this.deps.avatarHost() === host &&
            this.currentToken(host) === token
        );
    }

    private async activate(host: HostKind, token: string, identity: string): Promise<void> {
        this.inFlight = identity;
        const fingerprint = tokenFingerprint(host, token);

        // ① 本地副本先画。**离线时能不能看到头像，全靠这一步。**
        let cached: StoredAvatar | null = null;
        try {
            cached = await this.deps.store.read(host);
            // 令牌换了：这份缓存属于上一个账号，不能用。
            if (cached && cached.tokenFingerprint !== fingerprint) cached = null;
        } catch (err) {
            logger.debug("could not load the cached ribbon avatar", err);
        }
        if (this.inFlight !== identity) return;
        if (!this.isCurrent(host, token)) {
            // 读盘期间开关被关掉 / 令牌被清掉：这次作废，且必须把 inFlight
            // 交还，否则用户再打开时会被当成「正在进行中」永远卡住。
            this.inFlight = undefined;
            return;
        }

        if (cached) {
            this.resolved = {
                host,
                token,
                avatarUrl: cached.avatarUrl,
                account: cached.account,
                src: avatarDataUrl(cached),
            };
            this.render(this.resolved);
        }

        // ② 更新校验：每个身份每次会话只问一次。失败就沿用上面的旧图。
        let info: TokenInfo;
        try {
            info = await this.deps.lookup(host, token);
        } catch (err) {
            if (this.inFlight === identity) {
                this.inFlight = undefined;
                this.checked = identity;
            }
            logger.debug("could not check the ribbon avatar for updates", err);
            return;
        }

        // 请求期间令牌/平台又被换过一次 —— 这次的结果已经过期，丢掉。
        // （`inFlight` 已经被新那次覆盖，所以不能在这里清空它。）
        if (this.inFlight !== identity) return;
        this.inFlight = undefined;
        this.checked = identity;

        if (!this.isCurrent(host, token)) return;

        if (!info.valid || !info.avatarUrl) {
            // 令牌暂时失效 / 接口没给地址：有本地副本就继续用它（没有人脸变了），
            // 没有则屏幕上不该留一张别处的图。
            if (!cached) this.remove();
            return;
        }

        if (cached && cached.avatarUrl === info.avatarUrl) {
            // **没有新头像**：旧图已经画上了，不下载、不写盘。账号名以这次
            // 接口给的为准（缓存里可能没有）。
            this.resolved = {
                host,
                token,
                avatarUrl: cached.avatarUrl,
                account: info.account ?? cached.account,
                src: avatarDataUrl(cached),
            };
            this.render(this.resolved);
            return;
        }

        // ③ 地址变了（或第一次）→ 取回图片并落盘。
        let image: AvatarImage;
        try {
            image = await this.deps.download(info.avatarUrl);
        } catch (err) {
            // 拿不到新图就留着旧图 —— 这正是「没有新的头像则沿用旧的」。
            logger.debug("could not download the ribbon avatar", err);
            return;
        }
        if (!this.isCurrent(host, token)) return;

        const base64 = bytesToBase64(image.bytes);
        const entry: StoredAvatar = {
            tokenFingerprint: fingerprint,
            avatarUrl: info.avatarUrl,
            account: info.account,
            mime: image.mime,
            base64,
        };
        try {
            await this.deps.store.write(host, entry);
        } catch (err) {
            // 写盘失败不该挡住显示：这一会话里图还是在的，下次再试。
            logger.debug("could not save the ribbon avatar locally", err);
        }
        if (!this.isCurrent(host, token)) return;

        this.resolved = {
            host,
            token,
            avatarUrl: info.avatarUrl,
            account: info.account,
            src: imageDataUrl(image.mime, base64),
        };
        this.render(this.resolved);
    }

    private render(entry: ResolvedAvatar): void {
        const container = this.deps.getContainer
            ? this.deps.getContainer()
            : findRibbonContainer();
        // 布局还没就绪（`document` 里暂时没有功能区）：什么都不做。下一次
        // `apply()`（启动完成 / 布局变化）会再试一次 —— 缓存还在，不会再发请求。
        if (!container) return;

        if (!this.element) {
            const image = container.createEl("img", { cls: AVATAR_CLASS });
            // 不把 `app://obsidian.md` 当来源发给图床：那张图是公开的，
            // 没有任何理由向它暴露「这是谁在什么时候看的」。
            image.setAttribute("referrerpolicy", "no-referrer");
            // 点击监听只在**建节点时**挂一次：节点不会被重建（重建等于在功能区
            // 多挂一张图），所以没有「重复挂」的问题，也不必每次重绘都摘了再挂。
            if (this.deps.onClick) image.addEventListener("click", this.deps.onClick);
            this.element = image;
        } else if (this.element.parentElement !== container) {
            // 功能区被 Obsidian 重建过（切换「显示功能区」、布局重排、主题切换）：
            // 节点还在手上但已经掉出文档，重新挂回去而不是再造一张。
            container.appendChild(this.element);
        }

        const label = this.deps.getLabel(entry.host, entry.account ?? "");
        // data URL 不发起网络请求：离线时这张图就在节点自己的属性里。
        this.element.setAttribute("src", entry.src);
        this.element.setAttribute("alt", label);
        this.element.setAttribute("title", label);
    }

    private remove(): void {
        this.element?.remove();
        this.element = undefined;
    }
}
