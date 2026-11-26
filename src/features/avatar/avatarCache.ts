import { normalizePath, type App } from "obsidian";
import { logger } from "../../core/logger";
import type { HostKind } from "../../host/types";

/**
 * 功能区头像的**本地副本**。
 *
 * 2026-11-26 用户要求：「头像保存在本地，离线也能显示；每次加载插件时只做
 * 一次更新校验，没有新头像就沿用旧的」。所以这一层只管把一张图（连同它
 * 的远端地址与令牌指纹）落在插件自己的目录里，不碰网络、不碰 DOM。
 *
 * ## 为什么每个平台一个文件，而不按令牌分文件
 *
 * 令牌是机密，**不能出现在文件名或文件内容里**。这里只存一个单向指纹
 * （`tokenFingerprint`）：换令牌后指纹不匹配，旧图就不会被误当成新账号的
 * 头像画上去。每个平台只留最新一份，既不会有缓存无限增长的问题，也够用
 * —— 用户切回旧平台时，那一份还在。
 *
 * ## 为什么存 base64 文本而不是二进制
 *
 * `DataAdapter.read/write` 是这里唯一 guaranteed 两端都支持的读写口子；
 * `readBinary/writeBinary` 在部分版本的移动端实现并不一致。头像通常只有
 * 几 KB 到几十 KB，base64 多出来的 1/3 完全可以接受，换来的是「读到就是
 * 一个字符串」，拼 `data:` URL 时不需要 FileReader，测试里也不需要blob。
 *
 * 文件放在 `{configDir}/plugins/{pluginId}/avatar-cache/{host}.json`，也就是
 * 插件自己的目录里：升级插件只会覆盖 main.js / manifest.json / styles.css，
 * 不会动它；重装插件时它跟着插件目录一起清掉，符合预期。
 */

/** 一个平台最近一次成功缓存的头像。 */
export interface StoredAvatar {
    /** 令牌指纹：仅用于判断这份缓存是否还属于当前令牌。 */
    tokenFingerprint: string;
    /** 头像的远端地址。更新校验就是拿接口返回的地址与它比对。 */
    avatarUrl: string;
    /** 账号名（接口可能没给）。用于悬停文案。 */
    account?: string;
    /** 图片 MIME，data URL 需要。 */
    mime: string;
    /** 图片字节的 base64。 */
    base64: string;
}

/** 头像缓存的读写口子。装配层给的是磁盘实现，测试里给内存实现。 */
export interface AvatarStore {
    read(host: HostKind): Promise<StoredAvatar | null>;
    write(host: HostKind, avatar: StoredAvatar): Promise<void>;
}

/**
 * FNV-1a 摘要。两次不同种子拼成 16 位十六进制：令牌不会故意构造碰撞，
 * 这里要防的是「换了令牌却显示上一张脸」这种无声的错误，不是密码学攻击。
 */
function fnv1a(input: string, seed: number): number {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/** 平台 + 令牌的指纹（令牌本身不落盘，见文件头）。 */
export function tokenFingerprint(host: HostKind, token: string): string {
    const value = `${host}\u0000${token}`;
    const first = fnv1a(value, 0x811c9dc5).toString(16).padStart(8, "0");
    const second = fnv1a(value, 0x9e3779b9).toString(16).padStart(8, "0");
    return `${first}${second}`;
}

/** 字节 → base64。手写而非 `btoa`/`Buffer`：移动端 JS 引擎与 Node 都能跑。 */
export function bytesToBase64(bytes: Uint8Array): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index] ?? 0;
        const second = bytes[index + 1];
        const third = bytes[index + 2];
        out += alphabet[first >> 2];
        out += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
        out += second === undefined ? "=" : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
        out += third === undefined ? "=" : alphabet[third & 0x3f];
    }
    return out;
}

/** 图片字节 → 可以直接给 `<img src>` 的 data URL。 */
export function imageDataUrl(mime: string, base64: string): string {
    return `data:${mime};base64,${base64}`;
}

/** 缓存里的图片 → data URL。 */
export function avatarDataUrl(avatar: StoredAvatar): string {
    return imageDataUrl(avatar.mime, avatar.base64);
}

/** 损坏/旧格式的缓存一律当作没有，不让坏数据把 `<img>` 变成破图。 */
function isStoredAvatar(value: unknown): value is StoredAvatar {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<StoredAvatar>;
    return (
        typeof item.tokenFingerprint === "string" &&
        typeof item.avatarUrl === "string" &&
        typeof item.mime === "string" &&
        typeof item.base64 === "string" &&
        item.avatarUrl.length > 0 &&
        item.base64.length > 0
    );
}

/** 基于 Obsidian 文件适配器的真实存储。 */
export function createAvatarStore(app: App, pluginId: string): AvatarStore {
    const folder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/avatar-cache`);
    const pathFor = (host: HostKind): string => normalizePath(`${folder}/${host}.json`);

    return {
        async read(host) {
            const path = pathFor(host);
            try {
                if (!(await app.vault.adapter.exists(path))) return null;
                const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
                return isStoredAvatar(parsed) ? parsed : null;
            } catch (err) {
                // 读缓存失败不是错误：下一次更新校验成功时会重写它。
                logger.debug("could not read cached ribbon avatar", err);
                return null;
            }
        },

        async write(host, avatar) {
            if (!(await app.vault.adapter.exists(folder))) {
                await app.vault.adapter.mkdir(folder);
            }
            await app.vault.adapter.write(pathFor(host), JSON.stringify(avatar));
        },
    };
}
