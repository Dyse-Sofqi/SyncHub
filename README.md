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
  仓库同步视图（侧边栏，可点状态栏打开）· **同步特效横幅**（转圈 + 三个阶段 + 不确定进度条，
  动作中禁用动作按钮）· 状态栏条目（**忙碌时转圈圆环 + 「正在同步：提交中…」**）·
  初始化仓库时建 `.gitignore`（设置页里可直接编辑）· **大文件预防**（补齐推荐忽略规则 /
  提交前按阈值拦截，默认 5 MB）· **清理**（体检 / 回收 / 深度清理，含备份与回退）·
  **差异视图**（逐文件 / 逐提交 / 当前文件）·
  在远端打开文件/历史/提交 · 编辑远端 · 连接测试 · 设置页里初始化仓库（状态徽标只问一次）
- **图片同步** — Cloudflare R2 双副本（只复制不删除）· 删本地时问一句（三档）· 需要图片同步的文件夹 ·
  **变动后自动同步**（受管文件夹里改动后停手 30 秒跑一轮；周期同步只管其他设备的变化）·
  图片管理面板（本地 / 云端 / 已链接三条轴筛选、缩略图、**点缩略图看大图（滚轮缩放 / 放大后拖动）**、
  **单张重命名**、批量同步 / 压缩 / 重命名 / 删除）·
  笔记内裁剪压缩（保持原格式、只在变小时写回）· Excalidraw 压缩画布的引用也认得出 ·
  公网外链 · 密钥进系统密钥库
- **插件与主题** — 地址识别（GitHub / Gitee）· release 资产与仓库源码双通道 · 版本选择（含预发布回退）·
  写入前备份 + 失败回滚 · 更新检查（单个/全部/启动/进入设置页）· 常驻更新徽标 · 冻结 ·
  **版本回退** · 取消绑定（不删文件）· 绑定已装插件与主题 · **从仓库新装主题（不替你切换）** ·
  Gitee 镜像发现 · 自我更新（镜像源开关）
- **平台与体验** — 双平台适配层 · **功能区账号头像（Gitee / GitHub，带换头像链接；点头像直达设置「通用」页）** ·
  状态栏条目贴靠最左侧（可关，只改自己的顺序）· 令牌进系统密钥库并从日志脱敏 · 中文优先英文对等 ·
  错误文案走类型码 + locale · 移动端可加载（同步仅桌面）

**English**

- **Vault sync** — commit → pull → push in one chain · conflict guide (no auto-resolution) ·
  scheduled sync (one interval running the full chain) · repository sync view (sidebar, openable from the status bar) ·
  **syncing banner** (spinner + three stages + an indeterminate bar, action buttons disabled while it runs) ·
  status-bar item (**a spinning ring while busy, reading "Syncing: committing…"**) ·
  `.gitignore` created on init (editable in the settings page) ·
  **large-file prevention** (add missing recommended ignore rules / block over a threshold before
  commit, 5 MB default) ·
  **cleanup** (inspect / reclaim / deep clean, with backup and rollback) ·
  **diff view** (per file / per commit / current file) ·
  open file/history/commit on the remote · edit remote · connection test ·
  initialise the repository from the settings page (status badge asked only once)
- **Image sync** — Cloudflare R2 mirror (copy only, never delete) · one prompt before deleting a cloud
  copy (three modes) · folders to sync ·
  **sync after changes** (a round runs 30 s after you stop editing inside the managed folders; periodic
  sync only pulls in changes made on *other* devices) · image manager (filter on local / cloud / linked,
  thumbnails, **click a thumbnail for the full-size view — the wheel zooms, drag when it is larger than
  the window**, **rename a single image**, batch sync / compress / rename / delete) · crop and compress
  inside the note (keeps the original format, writes back only when smaller) · understands Excalidraw's
  compressed canvas references · public URLs · secret key in the OS keychain
- **Plugins & themes** — address recognition (GitHub / Gitee) · release assets **and** repository source fallback ·
  version picker (with prerelease fallback) · backup before write + rollback on failure · update checks
  (single / all / on startup / on opening settings) · persistent update badges · freeze ·
  **version rollback** · unbind (keeps files) · adopt already-installed plugins and themes ·
  **install themes from a repository (never switches for you)** · Gitee mirror discovery ·
  self-update (mirror toggle)
- **Platform & UX** — one platform layer for both hosts ·
  **ribbon account avatar (Gitee / GitHub, with a change-avatar link; click it to jump straight to the General settings tab)** ·
  status-bar item pinned first (can be turned off; only its own order changes) ·
  tokens in the OS keychain, redacted from logs ·
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
  （那要在设置页「清理」里做一次**深度清理** —— 重写全部提交）
