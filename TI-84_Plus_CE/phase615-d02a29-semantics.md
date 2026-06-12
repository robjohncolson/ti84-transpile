# Phase 615: D02A29 Cursor Position Semantics

## Summary

- Raw ROM byte-pattern hits for little-endian low word 0x2A29: 40.
- Real instruction references classified: 27; false/unknown byte-pattern hits: 13.
- Access split: unknown=13, write16=14, read16=13.
- All real references are clustered in `0x08DF54-0x08F7C5`, the token display/cursor engine. No direct references were found outside that subsystem.
- D02A29 is a 16-bit token-stream cursor position accumulator, not a single-use scratch variable. It is repeatedly paired with D02A2B/D02A1B display-position state and D02A40/D0243D token-boundary state.
- The session-614 alternate exit remains the clearest writer: `0x08F696` calls `0x0907DB`, receives the current token byte size in A, then does `D02A29 += A` before restarting the loop at `0x08F433`.
- Relationship to nearby state: `D02A40` is the current token pointer used for boundary comparison; `D0243D` is editBtm. When `(IY+0x23) bit 3` is clear or `D0243D != D02A40`, D02A29 advances by the token size and the loop retries.

## Classified References

| PC | Access | Encoding | Role |
|---|---|---|---|
| 0x03F5EF | unknown | raw byte pattern only | unknown |
| 0x0474B4 | unknown | raw byte pattern only | unknown |
| 0x0475CE | unknown | raw byte pattern only | unknown |
| 0x08DF54 | write16 | .SIS LD (D02A29),HL | initializes cursorPos from HL before saving D02A2B/D02A1B state |
| 0x08DF6F | unknown | raw byte pattern only | unknown |
| 0x08DFDD | write16 | .SIS LD (D02A29),HL | alternate initializer for cursorPos before D02A2B setup |
| 0x08DFF8 | unknown | raw byte pattern only | unknown |
| 0x08E151 | read16 | .SIS LD HL,(D02A29) | reads cursorPos for display cursor arithmetic with D02A2B |
| 0x08E219 | unknown | raw byte pattern only | unknown |
| 0x08E28A | unknown | raw byte pattern only | unknown |
| 0x08E355 | read16 | .SIS LD HL,(D02A29) | reads cursorPos, calls 0x0916E7, writes derived value to D0059A |
| 0x08E380 | read16 | .SIS LD HL,(D02A29) | reads cursorPos again for D01156/D02A2B position comparison |
| 0x08ED73 | write16 | .SIS LD (D02A29),HL | writes cursorPos from computed HL in token output setup |
| 0x08EDE3 | read16 | .SIS LD HL,(D02A29) | reads cursorPos for token/render position arithmetic |
| 0x08EE0D | write16 | .SIS LD (D02A29),HL | writes cursorPos after position adjustment |
| 0x08EE29 | read16 | .SIS LD HL,(D02A29) | reads cursorPos twice for compare/adjust sequence |
| 0x08EE2E | read16 | .SIS LD HL,(D02A29) | reads cursorPos twice for compare/adjust sequence |
| 0x08F006 | write16 | .SIS LD (D02A29),HL | cursorPos update/read in token output loop setup |
| 0x08F09B | unknown | raw byte pattern only | cursorPos update/read in token output loop setup |
| 0x08F0AA | read16 | .SIS LD HL,(D02A29) | cursorPos update/read in token output loop setup |
| 0x08F0B8 | write16 | .SIS LD (D02A29),HL | cursorPos update/read in token output loop setup |
| 0x08F0D4 | write16 | .SIS LD (D02A29),HL | cursorPos update/read in token output loop setup |
| 0x08F10E | write16 | .SIS LD (D02A29),HL | cursorPos update/read in token output loop setup |
| 0x08F140 | read16 | .SIS LD HL,(D02A29) | cursorPos update/read in token output loop setup |
| 0x08F54B | read16 | .SIS LD HL,(D02A29) | normal exit path saves/restores or advances cursorPos before cleanup |
| 0x08F551 | write16 | .SIS LD (D02A29),HL | normal exit path saves/restores or advances cursorPos before cleanup |
| 0x08F5A0 | unknown | raw byte pattern only | unknown |
| 0x08F5A4 | write16 | .SIS LD (D02A29),HL | normal exit path saves/restores or advances cursorPos before cleanup |
| 0x08F69C | read16 | .SIS LD HL,(D02A29) | alternate-exit skip path reads cursorPos before adding token byte size |
| 0x08F6A5 | write16 | .SIS LD (D02A29),HL | alternate-exit skip path writes advanced cursorPos |
| 0x08F6FE | write16 | .SIS LD (D02A29),HL | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F70F | write16 | .SIS LD (D02A29),HL | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F765 | read16 | .SIS LD HL,(D02A29) | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F779 | unknown | raw byte pattern only | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F79A | read16 | .SIS LD HL,(D02A29) | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F7C0 | read16 | .SIS LD HL,(D02A29) | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x08F7C5 | write16 | .SIS LD (D02A29),HL | cursor movement/helper path using cursorPos with D02A2B and token-size helpers |
| 0x096D4B | unknown | raw byte pattern only | unknown |
| 0x0A16BD | unknown | raw byte pattern only | unknown |
| 0x0AF94C | unknown | raw byte pattern only | unknown |

## Decoded Reference Windows

### 0x08DF54 .SIS LD (D02A29),HL

