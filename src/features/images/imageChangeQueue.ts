import { logger } from "../../core/logger";

/**
 * 「库里改了图片 → 攒一小会儿 → 自动同步一次」的攒批器。
 *
 * 2026-10-06 加，起因是用户问「图片同步如果不做按周期同步，做即时同步会更好吧？」
 * —— 讨论之后定下的形状是**静默期攒批**（而不是「一有变动就跑」），
 * 完整取舍见 `docs/image-sync-design.md`。这里只放最要紧的三条：
 *
 * ## 一、为什么要静默期，而不是「有变动就跑」
 *
 * 两个理由，第二个更要紧：
 *
 * 1. 一次编辑会话（拖进 50 张图、批量压缩一批、连续改名）会被收成**一轮**，
 *    而不是 50 轮 —— 每轮都要一次 R2 `ListObjects`；
 * 2. **不在用户还在动的时候开跑。** 有些程序分块写大文件，`modify` 会在写到一半时
 *    触发，那时去读会上传一张**截断的图**。静默期不是优化，是正确性。
 *
 * ## 二、为什么还需要一个硬上限（`maxWaitMs`）
 *
 * 纯静默期有个死角：用户连续动几百张图时，静默期永远不满足 → **永远不跑**。
 * 所以另给一个「最多攒这么久」的上限（`maxWaitForQuietMs` 按静默期算出来）。
 *
 * ## 三、正在跑一轮时来的变动**不能丢**
 *
 * `ImageAutomatics` 那边撞上「正在跑」的处置是「放弃这一轮、等下一个整周期」——
 * 那条路可以这么做，因为周期还会再来。**这里不行**：变动同步没有「下一个周期」
 * 可等，丢掉就是永久丢失（要等下次启动那一轮才补得上）。所以这里改成
 * 「隔一小会儿再试」，直到能跑为止。
 *
 * ## 它不知道什么是「图片」
 *
 * 入队的路径由调用方（`features/images/index.ts`）过滤好（类型 → 扩展名 →
 * 受管范围），这里只管「攒、计时、交出去」。于是它可以完全脱离 Obsidian 单测。
 */
export interface ImageChangeQueueDeps {
    /** 静默期（毫秒）：这段时间内没有新的变动就同步。 */
    quietMs(): number;
    /** 硬上限（毫秒）：一直在动时也至少攒这么久就跑一轮。 */
    maxWaitMs(): number;
    /** 现在是不是有一轮在跑。 */
    isBusy(): boolean;
    /**
     * 到点了：把这些路径交给同步。
     *
     * **不返回 promise、也不该抛错** —— 它是在定时器回调里被调用的（与
     * `ImageAutomatics.fire()` 同一个形状：失败只进日志，自动动作不弹窗）。
     */
    fire(paths: string[]): void;
}

/**
 * 一轮在跑时，隔多久回头再试。
 *
 * 5 秒是个折中：一轮同步通常是几秒到几十秒，用不着更密；而「跑完 5 秒内就补上」
 * 对用户来说与「立刻」没有区别。
 */
const BUSY_RETRY_MS = 5_000;

/**
 * 静默期对应的硬上限：`clamp(静默期 × 10, 5 分钟, 30 分钟)`。
 *
 * - 默认静默期 30 秒 → **5 分钟**（「最多攒 10 个静默期」）；
 * - 下限 5 分钟：静默期很短时（比如用户设成 5 秒）上限不该跟着变成 50 秒 ——
 *   那等于没有上限；
 * - 上限 30 分钟：再长就与「按周期同步」那一轮重了，没有意义。
 */
export function maxWaitForQuietMs(quietMs: number): number {
    return Math.min(30 * 60_000, Math.max(5 * 60_000, quietMs * 10));
}

export class ImageChangeQueue {
    /** 攒下的路径。用 `Set`：同一次变动被报两次时只该同步一次。 */
    private readonly pending = new Set<string>();

    private timer: number | undefined;

    /**
     * 这一批是从什么时候开始攒的（算 `maxWaitMs` 用）。
     *
     * 只在**第一批**入队时设，`fire` 之后清掉 —— 中途重置它会让上限永远不生效
     * （那正是「一直在动就永远不跑」那个死角）。
     */
    private startedAt: number | undefined;

    constructor(private readonly deps: ImageChangeQueueDeps) {}

    /** 记下一个刚变动的路径（调用方已经过滤过）。 */
    note(...paths: string[]): void {
        let added = false;
        for (const path of paths) {
            if (path) {
                this.pending.add(path);
                added = true;
            }
        }
        if (!added) return;

        if (this.startedAt === undefined) this.startedAt = Date.now();
        this.arm();
    }

    /** 攒着的东西有几条（测试与日志用）。 */
    get size(): number {
        return this.pending.size;
    }

    /**
     * 丢掉攒下的一切并停表（插件卸载 / 用户关掉这个功能）。
     *
     * 与 `cancelPendingDeletions` 同一个处置：插件都不在了，不该再跑。
     * **不 flush** —— flush 会发网络请求。
     */
    clear(): void {
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        this.timer = undefined;
        this.startedAt = undefined;
        this.pending.clear();
    }

    /** 按「静默期」和「硬上限」里**更早到的那个**重新起表。 */
    private arm(): void {
        if (this.timer !== undefined) window.clearTimeout(this.timer);

        const quiet = this.deps.quietMs();
        const elapsed = Date.now() - (this.startedAt ?? Date.now());
        const untilMaxWait = Math.max(0, this.deps.maxWaitMs() - elapsed);

        // 取更早的那个：攒够静默期就跑，但最晚不超过硬上限。
        this.timer = window.setTimeout(() => this.fireNow(), Math.min(quiet, untilMaxWait));
    }

    private fireNow(): void {
        this.timer = undefined;
        if (this.pending.size === 0) {
            this.startedAt = undefined;
            return;
        }

        if (this.deps.isBusy()) {
            // 正在跑：**不丢**，隔一会儿再试。注意这里**不走 `arm()`** ——
            // `arm()` 会把 `untilMaxWait` 算成 0，于是变成「立刻重试」的死循环。
            this.timer = window.setTimeout(() => this.fireNow(), BUSY_RETRY_MS);
            return;
        }

        const paths = [...this.pending];
        this.pending.clear();
        this.startedAt = undefined;
        logger.debug(`image change sync: ${paths.length} path(s) after the quiet period`);
        this.deps.fire(paths);
    }
}
