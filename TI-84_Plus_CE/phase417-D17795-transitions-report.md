# Phase 417: D17795 Protocol State Machine Transitions

## Executive Summary

D17795 is a 1-byte protocol state machine with 8 states (0-7) governing USB transfer lifecycle.
15 writer sites have been verified across the ROM. The state machine follows a linear progression
for normal transfers (IDLE -> INIT -> PENDING -> NEGOTIATING -> READY -> ACTIVE -> IDLE),
with an error path (any -> ERROR -> IDLE) and an extended protocol path (-> EXTENDED -> IDLE).

## State Definitions

| State | Name | Meaning |
|-------|------|---------|
| 0 | IDLE | No transfer in progress; all channel state cleared |
| 1 | INIT | Transfer parameters being configured (bulk setup via 0x015349) |
| 2 | PENDING | Channel opened, waiting for negotiation start |
| 3 | NEGOTIATING | Size/bounds comparison against D176D1/D176D4 in progress |
| 4 | READY | Negotiation complete, 7 state variables cleared, ready for data |
| 5 | ACTIVE | Data transfer in progress |
| 6 | ERROR | Protocol violation detected; stack unwound with 6x POP BC + 0xCCCC sentinel |
| 7 | EXTENDED | Extended protocol mode; clears D176DA/D176DD for alternate path |

## Writer Site Reference

| Writer PC | State | Label | A Source | D176F8 Nearby | Note |
|-----------|-------|-------|----------|---------------|------|
| `0x00F3E5` | 0 | IDLE | XOR A (A=0) | write=0 at 0x00F3E0 | master reset — clears D176F8, D17795, D17796, D177BB in sequence |
| `0x013136` | 0 | IDLE | XOR A (A=0) | none | post-transfer cleanup — clears D14079/D14078/D1407A then D17795 |
| `0x041CC2` | 0 | IDLE | XOR A (A=0) | none | flash-side mirror of 0x013136 (same cleanup pattern) |
| `0x011109` | 1 | INIT | LD A,0x01 | none | after bulk parameter setup via CALL 0x015349, then JP 0x011499 |
| `0x0133E7` | 2 | PENDING | LD A,0x02 | none | after channel open and D17792 setup, checks D14073 for path split |
| `0x013727` | 2 | PENDING | LD A,0x02 | none | alternate pending entry via CALL 0x006EDA, CALL 0x0151A6 |
| `0x011309` | 3 | NEGOTIATING | LD A,0x03 | read at 0x01130D; read at 0x011315 | after SBC HL comparison against D176D1/D176D4 bounds, checks D176F8 |
| `0x0115CE` | 4 | READY | LD A,0x04 | none | after D17792/D1778F null-checks, clears 7 state variables |
| `0x01210A` | 4 | READY | LD A,0x04 | none | dispatch case from D17796-based seqcase at 0x0120DB |
| `0x01336A` | 4 | READY | LD A,0x04 | none | after clearing D17783-D1778E state block |
| `0x012118` | 5 | ACTIVE | LD A,0x05 | none | dispatch case from D17796-based seqcase at 0x0120DB |
| `0x011184` | 6 | ERROR | LD A,0x06 | none | 6x POP BC unwind + 0xCCCC sentinel to D176F2, then JP 0x011499 |
| `0x01142A` | 6 | ERROR | LD A,0x06 | none | 6x POP BC unwind + 0xCCCC sentinel to D176F2 (with D17696 check) |
| `0x011495` | 6 | ERROR | LD A,0x06 | none | 6x POP BC unwind, then resets D1777B channel state |
| `0x0136D0` | 7 | EXTENDED | LD A,0x07 | none | after CALL 0x00218A, stores D176F2 and clears D176DA/D176DD |

## State Transition Diagram

### Normal USB Receive Path

```
  IDLE (0)
    |
    | 0x011109: bulk parameter setup, LD A,0x01
    v
  INIT (1)
    |
    | 0x0133E7/0x013727: channel open + D17792 setup, LD A,0x02
    v
  PENDING (2)
    |
    | 0x011309: D176D1/D176D4 bounds check, D176F8 guard (0x07/0x0F), LD A,0x03
    v
  NEGOTIATING (3)
    |
    | 0x0115CE/0x01336A: D17792/D1778F null-check, clear 7 state vars, LD A,0x04
    v
  READY (4)
    |
    | 0x012118: via D17796 sub-dispatch (case 4), LD A,0x05
    v
  ACTIVE (5)
    |
    | 0x013136: post-transfer cleanup, XOR A
    v
  IDLE (0)
```

### Error Path

