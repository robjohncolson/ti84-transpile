# Phase 876: D0301B Stable Replay A/B

Probe: `probe-phase876-d0301b-stable-replay-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase876-d0301b-stable-replay-ab.mjs`

## Summary

- Result: PASS.
- Browser stable replay packet still omits D0301B: yes.
- Baseline current packet takes the large wipe: yes.
- D0301B replay survives to before-CLEAR: yes.
- D0301B replay takes 0x0018D7 -> 0x0018EC and avoids 0x0018F8: yes.
- D0301B replay preserves edit/VAT oracle fields: yes.
- D0301B-only final mismatch is exactly D010EF/D010FE/D010F4/D008E0: yes.
- Adding the D010 mirror packet closes D010EF/D010FE/D010F4: yes.
- With D0301B+D010 replay, only D008E0 remains mismatched: yes.
- Adjudication: Adding D0301B=0x5AA55A to the probe-local stable replay state is causal for the unforced CLEAR route: it survives to the sentinel gate, takes 0x0018D7 -> 0x0018EC, avoids the large 0x0018F8 wipe, and preserves the edit/VAT oracle fields. D0301B alone leaves exactly the D010 mirror packet plus D008E0 as the remaining mismatch. A narrow D010 replay closes D010EF/D010FE/D010F4 and leaves only D008E0, so D008E0 is a separate stack/errSP anchor gap rather than part of the sentinel cleanup geometry.

## Browser Stable Replay Packet

| Browser Stable Replay Field |
| --- |
| D007CA |
| D008E0 |
| D02505 |
| D02587 |
| D0258A |
| D0258D |
| D02590 |
| D02593 |
| D0259A |
| D0259D |
| D025A0 |
| D025C5 |

## Probe-Local Patches

| Variant | Stage | Field | Address | Value |
| --- | --- | --- | --- | --- |
| current packet + D0301B | stable replay | D0301B | 0xD0301B | 0x5AA55A |
| current packet + D0301B + D010 mirror | stable replay | D0301B | 0xD0301B | 0x5AA55A |
| current packet + D0301B + D010 mirror | stable replay | D010EF | 0xD010EF | 0xD2A83E |
| current packet + D0301B + D010 mirror | stable replay | D010FE | 0xD010FE | 0xD1A8CC |
| current packet + D0301B + D010 mirror | stable replay | D010F4 | 0xD010F4 | 0x1F |

## Route Counts

| Variant | D0301B before CLEAR | 0x001881 | 0x0018EC | 0x0018F8 | 0x006D64 | Termination |
| --- | --- | --- | --- | --- | --- | --- |
| current stable packet | 0x000000 | 1 | 0 | 1 | 1646 | max_steps |
| current packet + D0301B | 0x5AA55A | 0 | 1 | 0 | 1646 | max_steps |
| current packet + D0301B + D010 mirror | 0x5AA55A | 0 | 1 | 0 | 1646 | max_steps |

## Branch Edges

| Variant | Sentinel block edge | Large clear edge | Short tail edge | Cleanup edge |
| --- | --- | --- | --- | --- |
| current stable packet | 0x0018AF -> 0x0018D7 | 0x0018D7 -> 0x001881 | - | 0x001881 -> 0x0018F8 |
| current packet + D0301B | 0x0018AF -> 0x0018D7 | - | 0x0018D7 -> 0x0018EC | - |
| current packet + D0301B + D010 mirror | 0x0018AF -> 0x0018D7 | - | 0x0018D7 -> 0x0018EC | - |

## Final Field Comparison

