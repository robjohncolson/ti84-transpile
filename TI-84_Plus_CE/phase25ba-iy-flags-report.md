# Phase 25BA - IY Flag Investigation

## Summary

Investigated the two non-zero IY flag bytes after MEM_INIT:
- IY+0x4A (0xD000CA) = 0x10 — bit 4 set
- IY+0x47 (0xD000C7) = 0x80 — bit 7 set

## Part 1: ROM Pattern Search

### BIT 4,(IY+0x4A)
- 0x0a1919: [2a d0 41 4f fd cb 4a 66 20 46 40 11]
- 0x0a19d1: [73 2a d0 4f fd cb 4a 66 20 40 11 ff]
- 0x0a22da: [47 c6 0f 4f fd cb 4a 66 28 10 e5 40]

### SET 4,(IY+0x4A)
- 0x045979: [fd cb 05 de fd cb 4a e6 11 00 f8 00]
- 0x045ad3: [fd cb 05 de fd cb 4a e6 cd 50 9f 04]
- 0x045b97: [fd cb 05 de fd cb 4a e6 cd f2 6c 04]
- 0x045dd1: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x045e6c: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x045f2e: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x046178: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x046262: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x04674c: [78 6a 04 af fd cb 4a e6 fd cb 05 de]
- 0x046868: [fd cb 05 de fd cb 4a e6 21 00 00 00]
- 0x062236: [40 22 88 26 fd cb 4a e6 e1 7e b7 28]
- 0x0802bf: [40 22 88 26 fd cb 4a e6 c9 fe 5a d8]
- 0x089038: [ed 43 88 26 fd cb 4a e6 2a 95 05 d0]
- 0x09e006: [40 22 c0 2a fd cb 4a e6 c9 ed 5b 95]
- 0x09ec47: [fd 7e 4a f5 fd cb 4a e6 cd ac 1c 0a]
- 0x0b37ad: [cd a8 44 0b fd cb 4a e6 cd e7 3a 0b]
- 0x0b3be3: [ed 53 88 26 fd cb 4a e6 40 2a aa 26]

### RES 4,(IY+0x4A)
- 0x0289ea: [2a 95 05 e5 fd cb 4a a6 11 2c 00 00]
- 0x02995b: [cd 7f 8a 02 fd cb 4a a6 c3 b1 96 02]
- 0x03df6c: [cd 99 17 0a fd cb 4a a6 21 00 00 00]
- 0x03e9ff: [cd 99 17 0a fd cb 4a a6 21 00 00 00]
- 0x0459a1: [fd cb 05 9e fd cb 4a a6 cd b3 fc 02]
- 0x045b3e: [fd cb 05 9e fd cb 4a a6 cd 2d c6 04]
- 0x045beb: [fd cb 05 9e fd cb 4a a6 21 45 6a 04]
- 0x045df1: [fd cb 05 9e fd cb 4a a6 21 02 00 00]
- 0x045e8c: [fd cb 05 9e fd cb 4a a6 21 02 00 00]
- 0x045f4e: [fd cb 05 9e fd cb 4a a6 f5 f3 3e 8c]
- 0x046198: [fd cb 05 9e fd cb 4a a6 fd cb 09 a6]
- 0x046282: [fd cb 05 9e fd cb 4a a6 cd 18 6d 04]
- 0x046760: [40 22 88 26 fd cb 4a a6 fd cb 05 9e]
- 0x046888: [fd cb 05 9e fd cb 4a a6 f3 3e ff ed]
- 0x0582bc: [cd 22 bf 08 fd cb 4a a6 fd cb 05 9e]
- 0x062286: [40 22 88 26 fd cb 4a a6 e1 40 22 95]
- 0x089047: [cd 9d 88 02 fd cb 4a a6 21 00 00 00]
- 0x092740: [fd cb 05 8e fd cb 4a a6 21 00 00 00]
- 0x09dd66: [cd e0 de 09 fd cb 4a a6 21 ff ff 00]
- 0x09e058: [cd 6b df 09 fd cb 4a a6 3e 01 32 24]
- 0x0b37b9: [cd 38 2d 02 fd cb 4a a6 21 ff ff 00]
- 0x0b3bfb: [cd 0a 5b 0b fd cb 4a a6 fd cb 0d ce]

### SET 7,(IY+0x47)
- 0x0456ec: [cd 8f a9 08 fd cb 47 fe fd cb 44 ee]
- 0x09df0c: [cd 8f a9 08 fd cb 47 fe 18 00 f5 d5]

### BIT 0,(IY+0x4A)
- 0x05c669: [39 02 20 0a fd cb 4a 46 20 04 cd d0]

### SET 0,(IY+0x4A)
- 0x08c3a0: [3a 8c 05 d0 fd cb 4a c6 cd 34 c6 05]

### RES 0,(IY+0x4A)
- 0x05c673: [cd d0 86 02 fd cb 4a 86 f1 fd cb 0c]

### BIT 2,(IY+0x4A)
- 0x07b658: [b7 07 e1 f1 fd cb 4a 56 28 0c fd cb]
- 0x07b6a8: [b7 07 e1 f1 fd cb 4a 56 28 0c fd cb]

