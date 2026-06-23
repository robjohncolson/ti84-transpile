# Phase 785 Browser Digit1 Coverage

Probe: `probe-phase785-browser-digit1-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase785-browser-digit1-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses `Digit1`, and classifies the coverage-sweep key without patching the browser shell.

## Result

- Classification: CLEAN_INSERT.
- Digit1 termination=post_insert_gate_stop, steps=6947, insertBlock=2601, postInsertGateBlock=6929, expectedByte=0x31.
- Cursor/buffer: cursorBefore=0xD1A8CC, D0243A=0xD1A8CD, expectedCursor=0xD1A8CD, buffer[0]=0x31.
- Fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243D=0xD2A83E.
- Cleanup/display: wipes=0, D000C2Restored=true, VRAM current=8736, keyPeak=8736.
- Page errors: []

## Checks

| Check | Status |
| --- | --- |
| code | PASS |
| label | PASS |
| expectedByte | PASS |
| termination | PASS |
| inserted | PASS |
| cursorAdvanced | PASS |
| editBuffer | PASS |
| d000c2Restored | PASS |
| noWipes | PASS |
| D007CA | PASS |
| D008E0 | PASS |
| D02590 | PASS |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase785-browser-digit1-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:54858/browser-shell.html",
  "pass": true,
  "classification": {
    "classification": "CLEAN_INSERT",
    "expectedCursor": 13740237,
    "checks": {
      "code": true,
      "label": true,
      "expectedByte": true,
      "termination": true,
      "inserted": true,
      "cursorAdvanced": true,
      "editBuffer": true,
      "d000c2Restored": true,
      "noWipes": true,
      "D007CA": true,
      "D008E0": true,
      "D02590": true,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "cleanInsert": true
  },
  "state": {
    "status": "Key: 1 → 6947 steps (post_insert_gate_stop, insert=0x31 @0xd1a8cc, peak 8736px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "Digit1",
      "label": "1",
      "expectedInsertByte": 49,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": 13740236,
      "insertBlock": 2601,
      "postInsertGateBlock": 6929,
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
      "steps": 6947,
      "termination": "post_insert_gate_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D007CA": 361961,
      "D008E0": 13740131,
      "D02590": 13893249,
      "D000C2": 0,
      "buffer": [
        49,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8736,
      "vramCurrent": 8736
    },
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 0,
      "D00596": 1,
      "buffer": [
        49,
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
        "nonWhite": 187
      },
      "vramCurrent": 8736,
      "lastKey": {
        "code": "Digit1",
        "label": "1",
        "expectedInsertByte": 49,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2601,
        "postInsertGateBlock": 6929,
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
        "steps": 6947,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          49,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8736,
        "vramCurrent": 8736
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