- **别让大文件进 git** —— 仓库体积失控几乎从来不是笔记造成的：一次实测里，一个 159 次提交的
  笔记库有 460 MB 的 `.git`，其中插件构建产物 319 MB、字体 186 MB、向量库缓存 84 MB，而真正的
  markdown 只有 63 MB。而 **git 的历史不可逆**（事后清理要重写全部提交，本插件不做），
  所以预防都建在「它进历史之前」，分两层：

  1. **推荐忽略规则** —— 设置页「仓库同步」里的「**补齐推荐的忽略规则**」按钮，把字体
     （`ttf/ttc/otf/woff/woff2`）、Office / LibreOffice 临时文件（`~$*`、`.~lock.*#`）、
     **本地状态文件**（`workspace.json`、`workspace-mobile.json`、`workspaces.json`、
     `*-position-cache.json`）这几类规则并进 `.gitignore`。**只追加缺的那些，你自己写的
     规则一行都不动**（幂等，可以随手点）—— 它与那个**覆盖式**的「填入默认内容」是两回事。
     另有一个「**忽略插件目录**」开关（默认**关**）：打开能显著缩小仓库，但代价是
     换设备 clone 之后插件不会自动就位、得重新装 —— 这是取舍，交给你选。
     旁边还有一个「**停止跟踪本地状态文件**」按钮：光加忽略规则**对已经跟踪的文件没用**
     （`.gitignore` 只管未跟踪的），而已经同步了一阵子的库恰恰最需要它 —— 它会把已跟踪的
     那几个从索引里摘掉（**本地文件不动**）并补上规则
- **为什么「本地状态文件」也算一类** —— 因为重写历史的开销**只吃提交数**，与每个提交
  改了多少字节无关。而 `workspace.json` 这类文件**每开关一个标签就变**：让它们进 git，
  等于给每个同步周期都准备好一个「有东西可提交」。这跟大文件是**两条独立的轴** ——
  大文件拦截防体积，防不了这一条
  2. **提交前的大文件拦截** —— 忽略规则只能挡住「想到过的类型」，真正把仓库撑起来的多半是
     意料之外的（插件的向量库缓存、一段录屏、一个几百 MB 的 PDF）。所以提交 / 立即同步时，
     待提交文件里**超过「大文件阈值」**（默认 5 MB，填 0 关闭）的会被拦下、**弹窗问一次**，
     整条链路停在那里 —— 不会出现「同步完成」而那个文件其实没提交。弹窗把两个选择各自的
     **代价**都写清楚了：**仍然提交**（它以后每次改动都会在历史里再存一份完整副本）或
     **退出跟踪并忽略**（不再有版本历史、本地文件保留；**历史里已有的副本不会消失**，
     仓库体积不会因此变小）。关掉弹窗 = 取消。**自动同步不弹窗**，改为发一条通知
- **清理**（设置页「仓库同步」的**清理**一节）—— 仓库已经大了怎么办。三层风险递增，
  每一层都把代价写在动手之前：
  1. **体检**（只读）—— 按**目录**汇总历史里占空间最多的部分，外加最大的单个对象。
     按目录而不是按文件，是因为**剔除的单位就是目录**：报告里的每一行正好是一个能拿去
     执行的动作。库根目录的文件只报账、不提供勾选（剔掉它们等于清空整个库）
  2. **回收空间** —— `git gc --prune=now`。安全，但**常常一点也回收不到**：大文件基本都在
     可达的历史里，只有重写才能清掉
  3. **深度清理**（**不可逆**）—— 把选中的路径从**全部历史**里剔除（重写每一个提交）。
     动手前把三件事摆出来：**所有提交的哈希都会变**（远端要强制推送、其他设备要重新 clone）、
     **已经推到远端的旧历史清不掉**、以及**预计耗时**（按提交数算，实测约 3.5 秒/提交，
     一个 159 提交的库约 10 分钟，期间别关 Obsidian）。执行前**先建一个备份引用**，
     失败或后悔都能退回去；执行后**自动把那几条路径写进 `.gitignore`**，否则它们会在
     下次提交时原样回来
  4. **丢弃备份并回收** —— 重写之后空间**不会立刻变小**（备份还拉着旧对象，这是刻意的：
     先让你确认库还能用，再丢退路）。确认无误后点它，才真正释放空间。**不可逆**
- **冲突处理** —— 检测到冲突时在库根目录写一份《SyncHub 冲突指南.md》列出冲突文件，
  然后**立即停止同步链**；手动解决后重新同步，或用「放弃当前合并」回到拉取之前
- **定时同步**（默认关闭）—— 设置页那一行就是**一个周期 + 一个开关**：开了之后每 N 分钟
  跑一次完整链路（提交 → 拉取 → 推送）。周期里没有「0 = 关闭」，开与关只由开关说了算。
  计时基于**上次执行时间**，重启 Obsidian 不重置周期；存储按库隔离，多个库互不干扰。
  **开着的时候那一行会显示距离下次同步的倒计时**（每秒走，到点正在跑时改说「正在同步…」），
  关掉或策略为「重置」挂起时它自己收起来。
  后台那一轮**失败只进日志**（不打扰正在写笔记的你，下一轮多半自愈）—— 但**连续失败 3 次**时
  会说一次，带上归类后的原因（例如「连不上远端…」）与「下一轮仍会自动重试」，成功一次即清零。
  设置页「仓库同步」**页最上方**有两段**注意事项**（选「重置」时定时同步会被暂停、
  多设备同时编辑同一个文件的风险），配之前值得先看一眼
