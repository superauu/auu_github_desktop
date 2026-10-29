# UI visual regression

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
