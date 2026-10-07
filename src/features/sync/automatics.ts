import { logger } from "../../core/logger";
import type { SyncService } from "./syncService";
import type { SyncStrategy } from "./types";

/**
 * 自动提交 / 推送 / 拉取的定时器。
 *
 * ## 只有一个定时器（2026-10-02）
 *
 * 这里原本有三个表（提交 / 推送 / 拉取各一条）。现在只有一条，而它跑的是
 * **完整链路** `提交 → 拉取 → 推送` —— 因为另外两条从来只是在这条之上额外加的
 * 单动作定时器：主间隔已经把三件事都做了，多出来的两个数字除了要求用户先读懂
 * 「推/拉间隔设为 0 也会随主间隔一起发生」之外没有别的用（见
 * `SyncSettings.intervalMinutes` 与 `migrateV6ToV7`）。
 *
 * 代价是「只拉取 / 只推送」的定时配置没有了；手动按钮不受影响。
 *
 * ## 为什么持久化「上次执行时间」
 *
 * Obsidian 重启会把定时器清零。如果每次启动都重新计满一个间隔，
 * 用户「每 5 分钟备份」的实际周期会被拉长到「5 分钟 + 使用时长」。
 * 所以把每次执行的时间戳存进 localStorage，启动时按剩余时间起表 ——
 * 这是参考项目 obsidian-git 验证过的模型（automaticsManager.ts）。
 */

/** setTimeout 的参数是 32 位有符号整数，超时会立即触发。 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 连续失败到第几次时**提示一次**。
 *
 * 三次的依据：一次失败大概率是网络抖动（下一轮就恢复了），两次也还可能；
 * 同一个周期长度下连着三次失败，说明不是抖动而是「真的连不上 / 配置不对了」。
 * 见 `reportRepeatedFailure`。
 */
const AUTO_SYNC_FAILURE_NOTICE_AT = 3;

export interface AutomaticsSettings {
    /**
     * 「定时同步」的开关（设置页那一行的开关）。**关掉时一个定时器都不起。**
     *
     * 这个字段必须在这里也有一份，而不是只在设置页判一下：定时器是插件
     * **自己**发起的后台动作，会提交、拉取、**推送到远端**。用户关掉它，
     * 意思就是「别在背后动我的仓库」—— 而在这个字段被接线之前，那个开关
     * 写了从来没人读，于是关掉之后照样每 N 分钟把笔记推上远端：
     * 用户做了 UI 提供给他的那个动作，却没有效果。
     *
     * 边界（照 `installer.autoCheckOnStartup` 的先例）：它**只管后台自动动作**。
     * 命令面板里的同步命令仍然可用 —— 那是用户当下主动发起的意图，
     * 与「插件自己到点就跑」不是一回事，拦下来只会让人以为插件坏了。
     */
    enabled: boolean;

    /**
     * 拉取整合策略。**必须在逻辑层也读到，不能只在设置页判一下** ——
     * 理由与上面的 `enabled` 完全相同：那个字段当年就是这么被漏掉的
     * （设置页写了、没人读，于是「关掉」之后照样在后台推）。
     *
     * 策略为 `reset` 时 `start()` 一个定时器都不起。自动同步的链路是
     * 「提交 → 拉取 → 推送」，而 `reset` 的语义是「丢弃本地提交、以远端为准」
     * （`simpleGitManager.resetToRemote` 走 `git reset --hard upstream`）。
     * 两者叠在一起，用户每 N 分钟就**静默地**丢掉一次刚提交的东西 ——
     * 而且 UI 上开关还开着，比关掉更让人想不到。
     *
     * 这里选择挂起而不是拦下 `reset`：策略本身是用户明确选的语义，
     * 该被限制的是「让它无人值守地反复执行」这件事。
     */
    syncStrategy: SyncStrategy;

    /**
     * 周期（分钟）。到点跑完整链路。
     *
     * `normalizeSettings` 保证它是 1–1440，所以这里不再需要「0 = 关闭」那条分支
     * —— 关与开只由 `enabled` 表达。
     */
    intervalMinutes: number;
}

export class Automatics {
    private timer: number | undefined;

    /**
     * 「世代」计数器，每次 `stop()` 自增。
     *
     * 用来解决一个不显眼但真实的问题：`fire()` 是异步的，它跑完会重新起表。
     * 如果这期间 `stop()` 被调用过（插件卸载、设置变更触发的 `restart()`），
     * 那个 in-flight 的 `fire()` 回来照样起表 —— 于是
     * ① `stop()` 之后仍有定时器在跑；② 更糟的是 `restart()` 已经起过一个，
     * 新起的那个会把 Map 里的记录覆盖掉，**先前那个再也 clear 不掉**，
     * 结果是同一个动作每个周期跑两次。
     *
     * 做法：`fire()` 开始时捕获世代号，回来时若已变化就放弃重新起表。
     */
    private generation = 0;

