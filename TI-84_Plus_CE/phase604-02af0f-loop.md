# Phase 604: 0x02AF0F / 0x002696 Loop Decode

ROM: `TI-84_Plus_CE\ROM.rom` (4194304 bytes)

This probe disassembles short eZ80 ADL windows at the five addresses from the wipe call-chain trace. It uses a focused decoder for branch, immediate, compare, return, pointer, and block-transfer opcodes needed for loop triage; unknown bytes are emitted as `DB` so the raw stream remains visible.

## 0x02AF0F - loop/control candidate

| Address | Bytes | Instruction |
|---|---|---|
| 0x02AF0F | `DD` | `DB 0xDD` |
| 0x02AF10 | `07` | `DB 0x07` |
| 0x02AF11 | `F4` | `DB 0xF4` |
| 0x02AF12 | `DD` | `DB 0xDD` |
| 0x02AF13 | `27` | `DB 0x27` |
| 0x02AF14 | `FA` | `DB 0xFA` |
| 0x02AF15 | `B7` | `OR A` |
| 0x02AF16 | `ED 42` | `ED 0x42` |
| 0x02AF18 | `CD 18 02 00` | `CALL 0x000218` |
| 0x02AF1C | `FA` | `DB 0xFA` |
| 0x02AF1D | `2B` | `DEC HL` |
| 0x02AF1E | `AF` | `XOR A` |
| 0x02AF1F | `02` | `LD (BC),A` |
| 0x02AF20 | `18 40` | `JR 0x02AF62 (+64)` |
| 0x02AF22 | `01 00 00 00` | `LD BC,0x000000` |
| 0x02AF26 | `DD` | `DB 0xDD` |
| 0x02AF27 | `0F` | `DB 0x0F` |
| 0x02AF28 | `FA` | `DB 0xFA` |
| 0x02AF29 | `18 E4` | `JR 0x02AF0F (-28)` |
| 0x02AF2B | `DD` | `DB 0xDD` |
| 0x02AF2C | `07` | `DB 0x07` |
| 0x02AF2D | `FA` | `DB 0xFA` |
| 0x02AF2E | `DD` | `DB 0xDD` |
| 0x02AF2F | `27` | `DB 0x27` |
| 0x02AF30 | `F7` | `DB 0xF7` |
| 0x02AF31 | `09` | `DB 0x09` |
| 0x02AF32 | `E5` | `PUSH HL` |
| 0x02AF33 | `FD` | `DB 0xFD` |
| 0x02AF34 | `E1` | `DB 0xE1` |
| 0x02AF35 | `DD` | `DB 0xDD` |
| 0x02AF36 | `27` | `DB 0x27` |
| 0x02AF37 | `FD` | `DB 0xFD` |
| 0x02AF38 | `01 B3 40 D1` | `LD BC,0xD140B3` |
| 0x02AF3C | `09` | `DB 0x09` |
| 0x02AF3D | `FD` | `DB 0xFD` |
| 0x02AF3E | `7E` | `LD A,(HL)` |
| 0x02AF3F | `00` | `NOP` |
| 0x02AF40 | `77` | `LD (HL),A` |
| 0x02AF41 | `DD` | `DB 0xDD` |
| 0x02AF42 | `07` | `DB 0x07` |
| 0x02AF43 | `FD` | `DB 0xFD` |
| 0x02AF44 | `03` | `INC BC` |
| 0x02AF45 | `DD` | `DB 0xDD` |
| 0x02AF46 | `0F` | `DB 0x0F` |
| 0x02AF47 | `FD` | `DB 0xFD` |
| 0x02AF48 | `01 B3 40 D1` | `LD BC,0xD140B3` |
| 0x02AF4C | `DD` | `DB 0xDD` |
| 0x02AF4D | `27` | `DB 0x27` |
| 0x02AF4E | `FD` | `DB 0xFD` |

Findings:
- No direct CALL to another focus target in this decoded window.
- Loop-like backward branch(es): JR from 0x02AF29 to 0x02AF0F.
- Pointer/block-operation hints: 0x02AF1D DEC HL.
- Condition/test hints: 0x02AF15 OR A; 0x02AF1E XOR A.
- CALL targets: 0x000218 from 0x02AF18.
- JP/JR/DJNZ targets: JR 0x02AF62 from 0x02AF20, JR 0x02AF0F from 0x02AF29.

