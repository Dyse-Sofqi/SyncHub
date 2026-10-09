import { Modal, Setting, type App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";

/**
 * 「停止跟踪本地状态文件」的确认弹窗 —— 这个动作的**唯一入口**。
 *
 * ## 为什么要有这一步
 *
 * 它做两件用户看不完全的事：把几条规则写进 `.gitignore`，以及把已经跟踪的那些文件
 * 从 git 的**索引**里摘掉。后者会在下一次同步时记下一条「删除」并推到远端 ——
 * 别的设备拉取时工作区里那些文件会被 git 删掉，再由 Obsidian 自己重新生成
 * （`workspace.json` 这类文件本来就是每次启动都会重写的，所以**本地不会真的少东西**）。
 * 这个连锁反应不写出来，用户只会在另一台设备上看到「布局乱了」而不知道为什么。
 *
 * ## 为什么必须解释「为什么要做这件事」
 *
 * 这个动作的名字（「停止跟踪本地状态文件」）本身不像一个用户会主动想点的东西 ——
 * 他不觉得光标位置进 git 有什么问题。所以 intro 要把**代价**说清楚：
 * 重写历史的开销只吃提交数，而这些文件每开关一个标签就变，等于每个同步周期都
 * 白白多一个提交。不说这一层，用户会以为这是插件的洁癖。
 *
 * ## 关掉弹窗 = 什么都不做
 *
 * 与 `ConfirmUntrackImagesModal` 一致：这一步什么都不做才是安全的那一侧。
 */

export class ConfirmUntrackLocalStateModal extends Modal {
    constructor(
        app: App,
        private readonly t: LocaleStrings,
        /** 当前**已被跟踪**、将被摘出索引的那些路径。 */
        private readonly files: string[],
        private readonly onConfirm: () => void | Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const t = this.t.settings.sync.localState.modal;
        const { contentEl } = this;

        this.titleEl.setText(t.title);
        contentEl.createEl("p", { text: t.intro, cls: "setting-item-description" });

        contentEl.createEl("p", { text: t.filesHeading, cls: "obsync-warning-heading" });
        const list = contentEl.createEl("ul", { cls: "obsync-diag-list" });
        for (const file of this.files) list.createEl("li", { text: file });

        const warning = contentEl.createDiv();
        warning.createEl("p", { text: t.warningHeading, cls: "obsync-warning-heading" });
        warning.createEl("p", { text: t.warningLocal });
        warning.createEl("p", { text: t.warningOthers });
        warning.createEl("p", { text: t.warningHistory });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t.cancel).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t.confirm)
                    .setCta()
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
