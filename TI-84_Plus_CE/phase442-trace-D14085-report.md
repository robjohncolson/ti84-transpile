# Phase 442 - D14085-D14089 Callback State Group Trace

## Summary

| Address | Total Refs | Reads | Writes | R+W | Addr-Loads |
| --- | ---: | ---: | ---: | ---: | ---: |
| D14085 (0xD14085) | 4 | 0 | 4 | 0 | 0 |
| D14086 (0xD14086) | 10 | 2 | 8 | 0 | 0 |
| D14087 (0xD14087) | 4 | 0 | 4 | 0 | 0 |
| D14088 (0xD14088) | 11 | 4 | 7 | 0 | 0 |
| D14089 (0xD14089) | 29 | 25 | 4 | 0 | 0 |

Total references across all 5 bytes: 58

## Value Analysis (Boolean vs Multi-Value)

- **D14085**: boolean (0/1) — written values: 0x00, 0x01
- **D14086**: boolean (0/1) — written values: 0x00, 0x01
- **D14087**: boolean (0/1) — written values: 0x00, 0x01
- **D14088**: boolean (0/1) — written values: 0x00, 0x01
- **D14089**: boolean (0/1) — written values: 0x00, 0x01

## Co-Access Matrix (Intra-Group)

Which D14085-D14089 bytes appear together within +/-40 bytes:

| Pair | Co-access Count |
| --- | ---: |
| D14085 <-> 0xD14086 | 4 |
| D14086 <-> 0xD14085 | 4 |
| D14086 <-> 0xD14087 | 2 |
| D14085 <-> 0xD14087 | 2 |
| D14087 <-> 0xD14086 | 2 |
| D14087 <-> 0xD14085 | 2 |

## External Co-Access (Other D140xx Bytes)

| Address | Co-access Count |
| --- | ---: |
| 0xD14075 | 14 |
| 0xD14073 | 14 |
| 0xD14082 | 10 |
| 0xD14044 | 9 |
| 0xD14084 | 7 |
| 0xD14048 | 6 |
| 0xD1407B | 6 |
| 0xD14046 | 4 |
| 0xD1408A | 4 |
| 0xD14083 | 2 |
| 0xD14074 | 2 |
| 0xD1407F | 2 |
| 0xD14076 | 2 |
| 0xD14059 | 1 |
| 0xD14081 | 1 |
| 0xD14091 | 1 |
| 0xD140B3 | 1 |
| 0xD1407E | 1 |

## Port I/O Summary

| Port Operation | Count |
| --- | ---: |
| IN A,(0x3031) | 6 |
| IN A,(0x313D) | 2 |
| OUT (0x313D),A | 2 |
| IN A,(0x3010) | 2 |
| OUT (0x3010),A | 2 |
| OUT (0x3031),A | 2 |
| OUT (0x3084),A | 2 |
| IN A,(0x3081) | 2 |
| OUT (0x3081),A | 2 |
| IN A,(0x0004) | 1 |
| IN A,(0x3080) | 1 |
| OUT (0x3080),A | 1 |

## Containing Functions

| Function | Ref Count | Targets |
| --- | ---: | --- |
| 0x0094C4 (CALL __frameset) | 5 | D14087, D14088, D14085, D14086 |
| 0x048D7A (PUSH AF; DI) | 5 | D14087, D14088, D14085, D14086 |
| 0x02E7D1 (after RET fallback) | 4 | D14089 |
| 0x00F023 (PUSH AF; DI) | 3 | D14088 |
| 0x012F66 (PUSH IY) | 3 | D14086, D14085, D14087 |
| 0x041B65 (after RET fallback) | 3 | D14086, D14085, D14087 |
| 0x047C8A (PUSH IX) | 3 | D14089 |
| 0x04DC36 (PUSH AF; DI) | 3 | D14089 |
| 0x0084E4 (PUSH AF; DI) | 2 | D14089 |
| 0x009188 (CALL __frameset) | 2 | D14086 |
| 0x02BB8C (PUSH AF; DI) | 2 | D14088 |
| 0x02F158 (PUSH AF; DI) | 2 | D14089 |
| 0x038E44 (after RET fallback) | 2 | D14086 |
| 0x03CEB7 (PUSH IY) | 2 | D14089 |
| 0x0412E4 (PUSH AF; DI) | 2 | D14086, D14088 |
| 0x04975B (PUSH AF; DI) | 2 | D14089 |
| 0x008F1A (CALL __frameset) | 1 | D14089 |
| 0x01270D (PUSH AF; DI) | 1 | D14086 |
| 0x014374 (CALL __frameset) | 1 | D14089 |
| 0x02BD52 (PUSH AF; DI) | 1 | D14088 |

