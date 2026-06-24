# Phase 816 Browser Tab Patch Verify

Probe: `probe-phase816-browser-tab-patch-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase816-browser-tab-patch-verify.mjs`

Serves the patched real `browser-shell.html`, boots coldboot with Preserve Display, presses `Tab` / `STAT`, and verifies the disk-integrated pre-wipe stop at `0x001879`.

## Result

- Overall: PASS
- Tab: termination=control_pre_stop, steps=68977, controlStop=0x001879, preStop=0x001879, label=tab-prewipe-stop.
- Cleanup tail / wipe counter: wipes=0 (expected 0).
- Fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E.
- Restore flags: contextVectorRestoreEnabled=false, contextVectorRestored=false, controlStopCursorRestored=false.
- VRAM: current=13732, keyCurrent=13732, peak=13559.
- Page errors: []

## Checks

| Check | Status |
| --- | --- |
| code | PASS |
| label | PASS |
| termination | PASS |
| controlStopPc | PASS |
| controlPreStopPc | PASS |
| controlPreStopLabel | PASS |
| cleanupTail0018f8 | PASS |
| noContextVectorRestore | PASS |
| noCursorRestore | PASS |
| D007CA | PASS |
| D008E0 | PASS |
| D0243A | PASS |
| D0243D | PASS |
| D02590 | PASS |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Full JSON

```json
{
  "probe": "phase816-browser-tab-patch-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:55314/browser-shell.html",
  "pass": true,
  "assessment": {
    "checks": {
      "code": true,
      "label": true,
      "termination": true,
      "controlStopPc": true,
      "controlPreStopPc": true,
      "controlPreStopLabel": true,
      "cleanupTail0018f8": true,
      "noContextVectorRestore": true,
      "noCursorRestore": true,
      "D007CA": true,
      "D008E0": true,
      "D0243A": true,
      "D0243D": true,
      "D02590": true,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "pass": true
  },
  "state": {
    "status": "Key: 2ND → 68977 steps (control_pre_stop, peak 13559px)",
    "lastKey": {
      "code": "Tab",
      "label": "2ND",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "tab-prewipe-stop",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 68948,
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
      "steps": 68977,
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
      "vramPeak": 13559,
      "vramCurrent": 13732
    },
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 1,
      "D00596": 8,
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
        "nonWhite": 253
      },
      "vramCurrent": 13732,
      "lastKey": {
        "code": "Tab",
        "label": "2ND",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "tab-prewipe-stop",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 68948,
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
        "steps": 68977,
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
        "vramPeak": 13559,
        "vramCurrent": 13732
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

