# SyncHub 交接文档

> **这是接手本项目的第一份必读文件。** 配套阅读：`docs/PLAN.md`（总体规划与阶段划分）、
> `docs/reference-analysis.md`（两个参考项目的源码分析）、`.workbuddy-ai/memory/`（历次工作日志）、
> **`docs/RELEASE.md`（发版清单 —— 要发版时照着走，别重新推导步骤）**。
>
> 最后更新：2026-09-19（新增**版本管理**：跟踪列表里每个插件都能切到指定的发布版本 ——
> 选旧版本就是回退。补的是 `requestedVersion` 这个「有效果但界面上没有入口」的字段，
> 见五点七节。
> 同日追加：修掉真机上的 `missingRequiredFiles: main.js` —— 资产通道的「短路」把一次
> 本可成功的安装变成了失败（GitHub 资产冷连接 17~25 秒 + 超时阈值 20 秒），
> 并且把「资产下不下来」与「仓库里没有」分成两种错误，见第五节与第七节第 19 条。
> 同日追加：进度提示（转圈 + 逐文件文案）、下载来源（探测 + 手填 Gitee 镜像）、
> Gitee 资产 `String(undefined)` 导致的 404、镜像地址可点开；
> **删掉了与「版本管理」重合的「重装」按钮**，圆箭头图标还给「检查更新」——见五点七节）
>
> 上一轮：2026-09-17（新增主题支持：绑定 + 更新，含设置结构 v3 迁移；
> 顺带修掉一个「默认值被就地改写」的真 bug，见五点五节末尾。
> 同日追加：SyncHub 自身的检查更新与更新 —— **只写文件、不重载自己**，见五点六节）
>
> 上一轮：2026-09-16（验收复查：修掉 2 个真 bug + 补 3 处降级 + 补回一个漏做的功能，
> 详见下方「验收复查记录」）

---

## 一、项目是什么

单个 Obsidian 插件（id `ob-sync`），把两个参考项目的能力合并并扩展：

| 能力 | 复刻自 | 扩展点 |
| --- | --- | --- |
| 笔记仓库 Git 同步 | obsidian-git（~16.9k 行） | GitHub / **Gitee** 双平台 |
| 社区插件安装 | obsidian42-brat（~5k 行） | Gitee 源安装 + 中文优先 |

参考源码在 `F:\_Workspace\GitHub-Project\` 下，**只读，不要改动**。

已确认的四项决策（不要重新讨论）：

1. **仅桌面**。Git 同步只用系统 git（simple-git），不做 isomorphic-git。
2. **分阶段交付，逐段验收**。
3. 插件标识：显示名 **SyncHub**、id **`ob-sync`**（两者已统一）。
   id 的历史是 `obsync` → `ob-sync` → `ob-sync`：第一次因市场重名，第二次为与显示名统一，
   详见第十节；唯一事实来源是 `selfUpdate.ts` 的 `SELF_PLUGIN_ID`。
4. Gitee 插件发现 = 手动输入 + GitHub→Gitee 镜像自动发现。

## 二、当前进度

| 阶段 | 状态 | 提交 |
| --- | --- | --- |
| 一：脚手架 + core + host 抽象层 | ✅ 完成 | `002056d` |
| 二：插件安装器（BRAT 复刻） | ✅ 完成 | `46170ef` |
| 三：Git 同步（obsidian-git 复刻） | 🟩 代码与单测完成 | `bdd2861` |
| 主题支持（绑定 + 更新） | ✅ 完成 | 见五点五节 |
| 插件版本管理（回退到指定版本） | ✅ 完成 | 见五点七节 |
| 仓库同步视图（侧边栏详情面板） | ✅ 完成 | 见五点八节 |
| 差异视图（逐文件 / 逐提交 / 当前文件） | ✅ 完成 | 见五点八节 |
| `.gitignore` 可在设置页直接编辑 | ✅ 完成 | 见五点八节 |
| 大文件预防（推荐忽略规则 + 提交前拦截） | ✅ 完成 | 见五点十四节 |
| 清理（体检 / 回收 / 深度清理） | ✅ 完成 | 见五点十五节 |
| 图片同步（Cloudflare R2 双副本 + 笔记内裁剪压缩） | ✅ 完成 | 见五点九节 |
| 四：打磨与发布 | ⬜ 未开始 | — |

> 阶段二之后按使用反馈持续增补（均已提交）：绑定库里已有的插件（`1a73339`）、
> 可用更新常驻徽标（`e9a0729`）、插件身份改用 manifest id（`3c4e660`）、
> 检查时机调整（`c5bc825`）。
>
> 设置结构版本现在是 `SETTINGS_VERSION = 6`：v2 → v3 加了主题支持，
> v4 → v5 把图片同步的双向删除改成「删本地时问一句」，
> v5 → v6 把那一句从开关改成三态下拉。

### 验收复查记录（2026-09-16）

阶段二/三完成后做了一轮独立复查（不看实现者结论，只跑验证 + 读代码）。结论：
架构与文档质量都好，但**测试套件实际是红的**（10 个失败），且有几处"文档说做了、
实际没生效"的地方。已全部修复：

| 问题 | 性质 | 修复 |
| --- | --- | --- |
| `unstage` 的 HEAD 未出生回退**从未触发** | 真 bug：正则写的是 `could not resolve HEAD`，而 git 实际输出带引号 `could not resolve 'HEAD'` | `HEAD_UNBORN_RE` 容忍引号 |
| 9 个 git 用例超时 + 清理 EBUSY | 测试配置：本机进程创建 340ms，默认 5 秒超时不够 | `testTimeout: 30_000` + 清理带 `maxRetries` |
| release 资产下载失败直接判安装失败 | 真缺口：同一文件在源码通道可取，却因资产 CDN 抖动而整体失败 | `loadReleaseFile` 失败也回退源码 |
| GitHub raw 域名不可达时无退路 | 真缺口：国内 raw 常被阻断而 api 可达，两者可达性无关 | `readFile` 回退 contents API |
| live 测试长期飘红（Gitee 限流） | 测试质量：会训练人忽略失败 | 限流时**跳过**并提示配 `OBSYNC_GITEE_TOKEN` |
| `fileWebUrl` / `commitWebUrl` 是死代码 | 漏做的功能：PLAN 里规划的「在浏览器打开」没接上 | 新增 `remoteLinks.ts` + 2 条命令 + 文件右键菜单 |
| `registerView` 用了 `this.sync!` 且无平台守卫 | 潜在崩溃：移动端会解引用 undefined | 加守卫，仅桌面注册 |
| 文档写"整个套件 ~1.5s" | 文档失真 | 改为实测值（该文件单独 ~150s） |
| `auth.ts` 的验证边界模糊 | 文档没说清"验证到哪一步" | 明确区分已验证（config 传递 + git 发头）与未验证（Gitee 服务端接受度） |
| **22 处错误文案硬编码中文** | 真缺口：i18n 只保证 locale 之间结构一致，**管不住代码里直接写中文**。英文界面下会冒出中文错误 | 改成「类型码 + 参数」，文案集中在 locale；`Notifier` 支持功能模块注册翻译器 |
| **7 个 i18n 键写了却没接上** | 同上：`gitNotFound` / `missingManifest` / `missingMainJs` / `noReleaseFallback` / `sourceRelease` / `sourceRaw` / `installing` 全是死键 —— 正是"打算本地化但没接上"的证据 | 前 2 个接上；被取代的删掉；余下的保留待用 |
| **两处错误类型用错** | 真 bug：「没有上游分支」「游离 HEAD」都抛了 `GitNotRepoError`，提示语是「请先初始化仓库」—— 让用户去初始化一个已存在的仓库，**指错方向** | 新增 `NoUpstreamError` / `DetachedHeadError` |
| **鉴权失败被一律归为「令牌问题」** | 真缺口（与上一行同一类）：平台因**凭据用户名**不符而拒绝时，用户看到的是「请检查访问令牌是否有效」—— 去反复检查一个没问题的令牌。实测：Gitee 只接受 账号名 / `oauth2` / `gitee.com` 三种用户名，其余直接拒绝（见 `reference-analysis.md` 差异 6） | 新增 `GitCredentialUsernameRejectedError`，文案说清「令牌本身是有效的、这是插件配置错误」；`mapError` 加这条分类并排在鉴权判断**之前**（用例锁着顺序） |
| **「测试连接」报「同步配置可用」** | 过度承诺：该检查走 `ls-remote`，验不了推送路径，而 Gitee 的凭据用户名规则只在 push 路径执行。说成「配置可用」会让人以为推送也验过了 | 文案限定为「远端可读取」，并在通过时追加一句说明本次只验证了读取 |
| **资产 404 被当成「资产通道整体不可用」** | 真 bug：`pluginFiles` 里任何资产下载失败都置 `assetUnreachable = true`，于是后续文件被跳过资产通道。而 `main.js` 通常被 gitignore、源码通道取不到它 —— **一次本可成功的安装变成失败**（变异验证时失败信息正是 `missingRequiredFiles: "main.js"`）。代码注释本来就写着「传输层原因（不是文件不存在）」，是实现没做到 | 只有 `NotFoundError` 之外才算通道不可用；新增 `tests/features/pluginFiles.test.ts`（此前该文件**没有任何单测**） |
| **网络错误里的尝试次数不实** | 真 bug：`http` 的失败消息写死 `retries + 1`，而传输层失败会立刻 `break`（不重试）—— 于是日志里写着「failed after 3 attempt(s)」而实际只发了 1 次。排查网络问题时这会把人带去**找那两次不存在的重试**（实测在 live 测试输出里见过这句） | 改成数实际发出去的次数（`attemptsMade`）；新增 `tests/host/http.test.ts`（此前 `http.ts` 也**没有专门单测**） |
| **安装器的命令没有插件名前缀** | UX 缺口：同步命令叫「SyncHub：立即同步」，安装器命令却直接用了弹窗标题（「添加插件仓库」）。Obsidian 用户按插件名搜命令，没前缀就搜不到 | 新增 `cmdAddRepo` / `cmdBindExisting` / `cmdCheckUpdates` / `cmdUpdateAll` / `cmdOpenSettings`；弹窗标题保持不带前缀 |
| **Gitee 的令牌会随错误消息漏出去** | 真问题（安全）：Gitee 的鉴权只能把令牌放查询串（`?access_token=`），而 `http` 把 URL 写进了错误消息与调试日志。那条消息有两个出口 —— `Notifier` 把它**弹在屏幕上**（用户截个图就带出去），`logger.error` 把它写进控制台（而用户报 issue 时贴的正是这个）。令牌存在系统密钥库里刻意绕开 `data.json`，却从这条侧路原样漏了；`repoRef` 的报错还会把用户粘进来的 `https://oauth2:TOKEN@…` 克隆地址原样回显 | 新增 `host/redact.ts`（`redactUrl`），在 `httpRequest` 的**每个** URL 出口上脱敏（含超时、重试日志、最终错误、底层错误详情），`repoRef` 回显输入前也过一遍；新增 `tests/host/redact.test.ts`，并给 `http` / `repoRef` 补上「不泄漏」用例（含一条「脱敏不能影响实际请求」的反向守卫） |
| **既是「令牌上屏」的另两条路，也是自相矛盾的 UI** | 真问题（安全）：① `SyncService.diagnose` 的 `detail` 会**渲染在设置页上**，而它带的正是远端地址原文 —— 库的远端本来就写着带令牌的地址时（用户从前配的），令牌直接显示出来；② 「远端已设置 …」的成功提示也回显整条地址；③ 更要紧的是**设计自相矛盾**：`auth.ts` 明确论证过不能把令牌写进 remote URL（会落进 `.git/config`、`git remote -v` 一眼可见、随配置文件泄漏，实测确认），而「编辑远端地址」弹窗对这样的地址**一句提示都没有**，默默照写 | 脱敏收口到 `diagnose` 的 `add()`（报告的唯一写入点）+ `main.ts` 的回显；弹窗新增凭据警告（`classifyRemoteUrl` 抽成纯函数，判定与渲染分离，第一次有测试）；新增 `tests/features/editRemoteModal.test.ts`、扩充 `syncService.test.ts` 与 `redact.test.ts` |
| **`data.json` 里的 `pluginId` 没查内容 → 卸载会删出插件目录** | 真 bug（路径逃逸）：`tracked[].pluginId` 最终会变成**路径的一截** —— 卸载时 `resolvePluginFolder()` 找不到同名目录就回落到 `{configDir}/plugins/{pluginId}`，紧接 `rmdir(folder, true)` **递归**删（路径算术与「真的发出这个调用」见 `tests/features/itemFolder.test.ts`）。而 `sanitizeTrackedPlugins` 只检查「是不是非空字符串」：`"../../evil"` 会拼出 `.obsidian/plugins/../../evil`。`data.json` 恰恰是这个字段**唯一**不经过 `parseManifest` 的来源（可手改，也会随笔记仓库同步到别的设备） | 抽出 `core/pluginId.ts`（`PLUGIN_ID_RE` / `isValidPluginId`）作为**单一事实来源**，`manifest.ts` 与 `settings.ts` 共用；新增 `tests/core/pluginId.test.ts`，其中两条是**防漂移**——「`parseManifest` 放行的，`normalizeSettings` 一个都不能丢」及反向 |
| **更新检查比安装路径「少做了两件事」→ 永远报「已是最新」** | 真 bug：`checkOne`（检查）本应是 `resolveSource`（安装）的镜像，却有两处退化。① **不带令牌** —— 私有仓库在未鉴权时两个平台都返回 **404**（刻意不泄漏「仓库是否存在」），检查把它读成「这个仓库没有 release」；② **不回退** —— `/releases/latest` 只给正式版，「只发预发布版」的仓库返回 404，而安装路径在这一级会往下看预发布版。两处症状相同：**装得上、却永远收不到更新提示**。附带代价：不带令牌走的是**匿名配额**（Gitee 极低，项目为此专门做过节流），等于自己制造那些 403 | `checkOne` 带上 `service.tokenForHost(plugin.host)`（新增带文档的公开出口），并在 404 后对齐 `resolveSource` 的第二级（`listReleases` 取首个）；`updateChecker.test.ts` +6，含两条反向守卫（令牌不串平台、没配令牌不造鉴权头）与一条「回退只在 404 后发生」 |
| **「有哪些平台」有 4 份副本，其中 1 份决定用户数据的生死** | 真缺口（漂移风险）：`SUPPORTED_HOSTS` 声明自己是平台列表，却**没有任何调用方**；同一个事实另写了三份 —— `settings` 的 `VALID_HOSTS`（持久化校验）、`secretStore.snapshot` 的循环、设置页的两个 `renderTokenField("github"/"gitee")`。第一份的后果不是「不好看」：**漏掉某个平台时，用户在那个平台上装的插件会在下次加载 `data.json` 时被当成非法条目无声丢弃**（不报错，列表里就没了）。而 `hostRegistry` 自己的注释写着「将来加 GitLab / Bitbucket 只需要在这里注册一项」—— 那句话不成立 | 平台列表移入 `host/types.ts` 并让 `HostKind` 由它**推导**（加平台 = 改那一行），三个使用点全部改为派生；`hostRegistry` 的注释改成「加平台要动哪些地方」的完整清单；新增 `tests/host/hostRegistry.test.ts`（5 条，让四个使用点互相印证而非各列一份平台名） |
| **重复实现里躺着的那一份是错的** | 真缺口：`InstallerService.checkForUpdate` 是「有没有更新」的**第二份实现**，无任何调用方，且判据用的是 `requestedVersion` —— 跟踪最新版的插件那个值是字符串 `"latest"`，于是它几乎恒返回 release。谁把它当成现成的工具接上，谁就得到一个**恒报「有更新」**的功能。同类还有 `isManifestCompatible`（兼容性判断的第二份），它声明的存在理由「注入 `requireApiVersion` 便于测试」已被 obsidian stub 的 `__setApiVersion` 取代 | 两处删除（其余死导出清点见第七节「死代码清点」） |
| **「启用笔记同步」是个死开关** | 真 bug（UX）：`sync.enabled` 有开关、`data.json` 里存着值、README 也列着它，而 `src` 里**没有一处读它**。于是用户关掉同步之后，自动提交照样每 N 分钟把笔记**推上远端** —— 他做了 UI 提供给他的那个动作，却没有任何效果。类型和测试都抓不到：类型上 `true` 也是 `boolean`；测试里 `Automatics` 直接注入设置对象、看不见装配层那一行（实测把 `enabled: deps.getSettings().sync.enabled` 改成 `enabled: true`，全量测试**全绿**） | `sync.enabled` 注入 `Automatics`，关掉时一个定时器都不起（边界照 `installer.autoCheckOnStartup`：只管后台自动动作，不拦命令面板里的显式命令）；新增 `scripts/checks.mjs` 第 6 项「设置项无人读取」补上这个盲区 |
| **「自动提交间隔」少写了「并同步」** | 文案与实现不符：那一项到点执行的是**完整链路**「提交 → 拉取 → 推送」（与「立即同步」同一条），而界面只写「自动提交间隔」+「设为 0 表示关闭」。用户读到的意思于是变成「只提交」，会以为把「自动推送 / 自动拉取」设为 0 就能拦住网络动作 —— 拦不住。参考项目的原名是 `Auto commit-and-sync interval`，正是这三个字 + 解释 | 改成「自动提交**并同步**间隔」，说明文案写明整条链路与「即使推送/拉取间隔为 0 也会随它发生」；`Automatics` 里那条 `commit` 分支补注释，并用测试钉住「调的是 `sync()` 而不是 `commitAll()`」。（**2026-10-02 更进一步**：三个间隔合成一个「定时同步」周期，那两段防误解的文案连同两个附加间隔一起删了 —— 见第三节五「定时同步：一个周期 + 一个开关」） |
| 设置页术语混用 | 「已追**踪**插件」（标签）vs「已跟**踪**的插件」（同页标题） | 统一为「跟踪」 |
| **「更新完还报可更新」，点了还是同一个版本** | 真 bug（同一个根因的第二张脸）：记录里的 `installedVersion` 被抹成空串，而 `isNewerVersion("1.4.2", "")` 两边有一边解析不了，退化成「字符串不同即视为有更新」→ **永远报可更新**；点更新装回 1.4.2、设置页一开又被抹掉，成了循环。抹掉的来路是上一行那个「记录与磁盘对账」功能自己：它用**插件**的 manifest 解析器去读**主题**的 manifest（主题没有 `id`）→ 抛错 → 当成「没装」→ 写空 | 主题改用 `readThemeManifestVersion`（主题解析器）；并且**读不到就不动记录** —— 只有「目录真的不存在」才记成未安装（那样更新检查会给出可更新，是有用的）。另：`checkTheme`/`checkPlugin` 曾试过「本地版本未知就不报可更新」，但那会关掉「绑定来的无版本主题也能更新到有版本那份」这条既有能力，已撤回 —— 该修的是记录，不是判据。见 `tests/features/installedVersionReconcile.test.ts` |
| **插件「更新后重启又退回旧版本」，而 SyncHub 说已是最新** | 真 bug（记录与事实脱节）：`plugins/` 里除正牌目录外多了一份**同 id** 的残留备份（`md-razor-backup-2.5.16-…`）。Obsidian 按 manifest id 建索引，两个目录抢一个 id 时**加载哪个是不定的** —— 重启后它加载了备份那份 2.5.16（实测证据：MDRazor 写在自己插件目录里的镜像文件时间戳是当天 07:56，而正牌目录停在 00:49）；而 SyncHub 按正牌目录的 manifest 记着 2.6.4，于是更新检查拿 2.6.4 比远端 2.6.4，**永远报「无可用更新」**，用户被卡在旧版本且看不出原因。附带暴露两个缺口：`installedVersion` 写进 `data.json` 后再没人核对过；`resolvePluginFolder` 只按「目录名==id / 任意同 id 目录」猜，不认 Obsidian 实际加载的那份 | `resolvePluginFolderInfo()`：**优先用 `manifests[id].dir`（Obsidian 实际加载的目录）**，并报出其他同 id 的目录；新增 `reconcileInstalledVersions()` 用磁盘 manifest 校正记录（读不到记空版本 → 会给出「可更新」而不是卡死），`checkOne` 在比较前先校正；设置页打开时校正一次并提示，重复 id 在列表**上方**用警示色常驻提示。见 `tests/features/installedVersionReconcile.test.ts` |
| `autoCheckDelay` 的置灰状态不更新 | 小 bug：切换上面的开关后，下面的输入框还是灰的（`commit()` 不重绘） | 持有 `TextComponent` 引用，在开关回调里即时 `setDisabled` |
| **缺 README** | 发布件缺失（阶段四） | 新增中文优先的 `README.md` |
| **自动定时器的时间戳没按库隔离** | 真 bug：用原生 `globalThis.localStorage`（所有库共用一个存储区），于是 A 库的自动提交会影响 B 库的计时。参考项目 obsidian-git 专门写过迁移来修这个 | 改走 `app.saveLocalStorage` / `app.loadLocalStorage` |
| **`stop()` 挡不住 in-flight 的 `fire()` 重新起表** | 真 bug：`fire()` 跑完会重新起表，若期间 `stop()`/`restart()` 过，新起的会**覆盖 Map 里的记录**，先前那个再也 clear 不掉 → 同一动作每周期跑两次 | 引入世代计数器，`fire()` 回来时若世代已变则不再起表 |
| `main.ts` 的 `onload()` 无测试覆盖 | 风险：这正是「`addStatusBarItem` 挂错对象」那次真机才暴露的地方 | 新增 `pluginBoot.test.ts`（含变异验证） |
| 自动定时器无测试 | 计时类代码靠读代码很难确认对错 | 新增 `automatics.test.ts`（8 项，含两次变异验证） |
| **冲突未解决时「提交全部」会把冲突标记提交进历史** | **真 bug（数据完整性）**：冲突文件在 `git status` 里是 `UU`，**同时**算 staged 与 unstaged，所以 `dirty === 0 && conflicted.length === 0` 这个判断在有冲突时必然放行。触发路径很现实：上次冲突没处理 → 自动提交定时器到点 → `sync()` 第一步就提交了 `<<<<<<<` | `doCommitAll` 开头显式拦冲突并抛 `ConflictError` |
| **`isBusy` 的语义错了** | 真 bug：用布尔量实现，第一个任务 settle 时就置 false，而此时队列里第二个任务还在跑 —— 「忙」在真正有活干时报"空闲"。automatics 靠它决定跳过本轮，状态栏也靠它 | 改用计数器（排队中 + 执行中） |
| `sync()` 整条链路都显示「正在提交」 | 小 bug：只在开头 `setActivity` 一次，拉取与推送阶段显示的是错的状态 | 按阶段更新 |
| **视图里点按钮失败时界面毫无反应** | 真 bug：`SourceControlView.run()` 的 catch 注释写着"通知已由 service 完成"，但那只对「冲突」「没有远端」成立 —— 推送被拒、鉴权失败、git 缺失、网络问题全被**静默吞掉** | catch 里调 `notifier.reportError` |
| **冲突文件在变更列表里显示三次** | 真 bug（同一个 `UU` 根因）：同时进 staged 与 unstaged，再加单独渲染的 conflicted 行 | 抽出 `visibleChanges()` 过滤，并加测试 |
| **「编辑远端」只接受 GitHub / Gitee 地址** | 真缺口：同步是**纯 git 操作**，自建 GitLab / 内网 git / 本地裸仓库都能同步，却被"无法识别该仓库地址"拒之门外 | 改为宽松校验（只拦明显写错的输入）+ 非 GitHub/Gitee 时给**不阻断**的提示 |
| **「放弃当前合并」后毫无反馈** | 真缺口：`sync.mergeAborted` 这个键写了却从没接上。用户点了撤销类动作，库里的冲突标记消失了但界面一片安静 —— 会让人怀疑到底成没成 | `abortMerge` 成功后发提示 |
| 绑定弹窗的空状态 / 扫描中没有底部按钮 | 小缺口：只能按 Esc 或点弹窗外，与其他状态不一致 | 两个状态都渲染 footer |
| `AddRepoModal` 用笼统的「加载中…」 | 小缺口：`installer.resolving` / `installing` 两个键写了没接上，用户不知道卡在哪一步 | `busy` 改为阶段枚举，显示具体文案 |
| **跟踪列表不显示安装来源** | 小缺口：`installer.sourceRaw` 写了没接上。从源码装的插件更新检查查不到版本，用户会以为功能坏了 | 仅在 `channel === "raw"` 时显示来源（常见情况不加噪音） |
| **自动发现镜像后源地址从记录里消失了** | 真缺口：`host/owner/repo` 只有三个位置，镜像命中后就被镜像占了（下载与更新检查都走它，那是镜像的意义），而**用户填的源地址没有任何地方可放** —— 装完之后列表只显示 Gitee，用户看不出插件的家在 GitHub，也看不出 SyncHub 在跟谁说话。修的时候还带出一条不显眼的规则：更新路径手里**没有**源地址（传进去的 `repo` 已经是镜像，而镜像发现要求 `ref.host === "github"` 不会再跑），不继承的话用户更新一次插件，GitHub 那一行就凭空消失 | `TrackedItem.origin` 记源地址（只在走了镜像时才有）；列表「源仓库一行 + 镜像另起一行」，第二行必须点明**下载走镜像**；`recordItem` 只在**来源没变时**继承 `origin`（与上一次的 ref 做 `isSameRepo` 比对 —— 无条件继承会让「同一个插件换个仓库装」显示上一个仓库的地址）；`sanitizeOrigin` 在读取侧兜住手改的 `data.json`（坏值只丢它自己，与主来源相同的值视为没写）。见 `tests/features/mirrorProvenance.test.ts` |
| **意外 HTTP 状态码漏出英文技术文案** | 真缺口：`host.requestFailed` 写了没接上。500/502/422 这类状态码会落到 `ObsyncError → err.message`，中文用户看到的是 `Unexpected HTTP 500 from ...` | 新增 `HttpStatusError`（带 status + 服务端说明），`describeError` 里加翻译分支 |
| **`statusMapper` 没有任何测试** | 测试盲区：一次变异验证打偏才发现的 —— 我把 `HttpStatusError` 换回 `ObsyncError` 后用例照样全绿，因为用例直接构造错误对象，没走映射路径 | 新增 `statusMapper.test.ts`（10 项，覆盖两个平台各自的限流表达方式） |
| 死键清理 | 25 个未被引用的 i18n 键：4 个背后是真缺口（见上），其余是通用词汇（保留）或设计上不该存在（`plugin.commandCategory` —— Obsidian 命令 API 没有分类字段；`settings.title` —— 被 `cmdOpenSettings` 取代） | 逐个分诊处理 |
| **资产 CDN 不可达时要白等三倍超时** | 真缺口（性能，且正好打在目标用户身上）：安装器逐文件回退，三个文件各试一次资产、各等一次超时；而 http 层还会重试 2 次 × 20 秒。合计 **约 3 分钟**才装完 —— 国内网络下这就是常态 | ① http 层**不再重试传输层失败**（确定性错误，重试只是把 20 秒变 62 秒）；② 安装器**记住资产通道失败**，后续文件直接走源码。合计降到 20 秒 |
| **`minAppVersion` 写低了（1.5.0，实际需要 1.8.7）** | 真 bug（发布阻断级）：`SecretStore` 调 `app.loadLocalStorage` / `saveLocalStorage` **没有兜底**，而这两个 API 是 `@since 1.8.7`。1.5~1.8.6 的用户装上后一用就 `TypeError` | `minAppVersion` → `1.8.7`；新增 `pnpm check` 自动校验 |
| 自查脚本散落在 gitignore 的 `.probe/` | 工程问题：写的时候有用，但不进仓库等于没有 | 移植成 `scripts/checks.mjs`，`pnpm check` 可跑，且 `pnpm build` 会先跑它 |
| **「从 Gitee 装只有源码的插件」这条验收标准从没被真正走通** | 测试盲区：`installerService.test.ts` 用 mock 的 host（验编排）、`giteeHost.test.ts` 验 host 单独工作 —— 两者都对，但**组合起来**的缝隙没人管 | 新增 `tests/features/giteeInstall.test.ts`：用**真实的 GiteeHost** 驱动完整安装流程 |
| **初始化仓库不建 `.gitignore`** | 真缺口：`init()` 只跑 `git init`。用户会把 `.obsidian/workspace.json`（面板/标签布局，**每开关一个标签就变**）同步出去，多设备必然冲突且没法手工合并 | 初始化时建一份默认的（已有则**绝不覆盖**，建不了也不让初始化失败）；另加「编辑 .gitignore」命令 |
| **同一个文件被重复计入**（三处） | 真 bug：`mapStatus` 按 `git status` 的两位状态位分别归类，「改了又暂存」的文件（`AM`/`MM`）同时进 `staged` 与 `unstaged`。于是 `{{numFiles}}` 多算、`{{files}}` 重复、**状态栏脏文件数虚高**、视图列表同一路径出现两遍 | 三处都改成**按路径去重** |
| **主题的大小写变体被当成两个主题**（身份键漏了归一） | 真 bug：主题的身份是**目录名**，而 macOS / Windows 的文件系统不区分大小写 —— 代码里另外三处都按这个口径办（`resolveThemeFolder` 找目录、`listInstalledThemes` 去重、`getActiveTheme` 判断当前主题），只有身份键 `availableUpdateKey` 是精确比较。后果不是「多一行」这么轻：两条记录指向**同一个目录**（更新其中一个等于更新两个），而徽标的键是 `<kind>:<id>` —— `theme:Minimal` 与 `theme:minimal` 是两条不同的记录，检查完只有一条会亮，用户看着两行一模一样的主题分不出哪行是真的。触发路径：`data.json` 随笔记仓库同步到多设备、或用户手改过目录名的大小写。`addTracked` 还自己就地写了一遍同样的比较，等于同一个判据两处各写一份 | `availableUpdateKey` 里按 kind 归一（**只归一主题**，插件不归一 —— `manifest.id` 有 `/^[a-z0-9-]+$/`，本来就不可能出现大写）；`addTracked` 改用它判重。两侧各有用例（写入侧 `themeService.test.ts`、读取侧 `settings.test.ts`），并额外钉住「两边刻意不对称」这条规则 |
| **插件在移动端会加载失败** | 真 bug（发布阻断级）：manifest 是 `isDesktopOnly: false`，但 `main.ts` **静态导入**了同步模块 → `simple-git` → 它在**模块初始化阶段**就 `require("child_process")` / `require("fs")`。移动端没有 Node，整个插件一启用就崩 —— 连纯 HTTP 的安装器都用不了 | `main.ts` 改用**动态 import**，推迟到 `Platform.isDesktopApp` 之后；`pnpm check` 加「移动端安全」守住这个不变式 |

> ⚠ **一处我自己的误判，记下来免得再犯**：判断 `minAppVersion` 时我最初用
> `grep -B6 "<成员>(" | grep -o "@since …" | tail -1` 取值，得到
> `addExtraButton → 1.11.0`，据此断言「1.5~1.10 会崩」。
> **实际是 0.9.16** —— `-B6` 的范围跨进了**下一个成员**的注释块，`tail -1` 取到的是它的
> `@since`。真正的问题在别处（`loadLocalStorage` 1.8.7）。
> 教训：**`@since` 必须和成员声明配对解析，不能用「附近最后一个」近似**。
> 现在 `scripts/checks.mjs` 是按类作用域配对的，不会再犯。

**验收标准速查**（详见 PLAN.md 第三节）：

- 阶段二 ✅：能从 GitHub 装真插件并启用；能从 Gitee 装只有源码没有 release 的插件；更新检查能识别新版本。
  > 关于 Gitee 那条：**找不到公开的 Gitee Obsidian 插件仓库**（`mirrors` 组织也没有、
  > 网页搜索页对匿名请求 405、API 搜索要么空要么被限流），所以改用
  > `tests/features/giteeInstall.test.ts` —— 用**真实的 GiteeHost** 驱动完整安装流程，
  > 响应形状按 Gitee 实测构造。它验证「GiteeHost 在安装器驱动下行为正确」，
  > 不验证「Gitee 服务端此刻可达」（后者归 live 测试）。
- 阶段三 🟩：本地闭环已由真实仓库单测覆盖（init/提交/拉取/推送/冲突/恢复）；
  **剩一项待实测**：对真实 Gitee 私有仓库的 `http.extraheader` 鉴权 push/pull
  （需要用户的令牌与真实仓库，单元测试只验证了配置构造）。
  > 2026-09-17 推进：鉴权链路的四段里，前三段已全部有实测依据
  > （config 构造 / git 的 `-c` / 真实 HTTP 头），Gitee 服务端校验该头也由 live
  > 测试确认；顺带查出并修掉了「用户名填 `git` 被 Gitee 拒绝」这个真 bug
  > （详见 `docs/reference-analysis.md` 差异 6）。剩下的只有令牌本身与账号策略。

## 三、命令与环境
```
pnpm dev         # esbuild watch + 自动部署到测试库
pnpm build       # 自查 + typecheck + 生产构建 + 部署
pnpm check       # 项目自查（见下），只读，约 0.2 秒
pnpm typecheck   # tsc --noEmit
pnpm test        # 单元测试（无网络，~2.5 分钟）
pnpm test:live   # 真实 API 测试（OBSYNC_LIVE=1，需网络）
pnpm verify:head # 在 **HEAD**（而不是工作区）上跑测试 —— 提交后跑，见下
```

### `pnpm check` 查什么（`scripts/checks.mjs`）

八项都是「编译器管不着、但会真出问题」的检查，每条都对应一个实际踩过的坑：

| 检查 | 防的是什么 |
| --- | --- |
| **minAppVersion 一致性** | manifest 承诺的最低版本必须覆盖代码用到的 API。写低了低版本用户装上就崩，而 TS 不提醒（类型包永远是最新版）。实测踩过：写着 1.5.0，实际需要 1.8.7 |
| **硬编码中文** | i18n 的编译期保证只管「locale 之间结构一致」，管不住「代码里直接写了一句中文」。实测扫出 22 处用户可见的错误文案 |
| **未使用的 i18n 键** | 死键是信号：通常是漏接的本地化或没接线的功能。实测 4 个死键背后都是真缺口 |
| **CSS 类覆盖** | 用了但没定义的类会静默丢样式；定义了没用的类是残留 |
| **移动端安全** | 从 `main.ts` 走一遍**静态**导入图，看有没有触及依赖 Node 的模块（`simple-git`）。移动端没有 Node，静态导入会让整个插件加载失败 —— 而这个**在桌面上测不出来** |
| **设置项无人读取** | 声明了、持久化了、设置页也能改，而**功能代码从不读** —— 用户改了它没有任何效果。实测踩过：`sync.enabled`（当年叫「启用笔记同步」，2026-10-02 起是「定时同步」那个开关）就是死开关，关掉之后自动提交照样把笔记推上远端 |
| **locale 加粗标记** | 界面全程不渲染 Markdown，`**` 会原样显示成星号 |
| **CSS 注释完整性**（2026-10-10 加） | 注释里出现 `*/` 会**提前结束注释**，剩下的文字被当成下一条规则的选择器，那条规则于是被解析器**整条静默丢弃**。踩到的实例：注释里写 `` `**/` 递归 ``，把 `.obsync-settings .obsync-gitignore { width: 100% }` 吃掉了，症状是**`.gitignore` 代码框全宽失效**。**第 4 项拦不住它** —— 被丢弃的规则在文本上仍然「有定义」 |

两张**带理由**的豁免表在脚本里（`KNOWN_SAFE` / `ALLOWED` / `NOT_A_CLASS` / `EXEMPT`）——
加条目时必须写清为什么安全，否则它们会变成掩盖问题的地方。
「设置项无人读取」的判据与它扫不到的两类写法，见第七节。

### 社区审核规范复查（`pnpm lint:review`）

闸门是 `eslint.review.config.mjs`（`pnpm lint:review`，接在 `pnpm build` 里）。
它**只把审核打回过的两条**设成 error（`obsidianmd/no-unsupported-api`、
`eslint-comments/require-description`），其余显式关掉 —— 理由写在那个文件里。

**要看全景跑 `pnpm lint`**（= `obsidianmd.configs.recommended`，不裁剪）。
0.1.7 发版前跑了一遍：obsidianmd 相关从 18 处降到 1 处，剩的那 1 处是**有意保留**
（`settings-tab/prefer-setting-definitions` —— 设置页整体是手写渲染的，
迁到 1.13 的声明式 API 是一次独立改造）。另有 40 余条 `@typescript-eslint/*`
风格项是既有欠账（`no-unnecessary-type-assertion` 之类），本项目一直把
`pnpm lint` 当**信息性**输出，不当闸门。

**几条判据是踩出来的，改代码前先看**：

| 规则 | 它到底要什么 |
| --- | --- |
| `no-static-styles-assignment`（**error**） | 不许 `el.style.x = "字面量"`、`el.style.setProperty("x", "字面量")`、`el.setAttribute("style", "…")`，以及 `setCssProps` / `setCssStyles` 里**带引号且不以 `--` 开头**的键。它**只认字面量**：`const w = "100%"; el.style.width = w` 与模板字符串（`translateX(${x}px)`）都不报 —— 但那是规则的**形式边界**，不是「可以这么写」：静态样式本来就该待在类里（2026-10-08 把 `.obsync-gitignore` 的宽度从这种写法收回了 CSS 类）。只有**动态值**才该走 `--*` 自定义属性 |
| `no-nodejs-modules` | 不许**静态** import Node 内置模块；它认可的写法是「`require` / 动态 `import()` 落在 `Platform.isDesktop` 守卫内」。`commitMessage.ts` 的 `node:os` 就是这么改的 |
| `no-console`（以 `rule-custom-message` 报出） | 只放行 `console.debug` / `warn` / `error` —— `console.info` 会被报成「Avoid unnecessary logging to console」。所以 `logger.info()` 落到 `console.debug` |
| `prefer-window-timers` | 定时器写 `window.setTimeout` / `window.clearTimeout`，否则弹出窗口（popout window）下行为不一致 |
| `prefer-create-el` | 别用 `document.createElement`（建出来的节点属于主窗口的 document）；`div` 用 `createDiv`，其余用 `createEl` |
| `hardcoded-config-path` | 不许写死 `.obsidian`：配置目录可以改名，写死会让规则一条都不匹配（`.gitignore` 模板据此改用 `vault.configDir`） |
| `ui/sentence-case` | 只放行「句子大小写」，裸 camelCase 品牌名会被要求改成 `Synchub` 这种形态 |

**⚠ `obsidianmd/*` 规则不允许用 `eslint-disable` 压掉**：`eslint-comments/no-restricted-disable`
把 `obsidianmd/*` 与 `no-console` 都列进了禁止名单。所以上面几条**只能换写法**，
加 disable 只会多出一条 error（这条是实测撞到的）。

### 提交后：`pnpm verify:head`（在 HEAD 上跑，而不是工作区）

`pnpm test` 读的是**工作区文件**。工作区里还压着没提交的改动时，全绿只说明
「我磁盘上这一坨是好的」，说明不了 **HEAD 是好的** —— 而 HEAD 才是别人克隆下来
看到的东西。

