#!/usr/bin/env node
/**
 * 项目自查。`pnpm check` 运行，全部只读。
 *
 * 这四项都是「编译器管不着、但会真出问题」的检查 —— 每一条都对应一个
 * 实际踩过的坑，不是理论洁癖：
 *
 * 1. **minAppVersion 一致性** —— manifest 承诺的最低版本必须覆盖代码用到的 API。
 *    写低了，低版本用户装上就崩（方法是 undefined），而 TypeScript 不会提醒
 *    （`node_modules/obsidian` 的类型永远是最新版）。实测踩过。
 * 2. **硬编码中文** —— i18n 的编译期保证只管「locale 之间结构一致」，
 *    管不住「代码里直接写了一句中文」。实测扫出 22 处用户可见的错误文案，
 *    意味着英文界面下会冒中文。
 * 3. **未使用的 i18n 键** —— 死键是信号：通常意味着漏接的本地化或没接线的功能。
 *    实测 4 个死键背后都是真缺口（撤销后无反馈、进度文案闲置、来源没显示…）。
 * 4. **CSS 类覆盖** —— 用了但没定义的类会静默丢样式；定义了没用的类是残留。
 * 5. **移动端安全** —— 静态导入图里不能出现依赖 Node 的模块。
 * 6. **设置项无人读取** —— 能改、能存，但功能代码从不读的字段。
 * 7. **locale 里的 Markdown 加粗** —— 界面不渲染 Markdown，`**` 会原样显示成星号。
 * 8. **CSS 注释完整性** —— 注释里的「星号紧跟斜杠」会提前结束注释，把后面那条规则整条吃掉
 *    （第 4 项拦不住：被丢弃的规则在文本上仍然「有定义」）。
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const failures = [];

// ── 工具 ────────────────────────────────────────────────────────────────────

function walk(dir, extension) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, extension));
        else if (entry.name.endsWith(extension)) out.push(full);
    }
    return out;
}

function read(file) {
    return fs.readFileSync(file, "utf8");
}

function relative(file) {
    return path.relative(ROOT, file).replace(/\\/g, "/");
}

/**
 * 剥掉注释。
 *
 * 扫描类检查（硬编码中文、CSS 类名）都要先剥注释，否则**注释里提到的类名/中文**
 * 会被算成"用到了"，掩盖真问题。字符串里的 `//` 会被误伤，但用于扫描足够。
 */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*");
        })
        .join("\n");
}

function versionTuple(value) {
    const parts = String(value).match(/\d+/g) ?? [];
    return parts.map(Number);
}

