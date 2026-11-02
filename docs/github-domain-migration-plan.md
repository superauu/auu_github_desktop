# 外部系统完全插件化实施计划

日期：2026-11-02。

目标：GitHub 与 GitLab、Gitea、Sentry 一样，通过可选插件贡献工作域能力。用户不连接、禁用或在构建时移除 GitHub，仍能使用本地 Git 功能，并通过 GitLab 完成任务、分支、MR、评审和 CI 工作流。

此前仅增加 Domain 包装、保留 GitHub 专用完整视图与其他平台轻量视图的方案，不能满足这个目标。本计划取代该方案。

## 目标边界

```text
本地 Git / 仓库状态
        ↓ 仓库快照、远程、推送事件
集成运行时：绑定插件、实例、账号；切换时作废旧上下文
        ↓
公共工作域契约 + 单一协作 Store + 公共视图
        ↓
插件注册与能力声明
        ↓
GitHub / GitLab / Gitea / Sentry 适配器
        ↓
通用 HTTP、凭证存储、外部链接等宿主服务
```

| 层 | 拥有的职责 | 约束 |
|---|---|---|
| `services/git`、`repoStore` | Git 命令、本地仓库、fetch/push、远程选择 | 仓库模型不包含 GitHub 身份字段；PR refspec 由插件提供 |
| `services/integrations` | Domain/Capability 词汇、插件生命周期、远程与账号绑定 | 不按平台名称分支；无默认 GitHub 回退 |
| `services/collaboration` | 任务、PR/MR、评审、流水线、日志等公共数据与调用契约 | 无平台 Service、Store 或 UI 依赖 |
| `collaborationStore` 与域视图 | 统一查询、操作、加载/失败状态、导航、通知 | GitHub/GitLab/Gitea 共用一套工作流 |
| `plugins/<id>` | API、认证扩展、状态映射、配置解析、URL/refspec、迁移规则 | 平台差异留在插件中 |
| `plugins.config.json` 与生成的装配文件 | 内置插件、可选授权 UI 和原生 feature 的装配元数据 | 构建按环境变量选择插件，不修改域功能 |
| Rust 插件模块 | 必须由原生端完成的协议与历史凭证适配 | GitHub 协议可通过 Cargo feature 排除 |

“插件”在本次范围中指可独立装配、启停和排除构建的内置模块；不包括在线市场、下载运行第三方脚本、沙箱或动态二进制加载器。

## 第一阶段：提取中立契约

1. 将原 GitHub 数据模型提升为公共协作契约，保留已被视图使用的字段形状，由各插件负责转换。
2. 覆盖已有功能：Issue CRUD/评论/关联、PR/MR 创建/关闭/合并/文件/评审、流水线/检查/源码/调度/重跑/取消/任务日志。
3. 核心只定义 Domain 和 Capability 词汇；各插件显式声明实际实现的能力。
4. 使用可绑定客户端的公共网关；无绑定时明确失败，不调用任何默认平台。

验收：工作域和生产视图不直接导入平台客户端、平台 Store 或平台私有类型；不连接外部系统时，本地 Git 仍可工作。

## 第二阶段：将平台实现迁入插件

1. GitHub 的 REST、OAuth、授权 URL 校验、远程兼容解析和旧账号迁移放入 `plugins/github`。
2. GitLab/Gitea 各自实现同一完整协作契约，替代原有只读的轻量入口。
3. Sentry 客户端放入 `plugins/sentry`，错误域工厂通过注册查找实现。
4. Actions `workflow_dispatch` 与 GitLab `spec.inputs`/描述变量由相应插件解析，公共表单只处理输入字段。
5. GitHub 原生设备授权、日志下载和凭证适配迁入 `src-tauri/src/plugins/github.rs`，以 `plugin-github` feature 控制编译与 IPC 注册。

验收：装配中不包含 GitHub 时，GitLab 仍能构建和运行；原生端 `--no-default-features` 不编译或注册 GitHub 协议。

## 第三阶段：统一账号与仓库生命周期

1. 账号统一记录 `providerId + server + profileId`，元数据写入 `auu_git_connections` v2，令牌留在系统凭据管理器。
2. 旧 GitHub Profiles 与 Forge 账号由插件提供迁移规则，保留原 Keyring 槽位，不复制令牌。
3. 仓库使用中立 `collaborationRemote`。通用远程设置优先读取 `auugit.collaborationRemote`，缺失才读取旧 `auugit.githubRemote`。
4. 公有域名由启用插件声明；自建实例必须与连接的主机及 HTTP API 端口匹配。SSH 端口仅属于 Git 传输身份。
5. 仓库、远程、账号、实例、令牌和插件启停发生变化时，清空域数据并作废旧请求；添加账号期间不自动切回仓库原账号。
6. 禁用当前插件时清空令牌和会话，不自动切换至其他平台。

