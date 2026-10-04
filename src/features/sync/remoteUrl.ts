import { containsCredentials } from "../../host/redact";
import { tryParseRepoRef } from "../../host/repoRef";

/**
 * 远端地址的**校验**（判定与渲染分开）。
 *
 * ## 为什么单独一个模块（2026-10-04 从 `EditRemoteModal` 里搬出来）
 *
 * 判定原本长在那个弹窗里，只有一个消费方。现在远端地址改成**面板里就地可改的输入框**
 * （用户要求：「不必设置一个编辑远端的按钮……省了一步打开模态框」），判定就有了两个
 * 需要它的地方（输入框失焦时的校验，将来若还有别的入口也一样）—— 而它是一串
 * **顺序敏感**的判断，复制一份迟早会分叉。弹窗本身随之删掉。
 *
 * ## 顺序是刻意的
 *
 * 1. **空** → 无提示。「清空远端」是合法操作（用户想暂时断开同步），不是错误。
 * 2. **不像 git 远端** → 拦住。排在凭据之前是因为：这时地址根本不是地址，
 *    再多说一句「里面有令牌」只是噪音。
 * 3. **带凭据** → 警告。**必须在「认得出平台」之前** ——
 *    `https://oauth2:TOKEN@gitee.com/o/r.git` 是能被平台识别的，
 *    排在后面就永远轮不到它，用户会毫无提示地把令牌写进 `.git/config`。
 * 4. **平台认不出** → 放行但提示（鉴权注入与「在远端打开」用不了）。
 * 5. 其余 → 放行。
 *
 * 3 与 4 同时成立时（带令牌的 GitLab 地址）只报 3：安全提示比能力说明更该被看见，
 * 而且用户按 3 改完之后刷新即会看到 4。
 *
 * ## 校验为什么是宽松的
 *
 * 同步本身是**纯 git 操作**（`git fetch/pull/push`），任何 git 能用的远端都该允许 ——
 * 自建 GitLab、内网 git 服务器、本地裸仓库、`file://` 路径都能同步。
 *
 * 早先这里用 `tryParseRepoRef` 做校验，等于**只接受 GitHub / Gitee**，
 * 结果是「一个完全可用的 git 远端被拒绝」，而提示语只说"无法识别该仓库地址"，
 * 用户根本不知道原因。现在改成：
 * - 明显写错的输入（带空格的句子等）→ 拦住
 * - 非 GitHub / Gitee 的合法远端 → 放行，但**提示**平台相关能力用不了
 *   （鉴权注入与「在远端打开」依赖平台识别）
 * - 带凭据的地址 → 放行，但**警告**（见上面的顺序说明）
 * - 留空 → 放行，这是合法操作（用户想暂时断开同步）
 */
export type RemoteUrlHint = "ok" | "invalid" | "credentials" | "notGithubOrGitee";

/** 该给用户看哪条提示。 */
export function classifyRemoteUrl(url: string): RemoteUrlHint {
    const trimmed = url.trim();
    if (!trimmed) return "ok";
    if (!looksLikeGitRemote(trimmed)) return "invalid";
    if (containsCredentials(trimmed)) return "credentials";
    if (!tryParseRepoRef(trimmed)) return "notGithubOrGitee";
    return "ok";
}

/**
 * 粗略判断「这看起来像一个 git 远端地址」。
 *
 * 刻意宽松 —— 这里不是要判断"能不能用"（那只有 git 自己知道），
 * 只是拦住明显写错的输入（比如把一句中文或带空格的话粘进来）。
 */
function looksLikeGitRemote(url: string): boolean {
    if (/\s/.test(url)) return false;
    return (
        // 带 scheme：https:// / http:// / ssh:// / git:// / file://
        /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ||
        // scp 形式：git@host:path
        /^[^@/\s]+@[^:/\s]+:.+$/.test(url) ||
        // Windows 绝对路径
        /^[A-Za-z]:[\\/]/.test(url) ||
        // POSIX 绝对路径 / 相对路径
        url.startsWith("/") ||
        url.startsWith("./") ||
        url.startsWith("../")
    );
}
