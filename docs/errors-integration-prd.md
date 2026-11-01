# Errors（错误追踪集成）需求文档

| 项 | 内容 |
|---|---|
| 文档版本 | v2.1 |
| 状态 | 技术修订版（功能范围与 v2.0 一致），按里程碑逐步开发 |
| 日期 | 2026-11-01 |
| 适用产品 | AuuGit Desktop |
| 覆盖 | 取代 v1.0 初稿《Issue Center / Error Tracking Integration》；v2.1 为 v2.0 的技术修订，修订记录见文末 |

---

## 1. 背景与目标

开发者需要在 Sentry、Rollbar、Bugsnag 等错误追踪平台上发现异常、查看堆栈，再切回本地定位代码、建分支、提交、发 PR，最后回平台确认解决。整个过程横跨多个工具，错误与修复代码之间没有关联。

本模块通过**内置 Provider 适配器**将第三方错误追踪平台接入 AuuGit，使 Git Client 成为处理程序错误的入口：

```
Error → Branch → Code Fix → Commit → PR → Verification → Resolve
```

**主要目标**

1. 通过统一接口连接不同错误追踪平台（首个为 Sentry）。
2. 在客户端内统一查看、管理外部错误，并与当前仓库建立映射。
3. 从错误直接创建修复分支，Issue、Branch、Commit、PR 相互引用。
4. 修复后回写状态（标记已解决 / 下个 release 解决）。
5. 支持利用 AI 分析与修复错误（复用现有 AI 服务层与审查放行流）。
6. 为未来其他工作域（任务追踪、CI/CD、可观测性）提供域化架构基础。

**非目标**

- 不重造 Sentry 服务端；采集、聚合、告警、长期存储仍由第三方平台负责。
- v1 不做运行时第三方插件加载；"自定义 Provider"以声明式 HTTP 配置形式过渡。
- 不做事件级（event）明细管理，只处理聚合后的 issue/group；但允许获取**单个代表性事件**（latest event）用于渲染堆栈，二者不冲突。
- 不满足导航准入条件的外部系统（如值班系统）不进主导航，仅作上下文或外链。

## 2. 术语与三层词表

| 术语 | 定义 | 示例 |
|---|---|---|
| **Provider** | 外部服务的适配器，提供数据与能力 | Sentry、Rollbar、Bugsnag |
| **Domain（工作域）** | 用户的工作场景，导航的单位，**由核心定义** | `error-tracking` |
| **Connection（连接）** | Provider 的一个实例：凭证 + 配置，全局层 | "公司 Sentry"、"个人 Sentry" |
| **Project Mapping（项目映射）** | 外部项目 ↔ 本地仓库的绑定，**仓库级** | sentry:proj-frontend ↔ 当前仓库 |
| **Capability（能力）** | 域视图可调用的原子能力，词汇表由核心定义 | `error-tracking:stacktrace` |

三层词表（扩展方向自下而上受控）：

```
provider（几十个，可自由增加）      ← 适配器，永远不产生菜单
domain（个位数，核心注册表定义）     ← 菜单的单位
导航（overview / changes / errors…）← 域有连接后才出现
```

## 3. 设计原则（写入实现的强制约束）

1. 导航以工作域为单位，不以第三方服务为单位。
2. Provider 只提供数据与能力，不直接创建导航项。
3. 同一 Domain 下多个 Provider 统一显示，并支持按来源筛选。
4. 一个 Provider 可以贡献多个 Domain（`domains[]` + 按域能力声明）。
5. Domain 由核心定义并注册，Provider 不得注册主导航域；未识别的 Domain 不生成菜单。新 Domain 由产品团队在核心版本中提供。
6. **准入条件**：与当前仓库的开发生命周期（开发/变更/测试/审核/发布/修复）直接相关，**且通过外链替代测试**——若该域对用户的全部价值可以被详情页里一个外链完整替代，它就不配拥有菜单。
7. 域菜单的存在性 = 存在已配置且启用的连接（**不看实时健康状态**）；连接故障在页内按连接降级展示，不隐藏导航。
8. 不满足准入条件的外部系统，作为其他工作域的详情上下文、辅助卡片或外链接入（例：PagerDuty Incident 关联到某个 Release 时，在 Release/错误详情中显示为上下文）。

## 4. 总体架构

