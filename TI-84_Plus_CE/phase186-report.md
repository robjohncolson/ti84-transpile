# Phase 186 Report — Font Record Pointer / VRAM Writer Investigation

Generated: 2026-04-15T05:09:54.690Z

## Console Output

```
=== Phase 186 — Font Record Pointer / VRAM Writer Investigation ===
Date: 2026-04-15T05:09:52.170Z

System booted. D00585 after init: 0x00 0x00 0x00 0x00 0x00 0x00

========================================
PART A — Trace VRAM writes during stage 3
========================================
Display buffer seeded: "ABCDE"
Display buffer bytes: 0x41 0x42 0x43 0x44 0x45 0x00 0x00 0x00 0x00 0x00
Mode buffer seeded: "Normal Float Radian       "
Stage 3 result: steps=24412 term=halt lastPc=0x0019b5
Total VRAM writes: 163584
VRAM writes in text strip rows 30-55: 26624

VRAM writes grouped by character position (stride 12):
  char[0]: 944 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a1939, 0x0a19d7, 0x005b96
  char[1]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[2]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[3]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[4]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[5]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[6]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[7]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[8]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96
  char[9]: 1008 writes, rows 30-55, uniqueValues=2 (0xff 0x00), PCs: 0x0a19d7, 0x0a1939, 0x005b96

Pixel patterns per character (first 5 chars):
  char[0] 'A': pixels=312 fg=0 uniquePixelVals=1 (0xffff)
  char[1] 'B': pixels=312 fg=0 uniquePixelVals=1 (0xffff)
  char[2] 'C': pixels=312 fg=0 uniquePixelVals=1 (0xffff)
  char[3] 'D': pixels=312 fg=0 uniquePixelVals=1 (0xffff)
  char[4] 'E': pixels=312 fg=0 uniquePixelVals=1 (0xffff)

Pairwise pattern comparison (first 5 chars):
  char[0] vs char[1]: DIFFERENT
  char[0] vs char[2]: DIFFERENT
  char[0] vs char[3]: DIFFERENT
  char[0] vs char[4]: DIFFERENT
  char[1] vs char[2]: DIFFERENT
  char[1] vs char[3]: DIFFERENT
  char[1] vs char[4]: DIFFERENT
  char[2] vs char[3]: DIFFERENT
  char[2] vs char[4]: DIFFERENT
  char[3] vs char[4]: DIFFERENT

First 30 VRAM writes (raw):
  step=37 pc=0x0a1939 row=37 col=2 val=0xff hi=false
  step=37 pc=0x0a1939 row=37 col=2 val=0xff hi=true
  step=37 pc=0x0a1939 row=37 col=3 val=0xff hi=false
  step=37 pc=0x0a1939 row=37 col=3 val=0xff hi=true
  step=37 pc=0x0a1939 row=37 col=4 val=0xff hi=false
  step=37 pc=0x0a1939 row=37 col=4 val=0xff hi=true
  step=37 pc=0x0a1939 row=37 col=5 val=0xff hi=false
  step=37 pc=0x0a1939 row=37 col=5 val=0xff hi=true
  step=37 pc=0x0a1939 row=37 col=6 val=0xff hi=false
  step=37 pc=0x0a1939 row=37 col=6 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=7 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=7 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=8 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=8 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=9 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=9 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=10 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=10 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=11 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=11 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=12 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=12 val=0xff hi=true
  step=42 pc=0x0a19d7 row=37 col=13 val=0xff hi=false
  step=42 pc=0x0a19d7 row=37 col=13 val=0xff hi=true
  step=50 pc=0x0a1939 row=38 col=2 val=0xff hi=false
  step=50 pc=0x0a1939 row=38 col=2 val=0xff hi=true
  step=50 pc=0x0a1939 row=38 col=3 val=0xff hi=false
  step=50 pc=0x0a1939 row=38 col=3 val=0xff hi=true
  step=50 pc=0x0a1939 row=38 col=4 val=0xff hi=false
  step=50 pc=0x0a1939 row=38 col=4 val=0xff hi=true

Fg pixels in text strip after stage 3: 0

========================================
PART B — Trace D00585 reads during rendering
========================================
D00585-D0058A before stage 3: 0x00 0x00 0x00 0x00 0x00 0x00
Stage 3 result: steps=35949 term=halt lastPc=0x0019b5
Reads from D00585-D00587: 3
Font pointer reads detected!
  step=19102 pc=0x001881 addr=0xd00585 offset=0 value=0x00
  step=19102 pc=0x001881 addr=0xd00586 offset=1 value=0x00
  step=19102 pc=0x001881 addr=0xd00587 offset=2 value=0x00
Unique PCs reading D00585: 0x001881
Reads from D00588-D0058A: 3
  step=19102 pc=0x001881 addr=0xd00588 value=0x00
  step=19102 pc=0x001881 addr=0xd00589 value=0x00
  step=19102 pc=0x001881 addr=0xd0058a value=0x00

========================================
PART C — Trace glyph buffer writes at D005A1
========================================
Glyph buffer zeroed: 0xd005a1-0xd005bc
Display buffer: 0x41 0x42 0x43 0x44 0x45 0x00 0x00 0x00 0x00 0x00
Stage 3 result: steps=35949 term=halt lastPc=0x0019b5
Total glyph buffer writes: 808
Glyph buffer fill rounds: 27
  round[0]: step=19 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x38 0xe0 0x78 0xf0 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xf8 0xf8 0xf8 0xf8 0xc0 0x18 0xc0 0x18 0xc0 0x18
  round[1]: step=723 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0xf8 0xc0 0xf8 0xe0 0xc0 0x70 0xc0 0x30 0xc0 0x30 0xc0 0x70 0xf8 0xe0 0xf8 0xf0 0xc0 0x38 0xc0 0x18 0xc0 0x18 0xc0 0x38
  round[2]: step=1421 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x18 0xe0 0x38 0xf0 0x70 0x38 0x60 0x18 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xc0 0x00 0x60 0x18 0x70 0x38
  round[3]: step=2119 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0xf8 0xc0 0xf8 0xe0 0xc0 0x70 0xc0 0x30 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x18 0xc0 0x30 0xc0 0x70
  round[4]: step=2821 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0xf8 0xf8 0xf8 0xf8 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xf8 0xe0 0xf8 0xe0 0xc0 0x00 0xc0 0x00 0xc0 0x00 0xc0 0x00
  round[5]: step=3502 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0x00 0x00 0x00 0x00
  round[6]: step=4175 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0x00 0x00 0x00 0x00
  round[7]: step=4848 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0x00 0x00 0x00 0x00
  round[8]: step=5521 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0x00 0x00 0x00 0x00
  round[9]: step=6194 pc=0x07bf61 writes=30 PCs: 0x07bf61
    bytes: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0xf8 0x80 0x00 0x00 0x00 0x00

Round-by-round bitmap comparison:
  round[0] vs round[1]: DIFFERENT
  round[0] vs round[2]: DIFFERENT
  round[0] vs round[3]: DIFFERENT
  round[0] vs round[4]: DIFFERENT
  round[0] vs round[5]: DIFFERENT
  round[0] vs round[6]: DIFFERENT
  round[0] vs round[7]: DIFFERENT
  round[0] vs round[8]: DIFFERENT
  round[0] vs round[9]: DIFFERENT
  round[0] vs round[10]: DIFFERENT
  round[0] vs round[11]: DIFFERENT
  round[0] vs round[12]: DIFFERENT
  round[0] vs round[13]: DIFFERENT
  round[0] vs round[14]: DIFFERENT
  round[0] vs round[15]: DIFFERENT
  round[0] vs round[16]: DIFFERENT
  round[0] vs round[17]: DIFFERENT
  round[0] vs round[18]: DIFFERENT
  round[0] vs round[19]: DIFFERENT
  round[0] vs round[20]: DIFFERENT
  round[0] vs round[21]: DIFFERENT
  round[0] vs round[22]: DIFFERENT
  round[0] vs round[23]: DIFFERENT
  round[0] vs round[24]: DIFFERENT
  round[0] vs round[25]: DIFFERENT
  round[0] vs round[26]: DIFFERENT
  round[1] vs round[2]: DIFFERENT
  round[1] vs round[3]: DIFFERENT
  round[1] vs round[4]: DIFFERENT
  round[1] vs round[5]: DIFFERENT
  round[1] vs round[6]: DIFFERENT
  round[1] vs round[7]: DIFFERENT
  round[1] vs round[8]: DIFFERENT
  round[1] vs round[9]: DIFFERENT
  round[1] vs round[10]: DIFFERENT
  round[1] vs round[11]: DIFFERENT
  round[1] vs round[12]: DIFFERENT
  round[1] vs round[13]: DIFFERENT
  round[1] vs round[14]: DIFFERENT
  round[1] vs round[15]: DIFFERENT
  round[1] vs round[16]: DIFFERENT
  round[1] vs round[17]: DIFFERENT
  round[1] vs round[18]: DIFFERENT
  round[1] vs round[19]: DIFFERENT
  round[1] vs round[20]: DIFFERENT
  round[1] vs round[21]: DIFFERENT
  round[1] vs round[22]: DIFFERENT
  round[1] vs round[23]: DIFFERENT
  round[1] vs round[24]: DIFFERENT
  round[1] vs round[25]: DIFFERENT
  round[1] vs round[26]: DIFFERENT
  round[2] vs round[3]: DIFFERENT
  round[2] vs round[4]: DIFFERENT
  round[2] vs round[5]: DIFFERENT
  round[2] vs round[6]: DIFFERENT
  round[2] vs round[7]: DIFFERENT
  round[2] vs round[8]: DIFFERENT
  round[2] vs round[9]: DIFFERENT
  round[2] vs round[10]: DIFFERENT
  round[2] vs round[11]: DIFFERENT
  round[2] vs round[12]: DIFFERENT
  round[2] vs round[13]: DIFFERENT
  round[2] vs round[14]: DIFFERENT
  round[2] vs round[15]: DIFFERENT
  round[2] vs round[16]: DIFFERENT
  round[2] vs round[17]: DIFFERENT
  round[2] vs round[18]: DIFFERENT
  round[2] vs round[19]: DIFFERENT
  round[2] vs round[20]: DIFFERENT
  round[2] vs round[21]: DIFFERENT
  round[2] vs round[22]: DIFFERENT
  round[2] vs round[23]: DIFFERENT
  round[2] vs round[24]: DIFFERENT
  round[2] vs round[25]: DIFFERENT
  round[2] vs round[26]: DIFFERENT
  round[3] vs round[4]: DIFFERENT
  round[3] vs round[5]: DIFFERENT
  round[3] vs round[6]: DIFFERENT
  round[3] vs round[7]: DIFFERENT
  round[3] vs round[8]: DIFFERENT
  round[3] vs round[9]: DIFFERENT
  round[3] vs round[10]: DIFFERENT
  round[3] vs round[11]: DIFFERENT
  round[3] vs round[12]: DIFFERENT
  round[3] vs round[13]: DIFFERENT
  round[3] vs round[14]: DIFFERENT
  round[3] vs round[15]: DIFFERENT
  round[3] vs round[16]: DIFFERENT
  round[3] vs round[17]: DIFFERENT
  round[3] vs round[18]: DIFFERENT
  round[3] vs round[19]: DIFFERENT
  round[3] vs round[20]: DIFFERENT
  round[3] vs round[21]: DIFFERENT
  round[3] vs round[22]: DIFFERENT
  round[3] vs round[23]: DIFFERENT
  round[3] vs round[24]: DIFFERENT
  round[3] vs round[25]: DIFFERENT
  round[3] vs round[26]: DIFFERENT
  round[4] vs round[5]: DIFFERENT
  round[4] vs round[6]: DIFFERENT
  round[4] vs round[7]: DIFFERENT
  round[4] vs round[8]: DIFFERENT
  round[4] vs round[9]: DIFFERENT
  round[4] vs round[10]: DIFFERENT
  round[4] vs round[11]: DIFFERENT
  round[4] vs round[12]: DIFFERENT
  round[4] vs round[13]: DIFFERENT
  round[4] vs round[14]: DIFFERENT
  round[4] vs round[15]: DIFFERENT
  round[4] vs round[16]: DIFFERENT
  round[4] vs round[17]: DIFFERENT
  round[4] vs round[18]: DIFFERENT
  round[4] vs round[19]: DIFFERENT
  round[4] vs round[20]: DIFFERENT
  round[4] vs round[21]: DIFFERENT
  round[4] vs round[22]: DIFFERENT
  round[4] vs round[23]: DIFFERENT
  round[4] vs round[24]: DIFFERENT
  round[4] vs round[25]: DIFFERENT
  round[4] vs round[26]: DIFFERENT
  round[5] vs round[6]: IDENTICAL
  round[5] vs round[7]: IDENTICAL
  round[5] vs round[8]: IDENTICAL
  round[5] vs round[9]: IDENTICAL
  round[5] vs round[10]: IDENTICAL
  round[5] vs round[11]: IDENTICAL
  round[5] vs round[12]: IDENTICAL
  round[5] vs round[13]: IDENTICAL
  round[5] vs round[14]: IDENTICAL
  round[5] vs round[15]: IDENTICAL
  round[5] vs round[16]: IDENTICAL
  round[5] vs round[17]: IDENTICAL
  round[5] vs round[18]: IDENTICAL
  round[5] vs round[19]: IDENTICAL
  round[5] vs round[20]: IDENTICAL
  round[5] vs round[21]: IDENTICAL
  round[5] vs round[22]: IDENTICAL
  round[5] vs round[23]: IDENTICAL
  round[5] vs round[24]: IDENTICAL
  round[5] vs round[25]: IDENTICAL
  round[5] vs round[26]: DIFFERENT
  round[6] vs round[7]: IDENTICAL
  round[6] vs round[8]: IDENTICAL
  round[6] vs round[9]: IDENTICAL
  round[6] vs round[10]: IDENTICAL
  round[6] vs round[11]: IDENTICAL
  round[6] vs round[12]: IDENTICAL
  round[6] vs round[13]: IDENTICAL
  round[6] vs round[14]: IDENTICAL
  round[6] vs round[15]: IDENTICAL
  round[6] vs round[16]: IDENTICAL
  round[6] vs round[17]: IDENTICAL
  round[6] vs round[18]: IDENTICAL
  round[6] vs round[19]: IDENTICAL
  round[6] vs round[20]: IDENTICAL
  round[6] vs round[21]: IDENTICAL
  round[6] vs round[22]: IDENTICAL
  round[6] vs round[23]: IDENTICAL
  round[6] vs round[24]: IDENTICAL
  round[6] vs round[25]: IDENTICAL
  round[6] vs round[26]: DIFFERENT
  round[7] vs round[8]: IDENTICAL
  round[7] vs round[9]: IDENTICAL
  round[7] vs round[10]: IDENTICAL
  round[7] vs round[11]: IDENTICAL
  round[7] vs round[12]: IDENTICAL
  round[7] vs round[13]: IDENTICAL
  round[7] vs round[14]: IDENTICAL
  round[7] vs round[15]: IDENTICAL
  round[7] vs round[16]: IDENTICAL
  round[7] vs round[17]: IDENTICAL
  round[7] vs round[18]: IDENTICAL
  round[7] vs round[19]: IDENTICAL
  round[7] vs round[20]: IDENTICAL
  round[7] vs round[21]: IDENTICAL
  round[7] vs round[22]: IDENTICAL
  round[7] vs round[23]: IDENTICAL
  round[7] vs round[24]: IDENTICAL
  round[7] vs round[25]: IDENTICAL
  round[7] vs round[26]: DIFFERENT
  round[8] vs round[9]: IDENTICAL
  round[8] vs round[10]: IDENTICAL
  round[8] vs round[11]: IDENTICAL
  round[8] vs round[12]: IDENTICAL
  round[8] vs round[13]: IDENTICAL
  round[8] vs round[14]: IDENTICAL
  round[8] vs round[15]: IDENTICAL
  round[8] vs round[16]: IDENTICAL
  round[8] vs round[17]: IDENTICAL
  round[8] vs round[18]: IDENTICAL
  round[8] vs round[19]: IDENTICAL
  round[8] vs round[20]: IDENTICAL
  round[8] vs round[21]: IDENTICAL
  round[8] vs round[22]: IDENTICAL
  round[8] vs round[23]: IDENTICAL
  round[8] vs round[24]: IDENTICAL
  round[8] vs round[25]: IDENTICAL
  round[8] vs round[26]: DIFFERENT
  round[9] vs round[10]: IDENTICAL
  round[9] vs round[11]: IDENTICAL
  round[9] vs round[12]: IDENTICAL
  round[9] vs round[13]: IDENTICAL
  round[9] vs round[14]: IDENTICAL
  round[9] vs round[15]: IDENTICAL
  round[9] vs round[16]: IDENTICAL
  round[9] vs round[17]: IDENTICAL
  round[9] vs round[18]: IDENTICAL
  round[9] vs round[19]: IDENTICAL
  round[9] vs round[20]: IDENTICAL
  round[9] vs round[21]: IDENTICAL
  round[9] vs round[22]: IDENTICAL
  round[9] vs round[23]: IDENTICAL
  round[9] vs round[24]: IDENTICAL
  round[9] vs round[25]: IDENTICAL
  round[9] vs round[26]: DIFFERENT
  round[10] vs round[11]: IDENTICAL
  round[10] vs round[12]: IDENTICAL
  round[10] vs round[13]: IDENTICAL
  round[10] vs round[14]: IDENTICAL
  round[10] vs round[15]: IDENTICAL
  round[10] vs round[16]: IDENTICAL
  round[10] vs round[17]: IDENTICAL
  round[10] vs round[18]: IDENTICAL
  round[10] vs round[19]: IDENTICAL
  round[10] vs round[20]: IDENTICAL
  round[10] vs round[21]: IDENTICAL
  round[10] vs round[22]: IDENTICAL
  round[10] vs round[23]: IDENTICAL
  round[10] vs round[24]: IDENTICAL
  round[10] vs round[25]: IDENTICAL
  round[10] vs round[26]: DIFFERENT
  round[11] vs round[12]: IDENTICAL
  round[11] vs round[13]: IDENTICAL
  round[11] vs round[14]: IDENTICAL
  round[11] vs round[15]: IDENTICAL
  round[11] vs round[16]: IDENTICAL
  round[11] vs round[17]: IDENTICAL
  round[11] vs round[18]: IDENTICAL
  round[11] vs round[19]: IDENTICAL
  round[11] vs round[20]: IDENTICAL
  round[11] vs round[21]: IDENTICAL
  round[11] vs round[22]: IDENTICAL
  round[11] vs round[23]: IDENTICAL
  round[11] vs round[24]: IDENTICAL
  round[11] vs round[25]: IDENTICAL
  round[11] vs round[26]: DIFFERENT
  round[12] vs round[13]: IDENTICAL
  round[12] vs round[14]: IDENTICAL
  round[12] vs round[15]: IDENTICAL
  round[12] vs round[16]: IDENTICAL
  round[12] vs round[17]: IDENTICAL
  round[12] vs round[18]: IDENTICAL
  round[12] vs round[19]: IDENTICAL
  round[12] vs round[20]: IDENTICAL
  round[12] vs round[21]: IDENTICAL
  round[12] vs round[22]: IDENTICAL
  round[12] vs round[23]: IDENTICAL
  round[12] vs round[24]: IDENTICAL
  round[12] vs round[25]: IDENTICAL
  round[12] vs round[26]: DIFFERENT
  round[13] vs round[14]: IDENTICAL
  round[13] vs round[15]: IDENTICAL
  round[13] vs round[16]: IDENTICAL
  round[13] vs round[17]: IDENTICAL
  round[13] vs round[18]: IDENTICAL
  round[13] vs round[19]: IDENTICAL
  round[13] vs round[20]: IDENTICAL
  round[13] vs round[21]: IDENTICAL
  round[13] vs round[22]: IDENTICAL
  round[13] vs round[23]: IDENTICAL
  round[13] vs round[24]: IDENTICAL
  round[13] vs round[25]: IDENTICAL
  round[13] vs round[26]: DIFFERENT
  round[14] vs round[15]: IDENTICAL
  round[14] vs round[16]: IDENTICAL
  round[14] vs round[17]: IDENTICAL
  round[14] vs round[18]: IDENTICAL
  round[14] vs round[19]: IDENTICAL
  round[14] vs round[20]: IDENTICAL
  round[14] vs round[21]: IDENTICAL
  round[14] vs round[22]: IDENTICAL
  round[14] vs round[23]: IDENTICAL
  round[14] vs round[24]: IDENTICAL
  round[14] vs round[25]: IDENTICAL
  round[14] vs round[26]: DIFFERENT
  round[15] vs round[16]: IDENTICAL
  round[15] vs round[17]: IDENTICAL
  round[15] vs round[18]: IDENTICAL
  round[15] vs round[19]: IDENTICAL
  round[15] vs round[20]: IDENTICAL
  round[15] vs round[21]: IDENTICAL
  round[15] vs round[22]: IDENTICAL
  round[15] vs round[23]: IDENTICAL
  round[15] vs round[24]: IDENTICAL
  round[15] vs round[25]: IDENTICAL
  round[15] vs round[26]: DIFFERENT
  round[16] vs round[17]: IDENTICAL
  round[16] vs round[18]: IDENTICAL
  round[16] vs round[19]: IDENTICAL
  round[16] vs round[20]: IDENTICAL
  round[16] vs round[21]: IDENTICAL
  round[16] vs round[22]: IDENTICAL
  round[16] vs round[23]: IDENTICAL
  round[16] vs round[24]: IDENTICAL
  round[16] vs round[25]: IDENTICAL
  round[16] vs round[26]: DIFFERENT
  round[17] vs round[18]: IDENTICAL
  round[17] vs round[19]: IDENTICAL
  round[17] vs round[20]: IDENTICAL
  round[17] vs round[21]: IDENTICAL
  round[17] vs round[22]: IDENTICAL
  round[17] vs round[23]: IDENTICAL
  round[17] vs round[24]: IDENTICAL
  round[17] vs round[25]: IDENTICAL
  round[17] vs round[26]: DIFFERENT
  round[18] vs round[19]: IDENTICAL
  round[18] vs round[20]: IDENTICAL
  round[18] vs round[21]: IDENTICAL
  round[18] vs round[22]: IDENTICAL
  round[18] vs round[23]: IDENTICAL
  round[18] vs round[24]: IDENTICAL
  round[18] vs round[25]: IDENTICAL
  round[18] vs round[26]: DIFFERENT
  round[19] vs round[20]: IDENTICAL
  round[19] vs round[21]: IDENTICAL
  round[19] vs round[22]: IDENTICAL
  round[19] vs round[23]: IDENTICAL
  round[19] vs round[24]: IDENTICAL
  round[19] vs round[25]: IDENTICAL
  round[19] vs round[26]: DIFFERENT
  round[20] vs round[21]: IDENTICAL
  round[20] vs round[22]: IDENTICAL
  round[20] vs round[23]: IDENTICAL
  round[20] vs round[24]: IDENTICAL
  round[20] vs round[25]: IDENTICAL
  round[20] vs round[26]: DIFFERENT
  round[21] vs round[22]: IDENTICAL
  round[21] vs round[23]: IDENTICAL
  round[21] vs round[24]: IDENTICAL
  round[21] vs round[25]: IDENTICAL
  round[21] vs round[26]: DIFFERENT
  round[22] vs round[23]: IDENTICAL
  round[22] vs round[24]: IDENTICAL
  round[22] vs round[25]: IDENTICAL
  round[22] vs round[26]: DIFFERENT
  round[23] vs round[24]: IDENTICAL
  round[23] vs round[25]: IDENTICAL
  round[23] vs round[26]: DIFFERENT
  round[24] vs round[25]: IDENTICAL
  round[24] vs round[26]: DIFFERENT
  round[25] vs round[26]: DIFFERENT

D00585-D0058A after stage 3: 0x00 0x00 0x00 0x00 0x00 0x00
Glyph buffer final: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00

========================================
PART D — Font pointer seeding experiments
========================================

Baseline (no seed):
  D00585-D0058A: 0x00 0x00 0x00 0x00 0x00 0x00
  stage 3: steps=35949 term=halt lastPc=0x0019b5
  text strip fg=0 white=8320 sentinel=0
  total VRAM fg=0

Seed D00585=0x0040EE:
  D00585-D0058A: 0xee 0x40 0x00 0x00 0x00 0x00
  stage 3: steps=35949 term=halt lastPc=0x0019b5
  text strip fg=0 white=8320 sentinel=0
  total VRAM fg=0

Seed D00585=0x0040EE + D00588=0x0040EE:
  D00585-D0058A: 0xee 0x40 0x00 0xee 0x40 0x00
  stage 3: steps=35949 term=halt lastPc=0x0019b5
  text strip fg=0 white=8320 sentinel=0
  total VRAM fg=0

Seed D00585=0x003D6E:
  D00585-D0058A: 0x6e 0x3d 0x00 0x00 0x00 0x00
  stage 3: steps=35949 term=halt lastPc=0x0019b5
  text strip fg=0 white=8320 sentinel=0
  total VRAM fg=0

--- Comparison ---
  Baseline (no seed): textFg=0 totalFg=0
  Seed D00585=0x0040EE: textFg=0 totalFg=0
  Seed D00585=0x0040EE + D00588=0x0040EE: textFg=0 totalFg=0
  Seed D00585=0x003D6E: textFg=0 totalFg=0
  Delta from baseline for "Seed D00585=0x0040EE": 0
  Delta from baseline for "Seed D00585=0x0040EE + D00588=0x0040EE": 0
  Delta from baseline for "Seed D00585=0x003D6E": 0

========================================
SUMMARY
========================================
See detailed output above for each part.
```
