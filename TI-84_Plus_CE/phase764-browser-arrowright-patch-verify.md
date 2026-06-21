# Phase 764 Browser ArrowRight Patch Verify

Probe: `probe-phase764-browser-arrowright-patch-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase764-browser-arrowright-patch-verify.mjs`

Serves the real patched `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowRight`, and verifies the phase763 patch candidate without in-memory instrumentation.

## Result

- Overall: **PASS**
- Route: PASS; no restore helpers: PASS; fields: PASS; bounded: PASS; display: PASS; no corruption: PASS; no page errors: PASS.
- Key result: termination=control_pre_stop, steps=69165, stop=0x001879, label=arrow-right-prewipe-stop, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false, final D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=13461.
- Display: before=8549, after=13461.
- Page errors: []

## Full JSON

```json
{
  "probe": "phase764-browser-arrowright-patch-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:61751/browser-shell.html",
  "pass": true,
  "assessment": {
    "routePass": true,
    "noUnexpectedRestores": true,
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
    "status": "Key: RIGHT → 69165 steps (control_pre_stop, peak 13111px)",
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 1,
      "D00596": 10,
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
        "nonWhite": 354
      },
      "vramCurrent": 13461,
      "lastKey": {
        "code": "ArrowRight",
        "label": "RIGHT",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "arrow-right-prewipe-stop",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 69133,
        "controlStopPc": 6265,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 69165,
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
        "vramPeak": 13111,
        "vramCurrent": 13461
      }
    },
    "lastKey": {
      "code": "ArrowRight",
      "label": "RIGHT",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "arrow-right-prewipe-stop",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 69133,
      "controlStopPc": 6265,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 69165,
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
      "vramPeak": 13111,
      "vramCurrent": 13461
    },
    "vram": 13461,
    "errors": []
  },
  "errors": []
}
```

