# Phase 318: D177B9 State Map — OS Context/Screen State Byte

## Summary

Complete ROM-wide scan of D177B9 (the OS "context state byte" that determines which screen/mode the calculator is in). Confirmed exactly 14 references: 12 reads + 2 writes. All reads are organized in 6 symmetric pairs across the flash/low-ROM dispatch copies. Mapped 13 distinct state values to TI-84 CE screens, extracted state transition rules, and identified a 6th reference pair (graph key handler) not previously documented.

## Reference Map

### Writes (2 total — one per dispatch copy)

| Address | Function | Instruction |
|---------|----------|-------------|
| 0x008879 | dispatch_key_lowrom (0x00883C) | `LD A,(IX+9); LD (D177B9),A` |
| 0x049D07 | dispatch_key_flash (0x049CCA) | `LD A,(IX+9); LD (D177B9),A` |

Both write the `new_state` parameter during state transitions. **No other code in the entire 4 MB ROM writes D177B9.**

### Reads (12 total — 6 symmetric pairs)

| Category | Low ROM | Flash ROM | Purpose |
|----------|---------|-----------|---------|
| dispatch_key (initial) | 0x00884C | 0x049CDA | Read current state, compare with new_state param |
| dispatch_key (re-read) | 0x008863 | 0x049CF1 | Re-read after exit_state returned nonzero |
| exit_state | 0x0085EF | 0x0499CC | _seqcase dispatch: allow vs block transition |
| process_key | 0x008651 | 0x049A3A | _seqcase dispatch: per-state key processing |
| get_last_key | 0x00895E | 0x049E13 | _seqcase dispatch: return D177B8 for current state |
| graph_key_handler | 0x0092B7 | 0x042782 | `CP 0x13` — special graph-screen dispatch |

### Graph Key Handler (new finding)

Two parallel functions (0x009286 low / 0x04277F flash) read D177B9 and test for state 0x13 (Graph Active):
- If state == 0x13: `dispatch_key(0x97, 0x13)` — graph-specific key event
- If state != 0x13: `dispatch_key(0x06, 0x03)` — fall back to Window/Format state
- Then checks D1407E flag for optional `dispatch_key(0x10, 0x03)` follow-up

This is the only D177B9 usage outside the core dispatch/exit_state/process_key/get_last_key functions.

## State-to-Screen Map

### Base Modes (0x01-0x04) — Allow Transitions

| State | Screen | Callers | Key Codes | Evidence |
|-------|--------|---------|-----------|----------|
| 0x01 | **Home Screen** | 7 | 0x20, 0x21 | Fewest callers among base modes; 2 key codes = cursor/entry |
| 0x02 | **Y= Equation Editor** | 21 | 0x40-0x47 | 8 key codes = 8 equation slots (Y1-Y8) |
| 0x03 | **Window / Format** | 39 | 0x06-0x11 | Most callers; 12 key codes = Xmin/Xmax/Xscl/Ymin/Ymax/Yscl/etc. |
| 0x04 | **Zoom** | — | (from _seqcase) | 12-entry _switchcase table in process_key |

### Mode Selector (0x00) — Not in _seqcase

| State | Purpose | Callers | Key Codes |
|-------|---------|---------|-----------|
| 0x00 | **Switch-to-screen** | 41 | 0x01-0x05 |

State 0x00 appears in caller args (41 callers) but NOT in the _seqcase dispatch tables. The 5 key codes (0x01-0x05) likely map to: 0x01=Home, 0x02=Y=, 0x03=Window, 0x04=Zoom, 0x05=Trace/Graph. This state is used by functions that want to initiate a screen transition.

### Sub-Modes (0x10-0x16) — Block Transitions

| State | Screen | Callers | Key Codes | Evidence |
|-------|--------|---------|-----------|----------|
| 0x10 | **Menu / Dialog** | 16 | 0x80-0x82, 0xC0, 0xFF | 0xFF = cancel/escape; 0xC0 = shared with 0x12 |
| 0x11 | **Stat / List Editor** | 41 | 0x83-0x86 | Most callers of any sub-mode; 4 ops = navigate/edit/insert/delete |
| 0x12 | **Matrix Editor** | 10 | 0xC0-0xC4 | 5 key codes; callers in 0x0414xx-0x0415xx region |
| 0x13 | **Graph Active** | 23 | 0x08, 0x96-0x9B | Graph-specific handler with CP 0x13 test; 0x08 shared with state 0x03 |
| 0x14 | **Table** | 3 | 0x8D, 0x92-0x93 | Fewest callers; all in 0x07xxxx (graph/table region) |
| 0x15 | **Distribution / Finance** | 10 | 0x8C, 0x8E-0x8F | Callers include 0x02F61E, 0x031EC5 (finance region) |
| 0x16 | **Catalog** | 5 | 0xA0-0xA2 | Flash-only (missing from low ROM _seqcase) |

### Flash-Only Modes (0x17-0x18) — Allow Transitions

