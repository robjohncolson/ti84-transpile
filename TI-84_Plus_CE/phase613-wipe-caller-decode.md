# Phase 613: Wipe Caller Decode — 0x000862 vs 0x0013E8

**Date**: 2026-06-10  
**Purpose**: Disassemble the two caller regions identified in session 612 as the two distinct return addresses that follow CALL 0x001853 (which leads into the VRAM wipe at 0x0018F8). Determine whether the second wipe (returning to 0x000862) can be conditionally skipped.

---

## Clarification: The Actual Call Target

Both return addresses follow `CALL 0x001853`, **not** a direct call to `0x0018F8`. The wipe at `0x0018F8` is called from within the `0x001853` subroutine's call tree (confirmed in phase450: `0x001853 → 0x0158DE` at return `0x001872`, which eventually reaches `0x0018F8`). The call bytes at both sites are `CD 53 18 00`.

Session 612 summary:
- **Hit #1 (first wipe, block 84,825)**: returns to `0x0013E8` — VRAM=1466px, A=0x52
- **Hit #2 (second wipe, block 274,953)**: returns to `0x000862` — VRAM=3337px, A=0x76

The second wipe (returning to `0x000862`) is the target for VRAM preservation interception.

---

## CALL Byte Search Results

Searched `0x000700–0x000900` and `0x001200–0x001500` for bytes `CD 53 18 00` (CALL 0x001853):

No matches outside the two known sites. The two sites are isolated callers in their respective regions.

Verified byte content at the expected sites:
- `0x00085E`: `cd 53 18 00` → `CALL 0x001853`, return addr = `0x000862` ✓
- `0x0013E4`: `cd 53 18 00` → `CALL 0x001853`, return addr = `0x0013E8` ✓

---

## Disassembly: Caller 1 — Around 0x000862 (Second Wipe)

This is the **second wipe** (hit at block 274,953). This call is inside what appears to be a hardware exit/power-down or display-off sequence that is part of a larger OS init or key-handler epilogue.

### Context: Full function body visible from 0x000836

