import { describe, expect, it } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import { DiffView, type DiffViewState } from "../../src/features/sync/ui/DiffView";
import type { FileDiff } from "../../src/features/sync/diff";
import type { FileDiffSet, SyncService } from "../../src/features/sync/syncService";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";

/**
 * 差异**标签页**（2026-10-04 从弹窗改过来）。
 *
 * 用户的原话：「点击查看diff页面时，应该以标签页形式打开而不是模态框，模态框太小了」。
 * 渲染逻辑是从 `DiffModal` 移过来的（一字未改），所以这里钉住的仍然是「说清了没有」
 * 而不是「做了什么」：二进制与纯重命名要说清它们各自是什么（一片空白会被读成
 * 「没有改动」）、截断要说出来（否则「只显示了前面一部分」看起来就是「改动只有
 * 这么多」）、读失败要留在页里而不是变成一条错误提示。
 *
 * 另外补了标签页特有的两条：**状态可从 `workspace.json` 恢复**（`setState` 只吃
 * 可序列化的 `{ kind, target }`）与**文件差异会跟着状态刷新**。
 */

type ShimNode = {
    cls?: string;
    text?: string;
    attrs?: Record<string, string>;
    children?: ShimNode[];
    trigger?: (name: string, ...args: unknown[]) => void;
};

function allText(node: ShimNode): string {
    let out = node.text ?? "";
    for (const child of node.children ?? []) out += ` ${allText(child)}`;
    return out;
}

function textDiff(overrides: Partial<FileDiff> = {}): FileDiff {
    return {
        path: "notes/a.md",
        previousPath: undefined,
        kind: "text",
        hunks: [
            {
                header: "@@ -1,2 +1,2 @@",
                lines: [
                    { kind: "del", text: "旧行", oldLine: 1, newLine: null },
                    { kind: "add", text: "新行", oldLine: null, newLine: 1 },
                ],
            },
        ],
        additions: 1,
        deletions: 1,
        truncated: false,
        ...overrides,
    };
}

function emptyDiff(path = "notes/a.md"): FileDiff {
    return {
        path,
        previousPath: undefined,
        kind: "empty",
        hunks: [],
        additions: 0,
        deletions: 0,
        truncated: false,
    };
}

/** 一个 `FileDiffSet`（工作区 + 已暂存两半）。 */
function diffSet(working: FileDiff, staged: FileDiff = emptyDiff()): FileDiffSet {
    return { path: working.path, unstaged: working, staged };
}

interface Harness {
    view: DiffView;
    /** 让状态推送一次（验「文件差异跟着刷新」）。 */
    publish(): Promise<void>;
}

async function makeView(options: {
    state: DiffViewState;
    fileDiff?: FileDiffSet | (() => Promise<FileDiffSet>);
    commitDiff?: FileDiff[] | (() => Promise<FileDiff[]>);
    /** 不调 `onOpen`（验「关掉之后异步结果不再写回」那种时序）。 */
    skipOpen?: boolean;
}): Promise<Harness> {
    let listener: (() => void) | undefined;
    const service = {
        fileDiff: async () =>
            typeof options.fileDiff === "function"
                ? options.fileDiff()
                : options.fileDiff ?? diffSet(textDiff()),
        commitDiff: async () =>
            typeof options.commitDiff === "function"
                ? options.commitDiff()
                : options.commitDiff ?? [textDiff()],
        onStatusChange: (callback: () => void) => {
            listener = callback;
            return () => {
                listener = undefined;
            };
        },
    } as unknown as SyncService;

    const view = new DiffView(null as unknown as WorkspaceLeaf, {
        service,
        getT: () => zhCN,
    });
    // 替身的 `ItemView` 不像 `Modal` 那样 `open()` 就触发 `onOpen` ——
    // 真实 Obsidian 在叶子挂上视图时调它，这里手动补上（与图片管理视图的用例同一做法）。
    await view.setState(options.state, {} as never);
    if (!options.skipOpen) await view.onOpen();

    return {
        view,
        /** 让服务推一次状态，并把视图那次重绘跑完。 */
        publish: async () => {
            listener?.();
            await flush();
        },
    };
}

/** 内容区里那一棵垫片子树。 */
function body(h: Harness): ShimNode {
    return h.view.contentEl as unknown as ShimNode;
}

