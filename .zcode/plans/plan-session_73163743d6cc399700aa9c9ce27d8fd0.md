# v0.6 旗舰功能:「审查」视图(AI 变更审查)

## 定位与设计总览

新增独立主导航视图「审查」(en: Review):展示**自上次已审查检查点以来**的提交,帮助独立开发者看住 AI 产出。核心概念:

- **检查点**:每个分支一个自定义 ref `refs/auugit/review/<分支名>`,CAS 式 `update-ref` 创建/推进(完全复用 BranchSafetyService.savePoint 先例,Rust 白名单零改动)。语义:**手动标记 + 推送成功后 toast 提醒**(已确认)。
- **审查范围** = `checkpoint..HEAD`:提交列表(带 AI 参与徽标 + 风险点)+ 净聚合 diff(默认选中)+ 单提交 diff。
- **风险标记**:本地纯函数计算,不依赖 AI——疑似密钥、依赖文件变更、CI/工作流变更、大量删除、大文件、变基致检查点失效。
- **AI 摘要**:单次调用输出 JSON(总览 + 每提交一句意图),手动触发,复用 AiClient/AiExplanationButton 的 UI 模式。
- **内联整理提交**(已确认纳入):复用 HistoryWorkflowService,给 `plan()` 加可选 `base` 参数,审查视图直接打开扩展后的 HistoryEditorDialog 对检查点之后的嘈杂提交做 squash/fixup;已发布提交防改写等安全机制原样继承。
- 不做(留 v0.7+):PR 联动、推送自动标记设置项、跨仓库注意力面板、MCP/deep link。

## 实施步骤

### 1. GitService 范围查询(`src/services/git/GitService.ts` 新增方法)
- `getCommitsInRange(repoPath, base, head, limit)`:复用现有 log format(`%H%x1f...` 含 %b body),`--first-parent base..head` + reverse;检出合并提交标记 nonLinear(整理前需提示)。
- `getRangeDiffSummary(repoPath, base, head)`:`git diff --name-status --stat <base> <head>`(两点,净变更)→ 文件列表 + 每文件 +/- 统计。
- `getRangeFileDiff(repoPath, base, head, path)`:`git diff --no-color <base> <head> -- <path>` → `PorcelainParser.parseDiffOutput` → `ParsedDiffLine[]`。
- `getRangePatch(repoPath, base, head, capChars)`:供密钥扫描与 AI 上下文(截断,16k/1MB 两档)。
- `isAncestor(repoPath, base, head)`:`rev-list --count head..base` === 0 判定(不新增白名单命令,绕开 merge-base)。

### 2. ReviewCheckpointService(`src/services/git/ReviewCheckpointService.ts`,新文件)
模板 = BranchSafetyService: `get/set/clear`,`update-ref` CAS(旧值全零=首次创建);ref 按 recovery 先例直接内嵌分支名;读用 `rev-parse --verify`。纯前端改动。

### 3. 审查纯函数(`src/features/review/reviewLogic.ts`,新文件,仿 prReviewLogic 无 React 无网络)
- `detectAiAuthorship(commit)`:解析 body 中 `Co-Authored-By:` / `Generated with` 启发式。
- `computeRiskFindings(files, stats, patch)` → `RiskFinding[]`:私有密钥头/AWS/GitHub/Slack/Google/JWT/通用赋值正则(排除 your_/xxx/example 占位符)、依赖文件清单(package.json、Cargo.toml、各 lock、go.mod…)、CI 文件(.github/workflows 等)、每文件删除量阈值、二进制/大文件。产出含 severity 与 i18n 键。

