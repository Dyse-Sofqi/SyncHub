import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { LocaleStrings } from "../../core/i18n";
import { logger } from "../../core/logger";
import type { Notifier } from "../../core/notice";
import type { ObsyncSettings } from "../../core/settings";
import type { SecretStore } from "../../core/secretStore";
import { describeImageSyncError } from "./errors";
import { isImagePath, isInsideFolders, normalizeFolders } from "./imageScan";
import { ImageSyncService } from "./imageSyncService";
import type { DeleteImagesResult, RemoteObject, SyncSummary } from "./types";
import { ConfirmDeleteRemoteModal } from "./ui/ConfirmDeleteRemoteModal";

/**
 * 图片同步模块的装配入口（与 `features/installer/index.ts` / `features/sync/index.ts` 同构）。
 *
 * ## 与笔记同步的一个关键区别：这个模块**移动端也加载**
 *
 * 笔记同步依赖系统 git（Node 进程），所以只在桌面端装配。图片同步走的是
 * Obsidian 的 `requestUrl` + vault 的文件读写 —— 两者在移动端都有。
 * 于是「在手机上看笔记时图片能显示、裁剪压缩也能用」这件事是成立的，
 * 代价是这个模块的整条静态导入链里**不能出现任何依赖 Node 的东西**
 * （`scripts/checks.mjs` 的「移动端安全」一项守着这条）。
 *
 * ## 定时器为什么自己写一份而不是复用 `Automatics`
 *
 * `Automatics` 的接口是「提交 / 推送 / 拉取」三个 git 动作，而图片同步只有
 * 一个「跑一轮」。为了复用它去实现三个空动作，换来的是一层没人看得懂的间接。
 */

export interface ImageSyncModule {
    service: ImageSyncService;
    /** `onLayoutReady` 之后调用：起自动同步定时器 + 跑一轮启动同步。 */
    start(): void;
    /** 插件卸载。 */
    stop(): void;
    /** 设置变化后调用（开关或间隔变了要重起定时器）。 */
    reload(): void;
    /**
     * 库里有个文件被删掉了（由主类挂在 `vault.on("delete")` 上）。
     *
     * 这是「云端也删吗」这个询问的**唯一入口**：删除现在只在用户主动删本地
     * 文件时发生，而这是唯一能观察到那个动作的地方。
     */
    noteDeleted(file: TAbstractFile): void;
    /**
     * 库里有个文件被**改名**了（由主类挂在 `vault.on("rename")` 上）。
     *
     * ## 为什么必须有它（2026-10-01 用户报的重复问题）
     *
     * 这套系统的身份就是 **vault 路径**（对象键 = 前缀 + 路径，状态清单也按路径
     * 存）。没有这个入口时，改名在同步看来是「旧路径没了 + 新路径出现了」，于是
     * 下一轮会同时做两件错事：新路径当成新增**重传**一份；旧路径当成「云端有、
     * 本地没有」**下载回来** —— 库里出现两批同样的图片，而且因为两边重新对上了，
     * 它不会再自愈。
     *
     * ## 文件夹改名也走这里
     *
     * Obsidian 在文件夹改名时会为**其中每个文件**各发一次 `rename`（适配器逐个
     * 子项触发，见 `main.ts` 的说明），所以这里**不自己遍历子项** —— 那会让
     * 「文件夹改名」与「文件改名」出现两套逻辑。
     *
     * 真正干活的是 `service.renameRemoteBackup`：它记账（记录搬到新路径 + 旧路径
     * 立墓碑）、用服务端 COPY 搬云端那一份，并对「面板也调了一次」去重。
     */
    noteRenamed(file: TAbstractFile, oldPath: string): void;
    /**
     * 批量删除（图片管理面板用）。
     *
     * ## 与 `noteDeleted` 那条路的关系
     *
     * 这条路**不是**「自动删除」——它是用户在面板上明确勾选、明确点按钮之后的
     * 执行动作，与「同步时顺手把一边删掉」是两回事（后者已经被彻底去掉了，
     * 见 `imageSyncService.ts` 的文件头）。
     *
     * 云端处置在**点按钮之前**就由用户选定了（「仅删本地」/「本地云端都删」），
     * 所以这里删完之后要把路径登记进 `panelDeleted`，免得 `noteDeleted` 再问
     * 一遍同一件事。
     */
    deleteImages(paths: string[], options: { remote: boolean }): Promise<DeleteImagesResult>;
}

