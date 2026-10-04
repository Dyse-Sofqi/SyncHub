import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import type { DiffLine, FileDiff } from "../diff";
import { sideBySideRows } from "../sideBySide";
import type { SyncService } from "../syncService";

/**
 * 差异视图（主工作区里的**标签页**，2026-10-04 用户要求。
 * 原话：「点击查看diff页面时，应该以标签页形式打开而不是模态框，模态框太小了」）。
 *
 * ## 为什么从弹窗改成标签页
 *
 * 差异是要**读**的东西：行很长、要对着行号看、复制一段去搜也常见。弹窗是「问一句
 * 就走」的形态 —— 宽度受限、背后还压着整个库，看两处改动就得来回开关。标签页是
 * 「我要在这儿待一会儿」的形态，宽度、缩放、与笔记并排对照都是现成的。
 *
 * 早先选弹窗的理由里有一条是「视图类型要写进 `workspace.json`，多一个就多一份
 * 持久化状态」—— 那条依然成立，但代价已经明确小于收益：状态就是
 * `{ kind, target }` 两个字段（见 `setState`），而恢复出来的标签页照样能重新拉一次
 * 差异。
 *
 * ## 只读
 *
 * 这个视图不做任何写操作：不暂存、不还原、不改文件。它的存在意义是让用户在
 * **动手之前**看清内容 —— 与「冲突不替你决定」是同一条设计原则。
 *
 * ## 一次显示两节（工作区 / 已暂存）
 *
 * 同一个文件完全可能**两边都有改动**（`git status` 里的 `MM`）。只显示一边就等于
 * 把另一半藏起来，而用户点开差异的意图恰恰是「我到底改了什么」。两节都列出来，
 * 各自为空就各自不出现。
 *
 * ## 文件差异会跟着状态刷新
 *
 * 这是个常驻标签页，而文件可能在它开着的时候被改（库外的编辑器、自动同步）。
 * 所以 `kind === "file"` 时订阅 `service.onStatusChange`：谁刷新了状态谁就通知
 * 这个视图重拉一次差异，而不是显示一份过期的快照。提交差异是**历史里的一条**，
 * 不会变，所以不订阅。
 */

export const DIFF_VIEW_TYPE = "obsync-diff-view";

/** 一节差异是哪两个东西在比。用类型码而不是文案 —— 展示层按它取 locale。 */
export type DiffSectionKind = "working" | "staged" | "commit";

export interface DiffSection {
    kind: DiffSectionKind;
    files: FileDiff[];
}

/**
 * 视图状态。
 *
 * **必须可序列化**：它会被写进 `workspace.json`，Obsidian 重启后按它把标签页恢复
 * 出来。所以这里只存「看什么」（`kind` + `target`），不存回调 —— 内容由
 * `service` 现拉（`fileDiff` / `commitDiff`）。
 */
export interface DiffViewState {
    /** `file` = 某个路径的工作区/已暂存差异；`commit` = 某条提交引入了什么。 */
    kind: "file" | "commit";
    /** 文件路径，或提交 hash。 */
    target: string;
    /** 标签上显示的名字（提交差异用它显示「短 hash + 第一行」）。 */
    label?: string;
    /**
     * 显示模式（2026-10-04 加双栏对照）。**跟着状态一起持久化**：用户选了双栏，
     * 关掉标签页再打开（甚至重启 Obsidian）应当还是双栏 —— 这是偏好，不是一次性的。
     * 缺省（老状态 / 第一次打开）走统一视图。
     */
    mode?: DiffMode;
}

/** 统一视图（一列，增删各占一行）/ 双栏对照（左右各一栏，像 VS Code）。 */
export type DiffMode = "unified" | "side-by-side";

/**
 * 一次「打开差异」的请求。
 *
 * `label` 只用于**提交差异的标题**（短 hash + 提交信息第一行）：提交的 `target` 是
 * hash，而只写 hash 认不出是哪一条；文件差异的 `target` 本身就是路径，够认了。
 */
export interface DiffRequest {
    kind: "file" | "commit";
    /** 文件路径，或提交 hash。 */
    target: string;
    /** 标签上显示的名字（不给就用 `target`）。 */
    label?: string;
}

export interface DiffViewDeps {
    service: SyncService;
    /**
     * **每次渲染时取**文案，不要传 `t` 本身：这个标签页可能一直开着，而用户随时
     * 可能切语言（全项目统一用这个约定，见 `SourceControlView` 的同名依赖）。
     */
    getT: () => LocaleStrings;
}

