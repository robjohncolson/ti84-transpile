# Phase 420 — Frame Pacing RAM Variable Reference Map

**Probe**: `probe-phase420-frame-pacing-refs.mjs`
**Date**: 2026-05-23
**Scope**: Full 4MB ROM scan for 5 frame-pacing state variables from the 0x010090 state machine (session 419)

## Reference Counts

| Variable | Address | Total | READ | WRITE | Notes |
|----------|---------|-------|------|-------|-------|
| Stage counter | D177DB | 17 | 11 | 6 | Most-referenced after sub-step |
| Sub-step | D177D8 | 22 | 12 | 10 | Most-referenced overall |
| Iteration counter | D177DE | 7 | 5 | 2 | Wraps at 99 (0x63) |
| Circ buf ptr 1 | D177CC | 18 | 14 | 4 | Heavy read use; LEA-based pointer math |
| Circ buf ptr 2 | D177CF | 6 | 6 | 0 | **Read-only in ROM** — never written by any scanned instruction |

**Total references across all 5 variables: 70**

## Function Regions

All references cluster into exactly **5 distinct ROM functions** plus a small set of accessors:

### 1. 0x010090–0x01021F — Frame-pacing state machine (primary owner)

This is the function decoded in session 419. Contains the vast majority of references:
- D177DB: 14 of 17 refs (82%)
- D177D8: 19 of 22 refs (86%)
- D177DE: 5 of 7 refs (71%)
- D177CC: 3 of 18 refs (17%)
- D177CF: 4 of 6 refs (67%)

The state machine reads stage counter, checks sub-step against thresholds (0x1F, 0x0C, 0x1C), increments both, manages the iteration counter (wraps at 99 → resets to 0 with circular buffer advance of 100 bytes via LEA), and reads D177CF as a secondary pointer.

Key pattern: every stage transition writes `LD (D177DB),BC` followed immediately by `LD BC,0x000001` then `LD (D177D8),BC` — resetting sub-step to 1 on each stage advance.

### 2. 0x0103D7–~0x0103F6 — State snapshot / serializer

Reads all 5 variables in sequence:
```
0x0103DB  LD A,(D177D8)     ; sub-step → store via IX
0x0103E3  LD A,(D177DB)     ; stage counter → store via IX
0x0103EB  LD HL,(D177DE)    ; iteration counter
0x0103EF  LD BC,(D177CC)    ; circ buf ptr 1
```
Opens with `CALL 0x00218A` (stack frame helper). This function reads all state into an IX-indexed structure — likely a diagnostic dump or state-save for the display callback dispatcher at 0x010220 (session 418).

### 3. 0x0107FE–~0x010920 — Circular buffer manager / DMA coordinator

Heavy user of D177CC (11 of 18 refs) and also reads D177DB, D177D8, D177DE, D177CF.
- Contains LEA-based circular pointer advancement (both +100 and -100 byte offsets via `ED 03 9C` / `ED 03 64`)
- Calls 0x0022F0 (memory utility), 0x00276B (comparison helper), 0x007B5C
- Manages the circular buffer lifecycle: compare pointer against bounds, advance, wrap
- This is the **only function that writes D177CC** outside the state machine (4 writes total: 2 here + 1 at 0x010991 + 1 at 0x0100F5)

### 4. 0x01095C–~0x01099A — Circular buffer initializer / reset

Contains one write: `LD (D177CC),BC` at 0x010991 with BC = 0x0007D0 (2000 decimal). This is either an initialization or a reset to a default buffer base address. Also reads D177CC once.

### 5. 0x010A37 — Tiny accessor (2 instructions)

```
0x010A37  LD HL,(D177CC)
0x010A3B  RET
```
Pure getter — returns the current circular buffer pointer in HL. Called by other subsystems that need the buffer position.

### 6. 0x05F87B–0x05F990 region — Remote/external readers

Three small functions in the 0x05Fxxx region each read one variable:
- 0x05F883: `LD BC,(D177CF)` — reads circ buf ptr 2
- 0x05F936: `LD BC,(D177DB)` — reads stage counter
- 0x05F98C: `LD BC,(D177D8)` — reads sub-step