function compareVersions(a, b) {
    const left = versionTuple(a);
    const right = versionTuple(b);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// ── 1. minAppVersion 一致性 ─────────────────────────────────────────────────

function checkMinAppVersion() {
    const dtsPath = path.join(ROOT, "node_modules/obsidian/obsidian.d.ts");
    if (!fs.existsSync(dtsPath)) {
        return { name: "minAppVersion", skipped: "未安装 obsidian 类型包" };
    }

    const manifest = JSON.parse(read(path.join(ROOT, "manifest.json")));
    const minApp = manifest.minAppVersion;

    /**
     * 我们会调用其成员的 Obsidian 类。
     *
     * **必须按类限定**：只按成员名匹配会大量误报 —— `.search()` / `.status()` /
     * `.filter()` 既可能是 Obsidian 的，也可能是我们自己的方法；而 Obsidian 新增的
     * 声明式设置 API（`SettingDefinition`）里有 `name` / `desc` / `addButton` 等同名成员，
     * `@since 1.13.0` —— 不限定就会把「我们没用过的 API」报成问题。
     */
    const WATCHED = new Set([
        "App", "ButtonComponent", "Component", "DataAdapter", "DropdownComponent",
        "Events", "ExtraButtonComponent", "FuzzySuggestModal", "ItemView", "Menu",
        "MenuItem", "Modal", "Notice", "Plugin", "PluginSettingTab", "SecretStorage",
        "Setting", "SuggestModal", "TextComponent", "ToggleComponent", "Vault",
        "Workspace", "WorkspaceLeaf",
    ]);

    /**
     * 已知「要求高于 minAppVersion 但安全」的用法。
     * 加进来**必须写清为什么安全** —— 否则这张表会变成掩盖问题的地方。
     *
     * 注意：这张表**不是**社区审核的替代品。审核的 `obsidianmd/no-unsupported-api`
     * 只看「成员访问的类型是不是来自 obsidian.d.ts」，不认这里的理由 ——
     * 0.1.4 就是因为这四条被报成错误（`SecretStore` 的写法当时只靠
     * `typeof getSecret === "function"` 探测，审核认不出，于是四条全红）。
     * 现在改用官方认可的 `requireApiVersion("1.11.4")` 守卫，真实行为与
     * 审核判据一致；本表保留只是因为这个脚本只看成员名、看不出守卫。
     */
    const KNOWN_SAFE = new Map([
        ["App.secretStorage", "SecretStore.canUseSecretStorage() 用 requireApiVersion(\"1.11.4\") 守卫，1.11.4 以下直接短路"],
        ["SecretStorage.setSecret", "只在 canUseSecretStorage() 为真时调用；返回类型是结构类型 SecretStorageLike，不再走 Obsidian 声明"],
        ["SecretStorage.getSecret", "同上 —— 版本守卫 + 结构类型，两处调用都只读这个结构类型"],
        ["Plugin.settings", "误报：d.ts 里一段提到 this.plugin.settings 的文档被算到了类作用域上"],
    ]);

    const source = read(dtsPath);

    // 顶层类/接口的位置，用来划分作用域
    const scopes = [];
    const scopeRe = /^export\s+(?:abstract\s+)?(?:class|interface)\s+(\w+)/gm;
    for (let match = scopeRe.exec(source); match; match = scopeRe.exec(source)) {
        scopes.push([match.index, match[1]]);
    }

    const scopeAt = (position) => {
        let current = undefined;
        for (const [start, name] of scopes) {
            if (start <= position) current = name;
            else break;
        }
        return current;
    };

    const annotations = new Map();
    const docRe = /\/\*\*(?<doc>[\s\S]*?)\*\/\s*(?<decl>[^\n;{]*)/g;
    for (let match = docRe.exec(source); match; match = docRe.exec(source)) {
        const since = /@since\s+([\d.]+)/.exec(match.groups.doc);
        if (!since) continue;

        const owner = scopeAt(match.index);
        if (!owner) continue;

        const name = /^(?:readonly\s+|static\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)/.exec(
            match.groups.decl.trim()
        );
        if (!name) continue;

        const key = `${owner}.${name[1]}`;
        const current = annotations.get(key);
        if (!current || compareVersions(since[1], current) > 0) {
            annotations.set(key, since[1]);
        }
    }

    const code = walk(SRC, ".ts").map(read).join("\n");
    const offenders = [];
    const exempted = [];

    for (const [key, since] of annotations) {
        const owner = key.split(".")[0];
        if (!WATCHED.has(owner)) continue;
        if (compareVersions(since, minApp) <= 0) continue;

        const member = key.split(".")[1];
        if (!new RegExp(`\\.${member}\\b`).test(code)) continue;

        if (KNOWN_SAFE.has(key)) exempted.push(`${key} (要求 ${since}，${KNOWN_SAFE.get(key)})`);
        else offenders.push(`${key} 要求 ${since}`);
    }

    if (offenders.length > 0) {
        failures.push(
            `minAppVersion 是 ${minApp}，但代码用到更高的 API：\n      ` +
                offenders.join("\n      ") +
                `\n      要么换掉这些 API，要么把 manifest.json 的 minAppVersion 提上去；` +
                `确实安全就加进 scripts/checks.mjs 的 KNOWN_SAFE 并写清理由。`
        );
    }

    return {
        name: "minAppVersion 一致性",
        detail: `minAppVersion=${minApp}，豁免 ${exempted.length} 处`,
    };
}

// ── 2. 硬编码中文 ───────────────────────────────────────────────────────────

function checkHardcodedCjk() {
    const CJK = /[\u4e00-\u9fff]/;

    /**
     * 允许保留的硬编码中文，附理由。
     *
     * 加进来时必须能回答一个问题：**这句中文会给用户看吗？**
     * 会的话就该进 locale；不会的话说明理由。
     */
    const ALLOWED = new Map([
        [
            "src/host/giteeHost.ts",
            "用于匹配 Gitee 限流响应体的检测词，不是给用户看的文案",
        ],
    ]);

    const findings = [];
    const allowed = [];
    for (const file of walk(SRC, ".ts")) {
        const rel = relative(file);
        if (rel.includes("/locales/")) continue;

        const reason = ALLOWED.get(rel);
        const lines = stripComments(read(file)).split("\n");
        lines.forEach((line, index) => {
            if (!CJK.test(line)) return;
            for (const match of line.match(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g) ?? []) {
                if (!CJK.test(match)) continue;
                const entry = `${rel}:${index + 1}  ${match.slice(0, 60)}`;
                if (reason) allowed.push(`${entry}  ← ${reason}`);
                else findings.push(entry);
                break;
            }
        });
    }

    if (findings.length > 0) {
        failures.push(
            `locale 之外有 ${findings.length} 处硬编码中文（英文界面下会露出来）：\n      ` +
                findings.join("\n      ") +
                `\n      确实不该进 locale 的，加进 scripts/checks.mjs 的 ALLOWED 并写清理由。`
        );
    }

    return {
        name: "硬编码中文",
        detail: `${findings.length} 处待处理，${allowed.length} 处已豁免`,
    };
}

// ── 3. 未使用的 i18n 键 ─────────────────────────────────────────────────────

/**
 * 数一行里**不在字符串中**的括号净数（`(` 记 +1，`)` 记 -1）。
 *
 * 要跳过字符串，是因为形参可以有默认值、类型也可以是函数类型
 * （`onChange: (v: number) => void`），而 locale 里的字符串完全可能含括号。
 * 逐行扫的简单状态机够用：locale 文件里的字符串都是单行的（长文本用 `+` 拼接，
 * 而不是多行模板串）。
 */
function parenBalance(line) {
    let depth = 0;
    let quote = "";
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quote) {
            if (char === "\\") index++;
            else if (char === quote) quote = "";
            continue;
        }
        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "(") depth++;
        else if (char === ")") depth--;
    }
    return depth;
}

