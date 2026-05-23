# Phase 412: Trace of 0x014EF8

Date: 2026-05-22
Target: 0x014EF8
ROM: TI-84_Plus_CE/ROM.rom

## Summary

- 0x014EF8 is 159 bytes long (0x014EF8-0x014F96) and returns early if D14077 is already non-zero.
- It directly touches only D14077 and D14038. None of D177B7, D1440E, D1440F, D14073, D14084, D14408, or D1440B are accessed directly inside this function.
- It performs hardware I/O on ports 0x5008, 0x5004, 0x500C, and 0x7030, and it calls four helpers that program the 0x7020-0x702F port block.
- The neighboring routine 0x014E81 clears D14077 and reverses part of this state, so the bytes identify 0x014EF8 as the arm/setup half of the pair, not the teardown half.
- Indirect effect on known notification RAM: 0x014EF8 clears D14038, and caller 0x014E3F immediately copies D14038 -> D1440B afterward, so D1440B becomes 0 through the caller path.

## Raw Bytes

```text
0x014ef8: 3A 77 40 D1 B7 C2 96 4F 01 01 08 50 00 3E 08 ED
0x014f08: 79 78 FE 50 28 01 CF 79 FE 08 20 FA 01 04 50 00
0x014f18: ED 78 CB DF ED 79 78 FE 50 28 01 CF 79 FE 04 20
0x014f28: FA 01 0C 50 00 ED 78 CB DF ED 79 78 FE 50 28 01
0x014f38: CF 79 FE 0C 20 FA 01 00 00 00 ED 43 38 40 D1 C5
0x014f48: 01 00 C0 00 C5 CD 21 71 00 C1 C1 01 00 00 00 C5
0x014f58: 01 00 C0 00 C5 CD 51 71 00 C1 C1 01 00 00 00 C5
0x014f68: C5 CD 81 71 00 C1 C1 01 00 00 00 C5 C5 CD B1 71
0x014f78: 00 C1 C1 40 01 30 70 ED 78 F6 40 ED 79 78 FE 70
0x014f88: 28 01 CF 79 FE 30 20 FA 3E 01 32 77 40 D1 C9 CD
```

## Disassembly

