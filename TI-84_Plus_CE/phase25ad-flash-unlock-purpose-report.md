# Phase 25AD - Flash Unlock Purpose in JError

Static ROM analysis of flash unlock routine usage during error dispatch.

## 1. Callers of Flash Unlock Wrapper (0x03E1B4)

Found 1 CALL sites targeting 0x03E1B4:

### Call site at 0x061DB6

Disassembly context (preceding + following instructions):
```
  0x061DA2: 3E B4            LD A,0xB4
  0x061DA4: 18 0C            JR 0x061DB2 (offset +12)
  0x061DA6: 3E 9F            LD A,0x9F
  0x061DA8: 18 08            JR 0x061DB2 (offset +8)
  0x061DAA: 3E B5            LD A,0xB5
  0x061DAC: 18 04            JR 0x061DB2 (offset +4)
  0x061DAE: 3E 36            LD A,0x36
  0x061DB0: 18 00            JR 0x061DB2 (offset +0)
  0x061DB2: 32 DF 08 D0      LD (0xD008DF),A
  0x061DB6: CD B4 E1 03      CALL 0x03E1B4
  0x061DBA: FD CB            DB 0xFD,0xCB
  0x061DBC: 4B               LD C,E
  0x061DBD: BE               CP (HL)
  0x061DBE: FD CB            DB 0xFD,0xCB
  0x061DC0: 12               DB 12
  0x061DC1: 96               DB 96
  0x061DC2: FD CB            DB 0xFD,0xCB
  0x061DC4: 24               INC H
  0x061DC5: A6               DB A6
  0x061DC6: FD CB            DB 0xFD,0xCB
```

Hex dump:
```
  0x061D98: 18 18 3E 30 18 14 3E 31 18 10 3E B4 18 0C 3E 9F  ..>0..>1..>...>.
  0x061DA8: 18 08 3E B5 18 04 3E 36 18 00 32 DF 08 D0 CD B4  ..>...>6..2..... <--
  0x061DB8: E1 03 FD CB 4B BE FD CB 12 96 FD CB 24 A6 FD CB  ....K.......$...
  0x061DC8: 49 8E ED 7B E0 08 D0 F1 C9 2A 90 25              I..{.....*.%
```

## 2. Callers of Flash Unlock Core (0x03E187)

Found 4 CALL sites targeting 0x03E187:

### Call site at 0x027F63

Disassembly context:
```
  0x027F4F: DA 86 1D 06      JP C,0x061D86
  0x027F53: CD 5B 7F 02      CALL 0x027F5B
  0x027F57: C3 95 7E 02      JP 0x027E95
```

Hex dump:
```
  0x027F45: 06 F0 CD F0 7D 02 CD 7B 7F 02 DA 86 1D 06 CD 5B  ....}..{.......[
  0x027F55: 7F 02 C3 95 7E 02 CD 7B 7F 02 D2 D4 02 00 CD 87  ....~..{........ <--
  0x027F65: E1 03 C3 86 1D 06 CD 7B 7F 02 D2 E0 02 00 CD 87  .......{........
  0x027F75: E1 03 C3 86 1D 06 C5 E5 CD A3 C8 04              ............
```

### Call site at 0x027F73

Disassembly context:
```
  0x027F5F: D2 D4 02 00      JP NC,0x0002D4
  0x027F63: CD 87 E1 03      CALL 0x03E187
  0x027F67: C3 86 1D 06      JP 0x061D86
```

Hex dump:
```
  0x027F55: 7F 02 C3 95 7E 02 CD 7B 7F 02 D2 D4 02 00 CD 87  ....~..{........
  0x027F65: E1 03 C3 86 1D 06 CD 7B 7F 02 D2 E0 02 00 CD 87  .......{........ <--
  0x027F75: E1 03 C3 86 1D 06 C5 E5 CD A3 C8 04 47 3A C7 25  ............G:.%
  0x027F85: D0 B8 38 05 28 03 37 18 05 3A 3B 05              ..8.(.7..:;.
```

### Call site at 0x03DBCA

