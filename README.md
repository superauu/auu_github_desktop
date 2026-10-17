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

合并、变基与历史整理提供预览或恢复机制。历史整理会阻止改写已存在于已获取远程分支上的提交；操作前请先获取远端更新。

## 安装与使用

当前发布流程提供 **Windows x64** 安装包和独立可执行文件。

1. 安装 [Git](https://git-scm.com/downloads)，并确保应用能够找到 Git。
2. 在 [Releases](https://github.com/superauu/auu_github_desktop/releases/latest) 下载 `AuuGit_<版本>_x64-setup.exe`，按提示安装；也可选择 MSI。
3. 打开已有仓库或克隆仓库。GitHub 协作功能可通过应用中的账号设置连接 GitHub。

Release 中的 `auugit.exe` 是独立可执行文件。需要自动升级时，建议使用安装包版本。

### 自动更新

桌面应用启动约 15 秒后检查新版本。发现更高版本后，会下载安装更新并提示重启。更新包通过签名验证；版本信息由 Release 中的 `latest.json` 提供。

浏览器开发模式不执行桌面应用更新。检查失败时，可从 Releases 手动下载安装包。

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