export class DiffView extends ItemView {
    private state: DiffViewState | undefined;
    /** 关闭后异步渲染的结果不再写回（节点已经摘掉了）。 */
    private closed = false;
    /** `onOpen` 跑过没有 —— `setState` 只在**已经开着**时才自己重绘，见那里的说明。 */
    private opened = false;
    private unsubscribe: (() => void) | undefined;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly deps: DiffViewDeps
    ) {
        super(leaf);
    }

    getViewType(): string {
        return DIFF_VIEW_TYPE;
    }

    getIcon(): string {
        return "file-diff";
    }

    /** 标签上显示什么 —— 用户靠它认出「哪一份差异」。 */
    getDisplayText(): string {
        const state = this.state;
        if (!state) return this.deps.getT().sync.diff.title;
        return `${this.deps.getT().sync.diff.title} · ${state.label ?? state.target}`;
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        const next = state as DiffViewState | undefined;
        if (next?.target && (next.kind === "file" || next.kind === "commit")) {
            this.state = next;
        }
        await super.setState(state, result);
        // 标签上的名字要跟着换。`updateHeader()` 确实存在于 `WorkspaceLeaf`，但没写进
        // 公开的 `obsidian.d.ts`（1.8.7）—— 所以这里可选调用：没有它也只是标题旧一点，
        // 不该让整条路径炸掉。（`leaf` 本身也判空：测试里构造视图时给的是 `null`。）
        (this.leaf as unknown as { updateHeader?: () => void } | null | undefined)?.updateHeader?.();
        /**
         * **只在已经开着的时候重绘**。
         *
         * 第一次挂载时 Obsidian 是 `setState` → `onOpen` 两步走，两边都画就等于同一次
         * `git diff` 跑两遍；而**复用**一个已经打开的标签（面板里连点几处差异）时
         * Obsidian 只再调 `setState`、不会再调 `onOpen` —— 那时必须画，否则内容还是
         * 上一份。
         */
        if (this.opened) await this.render();
    }

    async onOpen(): Promise<void> {
        this.closed = false;
        this.opened = true;
        await this.render();
        this.subscribe();
    }

    async onClose(): Promise<void> {
        this.closed = true;
        this.opened = false;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.contentEl.empty();
    }

    /**
     * 文件差异跟着状态刷新（提交差异不会变，不订阅）。
     *
     * 订阅放在 `onOpen` 之后的**渲染之外**：`render()` 自己会在每次状态推送时被调，
     * 而订阅回调里只做「标记 + 重绘」，不碰 git。
     */
    private subscribe(): void {
        this.unsubscribe?.();
        if (this.state?.kind !== "file") return;
        this.unsubscribe = this.deps.service.onStatusChange(() => {
            if (this.closed) return;
            void this.render();
        });
    }

    private async render(): Promise<void> {
        const t = this.deps.getT();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("obsync-diff-view");

        if (!this.state) {
            contentEl.createEl("p", { cls: "obsync-diff-message", text: t.sync.diff.noTarget });
            return;
        }

        contentEl.createDiv({
            cls: "obsync-diff-target",
            text: this.state.label ?? this.state.target,
        });
        this.renderModeSwitch(contentEl, this.state);
        const body = contentEl.createDiv({ cls: "obsync-diff-body" });
        body.createEl("p", { cls: "obsync-diff-message", text: t.sync.diff.loading });

        await this.renderBody(body, this.state);
    }

    /**
     * 模式切换（统一 / 双栏对照）。
     *
     * 用两个按钮而不是下拉：只有两个选项，而这是**看的时候随手切**的东西 ——
     * 下拉要多点一次才能看到另一个选项长什么样。当前那个带 `is-active`。
     *
     * 切换**不重拉差异**：内容已经在手上了，只重画一遍（`render()` 会再读一次
     * `git diff`，那是白跑 —— 所以这里直接改 `state.mode` 后重绘，代价是重拉一次；
     * 差异本身不大，换来的是「不需要在视图里缓存一份数据」。真要省，得把 sections
     * 缓存在实例上，而那会让「状态推送 → 重绘」那条路多一份要维护的缓存。）
     */
    private renderModeSwitch(container: HTMLElement, state: DiffViewState): void {
        const t = this.deps.getT();
        const mode: DiffMode = state.mode ?? "unified";
        const row = container.createDiv({ cls: "obsync-diff-modes" });
        row.createSpan({ cls: "obsync-diff-modes-label", text: t.sync.diff.modeLabel });

        const options: Array<{ id: DiffMode; label: string }> = [
            { id: "unified", label: t.sync.diff.modeUnified },
            { id: "side-by-side", label: t.sync.diff.modeSideBySide },
        ];
        for (const option of options) {
            const button = row.createEl("button", {
                text: option.label,
                cls: "obsync-diff-mode",
            });
            if (option.id === mode) button.addClass("is-active");
            button.addEventListener("click", () => {
                if ((this.state?.mode ?? "unified") === option.id) return;
                this.state = { ...state, mode: option.id };
                void this.render();
            });
        }
    }

    private async renderBody(body: HTMLElement, state: DiffViewState): Promise<void> {
        const t = this.deps.getT();

        let sections: DiffSection[];
        try {
            // 失败**不往外抛**：这是个只读旁路，读不出差异不该变成一条错误提示
            // （用户点的是「看差异」，不是「执行什么」）—— 在这里说清就行。
            if (state.kind === "file") {
                // 两节都列出来：同一个文件完全可能「改了又暂存」（`MM`），
                // 只显示一边等于把另一半藏起来。
                const diff = await this.deps.service.fileDiff(state.target);
                sections = [
                    { kind: "working", files: [diff.unstaged] },
                    { kind: "staged", files: [diff.staged] },
                ];
            } else {
                sections = [
                    { kind: "commit", files: await this.deps.service.commitDiff(state.target) },
                ];
            }
        } catch {
            if (this.closed) return;
            body.empty();
            body.createEl("p", { cls: "obsync-diff-message", text: t.sync.diff.loadFailed });
            return;
        }
        if (this.closed) return;

        // 空段落（`kind === "empty"`）不渲染：它不代表任何改动。
        // 一节里一个可见文件都没有时，整节也不渲染 —— 一个只有标题的空节
        // 看起来像「这一节没加载出来」。
        const visible = sections
            .map((section) => ({
                kind: section.kind,
                files: section.files.filter((file) => file.kind !== "empty"),
            }))
            .filter((section) => section.files.length > 0);

        body.empty();
        if (visible.length === 0) {
            body.createEl("p", { cls: "obsync-diff-message", text: t.sync.diff.noChanges });
            return;
        }

        for (const section of visible) {
            const box = body.createDiv({ cls: "obsync-diff-section" });
            box.createDiv({
                cls: "obsync-diff-section-heading",
                // 直接按下标取：与 `diagnoseCheck[check.id]` 同一套写法。
                text: t.sync.diff.section[section.kind],
            });
            for (const file of section.files) this.renderFile(box, file, state.mode ?? "unified");
        }
    }

    private renderFile(container: HTMLElement, file: FileDiff, mode: DiffMode): void {
        const t = this.deps.getT();
        const box = container.createDiv({ cls: "obsync-diff-file" });

        const heading = box.createDiv({ cls: "obsync-diff-file-heading" });
        // 重命名时把旧路径也写出来 —— 只显示新名字的话，用户会以为这是一个
        // 全新的文件（那是完全不同的结论）。
        heading.createSpan({
            text: file.previousPath ? `${file.previousPath} → ${file.path}` : file.path,
        });
        if (file.kind === "text") {
            heading.createSpan({
                cls: "obsync-diff-stats",
                text: t.sync.diff.stats(file.additions, file.deletions),
            });
        }

        if (file.kind !== "text") {
            box.createEl("p", { cls: "obsync-diff-message", text: messageFor(file, t) });
            return;
        }

        for (const hunk of file.hunks) {
            const hunkEl = box.createDiv({ cls: "obsync-diff-hunk" });
            hunkEl.createDiv({ cls: "obsync-diff-hunk-header", text: hunk.header });
            if (mode === "side-by-side") {
                renderSideBySide(hunkEl, hunk.lines);
            } else {
                for (const line of hunk.lines) renderLine(hunkEl, line, t);
            }
        }

        // 截断必须**说出来**：不说的话「只显示了前 3000 行」看起来就是
        // 「这个文件的改动只有这么多」，那是两个完全不同的结论。
        if (file.truncated) {
            box.createEl("p", { cls: "obsync-diff-message", text: t.sync.diff.truncated });
        }
    }
}

