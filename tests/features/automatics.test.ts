import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Automatics, type AutomaticsSettings } from "../../src/features/sync/automatics";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import type { SyncService } from "../../src/features/sync/syncService";
import type { SyncOutcome } from "../../src/features/sync/types";
import { createFakeApp, type FakeApp } from "../helpers/fakeApp";

/**
 * 自动定时器的行为。
 *
 * 这里踩过两个不显眼但真实的问题，都在本文件里锁住：
 *
 * 1. **时间戳没按库隔离** —— 原本用原生 `globalThis.localStorage`，
 *    那是所有库共用的存储区，于是 A 库的自动提交会影响 B 库的计时。
 *    （参考项目 obsidian-git 专门写过一段迁移来修这个问题。）
 * 2. **`stop()` 挡不住 in-flight 的 `fire()` 重新起表** —— 定时器被覆盖后
 *    再也 clear 不掉，设置变更会让同一动作每个周期跑两次。
 *
 * 计时类代码靠读代码很难确认对错，所以这些用例是必要的。
 */

interface Harness {
    service: SyncService;
    /** 依次记录被触发的动作。 */
    calls: string[];
    fake: FakeApp;
    setBusy(value: boolean): void;
    /** 本库的存储区（对应 Obsidian 的 app.localStorage）。 */
    store: Map<string, unknown>;
    /** `notifier.warn` 收到的文案（连续失败到阈值时那一条）。 */
    notices: string[];
}

/** 只实现 Automatics 用到的部分。 */
function harness(
    options: {
        onSync?: () => Promise<void>;
        /** 让 `notifier.describeError` 返回指定文案（模拟「错误被归类了」）。 */
        describeError?: (err: unknown) => string;
        /** `sync()` 的返回值。默认「没有变化」。 */
        syncOutcome?: SyncOutcome;
    } = {}
): Harness {
    const fake = createFakeApp();
    const calls: string[] = [];
    const notices: string[] = [];
    let busy = false;

    const service = {
        deps: {
            app: fake.app,
            getT: () => zhCN,
            notifier: {
                warn: (message: string) => notices.push(message),
                /**
                 * 与真实 `Notifier.describeError` 同形：先问翻译器，问不出来就退回
                 * 原始消息（`ObsyncError` 走 message，普通 `Error` 也走 message）。
                 */
                describeError: (err: unknown) =>
                    options.describeError?.(err) ??
                    (err instanceof Error ? err.message : String(err)),
            },
        },
        get isBusy(): boolean {
            return busy;
        },
        async sync(): Promise<SyncOutcome> {
            calls.push("sync");
            await options.onSync?.();
            // 必须返回**真实的形状**：消费方会读 `.kind`（大文件拦截那条链路）。
            // 替身返回 `undefined` 的话，那里会以 TypeError 炸掉 —— 而它看起来
            // 像「同步失败」（于是走进连续失败计数），实际是替身不忠实。
            return options.syncOutcome ?? { kind: "up-to-date" };
        },
        async pull(): Promise<void> {
            calls.push("pull");
        },
        async push(): Promise<void> {
            calls.push("push");
        },
        /**
         * 单独记一笔，用来断言「自动提交」那一档走的**不是**它 ——
         * 见「自动提交触发的是完整同步」那条。
         */
        async commitAll(): Promise<void> {
            calls.push("commitAll");
        },
    };

    return {
        service: service as unknown as SyncService,
        calls,
        fake,
        setBusy: (value: boolean) => {
            busy = value;
        },
        store: (fake.app as unknown as { localStorage: Map<string, unknown> }).localStorage,
        notices,
    };
}

const EVERY_MINUTE: AutomaticsSettings = {
    enabled: true,
    syncStrategy: "merge",
    intervalMinutes: 1,
};

const MINUTE_MS = 60_000;

/** 一个手动控制何时完成的 Promise。 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

/**
 * `nextRunAt()` —— 设置页那个倒计时的唯一数据来源（2026-10-02 用户要求）。
 *
 * 它出现的理由就一条：定时器自己只知道「还有多久」，而界面要显示「距离下次同步
 * 还有 3:07」需要一个**绝对时刻**。所以这里钉住它什么时候有值、什么时候没有 ——
 * 界面据此决定显示倒计时还是收起徽标。
 */
