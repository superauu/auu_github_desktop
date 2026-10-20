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

- Node.js 20 或更高版本及 npm。
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

启动桌面开发模式：

```sh
npm run tauri -- dev
```

验证与构建：

```sh
npm test
npm run check:release
npm run build
npm run tauri -- build -- --locked
```

`npm run build` 生成前端文件；桌面安装包通过最后一条命令生成，位于 `src-tauri/target/release/bundle/`。带自动更新签名的构建还需要匹配应用公钥的签名私钥配置。

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
