# Phase 100A — Static ROM Scan for 0xD020A6-0xD020BF

- ROM size: 4194304 bytes
- Target range: 0xd020a6 - 0xd020bf
- Total byte-pattern hits: 14
- Likely instructions: 13
- Likely data: 1

## Likely Instruction Hits

| ROM addr | target | prev byte | opcode | context bytes |
|---|---|---|---|---|
| 0x0781cc | 0xd020b8 | 0x11 | LD DE,nnnnnn | 04 3e 11 b8 20 d0 06 |
| 0x0b2d6a | 0xd020b2 | 0x21 | LD HL,nnnnnn | d0 c9 21 b2 20 d0 01 |
| 0x0b2e87 | 0xd020b2 | 0x11 | LD DE,nnnnnn | b8 c9 11 b2 20 d0 21 |
| 0x0b2f32 | 0xd020b1 | 0x11 | LD DE,nnnnnn | ed b8 11 b1 20 d0 21 |
| 0x0b2f36 | 0xd020a8 | 0x21 | LD HL,nnnnnn | 20 d0 21 a8 20 d0 c1 |
| 0x0b306e | 0xd020b2 | 0x21 | LD HL,nnnnnn | 2d 0b 21 b2 20 d0 cd |
| 0x0b3400 | 0xd020b2 | 0x11 | LD DE,nnnnnn | 10 fc 11 b2 20 d0 18 |
| 0x0b4073 | 0xd020b2 | 0x11 | LD DE,nnnnnn | 38 0b 11 b2 20 d0 3e |
| 0x0b42c3 | 0xd020b2 | 0x21 | LD HL,nnnnnn | 38 0b 21 b2 20 d0 16 |
| 0x0b4b01 | 0xd020b2 | 0x21 | LD HL,nnnnnn | 18 95 21 b2 20 d0 cd |
| 0x0b4bab | 0xd020b2 | 0x21 | LD HL,nnnnnn | 2e 0b 21 b2 20 d0 cd |
| 0x0b4bd7 | 0xd020b2 | 0x21 | LD HL,nnnnnn | 2e 0b 21 b2 20 d0 c3 |
| 0x0b59ce | 0xd020b2 | 0x21 | LD HL,nnnnnn | 50 b6 21 b2 20 d0 cd |

## Data / Non-instruction Hits (1 total)

| ROM addr | target | prev byte | context |
|---|---|---|---|
| 0x047469 | 0xd020b3 | 0xff | dd 7e ff b3 20 d0 dd |