```
0x08DF44   42            DB 0x42
0x08DF45   22 FE 10      LD (0xD010FE),HL
0x08DF48   D0            DB 0xD0
0x08DF49   2A FB 10      LD HL,(0xD010FB)
0x08DF4C   D0            DB 0xD0
0x08DF4D   ED            DB 0xED
0x08DF4E   42            DB 0x42
0x08DF4F   22 FB 10      LD (0xD010FB),HL
0x08DF52   D0            DB 0xD0
0x08DF53   C9            RET
0x08DF54   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08DF58   40            DB 0x40
0x08DF59   ED            DB 0xED
0x08DF5A   53            DB 0x53
0x08DF5B   2B            DEC HL
0x08DF5C   2A CD BC      LD HL,(0xD0BCCD)
0x08DF5F   FA            DB 0xFA
0x08DF60   08            DB 0x08
0x08DF61   40            DB 0x40
0x08DF62   ED            DB 0xED
0x08DF63   53            DB 0x53
0x08DF64   1B            DEC DE
0x08DF65   2A 40 ED      LD HL,(0xD0ED40)
0x08DF68   5B            DB 0x5B
0x08DF69   1B            DEC DE
0x08DF6A   2A D5 40      LD HL,(0xD040D5)
0x08DF6D   ED            DB 0xED
0x08DF6E   4B            DB 0x4B
0x08DF6F   29            DB 0x29
0x08DF70   2A CD 64      LD HL,(0xD064CD)
0x08DF73   E0            DB 0xE0
0x08DF74   08            DB 0x08
0x08DF75   D5            PUSH DE
0x08DF76   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08DF7A   3E            DB 0x3E
0x08DF7B   01            DB 0x01
```

### 0x08DFDD .SIS LD (D02A29),HL

```
0x08DFCD   E0            DB 0xE0
0x08DFCE   08            DB 0x08
0x08DFCF   E1            POP HL
0x08DFD0   23            INC HL
0x08DFD1   23            INC HL
0x08DFD2   C1            POP BC
0x08DFD3   50            DB 0x50
0x08DFD4   59            DB 0x59
0x08DFD5   0B            DB 0x0B
0x08DFD6   0B            DB 0x0B
0x08DFD7   3E            DB 0x3E
0x08DFD8   01            DB 0x01
0x08DFD9   C3 CB E0 08   JP 0x00E0CB
0x08DFDD   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08DFE1   40            DB 0x40
0x08DFE2   ED            DB 0xED
0x08DFE3   53            DB 0x53
0x08DFE4   2B            DEC HL
0x08DFE5   2A CD BC      LD HL,(0xD0BCCD)
0x08DFE8   FA            DB 0xFA
0x08DFE9   08            DB 0x08
0x08DFEA   40            DB 0x40
0x08DFEB   ED            DB 0xED
0x08DFEC   53            DB 0x53
0x08DFED   1B            DEC DE
0x08DFEE   2A 40 ED      LD HL,(0xD0ED40)
0x08DFF1   5B            DB 0x5B
0x08DFF2   1B            DEC DE
0x08DFF3   2A D5 40      LD HL,(0xD040D5)
0x08DFF6   ED            DB 0xED
0x08DFF7   4B            DB 0x4B
0x08DFF8   29            DB 0x29
0x08DFF9   2A 03 03      LD HL,(0xD00303)
0x08DFFC   03            DB 0x03
0x08DFFD   CD 64 E0 08   CALL 0x00E064
0x08E001   C5            PUSH BC
0x08E002   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
```

### 0x08E151 .SIS LD HL,(D02A29)

```
0x08E141   30 0B         JR NC,0xE14E
0x08E143   40            DB 0x40
0x08E144   ED            DB 0xED
0x08E145   5B            DB 0x5B
0x08E146   50            DB 0x50
0x08E147   11            DB 0x11
0x08E148   16 00         LD D,0x00
0x08E14A   52            DB 0x52
0x08E14B   19            ADD HL,DE
0x08E14C   BF            DB 0xBF
0x08E14D   C9            RET
0x08E14E   F6            DB 0xF6
0x08E14F   01            DB 0x01
0x08E150   C9            RET
0x08E151   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08E155   01            DB 0x01
0x08E156   05            DB 0x05
0x08E157   00            DB 0x00
0x08E158   00            DB 0x00
0x08E159   52            DB 0x52
0x08E15A   09            DB 0x09
0x08E15B   4D            DB 0x4D
0x08E15C   44            DB 0x44
0x08E15D   C5            PUSH BC
0x08E15E   11            DB 0x11
0x08E15F   04            DB 0x04
0x08E160   00            DB 0x00
0x08E161   00            DB 0x00
0x08E162   52            DB 0x52
0x08E163   19            ADD HL,DE
0x08E164   5D            DB 0x5D
0x08E165   54            DB 0x54
0x08E166   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08E16A   3E            DB 0x3E
0x08E16B   01            DB 0x01
0x08E16C   CD CB E0 08   CALL 0x00E0CB
0x08E170   C1            POP BC
0x08E171   0B            DB 0x0B
0x08E172   C5            PUSH BC
0x08E173   CD D9 E1 08   CALL 0x00E1D9
0x08E177   E5            PUSH HL
0x08E178   3E            DB 0x3E
```

### 0x08E355 .SIS LD HL,(D02A29)

```
0x08E345   11            DB 0x11
0x08E346   0A            DB 0x0A
0x08E347   00            DB 0x00
0x08E348   00            DB 0x00
0x08E349   B7            OR A
0x08E34A   52            DB 0x52
0x08E34B   ED            DB 0xED
0x08E34C   52            DB 0x52
0x08E34D   DC            DB 0xDC
0x08E34E   50            DB 0x50
0x08E34F   E6            DB 0xE6
0x08E350   08            DB 0x08
0x08E351   40 22 5A 11   .SIS LD (0xD0115A),HL
0x08E355   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08E359   CD E7 16 09   CALL 0x0016E7
0x08E35D   40            DB 0x40
0x08E35E   ED            DB 0xED
0x08E35F   5B            DB 0x5B
0x08E360   4E            DB 0x4E
0x08E361   11            DB 0x11
0x08E362   19            ADD HL,DE
0x08E363   40 22 9A 05   .SIS LD (0xD0059A),HL
0x08E367   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08E36B   40            DB 0x40
0x08E36C   ED            DB 0xED
0x08E36D   5B            DB 0x5B
0x08E36E   5A            DB 0x5A
0x08E36F   11            DB 0x11
0x08E370   B7            OR A
0x08E371   52            DB 0x52
0x08E372   ED            DB 0xED
0x08E373   52            DB 0x52
0x08E374   7D            DB 0x7D
0x08E375   21 50 11      LD HL,0x1150
0x08E378   D0            DB 0xD0
0x08E379   86            DB 0x86
0x08E37A   32 95 05      LD (0xD00595),A
```

