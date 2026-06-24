# Phase 807 Browser F4 Coverage

Probe: `probe-phase807-browser-f4-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase807-browser-f4-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `F4`, and classifies the coverage-sweep key without patching the browser shell.

## Result

- Classification: CONTROL_PRE_STOP_CANDIDATE.
- F4 termination=max_steps, steps=300000, insertBlock=-, postInsertGateBlock=-, expectedByte=0x00.
- Cursor/buffer: cursorBefore=0x000000, D0243A=0xD1A8CC, expectedCursor=0x000000, buffer[0]=0x00.
- Fields: D007CA=0x06C92C, D008E0=0xD1A863, D02590=0xD3FE6F, D0243D=0xD2A83E.
- Cleanup/display: wipes=0, D000C2Restored=false, VRAM current=76665, keyPeak=76665.
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
| editBuffer | PASS |
| d000c2Restored | FAIL |
| noWipes | PASS |
| D007CA | FAIL |
| D008E0 | PASS |
| D02590 | FAIL |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase807-browser-f4-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:56568/browser-shell.html",
  "pass": true,
  "classification": {
    "classification": "CONTROL_PRE_STOP_CANDIDATE",
    "expectedCursor": null,
    "checks": {
      "code": true,
      "label": false,
      "expectedByte": false,
      "termination": false,
      "inserted": false,
      "cursorAdvanced": false,
      "editBuffer": true,
      "d000c2Restored": false,
      "noWipes": true,
      "D007CA": false,
      "D008E0": true,
      "D02590": false,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "cleanInsert": false
  },
  "state": {
    "status": "Key: TRACE → 300000 steps (max_steps, peak 76665px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "F4",
      "label": "TRACE",
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
      "wipes": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D007CA": 444716,
      "D008E0": 13740131,
      "D02590": 13893231,
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
      "vramPeak": 76665,
      "vramCurrent": 76665
    },
    "diagnostics": {
      "D007CA": 444716,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893231,
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
        "nonWhite": 3328
      },
      "vramCurrent": 76665,
      "lastKey": {
        "code": "F4",
        "label": "TRACE",
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
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 444716,
        "D008E0": 13740131,
        "D02590": 13893231,
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
        "vramPeak": 76665,
        "vramCurrent": 76665
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

