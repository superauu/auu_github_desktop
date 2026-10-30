# AuuGit

[简体中文](README.md) · [English](README.en.md)

A desktop Git client built with Tauri, React, and TypeScript. AuuGit brings everyday Git operations, a visual commit graph, GitHub collaboration, and AI assistance into one workspace.

AI helps explain changes, draft descriptions, and suggest resolutions. The app does not include an autonomous coding agent.

[Download](https://github.com/superauu/auu_github_desktop/releases/latest) · [Report an issue](https://github.com/superauu/auu_github_desktop/issues)

## Features

| Feature | What it does |
| --- | --- |
| Multiple repositories | Switch between repository tabs and manage local branches, remote branches, tags, stashes, and worktrees. |
| Changes and commits | Inspect text diffs, stage files, hunks, or individual changed lines, and organize files into commit groups. |
| Visual branch operations | Drag branch labels in the graph to preview a merge or rebase. Drag a commit onto the current branch to cherry-pick it. |
| History editing and recovery | Reorder, squash, or fix up unpublished linear commits. Inspect recovery points and reflog entries to compare or recover commits. |
| Image diffs | Compare images side by side or with an adjustable overlay. |
| History search | Search commit metadata or added and removed code. |
| GitHub Pull Requests | Browse, create, review, and merge PRs, and draft PR descriptions. |
| GitHub Actions | Inspect workflows, runs, jobs, and steps; retrieve completed job logs; dispatch, rerun, or cancel runs. |
| AI assistance | Draft commit messages, explain commits and branch differences, diagnose Git errors, and suggest file groups or conflict resolutions. |
| Code review | Review files or hunks and resolve notes in Working Changes, then preview and copy an AI fix report with original code context across files. Pre-commit reminders are on by default and allow you to continue; disable them in Git settings or in the reminder. [Guide](docs/review-guide.md). |
| Customization | Chinese and English interfaces, themes, compact mode, adjustable panels, and cursor themes. |

Manual GitHub Actions runs load the workflow definition from the selected branch and show required inputs, defaults, and choices. Environment inputs accept an environment name configured in the repository. Failed loads can be retried without submitting inputs from a previous branch.

Push operations let you choose a remote and destination branch, with the repository address and push direction shown before proceeding. Defaults follow branch `pushRemote`, repository `remote.pushDefault`, and tracking configuration. Remembering a push remote and changing the tracking branch are separate choices. Commit and Push asks for a destination before creating the commit; cancelling leaves the draft intact. Tag pushes and remote tag deletion also support remote selection.

Remote branch context menus can delete a branch on the selected server while retaining local branches. The toolbar fetches all remotes; repository actions and remote settings offer fetch with pruning of stale remote references. Remote settings also let you select the GitHub remote used for PRs and Actions independently. Ahead/behind counts compare with the tracking branch shown in the status bar. PR creation lets you select the source GitHub repository and published branch, including same-named branches across forks, and reloads the base when the collaboration repository changes. If remembering a remote fails after a successful push, a separate warning preserves the successful push result.

The commit panel sits beside the diff at typical laptop widths. Appearance settings offer automatic, side-by-side, and drawer modes. Branch, PR, and workflow lists support keyboard navigation and activation; Shift+F10 opens branch actions. Repository tools group recovery and diagnostics. Push preferences and tracking settings live under advanced options. Errors show recovery guidance with expandable technical details that can still be copied.

"AI plan all changes" uses the configured AI to suggest commit count, order, grouping rationale, titles and descriptions for staged, unstaged and new files. Review and edit messages, move files, reorder or merge groups before confirming. Create all commits together, or choose a remote first and push once after every commit succeeds. Groups contain whole files; partially staged files use their full working copy. Changed snapshots block execution. Partial failures report completed commits, and push retries never recreate commits. Existing commit drafts are preserved.

Git writes show the current operation, elapsed time, and queue count in the status bar. Cancel queued skips tasks that have not started; the running operation continues. If a main view fails to render, retry it or copy diagnostics. Save any text you are editing before reloading the entire window.

Recovery points can be named when created, renamed later, or deleted. Names live in repository-local configuration and are shared across linked worktrees; an empty name uses the default label. Deleting a point removes only that point, leaving branches and working files unchanged. Git may eventually prune commits no longer retained by any reference.

In the changes list, file checkboxes only pick files for batch actions: tick several to stage, unstage, or ignore them together, and Shift-tick for a range. Stage a single file with the plus/minus button at the row end, the space key, or the context menu. "Add All" in the untracked files section tracks and stages every new file at once.

Merge, rebase, and history editing include previews or recovery mechanisms. History editing blocks commits found on fetched remote branches; fetch remote changes before rewriting history.

## Installation

The release workflow provides packages for three platforms: **Windows x64** (installer / MSI / standalone executable), **macOS** (dmg for Intel and Apple Silicon), and **Linux** (AppImage / deb / rpm). The workflow supports signed automatic updates for Windows, macOS, and Linux AppImage when the platform's update artifact and signature are uploaded and included in the update manifest. For deb / rpm installations or unavailable updates, download the new version from Releases manually.

1. Install [Git](https://git-scm.com/downloads) and ensure the app can find it.
2. Download the package for your platform from [Releases](https://github.com/superauu/auu_github_desktop/releases/latest): `AuuGit_<version>_x64-setup.exe` (or MSI) on Windows, `<version>_x64.dmg` (Intel) or `<version>_aarch64.dmg` (Apple Silicon) on macOS, and AppImage, deb, or rpm on Linux.
3. Open an existing repository or clone one. Connect a GitHub account in the app settings to use authenticated GitHub features.

The `auugit.exe` release asset is a standalone executable for Windows. Use an installer build if you want automatic upgrades.

### Automatic updates

The desktop app checks for updates about 15 seconds after startup. When a newer version is found, the status bar keeps an update entry. Review release notes, download with progress, or handle it later. Installation starts only after you select Install and restart and confirm; pending Git tasks in any repository block installation. Save your edits before installing. Update packages are verified with a signature, and release metadata is provided through `latest.json`.

Browser development mode does not perform desktop updates. If an update check fails, you can download an installer from Releases manually.

### Background refresh and recent operations

Active windows check for external changes every 10 seconds, backing off to 30 seconds after two idle minutes and 60 seconds after five. Hidden windows and repositories with pending Git writes skip background checks; focus events trigger a debounced refresh. Identical diffs reuse parsed results, while consecutive edits are re-read even when Git status codes stay the same.

Recent operations in the status bar keeps the last 100 Git writes and notifications for the session. Filter errors, copy details, retry a failed fetch, or open recovery for the recorded repository. Duration includes queue time. Records stay in memory and are cleared when the app closes.

### AI configuration

Commit messages and PR descriptions can use local rules or templates without an API key. For model generation, change explanations, or conflict suggestions, choose the custom model API in settings and select a protocol your service supports: **OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages**. Enter its endpoint, model name, and API key, then use Test Connection to validate the configuration.

The endpoint accepts a base URL (such as `https://api.openai.com/v1` or `https://api.anthropic.com/v1`) or a full API path. Existing configurations default to Chat Completions. Switching protocols preserves your endpoint, model, and key; adjust them to match your service.

Browser development mode relays AI requests through the local development server to support providers that do not allow browser cross-origin requests. OpenCode Go requests automatically include the AuuGit client identity and a stable ID for the current application session; no manual headers are needed.

External model requests send relevant code, diffs, or error context to the service you configure. Desktop GitHub tokens and AI API keys use system credential storage; browser development mode keeps credentials in memory. Review generated content before applying or committing it.

## Local development

Requirements:

- Node.js 20.19+, 22.13+, or 24+ and npm.
- Git.
- For desktop builds: stable Rust and the platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires Microsoft C++ Build Tools and WebView2.

```sh
git clone https://github.com/superauu/auu_github_desktop.git
cd auu_github_desktop
npm ci
```

Start browser development mode:

```sh
npm run dev
```

Open `http://localhost:5173`. The development server includes APIs that access local repositories and is intended for local use. Git operations affect the actual repository you select.

Development APIs are restricted to this project directory and its descendants by default. Set `AUUGIT_DEV_ROOTS` before starting the server to allow other repositories; separate roots with the platform path delimiter (a semicolon on Windows). Existing ancestors and directory links are resolved before checking access.

The desktop app remembers directories chosen through its native picker. Manually entered paths and paths restored from older versions require confirmation on first access. Text and ignore-rule files are limited to 8 MiB. Saves serialize application writes, recheck the original contents and atomically replace the file. A small race with external editors remains between the final check and replacement.

Start desktop development mode:

```sh
npm run tauri -- dev
```

Validate and build:

```sh
npm test
npm run lint
npm run check:release
npm run build
npm run tauri -- build -- --locked
```

`npm run build` produces frontend assets. The final command creates desktop bundles under `src-tauri/target/release/bundle/`. Builds with signed automatic updates also require signing credentials that match the app's updater public key.

Run visual regression checks with `npm run test:visual`; install its browser first with `npx playwright install chromium`. Windows CI checks both themes at three viewport sizes and retains screenshot diffs and browser traces on failure. See the [visual regression guide](tests/visual/README.md) for baseline review and other platforms.

Credential backends are enabled per platform: Windows Credential Manager, macOS Keychain, and Linux keyutils with Secret Service. Linux needs an available Secret Service and session D-Bus at runtime. Releases and desktop regression validation currently target Windows x64.

## Project structure

```text
src/
  components/    Shared components, layout, and settings
  features/      Repository, Git, PR, and Actions interfaces
  services/      Git, GitHub, AI, and update services
  stores/        Application state
  i18n/          Chinese and English translations
src-tauri/       Rust backend, desktop configuration, and capabilities
tests/           Regression tests
scripts/         Release version validation
.github/workflows/  Validation, build, and release workflows
```

## Publishing a release

1. Keep the application version consistent across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
2. Run tests, release version validation, and the frontend build.
3. Configure the GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The signing key must match the updater public key embedded in the app.
4. Push a `v<version>` tag matching the application version. The Windows release workflow builds, signs, and uploads installers and update metadata to a GitHub Release; the macOS and Linux build matrix attaches its platform packages to the same Release and merges available macOS and Linux AppImage update signatures into `latest.json`. Platforms with missing signatures are skipped, so verify the manifest after publishing.

A manual workflow run produces Actions artifacts. The current workflow publishes a GitHub Release only when triggered by a version tag push.

## Feedback and contributions

[Issues](https://github.com/superauu/auu_github_desktop/issues) and pull requests are welcome. Include the app version, operating system, reproduction steps, and observed behavior in bug reports. For Git operation issues, also describe the branch and working tree state.