## Write Values Detail

### D14085

| Site | Value | Function |
| --- | --- | --- |
| 0x009ACB | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) |
| 0x012FF7 | 0x00 (XOR A) | 0x012F66 (PUSH IY) |
| 0x041B83 | 0x00 (XOR A) | 0x041B65 (after RET fallback) |
| 0x0494BC | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) |

### D14086

| Site | Value | Function |
| --- | --- | --- |
| 0x0091CA | 0x00 (XOR A) | 0x009188 (CALL __frameset) |
| 0x009AF0 | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) |
| 0x012715 | 0x00 (XOR A) | 0x01270D (PUSH AF; DI) |
| 0x012FF2 | 0x00 (XOR A) | 0x012F66 (PUSH IY) |
| 0x038E8A | 0x00 (XOR A) | 0x038E44 (after RET fallback) |
| 0x0412EC | 0x00 (XOR A) | 0x0412E4 (PUSH AF; DI) |
| 0x041B7E | 0x00 (XOR A) | 0x041B65 (after RET fallback) |
| 0x0494E1 | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) |

### D14087

| Site | Value | Function |
| --- | --- | --- |
| 0x0098DE | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) |
| 0x012FFC | 0x00 (XOR A) | 0x012F66 (PUSH IY) |
| 0x041B88 | 0x00 (XOR A) | 0x041B65 (after RET fallback) |
| 0x0492B2 | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) |

### D14088

| Site | Value | Function |
| --- | --- | --- |
| 0x009A2F | 0x00 (XOR A) | 0x0094C4 (CALL __frameset) |
| 0x009A61 | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) |
| 0x00F12B | 0x00 (XOR A) | 0x00F023 (PUSH AF; DI) |
| 0x02BC94 | 0x00 (XOR A) | 0x02BB8C (PUSH AF; DI) |
| 0x04173E | 0x00 (XOR A) | 0x0412E4 (PUSH AF; DI) |
| 0x04941B | 0x00 (XOR A) | 0x048D7A (PUSH AF; DI) |
| 0x04944D | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) |

### D14089

| Site | Value | Function |
| --- | --- | --- |
| 0x0085C5 | 0x00 (XOR A) | 0x0084E4 (PUSH AF; DI) |
| 0x0085D5 | 0x01 (LD A,imm) | 0x0084E4 (PUSH AF; DI) |
| 0x04985D | 0x00 (XOR A) | 0x04975B (PUSH AF; DI) |
| 0x04986D | 0x01 (LD A,imm) | 0x04975B (PUSH AF; DI) |

## Read Patterns Detail

### D14085 — no reads

### D14086

| Site | Mnemonic | Gate | Function |
| --- | --- | --- | --- |
| 0x0091B2 | LD A,(D14086) | OR A; JR Z | 0x009188 (CALL __frameset) |
| 0x038E72 | LD A,(D14086) | OR A; JR Z | 0x038E44 (after RET fallback) |

### D14087 — no reads

### D14088

| Site | Mnemonic | Gate | Function |
| --- | --- | --- | --- |
| 0x00F108 | LD A,(D14088) | OR A; JR Z | 0x00F023 (PUSH AF; DI) |
| 0x00F21F | LD A,(D14088) | OR A; JR NZ | 0x00F023 (PUSH AF; DI) |
| 0x02BC71 | LD A,(D14088) | OR A; JR Z | 0x02BB8C (PUSH AF; DI) |
| 0x02BEB5 | LD A,(D14088) | OR A; JP NZ | 0x02BD52 (PUSH AF; DI) |

