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
export type RecommendedGroupId = "font" | "officeTemp" | "pluginFolder";

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
