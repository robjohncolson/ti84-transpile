# Phase 581: 0x07BF19 -- QUIT Key Handler

## Overview

| Property       | Value |
|----------------|-------|
| Address        | 0x07BF19 |
| Size           | 37 bytes (0x07BF19 - 0x07BF3D) |
| Instructions   | 13 |
| CALL targets   | 3 (screen-mode bit testers) |
| RAM refs       | 2 (D0058C, D0058E) |
| IY ops         | 0 (indirect via CALL to bit testers) |
| Callers        | 2 (1 CALL Z from event loop, 1 JP from jump table) |
| Exit path      | RET to event loop |

## Context

The OS event loop dispatch cascade at 0x08C3C3 checks QUIT first:

```
0x08C3C3: FE B4        CP 0xB4          ; key code == QUIT?
0x08C3C5: CC 19 BF 07  CALL Z, 0x07BF19 ; yes -> handle QUIT
```

After CALL Z returns, the event loop continues to the next key check (0x3F, etc.).

## Full Annotated Disassembly

```
; === 0x07BF19: QUIT KEY HANDLER (37 bytes, 13 instructions) ===
;
; Checks current screen mode via IY+2 bit testers and maps it to a
; replacement key code stored in D0058C. Does NOT reinitialize the OS
; or call the init trampoline. Simply injects a mode-appropriate key
; code so the event loop processes it on the next iteration.

0x07BF19: 3E CC              LD A, 0xCC             ; A = 0xCC (candidate key code)
0x07BF1B: CD 2D C7 06        CALL 0x06C72D          ; BIT 5, (IY+2); RET -- test screen mode bit 5
0x07BF1F: 20 18              JR NZ, 0x07BF39        ; bit 5 set -> store A=0xCC to D0058C

0x07BF21: 3E AD              LD A, 0xAD             ; A = 0xAD (candidate key code)
0x07BF23: CD 37 C7 06        CALL 0x06C737          ; BIT 6, (IY+2); RET -- test screen mode bit 6
0x07BF27: 20 10              JR NZ, 0x07BF39        ; bit 6 set -> store A=0xAD to D0058C

0x07BF29: 3E B1              LD A, 0xB1             ; A = 0xB1 (candidate key code)
0x07BF2B: CD 3C C7 06        CALL 0x06C73C          ; BIT 4, (IY+2); RET -- test screen mode bit 4
0x07BF2F: 20 08              JR NZ, 0x07BF39        ; bit 4 set -> store A=0xB1 to D0058C

; --- No screen mode bit set (default/home screen) ---
0x07BF31: 3E E8              LD A, 0xE8             ; A = 0xE8
0x07BF33: 32 8E 05 D0        LD (0xD0058E), A       ; D0058E = 0xE8 (secondary key buffer)
0x07BF37: 3E FE              LD A, 0xFE             ; A = 0xFE (default quit key code)

; --- Common exit: store key code ---
0x07BF39: 32 8C 05 D0        LD (0xD0058C), A       ; D0058C = mode-dependent key code
0x07BF3D: C9                 RET                    ; return to event loop
```

## Screen Mode to Key Code Mapping

| IY+2 Bit | Bit Tester | Screen Mode     | Key Code Written to D0058C |
|-----------|------------|-----------------|---------------------------|
| Bit 5     | 0x06C72D   | (mode 5)        | 0xCC                      |
| Bit 6     | 0x06C737   | (mode 6)        | 0xAD                      |
| Bit 4     | 0x06C73C   | (mode 4)        | 0xB1                      |
| None      | --         | Default/home    | 0xFE (+ D0058E = 0xE8)    |

The check order matters: bit 5 is tested first, then bit 6, then bit 4. First match wins. The "none set" path is the default/home screen case and additionally writes 0xE8 to D0058E.

## RAM References

| Address  | Direction | Purpose |
|----------|-----------|---------|
| D0058C   | WRITE     | Pending key code buffer -- event loop reads this on next iteration |
| D0058E   | WRITE     | Secondary key buffer -- written only in default mode (no screen bits set) |

From session 580 commit messages: D0058E has 107 refs across the ROM, D0058C is the context-save key variable used by the event loop cleanup at 0x08C33D.

## CALL Targets

| Address  | Function |
|----------|----------|
| 0x06C72D | BIT 5, (IY+2); RET -- screen-mode bit 5 tester (27 callers) |
| 0x06C737 | BIT 6, (IY+2); RET -- screen-mode bit 6 tester (63 callers) |
| 0x06C73C | BIT 4, (IY+2); RET -- screen-mode bit 4 tester (65 callers) |

These are the 5-byte micro-functions decoded in session 578. IY+2 holds the current screen mode flags. Each bit corresponds to a different OS screen (graph, table, program editor, etc.).

## Callers

| Address  | Type    | Context |
|----------|---------|---------|
| 0x08C3C5 | CALL Z  | Event loop dispatch cascade -- first key checked after key input |
| 0x021F90 | JP      | Jump table entry in low ROM (OS init/vector area) |

Only 2 callers total. The primary caller is the event loop.

## What QUIT Does

The QUIT key handler is a **key remapper**, not a mode changer. It:

1. Checks which screen mode is active (IY+2 bits 5, 6, 4).
2. Maps the mode to a replacement key code (0xCC, 0xAD, 0xB1, or 0xFE).
3. Writes that key code to D0058C.
4. Returns to the event loop.

The event loop then picks up the replacement key code from D0058C on its next iteration and dispatches it through the rest of the key cascade. This means QUIT does not directly change modes -- it translates the physical QUIT key (0xB4) into a mode-specific virtual key that the later dispatch stages handle.

**What QUIT does NOT do:**
- Does NOT call the init trampoline (0x063033)
- Does NOT jump directly to event loop top (0x08C331) or cleanup (0x08C33D)
- Does NOT modify D007E0 (current OS mode variable)
- Does NOT modify any IY flags
- Does NOT have any screen rendering calls

## Neighboring Functions (0x07BF3E+)

The bytes immediately after the RET at 0x07BF3D are separate functions, not part of the QUIT handler:

- **0x07BF3E**: BIT 5, (IY+53); ... -- an app-check wrapper that tests IY+0x35 (decimal 53) bits and calls 0x023A1C / 0x02398E before returning
- **0x07BF5C**: EX DE, HL; CALL 0x000380; ... -- a buffer/context setup routine that zeros D005A1-D005C1 via LDIR+LDI chain
- **0x07BF8B+**: Multiple small helper functions dealing with D0066F, D00672, D00675 (list/table position variables)

These are unrelated to the QUIT handler and serve other parts of the OS menu/display subsystem.