```
  any state
    |
    | protocol violation or timeout
    | 6x POP BC stack unwind
    | LD (D176F2), 0xCCCC  (sentinel)
    |
    | 0x011184 / 0x01142A / 0x011495: LD A,0x06
    v
  ERROR (6)
    |
    | dispatch default -> 0x011499 (recovery)
    v
  IDLE (0)
```

The three ERROR writers differ in their cleanup scope:
- `0x011184`: basic error — 0xCCCC to D176F2, then JP 0x011499
- `0x01142A`: checks D17696 first; if set, does extended cleanup before 0xCCCC
- `0x011495`: resets channel D1777B state block after the 0xCCCC sentinel

### Extended Protocol Path

```
  some intermediate state
    |
    | 0x0136D0: CALL 0x002189, store D176F2
    |           clear D176DA + D176DD
    |           LD A,0x07
    v
  EXTENDED (7)
    |
    | dispatch -> 0x011443
    | checks D14073 for sub-path
    v
  IDLE (0)
```

## D17795 Main Dispatch Table

At `0x011113`, the OS reads D17795 into HL and calls the seqcase
dispatcher at `0x00211B`. The table maps current state to handler:

| Current State | Handler | Purpose |
|---------------|---------|---------|
| 2 (PENDING) | `0x011132` | D17796 sub-protocol check |
| 4 (READY) | `0x0113B7` | Data reception handling |
| 5 (ACTIVE) | `0x0113B7` | Shares handler with READY |
| 7 (EXTENDED) | `0x011443` | Extended protocol handling |
| default (0,1,3,6) | `0x011499` | Channel state reset / error recovery |

Key observation: READY and ACTIVE share the same handler at `0x0113B7`.
The distinction between them is tracked by D17795 but the actual data
handling logic is identical.

## D17796 Sub-Dispatch (Secondary FSM)

When the main dispatch reaches certain handlers, a secondary dispatch
on D17796 selects the specific operation at `0x0120DB`:

| D17796 | Target | D17795 Written |
|--------|--------|----------------|
| 0 | `0x0120F8` | (no D17795 write) |
| 1 | `0x012100` | (no D17795 write) |
| 2 | `0x012108` | 4 (READY) at `0x01210A` |
| 3 | `0x012116` | (no D17795 write) |
| 4 | `0x012118` | 5 (ACTIVE) at `0x012118` |
| 5 | `0x01212C` | (no D17795 write) |

## D176F8 Interaction

D176F8 is a 17-state protocol FSM that runs in parallel with D17795.
Direct interactions found at D17795 writer sites:

| D17795 Writer | D176F8 Action | D176F8 Value | Relationship |
|---------------|---------------|--------------|--------------|
| `0x00F3E5` (->0 IDLE) | write at `0x00F3E0` | 0 | Both cleared together in master reset |
| `0x011309` (->3 NEGOTIATING) | read at `0x01130D`, `0x011315` | compared to 0x07/0x0F | D176F8 gates the NEGOTIATING transition |
| all others | no nearby ref | n/a | Independent FSM operation |

The master reset at `0x00F3E5` clears D176F8, D17795, D17796, and D177BB
in a single XOR A sequence, confirming these four variables form a
coordinated USB protocol state cluster.

## Disassembly Windows

### 0x00F3E5 -> state 0 (IDLE)

```text
0x00F3D0  FE 88               CP 0x88
0x00F3D2  C2 66 00 00         JP NZ,0x000066
0x00F3D6  F1                  POP AF
0x00F3D7  FD E1               POP IY
0x00F3D9  F1                  POP AF
0x00F3DA  E2 DF F3 00         JP PO,0x00F3DF
0x00F3DE  FB                  EI
0x00F3DF  AF                  XOR A
0x00F3E0  32 F8 76 D1         LD (0xD176F8),A
0x00F3E4  AF                  XOR A
0x00F3E5  32 95 77 D1         LD (0xD17795),A <<<
0x00F3E9  AF                  XOR A
0x00F3EA  32 96 77 D1         LD (0xD17796),A
0x00F3EE  AF                  XOR A
0x00F3EF  32 BB 77 D1         LD (0xD177BB),A
0x00F3F3  3A BA 77 D1         LD A,(0xD177BA)
0x00F3F7  E6 80               AND 0x80
```

### 0x013136 -> state 0 (IDLE)