```
┌─────────────────────────────────────────────────────┐
│ 导航 / 域视图：Errors（v1）｜Tasks · CI/CD · Observability（预留） │
├─────────────────────────────────────────────────────┤
│ Provider Registry：连接管理、凭证、来源聚合、能力声明、语义归一     │
│   Sentry │ Rollbar │ Bugsnag │ 声明式 HTTP Provider（P2）        │
├─────────────────────────────────────────────────────┤
│ 凭证层：OS Keyring（复用现有 keyring = "3" 基建）                │
├─────────────────────────────────────────────────────┤
│ Git Workflow Engine：Branch · Commit · PR · AI Fix · 审查放行     │
│ （已存在，集成层调用，不新建引擎）                                │
└─────────────────────────────────────────────────────┘
```

### 4.1 Domain 注册表（核心专有）

```ts
// src/services/errors/types.ts
type DomainId = 'error-tracking' | 'task-tracking' | 'ci-cd' | 'observability';
// v1 仅实现 error-tracking 的域视图；其余仅在注册表占位（无视图、无 provider、无菜单）

interface DomainDefinition {
  id: DomainId;
  capabilities: readonly string[]; // 核心定义的能力词汇表，见 4.3
}

const DOMAIN_REGISTRY: Record<DomainId, DomainDefinition> = { /* ... */ };
```

### 4.2 Provider Manifest（多域贡献）

```ts
interface ProviderManifest {
  id: string;                 // 'sentry' | 'rollbar' | ...
  name: string;
  domains: DomainContribution[];
}

interface DomainContribution {
  domain: DomainId;
  capabilities: string[];     // 必须是核心词汇表中的能力，见 4.3
}

// 示例：一个平台贡献多个域
const datadog: ProviderManifest = {
  id: 'datadog', name: 'Datadog',
  domains: [
    { domain: 'error-tracking', capabilities: ['error-tracking:list-issues', 'error-tracking:issue-detail', 'error-tracking:stacktrace'] },
    // 示意：observability 的能力词汇表在该域落地时由核心定义
    { domain: 'observability',  capabilities: ['observability:query-logs', 'observability:view-metrics'] },
  ],
};
```

Provider 注册表是编译期常量（内置适配器），v1 不提供运行时注册入口。

### 4.3 Capability 词汇表（核心治理）

能力字符串由核心枚举，强制 `domain:action` 命名空间，Provider 不得发明词汇表之外的字符串：

```
error-tracking:list-issues      列出 issue
error-tracking:issue-detail     issue 详情
error-tracking:latest-event     最新事件（含完整堆栈）
error-tracking:stacktrace       提供堆栈帧
error-tracking:suspect-commits  提供嫌疑 commit
error-tracking:resolve          标记已解决
error-tracking:resolve-in-release  标记"下个 release 解决"
error-tracking:ignore           忽略
```

能力类型为核心字面量联合，词汇表外的字符串无法通过编译（拼写错误编译期暴露）：

```ts
type ErrorTrackingCapability =
  | 'error-tracking:list-issues'
  | 'error-tracking:issue-detail'
  | 'error-tracking:latest-event'
  | 'error-tracking:stacktrace'
  | 'error-tracking:suspect-commits'
  | 'error-tracking:resolve'
  | 'error-tracking:resolve-in-release'
  | 'error-tracking:ignore';
```

域视图按 capability 渲染操作项：来源未声明 `resolve` 就不显示"标记已解决"按钮，**禁止到处 if 判断字段缺失**。

**声明能力 ≠ 生效能力**：manifest 声明的是适配器实现的能力；单次操作能否执行还取决于当前凭证的实际权限与 issue 当前状态。权限不足（如 403）按**操作级错误**处理（见 §8.3），不得升级为连接故障，也不得据此改写 `connection.domains`。

### 4.4 导航显示逻辑

存在性与健康态分离（原则 7 的实现）：

```ts
function shouldShowDomain(domain: DomainId, connections: ProviderConnection[]): boolean {
  // 菜单存在性只看"配置过且启用的连接"，不看当前健康状态
  return connections.some(c => c.enabled && c.domains.includes(domain));
}
// connection.status === 'connected' 只决定页内形态：正常 / 按连接降级横幅 / 重连引导
```

`connection.domains` = Provider manifest 声明的域 ∩ 该凭证实际可访问的域。**仅在权限检查成功时重算**（连接测试/刷新返回成功）；网络异常或请求失败视为"本次未知"，**保留上一次已验证的域集合**——网络故障不是"权限为空"，不得导致菜单消失。

## 5. 统一数据模型

类型定义于 `src/services/errors/types.ts`（参照 `src/services/github/issueTypes.ts`）。**所有字段允许缺失**，缺失不影响基础渲染。