    /**
     * 当前这一表**预定触发**的时间戳（毫秒）。没有定时器时是 `undefined`。
     *
     * 存在的理由只有一个：设置页要显示「距离下次同步的倒计时」（2026-10-02 用户要求）。
     * 定时器自己只知道「还有多久」（而且那个时长还夹着 `MAX_TIMEOUT_MS` 的钳制），
     * 而界面要的是「什么时候」—— 两者差一个 `Date.now()`，记在这里比让界面去猜可靠。
     */
    private scheduledAt: number | undefined;

    /**
     * 连续失败了几次（**成功一次即清零**）。
     *
     * 只记在内存里：重启 Obsidian 就从零开始。理由是这个数字唯一的作用是
     * 「连续失败到阈值时提示一次」，而重启本身已经是一次诊断动作
     * （用户重启后要看的正是「还失败吗」）—— 把旧的失败计数背过重启反而会让
     * 提示出现在一个已经恢复的环境里。
     */
    private consecutiveFailures = 0;

    /** 定时器触发时真正要做的事 —— 从 SyncService 拿，保持单一编排入口。 */
    constructor(
        private readonly service: SyncService,
        private readonly settings: () => AutomaticsSettings
    ) {}

    /** 启动时调用：按「距上次执行的剩余时间」起表。 */
    start(): void {
        this.stop();

        const current = this.settings();

        // 定时同步关掉：`stop()` 已经清完表，到此为止。
        //
        // 不需要在 `fire()` 里再判一次：`stop()` 同时把世代号自增了，所以
        // 那一刻正在跑的 `fire()` 回来时不会重新起表（见 `generation` 的说明）。
        // 而设置页每次改动都会走 `commit()` → `applyDerivedSettings()` →
        // `sync.reload()` → 这里，所以用户拨开关是**立刻**生效的，不用重启。
        if (!current.enabled) {
            logger.debug("automatics disabled: no timer scheduled");
            return;
        }

        // 策略为 reset 时挂起 —— 见 `AutomaticsSettings.syncStrategy`。
        //
        // 这里同样不需要在 `fire()` 里再判一次：`stop()` 已把世代号自增，
        // 那一刻 in-flight 的 `fire()` 回来不会重新起表；而设置页每次改动都会走
        // `commit()` → `applyDerivedSettings()` → `sync.reload()` → 这里。
        if (current.syncStrategy === "reset") {
            logger.debug("automatics suspended: pull strategy is reset");
            return;
        }

        // 兜底，正常到不了这里：`normalizeSettings` 把周期钳在 1–1440。但**不能**
        // 少了这一句 —— 周期若真是 0，`remaining()` 会算出 0 毫秒，
        // 于是「立刻触发 → 重新起表 → 立刻触发」变成一个死循环，
        // 每秒钟几十次 git 子进程，而界面上看不出任何异常。
        if (current.intervalMinutes <= 0) {
            logger.debug("automatics disabled: interval is 0");
            return;
        }

        this.schedule(remaining(this.lastRan(), current.intervalMinutes));
    }

    /** 设置变化后调用：按完整间隔重新起表。 */
    restart(): void {
        this.start();
    }

    stop(): void {
        this.generation += 1;
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        this.timer = undefined;
        this.scheduledAt = undefined;
    }

    /**
     * 下一次自动同步的时间戳（毫秒）；**没有定时器时是 `undefined`**。
     *
     * 三种情况下没有定时器：开关关着、策略是 `reset`（挂起）、以及两次同步之间
     * 那一瞬（表已经触发、新的还没起）。设置页据此收起倒计时徽标。
     */
    nextRunAt(): number | undefined {
        return this.scheduledAt;
    }

    private schedule(delayMinutes: number): void {
        const delayMs = Math.min(delayMinutes * 60_000, MAX_TIMEOUT_MS);
        this.timer = window.setTimeout(() => void this.fire(), delayMs);
        this.scheduledAt = Date.now() + delayMs;
    }

    private async fire(): Promise<void> {
        const generation = this.generation;
        // 这张表已经烧掉了：先把手上的时间戳清掉，界面才不会在同步过程中显示
        // 一个「还剩 0:00」的倒计时（那一轮结束后 `rescheduleIfCurrent` 会重新记上）。
        this.scheduledAt = undefined;

        // 正在跑（比如用户手动同步）就放弃这一轮，等下一个整周期。
        // 排队会造成「队列里积了三个同步」，全部执行完已经过了很久。
        if (this.service.isBusy) {
            logger.debug("auto sync skipped: sync already running");
            this.rescheduleIfCurrent(generation);
            return;
        }

        try {
            // 走的是**完整同步**（提交 → 拉取 → 推送），不是 `commitAll()`。
            //
            // 这是刻意的，与参考项目一致（obsidian-git 的定时器叫
            // `autoSaveInterval`，做的事情是 `commitAndSync`）。所以设置页那一行
            // 写的必须是「定时同步」而不是「定时提交」：只写提交会让人以为
            // 「把别的间隔设为 0」就能拦住网络动作 —— 拦不住。
            const outcome = await this.service.sync();
            void outcome;
            // 成功即清零：提示是给「**持续**失败」这个状态，不是给每一次失败。
            this.consecutiveFailures = 0;
        } catch (err) {
            // 自动动作的失败只进日志 —— 弹窗会在用户没操作时突然出现，
            // 而且网络抖动导致的失败下一轮自然恢复。
            logger.warn("auto sync failed", err);
            this.consecutiveFailures += 1;
            this.reportRepeatedFailure(err);
        } finally {
            this.markRan();
            this.rescheduleIfCurrent(generation);
        }
    }

