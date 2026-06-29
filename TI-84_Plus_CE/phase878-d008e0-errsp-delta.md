# Phase 878: D008E0 errSP Delta

Probe: `probe-phase878-d008e0-errsp-delta.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase878-d008e0-errsp-delta.mjs`

## Summary

- Result: PASS.
- Browser/probe event frame uses reserve-24 + push-return + D008E0=SP recipe: yes.
- Stable boundary D008E0: 0xD1A866; stock before-CLEAR D008E0: 0xD1A863; oracle after-CLEAR D008E0: 0xD1A86C.
- Stock D0301B+D010 replay leaves only D008E0 mismatched: yes.
- Stable-boundary D008E0 override still mismatches: yes.
- Oracle D008E0 one-field override closes all watched-field mismatches: yes.
- ROM rewrites D008E0 during CLEAR after event setup: no.
- Adjudication: The D008E0 delta is caused by the probe/browser event-frame recipe. Stable replay preserves D008E0=STACK_TOP-24 (0xD1A866), but prepareColdbootEventFrame reserves 24 bytes, pushes a 3-byte HALT return, and rewrites D008E0 to STACK_TOP-27 (0xD1A863). ROM code on the bounded CLEAR route does not rewrite D008E0 afterward. A diagnostic one-field override to the real after-CLEAR oracle value STACK_TOP-18 (0xD1A86C) closes the final mismatch, while the stable-boundary value remains off by 6 bytes.

## Exact Delta

```json
{
  "stackTop": "0xD1A87E",
  "eventFrameBase": "0xD1A866",
  "stockEventErrSp": "0xD1A863",
  "stableBoundaryErrSp": "0xD1A866",
  "oracleErrSp": "0xD1A86C",
  "stockDeltaToOracleBytes": 9,
  "stableDeltaToOracleBytes": 6
}
```

## Timeline

| Point | D008E0 | D0301B | D010EF | D010FE | D010F4 |
| --- | --- | --- | --- | --- | --- |
| stable boundary before browser replay | 0xD1A866 | 0x000000 | 0xD2A83E | 0xD1A8CC | 0x1F |
| after current stable replay allow-list | 0xD1A866 | 0x000000 | 0x000000 | 0x000000 | 0x00 |
| D0301B + D010 + stock event frame: after edit seed | 0x000000 | - | - | - | - |
| D0301B + D010 + stable-boundary D008E0: after edit seed | 0x000000 | - | - | - | - |
| D0301B + D010 + oracle D008E0: after edit seed | 0x000000 | - | - | - | - |
| D0301B + D010 + stock event frame: before CLEAR | 0xD1A863 | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |
| D0301B + D010 + stable-boundary D008E0: before CLEAR | 0xD1A866 | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |
| D0301B + D010 + oracle D008E0: before CLEAR | 0xD1A86C | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |
| D0301B + D010 + stock event frame: final | 0xD1A863 | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |
| D0301B + D010 + stable-boundary D008E0: final | 0xD1A866 | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |
| D0301B + D010 + oracle D008E0: final | 0xD1A86C | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F |

## CLEAR Event-Frame Writes

| Variant | Event | SP | D008E0 | Note |
| --- | --- | --- | --- | --- |
| D0301B + D010 + stock event frame | clear frame: before | 0x000000 | 0x000000 | entry state before synthetic browser frame |
| D0301B + D010 + stock event frame | clear frame: reserved | 0xD1A866 | 0x000000 | after SCREEN_STACK_TOP - 24 reservation |
| D0301B + D010 + stock event frame | clear frame: after write | 0xD1A863 | 0xD1A863 | stock helper wrote D008E0 to SP after pushing HALT return |
| D0301B + D010 + stable-boundary D008E0 | clear frame: before | 0x000000 | 0x000000 | entry state before synthetic browser frame |
| D0301B + D010 + stable-boundary D008E0 | clear frame: reserved | 0xD1A866 | 0x000000 | after SCREEN_STACK_TOP - 24 reservation |
| D0301B + D010 + stable-boundary D008E0 | clear frame: after write | 0xD1A863 | 0xD1A866 | diagnostic override wrote D008E0=0xD1A866 |
| D0301B + D010 + oracle D008E0 | clear frame: before | 0x000000 | 0x000000 | entry state before synthetic browser frame |
| D0301B + D010 + oracle D008E0 | clear frame: reserved | 0xD1A866 | 0x000000 | after SCREEN_STACK_TOP - 24 reservation |
| D0301B + D010 + oracle D008E0 | clear frame: after write | 0xD1A863 | 0xD1A86C | diagnostic override wrote D008E0=0xD1A86C |

