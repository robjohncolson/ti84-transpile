# Phase 768 Browser Enter Patch Verify

Probe: `probe-phase768-browser-enter-patch-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase768-browser-enter-patch-verify.mjs`

Serves the real patched `browser-shell.html`, boots coldboot with Preserve Display, presses `Enter`, and verifies the phase767 browser-shell patch without in-memory instrumentation.

## Result

- Overall: **PASS**
- Route: PASS; cursor restore: PASS; no context-vector restore: PASS; fields: PASS; bounded: PASS; display: PASS; no corruption: PASS; no page errors: PASS.
- Key result: termination=control_pre_stop, steps=21830, stop=0x001879, label=enter-prewipe-cursor-restore-stop, D0243A 0xD1A8A3->0xD1A8CC, final D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243D=0xD2A83E, VRAM=8689.

## Full JSON

```json
{
  "probe": "phase768-browser-enter-patch-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:63224/browser-shell.html",
  "pass": true,
  "assessment": {
    "routePass": true,
    "cursorRestore": true,
    "noContextVectorRestore": true,
    "saneFields": true,
    "bounded": true,
    "displayPreserved": true,
    "noCorruption": true,
    "noPageErrors": true,
    "pass": true
  },
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "vram": 8549,
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
    }
  },
  "after": {
    "status": "Key: ENTER → 21830 steps (control_pre_stop, peak 8689px)",
    "vram": 8689,
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
        "nonWhite": 140
      },
      "vramCurrent": 8689,
      "lastKey": {
        "code": "Enter",
        "label": "ENTER",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "enter-prewipe-cursor-restore-stop",
        "cursorBefore": 13740236,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 21738,
        "controlStopPc": 6265,
        "controlStopCursorBefore": 13740195,
        "controlStopCursorAfter": 13740236,
        "controlStopCursorRestored": true,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 21830,
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
        "vramPeak": 8689,
        "vramCurrent": 8689
      }
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
      "code": "Enter",
      "label": "ENTER",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "enter-prewipe-cursor-restore-stop",
      "cursorBefore": 13740236,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 21738,
      "controlStopPc": 6265,
      "controlStopCursorBefore": 13740195,
      "controlStopCursorAfter": 13740236,
      "controlStopCursorRestored": true,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 21830,
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
      "vramPeak": 8689,
      "vramCurrent": 8689
    },
    "errors": []
  },
  "pageErrors": []
}
```

