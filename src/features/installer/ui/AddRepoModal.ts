import { Modal, Setting, type App, type ButtonComponent } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import { logger } from "../../../core/logger";
import { formatRepoId } from "../../../host/repoRef";
import type { RepoRef } from "../../../host/types";
import type { CommunityPluginIndex } from "../communityPlugins";
import { downloadSourceLabel, hostLabel } from "../downloadSource";
import { InstallerError } from "../errors";
import type {
    InstallerService,
    ResolvedRepo,
    ResolvedThemeRepo,
    VersionOption,
} from "../installerService";
import type { InstallResult, ThemeInstallResult, TrackedKind } from "../types";
import { CommunityPluginModal } from "./CommunityPluginModal";
import { VersionSuggestModal } from "./VersionSuggestModal";

/**
 * 添加仓库 —— 安装器的主入口，**插件与主题共用**。
 *
 * 流程：输入地址 → 识别（解析平台 + 可选镜像发现）→ 选版本 → 安装。
 * 主题那一侧少了中间两步：主题没有版本钉选，新装也不做镜像发现
 * （判据见 `InstallerService.installTheme`）。
 *
 * ## 为什么两种对象共用一个弹窗，而不是各写一个
 *
 * 两条流程的骨架逐字相同（输入 → 识别 → 装），只有「识别哪一套、装完之后做什么」
 * 分叉。分成两个类的话，那段「输入变化时不重建内容区、只改按钮禁用态」的细节
 * （见 `resolveButton` 的注释）要维护两份，而它踩过一次坑。
 *
 * ## 用户填错入口时要说得出下一步
 *
 * 2026-10-05 用户报的问题：把**主题**仓库地址填进「添加插件仓库」，只会拿到
 * 「缺少必需文件：main.js」—— 一句话把用户留在原地。现在失败后会探一次对面那个
 * 标志性文件（`looksLikeKind`），确有的话给出「改为按主题安装」那个按钮
 * （见 `maybeSuggestOtherKind`）。反方向同理。
 *
 * 与参考项目 BRAT 的 `AddNewPluginModal` 相比，这里把「识别」做成显式一步：
 * BRAT 是在输入框失焦时自动去拉版本列表，用户看不到"正在识别什么、
 * 识别成了哪个平台"。多平台之后这个反馈变得必要 ——
 * 用户需要知道 `owner/repo` 被认成了 GitHub 还是 Gitee。
 */
export class AddRepoModal extends Modal {
    private repoInput = "";
    private version = "latest";
    private enableAfterInstall = true;
    /**
     * 是否采用探测到的镜像。**默认不采用** —— 镜像发现只是提出候选，
     * 采用要用户明示（理由见 `ConfirmMirrorModal` 里那段警告与
     * `installer.mirrorSuggestions` 的注释）。
     */
    private useMirror = false;

    /** 这次要装哪一类对象。可以在弹窗里被「改为按…安装」那个按钮改掉。 */
    private kind: TrackedKind;

    private resolved: ResolvedRepo | undefined;
    /** 主题那一侧的识别结果（两条路互斥，见 `resolve`）。 */
    private resolvedTheme: ResolvedThemeRepo | undefined;
    /**
     * 「这个仓库其实是另一类对象」——安装失败后探出来的结论。
     * 非空时那一段改成提示 + 一个换入口的按钮（见 `renderResolved`）。
     */
    private suggestion: TrackedKind | undefined;

    private versions: VersionOption[] = [];
    /** 拉版本列表失败时的说明，用于在界面上给出解释而不是静默降级。 */
    private versionError: string | undefined;
    /**
     * 正在做什么。用具体阶段而不是布尔量 —— 弹窗里要显示「正在识别…」
     * 还是「正在安装…」，笼统的「加载中…」会让用户不知道卡在哪一步。
     */
    private busy: "resolving" | "installing" | undefined;
    /**
     * 「识别」按钮的实例。
     *
     * 按钮可用性取决于输入内容，但输入变化时**不能**调 `render()` —— 它会
     * `contentEl.empty()` 重建整个内容区，输入框随之销毁，用户每敲一个字就丢
     * 焦点与光标。所以留住实例，在 onChange 里就地改禁用态。
     */
    private resolveButton: ButtonComponent | undefined;

    constructor(
        app: App,
        private readonly service: InstallerService,
        private readonly index: CommunityPluginIndex,
        private readonly t: LocaleStrings,
        /** 装插件还是装主题。主题模式见文件头。 */
        kind: TrackedKind = "plugin",
        private readonly onInstalled?: (
            result: InstallResult | ThemeInstallResult
        ) => void
    ) {
        super(app);
        this.kind = kind;
    }

