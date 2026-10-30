# UI visual regression

## Automated Chromium checks

```sh
npm ci
npx playwright install chromium
npm run test:visual
```

Playwright starts an isolated local Vite server on `127.0.0.1:5179`, runs screenshot cases and workflow interaction tests, waits for the actual application and
fonts, and compares PNG screenshots. Interaction tests cover keyboard navigation,
context-menu focus restoration, dialog focus trapping, repository-specific search
state and recovery from failed file reads. Issue tests cover create/edit/comment,
close/reopen, label and assignee preservation, issue-to-branch-to-PR navigation,
reading server-confirmed closure after a simulated merge, and narrow layouts.
Issue writes and GitHub merge behavior are simulated in tab-local memory; no real
issues, comments, branches or pull requests are created by these browser tests.
Workflow checks also cover branch-aware task banners, opt-in generation context,
preview-before-replace behavior, partial CI failures and refreshes that preserve drafts.
Review evidence uses an in-memory bridge response restricted to full-index diff
reads on the synthetic fixture repository. All other bridge calls remain blocked.
The test fails on browser errors or attempts to contact repository APIs or external
services. It uses a clean browser context per case, a fixed viewport and pixel
ratio, and bundled test-only CJK fonts; it does not access saved repositories.

Overview cases cover distinct file counts, unavailable repositories, cancellation, account changes with late CI replies, searching beyond the first batch, navigation and narrow layouts. History restart cases use an isolated fixture key in tab-local session storage, restoring only metadata and verifying that callbacks and credentials are absent. They do not read real application storage.

Reviewed automated baselines live under `baselines/playwright-win32/`. They are
separate from the original CUA JPEGs. Other operating systems require separately
reviewed baselines in `baselines/playwright-<platform>/`. Use the locked Playwright
version and its installed Chromium; system browsers can render differently.

CI runs the Windows cases without updating baselines. Missing baselines fail too.
Failures retain actual/expected/diff images, traces and an HTML report in
`test-results/` and `playwright-report/`, uploaded as an Actions artifact.
Open the local report with `npx playwright show-report`.

For an intentional UI or browser-version change, explicitly regenerate candidates:

```sh
npx playwright test --update-snapshots
```

Inspect every changed PNG and diff before committing. Never update snapshots in
CI or accept them only because the current test fails. Keep behavior/keyboard tests:
pixel comparisons do not prove interaction correctness.

## Original CUA captures

Run `npm run dev`, then open `/tests/visual/index.html?theme=dark` (or `theme=light`).
This development-only entry uses the actual application components with deterministic commits,
multiple graph lanes, long branch names, ref overflow, and WIP changes. Network access is blocked;
browser storage is isolated in memory before stores hydrate, so real repositories and preferences are unaffected.
It is not an entry point of the production build.

For every case in `cases.json`, use the browser tools in CUA to set the specified viewport,
navigate to the fixture with its theme, and wait for
`document.documentElement.dataset.uiFixtureReady === 'true'`. Move focus away from controls,
capture the viewport, and save the JPEG as `<name>.jpg` in a fresh **actual** folder.
Reset the viewport afterwards. Baselines must be reviewed visually before replacing them.
Capture baselines and actual images on the same OS/browser/font setup; these initial baselines
use Windows and the Codex in-app browser. Different rendering environments need separate baselines.

With Python and Pillow installed, compare the fresh captures:

```sh
python scripts/compare-ui-snapshots.py --actual path/to/actual
```

The command fails on missing images, incorrect viewport sizes, or more than 0.5% changed pixels
after a small JPEG/subpixel tolerance. Failed comparisons write highlighted differences to
`tests/visual/diffs/`. Keep the fixture data and capture conditions stable; do not automatically
accept a changed baseline. Use normal UI tests for state/keyboard behavior as pixel comparisons
cannot prove interaction correctness.