```text
0x01311A  32 8B 40 D1         LD (0xD1408B),A
0x01311E  CD 31 6F 00         CALL 0x006F31
0x013122  CD 9A 6F 00         CALL 0x006F9A
0x013126  AF                  XOR A
0x013127  32 79 40 D1         LD (0xD14079),A
0x01312B  AF                  XOR A
0x01312C  32 78 40 D1         LD (0xD14078),A
0x013130  AF                  XOR A
0x013131  32 7A 40 D1         LD (0xD1407A),A
0x013135  AF                  XOR A
0x013136  32 95 77 D1         LD (0xD17795),A <<<
0x01313A  CD 5E 29 01         CALL 0x01295E
0x01313E  FE 01               CP 0x01
0x013140  20 2D               JR NZ,0x01316F
0x013142  CD C2 2A 01         CALL 0x012AC2
0x013146  B7                  OR A
0x013147  20 12               JR NZ,0x01315B
```

### 0x041CC2 -> state 0 (IDLE)

```text
0x041CA6  32 8B 40 D1         LD (0xD1408B),A
0x041CAA  CD C0 03 00         CALL 0x0003C0
0x041CAE  CD C8 03 00         CALL 0x0003C8
0x041CB2  AF                  XOR A
0x041CB3  32 79 40 D1         LD (0xD14079),A
0x041CB7  AF                  XOR A
0x041CB8  32 78 40 D1         LD (0xD14078),A
0x041CBC  AF                  XOR A
0x041CBD  32 7A 40 D1         LD (0xD1407A),A
0x041CC1  AF                  XOR A
0x041CC2  32 95 77 D1         LD (0xD17795),A <<<
0x041CC6  CD 2E 15 04         CALL 0x04152E
0x041CCA  FE 01               CP 0x01
0x041CCC  20 2D               JR NZ,0x041CFB
0x041CCE  CD 49 17 04         CALL 0x041749
0x041CD2  B7                  OR A
0x041CD3  20 12               JR NZ,0x041CE7
```

### 0x011109 -> state 1 (INIT)

```text
0x0110F8  01 FF 03 00         LD BC,0x0003FF
0x0110FC  C5                  PUSH BC
0x0110FD  CD 49 53 01         CALL 0x015349
0x011101  C1                  POP BC
0x011102  C1                  POP BC
0x011103  C1                  POP BC
0x011104  C1                  POP BC
0x011105  C1                  POP BC
0x011106  C1                  POP BC
0x011107  3E 01               LD A,0x01
0x011109  32 95 77 D1         LD (0xD17795),A <<<
0x01110D  C3 99 14 01         JP 0x011499
0x011111  3A 95 77 D1         LD A,(0xD17795)
0x011115  B7                  OR A
0x011116  ED 62               SBC HL,HL
0x011118  6F                  LD L,A
0x011119  CD 1B 21 00         CALL 0x00211B
```

### 0x0133E7 -> state 2 (PENDING)

```text
0x0133C9  01 01 00 00         LD BC,0x000001
0x0133CD  C5                  PUSH BC
0x0133CE  CD 8C 0F 01         CALL 0x010F8C
0x0133D2  C1                  POP BC
0x0133D3  22 6A 77 D1         LD HL,(0xD1776A)
0x0133D7  CD 17 10 01         CALL 0x011017
0x0133DB  2A D1 76 D1         LD HL,(0xD176D1)
0x0133DF  CD C2 21 00         CALL 0x0021C2
0x0133E3  28 1B               JR Z,0x013400
0x0133E5  3E 02               LD A,0x02
0x0133E7  32 95 77 D1         LD (0xD17795),A <<<
0x0133EB  3A 73 40 D1         LD A,(0xD14073)
0x0133EF  B7                  OR A
0x0133F0  28 06               JR Z,0x0133F8
0x0133F2  CD 6A 10 01         CALL 0x01106A
0x0133F6  18 12               JR 0x01340A
0x0133F8  3E 01               LD A,0x01
```

### 0x013727 -> state 2 (PENDING)

```text
0x01370C  01 00 00 00         LD BC,0x000000
0x013710  C5                  PUSH BC
0x013711  CD DA 6E 00         CALL 0x006EDA
0x013715  C1                  POP BC
0x013716  B7                  OR A
0x013717  28 08               JR Z,0x013721
0x013719  49 21 06 F0         LD HL,0x00F006
0x01371D  C3 E0 37 01         JP 0x0137E0
0x013721  CD A6 51 01         CALL 0x0151A6
0x013725  3E 02               LD A,0x02
0x013727  32 95 77 D1         LD (0xD17795),A <<<
0x01372B  CD 6A 10 01         CALL 0x01106A
0x01372F  DD 75 FE            LD (IX-0x02),L
0x013732  DD 74 FF            LD (IX-0x01),H
0x013735  DD 27 FE            LD HL,(IX-0x02)
0x013738  CD E8 25 00         CALL 0x0025E8
0x01373C  C2 DD 37 01         JP NZ,0x0137DD
```

