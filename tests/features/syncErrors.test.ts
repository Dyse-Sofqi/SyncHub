import { describe, expect, it } from "vitest";
import { Notifier, type ErrorTranslator } from "../../src/core/notice";
import { en } from "../../src/core/i18n/locales/en";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import {
    ConflictError,
    GitAuthError,
    GitBinaryMissingError,
    GitCredentialUsernameRejectedError,
    GitNotRepoError,
    GitTimeoutError,
    HistoryRewriteEmptiedError,
    HistoryRewriteRefusedError,
    PushRejectedError,
    UnrelatedHistoriesError,
    describeSyncError,
} from "../../src/features/sync/errors";

/**
 * 同步错误的**展示层**翻译。
 *
 * 背景：git 层（`simpleGitManager.mapError`）拿不到 `t`，所以它抛的是技术性描述
 * （英文，给日志和排查用）；用户能看懂的话由 `describeSyncError` 按类型拼。
 *
 * 早期实现把中文文案直接烘焙进了错误 message，而 `Notifier` 对 `ObsyncError`
 * 是原样返回 —— 于是**英文界面下会冒出一句中文错误**。
 * 这组用例就是锁住「文案来自 locale 而不是错误本身」。
 */

function createNotifier(locale: typeof zhCN | typeof en, showNotices = true): Notifier {
    return new Notifier({
        getShowNotices: () => showNotices,
        getT: () => locale as typeof zhCN,
    });
}

describe("describeSyncError", () => {
    it("把每种 git 错误映射到中文文案", () => {
        expect(describeSyncError(new GitBinaryMissingError("git executable not found"), zhCN)).toBe(
            zhCN.sync.gitNotFound
        );
        expect(describeSyncError(new GitNotRepoError("not a git repository"), zhCN)).toBe(
            zhCN.sync.notARepo
        );
        expect(describeSyncError(new GitAuthError("remote auth failed"), zhCN)).toBe(
            zhCN.sync.gitAuthFailed
        );
        expect(
            describeSyncError(new GitCredentialUsernameRejectedError("bad username"), zhCN)
        ).toBe(zhCN.sync.gitCredentialUsernameRejected);
        expect(describeSyncError(new PushRejectedError("push rejected"), zhCN)).toBe(
            zhCN.sync.pushRejected
        );
        // 卡住被中止：必须说出「超时 + 去查网络」，否则用户只能继续盯着
        // 「正在推送…」等一个不会来的结果（他报的就是这个症状）。
        expect(describeSyncError(new GitTimeoutError("block timeout reached"), zhCN)).toBe(
            zhCN.sync.gitTimeout
        );
    });

    /**
     * 「本地与远端没有共同提交」（2026-10-10，用户实测报的）。
     *
     * 用户看到的是 git 的英文原文 `fatal: refusing to merge unrelated histories`，
     * 而此刻唯一该做的事是**强制推送一次**。所以这条文案有两处硬要求：
     * 说清「重写历史之后还没强制推送」，以及**指出强制推送在哪**（那个弹窗已经关了）。
     */
    it("「没有共同提交」要说清是重写之后没推，并指出强制推送在哪", () => {
        const text = describeSyncError(new UnrelatedHistoriesError("unrelated"), zhCN);

        expect(text).toBe(zhCN.sync.unrelatedHistories);
        // 不能退化成推送被拒那句 —— 那会引导用户去「先拉取」，而拉取同样走不通。
        expect(text).not.toBe(zhCN.sync.pushRejected);
        expect(text).toContain("强制推送");
        expect(text).toContain(zhCN.settings.sync.cleanupHeading);
        expect(describeSyncError(new UnrelatedHistoriesError("unrelated"), en)).toBe(
            en.sync.unrelatedHistories
        );
    });

    /**
     * 重写的两种失败（2026-10-10，用户实测报的）。
     *
     * 共同要求：**绝不能把 git 的英文原文弹给用户**（他原话就是「弹框提示没适配中文」）。
     * 两句的落点不同：前者是「重试一次」（插件会自动覆盖那份中间引用），
     * 后者是「**已经还原了，库是好的**」+「少勾一些路径」。
     */
    it("重写被 refs/original 挡住 / 把历史清空，各有各的中文话", () => {
        const refused = describeSyncError(new HistoryRewriteRefusedError("refused"), zhCN);
        expect(refused).toBe(zhCN.sync.cleanup.rewriteRefused);
        expect(refused).toContain("重试");
        expect(describeSyncError(new HistoryRewriteRefusedError("refused"), en)).toBe(
            en.sync.cleanup.rewriteRefused
        );

        const emptied = describeSyncError(new HistoryRewriteEmptiedError("emptied"), zhCN);
        expect(emptied).toBe(zhCN.sync.cleanup.rewriteEmptied);
        // 用户只点了一个「确认重写」，所以必须告诉他「已经还原了」——
        // 否则他会以为库坏了、要自己去把分支找回来。
        expect(emptied).toContain("还原");
        expect(describeSyncError(new HistoryRewriteEmptiedError("emptied"), en)).toBe(
            en.sync.cleanup.rewriteEmptied
        );
    });

    it("**用户名被拒与令牌失效给出不同文案**（并进一条会把用户指去查令牌）", () => {
        // 令牌是好的、问题在用户名时，若复用 gitAuthFailed，用户会去反复检查
        // 一个没问题的令牌 —— 这就是「错误类型用错比没有类型更糟」。
        const usernameRejected = describeSyncError(
            new GitCredentialUsernameRejectedError("x"),
            zhCN
        );
        const tokenBad = describeSyncError(new GitAuthError("x"), zhCN);

        expect(usernameRejected).not.toBe(tokenBad);
        expect(usernameRejected).toContain("用户名");
        // 且必须说清「令牌没问题」，否则用户还是会去查令牌
        expect(usernameRejected).toContain("令牌");
    });

    it("冲突错误带上文件数量", () => {
        const error = new ConflictError("conflict", ["a.md", "b.md"]);

        expect(describeSyncError(error, zhCN)).toBe(zhCN.sync.conflictDetected(2));
        expect(describeSyncError(error, en)).toBe(en.sync.conflictDetected(2));
    });

    it("认不出的错误返回 undefined，交回通用规则", () => {
        expect(describeSyncError(new Error("boom"), zhCN)).toBeUndefined();
        expect(describeSyncError("not an error", zhCN)).toBeUndefined();
    });

    it("**英文界面下给出英文文案**（这是这条链路存在的理由）", () => {
        const error = new GitBinaryMissingError("git executable not found");

        expect(describeSyncError(error, en)).toBe(en.sync.gitNotFound);
        // 技术性描述里不该混入中文 —— 它会进日志，也可能在兜底路径里露出来。
        expect(error.message).not.toMatch(/[\u4e00-\u9fff]/);
    });
});

