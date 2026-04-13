# Phase 80-3 — Callers of 0x05e4xx text-rendering family

## Per-target caller scan


### Callers of 0x05e242 (26 total)

| caller | dasm | region |
|--------|------|--------|
| 0x025a48 | `ld e, (hl) ; ld (bc), a ; call 0x05e242` | EXTERNAL |
| 0x0259af | `res 4, (iy+5) ; call 0x05e242` | EXTERNAL |
| 0x05e448 | `res 4, (iy+5) ; push bc ; push de ; push hl ; call 0x05e242` | internal |
| 0x09cb08 | `call 0x05e242` | EXTERNAL |
| 0x05e7cd | `call 0x05e242` | internal |
| 0x02592f | `res 4, (iy+5) ; call 0x05e242` | EXTERNAL |
| 0x025a2e | `call 0x05e242` | EXTERNAL |
| 0x025a4a | `call 0x05e242` | EXTERNAL |
| 0x04eb71 | `call 0x05e242` | EXTERNAL |
| 0x0970f6 | `res 4, (iy+5) ; call 0x05e242` | EXTERNAL |
| 0x0b50cc | `res 4, (iy+5) ; call 0x05e242` | EXTERNAL |
| 0x091bfe | `call 0x05e242` | EXTERNAL |
| 0x090dca | `push af ; call 0x05e242` | EXTERNAL |
| 0x090dc6 | `set 0, (iy+35) ; push af ; call 0x05e242` | EXTERNAL |
| 0x0971de | `res 4, (iy+5) ; call 0x05e242` | EXTERNAL |
| 0x0a1d46 | `call 0x05e242` | EXTERNAL |
| 0x090d97 | `push de ; call 0x05e242` | EXTERNAL |
| 0x097183 | `call 0x05e242` | EXTERNAL |
| 0x091105 | `call 0x05e242` | EXTERNAL |
| 0x05e44c | `push bc ; push de ; push hl ; call 0x05e242` | internal |

(showing first 20 of 26)

### Callers of 0x05e402 (7 total)

| caller | dasm | region |
|--------|------|--------|
| 0x09cbbc | `call 0x05e402` | EXTERNAL |
| 0x0589a9 | `call 0x05e402` | EXTERNAL |
| 0x09cd0f | `call 0x05e402` | EXTERNAL |
| 0x06077b | `call 0x05e402` | EXTERNAL |
| 0x09cb6f | `call 0x05e402` | EXTERNAL |
| 0x09cb87 | `xor a ; ld (0xd00c7e), a ; call 0x05e402` | EXTERNAL |
| 0x09cbb7 | `xor a ; ld (0xd00c7e), a ; call 0x05e402` | EXTERNAL |

### Callers of 0x05e448 (18 total)

| caller | dasm | region |
|--------|------|--------|
| 0x0589dd | `add hl, bc ; call 0x05e448` | EXTERNAL |
| 0x05e8ba | `call 0x05e448` | internal |
| 0x0265ae | `call 0x05e448` | EXTERNAL |
| 0x09cceb | `call 0x05e448` | EXTERNAL |
| 0x05e522 | `res 6, (iy+76) ; xor a ; push af ; res 2, (iy+5) ; ld de, (0xd02437) ; ld bc, (0xd00595) ; inc b ; call 0x05e448` | internal |
| 0x02616d | `xor a ; push af ; res 2, (iy+5) ; ld de, (0xd02437) ; ld bc, (0x0008d2) ; pop af ; ld a, (0xd008d5) ; push af ; call 0x05e448` | EXTERNAL |
| 0x0589de | `call 0x05e448` | EXTERNAL |
| 0x09c9e8 | `call 0x05e448` | EXTERNAL |
| 0x09cd2a | `call 0x05e448` | EXTERNAL |
| 0x0265f7 | `call 0x05e448` | EXTERNAL |
| 0x09cbab | `call 0x05e448` | EXTERNAL |
| 0x06051b | `call 0x05e448` | EXTERNAL |
| 0x026182 | `push af ; call 0x05e448` | EXTERNAL |
| 0x05e415 | `call 0x05e448` | internal |
| 0x05e90f | `call 0x05e448` | internal |
| 0x05e537 | `call 0x05e448` | internal |
| 0x060794 | `call 0x05e448` | EXTERNAL |
| 0x080f1a | `call 0x05e448` | EXTERNAL |

### Callers of 0x05e7cd (7 total)