```text
0x014ef8: 3A 77 40 D1          LD A,(0xd14077) ; D14077 arm/init latch read ; read one-byte arm/init latch
0x014efc: B7                   OR A
0x014efd: C2 96 4F 01          JP NZ,0x014f96 ; already-armed fast path
0x014f01: 01 08 50 00          LD BC,0x005008
0x014f05: 3E 08                LD A,0x08
0x014f07: ED 79                OUT (C),A ; OUT port 0x5008 (interrupt controller acknowledge byte 0) ; write one-hot 0x08 acknowledge to port 0x5008
0x014f09: 78                   LD A,B
0x014f0a: FE 50                CP 0x50
0x014f0c: 28 01                JR Z,0x014f0f
0x014f0e: CF                   RST 08h
0x014f0f: 79                   LD A,C
0x014f10: FE 08                CP 0x08
0x014f12: 20 FA                JR NZ,0x014f0e
0x014f14: 01 04 50 00          LD BC,0x005004
0x014f18: ED 78                IN A,(C) ; IN port 0x5004 (interrupt controller enable-mask byte 0)
0x014f1a: CB DF                SET 3,A ; set bit 3 before writing back to port 0x5004
0x014f1c: ED 79                OUT (C),A ; OUT port 0x5004 (interrupt controller enable-mask byte 0)
0x014f1e: 78                   LD A,B
0x014f1f: FE 50                CP 0x50
0x014f21: 28 01                JR Z,0x014f24
0x014f23: CF                   RST 08h
0x014f24: 79                   LD A,C
0x014f25: FE 04                CP 0x04
0x014f27: 20 FA                JR NZ,0x014f23
0x014f29: 01 0C 50 00          LD BC,0x00500c
0x014f2d: ED 78                IN A,(C) ; IN port 0x500c (interrupt controller latch-mode byte 0)
0x014f2f: CB DF                SET 3,A ; set bit 3 before writing back to port 0x500C
0x014f31: ED 79                OUT (C),A ; OUT port 0x500c (interrupt controller latch-mode byte 0)
0x014f33: 78                   LD A,B
0x014f34: FE 50                CP 0x50
0x014f36: 28 01                JR Z,0x014f39
0x014f38: CF                   RST 08h
0x014f39: 79                   LD A,C
0x014f3a: FE 0C                CP 0x0c
0x014f3c: 20 FA                JR NZ,0x014f38
0x014f3e: 01 00 00 00          LD BC,0x000000
0x014f42: ED 43 38 40 D1       LD (0xd14038),BC ; D14038 source state word write ; clear D14038 before 0x014E3F later copies it into D1440B
0x014f47: C5                   PUSH BC
0x014f48: 01 00 C0 00          LD BC,0x00c000
0x014f4c: C5                   PUSH BC
0x014f4d: CD 21 71 00          CALL 0x007121 ; writes two 16-bit words to port block 0x7020-0x7023 ; program port block 0x7020 using pushed args 0 and 0xC000
0x014f51: C1                   POP BC
0x014f52: C1                   POP BC
0x014f53: 01 00 00 00          LD BC,0x000000
0x014f57: C5                   PUSH BC
0x014f58: 01 00 C0 00          LD BC,0x00c000
0x014f5c: C5                   PUSH BC
0x014f5d: CD 51 71 00          CALL 0x007151 ; writes two 16-bit words to port block 0x7024-0x7027 ; program port block 0x7024 using pushed args 0 and 0xC000
0x014f61: C1                   POP BC
0x014f62: C1                   POP BC
0x014f63: 01 00 00 00          LD BC,0x000000
0x014f67: C5                   PUSH BC
0x014f68: C5                   PUSH BC
0x014f69: CD 81 71 00          CALL 0x007181 ; writes two 16-bit words to port block 0x7028-0x702b ; program port block 0x7028 using pushed args 0 and 0
0x014f6d: C1                   POP BC
0x014f6e: C1                   POP BC
0x014f6f: 01 00 00 00          LD BC,0x000000
0x014f73: C5                   PUSH BC
0x014f74: C5                   PUSH BC
0x014f75: CD B1 71 00          CALL 0x0071b1 ; writes two 16-bit words to port block 0x702c-0x702f ; program port block 0x702C using pushed args 0 and 0
0x014f79: C1                   POP BC
0x014f7a: C1                   POP BC
0x014f7b: 40 01 30 70          SIS LD BC,0x7030 ; SIS prefix forces a 16-bit immediate load of BC=0x7030
0x014f7f: ED 78                IN A,(C) ; IN port 0x7030 (GPIO/timer control port noted in prior USB/key-path work)
0x014f81: F6 40                OR 0x40 ; set bit 6 before writing back to port 0x7030
0x014f83: ED 79                OUT (C),A ; OUT port 0x7030 (GPIO/timer control port noted in prior USB/key-path work)
0x014f85: 78                   LD A,B
0x014f86: FE 70                CP 0x70
0x014f88: 28 01                JR Z,0x014f8b
0x014f8a: CF                   RST 08h
0x014f8b: 79                   LD A,C
0x014f8c: FE 30                CP 0x30
0x014f8e: 20 FA                JR NZ,0x014f8a
0x014f90: 3E 01                LD A,0x01
0x014f92: 32 77 40 D1          LD (0xd14077),A ; D14077 arm/init latch write ; mark arm/init latch as active
0x014f96: C9                   RET
```

## Direct RAM Accesses

| PC | Instruction | Access | Address | Note |
| --- | --- | --- | --- | --- |
| 0x014ef8 | `LD A,(0xd14077)` | READ | 0xd14077 | D14077 arm/init latch |
| 0x014f42 | `LD (0xd14038),BC` | WRITE | 0xd14038 | D14038 source state word |
| 0x014f92 | `LD (0xd14077),A` | WRITE | 0xd14077 | D14077 arm/init latch |

Requested notification RAM check: no direct references to D177B7, D1440E, D1440F, D14073, D14084, D14408, or D1440B appear in 0x014EF8.

Indirect notification RAM effect through caller 0x014E3F:
- 0x014F42 stores BC=0 into D14038.
- Phase 411 already established that 0x014E3F then executes `LD BC,(0xD14038)` at 0x014E66 and `LD (0xD1440B),BC` at 0x014E6B.
- Result: the installer path saves 0 into D1440B even though 0x014EF8 never names D1440B directly.

## Direct Caller Scan

Exact-byte scans used:
- CALL 0x014EF8 = `CD F8 4E 01`
- JP   0x014EF8 = `C3 F8 4E 01`