function checkUnusedI18nKeys() {
    const localePath = path.join(SRC, "core/i18n/locales/zh-cn.ts");
    if (!fs.existsSync(localePath)) return { name: "未使用的 i18n 键", skipped: true };

    const collectKeys = (source) => {
        const keys = [];
        const stack = [];
        /**
         * 还在多行参数表里的括号深度（0 = 不在里面）。
         *
         * 形参的写法（`upload: number,`）与键值对**长得一模一样**，逐行扫
         * 分不出来。不加这个守卫时，每个形参名都会被登记成一个 i18n 键。
         * 以前没暴露出来只是碰巧：`upload` / `skipped` 这些名字在代码里
         * 别处也有 `.upload` / `.skipped` 的访问，于是被当成「已引用」了 ——
         * 换一个没被别处用到的形参名（`conflicts`）就会立刻误报。
         */
        let paramDepth = 0;

        for (const line of source.split("\n")) {
            const trimmed = line.trim();

            if (paramDepth > 0) {
                paramDepth = Math.max(0, paramDepth + parenBalance(trimmed));
                continue;
            }

            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

            const match = /^(\w+):\s*(.*)$/.exec(trimmed);
            if (!match) continue;

            const indent = line.length - line.trimStart().length;
            while (stack.length > 0 && stack[stack.length - 1][0] >= indent) stack.pop();

            if (match[2].startsWith("{")) {
                stack.push([indent, match[1]]);
                continue;
            }
            keys.push([...stack.map((entry) => entry[1]), match[1]].join("."));

            // 值以 `(` 开头 = 这是个函数值，后面可能是**多行**参数表。
            // 单行参数表（`(a: number, b: string) =>`）的净括号数为 0，
            // 于是不会误进「参数表模式」。
            if (match[2].startsWith("(")) {
                paramDepth = Math.max(0, parenBalance(match[2]));
            }
        }
        return keys;
    };

    const leafKeys = collectKeys(read(localePath));
    const code = walk(SRC, ".ts")
        .filter((file) => !relative(file).includes("/locales/"))
        .map(read)
        .join("\n");

    // 通用 UI 词汇表：留着比删了再加省事，不算问题。
    const GENERIC_PREFIXES = ["common.", "notice."];

    const unused = leafKeys.filter((key) => {
        if (GENERIC_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;

        const parts = key.split(".");
        const leaf = parts.pop();
        const parent = parts.pop();

        // 静态访问：`.leaf`
        if (new RegExp(`\\.${leaf}\\b`).test(code)) return false;

        // 动态索引：`parent[expr]` —— 比如 `t.sync.diagnoseCheck[check.id]`。
        // 静态扫不到具体键名，但这类写法**确实在用整组键**，
        // 报成死键是误报。所以只要父对象被索引访问过，就视为已用。
        if (parent && new RegExp(`\\.${parent}\\s*\\[`).test(code)) return false;

        return true;
    });

    if (unused.length > 0) {
        failures.push(
            `有 ${unused.length} 个 i18n 键定义了却没被引用（通常是漏接的本地化或没接线的功能）：\n      ` +
                unused.join("\n      ")
        );
    }

    return { name: "未使用的 i18n 键", detail: `${unused.length} 个` };
}

// ── 4. CSS 类覆盖 ───────────────────────────────────────────────────────────

function checkCssClasses() {
    const cssPath = path.join(ROOT, "styles.css");
    if (!fs.existsSync(cssPath)) return { name: "CSS 类覆盖", skipped: true };

    /**
     * **不是** CSS 类名的 `obsync-*` 字符串。
     *
     * `obsync-` 这个前缀也被别的东西用着（存储键、视图类型标识）。
     * 加进来必须说明它是什么 —— 否则这张表会变成掩盖漏样式的地方。
     */
    const NOT_A_CLASS = [
        {
            match: (name) => name.startsWith("obsync-token-"),
            why: "SecretStore 的密钥 id 前缀",
        },
        {
            match: (name) => name.startsWith("obsync-last-auto-"),
            why: "Automatics 的「上次执行时间」存储键前缀",
        },
        {
            match: (name) => name === "obsync-sync-view",
            why: "源码控制视图的类型标识（registerView 用），不是 CSS 类",
        },
        {
            match: (name) => name === "obsync-image-view",
            why: "图片管理视图的类型标识（registerView 用），不是 CSS 类",
        },
        {
            match: (name) => name.startsWith("obsync-image-state"),
            why: "图片同步状态清单的 localStorage 键（syncState.ts）",
        },
        {
            match: (name) => name === "obsync-backup",
            why: "历史备份的引用前缀（cleanup.ts 的 refs/obsync-backup/…），不是 CSS 类",
        },
    ];

    /**
     * 收集代码里用到的类名。
     *
     * 全文扫而不是按行扫 —— 类名可能出现在多类名字符串里
     * （`cls: "obsync-badge obsync-badge-update"`）、
     * 或者跨行的三元赋值里（`const cls = a ? "obsync-x" : "obsync-y"`）。
     * 按行匹配会漏掉这两种，把它们误报成「定义了没用到」。
     */
    const used = new Set();
    for (const file of walk(SRC, ".ts")) {
        for (const match of stripComments(read(file)).matchAll(/obsync-[\w-]+/g)) {
            const name = match[0];
            if (NOT_A_CLASS.some((entry) => entry.match(name))) continue;
            used.add(name);
        }
    }

    const defined = new Set(
        [...read(cssPath).matchAll(/\.(obsync-[\w-]+)/g)].map((match) => match[1])
    );

    const missing = [...used].filter((name) => !defined.has(name));
    const zombie = [...defined].filter((name) => !used.has(name));

    if (missing.length > 0 || zombie.length > 0) {
        const parts = [];
        if (missing.length > 0) parts.push(`用了但没定义（会静默丢样式）：${missing.join(", ")}`);
        if (zombie.length > 0) parts.push(`定义了但没用到：${zombie.join(", ")}`);
        failures.push(parts.join("\n      "));
    }

    return { name: "CSS 类覆盖", detail: `${used.size} 用 / ${defined.size} 定义` };
}

/**
 * 移动端安全：主类的**静态**导入图里不能出现依赖 Node 的模块。
 *
 * ## 为什么
 *
 * `manifest.json` 写的是 `isDesktopOnly: false`，移动端用户可以安装。
 * 而 `simple-git`（及其依赖）在**模块初始化阶段**就 `require("child_process")`
 * / `require("fs")`。移动端没有 Node 集成，`require` 不可用 ——
 * Obsidian 官方文档明确说这类调用「会让插件崩溃」。
 *
 * 静态导入会让整条依赖链在插件加载时就初始化，于是移动端一启用就崩，
 * 连纯 HTTP 的安装器都用不了。所以 `main.ts` 用**动态 import** 把同步模块
 * 推迟到确认桌面端之后（见 `loadSyncModule`）。
 *
 * 这个不变式很容易被后来的改动破坏 —— 谁顺手写回 `import { createSyncModule }`
 * 就白改了，而且**在桌面上测不出来**。所以在这里守住。
 *
 * ## 怎么查
 *
 * 从 `main.ts` 出发走一遍**静态**导入图（`import type` 会被擦除、动态 import
 * 不算），看有没有走到依赖 Node 的裸模块。
 */
function checkMobileSafety() {
    const entry = path.join(SRC, "main.ts");
    if (!fs.existsSync(entry)) return { name: "移动端安全", skipped: true };

    /** 这些裸模块依赖 Node，不能在移动端可达的静态导入图里。 */
    const NODE_DEPENDENT = ["simple-git"];

    const STATIC_IMPORT = /^import\s+(?!type\b)[^;]*from\s+"([^"]+)"/gm;

    const resolveRelative = (from, id) => {
        const base = path.resolve(path.dirname(from), id);
        for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
            if (fs.existsSync(candidate)) return candidate;
        }
        return base;
    };

    const visited = new Set();
    const queue = [entry];
    const offenders = [];

    while (queue.length > 0) {
        const file = queue.pop();
        if (visited.has(file)) continue;
        visited.add(file);

        if (!fs.existsSync(file)) continue;
        const source = stripComments(read(file));

        for (const match of source.matchAll(STATIC_IMPORT)) {
            const id = match[1];
            if (!id.startsWith(".")) {
                if (NODE_DEPENDENT.includes(id)) {
                    offenders.push(`${relative(file)} → ${id}`);
                }
                continue;
            }
            queue.push(resolveRelative(file, id));
        }
    }

    if (offenders.length > 0) {
        failures.push(
            `移动端可达的静态导入图里出现了依赖 Node 的模块：\n      ` +
                offenders.join("\n      ") +
                `\n      移动端没有 Node，这会让整个插件加载失败（连纯 HTTP 的安装器都用不了）。` +
                `\n      改法：用动态 import 把它推迟到 Platform.isDesktopApp 之后。`
        );
    }

    return {
        name: "移动端安全",
        detail: `静态导入图 ${visited.size} 个模块，未触及 Node 依赖`,
    };
}