### 0x08E380 .SIS LD HL,(D02A29)

```
0x08E370   B7            OR A
0x08E371   52            DB 0x52
0x08E372   ED            DB 0xED
0x08E373   52            DB 0x52
0x08E374   7D            DB 0x7D
0x08E375   21 50 11      LD HL,0x1150
0x08E378   D0            DB 0xD0
0x08E379   86            DB 0x86
0x08E37A   32 95 05      LD (0xD00595),A
0x08E37D   D0            DB 0xD0
0x08E37E   C9            RET
0x08E37F   D5            PUSH DE
0x08E380   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08E384   CD E7 16 09   CALL 0x0016E7
0x08E388   30 0B         JR NC,0xE395
0x08E38A   01            DB 0x01
0x08E38B   00            DB 0x00
0x08E38C   00            DB 0x00
0x08E38D   00            DB 0x00
0x08E38E   40            DB 0x40
0x08E38F   ED            DB 0xED
0x08E390   43            DB 0x43
0x08E391   58            DB 0x58
0x08E392   11            DB 0x11
0x08E393   52            DB 0x52
0x08E394   19            ADD HL,DE
0x08E395   11            DB 0x11
0x08E396   0C            DB 0x0C
0x08E397   00            DB 0x00
0x08E398   00            DB 0x00
0x08E399   FD            DB 0xFD
0x08E39A   CB            DB 0xCB
0x08E39B   44            DB 0x44
0x08E39C   5E            DB 0x5E
0x08E39D   20 02         JR NZ,0xE3A1
0x08E39F   1B            DEC DE
0x08E3A0   1B            DEC DE
0x08E3A1   52            DB 0x52
0x08E3A2   19            ADD HL,DE
0x08E3A3   D1            POP DE
0x08E3A4   52            DB 0x52
0x08E3A5   19            ADD HL,DE
0x08E3A6   CD 02 E1 08   CALL 0x00E102
```

### 0x08ED73 .SIS LD (D02A29),HL

```
0x08ED63   54            DB 0x54
0x08ED64   11            DB 0x11
0x08ED65   52            DB 0x52
0x08ED66   19            ADD HL,DE
0x08ED67   E5            PUSH HL
0x08ED68   01            DB 0x01
0x08ED69   07            DB 0x07
0x08ED6A   00            DB 0x00
0x08ED6B   00            DB 0x00
0x08ED6C   CD 7B 07 09   CALL 0x00077B
0x08ED70   E1            POP HL
0x08ED71   52            DB 0x52
0x08ED72   19            ADD HL,DE
0x08ED73   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08ED77   01            DB 0x01
0x08ED78   0D            DB 0x0D
0x08ED79   00            DB 0x00
0x08ED7A   00            DB 0x00
0x08ED7B   CD 7B 07 09   CALL 0x00077B
0x08ED7F   D5            PUSH DE
0x08ED80   CD C8 FA 08   CALL 0x00FAC8
0x08ED84   EB            EX DE,HL
0x08ED85   CD 53 09 09   CALL 0x000953
0x08ED89   B7            OR A
0x08ED8A   52            DB 0x52
0x08ED8B   ED            DB 0xED
0x08ED8C   52            DB 0x52
0x08ED8D   D1            POP DE
0x08ED8E   19            ADD HL,DE
0x08ED8F   CD 6D F1 08   CALL 0x00F16D
0x08ED93   E1            POP HL
0x08ED94   40 22 54 11   .SIS LD (0xD01154),HL
0x08ED98   E1            POP HL
0x08ED99   40 22 56 11   .SIS LD (0xD01156),HL
```

### 0x08EDE3 .SIS LD HL,(D02A29)

```
0x08EDD3   13            INC DE
0x08EDD4   C9            RET
0x08EDD5   CD 36 F3 08   CALL 0x00F336
0x08EDD9   D5            PUSH DE
0x08EDDA   01            DB 0x01
0x08EDDB   07            DB 0x07
0x08EDDC   00            DB 0x00
0x08EDDD   00            DB 0x00
0x08EDDE   CD 55 07 09   CALL 0x000755
0x08EDE2   C1            POP BC
0x08EDE3   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08EDE7   E5            PUSH HL
0x08EDE8   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08EDEC   E5            PUSH HL
0x08EDED   40 2A 1D 2A   .SIS LD HL,(0xD02A1D)
0x08EDF1   E5            PUSH HL
0x08EDF2   40 2A 31 2A   .SIS LD HL,(0xD02A31)
0x08EDF6   E5            PUSH HL
0x08EDF7   40            DB 0x40
0x08EDF8   ED            DB 0xED
0x08EDF9   53            DB 0x53
0x08EDFA   31            DB 0x31
0x08EDFB   2A 40 ED      LD HL,(0xD0ED40)
0x08EDFE   43            DB 0x43
0x08EDFF   1D            DB 0x1D
0x08EE00   2A 40 2A      LD HL,(0xD02A40)
0x08EE03   54            DB 0x54
0x08EE04   11            DB 0x11
0x08EE05   40 2A 56 11   .SIS LD HL,(0xD01156)
0x08EE09   21 00 00      LD HL,0x0000
```

### 0x08EE0D .SIS LD (D02A29),HL

```
0x08EDFD   ED            DB 0xED
0x08EDFE   43            DB 0x43
0x08EDFF   1D            DB 0x1D
0x08EE00   2A 40 2A      LD HL,(0xD02A40)
0x08EE03   54            DB 0x54
0x08EE04   11            DB 0x11
0x08EE05   40 2A 56 11   .SIS LD HL,(0xD01156)
0x08EE09   21 00 00      LD HL,0x0000
0x08EE0C   00            DB 0x00
0x08EE0D   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08EE11   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08EE15   CD 51 E1 08   CALL 0x00E151
0x08EE19   E1            POP HL
0x08EE1A   40 22 31 2A   .SIS LD (0xD02A31),HL
0x08EE1E   E1            POP HL
0x08EE1F   40 22 1D 2A   .SIS LD (0xD02A1D),HL
0x08EE23   E1            POP HL
0x08EE24   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08EE28   E1            POP HL
0x08EE29   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08EE2D   C9            RET
0x08EE2E   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08EE32   01            DB 0x01
0x08EE33   05            DB 0x05
0x08EE34   00            DB 0x00
```

