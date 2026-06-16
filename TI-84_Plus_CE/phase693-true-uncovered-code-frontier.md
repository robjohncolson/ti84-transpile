# Phase 693: True-Uncovered Code Frontier

Probe: `probe-phase693-true-uncovered-code-frontier.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase693-true-uncovered-code-frontier.mjs`

## Summary

- Total covered bytes: **713,656**.
- Total uncovered non-erased bytes: **31,921** across **2,946** ranges.
- CODE? frontier: **1,952 bytes** across **94** ranges (6.1% of remaining uncovered non-erased bytes).
- Largest CODE? candidate: **0x08DDDC** (28 bytes).
- Direct-reference screen: **0/94** CODE? candidates have any direct raw/lifted target reference (0 raw refs, 0 lifted refs total).

## Verdict Totals

| verdict | bytes | percent |
| --- | --- | --- |
| CODE? | 1,952 | 6.1% |
| DATA-SPARSE | 5,676 | 17.8% |
| DATA-MIXED | 21,883 | 68.6% |
| STRINGS | 2,410 | 7.5% |

## Top CODE? Candidates

| rank | range | len | decode | raw refs | lifted refs | terminal | first bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0x08DDDC..0x08DDF7 | 28 | 12 insn / 17 bytes | 0 | 0 | alu-reg OR src=D | 28 24 00 22 25 00 23 BF 00 25 C1 00 26 BC 00 27 |
| 2 | 0x0A4B97..0x0A4BB2 | 28 | 12 insn / 18 bytes | 0 | 0 | nop | 00 CC CC CC CC CC CC CC FC 78 00 00 00 00 00 00 |
| 3 | 0x0BCAAC..0x0BCAC7 | 28 | 12 insn / 17 bytes | 0 | 0 | nop | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 4 | 0x0BCAEF..0x0BCB0A | 28 | 12 insn / 17 bytes | 0 | 0 | nop | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 5 | 0x004499..0x0044B3 | 27 | 12 insn / 17 bytes | 0 | 0 | ret-conditional cond=PO | F8 F8 F8 C0 18 C0 18 C0 18 C0 18 C0 18 F8 C0 F8 |
| 6 | 0x004AB9..0x004AD3 | 27 | 12 insn / 17 bytes | 0 | 0 | nop | 18 78 F8 38 F8 00 18 00 18 18 F0 38 E0 00 00 00 |
| 7 | 0x014BE0..0x014BFA | 27 | 12 insn / 17 bytes | 0 | 0 | nop | 01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00 |
| 8 | 0x05213B..0x052155 | 27 | 12 insn / 21 bytes | 0 | 0 | alu-imm AND value=0x04 | B4 D1 3C D4 B3 D6 1A D9 6F DB B4 DD E7 DF 09 E2 |
| 9 | 0x05915F..0x059179 | 27 | 11 insn / 27 bytes | 0 | 0 | call-conditional cond=C target=0x00FA00 -> 0x00FA00 | 00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6 |
| 10 | 0x05CD1D..0x05CD37 | 27 | 12 insn / 21 bytes | 0 | 0 | nop | 14 CC 05 67 CD 05 3C CD 05 6C CD 05 33 CD 05 70 |
| 11 | 0x086CFB..0x086D15 | 27 | 12 insn / 16 bytes | 0 | 0 | ld-ind-reg dest=HL src=E | 6D 08 B1 6E 08 ED 70 08 11 6F 08 68 73 08 91 73 |
| 12 | 0x09C26B..0x09C285 | 27 | 12 insn / 24 bytes | 0 | 0 | jp target=0xC3BA09 -> 0xC3BA09 | 09 DF C3 09 E4 C3 09 E9 C3 09 EE C3 09 9D C3 09 |
| 13 | 0x0A43B8..0x0A43D2 | 27 | 12 insn / 19 bytes | 0 | 0 | call-conditional cond=M target=0x1C0CFC -> 0x1C0CFC | 7E 00 3C 00 18 00 18 00 18 00 18 00 08 00 00 FC |
| 14 | 0x005302..0x00531B | 26 | 12 insn / 19 bytes | 0 | 0 | ret-conditional cond=NZ | 38 38 30 18 30 18 38 38 38 F0 30 E0 30 00 70 00 |
| 15 | 0x050690..0x0506A9 | 26 | 12 insn / 19 bytes | 0 | 0 | alu-reg CP src=E | 29 00 00 1B BB 01 28 78 C1 2C C3 2C C7 5D 29 00 |
| 16 | 0x08983D..0x089856 | 26 | 12 insn / 18 bytes | 0 | 0 | nop | F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1 |

