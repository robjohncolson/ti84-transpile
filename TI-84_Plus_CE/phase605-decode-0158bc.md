# Phase 605 Decode: 0x0158BC

Static decode probe for the intermediate 0x0158BC function between the 0x0158xx guard chain and the known wipe path.

## Summary

- 0x0158BC calls 0x1C55, 0x1C4F, 0x1C33, 0x1C4F. It branches/jumps to 0x58DA via JR NZ,0x58DA; 0x58DA via JR NZ,0x58DA; 0x58DD via JR 0x58DD. It is not just an unconditional relay; the decoded body contains local tests or conditional control flow before exiting. Decoded exits in this window: 0x0158C0 CALL 0x1C55, 0x0158C4 JR NZ,0x58DA, 0x0158C6 CALL 0x1C4F, 0x0158CE CALL 0x1C33, 0x0158D2 JR NZ,0x58DA, 0x0158D4 CALL 0x1C4F, 0x0158D8 JR 0x58DD, 0x0158DD RET.
- The decoded windows do not show the complete 0x0013C3 -> 0x001988 -> 0x0158DE chain as direct calls in this byte range. Treat it as related guard plumbing, but use the listed branch targets below to decide whether it converges on 0x001872/0x0018F8 or only shares the same port-test idiom.
- Guard relationship from prior sessions: 0x0158E0 tests bit 7 at IY+0x42 and returns if already set; 0x0158EE conditionally sets that same bit or returns 0; 0x001872 and 0x001988 both use the port 0x03 bit 4 style guard before the downstream destructive operation at 0x0018F8.

## Complete Call Graph Observed by This Probe

- Callers/branchers to 0x0158BC found by whole-ROM byte scan: none found
- Callers/branchers to 0x0158DE found by whole-ROM byte scan: none found
- Callers/branchers to 0x001988 found by whole-ROM byte scan: 0x0003A0, 0x0013C3, 0x006FDC
- 0x0158BC local outgoing control transfers:
  - 0x0158C0 CALL 0x1C55 (CALL 0x1C55)
  - 0x0158C4 JR 0x58DA (JR NZ,0x58DA)
  - 0x0158C6 CALL 0x1C4F (CALL 0x1C4F)
  - 0x0158CE CALL 0x1C33 (CALL 0x1C33)
  - 0x0158D2 JR 0x58DA (JR NZ,0x58DA)
  - 0x0158D4 CALL 0x1C4F (CALL 0x1C4F)
  - 0x0158D8 JR 0x58DD (JR 0x58DD)
- 0x0158xx range outgoing control transfers:
  - 0x0158C0 CALL 0x1C55 (CALL 0x1C55)
  - 0x0158C4 JR 0x58DA (JR NZ,0x58DA)
  - 0x0158C6 CALL 0x1C4F (CALL 0x1C4F)
  - 0x0158CE CALL 0x1C33 (CALL 0x1C33)
  - 0x0158D2 JR 0x58DA (JR NZ,0x58DA)
  - 0x0158D4 CALL 0x1C4F (CALL 0x1C4F)
  - 0x0158D8 JR 0x58DD (JR 0x58DD)
  - 0x0158E8 CALL 0x58BC (CALL 0x58BC)
  - 0x0158EE JR 0x58F8 (JR Z,0x58F8)
  - 0x0158FF CALL 0x59C6 (CALL 0x59C6)
  - 0x01590B CALL 0x5A62 (CALL 0x5A62)
  - 0x015913 JR 0x590B (DJNZ 0x590B)
- 0x0013B0-0x001400 outgoing control transfers:
  - 0x0013C1 JR 0x139C (JR NZ,0x139C)
  - 0x0013C3 CALL 0x1988 (CALL 0x1988)
  - 0x0013D6 CALL 0x58DE (CALL 0x58DE)
  - 0x0013DD JR 0x13EB (JR C,0x13EB)
  - 0x0013E4 CALL 0x1853 (CALL 0x1853)
  - 0x0013EA JR 0x13FB (JR C,0x13FB)
  - 0x0013EE JR 0x13F8 (JR NZ,0x13F8)
  - 0x0013F0 CALL 0x3B05 (CALL 0x3B05)
  - 0x0013F4 JP 0x1933 (JP C,0x1933)
  - 0x0013F8 CALL 0x28D1 (CALL 0x28D1)
  - 0x0013FD JR 0x1402 (JR C,0x1402)