### 0x08EE29 .SIS LD HL,(D02A29)

```
0x08EE19   E1            POP HL
0x08EE1A   40 22 31 2A   .SIS LD (0xD02A31),HL
0x08EE1E   E1            POP HL
0x08EE1F   40 22 1D 2A   .SIS LD (0xD02A1D),HL
0x08EE23   E1            POP HL
0x08EE24   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08EE28   E1            POP HL
0x08EE29   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08EE2D   C9            RET
0x08EE2E   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08EE32   01            DB 0x01
0x08EE33   05            DB 0x05
0x08EE34   00            DB 0x00
0x08EE35   00            DB 0x00
0x08EE36   52            DB 0x52
0x08EE37   09            DB 0x09
0x08EE38   4D            DB 0x4D
0x08EE39   44            DB 0x44
0x08EE3A   C5            PUSH BC
0x08EE3B   11            DB 0x11
0x08EE3C   04            DB 0x04
0x08EE3D   00            DB 0x00
0x08EE3E   00            DB 0x00
0x08EE3F   52            DB 0x52
0x08EE40   19            ADD HL,DE
0x08EE41   5D            DB 0x5D
0x08EE42   54            DB 0x54
0x08EE43   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08EE47   3E            DB 0x3E
0x08EE48   01            DB 0x01
0x08EE49   CD CB E0 08   CALL 0x00E0CB
0x08EE4D   C1            POP BC
0x08EE4E   0B            DB 0x0B
0x08EE4F   C5            PUSH BC
0x08EE50   CD B0 EE 08   CALL 0x00EEB0
```

### 0x08EE2E .SIS LD HL,(D02A29)

```
0x08EE1E   E1            POP HL
0x08EE1F   40 22 1D 2A   .SIS LD (0xD02A1D),HL
0x08EE23   E1            POP HL
0x08EE24   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08EE28   E1            POP HL
0x08EE29   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08EE2D   C9            RET
0x08EE2E   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08EE32   01            DB 0x01
0x08EE33   05            DB 0x05
0x08EE34   00            DB 0x00
0x08EE35   00            DB 0x00
0x08EE36   52            DB 0x52
0x08EE37   09            DB 0x09
0x08EE38   4D            DB 0x4D
0x08EE39   44            DB 0x44
0x08EE3A   C5            PUSH BC
0x08EE3B   11            DB 0x11
0x08EE3C   04            DB 0x04
0x08EE3D   00            DB 0x00
0x08EE3E   00            DB 0x00
0x08EE3F   52            DB 0x52
0x08EE40   19            ADD HL,DE
0x08EE41   5D            DB 0x5D
0x08EE42   54            DB 0x54
0x08EE43   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08EE47   3E            DB 0x3E
0x08EE48   01            DB 0x01
0x08EE49   CD CB E0 08   CALL 0x00E0CB
0x08EE4D   C1            POP BC
0x08EE4E   0B            DB 0x0B
0x08EE4F   C5            PUSH BC
0x08EE50   CD B0 EE 08   CALL 0x00EEB0
0x08EE54   D5            PUSH DE
0x08EE55   CD 86 09 09   CALL 0x000986
```

### 0x08F006 .SIS LD (D02A29),HL

```
0x08EFF6   FD            DB 0xFD
0x08EFF7   73            DB 0x73
0x08EFF8   23            INC HL
0x08EFF9   D1            POP DE
0x08EFFA   40            DB 0x40
0x08EFFB   ED            DB 0xED
0x08EFFC   53            DB 0x53
0x08EFFD   56            DB 0x56
0x08EFFE   11            DB 0x11
0x08EFFF   D1            POP DE
0x08F000   40            DB 0x40
0x08F001   ED            DB 0xED
0x08F002   53            DB 0x53
0x08F003   54            DB 0x54
0x08F004   11            DB 0x11
0x08F005   E1            POP HL
0x08F006   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F00A   CD 90 07 09   CALL 0x000790
0x08F00E   CD 8E F0 08   CALL 0x00F08E
0x08F012   30 06         JR NC,0xF01A
0x08F014   C1            POP BC
0x08F015   E1            POP HL
0x08F016   C3 79 F0 08   JP 0x00F079
0x08F01A   C1            POP BC
0x08F01B   E1            POP HL
0x08F01C   C3 6F EF 08   JP 0x00EF6F
0x08F020   E5            PUSH HL
0x08F021   C5            PUSH BC
0x08F022   22 40 2A      LD (0xD02A40),HL
0x08F025   D0            DB 0xD0
0x08F026   CD 53 2B 0A   CALL 0x002B53
0x08F02A   FD            DB 0xFD
0x08F02B   CB            DB 0xCB
0x08F02C   23            INC HL
0x08F02D   4E            DB 0x4E
```

### 0x08F0AA .SIS LD HL,(D02A29)

```
0x08F09A   5B            DB 0x5B
0x08F09B   29            DB 0x29
0x08F09C   2A CD 79      LD HL,(0xD079CD)
0x08F09F   C9            RET
0x08F0A0   04            DB 0x04
0x08F0A1   C9            RET
0x08F0A2   40 2A 31 2A   .SIS LD HL,(0xD02A31)
0x08F0A6   40 22 1B 2A   .SIS LD (0xD02A1B),HL
0x08F0AA   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F0AE   E5            PUSH HL
0x08F0AF   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08F0B3   E5            PUSH HL
0x08F0B4   CD 40 F1 08   CALL 0x00F140
0x08F0B8   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F0BC   40            DB 0x40
0x08F0BD   ED            DB 0xED
0x08F0BE   53            DB 0x53
0x08F0BF   2B            DEC HL
0x08F0C0   2A 3A 3B      LD HL,(0xD03B3A)
0x08F0C3   2A D0 CD      LD HL,(0xD0CDD0)
0x08F0C6   2A F1 08      LD HL,(0xD008F1)
0x08F0C9   E1            POP HL
0x08F0CA   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F0CE   E1            POP HL
0x08F0CF   11            DB 0x11
0x08F0D0   0C            DB 0x0C
0x08F0D1   00            DB 0x00
```