实测踩过（2026-09-19）：`d939df2`（状态栏全宽开关）提交了测试与 i18n 键，
**唯独漏了 `src/settingsTab.ts`**，于是 HEAD 上三条已提交的用例是红的，而本地
一直是绿的。这个错**只在别人克隆或 CI 上才会暴露**。

`pnpm verify:head`（`scripts/verify-head.mjs`）把工作区（**含未跟踪文件**）stash
起来、跑测试、再 pop 回来，于是跑的就是 HEAD。三个要点：

- **每个提交后跑一次**，尤其是「一次改动横跨代码 + 测试 + i18n + CSS」的提交 ——
  那正是最容易漏文件的情形；
- `--include-untracked` 不是可选的：新加的测试文件若还没 `git add`，不 stash 掉就会
  混进「HEAD 的测试」里，那验的就不是 HEAD 了；
- 它**只发现「HEAD 红了」，发现不了「HEAD 缺了个改动而测试恰好不覆盖它」** ——
  所以它是兜底，不是「提交前对着 `git status` 核一遍」的替代。

**它挂在 `pre-push` 上**（`.githooks/pre-push`，靠 `pnpm hooks:install` 设
`core.hooksPath`）—— 所以「忘了跑」这一种也被覆盖了。选 pre-push 而不是 pre-commit：
commit 是本地历史、随时能 `git reset`，**push 才是「别人能看到」的时刻**，也正是这个
错真正有害的时刻；而 push 频率远低于 commit，3 分钟等得起。跳过用
`git push --no-verify`。hook 放 `.githooks/` 而不是 `.git/hooks/`：后者不进版本控制，
重新克隆就没了 —— 而「防漏提交」恰恰需要它一直在。

> 中途 Ctrl+C 的话 `finally` 不会执行（SIGINT 直接终止进程，而 `spawnSync` 还阻塞着
> 事件循环），改动会留在 stash 里。取回：`git stash list` → `git stash pop`。

### 移动端：为什么同步模块必须动态导入

`manifest.json` 是 `isDesktopOnly: false`（安装器是纯 HTTP 的，移动端可用），
但**同步模块依赖 Node**。而 `simple-git` 在**模块初始化阶段**就
`require("child_process")` / `require("fs")` —— 静态导入会让整条依赖链在插件加载时
就初始化，移动端一启用就崩，连安装器都用不了。

所以 `main.ts` 用**动态 import**（`loadSyncModule()`）推迟到 `Platform.isDesktopApp`
之后。实测依据在 `scripts/verify-mobile-load.mjs`（`pnpm verify:mobile`）：把打包产物
放进一个「require 对 node 内置模块抛错」的环境里加载 —— 静态导入时以
`require is not defined: fs` 失败，改成动态 import 后不再抛错，且 esbuild 不产生
额外分块（仍然只有 `main.js`）。

这条不变式有两道防线：`scripts/checks.mjs` 的「移动端安全」（静态导入图，快）
+ 上面那个脚本（真实产物，发布前跑）。

> ⚠ 别改回 `require("./features/sync")`：Obsidian 桌面端能用，但测试环境是 ESM，
> `require` 不存在，启动测试会全部失败。（试过，踩了。）

- 部署目标默认 `F:/_Workspace/Plugin-Test/.obsidian/plugins/ob-sync`；环境变量
  `OBSYNC_DEPLOY_DIR` 可覆盖，而且**接受多个目录**（`;` 分隔）—— `pnpm build:both`
  就是「同时部署到测试库与真实库」那条命令。设空串跳过；某个目标写失败只警告，
  既不中断构建、也不影响另一个目标。**只复制三个产物，永远不碰 `data.json`。**
- 测试库路径下可直接手测插件（Obsidian 打开该库）。
- 本机 shell 是 Git Bash（Windows），git 二进制可用（阶段三会用到）。

## 三点五、设置页结构

设置页分五个标签页（`src/settingsTab.ts`，自绘标签栏，Obsidian 的
`PluginSettingTab` 没有内建分页）：

| 标签 | 内容 |
| --- | --- |
| 已追踪插件 | 三个主操作按钮（添加插件仓库 / 绑定已有插件 / 检查全部更新）+ 跟踪列表 |
| 插件安装器 | **SyncHub 自身**（版本状态小字 → 检查更新 / 更新按钮 → 「启用 Gitee 镜像源」开关，2026-10-06 按用户要求整块提到最前）、**进入设置页时自动检查**（开着时同时查跟踪列表与 SyncHub 自身）、**启动时检查更新** + 延迟、**自动发现 Gitee 镜像**。标签上有**数字徽标**（`installer.selfUpdateAvailable`，SyncHub 自身有可用更新时显示） |
| 仓库同步 | **注意事项**（**页面最上方**，2026-09-19 加；2026-10-06 删掉页首标题后它直接成为第一条内容）、**操作**（**打开仓库同步面板**，2026-10-02 加）、**连接测试**（同日提到前面）、**定时同步**（周期 + 开关同一行 + **距下次同步的倒计时**，2026-10-02 由「同步开关 + 三个间隔」合并，策略为「重置」时两个控件都禁用）、提交信息模板、整合策略、**git 可执行文件路径**（2026-10-02 起整行 + 「浏览…」 + 一行「去哪儿装 git」的下载链接）、**`.gitignore` 编辑框**（2026-09-24 加；2026-10-09 起同一节多了**补齐推荐的忽略规则**按钮与**忽略插件目录**开关，2026-10-10 又多了**停止跟踪本地状态文件**，见五点十四节）、**大文件阈值**（2026-10-09 加，默认 5 MB，填 0 关闭提交前的检查）、**清理**一节（2026-10-09 加：体检 / 回收空间 / 丢弃备份并回收，见五点十五节；**排在这一页最后** —— 它是「仓库已经大了」才来的事后动作，放最前面会天天占着视线） |
| 图片同步 | **操作**（**打开图片管理** + 测试连接 / 预览变更 / 立即同步）**排在最前面**（2026-10-02）、**自动同步图片**（开关，2026-10-02 由「启用图片同步」改名）、**按周期同步**（周期 + 开关，同日从「冲突与删除」末尾挪来并把开关拆出来）、**需要图片同步的文件夹**（2026-10-02 由「受管的图片文件夹」改名；同日从「一个多行文本框」改成「添加输入框 + 候选下拉 + 已加入列表」）、R2 连接（含密钥）、冲突与删除策略、压缩默认值 |
| 通用 | 提示开关、调试日志、**状态栏同步条目贴靠最左侧**（2026-10-09 加，默认开；关掉后条目按默认顺序排，不作特殊处理）、**功能区展示用户头像**（2026-10-05 加）、**使用 Gitee 头像**（2026-10-06 从上一项拆出来：用哪个平台的头像；总开关关着时置灰，描述里带「去换头像」的链接且跟着平台走）、**访问令牌**（GitHub / Gitee，2026-10-06 从「插件安装器」页移来）—— 界面语言那个下拉 2026-10-01 删了：一律跟随 Obsidian（见 `core/i18n/index.ts`）。「状态栏占满整屏宽」2026-09-19 加、2026-10-09 删（见第六节状态栏） |

**五个页签都**没有页首标题（2026-10-06 删）：页签名就是页名，再顶一行同名标题是重复
信息（「已追踪插件」那一页的标题与卡片更早在 2026-10-05 就去掉了）。删的是
`settings.{installer,sync,images,general}.heading` 这四个键；**节内**的小标题留着 ——
`settings.token.heading`（「访问令牌」）与 `openGroup(title)` 建的区块标题（R2 连接、
连接测试…）都还在。

选中项存在内存（`activeTab`），页内重绘或切换标签后不回弹到第一页；
切标签不会重复触发「进入设置页自动检查」。标签文案在 `settings.tabs.*`。

### 设置行分组：`openGroup` / `openSection`（2026-10-02）

用户原话：**「美化一下仓库同步、图片同步设置页的设置项样式，图中展示的布局样式是丑陋的。」**
截图里两处最扎眼：①「操作」那一节下面一条**只有右边三个按钮**的横条；②「连接测试」
下面一条只有「测试连接」的横条。根因不是留白没调好，而是 Obsidian 1.13 起
**一条 `Setting` 自己就是一张卡片**（app.css 的 `.setting-item` 带
`--setting-items-background` 底色与 `--setting-items-radius` 圆角）：照原样逐条画，
一页十几张紧挨着的卡片，没有层次；而**没有名称的行**里 `.setting-item-info` 是
`flex: 1`，会把控件一路顶到最右，左半边就空着。

改法（`src/settingsTab.ts`）：

| 帮手 | 产出的 DOM | 用在哪 |
| --- | --- | --- |
| `openGroup()` | `.setting-group.obsync-group > .setting-items`（**无标题**） | 页面标题正下方那一节 —— 页标题已经在上面了，不再重复一个组标题 |
| `openSection(title)` | 同上，另加一行 `.setting-item.setting-item-heading.obsync-group-heading` 作组标题，**可以再挂动作按钮** | 「忽略规则（.gitignore）」「Cloudflare R2 连接」「冲突与删除」「裁剪与压缩的默认值」「操作」「连接测试」 |

用的是 Obsidian 自己的**类名**（不是 API）：1.13 以上直接得到原生观感，主题里的
`--setting-items-*` 变量照常生效；1.13 以下这几个类没有样式，退化成原来的逐行排布，
不会坏。`styles.css` 只补原生没管的三件事：

1. 组内**非 Setting 内容**（代码框、结果区、说明段）的左右缩进 —— 行的内边距长在
   `.setting-item` 上，不会传给兄弟节点；
2. 标题行里的信息区要 `flex-grow: 1` —— app.css 给
   `.setting-item-heading .setting-item-info` 写的是 `flex-grow: 0`，照它来按钮会
   紧跟着标题、右边空一大块；
3. 组与组之间的间距 —— 原生只写了 `.setting-group + .setting-group`，而这两页的组
   之间隔着标题行或「注意事项」，那一对选择器永远不匹配。

顺带修掉两条真问题：

- **`.obsync-gitignore-actions` 一直没生效**。它原先只写了
  `justify-content: flex-start`，而 `.setting-item-info` 占满剩余空间时那句话什么也
  不做（实测按钮仍贴最右）。现在这一类「贴左的动作行」统一叫
  `.obsync-inline-actions`，并且 `display: none` 掉空的信息区。
- **结果区原先建在动作行之前**，于是「变更预览」的结果显示在产生它的按钮**上面**。
  现在结果区落在同一组的行容器里、动作按钮下面。

### 文案里不能写 Markdown 加粗（2026-10-02）

用户原话：**「设置项里的说明文字除非能正常渲染md格式，否则不要使用加粗 `**` 格式」**。
界面**全程不渲染 Markdown**（`Setting.setDesc`、`Notice`、tooltip、`.gitignore` 模板
正文都是纯文本），所以 `**xxx**` 会原样显示成星号 —— 实测「忽略规则」那一行的说明
就带着两个星号。两个 locale 共 32 处已去掉（含提示条与 tooltip）。

`scripts/checks.mjs` 新增第 7 项检查守住它：只扫**字符串字面量**（注释里的 `**` 是
写给读代码的人的强调，不算），改回来 `pnpm check` 立刻红。

**样式只能在真机上看**这件事仍没变（`tests/setup.ts` 那个 DOM 替身没有布局）。
本地草稿区里有一份不用开 Obsidian 的预览器（把真实的 `settingsTab.ts` + `app.css`
+ 主题的 `theme.css` 放进 Chromium 截图），见 `.probe/settings-preview/README.md`
—— 它在 `.gitignore` 里，不进仓库。

### 定时同步：一个周期 + 一个开关（2026-10-02）

用户看了「启用笔记同步」与「自动提交并同步间隔」并排的截图后问：**「这两个设置项是否功能重复了？」**
—— 是，而且比看上去更彻底：`sync.enabled` 在 `src` 里**只被 `Automatics` 读**，它除了让定时器停表
之外什么都不管，而「三个间隔全设为 0」走到的正是同一个结果。于是同一个「关」有**两种说法**，
偏偏默认又是「开关开着 + 三个间隔全 0」（拨到哪边都不动）—— 新装的人看到的就是两个都不起作用的
设置项。用户随即给了目标形状：**改名「定时同步」、默认关、周期框放在开关前面、三个间隔合成一个**。

现在的形状（`src/settingsTab.ts` 的 `renderSync`）：**一行 = `[周期] 分钟 [开关]`**，
中间那个单位是 `controlEl` 里的一个 `span.obsync-unit`（顺序就是 `addText` → span → `addToggle`）。
两个控件各表达一件事：

| 控件 | 它说的那件事 |
| --- | --- |
| 开关（`sync.enabled`） | 唯一的开 / 关 |
| 周期（`sync.intervalMinutes`） | 多久跑一次，**没有「0 = 关闭」**（`normalizeSettings` 钳在 1–1440） |

为什么三个并成一个：`autoCommitMinutes` 到点跑的**本来就是完整链路** `提交 → 拉取 → 推送`，
另外两个只是在它之上额外加的单动作定时器 —— 除了逼用户先读懂「推/拉间隔为 0 也会随主间隔
一起发生」之外没有别的用（那两段解释文案随之一并删掉）。**代价说清楚**：「只拉取 / 只推送」
这两种定时配置没有了；手动按钮不受影响。用户确认接受。

**默认值改成关**（`enabled: false`、`intervalMinutes: 10`）。定时同步会真的提交并推送，
与图片那条 `autoSyncMinutes` 同一条理由：不该在用户没要求时自己跑起来。

#### v6 → v7 迁移（`migrateV6ToV7`）

不是「取三个里最小的非零值」—— 那会**改变语义**：一台刻意配成「只拉取」（主间隔 0、拉取 30）
的设备，迁移后会开始提交并推送，而那正是它当初避开的动作。三条分支：

| 老数据 | 迁移结果 |
| --- | --- |
| 主间隔 > 0 | 周期 = 那个值，开关照旧（它本来就是「每 N 分钟整条同步一次」） |
| 主间隔 = 0（含三个全 0 / 压根没配过） | 周期留默认，**开关一律置回关** |
| 已经是 v7（有 `intervalMinutes`） | 一个字段都不碰，旧字段只是残留 |

第二行是这次迁移**真正的作用**：老模型里「开关开着 + 全 0」的实际行为是什么都不做，而新模型里
一旦开着就会每 N 分钟提交并推送。实测本机两个库（`Plugin-Test`、`learning-records`）存的都是
`enabled: true` + 三个 0 —— 没有这条迁移，升级后**它们会在几分钟内开始自己往远端推**。

「未上架、没有别的用户」这件事让迁移不必背历史包袱，但不影响上面这条：
它保护的是**已经在用的人的设备**，而不是陌生用户。

#### 顺手修掉的两处

- `Automatics` 从「三个 `Map` + `AutoKind`」收成一个定时器（`STORAGE_KEY` 改成
  `obsync-last-auto-sync`）。**但 `intervalMinutes <= 0` 的兜底不能删**：
  周期为 0 时 `remaining()` 算出 0 毫秒，「立刻触发 → 重新起表」就是一个死循环
  （每秒几十次 git 子进程，界面上看不出异常）。`normalizeSettings` 虽然保证了 ≥1，
  这条防线仍然留着，并有用例钉住。
- 三个间隔的名字（`autoCommitMinutes` / `autoPushMinutes` / `autoPullMinutes`）从类型里去掉，
  `mergeWithDefaults` 只保留默认值里存在的键，所以老 `data.json` 里的残留会自然消失。

### 分组之后的几次修补（2026-10-02，同一天）

**① 「操作」这一节挪到图片同步页最前面。** 用户看了截图后说：**「图中的功能比较常用，应该放到
页面最前面才对」** —— 三个动作按钮与「打开图片管理」此前沉在四个设置节的最底下，而配好 R2、
冲突策略、压缩默认值之后那三段基本不会再翻。现在它紧跟「注意事项」，是这一页的第一个设置组。

注意它**不能再 `return`**：这一节以前排在最末，装配层没给出服务时用 `return` 收尾是无害的；
挪到最前之后，那个早退会把整页剩下的设置全部吞掉（而它们并不需要这个服务）。

**② 组内第一行上方那条悬空的分隔线。** 用户指出「操作和图片管理之间有一条分割线，非常丑陋」。
根因不在我们画的线上，而在 **`:first-child`**：app.css 的分隔线规则是「每一行上方画一条，
第一行除外」，而它的「第一行」判据是 `:first-child`；「操作」那个组里排在最前面的却是
**空的结果区**（`.obsync-diagnostics:empty` 是 `display: none`）—— 一个不可见的兄弟照样占着
`:first-child`，于是真正显示在最上面的「打开图片管理」被当成了第二行，上方多出一条线。

修法是改判据：**「上一条不是设置行」就不画**（`styles.css` 里
`.obsync-group > .setting-items > :not(.setting-item) + .setting-item::before`）——
说明段 / 代码框 / 结果区之后的第一行不画，行与行之间照旧画。这条规则是**通用的**：
`.gitignore` 那一节（说明段 → 代码框 → 按钮行）也一直因此多一条线。

那个「空结果区排在第一行之前」的排列本身没动（结果就该贴着产生它的按钮），
它在 `tests/features/settingsTabRender.test.ts` 里有一条用例说明它与这条 CSS 是一对。

**③ 图片同步那两行：改名 + 搬家（用户的问题是「0 到底会不会自动同步」）。**

用户问：**「启动图片同步设置项开启时，而冲突与删除下的自动同步间隔为 0，究竟是否会自动同步图片」**
—— 会，**启动时那一轮照跑**。`images.enabled` 默认 `true`、`autoSyncMinutes` 默认 `0`，于是
只要 R2 配全，**每次 Obsidian 启动都会同步一轮**（`onLayoutReady` → `createImageSyncModule.start()`
里的 `images.enabled && service.isConfigured()`），而间隔只决定「要不要**再**按周期跑」
（`ImageAutomatics.start()` 在 `<= 0` 时直接 return）。这一轮还是**静默**的：成功不说，
失败只进日志。

误会来自两行文案各说一半 + 一个**位置错误**：「自动同步间隔」原先排在「冲突与删除」那一节的
**末尾**，与它实际管的事毫无关系；而它的描述写的是「设为 0 表示关闭（默认）」，读起来像
「图片同步整个关着」。用户接着问是不是该有一行「有变化就同步」，并要求改名与搬家 —— 采纳了
前者（改名 + 搬家），后者（事件驱动）**没有做**，理由见下。

- **改名**：「启用图片同步」→「自动同步图片」。旧名字像个总开关，而它管的是**自动**那部分
  （启动一轮 / 周期 / 改名时云端换键 / 删本地时的询问）。
- **搬家**：「自动同步间隔（分钟）」跟在开关**正下方**，「冲突与删除」那一节只剩两个策略下拉。
- **文案**：间隔那行写「不按周期跑（默认）—— 只要上面的开关开着，启动时仍会同步一轮」；
  开关那行写「关掉后这些后台动作全部停止（连『云端那份也删吗』也不再问）」。

**为什么没做「有变化就同步」**：那**不是重新命名，是新功能** —— 现在 `src` 里与图片有关的
vault 事件只有 `delete`（问一句 / 删云端）与 `rename`（云端换键），**没有 `create` / `modify`**，
往库里放一张图或改一张图都不会触发同步。要做成需要：加监听 + 图片路径与受管文件夹过滤、
**防抖**（一次保存会连发多个 `modify`，而一轮 `run()` 是整库比对 —— ListObjects + 逐文件 hash，
逐次触发会把 R2 配额打光）、与手动 / 定时 / 启动几路共用 `isBusy`。另外别用「数字 0 = 变化触发」
表达三种含义（关闭 / 不按周期 / 变化触发），用「触发方式」下拉更自然。等真要做时按这份清单来。

**④ 「按周期同步」：把开关从数字里拆出来（当天第三次改，v7 → v8）。**

用户接着问：**「自动同步间隔为 0 的情况也是不太好让人理解，如果把最小值设置为 5 是不是更合适」**
—— 下限设 5 的直觉是对的（与 `compressQuality` 下限 10 同源：每 1 分钟跑一轮整库比对没有意义，
用户多半是手滑拖到底），但**光改下限会撞上默认值**：0 一旦被禁，就得把默认周期改成非 0，而
`images.enabled` 默认是 **true** —— 那等于让每个新用户（以及所有存量库）开箱就「每 5 分钟跑一轮
整库比对」。留 0 也不行：输入框 `min=5` 而值是 0，字段自相矛盾，而且 HTML 的 `min` 不拦手输。

根因是那个数字**兼职两种状态**。于是拆出 `images.autoSyncEnabled`：

| | 改前（v7） | 改后（v8） |
| --- | --- | --- |
| 「关」由谁表达 | `autoSyncMinutes === 0` | `autoSyncEnabled === false` |
| 周期的范围 | 0–1440 | **5–1440**（0 / 负数 / 非数字收敛到默认 10） |
| 行的名字 | 自动同步间隔（分钟） | **按周期同步**（单位由框后的 span 承担，开关罩不住了） |
| 行的形状 | `[0]` | `[10] 分钟 [开关]` —— 与「仓库同步」页的「定时同步」同一形状 |

`migrateV7ToV8` 两条分支：旧周期 > 0 → 开关置开、周期接过来；旧周期 = 0（**绝大多数**）→
开关置关、周期留默认。**这一条同样先是「升级后不会自己跑起来」的保证** —— 实测本机两个库存的
都是 `enabled: true` + `autoSyncMinutes: 0`，迁移后是 `autoSyncEnabled: false` + `10`：
总开关照旧（启动那一轮还在），而周期仍然是关的。

顺带在 `ImageAutomatics` 里补了一句读 `autoSyncEnabled` 的早退，并保留 `<= 0` 的兜底 ——
周期若真是 0，`setTimeout(0)` 就是「立刻触发 → 重新起表」的死循环（与 `Automatics` 里同一句）。

**⑤ 数字输入框：出界的输入不再留在框里（用户问「0–4 不会被视觉修正是吗」）。**

用户接着问：**「按周期同步如果输入 0-4 的值不会被视觉修正是吗？这不合理吧」** —— 对，当时就是那样：
框里写着 0、真正生效的还是 10。查下去发现**这不是那一格的问题，五处数字框都有**，而且形态各异：

| 字段 | 原来的判据 | 症状 |
| --- | --- | --- |
| `images.autoSyncMinutes` | `< 5` 就 return | 框里留 0，实际生效 10 |
| `sync.intervalMinutes` | `< 1` 就 return | 同上（我上一轮引入的） |
| `installer.autoCheckDelaySeconds` | 只查 NaN | 99999 被**存下去**，下次加载才被钳到 3600 |
| `images.compressQuality` | 只查 NaN | 5 被**存下去**，下次加载才被钳到 10 —— 框里写的与生效的一直不是一回事 |
| `images.compressMaxEdge` | `> 0 ? : 0` | 打 `abc` → 存 0，框里显示 `abc` |

共同点是**界面在撒谎**：拒绝输入至少是「没反应」，而留下一个不生效的数字会让人以为设置已经生效。
统一收进 `settingsTab.addNumberField()`，回一条规则：

- `onChange` 只接受 `[min, max]` 内的值；
- **失焦时把框里的显示对齐回真正生效的值**；
- `min` / `max` 必须与 `normalizeSettings` 的钳制**一致**（否则就是新的谎：框里能填、存下去又被改掉）。

两个刻意的取舍：

1. **修在失焦，不在 `onChange`**。Obsidian 的 `TextComponent.onChange` 绑的是 `input` 事件 ——
   **每按一个键都触发**。在 `onChange` 里改框，用户打「15」的第一个键「1」会被立刻改掉，
   接着的「5」拼出来已经不是他想输的数。
2. **出界是「不接受」，不是「钳到边界」**。这些数字里有一类是**周期**，更小 = 更激进：
   把误输入的 `0` 钳成下限，等于替用户选了 1 分钟一次 git 提交 / 5 分钟一轮整库比对 ——
   比拒绝危险得多。所以一律不写、把框改回当前值，并在描述里写明区间（「5–1440」/「1–1440 分钟」），
   免得「打 0 变回 10」看着像个 bug。

**⑥ 三件小事：连接测试提到最前、文件夹改名、路径框整行（2026-10-02 用户一次提的）。**

1. **「连接测试」放到「仓库同步」页最前面**。用用户的原话是「放到最上边展示」，
   与图片同步页把「操作」提到最前同一条理由：它是**动作**，而下面两节（定时同步 /
   忽略规则）是配一次就不再翻的设置。位置是**「注意事项」之后**、第一个设置组之前 ——
   那两段提醒是刻意钉在标题正下方的（有用例守着），而且它们说的是「别这么配」，
   摆在动作前面比摆在一个按钮后面有用。`renderDiagnostics()` 因此从 `renderSync()`
   末尾挪到了注释块之后（它自己开头那个 `if (!sync) return` 只退出自己，挪位置安全）。
2. **「受管的图片文件夹」→「需要图片同步的文件夹」**。旧名字没说清「受谁管、管来干嘛」。
   改的时候把**用户可见文案里的「受管」一并换了**（10 条 zh / 10 条 en）：
   「受管的图片文件夹」→「需要图片同步的文件夹」、「受管文件夹」→ 同上、
   「已在受管范围」→「已在同步范围」、「受管图片」→「同步范围内的图片」、
   「这个库里没有受管文件夹中的图片」→「这个库里没有落在同步范围内的图片」。
   不改的话界面会同时用两个名字指同一件事（例如提示语让你去填一个不存在的设置项）。
   英文侧统一成 "the folders you sync"，设置名是 "Image folders to sync"。
   **代码注释里的「受管」保留** —— 那是内部对机制的称呼，不是给用户看的词。
3. **路径框整行放到下一行**。用户的原话：「把路径文本框和浏览、恢复默认按钮在下一行展示」。
   原来它是这一行的 `Setting` 控件，被 `.setting-item-control` 挤在右侧几百像素里 ——
   描述占四行、框里只看得见一个 `.`（用户附的截图正是那样）。
   做法与 `.gitignore` 那一节完全一致：名称/描述那行**不带控件**，框改成挂在
   `.obsync-block-wrap` 里的块级 `textarea`，**宽度与 `box-sizing` 写在类里**
   （2026-10-08 起 `.obsync-gitignore` 就是这样 —— 曾经为了「活过样式表缓存」
   内联成 `el.style.width = FULL_WIDTH`，那是踩 `no-static-styles-assignment`
   的形式边界，已收回类里）。
   那层壳的类名从 `obsync-gitignore-wrap` 改成通用的 `obsync-block-wrap`（两处共用，
   规则只有 `display: block`）；框自己的外观在 `.obsync-folders`（不折行、界面字体 ——
   这里没有需要对齐的通配符语法，与 `.gitignore` 的等宽不同）。

**⑦ 提交信息模板的默认值带上文件数（2026-10-02 用户要求）。**

默认值从 `vault backup: {{date}}` 改成 `vault backup: {{date}} ({{numFiles}} files)` ——
翻提交历史时「这一次动了多少」是第一个想知道的，而模板里不写就没有别的地方能看出来。

两件要记住的事：

1. **改默认值不会动到已有用户。** `mergeWithDefaults` 让 `data.json` 里存着的值优先，
   所以升级后老库仍是旧模板。这是**刻意的**：模板属于用户可编辑的设置，默认值只该
   管「没有值」的情况（新的安装、或者用户在设置页清空那一格）。想给老库也换掉，
   就去设置页改那一个文本框 —— **不要**为它加一条迁移：那会连带改写「自己就想要
   这个措辞」的用户手写的值，代价大于收益。
   （顺带：本机两个库的 `data.json` 里存的就是旧模板，所以那两个库升级后行为不变。）
2. **`{{numFiles}}` 只是个数字，不区分单复数** —— 只动一个文件时这条默认值读作
   `(1 files)`。用户明确指定了这个形状，所以照写；要更准就自己写 `file(s)`。
   `commitMessage.test.ts` 钉的是变量展开，不管语法。

用例钉在 `settings.test.ts`（`默认的提交信息模板带文件数，但不会改写老库里存着的模板`）。

**⑧ 两块输入：git 路径整行 + 系统文件框；图片文件夹改成「添加框 + 候选 + 列表」（2026-10-02）。**

用户一次提了两处：

> 仓库同步中，git可执行文件路径的输入框应该单独一行，并提供浏览按钮打开资源管理器。
> 另外图片同步中，需要图片同步的文件夹的路径输入框应该和浏览、恢复默认按钮在同一行中显示，
> 同时文本框格式不太对，不需要拉高度，输入路径时，文本框下方应该提供候选辅助，
> 并且可以添加多个文件夹，在下方列出已经添加的文件夹，并提供删除按钮。

**① git 路径：整行 + 「浏览…」。** 那个路径（`C:\Program Files\Git\cmd\git.exe`）比
`.setting-item-control` 的几百像素长得多，挤在右边只看得到开头一截。做法**不是**把输入框搬出去
自己搭（那就得把 Obsidian 的输入框外观、焦点环整套再抄一遍），而是给那一行加 `.obsync-stacked`：
`flex-direction: column` + 控件满宽 —— 这正是 app.css 在窄容器里对 `.setting-item` 干的事。

- **CSS 陷阱**：styles.css 里早先有一条 `.obsync-settings .setting-item { align-items: center }`
  （给「跟踪列表」那页的两行文字配图标用的），它与 `.obsync-stacked` **特异性相同、位置更靠后**，
  把 `align-items: stretch` 盖掉了 —— 实测表现是「名称与控件都缩成内容宽，整行像居中」。
  选择器因此写成 `.obsync-settings .setting-item.obsync-stacked`（0,3,0），并给两个子项
  `width: 100%` 兜底。**踩过一次，改这条 CSS 前先看那段注释。**

**② 「浏览…」走系统文件对话框（`core/desktopFileDialog.ts`）。** Obsidian 的**公开 API 里没有**
文件对话框 —— `obsidian.d.ts` 里最近的东西只是 `FileSystemAdapter.getFullPath`。而 Obsidian
**自己**就是借 `electron.remote.dialog` 开文件框的（1.13.7 渲染进程里「选择语言包文件」那处用的是
`electron.remote.dialog.showOpenDialogSync`，还有 `electron.remote.shell.showItemInFolder`）。
插件与它同进程、共用 `window.electron`，于是照做。

那条路径的三条纪律：

- **不 import 任何东西**。`checks.mjs` 的「移动端安全」扫静态导入图，而这个模块只是在 `window`
  上读属性 —— 移动端读到 `undefined` 就返回，插件连加载都不会崩。
- **三层防御 + 一律静默失败**。没有 `window.electron`（移动端）、没有 `remote`（将来 Electron
  换掉）、用户取消、对话框抛错 —— 全都返回 `undefined`，**不弹任何提示**：旁边那个输入框一直在，
  为一个锦上添花的按钮弹红色提示比什么都不做更烦人。
- `properties` 带 `dontAddToRecent`（别让 git.exe 进系统「最近使用」，Obsidian 自己也带着它）。

**③ 图片文件夹：从「一个多行文本框」改成「添加框 + 候选 + 列表」。**

- 多行文本框（`textarea` + `parseFolders` / `formatFolders` / `formatFolderPath`）**整个删掉**：
  它的高度、`resize`、「一行一个」的写盘方式都不再需要。那三个函数也随之变成死代码，
  连同它们的用例一起删了（判据留在 `normalizeFolders`：纯空白丢、`""` 与 `"."` 都算整个库）。
- 添加行 = `[输入框] [浏览…] [恢复默认]` **同一条 `Setting`**（`.obsync-inline-actions`
  ＋ `.obsync-inline-field`）。回车加入；输入时下面出候选（`.obsync-path-suggest`，绝对定位）；
  已加入的每个文件夹一行 `Setting` + 垃圾桶按钮（`obsync-folder-row`）。
- 候选的构造与过滤**抽成了 `folderOptions()` / `filterFolderOptions()`**（`FolderSuggestModal.ts`）：
  模态选择器与这个下拉必须是同一份列表、同一种排序、同一套搜索文本，分开写就是两份会各自漂移的实现。
- 两个实现细节，都是踩过才写下的：
  - 候选项用 **`mousedown`** 而不是 `click` 选中：`click` 之前输入框会先 `blur`，
    而 blur 处理器会把列表收起来，点击就落空了；
  - 下拉的显示/隐藏走 **class**（`is-open`）而不是 `style.display` ——
    社区审核的 `obsidianmd/no-static-styles-assignment` 会拦后者。
- 「已经在受管范围」的候选仍然可以点：`normalizeFolders` 去重，重复加入是**无害的空操作**
  （不报错、不重复），这与模态选择器原先的行为一致。

用例：`settingsTabRender.test.ts` 的「git 可执行文件路径」5 条 + 文件夹那 8 条（含
「回车归一后加入」「重复加入是空操作」「打字出候选、点候选即加入」「删除按钮移除」），
以及新文件 `tests/core/desktopFileDialog.test.ts` 7 条（把 helper 的每一层缺失都验一遍）。
测试替身也补了两处**保真度**：`TextComponent.setValue` / `type` 现在会写进 `inputEl`
（真机上就是这样，不然「框被清空了」「失焦把框改回去」这两件事都测不出来）。

**④ 「git 从哪儿来」写进界面与 README（2026-10-02，用户追问「必须要手动装 git 吗」）。**

答案是**是**：笔记同步 spawn 的是**系统** git（`simple-git` 的 `binary` 或 `PATH`），插件
不捆绑也不下载它 —— 参考项目 obsidian-git 同样是这个前提；`features/sync/index.ts` 里那句
「isomorphic-git 的缺口是有意的」就是这条决策（没有纯 JS 兜底）。缺 git 时的判定靠
`/spawn .* ENOENT|command not found|not recognized as/i` → `GitBinaryMissingError`。

顺着这个问题补了两处**只说了「怎么指」、没说「去哪儿弄」**的文案：

- 设置页「git 可执行文件路径」下面多一行提示 + 一个**可点的**链接
  （`.obsync-git-download`，`https://git-scm.com/downloads`）。设置页的描述是纯文本，
  光写 `git-scm.com` 得让用户自己复制到浏览器。链接走 `createEl("a", { attr: { href,
  target: "_blank", rel: "noopener" } })`：**不拦点击** —— Obsidian 主进程注册了
  `setWindowOpenHandler`（在 `main.js` 里查过），http(s) 一律交给系统浏览器，而
  `will-navigate` 那道守卫保证设置弹窗不会自己被导航走。用 `attr` 而不是 `href`
  字段，是因为 `attr` 在真机与测试替身里都生效 —— 测试要读得到那个网址。
- `gitNotFound` 从「找不到 git 可执行文件，请在设置中指定路径。」改成带下载地址的版本
  （它是 `Notice` 里的纯文本，放不了链接，所以网址直接写出来）。

README 两半都补了**平台要求**：不捆绑、各平台怎么装（Windows 的 Git for Windows / macOS 的
`/usr/bin/git` 壳与 Command Line Tools / Linux 的包管理器），以及「装没装好看最上面那个
连接测试」。用例 +2（提示行存在且链接指向官方下载页、`gitNotFound` 里带地址）。

**⑨ 「打开仓库同步面板」按钮（2026-10-02）。**

用户的原话：**「仓库同步设置页下，应该添加打开仓库同步视图的按钮」**。
面板本来有三个入口（命令面板 / 侧栏 git 图标 / 状态栏那一条），**唯独正在配置它的这一页没有**
—— 而那恰恰是用户会想「让我看一眼现在是什么状态」的地方。

- 新增一节「操作」放在**最前面**（注意事项之后），里面一行「打开仓库同步面板」+ 按钮，
  与图片同步页的「操作 / 打开图片管理」同一形状。「连接测试」因此从第一组变成第二组 ——
  两个动作都还在页面顶部，而面板入口比它更常用。
- 打开视图的真正实现留在主类（它才拿得到 `WorkspaceLeaf`），模块接口上新增
  `openView()` **转发**一次（`SyncModule.openView` → `deps.openSourceControlView()`）。
  设置页只调这一个方法，不去碰主类内部怎么开视图。
- 设置页那边写的是 `this.obsync.sync?.openView()`：真机上这一页只在桌面端渲染
  （`isSyncAvailable` 与模块一起为假），`?.` 只是不让将来把这条线变成地雷。

用例 3 条（`settingsTabRender.test.ts`）：操作组在最前且按钮文字对、点下去调到模块入口、
没有模块时点了不抛。测试替身 `createSyncStub` 加了 `viewOpened` 计数。

**⑩ 「定时同步」那一行的倒计时（2026-10-02）。**

用户的原话：**「如果仓库同步里的定时同步是开启的状态，请显示距离下次同步的倒计时」**。
显示在那一行的**名称后面**（`.obsync-badge.obsync-countdown`），每秒刷新。

**数据来源：`Automatics.nextRunAt()`（新加的）。** 定时器自己只知道「还有多久」，而界面要
「几点跑」需要一个绝对时刻 —— 两者差一个 `Date.now()`，而且那个时长还夹着 `MAX_TIMEOUT_MS`
的钳制，让界面自己去猜是猜不准的。所以 `schedule()` 里记下 `scheduledAt`，`stop()` 清掉，
`fire()` 一开始也清掉（那一表已经烧了）。三种情况没有值 → 徽标收起（文字清空 + CSS `:empty`）：
开关关着、策略是 `reset` 挂起、刚触发还没重新起表。

**「正在同步…」那一档。** 触发之后、重新起表之前，`nextRunAt()` 是 `undefined`，此时如果
还显示「还剩 0:00」就是错的 —— `service.isBusy` 为真时改说「正在同步…」。

**每秒刷新必须能停。** `display()` 每次重建整页 DOM、`hide()` 是用户关掉这一页，两处都调
`stopCountdowns()`：不清的话每重绘一次就多一个永不停止的 interval，而且它守着的是已经
脱离文档的节点（页面开着久了就是一个缓慢的泄漏）。徽标用**等宽数字**
（`font-variant-numeric: tabular-nums`）—— 否则每秒变一次的字宽会让整行跟着抖。

用例：`automatics.test.ts` 5 条（起表后有值且等于「现在 + 间隔」、停表后没有值、关掉/挂起
时没有值、跑完一轮重新记上、同步进行中那一刻没有值）＋ `settingsTabRender.test.ts` 5 条
（假时钟推着走：`1:30` → `1:29` → `0:29`、超过一小时带小时段、没有定时器时为空、
busy 时说「正在同步…」、`hide()` 之后不再刷新）。

**徽标的两处样式是看了截图之后返工过的**（用户：「这个提示文字的排版矮了标题一截，
而且不够醒目」）。都在 `.obsync-countdown` 里，也都在注释里写了实测数据：

- **对齐**：`.obsync-badge` 的 `vertical-align: middle` 对齐的是「基线 + 半个 x-height」，
  而药丸比标题行高（20.4px vs 16.9px）—— 用 CDP 量出来药丸文字比标题**低 1.9px**。
  改成 `vertical-align: baseline`：底边严格对齐（实测 0.02px 内），而且它按字体度量算，
  换主题不会偏。`line-height` 同时从 1.6 压到 1（1.6 是给列表里那些独立徽标的，
  在这一行会把整行撑高），厚度改由 `padding` 给。
