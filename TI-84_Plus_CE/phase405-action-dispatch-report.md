# Phase 405: Action Code Dispatch Analysis

## Overview

Traced all callers of the 4 action byte reader entry points to determine
how the returned action code (register A) is dispatched.

## Entry Points

| Address | Label | Description | Callers Found |
|---------|-------|-------------|---------------|
| 0x07FDD6 | read_slot0_action | Read slot 0 action byte | 50 |
| 0x07FDD0 | read_slot1_action | Read slot 1 action byte | 9 |
| 0x07FDC9 | test_slot0_bit7 | Test slot 0 bit 7 | 51 |
| 0x07FDC3 | test_slot1_bit7 | Test slot 1 bit 7 | 17 |

## Dispatch Pattern Summary (All 127 Callers)

| Pattern | Count | Description |
|---------|-------|-------------|
| branch_on_flags | 48 | Conditional branch on flags set by the reader (JR cc / RET cc / JP cc) |
| pass_to_sub | 41 | CALL nn — passes action byte to a subroutine |
| other | 20 | Other pattern |
| push_then_use | 6 | PUSH AF then later uses the value |
| overwrite_a | 5 | LD A,n — overwrites A (flags already consumed) |
| bitwise | 4 | AND/OR/XOR — bitwise operation on action byte |
| tail_jump | 2 | JP nn — tail-jump to handler |
| ret_immediate | 1 | RET — passes action byte back to grandparent caller |

## CP Immediate Values (Known Action Codes)

No direct CP n instructions found.

## Top Subroutine/Jump Targets

These are the functions most frequently called with the action byte in A:

| Target Address | Callers | Notes |
|----------------|---------|-------|
| 0x07FA74 | 4 | |
| 0x07FDD0 | 4 | |
| 0x07F954 | 3 | |
| 0x07F8CC | 3 | |
| 0x07F8FA | 3 | |
| 0x07C74F | 3 | |
| 0x07FD4A | 2 | |
| 0x07C77F | 2 | |
| 0x05F627 | 2 | |
| 0x07F8A2 | 1 | |
| 0x05F4BF | 1 | |
| 0x07F8C0 | 1 | |
| 0x07CA48 | 1 | |
| 0x07F6D1 | 1 | |
| 0x0B4768 | 1 | |
| 0x082961 | 1 | |
| 0x0B47B0 | 1 | |
| 0x07F7BD | 1 | |
| 0x08020A | 1 | |
| 0x07C747 | 1 | |

## Per-Entry-Point Detail

### read_slot0_action (0x07FDD6)

Read slot 0 action byte -- 50 callers

