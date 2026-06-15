# Phase 688: D000C2 / IY+66 Bit-7 Ownership Map

Probe: `probe-phase688-d000c2-owner-map.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase688-d000c2-owner-map.mjs`

## Summary

- Indexed IY+66 references found: **63** total, **63** backed by lifted instruction metadata.
- Bit-operation references on IY+66: **63** total.
- Bit-7 ownership sites: **31** total = 16 BIT, 4 SET, 11 RES.
- Direct absolute byte pattern for D000C2 (C2 00 D0): **3** raw hits, **0** code-backed hits.
- Main finding: D000C2 bit7 is broader than the phase687 gate: it is a shared low-ROM/UI latch with owners in the 0x0012xx/0x0018xx/0x005Bxx/0x0158xx/0x04Cxxx families, anchored by a central 0x04C83A BIT/SET helper.

## Bit Operation Counts

| bit/op | count |
| --- | --- |
| bit0:BIT | 6 |
| bit0:RES | 3 |
| bit1:BIT | 1 |
| bit1:RES | 1 |
| bit1:SET | 1 |
| bit2:BIT | 2 |
| bit2:RES | 2 |
| bit2:SET | 1 |
| bit3:BIT | 2 |
| bit3:RES | 3 |
| bit3:SET | 1 |
| bit5:BIT | 2 |
| bit5:RES | 1 |
| bit5:SET | 1 |
| bit6:BIT | 2 |
| bit6:RES | 1 |
| bit6:SET | 2 |
| bit7:BIT | 16 |
| bit7:RES | 11 |
| bit7:SET | 4 |

## Bit-7 Ownership Sites

| pc | bytes | op | role | code-backed | block | cluster | meaning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x0012EF | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x0012EF | low-ROM reset/wake flag initializer | initializes IY to D00080 and clears bit7 before the low-ROM dispatch table walk |
| 0x00186A | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x00185E | low-ROM key/flash wrapper cluster | normal key handler and wrapper path; known to clear IY+66 bit7 before post-key dispatch |
| 0x0018B7 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x0018AF | low-ROM key/flash wrapper cluster | normal key handler and wrapper path; known to clear IY+66 bit7 before post-key dispatch |
| 0x001915 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x001915 | low-ROM key/flash wrapper cluster | normal key handler and wrapper path; known to clear IY+66 bit7 before post-key dispatch |
| 0x005BB6 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x005BB6 | low-ROM hardware/service dispatch cluster | clears/tests bit7 around port guards and calls into 0x0158DE service dispatch |
| 0x005D00 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x005D00 | low-ROM hardware/service dispatch cluster | clears/tests bit7 around port guards and calls into 0x0158DE service dispatch |
| 0x00621F | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x00621A | low-ROM hardware/service dispatch cluster | clears/tests bit7 around port guards and calls into 0x0158DE service dispatch |
| 0x0158E3 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x0158E3 | 0x0158DE post-key flash/action gate | tests bit7 as a re-entry guard and sets it after the owner/table path succeeds |
| 0x0158F0 | FD CB 42 FE | SET 7, (IY+66) | setter | yes | 0x0158F0 | 0x0158DE post-key flash/action gate | tests bit7 as a re-entry guard and sets it after the owner/table path succeeds |
| 0x027238 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x027233 | event/parser state cluster | uses multiple D000C2 bits and bridges into the central 0x04C83A bit7 helper |
| 0x040580 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x040580 | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x0405DD | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x0405DD | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x04062C | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04062C | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x040740 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x040740 | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x0408C6 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x0408C1 | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x040972 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x040964 | keyboard/display event cluster | uses D000C2 bits across display/key event transitions, including bit7 tests and clears |
| 0x040EB4 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x040EAF | keyboard/display event tail cluster | clears bit7 before calling the central 0x04C83A helper |
| 0x0459F7 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x0459F2 | home/display transition cluster | clears/sets bit7 around display-home transition helpers and the 0x04C33B path |
| 0x045B46 | FD CB 42 FE | SET 7, (IY+66) | setter | yes | 0x045B46 | home/display transition cluster | clears/sets bit7 around display-home transition helpers and the 0x04C33B path |
| 0x04C057 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C052 | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C0BD | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C0B8 | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C0D3 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C0D3 | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C14D | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C147 | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C167 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C162 | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C53E | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x04C53E | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C564 | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C55C | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C56F | FD CB 42 FE | SET 7, (IY+66) | setter | yes | 0x04C56F | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C83F | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x04C83F | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x04C84B | FD CB 42 FE | SET 7, (IY+66) | setter | yes | 0x04C84B | central UI bit7 latch/helper cluster | contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths |
| 0x06B9C5 | FD CB 42 BE | RES 7, (IY+66) | clearer | yes | 0x06B9C0 | equation/error UI helper cluster | uses bits 1/6/7 and calls the central 0x04C83A bit7 helper |
| 0x06B9CF | FD CB 42 7E | BIT 7, (IY+66) | test | yes | 0x06B9CE | equation/error UI helper cluster | uses bits 1/6/7 and calls the central 0x04C83A bit7 helper |

