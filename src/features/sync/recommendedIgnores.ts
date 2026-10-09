/**
 * SyncHub 推荐的一组 `.gitignore` 规则 —— 「别让大文件进 git」的第一层。
 *
 * ## 为什么要有这一层
 *
 * 仓库体积失控几乎从不是笔记本身造成的：一次实测里，一个 159 次提交的笔记库
 * 有 460 MB 的 `.git`，其中插件构建产物 319 MB、字体 186 MB、向量库缓存 84 MB，
 * 而真正的 markdown 只有 63 MB。这些东西的共同点是**每个都很大、又几乎不变**，
 * 于是「进一次历史就永久占着」。
 *
 * `.gitignore` 是唯一能在**源头**拦住它们的机制：`stage()` 走的是 `git add -A`，
 * 它尊重忽略规则。所以这里把「跨用户都适用」的几类列出来，交给用户一键补齐。
 *
 * ## 为什么是「补齐」而不是「覆盖」
 *
 * 用户的 `.gitignore` 里可能有自己写的规则（甚至就是他在别的工具里精心配的）。
 * 覆盖掉那是数据损失，所以合并走 `mergeRuleLines`：**只追加缺的那些，已有的一行都不动**，
 * 而且可以重复点（幂等）。这条约束与「让图片退出 git」完全一致，共用同一套实现。
 *
 * ## 为什么规则分成几类而不是一个大数组
 *
 * 界面要告诉用户「补了哪几条、分别是为什么」——「加了一条 `*.ttf`」远不如
 * 「字体文件：这类文件通常几十 MB，装到系统里就够，不需要进版本库」有用。
 * 分组信息只在这里产出（`group` 是类型码），文案由 locale 按 id 取 ——
 * 与错误处理、诊断报告同一套约定，所以本模块不依赖 i18n，可以单独测。
 *
 * ## 插件目录为什么是开关而不是默认项
 *
 * `${configDir}/plugins/` 里的 `main.js` 是体积最大的单一来源，但**默认忽略它会
 * 改变产品行为**：换设备 clone 之后插件不会自动就位，得重新装。这是个取舍，
 * 该由用户决定，不该由我们替他选（`ignorePluginFolder` 设置项）。
 */

import { extensionIgnoreRules, mergeRuleLines } from "./imagesIgnore";

/** 推荐规则的分组 —— 界面按它取标题与理由。 */
export type RecommendedGroupId = "font" | "officeTemp" | "localState" | "pluginFolder";

export interface RecommendedRule {
    /** 规则行本身（ASCII 通配符，不含任何文案）。 */
    rule: string;
    group: RecommendedGroupId;
}

/**
 * 字体扩展名。
 *
 * 字体是「大且不变」的典型：一份中文字体动辄 10–40 MB，而它进了历史之后
 * 每次改动都会再存一份完整副本。Obsidian 用字体只需要系统里装好，
 * 库里的 `.ttf` 通常只是「顺手放这儿」，没有版本管理的价值。
 */
const FONT_EXTENSIONS = ["ttf", "ttc", "otf", "woff", "woff2"];

/**
 * Office / LibreOffice 的临时与锁文件。
 *
 * 这些是**打开文档时生成的**，随开随变（`~$报告.docx`、`.~lock.报告.odt#`）。
 * 它们进版本库的唯一效果是制造噪音提交，内容本身没有任何意义。
 */
const OFFICE_TEMP_RULES = ["~$*", ".~lock.*#"];

/**
 * Obsidian 自己那三个「本机状态」文件（相对配置目录）。
 *
 * ## 为什么它们比大文件更值得忽略（2026-10-10）
 *
 * **重写历史的代价只吃「提交总数」，与每个提交改了多少字节无关。** 所以一个
 * 「只改了光标位置」的提交和一个「改了一整章笔记」的提交，在深度清理那里**一样贵**。
 * 而这三个文件是**每次开关标签、拖一下面板就变**的东西 —— 让它们进 git，
 * 等于给每个 5 分钟同步周期都准备好了「有东西可提交」。
 *
 * 大文件拦截防的是**体积**，防不了这一条 —— 两件事是两条独立的轴。
 *
 * `workspaces.json` 与另外两个**不是一类**（它是手动保存的工作区布局，改动很少，
 * 而且「把布局带到另一台设备」可能是想要的）—— 但它同样是**本机界面状态**，
 * 跟着 `workspace.json` 一起忽略是 Obsidian 多设备同步的通行做法。
 */
