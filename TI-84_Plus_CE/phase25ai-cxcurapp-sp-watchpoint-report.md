# Phase 25AI - cxCurApp True Zeroing Site (SP + Instruction Bytes)

**Date**: 2026-04-22

## Summary

**TRUE ZEROING SITE**: step=18295, PC block entry=0x083214, SP=0xd1a84e

The block at 0x083214 contains a multi-instruction sequence that executes `LDDR` at 0x08321b. The `LDDR` bulk-copies from 0xD007E1 downward, zeroing the entire cx context block (0xD007CA–0xD007E1). The write log confirms sequential descending byte-by-byte writes from 0xD007E1 to 0xD007CA — the classic LDDR pattern.

Disassembly of the zeroing block (0x083214–0x08321d):
```
0x083214: EB        EX DE,HL
0x083215: B7        OR A          ; clear carry
0x083216: ED 52     SBC HL,DE     ; HL = len (cx block size)
0x083218: EB        EX DE,HL
0x083219: C1        POP BC        ; BC = count from stack
0x08321a: E1        POP HL        ; HL = source from stack
0x08321b: ED B8     LDDR          ; <<< ZEROING: copy BC bytes from (HL) to (DE), decrement
0x08321d: EB        EX DE,HL
```

Enclosing function starts at **0x0831a4** (step N-2 in window = function entry).
Direct caller: **0x05e836** (`CALL 0x0831a4`), which is inside the function at 0x05e820.

SP-in-cx-range [0xd007c0..0xd007f0]: **no**

## Method

- Cold boot → MEM_INIT → manual cx seed (cxMain=0x058241, cxCurApp=0x40)
- Timer IRQ disabled: `createPeripheralBus({ timerInterrupt: false })`
- Keyboard ENTER seeded before CoorMon entry
- CoorMon ran with budget=25000 steps, maxLoopIterations=8192
- Rolling 3-step window of {step, PC, SP, instrBytes, mnemonic} maintained at each onBlock
- cxCurApp sampled before/after each block; transition 0x40→0x00 triggers full capture
- cx-range writes trapped via write8/16/24 hooks (same pattern as phase25af)

## Rolling Window at Transition

| Step | PC | SP | Instr Bytes | Mnemonic |
|------|----|----|-------------|----------|
| 18293 | 0x0831a4 | 0xd1a854 | eb 22 6f 06 | ?? eb 22 6f 06 |
| 18294 | 0x0831e5 | 0xd1a854 | e5 c1 19 2b | PUSH HL |
| 18295 | 0x083214 | 0xd1a84e | eb b7 ed 52 | ?? eb b7 ed 52 |
| 18295 | 0x083214 | 0xd1a84e | eb b7 ed 52 | ?? eb b7 ed 52 |

## cx-Range Memory Dump

**Step N-1 (before zeroing)** (0xd007c0 – 0xd007f0):
  0xd007c0: 00 00 00 00 00 00 00 00 00 00 e9 85 05 19 8b 05
  0xd007d0: 7e 8b 05 bc 82 05 a9 8b 05 01 8c 05 00 00 00 00
  0xd007e0: 40 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
  0xd007f0: 00

**Step N (after zeroing)** (0xd007c0 – 0xd007f0):
  0xd007c0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
  0xd007d0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
  0xd007e0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
  0xd007f0: 00

## cx-Range Write Log