## All Code-Backed IY+66 References

| pc | bytes | instruction | role | cluster |
| --- | --- | --- | --- | --- |
| 0x0012EF | FD CB 42 BE | RES 7, (IY+66) | clearer | low-ROM reset/wake flag initializer |
| 0x00186A | FD CB 42 BE | RES 7, (IY+66) | clearer | low-ROM key/flash wrapper cluster |
| 0x0018B7 | FD CB 42 7E | BIT 7, (IY+66) | test | low-ROM key/flash wrapper cluster |
| 0x001915 | FD CB 42 7E | BIT 7, (IY+66) | test | low-ROM key/flash wrapper cluster |
| 0x005BB6 | FD CB 42 BE | RES 7, (IY+66) | clearer | low-ROM hardware/service dispatch cluster |
| 0x005D00 | FD CB 42 7E | BIT 7, (IY+66) | test | low-ROM hardware/service dispatch cluster |
| 0x00621F | FD CB 42 BE | RES 7, (IY+66) | clearer | low-ROM hardware/service dispatch cluster |
| 0x0158E3 | FD CB 42 7E | BIT 7, (IY+66) | test | 0x0158DE post-key flash/action gate |
| 0x0158F0 | FD CB 42 FE | SET 7, (IY+66) | setter | 0x0158DE post-key flash/action gate |
| 0x025151 | FD CB 42 5E | BIT 3, (IY+66) | test | event/parser state cluster |
| 0x0251A1 | FD CB 42 5E | BIT 3, (IY+66) | test | event/parser state cluster |
| 0x02534A | FD CB 42 DE | SET 3, (IY+66) | setter | event/parser state cluster |
| 0x0253CE | FD CB 42 9E | RES 3, (IY+66) | clearer | event/parser state cluster |
| 0x0256A0 | FD CB 42 9E | RES 3, (IY+66) | clearer | event/parser state cluster |
| 0x027238 | FD CB 42 BE | RES 7, (IY+66) | clearer | event/parser state cluster |
| 0x03D0B9 | FD CB 42 46 | BIT 0, (IY+66) | test | display/event prelude cluster |
| 0x03E9DD | FD CB 42 B6 | RES 6, (IY+66) | clearer | error-display/detail cluster |
| 0x03EA47 | FD CB 42 F6 | SET 6, (IY+66) | setter | error-display/detail cluster |
| 0x03EB99 | FD CB 42 76 | BIT 6, (IY+66) | test | error-display/detail cluster |
| 0x03EBE3 | FD CB 42 76 | BIT 6, (IY+66) | test | error-display/detail cluster |
| 0x03F500 | FD CB 42 46 | BIT 0, (IY+66) | test | keyboard/display event cluster |
| 0x03F521 | FD CB 42 46 | BIT 0, (IY+66) | test | keyboard/display event cluster |
| 0x0403AF | FD CB 42 86 | RES 0, (IY+66) | clearer | keyboard/display event cluster |
| 0x0404B6 | FD CB 42 46 | BIT 0, (IY+66) | test | keyboard/display event cluster |
| 0x04052C | FD CB 42 9E | RES 3, (IY+66) | clearer | keyboard/display event cluster |
| 0x040580 | FD CB 42 BE | RES 7, (IY+66) | clearer | keyboard/display event cluster |
| 0x0405DD | FD CB 42 7E | BIT 7, (IY+66) | test | keyboard/display event cluster |
| 0x04062C | FD CB 42 7E | BIT 7, (IY+66) | test | keyboard/display event cluster |
| 0x040740 | FD CB 42 7E | BIT 7, (IY+66) | test | keyboard/display event cluster |
| 0x0408C6 | FD CB 42 BE | RES 7, (IY+66) | clearer | keyboard/display event cluster |
| 0x040972 | FD CB 42 7E | BIT 7, (IY+66) | test | keyboard/display event cluster |
| 0x040985 | FD CB 42 86 | RES 0, (IY+66) | clearer | keyboard/display event cluster |
| 0x04098D | FD CB 42 96 | RES 2, (IY+66) | clearer | keyboard/display event cluster |
| 0x040D15 | FD CB 42 46 | BIT 0, (IY+66) | test | keyboard/display timer cluster |
| 0x040EB4 | FD CB 42 BE | RES 7, (IY+66) | clearer | keyboard/display event tail cluster |
| 0x0459F7 | FD CB 42 BE | RES 7, (IY+66) | clearer | home/display transition cluster |
| 0x045B46 | FD CB 42 FE | SET 7, (IY+66) | setter | home/display transition cluster |
| 0x04B37D | FD CB 42 AE | RES 5, (IY+66) | clearer | D000C2 bit5 mode cluster |
| 0x04B385 | FD CB 42 6E | BIT 5, (IY+66) | test | D000C2 bit5 mode cluster |
| 0x04B38D | FD CB 42 EE | SET 5, (IY+66) | setter | D000C2 bit5 mode cluster |
| 0x04B39A | FD CB 42 6E | BIT 5, (IY+66) | test | D000C2 bit5 mode cluster |
| 0x04C057 | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C092 | FD CB 42 D6 | SET 2, (IY+66) | setter | central UI bit7 latch/helper cluster |
| 0x04C0BD | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C0D3 | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C132 | FD CB 42 96 | RES 2, (IY+66) | clearer | central UI bit7 latch/helper cluster |
| 0x04C14D | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C152 | FD CB 42 56 | BIT 2, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C167 | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C228 | FD CB 42 56 | BIT 2, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C53E | FD CB 42 BE | RES 7, (IY+66) | clearer | central UI bit7 latch/helper cluster |
| 0x04C564 | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C56F | FD CB 42 FE | SET 7, (IY+66) | setter | central UI bit7 latch/helper cluster |
| 0x04C83F | FD CB 42 7E | BIT 7, (IY+66) | test | central UI bit7 latch/helper cluster |
| 0x04C84B | FD CB 42 FE | SET 7, (IY+66) | setter | central UI bit7 latch/helper cluster |
| 0x06B0FA | FD CB 42 CE | SET 1, (IY+66) | setter | equation/error UI helper cluster |
| 0x06B262 | FD CB 42 4E | BIT 1, (IY+66) | test | equation/error UI helper cluster |
| 0x06B268 | FD CB 42 8E | RES 1, (IY+66) | clearer | equation/error UI helper cluster |
| 0x06B26C | FD CB 42 F6 | SET 6, (IY+66) | setter | equation/error UI helper cluster |
| 0x06B9C5 | FD CB 42 BE | RES 7, (IY+66) | clearer | equation/error UI helper cluster |
| 0x06B9CF | FD CB 42 7E | BIT 7, (IY+66) | test | equation/error UI helper cluster |
| 0x08C61C | FD CB 42 86 | RES 0, (IY+66) | clearer | launch-home cleanup cluster |
| 0x0A3379 | FD CB 42 46 | BIT 0, (IY+66) | test | display scan/layout cluster |