## Ref-Backed CODE? Candidates

No CODE? candidate has a direct raw or lifted control-reference target. This makes the current CODE? frontier mostly a decode heuristic frontier, not an observed control-flow frontier.

## Decode Windows

### 0x08DDDC (28 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x08DDDC | 28 24 | jr-conditional cond=Z target=0x08DE02 |
| 0x08DDDE | 00 | nop |
| 0x08DDDF | 22 25 00 23 | ld-pair-mem pair=HL addr=0x230025 |
| 0x08DDE3 | BF | alu-reg CP src=A |
| 0x08DDE4 | 00 | nop |
| 0x08DDE5 | 25 | dec-reg |
| 0x08DDE6 | C1 | pop pair=BC |
| 0x08DDE7 | 00 | nop |
| 0x08DDE8 | 26 BC | ld-reg-imm dest=H value=0xBC |
| 0x08DDEA | 00 | nop |
| 0x08DDEB | 27 | daa |
| 0x08DDEC | B2 | alu-reg OR src=D |

### 0x0A4B97 (28 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x0A4B97 | 00 | nop |
| 0x0A4B98 | CC CC CC CC | call-conditional cond=Z target=0xCCCCCC |
| 0x0A4B9C | CC CC CC FC | call-conditional cond=Z target=0xFCCCCC |
| 0x0A4BA0 | 78 | ld-reg-reg dest=A src=B |
| 0x0A4BA1 | 00 | nop |
| 0x0A4BA2 | 00 | nop |
| 0x0A4BA3 | 00 | nop |
| 0x0A4BA4 | 00 | nop |
| 0x0A4BA5 | 00 | nop |
| 0x0A4BA6 | 00 | nop |
| 0x0A4BA7 | 00 | nop |
| 0x0A4BA8 | 00 | nop |

### 0x0BCAAC (28 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x0BCAAC | 01 00 00 07 | ld-pair-imm pair=BC value=0x70000 |
| 0x0BCAB0 | 05 | dec-reg |
| 0x0BCAB1 | 81 | alu-reg ADD src=C |
| 0x0BCAB2 | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCAB3 | 40 00 | nop |
| 0x0BCAB5 | 00 | nop |
| 0x0BCAB6 | 07 | rlca |
| 0x0BCAB7 | 05 | dec-reg |
| 0x0BCAB8 | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCAB9 | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCABA | 40 00 | nop |
| 0x0BCABC | 00 | nop |

### 0x0BCAEF (28 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x0BCAEF | 01 00 00 07 | ld-pair-imm pair=BC value=0x70000 |
| 0x0BCAF3 | 05 | dec-reg |
| 0x0BCAF4 | 81 | alu-reg ADD src=C |
| 0x0BCAF5 | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCAF6 | 40 00 | nop |
| 0x0BCAF8 | 00 | nop |
| 0x0BCAF9 | 07 | rlca |
| 0x0BCAFA | 05 | dec-reg |
| 0x0BCAFB | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCAFC | 02 | ld-ind-reg dest=BC src=A |
| 0x0BCAFD | 40 00 | nop |
| 0x0BCAFF | 00 | nop |

