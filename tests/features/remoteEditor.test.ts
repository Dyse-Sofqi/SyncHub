import { describe, expect, it, vi } from "vitest";
import { bindRemoteInput } from "../../src/features/sync/remoteEditor";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";

/**
 * 远端地址输入框的行为（面板与设置页**共用**这一份，2026-10-04）。
 *
 * 它是从视图里抽出来的：两个入口（仓库同步面板、设置页「仓库同步」）都要「就地改地址」，
 * 各写一份的话迟早分叉，而分叉的表现是「同一个地址在一处存下去了、在另一处没有」。
 * 视图那边只验证「这一行接上了」，规则本身全在这里。
 *
 * DOM 用 `tests/setup.ts` 的替身（`inputEl.addEventListener` / `trigger` 都在）。
 */
describe("远端地址输入框", () => {
    type FakeInput = HTMLInputElement & { trigger?: (name: string, ...args: unknown[]) => void };

    function setup(currentUrl: string | undefined) {
        const input = document.createElement("input") as FakeInput;
        const calls: string[] = [];
        const host = {
            currentUrl,
            setRemoteUrl: async (url: string) => {
                calls.push(`set:${url}`);
            },
            refresh: async () => {
                calls.push("refresh");
            },
            notify: {
                success: (message: string) => calls.push(`success:${message}`),
                warn: (message: string) => calls.push(`warn:${message}`),
                reportError: (err: unknown) => calls.push(`error:${String(err)}`),
            },
            t: zhCN,
            onSaved: () => calls.push("saved"),
        };
        bindRemoteInput(input, host as never);
        return { input, calls };
    }

    it("回显当前地址（脱敏：令牌不上屏）", () => {
        const { input } = setup("https://user:secret-token@github.com/o/r.git");

        expect(input.value).not.toContain("secret-token");
        expect(input.value).toContain("github.com/o/r.git");
    });

    it("没有远端时是空框（不是假的地址）", () => {
        const { input } = setup(undefined);

        expect(input.value).toBe("");
    });

    it("失焦保存，并强制刷新（领先/落后要按新远端重算）", async () => {
        const { input, calls } = setup("https://github.com/o/old.git");

        input.value = "https://github.com/o/new.git";
        input.trigger!("blur");
        await vi.waitFor(() => expect(calls).toContain("saved"));

        expect(calls).toContain("set:https://github.com/o/new.git");
        expect(calls).toContain("refresh");
    });

    it("回车等于失焦（两条路径合一），并拦掉默认行为", async () => {
        const { input, calls } = setup("https://github.com/o/old.git");
        const prevented: string[] = [];

        input.value = "https://github.com/o/new.git";
        input.trigger!("keydown", {
            key: "Enter",
            preventDefault: () => prevented.push("prevented"),
        });
        await vi.waitFor(() => expect(calls).toContain("saved"));

        expect(calls).toContain("set:https://github.com/o/new.git");
        // 设置页的输入框里按回车不该触发别的东西（表单提交之类）
        expect(prevented).toEqual(["prevented"]);
    });

    it("没改动就什么都不做（脱敏后的回显与真实值不同，但也不该当成改动）", async () => {
        const { input, calls } = setup("https://github.com/o/r.git");

        input.trigger!("blur");
        await Promise.resolve();

        expect(calls).toEqual([]);
    });

    it("明显写错的输入被拦住：不保存、说一句、把框恢复成原样", async () => {
        const { input, calls } = setup("https://github.com/o/r.git");
        const before = input.value;

        input.value = "帮我同步一下笔记";
        input.trigger!("blur");
        await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));

        expect(calls.join(" ")).not.toContain("set:");
        expect(calls[0]).toBe(`warn:${zhCN.sync.editRemoteHint.invalid}`);
        expect(input.value).toBe(before);
    });

    it("带凭据的地址**放行但警告**（选择权留给用户），且保存后框里也脱敏", async () => {
        const { input, calls } = setup(undefined);

        input.value = "https://oauth2:TOKEN@gitee.com/o/r.git";
        input.trigger!("blur");
        await vi.waitFor(() => expect(calls).toContain("saved"));

        expect(calls).toContain("set:https://oauth2:TOKEN@gitee.com/o/r.git");
        expect(calls.join(" ")).toContain(zhCN.sync.editRemoteHint.credentials);
        // 提示与输入框都会显示在屏幕上，所以保存之后框里那份也要脱敏
        expect(input.value).not.toContain("TOKEN");
    });

    it("保存失败：报错并把框恢复成原样（不能让用户以为存下去了）", async () => {
        const input = document.createElement("input") as FakeInput;
        const calls: string[] = [];
        bindRemoteInput(input, {
            currentUrl: "https://github.com/o/r.git",
            setRemoteUrl: async () => {
                throw new Error("boom");
            },
            refresh: async () => undefined,
            notify: {
                success: (message: string) => calls.push(`success:${message}`),
                warn: (message: string) => calls.push(`warn:${message}`),
                reportError: (err: unknown) => calls.push(`error:${String(err)}`),
            },
            t: zhCN,
            onSaved: () => calls.push("saved"),
        } as never);

        const before = input.value;
        input.value = "https://github.com/o/new.git";
        input.trigger!("blur");
        await vi.waitFor(() => expect(calls.some((call) => call.startsWith("error:"))).toBe(true));

        expect(calls.join(" ")).not.toContain("success:");
        expect(input.value).toBe(before);
    });
});