// ── 6. 设置项无人读取 ───────────────────────────────────────────────────────

/**
 * 找出「声明了、持久化了、设置页也渲染了，但功能代码从不读」的设置项。
 *
 * 由来：`sync.enabled`（设置页的「启用笔记同步」）曾经就是这样 —— 有开关、
 * `data.json` 里存着值、README 也列着它，而 `src` 里**没有一处读它**。于是用户
 * 关掉同步之后，自动提交照样每 N 分钟把笔记推上远端：他做了 UI 提供给他的动作，
 * 却没有效果。这比没有那个开关更糟。
 *
 * 为什么非要有这个检查 —— **类型和测试都抓不到**：
 *   - 类型上 `true` 也是 `boolean`，接错线看不出来；
 *   - 测试里 `Automatics` 直接注入设置对象，看不见装配层那一行。
 *     实测：把 `enabled: deps.getSettings().sync.enabled` 改成 `enabled: true`，
 *     全量测试**全绿**（12/12）。
 * 这和第 3 项「未使用的 i18n 键」是同一类信号，只是载体不同。
 *
 * ## 判据（保守：只认「读」，宁可漏报不误报）
 *
 * 只扫两个嵌套容器 `installer.*` / `sync.*` —— 它们的限定前缀没有歧义。
 * 顶层 `ObsyncSettings` 的字段（language / showNotices / …）读起来形如
 * `this.settings.language`，容器名与局部变量名混在一起扫不准，故不扫。
 *
 * 一个文件算「读过」某字段，满足其一即可：
 *   - 限定访问：`.sync.enabled`（后面跟 `=` 的是写，不算读）
 *   - 提升访问：文件里先 `const x = …getSettings().installer`，再读 `x.enabled`
 *     （`installer.autoCheckOnStartup` 用的就是这个写法，只看限定访问会误报）
 *
 * `settingsTab.ts` **不在扫描范围**：它读设置是为了渲染与持久化，不是消费。
 * 正是这一点让检查有意义 —— 否则每个字段都会被设置页自己「读」到。
 */