    /**
     * 连续失败到 `AUTO_SYNC_FAILURE_NOTICE_AT` 次时**说一次**（2026-10-02）。
     *
     * ## 为什么不是每次都提示，也不是一直沉默
     *
     * 上面那句「只进日志」的理由（不打扰、下一轮自愈）对**单次**失败仍然成立，
     * 但**持续**失败只进日志就等于沉默：没人天天翻控制台，等发现时可能已经几天
     * 没备份了。用户 2026-10-02 那条 `[SyncHub] auto sync failed` 正是在控制台里
     * 偶然看到的 —— 而它当时已经重复了好几次。
     *
     * 所以取中间：前两次安静（大概率自愈），第三次说一次并**带上原因**；之后再失败
     * 也不重复说（`consecutiveFailures !== 阈值` 直接返回）。用户下一次注意到它，
     * 要么是问题真的解决了（成功清零），要么是重启之后又连续失败三次。
     *
     * 用 `warn` 而不是 `error`：这不是用户刚发起的操作失败，而是后台的持续状况；
     * 同时它**受「显示操作结果提示」设置控制**（`warn` 会被静音，`error` 不会）——
     * 明确关掉提示的人，不该被后台消息打扰。
     *
     * 原因走 `describeError`：已归类的错误（如「连不上远端」）得到中文的可行动文案，
     * 未归类的退回技术描述 —— 与别处 `reportError` 的行为一致，不额外加工。
     */
    private reportRepeatedFailure(err: unknown): void {
        if (this.consecutiveFailures !== AUTO_SYNC_FAILURE_NOTICE_AT) return;
        const t = this.service.deps.getT();
        const reason = this.service.deps.notifier.describeError(err);
        this.service.deps.notifier.warn(
            t.sync.autoSyncFailedMany(this.consecutiveFailures, reason)
        );
    }

    /** 只在「本世代仍然有效」时重新起表 —— 见 `generation` 的说明。 */
    private rescheduleIfCurrent(generation: number): void {
        if (generation !== this.generation) {
            logger.debug("auto sync not rescheduled: automatics was restarted");
            return;
        }
        // 与 `start()` 同一句兜底：周期为 0 时**不许**再起表（否则是死循环）。
        const interval = this.settings().intervalMinutes;
        if (interval > 0) this.schedule(interval);
    }

    // ── 时间戳 ────────────────────────────────────────────────────────────

    private lastRan(): number | undefined {
        try {
            const raw = this.service.deps.app.loadLocalStorage(STORAGE_KEY);
            const value = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
            return Number.isFinite(value) ? value : undefined;
        } catch {
            return undefined;
        }
    }

    private markRan(): void {
        try {
            this.service.deps.app.saveLocalStorage(STORAGE_KEY, Date.now());
        } catch {
            // 存不进去只是丢掉「续表」能力，下一轮从完整间隔开始，无伤大雅。
        }
    }
}

// ── 时间戳存取 ──────────────────────────────────────────────────────────────

/**
 * 时间戳**按库隔离**存储。
 *
 * 用 `app.saveLocalStorage`（Obsidian ≥1.8.7 的按库 API）而不是原生
 * `globalThis.localStorage`：后者是所有库共用的一个存储区，
 * 于是「A 库刚自动提交过」会让「B 库刚打开就立刻提交一次」，
 * 两个库的自动周期互相干扰。
 *
 * 参考项目 obsidian-git 也是用 `app.saveLocalStorage`，
 * 而且专门写了一段迁移把老数据从原生 localStorage 搬过来 —— 说明这是个已修过的问题。
 *
 * 键名 2026-10-02 从 `obsync-last-auto-commit` 改成 `-sync`：定时器只剩一条，
 * 而它跑的是整条链路。老键留着不读也没关系 —— 读到空的时间戳只意味着
 * 「这一轮从完整间隔开始」。*/
const STORAGE_KEY = "obsync-last-auto-sync";

/** 距下次执行的分钟数：间隔减去已流逝时间，至少 0。 */
function remaining(last: number | undefined, intervalMinutes: number): number {
    if (last === undefined) return intervalMinutes;

    const elapsedMinutes = (Date.now() - last) / 60_000;
    return Math.max(0, intervalMinutes - elapsedMinutes);
}
