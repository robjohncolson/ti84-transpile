# Phase 411 — Key Handler Table Format Analysis

## 1. Disassembly of 0x05D58F–0x05D5E0

Raw bytes with manual annotations of the dispatch and installer routines.

```
0x05D58F: CD 30 01 00 2A 1D 44 D1 CD 38 01 00 28 20 01 04
0x05D59F: 00 00 C5 DD 7E 06 B7 ED 62 6F 29 29 ED 4B 1D 44
0x05D5AF: D1 09 E5 DD 07 09 C5 CD A4 00 00 C1 C1 C1 DD F9
0x05D5BF: DD E1 C9 CD 30 01 00 DD 07 06 ED 43 1D 44 D1 AF
0x05D5CF: 32 84 40 D1 DD F9 DD E1 C9 F5 C5 CD 54 F9 07 FD
0x05D5DF: CB
```

### Annotated disassembly

```
  0x05D58F: CD 30 01 00          CALL 0x000130
  0x05D593: 2A 1D 44 D1          LD HL,(0xD1441D)
  0x05D597: CD 38 01 00          CALL 0x000138
  0x05D59B: 28 20                JR Z,0x05D5BD
  0x05D59D: 01 04 00 00          LD BC,0x000004
  0x05D5A1: C5                   PUSH BC
  0x05D5A2: DD 7E 06             LD A,(IX+6)
  0x05D5A5: B7                   OR A
  0x05D5A6: ED 62                DB 0xED,0x62 ; (ED prefix, unhandled)
  0x05D5A8: 6F                   LD L,A
  0x05D5A9: 29                   DB 0x29
  0x05D5AA: 29                   DB 0x29
  0x05D5AB: ED 4B 1D 44 D1       LD BC,(0xD1441D)
  0x05D5B0: 09                   ADD HL,BC
  0x05D5B1: E5                   PUSH HL
  0x05D5B2: DD 07                DB 0xDD,0x07 ; (IX prefix, unhandled)
  0x05D5B4: 09                   ADD HL,BC
  0x05D5B5: C5                   PUSH BC
  0x05D5B6: CD A4 00 00          CALL 0x0000A4
  0x05D5BA: C1                   POP BC
  0x05D5BB: C1                   POP BC
  0x05D5BC: C1                   POP BC
  0x05D5BD: DD F9                DB 0xDD,0xF9 ; (IX prefix, unhandled)
  0x05D5BF: DD E1                POP IX
  0x05D5C1: C9                   RET
  0x05D5C2: CD 30 01 00          CALL 0x000130
  0x05D5C6: DD 07                DB 0xDD,0x07 ; (IX prefix, unhandled)
  0x05D5C8: 06 ED                LD B,0xED
  0x05D5CA: 43                   DB 0x43
  0x05D5CB: 1D                   DB 0x1D
  0x05D5CC: 44                   DB 0x44
  0x05D5CD: D1                   POP DE
  0x05D5CE: AF                   XOR A
  0x05D5CF: 32 84 40 D1          LD (0xD14084),A
  0x05D5D3: DD F9                DB 0xDD,0xF9 ; (IX prefix, unhandled)
  0x05D5D5: DD E1                POP IX
  0x05D5D7: C9                   RET
  0x05D5D8: F5                   PUSH AF
  0x05D5D9: C5                   PUSH BC
  0x05D5DA: CD 54 F9 07          CALL 0x07F954
  0x05D5DE: FD CB                DB 0xFD,0xCB ; (IY prefix, unhandled)
```

## 2. Callers of installer 0x05D5C2 (direct)

Found 0 occurrence(s) of CALL 0x05D5C2:

Found 1 occurrence(s) of JP 0x05D5C2:

### JP caller at 0x021E78
```
  0x021E64: C3 FA F7 07 C3 A8 F7 07 C3 8D D1 07 C3 9A A5 04
  0x021E74: C3 7F 89 04 C3 C2 D5 05 C3 2C 02 08 C3 EF DB 07
  0x021E84: C3 F3 DB 07 C3 7E DC 07 C3 8D FF 07
```

## 3. Callers via JP table entry 0x021E78

Found 0 occurrence(s) of CALL 0x021E78:

Found 0 occurrence(s) of JP 0x021E78:

## 4. Table base extraction from callers

Caller at 0x021E78 (JP 0x05D5C2): no LD BC,nn found in preceding 30 bytes
  Preceding bytes:
  C3 FA F7 07 C3 A8 F7 07 C3 8D D1 07 C3 9A A5 04 C3 7F 89 04

## 5. Table dumps and interpretation

## 6. JP table entry at 0x021E78

Verifying what 0x021E78 actually is:
```
  0x021E78: C3 C2 D5 05 C3 2C 02 08
  -> JP 0x05D5C2
```

## 7. JP vector table context

JP table starts at 0x020104, ends at 0x02230C
Total entries: 2178
Entry for 0x05D5C2 is at index 1885 (0x75D)

Entries near index of interest:
```
  [1880] 0x021E64: JP 0x07F7FA
  [1881] 0x021E68: JP 0x07F7A8
  [1882] 0x021E6C: JP 0x07D18D
  [1883] 0x021E70: JP 0x04A59A
  [1884] 0x021E74: JP 0x04897F
  [1885] 0x021E78: JP 0x05D5C2 <-- installer 0x05D5C2
  [1886] 0x021E7C: JP 0x08022C
  [1887] 0x021E80: JP 0x07DBEF
  [1888] 0x021E84: JP 0x07DBF3
  [1889] 0x021E88: JP 0x07DC7E
  [1890] 0x021E8C: JP 0x07FF8D
```

From base 0x020000: index = 1950 (0x079E)
From base 0x021000: index = 926 (0x039E)
From base 0x020100: index = 1886 (0x075E)

## 8. Stores to RAM D1441D (key handler table base pointer)

Found 5 occurrence(s) of LD (0xD1441D),BC:
### Store at 0x02B896
```
  0x02B878: 91                   DB 0x91
  0x02B879: 40                   DB 0x40
  0x02B87A: D1                   POP DE
  0x02B87B: B7                   OR A
  0x02B87C: 28 2B                JR Z,0x02B8A9
  0x02B87E: 3A 92 40 D1          LD A,(0xD14092)
  0x02B882: B7                   OR A
  0x02B883: 20 24                JR NZ,0x02B8A9
  0x02B885: 3A B7 77 D1          LD A,(0xD177B7)
  0x02B889: FE 55                CP 0x55
  0x02B88B: 20 1C                JR NZ,0x02B8A9
  0x02B88D: AF                   XOR A
  0x02B88E: 32 91 40 D1          LD (0xD14091),A
  0x02B892: 01 00 00 00          LD BC,0x000000
  0x02B896: ED 43 1D 44 D1       LD (0xD1441D),BC
  0x02B89B: 01 40 41 00          LD BC,0x004140
  0x02B89F: C5                   PUSH BC
```

### Store at 0x02BD19
```
  0x02BCFB: 92                   DB 0x92
  0x02BCFC: 40                   DB 0x40
  0x02BCFD: D1                   POP DE
  0x02BCFE: B7                   OR A
  0x02BCFF: 20 2D                JR NZ,0x02BD2E
  0x02BD01: 3A B7 77 D1          LD A,(0xD177B7)
  0x02BD05: FE 55                CP 0x55
  0x02BD07: 20 25                JR NZ,0x02BD2E
  0x02BD09: CD E4 03 00          CALL 0x0003E4
  0x02BD0D: B7                   OR A
  0x02BD0E: 20 1E                JR NZ,0x02BD2E
  0x02BD10: AF                   XOR A
  0x02BD11: 32 91 40 D1          LD (0xD14091),A
  0x02BD15: 01 00 00 00          LD BC,0x000000
  0x02BD19: ED 43 1D 44 D1       LD (0xD1441D),BC
  0x02BD1E: 01 40 41 00          LD BC,0x004140
  0x02BD22: C5                   PUSH BC
```