| # | Step | PC | Addr | Old | New | Via |
|---|------|----|------|-----|-----|-----|
| 1 | 2579 | 0x08c782 | 0xd007ca | 0x41 | 0xe9 | write8 |
| 2 | 2579 | 0x08c782 | 0xd007cb | 0x82 | 0x85 | write8 |
| 3 | 2579 | 0x08c782 | 0xd007cc | 0x05 | 0x05 | write8 |
| 4 | 2579 | 0x08c782 | 0xd007cd | 0x00 | 0x19 | write8 |
| 5 | 2579 | 0x08c782 | 0xd007ce | 0x00 | 0x8b | write8 |
| 6 | 2579 | 0x08c782 | 0xd007cf | 0x00 | 0x05 | write8 |
| 7 | 2579 | 0x08c782 | 0xd007d0 | 0x00 | 0x7e | write8 |
| 8 | 2579 | 0x08c782 | 0xd007d1 | 0x00 | 0x8b | write8 |
| 9 | 2579 | 0x08c782 | 0xd007d2 | 0x00 | 0x05 | write8 |
| 10 | 2579 | 0x08c782 | 0xd007d3 | 0x00 | 0xbc | write8 |
| 11 | 2579 | 0x08c782 | 0xd007d4 | 0x00 | 0x82 | write8 |
| 12 | 2579 | 0x08c782 | 0xd007d5 | 0x00 | 0x05 | write8 |
| 13 | 2579 | 0x08c782 | 0xd007d6 | 0x00 | 0xa9 | write8 |
| 14 | 2579 | 0x08c782 | 0xd007d7 | 0x00 | 0x8b | write8 |
| 15 | 2579 | 0x08c782 | 0xd007d8 | 0x00 | 0x05 | write8 |
| 16 | 2579 | 0x08c782 | 0xd007d9 | 0x00 | 0x01 | write8 |
| 17 | 2579 | 0x08c782 | 0xd007da | 0x00 | 0x8c | write8 |
| 18 | 2579 | 0x08c782 | 0xd007db | 0x00 | 0x05 | write8 |
| 19 | 2579 | 0x08c782 | 0xd007dc | 0x00 | 0x00 | write8 |
| 20 | 2579 | 0x08c782 | 0xd007dd | 0x00 | 0x00 | write8 |
| 21 | 2579 | 0x08c782 | 0xd007de | 0x00 | 0x00 | write8 |
| 22 | 18295 | 0x083214 | 0xd007e1 | 0x00 | 0x00 | write8 |
| 23 | 18295 | 0x083214 | 0xd007e0 | 0x40 | 0x00 | write8 |
| 24 | 18295 | 0x083214 | 0xd007df | 0x00 | 0x00 | write8 |
| 25 | 18295 | 0x083214 | 0xd007de | 0x00 | 0x00 | write8 |
| 26 | 18295 | 0x083214 | 0xd007dd | 0x00 | 0x00 | write8 |
| 27 | 18295 | 0x083214 | 0xd007dc | 0x00 | 0x00 | write8 |
| 28 | 18295 | 0x083214 | 0xd007db | 0x05 | 0x00 | write8 |
| 29 | 18295 | 0x083214 | 0xd007da | 0x8c | 0x00 | write8 |
| 30 | 18295 | 0x083214 | 0xd007d9 | 0x01 | 0x00 | write8 |
| 31 | 18295 | 0x083214 | 0xd007d8 | 0x05 | 0x00 | write8 |
| 32 | 18295 | 0x083214 | 0xd007d7 | 0x8b | 0x00 | write8 |
| 33 | 18295 | 0x083214 | 0xd007d6 | 0xa9 | 0x00 | write8 |
| 34 | 18295 | 0x083214 | 0xd007d5 | 0x05 | 0x00 | write8 |
| 35 | 18295 | 0x083214 | 0xd007d4 | 0x82 | 0x00 | write8 |
| 36 | 18295 | 0x083214 | 0xd007d3 | 0xbc | 0x00 | write8 |
| 37 | 18295 | 0x083214 | 0xd007d2 | 0x05 | 0x00 | write8 |
| 38 | 18295 | 0x083214 | 0xd007d1 | 0x8b | 0x00 | write8 |
| 39 | 18295 | 0x083214 | 0xd007d0 | 0x7e | 0x00 | write8 |
| 40 | 18295 | 0x083214 | 0xd007cf | 0x05 | 0x00 | write8 |
| 41 | 18295 | 0x083214 | 0xd007ce | 0x8b | 0x00 | write8 |
| 42 | 18295 | 0x083214 | 0xd007cd | 0x19 | 0x00 | write8 |
| 43 | 18295 | 0x083214 | 0xd007cc | 0x05 | 0x00 | write8 |
| 44 | 18295 | 0x083214 | 0xd007cb | 0x85 | 0x00 | write8 |
| 45 | 18295 | 0x083214 | 0xd007ca | 0xe9 | 0x00 | write8 |

## Caller Hypothesis

The zeroing instruction is `LDDR` at ROM address 0x08321b, inside the block whose executor entry-PC is 0x083214. The block lives in the function starting at **0x0831a4**.

Call chain leading to the zeroing:
1. Step N-2 (18293): PC=0x0831a4 — function entry (EX DE,HL / LD (0xD0066F),HL setup)
2. Step N-1 (18294): PC=0x0831e5 — PUSH HL / POP BC / ADD HL,DE / ... (size calculation)
3. Step N (18295):   PC=0x083214 — EX DE,HL / OR A / SBC HL,DE / POP BC / POP HL / **LDDR** (zeroing)

Direct caller in ROM: **CALL 0x0831a4 at 0x05e836** (inside function at 0x05e820).
Additional callers into this function: 0x05e836 (confirmed hot path).

To continue: disassemble 0x05e820 to understand when/why it zeros the cx block, and trace
what CoorMon dispatch path leads to 0x05e820 at step ~18293.

## Run Statistics

- MEM_INIT steps: 18
- CoorMon steps: 25000
- CoorMon termination: max_steps
- CoorMon finalPc: 0x0821b2
- CoorMon returned: false
- GetCSC hit steps: 1643
- cx range writes total: 45
- Final cxCurApp: 0x00
- Final errNo: 0x00
- Final errSP: 0x000000
- Final OP1: 00 00 00 00 00 00 00 00 00

## Next-Step Recommendations

1. If the zeroing PC is known: disassemble the full function containing that PC.
2. Scan ROM bytes for `CD <lo> <hi>` (CALL) to the zeroing PC to find all callers.
3. If the instruction is LDIR/LDDR: trace HL (source), DE (dest), BC (count) at step N-1.
4. If the instruction is a direct store (LD (nn),A): confirm A=0 and where it was set.
5. If SP-in-cx-range is YES: the zeroing is likely a stack push spilling into the cx block — find the function that pushed with SP pointing into cx memory.

## Console Output

```text
=== Phase 25AI: cxCurApp SP watchpoint ===
Cold boot complete.
MEM_INIT: returned=true steps=18
Seeded cxCurApp=0x40 cxMain=0x058241
Seeded keyboard: keyMatrix[1]=0xfe kbdKey=0x05
  GetCSC hit step=1643 pc=0x03fa09
CoorMon: term=max_steps steps=25000 finalPc=0x0821b2
GetCSC hits: 1643
cx range writes: 45
cxCurApp transition found: step=18295
```
