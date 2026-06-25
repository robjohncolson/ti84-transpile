# Phase 827: Numpad Alias Coverage

Probe: `probe-phase827-numpad-alias-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase827-numpad-alias-coverage.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, records static shell mappings, then presses the deferred Numpad aliases in one browser session.

## Result

- Probe completed: PASS
- Alias confirmations: 10/10.
- Divergences: none.
- Final cursor: 0xD1A8D7; final visible buffer: 0x30 0x31 0x34 0x37 0x9E 0x71 0x82 0x83
- Page errors: []

## Alias Rows

| alias | canonical | static eq | termination | steps | expected bytes | cursor | stop pc | wipes | status |
|---|---|---|---|---:|---|---:|---:|---:|---|
| Numpad0 | Digit0 | yes | post_insert_gate_stop | 6930 | 0x30 | 0xD1A8CD | - | 0 | PASS |
| Numpad1 | Digit1 | yes | post_insert_gate_stop | 7442 | 0x31 | 0xD1A8CE | - | 0 | PASS |
| Numpad4 | Digit4 | yes | post_insert_gate_stop | 7027 | 0x34 | 0xD1A8CF | - | 0 | PASS |
| Numpad7 | Digit7 | yes | post_insert_gate_stop | 7625 | 0x37 | 0xD1A8D0 | - | 0 | PASS |
| NumpadAdd | Equal | yes | post_insert_gate_stop | 7013 | 0x9E | 0xD1A8D1 | - | 0 | PASS |
| NumpadSubtract | Minus | yes | post_insert_gate_stop | 7625 | 0x71 | 0xD1A8D2 | - | 0 | PASS |
| NumpadMultiply | NumpadMultiply | yes | post_insert_gate_stop | 7431 | 0x82 | 0xD1A8D3 | - | 0 | PASS |
| NumpadDivide | Slash | yes | post_insert_gate_stop | 7404 | 0x83 | 0xD1A8D4 | - | 0 | PASS |
| NumpadDecimal | Period | yes | post_insert_gate_stop | 7227 | 0x3A | 0xD1A8D5 | - | 0 | PASS |
| NumpadComma | Comma | yes | control_pre_stop | 12843 | 0x2B 0x11 | 0xD1A8D7 | 0x001879 | 0 | PASS |

## Notes

- Pre-patch watchdog run of the same probe proved the real divergence: `NumpadComma` had `staticEquivalent=false`, terminated at `max_steps` after 300000 steps, hit `wipes=3`, and zeroed `D0243A`/`D007CA`. The final pass above is after adding `NumpadComma: { pc: 0x001879, label: 'numpadcomma-prewipe-stop' }`.
- `NumpadComma` is evaluated against the canonical `Comma` behavior: token pair `0x2B 0x11`, cursor +2, and a pre-wipe stop at `0x001879`.
- The public edit-buffer diagnostics expose the first 8 bytes, so later rows rely on cursor, token-byte, stop, and static-map checks rather than final visible tail bytes.

## Compact JSON

```json
{
  "probe": "phase827-numpad-alias-coverage",
  "probeCompleted": true,
  "allAliasesEquivalent": true,
  "confirmations": 10,
  "total": 10,
  "divergent": [],
  "rows": [
    {
      "code": "Numpad0",
      "aliasOf": "Digit0",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 6930,
      "expectedBytes": "0x30",
      "expectedInsertByte": "0x30",
      "cursor": "0xD1A8CD",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "Numpad1",
      "aliasOf": "Digit1",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7442,
      "expectedBytes": "0x31",
      "expectedInsertByte": "0x31",
      "cursor": "0xD1A8CE",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "Numpad4",
      "aliasOf": "Digit4",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7027,
      "expectedBytes": "0x34",
      "expectedInsertByte": "0x34",
      "cursor": "0xD1A8CF",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "Numpad7",
      "aliasOf": "Digit7",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7625,
      "expectedBytes": "0x37",
      "expectedInsertByte": "0x37",
      "cursor": "0xD1A8D0",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadAdd",
      "aliasOf": "Equal",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7013,
      "expectedBytes": "0x9E",
      "expectedInsertByte": "0x9E",
      "cursor": "0xD1A8D1",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadSubtract",
      "aliasOf": "Minus",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7625,
      "expectedBytes": "0x71",
      "expectedInsertByte": "0x71",
      "cursor": "0xD1A8D2",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadMultiply",
      "aliasOf": "NumpadMultiply",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7431,
      "expectedBytes": "0x82",
      "expectedInsertByte": "0x82",
      "cursor": "0xD1A8D3",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadDivide",
      "aliasOf": "Slash",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7404,
      "expectedBytes": "0x83",
      "expectedInsertByte": "0x83",
      "cursor": "0xD1A8D4",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadDecimal",
      "aliasOf": "Period",
      "pass": true,
      "staticEquivalent": true,
      "termination": "post_insert_gate_stop",
      "steps": 7227,
      "expectedBytes": "0x3A",
      "expectedInsertByte": "0x3A",
      "cursor": "0xD1A8D5",
      "controlStopPc": "-",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    },
    {
      "code": "NumpadComma",
      "aliasOf": "Comma",
      "pass": true,
      "staticEquivalent": true,
      "termination": "control_pre_stop",
      "steps": 12843,
      "expectedBytes": "0x2B 0x11",
      "expectedInsertByte": "-",
      "cursor": "0xD1A8D7",
      "controlStopPc": "0x001879",
      "wipes": 0,
      "checks": {
        "staticEquivalent": true,
        "code": true,
        "noPageErrors": true,
        "bufferPass": true,
        "expectedMode": true
      }
    }
  ],
  "final": {
    "D0243A": "0xD1A8D7",
    "D007CA": "0x0585E9",
    "buffer": "0x30 0x31 0x34 0x37 0x9E 0x71 0x82 0x83",
    "pageErrors": []
  }
}
```
