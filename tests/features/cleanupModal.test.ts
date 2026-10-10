import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import {
    createdSettings,
    openedModals,
    resetCreatedSettings,
    resetOpenedModals,
    type ButtonComponent,
} from "../stubs/obsidian";
import { CleanupReportModal } from "../../src/features/sync/ui/CleanupReportModal";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { Notifier } from "../../src/core/notice";
import { ROOT_DIRECTORY, type HistorySummary } from "../../src/features/sync/historyObjects";
import type { RewriteResult } from "../../src/features/sync/types";
import type { SyncService } from "../../src/features/sync/syncService";

/**
 * 「深度清理」弹窗在**重写进行中**的契约。
 *
 * 这个文件存在的理由是一次真实的报障，用户原话：
 *
 * > 重写进行时只有一个弹框提示，退出弹框后，没有任何正在进行的提示，
 * > 无法判断进度和状态
 *
 * 三件事当时都不成立，而且**逻辑测试一条都覆盖不到**（它们全在弹窗里）：
 *
 * 1. 进行中那一页没有进度信息 —— 用户不知道跑了多久、还要多久；
 * 2. 关掉窗口之后，`runRewrite` 那个 `await` 回来时会把结果页画到一个
 *    **已经脱离文档**的 `contentEl` 上：不报错、也看不见。症状是结果连同
 *    那颗「强制推送」一起消失 —— 而重写之后本地与远端必然分叉，
 *    不推就同步不上去，用户等于没法收尾；
 * 3. 屏幕上（状态栏 / 面板横幅）没有任何痕迹。那一半在
 *    `SyncService.rewriteHistory` 与 `statusBar` 上，由 `statusBar.test.ts`
 *    与 `syncService.test.ts` 钉着；这里只管弹窗这一半。
 *
 * 断言取「当前画出来的那一份」而不是缓存引用 —— 与 `addRepoModal.test.ts`
 * 同一个理由：`render()` 会把 `contentEl` 清空重建，缓存引用会失效。
 */

type RewriteOutcome = { result: RewriteResult; ignoredRules: number };

/** 测试 DOM 替身的最小形状（见 `tests/setup.ts`）。 */
interface FakeEl {
    text?: string;
    cls?: string;
    children?: FakeEl[];
}

/** 递归收集一个节点子树里的全部文本 —— 替身没有 `textContent`。 */
function allText(node: FakeEl): string {
    const own = typeof node.text === "string" ? node.text : "";
    const kids = (node.children ?? []).map(allText).join("\n");
    return [own, kids].filter((part) => part.length > 0).join("\n");
}

/** 在子树里找一个带某个类名的节点（用来钉「那条不确定进度条真的画出来了」）。 */
function findClass(node: FakeEl, cls: string): FakeEl | undefined {
    if (typeof node.cls === "string" && node.cls.split(/\s+/).includes(cls)) return node;
    for (const child of node.children ?? []) {
        const hit = findClass(child, cls);
        if (hit) return hit;
    }
    return undefined;
}

/**
 * 取**最近一次**渲染里那个按钮。
 *
 * 每次都从后往前找：`render()` 会重建按钮行，`createdSettings` 是只增不减的
 * （由 `resetCreatedSettings()` 在每个用例前清空），前面的都是上一页留下的。
 */
function lastButton(text: string): ButtonComponent | undefined {
    for (let index = createdSettings.length - 1; index >= 0; index -= 1) {
        const found = createdSettings[index].buttons.find((button) => button.text === text);
        if (found) return found;
    }
    return undefined;
}

