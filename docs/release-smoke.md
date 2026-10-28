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

- [ ] 浏览器打开 `https://github.com/superauu/auu_github_desktop/releases/latest/download/latest.json`
      返回 JSON（302 → 200 为正常；登录页 HTML = 仓库变私有，更新链路断了）
- [ ] latest.json 内 `version` 与已发布的最新 tag 一致、`platforms` 含 `windows-x86_64` 且签名文件 URL 可下载
- [ ] （升级真机验证，发新版本后做一次）已安装的旧版本客户端内触发更新检查 → 提示新版本 → 完成安装

## 4. 版本一致性

```bash
npm run check:release
```

package.json / tauri.conf.json / Cargo.toml 三处版本一致，tag 与 `v{version}` 匹配。

## 核心工作流验收

- [ ] 修改文件 → 记录审核意见 → AI 修复报告预览和复制 → 修复 → 标记已解决 → 审核通过 → 暂存 → 提交 → 推送。
- [ ] 重开应用后审核和意见仍正确；提交后当前报告归零，历史意见可在「管理意见」中处理。
- [ ] 同一文件的暂存、未暂存版本分别核对；批量审核跳过待解决意见、冲突、读取失败项。
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