const LOCAL_STATE_FILES = ["workspace.json", "workspace-mobile.json", "workspaces.json"];

/** 本地状态文件的忽略规则（相对配置目录展开后）。 */
export function localStateRules(configDir: string): string[] {
    return [
        ...LOCAL_STATE_FILES.map((name) => `${configDir}/${name}`),
        // 插件的「位置缓存」惯例（MDRazor 的 `md-razor-position-cache.json` 即此类）。
        // 用 glob 而不是写死某个插件名：这是**一类**东西，不是某一个插件的私事。
        `${configDir}/*-position-cache.json`,
    ];
}

/**
 * 判断一个**已跟踪**的路径是不是本地状态文件。
 *
 * 只匹配配置目录**正下方**一层（`rest.includes("/")` 直接排除）—— 与规则写法一致，
 * 而且这样不会误伤 `.obsidian/plugins/<某插件>/workspace.json` 这种同名文件
 * （那是插件自己的数据，归「插件目录」那一组管）。
 *
 * 存在的理由：`.gitignore` **只管未跟踪的文件**，所以对已经跟踪的 `workspace.json`
 * 加规则一点用都没有 —— 必须先认出它们、再 `git rm --cached`。这个函数就是那一步的判据。
 */
export function matchesLocalState(path: string, configDir: string): boolean {
    const prefix = `${configDir}/`;
    if (!path.startsWith(prefix)) return false;
    const rest = path.slice(prefix.length);
    if (rest.length === 0 || rest.includes("/")) return false;
    if (LOCAL_STATE_FILES.includes(rest)) return true;
    return rest.endsWith("-position-cache.json");
}

/**
 * 生成推荐规则清单。
 *
 * `configDir` 走 `vault.configDir` 而不是写死 `.obsidian` —— 用户可以改配置目录名，
 * 写死的话那条规则一条都匹配不上（与 `gitignoreTemplate` 同一个坑）。
 */
export function recommendedRules(options: {
    configDir: string;
    /** 是否把整个插件目录也忽略掉（设置项，默认关）。 */
    ignorePluginFolder: boolean;
}): RecommendedRule[] {
    const rules: RecommendedRule[] = [];

    // 大小写各一条 —— 与 `extensionIgnoreRules` 的理由相同：git 在 Linux 上区分大小写，
    // 只写小写的话 `Font.TTF` 会攒够一次提交就溜进去，而它不在「已忽略」里，
    // 用户永远看不出哪里不对。
    for (const rule of extensionIgnoreRules(FONT_EXTENSIONS)) {
        rules.push({ rule, group: "font" });
    }

    for (const rule of OFFICE_TEMP_RULES) {
        rules.push({ rule, group: "officeTemp" });
    }

    for (const rule of localStateRules(options.configDir)) {
        rules.push({ rule, group: "localState" });
    }

    if (options.ignorePluginFolder) {
        rules.push({ rule: `${options.configDir}/plugins/`, group: "pluginFolder" });
    }

    return rules;
}

/**
 * 把推荐规则并进 `.gitignore` 文本。
 *
 * 返回的 `added` 是**这次真正写进去**的那些（带分组），空数组表示「本来就已经配好了」——
 * 调用方据此给出反馈：「点了没反应」和「本来就配好了」在界面上必须能分开。
 */
export function mergeRecommendedRules(
    content: string,
    rules: RecommendedRule[]
): { content: string; added: RecommendedRule[] } {
    // 规则行交给 `mergeRuleLines` 去重（它按「去掉首尾斜杠与空白」比较，
    // 所以 `/attachments` 与 `attachments/` 会被认成同一条 —— 正是想要的行为）。
    const merged = mergeRuleLines(
        content,
        rules.map((entry) => entry.rule)
    );

    const addedRules = new Set(merged.added);
    return {
        content: merged.content,
        // 用规则行反查分组。同一条规则不会出现在两个分组里，所以这里是精确的。
        added: rules.filter((entry) => addedRules.has(entry.rule)),
    };
}
