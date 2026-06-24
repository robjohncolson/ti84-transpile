# Phase 795 Browser KeyX Patch Verify

Probe: `probe-phase795-browser-keyx-patch-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase795-browser-keyx-patch-verify.mjs`

Serves the patched real `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyX` / `STAT`, and verifies the disk-integrated pre-wipe stop at `0x001879`.

## Result

- Overall: PASS
- KeyX: termination=control_pre_stop, steps=8776, controlStop=0x001879, preStop=0x001879, label=keyx-prewipe-stop.
- Cleanup tail / wipe counter: wipes=0 (expected 0).
- Fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CE, D0243D=0xD2A83E.
- Restore flags: contextVectorRestoreEnabled=false, contextVectorRestored=false, controlStopCursorRestored=false.
- VRAM: current=8740, keyCurrent=8740, peak=8740.
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
  "probe": "phase795-browser-keyx-patch-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:50276/browser-shell.html",
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
    "status": "Key: XTθn → 8776 steps (control_pre_stop, peak 8740px)",
    "lastKey": {
      "code": "KeyX",
      "label": "XTθn",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "keyx-prewipe-stop",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 8753,
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
      "steps": 8776,
      "termination": "control_pre_stop",
      "wipes": 0,
      "D0243A": 13740238,
      "D0243D": 13805630,
      "D007CA": 361961,
      "D008E0": 13740131,
      "D02590": 13893249,
      "D000C2": 0,
      "buffer": [
        98,
        33,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8740,
      "vramCurrent": 8740
    },
    "diagnostics": {
      "D007CA": 361961,
      "D008E0": 13740131,
      "D0243A": 13740238,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 0,
      "D00596": 1,
      "buffer": [
        98,
        33,
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
        "nonWhite": 191
      },
      "vramCurrent": 8740,
      "lastKey": {
        "code": "KeyX",
        "label": "XTθn",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "keyx-prewipe-stop",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 8753,
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
        "steps": 8776,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          98,
          33,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8740,
        "vramCurrent": 8740
      }
    },
    "persistence": null,
    "pageErrors": []
  }
}
```