## Direct Control References

| target | refs |
| --- | --- |
| 0x001853 | CALL@0x00085E, CALL@0x0013E4, CALL@0x003A89 |
| 0x0158DE | CALL@0x0013D6, CALL@0x00186E, CALL@0x005BC3, CALL@0x006223 |
| 0x0158BC | CALL@0x0158E8 |

## Bit-7 Decode Windows

### 0x0012EF - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x0012EA | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x0012EF** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x0012F3 | 21 0E 13 00 | ld hl, 0x00130e |
| 0x0012F7 | ED 07 | ld bc, (hl) |
| 0x0012F9 | 23 | inc hl |
| 0x0012FA | 23 | inc hl |

### 0x00186A - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x00185E | FD CB 05 9E | res 3, (iy+5) |
| 0x001862 | ED 38 09 | in0 a, (0x09) |
| 0x001865 | CB F7 | set 6, a |
| 0x001867 | ED 39 09 | out0 (0x09), a |
| **0x00186A** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x00186E | CD DE 58 01 | call 0x0158de |

### 0x0018B7 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x0018AF | ED 38 07 | in0 a, (0x07) |
| 0x0018B2 | CB E7 | set 4, a |
| 0x0018B4 | ED 39 07 | out0 (0x07), a |
| **0x0018B7** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x0018BB | 28 1A | jr z, 0x0018d7 |

