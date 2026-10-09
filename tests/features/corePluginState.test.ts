import { describe, expect, it } from "vitest";
import { corePluginEnabled } from "../../src/features/sync/corePluginState";

/**
 * 读 `core-plugins.json` 里某个核心插件的启用状态。
 *
 * 用例的重点全在「**读不出来时不能猜**」这一侧：这个函数唯一的用途是决定
 * 要不要给用户弹一条「你的文件恢复是关的，高频保护没兜住」的提示。
 * 把「不知道」判成「关着」，用户会看到一条凭空捏造的警告；判成「开着」，
 * 该提示的时候又不提示。两种错都让这条提示失去意义。
 */
describe("corePluginEnabled", () => {
    it("认布尔形状", () => {
        expect(corePluginEnabled('{"file-recovery":false}', "file-recovery")).toBe(false);
        expect(corePluginEnabled('{"file-recovery":true}', "file-recovery")).toBe(true);
    });

    it("也认对象形状（`{ enabled: true }`）—— 新版会这么写", () => {
        expect(corePluginEnabled('{"file-recovery":{"enabled":false}}', "file-recovery")).toBe(false);
        expect(corePluginEnabled('{"file-recovery":{"enabled":true}}', "file-recovery")).toBe(true);
    });

    it("**没有这一项**时返回 undefined —— 老版本会省略默认启用的项", () => {
        // 「键不存在」与「明确关着」是两件事：前者不能提示，猜错了就是在编。
        expect(corePluginEnabled('{"workspaces":true}', "file-recovery")).toBeUndefined();
    });

    it("JSON 坏了返回 undefined，而不是抛错", () => {
        // 这个文件是别的程序写的，读到一半被截断是可能的；抛错会把设置页整页打挂。
        expect(corePluginEnabled("{ not json", "file-recovery")).toBeUndefined();
        expect(corePluginEnabled("", "file-recovery")).toBeUndefined();
    });

    it("顶层不是对象时返回 undefined", () => {
        expect(corePluginEnabled("null", "file-recovery")).toBeUndefined();
        expect(corePluginEnabled("[]", "file-recovery")).toBeUndefined();
        expect(corePluginEnabled('"file-recovery"', "file-recovery")).toBeUndefined();
        expect(corePluginEnabled("true", "file-recovery")).toBeUndefined();
    });

    it("对象形状但没写 enabled 时返回 undefined", () => {
        expect(corePluginEnabled('{"file-recovery":{}}', "file-recovery")).toBeUndefined();
        expect(corePluginEnabled('{"file-recovery":{"enabled":"yes"}}', "file-recovery")).toBeUndefined();
    });

    it("只认传进来的那个 id", () => {
        const json = '{"workspaces":true,"file-recovery":false}';
        expect(corePluginEnabled(json, "workspaces")).toBe(true);
        expect(corePluginEnabled(json, "file-recovery")).toBe(false);
    });
});
