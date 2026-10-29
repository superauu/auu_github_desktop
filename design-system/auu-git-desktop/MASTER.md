# AuuGit desktop design system

The application supports two equally maintained themes: light and dark. Theme switching and system-following behavior must remain available.

## Daily workflow

Inspect changes → control staged content → write a message → commit → push.

- Keep one working-file list, divided into staged, unstaged and untracked sections.
- Show the commit scope beside the editor. Generation and commit actions use the same scope policy.
- With no staged changes, label the explicit stage-all-and-commit action. Amend never auto-stages unrelated work.
- Distinguish local rules, successful model output and fallback output. Preview generated text before replacing a draft.
- Reusing a historical message copies text; it is not an AI operation.

## Layout

- Default widths: navigation 200 px, working-file list 260 px, history inspector 320 px, commit composer 400 px. Persist and reset the two inspector widths independently. Migrate old shared custom widths into both views while assigning the new history default to untouched layouts. Preserve at least 320 px for the inspector in ordinary laptop layouts, falling back further only when needed to keep the main content usable.
- Preserve 640 px for the main content where the supported window size permits. Adapt effective panel sizes without overwriting saved user preferences.
- Navigation is pinned by default. Its pin button and appearance setting persist the choice. Pinned navigation stays visible when focus moves or views change; the header can still explicitly collapse it.
- Unpinning immediately hides navigation at every window width. The header opens it temporarily as a drawer; clicking outside, pressing Escape or choosing a view closes it. Pin-mode changes clear any previously open drawer. The inspector uses a drawer below 1240 px, or below 1480 px when pinned navigation is visible. Explicit pinning takes priority over the 640 px reading target when a narrow window cannot fit both. Both drawers support Escape, focus trapping and focus restoration.
- Commit scope and primary actions stay visible while the editor scrolls. Closing a drawer retains the draft and amend mode.
- Commit-scope headings use a short, single-line label and a non-wrapping file count. Truncate the heading at manually narrowed widths; keep its full meaning in the section label and tooltip.
- The main workspace uses continuous, flat surfaces with thin panel separators, no outer gutters and no panel corner radii. Keep elevated surfaces for dialogs.
- All dialogs share an opaque card surface, semantic foreground/input colors, an 8 px corner radius and one consistent dimmed overlay. Use the same cool charcoal palette as the workspace; avoid glass gradients, saturation filters and separate neutral-gray palettes. Drawer panels retain square corners. Light, reduced-transparency and forced-color modes follow the same shared surface rules.
- History uses aligned branch/tag, graph and message columns at content widths of 620 px or more. Below that, refs sit beside titles to preserve reading room. From 740 px, optional author avatars, compact date labels and hashes use their intrinsic width at the trailing edge of each row, without a reserved metadata column. Names and full dates remain available in tooltips and commit details. History rows and SVG nodes share a 30 px row height.
- The working-tree row puts its status label and change count in the refs area, aligns its short subject with commit titles and keeps one trailing view-changes cue. The entire row supports click, Enter and Space; narrow layouts reduce the status label and action to icons without wrapping or changing graph geometry.
- History reserves 232 px for branch/tag labels and at least 84 px for the graph, growing with 32 px between lanes. Give these columns priority over message width. Graph lanes use distinct teal, blue, purple, green and amber colors. Selected history and navigation rows use a blue surface with a cyan edge. Do not depend on color alone for ref identity.
- Ref overflow uses a keyboard-accessible +N menu containing every full branch/tag name. Choosing an item locates the referenced commit without checking out a branch. Long visible refs must shrink before clipping the overflow trigger.
- From the history search or path field, Down enters the first result and Escape clears both filters while retaining input focus. Respect IME composition and modified key combinations. Filtering does not change the selected commit until the user explicitly enters a result.
- Graph author avatars are 20 px in diameter, or 22 px for HEAD and the selected commit; selection rings and ref connectors follow the avatar radius. Trailing author avatars are 20 px. Keep all nodes centered within the shared 30 px history rows.
- Wide windows expose branch creation, stash and the Git console in the toolbar; the overflow menu retains these operations at smaller sizes.
- History diffs open in a wide, scrollable viewer with real unified and split modes. Do not silently truncate them to the first 100 lines.
- The embedded Git console opens on demand. It is not a general-purpose shell.

## Typography and color

- Chinese text prefers locally installed Microsoft YaHei UI, then Microsoft YaHei. Latin UI text keeps Inter and code keeps JetBrains Mono; Chinese comments use the same system Chinese font fallback. No Chinese font files are bundled.

- Use the shared Inter/system sans-serif stack for navigation, filenames, branch labels, counts and prose. Reserve JetBrains Mono for code, hashes, line numbers and terminal output; reserve Orbitron for the brand wordmark.
- Interface text is 13 px with a 20 px line height; secondary labels are 12 px with an 18 px line height. Panel titles use 13 px/600 weight, sidebar section headings 13 px/500 to match navigation text, other section labels 12 px/500, and ordinary text 400–500. Diff text remains 13 px and keeps its independent font-size control. Keep compact mode optional.
- Primary navigation rows, tree headings and branch/tag/stash rows share a 30 px height (26 px in compact mode). Use 2 px between adjacent selectable rows and only a thin divider between tree sections; do not stack group margins, heading padding and divider padding. Panel headers share a 34 px height (30 px in compact mode).
- Hidden tree actions must not reserve label width. Keep file-section labels, counts and actions on one line; use labeled icon buttons and a secondary-actions menu in narrow file panels, with full text available to assistive technology and tooltips.
- Prioritize filenames, with directories beneath them and full paths available in the selected-file heading and tooltips.
- Use CSS theme variables from src/index.css and semantic Tailwind colors. Do not introduce light-only or dark-only literals in shared UI.
- Primary cyan identifies selection and main actions. Modification counters are neutral. Added and deleted content uses green and red alongside status text or +/- signs.
- Reserve animation for loading and ongoing work; static changes, refs and helper actions do not pulse.

## Interaction and safety

- File lists support arrows, Home/End, Enter, Space to stage/unstage, and Shift+F10 for context menus. History navigation works across virtualized rows.
- Context menus support arrows and Escape and restore focus to their origin. Hover actions must also appear on keyboard focus.
- Icon buttons have accessible names and practical pointer targets. Resize separators support keyboard adjustment.
- Mouse cursors use the system style by default. Appearance settings offer all 14 curated styles with paired arrow/hand previews on light and dark backgrounds. Apply and persist the choice immediately; preserve native text, resize and disabled cursors, including a native fallback in forced-color mode.
- Use application confirmation dialogs for destructive operations. Show repository, branch, affected object and recovery implications. Focus Cancel initially.
- Do not add confirmation to ordinary staging actions.

## Verification

Check light and dark themes at 900×600, 1280×720 and a wide desktop size. Check readable diffs, overflow, disabled and selected states, dialogs, keyboard focus, draft retention, and the scope of actual commits using an isolated test repository. Do not compile Rust on machines without its toolchain.

The development-only `/tests/visual/index.html` fixture provides deterministic long refs, multiple lanes and WIP changes without network requests or persistent preference writes. Capture cases from `tests/visual/cases.json` with CUA and compare against reviewed baselines using `python scripts/compare-ui-snapshots.py --actual <folder>`. See `tests/visual/README.md` for capture conditions and baseline review rules.
