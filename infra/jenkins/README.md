# 本地 Jenkins 集成测试环境

用于开发、手工测试 AuuGit 的 Jenkins 集成。正式构建、签名和发布继续使用现有 GitHub Actions；此环境没有 GitHub webhook、SCM 轮询、应用编译或发布步骤。

## 启动与访问

要求 Docker Desktop 已启动并使用 Linux containers，以及 Node.js 20 或以上。在仓库根目录运行：

    node infra/jenkins/local.mjs up

访问 http://localhost:8080/ ，Pipeline 为 http://localhost:8080/job/auugit-mock/ 。端口只绑定本机回环地址。首次启动会构建带 Pipeline、阶段 REST API、JUnit 和权限管理插件的镜像，并自动初始化任务及账号。

账号密码和 API Token 保存在仓库根目录 `.local/jenkins/connection.json`，该目录已被 Git 忽略：

| 用户名 | 用途 | 权限 |
| --- | --- | --- |
| admin | 浏览器管理 | 管理员 |
| auugit | AuuGit 集成 | 读取、触发构建、取消排队与运行中的构建 |
| auugit-reader | 权限不足测试 | 只读；触发和取消应返回 403 |

浏览器登录使用 password；AuuGit 和 API 请求使用用户名与 apiToken 的 HTTP Basic 认证。未登录用户无法读取任务。连接文件和 `.password` 文件均为本机凭证，请勿提交。

配置、账号、Token 和构建历史保存在 `auugit-jenkins-home` Docker volume 中。重启会重新应用本目录的任务和权限定义，但保留历史和已有有效 Token；请在仓库文件中修改模拟 Pipeline。`up` 可重复运行，不会自动触发构建。

## 模拟场景

在任务页选择 Build with Parameters，或运行：

    node infra/jenkins/local.mjs trigger success
    node infra/jenkins/local.mjs trigger failure
    node infra/jenkins/local.mjs trigger unstable
    node infra/jenkins/local.mjs trigger log-heavy
    node infra/jenkins/local.mjs trigger long

| SCENARIO | 行为 |
| --- | --- |
| success | Prepare → Build → Test → Package，结果 SUCCESS |
| failure | Test 阶段主动失败，结果 FAILURE，后续 Package 跳过 |
| unstable | JUnit 中有失败用例，结果 UNSTABLE |
| log-heavy | 默认输出 1000 行，包含 UTF-8 中文和 stderr |
| long | 默认运行 120 秒，每 2 秒输出心跳，可测试刷新、取消及排队 |

任务禁止并发执行，长任务运行时再次触发会排队。可调整 `LONG_SECONDS`（10–600）和 `LOG_LINES`（1–10000）。保留最近 40 次构建、20 次构建的产物。单次构建超时为 15 分钟。

`COMMIT_SHA`、`BRANCH`、`REPOSITORY_URL` 是模拟关联元数据，记录在参数、描述和 `artifacts/build-info.json` 中。CLI 自动带入当前 HEAD、分支和 origin；网页可手填。**不执行真实 Git checkout，不生成 Git 插件的 BuildData/changeSets**。后续若需验证真实 SCM 提交关联，应另建测试仓库和 checkout 任务。

每次构建归档 JSON 摘要和 JUnit XML；完成 Package 阶段还会生成纯文本模拟产物。

## 验证与 API

运行完整烟测会生成成功、失败、不稳定、大量日志和取消构建的历史，并验证认证、权限、阶段、日志增量、排队取消、测试报告和产物：

    node infra/jenkins/local.mjs verify

结果写入 `.local/jenkins/verification.json`。该命令会触发任务并取消它自己创建的长任务；建议在没有手工运行任务时执行。

常用接口（相对于 http://localhost:8080/，均需认证）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | api/json | 任务列表 |
| GET | job/auugit-mock/api/json | 任务详情、参数定义和构建列表 |
| POST | job/auugit-mock/buildWithParameters | 触发构建，SCENARIO 等表单参数 |
| GET | queue/api/json | 构建队列 |
| POST | queue/cancelItem?id=ID | 取消排队 |
| GET | job/auugit-mock/NUMBER/api/json | 状态、参数和产物 |
| GET | job/auugit-mock/NUMBER/wfapi/describe | 阶段状态 |
| GET | job/auugit-mock/NUMBER/consoleText | 完整日志 |
| GET | job/auugit-mock/NUMBER/logText/progressiveText?start=0 | 增量日志，使用 X-Text-Size 继续读取 |
| GET | job/auugit-mock/NUMBER/testReport/api/json | JUnit 测试结果 |
| POST | job/auugit-mock/NUMBER/stop | 取消运行中的构建 |

API Token 认证的 POST 无需额外 crumb；浏览器密码登录仍使用 Jenkins 自身的 CSRF 保护。

取消排队接口可返回 HTTP 204（没有响应体）；集成时应将其视为成功。

## 日常管理

    node infra/jenkins/local.mjs status
    node infra/jenkins/local.mjs logs
    node infra/jenkins/local.mjs stop

停止后重新执行 `up` 可恢复。修改 Jenkinsfile 或初始化脚本后执行以下命令重新加载：

    docker compose -f infra/jenkins/compose.yaml restart

镜像中没有 Docker socket、应用构建工具链或发布密钥；唯一执行器只负责这些模拟步骤，无需 Windows Agent。
