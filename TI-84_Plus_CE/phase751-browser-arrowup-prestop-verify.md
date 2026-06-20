# Phase 751 Browser ArrowUp Pre-Stop Verify

Probe: `probe-phase751-browser-arrowup-prestop-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase751-browser-arrowup-prestop-verify.mjs`

Serves the real `browser-shell.html`, boots coldboot with Preserve Display,
presses `ArrowUp`, and verifies the browser patch stops before
`0x0A229D` reaches the corrupt `0x0A22A4` space-fill tail.

## Result

- Overall: **PASS**
- ArrowUp stop: pc=0x0A229D, termination=control_pre_stop, uiClear=false, steps=22273.
- State: D007CA=0x0585E9, D02590=0xD3FE81, cursor=0xD1A8CC, VRAM=8585.
- Page errors: []

## Full JSON

```json
{
  "probe": "phase751-browser-arrowup-prestop-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:56445/browser-shell.html",
  "pass": true,
  "pageErrors": [],
  "state": {
    "status": "Key: UP → 22273 steps (control_pre_stop, peak 8689px)",
    "phase6": {
      "steps": 49474,
      "termination": "halt",
      "lastPc": 6581,
      "vram": 8549,
      "vatSnapshotCaptured": true
    },
    "lastKey": {
      "code": "ArrowUp",
      "label": "UP",
      "expectedInsertByte": null,
      "controlPreStopPc": 664221,
      "controlPreStopLabel": "arrow-up-space-fill-bc-zero-owner",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 22194,
      "controlStopPc": 664221,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "steps": 22273,
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
      "vramCurrent": 8585
    },
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
        "code": "ArrowUp",
        "label": "UP",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "arrow-up-space-fill-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 22194,
        "controlStopPc": 664221,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "steps": 22273,
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
        "vramCurrent": 8585
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
        "D0059A": 2,
        "D01150": 0,
        "D0243D": 13805630,
        "D02A40": 13805630,
        "D02A28": 0
      }
    },
    "vram": 8585
  }
}
```

