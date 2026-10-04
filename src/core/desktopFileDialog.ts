/**
 * 桌面端的「选择文件」对话框。
 *
 * ## 为什么走 `window.electron.remote`
 *
 * Obsidian 的**公开 API 里没有文件对话框** —— `obsidian.d.ts` 里与这个需求最近的
 * 只有 `FileSystemAdapter.getFullPath`（把库内相对路径转成绝对路径），没有任何
 * `showOpenDialog` 之类的东西。而 Obsidian **自己**就是这么开文件框的：1.13.7 的
 * 渲染进程里有
 *
 *     electron.remote.dialog.showOpenDialogSync({ … })      // 「选择语言包文件」
 *     electron.remote.shell.showItemInFolder(e)             // 在文件管理器里显示
 *
 * 插件与它跑在**同一个渲染进程**、共用同一个 `window.electron`，所以这条路对插件
 * 同样成立（不是「钻空子」：这是当前版本下唯一存在的入口）。
 *
 * ## 三层防御
 *
 * `window.electron` **只在桌面端**存在；`remote` 在 Electron 14+ 已从上游移除
 * （Obsidian 自己注入了它，但将来可能换掉）。任何一层缺失都返回 `undefined`，
 * 由调用方保住「手输路径照旧可用」—— 这个按钮是锦上添花，不能变成唯一入口。
 *
 * ## 这里**不 import 任何东西**
 *
 * `scripts/checks.mjs` 的「移动端安全」扫的是静态导入图（移动端没有 Node 集成，
 * 静态导入 `fs` / `child_process` 会让插件在加载时就崩）。一个 `window` 上的属性
 * 访问在移动端只是 `undefined`，读一下就返回 —— 于是这一条路径在移动端是安全的，
 * 也无须把它藏进动态 `import()` 里。
 */

/** 只声明我们真正用到的那几个字段（Electron 的类型这里拿不到，也不该依赖）。 */
interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    properties?: string[];
    filters?: { name: string; extensions: string[] }[];
}

interface OpenDialogResult {
    canceled?: boolean;
    filePaths?: string[];
}

interface RemoteDialog {
    showOpenDialog?: (options: OpenDialogOptions) => Promise<OpenDialogResult>;
    showOpenDialogSync?: (options: OpenDialogOptions) => string[] | undefined;
}

/** 当前环境能不能开系统文件对话框。 */
export function supportsFileDialog(): boolean {
    return remoteDialog() !== undefined;
}

/**
 * 让用户挑一个文件，返回绝对路径。
 *
 * 用户取消、环境不支持、或者 `remote` 那一路抛错，一律返回 `undefined` ——
 * 这里**不弹错误**：调用方（设置页）旁边就是一个可以手输的输入框，
 * 为了一个「锦上添花」的按钮弹一次红色提示，比什么都不做更烦人。
 */
export async function pickFile(options: OpenDialogOptions): Promise<string | undefined> {
    const dialog = remoteDialog();
    if (!dialog) return undefined;

    try {
        if (dialog.showOpenDialog) {
            const result = await dialog.showOpenDialog(options);
            if (result.canceled) return undefined;
            return result.filePaths?.[0];
        }
        // 只有同步版（Obsidian 自己用的就是它）：会阻塞渲染进程，但对话框关掉就恢复。
        return dialog.showOpenDialogSync?.(options)?.[0];
    } catch {
        return undefined;
    }
}

function remoteDialog(): RemoteDialog | undefined {
    if (typeof window === "undefined") return undefined;
    const electron = (
        window as unknown as { electron?: { remote?: { dialog?: RemoteDialog } } }
    ).electron;
    const dialog = electron?.remote?.dialog;
    if (!dialog) return undefined;
    if (typeof dialog.showOpenDialog !== "function" && typeof dialog.showOpenDialogSync !== "function") {
        return undefined;
    }
    return dialog;
}