- **仓库同步视图**（侧边栏）—— 打开方式：侧栏的 **git 图标**、点一下**状态栏条目**、
  命令 **SyncHub：打开仓库同步面板**，或者设置页「仓库同步」最上面那个**打开仓库同步面板**
  按钮（在那页配置时最顺手的入口）。顶部是**一行**工具条：**分支下拉在最前**（它决定后面三个
  动作作用在哪条分支上），然后 **提交 / 拉取 / 推送**，再 **刷新**，**立即同步靠右**
  （开了定时同步时，「更改」页的状态摘要那一行还会显示距下次同步的倒计时）。下面是**标签组**（「更改 (N)」/「最近提交」），
  冲突区在标签之外（它是「现在就得处理」的状态）。「更改」那一页顶部是**状态摘要**
  （`与远端一致` / 领先落后）与**仓库大小 / 待提交改动**两栏，还有**格式筛选**，
  再往下才是**按「已暂存 / 更改」分组的文件列表**
  （点文件名打开笔记、**查看差异**、在远端打开此文件、**放弃更改** ——
  把那个文件退回上次提交的样子；**没有**暂存开关，见下面「为什么不给逐文件暂存」）、最近 10 条提交
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
- **「放弃更改」** —— 每一行上那个回退箭头：把这个文件退回**上次提交**的样子。
  两种场景共用一个动作，因为它们在 git 眼里是同一件事：**改坏了想退回**，
  以及**误删了想找回**（被删的文件会从上次提交里重新写出来）。
  它是本插件**唯一会丢用户编辑**的动作，而且**不可逆** —— 放弃的编辑从来没被提交过，
  不在 git 里，`git fsck` 也找不回来。所以确认弹窗会**列出具体哪几个文件**、把这一点写在正文里，
  确认按钮用警示色。两类行**没有**这个按钮：**未跟踪的新文件**（没有「上次提交」可退，
  而「放弃」对它们等于删掉一个新文件 —— 丢的东西一点退路都没有）、
  **冲突行**（冲突区已经有「放弃本次合并」）。
- **为什么不给逐文件暂存**（2026-10-10 去掉）—— 面板曾经有「暂存此文件 / 取消暂存」与
  「全部暂存 / 全部取消暂存」，但**它们做不到看起来在做的事**：SyncHub 的「提交」是
  `git add -A`，**手动暂存了什么对最终提交毫无影响**；更要紧的是**定时同步到点会把它们
  一起提交掉** —— 也就是说这个按钮**连「暂时不提交」都做不到**。用户暂存 A 想只提交 A，
  结果 B 一起进去了。**SyncHub 不做选择性提交**：它的定位是「把整个库同步上去」。
  （按暂存状态的**分组**保留 —— 冲突文件在 `git status` 里同时进 staged 与 unstaged，
  去重后落在「已暂存」那一组。）
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
  排在状态栏**最左侧**（这是刻意的：它回答「现在同步到哪了」，不该藏在右下角），
  并且**可以点开**（打开仓库同步视图）。它只改自己的视觉顺序（CSS 的 `order`），
  **不动别人的条目** —— 状态栏仍是 Obsidian 原样（右下角一簇）。
  不想贴最左可以关掉：设置页「通用」里的**状态栏同步条目贴靠最左侧**（默认开），
  关掉后条目按默认顺序排，不作特殊处理
- **同步看得见** —— 忙碌时状态栏那一格挂一个**转动的圆环**、文字转成强调色，
  文案也改成「**正在同步：提交中…**」（点「立即同步」时一眼分出这是三步链路里的
  一步，后面还有拉取与推送；悬停提示同样改口）。侧边栏仓库同步面板的**工具条正下方**
  还有一条同步特效横幅（转圈 + 三个阶段 + 一根**不确定**进度条 —— git 不会报
  「推到第几个对象」，编一个百分比就是骗人，三个阶段本身才是真实可得的进度），
  动作进行中四个动作按钮禁用（**刷新不在其中**，它只读、随时可点）
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

- **什么时候同步：四个触发器各管一件事。**

  | 触发器 | 管什么 | 默认 |
  | --- | --- | --- |
  | **变动后自动同步** | **本机**改动 → 云端（停手 30 秒跑一轮，5–600 可调） | **开** |
  | **按周期同步** | **其他设备**上的变化 → 本机（周期 5–1440 分钟） | 关，30 分钟 |
  | 编辑器保存 | 单张图要立刻有结果 | 始终 |
  | 启动后一轮 | 兜住「静默期内关窗」 | 始终 |

  **为什么不能只留「变动后自动同步」把周期删掉**：事件只看得见**本机**的改动 ——
  另一台设备传的图、或者你在 R2 控制台手工删的对象，本机什么都没发生 → 没有事件 →
  计时器根本不会被启动。周期那一轮是**唯一**能看见那些变化的。
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
- **插件与主题是两个入口** —— 「添加插件仓库」与「添加主题仓库」（设置页「插件与主题」页顶部的按钮行，另外各有一条命令）。
  主题会写进 `themes/` 并纳入跟踪，**装完不替你切换**：到「设置 → 外观 → 主题」里选它。
  万一填错了入口，失败时插件会探一下对面那个标志性文件（`main.js` / `theme.css`），
  确有的话直接给一个「改为按主题安装」（或反过来）的按钮 —— 而不是只留一句「缺少 main.js」
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
- **功能区账号头像**（默认关）—— 左侧功能区**底部**挂一张当前令牌账号的圆形头像，
  平台由「使用 Gitee 头像」决定；地址与账号名**同一次** `validateToken()` 拿到，
  那个平台没配令牌时**一个请求都不发**；描述里带**换头像的个人资料页链接**（跟着平台走）。
  **点它打开设置窗口并停靠「通用」页**（换平台、改令牌都在那一页）；头像外侧**常驻**一圈
  柔灰虚影环，**悬停时**环加深并晕开一团保守的模糊扩散，但**光标保持默认**
