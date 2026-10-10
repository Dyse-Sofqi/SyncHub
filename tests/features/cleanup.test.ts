import { describe, expect, it } from "vitest";
import {
    BACKUP_REF_PREFIX,
    backupRefName,
    backupStampOf,
    estimateRewriteMinutes,
    estimateRewriteSeconds,
    formatElapsed,
    normalizeRemovalPaths,
    shellQuote,
} from "../../src/features/sync/cleanup";

/**
 * 清理的共用规则。
 *
 * 这里每一件都对应一类「写错了代价很大」的输入，所以用例的重点不是覆盖率，
 * 而是**把那些输入钉死**：路径归一错了会删错目录，shell 引号错了会执行到别的东西，
 * 耗时估错了会让用户强杀一个跑了一半的重写。
 */

describe("normalizeRemovalPaths", () => {
    it("去掉首尾斜杠与空白", () => {
        // 从别处粘过来的路径常带一个尾随空格，而 git 会把它当成不存在的路径名
        // 安静跳过（--ignore-unmatch）—— 用户看到的是「点了没反应」。
        expect(normalizeRemovalPaths([" attachments/ ", " /字体 "]).paths).toEqual([
            "attachments",
            "字体",
        ]);
    });

    it("丢掉空串（拆行、拆逗号的产物）", () => {
        expect(normalizeRemovalPaths(["", "   ", "notes"]).paths).toEqual(["notes"]);
    });

    it("拒绝 `.` —— 它代表整个库，剔掉它等于清空", () => {
        const result = normalizeRemovalPaths([".", "./", "notes"]);
        expect(result.paths).toEqual(["notes"]);
        expect(result.rejected).toEqual([".", "./"]);
    });

    it("拒绝含 `..` 的任何一段（绝对路径也被剥掉前导斜杠后拒绝或归一）", () => {
        const result = normalizeRemovalPaths(["../other-repo", "a/../b"]);
        expect(result.paths).toEqual([]);
        expect(result.rejected).toEqual(["../other-repo", "a/../b"]);
    });

    it("去重但保持顺序", () => {
        expect(normalizeRemovalPaths(["a", "b", "a/", "a"]).paths).toEqual(["a", "b"]);
    });

    it("被拒绝的原样带出来 —— 界面要说清「哪几条没被采纳」", () => {
        const result = normalizeRemovalPaths([".", "keep"]);
        expect(result.rejected).toEqual(["."]);
    });
});

describe("shellQuote", () => {
    it("普通路径包单引号", () => {
        expect(shellQuote("notes")).toBe("'notes'");
    });

    it("空格、$、反引号在单引号里都是字面量", () => {
        // `--index-filter` 的值是交给 `sh` 跑的**脚本**，不是参数数组 ——
        // 不包起来的话 `$(...)` 与反引号会被真的执行。
        expect(shellQuote("我的 笔记")).toBe("'我的 笔记'");
        expect(shellQuote("a$(whoami)b")).toBe("'a$(whoami)b'");
        expect(shellQuote("a`id`b")).toBe("'a`id`b'");
    });

    it("路径里的单引号按 POSIX 规则转义（先闭合、插一个转义单引号、再打开）", () => {
        expect(shellQuote("it's")).toBe("'it'\\''s'");
    });
});

describe("estimateRewriteSeconds / estimateRewriteMinutes", () => {
    it("按实测系数 3.5 秒/提交估算，并且宁可偏高", () => {
        // 实测依据：159 个提交跑了 551 秒。估算给 562 秒（10 分钟）——
        // 说「1 分钟」结果跑了 9 分钟，用户会以为卡死然后强杀进程。
        expect(estimateRewriteSeconds(159)).toBe(562);
        expect(estimateRewriteMinutes(159)).toBe(10);
    });

    it("提交数无效时只算固定开销，且分钟数至少 1", () => {
        expect(estimateRewriteSeconds(0)).toBe(5);
        expect(estimateRewriteMinutes(0)).toBe(1);
        expect(estimateRewriteSeconds(Number.NaN)).toBe(5);
    });

    it("随提交数线性增长", () => {
        expect(estimateRewriteSeconds(1000)).toBe(3505);
        expect(estimateRewriteMinutes(1000)).toBe(59);
    });
});

describe("formatElapsed", () => {
    it("秒补零，分钟不补（`m:ss`）", () => {
        // 重写要跑好几分钟，界面上那个「已用 0:07」是用户唯一能看出「它在动」的数字。
        expect(formatElapsed(7)).toBe("0:07");
        expect(formatElapsed(59)).toBe("0:59");
        expect(formatElapsed(60)).toBe("1:00");
        expect(formatElapsed(151)).toBe("2:31");
    });

    it("负数 / 非有限数 / undefined 都当 0 —— 不显示 `NaN:NaN`", () => {
        // 定时器第一次跑时 `startedAt` 可能还没写好，这里必须有个安全的落点。
        expect(formatElapsed(0)).toBe("0:00");
        expect(formatElapsed(-5)).toBe("0:00");
        expect(formatElapsed(Number.NaN)).toBe("0:00");
        expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0:00");
    });

    it("超过一小时继续按分钟报（与旁边的「预计 N 分钟」对照着读）", () => {
        expect(formatElapsed(600 * 60)).toBe("600:00");
    });
});

describe("backupRefName / backupStampOf", () => {
    it("挂在 refs/obsync-backup/ 下（必须避开 --branches --tags --remotes）", () => {
        // 用 `--all` 会把备份引用也一起改写，于是备份**安静地**指向新历史 ——
        // 等于没有备份。名字在哪个命名空间下，是这件事的唯一边界。
        const name = backupRefName(new Date(2026, 9, 9, 23, 15, 0));
        expect(name).toBe("refs/obsync-backup/20261009-231500");
        expect(name.startsWith(BACKUP_REF_PREFIX)).toBe(true);
    });

    it("时间戳补零，所以名字可以直接排序", () => {
        const early = backupRefName(new Date(2026, 0, 2, 3, 4, 5));
        const late = backupRefName(new Date(2026, 11, 20, 10, 20, 30));
        expect(early).toBe("refs/obsync-backup/20260102-030405");
        expect([late, early].sort((a, b) => b.localeCompare(a))).toEqual([late, early]);
    });

    it("backupStampOf 取出时间戳；不是备份引用时 undefined", () => {
        expect(backupStampOf("refs/obsync-backup/20261009-231500")).toBe("20261009-231500");
        expect(backupStampOf("refs/heads/master")).toBeUndefined();
        expect(backupStampOf("refs/obsync-backup/")).toBeUndefined();
    });
});
