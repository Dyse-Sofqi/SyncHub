<div align="center">

# SyncHub

用 git 同步你的笔记仓库，同时安装社区插件与主题 —— GitHub / Gitee 双平台。

[![GitHub Release](https://img.shields.io/github/v/release/Dyse-Sofqi/SyncHub?style=flat-square&logo=github&color=%2342b883)](https://github.com/Dyse-Sofqi/SyncHub/releases) [![License](https://img.shields.io/github/license/Dyse-Sofqi/SyncHub?style=flat-square&color=%2342b883)](LICENSE) [![Obsidian Min App](https://img.shields.io/badge/Obsidian-%5E1.8.7-%234a7ec1?style=flat-square&logo=obsidian&logoColor=%234a7ec1)](https://obsidian.md) [![GitHub Stars](https://img.shields.io/github/stars/Dyse-Sofqi/SyncHub?style=flat-square&logo=github&color=%23e4b341)](https://github.com/Dyse-Sofqi/SyncHub) [![Sponsor](https://img.shields.io/badge/%E8%B5%9E%E5%8A%A9-Sponsor-%23e4b341?style=flat-square)](https://paypal.me/Sofqi)

</div>

---

> 🇬🇧 **English**: scroll down to the [English section](#-english).

📜 完整更新记录见 [CHANGELOG](CHANGELOG.md)。

### 简介

SyncHub 把三件事合在一起，并且让它们都**不只认 GitHub**：

- **笔记仓库同步** —— 用 git 把整个库同步到 GitHub 或 Gitee：提交、拉取、推送一条链走完，
  冲突不替你决定而是留下一份处理指南；面板上每个文件、每条提交都能点开**看差异**
- **图片同步** —— 库里的图片在 Cloudflare R2 上存一份副本（笔记走 git，图片走对象存储）：
  只补齐、从不自动删除，删本地时问一句；带一个可筛选的**图片管理面板**
- **社区插件与主题** —— 从 GitHub 或 Gitee 安装、更新、冻结、取消绑定；
  库里已经装好的插件与主题可以一次性绑定进来跟着一起更新
- **SyncHub 自身也能更新** —— 设置页里检查并更新它自己

三件事共用同一层平台适配，所以 **GitHub 与 Gitee 的差别只实现一次**。界面中文优先、英文对等。

SyncHub bundles three things and refuses to be GitHub-only:

- **Vault sync over git** — commit, pull and push your whole vault to GitHub *or* Gitee in one chain.
  Conflicts are never resolved for you: SyncHub stops the chain and writes a resolution guide instead.
  Every file and every commit in the panel opens a **diff view**.
- **Image sync** — keeps a copy of your vault's images on Cloudflare R2 (notes over git, images over
  object storage): it only fills gaps and never deletes on its own, asks once before deleting a cloud
  copy, and ships a filterable **image manager**.
- **Community plugins and themes** — install, update, freeze and unbind from either platform,
  and adopt the plugins/themes you already have so they update alongside.
- **SyncHub updates itself** — check and apply new versions of the plugin from its own settings page.

All three share a single platform layer, so **every GitHub/Gitee difference is implemented once**.
Chinese-first UI with an equal English one.

### 关键词 / Keywords

**中文**

- **笔记同步** — 提交 → 拉取 → 推送一条链 · 冲突指南（不自动解决）· 定时同步（一个周期跑完整链路） ·
  仓库同步视图（侧边栏，可点状态栏打开）· 状态栏条目 · 初始化仓库时建 `.gitignore`
  （设置页里可直接编辑）· **差异视图**（逐文件 / 逐提交 / 当前文件）·
  在远端打开文件/历史/提交 · 编辑远端 · 连接测试
- **图片同步** — Cloudflare R2 双副本（只复制不删除）· 删本地时问一句（三档）· 需要图片同步的文件夹 ·
  图片管理面板（本地 / 云端 / 已链接三条轴筛选、缩略图、**点缩略图看大图（滚轮缩放 / 放大后拖动）**、
  **单张重命名**、批量同步 / 压缩 / 重命名 / 删除）·
  笔记内裁剪压缩（保持原格式、只在变小时写回）· Excalidraw 压缩画布的引用也认得出 ·
  公网外链 · 密钥进系统密钥库
- **插件与主题** — 地址识别（GitHub / Gitee）· release 资产与仓库源码双通道 · 版本选择（含预发布回退）·
  写入前备份 + 失败回滚 · 更新检查（单个/全部/启动/进入设置页）· 常驻更新徽标 · 冻结 ·
  **版本回退** · 取消绑定（不删文件）· 绑定已装插件与主题 · Gitee 镜像发现 · 自我更新
- **平台与体验** — 双平台适配层 · 令牌进系统密钥库并从日志脱敏 · 中文优先英文对等 ·
  错误文案走类型码 + locale · 移动端可加载（同步仅桌面）

**English**

- **Vault sync** — commit → pull → push in one chain · conflict guide (no auto-resolution) ·
  scheduled sync (one interval running the full chain) · repository sync view (sidebar, openable from the status bar) ·
  status-bar item · `.gitignore` created on init (editable in the settings page) ·
  **diff view** (per file / per commit / current file) ·
  open file/history/commit on the remote · edit remote · connection test
- **Image sync** — Cloudflare R2 mirror (copy only, never delete) · one prompt before deleting a cloud
  copy (three modes) · folders to sync · image manager (filter on local / cloud / linked, thumbnails,
  **click a thumbnail for the full-size view — the wheel zooms, drag when it is larger than the
  window**, **rename a single image**, batch sync / compress / rename / delete) · crop and compress
  inside the note (keeps the original format, writes back only when smaller) · understands Excalidraw's
  compressed canvas references · public URLs · secret key in the OS keychain
- **Plugins & themes** — address recognition (GitHub / Gitee) · release assets **and** repository source fallback ·
  version picker (with prerelease fallback) · backup before write + rollback on failure · update checks
  (single / all / on startup / on opening settings) · persistent update badges · freeze ·
  **version rollback** · unbind (keeps files) · adopt already-installed plugins and themes ·
  Gitee mirror discovery · self-update
- **Platform & UX** — one platform layer for both hosts · tokens in the OS keychain, redacted from logs ·
  Chinese-first with an equal English UI · error text via type codes + locales ·
  loadable on mobile (sync is desktop-only)

### 功能

#### 🔄 笔记仓库同步（仅桌面端）

依赖系统 git，因此**仅桌面端可用**（Windows / macOS / Linux）—— git 得**自己装**
（插件不捆绑它，各平台怎么装见文末的「平台要求」）。

- **立即同步** —— 提交 → 拉取 → 推送，一条链走完。仓库同步视图的**顶部工具条一行**：
  `提交` / `拉取` / `推送`、分支下拉、**靠右的** `立即同步`、**最右的** `刷新`。
  **「提交」只写本地仓库，「推送」只发送已提交的内容** —— 它不会顺手提交，
  带着未提交的改动点它，改动一个字节都不会上去（这时它会明确告诉你还有几个更改没提交）。
  「定时同步」的定时器走的也是「立即同步」那条完整链路
- **提交信息不用你填** —— 由设置里的**提交信息模板**自动生成（默认
  `vault backup: {{date}} ({{numFiles}} files)`，
  支持 `{{date}}` / `{{hostname}}` / `{{numFiles}}` / `{{files}}`）。全程没有输入框，
  点「提交」/「立即同步」都不会弹窗问你要备注
- **仓库大小与待提交改动** —— 仓库同步视图里**并排两栏**：**仓库大小**（`.git` 对象库占用 +
  对象数，`git count-objects`，只读本地）与**待提交改动**（有改动的文件大小之和）。
  两者回答的是两个问题：「这个库有多大 / 推送要传多少」和「这次要传上去多少」。
  读不到就写「读不到」，**不会编一个 0 B**（那会被当成空仓库）
- **「与远端一致」是看得见的** —— 提交/同步结束且本地与远端完全一致（没有未提交改动、
  不领先也不落后、无冲突）时，会有一条**醒目的提示**（✓ + 停留更久，并带上仓库大小）；
  同时状态栏出现 `✓`，面板里那一行转成绿色。三处用的是**同一个判据**。
  关掉「显示操作结果提示」的人看不到提示，但状态栏与面板仍然显示这个状态
- **为什么「立即同步」里要有拉取** —— 因为 git 的 `push` 只能**快进**：远端存在你没有的提交时，
  推送会被**直接拒绝**（接受它就等于丢掉那些提交）。而这个插件的用途就是多设备同步，
  所以「提交 → 推送」在两台设备上会**稳定失败**，不是偶发失败。拉取排在提交**之后**，
  是因为提交先把你的改动收进一个可恢复的提交里，之后整合远端出问题还能「放弃本次合并」
  回到拉取之前；先拉取的话，工作区的未提交改动会和冲突标记混在一起，谁也分不清。
  拉取也是你唯一能**收到**别的设备改动的方式 —— 只推不拉是单向的。
  整合方式见设置页的「拉取整合策略」（默认合并；**「重置」会丢弃本地提交，所以选它时
  自动同步会被暂停** —— 否则每一轮都会静默丢掉刚提交的东西）。
  如果你确实不想让拉取动工作区，就分两步走：`提交` → `推送`
- **初始化仓库** —— 顺便建一份 `.gitignore`（默认排除 `.obsidian/workspace.json`、
  `.obsidian/plugins/ob-sync/data.json` 这类**每台设备各自维护**的文件，同步它们只会
  制造冲突）。**已存在的 `.gitignore` 绝不覆盖**，
  也可以随时改它 —— 「仓库同步」设置页里有一个**可直接编辑的多行代码框**
  （带「填入默认内容」与「在编辑器中打开」两个按钮），命令面板里也有「编辑 .gitignore」
- **让图片不进 git** —— 图片已经交给「图片同步」（R2）的话，`.gitignore` 一节里有一个
  **停止跟踪** 按钮，一次做完三件事（点开会先弹窗把这三步与两个后果写清楚，并让你选
  **按什么写规则**）：

  1. 把规则写进 `.gitignore`（只追加缺的那些）—— 新图片从此不进 git；
  2. `git rm -r --cached` 把命中的已跟踪文件从 git 的**索引**里摘掉 —— **本地文件一个都不动**，
     但下次提交会记下一条「删除」；
  3. 下一次同步（提交 → 拉取 → 推送）把这条改动推到远端。

  **两种规则形状，各有各的适用面**：

  | 形状 | 写出来的规则 | 什么时候用 |
  | --- | --- | --- |
  | **按文件夹** | `attachments/`、`assets/img/` | 图片同步管的是**具体几个文件夹**。范围与图片同步完全重合 —— 那些文件夹里的东西本来就归它管 |
  | **按扩展名** | `*.png`、`*.PNG`、`*.jpg` …（插件认得的 11 种图片格式） | 图片同步管的是**整个库**（默认设置）。那种配置下按文件夹写等于让 git 什么都不同步，而按扩展名只放走图片、**别的文件照旧进 git** |

  两种形状**不能混着用**：扩展名规则管的是全库，而图片同步只镜像你配的那几个文件夹 ——
  文件夹之外的图片会**同时退出 git 和 R2**（两边都不管）。所以按钮会按你的设置**只给出
  成立的那一种**（整个库 → 默认按扩展名；具体文件夹 → 默认按文件夹）。

  **为什么不能只加规则**：`.gitignore` 只管**未跟踪**的文件，已经提交过的照旧每次提交
  都带着 —— 这是 git 的固有语义，不是配置问题。所以两步必须一起做；按扩展名时「哪些
  图片已被跟踪」是问 git 要的（`git ls-files`），只摘图片，笔记一个都不碰。

  动手之前它会替你检查三件事，任何一条不过就拒绝执行并说明原因：规则形状与图片同步的
  范围对得上、图片同步已配好、**每一张都已经在 R2 上**。最后一条最要紧：别的设备拉取这次
  改动时，工作区里那些图片会被 git 删掉、再由图片同步从 R2 补回来 —— 没上传的那些就真没了。
  另外：**已经写进历史的图片不会消失**，`.git` 里的旧对象还在，仓库体积不会因此变小
  （那需要重写历史，本插件不做）。
- **冲突处理** —— 检测到冲突时在库根目录写一份《SyncHub 冲突指南.md》列出冲突文件，
  然后**立即停止同步链**；手动解决后重新同步，或用「放弃当前合并」回到拉取之前
- **定时同步**（默认关闭）—— 设置页那一行就是**一个周期 + 一个开关**：开了之后每 N 分钟
  跑一次完整链路（提交 → 拉取 → 推送）。周期里没有「0 = 关闭」，开与关只由开关说了算。
  计时基于**上次执行时间**，重启 Obsidian 不重置周期；存储按库隔离，多个库互不干扰。
  **开着的时候那一行会显示距离下次同步的倒计时**（每秒走，到点正在跑时改说「正在同步…」），
  关掉或策略为「重置」挂起时它自己收起来。
  后台那一轮**失败只进日志**（不打扰正在写笔记的你，下一轮多半自愈）—— 但**连续失败 3 次**时
  会说一次，带上归类后的原因（例如「连不上远端…」）与「下一轮仍会自动重试」，成功一次即清零。
  设置页「仓库同步」标题下有两段**注意事项**（选「重置」时定时同步会被暂停、
  多设备同时编辑同一个文件的风险），配之前值得先看一眼
- **仓库同步视图**（侧边栏）—— 打开方式：侧栏的 **git 图标**、点一下**状态栏条目**、
  命令 **SyncHub：打开仓库同步面板**，或者设置页「仓库同步」最上面那个**打开仓库同步面板**
  按钮（在那页配置时最顺手的入口）。顶部是**一行**工具条：**分支下拉在最前**（它决定后面三个
  动作作用在哪条分支上），然后 **提交 / 拉取 / 推送**，再 **刷新**，**立即同步靠右**
  （开了定时同步时，「更改」页的状态摘要那一行还会显示距下次同步的倒计时）。下面是**标签组**（「更改 (N)」/「最近提交」），
  冲突区在标签之外（它是「现在就得处理」的状态）。「更改」那一页顶部是**状态摘要**
  （`与远端一致` / 领先落后）与**仓库大小 / 待提交改动**两栏，还有**格式筛选**，
  再往下才是**按「已暂存 / 更改」分组的文件列表**
  （逐个文件暂存 / 取消暂存、点文件名打开笔记、**查看差异**、在远端打开此文件）、最近 10 条提交
  （点 hash 在远端查看这条提交，或点旁边的差异图标看它改了什么）。不是 git 仓库时这里直接给
  「初始化仓库」按钮。面板是**活的**：定时同步、库外改动、命令面板里的动作都会让它自己刷新。
  **开了定时同步时，工具栏右侧还会显示距离下一次同步的倒计时**（与设置页那一行同一份数据，
  每秒自己走；正在同步时改说「正在同步…」）。
  工具条下面第一行是**远端地址 —— 一个就地可改的输入框**（标题与输入框同一行，输入框宽度自适应；
  失焦或回车即保存，明显写错的输入会被拦住并把框恢复原样；回显仍然脱敏，带令牌的地址不会
  明文出现在屏幕上）。再往下是**标签组**：**「更改 (N)」/「最近提交」** 各占一屏，「更改」那一屏
  顶部是**状态摘要**（`与远端一致` / 领先落后）与**仓库大小 / 待提交改动**两栏，所以列表为空时
  只有一处写「没有需要提交的更改。」—— 改动一多也不用来回滚动（切标签只是换可见性，不会重跑
  那几条 git 命令）。列表上方还有一个**格式筛选**（`全部 / Markdown / .png / …`，选项由这一轮
  实际出现过的格式生成，带数量）—— 只想看笔记时一眼筛出 `.md`；筛选只影响列表，
  「待提交改动」那一栏始终是总数。**冲突区留在标签之外**（它是「现在就得处理」的状态，不能藏起来）。
- **「嵌套仓库」行**（在库的插件/主题目录里就地开发时会出现）—— 那些目录自带 `.git`，
  库把它们记成了**指向另一个仓库的指针**（gitlink，索引模式 `160000`）。这种行在「更改」里
  看着像文件夹、没有文件级差异，而且**怎么点「全部暂存」都消不掉**（指针没变，git 记不下东西）。
  面板会给它加一个 **嵌套仓库** 徽标、写明原因，并给一个 **不再跟踪** 按钮：
  一键「摘索引 + 写进 `.gitignore`」（本地文件与那个目录里的 `.git` 一个都不动，它自己的
  git 照常可用）。不加忽略规则的话，下一轮 `git add -A` 会把指针再加回来 —— 这正是当初
  它进索引的方式。
- **差异视图** —— 面板上每个文件（含冲突行）与每条提交都能点开看改了什么；
  命令面板里也有 **SyncHub：查看当前文件的差异**（看正在编辑的这一个）。
  **在主工作区以标签页打开**（不再是弹窗 —— 弹窗太小，长行读不了；标签页可以拉宽、
  与笔记并排对照）。顶部可以切换**视图模式**：**统一**（一列，增删各占一行）或
  **双栏对照**（像 VS Code：删除在左、新增在右，同一段改动按序号对齐 —— 删 2 行增 3 行时
  多出来的那行只有右栏有内容，一眼看得出是新增）。模式跟着标签页一起记住。
  **复用同一个标签**：连点几处差异不会开出一堆标签；文件差异会
  跟着库状态自己刷新（标签页是常驻的，快照会过期），提交差异是历史里的一条、不会变。
  **工作区改动**与**已暂存改动**分成两节（同一个文件可能两边都有内容），逐行给出
  新旧两个行号、增删分色。未跟踪的新文件按「全部新增」显示内容，二进制、纯重命名、
  内容被截断、文件过大各有明确说明 —— 空白会被读成「没有改动」，那是完全不同的结论。
  合并提交也能看（git 默认对它不输出差异）
- **状态栏条目** —— 分支 / `↑ahead ↓behind` / `~脏文件数` / `⚠冲突数`，以及进行中的动作；
  贴在状态栏**最左侧**（这是刻意的：它回答「现在同步到哪了」，不该藏在右下角），
  并且**可以点开**（打开仓库同步视图）。贴最左需要把状态栏拉成全屏宽，而**那会改变
  状态栏的整体观感**，所以设置页「通用」里给了开关（**状态栏占满整屏宽**，默认开）：
  关掉后状态栏恢复 Obsidian 原样（右下角一簇），同步条目仍在那一簇的最前面
- **在浏览器中打开** —— 当前文件、当前文件的修改历史，以及文件右键菜单里的同样两项；
  GitHub 与 Gitee 各按平台拼链接（中文文件名会自动转义）
- **连接测试** —— 一条递进的检查链：git 可执行文件 → 是否 git 仓库 → 有没有远端 →
  平台能否识别 → **真的 `ls-remote` 连一次**。任何一步失败就停，并说明「只验证了读取」。
  它在设置页「仓库同步」里**排在最前面**（配好之后最常回来点的就是它）
- **编辑远端地址** —— 地址里带凭据（`https://user:token@…`）时会给出警告，提示信息本身也脱敏
- **git 不在 PATH 时** —— 设置页「仓库同步」里那一格填 git 的完整路径（整行输入框，旁边有
  「浏览…」直接调系统的文件选择框；那个入口借的是 Obsidian 自己开文件框时用的能力，
  移动端上点了没反应，但手输一直可用）

#### 🖼️ 图片同步（Cloudflare R2）

给库里的图片在 Cloudflare R2 上存一份副本 —— **笔记走 git，图片走对象存储**。

- **只复制，从不删除** —— 每一轮比对只做「缺哪边补哪边」（云端多出来的下载回来、
  本地多出来的传上去）。**删除只在你删掉本地那张图、并被问过之后才发生**：
  「一边少了 = 用户删的」这件事本质上判断不准（清单丢失、两台设备各删一边都会错），
  判断错的代价是删掉你没打算删的东西
- **删本地时问一句**（默认）—— 弹一次窗问「云端那份也删吗」。也可以设成
  **永远同步云端**（不问，直接一起删 —— R2 没有回收站，删掉不可逆）或
  **永不同步云端**（云端永远不动；注意那一份会被下一轮同步**下载回本地**，
  因为镜像是双向补齐的）
- **需要图片同步的文件夹**（默认整个库）—— 这是**唯一的边界**：只有落在范围内的图片会被同步，
  也只有它们会被删除传播。框里输入路径后按回车加入（输入时下面会给候选），也可以从列表里挑
  （「浏览…」）；已加入的文件夹列在下面，每行右侧的垃圾桶可以移除
- **图片管理面板**（命令 / 侧栏图标 / 设置页按钮）—— 把三件互相独立的事摊平成一张
  可筛选的表：**本地有哪些图**、**云端有哪些图**、**哪些图被笔记 / 画布引用着**。
  三条轴任意组合筛选（有 / 无），于是「把没传上去的补上」「清理没人引用的图」
  「处理只留在云端的」都变成一次筛选的事。每行有缩略图、体积与三个状态徽标，
  「已链接」那个悬停能看到**是谁在引用它** —— 判断一张图能不能删时这是决定性信息
- **点缩略图看大图** —— 30px 的方框里看不清「这到底是张什么图」，而它恰恰是判断一张图
  能不能删之前要看的东西。点缩略图就地弹出预览（**不离开面板**）：**滚轮直接缩放**
  （25% – 400%，也可以按工具条上的按钮），放大时**弹窗整体跟着变大**直到窗口上限，
  再大就按住图片拖动看其余部分；图下面一行给出路径、体积与状态徽标
- **改一张图的名字** —— 每行右侧那颗铅笔按钮，点开只有一个输入框、预填当前文件名。
  它与底部的**批量重命名**是两条路：一个管「就这一张」，一个管「勾选了一批」。
  两者都走 Obsidian 官方改名入口，所以**笔记里的链接会跟着更新**
- **批量操作** —— 同步选中（缺哪边补哪边）、**压缩并同步**（保持原格式，而且
  **只在变小时才写回**：已经压过的图再压一次往往更大）、**批量重命名**（模板式，
  带实时预览）、删除本地 / 删除本地 + 云端
- **笔记内裁剪与压缩** —— 阅读视图里每张库内图片都有悬浮工具条；裁剪框可直接拖拽，
  质量 / 最长边 / 输出格式可调（PNG 是无损的，质量那一格会灰掉）
- **Excalidraw 画布里的引用也认得出** —— 画布数据是 LZString 压缩后写进 `.excalidraw.md` 的，
  压缩之后图片 id 在正文里**一个字都搜不到**；不认的话「清理失联图片」会把正在用的图删掉
- **公网外链** —— 填了自定义域名（或 `r2.dev` 域名）之后，工具条上能直接复制图片外链。
  留空就是明确地表示「还没配」：存储端点每次读都要签名，那种链接粘到笔记里必然打不开

**Secret Access Key 走系统密钥库**（与平台令牌同一条路径），不进 `data.json`。

#### 🧩 社区插件与主题

- **从地址安装** —— 填 `owner/repo` 简写，或直接粘贴 GitHub / Gitee 的完整链接；识别结果会显示平台，
  命中镜像时另有说明
- **两条下载通道** —— 优先 release 资产，仓库没有发 release 时回退到**仓库源码文件**
  （Gitee 上大多数插件仓库没有 release，所以这条通道是必需的，不是补充）
- **版本选择** —— 默认最新，也可以从 release 列表里挑具体版本；只有预发布版的仓库会回退到预发布版
- **版本回退** —— 跟踪列表里每个插件都能切换版本：列出已发布的版本（**当前装的那一版会被标出来**），
  选旧版本即回退。选「最新版本」则恢复跟随最新；选定的版本会被记住（下次打开默认选中它）。
  **要修一个坏掉的安装**：打开它、直接点切换即可 —— 那正是原来那个「重装」按钮做的事
  （默认选中的就是你记录里的那一版），所以那个按钮已经并进来了
- **写入前备份、失败整体回滚** —— 安装失败不会在库里留下半个插件
- **更新检查** —— 单个检查 / 全部检查 / 启动后延迟检查 / 进入设置页时检查（可关）；
  有更新的行常驻徽标（Notice 一闪就错过）。**只检查并提示，安装永远手动**
- **跟踪列表的每一项操作** —— 检查、更新、**版本管理（切到另一个发布版本，选旧版本就是回退）**、
  冻结（不参与更新检查）、打开仓库页、
  取消绑定（**只移出列表，不删任何文件**）
- **绑定库里已装的插件与主题** —— 扫描插件目录与主题目录，按 manifest id / 主题目录名反查官方社区索引，
  一次性纳入跟踪；来源识别不出来的主题可以手填仓库地址
- **Gitee 镜像发现**（默认关闭，且**必须由你确认才会采用**）—— 探测 Gitee 上的镜像，
  用两边 manifest 的 `id` 二次校验（同名不同项目会装错，宁可不用）。候选仓库有两个：
  **同名仓库**，以及**你 Gitee 账号下的同名仓库**（镜像常挂在作者自己的 Gitee 账号下、
  名字与 GitHub 不同；这一条需要先填 Gitee 令牌）。命中只算**提议**：列表里把两个地址
  列出来，点确认、看过那段警示（判据只有 `id` 相同，证明不了是同一份代码）之后才改用镜像，
  之后每次下载完成的提示也会报来源。**两个地址都可以直接点开**去浏览器里核对
  （确认页让你做的事就是「打开镜像仓库看作者/主页/README」）。**探测不到时可以手填地址**：在「版本管理」弹窗里
  输入镜像仓库（例如 `sofqi/Trefoil`），同样按 `id` 校验 —— 探测只猜那两个候选，
  镜像挂在第三个账号下时永远猜不到（实测 Trefoil：GitHub 是 `Dyse-Sofqi`、镜像是 `sofqi`）
- **长耗时动作看得见** —— 点下的那个图标按钮会变成转圈，同时一条带圆环的提示写明
  **在取哪个文件**（「Trefoil：正在获取 main.js…」）。国内网络下第一次访问 GitHub 的
  release 资产常常要等十几秒，没有这个反馈就分不清是在下载还是卡住了
- **SyncHub 自身更新** —— 设置页「SyncHub 自身」一节：检查更新、更新（写新版本文件，重启 Obsidian 生效）。
  **默认从 Gitee 镜像更新**（`https://gitee.com/sofqi/SyncHub`，国内可直连，检查与下载都走它）；
  镜像不可用时**自动改用官方仓库重试，并提示一次**（不会悄悄换来源）；
  想一直走官方就在那一格填 `https://github.com/Dyse-Sofqi/SyncHub`，填一次就一直用它，不再自动探测

#### 🔐 平台与体验

- **双平台适配层** —— GitHub 与 Gitee 的差异（鉴权方式、release 排序、raw 通道、限流特性）只实现一次
- **访问令牌存进系统密钥库** —— 不写进 `data.json`、不随库同步到其他设备；
  错误提示与调试日志里的令牌一律脱敏
- **中文优先、英文对等** —— 所有界面文案与错误信息都走 i18n；错误只携带「类型码 + 参数」，
  人话集中在 locale 里，所以英文界面不会冒出中文
- **移动端可加载** —— 插件安装与主题绑定是纯网络操作，移动端可用；同步模块在移动端不加载

### 用法

#### 安装社区插件

1. 命令面板 → **SyncHub：添加插件仓库**（或点设置页的「添加插件仓库」）
2. 填 `owner/repo` 简写，或直接粘贴完整链接（GitHub / Gitee 都行）
3. 点「识别」→ 选版本 → 安装

也可以点「**浏览社区插件**」从官方市场检索 —— 注意这是 Obsidian 官方维护的索引，
**只有 GitHub 源**，Gitee 上没有等价物，所以 Gitee 的插件需要手输地址。

库里已经装好的插件不用一个个手输：命令 **SyncHub：绑定库里已安装的插件与主题**
（或设置页的「绑定已有插件」）会扫描插件与主题目录，按 manifest id 反查来源仓库，一次性纳入跟踪。

装完之后想换版本（比如新版有问题要退回旧版）：在设置页「已跟踪插件与主题」里点那一行右侧的
**版本管理**按钮，选一个版本即可 —— 旧版本就是回退，选「最新版本」则恢复跟随最新。

> 所有命令在命令面板里都以 `SyncHub：` 开头，直接搜插件名就能找到。

#### 同步笔记仓库

先在设置页的「仓库同步」里填远端地址（命令 **SyncHub：编辑远端地址**），然后：

- 还不是 git 仓库的话，先执行 **SyncHub：初始化仓库**（仓库同步视图里也有这个按钮）
- **SyncHub：立即同步** —— 提交 → 拉取 → 推送，一条链走完（仓库同步视图的顶部工具条里也有）
- 「提交」「推送」是**两个动作**，不是一个：提交只写本地仓库，推送只发送**已提交**的
  内容。想一步到位就用「立即同步」
- 提交信息不用填：它在设置里配模板，每次自动生成
- 也可以在仓库同步视图里逐个文件操作（暂存 / 取消暂存、点开文件、**看差异**、看历史），
  或点侧边栏的状态栏条目把它打开
- 想看改动内容：在面板里点那一行的**差异图标**，或用命令
  **SyncHub：查看当前文件的差异**（看正在编辑的这一个）
- 想在浏览器里看某个文件：命令 **SyncHub：在浏览器中打开当前文件**，或右键文件选「**在远端打开**」

定时同步默认关闭。需要的话在设置页拨开「定时同步」并填周期（分钟）；它每 N 分钟跑一次
完整链路「提交 → 拉取 → 推送」。

**遇到冲突**：SyncHub 不替你决定保留哪一边 —— 它写一份冲突指南并停下，等你处理。

#### 同步图片

在设置页的「图片同步」里填 R2 的账号 ID、桶名、Access Key ID 与 **Secret Access Key**
（密钥走系统密钥库），然后：

- **SyncHub：同步图片** —— 缺哪边补哪边。只想先看看会发生什么，用
  **SyncHub：预览图片同步**（只算不做）
- 想整理图片：**SyncHub：打开图片管理**（或侧栏的图片图标）—— 筛选、批量同步 / 压缩 /
  重命名 / 删除都在那里
- 按周期同步默认关闭（「按周期同步」那一行有**独立的开关**；周期 5–1440 分钟，默认 10）。
  注意它只关掉「按周期跑」—— 只要「自动同步图片」那个开关开着，
  **每次 Obsidian 启动仍会同步一轮**；要连启动那轮都不跑，就把「自动同步图片」关掉
- 想让工具条上的「复制云端链接」可用，还要填**公网访问地址**（自定义域名或 `r2.dev` 域名）

设置页「图片同步」那一页把**操作放在最前面**（打开图片管理 + 测试连接 / 预览变更 /
立即同步）—— 这几个是常用的，而配好之后下面那几节基本不会再翻。

**图片同步与笔记同步互不相干**：前者走 R2、后者走 git，各自有独立的开关与定时器。

### 设置页

| 标签 | 内容 |
| --- | --- |
| 已跟踪插件与主题 | 已安装/添加的插件与主题列表，含更新徽标、检查、更新、版本管理（回退）、冻结、打开仓库、取消绑定（不删文件） |
| 插件安装器 | 启用开关、更新检查时机、Gitee 镜像发现、**访问令牌**（GitHub / Gitee）、SyncHub 自身更新（含**更新来源**） |
| 仓库同步 | **远端地址 + 打开仓库同步面板**（同一行：就地可改的地址输入框 + 打开面板按钮）、**git 可执行文件路径**（整行 + 「浏览…」，描述里跟着「留空用系统 PATH」与「SyncHub 不捆绑 git · 去官网下载」两句 + 可点链接）—— 这**两项排在「连接测试」之前**，因为它们是「测试能通过」的充要条件；再往下是连接测试、定时同步（周期 + 开关同一行 + 距下次同步的倒计时）、提交信息模板、整合策略、**`.gitignore` 编辑框**（可直接改，也能填默认内容或转到编辑器，另有**停止跟踪图片**） |
| 图片同步 | **操作**（**打开图片管理** + 测试连接 / 预览变更 / 立即同步，排在最前面）、**自动同步图片**（开关）、**按周期同步**（周期 + 开关）、需要图片同步的文件夹（整行的路径框，含「浏览…」/「恢复默认」）、R2 连接与密钥、冲突与删除策略、压缩默认值 |
| 通用 | 提示开关、调试日志、**状态栏占满整屏宽** |

**界面语言跟随 Obsidian**：插件不提供单独的界面语言设置项 —— 你在 Obsidian 里
用的语言是什么，插件就是什么（中文 / 英文两套文案对等）。

**令牌只保存在本机**（Obsidian 的密钥存储，老版本回退到 localStorage），
不会写进 `data.json`，也不会随库同步到其他设备。

### 安装

插件尚未上架官方市场。手动安装：

1. 下载 `main.js`、`manifest.json`、`styles.css`
2. 放进 `<你的库>/.obsidian/plugins/ob-sync/`
3. 在 Obsidian 的「第三方插件」里启用 SyncHub

两个发布地址（内容一致，选连得上的那个）：

- GitHub：[Dyse-Sofqi/SyncHub/releases](https://github.com/Dyse-Sofqi/SyncHub/releases)
- Gitee 镜像：[sofqi/SyncHub/releases](https://gitee.com/sofqi/SyncHub/releases)（国内直连更快）

**平台要求**：笔记同步依赖系统 git，**仅桌面端可用**（Windows / macOS / Linux）；插件安装是纯网络操作，
移动端也能用。

> **需要自己装 git**：SyncHub **不捆绑也不下载** git（它是平台相关的原生程序，而插件发布件只有几百 KB）。
> - **Windows**：[Git for Windows](https://git-scm.com/download/win)。装完通常就在 PATH 里；便携版环境
>   （比如自带的 Node 运行时）里常常不在 —— 那时把 `git.exe` 的完整路径填进设置页
>   「仓库同步 → git 可执行文件路径」（旁边有「浏览…」直接开系统文件框）。
> - **macOS**：`/usr/bin/git` 是系统自带的壳，首次调用会提示装 Xcode Command Line Tools，跟着点一下即可。
> - **Linux**：用发行版的包管理器装（`apt install git` / `dnf install git` / `pacman -S git`）。
>
> 装没装好，看设置页「仓库同步」最上面那个**连接测试**：它的第一步就是 git 可执行文件，失败会直接说出来。

### 为什么又做一个

**笔记同步**：`obsidian-git` 很成熟，但它只认 GitHub 与 GitLab。
**插件安装**：`obsidian42-brat` 同样只认 GitHub，而且要求插件必须发过 release。

SyncHub 针对这两点做了扩展：

| | obsidian-git / BRAT | SyncHub |
| --- | --- | --- |
| 平台 | GitHub / GitLab | **GitHub + Gitee** |
| 界面语言 | 英文 | **中文优先**，英文对等 |
| 插件来源 | 必须有 release | release 资产 **或** 仓库源码文件 |
| 安装失败 | 不备份不还原 | **写入前备份，失败整体回滚** |
| 更新 | 启动时自动安装 | **只检查并提示，安装永远手动** |

### 关于 Gitee 的几点说明

**强烈建议在设置页填 Gitee 访问令牌。** Gitee 的匿名 API 配额实测极低 ——
连续十几次请求就会返回 `403 Rate Limit Exceeded`，且一分钟内不恢复。
没有令牌时，SyncHub 会降级到「直接读仓库源码文件」来安装插件，仍然能用，
但查不到版本列表、也无法判断更新。

几个已经处理掉的平台差异（如果你自己改代码，这些别改回去）：

- Gitee 的 releases 列表**默认升序**（GitHub 默认降序），必须显式传 `direction=desc`，
  否则会静默装上一个很旧的版本
- Gitee 的 API raw 端点**对匿名请求一律 401**（即使公开仓库），
  所以匿名读文件走的是网页 raw 通道
- Gitee 的令牌走 `access_token` **查询参数**，GitHub 走 `Authorization` 请求头
- Gitee 的 git Basic 认证只接受 账号名 / `oauth2` / `gitee.com` 三种用户名，
  填 `git`（GitHub 的习惯写法）会被服务端直接拒绝
- 大多数 Gitee 插件仓库**没有发布 release**，所以源码文件通道是必需的
- Gitee 的 release 资产对象**没有 `id`**（只有 `name` 与 `browser_download_url`），
  所以私有仓库的 API 附件端点只在真的拿到 id 时才用；否则回落到公开下载地址（带同一个令牌）

#### 连不上远端 / 代理

SyncHub 调的是**系统 git**，所以它走的就是你 git 的代理：`git config --global http.proxy`
和环境变量（`HTTPS_PROXY` / `ALL_PROXY` 等）**都认**。（0.1.8 及更早会丢掉环境变量那一份 ——
子进程的环境被替换成了只剩两个开关，已修。症状是「终端里能推、插件里连不上」。）

日志里出现

```
fatal: unable to access 'https://…': getaddrinfo() thread failed to start
```

意思是 git 的网络传输层**连 DNS 解析线程都没起来**（不是地址错、也不是令牌错）。按常见程度：

1. **代理没被 git 看到** —— 检查上面两处；环境变量那份改完要重启 Obsidian；
2. **安全软件 / VPN / MITM 代理解析拦了套接字与线程创建**（这是 libcurl 有名的触发场景）；
3. **系统资源紧张** —— 线程、内存或句柄被占满（重启 Obsidian 立刻能验证）。

**怎么判断是不是环境问题**：在库目录里用系统终端跑一次同样的命令
（`git push`，或设置页那个**连接测试**）。终端也失败 → 环境/网络问题，与插件无关；
终端成功而插件失败 → 到 issue 里带上这条日志（插件侧会把这类错误单独归为「连不上远端」，
并提示去查网络与代理，而不是让你去重装或重配令牌）。

### 开发

```bash
pnpm install
pnpm dev         # esbuild watch，构建后自动部署到测试库
pnpm build       # 自查 + 审核闸门 + 类型检查 + 生产构建 + 部署
pnpm build:both  # 同上，但**部署到两个库**（测试库 + 真实库）
pnpm check       # 项目自查（只读，约 0.2 秒）
pnpm lint:review # 审核闸门：只跑社区审核打回过的两条规则（build 已包含）
pnpm lint        # 完整 lint（官方那套规则，信息性，会报既有历史告警）
pnpm typecheck
pnpm test        # 单元测试（不碰网络）
pnpm test:live   # 真实 API 测试，需要网络
pnpm verify:head # 在 **HEAD** 上跑测试（提交后跑一次，见下）
```

- 部署目标默认是 `F:/_Workspace/Plugin-Test/.obsidian/plugins/ob-sync`。
  环境变量 `OBSYNC_DEPLOY_DIR` 可以覆盖，而且**接受多个目录**（用 `;` 分隔）——
  一次构建同时更新几个库；设为空串则跳过部署。

  ```bash
  # 一次部署到两个库（pnpm build:both 就是这条）
  OBSYNC_DEPLOY_DIR="F:/_Workspace/Plugin-Test/.obsidian/plugins/ob-sync;D:/_Workspace/learning-records/.obsidian/plugins/ob-sync" pnpm build
  ```

  只复制 `main.js` / `manifest.json` / `styles.css` 三个文件，**不碰 `data.json`**
  （那是你的设置与跟踪列表）；某个目标写不进去只警告，不中断构建、也不影响另一个目标。
- **`pnpm check` 查六件编译器管不着的事**：manifest 的 `minAppVersion` 是否覆盖了
  代码用到的 Obsidian API、有没有硬编码的中文（会漏给英文用户）、有没有定义了却没
  接上的 i18n 键、CSS 类有没有漏定义、移动端静态导入图是否碰到 Node 依赖、
  有没有「设置项声明了却没有任何代码读它」。
- **`pnpm lint:review` 是审核闸门**（已接进 `pnpm build`）：直接跑社区审核用的
  `eslint-plugin-obsidianmd`，但只把**审核打回过的两条**设成 error
  （`obsidianmd/no-unsupported-api`、`eslint-comments/require-description`），
  其余显式关闭 —— 因为完整那套在本仓库有约 49 条既有告警，全开会让闸门从第一天
  起就是红的，等于没有。0.1.4 就是这两条被审核打回，而 `pnpm check` 看不见它们
  （它按成员名扫，`SecretStorage.*` 恰好在它的豁免表里）。
- 改了 git 相关代码后注意：`simpleGitManager.test.ts` 会起真实 git 进程，
  在这台机器上单独跑约 150 秒 —— 它没挂，只是慢。
- **提交后跑一次 `pnpm verify:head`**：`pnpm test` 读的是**工作区**，而工作区里还压着
  未提交改动时，「本地全绿」说明不了 HEAD 是绿的 —— 可 HEAD 才是别人克隆时看到的东西。
  这条命令把工作区 stash 起来、在 HEAD 上跑测试、再原样还给你。
  （实测踩过：一次提交漏了 `src/settingsTab.ts`，HEAD 上三条用例红了，本地却一直是绿的。）
- **它已经挂在 `pre-push` 上**（`.githooks/pre-push`，`pnpm hooks:install` 启用）：
  push 前自动跑一遍，HEAD 红了就拦住 —— 所以「忘了跑」这种情况也被覆盖了。
  选 push 而不是 commit，是因为 **push 才是「别人能看到」的时刻**，也正是这个错真正
  有害的时刻；而 push 频率远低于 commit，3 分钟等得起。要跳过一次：`git push --no-verify`。
- `pnpm test:live` 里 Gitee 的 API 用例在没有令牌且被限流时会**跳过**而不是失败。
  想跑绿就设 `OBSYNC_GITEE_TOKEN=<令牌>`。

架构与踩坑记录见 [`docs/HANDOVER.md`](docs/HANDOVER.md)，
两个参考项目的分析见 [`docs/reference-analysis.md`](docs/reference-analysis.md)，
发版流程见 [`docs/RELEASE.md`](docs/RELEASE.md)。

---

## 🇬🇧 English

### Introduction

SyncHub bundles three things and refuses to be GitHub-only:

- **Vault sync over git** — commit, pull and push your whole vault to GitHub *or* Gitee in one chain.
  Conflicts are never resolved for you: SyncHub stops the chain and writes a resolution guide instead.
  Every file and every commit in the panel opens a **diff view**.
- **Image sync** — keeps a copy of your vault's images on Cloudflare R2 (notes over git, images over
  object storage): it only fills gaps and never deletes on its own, asks once before deleting a cloud
  copy, and ships a filterable **image manager**.
- **Community plugins and themes** — install, update, freeze and unbind from either platform,
  and adopt the plugins/themes you already have so they update alongside.
- **SyncHub updates itself** — check and apply new versions of the plugin from its own settings page.

All three share a single platform layer, so **every GitHub/Gitee difference is implemented once**.
Chinese-first UI with an equal English one.

### Features

#### 🔄 Vault sync (desktop only)

Needs the system `git` binary, so it is **desktop-only** (Windows / macOS / Linux) — and git has to
be **installed by you** (the plugin does not bundle it; see "Platform requirements" at the end for
per-platform instructions).

- **Sync now** — commit → pull → push in one chain. The repository sync view's **toolbar is a single
  row**: `Commit` / `Pull` / `Push`, the branch dropdown, **`Sync now` pushed to the right**, and
  **`Refresh` at the far right**. **"Commit" writes to the local repository only, and "Push" sends
  committed content only** — it never commits for you, so with uncommitted changes nothing of yours
  goes up (and it says so, including how many changes are still uncommitted). The "scheduled sync"
  timer runs that same full chain
- **You never have to type a commit message** — it is generated from the **commit message template**
  in the settings (default `vault backup: {{date}} ({{numFiles}} files)`, supporting `{{date}}`,
  `{{hostname}}`, `{{numFiles}}` and `{{files}}`). No dialog ever asks you for a message
- **Repository size and pending changes** — shown **side by side in two columns**: **repository
  size** (the `.git` object store plus object count, via `git count-objects`, local-only) and
  **pending changes** (the summed size of changed files). They answer different questions: "how big
  is this vault / how much will a push transfer" and "how much goes up this time". When it cannot be
  read it says so and **never invents a 0 B** (that would look like an empty repository)
- **"In sync" is visible** — when a commit/sync finishes with the local branch fully matching the
  remote (nothing uncommitted, neither ahead nor behind, no conflicts) you get a **prominent notice**
  (✓, longer dwell, repository size included), the status bar shows `✓`, and that line in the panel
  turns green. All three use the **same predicate**. With "show operation notices" turned off you
  lose the notice, but the status bar and panel still show the state
- **Why "Sync now" pulls** — because `git push` only fast-forwards: when the remote has commits you
  do not have, the push is **rejected outright** (accepting it would drop them). This plugin exists
  to sync a vault across devices, so "commit → push" **fails reliably** with two machines, not
  occasionally. The pull comes **after** the commit because committing first puts your changes into
  a recoverable commit, so if integrating the remote goes wrong you can still "Abort current merge"
  and be back where you started — pulling first would leave your uncommitted edits mixed with
  conflict markers. Pulling is also the only way you ever **receive** another device's changes.
  Integration is configurable ("Pull integration strategy"; the default is merge, and **picking
  "reset" suspends automatic sync** — every automatic run would otherwise discard what was just
  committed). If you really do not want the pull to touch your working tree, do it in two steps:
  `Commit` → `Push`
- **Initialize repository** — also creates a `.gitignore` (excluding per-device files such as
  `.obsidian/workspace.json` and `.obsidian/plugins/ob-sync/data.json`, which only ever produce
  conflicts). An existing `.gitignore` is **never overwritten**, and you can edit it at any time —
  the "Vault sync" settings tab has an **editable multi-line box** for it (with "Fill in defaults"
  and "Open in editor" buttons), and there is also an "Edit .gitignore" command
- **Keep images out of git** — when image sync (R2) already handles your images, the `.gitignore`
  section has a **Stop tracking** button that does three things in one go (a modal lays out those
  steps and the two consequences before anything runs, and lets you pick **what the rules are
  based on**):

  1. write the rules into `.gitignore` (only the missing ones) — new images stop entering git;
  2. `git rm -r --cached` the matching tracked files out of git's **index** — **no local file is
     touched**, but the next commit records a deletion;
  3. the next sync (commit → pull → push) publishes that change.

  **Two rule shapes, each with its own scope**:

  | Shape | Rules written | When to use it |
  | --- | --- | --- |
  | **Folders** | `attachments/`, `assets/img/` | Image sync covers **specific folders**. The scope matches image sync exactly — whatever is in those folders already belongs to it |
  | **Extensions** | `*.png`, `*.PNG`, `*.jpg` … (the 11 formats the plugin knows) | Image sync covers **the whole vault** (the default). Folder rules would mean git syncs nothing there, while extension rules only let images go and **keep every other file in git** |

  The two must not be mixed: extension rules cover the whole vault, while image sync only mirrors
  the folders you configured — images outside them would leave git and R2 at the same time (neither
  system handling them). So the button only offers the shape that is **valid** for your settings
  (whole vault → extensions by default; specific folders → folders by default).

  **Why rules alone are not enough**: `.gitignore` only affects **untracked** files, so everything
  already committed keeps riding along with every commit — that is git's semantics, not a setting.
  The two steps have to happen together; in extension mode the "which images are tracked" list comes
  from git (`git ls-files`), so only images are removed and not a single note is touched.

  Before doing anything it checks three things and refuses with a reason if one fails: the rule shape
  matches image sync's scope, image sync is configured, and **every image is already on R2**. The last
  one matters most: when other devices pull this change git deletes those images from their working
  tree and image sync restores them from R2 — anything not uploaded is simply gone. Also: **images
  already written into history stay there** (the old objects remain in `.git`, so the repository does
  not shrink; that would need rewriting history, which this plugin does not do).
- **Conflicts** — on conflict SyncHub writes a resolution guide listing the conflicted files and
  **stops the chain** (continuing would commit conflict markers or push them upstream).
  Resolve by hand and sync again, or use "Abort current merge"
- **Scheduled sync** (off by default) — the settings row is **one interval plus one toggle**: once it
  is on, the full chain (commit → pull → push) runs every N minutes. The interval has no "0 = off" —
  the toggle is the only switch. Timing is based on the **last run** and persists per vault, so
  restarting Obsidian does not reset the cycle and multiple vaults do not interfere. **While it is on,
  that row shows a countdown to the next sync** (ticking every second; it says "syncing…" while that
  round runs, and hides itself when the toggle is off or the strategy is reset). A failing background
  round **only goes to the log** (it does not interrupt you and usually heals next round) — but after
  **3 failures in a row** it says so once, with the classified reason (e.g. "cannot reach the remote")
  and a note that it will retry; one success resets the count. The settings page
  carries **two notes** under the "Vault sync" heading (reset suspends scheduled sync; the risk of
  editing the same file on several devices) — worth reading before you configure it
- **Repository sync view** (sidebar) — open it from the **git ribbon icon**, by **clicking the
  status-bar item**, via the command **SyncHub: Open repository sync panel**, or from the **Open
  repository sync panel** button at the top of the Vault sync settings page (the handiest entry
  while you are configuring it). Its **single-row
  toolbar** starts with the **branch dropdown** (it decides which branch the following actions apply
  to), then `Commit` / `Pull` / `Push`, then **`Refresh`**, with **`Sync now` pushed right** (and the
  countdown to the next scheduled sync appears on the status-summary row of the Changes tab). Below that is a **tab group**
  ("Changes (N)" / "Recent commits"), with the conflict section outside the tabs (it is a "deal with
  this now" state). The Changes tab leads with the **status summary** (`in sync with remote` /
  ahead-behind), the **repository size / pending changes** columns and the **format filter**, and only
  then the changed files **grouped into staged / changes**
  (per-file stage / unstage, click a file name to open the note, **view diff**, open the file on the
  remote) and the last 10 commits (click a hash to view that commit on the remote, or the diff icon
  next to it to see what it changed). When the vault is not a git repository it offers an
  "Initialise repository" button. The panel is **live**: scheduled syncs, outside edits and
  command-palette actions refresh it. **While scheduled sync is on, the Changes tab shows a countdown
  to the next sync on the status-summary row** (same data as the settings row, ticking every second;
  it says "syncing…" while a round runs). That row also tells the truth about the working tree:
  `in sync with the remote` only when nothing is left uncommitted, otherwise it says
  `in sync with the remote, but uncommitted changes remain`. The first row below the toolbar is the **remote URL — an input you
  can edit in place** (label and input on one line, the input taking the remaining width; saving
  happens on blur or Enter, a clearly wrong value is refused and the field reverts, and the value
  shown stays redacted so a token never appears on screen). Below that sits a **tab group**:
  **"Changes (N)" and "Recent commits"** each get their own screen, and the Changes screen leads with
  the **status summary** (`in sync with remote` / ahead-behind) plus the **repository size / pending
  changes** columns — so an empty list says "nothing to commit" in exactly one place, and a long
  change list no longer forces scrolling back and forth (switching tabs only toggles visibility — it
  does not re-run those git calls). Above the list sits a **format filter** (`All / Markdown / .png /
  …`, with options generated from the formats actually present in this change set, each with a
  count) — so a glance at `.md` shows just your notes; the filter affects the list only, and the
  "pending changes" column always reports the total. The **conflict section stays outside the tabs**
  (it is a "deal with this now" state and must not be hidden).
- **"Nested repo" rows** (they show up when you develop a plugin or theme in place inside the
  vault) — those folders carry their own `.git`, so the vault records a **pointer to another
  repository** (gitlink, index mode `160000`). Such a row looks like a folder path with no
  file-level diff and **cannot be staged away** (the pointer did not move, so git has nothing to
  record). The panel marks it with a **nested repo** badge, says why, and offers **Stop tracking**:
  one click removes it from the index and appends it to `.gitignore` (no local file and no nested
  `.git` is touched, and that repository's own git keeps working). Without the ignore rule the next
  `git add -A` would record the pointer again — which is how it got there in the first place.
- **Diff view** — every file in the panel (conflict rows included) and every commit opens a diff;
  the command palette also has **SyncHub: View diff of the current file** for whatever you are
  editing. It opens as a **tab in the main workspace** (no longer a modal — the modal was too small
  to read long lines; a tab can be widened and put side by side with a note), with a **view mode
  switch** on top: **Unified** (one column, additions and deletions on their own lines) or
  **Side by side** (like VS Code: deletions on the left, additions on the right, paired row by row —
  when a change deletes two lines and adds three, the extra row has content only on the right, so it
  is obvious at a glance). The mode is remembered with the tab. The **same tab is
  reused**, so clicking several diffs does not pile up tabs. File diffs refresh themselves as the
  vault state changes (a tab stays open, so a snapshot would go stale); commit diffs are a fixed
  point in history. **Working tree** and **staged** changes are shown as separate sections (a file can have
  both), with old and new line numbers and coloured additions/deletions. Untracked new files are
  shown as "all added", and binary files, pure renames, truncated content and oversized files each
  say what they are — blank space reads as "nothing changed", which is a different conclusion.
  Merge commits work too (git prints no diff for them by default)
- **Status-bar item** — branch / `↑ahead ↓behind` / `~dirty` / `⚠conflicts` plus the action in progress;
  pinned to the **far left** of the status bar on purpose, and **clickable** (opens the repository
  sync view).
  Pinning it there requires stretching the status bar to the full window width, and **that changes how
  the status bar looks**, so the General tab has a switch for it (**"Status bar spans the full width"**,
  on by default): turning it off restores Obsidian's own layout (a bottom-right cluster) with the sync
  item still first in that cluster
- **Open on the remote** — current file and its history, also in the file context menu,
  with per-platform URLs (Gitee included)
- **Connection test** — a step-by-step chain: git binary → git repo → remote configured →
  platform recognised → **an actual `ls-remote`**. It states that it only proves read access.
  It sits **first** on the Vault sync settings page (it is what you come back to most)
- **Edit remote** — warns when the URL embeds credentials, and redacts them in messages
- **When git is not on PATH** — put its full path in the Vault sync settings (a full-width field
  with a "Browse…" button that opens the system file dialog; that entry point borrows the same
  capability Obsidian itself uses, so on mobile the button does nothing — typing always works)

#### 🖼️ Image sync (Cloudflare R2)

Keeps a copy of your vault's images on Cloudflare R2 — **notes travel over git, images over object
storage**.

- **It only ever copies, never deletes** — each round fills the gaps on both sides (download what the
  cloud has extra, upload what the vault has extra). **Deletion happens only after you delete a local
  image and are asked about it**: "one side is missing it = the user deleted it" cannot be decided
  reliably (a lost state file, or one device deleting each side, both break it), and getting it wrong
  deletes something you did not mean to lose
- **Asks before deleting the cloud copy** (default) — one dialog per deletion. Or set it to
  **always sync the cloud** (delete both without asking; R2 has no trash) or **never sync the cloud**
  (the cloud copy is left alone — but the next round will download it back, since the mirror fills
  both directions)
- **Folders to sync** (the whole vault by default) — the **single boundary**: only images inside it
  are synced, and only they can be affected by deletions. Type a path and press Enter to add it
  (suggestions appear as you type), or pick one from the vault with "Browse…"; added folders are
  listed below, each with a trash button to remove it
- **Image manager** (command / ribbon icon / settings button) — flattens three independent facts into
  one filterable table: **which images are local**, **which are on the cloud**, and **which are
  referenced** by notes or canvases. Filter on any combination of the three, so "upload what is
  missing", "clean up orphans" and "deal with cloud-only files" are each a single filter. Every row
  has a thumbnail, a size and three status badges; hovering "linked" shows **who references it** —
  decisive information when deciding whether an image can go
- **Click a thumbnail for the full-size view** — a 30px box cannot show you "which image is this",
  and that is exactly what you need before deciding whether an image can go. Clicking a thumbnail
  opens an in-place preview (**without leaving the panel**): **the wheel zooms directly** (25%–400%,
  or use the toolbar buttons), the **window grows with the image** up to the window limit, and beyond
  that you drag the image to see the rest; a line below gives the path, size and status badges
- **Rename a single image** — the pencil button on each row opens a single field pre-filled with the
  current file name. It is a different path from **bulk rename** at the bottom: one acts on "just this
  one", the other on "the selection". Both go through Obsidian's own rename so **links in your notes
  follow along**
- **Batch actions** — sync selected (fill whichever side is missing), **compress and sync** (keeps the
  original format and **only writes back when smaller** — re-compressing an already-compressed image
  usually makes it bigger), **bulk rename** (templated with a live preview), delete local /
  delete local + cloud
- **Crop and compress inside the note** — every in-vault image gets a floating toolbar in reading
  view; the crop box is draggable and quality / max edge / output format are adjustable (PNG is
  lossless, so the quality control is greyed out for it)
- **Excalidraw canvas references count too** — canvas data is LZString-compressed inside
  `.excalidraw.md`, so image ids appear **nowhere** in the text; without decompressing them,
  "clean up orphans" would delete images that are in use
- **Public URLs** — set a custom domain (or an `r2.dev` domain) and the toolbar can copy an image's
  public URL. Leaving it empty means "not configured yet" on purpose: the storage endpoint needs a
  signature per read and would 403 when pasted into a note

**The Secret Access Key lives in the system keychain** (the same path as platform tokens), never in
`data.json`.

#### 🧩 Community plugins and themes

- **Install from an address** — `owner/repo` shorthand or a full GitHub / Gitee URL;
  the resolved platform is shown, and a detected mirror is called out
- **Two download channels** — release assets first, falling back to **repository source files**;
  most Gitee plugin repos publish no releases, so this fallback is required, not optional
- **Version picker** — latest by default, or a specific release; repositories that only publish
  prereleases fall back to those
- **Version rollback** — every tracked plugin can be switched to another published release from the
  tracked list (the installed one is marked), so rolling back after a bad update is two clicks.
  Picking "Latest release" follows the newest again, and the choice is remembered (it is selected by
  default next time). **To repair a broken install**, open it and click switch — that is exactly what
  the old "reinstall" button did (the recorded version is preselected), so it was folded in here.
  Themes are never pinned, so they have no such button
- **Backup before write, rollback on failure** — a failed install never leaves half a plugin behind
- **Update checks** — single item, all items, after startup, and when opening settings (toggleable);
  rows with updates keep a persistent badge. **SyncHub only reports; installing is always manual**
- **Per-item actions** — check, update, **version manager (roll back to an older release)**,
  freeze (excluded from update checks),
  open repo page, unbind (**removes the entry only, deletes no files**)
- **Adopt installed plugins and themes** — scans the plugin and theme folders and resolves their source
  repositories through the official community index; themes that cannot be resolved can be bound by URL
- **Gitee mirror discovery** (off by default, and **never adopted without your confirmation**) — probes for
  a Gitee mirror when installing from GitHub and verifies it by comparing manifest `id`s. Two candidates are
  probed: a **same-named repository**, and a **same-named repository under your own Gitee account** (mirrors
  often live on the author's Gitee account under a different name — this one needs a Gitee token). A hit is
  only a **proposal**: the tracked list lists both addresses, and the switch happens after you confirm it and
  read the warning (the `id` match proves the same plugin, not the same code). Downloads then report their source.
  **No mirror found? Type the address yourself** in the version dialog (e.g. `sofqi/Trefoil`) — it is verified
  the same way. Discovery only guesses those two candidates, so a mirror under some third account is invisible
  to it (as measured with Trefoil: GitHub `Dyse-Sofqi`, mirror `sofqi`)
- **Long operations are visible** — the icon button you clicked turns into a spinner, and a notice with a
  spinner states **which file is being fetched** ("Trefoil: fetching main.js…"). The first request to GitHub's
  release asset CDN often takes 10+ seconds from mainland China; without this you cannot tell download from stall
- **Self-update** — check and apply new versions of SyncHub itself (restart required). The
  **source is configurable**: leave it empty for the official repository, or enter a mirror
  (e.g. `https://gitee.com/sofqi/SyncHub`) when GitHub is slow or blocked — it is then used
  every time, with no automatic probing

#### 🔐 Platform and UX

- **One platform layer** — every GitHub/Gitee difference (auth style, release ordering, raw channel,
  rate limits) is implemented once
- **Tokens live in the OS keychain** — never written to `data.json`, never synced with the vault,
  and redacted from error messages and debug logs
- **Chinese-first, English equal** — all UI text and errors go through i18n; errors carry type codes
  and parameters so no Chinese leaks into the English UI
- **Loads on mobile** — plugin installation and theme binding are pure network operations;
  the sync module is not loaded there

### Usage

#### Installing community plugins

1. Command palette → **SyncHub: Add plugin repository** (or the button in the settings page)
2. Enter an `owner/repo` shorthand or paste a full URL (GitHub or Gitee)
3. Click "Resolve" → pick a version → install

You can also click **Browse community plugins** to search the official directory — note that it is
Obsidian's own index and **covers GitHub only** (there is no Gitee equivalent), so Gitee plugins
have to be entered by address.

Already-installed plugins do not have to be typed in one by one: the command
**SyncHub: Bind plugins and themes already installed in this vault** (or "Bind existing" in the
settings) scans the plugin and theme folders, resolves their source repositories from the manifest
`id`, and tracks them all at once.

To switch a version later (for example rolling back after a bad update), click **Version manager**
on that row under "Tracked plugins and themes" and pick a release — an older one is a rollback,
while "Latest release" resumes following the newest.

> Every command starts with `SyncHub:` in the palette, so searching the plugin name finds them all.

#### Syncing the vault

First set the remote in the settings page under "Vault sync" (command
**SyncHub: Edit remote address**), then:

- If the vault is not a git repository yet, run **SyncHub: Initialize repository** first (the
  repository sync view has the same button)
- **SyncHub: Sync now** — commit → pull → push in one chain (the view's toolbar has it too)
- "Commit" and "Push" are **two separate actions**: commit writes to the local repository only,
  push sends **committed** content only. Use "Sync now" to do both
- No commit message to type: it comes from the template in the settings
- You can also work per file in the repository sync view (stage / unstage, open a file, **view
  diff**, view history), or click the status-bar item to open it
- To see what changed: click the **diff icon** on a row in the panel, or use the command
  **SyncHub: View diff of the current file** for the one you are editing
- To view a file in the browser: command **SyncHub: Open current file in browser**, or right-click
  the file and pick **Open on the remote**

Scheduled sync is off by default. Turn it on by flipping the "Scheduled sync" toggle and setting the
interval (minutes) in the settings; it then runs the full chain (commit → pull → push) every N minutes.

**On conflict**, SyncHub does not decide which side wins — it writes a resolution guide and stops,
waiting for you.

#### Syncing images

Fill in the R2 account ID, bucket, Access Key ID and **Secret Access Key** on the "Image sync"
settings tab (the secret goes to the system keychain), then:

- **SyncHub: Sync images** — fills whichever side is missing. To see what it *would* do first, use
  **SyncHub: Preview image sync** (computes, never writes)
- To tidy up: **SyncHub: Open image manager** (or the ribbon icon) — filtering, batch
  sync / compress / rename / delete all live there
- Periodic sync is off by default (the "Periodic sync" row has its **own toggle**; the interval is
  5–1440 minutes, default 10). Note that it only switches off the periodic run — as long as the
  "Automatic image sync" switch is on, **every Obsidian startup still syncs once**; turn that switch
  off to stop the startup round too
- To enable "copy cloud link" in the toolbar, also fill in the **public base URL** (a custom domain
  or an `r2.dev` domain)

The "Image sync" settings tab puts the **actions first** (open image manager, plus test connection /
preview changes / sync now) — those are the everyday entries, while the sections below are configured
once.

**Image sync and vault sync are independent**: one goes through R2, the other through git, with their
own switches and timers.

### Settings

| Tab | Contents |
| --- | --- |
| Tracked plugins & themes | The list, with update badges, check, update, version manager (rollback), freeze, open repo, unbind |
| Plugin installer | Enable switch, update-check timing, Gitee mirror discovery, **access tokens**, self-update |
| Vault sync | **Remote URL + Open repository sync panel** (one row: an address input you can edit in place, plus the panel button), **git executable path** (full-width + "Browse…", with "empty means the system PATH" and "SyncHub does not bundle git — download it here" in one description plus a clickable link) — **these two come before the connection test**, because they are what a successful test depends on; then the connection test, scheduled sync (interval + toggle in one row, plus a countdown to the next sync), commit message template, strategy, **`.gitignore` editor** (edit in place, fill in defaults, or open it in the editor, plus **Stop tracking images**) |
| Image sync | **Actions first** (**Open image manager** plus test connection / preview changes / sync now), **automatic image sync** (toggle), **periodic sync** (interval + toggle), folders to sync (a full-width path box with "Browse…" / "Restore default"), R2 connection and secret, conflict and deletion policy, compression defaults |
| General | UI language, notices, debug logging, **status bar spans the full width** |

Tokens are stored **locally only** (Obsidian's secret storage, falling back to localStorage for older
versions), never in `data.json`, and never synced to other devices.

### Installation

Not in the community plugin list yet. Manual install:

1. Download `main.js`, `manifest.json` and `styles.css`
2. Put them in `<your vault>/.obsidian/plugins/ob-sync/`
3. Enable SyncHub under Community plugins

Two release locations (same artifacts — use whichever is reachable):

- GitHub: [Dyse-Sofqi/SyncHub/releases](https://github.com/Dyse-Sofqi/SyncHub/releases)
- Gitee mirror: [sofqi/SyncHub/releases](https://gitee.com/sofqi/SyncHub/releases)

Vault sync needs the system `git` binary and is **desktop-only** (Windows / macOS / Linux); plugin
installation works on mobile.

> **You have to install git yourself**: SyncHub does **not** bundle or download git (it is a
> platform-specific native program, while a plugin release is a few hundred KB).
> - **Windows**: [Git for Windows](https://git-scm.com/download/win). It usually lands on PATH; in
>   portable setups (such as a bundled Node runtime) it often does not — then put the full path to
>   `git.exe` into Vault sync → "Git executable path" (the "Browse…" button opens the system file
>   dialog).
> - **macOS**: `/usr/bin/git` is a system stub; the first call offers to install the Xcode Command
>   Line Tools — just accept it.
> - **Linux**: install it with your package manager (`apt install git`, `dnf install git`,
>   `pacman -S git`).
>
> To check whether it worked, use the **connection test** at the top of the Vault sync settings page:
> its first step is the git binary, and it says so when that fails.

### Why another one

**Vault sync**: `obsidian-git` is mature, but it only knows GitHub and GitLab.
**Plugin install**: `obsidian42-brat` is also GitHub-only, and requires the plugin to have published
a release.

SyncHub extends both:

| | obsidian-git / BRAT | SyncHub |
| --- | --- | --- |
| Platforms | GitHub / GitLab | **GitHub + Gitee** |
| UI language | English | **Chinese-first**, English equal |
| Plugin source | Requires a release | Release assets **or** repository source files |
| Failed install | No backup, no rollback | **Backup before write, rollback on failure** |
| Updates | Auto-installed at startup | **Reports only; installing is always manual** |

### Notes on Gitee

**Setting a Gitee access token is strongly recommended.** Gitee's anonymous API quota is measured to
be very low — a dozen or so consecutive requests return `403 Rate Limit Exceeded`, and it does not
recover within a minute. Without a token SyncHub degrades to reading repository source files
directly, which still works, but it cannot list versions or detect updates.

A few platform differences that are already handled (do not undo them if you touch the code):

- Gitee's release list is **ascending by default** (GitHub is descending); `direction=desc` must be
  passed explicitly, otherwise a very old version is installed silently
- Gitee's API raw endpoint returns **401 for anonymous requests** even on public repositories, so
  anonymous file reads go through the web raw channel
- Gitee takes its token as an `access_token` **query parameter**; GitHub uses an `Authorization` header
- Gitee's git Basic auth only accepts the account name / `oauth2` / `gitee.com` as the username;
  `git` (the GitHub habit) is rejected outright by the server
- Most Gitee plugin repositories **publish no releases**, so the source-file channel is required
- Gitee's release asset objects carry **no `id`** (only `name` and `browser_download_url`), so the
  private-repo API attachment endpoint is only used when an id is really present; otherwise it falls
  back to the public download URL (with the same token)

#### Cannot reach the remote / proxy

SyncHub drives the **system git**, so it uses your git's proxy: both `git config --global http.proxy`
and the environment variables (`HTTPS_PROXY` / `ALL_PROXY` …) are honoured. (0.1.8 and earlier dropped
the environment-variable half — the child environment was replaced with just two switches; fixed. The
symptom was "pushes work in my terminal but not in the plugin".)

A log line like

```
fatal: unable to access 'https://…': getaddrinfo() thread failed to start
```

means git's network transport could not even start its **DNS resolver thread** (so it is not a bad URL
and not a bad token). In rough order of likelihood:

1. **git cannot see the proxy** — check the two places above; restart Obsidian after changing the
   environment variables;
2. **security software / VPN / MITM proxy interfering with socketpair and thread creation** (a
   well-known libcurl trigger);
3. **resource pressure** — threads, memory or handles exhausted (restarting Obsidian is an instant
   test).

**Telling environment from plugin**: run the same command in the vault with a system terminal
(`git push`, or the settings page's **connection test**). Fails there too → it is your environment or
network, not the plugin. Works there but not in the plugin → open an issue with that log line (the
plugin classifies this class as "cannot reach the remote" and points you at the network and proxy
instead of telling you to reinstall or re-enter the token).

### Development

```bash
pnpm install
pnpm dev         # esbuild watch, deploys to the test vault after each build
pnpm build       # self-check + review gate + typecheck + production build + deploy
pnpm build:both  # same, but deploys to both vaults (test + real)
pnpm check       # read-only project self-check (~0.2 s)
pnpm lint:review # review gate: only the two rules the community review rejected (part of build)
pnpm lint        # full lint (the official rule set; informational, reports existing findings)
pnpm typecheck
pnpm test        # unit tests (no network)
pnpm test:live   # live API tests (needs network)
pnpm verify:head # runs the tests on **HEAD**, not the working tree (see below)
```

The default deploy target is `F:/_Workspace/Plugin-Test/.obsidian/plugins/ob-sync`. The
`OBSYNC_DEPLOY_DIR` environment variable overrides it and accepts **several** directories
separated by `;`, so one build can update multiple vaults; set it to an empty string to
skip deploying. Only `main.js`, `manifest.json` and `styles.css` are copied — never
`data.json` (your settings and tracked list). A target that cannot be written is warned
about without failing the build or the other targets.

**Run `pnpm verify:head` after each commit.** `pnpm test` reads the *working tree*, so
while uncommitted changes are lying around, "green locally" says nothing about HEAD —
and HEAD is what everyone else clones. The command stashes the working tree (untracked
files included), runs the suite on HEAD, then restores everything. It exists because of a
real one: a commit shipped the tests and i18n keys but forgot `src/settingsTab.ts`, leaving
three committed tests red on HEAD while everything stayed green locally.

**It is also wired to `pre-push`** (`.githooks/pre-push`, enabled by `pnpm hooks:install`),
so it runs before every push and blocks a red HEAD — which means "I forgot to run it" is
covered too. Push rather than commit, because pushing is the moment others can see it and
therefore when a red HEAD starts to hurt; and pushes are rare enough that the ~3 minutes
are affordable. Skip it once with `git push --no-verify`.

Architecture notes and a long list of field-tested pitfalls live in
[`docs/HANDOVER.md`](docs/HANDOVER.md); the release checklist is in [`docs/RELEASE.md`](docs/RELEASE.md).

---

## 赞助 / Sponsor

如果这个插件对你有帮助，欢迎扫码赞助 ❤️

![赞助](https://raw.githubusercontent.com/Dyse-Sofqi/SyncHub/main/zanshang.jpg)

也可通过 [PayPal](https://paypal.me/Sofqi) 赞助。

If SyncHub has been useful to you, you are welcome to buy me a coffee ❤️

![Sponsor](https://raw.githubusercontent.com/Dyse-Sofqi/SyncHub/main/zanshang.jpg)

You can also sponsor via [PayPal](https://paypal.me/Sofqi).

## License

[MIT](LICENSE)
