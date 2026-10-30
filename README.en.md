# AuuGit

[简体中文](README.md) · [English](README.en.md)

A desktop Git client built with Tauri, React, and TypeScript. AuuGit brings everyday Git operations, a visual commit graph, GitHub collaboration, and AI assistance into one workspace.

AI helps explain changes, draft descriptions, and suggest resolutions. The app does not include an autonomous coding agent.

[Download](https://github.com/superauu/auu_github_desktop/releases/latest) · [Report an issue](https://github.com/superauu/auu_github_desktop/issues)

Repository overview reads open and recent repositories: branches, distinct changed files, conflicts, in-progress operations and sync counts. It displays up to 24 repositories per batch with at most three concurrent reads, search, attention filtering, individual retries and cancellation. Unavailable repositories report separate errors; native repositories require an explicit authorization action if not already approved. Sync counts use locally fetched refs; overview refresh does not fetch. CI uses the current GitHub account and the remote tracking commit, combines Checks and legacy statuses, identifies incomplete results and shows the ref/SHA. Links open the exact checked commit; local unpushed commits are excluded. Account changes discard old results. Cards open the correct repository's changes/history; overview is also available from the welcome page and command palette.

Recent operations persist locally across sessions, keeping up to 100 entries for 30 days with repository, timestamp, outcome, duration and bounded diagnostics. Common credential formats are redacted before storage and callbacks are omitted. After restart, search, repository/error filters, copying diagnostics and recovery navigation remain available, while old retry buttons are not restored. Clearing removes saved history. Storage failures are visible and do not disable the current session.

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
| GitHub Issues | Search and filter issues, create and edit, assign labels and people, comment, close and reopen; create local branches and linked PRs, then navigate between issues and PRs. |
| GitHub Actions | Inspect workflows, runs, jobs, and steps; retrieve completed job logs; dispatch, rerun, or cancel runs. |
| AI assistance | Draft commit messages, explain commits and branch differences, diagnose Git errors, and suggest file groups or conflict resolutions. |
| Code review | Review files or hunks and resolve notes in Working Changes, then preview and copy an AI fix report with original code context across files. Pre-commit reminders are on by default and allow you to continue; disable them in Git settings or in the reminder. [Guide](docs/review-guide.md). |
| Customization | Chinese and English interfaces, themes, compact mode, adjustable panels, and cursor themes. |

Manual GitHub Actions runs load the workflow definition from the selected branch and show required inputs, defaults, and choices. Environment inputs accept an environment name configured in the repository. Failed loads can be retried without submitting inputs from a previous branch.

Issues share the GitHub account and collaboration remote used by PRs. Filter by state, title/body phrase, exact label name or assignee login, with 30 results per page. Search exposes up to 1,000 results and warns when results may be incomplete. Descriptions and comments are displayed as safe plain text while Markdown source is preserved when editing. Labels and assignees come from existing repository options. GitHub checks write permissions; failed writes retain the draft.

Create a local branch from an issue and choose its starting point and whether to check it out. The local repository/branch association is saved on this computer and preselects the issue in later PR creation. Alternatively, create a linked PR directly from an issue or select multiple issues in the PR form. Selected issues add explicit `Closes owner/repo#number` directives to the description, following [GitHub's linking rules](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue). Closing normally requires merging into the default branch. The app reads actual issue state rather than marking it completed when a PR is created or merged.

Issue details show PR references from the GitHub timeline. PR details and review dialogs show issues referenced in the description. Links within the current collaboration repository open in the app; other repositories open on GitHub. Reopening the issue view or refreshing retrieves its current state. Alt+6 and the command palette open Issues. Comments and timeline events each use the existing 1,000-item pagination limit.

Linked branches show a Current task banner that follows branch switches. Existing branches can also be linked from issue details; unlinking only removes the local association. Local issue-based commit and PR templates require preview confirmation before replacing a draft and leave validation as unchecked items. Generation excludes issue background by default. Enabling it includes the titles and bounded descriptions of up to five selected issues; with an external model this background is sent to the configured provider. Commit messages use `Refs`; PR closing references remain controlled by issue selection.

Issue details load related PR heads, merge states and review summaries, combining [Checks](https://docs.github.com/en/rest/checks/runs) with [legacy commit statuses](https://docs.github.com/en/rest/commits/statuses). Each CI endpoint displays up to 100 results; incomplete or failed reads never establish an all-passing result. Skipped, neutral, cancelled and timed-out checks remain distinct from success. Review summaries do not replace GitHub merge rules. Visible views refresh each minute and on focus while preserving discussion drafts; editor dialogs and writes pause automatic refresh. Merges send the displayed head SHA for server-side validation, then refresh related issue state immediately and after short delays to accommodate asynchronous closure.

Push operations let you choose a remote and destination branch, with the repository address and push direction shown before proceeding. Defaults follow branch `pushRemote`, repository `remote.pushDefault`, and tracking configuration. Remembering a push remote and changing the tracking branch are separate choices. Commit and Push asks for a destination before creating the commit; cancelling leaves the draft intact. Tag pushes and remote tag deletion also support remote selection.

Remote branch context menus can delete a branch on the selected server while retaining local branches. The toolbar fetches all remotes; repository actions and remote settings offer fetch with pruning of stale remote references. Remote settings also let you select the GitHub remote used for PRs and Actions independently. Ahead/behind counts compare with the tracking branch shown in the status bar. PR creation lets you select the source GitHub repository and published branch, including same-named branches across forks, and reloads the base when the collaboration repository changes. If remembering a remote fails after a successful push, a separate warning preserves the successful push result.

The commit panel sits beside the diff at typical laptop widths. Appearance settings offer automatic, side-by-side, and drawer modes. Branch, PR, and workflow lists support keyboard navigation and activation; Shift+F10 opens branch actions. Repository tools group recovery and diagnostics. Push preferences and tracking settings live under advanced options. Errors show recovery guidance with expandable technical details that can still be copied.

"AI plan all changes" uses the configured AI to suggest commit count, order, grouping rationale, titles and descriptions for staged, unstaged and new files. Review and edit messages, move files, reorder or merge groups before confirming. Create all commits together, or choose a remote first and push once after every commit succeeds. Groups contain whole files; partially staged files use their full working copy. Changed snapshots block execution. Partial failures report completed commits, and push retries never recreate commits. Existing commit drafts are preserved.

"Plan commits from staged hunks" manually assigns separate hunks of one file to different commits. Stage files, hunks or changed lines first, then edit messages, reorder or merge groups and preview each exact diff relative to its predecessor. Unassigned units remain staged and unstaged content stays excluded. Added, deleted, renamed, binary and mode changes are whole-file units. Backend-generated temporary indexes preserve original staging selections. Branch, HEAD or index changes stop further commits. Repository hooks run normally; failures or altered commit content stop the sequence and report actual completed commits. Stop requests wait for the active commit to finish. An existing HEAD receives a recovery point. Reloading remaining changes clears the groups; use the usual push action afterwards. This iteration provides manual planning.

Hunk group assignments, order, titles and descriptions are saved locally per repository and branch, keeping the latest 20 drafts for up to 30 days. Drafts contain messages, unit IDs and a snapshot digest, without source diffs or temporary indexes. Reopening after closing or restarting reads current Git state first; changed HEAD, staging contents or units prevent restoration. A matching draft is applied only when you choose "Restore draft" and remains editable; creating commits requires a separate confirmation. Reloading or starting commit creation clears the draft to avoid duplicate execution. Storage failures are explained while manual planning remains available.

The hunk planner shows the current branch issue's state and bounded background, and can preview fully qualified `Refs owner/repo#number` lines for selected commits. Preview shows complete messages; applying rechecks the staged snapshot, issue association and account. Cancellation or failure preserves original messages. References are saved in the draft's descriptions and remain editable after restoration; review them again after replacing AI groups. Existing references are skipped, while code examples and comments do not count. Oversized descriptions or unclosed fences/comments require correction first. PR creation carries the branch issue association and lets you select closing references separately. If issue details cannot load, references can still use the locally linked identity and manual planning remains available.

"Suggest groups with AI" explicitly sends the complete staged-unit manifest and diff excerpts to the configured model for suggested commit count, order, messages and rationale. Limits are 200 units, a 20,000-character manifest and 60,000-character input, with up to 6,000 characters per unit diff. Excerpted inputs are labeled. Every unit must appear exactly once; missing, duplicate, unknown IDs or invalid messages are rejected. Review the proposal and explicitly apply it before it replaces manual groups; you can still edit, leave units staged and preview exact diffs before separately confirming commit creation. Snapshots are checked before and after analysis and before applying. Cancellation, failures, changed settings and late responses preserve existing groups. Manual mode works without a model. Analysis uses the existing AI protocol adapters with a 60-second deadline and never creates or pushes commits automatically.

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
