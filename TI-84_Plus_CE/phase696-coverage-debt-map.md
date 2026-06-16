# Phase 696: Coverage Debt Map

Probe: `probe-phase696-coverage-debt-map.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase696-coverage-debt-map.mjs`

## Summary

- Covered bytes baseline: **713,656**.
- Remaining uncovered non-erased debt: **31,921 bytes** across **2,946 ranges**.
- Phase693-compatible CODE? subset: **1,952 bytes** across **94 ranges**.
- Seed-worthy ranges after phase694/695: **0**. The four manual-review ranges remain unresolved data/debt until a new owner or dynamic hit exists.
- Debt map policy: every range is classified into data/debt buckets; no transpiler seed edit is justified by this pass.

## Debt Buckets

| bucket | ranges | bytes | percent | seed policy |
| --- | --- | --- | --- | --- |
| font-bitmap | 425 | 4,026 | 12.6% | treat as data / do not seed as code |
| string | 143 | 2,800 | 8.8% | treat as data / do not seed as code |
| table | 1479 | 22,014 | 69.0% | treat as data / do not seed as code |
| sparse-data | 895 | 3,004 | 9.4% | treat as data / do not seed as code |
| unresolved-manual-review | 4 | 77 | 0.2% | do not seed without new owner/dynamic hit |

## Phase693 Verdict Compatibility

| phase693 verdict | ranges | bytes | percent |
| --- | --- | --- | --- |
| CODE? | 94 | 1,952 | 6.1% |
| DATA-MIXED | 1363 | 21,883 | 68.6% |
| DATA-SPARSE | 1366 | 5,676 | 17.8% |
| STRINGS | 123 | 2,410 | 7.5% |

## CODE? Debt Disposition

- CODE? entries now split to **90 likely-data/data-bucket ranges** plus **4 unresolved manual-review ranges**.
- Phase694 found 0 direct control refs into the 94 CODE? candidates and 0 seed candidates.
- Phase695 found 0 seedable owners and 0 dynamic hits for the four manual-review ranges; only `0x0A169D` had raw24 data-style refs.

