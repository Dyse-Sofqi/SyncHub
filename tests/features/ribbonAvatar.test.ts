import { describe, expect, it, vi } from "vitest";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import {
    bytesToBase64,
    createAvatarStore,
    tokenFingerprint,
    type StoredAvatar,
} from "../../src/features/avatar/avatarCache";
import {
    RibbonAvatar,
    findRibbonContainer,
    type AvatarImage,
} from "../../src/features/avatar/ribbonAvatar";
import { getHost } from "../../src/host/hostRegistry";
import type { HostKind, TokenInfo } from "../../src/host/types";
import type { App } from "obsidian";

/**
 * 功能区（左侧 ribbon）底部的圆形 Gitee 头像。
 *
 * ## 为什么要单独一个替身，而不用 `tests/setup.ts` 里那个全局 DOM
 *
 * 全局替身的 `remove()` 是空实现、也没有 `parentElement`。而这块代码里最容易
 * 出错的恰恰是这两件事：**节点真的摘掉了吗**（插件卸载、令牌清空、开关关掉）、
 * **重画会不会插出第二张**（布局变化会反复调 `apply()`）。所以这里写一个小而
 * 真的假节点：`appendChild` 维护父子关系、`remove()` 真的从父节点里摘掉。
 *
 * ## 网络一律是替身
 *
 * `lookup` 是注入的，所以这一组用例不碰 `requestUrl` —— 它验的是「拿到资料之后
 * 怎么画」，接口那一侧在 `tests/host/giteeHost.test.ts` 里钉。
 */

const AVATAR_URL = "https://foruda.gitee.com/avatar/1788141849167533005/1_sofqi_2.png";
/** 下载替身默认给出的图片字节（一张图只有一个像素也够断言 src 用）。 */
const NEW_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const NEW_BASE64 = bytesToBase64(NEW_BYTES);
const OLD_BASE64 = bytesToBase64(new Uint8Array([9, 9, 9, 9]));

function cachedAvatar(
    host: HostKind,
    token: string,
    overrides: Partial<StoredAvatar> = {}
): StoredAvatar {
    return {
        tokenFingerprint: tokenFingerprint(host, token),
        avatarUrl: AVATAR_URL,
        account: "sofqi",
        mime: "image/png",
        base64: OLD_BASE64,
        ...overrides,
    };
}

/** 最小的假节点：只实现这个模块真正碰到的那几个成员。 */
class FakeEl {
    readonly children: FakeEl[] = [];
    readonly attrs: Record<string, string> = {};
    /** 挂上来的 click 监听（头像 2026-10-09 起可点）。 */
    readonly handlers: Array<() => void> = [];
    parentElement: FakeEl | null = null;

    constructor(
        readonly tagName: string,
        readonly cls = ""
    ) {}

    asContainer(): HTMLElement {
        return this as unknown as HTMLElement;
    }

    createEl(tag: string, options?: { cls?: string }): FakeEl {
        const child = new FakeEl(tag, options?.cls ?? "");
        this.appendChild(child);
        return child;
    }