- **状态栏同步条目贴靠最左侧**（默认开）—— 同步条目排在状态栏那一簇的**最左侧**
  （只改自己的视觉顺序，不动其他条目）；关掉后不作特殊处理，按 Obsidian 默认顺序排。
  状态栏本身不碰（仍是 Obsidian 原样的右下角一簇）
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
（或设置页「插件与主题」页顶部的「**绑定已有插件或主题**」）会扫描插件与主题目录，
按 manifest id 反查来源仓库，一次性纳入跟踪。

装完之后想换版本（比如新版有问题要退回旧版）：在设置页「插件与主题」里点那一行右侧的
**版本管理**按钮，选一个版本即可 —— 旧版本就是回退，选「最新版本」则恢复跟随最新。

#### 安装主题

1. 命令面板 → **SyncHub：添加主题仓库**（或点设置页「插件与主题」页顶部的「添加主题仓库」）
2. 填 `owner/repo` 简写，或直接粘贴完整链接（仓库里要有 `manifest.json` 与 `theme.css`）
3. 点「识别」→ 安装

主题会写进 `{configDir}/themes/` 下**以主题名命名的目录**（官方主题商店也这么落），
并纳入跟踪列表，之后的「检查更新 / 更新」都走同一套。**SyncHub 不会替你切换主题** ——
装完到「设置 → 外观 → 主题」里选它（插件卸载也不会动你的主题选择）。

> 把主题地址填进「添加插件仓库」时，失败信息里会点明「这个仓库里是主题（有 theme.css、
> 没有 main.js）」并给一个**改为按主题安装**的按钮 —— 不用自己回去换入口再粘一遍。
> 反方向（把插件地址填进「添加主题仓库」）同样有对应的按钮。

> 目标目录里已经装着**另一个**主题时会被拒绝（同名不同主题确实存在）。理由：被覆盖的
> 很可能正是你当前在用的那个，而它不一定在跟踪列表里，没有「重新下载」这条路。
> 想跟踪一个已经装好的主题，用「绑定已有插件或主题」。

> 所有命令在命令面板里都以 `SyncHub：` 开头，直接搜插件名就能找到。

#### 同步笔记仓库

**基本设置全在设置页的「仓库同步」里**，按从上到下的顺序走完即可（这一页的结构就是这样排的）：

1. **初始化 git 仓库** —— 库还不是仓库时点它（右侧徽标会直接告诉你现在是不是）。
   顺手会建一份默认 `.gitignore`（已经有的绝不覆盖）。
   命令 / 侧边栏面板里也有一模一样的入口，走的是同一个实现
2. **远端地址** —— 填仓库地址（也能就地改；命令 **SyncHub：编辑远端地址**）
3. **git 可执行文件路径** —— 只在 git 不在 PATH 时才需要填
4. **连接测试** —— 一条递进的检查链（git → 是否仓库 → 有无远端 → 平台 → 真的连一次）

然后就可以同步了：

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
- **改完图会自动同步**：「变动后自动同步」默认开着 —— 在受管文件夹里新增或改动图片之后，
  **停手 30 秒**（5–600 可调）就自动跑一轮。一次编辑会话（拖进一批图、批量压缩）会被
  合并成一轮，也不会在你还在写文件的时候开始。它只管**本机**的改动。
- 按周期同步默认关闭（「按周期同步」那一行有**独立的开关**；周期 5–1440 分钟，默认 30）。
  它管的是**其他设备**上的变化（另一台设备传的图、云端被手工改动的对象）—— 那些在
  本机不会产生任何事件，只能主动去问。注意它只关掉「按周期跑」—— 只要「自动同步图片」
  那个开关开着，**每次 Obsidian 启动仍会同步一轮**；要连启动那轮都不跑，就把
  「自动同步图片」关掉
- 想让工具条上的「复制云端链接」可用，还要填**公网访问地址**（自定义域名或 `r2.dev` 域名）

设置页「图片同步」那一页把**操作放在最前面**（打开图片管理 + 测试连接 / 预览变更 /
立即同步）—— 这几个是常用的，而配好之后下面那几节基本不会再翻。

**图片同步与笔记同步互不相干**：前者走 R2、后者走 git，各自有独立的开关与定时器。

### 设置页