验收：A→B→A 的迟到响应、同路径修改远程、令牌轮换、断开、关闭仓库均不会污染新上下文；不同实例不借用凭证。

## 第四阶段：所有平台共用完整视图

1. 删除“GitHub 完整 PR 页面 / 其他平台轻量页面”的生产分流。
2. 统一托管平台连接表单、多账号管理、任务列表、PR/MR 创建与评审、CI 面板和通知。
3. GitHub OAuth 只是插件贡献的可选授权界面，通用连接流程不依赖它。
4. Issue 关联持久化带平台和实例作用域，支持 GitLab 嵌套 namespace，避免同名项目、相同编号跨实例串联。
5. PR checkout 的 refspec、Issue/MR/检查链接由插件生成；所有平台外链均走通用桌面打开命令。
6. 推送检查、历史检查和通知共用同一协作状态，监听实际 push URL；fork 推送不会错误观察 upstream。
7. GitLab 运行中 job trace 可立即查看并定期刷新；失败保留为错误，不能显示为成功或空结果。
8. 所有平台 API 在桌面端使用通用 HTTP 代理；CSP 不再单独列举 GitHub API，头像允许插件的 HTTP(S) 地址。

验收：禁用 GitHub 的 GitLab 浏览器流程完成 Issue 评论→关联分支→创建 MR→合并→读取任务日志，且没有 GitHub 网络请求。

## 第五阶段：尊重平台语义

| 功能 | GitHub | GitLab | Gitea / Forgejo |
|---|---|---|---|
| Issue CRUD/评论/关联 | 插件实现 | 插件实现，支持多级分组 | 插件实现 |
| PR/MR 创建/关闭/合并/差异 | 插件实现 | MR API、diffs 和 SHA 合并校验 | 原生 merge API，文本 diff 映射 |
| 评审 | 评论、批准、请求修改 | 评论、行内讨论、批准 | 原生 review 事件与行号映射 |
| 合并方式 | merge/squash/rebase | merge/squash；rebase/fast-forward 遵循项目设置 | merge/squash/rebase |
| CI 源码与手动运行 | Actions YAML | 项目 CI 配置、typed inputs/variables | Actions 兼容配置 |
| CI 重跑 | 支持 | pipeline retry | 支持 |
| CI 取消 | 支持 | pipeline cancel | 不声明不存在的 REST 能力，界面禁用该操作 |
| 实时日志 | 未结束任务保留等待状态 | 运行中 trace 可读 | 按平台日志 API 可用性展示 |

这些差异由平台 API、版本和权限决定，不应变成 GitHub 专有的应用功能。读取失败、403、未实现能力都必须明确反馈；不能伪造评审、合并或流水线成功。

