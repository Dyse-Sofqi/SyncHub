import { afterEach, describe, expect, it } from "vitest";
import type { App, TAbstractFile } from "obsidian";
import { Notice, TFolder, TFile } from "../../stubs/obsidian";
import { Notifier } from "../../../src/core/notice";
import { zhCN } from "../../../src/core/i18n/locales/zh-cn";
import { normalizeSettings, type ImageSyncSettings } from "../../../src/core/settings";
import { SecretStore } from "../../../src/core/secretStore";
import { createImageSyncModule, type ImageSyncModule } from "../../../src/features/images";
import { createFakeImageVault, type FakeImageVault } from "../../helpers/fakeImageVault";
import { createFakeR2, type FakeR2 } from "../../helpers/fakeR2";

/**
 * 改名事件（`vault.on("rename")` → `ImageSyncModule.noteRenamed`）。
 *
 * ## 报的是什么（2026-10-01）
 *
 * 用户在库里给**文件夹改名**之后：新路径被当成新图片重传、云端旧键那一份被
 * 当成「云端新增」下载回来 —— 库里出现两批同样的图片。根因是「身份 = vault
 * 路径」，而改名既没搬状态记录、也没搬云端对象（只有**面板里**的改名搬了）。
 *
 * ## 这个文件守的是「入口的边界」与「文件夹改名」
 *
 * 判定与执行的细节在 `planSync.test.ts` 的「改名」那一组里（记录跟着走、
 * 不重传、不下载回来、旧键删失败也不重复）；这里守的是三条只有在**事件入口**
 * 上才成立的事：
 *
 * 1. 文件夹改名 → Obsidian 为**每个文件**各发一次事件 → 云端各搬一次；
 * 2. 不该管的（文件夹本身、非图片、范围外）一个请求都不发；
 * 3. 「面板 + 事件」是同一次改名 → 只搬一次（去重）。
 */

const BASE: Partial<ImageSyncSettings> = {
    folders: ["images"],
    accountId: "abc123",
    bucket: "notes",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    prefix: "",
};

interface Harness {
    vault: FakeImageVault;
    r2: FakeR2;
    module: ImageSyncModule;
    configure(next: Partial<ImageSyncSettings>): void;
    /** 记一条「上次同步时两边一致」。 */
    track(path: string): void;
    /** 库里的改名：旧路径消失、新路径出现（内容与 mtime 不变）。 */
    rename(from: string, to: string): void;
    /** 模拟 Obsidian 发出 `rename`。`file` 是改名**之后**的那个文件。 */
    fireRenamed(to: string, oldPath: string): void;
    /** 所有提示的文案。 */
    messages(): string[];
}

const installed: FakeR2[] = [];

function createHarness(overrides: Partial<ImageSyncSettings> = {}): Harness {
    const vault = createFakeImageVault();
    const r2 = createFakeR2();
    r2.install();
    installed.push(r2);

    let images: Partial<ImageSyncSettings> = { ...BASE, ...overrides };

    const notifier = new Notifier({ getShowNotices: () => true, getT: () => zhCN });

    const module = createImageSyncModule({
        app: vault.app,
        notifier,
        getSettings: () => normalizeSettings({ images }),
        getT: () => zhCN,
        secretStore: new SecretStore({
            loadLocalStorage: (key: string) => (key === "obsync-token-r2" ? "secret-key" : null),
        } as unknown as App),
    });

    return {
        vault,
        r2,
        module,

        configure(next): void {
            images = { ...images, ...next };
        },

        track(path): void {
            const raw = (vault.localStorage.get("obsync-image-state") ?? {
                version: 1,
                entries: {},
            }) as { version: number; entries: Record<string, unknown> };
            raw.entries[path] = { size: 10, mtime: 5, etag: "etag-a", syncedAt: 1 };
            vault.localStorage.set("obsync-image-state", raw);
        },

        rename(from, to): void {
            vault.remove(from);
            vault.seed(to, { bytes: 10, mtime: 5 });
        },

        fireRenamed(to, oldPath): void {
            // 替身的 `TFile` 缺 `vault` 字段（真实 `TAbstractFile` 有它）——
            // 与 `imageManagerActions.test.ts` 里 `noteDeleted` 的用法一致。
            module.noteRenamed(new TFile(to) as unknown as TAbstractFile, oldPath);
        },

        messages(): string[] {
            return Notice.instances.map((notice) => String(notice.message));
        },
    };
}