- **醒目**：`.obsync-badge` 只给形状，颜色由变体类给 —— 没给变体就是一行普通文字。
  现在用强调色文字 + 强调色的淡底（`color-mix(... 18%, transparent)`，带一条
  `--background-modifier-border` 兜底给老 Chromium）。比填充式的 `.obsync-badge-update`
  （那个的语义是「有更新」）轻，但一眼能看出是活的信息。

**⑪ 「让 git 不再跟踪图片」（2026-10-02，用户要求：「我希望仓库同步不同步仓库里的图片，
因为图片已经交给图片同步干了」）。**

这一条不是一个开关，而是 git 的**两条固有语义**加一次提交 —— 用户问的正是「流程是什么」，
所以界面与文档都必须把三步讲出来：

1. 把「需要图片同步的文件夹」追加进 `.gitignore`（`features/sync/imagesIgnore.ts` 的
   `mergeIgnoreRules`：只追加缺的那些；判定时把 `/x`、`x`、`x/` 归一成同一件事；幂等是硬
   要求 —— 重复点、两台设备各点一次都会走到这里）；
2. `git rm -r --cached --ignore-unmatch -- <folders>` 把它们从**索引**里摘掉
   （`SimpleGitManager.untrack` → `SyncService.untrackPaths`，走串行队列）——
   **本地文件一个都不动**，但下次提交会记下一条删除；
3. 下一次同步把这条改动推到远端。

**为什么两步必须一起做**：`.gitignore` 只管**未跟踪**的文件，已提交过的照旧每次提交都带着。
只做第 1 步的结果是「用户以为搞定了，而图片还在同步」；只做第 2 步则会被下一次 `git add -A`
加回来。这条 git 语义是整个功能的由来，写在 `imagesIgnore.ts` 的文件头。

**三道闸**（设置页 `untrackImageFolders()`，任何一条不过都**拒绝执行**并说明原因）：

1. 图片文件夹得是**具体**的 —— 默认的 `[""]`（整个库）等于让 git 什么都不同步；
2. 图片同步得配好（`isConfigured()`）—— 否则图片从 git 里摘出去就没有第二个家；
3. **每一张都已在 R2 上**（`plan()` 里没有 `action === "upload"` 的条目；列不出清单也不放行）。

第 3 条是这个动作最要紧的安全网：别的设备拉取这次改动时，工作区里那些图片会被 git 删掉、
再由图片同步从 R2 补回来 —— 没上传的那些就真的没了。弹窗里还写明第二件事：
**已经写进历史的图片不会消失**（`.git` 里的旧对象还在，仓库体积不会变小 —— 那要在设置页
「清理」里做一次**深度清理**，见五点十五节），否则用户会把「仓库没变小」当成「没生效」。

弹窗（`ConfirmUntrackImagesModal`，`features/sync/ui/`）把三步、要停止跟踪的文件夹清单、
两条后果都列出来；**关掉 = 取消**（只有点「继续」才执行）—— 与 `ConfirmDeleteRemoteModal`
刻意相反：那一边 Esc 也必须表态，因为本地文件已经删了；这里什么都不做才是安全的那一侧。

用例：`imagesIgnore.test.ts` 11 条（纯函数：幂等、归一、通配符不误判、空串跳过）；
`simpleGitManager.test.ts` 2 条**真实仓库**用例（摘索引后本地文件仍在、提交后不再有待提交的
图片改动、`--ignore-unmatch` 不报错）；`syncService.test.ts` 2 条（走队列 / 空数组空操作）；
`settingsTabRender.test.ts` 8 条（那一行在场、三道闸各自的拒绝理由与数量、**确认前什么都不改**、
确认后写盘 + 摘索引 + 汇报数量、重复点一次只说明情况）。

**⑦ git 子进程的环境被「替换」而不是「继承」—— 一个真 bug（2026-10-02，用户贴来一条警告后查出来的）。**
用户贴的警告是：

```
plugin:ob-sync:6 [SyncHub] auto sync failed st: fatal: unable to access
'https://gitee.com/sofqi/plugin-test.git/': getaddrinfo() thread failed to start
```

顺着它查到插件自己身上：`simpleGit().env(name, value)` 的语义是**替换**子进程环境
（simple-git 把 `_executor.env` 原样交给 `spawn` 的 `env`，而 Node 的 `env` 是整份替换）。
我们原来只设两个非交互开关 —— 也就是说 git 子进程里**没有 PATH、没有代理变量、没有
USERPROFILE**。实测确认：`_executor.env` 就是那两个键。

**实测出来的后果**（这才是「真 bug」的部分）：

| | 修复前 | 修复后 |
| --- | --- | --- |
| `HTTPS_PROXY` 指向一个死端口 | **直连成功**（代理被无视） | 走代理失败 —— 说明 git 真的读到了 |

也就是说：**任何靠环境变量配置的代理，插件里的 git 都看不见** —— 而国内访问 GitHub 大多
靠它。症状正是最难查的那一类「终端里能推、插件里连不上」。顺带丢掉的还有 `PATH`
（凭据助手找不到）、`USERPROFILE`（全局 `~/.gitconfig` 不一定生效）、`TEMP`/`SystemRoot` 等。

**修法**：`gitChildEnv()` —— 父进程环境打底，再减掉两批、盖上我们的开关。

1. **`GIT_REPO_LOCATING_ENV`**（`GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` /
   `GIT_OBJECT_DIRECTORY` / `GIT_ALTERNATE_OBJECT_DIRECTORIES` / `GIT_COMMON_DIR`）：
   用户从终端启动 Obsidian 时可能带着它们，继承之后 git 会去操作**另一个仓库**，
   而且命令全都「成功」——静默操作错对象，必须切掉。
2. **`GIT_UNSAFE_ENV`**：simple-git 会**拒绝**这些变量并让整条命令失败，报错原文
   `Use of "GIT_PAGER" is not permitted without enabling allowUnsafePager`。依据是
   `@simple-git/argv-parser` 里那张「配置键 → allowUnsafe* 开关」的表，它**也校验子进程
   环境**；而 simple-git 3.36 没有暴露那个开关（产物里没有 `allowUnsafe*` 字样），
   所以唯一做法是不传。**这份清单是 2026-10-02 逐个实测出来的**，不是抄文档：
   `GIT_PAGER`/`PAGER`/`GIT_EDITOR`/`EDITOR`/`GIT_SEQUENCE_EDITOR`/`GIT_ASKPASS`/
   `SSH_ASKPASS`/`GIT_SSH`/`GIT_SSH_COMMAND`/`GIT_EXTERNAL_DIFF`/`GIT_TEMPLATE_DIR`/
   `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`/`GIT_PROXY_COMMAND`（同一批里
   `HTTPS_PROXY`/`ALL_PROXY`/`VISUAL`/`SSH_AUTH_SOCK`/`SSL_CERT_FILE` **放行**，必须留着）。
   其中 `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` 被减掉还有独立理由：覆盖它们会让插件里的
   git 与用户终端的 git 读**不是同一份**全局配置（身份、代理、凭据助手都可能不同）。

顺带加了 `GIT_MERGE_AUTOEDIT=no`：`git merge` 默认会为合并提交开编辑器，今天没出事只是因为
git 发现 stdin 不是终端就跳过了 —— 那是它的实现细节，不是我们的保证（见 `pull()` 里那句
裸的 `git.merge([status.tracking])`，没有 `-m`）。

**分类也补了一类**：`GitNetworkError`（`getaddrinfo` / 域名解析失败 / 连不上 / 连接重置 /
TLS 握手失败…）→ 文案把方向钉在「网络与代理」，并提示「代理靠环境变量的话重启一次 Obsidian」。
判据要**要求网络层措辞**：`unable to access` 单独不能当判据 —— Gitee 的「用户名不被支持」
原文就是 `fatal: unable to access …: The requested URL returned error: 403`，用它当判据会把
鉴权类错误一并吞掉（`gitErrorMapping.test.ts` 里那条逐字照抄的用例当场抓到了这个错）。

用例 +10：`gitErrorMapping.test.ts` 里网络分类 4 条（含「403 不能算网络问题」、
「网络失败要排在鉴权之前」）＋ `gitChildEnv` 4 条（打底、开关覆盖、两批删除、放行清单）；
`simpleGitManager.test.ts` 1 条**真实仓库**用例（`GIT_AUTHOR_NAME` 探针：环境里的身份
优先于仓库配置 —— 所以它证明的是「环境真的传进去了」，整条路不碰网络）。

**⑧ 定时同步连续失败 3 次时说一次（同一天，用户要求「加」）。**

`Automatics.fire()` 的失败分支原来只有 `logger.warn`——原设计的理由（不打扰、下一轮
自愈）对**单次**失败仍然成立，但**持续**失败只进日志就等于沉默：没人天天翻控制台。
用户那条 `[SyncHub] auto sync failed` 正是偶然看到的，而且当时已经重复了好几次。

现在的行为：`consecutiveFailures` 计数，**成功一次清零**；到第 3 次时 `warn` 一次，
文案是 `t.sync.autoSyncFailedMany(count, reason)`（reason 走 `notifier.describeError`，
所以已归类的错误给出中文可行动文案）；**阈值之后不再重复说**（`!== 阈值` 直接返回）。
阈值取 3：一次两次可能是抖动，连着三次说明不是抖动。

三个刻意的选择：① 用 `warn` 而不是 `error` —— 它**受「显示操作结果提示」设置控制**
（明确关掉提示的人不该被后台消息打扰），而 `error` 不受控；② 计数只存内存、不持久化 ——
重启本身已经是一次诊断动作，把旧计数背过重启只会让提示出现在一个已经恢复的环境里；
③ 文案末尾必须留「下一轮仍会自动重试」，否则这条提示读起来像「自动同步死了」。

用例 +3（`automatics.test.ts`）：前两次安静 / 第三次说一次且带次数与原因 / 之后不再刷屏；
成功一次即清零（隔一次成功要重新数三次）；失败后照常按周期继续（提示不能变成终止）。
替身也补了 `deps.notifier` 与 `deps.getT`（原来只有 `app`，走不到这条路径）。

**⑨ 面板认得出「嵌套仓库」行（2026-10-04，用户看着「更改」里的三条目录问「为什么没有具体改动却算进了更改里」）。**

那三条是他在库的 `.obsidian/plugins/` 里**就地开发**的插件目录，各自带一个 `.git`，而库把它们
记成了 gitlink（索引模式 `160000`）—— 实测他的库里有 **8 条**（6 个插件 + 2 个主题）。这种行有三个
反直觉之处，用户一个人猜不出来，所以面板必须当场说清并给出口：

1. **暂存不掉**：实测点「全部暂存」（`git add -A`）之后那三条**原样留在「更改」里**、也没进暂存区 ——
   指针没变，git 记不下任何东西，于是它们**永远消不掉**；
2. **没有文件级差异**：实测 `git diff -- <那个路径>` 输出为空（索引里只有指针，没有文件内容）；
3. **会制造噪音**：嵌套仓库 HEAD 一动，库就记一条「指针挪了」——他的库里给 Glimpse 记了 4 次，
   最近一次就是插件的 `vault backup: …` 模板。

**先回答了两个疑问，都是实测**：① 库同步**从来没改到它们的文件** —— 索引里存的是指针
（`git ls-tree -r HEAD -- .obsidian/plugins/Glimpse` 只有那一行 `160000`），**没有内容**；
② 库这边的 `reset --hard` **进不到嵌套仓库里**（临时仓库里造了同构场景：回退指针后嵌套仓库的
HEAD、已提交文件、**未提交的 `wip.md`** 全都在），他的 `submodule.recurse` 也没设（默认 `false`），
而且全仓库搜不到 `git clean`。

**实现**（`SimpleGitManager.nestedRepoPaths` + `changeRows` + `SourceControlView`）：

- 识别：`git ls-files -s -z -- <变了的那些路径>`，看模式位是不是 `160000` —— **问 git 而不是自己看
  目录里有没有 `.git`**（索引里记着 gitlink 而目录已被删掉也是同一件事，那只有索引知道）。只问
  **变了的路径**，而且为空时不碰 git。
- 放在 `SyncService.readStatus()` 里（状态快照多一个 `nestedRepos` 字段）：视图只管画，git 只在这
  一处碰 —— 与「面板不自己读状态」那条既有约定一致。
- 呈现：徽标 + 列表上方一句解释 + **换掉那三个按钮**。对 gitlink，`file-diff`（输出为空）与
  `plus`（暂存不下）都是**点了没反应**的按钮，留着只会让人以为插件坏了 —— 所以嵌套仓库行只留
  一个 `unlink`「不再跟踪」。
- 动作：`SyncService.untrackAndIgnore(paths)` = 摘索引 + 写 `.gitignore`（**必须一起做**：
  只摘索引的话下一轮 `git add -A` 会把指针加回来）。不弹确认框 —— 这个动作不丢任何东西
  （gitlink 里从来没有内容，嵌套仓库自己的历史与工作区都在），而且 `git add` 随时能加回来。

用例 +6：`simpleGitManager.test.ts` 2 条**真实仓库**用例（认得出嵌套仓库且**不误报普通文件**；
摘索引之后目录、`.git`、**未提交的代码**都还在）；`sourceControlView.test.ts` 3 条（徽标 + 解释 +
只剩一个按钮、点它走 `untrackAndIgnore` 并报成功、普通文件行不受影响）；`changeRows` 那一条在
既有用例里覆盖。

**⑩ 面板工具栏上也显示「下次同步」倒计时（2026-10-04，用户要求「当开启定时同步时，也应该在仓库同步标签页下提示距离下一次同步的倒计时」）。**

设置页那一行早就有这个徽标（⑧ 之前的 ⑩ 那节），但**面板**——用户盯着同步状态的地方——没有。
两处必须是**同一份数据、同一套写法**，所以：

- 写法抽成 `features/sync/countdown.ts` 的 `formatCountdown`（原来是 `settingsTab` 里的模块级
  函数），两处共用 —— 各写一份的话同一个时刻会显示成两种样子，用户一眼就会看到；
- 数据仍是 `Automatics.nextRunAt()`：新增视图依赖 `nextRunAt: () => sync.automatics.nextRunAt()`
  （`main.ts` 装配处接上）。三种情形为 `undefined`（开关关着 / 策略 reset 挂起 / 刚触发还没重新
  起表）时**连元素都不创建**，而不是显示一个假的倒计时；
- **只改文字、不重绘**：面板一次重绘要跑「分支 / 远端 / 体积 / 历史」好几条 git 命令，每秒重绘
  等于每秒几条子进程。所以与设置页同一个手法 —— 只更新一个 `span` 的文本；
- 表在**每次重绘时重建**、并在 `onClose()` 里停掉（`stopCountdown()`）：不重建的话每次重绘都会
  再起一个永不停止的表，它们守着的还是已经脱离文档的节点 —— 面板长时间开着就是缓慢泄漏。

用例 +3（`sourceControlView.test.ts`）：开了定时同步时工具栏有徽标且每秒自己走（`3:00` → `2:59`，
`setBusy(true)` 时改说「正在同步…」）；`undefined` 时**连元素都不创建**；`onClose()` 之后
`vi.getTimerCount()` 为 0（表真的停了）。计时用例只假造 `Date` / `setInterval` / `clearInterval`
—— 连 `setTimeout` 一起假造的话 `settle()` 等不到那几个宏任务，首次渲染永远跑不完。

**⑪ 面板用标签组分开「更改 / 最近提交」（2026-10-04，用户要求「各种列表可以以标签组切换的方式展示，可以避免冗长列表下需要频繁滚动」）。**

此前两者上下排在同一条滚动列里：改动一多，想看历史得先把改动滚过去，看完历史想点「暂存」又得
滚回来。它们本来就是**两个问题**（「这一轮要提交什么」与「之前提交过什么」），各占一屏才对。

几个刻意的决定：

- **两个面板都渲染、只显示当前那个**（`.obsync-view-tabpanel` + `is-active`）：这样每轮重绘的
  git 调用与以前**完全一致**（`git log` 照旧每次渲染跑一次），而隐藏的那个不占高度 ——
  既解决了滚动，又不动既有的性能约定（面板的「一次动作 = 一次重绘」那条测试原样通过）。
- **切标签不重绘**：只换两个面板与按钮的类名。重绘会白跑分支/远端/体积/历史那几条命令，
  而用户只是换看了一眼。用例直接钉了这一点（切完 `renderCount()` 不变）。
- **当前标签记在实例上**：面板会因为状态推送频繁重绘，用户刚切到「最近提交」就被踢回
  「更改」是很烦的（与设置页 `activeTab` 同一个理由）。
- **冲突区留在标签之外**（`renderConflicts` 仍挂在 `contentEl` 上）：它是「现在就得处理」的状态，
  藏进标签页意味着用户可能看不到 —— 那是这个面板最不能出的事。用例钉了「冲突 Setting 的容器
  不是任何一个面板」。
- 样式只写一份：`.obsync-tabs` / `.obsync-tab` 那一族**从 `.obsync-settings` 作用域里提出来**
  （与之前 `.obsync-steps` 同一个手法），设置页与面板共用同一套观感；面板只加
  `.obsync-view-tabs`（收一点上下留白，侧边栏垂直空间稀缺）。

用例 +4（`sourceControlView.test.ts`）：默认停在「更改」且两个面板都渲染、只有一个是 `is-active`；
点「最近提交」只换可见性且 `renderCount()` 不变；切到的标签**跨重绘保持**（状态推送不会踢回去）；
冲突区不在任何一个面板里。另外把两条历史用例改成**递归**查 `.obsync-history`—— 它现在嵌在标签
面板里，不再是 `contentEl` 的直接子节点。

**⑫ 面板顶部重排：远端改成就地输入框 + 状态栏并进「更改」页（2026-10-04，用户要求）。**

用户的原话：「将仓库大小、待提交改动那栏合并进『更改』标签页，这样就节省了『没有需要提交的修改。』
的文本。『与远端一致』的提示也合并进来。另外，远端那一栏不必设置一个编辑远端的按钮，直接以
输入框的样式展示即可，省了一步打开模态框编辑的步骤，远端地址的标题和输入框要在同一行且输入框
的宽度要自适应。」

三处改动：

1. **「与远端一致」+「仓库大小 / 待提交改动」搬进「更改」标签页**：它们回答的正是那一页的问题
   （我现在处于什么状态、这一轮要提交什么）。搬进来之后**列表为空时不再另写一句**
   「没有需要提交的更改。」—— 右边那一栏就是那句话，这正是用户说的「节省了文本文本」。
2. **远端地址改成就地可改的输入框**：标题与输入框同一行，控件 `flex: 1 1 auto; min-width: 0`
   吃满剩余宽度（`.obsync-remote-row` / `.obsync-remote-input`，见 styles.css）；
   默认 `Setting` 那种「标题一列 + 控件固定宽度」在侧边栏里只能看见地址开头一截。
3. **保存时机是失焦 / 回车**，不是 `onChange`（那是**每敲一个字**都回调，会一次次写
   `.git/config` 并重算鉴权）。校验用与弹窗**同一个** `classifyRemoteUrl`：明显写错的输入
   拦住 + 提示 + **把框恢复原样**（「以为存下去了」比「没存」更糟）；带凭据 / 平台认不出照弹窗
   的规矩**放行但提示**；成功后 `refresh({ force: true })` 让领先/落后按新远端重算。
   回显仍**脱敏**（这一行会显示在屏幕上），要改就整段替换。

顺带做了一次整理：`classifyRemoteUrl` 从 `ui/EditRemoteModal.ts` 搬到
**`features/sync/remoteUrl.ts`**（判定与渲染分开，输入框与弹窗共用一份顺序敏感的判断，不再复制）。
弹窗**保留** —— 命令面板里的「编辑远端地址」还在用它，删掉是凭空少一个功能；只是面板那一行不再
需要它。它顺带让 `sync.actEditRemote` 那个按钮提示成了孤儿键，已删除（第 3 项自查当场抓到了）。

用例 +3（`sourceControlView.test.ts`）：失焦保存新地址（走 `git.setRemoteUrl` + 强制刷新）；
没改动就什么都不做（脱敏后的回显与真实值不同，但也不该被当成改动）；明显写错的输入被拦住、
说一句、并把框恢复成原样。另外三条既有用例按新结构改了断言（状态摘要在标签页里要**递归**找、
远端脱敏看的是输入框的**值**、空列表那句改看「待提交改动」那一栏的 `desc`）。

**⑬ 两处观感修正（同一天，用户看完截图提的）：**

1. **`remoteLabel` 从「远端」改名「远端地址」**（en: `Remote URL`）：那一格里现在是**可编辑的
   地址输入框**，「远端」两个字说不清它既显示又可改。这个键只被面板用（诊断那边用自己的键），
   所以直接改文案，不必新增键。
2. **标题与输入框垂直居中**：面板里 `.obsync-metrics` 那一族行是 `align-items: flex-start`
   （多行说明要顶对齐），远端这一行继承了它，于是「顶部对齐」（用户原话：「不美观」）。
   给 `.obsync-remote-row` 单独写 `align-items: center` —— 这一行两边都只有一行文字。
3. **面板工具栏的倒计时改成与设置页同一套**：`.obsync-countdown` 那几条**从 `.obsync-settings`
   作用域里提出来**（与 `.obsync-tabs`、`.obsync-steps` 同一个手法）。此前面板里的徽标只吃到
   `.obsync-badge` 的**形状**，没有强调色 —— 用户看到的是一行灰字，于是说「下次同步也应该做成
   像设置页一样的显眼一点」。抽出之后两处是同一份定义，以后也不会再分叉。

**⑭ 更改列表的格式筛选 + 去掉历史页里重复的标题（2026-10-04，用户要求）。**

- **「最近提交」标签页里那行同名标题删掉**：标签上已经写着「最近提交」，页内再来一行纯属多余
  （用户原话：「有点多余」）。侧边栏的垂直空间本来就稀缺。
- **更改列表按格式筛选**：原话「我希望更改列表提供修改文件的格式筛选，尤其是 md 格式的文件，
  因为笔记同步主要还是同步的 md 文档」。实现放在 `changeRows.ts` 的三个**纯函数**里
  （`extensionOf` / `isMarkdown` / `matchesFilter` / `changeFilterOptions`），面板只负责画下拉：
  - 形状用**下拉**而不是一排按钮 —— 侧边栏窄，而选项是**这次改动里真实出现的格式**；
  - `全部 (N)` / `Markdown (n)`（`md` 与 `markdown` 合并算一条）/ 其余扩展名各一条（按数量倒序，
    同数量按字母序 —— 顺序必须稳定，不能随 Map 插入顺序抖）/ `无扩展名 (n)`；
  - 筛选状态记在实例上（同 `activeTab`）：面板会被状态推送频繁重绘，用户刚筛好的视图不该被清掉；
  - **选项消失时自动回落到「全部」**：笔记提交完那一轮下拉里不再有 Markdown，若还停在 `md` 上
    列表会一片空白，而用户看不出为什么；
  - 筛选**只影响列表**：「待提交改动」那一栏始终是总数（那是「这一轮要提交多少」的答案）；
  - 扩展名判定有两条刻意的规矩：开头的点不算扩展名（`.gitignore` 不是「gitignore 格式」）、
    目录里的点不是分隔符（`2026.10/daily` 没有扩展名）。

用例 +9：`changeRows.test.ts` +5（`extensionOf` 的三种边界、`isMarkdown`、`matchesFilter`、
选项生成与排序、没有笔记时不出现 Markdown 选项）；`sourceControlView.test.ts` +5
（选项只有真实出现的格式且默认「全部」、选 Markdown 只剩笔记、选扩展名且**跨重绘保持**、
格式消失后回落「全部」、待提交栏始终是总数）与 +1（历史页不再有同名标题）。

**两个测试基建上的坑**（都踩到了，记下来省下一次）：

1. `createdSettings` 是**累计**的，重绘之后按类名取行会把上一轮的行也捞进来 —— 筛选用例必须
   按「行挂在哪个容器里」过滤，只认当前 DOM 树里那些 `.obsync-change-list`；
2. 替身的 `DropdownComponent` 用 **`select(value)`** 驱动（`change` 是 `onChange`，不是这个），
   而且筛选要**等一轮重绘**（`await h.settle()`）才看得到结果。

**⑮ 远端地址也放进设置页，排在「连接测试」之前（2026-10-04，用户要求：「远端地址应该在仓库同步的设置页中设置才对，移到测试连接之前展示」）。**

位置的理由写进注释了：**先填地址，再测连接** —— 连接测试测的正是这个地址，两行挨着读起来
才是同一件事的两步。放在「操作（打开面板）」之后、「连接测试」之前。

行为与面板顶部那一行**完全一致**，所以抽成了 `features/sync/remoteEditor.ts` 的
`bindRemoteInput(input, host)`：脱敏回显、失焦/回车才保存、明显写错的输入拦住并把框恢复原样、
成功后 `refresh({ force: true })`。两处各写一份的话迟早分叉，而分叉的表现是
「同一个地址在一处存下去了、在另一处没有」—— 极难排查。视图里那份 `saveRemote` 已删掉
（净减 11 行），设置页与面板现在共用同一份。命令面板里的「编辑远端地址」弹窗仍在
（它多给一步校验提示），走同一个 `classifyRemoteUrl`。

**踩到一个 DOM 顺序的坑**：`git.getRemoteUrl()` 是异步的，若把「建行」也放进 `await` 之后，
这一行会被追加到**整页最后**（实测跑到「忽略规则」后面，用例当场抓到 `indexOf` 是 11 而不是 3）。
所以：**行同步建出来、地址异步填进去** —— 位置由同步的那一步决定，值与行为在 promise 回来后再装上。

用例 +3（`settingsTabRender.test.ts`）：排在「连接测试」之前且在「打开面板」之后；就地改地址
（失焦保存 + 强制刷新）；带令牌的地址回显脱敏。替身补了 `git.getRemoteUrl` / `git.setRemoteUrl` /
`service.refresh`（前两个原来没有，第三个数次数）。

**⑯ 设置页顶部重排为一屏：远端地址 + 打开面板合并、git 路径上移（2026-10-04，用户要求）。**

用户的原话：「侧边栏仓库同步标签页的远端地址设置项可以删除了。打开仓库同步面板按钮可以放到
远端地址输入框后面，合并成一行展示。另外，git 可执行文件路径应该移上来，在远端地址设置项后面
展示，保证连接测试按钮之前的设置项都是测试成功的充要条件设置项。」

三件事，外加一条**结构约定**（最后那句是本轮最有价值的一条）：

1. **面板顶部那份远端地址删掉**：配置归设置页（上一轮刚把它加进设置页），面板不再显示远端 ——
   于是 `renderRepo` 整个方法、`safeRemoteUrl()` 与视图里的 `bindRemoteInput` 导入一起删掉，
   `render()` 少一次 `getRemoteUrl()`（性能用例的期望值从 4 条 git 调用变成 3 条，顺带钉住了
   「渲染不再多问一次远端」）。
2. **「打开仓库同步面板」并进远端地址那一行**：原来那个只剩一个按钮的「操作」一节占一张卡片加
   一行标题，而这一页正在减少卡片数；按钮的说明文字改挂 tooltip（那一行放不下两段描述），
   `settings.sync.actionsHeading` 随之删除。
3. **git 可执行文件路径提到「连接测试」之前**（从无标题设置组里抽成 `renderGitPathRow()`，
   连同「git 从哪儿来」的下载链接）。
4. **结构约定（写进代码与用例）**：**「连接测试」之前的每一项都必须是「测试能通过」的充要条件**
   —— 连接测试查的就是「git 能不能跑」「远端能不能连」这两件事。用例直接断言
   `createdSettings` 在 `diagnoseHeading` 之前**恰好只有** `[远端地址, git 路径]` 两项，
   以后谁再往前面塞东西都会红。

**踩到的两个坑**：

- `git.getRemoteUrl()` 是异步的，若把「建行」也放进 `await` 之后，这一行会被追加到整页最后
  （实测跑到「忽略规则」后面）——**行同步建、值异步填**（`renderGitPathRow` 是同步的，
  远端那一行也改成了同步建 + promise 回填）；
- 「回车 = 失焦」在真机与替身里语义不同：真机 `blur()` 会再触发一次 blur 监听（同一件事进两次），
  替身的 `blur()` 是空实现（于是回车什么都不做）。最后写成「回车直接存一次 + 顺手 `blur()`」，
  并用一个 `saving` 标志挡住重入 —— 两条路径都安全。规则本身抽到
  `tests/features/remoteEditor.test.ts`（+8 条）单独测，不再挂在某个界面上。

用例：`settingsTabRender.test.ts` 改 3 条（分组归属：git 路径不再属于「怎么同步」那一组；
「操作」一节消失、按钮并入远端行且带 tooltip；点按钮仍调到 `openView`）+ 新增 1 条（结构约定）；
`sourceControlView.test.ts` 删掉 4 条远端用例（规则搬到 `remoteEditor.test.ts` +8 条）并改
「onOpen 一次 git 都不跑」的期望值。

**⑰ 「不捆绑 git」并进 PATH 那句后面 + 标签栏照 MDRazor 重做（2026-10-04，用户要求）。**

1. **git 路径那一行的描述合成一段**：用户原话「SyncHub 不捆绑 git 的那句提示，放到留空使用系统
   PATH 那条提示后面展示」。两句本来就是同一件事的两半（不填就用系统的 / 系统没有去哪儿装），
   分成两段反而让下载提示看起来像**另一项设置**。现在 `setDesc(gitPathDesc + " " + gitPathDownload)`
   并把那个可点的链接接在**描述末尾**（`row.descEl.createEl("a", …)`）；单独那个
   `.obsync-git-download` 段落与它的 CSS 一起删掉（自查当场抓到「定义了没用到」）。
2. **标签栏照 MDRazor 设置页那一条重做**（用户原话「无论是设置页的标签组样式还是侧边栏仓库同步
   标签组样式都太丑陋，可以参考一下 MDRazor 的设置页标签组样式」）：改成**贴着内容区的文件夹式
   标签** —— 圆角只在上两个角、被选中的那个与下面那条分隔线咬合（`margin-bottom: -1px` +
   去掉自己的下边框）、背景用 `--background-secondary`、文字用 `--text-normal` 加粗，
   而不是原来那种「四角胶囊 + 悬停底色 + 强调色文字」。`.obsync-tabs` / `.obsync-tab` 一份定义
   两处共用（设置页与面板），面板只把内边距与上下留白收一点（`.obsync-view-tabs`）。
   改完用 `.probe/settings-preview` 那套真 DOM 预览截图核对过（见下）。

**这一轮抓到一个真机才会犯的错，值得记住**：`Setting.setClass()` 走的是 `classList.add`，
**一次只能给一个类名** —— 我写成 `setClass("obsync-stacked obsync-git-path")`，在真机上直接抛
`InvalidCharacterError: The token provided contains HTML space characters`，整页设置渲染不出来。
`pnpm test` 全绿、`typecheck` 全过，是**预览截图**当场把它变成一行红字暴露出来的
（替身原来把整串原样存下来，所以单测抓不到）。两处都修了：

- 代码：第二个类单独加（`row.settingEl.addClass("obsync-git-path")`）；
- **替身**（`tests/stubs/obsidian.ts`）：`setClass` 现在收到带空格的就照真机那样抛错，
  下次同样的错在单测里就会红 —— 这条规则不该只有真机知道。
  顺手把 `src` 扫了一遍：没有别的 `setClass`/`addClass` 传多类名的地方。

**标签栏第二版（同一天，用户拿两张截图对比之后）**：第一版虽然照 MDRazor 写了
「只有选中的那个像卡片」，但实际渲染出来**每个标签都带一圈边框和浅底** —— 因为这些标签是
`<button>`，Obsidian 的 app.css 里有 `.vertical-tab-content button` 这类「一个类 + 元素」的
规则（边框 + `--interactive-normal` 底色）。我原来写的是单类选择器 `.obsync-tab`（0-1-0），
**一个都没盖住**（对方 0-1-1）。

改成 `.obsync-tabs .obsync-tab`（0-2-0）之后才真正变成 MDRazor 那个样子：只有当前那一个是
一张贴着内容区的卡片，其余是纯文字（`background: transparent` + `border: 1px solid transparent`）。
**这条只有真 DOM 预览能发现** —— 单测里没有 app.css，CSS 又不会报错，`pnpm test` 一路绿。

**⑱ 差异从弹窗改成主工作区标签页（2026-10-04，用户要求：「点击查看diff页面时，应该以标签页形式
打开而不是模态框，模态框太小了」）。**

`DiffModal`（207 行）→ `DiffView`（`ItemView`，`obsync-diff-view`）。渲染逻辑**一字未改**地搬过去
（节标题、行号两列、增删标记、二进制/纯重命名/超大/截断各自的说明），改的是外壳与它的生命周期：

- **状态必须可序列化**：`{ kind, target, label }` —— Obsidian 会把视图状态写进用户的
  `workspace.json`，重启后按它恢复标签页。所以**不再传 `load` 回调**，内容由 `service.fileDiff()`
  / `service.commitDiff()` 现拉；`label` 只为提交差异存在（标题用「短 hash + 信息第一行」，
  只写 hash 认不出是哪一条）。
- **复用一个标签**（`openDiff()`：已有就 `setViewState` + `revealLeaf`，没有才 `getLeaf("tab")`）：
  连点五处改动不该开出五个标签。用 `"tab"` 而不是 `getLeaf(false)` 是因为后者会**占用当前活动的
  标签页**，把用户正在看的笔记顶掉 —— 「看差异」是旁路动作，不该有这种副作用。
- **`setState` 只在已经开着时重绘**：首次挂载 Obsidian 是 `setState` → `onOpen` 两步走，两边都画
  等于同一次 `git diff` 跑两遍；而复用一个已打开的标签时 Obsidian **只再调一次 `setState`**，
  那时必须画（否则内容还是上一份）。这一条是被两条挂死的用例逼出来的（都卡在 30s 超时上）。
- **文件差异订阅 `service.onStatusChange`**（提交差异不订阅）：标签页是常驻的，库外编辑器改了
  文件之后快照就过期了。订阅在 `onClose` 里退掉。
- `leaf.updateHeader()` 没写进 1.8.7 的公开 d.ts，所以**可选调用**（没有它只是标题旧一点）；
  `leaf` 本身也判空（测试里构造视图给的是 `null`）。
- CSS：删掉「把弹窗撑到 1080px」那条（现在不需要了），换成 `.obsync-diff-view` 的内边距 +
  横向滚动。**旧类名不能在注释里写全**：自查脚本扫的是原始 `styles.css`，注释里出现
  `.obsync-xxx` 会被算成「定义了但没用到」（这次就中了）。

用例：`diffModal.test.ts` → `diffView.test.ts`（16 条，渲染那 11 条原样搬过来，另有标签页特有的
5 条：可序列化状态与标题、没有目标时说一句、文件差异跟着状态刷新、读取中、关掉之后不写回）；
`sourceControlView.test.ts` 两条改成「面板只交请求」——`diff:file:a.md` /
`diff:commit:<hash>:0123456  同步：1 个文件`，并断言 `openedModals` 为空（不再有弹窗）。
顺带给测试替身的 `ItemView` 补上 `setState`/`getState`（原来只有 `Modal` 有生命周期方法，
`DiffView` 一构造就 `setState is not a function`）。

**⑲ diff 容器不再限高（2026-10-04 第三次反馈：「边框的高度被限制了，以至于没有充分利用标签页的空间，出现了滚动轴」）。**

`.obsync-diff-body` 上那条 `max-height: 68vh` 是**弹窗时代**留下的（弹窗不能比屏幕高）。
改成标签页之后它变成了「内容框只占屏幕七成高、下面空一片，而框里还有一条自己的滚动轴」——
正是截图里那样。现在：去掉 `max-height` 与 `overflow`，高度由内容决定，**整个标签页滚一条轴**
（和读笔记一样）；横向溢出仍由 `.obsync-diff-view` 的 `overflow-x: auto` 接住
（`white-space: pre` 的长行，比如打包后的 `main.js`）。

**这条的验证方式值得抄下来**：样式类改动 `pnpm test` 是验不了的（单测里没有布局、没有 app.css），
所以加了一张探针页 `.probe/settings-preview/diff-page.html` —— 链接真实的 `app.css` /
`theme.css` / `styles.css`，结构照主工作区，底部克隆 200 行 diff，再用 `eval.mjs` 量：

| | 框高 | 框内滚动轴 | 计算样式 max-height |
| --- | --- | --- | --- |
| 旧样式（内联回去复现） | 1020px（正好 68vh） | **有** | 68vh |
| 现在 | 3816px（跟着内容长） | 无 | none |

也就是说探针**能复现旧 bug、也能证明修好了** —— 不是摆样子。以后动 diff 的样式先跑它。

**⑳ 双栏对照视图模式（2026-10-04，用户要求「类似 vscode 那种双栏对照的视图模式」）。**

**配对逻辑单独一个纯函数**（`features/sync/sideBySide.ts` 的 `sideBySideRows`）：`git diff` 给的
是一列行，并排显示要先决定「谁和谁同处一行」—— 上下文行左右各一份；一段连续的删/增按**序号配对**，
短的那边补空单元格（删 2 增 3 → 3 行，第三行只有右栏）。这段逻辑与 DOM 无关，所以 11 条用例
（`sideBySide.test.ts`）把它钉死，渲染那半边只管画。`\ No newline` 两边都显示 —— 它说的是两个
文件各自的性质，放一边会让人以为只跟那一边有关。

渲染用**四列网格**（旧行号 / 旧内容 / 新行号 / 新内容）而不是「两列里各塞一个小网格」：四列时
两侧行号列宽天然一致（`auto` 列），不会错位。双栏模式**允许折行**（`pre-wrap` +
`overflow-wrap: anywhere`）—— 栏宽只有一半，打包后的 `main.js` 那种超长行不折没法看；折行不破坏
对齐，每行是网格里的一行、两侧各行其高。补出来的空单元格画一条斜纹，表示「这一边没有对应的行」。

模式开关是**两个按钮**（`统一` / `双栏对照`）而不是下拉：只有两个选项，而这是看的时候随手切的
东西——下拉要多点一次才知道另一个长什么样。选择器写成 `.obsync-diff-modes .obsync-diff-mode`
（两个类），理由同标签栏那条（`<button>` 会被 app.css 的基础样式套上边框与底色）。

模式**跟着视图状态持久化**（`state.mode`）：用户选了双栏，关掉标签页再打开、甚至重启 Obsidian
都还是双栏——这是偏好，不是一次性的；缺省（老状态）走统一视图。切换**不重拉差异**（内容已在手上，
只重画；代价是重拉一次 `git diff`，比在视图里多养一份缓存划算）。

用例 +15：`sideBySide.test.ts` 11 条（上下文、纯删、纯增、成对、删多增多、增少删多、删增交错、
分段不串行、行号各取一边、`\ No newline`、空输入）；`diffView.test.ts` +4（默认统一、切到双栏后
左右行号各取新旧、模式跨恢复保持、切回统一）。样式用同一张探针页（`diff-page.html`）截图核对过：
删除在左、新增在右、只有右栏的那一行左边是空格子、超长行在自己的半栏里折行。

