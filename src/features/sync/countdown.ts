/**
 * 「距离下一次同步还有多久」的写法。
 *
 * 抽成独立模块是因为它有**两个消费方**，而两处的显示必须一致：
 * 设置页「定时同步」那一行的徽标，以及仓库同步面板工具栏上那个徽标
 * （2026-10-04 用户要求「也应该在仓库同步标签页下提示倒计时」）。
 * 各写一份的话，同一个时刻在两处会显示成不同的样子 —— 而这种不一致用户一眼就会看到。
 */

/**
 * 毫秒 → 倒计时的写法：不足一小时是 `M:SS`，超过就是 `H:MM:SS`。
 *
 * 三条规则都是刻意的：
 *
 * - 负数与 0 一律按 `0:00`（表的触发与界面的刷新不是同一时刻，差个几百毫秒很正常，
 *   显示 `-0:01` 只会让人以为坏了）；
 * - **向上取整**（`Math.ceil`）：`0:00` 只在真的到点时才出现，否则每一轮的最后
 *   一秒都会被显示成 0:00 而不是 0:01；
 * - 不补零的只有「分」那一位在不足一小时时（`3:07` 而不是 `03:07`）—— 与常见的
 *   计时器一致，而小时那一段补零（`1:05:00`）。
 */
export function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (value: number): string => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
