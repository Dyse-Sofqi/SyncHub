import { Modal, Setting, type App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";

/**
 * 「让 git 不再跟踪图片」的确认弹窗 —— **这个动作的唯一入口**，也是**选规则形状**的地方。
 *
 * ## 为什么要有这一步确认
 *
 * 它做两件用户看不完全的事：把自己的规则写进 `.gitignore`，以及把图片从 git 索引里
 * 摘掉（下次同步会把这条「删除」推到远端）。后者会**改变其他设备拉取之后的工作区**
 * —— 那些图片的本地文件会被 git 删掉，然后由「图片同步」从 R2 补回来。这个连锁反应
 * 不写出来，用户只会在另一台设备上打开库时发现图片没了。
 *
 * ## 为什么把三步都列出来
 *
 * 用户问的就是「怎么让仓库同步不管图片」。答案不是一个开关，而是 git 的两条固有语义
 * （`.gitignore` 只管未跟踪的文件；已跟踪的要从索引里摘）加一次提交。弹窗里把三步
 * 写清楚，比事后再去翻文档有用 —— 用户下次自己配别的目录时就知道该做什么了。
 *
 * ## 两种规则形状（2026-10-02 加第二种）
 *
 * - **按文件夹**：范围与「图片同步」镜像的文件夹完全重合。图片文件夹配得很具体时用它。
 * - **按扩展名**：忽略全库这些格式的图片。适用于「图片同步范围就是整个库」——
 *   那种配置下按文件夹写等于让 git 什么都不同步。
 *
 * 用户问过「.gitignore 只能写文件夹吗？不能写图片格式吗」—— 能，所以这里让他选，
 * 并把两者的**前提**写在选项下面（扩展名那一种要求图片同步覆盖全库，否则文件夹之外
 * 的图片会两边都不管）。选择权在用户，但前提必须当场说清。
 *
 * ## 为什么还要说「历史里那些不会消失」
 *
 * `git rm --cached` 只是**停止跟踪**：已经写进历史的图片仍在 `.git` 里，仓库体积不会
 * 因此变小。想变小要在设置页「清理」里做**深度清理**（重写全部提交）—— 那是另一件
 * 有风险的事（哈希全变、必须强制推送、其他设备要重新 clone），所以它是**单独的一步**，
 * 不在这里顺手做。不说清楚的话，用户会拿「仓库大小没变」当成「没生效」。
 */

/** 规则形状。 */
export type UntrackMode = "folders" | "extensions";

export class ConfirmUntrackImagesModal extends Modal {
    /** 当前选中的形状（下拉一改就跟着变，执行时读它）。 */
    private mode: UntrackMode;

    constructor(
        app: App,
        private readonly t: LocaleStrings,
        /** 要停止跟踪的文件夹（归一后的形状，空串已由调用方滤掉）。 */
        private readonly folders: string[],
        /**
         * 哪种形状在当前设置下是**成立**的。
         *
         * 由调用方按设置算好（见 `settingsTab.untrackImageFolders`）：图片文件夹是具体的
         * → `folders`；是整个库 → `extensions`。默认选它，免得用户先点错一次再被拒绝。
         */
        preferred: UntrackMode,
        /** 适用的扩展名（用来在弹窗里列出来）。 */
        private readonly extensions: string[],
        private readonly onConfirm: (mode: UntrackMode) => void | Promise<void>
    ) {
        super(app);
        this.mode = preferred;
    }

    onOpen(): void {
        const t = this.t.settings.sync.untrack.modal;
        const { contentEl } = this;

        this.titleEl.setText(t.title);
        contentEl.createEl("p", { text: t.intro, cls: "setting-item-description" });

        const steps = contentEl.createEl("ol", { cls: "obsync-steps" });
        for (const step of t.steps) {
            steps.createEl("li", { text: step });
        }

        // 形状选择。选项描述里直接写着两种形状的**前提** —— 这是这个下拉存在的原因。
        new Setting(contentEl)
            .setName(t.modeLabel)
            .setDesc(t.modeDesc)
            .addDropdown((dropdown) => {
                dropdown.addOption("folders", t.modeFolders);
                dropdown.addOption("extensions", t.modeExtensions);
                dropdown.setValue(this.mode);
                dropdown.onChange((value) => {
                    this.mode = value === "extensions" ? "extensions" : "folders";
                    this.renderScope();
                });
            });

        // 随形状变化的那一块（文件夹清单 / 扩展名清单 + 那句专属警告）
        this.scopeEl = contentEl.createDiv();
        this.renderScope();

        const warning = contentEl.createDiv();
        warning.createEl("p", { text: t.warningHeading, cls: "obsync-warning-heading" });
        warning.createEl("p", { text: t.warningOthers });
        warning.createEl("p", { text: t.warningHistory });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t.cancel).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t.confirm)
                    .setCta()
                    .onClick(() => {
                        void this.onConfirm(this.mode);
                        this.close();
                    })
            );
    }

    /** 形状专属的那一块：清单 + 前提。 */
    private scopeEl?: HTMLElement;

    private renderScope(): void {
        const t = this.t.settings.sync.untrack.modal;
        const scope = this.scopeEl;
        if (!scope) return;
        scope.empty();

        const isFolders = this.mode === "folders";
        scope.createEl("p", {
            text: isFolders ? t.foldersLabel : t.extensionsLabel,
            cls: "obsync-warning-heading",
        });
        const list = scope.createEl("ul", { cls: "obsync-diag-list" });
        if (isFolders) {
            for (const folder of this.folders) list.createEl("li", { text: folder });
        } else {
            // 规则是**大小写各一条**，这里只列扩展名，免得清单翻倍
            for (const extension of this.extensions) list.createEl("li", { text: `*.${extension}` });
        }

        // 前提写在选项旁边，而不是藏在文档里。
        scope.createEl("p", {
            text: isFolders ? t.foldersNote : t.extensionsNote,
            cls: "setting-item-description",
        });
    }

    onClose(): void {
        // **关掉 = 取消**：只有明确点了「继续」才会走到 `onConfirm`。
        //
        // （这里与 `ConfirmDeleteRemoteModal` 刻意相反：那一边 Esc 也必须给出一个决定，
        //   因为本地文件已经删了、不表态就会「删除看起来没生效」；而这一步什么都不做
        //   才是安全的那一侧 —— 它会被用户再点一次。）
        this.contentEl.empty();
    }
}