describe("nextRunAt（设置页倒计时的数据来源）", () => {
    it("起表后有值，且等于「现在 + 间隔」", () => {
        const h = harness();
        const automatics = new Automatics(h.service, () => EVERY_MINUTE);

        expect(automatics.nextRunAt()).toBeUndefined();
        automatics.start();

        expect(automatics.nextRunAt()).toBe(Date.now() + MINUTE_MS);
    });

    it("停表后没有值", () => {
        const h = harness();
        const automatics = new Automatics(h.service, () => EVERY_MINUTE);
        automatics.start();
        automatics.stop();

        expect(automatics.nextRunAt()).toBeUndefined();
    });

    /**
     * 关掉开关 / 策略为「重置」时**一个表都不起**，所以也没有「下次」可言 ——
     * 设置页那两个状态下不该显示倒计时（描述里已经写清了为什么暂停）。
     */
    it("开关关着或策略为 reset 时没有值", () => {
        const h = harness();

        const off = new Automatics(h.service, () => ({ ...EVERY_MINUTE, enabled: false }));
        off.start();
        expect(off.nextRunAt()).toBeUndefined();

        const suspended = new Automatics(h.service, () => ({
            ...EVERY_MINUTE,
            syncStrategy: "reset",
        }));
        suspended.start();
        expect(suspended.nextRunAt()).toBeUndefined();
    });

    it("一轮跑完之后按新周期重新记上", async () => {
        const h = harness();
        const automatics = new Automatics(h.service, () => EVERY_MINUTE);
        automatics.start();

        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        // 触发那一刻会先清掉（否则界面上会停在「还剩 0:00」），跑完再记上新的一表
        expect(h.calls).toEqual(["sync"]);
        expect(automatics.nextRunAt()).toBe(Date.now() + MINUTE_MS);
    });

    it("正在同步时那一刻没有值（界面这时显示「正在同步…」）", async () => {
        const gate = deferred();
        const h = harness({ onSync: () => gate.promise });
        const automatics = new Automatics(h.service, () => EVERY_MINUTE);
        automatics.start();

        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        // 同步还没结束（`gate` 没放行）：这一表已经烧掉，新的还没起
        expect(automatics.nextRunAt()).toBeUndefined();

        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(automatics.nextRunAt()).toBeDefined();
    });
});

describe("起表与周期", () => {    /**
     * 周期为 0 时不起表。
     *
     * 正常到不了这里（`normalizeSettings` 钳在 1–1440，开关是唯一的「关」），
     * 但这一条必须留着：周期若真是 0，`remaining()` 算出 0 毫秒，
     * 于是「立刻触发 → 重新起表」变成死循环 —— 每秒钟几十次 git 子进程，
     * 而界面上一切正常。
     */
    it("周期为 0 时不起表", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => ({
            enabled: true,
            syncStrategy: "merge",
            intervalMinutes: 0,
        }));

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 5);

        expect(calls).toEqual([]);
    });

    /**
     * 与设置页「开关灰掉」是一件事的两面，但**必须分开测**。
     *
     * 灰掉开关只是 UI 表态，真正的拦截在这里 —— 而库里**已经**存着
     * `enabled: true` + `reset` 的用户根本不会去动设置页。只测 UI 会漏掉他们，
     * 表现是「界面看起来一切正常，笔记却每隔几分钟丢一次提交」。
     */
    it("拉取策略为 reset 时一个定时器都不起", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => ({
            ...EVERY_MINUTE,
            syncStrategy: "reset",
        }));

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 5);

        expect(calls).toEqual([]);
    });

    /**
     * 设置页那句「改回『合并』或『变基』后自动恢复」是一个**承诺**，这条守它。
     *
     * 挂起如果做成一次性的（比如只在启动那一刻判一次），用户改回 merge 之后
     * 得重启 Obsidian 才会恢复 —— 而文案说的是「改回来就恢复」。
     */
    it("策略从 reset 改回 merge 后重新起表", async () => {
        const { service, calls } = harness();
        let settings: AutomaticsSettings = { ...EVERY_MINUTE, syncStrategy: "reset" };
        const automatics = new Automatics(service, () => settings);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 2);
        expect(calls).toEqual([]);

        // 设置页改策略 → commit() → applyDerivedSettings() → reload() → restart()
        settings = { ...settings, syncStrategy: "merge" };
        automatics.restart();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        expect(calls).toEqual(["sync"]);
    });

    /**
     * 这条守的是**文案与行为对齐**，不是实现细节。
     *
     * 定时器触发的是 `service.sync()`（提交 → 拉取 → 推送），设置页那一行因此
     * 写的是「定时同步」而不是「定时提交」。两者的关系是双向的：改实现要改文案，
     * 改文案要改实现。所以这里把「调的是 sync」钉住 ——
     * 若有人只看着名字把它改成 `commitAll()`，这条会失败并把人引到这里，
     * 同时设置页那句「完整链路：提交 → 拉取 → 推送」也得跟着改，否则就是新的谎。
     */
    it("定时器触发的是完整同步，不是仅提交", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        expect(calls).toEqual(["sync"]);
        expect(calls).not.toContain("commitAll");
    });

    it("到点触发，并按完整间隔继续（周期运行）", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toEqual(["sync"]);

        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toEqual(["sync", "sync"]);
    });

    it("没到点不触发", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS - 1000);

        expect(calls).toEqual([]);
    });

    it("同步正在进行时跳过本轮，不排队", async () => {
        const { service, calls, setBusy } = harness();
        const automatics = new Automatics(service, () => EVERY_MINUTE);
        setBusy(true);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        expect(calls).toEqual([]);

        // 跳过之后仍要按周期继续，不能就此停摆
        setBusy(false);
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toEqual(["sync"]);
    });
});