**㉑ 两个前提项合成一张卡片 + 「不捆绑 git」换行（2026-10-04，用户看截图后提的两条）。**

1. **「这两个设置项之间用分割线隔开就好，不用分成两个圆角背景」**：远端地址与 git 路径原来各自
   `new Setting(this.containerEl)` —— 在 Obsidian 里那等于**各自一张卡片**（一个 `.setting-item`
   一块圆角底），所以看起来是两块。现在两行放进**同一个设置组**
   （`const prerequisites = this.openGroup()` → 两行都建在它里面）：一张卡片、两行之间一条
   分割线 —— 这正是 Obsidian 原生的「同组设置项」形态。两个渲染方法因此改成接收容器参数。
   分组归属的用例原来断言 git 路径**不**属于「怎么同步」那一组，现在它属于这个新组，断言依然成立。
2. **「SyncHub 不捆绑 git 那句应该换行显示」**：上一轮把两句并成了同一段描述，但同段里不换行会
   被读成半句话没说完。现在 `setDesc(PATH 那句)` 之后往 `descEl` 里插一个 `<br>`，再接下载那句与
   链接 —— 同一段、两行。用例改成断言 `desc` 只剩 PATH 那句、`descEl` 第一个子节点是 `<br>`、
   第二个是下载那句、然后是链接。

**㉒ 工具条重排 + 按钮去阴影（2026-10-04，用户拿 ziping 插件的截图对比）。**

三条要求：参考 ziping 的按钮样式**去掉阴影**；**分支移到三个按钮前面**；**刷新移到立即同步前面**。
新顺序：

```
[分支▾] [提交] [拉取] [推送] [刷新] ……… [立即同步] (下次同步 3:00)
```

- **分支在最前**：它决定那三个动作作用在哪条分支上，是前提 —— 「先看在哪、再决定做什么」。
- **刷新紧挨立即同步前面**：两个都是「让面板动一下」的入口，挨着好找；立即同步仍靠右
  （`margin-left: auto`），它是「一个顶三个」的那一下。
