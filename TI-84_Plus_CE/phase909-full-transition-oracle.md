# Phase 909: Full Transition Oracle

Probe: `probe-phase909-full-transition-oracle.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase909-full-transition-oracle.mjs`

Serves a temporary observation-only copy of `browser-shell.html`, boots coldboot mode, presses Digit3, records checkpoint A against `realram-home-digit3-D00000-D657FF.bin`, then presses Escape/CLEAR and records checkpoint B against `realram-home-afterCLEAR-D00000-D657FF.bin`. The disk browser shell is not edited.

## Summary

- Probe completed: PASS.
- Clean pre-stop execution: NO; classified CLEAR route: YES.
- Checkpoint A (Digit3) field match: NO (1 mismatches); known-only residual: YES.
- Checkpoint A edit-line contract: NO (1 mismatches).
- Checkpoint B (CLEAR) field match: NO (16 mismatches).
- Checkpoint B edit-line contract: NO (1 mismatches).
- Digit3 route: termination=post_insert_gate_stop, steps=7526, insert=0x33, insertBlock=2908, postInsertGateBlock=7504, D000C2Bit7Restored=true.
- CLEAR route: termination=max_steps, steps=350000, controlStopPc=-, uiClearApplied=false, wipes=3.
- Phase 6: halt after 47298 steps at 0x0019B5; snapshot captured=true.
- Page errors: [].
- Adjudication: Digit3 is oracle-faithful except for the known checkpoint-A D02A29 residual, but the following CLEAR diverges: it misses the 0x0A229D pre-stop, takes the 0x001879 -> 0x0018F8 wipe path, and ends at max_steps with watched fields zeroed.

## Source Checks

| Source check | Value |
| --- | --- |
| D010 replay packet present | yes |
| D0301B magic forced | no |
| D008E0 uses SCREEN_STACK_TOP-18 | yes |
| Broad edit/VAT force-restore marker found | no |
| Digit3 insert byte mapping | 0x33 |
| Digit3 scan-code mapping | 0x12 |

## Checkpoint A: Digit3 Watched Fields

| Field | Oracle Digit3 | Browser Digit3 | Match |
| --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x0585E9 | yes |
| D008E0 | 0xD1A86C | 0xD1A86C | yes |
| D010EF | 0xD2A83E | 0xD2A83E | yes |
| D010FE | 0xD1A8CC | 0xD1A8CC | yes |
| D010F4 | 0x1F | 0x1F | yes |
| D02317 | 0xD2A83E | 0xD2A83E | yes |
| D0231A | 0xD2A83E | 0xD2A83E | yes |
| D0231D | 0xD2A83D | 0xD2A83D | yes |
| D02437 | 0xD1A8CC | 0xD1A8CC | yes |
| D0243A | 0xD1A8CD | 0xD1A8CD | yes |
| D0243D | 0xD2A83E | 0xD2A83E | yes |
| D02440 | 0xD2A83E | 0xD2A83E | yes |
| D02505 | 0x0A | 0x0A | yes |
| D02590 | 0xD3FE81 | 0xD3FE81 | yes |
| D0259D | 0xD3FECD | 0xD3FECD | yes |
| D02A29 | 0x000C | 0x0000 | NO |
| D0301B | 0x5AA55A | 0x5AA55A | yes |
| D000C2_IY42 | 0x00 | 0x00 | yes |

## Checkpoint A: Edit-Line Contract

| Contract | Expected | Oracle | Browser | Pass |
| --- | --- | --- | --- | --- |
| D0243A | 0xD1A8CD | 0xD1A8CD | 0xD1A8CD | yes |
| EDIT_TOKEN_D1A8CC | 0x33 | 0x33 | 0x33 | yes |
| D02A29 | 0x000C | 0x000C | 0x0000 | NO |

## Checkpoint A: Residual Mismatches

| Field | Actual | Oracle | First owner / classification |
| --- | --- | --- | --- |
| D02A29 | 0x0000 | 0x000C | known checkpoint-A residual: post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset |

## Checkpoint B: CLEAR Watched Fields