    appendChild(child: FakeEl): FakeEl {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    setAttribute(name: string, value: string): void {
        this.attrs[name] = value;
    }

    addEventListener(type: string, handler: () => void): void {
        if (type === "click") this.handlers.push(handler);
    }

    /** 模拟一次点击（触发所有 click 监听）。 */
    click(): void {
        for (const handler of this.handlers) handler();
    }

    remove(): void {
        const parent = this.parentElement;
        if (parent) {
            const index = parent.children.indexOf(this);
            if (index >= 0) parent.children.splice(index, 1);
        }
        this.parentElement = null;
    }
}

/** 假 `document`：按选择器给节点，并记下问过哪些选择器。 */
function createRoot(nodes: Record<string, FakeEl>): { root: ParentNode; asked: string[] } {
    const asked: string[] = [];
    const root = {
        querySelector(selector: string): HTMLElement | null {
            asked.push(selector);
            return nodes[selector]?.asContainer() ?? null;
        },
    } as unknown as ParentNode;
    return { root, asked };
}

interface HarnessOptions {
    enabled?: boolean;
    token?: string | undefined;
    lookup?: (token: string) => Promise<TokenInfo>;
    /** 用哪个平台的头像（设置页那个开关）。默认 Gitee。 */
    host?: HostKind;
    /** 点头像时的动作（2026-10-09 起装配层一定传：打开设置并停靠「通用」）。 */
    onClick?: () => void;
    /** 预置的本地头像副本（模拟上次插件运行时缓存下来的图）。 */
    cached?: Partial<Record<HostKind, StoredAvatar>>;
    /** 图片下载的替身；默认返回固定的几字节。 */
    download?: (url: string) => Promise<AvatarImage>;
}

const defaultLookup = async (_token: string): Promise<TokenInfo> => ({
    valid: true,
    account: "sofqi",
    avatarUrl: AVATAR_URL,
});

function createHarness(options: HarnessOptions = {}) {
    const state = {
        enabled: options.enabled ?? true,
        /** 设置页那个「使用 Gitee 头像」开关的替身。 */
        host: (options.host ?? "gitee") as HostKind,
        /** 两个平台各自的令牌 —— 分开存，好验「换平台会换头像」。 */
        tokens: {} as Partial<Record<HostKind, string>>,
        /** 功能区那个容器在不在 document 里（`false` 模拟布局还没就绪）。 */
        attached: true,
        container: new FakeEl("div", "side-dock-settings"),
        /** 记录被问过的 (平台, 令牌)；答案由 `options.lookup` 决定。 */
        lookup: vi.fn(async (_host: HostKind, token: string) =>
            (options.lookup ?? defaultLookup)(token)
        ),
        /** 本地副本替身：真的存 Map，好断言「写没写」「写的什么地址」。 */
        stored: new Map<HostKind, StoredAvatar>(
            Object.entries(options.cached ?? {}).map(([host, entry]) => [
                host as HostKind,
                entry as StoredAvatar,
            ])
        ),
        download: vi.fn(async (url: string) =>
            (options.download ?? (async () => ({ bytes: NEW_BYTES, mime: "image/png" })))(url)
        ),
        /** 下载过的头像地址（按调用顺序）。 */
        downloads: [] as string[],
    };
    if (options.token !== undefined) state.tokens.gitee = options.token;

    const store = {
        read: vi.fn(async (host: HostKind) => state.stored.get(host) ?? null),
        write: vi.fn(async (host: HostKind, entry: StoredAvatar) => {
            state.stored.set(host, entry);
        }),
    };

    const avatar = new RibbonAvatar({
        isEnabled: () => state.enabled,
        avatarHost: () => state.host,
        getToken: (host) => state.tokens[host],
        lookup: (host, token) => state.lookup(host, token) as Promise<TokenInfo>,
        store,
        download: (url) => {
            state.downloads.push(url);
            return state.download(url);
        },
        // 与装配层一致：传给 locale 的是平台**显示名**（「Gitee」/「GitHub」），
        // 而不是 `HostKind` —— 否则悬停文案里会出现小写的 `gitee`。
        getLabel: (host, account) => zhCN.plugin.ribbonAvatar(getHost(host).displayName, account),
        getContainer: () => (state.attached ? state.container.asContainer() : null),
        onClick: options.onClick,
    });

    return { state, avatar, store };
}

/**
 * 让内部那条异步链跑完。
 *
 * 现在是「读盘 → 校验 → 下载 → 写盘 → 渲染」四五个 await，原来的两个微任务
 * 已经不够；多转几轮仍然是纯微任务，不占用真实时间。
 */
async function flush(): Promise<void> {
    for (let index = 0; index < 20; index += 1) {
        await Promise.resolve();
    }
}

describe("findRibbonContainer", () => {
    /**
     * ⚠ 这一组用例的假 `document` 是**按选择器点名给节点**的，所以它验不了
     * 「选择器写对了没有」—— 那要靠下面的 `mod-primary` / `mod-left` 两条
     * 分别覆盖。2026-10-06 就是因为只按 1.13 的 `mod-left` 写，升级到 1.14 之后
     * 四个选择器全部落空、头像静默消失（见 `findRibbonContainer` 的说明）。
     */
    it("1.14+：优先选功能区底部那一组（.mod-primary）", () => {
        const bottom = new FakeEl("div", "side-dock-settings");
        const whole = new FakeEl("div", "workspace-ribbon side-dock-ribbon mod-primary");
        const { root } = createRoot({
            ".workspace-ribbon.mod-primary .side-dock-settings": bottom,
            ".workspace-ribbon.mod-primary": whole,
            ".workspace-ribbon .side-dock-settings": bottom,
        });

        // 挂进「底部那一组」而不是整个功能区：`.side-dock-settings` 自带
        // `margin-top: auto`（app.css），挂进它才会被推到最底部；直接挂到功能区
        // 上再加一个 auto 边距会与它**平分**剩余空间，把设置齿轮顶到中间。
        expect(findRibbonContainer(root)).toBe(bottom.asContainer());
    });

    it("1.13 及以前：同一处用的是 .mod-left（旧类名也要认）", () => {
        const bottom = new FakeEl("div", "side-dock-settings");
        const { root } = createRoot({
            ".workspace-ribbon.mod-left .side-dock-settings": bottom,
        });

        expect(findRibbonContainer(root)).toBe(bottom.asContainer());
    });

    it("两个修饰类都没有时，靠不依赖版本的那条兜底命中", () => {
        // 这条是真正扛住「Obsidian 又改了类名」的：只要 `.side-dock-settings`
        // 还在功能区里，头像就挂得上（只有左/主功能区才有这一组）。
        const bottom = new FakeEl("div", "side-dock-settings");
        const { root, asked } = createRoot({
            ".workspace-ribbon .side-dock-settings": bottom,
        });

        expect(findRibbonContainer(root)).toBe(bottom.asContainer());
        expect(asked).toContain(".workspace-ribbon .side-dock-settings");
    });

    it("桌面端没有功能区时退到移动端抽屉那一组", () => {
        const drawer = new FakeEl("div", "side-dock-settings");
        const { root, asked } = createRoot({
            ".workspace-drawer-ribbon .side-dock-settings": drawer,
        });

        expect(findRibbonContainer(root)).toBe(drawer.asContainer());
        // 手机上没有 `.workspace-ribbon` —— 前面几条选择器都要先试过、且都不能抛错。
        expect(asked).toContain(".workspace-ribbon.mod-primary .side-dock-settings");
        expect(asked).toContain(".workspace-ribbon.mod-left .side-dock-settings");
        expect(asked).toContain(".workspace-drawer-ribbon .side-dock-settings");
    });

    it("内部结构变了时退到整个功能区（至少还看得见）", () => {
        const ribbon = new FakeEl("div", "workspace-ribbon mod-primary");
        const { root } = createRoot({ ".workspace-ribbon.mod-primary": ribbon });

        expect(findRibbonContainer(root)).toBe(ribbon.asContainer());
    });

    it("连修饰类都没有时也能退到整个功能区", () => {
        const ribbon = new FakeEl("div", "workspace-ribbon");
        const { root } = createRoot({ ".workspace-ribbon": ribbon });

        expect(findRibbonContainer(root)).toBe(ribbon.asContainer());
    });

    it("什么都没有时返回 null（由调用方等下一次 apply）", () => {
        const { root } = createRoot({});

        expect(findRibbonContainer(root)).toBeNull();
    });
});

describe("RibbonAvatar · 什么时候画", () => {
    it("开关关着时什么都不做：不发请求、不建节点", async () => {
        const { state, avatar } = createHarness({ enabled: false, token: "tok" });

        avatar.apply();
        await flush();

        expect(state.lookup).not.toHaveBeenCalled();
        expect(state.container.children).toHaveLength(0);
    });

    it("开关开着但没配 Gitee 令牌时同样不发请求", async () => {
        // 匿名问 `/v5/user` 只有 401（实测），而匿名配额实测极低 ——
        // 所以这里**一个请求都不发**，而不是"发了失败再隐藏"。
        const { state, avatar } = createHarness({ enabled: true, token: undefined });

        avatar.apply();
        await flush();

        expect(state.lookup).not.toHaveBeenCalled();
        expect(state.container.children).toHaveLength(0);
    });

    it("空白令牌算没配（与 SecretStore 的口径一致）", async () => {
        const { state, avatar } = createHarness({ enabled: true, token: "   " });

        avatar.apply();
        await flush();

        expect(state.lookup).not.toHaveBeenCalled();
    });

    it("有令牌时把圆形头像挂到容器**最后**（底部）", async () => {
        const { state, avatar } = createHarness({ token: "tok" });
        // 容器里先放一个"设置齿轮"，模拟真实的功能区底部那一组。
        const gear = new FakeEl("div", "side-dock-ribbon-action");
        state.container.appendChild(gear);

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(2);
        const image = state.container.children[1]!;
        expect(image).not.toBe(gear);
        expect(image.tagName).toBe("img");
        expect(image.cls).toBe("obsync-ribbon-avatar");
        // 真正给 <img> 的是本地副本的 data URL —— 离线时不需要再发一次图片请求。
        expect(image.attrs.src).toBe(`data:image/png;base64,${NEW_BASE64}`);
        expect(state.stored.get("gitee")?.avatarUrl).toBe(AVATAR_URL);
        // 不带来源信息地把请求发出去（这张图是公开的，没有理由告诉图床是谁在看）。
        expect(image.attrs.referrerpolicy).toBe("no-referrer");
    });

    it("alt / 悬停文案带账号名 —— 这句话回答「这是谁」（点击动作另见下面一组）", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();

        const image = state.container.children[0]!;
        expect(image.attrs.alt).toBe(zhCN.plugin.ribbonAvatar("Gitee", "sofqi"));
        expect(image.attrs.title).toBe(image.attrs.alt);
    });

    it("接口没给账号名时用兜底文案，而不是一句带 undefined 的残句", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            lookup: async () => ({ valid: true, avatarUrl: AVATAR_URL }),
        });