| range | len | bucket | phase693 | reason | first bytes |
| --- | --- | --- | --- | --- | --- |
| 0x08DDDC..0x08DDF7 | 28 | table | CODE? | pointer-like records valid=8 ram=0/9 | 28 24 00 22 25 00 23 BF 00 25 C1 00 26 BC 00 27 |
| 0x0A4B97..0x0A4BB2 | 28 | font-bitmap | CODE? | high-bitmap-mask-region fontish=68% | 00 CC CC CC CC CC CC CC FC 78 00 00 00 00 00 00 |
| 0x0BCAAC..0x0BCAC7 | 28 | table | CODE? | pointer-like records valid=5 ram=1/8 | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 0x0BCAEF..0x0BCB0A | 28 | table | CODE? | pointer-like records valid=6 ram=0/9 | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 0x004499..0x0044B3 | 27 | font-bitmap | CODE? | low-font-glyph-region fontish=100% | F8 F8 F8 C0 18 C0 18 C0 18 C0 18 C0 18 F8 C0 F8 |
| 0x004AB9..0x004AD3 | 27 | font-bitmap | CODE? | low-font-glyph-region fontish=100% | 18 78 F8 38 F8 00 18 00 18 18 F0 38 E0 00 00 00 |
| 0x014BE0..0x014BFA | 27 | table | CODE? | pointer-like records valid=4 ram=2/9 | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 0x05213B..0x052155 | 27 | table | CODE? | mixed structured data fallback after phase693/694/695 screens | B4 D1 3C D4 B3 D6 1A D9 6F DB B4 DD E7 DF 09 E2 |
| 0x05915F..0x059179 | 27 | sparse-data | CODE? | unique=14, zero=52%, cc=0% | 00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6 |
| 0x05CD1D..0x05CD37 | 27 | table | CODE? | pointer-like records valid=7 ram=0/9 | 14 CC 05 67 CD 05 3C CD 05 6C CD 05 33 CD 05 70 |
| 0x086CFB..0x086D15 | 27 | table | CODE? | pointer-like records valid=8 ram=0/8 | 6D 08 B1 6E 08 ED 70 08 11 6F 08 68 73 08 91 73 |
| 0x09C26B..0x09C285 | 27 | table | CODE? | pointer-like records valid=8 ram=0/8 | 09 DF C3 09 E4 C3 09 E9 C3 09 EE C3 09 9D C3 09 |
| 0x0A43B8..0x0A43D2 | 27 | font-bitmap | CODE? | high-bitmap-mask-region fontish=89% | 7E 00 3C 00 18 00 18 00 18 00 18 00 08 00 00 FC |
| 0x005302..0x00531B | 26 | font-bitmap | CODE? | low-font-glyph-region fontish=100% | 38 38 30 18 30 18 38 38 38 F0 30 E0 30 00 70 00 |
| 0x050690..0x0506A9 | 26 | table | CODE? | mixed structured data fallback after phase693/694/695 screens | 29 00 00 1B BB 01 28 78 C1 2C C3 2C C7 5D 29 00 |
| 0x08983D..0x089856 | 26 | unresolved-manual-review | CODE? | phase695: no direct raw/lifted owner; pointer-table neighborhood | F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1 |
| 0x09C2AC..0x09C2C5 | 26 | table | CODE? | pointer-like records valid=8 ram=0/8 | C4 09 07 C4 09 20 C4 09 13 C4 09 0F C4 09 0B C4 |
| 0x0A0121..0x0A013A | 26 | table | CODE? | pointer-like records valid=8 ram=0/8 | 13 0A DD 13 0A EA 13 0A F6 13 0A 00 14 0A 0A 14 |
| 0x0A3DD9..0x0A3DF2 | 26 | table | CODE? | mixed structured data fallback after phase693/694/695 screens | 80 CF C0 CC C0 CC C0 CC C0 CC C0 CF C0 C7 80 06 |
| 0x0A4CB9..0x0A4CD2 | 26 | font-bitmap | CODE? | high-bitmap-mask-region fontish=85% | 00 C3 00 C3 00 C3 00 06 00 00 00 30 60 C0 00 00 |
| 0x0AB3E3..0x0AB3FC | 26 | table | CODE? | repeated records r3=6/8 r4=6/6 | 82 00 C3 81 3E C3 82 00 C3 81 3C C3 82 00 70 72 |
| 0x0044BB..0x0044D3 | 25 | font-bitmap | CODE? | low-font-glyph-region fontish=100% | 18 C0 38 F8 F0 F8 E0 18 E0 38 F0 70 38 60 18 C0 |
| 0x0050A5..0x0050BD | 25 | font-bitmap | CODE? | low-font-glyph-region fontish=96% | 18 C0 18 E0 38 78 F8 38 D8 08 80 18 C0 30 60 00 |
| 0x047552..0x04756A | 25 | table | CODE? | pointer-like records valid=0 ram=6/8 | C7 C8 C9 CA CB CC CD CE CF D0 D1 D2 D3 D4 D5 D6 |

## font-bitmap

Ranges: **425**. Bytes: **4,026**.

### Largest Ranges

| range | len | phase693 | reason | uniq | fontish | ascii run | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x057D52..0x057D82 | 49 | DATA-MIXED | bitmap-like masks fontish=90% | 10 | 90% | 2 | 00 00 00 00 00 00 80 3F 00 00 00 40 00 00 40 40 |
| 0x07F74D..0x07F779 | 45 | DATA-SPARSE | bitmap-like masks fontish=93% | 4 | 93% | 0 | 0C 80 10 00 00 00 00 00 00 0C 80 00 00 00 00 00 |
| 0x08CA09..0x08CA30 | 40 | DATA-MIXED | bitmap-like masks fontish=85% | 12 | 85% | 1 | 25 00 00 00 00 09 05 08 02 1D 00 00 00 00 00 00 |
| 0x08E776..0x08E799 | 36 | DATA-MIXED | bitmap-like masks fontish=81% | 11 | 81% | 1 | 0A 00 60 00 60 00 78 00 38 00 00 00 00 F8 F8 F8 |
| 0x089CB9..0x089CD6 | 30 | DATA-SPARSE | bitmap-like masks fontish=97% | 3 | 97% | 0 | 83 00 80 00 00 00 00 80 00 00 00 00 80 00 00 00 |
| 0x0A44F5..0x0A4512 | 30 | DATA-MIXED | high-bitmap-mask-region fontish=83% | 9 | 83% | 3 | 60 60 60 F8 F8 60 60 60 00 00 00 00 00 00 00 00 |
| 0x00559F..0x0055BB | 29 | DATA-MIXED | low-font-glyph-region fontish=83% | 11 | 83% | 2 | 18 F8 18 F8 98 F8 D8 F8 F8 F8 F8 D8 F8 C8 F8 C0 |
| 0x0053DE..0x0053F9 | 28 | DATA-MIXED | low-font-glyph-region fontish=96% | 6 | 96% | 0 | 08 F0 00 E0 08 F0 18 B8 18 18 00 00 00 00 00 00 |
| 0x08999B..0x0899B6 | 28 | DATA-SPARSE | bitmap-like masks fontish=100% | 2 | 100% | 0 | 80 00 00 80 00 00 00 00 80 00 00 00 00 80 00 00 |
| 0x0A4B97..0x0A4BB2 | 28 | CODE? | high-bitmap-mask-region fontish=68% | 7 | 68% | 2 | 00 CC CC CC CC CC CC CC FC 78 00 00 00 00 00 00 |
| 0x004499..0x0044B3 | 27 | CODE? | low-font-glyph-region fontish=100% | 6 | 100% | 1 | F8 F8 F8 C0 18 C0 18 C0 18 C0 18 C0 18 F8 C0 F8 |
| 0x0044D9..0x0044F3 | 27 | DATA-MIXED | low-font-glyph-region fontish=100% | 8 | 100% | 2 | 38 38 F0 18 E0 F8 C0 F8 E0 C0 70 C0 30 C0 18 C0 |

