# AuuGit

[简体中文](README.md) · [English](README.en.md)

一个基于 Tauri、React 和 TypeScript 的桌面 Git 客户端，把日常 Git 操作、可视化分支管理、GitHub 协作和 AI 辅助放进同一个工作区。

AI 用于解释变更、生成说明和提供建议；应用不内置自主编码 Agent。

[下载安装包](https://github.com/superauu/auu_github_desktop/releases/latest) · [反馈问题](https://github.com/superauu/auu_github_desktop/issues)

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 多仓库工作区 | 使用标签页切换仓库，管理本地分支、远程分支、标签、Stash 和 Worktree。 |
| 变更与提交 | 查看文本差异，按文件、代码块或变更行暂存；通过分组整理提交。 |
| 可视化分支操作 | 在提交图中拖动分支标签，预览合并或变基；拖动提交到当前分支以 Cherry-pick。 |
| 历史整理与恢复 | 对尚未发布的线性提交排序、Squash 或 Fixup；使用恢复点与 Reflog 查看差异、找回提交。 |
| 图片对比 | 并排或叠加查看图片变更，调整叠加透明度。 |
| 历史搜索 | 按提交信息或代码增删内容搜索。 |
| GitHub Pull Requests | 查看、创建、审查和合并 PR，生成 PR 描述。 |
| GitHub Actions | 查看工作流、运行记录、Jobs 和步骤，获取已完成任务的日志，触发、重跑或取消运行。 |
| AI 辅助 | 生成提交说明，解释提交和分支差异，诊断 Git 错误，建议文件分组和冲突解决内容。 |
| 个性化 | 中英文界面、主题、紧凑模式、布局调整和光标主题。 |

手动运行 GitHub Actions 时，会从所选分支读取工作流定义，显示必填项、默认值和选项；环境参数可填写仓库中配置的环境名称。加载失败时可重试，不会提交旧分支的参数。

推送时可选择 remote 和目标分支，窗口会显示仓库地址与推送方向。默认目标遵循分支 `pushRemote`、仓库 `remote.pushDefault` 和跟踪配置；“记为默认推送远程”与“设置跟踪分支”分别控制推送目标和后续拉取来源。“提交并推送”会先选择目标，取消时不会创建提交。标签推送和远程标签删除也支持选择 remote。

远程分支右键菜单支持删除服务器上的分支，确认框显示目标仓库与分支，本地分支保留。工具栏获取会更新所有 remote；更多操作及远程管理中可获取并清理失效远程引用。在设置的远程管理中，可独立选择 PR / Actions 对应的 GitHub remote。领先与落后数量始终相对于状态栏显示的跟踪分支。创建 PR 时可选择来源 GitHub 仓库及已发布的远程分支名，支持跨 fork 的同名分支；切换协作仓库后会重新加载目标分支。推送成功后若默认远程偏好保存失败，会单独警告，保留推送成功结果。

提交面板在常见笔记本宽度下默认与差异并排显示，也可在外观设置中选择自动、并排或抽屉模式。分支、PR 和工作流列表支持键盘移动与确认，分支行可用 Shift+F10 打开操作菜单。仓库工具集中提供恢复中心和诊断。推送偏好与跟踪设置位于高级选项；错误提示先显示处理建议，技术详情仍可展开查看和复制。

“AI 规划全部变更”使用已配置的 AI 分析已暂存、未暂存及新文件，建议提交数量、顺序、分组理由和每个提交的标题与说明。确认前可移动文件、编辑说明、调整顺序或合并分组；确认后批量创建提交，也可先选远程目标，在全部提交成功后推送一次。当前按完整文件拆分，部分暂存文件会使用完整工作区版本。分析后内容变化会阻止执行；中途失败保留已完成的提交并报告剩余操作，推送失败只重试推送。原有提交草稿保持不变。

Git 写操作会在状态栏显示当前操作、已用时间和排队数量。“取消排队”只跳过尚未开始的任务，正在执行的操作会继续完成。主视图出现渲染异常时，可重试或复制诊断信息；重新加载整个窗口前请先保存编辑内容。

恢复中心支持为手动恢复点填写名称、给已有恢复点改名或删除。名称保存在仓库本地配置中，关联 Worktree 共享名称；留空则显示默认名称。删除只移除所选恢复点，不改变分支或工作区文件；如果没有其他引用保留相关提交，这些提交以后可能被 Git 清理。

变更列表的文件复选框只负责勾选批量操作的文件：勾选后可统一暂存、取消暂存或忽略，Shift 勾选连续选择。暂存单个文件使用行尾的加号/减号按钮、空格键或右键菜单。“未跟踪文件”分区的“全部添加”可一键跟踪并暂存全部新文件。

合并、变基与历史整理提供预览或恢复机制。历史整理会阻止改写已存在于已获取远程分支上的提交；操作前请先获取远端更新。

## 安装与使用

当前发布流程提供 **Windows x64** 安装包和独立可执行文件。

1. 安装 [Git](https://git-scm.com/downloads)，并确保应用能够找到 Git。
2. 在 [Releases](https://github.com/superauu/auu_github_desktop/releases/latest) 下载 `AuuGit_<版本>_x64-setup.exe`，按提示安装；也可选择 MSI。
3. 打开已有仓库或克隆仓库。GitHub 协作功能可通过应用中的账号设置连接 GitHub。

Release 中的 `auugit.exe` 是独立可执行文件。需要自动升级时，建议使用安装包版本。

### 自动更新

桌面应用启动约 15 秒后检查新版本，发现更新后在状态栏保留入口。可以查看版本说明、选择下载并查看进度，或稍后处理。下载完成后，点击“安装并重启”并确认才会安装；有仓库 Git 任务尚未结束时会阻止安装。安装前请先保存编辑内容。更新包通过签名验证；版本信息由 Release 中的 `latest.json` 提供。

浏览器开发模式不执行桌面应用更新。检查失败时，可从 Releases 手动下载安装包。

### 后台刷新与最近操作

活跃窗口每 10 秒检查外部变更，空闲 2 分钟后降至每 30 秒，空闲 5 分钟后降至每 60 秒。隐藏窗口和正在执行 Git 写操作的仓库会跳过后台检查；重新聚焦时合并触发刷新。相同差异会复用解析结果，连续编辑即使 Git 状态码相同也会重新读取。

状态栏的“最近操作”保留本次会话最近 100 条 Git 写操作与通知，可筛选失败、复制详情、重试失败的获取操作，或打开对应仓库的恢复中心。耗时包含排队等待；记录不写入磁盘，关闭应用后清空。

### AI 设置

提交说明和 PR 描述支持本地规则或模板，无需 API Key。需要模型生成、变更解释或冲突建议时，在设置中选择自定义大模型 API，再选择服务支持的协议：**OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages**。填写对应的接口地址、模型名称和 API Key，使用“测试连接”验证配置。

地址可以填写 Base URL（例如 `https://api.openai.com/v1`、`https://api.anthropic.com/v1`），也可以填写完整接口路径。旧配置默认使用 Chat Completions；切换协议会保留已有地址、模型和密钥，请按服务要求调整。

浏览器开发模式通过本机开发服务器转发 AI 请求，以兼容不支持浏览器跨域访问的服务。OpenCode Go 请求会自动附带 AuuGit 客户端标识和本次应用会话的稳定 ID，无需手动填写请求头。

调用外部模型时，相关代码、差异或错误上下文会发送到你配置的服务。桌面端的 GitHub Token 和 AI API Key 使用系统凭据存储；浏览器开发模式仅在内存中保留凭据。AI 生成内容应在应用或提交前核对。

## 本地开发

准备以下环境：

- Node.js 20.19+、22.13+ 或 24+ 及 npm。
- Git。
- 构建桌面端时需要 Rust stable，以及对应平台的 [Tauri 开发依赖](https://v2.tauri.app/start/prerequisites/)。Windows 需要 Microsoft C++ Build Tools 和 WebView2。

```sh
git clone https://github.com/superauu/auu_github_desktop.git
cd auu_github_desktop
npm ci
```

启动浏览器开发模式：

```sh
npm run dev
```

打开 `http://localhost:5173`。开发服务器包含访问本机仓库的接口，请仅在本机使用。Git 操作会作用于你选择的真实仓库。

开发接口默认只允许访问本项目目录及其子目录。需要访问其他仓库时，在启动前配置 `AUUGIT_DEV_ROOTS`；多个目录使用系统路径分隔符（Windows 为分号）分隔，例如 PowerShell：`$env:AUUGIT_DEV_ROOTS='E:\code\auu_github_desktop;E:\repos'`。目录范围也会检查符号链接和新建目录的已有父目录。

桌面应用通过原生目录选择器记录授权路径；手工输入或恢复旧版本保存的路径时，首次访问需要确认，后续启动会记住选择。文本编辑与忽略规则文件限 8 MiB；保存会检查原内容并原子替换，应用内写入串行执行。外部程序在最后一次检查与替换之间修改文件的极短窗口仍然存在。

开发端只接受服务器 PATH 中的 Git，或启动前通过 `AUUGIT_GIT_BINARY` 指定的程序；网页传入的同名 `git.exe` 不会自动获得执行权限。桌面端首次使用自定义 Git 路径时会显示原生确认框。已授权的仓库文件夹可在“设置 → Git”中撤销，撤销后重新打开需要再次确认。

启动桌面开发模式：

```sh
npm run tauri -- dev
```

验证与构建：

```sh
npm test
npm run lint
npm run check:release
npm run build
npm run tauri -- build -- --locked
```

`npm run build` 生成前端文件；桌面安装包通过最后一条命令生成，位于 `src-tauri/target/release/bundle/`。带自动更新签名的构建还需要匹配应用公钥的签名私钥配置。

凭据存储按平台启用：Windows Credential Manager、macOS Keychain、Linux keyutils 与 Secret Service。Linux 运行时需要可用的 Secret Service 和会话 D-Bus。当前发布和桌面回归验证仍以 Windows x64 为准。

## 项目结构

```text
src/
  components/    通用组件、布局与设置
  features/      仓库、Git、PR 和 Actions 界面
  services/      Git、GitHub、AI 与自动更新服务
  stores/        应用状态
  i18n/          中英文文案
src-tauri/       Rust 后端、桌面配置与能力声明
tests/           回归测试
scripts/         发布版本校验
.github/workflows/  验证、构建与发布流程
```

## 发布新版本

1. 同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中的应用版本号。
2. 运行测试、版本校验和前端构建。
3. 配置 GitHub Actions Secrets：`TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，并保持私钥与应用内更新公钥匹配。
4. 推送匹配应用版本号的 `v<版本>` 标签。Windows 发布工作流会构建、签名并上传安装包及更新清单到 GitHub Release。

手动触发构建会生成 Actions 构建产物；只有推送版本标签才会执行当前流程中的 Release 发布步骤。

## 反馈与贡献

欢迎提交 [Issue](https://github.com/superauu/auu_github_desktop/issues) 或 Pull Request。报告问题时，请说明应用版本、系统版本、复现步骤和实际表现；涉及 Git 操作时，也请描述分支与工作区状态。