### 0x08F0B8 .SIS LD (D02A29),HL

```
0x08F0A8   1B            DEC DE
0x08F0A9   2A 40 2A      LD HL,(0xD02A40)
0x08F0AC   29            DB 0x29
0x08F0AD   2A E5 40      LD HL,(0xD040E5)
0x08F0B0   2A 2B 2A      LD HL,(0xD02A2B)
0x08F0B3   E5            PUSH HL
0x08F0B4   CD 40 F1 08   CALL 0x00F140
0x08F0B8   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F0BC   40            DB 0x40
0x08F0BD   ED            DB 0xED
0x08F0BE   53            DB 0x53
0x08F0BF   2B            DEC HL
0x08F0C0   2A 3A 3B      LD HL,(0xD03B3A)
0x08F0C3   2A D0 CD      LD HL,(0xD0CDD0)
0x08F0C6   2A F1 08      LD HL,(0xD008F1)
0x08F0C9   E1            POP HL
0x08F0CA   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F0CE   E1            POP HL
0x08F0CF   11            DB 0x11
0x08F0D0   0C            DB 0x0C
0x08F0D1   00            DB 0x00
0x08F0D2   00            DB 0x00
0x08F0D3   19            ADD HL,DE
0x08F0D4   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F0D8   C9            RET
0x08F0D9   F5            DB 0xF5
0x08F0DA   40            DB 0x40
0x08F0DB   ED            DB 0xED
0x08F0DC   5B            DB 0x5B
0x08F0DD   D2            DB 0xD2
0x08F0DE   08            DB 0x08
0x08F0DF   21 0A 00      LD HL,0x000A
```

### 0x08F0D4 .SIS LD (D02A29),HL

```
0x08F0C4   D0            DB 0xD0
0x08F0C5   CD 2A F1 08   CALL 0x00F12A
0x08F0C9   E1            POP HL
0x08F0CA   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F0CE   E1            POP HL
0x08F0CF   11            DB 0x11
0x08F0D0   0C            DB 0x0C
0x08F0D1   00            DB 0x00
0x08F0D2   00            DB 0x00
0x08F0D3   19            ADD HL,DE
0x08F0D4   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F0D8   C9            RET
0x08F0D9   F5            DB 0xF5
0x08F0DA   40            DB 0x40
0x08F0DB   ED            DB 0xED
0x08F0DC   5B            DB 0x5B
0x08F0DD   D2            DB 0xD2
0x08F0DE   08            DB 0x08
0x08F0DF   21 0A 00      LD HL,0x000A
0x08F0E2   00            DB 0x00
0x08F0E3   19            ADD HL,DE
0x08F0E4   EB            EX DE,HL
0x08F0E5   3A D5 08      LD A,(0xD008D5)
0x08F0E8   D0            DB 0xD0
0x08F0E9   47            DB 0x47
0x08F0EA   3A CE 25      LD A,(0xD025CE)
0x08F0ED   D0            DB 0xD0
0x08F0EE   80            DB 0x80
0x08F0EF   3D            DB 0x3D
0x08F0F0   4F            DB 0x4F
0x08F0F1   CD 8E 16 09   CALL 0x00168E
0x08F0F5   F1            DB 0xF1
0x08F0F6   40 2A 33 2A   .SIS LD HL,(0xD02A33)
0x08F0FA   40 22 31 2A   .SIS LD (0xD02A31),HL
```

### 0x08F10E .SIS LD (D02A29),HL

```
0x08F0FE   40 22 1B 2A   .SIS LD (0xD02A1B),HL
0x08F102   40 2A 35 2A   .SIS LD HL,(0xD02A35)
0x08F106   40 22 1D 2A   .SIS LD (0xD02A1D),HL
0x08F10A   40 2A 2D 2A   .SIS LD HL,(0xD02A2D)
0x08F10E   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F112   40 2A 2F 2A   .SIS LD HL,(0xD02A2F)
0x08F116   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F11A   40 2A 37 2A   .SIS LD HL,(0xD02A37)
0x08F11E   40 22 54 11   .SIS LD (0xD01154),HL
0x08F122   40 2A 39 2A   .SIS LD HL,(0xD02A39)
0x08F126   40 22 56 11   .SIS LD (0xD01156),HL
0x08F12A   FE            DB 0xFE
0x08F12B   28 CA         JR Z,0xF0F7
0x08F12D   EF            DB 0xEF
0x08F12E   DF            DB 0xDF
0x08F12F   08            DB 0x08
0x08F130   FE            DB 0xFE
0x08F131   29            DB 0x29
0x08F132   CA            DB 0xCA
0x08F133   66            DB 0x66
0x08F134   DF            DB 0xDF
0x08F135   08            DB 0x08
```

### 0x08F140 .SIS LD HL,(D02A29)

```
0x08F130   FE            DB 0xFE
0x08F131   29            DB 0x29
0x08F132   CA            DB 0xCA
0x08F133   66            DB 0x66
0x08F134   DF            DB 0xDF
0x08F135   08            DB 0x08
0x08F136   FE            DB 0xFE
0x08F137   7B            DB 0x7B
0x08F138   CA            DB 0xCA
0x08F139   51            DB 0x51
0x08F13A   E1            POP HL
0x08F13B   08            DB 0x08
0x08F13C   C3 16 E2 08   JP 0x00E216
0x08F140   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F144   40            DB 0x40
0x08F145   ED            DB 0xED
0x08F146   5B            DB 0x5B
0x08F147   54            DB 0x54
0x08F148   11            DB 0x11
0x08F149   B7            OR A
0x08F14A   52            DB 0x52
0x08F14B   ED            DB 0xED
0x08F14C   52            DB 0x52
0x08F14D   E5            PUSH HL
0x08F14E   CD 53 09 09   CALL 0x000953
0x08F152   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08F156   52            DB 0x52
0x08F157   19            ADD HL,DE
0x08F158   40            DB 0x40
0x08F159   ED            DB 0xED
0x08F15A   5B            DB 0x5B
0x08F15B   1D            DB 0x1D
0x08F15C   2A B7 52      LD HL,(0xD052B7)
0x08F15F   ED            DB 0xED
0x08F160   52            DB 0x52
0x08F161   40            DB 0x40
0x08F162   ED            DB 0xED
0x08F163   5B            DB 0x5B
0x08F164   56            DB 0x56
0x08F165   11            DB 0x11
0x08F166   B7            OR A
0x08F167   52            DB 0x52
```

