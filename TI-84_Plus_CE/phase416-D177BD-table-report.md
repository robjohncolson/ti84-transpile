# Phase 416: D177BD 5-Entry Function Pointer Table Analysis

## 1. Caller Site Disassembly

Each caller loads IY from a table slot, then calls 0x002288 (JP (IY)).

### Caller 0: 0x010269 → slot D177BD
```
  0x01024B:  D1                   POP DE
  0x01024C:  4F                   LD C,A
  0x01024D:  06 00                LD B,0x00
  0x01024F:  C5                   PUSH BC
  0x010250:  CD F1 7C 00          CALL 0x007CF1
  0x010254:  C1                   POP BC
  0x010255:  AF                   XOR A,A
  0x010256:  32 D7 77 D1          LD (0xD177D7),A
  0x01025A:  2A BD 77 D1          LD HL,(0xD177BD)
  0x01025E:  CD C2 21 00          CALL 0x0021C2
  0x010262:  28 09                JR Z,0x01026D
  0x010264:  FD 2A BD 77 D1       LD IY,(0xD177BD)
  0x010269:  CD 88 22 00          CALL 0x002288  ◄◄◄ IY load
  0x01026D:  3A D6 77 D1          LD A,(0xD177D6)
  0x010271:  B7                   OR A,A
  0x010272:  CA F6 02 01          JP Z,0x0102F6
  0x010276:  3A D6 77 D1          LD A,(0xD177D6)
```

### Caller 1: 0x0102A4 → slot D177C0
```
  0x010286:  77                   LD (HL),A
  0x010287:  D1                   POP DE
  0x010288:  FD E5                PUSH IY
  0x01028A:  FD 21 80 00 D0       LD IY,0xD00080
  0x01028F:  FD CB 3F EE          SET 5,(IY+63)
  0x010293:  FD E1                POP IY
  0x010295:  2A C0 77 D1          LD HL,(0xD177C0)
  0x010299:  CD C2 21 00          CALL 0x0021C2
  0x01029D:  28 09                JR Z,0x0102A8
  0x01029F:  FD 2A C0 77 D1       LD IY,(0xD177C0)
  0x0102A4:  CD 88 22 00          CALL 0x002288  ◄◄◄ IY load
  0x0102A8:  3A D6 77 D1          LD A,(0xD177D6)
  0x0102AC:  E6 04                AND A,0x04
  0x0102AE:  28 1D                JR Z,0x0102CD
  0x0102B0:  3A D6 77 D1          LD A,(0xD177D6)
```

### Caller 2: 0x0102C9 → slot D177C3
```
  0x0102AB:  D1                   POP DE
  0x0102AC:  E6 04                AND A,0x04
  0x0102AE:  28 1D                JR Z,0x0102CD
  0x0102B0:  3A D6 77 D1          LD A,(0xD177D6)
  0x0102B4:  CB 97                RES 2,A
  0x0102B6:  32 D6 77 D1          LD (0xD177D6),A
  0x0102BA:  2A C3 77 D1          LD HL,(0xD177C3)
  0x0102BE:  CD C2 21 00          CALL 0x0021C2
  0x0102C2:  28 09                JR Z,0x0102CD
  0x0102C4:  FD 2A C3 77 D1       LD IY,(0xD177C3)
  0x0102C9:  CD 88 22 00          CALL 0x002288  ◄◄◄ IY load
  0x0102CD:  3A D6 77 D1          LD A,(0xD177D6)
  0x0102D1:  E6 08                AND A,0x08
  0x0102D3:  28 21                JR Z,0x0102F6
  0x0102D5:  3A D6 77 D1          LD A,(0xD177D6)
```

### Caller 3: 0x0102F2 → slot D177C6
```
  0x0102D4:  21 3A D6 77          LD HL,0x77D63A
  0x0102D8:  D1                   POP DE
  0x0102D9:  CB 9F                RES 3,A
  0x0102DB:  32 D6 77 D1          LD (0xD177D6),A
  0x0102DF:  CD 90 00 01          CALL 0x010090
  0x0102E3:  2A C6 77 D1          LD HL,(0xD177C6)
  0x0102E7:  CD C2 21 00          CALL 0x0021C2
  0x0102EB:  28 09                JR Z,0x0102F6
  0x0102ED:  FD 2A C6 77 D1       LD IY,(0xD177C6)
  0x0102F2:  CD 88 22 00          CALL 0x002288  ◄◄◄ IY load
  0x0102F6:  DD 7E FF             LD A,(IX-1)
  0x0102F9:  E6 02                AND A,0x02
  0x0102FB:  28 1C                JR Z,0x010319
  0x0102FD:  CD D3 7C 00          CALL 0x007CD3
```