Disassembly context:
```
  0x03DBB6: 3A 6A 05 D0      LD A,(0xD0056A)
  0x03DBBA: FE 01            CP 0x01
  0x03DBBC: 28 04            JR Z,0x03DBC2
  0x03DBBE: CD 8E E3 03      CALL 0x03E38E
  0x03DBC2: CD CF E0 03      CALL 0x03E0CF
  0x03DBC6: CD 20 1E 06      CALL 0x061E20
  0x03DBCA: CD 87 E1 03      CALL 0x03E187
  0x03DBCE: 21 94 08 D0      LD HL,0xD00894
  0x03DBD2: CB               DB CB
  0x03DBD3: 66               LD H,(HL)
  0x03DBD4: C2 B4 D5 03      JP NZ,0x03D5B4
  0x03DBD8: C3 66 D5 03      JP 0x03D566
```

Hex dump:
```
  0x03DBAC: 50 DB 03 3A 94 08 D0 B7 28 10 3A 6A 05 D0 FE 01  P..:....(.:j....
  0x03DBBC: 28 04 CD 8E E3 03 CD CF E0 03 CD 20 1E 06 CD 87  (.......... .... <--
  0x03DBCC: E1 03 21 94 08 D0 CB 66 C2 B4 D5 03 C3 66 D5 03  ..!....f.....f..
  0x03DBDC: FE 1C C2 7C DC 03 21 0B E1 03 CD EF              ...|..!.....
```

### Call site at 0x03E1C6

Disassembly context:
```
  0x03E1B2: F1               POP AF
  0x03E1B3: C9               RET
```

Hex dump:
```
  0x03E1A8: 88 ED 39 24 FE 88 C2 66 00 00 F1 C9 32 42 05 D0  ..9$...f....2B..
  0x03E1B8: ED 57 EA C0 E1 03 ED 57 F3 F5 3A 42 05 D0 CD 87  .W.....W..:B.... <--
  0x03E1C8: E1 03 32 42 05 D0 F1 E2 D4 E1 03 FB 3A 42 05 D0  ..2B........:B..
  0x03E1D8: C9 CD BD F7 07 E6 3F FE 15 D0 D6 0F              ......?.....
```

## 3. JError (0x061DB2) Disassembly

Full disassembly of JError entry point:
```
  0x061DB2: 32 DF 08 D0      LD (0xD008DF),A
  0x061DB6: CD B4 E1 03      CALL 0x03E1B4
  0x061DBA: FD CB            DB 0xFD,0xCB
  0x061DBC: 4B               LD C,E
  0x061DBD: BE               CP (HL)
  0x061DBE: FD CB            DB 0xFD,0xCB
  0x061DC0: 12               DB 12
  0x061DC1: 96               DB 96
  0x061DC2: FD CB            DB 0xFD,0xCB
  0x061DC4: 24               INC H
  0x061DC5: A6               DB A6
  0x061DC6: FD CB            DB 0xFD,0xCB
  0x061DC8: 49               LD C,C
  0x061DC9: 8E               DB 8E
  0x061DCA: ED 7B            DB 0xED,0x7B
  0x061DCC: E0               RET PO
  0x061DCD: 08               DB 08
  0x061DCE: D0               RET NC
  0x061DCF: F1               POP AF
  0x061DD0: C9               RET
```

### JError hex dump (first 128 bytes):
```
  0x061DB2: 32 DF 08 D0 CD B4 E1 03 FD CB 4B BE FD CB 12 96  2.........K..... <--
  0x061DC2: FD CB 24 A6 FD CB 49 8E ED 7B E0 08 D0 F1 C9 2A  ..$...I..{.....*
  0x061DD2: 90 25 D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0 19 22  .%...".%..*.%.."
  0x061DE2: 8D 25 D0 E1 22 E0 08 D0 3A DF 08 D0 C9 D1 E5 2A  .%.."...:......*
  0x061DF2: E0 08 D0 E5 ED 4B 8A 25 D0 2A 8D 25 D0 B7 ED 42  .....K.%.*.%...B
  0x061E02: E5 ED 4B 90 25 D0 2A 93 25 D0 ED 42 E5 21 D1 1D  ..K.%.*.%..B.!..
  0x061E12: 06 E5 21 27 1E 06 E5 ED 73 E0 08 D0 EB E9 C1 ED  ..!'....s.......
  0x061E22: 7B E0 08 D0 C9 F1 F1 F1 E3 22 E0 08 D0 E1 F1 C5  {........"......
```