function checkUnreadSettings() {
    const settingsPath = path.join(SRC, "core/settings.ts");
    if (!fs.existsSync(settingsPath)) return { name: "设置项无人读取", skipped: true };

    /**
     * 例外：确实有消费方，但上面的判据扫不到。**每加一条都要写清理由** ——
     * 这个列表天生是盲区，一旦变成「看到报错就加进来」的垃圾桶，
     * 检查就只会给人虚假的安心。
     *
     * 目前两条同源：走的是「settingsTab 组一个参数对象 → 消费方读参数属性」，
     * 读取点在 settingsTab（范围外），消费点拿到的是**参数**而不是设置对象
     * （其中一条还改了名：`lastUpdateCheckAt` → `lastCheckAt`，静态规则接不上）。
     *
     * 别为了消掉这两条去放宽判据 —— 试过「属性名在参数类型里出现就算用过」，
     * 后果是 `AutomaticsSettings.enabled` 会把 `sync.enabled` 也算成用过，
     * 检查对真正的漏接线（`enabled: true`）就彻底失效了。
     */
    const EXEMPT = new Map([
        [
            "installer.autoCheckOnSettingsOpen",
            "settingsTab 读它并交给 shouldCheckOnSettingsOpen(input)，" +
                "消费点在 updateChecker 的参数属性上",
        ],
        [
            "installer.lastUpdateCheckAt",
            "同上，且在参数对象里改了名（lastCheckAt），静态规则无法关联",
        ],
    ]);

    const settingsSource = stripComments(read(settingsPath));
    const containers = {
        InstallerSettings: "installer",
        SyncSettings: "sync",
        // 图片同步的字段里有「决定删不删文件」的那两个开关。它们**必须**被
        // 逻辑层读到 —— 只在设置页把值存下来而没人消费，正是这个检查要拦的东西。
        ImageSyncSettings: "images",
    };

    const fields = [];
    for (const [name, container] of Object.entries(containers)) {
        const body = new RegExp(`interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(settingsSource);
        if (!body) continue;
        for (const line of body[1].split("\n")) {
            const match = /^\s*(\w+)\s*[?:]/.exec(line);
            if (match) fields.push([container, match[1]]);
        }
    }

    const candidates = walk(SRC, ".ts")
        .map((file) => [relative(file), stripComments(read(file))])
        // 声明与反序列化（settings.ts）、渲染与持久化（settingsTab.ts）都不算消费方。
        .filter(([name]) => name !== "src/core/settings.ts" && name !== "src/settingsTab.ts");

    const unread = [];
    for (const [container, field] of fields) {
        if (EXEMPT.has(`${container}.${field}`)) continue;

        const isRead = candidates.some(([, source]) => {
            if (new RegExp(`\\.${container}\\.${field}\\b(?!\\s*=(?!=))`).test(source)) return true;

            const hoisted =
                source.match(
                    new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=[^;\\n]*\\.${container}\\b`, "g")
                ) ?? [];
            return hoisted.some((statement) => {
                const localName = /(?:const|let|var)\s+(\w+)/.exec(statement)[1];
                // 前面不能是 `.` 或词字符：`!s.enabled` 要算读到，`other.s.enabled` 不算。
                return new RegExp(`(?<![\\w.])${localName}\\.${field}\\b`).test(source);
            });
        });

        if (!isRead) unread.push(`${container}.${field}`);
    }

    if (unread.length > 0) {
        failures.push(
            `有 ${unread.length} 个设置项从没被功能代码读过（用户改了它不会有任何效果）：\n      ` +
                unread.join("\n      ") +
                `\n      设置页能改、data.json 里也存着，但 src 里没有消费方（settingsTab 的渲染不算）。` +
                `\n      要么接上线（把它注入到真正用它的地方，参考 installer.autoCheckOnStartup 的接法），` +
                `要么把这个设置项删掉 —— 一个改了没作用的开关比没有开关更糟。` +
                `\n      确实有消费方、只是判据扫不到时，往 EXEMPT 里加一条并写明理由。`
        );
    }

    return { name: "设置项无人读取", detail: `${unread.length} 个未接线` };
}

