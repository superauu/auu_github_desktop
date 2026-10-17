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
| Customization | Chinese and English interfaces, themes, compact mode, adjustable panels, and cursor themes. |

Merge, rebase, and history editing include previews or recovery mechanisms. History editing blocks commits found on fetched remote branches; fetch remote changes before rewriting history.

## Installation

The current release workflow provides **Windows x64** installers and a standalone executable.

1. Install [Git](https://git-scm.com/downloads) and ensure the app can find it.
2. Download `AuuGit_<version>_x64-setup.exe` from [Releases](https://github.com/superauu/auu_github_desktop/releases/latest) and run the installer. An MSI installer is also available.
3. Open an existing repository or clone one. Connect a GitHub account in the app settings to use authenticated GitHub features.

The `auugit.exe` release asset is a standalone executable. Use an installer build if you want automatic upgrades.

### Automatic updates

The desktop app checks for updates about 15 seconds after startup. When a newer version is available, it downloads and installs the update, then prompts you to restart. Update packages are verified with a signature, and release metadata is provided through `latest.json`.

Browser development mode does not perform desktop updates. If an update check fails, you can download an installer from Releases manually.

### AI configuration

Commit messages and PR descriptions can use local rules or templates without an API key. For model generation, change explanations, or conflict suggestions, choose the custom model API in settings and select a protocol your service supports: **OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages**. Enter its endpoint, model name, and API key, then use Test Connection to validate the configuration.

The endpoint accepts a base URL (such as `https://api.openai.com/v1` or `https://api.anthropic.com/v1`) or a full API path. Existing configurations default to Chat Completions. Switching protocols preserves your endpoint, model, and key; adjust them to match your service.

External model requests send relevant code, diffs, or error context to the service you configure. Desktop GitHub tokens and AI API keys use system credential storage; browser development mode keeps credentials in memory. Review generated content before applying or committing it.

## Local development

Requirements:

- Node.js 20 or later and npm.
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

Start desktop development mode:

```sh
npm run tauri -- dev
```

Validate and build:

```sh
npm test
npm run check:release
npm run build
npm run tauri -- build -- --locked
```

`npm run build` produces frontend assets. The final command creates desktop bundles under `src-tauri/target/release/bundle/`. Builds with signed automatic updates also require signing credentials that match the app's updater public key.

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
4. Push a `v<version>` tag matching the application version. The Windows release workflow builds, signs, and uploads installers and update metadata to a GitHub Release.

A manual workflow run produces Actions artifacts. The current workflow publishes a GitHub Release only when triggered by a version tag push.

## Feedback and contributions

[Issues](https://github.com/superauu/auu_github_desktop/issues) and pull requests are welcome. Include the app version, operating system, reproduction steps, and observed behavior in bug reports. For Git operation issues, also describe the branch and working tree state.