### Caller 4: 0x010389 → slot D177C9
```
  0x01036B:  77                   LD (HL),A
  0x01036C:  D1                   POP DE
  0x01036D:  DD 7E FF             LD A,(IX-1)
  0x010370:  E6 10                AND A,0x10
  0x010372:  28 19                JR Z,0x01038D
  0x010374:  3E 01                LD A,0x01
  0x010376:  32 E1 77 D1          LD (0xD177E1),A
  0x01037A:  2A C9 77 D1          LD HL,(0xD177C9)
  0x01037E:  CD C2 21 00          CALL 0x0021C2
  0x010382:  28 09                JR Z,0x01038D
  0x010384:  FD 2A C9 77 D1       LD IY,(0xD177C9)
  0x010389:  CD 88 22 00          CALL 0x002288  ◄◄◄ IY load
  0x01038D:  CD C7 7D 00          CALL 0x007DC7
  0x010391:  DD 77 FF             LD (IX-1),A
  0x010394:  DD 4E FF             LD C,(IX-1)
  0x010397:  06 00                LD B,0x00
```

## 2. ROM References to Each Slot

### Slot D177BD (LE bytes: BD 77 D1)
Total refs: 5 | Reads: 2 | Writes: 2 | Unknown: 1

  0x01025B (instr @ 0x01025A): READ: LD HL,(D177BD)
  0x010266 (instr @ 0x010264): READ: LD IY,(D177BD)
  0x0106C3 (instr @ 0x0106C1): WRITE: LD (D177BD),BC
  0x010EF0 (instr @ 0x010EF0): unknown | context: 00 00 00 C5 01 BD 77 D1 C5 CD 3A 28
  0x010F15 (instr @ 0x010F13): WRITE: LD (D177BD),BC

### Slot D177C0 (LE bytes: C0 77 D1)
Total refs: 4 | Reads: 2 | Writes: 2 | Unknown: 0

  0x010296 (instr @ 0x010295): READ: LD HL,(D177C0)
  0x0102A1 (instr @ 0x01029F): READ: LD IY,(D177C0)
  0x0106CD (instr @ 0x0106CB): WRITE: LD (D177C0),BC
  0x010F1A (instr @ 0x010F18): WRITE: LD (D177C0),BC

### Slot D177C3 (LE bytes: C3 77 D1)
Total refs: 4 | Reads: 2 | Writes: 2 | Unknown: 0

  0x0102BB (instr @ 0x0102BA): READ: LD HL,(D177C3)
  0x0102C6 (instr @ 0x0102C4): READ: LD IY,(D177C3)
  0x0106D7 (instr @ 0x0106D5): WRITE: LD (D177C3),BC
  0x010F1F (instr @ 0x010F1D): WRITE: LD (D177C3),BC

### Slot D177C6 (LE bytes: C6 77 D1)
Total refs: 4 | Reads: 2 | Writes: 2 | Unknown: 0

  0x0102E4 (instr @ 0x0102E3): READ: LD HL,(D177C6)
  0x0102EF (instr @ 0x0102ED): READ: LD IY,(D177C6)
  0x0106E1 (instr @ 0x0106DF): WRITE: LD (D177C6),BC
  0x010F24 (instr @ 0x010F22): WRITE: LD (D177C6),BC

### Slot D177C9 (LE bytes: C9 77 D1)
Total refs: 4 | Reads: 2 | Writes: 2 | Unknown: 0

  0x01037B (instr @ 0x01037A): READ: LD HL,(D177C9)
  0x010386 (instr @ 0x010384): READ: LD IY,(D177C9)
  0x0106EB (instr @ 0x0106E9): WRITE: LD (D177C9),BC
  0x010F29 (instr @ 0x010F27): WRITE: LD (D177C9),BC