/** 让 `void this.render(...)` 这类不 await 的调用跑完。 */
async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DiffView", () => {
    it("按节渲染：节标题、文件路径、行号、增删行、统计都在", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff()),
        });

        const text = allText(body(h));

        expect(text).toContain(zhCN.sync.diff.section.working);
        expect(text).toContain("notes/a.md");
        expect(text).toContain("@@ -1,2 +1,2 @@");
        // 行首标记补回来了（`DiffLine.text` 刻意不含它）
        expect(text).toContain("+新行");
        expect(text).toContain("-旧行");
        expect(text).toContain(zhCN.sync.diff.stats(1, 1));
    });

    it("空的那一节**整节不渲染**（一个只有标题的空节像没加载出来）", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff()),
        });

        expect(allText(body(h))).not.toContain(zhCN.sync.diff.section.staged);
    });

    it("两节都有内容时两节都渲染（同一个文件可能两边都改了）", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff(), textDiff({ additions: 2 })),
        });

        const text = allText(body(h));
        expect(text).toContain(zhCN.sync.diff.section.working);
        expect(text).toContain(zhCN.sync.diff.section.staged);
    });

    it("全空时说「没有可显示的差异」，而不是一片空白", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(emptyDiff()),
        });

        expect(allText(body(h))).toContain(zhCN.sync.diff.noChanges);
    });

    it("二进制说清是二进制 —— 说成「没有差异」是错的（它确实改了）", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff({ kind: "binary", hunks: [], additions: 0, deletions: 0 })),
        });

        const text = allText(body(h));
        expect(text).toContain(zhCN.sync.diff.binary);
        expect(text).not.toContain(zhCN.sync.diff.noChanges);
    });

    it("纯重命名：标题写出旧路径，并说明只是改了名字", async () => {
        const h = await makeView({
            state: { kind: "file", target: "b.md" },
            fileDiff: diffSet(
                textDiff({
                    path: "b.md",
                    previousPath: "a.md",
                    kind: "renamed",
                    hunks: [],
                    additions: 0,
                    deletions: 0,
                })
            ),
        });

        const text = allText(body(h));
        expect(text).toContain("a.md → b.md");
        expect(text).toContain(zhCN.sync.diff.renamed);
    });

    it("太大而未读的文件要说出来", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff({ kind: "too-large", hunks: [], additions: 0, deletions: 0 })),
        });

        expect(allText(body(h))).toContain(zhCN.sync.diff.tooLarge);
    });

    it("被截断时提示「只显示了前面一部分」", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(textDiff({ truncated: true })),
        });

        expect(allText(body(h))).toContain(zhCN.sync.diff.truncated);
    });

    it("`\\ No newline` 标记渲染成 locale 文案，不是那句英文", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: diffSet(
                textDiff({
                    hunks: [
                        {
                            header: "@@ -1 +1 @@",
                            lines: [{ kind: "no-newline", text: "", oldLine: null, newLine: null }],
                        },
                    ],
                })
            ),
        });

        const text = allText(body(h));
        expect(text).toContain(zhCN.sync.diff.noNewline);
        expect(text).not.toContain("No newline");
    });

    it("提交差异可以跨多个文件，各自一个标题", async () => {
        const h = await makeView({
            state: { kind: "commit", target: "0123456" },
            commitDiff: [textDiff({ path: "a.md" }), textDiff({ path: "b.md" })],
        });

        const text = allText(body(h));
        expect(text).toContain(zhCN.sync.diff.section.commit);
        expect(text).toContain("a.md");
        expect(text).toContain("b.md");
    });

    it("读取失败在页里说一句，**不往外抛**（它是个只读旁路）", async () => {
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: async () => {
                throw new Error("git 挂了");
            },
        });

        expect(allText(body(h))).toContain(zhCN.sync.diff.loadFailed);
    });

    it("标签上写着看的是哪一个（提交差异用短 hash + 第一行）", async () => {
        const h = await makeView({
            state: { kind: "commit", target: "0123456", label: "0123456 同步：1 个文件" },
            commitDiff: [],
        });

        expect(h.view.getDisplayText()).toBe(
            `${zhCN.sync.diff.title} · 0123456 同步：1 个文件`
        );
        expect(allText(body(h))).toContain("0123456 同步：1 个文件");
        // 视图类型写进 `workspace.json`，不能随便改
        expect(h.view.getViewType()).toBe("obsync-diff-view");
    });

    it("内容还没读回来时先说「正在读取」", async () => {
        let release: (() => void) | undefined;
        const view = new DiffView(null as unknown as WorkspaceLeaf, {
            service: {
                fileDiff: () =>
                    new Promise<FileDiffSet>((resolve) => {
                        release = () => resolve(diffSet(emptyDiff()));
                    }),
                onStatusChange: () => () => undefined,
            } as unknown as SyncService,
            getT: () => zhCN,
        });
        await view.setState({ kind: "file", target: "notes/a.md" }, {} as never);
        void view.onOpen();

        expect(allText(view.contentEl as unknown as ShimNode)).toContain(
            zhCN.sync.diff.loading
        );

        release!();
        await flush();
    });

    it("关掉之后异步结果不再写回（不抛错）", async () => {
        let release: (() => void) | undefined;
        const view = new DiffView(null as unknown as WorkspaceLeaf, {
            service: {
                fileDiff: () =>
                    new Promise<FileDiffSet>((resolve) => {
                        release = () => resolve(diffSet(textDiff()));
                    }),
                onStatusChange: () => () => undefined,
            } as unknown as SyncService,
            getT: () => zhCN,
        });
        await view.setState({ kind: "file", target: "notes/a.md" }, {} as never);
        void view.onOpen();
        await view.onClose();

        release!();
        await expect(flush()).resolves.toBeUndefined();
    });

    it("状态里没带目标时说一句，而不是一片空白（标签页会从 workspace.json 恢复）", async () => {
        const view = new DiffView(null as unknown as WorkspaceLeaf, {
            service: {} as unknown as SyncService,
            getT: () => zhCN,
        });
        await view.onOpen();

        expect(allText(view.contentEl as unknown as ShimNode)).toContain(zhCN.sync.diff.noTarget);
    });

    it("文件差异跟着状态刷新（标签页是常驻的，快照会过期）", async () => {
        let current = diffSet(textDiff());
        const h = await makeView({
            state: { kind: "file", target: "notes/a.md" },
            fileDiff: async () => current,
        });
        expect(allText(body(h))).toContain("+新行");

        // 文件被改了（库外的编辑器 / 自动同步）→ 服务推一次状态
        current = diffSet(textDiff({ hunks: [], additions: 0, deletions: 0, kind: "binary" }));
        await h.publish();

        expect(allText(body(h))).toContain(zhCN.sync.diff.binary);
    });

    /**
     * 双栏对照（2026-10-04 加，用户要求「类似 vscode 那种双栏对照的视图模式」）。
     *
     * 配对规则本身在 `sideBySide.test.ts` 里测；这里测**接线**：默认统一视图、
     * 点一下切成双栏、再点回来，以及切完不会变成另一份内容。
     */
    describe("双栏对照", () => {
        /** 模式切换那一行里的按钮。 */
        function modeButtons(h: Harness): ShimNode[] {
            const row = findAll(
                body(h),
                (child) => child.cls === "obsync-diff-modes"
            )[0];
            return (row?.children ?? []).filter((child) =>
                (child.cls ?? "").split(" ").includes("obsync-diff-mode")
            );
        }

        /** 递归找节点（垫片树不是 DOM，只能自己走）。 */
        function findAll(node: ShimNode, match: (child: ShimNode) => boolean): ShimNode[] {
            const out: ShimNode[] = [];
            for (const child of node.children ?? []) {
                if (match(child)) out.push(child);
                out.push(...findAll(child, match));
            }
            return out;
        }

        function sbs(h: Harness): string[] {
            return findAll(body(h), (child) => child.cls?.includes("obsync-diff-sbs-row") === true)
                .map((row) => JSON.stringify(row));
        }

        it("默认统一视图（一列），按钮上写着当前模式", async () => {
            const h = await makeView({ state: { kind: "file", target: "notes/a.md" } });

            expect(modeButtons(h).map((button) => button.text)).toEqual([
                zhCN.sync.diff.modeUnified,
                zhCN.sync.diff.modeSideBySide,
            ]);
            expect(modeButtons(h)[0]!.cls).toContain("is-active");
            expect(sbs(h)).toHaveLength(0);
        });

        it("点「双栏对照」→ 左右各一栏，两侧行号分别是旧号与新号", async () => {
            const h = await makeView({
                state: { kind: "file", target: "notes/a.md" },
                // 一行上下文 + 删/增各一行：双栏下应当得到 2 行
                fileDiff: diffSet(
                    textDiff({
                        hunks: [
                            {
                                header: "@@ -1,2 +1,2 @@",
                                lines: [
                                    { kind: "context", text: "同一行", oldLine: 1, newLine: 1 },
                                    { kind: "del", text: "旧行", oldLine: 2, newLine: null },
                                    { kind: "add", text: "新行", oldLine: null, newLine: 2 },
                                ],
                            },
                        ],
                    })
                ),
            });

            modeButtons(h)[1]!.trigger!("click");
            await flush();

            const rows = sbs(h);
            expect(rows).toHaveLength(2);
            // 上下文行：两侧都能读到同一行
            expect(rows[0]).toContain("同一行");
            // 改动行：左栏是旧内容、右栏是新内容（同一行里各占一半）
            expect(rows[1]).toContain("旧行");
            expect(rows[1]).toContain("新行");
            expect(modeButtons(h)[1]!.cls).toContain("is-active");
        });

        it("模式跟着状态持久化（恢复标签页时还是双栏）", async () => {
            const h = await makeView({
                state: { kind: "file", target: "notes/a.md", mode: "side-by-side" },
            });

            expect(modeButtons(h)[1]!.cls).toContain("is-active");
            expect(sbs(h).length).toBeGreaterThan(0);
        });

        it("切回统一视图：双栏的格子没了，增删行回到各自一行", async () => {
            const h = await makeView({
                state: { kind: "file", target: "notes/a.md", mode: "side-by-side" },
            });
            expect(sbs(h).length).toBeGreaterThan(0);

            modeButtons(h)[0]!.trigger!("click");
            await flush();

            expect(sbs(h)).toHaveLength(0);
            expect(allText(body(h))).toContain("+新行");
            expect(allText(body(h))).toContain("-旧行");
        });
    });
});
