# Phase 874: D0301B Sentinel A/B

Probe: `probe-phase874-d0301b-sentinel-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase874-d0301b-sentinel-ab.mjs`

## Summary

- Result: PASS.
- Control route took D0301B mismatch branch: yes.
- Forced D0301B mutation applied at containing block 0x0018D7 before the 0x0018E0 compare: yes.
- Forced route took short-tail setup: yes.
- Forced route preserved edit/VAT oracle fields: yes.
- Final forced fields match real after-CLEAR oracle: no.
- Adjudication: Forcing D0301B=0x5AA55A before the 0x0018E0 compare is causal for cleanup geometry: the port-skip route leaves the 0x001881 large-clear branch, takes the 0x0018EC short-tail block, and records zero wipes. It is not a full after-CLEAR oracle yet: edit/VAT fields are preserved, but D010EF/D010FE/D010F4 remain zero and D008E0 remains offset from the real capture.

## Variant Counts

| Variant | Port override | Force D0301B | 0x0018AF | 0x0018D7 block | 0x0018E0 exact | 0x001881 | 0x0018EC | 0x0018F8 | 0x006D64 | Wipes | Termination |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| port bit skip control | 1 | 0 | 1 | 1 | 0 | 1 | 0 | 1 | 9041 | 1 | max_steps |
| D0301B magic at 0x0018E0 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 9041 | 0 | max_steps |

## Branch Edges And Tail Registers

| Variant | Skip edge | Compare block edge | Exact 0x0018E0 edge | Large-clear edge | Short-tail edge | Cleanup edge | Cleanup BC | Cleanup DE | Cleanup HL | Cleanup D0301B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| port bit skip control | 0x001872 -> 0x0018AF | 0x0018AF -> 0x0018D7 | - -> - | 0x0018D7 -> 0x001881 | - -> - | 0x001881 -> 0x0018F8 | 0x0000FF | 0xD3FF00 | 0xD3FEFF | 0x000000 |
| D0301B magic at 0x0018E0 | 0x001872 -> 0x0018AF | 0x0018AF -> 0x0018D7 | - -> - | - -> - | 0x0018D7 -> 0x0018EC | - -> - | - | - | - | - |

## Mutation Check

| Variant | Mutation PC | Before D0301B | After D0301B | Forced value |
| --- | --- | --- | --- | --- |
| port bit skip control | - | - | - | - |
| D0301B magic at 0x0018E0 | 0x0018D7 | 0x000000 | 0x5AA55A | 0x5AA55A |

## Final Field Comparison

| Field | Oracle after CLEAR | port bit skip control | D0301B magic at 0x0018E0 |
| --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | 0x0585E9 |
| D008E0 | 0xD1A86C | 0x000000 | 0xD1A863 |
| D010EF | 0xD2A83E | 0x000000 | 0x000000 |
| D010FE | 0xD1A8CC | 0x000000 | 0x000000 |
| D010F4 | 0x1F | 0x00 | 0x00 |
| D02437 | 0xD1A8CC | 0x000000 | 0xD1A8CC |
| D0243A | 0xD1A8CC | 0x000000 | 0xD1A8CC |
| D0243D | 0xD2A83E | 0x000000 | 0xD2A83E |
| D02440 | 0xD2A83E | 0x000000 | 0xD2A83E |
| D02505 | 0x0A | 0x00 | 0x0A |
| D02590 | 0xD3FE81 | 0x000000 | 0xD3FE81 |
| D0259D | 0xD3FECD | 0x000000 | 0xD3FECD |
| D02A29 | 0x0000 | 0x0000 | 0x0000 |
| D0301B | 0x5AA55A | 0x000000 | 0x5AA55A |

## Static Decode: D0301B Sentinel Gate

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
| 0x0018E8 | `ED 52` | SBC HL, DE |
| 0x0018EA | `20 95` | JR NZ, 0x001881 |
| 0x0018EC | `01 25 00 00` | LD BC, 0x000025 |
| 0x0018F0 | `21 FF 00 D0` | LD HL, 0xD000FF |
| 0x0018F4 | `11 00 01 D0` | LD DE, 0xD00100 |
| 0x0018F8 | `36 00` | LD (), 0x00 |

## Machine JSON

