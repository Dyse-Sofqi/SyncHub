/**
 * Git 同步的领域类型。
 *
 * 刻意不让 simple-git 的类型泄漏到本模块之外：
 * 上层（syncService / UI / 状态栏）只知道这里的形状，
 * 将来若换实现（比如支持其他 git 后端）不用动上层。
 */

import type { LargePendingFile } from "./largeFiles";

/** 同步策略三态，对应 obsidian-git 的三种 pull 行为。 */
export type SyncStrategy = "merge" | "rebase" | "reset";

/** 单个文件的变更状态。 */
export type FileChangeStatus =
    | "added"
    | "modified"
    | "deleted"
    | "renamed"
    | "conflicted"
    | "untracked";

export interface FileChange {
    path: string;
    status: FileChangeStatus;
    /** 重命名时的新路径。 */
    previousPath?: string;
}

/** 仓库当前状态快照，状态栏与仓库同步视图共用。 */
export interface RepoStatus {
    /** 当前分支名。游离 HEAD 时为 null。 */
    branch: string | null;
    staged: FileChange[];
    unstaged: FileChange[];
    /** 未跟踪文件单独列出 —— 提交前要不要带上它是个显式决策。 */
    untracked: FileChange[];
    /**
     * 上面这些更改里，**索引记的是嵌套仓库**（gitlink，模式 `160000`）的那些路径。
     *
     * 用户在库的插件/主题目录里就地开发时，那些目录各自带 `.git`，库就把它们记成了
     * 一个「指针」。这种行的三个反直觉之处（暂存不掉、没有文件级差异、永远挂在
     * 「更改」里）面板要能解释，也要能一键了结 —— 见 `SimpleGitManager.nestedRepoPaths`。
     *
     * 缺省（`undefined`）表示「没查过」或者「一个都没有」。
     */
    nestedRepos?: string[];
    /** 双方都改了的文件（未解决的冲突）。 */
    conflicted: string[];
    /** 本地领先远端的提交数。没有 upstream 时为 null。 */
    ahead: number | null;
    /** 落后远端的提交数。没有 upstream 时为 null。 */
    behind: number | null;
}

/**
 * 仓库对象库的体积（`git count-objects -v`）。
 *
 * `bytes` 是松散对象 + pack 的总和（KiB 换算而来）—— 这是仓库占用的绝大部分，
 * 也是「推送要传多少」最接近的参考。对象数一起给出来，是因为同样大小的两个库
 * 「12 MB / 30 个对象」和「12 MB / 12 万个对象」给人的判断完全不同。
 */
export interface RepoSize {
    bytes: number;
    objects: number;
}

/** 提交历史条目。 */
export interface CommitInfo {
    hash: string;
    /** hash 的短形式（7 位），用于展示。 */
    shortHash: string;
    message: string;
    author: string;
    /** ISO 8601 时间戳。 */
    date: string;
}

/** 一次 pull / push 的结果。 */
export interface SyncOutcome {
    /** 实际发生了什么，UI 据此给用户反馈。 */
    kind:
        | "committed"
        | "pulled"
        | "pushed"
        | "nothing-to-commit"
        | "up-to-date"
        | "fast-forwarded"
        /** 拉取产生冲突，现场已保留并写好指南 —— 链路必须在这里停住。 */
        | "conflict"
        /**
         * 有超过阈值的待提交文件，**已拦下等你决定** —— 链路必须在这里停住。
         *
         * 与 `conflict` 同构：都是「不能替你决定、也不能假装成功」的状态。
         * 继续提交会把大文件写进历史（git 历史不可逆），而继续拉取/推送没有意义 ——
         * 用户看到「同步完成」却发现那个文件没上去，比直接告诉他更糟。
         *
         * 调用方（面板 / 命令 / 自动同步）据此弹窗或给提示；确认后带
         * `allowLargeFiles: true` 重跑。
         */
        | "large-files-pending";
    /** 拉取/推送影响的提交数。 */
    commits?: number;
    /** 拉取时更新的文件数。 */
    files?: number;
    /** `large-files-pending` 时被拦下的文件（按大小降序）。 */
    largeFiles?: LargePendingFile[];
}

// ── 诊断 ────────────────────────────────────────────────────────────────────

/**
 * 一项诊断检查。
 *
 * `id` 是**类型码**而不是文案 —— 与错误处理同一套约定：逻辑层产出结构化结果，
 * 展示层按 id 取 locale 文案。这样诊断逻辑不依赖 i18n，也能被单独测试。
 */
export interface DiagnosticCheck {
    id:
        /** git 可执行文件是否可用。 */
        | "git"
        /** 当前库是否已是 git 仓库。 */
        | "repo"
        /** 是否配置了远端。 */
        | "remote"
        /** 远端平台是否可识别（决定能不能注入令牌）。 */
        | "platform"
        /** 能否访问远端 —— **鉴权是否有效就看这一条**。 */
        | "access";
    status: "ok" | "failed" | "skipped";
    /** 可选的补充说明（技术细节，非本地化文案）。 */
    detail?: string;
}

export interface DiagnosticsReport {
    checks: DiagnosticCheck[];
    /** 全部通过（跳过不算失败）。 */
    ok: boolean;
}