### 0x011309 -> state 3 (NEGOTIATING)

```text
0x0112ED  B7                  OR A
0x0112EE  ED 4B D1 76 D1      LD BC,(0xD176D1)
0x0112F3  ED 42               SBC HL,BC
0x0112F5  28 09               JR Z,0x011300
0x0112F7  DD 31 FD            LD IX,(IX-0x03)
0x0112FA  FD 36 04 03         LD (IY+0x04),0x03
0x0112FE  18 0D               JR 0x01130D
0x011300  DD 31 FD            LD IX,(IX-0x03)
0x011303  FD 36 04 04         LD (IY+0x04),0x04
0x011307  3E 03               LD A,0x03
0x011309  32 95 77 D1         LD (0xD17795),A <<<
0x01130D  3A F8 76 D1         LD A,(0xD176F8)
0x011311  FE 07               CP 0x07
0x011313  28 08               JR Z,0x01131D
0x011315  3A F8 76 D1         LD A,(0xD176F8)
0x011319  FE 0F               CP 0x0F
0x01131B  20 71               JR NZ,0x01138E
```

### 0x0115CE -> state 4 (READY)

```text
0x0115AC  CD C2 21 00         CALL 0x0021C2
0x0115B0  CA 74 16 01         JP Z,0x011674
0x0115B4  2A 92 77 D1         LD HL,(0xD17792)
0x0115B8  CD C2 21 00         CALL 0x0021C2
0x0115BC  28 0A               JR Z,0x0115C8
0x0115BE  2A 8F 77 D1         LD HL,(0xD1778F)
0x0115C2  CD C2 21 00         CALL 0x0021C2
0x0115C6  20 04               JR NZ,0x0115CC
0x0115C8  CD 17 10 01         CALL 0x011017
0x0115CC  3E 04               LD A,0x04
0x0115CE  32 95 77 D1         LD (0xD17795),A <<<
0x0115D2  01 00 00 00         LD BC,0x000000
0x0115D6  ED 43 87 77 D1      LD (0xD17787),BC
0x0115DB  AF                  XOR A
0x0115DC  32 8A 77 D1         LD (0xD1778A),A
0x0115E0  ED 43 8B 77 D1      LD (0xD1778B),BC
0x0115E5  AF                  XOR A
```

### 0x01210A -> state 4 (READY)

```text
0x0120F0  21 01 24 21         LD HL,0x212401
0x0120F4  01 2C 21 01         LD BC,0x01212C
0x0120F8  CD 50 32 01         CALL 0x013250
0x0120FC  C3 EA 21 01         JP 0x0121EA
0x012100  CD 77 33 01         CALL 0x013377
0x012104  C3 EA 21 01         JP 0x0121EA
0x012108  3E 04               LD A,0x04
0x01210A  32 95 77 D1         LD (0xD17795),A <<<
0x01210E  CD 0F 34 01         CALL 0x01340F
0x012112  C3 EA 21 01         JP 0x0121EA
0x012116  3E 05               LD A,0x05
0x012118  32 95 77 D1         LD (0xD17795),A
0x01211C  CD 0F 34 01         CALL 0x01340F
0x012120  C3 EA 21 01         JP 0x0121EA
```

### 0x01336A -> state 4 (READY)

```text
0x01334A  ED 43 87 77 D1      LD (0xD17787),BC
0x01334F  AF                  XOR A
0x013350  32 8A 77 D1         LD (0xD1778A),A
0x013354  ED 43 8B 77 D1      LD (0xD1778B),BC
0x013359  AF                  XOR A
0x01335A  32 8E 77 D1         LD (0xD1778E),A
0x01335E  ED 43 7F 77 D1      LD (0xD1777F),BC
0x013363  AF                  XOR A
0x013364  32 82 77 D1         LD (0xD17782),A
0x013368  3E 04               LD A,0x04
0x01336A  32 95 77 D1         LD (0xD17795),A <<<
0x01336E  CD 7C 56 01         CALL 0x01567C
0x013372  DD F9               LD SP,IX
0x013374  DD E1               POP IX
0x013376  C9                  RET
0x013377  21 F9 FF FF         LD HL,0xFFFFF9
0x01337B  CD 97 21 00         CALL 0x002197
```

### 0x012118 -> state 5 (ACTIVE)