    onOpen(): void {
        this.titleEl.setText(this.titleText());
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private get isTheme(): boolean {
        return this.kind === "theme";
    }

    private titleText(): string {
        return this.isTheme ? this.t.installer.themeModalTitle : this.t.installer.modalTitle;
    }

    private render(): void {
        const t = this.t;
        const { contentEl } = this;
        contentEl.empty();
        // 内容区已重建，旧按钮实例作废 —— 否则 onChange 会改到已脱离文档的元素上
        this.resolveButton = undefined;
        // 标题也在这里设：换入口那个按钮会就地改 `kind`（见 `switchKind`），
        // 只在 onOpen 里设一次的话标题会停在旧的那一类上。
        this.titleEl.setText(this.titleText());

        const repoRow = new Setting(contentEl)
            .setName(t.installer.repoLabel)
            .setDesc(this.isTheme ? t.installer.themeRepoDesc : t.installer.repoDesc)
            .addText((text) => {
                text.setPlaceholder(t.installer.repoPlaceholder)
                    .setValue(this.repoInput)
                    .setDisabled(this.busy !== undefined);
                text.onChange((value) => {
                    this.repoInput = value;
                    this.syncResolveButton();
                });
                text.inputEl.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        void this.resolve();
                    }
                });
                // 让用户一进来就能直接粘贴
                window.setTimeout(() => text.inputEl.focus(), 0);
            })
            .addButton((button) => {
                this.resolveButton = button;
                button
                    .setButtonText(t.installer.resolve)
                    .setDisabled(this.resolveDisabled())
                    .onClick(() => void this.resolve());
            });

        // 「浏览社区插件」只对插件成立：它走的是官方**插件**索引（主题索引里只有
        // name + repo，没有可浏览的条目结构）。主题模式下干脆不画这个按钮 ——
        // 画出来再灰掉会让用户以为「主题也能浏览，只是现在不能用」。
        if (!this.isTheme) {
            repoRow.addButton((button) =>
                button
                    .setButtonText(t.installer.browse)
                    .setDisabled(this.busy !== undefined)
                    .onClick(() => void this.browseCommunity())
            );
        }

        if (this.busy) {
            contentEl.createEl("p", {
                text: this.busy === "resolving" ? t.installer.resolving : t.installer.installing,
                cls: "obsync-modal-status",
            });
            return;
        }

        if (this.resolved || this.resolvedTheme) this.renderResolved(contentEl);
    }

    /** 这次安装实际会用的地址：勾了镜像才是镜像。 */
    private targetRef(): RepoRef {
        const resolved = this.resolved!;
        return this.useMirror && resolved.mirror ? resolved.mirror : resolved.ref;
    }

    private renderResolved(contentEl: HTMLElement): void {
        const t = this.t;

        if (this.isTheme) {
            this.renderResolvedTheme(contentEl);
            return;
        }

        const resolved = this.resolved!;
        const target = this.targetRef();

        contentEl.createEl("p", {
            text: t.installer.resolved(hostLabel(t, target.host), formatRepoId(target)),
            cls: "obsync-modal-status",
        });

        // 装错入口：这个仓库里其实是主题。给出能走下去的下一步，
        // 而不是让用户对着「缺少必需文件：main.js」自己猜。
        if (this.suggestion) {
            this.renderSuggestion(contentEl);
            return;
        }

        // 探测到镜像时**只提出候选**：勾选之前一直用源仓库。开关放这里而不是
        // 自动采用，是因为判据（两边 manifest 的 id 相同）证明不了「同一份代码」——
        // 详见 `ConfirmMirrorModal` 里那段警告。
        if (resolved.mirror) {
            const mirror = resolved.mirror;
            new Setting(contentEl)
                .setName(
                    t.installer.mirrorConfirmCandidate(
                        hostLabel(t, mirror.host),
                        formatRepoId(mirror)
                    )
                )
                .setDesc(t.installer.mirrorToggleDesc)
                .addToggle((toggle) =>
                    toggle.setValue(this.useMirror).onChange((value) => {
                        this.useMirror = value;
                        // 上面那行「已识别为」要跟着变 —— 它才是安装真正用的地址。
                        this.render();
                    })
                );

            // 检测到但**不采用**时，也必须把「检测到了什么」说出来，
            // 否则用户以为没探测到（这正是这一整块要修的那个体验问题）。
            if (!this.useMirror) {
                contentEl.createEl("p", {
                    text: t.installer.mirrorUnused(
                        hostLabel(t, mirror.host),
                        formatRepoId(mirror)
                    ),
                    cls: "obsync-modal-warning",
                });
            }
        }

        new Setting(contentEl)
            .setName(t.installer.versionLabel)
            .addDropdown((dropdown) => {
                for (const option of this.versions) {
                    dropdown.addOption(option.value, option.label);
                }
                dropdown.setValue(this.version);
                dropdown.onChange((value) => {
                    this.version = value;
                });
            })
            .addExtraButton((button) =>
                button
                    .setIcon("list")
                    .setTooltip(t.installer.versionLabel)
                    .setDisabled(this.versions.length <= 1)
                    .onClick(() => {
                        new VersionSuggestModal(this.app, this.versions, t, (option) => {
                            this.version = option.value;
                            this.render();
                        }).open();
                    })
            );

        if (this.versionError) {
            contentEl.createEl("p", {
                text: this.versionError,
                cls: "obsync-modal-warning",
            });
        }

        new Setting(contentEl).setName(t.installer.enableAfterInstall).addToggle((toggle) =>
            toggle.setValue(this.enableAfterInstall).onChange((value) => {
                this.enableAfterInstall = value;
            })
        );

        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText(t.installer.install)
                .setCta()
                .onClick(() => void this.install())
        );
    }

    /**
     * 主题那一侧的结果区。
     *
     * 比插件少三行，但**多两行必须说的话**：
     *
     * - 「主题：名字 版本」—— 目录名由远端 manifest 的 `name` 现算，用户在
     *   「外观」里要按这个名字找它；
     * - 「装好后到 外观 → 主题 里选它」—— 我们不替用户切换主题（见 `installTheme`
     *   的第 4 条），不说这句的话用户会以为装完没生效。
     */
    private renderResolvedTheme(contentEl: HTMLElement): void {
        const t = this.t;
        const resolved = this.resolvedTheme!;

        contentEl.createEl("p", {
            text: t.installer.resolved(
                hostLabel(t, resolved.ref.host),
                formatRepoId(resolved.ref)
            ),
            cls: "obsync-modal-status",
        });

        if (this.suggestion) {
            this.renderSuggestion(contentEl);
            return;
        }

        contentEl.createEl("p", {
            text: t.installer.themeResolved(
                resolved.manifest.name,
                resolved.manifest.version
            ),
            cls: "obsync-modal-status",
        });

        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText(t.installer.themeInstall)
                .setCta()
                .onClick(() => void this.installTheme())
        );

        contentEl.createEl("p", {
            text: t.installer.themeAfterInstallHint,
            cls: "obsync-modal-hint",
        });
    }

    /**
     * 「这个地址其实是另一类对象」那一段：一句话说清看到了什么 + 一个换入口的按钮。
     *
     * `switchKind` 会重跑一次「识别」而不是把已经识别好的东西搬过去：换一类对象
     * 就是另一件事，识别结论、版本列表、镜像勾选全都作废（主题那边连识别用的
     * 接口都不一样）。
     */
    private renderSuggestion(contentEl: HTMLElement): void {
        const t = this.t;
        const other = this.suggestion!;

        contentEl.createEl("p", {
            cls: "obsync-modal-warning",
            text: other === "theme" ? t.installer.looksLikeTheme : t.installer.looksLikePlugin,
        });

        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText(
                    other === "theme" ? t.installer.switchToTheme : t.installer.switchToPlugin
                )
                .setCta()
                .onClick(() => this.switchKind(other))
        );
    }

    /** 换成另一类对象并重新识别。 */
    private switchKind(kind: TrackedKind): void {
        this.kind = kind;
        this.suggestion = undefined;
        this.resolved = undefined;
        this.resolvedTheme = undefined;
        this.versions = [];
        this.version = "latest";
        this.versionError = undefined;
        this.useMirror = false;
        void this.resolve();
    }

    /** 空地址没有可识别的东西；识别中也不该重复触发。 */
    private resolveDisabled(): boolean {
        return this.busy !== undefined || this.repoInput.trim().length === 0;
    }

    /** 输入变化后就地刷新按钮可用性（不重建内容区，保住焦点与光标）。 */
    private syncResolveButton(): void {
        this.resolveButton?.setDisabled(this.resolveDisabled());
    }

    /** 识别仓库地址，并顺带拉取可选版本（主题没有版本，只有插件那一步）。 */
    private async resolve(): Promise<void> {
        const t = this.t;
        if (!this.repoInput.trim()) return;

        this.busy = "resolving";
        this.versionError = undefined;
        // 换了地址就是另一件事了，上一次的镜像勾选与「装错入口」的结论都作废。
        this.useMirror = false;
        this.suggestion = undefined;
        this.render();

        try {
            if (this.isTheme) {
                this.resolvedTheme = await this.service.resolveThemeRepo(this.repoInput);
                this.resolved = undefined;
            } else {
                this.resolved = await this.service.resolveRepo(this.repoInput);
                this.resolvedTheme = undefined;
                this.versions = [
                    { value: "latest", label: t.installer.versionLatest, prerelease: false },
                ];
                this.version = "latest";
            }
        } catch (err) {
            logger.warn("resolve failed", err);
            this.busy = undefined;
            this.resolved = undefined;
            this.resolvedTheme = undefined;
            this.render();
            this.service.deps.notifier.reportError(err);
            return;
        }

        this.busy = undefined;
        this.render();

        if (this.isTheme) return;

        // 版本列表单独拉，失败不影响安装（降级到源码通道照样能装）。
        try {
            const versions = await this.service.listVersions(this.resolved!.ref);
            this.versions = versions;
        } catch (err) {
            logger.warn("listing versions failed", err);
            this.versionError = this.service.deps.notifier.describeError(
                err,
                t.installer.versionListFailed
            );
        }
        this.render();
    }

    private async browseCommunity(): Promise<void> {
        const t = this.t;
        try {
            await this.index.load();
        } catch (err) {
            this.service.deps.notifier.reportError(err, t.installer.communityLoadFailed);
            return;
        }

        new CommunityPluginModal(this.app, this.index, t, (plugin) => {
            this.repoInput = plugin.repo;
            this.render();
            void this.resolve();
        }).open();
    }

    private async install(): Promise<void> {
        const t = this.t;
        if (!this.resolved) return;

        this.busy = "installing";
        this.render();

        try {
            const target = this.targetRef();
            const usingMirror = target !== this.resolved.ref;
            const result = await this.service.install({
                repo: formatRepoId(target),
                version: this.version,
                enableAfterInstall: this.enableAfterInstall,
                // 已经在 resolveRepo 阶段做过镜像发现，这里不要重复做。
                allowMirror: false,
                defaultHost: target.host,
                // 源地址只能由这里交出去 —— 用镜像时 `repo` 已经是镜像地址了，
                // 用户填的那个地址没有别的地方可放（列表要同时显示两个地址）。
                origin: usingMirror ? this.resolved.ref : undefined,
            });

            // 两条都报来源：用户看不出「没走镜像」与「没探测镜像」的区别，
            // 这条提示是他唯一能确认「东西实际从哪来」的地方。
            const source = downloadSourceLabel(t, result);
            const message = result.replaced
                ? t.installer.updated(result.manifest.name, result.version, source)
                : t.installer.installed(result.manifest.name, result.version, source);
            this.service.deps.notifier.success(message);
            this.onInstalled?.(result);
            this.close();
        } catch (err) {
            await this.finishWithError(err, this.resolved.ref);
        }
    }

    /**
     * 装一个主题。与 `install` 分开而不是合成一个方法：两者的**结果结构、
     * 提示文案、失败后要探什么都不一样**，硬合成会在每个使用点分叉。
     */
    private async installTheme(): Promise<void> {
        const t = this.t;
        const resolved = this.resolvedTheme;
        if (!resolved) return;

        this.busy = "installing";
        this.render();

        try {
            const result = await this.service.installTheme({
                repo: formatRepoId(resolved.ref),
                defaultHost: resolved.ref.host,
            });

            const source = downloadSourceLabel(t, result);
            const message =
                (result.replaced
                    ? t.installer.updated(result.id, result.version, source)
                    : t.installer.themeInstalled(result.id, result.version, source)) +
                "\n" +
                t.installer.themeAfterInstallHint;
            this.service.deps.notifier.success(message);
            this.onInstalled?.(result);
            this.close();
        } catch (err) {
            await this.finishWithError(err, resolved.ref);
        }
    }

    /**
     * 失败时的共同出口：报错，并**顺手探一次**「是不是入口选错了」。
     *
     * 只在 `missingRequiredFiles` 这一种错误上探：它才是「这个仓库里没有这类对象
     * 的标志性文件」的表现。网络类的失败（`assetDownloadFailed`）不该被读成
     * 「你走错门了」—— 那会把用户指去点一个换了也装不上的按钮。
     */
    private async finishWithError(err: unknown, ref: RepoRef): Promise<void> {
        this.busy = undefined;
        await this.maybeSuggestOtherKind(err, ref);
        this.render();
        this.service.deps.notifier.reportError(err, this.t.installer.installFailed);
    }

    private async maybeSuggestOtherKind(err: unknown, ref: RepoRef): Promise<void> {
        if (!(err instanceof InstallerError)) return;
        if (err.detail.kind !== "missingRequiredFiles") return;

        const other: TrackedKind = this.isTheme ? "plugin" : "theme";
        if (await this.service.looksLikeKind(ref, other)) this.suggestion = other;
    }
}