### D14089

| Site | Mnemonic | Gate | Function |
| --- | --- | --- | --- |
| 0x008F3F | LD A,(D14089) | OR A; JR NZ | 0x008F1A (CALL __frameset) |
| 0x0144FD | LD A,(D14089) | CP 0x01; JR Z | 0x014374 (CALL __frameset) |
| 0x02C2ED | LD A,(D14089) | CP 0x01; JR NZ | 0x02C175 (PUSH AF; DI) |
| 0x02D4E5 | LD A,(D14089) | OR A; JR Z | 0x02D36F (PUSH AF; DI) |
| 0x02E082 | LD A,(D14089) | OR A; JR NZ | 0x02E080 (after RET fallback) |
| 0x02E8CF | LD A,(D14089) | OR A; JR Z | 0x02E7D1 (after RET fallback) |
| 0x02E9ED | LD A,(D14089) | OR A; JR NZ | 0x02E7D1 (after RET fallback) |
| 0x02EBF1 | LD A,(D14089) | OR A; JR Z | 0x02E7D1 (after RET fallback) |
| 0x02ED7C | LD A,(D14089) | OR A; JP NZ | 0x02E7D1 (after RET fallback) |
| 0x02EFDD | LD A,(D14089) | OR A; JR Z | - |
| 0x02F216 | LD A,(D14089) | OR A; JR Z | 0x02F158 (PUSH AF; DI) |
| 0x02F2C4 | LD A,(D14089) | OR A; JR Z | 0x02F158 (PUSH AF; DI) |
| 0x036922 | LD A,(D14089) | OR A; JR Z | 0x03688D (PUSH AF; DI) |
| 0x036FCF | LD A,(D14089) | OR A; JR NZ | 0x036E22 (PUSH AF; DI) |
| 0x03CF2D | LD A,(D14089) | OR A; JR Z | 0x03CEB7 (PUSH IY) |
| 0x03CF34 | LD A,(D14089) | OR A; JR Z | 0x03CEB7 (PUSH IY) |
| 0x04269B | LD A,(D14089) | OR A; JR Z | 0x042498 (PUSH IY) |
| 0x047E38 | LD A,(D14089) | CP 0x01; JR Z | 0x047C8A (PUSH IX) |
| 0x047EEE | LD A,(D14089) | OR A; JR Z | 0x047C8A (PUSH IX) |
| 0x047F6D | LD A,(D14089) | OR A; JR NZ | 0x047C8A (PUSH IX) |
| 0x047FCC | LD A,(D14089) | OR A; JR Z | 0x047FB8 (PUSH IY) |
| 0x04DDCA | LD A,(D14089) | CP 0x01; JR Z | 0x04DC36 (PUSH AF; DI) |
| 0x04DE4B | LD A,(D14089) | OR A; JR Z | 0x04DC36 (PUSH AF; DI) |
| 0x04DF38 | LD A,(D14089) | OR A; JR Z | 0x04DC36 (PUSH AF; DI) |
| 0x063765 | LD A,(D14089) | CP 0x01; JP NZ | 0x0636A2 (after RET fallback) |

## Full Reference Table

