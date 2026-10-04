import type { LocaleStrings } from "../../core/i18n";
import type { Notifier } from "../../core/notice";
import { redactUrl } from "../../host/redact";
import { classifyRemoteUrl } from "./remoteUrl";

/**
 * 远端地址输入框的行为（**面板与设置页共用**，2026-10-04）。
 *
 * 远端地址的**设置**归设置页「仓库同步」里「连接测试」之前那一行（用户要求：
 * 「远端地址应该在仓库同步的设置页中设置才对」；面板顶部那一份随之删除）。
 * 命令面板里的「编辑远端地址」弹窗仍在，走同一个 `classifyRemoteUrl` 判定。
 *
 * 规则集中在这里而不是写进某个界面：脱敏回显、失焦/回车才保存、写错拦住并恢复原样、
 * 成功后强制刷新 —— 分叉的表现是「同一个地址在一处存下去了、在另一处没有」，
 * 极难排查。
 */
export interface RemoteEditorHost {
    /** 当前真实地址（**未**脱敏）；未配置时为 `undefined`。 */
    currentUrl: string | undefined;
    /** 保存（`SimpleGitManager.setRemoteUrl`）。 */
    setRemoteUrl(url: string): Promise<void>;
    /** 保存成功后刷新状态（领先/落后要按新远端重算，见调用处的 `force`）。 */
    refresh(): Promise<void>;
    notify: Notifier;
    t: LocaleStrings;
    /** 收尾时的额外动作（视图要重绘一次；设置页不需要）。 */
    onSaved?: () => void;
}

/**
 * 给一个输入框装上「就地编辑远端地址」的行为。
 *
 * **保存时机是失焦 / 回车**，不是 `onChange` —— 后者是**每敲一个字**都回调，
 * 那会一次次去写 `.git/config` 并重算鉴权。
 */
export function bindRemoteInput(input: HTMLInputElement, host: RemoteEditorHost): void {
    /**
     * 已经生效的地址。
     *
     * 不在每次保存时去问 `host.currentUrl()`：那个值在**异步保存完成之前**还是旧的，
     * 而「回车顺带失焦」会让保存入口进两次（见下）—— 用它做判断会把同一次编辑
     * 存两遍。保存成功后这里跟着更新。
     */
    let current = host.currentUrl;
    const shown = (): string => (current ? redactUrl(current) : "");
    /** 一次保存还没跑完时，忽略又一次触发（回车 + 失焦是同一件事）。 */
    let saving = false;

    // 回显**脱敏**后的地址：它可能带着令牌，而这一行会显示在屏幕上。
    // 要改就整段替换 —— 这也是输入框的用法。
    input.value = shown();

    const save = (): void => {
        if (saving) return;
        const { t, notify } = host;
        const typed = input.value.trim();

        // 没改（框里那份就是回显的那份）→ 什么都不做
        if (typed === shown()) return;

        const hint = classifyRemoteUrl(typed);
        // 明显写错的输入**拦住并把框恢复原样**：留着它用户会以为存下去了，
        // 而那个值只会在下一次同步时才发作。
        if (hint === "invalid") {
            notify.warn(t.sync.editRemoteHint.invalid);
            input.value = shown();
            return;
        }

        saving = true;
        void (async () => {
            try {
                if (typed) await host.setRemoteUrl(typed);
                current = typed || undefined;
                // 提示与输入框都会显示在屏幕上 —— 用户完全可能填一个带令牌的地址
                input.value = shown();
                notify.success(t.sync.editRemoteSaved(redactUrl(typed) || "—"));
                // 带凭据 / 平台认不出：照弹窗的规矩**放行但提示**（选择权留给用户）
                if (hint !== "ok") notify.warn(t.sync.editRemoteHint[hint]);
                await host.refresh();
            } catch (err) {
                notify.reportError(err);
                input.value = shown();
            } finally {
                saving = false;
            }
            host.onSaved?.();
        })();
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        // 设置页的输入框里回车不该触发别的东西
        event.preventDefault();
        save();
        // 顺手收掉焦点。真机上 `blur()` 会再触发一次 `save` —— 两次是安全的：
        // 上面那次已经把 `saving` 立起来，而替身里 `blur()` 是空实现。
        if (typeof input.blur === "function") input.blur();
    });
}
