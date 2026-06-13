# Phase 663: Live-VAT Upstream Trace Before 0x0013FC

Probe: `probe-phase663-live-vat-upstream-0013fc.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase663-live-vat-upstream-0013fc.mjs`

## Summary

- PASS: browser coldboot no-AutoRun Digit2 route completed with live-VAT upstream instrumentation.
- Route: total blocks=299956, cxMain hits=2, key-handler hits=2, token/tail hits=0, low-path hits=60903, cleanup hits=3.
- Upstream counts: {"up003c42":2,"up003b0d":2,"up003b17":2,"up0013f4":2,"up0013f8":2,"up0028d1":2,"up0013fc":2}; dynamic 0x0061E9 hits=31.
- First cleanup sample: cleanup0018f8@0x0018F8#13139; prev=0x001879; AF=0x5200 IX=0x000000 SP=0xD1A87B Z=false C=false; stack0=0x0013E8; D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000; recent=0x001C33 -> 0x001C4A -> 0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 -> 0x0018F8.
- First 0x0013FC sample: up0013fc@0x0013FC#14787; prev=0x0028D1; AF=0x0480 IX=0x000000 SP=0xD1A87E Z=false C=false; stack0=0x000000; D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000; recent=0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 -> 0x0013F4 -> 0x0013F8 -> 0x0028D1 -> 0x0013FC.
- First 0x0061E9 sample: frame0061e9@0x0061E9#13157; prev=0x0061E3; AF=0x0100 IX=0x000000 SP=0xD1A875 Z=false C=false; stack0=0x005D19; D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000; recent=0x005C84 -> 0x005C99 -> 0x005CAE -> 0x005CC8 -> 0x005CDB -> 0x005CEC -> 0x005CF1 -> 0x005D0D -> 0x0061E3 -> 0x0061E9.
- Finding: The live-VAT Digit2 route reaches the named 0x0013FC upstream window only AFTER the first destructive cleanup: cleanup0018f8#13139 precedes 0x003C42#14781 -> 0x003B0D#14782 -> 0x003B17#14783 -> 0x0013F4#14784 -> 0x0013F8#14785 -> 0x0028D1#14786 -> 0x0013FC#14787. At 0x0013FC, D007CA/D008E0/VAT are already zero. This corrects the prior selector hypothesis: this 0x003C42 -> ... -> 0x0013FC window is a post-cleanup status/low-transfer path, not the pre-cleanup branch that originally selects the clear.
- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.

## Dynamic Upstream Samples

| Target | Hits | First block | Previous PC | AF | IX | SP | Stack0 | Route fields | Recent tail |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| 0x003C42 | 2 | 14781 | 0x006202 | 0x090A | 0x000000 | 0xD1A875 | 0x003B0D | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x003C16 -> 0x0061E3 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 |
| 0x003B0D | 2 | 14782 | 0x003C42 | 0x0480 | 0x000000 | 0xD1A878 | 0x004000 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x0061E3 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D |
| 0x003B17 | 2 | 14783 | 0x003B0D | 0x0054 | 0x000000 | 0xD1A878 | 0x000480 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 |
| 0x0013F4 | 2 | 14784 | 0x003B17 | 0x0480 | 0x000000 | 0xD1A87E | 0x000000 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x0061FD -> 0x006202 -> 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 -> 0x0013F4 |
| 0x0013F8 | 2 | 14785 | 0x0013F4 | 0x0480 | 0x000000 | 0xD1A87E | 0x000000 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x006202 -> 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 -> 0x0013F4 -> 0x0013F8 |
| 0x0028D1 | 2 | 14786 | 0x0013F8 | 0x0480 | 0x000000 | 0xD1A87B | 0x0013FC | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x003C1F -> 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 -> 0x0013F4 -> 0x0013F8 -> 0x0028D1 |
| 0x0013FC | 2 | 14787 | 0x0028D1 | 0x0480 | 0x000000 | 0xD1A87E | 0x000000 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x003C27 -> 0x0061E5 -> 0x0061E9 -> 0x0061FD -> 0x006202 -> 0x003C42 -> 0x003B0D -> 0x003B17 -> 0x0013F4 -> 0x0013F8 -> 0x0028D1 -> 0x0013FC |
| 0x0061E9 | 31 | 13157 | 0x0061E3 | 0x0100 | 0x000000 | 0xD1A875 | 0x005D19 | D0058E=0x00 D007CA=0x000000 D008E0=0x000000 VAT=0x000000/0x000000 | 0x005C6C -> 0x005C71 -> 0x005C84 -> 0x005C99 -> 0x005CAE -> 0x005CC8 -> 0x005CDB -> 0x005CEC -> 0x005CF1 -> 0x005D0D -> 0x0061E3 -> 0x0061E9 |

## Static Decode Windows

### 0x003B00..0x003C60 upstream low-ROM selector window

