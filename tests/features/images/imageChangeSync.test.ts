import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, TAbstractFile } from "obsidian";
import { Notifier } from "../../../src/core/notice";
import { zhCN } from "../../../src/core/i18n/locales/zh-cn";
import { normalizeSettings, type ImageSyncSettings } from "../../../src/core/settings";
import { SecretStore } from "../../../src/core/secretStore";
import { createImageSyncModule, type ImageSyncModule } from "../../../src/features/images";
import { createFakeImageVault, type FakeImageVault } from "../../helpers/fakeImageVault";
import { createFakeR2, type FakeR2 } from "../../helpers/fakeR2";

/**
 * 「库里改了图片 → 攒一小会儿 → 自动同步一次」这条链路（2026-10-06）。
 *
 * ## 这个文件守的是什么
 *
 * 攒批本身（静默期 / 硬上限 / 正在跑时不丢）在
 * `imageChangeQueue.test.ts` 里钉死了，这里只管**接线**：
 *
 * 1. 边界：只有「受管文件夹里的图片」才入队 —— 少一个判据的后果是
 *    「用户改了一张范围外的图，插件却去动了云端」；
 * 2. 两个开关都真的挡得住（总开关、以及这一项自己的开关）；
 * 3. **自触发抑制**：下载会写本地、写本地会发 `modify`/`create` ——
 *    不标记的话每下载一张就再触发一轮（幂等，但白跑一次 R2 `ListObjects`）。
 */

const BASE: Partial<ImageSyncSettings> = {
    folders: ["images"],
    accountId: "abc123",
    bucket: "notes",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    prefix: "",
    // 这两项在 `normalizeSettings` 里都有默认值，写出来是为了让用例自己说清前提。
    imageChangeSyncEnabled: true,
    imageChangeDelaySeconds: 30,
};

/** 与设置里的默认静默期一致。 */
const QUIET_MS = 30_000;

interface Harness {
    vault: FakeImageVault;
    r2: FakeR2;
    module: ImageSyncModule;
    /** 改设置（下一次 `noteChanged` 生效）。 */
    configure(next: Partial<ImageSyncSettings>): void;
    /** 静默期到点 —— 让攒批真的交出去。 */
    settle(): Promise<void>;
    /** 发过几次「列举云端」：一次 = 跑了一轮同步。 */
    listCount(): number;
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

        async settle(): Promise<void> {
            await vi.advanceTimersByTimeAsync(QUIET_MS);
        },

        listCount(): number {
            // 列举请求的键是空串（见 `RecordedRequest.key` 的说明）。
            return r2.requests.filter((request) => request.method === "GET" && request.key === "")
                .length;
        },
    };
}

/**
 * 事件参数要一个真的 `TFile`，而替身缺 `vault` 字段（真实 API 上它指向所属的
 * Vault，我们从不读它）—— 与 `imageDeletePrompt.test.ts` 里同一个处置：
 * 类型断言，而不是去给替身加一个行为不对的字段。
 */
function asAbstractFile(file: unknown): TAbstractFile {
    return file as TAbstractFile;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    for (const r2 of installed.splice(0)) r2.restore();
});

describe("noteChanged：什么时候该排队", () => {
    it("受管文件夹里的新图 → 静默期满后真的传上去", async () => {
        const h = createHarness();
        const file = h.vault.seed("images/new.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(1);
        expect(h.r2.objects.has("images/new.png")).toBe(true);
    });

    it("静默期没到就不跑（用户还在动）", async () => {
        const h = createHarness();
        const file = h.vault.seed("images/new.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await vi.advanceTimersByTimeAsync(QUIET_MS - 1_000);

        expect(h.listCount()).toBe(0);
    });

    it("受管范围之外的图片不排队", async () => {
        const h = createHarness();
        const file = h.vault.seed("elsewhere/x.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(0);
    });

    it("非图片（笔记）不排队", async () => {
        const h = createHarness();
        const file = h.vault.seed("images/note.md", { text: "hi" });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(0);
    });

    it("关掉「变动后自动同步」→ 不排队", async () => {
        const h = createHarness();
        h.configure({ imageChangeSyncEnabled: false });
        const file = h.vault.seed("images/new.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(0);
    });

    it("总开关关掉 → 不排队（那是用户说的「别在背后动我的图片」）", async () => {
        const h = createHarness();
        h.configure({ enabled: false });
        const file = h.vault.seed("images/new.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(0);
    });

    it("配置不全 → 不排队（跑了也白跑）", async () => {
        const h = createHarness();
        h.configure({ bucket: "" });
        const file = h.vault.seed("images/new.png", { bytes: 12, mtime: 100 });

        h.module.noteChanged(asAbstractFile(file));
        await h.settle();

        expect(h.listCount()).toBe(0);
    });
});

describe("noteChanged：自己写的那一份不触发第二轮", () => {
    /**
     * 下载会写本地，而写本地会发 `create`/`modify` —— 那正是我们在听的事件。
     * 不标记的话每下载一张就再触发一轮（幂等，会立刻判成 `in-sync`，
     * 但白跑一次 R2 `ListObjects`）。
     */
    it("下载写进来的那张不排队", async () => {
        const h = createHarness();
        // 云端有一张、本地没有 → 跑一轮会把它下载下来（那一步会写本地）。
        h.r2.objects.set("images/from-cloud.png", { size: 10, etag: "e", lastModified: 1 });

        await h.module.service.run();
        expect(h.vault.has("images/from-cloud.png")).toBe(true);

        const listsAfterDownload = h.listCount();
        const written = h.vault.app.vault.getAbstractFileByPath("images/from-cloud.png");

        h.module.noteChanged(asAbstractFile(written));
        await h.settle();

        // 没有多跑一轮。
        expect(h.listCount()).toBe(listsAfterDownload);
    });

    it("标记只消费一次：同一个路径**后来**真的被用户改了，照旧排队", async () => {
        const h = createHarness();
        h.r2.objects.set("images/from-cloud.png", { size: 10, etag: "e", lastModified: 1 });

        await h.module.service.run();
        const written = h.vault.app.vault.getAbstractFileByPath("images/from-cloud.png");

        // 第一次事件：我们自己写的，消费掉标记。
        h.module.noteChanged(asAbstractFile(written));
        await h.settle();
        const afterSelfWrite = h.listCount();

        // 第二次事件：用户真的改了它 —— 必须排队。
        h.module.noteChanged(asAbstractFile(written));
        await h.settle();

        expect(h.listCount()).toBe(afterSelfWrite + 1);
    });
});

describe("noteRenamed：改名之后也会排队（兜住云端 COPY 失败）", () => {
    it("改名后静默期满会跑一轮", async () => {
        const h = createHarness();
        const file = h.vault.seed("images/renamed.png", { bytes: 12, mtime: 100 });

        h.module.noteRenamed(asAbstractFile(file), "images/old.png");
        await h.settle();

        // 改名本身可能发若干请求（COPY/DELETE），这里只要求「跑了一轮」。
        expect(h.listCount()).toBeGreaterThanOrEqual(1);
    });
});