### Top Address Bands

| bank | ranges | bytes |
| --- | --- | --- |
| 0x000000..0x00FFFF | 210 | 1,894 |
| 0x0A0000..0x0AFFFF | 88 | 995 |
| 0x080000..0x08FFFF | 53 | 559 |
| 0x070000..0x07FFFF | 11 | 176 |
| 0x050000..0x05FFFF | 12 | 110 |
| 0x0B0000..0x0BFFFF | 7 | 83 |
| 0x040000..0x04FFFF | 19 | 69 |
| 0x090000..0x09FFFF | 8 | 62 |
| 0x020000..0x02FFFF | 9 | 53 |
| 0x060000..0x06FFFF | 2 | 19 |
| 0x030000..0x03FFFF | 6 | 6 |

## string

Ranges: **143**. Bytes: **2,800**.

### Largest Ranges

| range | len | phase693 | reason | uniq | fontish | ascii run | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x3B0000..0x3B003A | 59 | STRINGS | printable run=13 | 36 | 27% | 13 | EC 03 3D 18 04 05 13 00 D8 56 A8 04 2D 0E 4D 69 |
| 0x03F2D0..0x03F2FF | 48 | STRINGS | printable run=13 | 20 | 10% | 13 | 57 61 69 74 69 6E 67 CE 00 20 52 65 63 65 69 76 |
| 0x047042..0x04706A | 41 | STRINGS | printable run=16 | 16 | 27% | 16 | 02 10 00 0F 20 52 54 43 20 43 6F 6E 74 72 6F 6C |
| 0x03FF2C..0x03FF4F | 36 | STRINGS | printable run=35 | 17 | 22% | 35 | 41 46 27 3A 25 30 34 58 20 42 43 27 3A 25 30 36 |
| 0x06DB2A..0x06DB49 | 32 | STRINGS | printable run=19 | 27 | 3% | 19 | 5A 74 79 78 7A 7B 7C 77 7D 7E 76 69 7F 65 77 69 |
| 0x05056B..0x050589 | 31 | STRINGS | printable run=13 | 14 | 23% | 13 | 61 6C 75 65 42 29 00 00 28 6C 69 73 74 29 00 03 |
| 0x05176B..0x051789 | 31 | STRINGS | printable run=16 | 20 | 26% | 16 | 61 6C 75 65 C1 2C 66 6F 72 6D 61 74 5D 29 00 20 |
| 0x06288A..0x0628A8 | 31 | STRINGS | printable run=21 | 16 | 23% | 21 | 61 6C 69 64 20 66 75 6E 63 74 69 6F 6E 20 75 73 |
| 0x0767EA..0x076808 | 31 | STRINGS | printable run=22 | 24 | 13% | 22 | 73 6C 20 49 6E 65 71 75 61 6C 69 74 79 20 47 72 |
| 0x0A171C..0x0A173A | 31 | STRINGS | printable run=16 | 23 | 13% | 16 | 61 6C 28 3A 0F 45 78 65 63 75 74 65 20 50 72 6F |
| 0x04F782..0x04F79F | 30 | STRINGS | printable run=12 | 21 | 23% | 12 | 61 6C 75 65 5D 29 00 00 16 BB 01 28 6E 75 6D 74 |
| 0x06E4D6..0x06E4F3 | 30 | STRINGS | printable run=13 | 29 | 7% | 13 | 5F 5C 5D 70 6F 6E 71 72 6A 6D 67 6C 73 BD F8 89 |