The sequence that leads to the CALL begins at `0x000836` (following a `PUSH AF` at that address which saves the caller's AF). The function body at this region is a re-entrant hardware mode-switching block used twice in the same wider function (the same pattern appears earlier at `0x000741–0x00079A`):

```
0x000836: f5           PUSH AF            ; save caller's A register
0x000837: af           XOR A, A           ; A = 0
0x000838: f3           DI                 ; disable interrupts
0x000839: 18 00        JR 0x00083b        ; jump forward 0 (NOP equivalent, alignment)
0x00083b: f3           DI
0x00083c: ed 7e        STMIX              ; enter mixed ADL/Z80 mode
0x00083e: ed 56        IM true            ; set interrupt mode
0x000840: ed 39 28     OUT0 (0x28), A     ; write 0 to I/O port 0x28 (ADL mode control)
0x000843: ed 38 28     IN0 A, (0x28)      ; read back
0x000846: cb 57        BIT 2, A           ; check bit 2 (mode confirmation bit — not used here as branch)
0x000848: ed 38 06     IN0 A, (0x06)      ; read I/O port 0x06
0x00084b: cb 97        RES 2, A           ; clear bit 2
0x00084d: ed 39 06     OUT0 (0x06), A     ; write back
0x000850: 00           NOP
0x000851: 00           NOP
0x000852: 3e 88        LD A, 0x88         ; load port value
0x000854: ed 39 24     OUT0 (0x24), A     ; write to port 0x24 (hardware config)
0x000857: fe 88        CP A, 0x88         ; verify write succeeded
0x000859: c2 66 00     JP NZ, 0x000066    ; fatal error trap if mismatch
0x00085c: 00           NOP
0x00085d: f1           POP AF             ; restore caller's A register
0x00085e: cd 53 18     CALL 0x001853      ; <<< CALL to 0x001853 (wipe path)
0x000861: 00           NOP               ; (NOP padding byte after 3-byte CALL)
                                         ; <<<< RETURN ADDRESS 0x000862
0x000862: af           XOR A, A           ; A = 0 (first instruction after return)
0x000863: 32 ba 77     LD (0x0077ba), A   ; zero 0x0077BA
0x000866: d1           POP DE
0x000867: 32 bc 77     LD (0x0077bc), A   ; zero 0x0077BC
0x00086a: d1           POP DE
0x00086b: 21 00 00     LD HL, 0x000000
0x00086e: 00           NOP
0x00086f: 22 1b 30     LD (0x00301b), HL  ; zero 0x00301B
0x000872: d0           RET NC             ; conditional return
0x000873: c3 b5 19     JP 0x0019b5        ; continuation path
```

**Key observations for Caller 1:**
- The `CALL 0x001853` at `0x00085E` is **unconditional**.
- The immediately preceding instruction is `POP AF` (`0x00085D`) — restoring AF from the `PUSH AF` at `0x000836`. So on entry to the call, A holds whatever value was saved by PUSH AF.
- No conditional branch guards the CALL — the only conditional is `JP NZ, 0x000066` at `0x000859`, which is a hardware assertion (not a skip path).
- After return, the code zeros `0x0077BA`, `0x0077BC`, and `0x00301B` — these are RAM variables being reset post-wipe.
- The wider function (starting before `0x000836`) is reachable from `JP Z, 0x000877` at `0x000733` (the path taken when `OR A, H` at `0x000732` yields zero). This means the `0x000836` block and the CALL at `0x00085E` are part of the non-zero-HL branch.

### Function entry point

Scanning backward from `0x000836`, the pattern at `0x000741–0x000795` is structurally identical to `0x000836–0x00085D` (same hardware mode-switch + port I/O sequence). This strongly suggests the function containing `0x00085E` starts near `0x000721` or earlier. The wider context at `0x000720–0x000877` appears to be a hardware init or display-power sequence called from higher in the boot chain.

---

## Disassembly: Caller 2 — Around 0x0013E8 (First Wipe)

This is the **first wipe** (hit at block 84,825). It is inside a hardware init function that configures LCD ports and related hardware.

```
0x0013c3: cd 88 19     CALL 0x001988      ; some hardware init step
0x0013c6: 00           NOP
0x0013c7: 3e d0        LD A, 0xd0
0x0013c9: ed 6d        [ld-mb-a]          ; set MB register = 0xD0
0x0013cb: ed 56        IM true            ; set interrupt mode
0x0013cd: fd 21 80 00  LD IY, 0x000080
0x0013d1: d0           RET NC             ; (ADL NOP padding)
0x0013d2: fd cb 1b b6  RES 6, (IY+27)    ; clear bit 6 of D000A7
0x0013d6: cd de 58     CALL 0x0058de      ; some init call
0x0013d9: 01 28 08     LD BC, 0x000828
0x0013dc: ed 38 0c     IN0 A, (0x0c)      ; read I/O port 0x0c
0x0013df: cb d7        SET 2, A           ; set bit 2
0x0013e1: ed 39 0c     OUT0 (0x0c), A     ; write back to port 0x0c
0x0013e4: cd 53 18     CALL 0x001853      ; <<< CALL to 0x001853 (wipe path)
0x0013e7: 00           NOP               ; (NOP padding byte after 3-byte CALL)
                                         ; <<<< RETURN ADDRESS 0x0013E8
0x0013e8: f3           DI                 ; disable interrupts (first instruction after return)
0x0013e9: ed 38 0f     IN0 A, (0x0f)      ; read I/O port 0x0f
0x0013ec: cb 7f        BIT 7, A           ; test bit 7
0x0013ee: 20 08        JR NZ, 0x0013f8   ; branch if bit 7 set (skip next block)
0x0013f0: cd 05 3b     CALL 0x003b05      ; conditional call
0x0013f3: 00           NOP
0x0013f4: da 33 19     JP C, 0x001933
0x0013f7: 00           NOP
0x0013f8: cd d1 28     CALL 0x0028d1
...
```

**Key observations for Caller 2:**
- The `CALL 0x001853` at `0x0013E4` is also **unconditional**.
- Immediately before the CALL: `IN0 A,(0x0c)` / `SET 2,A` / `OUT0 (0x0c),A` — sets bit 2 of port 0x0c, then calls. A holds the read-back value of port 0x0c with bit 2 set.
- No conditional branch guards the CALL.
- After return, the code reads another port (`0x0f`), tests bit 7, and conditionally branches — this is the post-init hardware detection path.
- This caller is clearly in a hardware initialization path (LCD/display init) that runs during boot, before the main event loop is active.

---

## Are The Two Callers The Same Function?

**No — they are in different functions.**

| Property | Caller 1 (returns to 0x000862) | Caller 2 (returns to 0x0013E8) |
|----------|-------------------------------|-------------------------------|
| Call site | `0x00085E` | `0x0013E4` |
| Return addr | `0x000862` | `0x0013E8` |
| Pre-call state | `POP AF` (restores saved A) | `OUT0 (0x0c), A` (port write) |
| Post-call | Zeros 0x0077BA, 0x0077BC, 0x00301B | `DI`, reads port 0x0f |
| Context | Hardware mode-switch / display power | LCD/display hardware init |
| Wipe sequence | Hit #2, block 274,953 — AFTER repaint | Hit #1, block 84,825 — early boot |
| VRAM at entry | ~3,337 px (repainted screen) | ~1,466 px (partial init) |

---

## Register State Before Each CALL

From the session 612 dynamic probe (`probe-phase612-wipe-params.mjs`):

Both wipes share identical register state at the moment `0x0018F8` fires:
- **BC** = 0x0000FF
- **DE** = 0xD3FF00
- **HL** = 0xD3FEFF
- **IX** = 0x000000
- **SP** = 0xD1A87B
- All IY flags = 0x00

The **A register differs**: 0x52 (first wipe / Caller 2) vs 0x76 (second wipe / Caller 1).

At the CALL sites themselves (before entering 0x001853), A holds:
- Caller 1 (0x00085E): value restored by `POP AF` from earlier `PUSH AF` at `0x000836`
- Caller 2 (0x0013E4): the byte read from port 0x0c with bit 2 set (`IN0 A,(0x0c)` → `SET 2,A`)

---

## Can The Second Wipe Be Conditionally Skipped?

**Not via a static patch to the call site** — the CALL at `0x00085E` is unconditional, and the ROM is write-protected (addresses < `0x400000` have writes silently dropped by `cpu-runtime.js`).

**Feasible interception approaches:**

### Option A: `onBlock` hook in the runtime (recommended)
The browser shell already has an `onBlock` callback mechanism used for VRAM snapshot/restore. The same mechanism can be used to detect when PC is about to execute `0x00085E` (or when PC enters `0x001853` with the return address `0x000862` on the stack) and suppress the wipe side-effect.

Concretely:
- In the `onBlock` handler, watch for `cpu.regs.PC === 0x001853`
- Read the return address from the stack (at `SP - 3` after the CALL pushes the return address)
- If return address == `0x000862`, skip the wipe (patch HL/BC/DE range to skip the `LDIR` at `0x0018F8`, or return early)

This is already partially implemented: the "Preserve Display" checkbox + VRAM snapshot/restore in session 612's browser shell update handles the symptom (restoring VRAM after wipe). Intercepting at entry to `0x001853` would prevent the wipe entirely.

### Option B: Intercept in the transpiled block for `0x0018F8`
The transpiler generates a JS function for each ROM address block. Patching the JS function for block `0x0018F8` to check a global flag (set when PC entered `0x001853` with return addr `0x000862`) and return early skips the wipe at the implementation level.

### Option C: Stack-sniffing in the `onBlock` for `0x0018F8` itself
When `cpu.regs.PC === 0x0018F8`, read the call stack via `cpu.mem.read24(cpu.regs.SP)` to find the return-chain. If the return two frames up is `0x000862`, skip the wipe.

**Risk assessment:**
- The CALL at `0x00085E` is not guarded by any condition — there is no existing branch to extend.
- The ROM is write-protected — no static patch is possible.
- Dynamic interception (options A/B/C) is the only feasible path.
- The existing "Preserve Display" snapshot/restore already handles this at the VRAM level (browser shell session 612 update). A true intercept would be a lower-level fix and is optional given that the snapshot approach works.

---

## Summary

1. **Both callers unconditionally call `0x001853`** — no conditional branch exists at either call site.
2. **They are in different functions** — Caller 1 (`0x00085E`) is in a hardware mode-switch epilogue; Caller 2 (`0x0013E4`) is in a hardware init sequence.
3. **No static patch is possible** — ROM write-protection prevents modifying the call sites.
4. **Dynamic interception is feasible** via `onBlock` watching for `PC = 0x001853` with return address `0x000862` on the stack, or via patching the JS block for `0x0018F8`.
5. **The existing VRAM snapshot/restore** (session 612) already handles the symptom. True interception is an enhancement, not a blocker.
6. **Target for interception**: Caller 1 at `0x00085E` (returns to `0x000862`) is the second wipe — it fires at block 274,953 after the screen has been repainted. This is the one worth suppressing for display persistence.