All three share the same prologue pattern: `LD HL,0xFFFFFD` → `CALL 0x00012C` → read variable → store via IX. These are likely **OS export stubs** or API accessors that expose the frame-pacing state to external callers (apps, hooks).

There is also a matching getter at 0x05FDBA: `LD HL,(D177CC)` → `RET`, identical in shape to the 0x010A37 accessor.

## Boot-Time Initialization

**No references found in the boot region (0x000000–0x002000).** None of the 5 variables are initialized during early boot.

The only candidate initializer is at **0x01095C** which writes `D177CC = 0x0007D0`. This likely runs as part of the display subsystem init (not early boot). The other variables (D177DB, D177D8, D177DE) are presumably zero-initialized by the OS's RAM-clear pass during boot, which would set stage=0, sub-step=0, iteration=0 — the correct initial state for the state machine.

**D177CF is never written anywhere in the ROM.** This means either:
1. It is initialized by the RAM-clear (zero), or
2. It is written via indirect memory operations (pointer-based stores) that don't embed the address literally, or
3. It is written by a peripheral/DMA operation

Given that D177CF is read as a buffer pointer (and compared against 0x190 = 400 at 0x010195, and 0x64 = 100 at 0x0101B4), option 2 is most likely — some function computes the address D177CF and writes through a register-indirect store.

## Co-Location Patterns

Variables are heavily co-located (referenced within 50 bytes of each other):

| Pair | Co-located refs | Pattern |
|------|----------------|---------|
| D177DB ↔ D177D8 | 63 | **Always paired** — stage advance immediately resets sub-step |
| D177D8 ↔ D177CF | 20 | Sub-step reads near buffer ptr 2 reads |
| D177DE ↔ D177CC | 16 | Iteration counter near buffer ptr 1 (wrap logic) |
| D177DB ↔ D177DE | 15 | Stage counter near iteration counter |
| D177DB ↔ D177CC | 12 | Stage counter near buffer ptr |
| D177DB ↔ D177CF | 11 | Stage counter near buffer ptr 2 |

The strongest coupling is **D177DB ↔ D177D8** (stage + sub-step) — they form a two-level state counter where every stage increment resets the sub-step to 1.

## Cross-Reference with 0x010090 State Machine

The 0x010090 function is confirmed as the **primary owner** of all 5 variables. The only external writers are:
- D177CC: written by 0x0107FE region (circular buffer manager) and 0x01095C (initializer)
- D177DB, D177D8, D177DE: written **only** by 0x010090

This means:
- The state machine at 0x010090 is the **sole FSM driver** — no other code advances the stage/sub-step/iteration
- The circular buffer manager at 0x0107FE maintains D177CC independently (it has its own advance/wrap logic)
- The 0x05Fxxx accessors are read-only observers

## Architectural Summary

```
D177DB (stage)  ──┐
D177D8 (sub-step) ┤  Written exclusively by 0x010090 (FSM)
D177DE (iteration)┘  Read by 0x0103D7 (snapshot), 0x0107FE (DMA), 0x05Fxxx (exports)

D177CC (buf ptr 1)    Written by 0x010090 + 0x0107FE + 0x01095C
                      Read by everyone

D177CF (buf ptr 2)    Never written (literal addr) — computed/indirect writes
                      Read by 0x010090 + 0x0107FE + 0x05F87B
```

## Seeds for Future Work

- **0x0103D7**: Fully decode the state snapshot function — likely feeds the display callback dispatcher (0x010220, session 418)
- **0x0107FE–0x010920**: Fully decode the circular buffer manager — the LEA patterns (±100, ±400 byte offsets) suggest a multi-slot ring buffer for LCD scanline data
- **D177CF write source**: Search for indirect stores to this address (likely via IY or HL-indirect with pre-computed pointer)
- **0x01095C**: Decode the buffer initializer — the 0x0007D0 (2000) constant may be the buffer base in D1-segment RAM
- **0x05F87B/0x05F936/0x05F98C**: Confirm these are OS SDK export stubs (check against the JP-stub table at 0x021060+)
