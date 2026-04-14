# Phase 134 — RAM Dispatch Table Initialization Hunt

Generated: 2026-04-14T20:40:36.173Z

## Part 1: Static ROM Scan

### Pattern: 0xD0231A (1A 23 D0)

Found **177** match(es):

| # | Offset | Context |
|---|--------|---------|
| 1 | `0x056900` | `0x0568f0:  d0  2b  eb  2b  ed  b8  c1  e1  36  10  0d  23  20  fa  c9  2a [1a][23][d0] e5  2a  1d  23  d0  e5  1b  ed  53  1a  23  d0  2a  3a  24  d0 ` |
| 2 | `0x05690c` | `0x0568fc:  20  fa  c9  2a  1a  23  d0  e5  2a  1d  23  d0  e5  1b  ed  53 [1a][23][d0] 2a  3a  24  d0  2b  22  1d  23  d0  06  12  cd  59  d4  0a  ed ` |
| 3 | `0x056920` | `0x056910:  3a  24  d0  2b  22  1d  23  d0  06  12  cd  59  d4  0a  ed  4b [1a][23][d0] 03  e1  22  1d  23  d0  e1  22  1a  23  d0  d5  c5  e1  7b  b7 ` |
| 4 | `0x05692b` | `0x05691b:  59  d4  0a  ed  4b  1a  23  d0  03  e1  22  1d  23  d0  e1  22 [1a][23][d0] d5  c5  e1  7b  b7  c4  c3  68  05  c1  78  b7  c8  11  11  00 ` |
| 5 | `0x0569d1` | `0x0569c1:  e5  cd  c8  69  05  e1  c9  cd  5b  d8  08  c3  02  6a  05  2a [1a][23][d0] cd  0d  c9  04  23  23  22  1a  23  d0  d5  cd  ed  69  05  d1 ` |
| 6 | `0x0569db` | `0x0569cb:  08  c3  02  6a  05  2a  1a  23  d0  cd  0d  c9  04  23  23  22 [1a][23][d0] d5  cd  ed  69  05  d1  cd  d7  1a  09  cd  86  0a  09  c9  2a ` |
| 7 | `0x0569ee` | `0x0569de:  d5  cd  ed  69  05  d1  cd  d7  1a  09  cd  86  0a  09  c9  2a [1a][23][d0] ed  5b  17  23  d0  b7  ed  52  eb  cd  e1  1b  09  c3  e3  17 ` |
| 8 | `0x056a14` | `0x056a04:  1b  09  cd  0d  c9  04  d5  cd  0d  c9  04  22  17  23  d0  22 [1a][23][d0] 22  17  23  d0  af  19  2b  22  1d  23  d0  ed  52  d1  19  23 ` |
| 9 | `0x056a28` | `0x056a18:  17  23  d0  af  19  2b  22  1d  23  d0  ed  52  d1  19  23  22 [1a][23][d0] c9  b7  e5  c5  21  3e  6a  05  38  04  01  11  00  00  ed  b1 ` |
| 10 | `0x059445` | `0x059435:  c9  ba  09  d8  fe  d0  20  12  7a  b3  20  19  3e  d0  ed  43 [1a][23][d0] f5  cd  2f  9d  09  f1  c9  fe  d4  20  0f  7a  b3  3e  d4  28 ` |
| 11 | `0x05948d` | `0x05947d:  ba  09  d8  fe  cf  20  b0  13  18  d3  cd  a6  bb  09  ed  43 [1a][23][d0] c8  fe  2a  20  0b  cd  56  b3  05  cd  aa  bb  09  20  e8  c9 ` |
| 12 | `0x0594cc` | `0x0594bc:  da  1a  1d  06  cd  c9  ba  09  38  f6  fe  cf  20  0e  ed  43 [1a][23][d0] cd  2f  9d  09  e1  c3  ed  88  06  cd  61  29  08  cd  4a  b3 ` |
| 13 | `0x05955c` | `0x05954c:  06  d0  c9  3e  02  18  db  cd  2f  9d  09  2a  1d  23  d0  22 [1a][23][d0] c9  cd  2f  9d  09  21  0b  15  d0  22  08  15  d0  21  00  00 ` |
| 14 | `0x05959b` | `0x05958b:  f6  ff  ff  19  22  93  25  d0  c9  cd  a6  bb  09  c8  ed  43 [1a][23][d0] fe  11  20  05  cd  a6  bb  09  c8  c3  1a  1d  06  af  18  02 ` |
| 15 | `0x0595bb` | `0x0595ab:  af  18  02  3e  01  f5  cd  ab  ba  09  cd  03  bb  09  ed  43 [1a][23][d0] cd  d5  b9  09  cd  50  2c  08  ed  53  f9  1f  d0  e6  3f  cd ` |
| 16 | `0x0595e0` | `0x0595d0:  08  c2  22  1d  06  cd  54  f9  07  cd  4b  d4  0a  0b  ed  43 [1a][23][d0] b7  cd  f3  b9  09  cd  94  95  05  cd  ab  ba  09  38  b5  cd ` |
| 17 | `0x05974e` | `0x05973e:  08  cd  68  f9  07  3e  03  e1  e9  fe  10  f5  20  05  ed  43 [1a][23][d0] af  32  49  1d  d0  cd  a6  bb  09  28  51  fe  5e  28  18  fe ` |
| 18 | `0x05983d` | `0x05982d:  f8  05  d0  cd  a6  bb  09  28  e0  fe  10  f5  20  09  ed  43 [1a][23][d0] cd  a6  bb  09  cd  53  d4  0a  38  16  cd  ed  b9  09  cd  4a ` |
| 19 | `0x059870` | `0x059860:  cd  54  f9  07  cd  e4  98  05  cd  a6  bb  09  28  23  ed  43 [1a][23][d0] fe  11  28  0e  cd  0b  c7  09  c2  1a  1d  06  22  1a  23  d0 ` |
| 20 | `0x059880` | `0x059870:  1a  23  d0  fe  11  28  0e  cd  0b  c7  09  c2  1a  1d  06  22 [1a][23][d0] 18  0c  f1  f5  20  ee  cd  a6  bb  09  c2  77  98  05  f1  3a ` |
| 21 | `0x05998a` | `0x05997a:  ca  2c  1d  06  40  2a  96  25  e5  fe  10  f5  20  05  ed  43 [1a][23][d0] cd  52  1f  0a  cd  e4  98  05  cd  ef  99  05  cd  af  32  0a ` |
| 22 | `0x0599f6` | `0x0599e6:  e1  c3  bf  ab  05  cd  e2  b9  09  cd  ff  9f  05  c8  ed  43 [1a][23][d0] fe  2b  20  07  cd  ff  9f  05  c0  18  0f  fe  11  20  0b  e1 ` |
| 23 | `0x059ae3` | `0x059ad3:  cd  a6  bb  09  ca  2c  1d  06  fe  2b  c2  1a  1d  06  ed  43 [1a][23][d0] cd  a6  bb  09  28  eb  11  63  00  00  cd  b7  9b  05  c1  51 ` |
| 24 | `0x059b05` | `0x059af5:  51  d5  cd  a6  bb  09  28  0f  fe  11  c2  1a  1d  06  ed  43 [1a][23][d0] cd  36  9c  05  cd  8e  9b  05  d1  7c  ba  da  36  1d  06  7d ` |
| 25 | `0x059b3e` | `0x059b2e:  ab  05  cd  a6  bb  09  28  0f  fe  11  c2  1a  1d  06  ed  43 [1a][23][d0] cd  36  9c  05  cd  8e  9b  05  d1  b7  52  ed  52  da  36  1d ` |
| 26 | `0x059be1` | `0x059bd1:  c2  bb  04  cd  a6  bb  09  c8  fe  2b  c2  99  95  05  ed  43 [1a][23][d0] cd  a6  bb  09  ca  2c  1d  06  40  2a  96  25  e5  cd  61  29 ` |
| 27 | `0x059c43` | `0x059c33:  94  95  05  cd  a6  bb  09  c8  fe  2b  c2  99  95  05  ed  43 [1a][23][d0] cd  a6  bb  09  ca  2c  1d  06  40  2a  96  25  e5  cd  61  29 ` |
| 28 | `0x059c97` | `0x059c87:  ee  9f  05  ca  2d  9d  05  cd  53  d4  0a  30  1e  0b  ed  43 [1a][23][d0] cd  f8  b9  09  cd  61  29  08  cd  4a  b3  05  cd  46  a5  09 ` |
| 29 | `0x059cb6` | `0x059ca6:  cd  46  a5  09  cd  fa  ce  09  c3  80  a1  05  c5  0b  ed  43 [1a][23][d0] cd  f8  b9  09  cd  61  29  08  c1  ed  43  1a  23  d0  bf  cd ` |
| 30 | `0x059cc4` | `0x059cb4:  ed  43  1a  23  d0  cd  f8  b9  09  cd  61  29  08  c1  ed  43 [1a][23][d0] bf  cd  d0  b4  05  40  22  96  25  cd  a6  bb  09  c2  1a  1d ` |
| 31 | `0x059d91` | `0x059d81:  09  e1  6f  e5  cd  2f  9d  09  e1  c9  cd  62  9d  05  eb  2a [1a][23][d0] e5  2a  17  23  d0  2b  22  1a  23  d0  d5  18  26  d5  cd  af ` |
| 32 | `0x059d9b` | `0x059d8b:  cd  62  9d  05  eb  2a  1a  23  d0  e5  2a  17  23  d0  2b  22 [1a][23][d0] d5  18  26  d5  cd  af  ba  09  b7  28  36  fe  3f  28  1a  fe ` |
| 33 | `0x059de2` | `0x059dd2:  05  d1  cd  79  c9  04  20  c7  d1  c3  bf  ab  05  f1  e1  22 [1a][23][d0] 3e  14  c3  b2  1d  06  cd  2f  9d  09  cd  51  da  05  c3  bf ` |
| 34 | `0x059ffb` | `0x059feb:  f4  06  c9  cd  a6  bb  09  c8  fe  29  c0  cd  0b  c7  09  22 [1a][23][d0] c9  cd  a6  bb  09  c8  fe  29  c0  2a  1a  23  d0  e5  c5  cd ` |
| 35 | `0x05a008` | `0x059ff8:  c7  09  22  1a  23  d0  c9  cd  a6  bb  09  c8  fe  29  c0  2a [1a][23][d0] e5  c5  cd  0b  c7  09  c1  e1  22  1a  23  d0  c9  cd  af  ba ` |
| 36 | `0x05a014` | `0x05a004:  fe  29  c0  2a  1a  23  d0  e5  c5  cd  0b  c7  09  c1  e1  22 [1a][23][d0] c9  cd  af  ba  09  0b  c5  cd  53  d4  0a  38  13  ed  43  1a ` |
| 37 | `0x05a026` | `0x05a016:  d0  c9  cd  af  ba  09  0b  c5  cd  53  d4  0a  38  13  ed  43 [1a][23][d0] cd  af  ba  09  fe  62  ca  28  1d  06  fe  72  28  f8  e1  22 ` |
| 38 | `0x05a039` | `0x05a029:  cd  af  ba  09  fe  62  ca  28  1d  06  fe  72  28  f8  e1  22 [1a][23][d0] 06  0b  18  1e  06  12  18  1a  06  11  18  16  06  13  18  12 ` |
| 39 | `0x05a0e5` | `0x05a0d5:  05  06  22  18  84  06  23  18  d7  06  01  cd  8a  a0  05  2a [1a][23][d0] 23  22  1a  23  d0  16  2b  cd  c9  af  09  cd  e2  b9  09  18 ` |
| 40 | `0x05a0ea` | `0x05a0da:  06  23  18  d7  06  01  cd  8a  a0  05  2a  1a  23  d0  23  22 [1a][23][d0] 16  2b  cd  c9  af  09  cd  e2  b9  09  18  99  40  2a  96  25 ` |
| 41 | `0x05a6f0` | `0x05a6e0:  04  c3  e1  a5  05  21  05  00  00  19  fe  31  20  07  ed  43 [1a][23][d0] 18  0e  e5  cd  cb  a1  05  d1  21  fa  05  d0  cd  80  f9  07 ` |
| 42 | `0x05ad15` | `0x05ad05:  ef  00  cd  79  c9  04  c2  0f  ae  05  c1  e1  e5  c5  23  22 [1a][23][d0] 09  2b  22  1d  23  d0  11  08  00  00  cd  e5  cb  06  d2  15 ` |
| 43 | `0x05ad32` | `0x05ad22:  cd  e5  cb  06  d2  15  ae  05  18  15  c1  e1  e5  c5  23  22 [1a][23][d0] 11  2b  00  00  cd  e5  cb  06  d2  15  ae  05  11  06  00  00 ` |
| 44 | `0x05ad59` | `0x05ad49:  d2  15  ae  05  cd  e1  db  08  0e  01  cd  55  d4  0a  ed  43 [1a][23][d0] fd  cb  2d  4e  28  02  0b  23  cd  1e  ae  05  c2  15  ae  05 ` |
| 45 | `0x05ada2` | `0x05ad92:  e5  cb  06  30  7e  11  06  00  00  cd  e5  cb  06  30  74  2a [1a][23][d0] 23  22  1a  23  d0  cd  e1  db  08  0e  01  cd  55  d4  0a  ed ` |
| 46 | `0x05ada7` | `0x05ad97:  11  06  00  00  cd  e5  cb  06  30  74  2a  1a  23  d0  23  22 [1a][23][d0] cd  e1  db  08  0e  01  cd  55  d4  0a  ed  43  1a  23  d0  fd ` |
| 47 | `0x05adb6` | `0x05ada6:  22  1a  23  d0  cd  e1  db  08  0e  01  cd  55  d4  0a  ed  43 [1a][23][d0] fd  cb  2d  4e  28  02  0b  23  cd  1e  ae  05  20  4e  fd  cb ` |
| 48 | `0x05adcf` | `0x05adbf:  0b  23  cd  1e  ae  05  20  4e  fd  cb  2d  4e  28  01  03  2a [1a][23][d0] eb  e1  b7  52  ed  42  e5  c1  eb  d1  e5  c5  11  07  00  00 ` |
| 49 | `0x05adff` | `0x05adef:  c5  fe  2b  20  04  c3  2c  ad  05  c1  2a  1d  23  d0  ed  5b [1a][23][d0] b7  ed  52  30  04  21  00  00  00  e5  37  18  06  3e  93  cd ` |
| 50 | `0x05af53` | `0x05af43:  13  e1  23  23  c1  ed  b0  cd  14  f9  07  cd  61  29  08  2a [1a][23][d0] e5  2a  1d  23  d0  e5  2a  17  23  d0  e5  cd  93  01  08  13 ` |
| 51 | `0x05af89` | `0x05af79:  28  02  38  1f  e1  22  17  23  d0  e1  22  1d  23  d0  e1  22 [1a][23][d0] dd  f9  dd  e1  cd  02  29  08  cd  46  a5  09  c3  0d  af  05 ` |
| 52 | `0x05afa8` | `0x05af98:  c3  0d  af  05  7e  fe  ef  20  d3  23  7e  fe  98  20  cd  22 [1a][23][d0] 2b  ed  5b  17  23  d0  b7  ed  52  dd  2f  f7  40  2a  96  25 ` |
| 53 | `0x05afd6` | `0x05afc6:  d4  0a  b7  cd  ed  b9  09  cd  af  ba  09  d4  af  ba  09  2a [1a][23][d0] ed  5b  17  23  d0  b7  ed  52  dd  2f  fa  e1  22  17  23  d0 ` |
| 54 | `0x05aff0` | `0x05afe0:  52  dd  2f  fa  e1  22  17  23  d0  e1  22  1d  23  d0  e1  22 [1a][23][d0] dd  e5  cd  61  29  08  cd  f9  9a  09  21  8a  b1  05  cd  ef ` |
| 55 | `0x05b092` | `0x05b082:  eb  dd  27  fd  2b  72  2b  73  d1  21  e6  08  d0  ed  b0  2a [1a][23][d0] e5  2a  1d  23  d0  e5  2a  17  23  d0  e5  cd  dd  b0  05  22 ` |
| 56 | `0x05b0b0` | `0x05b0a0:  cd  dd  b0  05  22  17  23  d0  09  2b  22  1d  23  d0  ed  53 [1a][23][d0] eb  c3  75  af  05  d1  c5  d5  e5  eb  dd  e5  cd  f5  26  08 ` |
| 57 | `0x05b304` | `0x05b2f4:  d0  cd  61  29  08  f1  3c  f5  cd  a6  bb  09  28  0d  ed  43 [1a][23][d0] fe  2b  28  bb  cd  9e  95  05  f1  fe  0a  d2  2c  1d  06  32 ` |
| 58 | `0x05b3ab` | `0x05b39b:  d0  23  77  2b  c3  f8  d1  03  cd  a6  bb  09  28  0c  ed  43 [1a][23][d0] fe  2b  c8  cd  9e  95  05  f1  d1  c3  bf  ab  05  d5  cd  cf ` |
| 59 | `0x05b58f` | `0x05b57f:  d5  cb  4a  28  09  3a  49  1d  d0  bd  ca  2c  1d  06  ed  43 [1a][23][d0] 18  83  cd  94  95  05  c1  c1  c9  2e  14  3e  02  cd  09  b5 ` |
| 60 | `0x05b69d` | `0x05b68d:  09  00  00  19  11  00  00  00  5e  19  23  23  23  e5  c1  2a [1a][23][d0] ed  5b  17  23  d0  b7  ed  52  09  22  1a  23  d0  2a  1d  23 ` |
| 61 | `0x05b6aa` | `0x05b69a:  e5  c1  2a  1a  23  d0  ed  5b  17  23  d0  b7  ed  52  09  22 [1a][23][d0] 2a  1d  23  d0  ed  52  09  22  1d  23  d0  ed  43  17  23  d0 ` |
| 62 | `0x0620fe` | `0x0620ee:  c4  09  c8  cd  cc  f8  07  21  0e  23  d0  cd  fb  f9  07  2a [1a][23][d0] ed  5b  17  23  d0  b7  ed  52  40  22  e3  08  3a  f9  05  d0 ` |
| 63 | `0x0824e7` | `0x0824d7:  17  23  d0  b7  ed  52  d8  c8  19  ed  42  22  17  23  d0  2a [1a][23][d0] b7  ed  42  22  1a  23  d0  2a  1d  23  d0  b7  ed  42  22  1d ` |
| 64 | `0x0824ee` | `0x0824de:  c8  19  ed  42  22  17  23  d0  2a  1a  23  d0  b7  ed  42  22 [1a][23][d0] 2a  1d  23  d0  b7  ed  42  22  1d  23  d0  c9  21  6f  06  d0 ` |
| 65 | `0x08cabd` | `0x08caad:  ca  08  d8  c3  78  19  09  cd  3b  1a  09  2a  e6  10  d0  22 [1a][23][d0] 2a  ec  10  d0  c3  75  0a  09  cd  b4  ca  08  cd  cb  d1  08 ` |
| 66 | `0x08cb6d` | `0x08cb5d:  fe  bf  28  07  0d  20  ef  c3  84  cf  08  21  10  25  d0  22 [1a][23][d0] cd  bd  f7  07  fe  0c  20  5c  cd  4a  fd  07  20  14  2a  1d ` |
| 67 | `0x08cb85` | `0x08cb75:  0c  20  5c  cd  4a  fd  07  20  14  2a  1d  23  d0  23  eb  2a [1a][23][d0] cd  42  ce  08  fe  bf  c2  f8  cc  08  cd  9f  cb  08  d8  2a ` |
| 68 | `0x08cb98` | `0x08cb88:  cd  42  ce  08  fe  bf  c2  f8  cc  08  cd  9f  cb  08  d8  2a [1a][23][d0] c3  d8  cc  08  cd  3a  dd  08  28  2b  38  10  fe  70  28  17 ` |
| 69 | `0x08cbe8` | `0x08cbd8:  fe  1f  28  04  fe  1b  20  37  2a  1d  23  d0  23  e5  eb  2a [1a][23][d0] cd  42  ce  08  ed  5b  1a  23  d0  cd  9d  cf  08  e1  d8  2b ` |
| 70 | `0x08cbf1` | `0x08cbe1:  1d  23  d0  23  e5  eb  2a  1a  23  d0  cd  42  ce  08  ed  5b [1a][23][d0] cd  9d  cf  08  e1  d8  2b  22  1d  23  d0  cd  3a  dd  08  fe ` |
| 71 | `0x08cc0a` | `0x08cbfa:  2b  22  1d  23  d0  cd  3a  dd  08  fe  bf  ca  dc  cc  08  22 [1a][23][d0] cd  eb  1b  09  37  c8  c3  f8  cc  08  22  1a  23  d0  2a  1d ` |
| 72 | `0x08cc18` | `0x08cc08:  08  22  1a  23  d0  cd  eb  1b  09  37  c8  c3  f8  cc  08  22 [1a][23][d0] 2a  1d  23  d0  23  e5  eb  2a  1a  23  d0  cd  42  ce  08  e5 ` |
| 73 | `0x08cc23` | `0x08cc13:  c3  f8  cc  08  22  1a  23  d0  2a  1d  23  d0  23  e5  eb  2a [1a][23][d0] cd  42  ce  08  e5  d5  cd  54  d1  07  d1  e1  20  22  cd  41 ` |
| 74 | `0x08cc6a` | `0x08cc5a:  d0  cd  7d  ce  07  e1  e5  20  01  2b  22  1d  23  d0  ed  5b [1a][23][d0] b7  ed  52  e5  c1  19  03  cd  7b  ce  08  30  03  e1  e1  d8 ` |
| 75 | `0x08ccb5` | `0x08cca5:  01  08  e1  7e  fe  bf  20  37  d1  d5  ed  53  1d  23  d0  22 [1a][23][d0] 23  e5  3e  25  cd  53  cf  08  e1  d1  ed  53  1d  23  d0  d8 ` |
| 76 | `0x08ccca` | `0x08ccba:  3e  25  cd  53  cf  08  e1  d1  ed  53  1d  23  d0  d8  d5  22 [1a][23][d0] cd  6c  d0  08  e1  2b  22  1d  23  d0  c9  fe  bf  20  1c  ed ` |
| 77 | `0x08cce6` | `0x08ccd6:  d0  c9  fe  bf  20  1c  ed  5b  1d  23  d0  d5  18  d5  23  22 [1a][23][d0] cd  b9  ce  08  cd  0c  cd  08  e1  2b  22  1d  23  d0  d8  cd ` |
| 78 | `0x08cd24` | `0x08cd14:  28  ea  fe  1f  28  04  fe  1b  20  10  2a  1d  23  d0  ed  5b [1a][23][d0] cd  9d  cf  08  d8  18  d6  cd  6d  d1  07  20  1d  3e  10  cd ` |
| 79 | `0x08cd5e` | `0x08cd4e:  d8  18  05  cd  58  cd  08  d8  18  ac  2a  1d  23  d0  ed  5b [1a][23][d0] 1a  fe  10  20  01  13  b7  ed  52  e5  c1  19  03  cd  7b  ce ` |
| 80 | `0x08ce74` | `0x08ce64:  00  d0  3a  02  08  d0  cb  a6  b6  77  c9  21  0e  06  d0  22 [1a][23][d0] eb  c5  e1  19  e5  22  1d  23  d0  eb  e5  3e  ef  ed  b1  e1 ` |
| 81 | `0x08ceac` | `0x08ce9c:  ce  08  30  02  e1  c9  01  0a  00  00  3e  ef  ed  b1  23  22 [1a][23][d0] c3  cf  cf  08  cd  c3  ce  08  e1  c9  e5  5f  16  00  cd  eb ` |
| 82 | `0x08cee8` | `0x08ced8:  cd  31  d0  08  d1  d8  d5  e5  3e  27  cd  53  cf  08  e1  22 [1a][23][d0] d1  ed  53  1d  23  d0  d8  cd  0d  d0  08  d8  cd  3a  dd  08 ` |
| 83 | `0x08cf26` | `0x08cf16:  28  1e  fe  11  28  07  fe  ef  28  03  23  18  ed  d1  ed  53 [1a][23][d0] f1  20  02  37  c9  cd  51  d0  08  37  c0  b7  c9  e1  f1  37 ` |
| 84 | `0x08cf49` | `0x08cf39:  c8  cd  31  d0  08  d8  e5  3e  27  cd  53  cf  08  e1  d8  22 [1a][23][d0] cd  0d  d0  08  c9  3e  20  fd  cb  1e  de  cd  dc  d7  08  fd ` |
| 85 | `0x08cf98` | `0x08cf88:  22  3a  24  d0  cd  6c  1c  09  b7  c9  21  0e  06  d0  e5  22 [1a][23][d0] 09  d1  eb  d5  fe  19  20  0a  16  2f  cd  f1  cf  08  30  02 ` |
| 86 | `0x08cfbe` | `0x08cfae:  cd  51  cf  08  38  3a  d1  e1  e5  b7  ed  52  e5  c1  eb  22 [1a][23][d0] 16  2e  cd  f1  cf  08  30  02  e1  c9  22  1a  23  d0  cd  3b ` |
| 87 | `0x08cfcc` | `0x08cfbc:  eb  22  1a  23  d0  16  2e  cd  f1  cf  08  30  02  e1  c9  22 [1a][23][d0] cd  3b  1a  09  11  02  00  00  cd  5a  d3  08  e1  cd  51  d0 ` |
| 88 | `0x08d01c` | `0x08d00c:  c9  ed  5b  1d  23  d0  d5  3e  11  cd  42  d0  08  38  0f  22 [1a][23][d0] e5  cd  3b  1a  09  cd  74  19  09  e1  b7  d1  ed  53  1d  23 ` |
| 89 | `0x08d032` | `0x08d022:  1a  09  cd  74  19  09  e1  b7  d1  ed  53  1d  23  d0  c9  22 [1a][23][d0] 7e  fe  bc  20  06  23  22  1a  23  d0  c9  3e  bc  e5  ed  b1 ` |
| 90 | `0x08d03c` | `0x08d02c:  53  1d  23  d0  c9  22  1a  23  d0  7e  fe  bc  20  06  23  22 [1a][23][d0] c9  3e  bc  e5  ed  b1  d1  e5  2b  cd  51  d0  08  e1  37  c0 ` |
| 91 | `0x08d08b` | `0x08d07b:  08  18  19  2a  1d  23  d0  7e  fe  2c  2b  20  fa  23  ed  5b [1a][23][d0] cd  9d  cf  08  d8  cd  04  cd  08  2a  1a  23  d0  18  0c  3e ` |
| 92 | `0x08d098` | `0x08d088:  23  ed  5b  1a  23  d0  cd  9d  cf  08  d8  cd  04  cd  08  2a [1a][23][d0] 18  0c  3e  11  cd  42  d0  08  38  0f  22  1a  23  d0  e5  cd ` |
| 93 | `0x08d0a6` | `0x08d096:  08  2a  1a  23  d0  18  0c  3e  11  cd  42  d0  08  38  0f  22 [1a][23][d0] e5  cd  3b  1a  09  cd  74  19  09  e1  b7  c9  cd  d4  ca  08 ` |
| 94 | `0x08d164` | `0x08d154:  0d  c9  04  22  e6  10  d0  cd  63  d1  08  b7  e1  d1  c9  22 [1a][23][d0] 22  17  23  d0  af  19  2b  22  1d  23  d0  c9  21  c8  ca  08 ` |
| 95 | `0x08d1df` | `0x08d1cf:  d8  cd  78  19  09  2a  6f  06  d0  fd  cb  2d  46  28  06  2a [1a][23][d0] 2b  2b  cd  0d  c9  04  e5  cd  bd  1b  09  e1  30  08  cd  3b ` |
| 96 | `0x08d2de` | `0x08d2ce:  db  3a  f4  10  d0  fe  23  28  04  fe  22  20  1e  3e  04  2a [1a][23][d0] cd  6a  da  08  ed  43  1a  23  d0  cd  0a  dc  08  38  09  fe ` |
| 97 | `0x08d2e7` | `0x08d2d7:  fe  22  20  1e  3e  04  2a  1a  23  d0  cd  6a  da  08  ed  43 [1a][23][d0] cd  0a  dc  08  38  09  fe  11  20  05  23  22  1a  23  d0  c3 ` |
| 98 | `0x08d2f6` | `0x08d2e6:  43  1a  23  d0  cd  0a  dc  08  38  09  fe  11  20  05  23  22 [1a][23][d0] c3  1a  d7  08  e5  cd  0d  c9  04  eb  b7  52  ed  42  eb  e1 ` |
| 99 | `0x08d74f` | `0x08d73f:  66  c8  40  ed  5b  88  11  cd  79  c9  04  c8  37  c9  ed  5b [1a][23][d0] d5  ed  5b  1d  23  d0  d5  ed  43  1a  23  d0  22  1d  23  d0 ` |
| 100 | `0x08d75b` | `0x08d74b:  37  c9  ed  5b  1a  23  d0  d5  ed  5b  1d  23  d0  d5  ed  43 [1a][23][d0] 22  1d  23  d0  ed  4b  1a  23  d0  2a  1d  23  d0  b7  ed  42 ` |
| 101 | `0x08d764` | `0x08d754:  5b  1d  23  d0  d5  ed  43  1a  23  d0  22  1d  23  d0  ed  4b [1a][23][d0] 2a  1d  23  d0  b7  ed  42  30  03  37  18  4e  c5  3a  f4  10 ` |
| 102 | `0x08d7a4` | `0x08d794:  73  c9  04  20  03  37  18  25  c5  e1  cd  49  dd  08  23  22 [1a][23][d0] 18  b9  2a  1d  23  d0  b7  ed  52  38  0f  20  0b  1a  cd  2c ` |
| 103 | `0x08d7ca` | `0x08d7ba:  de  21  00  00  00  23  b7  c1  ed  43  1d  23  d0  c1  ed  43 [1a][23][d0] c9  f5  5f  16  ef  cd  52  1c  09  cd  e1  dc  08  18  05  f5 ` |
| 104 | `0x08d89b` | `0x08d88b:  78  19  09  f1  f5  fe  06  20  06  f5  cd  67  e3  05  f1  2a [1a][23][d0] e5  cd  6a  da  08  ed  43  e9  10  d0  e1  22  1a  23  d0  fd ` |
| 105 | `0x08d8aa` | `0x08d89a:  2a  1a  23  d0  e5  cd  6a  da  08  ed  43  e9  10  d0  e1  22 [1a][23][d0] fd  cb  2d  4e  28  09  2a  1a  23  d0  23  22  1a  23  d0  cd ` |
| 106 | `0x08d8b4` | `0x08d8a4:  43  e9  10  d0  e1  22  1a  23  d0  fd  cb  2d  4e  28  09  2a [1a][23][d0] 23  22  1a  23  d0  cd  5d  da  08  ca  af  d9  08  cd  f8  dc ` |
| 107 | `0x08d8b9` | `0x08d8a9:  22  1a  23  d0  fd  cb  2d  4e  28  09  2a  1a  23  d0  23  22 [1a][23][d0] cd  5d  da  08  ca  af  d9  08  cd  f8  dc  08  ca  af  d9  08 ` |
| 108 | `0x08d8f1` | `0x08d8e1:  e1  22  e9  10  d0  30  13  fd  cb  20  4e  c2  b2  1d  06  22 [1a][23][d0] f1  cb  8f  f5  af  18  00  fe  2a  28  10  fe  24  28  0c  fe ` |
| 109 | `0x08da38` | `0x08da28:  d8  28  25  fe  05  c8  fe  06  28  10  fe  07  28  13  23  22 [1a][23][d0] d5  cd  f3  10  09  d1  c9  d5  cd  0a  11  09  d1  c9  d5  cd ` |
| 110 | `0x08da5e` | `0x08da4e:  d1  c9  e5  21  2e  ef  00  cd  79  c9  04  e1  c0  18  d9  2a [1a][23][d0] ed  5b  e9  10  d0  b7  ed  52  c9  fe  01  38  1f  28  24  fe ` |
| 111 | `0x08da95` | `0x08da85:  08  06  20  cd  59  d4  0a  c9  ed  4b  1d  23  d0  03  c9  2a [1a][23][d0] e5  cd  45  dd  08  20  02  c1  c9  30  01  7a  cd  a7  dc  08 ` |
| 112 | `0x08dab0` | `0x08daa0:  c9  30  01  7a  cd  a7  dc  08  20  0a  cd  f1  db  08  e1  22 [1a][23][d0] c9  cd  35  dc  08  20  02  18  ee  fe  10  20  17  fd  cb  2d ` |
| 113 | `0x08daff` | `0x08daef:  59  d4  0a  c9  cd  e1  db  08  0e  01  cd  55  d4  0a  c9  2a [1a][23][d0] e5  26  00  e5  cd  45  dd  08  20  0c  c1  ed  4b  1a  23  d0 ` |
| 114 | `0x08db0f` | `0x08daff:  1a  23  d0  e5  26  00  e5  cd  45  dd  08  20  0c  c1  ed  4b [1a][23][d0] e1  22  1a  23  d0  c9  30  01  7a  e3  cb  44  e3  28  28  fe ` |
| 115 | `0x08db14` | `0x08db04:  00  e5  cd  45  dd  08  20  0c  c1  ed  4b  1a  23  d0  e1  22 [1a][23][d0] c9  30  01  7a  e3  cb  44  e3  28  28  fe  94  38  e7  fe  96 ` |
| 116 | `0x08db37` | `0x08db27:  38  08  fe  f0  38  df  fe  f2  30  db  fd  cb  2d  8e  23  22 [1a][23][d0] e1  cb  c4  e5  cd  45  dd  08  28  c8  30  01  7a  18  08  fe ` |
| 117 | `0x08db67` | `0x08db57:  06  02  cd  59  d4  0a  fe  11  28  0b  fd  cb  2d  8e  ed  43 [1a][23][d0] 18  a0  03  ed  43  1a  23  d0  18  13  7a  b7  20  01  7b  cd ` |
| 118 | `0x08db6f` | `0x08db5f:  28  0b  fd  cb  2d  8e  ed  43  1a  23  d0  18  a0  03  ed  43 [1a][23][d0] 18  13  7a  b7  20  01  7b  cd  a7  dc  08  28  08  cd  35  dc ` |
| 119 | `0x08dbb7` | `0x08dba7:  01  c9  06  18  18  02  06  14  cd  93  db  08  20  06  ed  4b [1a][23][d0] c9  c5  18  00  c1  cd  e5  db  08  cd  59  d4  0a  f5  3a  73 ` |
| 120 | `0x08dbd2` | `0x08dbc2:  08  cd  59  d4  0a  f5  3a  73  26  d0  b2  28  09  f1  ed  4b [1a][23][d0] 03  b7  c9  3a  73  26  d0  b7  20  f0  f1  c9  cd  93  db  08 ` |
| 121 | `0x08dbe7` | `0x08dbd7:  c9  3a  73  26  d0  b7  20  f0  f1  c9  cd  93  db  08  e5  2a [1a][23][d0] 2b  22  1a  23  d0  e1  c9  e5  c5  e1  e5  cd  1a  dc  08  38 ` |
| 122 | `0x08dbec` | `0x08dbdc:  b7  20  f0  f1  c9  cd  93  db  08  e5  2a  1a  23  d0  2b  22 [1a][23][d0] e1  c9  e5  c5  e1  e5  cd  1a  dc  08  38  0c  fd  cb  2d  8e ` |
| 123 | `0x08dc02` | `0x08dbf2:  c5  e1  e5  cd  1a  dc  08  38  0c  fd  cb  2d  8e  e1  23  22 [1a][23][d0] 18  ed  c1  e1  c9  2a  1a  23  d0  cd  49  dd  08  d8  c0  37 ` |
| 124 | `0x08dc0b` | `0x08dbfb:  fd  cb  2d  8e  e1  23  22  1a  23  d0  18  ed  c1  e1  c9  2a [1a][23][d0] cd  49  dd  08  d8  c0  37  c9  2a  1a  23  d0  cd  0e  dc  08 ` |
| 125 | `0x08dc17` | `0x08dc07:  c1  e1  c9  2a  1a  23  d0  cd  49  dd  08  d8  c0  37  c9  2a [1a][23][d0] cd  0e  dc  08  d8  cd  26  dc  08  c8  37  c9  fe  2d  c8  fe ` |
| 126 | `0x08dc8f` | `0x08dc7f:  cd  a5  de  08  30  08  fe  41  38  0b  fe  5c  30  07  23  22 [1a][23][d0] 10  e5  ed  4b  1a  23  d0  bf  c9  fe  5f  06  08  28  d2  cd ` |
| 127 | `0x08dc96` | `0x08dc86:  41  38  0b  fe  5c  30  07  23  22  1a  23  d0  10  e5  ed  4b [1a][23][d0] bf  c9  fe  5f  06  08  28  d2  cd  f8  dc  08  18  ed  cd  cf ` |
| 128 | `0x08dcc3` | `0x08dcb3:  dc  08  cd  0a  dc  08  38  0d  cd  7d  6a  05  20  07  23  22 [1a][23][d0] 18  ed  ed  4b  1a  23  d0  bf  c9  cd  f4  0e  09  c0  cd  3a ` |
| 129 | `0x08dcca` | `0x08dcba:  0d  cd  7d  6a  05  20  07  23  22  1a  23  d0  18  ed  ed  4b [1a][23][d0] bf  c9  cd  f4  0e  09  c0  cd  3a  dd  08  18  ee  5f  16  ef ` |
| 130 | `0x08dd0a` | `0x08dcfa:  20  66  28  3c  fd  cb  2d  66  20  36  2a  e3  08  d0  ed  5b [1a][23][d0] cd  73  c9  04  28  02  30  25  40  2a  f6  10  40  22  88  11 ` |
| 131 | `0x08dd41` | `0x08dd31:  52  40  22  e3  08  fd  cb  2d  e6  cd  45  dd  08  c8  23  22 [1a][23][d0] c9  2a  1a  23  d0  ed  5b  1d  23  d0  13  cd  73  c9  04  20 ` |
| 132 | `0x08dd46` | `0x08dd36:  fd  cb  2d  e6  cd  45  dd  08  c8  23  22  1a  23  d0  c9  2a [1a][23][d0] ed  5b  1d  23  d0  13  cd  73  c9  04  20  06  bf  11  00  00 ` |
| 133 | `0x08dec4` | `0x08deb4:  a6  fd  cb  20  66  c8  fd  cb  2d  ae  40  2a  e3  08  ed  5b [1a][23][d0] 19  ed  5b  1d  23  d0  13  cd  73  c9  04  38  05  2b  fd  cb ` |
| 134 | `0x0917a6` | `0x091796:  b0  f5  fd  cb  1b  76  20  01  fb  f1  c9  11  07  11  d0  21 [1a][23][d0] cd  7e  f9  07  21  ec  10  d0  01  1b  00  00  ed  b0  c9  21 ` |
| 135 | `0x0917c3` | `0x0917b3:  00  00  ed  b0  c9  21  28  11  d0  18  04  21  07  11  d0  11 [1a][23][d0] cd  7e  f9  07  11  ec  10  d0  18  e1  cd  13  1b  09  11  02 ` |
| 136 | `0x0998f1` | `0x0998e1:  21  f8  05  d0  cb  f6  fd  cb  07  86  c9  c3  b6  1d  06  2a [1a][23][d0] ed  5b  17  23  d0  b7  ed  52  23  e5  ed  5b  17  23  d0  19 ` |
| 137 | `0x099905` | `0x0998f5:  5b  17  23  d0  b7  ed  52  23  e5  ed  5b  17  23  d0  19  22 [1a][23][d0] c1  cd  16  bf  09  c1  18  22  cd  81  ff  07  af  32  be  22 ` |
| 138 | `0x099ae8` | `0x099ad8:  00  5e  19  23  d1  cd  56  9b  09  22  17  23  d0  eb  19  22 [1a][23][d0] eb  09  22  1d  23  d0  11  0e  23  d0  c3  0d  fa  07  af  cd ` |
| 139 | `0x099aff` | `0x099aef:  23  d0  11  0e  23  d0  c3  0d  fa  07  af  cd  37  bf  09  2a [1a][23][d0] ed  4b  17  23  d0  b7  ed  42  e5  c1  cd  16  bf  09  21  0e ` |
| 140 | `0x099b51` | `0x099b41:  f9  9a  09  2a  87  06  d0  cd  56  9b  09  22  17  23  d0  22 [1a][23][d0] 18  96  f5  01  00  00  00  78  7e  4f  23  7e  47  f1  0b  23 ` |
| 141 | `0x099bcb` | `0x099bbb:  09  cd  b8  ba  09  fe  0b  20  69  cd  cf  be  09  30  0b  2a [1a][23][d0] 2b  22  1a  23  d0  18  58  cd  54  f9  07  cd  58  9d  09  da ` |
| 142 | `0x099bd0` | `0x099bc0:  fe  0b  20  69  cd  cf  be  09  30  0b  2a  1a  23  d0  2b  22 [1a][23][d0] 18  58  cd  54  f9  07  cd  58  9d  09  da  4e  9d  09  cd  b8 ` |
| 143 | `0x099ccc` | `0x099cbc:  09  f5  fe  ab  20  12  cd  a6  bb  09  fe  10  20  0a  ed  43 [1a][23][d0] f1  c3  82  9a  09  cd  8b  af  09  f1  fe  2c  28  1e  fe  ac ` |
| 144 | `0x099d39` | `0x099d29:  cd  17  d2  0b  18  c4  cd  a6  bb  09  c8  fe  29  20  11  2a [1a][23][d0] e5  c5  cd  0b  c7  09  c1  e1  22  1a  23  d0  c8  ed  43  1a ` |
| 145 | `0x099d45` | `0x099d35:  29  20  11  2a  1a  23  d0  e5  c5  cd  0b  c7  09  c1  e1  22 [1a][23][d0] c8  ed  43  1a  23  d0  c3  1a  1d  06  01  04  00  00  18  04 ` |
| 146 | `0x099d4b` | `0x099d3b:  d0  e5  c5  cd  0b  c7  09  c1  e1  22  1a  23  d0  c8  ed  43 [1a][23][d0] c3  1a  1d  06  01  04  00  00  18  04  01  00  00  00  06  03 ` |
| 147 | `0x099eb5` | `0x099ea5:  1a  fe  07  cd  e0  c4  09  c2  1a  1d  06  1e  00  d5  ed  4b [1a][23][d0] c5  cd  4f  d4  0a  ed  43  1a  23  d0  30  f5  fe  11  28  f1 ` |
| 148 | `0x099ebf` | `0x099eaf:  06  1e  00  d5  ed  4b  1a  23  d0  c5  cd  4f  d4  0a  ed  43 [1a][23][d0] 30  f5  fe  11  28  f1  d1  13  c5  e1  b7  ed  52  f5  e5  cd ` |
| 149 | `0x099edd` | `0x099ecd:  ed  52  f5  e5  cd  11  24  08  13  13  c1  79  b0  28  08  2a [1a][23][d0] ed  42  ed  b0  cd  14  f9  07  f1  d1  cb  43  c0  fe  2a  ca ` |
| 150 | `0x099f70` | `0x099f60:  fd  cb  06  ee  3e  08  18  d1  fd  cb  06  6e  18  df  f1  2a [1a][23][d0] 11  f8  05  d0  cd  80  f9  07  2b  22  1a  23  d0  40  2a  f9 ` |
| 151 | `0x099f7d` | `0x099f6d:  df  f1  2a  1a  23  d0  11  f8  05  d0  cd  80  f9  07  2b  22 [1a][23][d0] 40  2a  f9  05  40  22  72  25  40  2a  fb  05  40  22  70  25 ` |
| 152 | `0x099fff` | `0x099fef:  be  09  30  0a  fe  30  30  02  18  13  fe  3a  30  fa  ed  43 [1a][23][d0] c1  e1  23  77  10  dd  c3  51  9f  09  c1  e1  c9  cd  3a  2c ` |
| 153 | `0x09a04f` | `0x09a03f:  03  06  d0  e6  3f  fe  04  28  06  cd  2d  01  08  20  0b  2a [1a][23][d0] 2b  22  1a  23  d0  18  57  f1  f5  cd  34  bb  09  f1  f5  fe ` |
| 154 | `0x09a054` | `0x09a044:  fe  04  28  06  cd  2d  01  08  20  0b  2a  1a  23  d0  2b  22 [1a][23][d0] 18  57  f1  f5  cd  34  bb  09  f1  f5  fe  62  38  53  ca  73 ` |
| 155 | `0x09a2ac` | `0x09a29c:  14  fe  29  c2  1a  1d  06  cd  0b  c7  09  c2  1a  1d  06  22 [1a][23][d0] 18  2c  3a  f8  05  d0  cd  21  ac  09  af  32  f8  05  d0  f1 ` |
| 156 | `0x09b652` | `0x09b642:  8b  af  09  f1  cd  d0  89  06  cd  b6  fe  07  18  96  ed  43 [1a][23][d0] f1  c6  64  c3  bc  ae  09  cd  13  b9  09  fe  f2  38  02  c6 ` |
| 157 | `0x09b9f0` | `0x09b9e0:  1d  06  cd  53  d4  0a  b7  18  04  cd  53  d4  0a  0b  ed  43 [1a][23][d0] 30  03  b7  18  e4  eb  c5  e1  b7  ed  52  28  de  e5  21  0e ` |
| 158 | `0x09ba3a` | `0x09ba2a:  7e  12  13  f1  12  13  01  00  00  00  4f  23  ed  b0  c1  2a [1a][23][d0] 23  b7  ed  42  e5  d5  ed  5b  17  23  d0  b7  ed  52  eb  e1 ` |
| 159 | `0x09ba5a` | `0x09ba4a:  52  eb  e1  73  23  72  23  eb  e1  ed  b0  c3  14  f9  07  2a [1a][23][d0] 23  e5  cd  87  94  05  c5  e1  0b  ed  43  1a  23  d0  c1  b7 ` |
| 160 | `0x09ba68` | `0x09ba58:  07  2a  1a  23  d0  23  e5  cd  87  94  05  c5  e1  0b  ed  43 [1a][23][d0] c1  b7  ed  42  c9  cd  50  bf  09  d1  f1  b7  28  0a  fe  11 ` |
| 161 | `0x09bab0` | `0x09baa0:  5f  19  19  19  ed  27  3a  20  23  d0  e9  cd  51  00  08  2a [1a][23][d0] 23  22  1a  23  d0  ed  4b  1a  23  d0  2a  1d  23  d0  af  ed ` |
| 162 | `0x09bab5` | `0x09baa5:  27  3a  20  23  d0  e9  cd  51  00  08  2a  1a  23  d0  23  22 [1a][23][d0] ed  4b  1a  23  d0  2a  1d  23  d0  af  ed  42  d8  c5  e1  7e ` |
| 163 | `0x09baba` | `0x09baaa:  e9  cd  51  00  08  2a  1a  23  d0  23  22  1a  23  d0  ed  4b [1a][23][d0] 2a  1d  23  d0  af  ed  42  d8  c5  e1  7e  c9  ed  4b  1a  23 ` |
| 164 | `0x09bacb` | `0x09babb:  23  d0  2a  1d  23  d0  af  ed  42  d8  c5  e1  7e  c9  ed  4b [1a][23][d0] 03  18  ec  2a  93  25  d0  23  7e  c9  2a  93  25  d0  23  18 ` |
| 165 | `0x09bc05` | `0x09bbf5:  cd  50  bf  09  cd  ab  ba  09  cd  03  bb  09  28  13  ed  43 [1a][23][d0] fe  11  20  06  cd  a6  bb  09  28  04  c3  1a  1d  06  cd  0f ` |
| 166 | `0x09c714` | `0x09c704:  3a  fa  05  d0  fe  21  c9  fd  cb  08  4e  20  02  b7  c9  2a [1a][23][d0] e5  cd  c9  ba  09  ed  43  1a  23  d0  30  03  e1  af  c9  fe ` |
| 167 | `0x09c71e` | `0x09c70e:  4e  20  02  b7  c9  2a  1a  23  d0  e5  cd  c9  ba  09  ed  43 [1a][23][d0] 30  03  e1  af  c9  fe  3e  28  f9  fe  3f  28  f5  fe  29  28 ` |
| 168 | `0x09c734` | `0x09c724:  af  c9  fe  3e  28  f9  fe  3f  28  f5  fe  29  28  e6  e1  22 [1a][23][d0] 3e  29  c9  50  52  4f  47  52  41  4d  00  cd  6b  c7  09  fd ` |
| 169 | `0x0ad47f` | `0x0ad46f:  70  26  d0  cb  b0  dd  70  00  dd  71  01  dd  36  02  00  2a [1a][23][d0] e5  d5  dd  cb  00  76  28  04  fd  cb  2d  8e  cd  c9  ba  09 ` |
| 170 | `0x0ad4b6` | `0x0ad4a6:  00  7e  c2  bd  d6  0a  dd  cb  00  46  ca  bd  d6  0a  ed  43 [1a][23][d0] c3  d7  d5  0a  cd  ad  bb  09  ca  bd  d6  0a  fe  04  20  0a ` |
| 171 | `0x0ad4e1` | `0x0ad4d1:  d6  0a  dd  cb  00  46  28  06  fe  2a  ca  be  d6  0a  ed  43 [1a][23][d0] fe  bb  20  2c  cd  af  ba  09  cd  36  d7  0a  ca  a2  d5  0a ` |
| 172 | `0x0ad536` | `0x0ad526:  d6  0a  20  13  cd  f9  08  09  20  09  21  04  00  00  09  22 [1a][23][d0] c3  84  d4  0a  cd  f9  08  09  20  1c  21  04  00  00  09  22 ` |
| 173 | `0x0ad549` | `0x0ad539:  c3  84  d4  0a  cd  f9  08  09  20  1c  21  04  00  00  09  22 [1a][23][d0] cd  c9  ba  09  cd  ad  bb  09  ca  84  d4  0a  ed  4b  1a  23 ` |
| 174 | `0x0ad55a` | `0x0ad54a:  23  d0  cd  c9  ba  09  cd  ad  bb  09  ca  84  d4  0a  ed  4b [1a][23][d0] 18  2d  0b  fe  2e  28  28  fe  2f  28  24  c3  84  d4  0a  cd ` |
| 175 | `0x0ad5e0` | `0x0ad5d0:  84  d4  0a  c3  bd  d6  0a  cd  65  00  08  20  08  03  ed  43 [1a][23][d0] 18  c8  dd  cb  00  46  c2  84  d4  0a  fe  11  20  53  dd  cb ` |
| 176 | `0x0ad6a4` | `0x0ad694:  84  d4  0a  f5  7b  1e  00  32  73  26  d0  f1  67  f1  e3  22 [1a][23][d0] 6f  62  f1  57  f1  e2  b1  d6  0a  fb  7b  dd  e1  c6  ff  7a ` |
| 177 | `0x0ad6b9` | `0x0ad6a9:  f1  57  f1  e2  b1  d6  0a  fb  7b  dd  e1  c6  ff  7a  eb  2a [1a][23][d0] c9  af  b7  f5  7b  1e  01  18  d6  dd  cb  00  4e  c0  dd  cb ` |

### Pattern: 0xD007EB (EB 07 D0)

Found **1** match(es):

| # | Offset | Context |
|---|--------|---------|
| 1 | `0x08c747` | `0x08c737:  07  d0  cd  45  c7  08  fd  21  80  00  d0  e1  e1  c9  e9  2a [eb][07][d0] cd  45  c7  08  fd  21  80  00  d0  c9  21  54  c7  08  cd  ef ` |

## Part 2: Dynamic Boot Trace (500k steps)

- Cold boot: 3062 steps, terminated: halt
- OS init: 691 steps, terminated: missing_block

### Pointer at 0xD007EB

Bytes: `ff ff ff`  =>  **0xffffff**

### Dispatch table at 0xD0231A-0xD02340

All 0xFF (uninitialized)? **true**
Non-FF bytes: 0 / 38

```
0xd0231a:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff   ................
0xd0232a:  ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff   ................
0xd0233a:  ff ff ff ff ff ff                                 ......
```

## Interpretation

The dispatch table at 0xD0231A-0xD02340 is **still all 0xFF** after 500k boot steps.
The populator routine runs later in boot than our emulation reaches,
or is triggered by a hardware event (interrupt, timer) we do not emulate.