| Site | Target | Type | Mnemonic | Value/Gate | Function | Context |
| --- | --- | --- | --- | --- | --- | --- |
| 0x0085C5 | D14089 | WRITE | LD (D14089),A | 0x00 (XOR A) | 0x0084E4 (PUSH AF; DI) | `c5 cd 2d 32 01 c1 c9 af 32 89 40 d1 fd 21 80 00 d0 fd cb 43 d6 c9 3e 01` |
| 0x0085D5 | D14089 | WRITE | LD (D14089),A | 0x01 (LD A,imm) | 0x0084E4 (PUSH AF; DI) | `d0 fd cb 43 d6 c9 3e 01 32 89 40 d1 fd 21 80 00 d0 fd cb 43 96 c9 21 ff` |
| 0x008F3F | D14089 | READ | LD A,(D14089) | OR A; JR NZ | 0x008F1A (CALL __frameset) | `8f 00 8d 8f 00 b7 8f 00 3a 89 40 d1 b7 20 12 01 13 00 00 c5 01 98 00 00` |
| 0x0091B2 | D14086 | READ | LD A,(D14086) | OR A; JR Z | 0x009188 (CALL __frameset) | `3a b8 77 d1 fe ff 20 20 3a 86 40 d1 b7 28 15 01 00 00 00 c5 01 01 00 00` |
| 0x0091CA | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x009188 (CALL __frameset) | `c5 cd 3c 88 00 c1 c1 af 32 86 40 d1 dd 36 ff 00 dd 7e ff dd f9 dd e1 c9` |
| 0x0098DE | D14087 | WRITE | LD (D14087),A | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) | `e6 02 ca 12 9a 00 3e 01 32 87 40 d1 01 3d 31 00 ed 78 cb cf ed 79 78 fe` |
| 0x009A2F | D14088 | WRITE | LD (D14088),A | 0x00 (XOR A) | 0x0094C4 (CALL __frameset) | `73 40 d1 cd 13 2d 01 af 32 88 40 d1 18 30 01 10 30 00 ed 78 cb 87 ed 79` |
| 0x009A61 | D14088 | WRITE | LD (D14088),A | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) | `cf 79 fe 31 20 fa 3e 01 32 88 40 d1 3a 48 40 d1 e6 20 28 1a 01 01 00 00` |
| 0x009ACB | D14085 | WRITE | LD (D14085),A | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) | `40 d1 e6 08 28 1d 3e 01 32 85 40 d1 3a 75 40 d1 b7 20 10 01 01 00 00 c5` |
| 0x009AF0 | D14086 | WRITE | LD (D14086),A | 0x01 (LD A,imm) | 0x0094C4 (CALL __frameset) | `40 d1 e6 10 28 46 3e 01 32 86 40 d1 18 3e 3a 48 40 d1 e6 01 28 06 3e 01` |
| 0x00F108 | D14088 | READ | LD A,(D14088) | OR A; JR Z | 0x00F023 (PUSH AF; DI) | `32 8a 40 d1 dd 36 ff 00 3a 88 40 d1 b7 28 20 40 01 82 30 ed 78 e6 20 28` |
| 0x00F12B | D14088 | WRITE | LD (D14088),A | 0x00 (XOR A) | 0x00F023 (PUSH AF; DI) | `13 2d 01 dd 36 ff 00 af 32 88 40 d1 3a 84 40 d1 b7 28 70 af 32 84 40 d1` |
| 0x00F21F | D14088 | READ | LD A,(D14088) | OR A; JR NZ | 0x00F023 (PUSH AF; DI) | `d1 3a 73 40 d1 b7 28 73 3a 88 40 d1 b7 20 6c af 32 68 77 d1 3a 81 40 d1` |
| 0x012715 | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x01270D (PUSH AF; DI) | `f5 f3 af 32 82 40 d1 af 32 86 40 d1 01 31 30 00 ed 78 e6 0c fe 04 28 2a` |
| 0x012FF2 | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x012F66 (PUSH IY) | `cd 84 91 00 b7 28 2b af 32 86 40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01` |
| 0x012FF7 | D14085 | WRITE | LD (D14085),A | 0x00 (XOR A) | 0x012F66 (PUSH IY) | `28 2b af 32 86 40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01 32 75 40 d1 cd` |
| 0x012FFC | D14087 | WRITE | LD (D14087),A | 0x00 (XOR A) | 0x012F66 (PUSH IY) | `40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01 32 75 40 d1 cd 18 91 00 18 10` |
| 0x0144FD | D14089 | READ | LD A,(D14089) | CP 0x01; JR Z | 0x014374 (CALL __frameset) | `17 cd 64 6e 00 b7 28 10 3a 89 40 d1 fe 01 28 08 dd 36 fe 02 dd 36 ff 00` |
| 0x02BC71 | D14088 | READ | LD A,(D14088) | OR A; JR Z | 0x02BB8C (PUSH AF; DI) | `32 8a 40 d1 dd 36 ff 00 3a 88 40 d1 b7 28 20 40 01 82 30 ed 78 e6 20 28` |
| 0x02BC94 | D14088 | WRITE | LD (D14088),A | 0x00 (XOR A) | 0x02BB8C (PUSH AF; DI) | `b7 18 04 dd 36 ff 00 af 32 88 40 d1 3a 84 40 d1 b7 ca 5e bd 02 af 32 84` |
| 0x02BEB5 | D14088 | READ | LD A,(D14088) | OR A; JP NZ | 0x02BD52 (PUSH AF; DI) | `73 40 d1 b7 ca 47 bf 02 3a 88 40 d1 b7 c2 47 bf 02 cd e4 03 00 b7 ca 47` |
| 0x02C2ED | D14089 | READ | LD A,(D14089) | CP 0x01; JR NZ | 0x02C175 (PUSH AF; DI) | `3a b8 77 d1 fe 01 20 2c 3a 89 40 d1 fe 01 20 12 01 10 00 00 c5 01 c0 00` |
| 0x02D4E5 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x02D36F (PUSH AF; DI) | `36 ff 00 af 32 c9 76 d1 3a 89 40 d1 b7 28 6a cd ff a4 04 cd 65 e0 03 cd` |
| 0x02E082 | D14089 | READ | LD A,(D14089) | OR A; JR NZ | 0x02E080 (after RET fallback) | `36 f6 00 af 32 c9 76 d1 3a 89 40 d1 b7 20 4e 01 04 0c 00 c5 cd 6e 20 05` |
| 0x02E8CF | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x02E7D1 (after RET fallback) | `cd 04 02 00 c2 7a f0 02 3a 89 40 d1 b7 28 0a 01 04 12 00 c5 cd 13 20 05` |
| 0x02E9ED | D14089 | READ | LD A,(D14089) | OR A; JR NZ | 0x02E7D1 (after RET fallback) | `77 d1 cd 04 02 00 20 2c 3a 89 40 d1 b7 20 14 3e 01 21 58 77 d1 be 30 1c` |
| 0x02EBF1 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x02E7D1 (after RET fallback) | `26 77 d1 36 31 23 36 00 3a 89 40 d1 b7 28 3c ed 4b 16 77 d1 c5 cd bc a8` |
| 0x02ED7C | D14089 | READ | LD A,(D14089) | OR A; JP NZ | 0x02E7D1 (after RET fallback) | `26 77 d1 36 31 23 36 00 3a 89 40 d1 b7 c2 b2 ef 02 2a 26 77 d1 cd 04 02` |
| 0x02EFDD | D14089 | READ | LD A,(D14089) | OR A; JR Z | - | `cd 04 02 00 c2 7a f0 02 3a 89 40 d1 b7 28 1b 3a 67 77 d1 b7 20 6c cd f0` |
| 0x02F216 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x02F158 (PUSH AF; DI) | `d1 71 23 70 cd 61 f3 03 3a 89 40 d1 b7 28 04 cd 30 e2 03 c9 fd 2a a8 76` |
| 0x02F2C4 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x02F158 (PUSH AF; DI) | `3a fa 76 d1 fe 01 28 0b 3a 89 40 d1 b7 28 04 cd 30 e2 03 3a fa 76 d1 fe` |
| 0x036922 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x03688D (PUSH AF; DI) | `00 c5 cd ca 9c 04 c1 c1 3a 89 40 d1 b7 28 27 3a bb 77 d1 b7 20 20 01 40` |
| 0x036FCF | D14089 | READ | LD A,(D14089) | OR A; JR NZ | 0x036E22 (PUSH AF; DI) | `6f 03 fa 6f 03 47 70 03 3a 89 40 d1 b7 20 12 01 13 00 00 c5 01 98 00 00` |
| 0x038E72 | D14086 | READ | LD A,(D14086) | OR A; JR Z | 0x038E44 (after RET fallback) | `3a b8 77 d1 fe ff 20 20 3a 86 40 d1 b7 28 15 01 00 00 00 c5 01 01 00 00` |
| 0x038E8A | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x038E44 (after RET fallback) | `c5 cd ca 9c 04 c1 c1 af 32 86 40 d1 dd 36 ff 00 dd 7e ff dd f9 dd e1 c9` |
| 0x03CF2D | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x03CEB7 (PUSH IY) | `fd 2f 1b af 32 76 40 d1 3a 89 40 d1 b7 28 11 3a 89 40 d1 b7 28 2f dd 31` |
| 0x03CF34 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x03CEB7 (PUSH IY) | `d1 3a 89 40 d1 b7 28 11 3a 89 40 d1 b7 28 2f dd 31 fd fd 7e 19 fe 01 28` |
| 0x0412EC | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x0412E4 (PUSH AF; DI) | `f5 f3 af 32 82 40 d1 af 32 86 40 d1 01 31 30 00 ed 78 e6 0c fe 04 28 2a` |
| 0x04173E | D14088 | WRITE | LD (D14088),A | 0x00 (XOR A) | 0x0412E4 (PUSH AF; DI) | `40 d1 af 32 84 40 d1 af 32 88 40 d1 3e 01 dd f9 dd e1 c9 21 fa ff ff cd` |
| 0x041B7E | D14086 | WRITE | LD (D14086),A | 0x00 (XOR A) | 0x041B65 (after RET fallback) | `cd 44 8e 03 b7 28 2b af 32 86 40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01` |
| 0x041B83 | D14085 | WRITE | LD (D14085),A | 0x00 (XOR A) | 0x041B65 (after RET fallback) | `28 2b af 32 86 40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01 32 75 40 d1 cd` |
| 0x041B88 | D14087 | WRITE | LD (D14087),A | 0x00 (XOR A) | 0x041B65 (after RET fallback) | `40 d1 af 32 85 40 d1 af 32 87 40 d1 3e 01 32 75 40 d1 cd 9e 8d 03 18 10` |
| 0x04269B | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x042498 (PUSH IY) | `00 00 c5 cd 00 05 00 c1 3a 89 40 d1 b7 28 04 cd 5c 98 04 cd 9e 97 04 18` |
| 0x047E38 | D14089 | READ | LD A,(D14089) | CP 0x01; JR Z | 0x047C8A (PUSH IX) | `4b cd ba ba 04 b7 28 44 3a 89 40 d1 fe 01 28 0a dd 36 fe 02 dd 36 ff 00` |
| 0x047EEE | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x047C8A (PUSH IX) | `f2 76 d1 af 32 fb 76 d1 3a 89 40 d1 b7 28 08 cd 5c 98 04 cd 9e 97 04 dd` |
| 0x047F6D | D14089 | READ | LD A,(D14089) | OR A; JR NZ | 0x047C8A (PUSH IX) | `21 80 00 d0 cd d7 46 02 3a 89 40 d1 b7 20 37 fd 21 80 00 d0 fd cb 0d ce` |
| 0x047FCC | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x047FB8 (PUSH IY) | `e1 cd e8 03 00 b7 28 37 3a 89 40 d1 b7 28 5a 3a b8 77 d1 fe 80 30 16 cd` |
| 0x0492B2 | D14087 | WRITE | LD (D14087),A | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) | `04 af 32 fd 76 d1 3e 01 32 87 40 d1 01 3d 31 00 ed 78 cb cf ed 79 78 fe` |
| 0x04941B | D14088 | WRITE | LD (D14088),A | 0x00 (XOR A) | 0x048D7A (PUSH AF; DI) | `73 40 d1 cd b7 18 04 af 32 88 40 d1 18 30 01 10 30 00 ed 78 cb 87 ed 79` |
| 0x04944D | D14088 | WRITE | LD (D14088),A | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) | `cf 79 fe 31 20 fa 3e 01 32 88 40 d1 af 32 fd 76 d1 3a 48 40 d1 e6 20 28` |
| 0x0494BC | D14085 | WRITE | LD (D14085),A | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) | `40 d1 e6 08 28 1d 3e 01 32 85 40 d1 3a 75 40 d1 b7 20 10 01 01 00 00 c5` |
| 0x0494E1 | D14086 | WRITE | LD (D14086),A | 0x01 (LD A,imm) | 0x048D7A (PUSH AF; DI) | `40 d1 e6 10 28 46 3e 01 32 86 40 d1 18 3e 3a 48 40 d1 e6 01 28 06 3e 01` |
| 0x04985D | D14089 | WRITE | LD (D14089),A | 0x00 (XOR A) | 0x04975B (PUSH AF; DI) | `c5 cd 95 1e 04 c1 c9 af 32 89 40 d1 fd 21 80 00 d0 fd cb 43 d6 c9 3e 01` |
| 0x04986D | D14089 | WRITE | LD (D14089),A | 0x01 (LD A,imm) | 0x04975B (PUSH AF; DI) | `d0 fd cb 43 d6 c9 3e 01 32 89 40 d1 fd 21 80 00 d0 fd cb 43 96 c9 cd e8` |
| 0x04DDCA | D14089 | READ | LD A,(D14089) | CP 0x01; JR Z | 0x04DC36 (PUSH AF; DI) | `00 dd 0f fd c3 1a df 04 3a 89 40 d1 fe 01 28 11 cd 24 04 00 e5 c1 cd 64` |
| 0x04DE4B | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x04DC36 (PUSH AF; DI) | `00 dd 2f fd c3 1a df 04 3a 89 40 d1 b7 28 11 01 f0 ff 00 dd 0f fd 3a 96` |
| 0x04DF38 | D14089 | READ | LD A,(D14089) | OR A; JR Z | 0x04DC36 (PUSH AF; DI) | `c5 cd 38 04 00 c1 c1 c1 3a 89 40 d1 b7 28 04 cd 9e 97 04 dd f9 dd e1 c9` |
| 0x063765 | D14089 | READ | LD A,(D14089) | CP 0x01; JP NZ | 0x0636A2 (after RET fallback) | `b7 40 ed 42 c2 1d 38 06 3a 89 40 d1 fe 01 c2 1d 38 06 cd c4 38 06 c3 1d` |

