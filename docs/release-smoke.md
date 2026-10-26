# 发布冒烟例程

每次打 `v*` tag 发版前，在本机完整走一遍。目标：安装包/更新链路的问题在用户发现前被拦截。
前置：本机编译环境已就绪（MSVC 工具集 + Win11 SDK，见环境约束记录）。

## 1. 本地发布构建

```bash
cd src-tauri && cargo build --release
```

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

## 5. 打 tag 发版

```bash
git tag v{version} && git push origin v{version}
```

CI（build-windows.yml）自动构建并创建 Release；回到第 3 步复查 latest.json 已刷新为新版本。

## 已知事项

- 签名私钥 `C:/Users/super/.tauri/auugit.key` 必须有离线备份（已备份，2026-10-26 确认）。
- 仓库必须保持公开，否则更新检查静默失败（tauri updater 404）。