### 5.1 UnifiedErrorIssue

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `connectionId` | string | ✓ | 来源连接（消歧"公司 Sentry" vs "个人 Sentry"） |
| `providerId` | string | ✓ | 来源平台 |
| `externalProjectId` | string | ✓ | 外部项目标识 |
| `issueId` | string | ✓ | 平台内唯一标识（聚合后的 group，非 event） |
| `shortId` | string? | — | 平台短 ID（Sentry: `PROJ-ABC`），用于分支名/引用标记 |
| `fingerprint` | string? | — | 平台聚合指纹，预留去重 |
| `title` | string | ✓ | 错误标题 |
| `message` | string? | — | 错误内容 |
| `severity` | `critical \| error \| warning \| info` | ✓ | **归一后**严重级别（见 5.2） |
| `status` | `unresolved \| resolved \| ignored` | ✓ | **归一后**状态（见 5.2） |
| `rawStatus` | string? | — | 平台原始状态，详情页展示 |
| `firstSeen` / `lastSeen` | ISO 8601 | ✓ | 首次/最近发生时间 |
| `eventCount` | number? | — | 发生次数 |
| `affectedUsers` | number? | — | 受影响用户数（平台支持才提供） |
| `stacktrace` | `StackFrame[]?` | — | 堆栈帧：`{ file, line, col?, function?, contextLines? }` |
| `release` | string? | — | 错误发生的版本 |
| `suspectCommit` | `CommitRef?` | — | 嫌疑 commit（sha/消息/作者），可跳转 commit 详情/blame |
| `environment` | string? | — | 运行环境 |
| `externalUrl` | string | ✓ | 平台原始详情页 |
| `rawData` | unknown? | — | 平台特有数据，详情页折叠区展示 |

### 5.2 语义归一（adapter 层职责，表驱动测试）

severity 归一：

| 平台原始值 | 归一结果 |
|---|---|
| Sentry: fatal / error / warning / info, debug | critical / error / warning / info |
| Rollbar: critical / error / warning / info | critical / error / warning / info |
| Bugsnag: error / warning / info | error / warning / info |

status 归一：

| 平台原始值 | 归一结果 |
|---|---|
| Sentry: unresolved / resolved / ignored / reprocessing* | unresolved / resolved / ignored / unresolved* |
| Rollbar: active / resolved / muted | unresolved / resolved / ignored |

*reprocessing 归一为 unresolved 并在详情页用 rawStatus 标注。

### 5.3 IssueGitLink（Issue ↔ Git 实体持久化关联）

错误与分支/提交/PR 的关联必须持久化，**不能只靠分支名或提交信息反推**。用户建了修复分支、重启应用后，必须仍能从 issue 找回全部关联实体。

```ts
interface IssueGitLink {
  id: string;
  connectionId: string;
  externalProjectId: string;
  issueId: string;             // 平台 issue/group id（含 shortId）

  repoKey: string;             // 仓库稳定标识，见下
  branchNames: string[];       // 关联分支（可多个）
  commitShas: string[];
  pullRequests: { provider: string; number: number; url: string }[];

  createdAt: string;
  updatedAt: string;
}
```

- **仓库身份（repoKey）**：规范化 remote origin URL 优先（去末尾 `.git`、统一大小写与协议），无 remote 时回退工作区绝对路径。**不得只依赖路径**——用户移动仓库目录后凭 remote URL 重新关联。
- **持久化**：仓库级本地存储（与 §6.2 项目映射同位置同键规则）。
- **失效处理**：分支被删除/重命名后，链接标记为 stale 并在详情页如实显示（"关联分支已删除"），**不得静默指向其他分支**；commit SHA 天然稳定；PR 开合/合并状态在详情页实时查询。
- 生命周期：一个 issue 可关联多个分支；支持手动解除关联；任何变更刷新 `updatedAt`。

## 6. 连接与配置模型

### 6.1 Connection

```ts
interface ProviderConnection {
  id: string;                  // uuid，keyring 条目与映射引用它
  providerId: string;
  displayName: string;         // 用户自定义，如"公司 Sentry"——同平台多连接的消歧单位
  enabled: boolean;            // 用户开关；false 时不参与 shouldShowDomain
  status: 'connected' | 'error' | 'unverified';  // 健康态，仅在测试/刷新时变更
  statusMessage?: string;
  baseUrl?: string;            // 支持自托管 Sentry；默认 https://sentry.io
  orgId?: string;              // 连接绑定的工作组织
  domains: DomainId[];         // 重算结果，见 4.4
  // token 永远不落此结构——仅存 keyring，引用为 keyring 条目 integration_token:<id>
}

interface ProjectMapping {
  connectionId: string;
  externalProjectId: string;
  externalProjectName: string;
  /** 仓库级存储：随当前仓库持久化，切换仓库上下文只看到该仓库的映射 */
  sourcePathPrefixMap?: { from: string; to: string }[]; // 堆栈路径→本地路径前缀映射
}
```