/** 等事件处理器里那条「不 await」的链路跑完。 */
async function settle(): Promise<void> {
    for (let index = 0; index < 3; index++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

afterEach(() => {
    for (const r2 of installed.splice(0)) r2.restore();
    Notice.instances.length = 0;
});

describe("noteRenamed：该不该管", () => {
    it("受管文件夹里的图片改名 → 云端搬一次（COPY + DELETE），不发多余请求", async () => {
        const h = createHarness();
        h.rename("images/旧.png", "images/新.png");
        h.vault.seed("images/旧.png", { bytes: 10, mtime: 5 });
        h.track("images/旧.png");
        h.r2.objects.set("images/旧.png", { size: 10, etag: "etag-a", lastModified: 0 });

        h.fireRenamed("images/新.png", "images/旧.png");
        await settle();

        expect(h.r2.requests.map((request) => request.method)).toEqual(["PUT", "DELETE"]);
        expect(h.r2.objects.has("images/新.png")).toBe(true);
        expect(h.r2.requests[0]!.headers["x-amz-copy-source"]).toBe("/notes/images/%E6%97%A7.png");
    });

    /**
     * **文件夹改名**：Obsidian 的适配器会遍历子项、为每个文件各发一次 `rename`
     * （见 `main.ts` 的说明）。所以一次文件夹改名就是 N 次这个入口 ——
     * 每一张都要搬，且都要搬对。
     */
    it("文件夹改名（每个文件各一次事件）→ 每一张都搬", async () => {
        const h = createHarness();
        for (const name of ["a", "b", "c"]) {
            h.rename(`images/旧/${name}.png`, `images/新/${name}.png`);
            h.vault.seed(`images/旧/${name}.png`, { bytes: 10, mtime: 5 });
            h.track(`images/旧/${name}.png`);
            h.r2.objects.set(`images/旧/${name}.png`, {
                size: 10,
                etag: `etag-${name}`,
                lastModified: 0,
            });

            h.fireRenamed(`images/新/${name}.png`, `images/旧/${name}.png`);
        }
        await settle();

        for (const name of ["a", "b", "c"]) {
            expect(h.r2.objects.has(`images/新/${name}.png`)).toBe(true);
            expect(h.r2.objects.has(`images/旧/${name}.png`)).toBe(false);
        }
        // 每张图 2 个请求（COPY + DELETE），没有一次内容是走本地重传的
        expect(h.r2.requests).toHaveLength(6);
    });

    it("文件夹本身的事件不管（子文件各自会来一次）", async () => {
        const h = createHarness();

        h.module.noteRenamed(
            new TFolder("images/新") as unknown as TAbstractFile,
            "images/旧"
        );
        await settle();

        expect(h.r2.requests).toEqual([]);
    });

    it("非图片不管", async () => {
        const h = createHarness();
        h.rename("images/笔记.md", "images/改名.md");

        h.fireRenamed("images/改名.md", "images/笔记.md");
        await settle();

        expect(h.r2.requests).toEqual([]);
    });

    it("受管范围之外（旧路径与新路径都在外面）不管", async () => {
        const h = createHarness();
        h.rename("templates/a.png", "templates/b.png");

        h.fireRenamed("templates/b.png", "templates/a.png");
        await settle();

        expect(h.r2.requests).toEqual([]);
    });

    /**
     * 面板改名走的是「`fileManager.renameFile`（会发 `rename` 事件）+
     * 自己再调一次 `renameRemoteBackup`」。两条路是**同一次**改名：
     * 后到的必须被合并掉，否则第二次 COPY 的源键已经没了（白报一个错）。
     */
    it("面板 + 事件是同一次改名 → 只搬一次（去重）", async () => {
        const h = createHarness();
        h.rename("images/旧.png", "images/新.png");
        h.vault.seed("images/旧.png", { bytes: 10, mtime: 5 });
        h.track("images/旧.png");
        h.r2.objects.set("images/旧.png", { size: 10, etag: "etag-a", lastModified: 0 });

        // 面板那一条先到，事件后到（真实顺序取决于 Obsidian 的调度）
        await h.module.service.renameRemoteBackup("images/旧.png", "images/新.png");
        h.fireRenamed("images/新.png", "images/旧.png");
        await settle();

        expect(h.r2.requests).toHaveLength(2);
        expect(h.messages()).toEqual([]);
    });
});
