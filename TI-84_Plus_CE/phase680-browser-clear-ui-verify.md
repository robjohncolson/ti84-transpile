# Phase 680: Browser UI-Level CLEAR Integration Verify

Probe: `probe-phase680-browser-clear-ui-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase680-browser-clear-ui-verify.mjs`

## Result

- Overall: **PASS**
- Scope: real `browser-shell.html` headless run; coldboot + Preserve Display; no injected page code.

## Sequence

| step | termination | buffer | cursor | ROI non-white | ui-clear | page errors |
|---|---|---|---:|---:|---|---|
| 2 | insert_stop | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 65 | n/a | [] |
| CLEAR | control_pre_stop | 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CC | 0 | {"ok":true,"reason":"clear-key","editBase":13740236,"clearLen":128,"roiBefore":205,"roiAfter":0,"D0243A":13740236,"D00595":0,"D00596":0} | [] |
| 3 | insert_stop | 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 107 | n/a | [] |

## Interpretation

- CLEAR/Escape still stops before the destructive `0x001879` ROM clear and is not part of `COLDBOOT_INSERT_BYTE_BY_PC_CODE`.
- The real shell now applies browser-level CLEAR semantics after that safe pre-stop: edit buffer zeroed, `D0243A=D1A8CC`, renderer row/col reset to zero, and the entry ROI whitened.
- The follow-up `3` inserts as a fresh line (`33 00 ...`) with cxMain/VAT intact, proving the previous `2` no longer persists or appends after CLEAR.

## Compact JSON

```json
{
  "pass": true,
  "boot": {
    "D007CA": "0x0585E9",
    "D008E0": "0x000000",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "D00595": "0x00",
    "D00596": "0x00",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "entryLineRoi": {
      "x": 0,
      "y": 34,
      "width": 128,
      "height": 26,
      "nonWhite": 0
    },
    "vramCurrent": 8549
  },
  "prime": {
    "code": "Digit2",
    "termination": "insert_stop",
    "steps": 3609,
    "expectedInsertByte": 50,
    "stoppedAfterInsert": true,
    "stoppedBeforeControlClear": false,
    "controlStopPc": null,
    "uiClearApplied": false,
    "uiClearResult": null,
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CD",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "wipes": 0,
    "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "vramCurrent": 8614
  },
  "afterPrime": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CD",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "D00595": "0x00",
    "D00596": "0x01",
    "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "entryLineRoi": {
      "x": 0,
      "y": 34,
      "width": 128,
      "height": 26,
      "nonWhite": 65
    },
    "vramCurrent": 8614
  },
  "clear": {
    "code": "Escape",
    "termination": "control_pre_stop",
    "steps": 5542,
    "expectedInsertByte": null,
    "stoppedAfterInsert": false,
    "stoppedBeforeControlClear": true,
    "controlStopPc": "0x001879",
    "uiClearApplied": true,
    "uiClearResult": {
      "ok": true,
      "reason": "clear-key",
      "editBase": 13740236,
      "clearLen": 128,
      "roiBefore": 205,
      "roiAfter": 0,
      "D0243A": 13740236,
      "D00595": 0,
      "D00596": 0
    },
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "wipes": 0,
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "vramCurrent": 8549
  },
  "afterClear": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "D00595": "0x00",
    "D00596": "0x00",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "entryLineRoi": {
      "x": 0,
      "y": 34,
      "width": 128,
      "height": 26,
      "nonWhite": 0
    },
    "vramCurrent": 8549
  },
  "next": {
    "code": "Digit3",
    "termination": "insert_stop",
    "steps": 3225,
    "expectedInsertByte": 51,
    "stoppedAfterInsert": true,
    "stoppedBeforeControlClear": false,
    "controlStopPc": null,
    "uiClearApplied": false,
    "uiClearResult": null,
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CD",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "wipes": 0,
    "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "vramCurrent": 8656
  },
  "afterNext": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0243A": "0xD1A8CD",
    "D0243D": "0xD2A83E",
    "D02590": "0xD3FE81",
    "D00595": "0x00",
    "D00596": "0x01",
    "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "entryLineRoi": {
      "x": 0,
      "y": 34,
      "width": 128,
      "height": 26,
      "nonWhite": 107
    },
    "vramCurrent": 8656
  },
  "final": {
    "status": "Key: 3 → 3225 steps (insert_stop, insert=0x33 @0xd1a8cc, peak 0px)",
    "errors": [],
    "state": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D02590": 13893249,
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
        "nonWhite": 107
      },
      "vramCurrent": 8656,
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2221,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedAfterInsert": true,
        "stoppedBeforeControlClear": false,
        "steps": 3225,
        "termination": "insert_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
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
        "vramPeak": 0,
        "vramCurrent": 8656
      }
    }
  }
}
```