### SET 2,(IY+0x4A)
- 0x0b81c8: [ca d4 81 0b fd cb 4a d6 fd cb 3c de]

### RES 2,(IY+0x4A)
- 0x0b8153: [fd cb 3c 9e fd cb 4a 96 fd cb 02 56]
- 0x0b81d4: [c3 91 78 0b fd cb 4a 96 fd cb 3c 9e]

### BIT 3,(IY+0x4A)
- 0x0267e6: [11 ce 31 d0 fd cb 4a 5e 28 04 11 9e]
- 0x09177b: [11 f6 31 d0 fd cb 4a 5e 28 04 11 c6]
- 0x0a1a93: [11 f6 31 d0 fd cb 4a 5e c8 11 c6 52]
- 0x0a1b2d: [11 ce 31 d0 fd cb 4a 5e 28 24 11 9e]
- 0x0a318b: [11 f6 31 d0 fd cb 4a 5e 28 04 11 c6]
- 0x0a31d8: [11 f6 31 d0 fd cb 4a 5e 28 04 11 c6]
- 0x0a324d: [11 f6 31 d0 fd cb 4a 5e 28 04 11 c6]

### BIT 5,(IY+0x4A)
- 0x0a1ac0: [09 e3 e5 c1 fd cb 4a 6e 28 1c 79 e6]
- 0x0a1b1c: [08 04 02 01 fd cb 4a 6e 28 17 d6 1e]
- 0x0a2549: [28 01 2f 4f fd cb 4a 6e 28 40 cb 7a]

### SET 5,(IY+0x4A)
- 0x0a247d: [3c 46 28 16 fd cb 4a ee 18 10 fd cb]

### RES 5,(IY+0x4A)
- 0x0a245b: [40 22 d2 08 fd cb 4a ae fd cb 4a b6]

### BIT 6,(IY+0x4A)
- 0x0a1ae2: [cb 19 e1 c9 fd cb 4a 76 28 f8 40 ed]
- 0x0a1b39: [52 d0 18 1e fd cb 4a 76 c8 c5 f5 d6]
- 0x0a258f: [c3 95 26 0a fd cb 4a 76 ca 18 26 0a]

### SET 6,(IY+0x4A)
- 0x0a248f: [3c 46 28 04 fd cb 4a f6 3a ce 25 d0]

### RES 6,(IY+0x4A)
- 0x0a245f: [fd cb 4a ae fd cb 4a b6 fd cb 14 66]

### BIT 7,(IY+0x4A)
- 0x06f03e: [21 33 1e d0 fd cb 4a 7e 28 04 21 fc]

### SET 7,(IY+0x4A)
- 0x06ed32: [11 fc 1f d0 fd cb 4a fe 01 36 00 00]

### RES 7,(IY+0x4A)
- 0x0b11b1: [ca 3a 1d 06 fd cb 4a be 2a 87 06 d0]

### BIT 0,(IY+0x47)
- 0x06bcb5: [f9 07 18 14 fd cb 47 46 20 0e cd 3c]
- 0x09b7f4: [cd df ba 09 fd cb 47 46 20 12 c3 34]
- 0x09b806: [cd df ba 09 fd cb 47 46 20 ee 3a c7]

### SET 0,(IY+0x47)
- 0x0b13c6: [23 cb 46 c8 fd cb 47 c6 c9 c1 fd 71]

### RES 0,(IY+0x47)
- 0x04571a: [22 98 2a d0 fd cb 47 86 fd cb 45 96]
- 0x0b13be: [35 87 0a e1 fd cb 47 86 23 cb 46 c8]

### BIT 1,(IY+0x47)
- 0x028a32: [47 5e 20 1a fd cb 47 4e 3e 19 28 14]
- 0x02983a: [47 56 20 08 fd cb 47 4e c4 22 bf 08]
- 0x08bf3e: [23 04 20 2a fd cb 47 4e 28 3e 01 1f]

### SET 1,(IY+0x47)
- 0x028c35: [cd b2 98 02 fd cb 47 ce cd 34 c6 05]
- 0x0297ef: [cd d7 46 02 fd cb 47 ce cd 22 bf 08]
- 0x029aff: [c2 e7 98 02 fd cb 47 ce af 32 a3 08]
- 0x029b3e: [cb 1b ae c9 fd cb 47 ce cd 2f 98 02]
- 0x029c8b: [32 8d 05 d0 fd cb 47 ce fd cb 47 de]
- 0x029cc8: [cb 1b ae c9 fd cb 47 ce fd cb 47 de]

### RES 1,(IY+0x47)
- 0x0296d0: [d0 96 02 c9 fd cb 47 8e fd cb 47 9e]
- 0x0298b6: [fd cb 09 d6 fd cb 47 8e 40 2a 95 05]
- 0x029b35: [8b 02 20 09 fd cb 47 8e fd cb 1b ae]
- 0x029c5e: [fd cb 45 a6 fd cb 47 8e fd e1 fd e5]
- 0x029cbb: [8b 02 20 0d fd cb 47 8e fd cb 47 9e]
- 0x0582c4: [fd cb 05 9e fd cb 47 8e fd cb 49 b6]