### 0x08F54B .SIS LD HL,(D02A29)

```
0x08F53B   5B            DB 0x5B
0x08F53C   40 2A D0 CD   .SIS LD HL,(0xD0CDD0)
0x08F540   73            DB 0x73
0x08F541   C9            RET
0x08F542   04            DB 0x04
0x08F543   CA            DB 0xCA
0x08F544   D3            DB 0xD3
0x08F545   F5            DB 0xF5
0x08F546   08            DB 0x08
0x08F547   CD 3E F3 08   CALL 0x00F33E
0x08F54B   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F54F   52            DB 0x52
0x08F550   19            ADD HL,DE
0x08F551   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F555   D1            POP DE
0x08F556   FD            DB 0xFD
0x08F557   72            DB 0x72
0x08F558   32 FD 73      LD (0xD073FD),A
0x08F55B   23            INC HL
0x08F55C   D1            POP DE
0x08F55D   40            DB 0x40
0x08F55E   ED            DB 0xED
0x08F55F   53            DB 0x53
0x08F560   56            DB 0x56
0x08F561   11            DB 0x11
0x08F562   D1            POP DE
0x08F563   40            DB 0x40
0x08F564   ED            DB 0xED
0x08F565   53            DB 0x53
0x08F566   54            DB 0x54
0x08F567   11            DB 0x11
0x08F568   CD 90 07 09   CALL 0x000790
0x08F56C   C1            POP BC
0x08F56D   E1            POP HL
0x08F56E   C3 33 F4 08   JP 0x00F433
0x08F572   FE            DB 0xFE
```

### 0x08F551 .SIS LD (D02A29),HL

```
0x08F541   C9            RET
0x08F542   04            DB 0x04
0x08F543   CA            DB 0xCA
0x08F544   D3            DB 0xD3
0x08F545   F5            DB 0xF5
0x08F546   08            DB 0x08
0x08F547   CD 3E F3 08   CALL 0x00F33E
0x08F54B   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08F54F   52            DB 0x52
0x08F550   19            ADD HL,DE
0x08F551   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F555   D1            POP DE
0x08F556   FD            DB 0xFD
0x08F557   72            DB 0x72
0x08F558   32 FD 73      LD (0xD073FD),A
0x08F55B   23            INC HL
0x08F55C   D1            POP DE
0x08F55D   40            DB 0x40
0x08F55E   ED            DB 0xED
0x08F55F   53            DB 0x53
0x08F560   56            DB 0x56
0x08F561   11            DB 0x11
0x08F562   D1            POP DE
0x08F563   40            DB 0x40
0x08F564   ED            DB 0xED
0x08F565   53            DB 0x53
0x08F566   54            DB 0x54
0x08F567   11            DB 0x11
0x08F568   CD 90 07 09   CALL 0x000790
0x08F56C   C1            POP BC
0x08F56D   E1            POP HL
0x08F56E   C3 33 F4 08   JP 0x00F433
0x08F572   FE            DB 0xFE
0x08F573   25            DB 0x25
0x08F574   28 04         JR Z,0xF57A
0x08F576   FE            DB 0xFE
0x08F577   26            DB 0x26
0x08F578   20 0E         JR NZ,0xF588
```

### 0x08F5A4 .SIS LD (D02A29),HL

```
0x08F594   09            DB 0x09
0x08F595   22 43 11      LD (0xD01143),HL
0x08F598   D0            DB 0xD0
0x08F599   CD F8 EC 08   CALL 0x00ECF8
0x08F59D   40            DB 0x40
0x08F59E   ED            DB 0xED
0x08F59F   5B            DB 0x5B
0x08F5A0   29            DB 0x29
0x08F5A1   2A 52 19      LD HL,(0xD01952)
0x08F5A4   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F5A8   CD 92 09 09   CALL 0x000992
0x08F5AC   28 0A         JR Z,0xF5B8
0x08F5AE   40 2A 2B 2A   .SIS LD HL,(0xD02A2B)
0x08F5B2   2B            DEC HL
0x08F5B3   2B            DEC HL
0x08F5B4   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F5B8   21 28 2A      LD HL,0x2A28
0x08F5BB   D0            DB 0xD0
0x08F5BC   36            DB 0x36
0x08F5BD   00            DB 0x00
0x08F5BE   47            DB 0x47
0x08F5BF   AF            XOR A
0x08F5C0   CD 8E 09 09   CALL 0x00098E
0x08F5C4   28 17         JR Z,0xF5DD
0x08F5C6   78            DB 0x78
0x08F5C7   FE            DB 0xFE
0x08F5C8   28 3E         JR Z,0xF608
0x08F5CA   02            DB 0x02
0x08F5CB   CA            DB 0xCA
```

### 0x08F69C .SIS LD HL,(D02A29)

```
0x08F68C   01            DB 0x01
0x08F68D   D0            DB 0xD0
0x08F68E   FD            DB 0xFD
0x08F68F   CB            DB 0xCB
0x08F690   44            DB 0x44
0x08F691   9E            DB 0x9E
0x08F692   C3 DD F5 08   JP 0x00F5DD
0x08F696   D1            POP DE
0x08F697   C5            PUSH BC
0x08F698   CD DB 07 09   CALL 0x0007DB
0x08F69C   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F6A0   5F            LD E,A
0x08F6A1   16 00         LD D,0x00
0x08F6A3   52            DB 0x52
0x08F6A4   19            ADD HL,DE
0x08F6A5   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F6A9   C3 6C F5 08   JP 0x00F56C
0x08F6AD   CD B5 F6 08   CALL 0x00F6B5
0x08F6B1   C3 EC F6 08   JP 0x00F6EC
0x08F6B5   01            DB 0x01
0x08F6B6   0D            DB 0x0D
0x08F6B7   00            DB 0x00
0x08F6B8   00            DB 0x00
0x08F6B9   CD 7B 07 09   CALL 0x00077B
0x08F6BD   40 2A 56 11   .SIS LD HL,(0xD01156)
0x08F6C1   52            DB 0x52
0x08F6C2   19            ADD HL,DE
0x08F6C3   40 22 56 11   .SIS LD (0xD01156),HL
```