| Field | Oracle after CLEAR | Browser after CLEAR | Match |
| --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | NO |
| D008E0 | 0xD1A86C | 0x000000 | NO |
| D010EF | 0xD2A83E | 0x000000 | NO |
| D010FE | 0xD1A8CC | 0x000000 | NO |
| D010F4 | 0x1F | 0x00 | NO |
| D02317 | 0xD2A83E | 0x000000 | NO |
| D0231A | 0xD2A83E | 0x000000 | NO |
| D0231D | 0xD2A83D | 0x000000 | NO |
| D02437 | 0xD1A8CC | 0x000000 | NO |
| D0243A | 0xD1A8CC | 0x000000 | NO |
| D0243D | 0xD2A83E | 0x000000 | NO |
| D02440 | 0xD2A83E | 0x000000 | NO |
| D02505 | 0x0A | 0x00 | NO |
| D02590 | 0xD3FE81 | 0x000000 | NO |
| D0259D | 0xD3FECD | 0x000000 | NO |
| D02A29 | 0x0000 | 0x0000 | yes |
| D0301B | 0x5AA55A | 0x000000 | NO |
| D000C2_IY42 | 0x00 | 0x00 | yes |

## Checkpoint B: Edit-Line Contract

| Contract | Expected | Oracle | Browser | Pass |
| --- | --- | --- | --- | --- |
| D0243A | 0xD1A8CC | 0xD1A8CC | 0x000000 | NO |
| EDIT_TOKEN_D1A8CC | 0x33 | 0x33 | 0x33 | yes |
| D02A29 | 0x0000 | 0x0000 | 0x0000 | yes |

## Checkpoint B: Residual Mismatches

| Field | Actual | Oracle | First owner / classification |
| --- | --- | --- | --- |
| D007CA | 0x000000 | 0x0585E9 | first changed before pc 0x0018F8 (prev 0x001879) |
| D008E0 | 0x000000 | 0xD1A86C | first changed before pc 0x0018F8 (prev 0x001879) |
| D010EF | 0x000000 | 0xD2A83E | first changed before pc 0x0018F8 (prev 0x001879) |
| D010FE | 0x000000 | 0xD1A8CC | first changed before pc 0x0018F8 (prev 0x001879) |
| D010F4 | 0x00 | 0x1F | first changed before pc 0x0018F8 (prev 0x001879) |
| D02317 | 0x000000 | 0xD2A83E | first changed before pc 0x0018F8 (prev 0x001879) |
| D0231A | 0x000000 | 0xD2A83E | first changed before pc 0x0018F8 (prev 0x001879) |
| D0231D | 0x000000 | 0xD2A83D | first changed before pc 0x0018F8 (prev 0x001879) |
| D02437 | 0x000000 | 0xD1A8CC | first changed before pc 0x0018F8 (prev 0x001879) |
| D0243A | 0x000000 | 0xD1A8CC | first changed before pc 0x0018F8 (prev 0x001879) |
| D0243D | 0x000000 | 0xD2A83E | first changed before pc 0x0018F8 (prev 0x001879) |
| D02440 | 0x000000 | 0xD2A83E | first changed before pc 0x0018F8 (prev 0x001879) |
| D02505 | 0x00 | 0x0A | first changed before pc 0x0018F8 (prev 0x001879) |
| D02590 | 0x000000 | 0xD3FE81 | first changed before pc 0x0018F8 (prev 0x001879) |
| D0259D | 0x000000 | 0xD3FECD | first changed before pc 0x0018F8 (prev 0x001879) |
| D0301B | 0x000000 | 0x5AA55A | first changed before pc 0x0018F8 (prev 0x001879) |

## Digit3 Route Targets

| Target | Hits |
| --- | --- |
| eventLoop08C331 | 1 |
| getCsc03FA09 | 1 |
| insertGate0158DE | 1 |
| insertGateReturn0013DA | 1 |
| clearCaller058A16 | 0 |
| clearEntry0A223A | 0 |
| clearAnchor0A229D | 0 |
| sentinelBlock0018D7 | 0 |
| shortTail0018EC | 0 |
| cleanup0018F8 | 0 |
| poll006D64 | 0 |

## CLEAR Route Targets