### Top Address Bands

| bank | ranges | bytes |
| --- | --- | --- |
| 0x050000..0x05FFFF | 46 | 836 |
| 0x040000..0x04FFFF | 25 | 488 |
| 0x0A0000..0x0AFFFF | 18 | 398 |
| 0x060000..0x06FFFF | 14 | 311 |
| 0x070000..0x07FFFF | 14 | 223 |
| 0x030000..0x03FFFF | 4 | 126 |
| 0x000000..0x00FFFF | 8 | 114 |
| 0x0B0000..0x0BFFFF | 4 | 79 |
| 0x020000..0x02FFFF | 3 | 69 |
| 0x3B0000..0x3BFFFF | 1 | 59 |
| 0x080000..0x08FFFF | 4 | 53 |
| 0x010000..0x01FFFF | 2 | 44 |

## table

Ranges: **1479**. Bytes: **22,014**.

### Largest Ranges

| range | len | phase693 | reason | uniq | fontish | ascii run | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x08AC67..0x08AC97 | 49 | DATA-MIXED | pointer-like records valid=6 ram=1/15 | 34 | 27% | 2 | AC 08 BE B4 08 90 AC 08 A9 A7 08 00 00 00 42 CD |
| 0x08F80E..0x08F83D | 48 | DATA-MIXED | pointer-like records valid=16 ram=0/16 | 18 | 40% | 1 | 7C F8 08 E8 F8 08 33 F9 08 A0 F8 08 7D F9 08 1C |
| 0x058082..0x0580AE | 45 | DATA-MIXED | repeated records r3=11/15 r4=10/11 | 13 | 58% | 2 | 00 80 00 00 00 00 00 00 00 00 E3 99 99 99 99 99 |
| 0x0376DF..0x0376FD | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 21 | 13% | 2 | 03 F1 76 03 53 77 03 7D 77 03 CD 4B 72 03 C3 81 |
| 0x04B4CF..0x04B4ED | 31 | DATA-MIXED | pointer-like records valid=7 ram=0/9 | 20 | 16% | 3 | 5D 00 05 81 03 4D B5 04 02 5C 00 09 41 01 52 B5 |
| 0x05C405..0x05C423 | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 17 | 6% | 0 | 06 EF 07 EF 08 EF 09 EF 0A EF 0B EF 0C EF 0D EF |
| 0x05C465..0x05C483 | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 17 | 0% | 1 | 42 EF 43 EF 44 EF 45 EF 46 EF 47 EF 48 EF 49 EF |
| 0x05C485..0x05C4A3 | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 18 | 10% | 3 | 52 EF 53 EF 54 EF 55 EF 56 EF 57 EF 58 EF 59 EF |
| 0x05C4E5..0x05C503 | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 17 | 0% | 0 | 86 EF 87 EF 88 EF 89 EF 8A EF 8B EF 8C EF 8D EF |
| 0x05C505..0x05C523 | 31 | DATA-MIXED | mixed structured data fallback after phase693/694/695 screens | 13 | 32% | 0 | 96 EF 97 EF 98 00 00 00 00 00 00 00 00 00 00 EF |
| 0x0AB50C..0x0AB52A | 31 | DATA-MIXED | pointer-like records valid=9 ram=0/9 | 14 | 10% | 1 | B3 0A 5D B3 0A 7D B3 0A 44 FE 00 8D B3 0A 45 FE |
| 0x04F282..0x04F29F | 30 | DATA-MIXED | pointer-like records valid=9 ram=0/9 | 12 | 3% | 1 | 04 68 F7 04 6B F7 04 71 F7 04 89 F7 04 9F F7 04 |

### Top Address Bands

| bank | ranges | bytes |
| --- | --- | --- |
| 0x020000..0x02FFFF | 345 | 7,374 |
| 0x050000..0x05FFFF | 184 | 2,416 |
| 0x040000..0x04FFFF | 180 | 2,367 |
| 0x000000..0x00FFFF | 129 | 1,615 |
| 0x0A0000..0x0AFFFF | 107 | 1,576 |
| 0x090000..0x09FFFF | 109 | 1,396 |
| 0x080000..0x08FFFF | 92 | 1,379 |
| 0x030000..0x03FFFF | 85 | 951 |
| 0x0B0000..0x0BFFFF | 72 | 946 |
| 0x060000..0x06FFFF | 78 | 888 |
| 0x070000..0x07FFFF | 70 | 758 |
| 0x010000..0x01FFFF | 28 | 348 |