// ── 7. locale 里的 Markdown 加粗 ───────────────────────────────────────────

/**
 * 取出源码里所有**字符串字面量**（注释里的不算），带行号。
 *
 * 逐字符扫：行注释与块注释直接丢弃，引号里的内容原样收下。之所以不用
 * `stripComments` + 正则，是因为这里要的结果必须与「用户实际会看到什么」
 * 一致 —— 注释里的 `**` 是写给读代码的人的强调，不是界面上会出现的星号。
 */
function stringLiterals(source) {
    const out = [];
    let i = 0;
    let line = 1;
    let state = "code";

    while (i < source.length) {
        const char = source[i];
        const next = source[i + 1];

        if (char === "\n") line++;

        if (state === "code") {
            if (char === "/" && next === "/") {
                state = "line";
                i += 2;
                continue;
            }
            if (char === "/" && next === "*") {
                state = "block";
                i += 2;
                continue;
            }
            if (char === '"' || char === "'" || char === "`") {
                state = char;
                out.push({ text: "", line });
                i++;
                continue;
            }
            i++;
            continue;
        }

        if (state === "line") {
            if (char === "\n") state = "code";
            i++;
            continue;
        }

        if (state === "block") {
            if (char === "*" && next === "/") {
                state = "code";
                i += 2;
                continue;
            }
            i++;
            continue;
        }

        // 字符串内部
        if (char === "\\") {
            out[out.length - 1].text += source.slice(i, i + 2);
            if (next === "\n") line++;
            i += 2;
            continue;
        }
        if (char === state) {
            state = "code";
            i++;
            continue;
        }
        out[out.length - 1].text += char;
        i++;
    }

    return out;
}