### 0x001915 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x001915** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x001919 | C8 | ret z |

### 0x005BB6 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x005BB1 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x005BB6** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x005BBA | ED 38 03 | in0 a, (0x03) |
| 0x005BBD | CB 67 | bit 4, a |
| 0x005BBF | CA 44 5C 00 | jp z, 0x005c44 |

### 0x005D00 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x005D00** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x005D04 | 28 07 | jr z, 0x005d0d |

### 0x00621F - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x00621A | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x00621F** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x006223 | CD DE 58 01 | call 0x0158de |

### 0x0158E3 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x0158DE | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x0158E3** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x0158E7 | C0 | ret nz |

### 0x0158F0 - SET 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x0158F0** | FD CB 42 FE | **set 7, (iy+66)** |
| 0x0158F4 | 3E 01 | ld a, 0x01 |
| 0x0158F6 | B7 | or a |
| 0x0158F7 | C9 | ret |

### 0x027238 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x027233 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x027238** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x02723C | CD 3A C8 04 | call 0x04c83a |

### 0x040580 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x040580** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x040584 | CD 3A C8 04 | call 0x04c83a |

### 0x0405DD - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x0405DD** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x0405E1 | 28 24 | jr z, 0x040607 |

### 0x04062C - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x04062C** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x040630 | 28 02 | jr z, 0x040634 |

### 0x040740 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x040740** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x040744 | 28 0D | jr z, 0x040753 |

### 0x0408C6 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x0408C1 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x0408C6** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x0408CA | CD 3A C8 04 | call 0x04c83a |

### 0x040972 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x040964 | 21 92 2A D0 | ld hl, 0xd02a92 |
| 0x040968 | CB 86 | res 0, (hl) |
| 0x04096A | FD CB 01 A6 | res 4, (iy+1) |
| 0x04096E | FD CB 3E A6 | res 4, (iy+62) |
| **0x040972** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x040976 | 20 11 | jr nz, 0x040989 |

### 0x040EB4 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x040EAF | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x040EB4** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x040EB8 | CD 3A C8 04 | call 0x04c83a |

### 0x0459F7 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x0459F2 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x0459F7** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x0459FB | CD 25 9F 04 | call 0x049f25 |

### 0x045B46 - SET 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x045B46** | FD CB 42 FE | **set 7, (iy+66)** |
| 0x045B4A | CD 3B C3 04 | call 0x04c33b |

### 0x04C057 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C052 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x04C057** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C05B | C8 | ret z |

### 0x04C0BD - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C0B8 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x04C0BD** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C0C1 | C8 | ret z |

### 0x04C0D3 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x04C0D3** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C0D7 | 28 59 | jr z, 0x04c132 |

### 0x04C14D - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C147 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| 0x04C14C | AF | xor a |
| **0x04C14D** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C151 | C8 | ret z |

### 0x04C167 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C159 | DD E5 | push ix |
| 0x04C15B | DD 21 00 00 00 | ld ix, 0x000000 |
| 0x04C160 | DD 39 | add ix, sp |
| 0x04C162 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x04C167** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C16B | 28 24 | jr z, 0x04c191 |

### 0x04C53E - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C539 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x04C53E** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x04C542 | CD 3A C8 04 | call 0x04c83a |

### 0x04C564 - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C55C | ED 38 0A | in0 a, (0x0a) |
| 0x04C55F | CB D7 | set 2, a |
| 0x04C561 | ED 39 0A | out0 (0x0a), a |
| **0x04C564** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C568 | 3E 01 | ld a, 0x01 |
| 0x04C56A | 20 03 | jr nz, 0x04c56f |

### 0x04C56F - SET 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x04C56F** | FD CB 42 FE | **set 7, (iy+66)** |
| 0x04C573 | 21 80 8E D1 | ld hl, 0xd18e80 |
| 0x04C577 | E5 | push hl |
| 0x04C578 | CD 79 33 03 | call 0x033379 |

