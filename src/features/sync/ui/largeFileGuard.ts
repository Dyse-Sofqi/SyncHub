import type { App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import type { Notifier } from "../../../core/notice";
import type { SyncOutcome } from "../types";
import type { SyncService } from "../syncService";
import { LargeFilesModal } from "./LargeFilesModal";

/**
 * 把「提交 / 同步」包一层：被大文件拦下时弹窗问一次，用户选完再重试。
 *
 * ## 为什么抽成一个函数
 *
 * 这个动作有四个入口：面板上的「提交」与「立即同步」，命令面板上的两条命令。
 * 四处各写一遍「拿到 outcome → 判断 kind → 弹窗 → 重试」的话，迟早会漏掉一处 ——
 * 而漏掉的那一处表现是**静默不提交**（用户点了没反应），是最难被发现的一种坏。
 *
 * ## 为什么重试时带 allowLargeFiles
 *
 * 那是**一次性放行**（见 `SyncService.commitAll`）：用户已经看过清单并做了选择，
 * 再问一遍只会让人以为插件没记住他的答案。
 *
 * ## 为什么弹窗要 await
 *
 * 调用方的 `run()` 会在这段期间保持「动作进行中」（面板禁用按钮、状态栏转圈）。
 * 不等的话弹窗还开着，界面就已经恢复空闲 —— 用户点第二次时两个动作会撞在一起。
 */
export interface LargeFileGuardDeps {
    app: App;
    t: LocaleStrings;
    notifier: Notifier;
    service: SyncService;
    /** 大文件阈值（MB）—— 只用于弹窗文案，让「多大算大」当场可见。 */
    thresholdMb: number;
}

export async function runWithLargeFileGuard(
    deps: LargeFileGuardDeps,
    run: (options: { allowLargeFiles?: boolean }) => Promise<SyncOutcome>
): Promise<void> {
    // 第一次照常跑：绝大多数提交没有大文件，这一步就是全部开销
    // （只有被拦下时才多读一次文件大小，见 `SyncService.doCommitAll`）。
    const first = await run({});
    if (first.kind !== "large-files-pending") return;

    const files = first.largeFiles ?? [];
    if (files.length === 0) return;

    await new Promise<void>((resolve) => {
        const modal = new LargeFilesModal(deps.app, deps.t, files, deps.thresholdMb, (action) => {
            // 弹窗回调是同步调用的（`onConfirm` 之后立刻 `close()`），
            // 所以这里必须自己开一个异步上下文 —— 否则 `resolve` 会在重试之前跑。
            void (async () => {
                try {
                    if (action === "untrack") {
                        const added = await deps.service.ignoreLargeFiles(files);
                        deps.notifier.success(
                            deps.t.sync.largeFiles.untracked(files.length, added)
                        );
                    }
                    // 「退出跟踪」之后那些文件已经不在待提交清单里了；「仍然提交」则
                    // 带着放行标志。两种情况都重跑一次 —— 用户要的是「把这件事做完」，
                    // 让他再点一遍按钮是多余的。
                    await run({ allowLargeFiles: true });
                } catch (err) {
                    deps.notifier.reportError(err);
                } finally {
                    resolve();
                }
            })();
        });
        // 关掉弹窗（Esc / 点外面 / 取消）= 什么都不做，但这一轮动作要收尾。
        modal.onDismiss = resolve;
        modal.open();
    });
}
