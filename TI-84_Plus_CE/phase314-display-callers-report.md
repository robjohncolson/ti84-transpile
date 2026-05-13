# Phase 314: SetTextSpan / SetDisplayRegion Caller Taxonomy

## Method

- Raw ROM scan patterns:
  - `SetTextSpan`: `CD EC 03 00` (via vector `0x0003EC`) and `CD D8 52 01` (direct `0x0152D8`)
  - `SetDisplayRegion`: `CD F0 03 00` (via vector `0x0003F0`) and `CD 49 53 01` (direct `0x015349`)
- Transpiled JS cross-check strings:
  - `call 0x0003ec`, `call 0x0152d8`
  - `call 0x0003f0`, `call 0x015349`
- Context windows: about 0x40 bytes before each representative `CALL`

## Vector Table Audit

The ROM vector table confirms the vectors were swapped in the session prompt:

| Vector | ROM entry | Actual target | Function |
|--------|-----------|---------------|----------|
| `0x0003EC` | `C3 D8 52 01` | `0x0152D8` | `SetTextSpan` |
| `0x0003F0` | `C3 49 53 01` | `0x015349` | `SetDisplayRegion` |

Everything below uses the raw ROM mapping above.

## Full Caller Census

| Function | Via vector | Direct | Total |
|----------|------------|--------|-------|
| `SetTextSpan` | 74 via `0x0003EC` | 28 via `0x0152D8` | 102 |
| `SetDisplayRegion` | 85 via `0x0003F0` | 46 via `0x015349` | 131 |

## Caller Distribution By ROM Region

| Region | SetTextSpan | SetDisplayRegion |
|--------|-------------|------------------|
| `0x00xxxx` | 5 | 8 |
| `0x01xxxx` | 23 | 38 |
| `0x02xxxx` | 10 | 21 |
| `0x04xxxx` | 25 | 27 |
| `0x06xxxx` | 39 | 35 |
| `0x0Bxxxx` | 0 | 2 |

The broad shape is useful by itself:

- `0x00xxxx` and `0x01xxxx` favor direct implementation calls, which fits low-level display code calling its own leaf helpers without the vector indirection.
- `0x02xxxx`, `0x04xxxx`, and `0x06xxxx` are dominated by vector calls, which looks like higher-level OS subsystems using the vector table as a stable ABI boundary.
- `SetTextSpan` is especially dense in `0x06xxxx`, which is consistent with app/editor/list rendering.
- `SetDisplayRegion` is dense in both `0x01xxxx` and `0x06xxxx`, which fits window setup plus app-local clipped region work.

## 10 Representative Caller Analyses

### SetTextSpan

### 1. `0x00AA60` (direct, `0x00xxxx`)

- Visible setup: loads literal `0xD17726`, pushes it, pushes span width `0x000002`, reloads `IY` from `D176A8`, then calls `0x0152D8`.
- Tracked RAM writes before call: none of `D1770A`, `D17713`, `D17716`, `D1771A`, `D1771D`.
- Classification: `other` - low-level bootstrap/home text scratch setup.
- Why: this is a narrow 2-byte span call driven by `D176A8` context rather than a display-region base, which looks like a tiny scratch or home-line initialization path.

### 2. `0x02CE9C` (vector, `0x02xxxx`)

- Visible setup: `D1770A = D176A8 + 6`, `D17716 = 0`, `D17713 = 0`, then push literal `0xD1771A`, push width `0x000004`, reload `IY` from `D176A8`, call `0x0003EC`.
- Tracked RAM writes before call: `D1770A`, `D17716`, `D17713`.
- Classification: `menu setup`.
- Why: it explicitly zeros cursor X/Y before building a 4-wide text span, which is the cleanest "start a fresh menu row/window" pattern in the sample.

### 3. `0x02E825` (vector, `0x02xxxx`)

