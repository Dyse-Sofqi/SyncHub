import { Modal, Setting, type App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import { formatBytes } from "../repoSize";
import type { LargePendingFile } from "../largeFiles";

/**
 * 「这些文件大得该问一句」的确认弹窗 —— 提交前大文件检查的**唯一出口**。
 *
 * ## 为什么必须有这一步，而不能默默提交或默默拦下
 *
 * 两种极端都是错的：
 *
 * - **默默提交**：大文件进了 git 历史就再也清不掉（要重写全部提交，本插件不做）。
 *   用户等到发现仓库几百 MB 时已经晚了 —— 这正是这个功能要避免的事。
 * - **默默拦下**：用户改了笔记、点了同步，然后什么都没发生。他会以为插件坏了。
 *
 * 所以这里必须停下来问一次，并把**两个选项各自的代价**说清楚：
 * 「仍然提交」= 它以后每次改动都会再存一份完整副本；「退出跟踪」= 它不再有版本历史。
 *
 * ## 为什么把「历史里那些不会消失」写出来
 *
 * 「退出跟踪」只让文件**以后**不再进 git：已经写进历史的那些副本仍在 `.git` 里，
 * 仓库体积不会因此变小。想变小只能重写历史（filter-repo / BFG），那是另一件有风险
 * 的事，本插件不做。不说清楚的话，用户会拿「仓库大小没变」当成「没生效」——
 * 与 `ConfirmUntrackImagesModal` 同一个坑，同一句提醒。
 *
 * ## 关掉弹窗 = 取消
 *
 * 只有明确点了按钮才会走到 `onConfirm`。与 `ConfirmUntrackImagesModal` 一致：
 * 这一步什么都不做才是安全的那一侧（用户会被再问一次），而 Esc 不该被当成
 * 「我同意提交大文件」。
 */

/** 用户在弹窗里的选择。 */
export type LargeFileAction = "commit-anyway" | "untrack";

export class LargeFilesModal extends Modal {
    /**
     * 用户**没有**选任何按钮就关掉了弹窗（Esc、点外面、取消按钮）时调用。
     *
     * 由调用方设（见 `largeFileGuard`）：它要等这一轮动作收尾 —— 不通知的话，
     * 界面会永远停在「正在提交」。
     */
    onDismiss?: () => void;

    /** 是否走过 `onConfirm` —— 决定 `onClose` 要不要调 `onDismiss`。 */
    private confirmed = false;

    constructor(
        app: App,
        private readonly t: LocaleStrings,
        /** 超过阈值的待提交文件（已按大小降序）。 */
        private readonly files: LargePendingFile[],
        /** 阈值（MB）—— 只用于文案，让「多大算大」这件事当场可见。 */
        private readonly thresholdMb: number,
        private readonly onConfirm: (action: LargeFileAction) => void | Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const t = this.t.sync.largeFiles.modal;
        const { contentEl } = this;

        this.titleEl.setText(t.title(this.files.length, this.thresholdMb));
        contentEl.createEl("p", { text: t.intro, cls: "setting-item-description" });

        const list = contentEl.createEl("ul", { cls: "obsync-large-file-list" });
        for (const file of this.files) {
            const item = list.createEl("li");
            // 大小放前面：用户扫这个清单时第一个想知道的就是「哪个最占地方」。
            item.createSpan({ cls: "obsync-large-file-size", text: formatBytes(file.bytes) });
            item.createSpan({ cls: "obsync-large-file-path", text: file.path });
            // 未跟踪的文件点出来 —— 「退出跟踪」对它们只是一条忽略规则，
            // 而对已跟踪的还要摘索引，用户能从这一眼看出差别。
            if (!file.tracked) {
                item.createSpan({ cls: "obsync-large-file-new", text: t.newBadge });
            }
        }

        const warning = contentEl.createDiv();
        warning.createEl("p", { text: t.warningHeading, cls: "obsync-warning-heading" });
        warning.createEl("p", { text: t.warningCommitAnyway });
        warning.createEl("p", { text: t.warningUntrack });
        warning.createEl("p", { text: t.warningHistory });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t.cancel).onClick(() => this.close()))
            .addButton((button) =>
                button.setButtonText(t.untrack).onClick(() => {
                    this.confirmed = true;
                    void this.onConfirm("untrack");
                    this.close();
                })
            )
            .addButton((button) =>
                button
                    .setButtonText(t.commitAnyway)
                    // 默认动作落在「仍然提交」上：用户点了同步就是要提交，
                    // 把他推到「退出跟踪」会让一次误点改变仓库的跟踪状态。
                    .setCta()
                    .onClick(() => {
                        this.confirmed = true;
                        void this.onConfirm("commit-anyway");
                        this.close();
                    })
            );
    }

    onClose(): void {
        // 关掉 = 取消，见文件头。
        this.contentEl.empty();
        if (!this.confirmed) this.onDismiss?.();
    }
}