## 3. Write Site Context Disassembly

### D177BD: 2 write site(s)

#### Write at 0x0106C1: WRITE: LD (D177BD),BC
```
  0x0106A3:  CD 23 26 00          CALL 0x002623
  0x0106A7:  05                   DEC B
  0x0106A8:  00                   NOP
  0x0106A9:  01 00 00 BE          LD BC,0xBE0000
  0x0106AD:  06 01                LD B,0x01
  0x0106AF:  C8                   RET Z
  0x0106B0:  06 01                LD B,0x01
  0x0106B2:  D2 06 01 DC          JP NC,0xDC0106
  0x0106B6:  06 01                LD B,0x01
  0x0106B8:  E6 06                AND A,0x06
  0x0106BA:  01 EE 06 01          LD BC,0x0106EE
  0x0106BE:  DD 07                DD 07 ...
  0x0106C0:  09                   ADD HL,BC
  0x0106C1:  ED 43 BD 77 D1       LD (0xD177BD),BC  ◄◄◄ WRITE
  0x0106C6:  18 26                JR 0x0106EE
  0x0106C8:  DD 07                DD 07 ...
  0x0106CA:  09                   ADD HL,BC
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC
```

#### Write at 0x010F13: WRITE: LD (D177BD),BC
```
  0x010EF5:  3A 28 00 C1          LD A,(0xC10028)
  0x010EF9:  C1                   POP BC
  0x010EFA:  C1                   POP BC
  0x010EFB:  CD F5 0A 01          CALL 0x010AF5
  0x010EFF:  C9                   RET
  0x010F00:  CD 8A 21 00          CALL 0x00218A
  0x010F04:  CD F5 0A 01          CALL 0x010AF5
  0x010F08:  CD EF 7A 00          CALL 0x007AEF
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC  ◄◄◄ WRITE
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC
```

### D177C0: 2 write site(s)

#### Write at 0x0106CB: WRITE: LD (D177C0),BC
```
  0x0106AD:  06 01                LD B,0x01
  0x0106AF:  C8                   RET Z
  0x0106B0:  06 01                LD B,0x01
  0x0106B2:  D2 06 01 DC          JP NC,0xDC0106
  0x0106B6:  06 01                LD B,0x01
  0x0106B8:  E6 06                AND A,0x06
  0x0106BA:  01 EE 06 01          LD BC,0x0106EE
  0x0106BE:  DD 07                DD 07 ...
  0x0106C0:  09                   ADD HL,BC
  0x0106C1:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x0106C6:  18 26                JR 0x0106EE
  0x0106C8:  DD 07                DD 07 ...
  0x0106CA:  09                   ADD HL,BC
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC  ◄◄◄ WRITE
  0x0106D0:  18 1C                JR 0x0106EE
  0x0106D2:  DD 07                DD 07 ...
  0x0106D4:  09                   ADD HL,BC
  0x0106D5:  ED 43 C3 77 D1       LD (0xD177C3),BC
```

#### Write at 0x010F18: WRITE: LD (D177C0),BC
```
  0x010EFA:  C1                   POP BC
  0x010EFB:  CD F5 0A 01          CALL 0x010AF5
  0x010EFF:  C9                   RET
  0x010F00:  CD 8A 21 00          CALL 0x00218A
  0x010F04:  CD F5 0A 01          CALL 0x010AF5
  0x010F08:  CD EF 7A 00          CALL 0x007AEF
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC  ◄◄◄ WRITE
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x010F22:  ED 43 C6 77 D1       LD (0xD177C6),BC
```

### D177C3: 2 write site(s)

#### Write at 0x0106D5: WRITE: LD (D177C3),BC
```
  0x0106B7:  01 E6 06 01          LD BC,0x0106E6
  0x0106BB:  EE 06                XOR A,0x06
  0x0106BD:  01 DD 07 09          LD BC,0x0907DD
  0x0106C1:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x0106C6:  18 26                JR 0x0106EE
  0x0106C8:  DD 07                DD 07 ...
  0x0106CA:  09                   ADD HL,BC
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x0106D0:  18 1C                JR 0x0106EE
  0x0106D2:  DD 07                DD 07 ...
  0x0106D4:  09                   ADD HL,BC
  0x0106D5:  ED 43 C3 77 D1       LD (0xD177C3),BC  ◄◄◄ WRITE
  0x0106DA:  18 12                JR 0x0106EE
  0x0106DC:  DD 07                DD 07 ...
  0x0106DE:  09                   ADD HL,BC
  0x0106DF:  ED 43 C6 77 D1       LD (0xD177C6),BC
```

