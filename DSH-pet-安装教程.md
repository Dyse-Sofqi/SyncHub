# DSH 桌宠插件 dsh-pet 安装教程（Windows · 手把手）

> 目标读者：没部署过插件、只想让桌宠跑起来的人。本文所有命令都可以**原样复制**到 PowerShell 里回车执行。
>
> 读完你会得到：一只住在 DSH 界面右上角的蓝色大鱼（会呼吸、会溜达、能拖拽抛掷、能右键点播动画），以及在需要时能把它**干净卸载**的方法。

**本文标记约定**

| 标记 | 含义 |
| --- | --- |
| ✅ 实测 | 我在本机（这台电脑）实际跑过并看到了结果 |
| 📖 文档 | 来自插件自带 README 或 DSH 自带说明，未在本机逐条复跑 |
| 🟡 待验证 | 合理推断或依赖你的操作环境，本文如实标注，不冒充已验证 |

**本机环境速查（✅ 实测）**

| 项目 | 值 |
| --- | --- |
| Node.js | `v24.20.0` |
| npm | `11.19.0` |
| pnpm（全局） | `11.21.0`（DSH 自带运行时的 pnpm 是 `11.7.0`） |
| DSH 启动器 | `F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` |
| dsh 版本 | `0.2.0-rc.2`（插件要求正好是它） |
| `dsh` 是否在 PATH | **否**（直接敲 `dsh` 会报"无法将"dsh"项识别为 cmdlet…"） |
| DSH 主目录 `$DSH_HOME` | `C:\Users\Administrator\.dsh` |
| 运行中的 GUI 用的档 | `desktop`（`DSH_PROFILE=desktop`） |
| 插件源码 | `F:\_Workspace\GitHub-Project\dsh-pet\dsh-pet`（包名 `dsh-pet`，版本 `0.3.1`） |
| npm 镜像 | `https://registry.npmmirror.com/`（国内镜像） |

> ⚠️ 本教程装的是 **PC2005-cloud 的 `dsh-pet`**。你的 `desktop` 档里还装着另一个**同名但不同作者**的插件 `@linxin666/dsh-pet`（配置项 `enabled: false`，当前是关闭的）✅ 实测。两者互不干扰，但**认包名**不要认文件名。

---

## 一、先看懂 3 个概念（1 分钟）

不理解这 3 个词，出错时你会不知道怎么查；理解了，整件事就是"构建一次 + 装一次 + 刷新页面"。

| 概念 | 一句话解释 | 为什么你必须在乎 |
| --- | --- | --- |
| **profile（配置档）** | 一个档 = `$DSH_HOME\profiles\<名字>` 一个目录。目录里有 `package.json`（其中 `dsh.profile.bundles` 是**层栈顺序表**）、`cordis.patch.yml`（你自己的覆盖层）、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`node_modules\` | 装插件 = 往**某一个档**里装。装错档（比如装到 `web` 而 GUI 用 `desktop`）等于没装。你的 GUI 用 **desktop** 档 |
| **bundle / patch（插件层）** | 包在自己的 `package.json` 里写 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，它就是 bundle。它的 patch 文件里用 `insert` 往配置树加插件行 | dsh-pet 的 patch 只有一行：`insert: [{ id: pet, name: 'dsh-pet' }]`。DSH 启动时按 `dsh.profile.bundles` 的顺序把各 bundle 的 patch 叠成一棵配置树，最后叠你自己的 `cordis.patch.yml` |
| **build（构建）** | 把 TypeScript 源码 `src/` 编译成运行产物 `lib/` | `lib/` **不入 git**，clone 下来是没有的。DSH 加载的是 `lib/index.js`，不构建就一定报"找不到模块" |

**`dsh plugin --profile desktop add ...` 到底做了什么？**（✅ 已在本机实测确认；机制来自 DSH 内置文档与启动器源码）

1. 它把参数**转发给 pnpm**，并且是在 `$DSH_HOME\profiles\desktop` 目录里执行 —— 所以效果等于"进 profile 目录跑一次 `pnpm add`"（本机实测：实际用的是 DSH 自带运行时的 `pnpm v11.7.0`）；
2. pnpm 把包裹进 `profiles\desktop\node_modules\`，并写上 profile 的 `package.json` / `pnpm-lock.yaml`；
3. DSH 随后会**对账**：新装上的依赖里，凡是声明了 `dsh.bundle` 的，自动追加进 `dsh.profile.bundles`，它的 patch 层就生效了；没声明 `dsh.bundle` 的包会打印警告 *"declares no dsh.bundle — installed as a plain dependency, not a profile layer"*（装了，但不进层栈）。
   dsh-pet 声明了 `dsh.bundle.patch`，所以装完**自动进层栈**（✅ 实测：`bundles` 末尾自动多出 `"dsh-pet"`），不用你手改配置。

---

## 二、步骤 0：前置检查

打开 **PowerShell**（Win + X → "终端"，或 Win + R 输入 `powershell`）。

```powershell
node -v
npm -v
```

- 期望：`v24.20.0` / `11.19.0`（✅ 实测）。Node 只要 ≥ 20 就够。
- 报"无法识别 node"：先去 <https://nodejs.org> 装 LTS 版，装完**重开终端**。

接下来是最容易踩的坑：`dsh` 命令**不在这台机器的 PATH 里**（✅ 实测）。你直接敲 `dsh --version` 会得到：

```
dsh : 无法将“dsh”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

