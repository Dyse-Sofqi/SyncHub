import { getLanguage } from "obsidian";
import { en } from "./locales/en";
import { zhCN, type LocaleStrings } from "./locales/zh-cn";

/**
 * i18n 的解析入口。
 *
 * 与参考项目 BRAT 的方案一致（零依赖 + 编译期强制全覆盖），但有两处刻意的不同：
 *
 * 1. **规范语言是简体中文**，`LocaleStrings` 从 `zh-cn.ts` 推导，英文反向满足它。
 *    这样漏翻译会在 `pnpm typecheck` 阶段直接失败，而不是运行时静默显示英文。
 * 2. **界面语言一律跟随 Obsidian**（2026-10-01 起）。这里曾经有一个
 *    `language: "auto" | "zh-cn" | "en"` 设置项，而三态里只有 `auto` 跟得上
 *    Obsidian 的语言：选另外两个之后，用户切了 Obsidian 的语言、插件界面却
 *    还是老语言 —— 看起来像坏了，原因却藏在设置页里一个下拉中。
 *    于是那个设置项连同它的下拉一起删了，`getTranslations()` 不再收参数。
 */

export type { LocaleStrings };

/** 已实现的语言。新增语言只需在这里加一项 + 建一个 locale 文件。 */
export const LOCALES: Record<string, LocaleStrings> = {
    "zh-cn": zhCN,
    en,
};

export const FALLBACK_LOCALE = "en";

/**
 * 把任意语言标识归一化成受支持的 locale key。
 *
 * Obsidian 返回的 `getLanguage()` 可能是 `zh`、`zh-CN`、`zh-Hans` 等任意形态，
 * 这里统一小写 + 把下划线转成连字符后再匹配。
 */
export function resolveLocale(language: string | undefined): string {
    if (!language) return FALLBACK_LOCALE;

    const normalized = language.toLowerCase().replace(/_/g, "-");

    // 所有中文变体都落到简体：繁体用户读简体比读英文更顺，
    // 而维护一份独立的 zh-tw 目前不值得。
    if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-cn";

    if (normalized === "en" || normalized.startsWith("en-")) return "en";

    // 精确匹配（为将来新增语言留的路径）
    if (normalized in LOCALES) return normalized;

    return FALLBACK_LOCALE;
}

/**
 * 当前生效的界面语言（跟随 Obsidian）。
 *
 * 单独曝出来是给**日志**用的：`main.ts` 在插件加载时记一行，而「界面语言不对」
 * 这类问题一查就知道当时 Obsidian 报的是哪个语言。
 */
export function currentLocale(): string {
    return resolveLocale(getLanguage());
}

/**
 * 取出一份翻译表。
 *
 * **没有参数**：界面语言跟随 Obsidian（见文件头的说明）。想把文案换成别的语言
 * 只有一条路 —— 直接 import 那份 locale（测试就是这么做的）。
 */
export function getTranslations(): LocaleStrings {
    return LOCALES[currentLocale()] ?? LOCALES[FALLBACK_LOCALE]!;
}