#### Write at 0x010F1D: WRITE: LD (D177C3),BC
```
  0x010EFF:  C9                   RET
  0x010F00:  CD 8A 21 00          CALL 0x00218A
  0x010F04:  CD F5 0A 01          CALL 0x010AF5
  0x010F08:  CD EF 7A 00          CALL 0x007AEF
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC  ◄◄◄ WRITE
  0x010F22:  ED 43 C6 77 D1       LD (0xD177C6),BC
  0x010F27:  ED 43 C9 77 D1       LD (0xD177C9),BC
```

### D177C6: 2 write site(s)

#### Write at 0x0106DF: WRITE: LD (D177C6),BC
```
  0x0106C1:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x0106C6:  18 26                JR 0x0106EE
  0x0106C8:  DD 07                DD 07 ...
  0x0106CA:  09                   ADD HL,BC
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x0106D0:  18 1C                JR 0x0106EE
  0x0106D2:  DD 07                DD 07 ...
  0x0106D4:  09                   ADD HL,BC
  0x0106D5:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x0106DA:  18 12                JR 0x0106EE
  0x0106DC:  DD 07                DD 07 ...
  0x0106DE:  09                   ADD HL,BC
  0x0106DF:  ED 43 C6 77 D1       LD (0xD177C6),BC  ◄◄◄ WRITE
  0x0106E4:  18 08                JR 0x0106EE
  0x0106E6:  DD 07                DD 07 ...
  0x0106E8:  09                   ADD HL,BC
  0x0106E9:  ED 43 C9 77 D1       LD (0xD177C9),BC
```

#### Write at 0x010F22: WRITE: LD (D177C6),BC
```
  0x010F04:  CD F5 0A 01          CALL 0x010AF5
  0x010F08:  CD EF 7A 00          CALL 0x007AEF
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x010F22:  ED 43 C6 77 D1       LD (0xD177C6),BC  ◄◄◄ WRITE
  0x010F27:  ED 43 C9 77 D1       LD (0xD177C9),BC
  0x010F2C:  3A BC 77 D1          LD A,(0xD177BC)
  0x010F30:  FE 01                CP A,0x01
```

### D177C9: 2 write site(s)

#### Write at 0x0106E9: WRITE: LD (D177C9),BC
```
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x0106D0:  18 1C                JR 0x0106EE
  0x0106D2:  DD 07                DD 07 ...
  0x0106D4:  09                   ADD HL,BC
  0x0106D5:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x0106DA:  18 12                JR 0x0106EE
  0x0106DC:  DD 07                DD 07 ...
  0x0106DE:  09                   ADD HL,BC
  0x0106DF:  ED 43 C6 77 D1       LD (0xD177C6),BC
  0x0106E4:  18 08                JR 0x0106EE
  0x0106E6:  DD 07                DD 07 ...
  0x0106E8:  09                   ADD HL,BC
  0x0106E9:  ED 43 C9 77 D1       LD (0xD177C9),BC  ◄◄◄ WRITE
  0x0106EE:  DD F9                LD SP,IX
  0x0106F0:  DD E1                POP IX
  0x0106F2:  C9                   RET
  0x0106F3:  CD 2D 7D 00          CALL 0x007D2D
  0x0106F7:  AF                   XOR A,A
```

#### Write at 0x010F27: WRITE: LD (D177C9),BC
```
  0x010F09:  EF                   RST 0x28
  0x010F0A:  7A                   LD A,D
  0x010F0B:  00                   NOP
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x010F22:  ED 43 C6 77 D1       LD (0xD177C6),BC
  0x010F27:  ED 43 C9 77 D1       LD (0xD177C9),BC  ◄◄◄ WRITE
  0x010F2C:  3A BC 77 D1          LD A,(0xD177BC)
  0x010F30:  FE 01                CP A,0x01
  0x010F32:  28 38                JR Z,0x010F6C
  0x010F34:  01 D0 07 00          LD BC,0x0007D0
```