这不是坏了 —— 因为这是 **Electron 桌面版**安装，启动器藏在程序目录里，没有注册到系统 PATH。**两个办法任选**：

**办法 A（推荐，零风险）：本次会话里定义一个变量，后面所有命令都用它**

```powershell
$Dsh = "F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $Dsh --version
```

期望输出：`0.2.0-rc.2`（✅ 实测）。**每个新开的 PowerShell 窗口都要先跑这两行**，变量不会跨窗口保留。

**办法 B（一劳永逸）：把启动器目录加进用户 PATH**

```powershell
$binDir = "F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
    "已写入用户 PATH"
} else { "用户 PATH 里已经有了" }
```

**执行完必须重开终端**，然后直接 `dsh --version` 就能用（🟡 待验证：我未改本机 PATH 去实测这一步）。之后本文出现的 `& $Dsh` 都可换成 `dsh`。

> 顺带确认档名：GUI 现在跑的是 `desktop` 档（`DSH_PROFILE=desktop`）。所以下面一律用 `--profile desktop`，**不要**照抄插件 README 里的 `--profile web`（README 假设你用命令行 `dsh web` 起网页版）。

---

## 三、步骤 1：构建插件（第一次装必须做）

```powershell
cd "F:\_Workspace\GitHub-Project\dsh-pet\dsh-pet"
npm install --no-audit --no-fund    # 装依赖；结束时会自动跑 prepare 完成构建
npm run prepare                     # 可选：手动再确认/重跑一次完整构建（幂等）
```

**这两条各干了什么**

