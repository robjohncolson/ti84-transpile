# Phase 854: D02505 Lifecycle-Candidate A/B

Probe: `probe-phase854-d02505-lifecycle-candidate-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase854-d02505-lifecycle-candidate-ab.mjs`

## Summary

- Result: PASS. Baseline and lifecycle-carry cases both stopped at the bounded `0x0A31E2 -> 0x0A31A2` owner boundary; no patch was applied at `0x0A31FD`.
- Real captures keep `D02505=0x0A` before CLEAR and `0x0A` after CLEAR.
- Baseline owner input stayed `0x00` and reproduced the Phase852 bad geometry: count `0x24E0`, source `0xD00B0E` -> dest `0xD00E2E`.
- Carrying only the launch-home pre-clear `D02505=0x0A` through the snapshot boundary made the owner naturally see `0x0A` and reproduced the Phase852 safe geometry: count `0x1C20`, source `0xD0330E` -> dest `0xD0362E`.
- Watched critical fields after the bounded owner stop in the carry case: none zeroed.

## Case Comparison

| Case | Pass | Boundary carry | Owner D02505 | 0x0A31F2 count | Source start | Dest start | Zeroed critical fields | 0x0A1854 hits |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| baseline | yes | - | 0x00 | 0x24E0 | 0xD00B0E | 0xD00E2E | D0243A, D0243D, D02590, D0259D | 80 |
| carry_preclear_d02505 | yes | 0x00 -> 0x0A | 0x0A | 0x1C20 | 0xD0330E | 0xD0362E | none | 80 |

## Phase5 Boundary Evidence

```json
[
  {
    "id": "baseline",
    "phase5Snapshot": {
      "block": 84130,
      "pc": "0x001879",
      "d02505": "0x0A",
      "watchedFields": {
        "D02504": "0x00",
        "D02505": "0x0A",
        "D02506": "0x00",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00595": "0x25",
        "D00596": "0x00",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00"
      }
    },
    "d02505Write0A": {
      "block": 49288,
      "blockPc": "0x09DD9E"
    },
    "d02505Clear": {
      "block": 84130,
      "blockPc": "0x001879"
    },
    "finalD02505AfterLaunchHome": "0x00",
    "afterSnapshotRestore": {
      "D02505": "0x00",
      "D02590": "0xD3FE81"
    },
    "afterCarry": {
      "D02505": "0x00",
      "D02590": "0xD3FE81"
    }
  },
  {
    "id": "carry_preclear_d02505",
    "phase5Snapshot": {
      "block": 84130,
      "pc": "0x001879",
      "d02505": "0x0A",
      "watchedFields": {
        "D02504": "0x00",
        "D02505": "0x0A",
        "D02506": "0x00",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00595": "0x25",
        "D00596": "0x00",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00"
      }
    },
    "d02505Write0A": {
      "block": 49288,
      "blockPc": "0x09DD9E"
    },
    "d02505Clear": {
      "block": 84130,
      "blockPc": "0x001879"
    },
    "finalD02505AfterLaunchHome": "0x00",
    "afterSnapshotRestore": {
      "D02505": "0x00",
      "D02590": "0xD3FE81"
    },
    "afterCarry": {
      "D02505": "0x0A",
      "D02590": "0xD3FE81"
    }
  }
]
```

## Owner Hits