## 4. Cross-Reference

### 4a. Dispatch table at 0x0120AA (disassembly of region)

Disassembly of 0x012090-0x0120D0:
```
  0x012090:  28 18                JR Z,0x0120AA
  0x012092:  3A B8 77 D1          LD A,(0xD177B8)
  0x012096:  FE FF                CP A,0xFF
  0x012098:  28 10                JR Z,0x0120AA
  0x01209A:  01 03 00 00          LD BC,0x000003
  0x01209E:  C5                   PUSH BC
  0x01209F:  01 06 00 00          LD BC,0x000006
  0x0120A3:  C5                   PUSH BC
  0x0120A4:  CD 3C 88 00          CALL 0x00883C
  0x0120A8:  C1                   POP BC
  0x0120A9:  C1                   POP BC
  0x0120AA:  DD 27                DD 27 ...
  0x0120AC:  F6 DD                OR A,0xDD
  0x0120AE:  5E                   LD E,(HL)
  0x0120AF:  F9                   DB F9
  0x0120B0:  3E 05                LD A,0x05
  0x0120B2:  CD 8F 23 00          CALL 0x00238F
  0x0120B6:  3A 8E 77 D1          LD A,(0xD1778E)
  0x0120BA:  ED 4B 8B 77 D1       LD BC,(0xD1778B)
  0x0120BF:  CD AD 23 00          CALL 0x0023AD
  0x0120C3:  30 0E                JR NC,0x0120D3
  0x0120C5:  01 07 00 00          LD BC,0x000007
  0x0120C9:  C5                   PUSH BC
  0x0120CA:  CD BF 36 01          CALL 0x0136BF
  0x0120CE:  C1                   POP BC
  0x0120CF:  C3 EA 21 01          JP 0x0121EA
```

Raw bytes at 0x0120AA (18 bytes): DD 27 F6 DD 5E F9 3E 05 CD 8F 23 00 3A 8E 77 D1 ED 4B

### 4b. Notification channels

  Ch1: 0xD1440E, 0xD1440F
    0xD1440E (0E 44 D1): 68 ROM refs
    0xD1440F (0F 44 D1): 53 ROM refs
  Ch2: 0xD17779, 0xD1777A
    0xD17779 (79 77 D1): 12 ROM refs
    0xD1777A (7A 77 D1): 3 ROM refs
  Ch3: 0xD176C9, 0xD176CA
    0xD176C9 (C9 76 D1): 30 ROM refs
    0xD176CA (CA 76 D1): 4 ROM refs

### 4c. Subroutine 0x0021C2 — the null-check gate

Every caller does: LD HL,(slot) → CALL 0x0021C2 → JR Z,skip → LD IY,(slot) → CALL 0x002288
0x0021C2 likely checks if HL == 0 (null pointer guard). Disassembly:
```
  0x0021C2:  E5                   PUSH HL
  0x0021C3:  D5                   PUSH DE
  0x0021C4:  11 00 00 00          LD DE,0x000000
  0x0021C8:  B7                   OR A,A
  0x0021C9:  ED 52                ED 52
  0x0021CB:  D1                   POP DE
  0x0021CC:  E1                   POP HL
  0x0021CD:  C9                   RET
  0x0021CE:  F5                   PUSH AF
  0x0021CF:  D5                   PUSH DE
  0x0021D0:  C5                   PUSH BC
  0x0021D1:  E5                   PUSH HL
  0x0021D2:  EB                   EX DE,HL
  0x0021D3:  B7                   OR A,A
  0x0021D4:  ED 62                ED 62
```

### 4d. Trampoline 0x002288 — JP (IY)
```
  0x002288:  FD E9                JP (IY)
  0x00228A:  D5                   PUSH DE
  0x00228B:  EB                   EX DE,HL
```