| Site | Type | Note | Context Bytes |
| --- | --- | --- | --- |
| 0x0004f8 | JP | exported ROM vector: JP 0x014EF8 | `C3 97 4F 01 C3 81 4E 01 C3 F8 4E 01 C3 3F 4E 01 C3 A0 4F 01` |
| 0x00fc95 | CALL | runtime user: arms 0x014EF8 before port 0x3082 / 0x3010 bit-clears | `CD C2 21 00 CA 44 FD 00 CD F8 4E 01 40 01 82 30 ED 78 E6 20` |
| 0x00fd5b | CALL | runtime user: after reading D177B8, skips arm only when payload == 0xFF | `3A B8 77 D1 FE FF 28 04 CD F8 4E 01 40 01 82 30 ED 78 E6 20` |
| 0x014e4c | CALL | called from 0x014E3F, the notification installer traced in phase 411 | `57 F5 F3 AF 32 0E 44 D1 CD F8 4E 01 AF 32 0F 44 D1 DD 07 06` |
| 0x014f9b | CALL | local wrapper: CALL 0x014E81; CALL 0x014EF8; RET | `77 40 D1 C9 CD 81 4E 01 CD F8 4E 01 C9 CD 8A 21 00 FD 21 80` |

Jump table scan (0x020104-0x02230c): no entry points at 0x014EF8.

## Port I/O

| Port | Sites | Access | Note |
| --- | --- | --- | --- |
| 0x5008 | 0x014f07 | OUT | interrupt controller acknowledge byte 0 |
| 0x5004 | 0x014f18, 0x014f1c | IN, OUT | interrupt controller enable-mask byte 0 |
| 0x500c | 0x014f2d, 0x014f31 | IN, OUT | interrupt controller latch-mode byte 0 |
| 0x7030 | 0x014f7f, 0x014f83 | IN, OUT | GPIO/timer control port noted in prior USB/key-path work |

## Subroutine Calls

| Site | Target | Note |
| --- | --- | --- |
| 0x014f4d | 0x007121 | writes two 16-bit words to port block 0x7020-0x7023 |
| 0x014f5d | 0x007151 | writes two 16-bit words to port block 0x7024-0x7027 |
| 0x014f69 | 0x007181 | writes two 16-bit words to port block 0x7028-0x702b |
| 0x014f75 | 0x0071b1 | writes two 16-bit words to port block 0x702c-0x702f |

## Why This Looks Like Setup, Not Teardown

0x014EF8 does all of the following before setting D14077=1:
- acknowledges interrupt-controller byte 0 with 0x08 at port 0x5008
- sets bit 3 in the interrupt enable mask at port 0x5004
- sets bit 3 in the latch-mode/control register at port 0x500C
- programs four adjacent 0x7020-0x702F register groups via 0x007121 / 0x007151 / 0x007181 / 0x0071B1
- sets bit 6 in port 0x7030
- latches the one-byte state flag D14077 to 1

The adjacent routine at 0x014E81 shows the opposite shape. Key lines from that sibling are:

```text
0x014e85: 3A 77 40 D1          LD A,(0xd14077) ; D14077 arm/init latch read
0x014e8c: 01 04 50 00          LD BC,0x005004
0x014e92: CB 9F                RES 3,A
0x014ea1: 3A 0E 44 D1          LD A,(0xd1440e) ; D1440E lock read
0x014ea9: 32 0E 44 D1          LD (0xd1440e),A ; D1440E lock write
0x014eaf: 32 0F 44 D1          LD (0xd1440f),A ; D1440F delivery status write
0x014ed7: 40 01 30 70          SIS LD BC,0x7030
0x014edd: E6 3F                AND 0x3f
0x014eed: 32 77 40 D1          LD (0xd14077),A ; D14077 arm/init latch write
```

That sibling:
- returns immediately if D14077 is already zero
- clears bit 3 on port 0x5004 (`RES 3,A`) instead of setting it
- clears D14077 back to zero
- clears D1440E and sets D1440F=1 when the lock/status path is active

Taken together, the ROM bytes point to this lifecycle:
- 0x014EF8 = hardware arm/setup
- 0x014E3F = notification installer wrapper that calls 0x014EF8 while managing D1440E/D1440F/D14408/D1440B
- 0x014E81 = disarm/teardown partner

*Generated by probe-phase412-trace-014EF8.mjs*
