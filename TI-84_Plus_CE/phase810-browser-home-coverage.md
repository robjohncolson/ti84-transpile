# Phase 810 Browser Home Coverage

Probe: `probe-phase810-browser-home-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase810-browser-home-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `Home`, and classifies the coverage-sweep key without patching the browser shell.

## Result

- Classification: CONTROL_PRE_STOP_CANDIDATE.
- Home termination=max_steps, steps=300000, insertBlock=-, postInsertGateBlock=-, expectedByte=0x00.
- Cursor/buffer: cursorBefore=0x000000, D0243A=0xD1A8CC, expectedCursor=0x000000, buffer[0]=0x00.
- Fields: D007CA=0x08ACA9, D008E0=0xD1A863, D02590=0xD3FE81, D0243D=0xD2A83E.
- Cleanup/display: wipes=0, D000C2Restored=false, VRAM current=17407, keyPeak=17127.
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
| D02590 | PASS |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase810-browser-home-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:51569/browser-shell.html",
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
      "D02590": true,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "cleanInsert": false
  },
  "state": {
    "status": "Key: MODE → 300000 steps (max_steps, peak 17127px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "Home",
      "label": "MODE",
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
      "D007CA": 568489,
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
      "vramPeak": 17127,
      "vramCurrent": 17407
    },
    "diagnostics": {
      "D007CA": 568489,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 184,
      "D00596": 172,
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
        "nonWhite": 1238
      },
      "vramCurrent": 17407,
      "lastKey": {
        "code": "Home",
        "label": "MODE",
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
        "D007CA": 568489,
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
        "vramPeak": 17127,
        "vramCurrent": 17407
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