### 6.2 存储要求

| 数据 | 位置 | 说明 |
|---|---|---|
| Token 等凭证 | OS Keyring | 新命令 `store_integration_token` / `get_integration_token` / `delete_integration_token`，条目 `auugit / integration_token:<connectionId>`，照 `store_forge_token` 的 service 白名单模式。**绝不入 localStorage / settings / 日志 / 崩溃报告** |
| 非敏感连接配置 | localStorage 独立键 `auu_git_error_connections` | 仿 `auu_git_forge_accounts` 先例，不塞进扁平的 `auu_git_settings` |
| 全局偏好 | settingsStore 扁平 key | `errorsPollingIntervalSec`（默认 60，下限 30）等 |
| 项目映射 | 随仓库持久化 | 与仓库身份绑定；机制参照 openTabs/recent 的仓库级存储 |
| IssueGitLink（Issue↔Git 关联） | 仓库级本地存储，键为 repoKey（规范化 remote URL 优先，路径回退） | 与项目映射同规则；不依赖工作区路径 |
| issue 数据缓存 | **仅内存** | 隐私最小化，不持久化错误内容 |

### 6.3 连接流程（Sentry，照 ForgeView「未连接→连接表单、已连接→数据面板」模式）

1. 设置 → 集成分区 → 错误追踪 → Sentry →「添加连接」。
2. 表单：显示名、Base URL（默认 sentry.io，可填自托管地址）、Auth Token（粘贴；UI 提示最小权限 scope：`org:read`、`project:read`、`event:read`、`issue:write`）。
3. 测试连接：校验 token、拉取组织列表；失败显示具体错误与重试。
4. 选择组织 → 列出项目。
5. 保存：token 入 keyring，其余配置入本地；`connection.domains` 重算。
6. **项目映射在仓库上下文中建立**：进入某仓库的 Errors 页空态 →「将 Sentry 项目映射到本仓库」→ 从连接的项目中勾选。

### 6.4 安全与隐私（强制）

**Token 的真实边界（v1 与现有 forge/GitHubService 架构保持一致）**：

- 存储：token 仅存 OS Keyring，绝不落 localStorage / settings 文件。
- 使用：桌面端直连 fetch，provider（TS）经 `invoke` 从 keyring 取 token 后放入请求头——**token 会进入 WebView 进程内存**，这是现有架构的事实，v1 接受此边界，不声称"token 不进 TS 层"。
- 不外泄：token 不写日志、不写崩溃报告（crash reporting 面包屑对 Authorization 头强制脱敏，发版前用环境变量钩子验证）。
- 请求目标限制：仅允许 http(s)；自托管 Base URL 由用户显式配置；未来声明式 Provider 的目标地址需用户逐条确认，防止配置被滥用于访问内网资源。
- v2 硬化选项（本期范围外，留档）：Rust 侧"凭证读取 + 授权请求"代理，token 不返回 WebView；触发条件为声明式 Provider 落地或出现明确安全诉求。

其余约束：

- issue 内容不持久化；轮询数据仅存内存。
- 后续所有模块的凭证一律沿用此模式，形成「集成凭证 → keyring」的统一惯例。

## 7. UI 需求

### 7.1 导航

- 左侧导航新增**单一入口** `errors`（图标 + `errors.nav` 文案），**不按 Provider 加菜单**。
- 实现落点：`LeftSidebar.tsx` 顶部导航 + `repoStore.MainNavTab` 条件化（硬编码联合类型改为按连接条件渲染，为域化导航铺路）+ `CenterStage.tsx` 增加 `case 'errors'`（lazy 加载）。
- **徽标**：当前作用域内 unresolved 总数，上限 99+；随同步完成刷新。
- 显示状态机：

| 状态 | 导航表现 |
|---|---|
| 无已配置连接 | 不显示（设置页可发现该功能） |
| 已配置且启用 | 显示 + 徽标 |
| 连接失效/断网 | **仍显示**，页内进错误态（菜单消失会让用户以为功能丢失） |
| `enabled = false` | 消失 |

### 7.2 Errors 页