describe("Notifier 的错误翻译器注册", () => {
    it("优先使用注册的翻译器", () => {
        const notifier = createNotifier(en);
        notifier.registerErrorTranslator(describeSyncError);

        expect(notifier.describeError(new GitBinaryMissingError("nope"))).toBe(
            en.sync.gitNotFound
        );
    });

    it("未注册时退化为返回错误自身的 message（就是修复前的行为）", () => {
        const notifier = createNotifier(en);
        const error = new GitBinaryMissingError("git executable not found");

        expect(notifier.describeError(error)).toBe("git executable not found");
    });

    it("多个翻译器按注册顺序尝试，第一个认出的胜出", () => {
        const notifier = createNotifier(zhCN);
        const first: ErrorTranslator = () => "第一个";
        const second: ErrorTranslator = () => "第二个";
        notifier.registerErrorTranslator(first);
        notifier.registerErrorTranslator(second);

        expect(notifier.describeError(new Error("x"))).toBe("第一个");
    });

    it("翻译器返回 undefined 时继续交给后面的翻译器", () => {
        const notifier = createNotifier(zhCN);
        const pass: ErrorTranslator = () => undefined;
        notifier.registerErrorTranslator(pass);
        notifier.registerErrorTranslator(describeSyncError);

        expect(notifier.describeError(new GitNotRepoError("not a git repository"))).toBe(
            zhCN.sync.notARepo
        );
    });

    it("翻译器不认识的错误仍走通用兜底（host 层错误不受影响）", () => {
        const notifier = createNotifier(zhCN);
        notifier.registerErrorTranslator(describeSyncError);

        // 普通 Error + fallback
        expect(notifier.describeError(new Error("boom"), "操作失败")).toBe("操作失败：boom");
    });
});