### BIT 2,(IY+0x47)
- 0x028b0c: [47 5e 20 06 fd cb 47 56 28 0c cd f7]
- 0x029834: [cd 04 98 02 fd cb 47 56 20 08 fd cb]

### RES 2,(IY+0x47)
- 0x0296d8: [fd cb 47 9e fd cb 47 96 c9 32 f8 05]

### BIT 3,(IY+0x47)
- 0x028a2c: [fd cb 09 a6 fd cb 47 5e 20 1a fd cb]
- 0x028b06: [fe 17 28 39 fd cb 47 5e 20 06 fd cb]
- 0x028bb4: [cd e0 93 02 fd cb 47 5e 20 22 3e 01]
- 0x028bfe: [cd af 97 02 fd cb 47 5e 20 12 3e 5f]
- 0x028eee: [3e f6 18 14 fd cb 47 5e 3e 05 20 02]
- 0x028f21: [3e fa 18 e1 fd cb 47 5e 3e 06 20 02]
- 0x028f33: [21 a3 90 02 fd cb 47 5e 3e f9 28 c7]
- 0x028f3f: [3e 8c 18 c3 fd cb 47 5e 3e 07 20 02]
- 0x028f53: [90 02 3e a5 fd cb 47 5e 20 a9 21 b6]
- 0x028f61: [3e f3 18 a1 fd cb 47 5e 3e 08 20 02]
- 0x028f75: [90 02 3e a6 fd cb 47 5e 20 87 21 db]
- 0x028fa5: [cd 61 8f 02 fd cb 47 5e 20 04 cd 85]
- 0x028fb5: [21 c1 8d 02 fd cb 47 5e 20 06 3e 0a]
- 0x028fcb: [24 d0 3e 0f fd cb 47 5e 28 02 3e 01]
- 0x029656: [93 02 3e 02 fd cb 47 5e 20 01 3d cd]
- 0x029661: [cd e0 93 02 fd cb 47 5e 20 32 21 55]
- 0x0296e1: [32 f8 05 d0 fd cb 47 5e 20 06 cd e2]
- 0x029711: [cd 6c 97 02 fd cb 47 5e 20 06 cd 15]
- 0x029758: [21 80 00 d0 fd cb 47 5e c0 cd 6c 97]
- 0x08bf48: [01 1f 00 00 fd cb 47 5e 28 04 01 60]

### SET 3,(IY+0x47)
- 0x029c8f: [fd cb 47 ce fd cb 47 de cd e8 d3 0b]
- 0x029ccc: [fd cb 47 ce fd cb 47 de cd 2f 98 02]

### RES 3,(IY+0x47)
- 0x0296d4: [fd cb 47 8e fd cb 47 9e fd cb 47 96]
- 0x029cbf: [fd cb 47 8e fd cb 47 9e fd cb 1b ae]

### LD A,(IY+0x4A)
- 0x09ec43: [21 2f ef 09 fd 7e 4a f5 fd cb 4a]

### LD A,(IY+0x47)
- 0x034ded: [28 28 dd 27 fd 7e 47 17 ed 62 68]
- 0x034ea2: [28 28 dd 27 fd 7e 47 17 ed 62 68]

### LD (IY+0x4A),A
- 0x09ec50: [ac 1c 0a f1 fd 77 4a 21 00 00 00]

## Part 2: ti84pceg.inc Cross-Reference

### IY+0x4A = grFlags / putMapFlags
- bit 0: drawGrLbls (1 = don't draw graph labels)
- bit 3: usePixelShadow2 (1 = use pixelShadow2)
- bit 4: putMapUseColor (1 = use custom color)

### IY+0x47 = UNDOCUMENTED
- Not defined in ti84pceg.inc
- Falls between backlightFlags (IY+0x46) and no named offset
- bit 7 set by MEM_INIT to 0x80

## Part 3: ParseInp Comparison

| Metric | Run A (default) | Run B (cleared) |
|--------|----------------|-----------------|
| Steps | 919 | 919 |
| OP1 | 00 80 50 00 00 00 00 00 00 | 00 80 50 00 00 00 00 00 00 |
| OP1 value | 5 | 5 |
| errNo | 0x8d | 0x8d |
| termination | return_hit | return_hit |
| IY+0x4A after | 0x10 | 0x00 |
| IY+0x47 after | 0x80 | 0x00 |

## Conclusions

1. **IY+0x4A bit 4 = putMapUseColor**: Controls whether the PutMap routine uses a custom color for character rendering. This is a display-layer flag, not a parser/arithmetic flag. MEM_INIT enables it by default (0x10).

2. **IY+0x47 bit 7 = undocumented**: Not present in the SDK include file. Likely an internal OS flag. MEM_INIT sets it to 0x80.

3. **Neither flag affects ParseInp**: Expression parsing and arithmetic produce identical results whether these flags are set or cleared.