| Address | Bytes | Instruction |
| --- | --- | --- |
| 0x003B00 | 0xCD 0x4D 0x6F 0x00 | CALL 0x006F4D |
| 0x003B04 | 0xC1 | POP BC |
| 0x003B05 | 0xED 0x38 0x0F | IN0 A,(0x0F) |
| 0x003B08 | 0xF5 | PUSH AF |
| 0x003B09 | 0xCD 0x19 0x3B 0x00 | CALL 0x003B19 |
| 0x003B0D | 0xC1 | POP BC |
| 0x003B0E | 0xF5 | PUSH AF |
| 0x003B0F | 0xED 0x38 0x0F | IN0 A,(0x0F) |
| 0x003B12 | 0xA8 | XOR B |
| 0x003B13 | 0xCB 0x7F | BIT 7,A |
| 0x003B15 | 0x20 0xD8 | JR NZ,0x003AEF |
| 0x003B17 | 0xF1 | POP AF |
| 0x003B18 | 0xC9 | RET |
| 0x003B19 | 0x3A 0x7E 0x00 0x00 | LD A,(0x00007E) |
| 0x003B1D | 0xFE 0xFF | CP 0xFF |
| 0x003B1F | 0x28 0x09 | JR Z,0x003B2A |
| 0x003B21 | 0x3E 0xDC | LD A,0xDC |
| 0x003B23 | 0xDB 0x06 | IN-IMM {"pc":15139,"length":2,"nextPc":15141,"tag":"in-imm","port":6,"mode":"adl","modePrefix":null} |
| 0x003B25 | 0xFE 0x00 | CP 0x00 |
| 0x003B27 | 0x3E 0x04 | LD A,0x04 |
| 0x003B29 | 0xC8 | RET Z |
| 0x003B2A | 0xFD 0x46 0x08 | LD-REG-IXD {"pc":15146,"length":3,"nextPc":15149,"tag":"ld-reg-ixd","dest":"b","indexRegister":"iy","displacement":8,"mode":"adl","modePrefix":null} |
| 0x003B2D | 0xFD 0xCB 0x08 0x9E | RES 3,(IY+8) |
| 0x003B31 | 0xED 0x38 0x0A | IN0 A,(0x0A) |
| 0x003B34 | 0xCB 0xC7 | SET 0,A |
| 0x003B36 | 0xED 0x39 0x0A | OUT0 (0x0A),A |
| 0x003B39 | 0xED 0x08 0x0C | IN0 C,(0x0C) |
| 0x003B3C | 0x3E 0x83 | LD A,0x83 |
| 0x003B3E | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003B41 | 0xCD 0x4B 0x3C 0x00 | CALL 0x003C4B |
| 0x003B45 | 0x28 0x55 | JR Z,0x003B9C |
| 0x003B47 | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003B4A | 0xF6 0x80 | OR 0x80 |
| 0x003B4C | 0xE6 0xDF | AND 0xDF |
| 0x003B4E | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003B51 | 0xED 0x38 0x07 | IN0 A,(0x07) |
| 0x003B54 | 0xF6 0xF0 | OR 0xF0 |
| 0x003B56 | 0xED 0x39 0x07 | OUT0 (0x07),A |
| 0x003B59 | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003B5D | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003B60 | 0x1F | RRA {"pc":15200,"length":1,"nextPc":15201,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003B61 | 0x38 0x23 | JR C,0x003B86 |
| 0x003B63 | 0x3E 0x03 | LD A,0x03 |
| 0x003B65 | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003B68 | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003B6B | 0xF6 0x20 | OR 0x20 |
| 0x003B6D | 0xE6 0x7F | AND 0x7F |
| 0x003B6F | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003B72 | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003B76 | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003B79 | 0x1F | RRA {"pc":15225,"length":1,"nextPc":15226,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003B7A | 0x3E 0x01 | LD A,0x01 |
| 0x003B7C | 0xDA 0x29 0x3C 0x00 | JP C,0x003C29 |
| 0x003B80 | 0x3E 0x00 | LD A,0x00 |
| 0x003B82 | 0xC3 0x29 0x3C 0x00 | JP 0x003C29 |
| 0x003B86 | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003B89 | 0xF6 0xA0 | OR 0xA0 |
| 0x003B8B | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003B8E | 0xED 0x38 0x0C | IN0 A,(0x0C) |
| 0x003B91 | 0xCB 0xC7 | SET 0,A |
| 0x003B93 | 0xED 0x39 0x0C | OUT0 (0x0C),A |
| 0x003B96 | 0x3E 0x09 | LD A,0x09 |
| 0x003B98 | 0xCD 0xE5 0x61 0x00 | CALL 0x0061E5 |
| 0x003B9C | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003B9F | 0xF6 0xA0 | OR 0xA0 |
| 0x003BA1 | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003BA4 | 0xED 0x38 0x07 | IN0 A,(0x07) |
| 0x003BA7 | 0xF6 0xB0 | OR 0xB0 |
| 0x003BA9 | 0xED 0x39 0x07 | OUT0 (0x07),A |
| 0x003BAC | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003BB0 | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003BB3 | 0x1F | RRA {"pc":15283,"length":1,"nextPc":15284,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003BB4 | 0x3E 0x80 | LD A,0x80 |
| 0x003BB6 | 0x30 0x71 | JR NC,0x003C29 |
| 0x003BB8 | 0x3E 0x03 | LD A,0x03 |
| 0x003BBA | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003BBD | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003BC0 | 0xE6 0x7F | AND 0x7F |
| 0x003BC2 | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003BC5 | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003BC9 | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003BCC | 0x1F | RRA {"pc":15308,"length":1,"nextPc":15309,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003BCD | 0x3E 0x80 | LD A,0x80 |
| 0x003BCF | 0x30 0x58 | JR NC,0x003C29 |
| 0x003BD1 | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003BD4 | 0xF6 0x80 | OR 0x80 |
| 0x003BD6 | 0xE6 0xDF | AND 0xDF |
| 0x003BD8 | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003BDB | 0x3E 0x83 | LD A,0x83 |
| 0x003BDD | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003BE0 | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003BE4 | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003BE7 | 0x1F | RRA {"pc":15335,"length":1,"nextPc":15336,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003BE8 | 0x3E 0x00 | LD A,0x00 |
| 0x003BEA | 0x30 0x3D | JR NC,0x003C29 |
| 0x003BEC | 0x3E 0x03 | LD A,0x03 |
| 0x003BEE | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003BF1 | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003BF5 | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003BF8 | 0x1F | RRA {"pc":15352,"length":1,"nextPc":15353,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003BF9 | 0x3E 0x01 | LD A,0x01 |
| 0x003BFB | 0x30 0x2C | JR NC,0x003C29 |
| 0x003BFD | 0x3E 0x83 | LD A,0x83 |
| 0x003BFF | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003C02 | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003C05 | 0xE6 0x5F | AND 0x5F |
| 0x003C07 | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003C0A | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003C0E | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003C11 | 0x1F | RRA {"pc":15377,"length":1,"nextPc":15378,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003C12 | 0x3E 0x02 | LD A,0x02 |
| 0x003C14 | 0x30 0x13 | JR NC,0x003C29 |
| 0x003C16 | 0x3E 0x03 | LD A,0x03 |
| 0x003C18 | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003C1B | 0xCD 0xE3 0x61 0x00 | CALL 0x0061E3 |
| 0x003C1F | 0xED 0x38 0x02 | IN0 A,(0x02) |
| 0x003C22 | 0x1F | RRA {"pc":15394,"length":1,"nextPc":15395,"tag":"rra","mode":"adl","modePrefix":null} |
| 0x003C23 | 0x3E 0x03 | LD A,0x03 |
| 0x003C25 | 0x30 0x02 | JR NC,0x003C29 |
| 0x003C27 | 0x3E 0x04 | LD A,0x04 |
| 0x003C29 | 0xED 0x09 0x0C | OUT0 (0x0C),C |
| 0x003C2C | 0x4F | LD C,A |
| 0x003C2D | 0xED 0x38 0x09 | IN0 A,(0x09) |
| 0x003C30 | 0xF6 0x20 | OR 0x20 |
| 0x003C32 | 0xE6 0x7F | AND 0x7F |
| 0x003C34 | 0xED 0x39 0x09 | OUT0 (0x09),A |
| 0x003C37 | 0x3E 0x03 | LD A,0x03 |
| 0x003C39 | 0xED 0x39 0x00 | OUT0 (0x00),A |
| 0x003C3C | 0x3E 0x09 | LD A,0x09 |
| 0x003C3E | 0xCD 0xE5 0x61 0x00 | CALL 0x0061E5 |
| 0x003C42 | 0x79 | LD A,C |
| 0x003C43 | 0xC6 0x80 | ADD 0x80 |
| 0x003C45 | 0xCB 0xBF | RES 7,A |
| 0x003C47 | 0xFD 0x70 0x08 | LD-IXD-REG {"pc":15431,"length":3,"nextPc":15434,"tag":"ld-ixd-reg","indexRegister":"iy","displacement":8,"src":"b","mode":"adl","modePrefix":null} |
| 0x003C4A | 0xC9 | RET |
| 0x003C4B | 0xED 0x38 0x0A | IN0 A,(0x0A) |
| 0x003C4E | 0xE6 0xFD | AND 0xFD |
| 0x003C50 | 0xED 0x39 0x0A | OUT0 (0x0A),A |
| 0x003C53 | 0xED 0x38 0x0B | IN0 A,(0x0B) |
| 0x003C56 | 0xE6 0x02 | AND 0x02 |
| 0x003C58 | 0xC9 | RET |
| 0x003C59 | 0x21 0x61 0x3C 0x00 | LD HL,0x003C61 |
| 0x003C5D | 0x56 | LD-REG-IND {"pc":15453,"length":1,"nextPc":15454,"tag":"ld-reg-ind","dest":"d","src":"hl","mode":"adl","modePrefix":null} |
| 0x003C5E | 0x23 | INC HL |
| 0x003C5F | 0x5E | LD-REG-IND {"pc":15455,"length":1,"nextPc":15456,"tag":"ld-reg-ind","dest":"e","src":"hl","mode":"adl","modePrefix":null} |

### 0x0013E8..0x001405 low-status entry window

| Address | Bytes | Instruction |
| --- | --- | --- |
| 0x0013E8 | 0xF3 | DI {"pc":5096,"length":1,"nextPc":5097,"tag":"di","mode":"adl","modePrefix":null} |
| 0x0013E9 | 0xED 0x38 0x0F | IN0 A,(0x0F) |
| 0x0013EC | 0xCB 0x7F | BIT 7,A |
| 0x0013EE | 0x20 0x08 | JR NZ,0x0013F8 |
| 0x0013F0 | 0xCD 0x05 0x3B 0x00 | CALL 0x003B05 |
| 0x0013F4 | 0xDA 0x33 0x19 0x00 | JP C,0x001933 |
| 0x0013F8 | 0xCD 0xD1 0x28 0x00 | CALL 0x0028D1 |
| 0x0013FC | 0xED 0x38 0x03 | IN0 A,(0x03) |
| 0x0013FF | 0xCB 0x67 | BIT 4,A |
| 0x001401 | 0xC4 0x30 0x59 0x01 | CALL NZ,0x015930 |

### 0x0028C0..0x0028E8 low-ROM branch helper window

| Address | Bytes | Instruction |
| --- | --- | --- |
| 0x0028C0 | 0x01 0x00 0x00 0x00 | LD BC,0x000000 |
| 0x0028C4 | 0xC5 | PUSH BC |
| 0x0028C5 | 0xCD 0xED 0x2B 0x00 | CALL 0x002BED |
| 0x0028C9 | 0xC1 | POP BC |
| 0x0028CA | 0xC1 | POP BC |
| 0x0028CB | 0xC1 | POP BC |
| 0x0028CC | 0xFD 0xE1 | POP IY |
| 0x0028CE | 0xDD 0xE1 | POP IX |
| 0x0028D0 | 0xC9 | RET |
| 0x0028D1 | 0xC9 | RET |
| 0x0028D2 | 0xFD 0xE5 | PUSH IY |
| 0x0028D4 | 0xFD 0x21 0x03 0x00 0x00 | LD IY,0x000003 |
| 0x0028D9 | 0xFD 0x39 | ADD-PAIR {"pc":10457,"length":2,"nextPc":10459,"tag":"add-pair","dest":"iy","src":"sp","mode":"adl","modePrefix":null} |
| 0x0028DB | 0xFD 0xE5 | PUSH IY |
| 0x0028DD | 0xE1 | POP HL |
| 0x0028DE | 0xFD 0x37 0x03 | LD-IXIY-INDEXED {"pc":10462,"length":3,"nextPc":10465,"tag":"ld-ixiy-indexed","dest":"iy","indexRegister":"iy","displacement":3,"mode":"adl","modePrefix":null} |
| 0x0028E1 | 0xFD 0x3E 0x03 | LD-INDEXED-IXIY {"pc":10465,"length":3,"nextPc":10468,"tag":"ld-indexed-ixiy","src":"ix","indexRegister":"iy","displacement":3,"mode":"adl","modePrefix":null} |
| 0x0028E4 | 0xFD 0x2F 0x06 | LD-INDEXED-PAIR {"pc":10468,"length":3,"nextPc":10471,"tag":"ld-indexed-pair","pair":"hl","indexRegister":"iy","displacement":6,"mode":"adl","modePrefix":null} |
| 0x0028E7 | 0xED 0x27 | LD-PAIR-IND {"pc":10471,"length":2,"nextPc":10473,"tag":"ld-pair-ind","pair":"hl","src":"hl","mode":"adl","modePrefix":null} |

### 0x0061D0..0x006210 0x0061E9 context window

| Address | Bytes | Instruction |
| --- | --- | --- |
| 0x0061D0 | 0x21 0x5C 0x0E 0x00 | LD HL,0x000E5C |
| 0x0061D4 | 0x18 0x04 | JR 0x0061DA |
| 0x0061D6 | 0x21 0x06 0x03 0x00 | LD HL,0x000306 |
| 0x0061DA | 0xF1 | POP AF |
| 0x0061DB | 0xB7 | OR A |
| 0x0061DC | 0xED 0x52 | SBC-PAIR {"pc":25052,"length":2,"nextPc":25054,"tag":"sbc-pair","src":"de","mode":"adl","modePrefix":null} |
| 0x0061DE | 0x20 0xFB | JR NZ,0x0061DB |
| 0x0061E0 | 0xE1 | POP HL |
| 0x0061E1 | 0xD1 | POP DE |
| 0x0061E2 | 0xC9 | RET |
| 0x0061E3 | 0x3E 0x01 | LD A,0x01 |
| 0x0061E5 | 0xB7 | OR A |
| 0x0061E6 | 0x20 0x01 | JR NZ,0x0061E9 |
| 0x0061E8 | 0x3C | INC A |
| 0x0061E9 | 0xD5 | PUSH DE |
| 0x0061EA | 0xE5 | PUSH HL |
| 0x0061EB | 0x11 0x01 0x00 0x00 | LD DE,0x000001 |
| 0x0061EF | 0xF5 | PUSH AF |
| 0x0061F0 | 0xED 0x38 0x03 | IN0 A,(0x03) |
| 0x0061F3 | 0xCB 0x67 | BIT 4,A |
| 0x0061F5 | 0x28 0x06 | JR Z,0x0061FD |
| 0x0061F7 | 0x21 0xD8 0x8B 0x00 | LD HL,0x008BD8 |
| 0x0061FB | 0x18 0x04 | JR 0x006201 |
| 0x0061FD | 0x21 0x3E 0x1E 0x00 | LD HL,0x001E3E |
| 0x006201 | 0xF1 | POP AF |
| 0x006202 | 0xB7 | OR A |
| 0x006203 | 0xED 0x52 | SBC-PAIR {"pc":25091,"length":2,"nextPc":25093,"tag":"sbc-pair","src":"de","mode":"adl","modePrefix":null} |
| 0x006205 | 0x20 0xFB | JR NZ,0x006202 |
| 0x006207 | 0x3D | DEC A |
| 0x006208 | 0x20 0xE5 | JR NZ,0x0061EF |
| 0x00620A | 0xE1 | POP HL |
| 0x00620B | 0xD1 | POP DE |
| 0x00620C | 0xC9 | RET |
| 0x00620D | 0xCD 0x34 0x58 0x01 | CALL 0x015834 |

## Static 0x0061E9 Direct References

No direct 24-bit CALL/JP references to `0x0061E9` were found by raw opcode scan.

## Raw Route Summary

```json
{
  "scenario": "no-autorun-digit2",
  "key": "Digit2",
  "replayOk": true,
  "errors": [],
  "route": {
    "label": "no-autorun-digit2:Digit2",
    "totalBlocks": 299956,
    "tokenHookHits": 0,
    "lowPathHits": 60903,
    "cleanupHits": 3,
    "cxMainHits": 2,
    "keyHandlerHits": 2,
    "upstreamCounts": {
      "up003c42": 2,
      "up003b0d": 2,
      "up003b17": 2,
      "up0013f4": 2,
      "up0013f8": 2,
      "up0028d1": 2,
      "up0013fc": 2
    },
    "frame0061e9Hits": 31,
    "startFields": {
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0,
      "D00080": 0,
      "D0009F": 0,
      "D007CA": 361961,
      "D008E0": 0,
      "D02A28": 0,
      "D001B8": 0,
      "D001D3": 0,
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 13805589,
      "D0301B": 0,
      "D02A40": 0,
      "VAT_D02590": 13893249,
      "VAT_D0259D": 13893325
    },
    "endFields": {
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0,
      "D00080": 0,
      "D0009F": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02A28": 0,
      "D001B8": 0,
      "D001D3": 0,
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 0,
      "D0301B": 0,
      "D02A40": 0,
      "VAT_D02590": 0,
      "VAT_D0259D": 0
    },
    "firstBlocks": [
      "0x08C331",
      "0x05C634",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x00171E",
      "0x0067F8",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CCE",
      "0x001CD5",
      "0x001CE5",
      "0x001C54",
      "0x006808",
      "0x001C33",
      "0x001C38",
      "0x001C3C"
    ],
    "lastBlocks": [
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000AC5",
      "0x000ACE",
      "0x000AEE",
      "0x000A79",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92",
      "0x000A92"
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 33289
      },
      {
        "pc": "0x000BFE",
        "count": 32258
      },
      {
        "pc": "0x0021C2",
        "count": 20182
      },
      {
        "pc": "0x006D5D",
        "count": 20176
      },
      {
        "pc": "0x006D64",
        "count": 20176
      },
      {
        "pc": "0x006CDF",
        "count": 20166
      },
      {
        "pc": "0x006D0F",
        "count": 20166
      },
      {
        "pc": "0x006D38",
        "count": 20160
      },
      {
        "pc": "0x006D4F",
        "count": 20160
      },
      {
        "pc": "0x006CF7",
        "count": 20156
      },
      {
        "pc": "0x005AE8",
        "count": 6224
      },
      {
        "pc": "0x005B16",
        "count": 6224
      },
      {
        "pc": "0x005B4B",
        "count": 6224
      },
      {
        "pc": "0x005AB6",
        "count": 5835
      },
      {
        "pc": "0x000B72",
        "count": 3870
      },
      {
        "pc": "0x000B7C",
        "count": 3101
      }
    ]
  },
  "upstreamSamples": {
    "up003c42": [
      {
        "block": 14781,
        "target": "up003c42",
        "pc": "0x003C42",
        "previousPc": "0x006202",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003C42",
          "sp": "0xD1A875",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x09",
          "f": "0x0A",
          "af": "0x090A",
          "bc": "0x000004",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": false,
            "h": false,
            "pv": false,
            "n": true,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0x79",
          "0xC6",
          "0x80",
          "0xCB",
          "0xBF",
          "0xFD",
          "0x70",
          "0x08",
          "0xC9",
          "0xED",
          "0x38",
          "0x0A",
          "0xE6",
          "0xFD",
          "0xED",
          "0x39"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x003B0D"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "returnHints": [
          "0x003B0D",
          "0x004000",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209984,
        "target": "up003c42",
        "pc": "0x003C42",
        "previousPc": "0x006202",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003C42",
          "sp": "0xD1A875",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x09",
          "f": "0x0A",
          "af": "0x090A",
          "bc": "0x000004",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": false,
            "h": false,
            "pv": false,
            "n": true,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0x79",
          "0xC6",
          "0x80",
          "0xCB",
          "0xBF",
          "0xFD",
          "0x70",
          "0x08",
          "0xC9",
          "0xED",
          "0x38",
          "0x0A",
          "0xE6",
          "0xFD",
          "0xED",
          "0x39"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x003B0D"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "returnHints": [
          "0x003B0D",
          "0x004000",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14781,
        "pc": "0x003C42",
        "target": "up003c42",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x003B0D"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209984,
        "pc": "0x003C42",
        "target": "up003c42",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x003B0D"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up003b0d": [
      {
        "block": 14782,
        "target": "up003b0d",
        "pc": "0x003B0D",
        "previousPc": "0x003C42",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003B0D",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x000004",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xC1",
          "0xF5",
          "0xED",
          "0x38",
          "0x0F",
          "0xA8",
          "0xCB",
          "0x7F",
          "0x20",
          "0xD8",
          "0xF1",
          "0xC9",
          "0x3A",
          "0x7E",
          "0x00",
          "0x00"
        ],
        "recentBlocks": [
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 33,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x004000",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209985,
        "target": "up003b0d",
        "pc": "0x003B0D",
        "previousPc": "0x003C42",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003B0D",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x000004",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xC1",
          "0xF5",
          "0xED",
          "0x38",
          "0x0F",
          "0xA8",
          "0xCB",
          "0x7F",
          "0x20",
          "0xD8",
          "0xF1",
          "0xC9",
          "0x3A",
          "0x7E",
          "0x00",
          "0x00"
        ],
        "recentBlocks": [
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 33,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x004000",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14782,
        "pc": "0x003B0D",
        "target": "up003b0d",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209985,
        "pc": "0x003B0D",
        "target": "up003b0d",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x004000"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up003b17": [
      {
        "block": 14783,
        "target": "up003b17",
        "pc": "0x003B17",
        "previousPc": "0x003B0D",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003B17",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x00",
          "f": "0x54",
          "af": "0x0054",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": true,
            "h": true,
            "pv": true,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xF1",
          "0xC9",
          "0x3A",
          "0x7E",
          "0x00",
          "0x00",
          "0xFE",
          "0xFF",
          "0x28",
          "0x09",
          "0x3E",
          "0xDC",
          "0xDB",
          "0x06",
          "0xFE",
          "0x00"
        ],
        "recentBlocks": [
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x000480"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 33,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x000480",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209986,
        "target": "up003b17",
        "pc": "0x003B17",
        "previousPc": "0x003B0D",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x003B17",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x00",
          "f": "0x54",
          "af": "0x0054",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": true,
            "h": true,
            "pv": true,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xF1",
          "0xC9",
          "0x3A",
          "0x7E",
          "0x00",
          "0x00",
          "0xFE",
          "0xFF",
          "0x28",
          "0x09",
          "0x3E",
          "0xDC",
          "0xDB",
          "0x06",
          "0xFE",
          "0x00"
        ],
        "recentBlocks": [
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x000480"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 33,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x000480",
          "0x0013F4",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14783,
        "pc": "0x003B17",
        "target": "up003b17",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x000480"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209986,
        "pc": "0x003B17",
        "target": "up003b17",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A878",
            "value": "0x000480"
          },
          {
            "offset": 3,
            "addr": "0xD1A87B",
            "value": "0x0013F4"
          },
          {
            "offset": 6,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 24,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A893",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up0013f4": [
      {
        "block": 14784,
        "target": "up0013f4",
        "pc": "0x0013F4",
        "previousPc": "0x003B17",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0013F4",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xDA",
          "0x33",
          "0x19",
          "0x00",
          "0xCD",
          "0xD1",
          "0x28",
          "0x00",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0xC4",
          "0x30",
          "0x59"
        ],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A89C",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89F",
            "value": "0x290000"
          }
        ],
        "returnHints": [
          "0x008000",
          "0x008000",
          "0x290000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209987,
        "target": "up0013f4",
        "pc": "0x0013F4",
        "previousPc": "0x003B17",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0013F4",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xDA",
          "0x33",
          "0x19",
          "0x00",
          "0xCD",
          "0xD1",
          "0x28",
          "0x00",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0xC4",
          "0x30",
          "0x59"
        ],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A89C",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89F",
            "value": "0x290000"
          }
        ],
        "returnHints": [
          "0x008000",
          "0x008000",
          "0x290000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14784,
        "pc": "0x0013F4",
        "target": "up0013f4",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209987,
        "pc": "0x0013F4",
        "target": "up0013f4",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up0013f8": [
      {
        "block": 14785,
        "target": "up0013f8",
        "pc": "0x0013F8",
        "previousPc": "0x0013F4",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0013F8",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xCD",
          "0xD1",
          "0x28",
          "0x00",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0xC4",
          "0x30",
          "0x59",
          "0x01",
          "0xCD",
          "0xBC",
          "0x3C"
        ],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A89C",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89F",
            "value": "0x290000"
          }
        ],
        "returnHints": [
          "0x008000",
          "0x008000",
          "0x290000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209988,
        "target": "up0013f8",
        "pc": "0x0013F8",
        "previousPc": "0x0013F4",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0013F8",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xCD",
          "0xD1",
          "0x28",
          "0x00",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0xC4",
          "0x30",
          "0x59",
          "0x01",
          "0xCD",
          "0xBC",
          "0x3C"
        ],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A89C",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89F",
            "value": "0x290000"
          }
        ],
        "returnHints": [
          "0x008000",
          "0x008000",
          "0x290000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14785,
        "pc": "0x0013F8",
        "target": "up0013f8",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209988,
        "pc": "0x0013F8",
        "target": "up0013f8",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up0028d1": [
      {
        "block": 14786,
        "target": "up0028d1",
        "pc": "0x0028D1",
        "previousPc": "0x0013F8",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0028D1",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xC9",
          "0xFD",
          "0xE5",
          "0xFD",
          "0x21",
          "0x03",
          "0x00",
          "0x00",
          "0xFD",
          "0x39",
          "0xFD",
          "0xE5",
          "0xE1",
          "0xFD",
          "0x37",
          "0x03"
        ],
        "recentBlocks": [
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "offset": 3,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 21,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 30,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89C",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x0013FC",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 209989,
        "target": "up0028d1",
        "pc": "0x0028D1",
        "previousPc": "0x0013F8",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0028D1",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xC9",
          "0xFD",
          "0xE5",
          "0xFD",
          "0x21",
          "0x03",
          "0x00",
          "0x00",
          "0xFD",
          "0x39",
          "0xFD",
          "0xE5",
          "0xE1",
          "0xFD",
          "0x37",
          "0x03"
        ],
        "recentBlocks": [
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "offset": 3,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 21,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 30,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89C",
            "value": "0x000000"
          }
        ],
        "returnHints": [
          "0x0013FC",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 209924,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209932,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209934,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209938,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209940,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 209943,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209945,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209949,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209951,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209955,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209957,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209963,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209967,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209969,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209975,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 209981,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 207689,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 207690,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 207691,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 208348,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 209979,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14786,
        "pc": "0x0028D1",
        "target": "up0028d1",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "offset": 3,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 21,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209989,
        "pc": "0x0028D1",
        "target": "up0028d1",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "offset": 3,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 21,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 27,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "up0013fc": [
      {
        "block": 14787,
        "target": "up0013fc",
        "pc": "0x0013FC",
        "previousPc": "0x0028D1",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0013FC",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x04",
          "f": "0x80",
          "af": "0x0480",
          "bc": "0x004000",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": true,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0xC4",
          "0x30",
          "0x59",
          "0x01",
          "0xCD",
          "0xBC",
          "0x3C",
          "0x00",
          "0xFE",
          "0x06",
          "0x20"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A89C",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A89F",
            "value": "0x290000"
          }
        ],
        "returnHints": [
          "0x008000",
          "0x008000",
          "0x290000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 14721,
            "pc": "0x00190F",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x02",
            "f": "0x10",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14729,
            "pc": "0x003B47",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14731,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x7F",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14735,
            "pc": "0x003B86",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14737,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x09",
            "f": "0x0A",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 14740,
            "pc": "0x003B9C",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0xF6",
            "f": "0xA4",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14742,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0xF6",
            "a": "0x03",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14746,
            "pc": "0x003BB8",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14748,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x80",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14752,
            "pc": "0x003BD1",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0xD6",
            "f": "0x90",
            "flags": {
              "s": true,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14754,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14760,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0xD6",
            "a": "0x83",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14764,
            "pc": "0x003BFD",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x14",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14766,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14772,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x04",
            "f": "0xAD",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 14778,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x09",
            "f": "0x0C",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 14776,
            "pc": "0x003C27",
            "port": "0x0009",
            "value": "0x76",
            "a": "0x76",
            "f": "0x30",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 14787,
        "pc": "0x0013FC",
        "target": "up0013fc",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      },
      {
        "block": 209990,
        "pc": "0x0013FC",
        "target": "up0013fc",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B3",
          "0x0060B5",
          "0x0060C7",
          "0x0060D8",
          "0x0060E5",
          "0x0060EA",
          "0x0060F6",
          "0x00190F",
          "0x0013E8",
          "0x0013F0",
          "0x003B05",
          "0x003B19",
          "0x003B2A",
          "0x003C4B",
          "0x003B45",
          "0x003B47",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B5D",
          "0x003B86",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003B9C",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BB0",
          "0x003BB8",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BC9",
          "0x003BD1",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BE4",
          "0x003BEC",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 3,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 6,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 9,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 18,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A896",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A899",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ],
    "frame0061e9": [
      {
        "block": 13157,
        "target": "frame0061e9",
        "pc": "0x0061E9",
        "previousPc": "0x0061E3",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0061E9",
          "sp": "0xD1A875",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x01",
          "f": "0x00",
          "af": "0x0100",
          "bc": "0x004018",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": false,
            "h": false,
            "pv": false,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xD5",
          "0xE5",
          "0x11",
          "0x01",
          "0x00",
          "0x00",
          "0xF5",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0x28",
          "0x06",
          "0x21",
          "0xD8"
        ],
        "recentBlocks": [
          "0x001CE4",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C4A",
          "0x0158D2",
          "0x0158DA",
          "0x0158EC",
          "0x0158EE",
          "0x0158F8",
          "0x001872",
          "0x001879",
          "0x0018F8",
          "0x005B96",
          "0x00190B",
          "0x005BB1",
          "0x005C44",
          "0x005C59",
          "0x005C5E",
          "0x005C6C",
          "0x005C71",
          "0x005C84",
          "0x005C99",
          "0x005CAE",
          "0x005CC8",
          "0x005CDB",
          "0x005CEC",
          "0x005CF1",
          "0x005D0D",
          "0x0061E3",
          "0x0061E9"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x005D19"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x00190F"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "returnHints": [
          "0x005D19",
          "0x00190F",
          "0x0013E8",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 12089,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12090,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12091,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12217,
            "pc": "0x02B03B",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x00",
            "f": "0x12",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12503,
            "pc": "0x006816",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x02",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 12570,
            "pc": "0x000658",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x02",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12573,
            "pc": "0x00067E",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x05",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12576,
            "pc": "0x0012E3",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x06",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12920,
            "pc": "0x001379",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x76",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12925,
            "pc": "0x001988",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x08",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x7F",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x42",
            "a": "0x42",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13137,
            "pc": "0x001872",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x42",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13142,
            "pc": "0x005BB1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x95",
            "f": "0x40",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x0C",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13154,
            "pc": "0x005CF1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x84",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x52",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 13154,
            "pc": "0x005CF1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x84",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 13162,
        "target": "frame0061e9",
        "pc": "0x0061E9",
        "previousPc": "0x0061E5",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0061E9",
          "sp": "0xD1A875",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x05",
          "f": "0x04",
          "af": "0x0504",
          "bc": "0x004018",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": false,
            "h": false,
            "pv": true,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xD5",
          "0xE5",
          "0x11",
          "0x01",
          "0x00",
          "0x00",
          "0xF5",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0x28",
          "0x06",
          "0x21",
          "0xD8"
        ],
        "recentBlocks": [
          "0x001C4A",
          "0x0158D2",
          "0x0158DA",
          "0x0158EC",
          "0x0158EE",
          "0x0158F8",
          "0x001872",
          "0x001879",
          "0x0018F8",
          "0x005B96",
          "0x00190B",
          "0x005BB1",
          "0x005C44",
          "0x005C59",
          "0x005C5E",
          "0x005C6C",
          "0x005C71",
          "0x005C84",
          "0x005C99",
          "0x005CAE",
          "0x005CC8",
          "0x005CDB",
          "0x005CEC",
          "0x005CF1",
          "0x005D0D",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x005D19",
          "0x0061E5",
          "0x0061E9"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x005D27"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x00190F"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "returnHints": [
          "0x005D27",
          "0x00190F",
          "0x0013E8",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 12217,
            "pc": "0x02B03B",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x00",
            "f": "0x12",
            "flags": {
              "s": false,
              "z": false,
              "h": true,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12503,
            "pc": "0x006816",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x02",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 12570,
            "pc": "0x000658",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x02",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12573,
            "pc": "0x00067E",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x05",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12576,
            "pc": "0x0012E3",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x06",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12920,
            "pc": "0x001379",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x76",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12925,
            "pc": "0x001988",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x08",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x7F",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x42",
            "a": "0x42",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13137,
            "pc": "0x001872",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x42",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13142,
            "pc": "0x005BB1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x95",
            "f": "0x40",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x0C",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13154,
            "pc": "0x005CF1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x84",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x52",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13157,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13160,
            "pc": "0x005D19",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x01",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13160,
            "pc": "0x005D19",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 13157,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 13160,
            "pc": "0x005D19",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 13167,
        "target": "frame0061e9",
        "pc": "0x0061E9",
        "previousPc": "0x0061E5",
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "cpu": {
          "pc": "0x0061E9",
          "sp": "0xD1A875",
          "ix": "0x000000",
          "iy": "0xD00080",
          "a": "0x0C",
          "f": "0x0C",
          "af": "0x0C0C",
          "bc": "0x004018",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "s": false,
            "z": false,
            "h": false,
            "pv": true,
            "n": false,
            "c": false
          },
          "halted": false,
          "madl": 1,
          "mbase": "0xD0"
        },
        "iyFlags": {
          "IY+00": {
            "addr": "0xD00080",
            "value": "0x00"
          },
          "IY+0D": {
            "addr": "0xD0008D",
            "value": "0x00"
          },
          "IY+1B": {
            "addr": "0xD0009B",
            "value": "0x00"
          },
          "IY+1F": {
            "addr": "0xD0009F",
            "value": "0x00"
          },
          "IY+23": {
            "addr": "0xD000A3",
            "value": "0x00"
          },
          "IY+27": {
            "addr": "0xD000A7",
            "value": "0x00"
          },
          "IY+28": {
            "addr": "0xD000A8",
            "value": "0x00"
          },
          "IY+2C": {
            "addr": "0xD000AC",
            "value": "0x00"
          },
          "IY+42": {
            "addr": "0xD000C2",
            "value": "0x00"
          },
          "IY+44": {
            "addr": "0xD000C4",
            "value": "0x00"
          }
        },
        "bytesAtPc": [
          "0xD5",
          "0xE5",
          "0x11",
          "0x01",
          "0x00",
          "0x00",
          "0xF5",
          "0xED",
          "0x38",
          "0x03",
          "0xCB",
          "0x67",
          "0x28",
          "0x06",
          "0x21",
          "0xD8"
        ],
        "recentBlocks": [
          "0x0158F8",
          "0x001872",
          "0x001879",
          "0x0018F8",
          "0x005B96",
          "0x00190B",
          "0x005BB1",
          "0x005C44",
          "0x005C59",
          "0x005C5E",
          "0x005C6C",
          "0x005C71",
          "0x005C84",
          "0x005C99",
          "0x005CAE",
          "0x005CC8",
          "0x005CDB",
          "0x005CEC",
          "0x005CF1",
          "0x005D0D",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x005D19",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x005D27",
          "0x0061E5",
          "0x0061E9"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x005D35"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x00190F"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "offset": 30,
            "addr": "0xD1A893",
            "value": "0x000000"
          },
          {
            "offset": 33,
            "addr": "0xD1A896",
            "value": "0x008000"
          }
        ],
        "returnHints": [
          "0x005D35",
          "0x00190F",
          "0x0013E8",
          "0x008000",
          "0x008000"
        ],
        "ioTail": [
          {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 12570,
            "pc": "0x000658",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x02",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12573,
            "pc": "0x00067E",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x05",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12576,
            "pc": "0x0012E3",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x06",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12920,
            "pc": "0x001379",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x76",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 12925,
            "pc": "0x001988",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x08",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x02",
            "a": "0x7F",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13035,
            "pc": "0x001853",
            "port": "0x0009",
            "value": "0x42",
            "a": "0x42",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13137,
            "pc": "0x001872",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x42",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13138,
            "pc": "0x001879",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13142,
            "pc": "0x005BB1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x95",
            "f": "0x40",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x0C",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13154,
            "pc": "0x005CF1",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0xFF",
            "f": "0x84",
            "flags": {
              "s": true,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x52",
            "a": "0xEE",
            "f": "0x54",
            "flags": {
              "s": false,
              "z": true,
              "h": true,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13155,
            "pc": "0x005D0D",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13157,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x01",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13160,
            "pc": "0x005D19",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x01",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13160,
            "pc": "0x005D19",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x52",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13162,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x05",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          {
            "type": "read",
            "block": 13165,
            "pc": "0x005D27",
            "port": "0x0009",
            "value": "0x52",
            "a": "0x05",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          {
            "type": "write",
            "block": 13165,
            "pc": "0x005D27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        ],
        "lastIoByPort": {
          "0x0003": {
            "type": "read",
            "block": 13162,
            "pc": "0x0061E9",
            "port": "0x0003",
            "value": "0xEE",
            "a": "0x05",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5016": {
            "type": "read",
            "block": 12510,
            "pc": "0x03CF7D",
            "port": "0x5016",
            "value": "0x00",
            "a": "0x00",
            "f": "0x42",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5015": {
            "type": "read",
            "block": 12511,
            "pc": "0x03CFA4",
            "port": "0x5015",
            "value": "0x00",
            "a": "0x00",
            "f": "0x44",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5014": {
            "type": "read",
            "block": 12512,
            "pc": "0x03CFCF",
            "port": "0x5014",
            "value": "0x10",
            "a": "0x00",
            "f": "0x02",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": true,
              "c": false
            }
          },
          "0x5004": {
            "type": "write",
            "block": 13145,
            "pc": "0x005C5E",
            "port": "0x5004",
            "value": "0x11",
            "a": "0x11",
            "f": "0x04",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": true,
              "n": false,
              "c": false
            }
          },
          "0x5005": {
            "type": "write",
            "block": 11366,
            "pc": "0x048ACC",
            "port": "0x5005",
            "value": "0x00",
            "a": "0x00",
            "f": "0x45",
            "flags": {
              "s": false,
              "z": true,
              "h": false,
              "pv": true,
              "n": false,
              "c": true
            }
          },
          "0x0009": {
            "type": "write",
            "block": 13165,
            "pc": "0x005D27",
            "port": "0x0009",
            "value": "0x56",
            "a": "0x56",
            "f": "0x00",
            "flags": {
              "s": false,
              "z": false,
              "h": false,
              "pv": false,
              "n": false,
              "c": false
            }
          }
        }
      },
      {
        "block": 13157,
        "pc": "0x0061E9",
        "target": "frame0061e9",
        "before": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D0301B": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
        },
        "recentBlocks": [
          "0x001C33",
          "0x001C38",
          "0x001C44",
          "0x001C7D",
          "0x001CA6",
          "0x001CBC",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C38",
          "0x001C44",
          "0x001C7D",
          "0x001CA6",
          "0x001CBC",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C38",
          "0x001C44",
          "0x001C7D",
          "0x001CA6",
          "0x001CBC",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C38",
          "0x001C44",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CE4",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C38",
          "0x001C44",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CE4",
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
          "0x001C4A",
          "0x0158D2",
          "0x0158DA",
          "0x0158EC",
          "0x0158EE",
          "0x0158F8",
          "0x001872",
          "0x001879",
          "0x0018F8",
          "0x005B96",
          "0x00190B",
          "0x005BB1",
          "0x005C44",
          "0x005C59",
          "0x005C5E",
          "0x005C6C",
          "0x005C71",
          "0x005C84",
          "0x005C99",
          "0x005CAE",
          "0x005CC8",
          "0x005CDB",
          "0x005CEC",
          "0x005CF1",
          "0x005D0D",
          "0x0061E3",
          "0x0061E9"
        ],
        "stack24": [
          {
            "offset": 0,
            "addr": "0xD1A875",
            "value": "0x005D19"
          },
          {
            "offset": 3,
            "addr": "0xD1A878",
            "value": "0x00190F"
          },
          {
            "offset": 6,
            "addr": "0xD1A87B",
            "value": "0x0013E8"
          },
          {
            "offset": 9,
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "offset": 12,
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "offset": 15,
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "offset": 18,
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "offset": 21,
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "offset": 24,
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "offset": 27,
            "addr": "0xD1A890",
            "value": "0x000000"
          }
        ],
        "runtime": {
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 637707
        }
      }
    ]
  },
  "first0013fc": {
    "block": 14787,
    "target": "up0013fc",
    "pc": "0x0013FC",
    "previousPc": "0x0028D1",
    "routeFields": {
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0,
      "D00080": 0,
      "D0009F": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02A28": 0,
      "D001B8": 0,
      "D001D3": 0,
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 0,
      "D0301B": 0,
      "D02A40": 0,
      "VAT_D02590": 0,
      "VAT_D0259D": 0
    },
    "cpu": {
      "pc": "0x0013FC",
      "sp": "0xD1A87E",
      "ix": "0x000000",
      "iy": "0xD00080",
      "a": "0x04",
      "f": "0x80",
      "af": "0x0480",
      "bc": "0x004000",
      "de": "0xD65800",
      "hl": "0xD657FF",
      "flags": {
        "s": true,
        "z": false,
        "h": false,
        "pv": false,
        "n": false,
        "c": false
      },
      "halted": false,
      "madl": 1,
      "mbase": "0xD0"
    },
    "iyFlags": {
      "IY+00": {
        "addr": "0xD00080",
        "value": "0x00"
      },
      "IY+0D": {
        "addr": "0xD0008D",
        "value": "0x00"
      },
      "IY+1B": {
        "addr": "0xD0009B",
        "value": "0x00"
      },
      "IY+1F": {
        "addr": "0xD0009F",
        "value": "0x00"
      },
      "IY+23": {
        "addr": "0xD000A3",
        "value": "0x00"
      },
      "IY+27": {
        "addr": "0xD000A7",
        "value": "0x00"
      },
      "IY+28": {
        "addr": "0xD000A8",
        "value": "0x00"
      },
      "IY+2C": {
        "addr": "0xD000AC",
        "value": "0x00"
      },
      "IY+42": {
        "addr": "0xD000C2",
        "value": "0x00"
      },
      "IY+44": {
        "addr": "0xD000C4",
        "value": "0x00"
      }
    },
    "bytesAtPc": [
      "0xED",
      "0x38",
      "0x03",
      "0xCB",
      "0x67",
      "0xC4",
      "0x30",
      "0x59",
      "0x01",
      "0xCD",
      "0xBC",
      "0x3C",
      "0x00",
      "0xFE",
      "0x06",
      "0x20"
    ],
    "recentBlocks": [
      "0x006202",
      "0x003BE4",
      "0x003BEC",
      "0x0061E3",
      "0x0061E9",
      "0x0061FD",
      "0x006202",
      "0x003BF5",
      "0x003BFD",
      "0x0061E3",
      "0x0061E9",
      "0x0061FD",
      "0x006202",
      "0x003C0E",
      "0x003C16",
      "0x0061E3",
      "0x0061E9",
      "0x0061FD",
      "0x006202",
      "0x003C1F",
      "0x003C27",
      "0x0061E5",
      "0x0061E9",
      "0x0061FD",
      "0x006202",
      "0x003C42",
      "0x003B0D",
      "0x003B17",
      "0x0013F4",
      "0x0013F8",
      "0x0028D1",
      "0x0013FC"
    ],
    "stack24": [
      {
        "offset": 0,
        "addr": "0xD1A87E",
        "value": "0x000000"
      },
      {
        "offset": 3,
        "addr": "0xD1A881",
        "value": "0x000000"
      },
      {
        "offset": 6,
        "addr": "0xD1A884",
        "value": "0x000000"
      },
      {
        "offset": 9,
        "addr": "0xD1A887",
        "value": "0x000000"
      },
      {
        "offset": 12,
        "addr": "0xD1A88A",
        "value": "0x000000"
      },
      {
        "offset": 15,
        "addr": "0xD1A88D",
        "value": "0x008000"
      },
      {
        "offset": 18,
        "addr": "0xD1A890",
        "value": "0x000000"
      },
      {
        "offset": 21,
        "addr": "0xD1A893",
        "value": "0x000000"
      },
      {
        "offset": 24,
        "addr": "0xD1A896",
        "value": "0x008000"
      },
      {
        "offset": 27,
        "addr": "0xD1A899",
        "value": "0x000000"
      },
      {
        "offset": 30,
        "addr": "0xD1A89C",
        "value": "0x000000"
      },
      {
        "offset": 33,
        "addr": "0xD1A89F",
        "value": "0x290000"
      }
    ],
    "returnHints": [
      "0x008000",
      "0x008000",
      "0x290000"
    ],
    "ioTail": [
      {
        "type": "read",
        "block": 14721,
        "pc": "0x00190F",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0xFF",
        "f": "0x10",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14729,
        "pc": "0x003B47",
        "port": "0x0009",
        "value": "0x56",
        "a": "0x02",
        "f": "0x10",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 14729,
        "pc": "0x003B47",
        "port": "0x0009",
        "value": "0xD6",
        "a": "0xD6",
        "f": "0x90",
        "flags": {
          "s": true,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14731,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14735,
        "pc": "0x003B86",
        "port": "0x0009",
        "value": "0xD6",
        "a": "0x7F",
        "f": "0xAD",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      {
        "type": "write",
        "block": 14735,
        "pc": "0x003B86",
        "port": "0x0009",
        "value": "0xF6",
        "a": "0xF6",
        "f": "0xA4",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14737,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x09",
        "f": "0x0C",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14740,
        "pc": "0x003B9C",
        "port": "0x0009",
        "value": "0xF6",
        "a": "0x09",
        "f": "0x0A",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 14740,
        "pc": "0x003B9C",
        "port": "0x0009",
        "value": "0xF6",
        "a": "0xF6",
        "f": "0xA4",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14742,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14746,
        "pc": "0x003BB8",
        "port": "0x0009",
        "value": "0xF6",
        "a": "0x03",
        "f": "0xAD",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      {
        "type": "write",
        "block": 14746,
        "pc": "0x003BB8",
        "port": "0x0009",
        "value": "0x76",
        "a": "0x76",
        "f": "0x30",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14748,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14752,
        "pc": "0x003BD1",
        "port": "0x0009",
        "value": "0x76",
        "a": "0x80",
        "f": "0xAD",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      {
        "type": "write",
        "block": 14752,
        "pc": "0x003BD1",
        "port": "0x0009",
        "value": "0xD6",
        "a": "0xD6",
        "f": "0x90",
        "flags": {
          "s": true,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14754,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14760,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14764,
        "pc": "0x003BFD",
        "port": "0x0009",
        "value": "0xD6",
        "a": "0x83",
        "f": "0xAD",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      {
        "type": "write",
        "block": 14764,
        "pc": "0x003BFD",
        "port": "0x0009",
        "value": "0x56",
        "a": "0x56",
        "f": "0x14",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14766,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14772,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x01",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14776,
        "pc": "0x003C27",
        "port": "0x0009",
        "value": "0x56",
        "a": "0x04",
        "f": "0xAD",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      {
        "type": "write",
        "block": 14776,
        "pc": "0x003C27",
        "port": "0x0009",
        "value": "0x76",
        "a": "0x76",
        "f": "0x30",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 14778,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x09",
        "f": "0x0C",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      }
    ],
    "lastIoByPort": {
      "0x0003": {
        "type": "read",
        "block": 14778,
        "pc": "0x0061E9",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x09",
        "f": "0x0C",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5016": {
        "type": "read",
        "block": 12510,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5015": {
        "type": "read",
        "block": 12511,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5014": {
        "type": "read",
        "block": 12512,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5004": {
        "type": "write",
        "block": 13145,
        "pc": "0x005C5E",
        "port": "0x5004",
        "value": "0x11",
        "a": "0x11",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5005": {
        "type": "write",
        "block": 11366,
        "pc": "0x048ACC",
        "port": "0x5005",
        "value": "0x00",
        "a": "0x00",
        "f": "0x45",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      "0x0009": {
        "type": "write",
        "block": 14776,
        "pc": "0x003C27",
        "port": "0x0009",
        "value": "0x76",
        "a": "0x76",
        "f": "0x30",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": false,
          "c": false
        }
      }
    }
  },
  "first0061e9": {
    "block": 13157,
    "target": "frame0061e9",
    "pc": "0x0061E9",
    "previousPc": "0x0061E3",
    "routeFields": {
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0,
      "D00080": 0,
      "D0009F": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02A28": 0,
      "D001B8": 0,
      "D001D3": 0,
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 0,
      "D0301B": 0,
      "D02A40": 0,
      "VAT_D02590": 0,
      "VAT_D0259D": 0
    },
    "cpu": {
      "pc": "0x0061E9",
      "sp": "0xD1A875",
      "ix": "0x000000",
      "iy": "0xD00080",
      "a": "0x01",
      "f": "0x00",
      "af": "0x0100",
      "bc": "0x004018",
      "de": "0xD65800",
      "hl": "0xD657FF",
      "flags": {
        "s": false,
        "z": false,
        "h": false,
        "pv": false,
        "n": false,
        "c": false
      },
      "halted": false,
      "madl": 1,
      "mbase": "0xD0"
    },
    "iyFlags": {
      "IY+00": {
        "addr": "0xD00080",
        "value": "0x00"
      },
      "IY+0D": {
        "addr": "0xD0008D",
        "value": "0x00"
      },
      "IY+1B": {
        "addr": "0xD0009B",
        "value": "0x00"
      },
      "IY+1F": {
        "addr": "0xD0009F",
        "value": "0x00"
      },
      "IY+23": {
        "addr": "0xD000A3",
        "value": "0x00"
      },
      "IY+27": {
        "addr": "0xD000A7",
        "value": "0x00"
      },
      "IY+28": {
        "addr": "0xD000A8",
        "value": "0x00"
      },
      "IY+2C": {
        "addr": "0xD000AC",
        "value": "0x00"
      },
      "IY+42": {
        "addr": "0xD000C2",
        "value": "0x00"
      },
      "IY+44": {
        "addr": "0xD000C4",
        "value": "0x00"
      }
    },
    "bytesAtPc": [
      "0xD5",
      "0xE5",
      "0x11",
      "0x01",
      "0x00",
      "0x00",
      "0xF5",
      "0xED",
      "0x38",
      "0x03",
      "0xCB",
      "0x67",
      "0x28",
      "0x06",
      "0x21",
      "0xD8"
    ],
    "recentBlocks": [
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C4A",
      "0x0158D2",
      "0x0158DA",
      "0x0158EC",
      "0x0158EE",
      "0x0158F8",
      "0x001872",
      "0x001879",
      "0x0018F8",
      "0x005B96",
      "0x00190B",
      "0x005BB1",
      "0x005C44",
      "0x005C59",
      "0x005C5E",
      "0x005C6C",
      "0x005C71",
      "0x005C84",
      "0x005C99",
      "0x005CAE",
      "0x005CC8",
      "0x005CDB",
      "0x005CEC",
      "0x005CF1",
      "0x005D0D",
      "0x0061E3",
      "0x0061E9"
    ],
    "stack24": [
      {
        "offset": 0,
        "addr": "0xD1A875",
        "value": "0x005D19"
      },
      {
        "offset": 3,
        "addr": "0xD1A878",
        "value": "0x00190F"
      },
      {
        "offset": 6,
        "addr": "0xD1A87B",
        "value": "0x0013E8"
      },
      {
        "offset": 9,
        "addr": "0xD1A87E",
        "value": "0x000000"
      },
      {
        "offset": 12,
        "addr": "0xD1A881",
        "value": "0x000000"
      },
      {
        "offset": 15,
        "addr": "0xD1A884",
        "value": "0x000000"
      },
      {
        "offset": 18,
        "addr": "0xD1A887",
        "value": "0x000000"
      },
      {
        "offset": 21,
        "addr": "0xD1A88A",
        "value": "0x000000"
      },
      {
        "offset": 24,
        "addr": "0xD1A88D",
        "value": "0x008000"
      },
      {
        "offset": 27,
        "addr": "0xD1A890",
        "value": "0x000000"
      },
      {
        "offset": 30,
        "addr": "0xD1A893",
        "value": "0x000000"
      },
      {
        "offset": 33,
        "addr": "0xD1A896",
        "value": "0x008000"
      }
    ],
    "returnHints": [
      "0x005D19",
      "0x00190F",
      "0x0013E8",
      "0x008000",
      "0x008000"
    ],
    "ioTail": [
      {
        "type": "read",
        "block": 12089,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12090,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12091,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12217,
        "pc": "0x02B03B",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x00",
        "f": "0x12",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12503,
        "pc": "0x006816",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x02",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12510,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12511,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12512,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 12570,
        "pc": "0x000658",
        "port": "0x0009",
        "value": "0x02",
        "a": "0x02",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12573,
        "pc": "0x00067E",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x05",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12576,
        "pc": "0x0012E3",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x06",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12920,
        "pc": "0x001379",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x76",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12925,
        "pc": "0x001988",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x08",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13035,
        "pc": "0x001853",
        "port": "0x0009",
        "value": "0x02",
        "a": "0x7F",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13035,
        "pc": "0x001853",
        "port": "0x0009",
        "value": "0x42",
        "a": "0x42",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13137,
        "pc": "0x001872",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13138,
        "pc": "0x001879",
        "port": "0x0009",
        "value": "0x42",
        "a": "0xEE",
        "f": "0x54",
        "flags": {
          "s": false,
          "z": true,
          "h": true,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13138,
        "pc": "0x001879",
        "port": "0x0009",
        "value": "0x52",
        "a": "0x52",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13142,
        "pc": "0x005BB1",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x95",
        "f": "0x40",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13145,
        "pc": "0x005C5E",
        "port": "0x5004",
        "value": "0x11",
        "a": "0x0C",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13145,
        "pc": "0x005C5E",
        "port": "0x5004",
        "value": "0x11",
        "a": "0x11",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13154,
        "pc": "0x005CF1",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0xFF",
        "f": "0x84",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13155,
        "pc": "0x005D0D",
        "port": "0x0009",
        "value": "0x52",
        "a": "0xEE",
        "f": "0x54",
        "flags": {
          "s": false,
          "z": true,
          "h": true,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13155,
        "pc": "0x005D0D",
        "port": "0x0009",
        "value": "0x56",
        "a": "0x56",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      }
    ],
    "lastIoByPort": {
      "0x0003": {
        "type": "read",
        "block": 13154,
        "pc": "0x005CF1",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0xFF",
        "f": "0x84",
        "flags": {
          "s": true,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5016": {
        "type": "read",
        "block": 12510,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5015": {
        "type": "read",
        "block": 12511,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5014": {
        "type": "read",
        "block": 12512,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5004": {
        "type": "write",
        "block": 13145,
        "pc": "0x005C5E",
        "port": "0x5004",
        "value": "0x11",
        "a": "0x11",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5005": {
        "type": "write",
        "block": 11366,
        "pc": "0x048ACC",
        "port": "0x5005",
        "value": "0x00",
        "a": "0x00",
        "f": "0x45",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      "0x0009": {
        "type": "write",
        "block": 13155,
        "pc": "0x005D0D",
        "port": "0x0009",
        "value": "0x56",
        "a": "0x56",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      }
    }
  },
  "firstCleanup": {
    "block": 13139,
    "target": "cleanup0018f8",
    "pc": "0x0018F8",
    "previousPc": "0x001879",
    "routeFields": {
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0,
      "D00080": 0,
      "D0009F": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02A28": 0,
      "D001B8": 0,
      "D001D3": 0,
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 0,
      "D0301B": 0,
      "D02A40": 0,
      "VAT_D02590": 0,
      "VAT_D0259D": 0
    },
    "cpu": {
      "pc": "0x0018F8",
      "sp": "0xD1A87B",
      "ix": "0x000000",
      "iy": "0xD00080",
      "a": "0x52",
      "f": "0x00",
      "af": "0x5200",
      "bc": "0x0000FF",
      "de": "0xD3FF00",
      "hl": "0xD3FEFF",
      "flags": {
        "s": false,
        "z": false,
        "h": false,
        "pv": false,
        "n": false,
        "c": false
      },
      "halted": false,
      "madl": 1,
      "mbase": "0xD0"
    },
    "iyFlags": {
      "IY+00": {
        "addr": "0xD00080",
        "value": "0x00"
      },
      "IY+0D": {
        "addr": "0xD0008D",
        "value": "0x00"
      },
      "IY+1B": {
        "addr": "0xD0009B",
        "value": "0x00"
      },
      "IY+1F": {
        "addr": "0xD0009F",
        "value": "0x00"
      },
      "IY+23": {
        "addr": "0xD000A3",
        "value": "0x00"
      },
      "IY+27": {
        "addr": "0xD000A7",
        "value": "0x00"
      },
      "IY+28": {
        "addr": "0xD000A8",
        "value": "0x00"
      },
      "IY+2C": {
        "addr": "0xD000AC",
        "value": "0x00"
      },
      "IY+42": {
        "addr": "0xD000C2",
        "value": "0x00"
      },
      "IY+44": {
        "addr": "0xD000C4",
        "value": "0x00"
      }
    },
    "bytesAtPc": [
      "0x36",
      "0x00",
      "0xED",
      "0xB0",
      "0xAF",
      "0x32",
      "0xB7",
      "0x77",
      "0xD1",
      "0x3E",
      "0x95",
      "0x32",
      "0x8F",
      "0x05",
      "0xD0",
      "0xCD"
    ],
    "recentBlocks": [
      "0x001C33",
      "0x001C38",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C4A",
      "0x0158D2",
      "0x0158DA",
      "0x0158EC",
      "0x0158EE",
      "0x0158F8",
      "0x001872",
      "0x001879",
      "0x0018F8"
    ],
    "stack24": [
      {
        "offset": 0,
        "addr": "0xD1A87B",
        "value": "0x0013E8"
      },
      {
        "offset": 3,
        "addr": "0xD1A87E",
        "value": "0x000000"
      },
      {
        "offset": 6,
        "addr": "0xD1A881",
        "value": "0x000000"
      },
      {
        "offset": 9,
        "addr": "0xD1A884",
        "value": "0x000000"
      },
      {
        "offset": 12,
        "addr": "0xD1A887",
        "value": "0x000000"
      },
      {
        "offset": 15,
        "addr": "0xD1A88A",
        "value": "0x000000"
      },
      {
        "offset": 18,
        "addr": "0xD1A88D",
        "value": "0x008000"
      },
      {
        "offset": 21,
        "addr": "0xD1A890",
        "value": "0x000000"
      },
      {
        "offset": 24,
        "addr": "0xD1A893",
        "value": "0x000000"
      },
      {
        "offset": 27,
        "addr": "0xD1A896",
        "value": "0x008000"
      },
      {
        "offset": 30,
        "addr": "0xD1A899",
        "value": "0x000000"
      },
      {
        "offset": 33,
        "addr": "0xD1A89C",
        "value": "0x000000"
      }
    ],
    "returnHints": [
      "0x0013E8",
      "0x008000",
      "0x008000"
    ],
    "ioTail": [
      {
        "type": "read",
        "block": 11709,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 11893,
        "pc": "0x006816",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x02",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 11900,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 11901,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 11902,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12082,
        "pc": "0x006816",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x02",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12089,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12090,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12091,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12217,
        "pc": "0x02B03B",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x00",
        "f": "0x12",
        "flags": {
          "s": false,
          "z": false,
          "h": true,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12503,
        "pc": "0x006816",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x02",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12510,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12511,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12512,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 12570,
        "pc": "0x000658",
        "port": "0x0009",
        "value": "0x02",
        "a": "0x02",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12573,
        "pc": "0x00067E",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x05",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12576,
        "pc": "0x0012E3",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x06",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12920,
        "pc": "0x001379",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x76",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 12925,
        "pc": "0x001988",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x08",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13035,
        "pc": "0x001853",
        "port": "0x0009",
        "value": "0x02",
        "a": "0x7F",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13035,
        "pc": "0x001853",
        "port": "0x0009",
        "value": "0x42",
        "a": "0x42",
        "f": "0x00",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13137,
        "pc": "0x001872",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "read",
        "block": 13138,
        "pc": "0x001879",
        "port": "0x0009",
        "value": "0x42",
        "a": "0xEE",
        "f": "0x54",
        "flags": {
          "s": false,
          "z": true,
          "h": true,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      {
        "type": "write",
        "block": 13138,
        "pc": "0x001879",
        "port": "0x0009",
        "value": "0x52",
        "a": "0x52",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      }
    ],
    "lastIoByPort": {
      "0x0003": {
        "type": "read",
        "block": 13137,
        "pc": "0x001872",
        "port": "0x0003",
        "value": "0xEE",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5016": {
        "type": "read",
        "block": 12510,
        "pc": "0x03CF7D",
        "port": "0x5016",
        "value": "0x00",
        "a": "0x00",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5015": {
        "type": "read",
        "block": 12511,
        "pc": "0x03CFA4",
        "port": "0x5015",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      },
      "0x5014": {
        "type": "read",
        "block": 12512,
        "pc": "0x03CFCF",
        "port": "0x5014",
        "value": "0x10",
        "a": "0x00",
        "f": "0x02",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5004": {
        "type": "read",
        "block": 11349,
        "pc": "0x03FAA2",
        "port": "0x5004",
        "value": "0x11",
        "a": "0xCC",
        "f": "0x42",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": false,
          "n": true,
          "c": false
        }
      },
      "0x5005": {
        "type": "write",
        "block": 11366,
        "pc": "0x048ACC",
        "port": "0x5005",
        "value": "0x00",
        "a": "0x00",
        "f": "0x45",
        "flags": {
          "s": false,
          "z": true,
          "h": false,
          "pv": true,
          "n": false,
          "c": true
        }
      },
      "0x0009": {
        "type": "write",
        "block": 13138,
        "pc": "0x001879",
        "port": "0x0009",
        "value": "0x52",
        "a": "0x52",
        "f": "0x04",
        "flags": {
          "s": false,
          "z": false,
          "h": false,
          "pv": true,
          "n": false,
          "c": false
        }
      }
    }
  },
  "direct0061e9Refs": []
}
```

