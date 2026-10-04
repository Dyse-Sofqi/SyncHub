import { SuggestModal, type App } from "obsidian";
import type { LocaleStrings } from "../../../core/i18n";
import { isInsideFolders } from "../imageScan";

/**
 * 选择器里的一项。
 *
 * `path` 是**归一之后**的 vault 相对路径（空串 = 整个库）—— 回调直接把
 * 它并进 `images.folders`，那边存的也是归一后的形状（见 `normalizeFolder`）。
 */
export interface FolderOption {
    path: string;
    /** 主文案：根目录是「仓库根目录（整个库）」，其余就是路径本身。 */
    label: string;
    /** 是否已经落在受管范围里（被更外层文件夹覆盖也算）。 */
    included: boolean;
    /** 搜索用的小写文本。 */
    searchText: string;
}

/**
 * 列出可以选的文件夹：**根目录在最前**，其余按路径排序。
 *
 * ## 为什么抽成独立函数
 *
 * 它有两个调用方：这里的模态选择器，以及设置页那一格输入框下方的**候选下拉**
 * （2026-10-02 加，用户要求「输入路径时，文本框下方应该提供候选辅助」）。
 * 两处必须给出**同一个列表、同一种排序、同一套搜索文本** —— 分开写就是两份会
 * 各自漂移的实现（这个项目里已经有过一次「重复实现里躺着的那一份是错的」）。
 *
 * 排序让列表稳定：`getAllFolders` 的顺序跟建目录的先后有关，每次打开都换一副
 * 面孔会让人以为选错了东西。
 */
export function folderOptions(app: App, t: LocaleStrings, managed: string[]): FolderOption[] {
    const rootLabel = t.settings.images.folderPickerRoot;
    const root: FolderOption = {
        path: "",
        label: rootLabel,
        // 空串路径正好问「整个库在不在受管范围里」—— isInsideFolders 的语义
        // 对空串也成立（`""` 在 `["attachments"]` 里是 false，在 `[""]` 里是 true）。
        included: isInsideFolders("", managed),
        // 带上 `.`：那一格的说明文字写的是「填 . 表示整个库」，
        // 用户照着打一个点要能搜到它。
        searchText: `${rootLabel.toLowerCase()} .`,
    };

    const folders = app.vault
        .getAllFolders()
        .map((folder) => folder.path)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map<FolderOption>((path) => ({
            path,
            label: path,
            included: isInsideFolders(path, managed),
            searchText: path.toLowerCase(),
        }));

    return [root, ...folders];
}

/** 按输入过滤候选：空查询返回全部，否则按小写子串匹配。 */
export function filterFolderOptions(options: FolderOption[], query: string): FolderOption[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((option) => option.searchText.includes(trimmed));
}

/**
 * 受管图片文件夹的选择器。
 *
 * ## 为什么不是一个输入框加个按钮
 *
 * 这个列表决定「插件能动哪些文件」，而手打路径的错法 —— `/attachments/`、
 * `assets//img`、根本不存在的目录 —— **全都没有任何提示**：表现是「填了却一个
 * 文件都不动」或者悄悄多管了一片。从库里现成的文件夹里选，这些错法一次性消失。
 *
 * 根目录（= 仓库文件夹，空串表示整个库）也在列表里，而且排在最前：它正是
 * 默认值，也是这个插件最常用的范围。
 *
 * 与 `VersionSuggestModal` 同一形状：扁平列表 + 搜索。不画树 —— 侧边栏里的
 * 文件管理器已经是一棵树，这里要的是「快」，不是「再画一遍」。
 */
export class FolderSuggestModal extends SuggestModal<FolderOption> {
    constructor(
        app: App,
        private readonly t: LocaleStrings,
        /** 当前已受管的文件夹（归一后的形状），用来标注「已包含」。 */
        private readonly managed: string[],
        private readonly onChoose: (folder: string) => void
    ) {
        super(app);
        this.setPlaceholder(t.settings.images.folderPickerPlaceholder);
    }

    getSuggestions(query: string): FolderOption[] {
        // 候选的构造与过滤都在 `folderOptions` / `filterFolderOptions` 里 ——
        // 设置页那一格输入框下方的候选下拉用的是同一份（见那边的说明）。
        return filterFolderOptions(folderOptions(this.app, this.t, this.managed), query);
    }

    renderSuggestion(option: FolderOption, el: HTMLElement): void {
        el.createDiv({ text: option.label });
        // 「已包含」要说出来：否则用户在一个已经受管的库里挑来挑去，
        // 会以为每次选择都改变了范围，而实际上什么都没有发生。
        if (option.included) {
            el.createEl("small", {
                text: this.t.settings.images.folderPickerIncluded,
                cls: "obsync-suggestion-meta",
            });
        }
    }

    onChooseSuggestion(option: FolderOption): void {
        this.onChoose(option.path);
    }
}