        avatar.apply();
        await flush();

        expect(state.container.children[0]!.attrs.alt).toBe(zhCN.plugin.ribbonAvatar("Gitee", ""));
        expect(state.container.children[0]!.attrs.alt).not.toContain("undefined");
    });

    it("请求失败（网络问题）不抛错、也不画", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            lookup: async () => {
                throw new Error("offline");
            },
        });

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(0);
    });

    it("令牌无效 / 响应里没有头像地址时不画", async () => {
        for (const info of [{ valid: false }, { valid: true }, { valid: false, account: "sofqi" }]) {
            const { state, avatar } = createHarness({ token: "tok", lookup: async () => info });

            avatar.apply();
            await flush();

            expect(state.container.children, JSON.stringify(info)).toHaveLength(0);
        }
    });
});

describe("RibbonAvatar · 重复调用与变化", () => {
    it("同一令牌重复 apply 只问一次接口，也不会插出第二张", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();
        avatar.apply();
        avatar.apply();
        await flush();

        expect(state.lookup).toHaveBeenCalledTimes(1);
        expect(state.container.children).toHaveLength(1);
    });

    it("并发调用只发一次请求（apply 会被布局事件反复触发）", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        avatar.apply();
        avatar.apply();
        await flush();

        expect(state.lookup).toHaveBeenCalledTimes(1);
    });

    it("校验失败后不反复请求：布局变化每次都问一次接口，离线时会排成一条长队", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            lookup: async () => {
                throw new Error("offline");
            },
        });

        avatar.apply();
        await flush();
        expect(state.lookup).toHaveBeenCalledTimes(1);
        expect(state.container.children).toHaveLength(0);

        avatar.apply();
        avatar.apply();
        await flush();

        // 这一个身份本次会话已经校验过；要再试就换令牌 / 换平台 / 重载插件。
        expect(state.lookup).toHaveBeenCalledTimes(1);
    });

    it("换了令牌会用新地址重画（不是一直用缓存）", async () => {
        const { state, avatar } = createHarness({
            token: "a",
            lookup: async (token) => ({
                valid: true,
                account: token,
                avatarUrl: `https://foruda.gitee.com/avatar/${token}.png`,
            }),
        });

        avatar.apply();
        await flush();
        expect(state.stored.get("gitee")?.avatarUrl).toContain("/a.png");

        state.tokens.gitee = "b";
        avatar.apply();
        await flush();

        expect(state.lookup).toHaveBeenLastCalledWith("gitee", "b");
        expect(state.container.children).toHaveLength(1);
        expect(state.stored.get("gitee")?.avatarUrl).toContain("/b.png");
    });

    /**
     * 换平台（2026-10-06 新增的「使用 Gitee 头像」开关）。
     *
     * 拆出这个开关的意义就是「能换」—— 所以这一组钉的是「真的换了」：
     * 重新解析、画新平台的图、悬停文案也跟着换平台说。
     */
    it("换了平台会用新平台重画（不是一直用缓存）", async () => {
        const { state, avatar } = createHarness({
            token: "gitee-token",
            lookup: async (token) => ({
                valid: true,
                account: token,
                avatarUrl: `https://cdn.example.com/${token}.png`,
            }),
        });

        avatar.apply();
        await flush();
        expect(state.stored.get("gitee")?.avatarUrl).toContain("gitee-token.png");
        expect(state.container.children[0]!.attrs.alt).toContain("Gitee");

        // 用户在设置页把「使用 Gitee 头像」关掉 → 换成 GitHub。
        state.host = "github";
        state.tokens.github = "gh-token";
        avatar.apply();
        await flush();

        expect(state.lookup).toHaveBeenLastCalledWith("github", "gh-token");
        expect(state.container.children).toHaveLength(1);
        expect(state.stored.get("github")?.avatarUrl).toContain("gh-token.png");
        // 悬停文案跟着换平台说 —— 不然「这是谁」那句话就骗人了。
        expect(state.container.children[0]!.attrs.alt).toContain("GitHub");
    });

    it("两个平台恰好存了同一串令牌时，换平台仍然重新解析（身份键含平台）", async () => {
        // 只按令牌认身份的话，切平台会直接把上一张头像当成新平台的画上去 ——
        // 而那种错没有任何报错，只是「头像不对」。
        const { state, avatar } = createHarness({ token: "same" });

        avatar.apply();
        await flush();
        expect(state.lookup).toHaveBeenCalledTimes(1);

        state.host = "github";
        state.tokens.github = "same";
        avatar.apply();
        await flush();

        expect(state.lookup).toHaveBeenCalledTimes(2);
        expect(state.lookup).toHaveBeenLastCalledWith("github", "same");
    });

    it("换到**没配令牌**的平台时把头像摘掉（不拿旧平台的图顶着）", async () => {
        const { state, avatar } = createHarness({ token: "gitee-token" });

        avatar.apply();
        await flush();
        expect(state.container.children).toHaveLength(1);

        // GitHub 没配令牌 —— 屏幕上不该留着 Gitee 那张。
        state.host = "github";
        avatar.apply();

        expect(state.container.children).toHaveLength(0);
    });

    it("**过期的响应不画上去**：请求还没回来时用户换了令牌", async () => {
        const pending = new Map<string, (info: TokenInfo) => void>();
        const { state, avatar } = createHarness({
            token: "a",
            lookup: (token) =>
                new Promise<TokenInfo>((resolve) => {
                    pending.set(token, resolve);
                }),
        });

        avatar.apply();
        // 现在会先读一次本地缓存，再走到 lookup；先让两次请求都挂上。
        await flush();
        state.tokens.gitee = "b";
        avatar.apply();
        await flush();

        // 先回来的偏偏是**旧令牌**那一次 —— 它必须被丢掉。
        pending.get("a")!({ valid: true, account: "a", avatarUrl: "https://x/a.png" });
        await flush();
        expect(state.container.children).toHaveLength(0);

        pending.get("b")!({ valid: true, account: "b", avatarUrl: "https://x/b.png" });
        await flush();
        expect(state.container.children).toHaveLength(1);
        expect(state.stored.get("gitee")?.avatarUrl).toBe("https://x/b.png");
    });

    it("请求期间把开关关掉：结果回来时不再画", async () => {
        let release: ((info: TokenInfo) => void) | undefined;
        const { state, avatar } = createHarness({
            token: "tok",
            lookup: () =>
                new Promise<TokenInfo>((resolve) => {
                    release = resolve;
                }),
        });

        avatar.apply();
        await flush(); // 等读盘完成、lookup 挂上
        state.enabled = false;
        release!({ valid: true, account: "sofqi", avatarUrl: AVATAR_URL });
        await flush();

        expect(state.container.children).toHaveLength(0);
    });

    it("清掉令牌后 apply 会把节点摘掉", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();
        expect(state.container.children).toHaveLength(1);

        state.tokens.gitee = undefined;
        avatar.apply();

        expect(state.container.children).toHaveLength(0);
    });

    it("功能区被重建后重新挂回去，而不是又造一张", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();
        const image = state.container.children[0]!;

        // 模拟 Obsidian 重建布局：旧容器被清空，新容器就位。
        image.parentElement = null;
        state.container.children.length = 0;
        state.container = new FakeEl("div", "side-dock-settings");

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(1);
        expect(state.container.children[0]).toBe(image);
        // 不会再问一次接口 —— 缓存还在。
        expect(state.lookup).toHaveBeenCalledTimes(1);
    });

    it("功能区还找不到时先不画，等下一次 apply（布局就绪）再挂上", async () => {
        const { state, avatar } = createHarness({ token: "tok" });
        state.attached = false;

        avatar.apply();
        await flush();
        expect(state.container.children).toHaveLength(0);

        state.attached = true;
        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(1);
        // 缓存命中：布局晚到不该多花一次 API 配额。
        expect(state.lookup).toHaveBeenCalledTimes(1);
    });

    it("destroy() 摘掉节点并清缓存（插件卸载/禁用）", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();
        avatar.destroy();

        expect(state.container.children).toHaveLength(0);

        // 磁盘副本不动 —— 下次插件加载（新实例）还要靠它离线显示。
        expect(state.stored.get("gitee")?.avatarUrl).toBe(AVATAR_URL);
        // 这个实例已经死了：再 apply 既不请求也不挂节点，免得卸载后头像又冒出来。
        avatar.apply();
        await flush();
        expect(state.lookup).toHaveBeenCalledTimes(1);
        expect(state.container.children).toHaveLength(0);
    });

    it("卸载时图片还在下载：结果回来也不再往功能区挂节点", async () => {
        let release: ((image: AvatarImage) => void) | undefined;
        const { state, avatar } = createHarness({
            token: "tok",
            download: () =>
                new Promise<AvatarImage>((resolve) => {
                    release = resolve;
                }),
        });

        avatar.apply();
        await flush(); // 读盘、校验都过了，卡在下载上
        expect(state.container.children).toHaveLength(0);

        avatar.destroy();
        release!({ bytes: NEW_BYTES, mime: "image/png" });
        await flush();

        expect(state.container.children).toHaveLength(0);
    });
});

