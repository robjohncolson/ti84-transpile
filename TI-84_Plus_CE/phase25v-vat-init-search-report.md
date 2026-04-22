# Phase 25V -- VAT/Heap Initializer Search Report

Generated: 2026-04-22T11:06:57.102Z

## Summary

Total references found: 243
Total WRITE references: 56

| Symbol | Address | Total Refs | WRITEs | READs | UNKNOWN |
|--------|---------|-----------|--------|-------|---------|
| OPBase | 0xD02590 | 19 | 5 | 14 | 0 |
| OPS | 0xD02593 | 30 | 10 | 20 | 0 |
| FPSbase | 0xD0258A | 17 | 4 | 12 | 1 |
| FPS | 0xD0258D | 132 | 33 | 98 | 1 |
| pTemp | 0xD0259A | 30 | 2 | 26 | 2 |
| progPtr | 0xD0259D | 13 | 2 | 9 | 2 |
| userMem | 0xD1A881 | 2 | 0 | 0 | 2 |

---

## WRITE References (Potential Initializers)

### OPBase (0xD02590) -- 5 WRITE(s)

- **0x0820FA**: `LD (nn), HL` -- bytes: `B7 ED 42 22 90 25 D0 3A FE 05 D0 FE 24`
  - Instruction at ROM offset 0x0820F9
- **0x08263A**: `LD (nn), HL` -- bytes: `25 D0 09 22 90 25 D0 CD CA 27 08 C9 CD`
  - Instruction at ROM offset 0x082639
- **0x08369F**: `ED LD (nn), DE` -- bytes: `25 D0 ED 53 90 25 D0 ED B8 ED 53 93 25`
  - Instruction at ROM offset 0x08369D
- **0x0836AF**: `LD (nn), HL` -- bytes: `9A 25 D0 22 90 25 D0 22 93 25 D0 C9 CD`
  - Instruction at ROM offset 0x0836AE
- **0x09DEFD**: `LD (nn), HL` -- bytes: `9A 25 D0 22 90 25 D0 22 93 25 D0 22 9D`
  - Instruction at ROM offset 0x09DEFC

### OPS (0xD02593) -- 10 WRITE(s)

- **0x059590**: `LD (nn), HL` -- bytes: `FF FF 19 22 93 25 D0 C9 CD A6 BB 09 C8`
  - Instruction at ROM offset 0x05958F
- **0x061DD8**: `LD (nn), HL` -- bytes: `D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0 19`
  - Instruction at ROM offset 0x061DD7
- **0x061E7D**: `LD (nn), HL` -- bytes: `D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0 19`
  - Instruction at ROM offset 0x061E7C
- **0x082142**: `LD (nn), HL` -- bytes: `EB ED 42 22 93 25 D0 23 E5 D1 09 C1 F1`
  - Instruction at ROM offset 0x082141
- **0x08262F**: `ED LD (nn), DE` -- bytes: `ED B8 ED 53 93 25 D0 D1 C1 2A 90 25 D0`
  - Instruction at ROM offset 0x08262D
- **0x0836A6**: `ED LD (nn), DE` -- bytes: `ED B8 ED 53 93 25 D0 C9 2A 9A 25 D0 22`
  - Instruction at ROM offset 0x0836A4
- **0x0836B3**: `LD (nn), HL` -- bytes: `90 25 D0 22 93 25 D0 C9 CD 9E 27 08 28`
  - Instruction at ROM offset 0x0836B2
- **0x09BF48**: `LD (nn), HL` -- bytes: `D0 77 2B 22 93 25 D0 C9 CD 29 BF 09 2A`
  - Instruction at ROM offset 0x09BF47
- **0x09DCAF**: `LD (nn), HL` -- bytes: `90 25 D0 22 93 25 D0 2A 8A 25 D0 22 8D`
  - Instruction at ROM offset 0x09DCAE
- **0x09DF01**: `LD (nn), HL` -- bytes: `90 25 D0 22 93 25 D0 22 9D 25 D0 CD 8F`
  - Instruction at ROM offset 0x09DF00

### FPSbase (0xD0258A) -- 4 WRITE(s)

- **0x0821C2**: `LD (nn), HL` -- bytes: `C5 E5 09 22 8A 25 D0 ED 42 EB 2A 8D 25`
  - Instruction at ROM offset 0x0821C1
- **0x082705**: `LD (nn), HL` -- bytes: `B7 ED 42 22 8A 25 D0 2A 8D 25 D0 B7 ED`
  - Instruction at ROM offset 0x082704
- **0x08367F**: `ED LD (nn), DE` -- bytes: `25 D0 ED 53 8A 25 D0 1B CD FD 24 08 2A`
  - Instruction at ROM offset 0x08367D
- **0x09DEE9**: `LD (nn), HL` -- bytes: `87 25 D0 22 8A 25 D0 22 8D 25 D0 22 A0`
  - Instruction at ROM offset 0x09DEE8

### FPS (0xD0258D) -- 33 WRITE(s)

- **0x03DD37**: `LD (nn), HL` -- bytes: `8A 25 D0 22 8D 25 D0 FD CB 0C A6 3A 96`
  - Instruction at ROM offset 0x03DD36
- **0x044719**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 3E 01 CD D3 F4 06`
  - Instruction at ROM offset 0x044718
- **0x044807**: `LD (nn), HL` -- bytes: `00 00 19 22 8D 25 D0 CD 49 53 04 C4 74`
  - Instruction at ROM offset 0x044806
- **0x0449B8**: `LD (nn), HL` -- bytes: `90 F7 07 22 8D 25 D0 CD 49 53 04 C4 74`
  - Instruction at ROM offset 0x0449B7
- **0x044B54**: `LD (nn), HL` -- bytes: `90 F7 07 22 8D 25 D0 CD 49 53 04 C4 74`
  - Instruction at ROM offset 0x044B53
- **0x059583**: `LD (nn), HL` -- bytes: `00 00 19 22 8D 25 D0 2A 90 25 D0 11 F6`
  - Instruction at ROM offset 0x059582
- **0x05B331**: `LD (nn), HL` -- bytes: `CB 22 D0 22 8D 25 D0 D1 CD 7F 32 08 97`
  - Instruction at ROM offset 0x05B330
- **0x061DE2**: `LD (nn), HL` -- bytes: `25 D0 19 22 8D 25 D0 E1 22 E0 08 D0 3A`
  - Instruction at ROM offset 0x061DE1
- **0x061E87**: `LD (nn), HL` -- bytes: `25 D0 19 22 8D 25 D0 E1 22 E0 08 D0 DD`
  - Instruction at ROM offset 0x061E86
- **0x06CA19**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 CD 02 29 08 3A 6D`
  - Instruction at ROM offset 0x06CA18
