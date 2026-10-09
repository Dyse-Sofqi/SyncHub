import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import {
    remoteStateText,
    shortDate,
    SourceControlView,
} from "../../src/features/sync/ui/SourceControlView";
import {
    ButtonComponent,
    createdSettings,
    DropdownComponent,
    openedModals,
    resetCreatedSettings,
    resetOpenedModals,
    Setting,
} from "../stubs/obsidian";
import { zhCN } from "../../src/core/i18n/locales/zh-cn";
import { en } from "../../src/core/i18n/locales/en";
import type { LocaleStrings } from "../../src/core/i18n";
import type { SyncService } from "../../src/features/sync/syncService";
import type { SimpleGitManager } from "../../src/features/sync/simpleGitManager";
import type { SyncActivity } from "../../src/features/sync/statusBar";
import type { CommitInfo, FileChange, RepoSize, RepoStatus } from "../../src/features/sync/types";

/**
 * 仓库同步视图（源码控制视图的后继 —— 只改了显示名与顶部布局，见文件头注释）。
 *
 * 这个面板此前**一个渲染测试都没有** —— 于是它有下面这些问题而没人发现：
 * 面板标题与「打开面板」的命令名都是「SyncHub」（命令面板里搜「同步」找不到）、
 * 不是仓库时只给一句提示没有任何出路、README 说它支持逐文件暂存而代码里
 * 根本没有暂存这个动作。
 *
 * 所以这里分两层测：
 *
 * 1. **纯函数**（`changeRows` / `remoteStateText` / `shortDate`）——
 *    列表去重、ahead/behind 的 null 语义这类问题读代码看不出来，
 *    而它们错了用户会看到**与事实相反**的内容。
 * 2. **渲染与交互**（用替身的 `Setting` 与 DOM shim 驱动）——
 *    点「暂存」必须对**那一行**的路径调用服务、冲突行**不能**给暂存开关。
 */

function change(path: string, status: FileChange["status"]): FileChange {
    return { path, status };
}

function status(partial: Partial<RepoStatus>): RepoStatus {
    return {
        branch: "main",
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        ahead: 0,
        behind: 0,
        ...partial,
    };
}


describe("remoteStateText", () => {
    it("ahead/behind 为 null 表示**没有 upstream**，不是「一致」", () => {
        // 当 0 显示成「与远端一致」正好说反了：那可能是一个从没推送过的分支，
        // 本地几十个提交、远端一个都没有。
        const text = remoteStateText(status({ ahead: null, behind: null }), zhCN);

        expect(text).toBe(zhCN.sync.noUpstreamHint);
    });

    it("都为 0 时是「与远端一致」", () => {
        expect(remoteStateText(status({ ahead: 0, behind: 0 }), zhCN)).toBe(
            zhCN.sync.inSyncWithRemote
        );
    });

    it("领先与落后各说各的", () => {
        expect(remoteStateText(status({ ahead: 2, behind: 0 }), zhCN)).toBe(
            zhCN.sync.aheadOf(2)
        );
        expect(remoteStateText(status({ ahead: 0, behind: 3 }), zhCN)).toBe(
            zhCN.sync.behindOf(3)
        );
    });

    it("双向分叉时两条都写", () => {
        expect(remoteStateText(status({ ahead: 2, behind: 3 }), zhCN)).toBe(
            `${zhCN.sync.aheadOf(2)} · ${zhCN.sync.behindOf(3)}`
        );
    });

    it("只判 null，0 仍然算「一致」而不是「没有 upstream」", () => {
        expect(remoteStateText(status({ ahead: 0, behind: null }), zhCN)).toBe(
            zhCN.sync.noUpstreamHint
        );
    });
});

describe("shortDate", () => {
    it("ISO 时间 → `YYYY-MM-DD HH:mm`", () => {
        // 用本地时间构造再断言，避免测试跟着时区变。
        const local = new Date(2026, 8, 19, 8, 5);
        expect(shortDate(local.toISOString())).toBe("2026-09-19 08:05");
    });

    it("解不出来的字符串原样返回（不显示 Invalid Date）", () => {
        expect(shortDate("不是时间")).toBe("不是时间");
        expect(shortDate("")).toBe("");
    });
});

// ── 渲染与交互 ──────────────────────────────────────────────────────────────

interface Harness {
    view: SourceControlView;
    calls: string[];
    /**
     * 视图碰过的 git 方法。
     *
     * 用来验那件**在真机上很贵**的事：`onOpen()` 一次 git 都不许跑
     * （Obsidian 恢复布局时会 await 它，见 SourceControlView 的类注释）。
     */
    gitCalls: string[];
    /** 让服务「在背后」推送一次状态（模拟自动提交 / 外部改动），并等重绘跑完。 */
    publish(status: RepoStatus | undefined): Promise<void>;
    /** 同上，但只推不等 —— 用来制造「渲染进行中又来状态」这种时序。 */
    emit(next: RepoStatus | undefined): void;
    /** 让下一次 `git log` 卡住（验渲染进行中到来的更新不会被丢掉）。 */
    holdLog(): void;
    releaseLog(): void;
    /** 打开面板，并把推迟到布局就绪之后的首次渲染跑完。 */
    open(): Promise<void>;
    /** 等几轮宏任务：布局就绪回调、合并窗、渲染本身都在宏任务里。 */
    settle(): Promise<void>;
    /** 只让出一轮（用来精确控制「渲染已经开始了吗」）。 */
    turn(): Promise<void>;
    refreshCount(): number;
    /** 设「同步进行中」——倒计时那时该改说「正在同步…」。 */
    setBusy(value: boolean): void;
    /** 推一次动作变化（面板的「正在同步」横幅靠它）。 */
    setActivity(next: SyncActivity): void;
    /** 每次读状态时有没有要求 `force`（面板上「刷新」按钮与兜底读不一样）。 */
    forceFlags(): boolean[];
    /** 渲染了几次 —— 拿「跑了几次 git log」当代理（每次渲染都要读一次历史）。 */
    renderCount(): number;
}