/**
 * 界面**不渲染 Markdown**：`Setting.setDesc`、`Notice`、tooltip、以及
 * `.gitignore` 模板的正文都是纯文本，所以文案里写的加粗标记会原样显示成
 * 星号（用户实测看到的就是这个，原话：「设置项里的说明文字除非能正常渲染
 * md 格式，否则不要使用加粗 `**` 格式」）。
 *
 * 例外：`**` 作为**语法**合法出现的地方（gitignore 模板里以两个星号开头的
 * 路径通配）可以留在 ALLOWED 里 —— 加进来必须写清它为什么不是加粗。
 */
function checkLocaleBold() {
    const localeDir = path.join(SRC, "core/i18n/locales");
    if (!fs.existsSync(localeDir)) return { name: "locale 加粗标记", skipped: true };

    /** 允许保留的片段，附理由。目前为空 —— 有的话必须说明它不是加粗。 */
    const ALLOWED = [];

    const findings = [];
    const allowed = [];
    for (const file of walk(localeDir, ".ts")) {
        for (const literal of stringLiterals(read(file))) {
            if (!literal.text.includes("**")) continue;
            const entry = `${relative(file)}:${literal.line}  ${literal.text.trim().slice(0, 70)}`;
            const exempt = ALLOWED.find((rule) => rule.match(literal.text));
            if (exempt) allowed.push(`${entry}  ← ${exempt.why}`);
            else findings.push(entry);
        }
    }

    if (findings.length > 0) {
        failures.push(
            `locale 里有 ${findings.length} 处 Markdown 加粗标记（界面是纯文本，会原样显示成星号）：\n      ` +
                findings.join("\n      ") +
                `\n      去掉 \`**\`（要强调就换措辞），或者确认那一处真的会按 Markdown 渲染。` +
                `\n      确实该保留的（例如 gitignore 模板里两个星号开头的路径通配），加进 ALLOWED 并写清理由。`
        );
    }

    return {
        name: "locale 加粗标记",
        detail: `${findings.length} 处待处理，${allowed.length} 处已豁免`,
    };
}

// ── 8. CSS 注释完整性 ───────────────────────────────────────────────────────


