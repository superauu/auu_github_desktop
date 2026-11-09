# Jenkins 集成

Jenkins 作为 `ci` 装配档的独立插件贡献 `ci-cd` 域。连接、凭证、仓库 Job 映射和客户端独立于代码托管账号；GitHub/GitLab/Gitea 的 CI 仍可在原页面使用。此功能不修改 `.github/workflows`，不会为仓库创建 webhook 或自动触发正式构建。

实现边界：`CiPlugin` 提供客户端工厂，`ciStore` 管理非敏感连接及按仓库的映射，`ciService` 通过现有 operation → domain/capability 表执行双检网关。公共界面只消费 `CiCdClient`，不包含 Jenkins API 路径或状态分支。原托管 `CollaborationService` 槽位不重绑；来源切换只影响流水线页面。原生参数通过可选的 `getWorkflowInputs` 操作提供，归属 `ci-cd:dispatch`，不伪造工作流源文件。

## 连接本地测试环境

1. 启动 Docker Desktop（Linux containers），在仓库根目录运行 `node infra/jenkins/local.mjs up`。
2. 在桌面版 AuuGit 打开需要关联的仓库，进入 **设置 → 集成 → CI/CD → Jenkins → 添加连接**。
3. 服务地址填写 `http://localhost:8080`，用户名填写 `auugit`，API Token 从本机 `.local/jenkins/connection.json` 的 `users.auugit.apiToken` 读取。显示名可填写“本地 Jenkins”。
4. Job 路径填写 `auugit-mock`，保存时验证账号和 Job 可读性，并建立当前仓库映射。
5. 打开 **CI/CD**，在 **CI 来源** 中选择该连接。选择 **托管平台 CI** 可以回到原有 GitHub Actions/GitLab CI/Gitea Actions。

新增连接会选中该仓库的独立 CI 来源；来源选择按仓库保存。同一实例、用户名重复连接会更新既有连接的凭证。已连接的实例可以通过卡片中的“映射当前仓库”操作关联其他仓库；每行填写一个完整 Job 路径，如 `team/project/main`。启用、停用、测试与删除均在 Jenkins 卡片内完成。

桌面端请求复用通用 Rust `provider_http_request`，避免 WebView CSP/CORS 限制；凭证复用 OS Keyring 的 `integration_token:<connectionId>` 条目，不进入 localStorage、日志或仓库文件。浏览器开发模式的凭证只保留在会话内，且直连自建 Jenkins 仍受浏览器 CORS 限制；实际本地实例联调可使用桌面开发模式或下述 CLI 烟测。

## 已支持能力

| 能力 | 行为 |
| --- | --- |
| `ci-cd:list-pipelines` | 列出当前仓库映射的 Job、最近 50 条构建、相关排队项、构建详情及阶段；页面每 3 秒刷新 |
| `ci-cd:job-logs` | 读取完整构建控制台，通过服务端 `X-Text-Size` 字节偏移增量拉取；支持运行中日志与 UTF-8 |
| `ci-cd:dispatch` | 从 Job 参数定义生成输入表单，支持字符串、文本、布尔和选项；触发普通或参数化构建 |
| `ci-cd:cancel` | 使用 `/stop` 取消运行中的构建；使用队列 API 取消排队项，接受 HTTP 204 成功响应 |

阶段读取要求 Pipeline Job 和 Pipeline REST API 插件；本仓库的 Docker 环境已安装。缺少阶段 API 时显示错误，构建状态和完整日志入口仍可使用。UNSTABLE 显示“不稳定”，ABORTED 显示“已取消”，未知结果不会显示成成功。密码、文件、凭据等参数不会作为普通文本表单发送；遇到这类参数会提示去 CI 平台操作。

当前不声明 `workflow-source`、`rerun` 或 `commit-checks`：Jenkinsfile 不冒充 YAML，不假设安装 Rebuild 插件，也不将模拟 SHA 参数作为真实 SCM 检查结果。构建详情可展示 Git 插件的 revision/branch，模拟 Pipeline 则使用 `COMMIT_SHA` 和 `BRANCH` 参数作为展示元数据。

账号实际权限由 Jenkins 服务端执行。`auugit-reader` 可用于验证读取正常但触发/取消返回 403 的情况；客户端会显示错误而不会报告提交成功。API 请求不跟随重定向，凭证不会发送到响应中的其他实例 URL。

## 验证

在本地 Docker 环境运行真实适配器与 domain 通道烟测：

    node scripts/smoke-jenkins.mjs

烟测仅操作 `auugit-mock`，生成成功、失败、不稳定、大量日志和取消的历史，校验增量日志、阶段、队列取消、只读账号及托管通道隔离。结果写入 Git 忽略的 `.local/jenkins/auugit-integration-verification.json`。不会调用 GitHub 构建或发布接口。

离线回归和界面测试：

    node --test tests/jenkins-client.test.mjs tests/plugin-capabilities.test.mjs
    npx playwright test e2e/jenkins.spec.ts

构建裁剪仍通过 `AUUGIT_PLUGINS`；例如 `jenkins` 可独立装配，`gitlab` 与 `none` 不包含 Jenkins 客户端。
