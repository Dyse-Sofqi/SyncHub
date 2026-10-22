import { Modal, Setting, type App, type ButtonComponent } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import { logger } from "../../../core/logger";
import { formatRepoId, hasExplicitHost } from "../../../host/repoRef";
import type { RepoRef } from "../../../host/types";
import type { CommunityPluginIndex } from "../communityPlugins";
import { downloadSourceLabel, hostLabel } from "../downloadSource";
import { InstallerError } from "../errors";
import type {
    HostChoice,
    InstallerService,
    ResolvedRepo,
    ResolvedThemeRepo,
    VersionOption,
} from "../installerService";
import type { InstallResult, ThemeInstallResult, TrackedKind } from "../types";
import { CommunityPluginModal } from "./CommunityPluginModal";
import { appendRepoLink } from "./repoLink";
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
 *
 * ## 平台是「可选的」，不是「猜死的」（2026-10-22）
 *
 * `owner/repo` 简写本身不含平台，而 Gitee 上同名同 owner 的仓库并不罕见。
 * 原来简写一律按 GitHub 处理，填 Gitee 的简写会拿到「GitHub 上找不到仓库」，
 * 而界面没有任何地方能改 —— 用户只能去翻文档才知道要粘贴完整链接。
 * 现在多了「识别平台」一栏：自动（依次探测）/ GitHub / Gitee，并且
 * **地址里写明平台时以地址为准**（那时下拉框会灰掉并说明原因 —— 让它看起来
 * 能改但改了没用，比灰掉更糟）。
 *
 * 结果区也从一串散落的文字改成一张卡片：平台徽标 + 等宽仓库地址 + 可点开的链接，
 * 用户核对「SyncHub 到底在跟谁说话」时只需要看这一行。
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

    /**
     * 这次要装哪一类对象。可以在弹窗里被「改为按…安装」那个按钮改掉。
     */
    private kind: TrackedKind;

    /** `owner/repo` 简写时平台从哪来。默认「自动」（见文件头最后一节）。 */
    private hostChoice: HostChoice = "auto";

    private resolved: ResolvedRepo | undefined;
    /** 主题那一侧的识别结果（两条路互斥，见 `resolve`）。 */
    private resolvedTheme: ResolvedThemeRepo | undefined;
    /**
     * 「这个仓库其实是另一类对象」——安装失败后探出来的结论。
     * 非空时那一段改成提示 + 一个换入口的按钮（见 `renderSuggestion`）。
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

    /**
     * 「识别平台」那一栏的容器，以及它上一次渲染时的「地址里写没写平台」。
     *
     * 打字时要跟着变的是**这一栏**（粘贴完整链接之后下拉框就该灰掉），
     * 但它不是输入框 —— 单独重建它不会动到用户正在打字的那个 input，
     * 所以这里可以放心 `empty()` 重画，而整页重建不行。
     */
    private platformEl: HTMLElement | undefined;
    private platformExplicit = false;

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
        contentEl.addClass("obsync-add-repo");
        // 内容区已重建，旧按钮实例作废 —— 否则 onChange 会改到已脱离文档的元素上
        this.resolveButton = undefined;
        this.platformEl = undefined;
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
                text.inputEl.addClass("obsync-add-repo-input");
                text.onChange((value) => {
                    this.repoInput = value;
                    this.syncResolveButton();
                    this.syncPlatformRow();
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
        repoRow.setClass("obsync-add-repo-field");
        // 地址那一行**上下排**（说明在上、输入框与按钮在下）：Setting 默认是
        // 「左边说明、右边控件」两栏，而地址输入框在 560px 宽的弹窗里会被挤到
        // 只剩一百多像素 —— 粘贴完整链接时连开头的 `https://` 都看不见。
        // 这个类只给地址这一行，下面「识别平台」仍是正常的两栏（见 styles.css）。
        repoRow.setClass("obsync-add-repo-stacked");

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

        const platformEl = contentEl.createDiv({ cls: "obsync-add-repo-platform-slot" });
        this.platformEl = platformEl;
        this.renderPlatformRow(platformEl);

        if (this.busy) {
            contentEl.createEl("p", {
                text: this.busy === "resolving" ? t.installer.resolving : t.installer.installing,
                cls: "obsync-modal-status",
            });
            return;
        }

        if (this.resolved || this.resolvedTheme) this.renderResolved(contentEl);
    }

    /**
     * 「识别平台」那一栏。
     *
     * 地址里写明了平台时**灰掉**并说明原因：那一刻下拉框确实不起作用
     * （`resolveRef` 让地址优先），不灰掉的话用户会以为「选了 Gitee 却没变」
     * 是 bug。灰掉时**不改写它的值** —— 用户切回简写地址之后，原来那个选择
     * 还得原样回来（同 `settingsTab` 里那条「灰开关不要改值」）。
     */
    private renderPlatformRow(parent: HTMLElement): void {
        const t = this.t;
        const explicit = hasExplicitHost(this.repoInput);
        this.platformExplicit = explicit;

        const row = new Setting(parent)
            .setName(t.installer.platformLabel)
            .setDesc(explicit ? t.installer.platformFromUrl : t.installer.platformDesc)
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("auto", t.installer.platformAuto)
                    .addOption("github", t.host.github)
                    .addOption("gitee", t.host.gitee)
                    .setValue(this.hostChoice)
                    .setDisabled(explicit || this.busy !== undefined)
                    .onChange((value) => {
                        this.hostChoice = value as HostChoice;
                        // 换平台 = 换一个仓库：上一次的识别结论、版本列表、
                        // 镜像勾选全部作废，否则界面会拿着 GitHub 的版本列表
                        // 去装 Gitee 的仓库。
                        const hadResult = this.resolved !== undefined || this.resolvedTheme !== undefined;
                        this.clearResolved();
                        // 已经识别过就立刻按新平台再识别一次 —— 用户换平台就是想看
                        // 另一个结果，让他再点一次「识别」是多余的一步。
                        if (hadResult) void this.resolve();
                        else this.render();
                    })
            );
        row.setClass("obsync-add-repo-platform");
    }

    /**
     * 输入变化后就地刷新「识别平台」那一栏 —— 只在「写没写平台」真的变了时重建。
     *
     * 每次输入都重建的话，`createdSettings` 会疯长（测试里要按顺序找控件），
     * 真机上也会让下拉框在用户打字时反复闪。
     */
    private syncPlatformRow(): void {
        const explicit = hasExplicitHost(this.repoInput);
        if (explicit === this.platformExplicit) return;
        const holder = this.platformEl;
        if (!holder) return;

        holder.empty();
        this.renderPlatformRow(holder);
    }

    /** 这次安装实际会用的地址：勾了镜像才是镜像。 */
    private targetRef(): RepoRef {
        const resolved = this.resolved!;
        return this.useMirror && resolved.mirror ? resolved.mirror : resolved.ref;
    }

    private renderResolved(contentEl: HTMLElement): void {
        const card = contentEl.createDiv({ cls: "obsync-add-repo-card" });
        this.renderCardHead(card, this.isTheme ? this.resolvedTheme!.ref : this.targetRef());

        if (this.isTheme) {
            this.renderThemeBody(card);
            return;
        }

        // 装错入口：这个仓库里其实是主题。给出能走下去的下一步，
        // 而不是让用户对着「缺少必需文件：main.js」自己猜。
        if (this.suggestion) {
            this.renderSuggestion(card);
            return;
        }

        this.renderPluginBody(card);
    }

    /**
     * 结果卡片的头：平台徽标 + 可点开的仓库地址。
     *
     * 地址做成**链接**而不是纯文本：用户核对「SyncHub 在跟谁说话」时，
     * 下一步一定是去浏览器里看那个仓库，纯文本等于让他手抄一遍
     * （理由与 `appendRepoLink` 的注释相同）。
     */
    private renderCardHead(parent: HTMLElement, ref: RepoRef): void {
        const t = this.t;
        const head = parent.createDiv({ cls: "obsync-add-repo-card-head" });
        head.createSpan({ cls: "obsync-add-repo-host", text: hostLabel(t, ref.host) });
        appendRepoLink(head, ref, formatRepoId(ref), t, "obsync-add-repo-id");

        // 平台这个结论是怎么来的。地址里写了平台就不必说（徽标已经说明了）；
        // 简写时要说 —— 自动识别出来的结论用户有权知道它是「猜的」。
        if (!hasExplicitHost(this.repoInput)) {
            parent.createDiv({
                cls: "obsync-add-repo-hint",
                text:
                    this.hostChoice === "auto"
                        ? t.installer.platformAutoHint(hostLabel(t, ref.host))
                        : t.installer.platformChosenHint(hostLabel(t, ref.host)),
            });
        }
    }

    /** 插件那一侧的结果区：镜像开关、版本、启用、安装。 */
    private renderPluginBody(card: HTMLElement): void {
        const t = this.t;
        const resolved = this.resolved!;

        // 探测到镜像时**只提出候选**：勾选之前一直用源仓库。开关放这里而不是
        // 自动采用，是因为判据（两边 manifest 的 id 相同）证明不了「同一份代码」——
        // 详见 `ConfirmMirrorModal` 里那段警告。
        if (resolved.mirror) {
            const mirror = resolved.mirror;
            new Setting(card)
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
                card.createEl("p", {
                    text: t.installer.mirrorUnused(
                        hostLabel(t, mirror.host),
                        formatRepoId(mirror)
                    ),
                    cls: "obsync-modal-warning",
                });
            }
        }

        new Setting(card)
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
            card.createEl("p", {
                text: this.versionError,
                cls: "obsync-modal-warning",
            });
        }

        new Setting(card).setName(t.installer.enableAfterInstall).addToggle((toggle) =>
            toggle.setValue(this.enableAfterInstall).onChange((value) => {
                this.enableAfterInstall = value;
            })
        );

        new Setting(card)
            .addButton((button) =>
                button
                    .setButtonText(t.installer.install)
                    .setCta()
                    .onClick(() => void this.install())
            )
            .setClass("obsync-add-repo-actions");
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
    private renderThemeBody(card: HTMLElement): void {
        const t = this.t;
        const resolved = this.resolvedTheme!;

        if (this.suggestion) {
            this.renderSuggestion(card);
            return;
        }

        card.createEl("p", {
            text: t.installer.themeResolved(
                resolved.manifest.name,
                resolved.manifest.version
            ),
            cls: "obsync-modal-status",
        });

        new Setting(card)
            .addButton((button) =>
                button
                    .setButtonText(t.installer.themeInstall)
                    .setCta()
                    .onClick(() => void this.installTheme())
            )
            .setClass("obsync-add-repo-actions");

        card.createEl("p", {
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
    private renderSuggestion(card: HTMLElement): void {
        const t = this.t;
        const other = this.suggestion!;

        card.createEl("p", {
            cls: "obsync-modal-warning",
            text: other === "theme" ? t.installer.looksLikeTheme : t.installer.looksLikePlugin,
        });

        new Setting(card)
            .addButton((button) =>
                button
                    .setButtonText(
                        other === "theme" ? t.installer.switchToTheme : t.installer.switchToPlugin
                    )
                    .setCta()
                    .onClick(() => this.switchKind(other))
            )
            .setClass("obsync-add-repo-actions");
    }

    /** 换一类对象并重新识别。 */
    private switchKind(kind: TrackedKind): void {
        this.kind = kind;
        this.clearResolved();
        void this.resolve();
    }

    /**
     * 上一次识别的结论全部作废。
     *
     * 三处都要清：换了地址、换了平台、换了对象类型 —— 三者都是「这是另一个
     * 仓库」的意思。留着旧结论的后果不是显示错，而是**装错**（用 A 的版本列表
     * 去装 B）。
     */
    private clearResolved(): void {
        this.resolved = undefined;
        this.resolvedTheme = undefined;
        this.suggestion = undefined;
        this.versions = [];
        this.version = "latest";
        this.versionError = undefined;
        this.useMirror = false;
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
        // 换了地址 / 换了平台就是另一件事了，上一次的镜像勾选与「装错入口」的结论都作废。
        this.clearResolved();
        this.render();

        try {
            if (this.isTheme) {
                this.resolvedTheme = await this.service.resolveThemeRepo(
                    this.repoInput,
                    this.hostChoice
                );
            } else {
                this.resolved = await this.service.resolveRepo(this.repoInput, {
                    defaultHost: this.hostChoice,
                });
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