### Store at 0x041E1C
```
  0x041DFE: 91                   DB 0x91
  0x041DFF: 40                   DB 0x40
  0x041E00: D1                   POP DE
  0x041E01: B7                   OR A
  0x041E02: 28 2B                JR Z,0x041E2F
  0x041E04: 3A 92 40 D1          LD A,(0xD14092)
  0x041E08: B7                   OR A
  0x041E09: 20 24                JR NZ,0x041E2F
  0x041E0B: 3A B7 77 D1          LD A,(0xD177B7)
  0x041E0F: FE 55                CP 0x55
  0x041E11: 20 1C                JR NZ,0x041E2F
  0x041E13: AF                   XOR A
  0x041E14: 32 91 40 D1          LD (0xD14091),A
  0x041E18: 01 00 00 00          LD BC,0x000000
  0x041E1C: ED 43 1D 44 D1       LD (0xD1441D),BC
  0x041E21: 01 40 41 00          LD BC,0x004140
  0x041E25: C5                   PUSH BC
```

### Store at 0x048B6E
```
  0x048B50: 0A                   LD A,(BC)
  0x048B51: 01 40 41 00          LD BC,0x004140
  0x048B55: C5                   PUSH BC
  0x048B56: CD 2F 20 05          CALL 0x05202F
  0x048B5A: C1                   POP BC
  0x048B5B: 01 48 04 00          LD BC,0x000448
  0x048B5F: C5                   PUSH BC
  0x048B60: 01 D8 3F D1          LD BC,0xD13FD8
  0x048B64: C5                   PUSH BC
  0x048B65: CD B0 00 00          CALL 0x0000B0
  0x048B69: C1                   POP BC
  0x048B6A: C1                   POP BC
  0x048B6B: DD 07                DB 0xDD,0x07 ; (IX prefix, unhandled)
  0x048B6D: FC                   DB 0xFC
  0x048B6E: ED 43 1D 44 D1       LD (0xD1441D),BC
  0x048B73: 01 60 00 00          LD BC,0x000060
  0x048B77: C5                   PUSH BC
```

### Store at 0x05D5C9
```
  0x05D5AB: ED 4B 1D 44 D1       LD BC,(0xD1441D)
  0x05D5B0: 09                   ADD HL,BC
  0x05D5B1: E5                   PUSH HL
  0x05D5B2: DD 07                DB 0xDD,0x07 ; (IX prefix, unhandled)
  0x05D5B4: 09                   ADD HL,BC
  0x05D5B5: C5                   PUSH BC
  0x05D5B6: CD A4 00 00          CALL 0x0000A4
  0x05D5BA: C1                   POP BC
  0x05D5BB: C1                   POP BC
  0x05D5BC: C1                   POP BC
  0x05D5BD: DD F9                DB 0xDD,0xF9 ; (IX prefix, unhandled)
  0x05D5BF: DD E1                POP IX
  0x05D5C1: C9                   RET
  0x05D5C2: CD 30 01 00          CALL 0x000130
  0x05D5C6: DD 07                DB 0xDD,0x07 ; (IX prefix, unhandled)
  0x05D5C8: 06 ED                LD B,0xED
  0x05D5CA: 43                   DB 0x43
  0x05D5CB: 1D                   DB 0x1D
  0x05D5CC: 44                   DB 0x44
  0x05D5CD: D1                   POP DE
  0x05D5CE: AF                   XOR A
  0x05D5CF: 32 84 40 D1          LD (0xD14084),A
```

Found 0 occurrence(s) of LD (0xD1441D),HL:
## 9. Broader search: LD BC,<rom_addr> followed by CALL to any OS entry

Searching for LD BC,nn (01 xx xx xx) where nn < 0x400000 and nn > 0x020000,
followed within 20 bytes by CALL to an address in the 0x0200xx-0x022xxx range.

