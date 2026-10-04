/**
 * 把「图片文件夹」或「图片扩展名」并进 `.gitignore`。
 *
 * ## 为什么需要这一步，以及为什么它**不够**
 *
 * `.gitignore` 只影响**未跟踪**的文件：一条规则写进去之后，新图片不会再进 git，
 * 但**已经提交过的那些照旧每次提交都带着** —— git 的固有语义，不是配置问题。
 * 所以真正让图片退出 git 需要两步（见设置页那一节）：
 *
 * 1. 把规则写进 `.gitignore`（本文件）；
 * 2. `git rm -r --cached` 把命中的已跟踪文件从**索引**里摘掉，再提交
 *    （`SimpleGitManager.untrack`）。
 *
 * 只做第 1 步的结果是「用户以为搞定了，而仓库里那些图片还在同步」—— 这正是这个
 * 功能要避免的误解，所以两步在界面上是一个动作。
 *
 * ## 两种规则各有各的适用面（2026-10-02 加扩展名那一种）
 *
 * - **按文件夹**（`attachments/`）：范围与「图片同步」镜像的文件夹**完全重合**，
 *   一条原则「图片同步管的，git 不管」。图片文件夹配得很具体时用这个 ——
 *   整个文件夹里的东西（含非图片）本来就归图片同步管。
 * - **按扩展名**（`*.png` …）：忽略**全库**这些格式的图片。适用于「图片同步范围
 *   就是整个库」（默认的 `[""]`）—— 那种配置下按文件夹写等于让 git 什么都不同步，
 *   而按扩展名只放走图片、不动别的文件。
 *
 * 两种规则**不能混着乱用**：扩展名规则管的是全库，而图片同步只镜像你配的那几个
 * 文件夹 —— 文件夹之外的图片会**两边都不管**（没版本历史、没云端副本）。这条
 * 约束由设置页的三道闸挡住，见那里的说明。
 */

/** 一行规则：文件夹 → `folder/`。带斜杠只匹配目录，不会连带一个同名的**文件**。 */
export function ignoreRuleFor(folder: string): string {
    return `${folder}/`;
}

/**
 * 图片扩展名 → 忽略规则行：**大小写各一条**。
 *
 * 为什么要两条：git 默认区分大小写（Linux 上是真的区分），Windows / macOS 的
 * 文件系统不区分所以两条都命中、等价。只写小写的话，Linux 上 `cover.PNG`
 * 会**攒够一次提交就溜进去** —— 而且它不在「已忽略」里，摘索引那一步也不会碰它，
 * 用户永远看不出哪里不对。
 *
 * 为什么不用 `*.{png,jpg}`：gitignore 的 wildmatch **不支持花括号展开**
 * （2026-10-02 实测：`*.{png,webp}` 一条都不命中，而 `*.png` 命中）。
 * `*.[pP][nN][gG]` 也能一行搞定，但那种写法没人愿意读、也不好删。
 */
export function extensionIgnoreRules(extensions: string[]): string[] {
    const rules: string[] = [];
    for (const extension of extensions) {
        const lower = extension.toLowerCase();
        rules.push(`*.${lower}`);
        rules.push(`*.${lower.toUpperCase()}`);
    }
    return rules;
}

/** 路径是不是图片（按扩展名，**不区分大小写**）。用于筛出要摘索引的已跟踪文件。 */
export function isImagePath(path: string, extensions: string[]): boolean {
    const dot = path.lastIndexOf(".");
    if (dot < 0) return false;
    const extension = path.slice(dot + 1).toLowerCase();
    return extensions.some((candidate) => candidate.toLowerCase() === extension);
}

/**
 * 去掉一行规则的「外壳」，用来判断某条规则**是否已经写过**。
 *
 * 只看得出「同一件事的另一种写法」，不做完整的匹配推导（`.gitignore` 的语义
 * 包含通配符、取反、目录继承，全部模拟一遍既没必要也不可靠）：
 * - 去掉前后空白；
 * - 去掉开头的 `/`（`/attachments` 与 `attachments` 都是「仓库根下的 attachments」）；
 * - 去掉结尾的 `/`（`attachments/` 只匹配目录，但对「已经忽略了吗」这个问题答案一样）。
 *
 * 用户手写的规则里出现通配符（`attach*`）时这里会判成「没忽略过」而再补一条 ——
 * 结果只是多一行冗余规则，无害；判断反了（以为忽略过、其实没有）才是要紧的错。
 */
function normalizeRule(line: string): string {
    return line.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 把若干规则行并进 `.gitignore` 文本：**只追加缺的那些**，已有的一行都不动。
 *
 * 幂等是硬要求：这个动作可以重复点（用户第二次点、或者两台设备各点一次），
 * 每次追加一遍会让文件很快变得没法读。
 *
 * @returns `added` 是这次真正写进去的规则行（空数组表示「本来就已经忽略了」）。
 *          调用方据此给出「加了几条」的反馈 —— 「点了没反应」和「本来就配好了」
 *          在界面上必须能分开。
 */
export function mergeRuleLines(
    content: string,
    rules: string[]
): { content: string; added: string[] } {
    const lines = content.length > 0 ? content.split("\n") : [];
    const existing = new Set(lines.map(normalizeRule).filter((line) => line.length > 0));

    const added: string[] = [];
    for (const rule of rules) {
        const key = normalizeRule(rule);
        // 空串 = 「整个库」（见 `normalizeFolder` 的说明）：忽略整个库等于不同步任何
        // 东西，不可能是用户想要的。调用方会先拦住这种配置，这里再挡一次。
        if (key.length === 0) continue;
        if (existing.has(key)) continue;
        existing.add(key);
        added.push(rule);
    }

    if (added.length === 0) return { content, added };

    // 追加到末尾（模板自己的注释也写着「想忽略别的文件，直接加在下面即可」）。
    // 原内容末尾没有换行时先补一个，否则新规则会和最后一行黏在一起。
    const base = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
    return { content: `${base}${added.join("\n")}\n`, added };
}

/** 按文件夹合并 —— 把每个文件夹变成 `folder/` 再走上面的通用逻辑。 */
export function mergeIgnoreRules(
    content: string,
    folders: string[]
): { content: string; added: string[] } {
    return mergeRuleLines(
        content,
        folders.map((folder) => ignoreRuleFor(folder))
    );
}