- **0x06CB81**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 C5 F5 CD 0D DA 06`
  - Instruction at ROM offset 0x06CB80
- **0x06DA1A**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 CA D6 E5 06 CD 8E`
  - Instruction at ROM offset 0x06DA19
- **0x06DF90**: `LD (nn), HL` -- bytes: `00 00 19 22 8D 25 D0 C9 FD CB 4B D6 32`
  - Instruction at ROM offset 0x06DF8F
- **0x06EE3C**: `LD (nn), HL` -- bytes: `04 30 04 22 8D 25 D0 FD CB 02 86 3A 6D`
  - Instruction at ROM offset 0x06EE3B
- **0x0821D3**: `LD (nn), HL` -- bytes: `F5 19 09 22 8D 25 D0 2B E5 D1 ED 42 F1`
  - Instruction at ROM offset 0x0821D2
- **0x082710**: `LD (nn), HL` -- bytes: `B7 ED 42 22 8D 25 D0 CD D6 24 08 2A 87`
  - Instruction at ROM offset 0x08270F
- **0x08292C**: `LD (nn), HL` -- bytes: `B7 ED 52 22 8D 25 D0 C9 CD 96 F7 07 CD`
  - Instruction at ROM offset 0x08292B
- **0x08297A**: `ED LD (nn), DE` -- bytes: `F9 07 ED 53 8D 25 D0 C9 3A 24 06 D0 E6`
  - Instruction at ROM offset 0x082978
- **0x082F8B**: `LD (nn), HL` -- bytes: `10 E7 E1 22 8D 25 D0 ED 4B 77 25 D0 ED`
  - Instruction at ROM offset 0x082F8A
- **0x082FFC**: `LD (nn), HL` -- bytes: `25 D0 09 22 8D 25 D0 ED 42 B7 CD CE 30`
  - Instruction at ROM offset 0x082FFB
- **0x08300C**: `LD (nn), HL` -- bytes: `10 D7 E1 22 8D 25 D0 ED 4B 77 25 D0 ED`
  - Instruction at ROM offset 0x08300B
- **0x083675**: `LD (nn), HL` -- bytes: `C1 ED 42 22 8D 25 D0 ED 5B 87 25 D0 ED`
  - Instruction at ROM offset 0x083674
- **0x084963**: `LD (nn), HL` -- bytes: `BA 22 D0 22 8D 25 D0 C9 E1 C1 3A 49 1D`
  - Instruction at ROM offset 0x084962
- **0x09D841**: `LD (nn), HL` -- bytes: `BA 22 D0 22 8D 25 D0 CD B1 F5 05 CD AF`
  - Instruction at ROM offset 0x09D840
- **0x09DCB7**: `LD (nn), HL` -- bytes: `8A 25 D0 22 8D 25 D0 2A FA 07 D0 22 E0`
  - Instruction at ROM offset 0x09DCB6
- **0x09DEED**: `LD (nn), HL` -- bytes: `8A 25 D0 22 8D 25 D0 22 A0 25 D0 21 FF`
  - Instruction at ROM offset 0x09DEEC
- **0x0A9C71**: `LD (nn), HL` -- bytes: `BA 22 D0 22 8D 25 D0 CD 4B 29 08 2A 6F`
  - Instruction at ROM offset 0x0A9C70
- **0x0AA1C2**: `LD (nn), HL` -- bytes: `BA 22 D0 22 8D 25 D0 CD 98 2A 08 CD EA`
  - Instruction at ROM offset 0x0AA1C1
- **0x0AD819**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 CD 32 C7 06 28 51`
  - Instruction at ROM offset 0x0AD818
- **0x0B1680**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 11 4D 1D D0 CD 90`
  - Instruction at ROM offset 0x0B167F