export interface ImageSyncModuleDeps {
    app: App;
    notifier: Notifier;
    getSettings(): ObsyncSettings;
    getT(): LocaleStrings;
    secretStore: SecretStore;
    /** 一轮跑完的通知（状态栏 / 设置页重绘）。 */
    onFinished?(summary: SyncSummary): void;
}

/** `setTimeout` 的参数是 32 位有符号整数，超时会立即触发。 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 攒多久再问「云端也删吗」。
 *
 * 一次选中十张图删掉时，Obsidian 会为每一张各发一个 `delete` 事件 ——
 * 逐个弹窗是灾难（用户要连点十次，而它们问的是同一件事）。攒一小会儿
 * 合成一个问题，列表里能看清是哪几张。
 *
 * 400ms 是「感觉不到延迟」与「攒得下连续删除」之间的取舍：Obsidian 删文件
 * 是逐个触发的，间隔通常只有几毫秒。
 */
const DELETE_PROMPT_DELAY_MS = 400;

/**
 * 自动同步的定时器。
 *
 * 与 `Automatics` 一样用「世代号」解决一个不显眼但真实的问题：`fire()` 是异步的，
 * 它跑完会重新起表；如果这期间 `stop()` 被调用过（插件卸载、设置变更触发的
 * `restart()`），那个 in-flight 的 `fire()` 回来照样起表 —— 于是 `stop()` 之后
 * 仍有定时器在跑，或者同一个动作每个周期跑两次。
 *
 * 与 `Automatics` 不同的是**不持久化「上次执行时间」**：图片同步是幂等的镜像，
 * 重启后重新计满一个间隔没有害处（不像 git 那样会把「每 5 分钟备份」拉长成
 * 「5 分钟 + 使用时长」）。少一份跨会话状态，就少一处会与真实情况不一致的地方。
 */
class ImageAutomatics {
    private timer: number | undefined;
    private generation = 0;

    constructor(
        private readonly service: ImageSyncService,
        private readonly images: () => ObsyncSettings["images"]
    ) {}

    start(): void {
        this.stop();

        const settings = this.images();
        // 总开关关掉：`stop()` 已经清了表，到此为止。
        //
        // **必须在逻辑层也读一次 `enabled`**，不能只在设置页把控件灰掉 ——
        // 库里已经存着「开着」的用户根本不会去动设置页，定时器会照跑。
        // （这是 `sync.enabled` 当年踩过的坑，见 MEMORY.md。）
        if (!settings.enabled) {
            logger.debug("image automatics disabled: no timer scheduled");
            return;
        }

        // 「按周期同步」那个开关关着 → 不起表。注意它与上面的总开关**不是一回事**：
        // 总开关管「允不允许在背后动云端」（启动那一轮、改名换键、删除处置），
        // 这个只管「要不要按周期跑」—— 所以关掉它之后，启动那一轮照旧。
        if (!settings.autoSyncEnabled) {
            logger.debug("image automatics: periodic sync is off");
            return;
        }

        // 兜底，正常到不了这里：`normalizeSettings` 把周期钳在 5–1440。但**不能**
        // 少了这一句 —— 周期若真是 0，`setTimeout(0)` 就是「立刻触发 → 重新起表」
        // 的死循环（与 `Automatics` 里那一句同一个理由）。
        if (settings.autoSyncMinutes <= 0) return;

        this.schedule(settings.autoSyncMinutes);
    }

    stop(): void {
        this.generation += 1;
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        this.timer = undefined;
    }

    restart(): void {
        this.start();
    }

    private schedule(minutes: number): void {
        const generation = this.generation;
        const delay = Math.min(minutes * 60_000, MAX_TIMEOUT_MS);
        this.timer = window.setTimeout(() => void this.fire(generation), delay);
    }

    private async fire(generation: number): Promise<void> {
        // 正在跑（比如用户手动点了一次）就放弃这一轮，等下一个整周期。
        // 排队只会让队列积起来，最后连着跑好几次。
        if (this.service.isBusy) {
            this.reschedule(generation);
            return;
        }

        try {
            await this.service.run();
        } catch (error) {
            // 自动动作的失败只进日志：弹窗会在用户没操作时突然出现，
            // 而网络抖动导致的失败下一轮自然恢复。
            logger.warn("auto image sync failed", error);
        } finally {
            this.reschedule(generation);
        }
    }

    private reschedule(generation: number): void {
        if (generation !== this.generation) return;
        const settings = this.images();
        if (settings.enabled && settings.autoSyncEnabled && settings.autoSyncMinutes > 0) {
            this.schedule(settings.autoSyncMinutes);
        }
    }
}