## 0x002696 - loop/body companion candidate

| Address | Bytes | Instruction |
|---|---|---|
| 0x002696 | `C5` | `DB 0xC5` |
| 0x002697 | `F5` | `PUSH AF` |
| 0x002698 | `C1` | `DB 0xC1` |
| 0x002699 | `CB` | `DB 0xCB` |
| 0x00269A | `51` | `DB 0x51` |
| 0x00269B | `28 04` | `JR Z 0x0026A1 (+4)` |
| 0x00269D | `79` | `DB 0x79` |
| 0x00269E | `EE` | `DB 0xEE` |
| 0x00269F | `80` | `DB 0x80` |
| 0x0026A0 | `4F` | `DB 0x4F` |
| 0x0026A1 | `C5` | `DB 0xC5` |
| 0x0026A2 | `F1` | `POP AF` |
| 0x0026A3 | `C1` | `DB 0xC1` |
| 0x0026A4 | `C9` | `RET` |
| 0x0026A5 | `DD` | `DB 0xDD` |
| 0x0026A6 | `E5` | `PUSH HL` |
| 0x0026A7 | `F5` | `PUSH AF` |
| 0x0026A8 | `DD` | `DB 0xDD` |
| 0x0026A9 | `09` | `DB 0x09` |
| 0x0026AA | `F1` | `POP AF` |
| 0x0026AB | `DD` | `DB 0xDD` |
| 0x0026AC | `27` | `DB 0x27` |
| 0x0026AD | `00` | `NOP` |
| 0x0026AE | `DD` | `DB 0xDD` |
| 0x0026AF | `E1` | `DB 0xE1` |
| 0x0026B0 | `C9` | `RET` |
| 0x0026B1 | `FD` | `DB 0xFD` |
| 0x0026B2 | `E5` | `PUSH HL` |
| 0x0026B3 | `F5` | `PUSH AF` |
| 0x0026B4 | `FD` | `DB 0xFD` |
| 0x0026B5 | `09` | `DB 0x09` |
| 0x0026B6 | `F1` | `POP AF` |
| 0x0026B7 | `FD` | `DB 0xFD` |
| 0x0026B8 | `27` | `DB 0x27` |
| 0x0026B9 | `00` | `NOP` |
| 0x0026BA | `FD` | `DB 0xFD` |
| 0x0026BB | `E1` | `DB 0xE1` |
| 0x0026BC | `C9` | `RET` |
| 0x0026BD | `F5` | `PUSH AF` |
| 0x0026BE | `C5` | `DB 0xC5` |
| 0x0026BF | `D5` | `DB 0xD5` |
| 0x0026C0 | `50` | `DB 0x50` |
| 0x0026C1 | `5D` | `DB 0x5D` |
| 0x0026C2 | `44` | `DB 0x44` |
| 0x0026C3 | `61` | `DB 0x61` |
| 0x0026C4 | `ED 4C` | `ED 0x4C` |
| 0x0026C6 | `ED 5C` | `ED 0x5C` |
| 0x0026C8 | `ED 6C` | `ED 0x6C` |
| 0x0026CA | `7C` | `DB 0x7C` |
| 0x0026CB | `81` | `DB 0x81` |
| 0x0026CC | `83` | `DB 0x83` |
| 0x0026CD | `67` | `DB 0x67` |
| 0x0026CE | `D1` | `DB 0xD1` |
| 0x0026CF | `C1` | `DB 0xC1` |
| 0x0026D0 | `F1` | `POP AF` |
| 0x0026D1 | `C9` | `RET` |
| 0x0026D2 | `F5` | `PUSH AF` |
| 0x0026D3 | `7D` | `DB 0x7D` |
| 0x0026D4 | `B1` | `DB 0xB1` |
| 0x0026D5 | `6F` | `DB 0x6F` |

Findings:
- No direct CALL to another focus target in this decoded window.
- No backward JR/DJNZ loop detected inside this window.
- No obvious pointer increment/decrement or LDIR/LDDR hint in this short window.
- Condition/test hints: 0x00269B JR Z 0x0026A1 (+4).
- JP/JR/DJNZ targets: JR Z 0x0026A1 from 0x00269B.