| Field | Oracle after CLEAR | current stable packet | current packet + D0301B | current packet + D0301B + D010 mirror |
| --- | --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | 0x0585E9 | 0x0585E9 |
| D008E0 | 0xD1A86C | 0x000000 | 0xD1A863 | 0xD1A863 |
| D010EF | 0xD2A83E | 0x000000 | 0x000000 | 0xD2A83E |
| D010FE | 0xD1A8CC | 0x000000 | 0x000000 | 0xD1A8CC |
| D010F4 | 0x1F | 0x00 | 0x00 | 0x1F |
| D02317 | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D0231A | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D0231D | 0xD2A83D | 0x000000 | 0xD2A83D | 0xD2A83D |
| D02437 | 0xD1A8CC | 0x000000 | 0xD1A8CC | 0xD1A8CC |
| D0243A | 0xD1A8CC | 0x000000 | 0xD1A8CC | 0xD1A8CC |
| D0243D | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D02440 | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D02505 | 0x0A | 0x00 | 0x0A | 0x0A |
| D02590 | 0xD3FE81 | 0x000000 | 0xD3FE81 | 0xD3FE81 |
| D0259D | 0xD3FECD | 0x000000 | 0xD3FECD | 0xD3FECD |
| D02A29 | 0x0000 | 0x0000 | 0x0000 | 0x0000 |
| D0301B | 0x5AA55A | 0x000000 | 0x5AA55A | 0x5AA55A |
| D000C2_IY42 | 0x00 | 0x00 | 0x00 | 0x00 |

## Final Mismatches

