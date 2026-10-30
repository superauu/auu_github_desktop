# 发布冒烟例程

每次打 `v*` tag 发版前，在本机完整走一遍。目标：安装包/更新链路的问题在用户发现前被拦截。
前置：本机编译环境已就绪（MSVC 工具集 + Win11 SDK，见环境约束记录）。

## 1. 本地发布构建

```powershell
.\node_modules\.bin\tauri.cmd build --no-bundle -- --locked
```

- **必须走 tauri CLI，不能用裸 `cargo build --release`**：生产嵌入模式由 tauri CLI 启用的
  `custom-protocol` feature 切换，裸 cargo 构建的 exe 会去加载 devUrl（`localhost:5173`），
  仅当本机恰好开着 dev server 时才"能用"（v0.5.4 冒烟踩坑：dev server 全停后窗口报
  `localhost 拒绝连接`，ERR_CONNECTION_REFUSED）。`--no-bundle` 跳过安装包与更新器签名
  环节，只出冒烟用的裸 exe；完整安装包由 CI 的 tag 构建产出。
- 构建必须零 error 零 warning（clippy 门在 CI，但本地先跑一遍更快：`cargo clippy --locked --all-targets -- -D warnings`）。
- 产物：`src-tauri/target/release/auugit.exe`。

## 2. 真 exe 启动冒烟

```powershell
# 启动并观察 45 秒（覆盖启动 15s 后的更新静默检查窗口）
$p = Start-Process -FilePath "E:\code\auu_github_desktop\src-tauri\target\release\auugit.exe" -PassThru
Start-Sleep -Seconds 45
Get-Process -Id $p.Id | Select-Object Id, MainWindowTitle, Responding
```

通过标准：

- [ ] 进程存活且 `Responding` 为 True（无白屏/死锁）
- [ ] `MainWindowTitle` 显示 AuuGit 窗口标题
- [ ] 手动过一遍核心链路：打开仓库 → 工作区改动可见 → 提交（可对临时文件）→ 历史刷新
- [ ] 设置 → GitHub 账号列表头像加载（CSP 走 avatars.githubusercontent.com）
- [ ] 极矮窗口（拖到 ~600px 高）提交编辑器不碎条、按钮区粘底可用

## 3. 更新链路检查

Windows 本地可执行自动化原生更新冒烟（先完成第 1 步的生产 EXE 构建）：

```powershell
npm run test:updater
```

例程使用独立产品名、应用标识和临时安装目录，生成一次性签名密钥；从本机服务发现新版本、拒绝篡改包、验证并下载合法包，再通过真实 NSIS 静默安装并核对安装后的 EXE 哈希，随后卸载测试产品。生产签名密钥和已有 AuuGit 安装不参与。结果写入 `test-results/updater-smoke.json`。它验证原生更新与安装链路；前端确认、Git 忙碌保护和重启状态仍由 UI 回归与下面的真机步骤覆盖。

- [ ] 浏览器打开 `https://github.com/superauu/auu_github_desktop/releases/latest/download/latest.json`
      返回 JSON（302 → 200 为正常；登录页 HTML = 仓库变私有，更新链路断了）
- [ ] latest.json 内 `version` 与已发布的最新 tag 一致、`platforms` 含 `windows-x86_64` 且签名文件 URL 可下载
- [ ] macOS / Linux 产物挂载完成后，核对 `platforms` 中的 `darwin-aarch64`、`darwin-x86_64`、`linux-x86_64`；每个平台的更新包 URL 可下载且 `signature` 非空。缺失时检查平台构建、签名与清单合并日志，不能只凭 Windows 更新成功判断三平台均可更新。
- [ ] （升级真机验证，发新版本后做一次）已安装的旧版本客户端内触发更新检查 → 提示新版本 → 完成安装

## 4. 版本一致性

```bash
npm run check:release
```

package.json / tauri.conf.json / Cargo.toml 三处版本一致，tag 与 `v{version}` 匹配。

## 核心工作流验收

- [ ] 修改文件 → 记录审核意见 → AI 修复报告预览和复制 → 修复 → 标记已解决 → 审核通过 → 暂存 → 提交 → 推送。
- [ ] 重开应用后进行中的审核和意见仍正确；文件提交后已完成记录自动清理，未解决意见仍可管理；部分提交不清理同文件剩余工作。
- [ ] 同一文件的暂存、未暂存版本分别核对；批量审核跳过待解决意见、冲突、读取失败项。
- [ ] 文件搜索与审核状态组合筛选；筛选后的批量审核、暂存、取消暂存及下一项导航只处理显示项。
- [ ] 编辑意见保留原始上下文；定位选择正确版本并滚动到长差异中的代码块，原块失效时提示核对；批量取消不新增通过记录，失败可重试。
- [ ] 「提交历史 → 更多工具」中的二分查找可启动、关闭后恢复、定位坏提交，并还原原分支。
- [ ] 二分操作遇到暂存、未暂存或未跟踪改动时停止，保留原文件、暂存区和已有会话。
- [ ] 大文件列表与长差异只渲染可见行；后台刷新保留选区及横纵滚动位置。

## 5. 打 tag 发版

```bash
git tag v{version} && git push origin v{version}
```

CI（build-windows.yml）自动构建并创建 Release；回到第 3 步复查 latest.json 已刷新为新版本。

## 已知事项

- 签名私钥 `C:/Users/super/.tauri/auugit.key` 必须有离线备份（已备份，2026-10-26 确认）。
- 仓库必须保持公开，否则更新检查静默失败（tauri updater 404）。

## 2026-10-30 质量验收记录（v0.6.4）

- 本地 469 项 Node 回归、43 项 Rust 测试、ESLint、全量 Hooks 依赖检查、Clippy `-D warnings`、版本一致性及生产前端构建通过。虚拟列表保留两处有原因说明的缓存失效依赖例外。
- Windows Chromium 的 6 个明暗主题/尺寸截图与 4 个键盘、弹窗、仓库切换和错误重试用例通过；人为反转画面时比对确实失败，基线未随失败自动更新。
- 通过 Tauri CLI 构建生产 EXE；真实窗口完成临时仓库授权、记录意见、报告预览和复制、修改原文件、解决意见、审核通过、暂存、提交、推送到授权目录内的本地 bare 远端。读取 Git 对象确认 HEAD、跟踪分支及 bare 远端一致，工作区干净。
- 关闭并重开后临时仓库、干净状态和新提交正确恢复；原生窗口在约 1000×600 尺寸下验证布局，启动超过 45 秒仍正常响应。
- `npm run test:updater` 实际完成旧版本上下文发现新版本、篡改包签名拒绝、合法包验证和下载、真实隔离 NSIS 安装、安装后 EXE 哈希核对及测试产品卸载。
- 已发布 v0.6.4 的 Windows、Linux 和两种 macOS 架构更新包均完成下载、应用公钥验签和签名内版本核对。当前 `latest.json` 的两个 macOS 键已修正为 `darwin-aarch64` / `darwin-x86_64`，安装包、下载 URL、签名及 Windows/Linux 条目保持不变，公开下载入口复查通过。
- macOS/Linux 真机安装不在本次 Windows 验收环境中；其发布产物与签名已验证。
