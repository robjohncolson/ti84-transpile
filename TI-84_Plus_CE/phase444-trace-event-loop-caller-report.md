# Phase 444: Trace the Event Loop Outer Caller

## Function Boundary

**Start**: 0x003A05  
**End**: 0x003A8E (JP 0x000721 — tail-call, no RET)  
**Previous function ends**: RET at 0x003A04  
**String data follows**: 0x003A90..0x003AE5 (error message strings)

The function has three entry points:
- **0x003A05**: utility entry via OS jump table (JP at 0x0002C8) — does `PUSH HL; DEC SP; POP HL; INC SP; LD L, 0; JP 0x0039E1`; this is a separate small helper, NOT the event loop
- **0x003A0F**: error display entry (JP at 0x0017CA) — main entry point
- **0x003A89**: direct-to-power-off entry (JP at 0x0002CC) — skips display, goes to `CALL 0x001853` then `JP 0x000721`

## Full Disassembly (0x003A0F..0x003A8E)

```
; ── Error message display ──
0x003A0F  LD HL, 0x003A92      ; string table base (" ERROR!\0")
0x003A13  ADD HL, DE            ; + offset from caller (error type)
0x003A14  JR 0x003A1A
0x003A16  LD HL, 0x003A92       ; alternate entry (DE=0)
0x003A1A  PUSH HL               ; save string pointer
0x003A1B  PUSH AF
0x003A1C  XOR A
0x003A1D  DI
0x003A1E  JR 0x003A20           ; (pipeline flush)
0x003A20  DI
0x003A21  IM 2
0x003A23  IM 1
0x003A25  OUT0 (0x28), A        ; TMR0_CTR = 0 (disable timer)
0x003A28  IN0 A, (0x28)
0x003A2B  BIT 2, A
0x003A2D  IN0 A, (0x06)
0x003A30  RES 2, A
0x003A32  OUT0 (0x06), A        ; clear GPIO bit 2
0x003A35  NOP
0x003A36  NOP
0x003A37  LD A, 0x88
0x003A39  OUT0 (0x24), A        ; PLL control
0x003A3C  CP 0x88
0x003A3E  JP NZ, 0x000066       ; safety trap
0x003A42  POP AF
0x003A43  CALL 0x005B96          ; display error title
0x003A47  POP HL
0x003A48  CALL 0x0059E9          ; display string at HL
0x003A4C  LD HL, 0x003A9A        ; " Press any key to turn"
0x003A50  LD DE, 0x000001
0x003A54  CALL 0x003AE6          ; display line 1
0x003A58  LD HL, 0x003AB1        ; " unit OFF."
0x003A5C  LD DE, 0x000002
0x003A60  CALL 0x003AE6          ; display line 2
0x003A64  LD HL, 0x003ABC        ; " Then turn unit back ON."
0x003A68  LD DE, 0x000003
0x003A6C  CALL 0x003AE6          ; display line 3

; ── Key poll loop ──
0x003A70  LD B, 0x64             ; B = 100 (outer poll iterations)
0x003A72  PUSH BC                ; save loop counter
0x003A73  CALL 0x003D5A          ; _GetCSC — poll keyboard
0x003A77  POP BC
0x003A78  OR A                   ; key pressed? (A != 0)
0x003A79  JR NZ, 0x003A7D        ; yes → exit loop
0x003A7B  DJNZ 0x003A72          ; no → poll again (up to 100x)

; ── Post-loop: sleep or power off ──
0x003A7D  CALL 0x001713          ; check APD/power-off conditions
0x003A81  JP NZ, 0x001933        ; if APD triggered → sleep (DI+HALT)
0x003A85  JP 0x003A89            ; else fall through
0x003A89  CALL 0x001853          ; set D177BA = 0x7F, configure ports
0x003A8D  XOR A                  ; A = 0 (exit code)
0x003A8E  JP 0x000721            ; tail-call → power-off handler
```

## All Callers Found via ROM Scan

| Address | Instruction | Target | Context |
|---------|-------------|--------|---------|
| 0x0002C8 | JP 0x003A05 | utility entry | OS syscall jump table (entry ~50) |
| 0x0002CC | JP 0x003A89 | direct power-off | Jump table — skips display |
| 0x0017CA | JP 0x003A0F | error display | Tail-call from error detection loop at 0x001794, itself called from 0x00160E |
| 0x003A85 | JP 0x003A89 | self-ref | Internal: skip-sleep path |
| 0x00142C | JP 0x000721 | power-off (0x721) | Separate path, also reaches power-off handler |
| 0x003A8E | JP 0x000721 | power-off (0x721) | From this function's tail |

**No CALL instructions target any address in 0x003A05..0x003A8E.** All entries are via JP (no return address pushed).

## Stack Analysis at Entry

When booted through the standard probe stages (boot → kernel → postInit → stages 1-4), the stack at event loop entry contains:

```
SP = 0xD1A872  (STACK_RESET_TOP - 12)
SP+ 0: 0xFFFFFF  (sentinel fill)
SP+ 3: 0xFFFFFF  (sentinel fill)
SP+ 6: 0xFFFFFF  (sentinel fill)
SP+ 9: 0xFFFFFF  (sentinel fill)
```

In the probe's setup, the stack is filled with 0xFF sentinels. There is no real return address because the probe jumps directly to 0x003A73 rather than calling through the OS's normal scheduler path.

In normal OS operation, the call chain is:
1. OS scheduler (around 0x001600) calls 0x001794 (error detection loop)
2. 0x001794 runs its checks, then tail-calls JP 0x003A0F
3. The CALL at step 1 pushes a return address (~0x001612)
4. When the HALT path fires (0x001933 → HALT → wake → RET at 0x00194C), it pops that return address
5. Execution resumes at ~0x001612 in the scheduler, which loops and re-enters the poll path

## What 0x000721 Does

**0x000721 is the power-off handler.** Its flow:

```
0x000721  CALL 0x013D00          ; save context (DI, push IX/IY, set IY=0xD00080)
0x000725  LD HL, 0
0x000729  CALL 0x0158A6          ; flash validation
0x00072D  CALL Z, 0x0138F1       ; conditional flash op
0x000731  LD A, L; OR H          ; test result
0x000733  JP Z, 0x000877          ; flash integrity check path
0x000737  CALL 0x013D8E          ; cleanup
0x00073B  LD A, 0xFA
0x00073D  CALL 0x0061E5          ; power management prep
0x000741..0x000794  [port config + stack bounds check]
0x000795  CALL 0x000E01          ; port initialization loop (62 ports)
0x000799..0x00085D  [more port config, clock setup]
0x00085E  CALL 0x001853          ; set D177BA = 0x7F
0x000862  XOR A
0x000863  LD (0xD177BA), A       ; clear power-off flag
0x000867  LD (0xD177BC), A       ; clear secondary flag
0x00086B  LD HL, 0
0x00086F  LD (0xD0301B), HL      ; clear state
0x000874  JP 0x0019B5            ; → DI + OUT0 (0x00), 0x10 + HALT = POWER OFF
```

**0x0019B5 is the final power-off sequence**: `DI; LD A, 0x10; OUT0 (0x00), A; HALT`. This puts the CPU into deep sleep with no IRQ mask — the calculator is OFF. Only a hardware reset (ON key) can wake it.

**0x000721 does NOT loop back to the event loop.** It is a one-way path to power off.

## How the OS Re-enters the Event Loop After HALT Wake

The HALT wrapper at 0x001933:

```
0x001933  CALL 0x00620D          ; pre-sleep hook (save state)
0x001937  DI
0x001938  LD A, 0xC0; OUT0 (0x00), A  ; light sleep mode (IRQ-wakeable)
0x00193D  LD A, 0xC4; OUT0 (0x09), A  ; enable timer IRQ
0x001942  HALT                   ; sleep until IRQ
; ── IRQ fires → ISR runs → RETI → resume here ──
0x001943  LD (0xD02AD7), DE      ; store DE to scratch memory
0x001948  LD A, (0xD02AD9)       ; load status
0x00194C  RET                    ; return to caller
```

The RET at 0x00194C does **not** return to the event loop function (which was entered via JP, not CALL). It returns to the address on the stack — which is the return address from the **scheduler's CALL** to the error detection function at 0x001794.

**Re-entry path**:
```
Scheduler (0x00160E) ──CALL──→ 0x001794 (error detect loop)
                                    │
                                    ├──JP──→ 0x003A0F (display + poll)
                                    │           │
                                    │           ├──JP NZ──→ 0x001933 (HALT)
                                    │           │               │
                                    │           │               └──RET──→ 0x001612 (scheduler)
                                    │           │                            │
                                    │           │                            └──loops back──→ CALL 0x001794
                                    │           │
                                    │           └──JP──→ 0x000721 (power off) → 0x0019B5 (HALT forever)
```

The scheduler at ~0x001600 is a loop that repeatedly calls 0x001794. When the HALT path returns, it comes back to the scheduler, which re-enters the error detection + key poll cycle.

## Conclusion

1. **0x003A0F..0x003A8E is the error display + wait-for-key handler**, not a standalone event loop. The key poll loop at 0x003A70 is embedded within it.

2. **Nobody calls 0x003A73 directly** — it's the middle of the DJNZ loop. The probe's use of it as EVENT_LOOP_ENTRY is a synthetic shortcut that works because 0x003D5A (the only _GetCSC callsite) is at that address.

3. **The HALT path returns to the scheduler** via the return address left by `CALL 0x001794` at 0x00160E. The scheduler loops and re-enters the poll cycle.

4. **The non-HALT path (JP 0x000721) is a power-off sequence** that never returns. It ends at DI + HALT with no IRQ mask = calculator OFF.

5. **The probe's approach is correct**: resetting PC to EVENT_LOOP_ENTRY when the HALT barrier is hit simulates what the scheduler does — re-entering the key poll after wake.