/**
 * 连续失败到阈值时的**那一条**提示（2026-10-02）。
 *
 * 原设计是「自动动作的失败只进日志」—— 前半句理由（不打扰、下一轮自愈）对单次失败
 * 仍然成立，但持续失败只进日志就等于沉默：用户 2026-10-02 那条 `auto sync failed`
 * 正是在控制台里偶然看到的，而它当时已经重复了好几次。
 *
 * 所以这里守三点：**前两次安静**、**第三次说一次并带上原因**、**成功即清零**。
 */
describe("连续失败的提示", () => {
    /** 到点就跑一轮，跑 `rounds` 轮。 */
    async function run(rounds: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(MINUTE_MS * rounds);
    }

    it("前两次安静，第三次说一次（带次数与原因），之后不再刷屏", async () => {
        const { service, calls, notices } = harness({
            onSync: () => Promise.reject(new Error("boom")),
            // 模拟「错误被归类了」：用户看到的是中文的可行动文案
            describeError: () => zhCN.sync.gitNetworkFailed,
        });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await run(2);
        expect(calls).toHaveLength(2);
        expect(notices, "前两次不该打扰（大概率是网络抖动）").toEqual([]);

        await run(1);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toBe(zhCN.sync.autoSyncFailedMany(3, zhCN.sync.gitNetworkFailed));
        // 末尾必须留着「下一轮仍会自动重试」—— 否则这条提示读起来像「自动同步死了」
        expect(notices[0]).toContain("下一轮");

        // 第 4、5、6 次失败不再重复说（提示给的是「持续失败」这个状态，不是每一次失败）
        await run(3);
        expect(calls).toHaveLength(6);
        expect(notices).toHaveLength(1);
    });

    it("成功一次即清零：隔一次成功之后要重新数三次", async () => {
        let fail = true;
        const { service, notices } = harness({
            onSync: () => (fail ? Promise.reject(new Error("boom")) : Promise.resolve()),
        });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await run(2); // 连续两次失败
        fail = false;
        await run(1); // 成功 → 清零
        fail = true;
        await run(2); // 新的一轮又失败两次 —— 仍然不该提示
        expect(notices).toEqual([]);

        await run(1); // 第三次
        expect(notices).toHaveLength(1);
        expect(notices[0]).toContain("3");
    });

    it("失败之后照常按周期继续（提示不能变成终止）", async () => {
        const { service, calls } = harness({ onSync: () => Promise.reject(new Error("boom")) });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await run(4);

        // 每一轮都真的跑了；提示只是附带的一句
        expect(calls).toHaveLength(4);
        expect(automatics.nextRunAt()).toBeDefined();
    });
});

/**
 * 大文件拦下时的提示。
 *
 * 自动同步是**无人值守**的：它被拦下时不弹窗（用户可能不在电脑前），
 * 所以那条通知就是这件事唯一的痕迹。没有它的话，同步看起来一切正常，
 * 而实际上一个字节都没提交 —— 用户下次打开远端才发现少了东西。
 */
describe("大文件拦下时的提示", () => {
    /** 到点就跑一轮，跑 `rounds` 轮（与「连续失败的提示」那一组同一个写法）。 */
    async function run(rounds: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(MINUTE_MS * rounds);
    }

    it("被拦下时发一条警告 —— 用户必须知道同步停了", async () => {
        const { service, notices } = harness({
            syncOutcome: {
                kind: "large-files-pending",
                largeFiles: [{ path: "字体.ttf", bytes: 40 * 1024 * 1024, tracked: false }],
            },
        });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await run(1);

        expect(notices).toHaveLength(1);
        expect(notices[0]).toBe(zhCN.sync.autoSyncLargeFilesPaused(1));
    });

    it("被拦下**不算失败** —— 不该走进「连续失败」的计数", async () => {
        // 它不是错误：下一轮照样跑，用户处理完就恢复。混进失败计数的话，
        // 三轮之后会多出一条「连续失败 3 次」的误导提示。
        const { service, notices } = harness({
            syncOutcome: {
                kind: "large-files-pending",
                largeFiles: [{ path: "字体.ttf", bytes: 40 * 1024 * 1024, tracked: false }],
            },
        });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await run(4);

        expect(notices.some((message) => message.includes("连续失败"))).toBe(false);
    });
});

