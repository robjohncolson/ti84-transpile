# Phase 873: Cleanup-Leg Decode

Probe: `probe-phase873-cleanup-leg-decode.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase873-cleanup-leg-decode.mjs`

## Summary

- Result: PASS.
- Dynamic source: `phase872-d010-port-bit-ab.md` Machine JSON, source pass=yes.
- Port-0x03 controller observed: yes.
- Port-skip route still wipes: yes.
- Shared clear-tail parameters: yes (BC/DE/HL identical at 0x0018F8).
- D0301B sentinel controller: observed via 0x001881 -> 0x0018F8; capture before/after CLEAR=0x5AA55A/0x5AA55A, magic=0x5AA55A.
- Adjudication: The cleanup cluster has two observed entry legs and one observed destructive clear tail. Port 0x03 bit 4 at 0x001872 selects the optional 0x001879 port-9 setup versus the 0x0018AF skip leg. Inside the skip leg, the RAM sentinel at D0301B is compared with 0x5AA55A; the observed port-skip edge 0x001881 -> 0x0018F8 proves the live route took the D0301B-mismatch path into the same large clear body as baseline. If D0301B matched the magic value, static decode shows the route would load the short-tail parameters BC=0x25, HL=D000FF, DE=D00100 before 0x0018F8 instead.

## Dynamic Counts

| Variant | 0x001872 | 0x0018AF | 0x001879 | 0x0018F8 | 0x006D64 | Wipes | Termination |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 1 | 0 | 1 | 1 | 9167 | 1 | max_steps |
| D010 replay only | 1 | 0 | 1 | 1 | 9167 | 1 | max_steps |
| port bit skip only | 1 | 1 | 0 | 1 | 9041 | 1 | max_steps |
| D010 replay + port bit skip | 1 | 1 | 0 | 1 | 9041 | 1 | max_steps |

## Dynamic Edges And Tail Registers

| Variant | Branch edge | Skip edge | Pre-wipe edge | Cleanup edge | Cleanup AF | Cleanup BC | Cleanup DE | Cleanup HL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 0x001872 -> 0x001879 | - -> - | 0x001872 -> 0x001879 | 0x001879 -> 0x0018F8 | 0x5200 (F=0x00 Z=0 C=0) | 0x0000FF | 0xD3FF00 | 0xD3FEFF |
| D010 replay only | 0x001872 -> 0x001879 | - -> - | 0x001872 -> 0x001879 | 0x001879 -> 0x0018F8 | 0x5200 (F=0x00 Z=0 C=0) | 0x0000FF | 0xD3FF00 | 0xD3FEFF |
| port bit skip only | 0x001872 -> 0x0018AF | 0x001872 -> 0x0018AF | - -> - | 0x001881 -> 0x0018F8 | 0x5281 (F=0x81 Z=0 C=1) | 0x0000FF | 0xD3FF00 | 0xD3FEFF |
| D010 replay + port bit skip | 0x001872 -> 0x0018AF | 0x001872 -> 0x0018AF | - -> - | 0x001881 -> 0x0018F8 | 0x5281 (F=0x81 Z=0 C=1) | 0x0000FF | 0xD3FF00 | 0xD3FEFF |

## Post-Key Field Comparison

| Field | Oracle after CLEAR | baseline | D010 replay only | port bit skip only | D010 replay + port bit skip |
| --- | --- | --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D008E0 | 0xD1A86C | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010EF | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010FE | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010F4 | 0x1F | 0x00 | 0x00 | 0x00 | 0x00 |
| D02437 | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0243A | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0243D | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02440 | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02505 | 0x0A | 0x00 | 0x00 | 0x00 | 0x00 |
| D02590 | 0xD3FE81 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0259D | 0xD3FECD | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02A29 | 0x0000 | 0x0000 | 0x0000 | 0x0000 | 0x0000 |