- **去阴影**照 [ziping 的 CSS](F:\_Workspace\Plugin-Test\.obsidian\plugins\ziping\styles.css#L21-L28)：
  `box-shadow: none` + `border: 1px solid var(--background-modifier-border)` + 悬停换
  `--background-secondary`。选择器写成 `.obsync-actions button, .obsync-actions select`
  （两个类）：这些是 `<button>` / `<select>`，单类压不过 app.css 里那类「一个类 + 元素」的规则
  —— 标签栏那次就是这么栽的。

用例改 3 条：工具条顺序（含分支在首位、刷新在立即同步前）、「不是仓库时没有分支下拉」那条改成
**按图标找刷新**（原来按位置取最后一个）、「刷新强制真读一次」也同样按图标找而不是按位置 ——
位置被用户改过两次，以后再改就不会连带红一片。

**㉓ 刷新按钮从图标改成文字（2026-10-04，用户要求「和前面三个按钮一样的样式展示」）。**

`addExtraButton` + `setIcon("refresh-cw")` → `addButton` + `setButtonText(t.sync.actRefresh)`。
图标按钮在侧边栏里容易与「工具」混在一起，而这一排本来就是文字动作（提交 / 拉取 / 推送），
刷新跟在它们后面自然也该是文字。

用例那两处「按图标找刷新」随之改成**按文字找**（`button.text === zhCN.sync.actRefresh`）——
上一轮刚把按位置的写法改掉，这一轮形态一变只需改一处判断，正是那一轮留下的余地。
顺序断言里的 `"<icon:refresh-cw>"` 换成 `zhCN.sync.actRefresh`。

**㉔ 下次同步胶囊下移 + 「与远端一致」文案修正（2026-10-04，用户两条反馈）。**

1. **胶囊从工具栏下移到状态摘要那一行**（用户原话：「将下次同步胶囊下移到『与远端一致』同一行
   展示」）：两者都是「我现在处于什么状态」，摆在一行才是同一件事；留在工具栏上时它挤在动作按钮
   中间，看不出它说的是状态。实现上把 `renderCountdown(row: Setting)` 改成
   `renderCountdown(parent: HTMLElement)`（原来是往 `row.controlEl` 里塞），调用点从
   `renderToolbar` 移到 `renderChanges` 里新建的 `.obsync-state-row`（flex + 允许换行）。
   倒计时的「每次重绘重建、`onClose` 停表」那套不变 —— 位置换了，生命周期没换。
2. **「与远端一致」在有未提交改动时文案不准**（用户原话：「只是颜色不同，显示的文本依旧是
   『与远端一致』，文案描述并不准确」）：`ahead = behind = 0` 只说明**已提交的部分**对齐了，
   工作区可能还躺着一堆改动，那时说「与远端一致」会让人以为可以关电脑了。`remoteStateText`
   现在分两档：干净 → `inSyncWithRemote`；有改动 → 新增的 `inSyncWithPendingChanges`
   （「与远端一致，但有未提交的改动」，**不标绿**）。判据仍与 `isFullyInSync` 同一套
   （`changeRows` 为空才算干净），所以状态栏那个 `✓`、同步结束提示、这一行三处一致。

用例 +3（`sourceControlView.test.ts`）：干净时是「与远端一致」且标绿；有未提交改动时是新文案
且**不**标绿；领先/落后时照旧说领先落后。倒计时那两条改成从**当前视图的内容树**里找徽标
（原来从工具栏里找）—— 位置变了，断言跟着变，其余不动。

**㉕ 工具条间隙照 ziping 收紧 + 修好「立即同步」的悬停（2026-10-04，用户又拿 ziping 对比）。**

两条都出在上一轮那个「去阴影 + 悬停换底色」的块上：

1. **间隙**：`.obsync-actions .setting-item-control` 的 `gap` 从 `--size-4-2`(8px) 收到
   `--size-4-1`(4px) —— ziping 的按钮排就是 `gap: 4px`。侧边栏窄，六个控件一排时这 4px×5
   是实打实的宽度。
2. **悬停**：上一轮那条 `.obsync-actions button:hover { background-color: var(--background-secondary) }`
   **把主按钮也一起改了** —— 「立即同步」是 `setCta()` 出来的（强调色填充 + 白字），换成浅底之后
   变成「浅底 + 白字」，整颗糊成一片（就是用户截图里那个样子）。现在用
   `:hover:not(.mod-cta)` 把它排除，另给 `button.mod-cta:hover` 用
   `--interactive-accent-hover`（深一档的强调色）并去掉它那圈边框。

**这次的验证办法**：悬停态单测看不见、`getComputedStyle` 也不反映 `:hover`，所以加了
`panel-toolbar.html` + `hover-check.mjs`：CDP **真的派发一次鼠标移动**再读计算样式。实测

| | 底色 | 文字色 |
| --- | --- | --- |
| 主按钮未悬停 | `rgb(152,115,247)`（强调色） | 白 |
| 主按钮悬停 | `rgb(166,138,249)`（强调色系，仍可读） | 白 |
| 普通按钮悬停 | `rgb(246,246,246)`（`--background-secondary`） | 深灰 |

顺带踩到一个**探针自身的坑**：Obsidian 的 `--interactive-accent` 那批变量定义在主题类下面，
探针页少了 `<html class="theme-light">` 时它们全是空的，量出来「主按钮底色 = 透明」——
看着像产品 bug，其实是探针少一行。这条写进 `.probe/settings-preview/README.md` 了。

**㉖ 工具条 padding 收紧 + 摘要文字与胶囊对齐（2026-10-04，用户看 devtools 截图提的两条）。**

1. **`.obsync-actions` 的 padding 从 16px 收到 8px**：用户的原话是「按钮栏 padding 有些大了，
   以至于侧边栏窄一点就不得不自适应换行」。六个控件（含一个下拉）本来就贴着换行的边缘，
   省下来的每一像素都算数。**量出来的结果**：四个文字按钮 + 一个图标位 + 一个下拉，按 4px
   间隙算总宽 **357px**、**一排**放得下（探针里实测 `排数: 1`）。
2. **摘要文字与胶囊垂直居中**：`.obsync-state-row` 已经是 `align-items: center`，但那句话在
   `<p>` 里，而 app.css 的 `p` 自带上下外边距 —— 文字盒比胶囊高出一截，看着还是歪的。
   把 `.obsync-state-row .obsync-remote-state { margin: 0 }` 之后，实测两者**中线差 = 0px**。

**⑥ 「按扩展名」那种规则形状（同一天，用户追问「.gitignore 只能写文件夹吗？不能写图片格式吗」）。**
能写 —— 所以按钮那条路补了第二种形状，弹窗里让用户选，并把**各自的前提**写在选项旁边。
两种形状是**互补**的，不是可以随便选的：

| 形状 | 规则 | 成立的前提 |
| --- | --- | --- |
| 按文件夹 | `attachments/` | 图片同步管的是**具体几个文件夹** —— 范围与镜像范围完全重合 |
| 按扩展名 | `*.png` / `*.PNG` / … | 图片同步管的是**整个库**（默认的 `[""]`）—— 那种配置下按文件夹写等于让 git 什么都不同步 |

**反过来用会漏东西**：扩展名规则管的是全库，而图片同步只镜像配好的那几个文件夹 ——
文件夹之外的图片会同时退出 git 和 R2（两边都不管）。所以设置页按 `folders.includes("")`
**只给出成立的那一种**（并作为下拉默认值），不做「让用户先选错再被拒绝」。

实测/踩过的三点，都写在 `imagesIgnore.ts` 里：

1. **gitignore 的 wildmatch 不支持花括号展开** —— 2026-10-02 实测 `*.{png,webp}` 一条都不
   命中，而 `*.png` 命中。所以一个扩展名一条规则（`extensionIgnoreRules`）。
2. **大小写各写一条**（`*.png` + `*.PNG`）：Linux 上 git 真的区分大小写，只写小写会让
   `cover.PNG` 攒够一次提交溜进去，而摘索引那一步（按扩展名筛）也不会碰它 —— 用户看不出
   哪里不对。`*.[pP][nN][gG]` 也能一行搞定，但没人愿意读、也不好删。
3. **筛已跟踪文件不区分大小写**（`isImagePath`）——与第 2 条正好互补：规则覆盖两种大小写，
   筛的时候也就该两边都认。

摘索引的名单从哪来是两种形状真正的差别：文件夹模式直接给 git 几个文件夹；扩展名模式先
`git ls-files`（`SimpleGitManager.listTracked`，用 `-z` 解析，中文与空格都不会拆错）拿到
全部已跟踪路径，再只挑图片。**多摘一个笔记就等于「git 不管这篇笔记了」，而且没有任何提示**
——所以有一条用例专门钉「只摘图片、不碰 .md」。

顺带加了 `UNTRACK_BATCH_SIZE = 200` 的分批：扩展名模式是逐个文件列路径的，几千张图的库
一次塞进 `git rm --cached` 会撞上命令行长度上限，而报错是「命令行过长」，跟「停止跟踪」
毫无关系。

用例 +7（`imagesIgnore.test.ts` 5 条：一个扩展名两条规则、大写输入不重复、不用花括号、
`isImagePath` 的大小写与边界、与合并逻辑的幂等；`simpleGitManager.test.ts` 2 条真实仓库：
`listTracked` 含中文空格、非仓库返回空数组、250 个文件分批摘索引；`settingsTabRender.test.ts`
3 条：整个库默认按扩展名、扩展名模式只摘图片不碰笔记、索引里没图片时规则照写）。

**顺带修掉两个预览替身的保真度问题**（这次是靠截图发现的，都不是产品 bug）：
`.probe/settings-preview/obsidian-shim.ts` 的 `Modal.open()` 没调 `onOpen()`、
`titleEl` 没 `obsidianize`（少了 `setText`）—— 表现是「弹窗是个空盒子」，而报错发生在
异步链里、页面上什么都看不到。测试替身（`tests/stubs/obsidian.ts`）两处都是对的，所以
`pnpm test` 一直是绿的，只有预览看得出来。

### 样式约定（`styles.css`）

1. **只用 Obsidian 主题变量**（`var(--text-accent)` 等），并给关键颜色写兜底值，
   这样在任意主题 / 深浅色下都不会出现读不清的文字。
2. **设置页规则一律限定在 `.obsync-settings` 下** —— `.setting-item-*` 是 Obsidian
   的全局类，不加作用域会污染其他插件的设置页（容器类在 `display()` 里挂上）。
3. 状态类信息（可更新 / 已冻结 / 令牌已配置）做成名称后的徽标药丸
   （`.obsync-badge*`），描述行只放事实信息。
4. **设置行一律放进设置组的容器**（`openGroup` / `openSection` 返回的那个），不要再
   `new Setting(this.containerEl)` 逐条铺 —— 那正是 2026-10-02 修掉的「十几张卡片」。
   没有名称的动作行用 `.obsync-inline-actions` 贴左；有动作的节标题用
   `openSection` 的返回值 `.addButton(...)`。
5. 自查方式：**统一走 `pnpm check`**（`scripts/checks.mjs`，见第三节）。
   早先文档里写的 `npx esbuild styles.css --outfile=/dev/null` **在 Windows 上别用** ——
   `/dev/null` 会被当成真实路径，在仓库里建出一个 `dev/null` 文件（已踩过）。
6. **注释里绝对不能出现 `*/`**（2026-10-10 踩到，代价是一整条规则静默失效）。
   写注释时最容易撞上的是**描述通配符**：`` `**/` `` 里就含 `*/`，它会让注释**提前结束**，
   剩下的文字被 CSS 解析器当成**下一条规则的选择器** —— 于是那条规则连同它的声明块
   被**整条丢弃**：不报错、不警告，样式就是不生效。

   实际症状：`.obsync-settings .obsync-gitignore { width: 100%; … }` 被吃掉，
   `.gitignore` 代码框只有 173px 宽（容器 660px），而同一段里的 `min-height`、
   `white-space`、`padding` 也一起失效 —— 用户报的是「输入框全宽失效了」。

   **为什么难查**：`el.matches('.obsync-settings .obsync-gitignore')` 返回 **true**
   （DOM 层面选择器是对的），`pnpm check` 第 4 项也照样通过（被丢弃的规则在文本上
   仍然「有定义」）。判据与「CSS 到底解析出了什么」之间隔着一层，而那层是**真的解析器**。

   所以 `pnpm check` 加了第 8 项：**注释在第一个 `*/` 处结束，此后遇到的 `*/` 即游离**。
   要表达递归通配就换个说法（「以 `**` 开头的递归匹配」）。

   **量它的办法**：`.probe/settings-preview` 那个预览页能直接量出来（`node eval.mjs`
   取 `getBoundingClientRect().width` 与 `getComputedStyle().minHeight`）——
   「样式不生效」这类问题**别靠读 CSS 猜**，量一次就有答案。

## 四、代码地图

```
src/
├─ main.ts                 # 主类：只做装配。安装器已挂载；阶段三的 sync 模块也在这里挂
├─ settingsTab.ts          # 设置页：语言/host令牌/安装器列表/sync（阶段三加）
├─ core/                   # i18n（zh-cn 是规范源）、settings、secretStore、logger、notice
│  ├─ pluginId.ts          # 插件 id 判据（会成为路径的一截）
│  └─ themeName.ts         # 主题目录名判据 —— **不能**与上面共用（主题名有空格/大写）
├─ host/                   # ★ 双平台抽象层（脊柱）
│  ├─ IRepoHost.ts         # 统一接口；applyAuth 是接口方法（GitHub 用 header，Gitee 用 query）
│  ├─ githubHost.ts / giteeHost.ts
│  ├─ repoRef.ts           # owner/repo 解析（URL / 简写 / scp 形式）
│  ├─ http.ts              # requestUrl 封装：throw:false、重试退避（400ms*3^n）、20s 超时
│  └─ statusMapper.ts      # 状态码 → RateLimitError/AuthError/NotFoundError
├─ features/installer/     # 阶段二产出，见第五节（含 errors.ts：类型码 + 翻译器）
│  ├─ types.ts             # 判别联合：TrackedPlugin | TrackedTheme（另有 FILE_SETS / SUBDIR）
│  ├─ installFiles.ts      # 取文件：按「文件集 + manifest 解析器」参数化（原 pluginFiles.ts）
│  ├─ itemFolder.ts        # 目录读写：备份/写盘/回滚/删除（两种 kind 共用）
│  ├─ pluginFolder.ts      # 插件：目录定位（目录名≠id）+ enable/disable/reload
│  ├─ themeFolder.ts       # 主题：目录定位 + 非公开 API 守卫（当前主题/切换/重载）
│  ├─ existingPlugins.ts   # 绑定：扫描已装插件 × 官方插件索引
│  ├─ existingThemes.ts    # 绑定：扫描已装主题 × 官方主题索引（+ 手填仓库）
│  ├─ communityIndex.ts    # 官方索引的公共骨架（缓存/并发去重）+ communityRepoRef
│  └─ communityThemes.ts   # 官方主题索引（community-css-themes.json）
└─ features/sync/          # 阶段三产出，见第六节
   ├─ types.ts / errors.ts # 领域类型 + 按应对方式分类的错误（含 describeSyncError）
   ├─ gitManager.ts        # 抽象接口（含状态字符映射 mapStatusChar）
   ├─ simpleGitManager.ts  # simple-git 实现（状态映射/错误收口/reset 策略/diff 原文）
   ├─ diff.ts              # unified diff 解析（纯函数）+ 未跟踪文件的「全部新增」构造
   ├─ auth.ts              # http.extraheader 注入（simple-git config 是字符串数组）
   ├─ remoteLinks.ts       # 「在远端打开」：凑齐 origin + 当前分支，拼网页地址
   ├─ commitMessage.ts     # 模板变量 {{date}}/{{hostname}}/{{numFiles}}/{{files}}
   ├─ syncService.ts       # 编排：串行队列 + commit→pull→push 链 + 冲突指南 + 差异
   ├─ automatics.ts        # 自动定时器（剩余时间模型，时间戳存 localStorage）
   ├─ statusBar.ts         # 状态栏（由 service 显式驱动，不跑轮询；可点开视图）
   └─ ui/
      ├─ EditRemoteModal.ts   # 「编辑远端地址」弹窗（含凭据警告）
      ├─ DiffModal.ts         # 差异视图（工作区 / 已暂存两节，逐行行号与增删配色）
      └─ SourceControlView.ts # 侧边栏面板（见五点八）+ 三个纯函数（changeRows 等）
```

## 四点五、错误与文案的归属（改错误路径前必读）

**规则：逻辑层抛「类型码 + 参数」，展示层拼「用户能看懂的话」。**

原因很实际：`manifest.ts` / `pluginFiles.ts` / `pluginFolder.ts` / `simpleGitManager.ts`
都是**纯逻辑**，拿不到 `t`，也不该依赖 i18n。早期实现图省事，把中文文案直接写进
错误的 `message`，而 `Notifier` 对 `ObsyncError` 是原样返回 —— 于是**英文界面下冒出中文**。
（当时还留下 7 个写了却没接上的 i18n 键，正是"打算本地化但没接上"的证据。）

现在的做法：

| 层 | 做什么 | 在哪 |
| --- | --- | --- |
| 逻辑层 | 抛 `InstallerError({ kind, ...params })` / 领域错误类型；`message` 只放**技术性描述**（英文，进日志） | `features/installer/errors.ts`、`features/sync/errors.ts` |
| 注册 | 各模块在 `createXxxModule()` 里 `notifier.registerErrorTranslator(...)` | `features/*/index.ts` |
| 展示层 | `Notifier.describeError()` 按类型/类型码取 locale 文案 | `core/notice.ts` |

两个设计点值得保持：

1. **可辨识联合 + `switch` 穷尽检查**（`InstallerErrorDetail`）。新增一个类型码却忘了
   加文案，`describeInstallerError` 里的 `const exhaustive: never = detail` 会**编译报错**。
   这是"漏翻译留到运行时"的解药。
2. **`Notifier` 用注册制而不是 `import` 各功能的错误类型** —— `core/` 不该知道任何
   `features/` 的东西。功能模块自己把「错误 → 文案」的映射交上来。

**自查手段**：统一走 **`pnpm check`**（`scripts/checks.mjs`，见第三节）。
早先这几项检查是我在 `.probe/`（gitignore）里写的 Python 脚本 ——
写的时候有用，但**不进仓库等于没有**，所以移植成了项目内的 Node 脚本，
并由 `pnpm build` 自动执行。想加豁免条目就改脚本里的 `KNOWN_SAFE` / `ALLOWED`，
**必须写清理由**，否则那两张表会变成掩盖问题的地方。

测试约定：**断言错误的类型码，不要断言消息文本**。文案来自 locale，改文案不该让测试变红。
助手见 `tests/helpers/expectInstallerError.ts`。



## 五、安装器（阶段二）实现要点

文件都在 `src/features/installer/`，测试在 `tests/features/`。

**安装主链路**（`installerService.ts`）：
解析仓库 →（可选）镜像发现 → 解析安装目标 → 取文件 → 兼容性检查 →
备份 → 写盘 → 启用/重载 → 记录。兼容性检查**必须在写盘之前**。

**关键设计**：

- **三级回退**（`resolveSource`）：指定 tag → 最新正式版 → 最新预发布 → 源码 HEAD。
  API 限流/不可用时降级源码通道并提示用户 —— Gitee 匿名配额实测极低，
  没有这条降级路径就完全装不了。
- **逐文件回退**（`installFiles.ts`）：release 资产里缺哪个文件，就回该 tag 源码里读。
  资产下载**失败**（不只是"不存在"）也回退 —— 资产 CDN 在国内经常不可达。
- **更新检查必须与安装同源**（`updateChecker.checkOne`）：它取「最新版本」的方式
  要与 `resolveSource` 一致，否则会出现「装得上但永远说已是最新」。两处已对齐 ——
  凭据（都带用户的令牌）与回退（正式版取不到时同样看预发布版）。
  **改这两条路时要一起改**，这是个容易漏的不变式。
  `styles.css` 是可选文件，任何失败静默跳过（包括网络错误）。
  > 注意「记住资产通道不可用」的判定边界：**只有传输层失败**（网络/超时）
  > 才跳过后续文件的资产通道；**404 不算** —— 那只是这一个资产的问题
  > （私有仓库的 `browser_download_url` 本来就会 404），把它也算上会让
  > 后面的文件被无谓跳过，而 `main.js` 通常被 gitignore、源码通道取不到它，
  > 于是一次本可成功的安装变成失败。锁这条性质的是
  > `tests/features/installFiles.test.ts`（双向变异都验过）。
  >
  > **2026-09-19 补充：那条短路只是省时间的优化，不能决定结果。** 它有两个漏洞，
  > 都在这次真机失败（Trefoil）里同时命中：
  >
  > 1. **被短路跳过的文件，可能是只有资产里才有的那个** —— `main.js`／`styles.css`
  >    在构建型仓库里都被 gitignore，源码通道取不到。所以现在：**任何文件在源码里
  >    也拿不到时，为它单独重试一次资产通道**（资产干净地 404 时不重试 ——
  >    那是「远端确实没有」）。代价最多一次超时，而那条路径本来就要失败；
  > 2. **报错分不清两种「缺文件」** —— 资产里挂着却没下下来（网络问题，重试即可）
  >    与仓库里根本没有（作者的发布流程问题）被报成同一句话。现在后者才是
  >    `missingRequiredFiles`，前者是 `assetDownloadFailed`（`fetchFiles` 用
  >    release 的资产名判定）。实测动因见第七节第 19 条。
- **写入前备份 + 回滚**（`pluginFolder.ts`）：先快照进内存，写失败整体还原。
  回滚也失败时报错让用户手动检查。BRAT 没有这套机制。
- **单一跟踪列表**（`types.ts` 的 `TrackedPlugin`）：不复刻 BRAT 的双平行列表。
  settings 加载时会做结构校验（`sanitizeTrackedPlugins`），坏条目直接丢弃。
- **更新检查与执行分离**（`updateChecker.ts`）：**没有任何自动安装**。
  两个自动**检查**时机：
  1. 启动后延迟 N 秒（`autoCheckOnStartup`，**v2 起默认关闭**）；
  2. 打开 SyncHub 设置页（`autoCheckOnSettingsOpen`，默认开启，
     由 `display`/`hide` 区分「打开页签」与「页内重绘」，并有 10 分钟节流
     `SETTINGS_OPEN_CHECK_INTERVAL_MS` + 持久化的 `lastUpdateCheckAt`）。
     2026-10-06 起这一条**两件事一起做**：跟踪列表的更新 + **SyncHub 自身**
     （用户要求「进入设置页检查更新的同时也检查 SyncHub 自身」）。自己那一份
     **不受「有没有跟踪项」影响** —— `trackedCount` 因此从
     `shouldCheckOnSettingsOpen` 的入参里去掉了，空列表时跟踪那一轮自己返回。
  执行更新永远手动：命令「更新全部插件」、行上的 ⬇ / ↻ 按钮。
  冻结项（`frozen`）**不参与任何检查**，因此也不会进入「更新全部」的集合
  （文案已修正为「不参与更新检查」——产品里没有自动更新）。
  检查结果持久化在 `installer.availableUpdates`（pluginId → 新版本 + 时间），
  已跟踪列表据此渲染**常驻徽标**（整行高亮，Notice 一闪就错过）；
  安装/更新成功后由 `recordInstalled` 清除，normalizeSettings 会剪掉
  已不在跟踪列表的条目。检查失败保留旧记录（过期信息好过没有），
  但 `lastUpdateCheckAt` 照常刷新（限流期间不要反复重试）。
  **自身那一份同构**：结果存在 `installer.selfUpdateAvailable`（版本号字符串，
  空串 = 没有），由 `checkSelf` 里的 `recordSelfUpdateCheck` 落盘，
  「插件安装器」标签上的数字徽标与那一行的状态小字都读它；`updateSelf` 成功后清掉。
  为什么要落盘而不是只留内存：标签栏在页面内容**之前**画、重启之后也要还在 ——
  只放内存的话徽标永远慢一拍（与 `availableUpdates` 同一条理由）。
- **镜像发现**（`mirrorFinder.ts`）：用两边 manifest 的 `id` 二次校验，
  同名不同项目直接放弃 —— 装错比找不到严重。默认关闭
  （实测抽样 40 个社区插件命中 0 个），且全程走 raw 通道零 API 配额。
  > **命中之后两个地址都要留着**（`TrackedItem.origin`）：`host/owner/repo` 记的是
  > **实际使用**的来源（镜像），源地址另存一份，列表才会「源仓库一行 + 镜像一行」。
  > 拿到「实际来源」一律走 `types.ts` 的 `itemRepoRef()`，**不要**读 `origin` ——
  > 检查、下载必须同源，读 `origin` 会让它们分叉（见缺陷表里那条）。
  > **主题也有镜像提议**（`findGiteeMirrorForTheme`），但判据与插件不同：主题 manifest 没有 `id`，所以用「`name` 一致 **且** 版本不比源旧」——名字不是唯一标识，这条判据比插件的 `id` 弱一档，因此同样**只提议、不采用**（确认弹窗里的警示正是为这种弱判据写的）。候选 owner 与插件侧同一套（同名 / 你 Gitee 账号名）。
  >
  > **镜像必须由用户确认才会被采用**（`mirrorSuggestions` → `ConfirmMirrorModal` →
  > `confirmMirror`）。发现只把候选记进 `installer.mirrorSuggestions`（键 `<kind>:<id>`），
  > 列表把地址列出来 + 一个 `git-compare` 按钮，弹窗里同时给出**两个地址**与三段警告
  > （判据有多弱 / 绑错的代价 / 怎么自己核对），点了「改用镜像」才改写记录。
  > 理由：判据只有「两边 manifest 的 id 相同」，那只证明是同一个插件，**证明不了**
  > 同一份代码、同一个作者、跟得上源仓库 —— fork 或用同一个 id 重新上传都能过，
  > 而候选地址常常是**猜**出来的（同名 owner / 你 Gitee 账号名）。插件又能读写整个库。
  > 安装弹窗里同样默认**不勾**镜像开关，并会明说「检测到但没用」。
  >
  > **「有没有用镜像」现在看得见**：安装弹窗的开关与那句「检测到疑似镜像但默认不用」、
  > 列表里「疑似镜像 · 尚未使用，待确认」那一行、确认后的「已在使用」镜像行、
  > 以及每次下载/更新提示里的来源（`downloadSource.ts`，命中时为「Gitee 镜像」）。
  > 仍然存在的盲区只有一条：
  > 1. **候选 owner 有两个**（`findGiteeMirror` 收的是候选列表，按可信度排序）：
  >    ① GitHub 上的 owner（同名，最可信）；② **你 Gitee 令牌所属账号的账号名**
  >    （`GET /v5/user`，只在成功时缓存 —— 用户中途补令牌也能立刻生效）。
  >    第二个候选是必须的：镜像**常常挂在作者自己的 Gitee 账号下，而账号名与
  >    GitHub 上的 owner 不同名**。实测 2026-09-19：`github.com/Dyse-Sofqi/MDRazor`
  >    的镜像是 `gitee.com/sofqi/MDRazor` —— 旧实现只探同名，于是「明明有镜像却
  >    一直走 GitHub」，GitHub 不通时（`net::ERR_CONNECTION_RESET`）只能降级到源码通道。
  >    没填 Gitee 令牌就拿不到账号名，那就只探同名那一个（不靠猜）。
  > 2. **绑定进来的条目从不做镜像探测**（`bindExisting` 直接写记录），要等到
  >    第一次更新时才会探（更新路径会探）。所以「刚绑定就看不到镜像行」是正常的，
  >    不是显示坏了；真在意的话点一次「更新」。
- **绑定已有插件**（`existingPlugins.ts` + `ui/BindExistingModal.ts`）：
  扫描 `{configDir}/plugins/`（以磁盘为准，能发现刚手动拷入的插件），
  用官方社区索引按**manifest id** 反查来源仓库 —— manifest 规范里没有 repo 字段，
  这是唯一权威映射；注意 id 不能用目录名代替（见第七节第 9 条）。
  索引外的插件（PKMer 等非官方渠道分发的中文插件）标记「来源未识别」，
  留给手动添加。绑定只写跟踪列表不动文件。入口：设置页按钮 + 命令。
  实测测试库 32 个插件：24 个可识别，8 个确实不在官方索引
  （pkmer / trefoil / bewater / qimen / lyricflux / Enhanced-editing 等）。
- **社区插件索引**（`communityPlugins.ts`）：GitHub 独有资源，Gitee 无等价物。
  6 小时缓存；统计文件可选；7685 条实测；`byId()` 供绑定功能反查。

## 五点五、主题支持（安装器的第二类对象）实现要点

主题与插件共用**同一条安装/更新链路**（`installFiles.ts` + `itemFolder.ts` + `InstallerService`），
只在两处分叉：**身份从哪来**、**写完之后的动作**。改这块前先读下面四条。

### 身份：目录名，不是 manifest

主题**没有 id 字段**，身份就是 `{configDir}/themes/` 下的**目录名**
（`app.customCss.setTheme()` 收的也是它）。这与插件「身份一律以 manifest 为准」正好相反：

- `TrackedBase.id` 对插件是 `manifest.id`，对主题是目录名 —— 名字一样，语义由 kind 决定；
- 更新永远写回**记录的那个目录**（`resolveThemeFolder` 精确匹配 → 大小写不敏感兜底 →
  默认落点），**绝不**按远端 manifest 的 `name` 改名（改名等于换一个主题）；
- 校验用 `core/themeName.ts` 的 `isValidThemeName`，**不能**套 `PLUGIN_ID_RE`
  （那会把 `Minimal`、`Blue Topaz` 之类的真实主题名全判非法，症状是「一个都绑不上」且无提示）。

### 更新判据：版本号 + 一级回退

与插件同构（远端版本 vs 本地已装版本），但**没有 release 时读默认分支的
`manifest.json`**（`updateChecker.checkTheme`）。插件那边停在「无从比较」是配额考虑；
主题的生态就是「只推仓库、不发 release」，不读这一级就永远收不到更新提示。

> 实测三份流行主题都带 version：Minimal 9.1.0 / Things 2.2.4 / AnuPpuccin 1.5.0，
> Minimal 还有 21 个同名 release。「主题不写版本号」是误传（混淆了社区索引的字段）。

已知边界：作者不升版本号却在改 CSS 时会漏报。这是「与插件一致」的那套语义，不是缺陷。

### 非公开 API 清单（都做了兜底）

公开 `obsidian.d.ts` 里 `customCss` 出现 **0 次**，`pnpm check` 的 minAppVersion 自查
扫不到它（`CustomCss` 不在 `WATCHED` 名单里，且这些成员没有 `@since` 标注）——
**所以这一块的人为核查不能省**：

| 用途 | 调用 | 兜底 |
| --- | --- | --- |
| 读当前主题 | `customCss.getTheme()` → `customCss.theme` → `vault.getConfig("cssTheme")` | 三级都失败返回 `undefined`（**与默认主题的空串区分开**） |
| 刷新观感 | `customCss.requestLoadTheme()` | 失败只记 debug（文件已写好，不该报成更新失败） |

`setTheme` **没有**收进这个窄接口，因为没有任何地方该替用户换主题：更新时不碰当前选择，
取消绑定又不删文件（见下条）。读当前主题只为一件事 —— 判断「更新的正是它吗」，
是则请求一次重载，否则连重载都不做。

### 移除 = 取消绑定（2026-09-17 改）

列表里的那个按钮以前是 `uninstall`：禁用插件、`rmdir(folder, true)` 递归删掉整个目录，
主题还先把正在使用的那个切回默认。**这越界了** —— 跟踪列表记的是「我在跟哪个仓库」，
而插件 / 主题的安装与移除归 Obsidian 自己管（设置里的「已安装插件」与「外观」）。
对**绑定**进来的对象尤其糟：用户从官方商店装好之后让 SyncHub 认下它，点「移除」时想表达的
几乎一定是「别再跟了」，却换来了不可逆的删除。

现在 `InstallerService.unbind` 只做两件事：从跟踪列表里去掉、清掉它的更新徽标。
于是：**不删文件、不改启用状态、不切主题、也不需要二次确认**（动作可逆，与「绑定」那侧对称）。
按钮图标随之从 `trash` 换成 `unlink`，文案写明「不删除文件」—— 用户对「移除 = 卸载」
有惯性，不写清楚会以为功能坏了。要真删文件，去 Obsidian 自己的界面删。

连带删掉的东西：`themeFolder.detachThemeIfActive`（连同它的四种返回状态）、
`removeConfirm` / `removeConfirmTheme` / `themeRevertedToDefault` / `themeDetachUnconfirmed`
四个 i18n 键。**递归删除现在只出现在回滚路径上**（`restoreBackup`），
而 `sanitizeTrackedItems` 的路径校验仍然必要 —— 主题的更新回滚用的正是 `tracked.id`。

### 设置结构 v3 与两处顺带修的坑

- `SETTINGS_VERSION = 3`：v2 → v3 迁移要给老条目补 `kind: "plugin"`、把 `pluginId`
  改名为 `id`、把 `availableUpdates` 的键换成 `<kind>:<id>`。**漏掉字段改名会让
  `data.json` 被清空**（sanitize 按 `id` 取值，拿不到就整条丢弃）—— 已有用例钉住。
- 顺带修掉一个真 bug：`mergeWithDefaults` 只做浅拷贝，「磁盘数据里缺这个键」时
  直接把默认值本身放进结果，于是运行时的写入会**就地改写模块级 `DEFAULT_SETTINGS`**
  （症状：删掉的条目又回来、全新库凭空多出跟踪条目）。现在所有默认值都过 `cloneDefault`。
- 顺带清掉一个死导出：`isPluginInstalled`（只被测试用过，`readInstalledManifest` 覆盖同一件事）。

## 五点六、SyncHub 更新自己（2026-09-17）

设置页「安装器」页最后有一节「SyncHub 自身」：当前版本 + 检查更新 + 更新到最新 + 一行状态。
实现在 `features/installer/selfUpdate.ts`（坐标与状态文案）、`updateChecker.checkSelf`
（查）、`installerService.updateSelf`（写）。

### 为什么它不在跟踪列表里

跟踪列表是「**用户装了什么**」的清单，每一项旁边挂着冻结 / 取消绑定这类操作 ——
对自己没有意义。所以它单独一节，而绑定列表也跳过自己（`SELF_PLUGIN_ID`，与
`manifest.json` 的 `id` 必须一致）。

### 更新只写文件，**不重载自己**（这块的核心取舍）

别的插件更新完是 disable → enable；对**自己**则是**先卸载正在执行这段更新代码的
实例**，剩下半段靠闭包才活着 —— 能成也是靠副作用成功，中途失败就停在「已禁用」，
而来得及提示你的代码已经不在了。

所以 `updateSelf` 只做三件事：写盘（失败整体回滚）、把版本号记进
`installer.pendingRestartVersion`、提示用户重启。**不碰启用状态、不记跟踪列表。**

于是有一段「磁盘上是新版、运行中是旧版」的窗口，这段时间必须如实告知，否则用户
以为已经在用新版本：

- 设置页那一行常驻显示「已下载 x，重启 Obsidian 后生效」（`describeSelfState` 里
  **「待重启」压在检查结果之上**）；
- 标记在**每次加载时清空**（`main.ts` 的 onload 调 `clearPendingRestart`）——
  既然加载成功了，跑的就是磁盘上那份；不清的话用户重启完还会看到「重启后生效」。
- 检查用的是**运行中**的版本（参数传进去），不是磁盘那份 —— 拿磁盘那份比会得出
  「已是最新」，而用户此刻跑的不是它。

### 两道守卫与一条放宽

| 规则 | 为什么 |
| --- | --- |
| 远端 manifest 的 id 必须是 `ob-sync` | `SELF_REPO` 是写死的常量（manifest 没有 repo 字段），万一指错地方，按错的 id 解析目录会**覆盖别的插件** |
| 不允许降级（远端比当前旧就中止） | 「更新」不该把用户降回旧版本 |
| 允许**同版本重装** | 把一个坏掉的安装修回来是合理需求 |

### 两条已知边界

- **只能吃 release 资产**：`main.js` 是构建产物（在 `.gitignore` 里），源码回退通道
  取不到它 —— 资产 CDN 不可达时自我更新会以 `missingRequiredFiles` 失败并回滚。
  没有 release 时检查如实报「无从比较」（`checkSelf`）。
- **另一条更稳的路是官方的**：插件发布到社区市场后，Obsidian 自带的更新入口
  也走 disable → enable，但那是官方支持的路径。本节的入口服务的是「没上架 /
  开发期」这段。

### 更新来源是个开关（2026-10-06 改；默认镜像 + 回退官方 2026-10-01）

`settings.installer.selfUpdateUseGitee`（设置页「SyncHub 自身」一节的开关
「启用 Gitee 镜像源更新 SyncHub」）：

- **开（默认）→ `SELF_MIRROR`（Gitee 镜像 `sofqi/SyncHub`）**；**关 → `SELF_REPO`
  （官方 `github/Dyse-Sofqi/SyncHub`）**。二选一由 `resolveSelfRepo(useGitee)` 定，
  检查与更新**都**用它 —— 两边共用 `InstallerService.selfRepo()`（`checkSelf` 的
  默认参数就是它），否则会出现「检查说没有更新、更新却从另一个仓库拉」这种自相矛盾。
- 默认走镜像的理由：`github.com` 在目标网络里是时段性阻断的，默认走官方会让
  「检查更新」这个动作本身就经常失败；失败的样子只是「一直报错」，用户得自己去翻
  设置页才知道有个开关可以关。
- **为什么从「填地址」改成开关**（2026-10-06 用户要求「自更新来源用开关的形式选择」）：
  原先的自由文本框要用户先读懂一串规则才敢动（空串算默认、`owner/repo` 简写按
  GitHub 解释、非法地址抛错）。两个固定地址之间切换本来就是二选一。代价是**不再支持
  自定义来源** —— 那个场景本来也不成立（写盘前校验远端 manifest 的 `id` 必须是
  `ob-sync`，fork 改了 id 就会被拒）。
- **老 `data.json` 的迁移**（`migrateV8ToV9`，v8 → v9）：老字段
  `selfUpdateSource: string` 由 `selfUpdateUsesGitee()` 折算成布尔 —— 空串 / 全空白 /
  非字符串 / 解析不出来的值 → `true`（用镜像）；能解析出 host 的按 `host === "gitee"`
  判定，简写沿用当年的默认平台 GitHub。折算规则必须与**当年那套解析**一致，否则老用户
  的来源会在升级时被悄悄换掉。

#### 回退顺序：先镜像、失败再试官方（2026-10-01，用户要求）

`selfRepoAttempts(configured)` 给出尝试顺序：选定的来源 → `SELF_REPO`。
（开关关着时配置的**就是**官方，此时只有一次尝试 —— 回退到自己没有意义。）
`updateSelf` 与 `checkSelf` 都按它走，**每次回退都提示一次**
（`installer.selfSourceFallback`，提示里带上失败那个地址），并且**不静默**：

- 更新侧：取文件 + 两道校验（id、降级）算「一次尝试」；**写盘只做一次**，
  不属于任何一次尝试（磁盘错误换来源重试没有意义）。两次都失败时抛**官方那次**的原因
  （回退本身已经提示过了）。
- 检查侧：`checkSelf` 不抛错，它把「回退过」记进结果（`SelfUpdateCheck.fellBackFrom`），
  由 `describeSelfState` 拼在状态行末尾 —— 提示条几秒就没了，而「这次是从哪儿查的」
  是用户判断这条结论可不可信的依据。
- 「远端没有更新的 release」**不算失败**（`error` 为空），因此不触发回退：
  镜像就是权威来源，它说没有就是没有 —— 否则每次检查都要打两个平台。

它与「Gitee 镜像发现」是**两回事**，别混：那套是自动探测 + 只提议 + 要用户确认、每次都要
探一遍；这里是选定的**固定来源**，所以**不受 `discoverGiteeMirrors` 开关影响**，
也不需要探测。

⚠ **踩过的坑（被测试抓到的）**：第一版写成
`fetchItem(PLUGIN_SPEC, formatRepoId(source), …)`，而 **`formatRepoId` 只给
`owner/repo`、不带 host** —— 于是 `sofqi/SyncHub` 被 `resolveRepo` 按默认 host（github）
重新解析，用户填的 Gitee 地址**悄悄失效**，而界面看起来一切正常。修法是把 host 一并
传下去：`{ allowMirror: false, defaultHost: source.host }`（`installerService.ts` 第 528
行有同样的先例）。

⚠ **踩过的坑（被测试抓到的）**：第一版写成
`fetchItem(PLUGIN_SPEC, formatRepoId(source), …)`，而 **`formatRepoId` 只给
`owner/repo`、不带 host** —— 于是 `sofqi/SyncHub` 被 `resolveRepo` 按默认 host（github）
重新解析，用户填的 Gitee 地址**悄悄失效**，而界面看起来一切正常。修法是把 host 一并
传下去：`{ allowMirror: false, defaultHost: source.host }`（`installerService.ts` 第 528
行有同样的先例）。

**`selfUpdate.test.ts` 里那条「来源取设置里的地址」就是为此写的**：它断言「有请求打到
gitee」**且**「**没有**任何请求打到官方仓库」—— 后者才是关键，只断言前者的话，
一个「两边都请求一遍」的实现也能通过。

---

## 五点七、版本管理（回退到指定版本，2026-09-19）

已跟踪列表里插件行多了一个按钮（图标 `history`）：列出该插件**已发布的版本**，
选一个就把插件切换过去 —— 选旧版本即**回退**。实现在
`features/installer/ui/VersionManagerModal.ts`（弹窗）+ `TrackedItemsList.ts`
（按钮与执行）。

### 它补的是哪个洞

`requestedVersion`（「用户要求的版本」）这个字段**一直存在**：`install()` 每次都会
写它（`recordItem`）。但界面上**只有**
「添加插件仓库」弹窗写过它一次 —— 装完之后既改不了、也**看不见**。后果很具体：
一个装坏了的版本，除了等作者发新版没有别的出路，而「退回上一版」恰恰是遇到坏版本时
最该能做的事。

### 语义：选一个版本 = 钉在那一版

`switchVersion` 走 `install()`，要装的正是用户刚选的那个 tag；`install` 会把它写回
`requestedVersion`。于是三条现成的语义一起成立：

| 用户动作 | 结果 |
| --- | --- |
| 选一个具体 tag | 装它，且**钉住**：再打开这个弹窗默认选中的就是它 |
| 选「最新版本」 | 装最新，并把记录改回 `latest`（**解开**钉住） |
| 点「更新到最新版本」 | 同上 —— 它显式传 `version: "latest"` |
| 点「更新全部」 | 同上（`updateAll` 明确取 latest，见该处注释） |

最后一行是**已知且刻意的**取舍：批量「更新全部」的语义是「装到最新」，它会覆盖
钉住的选择。钉住的状态在列表上有徽标（下一条），所以这不是静默发生的。如果将来
要改成「批量更新跳过钉住的条目」（BRAT 的 frozen-version 就是这个语义），
改的是 `UpdateChecker.updateAll`，**不要**改这里的按钮。

### 2026-09-19：删掉了「重装」按钮（它与这里重合）

行上原来还有一个 ↻「重装」。它做的事是「用**记录里那一版**重新装一遍」：

- **插件**：`install({ repo, version: tracked.requestedVersion, enableAfterInstall: true })` ——
  而本弹窗的默认选中项**就是** `requestedVersion`，所以「打开 → 直接点切换」与它
  **逐字相同**（同一组参数调同一个 `install()`）；
- **主题**：`reinstall(theme)` 调的就是 `updateTheme(theme)` —— 与那行自己的
  「更新到最新」一字不差（主题没有版本钉选，两件事本来就是一件）。

也就是说两个按钮留一个就够，**没有丢任何能力**：插件要修复安装就走「版本管理 →
直接点切换」，主题走「更新到最新」。于是删掉了按钮、`InstallerService.reinstall`、
以及 `reinstall` / `reinstalled` 两个 i18n 键（死键会被自查第 3 项拦住）。

**跟着发生的一件小事值得记**：`refresh-cw` 这个图标原来归「重装」，检查更新为了不和它
撞车才换成放大镜（当时的注释写着「和『重装』的圆箭头几乎分不出来」）。重装没了，图标
空出来，就还给检查更新 —— 圆箭头本来就是「检查更新」最通用的表达。

> 图标因此要在**两处**出现：`setIcon()` 一次、`runWithProgress()` 一次（它做完要把图标
> 换回来）。两处各写一个字面量就等着漂移：这次改图标时就真的漏了后者（转完圈又变回
> 放大镜），是 `trackedItemsList.test.ts` 那条「检查更新同样转圈」抓住的。现在三个
> 行内动作的图标都取同一个 `ICON` 常量。

### 「已固定」徽标：这个状态在界面上只有这一处

`requestedVersion !== "latest"` 时，名称后挂一个 `已固定 <tag>` 徽标。
**必须显示**：这个状态只存在于 `data.json` 里，而它的后果是「再打开版本管理、
点一下切换就会装回这一版」——不显示的话，用户看到版本号是旧的，分不清那是自己选的
还是更新失败留下的。
这与 `sync.enabled`（「死开关」）是同一类问题：**用户改了它、界面不承认**。

徽标用 `obsync-badge-muted`（与「已冻结」同一档），措辞刻意与「已冻结」区分：
冻结 = 不参与更新检查，钉住 = 认准这一版但**照常检查**（有新版仍会亮徽标）。

### 只有插件有，主题没有（刻意的不对称）

主题在设计上就没有版本钉选（`TrackedTheme` 上没有 `requestedVersion`，
`updateTheme()` 永远按最新走）。给主题一个能选版本的按钮，等于承诺一件做不到的事，
所以那个按钮在主题行上根本不出现。`trackedItemsList.test.ts` 里有两处用例钉这条：
一处断言两行的图标数组（插件 7 个、主题 6 个），一处断言主题行没有 `history`。

> 要给主题也加，得先给它一个「钉住」的概念（`TrackedTheme.requestedVersion`
> + `updateTheme` 收版本参数），那是**产品决定**，不是顺手实现的细节。

### 两个容易写错的判据（都有用例钉着）

1. **「当前」标记要用版本比较，不能用字符串相等**：release tag 常常带前缀
   （`v1.2.3`），而 manifest 里的 `version` 不带（`1.2.3`）—— 字符串相等时
   「当前」两个字永远不会出现，用户在一串 tag 里认不出自己在哪一版。
   走 `compareVersions`（`semver.coerce` 归一），非 semver 的 tag 才退化成相等。
2. **「没有版本可切」与「这次没拉到」必须分开说**：`listVersions` 总是把
   「最新版本」放在第一项，所以 `options.length === 1` = 这个仓库一个 release
   都没发（Gitee 上这是常态，只能从源码装）→ 说「没有可切换的版本」；
   请求失败则显示失败原因（可以重试）。混成一句，用户会去重试一件永远不会成的事。

### 验证

- `tests/features/versionManagerModal.test.ts`（新增 13 项）：列表状态 / 当前版本
  标记 / 默认选中与提交；`tests/features/trackedItemsList.test.ts` +4 项（接线、
  执行、徽标、主题不对称）。
- **四个方向的变异全部被抓住**：① `switchVersion` 改传 `"latest"` → 安装用例失败；
  ② 「当前」标记退回字符串相等 → `v1.2.0` 那条失败；③ 去掉「已固定」徽标 → 徽标
  用例失败；④ 让主题也拿到那个按钮 → 两处不对称用例同时失败。

### 下载来源也在同一个弹窗里（2026-09-19 追加）

用户的原话是「**我选了 1.0.2 旧版安装，但是他却不走 gitee 路线，也找不到选择
gitee 镜像下载的选择**」。两件事在同一句话里：GitHub 资产域名连不上（第七节第 19
条），而界面上没有任何地方能换来源。所以「版本」与「来源」现在放在同一个弹窗：

- **探测到的候选**：开弹窗时跑一次 `InstallerService.probeMirror`（只提议，不采用 ——
  与列表里那条「疑似镜像 · 尚未使用，待确认」同一套判据、同一个出口），探到就给
  一个「改用 Gitee 镜像」按钮；
- **手填地址**：`InstallerService.setMirror` —— 自动探测的兜底，也是「镜像挂在第三个
  账号下」唯一的路。**校验用 manifest 的 `id`**（与自动探测同一条判据），不一致直接
  拒绝（`mirrorIdMismatch`），因为只比仓库名会装错东西；
- 换来源走 `confirmMirror`：记录的主来源换成它、原来源留在 `origin`，此后下载与
  更新检查都按新来源走（列表两行地址都还在，见 `mirrorProvenance.test.ts`）；
- **换完必须重拉版本列表**：列表是从当前来源查的，换了仓库 tag 可能完全不同
  （实测 Trefoil 的 Gitee 镜像只有 1.0.2 / 1.0.3，GitHub 有四个版本）。不重拉的话，
  用户会拿到一个来自旧仓库、点了会失败的列表。

> 「探不到镜像」时**必须解释**：探测只猜两个候选，不解释的话用户会把
> 「没发现镜像」读成「这个插件没有镜像」。文案里点明「镜像挂在别的账号下就手填」。
>
> **凡是让用户「去核对地址」的地方，地址一律是可点开的链接**（`ui/repoLink.ts`）。
> 确认弹窗与这个弹窗都在干这件事，而原来两处都只有纯文本 —— 用户得手抄或复制粘贴
> 到浏览器，在最需要「看一眼」的地方留了一道摩擦。用真正的 `<a href>`：Obsidian
> 自己会把外链交给系统浏览器（参考项目 obsidian-git / BRAT 同样写法），顺带拿到
> 右键复制链接与 Tab 聚焦。文案因此拆成「前缀 + 地址」两段（地址单独渲染成链接），
> `mirrorCandidatePrefix` 是模块级常量，「添加插件仓库」弹窗那行行名与它共用一句话。

### 「在跑」必须看得见（2026-09-19）

用户的原话：「**获取插件时，请显示加载动画，不然我根本不知道你是不是在更新**」。
一次安装的网络等待可以到 17~20 秒（第七节第 19 条），而这段时间原来是**完全静止**的
—— 只有一个被禁用的图标按钮。现在两层反馈，可见性条件不同所以都要有：

| 反馈 | 位置 | 受「显示操作结果提示」设置影响？ |
| --- | --- | --- |
| 被点的图标按钮换成会转的 `loader`（`.obsync-spinning`） | 行上 | **不受** —— 关掉提示的人也看得见 |
| 带圆环的进度提示，按文件更新文案（「正在获取 main.js…」） | 屏幕上的 Notice | 受（与该设置页的说明一致） |

进度提示的文案必须点出**在做什么**：笼统的「加载中…」回答不了「你在更新吗」。
逐文件进度是现成的（`fetchFiles` 一直有 `onProgress`），这次才把它接上来：
`InstallRequest.onProgress` → `fetchItem` → `fetchFiles`；`updateTheme` 也收一个可选参数。
行内动作统一走 `runWithProgress`（`TrackedItemsList.ts`），它负责转圈、进度、错误提示
三件事，避免每条动作各写一遍。

---

## 五点八、仓库同步视图（侧边栏面板，2026-09-19）

> 名字：面板**显示**的名字是 `t.sync.viewTitle`（「仓库同步」，当天晚上从「源码控制」改的）。
> 类名 `SourceControlView` 与视图类型 `obsync-sync-view` **没改** —— 视图类型是持久化在用户
> `workspace.json` 里的，改了会让已经打开的标签页失效。文档里说「视图」时指的都是这一个。

用户的原话：**「对于仓库同步功能，我希望能在侧边栏打开查看详情，就像 git 插件一样」**。

这句话之下藏着**三个真问题**，一个都不是「不好看」：

1. **侧栏唯一的图标打开的是安装器。** 它的悬停文案写的是「SyncHub：同步笔记仓库 /
   安装插件」—— 一句话描述两件事，而点开只有一件（装插件）。想找同步详情的人
   点它、看到一个装插件的弹窗，然后**在界面上找不到那个面板**。（现在两个图标，
   各自一条文案。）
2. **状态栏条目不可点。** 它是屏幕上唯一常驻的同步入口（`SyncHub: main ~3`），
   却没有任何交互 —— 看见了信息，没有下一步。
3. **面板本身内容单薄。** 只有一个标题、四个按钮和一串文件名：没有 ahead/behind、
   没有远端地址、看不出哪些文件已暂存（README 却写着「逐个文件暂存 / 取消暂存」，
   而代码里**根本没有暂存这个动作**）、不是仓库时只提示「尚未初始化 git」而没有任何
   出路。另外打开它的命令名取自 `t.sync.viewTitle`，而那个键的值是「SyncHub」——
   命令面板里搜「同步」**搜不到**它。

### 现在有什么

| 区块 | 内容 | 能做的动作 |
| --- | --- | --- |
| 工具条（**一行**） | 提交 / 拉取 / 推送、分支下拉、立即同步（CTA，靠右）、刷新（最右） | 刷新、四个动作（走 `SyncService` 串行队列）、切分支 |
| 状态摘要 | 远端地址（**脱敏**）、`领先 / 落后远端` | 编辑远端 |
| 体积（**两栏并排**） | 仓库大小、待提交改动 | — |
| 冲突 | 冲突文件列表 + 一句人话说明 | 放弃本次合并（警示色） |
| 更改 | 按「已暂存的更改 / 更改」分组，每组带条数 | 逐个文件暂存 / 取消暂存、整组暂存 / 取消暂存、点文件名打开笔记、**查看差异**、在远端打开此文件 |
| 最近提交 | 最近 10 条（hash / 首行信息 / 作者 · 时间） | 点 hash 在远端查看这条提交、点旁边的差异图标看它改了什么 |

不是 git 仓库时：一句提示 + **「初始化仓库」按钮**（原来是死路）。

**仍然刻意不做**（PLAN.md 的「明确不做」）：树形目录、hunk 级暂存、blame。
（diff **视图**在 2026-09-24 补上了，见下一节 —— 但它是弹窗，不在这个面板里画。）

### 顶部只有一行（当天的第二次改动）

用户原话：**「把侧边栏的源码控制视图改名成仓库同步，并把源码控制标题删除。标题右边的
刷新按钮和立即同步同一行的四个按钮，以及下一行的分支下拉表合并为一行展示。」**

- **改名**：`viewTitle`（标签页标题）→「仓库同步」。命令名 `cmdOpenView`、状态栏
  `statusBarHint`、ribbon `ribbonSync` 三条**一起**改 —— 它们说的都是同一个面板，
  只改一条会留下「打开源码控制面板」这种对不上号的入口。类名与视图类型不动（见本节开头）。
- **删标题**：面板内那个 `.setHeading()` 的标题没了（标签页上已经写着视图名），
  于是 `viewTitle` 只剩 `getDisplayText()` 一个用处 —— 它仍是这个名字的唯一来源。
- **三行并一行**：刷新、四个动作、分支下拉现在都在**同一个 `Setting`** 里（`renderToolbar`）。
  两个顺带的后果，都不是顺手改的：
  - **渲染顺序变了** —— 先 `service.refresh()` 再画工具条。分支下拉属于状态，
    拿不到状态（不是仓库）时那一格**空着**，而不是显示一个编出来的分支名。
  - **分支那一行没了标签与 `desc`**（游离 HEAD 原来就写在 `desc` 里）。一行里放不下
    可见标签，于是标签挪到下拉框的 `aria-label` 上；**游离 HEAD 改成「下拉框里唯一
    那个选项写着「游离 HEAD」并置灰」** —— 这条信息必须留个落点，藏起来用户只会
    觉得「少了点什么」。列不出分支（`git branch` 出错 / 仓库还没有分支）同样置灰：
    能点、但里面只有它自己，是个假象。
  - CSS 上 `.obsync-actions .setting-item-info { display: none }` —— 这条工具条没有
    名称与描述，而 `.setting-item-info` 是 `flex: 1`，留个空盒子只会白占宽度把控件
    提前挤到换行。
- **验证**：`tests/features/sourceControlView.test.ts` 28 → 33 条。新增的是「面板内
  不再有标题」「工具条一行（控件顺序 + 分支下拉在**同一个** Setting 里）」「不是仓库时
  工具条还在但没有分支下拉」「游离 HEAD 置灰且写着它自己」「列不出分支时置灰」。
  变异验证：把分支下拉挪出工具条（另起一个 `Setting`），**4 条**用例立刻失败
  （「工具条一行」+ 三条分支下拉的用例）—— 「下拉框在工具条里」这件事是被钉住的。
  替身补了 `DropdownComponent.selectEl` 与 `setDisabled`（真实组件两者都有，
  少了它们「标签挂在 aria-label 上」「置灰」这两条路径在测试里根本跑不到）。

### 当天的第三次改动：指定顺序 + 体积两栏

用户原话：**「立即同步按钮放到右侧，刷新按钮放到最右侧。仓库大小和待提交改动这两块
分两栏横向排布成一行。」**

- **工具条顺序**（`renderToolbar` 里的调用顺序 = 界面从左到右）：
  `提交` → `拉取` → `推送` → `分支下拉` → `立即同步` → `刷新`。
  三个分步动作在左，一键走完的收尾动作在右，随时可点的刷新压在边上。
- **「在右侧」不只是「排在最后」**：`立即同步` 的按钮上多挂一个类
  `obsync-action-sync`，CSS 里是 `margin-left: auto` —— 面板够宽时把富余的空隙
  全吃掉，把它（和它右边的刷新）顶到最右，顺带把「分步」和「一键」在视觉上分开。
  窄面板没有富余空间，这条等于没写。取按钮元素走 `ButtonComponent.buttonEl`
  （**不是** `extraSettingsEl`，那是 `ExtraButtonComponent` 的）。
- **体积两栏**（`renderRepo`）：仓库大小 / 待提交改动从两个独立 `Setting` 改成
  **挂在同一个 `.obsync-metrics` 容器里**（横向 flex，两栏 `flex: 1 1 0` + `min-width: 0`）。
  两句话本身没变 —— 它们回答的仍是两个不同的问题（见 repoSize.ts）。
  两个容易忽略的细节：`align-items: flex-start`（两栏标签对齐，数值行数不同也不错位）；
  去掉 `.setting-item` 的上边框（Obsidian 只给非首项加，并排时只有右栏有线，像画歪了）。
  还有一处**必须反过来写**：`Setting` 默认是「名称大而深、描述小而灰」，用在
  「标签 + 数值」上正好相反 —— 照默认渲染，一眼看到的是「仓库大小」四个字而不是
  「12 MB」。所以标签压小压灰、数值（`.setting-item-description`）提到 `--text-normal`。
- **验证**：`sourceControlView.test.ts` 33 → 34 条，并把「工具条一行」那条改成断言
  **完整的一条控件序列**（含分支下拉的位置）—— 只断言按钮列表验不出下拉框夹在哪里。
  为此替身的 `Setting` 补了 `controls`（控件调用顺序）与 `ButtonComponent.buttonEl`。
  变异验证（各自单跑都只红一条）：
  | 变异 | 结果 |
  | --- | --- |
  | 把「立即同步」挪回工具条最前 | 「工具条一行，顺序是 …」失败 |
  | 「待提交改动」塞回 `contentEl`（另起一行） | 「并排两栏」失败 |
  | 去掉 `obsync-action-sync` | 「带一个只属于它的类」失败 |

### 当天的第四次改动：注意事项 + reset 与自动同步互斥

用户原话：**「那其实直接把注意事项写在仓库同步的标题下就好了是吧？」**

起因是上一轮那个问题的后续：用户听说「Obsidian 每 2 秒保存一次」，担心它与自动同步
互相干扰。**实测结论是不干扰** —— 插件不监听库文件事件（全仓只有一个 `registerEvent`：
`workspace.on("file-menu")`），自动同步是分钟级定时器，`isBusy` 时整轮跳过，所有 git
都走 `SyncService.enqueue()` 的串行队列。所以那条**不需要写**：写了反而是错误信息，
让用户去防一件不会发生的事。

真正查出来的是另外两条，性质不同 —— 一条能修，一条只能说明：

| 事项 | 定性 | 处理 |
| --- | --- | --- |
| `.gitignore` 模板漏了 `data.json` | **真回退**，能修 | 直接补（见下） |
| `reset` 策略 + 自动同步 | 语义如此，但**静默周期发生** | 写注意事项 **+ 加硬防护** |
| 多设备同时编辑同一文件 | **推断，未实测** | 只写说明，措辞保守（「可能覆盖」） |

- **注意事项的位置**：设置页「仓库同步」标题**正下方**（`renderSync()` 里、
  `isSyncAvailable` 检查之后）。不塞进各设置项的描述里 —— 两条都是**组合条件**才
  踩得到的坑（策略选「重置」+ 开着自动同步），写进单项描述没人读得到：用户是在
  配好之后才出问题，那时早就不翻设置了。
  样式是 `.obsync-settings .obsync-sync-notes`（左侧竖线 + 正常文字色）。
  **正文刻意不用 `--text-muted`**：灰字正是「扫过去看不见」的原因，而这两段说的
  是「这样配会丢东西」；也不用 `mod-warning` 的橙色 —— 那是「现在就出错了」。
- **`.gitignore` 那条是回退，不是遗漏**：测试库那份旧 `.gitignore` 里明确有
  `.obsidian/plugins/gitee-sync-plus/data.json`（和 `workspace.json` 写在同一段注释下），
  而 `gitignoreTemplate` 只有前两条 —— 改插件 id 时漏搬了。现在补的是
  `.obsidian/plugins/ob-sync/data.json`。
  **刻意不写成 `*/data.json`**：那会波及用户库里其他插件的设置，不该替他决定。
- **硬防护在 `Automatics.start()`，不在设置页**：`AutomaticsSettings` 新增
  `syncStrategy` 字段，为 `reset` 时一个定时器都不起。这是**同一个坑的第二次** ——
  `enabled` 当年就是「设置页有开关、`src` 里没人读」的死开关（见第二节
  「『启用笔记同步』是个死开关」那一行）。
  只把 UI 开关灰掉是不够的：库里**已经**存着 `enabled: true` + `reset` 的用户
  根本不会去动设置页，定时器会照跑，而界面看起来一切正常。
- **灰掉开关时不动它的值**：`setDisabled(suspended)`，不是 `setValue(false)`。
  用户改回「合并」后自动同步**自己就恢复了** —— 这是文案里写下的承诺，
  写成 `setValue(false)` 会让它变成谎话（有专门一条用例钉住）。
- **策略下拉的 `onChange` 必须 `commit(true)`**（重绘）：策略决定总开关是否可用，
  不重绘的话用户切到「重置」后开关看起来还是能拨的 —— 而实际行为已经停了，
  那比不灰掉更让人困惑。
- **验证**：`automatics.test.ts` +2、`settingsTabRender.test.ts` +5（新增
  「设置页 · 仓库同步页」一组 —— 这一页此前**一个用例都没有**）。
  变异验证（各自单跑都只红对应用例）：
  | 变异 | 结果 |
  | --- | --- |
  | 去掉 `start()` 里的 reset 判断 | 2 条失败（挂起 + 改回后恢复） |
  | `setDisabled(suspended)` → `setDisabled(false)` | 「总开关被禁用」失败 |
  | 在注意事项前插一个 `Setting`（破坏「紧邻标题」） | 「紧跟在标题下面」失败，提示 `expected '' to be 'obsync-sync-notes'` |

### 差异视图（2026-09-24）

用户原话：**「为仓库的git同步添加diff视图。」** 同时要求在「仓库同步」设置页里
给 `.gitignore` 一个可直接编辑的代码框（见下一条）。

#### 为什么是弹窗，不是又一个面板

侧边栏面板是**入口**（窄、常驻、一眼扫完「哪些文件变了」），diff 是**展开看细节**
（行很长、要看行号、看完就关）—— 两件事的形态相反。硬塞进侧边栏，每行都得横向
滚动，而那正好把「看差异」变回「看不了」。

顺带绕开另一个麻烦：视图类型要写进用户的 `workspace.json`，多一个就多一份
持久化状态。所以内容是弹窗（`ui/DiffModal.ts`）画的，入口有三处：

| 入口 | 位置 |
| --- | --- |
| 每个文件行 | 面板里**每一行**的第一个图标按钮（冲突行也有） |
| 每条提交 | 「最近提交」里 hash 右边那个差异图标 |
| 当前文件 | 命令 **SyncHub：查看当前文件的差异** |

#### 分三层，每层各自可测

| 层 | 干什么 | 怎么验 |
| --- | --- | --- |
| `diff.ts` | 解析 unified diff（纯函数）+ 未跟踪文件的「全部新增」构造 | `diff.test.ts`：fixture 是 **git 2.55 的真实输出** |
| `GitManager.diffFile` / `commitPatch` | 拼 git 参数、取原文 | `simpleGitManager.test.ts`：**真仓库**跑 |
| `SyncService.fileDiff` / `commitDiff` | 两侧都读、未跟踪兜底、交给纯函数解析 | `syncService.test.ts`：内存假 git |

分三层不是为了好看：**正则只能靠真实输出校准**，而「未跟踪文件要不要读内容」
这种判断只有编排层知道。

#### 五个必须记住的点

1. **`-c core.quotePath=false` 不能省。** 不加它，非 ASCII 路径会被转义成八进制
   （`"a/\344\270\255.md"`）—— 而中文文件名在这个插件的目标场景里是常态。
   实测对照见 `simpleGitManager.test.ts` 的「差异」一组。
2. **`--no-ext-diff` 也不能省。** 用户在 `.gitconfig` 里配了外部 diff 工具
   （difftastic 之类）时，输出**不是 unified diff**，解析器会把整份输出当成
   一片上下文行 —— 界面上看着「没改动」。
3. **合并提交要 `-m --first-parent`。** git 对合并提交默认**不输出任何差异**
   （它不知道该跟哪个父提交比），于是用户在历史里点开一次拉取产生的合并提交
   只会看到空白。对普通提交这两个选项没有副作用（实测）。
4. **两侧都读，不挑一边。** `git status` 里的 `MM` 意味着工作区与索引都有内容，
   只给一边等于把另一半藏起来 —— 而用户点开差异的意图恰恰是「我到底改了什么」。
   所以弹窗是两节（工作区 / 已暂存），空的那节整节不渲染。
5. **未跟踪文件的兜底必须**先确认它在未跟踪列表里**。** 一个干净的已跟踪文件
   两侧也都为空，直接读内容当「全部新增」就是在无中生有一个不存在的改动
   （`syncService.test.ts` 有一条用例专门钉这个）。

另外：`DiffLine.text` **不含**行首的 `+` / `-` 标记，标记由展示层补 —— 这样
`no-newline` 那行（`\ No newline at end of file`）能渲染成 locale 文案而不是
把 git 的英文透传给用户。

#### `.gitignore` 编辑框（同一天，同一个用户要求）

放在「仓库同步」页的 gitPath 下面。多行等宽框 + 状态徽标（已保存 / 有未保存的
修改 / 尚未创建 / 正在保存）+ 三个按钮（保存 / 填入默认内容 / 在编辑器中打开）。

三条取舍：

- **失焦保存 + 显式按钮**，不是「每敲一个键写一次」。`.gitignore` 一改，面板上的
  改动列表立刻就变 —— 每敲一个键就写一次等于让 git 一直在用户的中间态上做判断。
  失焦保证「点到别处不会丢」，按钮保证「我知道什么时候写下去了」（只有它弹提示）。
- **文件不存在时不自动创建。** 打开设置页不该往用户库里多出一个文件 ——
  `readGitignore` 因此刻意不学 `openGitignore`（后者会顺手建一份）。
- **「填入默认内容」只填进框里，不直接覆盖磁盘。** 覆盖掉用户自己的规则是数据损失，
  要让他先看一眼再决定保存。

写入走同步队列（`writeGitignore`）：`commitAll` 的 `git add -A` 与它同时发生时，
用户正在敲的半成品会被卷进一次提交。

### 六个必须记住的点

1. **命令名与面板标题是两条 i18n 键。** `viewTitle`（「仓库同步」）是标题，
   `cmdOpenView`（「SyncHub：打开仓库同步面板」）是命令名 —— 命令面板里要能搜到，
   所以必须有 `SyncHub：` 前缀（`tests/pluginBoot.test.ts` 有一条用例扫**所有**命令名）。
   原来两者共用一个键，于是要么标题带前缀、要么命令搜不到。
2. **视图取文案必须 `getT()`，不能快照 `t`。** 面板是**常驻**的（打开后一直挂在
   侧边栏），构造时快照会让它切换语言后一直显示旧语言 —— 与 `StatusBar` 同一个坑。
3. **`render()` 必须防重入。** 渲染里会调 `service.refresh()`，refresh 会通知订阅者，
   订阅者又调 `render()` —— 无限递归。实测：去掉 `rendering` 标志，测试直接
   `RangeError: Maximum call stack size exceeded`；因为它在 promise 链里，界面上
   只表现为**一片空白**（比报错更难查）。
4. **自己发起的动作期间不让订阅重绘**（`acting` 标志）：动作结束后的那次 `render()`
   已经够了，两处都渲染会白跑一遍 `git status`（订阅是同步触发的，会先跑）。
5. **冲突行不给暂存开关。** `git add` 会让 git 认为冲突已解决，而这个面板看不到
   文件内容 —— 用户可能没改就把带 `<<<<<<<` 的文件暂存并提交上去
   （`doCommitAll` 只拦「仍有冲突」这一种情形，暂存之后它就拦不住了）。
   冲突区的职责是「告诉你哪些文件要处理 + 给你出路」。
6. **逐文件操作走 `SyncService`，不走 `git`。** 视图原来切分支是直接调
   `git.checkout`，绕过了串行队列：用户点「暂存」的同时自动提交定时器到点，
   两条 git 命令并发写索引是真实会发生的。现在 `stageFiles` / `unstageFiles` /
   `checkoutBranch` 三个都在 `enqueue()` 里。

### 状态是推送式的（与参考项目不同）

面板打开后会一直挂着，而状态会在它背后变（自动提交定时器到点、库外编辑器改了
文件、命令面板触发的拉取）。所以 `SyncService.onStatusChange(listener)` 是**推送**式：
谁刷新了状态，谁负责通知订阅者（`refresh()` 里统一 `publish`）。
参考项目 obsidian-git 是固定间隔轮询状态；这里有真实的变化点，不需要轮询。
订阅者抛错被 try/catch 包住 —— 界面出错绝不能影响同步本身。

### 验证

- 新增 37 条用例（总数 720 → 757）。三层：
  - **纯函数**：`changeRows`（列表去重 + 「已暂存」这一位）、`remoteStateText`
    （`ahead/behind` 为 null = **没有 upstream**，不是「0 个」—— 当成 0 显示成
    「与远端一致」正好说反）、`shortDate`。
  - **渲染与交互**：用替身的 `Setting` 驱动 —— 点某一行的「暂存」必须对**那一行**的
    路径调服务、冲突行只有一个按钮、点 hash 交给主类。
  - **装配**：两个侧栏图标各开什么、点同步图标真的会请求打开 `obsync-sync-view`。
- 变异验证（改回去必须有用例失败）：
  | 变异 | 结果 |
  | --- | --- |
  | 去掉 `rendering` 重入保护 | `RangeError: Maximum call stack size exceeded` |
  | `stageFiles` 不走 `enqueue`（直接调 git） | 「慢提交没结束时暂存不会插队」失败 |
  | `changeRows` 的 `staged` 恒为 false | 3 条失败（分组 / 行按钮 / 整组动作） |
  | 同步图标改回打开安装器 | 「侧栏的同步图标真的会请求打开仓库同步视图」失败 |
  | 把分支下拉挪出工具条（另起一个 `Setting`） | 4 条失败（「工具条一行」+ 三条分支下拉的用例） |

---

## 五点九、图片同步（Cloudflare R2，2026-09-22~23）

> 用户原话（2026-09-22）：**「在"仓库同步"后添加"图片同步"标签页，增加将仓库图片同步到
> R2 的能力，实现双副本架构，指定图片文件夹，本地和云端各存一份，双向删除同步，
> 支持在笔记内直接对图片进行裁剪和压缩。」**
>
> 次日（2026-09-23）用户撤掉了其中一条：**「双向删除容易引发歧义，所以不做了，
> 用删除本地图片时，询问是否同步删除云端备份代替。」** 下面的设计按改后的写。

### 它是什么

`features/images/` —— 把指定的图片文件夹镜像到 Cloudflare R2，并在笔记里直接裁剪 / 压缩。

| 文件 | 职责 |
| --- | --- |
| `sha256.ts` / `sigv4.ts` | 手写的 SHA-256 / HMAC-SHA256 与 AWS Signature V4 |
| `r2Client.ts` | S3 兼容客户端（ListObjectsV2 / Put / Get / Delete），走 `host/http.ts` |
| `imageScan.ts` | 扩展名白名单 + 受管文件夹边界 + 本地扫描 |
| `syncState.ts` | 状态清单（localStorage，键 `obsync-image-state`） |
| `imageSyncService.ts` | 同步引擎：`plan` / `run` / `syncSelection` / `syncPath` / `publicUrlFor` / 删除三件套 |
| `imageChangeQueue.ts` | 「变动后自动同步」的攒批器（静默期 + 硬上限 + 正在跑时不丢） |
| `imageLibrary.ts` | 三方状态合并（本地 / 云端 / 引用）+ 筛选与排序 |
| `ui/ImageEditorModal.ts` | 裁剪 / 压缩弹窗 |
| `ui/imageToolbar.ts` | 阅读视图的悬浮工具条 |
| `ui/ImageManagerView.ts` | 图片管理（**主工作区标签页**，2026-09-23 从弹窗改来） |
| `ui/ConfirmDeleteRemoteModal.ts` | 「云端那份也删吗」的确认弹窗 |
| `index.ts` | 装配（**两个平台都装**）+ 删除询问的攒批 |

### 三条设计决定（改这块之前先读）

1. **不用 `@aws-sdk/client-s3`，也不用 `crypto.subtle`。**
   前者在浏览器环境下几百 KB，而我们只用四个操作；后者在移动端可能不是安全上下文，
   而且会把整条签名链污染成 async。签名正确性靠 **AWS 官方向量**校准
   （`tests/features/images/sigv4.test.ts`）—— 自己造的期望值两边一起错也照样绿，
   而 R2 只会回一个没有解释的 403。
2. **状态清单放 localStorage 而不是 vault 里的文件。**
   它记的是**这台设备**上一次同步时的观察结果，随笔记仓库同步给别的设备没有意义
   （那边有自己的观察）。按 **vault 路径**而非对象键存 —— 用户改前缀不会让清单失效。
3. **`folders` 与 `prefix` 各管一件事。** `folders` = 管哪些（唯一的边界），
   `prefix` = 放在桶的哪儿。两者都成立才归本插件处理。
   `settings.images.prefix` 存用户原文，归一只在 `buildR2Config` 里发生。

### 什么时候同步：四个触发器（2026-10-06）

用户问「图片同步如果不做按周期同步，做即时同步会更好吧？」，随后自己改口提出
「变动之后 30s 内无额外变动再同步」。落地成四个触发器 —— **完整推导（含成本模型与
「明确不做的事」）在 `docs/image-sync-design.md`**，这里只留结论与坑：

| 触发器 | 管什么 | 默认 |
| --- | --- | --- |
| **变动后静默同步**（`imageChangeQueue.ts`） | **本机**改动 → 云端 | 开，静默 30 秒（5–600） |
| **周期同步**（`ImageAutomatics`） | **其他设备**上的变化 → 本机 | 关，周期 30 分钟 |
| 编辑器保存 → `service.syncPath()` | 单张要立刻有结果 | 始终 |
| 启动后一轮 | 兜住「静默期内关窗」 | 始终 |

**为什么不能只留事件（把周期删掉）**：事件只看得见**本机**的改动。另一台设备传的图、
或者用户在 R2 控制台手工删的对象，本机什么都没发生 → 没有事件 → 计时器根本不会被启动。
周期那一轮是**唯一**能看见那些变化的。所以它不是「旧机制」，职责换成了「拉回远端漂移」。

**四个必须记住的坑**：

1. **静默期是正确性要求，不只是省请求。** 有些程序分块写大文件，`modify` 会在写到一半
   时触发 —— 那时去读会上传一张**截断的图**。
2. **硬上限不能省**（`maxWaitForQuietMs` = `clamp(静默期 × 10, 5 分钟, 30 分钟)`）：
   连续动几百张图时静默期永远不满足 → 没有上限就是**永远不跑**。
3. **正在跑一轮时来的变动不能丢。** `ImageAutomatics.fire()` 的处置是「放弃这一轮、
   等下一个整周期」—— 那条路可以，因为周期还会再来；变动同步**没有下一个周期可等**。
   队列的处置是「隔 5 秒回头再试」，直到能跑为止。
4. **自触发抑制要带过期时间。** 下载会写本地、写本地会发 `create`/`modify` —— 不标记的话
   每下载一张就再触发一轮。标记靠**事件**消费，而**写失败时不会有事件**：所以
   `selfWrites` 是 `Map<路径, 标记时刻>` + 10 秒 TTL，而不是一个裸 `Set`
   （裸 `Set` 的残留会把用户后来对同一个文件的真实改动吃掉）。

**删除（`delete`）不参与**：它已经有自己的即时处置（问一句 + 记墓碑），而同步从不删云端
—— 触发一轮唯一可能的效果是把云端那份**拉回来**（`deleteRemotePolicy: "never"` 那一档），
那不是「刚删完」该看到的反馈。

**编辑器保存那条路故意不抑制**：保存后 30 秒会有一轮「白跑」（`decide()` 判成 in-sync），
换来的是 `syncPath` 失败时能自愈 —— 抑制掉就只剩「等周期」，而周期默认是关的。

**改名的 `noteRenamed` 也会入队**：`renameRemoteBackup` 用服务端 COPY 搬云端那一份，
成功时跑一轮是白跑；入队是为了它**失败**时能补上（新路径会被当「本地有、云端没有」重传）。

### 删除：为什么退回到「问一句」（2026-09-23）

原设计是双向删除：一边删了，另一边跟着删。**它被去掉了，不要加回来。**

那个判断**本质上做不准**：同一个「本地有、云端没有」既可能是「用户删了云端那份」
也可能是「本地新增」，只能靠状态清单区分。而清单丢失（换设备、清了存储）、
或者用户在两台设备上各删一边时，判断就会错 —— 错的代价是**删掉一份用户没打算
删的东西**。用户说的「歧义」就是这个。

现在：

| 情况 | 行为 |
| --- | --- |
| 本地有、云端没有 | 上传（镜像补齐） |
| 云端有、本地没有 | 下载；**除非**有墓碑 |
| 用户删掉本地图片 | `vault.on("delete")` → 攒批 400ms → 弹窗问 → 删 / 留 |

`run()` 里**没有任何删除动作**，`SyncActionKind` 也不再有 `delete-*`。

#### 墓碑（`SyncedEntry.remoteOnly`）

用户选了「保留云端副本」之后：本地没有、云端还有 —— 而镜像逻辑看到这个状态
**只会想到「补齐」**，于是下一轮把那张图下载回来，看起来像「删除没生效」。
所以 `keepRemoteBackup()` 记一条墓碑，`decide()` 在「只有云端」那一支里先看它。

**没点按钮直接关窗（Esc / 点外面）也按「保留」处理，而且必须记墓碑** ——
「不表态」不能等于「什么都不做」。

墓碑不需要时间戳：云端那份消失时（别人删了 / 用户后来确认删除），`pruneState`
会因为两边都不存在而把整条记录剪掉。

#### `noteDeleted` 身上的守卫（每一个都对应一类「不该弹的窗」）

`instanceof TFile`（删文件夹也会触发事件，而 `images.png` 这种文件夹名会被
`isImagePath` 认成图片）/ `isImagePath` / `isInsideFolders` / `enabled` /
`deleteRemotePolicy`（`never` 一档直接装没看见）/ `isConfigured` /
**`hasRemoteBackup`**（挡掉绝大多数删除：用户删的多半是从没同步过的截图）。

攒批 400ms：一次选中十张图删掉会发十个事件，逐个弹窗是灾难。

#### 删除策略的三档（`deleteRemotePolicy`，2026-09-23 从开关改来）

| 值 | 行为 |
| --- | --- |
| `ask`（默认） | 攒批 400ms → 弹窗问 → 删 / 留 |
| `always` | 一次都不问：先记墓碑（挡住「同步把图补回来」的竞态），再直接删云端 |
| `never` | 不问也不动云端，**不记墓碑** —— 下一轮同步会把云端那一份下载回来 |

`always` 与弹窗里选「删除云端」的处置完全一致：删除成功时
`deleteRemoteBackup` 连墓碑一起清掉，失败时墓碑留着（云端那份不动、也不会
被下载回来），并各自报错。

#### 设置结构 v4 → v5 → v6

两个老开关里只有一个有对应物，所以**不是机械改名**：

- `deleteRemoteWhenLocalDeleted`（本地删了 → 云端也删）问的正是「删本地时要不要
  动云端」→ 接过来。关掉过它的用户明确表达过「别动云端」，那就别拿询问去打扰他；
- `deleteLocalWhenRemoteDeleted`（云端删了 → 本地也删）**没有**对应物，那个方向
  的行为被整个去掉了 → 静默丢弃。

v5 → v6 把开关 `askDeleteRemote` 换成三态 `deleteRemotePolicy`，两端都有对应物
（`true` → `ask`，`false` → `never`），**没有默认值丢失**。新字段已写过值时不碰
它（data.json 会随仓库同步，两台设备版本不一致时旧字段只是残留）。

因为 `mergeWithDefaults` 只保留默认值里存在的键，老字段在 `merged.images` 上已经
看不到 —— 迁移得从**原始数据**里读（`readRawImages`）。

### 笔记内编辑：为什么只在阅读视图

「在笔记内直接裁剪 / 压缩」落在**阅读视图**（`registerMarkdownPostProcessor`），
不是 Live Preview。三个理由：Live Preview 里图片常常是折叠的（光标不在那一行时
只显示链接）；CM6 的图片 widget 是 Obsidian 内部实现、没有公开钩子；工具条只在
鼠标移到图片上时出现，不占阅读面积。编辑模式的入口另外给：命令面板与文件右键菜单。

工具条挂在 `img` **外面**包一层 `.obsync-image-wrap` —— 阅读视图里的 `img` 可能被
`<a>` 包着、也可能被 p 的样式影响，自己包一层就有了可控的定位上下文。

**编辑范围比同步范围窄**（`EDITABLE_EXTENSIONS`）：svg 是矢量图，画布会把它栅格化；
gif 经过画布只剩第一帧。这两个格式**能同步但不能编辑**，编辑入口会明确拒绝并说明原因。

压缩预览显示的是**真实编码出来的字节数**（同一个画布真的编码一遍），不是公式估算 ——
估出来的 jpeg 体积能差两三倍，那等于编数字。

### 图片管理：为什么是主工作区标签页（2026-09-23）

原来是 `Modal`，用户要求改成标签页。理由很直接：**整理图片时要一边看着笔记
一边决定哪张能删**，弹窗把整个库盖住只能二选一，标签页可以并排在笔记旁边。

- 视图类型 `IMAGE_VIEW_TYPE`（`obsync-image-view`）**发布后不可改** —— 它持久化在
  用户的 `workspace.json` 里，改了会让已经打开的标签页失效。
- 注册**两个平台都做**（与同步视图的 `if (this.sync)` 守卫正好相反）：图片模块
  移动端也装，工厂函数解引用 `this.images` 不会踩空，而手机上没有比这更好的入口。
- 打开路径（命令 / 侧栏图标 / 设置页按钮）都走 `openImageManager()`：已经开着就
  reveal，不再开第二个 —— 两个标签页扫的是同一批图，每扫一遍要好几秒。
  与 `openSyncView` 同一套做法，区别只在 `getLeaf(true)`（主工作区）而不是
  `getRightLeaf(false)`（右侧边栏）：盖住笔记正是弹窗被换掉的原因。
- CSS 上 `.obsync-image-manager` 自己补了内边距与 `height: 100%` —— 弹窗那份
  是 modal 容器给的，标签页的 `contentEl` 没有。`.view-content` 的高度是确定的
  （Obsidian: `height: calc(100% - var(--header-height))`），所以表格区
  （`.obsync-image-table-wrap`）用 `flex: 1 1 auto` **吃满页面剩余高度**、内部
  滚动；`min-height: 0` 而不是某个下限 —— 矮叶子（窄分栏、手机）里让表格继续缩，
  也不把操作栏挤出可见区。弹窗时代那个 `max-height: 45vh` 已删：它会让标签页
  的下半部空一大块。

#### 弹窗 → 标签页：图片会被 Obsidian 的 leaf 规则缩没（2026-09-23）

 Obsidian 的 app.css 有一条 **只对 leaf 生效**的规则：

```css
.workspace-leaf-content img:not([width]), … { max-width: 100%; }
```

弹窗不在 `.workspace-leaf-content` 里，所以弹窗时代的缩略图从来不中招；搬到
标签页之后立刻中招 —— 表格是自动布局，路径列带着 `max-width: 0`（省略号收尾），
窄标签页里单元格被挤到接近 0 宽时，这条 `max-width` 让缩略图跟着缩到 0。

**修法：尺寸必须同时写成 HTML `width` / `height` 属性**（`renderRow` 里），
属性让 `img:not([width])` 不再匹配；实际尺寸仍由 `.obsync-image-thumb` 的 em 值
决定（author CSS 优先于呈现属性）。`imageManagerRender.test.ts` 里有一条用例钉着
这两个属性 —— 没有它，这个回归在单测里完全看不出来（Node 里没有那条规则）。

### 边界与已知限制

- **受管文件夹是唯一的边界**，`isInsideFolders` 的前缀判断**必须带 `/`** ——
  不带的话 `attachments-old/` 会被 `attachments` 误判为在范围内。
- **`hasRemoteBackup` 是按设备记的**：这台设备从没同步过、而别的设备传过同一张图时，
  删本地不会弹窗。代价是**少问一次**（用户想在云端也删掉时得手动去删），而不是误删。
- **git 操作导致的文件消失也会触发询问**（`vault.on("delete")` 不区分是谁删的）。
  行为是一致的（保留 → 立墓碑 → 不会再回来），但用户可能觉得意外。
- **`ImageEditorModal` 的画布那一半没有单测**（Node 里没有 canvas）——
  能测的纯计算部分全抽到了 `imageEditor.ts`。

### 验证

- `tests/features/images/` 12 个文件。重点：`planSync.test.ts`（镜像语义 + 墓碑 +
  删除三件套）、`imageDeletePrompt.test.ts`（该不该弹窗的每一个守卫）、
  `confirmDeleteRemote.test.ts`（三个出口，含 Esc）、`sigv4.test.ts`（AWS 官方向量）。
- `verify:mobile` 通过：这个模块**移动端也装**，静态导入图里不能有 Node 依赖
  （`scripts/checks.mjs` 的「移动端安全」守着，当前 66 个模块）。

## 五点十、功能区头像（Gitee / GitHub，2026-10-05；平台开关 2026-10-06）

用户要求：「在设置页通用下添加『功能区展示用户头像』的设置项，默认关闭，打开后在
左侧功能区底部展示圆形 gitee 头像」。代码在 `src/features/avatar/ribbonAvatar.ts`。

**2026-10-06 又拆出一项**：「将功能区展示用户头像中gitee部分拆分出来单独设置一个
设置项，默认开启，开启时使用gitee头像，关闭时使用GitHub头像」——
`settings.ribbonAvatarUseGitee`（默认 `true`，沿用拆之前写死的 Gitee），
设置页那一行叫「使用 Gitee 头像」，总开关关着时**置灰但值不改写**。
这个模块因此不再写死平台：`deps.avatarHost()` **每次 `apply()` 问一次**，
令牌/查询/文案都跟着平台走（GitHub 侧同样是 `validateToken()` 顺手带回
`avatar_url`，不多打接口）。

**2026-10-09 又改成可点的**：用户原话「将功能区展示的用户头像做成可点击的，悬停时光标
保持默认，头像外侧绘制环状虚影，点击后打开设置窗口，跳转插件通用设置页」。做法与状态栏
条目同构 —— `deps.onClick` 由装配层注入（`main.ts` 的 `openGeneralSettings()` →
`ObsyncSettingsTab.openGeneral()` → `app.setting.open()` + `openTabById(插件 id)`），
`ribbonAvatar.ts` 只在建节点时挂一次 `click` 监听（节点不会重建，没有重复挂的问题）。
两条**刻意**的设计都写在 `styles.css` 的 `.obsync-ribbon-avatar` 上：
`cursor: default`（不摆出按钮样子）与**悬停时才出现**的环状虚影。

环状虚影**常驻**：base 规则里就是 `box-shadow: 0 0 0 2px <环色>`（2px 柔灰实环，
紧贴头像边缘，没有 border 所以没有缝）；**悬停时**环加深到 100% 的 `--text-faint`，
并加两层模糊扩散（贴边 `0 0 3px 1px` 80% + 外扩 `0 0 6px 2px` 55%）。环色存进自定义属性
`--obsync-avatar-ring`（`color-mix(in srgb, var(--text-faint) 60%, transparent)`）——
注意悬停规则**没有**复用它，而是直接用 100% 的 `--text-faint`（悬停要更实）；
box-shadow 是简写，悬停规则必须把环那一层重新写一遍，否则环会在悬停态消失。
用户原话的完整轨迹：「头像外侧绘制环状虚影」→「虚影环颜色太深了」→「虚影环再淡一些」→
「把环和头像的间隙去掉」→「虚影环应该鼠标悬停时才出现」→「不要模糊扩散，我要虚影环」→
「将虚影环常驻，悬停效果改为连带虚影的模糊扩散，扩散范围要保守，避免超出功能区」→
「悬停的悬浮效果太不明显了」（第一版悬停只加了一层 6px/1px/50% 的淡雾，反馈太弱）。
六条踩过的坑，改之前先看：

1. **颜色必须取「在身上」的变量，而且不能太深**。第一版用
   `--background-modifier-border` + `--background-modifier-box-shadow`，用户原话
   「环状虚影完全看不见」—— 那两个是给**分隔线**与**浮层**用的（前者浅色主题
   #e4e4e4，白底上就是一根头发丝；后者只有 10% 的黑）。之后 #5c5c5c 太深、
   #ababab 要再淡 → **静息态 `--text-faint` 60% 透明度**（color-mix 混透明，
   不写死 rgba，深浅两色各自变淡）；**悬停态 100%**。
2. **base 规则里不要放 border**。10-05 起原本有一根 1px 细边，它就是头像与环之间的
   那道缝 —— 用户原话「把环和头像的间隙去掉」。环用 `box-shadow` 的 spread 画，
   从 border-box 外沿起算，没有 border 时正好贴着头像。
3. **`.workspace-ribbon` 有 `overflow: hidden`，扩散预算只有 8px（左右）**。
   头像 28px 在 44px 的功能区里居中：到裁剪边的距离 = 4px 自动边距 + 4px ribbon
   内边距 = **8px**（上下约 12px）。悬停三层最大扩散 2px / 4px / 8px，全部落在
   预算内。想再大就得先解决裁剪，别直接加半径。
4. **环常驻、扩散在悬停**（用户 2026-10-09 定稿）。悬停规则必须把环那一层
   **重写一遍**（box-shadow 是简写，会整组替换）。
5. **悬停要「明显」但不能靠超出功能区来换**：用户既说过「太不明显」也说过
   「避免超出」。加深环（60%→100%）+ 贴边浓光（80%）就是在预算内做明显。

### 数据从哪来（顺带回答「有密钥就能拿头像吗」）

**能。** `GET https://gitee.com/api/v5/user?access_token=…` 返回的 User 资料里有
`avatar_url`，而且**与账号名同一次响应**（`login` 与 `avatar_url` 都在里面）——
所以头像不需要多打一次接口，`GiteeHost.validateToken` 顺手把它带回来即可
（`TokenInfo.avatarUrl`）。实测（2026-10-05，公开的 `/v5/users/sofqi` 与它同一个
User 模型）：

- 形状 `https://foruda.gitee.com/avatar/{id}/{uid}_{login}_{ts}.png`；
- 图床**公开**：不带令牌也能取到图片本身，`<img referrerpolicy="no-referrer">`
  也照常返回（探针页实测，见下）；
- 但「这个地址属于谁」只有带令牌问 `/user` 才知道 —— 匿名访问是 **401**
  （实测），而 Gitee 的匿名配额极低，所以**没令牌时一个请求都不发**。

### 三个必须记住的取舍

1. **不用 `addRibbonIcon`**。那个 API 建的是动作按钮（要 lucide 图标 + 点击回调），
   而且固定插在功能区**顶部**那一组。这里要的是底部的一张**账号头像**
   （不是 lucide 图标）—— 两个条件它都不满足。点击动作是自己挂的 `click` 监听，
   与那个 API 无关（2026-10-09 起可点，见上）。
2. **挂进 `.side-dock-settings`，不是 `.workspace-ribbon`**。后者自己 `display:flex`
   且里面已经有一个 `margin-top:auto` 的孩子（就是 `.side-dock-settings`），
   再给我们的节点一个 auto 边距会**平分**剩余空间 —— 后果是设置齿轮被顶到中间。
   追加进 `.side-dock-settings` 的最后一个孩子就落在最底部（DOM 顺序 = 视觉顺序）。
   移动端功能区在抽屉里（`.workspace-drawer-ribbon`），选择器清单里也留着那条。
3. **它是插进 Obsidian 核心节点的**，所以两件事必须做：`layout-change` 时重挂
   （功能区会被重建，`apply()` 幂等）、`onunload` 时摘掉（否则插件禁用后那张图
   还在，而谁也看不出是谁留下的 —— 与状态栏全宽那个类同一个教训；那个类本身
   已随 2026-10-09 的删除不再存在，教训留着）。

### 状态与竞态

- 头像地址**只在成功时缓存**，且按 **`平台 + 令牌`** 认身份：失败不缓存（用户中途
  补令牌就能生效）、换令牌或换平台就作废（换了账号要换图）。
  平台也要进身份键：两个平台恰好存了同一串令牌时，只按令牌认会把上一张头像当成
  新平台的画上去 —— 而那种错没有任何报错，只是「头像不对」。
- `inFlight` 同时挡重复请求与**过期结果**：请求还没回来时用户换了令牌/平台，
  先回来的那次必须丢掉（有用例钉着）。
- 令牌变了要重画：那三个入口（失焦保存 / 测试 / 清除）显式调
  `main.refreshRibbonAvatar()`。2026-10-06 起令牌与头像同处「通用」页，但这条
  仍然必要 —— 令牌那三个入口**都不走 `commit()`**（不落盘设置、只写密钥存储），
  没人会替它们调 `apply()`。

### 验证

- `tests/features/ribbonAvatar.test.ts`（32 条）：挂载点选择、开关/令牌为假时不发
  请求、底部追加、缓存、过期响应、清令牌/`destroy()` 摘节点、布局重建后重挂、
  **换平台**（重新解析、换图、悬停文案跟着换平台说、换到没配令牌的平台时摘掉、
  两平台同一串令牌也各解析一次）、**可点开设置**（挂了监听、点了真的走、
  重复渲染不挂出第二份、没传 onClick 时不挂也不抛错）。
- `tests/host/giteeHost.test.ts`：`validateToken` 带回头像、只发一次请求、
  非 http(s) 的 `avatar_url` 当作没有（空串会让 `<img src="">` 去请求当前页面）。
- `tests/pluginBoot.test.ts`：默认关时**一次 DOM 查询都不发**；开着且有令牌时
  真的走到「去功能区找位置」这一步（装配没断在半路）；**点头像那条链**——
  从装配好的 `RibbonAvatar` 里取出注入的 `onClick` 调它，一路走到
  `app.setting.open()` + `openTabById("ob-sync")`。
- `tests/features/settingsTabRender.test.ts`：`openGeneral()` 两半 ——
  没开窗时切「通用」再开窗、开着时就地重绘且不再开一次。
- **视觉实测**：`.probe/settings-preview/avatar-probe.html`（真 app.css + 真
  `styles.css` + 真 `RibbonAvatar` + 一个真的 Gitee 头像地址）——量到 28×28、
  `border-radius: 50%`、水平居中、贴在功能区底部；图床在
  `referrerpolicy="no-referrer"` 下返回 `248×248`（真的加载成功）。

### 补记：「换头像」的链接（2026-10-05，同一天）

用户要求：「在功能区展示头像设置项中，添加用户的 gitee 设置页链接，方便用户更换头像」。

头像是**账号资料**，插件改不了 —— 所以这一行能做的就是把人送过去。做法与 git 路径那一行的
下载链接完全一致：`descEl.appendText(引导语)` + `createEl("a", { href, target: "_blank" })`。

- **网址是常量** `GITEE_PROFILE_URL`（`settingsTab.ts` 末尾），与 `GIT_DOWNLOAD_URL` 同一条
  规矩：网址不随语言变，不进 locale；进 locale 的是链接**文字**（同 `gitPathLink`）。
- 地址选 `https://gitee.com/profile`（设置 → 基本设置 → 个人资料）：实测 2026-10-05
  `/profile` 可用、`/profile/avatar` 是 **404**（头像没有独立子页面），
  Gitee 帮助中心那篇「个人信息设置」里 `个人资料` / `基本信息` 两个链接指向的也是它。
- 用例：`tests/features/settingsTabRender.test.ts` 里那条
  「功能区头像那一行的描述里带可点的 Gitee 个人资料页链接」——钉 href、`_blank`、
  以及它挂在**这一行**（挂到别处就等于没做）。

## 五点十一、主题的新装入口（2026-10-05）

用户报的问题：「如果添加插件按钮填写的是主题地址，会因为缺少 main.js 而不通过，
能否优化一下，或许应该给添加主题添加一个按钮？」

### 根因不是文案，是**没有这条路**

在它之前主题只有两条路：**绑定**库里已经装好的（`bindExistingThemes` /
`bindThemeToRepo`）和**更新**已跟踪的（`updateTheme`）。也就是说 SyncHub 从来
没能把一个主题装到磁盘上 —— 把主题仓库地址填进「添加插件仓库」，`PLUGIN_SPEC`
要求 `manifests.json + main.js`，而主题根本没有 `main.js`，于是报
「缺少必需文件：main.js」。所以这次补的是**能力**，不只是提示。

### 三处刻意与插件不同的行为（`installTheme`）

1. **目录名 = 远端 manifest 的 `name`**（`themeFolderName`），不能当目录名时
   （`isValidThemeName`）回落到仓库名，两条都不行就报 `themeNameInvalid` 而不是
   「随便拼一个」—— 目录名会成为 `rmdir(folder, true)` 的目标。
   注意与 `updateTheme` 的「绝不改名」不冲突：那条说的是**已存在**的主题。
2. **不做镜像发现**（`allowMirror: false`）。主题的镜像判据是「名字相同 + 版本不比
   源旧」，它依赖本地已装的那一版；新装时手上还没有，判据不成立
   （见 `findGiteeMirrorForTheme`）。跑插件那套（按 `manifest.id`）只会更错。
3. **绝不替用户切换主题**，只在「装的正是当前主题」（重装场景）时 `requestLoadTheme`。
   与 `themeFolder.ts` 刻意不收 `setTheme` 是同一条规矩。

### 一条新的安全线：`themeNameConflict`

`themes/{名字}` 已经装着**另一个**主题时**拒绝写盘**（读不到 manifest 的目录、
名字大小写相同的目录都不算冲突 —— 那是同一个主题，覆盖它正是「重装」该做的事）。
理由：两个不同的主题完全可以同名，而被覆盖的可能是用户当前正在用的那一个，且它不在
跟踪列表里、没有「重新下载」这条路。这与插件的 `pluginIdConflict` 同一个性质。

### 入口与「填错门」的兜底

- 新入口：设置页「已跟踪」头部栏的**添加主题**按钮 + 命令
  `SyncHub：添加主题仓库`（`openAddThemeModal`）。
- `AddRepoModal` 现在按 `kind` 分叉（**同一个弹窗**，不是复制一份）：主题模式隐藏
  「浏览社区插件」（那走的是官方插件索引）、隐藏版本与启用开关。
- **失败之后**才会探一次对面那个标志性文件（`KIND_MARKER_FILE`，即 `main.js` /
  `theme.css`），确有就给「改为按主题安装」按钮。两个刻意的边界：
  1. 只认 `missingRequiredFiles` —— 网络类失败（`assetDownloadFailed`）被读成
     「你走错门了」会把人指去点一个换了也装不上的按钮；
  2. 只在这一刻读那一个文件（走源码 raw 通道，不花 API 配额，但 `main.js` 可能
     几百 KB），正常路径上一次都不读。

### 验证

- `tests/features/themeService.test.ts`：`installTheme` 13 条（落盘位置、改名回落、
  拒绝覆盖、允许重装、不做镜像发现、不兼容中止、`of: "theme"` 的报错）+ `resolveThemeRepo`。
- `tests/features/addRepoModal.test.ts`：主题模式 3 条 + 填错入口 4 条（含「网络类失败
  不给建议」那条反向边界）。
- `tests/features/settingsTabRefresh.test.ts`：新入口把重绘交回设置页（否则新装的主题
  不出现在列表里 —— 与插件那条同一个坑）。
- `tests/pluginBoot.test.ts`：命令 `add-theme-repo` 注册了。

## 五点十二、初始化仓库搬进设置页（2026-10-05）

用户的原话：「把仓库同步中远端地址的设置项移到了设置页了，但是把仓库 git 初始化
漏在了侧边栏面板里，请把仓库初始化按钮也放入设置页，保证仓库同步的基本设置能全部
在设置页中就完成」。

### 为什么它属于「连接测试之前」那一组

这一页的结构约定（2026-10-04 用户的话）是：**「连接测试」之前的每一项都必须是
「测试能通过」的充要条件**。而 `SyncService.diagnose` 的**第 2 步**就是「这个库是不是
git 仓库」（不通过就停在那里）—— 所以初始化是三个前提里最底层的一个：没有仓库，
远端地址与 git 路径都谈不上。它排在这一组的**最前面**，颜色上与「远端地址」「git
路径」用同一条分割线分在同一张卡片里（`prerequisites`）。

### 三个实现要点

1. **入口只有一个实现**：`ObsyncPlugin.initRepo()` 从 private 改成 public，并返回
   `boolean`（是否成功）。命令面板、侧边栏面板那个按钮、设置页这一行都走它 ——
   提示文案与 `.gitignore` 的处理不会分叉。返回值只给设置页用：成功后直接把徽标改成
   「已是」（**不再去问一次 git** —— 刚跑完的 `git init` 就是答案）。
2. **状态徽标只问一次**（2026-10-06 用户要求）：「监测过已经是 git 仓库的话，每次点进
   仓库同步设置页就不用再主动检测了，直接将标识固定就行，等同步时再验证即可」。
   原来每次重绘都起一个 `git is-repo` 子进程，结果回来才填徽标 —— 于是每次切进这一页
   都能看到徽标「弹」出来，还把下面的说明文字挤下去几像素。现在缓存在
   `ObsyncSettingsTab.vaultIsRepo`（**只在内存**：这个值会变，写进 `data.json` 就是
   一句没人纠正的假话；重启插件后重新问一次，代价一次子进程）。
   **读不到时什么都不说**（`catch` 里把徽标清空、按钮留着，且**不缓存**）——
   把「问不出来」说成「还没有仓库」会让用户去点一个不该点的按钮。
3. **已经是仓库时按钮置灰**：`git init` 幂等，点了不会坏，但一个「点了什么都不会发生」
   的按钮会让人怀疑插件坏了。徽标同时说明当前状态（「已是 git 仓库」）。

> 另一半在样式里：`.obsync-badge` 原来是 `line-height: 1.6` + `padding: 0.05em`，
> 实测**药丸 20px 而标题那一行只有 17px** —— 徽标一出现整行就被撑高 3px。
> 改成 `line-height: 1` + `padding: 0.15em 0.5em` 之后，「有徽标」与「没徽标」
> 量出来逐项相同。这类徽标大多是异步填的，所以这条对**所有**带徽标的行都成立。

### 验证

- `tests/features/settingsTabRender.test.ts`：新增 5 条（位置在远端地址之前、两种徽标 +
  按钮形态、点按钮走 `initRepo` 并刷新、问不出来时不猜）。既有的「连接测试之前只有两个
  前提项」那条**顺序用例**同步改成三个（它本来就是钉这个约定的）。
- `tests/pluginBoot.test.ts`：移动端调 `initRepo()` 返回 `false` 而不是抛错。
- `.probe/settings-preview/page.html?page=sync`（`&repo=0` 看「还不是仓库」那种形态）——
  两种状态都截图看过：徽标跟在名称后面、按钮形态符合预期、三行在同一张卡片里。

## 五点十三、按钮行的外观与图标（2026-10-05）

用户要求（一次四件事）：「添加主题」改名「添加主题仓库」；「绑定已安装的插件与主题」
改名「绑定已有插件或主题」，并在文字前加 lucide `link` 图标；「检查全部更新」改名
「检查更新」，并在文字前加 lucide `refresh-cw`；然后**把这排按钮的卡片去掉，只留按钮展示**。

代码在 `settingsTab.renderTrackedTab`。

### 卡片去掉 = 标题与说明也去掉

那一行原来是 `.obsync-section-header`：左边标题「已跟踪的插件与主题」+ 说明，
右边四个按钮。页签名已经叫「插件与主题」、列表下方还有一句空状态提示，**标题与说明
都是重复信息** —— 所以连卡片一起去掉了（`.obsync-section-header` 的三条 CSS 规则一并删除；
`settings.installer.tracked` / `trackedDesc` 两个 locale 键也删了，`pnpm check` 的
「未使用的 i18n 键」与「CSS 类覆盖」双双盯着这两件事）。新类是
`.obsync-tracked-actions`：`background/border/border-radius/box-shadow/padding` 四条
逐条归零（Obsidian 1.13 起 `.setting-item` 自己就是卡片），并让按钮**从左边排**
（`.setting-item-info` 空了，`display: none` 之后按钮不再被推到最右）。

> 仍然用 `Setting` 创建按钮，不用裸 `new ButtonComponent(...)`：设置页的「点了没反应」
> 那类问题在测试里靠 `createdSettings` 找按钮，直接 new 出来的对那套断言不可见。

### 图标：`setButtonText` 与 `setIcon` **不能连用**

从真机的 `main.js` 里读出来的两条实现：

- `setButtonText(x)` → `buttonEl.setText(x)` = **清空整个按钮**再写一段文字；
- `ButtonComponent.setIcon(i)` → 全局 `setIcon(buttonEl, i)`，而它的实现是
  「若第一个子节点不是同一个图标，**先删掉它**，再 append 图标」。

于是 `setButtonText("绑定…").setIcon("link")` 的结果是**只剩图标**（文字被当成
「第一个子节点」删掉了）。所以 `addButtonIcon()` 自己建一个 `.obsync-button-icon`
容器装图标，再 `prepend` 到文字前面；**换文字之后必须重新调一次**
（「检查更新」跑起来时会把文字换成「正在检查更新…」，那一下会把图标一起清掉）。

两个替身同步补上，否则这条路径在单测里看不见：

- `tests/stubs/obsidian.ts` 的 `ButtonComponent.setButtonText` 现在**真的**清空
  `buttonEl` 再写文字（原来只记 `text`），于是「图标在文字前面」可断言；
- `tests/setup.ts` 补了 `prepend`（语义照 DOM：已在文档里的节点是**移动**，不是复制）。

### 探针又抓到一个假阴性（这次是探针自己的错）

`.probe/settings-preview/page.html?page=tracked` 第一次渲染直接画出
`TypeError: buttonEl.createSpan is not a function` —— 真机上完全正常：
Obsidian 把这些 DOM 扩展装在 **`HTMLElement.prototype`** 上（`obsidian.d.ts` 里
`interface Element` 的全局增强就是它），而探针的 shim 只给「自己 `obsidianize()` 过的」
元素装。已在 `obsidian-shim.ts` 里改成补一次原型，并顺带让 `setIcon` 真的画出用到的
两个 lucide 图标（原来只写一个 `data-icon`，于是预览里**一个图标都看不见**）。

量到的结果（headless Chromium）：绑定按钮 `svg-icon lucide-link`、检查按钮
`svg-icon lucide-refresh-cw`，都是 18×18、在文字之前、与文字间距 5px；另外两个按钮没有图标；
按钮高度都是 30px（图标没有把按钮撑变形）。

### 验证

- `tests/features/trackedActionsRow.test.ts`（新，7 条）：四段文案、这一行没有标题与说明、
  两个图标的类名与**顺序**、另外两个按钮没有图标、「正在检查更新…」期间图标仍在且
  **只有一个**、三个弹窗入口各自连着自己那颗按钮。
- `tests/features/settingsTabRefresh.test.ts`：定位那一行的手改成了**按按钮文字找**
  （原来靠 `zhCN.settings.installer.tracked`，那个键已经删了）—— 顺带更贴近用户真正点的东西。

## 五点十四、别让大文件进 git（2026-10-09）

### 为什么做这个

一次实测：一个 159 次提交的笔记库有 **460 MB** 的 `.git`，其中插件构建产物 319 MB、
字体 186 MB、向量库缓存 84 MB，而真正的 markdown 只有 **63 MB**。
**仓库体积失控几乎从来不是笔记造成的**，而是那些「很大又几乎不变」的东西 ——
进一次历史就永久占着。

而 **git 的历史不可逆**：事后清理只能重写全部提交（`filter-branch`，见五点十五节），
而那是一件有风险、且按提交数计时的重活。所以**最便宜**的时机始终是**它进历史之前**，
预防分两层。

### 第一层：推荐忽略规则（`features/sync/recommendedIgnores.ts`）

字体（`ttf/ttc/otf/woff/woff2`，**大小写各一条**）、Office / LibreOffice 临时文件
（`~$*`、`.~lock.*#`）、以及可选的插件目录（`${configDir}/plugins/`）。

三条必须记住的：

1. **是「补齐」不是「覆盖」**。走 `mergeRuleLines`（与「让图片退出 git」同一套实现）：
   只追加缺的那些，用户自己写的规则一行都不动，可以重复点（幂等）。
   设置页那个「填入默认内容」是**覆盖式**的，两者别混。
2. **没有改 `gitignoreTemplate`**。模板只在**初始化仓库时**写入一次
   （`ensureGitignore` 见文件已存在就直接返回），对已经用了一阵子的库一个字都不生效 ——
   而恰恰是那些库才需要它。所以做成了「补齐」按钮，对新库老库都有效。
3. **插件目录是开关，不是默认项**（`ignorePluginFolder`，默认**关**）。
   `${configDir}/plugins/` 里的 `main.js` 是体积最大的单一来源，但**默认忽略它会改变产品
   行为**：换设备 clone 之后插件不会自动就位，得重新装。这是取舍，交用户选。

`configDir` 走 `vault.configDir` 而不是写死 `.obsidian`（用户可以改配置目录名，
写死的话那条规则一条都匹配不上 —— 与 `gitignoreTemplate` 同一个坑）。

### 第三类：本地状态文件（2026-10-10 追加）

`workspace.json` / `workspace-mobile.json` / `workspaces.json` / `*-position-cache.json`
（`localStateRules` + `matchesLocalState`）。

**这一类跟前面两类不是同一条轴**，加它是因为用户问了一个好问题：

> 「既然耗时吃提交数，那么定时同步的习惯岂不是给清理带来很大麻烦？」

**重写的开销只吃「提交总数」，与每个提交改了多少字节无关。** 于是：

- 20 MB 但有 10000 个「只改一行」的提交 → 重写约 10 小时；
- 500 MB 但只有 200 个提交 → 重写约 12 分钟。

而 `workspace.json` 这类文件**每开关一个标签就变** —— 让它们进 git，等于给每个同步
周期都准备好一个「有东西可提交」。**大文件拦截防的是体积，防不了这一条。**

在真实库上量过（learning-records，161 提交）：**空提交 0 个**（零改动时 `commit()`
返回 false，不写历史，所以定时器频率本身不推高提交数）；位置缓存出现在 **6 个**提交里
（3.7%），且**没有一次是它单独构成的**。

#### 为什么必须配一个「退出跟踪」的动作，而不只是加规则

**`.gitignore` 只管未跟踪的文件。** 对已经跟踪的 `workspace.json` 加规则一点用都没有 ——
它照样每次同步都被提交，而用户会得出「这功能没用」的结论。所以：

| 入口 | 做什么 | 对已跟踪的旧文件有效吗 |
| --- | --- | --- |
| 「补齐推荐的忽略规则」按钮 | 只写规则（幂等补齐） | ❌ |
| 「停止跟踪本地状态文件」按钮 | 写规则 + `git rm --cached` 已跟踪的那些 | ✅ |

**新建的库有 `gitignoreTemplate` 兜着，而已经在同步的旧库只能靠后者** ——
模板只在初始化时写一次（这正是当初做「补齐」按钮的同一个理由，当时漏了这几条）。

#### 三个实现细节

1. **规则行不能过 `ignoreRuleFor`**（它会补目录用的尾斜杠）—— `…/workspace.json/`
   一条都匹配不上，而且**不报错**，症状是「加了规则但文件照样被提交」。
   所以 `syncService` 拆了 `writeIgnoreLines`（收规则行）与 `writeIgnoreRules`（收路径）。
2. **`untrackLocalState` 不能包在一个 `enqueue` 里**：`writeGitignore` 与 `untrackPaths`
   **各自都进队列**，包一层就是自己等自己（2026-10-09 在 `rewriteHistory` 上踩过一次）。
   两步顺序执行、各自排队。
3. **`matchesLocalState` 只认配置目录正下方那一层**：`.obsidian/plugins/x/workspace.json`
   是插件自己的数据，归「插件目录」那一组 —— 误伤它会让这个按钮顺手摘掉别人插件的数据文件。

#### 弹窗与「什么时候不弹」

有已跟踪的才弹确认（列出要摘哪几个）；一个都没跟踪时**不弹** —— 那时只剩「补规则」，
不可逆性为零，为它弹窗只会训练用户闭眼点确认（`ConfirmUntrackLocalStateModal`）。

### 第二层：提交前的大文件拦截（`features/sync/largeFiles.ts`）

- **按大小判，不按类型判**：按类型要一张永远追不上的清单，按大小只需要一个数字，
  而且用户自己能理解。类型（扩展名）只留给界面展示。
- `pendingFilesForCommit(status)` 从仓库状态取「这次要提交的路径 + 是否已跟踪」。
  **去重规则与 `changeRows` 必须一致**（`AM` / `MM` 的文件两个状态位都非空），
  所以刻意写成同一套取法 —— 两处各写一遍就是那种「改了一处、另一处悄悄不对」的老问题。
  冲突文件不参与（有冲突时 `doCommitAll` 会先拦住）。
- 阈值 `largeFileThresholdMb`（默认 **5 MB**，**0 = 关闭**，与图片同步「最小体积 0 = 不限」
  同一个约定）。判据用 `>` 而不是 `>=`：文案说的是「超过 N MB」，正好等于 N 的文件不该被点名。
- 大小通过 `vault.adapter.stat()` 取，**串行**而不是 `Promise.all`（一次改动可能上千个文件）；
  取不到大小（文件刚被删 / 读不了）就跳过，不让整条提交链路失败。
- `SyncOutcome` 加 **`large-files-pending`**，与 `conflict` **同构**：都是「不能替你决定、
  也不能假装成功」的状态。`sync()` 遇到它**立即停链路** —— 继续提交会把大文件写进历史，
  继续拉取/推送没有意义，而用户看到「同步完成」却发现文件没上去比直接告诉他更糟。

### 交互：唯一出口是弹窗（`ui/LargeFilesModal.ts` + `ui/largeFileGuard.ts`）

- 弹窗两个选择，**各自的代价当场说清**：**仍然提交**（以后每次改动都会在历史里再存一份
  完整副本）或**退出跟踪并忽略**（不再有版本历史、本地文件保留；**历史里已有的副本不会消失**，
  仓库体积不会因此变小 —— 与 `ConfirmUntrackImagesModal` 同一句提醒）。**关掉弹窗 = 取消**。
- **四个入口共用一份包装**（面板的「提交」「立即同步」、命令面板两条命令）：
  `runWithLargeFileGuard` 负责「跑一次 → 被拦下就弹窗 → 用户选完带 `allowLargeFiles: true`
  重跑」。四处各写一遍的话，漏掉的那一处表现是**静默不提交**（点了没反应），最难发现。
  面板与命令面板各有一份 `largeFileGuardDeps()`，形状必须一样。
- `allowLargeFiles` 是**一次性放行**：`sync()` 里拉取合并后的**第二次提交**传 `true`
  （内容就是刚提交的那批，第一次已经问过了，不再重复问）。
- **自动同步不弹窗**（`automatics.ts`）：无人值守场景下弹窗没意义，改为发一条通知，
  并说清「为什么停」与「去哪处理」。只要文件还在，自动同步就一直停着 ——
  每次到点都提示一次是**有意的**，那是这个停顿唯一的表现。
- `ignorePaths(paths, trackedPaths)` **只对已跟踪的路径摘索引**：对不存在的索引项执行
  `git rm --cached` 会直接报错（`did not match any files`），而大文件清单里必然混着
  未跟踪的新文件 —— 一把梭会让整批操作失败。忽略规则则对所有路径都加。

### 设置项的收敛（`core/settings.ts`）

`largeFileThresholdMb` 非数字 / 负数**回退默认值**而不是钳到 0 —— 0 是「明确关掉」，
不该是「填错了」的结果，否则一个手改坏的字段会静默关掉防护；再 `clamp(0, 1024)`
（再大就等于关了）。设置页的 `min` / `max` 必须与这里一致，否则会出现「框里能填、
存下去又被改掉」那种新的谎。

### 测试与验证

- `tests/features/largeFiles.test.ts`、`recommendedIgnores.test.ts`、`syncService.test.ts`
  新增 35 个用例；`automatics.test.ts` 顺带修了一处**替身不忠实**：假 service 的
  `sync()` 原本声明 `Promise<void>`，而真实实现返回 `SyncOutcome`，消费方读 `.kind`
  会 TypeError 并被当成「同步失败」走进连续失败计数（看起来像功能坏了）。
- `pnpm check` 八项全过（CSS 类覆盖 193/193）、`pnpm typecheck`、`pnpm lint:review`、
  `pnpm test`（90 文件 1915 用例）全绿；`pnpm build:both` 部署到 Plugin-Test 与
  learning-records，三产物 SHA256 与源码一致。

## 五点十五、清理（体检 / 回收 / 深度清理，2026-10-09）

用户原话：**「与其严防死守，不如为插件添加清理能力」**「为增加插件的清理功能，
保持仓库体积的膨胀在合理范围」。五点十四节那两层是**预防**（别让大文件进去），
这一节是**事后**（已经进去了怎么办）。

### 三层，风险递增

| 层 | 手段 | 风险 | 对已膨胀的历史有效吗 |
| --- | --- | --- | --- |
| **体检** | `rev-list --objects --all` + `cat-file --batch-all-objects --batch-check` | 零（只读） | 只是看 |
| **回收** | `git gc --prune=now` | 零 | **只对不可达对象有效** —— 实测一个 452 MB 的库跑完还是 452 MB |
| **深度清理** | `git filter-branch --index-filter 'git rm -r --cached …'` | **高**（改全部哈希、要强制推送） | **唯一有效的一层** |

三层分开成三个方法（`GitManager.historyObjects` / `gc` / `rewriteHistory`），
而不是合成一个「清理」—— 让「风险」在**类型层面**也看得出来，调用方不可能不小心
把重写当成体检跑掉。

### 实测数据（2026-10-09，本机 git 2.55.0.windows.3）

在一个 159 提交 / 452 MB pack 的真实库副本上跑了一次完整的 filter-branch：

| 项 | 结果 |
| --- | --- |
| 中文路径 | ✅ 正常（`rm '④忌-复原/附件/Fonts/屏显臻宋.ttf'`）—— **不是问题，别为它写特殊逻辑** |
| **耗时** | **551 秒（9 分 11 秒）** ≈ **3.5 秒/提交** |
| 正确性 | ✅ 排除目标路径后新旧两棵树**零差异**；markdown 清单哈希一致 |
| 提交数 / 文件数 | 159 → 158（一个空提交被 `--prune-empty` 摘掉）/ 2838 → 2792（少 46 = 5 字体 + 41 插件，数目吻合） |
| 体积 | `.git` 461M → 284M；整仓 568M → 331M |
| 回收 | `gc --prune=now` 只用 **3 秒** |

**3.5 秒/提交是这一层的核心约束**，写在 `cleanup.ts` 的 `REWRITE_SECONDS_PER_COMMIT`：
耗时随提交数线性增长，所以**可以估**，而界面必须**在动手前**把预计耗时算给用户看
（`estimateRewriteMinutes`）。估算**宁可偏高** —— 说「1 分钟」结果跑了 9 分钟，
用户会以为卡死然后强杀进程，而**中断正是这个动作最坏的结局**。

#### 系数为什么可信：两次独立测量（2026-10-09）

| 库 | 提交 | 索引文件 | `.git` | 耗时 | 每提交 |
| --- | --- | --- | --- | --- | --- |
| 大库（真实笔记库的副本） | 159 | 2838 | 452 MB pack | **551 秒** | 3.47 秒 |
| 小库（合成：小笔记 + 少量大文件） | 137 | 306 | 5.5 MB | **486 秒** | 3.55 秒 |

**两次几乎完全一致，而库体积差 80 倍、文件数差 9 倍。** 结论：

- 每提交的代价**几乎与库的大小无关** —— 瓶颈是**每个提交起一次 git 子进程**
  （`--index-filter` 的定义如此，Windows 上进程创建尤其贵），**不是 I/O**；
- 所以 `estimateRewriteSeconds` **只吃提交数**这一个参数是对的。一度想按库大小
  调系数（「小库会快很多」），测下来是**错的** —— 别加那个参数；
- 实测校验：`estimateRewriteSeconds(137)` = 485 秒，实测 486 秒，**差 1 秒**。

用户曾问「为什么无论勾选什么，提示都是估计 9 分钟」—— 答案是**这是对的**：
重写逐提交处理，勾 1 条与勾 10 条处理的提交数完全相同。界面原来没写这一句，
于是那个恒定的数字看起来像写死的；现在报告页与确认页各有一句说明
（`report.selectNote` / `confirm.estimate`）。

### 六个必须记住的实现点（每一个都对应一次真实的坑）

1. **重写的引用集合是 `--branches --tags --remotes`，不是 `--all`。**
   `--all` 是「refs/ 下的全部」，会把 `refs/obsync-backup/*` 也一起改写 ——
   备份于是**安静地**指向新历史，等于没有备份，而且不报错。
   在合成仓上实测确认过这个差别（分支/标签/远端引用全被重写、备份 ref 原样保留）。
   备份引用名因此挂在 `refs/obsync-backup/<时间戳>` 下（`cleanup.ts` 的 `backupRefName`）。
2. **备份引用在动手之前建，不是事后补。** 重写中途被强杀（用户关掉 Obsidian、系统休眠）时，
   `previousHead` 已经从所有引用上消失了 —— 事后补建是补不出来的。
3. **超时必须按预计耗时放宽。** `GIT_BLOCK_TIMEOUT_MS` 是 2 分钟，对同步的每一步都够，
   但会让一个 9 分钟的重写**在第 2 分钟被杀掉**，而那时它已经改了一半引用 ——
   这种「报错与后果对不上」的失败最难收拾。所以 `createGitInstance` 多了一个
   `timeoutMs`，`rewriteHistory` 传 `预计耗时 × 3`。
4. **`.git-rewrite` 残留必须先清。** 上一次中断会留下它，而 filter-branch 见到它直接
   `fatal: .git-rewrite already exists, please remove it` 并以 EXIT=1 退出 ——
   用户看到的是「点了没反应」。**两个候选位置都要清**：标准位置是 `$GIT_DIR/.git-rewrite`，
   但 `GIT_DIR` 被显式设成仓库根时（终端里带变量启动 Obsidian）它落在**库根**，两种都遇到过。
5. **锁内不能调 `writeGitignore`（会死锁）。** 它自己也进 `enqueue`，而 `rewriteHistory`
   已经在队列里 —— 于是自己等自己，症状是「点了深度清理之后界面卡住不动」。
   拆出无锁的 `writeGitignoreNow` 给它用（2026-10-09 实测踩到，测试用例钉着）。
6. **重写之后必须顺手写忽略规则。** 重写只把路径从**历史**里拿掉，工作区文件一个都没动 ——
   它们变成未跟踪文件，下一次 `git add -A` 原样加回来。用户看到的是「清理完又自己长回来了」，
   根因是「历史清了、忽略没加」。两件事本来是一件。走 `ignorePaths(paths, [])`
   （**不摘索引**：这些路径刚被重写掉，对不存在的索引项 `git rm --cached` 会直接报错）。

### 体检为什么按目录、以及为什么用 `--batch-all-objects`

- **按顶层目录汇总**，因为**剔除的单位就是路径**：报告里每一行正好是一个可以拿去执行的动作。
  按「最大的 20 个文件」汇总没用 —— 剔起来还得一个个挑。
- 只统计 **blob**：tree 与 commit 加起来通常不到千分之一，混进「谁占得多」只会让差距变小。
  但 `objectCount` 仍然是全部可达对象 —— 那回答的是另一个问题（「对象多不多」）。
- 库根文件归到 `.` 这一行（与 `normalizeFolders` 同一约定），**不提供勾选**：
  剔掉它们等于清空整个库。
- 用 `--batch-all-objects` 而不是「把 sha 喂给 `--batch-check` 的标准输入」：
  后者要求往子进程写 stdin，而本项目的 git 调用统一走 simple-git 的 `raw()`，**没有 stdin 通道**。
  代价是输出包含不可达对象 —— 由 `summarizeHistory` 按可达集合取用。
- `-c core.quotePath=false` 不能省，否则中文路径被转义成八进制串，报告里一屏看不懂的东西。

### 界面（`ui/CleanupReportModal.ts`，一个弹窗三种状态）

体检 → 确认 → 结果挤在**一个**弹窗里，因为**返回上一步必须存在**：用户看到「所有提交的
哈希都会变」之后最常见的反应是「等等，我再看一眼要剔哪些」，而重开一遍要重读几秒历史 ——
于是没人会返回。返回的成本应该是零。

- 一个都没勾时「开始重写」置灰（不是点了才知道白点）；
- 确认页把**三条后果**逐条列出 + 预计耗时；
- 结果页必须说清三件事：备份在哪、**为什么空间还没变小**、接下来要强制推送。
  第二件不说的话，用户会拿「体积没变」当成「清理没生效」。
- **关掉弹窗 = 什么都不做**（与 `ConfirmUntrackImagesModal` 一致）：重写历史没有
  「点了才后悔」的余地。

### 关于 `--force` 与 `--force-with-lease`

重写之后 `refs/remotes/*` 也被一起改写了，所以 `--force-with-lease` 比对的那个值是**新的**，
永远不会拒绝 —— 那是一个**看起来安全、实际没有保护**的开关。与其留一个假的保护，
不如用 `--force` 并在界面上把话说清楚（`forcePush` 的注释里写了这段）。

### 验证

- `tests/features/historyObjects.test.ts`（15 条）、`cleanup.test.ts`（15 条）—— 纯逻辑；
- `tests/features/syncService.test.ts` 新增「清理」一组 8 条：回收返回释放量、
  体积读不出来返回 `undefined`（不编 0）、重写后写忽略规则、**不摘索引**、
  **排在队列里**、强制推送、只读动作不排队；
- `pnpm check` 八项全过（`obsync-backup` 进 `NOT_A_CLASS` —— 它是引用前缀不是 CSS 类）、
  `pnpm typecheck`、`pnpm lint:review`、`pnpm test`（92 文件 **1953** 用例）全绿；
- `pnpm build:both` 部署到 Plugin-Test 与 learning-records，三产物 SHA256 与源码一致。

## 六、同步模块（阶段三）实现要点

文件都在 `src/features/sync/`。

**鉴权**（`auth.ts`）：远端是 GitHub/Gitee 且 secretStore 里有令牌时，通过
simple-git 的 `config` 选项（字符串数组，逐项 `-c key=value`）给每条命令注入
`http.extraheader=Authorization: Basic base64(user:token)`，不落盘、不进 remote URL。
simple-git 实例按「远端 URL + gitPath」缓存，`setRemoteUrl`/设置变更后重建。

> 验证边界（`tests/features/authWire.test.ts` 里也写了）：
> - ✅ simple-git 的 `config` 数组 → git 命令行的 `-c`（测试：让 git 在同一次调用里读回该配置）
> - ✅ git 把该配置变成 HTTP 的 `Authorization` 头，且**在第一个请求就带上**、
>   不等 401 挑战（`tests/features/authHeader.test.ts`：本地 HTTP 服务器实测
>   `/info/refs?service=git-upload-pack` 已带正确头）
> - ✅ **Gitee 服务端确实读取并校验这个头**（`tests/live/giteeGitAuth.live.test.ts`，
>   2026-09-17 实跑通过）：带伪造凭据会被拒（401 挑战），不带凭据可匿名读公开仓库。
>   两条同时成立才说明机制有效 —— 若 Gitee 忽略该头（当匿名请求处理），
>   公开仓库照样能读成功，那就说明这个机制在它这里不成立。
> - ✅ **用户名必须用 Gitee 认的值**（查出来的一个真 bug，见
>   `docs/reference-analysis.md` 差异 6）：Gitee 只接受 账号名 / `oauth2` /
>   `gitee.com`，之前填的 `git` 会被服务端**直接拒绝**。现在由
>   `IRepoHost.gitAuthUsername` 声明（Gitee → `oauth2`、GitHub → `x-access-token`）。
>   这条单测发现不了 —— 我们构造出的 Basic 头本身合法，不合法的是对端接不接受。
> - ✅ **有效令牌在真实私有仓库上被接受**（`tests/live/privateRepoAuth.live.test.ts`，
>   需 `OBSYNC_LIVE_PRIVATE_REPO` + 令牌，未配置则整组跳过）。
>   结构是「对照组（不带凭据必须失败）+ 接受（带令牌必须成功）」——
>   缺了对照组，「成功」什么也证明不了。
>   2026-09-17 用 GitHub 私有仓库实跑通过；Gitee 那边配上令牌即可同一条命令跑完。
> - ❌ **有效的 Gitee 令牌是否被接受** —— 需要真实 Gitee 令牌与私有仓库
>   （我没有 Gitee 令牌，只有 GitHub 的）。这是 PLAN.md 风险表第一条，
>   也是**目前唯一剩下的待实测项**。跑法见上面那条 live 测试的文件头。
>   注意：**「测试连接」发现不了用户名问题** —— 它走 `ls-remote`（fetch 路径），
>   而 Gitee 的用户名白名单只在 **push 路径的服务端钩子**里执行（实测：用伪造令牌
>   打 fetch 端点时，`git` / `oauth2` / 随机串返回完全相同的通用 401）。
>   所以这条必须靠一次真实 push 收尾；失败的回退方案是 askpass 弹窗
>   （obsidian-git 的做法，见其 simpleGit.ts:249）。

**pull 三态**（`simpleGitManager.ts`）：先 fetch、比较本地/远端引用（照搬
obsidian-git 验证过的形态），merge/rebase 直接整合；**reset = stash 保护（含
未跟踪）+ `reset --hard`**。注意 obsidian-git 的 reset 用的是 update-ref +
普通 reset，会让工作区与 HEAD 脱节、下次提交把远端改动倒推回去 —— 我们刻意
不用那套。

**冲突哲学**：不自动解决。merge/rebase 冲突 → 抛 `ConflictError` →
syncService 在库根目录写《SyncHub 冲突指南.md》（冲突文件清单 + 处理/放弃指引）
→ **sync 链路立即停止**（继续提交会把冲突标记写进历史，继续推送会推上远端）。
恢复出路：手动解决后「立即同步」，或「放弃当前合并」（abortMerge）。

**并发**（`syncService.ts`）：所有动仓库的操作走一条 promise 串行队列；
`isBusy` 供自动定时器判断「跳过本轮」。sync 链路：提交 → 拉取 →（拉到东西就
再提交一次）→ 推送；推送前检查远端是否存在、ahead 是否 > 0。

**自动定时器**（`automatics.ts`）：照 obsidian-git 的剩余时间模型 ——
每次执行把时间戳写 localStorage，启动时按 `间隔 - 已流逝` 起表，
重启不重置周期；间隔 0 = 关闭，错过不补跑。

**状态栏**：由 service 在动作前后显式驱动（不跑轮询），展示
分支 / ↑ahead ↓behind / ~脏文件数 / ⚠冲突数 / **✓（与远端完全一致时）**。
条目排在状态栏那一簇的**最左侧**、其余条目留在原位 —— 靠 CSS 实现
（`body.obsync-status-bar-left` + `.obsync-status-bar-item` 的 `order: -1` /
`margin-right: auto`），**不碰 DOM**。
别改成 `prepend`：状态栏是「收缩到内容宽 + 靠右下」的，按 DOM 顺序把它插到
最前会把别人的条目整体右移一个条目的宽度（实测 1280 视口下 130px，用户当场
发现「其他图标全被挤走了」）。

> **「把状态栏拉成全屏宽」的规则 2026-10-09 删了**（连同当时的设置页开关与
> `main.ts` 的 `applyStatusBarWidth()`）。用户原话：
> 「取消状态栏占满整屏框设置项，状态栏不再设置全宽，保持同步条目贴靠最左侧即可」。
> 拉宽（`left/right: 0` + `width: auto`）确实能让条目贴到**屏幕**最左，但代价是
> 状态栏的**整体观感**从「右下角一簇」变成「底部一条」—— 那是用户自己的界面，
> 用户选择不要这个代价。条目改成贴在这一簇的最左侧（`order: -1`），功能不变；
> `margin-right: auto` 留着，主题自己把状态栏拉宽时它保证条目仍靠最左。
> 老 data.json 里残留的 `statusBarFullWidth` 字段会被 `mergeWithDefaults` 自然丢掉
> （只保留默认值里有的键），不需要迁移代码。

> **同一天用户又要求把「贴最左」做成开关**（原话：「在通用下添加'状态栏同步条目
> 贴靠最左侧'设置项，默认开启，开启时即现在的表现，关闭时，同步条目的位置不再
> 作特殊处理」）—— 即 `statusBarLeftAlign`（默认开）。做法与全宽那个**同构**：
> `main.ts` 的 `applyStatusBarLeftAlign()` 按设置给 body 加/摘
> `obsync-status-bar-left`，CSS 规则整条挂在它下面；关掉后规则不生效，条目按
> Obsidian 默认顺序排（追加在其他条目后面）。**与全宽那个的区别**：这个只管
> 条目顺序，不碰状态栏宽度 —— 关掉它状态栏也仍是 Obsidian 原样。

条目**可以点开**仓库同步视图（`SyncDeps.openSourceControlView` → 主类的
`openSyncView()`）：它是屏幕上唯一常驻的同步入口，此前完全不可点。悬停提示
（`aria-label`）每次渲染时写入，所以切换语言后也跟着变（见五点八第 2 条）。

### 「尝试推送后一直看到正在推送」——两个独立成因（2026-09-19）

用户这句话下面有两个**互不相干**的故障，都查实了：

**一、状态栏的活动态没有终点（真 bug，已修）。**

`activity` 是 `StatusBar` 的实例状态，而它的 `render()` 在活动态下
**只显示活动文案并直接返回** —— 只要没人把它改回 `idle`，状态栏就永远停在
「正在推送…」，而且**连分支 / `↑ahead ↓behind` / 脏文件数都不再显示**，
一直到重载插件为止。而在此之前的整个 `src` 里，`setActivity("idle")`
**一次都没出现过**（`git log -S` 查过：从来就没有）。

它一直没被发现，是因为 `statusBar.test.ts` 那条「活动态盖过仓库状态，动作结束后
能恢复」是**手工调** `setActivity("idle")` 验的 —— 验的是「这个 API 能恢复」，
而不是「服务真的会调它」。缺的正是后者。（同一类问题见第七节「测试约定」。）

现场证据：用户库里 `master == origin/master`（`rev-list --left-right --count` 是
`0 0`）—— 也就是说他点的那次推送**早就结束了**（本地根本没有新提交，
`doPush()` 在 `ahead === 0` 时直接返回 `up-to-date`），界面却还在说它正在进行。

修法：`SyncService.withActivity(activity, run)` 把「设活动态 → 跑 → **在 finally 里
恢复成 idle 并刷新状态**」收成一处。收在 `finally` 是因为**出错时更需要恢复**：
失败会让用户盯着「正在推送…」等一个永远不会来的结果。现在有 4 条用例钉着
（提交 / 拉取 / 推送 / 完整同步，外加**出错路径**）。

**二、git 可能真的在等人回答（已加护栏）。**

git 拿不到凭据会**提问**（终端提问，或 Windows 上 Git Credential Manager 的弹窗 ——
实测环境里 `credential.helper` 就是 PortableGit 带的 GCM）。Obsidian 里没有人能回答：
那个提问读的 stdin 是一根没人写的管子，命令就这么挂着，`isBusy` 永远是 true，
后续所有同步动作都排在它后面（连自动定时器也一直跳过），用户只能重载插件。

护栏两条，都在 `createGitInstance()` 里（**所有 spawn 路径统一走它** ——
原来 `git()` 与 `rawGetRemoteUrl()` 各自 `simpleGit(options)`，逐处补设置必然漏一处）：

- `GIT_TERMINAL_PROMPT=0` + `GCM_INTERACTIVE=never`：**禁的是「问人」，不是「用凭据」**
  —— 已存进系统凭据助手的凭据照常可用，所以自建 GitLab / 内网 git 那类用法不受影响。
  拿不到凭据时 git 报 `could not read Username ... terminal prompts disabled`，
  被 `mapError` 归到鉴权失败 → 用户看到「请检查访问令牌」这句有用的话。
- simple-git 的 `timeout.block`（120 秒**无输出**超时）：卡死不再是「永远」，
  而是超时中止 + `GitTimeoutError` → 「git 长时间没有响应，已中止，请检查网络」。

> 无输出超时靠「有没有输出」判断死活，所以 push/fetch 都带上了 `--progress`：
> git 在 stderr **不是终端**时默认**不打传输进度**（我们正是这种情况），
> 不带它的话，一次慢但正常的传输会被当成卡死杀掉。

**三、顺带补的一句反馈。** 用户主动点「推送」而本地没有新提交时，界面原来
**一点变化都没有**（状态栏还卡在活动态），他没法区分「没东西可推」和「卡住了」。
现在这类入口（命令、视图按钮）会明确说「没有需要推送的内容，本地与远端一致」，
自动推送定时器则**不**说（每 N 分钟弹一次是噪音；`announceIfUpToDate` 参数区分）。

**四、「推送」是单纯的推送（用户问出来的）。** 原话：「推送按钮是单纯的推送还是
提交全部加推送，如果是后者应该写清楚」。答案是前者 —— `doPush()` 里只有
`git push -u origin <branch>`，**不含任何提交**。但按钮上只有两个字，用户是**问了
才知道的**，那就说明界面没写清楚。补上三处：

- 视图三个动作按钮的悬停提示：`actSyncHint`（提交 → 拉取 → 推送，一条链走完）、
  `actCommitHint`（提交到本地，不推送）、`actPushHint`（只推送**已提交**的内容，
  不会自动提交）；
- 用户主动推送的三种结果各说一句：无提交且工作区干净 → 「没有需要推送的内容」；
  无提交**但**有 N 个未提交改动 → 「推送只发送**已提交**的内容，而你有 N 个更改
  还没提交」（原来这句会说成「没有需要推送的内容」，听起来像「一切正常」，
  而真实情况是「你的改动一个都没上去」）；推送成功但仍有未提交改动 →
  「已推送到远端，另有 N 个尚未提交」；推送成功且干净 → 「已推送到远端」；
- README 中英的同步一节写清「提交」与「推送」是两个动作。

那个 N 必须与面板里的列表**同一套规则**（按路径去重、排除冲突文件），否则用户会
拿它和面板里的列表对不上、以为插件在乱数 —— 所以那条规则从视图里搬到了
`src/features/sync/changeRows.ts`，视图与提示共用一份（同一份规则曾经在两处
各写一遍就是「改一处、另一处悄悄不对」的老问题）。

**五、「提交并推送」——加了又删（2026-09-19，同一天）。**

用户先要求加一个「提交并推送」按钮（= `sync()` 去掉拉取），加完并解释了区别之后，
他又判定**不需要**：「立即同步的功能已经是万全之策」。于是**按钮、命令、服务方法
一起删掉**（留着没人调的方法就是死代码 —— 见第七节的死代码清点），
并把他要的布局改成：**四个动作同一行**（`立即同步` / `提交` / `拉取` / `推送`），
`提交全部` 的按钮文案缩短为 `提交`。

值得留下的结论（别再加回来）：

- 需要「不拉取」的人用 `提交` + `推送` **两步**即可，没必要为它单开一个复合动作；
- 四个按钮在窄侧边栏里可能换行 —— 交给 CSS（`.obsync-actions` 让
  `.setting-item-control` 允许换行），**换行总比溢出把按钮挤没了好**；
- 「提交」只是文案短了，行为没变（仍是暂存全部 + 提交），命令面板里那条仍叫
  「提交全部更改」（那里空间够，写清楚更好）。

**六、提交信息不用用户填（也是用户问的）。** 原话：「提交是不是必须填写备注信息？」
答案是不用 —— 提交信息由 `settings.sync.commitMessage` 模板自动展开
（默认 `vault backup: {{date}}`，支持 `{{date}}` / `{{hostname}}` / `{{numFiles}}` /
`{{files}}`，见 `commitMessage.ts`），**全程没有任何输入框**。要改措辞就去设置页改模板。
（这也解释了为什么日志里会出现 `vault backup: …` 这种提交信息 —— 那是模板的默认值。）
（**2026-10-02**：默认值改成 `vault backup: {{date}} ({{numFiles}} files)` ——
用户要求带上文件数。注意**已有用户的 `data.json` 不会被改写**，见第三节七。）


**八、体积展示与「与远端一致」的醒目反馈（2026-09-19）。**

用户要求：「展示提交仓库的大小，并且当提交结束与远端一致时，给出醒目的反馈」。
（追问后确认体积要**两种都显示**。）

**两个体积回答两个不同的问题**，所以面板里是**两块并排**（2026-09-19 晚从两行改成
两栏 —— 两个「标签 + 数值」各占一行太浪费侧边栏，但它们仍是两个独立的 `Setting`，
只是挂在同一个 `.obsync-metrics` 容器里）：

| 块 | 怎么来的 | 回答什么 |
| --- | --- | --- |
| 仓库大小 | `git count-objects -v`（松散 + pack，KiB → 字节）+ 对象数 | 这个库有多大 / 推送大概要传多少 |
| 待提交改动 | 把 `changeRows(status)` 里各文件的大小**加起来**（`vault.adapter.stat`） | 这次要传上去多少 |

- `count-objects` **不加 `-H`**：`-H` 会输出 `12.34 MiB` 这种字符串，还得反过来解析它
  的单位选择规则。用默认 KiB 自己换算更可靠（`parseCountObjects` 是纯函数，fixture
  逐字照抄真实输出）。
- 待提交体积是**近似值**：git 不直接给字节数，实际传输量还看压缩率；删除的文件本来
  没有体积。取不到大小的文件按 0 计（**不让它失败**：这只是个参考数字）。
- **读不到时说「读不到」，绝不显示 `0 B`** —— 0 B 会被当成「空仓库」，那是个错误的结论。

**「与远端一致」的判据只有一处**（`syncState.ts` 的 `isFullyInSync`），因为有三个
消费方：同步结束的醒目提示、状态栏的 `✓`、面板里那一行的绿色高亮。三处各写一遍就会
出现「状态栏打了勾、提示却说没同步」。判据是**全部满足**：有 upstream（`ahead`/`behind`
不为 null）、不领先、不落后、无冲突、无未提交改动。

> 顺带修掉一句**假话**：原来「推送」在 `ahead === 0` 时会说「没有需要推送的内容，
> **本地与远端一致**」—— 而 `ahead === 0` 完全可能还**落后**远端（别人推过）。
> 现在那句只说「本地没有新提交」，真正的「一致」由 `syncedInSync` 说。

**反馈的三种强度**（关掉「显示操作结果提示」的人仍然看得到后两种）：

1. **醒目提示**（`Notifier.synced`）：带绿色对勾元素、停留 8 秒（普通提示是 5 秒），
   文案带 ✓ 与仓库体积。普通 `success` 一闪而过，而这一条是**结论**。
2. **状态栏 `✓`**：一切正常时才有 —— 否则「同步完了吗」只能靠「没有任何标记」回答，
   而那和「还没看过」长得一样。
3. **面板里那一行转绿加粗**。

`after` 回调（`withActivity` 的第三个参数）只在**成功**时跑：失败后说「与远端一致」
只会让人困惑。它拿到的状态是动作**之后**刚刷出来的那份 —— 所以「推送后是否一致」
判断的是结果，不是动作前的状态。

验证：820 条用例（+36）。变异：把 `isFullyInSync` 里的「无未提交改动 / 无冲突」两条
去掉 → 6 条用例失败（说明这两条真的被钉着）。

**七、为什么默认链路是「提交 → 拉取 → 推送」（用户问的）。**

- **拉取是为了让推送能被接受。** git 的 `push` 只能快进：远端有你没有的提交时推送会被
  直接拒绝（接受它等于丢掉那些提交）。而这个插件的用途就是多设备同步，所以
  「提交 → 推送」在两台设备上会**稳定失败**，不是偶发失败 —— 这就是它必须默认带拉取的原因。
- **拉取排在提交之后，不是之前。** 先提交 → 你的改动进了可恢复的提交，之后整合远端
  动的是提交层面的事；真出问题，`abortMerge()`（放弃本次合并）能回到拉取之前，而改动仍在。
  反过来先拉取：工作区有未提交改动时 git 要么拒绝合并
  （`Your local changes would be overwritten`），要么把未提交改动与冲突标记混在一起 ——
  用户分不清哪些是自己的，也没有一键回到干净状态的路。
- **拉取之后可能再提交一次**（`sync()` 里的「二次提交」）：整合产生的合并提交/新状态
  要一起推上去，否则推上去的不是完整状态。
- **代价**：拉取会动工作区，而策略可配（`merge` 默认 / `rebase` / `reset`）。
  **`reset` 会丢弃本地提交**（`resetToRemote` 先 stash 保护未跟踪与未提交改动，再
  `reset --hard`），选它的人要清楚这一点。确实不想让拉取碰工作区时，分两步走
  即可（`提交` → `推送`）—— 这正是「提交并推送」被删掉的原因（见上面第五条）。
- 自动定时器（`autoCommitMinutes`）走的是**完整链路**：无人值守时更需要先拉取，
  否则每 N 分钟一次「推送被拒」，永远同步不上去。

验证边界：`GIT_TERMINAL_PROMPT` 这类环境变量只由 simple-git 的替身验「我们交给了
它什么」是不够的，所以另有一条**真 git** 用例用 **git 钩子**当观察点
（钩子是 git 自己用 `sh` 起的子进程，拿到的是 git 进程的环境），断言它打出
`0/never`；去掉 `.env()` 那两行，它打出 `/`（实测）。用 `-c alias.x=!…` 的写法
走不通 —— simple-git 默认禁止配置 alias（`allowUnsafeAlias`）。

**连接测试**（`syncService.diagnose()` + 设置页「仓库同步」页底部）：
一条递进的检查链 —— git 可执行文件 → 是否 git 仓库 → 有没有远端 →
平台能否识别（决定能否注入令牌）→ **真的 `ls-remote` 连一次**。
任何一步失败就停（后面依赖前面的前提）。

存在的理由：**鉴权配得对不对，光看设置项判断不了** —— 令牌填了不代表有效，
仓库是私有的才知道。只有真的连一次才有答案。

两个设计点：
- 结果是**结构化**的（`DiagnosticCheck { id, status, detail }`），文案由设置页按
  `id` 取 locale。所以 `diagnose()` 不依赖 i18n，可以单独测。
- 「平台认不出」与「没配令牌」都标成 `skipped` 而**不是 failed** ——
  它们只意味着注入不了令牌，用户仍可走系统凭据助手；报成失败会误导人去改一个
  没问题的配置。
- `testRemoteAccess()` 用 `ls-remote` 而不是 `fetch`：**只读**，不动 refs / index。
  这条性质有测试锁着。

**命令**：立即同步 / 提交全部 / 推送 / 拉取 / 初始化仓库 / 放弃当前合并 /
编辑远端 / **编辑 .gitignore** / 打开仓库同步视图（名字取 `cmdOpenView`，
**不是** `viewTitle`，理由见五点八第 1 条）/
**在浏览器中打开当前文件** / **在浏览器中查看当前文件的历史**。
后两条同时挂在文件右键菜单上（「在远端打开」「在远端查看历史」）。
另外侧栏有**两个图标**：`git-fork` 打开仓库同步视图、`download` 打开安装器
（原来只有一个图标，而它打开的是安装器 —— 见五点八）。
设置页新增：拉取整合策略（三态下拉）、gitPath、**连接测试**。

**初始化仓库时会顺带建 `.gitignore`**（`syncService.initRepo()`）：

`.obsidian/workspace.json` 存的是面板与标签布局 —— **每开关一个标签它就变**。
多设备同步它必然冲突，而且冲突内容是整份 JSON，用户根本没法手工合并。
这是 Obsidian 同步最常见的坑，但用户不会预见到，等冲突发生了再处理成本高得多。
所以初始化时顺手挡掉，并明确告知建了什么（不偷偷摸摸）。

**已有 `.gitignore` 时绝不覆盖** —— 用户可能有自己的规则（实测用户的测试库里
就有一份别的同步插件建的）。建不了也不让初始化失败，只是少一层保护。
模板整段放在 locale 的 `sync.gitignoreTemplate` 里（它含面向用户的说明文字）。
另有「编辑 .gitignore」命令，不存在就先按同一份模板建出来 ——
空文件没法教人该忽略什么。

> 「在远端打开」的实现要点：URL 模板在 host 层（`repoRef.fileWebUrl` /
> `fileHistoryWebUrl`），`remoteLinks.ts` 只负责凑齐「origin 的 RepoRef + 当前分支」。
> 两个平台的网页路径格式一致，所以**没有平台分支** —— 这正是把
> `openInGitHub` 的硬编码正则抽象掉之后该有的样子。
> 拿不到远端 / 远端不是 GitHub 或 Gitee / 仓库还没有提交时，
> 给可行动的提示而不是打开一个必然 404 的地址。
> 路径逐段编码（`encodePathSegments`），中文文件名与空格不会截断链接。

**v1 有意不做的**（obsidian-git 有，但 PLAN.md 范围外）：逐文件 hunk 级暂存、
树形文件视图、squash、子模块、行作者/blame。GitManager 接口里
分支管理原语已备好（listBranches/checkout/createBranch/deleteBranch），
视图里有分支下拉，够用。
（文件级 diff 查看已在 2026-09-24 补上，见五点八节的「差异视图」。）

### simple-git 的实测坑（改 sync 层前先看）

1. `SimpleGitOptions.config` 是**字符串数组**（逐项 `-c`），不是对象；
   且 `simpleGit(options)` 收 `Partial<SimpleGitOptions>`。
2. `git.log({ max: n })` 会把 `--max=n` 原样传给 git 报错 —— 正确的键是
   `maxCount`（映射为 `--max-count`）。
3. **空仓库 commit 不抛错**：返回 `summary.changes === 0` 的摘要，要自己判断。
4. HEAD 未出生（无任何提交）时 `git restore --staged` 报
   "could not resolve HEAD"，等价做法是 `git rm --cached`（unstage 已做回退）。
5. 无提交的仓库 `git branch` 输出为空 → `branchLocal()` 的 current/all 为空。
6. push 不会更新裸仓库的 HEAD（clone 出来的分支取决于它）——测试环境要手动
   `symbolic-ref HEAD refs/heads/main`。
7. 测试机全局 `core.autocrlf=true`：检出的内容是 \r\n，测试断言要归一。
8. **`addStatusBarItem()` 在 `Plugin` 类上，不在 `app.workspace` 上** ——
   猜错位置会直接 `TypeError`（真实启动时才暴露，stub 造不出这种差异）。
   现状：状态栏元素由主类 `this.addStatusBarItem()` 创建后经 SyncDeps 传入。
9. **插件目录名不保证等于 manifest id**（实测测试库 32 个插件里 5 个错位：
   `MDRazor/`→`md-razor`、`obsidian-commander/`→`cmdr`、`obsidian-pkmer/`→`pkmer`、
   `obsidian-plugin-manager/`→`plugin-manager`、`obsidian-style-tuner/`→`style-tuner`；
   手动解压 release 或别的安装器用仓库名建目录所致）。
   所以：**插件身份一律用 manifest id**（查社区索引、查启用状态、写跟踪记录），
   **目录只用于定位文件**（`pluginFolder.resolvePluginFolder` 按 id 反查真实目录，
   否则更新会新建出第二份同 id 安装）。按目录名查索引会漏掉 5/32 的插件 ——
   > **同一个 id 有可能对应多个目录**（实测：一份残留备份），此时 Obsidian 自己也不定，
   > 谁最后被扫到谁赢。所以 `resolvePluginFolderInfo()` **先问 Obsidian**
   > （`manifests[id].dir` = 它实际加载的那份），并在 `duplicates` 里报出其余目录；
   > 只拿目录名或「任意同 id 目录」去猜，会写出「显示的是 A、跑的是 B」这种状态。
   曾表现为「明明上了官方市场却提示来源未识别」。
   另外 `loadManifest` 要目录、`enablePluginAndSave` 要 id，两者别混用。
   顺带观察：同一 id 可能存在于多个目录（旧 id 的残留安装），扫描时按 id 去重。
10. **`git restore --staged` 在 HEAD 未出生时报的错里，HEAD 是带引号的**：
    `fatal: could not resolve 'HEAD'`。`simpleGitManager.unstage` 的回退分支
    最初用 `/could not resolve HEAD/` 匹配，**永远匹配不上** ——
    回退形同虚设，表现为「全新仓库里取消暂存直接报错」。
    现在是 `HEAD_UNBORN_RE`，用 `['"\`]?` 容忍引号。
    教训：**靠 git 的错误文案做分支判断时，必须用真实输出校准正则**，
    不要凭记忆写（记忆里是"没有引号的版本"）。
11. **不要给 simple-git 传 `.env({ ...process.env })`**。simple-git 3.36 起会检查
    通过 `.env()` 显式传入的环境变量，遇到会注入 git 配置的变量直接抛
    `Use of "GIT_PAGER" is not permitted without enabling allowUnsafePager`
    （`GIT_EDITOR` / `GIT_ASKPASS` 等同理）。本机环境恰好有 `GIT_PAGER=cat`，
    于是测试以「本地服务器收到 0 个请求」的形式失败，看起来像网络问题。
    **生产代码不调 `.env()`，不受影响**；只有测试里需要绕过代理时才想调它。
    确实需要时改用 `unsafe: { allowUnsafePager: true }` 或只传需要的键。
12. **`git config --get <key>` 在键不存在时，simple-git 返回空串而不是抛错**
    （退出码 1 被解析掉了）。断言「配置未设置」要断言 `""`，别写 `rejects.toThrow()`。
13. **`git diff` 的输出里有三样东西会咬人**（都是 2026-09-24 加差异视图时实测的）：
    - **非 ASCII 路径默认被转义成八进制**（`"a/\344\270\255.md"`）——
      `core.quotePath` 默认是 true，必须 `-c core.quotePath=false`；
    - **`--- a/x` / `+++ b/x` 行末尾会多一个制表符**（路径含空格时 git 用它分隔），
      不剥掉的话拿这个路径去库里找文件会找不到；
    - **二进制段落没有 `+++` 行**，路径只能从 `Binary files a/x and b/y differ`
      里取 —— 只认 `+++` 的话界面上会出现一个空名字的条目。
14. **`git show <合并提交>` 默认什么都不输出。** 合并提交有多个父提交，git 不知道
    该跟谁比，于是直接给空 —— 用户在历史里点开一次拉取产生的合并提交只会看到空白。
    要 `-m --first-parent`（对普通提交没有副作用，实测）。
15. **`raw()` 可以带 `-c`**：`git.raw(["-c", "core.quotePath=false", "diff", ...])`
    会原样拼到子命令前面（simple-git 的 `spawn.args` 插件只负责在前面补 binary
    与实例级的 config，两者都合法地排在子命令之前）。

### 测试策略

`simpleGitManager.test.ts` 用**真实临时 git 仓库**（mkdtemp + 系统 git），
覆盖 init/状态映射/提交/分支/克隆推送/merge/rebase/reset/冲突/abortMerge/
push 拒绝 —— git 语义的真实性是 mock 给不了的，且不碰网络。注意全局配置
`init.defaultBranch` 不可控，测试里统一 `checkout -b main`，提交身份用
`addConfig` 设在仓库本地（绝不碰用户全局配置）。`syncService.test.ts` 用
可编程假 GitManager 验证编排（顺序/冲突停止/推送前置/串行化）。
`authWire.test.ts` 用「让 git 在同一次调用里读回 `-c` 配置」的手法验证
simple-git 的 config 传递（不碰网络、不需令牌）。

**跑测试要有耐心**：本机进程创建开销约 340ms，`simpleGitManager.test.ts`
单独跑约 **150 秒**（不是"整个套件 1.5 秒"）。别因为"慢"就以为它挂了 ——
`vitest.config.ts` 里已把 `testTimeout` 提到 30 秒，卡死与否看这个。

**`pluginBoot.test.ts`：装配路径的冒烟测试。** 把真实的 `main.ts` `onload()`
跑在假 app 上，断言它注册了什么。这是唯一覆盖装配路径的测试，而它踩过坑：
曾经把状态栏元素挂到 `app.workspace.addStatusBarItem()`（真实 API 在 `Plugin` 类上），
**单测全绿、真机启动才 TypeError**。做法是让 stub 的 `Plugin` 把方法补全 ——
只要 `onload` 调用了 stub 没有的 API，这里就会以 TypeError 失败。

已做**变异验证**：把 `createStatusBarItem` 改回 `app.workspace.addStatusBarItem()`
后该测试立刻失败（`TypeError: ... is not a function`），确认它真的拦得住这类问题，
不是"永远通过"的装饰。改动装配路径时请保持这个性质。

## 七、实测发现（读文档看不出来，改代码前先看这里）

### 平台差异

1. **Gitee releases 默认升序**。必须传 `direction=desc`，否则会静默装六年前的版本。
2. **Gitee API raw 端点对匿名请求一律 401**（即使公开仓库）。
   匿名读文件走网页通道 `https://gitee.com/{o}/{r}/raw/{ref}/{path}`。
3. **Gitee 网页 raw 通道接受 `HEAD` 作为默认分支写法**（实测 200）——
   省一次 `getRepoMeta` 调用，对匿名配额极低的 Gitee 很关键。
4. Gitee 鉴权走 `access_token` **查询参数**，GitHub 走 `Authorization` 请求头。
   所以 `applyAuth` 是接口方法。
5. Gitee 的 `html_url` 带 `.git` 后缀，要剥掉。
6. Gitee `/v5/search/repositories` 匿名返回空数组，搜索不可用。
7. Obsidian `requestUrl` 的 `throw` 默认 true，要显式传 `throw: false`。

### 测试约定（踩过的坑）

8. **stub 的 `requestUrl` 必须从 text 派生 arrayBuffer**（`tests/stubs/obsidian.ts`）。
   真实 Obsidian 的两个属性都反映响应体；如果处理器只给 text 而 arrayBuffer 返回空,
   release 资产下载（走 arrayBuffer）会静默变成空内容，测试以
   「manifest 不是合法 JSON」的方式误报 —— 曾导致 4 个安装测试假失败。
9. 测试里调 stub 辅助函数必须用**相对路径** import（`"obsidian"` 只有运行时才走 alias）。
10. stub 的 `json` 必须是惰性 getter。
11. `tests/live/**` 默认排除，`OBSYNC_LIVE=1` 开启。
12. 单测里路由式 HTTP mock：**可选文件（styles.css）也要给 404 路由**，
    否则「无路由抛错 → 重试退避」白耗 1.6 秒。

### 环境约束

13. **Gitee 匿名 API 配额极低**：连续请求直接 403，实测约一分钟内不恢复。
    live 测试里 Gitee 的 API 用例**已改为限流时跳过**（不是判失败）——
    长期飘红的套件会训练人忽略失败。想让它稳定跑绿就配令牌：
    `OBSYNC_GITEE_TOKEN=xxx pnpm test:live`（配了令牌还被限流才会真失败）。
14. **GitHub 的三条通道可达性互不相关**，本机 2026-09-16 实测：
    | 通道 | 用途 | 本机表现 |
    | --- | --- | --- |
    | `api.github.com` | release 列表、contents API | 稳定 |
    | `raw.githubusercontent.com` | 匿名读源码文件 | 稳定 |
    | `github.com/.../releases/download/...` → `objects.githubusercontent.com` | 下载 release 资产 | **3 次里 2 次 21 秒超时 0 字节** |
    这直接决定了安装器的两条降级（都是补的洞，别删）：
    - `installFiles.loadReleaseFile`：**资产下载失败**（不只是"资产不存在"）也回退该 tag 的源码文件；
    - `GitHubHost.readFile`：raw 域名不可达时回退 contents API（代价是消耗未认证配额）。
    国内网络下 raw 域名常被阻断、资产 CDN 常超时，所以这两条不是"锦上添花"。
15. **本机进程创建开销约 340ms**（连 `cmd /c echo` 也要 317ms，不是 git 特有的）。
    后果：`simpleGitManager.test.ts` 一个用例起十几次 git 就要 4~5 秒，
    vitest 默认的 5 秒超时必然不够 —— 表现为「用例超时 + 清理时 EBUSY」，
    极易误判成被测代码有 bug。已在 `vitest.config.ts` 设 `testTimeout: 30_000`。
    **该文件单独跑约 150 秒**（不是文档早先写的"整个套件 ~1.5s"，那个数字是错的）。
    Windows 上 git 进程退出后目录句柄还会被占一会儿，清理要带
    `maxRetries`/`retryDelay`，否则 EBUSY。
16. 测试库里已装的第三方插件 `gitee-sync-plus` 不是真 git 实现（只做文件级收发），
    所以 SyncHub 走真 git 是差异化，不是重复劳动。
17. **`git ls-remote` 的输出可能撑爆 Node 的 `execFile` 缓冲**。
    默认 `maxBuffer` 是 1MB，而 `mindspore/mindspore` 实测有 **18 万个引用**，
    会以 `stdout maxBuffer length exceeded` 失败 —— 看着像网络问题，实则不是。
    挑测试仓库要选引用少的（`oschina/git-osc` 只有 33 个），并显式给 `maxBuffer`。
18. **401 之后 git 会调凭据助手，而本机系统级的 `helper-selector` 在非交互环境里会干等**。
    表现为「用例卡满 45 秒（execFile 超时）」，看起来像网络慢，实则是在等一个
    永远不会来的输入。跑需要触发 401 的 git 命令时，加
    `-c credential.helper=`（**空值会重置助手链**，这个语义在 git 文档里很隐晦）。
19. **GitHub 的 release 资产域名是「冷连接极慢、之后很快」**（2026-09-19 实测，
    同一条 URL 连续四次）：
    ```
    第 1 次：> 25 秒超时（0 字节）
    第 2 次：16.8 秒成功（963 KB，≈57 KB/s）
    第 3 次：0.6 秒
    第 4 次：0.6 秒
    ```
    而 `raw.githubusercontent.com` 同一时刻只要 **485ms**。
    这条数字有两层后果，都别忘：
    - 超时阈值是 **20 秒**，所以第 2 次那种 16.8 秒**刚好在边上** ——
      同一段网络下这次成功、下次就失败，看起来像随机故障，其实是冷连接开场；
    - 因此「失败之后**再试一次**」在这里的收益极高（第 3 次就 0.6 秒）。
      `fetchFromRelease` 里为「源码里拿不到的文件」重试一次资产，就是照这条写的
      （见第五节那条 2026-09-19 补充）。真机症状：Trefoil 报 `missingRequiredFiles: main.js`，
      而它的 release 里**明明有** main.js。
    - 顺带记住：**「缺 main.js」不等于「作者没上传 main.js」** ——
      先看资产里有没有它（`assetDownloadFailed` 与 `missingRequiredFiles` 的区别）。
20. **Gitee 的 release 资产比 GitHub 快一个数量级**（2026-09-19，同一时刻、
    同一个插件的 `main.js`）：

    | 来源 | 实测 |
    | --- | --- |
    | `github.com/…/releases/download/1.0.3/main.js` | 25 秒超时 ／ 16.8 秒 ／ 0.6 秒 ／ 0.6 秒（963 KB） |
    | `gitee.com/sofqi/Trefoil/releases/download/1.0.2/main.js` | **200，3.1 秒**（939 KB） |

    所以「改用 Gitee 镜像」在国内网络下不是锦上添花，而是**主要出路** ——
    这也解释了用户为什么会问「为什么它不走 Gitee 路线」。
    而自动探测只猜两个候选（同名仓库 ／ 你 Gitee 账号下的同名仓库，后者要先解析
    账号名、**那需要令牌**）：镜像挂在第三个账号下时永远猜不到。
    实测 Trefoil 正是这一种 —— GitHub owner 是 `Dyse-Sofqi`（Gitee 上没这个 owner），
    镜像是 `gitee.com/sofqi/Trefoil`。手填地址那条路
    （`InstallerService.setMirror`，见五点七节）就是为此存在的。
21. **Gitee 的 release 资产对象没有 `id`**（2026-09-19 实测）—— 整个对象只有两个键：

    ```json
    { "browser_download_url": "https://gitee.com/sofqi/Trefoil/releases/download/1.0.3/main.js",
      "name": "main.js" }
    ```

    连 `size` 都没有（`GiteeAsset` 的 `id?` / `size?` 就是照这个改的）。
    实现里原来写的是 `id: String(asset.id)`：缺字段时得到字符串 `"undefined"`，
    而它是**真值** —— 于是 `downloadAsset` 判定「这个资产有 id」，去拼私有仓库的附件
    端点 `/releases/{id}/attach_files/undefined/download`，**三个资产全 404**。
    症状只出现在**配了 Gitee 令牌**的人身上（那条分支要 token 才进）：控制台三条
    「downloading asset … failed, falling back to the source file at 1.0.3」，
    最后 `assetDownloadFailed: main.js` —— 而同一个地址**匿名**下载是 200、3 秒。

    两处修复：① 缺字段就保持 `undefined`（`optionalId`）；② 附件端点失败时**回落**到
    公开下载地址（带上同一个令牌）—— 令牌过期、企业版差异也都会以 404 的形式出现，
    一条可选通道失败不该让整次安装失败（与 GitHub 的 raw → contents 回退同一个道理）。

    > 教训：**测试 fixture 要按实测响应写，不能按类型写。** 这一组原来的 fixture 给资产
    > 造了 `id: 991` 与 `size: 1234`，于是「字段缺席」这条路径从来没被测过 ——
    > `GiteeHost.downloadAsset` 在那个 bug 存在期间**一个用例都没有**。

### 测试基础设施（2026-09-22~23 补）

22. **模拟「用户删了文件」时必须真的把它从库里拿掉**（`tests/helpers/fakeImageVault.remove()`）。
    Obsidian 的 `vault.on("delete")` 是在文件**已经消失之后**才触发的 —— 测试里只
    `seed` 出 `TFile` 当事件参数、不 `remove`，被测代码看到的还是「文件还在」，
    整条「删本地 → 问云端」的路径根本走不到（三条用例因此假绿，靠断言失败才发现）。
23. **stub 的 `TFile` / `TFolder` 缺 `vault` 字段**（真实 `TAbstractFile` 有它，
    指向所属 Vault）。把替身文件传给参数类型是真实 `TAbstractFile` 的函数时编译不过 ——
    在测试里断言一次即可，**别给替身加一个行为不对的 `vault`**。
24. **`document.createElement("canvas")` 在 Node 里没有**，所以 `ImageEditorModal`
    的画布那一半（`encode` / `toBlob`）没有单测。能测的纯计算部分全部抽到了
    `imageEditor.ts` —— 分界线的判据是「有没有碰 DOM」，不是「像不像工具函数」。
25. **`Edit` 的 `old_string` 必须来自**最新**的文件内容**。同一个文件连改几次时，
    凭记忆拼 `old_string` 会静默失配（要么报「找不到」，要么匹配到别处）——
    这一轮有一次误删了 `sanitizeTrackedItems` 注释里的一段，靠回读才发现。

### 死代码清点（2026-09-16，2026-09-17 更新）

- `pluginFolder.isPluginInstalled` —— 只被测试用过，与 `readInstalledManifest` 重复。已删。
- `pluginFiles.ts` 整体被 `installFiles.ts` 取代（按文件集参数化），旧模块已删。

方法：扫 `src/**` 里所有 `export function|const|class` 声明，统计该名字在**整个
`src` 树**里的出现次数（先剥掉注释，再剥掉 barrel 的 `export { … } from` ——
否则 `hostRegistry` 那种集中再导出会把死导出全盖住）。只剩下声明处那一次 =
没有任何生产调用方。

**已删**（都是「重复实现里躺着的那一份」，理由见第二节缺陷表）：

- `InstallerService.checkForUpdate` —— 判据用 `requestedVersion`，几乎恒报有更新；
- `hostRegistry.hostFor` —— 与 `getHost(ref.host)` 等价，后者已在 10 处使用；
- `manifest.isManifestCompatible` —— 纯转发；它声明的「注入 `requireApiVersion`
  便于测试」已被 obsidian stub 的 `__setApiVersion` 取代。

**保留但未接线** —— 这些不是垃圾，是**只做了一半的功能**。按
`fileWebUrl` / `commitWebUrl` 那次的先例（当时也记作「死代码」，实际是漏做的功能）：

| 名字 | 现状 | 缺什么 |
| --- | --- | --- |
| `remoteLinks.commitOnRemoteUrl` | 已实现，但**无调用方、无测试**（同文件的 `fileOnRemoteUrl` / `fileHistoryOnRemoteUrl` 各有命令 + 文件右键菜单） | 「查看某个提交」的入口 —— 而提交列表已在下面那条里躺着 |
| `GitManager.log()` / `CommitInfo` | 有实现体，**没有任何调用方** | 同上，UI 侧 |
| `settingsTab.createSettingsTab` | 注释写「供测试与将来复用」，实际没有测试用它；且实现是 `void app` —— **参数是摆设，签名会误导** | 要么删，要么真的用起来 |
| `pluginFolder.isPluginInstalled`、`repoRef.isSameRepo` / `formatRemoteUrl` | 只有测试引用，生产路径没有调用方 | 判断是「模块的公开行为」还是残留 |

> 用这套方法加平台那条还有一层要在**测试**里记住：那些用例都是「遍历
> `SUPPORTED_HOSTS`」，所以**从数组里删掉一个平台它们照样全绿**（循环体少跑
> 一次而已）。那个方向由 `tsc` 兜住 —— 实测删掉 `"gitee"` 会报 **31 个**类型错误
> （`Record<HostKind, IRepoHost>` 的多余属性、`"gitee"` 与 `"github"` 无重叠的比较等）。
> 两个方向由两种机制分别覆盖，别以为测试覆盖了全部。

### 「设置项无人读取」这个自查为什么存在（2026-09-17）

它是被 `sync.enabled` 逼出来的。那个字段**声明了、持久化了、设置页也能改，
而 `src` 里没有一处读它** —— 用户关掉同步之后，自动提交照样每 N 分钟推远端。

关键在于**它掉在测试与类型两边的缝里**：

| 机制 | 为什么抓不到 |
| --- | --- |
| `tsc` | 接错线是 `enabled: true`，类型上也是 `boolean`，合法 |
| 单元测试 | `Automatics` 直接注入设置对象，**看不见装配层那一行**。实测把 `enabled: deps.getSettings().sync.enabled` 改成 `enabled: true`，全量测试**全绿**（12/12） |
| 之前没有的机制 | 与第 3 项「未使用的 i18n 键」同类（「死键是信号」），只是载体从文案换成了配置项 |

所以把它做成第 6 项自查。判据是**保守**的（只认「读」，宁可漏报不误报）：

- 只扫 `installer.*` / `sync.*` 两个嵌套容器 —— 顶层 `ObsyncSettings` 的字段读起来
  形如 `this.settings.language`，容器名与局部变量名混在一起，扫不准，故不扫；
- 一个文件算「读过」，要么限定访问 `.sync.enabled`（后面跟 `=` 是写，不算读），
  要么「提升访问」：文件里先 `const x = …getSettings().installer`，再读 `x.enabled`
  （`installer.autoCheckOnStartup` 就是这个写法，只看限定访问会误报）；
- **`settingsTab.ts` 不在扫描范围**：它读设置是为了渲染与持久化，不是消费。
  没有这一条，每个字段都会被设置页自己「读」到，检查就没意义了。

**它扫不到的两类写法**（都在 `EXEMPT` 里，各写了理由）：走「`settingsTab` 组一个
参数对象 → 消费方读参数属性」的字段，读取点在范围外、消费点拿到的是参数
（`installer.lastUpdateCheckAt` 还在参数对象里改了名，静态规则根本接不上）。

> 别为了消掉那两条去放宽判据。试过「属性名在某处的参数类型里出现就算用过」——
> 后果是 `AutomaticsSettings` 里那个 `enabled: boolean` 会把 `sync.enabled` 也算成
> 用过，检查对真正的漏接线（`enabled: true`）**彻底失效**。
> 豁免表天生是盲区，所以每加一条必须写清理由，并且要能接受它保持很短。

验证方式：把 `index.ts` 里那行接线删掉、或改成 `enabled: true`，自查都会**退出码 1**
并把 `sync.enabled` 列出来。

### 三种机制各负责哪个方向（本项目反复踩到的一点）

同一个事实写在多处时，"哪份是权威"与"有没有人读"是两个独立的问题，
而**没有任何单一机制能覆盖全部方向**：

| 方向 | 谁兜住 | 实测依据 |
| --- | --- | --- |
| 副本之间不一致 | 单元测试（让使用点互相印证，而不是各列一份期望值） | 四个漂移方向各被精确抓住 |
| 权威声明被缩小 | `tsc` | 从 `SUPPORTED_HOSTS` 删掉 `"gitee"` → 31 个类型错误，而那 5 条测试全绿 |
| 声明了但没人读（接线漏了） | `scripts/checks.mjs` 第 6 项 | 改 `enabled: true` → 测试全绿、类型通过，只有自查报错 |

## 八、社区插件审核规范复查（0.1.2 发版前）

按 [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
与 `eslint-plugin-obsidianmd` 的规则逐条核对。**全部通过**，只有一处需要解释。

### 特别点名的那条

> Sets styles directly instead of using CSS classes, `setCssProps`, or `setCssStyles`

`src/` 里**零处**直接样式赋值 —— `.style.`、`setAttribute("style", …)`、
`attr: { style: … }` 三种写法都扫过，全无。所有样式都在 `styles.css` 里、靠类名挂上去，
`styles.css` 里也**没有一处 `!important`**。

这条能一直保持，是因为项目从一开始就走「给元素加类、规则写在 `styles.css`」这条路
（`applyStatusBarWidth` 当年甚至为此主动放弃了改内联样式的方案；那个函数已随
2026-10-09 状态栏全宽的删除一起消失，但路子留下来了 —— 现在的 `.obsync-*` 类
一律如此）。

> **2026-10-08 复查（0.2.0 发版前）**：`obsidianmd/no-static-styles-assignment` 仍是
> **0 违规**。这一轮**收回了一处踩形式边界的写法** —— `.obsync-gitignore` 的宽度曾经
> 写成 `const FULL_WIDTH = "100%"; areaEl.style.width = FULL_WIDTH;`（09-24 为绕开
> 「插件样式表不保证在热重载时被重新读入」而内联）。规则只拦**字面量**，用 `const`
> 能绕过，但绕的是形式、不是判据：静态宽度本来就该待在类里。现已把
> `width: 100%` / `box-sizing: border-box` 写回 `.obsync-gitignore`，元素上不再写内联
> 样式（`settingsTabRender.test.ts` 那条用例也翻面：从「必须内联」改成「不许内联」）。
> 开发时「改了 CSS 不生效」用**完整重载 Obsidian** 解决。
>
> 剩下三处 `.style.*` 都是**动态值**（`ImagePreviewModal` 的缩放 / 平移尺寸、
> `ImageEditorModal` 的裁剪框几何），走的是模板字符串 —— 规则显式放行，也是它的
> 设计意图（这类值本来就该动态）。

### 官方提交要求

| 要求 | 本项目 |
| --- | --- |
| `minAppVersion` 合适 | `1.8.7`，由 `pnpm check` 第 1 项持续保证 |
| description 短、以句号结尾、无 emoji、≤250 字符 | 78 字符，符合 |
| 只用 `fundingUrl` 链财务支持；不接受捐赠就移除 | 已配置：`fundingUrl` 是对象（PayPal + 扫码图），`validate-manifest` 要求对象值全为非空字符串，已满足 |
| 命令 ID 不带插件 ID（Obsidian 会自动加前缀） | 10 个命令全不带 |
| Node / Electron API 只能桌面端 | 见下（唯一需要解释的一处） |
| 移除示例代码 | 无示例代码 |

### 唯一需要解释的一处：`isDesktopOnly: false` 却用了 Node API

官方原文是 **「If your plugin uses any of these APIs, you must set `isDesktopOnly` to `true`」**。
本项目用了 `simple-git`（Node），却写着 `false` —— 这是**刻意的**：安装器是纯网络操作、
移动端能用，把整个插件标成桌面端会让移动端用户连安装器都用不上。

规则要防的是「插件在移动端一启用就崩」，而这条已被**动态导入**解决：`main.ts` 的
`loadSyncModule()` 推迟到 `Platform.isDesktopApp` 之后，移动端根本不加载同步模块。
`scripts/verify-mobile-load.mjs`（`pnpm verify:mobile`）拿**真实产物**证明加载阶段不抛错，
`scripts/checks.mjs` 的「移动端安全」再从静态导入图做快速守卫 —— 两道防线都有。

### 其余常见红线（全过）

| 检查 | 结果 |
| --- | --- |
| `document.createElement` | 0 处（都用 Obsidian 的 `createEl` / `createDiv`） |
| `innerHTML` / `outerHTML` | 0 处 |
| `eval` / `new Function` | 0 处 |
| `console.*` 直接调用 | 只在 `core/logger.ts` 的统一出口（`debug` 受设置里的开关控制） |
| 内部 API（`app.plugins.*` 等） | 0 处（`existingPlugins.ts` 里只出现在注释中，说明「为什么扫文件系统」） |
| `!important` | 0 处 |

### 一处**未改**的建议项

`window.setTimeout` / `window.clearTimeout` / `window.open`（`document.body` 那处已随
2026-10-09 状态栏全宽的删除一起没了）属于 eslint 的 `prefer-active-doc` **建议**
（warn 级，为的是支持弹出窗口），不在官方提交要求里。**刻意不改**：

- `window.setTimeout` / `clearTimeout` 带 `window.` 前缀是为了**类型正确**
  （返回 `number`，而不是 Node 的 `Timeout` 对象）；
- `window.open` 打开的是系统浏览器，与窗口上下文无关。

## 九、社区审核打回两条（0.1.4 之后）

0.1.4 提交社区后被打回两条。两条都**不是**「代码写错了」，而是「审核看不懂 /
判据不同」—— 这正是上一节（第八节）自查全过却仍然被打回的原因。

### 报的两条

| 审核报的 | 位置 | 根因 |
| --- | --- | --- |
| `Uses Obsidian APIs newer than the declared minAppVersion`（`obsidianmd/no-unsupported-api`）×4 | `src/core/secretStore.ts` | 用了 `app.secretStorage` / `getSecret` / `setSecret`（都是 `@since 1.11.4`），而 `minAppVersion` 是 **1.8.7**；原写法只靠 `typeof … === "function"` 运行时探测，规则不认 |
| `Unexpected undescribed directive comment`（`eslint-comments/require-description`） | `src/core/themeName.ts:35` | `// eslint-disable-next-line no-control-regex` 没写理由 |

### 关键：为什么第八节「全过」却还是被打回

`scripts/checks.mjs` 第 1 项**本来就在查这件事**，但它把 `SecretStorage.*`
放进了 `KNOWN_SAFE` 豁免表 —— **恰好把审核要查的那几条放过去了**。
教训：**自己重写一遍判据，就会重写一遍它的盲区。**
所以这轮不再扩写自查脚本，而是**直接跑官方规则的本体**。

### 复现方式（不靠猜规则）

装了 `eslint-plugin-obsidianmd`（审核用的同一套），本地实跑复现出**一模一样**的
6 条错误（4 条 API + 1 条指令 + 1 条 `no-unsafe-assignment`）。

### `requireApiVersion` 的三个硬性写法要求（逐条实测）

规则只在**成员访问位于被守卫的分支内部**时才算数。实测矩阵：

| 写法 | 审核 |
| --- | --- |
| `if (requireApiVersion("1.11.4")) { app.secretStorage.getSecret(id) }` | ✅ |
| `requireApiVersion("1.11.4") && app.secretStorage.getSecret(id)` | ✅ |
| `requireApiVersion("1.11.4") ? app.secretStorage.getSecret(id) : undefined` | ✅ |
| `if (!requireApiVersion("1.11.4")) return; app.secretStorage.getSecret(id)` | ❌ **不认** |
| `requireApiVersion(SECRET_STORAGE_SINCE)`（**常量**而非字面量） | ❌ **不认** |

后两条是陷阱：语义都完全正确，但规则沿父链找不到守卫 / 取不到版本号。
**提前 return 型守卫**和**抽成常量**这两件事都特别自然，所以都在
`secretStore.ts` 的文件头注释里写死了「别改回去」。

### 没走的那条捷径

试过「把类型换成结构类型 `SecretStorageLike`」—— 规则确实不报了。
**但那是把闸门拆了**：变异测试证明，守卫整段删掉 lint 依然全绿。
所以最终用**正向 `if` + 字面量**，让「报不报」真的取决于守卫在不在。

### 新增两道防线（各自管一半）

| 防线 | 管什么 | 变异验证 |
| --- | --- | --- |
| `pnpm lint:review`（接进 `build`） | 官方规则本体；守卫没了就红 | 删守卫 → 6 条错误；字面量换常量 → 7 条错误 |
| `tests/core/secretStore.test.ts` | **运行时**真不去碰（lint 证明不了这个） | 把版本调到 1.10.0 并注入 SecretStorage → 必须一次都不调用 |

lint 只开这两条、其余显式关闭（`eslint.review.config.mjs`），因为完整那套在本仓库
有约 48 条既有告警 —— 全开会让闸门从第一天起就是红的，等于没有。

### 顺带查出的真 bug：清空令牌后「令牌就绪」

写运行时测试时发现两条分支对同一个问题给出**相反答案**：

- localStorage 分支：空串 → `undefined`；
- SecretStorage 分支：`value ?? undefined` → 返回 **`""`**。

而 `syncService.ts:552` 判的是 `getToken(...) !== undefined`，于是**清空令牌后
鉴权诊断会报「平台已就绪」**。已统一为「空串算没有」，并由用例锁住。

### 顺手补的运行时兜底（差点写漏）

第一版把守卫写成 `if (requireApiVersion("1.11.4"))` 就去掉了对象存在性检查，
结果**版本够新但 `secretStorage` 缺失时令牌被静默丢弃**（`?.` 吞掉整次读写）。
3 个测试文件、4 条用例立刻变红（`secretStore` / `hostRegistry` / `auth`）——
是测试抓住的，不是人看出来的。最终条件是两个都要：
`requireApiVersion("1.11.4") && this.app.secretStorage`。

## 十、插件改名：OBSync → SyncHub（2026-09-21）

审核第三条打回：*Plugin name must not include parts of the name "Obsidian"*
（`manifest.json` 的 `name`）。这条和第九节那两条不同 —— 代码没问题，**名字**有问题。

### 判断依据

政策原文见 [Developer policies](https://docs.obsidian.md/Developer+policies)：

> Respect Obsidian's trademark policy. Don't use the "Obsidian" trademark in a way
> that could confuse users into thinking your plugin or theme is a first-party creation.

**但这条不是官方 eslint 规则发的**（这点必须记清，否则会去改错地方）：
`obsidianmd/eslint-plugin` 的 `validateManifest.ts` 里，禁用词只有
`["obsidian", "plugin"]` 两个字面子串，作用于 `name` / `description` / `id`。
把这段原逻辑套到我们的 manifest 上：

| 字段 | 结果 |
| --- | --- |
| `id` = `ob-sync` | 通过 |
| `name` = `OBSync` | **通过**（不含 `obsidian`） |
| `description` | 命中 `plugin`（但见下，这不是问题） |

所以报错来自**审核门户自己那套更严的匹配器**（源码未公开），它查的是商标的**片段**。

### 为什么 `OBSync` 会中

`OBSync` 以**全大写 `OBS`** 开头 —— "Obsidian" 前三字母的缩写写法。实测 7884 个
已上架插件：

| 名字 | 含什么 | 在架 |
| --- | --- | --- |
| `OBSync` | **全大写 `OBS`** | ❌ 被打回 |
| `WeChat Obsync` / `Tree Obs` / `Source Observer` | 词首大写 `Obs` | ✅ |
| `GitHobs` | 小写 `obs` | ✅ |
| `ObShare` / `ObDrawIO` | `Ob` + 大写 | ✅ |
| `Ostracon OB` | 全大写 `OB`（**2 字母**、词尾） | ✅ |

**没有任何一个在架显示名含全大写 `OBS`**；而 `Obs`/`obs`/`Ob` 各写法都大量存在。
⇒ 它认的是"全大写三字母 `OBS`"这个缩写，不是朴素子串。

### 一个反过来的强证据：id 不受影响

目录里本来就有一批 **id 含 `obsync`** 的插件，但它们的**显示名**都不含：

| id | 显示名 |
| --- | --- |
| `obsync-ptop` | P2P Vault Sync |
| `obsync-webdav-gpg` | Webdav PQC Sync |
| `obsync-private-sync` | Self Hosted Private Sync |
| `obsyncer` | Oppsyncer |

**id 大方用着 `obsync`，显示名一律避开。** 这证明商标规则**只管显示名、不管 id**。

### 改了哪些、没改哪些（**下次别再纠结**）

| 层 | 原值 | 新值 | 处置 |
| --- | --- | --- | --- |
| 显示名（manifest `name` / 状态栏 / 命令名 / i18n / README / CHANGELOG） | `OBSync` | `SyncHub` | 改 |
| 自我更新仓库坐标（`selfUpdate.ts` 的 `repo`、发布脚本的 `OWNER_REPO`、占位符 URL） | `OBSync` | `SyncHub` | 改（仓库同步改名） |
| 插件 id（manifest `id`、安装目录） | `ob-sync` | `ob-sync` | **改过一次又回退了**，见下 |
| 内部前缀（`obsync-` CSS 类、`obsync-sync-view`、`obsync-token-`） | `obsync-` | `obsync-` | **一律不改** |

显示名改名共 284 处、36 个文件。**没有用全局无脑替换**：脚本只替换大小写敏感的
`OBSync`，小写 `obsync-` 前缀天然不受影响；且排除了构建产物与按日期归档的工作日志。

### id 改过一次，又回退了（**这是本节最重要的一条**）

0.1.5 里把 id 从 `ob-sync` 改成了 `synchub`，想与显示名统一；**0.1.6 全部回退**。

**审核报的错**：

> The plugin ID in (manifest.json) does not match the existing plugin ID
> (`synchub` ≠ `ob-sync`)

**根因 —— 我当时的核查对象选错了**：

我查的是 `community-plugins.json`（**已发布**目录），见 `ob-sync` 不在其中，
就判断"插件还没进目录 → 现在改 id 最便宜"。但**审核系统记录插件用的是提交记录**，
它跨多次打回一直保留 —— 这跟"是否已出现在已发布目录里"是两回事。
0.1.4 那次提交已经把 `ob-sync` 登记进去了。

| 我核对的 | 实际决定 id 的 |
| --- | --- |
| `community-plugins.json`（已发布目录）—— 查不到 | **审核系统的提交记录** —— 已有 `ob-sync` |

教训：**"没进目录"不等于"没有既有身份"。** 提交记录是一个独立、且长期存在的状态，
判断"某字段能不能改"时必须以它为准 —— 而它只能通过审核报错看到，
**所以凡是与插件身份相关的字段（id），在被明确要求之前不要动**。

**结论（写进 `MEMORY.md` 与 `selfUpdate.ts`）**：id 定在 `ob-sync`，
**它与显示名 `SyncHub` 不一致是有意的** —— 审核登记决定 id，商标规则决定显示名，
两者来源不同，不必也不该统一。

**顺带说明**：id 里有小写 `ob` 不影响审核 —— 目录里 `obsync-ptop`、
`obsync-webdav-gpg` 等一大批 id 含 `obsync` 照旧在架，商标规则只管显示名。

**内部前缀始终没动**：`obsync-token-*` 与插件 id 无关，所以这一来一回
**用户的访问令牌一次都没受影响**。

**自我更新**：0.1.5 的安装（id `synchub`）无法靠"检查更新"跨回 `ob-sync`
（守卫会拒绝 id 不匹配的远端），需要手动重装一次；0.1.6 之后 id 重新稳定。

### 顺手发现的两处（都不在审核清单里）

1. **`scripts/gitee-release.mjs` 写死了仓库名** `sofqi/OBSync`。仓库一改名，
   `pnpm gitee:release` 就会打到旧路径上 —— 已同步改为 `sofqi/SyncHub`。
   另有两个发布脚本的 User-Agent 一并更新。
2. **`MEMORY.md` 里的 id 是过期的**（写着 `obsync`，而 0.1.4 起是 `ob-sync`）。
   已修正，并把「名字的三层区分」写成长期约定。
3. **`en` 的 `.gitignore` 模板比 `zh-cn` 少一条** —— 0.1.5 已补齐（见下方"待办"）。

### 已核实但**不是**问题的

`description` 里含 "plugin"（`community plugins`）—— 虽然官方那条公开规则会命中它，
但目录里 **7884 个有 5362 个** description 含 "plugin"、**5348 个**含 "obsidian"，
说明该规则实际并未执行。**不改**，免得为了消一个不存在的告警把文案改别扭。

### 待办

- **版本号**：0.1.5 已发（含 id 改动），0.1.6 为 id 回退版。发布流程见 `docs/RELEASE.md`。
- **仓库改名已完成**（GitHub / Gitee 上 `OBSync` → `SyncHub`，旧地址自动重定向，
  所以已装用户的自我更新不会断）。若你把设置页的「自身更新来源」手填成了
  `.../OBSync`，需要改成 `.../SyncHub`。
- ~~**`en` 的 `.gitignore` 模板比 `zh-cn` 少一条**~~ —— **0.1.5 已修**：
  给 `en` 补上了 `.obsidian/plugins/ob-sync/data.json` 这条排除项，中英模板现在一致。
  （这条漂移能长期存在，是因为 i18n 的编译期检查只管**键结构**、不管字符串内容 ——
  记在这里当提醒：**结构一致不等于内容一致**。）

## 十一、交接习惯（沿用 WorkBuddy 的做法）

- **边做边写文档**：本文件随代码一起更新；当日工作日志追加到
  `.workbuddy-ai/memory/YYYY-MM-DD.md`；新的"实测发现/踩坑"一定记入第七节。
- **每次改完代码都要部署，而且两个库都要**（用户 2026-10-09 的要求：改完要能立刻测）。
  跑 `pnpm build:both`：自查 / lint:review / typecheck / 构建 / 部署一条龙，目标是
  `F:/_Workspace/Plugin-Test`（测试库）与 `D:/_Workspace/learning-records`（用户的常用库，
  **他实际在这里看效果**）；**只改文档时不部署**。部署后比 SHA256 核实（mtime 会骗人）。
  两个库热重载状态不同：Plugin-Test 有 hot-reload 会自动加载，learning-records 没有 ——
  那边要提醒用户手动重载。只用 `pnpm build` 会漏掉 learning-records，症状是
  「新功能全无效但旧功能正常」，2026-10-09 为此绕了一圈。细节见 `MEMORY.md` 的
  「命令与部署」。
- 提交信息用中文，说明"为什么"；阶段完成一次大提交。
- 参考 `MEMORY.md` 里的长期约定（i18n 规范源、host 层设计原则、代码风格）。
