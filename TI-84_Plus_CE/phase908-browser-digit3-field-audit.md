# Phase 908: Browser Digit3 Field Audit

Probe: `probe-phase908-browser-digit3-field-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase908-browser-digit3-field-audit.mjs`

Serves a temporary observation-only copy of `browser-shell.html`, boots coldboot mode, presses Digit3 through headless Chrome, and compares post-key RAM to `captures/realram-home-digit3-D00000-D657FF.bin`. The disk browser shell is not edited.

## Summary

- Probe completed: PASS.
- Phase886 watched-field oracle match: NO (1 mismatches).
- Edit-line contract match: NO (1 mismatches).
- Key route: code=Digit3, label=3, termination=post_insert_gate_stop, steps=7526, expectedInsertByte=0x33, insertBlock=2908, postInsertGateBlock=7504, stoppedAtPostInsertGate=true, D000C2Bit7Restored=true.
- Phase 6: halt after 47298 steps at 0x0019B5; snapshot captured=true.
- Page errors: [].
- Adjudication: The browser Digit3 route completed cleanly, but one or more oracle fields differ; see the owner/classification column for the first observed cause.

## Source Checks

| Source check | Value |
| --- | --- |
| D010 replay packet present | yes |
| D0301B magic forced | no |
| D008E0 uses SCREEN_STACK_TOP-18 | yes |
| Broad edit/VAT force-restore marker found | no |
| Digit3 insert byte mapping | 0x33 |
| Digit3 scan-code mapping | 0x12 |

## Phase886 Watched Fields

| Field | Oracle digit3 | Browser Digit3 | Match |
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

## Edit-Line Contract

| Contract | Expected | Oracle | Browser | Pass |
| --- | --- | --- | --- | --- |
| D0243A | 0xD1A8CD | 0xD1A8CD | 0xD1A8CD | yes |
| EDIT_TOKEN_D1A8CC | 0x33 | 0x33 | 0x33 | yes |
| D02A29 | 0x000C | 0x000C | 0x0000 | NO |

## Residual Mismatches

| Field | Actual | Oracle | First owner / classification |
| --- | --- | --- | --- |
| D02A29 | 0x0000 | 0x000C | post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset |

## Route Targets

| Target | Hits |
| --- | --- |
| eventLoop08C331 | 1 |
| getCsc03FA09 | 1 |
| insertGate0158DE | 1 |
| insertGateReturn0013DA | 1 |
| poll006D64 | 0 |
| clearAnchor0A229D | 0 |

## Watched Field Changes During Digit3 Route

| Block | Field | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- |
| 1 | D008E0 | 0x000000 | 0xD1A86C | 0x08C331 | - |
| 2908 | D0243A | 0xD1A8CC | 0xD1A8CD | 0x05E372 | 0x05E348 |
| 2908 | EDIT_TOKEN_D1A8CC | 0x00 | 0x33 | 0x05E372 | 0x05E348 |
| 7505 | D000C2_IY42 | 0x00 | 0x80 | 0x0013DA | 0x0158DE |

## Bounded Machine JSON

```json
{
  "pass": true,
  "phase886Match": false,
  "editContractMatch": false,
  "conclusion": "The browser Digit3 route completed cleanly, but one or more oracle fields differ; see the owner/classification column for the first observed cause.",
  "mismatches": [
    {
      "name": "D02A29",
      "actual": "0x0000",
      "oracle": "0x000C",
      "owner": "post_insert_gate_stop ended browser burst before any D02A29 owner wrote the real cursor offset"
    }
  ],
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
  "afterKey": {
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
  "record": {
    "label": "Digit3",
    "blockCount": 7505,
    "targetCounts": {
      "eventLoop08C331": 1,
      "getCsc03FA09": 1,
      "insertGate0158DE": 1,
      "insertGateReturn0013DA": 1,
      "poll006D64": 0,
      "clearAnchor0A229D": 0
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
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