```
┌─ Errors ────────────────────────────────────────────────┐
│ [本仓库▾] [全部来源▾] [未解决▾] [严重级别▾] [搜索]   12 ⟳  │
├─────────────────────────────────────────────────────────┤
│ ◆ sentry · prod   TypeError: Cannot read 'id' of null   │
│                   128次 · 23用户 · 2分钟前    [修分支] ↗ │
│ ◆ rollbar         Timeout waiting for db pool           │
│                   46次 · 1小时前              [修分支] ↗ │
└─────────────────────────────────────────────────────────┘
```

- **作用域**：`本仓库`（默认，仅当前仓库映射的项目）/ `全部`（所有连接的所有映射项目）。作用域同时决定徽标口径。
- **来源筛选**：`全部来源`（默认，合并列表）或单条连接。连接是筛选项的最小单位（"公司 Sentry" / "个人 Sentry" 可区分）。
- **合并列表**：全部来源时按 `lastSeen` 倒序统一排序；severity 是筛选器 + 行内色点，不参与默认排序。
- **分页与完整性**：合并列表为多源增量合并——每条连接维护独立分页 cursor，首屏各取一页（约 25 条）合并排序；「加载更多」按需拉取各来源下一页后重新归并。全局排序仅对**已加载结果**成立；当存在来源尚未加载完时，列表底部以中性文案说明"仅显示已加载的 N 条"，不给出已到末尾的完整性暗示。
- 行内容：来源 chip（provider 图标 + 连接名 · 项目名）、标题、eventCount / affectedUsers / 相对时间、快捷操作（创建修复分支、打开外链）。末列固定轨道，遵守按钮体系。
- **详情页**：完整堆栈帧（每帧可尝试跳转本地文件）、suspect commit（可用时显示并可跳 commit）、release / environment / rawStatus、rawData 折叠区、头部来源 chip +「在 Sentry 中打开」。单来源筛选下的详情页与合并列表的详情页是**同一组件**。

### 7.3 多来源显示规则

1. 默认合并视图；点选单来源即"单系统模式"，与只装一个插件等价——同一套布局覆盖两种诉求。
2. **按连接粒度降级**：一条连接失效（token 过期/断网），其余来源正常渲染，失效来源位置显示可重试的错误横幅（「公司 Sentry 连接失效：重试 / 去设置」），来源下拉中该项标错误态。禁止整页全有或全无。
3. **双空态**（文案不同，走 i18n）：
   - 无任何连接 →「连接第一个错误追踪平台」→ 引导去设置；
   - 有连接但本仓库无映射 →「将外部项目映射到本仓库」。
4. v1 不做但留口子：连接级静音（计入列表不计入徽标）、跨源 issue 去重。

### 7.4 设置页集成分区

- 设置新增「集成」分区，**按域分组**展示：

```
集成
├─ 错误追踪
│   ├─ Sentry     [已连接 · 公司 Sentry]  [管理]
│   ├─ Rollbar    [可用]  [添加连接]
│   └─ Bugsnag    [可用]
├─ 任务（预留，v1 不显示）
└─ CI/CD（预留，v1 不显示）
```

- 连接管理：启用/禁用开关、编辑、测试连接、删除（删除需二次确认并清除 keyring 条目）。
- 域无任何 provider 时不显示该域分组。

### 7.5 设计规范对齐（强制）

- 全局 `.app-toolbar`（34px）+ `.app-toolbar-group`；筛选栏用 toolbar 体系。
- 按钮使用既有体系（toolbar / icon-sm / icon-xs / outline 变体 / tinted 主按钮），**禁 className 覆写**；同级动作同款式同位置。
- 选中态：primary/12 tint + 2px 青色左条；暗色炭灰 + 青点缀，禁蓝紫底与蓝紫渐变。
- 三栏布局遵守 Radix 滚动容器防截断约束。
- 客户端自身文案全部走 `t()`，i18n 键前缀 `errors.*`（词典 `src/i18n/errors.ts`）；收尾中英双语截图验证。
- **平台返回的内容保持原文**：Exception message、堆栈、文件路径、原始状态值不做翻译（保证可搜索性、AI 上下文与排查一致性）；中文解释只能作为 AI 辅助层的附加信息，原文必须保留。

## 8. 修复工作流

### 8.1 创建修复分支（M4）

- 详情页「创建修复分支」→ 分支名模板（v1 默认，后续可配置）：
  `fix/{provider}-{shortId}-{titleSlug}` → 例 `fix/sentry-frontend-abc-null-pointer`
- 基于当前仓库默认分支或当前分支（对话框可切换），创建后自动切换。