### 0x04C83F - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x04C83A | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x04C83F** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x04C843 | C0 | ret nz |

### 0x04C84B - SET 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| **0x04C84B** | FD CB 42 FE | **set 7, (iy+66)** |
| 0x04C84F | C9 | ret |

### 0x06B9C5 - RES 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x06B9C0 | FD 21 80 00 D0 | ld iy, 0xd00080 |
| **0x06B9C5** | FD CB 42 BE | **res 7, (iy+66)** |
| 0x06B9C9 | F5 | push af |
| 0x06B9CA | CD 3A C8 04 | call 0x04c83a |

### 0x06B9CF - BIT 7, (IY+66)

| pc | bytes | instruction |
| --- | --- | --- |
| 0x06B9CE | F1 | pop af |
| **0x06B9CF** | FD CB 42 7E | **bit 7, (iy+66)** |
| 0x06B9D3 | 28 04 | jr z, 0x06b9d9 |

## Interpretation

- Bit 7 is broader than the phase687 `0x0158DE` gate. Static code-backed owners include low-ROM init/service paths, the `0x0158DE` post-key flash/action gate, display/home transition paths, and the central `0x04C83A` helper family.
- The normal low-ROM clearer pattern is `RES 7,(IY+66)` before service dispatch (`0x00186A`, `0x005BB6`, `0x00621F`) and before calls into the central helper (`0x027238`, `0x040580`, `0x0408C6`, `0x040EB4`, `0x04C53E`, `0x06B9C5`).
- The normal setter pattern appears both in the `0x0158DE` gate (`0x0158F0`) and in the central helper/display transition family (`0x045B46`, `0x04C56F`, `0x04C84B`). So bit7 is a shared re-entry/latch flag, not a one-off browser-insert flag.
- D000C2 as a byte also has broader UI meaning through other bits: bit0 appears in cursor/display timing and layout clusters, bit6 appears in error-detail paths, and bits1/2/3/5 have separate mode users. Any browser policy must touch only bit7.
- Integration risk is medium, not low: phase687 proves the targeted gate-bypass state is equivalent for tested insertions, but this map shows leaving bit7 set intersects OS service/display helpers. Before editing `browser-shell.html`, run one dynamic owner-hit probe from the browser recipe to confirm which bit7 owners fire during key insertion and settling.

## Assertions

| assertion | pass |
| --- | --- |
| foundBit7Test | yes |
| foundBit7Setter | yes |
| foundBit7Clearer | yes |
| allBit7OpsCodeBacked | yes |
| foundCentral04C83AHelperFamily | yes |
| noAbsoluteD000C2CodeRefs | yes |

## Compact JSON

