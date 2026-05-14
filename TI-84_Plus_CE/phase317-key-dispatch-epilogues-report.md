# Phase 317: Key-Dispatch Functions After _seqcase Epilogues

## Summary

Mapped the two parallel OS key-dispatch systems that follow the `_seqcase` epilogues at 0x049CC2 and 0x008834. Both 0x049CCA and 0x00883C are structurally identical recursive key dispatchers that share the D177B9 state byte but live in different ROM regions with different runtime helpers.

## _seqcase Table Format (Confirmed)

The ZDS II `_seqcase` inline table format is:
```
count(1)  pad(2)  [addr_lo addr_mid addr_hi  key](4) * (count-1)  default_addr(3)
```
- `count` **includes** the default entry, so there are `count - 1` case entries.
- Each case entry is 4 bytes: 3-byte little-endian target address, then 1-byte match key.
- Default target is 3 bytes at the end (no key).

## Function 0x049CCA — Flash ROM Key Dispatcher

**Signature**: `dispatch_key_flash(key_code, new_state)` — recursive
**Frame**: `__frameset` via 0x00012C, 1 local byte

### Algorithm
1. DI (critical section)
2. Read D177B9 (current context state)
3. If `D177B9 != new_state`:
   - Call `exit_state` (0x0499C0) with new_state
   - If exit_state returned nonzero: recursively call self with old state, then commit `new_state -> D177B9`
   - If exit_state returned 0: set retval = 1 (blocked)
4. If retval == 0: call `process_key` (0x049A23) with key_code
5. If still unhandled: `_seqcase` on state → store key_code into D177B8
6. Restore interrupts, return retval

### _seqcase Table (13 cases + default)

| State | Target | Meaning |
|-------|--------|---------|
| 0x01 | 0x049D77 | Store key to D177B8 |
| 0x02 | 0x049D80 | Store key to D177B8 |
| 0x03 | 0x049D89 | Store key to D177B8 |
| 0x04 | 0x049D92 | Store key to D177B8 |
| 0x10 | 0x049D9B | Store key to D177B8 |
| 0x11 | 0x049DA4 | Store key to D177B8 |
| 0x12 | 0x049DAD | Store key to D177B8 |
| 0x13 | 0x049DB6 | Store key to D177B8 |
| 0x14 | 0x049DBF | Store key to D177B8 |
| 0x15 | 0x049DC8 | Store key to D177B8 |
| 0x16 | 0x049DD1 | Store key to D177B8 |
| 0x17 | 0x049DDA | Store key to D177B8 |
| 0x18 | 0x049DE3 | Store key to D177B8 |
| default | 0x049DEC | Set retval = 2 |

All 13 case bodies are identical: `LD A,(IX+6) ; LD (D177B8),A ; JR epilogue`. The default sets retval = 2 (unknown state).

### Callers
- **166 CALL sites** across ROM regions 0x02–0x07
- **1 JP site** at 0x0222A0
- Self-recursive call at 0x049CFE

## Function 0x00883C — Low ROM Key Dispatcher

**Signature**: `dispatch_key_lowrom(key_code, new_state)` — recursive
**Frame**: `__frameset` via 0x002197, 1 local byte

Structurally identical to 0x049CCA but with different helper addresses:
- exit_state: 0x0085E3 (vs 0x0499C0)
- process_key: 0x00863A (vs 0x049A23)
- _seqcase: 0x00211B (vs 0x000124)

### _seqcase Table (10 cases + default)

States 0x01–0x04, 0x10–0x15 + default. Missing states 0x16, 0x17, 0x18 compared to flash copy.

### Callers
- **78 CALL sites** in ROM 0x00xxxx (58) and 0x01xxxx (20)
- **0 JP sites**
- Self-recursive call at 0x008870

## Sub-Dispatchers (exit_state)

### 0x0499C0 (flash, 13 cases)
Reads D177B9, switches on it. Two target groups:
- **0x049A15** (states 0x01–0x04, 0x17–0x18, default): JR to epilogue → returns 1 (allow transition)
- **0x049A1B** (states 0x10–0x16): `LD (IX-1),0x00` → returns 0 (block transition)

Interpretation: states 0x10–0x16 are "sticky" sub-modes that require explicit cleanup before the OS can transition away.

### 0x0085E3 (low ROM, 10 cases)
Same two-group pattern:
- **0x00862C** (states 0x01–0x04): pass-through
- **0x008632** (states 0x10–0x15, default): block

## Third Dispatch Pair (D177B8 Readers)

### 0x049E07 (flash, 13 cases)
Reads D177B9, then all case bodies do: `LD A,(D177B8) ; LD (IX-1),A` — returns the last key code stored by the main dispatcher. This is the "get last key for current context" function.

### 0x008958 (low ROM, 9 cases)
Parallel low-ROM version with 9 states (0x01–0x04, 0x10–0x14).

## D177B9 State Byte

**14 total ROM references:**
- 12 reads (`LD A,(D177B9)`) across both dispatchers
- 2 writes (`LD (D177B9),A`) — one in each main dispatcher (0x049D07, 0x008879)

The state byte is ONLY written by the two main dispatch functions, during the state-transition path. All other code only reads it.

## D177B8 Key Code Byte

Written by every _seqcase case body in both main dispatchers. Read by the third dispatch pair (0x049E07/0x008958).

## State ID Map

| ID | Present in Flash | Present in Low ROM | Likely Context |
|----|------------------|--------------------|----------------|
| 0x01 | Yes | Yes | Base mode 1 (home screen?) |
| 0x02 | Yes | Yes | Base mode 2 (graph?) |
| 0x03 | Yes | Yes | Base mode 3 (table?) |
| 0x04 | Yes | Yes | Base mode 4 (program?) |
| 0x10 | Yes | Yes | Sub-mode 0 |
| 0x11 | Yes | Yes | Sub-mode 1 |
| 0x12 | Yes | Yes | Sub-mode 2 |
| 0x13 | Yes | Yes | Sub-mode 3 |
| 0x14 | Yes | Yes | Sub-mode 4 |
| 0x15 | Yes | Yes | Sub-mode 5 |
| 0x16 | Yes | No | Sub-mode 6 (flash-only) |
| 0x17 | Yes | No | Sub-mode 7 (flash-only) |
| 0x18 | Yes | No | Sub-mode 8 (flash-only) |

## Architecture Diagram

```
Caller (166+ sites)
  │
  ▼
dispatch_key(key_code, new_state)     [0x049CCA / 0x00883C]
  │
  ├─ if state changed:
  │    ├─ exit_state(new_state)        [0x0499C0 / 0x0085E3]
  │    │    └─ _seqcase on D177B9 → allow/block transition
  │    ├─ if allowed: RECURSIVE dispatch(old_state, 0)
  │    └─ commit D177B9 = new_state
  │
  ├─ process_key(key_code)             [0x049A23 / 0x00863A]
  │
  └─ _seqcase on D177B9
       └─ all cases: D177B8 = key_code

get_last_key()                         [0x049E07 / 0x008958]
  └─ _seqcase on D177B9
       └─ all cases: return D177B8
```

## Golden Regression

probe-phase99d-home-verify.mjs: 26/26 PASS (no existing behavior affected)

## Artifacts

- `probe-phase317-key-dispatch-after-epilogues.mjs` — 34/34 structural checks
- `phase317-key-dispatch-epilogues-report.md` — this file
