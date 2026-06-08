# Phase 575 P2: Decode 0x058241 (caller of scroll swap 0x0A1FB5)

## Function Boundaries

| Field | Value |
|-------|-------|
| Entry | 0x058241 |
| End (byte after RET) | 0x0583E8 |
| Size | 423 bytes (423 bytes) |
| CALL 0x0A1FB5 at | 0x05831E |
| Caller | 0x0620C4: CALL 0x058241 |

## What Gates the Scroll Swap

The CALL 0x0A1FB5 at 0x05831E is **unconditional** (opcode `CD`). However, the function has **five early exits** that prevent execution from reaching it:

| Address | Gate | IY Flag Check |
|---------|------|---------------|
| 0x058253 | CALL NZ,0x0239B3 | BIT 4,(IY+0x34) |
| 0x058257 | RET NZ | (continues from above CALL NZ) |
| 0x058286 | JP NZ,0x058A2C | BIT 6,(IY+0x1C) |
| 0x05828E | RET NZ | BIT 7,(IY+0x09) |
| 0x058297 | JP NZ,0x058483 | BIT 7,(IY+0x0C) |
| 0x05829F | RET NZ | BIT 6,(IY+0x0C) |

All five gates must pass (bits NOT set) for the scroll swap to execute. The key IY flags:
- **(IY+0x34) bit 4** - if set, calls 0x0239B3 then returns if NZ
- **(IY+0x1C) bit 6** - if set, jumps to 0x058A2C (alternate path)
- **(IY+0x09) bit 7** - if set, returns immediately
- **(IY+0x0C) bit 7** - if set, jumps to 0x058483 (alternate path)
- **(IY+0x0C) bit 6** - if set, returns immediately

## Pre-Swap Setup

Before reaching 0x05831E, the function:
1. Clears many IY flags: (IY+0x4A) bit4, (IY+0x05) bit3, (IY+0x47) bit1, (IY+0x49) bit6, (IY+0x25) bit5, (IY+0x08) bit1, (IY+0x15) bit6, (IY+0x1F) bit2, (IY+0x01) bit4
2. Calls several subsystems: 0x09DCAA, 0x083623, 0x083764, 0x058D49, 0x08BF22, 0x0800EC, 0x09CE10
3. Loads and stores LCD parameters via .SIS to ports 0x07C7, 0x07C8, 0x07C4 (reading from 0x2433, 0x2431)
4. Copies RAM: 260 bytes from D0232D to D006C0 (LDIR)
5. Copies A from (D02687) to (D02685)

## Post-Swap Path

After the scroll swap call:
1. **BIT 2,(IY+0x15)** branches:
   - If set: loads LCD window params (BC=0x1E24 or 0x9B9C), sets window via CALL 0x09EF20
   - If clear: CALL 0x0A2854
2. CALL 0x061DEF with HL=0x05845D (callback table pointer?)
3. CALL 0x09E601, CALL 0x061E20
4. RES 0,(HL) at D02A92
5. If (IY+0x15) bit2 set: CALL 0x0A235E
6. Menu key handling via (IY+0x45) bits 0-1
7. Final LCD/display commit sequence via 0x07FF7B, 0x058CB6
8. Either graph mode path (BIT 3,(IY+0x49) -> LD A,0x40, CALL 0x092D9C)
   or normal redraw path (CALL 0x0583EE subroutine)
9. RES 6,(IY+0x49), CALL 0x0A1FD1, RET

## RAM Variables

| Address | Usage |
|---------|-------|
| D02687 | Read: source value copied to D02685 |
| D02685 | Written: receives value from D02687 |
| D0265B | Written: receives result of CALL 0x058BA3 |
| D02506 | Written: receives same result as D0265B |
| D0232D | Source of 260-byte LDIR copy (display state?) |
| D006C0 | Destination of 260-byte LDIR copy |
| D02A92 | RES 0,(HL): bit 0 cleared after scroll swap |

## LCD Port Access (.SIS)

| Port | Operation |
|------|-----------|
| 0x26AC | LD (0x26AC),HL (set to 0x000000 at entry) |
| 0x2433 | LD HL,(0x2433) - read LCD param |
| 0x2431 | LD HL,(0x2431) - read LCD param |
| 0x07C7 | LD (0x07C7),HL - write LCD param |
| 0x07C8 | LD (0x07C8),HL - write LCD param |
| 0x07C4 | LD (0x07C4),HL - write LCD param |

## Functional Summary

**0x058241 is the OS main display refresh / home-screen repaint function.** It is called from 0x0620C4 (likely the main event loop dispatcher). The function:

1. Guards against re-entry and mode conflicts via 5 IY flag checks
2. Clears ~9 IY flags to reset display-subsystem state
3. Calls several display subsystem initializers
4. Copies LCD hardware parameters and a 260-byte display state block
5. **Commits the secondary scroll buffer to primary** via CALL 0x0A1FB5 (8400-byte LDIR from D07396 to D031F6)
6. Configures LCD window (different params for graph vs normal mode)
7. Handles pending menu-key events
8. Runs final LCD commit and optional graph-mode rendering

The scroll swap at 0x05831E is the core display-commit operation: it copies the secondary (working) scroll buffer into the primary (display) buffer, making pending text/cursor changes visible on-screen.

## Subroutine 0x0583EE

Called from 0x0583B6 (normal redraw path) and 0x0583E8 (alternate entry with JR back):
```
0x0583EE: CALL 0x090C12
0x0583F2: CALL 0x08F83E
0x0583F6: CALL 0x09E5CF
0x0583FA: CALL 0x058434
0x0583FE: CALL 0x090124
0x058402: CALL 0x08E294
0x058406: SET 2,(IY+0x44)
0x05840A: RET
```
This subroutine calls 6 display subsystem routines and sets (IY+0x44) bit 2 (display-refresh-complete flag?).

## Full Disassembly