| Caller | Pattern | First Instructions |
|--------|---------|--------------------|
| 0x05BC23 | ret_immediate | `RET` |
| 0x05D6B0 | other | `DB 0x21; DB 0xCE; DB 0x7E; DB 0x0A` |
| 0x05D6FC | pass_to_sub | `CALL 0x07F8A2; CALL 0x05F4D7; CALL 0x05F4EF; CALL 0x07C771` |
| 0x05D8FF | pass_to_sub | `CALL 0x07F954; CALL 0x05F569; CALL 0x05F555; CALL 0x05F653` |
| 0x05F3FC | pass_to_sub | `CALL 0x05F4BF; CALL 0x08020A; JR NZ,0x05F42E; CALL 0x07D154` |
| 0x067765 | overwrite_a | `LD A,0xBC; CALL 0x0674AB; CALL 0x07FAAF; POP AF` |
| 0x068B74 | pass_to_sub | `CALL 0x07FA74; JP 0x07F831` |
| 0x06C1BD | pass_to_sub | `CALL 0x07F8CC; DB 0x21; DB 0x67; DB 0x03` |
| 0x06C1D5 | pass_to_sub | `CALL 0x07F8C0; CALL 0x07F831; JP C,0x06C2F8; JR NZ,0x06C22B` |
| 0x06C6B2 | pass_to_sub | `CALL 0x07FA74; JP 0x07F831` |
| 0x07C723 | pass_to_sub | `CALL 0x07FDD0; JR 0x07C77F` |
| 0x07D1A8 | pass_to_sub | `CALL 0x07FDD0; JP 0x07D298` |
| 0x07E277 | bitwise | `AND 0x80; JR Z,0x07E2A1; LD A,(0xD005F9); DB 0x2F` |
| 0x07E67F | bitwise | `AND 0x80; JR Z,0x07E689; LD A,0x03; PUSH AF` |
| 0x07EB4F | push_then_use | `PUSH AF; DB 0x79; LD (0xD00619),A; CALL 0x07FF38` |
| 0x07ED42 | other | `POP AF; LD (0xD00624),A; DB 0x47; JP 0x07EE8F` |
| 0x07EDF2 | other | `DB 0x21; DB 0x05; DB 0x06; RET NC` |
| 0x07EEF2 | bitwise | `AND 0x80; PUSH AF; OR 0x80; DB 0x47` |
| 0x07EF5A | bitwise | `AND 0x80; PUSH AF; LD A,(0xD005F9); JR 0x07EF82` |
| 0x07F54D | pass_to_sub | `CALL 0x07CA48; CALL 0x07C77F; POP AF; LD (0xD005F8),A` |
| 0x07F5DD | pass_to_sub | `CALL 0x07F6D1; DB 0xE1; JR Z,0x07F5F0; POP AF` |
| 0x07F829 | pass_to_sub | `CALL 0x07FDD0; LD A,(0xD005FA); DB 0xB7; DB 0xCC` |
| 0x080520 | pass_to_sub | `CALL 0x07F8CC; LD A,(0xD00630); DB 0xC1; DB 0xB9` |
| 0x08054C | pass_to_sub | `CALL 0x07F8CC; DB 0xC1; POP AF; XOR 0x01` |
| 0x094913 | pass_to_sub | `CALL 0x07FD4A; RET Z; CALL 0x07FF38; JR C,0x094928` |
| 0x095151 | pass_to_sub | `CALL 0x07F8FA; DB 0x21; DB 0xB5; DB 0x51` |
| 0x095230 | pass_to_sub | `CALL 0x0B4768; JP NZ,0x061D0E; CALL 0x07CA06; DB 0x06` |
| 0x095E22 | overwrite_a | `LD A,0x45; LD (0xD005FA),A; LD A,0x0D; CALL 0x09A515` |
| 0x098870 | pass_to_sub | `CALL 0x07F8FA; CALL 0x07CA48; CALL 0x07F8A2; CALL 0x07C74F` |
| 0x09D041 | pass_to_sub | `CALL 0x07F954; DB 0x21; DB 0x2F; DB 0x06` |
| 0x09D6E8 | pass_to_sub | `CALL 0x07F8FA; CALL 0x05F549; CALL 0x07C771; CALL 0x07F8CC` |
| 0x09DABA | overwrite_a | `LD A,0x74; DB 0x21; DB 0x03; DB 0x06` |
| 0x09EB58 | other | `DB 0x40; DB 0x2A; DB 0x49; DB 0x1D` |
| 0x09EB9B | pass_to_sub | `CALL 0x07FD4A; DB 0xE1; JR Z,0x09EBB6; CALL 0x07FA07` |
| 0x0A7715 | pass_to_sub | `CALL 0x07C77F; CALL 0x05F585; CALL 0x07C705; CALL 0x05F63B` |
| 0x0A78BC | pass_to_sub | `CALL 0x07C77F; CALL 0x0A7F4C; JR C,0x0A7920; CALL 0x05F607` |
| 0x0A793E | pass_to_sub | `CALL 0x07C74F; CALL 0x0A7F4C; JP C,0x0A7992; CALL 0x05F607` |
| 0x0A7B0B | pass_to_sub | `CALL 0x05F627; CALL 0x05F507; CALL 0x05F521; CALL 0x07FDD6` |
| 0x0A7B1B | pass_to_sub | `CALL 0x07FDD0; CALL 0x07C711; CALL 0x05F607; CALL 0x0A7FAA` |
| 0x0A7C35 | pass_to_sub | `CALL 0x05F627; CALL 0x07F90E; CALL 0x07F8B6; CALL 0x07C8B7` |
| 0x0A7E12 | other | `LD A,(0xD0061B); DB 0xB7; JR NZ,0x0A7E2A; DB 0x21` |
| 0x0A7F19 | tail_jump | `JP 0x07C74F` |
| 0x0A8021 | pass_to_sub | `CALL 0x07C74F; CALL 0x05F58D; CALL 0x07C711; CALL 0x05F63F` |
| 0x0AFDE6 | pass_to_sub | `CALL 0x07F954; CALL 0x07F968; DB 0xFD; RLC/RRC/etc 3,(HL)` |
| 0x0B01A7 | pass_to_sub | `CALL 0x07FA74; LD A,0x7F; LD (0xD00604),A; POP AF` |
| 0x0B0287 | pass_to_sub | `CALL 0x082961; CALL 0x09EB8A; CALL 0x07FD4A; JP Z,0x061D5E` |
| 0x0B4658 | pass_to_sub | `CALL 0x0B47B0; JP 0x0B47A6` |
| 0x0B466D | pass_to_sub | `CALL 0x07F7BD; JR NZ,0x0B467D; CALL 0x0B4768; JR Z,0x0B4681` |
| 0x0B46B1 | pass_to_sub | `CALL 0x08020A; JR NZ,0x0B46E1; CALL 0x07D154; JR NZ,0x0B46E1` |
| 0x0BD22D | pass_to_sub | `CALL 0x07C747; CALL 0x07FD4A; JR Z,0x0BD255; DB 0x11` |