## sparse-data

Ranges: **895**. Bytes: **3,004**.

### Largest Ranges

| range | len | phase693 | reason | uniq | fontish | ascii run | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x05C4A5..0x05C4C3 | 31 | DATA-MIXED | unique=11, zero=45%, cc=0% | 11 | 45% | 1 | 68 EF 6A EF 6B EF 6C EF 73 EF 74 EF 75 00 00 00 |
| 0x05C4C5..0x05C4E3 | 31 | DATA-MIXED | unique=11, zero=45%, cc=0% | 11 | 48% | 1 | 78 00 00 00 00 EF 79 EF 7A EF 7B 00 00 00 00 00 |
| 0x089C78..0x089C96 | 31 | DATA-SPARSE | unique=4, zero=39%, cc=0% | 4 | 58% | 0 | 83 00 80 C1 00 83 00 80 C1 00 83 00 80 C1 00 83 |
| 0x014C7B..0x014C96 | 28 | DATA-MIXED | unique=15, zero=46%, cc=0% | 15 | 54% | 1 | 3E 03 54 00 65 00 78 00 61 00 73 00 20 00 49 00 |
| 0x0BCB47..0x0BCB62 | 28 | DATA-MIXED | unique=15, zero=46%, cc=0% | 15 | 54% | 1 | 3E 03 54 00 65 00 78 00 61 00 73 00 20 00 49 00 |
| 0x05915F..0x059179 | 27 | CODE? | unique=14, zero=52%, cc=0% | 14 | 52% | 0 | 00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6 |
| 0x0A4298..0x0A42B2 | 27 | DATA-MIXED | unique=9, zero=56%, cc=0% | 9 | 59% | 0 | 09 00 00 00 00 C6 00 C6 00 E6 00 F6 00 FE 00 DE |
| 0x0A3E79..0x0A3E92 | 26 | DATA-MIXED | unique=11, zero=54%, cc=0% | 11 | 65% | 1 | C0 33 00 33 00 0A 00 00 00 00 18 00 7E 00 DB 00 |
| 0x059141..0x059159 | 25 | DATA-MIXED | unique=13, zero=52%, cc=4% | 13 | 52% | 0 | 00 C8 00 CA 00 CB 00 E9 00 E8 00 EA 00 EB 00 CD |
| 0x06DC32..0x06DC49 | 24 | DATA-MIXED | unique=9, zero=50%, cc=0% | 9 | 54% | 1 | 1B 00 9F 00 1B 00 9E 00 FD 00 9E 00 04 00 60 00 |
| 0x089760..0x089776 | 23 | DATA-SPARSE | unique=4, zero=43%, cc=0% | 4 | 65% | 0 | 00 00 80 02 01 00 00 80 02 01 00 00 80 02 01 00 |
| 0x03F714..0x03F729 | 22 | DATA-MIXED | unique=12, zero=50%, cc=0% | 12 | 55% | 0 | 0B 00 0E 00 07 00 0A 00 0F 00 08 00 01 00 02 00 |

### Top Address Bands

| bank | ranges | bytes |
| --- | --- | --- |
| 0x050000..0x05FFFF | 116 | 453 |
| 0x080000..0x08FFFF | 140 | 448 |
| 0x040000..0x04FFFF | 162 | 397 |
| 0x000000..0x00FFFF | 104 | 348 |
| 0x020000..0x02FFFF | 85 | 233 |
| 0x0A0000..0x0AFFFF | 46 | 229 |
| 0x030000..0x03FFFF | 50 | 190 |
| 0x090000..0x09FFFF | 61 | 186 |
| 0x070000..0x07FFFF | 50 | 173 |
| 0x0B0000..0x0BFFFF | 33 | 133 |
| 0x060000..0x06FFFF | 30 | 112 |
| 0x010000..0x01FFFF | 18 | 102 |

## unresolved-manual-review

Ranges: **4**. Bytes: **77**.

### Largest Ranges

| range | len | phase693 | reason | uniq | fontish | ascii run | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x08983D..0x089856 | 26 | CODE? | phase695: no direct raw/lifted owner; pointer-table neighborhood | 10 | 50% | 1 | F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1 |
| 0x0A169D..0x0A16AF | 19 | CODE? | phase695: three raw24 data refs only; no executable owner | 11 | 21% | 4 | 28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31 |
| 0x0A57B7..0x0A57C9 | 19 | CODE? | phase695: no direct raw/lifted owner; covered-target-looking data | 10 | 11% | 2 | 16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06 |
| 0x08B8F1..0x08B8FD | 13 | CODE? | phase695: no direct raw/lifted owner; covered-target-looking data | 10 | 38% | 1 | BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A |