- 0x001980-0x0019C0 outgoing control transfers:
  - 0x001980 JR 0x1986 (JR Z,0x1986)
  - 0x001984 JR 0x1984 (DJNZ 0x1984)
  - 0x00198B JR 0x1990 (JR C,0x1990)
  - 0x00198F JR 0x19A9 (JR NZ,0x19A9)
  - 0x00199B JR 0x199E (JR Z,0x199E)
  - 0x0019A1 JR 0x19A4 (JR Z,0x19A4)
  - 0x0019A7 JR 0x19A3 (JR NZ,0x19A3)
  - 0x0019B0 JR 0x19B3 (JR Z,0x19B3)

## Known Address Annotations

- 0x001872: 0x001872 = port 0x03 guard
- 0x0018F8: 0x0018F8 = bulk wipe
- 0x005BBC: 0x005BBC = known CALL target from 0x0158E8
- 0x0158BC: 0x0158BC = intermediate function under investigation
- 0x0158E0: 0x0158E0 = IY+0x42 guard
- 0x0158EE: 0x0158EE = conditional SET/RET

## Full Disassembly Listings

### 0x0158B0-0x015920: 0x0158xx guard/intermediate chain

```
0x0158B0   C9           RET
0x0158B1   C5           DB 0xC5
0x0158B2   47           LD B,A
0x0158B3   3A 7E 00     LD A,(0x007E) ; target=0x007E
0x0158B6   00           NOP
0x0158B7   CB 7F        BIT 7,A
0x0158B9   78           LD A,B
0x0158BA   C1           DB 0xC1
0x0158BB   C9           RET
0x0158BC   11 30 03     LD DE,0x0330 ; 0x0158BC = intermediate function under investigation
0x0158BF   00           NOP
0x0158C0   CD 55 1C     CALL 0x1C55 ; target=0x1C55
0x0158C3   00           NOP
0x0158C4   20 14        JR NZ,0x58DA ; target=0x58DA
0x0158C6   CD 4F 1C     CALL 0x1C4F ; target=0x1C4F
0x0158C9   00           NOP
0x0158CA   11 30 04     LD DE,0x0430
0x0158CD   00           NOP
0x0158CE   CD 33 1C     CALL 0x1C33 ; target=0x1C33
0x0158D1   00           NOP
0x0158D2   20 06        JR NZ,0x58DA ; target=0x58DA
0x0158D4   CD 4F 1C     CALL 0x1C4F ; target=0x1C4F
0x0158D7   00           NOP
0x0158D8   18 03        JR 0x58DD ; target=0x58DD
0x0158DA   B7           OR A
0x0158DB   ED           DB 0xED
0x0158DC   62           LD H,D
0x0158DD   C9           RET
0x0158DE   FD 21 80 00  LD IY,0x0080
0x0158E2   D0           RET NC
0x0158E3   FD CB 42 7E  BIT 7,(IY+0x42)
0x0158E7   C0           RET NZ
0x0158E8   CD BC 58     CALL 0x58BC ; target=0x58BC
0x0158EB   01 38 0A     LD BC,0x0A38
0x0158EE   28 08        JR Z,0x58F8 ; target=0x58F8 ; 0x0158EE = conditional SET/RET
0x0158F0   FD CB 42 FE  SET 7,(IY+0x42)
0x0158F4   3E 01        LD A,0x01
0x0158F6   B7           OR A
0x0158F7   C9           RET
0x0158F8   AF           XOR A
0x0158F9   C9           RET
0x0158FA   22 95 05     LD (0x0595),HL ; target=0x0595
0x0158FD   D0           RET NC
0x0158FE   24           INC H
0x0158FF   CD C6 59     CALL 0x59C6 ; target=0x59C6
0x015902   00           NOP
0x015903   C9           RET
0x015904   C5           DB 0xC5
0x015905   11 FC 05     LD DE,0x05FC
0x015908   D0           RET NC
0x015909   06 05        LD B,0x05
0x01590B   CD 62 5A     CALL 0x5A62 ; target=0x5A62
0x01590E   00           NOP
0x01590F   C6 30        ADD A,0x30
0x015911   12           LD (DE),A
0x015912   1B           DEC DE
0x015913   10 F6        DJNZ 0x590B ; target=0x590B
0x015915   97           SUB A
0x015916   32 FD 05     LD (0x05FD),A ; target=0x05FD
0x015919   D0           RET NC
0x01591A   EB           EX DE,HL
0x01591B   3E 30        LD A,0x30
0x01591D   06 04        LD B,0x04
0x01591F   23           INC HL
```

### 0x0013B0-0x001400: alternate entry around 0x0013C3

