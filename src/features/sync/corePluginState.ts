/**
 * 读 Obsidian **核心插件**的启用状态。
 *
 * ## 为什么读文件而不是问 `app`
 *
 * Obsidian 内部确实有 `app.internalPlugins.getEnabledPluginById(id)`（app 源码里
 * `file-recovery` 就是这么查的），但那是**非公开 API** —— 社区审核会盯，而且它没有
 * 类型声明。`core-plugins.json` 是 vault 里的**普通文件**（`${configDir}/core-plugins.json`），
 * 读它没有任何 API 兼容问题。
 *
 * ## 为什么只读、不写
 *
 * 关掉/打开别人的核心插件不是本插件的职责：改了那个文件**要重启 Obsidian 才生效**，
 * 而且用户会以为是我们动了手脚。这里只回答「它现在是开着还是关着」，
 * 然后把「去哪开」写进提示里。
 *
 * ## 为什么返回 `boolean | undefined` 而不是 `boolean`
 *
 * 「读不出来」（文件不在、JSON 坏了、那个键压根没列出来）与「明确关着」是两件事。
 * 前者**不能提示** —— 提示的前提是「我们知道它关着」，猜错了就是在编。老版本
 * Obsidian 的 `core-plugins.json` 会省略默认启用的项，所以「键不存在」是真实存在的形状。
 */

/** `core-plugins.json` 里那一项的形状。 */
type CorePluginFlag = boolean | { enabled?: boolean } | undefined;

/**
 * 从 `core-plugins.json` 的内容里取某个核心插件的启用状态。
 *
 * @returns `true` / `false`；**读不出来或没有这一项时返回 `undefined`**。
 */
export function corePluginEnabled(configJson: string, id: string): boolean | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(configJson);
    } catch {
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;

    const flag = (parsed as Record<string, CorePluginFlag>)[id];
    if (typeof flag === "boolean") return flag;
    // 新版把这一项写成对象（`{ "enabled": true }`）—— 两种形状都认。
    if (typeof flag === "object" && flag !== null && typeof flag.enabled === "boolean") {
        return flag.enabled;
    }
    return undefined;
}
