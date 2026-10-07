import { logger } from "../../core/logger";
import type { HostKind, TokenInfo } from "../../host/types";

/**
 * 功能区（左侧 ribbon）底部的**圆形账号头像**。
 *
 * 2026-10-05 用户要求：「在设置页通用下添加『功能区展示用户头像』的设置项，
 * 默认关闭，打开后在左侧功能区底部展示圆形 gitee 头像」。
 * 2026-10-06 又要求把平台拆成单独一项（默认 Gitee，关掉用 GitHub）——
 * 于是这个模块不再写死 Gitee，而是每次 `apply()` 问一次 `deps.avatarHost()`。
 *
 * ## 为什么不用 `addRibbonIcon`
 *
 * Obsidian 那个 API 建的是**动作按钮**：它要求一个 lucide 图标名与一个点击回调，
 * 而且固定插在功能区**顶部**那一组（`.side-dock-actions`）里。这里要的是一个
 * 位于**底部**、点它没有任何动作的图片 —— 两个条件它都不满足。
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
 * ## 什么时候画、什么时候摘
 *
 * 三条输入：设置里那个开关、用哪个平台、以及那个平台有没有令牌。`apply()` 是
 * **幂等**的，装配层可以在「启动完成」「设置变更」「令牌变更」「布局变化」时
 * 都调它一次：
 *
 * - 开关关着 / 那个平台没令牌 → 摘掉（连网络请求都不发）；
 * - 都有 → 有缓存就直接画，没有就去问一次那个平台的 `validateToken()`。
 *
 * ## 换平台 = 换一份缓存
 *
 * 缓存与「正在请求」都按 **`平台 + 令牌`** 认身份（见 `ResolvedAvatar` / `inFlight`）：
 * 只按令牌认的话，两个平台恰好存了同一串令牌时会把上一张头像画到新平台上 ——
 * 而那种错没有任何报错，只是「头像不对」。
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
     * 头像的 alt / 悬停文案。入参是平台与账号名（账号名**可能为空串** ——
     * 接口没给 `login` 时那种残句由文案自己兜，见 locale 里那条注释）。
     */
    getLabel(host: HostKind, account: string): string;
    /** 挂载点。省掉时走 `findRibbonContainer()`；测试注入一个假节点。 */
    getContainer?(): HTMLElement | null;
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
    avatarUrl: string;
    account?: string;
}

/** 缓存/在途的身份：平台 + 令牌。 */
function avatarIdentity(host: HostKind, token: string): string {
    // 分隔符用 `\0`：令牌里不可能出现它，于是这个键不会有歧义。
    return `${host}\u0000${token}`;
}

export class RibbonAvatar {
    private element?: HTMLImageElement;

    /**
     * 已解析的头像。**只在成功时写入** —— 与 `installerService.giteeAccountName`
     * 同一条理由：失败不缓存，用户中途补上令牌/改对令牌之后下一次 `apply()`
     * 就会重新去问，不必重启 Obsidian。
     */
    private resolved?: ResolvedAvatar;

    /**
     * 正在请求的身份（`avatarIdentity()`）。
     *
     * 两个作用：一是同一身份不重复发请求（`apply()` 会被反复调用），
     * 二是**丢弃过期结果** —— 用户换了令牌或换了平台之后，先前那次响应回来时
     * 不能再画上去。
     */
    private inFlight?: string;

    constructor(private readonly deps: RibbonAvatarDeps) {}

    /**
     * 按当前设置、平台与令牌把头像画出来（或摘掉）。幂等，可反复调用。
     *
     * 同步返回：网络那一段在内部自己跑完再把图挂上 —— 调用方（装配层）是在
     * `applyDerivedSettings()` 这种同步路径里调它的，不该为了一个装饰去 await。
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

        void this.resolve(host, token);
    }

    /** 卸载时调：摘掉节点并清掉缓存（令牌不该在插件禁用后留在内存里）。 */
    destroy(): void {
        this.remove();
        this.resolved = undefined;
        this.inFlight = undefined;
    }

    /** 当前令牌（去掉空白，空串算没配 —— 与 `SecretStore` 的口径一致）。 */
    private currentToken(host: HostKind): string | undefined {
        const token = this.deps.getToken(host)?.trim();
        return token ? token : undefined;
    }

    private async resolve(host: HostKind, token: string): Promise<void> {
        const identity = avatarIdentity(host, token);
        if (this.inFlight === identity) return;
        this.inFlight = identity;

        try {
            const info = await this.deps.lookup(host, token);

            // 请求期间令牌/平台又被换过一次 —— 这次的结果已经过期，丢掉。
            // （`inFlight` 已经被新那次覆盖，所以不能在这里清空它。）
            if (this.inFlight !== identity) return;
            this.inFlight = undefined;

            if (!info.valid || !info.avatarUrl) {
                logger.debug("no avatar to show", {
                    host,
                    valid: info.valid,
                    hasAvatar: Boolean(info.avatarUrl),
                });
                // 令牌无效 / 响应里没有头像地址：屏幕上不该留一张过期的图。
                this.remove();
                return;
            }

            this.resolved = { host, token, avatarUrl: info.avatarUrl, account: info.account };

            // 拿到结果之后**再确认一次**当前的输入：请求期间开关可能被关掉、
            // 令牌可能被清掉、平台可能被换掉（`apply()` 是在用户拨开关的那一刻
            // 同步调用的）。
            if (!this.deps.isEnabled()) return;
            if (this.deps.avatarHost() !== host) return;
            if (this.currentToken(host) !== token) return;
            this.render(this.resolved);
        } catch (err) {
            if (this.inFlight === identity) this.inFlight = undefined;
            // 网络问题不该弹提示：这是一个装饰，失败就当作没有。
            logger.debug("could not load the ribbon avatar", err);
        }
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
            this.element = image;
        } else if (this.element.parentElement !== container) {
            // 功能区被 Obsidian 重建过（切换「显示功能区」、布局重排、主题切换）：
            // 节点还在手上但已经掉出文档，重新挂回去而不是再造一张。
            container.appendChild(this.element);
        }

        const label = this.deps.getLabel(entry.host, entry.account ?? "");
        this.element.setAttribute("src", entry.avatarUrl);
        this.element.setAttribute("alt", label);
        this.element.setAttribute("title", label);
    }

    private remove(): void {
        this.element?.remove();
        this.element = undefined;
    }
}