- **0x0B30B8**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 C9 CD 73 2D 0B 3E`
  - Instruction at ROM offset 0x0B30B7
- **0x0BC730**: `LD (nn), HL` -- bytes: `04 30 04 22 8D 25 D0 D1 E1 FD CB 02 86`
  - Instruction at ROM offset 0x0BC72F
- **0x0BCD99**: `LD (nn), HL` -- bytes: `6D 25 D0 22 8D 25 D0 CD 20 1E 06 CD 32`
  - Instruction at ROM offset 0x0BCD98

### pTemp (0xD0259A) -- 2 WRITE(s)

- **0x08210D**: `LD (nn), HL` -- bytes: `B7 ED 42 22 9A 25 D0 FE 72 28 14 FE 3A`
  - Instruction at ROM offset 0x08210C
- **0x09DEF9**: `LD (nn), HL` -- bytes: `FF FF D3 22 9A 25 D0 22 90 25 D0 22 93`
  - Instruction at ROM offset 0x09DEF8

### progPtr (0xD0259D) -- 2 WRITE(s)

- **0x082130**: `LD (nn), HL` -- bytes: `B7 ED 42 22 9D 25 D0 ED 5B 93 25 D0 09`
  - Instruction at ROM offset 0x08212F
- **0x09DF05**: `LD (nn), HL` -- bytes: `93 25 D0 22 9D 25 D0 CD 8F A9 08 FD CB`
  - Instruction at ROM offset 0x09DF04

---

## All References by Symbol

### OPBase (0xD02590) -- 19 ref(s)

- `0x059587` [READ] LD HL, (nn) -- `8D 25 D0 2A 90 25 D0 11 F6 FF FF 19 22`
- `0x061DD2` [READ] LD HL, (nn) -- `D0 F1 C9 2A 90 25 D0 D1 19 22 93 25 D0`
- `0x061E05` [READ] ED LD BC, (nn) -- `42 E5 ED 4B 90 25 D0 2A 93 25 D0 ED 42`
- `0x061E57` [READ] ED LD BC, (nn) -- `42 E5 ED 4B 90 25 D0 2A 93 25 D0 ED 42`
- `0x061E77` [READ] LD HL, (nn) -- `00 00 C9 2A 90 25 D0 D1 19 22 93 25 D0`
- `0x0820F3` [READ] LD HL, (nn) -- `00 00 C5 2A 90 25 D0 B7 ED 42 22 90 25`
- `0x0820FA` [WRITE] LD (nn), HL -- `B7 ED 42 22 90 25 D0 3A FE 05 D0 FE 24`
- `0x08227A` [READ] ED LD BC, (nn) -- `25 D0 ED 4B 90 25 D0 03 11 00 00 00 AF`
- `0x082635` [READ] LD HL, (nn) -- `D0 D1 C1 2A 90 25 D0 09 22 90 25 D0 CD`
- `0x08263A` [WRITE] LD (nn), HL -- `25 D0 09 22 90 25 D0 CD CA 27 08 C9 CD`
- `0x082793` [READ] ED LD BC, (nn) -- `ED 42 ED 4B 90 25 D0 ED 42 D8 09 C3 45`
- `0x08326E` [READ] ED LD BC, (nn) -- `FF D3 ED 4B 90 25 D0 03 B7 ED 42 D8 09`
- `0x083298` [READ] ED LD BC, (nn) -- `08 B7 ED 4B 90 25 D0 ED 42 30 02 E1 C9`
- `0x083688` [READ] LD HL, (nn) -- `FD 24 08 2A 90 25 D0 ED 5B 93 25 D0 B7`
- `0x08369F` [WRITE] ED LD (nn), DE -- `25 D0 ED 53 90 25 D0 ED B8 ED 53 93 25`
- `0x0836AF` [WRITE] LD (nn), HL -- `9A 25 D0 22 90 25 D0 22 93 25 D0 C9 CD`
- `0x084705` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 90 25 D0 18 04 21 FF FF D3`
- `0x09DCAB` [READ] LD HL, (nn) -- `31 C6 08 2A 90 25 D0 22 93 25 D0 2A 8A`
- `0x09DEFD` [WRITE] LD (nn), HL -- `9A 25 D0 22 90 25 D0 22 93 25 D0 22 9D`

### OPS (0xD02593) -- 30 ref(s)

- `0x025683` [READ] LD HL, (nn) -- `06 ED 0F 2A 93 25 D0 23 B7 ED 42 DD E1`
- `0x059590` [WRITE] LD (nn), HL -- `FF FF 19 22 93 25 D0 C9 CD A6 BB 09 C8`
- `0x061DD8` [WRITE] LD (nn), HL -- `D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0 19`
- `0x061E09` [READ] LD HL, (nn) -- `90 25 D0 2A 93 25 D0 ED 42 E5 21 D1 1D`
- `0x061E5B` [READ] LD HL, (nn) -- `90 25 D0 2A 93 25 D0 ED 42 E5 21 76 1E`
- `0x061E7D` [WRITE] LD (nn), HL -- `D0 D1 19 22 93 25 D0 D1 2A 8A 25 D0 19`
- `0x0820B6` [READ] LD HL, (nn) -- `20 A6 C9 2A 93 25 D0 ED 4B 8D 25 D0 B7`
- `0x082135` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 93 25 D0 09 E5 ED 52 F5 E5`
- `0x082142` [WRITE] LD (nn), HL -- `EB ED 42 22 93 25 D0 23 E5 D1 09 C1 F1`
- `0x08261F` [READ] ED LD BC, (nn) -- `D1 C5 ED 4B 93 25 D0 E5 ED 42 E5 C1 E1`
- `0x08262F` [WRITE] ED LD (nn), DE -- `ED B8 ED 53 93 25 D0 D1 C1 2A 90 25 D0`
- `0x082CB1` [READ] LD HL, (nn) -- `CB 01 D6 2A 93 25 D0 23 ED 4B 8D 25 D0`
- `0x0831C8` [READ] LD HL, (nn) -- `19 2B E5 2A 93 25 D0 E5 ED 5B 6F 06 D0`
- `0x0831EB` [READ] ED LD DE, (nn) -- `19 2B ED 5B 93 25 D0 E5 C5 D5 2A 93 25`
- `0x0831F2` [READ] LD HL, (nn) -- `E5 C5 D5 2A 93 25 D0 ED 5B 8D 25 D0 B7`
- `0x08368D` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 93 25 D0 B7 ED 52 28 15 E5`
- `0x0836A6` [WRITE] ED LD (nn), DE -- `ED B8 ED 53 93 25 D0 C9 2A 9A 25 D0 22`
- `0x0836B3` [WRITE] LD (nn), HL -- `90 25 D0 22 93 25 D0 C9 CD 9E 27 08 28`
- `0x0978F2` [READ] LD HL, (nn) -- `24 D0 EB 2A 93 25 D0 22 3D 24 D0 22 40`
- `0x09BAD2` [READ] LD HL, (nn) -- `03 18 EC 2A 93 25 D0 23 7E C9 2A 93 25`
- `0x09BAD9` [READ] LD HL, (nn) -- `23 7E C9 2A 93 25 D0 23 18 F6 CD F5 BA`
- `0x09BEF8` [READ] LD HL, (nn) -- `2B 08 C1 2A 93 25 D0 CD 64 C8 04 77 2B`
- `0x09BF07` [READ] LD HL, (nn) -- `71 18 40 2A 93 25 D0 23 4E 23 46 23 7E`
- `0x09BF21` [READ] LD HL, (nn) -- `2B 08 C1 2A 93 25 D0 70 2B 71 18 1D 2A`
- `0x09BF2A` [READ] LD HL, (nn) -- `71 18 1D 2A 93 25 D0 23 01 00 00 00 4E`
- `0x09BF42` [READ] LD HL, (nn) -- `2B 08 F1 2A 93 25 D0 77 2B 22 93 25 D0`
- `0x09BF48` [WRITE] LD (nn), HL -- `D0 77 2B 22 93 25 D0 C9 CD 29 BF 09 2A`
- `0x09BF51` [READ] LD HL, (nn) -- `29 BF 09 2A 93 25 D0 23 7E 18 EF FE 96`
- `0x09DCAF` [WRITE] LD (nn), HL -- `90 25 D0 22 93 25 D0 2A 8A 25 D0 22 8D`
- `0x09DF01` [WRITE] LD (nn), HL -- `90 25 D0 22 93 25 D0 22 9D 25 D0 CD 8F`

