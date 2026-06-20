# Phase 749 Browser Key-Corruption Audit

Probe: `probe-phase749-browser-key-corruption-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase749-browser-key-corruption-audit.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot once with Preserve Display, captures a clean base snapshot, restores that base before every audited key, dispatches the browser key through CDP, and classifies the exposed coldboot key state.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- Covered 12/36 remaining canonical keys this tick (limit 12); skipped 23 already-verified mapped codes and listed 5 duplicate aliases separately.
- SANE: 1; CORRUPT: 11.
- Ranked corrupt keys: `ArrowDown` (DOWN: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `ArrowLeft` (LEFT: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `ArrowRight` (RIGHT: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `ArrowUp` (UP: termination=missing_block; D007CA=0x202020; D02590=0x202020; D0243A=0x202020 expected=0xD1A8CC; missing_block/page-error signal; 0x202020 field corruption), `Enter` (ENTER: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyE` (^: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyN` ((-): termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyT` (TAN: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyV` (VARS: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyC` (COS: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC), `KeyP` (PRGM: termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC)
- Base snapshot before each key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, lastPc=0x08C331.
- Insertable sanity controls are allowed to stop at `post_insert_gate_stop` with the cursor advanced by one byte; non-insert controls still require `halt` or `control_pre_stop`.

## Covered Keys

`ArrowDown` (DOWN), `ArrowLeft` (LEFT), `ArrowRight` (RIGHT), `ArrowUp` (UP), `Enter` (ENTER), `KeyE` (^), `KeyN` ((-)), `KeyT` (TAN), `KeyV` (VARS), `Digit2` (2), `KeyC` (COS), `KeyP` (PRGM)

## Deferred Canonical Keys

`KeyR` (STAT), `Digit0` (0), `Digit1` (1), `Digit4` (4), `Digit7` (7), `Comma` (,), `KeyS` (SIN), `KeyA` (APPS), `KeyX` (XTθn), `KeyO` (STO→), `KeyL` (LN), `KeyG` (LOG), `KeyQ` (x²), `KeyI` (x⁻¹), `KeyM` (MATH), `CapsLock` (ALPHA), `F5` (GRAPH), `F4` (TRACE), `F3` (ZOOM), `F2` (WINDOW), `F1` (Y=), `Tab` (2ND), `Home` (MODE), `Backspace` (DEL)

## Deferred Duplicate Aliases

`Numpad0` (0) aliases `Digit0`, `Numpad1` (1) aliases `Digit1`, `Numpad4` (4) aliases `Digit4`, `Numpad7` (7) aliases `Digit7`, `NumpadComma` (,) aliases `Comma`

## Per-Key Table

| Code | TI key | Result | Termination | Last PC | D007CA | D02590 | D008E0 | D0243A | missing_block | 0x202020 | Page errors | Reasons |
|---|---|---|---|---|---|---|---|---|---|---|---:|---|
| ArrowDown | DOWN | CORRUPT | max_steps | 0x000B7C | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| ArrowLeft | LEFT | CORRUPT | max_steps | 0x006D5D | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| ArrowRight | RIGHT | CORRUPT | max_steps | 0x09EFDE | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| ArrowUp | UP | CORRUPT | missing_block | 0x202020 | 0x202020 | 0x202020 | 0x202020 | 0x202020 | yes | yes | 0 | termination=missing_block; D007CA=0x202020; D02590=0x202020; D0243A=0x202020 expected=0xD1A8CC; missing_block/page-error signal; 0x202020 field corruption |
| Enter | ENTER | CORRUPT | max_steps | 0x006CDF | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| KeyE | ^ | CORRUPT | max_steps | 0x000A92 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| KeyN | (-) | CORRUPT | max_steps | 0x000A92 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| KeyT | TAN | CORRUPT | max_steps | 0x000A92 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| KeyV | VARS | CORRUPT | max_steps | 0x09EFDE | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| Digit2 | 2 | SANE | post_insert_gate_stop | 0x08C331 | 0x0585E9 | 0xD3FE81 | 0xD1A863 | 0xD1A8CD | no | no | 0 | - |
| KeyC | COS | CORRUPT | max_steps | 0x000A92 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |
| KeyP | PRGM | CORRUPT | max_steps | 0x00613E | 0x000000 | 0x000000 | 0x000000 | 0x000000 | no | no | 0 | termination=max_steps; D007CA=0x000000; D02590=0x000000; D0243A=0x000000 expected=0xD1A8CC |

## Compact Evidence

```json
{
  "auditLimit": 12,
  "base": {
    "status": "Coldboot complete. OS event loop is ready.",
    "lastPc": 574257,
    "fields": {
      "D007CA": 361961,
      "D008E0": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00587": 0,
      "D0058C": 0,
      "D0058D": 0,
      "D0058E": 0
    },
    "vram": 8549
  },
  "covered": [
    {
      "code": "ArrowDown",
      "tiKey": "DOWN",
      "group": 0,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2940,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowLeft",
      "tiKey": "LEFT",
      "group": 0,
      "bit": 1,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 27997,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowRight",
      "tiKey": "RIGHT",
      "group": 0,
      "bit": 2,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 651230,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowUp",
      "tiKey": "UP",
      "group": 0,
      "bit": 3,
      "classification": "CORRUPT",
      "reasons": [
        "termination=missing_block",
        "D007CA=0x202020",
        "D02590=0x202020",
        "D0243A=0x202020 expected=0xD1A8CC",
        "missing_block/page-error signal",
        "0x202020 field corruption"
      ],
      "termination": "missing_block",
      "lastPc": 2105376,
      "D007CA": 2105376,
      "D02590": 2105376,
      "D008E0": 2105376,
      "D0243A": 2105376,
      "missingBlock": true,
      "corrupt202020": true,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 22513,
      "controlStopPc": null
    },
    {
      "code": "Enter",
      "tiKey": "ENTER",
      "group": 1,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 27871,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyE",
      "tiKey": "^",
      "group": 1,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyN",
      "tiKey": "(-)",
      "group": 2,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyT",
      "tiKey": "TAN",
      "group": 2,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyV",
      "tiKey": "VARS",
      "group": 2,
      "bit": 6,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 651230,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "Digit2",
      "tiKey": "2",
      "group": 3,
      "bit": 1,
      "classification": "SANE",
      "reasons": [],
      "termination": "post_insert_gate_stop",
      "lastPc": 574257,
      "D007CA": 361961,
      "D02590": 13893249,
      "D008E0": 13740131,
      "D0243A": 13740237,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": 50,
      "steps": 7475,
      "controlStopPc": null
    },
    {
      "code": "KeyC",
      "tiKey": "COS",
      "group": 3,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyP",
      "tiKey": "PRGM",
      "group": 3,
      "bit": 6,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 24894,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    }
  ],
  "corrupt": [
    {
      "code": "ArrowDown",
      "tiKey": "DOWN",
      "group": 0,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2940,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowLeft",
      "tiKey": "LEFT",
      "group": 0,
      "bit": 1,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 27997,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowRight",
      "tiKey": "RIGHT",
      "group": 0,
      "bit": 2,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 651230,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "ArrowUp",
      "tiKey": "UP",
      "group": 0,
      "bit": 3,
      "classification": "CORRUPT",
      "reasons": [
        "termination=missing_block",
        "D007CA=0x202020",
        "D02590=0x202020",
        "D0243A=0x202020 expected=0xD1A8CC",
        "missing_block/page-error signal",
        "0x202020 field corruption"
      ],
      "termination": "missing_block",
      "lastPc": 2105376,
      "D007CA": 2105376,
      "D02590": 2105376,
      "D008E0": 2105376,
      "D0243A": 2105376,
      "missingBlock": true,
      "corrupt202020": true,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 22513,
      "controlStopPc": null
    },
    {
      "code": "Enter",
      "tiKey": "ENTER",
      "group": 1,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 27871,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyE",
      "tiKey": "^",
      "group": 1,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyN",
      "tiKey": "(-)",
      "group": 2,
      "bit": 0,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyT",
      "tiKey": "TAN",
      "group": 2,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyV",
      "tiKey": "VARS",
      "group": 2,
      "bit": 6,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 651230,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyC",
      "tiKey": "COS",
      "group": 3,
      "bit": 5,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 2706,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    },
    {
      "code": "KeyP",
      "tiKey": "PRGM",
      "group": 3,
      "bit": 6,
      "classification": "CORRUPT",
      "reasons": [
        "termination=max_steps",
        "D007CA=0x000000",
        "D02590=0x000000",
        "D0243A=0x000000 expected=0xD1A8CC"
      ],
      "termination": "max_steps",
      "lastPc": 24894,
      "D007CA": 0,
      "D02590": 0,
      "D008E0": 0,
      "D0243A": 0,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": null,
      "steps": 300000,
      "controlStopPc": null
    }
  ],
  "sane": [
    {
      "code": "Digit2",
      "tiKey": "2",
      "group": 3,
      "bit": 1,
      "classification": "SANE",
      "reasons": [],
      "termination": "post_insert_gate_stop",
      "lastPc": 574257,
      "D007CA": 361961,
      "D02590": 13893249,
      "D008E0": 13740131,
      "D0243A": 13740237,
      "missingBlock": false,
      "corrupt202020": false,
      "pageErrorCount": 0,
      "expectedInsertByte": 50,
      "steps": 7475,
      "controlStopPc": null
    }
  ],
  "deferred": [
    {
      "code": "KeyR",
      "tiKey": "STAT",
      "group": 3,
      "bit": 7,
      "physical": "3:7"
    },
    {
      "code": "Digit0",
      "tiKey": "0",
      "group": 4,
      "bit": 0,
      "physical": "4:0"
    },
    {
      "code": "Digit1",
      "tiKey": "1",
      "group": 4,
      "bit": 1,
      "physical": "4:1"
    },
    {
      "code": "Digit4",
      "tiKey": "4",
      "group": 4,
      "bit": 2,
      "physical": "4:2"
    },
    {
      "code": "Digit7",
      "tiKey": "7",
      "group": 4,
      "bit": 3,
      "physical": "4:3"
    },
    {
      "code": "Comma",
      "tiKey": ",",
      "group": 4,
      "bit": 4,
      "physical": "4:4"
    },
    {
      "code": "KeyS",
      "tiKey": "SIN",
      "group": 4,
      "bit": 5,
      "physical": "4:5"
    },
    {
      "code": "KeyA",
      "tiKey": "APPS",
      "group": 4,
      "bit": 6,
      "physical": "4:6"
    },
    {
      "code": "KeyX",
      "tiKey": "XTθn",
      "group": 4,
      "bit": 7,
      "physical": "4:7"
    },
    {
      "code": "KeyO",
      "tiKey": "STO→",
      "group": 5,
      "bit": 1,
      "physical": "5:1"
    },
    {
      "code": "KeyL",
      "tiKey": "LN",
      "group": 5,
      "bit": 2,
      "physical": "5:2"
    },
    {
      "code": "KeyG",
      "tiKey": "LOG",
      "group": 5,
      "bit": 3,
      "physical": "5:3"
    },
    {
      "code": "KeyQ",
      "tiKey": "x²",
      "group": 5,
      "bit": 4,
      "physical": "5:4"
    },
    {
      "code": "KeyI",
      "tiKey": "x⁻¹",
      "group": 5,
      "bit": 5,
      "physical": "5:5"
    },
    {
      "code": "KeyM",
      "tiKey": "MATH",
      "group": 5,
      "bit": 6,
      "physical": "5:6"
    },
    {
      "code": "CapsLock",
      "tiKey": "ALPHA",
      "group": 5,
      "bit": 7,
      "physical": "5:7"
    },
    {
      "code": "F5",
      "tiKey": "GRAPH",
      "group": 6,
      "bit": 0,
      "physical": "6:0"
    },
    {
      "code": "F4",
      "tiKey": "TRACE",
      "group": 6,
      "bit": 1,
      "physical": "6:1"
    },
    {
      "code": "F3",
      "tiKey": "ZOOM",
      "group": 6,
      "bit": 2,
      "physical": "6:2"
    },
    {
      "code": "F2",
      "tiKey": "WINDOW",
      "group": 6,
      "bit": 3,
      "physical": "6:3"
    },
    {
      "code": "F1",
      "tiKey": "Y=",
      "group": 6,
      "bit": 4,
      "physical": "6:4"
    },
    {
      "code": "Tab",
      "tiKey": "2ND",
      "group": 6,
      "bit": 5,
      "physical": "6:5"
    },
    {
      "code": "Home",
      "tiKey": "MODE",
      "group": 6,
      "bit": 6,
      "physical": "6:6"
    },
    {
      "code": "Backspace",
      "tiKey": "DEL",
      "group": 6,
      "bit": 7,
      "physical": "6:7"
    }
  ],
  "aliases": [
    {
      "code": "Numpad0",
      "tiKey": "0",
      "group": 4,
      "bit": 0,
      "physical": "4:0",
      "canonicalCode": "Digit0"
    },
    {
      "code": "Numpad1",
      "tiKey": "1",
      "group": 4,
      "bit": 1,
      "physical": "4:1",
      "canonicalCode": "Digit1"
    },
    {
      "code": "Numpad4",
      "tiKey": "4",
      "group": 4,
      "bit": 2,
      "physical": "4:2",
      "canonicalCode": "Digit4"
    },
    {
      "code": "Numpad7",
      "tiKey": "7",
      "group": 4,
      "bit": 3,
      "physical": "4:3",
      "canonicalCode": "Digit7"
    },
    {
      "code": "NumpadComma",
      "tiKey": ",",
      "group": 4,
      "bit": 4,
      "physical": "4:4",
      "canonicalCode": "Comma"
    }
  ],
  "skippedVerified": [
    {
      "code": "Equal",
      "tiKey": "+",
      "group": 1,
      "bit": 1,
      "physical": "1:1"
    },
    {
      "code": "NumpadAdd",
      "tiKey": "+",
      "group": 1,
      "bit": 1,
      "physical": "1:1"
    },
    {
      "code": "Minus",
      "tiKey": "-",
      "group": 1,
      "bit": 2,
      "physical": "1:2"
    },
    {
      "code": "NumpadSubtract",
      "tiKey": "-",
      "group": 1,
      "bit": 2,
      "physical": "1:2"
    },
    {
      "code": "NumpadMultiply",
      "tiKey": "×",
      "group": 1,
      "bit": 3,
      "physical": "1:3"
    },
    {
      "code": "Slash",
      "tiKey": "÷",
      "group": 1,
      "bit": 4,
      "physical": "1:4"
    },
    {
      "code": "NumpadDivide",
      "tiKey": "÷",
      "group": 1,
      "bit": 4,
      "physical": "1:4"
    },
    {
      "code": "Escape",
      "tiKey": "CLEAR",
      "group": 1,
      "bit": 6,
      "physical": "1:6"
    },
    {
      "code": "Digit3",
      "tiKey": "3",
      "group": 2,
      "bit": 1,
      "physical": "2:1"
    },
    {
      "code": "Numpad3",
      "tiKey": "3",
      "group": 2,
      "bit": 1,
      "physical": "2:1"
    },
    {
      "code": "Digit6",
      "tiKey": "6",
      "group": 2,
      "bit": 2,
      "physical": "2:2"
    },
    {
      "code": "Numpad6",
      "tiKey": "6",
      "group": 2,
      "bit": 2,
      "physical": "2:2"
    },
    {
      "code": "Digit9",
      "tiKey": "9",
      "group": 2,
      "bit": 3,
      "physical": "2:3"
    },
    {
      "code": "Numpad9",
      "tiKey": "9",
      "group": 2,
      "bit": 3,
      "physical": "2:3"
    },
    {
      "code": "BracketRight",
      "tiKey": ")",
      "group": 2,
      "bit": 4,
      "physical": "2:4"
    },
    {
      "code": "Period",
      "tiKey": ".",
      "group": 3,
      "bit": 0,
      "physical": "3:0"
    },
    {
      "code": "NumpadDecimal",
      "tiKey": ".",
      "group": 3,
      "bit": 0,
      "physical": "3:0"
    },
    {
      "code": "Numpad2",
      "tiKey": "2",
      "group": 3,
      "bit": 1,
      "physical": "3:1"
    },
    {
      "code": "Digit5",
      "tiKey": "5",
      "group": 3,
      "bit": 2,
      "physical": "3:2"
    },
    {
      "code": "Numpad5",
      "tiKey": "5",
      "group": 3,
      "bit": 2,
      "physical": "3:2"
    },
    {
      "code": "Digit8",
      "tiKey": "8",
      "group": 3,
      "bit": 3,
      "physical": "3:3"
    },
    {
      "code": "Numpad8",
      "tiKey": "8",
      "group": 3,
      "bit": 3,
      "physical": "3:3"
    },
    {
      "code": "BracketLeft",
      "tiKey": "(",
      "group": 3,
      "bit": 4,
      "physical": "3:4"
    }
  ]
}
```