```json
{
  "baseline": [
    {
      "pc": "0x0A31FD",
      "blockIndex": 4972,
      "previousPc": "0x0A322B",
      "d02505": "0x00",
      "bc": "0x000100",
      "de": "0xD00595",
      "hl": "0xD02504",
      "z": true,
      "recentPcs": [
        "0x0A2B51",
        "0x0A2B7E",
        "0x0A2B8F",
        "0x0A2BEB",
        "0x0A2C0C",
        "0x0A2C10",
        "0x0A20CC",
        "0x0A20E4",
        "0x0A20EA",
        "0x0A321D",
        "0x0A322B",
        "0x0A31FD"
      ]
    },
    {
      "pc": "0x0A3205",
      "blockIndex": 4973,
      "previousPc": "0x0A31FD",
      "d02505": "0x00",
      "bc": "0x000100",
      "de": "0xD00595",
      "hl": "0xD02504",
      "z": false,
      "recentPcs": [
        "0x0A2B7E",
        "0x0A2B8F",
        "0x0A2BEB",
        "0x0A2C0C",
        "0x0A2C10",
        "0x0A20CC",
        "0x0A20E4",
        "0x0A20EA",
        "0x0A321D",
        "0x0A322B",
        "0x0A31FD",
        "0x0A3205"
      ]
    },
    {
      "pc": "0x0A31B8",
      "blockIndex": 4984,
      "previousPc": "0x0A31F6",
      "d02505": "0x00",
      "bc": "0x00EC14",
      "de": "0xD45C7F",
      "hl": "0x024E00",
      "z": false,
      "recentPcs": [
        "0x0A3205",
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8"
      ]
    },
    {
      "pc": "0x0A31E2",
      "blockIndex": 4985,
      "previousPc": "0x0A31B8",
      "d02505": "0x00",
      "bc": "0x00EC14",
      "de": "0xD031F6",
      "hl": "0x000117",
      "z": true,
      "recentPcs": [
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2"
      ]
    },
    {
      "pc": "0x0A31A2",
      "blockIndex": 4986,
      "previousPc": "0x0A31E2",
      "d02505": "0x00",
      "bc": "0x000000",
      "de": "0xD00E2D",
      "hl": "0xD00B0D",
      "z": false,
      "recentPcs": [
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2",
        "0x0A31A2"
      ]
    }
  ],
  "carry_preclear_d02505": [
    {
      "pc": "0x0A31FD",
      "blockIndex": 4972,
      "previousPc": "0x0A322B",
      "d02505": "0x0A",
      "bc": "0x000100",
      "de": "0xD00595",
      "hl": "0xD02504",
      "z": true,
      "recentPcs": [
        "0x0A2B51",
        "0x0A2B7E",
        "0x0A2B8F",
        "0x0A2BEB",
        "0x0A2C0C",
        "0x0A2C10",
        "0x0A20CC",
        "0x0A20E4",
        "0x0A20EA",
        "0x0A321D",
        "0x0A322B",
        "0x0A31FD"
      ]
    },
    {
      "pc": "0x0A3205",
      "blockIndex": 4973,
      "previousPc": "0x0A31FD",
      "d02505": "0x0A",
      "bc": "0x000100",
      "de": "0xD00595",
      "hl": "0xD02504",
      "z": false,
      "recentPcs": [
        "0x0A2B7E",
        "0x0A2B8F",
        "0x0A2BEB",
        "0x0A2C0C",
        "0x0A2C10",
        "0x0A20CC",
        "0x0A20E4",
        "0x0A20EA",
        "0x0A321D",
        "0x0A322B",
        "0x0A31FD",
        "0x0A3205"
      ]
    },
    {
      "pc": "0x0A31B8",
      "blockIndex": 4984,
      "previousPc": "0x0A31F6",
      "d02505": "0x0A",
      "bc": "0x00B414",
      "de": "0xD6507F",
      "hl": "0x01C200",
      "z": false,
      "recentPcs": [
        "0x0A3205",
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8"
      ]
    },
    {
      "pc": "0x0A31E2",
      "blockIndex": 4985,
      "previousPc": "0x0A31B8",
      "d02505": "0x0A",
      "bc": "0x00B414",
      "de": "0xD031F6",
      "hl": "0x002057",
      "z": true,
      "recentPcs": [
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2"
      ]
    },
    {
      "pc": "0x0A31A2",
      "blockIndex": 4986,
      "previousPc": "0x0A31E2",
      "d02505": "0x0A",
      "bc": "0x000000",
      "de": "0xD0362D",
      "hl": "0xD0330D",
      "z": false,
      "recentPcs": [
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2",
        "0x0A31A2"
      ]
    }
  ]
}
```

## LDDR Samples