## Variant Results

| Variant | D008E0 before CLEAR | D008E0 final | Final mismatches | D008E0 ROM rewrites during CLEAR | 0x0018EC | 0x0018F8 | Termination |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D0301B + D010 + stock event frame | 0xD1A863 | 0xD1A863 | D008E0 | 0 | 1 | 0 | max_steps |
| D0301B + D010 + stable-boundary D008E0 | 0xD1A866 | 0xD1A866 | D008E0 | 0 | 1 | 0 | max_steps |
| D0301B + D010 + oracle D008E0 | 0xD1A86C | 0xD1A86C | none | 0 | 1 | 0 | max_steps |

## Dynamic D008E0 Changes During CLEAR

No dynamic D008E0 changes were observed during any CLEAR run after the event-frame setup.

## Browser Source Evidence

| Browser evidence | Present |
| --- | --- |
| hasReserve24 | yes |
| hasPushReturn | yes |
| hasD008E0WriteToCpuSp | yes |
| stableReplayMentionsD008E0 | yes |

## Oracle Stack at D008E0

| Address | 3-byte value |
| --- | --- |
| 0xD1A86C | 0x061E27 |
| 0xD1A86F | 0x061DD1 |
| 0xD1A872 | 0x000000 |
| 0xD1A875 | 0x000000 |
| 0xD1A878 | 0x000000 |
| 0xD1A87B | 0x08C754 |

## Final Mismatches