function harness(options: {
    status?: RepoStatus | undefined;
    commits?: CommitInfo[] | undefined;
    remoteUrl?: string | undefined;
    branches?: Array<{ name: string; current: boolean }>;
    /** 仓库体积；显式给 null 表示「读不到」。 */
    repoSize?: RepoSize | null;
    /** 待提交改动的字节数。 */
    pendingBytes?: number;
    /** 定时同步下一次触发的时刻（毫秒）。不传 = 没开定时同步。 */
    nextRunAt?: number;
    t?: LocaleStrings;
}): Harness {    const calls: string[] = [];
    const gitCalls: string[] = [];
    const forces: boolean[] = [];
    let refreshCount = 0;
    let listener: ((status: RepoStatus | undefined) => void) | undefined;
    // 显式写 `undefined` 与「没传」是两种意思：前者是「不是仓库 / 读不出历史」。
    let current: RepoStatus | undefined = "status" in options ? options.status : status({});
    /** 同步是否正在进行（倒计时这时改说「正在同步…」）。 */
    let busy = false;
    /** 当前动作（面板的「正在同步」横幅读它）。 */
    let activity: SyncActivity = { kind: "idle", chain: false };
    let activityListener: ((activity: SyncActivity) => void) | undefined;
    const firstCommits: CommitInfo[] | undefined = "commits" in options ? options.commits : [];

    /** `git.log` 的闸门 —— 设上之后那次渲染会停在历史那一步。 */
    let logGate: Promise<void> | undefined;
    let openLogGate: (() => void) | undefined;

    /**
     * 一次动作收尾时推一次状态。
     *
     * 与真实 `SyncService` 一致（`withActivity` 结束时 `refreshStatus()`）——
     * 视图「不再自己读状态」这件事只有在替身也这么推的时候才验得出来。
     */
    const finishAction = (): void => {
        listener?.(current);
    };

    const service = {
        // 视图只碰 deps.notifier（报错出口）—— 少了它点出错的按钮会 TypeError。
        deps: {
            notifier: {
                reportError: (err: unknown) => calls.push(`error:${String(err)}`),
                success: (message: string) => calls.push(`success:${message}`),
                warn: (message: string) => calls.push(`warn:${message}`),
            },
        },
        onStatusChange: (callback: (status: RepoStatus | undefined) => void) => {
            listener = callback;
            return () => {
                listener = undefined;
            };
        },
        /**
         * 动作推送（真实实现见 `SyncService.onActivityChange`）。
         *
         * 与 `onStatusChange` 分开是**契约的一部分**：动作横幅要在动作一开始就出现，
         * 而仓库状态要等动作收尾才刷新一次 —— 合成一条的话，同步跑几十秒期间
         * 面板上什么都不会动，正是用户报的那个问题。
         */
        onActivityChange: (callback: (activity: SyncActivity) => void) => {
            activityListener = callback;
            return () => {
                activityListener = undefined;
            };
        },
        /** 面板打开时读一次当前动作（同步可能是面板关着时开始的）。 */
        get currentActivity(): SyncActivity {
            return activity;
        },
        get isBusy(): boolean {
            return busy;
        },
        refresh: async (options?: { force?: boolean }) => {
            refreshCount += 1;
            forces.push(options?.force === true);
            calls.push(options?.force ? "refresh:force" : "refresh");
            // 关键：refresh 会同步通知订阅者，而订阅者可能会重绘 —— 视图里没有
            // 「自己那次 refresh 的回声」这个判断的话，这里就是无限递归
            // （栈溢出，面板一片空白）。
            listener?.(current);
            return current;
        },
        sync: async () => {
            calls.push("sync");
            finishAction();
        },
        commitAll: async () => {
            calls.push("commitAll");
            current = status({});
            finishAction();
        },
        pull: async () => {
            calls.push("pull");
            finishAction();
        },
        push: async () => {
            calls.push("push");
            finishAction();
        },
        abortMerge: async () => {
            calls.push("abortMerge");
            finishAction();
        },
        /** 「不再跟踪嵌套仓库」：摘索引 + 写 .gitignore（合成一步）。 */
        untrackAndIgnore: async (paths: string[]) => {
            calls.push(`untrackAndIgnore:${paths.join(",")}`);
            current = status({});
            finishAction();
            return paths.length;
        },
        checkoutBranch: async (name: string) => {
            calls.push(`checkout:${name}`);
            finishAction();
        },
        pendingChangeBytes: async () => options.pendingBytes ?? 0,
        // 差异入口：返回一份最小的可渲染结果（真正的解析在 diff.test.ts 里测）。
        fileDiff: async (path: string) => {
            calls.push(`fileDiff:${path}`);
            return {
                path,
                unstaged: {
                    path,
                    kind: "text" as const,
                    hunks: [
                        {
                            header: "@@ -1 +1 @@",
                            lines: [
                                { kind: "del" as const, text: "旧", oldLine: 1, newLine: null },
                                { kind: "add" as const, text: "新", oldLine: null, newLine: 1 },
                            ],
                        },
                    ],
                    additions: 1,
                    deletions: 1,
                    truncated: false,
                },
                staged: { path, kind: "empty" as const, hunks: [], additions: 0, deletions: 0, truncated: false },
            };
        },
        commitDiff: async (hash: string) => {
            calls.push(`commitDiff:${hash}`);
            return [
                {
                    path: "notes/a.md",
                    kind: "text" as const,
                    hunks: [
                        {
                            header: "@@ -1 +1 @@",
                            lines: [
                                { kind: "add" as const, text: "提交里的新行", oldLine: null, newLine: 1 },
                            ],
                        },
                    ],
                    additions: 1,
                    deletions: 0,
                    truncated: false,
                },
            ];
        },
    } as unknown as SyncService;

    const git = {
        listBranches: async () => {
            gitCalls.push("listBranches");
            return options.branches ?? [{ name: "main", current: true }];
        },
        getRemoteUrl: async () => {
            gitCalls.push("getRemoteUrl");
            return options.remoteUrl ?? "https://github.com/owner/repo.git";
        },
        /** 就地编辑远端地址时保存（面板不再用弹窗，见 `saveRemote`）。 */
        setRemoteUrl: async (url: string) => {
            calls.push(`setRemoteUrl:${url}`);
        },
        log: async () => {
            gitCalls.push("log");
            if (logGate) await logGate;
            return firstCommits;
        },
        repoSize: async () => {
            gitCalls.push("repoSize");
            if (options.repoSize === null) throw new Error("count-objects failed");
            return options.repoSize ?? { bytes: 12 * 1024 * 1024, objects: 1234 };
        },
    } as unknown as SimpleGitManager;

    const view = new SourceControlView(null as unknown as WorkspaceLeaf, {
        service,
        git,
        getT: () => options.t ?? zhCN,
        onInitRepo: () => calls.push("initRepo"),
        onOpenFileOnRemote: (path) => calls.push(`fileOnRemote:${path}`),
        onOpenCommitOnRemote: (hash) => calls.push(`commitOnRemote:${hash}`),
        /** 差异现在是**主工作区的标签页**（2026-10-04 从弹窗改过来），这里只记下请求。 */
        openDiff: (request: { kind: string; target: string; label?: string }) =>
            calls.push(
                `diff:${request.kind}:${request.target}${
                    request.label ? `:${request.label}` : ""
                }`
            ),
        /**
         * 定时同步下一次触发的时刻（工具栏倒计时读它）。
         *
         * 默认 `undefined` —— 没开定时同步、或刚触发过，那时工具栏上不该有徽标。
         */
        nextRunAt: () => options.nextRunAt,
    });
    createdViews.push(view);

    return {
        view,
        calls,
        gitCalls,
        refreshCount: () => refreshCount,
        setBusy: (value: boolean) => {
            busy = value;
        },
        setActivity: (next: SyncActivity) => {
            activity = next;
            activityListener?.(next);
        },
        forceFlags: () => [...forces],
        renderCount: () => gitCalls.filter((call) => call === "log").length,
        emit: (next) => {
            current = next;
            listener?.(next);
        },
        publish: async (next) => {
            current = next;
            listener?.(next);
            await settle();
        },
        holdLog: () => {
            logGate = new Promise<void>((resolve) => {
                openLogGate = resolve;
            });
        },
        releaseLog: () => {
            const release = openLogGate;
            logGate = undefined;
            openLogGate = undefined;
            release?.();
        },
        open: async () => {
            await view.onOpen();
            await settle();
        },
        settle,
        turn,
    };
}

/** 让 `void this.render()` 这类不 await 的调用跑完。 */
async function flush(): Promise<void> {
    await turn();
}

/** 只让出一轮宏任务。 */
function turn(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 等几轮宏任务。
 *
 * 首屏之后的重绘要经过**两层**宏任务（`onLayoutReady` 回调 → 合并窗定时器），
 * 所以一次 `flush()` 不够 —— 而「等几轮」比在视图里开一个只为测试存在的
 * `idle()` 接口更诚实：它验的正是「重绘确实会在若干轮之后自己长出来」。
 */
async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) await turn();
}

/** 一眼看出「这一行是哪一行」：行里的路径文字。 */
function rowPath(setting: Setting): string | undefined {
    const children = (setting.nameEl as unknown as { children?: Array<{ text?: string; cls?: string }> })
        .children;
    return children
        ?.find((child) => (child.cls ?? "").split(" ").includes("obsync-change-path"))
        ?.text;
}

function settingsNamed(name: string): Setting[] {
    return createdSettings.filter((setting) => setting.name === name);
}

/** 渲染出来的所有 Setting，按名字找那一个（找不到直接报出全部名字）。 */
function findSetting(name: string): Setting {
    const found = settingsNamed(name);
    expect(found.length, `没有找到名为「${name}」的设置项`).toBeGreaterThan(0);
    return found[found.length - 1]!;
}

/**
 * 顶部工具条（唯一带 `obsync-actions` 的那个 Setting）。
 *
 * 取**最后**一个而不是第一个：2026-10-01 起首屏会先画一条工具条（推迟真正的
 * 渲染，见 `renderShell`），于是 `createdSettings` 里会同时留下首屏那条与
 * 内容渲染那条 —— 断言要看的是**当前**这一条（与 `findSetting` 同一个约定）。
 */
function findToolbar(): Setting {
    const found = createdSettings.filter((setting) =>
        setting.classes.includes("obsync-actions")
    );
    expect(found.length, "没有找到工具条").toBeGreaterThan(0);
    return found[found.length - 1]!;
}

/** 某个下拉框上的 `aria-label`（工具条里没有可见标签，标签挂在这里）。 */
function ariaLabel(dropdown: DropdownComponent): string | undefined {
    const selectEl = dropdown.selectEl as unknown as { attrs?: Record<string, string> };
    return selectEl.attrs?.["aria-label"];
}