| Variant | Field | Actual | Oracle |
| --- | --- | --- | --- |
| current stable packet | D007CA | 0x000000 | 0x0585E9 |
| current stable packet | D008E0 | 0x000000 | 0xD1A86C |
| current stable packet | D010EF | 0x000000 | 0xD2A83E |
| current stable packet | D010FE | 0x000000 | 0xD1A8CC |
| current stable packet | D010F4 | 0x00 | 0x1F |
| current stable packet | D02317 | 0x000000 | 0xD2A83E |
| current stable packet | D0231A | 0x000000 | 0xD2A83E |
| current stable packet | D0231D | 0x000000 | 0xD2A83D |
| current stable packet | D02437 | 0x000000 | 0xD1A8CC |
| current stable packet | D0243A | 0x000000 | 0xD1A8CC |
| current stable packet | D0243D | 0x000000 | 0xD2A83E |
| current stable packet | D02440 | 0x000000 | 0xD2A83E |
| current stable packet | D02505 | 0x00 | 0x0A |
| current stable packet | D02590 | 0x000000 | 0xD3FE81 |
| current stable packet | D0259D | 0x000000 | 0xD3FECD |
| current stable packet | D0301B | 0x000000 | 0x5AA55A |
| current packet + D0301B | D008E0 | 0xD1A863 | 0xD1A86C |
| current packet + D0301B | D010EF | 0x000000 | 0xD2A83E |
| current packet + D0301B | D010FE | 0x000000 | 0xD1A8CC |
| current packet + D0301B | D010F4 | 0x00 | 0x1F |
| current packet + D0301B + D010 mirror | D008E0 | 0xD1A863 | 0xD1A86C |

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "pass": true,
    "browserPacketStillOmitsD0301B": true,
    "stableBoundaryD0301B": "0x000000",
    "stableBoundaryD010": {
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F"
    },
    "baselineTakesLargeWipe": true,
    "d0301bSurvivesToClear": true,
    "d0301bTakesShortTail": true,
    "d0301bEditVatMatchesOracle": true,
    "d0301bLeavesOnlyGap": true,
    "d010ReplayClosesD010": true,
    "d010ReplayStillD008E0Only": true,
    "variants": {
      "currentPacket": {
        "name": "currentPacket",
        "label": "current stable packet",
        "stableReplayPatches": [],
        "beforeClearPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x0021C2",
          "lastMode": "adl"
        },
        "beforeClearFields": {
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
        "afterClearFields": {
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
        "finalFields": {
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 1,
          "shortTail0018EC": 0,
          "cleanup0018F8": 1,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "0x0018D7 -> 0x001881",
          "shortTail": "-",
          "cleanup": "0x001881 -> 0x0018F8"
        },
        "editVatMatchesOracle": false,
        "allWatchedMismatches": [
          {
            "name": "D007CA",
            "actual": "0x000000",
            "oracle": "0x0585E9"
          },
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          },
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D02317",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D0231A",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D0231D",
            "actual": "0x000000",
            "oracle": "0xD2A83D"
          },
          {
            "name": "D02437",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D0243A",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D0243D",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D02440",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D02505",
            "actual": "0x00",
            "oracle": "0x0A"
          },
          {
            "name": "D02590",
            "actual": "0x000000",
            "oracle": "0xD3FE81"
          },
          {
            "name": "D0259D",
            "actual": "0x000000",
            "oracle": "0xD3FECD"
          },
          {
            "name": "D0301B",
            "actual": "0x000000",
            "oracle": "0x5AA55A"
          }
        ],
        "gapMismatches": [
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          }
        ]
      },
      "d0301bReplay": {
        "name": "d0301bReplay",
        "label": "current packet + D0301B",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": [],
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
        "beforeClearFields": {
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
        "afterClearFields": {
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
        "finalFields": {
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "-",
          "shortTail": "0x0018D7 -> 0x0018EC",
          "cleanup": "-"
        },
        "editVatMatchesOracle": true,
        "allWatchedMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          },
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          }
        ],
        "gapMismatches": [
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ]
      },
      "d0301bD010Replay": {
        "name": "d0301bD010Replay",
        "label": "current packet + D0301B + D010 mirror",
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
        "beforeClearPatches": [],
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "-",
          "shortTail": "0x0018D7 -> 0x0018EC",
          "cleanup": "-"
        },
        "editVatMatchesOracle": true,
        "allWatchedMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ],
        "gapMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ]
      }
    },
    "conclusion": "Adding D0301B=0x5AA55A to the probe-local stable replay state is causal for the unforced CLEAR route: it survives to the sentinel gate, takes 0x0018D7 -> 0x0018EC, avoids the large 0x0018F8 wipe, and preserves the edit/VAT oracle fields. D0301B alone leaves exactly the D010 mirror packet plus D008E0 as the remaining mismatch. A narrow D010 replay closes D010EF/D010FE/D010F4 and leaves only D008E0, so D008E0 is a separate stack/errSP anchor gap rather than part of the sentinel cleanup geometry."
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
    "stableSnapshot": {
      "atBlock": 396519,
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
        "launchHome09DD62": 1,
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
          }
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
          }
        }
      ]
    }
  },
  "variants": [
    {
      "variant": {
        "name": "currentPacket",
        "label": "current stable packet",
        "stableReplayPatches": [],
        "beforeClearPatches": []
      },
      "boot": {
        "stableReplayPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
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
        }
      },
      "clear": {
        "beforeClearPatches": [],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x0021C2",
          "lastMode": "adl"
        },
        "finalFields": {
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
        "targetCounts": {
          "launchHome09DD62": 0,
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 1,
          "shortTail0018EC": 0,
          "cleanup0018F8": 1,
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
              }
            ]
          },
          "largeClear001881": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x001881",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x001881",
              "currentBlockPc": "0x001881",
              "sp": "0xD1A87B",
              "af": "0x5293",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0xA55AA6",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x93"
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
              }
            ]
          },
          "cleanup0018F8": {
            "block": 77379,
            "phase": "clear-route",
            "pc": "0x0018F8",
            "prevPc": "0x001881",
            "cpu": {
              "pc": "0x0018F8",
              "currentBlockPc": "0x0018F8",
              "sp": "0xD1A87B",
              "af": "0x5281",
              "bc": "0x0000FF",
              "de": "0xD3FF00",
              "hl": "0xD3FEFF",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x81"
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
              }
            ]
          },
          "poll006D64": {
            "block": 86821,
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
            "stackTop": [
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
              }
            ]
          }
        },
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
            }
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x006D5D",
              "currentBlockPc": "0x006D5D",
              "sp": "0xD1A828",
              "af": "0x0054",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x54"
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
            }
          }
        ]
      }
    },
    {
      "variant": {
        "name": "d0301bReplay",
        "label": "current packet + D0301B",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": []
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
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
        }
      },
      "clear": {
        "beforeClearPatches": [],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
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
        "targetCounts": {
          "launchHome09DD62": 0,
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
              }
            ]
          }
        },
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
            }
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
            }
          }
        ]
      }
    },
    {
      "variant": {
        "name": "d0301bD010Replay",
        "label": "current packet + D0301B + D010 mirror",
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
        "beforeClearPatches": []
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
        "beforeClearPatches": [],
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
          "launchHome09DD62": 0,
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
            "stackTop": [
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
            "stackTop": [
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
            "stackTop": [
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
            "stackTop": [
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
              }
            ]
          }
        },
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
            }
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
            }
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
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