### read_slot1_action (0x07FDD0)

Read slot 1 action byte -- 9 callers

| Caller | Pattern | First Instructions |
|--------|---------|--------------------|
| 0x07C727 | other | `JR 0x07C77F` |
| 0x07D1AC | tail_jump | `JP 0x07D298` |
| 0x07D476 | other | `DB 0x21; RET M; DB 0x05; RET NC` |
| 0x07F82D | other | `LD A,(0xD005FA); DB 0xB7; DB 0xCC; DB 0xCF` |
| 0x095F4C | pass_to_sub | `CALL 0x095F8C; CALL 0x09AC73; CALL 0x082AF0; CALL 0x07FDD0` |
| 0x095F5C | pass_to_sub | `CALL 0x07CA27; JR 0x095F68` |
| 0x09EB0C | pass_to_sub | `CALL 0x07F8AC; CALL 0x07CAB9; CALL 0x0685DF; CALL 0x09EB8A` |
| 0x09EBAA | pass_to_sub | `CALL 0x07F831; JR NC,0x09EBB6; DB 0xAF; RET` |
| 0x0A7B1F | pass_to_sub | `CALL 0x07C711; CALL 0x05F607; CALL 0x0A7FAA; POP AF` |

### test_slot0_bit7 (0x07FDC9)

Test slot 0 bit 7 -- 51 callers