/**
 * 一个控件在界面上的「样子」—— 用来断言工具条**从左到右**的顺序。
 *
 * 按钮看文字（图标按钮没有文字，退化成图标名），下拉框看当前值。混在一起排成
 * 一条，才能验「分支下拉夹在推送和立即同步之间」这种排布。
 *
 * 参数类型从 `Setting["controls"]` 取，而不是手写那串联合 —— 替身新增控件
 * （滑块、多行文本框）时这里不用改，也不会因为「回调签名比数组元素类型窄」
 * 而报错。
 */
function controlLabel(control: Setting["controls"][number]): string {
    if (control instanceof DropdownComponent) return `<select:${control.value}>`;
    if (control instanceof ButtonComponent) return control.text || `<icon:${control.icon}>`;
    return "<other>";
}

/** 一个 Setting 挂在哪个容器里、那个容器带什么类（验「两栏并排」要用）。 */
function containerClass(setting: Setting): string {
    const container = setting.containerEl as unknown as { cls?: string };
    return container.cls ?? "";
}

/** 在节点树里按条件收集节点（裸 DOM 那几处断言用）。 */
function findAllIn(nodes: ShimNode[], match: (node: ShimNode) => boolean): ShimNode[] {
    const found: ShimNode[] = [];
    for (const node of nodes) {
        if (match(node)) found.push(node);
        found.push(...findAllIn(node.children ?? [], match));
    }
    return found;
}

/** 视图内容区的节点树 —— 只有「不是 Setting 的那几处」才需要走它。 */
function contentOf(view: SourceControlView): ShimNode {
    return view.contentEl as unknown as ShimNode;
}

/**
 * DOM shim 的节点形状（见 `tests/setup.ts`）。
 *
 * 提交行是**裸 DOM**（不是 `Setting`），它的交互只能靠 `trigger("click")` 驱动 ——
 * 所以这里要把 shim 记下的 `attrs` / `children` / `listeners` 都写进类型里。
 */
type ShimNode = {
    cls?: string;
    text?: string;
    attrs?: Record<string, string>;
    children?: ShimNode[];
    trigger?: (name: string, ...args: unknown[]) => void;
};

beforeEach(() => {
    resetCreatedSettings();
    resetOpenedModals();
});

/**
 * 这一条用例里建过的视图。
 *
 * 2026-10-01 起重绘会**排进定时器**（合并 + 推迟到布局就绪之后，见类注释），
 * 于是「点一下按钮就结束」的用例会留下一个还没醒的定时器 —— 它会在**下一条
 * 用例**里醒来，往共享的 `createdSettings` 里画上一条用例的行。症状很有迷惑性：
 * 断言里冒出不属于本用例的文件名，而按钮看起来「点了没反应」
 * （其实点的是上一条用例的行，回调推进的是上一条用例的 `calls`）。
 *
 * 所以每条用例结束时都要**真的关掉**视图（真实里 Obsidian 也会关）：
 * `onClose` 会立起关闭标记，排在定时器里的那次重绘就此作废。
 */
const createdViews: SourceControlView[] = [];

afterEach(async () => {
    for (const view of createdViews.splice(0)) await view.onClose();
});