GitLab 行内讨论使用 before/after 路径与 `base_sha/head_sha/start_sha`，重命名文件不能用同一个路径替代两侧路径，见 [GitLab Discussions API](https://docs.gitlab.com/api/discussions/)。Gitea 文件列表不提供 patch，适配器结合其 [changed-files API](https://docs.gitea.com/api/1.26/operations/repo-get-pull-request-files/) 和文本 diff；工作流运行使用 [repository runs API](https://docs.gitea.com/api/1.26/operations/get-workflow-runs/)，不假设存在 GitHub 的 workflow-runs 路由。

## 第六阶段：验证与防止回归

1. **移除测试**：仅装配 GitLab，检查构建输入不包含 `plugins/github`，并执行真实 GitLab 适配器的登录及任务读取。
2. **主力仓库测试**：禁用 GitHub，使用嵌套 namespace、自建 GitLab 和独立令牌覆盖 Issue、MR、评审、diff、合并、日志、调度、retry/cancel、提交检查与链接。
3. **架构测试**：生产域功能禁止导入平台 Service/Store；删除旧 Service/Store 兼容导出，测试显式绑定客户端。
4. **生命周期测试**：跨账号、跨实例、跨仓库、相同 SHA、新旧请求和推送目标隔离。
5. **原生测试**：保留历史凭证隔离测试；验证默认构建及移除 `plugin-github` 的构建。
6. **浏览器测试**：统一连接入口及启停；GitLab 主力工作流；既有 Issues→分支→PR 合并；历史/总览和深浅主题截图。
7. **工程检查**：完整 `npm test`、ESLint、生产构建。截图沿用原基线，不用更新截图掩盖功能回归。

验证使用合成 HTTP 响应、临时本地仓库和隔离浏览器存储，不创建或合并真实远端资源。

## 实施状态与维护规则

六个阶段及后续本地架构收尾均已实施，验证结果见下方记录。

已删除 `githubStore`、`forgeStore`、`ciStore` 别名、`services/github`、旧 GitLab/Gitea Service、轻量 Forge 视图及旧认证组件路径。所有生产视图通过中立网关使用同一份 `collaborationStore`。为保护已有用户数据，历史账号键、凭证槽位和仓库配置的读取迁移仍保留在插件边界；这些迁移不创建第二套客户端或状态。

新增插件时，实现实际需要的域接口和明确能力，提供服务器/凭证策略、URL/refspec 及必要迁移，然后加入装配。不能在公共 Store、视图、GitService 或 OverviewService 中增加 `if provider === ...` 分支。

前端构建通过 `AUUGIT_PLUGINS=gitlab` 仅装配 GitLab，`AUUGIT_PLUGINS=none` 不装配任何外部插件，未设置时装配目录中全部插件。原生端同时使用 `--no-default-features` 排除 GitHub。运行时用户可在设置→集成取消“启用插件 GitHub”，不会删除已保存的账号或凭证；重新启用后可恢复。

当前 GitHub 插件仅支持 github.com；GitHub Enterprise 需要单独扩展该插件。每个仓库固定某一个账号的持久选择、在线安装市场和第三方代码沙箱不属于本次实现。

## 初次迁移验证记录

| 检查 | 结果 |
|---|---|
| 完整 `npm test` | 636 项通过，无失败 |
| 收尾账号选择、取消恢复、实例绑定与总览专项 | 41 项通过，无失败 |
| 插件隔离专项（包含完整 App UI 仅装配 GitLab 的构建） | 9 项通过，无失败 |
| 浏览器集成、Issues、总览与历史回归 | 18 项通过，沿用原截图基线 |
| 补充账号取消恢复后的集成浏览器复验 | 2 项通过 |
| `cargo test --lib` | 50 项通过 |
| `cargo test --lib --no-default-features` | 49 项通过，GitHub 原生模块未编译 |
| `npm run lint`、`npm run build` | 通过；构建保留现有大分包体积提示 |

完整回归之后的收尾变更另以账号/绑定专项、插件隔离和浏览器复验覆盖，上述测试数不相加为一轮全套测试数。插件移除验收同时覆盖数据运行时、完整 App UI 依赖图和原生编译，不依赖仅隐藏导航或修改平台名称。

初次迁移未执行真实平台的创建、合并 MR/PR 或流水线调度；API 写操作以测试替身验证。后续桌面链路验证与剩余外部验收边界见下文。

## 后续本地架构收尾（2026-11-02）

| 顺序 | 工作 | 实现与验收 |
|---|---|---|
| 1 | 共享 HTTP 传输 | 浏览器和 Rust 均不跟随重定向；校验 URL/头部；默认 30 秒超时；响应按流限制为 32 MiB；原生请求有 ID、取消命令及取消抢先到达的处理。真实本地 HTTP 服务覆盖敏感自定义头、重定向、响应上限与连接取消。 |
| 2 | 自建实例路径前缀 | 统一规范化服务器地址；API、Issue/MR 链接、关联解析与 fork 来源支持 `/gitlab` 等前缀；HTTP 按完整实例与最长前缀绑定；同主机多个实例的 SSH 身份不能唯一确定时拒绝自动绑定。浏览器分别覆盖根路径与前缀。 |
| 3 | 桌面原生链路 | GitLab-only 构建实际 Windows 桌面可执行文件；隐藏 WebView 使用真实 IPC、Rust HTTP 和独立系统凭据槽完成 15 项验收。服务端为本地模拟 GitLab，令牌为随机合成数据，测试结束删除测试凭据。 |
| 4 | 统一装配和 CI | `plugins.config.json` 统一描述插件模块、认证 UI 和原生 feature；生成并校验装配文件；CI 增加 GitLab-only、无插件构建、无 GitHub 原生测试/Clippy 及原生链路验收。远端 CI 尚未执行。 |
| 5 | 分域接口、状态和 UI | 客户端拆为认证、仓库、任务、代码托管、CI 接口；插件只实现实际贡献的可选域及方法。公共网关同时检查方法和能力声明；协作 Store 提取 PR/CI slice，保留统一身份与上下文失效机制。导航、连接入口和写操作按能力展示或禁用。 |
| 6 | 清理旧兼容层 | 移除旧平台 Service、Store 别名、重复视图及废弃导入。测试显式选择适配器，公共生产层的架构测试不再给兼容路径放行。历史用户数据迁移继续保留。 |

### 插件接入与构建

1. 在 `src/plugins/<id>` 实现插件。`ProviderClient` 必须提供认证契约，可选提供 `repository`、`taskTracking`、`codeHosting`、`ciCd` 方法集合。完整托管平台可通过 `contributeAllDomains` 贡献完整客户端；只读或单域插件不必填充其他域的空实现。
2. 在 manifest 中声明实际支持的能力及 `primaryDomain`。读任务、写任务、评审、合并、日志、调度等分别授权；平台支持不等于当前令牌有权限，403 仍正常显示错误。单独任务和 CI 插件也有设置页连接入口。
3. 在 `plugins.config.json` 添加模块及所需可选认证 UI、原生 feature，运行 `npm run plugins:generate`，再运行 `npm run check:plugins`。不要手改生成的 `src/plugins/index.ts` 和 `ui.ts`。带连字符的插件 ID 对应驼峰导出名，例如 `my-host` 对应 `myHostPlugin`。
4. 共享传输使用 `providerHttpRequest` 或 `providerFetch`；取消信号必须继续传递至宿主服务。不要自行跟随认证 API 重定向或在日志中输出令牌。自建服务器地址统一调用 `normalizeServerUrl`，路径前缀不能混入项目 namespace。
5. 加入插件隔离、实际能力和必要平台语义测试，验证禁用/不装配该插件后其他域及本地 Git 继续工作。

PowerShell 构建示例：

```powershell
# 默认插件装配
npm run check:plugins
npm run build

# 仅 GitLab 的桌面可执行文件（不生成安装包）
$env:AUUGIT_PLUGINS = 'gitlab'
node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --ci -- --no-default-features

# 无外部插件的本地 Git 前端
$env:AUUGIT_PLUGINS = 'none'
npm run build
Remove-Item Env:AUUGIT_PLUGINS

# 真实 Windows WebView、IPC、凭据链路，本地模拟服务端
npm run test:integrations:native
```

原生 feature 仍须传给 Cargo/Tauri CLI；前端环境变量不会隐式改变 Cargo feature。装配校验检查默认 feature 和目录是否一致，隔离测试检查实际模块依赖图，防止只隐藏入口但仍加载 GitHub。

### 本轮验证记录

| 检查 | 结果 |
|---|---|
| 完整 `npm test` | 650 项通过，无失败 |
| 能力 UI、插件隔离、Issues、PR 评审与总览收尾专项 | 62 项通过，无失败 |
| 共享传输与 GitLab/Gitea 适配器收尾专项 | 12 项通过，无失败 |
| 浏览器集成、Issues、总览与历史回归 | 分两组完成，11 项及 8 项通过；沿用原截图基线 |
| `cargo test --locked --lib` | 55 项通过 |
| `cargo test --locked --lib --no-default-features` | 54 项通过 |
| 默认和无 GitHub 原生 Clippy | 通过，警告视为错误 |
| GitLab-only Windows 桌面构建 | 通过，`src-tauri/target/debug/auugit.exe` |
| 无插件前端构建 | 通过 |
| 原生 WebView/IPC/系统凭据链路 | 15 项通过，独立测试槽位已清理 |
| ESLint、TypeScript、默认生产构建及装配校验 | 通过；保留现有大分包体积提示 |

完整回归之后的能力边界及传输收尾由上述专项覆盖。本轮测试数分别属于完整回归、专项和浏览器分组，不能相加为一次完整测试总数。原生链路验收报告写入忽略目录 `test-results/integration-smoke.json`；浏览器测试会清理该目录，因此原生链路验收在浏览器回归后重新执行并通过。

用户目前没有 GitLab 项目，因此真实 GitLab 服务的版本、权限、项目设置及实际创建/合并 MR、调度流水线仍未联调。没有以模拟服务代替这项外部验收的结论。Windows 安装包安装、升级与卸载也不在本轮可执行文件构建及隐藏 WebView 验收的覆盖范围内。本轮未提交或发布代码。