describe("开关（settings.sync.enabled）", () => {
    /**
     * 这一组守的是一个真出过的问题：这个开关**只被写、从没被读过** ——
     * 设置页有开关、`data.json` 里存着值、README 也列着它，但没有一处代码读它。
     * 后果是「关掉同步」之后定时器照跑：自动提交照样每 N 分钟把笔记**推上远端**。
     * 用户做了 UI 提供给他的那个动作，却没有效果 —— 这比没有那个开关更糟。
     */
    it("关掉时一个定时器都不起", async () => {
        const { service, calls } = harness();
        const automatics = new Automatics(service, () => ({
            ...EVERY_MINUTE,
            enabled: false,
        }));

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 5);

        expect(calls).toEqual([]);
    });

    it("运行中关掉：restart() 立即停表（不用重启 Obsidian）", async () => {
        const { service, calls } = harness();
        let settings: AutomaticsSettings = { ...EVERY_MINUTE };
        const automatics = new Automatics(service, () => settings);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toEqual(["sync"]);

        // 设置页拨开关 → commit() → applyDerivedSettings() → reload() → restart()
        settings = { ...settings, enabled: false };
        automatics.restart();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 5);

        expect(calls).toEqual(["sync"]); // 只剩关掉之前那一次
    });

    it("再打开能恢复（不会把定时器永久关死）", async () => {
        const { service, calls } = harness();
        let settings: AutomaticsSettings = { ...EVERY_MINUTE, enabled: false };
        const automatics = new Automatics(service, () => settings);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 2);
        expect(calls).toEqual([]);

        settings = { ...settings, enabled: true };
        automatics.restart();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        expect(calls).toEqual(["sync"]);
    });
});

describe("stop() 与 restart() 的竞态", () => {
    it("stop() 之后，in-flight 的动作不会重新起表", async () => {
        const gate = deferred();
        const { service, calls } = harness({ onSync: () => gate.promise });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toHaveLength(1);

        // 动作还在跑时停掉（插件卸载 / 设置变更）
        automatics.stop();
        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // 再推进几个周期：不该有任何新的触发
        await vi.advanceTimersByTimeAsync(MINUTE_MS * 3);
        expect(calls).toHaveLength(1);
    });

    it("动作执行期间发生 restart()，不会留下孤儿定时器", async () => {
        // 这是「定时器再也 clear 不掉」的具体场景：
        // fire() 跑完会重新起表，而 restart() 已经起过一个 ——
        // 后起的那个会覆盖记录，先前那个就永远留在外面了。
        const gate = deferred();
        const { service, calls } = harness({ onSync: () => gate.promise });
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toHaveLength(1);

        automatics.restart();
        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // 修复前这里是 3（孤儿定时器 + 新定时器各触发一次）；修复后是 2。
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toHaveLength(2);

        // 再确认后续节奏没有被打乱
        await vi.advanceTimersByTimeAsync(MINUTE_MS);
        expect(calls).toHaveLength(3);
    });
});

describe("时间戳存储", () => {
    it("写进 app.saveLocalStorage（按库隔离），不是原生 localStorage", async () => {
        const { service, store } = harness();
        const automatics = new Automatics(service, () => EVERY_MINUTE);

        automatics.start();
        await vi.advanceTimersByTimeAsync(MINUTE_MS);

        expect(store.has("obsync-last-auto-sync")).toBe(true);
        expect(typeof store.get("obsync-last-auto-sync")).toBe("number");
    });

    it("启动时按「距上次执行的剩余时间」起表，而不是重新计满", async () => {
        const { service, store } = harness();
        const startedAt = Date.now();
        // 假装 40 秒前刚跑过（周期 1 分钟 → 还剩 20 秒）
        const lastRan = startedAt - 40_000;
        store.set("obsync-last-auto-sync", lastRan);

        const automatics = new Automatics(service, () => EVERY_MINUTE);
        automatics.start();

        // 19 秒后还不该触发（剩 20 秒）—— 时间戳不该被刷新
        await vi.advanceTimersByTimeAsync(19_000);
        expect(store.get("obsync-last-auto-sync")).toBe(lastRan);

        // 再过 2 秒（累计 21 秒）应该已经触发过
        await vi.advanceTimersByTimeAsync(2_000);
        const recorded = store.get("obsync-last-auto-sync") as number;

        // 精确断言：启动时剩 20 秒，所以恰好在启动后 20 秒触发并刷新时间戳。
        // 这条同时证明了「按剩余时间起表」而不是「重新计满 1 分钟」。
        expect(recorded - startedAt).toBe(20_000);
    });
});