### FPSbase (0xD0258A) -- 17 ref(s)

- `0x0272C9` [UNKNOWN] ??? -- `48 75 62 00 8A 25 D0 8D 25 D0 9A 25 D0`
- `0x03DD33` [READ] LD HL, (nn) -- `42 E3 03 2A 8A 25 D0 22 8D 25 D0 FD CB`
- `0x05957A` [READ] LD HL, (nn) -- `53 95 05 2A 8A 25 D0 11 09 00 00 19 22`
- `0x061DDD` [READ] LD HL, (nn) -- `25 D0 D1 2A 8A 25 D0 19 22 8D 25 D0 E1`
- `0x061DF8` [READ] ED LD BC, (nn) -- `D0 E5 ED 4B 8A 25 D0 2A 8D 25 D0 B7 ED`
- `0x061E4A` [READ] ED LD BC, (nn) -- `D0 E5 ED 4B 8A 25 D0 2A 8D 25 D0 B7 ED`
- `0x061E82` [READ] LD HL, (nn) -- `25 D0 D1 2A 8A 25 D0 19 22 8D 25 D0 E1`
- `0x0821BB` [READ] LD HL, (nn) -- `AF C9 F5 2A 8A 25 D0 C5 E5 09 22 8A 25`
- `0x0821C2` [WRITE] LD (nn), HL -- `C5 E5 09 22 8A 25 D0 ED 42 EB 2A 8D 25`
- `0x082216` [READ] ED LD DE, (nn) -- `19 2B ED 5B 8A 25 D0 1B ED B8 EB C1 CD`
- `0x0826FE` [READ] LD HL, (nn) -- `FD 24 08 2A 8A 25 D0 B7 ED 42 22 8A 25`
- `0x082705` [WRITE] LD (nn), HL -- `B7 ED 42 22 8A 25 D0 2A 8D 25 D0 B7 ED`
- `0x083631` [READ] LD HL, (nn) -- `22 98 25 2A 8A 25 D0 ED 5B 87 25 D0 ED`
- `0x083644` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 8A 25 D0 ED 52 28 22 E5 C1`
- `0x08367F` [WRITE] ED LD (nn), DE -- `25 D0 ED 53 8A 25 D0 1B CD FD 24 08 2A`
- `0x09DCB3` [READ] LD HL, (nn) -- `93 25 D0 2A 8A 25 D0 22 8D 25 D0 2A FA`
- `0x09DEE9` [WRITE] LD (nn), HL -- `87 25 D0 22 8A 25 D0 22 8D 25 D0 22 A0`

### FPS (0xD0258D) -- 132 ref(s)

- `0x02349D` [READ] LD HL, (nn) -- `DD E1 C9 2A 8D 25 D0 01 F9 FF FF 09 7E`
- `0x02567A` [READ] ED LD BC, (nn) -- `DD 39 ED 4B 8D 25 D0 DD 27 06 ED 0F 2A`
- `0x026EC0` [READ] LD HL, (nn) -- `55 FF FF 2A 8D 25 D0 09 CD AD C8 07 CD`
- `0x026F01` [READ] LD HL, (nn) -- `5E FF FF 2A 8D 25 D0 09 CD 31 70 02 E5`
- `0x026F23` [READ] LD HL, (nn) -- `5E FF FF 2A 8D 25 D0 09 CD FB F9 07 E1`
- `0x026F46` [READ] LD HL, (nn) -- `67 FF FF 2A 8D 25 D0 09 CD 07 FA 07 E1`
- `0x026F59` [READ] LD HL, (nn) -- `79 FF FF 2A 8D 25 D0 09 CD 07 FA 07 CD`
- `0x026FAA` [READ] LD HL, (nn) -- `AF FF FF 2A 8D 25 D0 09 CD 07 FA 07 E1`
- `0x026FD1` [READ] LD HL, (nn) -- `A6 FF FF 2A 8D 25 D0 09 CD FB F9 07 E1`
- `0x026FE4` [READ] LD HL, (nn) -- `B8 FF FF 2A 8D 25 D0 09 CD FB F9 07 01`
- `0x026FF1` [READ] LD HL, (nn) -- `D3 FF FF 2A 8D 25 D0 09 CD 07 FA 07 E1`
- `0x027053` [READ] LD HL, (nn) -- `0A E1 C9 2A 8D 25 D0 09 11 0E 06 D0 CD`
- `0x027079` [READ] LD HL, (nn) -- `4C FF FF 2A 8D 25 D0 09 C9 47 2A 60 01`
- `0x0272CC` [UNKNOWN] ??? -- `00 8A 25 D0 8D 25 D0 9A 25 D0 9D 25 D0`
- `0x0284BB` [READ] LD HL, (nn) -- `ED 62 C9 2A 8D 25 D0 19 E5 CD CB 84 02`
- `0x03DD37` [WRITE] LD (nn), HL -- `8A 25 D0 22 8D 25 D0 FD CB 0C A6 3A 96`
- `0x044719` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 3E 01 CD D3 F4 06`
- `0x044807` [WRITE] LD (nn), HL -- `00 00 19 22 8D 25 D0 CD 49 53 04 C4 74`
- `0x0449B8` [WRITE] LD (nn), HL -- `90 F7 07 22 8D 25 D0 CD 49 53 04 C4 74`
- `0x044B54` [WRITE] LD (nn), HL -- `90 F7 07 22 8D 25 D0 CD 49 53 04 C4 74`
- `0x045362` [READ] LD HL, (nn) -- `C4 09 C8 2A 8D 25 D0 11 E5 FF FF 19 7E`
- `0x056A8E` [READ] LD HL, (nn) -- `C9 BF C9 2A 8D 25 D0 11 F7 FF FF 19 EB`
- `0x056F1C` [READ] LD HL, (nn) -- `13 13 B7 2A 8D 25 D0 ED 42 ED B0 D1 CD`
- `0x05754A` [READ] LD HL, (nn) -- `01 2B D0 2A 8D 25 D0 01 36 00 00 C5 B7`
- `0x059583` [WRITE] LD (nn), HL -- `00 00 19 22 8D 25 D0 2A 90 25 D0 11 F6`
- `0x05AE32` [READ] LD HL, (nn) -- `C1 C9 EB 2A 8D 25 D0 B7 ED 52 D5 CD FB`
- `0x05B2B9` [READ] LD HL, (nn) -- `96 25 E5 2A 8D 25 D0 22 CB 22 D0 CD 8C`
- `0x05B331` [WRITE] LD (nn), HL -- `CB 22 D0 22 8D 25 D0 D1 CD 7F 32 08 97`
- `0x05B54C` [READ] ED LD DE, (nn) -- `00 19 ED 5B 8D 25 D0 CD 73 C9 04 30 19`
- `0x05BF34` [READ] LD HL, (nn) -- `07 D1 C9 2A 8D 25 D0 11 F8 05 D0 01 F7`
- `0x05DECD` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 CD 20 2A 08 CD 74`
- `0x05DF93` [READ] LD HL, (nn) -- `CB 84 02 2A 8D 25 D0 11 D3 FF FF 19 EB`
- `0x061DE2` [WRITE] LD (nn), HL -- `25 D0 19 22 8D 25 D0 E1 22 E0 08 D0 3A`
- `0x061DFC` [READ] LD HL, (nn) -- `8A 25 D0 2A 8D 25 D0 B7 ED 42 E5 ED 4B`
- `0x061E4E` [READ] LD HL, (nn) -- `8A 25 D0 2A 8D 25 D0 B7 ED 42 E5 ED 4B`
- `0x061E87` [WRITE] LD (nn), HL -- `25 D0 19 22 8D 25 D0 E1 22 E0 08 D0 DD`
- `0x06CA19` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 CD 02 29 08 3A 6D`
- `0x06CB81` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 C5 F5 CD 0D DA 06`
- `0x06DA1A` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 CA D6 E5 06 CD 8E`
- `0x06DF90` [WRITE] LD (nn), HL -- `00 00 19 22 8D 25 D0 C9 FD CB 4B D6 32`
- `0x06EE32` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 8D 25 D0 CD 73 C9 04 30 04`
- `0x06EE3C` [WRITE] LD (nn), HL -- `04 30 04 22 8D 25 D0 FD CB 02 86 3A 6D`
- `0x06F4E3` [READ] LD HL, (nn) -- `05 06 D0 2A 8D 25 D0 22 6D 25 D0 CD CF`
- `0x07C025` [READ] LD HL, (nn) -- `F7 07 EB 2A 8D 25 D0 B7 ED 52 CD FB F9`
- `0x07C097` [READ] FD LD IY, (nn) -- `77 E5 FD 2A 8D 25 D0 ED 33 F7 09 FD 17`
- `0x07C253` [READ] FD LD IY, (nn) -- `28 1F FD 2A 8D 25 D0 FD 17 FD DD 27 09`
- `0x07C29E` [READ] FD LD IY, (nn) -- `28 20 FD 2A 8D 25 D0 FD 17 FD DD 27 09`
- `0x07C2F3` [READ] FD LD IY, (nn) -- `28 29 FD 2A 8D 25 D0 FD 17 FD DD 27 0C`
- `0x07C622` [READ] LD HL, (nn) -- `07 06 00 2A 8D 25 D0 F1 F5 C5 CD C8 2B`
- `0x07F04B` [READ] LD HL, (nn) -- `29 08 C1 2A 8D 25 D0 3A 20 23 D0 48 47`
- `0x07FFDD` [READ] LD HL, (nn) -- `05 D0 C9 2A 8D 25 D0 22 BA 22 D0 C9 CD`
- `0x0820BB` [READ] ED LD BC, (nn) -- `25 D0 ED 4B 8D 25 D0 B7 ED 42 30 05 21`
- `0x0821C9` [READ] LD HL, (nn) -- `ED 42 EB 2A 8D 25 D0 ED 52 E5 F5 19 09`
- `0x0821D3` [WRITE] LD (nn), HL -- `F5 19 09 22 8D 25 D0 2B E5 D1 ED 42 F1`
- `0x08224C` [READ] LD HL, (nn) -- `C9 D5 E5 2A 8D 25 D0 B7 ED 52 28 0F E5`
- `0x08225D` [READ] LD HL, (nn) -- `D5 19 EB 2A 8D 25 D0 2B ED B8 C1 D1 C9`
- `0x0825F0` [READ] LD HL, (nn) -- `E5 19 EB 2A 8D 25 D0 B7 ED 52 E5 C1 E1`
- `0x082709` [READ] LD HL, (nn) -- `8A 25 D0 2A 8D 25 D0 B7 ED 42 22 8D 25`
- `0x082710` [WRITE] LD (nn), HL -- `B7 ED 42 22 8D 25 D0 CD D6 24 08 2A 87`
- `0x082917` [READ] LD HL, (nn) -- `09 00 00 2A 8D 25 D0 B7 ED 42 18 0C CD`
- `0x082925` [READ] LD HL, (nn) -- `F7 07 EB 2A 8D 25 D0 B7 ED 52 22 8D 25`
- `0x08292C` [WRITE] LD (nn), HL -- `B7 ED 52 22 8D 25 D0 C9 CD 96 F7 07 CD`
- `0x082939` [READ] LD HL, (nn) -- `B5 2B 08 2A 8D 25 D0 19 18 EC 21 2F 06`
- `0x082971` [READ] ED LD DE, (nn) -- `08 E1 ED 5B 8D 25 D0 CD 78 F9 07 ED 53`
- `0x08297A` [WRITE] ED LD (nn), DE -- `F9 07 ED 53 8D 25 D0 C9 3A 24 06 D0 E6`
- `0x0829D2` [READ] ED LD DE, (nn) -- `08 E1 ED 5B 8D 25 D0 CD 78 F9 07 23 23`
- `0x0829DE` [READ] LD HL, (nn) -- `23 18 97 2A 8D 25 D0 01 EE FF FF 09 11`
- `0x0829FD` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 6C C3 CC 2A 08`
- `0x082A11` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 36 C3 CC 2A 08`
- `0x082A25` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 3F 18 EA 11 03`
- `0x082A37` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 48 C3 CC 2A 08`
- `0x082A4B` [READ] LD HL, (nn) -- `03 06 D0 2A 8D 25 D0 0E 51 18 7A 11 F8`
- `0x082A57` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 63 18 6E 11 F8`
- `0x082A63` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 5A 18 62 11 03`
- `0x082A6F` [READ] LD HL, (nn) -- `03 06 D0 2A 8D 25 D0 0E 2D 18 56 11 2F`
- `0x082A91` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 24 18 34 11 F8`
- `0x082AC7` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 09 AF 47 CD 1C`
- `0x082AE9` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 12 18 DC 11 03`
- `0x082AFB` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 1B 18 CA 11 0E`
- `0x082B19` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 09 CD 1C C9 04`
- `0x082B42` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 12 18 D5 11 03`
- `0x082B60` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 1B 18 B7 11 24`
- `0x082B78` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 24 18 9F 11 F8`
- `0x082B8E` [READ] LD HL, (nn) -- `D0 0E 48 2A 8D 25 D0 18 8B 11 F8 05 D0`
- `0x082B98` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 36 C3 1E 2B 08`
- `0x082BAC` [READ] LD HL, (nn) -- `F8 05 D0 2A 8D 25 D0 0E 2D C3 1E 2B 08`
- `0x082BC5` [READ] LD HL, (nn) -- `08 18 F5 2A 8D 25 D0 11 F7 FF FF 19 C9`
- `0x082CB7` [READ] ED LD BC, (nn) -- `D0 23 ED 4B 8D 25 D0 B7 ED 42 11 0E 00`
- `0x082CEA` [READ] LD HL, (nn) -- `FD 2F 03 2A 8D 25 D0 DD 2F FD ED 27 DD`
- `0x082E28` [READ] FD LD IY, (nn) -- `0F FA FD 2A 8D 25 D0 DD 3E FD FD 27 00`
- `0x082F6C` [READ] LD HL, (nn) -- `C1 C9 47 2A 8D 25 D0 E5 C5 D5 ED 5B 6F`
- `0x082F8B` [WRITE] LD (nn), HL -- `10 E7 E1 22 8D 25 D0 ED 4B 77 25 D0 ED`
- `0x082FDD` [READ] LD HL, (nn) -- `08 D1 C1 2A 8D 25 D0 E5 C5 D5 ED 5B 6F`
- `0x082FF7` [READ] ED LD BC, (nn) -- `E1 E5 ED 4B 8D 25 D0 09 22 8D 25 D0 ED`
- `0x082FFC` [WRITE] LD (nn), HL -- `25 D0 09 22 8D 25 D0 ED 42 B7 CD CE 30`
- `0x08300C` [WRITE] LD (nn), HL -- `10 D7 E1 22 8D 25 D0 ED 4B 77 25 D0 ED`
- `0x0831B8` [READ] LD HL, (nn) -- `06 D0 EB 2A 8D 25 D0 B7 ED 52 22 78 06`
- `0x0831F7` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 8D 25 D0 B7 ED 52 EB 2A 72`
- `0x08363F` [READ] LD HL, (nn) -- `C8 D8 E5 2A 8D 25 D0 ED 5B 8A 25 D0 ED`
- `0x08366E` [READ] LD HL, (nn) -- `53 36 08 2A 8D 25 D0 C1 ED 42 22 8D 25`
- `0x083675` [WRITE] LD (nn), HL -- `C1 ED 42 22 8D 25 D0 ED 5B 87 25 D0 ED`
- `0x084963` [WRITE] LD (nn), HL -- `BA 22 D0 22 8D 25 D0 C9 E1 C1 3A 49 1D`
- `0x09480E` [READ] LD HL, (nn) -- `11 FE E5 2A 8D 25 D0 B7 ED 52 D1 1A 13`
- `0x096A5D` [READ] LD HL, (nn) -- `1B 00 00 2A 8D 25 D0 11 09 00 00 B7 ED`
- `0x096AA1` [READ] LD HL, (nn) -- `F1 E5 C1 2A 8D 25 D0 E5 11 08 00 00 19`
- `0x096AE2` [READ] LD HL, (nn) -- `0D FA 07 2A 8D 25 D0 CD FB F9 07 FE 04`
- `0x0978E5` [READ] LD HL, (nn) -- `C9 D5 E5 2A 8D 25 D0 22 37 24 D0 22 3A`
- `0x09B13B` [READ] LD HL, (nn) -- `09 18 EA 2A 8D 25 D0 11 F7 FF FF 19 7E`
- `0x09C6C1` [READ] LD HL, (nn) -- `12 ED 4C 2A 8D 25 D0 B7 ED 42 01 09 00`
- `0x09C6D5` [READ] LD HL, (nn) -- `12 ED 4C 2A 8D 25 D0 B7 ED 42 C3 FB F9`
- `0x09D841` [WRITE] LD (nn), HL -- `BA 22 D0 22 8D 25 D0 CD B1 F5 05 CD AF`
- `0x09DB17` [READ] LD HL, (nn) -- `F6 05 C9 2A 8D 25 D0 11 1B 00 00 B7 ED`
- `0x09DB2F` [READ] ED LD DE, (nn) -- `19 2B ED 5B 8D 25 D0 1B ED B8 C9 CD 8D`
- `0x09DCB7` [WRITE] LD (nn), HL -- `8A 25 D0 22 8D 25 D0 2A FA 07 D0 22 E0`
- `0x09DEED` [WRITE] LD (nn), HL -- `8A 25 D0 22 8D 25 D0 22 A0 25 D0 21 FF`
- `0x0A5596` [READ] LD HL, (nn) -- `CB 84 02 2A 8D 25 D0 11 C1 FF FF 19 EB`
- `0x0A9C71` [WRITE] LD (nn), HL -- `BA 22 D0 22 8D 25 D0 CD 4B 29 08 2A 6F`
- `0x0AA1C2` [WRITE] LD (nn), HL -- `BA 22 D0 22 8D 25 D0 CD 98 2A 08 CD EA`
- `0x0AD819` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 CD 32 C7 06 28 51`
- `0x0AE399` [READ] LD HL, (nn) -- `10 20 0C 2A 8D 25 D0 22 7B 06 D0 CD 61`
- `0x0AF94E` [READ] LD HL, (nn) -- `37 18 29 2A 8D 25 D0 11 E5 FF FF 19 11`
- `0x0AFA25` [READ] LD HL, (nn) -- `FB 0A E5 2A 8D 25 D0 11 E5 FF FF 19 22`
- `0x0AFA9B` [READ] LD HL, (nn) -- `00 CE E5 2A 8D 25 D0 11 F7 FF FF 19 22`
- `0x0AFC41` [READ] LD HL, (nn) -- `FB F9 07 2A 8D 25 D0 11 DC FF FF 19 EB`
- `0x0B14BA` [READ] LD HL, (nn) -- `6E 02 C9 2A 8D 25 D0 22 F9 1F D0 CD C2`
- `0x0B15A1` [READ] LD HL, (nn) -- `D0 18 97 2A 8D 25 D0 22 6D 25 D0 21 5A`
- `0x0B1680` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 11 4D 1D D0 CD 90`
- `0x0B16EF` [READ] LD HL, (nn) -- `C4 09 C8 2A 8D 25 D0 11 F7 FF FF 19 7E`
- `0x0B30B8` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 C9 CD 73 2D 0B 3E`
- `0x0BC726` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 8D 25 D0 CD 73 C9 04 30 04`
- `0x0BC730` [WRITE] LD (nn), HL -- `04 30 04 22 8D 25 D0 D1 E1 FD CB 02 86`
- `0x0BCD99` [WRITE] LD (nn), HL -- `6D 25 D0 22 8D 25 D0 CD 20 1E 06 CD 32`

### pTemp (0xD0259A) -- 30 ref(s)

- `0x0272CF` [UNKNOWN] ??? -- `D0 8D 25 D0 9A 25 D0 9D 25 D0 F8 05 D0`
- `0x028AF5` [READ] ED LD BC, (nn) -- `FF D3 ED 4B 9A 25 D0 B7 ED 42 D8 C8 09`
- `0x029E29` [READ] ED LD BC, (nn) -- `FF D3 ED 4B 9A 25 D0 B7 ED 42 D8 C8 09`
- `0x03F218` [READ] ED LD BC, (nn) -- `00 00 ED 4B 9A 25 D0 B7 ED 42 38 4B 28`
- `0x04A57E` [READ] LD HL, (nn) -- `48 77 D1 2A 9A 25 D0 22 4B 77 D1 C9 21`
- `0x06B733` [READ] ED LD BC, (nn) -- `00 C5 ED 4B 9A 25 D0 B7 ED 42 DA F6 B7`
- `0x06F502` [READ] LD HL, (nn) -- `FF D3 EB 2A 9A 25 D0 B7 ED 52 C8 EB E5`
- `0x082106` [READ] LD HL, (nn) -- `24 28 2E 2A 9A 25 D0 B7 ED 42 22 9A 25`
- `0x08210D` [WRITE] LD (nn), HL -- `B7 ED 42 22 9A 25 D0 FE 72 28 14 FE 3A`
- `0x082275` [READ] LD HL, (nn) -- `52 D0 D5 2A 9A 25 D0 ED 4B 90 25 D0 03`
- `0x082733` [READ] LD HL, (nn) -- `04 18 C7 2A 9A 25 D0 B7 18 04 21 FF FF`
- `0x0827D0` [UNKNOWN] ??? -- `D7 2A D0 21 9A 25 D0 CD 23 28 08 21 9D`
- `0x08328D` [READ] LD HL, (nn) -- `53 96 25 2A 9A 25 D0 E5 CD E1 2B 08 B7`
- `0x0833A9` [READ] ED LD DE, (nn) -- `25 D0 ED 5B 9A 25 D0 47 3E 08 90 28 17`
- `0x08369A` [READ] ED LD DE, (nn) -- `C1 19 ED 5B 9A 25 D0 ED 53 90 25 D0 ED`
- `0x0836AB` [READ] LD HL, (nn) -- `25 D0 C9 2A 9A 25 D0 22 90 25 D0 22 93`
- `0x083858` [READ] ED LD DE, (nn) -- `20 08 ED 5B 9A 25 D0 2A 9D 25 D0 C1 4F`
- `0x0839AC` [READ] LD HL, (nn) -- `7E FB 77 2A 9A 25 D0 B7 ED 52 38 05 B7`
- `0x084535` [READ] ED LD DE, (nn) -- `2F FD ED 5B 9A 25 D0 B7 ED 52 28 02 30`
- `0x084700` [READ] LD HL, (nn) -- `24 20 0B 2A 9A 25 D0 ED 5B 90 25 D0 18`
- `0x084FF5` [READ] ED LD DE, (nn) -- `ED 52 ED 5B 9A 25 D0 CD 73 C9 04 20 81`
- `0x09DEF9` [WRITE] LD (nn), HL -- `FF FF D3 22 9A 25 D0 22 90 25 D0 22 93`
- `0x0A5F5A` [READ] ED LD DE, (nn) -- `ED 52 ED 5B 9A 25 D0 CD 73 C9 04 D1 C9`
- `0x0A5FC5` [READ] LD HL, (nn) -- `0A 20 04 2A 9A 25 D0 CD 6D 5F 0A C8 CD`
- `0x0B7D36` [READ] LD HL, (nn) -- `BB 7C 0B 2A 9A 25 D0 E5 CD A3 9A 09 2A`
- `0x0B7D3F` [READ] LD HL, (nn) -- `A3 9A 09 2A 9A 25 D0 D1 CD 73 C9 04 20`
- `0x0B7E9D` [READ] LD HL, (nn) -- `BB 7C 0B 2A 9A 25 D0 E5 CD 47 AC 0B 2A`
- `0x0B7EA6` [READ] LD HL, (nn) -- `47 AC 0B 2A 9A 25 D0 D1 CD 73 C9 04 20`
- `0x0B90AE` [READ] LD HL, (nn) -- `0B 20 04 2A 9A 25 D0 CD F0 91 0B C8 22`
- `0x0B91DD` [READ] ED LD DE, (nn) -- `ED 52 ED 5B 9A 25 D0 CD 73 C9 04 D1 C9`

### progPtr (0xD0259D) -- 13 ref(s)

- `0x0272D2` [UNKNOWN] ??? -- `D0 9A 25 D0 9D 25 D0 F8 05 D0 7E 98 D1`
- `0x082129` [READ] LD HL, (nn) -- `08 28 0B 2A 9D 25 D0 B7 ED 42 22 9D 25`
- `0x082130` [WRITE] LD (nn), HL -- `B7 ED 42 22 9D 25 D0 ED 5B 93 25 D0 09`
- `0x0827D8` [UNKNOWN] ??? -- `23 28 08 21 9D 25 D0 CD 23 28 08 21 4E`
- `0x0833A4` [READ] LD HL, (nn) -- `CD 20 08 2A 9D 25 D0 ED 5B 9A 25 D0 47`
- `0x0833B6` [READ] ED LD DE, (nn) -- `18 09 ED 5B 9D 25 D0 21 FF FF D3 E5 21`
- `0x08385C` [READ] LD HL, (nn) -- `9A 25 D0 2A 9D 25 D0 C1 4F C5 13 AF 47`
- `0x083934` [READ] ED LD DE, (nn) -- `27 06 ED 5B 9D 25 D0 B7 ED 52 38 3B 28`
- `0x0844D7` [READ] ED LD DE, (nn) -- `27 FD ED 5B 9D 25 D0 B7 ED 52 ED 23 FA`
- `0x0846F4` [READ] ED LD DE, (nn) -- `38 08 ED 5B 9D 25 D0 3A F9 05 D0 FE 24`
- `0x084F7C` [READ] LD HL, (nn) -- `C0 68 08 2A 9D 25 D0 7E E6 3F 47 2B 7E`
- `0x09C11B` [READ] ED LD DE, (nn) -- `B8 23 ED 5B 9D 25 D0 13 D5 B7 ED 52 28`
- `0x09DF05` [WRITE] LD (nn), HL -- `93 25 D0 22 9D 25 D0 CD 8F A9 08 FD CB`

### userMem (0xD1A881) -- 2 ref(s)

- `0x042B16` [UNKNOWN] ??? -- `DD 0F FD 01 81 A8 D1 DD 0F FD DD 27 FD`
- `0x09DEE1` [UNKNOWN] ??? -- `2F D0 C9 21 81 A8 D1 22 87 25 D0 22 8A`

---

## Potential Initialization Clusters

Locations where multiple allocator pointers are written within 64 bytes of each other:

### Cluster 1: ROM 0x059583..0x059590 (2 symbols: FPS, OPS)

- FPS at 0x059583: LD (nn), HL
- OPS at 0x059590: LD (nn), HL

### Cluster 2: ROM 0x061DD8..0x061DE2 (2 symbols: OPS, FPS)

- OPS at 0x061DD8: LD (nn), HL
- FPS at 0x061DE2: LD (nn), HL

### Cluster 3: ROM 0x061E7D..0x061E87 (2 symbols: OPS, FPS)

- OPS at 0x061E7D: LD (nn), HL
- FPS at 0x061E87: LD (nn), HL

### Cluster 4: ROM 0x0820FA..0x082142 (4 symbols: OPBase, pTemp, progPtr, OPS)

- OPBase at 0x0820FA: LD (nn), HL
- pTemp at 0x08210D: LD (nn), HL
- progPtr at 0x082130: LD (nn), HL
- OPS at 0x082142: LD (nn), HL

### Cluster 5: ROM 0x0821C2..0x0821D3 (2 symbols: FPSbase, FPS)

- FPSbase at 0x0821C2: LD (nn), HL
- FPS at 0x0821D3: LD (nn), HL

### Cluster 6: ROM 0x08262F..0x08263A (2 symbols: OPS, OPBase)

- OPS at 0x08262F: ED LD (nn), DE
- OPBase at 0x08263A: LD (nn), HL

### Cluster 7: ROM 0x082705..0x082710 (2 symbols: FPSbase, FPS)

- FPSbase at 0x082705: LD (nn), HL
- FPS at 0x082710: LD (nn), HL

### Cluster 8: ROM 0x082FFC..0x08300C (1 symbols: FPS)

- FPS at 0x082FFC: LD (nn), HL
- FPS at 0x08300C: LD (nn), HL

### Cluster 9: ROM 0x083675..0x0836B3 (4 symbols: FPS, FPSbase, OPBase, OPS)

- FPS at 0x083675: LD (nn), HL
- FPSbase at 0x08367F: ED LD (nn), DE
- OPBase at 0x08369F: ED LD (nn), DE
- OPS at 0x0836A6: ED LD (nn), DE
- OPBase at 0x0836AF: LD (nn), HL
- OPS at 0x0836B3: LD (nn), HL

### Cluster 10: ROM 0x09DCAF..0x09DCB7 (2 symbols: OPS, FPS)

- OPS at 0x09DCAF: LD (nn), HL
- FPS at 0x09DCB7: LD (nn), HL

### Cluster 11: ROM 0x09DEE9..0x09DF05 (6 symbols: FPSbase, FPS, pTemp, OPBase, OPS, progPtr)

- FPSbase at 0x09DEE9: LD (nn), HL
- FPS at 0x09DEED: LD (nn), HL
- pTemp at 0x09DEF9: LD (nn), HL
- OPBase at 0x09DEFD: LD (nn), HL
- OPS at 0x09DF01: LD (nn), HL
- progPtr at 0x09DF05: LD (nn), HL