### 0x08F6A5 .SIS LD (D02A29),HL

```
0x08F695   08            DB 0x08
0x08F696   D1            POP DE
0x08F697   C5            PUSH BC
0x08F698   CD DB 07 09   CALL 0x0007DB
0x08F69C   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08F6A0   5F            LD E,A
0x08F6A1   16 00         LD D,0x00
0x08F6A3   52            DB 0x52
0x08F6A4   19            ADD HL,DE
0x08F6A5   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F6A9   C3 6C F5 08   JP 0x00F56C
0x08F6AD   CD B5 F6 08   CALL 0x00F6B5
0x08F6B1   C3 EC F6 08   JP 0x00F6EC
0x08F6B5   01            DB 0x01
0x08F6B6   0D            DB 0x0D
0x08F6B7   00            DB 0x00
0x08F6B8   00            DB 0x00
0x08F6B9   CD 7B 07 09   CALL 0x00077B
0x08F6BD   40 2A 56 11   .SIS LD HL,(0xD01156)
0x08F6C1   52            DB 0x52
0x08F6C2   19            ADD HL,DE
0x08F6C3   40 22 56 11   .SIS LD (0xD01156),HL
0x08F6C7   40 22 2B 2A   .SIS LD (0xD02A2B),HL
0x08F6CB   18 0B         JR 0xF6D8
```

### 0x08F6FE .SIS LD (D02A29),HL

```
0x08F6EE   00            DB 0x00
0x08F6EF   00            DB 0x00
0x08F6F0   CD 7B 07 09   CALL 0x00077B
0x08F6F4   40 2A 54 11   .SIS LD HL,(0xD01154)
0x08F6F8   52            DB 0x52
0x08F6F9   19            ADD HL,DE
0x08F6FA   40 22 54 11   .SIS LD (0xD01154),HL
0x08F6FE   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F702   18 0F         JR 0xF713
0x08F704   21 00 00      LD HL,0x0000
0x08F707   00            DB 0x00
0x08F708   40            DB 0x40
0x08F709   ED            DB 0xED
0x08F70A   5B            DB 0x5B
0x08F70B   54            DB 0x54
0x08F70C   11            DB 0x11
0x08F70D   52            DB 0x52
0x08F70E   19            ADD HL,DE
0x08F70F   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F713   CD E7 16 09   CALL 0x0016E7
0x08F717   40            DB 0x40
0x08F718   ED            DB 0xED
0x08F719   5B            DB 0x5B
0x08F71A   4E            DB 0x4E
0x08F71B   11            DB 0x11
0x08F71C   52            DB 0x52
0x08F71D   19            ADD HL,DE
0x08F71E   40 22 D2 08   .SIS LD (0xD008D2),HL
0x08F722   C9            RET
0x08F723   7E            DB 0x7E
0x08F724   23            INC HL
0x08F725   C5            PUSH BC
```

### 0x08F70F .SIS LD (D02A29),HL

```
0x08F6FF   22 29 2A      LD (0xD02A29),HL
0x08F702   18 0F         JR 0xF713
0x08F704   21 00 00      LD HL,0x0000
0x08F707   00            DB 0x00
0x08F708   40            DB 0x40
0x08F709   ED            DB 0xED
0x08F70A   5B            DB 0x5B
0x08F70B   54            DB 0x54
0x08F70C   11            DB 0x11
0x08F70D   52            DB 0x52
0x08F70E   19            ADD HL,DE
0x08F70F   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F713   CD E7 16 09   CALL 0x0016E7
0x08F717   40            DB 0x40
0x08F718   ED            DB 0xED
0x08F719   5B            DB 0x5B
0x08F71A   4E            DB 0x4E
0x08F71B   11            DB 0x11
0x08F71C   52            DB 0x52
0x08F71D   19            ADD HL,DE
0x08F71E   40 22 D2 08   .SIS LD (0xD008D2),HL
0x08F722   C9            RET
0x08F723   7E            DB 0x7E
0x08F724   23            INC HL
0x08F725   C5            PUSH BC
0x08F726   E5            PUSH HL
0x08F727   CD 36 F7 08   CALL 0x00F736
0x08F72B   E1            POP HL
0x08F72C   C1            POP BC
0x08F72D   10            DB 0x10
0x08F72E   F4            DB 0xF4
0x08F72F   C9            RET
0x08F730   CD 08 F7 08   CALL 0x00F708
0x08F734   3E            DB 0x3E
0x08F735   64            DB 0x64
0x08F736   FD            DB 0xFD
```

### 0x08F765 .SIS LD HL,(D02A29)

```
0x08F755   CB            DB 0xCB
0x08F756   32 56 20      LD (0xD02056),A
0x08F759   08            DB 0x08
0x08F75A   CD D6 F7 08   CALL 0x00F7D6
0x08F75E   20 02         JR NZ,0xF762
0x08F760   85            DB 0x85
0x08F761   6F            DB 0x6F
0x08F762   26            DB 0x26
0x08F763   00            DB 0x00
0x08F764   E5            PUSH HL
0x08F765   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F769   40            DB 0x40
0x08F76A   ED            DB 0xED
0x08F76B   5B            DB 0x5B
0x08F76C   58            DB 0x58
0x08F76D   11            DB 0x11
0x08F76E   CD 79 C9 04   CALL 0x00C979
0x08F772   38 1C         JR C,0xF790
0x08F774   E1            POP HL
0x08F775   E5            PUSH HL
0x08F776   40            DB 0x40
0x08F777   ED            DB 0xED
0x08F778   5B            DB 0x5B
0x08F779   29            DB 0x29
0x08F77A   2A 52 19      LD HL,(0xD01952)
0x08F77D   E5            PUSH HL
0x08F77E   40 2A 58 11   .SIS LD HL,(0xD01158)
0x08F782   CD 02 E1 08   CALL 0x00E102
0x08F786   13            INC DE
0x08F787   52            DB 0x52
0x08F788   19            ADD HL,DE
0x08F789   D1            POP DE
0x08F78A   CD 79 C9 04   CALL 0x00C979
```