/**
 * 头像可点开设置（2026-10-09 用户要求）。
 *
 * 原话：「将功能区展示的用户头像做成可点击的……点击后打开设置窗口，
 * 跳转插件通用设置页」。这里钉三件事：**监听挂上了**、**点它真的走到那个
 * 动作**、**重复渲染不会挂出第二份监听**（节点不会被重建，但 `apply()` 会被
 * 反复调用 —— 挂两次的话点一下会开两次设置窗）。
 *
 * 「打开设置窗口并停靠通用页」那半条链子（`openGeneral()` → `app.setting`）
 * 在 `settingsTabRender.test.ts` 与 `pluginBoot.test.ts` 里验。
 */
describe("RibbonAvatar · 可点开设置", () => {
    it("传了 onClick 时挂上点击监听，点它就调用", async () => {
        const opened = vi.fn();
        const { state, avatar } = createHarness({ token: "tok", onClick: opened });

        avatar.apply();
        await flush();
        const image = state.container.children[0]!;

        expect(image.handlers).toHaveLength(1);
        image.click();
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it("重复 apply / 重画不会挂出第二份监听（点一下只开一次设置窗）", async () => {
        const opened = vi.fn();
        const { state, avatar } = createHarness({ token: "tok", onClick: opened });

        avatar.apply();
        await flush();
        avatar.apply();
        avatar.apply();
        await flush();

        const image = state.container.children[0]!;
        expect(image.handlers).toHaveLength(1);
        image.click();
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it("功能区被重建后重新挂回去，监听还在（节点是同一个）", async () => {
        const opened = vi.fn();
        const { state, avatar } = createHarness({ token: "tok", onClick: opened });

        avatar.apply();
        await flush();
        const image = state.container.children[0]!;

        image.parentElement = null;
        state.container.children.length = 0;
        state.container = new FakeEl("div", "side-dock-settings");
        avatar.apply();
        await flush();

        expect(state.container.children[0]).toBe(image);
        image.click();
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it("没传 onClick 时不挂监听（头像保持不可点，不抛错）", async () => {
        const { state, avatar } = createHarness({ token: "tok" });

        avatar.apply();
        await flush();

        const image = state.container.children[0]!;
        expect(image.handlers).toHaveLength(0);
        expect(() => image.click()).not.toThrow();
    });
});

/**
 * 本地副本 / 更新校验（2026-11-26 用户要求）。
 *
 * 原话：「头像保存在本地，这样就算离线也能显示；每次加载插件时只对头像作
 * 更新校验，没有新的头像则沿用旧的」。这一组钉的是「先画旧的，再去问新的，
 * 问不到也不把旧的摘掉」这条顺序 —— 它决定了离线时功能区上有没有那张脸。
 */
describe("RibbonAvatar · 本地副本与更新校验", () => {
    it("冷启动先画本地缓存，不等接口返回（接口永远卡住也算）", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            cached: { gitee: cachedAvatar("gitee", "tok") },
            lookup: () => new Promise<TokenInfo>(() => undefined),
        });

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(1);
        expect(state.container.children[0]!.attrs.src).toBe(`data:image/png;base64,${OLD_BASE64}`);
    });

    it("校验失败时沿用旧图，且反复 apply 不再发请求", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            cached: { gitee: cachedAvatar("gitee", "tok") },
            lookup: async () => {
                throw new Error("offline");
            },
        });

        avatar.apply();
        await flush();
        expect(state.container.children[0]!.attrs.src).toBe(`data:image/png;base64,${OLD_BASE64}`);

        avatar.apply();
        avatar.apply();
        await flush();
        expect(state.lookup).toHaveBeenCalledTimes(1);
        expect(state.container.children).toHaveLength(1);
    });

    it("接口返回同一个地址 → 沿用旧图，不下载、不写盘", async () => {
        const { state, avatar, store } = createHarness({
            token: "tok",
            cached: { gitee: cachedAvatar("gitee", "tok") },
        });

        avatar.apply();
        await flush();

        expect(state.container.children[0]!.attrs.src).toBe(`data:image/png;base64,${OLD_BASE64}`);
        expect(state.download).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
    });

    it("接口给了新地址 → 下载新图、写盘并重画", async () => {
        const newUrl = "https://cdn.example.com/new-avatar.jpg";
        const { state, avatar, store } = createHarness({
            token: "tok",
            cached: { gitee: cachedAvatar("gitee", "tok") },
            lookup: async () => ({ valid: true, account: "sofqi", avatarUrl: newUrl }),
            download: async () => ({ bytes: NEW_BYTES, mime: "image/jpeg" }),
        });

        avatar.apply();
        await flush();

        expect(state.downloads).toEqual([newUrl]);
        expect(store.write).toHaveBeenCalledTimes(1);
        expect(state.stored.get("gitee")).toEqual({
            tokenFingerprint: tokenFingerprint("gitee", "tok"),
            avatarUrl: newUrl,
            account: "sofqi",
            mime: "image/jpeg",
            base64: NEW_BASE64,
        });
        expect(state.container.children[0]!.attrs.src).toBe(`data:image/jpeg;base64,${NEW_BASE64}`);
    });

    it("新图下载失败时留着旧图（没有新头像就沿用旧的）", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            cached: { gitee: cachedAvatar("gitee", "tok") },
            lookup: async () => ({
                valid: true,
                account: "sofqi",
                avatarUrl: "https://cdn.example.com/unreachable.png",
            }),
            download: async () => {
                throw new Error("network down");
            },
        });

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(1);
        expect(state.container.children[0]!.attrs.src).toBe(`data:image/png;base64,${OLD_BASE64}`);
        expect(state.stored.get("gitee")?.avatarUrl).toBe(AVATAR_URL);
    });

    it("令牌换了：旧副本不属于新账号，不会被当成新头像画上去", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            // 这份缓存属于另一个令牌，本次启动时不该沿用。
            cached: {
                gitee: cachedAvatar("gitee", "another-token", { base64: "T0xE" }),
            },
            lookup: async (token) => ({
                valid: true,
                account: token,
                avatarUrl: `https://cdn.example.com/${token}.png`,
            }),
        });

        avatar.apply();
        await flush();

        expect(state.container.children[0]!.attrs.src).not.toContain("T0xE");
        expect(state.stored.get("gitee")?.avatarUrl).toContain("tok.png");
    });

    it("写盘失败也照常显示（图已经在内存里，不必为落盘失败留一片空白）", async () => {
        const { state, avatar, store } = createHarness({ token: "tok" });
        store.write.mockRejectedValueOnce(new Error("disk full"));

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(1);
        expect(state.container.children[0]!.attrs.src).toBe(`data:image/png;base64,${NEW_BASE64}`);
    });

    it("首次启动没有缓存且离线时不画图，也不抛错", async () => {
        const { state, avatar } = createHarness({
            token: "tok",
            lookup: async () => {
                throw new Error("offline");
            },
        });

        avatar.apply();
        await flush();

        expect(state.container.children).toHaveLength(0);
        expect(state.download).not.toHaveBeenCalled();
    });
});