## 4. Flash Unlock Wrapper (0x03E1B4) Disassembly

```
  0x03E1B4: 32 42 05 D0      LD (0xD00542),A
  0x03E1B8: ED 57            DB 0xED,0x57
  0x03E1BA: EA C0 E1 03      JP PE,0x03E1C0
  0x03E1BE: ED 57            DB 0xED,0x57
  0x03E1C0: F3               DI
  0x03E1C1: F5               PUSH AF
  0x03E1C2: 3A 42 05 D0      LD A,(0xD00542)
  0x03E1C6: CD 87 E1 03      CALL 0x03E187
  0x03E1CA: 32 42 05 D0      LD (0xD00542),A
  0x03E1CE: F1               POP AF
  0x03E1CF: E2 D4 E1 03      JP PO,0x03E1D4
  0x03E1D3: FB               EI
  0x03E1D4: 3A 42 05 D0      LD A,(0xD00542)
  0x03E1D8: C9               RET
```

## 5. Flash Unlock Core (0x03E187) Disassembly

```
  0x03E187: 00               NOP
  0x03E188: 00               NOP
  0x03E189: 00               NOP
  0x03E18A: 00               NOP
  0x03E18B: F5               PUSH AF
  0x03E18C: AF               XOR A
  0x03E18D: F3               DI
  0x03E18E: 18 00            JR 0x03E190 (offset +0)
  0x03E190: F3               DI
  0x03E191: ED 7E            DB 0xED,0x7E
  0x03E193: ED 56            DB 0xED,0x56
  0x03E195: ED 39            DB 0xED,0x39
  0x03E197: 28 ED            JR Z,0x03E186
  0x03E199: 38 28            JR C,0x03E1C3
  0x03E19B: CB               DB CB
  0x03E19C: 57               LD D,A
  0x03E19D: ED 38            DB 0xED,0x38
  0x03E19F: 06 CB            LD B,0xCB
  0x03E1A1: 97               DB 97
  0x03E1A2: ED 39            DB 0xED,0x39
  0x03E1A4: 06 00            LD B,0x00
  0x03E1A6: 00               NOP
  0x03E1A7: 3E 88            LD A,0x88
  0x03E1A9: ED 39            DB 0xED,0x39
  0x03E1AB: 24               INC H
  0x03E1AC: FE 88            CP 0x88
  0x03E1AE: C2 66 00 00      JP NZ,0x000066
  0x03E1B2: F1               POP AF
  0x03E1B3: C9               RET
```

## 6. Error Entry Points

### ErrUndefined (0x061D3A)
```
  0x061D3A: 3E 8D            LD A,0x8D
  0x061D3C: 18 74            JR 0x061DB2 (offset +116)
  0x061D3E: 3E 8E            LD A,0x8E
  0x061D40: 18 70            JR 0x061DB2 (offset +112)
  0x061D42: 3E 0E            LD A,0x0E
  0x061D44: 18 6C            JR 0x061DB2 (offset +108)
  0x061D46: 3E 8F            LD A,0x8F
  0x061D48: 18 68            JR 0x061DB2 (offset +104)
  0x061D4A: 3E 90            LD A,0x90
  0x061D4C: 18 64            JR 0x061DB2 (offset +100)
  0x061D4E: 3E 91            LD A,0x91
  0x061D50: 18 60            JR 0x061DB2 (offset +96)
  0x061D52: 3E 92            LD A,0x92
  0x061D54: 18 5C            JR 0x061DB2 (offset +92)
  0x061D56: 3E 93            LD A,0x93
  0x061D58: 18 58            JR 0x061DB2 (offset +88)
  0x061D5A: 3E 86            LD A,0x86
  0x061D5C: 18 54            JR 0x061DB2 (offset +84)
  0x061D5E: 3E 15            LD A,0x15
  0x061D60: 18 50            JR 0x061DB2 (offset +80)
```