### 0x004499 (27 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x004499 | F8 | ret-conditional cond=M |
| 0x00449A | F8 | ret-conditional cond=M |
| 0x00449B | F8 | ret-conditional cond=M |
| 0x00449C | C0 | ret-conditional cond=NZ |
| 0x00449D | 18 C0 | jr target=0x00445F |
| 0x00449F | 18 C0 | jr target=0x004461 |
| 0x0044A1 | 18 C0 | jr target=0x004463 |
| 0x0044A3 | 18 C0 | jr target=0x004465 |
| 0x0044A5 | 18 F8 | jr target=0x00449F |
| 0x0044A7 | C0 | ret-conditional cond=NZ |
| 0x0044A8 | F8 | ret-conditional cond=M |
| 0x0044A9 | E0 | ret-conditional cond=PO |

### 0x004AB9 (27 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x004AB9 | 18 78 | jr target=0x004B33 |
| 0x004ABB | F8 | ret-conditional cond=M |
| 0x004ABC | 38 F8 | jr-conditional cond=C target=0x004AB6 |
| 0x004ABE | 00 | nop |
| 0x004ABF | 18 00 | jr target=0x004AC1 |
| 0x004AC1 | 18 18 | jr target=0x004ADB |
| 0x004AC3 | F0 | ret-conditional cond=P |
| 0x004AC4 | 38 E0 | jr-conditional cond=C target=0x004AA6 |
| 0x004AC6 | 00 | nop |
| 0x004AC7 | 00 | nop |
| 0x004AC8 | 00 | nop |
| 0x004AC9 | 00 | nop |

### 0x014BE0 (27 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x014BE0 | 01 00 00 07 | ld-pair-imm pair=BC value=0x70000 |
| 0x014BE4 | 05 | dec-reg |
| 0x014BE5 | 81 | alu-reg ADD src=C |
| 0x014BE6 | 02 | ld-ind-reg dest=BC src=A |
| 0x014BE7 | 40 00 | nop |
| 0x014BE9 | 00 | nop |
| 0x014BEA | 07 | rlca |
| 0x014BEB | 05 | dec-reg |
| 0x014BEC | 02 | ld-ind-reg dest=BC src=A |
| 0x014BED | 02 | ld-ind-reg dest=BC src=A |
| 0x014BEE | 40 00 | nop |
| 0x014BF0 | 00 | nop |

### 0x05213B (27 bytes)

- Raw direct control refs into range: none found.
- Lifted direct control refs into range: none found.

| pc | bytes | decode |
| --- | --- | --- |
| 0x05213B | B4 | alu-reg OR src=H |
| 0x05213C | D1 | pop pair=DE |
| 0x05213D | 3C | inc-reg |
| 0x05213E | D4 B3 D6 1A | call-conditional cond=NC target=0x1AD6B3 |
| 0x052142 | D9 | exx |
| 0x052143 | 6F | ld-reg-reg dest=L src=A |
| 0x052144 | DB B4 | in-imm |
| 0x052146 | DD E7 | rst target=0x000020 |
| 0x052148 | DF | rst target=0x000018 |
| 0x052149 | 09 | add-pair dest=HL src=BC |
| 0x05214A | E2 19 E4 17 | jp-conditional cond=PO target=0x17E419 |
| 0x05214E | E6 04 | alu-imm AND value=0x04 |

## Interpretation

- The remaining executable-looking frontier is small: less than 2 KB, and the largest top audit holes are still strings or data tables.
- The top CODE? entries decode as small branch islands/wrappers rather than large missing functions. Most have no lifted direct caller metadata, so they are better treated as candidate seed/decode notes than immediate runtime blockers.
- Because this tick is scoped probe/report-only, no seed list or transpiler edit was made. A future coverage-push tick can choose from the ranked candidate table if seed edits are explicitly in scope.

## Compact JSON

