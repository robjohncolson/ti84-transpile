# Phase 112 - White-Fill Home Screen Workspace

## What Changed

- `browser-shell.html`
  - Added a new white-fill stage inside `showHomeScreen()` after the history-area render and before the entry-line fill.
  - The new stage paints rows `75-219` to `0xFFFF` so the browser shell shows the expected white workspace instead of the `0xAA` sentinel.
- `probe-phase99d-home-verify.mjs`
  - Added the same workspace white-fill stage between the history-area render and the entry-line fill.
  - Adjusted the probe's composite-density sanity gate so the intentionally denser white workspace still reaches the unchanged mode-row decode.

## Golden Regression

Verified via `node probe-phase99d-home-verify.mjs`:
- 26/26 exact matches (row 19, col offset 2)
- Decoded text: `"Normal Float Radian       "`
- `Normal`: PASS
- `Float`: PASS
- `Radian`: PASS
- Status dots left: PASS (before=0, after=10, final=10)
- Status dots right: PASS (before=0, after=10, final=10)
- Composite: drawn=75196, fg=14136, bg=61060

## Behavior

- This is a visual improvement only. It fills previously unrendered home-screen workspace rows with white.
- No ROM routines, peripheral behavior, or calculator logic changed.
- The mode decode area at rows `17-21` is untouched by this fill stage.