| caller | dasm | region |
|--------|------|--------|
| 0x09cd5a | `call 0x05e7cd` | EXTERNAL |
| 0x09c7c0 | `call 0x05e7cd` | EXTERNAL |
| 0x0ad33e | `call 0x05e7cd` | EXTERNAL |
| 0x058a78 | `push af ; call z, 0x05e7cd` | EXTERNAL |
| 0x058a4c | `call 0x05e7cd` | EXTERNAL |
| 0x09cd56 | `res 2, (iy+5) ; call 0x05e7cd` | EXTERNAL |
| 0x09d2a5 | `call 0x05e7cd` | EXTERNAL |

### Callers of 0x05e7a4 (0 total)

_no callers_

### Callers of 0x05e381 (10 total)

| caller | dasm | region |
|--------|------|--------|
| 0x0a2c6c | `ld a, (0xd00596) ; push af ; ld hl, (0xd0243d) ; call 0x05e381` | EXTERNAL |
| 0x05e792 | `ld hl, (0xd00595) ; push hl ; ld hl, (0xd0243d) ; ld a, (0xd0008d) ; push af ; res 2, (iy+13) ; call 0x05e381` | internal |
| 0x0262c0 | `ld a, (0xd001a8) ; push af ; ld a, (0xd008d5) ; push af ; ld hl, (0x0008d2) ; push hl ; ld hl, (0xd0243d) ; ld a, (0xd0008d) ; push af ; res` | EXTERNAL |
| 0x0a2cc3 | `push af ; ld hl, (0xd0243d) ; call 0x05e381` | EXTERNAL |
| 0x025df2 | `ld hl, (0x0008d2) ; push hl ; ld hl, (0xd0243d) ; call 0x05e381` | EXTERNAL |
| 0x05e7a4 | `call 0x05e381` | internal |
| 0x0a2c75 | `call 0x05e381` | EXTERNAL |
| 0x0262dc | `call 0x05e381` | EXTERNAL |
| 0x0a2cc8 | `call 0x05e381` | EXTERNAL |
| 0x025dfb | `call 0x05e381` | EXTERNAL |

### Callers of 0x05e3e8 (24 total)

| caller | dasm | region |
|--------|------|--------|
| 0x04eb7e | `call 0x05e3e8` | EXTERNAL |
| 0x05e242 | `call 0x05e3e8` | internal |
| 0x02668f | `call 0x05e3e8` | EXTERNAL |
| 0x05e402 | `res 2, (iy+5) ; call 0x05e3e8` | internal |
| 0x058828 | `call 0x05e3e8` | EXTERNAL |
| 0x09cba6 | `call 0x05e3e8` | EXTERNAL |
| 0x060515 | `call 0x05e3e8` | EXTERNAL |
| 0x0a5be2 | `call 0x05e3e8` | EXTERNAL |
| 0x0607e5 | `dec h ; nop ; ld b, 0xcd ; ld hl, (0x2e0608) ; ld bc, 0x1105c3 ; ld b, 0xcd ; ld (0x20060e), a ; ld b, 0xcd ; ld h, 0x08 ; ld b, 0x18 ; inc ` | EXTERNAL |
| 0x0792b5 | `call 0x05e3e8` | EXTERNAL |
| 0x02593d | `res 2, (iy+5) ; call 0x05e3e8` | EXTERNAL |
| 0x06057f | `call 0x05e3e8` | EXTERNAL |
| 0x04eb76 | `res 4, (iy+5) ; res 2, (iy+5) ; call 0x05e3e8` | EXTERNAL |
| 0x058839 | `call 0x05e3e8` | EXTERNAL |
| 0x05e419 | `call 0x05e3e8` | internal |
| 0x097106 | `res 2, (iy+5) ; call 0x05e3e8` | EXTERNAL |
| 0x090fe3 | `call 0x05e3e8` | EXTERNAL |
| 0x025b5c | `call 0x05e3e8` | EXTERNAL |
| 0x0607fe | `call 0x05e3e8` | EXTERNAL |
| 0x090af4 | `call 0x05e3e8` | EXTERNAL |

(showing first 20 of 24)

### Callers of 0x05e7e3 (9 total)

| caller | dasm | region |
|--------|------|--------|
| 0x05e49d | `res 2, (iy+5) ; set 6, (iy+42) ; call 0x05e7e3` | internal |
| 0x05e7aa | `inc hl ; push hl ; call 0x05e7e3` | internal |
| 0x05e7dd | `call 0x05e7e3` | internal |
| 0x09c98c | `push de ; call 0x05e7e3` | EXTERNAL |
| 0x05e604 | `pop hl ; push bc ; push hl ; call 0x05e7e3` | internal |
| 0x05e603 | `inc bc ; pop hl ; push bc ; push hl ; call 0x05e7e3` | internal |
| 0x0ade6f | `ld de, (0x0005f9) ; ld a, e ; ld e, d ; ld d, a ; call 0x05e7e3` | EXTERNAL |
| 0x0b3f26 | `call 0x05e7e3` | EXTERNAL |
| 0x0b3ef8 | `call 0x05e7e3` | EXTERNAL |