- Visible setup: zeroes `D17726`, loads `D176A8`, stores `D1770A = D176A8 + 6`, then pushes literal `0xD1771A` and width `0x000004` before `CALL 0x0003EC`.
- Tracked RAM writes before call: `D1770A`.
- Classification: `editor/text init`.
- Why: this is a fresh text-buffer priming sequence. The follow-on call at `0x02E83C` suggests the caller is composing more than one text span in sequence, which fits editor or split text-pane initialization.

### 4. `0x02EA39` (vector, `0x02xxxx`)

- Visible setup: manipulates `D17726`, tests state at `D17758`, updates `D1774E`, then pushes width `0x000002` and an IX-relative pointer before calling `0x0003EC`.
- Tracked RAM writes before call: none of `D1770A`, `D17713`, `D17716`, `D1771A`, `D1771D`.
- Classification: `editor/home screen`.
- Why: the narrow width-2 span plus stateful IX-relative pointer looks like cursor or inline text-cell movement rather than whole-window setup.

### 5. `0x0655AD` (vector, `0x06xxxx`)

- Visible setup: clears a local scratch block, zeroes `D17726`, loads `D176A8`, stores `D1770A = D176A8 + 6`, then pushes literal `0xD1771A` and width `0x000004` before `CALL 0x0003EC`.
- Tracked RAM writes before call: `D1770A`.
- Classification: `editor/text init`.
- Why: it matches the same "prime text buffer, then emit a 4-wide span" shape as `0x02E825`, but from the heavy `0x06xxxx` app/editor cluster instead of the mid-OS UI cluster.

### SetDisplayRegion

### 6. `0x00ADE9` (direct, `0x00xxxx`)

- Visible setup: `D1770A = D176AB`, `D17716 = D1770A + 8`, then pushes width `0x000002`, three zero-like placeholders, and row count `0x000008` before `CALL 0x015349`.
- Tracked RAM writes before call: `D1770A`, `D17716`.
- Classification: `other`.
- Why: row count `8` is the special case inside `SetDisplayRegion` that falls into the half-height / rotate-helper path. This is the clearest direct caller that intentionally targets the special pixel-cell branch.

### 7. `0x02CB30` (vector, `0x02xxxx`)

- Visible setup: clears local state and `D176DD`, then pushes `0x000002`, `0`, `0`, `0`, and `0x000011` before `CALL 0x0003F0`.
- Tracked RAM writes before call: none of `D1770A`, `D17713`, `D17716`, `D1771A`, `D1771D`.
- Classification: `screen clear/init`.
- Why: `0x11` rows is the tallest obvious window in this cluster and all visible fill/setup values are zeroed, which matches a full clear/reset of the text display region.

### 8. `0x02D665` (vector, `0x02xxxx`)

- Visible setup: copies `D1772A` into `D1771A`, zeroes `D1771D`, then pushes width `0x000004`, zero fill values, reloads the mode byte from `D1771D`, re-pushes `D1771A`, and calls `0x0003F0`.
- Tracked RAM writes before call: `D1771A`, `D1771D`.
- Classification: `graph rendering`.
- Why: this is the graph-side region-builder noted in phase 313. The adjacent second call at `0x02D688` switches the terminal immediate to `0x00000D`, which reinforces the idea that this cluster is building graph subregions of different heights.

### 9. `0x02DA54` (vector, `0x02xxxx`)

- Visible setup: advances an IX-local pointer, writes a zero byte through it, copies `D176E6` into `D1771A`, zeroes `D1771D`, then pushes the IX-local pointer, width `0x000004`, zero fill values, mode from `D1771D`, and `D1771A` before `CALL 0x0003F0`.
- Tracked RAM writes before call: `D1771A`, `D1771D`.
- Classification: `dialog/window`.
- Why: this caller first prepares a destination pointer, then builds a clipped region around that pointer. It looks like "open a window and clear/fill it" rather than raw graph or plain text.

### 10. `0x06A997` (vector, `0x06xxxx`)

