import { beforeEach, describe, expect, it } from "vitest";
import { __setLanguage } from "../stubs/obsidian";
import { getTranslations, resolveLocale } from "../../src/core/i18n";
import { en } from "../../src/core/i18n/locales/en";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";

describe("resolveLocale", () => {
    it("把各种中文变体归一到 zh-cn", () => {
        for (const value of ["zh", "zh-CN", "zh_CN", "zh-Hans", "zh-hans", "zh-SG", "ZH"]) {
            expect(resolveLocale(value)).toBe("zh-cn");
        }
    });

    it("识别英文", () => {
        for (const value of ["en", "en-US", "en-GB", "EN"]) {
            expect(resolveLocale(value)).toBe("en");
        }
    });

    it("未知语言回退到英文", () => {
        expect(resolveLocale("fr")).toBe("en");
        expect(resolveLocale("ja")).toBe("en");
        expect(resolveLocale(undefined)).toBe("en");
        expect(resolveLocale("")).toBe("en");
    });
});

describe("getTranslations", () => {
    beforeEach(() => {
        __setLanguage("en");
    });

    it("跟随 Obsidian 的语言", () => {
        __setLanguage("zh-CN");
        expect(getTranslations().common.cancel).toBe("取消");

        __setLanguage("en-US");
        expect(getTranslations().common.cancel).toBe("Cancel");
    });

    it("未知的 Obsidian 语言回退到英文而不是崩溃", () => {
        __setLanguage("xx-YY");
        expect(getTranslations().common.cancel).toBe("Cancel");
    });

    /**
     * **没有参数**（2026-10-01）。
     *
     * 这里曾经有一个「界面语言」设置项，`getTranslations(language)` 收它的值 ——
     * 而那个设置项已经删了：界面语言一律跟随 Obsidian，留一个能与 Obsidian
     * 不一致的开关只会让「界面语言不对」变成用户自己造得出来的状态。
     * 这条用例钉的就是「只有一个来源」：函数签名不再接受任何语言。
     */
    it("不收参数（界面语言只有一个来源：Obsidian）", () => {
        expect(getTranslations).toHaveLength(0);
    });
});

describe("locale 结构一致性", () => {
    it("中英文的键结构完全一致", () => {
        // `en.ts` 用 `satisfies LocaleStrings` 做了编译期校验，
        // 这个运行时断言是它的补充 —— 顺便验证两边插值函数的参数个数一致。
        const shapeOf = (value: unknown): unknown => {
            if (typeof value === "function") {
                return `fn/${value.length}`;
            }
            if (value && typeof value === "object") {
                return Object.fromEntries(
                    Object.entries(value as Record<string, unknown>)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, child]) => [key, shapeOf(child)])
                );
            }
            return typeof value;
        };

        expect(shapeOf(en)).toEqual(shapeOf(zhCN));
    });

    it("没有空字符串翻译", () => {
        const collectEmpty = (value: unknown, path: string): string[] => {
            if (typeof value === "string") return value.trim() === "" ? [path] : [];
            if (value && typeof value === "object") {
                return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
                    collectEmpty(child, `${path}.${key}`)
                );
            }
            return [];
        };

        expect(collectEmpty(zhCN, "zhCN")).toEqual([]);
        expect(collectEmpty(en, "en")).toEqual([]);
    });
});