## Group Assessment

### Hypothesis A: 24-bit Callback Function Pointer + State — REJECTED

Evidence against pointer hypothesis:
- D14085/D14086/D14087 are all written individually via `LD (addr),A` with values 0x00 or 0x01
- No `LD (D14085),HL` or `LD HL,(D14085)` instructions found (which would indicate 3-byte pointer load/store)
- Each byte has independent read sites with boolean test patterns (OR A; JR Z/NZ)
- D14086 has read sites independent of D14085/D14087

### Hypothesis B: Five Independent Boolean USB State Flags — CONFIRMED

All 5 bytes are boolean (written 0x00 or 0x01, tested with OR A or CP 0x01):
- **D14085**: callback-ready flag (4 refs: 2W set, 2W clear) — set=1 alongside D14075 check, cleared in teardown with D14086/D14087
- **D14086**: transfer-complete notification (10 refs: 2R, 8W) — most writes are clears (0x00), set=1 at transfer completion
- **D14087**: SOF-timer active flag (4 refs: 4W) — set=1 alongside port 0x313D (SOF timer), cleared in teardown
- **D14088**: endpoint-ready flag (11 refs: 4R, 7W) — set/clear around port 0x3031 (endpoint control), read to gate transfer logic
- **D14089**: USB-session-active flag (29 refs: 25R, 4W) — most-read flag in the group, gates major USB operations across many functions

## Conclusion

- Total references across D14085-D14089: 58
- All observed write values: 0x00, 0x01
- Co-access with D14075 (callback-pending): see external co-access table above
- Most frequent external co-access: 0xD14075 x14