### 8.2 引用标记（M4）

- **中性引用标记，不用自动关闭关键字**：`Fixes`/`Closes` 在 GitHub 等平台有"自动关闭 Issue"语义，而错误平台的短 ID 并非 Git 平台可解析的引用，默认不使用。
- 提交信息 trailer：`Error-Tracking: {providerId}/{shortId}`（如 `Error-Tracking: sentry/FRONTEND-ABC`）。
- PR 描述模板：`Related production error: Sentry FRONTEND-ABC ({externalUrl})` + 修复摘要。
- 自动关闭关键字仅在目标平台明确支持且用户显式开启时生成（v1 默认关闭）——Git 工作流状态与错误平台状态保持解耦。
- 引用标记由集成层生成，复用现有 CommitComposer / PR 创建流。

### 8.3 状态回写（M4）

- 详情页操作：标记已解决 / 忽略（capability `resolve` / `ignore`）。
- 「下个 release 解决」选项：Sentry `statusDetails.inNextRelease`，与 git release 语义对齐。
- 回写成功后列表状态即时更新。
- **操作级错误 ≠ 连接级错误**：单个回写失败（403 无写权限、issue 状态已被他人变更、网络抖动）以操作级错误提示呈现并保留重试，**不改变连接健康状态、不触发来源降级横幅**。连接健康态仅由连接测试/同步刷新的结论变更（§6.3）。
- 自动 resolve-on-merge（PR 合并后回写）为 P2 评估项，需要 PR 状态轮询，v1 不做。

### 8.4 堆栈跳转本地文件（M3 起，核心差异化价值）

- 每个堆栈帧提供"跳转"尝试：
1. 应用映射配置的 `sourcePathPrefixMap` 前缀替换（高置信，直接跳转）；
2. 未配置映射时按文件名 + 相对路径后缀模糊匹配，**按置信度分档**：唯一高置信匹配 → 直接跳转；多个候选（重名 `index.ts`/`utils.ts` 等）→ 弹出文件选择器由用户确认；低置信或无候选 → 落入第 3 档；
3. 不可定位 → 显示原始路径、禁用跳转（明确"不可跳转"，不静默失败），提供复制路径与手动搜索入口。
- 跳转落点：优先客户端内打开并定位行号；若客户端暂无只读代码视图，回退为调用系统默认编辑器打开。**M3 开工前定案**（见 §12 开放问题）。

### 8.5 AI 修复（M5）

- 新建 `AiErrorFixService`，照"每功能一个薄 service"惯例调用 `AiClient.requestAiText`。
- 输入：issue 详情 + 堆栈 + 经路径映射定位到的本地文件内容。
- 输出：修复提案（改动说明 + patch），进入**现有审查放行流**——AI 负责生成，用户负责放行，**禁止自动提交**。
- **上下文约束**：自动收集的源码限制文件数与总 token 预算；跳过敏感文件（`.env`、密钥、credentials 等按 ignore 规则）。
- **工作区保护**：应用 patch 前检查工作区无未提交修改，否则要求先提交/暂存或新建分支，**禁止覆盖用户进行中的工作**。

## 9. 同步机制

- 桌面端无法接收 webhook，采用**轮询 + 手动刷新**：
  - 自动轮询间隔 `errorsPollingIntervalSec`（默认 60s，下限 30s，配置 UI 提供 30/60/120/300 预设）。
  - 页面不可见时（`document.visibilityState`）暂停轮询。
  - 手动刷新按钮始终可用，刷新中显示进行态。
- 429 限流：指数退避 + 本次轮询周期跳过，状态栏提示。
- 每条连接独立同步、独立错误态；单连接失败不阻塞其他连接。

## 10. Provider 规格

### 10.1 通用规范

- Provider 实现为纯 TS service（`src/services/errors/providers/<id>.ts`），前端直接 fetch，照 GitHubService/GitLabService 先例（token 边界与缓解措施见 §6.4）。
- web 预览模式下经 vite `/api` 中间件代理转发（`vite.config.ts` 的 git-api-plugin 新增 `/api/errors/*`），避免 CORS；桌面端直连。
- 每个平台一个文件 + 一个 manifest；解析逻辑与网络请求分离，便于 fixture 单测。
- 平台优先级：Sentry **P0**；Rollbar、Bugsnag **P1**；Raygun、声明式 HTTP Provider **P2**。

### 10.2 Sentry（P0）