```json
{
  "baseline": [
    {
      "label": "lddr-0a31c1",
      "logicalPc": "0x0A31C1",
      "blockPc": "0x0A31B8",
      "blockIndex": 4984,
      "before": {
        "pc": "0x0A31B8",
        "currentBlockPc": "0x0A31B8",
        "sp": "0xD1A812",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0082",
        "bc": "0x024E00",
        "de": "0xD45C7F",
        "hl": "0xD42A7F",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "after": {
        "pc": "0x0A31B8",
        "currentBlockPc": "0x0A31B8",
        "sp": "0xD1A812",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0080",
        "bc": "0x000000",
        "de": "0xD20E7F",
        "hl": "0xD1DC7F",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "copyPlan": {
        "count": "0x24E00",
        "sourceStart": "0xD1DC80",
        "sourceEnd": "0xD42A7F",
        "destStart": "0xD20E80",
        "destEnd": "0xD45C7F"
      },
      "recentPcs": [
        "0x0A3205",
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8"
      ]
    },
    {
      "label": "lddr-0a31f2",
      "logicalPc": "0x0A31F2",
      "blockPc": "0x0A31E2",
      "blockIndex": 4985,
      "before": {
        "pc": "0x0A31E2",
        "currentBlockPc": "0x0A31E2",
        "sp": "0xD1A818",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0682",
        "bc": "0x0024E0",
        "de": "0xD0330D",
        "hl": "0xD02FED",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "after": {
        "pc": "0x0A31E2",
        "currentBlockPc": "0x0A31E2",
        "sp": "0xD1A818",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0680",
        "bc": "0x000000",
        "de": "0xD00E2D",
        "hl": "0xD00B0D",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "copyPlan": {
        "count": "0x24E0",
        "sourceStart": "0xD00B0E",
        "sourceEnd": "0xD02FED",
        "destStart": "0xD00E2E",
        "destEnd": "0xD0330D"
      },
      "recentPcs": [
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2"
      ]
    }
  ],
  "carry_preclear_d02505": [
    {
      "label": "lddr-0a31c1",
      "logicalPc": "0x0A31C1",
      "blockPc": "0x0A31B8",
      "blockIndex": 4984,
      "before": {
        "pc": "0x0A31B8",
        "currentBlockPc": "0x0A31B8",
        "sp": "0xD1A812",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0082",
        "bc": "0x01C200",
        "de": "0xD6507F",
        "hl": "0xD61E7F",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "after": {
        "pc": "0x0A31B8",
        "currentBlockPc": "0x0A31B8",
        "sp": "0xD1A812",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0x0080",
        "bc": "0x000000",
        "de": "0xD48E7F",
        "hl": "0xD45C7F",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "copyPlan": {
        "count": "0x1C200",
        "sourceStart": "0xD45C80",
        "sourceEnd": "0xD61E7F",
        "destStart": "0xD48E80",
        "destEnd": "0xD6507F"
      },
      "recentPcs": [
        "0x0A3205",
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8"
      ]
    },
    {
      "label": "lddr-0a31f2",
      "logicalPc": "0x0A31F2",
      "blockPc": "0x0A31E2",
      "blockIndex": 4985,
      "before": {
        "pc": "0x0A31E2",
        "currentBlockPc": "0x0A31E2",
        "sp": "0xD1A818",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0xCE8A",
        "bc": "0x001C20",
        "de": "0xD0524D",
        "hl": "0xD04F2D",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "after": {
        "pc": "0x0A31E2",
        "currentBlockPc": "0x0A31E2",
        "sp": "0xD1A818",
        "ix": "0xD02504",
        "iy": "0xD00080",
        "af": "0xCE88",
        "bc": "0x000000",
        "de": "0xD0362D",
        "hl": "0xD0330D",
        "flags": {
          "z": false,
          "c": false,
          "pv": false
        },
        "fields": {
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00"
        }
      },
      "copyPlan": {
        "count": "0x1C20",
        "sourceStart": "0xD0330E",
        "sourceEnd": "0xD04F2D",
        "destStart": "0xD0362E",
        "destEnd": "0xD0524D"
      },
      "recentPcs": [
        "0x0A2D4C",
        "0x0A3216",
        "0x0A3146",
        "0x0A314D",
        "0x0A31F6",
        "0x0A3158",
        "0x0A31A6",
        "0x0A31F6",
        "0x0A31AC",
        "0x0A31F6",
        "0x0A31B8",
        "0x0A31E2"
      ]
    }
  ]
}
```

## Machine JSON

```json
{
  "probe": "phase854-d02505-lifecycle-candidate-ab",
  "pass": true,
  "checks": {
    "casesPass": true,
    "baselineBadGeometry": true,
    "carrySafeGeometry": true,
    "carryAvoidedCriticalZeroing": true,
    "no0A31FDPatch": true
  },
  "conclusion": "Carrying only the launch-home D02505=0x0A value across the pre-clear snapshot boundary naturally produces the safe 0x0A31FD owner input and safe copy geometry without a downstream owner patch."
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