| Variant | Field | Actual | Oracle |
| --- | --- | --- | --- |
| D0301B + D010 + stock event frame | D008E0 | 0xD1A863 | 0xD1A86C |
| D0301B + D010 + stable-boundary D008E0 | D008E0 | 0xD1A866 | 0xD1A86C |

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "pass": true,
    "browserUsesStockRecipe": true,
    "browserEvidence": {
      "hasReserve24": true,
      "hasPushReturn": true,
      "hasD008E0WriteToCpuSp": true,
      "stableReplayMentionsD008E0": true
    },
    "exactMath": {
      "stackTop": "0xD1A87E",
      "eventFrameBase": "0xD1A866",
      "stockEventErrSp": "0xD1A863",
      "stableBoundaryErrSp": "0xD1A866",
      "oracleErrSp": "0xD1A86C",
      "stockDeltaToOracleBytes": 9,
      "stableDeltaToOracleBytes": 6
    },
    "stableBoundaryErrSp": "0xD1A866",
    "stockBeforeClearErrSp": "0xD1A863",
    "stableBeforeClearErrSp": "0xD1A866",
    "oracleBeforeClearErrSp": "0xD1A86C",
    "stockOnlyD008E0Mismatch": true,
    "stableStillD008E0Mismatch": true,
    "oracleErrSpClosesAll": true,
    "stockNoRomD008E0Rewrite": true,
    "oracleNoRomD008E0Rewrite": true,
    "repaintZerosD008E0": true,
    "variants": {
      "stockEventFrame": {
        "name": "stockEventFrame",
        "label": "D0301B + D010 + stock event frame",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": null,
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "bootReadyD008E0": "0x000000",
        "beforeClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "afterClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "finalMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ],
        "d008e0ChangesDuringClear": [],
        "routeCounts": {
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "stock helper wrote D008E0 to SP after pushing HALT return",
            "sp": "0xD1A863",
            "d008e0": "0xD1A863",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ]
      },
      "stableErrSpOverride": {
        "name": "stableErrSpOverride",
        "label": "D0301B + D010 + stable-boundary D008E0",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": "0xD1A866",
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "bootReadyD008E0": "0x000000",
        "beforeClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
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
        "afterClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
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
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
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
        "finalMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A866",
            "oracle": "0xD1A86C"
          }
        ],
        "d008e0ChangesDuringClear": [],
        "routeCounts": {
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "diagnostic override wrote D008E0=0xD1A866",
            "sp": "0xD1A863",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ]
      },
      "oracleErrSpOverride": {
        "name": "oracleErrSpOverride",
        "label": "D0301B + D010 + oracle D008E0",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": "0xD1A86C",
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "bootReadyD008E0": "0x000000",
        "beforeClearFields": {
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
        "afterClearFields": {
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
        "finalFields": {
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
        "finalMismatches": [],
        "d008e0ChangesDuringClear": [],
        "routeCounts": {
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "diagnostic override wrote D008E0=0xD1A86C",
            "sp": "0xD1A863",
            "d008e0": "0xD1A86C",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ]
      }
    },
    "conclusion": "The D008E0 delta is caused by the probe/browser event-frame recipe. Stable replay preserves D008E0=STACK_TOP-24 (0xD1A866), but prepareColdbootEventFrame reserves 24 bytes, pushes a 3-byte HALT return, and rewrites D008E0 to STACK_TOP-27 (0xD1A863). ROM code on the bounded CLEAR route does not rewrite D008E0 afterward. A diagnostic one-field override to the real after-CLEAR oracle value STACK_TOP-18 (0xD1A86C) closes the final mismatch, while the stable-boundary value remains off by 6 bytes."
  },
  "common": {
    "phases": [
      {
        "name": "p1-coldboot",
        "result": {
          "steps": 20000,
          "termination": "max_steps",
          "lastPc": "0x001CC0",
          "lastMode": "adl"
        }
      },
      {
        "name": "p2-kernel",
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x000A92",
          "lastMode": "adl"
        }
      },
      {
        "name": "p3-postinit",
        "result": {
          "steps": 100,
          "termination": "max_steps",
          "lastPc": "0x0158BC",
          "lastMode": "adl"
        }
      },
      {
        "name": "p4-warm-idle",
        "result": {
          "steps": 192290,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        }
      },
      {
        "name": "p5-launch-home",
        "result": {
          "steps": 275843,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        }
      }
    ],
    "setupEvents": [
      {
        "label": "launch-home setup",
        "note": "phase-5 setup writes D008E0 before the 0x001879 stable boundary",
        "sp": "0xD1A866",
        "d008e0": "0xD1A866",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1044",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x44"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A872",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A875",
            "value": "0xFFFFFF"
          }
        ],
        "cpuStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A872",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A875",
            "value": "0xFFFFFF"
          }
        ]
      }
    ],
    "stableSnapshot": {
      "atBlock": 396519,
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "ix": "0xFFFFFF",
        "iy": "0xD00080",
        "f": "0x54"
      },
      "watchedFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A866",
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
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00"
      },
      "errSpStack": [
        {
          "addr": "0xD1A866",
          "value": "0x000003"
        },
        {
          "addr": "0xD1A869",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A86C",
          "value": "0x001C81"
        },
        {
          "addr": "0xD1A86F",
          "value": "0x001C48"
        },
        {
          "addr": "0xD1A872",
          "value": "0x0158D2"
        },
        {
          "addr": "0xD1A875",
          "value": "0x0158EC"
        }
      ],
      "replayFields": [
        {
          "name": "D007CA",
          "addr": "0xD007CA",
          "len": 3,
          "value": "0x0585E9"
        },
        {
          "name": "D008E0",
          "addr": "0xD008E0",
          "len": 3,
          "value": "0xD1A866"
        },
        {
          "name": "D02505",
          "addr": "0xD02505",
          "len": 1,
          "value": "0x0A"
        },
        {
          "name": "D02587",
          "addr": "0xD02587",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D0258A",
          "addr": "0xD0258A",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D0258D",
          "addr": "0xD0258D",
          "len": 3,
          "value": "0xD2A8E2"
        },
        {
          "name": "D02590",
          "addr": "0xD02590",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D02593",
          "addr": "0xD02593",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D0259A",
          "addr": "0xD0259A",
          "len": 3,
          "value": "0xD3FE81"
        },
        {
          "name": "D0259D",
          "addr": "0xD0259D",
          "len": 3,
          "value": "0xD3FECD"
        },
        {
          "name": "D025A0",
          "addr": "0xD025A0",
          "len": 3,
          "value": "0xD2A8A4"
        },
        {
          "name": "D025C5",
          "addr": "0xD025C5",
          "len": 3,
          "value": "0x0C0000"
        }
      ]
    },
    "routeSummary": {
      "totalBlocks": 588232,
      "targetCounts": {
        "phase5PreWipe001879": 6,
        "clearCaller058A16": 0,
        "clearEntry0A223A": 0,
        "anchor0A229D": 0,
        "liveSpin0A1854": 32,
        "portBranch001872": 6,
        "portSkip0018AF": 0,
        "sentinelBlock0018D7": 0,
        "largeClear001881": 0,
        "shortTail0018EC": 0,
        "cleanup0018F8": 6,
        "poll006D64": 30264
      },
      "fieldChanges": [
        {
          "name": "D008E0",
          "from": "0x000000",
          "to": "0xD1A866",
          "at": {
            "block": 312390,
            "phase": "p5-launch-home",
            "pc": "0x09DD62",
            "prevPc": "0x0019B5",
            "cpu": {
              "pc": "0x09DD62",
              "currentBlockPc": "0x09DD62",
              "sp": "0xD1A866",
              "af": "0x1044",
              "bc": "0x00B026",
              "de": "0xD65800",
              "hl": "0x000000",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A836",
          "at": {
            "block": 344223,
            "phase": "p5-launch-home",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x09A661",
              "currentBlockPc": "0x09A661",
              "sp": "0xD1A836",
              "af": "0x0C4A",
              "bc": "0xD3FE9A",
              "de": "0x061E27",
              "hl": "0x09A661",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A836",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A836",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A839",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A845",
                "value": "0x09A671"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A836",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A839",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A845",
                "value": "0x09A671"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A836",
          "to": "0xD1A866",
          "at": {
            "block": 345019,
            "phase": "p5-launch-home",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x09A671",
              "currentBlockPc": "0x09A671",
              "sp": "0xD1A848",
              "af": "0xA671",
              "bc": "0x09A671",
              "de": "0xD01FD2",
              "hl": "0xD00601",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x71"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A848",
                "value": "0x0BCEA2"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x000C80"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x0BCF7E"
              },
              {
                "addr": "0xD1A851",
                "value": "0x0BD02B"
              },
              {
                "addr": "0xD1A854",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A857",
                "value": "0xD01F77"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A839",
          "at": {
            "block": 345165,
            "phase": "p5-launch-home",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x09A661",
              "currentBlockPc": "0x09A661",
              "sp": "0xD1A839",
              "af": "0x0D4A",
              "bc": "0xD3FE9A",
              "de": "0x061E27",
              "hl": "0x09A661",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A839",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A839",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A842",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A848",
                "value": "0x09A671"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A839",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A842",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A848",
                "value": "0x09A671"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A839",
          "to": "0xD1A866",
          "at": {
            "block": 345870,
            "phase": "p5-launch-home",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x09A671",
              "currentBlockPc": "0x09A671",
              "sp": "0xD1A84B",
              "af": "0xA671",
              "bc": "0x09A671",
              "de": "0xD01FD2",
              "hl": "0xD00601",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x71"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A84B",
                "value": "0x0BCEAC"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x0BCF7E"
              },
              {
                "addr": "0xD1A851",
                "value": "0x0BD02B"
              },
              {
                "addr": "0xD1A854",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A857",
                "value": "0xD01F77"
              },
              {
                "addr": "0xD1A85A",
                "value": "0x000040"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A836",
          "at": {
            "block": 346028,
            "phase": "p5-launch-home",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x09A661",
              "currentBlockPc": "0x09A661",
              "sp": "0xD1A836",
              "af": "0x0A4A",
              "bc": "0xD3FE9A",
              "de": "0x061E27",
              "hl": "0x09A661",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A836",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A836",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A839",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A845",
                "value": "0x09A671"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A836",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A839",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A845",
                "value": "0x09A671"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A836",
          "to": "0xD1A866",
          "at": {
            "block": 347183,
            "phase": "p5-launch-home",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x09A671",
              "currentBlockPc": "0x09A671",
              "sp": "0xD1A848",
              "af": "0xA671",
              "bc": "0x09A671",
              "de": "0xD00638",
              "hl": "0xD1A8F8",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x71"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A848",
                "value": "0x0BCEA2"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x000AA4"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x0BCF82"
              },
              {
                "addr": "0xD1A851",
                "value": "0x0BD02B"
              },
              {
                "addr": "0xD1A854",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A857",
                "value": "0xD01F77"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A839",
          "at": {
            "block": 347329,
            "phase": "p5-launch-home",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x09A661",
              "currentBlockPc": "0x09A661",
              "sp": "0xD1A839",
              "af": "0x0B4A",
              "bc": "0xD3FE9A",
              "de": "0x061E27",
              "hl": "0x09A661",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A839",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A839",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A842",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A848",
                "value": "0x09A671"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A839",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A83F",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A842",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A848",
                "value": "0x09A671"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A839",
          "to": "0xD1A866",
          "at": {
            "block": 348525,
            "phase": "p5-launch-home",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x09A671",
              "currentBlockPc": "0x09A671",
              "sp": "0xD1A84B",
              "af": "0xA671",
              "bc": "0x09A671",
              "de": "0xD00638",
              "hl": "0xD1A8F8",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x71"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE9A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A84B",
                "value": "0x0BCEAC"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x0BCF82"
              },
              {
                "addr": "0xD1A851",
                "value": "0x0BD02B"
              },
              {
                "addr": "0xD1A854",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A857",
                "value": "0xD01F77"
              },
              {
                "addr": "0xD1A85A",
                "value": "0x000040"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A848",
          "at": {
            "block": 354951,
            "phase": "p5-launch-home",
            "pc": "0x058D0C",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x058D0C",
              "currentBlockPc": "0x058D0C",
              "sp": "0xD1A848",
              "af": "0x0142",
              "bc": "0xD3FE8A",
              "de": "0x061E27",
              "hl": "0x058D0C",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A848",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE8A",
              "D0259D": "0xD3FED6",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A857",
                "value": "0x058D18"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A857",
                "value": "0x058D18"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A848",
          "to": "0xD1A866",
          "at": {
            "block": 356353,
            "phase": "p5-launch-home",
            "pc": "0x058D18",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x058D18",
              "currentBlockPc": "0x058D18",
              "sp": "0xD1A85A",
              "af": "0x8D18",
              "bc": "0x058D18",
              "de": "0xD1A8A3",
              "hl": "0xD3FED6",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x18"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A85A",
                "value": "0x058C87"
              },
              {
                "addr": "0xD1A85D",
                "value": "0x058C6E"
              },
              {
                "addr": "0xD1A860",
                "value": "0x09DEC2"
              },
              {
                "addr": "0xD1A863",
                "value": "0x09DD9E"
              },
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0xD1A848",
          "at": {
            "block": 360520,
            "phase": "p5-launch-home",
            "pc": "0x08D0F6",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x08D0F6",
              "currentBlockPc": "0x08D0F6",
              "sp": "0xD1A848",
              "af": "0x0042",
              "bc": "0xD3FE81",
              "de": "0x061E27",
              "hl": "0x08D0F6",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A848",
              "D010EF": "0xD2A83E",
              "D010FE": "0xD1A8A3",
              "D010F4": "0x00",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
              "D0243A": "0xD1A8A3",
              "D0243D": "0xD2A83E",
              "D02440": "0xD2A83E",
              "D02505": "0x00",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A857",
                "value": "0x08D10A"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A857",
                "value": "0x08D10A"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A848",
          "to": "0xD1A833",
          "at": {
            "block": 360528,
            "phase": "p5-launch-home",
            "pc": "0x08D17B",
            "prevPc": "0x061DEF",
            "cpu": {
              "pc": "0x08D17B",
              "currentBlockPc": "0x08D17B",
              "sp": "0xD1A833",
              "af": "0x0042",
              "bc": "0xD3FE81",
              "de": "0x061E27",
              "hl": "0x08D17B",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A833",
              "D010EF": "0xD2A83E",
              "D010FE": "0xD1A8A3",
              "D010F4": "0x00",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
              "D0243A": "0xD1A8A3",
              "D0243D": "0xD2A83E",
              "D02440": "0xD2A83E",
              "D02505": "0x00",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A833",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A836",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A839",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0xD1A848"
              },
              {
                "addr": "0xD1A842",
                "value": "0x08CAC8"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A833",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A836",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A839",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83C",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A83F",
                "value": "0xD1A848"
              },
              {
                "addr": "0xD1A842",
                "value": "0x08CAC8"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A833",
          "to": "0xD1A848",
          "at": {
            "block": 360711,
            "phase": "p5-launch-home",
            "pc": "0x08CAA9",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x08CAA9",
              "currentBlockPc": "0x08CAA9",
              "sp": "0xD1A845",
              "af": "0xCAC8",
              "bc": "0x08CAA9",
              "de": "0x000000",
              "hl": "0xD2A83E",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0xC8"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A848",
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
              "D02505": "0x00",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A857",
                "value": "0x08D10A"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A845",
                "value": "0x08D120"
              },
              {
                "addr": "0xD1A848",
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A851",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A854",
                "value": "0xD1A866"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A848",
          "to": "0xD1A866",
          "at": {
            "block": 360717,
            "phase": "p5-launch-home",
            "pc": "0x08D12A",
            "prevPc": "0x061E27",
            "cpu": {
              "pc": "0x08D12A",
              "currentBlockPc": "0x08D12A",
              "sp": "0xD1A85A",
              "af": "0xD10A",
              "bc": "0x08D12A",
              "de": "0x000000",
              "hl": "0xD2A83E",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x0A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
              "D02505": "0x00",
              "D02590": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A85A",
                "value": "0x058CBE"
              },
              {
                "addr": "0xD1A85D",
                "value": "0x058C6E"
              },
              {
                "addr": "0xD1A860",
                "value": "0x09DEC2"
              },
              {
                "addr": "0xD1A863",
                "value": "0x09DD9E"
              },
              {
                "addr": "0xD1A866",
                "value": "0x0019BE"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              }
            ]
          }
        },
        {
          "name": "D008E0",
          "from": "0xD1A866",
          "to": "0x000000",
          "at": {
            "block": 396520,
            "phase": "p5-launch-home",
            "pc": "0x0018F8",
            "prevPc": "0x001879",
            "cpu": {
              "pc": "0x0018F8",
              "currentBlockPc": "0x0018F8",
              "sp": "0xD1A87B",
              "af": "0x5200",
              "bc": "0x0000FF",
              "de": "0xD3FF00",
              "hl": "0xD3FEFF",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x00"
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02440": "0x000000",
              "D02505": "0x00",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D0301B": "0x000000",
              "D000C2_IY42": "0x00"
            },
            "errSpStack": [],
            "cpuStack": [
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
      "checkpoints": [
        {
          "label": "afterPhase5BeforeReplay",
          "atBlock": 588232,
          "phase": "p5-launch-home",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A87E",
            "af": "0x1044",
            "bc": "0x00B026",
            "de": "0xD65800",
            "hl": "0x000000",
            "ix": "0xFFFFFF",
            "iy": "0xD00080",
            "f": "0x44"
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            },
            {
              "addr": "0xD1A88D",
              "value": "0x008000"
            }
          ]
        },
        {
          "label": "afterCurrentStableReplay",
          "atBlock": 588232,
          "phase": "p5-launch-home",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A87E",
            "af": "0x1044",
            "bc": "0x00B026",
            "de": "0xD65800",
            "hl": "0x000000",
            "ix": "0xFFFFFF",
            "iy": "0xD00080",
            "f": "0x44"
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x000003"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A86C",
              "value": "0x00D008"
            },
            {
              "addr": "0xD1A86F",
              "value": "0x00D008"
            },
            {
              "addr": "0xD1A872",
              "value": "0x00611C"
            },
            {
              "addr": "0xD1A875",
              "value": "0x00609A"
            }
          ],
          "cpuStack": [
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
            },
            {
              "addr": "0xD1A88D",
              "value": "0x008000"
            }
          ]
        }
      ]
    }
  },
  "variants": [
    {
      "variant": {
        "name": "stockEventFrame",
        "label": "D0301B + D010 + stock event frame",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": 13635823,
            "len": 3,
            "value": 13805630,
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": 13635838,
            "len": 3,
            "value": 13740236,
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": 13635828,
            "len": 1,
            "value": 31,
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": null
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "repaintFrameEvents": [
          {
            "label": "repaint frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A872",
                "value": "0x00611C"
              },
              {
                "addr": "0xD1A875",
                "value": "0x00609A"
              }
            ],
            "cpuStack": []
          },
          {
            "label": "repaint frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "repaint frame: after write",
            "note": "stock helper wrote D008E0 to SP after pushing HALT return",
            "sp": "0xD1A863",
            "d008e0": "0xD1A863",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
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
        }
      },
      "clear": {
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "stock helper wrote D008E0 to SP after pushing HALT return",
            "sp": "0xD1A863",
            "d008e0": "0xD1A863",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "targetCounts": {
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x00E044"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x05C883"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
            "cpu": {
              "pc": "0x058A16",
              "currentBlockPc": "0x058A16",
              "sp": "0xD1A854",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
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
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
            "cpu": {
              "pc": "0x0A223A",
              "currentBlockPc": "0x0A223A",
              "sp": "0xD1A851",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
            "cpu": {
              "pc": "0x0A229D",
              "currentBlockPc": "0x0A229D",
              "sp": "0xD1A851",
              "af": "0x0A0C",
              "bc": "0x000018",
              "de": "0x00013F",
              "hl": "0x000104",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x0C"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              }
            ],
            "cpuStack": [
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
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              }
            ],
            "cpuStack": [
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
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              }
            ],
            "cpuStack": [
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
          "shortTail0018EC": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x0018EC",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x0018EC",
              "currentBlockPc": "0x0018EC",
              "sp": "0xD1A87B",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              }
            ],
            "cpuStack": [
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
          "poll006D64": {
            "block": 86820,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x09D7BE"
              },
              {
                "addr": "0xD1A866",
                "value": "0xD1A878"
              },
              {
                "addr": "0xD1A869",
                "value": "0x013968"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x000100"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x0021C2",
              "currentBlockPc": "0x0021C2",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x09D7BE"
              },
              {
                "addr": "0xD1A866",
                "value": "0xD1A878"
              },
              {
                "addr": "0xD1A869",
                "value": "0x013968"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x000040"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x006512"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020104"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x083CFE"
              }
            ]
          }
        ]
      }
    },
    {
      "variant": {
        "name": "stableErrSpOverride",
        "label": "D0301B + D010 + stable-boundary D008E0",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": 13635823,
            "len": 3,
            "value": 13805630,
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": 13635838,
            "len": 3,
            "value": 13740236,
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": 13635828,
            "len": 1,
            "value": 31,
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": 13740134
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "repaintFrameEvents": [
          {
            "label": "repaint frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A872",
                "value": "0x00611C"
              },
              {
                "addr": "0xD1A875",
                "value": "0x00609A"
              }
            ],
            "cpuStack": []
          },
          {
            "label": "repaint frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "repaint frame: after write",
            "note": "stock helper wrote D008E0 to SP after pushing HALT return",
            "sp": "0xD1A863",
            "d008e0": "0xD1A863",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
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
        }
      },
      "clear": {
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "diagnostic override wrote D008E0=0xD1A866",
            "sp": "0xD1A863",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
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
        "targetCounts": {
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x00E044"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x05C883"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
            "cpu": {
              "pc": "0x058A16",
              "currentBlockPc": "0x058A16",
              "sp": "0xD1A854",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
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
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
            "cpu": {
              "pc": "0x0A223A",
              "currentBlockPc": "0x0A223A",
              "sp": "0xD1A851",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
            "cpu": {
              "pc": "0x0A229D",
              "currentBlockPc": "0x0A229D",
              "sp": "0xD1A851",
              "af": "0x0A0C",
              "bc": "0x000018",
              "de": "0x00013F",
              "hl": "0x000104",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x0C"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              }
            ],
            "cpuStack": [
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
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              }
            ],
            "cpuStack": [
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
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              }
            ],
            "cpuStack": [
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
          "shortTail0018EC": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x0018EC",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x0018EC",
              "currentBlockPc": "0x0018EC",
              "sp": "0xD1A87B",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xE00800"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              }
            ],
            "cpuStack": [
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
          "poll006D64": {
            "block": 86820,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xD1A878"
              },
              {
                "addr": "0xD1A869",
                "value": "0x013968"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              },
              {
                "addr": "0xD1A875",
                "value": "0x000001"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x000100"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x0021C2",
              "currentBlockPc": "0x0021C2",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xD1A878"
              },
              {
                "addr": "0xD1A869",
                "value": "0x013968"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              },
              {
                "addr": "0xD1A875",
                "value": "0x000001"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x000040"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x006512"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020104"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x083CFE"
              }
            ]
          }
        ]
      }
    },
    {
      "variant": {
        "name": "oracleErrSpOverride",
        "label": "D0301B + D010 + oracle D008E0",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": 13635823,
            "len": 3,
            "value": 13805630,
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": 13635838,
            "len": 3,
            "value": 13740236,
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": 13635828,
            "len": 1,
            "value": 31,
            "timing": "stable replay"
          }
        ],
        "clearErrSpOverride": 13740140
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "repaintFrameEvents": [
          {
            "label": "repaint frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0x000003"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x00D008"
              },
              {
                "addr": "0xD1A872",
                "value": "0x00611C"
              },
              {
                "addr": "0xD1A875",
                "value": "0x00609A"
              }
            ],
            "cpuStack": []
          },
          {
            "label": "repaint frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0xD1A866",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "repaint frame: after write",
            "note": "stock helper wrote D008E0 to SP after pushing HALT return",
            "sp": "0xD1A863",
            "d008e0": "0xD1A863",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
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
        }
      },
      "clear": {
        "clearFrameEvents": [
          {
            "label": "clear frame: before",
            "note": "entry state before synthetic browser frame",
            "sp": "0x000000",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0x000000",
              "af": "0x0000",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x000000",
              "f": "0x00"
            },
            "errSpStack": [],
            "cpuStack": []
          },
          {
            "label": "clear frame: reserved",
            "note": "after SCREEN_STACK_TOP - 24 reservation",
            "sp": "0xD1A866",
            "d008e0": "0x000000",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A866",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [],
            "cpuStack": [
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "clear frame: after write",
            "note": "diagnostic override wrote D008E0=0xD1A86C",
            "sp": "0xD1A863",
            "d008e0": "0xD1A86C",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          }
        ],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
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
        "targetCounts": {
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              },
              {
                "addr": "0xD1A84B",
                "value": "0x00E044"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x05C883"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
            "cpu": {
              "pc": "0x058A16",
              "currentBlockPc": "0x058A16",
              "sp": "0xD1A854",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
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
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
            "cpu": {
              "pc": "0x0A223A",
              "currentBlockPc": "0x0A223A",
              "sp": "0xD1A851",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x4A"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
            "cpu": {
              "pc": "0x0A229D",
              "currentBlockPc": "0x0A229D",
              "sp": "0xD1A851",
              "af": "0x0A0C",
              "bc": "0x000018",
              "de": "0x00013F",
              "hl": "0x000104",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x0C"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
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
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              },
              {
                "addr": "0xD1A878",
                "value": "0x001872"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              }
            ],
            "cpuStack": [
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
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              },
              {
                "addr": "0xD1A878",
                "value": "0x001872"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              }
            ],
            "cpuStack": [
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
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              },
              {
                "addr": "0xD1A878",
                "value": "0x001872"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              }
            ],
            "cpuStack": [
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
          "shortTail0018EC": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x0018EC",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x0018EC",
              "currentBlockPc": "0x0018EC",
              "sp": "0xD1A87B",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x001C81"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x001C48"
              },
              {
                "addr": "0xD1A872",
                "value": "0x0158D2"
              },
              {
                "addr": "0xD1A875",
                "value": "0x0158EC"
              },
              {
                "addr": "0xD1A878",
                "value": "0x001872"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x0013E8"
              }
            ],
            "cpuStack": [
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
          "poll006D64": {
            "block": 86820,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              },
              {
                "addr": "0xD1A875",
                "value": "0x000001"
              },
              {
                "addr": "0xD1A878",
                "value": "0xD18B62"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x000731"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x000100"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A875",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A878",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A87B",
                "value": "0xFFFFFF"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A869",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86C",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xFFFFFF"
              },
              {
                "addr": "0xD1A872",
                "value": "0xFFFFFF"
              }
            ]
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x0021C2",
              "currentBlockPc": "0x0021C2",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
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
            "errSpStack": [
              {
                "addr": "0xD1A86C",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A86F",
                "value": "0xD00080"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000041"
              },
              {
                "addr": "0xD1A875",
                "value": "0x000001"
              },
              {
                "addr": "0xD1A878",
                "value": "0xD18B62"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x000731"
              }
            ],
            "cpuStack": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x000040"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x006512"
              },
              {
                "addr": "0xD1A837",
                "value": "0x020104"
              },
              {
                "addr": "0xD1A83A",
                "value": "0x083CFE"
              }
            ]
          }
        ]
      }
    }
  ],
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
  "oracleErrSpStack": [
    {
      "addr": "0xD1A86C",
      "value": "0x061E27"
    },
    {
      "addr": "0xD1A86F",
      "value": "0x061DD1"
    },
    {
      "addr": "0xD1A872",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A875",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A878",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A87B",
      "value": "0x08C754"
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