| 项 | 要求 |
|---|---|
| 认证 | Bearer token（用户在 Sentry 后台创建） |
| 自托管 | baseUrl 可配置（默认 `https://sentry.io`） |
| 组织 | 连接时选择（`GET /api/0/organizations/`） |
| 项目列表 | `GET /api/0/organizations/{org}/projects/` |
| issue 列表 | `GET /api/0/organizations/{org}/issues/?project=…&query=is:unresolved`，分页（Link header） |
| issue 详情 | `GET /api/0/issues/{id}/` |
| 最新事件（堆栈） | `GET /api/0/issues/{id}/events/latest/` |
| suspect commits | `GET /api/0/issues/{id}/suspect-commits/` |
| 状态回写 | `PUT /api/0/issues/{id}/`（`status` / `statusDetails.inNextRelease`） |

> 以上 endpoint 为参考清单，以开发期实测为准；请求/响应结构由 provider 封装，不外泄到视图层。

### 10.3 Rollbar / Bugsnag（P1）

验证多域架构下"新增 provider 只写一个适配文件 + fixture"的扩展成本；severity/status 归一表见 §5.2。

### 10.4 声明式 HTTP Provider（P2）

面向自定义平台的过渡方案：配置化描述认证方式（header/bearer）、endpoint 模板、字段到统一模型的 JSON 映射。**不提供任意代码执行**；仍不能注册新域。

## 11. 代码落位

| 关注点 | 落点 | 参照先例 |
|---|---|---|
| 类型/接口/域注册表 | `src/services/errors/types.ts` | `src/services/github/issueTypes.ts` |
| 语义归一 | `src/services/errors/normalize.ts` | — |
| Sentry 适配 | `src/services/errors/providers/sentry.ts` | `GitLabService.ts` |
| 连接 store | `src/stores/errorsStore.ts` | `forgeStore.ts` |
| keyring 命令 | `src-tauri/src/lib.rs`：`store/get/delete_integration_token` | `store_forge_token` 白名单模式 |
| 页面 | `src/features/errors/`（ErrorsView / ErrorDetail / ConnectDialog） | `ForgeView.tsx` 连接态模式 |
| 导航接线 | `LeftSidebar.tsx` + `repoStore.MainNavTab` 条件化 + `CenterStage.tsx` | — |
| 设置 UI | `SettingsDialog.tsx` 集成分区 | `crashReports` 开关先例 |
| i18n | `src/i18n/errors.ts`（`errors.*`），并入 zh/en | `src/i18n/issues.ts` |
| dev 假数据 | `src/dev/ErrorFixture.ts` | `IssueFixture.ts` |
| web 代理 | `vite.config.ts` git-api-plugin 增加 `/api/errors/*` | device-code 代理先例 |

## 12. 里程碑与验收

### M1 架构地基（无 UI）

- `types.ts`（域注册表、capability 枚举、ProviderManifest、UnifiedErrorIssue、Connection）、`normalize.ts`、`errorsStore` 骨架。
- keyring 三命令 + Rust 单测。
- **验收**：归一映射表驱动单测通过；`shouldShowDomain` 单测覆盖（存在性/健康态分离）；capability 字面量联合编译期校验（词汇表外字符串无法编译）；settings/localStorage 无 token 明文。

### M2 连接与凭证

- Sentry provider（testConnection / listOrgs / listProjects / listIssues / getIssue / latestEvent / resolve）。
- 设置集成分区 + Sentry 连接流程（token→org→项目）+ 连接管理（启用/禁用/删除/测试）。
- **验收**：真实 token 走通连接；错误 token / 断网呈现错误态；**只读权限 token 验证**——resolve 等写操作返回操作级错误（403 提示补权限），连接状态不劣化、不出现降级横幅；删除连接后 keyring 条目清除；grep 确认 localStorage 无明文凭证。

### M3 Errors 页 v1

- 导航接线（条件渲染 + 徽标）、列表（作用域/来源筛选/合并排序）、详情页（堆栈/外部链接/rawData 折叠）、按连接降级横幅、双空态、轮询。
- **验收**：双连接假数据 fixture 合并显示与筛选；断开一条连接其余来源正常 + 横幅可见；堆栈跳转三种结果（精确/模糊/不可跳转）各有着落；中英双语截图；徽标随同步刷新。

### M4 修复工作流

- 创建修复分支、引用标记（commit/PR）、标记已解决 / 忽略 / 下个 release 解决。
- **验收**：从 issue 一键建分支并产出含中性引用 trailer 的提交与 PR；回写后列表状态即时更新；分支名模板单测；**重启恢复**——创建修复分支后关闭并重新打开 AuuGit，仍能从 issue 找回关联的分支、commit 与 PR；分支被删除/重命名后链接显示 stale，不得指向其他分支。

