# Phase 867: 0x058212 Flag Owner Trace

Probe: `probe-phase867-058212-flag-owner.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase867-058212-flag-owner.mjs`

## Summary

- Result: PASS.
- Phase865 split reproduced: previous=0x058A14, harness next=0x058A2C, live next=0x058A16.
- Flag-owner finding: **0x058212 reaches 0x05E3E3 in both routes; the decisive compare is D0243A-D02437 / D0243A-D02437 at 0x04C973. Harness compares HL=0xD1A8CC to DE=0xD1A8A3 and returns F=0x0A (Z=0); live compares HL=0xD1A8CC to DE=0xD1A8CC and returns F=0x4A (Z=1).**
- Harness pointer state at return: D02437=0xD1A8A3, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02440=0xD2A83E.
- Live pointer state at return: D02437=0xD1A8CC, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02440=0xD2A83E.
- Interpretation: the upstream `0x0800B8` mode gate is not the decisive split. The decisive state is the edit-buffer compare inside `0x05E3E3`: live has `D02437 == D0243A == 0xD1A8CC` and returns Z, while the harness has `D02437=0xD1A8A3` with `D0243A=0xD1A8CC` and returns NZ toward the owner path.

## 0x04C973 Compare Trace

| # | Role | Harness HL | Harness DE | Harness F | Harness Z | Live HL | Live DE | Live F | Live Z |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |
| 1 | D02440-D0243D | 0xD2A83E | 0xD2A83E | 0x4A | 1 | 0xD2A83E | 0xD2A83E | 0x4A | 1 |
| 2 | D0243A-D02437 | 0xD1A8CC | 0xD1A8A3 | 0x0A | 0 | 0xD1A8CC | 0xD1A8CC | 0x4A | 1 |

## Harness 0x058212 Window

| # | PC | Prev | AF | DE | HL | D000C4 | D010F4 | D02437 | D0243A | D0243D | D02440 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x058A10 | 0x058A0C | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 1 | 0x058212 | 0x058A10 | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 2 | 0x0800B8 | 0x058212 | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 3 | 0x058216 | 0x0800B8 | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 4 | 0x05E3E3 | 0x05821D | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 5 | 0x05E3F5 | 0x05E3E3 | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 6 | 0x04C973 | 0x05E3F5 | 0x0954 | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 7 | 0x05E3E7 | 0x04C973 | 0x094A | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 8 | 0x05E3E8 | 0x05E3E7 | 0x094A | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 9 | 0x04C973 | 0x05E3E8 | 0x094A | 0xD1A8A3 | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 10 | 0x058221 | 0x04C973 | 0x090A | 0xD1A8A3 | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 11 | 0x058A14 | 0x058221 | 0x090A | 0xD1A8A3 | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |

## Live 0x058212 Window

| # | PC | Prev | AF | DE | HL | D000C4 | D010F4 | D02437 | D0243A | D0243D | D02440 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x058A10 | 0x058A0C | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 1 | 0x058212 | 0x058A10 | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 2 | 0x0800B8 | 0x058212 | 0x0942 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 3 | 0x058216 | 0x0800B8 | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 4 | 0x05E3E3 | 0x05821D | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 5 | 0x05E3F5 | 0x05E3E3 | 0x0954 | 0xD2003E | 0x0585E9 | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 6 | 0x04C973 | 0x05E3F5 | 0x0954 | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 7 | 0x05E3E7 | 0x04C973 | 0x094A | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 8 | 0x05E3E8 | 0x05E3E7 | 0x094A | 0xD2A83E | 0xD2A83E | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 9 | 0x04C973 | 0x05E3E8 | 0x094A | 0xD1A8CC | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 10 | 0x058221 | 0x04C973 | 0x094A | 0xD1A8CC | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |
| 11 | 0x058A14 | 0x058221 | 0x094A | 0xD1A8CC | 0xD1A8CC | 0x00 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E |

## Divergence Diffs At 0x058A14