describe("avatarCache · 本地文件", () => {
    it("bytesToBase64 按 RFC 4648 补齐（含不足三字节的尾部）", () => {
        expect(bytesToBase64(new Uint8Array([0, 1, 2]))).toBe("AAEC");
        expect(bytesToBase64(new Uint8Array([255]))).toBe("/w==");
        expect(bytesToBase64(new Uint8Array([]))).toBe("");
    });

    it("tokenFingerprint 稳定、区分令牌，且不把令牌明文带进去", () => {
        const first = tokenFingerprint("gitee", "a-secret-token");
        expect(tokenFingerprint("gitee", "a-secret-token")).toBe(first);
        expect(tokenFingerprint("github", "a-secret-token")).not.toBe(first);
        expect(tokenFingerprint("gitee", "other-token")).not.toBe(first);
        expect(first).not.toContain("secret");
    });

    it("createAvatarStore 写到插件目录，损坏的文件当作没有缓存", async () => {
        const files = new Map<string, string>();
        const adapter = {
            exists: async (path: string) => files.has(path),
            read: async (path: string) => files.get(path) ?? "",
            write: async (path: string, content: string) => {
                files.set(path, content);
            },
            mkdir: async (_path: string) => undefined,
        };
        const app = {
            vault: { configDir: ".obsidian", adapter },
        } as unknown as App;
        const store = createAvatarStore(app, "ob-sync");
        const path = ".obsidian/plugins/ob-sync/avatar-cache/gitee.json";
        const entry = cachedAvatar("gitee", "tok");

        expect(await store.read("gitee")).toBeNull();
        await store.write("gitee", entry);
        expect(files.has(path)).toBe(true);
        expect(await store.read("gitee")).toEqual(entry);

        files.set(path, "{broken json");
        expect(await store.read("gitee")).toBeNull();
    });
});
