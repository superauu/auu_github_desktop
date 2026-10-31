# 贡献指南（CONTRIBUTING）

感谢关注 AuuGit！本指南说明开发环境、提交要求与贡献条款。

## 开发环境

- Node.js 20+、Git、Rust（含平台 MSVC/clang 工具链）——完整环境要求见 [README](README.md#本地开发)。
- `npm install` 后：`npm run dev`（纯浏览器预览）、`npm run tauri dev`（桌面窗口）。
- 提交前请跑齐：`npm run lint`、`npm test`、`npx tsc --noEmit`；涉及 Rust 时加 `cargo test`；涉及 UI 交互或视觉时建议补 `npm run test:visual` 用例。

## 验证崩溃上报链路

以 `AUUGIT_CRASH_TEST=1` 启动发布版应用，会发送一条测试事件（走完整管道：门控 → 主目录清洗 → 传输，release 标记为 `auugit@<版本>`）；一两分钟后可在 Sentry 项目控制台的 Issues 页看到 *AuuGit crash reporting test event*。该钩子只在显式设置环境变量时触发，无任何用户可见入口。

## 提交与 PR

1. Commit message 使用中文 conventional commit（`feat:` / `fix:` / `test:` / `style:` / `docs:` / `chore:`），每处独立改动一个提交。
2. 新增功能需附带对应测试；修复 bug 需先有能复现问题的测试再修。
3. 界面文案必须走 `t()` 并同时补中英两份（`src/i18n/zh.ts` 与 `en.ts` 及对应模块文件），CI 会做完整性校验。
4. PR 请描述改动动机、影响面与验证方式；CI 全绿后等待 review。

## 贡献许可条款

向本项目提交贡献（代码、文档、测试或其他内容），即表示你同意：

1. 你的贡献按本项目的 **GPL-3.0-or-later** 许可证授权；
2. 你拥有或有权提交这些内容；
3. 你授予项目维护者（superauu）一项永久性、全球范围、免版权使用费的权利，可将你的贡献纳入本项目未来的任何版本，并以 GPL-3.0-or-later 之外的条款与其他项目共同许可（即双许可）——这是为了保留项目未来调整发布模式的可能性。

如不接受上述条款，请在 PR 中明确说明，维护者会与你确认处理方式。

## 行为准则

保持专业与友善：对事不对人，讨论聚焦技术事实，尊重不同背景的贡献者。
