# Phase 25G-e Report: Dispatch to 0x00B608

**Date:** 2026-04-21  
**Probe:** `probe-phase25g-e-dispatch.mjs`

## Part 1: rst 0x28 Handler

The `rst 0x28` handler at address 0x000028 is minimal:

```asm
0x000028  f3         di          ; disable interrupts
0x000029  ed 7e      rsmix       ; set madl = 0 (switch to Z80 mode)
; falls through to 0x00002b
```

Block at 0x00002b then does `jp 0x02011c`, which chains:
- 0x02011c → jp 0x04ab69
- 0x04ab69 → jp 0x0003ac
- 0x0003ac → jp 0x0019b5 (near the OS event loop at 0x19BE)
- 0x0019b5 → `di` then `halt`

**Conclusion:** `rst 0x28` is the FP-operation return/exit — it disables interrupts, switches to Z80 mode, and re-enters the OS dispatcher. It is NOT a FP dispatch entry point; it is a FP *exit* point. The `rst 0x28` at 0x00ADEF terminates the FP operation and returns control to the OS.

## Part 2: References to the 0xAD–0xB6 Range

### External callers (outside the FP region)

| Block | Target | Context |
|-------|--------|---------|
| 0x00156d:adl | call 0x00b69e | OS init calls FP normalize |
| 0x00156e:adl | call 0x00b69e | Same routine, different entry |
| 0x001571:adl | call 0x00b69e | Same routine |
| 0x001574:adl | call 0x00b69e | Direct call instruction |
| 0x00161d:adl | call 0x00b69e | Another OS init caller |

These are the only external callers — all calling 0x00B69E and 0x00B688 in the upper part of the FP region (normalization/cleanup routines).

### Internal structure

- **2019 total references** to addresses in 0x00AD00–0x00B6FF, but essentially all are internal cross-references within the FP region itself.
- **106 blocks** contain return/jump targets in the range.
- **0 indirect register jumps** (`return cpu._hl`, etc.) — all dispatch is direct (jp/jr/call with immediate addresses).
- Key structural hubs: 0x00B2C4, 0x00B554, 0x00AE24, 0x00B34F appear repeatedly as convergence points.

### The 0x00ADB5 branch point

Block 0x00adb5 is critical:
```asm
0x00adb5  c2 77 b6 00   jp nz, 0x00b677   ; NZ → jump to 0xB677
                                              ; Z  → fall through to 0x00ADB9
```

This is the fork that determines whether execution enters the deep FP chain (leading to 0x00B608) or takes the short exit path.

## Part 3: Dynamic Execution

### From 0x00ADB9 (FP workspace path)

Execution trace (41 steps):
1. 0x00ADB9 loads BC from FP stack base at 0xD176AB
2. Calls 0x015349 (FP subroutine — reads FP workspace pointers)
3. Calls 0x002197 (exchange IX on stack), then loops through 0x002553/0x002561 (shift/normalize)
4. Eventually returns to 0x00ADED which does `pop bc`
5. Hits `rst 0x28` (0x000028) → OS dispatcher → halt

**0x00B608 was NOT reached.** The execution took a short path through the FP workspace subroutines and exited via rst 0x28 before reaching the deeper B5xx–B6xx chain.

### From 0x00ADEF (rst 0x28 site)

Only 7 steps — immediately exits via rst 0x28 → OS halt. Confirms this is the FP exit path.

### Why 0x00B608 was not reached

The call chain documented in the task description requires specific conditions:
1. At 0x00AE2B: `jp z, 0x00B55F` — requires Z flag set
2. At 0x00B566: `jp nz, 0x00B680` — requires Z flag clear to continue to 0x00B56A
3. At 0x00B5A8: condition check to reach 0x00B5EF

Our dynamic test started at 0x00ADB9 but the FP workspace was empty/zero, causing the subroutines at 0x015349 to return quickly without setting the conditions needed to traverse the full chain. The path from 0x00ADB9 to 0x00B608 requires:
- Non-trivial FP operands loaded in the workspace
- Specific flag states from intermediate comparisons
- The correct FP operation opcode to select the right branch

## Conclusions

1. **rst 0x28 is an EXIT, not an entry.** It terminates FP operations and returns to the OS event loop via the chain 0x28 → 0x2B → 0x02011C → 0x04AB69 → 0x03AC → 0x19B5.

2. **The 0xAD–0xB6 region is a self-contained FP engine.** All 2019 internal references are within the region. Only 5 external callers exist (at 0x00156x and 0x00161D), all targeting 0x00B69E/0x00B688 (FP normalize/cleanup).

3. **0x00B608 requires a specific FP operation path** — the chain from 0x00AE16 through 0x00B55F requires multiple conditional branches to be taken in sequence, which only happens with particular FP operand types and values. It is NOT reachable from a cold start with empty FP workspace.

4. **Dispatch mechanism:** The FP region is entered via seeded coverage (not dynamically called from the event loop). The OS reaches FP normalize at 0x00B69E from init code at 0x001574/0x001624. The main FP computation paths (0x00AExx through 0x00B6xx) are internal to the FP engine and dispatch through a large switch-like structure centered on 0x00B2C4 (operation hub) and 0x00B554 (loop-back to 0x00AE24).

5. **No indirect jumps** in the region — all dispatch is through direct jp/jr/call with immediate addresses. The FP "opcode" likely selects a path via a series of compare-and-branch instructions rather than a jump table.