### 4e. Registrar function at 0x0106A3 area
The region 0x0106A3-0x0106F3 writes to individual slots — appears to be a registration function.
```
  0x0106A0:  DD 27                DD 27 ...
  0x0106A2:  06 CD                LD B,0xCD
  0x0106A4:  23                   INC HL
  0x0106A5:  26 00                LD H,0x00
  0x0106A7:  05                   DEC B
  0x0106A8:  00                   NOP
  0x0106A9:  01 00 00 BE          LD BC,0xBE0000
  0x0106AD:  06 01                LD B,0x01
  0x0106AF:  C8                   RET Z
  0x0106B0:  06 01                LD B,0x01
  0x0106B2:  D2 06 01 DC          JP NC,0xDC0106
  0x0106B6:  06 01                LD B,0x01
  0x0106B8:  E6 06                AND A,0x06
  0x0106BA:  01 EE 06 01          LD BC,0x0106EE
  0x0106BE:  DD 07                DD 07 ...
  0x0106C0:  09                   ADD HL,BC
  0x0106C1:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x0106C6:  18 26                JR 0x0106EE
  0x0106C8:  DD 07                DD 07 ...
  0x0106CA:  09                   ADD HL,BC
  0x0106CB:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x0106D0:  18 1C                JR 0x0106EE
  0x0106D2:  DD 07                DD 07 ...
  0x0106D4:  09                   ADD HL,BC
  0x0106D5:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x0106DA:  18 12                JR 0x0106EE
  0x0106DC:  DD 07                DD 07 ...
  0x0106DE:  09                   ADD HL,BC
  0x0106DF:  ED 43 C6 77 D1       LD (0xD177C6),BC
  0x0106E4:  18 08                JR 0x0106EE
  0x0106E6:  DD 07                DD 07 ...
  0x0106E8:  09                   ADD HL,BC
  0x0106E9:  ED 43 C9 77 D1       LD (0xD177C9),BC
  0x0106EE:  DD F9                LD SP,IX
  0x0106F0:  DD E1                POP IX
  0x0106F2:  C9                   RET
  0x0106F3:  CD 2D 7D 00          CALL 0x007D2D
```

### 4f. Teardown/clear function at 0x010F00 area
At 0x010F0F, LD BC,0x000000 then writes 0 to all 5 slots — clearing all callbacks.
```
  0x010EF0:  BD                   CP A,L
  0x010EF1:  77                   LD (HL),A
  0x010EF2:  D1                   POP DE
  0x010EF3:  C5                   PUSH BC
  0x010EF4:  CD 3A 28 00          CALL 0x00283A
  0x010EF8:  C1                   POP BC
  0x010EF9:  C1                   POP BC
  0x010EFA:  C1                   POP BC
  0x010EFB:  CD F5 0A 01          CALL 0x010AF5
  0x010EFF:  C9                   RET
  0x010F00:  CD 8A 21 00          CALL 0x00218A
  0x010F04:  CD F5 0A 01          CALL 0x010AF5
  0x010F08:  CD EF 7A 00          CALL 0x007AEF
  0x010F0C:  B7                   OR A,A
  0x010F0D:  20 F9                JR NZ,0x010F08
  0x010F0F:  01 00 00 00          LD BC,0x000000
  0x010F13:  ED 43 BD 77 D1       LD (0xD177BD),BC
  0x010F18:  ED 43 C0 77 D1       LD (0xD177C0),BC
  0x010F1D:  ED 43 C3 77 D1       LD (0xD177C3),BC
  0x010F22:  ED 43 C6 77 D1       LD (0xD177C6),BC
  0x010F27:  ED 43 C9 77 D1       LD (0xD177C9),BC
  0x010F2C:  3A BC 77 D1          LD A,(0xD177BC)
  0x010F30:  FE 01                CP A,0x01
  0x010F32:  28 38                JR Z,0x010F6C
  0x010F34:  01 D0 07 00          LD BC,0x0007D0
  0x010F38:  C5                   PUSH BC
  0x010F39:  CD 5C 09 01          CALL 0x01095C
  0x010F3D:  C1                   POP BC
  0x010F3E:  01 00 00 00          LD BC,0x000000
```

## 5. Table Structure Summary

```
Address    Slot   LE bytes      Caller PC    Reads  Writes
─────────  ─────  ────────────  ───────────  ─────  ──────
D177BD    0      BD 77 D1       0x010269         2       2
D177C0    1      C0 77 D1       0x0102A4         2       2
D177C3    2      C3 77 D1       0x0102C9         2       2
D177C6    3      C6 77 D1       0x0102F2         2       2
D177C9    4      C9 77 D1       0x010389         2       2
```