### 0x08F79A .SIS LD HL,(D02A29)

```
0x08F78A   CD 79 C9 04   CALL 0x00C979
0x08F78E   30 06         JR NC,0xF796
0x08F790   D1            POP DE
0x08F791   E1            POP HL
0x08F792   F1            DB 0xF1
0x08F793   D5            PUSH DE
0x08F794   18 29         JR 0xF7BF
0x08F796   FD            DB 0xFD
0x08F797   CB            DB 0xCB
0x08F798   05            DB 0x05
0x08F799   CE            DB 0xCE
0x08F79A   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F79E   CD 13 F7 08   CALL 0x00F713
0x08F7A2   D1            POP DE
0x08F7A3   E1            POP HL
0x08F7A4   F1            DB 0xF1
0x08F7A5   D5            PUSH DE
0x08F7A6   B7            OR A
0x08F7A7   20 12         JR NZ,0xF7BB
0x08F7A9   CD 92 09 09   CALL 0x000992
0x08F7AD   28 04         JR Z,0xF7B3
0x08F7AF   3E            DB 0x3E
0x08F7B0   0C            DB 0x0C
0x08F7B1   18 02         JR 0xF7B5
0x08F7B3   3E            DB 0x3E
0x08F7B4   10            DB 0x10
0x08F7B5   CD 9E 23 0A   CALL 0x00239E
0x08F7B9   18 04         JR 0xF7BF
0x08F7BB   CD E9 23 0A   CALL 0x0023E9
0x08F7BF   D1            POP DE
0x08F7C0   40 2A 29 2A   .SIS LD HL,(0xD02A29)
```

### 0x08F7C0 .SIS LD HL,(D02A29)

```
0x08F7B0   0C            DB 0x0C
0x08F7B1   18 02         JR 0xF7B5
0x08F7B3   3E            DB 0x3E
0x08F7B4   10            DB 0x10
0x08F7B5   CD 9E 23 0A   CALL 0x00239E
0x08F7B9   18 04         JR 0xF7BF
0x08F7BB   CD E9 23 0A   CALL 0x0023E9
0x08F7BF   D1            POP DE
0x08F7C0   40 2A 29 2A   .SIS LD HL,(0xD02A29) <-- D02A29 ref
0x08F7C4   19            ADD HL,DE
0x08F7C5   40 22 29 2A   .SIS LD (0xD02A29),HL
0x08F7C9   FD            DB 0xFD
0x08F7CA   CB            DB 0xCB
0x08F7CB   0D            DB 0x0D
0x08F7CC   CE            DB 0xCE
0x08F7CD   FD            DB 0xFD
0x08F7CE   CB            DB 0xCB
0x08F7CF   32 96 FD      LD (0xD0FD96),A
0x08F7D2   CB            DB 0xCB
0x08F7D3   24            DB 0x24
0x08F7D4   A6            DB 0xA6
0x08F7D5   C9            RET
0x08F7D6   CD 8A E6 08   CALL 0x00E68A
0x08F7DA   20 03         JR NZ,0xF7DF
0x08F7DC   3E            DB 0x3E
0x08F7DD   06            DB 0x06
0x08F7DE   C9            RET
0x08F7DF   CD 90 E6 08   CALL 0x00E690
0x08F7E3   3E            DB 0x3E
0x08F7E4   04            DB 0x04
0x08F7E5   C9            RET
0x08F7E6   11            DB 0x11
0x08F7E7   02            DB 0x02
```

### 0x08F7C5 .SIS LD (D02A29),HL

```
0x08F7B5   CD 9E 23 0A   CALL 0x00239E
0x08F7B9   18 04         JR 0xF7BF
0x08F7BB   CD E9 23 0A   CALL 0x0023E9
0x08F7BF   D1            POP DE
0x08F7C0   40 2A 29 2A   .SIS LD HL,(0xD02A29)
0x08F7C4   19            ADD HL,DE
0x08F7C5   40 22 29 2A   .SIS LD (0xD02A29),HL <-- D02A29 ref
0x08F7C9   FD            DB 0xFD
0x08F7CA   CB            DB 0xCB
0x08F7CB   0D            DB 0x0D
0x08F7CC   CE            DB 0xCE
0x08F7CD   FD            DB 0xFD
0x08F7CE   CB            DB 0xCB
0x08F7CF   32 96 FD      LD (0xD0FD96),A
0x08F7D2   CB            DB 0xCB
0x08F7D3   24            DB 0x24
0x08F7D4   A6            DB 0xA6
0x08F7D5   C9            RET
0x08F7D6   CD 8A E6 08   CALL 0x00E68A
0x08F7DA   20 03         JR NZ,0xF7DF
0x08F7DC   3E            DB 0x3E
0x08F7DD   06            DB 0x06
0x08F7DE   C9            RET
0x08F7DF   CD 90 E6 08   CALL 0x00E690
0x08F7E3   3E            DB 0x3E
0x08F7E4   04            DB 0x04
0x08F7E5   C9            RET
0x08F7E6   11            DB 0x11
0x08F7E7   02            DB 0x02
0x08F7E8   00            DB 0x00
0x08F7E9   00            DB 0x00
0x08F7EA   C5            PUSH BC
0x08F7EB   2A 43 11      LD HL,(0xD01143)
```

## Interpretation

D02A29 is not a global OS cursor with broad call-site spread; it is confined to the token display/parser engine. Within that engine it is a real 16-bit cursor-position accumulator with many local reads/writes. The `0x08F696` alternate-exit path proves the unit: D02A29 advances by token byte size, so the value is a byte offset/cursor through the token stream. The nearby references show it also seeds display-position calculations with D02A2B/D02A1B and feeds derived state such as D0059A.
