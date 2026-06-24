# Phase 804 Browser F1 Coverage

Probe: `probe-phase804-browser-f1-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase804-browser-f1-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `F1`, and classifies the coverage-sweep key without patching the browser shell.

## Result

- Classification: DIFFERENT_FAILURE.
- F1 termination=missing_block, steps=18647, insertBlock=-, postInsertGateBlock=-, expectedByte=0x00.
- Cursor/buffer: cursorBefore=0x000000, D0243A=0x202020, expectedCursor=0x000000, buffer[0]=0x20.
- Fields: D007CA=0x202020, D008E0=0x202020, D02590=0x202020, D0243D=0x202020.
- Cleanup/display: wipes=0, D000C2Restored=false, VRAM current=76800, keyPeak=8585.
- Page errors: []

## Checks

| Check | Status |
| --- | --- |
| code | PASS |
| label | FAIL |
| expectedByte | FAIL |
| termination | FAIL |
| inserted | FAIL |
| cursorAdvanced | FAIL |
| editBuffer | FAIL |
| d000c2Restored | FAIL |
| noWipes | PASS |
| D007CA | FAIL |
| D008E0 | FAIL |
| D02590 | FAIL |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase804-browser-f1-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:59778/browser-shell.html",
  "pass": true,
  "classification": {
    "classification": "DIFFERENT_FAILURE",
    "expectedCursor": null,
    "checks": {
      "code": true,
      "label": false,
      "expectedByte": false,
      "termination": false,
      "inserted": false,
      "cursorAdvanced": false,
      "editBuffer": false,
      "d000c2Restored": false,
      "noWipes": true,
      "D007CA": false,
      "D008E0": false,
      "D02590": false,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "cleanInsert": false
  },
  "state": {
    "status": "Key: Y= → 18647 steps (missing_block, peak 8585px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "F1",
      "label": "Y=",
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
      "steps": 18647,
      "termination": "missing_block",
      "wipes": 0,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D02590": 2105376,
      "D000C2": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "vramPeak": 8585,
      "vramCurrent": 76800
    },
    "diagnostics": {
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D02590": 2105376,
      "D00595": 255,
      "D00596": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 3328
      },
      "vramCurrent": 76800,
      "lastKey": {
        "code": "F1",
        "label": "Y=",
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
        "steps": 18647,
        "termination": "missing_block",
        "wipes": 0,
        "D0243A": 2105376,
        "D0243D": 2105376,
        "D007CA": 2105376,
        "D008E0": 2105376,
        "D02590": 2105376,
        "D000C2": 255,
        "buffer": [
          32,
          32,
          32,
          32,
          32,
          32,
          32,
          32
        ],
        "vramPeak": 8585,
        "vramCurrent": 76800
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