| 命令 | 作用 |
| --- | --- |
| `cd ...\dsh-pet\dsh-pet` | 进到**插件包根目录**（不是仓库根 `F:\_Workspace\GitHub-Project\dsh-pet`，那里是"三件套"仓库根，含 `prompts/`、`scripts/`；`package.json` 在下一层的 `dsh-pet\` 里） |
| `npm install` | 装依赖。注意：本包的 `prepare` 是 npm 生命周期钩子，`npm install` 结束时会**自动**跑一次构建，所以这一步通常就已经把 `lib/` 建好了 |
| `npm run prepare` | 手动再跑一次完整构建（**幂等**，跑几次结果一样）。它依次做 3 件事：① `tsdown` 把 `src/` → `lib/`；② 构建**桌面共享核心**（`src/shared` → `runtime/electron-helper/shared-core.js`，桌面小窗和网页端共用同一份纯逻辑）；③ 生成类型声明 `lib/types/*.d.ts`，并把 `package.json` 的 `files` 收敛成发布清单 |

> 💡 只跑裸 `tsdown` 是不够的 —— 会缺桌面运行时和类型声明。**认准 `npm run prepare`**。（📖 README + 我读了 `scripts/prepare.js` 确认）

**怎么知道成功了**（✅ 实测：本机构建后这四个文件均已生成）

```powershell
Test-Path .\lib\index.js                          # 期望 True  ← 宿主半侧入口
Test-Path .\lib\client.js                         # 期望 True  ← 浏览器半侧入口
Test-Path .\lib\types\index.d.ts                   # 期望 True
Test-Path .\runtime\electron-helper\shared-core.js # 期望 True  ← 桌面模式共享核心
```

`npm run prepare` 的最后几行应包含：

```
[prepare] ✓ package.json files=[lib, src, assets/webm, runtime/electron-helper, ...]
[prepare] ready to publish: npm publish --tag latest
```

看到 `✓` 就是构建完成。

**常见卡点**

- `npm install` 报网络超时 → 换国内镜像后重试：
  ```powershell
  npm config set registry https://registry.npmmirror.com
  npm install
  ```
  （本机 npm 镜像已指向 npmmirror；这条是给别的机器/换网络时备用的）
- 报 `EBADENGINE` / Node 版本过低 → `node -v` 必须 ≥ 20。
- 构建报很多 `TS` 类型错误 → 先确认你 `cd` 对了目录（该目录下应能看到 `package.json`、`src\`、`scripts\prepare.js`）。

---

## 四、步骤 2：安装到 desktop 档

**先备份**（30 秒，出事能 1 分钟回滚）✅ 实测这两个文件确实存在、且是安装时唯一会被改动的档案：

```powershell
$Prof = "C:\Users\Administrator\.dsh\profiles\desktop"
Copy-Item "$Prof\package.json"    "$Prof\package.json.bak-dshpet"    -Force
Copy-Item "$Prof\pnpm-lock.yaml"  "$Prof\pnpm-lock.yaml.bak-dshpet"  -Force
"备份完成"
```

**再安装**（源码路线：`file:` 指向你构建好的目录）

```powershell
& $Dsh plugin --profile desktop add "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet"
```

- 路径用**正斜杠** `F:/...`。反斜杠在 pnpm 的依赖说明符里容易被当成转义符，可能导致解析失败（🟡 待验证：我未实测反斜杠形式，正斜杠是 pnpm 官方推荐写法）。
- 这一条命令 = 在 `profiles\desktop` 里执行 pnpm，装的是**你刚构建好的本地目录**，不是从 npm 下载的包。
- 本机实测输出（可对照）：`+ dsh-pet file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet` → `Packages: +11` → `Done in 1.3s using pnpm v11.7.0`，退出码 0。

> ⚠️ **注意：`file:` 安装是"复制"，不是"软链接"**
> 本机实测确认：装进 `profiles\desktop\node_modules\dsh-pet` 的是一份**真实拷贝**（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`package.json` 的 SHA256 都与源码一致，且它是一个目录、不是链接）。
> 后果：**你改了插件源码、只是重新 `npm run prepare` 构建，DSH 加载的还是旧拷贝。** 必须**重新执行一次 `add`** 才会更新：
> ```powershell
> & $Dsh plugin --profile desktop add "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet"
> ```
> 这是"折腾源码时最容易困惑的一点"。

**怎么知道成功了**

```powershell
# ① profile 的 package.json 里出现了 dsh-pet：应在 dependencies 里，且 dsh.profile.bundles 里多一项 "dsh-pet"
Get-Content "$Prof\package.json"

# ② 插件真的被链接/复制进了 profile
Test-Path "$Prof\node_modules\dsh-pet\lib\index.js"     # 期望 True
Test-Path "$Prof\node_modules\dsh-pet\lib\client.js"    # 期望 True

# ③ 用 pnpm 自己的视角列一遍（参数被转发给 pnpm）
& $Dsh plugin --profile desktop list
```

`package.json` 里期望看到的结构（示意）：

```jsonc
{
  "name": "dsh-profile-desktop",
  "dependencies": { "dsh-pet": "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet" },
  "dsh": { "profile": {
      "bundles": [ "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app",
                   "@deepseek-ai/dsh-experimental-voice-input-bundle",
                   "@deepseek-ai/dsh-experimental-agent-team-profile",
                   "dsh-pet" ],          // ← 这一项是 DSH 自动补的
      "patchReload": "live" } }
}
```

**看到这些很正常，别慌**

- **`WARN  Issues with peer dependencies found` / 一堆 unmet peer `@deepseek-ai/*`、`react`** —— 这是**预期**的。profile 的 `pnpm-workspace.yaml` 写着 `autoInstallPeers: false`（✅ 实测），而 `@deepseek-ai/*` 和 `react` 都由 **DSH 宿主**在运行时提供，插件故意不打包它们（写在插件 `peerDependencies` 里）。只要进程最终以 exit code 0 结束、包进了 `node_modules`，就继续下一步。真正要停的是 `ERR_PNPM_...` 开头的硬错误。
- **`declares no dsh.bundle — installed as a plain dependency, not a profile layer`** —— 这说明包的 `dsh.bundle` 没被识别，**必须处理**：要么确认你装的是 `dsh-pet`（`dsh-pet\package.json` 里有 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`），要么手动补 `bundles`（见下一节兜底）。

**兜底：如果 `dsh.profile.bundles` 里没自动出现 `dsh-pet`**

层栈顺序表就是 `dsh.profile.bundles` 数组，所以把它手工加进去即可。**必须先退出 DSH**，再编辑：

```powershell
# 先备份（如果前面没备份）
Copy-Item "$Prof\package.json" "$Prof\package.json.bak2" -Force
notepad "$Prof\package.json"
# 在 "dsh" → "profile" → "bundles" 数组的末尾加一行：  "dsh-pet"
```

保存后重启 DSH。（本次实测已确认**正常路径会自动追加**，不需要手工补；这一步只是万一你遇到"没进层栈"时的保险手段。）

**另一条更省事的替代路线**：如果你不想碰源码，也可以走 GUI 自带的**插件市场 / 插件管理**（`ui-plugin-manager`）从 npm 安装 `dsh-pet`（README 的"快速开始"就是这条）。它会并行探测 `registry.npmjs.org` 与 `registry.npmmirror.com` 并让你选源，装的是**已发布的 npm 包**（自带 `lib/`，无需你自己构建）。（📖 来自 DSH 自带文档）

---

## 五、步骤 3：刷新页面并验证

### 3.1 先做"不打扰"的静态验证

**不要用 `--dump-config` 查 desktop 档** —— 这条命令对 desktop 档会**直接报错**（✅ 由本机实测确认）：

```
error: profile "desktop" is managed exclusively by the Electron application
```

因为 `desktop` 是 Electron 桌面程序独占管理的档，命令行启动器不允许去合成它。（顺带一提，`dsh --profile nosuchprofile --dump-config` 会报 `profile does not exist; create it with 'dsh plugin --profile <name> add <package>'`。）
而 `dsh plugin --profile desktop <pnpm 参数>` 是**可以**用的（本机跑 `... plugin --profile desktop ls` 退出码 0 ✅），因为那只是在档目录里转发 pnpm。

所以 desktop 档的验证改成**看文件 + 列包**这四条：

```powershell
$Prof = "C:\Users\Administrator\.dsh\profiles\desktop"

# ① 层栈表里有没有 dsh-pet（以及 dependencies 里有没有它）
Select-String -Path "$Prof\package.json" -Pattern "dsh-pet|bundles" -Context 0,6

# ② 包真的进了档的 node_modules
Test-Path "$Prof\node_modules\dsh-pet\lib\index.js"    # 期望 True
Test-Path "$Prof\node_modules\dsh-pet\lib\client.js"   # 期望 True

# ③ pnpm 视角列一遍（参数转发给 pnpm，本机确认可用）
& $Dsh plugin --profile desktop ls

# ④ 锁文件里出现 dsh-pet 的 importers 条目
Select-String -Path "$Prof\pnpm-lock.yaml" -Pattern "dsh-pet"
```

四项全中，就说明"包装进去了 + 它的 patch 层进了层栈"。

**想看到"合成后的配置树"长什么样？**（权威证明，但对 desktop 档不可用）
`--dump-config` 只在**非 desktop** 的档上能用。本机实测在 `web` 档上装完后运行，输出末尾就是插件的挂载行：

```powershell
& $Dsh --profile web --dump-config | Select-String -Pattern "dsh-pet|id: pet" -Context 1,2
# == dsh-pet
# - id: pet
#   name: dsh-pet
```

`desktop` 档用的是**完全相同的 bundle 机制**，只是被 Electron 独占锁定、不允许命令行合成。所以：**通用理论验证用 `--dump-config`（换个人造的档，比如 `web`），锁定档的验证用 `package.json` + `node_modules` + `plugin ls`。**

### 3.2 刷新即可，不必重启（✅ 实测）

`desktop` 档的 `patchReload` 是 `live`（✅ 实测），**已运行中的 DSH 会直接认到新装的插件**：

- 本机实测：DSH 主进程从 06:58:22 就在跑，而 `package.json` / `node_modules\dsh-pet` 是 08:42:29 才生成的 —— 也就是说**没重启**，插件就被运行中的程序拾取了；界面上按 **F5 / Ctrl+R 刷新页面**即可看到宠物。
- 所以推荐的顺序是：**先刷新页面** → 还没有再**完全退出重启**：
  - 托盘（任务栏右下角小图标）右键 → 退出；
  - 实在找不到：任务管理器结束 `DeepSeek Harness.exe`；
  - 命令行等价做法（⚠️ 会连带关掉你当前这个对话窗口，慎用）：
    ```powershell
    Stop-Process -Name "DeepSeek Harness" -Force
    ```
    然后从开始菜单/桌面重新打开 **DeepSeek Harness**。

### 3.3 界面上应该看到什么

| 现象 | 说明 |
| --- | --- |
| 界面**右上角**出现蓝色大鱼 | ✅ **用户实测确认**（刷新页面后就出现在右上角）。📖 默认 `corner: top-right`、`marginX: 24`、`marginY: 100`、`size: 462`、`display: "both"` |
| **设置 → 「桌宠配置」** 里能看到它 | 可改大小、四角位置与边距、显示位置（`web`/`desktop`/`both`/`none`）、余额开关、多开；点"保存"**即时生效**（无需刷新） |
| **右键宠物**有菜单 | 动作 → 分类 → 具体动画 点播；工具项：碎碎念 / 对话 / 回到初始位置；桌面端还有 打开网站 / 查看余额 / 重载配置 |
| 鼠标**点击 / 拖拽 / 甩抛**有反馈 | 点击 Q 弹、拖拽跟手、甩出抛物线反弹 |
| 宿主半侧真的在提供服务 | ✅ 实测：`GET http://127.0.0.1:19387/dsh-pet-7340/config` 返回 **200**、6702 字节真实配置，内容与包内默认 `assets/config.jsonc` 一致（宠物 `蓝毛小女仆`、`id: main`、`size: 462`、`display: both`、余额/碎碎念/工作状态均开启） |
| 桌面上有**透明置顶小窗** | 因为 `display` 含 `desktop`；本机 Electron **已就绪**：`C:\Users\Administrator\.dsh\electron\electron.exe` 已存在 ✅，不需要再下载 |

### 3.4 界面里没有宠物？

按顺序查：

1. `profiles\desktop\package.json` 的 `bundles` 里有没有 `"dsh-pet"`、`node_modules\dsh-pet` 存不存在？→ 没有就回到步骤 2 的兜底；
2. `--profile` 是不是 `desktop`？→ 装到 `web` 档而 GUI 跑 `desktop` 是最常见的低级错误；
3. 是否**完全退出并重启**（不是刷新页面）？
4. `Test-Path "C:\Users\Administrator\.dsh\dsh-pet"` 返回 **`False` 不代表安装失败** —— 该用户数据目录是**懒创建**的，只有在你**第一次保存桌宠设置**或**第一次用「对话」/「碎碎念」**之后才会出现。宠物此刻能正常显示就是最好的证明。（✅ 实测：宠物已在界面显示、配置接口 200，而该目录仍不存在）
5. **先刷新，再考虑重启**：本次实测确认「刷新页面」就够（见 3.2），不要因为它没出现就直接重装。
6. 控制台报错 → 见下一节排查表。

---

## 六、卸载与回滚

### 6.1 正常卸载（推荐）

```powershell
& $Dsh plugin --profile desktop remove dsh-pet
```

- 它会从 profile 的依赖里移除 `dsh-pet`、更新 `pnpm-lock.yaml`，并**清理 `dsh.profile.bundles` 里的 `dsh-pet` 行**（🟡 这一步依据的是 DSH 内置对账逻辑与安装时的反向表现，本机**未实际执行过 remove**；想要确定性结果就用 6.3 的备份还原法）。
- 然后**完全退出并重启 DSH**，宠物就消失了。
- 卸载**不会**删除你的源码目录，也不会删除用户数据。

> 📌 本次实测过程中，为了拿到"合成后的配置树"作为证据，`web` 档里也装了一份 `dsh-pet`。如果你只用 Electron 桌面版、不希望它留在 `web` 档里：
> ```powershell
> & $Dsh plugin --profile web remove dsh-pet
> ```
> （留着也无害：`web` 档只有你用命令行 `dsh web` 启动网页版时才会用到。）

### 6.2 只让它消失、但保留安装

- 设置 →「桌宠配置」→ 把该宠物的 `display` 改成 `none`（或删掉这个宠物实例）；
- 或者停用整行：在 `$DSH_HOME\profiles\desktop\cordis.patch.yml` 里针对 `id: pet` 那一行做禁用（该文件就是你的用户覆盖层）；两者都需要重启/重新加载。
  ⚠️ 别改错行：本插件在配置树里的行是 **`id: pet` / `name: dsh-pet`**（由插件自带的 `cordis.patch.yml` 插入）。同一个 desktop 档的用户 `cordis.patch.yml` 里还有一个**别的插件**的行 `id: web-ui-pet` / `name: @linxin666/dsh-pet`（当前 `enabled: false`）——改那一行不会影响本插件。

### 6.3 彻底回滚到"安装前"

```powershell
$Prof = "C:\Users\Administrator\.dsh\profiles\desktop"

# ① 还原安装前的 profile 清单与锁文件（前提：步骤 2 备份过）
Copy-Item "$Prof\package.json.bak-dshpet"   "$Prof\package.json"   -Force
Copy-Item "$Prof\pnpm-lock.yaml.bak-dshpet" "$Prof\pnpm-lock.yaml" -Force

# ② 删掉装进去的包（`file:` 安装是真实拷贝，所以直接删这个目录即可）
Remove-Item "$Prof\node_modules\dsh-pet" -Recurse -Force

# ③ 可选：删掉用户数据（配置 / 素材 / 对话记忆）——这一步不可逆
#    注意：该目录是**懒创建**的，如果你还没保存过设置、也没用过对话，它可能根本不存在（删之前先 Test-Path）
Remove-Item "C:\Users\Administrator\.dsh\dsh-pet" -Recurse -Force
```

删除前请确认路径就是你想要的那一个（`C:\Users\Administrator\.dsh\profiles\desktop` 与 `C:\Users\Administrator\.dsh\dsh-pet` 是**两个不同**的目录）。

> 用户数据目录里有什么（📖 README）：`main-config.jsonc`（你改的配置）、`main-animation\webm\`（自定义动画素材）、`pet\`（额外宠物种类 pet pack）、`memory.json`（对话记忆）。想保留记忆就**别删** `$DSH_HOME\dsh-pet\`。
> ⚠️ `$DSH_HOME\dsh-pet\` **不会在安装时生成**：它是懒创建的 —— **首次保存桌宠设置**或**首次使用对话/碎碎念**之后才会出现（✅ 实测：本次安装成功后该目录仍不存在，而宠物已正常运行）。所以"这个目录没有"永远不能用来判断安装失败。
> 另外：`$DSH_HOME\pet.json`、`$DSH_HOME\pets\jyn\` **不属于本插件**，是另一个桌宠插件的数据（✅ 实测），别误删。

---

## 七、常见错误排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `dsh : 无法将"dsh"项识别为 cmdlet…` | Electron 桌面安装没把 `dsh` 注册进 PATH | 用完整路径 `& "F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" ...`，或按步骤 0 办法 B 写进用户 PATH 并重开终端 |
| 装完重启，界面里什么都没有 | 包没进 `dsh.profile.bundles`，或装错了档 | 确认用的是 `--profile desktop`；打开 `profiles\desktop\package.json` 看 `bundles` 有没有 `dsh-pet`，没有就手动补上再重启 |
| `dsh --profile desktop --dump-config` 报 `profile "desktop" is managed exclusively by the Electron application` | desktop 档由 Electron 程序独占管理，命令行不允许合成它 | **这是预期行为，不是故障**；改用 `profiles\desktop\package.json` + `node_modules\dsh-pet` + `pnpm-lock.yaml` + `& $Dsh plugin --profile desktop ls` 来验证（见 3.1） |
| 启动日志报 `Cannot find module ...\dsh-pet\lib\index.js` | **没构建**（`lib/` 不入库，clone 后为空） | 回步骤 1：`cd` 到插件包根 → `npm install` → `npm run prepare`；确认 `lib\index.js` 存在后重新 `add` |
| 桌面小窗没出现 / 一直没有透明宠物窗 | `display` 不含 `desktop`；或 Electron 没就绪；或无图形会话 | 设置里把 `display` 设为 `both`；手动触发 Electron 准备：`cd "F:\_Workspace\GitHub-Project\dsh-pet\dsh-pet"; npm run ensure:electron`；检查 `C:\Users\Administrator\.dsh\electron\` |
| 下载 Electron 卡住 / 超时 | 默认走 `@electron/get` 下载（已默认用 npmmirror 镜像，但网络仍可能不通） | 换镜像后重试（✅ 变量名来自插件源码 `scripts/ensure-electron.mjs`）：<br>`$env:DSH_PET_ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"; npm run ensure:electron` |
| `git clone` / 访问 GitHub 超时 | 网络到 GitHub 不稳 | 用镜像加速，或在 Releases 页下载 zip 解压代替 clone；插件本身**不依赖** GitHub（已 clone 就不必再连） |
| `npm install` 很慢 / 卡在 resolve | 默认源在国外 | `npm config set registry https://registry.npmmirror.com` 后重试（本机 npm 镜像已是 npmmirror） |
| 一堆 peer dependency 警告 | profile 设了 `autoInstallPeers: false`，`@deepseek-ai/*`、`react` 由宿主提供 | **正常，忽略**；只要不是 `ERR_PNPM_*` 且包进了 `node_modules` 就继续 |
| 改了插件源码、重新构建了，界面却还是旧行为 | `file:` 安装是**拷贝**，不是软链接 —— 只构建不会更新 DSH 加载的那一份（✅ 实测） | 每次改完源码 + `npm run prepare` 后，**重新执行一遍安装命令**：`& $Dsh plugin --profile desktop add "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet"`，然后刷新页面 |
| 装到了 `web` 档，GUI 里却没有 | GUI 跑的是 `desktop` 档，`web` 是另一份配置（本次实测为取证也往 `web` 装了一份，那只是验证副作用） | 重新装到 `desktop`：`& $Dsh plugin --profile desktop add ...`；若你确实用命令行 `dsh web` 起网页版，才装 `web` |
| 设置页里找不到「桌宠配置」 | 插件没挂载进当前档 | 回到步骤 2 / 3；确认 `profiles\desktop\package.json` 的 `bundles` 里有 `dsh-pet` 且 `node_modules\dsh-pet` 存在，并重启 GUI |
| 加载时控制台显式报配置错误 | 用户配置 `C:\Users\Administrator\.dsh\dsh-pet\main-config.jsonc` 格式非法（插件**不会**静默兜底） | 删掉该文件回落包内默认，或在设置页点「同步」把包内 `config.jsonc` 原文写回去 |
| 分不清是哪个桌宠 | 本机同时存在 `dsh-pet`（本次装的）与 `@linxin666/dsh-pet` | 看包名；后者配置为 `enabled: false`，未启用 |
| 余额气泡写着"当前服务商暂不支持余额查询" | 余额功能只登记了 DeepSeek 官方 / OpenCode Zen Go；本机默认服务商是 `tokenrhythm2`（✅ 实测 profile 配置） | 属正常提示（第二行会报出 provider id）；详见第八节 |

---

## 八、可选高级（装好之后再折腾）

### 8.1 桌面模式（脱离浏览器的小窗）

- 开关是**每只宠物的必填字段 `display`**：`web` 仅浏览器 / `desktop` 仅桌面 / `both` 两者 / `none` 都不显示；在设置页「桌宠配置」里改，**即时生效**。
- 首次启动自动探测 Electron，必要时下载到 `C:\Users\Administrator\.dsh\electron\`；（本机 ✅ 实测该目录下 `electron.exe` 已存在，**无需下载**）；缺失时只在日志里告警，不影响浏览器形态。
- 本地调试命令（📖 README）：`npm run start:desktop -- http://127.0.0.1:3080/dsh-pet-7340/config`。
- 多屏：`confineToScreen` 控制甩出去的宠物是否只在当前屏内弹（默认 `false`，可跨屏）。

### 8.2 余额 / 碎碎念 / 对话需要什么凭据

| 能力 | 需要的凭据 / 开关 |
| --- | --- |
| 余额动画 + 头顶气泡 | 按宠物开关 `pets[i].balanceEnabled`；凭据是对应服务商的 API key：DeepSeek 官方 → `DEEPSEEK_API_KEY`，OpenCode Zen Go → `OPENCODE_GO_API_KEY`（在 DSH 凭据里配置）。**未登记余额接口的服务商**不播档位动画，改为弹一句文字说明（不静默失败） |
| 碎碎念 | `pets[i].whisperEnabled` 开启后按 `eventsRefreshSec.whisper`（默认 300 秒）自动生成一句；右键「碎碎念」可手动触发（不受该开关门控） |
| 对话 | 右键「对话」；调用你**当前 DSH 里已配好的模型**（本机是 `tokenrhythm2` / `deepseek-flash`），记忆持久化在 `C:\Users\Administrator\.dsh\dsh-pet\memory.json`（首次对话后才创建；浏览器与桌面共用一份） |
| 工作状态联动 | `pets[i].workStatusEnabled`；跟随会话事件切"思考/工作/整理/等待/成功/出错"六档动画 |
| 表情包配图 | `whisperImageEnabled` / `chatImageEnabled`，图片取自包内 `assets/memes` |

### 8.3 路径与配置速查

| 路径 | 内容 |
| --- | --- |
| `$DSH_HOME` = `C:\Users\Administrator\.dsh` | DSH 主目录（可用环境变量 `DSH_HOME` 覆盖） |
| `$DSH_HOME\profiles\desktop\` | 你的档：`package.json`（层栈表）、`cordis.patch.yml`（你的覆盖层）、锁文件、`node_modules\` |
| `$DSH_HOME\dsh-pet\` | 插件的**用户数据根**——⚠️ **懒创建**：首次保存桌宠设置或首次对话/碎碎念后才会出现，安装完立刻看它可能是"不存在" |
| `$DSH_HOME\dsh-pet\main-config.jsonc` | 本插件的用户配置（**整体覆盖**包内默认的同名字段；同上，保存过设置才存在） |
| `$DSH_HOME\dsh-pet\main-animation\webm\` | 自定义动画（放 VP9-alpha 的 `.webm`，优先于包内素材） |
| `$DSH_HOME\dsh-pet\pet\<种类>-config.json` + `<种类>-animation\` | 额外宠物种类（pet pack） |
| `$DSH_HOME\dsh-pet\memory.json` | 对话记忆（首次对话后才会创建） |
| `$DSH_HOME\electron\` | 桌面模式用的 Electron |
| `F:\_Workspace\GitHub-Project\dsh-pet\dsh-pet\assets\config.jsonc` | 包内默认配置（想手写高级配置就照它的结构抄） |

### 8.4 改配置的两条途径

- **设置页「桌宠配置」（推荐）**：大小 / 四角位置 / 边距 / `display` / 余额开关 / 多开 / 物理手感；保存即时生效；点"同步"会把包内 `config.jsonc` 原文整份写进用户配置（等于回落默认，同时留下一份带注释、可直接编辑的完整文件）。
- **直接编辑 `main-config.jsonc`（高级）**：格式与包内 `config.jsonc` 完全一致，可以自由配动画池、播放权重、事件动画、刷新周期；写错的字段回落默认，格式错误会在加载时显式报错。

> 顺带一提：`config.jsonc` 支持注释，改完文件后若不想回设置页，桌面端右键「重载配置」即可让所有桌面宠物重载。

---

## 九、本次实测记录

**记录时间**：2026-10-02 08:41 起（安装动作由 Lead 在同一台机器上执行，我负责核对文件与命令输出）

### 9.1 环境与源码状态（✅ 我实测，逐条有依据）

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| Node 版本 | `node -v` | `v24.20.0` ✅ |
| npm 版本 | `npm -v` | `11.19.0` ✅ |
| pnpm（全局） | `pnpm -v` | `11.21.0` ✅ |
| dsh 版本 | `& $Dsh --version` | `0.2.0-rc.2` ✅（与插件要求一致） |
| dsh 是否在 PATH | `Get-Command dsh` | **NOT FOUND on PATH**；裸 `dsh --version` 报中文 `CommandNotFoundException` ✅ |
| 启动器路径 | `Test-Path` | `F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` 存在 ✅ |
| 档布局 | 读目录 | `profiles\desktop\` = `package.json` + `cordis.patch.yml`(137 行) + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `node_modules\` + `cordis.yml` + `.plugin-manager\` ✅ |
| 层栈表（装前） | 读 `profiles\desktop\package.json` | `bundles = [dsh-base, dsh-web-app, dsh-experimental-voice-input-bundle, dsh-experimental-agent-team-profile]`，`patchReload: live`，**无 `dependencies` 字段** ✅ |
| pnpm 设置 | 读 `pnpm-workspace.yaml` | `nodeLinker: hoisted`、`autoInstallPeers: false` ✅ |
| 锁文件（装前） | 读 `pnpm-lock.yaml` | `importers: { ".": {} }` —— 装前该档没有依赖 ✅ |
| `web` 档 | 读目录/读文件 | **并非空目录**：有 `package.json`、`cordis.patch.yml`、`cordis.yml`、`pnpm-workspace.yaml`。**装前**它的 `dependencies` 为空、也没有 `node_modules`；本次实测为了拿 `dump-config` 证据又往它装了一份 `dsh-pet`，所以**现在**是：`bundles = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-pet]`、`dependencies.dsh-pet = "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet"`，并已生成 `node_modules\` 与 `pnpm-lock.yaml`；它**没有** `patchReload` 键（`patchReload: live` 只有 desktop 档有）✅ |
| 插件包 | 读 `package.json` | 名称 `dsh-pet`，版本 `0.3.1`，`main: lib/index.js`，`dsh.bundle.patch: ./cordis.patch.yml` ✅ |
| 挂载声明 | 读 `cordis.patch.yml` | `- insert: [ { id: pet, name: 'dsh-pet' } ]` ✅ |
| 构建脚本 | 读 `scripts/prepare.js` | 依次跑 `bundle`(tsdown) → `build:desktop-core` → `types`，再改写 `files`；任何一步失败即 exit 1 ✅ |
| 桌面下载镜像 | 读 `scripts/ensure-electron.mjs` | `DSH_HOME/electron` + `DSH_PET_ELECTRON_MIRROR`（默认 `https://npmmirror.com/mirrors/electron/`）✅ |
| 插件构建状态 | `Test-Path .\lib`、`.\node_modules` | **均已存在**（构建已跑过）✅ |
| 是否已装进档 | `Test-Path profiles\desktop\node_modules\dsh-pet` | **False**（08:41:33 时点，安装尚未完成）✅ |
| 同名插件干扰 | 读 `profiles\desktop\cordis.patch.yml` | 存在 `@linxin666/dsh-pet`（`id: web-ui-pet`，`enabled: false`）+ `@linxin666/dsh-client-ui-skin-center` ✅ |

### 9.2 安装过程（✅ 全部实测完成，非"待回填"）

**A) 构建**（在 `F:\_Workspace\GitHub-Project\dsh-pet\dsh-pet`）

```powershell
npm install --no-audit --no-fund
```

| 项 | 结果 |
| --- | --- |
| 退出码 | **0**，`added 245 packages in 9s` |
| 构建是否要手动跑 | **不需要** —— `prepare` 是 npm 生命周期钩子，`npm install` 时自动执行了完整构建 |
| 构建输出 | `[prepare] building (tsdown)` → tsdown v0.8.1 / rolldown v1.0.0-beta.7，入口 `src/client/index.ts` + `src/host/index.ts`，"Build complete in 35ms"；→ 桌面共享核心 `runtime/electron-helper/shared-core.js`（`window.PetShared`）；→ 类型 `lib/types`；→ `[prepare] ✓ package.json files=[lib, src, assets/webm, runtime/electron-helper, assets/fonts, assets/pic, assets/memes, assets/config.jsonc, scripts/ensure-electron.mjs, cordis.patch.yml]` |
| 产物规模 | `lib/client.js` 145,710 B、`lib/index.js` 85,211 B、随包 106 个 webm 动画 |

**B) 安装到 desktop 档**

```powershell
& "F:\_Frame\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet"
```

| 项 | 结果 |
| --- | --- |
| 退出码 | **0** |
| 输出 | `+ dsh-pet file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet`，`Packages: +11`，`Done in 1.3s using pnpm v11.7.0`（用的是 DSH 自带运行时的 pnpm，不是你全局的 11.21.0） |
| 说明符写法 | **必须正斜杠** `file:F:/...`（该值会被逐字写进 profile 的 `package.json`） |
| peer 警告 | 出现 `[WARN] Issues with peer dependencies found` —— **正常**，`autoInstallPeers: false`，`@deepseek-ai/*` / `react` 由宿主提供，**不要**手动装它们 |

**C) 落盘结果（逐项核对）**

| 检查项 | 结果 |
| --- | --- |
| `profiles\desktop\package.json` | ✅ 出现 `"dependencies": { "dsh-pet": "file:F:/_Workspace/GitHub-Project/dsh-pet/dsh-pet" }` |
| `dsh.profile.bundles` | ✅ 自动追加成功，末尾变为 `[..., "@deepseek-ai/dsh-experimental-agent-team-profile", "dsh-pet"]` —— **对账逻辑确实生效** |
| `pnpm-lock.yaml` | ✅ importer `"."` 里出现该 `file:` 依赖 |
| `profiles\desktop\cordis.patch.yml` | ✅ **未被修改**（用户覆盖层没被动过）。⚠️ 备份有两套，别混淆：**本次实测的备份由 Lead 放在 `profiles\desktop\.dsh-pet-backup\`**（内含 `package.json.bak` / `pnpm-lock.yaml.bak` / `cordis.patch.yml.bak`）；**而本文步骤 2 让你自己做的备份是 `package.json.bak-dshpet` / `pnpm-lock.yaml.bak-dshpet`**（`.dsh-pet-backup` 不是本文的命令产生的） |
| `--profile desktop --dump-config` | ❌ 不可用：`error: profile "desktop" is managed exclusively by the Electron application` |
| `--profile web --dump-config`（验证用：实测时在 web 档也装了一份 `dsh-pet`，只为拿到"合成后的配置树"作为证据；不影响 desktop 档） | ✅ 退出码 0，合成树末尾出现权威挂载证据：`# == dsh-pet` → `- id: pet` → `name: dsh-pet` |
| `file:` 是拷贝还是链接 | ✅ **拷贝**（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`package.json` 的 SHA256 与源码一致，且是目录不是链接）→ 改源码后必须重新 `add` |
| `profiles\desktop\node_modules\dsh-pet` | ✅ 存在（08:42:29 生成） |

**D) 界面与运行时**

| 项 | 结果 |
| --- | --- |
| 是否必须重启 | ❌ **不用重启**。DSH 主进程 06:58:22 就在跑，插件 08:42:29 才装好，运行中的程序直接拾取了它（`patchReload: "live"`）——**刷新页面即可** |
| 宠物是否出现 | ✅ **用户实测确认：刷新后出现在界面右上角** |
| 宿主半侧证据 | ✅ `GET http://127.0.0.1:19387/dsh-pet-7340/config` → **200**，6702 字节；内容等于包内默认 `assets/config.jsonc`（`蓝毛小女仆` / `id: main` / `size: 462` / `display: both` / 余额、碎碎念、工作状态均开启） |
| 桌面模式依赖 | ✅ Electron 已就绪：`C:\Users\Administrator\.dsh\electron\electron.exe` 已存在，**无需下载** |
| 浏览器半侧 | ⚠️ 无法用机器断言渲染结果（DSH 自身路由 `/api/plugins`、`/api/client/plugins`、`/api/client-modules` 均 401，`/plugins/<name>/client.js` 对所有插件都 404，那不是实际服务路径）→ 因此这一条以**用户肉眼确认为准**，即上表的"宠物出现" |

### 9.3 仍未实测的部分（🟡，教程中已按保守写法给出）

- **反斜杠**形式的 `file:F:\...` 说明符：未实测（安装实际用的是正斜杠，且正斜杠被写进了 `package.json`，教程统一要求正斜杠）。
- **把启动器目录写进用户 PATH**（步骤 0 办法 B）：未实测本机 PATH 变更效果，故教程同时给出"用完整路径"的办法 A。
- **卸载命令的实机执行**：`& $Dsh plugin --profile desktop remove dsh-pet` 的"会同时清掉 `dsh.profile.bundles` 里那一行"依据的是 DSH 内置对账逻辑（📖）与安装时的反向表现，**未实际跑过 remove**；所以第六节同时给了"还原备份文件 + 删目录"的确定性回滚。
- **`$Dsh plugin --profile desktop ls` 的输出内容**：只确认了该命令可用、退出码 0 ✅，未记录具体输出文本。