| Target | Hits |
| --- | --- |
| eventLoop08C331 | 2 |
| getCsc03FA09 | 2 |
| insertGate0158DE | 5 |
| insertGateReturn0013DA | 2 |
| clearCaller058A16 | 0 |
| clearEntry0A223A | 0 |
| clearAnchor0A229D | 0 |
| sentinelBlock0018D7 | 0 |
| shortTail0018EC | 0 |
| cleanup0018F8 | 3 |
| poll006D64 | 20176 |

## Watched Field Changes During Digit3 Route

| Block | Field | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- |
| 1 | D008E0 | 0x000000 | 0xD1A86C | 0x08C331 | - |
| 2908 | D0243A | 0xD1A8CC | 0xD1A8CD | 0x05E372 | 0x05E348 |
| 2908 | EDIT_TOKEN_D1A8CC | 0x00 | 0x33 | 0x05E372 | 0x05E348 |
| 7505 | D000C2_IY42 | 0x00 | 0x80 | 0x0013DA | 0x0158DE |

## Watched Field Changes During CLEAR Route

| Block | Field | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- |
| 5553 | D007CA | 0x0585E9 | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D008E0 | 0xD1A86C | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D010EF | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D010FE | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D010F4 | 0x1F | 0x00 | 0x0018F8 | 0x001879 |
| 5553 | D02317 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0231A | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0231D | 0xD2A83D | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D02437 | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0243A | 0xD1A8CD | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0243D | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D02440 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D02505 | 0x0A | 0x00 | 0x0018F8 | 0x001879 |
| 5553 | D02590 | 0xD3FE81 | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0259D | 0xD3FECD | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | D0301B | 0x5AA55A | 0x000000 | 0x0018F8 | 0x001879 |

## UI Clear Samples

```json
[]
```

## Bounded Machine JSON