```json
{
  "pass": true,
  "adjudication": {
    "pass": true,
    "variants": {
      "control": {
        "label": "port bit skip control",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "forceD0301BMagic": false,
        "port03OverrideApplied": true,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 1,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "preWipe001879": 0,
          "largeClear001881": 1,
          "sentinelCompareBlock0018D7": 1,
          "sentinelCompare0018E0": 0,
          "shortTail0018EC": 0,
          "cleanup0018F8": 1,
          "poll006D64": 9041
        },
        "edges": {
          "branch": {
            "fromPc": "0x0158F8",
            "to": {
              "pc": "0x001872",
              "prevPc": "0x0158F8",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "skip": {
            "fromPc": "0x001872",
            "to": {
              "pc": "0x0018AF",
              "prevPc": "0x001872",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "largeClear": {
            "fromPc": "0x0018D7",
            "to": {
              "pc": "0x001881",
              "prevPc": "0x0018D7",
              "af": "0x5293",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0xA55AA6",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "sentinelCompareBlock": {
            "fromPc": "0x0018AF",
            "to": {
              "pc": "0x0018D7",
              "prevPc": "0x0018AF",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "sentinelCompare": null,
          "shortTail": null,
          "cleanup": {
            "fromPc": "0x001881",
            "to": {
              "pc": "0x0018F8",
              "prevPc": "0x001881",
              "af": "0x5281",
              "bc": "0x0000FF",
              "de": "0xD3FF00",
              "hl": "0xD3FEFF",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02505": "0x00",
              "D02590": "0x000000",
              "D0301B": "0x000000"
            }
          }
        },
        "cleanupTail": {
          "fromPc": "0x001881",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "d0301b": "0x000000"
        },
        "mutation": null,
        "endFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D0301B": "0x000000"
        },
        "postKeyCoreMatchesOracle": false,
        "postKeyEditVatMatchesOracle": false
      },
      "forced": {
        "label": "D0301B magic at 0x0018E0",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "forceD0301BMagic": true,
        "port03OverrideApplied": true,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 0,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "preWipe001879": 0,
          "largeClear001881": 0,
          "sentinelCompareBlock0018D7": 1,
          "sentinelCompare0018E0": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 9041
        },
        "edges": {
          "branch": {
            "fromPc": "0x0158F8",
            "to": {
              "pc": "0x001872",
              "prevPc": "0x0158F8",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "skip": {
            "fromPc": "0x001872",
            "to": {
              "pc": "0x0018AF",
              "prevPc": "0x001872",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x000000"
            }
          },
          "largeClear": null,
          "sentinelCompareBlock": {
            "fromPc": "0x0018AF",
            "to": {
              "pc": "0x0018D7",
              "prevPc": "0x0018AF",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x5AA55A"
            }
          },
          "sentinelCompare": null,
          "shortTail": {
            "fromPc": "0x0018D7",
            "to": {
              "pc": "0x0018EC",
              "prevPc": "0x0018D7",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "sp": "0xD1A87B",
              "stack0": "0x0013E8",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0301B": "0x5AA55A"
            }
          },
          "cleanup": null
        },
        "cleanupTail": null,
        "mutation": {
          "pc": "0x0018D7",
          "beforeD0301B": "0x000000",
          "afterD0301B": "0x5AA55A",
          "forcedValue": "0x5AA55A",
          "block": 78213
        },
        "endFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A"
        },
        "postKeyCoreMatchesOracle": false,
        "postKeyEditVatMatchesOracle": true
      }
    },
    "controlTakesMismatch": true,
    "forcedMutationApplied": true,
    "forcedTakesShortTail": true,
    "allErrorFree": true,
    "conclusion": "Forcing D0301B=0x5AA55A before the 0x0018E0 compare is causal for cleanup geometry: the port-skip route leaves the 0x001881 large-clear branch, takes the 0x0018EC short-tail block, and records zero wipes. It is not a full after-CLEAR oracle yet: edit/VAT fields are preserved, but D010EF/D010FE/D010F4 remain zero and D008E0 remains offset from the real capture."
  },
  "oracleAfter": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0xD2A83E",
    "D0231A": "0xD2A83E",
    "D0231D": "0xD2A83D",
    "D02437": "0xD1A8CC",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000C2_IY42": "0x00"
  },
  "live": {
    "portSkipControl": {
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
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "anchor0A229D": 1,
        "liveSpin0A1854": 112,
        "portBranch001872": 1,
        "portSkip0018AF": 1,
        "preWipe001879": 0,
        "largeClear001881": 1,
        "sentinelCompareBlock0018D7": 1,
        "sentinelCompare0018E0": 0,
        "sentinelBranch0018EA": 0,
        "shortTail0018EC": 0,
        "cleanup0018F8": 1,
        "poll006D64": 9041
      },
      "mutations": [],
      "pageErrors": []
    },
    "sentinelForced": {
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
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
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
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "anchor0A229D": 1,
        "liveSpin0A1854": 112,
        "portBranch001872": 1,
        "portSkip0018AF": 1,
        "preWipe001879": 0,
        "largeClear001881": 0,
        "sentinelCompareBlock0018D7": 1,
        "sentinelCompare0018E0": 0,
        "sentinelBranch0018EA": 0,
        "shortTail0018EC": 1,
        "cleanup0018F8": 0,
        "poll006D64": 9041
      },
      "mutations": [
        {
          "pc": "0x0018D7",
          "block": 78213,
          "field": "D0301B",
          "note": "0x0018D7 lifted block contains the 0x0018E0 D0301B compare; mutation occurs before that block executes",
          "forcedValue": "0x5AA55A",
          "before": {
            "index": 5400,
            "block": 78213,
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "stepCount": 78235,
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02440": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              },
              {
                "addr": "0xD1A87E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A881",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A884",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A887",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A88A",
                "value": "0x000000"
              }
            ]
          },
          "after": {
            "index": 5400,
            "block": 78213,
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "stepCount": 78235,
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8CC",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02440": "0xD2A83E",
              "D02505": "0x0A",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x5AA55A",
              "D000C2_IY42": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              },
              {
                "addr": "0xD1A87E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A881",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A884",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A887",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A88A",
                "value": "0x000000"
              }
            ]
          }
        }
      ],
      "pageErrors": []
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