- Visible setup: this is the second of two back-to-back narrow calls (`0x06A967` then `0x06A997`). The pair derives values from `D176FD`, `D176FE`, and `D176FF`, pushes width `0x000002`, zero fill placeholders, and the small counter value from `D176FE`, then calls `0x0003F0`.
- Tracked RAM writes before call: none of `D1770A`, `D17713`, `D17716`, `D1771A`, `D1771D`.
- Classification: `status bar`.
- Why: the narrow paired calls, tiny counter-driven state machine, and no window-base priming strongly suggest a compact numeric/status overlay rather than a general-purpose text window.

## Sample Taxonomy Table

This table counts the 10 detailed representative callers above, not all 233 call sites.

| Category | Count | Representative sites |
|----------|-------|----------------------|
| `menu setup` | 1 | `0x02CE9C` |
| `graph rendering` | 1 | `0x02D665` |
| `editor/home screen` | 3 | `0x02E825`, `0x02EA39`, `0x0655AD` |
| `status bar` | 1 | `0x06A997` |
| `dialog/window` | 1 | `0x02DA54` |
| `screen clear/init` | 1 | `0x02CB30` |
| `other` | 2 | `0x00AA60`, `0x00ADE9` |
| `error display` | 0 | none in the sample |

## Common Argument / Setup Patterns

| Pattern | Seen in sample | Notes |
|---------|----------------|-------|
| `SetTextSpan` with width `4` after `D1770A = D176A8 + 6` | 3 callers | Menu/editor/app text region setup (`0x02CE9C`, `0x02E825`, `0x0655AD`) |
| `SetTextSpan` with width `2` and no tracked RAM writes | 2 callers | Narrow cell/cursor/scratch work (`0x00AA60`, `0x02EA39`) |
| `SetDisplayRegion` after writing `D1771A` and zeroing `D1771D` | 2 callers | Graph/window region setup (`0x02D665`, `0x02DA54`) |
| `SetDisplayRegion` full clear with terminal immediate `0x11` | 1 caller | Full text-area clear (`0x02CB30`) |
| `SetDisplayRegion` special `rowCount == 8` path | 1 caller | Direct pixel-cell path (`0x00ADE9`) |
| paired narrow `SetDisplayRegion` calls fed from `D176FD/D176FE` | 1 sampled pair | Compact status/numeric overlay (`0x06A967`, `0x06A997`) |

## Key Patterns Observed

- The vector mapping matters: `0x0003EC` is the `SetTextSpan` vector and `0x0003F0` is the `SetDisplayRegion` vector.
- `SetTextSpan` callers usually materialize only the final width/base pair in the last few instructions; the remaining logical state is often pre-staged in `IY`, `D1770A`, or IX locals.
- The most common visible `SetTextSpan` widths are `2` and `4`.
- `SetDisplayRegion` commonly appears immediately after the caller updates `D1771A` and `D1771D`, which makes it look like the main "activate this display region with this mode" helper.
- The `0x02D665` / `0x02D688` pair is a useful graph signature: same wrapper, different terminal size immediate (`4` vs `0x0D`).
- The `0x02E825` / `0x02E83C` pair is a useful editor signature: two consecutive `SetTextSpan` calls after priming `D1770A`.

## Unexpected Callers / Behaviors

- Direct implementation calls are common, not rare: 28 direct `SetTextSpan` callers and 46 direct `SetDisplayRegion` callers.
- `0x00ADE9` is an intentional direct hit on the `rowCount == 8` special path, so the rotate-helper branch is not just dead defensive code.
- `0x06A967` and `0x06A997` do not follow the usual `D1771A` / `D1771D` region-priming pattern at all; they look like compact status-field painters driven by tiny counters in `D176FD` to `D176FF`.
- `SetTextSpan` in the `0x06xxxx` cluster often behaves like an app/editor-local formatter rather than a menu/window primitive, even when the immediate width is still the familiar `4`.