| Caller | Pattern | First Instructions |
|--------|---------|--------------------|
| 0x059C02 | branch_on_flags | `JP NZ,0x061D0E; DB 0x21; DB 0x24; DB 0x9D` |
| 0x059CFC | branch_on_flags | `JP NZ,0x061D0E; DB 0x21; DB 0x24; DB 0x9D` |
| 0x05AC22 | branch_on_flags | `JR Z,0x05AC30; DB 0xFD; RLC/RRC/etc 4,H; AND 0xCD` |
| 0x05BE87 | branch_on_flags | `JP NZ,0x061D0E; CALL 0x08290E; JP 0x07F7F2` |
| 0x05D638 | branch_on_flags | `JP NZ,0x061D4E; CALL 0x07FD4A; JP Z,0x061D4E; DB 0x21` |
| 0x05D8EF | branch_on_flags | `JR NZ,0x05D8FF; LD A,(0xD0062F); XOR 0x80; LD (0xD0062F),A` |
| 0x05F2D6 | branch_on_flags | `JP Z,0x05F471; LD A,0x1A; CALL 0x05F4AD; JP C,0x05F47B` |
| 0x0671D9 | branch_on_flags | `JP NZ,0x061D5E; CALL 0x07FD69; JR Z,0x0671EB; DB 0xFD` |
| 0x067760 | push_then_use | `PUSH AF; CALL 0x07FDD6; LD A,0xBC; CALL 0x0674AB` |
| 0x0679A0 | branch_on_flags | `JP Z,0x07FAC2; LD A,0x04; CALL 0x07F166; JP 0x067BB6` |
| 0x068A98 | branch_on_flags | `JP Z,0x082902; CALL 0x082AC2; CALL 0x07C75B; CALL 0x07F8FA` |
| 0x0690B7 | other | `DB 0x47; CALL 0x07FD50; DB 0x78; JR Z,0x0690CB` |
| 0x0690EA | other | `DB 0x4F; CALL 0x07FDC3; DB 0x81; DB 0x80` |
| 0x069F05 | branch_on_flags | `JR NZ,0x069F3F; CALL 0x07FD4A; JP Z,0x07FA46; CALL 0x07F8CC` |
| 0x069F23 | branch_on_flags | `JR NZ,0x069F3F; CALL 0x07F8FA; CALL 0x07F920; CALL 0x07C8B7` |
| 0x06DD90 | branch_on_flags | `JP NZ,0x061D52; CALL 0x06FC03; CALL 0x06DB4E; DB 0xFD` |
| 0x06EEB3 | branch_on_flags | `JP NZ,0x061D52; DB 0xE1; CALL 0x0AF8C4; CALL 0x07CAB9` |
| 0x07CC93 | branch_on_flags | `JR Z,0x07CCA7; SET 4,(HL); JR 0x07CCA7` |
| 0x07CCE6 | branch_on_flags | `JR Z,0x07CCF4; SET 5,(HL); JR 0x07CCF4` |
| 0x07D882 | branch_on_flags | `JP NZ,0x07CAA0; RET` |
| 0x07D8A3 | other | `DB 0xC4; DB 0x98; RET M; DB 0x07` |
| 0x07E024 | branch_on_flags | `JR Z,0x07E04A; CALL 0x07FAA7; DB 0xFD; RLC/RRC/etc 1,(HL)` |
| 0x07E053 | other | `DB 0x0E; DB 0x02; JR Z,0x07E077; JP 0x061D0E` |
| 0x07E05F | branch_on_flags | `JR Z,0x07E057; CALL 0x07FAA7; JP 0x05BCF6` |
| 0x07E07F | branch_on_flags | `JR Z,0x07E08E; CALL 0x07FAA7; CALL 0x05BD2A; RET` |
| 0x07E0AD | branch_on_flags | `JR NZ,0x07E0FD; CALL 0x07F8CC; CALL 0x07FA68; CALL 0x07C77F` |
| 0x07E201 | branch_on_flags | `JP NZ,0x07FAC2; JP 0x061D02` |
| 0x07ECC5 | branch_on_flags | `JR Z,0x07ECCF; DB 0x7A; DB 0xC6; DB 0x0C` |
| 0x080173 | branch_on_flags | `RET Z; JP 0x061D0E` |
| 0x0939C5 | branch_on_flags | `JR Z,0x0939D3; CALL 0x082912; JP 0x07FAC2` |
| 0x093A8C | pass_to_sub | `CALL 0x07FA74; CALL 0x07F831; JP C,0x07FAC2; CALL 0x07C72D` |
| 0x093CB9 | branch_on_flags | `JR Z,0x093CC7; CALL 0x07FAC2; JP 0x082912` |
| 0x093F9F | push_then_use | `PUSH AF; CALL 0x07F920; POP AF; DB 0xC4` |
| 0x093FD0 | branch_on_flags | `JP NZ,0x07FA46; LD A,(0xD005F9); CP 0xE3; JP NC,0x07FAC2` |
| 0x0941F3 | branch_on_flags | `JR NZ,0x09421E; CALL 0x07FD4A; JR NZ,0x094226; CALL 0x082902` |
| 0x09521E | branch_on_flags | `JR NZ,0x095230; CALL 0x0B4768; JP NZ,0x061D0E; DB 0x06` |
| 0x09524D | branch_on_flags | `JP NZ,0x061D0E; CALL 0x0B4768; JP NZ,0x061D0E; OR 0x01` |
| 0x09665B | branch_on_flags | `JP Z,0x061D0E; CALL 0x082AE4; CALL 0x094295; CALL 0x082AF6` |
| 0x096687 | branch_on_flags | `JP Z,0x061D0E; CALL 0x096735; CALL 0x082961; CALL 0x09671C` |
| 0x0967CF | branch_on_flags | `JP NZ,0x07FAC2; CALL 0x07CBB3; CALL 0x082ADE; CALL 0x07F831` |
| 0x0989BA | branch_on_flags | `JR Z,0x0989D4; DB 0x21; DB 0x21; DB 0x06` |
| 0x098C61 | overwrite_a | `LD A,0x1A; DB 0xC4; DB 0xD7; DB 0x94` |
| 0x0A78AA | branch_on_flags | `JR Z,0x0A78B8; CALL 0x07FF38; DB 0xD4; DB 0xA9` |
| 0x0A792C | branch_on_flags | `JR NZ,0x0A793A; CALL 0x07FF38; DB 0xD4; DB 0xA9` |
| 0x0A7A31 | other | `DB 0x47; CALL 0x07FDC3; DB 0xA8; JR NZ,0x0A7A9C` |
| 0x0A7B71 | push_then_use | `PUSH AF; CALL 0x0A7F32; POP AF; DB 0xC4` |
| 0x0A7BE7 | branch_on_flags | `JR Z,0x0A7BFB; CALL 0x07CA06; LD A,(0xD0062F); XOR 0x80` |
| 0x0AFD70 | branch_on_flags | `JR Z,0x0AFDEA; CALL 0x0829C2; LD A,(0xD00604); CP 0x75` |
| 0x0B0349 | branch_on_flags | `JP NZ,0x061D5E; CALL 0x082ABC; CALL 0x07C77F; CALL 0x082B14` |
| 0x0B4604 | branch_on_flags | `JR Z,0x0B461C; LD A,0xD3; LD (0xD008D5),A; LD A,0x1A` |
| 0x0BD2B9 | branch_on_flags | `RET Z; JP 0x07C71D` |

