# Phase 756 Browser ArrowDown Vector-Restore Verify

Probe: `probe-phase756-browser-arrowdown-vector-restore-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase756-browser-arrowdown-vector-restore-verify.mjs`

Serves the real patched `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowDown`, and verifies the phase755 `restoreAfterOwner` browser-shell patch.

## Result

- Overall: **PASS**
- Route: PASS; fields: PASS; bounded: PASS; display: PASS; no corruption: PASS; no page errors: PASS.
- Key result: termination=control_pre_stop, steps=51287, stop=0x001879, restore=0x06C764, D007CA 0x06C92C->0x0585E9, final D02590=0xD3FE81, D0243A=0xD1A8CC, VRAM=8585.
- Display: before=8549, after=8585.
- Page errors: []

## Full JSON

```json
{
  "probe": "phase756-browser-arrowdown-vector-restore-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:62281/browser-shell.html",
  "pass": true,
  "assessment": {
    "routePass": true,
    "saneFields": true,
    "bounded": true,
    "displayPreserved": true,
    "noCorruption": true,
    "noPageErrors": true,
    "pass": true
  },
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
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
      "vramCurrent": 8549,
      "lastKey": null
    },
    "vram": 8549
  },
  "after": {
    "status": "Key: DOWN → 51287 steps (control_pre_stop, peak 8625px)",
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
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
        "nonWhite": 36
      },
      "vramCurrent": 8585,
      "lastKey": {
        "code": "ArrowDown",
        "label": "DOWN",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "arrow-down-prewipe-vector-restore-stop",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 51126,
        "controlStopPc": 6265,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "contextVectorRestoreEnabled": true,
        "contextVectorRestored": true,
        "contextVectorRestoreBlock": 17589,
        "contextVectorRestorePc": 444260,
        "contextVectorD007CABefore": 444716,
        "contextVectorD007CAAfter": 361961,
        "steps": 51287,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
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
        "vramPeak": 8625,
        "vramCurrent": 8585
      }
    },
    "lastKey": {
      "code": "ArrowDown",
      "label": "DOWN",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "arrow-down-prewipe-vector-restore-stop",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 51126,
      "controlStopPc": 6265,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": true,
      "contextVectorRestored": true,
      "contextVectorRestoreBlock": 17589,
      "contextVectorRestorePc": 444260,
      "contextVectorD007CABefore": 444716,
      "contextVectorD007CAAfter": 361961,
      "steps": 51287,
      "termination": "control_pre_stop",
      "wipes": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D007CA": 361961,
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
      "vramPeak": 8625,
      "vramCurrent": 8585
    },
    "vram": 8585,
    "errors": []
  },
  "errors": []
}
```

