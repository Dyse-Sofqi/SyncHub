/**
 * 简体中文 —— 规范语言（source of truth）。
 *
 * `LocaleStrings` 从本文件推导，其他语言必须 `satisfies LocaleStrings`，
 * 漏翻译或键名写错会在编译期直接报错，而不是运行时静默回退英文。
 */

/**
 * 疑似镜像那一行/那一项的前缀。
 *
 * 提成模块级常量是因为**两处共用同一句话**：确认弹窗里要把它与「可点开的地址」
 * 分开渲染（见 `ui/repoLink.ts`），而「添加插件仓库」弹窗里用的是拼好的整句。
 * 写两份的话，改一处就会与另一处不一致。
 */
const mirrorCandidatePrefix = "疑似镜像：";

export const zhCN = {
    plugin: {
        name: "SyncHub",
        /**
         * 侧边栏图标（ribbon）的悬停文案。
         *
         * 拆成两条是因为插件现在有**两个** ribbon：一个打开同步详情视图
         * （与 git 插件一样），一个打开安装器。原来那句「同步笔记仓库 / 安装插件」
         * 是给唯一一个图标的，而那个图标打开的是安装器 —— 想找同步视图的人
         * 会点它、然后看到一个装插件的弹窗。
         */
        ribbonSync: "SyncHub：打开仓库同步视图",
        ribbonInstaller: "SyncHub：安装社区插件",
        ribbonImages: "SyncHub：打开图片管理",
        /**
         * 功能区底部那张头像的悬停 / 替代文案（2026-10-05）。
         *
         * 它**不带任何动作**（点它没有反应），所以这句话要回答的是「这是谁」——
         * 插件别处回答不了这个问题，而它正是「当前配的令牌属于哪个账号」
         * 最直观的答案（镜像探测拿的也是这个账号名，见 `mirrorOwnerCandidates`）。
         *
         * `host` 是平台显示名（「Gitee」/「GitHub」，由装配层传 `displayName` 进来）——
         * 2026-10-06 起头像可以是两个平台里的任一个，句子必须说清是哪一个。
         *
         * 账号名缺席时退到那句通用的：那种响应（有头像地址、没有 `login`）不合常理，
         * 但文案不该因此变成一句带空格的残句。
         */
        ribbonAvatar: (host: string, account: string) =>
            account ? `SyncHub：${host} 账号 ${account} 的头像` : `SyncHub：${host} 账号的头像`,
    },

    common: {
        ok: "确定",
        cancel: "取消",
        save: "保存",
        close: "关闭",
        delete: "删除",
        edit: "编辑",
        retry: "重试",
        copy: "复制",
        copied: "已复制到剪贴板",
        loading: "加载中…",
        none: "无",
        unknown: "未知",
        yes: "是",
        no: "否",
        confirm: "确认",
        enabled: "已启用",
        disabled: "已禁用",
        version: "版本",
        actions: "操作",
        refresh: "刷新",
        optional: "可选",
        required: "必填",
    },

    host: {
        github: "GitHub",
        gitee: "Gitee",
        unknown: "未知平台",
        tokenMissing: (host: string) =>
            `${host} 需要访问令牌才能访问私有仓库，请在设置中填写。`,
        tokenInvalid: (host: string) => `${host} 访问令牌无效或已过期。`,
        rateLimited: (host: string, resetAt: string) =>
            `${host} 接口调用次数已达上限，将于 ${resetAt} 恢复。`,
        notFound: (host: string, repo: string) => `${host} 上找不到仓库 ${repo}。`,
        networkFailed: (detail: string) => `网络请求失败：${detail}`,
        requestFailed: (status: number, detail: string) =>
            `请求失败（HTTP ${status}）：${detail}`,
        parseFailed: (input: string) =>
            `无法识别仓库地址「${input}」。请填写 owner/repo，或完整的仓库链接。`,
        unsupportedHost: (input: string) =>
            `暂不支持该平台「${input}」，目前仅支持 GitHub 与 Gitee。`,
    },

    settings: {
        cmdOpenSettings: "SyncHub：打开设置",

        tabs: {
            // 统一用「跟踪」而不是「追踪」—— 同页标题也用的是「跟踪」，
            // 混用会让用户以为指的是两样东西。
            // 这个页签现在同时管插件与主题（同一个列表，靠类型徽标区分），
            // 所以标签写两者而不是只写插件 —— 否则主题用户不会想到点进来。
            tracked: "插件与主题",
            installer: "插件安装器",
            sync: "仓库同步",
            images: "图片同步",
            general: "通用",
        },

        token: {
            heading: "访问令牌",
            desc: "访问私有仓库、或提高接口调用上限时需要。令牌只会保存在本机，不会写入 data.json，也不会随仓库同步。",
            githubName: "GitHub 访问令牌",
            githubDesc: "在 GitHub 的 Settings → Developer settings → Personal access tokens 中创建。",
            giteeName: "Gitee 访问令牌",
            giteeDesc: "在 Gitee 的「设置 → 私人令牌」中创建，至少需要 projects 权限。",
            placeholder: "粘贴令牌…",
            test: "测试",
            testing: "测试中…",
            valid: (host: string, account: string) => `${host} 令牌有效，账号：${account}`,
            invalid: (host: string) => `${host} 令牌无效。`,
            cleared: "令牌已清除",
            configured: "已配置",
            notConfigured: "未配置",
        },

        general: {
            // 页首标题 2026-10-06 删了（页签「通用」就是页名）—— 那一行原本是
            // `heading: "通用"`。
            showNotices: "显示操作结果提示",
            showNoticesDesc: "关闭后只显示错误提示，成功与进度提示会被静默。",
            debugLogging: "输出调试日志",
            debugLoggingDesc: "在开发者控制台输出详细的请求与同步日志，排查问题时开启。",
            statusBarLeftAlign: "状态栏同步条目贴靠最左侧",
            /**
             * 说清两边各是什么：开着是现在的表现（条目排在这一簇最左），
             * 关掉只是「不特殊处理」，条目还在 —— 不说的话用户会以为关掉条目
             * 就消失了。
             */
            statusBarLeftAlignDesc:
                "开启时，同步条目排在状态栏那一簇的最左侧（只改自己的视觉顺序，" +
                "不动其他条目）。关闭后不作特殊处理，条目按默认顺序排在其他条目后面 —— " +
                "状态栏本身不变。",
            /**
             * 功能区（左侧 ribbon）底部的圆形头像。
             *
             * 两句都必须说到：**默认关**（不加开关就啥都不变），以及
             * **用哪个平台的头像由下面那一项决定**（2026-10-06 拆出去）——
             * 不说的话用户会以为这张头像只能是 Gitee 的。
             *
             * 「没配令牌就什么都不显示」那一句挪到了下面 `ribbonAvatarSourceDesc`
             * ——它讲的是**哪个平台**的令牌，跟着那一行走更准。
             */
            ribbonAvatar: "功能区展示用户头像",
            ribbonAvatarDesc:
                "在左侧功能区底部显示一张圆形头像（当前所配令牌所属账号的）。" +
                "用哪个平台的头像由下面那一项决定。",
            /**
             * 头像用哪个平台（2026-10-06 用户要求）。
             *
             * 用户的原话：「将功能区展示用户头像中gitee部分拆分出来单独设置一个设置项，
             * 默认开启，开启时使用gitee头像，关闭时使用GitHub头像」。所以名称写成
             * **开启时那一档**（与「启用 Gitee 镜像源更新 SyncHub」同一个写法），
             * 描述里补上关闭时是什么。
             *
             * 「没配对应令牌就没有头像」必须写在这里：不写的话，选了没配令牌的那个
             * 平台的用户只会以为开关坏了（令牌就在**本页下方**的「访问令牌」一节）。
             */
            ribbonAvatarSource: "使用 Gitee 头像",
            ribbonAvatarSourceDesc:
                "开启时用 Gitee 令牌所属账号的头像，关闭时用 GitHub 的。" +
                "需要先在下方「访问令牌」里填好对应平台的令牌 —— 没填就没有头像可显示，开关本身不会报错。",
            /**
             * 「去平台换头像」那一句 + 两档链接文字（2026-10-05 用户要求，
             * 2026-10-06 随平台开关拆成两条）。
             *
             * 用户的原话：「在功能区展示头像设置项中，添加用户的 gitee 设置页链接，
             * 方便用户更换头像」。头像**不能在插件里换**（它是平台账号的资料），
             * 所以这两条的全部作用就是把人送过去。
             *
             * 链接文字只写域名与路径（与 `gitPathLink` 的 `git-scm.com` 同一套写法）；
             * 真正的 `href` 是 `settingsTab.ts` 里的 `GITEE_PROFILE_URL` /
             * `GITHUB_PROFILE_URL` 两个常量 —— 网址不随语言变，所以不进这里。
             */
            ribbonAvatarChangeLead: "想换一张头像的话，到个人资料页改：",
            ribbonAvatarChangeLinkGitee: "gitee.com/profile",
            ribbonAvatarChangeLinkGithub: "github.com/settings/profile",
        },

        installer: {
            // 页首标题 2026-10-06 删了（页签「插件安装器」就是页名）。
            /**
             * 这里原来第一行是 `enabled` / `enabledDesc`（「启用插件安装器」）——
             * 2026-10-06 随字段一起删了：它只挡下面两个自动检查，等价于把它们都关掉，
             * 而名字却让人以为关掉就不装了。理由见 `core/settings.ts` 的 `migrateV9ToV10`。
             */
            autoCheck: "启动时检查更新",
            autoCheckDesc: "Obsidian 启动后自动检查已跟踪插件与主题的更新。默认关闭 —— 多数情况下用「进入设置页时自动检查」就够。",
            autoCheckDelay: "启动检查延迟（秒）",
            autoCheckDelayDesc: "启动后等待多久再开始检查，避免与 Obsidian 自身的启动流程争抢资源。",
            autoCheckOnSettingsOpen: "进入设置页时自动检查",
            autoCheckOnSettingsOpenDesc: "打开本设置页时自动检查一次更新。短时间内重复打开会跳过，以免白白消耗接口配额。",
            /**
             * 这里原来还有 `tracked`（「已跟踪的插件与主题」）与 `trackedDesc`
             * 两个键 —— 它们是「已跟踪」页顶部那张卡片的标题与说明。
             * 2026-10-05 用户要求「把这排按钮的卡片去掉，只留按钮展示」，
             * 卡片连同标题与说明一起下掉了，所以两个键也删了
             * （`pnpm check` 的「未使用的 i18n 键」会拦住忘了删的情况）。
             * 页面上现在只剩一句空状态：`trackedEmpty`。
             */
            trackedEmpty: "还没有添加任何插件或主题。",
            selfHeading: "SyncHub 自身",
            selfDesc:
                "更新 SyncHub 自己。只写入新版本的文件，不重载正在运行的插件 —— 重启 Obsidian 后新版本才生效。",
            /**
             * 自身更新的来源开关（2026-10-06 用户要求：从自由文本框改成开关）。
             *
             * 文案必须点明四件事：**默认是什么**（不然用户不知道要不要动它）、
             * **开 / 关各自对应哪个地址**、**镜像挂了会怎样**（会自动回退到官方，
             * 并提示一次 —— 写清楚才敢默认开）、以及**不会误伤别的插件**（写盘前
             * 校验远端 manifest 的 id 必须是 ob-sync）—— 最后一条是他敢不敢关的前提。
             */
            selfUseGitee: "启用 Gitee 镜像源更新 SyncHub",
            selfUseGiteeDesc:
                "默认开启：从 Gitee 镜像（gitee.com/sofqi/SyncHub）检查并下载 SyncHub 自己的更新，国内可直连。" +
                "关闭后改用官方仓库（github.com/Dyse-Sofqi/SyncHub）。" +
                "镜像不可用（例如 Gitee 匿名接口被限流）时会自动改用官方仓库重试，并提示一次。" +
                "更新前会校验远端 manifest 的 id 必须是 ob-sync，所以不会覆盖别的插件。",
            mirrorDiscovery: "自动发现 Gitee 镜像",
            mirrorDiscoveryDesc: "安装 GitHub 插件时，探测 Gitee 上的镜像仓库：同名仓库，以及你 Gitee 账号下的同名仓库（后者需要先填 Gitee 令牌）。命中则改用镜像源下载，国内速度更快。",
        },

        sync: {
            // 页首标题 2026-10-06 删了（页签「仓库同步」就是页名）。
            /**
             * 「定时同步」这一行：**周期框 + 开关**。
             *
             * 2026-10-02 之前这里叫「启用笔记同步」，而名字比职责大 ——
             * 命令面板里的同步命令从来不受它影响，它管的只有定时器。同一天
             * 三个间隔（提交 / 推送 / 拉取）也合成了一个周期：主间隔跑的本来
             * 就是完整链路，另外两个数字除了制造「设为 0 会不会拦住推送」这种
             * 误解之外没别的用。
             */
            enabled: "定时同步",
            enabledDesc:
                "按上面的周期（1–1440 分钟）在后台自动跑完整链路：提交 → 拉取 → 推送。" +
                "关掉后定时器停止（周期会保留）；命令面板里的同步命令仍然可用。",
            /**
             * 单位跟在周期框后面（`<input> 分钟 <开关>`）——
             * 单位写进名称会变成「定时同步（分钟）」那种读不通的开关名。
             */
            minutesUnit: "分钟",
            /** 周期框的无障碍标签（框旁边没有自己的文字说明）。 */
            intervalAria: "定时同步周期（分钟）",
            /**
             * 「定时同步」名称后面那个倒计时徽标（2026-10-02 用户要求：
             * 「如果定时同步是开启的状态，请显示距离下次同步的倒计时」）。
             *
             * 参数是已经格式化好的时长（`3:07` / `1:05:00`，见 `formatCountdown`）。
             * 定时器不存在（开关关着 / 策略为「重置」挂起）时徽标是空的、整块收起来，
             * 所以这里不需要「没有下次」的文案。
             */
            countdown: (remaining: string) => `下次同步 ${remaining}`,
            /** 倒计时到点、那一轮正在跑时替换成这句（此时「还剩 0:00」是错的）。 */
            countdownRunning: "正在同步…",
            /**
             * 开关被挂起时的**替代**描述（策略为「重置」，见 `Automatics.start()`）。
             *
             * 必须同时说清「为什么灰掉」和「怎么恢复」：只把开关灰掉不解释，
             * 用户的第一反应是「插件坏了」。
             */
            enabledSuspendedByReset:
                "已暂停：当前拉取整合策略是「重置」，每一轮定时同步都会丢弃刚提交的内容。" +
                "改回「合并」或「变基」后自动恢复。",
            desktopOnly: "笔记同步依赖系统 git，仅在桌面端可用。",
            /**
             * 「打开仓库同步面板」（2026-10-02 加；2026-10-04 与**远端地址合并成一行**，
             * 于是原来那个只剩这一个按钮的「操作」一节连同它的标题一起删了 ——
             * 那一节占一张卡片加一行标题，而这一页正在减少卡片数）。
             *
             * 面板本身早就有三个入口（命令面板 / 侧栏图标 / 状态栏那一条），
             * 唯独**正在配置它的这一页**没有 —— 而那正是用户会想「让我看一眼现在什么
             * 状态」的地方。合并后说明文字改挂按钮的 tooltip（那一行放不下两段描述）。
             */
            /** 按钮文字与「打开图片管理」同形：命令名去掉 `SyncHub：` 前缀。 */
            openView: "打开仓库同步面板",
            openViewDesc:
                "改动列表、提交、拉取、推送都在这个面板里 —— 侧栏的图标与底部状态栏" +
                "点开的都是同一个面板，「SyncHub：打开仓库同步面板」那条命令也是它。",
            /**
             * 注意事项：放在这一页最上方（标题正下方），而不是塞进各设置项的描述里。
             *
             * 这两条都是**组合条件**才踩得到的坑（策略选「重置」+ 开着定时同步；
             * 多设备同时编辑同一个文件），写进单项描述没人读得到 ——
             * 用户是在配好之后才出问题，那时早就不翻设置了。
             *
             * 第一条与 `Automatics.start()` 里的挂起逻辑是一件事的两面，必须一起改：
             * 只改文案会变成「说了会暂停其实没暂停」，只改逻辑则用户不知道发生了什么。
             */
            notesHeading: "注意事项",
            notes: [
                "拉取整合策略选「重置」时，定时同步的每一轮都是「提交 → 拉取 → 推送」，" +
                    "而重置会把刚提交的内容丢掉。所以选它时定时同步会被暂停，" +
                    "改回「合并」或「变基」后自动恢复。",
                "同一篇笔记在另一台设备上刚改过、这边又正在编辑时，自动拉取可能覆盖你手上的改动。" +
                    "多设备同时编辑同一个文件时，建议先关掉定时同步。",
            ],
            commitMessage: "提交信息模板",
            commitMessageDesc: "支持 {{date}}、{{hostname}}、{{numFiles}}、{{files}} 变量。",
            strategy: "拉取整合策略",
            strategyDesc:
                "拉取时如何处理本地与远端的历史分歧。merge 保留双方并产生合并提交；rebase 把本地提交放到远端之后；reset 放弃本地提交、完全以远端为准。",
            strategyMerge: "合并（保留双方历史）",
            strategyRebase: "变基（历史线性）",
            strategyReset: "重置（以远端为准，丢弃本地提交）",
            /**
             * 「初始化 git 仓库」那一行（2026-10-05）。
             *
             * 用户把远端地址搬进设置页之后，初始化还留在侧边栏面板里 ——
             * 「保证仓库同步的基本设置能全部在设置页中就完成」。
             *
             * 两句都要说清：**什么时候需要点它**（库还不是 git 仓库），以及
             * **顺手做了什么**（建一份默认 `.gitignore`，而且已有的绝不覆盖 ——
             * 用户会担心这一点，因为那句话听起来像「插件要动我的文件」）。
             */
            initRepo: "初始化 git 仓库",
            initRepoDesc:
                "在当前库根目录建一个 git 仓库（`git init`）。库还不是仓库时才需要点它；" +
                "顺手会建一份默认的 .gitignore（已经有一份的话绝不会被覆盖），" +
                "免得 workspace.json 被同步出去、在多设备上反复冲突。",
            /** 状态徽标：已经是仓库（按钮会置灰 —— `git init` 幂等，点了什么都不会发生）。 */
            initDone: "已是 git 仓库",
            initNeeded: "还不是 git 仓库",
            initRunning: "正在初始化…",
            gitPath: "git 可执行文件路径",
            gitPathDesc: "留空使用系统 PATH 中的 git。Windows 上 git 不在 PATH 时才需要填写。",
            /**
             * 「git 从哪儿来」（2026-10-02 加）。
             *
             * 缺 git 是这个功能**很常见的第一道坎**（Windows 上尤其：便携版 Node 环境
             * 往往不带 git），而插件不捆绑它。原来只在找不到时报一句「请在设置中指定
             * 路径」—— 那条只说了「填路径」，没说「去哪儿弄一个」。
             *
             * 这句话单独占一行、后面跟一个**可点的**链接（`gitPathLink`，见
             * `settingsTab` 里那段 DOM 组装）：设置页的正文是纯文本，光写
             * `git-scm.com` 用户得自己复制到浏览器。
             */
            gitPathDownload: "SyncHub 不捆绑 git。还没装的话去官方下载页装一个：",
            /** 下载链接的文字（网址本身不翻译）。 */
            gitPathLink: "git-scm.com",
            /**
             * `gitPath` 旁边的「浏览…」（2026-10-02 加）。
             *
             * 走系统文件对话框（`core/desktopFileDialog.ts`）—— Obsidian 的公开 API
             * 里没有这一项，只能借它自己在用的 `electron.remote.dialog`。桌面端之外
             * 那个按钮点了不会有反应，所以**旁边始终留着可以手输的输入框**。
             */
            gitPathBrowse: "浏览…",
            gitPathBrowseTitle: "选择 git 可执行文件",
            /** 过滤器里的「所有文件」那一项 —— 非 Windows 上 git 的可执行文件没有扩展名。 */
            gitPathBrowseAllFiles: "所有文件",

            /**
             * `.gitignore` 一节。
             *
             * 为什么把它放在设置页而不是只留一条「打开文件」的命令：`.gitignore`
             * 是**同步行为的一部分**（它决定哪些文件根本不会进版本控制），
             * 而命令面板只有已经知道有这个功能的人才找得到。更重要的是，
             * 在这里能**看见当前内容**——`workspace.json` 是不是被排除了，
             * 是用户配好之后最想确认的一件事。
             */
            gitignoreHeading: "忽略规则（.gitignore）",
            gitignoreDesc:
                "一行一条规则，`#` 开头是注释。这里的改动直接写进库根目录的 .gitignore，" +
                "不需要另开编辑器 —— 想用 Obsidian 的编辑器改，点下面的「在编辑器中打开」。",
            gitignoreMissing: "尚未创建",
            gitignoreDirty: "有未保存的修改",
            gitignoreSaved: "已保存",
            gitignoreSave: "保存",
            gitignoreSaving: "正在保存…",
            gitignoreRestore: "填入默认内容",

            /**
             * 「补齐推荐的忽略规则」。
             *
             * 与上面那个「填入默认内容」的区别必须让用户看得懂：那个是**覆盖式**的
             * （自己写的规则会没），这个是**只补缺的**。desc 里点明这一点。
             */
            recommended: {
                name: "补齐推荐的忽略规则",
                desc: "把字体、Office 临时文件等几类「大且不变」的规则并进上面的 .gitignore。只追加缺的那些，你自己写的规则一行都不动。",
                action: "补齐",
                noneAdded: "推荐的规则都已经在 .gitignore 里了，没有需要补的。",
                added: (count: number, groups: string) => `已补 ${count} 条规则（${groups}）。`,
                /** 规则分组的显示名。键与 `RecommendedGroupId` 一一对应。 */
                groups: {
                    font: "字体文件",
                    officeTemp: "Office 临时文件",
                    pluginFolder: "插件目录",
                },
            },
            /**
             * 提交前的大文件检查。
             *
             * desc 必须写清「为什么这一步来得及、而事后不行」—— 用户不理解为什
             * 么要拦，第一反应就是把它关掉。
             */
            largeFileThreshold: {
                name: "大文件阈值",
                desc: "提交时超过这个大小的文件会被拦下问一句。设为 0 可关闭。git 的历史不可逆 —— 事后清理要重写全部提交，所以这是唯一来得及的时机。",
            },
            ignorePluginFolder: {
                name: "忽略插件目录",
                desc: "把整个插件目录也加进推荐规则。插件是仓库体积最大的单一来源，但忽略之后换设备 clone 时插件不会自动就位，需要重新安装。",
            },
            /**
             * 「清理」一节（2026-10-09）。
             *
             * 三行按**风险递增**排：体检只是看、回收只清不可达对象、丢弃备份不可逆。
             * desc 里必须把代价写出来 —— 尤其最后一条，它删掉的是重写后的唯一退路。
             */
            cleanupHeading: "清理",
            cleanup: {
                checkName: "体检仓库历史",
                checkDesc:
                    "看看历史里到底被什么占了空间（按目录汇总）。只读，不动任何东西。清历史之前先看这一步 —— 460 MB 的仓库里，笔记本身常常只占几十 MB。",
                checkAction: "开始体检",
                gcName: "回收空间",
                gcDesc:
                    "清掉不可达的对象（悬空的、被删分支留下的）。安全，但常常回收不到东西 —— 大文件基本都在可达历史里，那种情况只有重写才能清掉。",
                gcAction: "回收",
                discardName: "丢弃备份并回收",
                discardDesc:
                    "重写历史后会留下备份（那是你唯一能回到旧历史的退路）。丢弃备份并回收，才能把旧对象真正删掉、把空间放出来。这一步不可逆。",
                discardDescNone:
                    "目前没有备份 —— 只有做过「深度清理」之后才会有。",
                discardAction: "丢弃",
            },
            gitignoreOpen: "在编辑器中打开",
            gitignoreSavedNotice: "已保存 .gitignore。",
            /**
             * 保存失败要说清「磁盘上还是旧内容」——
             * 用户以为自己改了，而 git 那边一点没变。
             */
            gitignoreSaveFailed: "保存 .gitignore 失败，磁盘上仍是原来的内容。",
            /**
             * 「让 git 不再跟踪图片」（2026-10-02）。
             *
             * 用户的原话是「我希望仓库同步不同步仓库里的图片，因为图片已经交给图片同步干了」。
             * 它落在**仓库同步页的 `.gitignore` 一节**里：改的就是那个文件，而这一页才是
             * 用户排查「什么东西进了 git」的地方（图片同步页那条注意事项会指过来）。
             *
             * 描述里必须先说清「为什么不能只加一行 .gitignore」—— 那正是这个动作存在的
             * 理由，也是用户最容易误解的一点：`.gitignore` 对已跟踪的文件毫无作用。
             */
            untrack: {
                name: "让 git 不再跟踪图片",
                desc:
                    "把「需要图片同步的文件夹」加进 .gitignore，并让 git 忘掉已经提交过的" +
                    "那些图片（本地文件一个都不动）。只加 .gitignore 是不够的：它只管未跟踪的" +
                    "新文件，已跟踪的照旧每次提交都带着。改完记得同步一次。",
                action: "停止跟踪",
                checking: "正在确认这些图片都已同步到 R2…",
                needFolders:
                    "先到「图片同步」设置页指定具体的图片文件夹（不能是整个库）—— " +
                    "「整个库」等于让 git 什么都不同步。",
                needCloud:
                    "「图片同步」还没配好（缺 R2 账号 / 桶 / 密钥）。图片从 git 里摘出去之后" +
                    "只剩 R2 这一份 —— 先把它配好并同步一次。",
                notUploaded:
                    "还有 {count} 张图片没有同步到 R2。先把它们传上去（点「立即同步」），" +
                    "再回来做这一步 —— 别的设备拉取之后要靠云端把本地那份补回来。",
                done: "已加 {rules} 条忽略规则、停止跟踪 {files} 个文件；点「立即同步」把这次改动提交上去。",
                nothing: "这些图片本来就没在 git 里跟踪，忽略规则也已经有了。",
                failed: "没能完成「停止跟踪图片」，仓库状态可能只改了一半，请看下面的 .gitignore 内容。",
                modal: {
                    title: "让 git 不再跟踪图片",
                    intro:
                        "图片已经由「图片同步」送到 Cloudflare R2，这一步让它们退出 git —— " +
                        "接下来会发生三件事：",
                    steps: [
                        "把规则写进 .gitignore（只追加缺的那些）。新图片从此不再进 git。",
                        "把命中的已跟踪文件从 git 的索引里摘掉（git rm -r --cached）：本地文件一个都不动，但下次提交会记下一条「删除」。",
                        "下一次同步（提交 → 拉取 → 推送）会把这条改动推到远端。",
                    ],
                    /**
                     * 规则形状（2026-10-02 加）。
                     *
                     * 用户问过「.gitignore 只能写文件夹吗？不能写图片格式吗」—— 能写，
                     * 而且两种形状各有各的**前提**，所以这里让他选，并把前提写在选项旁边。
                     */
                    modeLabel: "按什么写规则",
                    modeDesc:
                        "两者管的范围不一样，选错了会漏掉东西 —— 选之前先看下面那句话。",
                    modeFolders: "按文件夹（图片同步的那几个）",
                    modeExtensions: "按扩展名（全库的图片）",
                    foldersLabel: "要停止跟踪的文件夹",
                    foldersNote:
                        "范围与「图片同步」镜像的文件夹完全重合 —— 那些文件夹里的东西本来就归" +
                        "图片同步管（图片、以及里面的其他文件）。",
                    extensionsLabel: "要忽略的图片格式",
                    extensionsNote:
                        "只忽略这些格式的图片，别的文件照旧进 git。前提：图片同步的范围必须" +
                        "覆盖这些图片（一般是「整个库」）—— 否则文件夹之外的图片会同时退出 git " +
                        "和 R2，两边都不管。",
                    warningHeading: "做之前请知道两件事",
                    warningOthers:
                        "别的设备拉取这次改动时，那些图片的本地文件会被 git 删掉 —— 随后由" +
                        "「图片同步」从 R2 补回来。所以：那些设备也要配好图片同步，而这次操作前" +
                        "要确认这些图片都已经在 R2 上（这一步会替你检查）。",
                    warningHistory:
                        "已经写进历史的图片不会消失：git 只是不再跟踪它们，.git 里的旧对象还在，" +
                        "仓库体积不会因此变小（那要在设置页「清理」里做一次深度清理）。",
                    cancel: "取消",
                    confirm: "继续",
                },
            },

        },

        /**
         * 「图片同步」页（R2 双副本）。
         *
         * 这一页的注意事项比「仓库同步」页更要紧：那页的坑是「数据可能丢」，
         * 这页的坑是「文件可能**被删掉**」。所以三条注意事项必须留在最上方。
         */
        images: {
            // 页首标题 2026-10-06 删了（页签「图片同步」就是页名）。
            notesHeading: "注意事项",
            notes: [
                "同步只复制、从不删除：每一轮把两边缺的补上（云端多了就下载、本地多了就上传），" +
                    "一个文件都不会删。删除只由你主动发起 —— 见下面这条。",
                "在本机删掉一张同步范围内的图片时，插件会问一句「云端那份也删吗」。删掉不可逆" +
                    "（R2 没有回收站）；选「保留」会记一笔，下一轮同步不会把它下载回来。" +
                    "这个询问可以在「冲突与删除」一节里改成「永远同步云端」或「永不同步云端」。",
                "需要图片同步的文件夹里的图片通常同时也在 git 仓库里，两条链路各管各的：git 管版本历史，" +
                    "R2 管「图片不占仓库体积、且能被外链引用」。想让它们不再进 git：到「仓库同步 → " +
                    ".gitignore」一节点「停止跟踪」—— 它会加忽略规则，并让 git 忘掉已经提交过的那些" +
                    "（本地文件一个都不动）。SyncHub 不会自己去改 .gitignore。",
                "在手机上它同样会跑（Obsidian 不提供「仅 Wi-Fi」这种设置）：蜂窝网络下往库里放图，" +
                    "会立刻走流量。介意的话把「变动后自动同步」关掉 —— 那样新图只会在下一轮周期、" +
                    "启动时、或你点「立即同步」时才上传。",
            ],
            /**
             * 这一行是**总开关**，但它管的不只是「自动同步」：启动那一条、改名时
             * 云端换键、删本地时问不问「云端那份也删吗」，都归它。
             *
             * 2026-10-02 从「启用图片同步」改名而来。旧名字听起来像「图片同步的
             * 总开关」，于是用户会以为「间隔设为 0」就等于「图片同步关着」——
             * 而实测（用户问过）**启动仍会同步一轮**。新名字点明它管的是
             * 「自动」，并把这层关系写进两行的描述里。
             */
            enabled: "自动同步图片",
            enabledDesc:
                "允许 SyncHub 在启动时跑一轮、按下面的周期跑；改名或删除图片时，" +
                "云端那一份也当场跟着处理（改名换键，删除按「冲突与删除」里选的策略问或删）。" +
                "关掉后这些后台动作全部停止（连「云端那份也删吗」也不再问）；" +
                "「立即同步」仍然可用（那是你主动发起的）。",
            folders: "需要图片同步的文件夹",
            foldersDesc:
                "只处理这些文件夹里的图片，删除也只发生在它们里面 —— 这是插件能碰哪些文件的" +
                "唯一边界。在下面的框里输入库内相对路径（例如 attachments）后按回车加入，" +
                "输入过程中会给候选；「浏览…」从库里挑，「恢复默认」回到仓库根目录（整个库，" +
                "填 . 也表示整个库）。已加入的列在下面，右侧的垃圾桶可以移除。",
            foldersPlaceholder: "attachments",
            foldersEmpty:
                "一个文件夹都没指定，所以同步不会执行。填一个（例如 attachments）、" +
                "用「浏览…」从库里挑，或按「恢复默认」回到仓库根目录，再点「立即同步」。",
            foldersBrowse: "浏览…",
            /** 已加入文件夹那一行的删除按钮（图标按钮，只有提示文字）。 */
            foldersRemove: "移除",
            foldersReset: "恢复默认",
            folderPickerPlaceholder: "搜索文件夹…",
            folderPickerRoot: "仓库根目录（整个库）",
            folderPickerIncluded: "已在同步范围",

            connectionHeading: "Cloudflare R2 连接",
            accountId: "R2 账号 ID",
            accountIdDesc:
                "Cloudflare 控制台 R2 概览页上的账号 ID。填 ID 即可（会自动补上 .r2.cloudflarestorage.com），" +
                "也可以直接填完整的存储端点地址。",
            accountIdPlaceholder: "例如 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
            bucket: "存储桶名称",
            bucketDesc:
                "图片存进哪个桶。前缀之外的对象不会被碰，但用一个专用桶最省心。",
            accessKeyId: "Access Key ID",
            accessKeyIdDesc:
                "在 R2 的「管理 API 令牌」里创建，权限至少要有「对象读与写」。这个值不是秘密，" +
                "会随配置一起同步到别的设备。",
            secretKey: "Secret Access Key",
            secretKeyDesc:
                "创建令牌时只显示一次的那一串。它只保存在本机（系统密钥库），" +
                "不会写进 data.json，也不会随仓库同步。",
            secretPlaceholder: "粘贴密钥…",
            secretSave: "保存密钥",
            secretClear: "清除密钥",
            secretSaved: "R2 密钥已保存",
            secretCleared: "R2 密钥已清除",
            secretConfigured: "已配置",
            secretNotConfigured: "未配置",
            prefix: "云端前缀",
            prefixDesc:
                "对象键的前缀（例如 images）。留空表示直接放在桶根。它只影响「放在哪儿」，" +
                "改它不会让同步状态失效。",
            publicBaseUrl: "公网访问地址",
            publicBaseUrlDesc:
                "自定义域名或 r2.dev 域名，用来生成图片的外链。留空则「复制云端链接」不可用 —— " +
                "存储端点每次读取都要签名，粘到笔记里必然打不开，所以这里不猜。",

            conflictHeading: "冲突与删除",
            conflictPolicy: "两边都被修改时",
            conflictPolicyDesc:
                "同一个文件在本地和云端都变了。图片没法自动合并，只能选一边作为结果。",
            conflictNewer: "谁新听谁的（比较修改时间）",
            conflictLocal: "以本地为准",
            conflictRemote: "以云端为准",
            deleteRemotePolicy: "删除本地图片时，询问是否同时删除云端备份",
            /**
             * 三个选项各自的后果都要说清 —— 这是一个下拉，用户看的是当前值，
             * 另外两个值会发生什么他并不知道。其中「永不同步云端」那一半尤其
             * 要写：不写的话用户会发现删掉的图下一轮又回来了（镜像逻辑会把它
             * 从云端补回本地），而那看起来像 bug。
             */
            deleteRemotePolicyDesc:
                "在库里删掉一张图片、而云端还有它的备份时怎么办：「询问用户」弹一次窗；" +
                "「永远同步云端」直接连云端一起删（R2 没有回收站，删掉不可逆）；" +
                "「永不同步云端」则云端永远不动 —— 但那一份会被下一次同步下载回本地" +
                "（镜像是双向补齐的）。",
            deleteRemoteAsk: "询问用户",
            deleteRemoteAlways: "永远同步云端",
            deleteRemoteNever: "永不同步云端",
            /**
             * 「变动后自动同步」这一行：**数字 + 单位 + 开关**（2026-10-06 加）。
             *
             * 它与下面「按周期同步」是两件事，描述里必须把区别说清 ——
             * 否则用户会问「我不是已经开了周期吗，为什么还要这个」：
             *
             * - 这一条管**本机**：你动了图之后跑一次；
             * - 下面那条管**别处**：另一台设备传的、或桶里被手工改的，
             *   本机看不见任何事件，只能主动去问。
             *
             * 「停手 N 秒」是用户能感知的行为，所以写在描述里；那个数字是框里的值。
             */
            changeSync: "变动后自动同步",
            changeSyncDesc:
                "在受管文件夹里新增或改动了图片之后，停手 N 秒（5–600）就自动同步一次。" +
                "一次编辑会话（拖进一批图、批量压缩）会被合并成一轮，也不会在你还在写文件的时候开始。" +
                "它只管本机上的改动；其他设备上的变化要靠下面「按周期同步」去拉回来。" +
                "关掉它之后，新图和改过的图要等下一轮周期（或点「立即同步」）才会上传。",
            /** 延时框的无障碍标签（框旁边没有自己的文字说明）。 */
            changeSyncDelayAria: "变动后自动同步的延迟（秒）",
            /**
             * 「按周期同步」这一行：**数字 + 单位 + 开关**（2026-10-02 第二次改）。
             *
             * 上一次（同一天早些时候）只是把它从「设 0 表示关闭」改成「设 0 表示不按
             * 周期跑」；用户接着问「最小值设成 5 是不是更合适」—— 0 一旦收紧就得有
             * 别的东西表达「关」，于是拆出 `autoSyncEnabled`：**数字里不再有 0 的
             * 含义**，范围 5–1440。
             *
             * 名字也从「自动同步间隔（分钟）」改成「按周期同步」：单位由框后面那个
             * span 承担，而这一行现在既有开关又有周期，一个叫「间隔」的名字罩不住
             * 那个开关。
             *
             * 2026-10-06 起它的**职责变了**（本机改动交给上面那一项），所以描述也
             * 重写了 —— 原文案里那句「新加或修改的图片不会立刻上传，要等下一轮」
             * 已经不再成立。
             */
            autoSync: "按周期同步",
            autoSyncDesc:
                "每 N 分钟（5–1440）去云端核对一次，把其他设备上的改动拉回来" +
                "（另一台设备传的图、或云端被手工改动的对象）—— 本机的改动由上面那一项负责。" +
                "关掉它只停掉周期；上面的总开关开着时，启动仍会同步一轮。" +
                "同步不会删除任何文件。",
            /** 单位跟在周期框后面（`<input> 分钟 <开关>`），与「仓库同步」页同一形状。 */
            minutesUnit: "分钟",
            /** 单位跟在变动同步的延时框后面（`<input> 秒 <开关>`）。 */
            secondsUnit: "秒",
            /** 周期框的无障碍标签（框旁边没有自己的文字说明）。 */
            intervalAria: "按周期同步的间隔（分钟，5–1440）",

            compressHeading: "裁剪与压缩的默认值",
            compressQuality: "默认质量",
            compressQualityDesc:
                "有损格式（JPEG / WebP）的默认质量，10–100。PNG 是无损的，用不到它。",
            compressMaxEdge: "默认最长边（像素）",
            compressMaxEdgeDesc:
                "裁剪压缩弹窗里默认的缩放上限。0 表示不缩放。只缩不放 —— 放大小图只会更模糊、更大。",
            compressFormat: "默认输出格式",
            compressFormatDesc:
                "「保持原样」不等于「不压缩」：原格式是 JPEG 时照样按质量重编码，只是不换容器。",

            actionsHeading: "操作",
            test: "测试连接",
            testing: "正在测试…",
            testOk: (bucket: string) => `连接正常，可以访问存储桶 ${bucket}。`,
            testFailed: "连接测试失败",
            preview: "预览变更",
            previewing: "正在比对…",
            syncNow: "立即同步",
            syncing: "正在同步…",
            /**
             * 图片管理面板的入口。
             *
             * 放在设置页是因为它是**发现性**的落点：命令面板与侧栏图标在
             * 「我知道有这个东西」之后才有用，而设置页是用户排查时的必经之路。
             */
            openManager: "打开图片管理",
            openManagerDesc:
                "按「本地 / 云端 / 已链接」三种状态列出需要图片同步的文件夹里的所有图片，" +
                "可以筛选出失联图片、待上传的、只留在云端的，并批量同步、压缩、重命名或删除。",
        },
    },

    installer: {
        /**
         * 命令面板里的名字。
         *
         * 刻意与弹窗标题分开：弹窗标题不该带插件名前缀（用户已经在弹窗里了），
         * 但命令面板里**必须**带 —— Obsidian 用户是按插件名搜索命令的，
         * 一串没有前缀的「添加插件仓库 / 检查全部更新」在面板里根本找不着。
         */
        cmdAddRepo: "SyncHub：添加插件仓库",
        /**
         * 「添加主题仓库」那条命令（2026-10-05）。
         *
         * 与 `cmdAddRepo` 同一套前缀规矩（见上面那段注释）：命令面板里必须能按
         * 插件名搜到。
         */
        cmdAddTheme: "SyncHub：添加主题仓库",
        cmdBindExisting: "SyncHub：绑定库里已安装的插件与主题",
        cmdCheckUpdates: "SyncHub：检查插件与主题更新",
        cmdUpdateAll: "SyncHub：更新全部插件与主题",

        /**
         * 两种被跟踪对象的称呼。
         *
         * 它们出现在徽标、错误文案与列表说明里，必须是「可拼进句子」的名词
         * （例如「写入主题「Minimal」失败」）—— 错误文案按 kind 取词，见
         * `installer/errors.ts` 的 ofKind。
         */
        kindPlugin: "插件",
        kindTheme: "主题",

        modalTitle: "添加插件仓库",
        /**
         * 主题那半边的弹窗文案（2026-10-05）。
         *
         * `themeRepoDesc` 必须点明两件用户想不到的事：主题会落到 `themes/` 下，
         * 而且**装完要自己去「外观」里选**（SyncHub 不替用户切换主题 —— 见
         * `InstallerService.installTheme` 的第 4 条）。少说第二句，用户会以为
         * 「装完没生效」。
         */
        themeModalTitle: "添加主题仓库",
        themeRepoDesc:
            "填写 owner/repo 简写，或粘贴完整的主题仓库链接（仓库里要有 manifest.json 与 theme.css）。" +
            "SyncHub 不会替你切换主题：装好后到「设置 → 外观 → 主题」里选它。",
        addTheme: "添加主题仓库",
        themeResolved: (name: string, version: string) => `主题：${name} ${version}`,
        themeInstall: "安装主题",
        /** 装完那一句。弹窗里提示一次、成功提示里再带一次（两处都要说，别只留一处）。 */
        themeAfterInstallHint:
            "装好了到「设置 → 外观 → 主题」里选它 —— SyncHub 不会替你切换主题。",
        /**
         * 入口选错时的两句提示 + 两个换入口的按钮（2026-10-05）。
         *
         * 用户报的原话是「添加插件按钮填写的是主题地址，会因为缺少 main.js 而不通过」。
         * 光说「缺少必需文件」等于把用户留在原地，所以这里要**说出看到了什么**
         * （有 theme.css、没有 main.js）并给出下一步。
         */
        looksLikeTheme: "这个仓库里是主题（有 theme.css、没有 main.js），不是插件。",
        looksLikePlugin: "这个仓库里是插件（有 main.js、没有 theme.css），不是主题。",
        switchToTheme: "改为按主题安装",
        switchToPlugin: "改为按插件安装",
        repoLabel: "仓库地址",
        repoDesc: "填写 owner/repo 简写，或粘贴完整的 GitHub / Gitee 仓库链接。",
        repoPlaceholder: "例如：Dyse-Sofqi/SyncHub 或 https://gitee.com/owner/repo",
        resolve: "识别",
        resolving: "正在识别…",
        resolved: (host: string, repo: string) => `已识别为 ${host} 上的 ${repo}`,
        versionLabel: "安装版本",
        versionLatest: "最新版本",
        versionListFailed: "无法获取版本列表，将按最新版本安装。",

        /**
         * 「版本管理」—— 已跟踪插件行上的按钮（**只有插件有**，主题没有版本钉选）。
         *
         * 这几条要交代清楚三件事，缺一件用户就会踩坑：选旧版本是**回退**、
         * 选「最新版本」是**解开钉住的选择**、以及这个选择会被记住
         * （在版本管理里再打开它，默认选中的就是这一版）。
         */
        versionManage: "版本管理（可回退到指定版本）",
        versionManageTitle: "选择版本",
        versionManageDesc:
            "切换到这个插件的另一个发布版本：选旧版本即为回退。选「最新版本」则恢复跟随最新发布。",
        versionInstalled: (version: string) => `当前安装：${version}`,
        /** 读不到 manifest 里的版本时（手工装的目录）—— 不写「当前安装：」，那后面空着像坏了。 */
        versionInstalledUnknown: "当前安装：版本未知",
        /** 标在**磁盘上装的那一版**后面（`1.2.3 · 当前`），否则一串 tag 里认不出自己在哪。 */
        versionCurrent: "当前",
        versionLoading: "正在获取版本列表…",
        /** 「一个 release 都没发」与「这次没拉到」是两件事，文案也必须分开。 */
        versionNoneAvailable: "这个仓库没有发布任何版本（只能从源码安装），没有可切换的版本。",
        versionFetchFailed: "无法获取版本列表。",
        versionApply: "切换到此版本",
        versionSwitched: (name: string, version: string, source: string) =>
            `已把 ${name} 切换到 ${version}（来源：${source}）`,
        /**
         * 列表上的「已固定」徽标。
         *
         * 这个状态只在 `data.json` 里（`requestedVersion`），而它的后果是
         * 「在版本管理里点一下就会装回这一版」—— 不显示出来，用户看到旧版本号
         * 会分不清是自己选的还是更新失败留下的。
         */
        versionPinned: (version: string) => `已固定 ${version}`,

        /**
         * 「下载来源」一节（版本管理弹窗里）。
         *
         * 为什么把来源与版本放在同一个弹窗：用户心里这是同一件事 ——
         * 「我选了 1.0.2，但它不走 Gitee，我也找不到选 Gitee 的地方」。
         */
        versionSourceLabel: "下载来源",
        versionSourceCurrent: (host: string, repo: string) => `当前下载走：${host} · ${repo}`,
        /** 走了镜像时才有：记录里留着的那个「家」。 */
        versionSourceOrigin: (host: string, repo: string) => `源仓库：${host} · ${repo}`,
        /** 同理：地址与前缀分开，地址要能点开去核对。 */
        versionMirrorFoundPrefix: "发现疑似镜像：",
        /**
         * 探不到镜像时的解释。**必须有**：自动探测只猜两个候选，镜像挂在第三个
         * 地方（作者自己的 Gitee 账号）时永远猜不到 —— 不解释的话，用户会把这句
         * 读成「这个插件没有镜像」。
         */
        versionMirrorNone:
            "没发现镜像。自动探测只会猜两个候选：同名仓库，以及你 Gitee 账号下的同名仓库" +
            "（后者需要先填 Gitee 令牌）。镜像挂在别的账号下时，在下面手填地址即可。",
        versionUseMirror: (host: string) => `改用 ${host} 镜像`,
        versionManualLabel: "手填镜像地址",
        versionManualDesc:
            "例如 sofqi/Trefoil，或粘贴完整链接。地址里的插件 id 必须与这一项一致，否则拒绝采用。",
        versionManualPlaceholder: "例如 sofqi/Trefoil",
        versionManualApply: "改用这个地址",
        versionManualChecking: "正在核对地址…",
        versionMirrorFailed: "改用这个镜像失败",
        enableAfterInstall: "安装后立即启用",
        install: "安装",
        installing: "正在安装…",
        installFailed: "安装失败",
        installed: (name: string, version: string, source: string) =>
            `已安装 ${name} ${version}（来源：${source}）`,
        /**
         * 主题装好那一句（2026-10-05）。
         *
         * 报的是**目录名**而不是 manifest 的 `name`：用户在「外观」里看到的、
         * 要去找的就是目录名，而 `installTheme` 落盘用的也是它（两者通常相同，
         * 名字不能当目录名时才会分叉）。重装（目录本来就在）走上面那条通用的
         * `updated` —— 「已更新」比「已安装」更准。
         */
        themeInstalled: (id: string, version: string, source: string) =>
            `已安装主题 ${id} ${version}（来源：${source}）`,
        /**
         * 完成提示里的 `source` 由 `features/installer/downloadSource.ts` 拼好
         * （平台名，或命中镜像时的「Gitee 镜像」）。
         *
         * 每次都报：用户看不出「没走镜像」与「没探测镜像」的区别（跟踪列表里
         * 那行镜像文案只在命中时才出现），提示是唯一能确认「东西实际从哪来」的地方。
         */
        updated: (name: string, version: string, source: string) =>
            `已更新 ${name} 至 ${version}（来源：${source}）`,
        upToDate: (name: string) => `${name} 已是最新版本`,
        removed: (name: string) => `已取消绑定 ${name}，它的文件未被改动`,
        removeFailed: "取消绑定失败",
        sourceRaw: "来源：仓库源码文件",
        /**
         * 探测到疑似镜像、但**没有**采用时的那句提示。
         *
         * 旧文案是「发现 Gitee 镜像：…，将改用镜像源下载」——「将改用」已经不成立：
         * 现在采用要用户勾选/确认，所以这句话必须说清「检测到了什么」+「默认不用」，
         * 否则用户看到的和旧版一样，分不清「没探测到」与「探测到了但没用」。
         */
        mirrorUnused: (host: string, repo: string) =>
            `发现疑似 ${host} 镜像：${repo}。默认不使用它，要改用请勾选上面的开关。`,
        /** 完成提示里报镜像来源时用（与 `mirrorLine` 的「镜像」同一层意思）。 */
        mirrorSource: (host: string) => `${host} 镜像`,
        /**
         * 跟踪列表里镜像那一行（紧跟在源仓库下面）。
         *
         * 必须点明「下载使用此源」：只写「Gitee 镜像」的话，用户看到上面一行是
         * GitHub、下面一行是 Gitee，无从判断 SyncHub 到底在跟谁说话。
         */
        mirrorLine: (host: string, repo: string) => `${host} 镜像 · ${repo} · 下载使用此源`,
        /**
         * 疑似镜像的**确认**流程文案。
         *
         * 镜像发现从不自动采用一个镜像，只提出候选，由用户在这些文案所在的界面上
         * 拍板 —— 所以 `mirrorWarn*` 那几条不是客套话，是让用户能判断该不该绑的
         * 全部依据（判据只有「两边 manifest 的 id 相同」，那只证明是同一个插件）。
         */
        /**
         * 记录与磁盘不一致时的校正提示，以及「同一个 id 有几个目录」的警告。
         *
         * 这两条都来自实测的一个坑：`plugins/` 里多出一份同 id 的残留备份，
         * Obsidian 重启后加载了那份旧版本，而记录里还写着新版本 —— 更新检查
         * 于是永远报「已是最新」，用户被卡住且看不出原因。
         */
        versionCorrected: (names: string) =>
            `检测到实际安装的版本与记录不一致，已按磁盘上的文件更正：${names}`,
        duplicateFolders: (name: string, count: number) =>
            `${name}：有 ${count} 个插件目录声明同一个 id，Obsidian 加载哪一个是不定的。` +
            `建议把多余的（通常是残留备份）移出插件目录后重启。`,
        mirrorSuggestionLine: (host: string, repo: string) =>
            `疑似 ${host} 镜像 · ${repo} · 尚未使用，待确认`,
        mirrorConfirmTitle: "确认镜像来源",
        mirrorConfirmDesc:
            "这一项现在跟的是下面的源仓库；另外发现了一个仓库，看起来是它的镜像。请确认是否改用镜像下载。",
        /**
         * 确认页里的两个地址：**前缀与地址分开**，因为地址要渲染成可点开的链接
         * （那一页存在的意义就是让用户去核对它们 —— 判据只有 `id` 相同）。
         */
        mirrorSourcePrefix: "源仓库（现在使用）：",
        mirrorCandidatePrefix,
        /** 拼好的整句：给「添加插件仓库」弹窗当设置行名用，确认页用上面那两个前缀。 */
        mirrorConfirmCandidate: (host: string, repo: string) =>
            `${mirrorCandidatePrefix}${host} · ${repo}`,
        mirrorWarnHeading: "确认前请自己核对这两个地址",
        mirrorWarnChecks:
            "判断镜像的依据只有一条：两边 manifest 的 id 相同。它只能说明「是同一个插件」，" +
            "不能证明是同一份代码、同一个作者，也不能保证它跟得上源仓库 —— fork、" +
            "或者别人用同一个 id 重新上传，都会通过这一条。",
        mirrorWarnRisk:
            "插件是能读写你整个库的代码。确认之后，下载与更新检查都会改走镜像；" +
            "如果镜像不是原作者维护的，你不只是在换个下载源，而是在换一个信任对象。",
        mirrorWarnHowTo:
            "核对方式：打开镜像仓库，看它的作者、主页或 README 是否指向源仓库；" +
            "两边的最新版本号也不该差太多。拿不准就别改 —— 保持现状不影响任何功能。",
        mirrorConfirmUse: (host: string) => `改用 ${host} 镜像`,
        mirrorConfirmKeep: "保持现状",
        mirrorConfirmTooltip: "确认镜像来源",
        mirrorConfirmed: (host: string, repo: string) =>
            `已改用 ${host} 镜像 ${repo}，下次更新从它下载`,
        mirrorDismissed: (repo: string) => `已忽略镜像提议 ${repo}`,
        /** 「添加插件仓库」弹窗里的镜像开关。默认不勾 —— 采用镜像必须由用户明示。 */
        mirrorToggleDesc:
            "勾选后改用它下载。判据只是两边 manifest 的 id 相同，不能证明是同一份代码 —— 确认这个地址可信再勾。",
        /**
         * 错误文案。
         *
         * 这些字符串以前是硬编码在逻辑层里的（manifest.ts / pluginFiles.ts /
         * pluginFolder.ts / installerService.ts），所以英文界面下会冒出中文。
         * 现在错误只携带类型码与参数，文案集中在这里。
         */
        errors: {
            manifestNotJson: (context: string) =>
                `${context} 的 manifest.json 不是合法的 JSON。`,
            manifestNotObject: (context: string) =>
                `${context} 的 manifest.json 不是一个对象。`,
            manifestMissingField: (context: string, field: string) =>
                `${context} 的 manifest.json 缺少必需字段「${field}」。`,
            manifestBadId: (context: string, id: string) =>
                `${context} 的插件 id「${id}」不合法（只允许小写字母、数字和连字符）。`,
            missingManifest: (repo: string, of: string) =>
                `${repo} 里找不到 manifest.json，它可能不是 Obsidian ${of}仓库。`,
            missingRequiredFiles: (repo: string, files: string, of: string) =>
                `${repo} 里找不到 ${files}，无法安装该${of}。`,
            /**
             * 「资产里挂着，但没下下来」—— 与上一条分开，因为下一步完全不同：
             * 上一条要做的是去问作者（或去看发布流程），这一条是检查自己的网络。
             * 分开的由来见 `installFiles.ts` 里 `assetNames` 的注释（实测踩过）。
             */
            assetDownloadFailed: (repo: string, files: string, of: string) =>
                `从 ${repo} 下载 ${files} 失败：${of}的 release 里确实挂着这个文件，` +
                `是这次没取回来（通常是网络问题，不是作者没上传 —— 它的资产 CDN ` +
                `在国内经常连不上）。检查网络后重试，或改用 Gitee 镜像。`,
            /**
             * 手填镜像地址时 id 不一致 —— 硬拦，不是提醒。
             * 说明里要写清「为什么不能装」：用户手填的地址看起来往往很像。
             */
            mirrorIdMismatch: (repo: string, expected: string, found: string) =>
                `${repo} 里的插件 id 是「${found}」，而这一项跟踪的是「${expected}」—— ` +
                `已拒绝改用，以免装错东西。请核对地址是否指到了同一个插件的镜像。`,
            missingBuildArtifacts:
                "如果这是源码仓库，作者可能没有把构建产物提交进仓库。",
            incompatibleApp: (name: string, minVersion: string) =>
                `${name} 需要 Obsidian ${minVersion} 或更高版本，当前版本过低，已中止安装。`,
            pluginIdConflict: (pluginId: string, repo: string) =>
                `插件 id「${pluginId}」已被另一个插件占用，无法安装 ${repo}。`,
            /**
             * 主题的同名冲突（2026-10-05）。
             *
             * 必须给出**两条**可走的路：这个目录被谁占着、以及怎么让开。只说
             * 「目录被占用」用户不知道该怎么办 —— 而覆盖是绝对不做的（被覆盖的
             * 可能正是他当前在用的那个主题，且它不在跟踪列表里，没有重新下载的路）。
             */
            themeNameConflict: (id: string, repo: string, existing: string) =>
                `主题目录「${id}」已经被另一个主题「${existing}」占用，无法用它来装 ${repo}。` +
                `请先移除或改名那个主题（SyncHub 不会覆盖别的主题）；若它就是你正在用的那个，` +
                `请在「绑定已安装的插件与主题」里改为跟踪它的来源，而不是重新装一份。`,
            themeNameInvalid: (repo: string, name: string) =>
                `${repo} 里的主题名「${name}」不能当目录名（见主题名规则），` +
                `而仓库名同样不合法，无法决定把它装到哪个目录。`,
            folderMissingRequired: (id: string, file: string, of: string) =>
                `${of}「${id}」缺少必需文件 ${file}，已中止写入。`,
            writeFailedRolledBack: (id: string, of: string) =>
                `写入${of}「${id}」失败，已还原到写入前的状态。`,
            writeFailedRollbackFailed: (id: string, of: string) =>
                `写入${of}「${id}」失败，且还原也失败。请手动检查它的目录。`,
            cannotEnablePlugin: "当前 Obsidian 版本不支持通过插件启用其他插件。",
            selfIdMismatch: (repo: string, id: string) =>
                `${repo} 里的插件 id 是「${id}」，不是 SyncHub 自己（ob-sync）—— 已中止更新，以免覆盖别的插件。`,
            selfUpdateDowngrade: (current: string, latest: string) =>
                `远端最新版本 ${latest} 比当前运行的 ${current} 旧，已中止 —— 「更新」不该把你降级。`,
            communityIndexFailed: (status: number) =>
                `拉取官方社区索引失败（HTTP ${status}）。该索引托管在 GitHub，网络不通时无法使用。`,
            rateLimitFallback: (host: string) =>
                `${host} 接口调用次数已达上限，已改用仓库源码文件安装。` +
                `在设置里填入访问令牌可以显著提高额度。`,
            apiUnavailableFallback: (host: string) =>
                `${host} 接口暂时不可用，已改用仓库源码文件安装。`,
            rateLimited: (host: string) => `${host} 接口调用次数已达上限。`,
        },

        browse: "浏览社区插件",
        communitySearchPlaceholder: "搜索插件名称、作者或描述…",
        communityLoadFailed: "无法加载社区插件列表",

        checkOne: "检查更新",
        /**
         * 顶部按钮行上那个「检查更新」（2026-10-05 用户要求：原来叫「检查全部更新」）。
         *
         * 与上面 `checkOne`（列表**每一行**的「检查更新」，只查那一项）文字相同、
         * 覆盖范围不同：这个查**全部**已跟踪项。刻意保留两个键 —— 它们的语义不同，
         * 合并成一个以后想区分就来不及了；按钮上的 `refresh-cw` 图标是它们的区别标识。
         */
        checkAll: "检查更新",
        updateAll: "更新全部",
        // 以下几条现在同时覆盖插件与主题 —— 用「项」而不是「个插件」，
        // 否则主题更新完会收到一句「已更新 1 个插件」。
        updatedMany: (count: number, names: string, source: string) =>
            `已更新 ${count} 项：${names}（来源：${source}）`,
        updateFailedMany: (count: number) => `${count} 项更新失败`,
        checkFailed: "更新检查失败",
        checking: "正在检查更新…",
        /**
         * 长耗时操作的进度提示（带旋转图标）。
         *
         * 文案必须点出**在做什么**：用户的原话是「不然我根本不知道你是不是在更新」，
         * 一句笼统的「加载中…」回答不了这个问题。
         */
        progressChecking: (name: string) => `${name}：正在检查更新…`,
        progressUpdating: (name: string) => `${name}：正在更新…`,
        progressFetching: (name: string, file: string) => `${name}：正在获取 ${file}…`,
        updateAvailable: (name: string, version: string) =>
            `${name} 有新版本 ${version}。`,
        updatesAvailable: (count: number, names: string) =>
            `有 ${count} 项可以更新：${names}`,
        checkNone: "所有插件与主题都是最新版本。",
        checkSummary: (outdated: number, failed: number) =>
            failed > 0
                ? `检查完成：${outdated} 个可更新，${failed} 个检查失败。`
                : `检查完成：${outdated} 个可更新。`,
        updateToLatest: "更新到最新版本",
        updateBadge: (version: string) => `可更新 → ${version}`,
        freeze: "冻结（不参与更新检查）",
        unfreeze: "取消冻结",
        frozen: "已冻结",
        openRepo: "在浏览器中打开仓库",
        /**
         * 取消跟踪。
         *
         * 措辞里**必须**带「不删除文件」：这个动作以前会递归删掉整个目录
         * （插件还先禁用），现在只把它移出跟踪列表（见 `InstallerService.unbind`）。
         * 不写清楚的话，用户会因为「移除 = 卸载」的惯性而不敢点，或者点完发现
         * 插件还在库里，以为功能坏了。
         */
        remove: "取消绑定（不删除文件）",

        /**
         * 「绑定已有插件或主题」。
         *
         * 2026-10-05 用户要求把顶部按钮上那句从「绑定已安装的插件与主题」改成这个。
         * **这一个键同时是按钮文字与弹窗标题**（与 `modalTitle` 同一个用法）——
         * 弹窗里要干的事就是它，两处用同一句话是刻意的。
         */
        bindTitle: "绑定已有插件或主题",
        bindDesc:
            "扫描当前库中已安装的插件与主题，通过官方社区索引自动识别来源仓库；勾选后加入跟踪列表，即可接收更新检查。不会改动任何文件，也不会切换你当前的主题。",
        bindScanning: "正在扫描已安装的插件与主题…",
        bindEmpty: "没有发现可绑定的新插件或主题 —— 可能都已跟踪，或库里还没有。",
        bindPluginsHeading: (count: number) => `检测到 ${count} 个可绑定的插件`,
        bindThemesHeading: (count: number) => `检测到 ${count} 个可绑定的主题`,
        bindSelectAll: "全选 / 取消全选",
        bindUnresolvedHeading: (count: number) =>
            `另有 ${count} 个插件来源未识别（不在官方社区索引中）：`,
        bindUnresolved: "来源未识别，请用「添加插件仓库」手动添加",
        bindUnresolvedThemesHeading: (count: number) =>
            `另有 ${count} 个主题来源未识别（不在官方社区索引中）：`,
        /**
         * 主题这半给了手填仓库的入口，插件那半没有 —— 这是刻意的**不对称**：
         * 插件有「添加插件仓库」这个兜底入口，主题在本次范围里没有新装路径，
         * 不手填的话未识别主题就永远纳不进跟踪。
         */
        bindUnresolvedTheme: "来源未识别：填写仓库地址即可绑定",
        bindRepoPlaceholder: "例如 owner/repo 或完整仓库链接",
        bindManualBind: "绑定",
        bindManualFailed: "绑定主题失败",
        bindConfirm: (count: number) => `绑定所选（${count}）`,
        bindLoadFailed: "扫描已安装的插件与主题失败",
        bindDone: (count: number) => `已绑定 ${count} 项，将纳入更新检查。`,

        /**
         * SyncHub 自身的更新。
         *
         * 「待重启」那句是这批文案里最要紧的：更新自己时**不重载自己**，
         * 磁盘上已经是新版本而运行中的还是旧的 —— 不写清楚，用户会以为
         * 已经用上新版了（所以这里也**不**清更新徽标，而是常驻这一行）。
         */
        selfNotChecked: (version: string) => `当前版本 ${version} · 尚未检查更新`,
        selfUpToDate: (version: string) => `SyncHub ${version} 已是最新版本`,
        selfUpdateAvailable: (current: string, latest: string) =>
            `有新版本 ${latest}（当前 ${current}）`,
        selfPendingRestart: (version: string) =>
            `已下载 ${version}，重启 Obsidian 后生效`,
        selfUpdating: "正在下载新版本…",
        selfUpdateDone: (version: string) =>
            `已下载 SyncHub ${version}，重启 Obsidian 后生效`,
        selfCheckFailed: (reason: string) => `检查 SyncHub 更新失败：${reason}`,
        selfUpdateFailed: "更新 SyncHub 失败",
        /**
         * 回退到官方仓库时的提示（2026-10-01）。
         *
         * 回退**必须说出来** —— 用户以为在走镜像、实际从官方拉，正是这个模块一直
         * 避免的「来源不明」。`from` 是失败那个来源的可读地址。
         */
        selfSourceFallback: (from: string) =>
            `自身更新来源 ${from} 不可用，已改用官方仓库（github.com/Dyse-Sofqi/SyncHub）重试。`,
        /** 状态行末尾那一句（提示条会消失，状态行不会）。 */
        selfCheckFellBack: (from: string) => `（${from} 不可用，本次已改用官方仓库）`,
    },

    sync: {
        /**
         * 侧边栏视图的名字（标签页标题）。
         *
         * 原来这里写的是「SyncHub」——于是视图标题、页内标题、以及**打开它的那条
         * 命令名**全都是「SyncHub」：命令面板里搜「同步」搜不到它，也没人知道
         * 它是个什么面板。改成与 README 一致的说法。
         *
         * 2026-09-19 又从「源码控制」改成「仓库同步」：面板里那个重复的页内标题
         * 删掉了，于是这个名字就是用户唯一看到的名字，而「源码控制」是 git 的
         * 说法、不是这个插件的 —— 它做的就是把笔记仓库同步到远端。
         */
        viewTitle: "仓库同步",
        statusPulling: "正在拉取…",
        statusPushing: "正在推送…",
        statusCommitting: "正在提交…",
        /**
         * 「立即同步」链路里的文案（2026-10-05）。
         *
         * 用户的原话是「点击立即同步时，只有左下角状态栏中才显示正在提交，
         * 不够显眼」。除了给那条目加一个转动的圆环（`styles.css` 的
         * `.obsync-status-bar-busy`），文案本身也得说清**这是链路里的哪一步**：
         * 点了「立即同步」却只看到「正在提交…」，用户会以为后面没有拉取与推送，
         * 看到它不动了就去再点一次 —— 实际整条链路还要跑一阵。
         *
         * `statusSyncing` 给侧边栏那条横幅当标题（三个阶段共用）。
         */
        statusSyncing: "正在同步…",
        statusChainCommitting: "正在同步：提交中…",
        statusChainPulling: "正在同步：拉取中…",
        statusChainPushing: "正在同步：推送中…",
        notARepo: "当前仓库尚未初始化 git。",
        /**
         * 找不到 git 时的那句话（2026-10-02 补齐）。
         *
         * 原来只有「请在设置中指定路径」—— 那只说了「填路径」，没说「去哪儿弄一个装」。
         * 而这正是缺 git 的人唯一需要知道的事。消息是 `Notice` 里的纯文本，放不了链接，
         * 所以网址直接写出来。
         */
        gitNotFound: "找不到 git 可执行文件。没装的话先装一个（git-scm.com），装了就在设置页填上它的完整路径。",
        /**
         * 面板首屏那句「正在读取仓库状态…」。
         *
         * 2026-10-01 与「首次渲染推迟」一起加的：Obsidian 恢复布局时会 await
         * `onOpen()`，在那里读状态要 10 个 git 子进程（见 `SourceControlView` 的
         * 类注释）—— 于是首屏先画工具条与这一句，内容随后自己长出来。
         * 没有它的话，面板会先空着几百毫秒，看起来像坏了。
         */
        loadingRepo: "正在读取仓库状态…",
        gitAuthFailed: "远端鉴权失败。请检查该平台的访问令牌是否有效、是否有所需权限。",
        /**
         * git 卡住被中止。
         *
         * 用户的原话是「尝试推送后一直看到正在推送」—— 那种「什么都不发生」
         * 必须被说出来，并告诉他下一步能做什么（这正是这个类型存在的理由）。
         */
        gitTimeout:
            "git 长时间没有任何响应，本次操作已中止。请检查网络（或代理）后重试；" +
            "若反复出现，可能是远端仓库过大或需要凭据 —— 后者请到设置页填写访问令牌。",
        /**
         * 连不上远端（2026-10-02 加）。
         *
         * 用户报的那条是 `getaddrinfo() thread failed to start` —— libcurl 连 DNS 解析
         * 线程都没起来。原样显示的话，用户分不清这是网络、代理、令牌还是插件的问题；
         * 这句话把方向钉在「网络与代理」上（不是令牌，也不是重装插件）。
         */
        gitNetworkFailed:
            "连不上远端（域名解析或连接失败）。请检查网络与代理 —— 若代理是靠环境变量" +
            "（HTTP_PROXY / HTTPS_PROXY）配置的，重启一次 Obsidian 让插件读到它；" +
            "也可以点「测试连接」看具体卡在哪一步。",
        /**
         * 定时同步**连续**失败到阈值时的那句提示（2026-10-02）。
         *
         * 单次失败只进日志（下一轮多半自愈），但持续失败不能一直沉默 ——
         * 用户不会天天翻控制台。`{count}` 是连续次数，`{reason}` 是归类后的原因。
         * 末尾那句「下一轮仍会自动重试」是要紧的：否则用户会以为自动同步已经死了。
         */
        autoSyncFailedMany: (count: number, reason: string) =>
            `定时同步已连续失败 ${count} 次：${reason}（下一轮仍会自动重试）`,
        /**
         * 与上一条**刻意分开**：令牌是好的，问题在插件填的用户名。
         * 并进上一条会把用户指去查令牌 —— 那是个没问题的东西。
         */
        gitCredentialUsernameRejected:
            "平台不接受凭据中的用户名，令牌本身是有效的。这是插件的配置错误（该平台只接受特定用户名），请把此提示反馈给插件作者。",
        pushRejected: "推送被远端拒绝。远端可能有你本地没有的提交，请先拉取再推送。",
        noUpstream: "当前分支没有跟踪的远端分支，无法拉取。请先设置上游分支或推送一次。",
        detachedHead: "当前处于游离 HEAD 状态（没有指向任何分支），无法推送。请先切换到一个分支。",
        nothingToCommit: "没有需要提交的更改。",
        /**
         * 用户主动点「推送」而本地没有新提交时说的话。
         *
         * **注意它不宣称「与远端一致」**：`ahead === 0` 只说明本地没有新提交，
         * 完全可能还落后远端（别人推过）。真正「完全一致」有专门的
         * `syncedInSync`（带 ✓ 的醒目提示）。
         */
        pushUpToDate: "没有需要推送的内容（本地没有新提交）。",
        /**
         * 同上，但工作区还有未提交的改动 —— 这才是最容易误会的那个状态：
         * 用户带着一堆改动点「推送」，等的是「我的改动上去了」，
         * 而推送**只发送已提交的内容**。
         */
        pushNeedsCommit: (count: number) =>
            `推送只发送已提交的内容，而你有 ${count} 个更改还没提交。` +
            `请先点「提交」（或「立即同步」）。`,
        /** 推送成功，但工作区还有未提交的改动。 */
        pushDonePending: (count: number) =>
            `已推送到远端。注意：另有 ${count} 个更改尚未提交，推送不会自动提交它们。`,
        pushDone: "已推送到远端。",
        /** 「提交」之后：提交好了，但还没推上去。 */
        commitsNotPushed: (count: number) =>
            `已提交，另有 ${count} 个提交尚未推送（可点「推送」或「立即同步」）。`,
        /**
         * 「与远端完全一致」——**醒目**的那条（带 ✓、停留更久）。
         *
         * 用户的原话：「当提交结束与远端一致时，给出醒目的反馈」。
         * 体积读得到就带上，读不到就只说状态（不编一个 0 B）。
         */
        syncedInSync: (size?: string) =>
            size ? `已同步：本地与远端一致 · 仓库 ${size}` : "已同步：本地与远端一致",

        // ── 体积 ──
        repoSizeLabel: "仓库大小",
        repoSizeDesc: (size: string, objects: number) => `${size}（${objects} 个对象）`,
        pendingChangesLabel: "待提交改动",
        pendingChangesDesc: (size: string, files: number) => `${size}（${files} 个文件）`,
        /** 读不到体积时**不编数字** —— 0 B 会被当成「空仓库」。 */
        sizeUnknown: "读不到",
        /**
         * 自动同步被大文件拦下时的提示。
         *
         * 必须同时说清两件事：**为什么停**（有大文件）与**去哪处理**（面板里那两个选择）。
         * 只说「有 N 个大文件」的话，用户不知道同步已经停了，会以为它一直在正常跑。
         */
        autoSyncLargeFilesPaused: (count: number) =>
            `有 ${count} 个文件超过大文件阈值，已暂停自动同步 —— 到「仓库同步」面板处理（仍然提交，或让它们退出跟踪）后即可恢复。`,

        /**
         * 提交前的大文件检查。
         *
         * 文案的重点全在**代价**上：两个选项各要付出什么，必须当场说清楚。
         * 只说「这些文件很大」的话，用户没有任何依据去选。
         */
        largeFiles: {
            modal: {
                title: (count: number, thresholdMb: number) =>
                    `${count} 个文件超过 ${thresholdMb} MB`,
                intro:
                    "这些文件这次会被提交。git 的历史不可逆 —— 一旦提交，它们就会永久占着仓库体积。",
                /** 未跟踪的文件会带上这个标记：对它们只需要一条忽略规则，不用摘索引。 */
                newBadge: "新文件",
                warningHeading: "两个选择的代价：",
                warningCommitAnyway:
                    "仍然提交：它以后每次改动都会在历史里再存一份完整副本，仓库会持续变大。",
                warningUntrack:
                    "退出跟踪并忽略：它不再有版本历史（本地文件保留），换设备时也不会自动带过去。",
                warningHistory:
                    "注意：历史里已经存在的副本不会消失，仓库大小不会因此变小 —— 那要在设置页「清理」里做一次深度清理。",
                cancel: "取消",
                untrack: "退出跟踪并忽略",
                commitAnyway: "仍然提交",
            },
            /**
             * 「退出跟踪」执行完的反馈。
             *
             * 两句话都不能省：「本地文件都在」回答「我的东西还在吗」，
             * 「历史里的副本仍在」回答「仓库怎么没变小」—— 后者不写的话，
             * 用户会拿体积没变当成操作失败。
             */
            untracked: (files: number, rules: number) =>
                `已让 ${files} 个文件退出跟踪（新增 ${rules} 条忽略规则）。本地文件都在，历史里的副本仍在。`,
        },
        /**
         * 清理能力（体检 / 回收 / 深度清理，2026-10-09）。
         *
         * 这一块的文案有一条贯穿的要求：**把代价说在动手之前**。
         * 重写历史是本插件唯一不可逆的动作，而用户对这个动作的直觉是错的
         * （「清一下而已」）—— 所以「哈希全变、远端要强制推、别的设备要重新 clone」
         * 这三件事必须在确认页上，而不是事后在通知里。
         */
        cleanup: {
            /** 前置条件拦下时的话，按类型码取（见 `errors.ts` 的 `RewriteBlockedReason`）。 */
            blocked: {
                "dirty-tree":
                    "工作区还有未提交的改动，重写历史前要先提交或撤销它们（git 会拒绝在脏工作区上重写）。",
                "no-commits": "这个仓库还没有任何提交，没有历史可以清理。",
                "no-paths": "没有选中任何要清理的路径。",
            },
            gcFreed: (size: string) => `回收完成，释放了 ${size}。`,
            gcNothing:
                "回收完成，但没有可回收的对象 —— 大文件都在可达的历史里，那种情况只有「深度清理」才能清掉。",
            gcUnknown: "回收完成，但读不到体积，无法告诉你释放了多少。",
            discardFreed: (size: string) => `备份已丢弃，释放了 ${size}。此前的历史再也回不去了。`,
            discardUnknown: "备份已丢弃，但读不到体积，无法告诉你释放了多少。",
            pushDone: "已强制推送到远端。",
            report: {
                title: "仓库体积体检",
                loading: "正在分析历史…",
                summary: (size: string, objects: number, commits: number) =>
                    `历史对象合计 ${size}（${objects} 个对象，${commits} 个提交）。`,
                note: "这是对象内容的原始大小、未压缩，所以会比 .git 的实际占用大。",
                dirsHeading: "占空间最多的目录",
                dirMeta: (size: string, objects: number) => `${size} · ${objects} 个对象`,
                rootLabel: "（库根目录的文件）",
                rootNote: "库根目录的文件不提供勾选 —— 剔掉它们等于清空整个库。",
                selectNote: "勾选只决定剔除哪些路径，不影响耗时。",
                largestHeading: "最大的单个对象",
                empty: "没有可分析的历史对象。",
                toConfirm: "开始重写",
                cancel: "取消",
            },
            confirm: {
                title: "确认重写历史",
                pathsHeading: "将要从全部历史里剔除：",
                estimate: (commits: number, minutes: number) =>
                    `这个库有 ${commits} 个提交。重写是逐个提交处理的，每个提交都要单独起一次 git —— 所以你勾几条路径都一样，库大库小也差不多。实测约 3.5 秒/提交，预计 ${minutes} 分钟，期间请不要关闭 Obsidian。`,
                warningHeading: "这会改变什么：",
                warningHashes:
                    "所有提交的哈希都会变。远端会与本地分叉，必须强制推送；其他设备要重新 clone 才能对上。",
                warningRemote:
                    "已经推到远端的旧历史在别人的克隆里仍然存在 —— 这里清不掉它。",
                warningBackup:
                    "本插件会先建一个备份引用，让你还能退回去；但备份一旦丢弃，就再也回不去了。",
                back: "返回",
                go: "确认重写",
            },
            running: {
                title: "正在重写历史",
                text: "每个提交都要单独处理一次，慢是正常的。请不要关闭 Obsidian。",
            },
            result: {
                title: "历史已重写",
                summary: (before: number, after: number) =>
                    `提交数 ${before} → ${after}。`,
                backup: (ref: string) =>
                    `备份保留在 ${ref}。确认库一切正常之前，请不要丢弃它。`,
                noShrink:
                    "空间暂时不会变小 —— 备份还拉着那些旧对象。确认无误后，用设置页「清理」里的「丢弃备份并回收」释放。",
                ignored: (count: number) =>
                    `已把 ${count} 条忽略规则写进 .gitignore，否则那些文件会在下次提交时原样回来。`,
                pushHint: "远端现在与本地分叉，需要强制推送才能同步过去。",
                push: "强制推送",
                done: "完成",
            },
        },
        noRemote: "还没有配置远端仓库，请在设置中填写远端地址。",
        conflictDetected: (count: number) =>
            `检测到 ${count} 个冲突文件，已生成冲突清单，请手动处理后提交。`,

        // 命令名（命令面板里显示）
        cmdSync: "SyncHub：立即同步（提交 → 拉取 → 推送）",
        cmdCommit: "SyncHub：提交全部更改",
        cmdPush: "SyncHub：推送到远端",
        cmdPull: "SyncHub：从远端拉取",
        cmdInit: "SyncHub：初始化仓库",
        cmdAbortMerge: "SyncHub：放弃当前合并（冲突恢复）",
        cmdEditRemote: "SyncHub：编辑远端地址",
        cmdOpenFileOnRemote: "SyncHub：在浏览器中打开当前文件",
        cmdOpenFileHistoryOnRemote: "SyncHub：在浏览器中查看当前文件的历史",
        cmdOpenDiff: "SyncHub：查看当前文件的差异",

        // 文件右键菜单
        menuOpenOnRemote: "在远端打开",
        menuOpenHistoryOnRemote: "在远端查看历史",
        remoteLinkUnavailable:
            "无法生成远端链接。请确认已配置 GitHub 或 Gitee 远端，且当前仓库至少有一次提交。",

        // 视图 / 状态栏里的短动作名
        actSync: "立即同步",
        /**
         * 三个动作的悬停提示。
         *
         * 必要性来自一个真实的提问：「推送按钮是单纯的推送还是提交全部加推送，
         * 如果是后者应该写清楚」—— 按钮上只有两个字，而「提交」与「推送」
         * 是两件事（本地 vs 远端）。答案是「单纯的推送」，那就得让界面自己说。
         */
        actSyncHint: "提交 → 拉取 → 推送，一条链走完",
        actCommitHint: "把所有更改提交到本地仓库（不推送）",
        actPushHint: "只推送已提交的内容，不会自动提交",
        /**
         * 「嵌套仓库」行（2026-10-04）。
         *
         * 用户的原话是「为什么更改里的三项都是文件夹地址，而没有具体改动却被算进了更改里」——
         * 那三个是他在库里**就地开发**的插件目录，各自带一个 `.git`，于是库把它们记成了
         * 「指向另一个仓库的指针」。这三句话分别回答：这是什么、为什么消不掉、怎么处理。
         */
        nestedRepoBadge: "嵌套仓库",
        nestedRepoHint:
            "带「嵌套仓库」的行是目录里自带 .git 的插件/主题（比如你在库里就地开发的那些）：" +
            "库同步只记了指向它的指针，没有它的文件内容 —— 所以它暂存不掉、也没有文件级差异。" +
            "点行尾的按钮可以让库不再跟踪它（本地文件不动）。",
        nestedRepoUntrack: "不再跟踪这个嵌套仓库（摘索引 + 写进 .gitignore，本地文件不动）",
        nestedRepoUntracked: "已不再跟踪它；目录与里面的文件一个都没动，它自己的 git 照常可用。",
        actCommit: "提交",
        actPull: "拉取",
        actPush: "推送",
        branchLabel: "分支",

        /**
         * ── 侧边栏详情面板（2026-09-19）
         *
         * 视图从「一个标题 + 四个按钮」扩成 git 插件那样的面板时新增的一组文案。
         * `cmdOpenView` 与 `viewTitle` **必须是两条**：命令名要以 `SyncHub` 开头
         * 才能在命令面板里被搜到（有测试钉着），而面板标题不该带这个前缀。
         */
        cmdOpenView: "SyncHub：打开仓库同步面板",
        statusBarHint: "点击打开仓库同步面板",
        /**
         * 忙碌时那一格的悬停提示（2026-10-05）。
         *
         * 与常态的 `statusBarHint` 不同：此刻用户最想知道的是「它在动吗、
         * 到哪一步了」，而不是「这个面板怎么开」。面板里那条横幅说明了阶段，
         * 所以这里把「点开就能看到」说出来。
         */
        statusBusyHint: "同步进行中，点击打开面板查看进度",
        actRefresh: "刷新",
        actInit: "初始化仓库",
        actStage: "暂存此文件",
        actUnstage: "取消暂存此文件",
        actStageAll: "全部暂存",
        actUnstageAll: "全部取消暂存",
        actOpenFile: "打开此文件",
        actOpenFileOnRemote: "在远端打开此文件",
        actDiff: "查看差异",
        actAbortMerge: "放弃本次合并",
        sectionStaged: (count: number) => `已暂存的更改（${count}）`,
        sectionChanges: (count: number) => `更改（${count}）`,
        sectionConflicts: (count: number) => `冲突（${count}）`,
        sectionHistory: "最近提交",
        historyEmpty: "还没有提交。",
        historyFailed: "无法读取提交历史。",
        commitOnRemote: "在远端查看此提交",
        actDiffCommit: "查看此提交的改动",
        /**
         * 面板顶部那一行：远端地址（2026-10-04 从「远端」改名 —— 那一格里现在是**可编辑的
         * 地址输入框**，「远端」两个字说不清它既显示又可改）。
         */
        remoteLabel: "远端地址",
        /**
         * 更改列表的**格式筛选**（2026-10-04）。
         *
         * 用户的原话：「我希望更改列表提供修改文件的格式筛选，尤其是 md 格式的文件，
         * 因为笔记同步主要还是同步的 md 文档」。选项由这次改动里真实出现的格式生成
         * （见 `changeFilterOptions`），所以 `filterAll` / `filterMarkdown` 都带数量。
         */
        filterLabel: "格式",
        filterAll: (count: number) => `全部 (${count})`,
        filterMarkdown: (count: number) => `Markdown (${count})`,
        filterNoExtension: "无扩展名",
        /** 筛选之后一条都没有（比如这一轮没有改动的笔记）。 */
        filterEmpty: "这个格式下没有更改。",
        detachedHeadLabel: "游离 HEAD（当前不在任何分支上）",
        aheadOf: (count: number) => `领先远端 ${count} 个提交`,
        behindOf: (count: number) => `落后远端 ${count} 个提交`,
        inSyncWithRemote: "与远端一致",
        /**
         * 「已提交的部分与远端一致，但工作区还有没提交的改动」（2026-10-04）。
         *
         * 用户的原话：「『与远端一致』在有新更改的时候，只是颜色不同，显示的文本依旧是
         * 『与远端一致』，文案描述并不准确」—— `ahead = behind = 0` 只说明**已提交的
         * 部分**对齐了，工作区可能还躺着一堆改动，那时说「与远端一致」会让人以为可以
         * 关电脑了。这一档**不标绿**（绿是 `isFullyInSync` 那一套判据）。
         */
        inSyncWithPendingChanges: "与远端一致，但有未提交的改动",
        noUpstreamHint: "该分支还没有跟踪远端分支，推送时会自动建立。",
        conflictHint:
            "这些文件在本地和远端都被修改过，git 无法自动决定保留哪一边。解决后提交即可；也可以放弃本次合并。",

        /**
         * ── 差异视图（2026-09-24）
         *
         * 弹窗里那几行说明。这里的 `section` 是**按下标取**的
         * （`t.sync.diff.section[kind]`），与 `diagnoseCheck[check.id]` 同一套写法。
         */
        diff: {
            title: "差异",
            section: {
                /** 工作区 ↔ 索引：还没暂存的内容。 */
                working: "工作区改动（未暂存）",
                /** 索引 ↔ HEAD：即将被提交的内容。 */
                staged: "已暂存改动",
                /** `git show`：一条提交引入的改动。 */
                commit: "本次提交的改动",
            },
            loading: "正在读取差异…",
            loadFailed: "读取差异失败。",
            noChanges: "没有可显示的差异。",
            /** 二进制没有可读的行 —— 说成「没有差异」是错的，那是个**有**改动的文件。 */
            binary: "二进制文件，不显示内容差异。",
            renamed: "内容没有改动，只是改了名字。",
            /** 未跟踪文件超过上限时不再读进内存（几十 MB 的文件会把界面卡住）。 */
            tooLarge: "文件太大，未显示内容差异。",
            truncated: "内容过多，只显示了前面一部分。",
            /**
             * 差异**没有目标**时（2026-10-04 起差异是主工作区标签页，Obsidian 会把它
             * 写进 `workspace.json`：万一那份状态里没带上目标，标签页还开着，但没东西可看）。
             */
            noTarget: "这条标签页没有要查看的差异。",
            /**
             * 显示模式（2026-10-04）：统一视图 / 双栏对照（像 VS Code）。
             * 双栏把删除放左栏、新增放右栏，**同一段改动按序号对齐** ——
             * 「删 2 行、增 3 行」时多出来的那行只有右栏有内容，一眼看得出是新增。
             */
            modeLabel: "视图",
            modeUnified: "统一",
            modeSideBySide: "双栏对照",
            noNewline: "（此文件末尾没有换行）",
            stats: (additions: number, deletions: number) =>
                `+${additions} −${deletions}`,
        },

        editRemoteTitle: "编辑远端地址",
        editRemoteLabel: "远端仓库地址",
        editRemotePlaceholder: "https://github.com/owner/repo.git",
        editRemoteSaved: (url: string) => `远端已设置为 ${url}`,
        // 按类型码取文案（与 diagnoseDetail 同一套约定），判定见 classifyRemoteUrl。
        editRemoteHint: {
            invalid: "这看起来不是一个 git 远端地址。请填写 URL、git@host:path 或本地路径。",
            credentials:
                "这个地址里带着账号和令牌，保存后它们会以明文写进库里的 .git/config —— " +
                "`git remote -v` 能直接看到，备份或同步整个库时也会一起带走。" +
                "建议把地址改成不带凭据的形式，令牌填到上面「访问令牌」里（走系统密钥库，不落盘）。",
            notGithubOrGitee:
                "可以保存并使用 —— 同步是纯 git 操作。但该平台不是 GitHub 或 Gitee，所以不会自动注入访问令牌，「在远端打开」也用不了（私有仓库需要系统凭据助手）。",
        },
        // ── .gitignore ──
        gitignoreCreated: "已创建 .gitignore（排除了 Obsidian 的工作区状态文件，避免多设备冲突）。",
        cmdEditGitignore: "SyncHub：编辑 .gitignore",
        /**
         * 「在编辑器里打开 .gitignore」没成时说的一句话。
         *
         * **不猜原因**：`getAbstractFileByPath` 查的是 Obsidian 的库索引，而以点
         * 开头的文件在有些环境里不在索引里 —— 但那不是我们能在这一层确认的事。
         * 所以说清「没打开」，并给出两条**确实能用**的路。
         */
        gitignoreOpenFailed:
            "没能在 Obsidian 的编辑器里打开 .gitignore。可以到「仓库同步」设置页用那个" +
            "代码框直接改，或用系统编辑器打开库根目录下的 .gitignore。",
        /**
         * 初始化仓库时写入的 .gitignore 内容（整段放在 locale 里，
         * 而不是在代码里拼 —— 它含面向用户的说明文字）。
         *
         * 参数是**库的配置目录名**（`vault.configDir`），不是一个写死的
         * `.obsidian`：用户可以改它，而写死的话那些排除规则会一条都不匹配 ——
         * 表现是「明明建了 .gitignore，workspace.json 还是被同步出去了」。
         * 审核的 `hardcoded-config-path` 报的也是这件事。
         */
        gitignoreTemplate: (configDir: string) =>
            [
                "# 由 SyncHub 创建。",
                "",
                "# Obsidian 的工作区布局（面板、标签、光标位置）。每台设备各自维护，",
                "# 同步它只会制造冲突 —— 这是 Obsidian 多设备同步最常见的坑。",
                `${configDir}/workspace.json`,
                `${configDir}/workspace-mobile.json`,
                "",
                "# 本插件自己的设置（同步间隔、拉取策略…）。这些是按设备的，",
                "# 同步它只会让两台设备互相覆盖设置。",
                `${configDir}/plugins/ob-sync/data.json`,
                "",
                "# Obsidian 的回收站",
                ".trash/",
                "",
                "# 系统垃圾文件",
                ".DS_Store",
                "Thumbs.db",
                "",
                "# 想忽略别的文件，直接加到下面即可。",
            ].join("\n"),

        repoInited: "git 仓库已初始化。",
        mergeAborted: "已放弃当前合并，仓库回到拉取前的状态。",

        // ── 连接测试 ──
        diagnoseHeading: "连接测试",
        diagnoseDesc:
            "检查同步配置是否可用，并验证访问令牌。只读操作，不会改动任何东西。",
        diagnoseRun: "测试连接",
        diagnoseRunning: "正在测试…",
        // 措辞刻意限定在「读取」：这个测试走 ls-remote，验不了推送路径。
        // 说成「同步配置可用」会让人以为推送也验过了（实测：Gitee 的凭据用户名
        // 规则只在 push 路径执行，ls-remote 发现不了）。
        diagnoseAllPassed: "全部通过：远端可读取。",
        diagnoseScopeNote:
            "本次只验证了读取（ls-remote）。推送权限与凭据规则要真正推送一次才能确认。",
        diagnoseHasFailures: "发现问题，详见下方。",
        diagnoseCheck: {
            git: "git 可执行文件",
            repo: "git 仓库",
            remote: "远端地址",
            platform: "平台与令牌",
            access: "远端访问",
        },
        diagnoseDetail: {
            gitOk: "可用",
            gitFailed: (detail: string) => `不可用：${detail}`,
            repoOk: "已初始化",
            repoFailed: "尚未初始化 —— 请先执行命令「SyncHub：初始化仓库」",
            remoteOk: (url: string) => url,
            remoteFailed: "未配置 —— 请用命令「SyncHub：编辑远端地址」填写",
            platformOk: (host: string) => `${host}，已配置访问令牌`,
            platformNoToken: (host: string) =>
                `${host}，未配置访问令牌 —— 公开仓库可以同步，私有仓库会失败`,
            platformUnknown: "无法识别平台，不会注入令牌（私有仓库需依赖系统凭据助手）",
            accessOk: (count: string) => `可以访问，读到 ${count} 个分支`,
        },


        conflictGuideFile: "SyncHub 冲突指南.md",
        conflictGuideTitle: "同步冲突指南",
        conflictGuideIntro:
            "本次拉取时，下列文件在本地和远端都被修改了，git 无法自动决定保留哪一边。文件里的冲突位置以 <<<<<<< 与 >>>>>>> 标出。",
        conflictGuideFiles: "冲突文件：",
        conflictGuideResolve:
            "处理方式：打开每个文件，编辑冲突位置保留你想要的内容（删掉标记行），然后执行「SyncHub：立即同步」，冲突解决后会正常提交并推送。",
        conflictGuideAbort:
            "如果想放弃本次合并、回到拉取之前的状态，执行命令「SyncHub：放弃当前合并」。",
        conflictGuideFooter: (time: string) => `此文件由 SyncHub 于 ${time} 自动生成，处理后可删除。`,
    },

    /**
     * 图片同步 / R2 / 图片编辑。
     *
     * 与 `installer` / `sync` 同构：错误文案集中在这里，由
     * `features/images/errors.ts` 的 `describeImageSyncError` 按类型码取。
     */
    images: {
        /** 输出格式的下拉项。设置页与编辑弹窗**共用一份** —— 两处措辞不一致会让人以为是两个不同的东西。 */
        formatOption: {
            keep: "保持原样",
            jpeg: "JPEG",
            webp: "WebP",
            png: "PNG",
        },

        cmdSync: "SyncHub：同步图片到云端",
        cmdPreview: "SyncHub：预览图片同步的变更",
        cmdEdit: "SyncHub：裁剪 / 压缩当前图片",
        cmdCopyLink: "SyncHub：复制当前图片的云端链接",
        cmdManage: "SyncHub：打开图片管理",

        toolbar: {
            crop: "裁剪 / 压缩",
            copyLink: "复制云端链接",
        },

        notice: {
            syncDone: (uploaded: number, downloaded: number) =>
                `图片同步完成：上传 ${uploaded}，下载 ${downloaded}。`,
            syncNothing: "图片同步完成：本地与云端已经一致，没有需要处理的内容。",
            syncFailed: "图片同步失败",
            syncFailedMany: (count: number) => `有 ${count} 个文件处理失败`,
            previewFailed: "预览图片同步变更失败",
            linkCopied: (url: string) => `云端链接已复制：${url}`,
            noPublicBase:
                "还没有配置公网访问地址，无法生成链接。请在「图片同步」设置里填一个自定义域名或 r2.dev 域名。",
            notInScope: "这张图片不在需要图片同步的文件夹里，SyncHub 不会同步它。",
            notConfigured:
                "图片同步还没配置好。请先在「图片同步」设置页填写 R2 信息与需要图片同步的文件夹。",
            editorOpenFailed: "打开图片编辑器失败",
            singleUploadFailed: "把这张图上传到云端失败（不影响本地保存）",
            deleteBackupFailed: "删除云端备份失败",
            deleteBackupFailedMany: (count: number) => `有 ${count} 个云端备份没能删除。`,
            remoteDeleted: (count: number) => `已删除 ${count} 个云端备份。`,
            remoteKept: (count: number) =>
                `已保留 ${count} 个云端备份（本地不再保留副本，也不会再同步回来）。`,
            renameFailed: "把云端那一份搬到新名字下失败",
            deleteOutOfScope: "不在需要图片同步的文件夹里，SyncHub 不会动它",
        },

        /**
         * 本地删除图片时的确认弹窗。
         *
         * 标题要带数量：一次删十张图时弹的是一个窗，用户得知道自己在回答什么。
         */
        deleteRemote: {
            title: (count: number) =>
                count === 1
                    ? "要从云端也删除这张图片吗？"
                    : `要从云端也删除这 ${count} 张图片吗？`,
            desc:
                "这些图片在云端还有一份备份。本地这一份已经删掉了 —— 云端那一份要怎么处理？",
            more: (count: number) => `另有 ${count} 个未列出。`,
            warningHeading: "云端删除不可撤销",
            /**
             * 必须写清「为什么这里没有后悔药」：本地那次删除多半还躺在 Obsidian
             * 的回收站里，而 R2 没有回收站。不写出来，用户会按「本地删除」的经验
             * 去点这个按钮。
             */
            warning:
                "本地那份大概率还能从库的回收站找回来，但云端没有回收站 —— " +
                "删掉就真的没有了（除非你在别处还有副本）。选「保留云端备份」则云端那一份" +
                "会留着，只是不再同步回本地。",
            keep: "保留云端备份",
            delete: "同时删除云端备份",
        },

        plan: {
            heading: "变更预览",
            empty: "本地与云端已经一致，没有需要处理的内容。",
            counts: (upload: number, download: number, conflicts: number, skipped: number) =>
                `将上传 ${upload}，下载 ${download}，冲突 ${conflicts}，跳过 ${skipped}。`,
            /**
             * 列举被截断时的说明。
             *
             * 现在它只影响「结果完不完整」：删除已经不在计划里了，所以没有
             * 「不敢删」这回事了。但截断仍然要说出来 —— 否则「明明云端有这一份，
             * 为什么又传了一次」会让人以为是重复上传的 bug。
             */
            truncated:
                "云端对象数量超过了一次列举的上限，这一轮看到的结果可能不完整：" +
                "没被列到的图片会被当成「云端缺这一份」而重传一次。重传是安全的，只是白传。",
            more: (count: number) => `另有 ${count} 项未列出。`,
            action: {
                upload: "上传",
                download: "下载",
                conflict: "冲突",
                skip: "跳过",
            },
            reason: {
                "local-new": "本地新增",
                "local-changed": "本地有改动",
                "remote-new": "云端新增",
                "remote-changed": "云端有改动",
                "local-deleted": "本地已删除（云端保留）",
                conflict: "两边都改过",
                "in-sync": "一致",
            },
        },

        editor: {
            title: (name: string) => `裁剪 / 压缩：${name}`,
            /**
             * svg 与 gif 的拒绝理由必须写出来。
             *
             * 只说「不支持这个格式」的话，用户会去试别的操作，或者以为插件坏了 ——
             * 而真实原因是**画布会毁掉这两种格式**（矢量被栅格化、动图只剩第一帧）。
             */
            unsupported:
                "这个格式不能用画布重新编码：SVG 会被栅格化成位图，GIF 只会保留第一帧。" +
                "请先转成 PNG / JPEG / WebP 再编辑。",
            readFailed: "读取这张图片失败。",
            decodeFailed: "无法解码这张图片，它可能已损坏，或这个格式在当前平台不受支持。",
            format: "输出格式",
            formatDesc: "换格式对体积的影响往往比调质量更大。WebP 一般比 JPEG 小四分之一左右，且支持透明。",
            quality: "质量",
            qualityDesc: "只对有损格式有效（JPEG / WebP）。PNG 是无损的，这一项对它不起作用。",
            maxEdge: "最长边（像素）",
            maxEdgeDesc: "0 表示不缩放。只缩不放 —— 放大小图只会更模糊、更大。",
            ratio: "锁定比例",
            ratioDesc: "拖动选框时保持比例。",
            ratioFree: "自由",
            ratioOriginal: "原图比例",
            ratioSquare: "1:1",
            overwrite: "覆盖原图",
            overwriteDesc:
                "关掉则另存为新文件（同目录，文件名加 -edited 后缀），原图保持不变。" +
                "覆盖是多数人的意图 —— 笔记里的链接指着原文件，另存会让链接指向旧图。",
            targetOverwrite: (path: string) => `将写回：${path}`,
            targetNew: (path: string) => `将新建：${path}`,
            reset: "重置选框",
            cancel: "取消",
            save: "保存",
            saving: "正在保存…",
            /**
             * 输出信息。字节数是**真的编码一遍**量出来的，不是估算 ——
             * 用公式估的 jpeg 体积能差两三倍，那等于编数字。
             */
            summary: (width: number, height: number, size: string, extension: string) =>
                `输出：${width} × ${height} · ${size} · .${extension}`,
            saveFailed: "保存图片失败",
            /**
             * 保存成功。
             *
             * 要说清「存到哪儿了」：另存模式下文件不叫原名，而用户下一步
             * 往往就是去笔记里改链接 —— 不给路径的话他得自己去找。
             */
            saved: (path: string) => `已保存 ${path}`,
        },

        /**
         * 图片管理面板。
         *
         * ## 这一页的文案原则：把「后果」写在按钮附近，而不是藏在文档里
         *
         * 这里的每个按钮都会**改文件**（删除、重命名、覆盖）。而重命名会连带
         * 改掉笔记里的链接、删除会留下墓碑（下次同步不再把图补回来）—— 这些
         * 都不是按钮文字能表达的。所以确认框里必须逐条说清。
         */
        manager: {
            title: "图片管理",

            scanning: "正在扫描库里的图片与引用…",
            scanningOf: (done: number, total: number) => `正在扫描引用… ${done}/${total}`,
            scanFailed: "扫描图片与引用失败",
            loading: "正在扫描…",

            /** 六个统计数字。标签要短 —— 它们并排显示在一行里。 */
            statLocal: "本地",
            statRemote: "云端",
            statLinked: "已链接",
            statOrphan: "失联",
            statTotal: "合计",
            statLocalBytes: "本地体积",

            /**
             * 云端列举失败时必须显式说明。
             *
             * 不说的话，列表里「云端」这一列全是空的，用户会读成「云端一张都没有」，
             * 进而放心地把本地全删了 —— 而真相是**根本没读到云端**。
             */
            remoteFailed: (message: string) => `没能读取云端列表：${message}。列表里「云端」这一列不可信。`,
            notConfigured: "图片同步还没配置好，所以只能看到本地与引用情况。",
            truncated: "云端对象超过了一次列举的上限，这一轮看到的结果可能不完整。",

            filterLocal: "本地",
            filterRemote: "云端",
            filterLinked: "已链接",
            filterState: {
                any: "任意",
                yes: "有",
                no: "无",
            },
            minSize: "最小体积",
            minSizeUnit: "KB",
            sort: "排序",
            sortOption: {
                path: "按路径",
                "size-desc": "体积大 → 小",
                "size-asc": "体积小 → 大",
            },
            search: "搜索",
            searchPlaceholder: "路径包含…",

            presetOrphans: "失联图片",
            presetPendingUpload: "待上传",
            presetRemoteOnly: "仅云端",
            presetLarge: "大图",
            presetReset: "重置筛选",

            selectAll: "全选",
            clearSelection: "清空选择",
            selectedCount: (count: number) => `已选 ${count}`,
            shown: (visible: number, total: number) => `显示 ${visible} / ${total}`,
            /**
             * 选择条右侧那颗「重新扫描」（2026-10-01）。
             *
             * 标签用**扫描**而不是「刷新」：它真的会重扫本地文件、重新列举云端、
             * 重扫引用（秒级），而不只是重画一遍界面 —— 说「刷新」会让用户以为
             * 它很便宜，反复点。
             */
            refreshList: "重新扫描",
            refreshHint: "重新扫描本地与云端（在库外改了图片、或刚同步完之后用）",
            /**
             * shift+点击的提示。这个手势**看不出来**，不写一句就没人会发现它
             * （而它正是「一次选中一段」的唯一入口）。
             */
            selectRangeHint: "Shift + 点击可选中一段",
            empty: "这个库里没有落在同步范围内的图片。",
            emptyFiltered: "没有符合当前筛选条件的图片。",
            capped: (hidden: number) => `另有 ${hidden} 项未显示 —— 请用筛选缩小范围。`,

            columnPath: "路径",
            columnSize: "体积",
            columnState: "状态",
            badgeLocal: "本地",
            badgeRemote: "云端",
            badgeLinked: (count: number) => `已链接 ×${count}`,
            badgeOrphan: "无人引用",

            actionSync: "同步选中",
            actionCompress: "压缩并同步",
            /** 底部那颗 —— 它管的是「勾选了一批」，与行内的单文件重命名是两条路。 */
            actionRename: "批量重命名",
            /** 列表里每一行那个铅笔按钮的标签（只有图标，含义全靠它）。 */
            renameThis: "重命名这个文件",
            /** 行内缩略图的标签 —— 它就是那个「点开看大图」的入口。 */
            previewOpen: "查看大图",
            previewZoomIn: "放大",
            previewZoomOut: "缩小",
            previewZoomReset: "重置缩放",
            /** 图片比窗口大时的提示（此时只能靠拖动看其余部分）。 */
            previewPannable: "可拖动",
            previewPannableHint: "图片比窗口大，按住拖动查看其余部分",
            actionDeleteLocal: "删除本地",
            actionDeleteBoth: "删除本地 + 云端",
            noSelection: "先在上面的列表里勾选要处理的图片。",
            compressHint: (params: string) =>
                `压缩参数取自设置页（质量 / 最长边 = ${params}），保持原格式，且只在变小的时候才写回。`,

            syncing: "正在同步选中的图片…",
            syncDone: (uploaded: number, downloaded: number, failed: number) =>
                failed > 0
                    ? `选中同步完成：上传 ${uploaded}，下载 ${downloaded}，失败 ${failed}。`
                    : `选中同步完成：上传 ${uploaded}，下载 ${downloaded}。`,
            syncFailed: "同步选中的图片失败",
            syncFailedMany: (count: number) => `有 ${count} 张没能同步。`,

            compressing: "正在压缩…",
            compressingOf: (done: number, total: number) => `正在压缩… ${done}/${total}`,
            compressNothing: (skipped: number) =>
                `没有图片被压缩 —— ${skipped} 张要么不支持重编码（SVG / GIF），要么压完反而更大。`,
            compressDone: (count: number, saved: string, skipped: number) =>
                `已压缩 ${count} 张，省下 ${saved}${skipped > 0 ? `（另有 ${skipped} 张跳过）` : ""}。`,
            compressFailed: (count: number, sample: string) =>
                `有 ${count} 张压缩失败，例如 ${sample}。`,

            renaming: "正在重命名…",
            renameTitle: (count: number) => `重命名 ${count} 张图片`,
            renameDesc: (placeholders: string) =>
                `用模板拼新文件名，可用占位符：${placeholders}。目录不变 —— 笔记里的链接由 Obsidian 跟着更新。`,
            renameTemplate: "文件名模板",
            renameStart: "起始序号",
            renamePreviewCount: (renameable: number, total: number) =>
                `将重命名 ${renameable} 张（共选中 ${total} 张）。`,
            renameProblem: {
                unchanged: "名字没变，跳过",
                invalid: "名字不合法，跳过",
                taken: "目标已存在，跳过",
                extChanged: "改了扩展名，跳过",
            },
            renameConfirm: (count: number) => `重命名 ${count} 张`,
            renameCancel: "取消",
            renameDone: (renamed: number, planned: number) => `已重命名 ${renamed} / ${planned} 张。`,
            renameFailedMany: (count: number, sample: string) =>
                `有 ${count} 张没能重命名，例如 ${sample}。`,
            renameMissing: "文件已经不在库里了",

            renameFileTitle: "重命名文件",
            renameFileDesc: "只改文件名，目录不变。不写扩展名就沿用原来的；笔记里指向它的链接会跟着更新。",
            renameFileName: "文件名",
            renameFileConfirm: "重命名",
            renameFileDone: (name: string) => `已重命名为 ${name}。`,

            deleting: "正在删除…",
            deleteDone: (local: number, remote: number, failed: number) =>
                failed > 0
                    ? `已删除本地 ${local} 张、云端 ${remote} 份，失败 ${failed} 张。`
                    : `已删除本地 ${local} 张、云端 ${remote} 份。`,
            deleteFailed: "批量删除失败",
            deleteFailedMany: (count: number, sample: string) =>
                `有 ${count} 张没能删除，例如 ${sample}。`,

            confirmLocalTitle: (count: number) => `只删除本地的 ${count} 张图片？`,
            confirmLocalDesc:
                "本地这一份会被移入回收站（按你在「设置 → 文件与链接 → 删除文件」里选的方式）。" +
                "云端那一份保留 —— 但不会再同步回这台设备：SyncHub 会记下「你已经删过它」，" +
                "否则下一轮同步会把它们下载回来。",
            confirmLocalOk: (count: number) => `删除本地 ${count} 张`,

            confirmBothTitle: (count: number) => `删除本地与云端的 ${count} 张图片？`,
            confirmBothDesc:
                "本地这一份进回收站，云端那一份被真的删除。这一步之后，两边都不再有它们。",
            confirmBothWarningHeading: "云端删除不可撤销",
            confirmBothWarning:
                "本地那份大概率还能从回收站找回来，但云端没有回收站 —— 删掉就真的没有了" +
                "（除非你在别处还有副本）。另外，如果你在笔记里引用过它们，那些链接会变成断链。",
            confirmBothOk: (count: number) => `删除 ${count} 张（含云端）`,
            confirmCancel: "取消",
        },

        errors: {
            notConfigured: (missing: string) =>
                `图片同步还没配置好，缺少：${missing}。请在「图片同步」设置页补全。`,
            noFolders:
                "还没有指定需要图片同步的文件夹。请在「图片同步」设置页填写一个（例如 attachments）。",
            authFailed:
                "R2 拒绝了这次请求：Access Key ID 或 Secret Access Key 不正确，" +
                "或者这个令牌没有访问该桶的权限。",
            bucketNotFound: (bucket: string) =>
                `找不到存储桶 ${bucket}。请核对桶名，以及令牌是否授权了这个桶。`,
            listFailed: (status: number, detail: string) =>
                `列举云端对象失败（HTTP ${status}）：${detail}`,
            uploadFailed: (path: string, status: number, detail: string) =>
                `上传 ${path} 失败（HTTP ${status}）：${detail}`,
            downloadFailed: (path: string, status: number, detail: string) =>
                `下载 ${path} 失败（HTTP ${status}）：${detail}`,
            copyFailed: (path: string, status: number, detail: string) =>
                `在云端把图片搬到 ${path} 时失败（HTTP ${status}）：${detail}。` +
                `本地文件已经改名成功，下一轮同步会把它补传上去。`,
            deleteFailed: (path: string, status: number, detail: string) =>
                `删除云端的 ${path} 失败（HTTP ${status}）：${detail}`,
            network: (detail: string) =>
                `连接 R2 失败：${detail}。请检查网络（或代理）后重试。`,
            localReadFailed: (path: string, detail: string) =>
                `读取本地文件 ${path} 失败：${detail}`,
            localWriteFailed: (path: string, detail: string) =>
                `写入本地文件 ${path} 失败：${detail}`,
            decodeFailed: (path: string) =>
                `无法解码 ${path}，它可能已损坏，或这个格式在当前平台不受支持。`,
        },
    },
};

/**
 * 注意：这里刻意**不加** `as const`。
 * 加了会把所有字符串收窄成字面量类型，导致其他语言无法满足该类型。
 * 需要的是「结构一致」，不是「取值一致」。
 */
export type LocaleStrings = typeof zhCN;