export function createImageSyncModule(deps: ImageSyncModuleDeps): ImageSyncModule {
    // 这一段设置由装配层读走（决定起不起定时器、启动后跑不跑一轮）。
    // 写成 `const images = …getSettings().images` 这个形状是刻意的：
    // `scripts/checks.mjs` 的「设置项无人读取」认这个形状，否则新加的这一组
    // 设置项会全部落在它的盲区里 —— 而「改了没作用的开关」正是那个检查要拦的东西。
    const images = deps.getSettings().images;

    // 本模块的错误翻译器：R2 / 同步层抛的是类型码 + 技术性描述，
    // 用户能看懂的话在这里按类型码拼。注册后所有调用点自动生效，不会漏。
    deps.notifier.registerErrorTranslator(describeImageSyncError);

    const service = new ImageSyncService({
        app: deps.app,
        notifier: deps.notifier,
        getT: deps.getT,
        getSettings: deps.getSettings,
        secretStore: deps.secretStore,
        onFinished: deps.onFinished,
    });

    const automatics = new ImageAutomatics(service, () => deps.getSettings().images);

    /**
     * 刚被删掉、还没问过用户的图片路径。
     *
     * 攒批用（见 `DELETE_PROMPT_DELAY_MS`）。用 `Set` 而不是数组：同一个路径
     * 在一次连删里被报两次时只该问一次。
     */
    const pendingDeletions = new Set<string>();
    let deletionTimer: number | undefined;

    /**
     * 图片管理面板**主动**删掉、且云端处置已经由用户选定过的路径。
     *
     * 没有它的话，面板里点「删除」会让 `noteDeleted` 再弹一次「要不要连云端
     * 一起删」—— 用户刚刚回答过这个问题（在面板上选的按钮），再问一遍是纯粹的
     * 噪音，而且第二次的答案还可能和第一次矛盾。
     *
     * 每次面板删除开始时清空：残留的标记会让**用户后来手动删同名文件**时
     * 悄悄跳过询问，而「该问不问」比「多问一次」糟得多。
     */
    const panelDeleted = new Set<string>();

    const cancelPendingDeletions = (): void => {
        if (deletionTimer !== undefined) window.clearTimeout(deletionTimer);
        deletionTimer = undefined;
        pendingDeletions.clear();
    };

    /** 把攒下的一批合成一次询问。 */
    const flushDeletions = (): void => {
        deletionTimer = undefined;
        const paths = [...pendingDeletions].sort();
        pendingDeletions.clear();
        if (paths.length === 0) return;

        new ConfirmDeleteRemoteModal(deps.app, deps.getT(), paths, async (deleteRemote) => {
            if (!deleteRemote) {
                // 墓碑**已经**记下了（在 `noteDeleted` 里，刻意早于这次询问）——
                // 这里什么都不用做，只需要告诉用户结果。见
                // `ImageSyncService.markLocalDeleted` 关于那个竞态的说明。
                deps.notifier.info(deps.getT().images.notice.remoteKept(paths.length));
                return;
            }

            let failed = 0;
            for (const path of paths) {
                if (!(await service.deleteRemoteBackup(path))) failed += 1;
            }
            // 失败的那几条各自报过错（原因各不相同，一条一句更有用），
            // 这里再给一句总数 —— 否则「配置在弹窗期间被改掉」这类没走
            // 报错分支的失败会**一声不响**，用户以为删完了。
            if (failed > 0) {
                deps.notifier.warn(deps.getT().images.notice.deleteBackupFailedMany(failed));
            } else {
                deps.notifier.success(deps.getT().images.notice.remoteDeleted(paths.length));
            }
        }).open();
    };

    return {
        service,

        start(): void {
            automatics.start();

            // 启动后跑一轮。
            //
            // 为什么不做「错过的窗口不补」那一套（`Automatics` 的做法）：
            // 图片同步是**幂等的镜像**，跑一轮的唯一后果是「把两边的差异补齐」——
            // 没有提交、没有推送、没有需要用户拍板的动作。而它的价值恰恰在
            // 启动时最大：刚在另一台设备上删过图，这台一打开就该跟上。
            //
            // 关掉总开关时不跑：那是用户明确说了「别在背后动我的图片」。
            if (images.enabled && service.isConfigured()) {
                void service
                    .run()
                    .catch((error) => logger.warn("startup image sync failed", error));
            }
        },

        stop(): void {
            automatics.stop();
            // 待问的那一批也丢掉：插件都卸载了，不该再弹窗。
            cancelPendingDeletions();
        },

        reload(): void {
            automatics.restart();
        },

        noteDeleted(file: TAbstractFile): void {
            // 文件夹也会触发这个事件，而 `isImagePath` 只看扩展名 ——
            // 一个叫 `images.png` 的**文件夹**会被它认成图片。
            if (!(file instanceof TFile)) return;

            // 面板刚删过这一个、而且云端处置已经由用户选定 —— 别再问一遍。
            // 放在最前面：面板的决定优先于所有开关（用户是明确点的按钮）。
            if (panelDeleted.delete(file.path)) return;

            if (!isImagePath(file.path)) return;

            const settings = deps.getSettings().images;
            // 总开关关掉 = 用户明确说了「别在背后动我的图片」，那就连问都别问。
            if (!settings.enabled) return;
            // 永不同步云端：不问，也不动云端（与原来的「关掉询问」一致）。
            // 注意这里**不记墓碑** —— 于是下一轮同步会把云端那一份下载回来，
            // 这正是选它的人自己选的行为（设置页的描述里写明了）。
            if (settings.deleteRemotePolicy === "never") return;
            // 边界之外的文件不归我们管 —— 与同步、删除用的是同一个边界。
            if (!isInsideFolders(file.path, normalizeFolders(settings.folders))) return;
            // 配置不全时删不掉，问了也白问。
            if (!service.isConfigured()) return;
            // 云端没有这一份就没什么可问的。这一条挡掉的是**绝大多数**删除：
            // 用户删的多半是没同步过的图（截图、临时图）。
            if (!service.hasRemoteBackup(file.path)) return;

            // 永远同步云端：不问，直接删。墓碑仍旧**先记**（理由见下一段）——
            // 异步删除完成前那一轮同步若看到「云端有、本地没有」只会想「补齐」。
            // 删除成功时 `deleteRemoteBackup` 连墓碑一起清掉；失败时墓碑留着：
            // 云端那份不动、也不会被下载回来，与弹窗里选「删」失败时同款处置。
            if (settings.deleteRemotePolicy === "always") {
                service.markLocalDeleted(file.path);
                void service.deleteRemoteBackup(file.path);
                return;
            }

            // 从本地消失的那一刻就记墓碑，**早于**问用户。
            //
            // 弹窗要等 `DELETE_PROMPT_DELAY_MS` 攒批，这几百毫秒里可能正好有一轮
            // 同步在跑 —— 那一轮看到「云端有、本地没有」只会想到「补齐」，于是把
            // 用户刚删掉的图下载回来。记完墓碑这个窗口就不存在了。
            //
            // 用户答「保留云端」时无需额外动作（墓碑已在）；答「删除云端」时由
            // `deleteRemoteBackup` 连墓碑一起清掉；没答（Esc / 关掉 Obsidian）
            // 则墓碑留着 —— 那正是最保守的一档：云端不动，也不再回来。
            service.markLocalDeleted(file.path);

            pendingDeletions.add(file.path);
            if (deletionTimer !== undefined) window.clearTimeout(deletionTimer);
            deletionTimer = window.setTimeout(flushDeletions, DELETE_PROMPT_DELAY_MS);
        },

        /**
         * 改名之后把云端那一份搬到新键（见接口上的说明）。
         *
         * 这里的检查与 `noteDeleted` 是同一套边界，顺序也一致：类型 → 扩展名 →
         * 受管范围。删掉任何一条，改名都会造出重复（正是这次要修的 bug）。
         */
        noteRenamed(file: TAbstractFile, oldPath: string): void {
            // 文件夹本身不处理 —— 它的每个子文件各自会收到一次事件。
            if (!(file instanceof TFile)) return;

            // 改完不是图片 → 交给下一轮同步（同一轮的同步会把它当新增上传/下载）。
            if (!isImagePath(file.path)) return;

            // 与同步、删除用的是同一个边界：**任一侧**在受管范围里就管。
            // 只看新路径的话，「把图片搬出受管文件夹」这一动作会被漏掉，
            // 而那种情况的后果正是「云端那份被下载回来」。
            const folders = normalizeFolders(deps.getSettings().images.folders);
            if (!isInsideFolders(file.path, folders) && !isInsideFolders(oldPath, folders)) {
                return;
            }

            // **不 await**：事件回调要立刻返回，而这一趟可能包含网络请求
            // （文件夹改名时每个文件各一次）。失败已经由 service 报出去了。
            // 总开关关掉时它只记账、不发请求（见 `renameRemoteBackup`）。
            void service.renameRemoteBackup(oldPath, file.path);
        },

        async deleteImages(
            paths: string[],
            options: { remote: boolean }
        ): Promise<DeleteImagesResult> {
            const t = deps.getT();
            const folders = normalizeFolders(deps.getSettings().images.folders);
            const errors: DeleteImagesResult["errors"] = [];
            let localDeleted = 0;
            let remoteDeleted = 0;

            // 见 `panelDeleted` 的说明：残留的标记会让「用户后来手动删同名文件」
            // 悄悄跳过询问，所以每一批开始前先清空。
            panelDeleted.clear();

            // 边界先过一遍：受管文件夹之外的路径**一个请求都不该发**。
            // 面板的列表已经按这个边界筛过，但这里是**最后一个关口** ——
            // 用户可能在面板开着的时候改了设置。
            const inScope: string[] = [];
            for (const path of paths) {
                if (isInsideFolders(path, folders)) inScope.push(path);
                else errors.push({ path, message: t.images.notice.deleteOutOfScope });
            }

            // 云端那一份的清单：**只列举一次**（不是每个路径一次）—— 五十张图
            // 就是五十次 LIST，那是几十秒的等待。
            //
            // 两个用途都要它：墓碑里要记「云端那一份长什么样」（清单里本来没有
            // 这条时，墓碑要靠它才建得起来，否则删掉的图下一轮会自己回来），
            // 以及把「云端删掉了几份」数准（DELETE 对不存在的键也算成功）。
            const remoteShapes = inScope.length > 0 ? await listRemoteShapes(service) : undefined;

            for (const path of inScope) {
                const object = remoteShapes?.get(path);
                const shape = object ? { size: object.size, etag: object.etag } : undefined;

                // ── 云端先处理，本地后删 ──
                //
                // 顺序不能反：`trashFile` 会触发 `vault.on("delete")`，而那正是
                // 「要不要连云端一起删」的询问入口。云端先删掉（清单记录一起清掉）
                // 之后 `hasRemoteBackup` 就是 false，那次询问自然不会弹。
                if (options.remote) {
                    if (await service.deleteRemoteBackup(path)) {
                        // 列举结果说云端有这一份，才算真的删掉了一份；拿不到列举
                        // 结果时退回到「请求成功就算」—— 总比一律不计数好。
                        if (!remoteShapes || object) remoteDeleted += 1;
                    } else {
                        // 云端没删掉：本地照样删（用户的意图很明确），但要留墓碑，
                        // 否则下一轮同步会把云端那一份下载回来 —— 看起来像「删除没生效」。
                        service.markLocalDeleted(path, shape);
                        errors.push({ path, message: t.images.notice.deleteBackupFailed });
                    }
                } else {
                    // 仅删本地：**必须留墓碑**，否则镜像逻辑下一轮就把它补回来。
                    service.markLocalDeleted(path, shape);
                }

                const file = deps.app.vault.getAbstractFileByPath(path);
                // 本地已经没有了（比如另一条链路刚删掉）—— 云端那一步已经做完了。
                if (!(file instanceof TFile)) continue;

                panelDeleted.add(path);
                try {
                    // 走 `fileManager.trashFile` 而不是 `vault.delete`：前者遵循用户
                    // 在「设置 → 文件与链接 → 删除文件」里选定的方式（系统回收站 /
                    // 库内 .trash / 永久删除），也是社区审核要求的入口。
                    await deps.app.fileManager.trashFile(file);
                    localDeleted += 1;
                } catch (error) {
                    // 删失败就把标记撤掉，否则这个路径在本轮里再也问不出问题来。
                    panelDeleted.delete(path);
                    errors.push({ path, message: deps.notifier.describeError(error) });
                }
            }

            return { localDeleted, remoteDeleted, errors };
        },
    };
}

/**
 * 列举一次云端对象，按路径索引。
 *
 * 拿不到时返回 `undefined`（而不是抛错）：它换来的是「墓碑记得更准」与
 * 「删除份数数得准」，两件都是锦上添花 —— 不值得让整批删除失败。
 */
async function listRemoteShapes(
    service: ImageSyncService
): Promise<Map<string, RemoteObject> | undefined> {
    if (!service.isConfigured()) return undefined;
    try {
        return (await service.listRemoteImages()).remote;
    } catch {
        return undefined;
    }
}