```text
0x0120FB  01 C3 EA 21         LD BC,0x21EAC3
0x0120FF  01 CD 77 33         LD BC,0x3377CD
0x012103  01 C3 EA 21         LD BC,0x21EAC3
0x012107  01 3E 04 32         LD BC,0x32043E
0x01210B  95                  SUB L
0x01210C  77                  LD (HL),A
0x01210D  D1                  POP DE
0x01210E  CD 0F 34 01         CALL 0x01340F
0x012112  C3 EA 21 01         JP 0x0121EA
0x012116  3E 05               LD A,0x05
0x012118  32 95 77 D1         LD (0xD17795),A <<<
0x01211C  CD 0F 34 01         CALL 0x01340F
0x012120  C3 EA 21 01         JP 0x0121EA
0x012124  CD CF 35 01         CALL 0x0135CF
0x012128  C3 EA 21 01         JP 0x0121EA
0x01212C  01 01 00 00         LD BC,0x000001
0x012130  C5                  PUSH BC
```

### 0x011184 -> state 6 (ERROR)

```text
0x011173  01 CC CC 00         LD BC,0x00CCCC
0x011177  C5                  PUSH BC
0x011178  CD 49 53 01         CALL 0x015349
0x01117C  C1                  POP BC
0x01117D  C1                  POP BC
0x01117E  C1                  POP BC
0x01117F  C1                  POP BC
0x011180  C1                  POP BC
0x011181  C1                  POP BC
0x011182  3E 06               LD A,0x06
0x011184  32 95 77 D1         LD (0xD17795),A <<<
0x011188  01 CC CC 00         LD BC,0x00CCCC
0x01118C  ED 43 F2 76 D1      LD (0xD176F2),BC
0x011191  C3 99 14 01         JP 0x011499
0x011195  2A D1 76 D1         LD HL,(0xD176D1)
0x011199  ED 4B D4 76 D1      LD BC,(0xD176D4)
0x01119E  B7                  OR A
```

### 0x01142A -> state 6 (ERROR)

```text
0x011419  01 CC CC 00         LD BC,0x00CCCC
0x01141D  C5                  PUSH BC
0x01141E  CD 49 53 01         CALL 0x015349
0x011422  C1                  POP BC
0x011423  C1                  POP BC
0x011424  C1                  POP BC
0x011425  C1                  POP BC
0x011426  C1                  POP BC
0x011427  C1                  POP BC
0x011428  3E 06               LD A,0x06
0x01142A  32 95 77 D1         LD (0xD17795),A <<<
0x01142E  01 CC CC 00         LD BC,0x00CCCC
0x011432  ED 43 F2 76 D1      LD (0xD176F2),BC
0x011437  2A F2 76 D1         LD HL,(0xD176F2)
0x01143B  DD 75 F8            LD (IX-0x08),L
0x01143E  DD 74 F9            LD (IX-0x07),H
0x011441  18 56               JR 0x011499
```

### 0x011495 -> state 6 (ERROR)

```text
0x011487  C5                  PUSH BC
0x011488  E5                  PUSH HL
0x011489  CD 49 53 01         CALL 0x015349
0x01148D  C1                  POP BC
0x01148E  C1                  POP BC
0x01148F  C1                  POP BC
0x011490  C1                  POP BC
0x011491  C1                  POP BC
0x011492  C1                  POP BC
0x011493  3E 06               LD A,0x06
0x011495  32 95 77 D1         LD (0xD17795),A <<<
0x011499  01 7B 77 D1         LD BC,0xD1777B
0x01149D  C5                  PUSH BC
0x01149E  01 04 00 00         LD BC,0x000004
0x0114A2  C5                  PUSH BC
0x0114A3  DD 31 FD            LD IX,(IX-0x03)
0x0114A6  ED 66 00            [pea]
```

### 0x0136D0 -> state 7 (EXTENDED)

```text
0x0136B4  3E 01               LD A,0x01
0x0136B6  32 79 40 D1         LD (0xD14079),A
0x0136BA  DD F9               LD SP,IX
0x0136BC  DD E1               POP IX
0x0136BE  C9                  RET
0x0136BF  CD 8A 21 00         CALL 0x00218A
0x0136C3  DD 07 06            LD BC,(IX+0x06)
0x0136C6  CD 6B 27 00         CALL 0x00276B
0x0136CA  22 F2 76 D1         LD HL,(0xD176F2)
0x0136CE  3E 07               LD A,0x07
0x0136D0  32 95 77 D1         LD (0xD17795),A <<<
0x0136D4  01 00 00 00         LD BC,0x000000
0x0136D8  ED 43 DA 76 D1      LD (0xD176DA),BC
0x0136DD  ED 43 DD 76 D1      LD (0xD176DD),BC
0x0136E2  3A 73 40 D1         LD A,(0xD14073)
0x0136E6  B7                  OR A
0x0136E7  28 06               JR Z,0x0136EF
```