| 标签 | 内容 |
| --- | --- |
| 插件与主题 | 已安装/添加的插件与主题列表。顶部是一排**没有卡片**的按钮：**添加插件仓库**、**添加主题仓库**、**绑定已有插件或主题**（带 `link` 图标）、**检查更新**（带 `refresh-cw` 图标）；每行有更新徽标、检查、更新、版本管理（回退，仅插件）、冻结、打开仓库、取消绑定（不删文件） |
| 插件安装器 | **SyncHub 自身**（版本状态小字 + 检查更新 / 更新按钮 + **启用 Gitee 镜像源**开关）、**进入设置页时自动检查**（开着时同时查跟踪列表与 SyncHub 自身）、**启动时检查更新** + 启动检查延迟、**自动发现 Gitee 镜像**。标签上有**数字徽标**：SyncHub 自身有可用更新时显示 |
| 仓库同步 | **初始化 git 仓库**（一行：状态徽标「已是 / 还不是 git 仓库」+ 按钮，已是时置灰）、**远端地址 + 打开仓库同步面板**（同一行：就地可改的地址输入框 + 打开面板按钮）、**git 可执行文件路径**（整行 + 「浏览…」，描述里跟着「留空用系统 PATH」与「SyncHub 不捆绑 git · 去官网下载」两句 + 可点链接）—— 这**三项排在「连接测试」之前**，因为它们是「测试能通过」的充要条件；再往下是连接测试、定时同步（周期 + 开关同一行 + 距下次同步的倒计时）、提交信息模板、整合策略、**`.gitignore` 编辑框**（可直接改，也能填默认内容或转到编辑器，另有**停止跟踪图片**、**补齐推荐的忽略规则** + **忽略插件目录**开关 + **停止跟踪本地状态文件**）、**大文件阈值**（默认 5 MB，填 0 关闭提交前的检查）、**清理**（体检 / 回收空间 / 丢弃备份并回收） |
| 图片同步 | **操作**（**打开图片管理** + 测试连接 / 预览变更 / 立即同步，排在最前面）、**自动同步图片**（开关）、**变动后自动同步**（延时 + 开关，默认开 / 30 秒）、**按周期同步**（周期 + 开关，只管其他设备上的变化）、需要图片同步的文件夹（整行的路径框，含「浏览…」/「恢复默认」）、R2 连接与密钥、冲突与删除策略、压缩默认值 |
| 通用 | 提示开关、调试日志、**状态栏同步条目贴靠最左侧**（默认开；关掉后条目按默认顺序排，不作特殊处理）、**功能区展示用户头像** + **使用 Gitee 头像**（用哪个平台的头像；那一行的描述里带「去换头像」的链接，跟着平台走）、**访问令牌**（GitHub / Gitee） |

**界面语言跟随 Obsidian**：插件不提供单独的界面语言设置项 —— 你在 Obsidian 里
用的语言是什么，插件就是什么（中文 / 英文两套文案对等）。

**功能区展示用户头像**（默认关）在左侧功能区（ribbon）**底部**挂一张圆形头像 ——
就是当前所配**令牌所属账号**的头像（由那个平台的 `validateToken()` 返回的 `avatar_url`，
与账号名同一次请求拿到，不额外多打一次接口）。它回答
「现在配的令牌是哪个账号」—— 镜像探测拿的也正是这个账号名。
**用哪个平台的头像由下面那一项「使用 Gitee 头像」决定**（默认开 = Gitee，关 = GitHub）。
那个平台没配令牌时它什么都不显示（匿名问那个接口只有 401，而匿名配额实测极低，
所以插件**不会**去发这个请求）。头像只能在平台那边换，所以那一行的描述末尾直接给了
**个人资料页的链接**（选 Gitee 是 `gitee.com/profile`、选 GitHub 是
`github.com/settings/profile`）—— 点一下就到换头像的地方，不用自己去翻设置。

**点头像可以打开设置窗口**，并直接停靠「通用」页（换平台、改令牌都在那一页）。
它外侧**常驻**一圈**虚影环**（柔灰、2px、紧贴头像边缘，中间没有缝）；**悬停时**
环会加深，并晕开一团**模糊扩散**（范围保守，不超出功能区），但**光标保持默认** ——
这张头像首先是一张头像，点击只是顺手的入口，不摆出按钮的样子。

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
- **Initialise the repository from the settings page** — the "Initialise git repository" row shares a
  card with the remote URL and the git path (all three are what a passing connection test depends on)
  and comes before the connection test, with a status badge ("already a repo" / "not a repo yet", the
  button greyed out when it is). The badge asks git **only once** and is then cached, so switching into
  the tab no longer makes it pop in and shove the description down
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
  not shrink; that needs a **deep clean** under Cleanup in the settings — a full history rewrite).
- **Keep large files out of git** — a runaway repository is almost never caused by notes: in one real
  vault, 159 commits produced a 460 MB `.git` — 319 MB of plugin build output, 186 MB of fonts,
  84 MB of vector-store caches, and only 63 MB of actual markdown. And **git history is irreversible**
  (cleaning up afterwards means rewriting every commit, which this plugin does not do), so both layers
  act *before* a file enters history:

  1. **Recommended ignore rules** — the "**Add missing recommended rules**" button in the settings page
     appends fonts (`ttf/ttc/otf/woff/woff2`), Office / LibreOffice temp files (`~$*`, `.~lock.*#`)
     and **local state files** (`workspace.json`, `workspace-mobile.json`, `workspaces.json`,
     `*-position-cache.json`) to `.gitignore`. **Only missing lines are added; rules you wrote
     yourself are left untouched** (idempotent, safe to click any time) — unlike the
     **overwriting** "fill in the default content" button. A separate "**Ignore plugin folder**"
     toggle (default **off**) can shrink the repository a lot, at the cost of plugins not coming along
     on a fresh clone — a trade-off left to you. Next to it is "**Stop tracking local state files**":
     ignore rules alone do **nothing for files git already tracks** (`.gitignore` only covers untracked
     ones), and a vault that has been syncing for a while is exactly the case that needs it — it
     removes the tracked ones from the index (**your local files stay put**) and adds the rules