### Callers of 0x05e27e (23 total)

| caller | dasm | region |
|--------|------|--------|
| 0x025a28 | `call 0x05e27e` | EXTERNAL |
| 0x09cb1a | `call 0x05e27e` | EXTERNAL |
| 0x05e490 | `res 4, (iy+5) ; push bc ; push de ; push hl ; call 0x05e27e` | internal |
| 0x09ca7e | `call 0x05e27e` | EXTERNAL |
| 0x05e7d8 | `call 0x05e27e` | internal |
| 0x022ea2 | `call 0x05e27e` | EXTERNAL |
| 0x0259d5 | `ld c, b ; ld b, 0x00 ; ld hl, (0x0008d2) ; add hl, bc ; push hl ; call 0x05e27e` | EXTERNAL |
| 0x025a14 | `pop af ; ld hl, (0x0001aa) ; ld de, (0x0001b8) ; ld d, 0x00 ; or a ; sbc hl, de ; ld (0x0008d2), hl ; call 0x05e27e` | EXTERNAL |
| 0x025a32 | `push de ; call 0x05e27e` | EXTERNAL |
| 0x09c986 | `call 0x05e27e` | EXTERNAL |
| 0x097390 | `call 0x05e27e` | EXTERNAL |
| 0x05e5ef | `push hl ; push bc ; call 0x05e27e` | internal |
| 0x091c1c | `call 0x05e27e` | EXTERNAL |
| 0x090c60 | `call 0x05e27e` | EXTERNAL |
| 0x090c54 | `call 0x05e27e` | EXTERNAL |
| 0x090c58 | `call 0x05e27e` | EXTERNAL |
| 0x09759f | `call 0x05e27e` | EXTERNAL |
| 0x09715b | `ld hl, 0xd00596 ; add a, (hl) ; push af ; call 0x05e27e` | EXTERNAL |
| 0x090c04 | `call 0x05e27e` | EXTERNAL |
| 0x097177 | `ld a, 0x18 ; ld (0xd00596), a ; call 0x05e27e` | EXTERNAL |

(showing first 20 of 23)

### Callers of 0x05e490 (10 total)

| caller | dasm | region |
|--------|------|--------|
| 0x0261d7 | `xor a ; push af ; res 2, (iy+5) ; ld de, (0xd02440) ; ld bc, (0x0008d2) ; push af ; call 0x05e490` | EXTERNAL |
| 0x05e8c7 | `call 0x05e490` | internal |
| 0x06a16a | `call 0x05e490` | EXTERNAL |
| 0x06a169 | `dec bc ; call 0x05e490` | EXTERNAL |
| 0x05e580 | `res 6, (iy+76) ; xor a ; push af ; res 2, (iy+5) ; ld de, (0xd02440) ; ld bc, (0xd00595) ; call 0x05e490` | internal |
| 0x09ccf4 | `call 0x05e490` | EXTERNAL |
| 0x0261e7 | `push af ; call 0x05e490` | EXTERNAL |
| 0x05e438 | `call 0x05e490` | internal |
| 0x06055f | `call 0x05e490` | EXTERNAL |
| 0x05e594 | `call 0x05e490` | internal |

## External callers (outside 0x05e000-0x05f000) — top-level screen candidates

Total unique external callers: **96**

| caller | dasm preview (first 3 insts) | context — previous block ended |
|--------|------------------------------|--------------------------------|
| 0x022ea2 | `call 0x05e27e` | - |
| 0x02592f | `res 4, (iy+5) ; call 0x05e242` | - |
| 0x02593d | `res 2, (iy+5) ; call 0x05e3e8` | - |
| 0x0259af | `res 4, (iy+5) ; call 0x05e242` | - |
| 0x0259d5 | `ld c, b ; ld b, 0x00 ; ld hl, (0x0008d2)` | - |
| 0x025a14 | `pop af ; ld hl, (0x0001aa) ; ld de, (0x0001b8)` | - |
| 0x025a28 | `call 0x05e27e` | - |
| 0x025a2e | `call 0x05e242` | - |
| 0x025a32 | `push de ; call 0x05e27e` | - |
| 0x025a48 | `ld e, (hl) ; ld (bc), a ; call 0x05e242` | - |
| 0x025a4a | `call 0x05e242` | - |
| 0x025b5c | `call 0x05e3e8` | - |
| 0x025df2 | `ld hl, (0x0008d2) ; push hl ; ld hl, (0xd0243d)` | - |
| 0x025dfb | `call 0x05e381` | - |
| 0x02616d | `xor a ; push af ; res 2, (iy+5)` | - |
| 0x026182 | `push af ; call 0x05e448` | - |
| 0x0261d7 | `xor a ; push af ; res 2, (iy+5)` | - |
| 0x0261e7 | `push af ; call 0x05e490` | - |
| 0x0262c0 | `ld a, (0xd001a8) ; push af ; ld a, (0xd008d5)` | - |
| 0x0262dc | `call 0x05e381` | - |
| 0x0265ae | `call 0x05e448` | - |
| 0x0265f7 | `call 0x05e448` | - |
| 0x02668f | `call 0x05e3e8` | - |
| 0x04eb71 | `call 0x05e242` | - |
| 0x04eb76 | `res 4, (iy+5) ; res 2, (iy+5) ; call 0x05e3e8` | - |
| 0x04eb7e | `call 0x05e3e8` | - |
| 0x058828 | `call 0x05e3e8` | - |
| 0x058839 | `call 0x05e3e8` | - |
| 0x0589a9 | `call 0x05e402` | - |
| 0x0589dd | `add hl, bc ; call 0x05e448` | - |