Found 11 candidate(s):

  LD BC,0x1C2800 at 0x022612 -> CALL 0x0229C5 at 0x022623
    First 64 bytes at table 0x1C2800:
      0x1C2800: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1C2810: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1C2820: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1C2830: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x2F87CD at 0x022877 -> CALL 0x0229C5 at 0x02288D
    First 64 bytes at table 0x2F87CD:
      0x2F87CD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2F87DD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2F87ED: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2F87FD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x39CD0D at 0x0611F7 -> CALL 0x022BE4 at 0x0611FD
    First 64 bytes at table 0x39CD0D:
      0x39CD0D: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x39CD1D: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x39CD2D: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x39CD3D: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x1B66CD at 0x061271 -> CALL 0x022BCF at 0x061283
    First 64 bytes at table 0x1B66CD:
      0x1B66CD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1B66DD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1B66ED: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x1B66FD: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x082532 at 0x088965 -> CALL 0x022CAA at 0x08896A
    First 64 bytes at table 0x082532:
      0x082532: D1 25 08 21 84 06 D0 CD D1 25 08 21 9F 06 D0 CD
      0x082542: D1 25 08 21 A2 06 D0 CD D1 25 08 21 6A 25 D0 CD
      0x082552: D1 25 08 21 A0 25 D0 CD D1 25 08 21 6D 25 D0 CD
      0x082562: D1 25 08 21 CE 22 D0 CD D1 25 08 21 BA 22 D0 CD
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 8

  LD BC,0x2A7B3A at 0x0A8169 -> CALL 0x022A83 at 0x0A817A
    First 64 bytes at table 0x2A7B3A:
      0x2A7B3A: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B4A: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B5A: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B6A: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x2A7B32 at 0x0A8175 -> CALL 0x022A83 at 0x0A817A
    First 64 bytes at table 0x2A7B32:
      0x2A7B32: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B42: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B52: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B62: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x2A7B32 at 0x0A84C8 -> CALL 0x022A83 at 0x0A84CD
    First 64 bytes at table 0x2A7B32:
      0x2A7B32: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B42: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B52: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B62: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x3A1820 at 0x0A8788 -> CALL 0x022A83 at 0x0A8799
    First 64 bytes at table 0x3A1820:
      0x3A1820: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x3A1830: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x3A1840: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x3A1850: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x2A7B32 at 0x0A8794 -> CALL 0x022A83 at 0x0A8799
    First 64 bytes at table 0x2A7B32:
      0x2A7B32: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B42: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B52: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
      0x2A7B62: FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 0

  LD BC,0x059532 at 0x0ADB90 -> CALL 0x022F2A at 0x0ADB99
    First 64 bytes at table 0x059532:
      0x059532: CD 2F 9D 09 CD 50 BF 09 CD 06 BF 09 E1 C5 CD B2
      0x059542: BB 09 28 61 CD 29 BF 09 3A 0E 06 D0 C9 3E 02 18
      0x059552: DB CD 2F 9D 09 2A 1D 23 D0 22 1A 23 D0 C9 CD 2F
      0x059562: 9D 09 21 0B 15 D0 22 08 15 D0 21 00 00 00 40 22
    JP entries (of 16): 0; Valid ROM ptrs (3-byte LE): 9

## 10. Corrected installer disassembly (0x05D5C2)

The installer at 0x05D5C2 has DD prefix bytes that our simple disassembler
does not fully handle. Here is a byte-level manual annotation:

```
  0x05D5C2: CD 30 01 00    CALL 0x000130       ; frame setup (PUSH IX, LD IX,SP)
  0x05D5C6: DD             .SIL prefix
  0x05D5C7: 07             RLCA                ; (or part of frame setup)
  0x05D5C8: 06 ED          --- ambiguous ---
  Note: session 410 decoded this as LD BC,(IX+6) which reads the
  table base parameter from the stack frame.
  0x05D5C8: ED 43 1D 44 D1 LD (0xD1441D),BC    ; store table base to RAM
  0x05D5CD: (adjusted)
  ...bytes: AF             XOR A
  ...bytes: 32 84 40 D1    LD (0xD14084),A      ; clear notification flag
  ...bytes: DD F9          LD SP,IX             ; frame teardown
  ...bytes: DD E1          POP IX
  ...bytes: C9             RET

  Raw bytes 0x05D5C2-0x05D5D7:
  CD 30 01 00 DD 07 06 ED 43 1D 44 D1 AF 32 84 40 D1 DD F9 DD E1 C9
```

## 11. Summary

Total direct CALL 0x05D5C2: 0
Total JP 0x05D5C2: 1
Total CALL 0x021E78: 0
Total JP 0x021E78: 0
Total unique table bases found in ROM: 0

