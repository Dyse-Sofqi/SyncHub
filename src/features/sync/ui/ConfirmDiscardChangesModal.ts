import { Modal, Setting, type App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";

/**
 * 「放弃更改」的确认弹窗 —— 这个动作的**唯一入口**。
 *
 * ## 为什么必须有这一步
 *
 * 它是本插件里**唯一一个会丢用户编辑**的动作，而且丢了就没了：被放弃的改动
 * **从来没被提交过**，不在 git 里，`git fsck` 也找不回来。别的破坏性动作
 * （退出跟踪、停止跟踪本地状态文件、深度清理）都还能退 —— 只有这一个不能。
 *
 * 所以：列出**具体哪几个文件**（不是一句「确定吗」）、把「不可逆」写在正文里、
 * 确认按钮用警示色（`setWarning()`，与「放弃本次合并」同一档）。
 *
 * ## 顺带说一句「文件恢复」
 *
 * 如果 Obsidian 的「文件恢复」核心插件开着，它那里**可能**还留着这个文件最近的
 * 快照 —— 那是用户此刻唯一的退路。但**不能承诺**：它按 5 分钟节流，
 * 刚改完就放弃的话那份快照可能还没写下去。所以文案是「可能还有一份，但别指望它」，
 * 而不是「可以恢复」。
 *
 * ## 关掉弹窗 = 什么都不做
 *
 * 与 `ConfirmUntrackImagesModal` 一致。
 */

export class ConfirmDiscardChangesModal extends Modal {
    constructor(
        app: App,
        private readonly t: LocaleStrings,
        /** 将被放弃改动的路径。 */
        private readonly files: string[],
        private readonly onConfirm: () => void | Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const t = this.t.sync.discard.modal;
        const { contentEl } = this;

        this.titleEl.setText(t.title);
        contentEl.createEl("p", { text: t.intro, cls: "setting-item-description" });

        contentEl.createEl("p", { text: t.filesHeading, cls: "obsync-warning-heading" });
        const list = contentEl.createEl("ul", { cls: "obsync-diag-list" });
        for (const file of this.files) list.createEl("li", { text: file });

        const warning = contentEl.createDiv();
        warning.createEl("p", { text: t.warningHeading, cls: "obsync-warning-heading" });
        warning.createEl("p", { text: t.warningRestore });
        warning.createEl("p", { text: t.warningIrreversible });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t.cancel).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t.confirm)
                    // 警示色：这是唯一会丢编辑的动作，视觉上要和「取消」拉开距离。
                    .setWarning()
                    .onClick(() => {
                        void this.onConfirm();
                        this.close();
                    })
            );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