## 0x0BCB2F - post-loop transition

| Address | Bytes | Instruction |
|---|---|---|
| 0x0BCB2F | `21 FD FF FF` | `LD HL,0xFFFFFD` |
| 0x0BCB33 | `CD 2C 01 00` | `CALL 0x00012C` |
| 0x0BCB37 | `01 00 00 00` | `LD BC,0x000000` |
| 0x0BCB3B | `DD` | `DB 0xDD` |
| 0x0BCB3C | `0F` | `DB 0x0F` |
| 0x0BCB3D | `FD` | `DB 0xFD` |
| 0x0BCB3E | `21 47 CB 0B` | `LD HL,0x0BCB47` |
| 0x0BCB42 | `DD` | `DB 0xDD` |
| 0x0BCB43 | `F9` | `DB 0xF9` |
| 0x0BCB44 | `DD` | `DB 0xDD` |
| 0x0BCB45 | `E1` | `DB 0xE1` |
| 0x0BCB46 | `C9` | `RET` |
| 0x0BCB47 | `3E 03` | `LD A, 0x03` |
| 0x0BCB49 | `54` | `DB 0x54` |
| 0x0BCB4A | `00` | `NOP` |
| 0x0BCB4B | `65` | `DB 0x65` |
| 0x0BCB4C | `00` | `NOP` |
| 0x0BCB4D | `78` | `DB 0x78` |
| 0x0BCB4E | `00` | `NOP` |
| 0x0BCB4F | `61` | `DB 0x61` |
| 0x0BCB50 | `00` | `NOP` |
| 0x0BCB51 | `73` | `DB 0x73` |
| 0x0BCB52 | `00` | `NOP` |
| 0x0BCB53 | `20 00` | `JR NZ 0x0BCB55 (+0)` |
| 0x0BCB55 | `49` | `DB 0x49` |
| 0x0BCB56 | `00` | `NOP` |
| 0x0BCB57 | `6E` | `DB 0x6E` |
| 0x0BCB58 | `00` | `NOP` |
| 0x0BCB59 | `73` | `DB 0x73` |
| 0x0BCB5A | `00` | `NOP` |
| 0x0BCB5B | `74` | `DB 0x74` |
| 0x0BCB5C | `00` | `NOP` |
| 0x0BCB5D | `72` | `DB 0x72` |
| 0x0BCB5E | `00` | `NOP` |

Findings:
- No direct CALL to another focus target in this decoded window.
- No backward JR/DJNZ loop detected inside this window.
- No obvious pointer increment/decrement or LDIR/LDDR hint in this short window.
- Condition/test hints: 0x0BCB53 JR NZ 0x0BCB55 (+0).
- CALL targets: 0x00012C from 0x0BCB33.
- JP/JR/DJNZ targets: JR NZ 0x0BCB55 from 0x0BCB53.

## 0x0013C3 - post-transition dispatcher candidate

| Address | Bytes | Instruction |
|---|---|---|
| 0x0013C3 | `CD 88 19 00` | `CALL 0x001988` |
| 0x0013C7 | `3E D0` | `LD A, 0xD0` |
| 0x0013C9 | `ED 6D` | `ED 0x6D` |
| 0x0013CB | `ED 56` | `ED 0x56` |
| 0x0013CD | `FD` | `DB 0xFD` |
| 0x0013CE | `21 80 00 D0` | `LD HL,0xD00080` |
| 0x0013D2 | `FD` | `DB 0xFD` |
| 0x0013D3 | `CB` | `DB 0xCB` |
| 0x0013D4 | `1B` | `DEC DE` |
| 0x0013D5 | `B6` | `DB 0xB6` |
| 0x0013D6 | `CD DE 58 01` | `CALL 0x0158DE` |
| 0x0013DA | `28 08` | `JR Z 0x0013E4 (+8)` |
| 0x0013DC | `ED 38` | `ED 0x38` |
| 0x0013DE | `0C` | `INC C` |
| 0x0013DF | `CB` | `DB 0xCB` |
| 0x0013E0 | `D7` | `DB 0xD7` |
| 0x0013E1 | `ED 39` | `ED 0x39` |
| 0x0013E3 | `0C` | `INC C` |
| 0x0013E4 | `CD 53 18 00` | `CALL 0x001853` |
| 0x0013E8 | `F3` | `DB 0xF3` |
| 0x0013E9 | `ED 38` | `ED 0x38` |
| 0x0013EB | `0F` | `DB 0x0F` |
| 0x0013EC | `CB` | `DB 0xCB` |
| 0x0013ED | `7F` | `DB 0x7F` |
| 0x0013EE | `20 08` | `JR NZ 0x0013F8 (+8)` |
| 0x0013F0 | `CD 05 3B 00` | `CALL 0x003B05` |

