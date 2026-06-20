# Phase 747 Browser CLEAR/EOL Patch Verify

Probe: `probe-phase747-browser-clear-eol-patch.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase747-browser-clear-eol-patch.mjs`

Serves the real `browser-shell.html`, boots coldboot with Preserve Display,
presses CLEAR/EOL (`Escape`), and verifies the browser patch stops before
`0x0A229D` corrupts `BC`/return state.

## Result

- Overall: **PASS**
- CLEAR stop: pc=0x0A229D, termination=control_pre_stop, uiClear=true, steps=7363.
- State: D007CA=0x0585E9, D02590=0xD3FE81, cursor=0xD1A8CC, ROI=0.
- Page errors: []

## Full JSON

```json
{
  "probe": "phase747-browser-clear-eol-patch",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:56375/browser-shell.html",
  "pass": true,
  "pageErrors": [],
  "state": {
    "status": "Key: CLEAR → 7363 steps (control_pre_stop, peak 8585px)",
    "phase6": {
      "steps": 49474,
      "termination": "halt",
      "lastPc": 6581,
      "vram": 8549,
      "vatSnapshotCaptured": true
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 664221,
      "controlPreStopLabel": "clear-eol-bc-zero-owner",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 7349,
      "controlStopPc": 664221,
      "uiClearApplied": true,
      "uiClearResult": {
        "ok": true,
        "reason": "clear-key",
        "editBase": 13740236,
        "clearLen": 128,
        "roiBefore": 36,
        "roiAfter": 0,
        "D0243A": 13740236,
        "D00595": 0,
        "D00596": 0
      },
      "stoppedBeforeControlClear": true,
      "steps": 7363,
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
      "vramPeak": 8585,
      "vramCurrent": 8549
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
        "nonWhite": 0
      },
      "vramCurrent": 8549,
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 7349,
        "controlStopPc": 664221,
        "uiClearApplied": true,
        "uiClearResult": {
          "ok": true,
          "reason": "clear-key",
          "editBase": 13740236,
          "clearLen": 128,
          "roiBefore": 36,
          "roiAfter": 0,
          "D0243A": 13740236,
          "D00595": 0,
          "D00596": 0
        },
        "stoppedBeforeControlClear": true,
        "steps": 7363,
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
        "vramPeak": 8585,
        "vramCurrent": 8549
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
    "vram": 8549
  }
}
```