```json
{
  "pass": true,
  "cleanExecution": false,
  "clearRouteClassified": true,
  "conclusion": "Digit3 is oracle-faithful except for the known checkpoint-A D02A29 residual, but the following CLEAR diverges: it misses the 0x0A229D pre-stop, takes the 0x001879 -> 0x0018F8 wipe path, and ends at max_steps with watched fields zeroed.",
  "checkpointA": {
    "fieldMatch": false,
    "contractMatch": false,
    "knownOnly": true,
    "mismatches": [
      {
        "name": "D02A29",
        "actual": "0x0000",
        "oracle": "0x000C",
        "owner": "known checkpoint-A residual: post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset"
      }
    ],
    "contractMismatches": [
      {
        "name": "D02A29",
        "expected": "0x000C",
        "oracle": "0x000C",
        "actual": "0x0000"
      }
    ],
    "contractRows": [
      {
        "name": "D0243A",
        "expected": 13740237,
        "oracle": 13740237,
        "actual": 13740237,
        "pass": true
      },
      {
        "name": "EDIT_TOKEN_D1A8CC",
        "expected": 51,
        "oracle": 51,
        "actual": 51,
        "pass": true
      },
      {
        "name": "D02A29",
        "expected": 12,
        "oracle": 12,
        "actual": 0,
        "pass": false
      }
    ]
  },
  "checkpointB": {
    "fieldMatch": false,
    "contractMatch": false,
    "mismatches": [
      {
        "name": "D007CA",
        "actual": "0x000000",
        "oracle": "0x0585E9",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D008E0",
        "actual": "0x000000",
        "oracle": "0xD1A86C",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D010EF",
        "actual": "0x000000",
        "oracle": "0xD2A83E",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D010FE",
        "actual": "0x000000",
        "oracle": "0xD1A8CC",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D010F4",
        "actual": "0x00",
        "oracle": "0x1F",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D02317",
        "actual": "0x000000",
        "oracle": "0xD2A83E",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0231A",
        "actual": "0x000000",
        "oracle": "0xD2A83E",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0231D",
        "actual": "0x000000",
        "oracle": "0xD2A83D",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D02437",
        "actual": "0x000000",
        "oracle": "0xD1A8CC",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0243A",
        "actual": "0x000000",
        "oracle": "0xD1A8CC",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0243D",
        "actual": "0x000000",
        "oracle": "0xD2A83E",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D02440",
        "actual": "0x000000",
        "oracle": "0xD2A83E",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D02505",
        "actual": "0x00",
        "oracle": "0x0A",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D02590",
        "actual": "0x000000",
        "oracle": "0xD3FE81",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0259D",
        "actual": "0x000000",
        "oracle": "0xD3FECD",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      },
      {
        "name": "D0301B",
        "actual": "0x000000",
        "oracle": "0x5AA55A",
        "owner": "first changed before pc 0x0018F8 (prev 0x001879)"
      }
    ],
    "contractMismatches": [
      {
        "name": "D0243A",
        "expected": "0xD1A8CC",
        "oracle": "0xD1A8CC",
        "actual": "0x000000"
      }
    ],
    "contractRows": [
      {
        "name": "D0243A",
        "expected": 13740236,
        "oracle": 13740236,
        "actual": 0,
        "pass": false
      },
      {
        "name": "EDIT_TOKEN_D1A8CC",
        "expected": 51,
        "oracle": 51,
        "actual": 51,
        "pass": true
      },
      {
        "name": "D02A29",
        "expected": 0,
        "oracle": 0,
        "actual": 0,
        "pass": true
      }
    ]
  },
  "sourceEvidence": {
    "replayNames": [
      "D007CA",
      "D008E0",
      "D02505",
      "D02587",
      "D0258A",
      "D0258D",
      "D02590",
      "D02593",
      "D0259A",
      "D0259D",
      "D025A0",
      "D025C5",
      "D010EF",
      "D010FE",
      "D010F4"
    ],
    "hasD010Replay": true,
    "hasD0301BForce": false,
    "hasD008E0OracleErrSp": true,
    "hasBroadEditVatForceRestore": false,
    "digit3InsertByte": 51,
    "digit3ScanCode": 18
  },
  "bootSnapshot": [
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
    },
    {
      "name": "D010EF",
      "addr": "0xD010EF",
      "len": 3,
      "value": "0xD2A83E"
    },
    {
      "name": "D010FE",
      "addr": "0xD010FE",
      "len": 3,
      "value": "0xD1A8CC"
    },
    {
      "name": "D010F4",
      "addr": "0xD010F4",
      "len": 1,
      "value": "0x1F"
    }
  ],
  "postReplayFields": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
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
    "D0301B": "0x5AA55A",
    "D000C2_IY42": "0x00",
    "EDIT_TOKEN_D1A8CC": "0x00"
  },
  "afterD0301BFields": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
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
    "D0301B": "0x5AA55A",
    "D000C2_IY42": "0x00",
    "EDIT_TOKEN_D1A8CC": "0x00"
  },
  "afterBoot": {
    "status": "Coldboot complete. OS event loop is ready.",
    "fields": {
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
      "D000C2_IY42": "0x00",
      "EDIT_TOKEN_D1A8CC": "0x00"
    },
    "editLine": {
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00595": 0,
      "D00596": 0,
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
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 0
      },
      "vramCurrent": 8482
    },
    "phase6": {
      "steps": 47298,
      "termination": "halt",
      "lastPc": 6581,
      "vram": 8482,
      "vatSnapshotCaptured": true,
      "naturalD0301BOwner": {
        "entry": 283838,
        "steps": 39171,
        "termination": "stopped_before_target",
        "lastPc": 646880,
        "beforeD0301B": 0,
        "afterD0301B": 5940570
      }
    }
  },
  "afterDigit": {
    "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
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
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D0301B": "0x5AA55A",
      "D000C2_IY42": "0x00",
      "EDIT_TOKEN_D1A8CC": "0x33"
    },
    "editLine": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00595": 0,
      "D00596": 1,
      "buffer": [
        51,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 207
      },
      "vramCurrent": 8689
    },
    "persistence": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 13805630,
        "D02A40": 13805630,
        "D02A28": 0
      }
    },
    "lastKey": {
      "code": "Digit3",
      "label": "3",
      "expectedInsertByte": 51,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": 13740236,
      "insertBlock": 2908,
      "postInsertGateBlock": 7504,
      "stoppedAtPostInsertGate": true,
      "D000C2Bit7Restored": true,
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
      "steps": 7526,
      "termination": "post_insert_gate_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D007CA": 361961,
      "D008E0": 13740140,
      "D02590": 13893249,
      "D000C2": 0,
      "buffer": [
        51,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8689,
      "vramCurrent": 8689
    }
  },
  "afterClear": {
    "status": "Key: CLEAR → 350000 steps (max_steps, peak 8689px)",
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
      "D000C2_IY42": "0x00",
      "EDIT_TOKEN_D1A8CC": "0x33"
    },
    "editLine": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D00595": 4,
      "D00596": 19,
      "buffer": [
        51,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 0
      },
      "vramCurrent": 3039
    },
    "persistence": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 0,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 664221,
      "controlPreStopLabel": "clear-eol-bc-zero-owner",
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
      "steps": 350000,
      "termination": "max_steps",
      "wipes": 3,
      "D0243A": 0,
      "D0243D": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02590": 0,
      "D000C2": 0,
      "buffer": [
        51,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8689,
      "vramCurrent": 3039
    }
  },
  "digitRecord": {
    "label": "Digit3",
    "active": false,
    "blockCount": 7505,
    "prevPc": "0x0013DA",
    "start": {
      "label": "start",
      "status": "Coldboot complete. OS event loop is ready.",
      "runtimeMode": "coldboot",
      "lastPc": "0x08C331",
      "lastMode": "adl",
      "totalSteps": 674702,
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A866",
        "af": "0x1054",
        "bc": "0x000000",
        "de": "0xD2A815",
        "hl": "0xD1A8A3",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": true
      },
      "fields": {
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
        "D000C2_IY42": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x00"
      },
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 0,
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
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8482
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8482,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": null,
      "pageErrors": []
    },
    "end": {
      "label": "end",
      "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
      "runtimeMode": "coldboot",
      "lastPc": "0x08C331",
      "lastMode": "adl",
      "totalSteps": 682228,
      "cpu": {
        "pc": "0x0013DA",
        "currentBlockPc": "0x0013DA",
        "sp": "0xD1A87E",
        "af": "0xD090",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x90",
        "halted": false
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
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 1,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 207
        },
        "vramCurrent": 8689
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8689,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2908,
        "postInsertGateBlock": 7504,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
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
        "steps": 7526,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 8689
      },
      "pageErrors": []
    },
    "lastFields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D0301B": "0x5AA55A",
      "D000C2_IY42": "0x80",
      "EDIT_TOKEN_D1A8CC": "0x33"
    },
    "targetCounts": {
      "eventLoop08C331": 1,
      "getCsc03FA09": 1,
      "insertGate0158DE": 1,
      "insertGateReturn0013DA": 1,
      "clearCaller058A16": 0,
      "clearEntry0A223A": 0,
      "clearAnchor0A229D": 0,
      "sentinelBlock0018D7": 0,
      "shortTail0018EC": 0,
      "cleanup0018F8": 0,
      "poll006D64": 0
    },
    "targetFirst": {
      "eventLoop08C331": {
        "block": 1,
        "pc": "0x08C331",
        "prevPc": null,
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
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x00"
        }
      },
      "getCsc03FA09": {
        "block": 5128,
        "pc": "0x03FA09",
        "prevPc": "0x02FDB6",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "insertGate0158DE": {
        "block": 7504,
        "pc": "0x0158DE",
        "prevPc": "0x0013C7",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "insertGateReturn0013DA": {
        "block": 7505,
        "pc": "0x0013DA",
        "prevPc": "0x0158DE",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x80",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      }
    },
    "fieldChanges": [
      {
        "block": 1,
        "name": "D008E0",
        "before": "0x000000",
        "after": "0xD1A86C",
        "pc": "0x08C331",
        "prevPc": null
      },
      {
        "block": 2908,
        "name": "D0243A",
        "before": "0xD1A8CC",
        "after": "0xD1A8CD",
        "pc": "0x05E372",
        "prevPc": "0x05E348"
      },
      {
        "block": 2908,
        "name": "EDIT_TOKEN_D1A8CC",
        "before": "0x00",
        "after": "0x33",
        "pc": "0x05E372",
        "prevPc": "0x05E348"
      },
      {
        "block": 7505,
        "name": "D000C2_IY42",
        "before": "0x00",
        "after": "0x80",
        "pc": "0x0013DA",
        "prevPc": "0x0158DE"
      }
    ]
  },
  "clearRecord": {
    "label": "Escape/CLEAR",
    "active": false,
    "blockCount": 349976,
    "prevPc": "0x000BFE",
    "start": {
      "label": "start",
      "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
      "runtimeMode": "coldboot",
      "lastPc": "0x08C331",
      "lastMode": "adl",
      "totalSteps": 682228,
      "cpu": {
        "pc": "0x0013DA",
        "currentBlockPc": "0x0013DA",
        "sp": "0xD1A87E",
        "af": "0xD090",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x90",
        "halted": false
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
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 1,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 207
        },
        "vramCurrent": 8689
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8689,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2908,
        "postInsertGateBlock": 7504,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
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
        "steps": 7526,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 8689
      },
      "pageErrors": []
    },
    "end": {
      "label": "end",
      "status": "Key: CLEAR → 350000 steps (max_steps, peak 8689px)",
      "runtimeMode": "coldboot",
      "lastPc": "0x000BFE",
      "lastMode": "adl",
      "totalSteps": 1032228,
      "cpu": {
        "pc": "0x000BFE",
        "currentBlockPc": "0x000BFE",
        "sp": "0xD1A3BC",
        "af": "0x1500",
        "bc": "0xFFFFFF",
        "de": "0x000014",
        "hl": "0x000015",
        "ix": "0xD1A3E9",
        "iy": "0xD00080",
        "f": "0x00",
        "halted": false
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
        "D000C2_IY42": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "editLine": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D00595": 4,
        "D00596": 19,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 3039
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "vram": 3039,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
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
        "steps": 350000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3039
      },
      "pageErrors": []
    },
    "lastFields": {
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
      "D000C2_IY42": "0x00",
      "EDIT_TOKEN_D1A8CC": "0x33"
    },
    "targetCounts": {
      "eventLoop08C331": 2,
      "getCsc03FA09": 2,
      "insertGate0158DE": 5,
      "insertGateReturn0013DA": 2,
      "clearCaller058A16": 0,
      "clearEntry0A223A": 0,
      "clearAnchor0A229D": 0,
      "sentinelBlock0018D7": 0,
      "shortTail0018EC": 0,
      "cleanup0018F8": 3,
      "poll006D64": 20176
    },
    "targetFirst": {
      "eventLoop08C331": {
        "block": 1,
        "pc": "0x08C331",
        "prevPc": null,
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "getCsc03FA09": {
        "block": 3789,
        "pc": "0x03FA09",
        "prevPc": "0x02FDB6",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "insertGate0158DE": {
        "block": 5346,
        "pc": "0x0158DE",
        "prevPc": "0x0013C7",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "insertGateReturn0013DA": {
        "block": 5447,
        "pc": "0x0013DA",
        "prevPc": "0x0158F8",
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
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "cleanup0018F8": {
        "block": 5553,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
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
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      },
      "poll006D64": {
        "block": 14862,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
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
          "D000C2_IY42": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        }
      }
    },
    "fieldChanges": [
      {
        "block": 5553,
        "name": "D007CA",
        "before": "0x0585E9",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D008E0",
        "before": "0xD1A86C",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D010EF",
        "before": "0xD2A83E",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D010FE",
        "before": "0xD1A8CC",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D010F4",
        "before": "0x1F",
        "after": "0x00",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D02317",
        "before": "0xD2A83E",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0231A",
        "before": "0xD2A83E",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0231D",
        "before": "0xD2A83D",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D02437",
        "before": "0xD1A8CC",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0243A",
        "before": "0xD1A8CD",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0243D",
        "before": "0xD2A83E",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D02440",
        "before": "0xD2A83E",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D02505",
        "before": "0x0A",
        "after": "0x00",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D02590",
        "before": "0xD3FE81",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0259D",
        "before": "0xD3FECD",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      },
      {
        "block": 5553,
        "name": "D0301B",
        "before": "0x5AA55A",
        "after": "0x000000",
        "pc": "0x0018F8",
        "prevPc": "0x001879"
      }
    ]
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