### M5 AI 修复

- `AiErrorFixService` + 提案进入审查放行流。
- **验收**：提案必须经放行才能提交；拒绝路径不产生任何 git 变更；无 apiKey 时按钮不渲染（照 AiExplanationButton 先例）。

### M6 多 Provider 扩展

- 先接 Rollbar 验证扩展成本，再接 Bugsnag（P1）；声明式 HTTP Provider 可延期至后续版本（P2）。
- **验收**：新增 provider 未改动域视图与导航代码（仅注册文件 + fixture）；三平台同列表合并展示。

## 13. 测试要求

- **单测**（node --test，零 DOM 基线）：provider 解析用录制 API 响应 fixture（真实采样、脱敏）；归一映射表驱动；分支名模板；`shouldShowDomain`；连接状态机。目标不降低现有基线（592/61/46）。
- **定位器纪律**：按钮定位用文案/aria，禁用样式类（历史教训：CommitComposer 两轮碎裂）。
- **e2e**：连接 happy path（stub API）、降级横幅出现路径；fixture 写法遵守既有坑位清单（stub 顺序、aria 动态值、expect.poll）。
- **i18n**：`errors.*` 全键中英双语；异常消息覆盖；双语截图收尾。
- **UI 合规**：按钮体系/工具栏 34px/选中态/末列轨道按 §7.5 检查；暗色下截图确认无蓝紫、无辉光小字号。

## 14. 风险与开放问题

| # | 事项 | 状态/对策 |
|---|---|---|
| 1 | 堆栈路径 ↔ 本地路径映射精度（release 路径 ≠ 本地路径） | 前缀映射 + 模糊匹配兜底；不可跳转时显式提示。真实项目上先验证 |
| 2 | 客户端暂无只读代码查看器，跳转落点 | **已定案（M3 实现时）**：系统默认编辑器（shell open），web 预览回落剪贴板复制路径；内置只读视图列为后续增强 |
| 3 | Sentry API 细节（endpoint/字段/分页） | §10.2 为参考清单，开发期实测为准 |
| 4 | 轮询对平台的压力 | 间隔下限 30s + 429 退避 + 不可见暂停 |
| 5 | 现有 GitHub Issues 模块与未来 `task-tracking` 域的关系 | 本期不动；域化架构为其保留归并路径 |
| 6 | 连接级静音、跨源去重 | 留口子不实现（§7.3.4） |
| 7 | 自动 resolve-on-merge | P2 评估（需 PR 状态轮询） |

## 15. v1 范围一句话

**只做 Sentry → Errors 页 → 看错误 → 跳代码 → 建修复分支 → 带引用提交/PR → 回写解决**；Tasks/CI-CD/Observability 仅要求架构"允许它们未来出现"（域注册表 + capability 词汇表 + 多域 manifest，几乎零成本预留）。

---

## 修订记录

### v2.1（2026-11-01，技术修订，功能范围不变）

1. 新增 §5.3 IssueGitLink 持久化关联模型与 repoKey 仓库身份规则（规范化 remote URL 优先，路径回退）；M4 验收增加重启恢复与 stale 分支处理。
2. Capability 统一 `domain:action` 命名空间并定义核心字面量联合类型（修正 §4.2 示例与 §4.3 规则的不一致）；明确"声明能力 ≠ 生效能力"，403 走操作级错误。
3. 重写 §6.4 安全边界：如实描述 v1 直连架构下 token 进入 WebView 内存的事实与缓解措施；补充请求目标限制与 v2 Rust 授权代理硬化选项。
4. §4.4 明确 `connection.domains` 仅在权限检查成功时重算，网络失败保留已验证集合。
5. §7.2 增加多来源合并列表的分页规则（每连接独立 cursor、增量归并、"仅显示已加载"中性提示）。
6. §8.2 引用标记改为中性 trailer `Error-Tracking: {providerId}/{shortId}`，弃用默认 `Fixes` 自动关闭关键字。
7. §8.3 区分操作级错误与连接级错误，回写失败不劣化连接状态。
8. §7.5 修正 i18n 边界：平台异常内容保持原文，仅客户端自身文案翻译。
9. §8.4 堆栈模糊匹配改三档置信度策略（唯一直跳/多候选选择器/不可定位显式提示）；§8.5 增加 AI 上下文预算与工作区保护约束；§1 澄清"获取最新事件"与非目标不冲突；M2 增加只读 token 验收；M6 调整为 Rollbar 优先。