/** 让已经 resolve 的 promise 链跑完（`load()` 里有两次 await）。 */
async function flush(times = 10): Promise<void> {
    for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (err: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** 159 个提交 —— 按实测系数 3.5 秒/提交估出来正好是 10 分钟。 */
const COMMIT_COUNT = 159;

const SUMMARY: HistorySummary = {
    totalBytes: 12_000_000,
    objectCount: 3000,
    directories: [
        { path: "字体", bytes: 8_000_000, objects: 5 },
        { path: ROOT_DIRECTORY, bytes: 4_000_000, objects: 20 },
    ],
    largest: [{ path: "字体/big.ttf", bytes: 5_000_000 }],
};

const RESULT: RewriteResult = {
    previousHead: "a".repeat(40),
    head: "b".repeat(40),
    backupRef: "refs/obsync-backup/20261010-120000",
    commitsBefore: COMMIT_COUNT,
    commitsAfter: COMMIT_COUNT - 1,
};

function makeService(rewrite: () => Promise<RewriteOutcome>): SyncService {
    return {
        historySummary: async () => SUMMARY,
        commitCount: async () => COMMIT_COUNT,
        rewriteHistory: rewrite,
        forcePush: async () => ({ kind: "pushed" as const }),
    } as unknown as SyncService;
}

/** 收集提示文案（错误与成功共用一条数组，顺序即发生顺序）。 */
function makeNotifier(messages: string[]): Notifier {
    const notifier = new Notifier({ getShowNotices: () => true, getT: () => zhCN });
    notifier.error = (message: string) => messages.push(message);
    notifier.info = (message: string) => messages.push(message);
    notifier.success = (message: string) => messages.push(message);
    notifier.warn = (message: string) => messages.push(message);
    return notifier;
}

/**
 * 打开弹窗并一路点进「正在重写」那一页。
 *
 * 走的是真实路径：读历史 → 勾一个目录 → 开始重写 → 确认重写 ——
 * 不直接改 `stage` 私有字段，否则「按钮在没勾选时是灰的」这类约束就绕过去了。
 */
async function openToRunning(rewrite: () => Promise<RewriteOutcome>): Promise<{
    modal: CleanupReportModal;
    messages: string[];
}> {
    const messages: string[] = [];
    const modal = new CleanupReportModal({} as App, zhCN, {
        service: makeService(rewrite),
        notifier: makeNotifier(messages),
    });
    modal.open();
    await flush();

    // 报告页：勾一个顶层目录（一个都不勾时「开始重写」是灰的）。
    const toggle = createdSettings.flatMap((setting) => setting.toggles).at(-1);
    expect(toggle).toBeDefined();
    toggle!.toggle(true);

    lastButton(zhCN.sync.cleanup.report.toConfirm)!.click();
    lastButton(zhCN.sync.cleanup.confirm.go)!.click();
    await flush();

    return { modal, messages };
}

let openModal: CleanupReportModal | undefined;

beforeEach(() => {
    resetCreatedSettings();
    resetOpenedModals();
    openModal = undefined;
});

afterEach(() => {
    // 定时器必须停掉：真定时器会让 vitest 挂住不退（假定时器下也无害）。
    openModal?.close();
    vi.useRealTimers();
});

describe("深度清理弹窗 —— 重写进行中", () => {
    it("给出「已用时长 / 预计时长」与「在后台继续」", async () => {
        const pending = deferred<RewriteOutcome>();
        const { modal } = await openToRunning(() => pending.promise);
        openModal = modal;

        // 标题走 `titleEl`（与 `contentEl` 是两个节点 —— 弹窗替身如实照做）。
        expect(allText(modal.titleEl as unknown as FakeEl)).toContain(
            zhCN.sync.cleanup.running.title
        );

        const text = allText(modal.contentEl as unknown as FakeEl);
        // 刚起步时已用 0:00；159 个提交按实测系数估出来是 10 分钟。
        expect(text).toContain(zhCN.sync.cleanup.running.progress("0:00", 10));
        // 那条不确定进度条（复用面板横幅的样式）—— 它只表达「在动」。
        expect(findClass(modal.contentEl as unknown as FakeEl, "obsync-sync-progress")).toBeDefined();
        // 「关掉之后去哪看」必须说出来，否则用户关掉就真的什么都没了。
        expect(text).toContain(zhCN.sync.cleanup.running.backgroundHint);
        expect(lastButton(zhCN.sync.cleanup.running.background)).toBeDefined();

        pending.resolve({ result: RESULT, ignoredRules: 1 });
        await flush();
    });

    it("已用时长每秒自己走 —— 不动手也能看出它在动", async () => {
        vi.useFakeTimers();
        const pending = deferred<RewriteOutcome>();
        const { modal } = await openToRunning(() => pending.promise);
        openModal = modal;

        vi.advanceTimersByTime(1000);
        expect(allText(modal.contentEl as unknown as FakeEl)).toContain(
            zhCN.sync.cleanup.running.progress("0:01", 10)
        );

        vi.advanceTimersByTime(60_000);
        expect(allText(modal.contentEl as unknown as FakeEl)).toContain(
            zhCN.sync.cleanup.running.progress("1:01", 10)
        );

        pending.resolve({ result: RESULT, ignoredRules: 1 });
        await flush();
    });

    it("重写期间关掉窗口：跑完会把结果页弹回来（那颗「强制推送」不能丢）", async () => {
        const pending = deferred<RewriteOutcome>();
        const { modal } = await openToRunning(() => pending.promise);
        openModal = modal;

        expect(openedModals).toHaveLength(1);

        // 用户不想一直盯着看 —— 这是允许的，而且重写会继续跑。
        modal.close();
        expect(openedModals).toHaveLength(1);

        pending.resolve({ result: RESULT, ignoredRules: 1 });
        await flush();

        // 结果页自己回来了。没有这一步，用户拿不到备份引用、也不知道要强制推送 ——
        // 而重写之后本地与远端必然分叉，不推就同步不上去。
        expect(openedModals).toHaveLength(2);
        const text = allText(modal.contentEl as unknown as FakeEl);
        expect(text).toContain(RESULT.backupRef);
        expect(lastButton(zhCN.sync.cleanup.result.push)).toBeDefined();
        expect(lastButton(zhCN.sync.cleanup.result.done)).toBeDefined();
    });

    it("重写期间关掉窗口：失败时把错误报出来，而不是弹回一个空窗口", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const pending = deferred<RewriteOutcome>();
            const { modal, messages } = await openToRunning(() => pending.promise);
            openModal = modal;

            modal.close();
            pending.reject(new Error("filter-branch exploded"));
            await flush();

            expect(openedModals).toHaveLength(1);
            expect(messages).toHaveLength(1);
            expect(messages[0]).toContain("filter-branch exploded");
        } finally {
            consoleError.mockRestore();
        }
    });
});