```json
{
  "pass": true,
  "assertions": {
    "foundBit7Test": true,
    "foundBit7Setter": true,
    "foundBit7Clearer": true,
    "allBit7OpsCodeBacked": true,
    "foundCentral04C83AHelperFamily": true,
    "noAbsoluteD000C2CodeRefs": true
  },
  "counts": {
    "refs": 63,
    "codeBackedRefs": 63,
    "bitOps": 63,
    "bit7Ops": 31,
    "absoluteD000C2Triples": 3,
    "absoluteD000C2CodeBacked": 0
  },
  "bit7Ops": [
    {
      "pc": "0x0012EF",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM reset/wake flag initializer",
      "codeBacked": true,
      "blockStart": "0x0012EF"
    },
    {
      "pc": "0x00186A",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM key/flash wrapper cluster",
      "codeBacked": true,
      "blockStart": "0x00185E"
    },
    {
      "pc": "0x0018B7",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM key/flash wrapper cluster",
      "codeBacked": true,
      "blockStart": "0x0018AF"
    },
    {
      "pc": "0x001915",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM key/flash wrapper cluster",
      "codeBacked": true,
      "blockStart": "0x001915"
    },
    {
      "pc": "0x005BB6",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM hardware/service dispatch cluster",
      "codeBacked": true,
      "blockStart": "0x005BB6"
    },
    {
      "pc": "0x005D00",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM hardware/service dispatch cluster",
      "codeBacked": true,
      "blockStart": "0x005D00"
    },
    {
      "pc": "0x00621F",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM hardware/service dispatch cluster",
      "codeBacked": true,
      "blockStart": "0x00621A"
    },
    {
      "pc": "0x0158E3",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "0x0158DE post-key flash/action gate",
      "codeBacked": true,
      "blockStart": "0x0158E3"
    },
    {
      "pc": "0x0158F0",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "0x0158DE post-key flash/action gate",
      "codeBacked": true,
      "blockStart": "0x0158F0"
    },
    {
      "pc": "0x027238",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "event/parser state cluster",
      "codeBacked": true,
      "blockStart": "0x027233"
    },
    {
      "pc": "0x040580",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x040580"
    },
    {
      "pc": "0x0405DD",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x0405DD"
    },
    {
      "pc": "0x04062C",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x04062C"
    },
    {
      "pc": "0x040740",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x040740"
    },
    {
      "pc": "0x0408C6",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x0408C1"
    },
    {
      "pc": "0x040972",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster",
      "codeBacked": true,
      "blockStart": "0x040964"
    },
    {
      "pc": "0x040EB4",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event tail cluster",
      "codeBacked": true,
      "blockStart": "0x040EAF"
    },
    {
      "pc": "0x0459F7",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "home/display transition cluster",
      "codeBacked": true,
      "blockStart": "0x0459F2"
    },
    {
      "pc": "0x045B46",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "home/display transition cluster",
      "codeBacked": true,
      "blockStart": "0x045B46"
    },
    {
      "pc": "0x04C057",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C052"
    },
    {
      "pc": "0x04C0BD",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C0B8"
    },
    {
      "pc": "0x04C0D3",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C0D3"
    },
    {
      "pc": "0x04C14D",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C147"
    },
    {
      "pc": "0x04C167",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C162"
    },
    {
      "pc": "0x04C53E",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C53E"
    },
    {
      "pc": "0x04C564",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C55C"
    },
    {
      "pc": "0x04C56F",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C56F"
    },
    {
      "pc": "0x04C83F",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C83F"
    },
    {
      "pc": "0x04C84B",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "central UI bit7 latch/helper cluster",
      "codeBacked": true,
      "blockStart": "0x04C84B"
    },
    {
      "pc": "0x06B9C5",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "equation/error UI helper cluster",
      "codeBacked": true,
      "blockStart": "0x06B9C0"
    },
    {
      "pc": "0x06B9CF",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "equation/error UI helper cluster",
      "codeBacked": true,
      "blockStart": "0x06B9CE"
    }
  ],
  "codeBackedRefs": [
    {
      "pc": "0x0012EF",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM reset/wake flag initializer"
    },
    {
      "pc": "0x00186A",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM key/flash wrapper cluster"
    },
    {
      "pc": "0x0018B7",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM key/flash wrapper cluster"
    },
    {
      "pc": "0x001915",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM key/flash wrapper cluster"
    },
    {
      "pc": "0x005BB6",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM hardware/service dispatch cluster"
    },
    {
      "pc": "0x005D00",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "low-ROM hardware/service dispatch cluster"
    },
    {
      "pc": "0x00621F",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "low-ROM hardware/service dispatch cluster"
    },
    {
      "pc": "0x0158E3",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "0x0158DE post-key flash/action gate"
    },
    {
      "pc": "0x0158F0",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "0x0158DE post-key flash/action gate"
    },
    {
      "pc": "0x025151",
      "op": "BIT 3, (IY+66)",
      "role": "test",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x0251A1",
      "op": "BIT 3, (IY+66)",
      "role": "test",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x02534A",
      "op": "SET 3, (IY+66)",
      "role": "setter",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x0253CE",
      "op": "RES 3, (IY+66)",
      "role": "clearer",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x0256A0",
      "op": "RES 3, (IY+66)",
      "role": "clearer",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x027238",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "event/parser state cluster"
    },
    {
      "pc": "0x03D0B9",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "display/event prelude cluster"
    },
    {
      "pc": "0x03E9DD",
      "op": "RES 6, (IY+66)",
      "role": "clearer",
      "cluster": "error-display/detail cluster"
    },
    {
      "pc": "0x03EA47",
      "op": "SET 6, (IY+66)",
      "role": "setter",
      "cluster": "error-display/detail cluster"
    },
    {
      "pc": "0x03EB99",
      "op": "BIT 6, (IY+66)",
      "role": "test",
      "cluster": "error-display/detail cluster"
    },
    {
      "pc": "0x03EBE3",
      "op": "BIT 6, (IY+66)",
      "role": "test",
      "cluster": "error-display/detail cluster"
    },
    {
      "pc": "0x03F500",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x03F521",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x0403AF",
      "op": "RES 0, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x0404B6",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x04052C",
      "op": "RES 3, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x040580",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x0405DD",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x04062C",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x040740",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x0408C6",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x040972",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x040985",
      "op": "RES 0, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x04098D",
      "op": "RES 2, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event cluster"
    },
    {
      "pc": "0x040D15",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "keyboard/display timer cluster"
    },
    {
      "pc": "0x040EB4",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "keyboard/display event tail cluster"
    },
    {
      "pc": "0x0459F7",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "home/display transition cluster"
    },
    {
      "pc": "0x045B46",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "home/display transition cluster"
    },
    {
      "pc": "0x04B37D",
      "op": "RES 5, (IY+66)",
      "role": "clearer",
      "cluster": "D000C2 bit5 mode cluster"
    },
    {
      "pc": "0x04B385",
      "op": "BIT 5, (IY+66)",
      "role": "test",
      "cluster": "D000C2 bit5 mode cluster"
    },
    {
      "pc": "0x04B38D",
      "op": "SET 5, (IY+66)",
      "role": "setter",
      "cluster": "D000C2 bit5 mode cluster"
    },
    {
      "pc": "0x04B39A",
      "op": "BIT 5, (IY+66)",
      "role": "test",
      "cluster": "D000C2 bit5 mode cluster"
    },
    {
      "pc": "0x04C057",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C092",
      "op": "SET 2, (IY+66)",
      "role": "setter",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C0BD",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C0D3",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C132",
      "op": "RES 2, (IY+66)",
      "role": "clearer",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C14D",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C152",
      "op": "BIT 2, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C167",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C228",
      "op": "BIT 2, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C53E",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C564",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C56F",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C83F",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x04C84B",
      "op": "SET 7, (IY+66)",
      "role": "setter",
      "cluster": "central UI bit7 latch/helper cluster"
    },
    {
      "pc": "0x06B0FA",
      "op": "SET 1, (IY+66)",
      "role": "setter",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x06B262",
      "op": "BIT 1, (IY+66)",
      "role": "test",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x06B268",
      "op": "RES 1, (IY+66)",
      "role": "clearer",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x06B26C",
      "op": "SET 6, (IY+66)",
      "role": "setter",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x06B9C5",
      "op": "RES 7, (IY+66)",
      "role": "clearer",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x06B9CF",
      "op": "BIT 7, (IY+66)",
      "role": "test",
      "cluster": "equation/error UI helper cluster"
    },
    {
      "pc": "0x08C61C",
      "op": "RES 0, (IY+66)",
      "role": "clearer",
      "cluster": "launch-home cleanup cluster"
    },
    {
      "pc": "0x0A3379",
      "op": "BIT 0, (IY+66)",
      "role": "test",
      "cluster": "display scan/layout cluster"
    }
  ],
  "directControlRefs": {
    "0x001853": [
      {
        "pc": 2142,
        "op": "CALL",
        "bytes": "CD 53 18 00",
        "codeBacked": true,
        "blockStart": 2140
      },
      {
        "pc": 5092,
        "op": "CALL",
        "bytes": "CD 53 18 00",
        "codeBacked": true,
        "blockStart": 5084
      },
      {
        "pc": 14985,
        "op": "CALL",
        "bytes": "CD 53 18 00",
        "codeBacked": true,
        "blockStart": 14985
      }
    ],
    "0x0158DE": [
      {
        "pc": 5078,
        "op": "CALL",
        "bytes": "CD DE 58 01",
        "codeBacked": true,
        "blockStart": 5078
      },
      {
        "pc": 6254,
        "op": "CALL",
        "bytes": "CD DE 58 01",
        "codeBacked": true,
        "blockStart": 6238
      },
      {
        "pc": 23491,
        "op": "CALL",
        "bytes": "CD DE 58 01",
        "codeBacked": true,
        "blockStart": 23490
      },
      {
        "pc": 25123,
        "op": "CALL",
        "bytes": "CD DE 58 01",
        "codeBacked": true,
        "blockStart": 25114
      }
    ],
    "0x0158BC": [
      {
        "pc": 88296,
        "op": "CALL",
        "bytes": "CD BC 58 01",
        "codeBacked": true,
        "blockStart": 88296
      }
    ]
  }
}
```