describe("SourceControlView 渲染", () => {
    it("不是仓库时给出「初始化仓库」的出路（原来只有一句提示）", async () => {
        const h = harness({ status: undefined });

        await h.open();

        const init = createdSettings
            .flatMap((setting) => setting.buttons)
            .find((button) => button.text === zhCN.sync.actInit);
        expect(init).toBeDefined();
        init!.click();
        expect(h.calls).toContain("initRepo");
    });

    it("不是仓库时工具条还在（刷新能用），但**没有**分支下拉", async () => {
        // 没有状态就没有分支 —— 那一格必须空着，而不是显示一个编出来的分支名。
        const h = harness({ status: undefined });

        await h.open();

        const toolbar = findToolbar();
        expect(toolbar.dropdowns).toHaveLength(0);
        // 刷新仍然在（这是面板唯一的「重新读一次状态」入口），而且排在
        // 立即同步**前面**（2026-10-04 用户要求；没有分支时它就是第一个按钮）。
        // 它自 2026-10-04 起是**文字按钮**（与前面三个一样），所以按文字找。
        const refresh = toolbar.buttons.find((button) => button.text === zhCN.sync.actRefresh);
        expect(refresh).toBeDefined();
        expect(toolbar.buttons.indexOf(refresh!)).toBeLessThan(
            toolbar.buttons.findIndex((button) => button.text === zhCN.sync.actSync)
        );
    });

    it("标题用的是面板名，不是带 SyncHub 前缀的命令名", async () => {
        const h = harness({});

        await h.open();

        expect(h.view.getDisplayText()).toBe(zhCN.sync.viewTitle);
        expect(zhCN.sync.viewTitle).not.toMatch(/^SyncHub/);
        expect(zhCN.sync.cmdOpenView).toMatch(/^SyncHub/);
    });

    it("面板内**不再**重复一个标题（标签页上已经写着视图名了）", async () => {
        // 2026-09-19 用户要求删掉它 —— 侧边栏里一行标题就是一行浪费。
        const h = harness({});
        await h.open();

        expect(settingsNamed(zhCN.sync.viewTitle)).toHaveLength(0);
        // 视图名本身还在（`getDisplayText` 就是标签页的标题）
        expect(h.view.getDisplayText()).toBe(zhCN.sync.viewTitle);
    });

    it("工具条**一行**，顺序是 分支 / 提交 / 拉取 / 推送 / 刷新 / 立即同步", async () => {
        // 用户的要求：标题右边的刷新按钮、四个动作、下一行的分支下拉合并成一行。
        // 「一行」在实现上就是**同一个 Setting** —— 它们都落在它的 controlEl 里。
        // 顺序由用户定过两次：2026-09-19 是「分步动作在左、立即同步在右、刷新最右」，
        // 2026-10-04 改成「分支移到三个按钮前面、刷新移到立即同步前面」，
        // 同一天刷新又从图标按钮改成了**文字按钮**（与前面三个同样的形态）。
        const h = harness({});
        await h.open();

        const toolbar = findToolbar();

        // 用 `controls`（调用顺序 = 真实 DOM 里从左到右）而不是只看 `buttons` ——
        // 分支下拉夹在中间，只看按钮列表是验不出它在哪一格。
        expect(toolbar.controls.map(controlLabel)).toEqual([
            "<select:main>",
            zhCN.sync.actCommit,
            zhCN.sync.actPull,
            zhCN.sync.actPush,
            // 刷新自 2026-10-04 起是**文字按钮**（原来是图标按钮 `refresh-cw`）
            zhCN.sync.actRefresh,
            zhCN.sync.actSync,
        ]);
        // 窄面板里换行交给 CSS（这个类就是干这个的）
        expect(toolbar.classes).toContain("obsync-actions");
    });

    it("「立即同步」带一个只属于它的类 —— 靠 auto 外边距顶到右侧", async () => {
        // 顺序对了不等于位置对了：面板够宽时它要贴着右边，靠的是这个类
        // （`.obsync-action-sync { margin-left: auto }`）。
        const h = harness({});
        await h.open();

        const sync = findToolbar().buttons.find(
            (button) => button.text === zhCN.sync.actSync
        )!;
        expect(sync.buttonEl.hasClass("obsync-action-sync")).toBe(true);
        // 其余按钮不该有这个类（否则右边会多出好几段空隙）
        const others = findToolbar().buttons.filter(
            (button) => button.text !== zhCN.sync.actSync
        );
        expect(
            others.every((button) => !button.buttonEl.hasClass("obsync-action-sync"))
        ).toBe(true);
    });

    it("「提交」按钮的文案就是两个字（不是「提交全部」）", async () => {
        // 用户明确要求改短 —— 四个按钮要挤一行。
        expect(zhCN.sync.actCommit).toBe("提交");
        expect(en.sync.actCommit).toBe("Commit");
    });

    it("三个动作按钮的悬停提示说清了「提交」与「推送」的区别", async () => {
        // 用户的提问原话：「推送按钮是单纯的推送还是提交全部加推送，
        // 如果是后者应该写清楚」—— 按钮上只有两个字，答案必须由界面给出。
        const h = harness({});
        await h.open();

        const tooltips = createdSettings.flatMap((setting) =>
            setting.buttons.map((button) => button.tooltip)
        );

        expect(tooltips).toContain(zhCN.sync.actSyncHint);
        expect(tooltips).toContain(zhCN.sync.actCommitHint);
        expect(tooltips).toContain(zhCN.sync.actPushHint);
        // 推送那条必须点明它只送「已提交」的内容（否则这句提示等于没说）
        expect(zhCN.sync.actPushHint).toContain("已提交");
        // 「立即同步」要说清它是一条链，而不只是「同步」两个字
        expect(zhCN.sync.actSyncHint).toContain("提交");
        expect(zhCN.sync.actSyncHint).toContain("推送");
    });

    it("分支下拉框走服务切分支（不再直接调 git.checkout）", async () => {
        const h = harness({
            branches: [
                { name: "main", current: true },
                { name: "dev", current: false },
            ],
        });

        await h.open();

        const dropdown = findToolbar().dropdowns[0]!;
        expect(dropdown.options.map((option) => option.value)).toEqual(["main", "dev"]);
        expect(dropdown.value).toBe("main");
        // 「分支」两个字没地方写了，标签挂在 aria-label 上（读屏仍然知道它是什么）
        expect(ariaLabel(dropdown)).toBe(zhCN.sync.branchLabel);

        dropdown.select("dev");
        expect(h.calls).toContain("checkout:dev");
    });

    it("游离 HEAD：下拉框写着「游离 HEAD」且不可选（没有分支可切）", async () => {
        // 这一格是这条信息唯一的落点 —— 藏起来的话用户只会觉得「少了点什么」。
        const h = harness({ status: status({ branch: null }) });

        await h.open();

        const dropdown = findToolbar().dropdowns[0]!;
        expect(dropdown.disabled).toBe(true);
        expect(dropdown.options).toEqual([
            { value: "", label: zhCN.sync.detachedHeadLabel },
        ]);
    });

    it("列不出分支时给的是置灰的当前分支，不是可切的下拉框", async () => {
        // 可切的下拉框里只有它自己 —— 那是个假象（选了不会有任何事发生）。
        const h = harness({ branches: [] });

        await h.open();

        const dropdown = findToolbar().dropdowns[0]!;
        expect(dropdown.disabled).toBe(true);
        expect(dropdown.options).toEqual([{ value: "main", label: "main" }]);
    });

    it("仓库体积与待提交改动的体积都在，且**并排两栏**", async () => {
        const h = harness({
            status: status({ unstaged: [change("a.md", "modified")] }),
            repoSize: { bytes: 12 * 1024 * 1024, objects: 1234 },
            pendingBytes: 1024 * 1024,
        });

        await h.open();

        const size = findSetting(zhCN.sync.repoSizeLabel);
        const pending = findSetting(zhCN.sync.pendingChangesLabel);

        // 两句话本身没变（它们回答的是两个不同的问题，见 repoSize.ts）
        expect(size.desc).toBe(zhCN.sync.repoSizeDesc("12 MB", 1234));
        expect(pending.desc).toBe(zhCN.sync.pendingChangesDesc("1 MB", 1));

        // 「两栏」在实现上就是**挂在同一个容器里**，而那个容器是横向 flex。
        // 谁要是把它们各自塞回 contentEl，这条立刻失败。
        expect(size.containerEl).toBe(pending.containerEl);
        expect(containerClass(size)).toContain("obsync-metrics");
    });

    it("**读不到仓库体积时说「读不到」，不编一个 0 B**", async () => {
        // 0 B 会被当成「空仓库」—— 那是个错误的结论，比「读不到」糟得多。
        const h = harness({ repoSize: null });

        await h.open();

        expect(findSetting(zhCN.sync.repoSizeLabel).desc).toBe(zhCN.sync.sizeUnknown);
    });

    it("没有未提交改动时，「待提交改动」写的是「没有需要提交的更改」", async () => {
        const h = harness({ status: status({}) });

        await h.open();

        expect(findSetting(zhCN.sync.pendingChangesLabel).desc).toBe(
            zhCN.sync.nothingToCommit
        );
    });

    /**
     * 「与远端一致」那一行现在在**「更改」标签页里**（2026-10-04 用户要求把状态摘要与
     * 体积/待提交那栏并进那一页），所以按类名**递归**找，而不是只看 `contentEl` 的直接子节点。
     */
    function remoteStateLine(view: SourceControlView): ShimNode | undefined {
        return findAllIn(
            contentOf(view).children ?? [],
            (child) => (child.cls ?? "").includes("obsync-remote-state") === true
        )[0];
    }

    it("与远端完全一致时，状态摘要那一行高亮（与状态栏的 ✓ 同一判据）", async () => {
        const h = harness({ status: status({ ahead: 0, behind: 0 }) });

        await h.open();

        const line = remoteStateLine(h.view);

        expect(line?.cls).toContain("obsync-remote-synced");
        expect(line?.text).toBe(zhCN.sync.inSyncWithRemote);
    });

    it("领先 / 落后远端时不高亮", async () => {
        for (const partial of [{ ahead: 1, behind: 0 }, { ahead: 0, behind: 2 }]) {
            const h = harness({ status: status(partial) });
            await h.open();

            const line = remoteStateLine(h.view);

            expect(line?.cls, JSON.stringify(partial)).not.toContain("obsync-remote-synced");
        }
    });

    it("按暂存状态分组，但**每行不再有暂存开关**（2026-10-10 去掉）", async () => {
        const h = harness({
            status: status({
                staged: [change("已暂存.md", "added")],
                unstaged: [change("未暂存.md", "modified")],
                untracked: [change("新文件.md", "untracked")],
            }),
        });

        await h.open();

        // 两组的标题带各自的条数 —— **分组保留**：冲突文件在 git status 里
        // 同时进 staged 与 unstaged，去重后落在「已暂存」那一组，所以这一组不是空的。
        expect(settingsNamed(zhCN.sync.sectionStaged(1))).toHaveLength(1);
        expect(settingsNamed(zhCN.sync.sectionChanges(2))).toHaveLength(1);

        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-change-row")
        );
        expect(rows.map(rowPath)).toEqual(["已暂存.md", "未暂存.md", "新文件.md"]);

        // 每行只剩两个按钮：差异 / 在远端打开。
        // 「暂存开关」被去掉了 —— 它做不到看起来在做的事（`doCommitAll` 无条件
        // `git add -A`，手动暂存影响不了提交内容，自动同步还会把这份选择抹掉）。
        for (const row of rows) {
            expect(row.buttons.map((button) => button.icon)).toEqual([
                "file-diff",
                "external-link",
            ]);
        }
    });

    /**
     * 「嵌套仓库」行（2026-10-04）。
     *
     * 用户的原话：「为什么更改里的三项都是文件夹地址，而没有具体改动却被算进了更改里」。
     * 那三项是他在库里就地开发的插件目录（自带 `.git`），库把它们记成了**指针**
     * （gitlink，模式 160000）。这种行有三个反直觉之处，面板必须当场说清：
     * 暂存不掉、没有文件级差异、以及怎么让它别再挂着。
     */
    it("嵌套仓库行：带徽标与解释，且只给「不再跟踪」这一个动作", async () => {
        const h = harness({
            status: status({
                unstaged: [change("plugins/demo", "modified")],
                nestedRepos: ["plugins/demo"],
            }),
        });

        await h.open();

        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-change-row")
        );
        expect(rows.map(rowPath)).toEqual(["plugins/demo"]);

        // 徽标：告诉用户这是什么
        const badge = findAllIn(
            ((rows[0]!.nameEl as unknown) as ShimNode).children ?? [],
            (child) => child.cls?.includes("obsync-nested-badge") === true
        );
        expect(badge[0]?.text).toBe(zhCN.sync.nestedRepoBadge);

        // 只留一个按钮：`git diff` 对 gitlink 输出为空、`git add` 也暂存不下任何东西，
        // 留着它们就是「点了没反应」。真正能了结这件事的只有「不再跟踪」。
        expect(rows[0]!.buttons.map((button) => button.icon)).toEqual(["unlink"]);
        expect(rows[0]!.buttons[0]!.tooltip).toBe(zhCN.sync.nestedRepoUntrack);

        // 列表上方那句解释（用户当初正是缺这一句）
        const hint = findAllIn(
            contentOf(h.view).children ?? [],
            (child) => child.cls === "obsync-nested-hint"
        );
        expect(hint[0]?.text).toBe(zhCN.sync.nestedRepoHint);
    });

    it("点「不再跟踪」→ 摘索引 + 写忽略规则，并把结果说出来", async () => {
        const h = harness({
            status: status({
                unstaged: [change("plugins/demo", "modified")],
                nestedRepos: ["plugins/demo"],
            }),
        });

        await h.open();

        const row = createdSettings
            .filter((setting) => setting.classes.includes("obsync-change-row"))
            .find((setting) => rowPath(setting) === "plugins/demo")!;
        await row.buttons[0]!.click();

        expect(h.calls).toContain("untrackAndIgnore:plugins/demo");
        expect(h.calls).toContain(`success:${zhCN.sync.nestedRepoUntracked}`);
    });

    it("普通文件行不受影响：没有徽标，还是那两个按钮", async () => {
        const h = harness({
            status: status({
                unstaged: [change("notes/a.md", "modified")],
                nestedRepos: ["plugins/demo"],
            }),
        });

        await h.open();

        const row = createdSettings.find((setting) =>
            setting.classes.includes("obsync-change-row")
        )!;
        expect(row.buttons.map((button) => button.icon)).toEqual([
            "file-diff",
            "external-link",
        ]);
        expect(
            findAllIn(
                ((row.nameEl as unknown) as ShimNode).children ?? [],
                (child) => child.cls?.includes("obsync-nested-badge") === true
            )
        ).toHaveLength(0);
    });

    /**
     * 工具栏上的倒计时（2026-10-04，用户要求「也应该在仓库同步标签页下提示倒计时」）。
     *
     * 与设置页那一行**同一份数据**（`Automatics.nextRunAt()`）、同一套写法
     * （`formatCountdown`）—— 两处显示不一致的话用户一眼就会看到。
     */
    describe("下次同步倒计时", () => {
        /**
         * 徽标元素。
         *
         * 它自 2026-10-04 起在**「更改」页的状态摘要那一行**（用户要求：「将下次同步胶囊
         * 下移到『与远端一致』同一行展示」），不再是工具栏上的。找**当前** DOM 树里的
         * 那一个：`createdSettings` 是累计的，读旧节点会得到一个永远不动的倒计时。
         */
        function countdownBadge(): ShimNode | undefined {
            const view = createdViews[createdViews.length - 1]!;
            return findAllIn(
                (view.contentEl as unknown as ShimNode).children ?? [],
                (child) => child.cls?.includes("obsync-countdown") === true
            )[0];
        }

        it("开了定时同步 → 状态摘要那一行显示倒计时，每秒自己走", async () => {
            // 只假造 Date 与 setInterval：`settle()` 之类靠的是真 setTimeout，
            // 一起假造的话首次渲染永远跑不完（等不到那几个宏任务）。
            vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
            try {
                vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
                const h = harness({ nextRunAt: Date.now() + 3 * 60_000 });

                await h.open();
                await h.settle();

                expect(countdownBadge()?.text).toBe(zhCN.settings.sync.countdown("3:00"));

                await vi.advanceTimersByTimeAsync(1000);
                expect(countdownBadge()?.text).toBe(zhCN.settings.sync.countdown("2:59"));

                // 同步进行中改说「正在同步…」（与设置页一致）—— 这时「还剩 0:00」是错的
                h.setBusy(true);
                await vi.advanceTimersByTimeAsync(1000);
                expect(countdownBadge()?.text).toBe(zhCN.settings.sync.countdownRunning);

                await h.view.onClose();
            } finally {
                vi.useRealTimers();
            }
        });

        it("没开定时同步（nextRunAt 为 undefined）→ 连元素都不创建", async () => {
            const h = harness({});

            await h.open();
            await h.settle();

            expect(countdownBadge()).toBeUndefined();
        });

        it("关掉面板后不再刷新（表要停，不能守着脱离文档的节点）", async () => {
            vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
            try {
                vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
                const h = harness({ nextRunAt: Date.now() + 60_000 });

                await h.open();
                await h.settle();
                expect(countdownBadge()?.text).toBe(zhCN.settings.sync.countdown("1:00"));

                await h.view.onClose();
                // 关掉之后表必须已经停了：再推时间不该有任何东西在跑
                await vi.advanceTimersByTimeAsync(5000);
                expect(vi.getTimerCount()).toBe(0);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    /**
     * 同步进行中的特效（2026-10-05）。
     *
     * 用户的原话：「点击立即同步时，只有左下角状态栏中才显示正在提交，不够显眼，
     * 状态栏提交时的提示文字优化一下，侧边栏同步时也要添加同步特效，不然用户
     * 不知道是否正在同步」。
     *
     * 面板这一侧要保证四件事：
     * 1. 动作**一来**横幅就出现（不等任何 git 跑完）—— 它是「有没有在同步」的答案；
     * 2.「立即同步」把那三个阶段列出来，亮的是当前那一步（真实可得的进度，
     *    而不是编一个百分比）；
     * 3. 动作进行中四个动作按钮禁用（再点一次只是往队列里多排一个任务），
     *    但刷新照旧可用（它只读）；
     * 4. 结束之后横幅清空、按钮恢复 —— 不留一个「还在同步」的错觉。
     */
    describe("同步进行中的特效", () => {
        /** 工具条下面那条横幅。 */
        function banner(h: Harness): ShimNode | undefined {
            return findAllIn(
                contentOf(h.view).children ?? [],
                (node) => (node.cls ?? "").split(/\s+/).includes("obsync-sync-banner")
            )[0];
        }

        /** 节点树上的全部文字（横幅是裸 DOM，没有 Setting 可查）。 */
        function allText(node: ShimNode): string {
            return [node.text ?? "", ...(node.children ?? []).map(allText)]
                .filter((text) => text !== "")
                .join(" ");
        }

        /** 横幅上**写了什么**；空横幅返回空串。 */
        function bannerText(h: Harness): string {
            const node = banner(h);
            return node ? allText(node) : "";
        }

        /** 工具条上按文字找按钮（找不到直接报出来）。 */
        function actionButton(text: string): ButtonComponent {
            const found = findToolbar().buttons.find((button) => button.text === text);
            expect(found, `工具条上没有「${text}」按钮`).toBeDefined();
            return found!;
        }

        it("没有动作时横幅是空的（CSS 的 :empty 把它整块收起来）", async () => {
            const h = harness({});
            await h.open();

            expect(bannerText(h)).toBe("");
        });

        it("动作一来横幅立刻出现，且**不多跑一次 git**", async () => {
            const h = harness({});
            await h.open();
            const gitCallsBefore = h.gitCalls.length;

            h.setActivity({ kind: "committing", chain: true });

            // 横幅是纯 DOM：出现它不该触发重绘（一次重绘 = 10 个 git 子进程，很贵）
            expect(h.gitCalls.length).toBe(gitCallsBefore);
            expect(bannerText(h)).toContain(zhCN.sync.statusSyncing);
        });

        it("「立即同步」列出三个阶段，亮的是当前那一步", async () => {
            const h = harness({});
            await h.open();

            h.setActivity({ kind: "pulling", chain: true });

            const steps = findAllIn(banner(h)?.children ?? [], (node) =>
                (node.cls ?? "").split(/\s+/).includes("obsync-sync-step")
            );
            expect(steps.map((step) => step.text)).toEqual([
                zhCN.sync.actCommit,
                zhCN.sync.actPull,
                zhCN.sync.actPush,
            ]);

            const active = steps.filter((step) =>
                (step.cls ?? "").split(/\s+/).includes("is-active")
            );
            expect(active).toHaveLength(1);
            expect(active[0]!.text).toBe(zhCN.sync.actPull);
        });

        it("单独的动作不画三个阶段（它本来就不是一条链）", async () => {
            const h = harness({});
            await h.open();

            h.setActivity({ kind: "pushing", chain: false });

            expect(bannerText(h)).toContain(zhCN.sync.statusPushing);
            const stepGroups = findAllIn(banner(h)?.children ?? [], (node) =>
                (node.cls ?? "").split(/\s+/).includes("obsync-sync-steps")
            );
            expect(stepGroups).toHaveLength(0);
        });

        it("动作进行中禁用四个动作按钮，但刷新照旧可用", async () => {
            const h = harness({});
            await h.open();

            h.setActivity({ kind: "committing", chain: true });

            for (const text of [
                zhCN.sync.actCommit,
                zhCN.sync.actPull,
                zhCN.sync.actPush,
                zhCN.sync.actSync,
            ]) {
                expect(actionButton(text).disabled, text).toBe(true);
            }
            // 刷新只读：同步途中想看一眼状态是合理需求
            expect(actionButton(zhCN.sync.actRefresh).disabled).toBe(false);
        });

        it("动作结束之后横幅清空、按钮恢复", async () => {
            const h = harness({});
            await h.open();

            h.setActivity({ kind: "pushing", chain: true });
            expect(bannerText(h)).not.toBe("");

            h.setActivity({ kind: "idle", chain: false });

            expect(bannerText(h)).toBe("");
            expect(findToolbar().buttons.every((button) => !button.disabled)).toBe(true);
        });

        it("面板打开时同步已经在跑 → 一打开就有横幅（不等下一次变化）", async () => {
            const h = harness({});
            // 动作发生在面板打开**之前**（命令面板触发的同步就是这种时序）
            h.setActivity({ kind: "pushing", chain: true });

            await h.open();

            expect(bannerText(h)).toContain(zhCN.sync.statusSyncing);
        });
    });

    /**
     * 「更改 / 最近提交」标签组（2026-10-04，用户要求：「各种列表可以以标签组切换的
     * 方式展示，可以避免冗长列表下需要频繁滚动」）。
     *
     * 此前两者上下排在同一条滚动列里：改动一多，想看历史就得先把改动滚过去。
     * 现在各占一屏，而**冲突区留在标签之外**（它是「现在就得处理」的状态，
     * 藏进标签页意味着用户可能看不到）。
     */
    describe("标签组", () => {
        /** 标签栏里的按钮（按显示顺序）。 */
        function tabButtons(): ShimNode[] {
            const bar = findAllIn(
                contentOf(h_view()).children ?? [],
                (child) => child.cls?.split(" ").includes("obsync-tabs") === true
            )[0];
            return (bar?.children ?? []).filter(
                (child) => child.cls?.split(" ").includes("obsync-tab") === true
            );
        }

        /** 两个内容面板（changes 在前、history 在后）。 */
        function tabPanels(): ShimNode[] {
            return findAllIn(
                contentOf(h_view()).children ?? [],
                (child) => child.cls?.includes("obsync-view-tabpanel") === true
            );
        }

        /** 当前用例的视图（`harness()` 建的最近一个）。 */
        function h_view(): SourceControlView {
            return createdViews[createdViews.length - 1]!;
        }

        it("默认停在「更改」，两个面板都渲染但只有一个可见", async () => {
            const h = harness({
                status: status({ unstaged: [change("a.md", "modified")] }),
                commits: [],
            });

            await h.open();

            const buttons = tabButtons();
            expect(buttons.map((button) => button.text)).toEqual([
                zhCN.sync.sectionChanges(1),
                zhCN.sync.sectionHistory,
            ]);
            expect(buttons[0]!.cls).toContain("is-active");

            const panels = tabPanels();
            expect(panels).toHaveLength(2);
            expect(panels[0]!.cls).toContain("is-active");
            expect(panels[1]!.cls).not.toContain("is-active");

            // 两个面板都渲染（历史照旧每轮读一次 git log）—— 隐藏的那个只是不占高度
            expect(h.renderCount()).toBeGreaterThan(0);
        });

        it("点「最近提交」→ 只换可见性，**不重绘**（不白跑那几条 git 命令）", async () => {
            const h = harness({
                status: status({ unstaged: [change("a.md", "modified")] }),
                commits: [],
            });

            await h.open();
            const before = h.renderCount();

            tabButtons()[1]!.trigger!("click");

            const panels = tabPanels();
            expect(panels[0]!.cls).not.toContain("is-active");
            expect(panels[1]!.cls).toContain("is-active");
            expect(tabButtons()[1]!.cls).toContain("is-active");
            // 切标签不走渲染：git log 的次数不变
            expect(h.renderCount()).toBe(before);
        });

        it("切到的标签**跨重绘保持**（状态推送不会把用户踢回「更改」）", async () => {
            const h = harness({
                status: status({ unstaged: [change("a.md", "modified")] }),
                commits: [],
            });

            await h.open();
            tabButtons()[1]!.trigger!("click");

            // 一次状态推送 → 重绘
            await h.publish(status({ unstaged: [change("a.md", "modified")] }));

            expect(tabButtons()[1]!.cls).toContain("is-active");
            expect(tabPanels()[1]!.cls).toContain("is-active");
        });

        it("冲突区**不在标签里**（再长也一直看得见）", async () => {
            const h = harness({
                status: status({ conflicted: ["a.md", "b.md"] }),
                commits: [],
            });

            await h.open();

            // 冲突那一行是直接挂在 contentEl 上的（不是某个标签面板的子节点）——
            // 藏进标签页意味着用户可能看不到它，而那是「现在就得处理」的状态。
            const conflicts = createdSettings.find(
                (setting) => setting.name === zhCN.sync.sectionConflicts(2)
            );
            expect(conflicts, "冲突区应该渲染出来").toBeDefined();

            const panels = tabPanels();
            expect(panels.length).toBeGreaterThan(0);
            for (const panel of panels) {
                expect(
                    (conflicts!.containerEl as unknown) === panel,
                    "冲突区不能挂在标签面板里"
                ).toBe(false);
            }
        });
    });

    /**
     * 更改列表的**格式筛选**（2026-10-04 用户要求）。
     *
     * 原话：「我希望更改列表提供修改文件的格式筛选，尤其是 md 格式的文件，因为笔记同步
     * 主要还是同步的 md 文档」。选项由**这次改动里真实出现的格式**生成 —— 固定清单会给出
     * 一堆筛出空结果的入口。
     */
    describe("格式筛选", () => {
        function filterRow(): Setting {
            return findSetting(zhCN.sync.filterLabel);
        }

        /**
         * 当前这一轮渲染出来的更改行。
         *
         * `createdSettings` 是**累计**的（替身不会清空），重绘之后直接按类名取会把上一轮的
         * 行也捞进来。所以按「行挂在哪个容器里」过滤 —— 只认**当前** DOM 树里那些
         * `.obsync-change-list`。
         */
        function changeRowPaths(): string[] {
            const live = findAllIn(
                contentOf(h_view()).children ?? [],
                (child) => child.cls?.includes("obsync-change-list") === true
            );
            return createdSettings
                .filter((setting) => setting.classes.includes("obsync-change-row"))
                .filter((setting) => live.includes(setting.containerEl as unknown as ShimNode))
                .map((setting) => rowPath(setting))
                .filter((path): path is string => path !== undefined);
        }

        /** 最近一次渲染的视图（本文件里 `harness()` 建的最近一个）。 */
        function h_view(): SourceControlView {
            return createdViews[createdViews.length - 1]!;
        }

        it("选项只有真实出现的格式，默认「全部」", async () => {
            const h = harness({
                status: status({
                    unstaged: [
                        change("笔记.md", "modified"),
                        change("图.png", "added"),
                        change("图2.png", "added"),
                        change("data.json", "modified"),
                    ],
                }),
            });

            await h.open();

            const dropdown = filterRow().dropdowns[0]!;
            expect(dropdown.options.map((option) => option.label)).toEqual([
                zhCN.sync.filterAll(4),
                zhCN.sync.filterMarkdown(1),
                ".png (2)",
                ".json (1)",
            ]);
            expect(dropdown.value).toBe("all");
            expect(changeRowPaths()).toHaveLength(4);
        });

        it("选 Markdown 只剩笔记（这就是主要诉求）", async () => {
            const h = harness({
                status: status({
                    unstaged: [change("笔记.md", "modified"), change("图.png", "added")],
                }),
            });

            await h.open();

            // 筛选要重绘才生效（分组是重新分出来的），所以点完等一轮
            filterRow().dropdowns[0]!.select("md");
            await h.settle();

            expect(changeRowPaths()).toEqual(["笔记.md"]);
        });

        it("选某个扩展名只剩那个格式，且筛选**跨重绘保持**", async () => {
            const h = harness({
                status: status({
                    unstaged: [change("笔记.md", "modified"), change("图.png", "added")],
                }),
            });

            await h.open();
            filterRow().dropdowns[0]!.select("png");
            await h.settle();
            expect(changeRowPaths()).toEqual(["图.png"]);

            // 状态推送来一次重绘 —— 用户刚筛好的视图不该被清掉
            await h.publish(
                status({ unstaged: [change("笔记.md", "modified"), change("图.png", "added")] })
            );

            expect(filterRow().dropdowns[0]!.value).toBe("png");
            expect(changeRowPaths()).toEqual(["图.png"]);
        });

        it("筛的那个格式这一轮没有了 → 自动回落到「全部」", async () => {
            const h = harness({
                status: status({
                    unstaged: [change("笔记.md", "modified"), change("图.png", "added")],
                }),
            });

            await h.open();
            filterRow().dropdowns[0]!.select("md");
            await h.settle();
            expect(changeRowPaths()).toEqual(["笔记.md"]);

            // 笔记提交掉了，这一轮只剩图片 —— 下拉里不再有 Markdown 选项，
            // 筛选必须跟着回落，否则会停在一个不存在的选项上（列表一片空白）
            await h.publish(status({ unstaged: [change("图.png", "added")] }));

            expect(filterRow().dropdowns[0]!.value).toBe("all");
            expect(changeRowPaths()).toEqual(["图.png"]);
        });

        it("「待提交改动」那一栏始终是**总数**（筛选只影响列表）", async () => {
            const h = harness({
                status: status({
                    unstaged: [change("笔记.md", "modified"), change("图.png", "added")],
                }),
            });

            await h.open();
            filterRow().dropdowns[0]!.select("md");
            await h.settle();

            const pending = createdSettings.find(
                (setting) => setting.name === zhCN.sync.pendingChangesLabel
            );
            expect(pending?.desc).toContain("2");
        });
    });

    it("「最近提交」标签页里不再重复一个同名标题", async () => {
        const h = harness({ status: status({}), commits: [] });

        await h.open();

        // 标签上已经写着「最近提交」，页内再来一行同名标题纯属多余（2026-10-04 用户要求）
        const headings = createdSettings.filter(
            (setting) =>
                setting.name === zhCN.sync.sectionHistory && setting.classes.includes("obsync-section")
        );
        expect(headings).toHaveLength(0);
    });

    /**
     * 状态摘要那一行的**文案**（2026-10-04 用户指出）。
     *
     * 原话：「『与远端一致』在有新更改的时候，只是颜色不同，显示的文本依旧是『与远端一致』，
     * 文案描述并不准确」—— `ahead = behind = 0` 只说明**已提交的部分**对齐了，
     * 工作区可能还躺着一堆没提交的改动。
     */
    describe("状态摘要文案", () => {
        it("干净且对齐 → 「与远端一致」（并标绿）", async () => {
            const h = harness({ status: status({ ahead: 0, behind: 0 }) });
            await h.open();

            expect(remoteStateLine(h.view)?.text).toBe(zhCN.sync.inSyncWithRemote);
            expect(remoteStateLine(h.view)?.cls).toContain("obsync-remote-synced");
        });

        it("对齐但**有未提交的改动** → 文案说清，而且不标绿", async () => {
            const h = harness({
                status: status({ ahead: 0, behind: 0, unstaged: [change("a.md", "modified")] }),
            });
            await h.open();

            // 「与远端一致」会让人以为可以关电脑了 —— 这句才是准的
            expect(remoteStateLine(h.view)?.text).toBe(zhCN.sync.inSyncWithPendingChanges);
            expect(remoteStateLine(h.view)?.cls).not.toContain("obsync-remote-synced");
        });

        it("领先 / 落后时照旧说领先落后（不去管工作区）", async () => {
            const h = harness({
                status: status({ ahead: 2, behind: 0, unstaged: [change("a.md", "modified")] }),
            });
            await h.open();

            expect(remoteStateLine(h.view)?.text).toBe(zhCN.sync.aheadOf(2));
        });
    });

    it("每一行都能在远端打开对应文件", async () => {
        const h = harness({ status: status({ unstaged: [change("a.md", "modified")] }) });

        await h.open();

        const row = createdSettings.find((setting) =>
            setting.classes.includes("obsync-change-row")
        )!;
        row.buttons[1]!.click();
        expect(h.calls).toContain("fileOnRemote:a.md");
    });

    /**
     * 「查看差异」的完整链路：点下去 → 弹出差异弹窗 → 内容真的渲染出来。
     *
     * 只断言「弹窗打开了」是不够的：入口按钮最常见的坏法是「弹是弹了，里面
     * 什么都没有」（`load()` 接错了方法、或者结果没被渲染）。所以这里一直验到
     * 弹窗里的增删行。
     */
    it("点「查看差异」→ 请求开一个差异**标签页**（不再是弹窗）", async () => {
        const h = harness({ status: status({ unstaged: [change("a.md", "modified")] }) });

        await h.open();
        const row = createdSettings.find((setting) =>
            setting.classes.includes("obsync-change-row")
        )!;
        row.buttons[0]!.click();

        // 面板只交「看什么」，真开标签的是主类（它才拿得到 `WorkspaceLeaf`）——
        // 差异的渲染本身在 diffView.test.ts 里测。
        expect(h.calls).toContain("diff:file:a.md");
        // 不再有弹窗（2026-10-04 用户要求：「模态框太小了」）
        expect(openedModals).toHaveLength(0);
    });

    it("冲突行给「差异」与「在远端打开」，不给任何改变状态的动作", async () => {
        const h = harness({
            status: status({ conflicted: ["notes/会打架.md"] }),
        });

        await h.open();

        const heading = findSetting(zhCN.sync.sectionConflicts(1));
        expect(heading.buttons[0]!.text).toBe(zhCN.sync.actAbortMerge);
        heading.buttons[0]!.click();
        expect(h.calls).toContain("abortMerge");

        const conflictRow = createdSettings.find((setting) =>
            setting.classes.includes("obsync-conflict")
        )!;
        expect(rowPath(conflictRow)).toBe("notes/会打架.md");
        // 两个按钮：差异 + 在远端打开。**没有**暂存开关 —— 冲突文件要等用户在编辑器里
        // 把 <<<<<<< 处理掉，面板看不到内容，所以不给这个入口；但差异是只读的，
        // 而且冲突时恰恰最需要看清内容。
        // （2026-10-10 起这一点对**所有**行都成立：逐文件暂存已整体去掉，见上面那条用例。）
        expect(conflictRow.buttons.map((button) => button.icon)).toEqual([
            "file-diff",
            "external-link",
        ]);
    });

    it("干净仓库只提示无事可做，不给暂存分组", async () => {
        const h = harness({ status: status({}) });

        await h.open();

        // 「没有需要提交的更改。」现在只出现在「待提交改动」那一栏（2026-10-04 起
        // 体积/待提交两栏并进了「更改」页，于是不必再来一句独立的空状态文案）。
        const pending = createdSettings.find(
            (setting) => setting.name === zhCN.sync.pendingChangesLabel
        );
        expect(pending?.desc).toBe(zhCN.sync.nothingToCommit);
        expect(
            createdSettings.filter((setting) => setting.classes.includes("obsync-change-row"))
        ).toHaveLength(0);
    });

    it("历史列表点 hash 交给主类在远端打开提交", async () => {
        const commit: CommitInfo = {
            hash: "0123456789abcdef",
            shortHash: "0123456",
            message: "同步：1 个文件\n\n正文不该显示",
            author: "Sofqi",
            date: new Date(2026, 8, 19, 8, 5).toISOString(),
        };
        const h = harness({ commits: [commit] });

        await h.open();

        // 历史现在在「最近提交」标签面板里（2026-10-04 起列表分标签组），
        // 所以按类名**递归**找，而不是只看 contentEl 的直接子节点。
        const list = findAllIn(
            contentOf(h.view).children ?? [],
            (child) => (child.cls ?? "").split(" ").includes("obsync-history")
        )[0];
        expect(list).toBeDefined();

        const row = (list!.children as Array<{ children: Array<{ text?: string; attrs?: Record<string, string> }> }>)[0]!;
        const texts = row.children.map((child) => child.text);
        // 提交信息只取第一行 —— 面板里塞不下正文
        expect(texts).toContain("同步：1 个文件");
        expect(texts.join(" ")).not.toContain("正文不该显示");
    });

    it("读不出提交历史时给出说明而不是空白", async () => {
        const h = harness({ commits: undefined });

        await h.open();

        const text = JSON.stringify(h.view.contentEl);
        expect(text).toContain(zhCN.sync.historyFailed);
    });

    /**
     * 提交行的「看差异」入口。
     *
     * 提交行是裸 DOM（不是 `Setting`），所以这里走的是替身的 `trigger("click")`
     * —— 没有它，这个入口「点了有没有反应」在测试里根本看不出来。
     */
    it("历史里每条提交都能看它引入了什么改动", async () => {
        const commit: CommitInfo = {
            hash: "0123456789abcdef",
            shortHash: "0123456",
            message: "同步：1 个文件",
            author: "Sofqi",
            date: new Date(2026, 8, 19, 8, 5).toISOString(),
        };
        const h = harness({ commits: [commit] });

        await h.open();

        const list = findAllIn(
            contentOf(h.view).children ?? [],
            (child) => (child.cls ?? "").split(" ").includes("obsync-history")
        )[0];
        const row = (list!.children as Array<{ children: Array<ShimNode> }>)[0]!;
        const head = row.children[0]!;
        const diff = head.children![1] as unknown as ShimNode;

        expect(diff.attrs?.["data-icon"]).toBe("file-diff");
        expect(diff.attrs?.title).toBe(zhCN.sync.actDiffCommit);

        diff.trigger!("click");
        await flush();

        // 标签页的标题要能认出是哪一条：短 hash + 信息第一行（只有 hash 认不出来）
        expect(h.calls).toContain(`diff:commit:${commit.hash}:0123456  同步：1 个文件`);
        expect(openedModals).toHaveLength(0);
    });
});

describe("SourceControlView 的状态订阅", () => {
    it("渲染时不会因为 refresh 通知订阅者而无限递归（自己那次 refresh 的回声不算新变化）", async () => {
        const h = harness({});

        await h.open();

        // 只读一次：重绘里再 refresh 一次就会又通知一次 …
        expect(h.refreshCount()).toBe(1);
    });

    it("状态在背后变化时面板跟着重绘，且**不再吃第二次 git status**", async () => {
        const h = harness({});
        await h.open();
        expect(h.refreshCount()).toBe(1);
        expect(
            createdSettings.filter((setting) => setting.classes.includes("obsync-change-row"))
        ).toHaveLength(0);

        // 服务在视图背后刷新了状态（自动提交定时器到点、库外编辑器改了文件…）
        await h.publish(status({ unstaged: [change("外面改的.md", "modified")] }));

        // 画的是 service 推过来的那一份状态 —— 自己再 `refresh()` 一次只会拿到
        // 同一个结果，而库大时那次 `git status` 就是 300 ms（见 SyncService）。
        expect(h.refreshCount()).toBe(1);
        const rows = createdSettings.filter((setting) =>
            setting.classes.includes("obsync-change-row")
        );
        expect(rows.map(rowPath)).toEqual(["外面改的.md"]);
    });

    it("关闭视图后退订，之后的状态变化不再重绘", async () => {
        const h = harness({});
        await h.open();

        await h.view.onClose();
        await h.publish(status({}));

        expect(h.refreshCount()).toBe(1);
    });
});

/**
 * 面板的性能约定（2026-10-01）。
 *
 * 起因是一个真机症状：**侧边栏挂着这个面板时，界面特别卡，重启 Obsidian 的
 * 「Load layout」也变长好多**。查下来是两件事叠在一起：
 *
 * 1. Obsidian 恢复布局时会 `await` 每个视图的 `onOpen()`
 *    （`deserializeLayout` → `withTimeout(leaf.setViewState(…), 10s)` →
 *    `View.open()` → `await this.onOpen()`），而原来的 `onOpen()` 里同步等着
 *    一整套 git 操作（实测一次渲染 754 ms / 10 个 git 子进程，其中 `git status`
 *    300 ms）—— 这笔钱直接记在启动的「Load layout」上；
 * 2. 每次状态推送都触发一次整块重绘，而重绘里又会自己再读一次状态
 *    （同一次变化读两遍 `git status`）。
 *
 * 所以这里的用例盯的是**「跑了几次 git」**，而不是画得好不好看 —— 好看与否
 * 上面的用例已经覆盖了。
 */
describe("SourceControlView 的性能约定", () => {
    /**
     * 从第 `from` 个 Setting 起算的文件行（取最后一批 —— 面板每次重绘都会重建，
     * 而 `createdSettings` 是只增不减的流水账）。
     */
    function fileRows(from = 0): string[] {
        return createdSettings
            .slice(from)
            .filter((setting) => setting.classes.includes("obsync-change-row"))
            .map(rowPath)
            .filter((path): path is string => path !== undefined);
    }

    it("onOpen 一次 git 都不跑（Obsidian 的「Load layout」await 的就是它）", async () => {
        const h = harness({});

        await h.view.onOpen();

        // 这一行是整条修复的核心：布局恢复时 Obsidian 就卡在这个 await 上，
        // 而它后面的 10 个 git 子进程全都会记进「Load layout」的耗时里。
        expect(h.refreshCount()).toBe(0);
        expect(h.gitCalls).toEqual([]);
        // 首屏也不是一片空白：工具条 + 一句「正在读取」，用户看得出它在干活
        expect(JSON.stringify(h.view.contentEl)).toContain(zhCN.sync.loadingRepo);

        await h.settle();

        // 内容随后自己长出来（排到布局就绪之后那次渲染）
        expect(h.refreshCount()).toBe(1);
        // 面板顶部不再有远端地址那一行（配置归设置页，2026-10-04），所以 `getRemoteUrl`
        // 也不在这几条里了 —— 这条断言顺带钉住「渲染不再多问一次远端」
        expect(h.gitCalls).toEqual(["listBranches", "repoSize", "log"]);
    });

    it("一次动作之后不再自己读状态，而且只重绘一次", async () => {
        const h = harness({ status: status({ unstaged: [change("a.md", "modified")] }) });
        await h.open();
        expect(h.refreshCount()).toBe(1);
        const renders = h.renderCount();

        // 点「提交」—— 真实的 service 收尾会推一次新状态（`withActivity`）
        const commit = findToolbar().buttons.find((button) => button.text === zhCN.sync.actCommit)!;
        commit.click();
        await h.settle();

        // 用的就是推过来的那一份，没有再跑一次 `git status`（库大时 300 ms）
        expect(h.refreshCount()).toBe(1);
        // 而且只重绘一次：动作期间那次推送与动作结束那次请求被合并了
        expect(h.renderCount()).toBe(renders + 1);
    });

    it("工具条上的「刷新」是**强制**真读一次（不吃 service 那 400 ms 的复用窗）", async () => {
        const h = harness({});
        await h.open();
        expect(h.refreshCount()).toBe(1);
        const renders = h.renderCount();

        const toolbar = findToolbar();
        // 按文字找而不是按位置/图标：这条工具条的顺序与形态被用户改过两次
        // （现在是 分支 / 提交 / 拉取 / 推送 / 刷新 / 立即同步，刷新是文字按钮）
        const refresh = toolbar.buttons.find((button) => button.text === zhCN.sync.actRefresh)!;
        expect(refresh).toBeDefined();

        refresh.click();
        await h.settle();

        expect(h.refreshCount()).toBe(2);
        // 首次（兜底）读用的是普通读，手动刷新要求 force —— 用户点它的意思
        // 就是「现在读一次」，拿 400 ms 前的结论回答等于这个按钮时灵时不灵。
        expect(h.forceFlags()).toEqual([false, true]);
        expect(h.renderCount()).toBe(renders + 1);
    });

    it("渲染期间到来的新状态**不会被丢掉**（本轮结束后补跑一次）", async () => {
        const h = harness({});
        await h.open();

        // 让下一次渲染卡在读提交历史那一步
        h.holdLog();
        h.emit(status({ unstaged: [change("先到.md", "modified")] }));
        await h.turn(); // 这次渲染已经开始，正停在 git log 上
        // 从这一刻起的 Setting 都属于「补跑的那次渲染」
        const mark = createdSettings.length;
        // 渲染进行中，状态又变了
        h.emit(status({ unstaged: [change("后到.md", "modified")] }));
        h.releaseLog();
        await h.settle();

        // 面板显示的是**最后**那个状态。原来的 `rendering` 守卫会把这次更新
        // 直接 return 掉，面板就永远停在「先到.md」上。
        expect(fileRows(mark)).toEqual(["后到.md"]);
    });
});