### Top Address Bands

| bank | ranges | bytes |
| --- | --- | --- |
| 0x080000..0x08FFFF | 2 | 39 |
| 0x0A0000..0x0AFFFF | 2 | 38 |

## Interpretation

- The remaining true-uncovered ROM bytes are coverage accounting debt, not an actionable decode frontier. The executable-looking subset has already failed direct-control, owner, and dynamic screens.
- The largest buckets are structured table-like data and sparse/fill-style data. Font/bitmap and strings are explicit data buckets, not missed code.
- The only unresolved bucket is the four phase694 manual-review ranges, but phase695 lowered them below seed threshold: no direct owner, no dynamic hit, and only one data-style raw24 owner cluster.
- Future seed edits should require a new indirect dispatch table or a dynamic trace into a range; this map should be used as a do-not-seed baseline.

## Compact JSON

```json
{
  "pass": true,
  "totalCovered": 713656,
  "totalUncovered": 31921,
  "rangeCount": 2946,
  "buckets": {
    "table": {
      "ranges": 1479,
      "bytes": 22014
    },
    "sparse-data": {
      "ranges": 895,
      "bytes": 3004
    },
    "font-bitmap": {
      "ranges": 425,
      "bytes": 4026
    },
    "string": {
      "ranges": 143,
      "bytes": 2800
    },
    "unresolved-manual-review": {
      "ranges": 4,
      "bytes": 77
    }
  },
  "phase693Verdicts": {
    "DATA-MIXED": {
      "ranges": 1363,
      "bytes": 21883
    },
    "DATA-SPARSE": {
      "ranges": 1366,
      "bytes": 5676
    },
    "STRINGS": {
      "ranges": 123,
      "bytes": 2410
    },
    "CODE?": {
      "ranges": 94,
      "bytes": 1952
    }
  },
  "codeCandidateCount": 94,
  "codeCandidateBytes": 1952,
  "seedCandidateCount": 0,
  "manualReview": [
    {
      "start": "0x08983D",
      "end": "0x089856",
      "len": 26,
      "reason": "phase695: no direct raw/lifted owner; pointer-table neighborhood",
      "phase693Verdict": "CODE?",
      "first16": "F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1"
    },
    {
      "start": "0x08B8F1",
      "end": "0x08B8FD",
      "len": 13,
      "reason": "phase695: no direct raw/lifted owner; covered-target-looking data",
      "phase693Verdict": "CODE?",
      "first16": "BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A"
    },
    {
      "start": "0x0A169D",
      "end": "0x0A16AF",
      "len": 19,
      "reason": "phase695: three raw24 data refs only; no executable owner",
      "phase693Verdict": "CODE?",
      "first16": "28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31"
    },
    {
      "start": "0x0A57B7",
      "end": "0x0A57C9",
      "len": 19,
      "reason": "phase695: no direct raw/lifted owner; covered-target-looking data",
      "phase693Verdict": "CODE?",
      "first16": "16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06"
    }
  ],
  "largestByBucket": {
    "font-bitmap": [
      {
        "start": "0x057D52",
        "end": "0x057D82",
        "len": 49,
        "phase693Verdict": "DATA-MIXED",
        "reason": "bitmap-like masks fontish=90%",
        "first16": "00 00 00 00 00 00 80 3F 00 00 00 40 00 00 40 40"
      },
      {
        "start": "0x07F74D",
        "end": "0x07F779",
        "len": 45,
        "phase693Verdict": "DATA-SPARSE",
        "reason": "bitmap-like masks fontish=93%",
        "first16": "0C 80 10 00 00 00 00 00 00 0C 80 00 00 00 00 00"
      },
      {
        "start": "0x08CA09",
        "end": "0x08CA30",
        "len": 40,
        "phase693Verdict": "DATA-MIXED",
        "reason": "bitmap-like masks fontish=85%",
        "first16": "25 00 00 00 00 09 05 08 02 1D 00 00 00 00 00 00"
      },
      {
        "start": "0x08E776",
        "end": "0x08E799",
        "len": 36,
        "phase693Verdict": "DATA-MIXED",
        "reason": "bitmap-like masks fontish=81%",
        "first16": "0A 00 60 00 60 00 78 00 38 00 00 00 00 F8 F8 F8"
      },
      {
        "start": "0x089CB9",
        "end": "0x089CD6",
        "len": 30,
        "phase693Verdict": "DATA-SPARSE",
        "reason": "bitmap-like masks fontish=97%",
        "first16": "83 00 80 00 00 00 00 80 00 00 00 00 80 00 00 00"
      },
      {
        "start": "0x0A44F5",
        "end": "0x0A4512",
        "len": 30,
        "phase693Verdict": "DATA-MIXED",
        "reason": "high-bitmap-mask-region fontish=83%",
        "first16": "60 60 60 F8 F8 60 60 60 00 00 00 00 00 00 00 00"
      },
      {
        "start": "0x00559F",
        "end": "0x0055BB",
        "len": 29,
        "phase693Verdict": "DATA-MIXED",
        "reason": "low-font-glyph-region fontish=83%",
        "first16": "18 F8 18 F8 98 F8 D8 F8 F8 F8 F8 D8 F8 C8 F8 C0"
      },
      {
        "start": "0x0053DE",
        "end": "0x0053F9",
        "len": 28,
        "phase693Verdict": "DATA-MIXED",
        "reason": "low-font-glyph-region fontish=96%",
        "first16": "08 F0 00 E0 08 F0 18 B8 18 18 00 00 00 00 00 00"
      }
    ],
    "string": [
      {
        "start": "0x3B0000",
        "end": "0x3B003A",
        "len": 59,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=13",
        "first16": "EC 03 3D 18 04 05 13 00 D8 56 A8 04 2D 0E 4D 69"
      },
      {
        "start": "0x03F2D0",
        "end": "0x03F2FF",
        "len": 48,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=13",
        "first16": "57 61 69 74 69 6E 67 CE 00 20 52 65 63 65 69 76"
      },
      {
        "start": "0x047042",
        "end": "0x04706A",
        "len": 41,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=16",
        "first16": "02 10 00 0F 20 52 54 43 20 43 6F 6E 74 72 6F 6C"
      },
      {
        "start": "0x03FF2C",
        "end": "0x03FF4F",
        "len": 36,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=35",
        "first16": "41 46 27 3A 25 30 34 58 20 42 43 27 3A 25 30 36"
      },
      {
        "start": "0x06DB2A",
        "end": "0x06DB49",
        "len": 32,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=19",
        "first16": "5A 74 79 78 7A 7B 7C 77 7D 7E 76 69 7F 65 77 69"
      },
      {
        "start": "0x05056B",
        "end": "0x050589",
        "len": 31,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=13",
        "first16": "61 6C 75 65 42 29 00 00 28 6C 69 73 74 29 00 03"
      },
      {
        "start": "0x05176B",
        "end": "0x051789",
        "len": 31,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=16",
        "first16": "61 6C 75 65 C1 2C 66 6F 72 6D 61 74 5D 29 00 20"
      },
      {
        "start": "0x06288A",
        "end": "0x0628A8",
        "len": 31,
        "phase693Verdict": "STRINGS",
        "reason": "printable run=21",
        "first16": "61 6C 69 64 20 66 75 6E 63 74 69 6F 6E 20 75 73"
      }
    ],
    "table": [
      {
        "start": "0x08AC67",
        "end": "0x08AC97",
        "len": 49,
        "phase693Verdict": "DATA-MIXED",
        "reason": "pointer-like records valid=6 ram=1/15",
        "first16": "AC 08 BE B4 08 90 AC 08 A9 A7 08 00 00 00 42 CD"
      },
      {
        "start": "0x08F80E",
        "end": "0x08F83D",
        "len": 48,
        "phase693Verdict": "DATA-MIXED",
        "reason": "pointer-like records valid=16 ram=0/16",
        "first16": "7C F8 08 E8 F8 08 33 F9 08 A0 F8 08 7D F9 08 1C"
      },
      {
        "start": "0x058082",
        "end": "0x0580AE",
        "len": 45,
        "phase693Verdict": "DATA-MIXED",
        "reason": "repeated records r3=11/15 r4=10/11",
        "first16": "00 80 00 00 00 00 00 00 00 00 E3 99 99 99 99 99"
      },
      {
        "start": "0x0376DF",
        "end": "0x0376FD",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "mixed structured data fallback after phase693/694/695 screens",
        "first16": "03 F1 76 03 53 77 03 7D 77 03 CD 4B 72 03 C3 81"
      },
      {
        "start": "0x04B4CF",
        "end": "0x04B4ED",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "pointer-like records valid=7 ram=0/9",
        "first16": "5D 00 05 81 03 4D B5 04 02 5C 00 09 41 01 52 B5"
      },
      {
        "start": "0x05C405",
        "end": "0x05C423",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "mixed structured data fallback after phase693/694/695 screens",
        "first16": "06 EF 07 EF 08 EF 09 EF 0A EF 0B EF 0C EF 0D EF"
      },
      {
        "start": "0x05C465",
        "end": "0x05C483",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "mixed structured data fallback after phase693/694/695 screens",
        "first16": "42 EF 43 EF 44 EF 45 EF 46 EF 47 EF 48 EF 49 EF"
      },
      {
        "start": "0x05C485",
        "end": "0x05C4A3",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "mixed structured data fallback after phase693/694/695 screens",
        "first16": "52 EF 53 EF 54 EF 55 EF 56 EF 57 EF 58 EF 59 EF"
      }
    ],
    "sparse-data": [
      {
        "start": "0x05C4A5",
        "end": "0x05C4C3",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=11, zero=45%, cc=0%",
        "first16": "68 EF 6A EF 6B EF 6C EF 73 EF 74 EF 75 00 00 00"
      },
      {
        "start": "0x05C4C5",
        "end": "0x05C4E3",
        "len": 31,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=11, zero=45%, cc=0%",
        "first16": "78 00 00 00 00 EF 79 EF 7A EF 7B 00 00 00 00 00"
      },
      {
        "start": "0x089C78",
        "end": "0x089C96",
        "len": 31,
        "phase693Verdict": "DATA-SPARSE",
        "reason": "unique=4, zero=39%, cc=0%",
        "first16": "83 00 80 C1 00 83 00 80 C1 00 83 00 80 C1 00 83"
      },
      {
        "start": "0x014C7B",
        "end": "0x014C96",
        "len": 28,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=15, zero=46%, cc=0%",
        "first16": "3E 03 54 00 65 00 78 00 61 00 73 00 20 00 49 00"
      },
      {
        "start": "0x0BCB47",
        "end": "0x0BCB62",
        "len": 28,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=15, zero=46%, cc=0%",
        "first16": "3E 03 54 00 65 00 78 00 61 00 73 00 20 00 49 00"
      },
      {
        "start": "0x05915F",
        "end": "0x059179",
        "len": 27,
        "phase693Verdict": "CODE?",
        "reason": "unique=14, zero=52%, cc=0%",
        "first16": "00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6"
      },
      {
        "start": "0x0A4298",
        "end": "0x0A42B2",
        "len": 27,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=9, zero=56%, cc=0%",
        "first16": "09 00 00 00 00 C6 00 C6 00 E6 00 F6 00 FE 00 DE"
      },
      {
        "start": "0x0A3E79",
        "end": "0x0A3E92",
        "len": 26,
        "phase693Verdict": "DATA-MIXED",
        "reason": "unique=11, zero=54%, cc=0%",
        "first16": "C0 33 00 33 00 0A 00 00 00 00 18 00 7E 00 DB 00"
      }
    ],
    "unresolved-manual-review": [
      {
        "start": "0x08983D",
        "end": "0x089856",
        "len": 26,
        "phase693Verdict": "CODE?",
        "reason": "phase695: no direct raw/lifted owner; pointer-table neighborhood",
        "first16": "F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1"
      },
      {
        "start": "0x0A169D",
        "end": "0x0A16AF",
        "len": 19,
        "phase693Verdict": "CODE?",
        "reason": "phase695: three raw24 data refs only; no executable owner",
        "first16": "28 01 29 26 04 77 28 01 29 27 06 75 28 01 2B 31"
      },
      {
        "start": "0x0A57B7",
        "end": "0x0A57C9",
        "len": 19,
        "phase693Verdict": "CODE?",
        "reason": "phase695: no direct raw/lifted owner; covered-target-looking data",
        "first16": "16 36 18 17 16 36 19 18 17 16 02 03 22 23 02 06"
      },
      {
        "start": "0x08B8F1",
        "end": "0x08B8FD",
        "len": 13,
        "phase693Verdict": "CODE?",
        "reason": "phase695: no direct raw/lifted owner; covered-target-looking data",
        "first16": "BD 08 F2 24 D0 08 0F FE 91 00 00 0A 0A"
      }
    ]
  }
}
```

