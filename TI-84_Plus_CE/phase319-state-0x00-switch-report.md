# Phase 319: State 0x00 (Switch-to-Screen) Investigation

## Summary

Complete analysis of D177B9 state 0x00 — the "switch-to-screen" pseudo-state. State 0x00 has 41 callers (the most of any state) but does NOT appear in any _seqcase dispatch table. It is the boot/reset state (RAM zero-fill) and serves as a "neutral zone" between screen transitions. Key codes 0x01-0x05 are hints about the destination screen but are not processed or stored.

## Key Finding: State 0x00 Is NOT a Screen

State 0x00 is fundamentally different from states 0x01-0x18. It has no handlers in:
- exit_state (falls to default: allow)
- process_key (falls to default: sub-dispatch with default retval=0)
- get_last_key (falls to default: reads existing D177B8)

It is a **transition state**, not a screen state. The OS uses it to exit one screen before entering another.

## 41 Callers with 5 Key Codes

| Key Code | Callers | Hypothesized Destination |
|----------|---------|--------------------------|
| 0x01     | 33      | Home Screen              |
| 0x02     | 2       | Y= Equation Editor       |
| 0x03     | 2       | Window/Format             |
| 0x04     | 2       | Zoom                      |
| 0x05     | 2       | Trace/Graph               |

Key 0x01 (Home) dominates because most OS operations return to the home screen when they finish. Each key code 0x02-0x05 has exactly 2 callers: one in flash ROM, one in low ROM (symmetric copies).

### Key Code Purpose

The key codes 0x01-0x05 correspond to the first 5 base state values (0x01-0x05), hinting at the intended destination. However, `process_key` does NOT store these key codes to D177B8 — they pass through the sub-dispatch default path silently. The actual screen transition happens via a subsequent `dispatch_key` call with the real target state.

### Sample Callers (key=0x01, Home)

| Address | ROM Region | Notes |
|---------|-----------|-------|
| 0x02B84E | flash | After conditional checks |
| 0x02BB98 | flash | Sets D14084=1, clears D14074, D177BA |
| 0x008B4D | low | Symmetric copy region |
| 0x00F02F | low | After error handling |

### Sample Callers (key=0x02-0x05)

| Address | Key | ROM Region | Notes |
|---------|-----|-----------|-------|
| 0x041C19 | 0x02 | flash | Y= editor transition |
| 0x01308D | 0x02 | low | Symmetric copy |
| 0x02B934 | 0x03 | flash | Window transition (followed by zoom check) |
| 0x00EF0A | 0x03 | low | Symmetric copy |
| 0x02B953 | 0x04 | flash | Zoom transition (31 bytes after Window caller) |
| 0x00EF22 | 0x04 | low | Symmetric copy |
| 0x02A82A | 0x05 | flash | Trace/Graph transition |
| 0x00A4A4 | 0x05 | low | Symmetric copy |

## Dispatch Flow for State 0x00

When `dispatch_key(key_hint, 0x00)` is called:

```
1. Read D177B9 -> current_state (e.g., 0x11)
2. Compare: 0x00 != current_state -> need transition
3. CALL exit_state:
   - _seqcase on current_state (NOT 0x00)
   - If current is base mode (0x01-0x04, 0x17-0x18): allow
   - If current is sub-mode (0x10-0x16): block -> abort
4. If allowed:
   a. Recursive dispatch_key(0, current_state)  -- cleanup
   b. D177B9 = 0x00  -- enter neutral state
5. CALL process_key:
   - _seqcase on state 0x00 -> falls to default
   - Default does sub-dispatch on key_code -> falls to sub-default
   - Sub-default sets retval=0 (accepted silently)
6. CALL get_last_key:
   - _seqcase on state 0x00 -> falls to default
   - Default reads D177B8 (unchanged from before)
```

**Critical insight**: exit_state dispatches on the CURRENT state, not on 0x00. So whether the transition succeeds depends on the current screen, not on state 0x00 itself.

## D177B9 Initialization

- **Only 2 write sites** in the entire 4 MB ROM (both inside `dispatch_key`)
- **No LD HL,D177B9** instructions anywhere (no indirect writes)
- **RAM at D177B9 is zero-initialized** at power-on
- **State 0x00 is the boot state** — the first screen transition goes from 0x00 to 0x01 (Home)

### Boot Sequence

1. Power on: D177B9 = 0x00 (RAM zero-fill)
2. OS init calls `dispatch_key(0x20, 0x01)` at one of 3 sites:
   - 0x00932F (low ROM)
   - 0x042870 (flash)
   - 0x048015 (flash)
3. Since current state (0x00) defaults to allow, transition proceeds
4. D177B9 = 0x01 (Home Screen active)

## _seqcase Default Handlers

### exit_state Default

| Copy | Default Address | Behavior |
|------|----------------|----------|
| Flash | 0x049A15 | JR +4 (skip retval=0), returns retval=1 (allow) |
| Low ROM | 0x008632 | Epilogue: returns retval=1 (allow) |

Both defaults allow transitions. State 0x00 is "always leavable."

### process_key Default

| Copy | Default Address | Sub-Default | Behavior |
|------|----------------|-------------|----------|
| Flash | 0x049C56 | 0x049C8E | Sub-dispatch on key_code; sub-default sets retval=0 |
| Low ROM | 0x008806 | 0x00882A | Same pattern; sub-default sets retval=0 |

The process_key default is shared with state 0x18 (Apps/Memory). It does a sub-dispatch on key_code for state 0x18's keys (0xAA-0xBD), but keys 0x01-0x05 fall through to the sub-default which sets retval=0 (accepted, no-op).

### get_last_key Default

| Copy | Default Address | Behavior |
|------|----------------|----------|
| Flash | 0x049ED1 | `LD A,(D177B8)` — reads existing D177B8, returns it |
| Low ROM | 0x0089E8 | Same: reads D177B8, returns it |

## Structural Symmetry

State 0x00 is the ONLY state with callers that is missing from all _seqcase tables:
- 13 states in flash tables (0x01-0x04, 0x10-0x18)
- 10 states in low ROM tables (0x01-0x04, 0x10-0x15)
- State 0x00: absent from all 6 tables (exit_state, process_key, get_last_key x2 copies)

## Relationship to Phase 318

Phase 318 identified state 0x00 as a "switch-to-screen" mode selector with 41 callers and key codes 0x01-0x05. This phase confirms:

1. The 41-caller count is exact
2. Key codes 0x01-0x05 map to Home/Y=/Window/Zoom/Trace destinations
3. State 0x00 is NOT just a pseudo-state — it is the actual boot state (D177B9 = 0 at power-on)
4. The "switch" mechanism works by transitioning TO state 0x00 (which always allows), then the caller initiates the actual screen change afterward
5. process_key does NOT return 1 (no handler) — it returns 0 (accepted) via the shared default sub-dispatch. get_last_key runs but just reads the existing D177B8

## Artifacts

- `probe-phase319-state-0x00-switch.mjs` — 41/41 structural checks
- `phase319-state-0x00-switch-report.md` — this file
