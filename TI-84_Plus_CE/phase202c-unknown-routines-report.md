# Phase 202c: Unknown Routine Classification

Generated: 2026-04-20T02:44:26.405Z

Source: `phase202c-routine-map-report.md` (79 routines labeled **unknown**).

## Classification heuristics (first-match wins)

1. `bcall-trampoline` — ≤6 instructions, ends in `jp (hl)`, `jp (ix)`, or `jp (iy)`.
2. `math-helper` — touches an address in `0xD02400..0xD02BFF` (FPU / OP registers).
3. `ram-copy` — contains `LDIR`, `LDDR`, `LDI`, or `LDD`.
4. `port-io` — contains any `IN` or `OUT` instruction.
5. `graph-flag-toggle` — touches an address in `0xD17700..0xD177FF`.
6. `display-helper` — touches `0xD00600..0xD006FF` or `0xD40000..0xD5FFFF`.
7. `still-unknown` — none of the above.

## Counts

| Classification | Count |
|----------------|-------|
| bcall-trampoline | 0 |
| math-helper | 0 |
| ram-copy | 0 |
| port-io | 33 |
| graph-flag-toggle | 4 |
| display-helper | 0 |
| still-unknown | 42 |
| **total** | **79** |

## Per-routine classification

| PC | Classification | First ≤6 instructions |
|----|----------------|-----------------------|
| 0x040d11 | still-unknown | `ld hl, 0x000049; bit 0, (iy+66); jr z, 0x040d1f; ld hl, 0x0000f1; bit 1, (iy+65); jr z, 0x040d29` |
| 0x040d1f | still-unknown | `bit 1, (iy+65); jr z, 0x040d29; ld hl, 0x0001e1; push af; ld a, i; push af` |
| 0x040d29 | still-unknown | `push af; ld a, i; push af; di; ld hl, (0xd00591); ld a, 0x00` |
| 0x040d3d | still-unknown | `ei; pop af; ret; ei; halt; push hl` |
| 0x040fc1 | port-io | `ld a, c; cp 0x10; jr nz, 0x040fc0; ld hl, (ix+6); call 0x000138; jr z, 0x040ff9` |
| 0x040fc6 | port-io | `ld hl, (ix+6); call 0x000138; jr z, 0x040ff9; ld bc, (ix+6); push bc; call 0x0004fc` |
| 0x040fcd | port-io | `jr z, 0x040ff9; ld bc, (ix+6); push bc; call 0x0004fc; pop bc; sis ld bc, 0x003010` |
| 0x040ff9 | still-unknown | `ld a, 0x01; ld sp, ix; pop ix; ret; call 0x000130; ld hl, (ix+6)` |
| 0x0419f1 | port-io | `ld hl, 0xfffffd; call 0x00012c; sis ld bc, 0x003015; in a, (c); or a; sbc hl, hl` |
| 0x0419f9 | port-io | `sis ld bc, 0x003015; in a, (c); or a; sbc hl, hl; ld l, a; ld a, 0x08` |
| 0x041a09 | port-io | `sis ld bc, 0x003014; in a, (c); push hl; pop de; or a; sbc hl, hl` |
| 0x041a1d | port-io | `ld (ix-3), hl; ld bc, (ix-3); push bc; call 0x04b664; pop bc; xor a` |
| 0x041a48 | port-io | `ld a, c; cp 0x81; jr nz, 0x041a47; ld bc, 0x003081; in a, (c); set 2, a` |
| 0x041a5d | port-io | `ld a, c; cp 0x81; jr nz, 0x041a5c; ld bc, 0x003081; in a, (c); set 1, a` |
| 0x041a72 | port-io | `ld a, c; cp 0x81; jr nz, 0x041a71; sis ld bc, 0x003082; in a, (c); and 0x20` |
| 0x041a77 | port-io | `sis ld bc, 0x003082; in a, (c); and 0x20; or a; sbc hl, hl; ld l, a` |
| 0x041ab1 | port-io | `ld a, c; cp 0x3c; jr nz, 0x041ab0; ld bc, 0x00313c; in a, (c); set 2, a` |
| 0x041ac6 | still-unknown | `ld a, c; cp 0x3c; jr nz, 0x041ac5; ld bc, 0x004140; push bc; call 0x05206e` |
| 0x041acb | still-unknown | `ld bc, 0x004140; push bc; call 0x05206e; pop bc; or a; jr z, 0x041ade` |
| 0x041ade | port-io | `call 0x02af88; ld bc, 0x001f30; push bc; call 0x04b6db; pop bc; ld bc, 0x000f21` |
| 0x048ac4 | port-io | `ld hl, 0xfffffc; call 0x00012c; ld (ix-1), 0x00; ld bc, 0x005005; in a, (c); res 5, a` |
| 0x048acc | port-io | `ld (ix-1), 0x00; ld bc, 0x005005; in a, (c); res 5, a; out (c), a; ld a, b` |
| 0x048ae0 | graph-flag-toggle | `ld a, c; cp 0x05; jr nz, 0x048adf; call 0x03f26d; and 0x10; jr z, 0x048b07` |
| 0x048b3c | still-unknown | `pop bc; or a; jr z, 0x048b5b; call 0x0003e4; or a; jr z, 0x048b51` |
| 0x048b5b | still-unknown | `ld bc, 0x000448; push bc; ld bc, 0xd13fd8; push bc; call 0x0000b0; pop bc` |
| 0x048b69 | still-unknown | `pop bc; pop bc; ld bc, (ix-4); ld (0xd1441d), bc; ld bc, 0x000060; push bc` |
| 0x048b81 | still-unknown | `pop bc; pop bc; ld bc, 0x003288; push bc; ld bc, 0xd14420; push bc` |
| 0x048bfb | still-unknown | `pop bc; ld bc, 0x000000; push bc; ld bc, 0x000001; push bc; call 0x049cca` |
| 0x048c5d | still-unknown | `pop bc; ld a, i; push af; di; ld bc, 0x004304; push bc` |
| 0x048c6b | still-unknown | `pop bc; ld bc, 0x004102; push bc; call 0x05202f; pop bc; ld bc, 0x001b02` |
| 0x048c75 | still-unknown | `pop bc; ld bc, 0x001b02; push bc; call 0x05202f; pop bc; ld bc, 0x001b20` |
| 0x048c7f | still-unknown | `pop bc; ld bc, 0x001b20; push bc; call 0x05202f; pop bc; ld bc, 0x004180` |
| 0x048c89 | still-unknown | `pop bc; ld bc, 0x004180; push bc; call 0x05202f; pop bc; ld bc, 0x001b04` |
| 0x048c93 | still-unknown | `pop bc; ld bc, 0x001b04; push bc; call 0x05202f; pop bc; ld bc, 0x004110` |
| 0x048c9d | still-unknown | `pop bc; ld bc, 0x004110; push bc; call 0x05202f; pop bc; ld bc, 0x004101` |
| 0x048ca7 | still-unknown | `pop bc; ld bc, 0x004101; push bc; call 0x05202f; pop bc; ld bc, 0x004104` |
| 0x048cb1 | still-unknown | `pop bc; ld bc, 0x004104; push bc; call 0x05202f; pop bc; ld bc, 0x004120` |
| 0x048cbb | still-unknown | `pop bc; ld bc, 0x004120; push bc; call 0x05202f; pop bc; ld bc, 0x004320` |
| 0x048cc5 | still-unknown | `pop bc; ld bc, 0x004320; push bc; call 0x05202f; pop bc; ld bc, 0x004310` |
| 0x048ccf | still-unknown | `pop bc; ld bc, 0x004310; push bc; call 0x05202f; pop bc; ld bc, 0x004301` |
| 0x048cd9 | still-unknown | `pop bc; ld bc, 0x004301; push bc; call 0x05202f; pop bc; ld bc, 0x004308` |
| 0x048ce3 | port-io | `pop bc; ld bc, 0x004308; push bc; call 0x05202f; pop bc; call 0x04ca7b` |
| 0x048d15 | port-io | `ld a, c; cp 0x00; jr nz, 0x048d14; ld bc, 0x003100; in a, (c); set 4, a` |
| 0x048d2a | port-io | `ld a, c; cp 0x00; jr nz, 0x048d29; ld bc, 0x003010; in a, (c); res 4, a` |
| 0x048d3f | port-io | `ld a, c; cp 0x10; jr nz, 0x048d3e; ld bc, 0x003010; in a, (c); res 5, a` |
| 0x048d54 | port-io | `ld a, c; cp 0x10; jr nz, 0x048d53; ld bc, 0x003010; in a, (c); res 0, a` |
| 0x048d69 | port-io | `ld a, c; cp 0x10; jr nz, 0x048d68; ld bc, 0x000000; push bc; call 0x040fad` |
| 0x048d8c | port-io | `ld a, c; cp 0xc4; jr nz, 0x048d8b; ld bc, 0x00500d; in a, (c); res 5, a` |
| 0x048d91 | port-io | `ld bc, 0x00500d; in a, (c); res 5, a; out (c), a; ld a, b; cp 0x50` |
| 0x048da1 | port-io | `ld a, c; cp 0x0d; jr nz, 0x048da0; ld bc, 0x005011; in a, (c); res 5, a` |
| 0x048da6 | port-io | `ld bc, 0x005011; in a, (c); res 5, a; out (c), a; ld a, b; cp 0x50` |
| 0x048db6 | port-io | `ld a, c; cp 0x11; jr nz, 0x048db5; ld bc, 0x005009; ld a, 0x20; out (c), a` |
| 0x048dbb | port-io | `ld bc, 0x005009; ld a, 0x20; out (c), a; ld a, b; cp 0x50; jr z, 0x048dc9` |
| 0x048de4 | still-unknown | `ld a, c; cp 0x3d; jr nz, 0x048de3; call 0x03f26d; cp 0x10; jr nz, 0x048dfc` |
| 0x048de9 | port-io | `call 0x03f26d; cp 0x10; jr nz, 0x048dfc; call 0x0003e8; or a; jr nz, 0x048dfc` |
| 0x048ded | port-io | `cp 0x10; jr nz, 0x048dfc; call 0x0003e8; or a; jr nz, 0x048dfc; call 0x04986b` |
| 0x049a23 | graph-flag-toggle | `ld hl, 0xffffff; call 0x00012c; ld (ix-1), 0x01; ld a, (ix+6); or a; jr nz, 0x049a3a` |
| 0x049a2b | graph-flag-toggle | `ld (ix-1), 0x01; ld a, (ix+6); or a; jr nz, 0x049a3a; xor a; jp 0x049cc5` |
| 0x049aa7 | still-unknown | `ld a, (ix+6); or a; sbc hl, hl; ld l, a; call 0x000210; dec b` |
| 0x049ac9 | still-unknown | `ld (ix-1), 0x00; jp 0x049cc2; ld a, (ix+6); or a; sbc hl, hl; ld l, a` |
| 0x049cc2 | still-unknown | `ld a, (ix-1); ld sp, ix; pop ix; ret; ld hl, 0xffffff; call 0x00012c` |
| 0x049cca | graph-flag-toggle | `ld hl, 0xffffff; call 0x00012c; ld (ix-1), 0x00; ld a, i; push af; di` |
| 0x049d11 | still-unknown | `ld a, (ix-1); or a; jp nz, 0x049df9; ld c, (ix+6); ld b, 0x00; push bc` |
| 0x049d19 | still-unknown | `ld c, (ix+6); ld b, 0x00; push bc; call 0x049a23; pop bc; ld (ix-1), a` |
| 0x049d23 | still-unknown | `pop bc; ld (ix-1), a; ld a, (ix-1); or a; jp nz, 0x049df9; ld a, (ix+9)` |
| 0x049d2f | still-unknown | `ld a, (ix+9); or a; sbc hl, hl; ld l, a; call 0x000124; ld c, 0x00` |
| 0x049dfe | still-unknown | `ei; ld a, (ix-1); ld sp, ix; pop ix; ret; ld hl, 0xffffff` |
| 0x049ffa | port-io | `sis ld bc, 0x0031cb; in a, (c); res 7, a; out (c), a; ld a, b; cp 0x31` |
| 0x04a00a | port-io | `ld a, c; cp 0xcb; jr nz, 0x04a009; sis ld bc, 0x003040; in a, (c); res 6, a` |
| 0x04a00f | port-io | `sis ld bc, 0x003040; in a, (c); res 6, a; out (c), a; ld a, b; cp 0x30` |
| 0x04a01f | still-unknown | `ld a, c; cp 0x40; jr nz, 0x04a01e; ret; push ix; ld iy, 0xd00080` |
| 0x04a024 | still-unknown | `ret; push ix; ld iy, 0xd00080; call 0x0278d9; pop ix; ret` |
| 0x04b664 | port-io | `push ix; ld ix, 0x000000; add ix, sp; ld hl, (ix+6); ld bc, 0x003014; out (c), l` |
| 0x04b67f | still-unknown | `ld a, c; cp 0x15; jr nz, 0x04b67e; pop ix; ret; push ix` |
| 0x04b684 | still-unknown | `pop ix; ret; push ix; ld ix, 0x000000; add ix, sp; ld a, (ix+6)` |
| 0x04c973 (= CpHLDE) | still-unknown | `push hl; or a; sbc hl, de; pop hl; ret; push hl` |
| 0x04e07b | still-unknown | `call 0x000130; ld a, i; push af; di; ld bc, 0x000062; push bc` |
| 0x04e07f | still-unknown | `ld a, i; push af; di; ld bc, 0x000062; push bc; ld bc, 0xd176a8` |
| 0x04e0d6 | still-unknown | `ei; ld sp, ix; pop ix; ret; ld b, e; ld b, c` |