```
0x0013B0   ED 79        OUT (C),A
0x0013B2   0C           INC C
0x0013B3   3E 08        LD A,0x08
0x0013B5   ED 79        OUT (C),A
0x0013B7   0C           INC C
0x0013B8   ED 79        OUT (C),A
0x0013BA   40           LD B,B
0x0013BB   21 05 A0     LD HL,0xA005
0x0013BE   52           LD D,D
0x0013BF   ED           DB 0xED
0x0013C0   42           LD B,D
0x0013C1   20 D9        JR NZ,0x139C ; target=0x139C
0x0013C3   CD 88 19     CALL 0x1988 ; target=0x1988
0x0013C6   00           NOP
0x0013C7   3E D0        LD A,0xD0
0x0013C9   ED           DB 0xED
0x0013CA   6D           LD L,L
0x0013CB   ED           DB 0xED
0x0013CC   56           LD D,(HL)
0x0013CD   FD 21 80 00  LD IY,0x0080
0x0013D1   D0           RET NC
0x0013D2   FD CB 1B B6  RES 6,(IY+0x1B)
0x0013D6   CD DE 58     CALL 0x58DE ; target=0x58DE
0x0013D9   01 28 08     LD BC,0x0828
0x0013DC   ED           DB 0xED
0x0013DD   38 0C        JR C,0x13EB ; target=0x13EB
0x0013DF   CB D7        SET 2,A
0x0013E1   ED           DB 0xED
0x0013E2   39           ADD HL,SP
0x0013E3   0C           INC C
0x0013E4   CD 53 18     CALL 0x1853 ; target=0x1853
0x0013E7   00           NOP
0x0013E8   F3           DI
0x0013E9   ED           DB 0xED
0x0013EA   38 0F        JR C,0x13FB ; target=0x13FB
0x0013EC   CB 7F        BIT 7,A
0x0013EE   20 08        JR NZ,0x13F8 ; target=0x13F8
0x0013F0   CD 05 3B     CALL 0x3B05 ; target=0x3B05
0x0013F3   00           NOP
0x0013F4   DA 33 19     JP C,0x1933 ; target=0x1933
0x0013F7   00           NOP
0x0013F8   CD D1 28     CALL 0x28D1 ; target=0x28D1
0x0013FB   00           NOP
0x0013FC   ED           DB 0xED
0x0013FD   38 03        JR C,0x1402 ; target=0x1402
0x0013FF   CB 67        BIT 4,A
```

### 0x001980-0x0019C0: 0x001988 shared port guard function

```
0x001980   28 04        JR Z,0x1986 ; target=0x1986
0x001982   06 A5        LD B,0xA5
0x001984   10 FE        DJNZ 0x1984 ; target=0x1984
0x001986   C1           DB 0xC1
0x001987   C9           RET
0x001988   F3           DI
0x001989   C5           DB 0xC5
0x00198A   ED           DB 0xED
0x00198B   38 03        JR C,0x1990 ; target=0x1990
0x00198D   CB 67        BIT 4,A
0x00198F   20 18        JR NZ,0x19A9 ; target=0x19A9
0x001991   40           LD B,B
0x001992   01 05 10     LD BC,0x1005
0x001995   3E 04        LD A,0x04
0x001997   ED 79        OUT (C),A
0x001999   FE 04        CP 0x04
0x00199B   28 01        JR Z,0x199E ; target=0x199E
0x00199D   CF           RST 0x08
0x00199E   78           LD A,B
0x00199F   FE 10        CP 0x10
0x0019A1   28 01        JR Z,0x19A4 ; target=0x19A4
0x0019A3   CF           RST 0x08
0x0019A4   79           LD A,C
0x0019A5   FE 05        CP 0x05
0x0019A7   20 FA        JR NZ,0x19A3 ; target=0x19A3
0x0019A9   3E 03        LD A,0x03
0x0019AB   ED           DB 0xED
0x0019AC   39           ADD HL,SP
0x0019AD   01 FE 03     LD BC,0x03FE
0x0019B0   28 01        JR Z,0x19B3 ; target=0x19B3
0x0019B2   CF           RST 0x08
0x0019B3   C1           DB 0xC1
0x0019B4   C9           RET
0x0019B5   F3           DI
0x0019B6   3E 10        LD A,0x10
0x0019B8   ED           DB 0xED
0x0019B9   39           ADD HL,SP
0x0019BA   00           NOP
0x0019BB   00           NOP
0x0019BC   00           NOP
0x0019BD   76           HALT
0x0019BE   40           LD B,B
0x0019BF   01 15 50     LD BC,0x5015
```

