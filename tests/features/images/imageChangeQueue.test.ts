import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ImageChangeQueue,
    maxWaitForQuietMs,
} from "../../../src/features/images/imageChangeQueue";

/**
 * 「变动后自动同步」的攒批器。
 *
 * ## 这个文件守的是什么
 *
 * 它管的全是**时序**，而时序 bug 的症状是「偶尔不同步」——最难复现、也最难从
 * 代码上看出来的一类。四条主线：
 *
 * 1. **静默期**：一次编辑会话只该跑一轮，且不能在用户还在写文件的时候开跑；
 * 2. **硬上限**：连续变动时静默期永远不满足 → 没有上限就**永远不跑**；
 * 3. **正在跑时不丢**：`ImageAutomatics` 那边「放弃这一轮、等下一个整周期」的
 *    处置在这里不成立（没有下一个周期可等），丢了就是永久丢失；
 * 4. **`clear()` 真的丢掉**：插件卸载 / 用户关掉功能之后不该再跑。
 *
 * 时间用 `vi.useFakeTimers()` 推（与 `automatics.test.ts` 同一套），不注入时钟 ——
 * 这样被测的就是真实的 `window.setTimeout` 行为。
 */

/** 默认静默期，与设置里的默认值一致（30 秒）。 */
const QUIET = 30_000;
/** 默认硬上限（静默期 × 10，下限 5 分钟）= 5 分钟。 */
const MAX_WAIT = 5 * 60_000;
/** 一轮在跑时的重试间隔（`ImageChangeQueue` 内部的 `BUSY_RETRY_MS`）。 */
const BUSY_RETRY = 5_000;

function createHarness(options: { busy?: boolean } = {}) {
    const state = {
        busy: options.busy ?? false,
        quietMs: QUIET,
        /** 每次 `fire` 收到的路径数组（按顺序）。 */
        fired: [] as string[][],
    };

    const queue = new ImageChangeQueue({
        quietMs: () => state.quietMs,
        maxWaitMs: () => maxWaitForQuietMs(state.quietMs),
        isBusy: () => state.busy,
        fire: (paths) => state.fired.push(paths),
    });

    return { state, queue };
}

/** 推进假时钟（异步版：让定时器里的 promise 链也跑完）。 */
async function advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("maxWaitForQuietMs（硬上限怎么算）", () => {
    it("默认静默期 30 秒 → 上限 5 分钟", () => {
        expect(maxWaitForQuietMs(30_000)).toBe(5 * 60_000);
    });

    it("静默期很短时上限仍是 5 分钟（否则等于没有上限）", () => {
        expect(maxWaitForQuietMs(5_000)).toBe(5 * 60_000);
    });

    it("静默期很长时上限封顶 30 分钟（再长就与「按周期同步」重了）", () => {
        expect(maxWaitForQuietMs(600_000)).toBe(30 * 60_000);
    });
});

describe("静默期", () => {
    it("攒够静默期才跑，并把攒下的路径一次交出去", async () => {
        const { state, queue } = createHarness();

        queue.note("images/a.png");
        queue.note("images/b.png");
        await advance(QUIET - 1);
        expect(state.fired).toHaveLength(0);

        await advance(1);
        expect(state.fired).toEqual([["images/a.png", "images/b.png"]]);
    });

    it("期间又来一次变动 → **重置**静默期（用户还在动，就别开跑）", async () => {
        const { state, queue } = createHarness();

        queue.note("images/a.png");
        await advance(QUIET - 1_000);
        queue.note("images/b.png");
        await advance(QUIET - 1_000);

        // 距最后一次变动还差 1 秒 —— 不该跑。
        expect(state.fired).toHaveLength(0);

        await advance(1_000);
        expect(state.fired).toEqual([["images/a.png", "images/b.png"]]);
    });

    it("同一个路径被报两次只同步一次", async () => {
        const { state, queue } = createHarness();

        queue.note("images/a.png");
        queue.note("images/a.png");
        await advance(QUIET);

        expect(state.fired).toEqual([["images/a.png"]]);
    });

    it("空路径入队什么都不做（不启动计时器）", async () => {
        const { state, queue } = createHarness();

        queue.note("");
        queue.note();
        await advance(MAX_WAIT * 2);

        expect(state.fired).toHaveLength(0);
    });

    it("跑完之后是新的一批：再来一次变动会再跑一次", async () => {
        const { state, queue } = createHarness();

        queue.note("images/a.png");
        await advance(QUIET);
        queue.note("images/b.png");
        await advance(QUIET);

        expect(state.fired).toEqual([["images/a.png"], ["images/b.png"]]);
    });
});

describe("硬上限", () => {
    /**
     * 最容易漏的一条：变动来得比静默期还密时，静默期永远不满足 ——
     * 没有上限就是「用户一直在动图 → 永远不同步」。
     */
    it("变动比静默期还密时，到上限仍然跑一轮", async () => {
        const { state, queue } = createHarness();

        // 每 10 秒动一次（< 30 秒静默期），持续到 5 分钟。
        for (let elapsed = 0; elapsed < MAX_WAIT; elapsed += 10_000) {
            queue.note(`images/${elapsed}.png`);
            await advance(10_000);
        }

        expect(state.fired).toHaveLength(1);
        // 攒下的都在同一批里。
        expect(state.fired[0]!.length).toBe(30);
    });
});

describe("正在跑一轮时", () => {
    it("**不丢**：等空闲了补一次", async () => {
        const { state, queue } = createHarness({ busy: true });

        queue.note("images/a.png");
        await advance(QUIET);

        // 静默期满但正忙 —— 没跑，而且攒着的东西还在。
        expect(state.fired).toHaveLength(0);
        expect(queue.size).toBe(1);

        state.busy = false;
        await advance(BUSY_RETRY);

        expect(state.fired).toEqual([["images/a.png"]]);
    });

    it("一直忙就一直等，不会把攒下的丢掉", async () => {
        const { state, queue } = createHarness({ busy: true });

        queue.note("images/a.png");
        await advance(MAX_WAIT * 2);

        expect(state.fired).toHaveLength(0);
        expect(queue.size).toBe(1);

        state.busy = false;
        await advance(BUSY_RETRY);

        expect(state.fired).toEqual([["images/a.png"]]);
    });
});

describe("clear()", () => {
    it("丢掉攒下的并停表（插件卸载 / 关掉这个功能）", async () => {
        const { state, queue } = createHarness();

        queue.note("images/a.png");
        expect(queue.size).toBe(1);

        queue.clear();
        expect(queue.size).toBe(0);

        await advance(MAX_WAIT * 2);
        expect(state.fired).toHaveLength(0);
    });
});