### ErrMemory (0x061D3E)
```
  0x061D3E: 3E 8E            LD A,0x8E
  0x061D40: 18 70            JR 0x061DB2 (offset +112)
  0x061D42: 3E 0E            LD A,0x0E
  0x061D44: 18 6C            JR 0x061DB2 (offset +108)
  0x061D46: 3E 8F            LD A,0x8F
  0x061D48: 18 68            JR 0x061DB2 (offset +104)
  0x061D4A: 3E 90            LD A,0x90
  0x061D4C: 18 64            JR 0x061DB2 (offset +100)
  0x061D4E: 3E 91            LD A,0x91
  0x061D50: 18 60            JR 0x061DB2 (offset +96)
  0x061D52: 3E 92            LD A,0x92
  0x061D54: 18 5C            JR 0x061DB2 (offset +92)
  0x061D56: 3E 93            LD A,0x93
  0x061D58: 18 58            JR 0x061DB2 (offset +88)
  0x061D5A: 3E 86            LD A,0x86
  0x061D5C: 18 54            JR 0x061DB2 (offset +84)
  0x061D5E: 3E 15            LD A,0x15
  0x061D60: 18 50            JR 0x061DB2 (offset +80)
  0x061D62: 3E 96            LD A,0x96
  0x061D64: 18 4C            JR 0x061DB2 (offset +76)
```

## 7. Error String Search

### "ERR:" — 6 hit(s)
  0x075514 [FLASH]: "ERR:INEQUVAR"
  0x0759C1 [FLASH]: "ERR:INEQUVAR"
  0x077954 [FLASH]: "ERR:INEQUVAR"
  0x08A56C [FLASH]: "ERR:VERSION[0C]ERR:ARCHIVED[1A]USB cable not   connected.[0C]System B"
  0x08A578 [FLASH]: "ERR:ARCHIVED[1A]USB cable not   connected.[0C]System Busy.[10]New Dev"
  0x0A2EAC [FLASH]: "ERR:"

### "UNDEFINED" — 1 hit(s)
  0x06278D [FLASH]: "UNDEFINED"

### "MEMORY" — 5 hit(s)
  0x0627C2 [FLASH]: "MEMORY"
  0x08A22B [FLASH]: "MEMORY[0C]MEMORYBACKUP[0A]MemoryFull[05]NAMES[03]NUM[03]NEW[06]ON/OFF[03]OPS[0A]PARA"
  0x08A232 [FLASH]: "MEMORYBACKUP[0A]MemoryFull[05]NAMES[03]NUM[03]NEW[06]ON/OFF[03]OPS[0A]PARAMETRIC[07]"
  0x08A2BD [FLASH]: "MEMORY[0E]RESET DEFAULTS[0E]RESET ARC VARS[0E]RESET ARC APPS[0E]RESET AR"
  0x0A2F05 [FLASH]: "MEMORY BACKUP"

### "SYNTAX" — 2 hit(s)
  0x029259 [FLASH]: "SYNTAX  HELP."
  0x06256F [FLASH]: "SYNTAX"

### "DOMAIN" — 1 hit(s)
  0x06244E [FLASH]: "DOMAIN"

### "OVERFLOW" — 1 hit(s)
  0x062338 [FLASH]: "OVERFLOW"

### "BREAK" — 1 hit(s)
  0x062504 [FLASH]: "BREAK"

### "ERROR" — 5 hit(s)
  0x003A93 [FLASH]: "ERROR!"
  0x075063 [FLASH]: "ERROR:INEQUVAR"
  0x08A1EE [FLASH]: "ERROR[04]EXEC[08]FUNCTION[0E]GRAPH DATABASE[05]CMPLX[03]I/O[05]LOGIC[04]MARK[04]MATH"
  0x0B26A9 [FLASH]: "ERROR"
  0x0BBFF8 [FLASH]: "ERROR DUPLICATE"

## 8. String Table Near Error Handlers

Scanning for string references near ErrUndefined (0x061D3A)...