- **Why local state files count as a category** — because a history rewrite costs **one unit per
  commit**, regardless of how many bytes each commit changed. Files like `workspace.json` change
  **every time you switch a tab**, so keeping them tracked hands every sync cycle a commit.
  That is a **separate axis** from large files: the large-file guard protects size, not this
  2. **Large-file guard before commit** — ignore rules only cover kinds you thought of; what actually
     bloats a repository is usually unexpected (a plugin's vector-store cache, a screen recording, a
     few-hundred-MB PDF). So on commit / sync now, pending files **over the large-file threshold**
     (default 5 MB, `0` disables) are stopped and a modal asks once, halting the chain — you will never
     see "sync complete" while a file was silently left out. The modal spells out the **cost of each
     choice**: **commit anyway** (every future change stores another full copy in history) or
     **untrack and ignore** (no version history, local files kept; **copies already in history stay**,
     so the repository does not shrink). Dismissing the modal cancels. **Scheduled sync never opens
     the modal** — it sends a notice instead
- **Cleanup** (the **Cleanup** section of the Vault sync settings tab) — what to do once the
  repository is already big. Three layers of increasing risk, each stating its cost up front:
  1. **Inspect** (read-only) — history grouped **by directory**, plus the largest single objects.
     By directory rather than by file, because **a directory is the unit you can act on**: every
     row in the report is exactly one thing you can remove. Files at the vault root are listed for
     accounting only and cannot be selected (removing them would wipe the whole vault)
  2. **Reclaim space** — `git gc --prune=now`. Safe, but it **often reclaims nothing**: large files
     usually sit in reachable history, and only a rewrite can remove those
  3. **Deep clean** (**irreversible**) — removes the selected paths from **all of history**
     (rewriting every commit). Three consequences are spelled out before you start: **every commit
     hash changes** (the remote needs a force push, other devices must clone again), **old history
     already pushed to the remote cannot be removed here**, and the **estimated duration** (based on
     commit count; measured at ~3.5 s per commit, so a 159-commit vault takes ~10 minutes — do not
     close Obsidian while it runs). A **backup ref is created first**, so a failure or a change of
     mind is recoverable; afterwards the paths are **written into `.gitignore` automatically**,
     otherwise they would come straight back on the next commit
  4. **Discard backups and reclaim** — right after a rewrite the space does **not** shrink yet
     (the backup still holds the old objects — deliberately, so you can confirm the vault works
     before giving up your way back). Run this once you are happy and the space is actually freed.
     **Irreversible**
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
  carries **two notes** at the top of the "Vault sync" page (reset suspends scheduled sync; the risk of
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
  (click a file name to open the note, **view diff**, open the file on the
  remote, **discard changes** — put that file back to the last commit; there is **no**
  stage toggle, see below) and the last 10 commits (click a hash to view that commit on the remote, or the diff icon
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
  ordered **first in the status bar** on purpose, and **clickable** (opens the repository
  sync view). It only changes its own visual order (CSS `order`) — **no one else's items
  move**, and the status bar itself stays exactly as Obsidian lays it out (bottom-right cluster).
  Don't want it first? Turn off **Keep the sync item at the left of the status bar** in the
  General tab (on by default) — the item then falls back to the default order
- **Syncing is visible** — while an action runs, that status-bar cell gets a **spinning ring** and its
  text turns to the accent colour, and the wording becomes **"Syncing: committing…"** (so clicking
  "Sync now" reads as one step of a three-step chain, with pull and push still to come; the hover
  tooltip changes too). The repository sync panel adds a **syncing banner right under the toolbar**
  (spinner + three stages + an **indeterminate** bar — git never reports "object 40 of 90", so an
  invented percentage would be a lie, while the three stages are real). While an action runs the four
  action buttons are disabled (**Refresh is not** — it only reads)
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

- **When it syncs: four triggers, each with its own job.**

  | Trigger | Covers | Default |
  | --- | --- | --- |
  | **Sync after changes** | **local** edits → the cloud (a round runs 30 s after you stop, 5–600) | **on** |
  | **Periodic sync** | changes made on **other devices** → this machine (5–1440 min) | off, 30 min |
  | Editor save | a single image that needs an immediate result | always |
  | One round after startup | catches "window closed during the quiet period" | always |

  **Why the periodic round cannot be replaced by change-triggered sync**: events only see **local**
  edits — an image uploaded by another device, or an object you deleted in the R2 console, produces
  nothing here → no event → the timer is never even started. The periodic round is the **only** thing
  that sees those.
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
- **Plugins and themes are two entries** — "Add plugin repository" and "Add theme repository"
  (buttons at the top of the Plugins & themes tab, plus one command each). A theme is written under
  `themes/` and tracked, and **SyncHub never switches your theme** — pick it in Settings → Appearance →
  Themes. If you fill a theme address into the plugin entry (or the other way round), the failure
  probes for the other kind's marker file (`main.js` / `theme.css`) and offers a **"Switch to theme
  install"** button instead of leaving you with a bare "missing main.js"
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
- **Self-update** — check and apply new versions of SyncHub itself (restart required). The source is a
  **toggle**: "Enable Gitee mirror source" (on by default) checks and downloads from the Gitee mirror
  (`sofqi/SyncHub`), off goes to the official GitHub repository. Either way a failure falls back to the
  official repo once and says so. SyncHub itself also joins the **on-opening-settings** check, and the
  Plugins & themes tab carries a **numeric badge** when an update is available

#### 🔐 Platform and UX

- **One platform layer** — every GitHub/Gitee difference (auth style, release ordering, raw channel,
  rate limits) is implemented once
- **Ribbon account avatar** (off by default) — a round avatar of the **account behind the current
  token** at the **bottom of the left ribbon**, with the platform chosen by "Use Gitee avatar". The
  address comes back from the **same** `validateToken()` call as the account name, and **not a single
  request is sent** when that platform has no token; the description carries a **link to the profile
  page** to change it (and follows the platform). **Clicking it opens the settings window on the
  General tab** (that is where you switch platform and edit tokens); a **soft grey halo ring is always
  there**, deepening on hover into a **conservative blurred bloom** — while the **cursor stays default**
- **Keep the sync item at the left of the status bar** (on by default) — the sync item is ordered
  **first in the status bar** (only its own visual order changes; no other item moves). Turn it off
  and the item falls back to Obsidian's default order. The status bar itself is never touched
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
**SyncHub: Bind plugins and themes already installed in this vault** (or "**Bind existing plugins or
themes**" at the top of the Plugins & themes tab) scans the plugin and theme folders, resolves their
source repositories from the manifest `id`, and tracks them all at once.

To switch a version later (for example rolling back after a bad update), click **Version manager**
on that row under "Plugins & themes" and pick a release — an older one is a rollback, while "Latest
release" resumes following the newest.

#### Installing themes

1. Command palette → **SyncHub: Add theme repository** (or "Add theme repository" at the top of the
   Plugins & themes tab)
2. Enter an `owner/repo` shorthand or paste a full URL (the repository needs a `manifest.json` and a
   `theme.css`)
3. Click "Resolve" → install

The theme is written into a **folder named after the theme** under `{configDir}/themes/` (the same
place the official theme store uses) and joins the tracked list, so the usual check / update path
applies. **SyncHub never switches your theme** — after installing, pick it in Settings → Appearance →
Themes (uninstalling the plugin does not touch your theme choice either).

> Filling a theme address into "Add plugin repository" makes the failure name the real problem
> ("this repository holds a theme: it has a `theme.css` and no `main.js`") and offers a **Switch to
> theme install** button, so you do not have to go back and paste it again. The reverse direction has
> the matching button.

> A target folder that already holds **another** theme is refused (two different themes can share a
> name). The reason: the one being overwritten is quite possibly the theme you are using right now,
> and it may not be in the tracked list, so there is no "download it again" path. To track an
> already-installed theme, use "Bind existing plugins or themes".

> Every command starts with `SyncHub:` in the palette, so searching the plugin name finds them all.

#### Syncing the vault

**All the basic setup lives on the "Vault sync" settings tab**, in top-to-bottom order (the page is
laid out exactly that way):

1. **Initialise the git repository** — click it while the vault is not a repository yet (the badge on
   the right tells you which it is). A default `.gitignore` is created along the way (an existing one
   is never overwritten). The command palette and the sidebar panel have the same entry point, backed
   by the same implementation
2. **Remote URL** — enter the repository address (editable in place; command **SyncHub: Edit remote
   address**)
3. **Git executable path** — only needed when git is not on PATH
4. **Connection test** — a step-by-step chain (git → repo → remote → platform → a real connection)

Then you can sync:

- **SyncHub: Sync now** — commit → pull → push in one chain (the view's toolbar has it too)
- "Commit" and "Push" are **two separate actions**: commit writes to the local repository only,
  push sends **committed** content only. Use "Sync now" to do both
- No commit message to type: it comes from the template in the settings
- You can also work per file in the repository sync view (open a file, **view
  diff**, view history), or click the status-bar item to open it
- **"Discard changes"** — the undo arrow on each row: puts that file back to how it was at the
  **last commit**. Two situations share one action, because git sees them as the same thing:
  **you broke something and want it back**, and **you deleted a file by accident** (a deleted file
  is written back out from the last commit). It is the only action in this plugin that **loses your
  edits**, and it **cannot be undone** — the discarded edits were never committed, are not in git,
  and `git fsck` will not find them. So the confirmation modal lists the exact files, says so in the
  body, and the confirm button is styled as a warning. Two kinds of row **do not** get the button:
  **untracked new files** (there is no previous commit to go back to, and "discard" for them would
  mean deleting a brand-new file — nothing to fall back on) and **conflicted rows** (the conflict
  area already has "Abort this merge").
- **Why there is no per-file staging** (removed 2026-10-10) — the panel used to offer
  "Stage this file / Unstage" and "Stage all / Unstage all", but they **could not do what they
  looked like they did**: SyncHub's commit is `git add -A`, so **what you staged manually has no
  effect on what gets committed**; and worse, **a scheduled sync will commit them anyway** — the
  button **could not even postpone a commit**. You stage A hoping to commit only A, and B goes in
  with it. **SyncHub does not do selective commits**: its job is to get the whole vault up.
  (The staged / changes **grouping** stays — a conflicted file shows up in both in `git status`
  and lands in the staged group after de-duplication.)
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
- **Edits sync themselves**: "Sync after changes" is **on by default** — after you add or modify an
  image in a managed folder, a round runs once you have stopped for **30 s** (5–600 adjustable). A
  whole editing session (dragging in a batch of images, batch compression) is merged into one round,
  and it never starts while you are still writing a file. It only covers **local** edits.
- Periodic sync is off by default (the "Periodic sync" row has its **own toggle**; the interval is
  5–1440 minutes, default 30). It covers changes made on **other devices** (an image another device
  uploaded, an object edited by hand in the bucket) — those produce no event here, so they can only be
  asked for. Note that it only switches off the periodic run — as long as the "Automatic image sync"
  switch is on, **every Obsidian startup still syncs once**; turn that switch off to stop the startup
  round too
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
| Plugins & themes | The installed/added list. On top, a row of **card-less** buttons: **Add plugin repository**, **Add theme repository**, **Bind existing plugins or themes** (with a `link` icon), **Check for updates** (with a `refresh-cw` icon); each row has an update badge, check, update, version manager (rollback, plugins only), freeze, open repo, unbind (keeps files) |
| Plugin installer | **SyncHub itself** (a version status line + check / update buttons + an **Enable Gitee mirror source** toggle), **check when opening settings** (checks both the tracked list and SyncHub itself), **check on startup** + startup delay, **auto-discover Gitee mirrors**. The tab carries a **numeric badge** when SyncHub itself has an update |
| Vault sync | **Initialise git repository** (one row: a "already a repo" / "not a repo yet" badge + a button, greyed out when it is), **remote URL + Open repository sync panel** (one row: an address input you can edit in place, plus the panel button), **git executable path** (full-width + "Browse…", with "empty means the system PATH" and "SyncHub does not bundle git — download it here" in one description plus a clickable link) — **these three come before the connection test**, because they are what a successful test depends on; then the connection test, scheduled sync (interval + toggle in one row, plus a countdown to the next sync), commit message template, strategy, **`.gitignore` editor** (edit in place, fill in defaults, or open it in the editor, plus **Stop tracking images**, **Add missing recommended rules** + an **Ignore plugin folder** toggle + **Stop tracking local state files**), **large-file threshold** (5 MB by default, `0` turns the pre-commit check off), **cleanup** (inspect / reclaim space / discard backups and reclaim) |
| Image sync | **Actions first** (**Open image manager** plus test connection / preview changes / sync now), **automatic image sync** (toggle), **sync after changes** (delay + toggle, on by default / 30 s), **periodic sync** (interval + toggle, covers other devices only), folders to sync (a full-width path box with "Browse…" / "Restore default"), R2 connection and secret, conflict and deletion policy, compression defaults |
| General | notices, debug logging, **keep the sync item at the left of the status bar** (on by default; off = default order, no special treatment), **ribbon account avatar** + **Use Gitee avatar** (which platform's avatar; the description carries a "change your avatar" link that follows the platform), **access tokens** (GitHub / Gitee) |

The interface language follows Obsidian — there is no separate language setting in the plugin.

**Ribbon account avatar** (off by default) puts a round avatar at the **bottom of the left ribbon** —
that of the account **the configured token belongs to** (the `avatar_url` returned by that platform's
`validateToken()`, fetched in the same request as the account name, so no extra API call). Its job is to
answer "which account is this token for" — the same account name mirror
discovery uses. **Which platform's avatar is used is decided by "Use Gitee avatar" below it** (on by
default = Gitee, off = GitHub). When that platform has no token it shows nothing (an anonymous call to
that endpoint is a 401, and the anonymous quota is measured to be very low, so the plugin **does not**
make the request). An avatar can only be changed on the platform itself, so the description ends with a
**link to the profile page** (Gitee → `gitee.com/profile`, GitHub → `github.com/settings/profile`) —
one click takes you where you change it.

**Clicking the avatar opens the settings window**, parked on the **General** tab (that is where you
switch platform and edit tokens). A **soft grey halo ring** is **always there**, right against the
avatar's edge (2px, no gap in between); **on hover** the ring deepens and a **blurred bloom** joins it
(kept conservative — it never spills out of the ribbon), while the **cursor stays default** — the
avatar is an avatar first; clicking it is just a handy entrance, so it is deliberately not dressed up
as a button.

**Tokens are stored locally only** (Obsidian's secret storage, falling back to localStorage for older
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