Findings:
- Calls another focus target: 0x001988.
- No backward JR/DJNZ loop detected inside this window.
- Pointer/block-operation hints: 0x0013D4 DEC DE.
- Condition/test hints: 0x0013DA JR Z 0x0013E4 (+8); 0x0013EE JR NZ 0x0013F8 (+8).
- CALL targets: 0x001988 from 0x0013C3, 0x0158DE from 0x0013D6, 0x001853 from 0x0013E4, 0x003B05 from 0x0013F0.
- JP/JR/DJNZ targets: JR Z 0x0013E4 from 0x0013DA, JR NZ 0x0013F8 from 0x0013EE.

## 0x001988 - pre-0x0158xx condition candidate

| Address | Bytes | Instruction |
|---|---|---|
| 0x001988 | `F3` | `DB 0xF3` |
| 0x001989 | `C5` | `DB 0xC5` |
| 0x00198A | `ED 38` | `ED 0x38` |
| 0x00198C | `03` | `INC BC` |
| 0x00198D | `CB` | `DB 0xCB` |
| 0x00198E | `67` | `DB 0x67` |
| 0x00198F | `20 18` | `JR NZ 0x0019A9 (+24)` |
| 0x001991 | `40` | `DB 0x40` |
| 0x001992 | `01 05 10 3E` | `LD BC,0x3E1005` |
| 0x001996 | `04` | `INC B` |
| 0x001997 | `ED 79` | `ED 0x79` |
| 0x001999 | `FE 04` | `CP A, 0x04` |
| 0x00199B | `28 01` | `JR Z 0x00199E (+1)` |
| 0x00199D | `CF` | `DB 0xCF` |
| 0x00199E | `78` | `DB 0x78` |
| 0x00199F | `FE 10` | `CP A, 0x10` |
| 0x0019A1 | `28 01` | `JR Z 0x0019A4 (+1)` |
| 0x0019A3 | `CF` | `DB 0xCF` |
| 0x0019A4 | `79` | `DB 0x79` |
| 0x0019A5 | `FE 05` | `CP A, 0x05` |
| 0x0019A7 | `20 FA` | `JR NZ 0x0019A3 (-6)` |

Findings:
- No direct CALL to another focus target in this decoded window.
- Loop-like backward branch(es): JR NZ from 0x0019A7 to 0x0019A3.
- No obvious pointer increment/decrement or LDIR/LDDR hint in this short window.
- Condition/test hints: 0x00198F JR NZ 0x0019A9 (+24); 0x001999 CP A, 0x04; 0x00199B JR Z 0x00199E (+1); 0x00199F CP A, 0x10; 0x0019A1 JR Z 0x0019A4 (+1); 0x0019A5 CP A, 0x05; 0x0019A7 JR NZ 0x0019A3 (-6).
- JP/JR/DJNZ targets: JR NZ 0x0019A9 from 0x00198F, JR Z 0x00199E from 0x00199B, JR Z 0x0019A4 from 0x0019A1, JR NZ 0x0019A3 from 0x0019A7.

## Connection Check

- `0x02AF0F` does not directly CALL `0x002696` within the decoded 64-byte window.
- `0x002696` does not directly CALL `0x02AF0F` within the decoded 64-byte window.
- If neither direct edge is present, the 14-frame pattern is likely produced by a caller above these windows alternating between the two helpers, or by an indirect/dynamic dispatch not represented as `CD xx xx xx` in these slices.

## Next Use

Run with:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase604-loop-decode.mjs
```