/**
 * 「画不出来」这一条路径（2026-10-10）。
 *
 * 用户报过「重写途中窗口白屏」，而静态读代码没能定位到那个现场。
 * 但这类症状最难查的地方恰恰是**什么都没留下**：一个空的 `contentEl`
 * 与「正在加载」长得一模一样，用户既分不清、也没法说清是在哪一步。
 *
 * 所以这里钉住的是「失败也要说话」：渲染抛错时弹窗**留在原地**并写一句人话，
 * 而不是静默地变成一个白框，也不是把整个弹窗关掉（关掉会让用户以为操作被取消了）。
 */
describe("深度清理弹窗 —— 渲染失败", () => {
    it("渲染炸了也不留白框：写一句人话，且不把弹窗关掉", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const modal = new CleanupReportModal({} as App, zhCN, {
                service: {
                    // 报告页会读 `directories.length` —— 给它一个坏形状，
                    // 渲染就会抛（真实世界里这类坏数据来自一次失败的解析）。
                    historySummary: async () => ({ ...SUMMARY, directories: null }),
                    commitCount: async () => COMMIT_COUNT,
                } as unknown as SyncService,
                notifier: makeNotifier([]),
            });
            openModal = modal;
            modal.open();
            await flush();

            expect(allText(modal.contentEl as unknown as FakeEl)).toContain(
                zhCN.sync.cleanup.renderFailed
            );
        } finally {
            consoleError.mockRestore();
        }
    });
});
