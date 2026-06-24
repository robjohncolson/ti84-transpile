# Phase 788 Browser Comma Coverage

Probe: `probe-phase788-browser-comma-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase788-browser-comma-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `Comma`, and classifies the coverage-sweep key without patching the browser shell.

## Result

- Classification: CONTROL_PRE_STOP_CANDIDATE.
- Comma termination=max_steps, steps=300000, insertBlock=-, postInsertGateBlock=-, expectedByte=0x00.
- Cursor/buffer: cursorBefore=0x000000, D0243A=0x000000, expectedCursor=0x000000, buffer[0]=0x2B.
- Fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243D=0x000000.
- Cleanup/display: wipes=3, D000C2Restored=false, VRAM current=3040, keyPeak=8739.
- Page errors: []

## Checks

| Check | Status |
| --- | --- |
| code | PASS |
| label | PASS |
| expectedByte | FAIL |
| termination | FAIL |
| inserted | FAIL |
| cursorAdvanced | FAIL |
| editBuffer | FAIL |
| d000c2Restored | FAIL |
| noWipes | FAIL |
| D007CA | FAIL |
| D008E0 | FAIL |
| D02590 | FAIL |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase788-browser-comma-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:58204/browser-shell.html",
  "pass": true,
  "classification": {
    "classification": "CONTROL_PRE_STOP_CANDIDATE",
    "expectedCursor": null,
    "checks": {
      "code": true,
      "label": true,
      "expectedByte": false,
      "termination": false,
      "inserted": false,
      "cursorAdvanced": false,
      "editBuffer": false,
      "d000c2Restored": false,
      "noWipes": false,
      "D007CA": false,
      "D008E0": false,
      "D02590": false,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "cleanInsert": false
  },
  "state": {
    "status": "Key: , → 300000 steps (max_steps, peak 8739px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "Comma",
      "label": ",",
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
      "steps": 300000,
      "termination": "max_steps",
      "wipes": 3,
      "D0243A": 0,
      "D0243D": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02590": 0,
      "D000C2": 0,
      "buffer": [
        43,
        17,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8739,
      "vramCurrent": 3040
    },
    "diagnostics": {
      "D007CA": 0,
      "D008E0": 0,
      "D0243A": 0,
      "D0243D": 0,
      "D02590": 0,
      "D00595": 4,
      "D00596": 19,
      "buffer": [
        43,
        17,
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
      "vramCurrent": 3040,
      "lastKey": {
        "code": "Comma",
        "label": ",",
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
        "steps": 300000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          43,
          17,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8739,
        "vramCurrent": 3040
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

