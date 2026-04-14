# Phase 71: Tracing OS Init (0x08c331) Dispatch

## Executive Summary

Phase 67 claimed 0x08c331 has only 1 lifted caller. **That was wrong** — a broader scan finds **4 internal callers** and **33 external callers** targeting the entire 0x08c300-0x08c500 region. OS init is NOT a single-entry function — it's a state machine with multiple re-entry points, most called from ISR / event-loop code.

## Section 1: Block Containing 0x08c449

```asm
0x08c445: res 0, (iy+93)
0x08c449: jp 0x08c331
```

Two-instruction block. `res 0, (iy+93)` clears a flag bit in the system scratch area (iy=0xD00080, offset 93 = 0xD000DD) before jumping back to 0x08c331. This is a **state-transition retry**: clear bit, re-enter init.

## Section 2: Internal Callers of 0x08c331

All 4 internal callers are within the 0x08c300-0x08c500 region (same function):

| Caller PC | Kind | Source Block | Disassembly |
|-----------|------|--------------|-------------|
| 0x08c449 | jp | 0x08c445 | `jp 0x08c331` (after `res 0, (iy+93)`) |
| 0x08c3b9 | jp | 0x08c3b5 | `jp 0x08c331` (retry path 1) |
| 0x08c3df | jp nz | 0x08c3db | `jp nz, 0x08c331` (conditional retry) |

These are all **internal state-machine retries** — not external callers.

## Section 3: External Callers into 0x08c300-0x08c500 Region

**33 external callers** total, spread across OS code. Top entries by target:

### 0x08c308 — Flag-check helper (13+ callers)

Body:
```asm
0x08c308: push hl
0x08c309: ld hl, 0xd000c6
0x08c30d: bit 2, (hl)
0x08c30f: pop hl
0x08c310: ret
```

Tiny utility: tests bit 2 of 0xD000C6 (system flag) and returns. Used by 13+ OS functions across the ROM. NOT an OS init entry — just a shared helper.

### 0x08c33d — Partial-init entry (10+ callers)

Body:
```asm
0x08c33d: call 0x0a349a
```

(Block start.) Called externally from diverse addresses:
- `0x0257c7: call 0x08c33d`
- `0x06c50a: jp 0x08c33d`
- `0x040b23: jp 0x08c33d`
- `0x0620ba: jp 0x08c33d` + `0x0620c8: jp 0x08c33d`
- `0x08c597: jp 0x08c33d` (internal)
- `0x08c678: jp 0x08c33d` (internal)
- `0x08c762: jp 0x08c33d` (internal)
- `0x0b6a98: jp 0x08c33d`
- `0x09ce36: call 0x08c33d`

This is a **post-first-stage init entry** that callers jump to after some pre-condition is met. Likely "skip the early init steps and run the rest."

### 0x08c366 — Mid-function state-resume entry

Body (first block):
```asm
0x08c366: res 7, (iy+22)
0x08c36a: res 1, (iy+29)
0x08c36e: ld (0xd0058c), a
0x08c372: bit 0, (iy+2)
0x08c376: jr z, 0x08c38a
```

Clears 2 IY flags + writes A to 0xD0058C, then branches on another IY flag.

External callers:
- **0x020158: jp 0x08c366** (**JUMP-TABLE SLOT 21** — 0x020104 + 21*4 = 0x020158)
- 0x040ccd: jp 0x08c366 (thunk)

**Slot 21 dispatch to 0x08c366 is a major finding**. This means some OS function that calls jump-table slot 21 triggers a state-resume into the OS init state machine.

### 0x08c301 — Another helper

Called from 0x08c28b (`jr nz, 0x08c301`) which is also internal to the same function family.

## Section 4: Second-Hop Call Graph

### Who calls 0x040ccd (the thunk that jp's to 0x08c366)?

Single-instruction block. Calling 0x040ccd triggers an unconditional jump to 0x08c366.

Need to grep for callers of 0x040ccd directly (not done in this CC manual trace, deferred to Phase 72).

### Jump-table slot 21 (0x020158 → 0x08c366)

Slot 21 at 0x020104 + 0x54 = 0x020158. In TI-OS this is likely one of the `_bcall` entries — specifically, a low-level OS-init state resume.

No direct callers found by scanning instruction targets (jump-table slots are typically reached via the bcall dispatcher 0x000008 which reads a slot index from the instruction stream, not as a direct CALL/JP target). The real caller chain is: `rst 0x08 (bcall) ; .db slot_index` — this encodes the slot as an inline data byte.

## Section 5: Hypothesis

**0x08c331 is a multi-entry OS init state machine with these entry points:**

1. **0x08c331** (full init) — called by internal retries only (0x08c449, 0x08c3b9, 0x08c3df). No direct external callers outside the region.
2. **0x08c33d** (post-stage-1 init) — called by 10+ external sites, including other OS functions during error handling and state transitions.
3. **0x08c366** (state resume) — reached via jump-table slot 21 and thunk 0x040ccd. This is the "continue init from saved state" entry.

**The real boot path to home screen is NOT a single linear call chain.** It's:

1. Boot (0x000000) → hardware setup → HALT (0x0019b5)
2. ISR fires → event loop at 0x0019be (confirmed Phase 56-60)
3. Event loop reaches a state where it needs to init → bcall slot 21 → 0x08c366 state resume
4. Init runs, returns to event loop
5. Event loop now dispatches home screen renderer

**We've been testing OS init in isolation (manual call to 0x08c331)**, but the real execution path is ISR-driven and goes through 0x08c366. That's why the boot path never reaches 0x08c331 directly.

## Section 6: Recommended Phase 72+ Probe Targets

1. **0x08c366** (JT slot 21 resume entry) — probe as a direct entry. Set IY=0xD00080, D0058C=0, D00082+22 bit 7 cleared. What does it render?
2. **0x08c33d** — probe as a direct entry to test "partial init". Compare post-state against 0x08c331 baseline.
3. **0x040ccd** thunk — trivial, not worth probing (just a jump).
4. **Who uses bcall slot 21?** Scan the ROM for `rst 0x08 ; db 0x15` patterns (0x15 = 21). Those are the high-level functions that trigger OS init state-resume, and are likely the actual callers we want to invoke.
5. **0x020158 as a JP target** — ignore. Slot 21 is bcall-reached, not direct-JP reached.

## Next Steps

Phase 71 complete as a static analysis. Phase 72 should run probes on 0x08c366 and 0x08c33d to see if they produce home-screen rendering when invoked directly. If either renders meaningfully, that's the entry point we need.