## Static Decode: Port-0x03 Branch And Baseline Clear Body

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x00186A | `FD CB 42 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x00186E | `CD DE 58 01` | CALL 0x0158DE |
| 0x001872 | `ED 38 03` | IN0 A, (0x03) |
| 0x001875 | `CB 67` | BIT 4, A |
| 0x001877 | `20 36` | JR NZ, 0x0018AF |
| 0x001879 | `ED 38 09` | IN0 A, (0x09) |
| 0x00187C | `CB E7` | SET 4, A |
| 0x00187E | `ED 39 09` | OUT0 (0x09), A |
| 0x001881 | `21 00 00 D0` | LD HL, 0xD00000 |
| 0x001885 | `11 01 00 D0` | LD DE, 0xD00001 |
| 0x001889 | `01 D7 3F 01` | LD BC, 0x013FD7 |
| 0x00188D | `36 00` | LD (), 0x00 |
| 0x00188F | `ED B0` | LDIR |
| 0x001891 | `21 7C 78 D1` | LD HL, 0xD1787C |
| 0x001895 | `11 7D 78 D1` | LD DE, 0xD1787D |
| 0x001899 | `01 01 20 00` | LD BC, 0x002001 |
| 0x00189D | `36 00` | LD (), 0x00 |
| 0x00189F | `ED B0` | LDIR |
| 0x0018A1 | `21 FF FE D3` | LD HL, 0xD3FEFF |
| 0x0018A5 | `11 00 FF D3` | LD DE, 0xD3FF00 |
| 0x0018A9 | `01 FF 00 00` | LD BC, 0x0000FF |
| 0x0018AD | `18 49` | JR 0x0018F8 |

## Static Decode: Port-Skip Leg Beyond 0x0018AF

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0018AF | `ED 38 07` | IN0 A, (0x07) |
| 0x0018B2 | `CB E7` | SET 4, A |
| 0x0018B4 | `ED 39 07` | OUT0 (0x07), A |
| 0x0018B7 | `FD CB 42 7E` | indexed-cb-bit {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x0018BB | `28 1A` | JR Z, 0x0018D7 |
| 0x0018BD | `3E 08` | LD A, 0x08 |
| 0x0018BF | `32 00 00 F8` | LD (0xF80000), A |
| 0x0018C3 | `ED 38 09` | IN0 A, (0x09) |
| 0x0018C6 | `CB A7` | bit-res {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x0018C8 | `ED 39 09` | OUT0 (0x09), A |
| 0x0018CB | `3A 0C 00 F9` | LD A, (0xF9000C) |
| 0x0018CF | `CB F7` | SET 6, A |
| 0x0018D1 | `32 0C 00 F9` | LD (0xF9000C), A |
| 0x0018D5 | `18 08` | JR 0x0018DF |
| 0x0018D7 | `ED 38 09` | IN0 A, (0x09) |
| 0x0018DA | `CB E7` | SET 4, A |
| 0x0018DC | `ED 39 09` | OUT0 (0x09), A |
| 0x0018DF | `B7` | OR A |
| 0x0018E0 | `2A 1B 30 D0` | ld-pair-mem {"pair":"hl","addr":13643803,"direction":"from-mem","mode":"adl","modePrefix":null} |
| 0x0018E4 | `11 5A A5 5A` | LD DE, 0x5AA55A |
| 0x0018E8 | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x0018EA | `20 95` | JR NZ, 0x001881 |
| 0x0018EC | `01 25 00 00` | LD BC, 0x000025 |
| 0x0018F0 | `21 FF 00 D0` | LD HL, 0xD000FF |
| 0x0018F4 | `11 00 01 D0` | LD DE, 0xD00100 |

## Static Decode: Common Clear Tail At 0x0018F8

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0018F8 | `36 00` | LD (), 0x00 |
| 0x0018FA | `ED B0` | LDIR |
| 0x0018FC | `AF` | XOR A |
| 0x0018FD | `32 B7 77 D1` | LD (0xD177B7), A |
| 0x001901 | `3E 95` | LD A, 0x95 |
| 0x001903 | `32 8F 05 D0` | LD (0xD0058F), A |
| 0x001907 | `CD 96 5B 00` | CALL 0x005B96 |
| 0x00190B | `CD B1 5B 00` | CALL 0x005BB1 |
| 0x00190F | `ED 38 03` | IN0 A, (0x03) |
| 0x001912 | `CB 67` | BIT 4, A |
| 0x001914 | `C8` | RET Z |
| 0x001915 | `FD CB 42 7E` | indexed-cb-bit {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x001919 | `C8` | RET Z |
| 0x00191A | `ED 38 0C` | IN0 A, (0x0C) |
| 0x00191D | `CB D7` | SET 2, A |
| 0x00191F | `ED 39 0C` | OUT0 (0x0C), A |
| 0x001922 | `3E 08` | LD A, 0x08 |
| 0x001924 | `32 00 00 F8` | LD (0xF80000), A |
| 0x001928 | `3A 0C 00 F9` | LD A, (0xF9000C) |
| 0x00192C | `CB F7` | SET 6, A |
| 0x00192E | `32 0C 00 F9` | LD (0xF9000C), A |

## Machine JSON

```json
{
  "pass": true,
  "source": {
    "report": "phase872-d010-port-bit-ab.md",
    "sourcePass": true
  },
  "cleanupTailSame": true,
  "port03ControllerObserved": true,
  "skipStillWipes": true,
  "observedSharedTail": true,
  "clearTailUnconditional": false,
  "sentinelControllerObserved": true,
  "d0301bSentinel": {
    "addr": "0xD0301B",
    "magic": "0x5AA55A",
    "preClearCapture": "0x5AA55A",
    "afterClearCapture": "0x5AA55A",
    "observedBranch": "port-skip cleanup edge 0x001881 -> 0x0018F8 implies JR NZ at 0x0018EA was taken, so live D0301B did not equal 0x5AA55A in the traced route"
  },
  "conclusion": "The cleanup cluster has two observed entry legs and one observed destructive clear tail. Port 0x03 bit 4 at 0x001872 selects the optional 0x001879 port-9 setup versus the 0x0018AF skip leg. Inside the skip leg, the RAM sentinel at D0301B is compared with 0x5AA55A; the observed port-skip edge 0x001881 -> 0x0018F8 proves the live route took the D0301B-mismatch path into the same large clear body as baseline. If D0301B matched the magic value, static decode shows the route would load the short-tail parameters BC=0x25, HL=D000FF, DE=D00100 before 0x0018F8 instead.",
  "edges": [
    {
      "label": "baseline",
      "branch": {
        "fromPc": "0x001872",
        "toPc": "0x001879",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "skip": {
        "fromPc": null,
        "toPc": null,
        "af": null,
        "bc": null,
        "de": null,
        "hl": null,
        "sp": null,
        "stack0": null,
        "d007ca": null,
        "d02437": null,
        "d0243a": null,
        "d0243d": null,
        "d02505": null,
        "d02590": null
      },
      "preWipe": {
        "fromPc": "0x001872",
        "toPc": "0x001879",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "cleanup": {
        "fromPc": "0x001879",
        "toPc": "0x0018F8",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x000000",
        "d02437": "0x000000",
        "d0243a": "0x000000",
        "d0243d": "0x000000",
        "d02505": "0x00",
        "d02590": "0x000000"
      }
    },
    {
      "label": "D010 replay only",
      "branch": {
        "fromPc": "0x001872",
        "toPc": "0x001879",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "skip": {
        "fromPc": null,
        "toPc": null,
        "af": null,
        "bc": null,
        "de": null,
        "hl": null,
        "sp": null,
        "stack0": null,
        "d007ca": null,
        "d02437": null,
        "d0243a": null,
        "d0243d": null,
        "d02505": null,
        "d02590": null
      },
      "preWipe": {
        "fromPc": "0x001872",
        "toPc": "0x001879",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "cleanup": {
        "fromPc": "0x001879",
        "toPc": "0x0018F8",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x000000",
        "d02437": "0x000000",
        "d0243a": "0x000000",
        "d0243d": "0x000000",
        "d02505": "0x00",
        "d02590": "0x000000"
      }
    },
    {
      "label": "port bit skip only",
      "branch": {
        "fromPc": "0x001872",
        "toPc": "0x0018AF",
        "af": "0xFE10",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "skip": {
        "fromPc": "0x001872",
        "toPc": "0x0018AF",
        "af": "0xFE10",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "preWipe": {
        "fromPc": null,
        "toPc": null,
        "af": null,
        "bc": null,
        "de": null,
        "hl": null,
        "sp": null,
        "stack0": null,
        "d007ca": null,
        "d02437": null,
        "d0243a": null,
        "d0243d": null,
        "d02505": null,
        "d02590": null
      },
      "cleanup": {
        "fromPc": "0x001881",
        "toPc": "0x0018F8",
        "af": "0x5281",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x000000",
        "d02437": "0x000000",
        "d0243a": "0x000000",
        "d0243d": "0x000000",
        "d02505": "0x00",
        "d02590": "0x000000"
      }
    },
    {
      "label": "D010 replay + port bit skip",
      "branch": {
        "fromPc": "0x001872",
        "toPc": "0x0018AF",
        "af": "0xFE10",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "skip": {
        "fromPc": "0x001872",
        "toPc": "0x0018AF",
        "af": "0xFE10",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x0585E9",
        "d02437": "0xD1A8CC",
        "d0243a": "0xD1A8CC",
        "d0243d": "0xD2A83E",
        "d02505": "0x0A",
        "d02590": "0xD3FE81"
      },
      "preWipe": {
        "fromPc": null,
        "toPc": null,
        "af": null,
        "bc": null,
        "de": null,
        "hl": null,
        "sp": null,
        "stack0": null,
        "d007ca": null,
        "d02437": null,
        "d0243a": null,
        "d0243d": null,
        "d02505": null,
        "d02590": null
      },
      "cleanup": {
        "fromPc": "0x001881",
        "toPc": "0x0018F8",
        "af": "0x5281",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "d007ca": "0x000000",
        "d02437": "0x000000",
        "d0243a": "0x000000",
        "d0243d": "0x000000",
        "d02505": "0x00",
        "d02590": "0x000000"
      }
    }
  ],
  "counts": {
    "baseline": {
      "anchor0A229D": 1,
      "branch001872": 1,
      "skip0018AF": 0,
      "preWipe001879": 1,
      "cleanup0018F8": 1,
      "poll006D64": 9167,
      "owner0A31FD": 0
    },
    "D010 replay only": {
      "anchor0A229D": 1,
      "branch001872": 1,
      "skip0018AF": 0,
      "preWipe001879": 1,
      "cleanup0018F8": 1,
      "poll006D64": 9167,
      "owner0A31FD": 0
    },
    "port bit skip only": {
      "anchor0A229D": 1,
      "branch001872": 1,
      "skip0018AF": 1,
      "preWipe001879": 0,
      "cleanup0018F8": 1,
      "poll006D64": 9041,
      "owner0A31FD": 0
    },
    "D010 replay + port bit skip": {
      "anchor0A229D": 1,
      "branch001872": 1,
      "skip0018AF": 1,
      "preWipe001879": 0,
      "cleanup0018F8": 1,
      "poll006D64": 9041,
      "owner0A31FD": 0
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