function renderLine(container: HTMLElement, line: DiffLine, t: LocaleStrings): void {
    if (line.kind === "no-newline") {
        container.createDiv({ cls: "obsync-diff-line-note", text: t.sync.diff.noNewline });
        return;
    }

    // 类名写成显式字面量、再拼成字符串：模板串拼出来的类名 `scripts/checks.mjs`
    // 扫不到（它只能看见 `obsync-diff-line-`），会被报成「定义了没用到」。
    const classes = ["obsync-diff-line"];
    if (line.kind === "add") classes.push("obsync-diff-line-add");
    if (line.kind === "del") classes.push("obsync-diff-line-del");
    const row = container.createDiv({ cls: classes.join(" ") });

    // 两个行号列：删掉的行只有旧号，新增的行只有新号，上下文行两个都有。
    row.createSpan({
        cls: "obsync-diff-lineno",
        text: line.oldLine === null ? "" : String(line.oldLine),
    });
    row.createSpan({
        cls: "obsync-diff-lineno",
        text: line.newLine === null ? "" : String(line.newLine),
    });

    // 行首标记补回来（`DiffLine.text` 刻意不含它，好让调用方自己决定怎么画）。
    // 空上下文行也要占一个空格 —— 否则 `white-space: pre` 下它看起来像没有这一行。
    const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
    row.createSpan({ cls: "obsync-diff-text", text: `${marker}${line.text}` });
}