### 4. AI 摘要服务(`src/services/ai/AiReviewSummaryService.ts`,新文件)
仿 AiReleaseNotesService 采集(提交 hash/subject/body/author 封顶 + diff --stat + 风险文件 patch 片段)+ `requestAiText` 单次调用,输出 `{overview, commits:[{hash, summary}]}`;解析校验仿 `parseCommitBatchResult`(剥 ```json 围栏 + 逐字段校验);60s 超时、temperature 0.2、`<review-data>` 定界符 untrusted 约束。

### 5. reviewStore(`src/stores/reviewStore.ts`,新 zustand store,不持久化)
检查点信息、范围提交、净差异摘要、选中项、风险发现、AI 摘要状态、请求票据防竞态(切仓库/切分支失效)。CenterStage 用 `key=repo:tab` 重挂载,状态放 store 不丢。

### 6. HistoryWorkflowService 扩展 + 对话框参数化
- `plan(repoPath, count, base?)`:传 base 时取 `base..HEAD`(仍线性校验、仍 cap 30,超限给出明确报错提示分批)。
- `HistoryEditorDialog` 加可选 prop(baseHash/baseLabel),审查视图传入检查点打开;已发布防改写、requireClean、savePoint 恢复点等安全机制不动。整理完成后审查视图刷新范围(检查点 ref 指向的 base 不受影响)。

### 7. ReviewView UI(`src/features/review/ReviewView.tsx` + 子组件)
- **头部条**:检查点状态(基点 shortHash + 相对时间 + N 个待审提交)、基准选择器、统计、风险 chips、动作按钮(AI 总结 / 整理提交 / 标记已审查)。未设检查点时显示引导条(选基准:跟踪远程位置 / 最近 N 提交 / 从提交列表挑一个);变基后检查点失效显示重建基准条。
- **左子栏**(仿 WorkingChangesView 内部拆分):「净变更」节点 + 提交列表(VirtualRows,AI 徽标 + 风险圆点),ResizeHandle 宽度存 layoutStore 并接入 fitWorkspacePanels。
- **主区**:文件列表 + diff(unified/split、DiffTools 搜索、字体控制,复用 WorkingDiffContent 渲染管线);图片文件走 ImageDiffView(base/head 两个 revision 经 readGitImage);单提交复用现有 getCommitFiles/getCommitFileDiff。
- **标记已审查**:CAS 推进 ref,toast 带撤销 action(内存保留旧 SHA)。
- 布局红线:ScrollArea 直接子元素禁 min-w-*(index.css:375)、工具栏 overflow-x-clip、min-h-0 链不断、ErrorBoundary、票据防竞态。图标用现有 lucide 集(ScanEye/ShieldCheck)。

### 8. 推送后提醒
`repoStore.push` 成功路径(repoStore.ts:604 附近)插入:当前分支存在检查点且 ≠ 新 HEAD 时 `toast.info` 带「标记已审查」action + 「打开审查视图」。

### 9. 视图注册(6 个点)
repoStore.ts:27 `MainNavTab` 加 `'review'` → CenterStage lazy+case → LeftSidebar 主导航按钮(插在「变更」之后,Alt+2,AppLayout.tsx:143 数组同步 + ShortcutCheatSheet)→ CommandPalette 条目 → i18n `sidebar.review`。

### 10. i18n(`src/i18n/review.ts` 新文件,zh/en 双词典,zh.ts/en.ts 各 spread 一行)
约 70 键,仿 prReview.ts 按区块分组;语言纯度红线(两种语言都不混排);i18n-integrity 测试自动把关。

### 11. 测试(node:test + esbuild bundle 惯例)
- `tests/review-logic.test.mjs`:风险正则(含占位符误报排除)、AI 作者识别、stat 解析。
- `tests/review-checkpoint.test.mjs`:mock git 验证 CAS get/set/clear。
- `tests/ai-review-summary.test.mjs`:JSON 剥围栏 + 校验链(含畸形输出)。
- `tests/history-workflow.test.mjs`(如无则新建):plan 带 base 的范围取法与超限报错。

### 12. 里程碑与验证(每步验证后中文 conventional commit + push)
1. `feat(review)`: 数据层(步骤 1-2 + 测试)
2. `feat(review)`: 风险与 AI 服务(步骤 3-4 + 测试)
3. `feat(review)`: 整理集成(步骤 6)
4. `feat(review)`: 审查视图与注册(步骤 5、7、9、10 + 测试)
5. `feat(review)`: 推送提醒 + 收尾(步骤 8)

每步跑 `npm test`;步骤 4 后 `npm run build`;最后 dev 模式内置浏览器实机冒烟:创建检查点→AI 生成嘈杂提交→审查/风险/AI 摘要/内联 squash→标记→推送提醒,中英双语各过一遍并截图。

## 已知风险与对策
- 变基后检查点失效:`rev-list --count` 判定非祖先 → 视图显示「基准已不在当前分支历史」+ 重建基准,不静默清数据。
- 分支名含特殊字符:直接内嵌 ref 路径,与 recovery 点同款做法(已验证先例)。
- 提交范围 >30 条:整理入口提示分批;审查列表本身不受限(分页加载)。
- 秘钥误报:只标「疑似」+ 文件定位,永不自动删除/阻断,优先零漏报。