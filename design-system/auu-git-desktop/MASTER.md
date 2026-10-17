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

- Default widths: navigation 200 px, working-file list 260 px, inspector 320 px.
- Preserve 640 px for the main content where the supported window size permits. Adapt effective panel sizes without overwriting saved user preferences.
- Navigation is pinned by default. Its pin button and appearance setting persist the choice. Pinned navigation stays visible when focus moves or views change; the header can still explicitly collapse it.
- Unpinning immediately hides navigation at every window width. The header opens it temporarily as a drawer; clicking outside, pressing Escape or choosing a view closes it. Pin-mode changes clear any previously open drawer. The inspector uses a drawer below 1240 px, or below 1480 px when pinned navigation is visible. Explicit pinning takes priority over the 640 px reading target when a narrow window cannot fit both. Both drawers support Escape, focus trapping and focus restoration.
- Commit scope and primary actions stay visible while the editor scrolls. Closing a drawer retains the draft and amend mode.
- History places refs beside titles rather than reserving an empty column. Secondary metadata hides when space is limited and can be toggled.
- History diffs open in a wide, scrollable viewer with real unified and split modes. Do not silently truncate them to the first 100 lines.
- The embedded Git console opens on demand. It is not a general-purpose shell.

## Typography and color

- Use system sans-serif fonts for interface labels and prose. Use monospace for code, hashes, line numbers and terminal output.
- Default interface text is 13–14 px; secondary information is at least 12 px. Diff text is 13 px. Keep compact mode optional.
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