Hex dump of error handler region 0x061C00-0x061F00:
```
  0x061C00: 00 00 78 F0 40 10 40 10 40 10 40 10 40 10 40 10  ..x.@.@.@.@.@.@.
  0x061C10: 40 10 40 10 40 10 40 10 78 F0 00 00 0C 00 00 78  @.@.@.@.x......x
  0x061C20: F0 78 F0 78 F0 78 F0 78 F0 78 F0 78 F0 78 F0 78  .x.x.x.x.x.x.x.x
  0x061C30: F0 78 F0 78 F0 78 F0 00 00 0C 00 00 00 00 00 00  .x.x.x..........
  0x061C40: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
  0x061C50: 00 00 00 00 00 00 FD CB 05 F6 FD CB 11 FE C9 FD  ................
  0x061C60: CB 05 B6 FD CB 11 BE C9 CD 66 1B 06 C8 4F 3E 07  .........f...O>.
  0x061C70: CD FE 39 02 C0 79 C9 CD 66 1B 06 C8 3E 03 CD FE  ..9..y..f...>...
  0x061C80: 39 02 C9 F5 40 ED 4B 86 11 78 FE E0 20 09 79 FE  9...@.K..x.. .y.
  0x061C90: E0 20 04 01 14 00 00 F1 C9 3A 75 25 D0 E6 21 FE  . .......:u%..!.
  0x061CA0: 21 C9 CD 60 D0 0A 28 07 3A 6D 11 D0 FE DE C9 3A  !..`..(.:m.....:
  0x061CB0: 95 05 D0 21 05 25 D0 3C BE C9 CD 32 C7 06 C8 3A  ...!.%.<...2...:
  0x061CC0: E6 2F D0 B7 C8 3A 96 05 D0 3C 3C 32 96 05 D0 C9  ./...:...<<2....
  0x061CD0: FD CB FC 5E C0 FD CB 13 46 C0 FD CB 18 7E C0 CD  ...^....F....~..
  0x061CE0: 34 14 06 C8 FD CB 4C 76 C8 3A 75 25 D0 CD 83 1C  4.....Lv.:u%....
  0x061CF0: 06 CD 4F 0A 06 C9 3E 38 18 2A 3E B2 18 26 3E B3  ..O...>8.*>..&>.
  0x061D00: 18 22 3E 81 18 1E 3E 82 18 1A 3E 83 18 16 3E 84  .">...>...>...>.
  0x061D10: 18 12 3E 85 18 0E 3E 87 18 0A 3E 88 18 06 3E 9E  ..>...>...>...>.
  0x061D20: 18 02 3E 89 C3 B2 1D 06 3E 9D 18 F8 3E 8A C3 B2  ..>.....>...>...
  0x061D30: 1D 06 3E 8B 18 7C 3E 8C 18 78 3E 8D 18 74 3E 8E  ..>..|>..x>..t>.
  0x061D40: 18 70 3E 0E 18 6C 3E 8F 18 68 3E 90 18 64 3E 91  .p>..l>..h>..d>.
  0x061D50: 18 60 3E 92 18 5C 3E 93 18 58 3E 86 18 54 3E 15  .`>..\>..X>..T>.
  0x061D60: 18 50 3E 96 18 4C 3E 98 18 48 3E 99 18 44 3E 9A  .P>..L>..H>..D>.
  0x061D70: 18 40 3E 9C 18 3C 3E 1B 18 38 3E AA 18 34 3E 2D  .@>..<>..8>..4>-
  0x061D80: 18 30 3E 28 18 2C 3E 2E 18 28 3E AB 18 24 3E AC  .0>(.,>..(>..$>.
  0x061D90: 18 20 3E AF 18 1C 3E 2F 18 18 3E 30 18 14 3E 31  . >...>/..>0..>1
  0x061DA0: 18 10 3E B4 18 0C 3E 9F 18 08 3E B5 18 04 3E 36  ..>...>...>...>6
  0x061DB0: 18 00 32 DF 08 D0 CD B4 E1 03 FD CB 4B BE FD CB  ..2.........K...
  0x061DC0: 12 96 FD CB 24 A6 FD CB 49 8E ED 7B E0 08 D0 F1  ....$...I..{....
  0x061DD0: C9 2A 90 25 D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0  .*.%...".%..*.%.
  0x061DE0: 19 22 8D 25 D0 E1 22 E0 08 D0 3A DF 08 D0 C9 D1  .".%.."...:.....
  0x061DF0: E5 2A E0 08 D0 E5 ED 4B 8A 25 D0 2A 8D 25 D0 B7  .*.....K.%.*.%..
  0x061E00: ED 42 E5 ED 4B 90 25 D0 2A 93 25 D0 ED 42 E5 21  .B..K.%.*.%..B.!
  0x061E10: D1 1D 06 E5 21 27 1E 06 E5 ED 73 E0 08 D0 EB E9  ....!'....s.....
  0x061E20: C1 ED 7B E0 08 D0 C9 F1 F1 F1 E3 22 E0 08 D0 E1  ..{........"....
  0x061E30: F1 C5 C9 E1 E1 7D FD 21 80 00 D0 C3 B2 1D 06 D1  .....}.!........
  0x061E40: D5 DD E5 2A E0 08 D0 E5 ED 4B 8A 25 D0 2A 8D 25  ...*.....K.%.*.%
  0x061E50: D0 B7 ED 42 E5 ED 4B 90 25 D0 2A 93 25 D0 ED 42  ...B..K.%.*.%..B
  0x061E60: E5 21 76 1E 06 E5 21 9B 1E 06 E5 ED 73 E0 08 D0  .!v...!.....s...
  0x061E70: D5 21 00 00 00 C9 2A 90 25 D0 D1 19 22 93 25 D0  .!....*.%...".%.
  0x061E80: D1 2A 8A 25 D0 19 22 8D 25 D0 E1 22 E0 08 D0 DD  .*.%..".%.."....
  0x061E90: E1 21 00 00 00 3A DF 08 D0 6F C9 F1 F1 F1 E3 22  .!...:...o....."
  0x061EA0: E0 08 D0 E1 F1 F1 C5 C9 11 6C A8 D1 ED 53 FA 07  .........l...S..
  0x061EB0: D0 21 BC 1E 06 01 12 00 00 ED B0 C9 27 1E 06 D1  .!..........'...
  0x061EC0: 1D 06 00 00 00 00 00 00 00 00 00 54 C7 08 CD 40  ...........T...@
  0x061ED0: 25 02 FD CB 1D F6 FD CB 1D FE FD CB 3C A6 FD CB  %...........<...
  0x061EE0: 14 AE FD CB 45 C6 21 D3 1F 06 CD 82 C7 08 FD CB  ....E.!.........
  0x061EF0: 01 E6 CD B5 20 08 11 64 00 00 CD 73 C9 04 38 41  .... ..d...s..8A
```

## 9. References to JError

CALL 0x061DB2: 0 sites

JP 0x061DB2: 15 sites
  0x020790
  0x059DE7
  0x05A44A
  0x061D24
  0x061D2E
  0x061E3B
  0x06B609
  0x06BAB6
  0x0802F4
  0x0930C2
  0x097474
  0x09C84B
  0x0A7D31
  0x0AE10D
  0x0BC303

## 10. Flash Controller Register Analysis

Looking for I/O port writes in flash unlock routines...

Disassembly of flash unlock core (extended, 80 instructions):
```
  0x03E187: 00               NOP
  0x03E188: 00               NOP
  0x03E189: 00               NOP
  0x03E18A: 00               NOP
  0x03E18B: F5               PUSH AF
  0x03E18C: AF               XOR A
  0x03E18D: F3               DI
  0x03E18E: 18 00            JR 0x03E190 (offset +0)
  0x03E190: F3               DI
  0x03E191: ED 7E            DB 0xED,0x7E
  0x03E193: ED 56            DB 0xED,0x56
  0x03E195: ED 39            DB 0xED,0x39
  0x03E197: 28 ED            JR Z,0x03E186
  0x03E199: 38 28            JR C,0x03E1C3
  0x03E19B: CB               DB CB
  0x03E19C: 57               LD D,A
  0x03E19D: ED 38            DB 0xED,0x38
  0x03E19F: 06 CB            LD B,0xCB
  0x03E1A1: 97               DB 97
  0x03E1A2: ED 39            DB 0xED,0x39
  0x03E1A4: 06 00            LD B,0x00
  0x03E1A6: 00               NOP
  0x03E1A7: 3E 88            LD A,0x88
  0x03E1A9: ED 39            DB 0xED,0x39
  0x03E1AB: 24               INC H
  0x03E1AC: FE 88            CP 0x88
  0x03E1AE: C2 66 00 00      JP NZ,0x000066
  0x03E1B2: F1               POP AF
  0x03E1B3: C9               RET
```

## 11. Summary

- Flash unlock wrapper (0x03E1B4): 1 callers
- Flash unlock core (0x03E187): 4 callers
- JError (0x061DB2): 0 CALL refs, 15 JP refs
- Error strings found in ROM at addresses listed above
- All error handler addresses are in FLASH region (< 0x400000)
