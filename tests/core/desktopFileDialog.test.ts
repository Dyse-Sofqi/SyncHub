import { afterEach, describe, expect, it } from "vitest";
import { pickFile, supportsFileDialog } from "../../src/core/desktopFileDialog";

/**
 * 桌面文件对话框（`core/desktopFileDialog.ts`）。
 *
 * 它是设置页那个「浏览…」按钮的全部后端，而**它借的是非公开能力**：
 * Obsidian 的公开 API 里没有文件对话框，这里走的是 `window.electron.remote.dialog`
 * —— Obsidian 自己开文件框用的就是它。既然借的是别的东西，**每一层缺失都验一遍**：
 * 移动端（没有 `window.electron`）、将来 Electron 换掉实现（只有同步版 / 什么都没有）、
 * 用户在对话框里点取消、以及对话框自己抛错。
 *
 * 这几种情况全都必须**安静地返回 `undefined`**：按钮旁边一直留着可以手输的输入框，
 * 为了一个锦上添花的按钮弹一次红色提示比什么都不做更烦人。
 */

interface FakeDialog {
    showOpenDialog?: (options: unknown) => Promise<unknown>;
    showOpenDialogSync?: (options: unknown) => string[] | undefined;
}

function install(dialog: FakeDialog | undefined): void {
    const target = globalThis as unknown as { window: { electron?: unknown } };
    if (dialog === undefined) {
        delete (target.window as { electron?: unknown }).electron;
        return;
    }
    target.window.electron = { remote: { dialog } };
}

afterEach(() => {
    install(undefined);
});

describe("desktopFileDialog", () => {
    it("没有 window.electron（移动端）时：不支持，且 pickFile 安静返回 undefined", async () => {
        install(undefined);
        expect(supportsFileDialog()).toBe(false);
        await expect(pickFile({})).resolves.toBeUndefined();
    });

    it("electron 在、但没有 dialog 时同样不支持", async () => {
        (globalThis as unknown as { window: { electron?: unknown } }).window.electron = {
            remote: {},
        };
        expect(supportsFileDialog()).toBe(false);
        await expect(pickFile({})).resolves.toBeUndefined();
    });

    it("异步版：返回选中的第一个路径", async () => {
        let seen: unknown;
        install({
            showOpenDialog: async (options) => {
                seen = options;
                return { canceled: false, filePaths: ["C:\\Git\\cmd\\git.exe"] };
            },
        });

        expect(supportsFileDialog()).toBe(true);
        await expect(pickFile({ title: "挑一个" })).resolves.toBe("C:\\Git\\cmd\\git.exe");
        expect(seen).toEqual({ title: "挑一个" });
    });

    it("用户取消 → undefined", async () => {
        install({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }) });
        await expect(pickFile({})).resolves.toBeUndefined();
    });

    it("只有同步版（Obsidian 自己用的那个）时也走得通", async () => {
        install({ showOpenDialogSync: () => ["D:\\bin\\git.exe"] });
        await expect(pickFile({})).resolves.toBe("D:\\bin\\git.exe");
    });

    it("同步版返回空数组（取消）→ undefined", async () => {
        install({ showOpenDialogSync: () => [] });
        await expect(pickFile({})).resolves.toBeUndefined();
    });

    it("对话框抛错时不往外抛", async () => {
        install({
            showOpenDialog: async () => {
                throw new Error("remote is gone");
            },
        });
        await expect(pickFile({})).resolves.toBeUndefined();
    });
});