/**
 * CSS 注释里出现「星号紧跟斜杠」会**提前结束注释**，而注释后面的文字会被当成
 * **下一条规则的选择器** —— 于是那条规则被解析器**整条静默丢弃**：
 * 不报错、不警告，样式就是不生效。
 *
 * ## 为什么必须单独查（2026-10-10 实测踩到）
 *
 * `styles.css` 里那句注释原本要举「递归通配」的例子，而我把它写成了
 * 两个星号紧接一个斜杠 —— 那个斜杠紧跟在星号后面，注释于是在那里就结束了。被吃掉的是紧接着的
 * `.obsync-settings .obsync-gitignore { width: 100%; … }`，症状是
 * **`.gitignore` 代码框全宽失效**（用户报的「输入框全宽失效了」）。
 *
 * ## 为什么现有 7 项都拦不住
 *
 * 第 4 项（CSS 类覆盖）用正则扫 `obsync-*` 字符串，而**被丢弃的规则在文本上
 * 仍然「有定义」** —— 类名照样出现在文件里，检查照样通过。这正是它最坏的地方：
 * 判据与「CSS 到底解析出了什么」之间隔着一层，而那层是**真的解析器**。
 * 所以这一项的判据必须模拟解析器：**注释在第一个终止符处结束**，此后遇到的终止符
 * 就是游离的 —— 它前面那条规则已经被吃掉了。
 *
 * 修法：注释里别写那个两字符组合（要举递归通配的例子就绕开它，
 * 例如写成「以两个星号开头的递归匹配」）。
 *
 * 注：本文件自己就踩过一次 —— 写这段注释时在里面直接写了那个组合，
 * 于是**这个 JS 文件**也报 `SyntaxError`。同一个坑，同一天，第二次。
 */
function checkCssComments() {
    const cssPath = path.join(ROOT, "styles.css");
    if (!fs.existsSync(cssPath)) return { name: "CSS 注释完整性", skipped: true };

    const source = read(cssPath);
    const stray = [];
    let inComment = false;
    let line = 1;
    let index = 0;

    while (index < source.length) {
        if (source[index] === "\n") line++;
        if (!inComment && source.startsWith("/*", index)) {
            inComment = true;
            index += 2;
            continue;
        }
        if (inComment && source.startsWith("*/", index)) {
            inComment = false;
            index += 2;
            continue;
        }
        if (!inComment && source.startsWith("*/", index)) {
            // 走到这里说明**上一条注释已经提前结束**，接下来那条规则被吃掉了。
            stray.push(`第 ${line} 行：游离的 \`*/\`（它前面那条规则已被解析器整条丢弃）`);
            index += 2;
            continue;
        }
        index += 1;
    }

    if (inComment) {
        failures.push(
            `styles.css 结尾有**未闭合**的注释（从某处开始一直没遇到 \`*/\`）—— ` +
                `它后面的规则全部不会生效。`
        );
    }
    if (stray.length > 0) {
        failures.push(
            `styles.css 有 ${stray.length} 处提前结束的注释：\n      ` +
                stray.join("\n      ") +
                `\n      注释里出现 \`*/\` 会提前结束它，剩下的文字被当成下一条规则的选择器，` +
                `那条规则于是被**静默丢弃**（不报错、样式就是不生效）。` +
                `\n      想表达 \`**/\` 就换个说法（例如「以 \`**\` 开头的递归匹配」）。`
        );
    }

    return { name: "CSS 注释完整性", detail: `${stray.length} 处提前结束的注释` };
}

// ── 跑 ──────────────────────────────────────────────────────────────────────

const results = [
    checkMinAppVersion(),
    checkHardcodedCjk(),
    checkUnusedI18nKeys(),
    checkCssClasses(),
    checkMobileSafety(),
    checkUnreadSettings(),
    checkLocaleBold(),
    checkCssComments(),
];

console.log("SyncHub 项目自查\n");
for (const result of results) {
    const status = result.skipped ? "跳过" : "通过";
    const detail = result.skipped ? `（${result.skipped}）` : result.detail ? ` — ${result.detail}` : "";
    console.log(`  [${status}] ${result.name}${detail}`);
}

if (failures.length > 0) {
    console.log("\n发现问题：\n");
    for (const failure of failures) console.log(`  - ${failure}\n`);
    process.exit(1);
}

console.log("\n全部通过 ✅");