### test_slot1_bit7 (0x07FDC3)

Test slot 1 bit 7 -- 17 callers

| Caller | Pattern | First Instructions |
|--------|---------|--------------------|
| 0x066B4A | branch_on_flags | `JR NZ,0x066B91; DB 0x21; DB 0x04; DB 0x06` |
| 0x0688D1 | other | `DB 0x37; PUSH AF; CALL 0x082ADE; CALL 0x07F831` |
| 0x068B39 | push_then_use | `PUSH AF; CALL 0x07C75B; POP AF; RET Z` |
| 0x0690B1 | other | `JR 0x0690CB` |
| 0x0690C3 | other | `DB 0x80; JR NZ,0x0690F7; DB 0x78; DB 0x21` |
| 0x0690EF | other | `DB 0x81; DB 0x80; JR Z,0x0690E6; DB 0x21` |
| 0x07D4AA | branch_on_flags | `JR NZ,0x07D4C6; DB 0x21; DB 0x04; DB 0x06` |
| 0x07D85C | branch_on_flags | `JR NZ,0x07D872; CALL 0x07F95E; CALL 0x07F8AC; DB 0x21` |
| 0x07ECCF | branch_on_flags | `JR Z,0x07ECD9; DB 0x7A; XOR 0x04; DB 0x57` |
| 0x093B3A | branch_on_flags | `JR NZ,0x093B32; CALL 0x07C75B; CALL 0x082B73; CALL 0x093864` |
| 0x093FB2 | branch_on_flags | `JP NZ,0x07FAC2; CALL 0x082961; CALL 0x07F968; CALL 0x07C72D` |
| 0x094F37 | other | `DB 0xC4; DB 0xAC; LD A,(0x223E09); CALL 0x09A3BD` |
| 0x09519F | other | `DB 0xC4; DB 0xAC; LD A,(0xC5C909); CALL 0x07FA07` |
| 0x098D38 | overwrite_a | `LD A,0x2B; JR Z,0x098D42; LD A,0x2D; RET` |
| 0x0A3A4D | push_then_use | `PUSH AF; CALL 0x082957; LD A,0x70; CALL 0x06635A` |
| 0x0A7A36 | other | `DB 0xA8; JR NZ,0x0A7A9C; CALL 0x07F829; JR C,0x0A7A7D` |
| 0x0AFD59 | branch_on_flags | `RET Z; JP 0x061D0E` |


## Key Findings

- Total callers across all 4 entry points: 127
- Most common dispatch pattern: branch_on_flags
- Callers that pass action byte to subroutines: 43
- Unique subroutine targets: 26