| State | Screen | Callers | Key Codes | Evidence |
|-------|--------|---------|-----------|----------|
| 0x17 | **Program Editor** | 6 | 0xA5-0xA7 | Only in flash callers; 3 key codes = Prgm ops |
| 0x18 | **Apps / Memory** | 11 | 0xAA, 0xAC, 0xAE, 0xAF, 0xBD | Most diverse key codes; 0xBD has 7 callers |

## Transition Rules

```
exit_state(_seqcase on D177B9):

  ALLOW (return 1):  0x01, 0x02, 0x03, 0x04, 0x17, 0x18, default
  BLOCK (return 0):  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16
```

**Interpretation**: Sub-modes (0x10-0x16) are "sticky" — they require explicit cleanup before the OS can transition to another screen. Base modes (0x01-0x04) and flash-only modes (0x17-0x18) allow immediate transitions.

When a transition is allowed, the dispatch function:
1. Recursively calls itself with the old state and key=0
2. Then commits the new state to D177B9

When a transition is blocked:
1. Sets retval = 0, does NOT write D177B9
2. The caller is responsible for handling the blocked transition

## Caller Analysis

### By Dispatch Function

| Function | CALL sites | JP sites | ROM region |
|----------|-----------|----------|------------|
| 0x049CCA (flash) | 166 | 1 | 0x02-0x07xxxx |
| 0x00883C (low ROM) | 78 | 0 | 0x00-0x01xxxx |

### Non-Extractable Call Sites (12 total)

| Type | Count | Examples |
|------|-------|---------|
| Self-recursive | 2 | 0x049CFE, 0x008870 (state=current D177B9, key=0) |
| Frame-based (state=0x18) | 3 | 0x0387B8, 0x038B0A, 0x038BA0 |
| Frame-based (dynamic) | 4 | 0x0411B3, 0x04125D, 0x0125DC, 0x012686 |
| DE-register args | 2 | 0x03E32F (state=0x10, key=0xFF), 0x03E365 |
| JP tail call | 1 | 0x0222A0 (in OS mega-table) |

### State Popularity

| State | Total Callers | Key Code Count | Key Range |
|-------|--------------|----------------|-----------|
| 0x00 | 41 | 5 | 0x01-0x05 |
| 0x11 | 41 | 4 | 0x83-0x86 |
| 0x03 | 39 | 12 | 0x06-0x11 |
| 0x13 | 23 | 7 | 0x08, 0x96-0x9B |
| 0x02 | 21 | 8 | 0x40-0x47 |
| 0x10 | 16 | 5 | 0x80-0x82, 0xC0, 0xFF |
| 0x18 | 11 | 5 | 0xAA-0xBD |
| 0x12 | 10 | 5 | 0xC0-0xC4 |
| 0x15 | 10 | 3 | 0x8C, 0x8E-0x8F |
| 0x01 | 7 | 2 | 0x20-0x21 |
| 0x17 | 6 | 3 | 0xA5-0xA7 |
| 0x16 | 5 | 3 | 0xA0-0xA2 |
| 0x14 | 3 | 3 | 0x8D, 0x92-0x93 |

## Architecture

```
D177B9 Write Path (only 2 sites):
  Caller pushes (key_code, new_state) onto stack
    -> dispatch_key(key_code, new_state)
      -> reads D177B9 (current state)
      -> if new_state != current:
           exit_state(new_state)
             -> _seqcase on D177B9: allow or block
           if allowed:
             recursive dispatch(current_state, 0)
             D177B9 = new_state   <-- WRITE SITE
      -> process_key(key_code)
      -> _seqcase on D177B9 -> D177B8 = key_code

D177B9 Read Path (12 sites, 6 symmetric pairs):
  dispatch_key:     initial read + re-read after exit_state  (4 sites)
  exit_state:       _seqcase dispatch on state               (2 sites)
  process_key:      _seqcase dispatch on state               (2 sites)
  get_last_key:     _seqcase dispatch on state               (2 sites)
  graph_key_handler: CP 0x13 (graph-specific dispatch)       (2 sites)
```

## Key Findings vs Session 317 Claims

1. **"14 total ROM references" — CONFIRMED.** 12 reads + 2 writes, exactly as claimed.
2. **"Only 2 write sites" — CONFIRMED.** One per dispatch copy (0x008879, 0x049D07). No other code writes D177B9 anywhere in the 4 MB ROM.
3. **"12 reads" — CONFIRMED and now fully categorized.** 6 symmetric pairs across flash/low-ROM copies.
4. **NEW: graph_key_handler pair** at 0x0092B7/0x042782 not previously highlighted. These test D177B9==0x13 for graph-specific dispatch, adding the 6th read pair.
5. **State 0x00** (41 callers, keys 0x01-0x05) is used by callers but NOT in _seqcase tables — it's a "switch to screen" pseudo-state.
6. **13 distinct states observed** from 233 extractable callers, matching session 317's count.

## Golden Regression

probe-phase99d-home-verify.mjs: 26/26 PASS (no existing behavior affected)

## Artifacts

- `probe-phase318-d177b9-state-map.mjs` — 41/41 structural checks
- `phase318-d177b9-state-map-report.md` — this file
