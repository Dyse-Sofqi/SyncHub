import type { App } from "obsidian";
import type { LocalImage } from "./types";

/**
 * 本地图片扫描。
 *
 * 扫描的口径由「指定的图片文件夹」决定 —— 这是**双副本架构里唯一的边界**：
 * 只有落在这个边界里的文件才会被同步、才允许被删除传播。边界之外的东西
 * （比如 `templates/` 里的示意图、`.obsidian/` 里的图标）插件一律不碰。
 *
 * 边界写成「文件夹前缀」而不是「按扩展名扫全库」，是因为扩展名白名单拦不住
 * 误伤：用户库里的头像、封面、参考图都长得一样，而**删除**是不可逆的。
 * 让用户显式写下「哪几个文件夹归 SyncHub 管」，是这里唯一安全的形状。
 */

/**
 * 参与**同步**的图片扩展名。
 *
 * 含 svg：它是文本，但同样是用户笔记里的图片资源，同样该有云端副本。
 *
 * 2026-10-02 起导出：仓库同步那边「按扩展名忽略图片」要用**同一份**清单 ——
 * 两处各写一份的话，会出现「图片同步认它是图、git 却放着不管」的缝（或多出
 * 一个两边都不管的扩展名）。这份清单就是「什么是图片」的唯一答案。
 */
export const SYNC_EXTENSIONS = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "bmp",
    "svg",
    "heic",
    "tif",
    "tiff",
];

/**
 * 可以用画布**重新编码**的扩展名（裁剪 / 压缩用）。
 *
 * 比上面窄，两处差异都有理由：
 * - `svg` 是矢量图，画布会把它栅格化 —— 那不是「压缩」，是把图毁了；
 * - `gif` 经过画布会只剩第一帧 —— 动图变静图，且用户不会预期。
 *
 * 这两个格式在编辑入口处会被明确拒绝并说明原因，而不是悄悄产出坏文件。
 */
const EDITABLE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif", "bmp"];

export function extensionOf(path: string): string {
    // 只看**最后一段**（文件名），不是整条路径。
    //
    // 拿整条路径的最后一个点会让目录名里的点被当成扩展名：`v1.0/README`
    // 会得到 `0/readme`。那个值恰好不可能等于任何图片扩展名（它含 `/`），
    // 所以眼下没有误判 —— 但那是巧合，不是保证：判据一旦变成 `endsWith`、
    // 或者扩展名表里出现带斜杠的项，就会立刻出错。
    const slash = path.lastIndexOf("/");
    const name = slash < 0 ? path : path.slice(slash + 1);

    // `index <= 0`（不是 `< 0`）：点开头的文件名（`.hidden`）没有扩展名 ——
    // 那个点是在起名，不是在分格式。这与 `buildOutputPath` 的判据一致。
    const index = name.lastIndexOf(".");
    return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}

export function isImagePath(path: string): boolean {
    return SYNC_EXTENSIONS.includes(extensionOf(path));
}

export function isEditableImage(path: string): boolean {
    return EDITABLE_EXTENSIONS.includes(extensionOf(path));
}

/**
 * 归一一个文件夹路径。
 *
 * 逐段重建，丢掉空段与 `.` 段：
 * - `images/`、`/images`、`images` 是同一个文件夹；
 * - `.`、`/`、`./`、`/./` 都表示**整个库**（归一成空串）。
 *
 * ## 为什么是「先拆段再判断」而不是「先判断再剥斜杠」
 *
 * 先判断的话 `./` 与 `/./` 会漏过去（`"./"` 既不等于 `"."` 也不等于 `"/"`），
 * 归一成 `.`。而 `isInsideFolders` 拿到 `"."` 会去找一个**名字叫 `.` 的文件夹**，
 * 于是一个文件都匹配不上 —— 用户以为自己在同步整个库，界面却什么都不做，
 * 且没有任何提示。同一个形状的输入还有 `a/./b`（真实路径是 `a/b`，前缀对不上）。
 *
 * `..` 段**原样保留**：设置里写的是 vault 相对路径，`..` 在那儿没有意义，
 * 于是它匹配不到任何文件（安静地不做事），而**不会**逃出库 ——
 * 这个函数的返回值只被当作前缀去比对 vault 路径，从不拼成文件系统路径。
 */
export function normalizeFolder(value: string): string {
    const segments: string[] = [];
    for (const segment of value.trim().split("/")) {
        if (segment === "" || segment === ".") continue;
        segments.push(segment);
    }
    return segments.join("/");
}

/**
 * 归一整个文件夹列表。
 *
 * 去重是必需的：重复项会让 `some()` 白跑，更会让设置页看起来像坏了
 * （从候选里挑一个已经加过的，必须是**无害的空操作**）。
 *
 * ## 空串是合法值，不能丢
 *
 * `""` 是「整个库」归一之后的**规范形状**（`data.json` 里存的就是它），
 * 丢它等于把用户「同步整个库」的设置悄悄改回「什么都没管」—— 没有任何提示。
 * 要丢的是**纯空白**（`"   "`）：那通常是手滑。区别在原始值上：`""` 与 `"."`
 * 都表示整个库，而纯空白什么都不表示。
 *
 * ## 与设置页那一格的关系（2026-10-02 起）
 *
 * 那一格现在是「输入一个路径 → 加进列表」，用户输入的是**单个**路径，
 * 直接并进列表再进这里即可（`normalizeFolder` 负责 `/attachments/`、`assets//img`、
 * `.` 这些写法的归一，纯空白在这里被丢掉）。所以原先那个「按行拆、先丢空行」
 * 的 `parseFolders` 连同它的逆向 `formatFolders` / `formatFolderPath` 一起删了：
 * 多行文本框没有了，拆行这件事也不存在了。
 */
export function normalizeFolders(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        if (value !== "" && !value.trim()) continue;
        const folder = normalizeFolder(value);
        if (!result.includes(folder)) result.push(folder);
    }
    return result;
}

/**
 * 这个路径在不在受管的文件夹里。
 *
 * 空串表示整个库。前缀判断要带 `/`，否则 `attachments-old/` 会被
 * `attachments` 误判为在范围内 —— 而那意味着一个**范围外的文件会被删**。
 */
export function isInsideFolders(path: string, folders: string[]): boolean {
    return folders.some(
        (folder) => folder === "" || path === folder || path.startsWith(`${folder}/`)
    );
}

/** 扫出所有受管文件夹里的图片。按路径排序，让界面上的顺序稳定。 */
export function scanLocalImages(app: App, folders: string[]): LocalImage[] {
    if (folders.length === 0) return [];

    const images: LocalImage[] = [];
    for (const file of app.vault.getFiles()) {
        if (!isImagePath(file.path)) continue;
        if (!isInsideFolders(file.path, folders)) continue;
        images.push({
            path: file.path,
            size: file.stat.size,
            mtime: file.stat.mtime,
        });
    }

    images.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    return images;
}