(showing first 30 of 96)

## External callers grouped by ROM page

| page | count | addresses |
|------|------:|-----------|
| 0x022000 | 1 | 0x22ea2 |
| 0x025000 | 13 | 0x2592f, 0x2593d, 0x259af, 0x259d5, 0x25a14, 0x25a28, 0x025a2e, 0x0025a32, ... (+5) |
| 0x026000 | 9 | 0x2616d, 0x26182, 0x261d7, 0x261e7, 0x262c0, 0x262dc, 0x0265ae, 0x00265f7, ... (+1) |
| 0x04e000 | 3 | 0x4eb71, 0x4eb76, 0x4eb7e |
| 0x058000 | 7 | 0x58828, 0x58839, 0x589a9, 0x589dd, 0x589de, 0x58a4c, 0x058a78 |
| 0x060000 | 8 | 0x60515, 0x6051b, 0x6055f, 0x6057f, 0x6077b, 0x60794, 0x0607e5, 0x00607fe |
| 0x06a000 | 2 | 0x6a169, 0x6a16a |
| 0x079000 | 1 | 0x792b5 |
| 0x080000 | 1 | 0x80f1a |
| 0x090000 | 9 | 0x90af4, 0x90c04, 0x90c54, 0x90c58, 0x90c60, 0x90d97, 0x090dc6, 0x0090dca, ... (+1) |
| 0x091000 | 3 | 0x91105, 0x91bfe, 0x91c1c |
| 0x097000 | 8 | 0x970f6, 0x97106, 0x9715b, 0x97177, 0x97183, 0x971de, 0x097390, 0x009759f |
| 0x09c000 | 19 | 0x9c7c0, 0x9c986, 0x9c98c, 0x9c9e8, 0x9ca7e, 0x9cb08, 0x09cb1a, 0x009cb6f, ... (+11) |
| 0x09d000 | 1 | 0x9d2a5 |
| 0x0a1000 | 1 | 0xa1d46 |
| 0x0a2000 | 4 | 0xa2c6c, 0xa2c75, 0xa2cc3, 0xa2cc8 |
| 0x0a5000 | 1 | 0xa5be2 |
| 0x0ad000 | 2 | 0xad33e, 0xade6f |
| 0x0b3000 | 2 | 0xb3ef8, 0xb3f26 |
| 0x0b5000 | 1 | 0xb50cc |

## Forward dependencies — what the 0x05e4xx family calls

Total external callees: **109**

Addresses: 0x2256a, 0x225b8, 0x25cfc, 0x26048, 0x2622c, 0x262c0, 0x026315, 0x002631e, 0x000263d5, 0x0000264b1, 0x000003d1be, 0x0000004500a, 0x0000000450be, 0x00000000450f1, 0x0000000004530f, 0x0000000000453dc, 0x000000000004c973, 0x0000000000004c979, 0x000000000000056ab4, 0x0000000000000056b0f, 0x00000000000000056b2f, 0x00000000000000005c52c, 0x000000000000000005da51, 0x0000000000000000005de20, 0x00000000000000000005f016, 0x000000000000000000005f027, 0x0000000000000000000005f02b, 0x00000000000000000000005f0ae, 0x000000000000000000000005f130, 0x0000000000000000000000005f145, 0x00000000000000000000000005f4bf, 0x0000000000000000000000000060ffa, 0x00000000000000000000000000061003, 0x000000000000000000000000000061186, 0x0000000000000000000000000000067e0e, 0x0000000000000000000000000000006c73c, 0x00000000000000000000000000000006ee8e, 0x000000000000000000000000000000006ef5b, 0x00000000000000000000000000000000070228, 0x00000000000000000000000000000000007c74f, ...