```json
{
  "pass": true,
  "totalCovered": 713656,
  "totalUncovered": 31921,
  "rangeCount": 2946,
  "verdictBytes": {
    "DATA-MIXED": 21883,
    "DATA-SPARSE": 5676,
    "STRINGS": 2410,
    "CODE?": 1952
  },
  "codeCandidateCount": 94,
  "refBackedCandidateCount": 0,
  "rawRefTotal": 0,
  "liftedRefTotal": 0,
  "topCandidates": [
    {
      "start": "0x08DDDC",
      "end": "0x08DDF7",
      "len": 28,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "alu-reg OR src=D",
      "first16": "28 24 00 22 25 00 23 BF 00 25 C1 00 26 BC 00 27"
    },
    {
      "start": "0x0A4B97",
      "end": "0x0A4BB2",
      "len": 28,
      "decodedInstructions": 12,
      "decodedBytes": 18,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "00 CC CC CC CC CC CC CC FC 78 00 00 00 00 00 00"
    },
    {
      "start": "0x0BCAAC",
      "end": "0x0BCAC7",
      "len": 28,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00"
    },
    {
      "start": "0x0BCAEF",
      "end": "0x0BCB0A",
      "len": 28,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00"
    },
    {
      "start": "0x004499",
      "end": "0x0044B3",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "ret-conditional cond=PO",
      "first16": "F8 F8 F8 C0 18 C0 18 C0 18 C0 18 C0 18 F8 C0 F8"
    },
    {
      "start": "0x004AB9",
      "end": "0x004AD3",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "18 78 F8 38 F8 00 18 00 18 18 F0 38 E0 00 00 00"
    },
    {
      "start": "0x014BE0",
      "end": "0x014BFA",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 17,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "01 00 00 07 05 81 02 40 00 00 07 05 02 02 40 00"
    },
    {
      "start": "0x05213B",
      "end": "0x052155",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 21,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "alu-imm AND value=0x04",
      "first16": "B4 D1 3C D4 B3 D6 1A D9 6F DB B4 DD E7 DF 09 E2"
    },
    {
      "start": "0x05915F",
      "end": "0x059179",
      "len": 27,
      "decodedInstructions": 11,
      "decodedBytes": 27,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "call-conditional cond=C target=0x00FA00 -> 0x00FA00",
      "first16": "00 D3 00 D2 00 D4 00 D6 00 F3 00 F2 00 F4 00 F6"
    },
    {
      "start": "0x05CD1D",
      "end": "0x05CD37",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 21,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "14 CC 05 67 CD 05 3C CD 05 6C CD 05 33 CD 05 70"
    },
    {
      "start": "0x086CFB",
      "end": "0x086D15",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 16,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "ld-ind-reg dest=HL src=E",
      "first16": "6D 08 B1 6E 08 ED 70 08 11 6F 08 68 73 08 91 73"
    },
    {
      "start": "0x09C26B",
      "end": "0x09C285",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 24,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "jp target=0xC3BA09 -> 0xC3BA09",
      "first16": "09 DF C3 09 E4 C3 09 E9 C3 09 EE C3 09 9D C3 09"
    },
    {
      "start": "0x0A43B8",
      "end": "0x0A43D2",
      "len": 27,
      "decodedInstructions": 12,
      "decodedBytes": 19,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "call-conditional cond=M target=0x1C0CFC -> 0x1C0CFC",
      "first16": "7E 00 3C 00 18 00 18 00 18 00 18 00 08 00 00 FC"
    },
    {
      "start": "0x005302",
      "end": "0x00531B",
      "len": 26,
      "decodedInstructions": 12,
      "decodedBytes": 19,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "ret-conditional cond=NZ",
      "first16": "38 38 30 18 30 18 38 38 38 F0 30 E0 30 00 70 00"
    },
    {
      "start": "0x050690",
      "end": "0x0506A9",
      "len": 26,
      "decodedInstructions": 12,
      "decodedBytes": 19,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "alu-reg CP src=E",
      "first16": "29 00 00 1B BB 01 28 78 C1 2C C3 2C C7 5D 29 00"
    },
    {
      "start": "0x08983D",
      "end": "0x089856",
      "len": 26,
      "decodedInstructions": 12,
      "decodedBytes": 18,
      "rawRefs": [],
      "liftedRefs": [],
      "terminal": "nop",
      "first16": "F9 09 00 80 00 01 09 00 80 00 01 09 00 80 C7 E1"
    }
  ]
}
```