```
0x058241:  21 00 00 00         LD HL,0x000000
0x058245:  40 22 AC 26         .SIS LD (0x26AC),HL
0x058249:  FD CB 52 BE         RES 7,(IY+0x52)
0x05824D:  3E 03               LD A,0x03
0x05824F:  FD CB 34 66         BIT 4,(IY+0x34)
0x058253:  C4 B3 39 02         CALL NZ,0x0239B3
0x058257:  C0                  RET NZ
0x058258:  FD CB 29 56         BIT 2,(IY+0x29)
0x05825C:  28 04               JR Z,0x058262
0x05825E:  CD 18 38 02         CALL 0x023818
0x058262:  FD 7E 3C            LD A,(IY+0x3C)
0x058265:  E6 F4               AND 0xF4
0x058267:  FD 77 3C            LD (IY+0x3C),A
0x05826A:  FD CB 14 BE         RES 7,(IY+0x14)
0x05826E:  CD C2 00 08         CALL 0x0800C2
0x058272:  CD A3 8B 05         CALL 0x058BA3
0x058276:  32 5B 26 D0         LD (0xD0265B),A
0x05827A:  32 06 25 D0         LD (0xD02506),A
0x05827E:  CD 22 82 05         CALL 0x058222
0x058282:  FD CB 1C 76         BIT 6,(IY+0x1C)
0x058286:  C2 2C 8A 05         JP NZ,0x058A2C
0x05828A:  FD CB 09 7E         BIT 7,(IY+0x09)
0x05828E:  C0                  RET NZ
0x05828F:  FD CB 45 BE         RES 7,(IY+0x45)
0x058293:  FD CB 0C 7E         BIT 7,(IY+0x0C)
0x058297:  C2 83 84 05         JP NZ,0x058483
0x05829B:  FD CB 0C 76         BIT 6,(IY+0x0C)
0x05829F:  C0                  RET NZ
0x0582A0:  FD CB 09 86         RES 0,(IY+0x09)
0x0582A4:  FD CB 08 8E         RES 1,(IY+0x08)
0x0582A8:  CD AA DC 09         CALL 0x09DCAA
0x0582AC:  CD 23 36 08         CALL 0x083623
0x0582B0:  CD 64 37 08         CALL 0x083764
0x0582B4:  CD 49 8D 05         CALL 0x058D49
0x0582B8:  CD 22 BF 08         CALL 0x08BF22
0x0582BC:  FD CB 4A A6         RES 4,(IY+0x4A)
0x0582C0:  FD CB 05 9E         RES 3,(IY+0x05)
0x0582C4:  FD CB 47 8E         RES 1,(IY+0x47)
0x0582C8:  FD CB 49 B6         RES 6,(IY+0x49)
0x0582CC:  FD CB 25 AE         RES 5,(IY+0x25)
0x0582D0:  FD CB 08 8E         RES 1,(IY+0x08)
0x0582D4:  FD CB 15 B6         RES 6,(IY+0x15)
0x0582D8:  FD CB 1F 96         RES 2,(IY+0x1F)
0x0582DC:  CD EC 00 08         CALL 0x0800EC
0x0582E0:  FD CB 01 A6         RES 4,(IY+0x01)
0x0582E4:  CD 10 CE 09         CALL 0x09CE10
0x0582E8:  21 00 08 00         LD HL,0x000800
0x0582EC:  CD A0 00 08         CALL 0x0800A0
0x0582F0:  28 02               JR Z,0x0582F4
0x0582F2:  2E 06               LD L,0x06
0x0582F4:  3A 87 26 D0         LD A,(0xD02687)
0x0582F8:  32 85 26 D0         LD (0xD02685),A
0x0582FC:  40 22 C7 07         .SIS LD (0x07C7),HL
0x058300:  40 2A 33 24         .SIS LD HL,(0x2433)
0x058304:  40 22 C8 07         .SIS LD (0x07C8),HL
0x058308:  40 2A 31 24         .SIS LD HL,(0x2431)
0x05830C:  40 22 C4 07         .SIS LD (0x07C4),HL
0x058310:  21 2D 23 D0         LD HL,0xD0232D
0x058314:  11 C0 06 D0         LD DE,0xD006C0
0x058318:  01 04 01 00         LD BC,0x000104
0x05831C:  ED B0               LDIR
0x05831E:  CD B5 1F 0A         CALL 0x0A1FB5  ; <<<< SCROLL SWAP CALL
0x058322:  FD CB 15 56         BIT 2,(IY+0x15)
0x058326:  28 1C               JR Z,0x058344
0x058328:  01 24 1E 00         LD BC,0x001E24
0x05832C:  CD A0 00 08         CALL 0x0800A0
0x058330:  28 04               JR Z,0x058336
0x058332:  01 9C 9B 00         LD BC,0x009B9C
0x058336:  21 00 00 00         LD HL,0x000000
0x05833A:  11 3F 01 00         LD DE,0x00013F
0x05833E:  CD 20 EF 09         CALL 0x09EF20
0x058342:  18 04               JR0x058348
0x058344:  CD 54 28 0A         CALL 0x0A2854
0x058348:  21 5D 84 05         LD HL,0x05845D
0x05834C:  CD EF 1D 06         CALL 0x061DEF
0x058350:  CD 01 E6 09         CALL 0x09E601
0x058354:  CD 20 1E 06         CALL 0x061E20
0x058358:  21 92 2A D0         LD HL,0xD02A92
0x05835C:  CB 86               RES 0,(HL)
0x05835E:  FD CB 15 56         BIT 2,(IY+0x15)
0x058362:  28 04               JR Z,0x058368
0x058364:  CD 5E 23 0A         CALL 0x0A235E
0x058368:  FD CB 45 4E         BIT 1,(IY+0x45)
0x05836C:  28 28               JR Z,0x058396
0x05836E:  FD CB 45 8E         RES 1,(IY+0x45)
0x058372:  3E 0E               LD A,0x0E
0x058374:  FD CB 45 46         BIT 0,(IY+0x45)
0x058378:  FD CB 45 8E         RES 1,(IY+0x45)
0x05837C:  20 02               JR NZ,0x058380
0x05837E:  3E 15               LD A,0x15
0x058380:  CD FC 27 02         CALL 0x0227FC
0x058384:  FD CB 15 56         BIT 2,(IY+0x15)
0x058388:  28 08               JR Z,0x058392
0x05838A:  FD CB 14 4E         BIT 1,(IY+0x14)
0x05838E:  C4 C1 21 0A         CALL NZ,0x0A21C1
0x058392:  CD 13 1E 09         CALL 0x091E13
0x058396:  CD B8 00 08         CALL 0x0800B8
0x05839A:  28 79               JR Z,0x058415
0x05839C:  FD CB 15 96         RES 2,(IY+0x15)
0x0583A0:  CD 7B FF 07         CALL 0x07FF7B
0x0583A4:  CD B6 8C 05         CALL 0x058CB6
0x0583A8:  FD CB 49 5E         BIT 3,(IY+0x49)
0x0583AC:  28 08               JR Z,0x0583B6
0x0583AE:  3E 40               LD A,0x40
0x0583B0:  CD 9C 2D 09         CALL 0x092D9C
0x0583B4:  18 29               JR0x0583DF
0x0583B6:  CD EE 83 05         CALL 0x0583EE
0x0583BA:  40 ED 4B 84 26      .SIS LD BC,(0x2684)
0x0583BF:  0E EF               LD C,0xEF
0x0583C1:  21 00 00 00         LD HL,0x000000
0x0583C5:  11 3F 01 00         LD DE,0x00013F
0x0583C9:  CD 20 EF 09         CALL 0x09EF20
0x0583CD:  FD CB 4C C6         SET 0,(IY+0x4C)
0x0583D1:  3E 02               LD A,0x02
0x0583D3:  CD 89 67 02         CALL 0x026789
0x0583D7:  FD CB 23 96         RES 2,(IY+0x23)
0x0583DB:  CD 01 E4 08         CALL 0x08E401
0x0583DF:  FD CB 49 B6         RES 6,(IY+0x49)
0x0583E3:  CD D1 1F 0A         CALL 0x0A1FD1
0x0583E7:  C9                  RET
```
