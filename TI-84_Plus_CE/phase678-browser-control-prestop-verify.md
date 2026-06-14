# Phase 678: Browser Control-Key Pre-Stop Verify

Probe: `probe-phase678-browser-control-prestop-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase678-browser-control-prestop-verify.mjs`

## Result

- Overall: **PASS**
- Scope: real `browser-shell.html` headless run; coldboot + Preserve Display; no runtime/transpiler/decoder/peripheral edits.

## Scenarios

| scenario | pass | control termination | stop PC | control D007CA | control D0243A | control VAT | control VRAM | next buffer | page errors |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| enter | yes | control_pre_stop | 0x0A2150 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 10149 | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | [] |
| clear | yes | control_pre_stop | 0x001879 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 8754 | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | [] |

## Interpretation

- Enter stops before `0x0A2150`, preserving cxMain, VAT, edit cursor, buffer, and VRAM after a primed `2`; a following `3` inserts as `23`.
- CLEAR/Escape stops before `0x001879`, preserving cxMain, VAT, buffer, cursor, and VRAM in the real browser path; a following `3` appends as `23`.
- Enter/Clear remain non-insertable controls: `expectedInsertByte` is null and they are not part of the coldboot insert-byte map.

## Compact JSON

```json
[
  {
    "scenario": "enter",
    "pass": true,
    "prime": {
      "code": "Digit2",
      "termination": "insert_stop",
      "steps": 3609,
      "expectedInsertByte": 50,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "insertBlock": 2601,
      "controlStopBlock": null,
      "controlStopPc": null,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614
    },
    "control": {
      "code": "Enter",
      "termination": "control_pre_stop",
      "steps": 12604,
      "expectedInsertByte": null,
      "stoppedAfterInsert": false,
      "stoppedBeforeControlClear": true,
      "insertBlock": null,
      "controlStopBlock": 12562,
      "controlStopPc": "0x0A2150",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10149
    },
    "next": {
      "code": "Digit3",
      "termination": "insert_stop",
      "steps": 3850,
      "expectedInsertByte": 51,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "insertBlock": 2839,
      "controlStopBlock": null,
      "controlStopPc": null,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10218
    },
    "final": {
      "status": "Key: 3 → 3850 steps (insert_stop, insert=0x33 @0xd1a8cd, peak 0px)",
      "errors": [],
      "vram": 10218
    }
  },
  {
    "scenario": "clear",
    "pass": true,
    "prime": {
      "code": "Digit2",
      "termination": "insert_stop",
      "steps": 3609,
      "expectedInsertByte": 50,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "insertBlock": 2601,
      "controlStopBlock": null,
      "controlStopPc": null,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614
    },
    "control": {
      "code": "Escape",
      "termination": "control_pre_stop",
      "steps": 5542,
      "expectedInsertByte": null,
      "stoppedAfterInsert": false,
      "stoppedBeforeControlClear": true,
      "insertBlock": null,
      "controlStopBlock": 5529,
      "controlStopPc": "0x001879",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8754
    },
    "next": {
      "code": "Digit3",
      "termination": "insert_stop",
      "steps": 3274,
      "expectedInsertByte": 51,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "insertBlock": 2269,
      "controlStopBlock": null,
      "controlStopPc": null,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8716
    },
    "final": {
      "status": "Key: 3 → 3274 steps (insert_stop, insert=0x33 @0xd1a8cd, peak 0px)",
      "errors": [],
      "vram": 8716
    }
  }
]
```

