# SyncHub 项目长期约定

> 2026-10-22 精简。只留「下次还会踩」的规则；过程与代码位置看
> `.workbuddy-ai/memory/YYYY-MM-DD.md` 与 `docs/`。
> **本文件有注入上限（约 14KB，超了会被截断），别往里堆。**

## 项目定位

单个 Obsidian 插件，共用一层平台抽象：`features/installer`（复刻 BRAT）、`features/sync`
（复刻 obsidian-git）、`features/images`（图片同步到 R2）、`host/`（GitHub / Gitee 适配）。
参考源码 `F:\_Workspace\GitHub-Project\`，**只读**。

**名字三层**：显示名 `SyncHub`（**不得含 Obsidian 缩写片段**，`OBS` 就被拒）；插件 id
`ob-sync`（**别动**，事实来源是 `selfUpdate.ts` 的 `SELF_PLUGIN_ID`）；内部前缀 `obsync-`
（**一律不动**，改了作废令牌与面板状态）。

## 命令与部署

`pnpm dev / check / build / test / test:live / verify:mobile / verify:head`。

**改完代码必须部署到两个库**：`pnpm build:both` → `F:/_Workspace/Plugin-Test` 与
`D:/_Workspace/learning-records`（**用户在这里看效果**）。只改文档不部署。

> **只用 `pnpm build` 是坑**：它只部署 Plugin-Test，learning-records 停在旧版，症状是
> 「新功能全无效、旧功能正常」，**极易误判成代码 bug**。热重载也不同：Plugin-Test 自动
> 加载，learning-records **没启** —— 那边要提醒用户手动 `Ctrl+R`。

**核实产物**：esbuild 把中文转义成 `\uXXXX`，`grep "仓库同步"` 匹配不到（像没部署），要查
`\u4ED3\u5E93\u540C\u6B65`。产物与源码对 **SHA256**，mtime 会骗人。

## 约定

### i18n

`locales/zh-cn.ts` 是**规范源**，`LocaleStrings` 由它推导；其他语言 `satisfies` 它，漏译在
typecheck 报错。**不要加 `as const`**。新增语言：建 `locales/xx.ts` → `LOCALES` →
`LANGUAGE_OPTIONS`。**文案别用 Markdown**（`**加粗**`）：界面是纯文本，`pnpm check` 会拦。
### 错误与文案的归属

**逻辑层抛「类型码 + 参数」，展示层拼人话。** 逻辑层拿不到 `t`，`message` 只放英文进日志；
`createXxxModule()` 里 `notifier.registerErrorTranslator(...)`，按类型码取文案。可辨识联合 +
穷尽 `switch`；`Notifier` 用**注册制**（`core/` 不该知道 `features/`）。
**断言错误类型码，不要断言消息文本**。**错误类型用错比没有更糟**：曾把「没有上游分支」
「游离 HEAD」都抛成 `GitNotRepoError`，提示变成「请先初始化仓库」，把用户指错方向。

### 长任务的可见性

**可能跑几分钟的动作必须走 `withActivity`**，否则用户把入口弹窗一关，屏幕上毫无痕迹：状态栏
一格 + 面板横幅（`activityText` / `busyTitle` / `busyHint`，三者都是**穷尽 switch**），且
**关掉入口 ≠ 结果可以丢**（跑完把结果页弹回来：`closed` 标记 + `open()`）。进度只报**已用 +
估算**，不报百分比。**弹窗渲染要 try/catch**（白框与「正在加载」一样）。

**插件自己造出来的状态必须留一个「持久」出口**：重写历史后本地与远端必然没有共同提交，
出路只有一次**强制推送** —— 它原来只在结果页上，关窗就再也找不到（用户报的
`refusing to merge unrelated histories` 就是这么来的）。现在在**设置页「清理」**，可用性由
`refs/obsync-backup/*` 决定（**信号存在 git 里**，不依赖插件数据）。任何「只在瞬时弹窗里
可做」的必要动作，都要问「关掉之后他还能找到吗」。

**深度清理四步**：体检 → 重写 → **强制推送** → **丢弃备份**。**空间到第四步才释放**，
所以「收尾」必须是能被找到、能续做的入口（设置页第一行「继续上次的清理」）。细则见
`docs/conventions-detail.md`。

### 清理：剔掉 = 以后不再同步

清历史后写进 `.gitignore` 的目录**以后不再跟着 git 走**（刻意如此：不写的话下次
`git add -A` 原样加回来），所以 **`.gitignore` 必须同步**。这是最要紧的后果，必须在**动手
之前**说：报告页报「N 篇笔记」（`HistoryDirectory.notes`，按**路径去重**、只认 `.md` /
`.canvas`）+ 确认页 `warningSync` / `warningNotes`。**笔记目录被剔 = 那些笔记以后不再同步**。

### 图片同步（`features/images`）

细则见 `docs/conventions-detail.md` 第 5 节。四条硬规则：

1. **`run()` 只复制，从不删除**；**不要再把删除加回 `decide()`**（「一边少了 = 用户删的」
   做不准）。
2. **选「保留云端」必须记墓碑**（`SyncedEntry.remoteOnly`），**「没点按钮直接关窗」也按保留
   处理**；墓碑在 `noteDeleted` 里**早于询问**就记。
3. **`folders` 管哪些、`prefix` 管放哪儿**；`folders` 默认 `["."]`（= 整个库），`""` 是归一
   后的规范形状（**`normalizeFolders` 必须保留**），空行只在 `parseFolders` 丢；**坏形状退
   空数组、不拿默认值兜底**（只有「缺失」才拿），判据在 `normalizeSettings` 读**磁盘原文**。
4. **删除两条路别混**：`noteDeleted`（攒批 + 询问）vs `deleteImages`（**删完绝不能再问**，
   `panelDeleted` 每批 `clear()`）；顺序**先云端后本地**，边界检查在**列举云端之前**。

`delete` 事件挂在 `main.ts` 的 `vault.on("delete")`（图片模块不依赖 `Plugin`，要能在移动端
加载）。`syncState.ts` **不再是删除的安全边界**。面板上本地 / 云端 / 已链接是**三条独立的
轴，不是三个桶**。**Excalidraw 的引用必须解压场景才扫得到**，⚠ 载荷折行（每 256 字符），
解压前必须剥空白，否则返回 `null` **且不报错**。R2 的 `sha256.ts` / `sigv4.ts` 手写，
**不用 `crypto.subtle`**；正确性靠 **AWS 官方向量**校准。

### 自查脚本（`scripts/checks.mjs`）

八项全只读（minAppVersion / 硬编码中文 / 未使用 i18n 键 / CSS 类覆盖 / 移动端安全 / 设置项
无人读取 / locale 加粗 / CSS 注释完整性）。加豁免**必须写清为什么安全**；删 `t.x.y` 用法时
顺手删键；CSS 检查扫**所有** `obsync-*` 字符串，存储键要进 `NOT_A_CLASS`。

### 测试

`tests/live/**` 默认排除（`OBSYNC_LIVE=1` 开启）；**`testTimeout` 30 秒**；
`simpleGitManager.test.ts` 单跑约 150 秒。`obsidian` alias 到 `tests/stubs/obsidian.ts`，
**stub 辅助函数必须用相对路径 import**，`openedModals` 记录弹窗实例。
其余全是踩过的坑（惰性 `json`、404 路由、`.env` 与 `GIT_PAGER`、删文件要真的删），
见 `docs/conventions-detail.md` 第 3 节 —— **写新测试前读一遍**。

### 网络可达性（两处降级必须保留）

**GitHub 三条通道互不相关**：`api.github.com` 稳、`raw.githubusercontent.com` 稳、
`releases/download/` → `objects.githubusercontent.com` **3 次里 2 次 21 秒超时 0 字节**。
所以 `loadReleaseFile` 资产失败时回退源码、`GitHubHost.readFile` raw 不可达时回退 contents
API。**Gitee 匿名 API 配额极低**（连续请求直接 403）→ live 测试里 Gitee API 用例**跳过**。

### git 错误文案

**靠 git 错误文案分支判断时，正则必须用真实输出校准。** `git restore --staged` 在 HEAD 未
出生时报 `fatal: could not resolve 'HEAD'` —— **HEAD 带单引号**（`HEAD_UNBORN_RE`）。

### 重写历史（`filter-branch`）四条实测

全在 `simpleGitManager.rewriteHistory`，**别凭直觉改**（细节见 `docs/conventions-detail.md`）：

1. **它最后会改工作区**：**被剔除的路径会从磁盘删掉** → 之后必须
   `git restore --source=<备份引用> --worktree -- <路径>` 放回来（**必须 `--worktree`**，
   `git checkout <ref> -- <path>` 会把文件加进索引）；**逐个路径恢复**。
2. **报错 ≠ 什么都没发生**：判据是**引用动没动**（`head === previousHead`），不是退出码 ——
   否则会漏写忽略规则与结果页，而哈希全变、远端分叉已经发生。
3. **见到 `refs/original/` 就拒绝开始** → 必须 `--force`，否则**第二次深度清理必然失败**。
   覆盖安全：退路是 `refs/obsync-backup/<时间戳>`。
4. **`--prune-empty` 可能把分支整个删掉** → 检测到就 `update-ref` 接回去再抛错。

⚠ 本机 `filter-branch` 一次约 **28 秒** —— 真仓库测试要**显式超时**。

### git diff 输出

`diffFile` 的三个选项各防一种真实环境，**都别删**：`-c core.quotePath=false`（否则中文路径被
转义成八进制）、`--no-color`（用户可能配了 `color.ui=always`）、`--no-ext-diff`（外部 diff
工具输出的**不是** unified diff）。`commitPatch` 的 `-m --first-parent` 是为合并提交。

### host 层设计原则

- **`formatRepoId(ref)` 只给 `owner/repo`，不带 host**。跨 host 传递必须把 host 单独带上
  （`{ defaultHost: ref.host }`），否则 gitee 坐标被按默认 `"github"` 重新解析，**悄悄指向
  另一个仓库**而界面毫无异常。
- **`owner/repo` 简写不含平台**：界面默认 `defaultHost: "auto"`（按 `SUPPORTED_HOSTS` 探
  `manifest.json`，命中即止），地址里写明平台时**以地址为准、不探测**。服务层默认值仍是
  `"github"` —— 改它会让既有调用点突然多打网络请求。
- 平台差异**只允许出现在 `host/` 内部**；上层不得出现 `if (host === "gitee")`。能用属性说清
  的（`tokenInQuery`、`gitAuthUsername`）就做属性，需要行为差异的做方法（`applyAuth`）。
- **`gitAuthUsername`**：Gitee → `oauth2`、GitHub → `x-access-token`。**不要退回硬编码
  `git`** —— Gitee 填 `git` 被直接拒绝，而**公开仓库照常能读**，只有私有仓库 push/pull
  失败，极易误判成令牌问题。
- 其余差异见 `docs/reference-analysis.md`。**涉及「对端校验规则」的假设要么实测，要么标注
  未验证。**

### 凭据不能从消息 / 日志漏出去

- **写进错误消息或日志的 URL 都要过 `host/redact.ts` 的 `redactUrl()`** —— `Notifier` 会把
  `NetworkError.message` 原样弹屏幕上、`logger` 又写进控制台。**回显用户输入的错误也要
  脱敏**。漏脱与**过脱**都要测，还要有「**脱敏不能影响实际请求**」的守卫。
- **别用 `new URL()` → `toString()` 脱敏**：会规范化 URL（日志里的地址与实际发出的不是
  同一个），畸形输入上还会抛错。定点正则替换即可。`https://TOKEN@github.com` 是**真实
  用法**，要脱；SSH 的 `git@` 是登录名，不用脱。
- **`git remote -v` 会显示明文** —— 这正是 `auth.ts` 用 `http.extraheader` 的理由，
  **别改回把令牌写进 remote URL**。

### 配置项的互斥与限制（「假防护」）

- **UI 上灰掉一个开关 ≠ 拦住行为**：库里已存着「开关开着 + 危险组合」的用户不会去动设置页。
  **限制要在「读设置的那一层」也实现一份**（先例：`Automatics.start()`）。
- **灰开关时不要改写它的值**（`setDisabled` 而非 `setValue(false)`）。**改「决定其它控件
  可用性」的设置项后，`commit()` 要传 `redraw=true`**。
- **注意事项放在被违反的那一页的标题正下方**，样式用 `.obsync-sync-notes` /
  `.obsync-image-notes`（正文**别**用 `--text-muted`）。### 代码风格

注释用中文、写**为什么**；敏感项（令牌、R2 secret）**绝不进 `data.json`**，走
`core/secretStore`；**静态样式放 CSS 类**（`no-static-styles-assignment` 只拦字面量）。

### 工具坑

- **`pnpm test` 全绿 ≠ 能编译**：vitest 不做类型检查。改完**单独跑 `tsc --noEmit`**。
- **`pnpm <script>` 跑前查依赖状态**，不一致就想清空 `node_modules` 重装，非 TTY 直接中止。
  绕法：`pnpm --config.verify-deps-before-run=false run <script>`。
- **`locales/*.ts` 是 CRLF**：node 脚本多行替换要先 `.replace(/\r?\n/g, "\r\n")`，否则
  `includes` 恒假 —— 而**单行替换却成功**，症状像「脚本跑了一半」。
- **`/tmp/xxx.mjs` 在 Windows 上被解析成 `F:\tmp\xxx.mjs`**：临时脚本写到工作区内。- **Obsidian 大版本会改核心 DOM 类名**（1.14 把 `mod-left` 改成 `mod-primary`），只认旧名字
  的症状是「功能**静默消失**」。**别把版本修饰类写进选择器**；升级后重抠 `.probe` 的
  `app.css` 并重跑探针。
- **simple-git 的 `raw()` 对「非零退出 + 没输出」照样 resolve**：`git merge-base` 无共同祖先
  时 exit 1 且不打印，`raw()` resolve 空串 —— 「靠 catch 判 false」**永远返回 true**。
  **判据一律读输出**（`out.trim().length > 0`）。探针：`.probe/mergebase-check.mjs`。
- **`.probe/settings-preview` 的替身缺方法时预览页只画一半**：渲染链中途 `TypeError`，后面的
  DOM 全没有，截图看着像「样式没生效」（2026-10-22 撞的是 `DropdownComponent.setDisabled`）。
  也**不能靠派发 `input` 事件模拟打字**（替身的 `TextComponent.onChange` 只记回调）。
- **`Setting.setClass()` 一次只能一个类名**（替身会抛），两个类调两次。

### 提交与发版

- **提交后要验的是 HEAD，不是工作区**：用 **`pnpm verify:head`**（已挂 `pre-push`）。
  别手写 `git stash && pnpm test && git stash pop`。
- **一次改动横跨多文件（代码 + 测试 + i18n + CSS）最容易漏 `git add`**，症状恰好是「本地
  一切正常」。提交前对着 `git status` 核一遍。
- commit message：**中文、带用户原话、写清「为什么」与「代价」**，一条只讲一件事。
- 发版见 `docs/RELEASE.md`。两条最容易错：**先推分支、再建 release**；**校验资产不要下载**
  （`github.com:443` 时段性阻断），用 `gh api repos/.../releases/tags/X --jq '.assets[] |
  "\(.name) \(.size) \(.digest)"'` 与本地 `sha256sum` 比对。Gitee 镜像**只同步代码与标签，
  不同步 release**。