/**
 * 双栏对照（像 VS Code）：左旧右新，配对规则在 `sideBySide.ts` 里。
 *
 * 用**四列网格**（旧行号 / 旧内容 / 新行号 / 新内容）而不是两列里各塞一个小网格：
 * 四列时两侧的**行号列宽天然一致**（`auto` 列），一眼扫下来不会错位；两列的话两边
 * 各算各的宽度，行号就会对不齐。补空单元格（`null`）也是这个原因 —— 少一个格子
 * 整行就滑过去了。
 */
function renderSideBySide(container: HTMLElement, lines: DiffLine[]): void {
    const grid = container.createDiv({ cls: "obsync-diff-sbs" });
    for (const row of sideBySideRows(lines)) {
        const rowEl = grid.createDiv({ cls: "obsync-diff-sbs-row" });
        renderSide(rowEl, row.left, "obsync-diff-sbs-left");
        renderSide(rowEl, row.right, "obsync-diff-sbs-right");
    }
}

/** 一对单元格（行号 + 内容）。`line` 为 `null` 时画两个空格子 —— 占位，不能省。 */
function renderSide(rowEl: HTMLElement, line: DiffLine | null, sideClass: string): void {
    if (!line) {
        rowEl.createSpan({ cls: `obsync-diff-lineno ${sideClass}` });
        rowEl.createSpan({ cls: `obsync-diff-text ${sideClass} obsync-diff-sbs-empty` });
        return;
    }
    if (line.kind === "no-newline") {
        rowEl.createSpan({ cls: `obsync-diff-lineno ${sideClass}` });
        rowEl.createSpan({
            cls: `obsync-diff-text ${sideClass} obsync-diff-sbs-note`,
            // 两边都显示（见 `sideBySideRows` 的说明）：它说的是两个文件各自的性质
            text: line.text,
        });
        return;
    }

    const classes = [`obsync-diff-text ${sideClass}`];
    if (line.kind === "add") classes.push("obsync-diff-line-add");
    if (line.kind === "del") classes.push("obsync-diff-line-del");

    rowEl.createSpan({
        cls: `obsync-diff-lineno ${sideClass}`,
        // 左栏用旧行号、右栏用新行号；「哪一栏」由调用顺序决定
        text: String(
            sideClass === "obsync-diff-sbs-left"
                ? line.oldLine ?? ""
                : line.newLine ?? ""
        ),
    });
    rowEl.createSpan({ cls: classes.join(" "), text: line.text });
}

/** 非文本差异各说各的 —— 一片空白会被读成「没有改动」。 */
function messageFor(file: FileDiff, t: LocaleStrings): string {
    switch (file.kind) {
        case "binary":
            return t.sync.diff.binary;
        case "renamed":
            return t.sync.diff.renamed;
        case "too-large":
            return t.sync.diff.tooLarge;
        case "empty":
        case "text":
            return t.sync.diff.noChanges;
    }
}