| Kind | Name | Harness | Live |
| --- | --- | --- | --- |
| cpu | AF | 0x00090A | 0x00094A |
| cpu | DE | 0xD1A8A3 | 0xD1A8CC |
| cpu | F | 0x00000A | 0x00004A |
| field | D02317 | 0x000000 | 0xD2A83E |
| field | D0231A | 0x000000 | 0xD2A83E |
| field | D0231D | 0x000000 | 0xD2A83D |
| field | D02437 | 0xD1A8A3 | 0xD1A8CC |

## Static Decode: 0x058212 Dispatcher

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x058A10 | `CD 12 82 05` | CALL 0x058212 |
| 0x058A14 | `20 16` | JR NZ, 0x058A2C |
| 0x058A16 | `CD 3A 22 0A` | CALL 0x0A223A |
| 0x058A1A | `FD CB 49 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":73,"mode":"adl","modePrefix":null} |
| 0x058A1E | `CD 54 8D 05` | CALL 0x058D54 |
| 0x058A22 | `CD B8 00 08` | CALL 0x0800B8 |
| 0x0800B8 | `FD CB 44 6E` | indexed-cb-bit {"bit":5,"indexRegister":"iy","displacement":68,"mode":"adl","modePrefix":null} |
| 0x0800BC | `C9` | RET |
| 0x09142B | `CD 81 0B 09` | CALL 0x090B81 |
| 0x09142F | `C0` | RET NZ |
| 0x091430 | `CD E3 E3 05` | CALL 0x05E3E3 |
| 0x091434 | `C9` | RET |
| 0x090B81 | `3A F4 10 D0` | LD A, (0xD010F4) |
| 0x090B85 | `FE 1F` | CP 0x1F |
| 0x090B87 | `C9` | RET |

## Static Decode: Pointer Compare Helpers

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x05E3E3 | `CD F5 E3 05` | CALL 0x05E3F5 |
| 0x05E3E7 | `C0` | RET NZ |
| 0x05E3E8 | `2A 3A 24 D0` | ld-pair-mem {"pair":"hl","addr":13640762,"direction":"from-mem","mode":"adl","modePrefix":null} |
| 0x05E3EC | `ED 5B 37 24 D0` | ld-pair-mem {"pair":"de","addr":13640759,"mode":"adl","modePrefix":null} |
| 0x05E3F1 | `C3 73 C9 04` | JP 0x04C973 |
| 0x05E3F5 | `ED 5B 3D 24 D0` | ld-pair-mem {"pair":"de","addr":13640765,"mode":"adl","modePrefix":null} |
| 0x05E3FA | `2A 40 24 D0` | ld-pair-mem {"pair":"hl","addr":13640768,"direction":"from-mem","mode":"adl","modePrefix":null} |
| 0x05E3FE | `C3 73 C9 04` | JP 0x04C973 |
| 0x04C973 | `E5` | PUSH HL |
| 0x04C974 | `B7` | OR A |
| 0x04C975 | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x04C977 | `E1` | POP HL |
| 0x04C978 | `C9` | RET |

## Machine JSON

```json
{
  "pass": true,
  "classification": {
    "index": 4526,
    "previousCommonPc": "0x058A14",
    "harnessNextPc": "0x058A2C",
    "liveNextPc": "0x058A16",
    "controllingState": "Z flag at 0x058A14 JR NZ: harness F=0x0A (Z=0) takes 0x058A2C, live F=0x4A (Z=1) falls through 0x058A16; DE also differs (0xD1A8A3 vs 0xD1A8CC)",
    "diffs": [
      {
        "kind": "cpu",
        "name": "AF",
        "harness": "0x00090A",
        "live": "0x00094A"
      },
      {
        "kind": "cpu",
        "name": "DE",
        "harness": "0xD1A8A3",
        "live": "0xD1A8CC"
      },
      {
        "kind": "cpu",
        "name": "F",
        "harness": "0x00000A",
        "live": "0x00004A"
      },
      {
        "kind": "field",
        "name": "D02317",
        "harness": "0x000000",
        "live": "0xD2A83E"
      },
      {
        "kind": "field",
        "name": "D0231A",
        "harness": "0x000000",
        "live": "0xD2A83E"
      },
      {
        "kind": "field",
        "name": "D0231D",
        "harness": "0x000000",
        "live": "0xD2A83D"
      },
      {
        "kind": "field",
        "name": "D02437",
        "harness": "0xD1A8A3",
        "live": "0xD1A8CC"
      }
    ]
  },
  "flagOwner": {
    "harness": {
      "found": true,
      "callIndex": 4513,
      "returnIndex": 4525,
      "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
      "rows": [
        {
          "index": 4513,
          "block": 4925,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058A10",
          "prevPc": "0x058A0C",
          "cpu": {
            "pc": "0x058A10",
            "currentBlockPc": "0x058A10",
            "sp": "0xD1A854",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ]
        },
        {
          "index": 4514,
          "block": 4926,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058212",
          "prevPc": "0x058A10",
          "cpu": {
            "pc": "0x058212",
            "currentBlockPc": "0x058212",
            "sp": "0xD1A851",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4515,
          "block": 4927,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x0800B8",
          "prevPc": "0x058212",
          "cpu": {
            "pc": "0x0800B8",
            "currentBlockPc": "0x0800B8",
            "sp": "0xD1A84E",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058216"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4516,
          "block": 4928,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84,
            "flags": {
              "z": true,
              "c": false,
              "pv": true
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4518,
          "block": 4930,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x05E3E3",
          "prevPc": "0x05821D",
          "cpu": {
            "pc": "0x05E3E3",
            "currentBlockPc": "0x05E3E3",
            "sp": "0xD1A84E",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84,
            "flags": {
              "z": true,
              "c": false,
              "pv": true
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4519,
          "block": 4931,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x05E3F5",
          "prevPc": "0x05E3E3",
          "cpu": {
            "pc": "0x05E3F5",
            "currentBlockPc": "0x05E3F5",
            "sp": "0xD1A84B",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84,
            "flags": {
              "z": true,
              "c": false,
              "pv": true
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0x05E3E7"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        {
          "index": 4520,
          "block": 4932,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x04C973",
          "prevPc": "0x05E3F5",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "sp": "0xD1A84B",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84,
            "flags": {
              "z": true,
              "c": false,
              "pv": true
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0x05E3E7"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        {
          "index": 4521,
          "block": 4933,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x05E3E7",
          "prevPc": "0x04C973",
          "cpu": {
            "pc": "0x05E3E7",
            "currentBlockPc": "0x05E3E7",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4522,
          "block": 4934,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E7",
          "cpu": {
            "pc": "0x05E3E8",
            "currentBlockPc": "0x05E3E8",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4523,
          "block": 4935,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x04C973",
          "prevPc": "0x05E3E8",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8A3",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4524,
          "block": 4936,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058221",
          "prevPc": "0x04C973",
          "cpu": {
            "pc": "0x058221",
            "currentBlockPc": "0x058221",
            "sp": "0xD1A851",
            "af": "0x090A",
            "bc": "0x000900",
            "de": "0xD1A8A3",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 10,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4525,
          "block": 4937,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058A14",
          "prevPc": "0x058221",
          "cpu": {
            "pc": "0x058A14",
            "currentBlockPc": "0x058A14",
            "sp": "0xD1A854",
            "af": "0x090A",
            "bc": "0x000900",
            "de": "0xD1A8A3",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 10,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ]
        }
      ],
      "compareRows": [
        {
          "role": "D02440-D0243D",
          "pc": "0x04C973",
          "nextPc": "0x05E3E7",
          "hl": 13805630,
          "de": 13805630,
          "resultF": 74,
          "resultZ": true
        },
        {
          "role": "D0243A-D02437",
          "pc": "0x04C973",
          "nextPc": "0x058221",
          "hl": 13740236,
          "de": 13740195,
          "resultF": 10,
          "resultZ": false
        }
      ],
      "branchAfter0800B8": {
        "index": 4516,
        "block": 4928,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x058216",
        "prevPc": "0x0800B8",
        "cpu": {
          "pc": "0x058216",
          "currentBlockPc": "0x058216",
          "sp": "0xD1A851",
          "af": "0x0954",
          "bc": "0x000900",
          "de": "0xD2003E",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84,
          "flags": {
            "z": true,
            "c": false,
            "pv": true
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D02317": 0,
            "D0231A": 0,
            "D0231D": 0,
            "D02437": 13740195,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02440": 13805630,
            "D010F4": 0,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 0,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000C4_IY44": 0,
            "D000CC_IY4C": 0,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x00",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x058A14"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          }
        ]
      },
      "gate": {
        "D000C4_IY44": 0,
        "bit5Set": false,
        "branchF": 84,
        "branchZ": true,
        "D010F4": 0
      },
      "pointerState": {
        "D02437": 13740195,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02440": 13805630,
        "firstCompareEqual": true,
        "secondCompareEqual": false
      },
      "returnState": {
        "af": 2314,
        "f": 10,
        "z": false,
        "de": 13740195,
        "hl": 13740236
      }
    },
    "live": {
      "found": true,
      "callIndex": 4513,
      "returnIndex": 4525,
      "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
      "rows": [
        {
          "index": 4513,
          "block": 4925,
          "pc": "0x058A10",
          "prevPc": "0x058A0C",
          "cpu": {
            "pc": "0x058A10",
            "currentBlockPc": "0x058A10",
            "stepCount": 4935,
            "sp": "0xD1A854",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ]
        },
        {
          "index": 4514,
          "block": 4926,
          "pc": "0x058212",
          "prevPc": "0x058A10",
          "cpu": {
            "pc": "0x058212",
            "currentBlockPc": "0x058212",
            "stepCount": 4936,
            "sp": "0xD1A851",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4515,
          "block": 4927,
          "pc": "0x0800B8",
          "prevPc": "0x058212",
          "cpu": {
            "pc": "0x0800B8",
            "currentBlockPc": "0x0800B8",
            "stepCount": 4937,
            "sp": "0xD1A84E",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 66
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058216"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4516,
          "block": 4928,
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "stepCount": 4938,
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4518,
          "block": 4930,
          "pc": "0x05E3E3",
          "prevPc": "0x05821D",
          "cpu": {
            "pc": "0x05E3E3",
            "currentBlockPc": "0x05E3E3",
            "stepCount": 4940,
            "sp": "0xD1A84E",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4519,
          "block": 4931,
          "pc": "0x05E3F5",
          "prevPc": "0x05E3E3",
          "cpu": {
            "pc": "0x05E3F5",
            "currentBlockPc": "0x05E3F5",
            "stepCount": 4941,
            "sp": "0xD1A84B",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0x05E3E7"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        {
          "index": 4520,
          "block": 4932,
          "pc": "0x04C973",
          "prevPc": "0x05E3F5",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "stepCount": 4942,
            "sp": "0xD1A84B",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0x05E3E7"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ]
        },
        {
          "index": 4521,
          "block": 4933,
          "pc": "0x05E3E7",
          "prevPc": "0x04C973",
          "cpu": {
            "pc": "0x05E3E7",
            "currentBlockPc": "0x05E3E7",
            "stepCount": 4943,
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4522,
          "block": 4934,
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E7",
          "cpu": {
            "pc": "0x05E3E8",
            "currentBlockPc": "0x05E3E8",
            "stepCount": 4944,
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4523,
          "block": 4935,
          "pc": "0x04C973",
          "prevPc": "0x05E3E8",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "stepCount": 4945,
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ]
        },
        {
          "index": 4524,
          "block": 4936,
          "pc": "0x058221",
          "prevPc": "0x04C973",
          "cpu": {
            "pc": "0x058221",
            "currentBlockPc": "0x058221",
            "stepCount": 4946,
            "sp": "0xD1A851",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ]
        },
        {
          "index": 4525,
          "block": 4937,
          "pc": "0x058A14",
          "prevPc": "0x058221",
          "cpu": {
            "pc": "0x058A14",
            "currentBlockPc": "0x058A14",
            "stepCount": 4947,
            "sp": "0xD1A854",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D010F4": "0x00",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ]
        }
      ],
      "compareRows": [
        {
          "role": "D02440-D0243D",
          "pc": "0x04C973",
          "nextPc": "0x05E3E7",
          "hl": 13805630,
          "de": 13805630,
          "resultF": 74,
          "resultZ": true
        },
        {
          "role": "D0243A-D02437",
          "pc": "0x04C973",
          "nextPc": "0x058221",
          "hl": 13740236,
          "de": 13740236,
          "resultF": 74,
          "resultZ": true
        }
      ],
      "branchAfter0800B8": {
        "index": 4516,
        "block": 4928,
        "pc": "0x058216",
        "prevPc": "0x0800B8",
        "cpu": {
          "pc": "0x058216",
          "currentBlockPc": "0x058216",
          "stepCount": 4938,
          "sp": "0xD1A851",
          "af": "0x0954",
          "bc": "0x000900",
          "de": "0xD2003E",
          "hl": "0x0585E9",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x00",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x058A14"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          }
        ]
      },
      "gate": {
        "D000C4_IY44": 0,
        "bit5Set": false,
        "branchF": 84,
        "branchZ": true,
        "D010F4": 0
      },
      "pointerState": {
        "D02437": 13740236,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02440": 13805630,
        "firstCompareEqual": true,
        "secondCompareEqual": true
      },
      "returnState": {
        "af": 2378,
        "f": 74,
        "z": true,
        "de": 13740236,
        "hl": 13740236
      }
    },
    "controller": "0x058212 reaches 0x05E3E3 in both routes; the decisive compare is D0243A-D02437 / D0243A-D02437 at 0x04C973. Harness compares HL=0xD1A8CC to DE=0xD1A8A3 and returns F=0x0A (Z=0); live compares HL=0xD1A8CC to DE=0xD1A8CC and returns F=0x4A (Z=1)."
  },
  "harness": {
    "clearResult": {
      "steps": 4986,
      "termination": "captured-0a31e2-to-0a31a2",
      "lastPc": "0x0A31A2",
      "lastMode": "adl"
    },
    "targetCounts": {
      "flagCaller058A10": 1,
      "flagOwner058212": 1,
      "flagGate0800B8": 3,
      "flagBranch058216": 1,
      "flagMode09142B": 0,
      "flagModeCheck090B81": 0,
      "flagCompare05E3E3": 1,
      "flagCompareD0243D05E3F5": 1,
      "flagCompareD0243A05E3E8": 2,
      "flagCompare04C973": 8,
      "flagReturn058A14": 1,
      "anchor0A229D": 0,
      "liveSpin0A1854": 80,
      "owner0A31FD": 1,
      "ownerSetup0A322B": 1,
      "ownerEntry0A321D": 1,
      "copySetup0A31B8": 1,
      "destructiveCopy0A31E2": 1,
      "postCopy0A31A2": 1,
      "cleanup0018F8": 0,
      "poll006D64": 0
    }
  },
  "live": {
    "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
    "keyState": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 160000,
      "termination": "max_steps",
      "wipes": 1,
      "D0243A": 0,
      "D0243D": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02590": 0,
      "D000C2": 0,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8689,
      "vramCurrent": 3031
    },
    "targetCounts": {
      "flagCaller058A10": 1,
      "flagOwner058212": 1,
      "flagGate0800B8": 3,
      "flagBranch058216": 1,
      "flagMode09142B": 0,
      "flagModeCheck090B81": 0,
      "flagCompare05E3E3": 1,
      "flagCompareD0243D05E3F5": 1,
      "flagCompareD0243A05E3E8": 1,
      "flagCompare04C973": 8,
      "flagReturn058A14": 1,
      "anchor0A229D": 1,
      "liveSpin0A1854": 112,
      "owner0A31FD": 0,
      "ownerSetup0A322B": 0,
      "ownerEntry0A321D": 0,
      "copySetup0A31B8": 0,
      "destructiveCopy0A31E2": 0,
      "postCopy0A31A2": 0,
      "cleanup0018F8": 1,
      "poll006D64": 9167
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

