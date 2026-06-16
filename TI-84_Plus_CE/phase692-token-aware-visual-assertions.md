# Phase 692: Token-Aware Visual Assertions

Probe: `probe-phase692-token-aware-visual-assertions.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase692-token-aware-visual-assertions.mjs`

## Result

- Overall: **PASS**
- Sequence: 2 + - * / . ( )
- Expected token bytes: 0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11
- Final visible buffer: 0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11
- Non-ASCII token rows: 7
- Page errors: []

## Key Assertions

| idx | key | kind | expected byte | typed ASCII | token-aware | termination | steps | D000C2 | restored | wipes | D0243A | buffer | canvas delta | bbox | status |
|---:|---|---|---:|---:|---|---|---:|---:|---|---:|---:|---|---:|---|---|
| 1 | 2 | digit | 0x32 | 0x32 | true | post_insert_gate_stop | 6947 | 0x00 | true | 0 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 205 | 2,39..23,52 | PASS |
| 2 | + | operator | 0x9E | 0x2B | true | post_insert_gate_stop | 7609 | 0x00 | true | 0 | 0xD1A8CE | 0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 | 214 | 16,39..35,52 | PASS |
| 3 | - | operator | 0x71 | 0x2D | true | post_insert_gate_stop | 7028 | 0x00 | true | 0 | 0xD1A8CF | 0x32 0x9E 0x71 0x00 0x00 0x00 0x00 0x00 | 260 | 26,39..47,52 | PASS |
| 4 | * | operator | 0x82 | 0x2A | true | post_insert_gate_stop | 7643 | 0x00 | true | 0 | 0xD1A8D0 | 0x32 0x9E 0x71 0x82 0x00 0x00 0x00 0x00 | 228 | 38,39..59,52 | PASS |
| 5 | / | operator | 0x83 | 0x2F | true | post_insert_gate_stop | 7209 | 0x00 | true | 0 | 0xD1A8D1 | 0x32 0x9E 0x71 0x82 0x83 0x00 0x00 0x00 | 251 | 50,39..71,52 | PASS |
| 6 | . | punctuation | 0x3A | 0x2E | true | post_insert_gate_stop | 7822 | 0x00 | true | 0 | 0xD1A8D2 | 0x32 0x9E 0x71 0x82 0x83 0x3A 0x00 0x00 | 264 | 62,39..83,52 | PASS |
| 7 | ( | punctuation | 0x10 | 0x28 | true | post_insert_gate_stop | 7209 | 0x00 | true | 0 | 0xD1A8D3 | 0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x00 | 242 | 74,39..95,52 | PASS |
| 8 | ) | punctuation | 0x11 | 0x29 | true | post_insert_gate_stop | 8053 | 0x00 | true | 0 | 0xD1A8D4 | 0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11 | 243 | 86,39..107,52 | PASS |

## Notes

- This probe intentionally does not assert isolated glyph shapes. Operators and punctuation are asserted by their TI-OS token bytes plus cursor advance, entry-band canvas deltas, and cleanup-free browser state.
- The eight-key sequence fits the shell diagnostics window, so every final visible byte is checked directly.

## Compact JSON

```json
{
  "probe": "phase692-token-aware-visual-assertions",
  "pass": true,
  "sequence": [
    "2",
    "+",
    "-",
    "*",
    "/",
    ".",
    "(",
    ")"
  ],
  "expectedBytes": "0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11",
  "finalVisibleBuffer": "0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11",
  "finalD0243A": "0xD1A8D4",
  "nonAsciiTokenRows": 7,
  "rows": [
    {
      "key": "2",
      "kind": "digit",
      "pass": true,
      "expectedByte": "0x32",
      "typedAscii": "0x32",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 6947,
      "insertBlock": 2601,
      "gateBlock": 6929,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8CD",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "canvasDelta": 205,
      "bbox": {
        "x0": 2,
        "y0": 39,
        "x1": 23,
        "y1": 52
      }
    },
    {
      "key": "+",
      "kind": "operator",
      "pass": true,
      "expectedByte": "0x9E",
      "typedAscii": "0x2B",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7609,
      "insertBlock": 3454,
      "gateBlock": 7587,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8CE",
      "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00",
      "canvasDelta": 214,
      "bbox": {
        "x0": 16,
        "y0": 39,
        "x1": 35,
        "y1": 52
      }
    },
    {
      "key": "-",
      "kind": "operator",
      "pass": true,
      "expectedByte": "0x71",
      "typedAscii": "0x2D",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7028,
      "insertBlock": 3266,
      "gateBlock": 7009,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8CF",
      "buffer": "0x32 0x9E 0x71 0x00 0x00 0x00 0x00 0x00",
      "canvasDelta": 260,
      "bbox": {
        "x0": 26,
        "y0": 39,
        "x1": 47,
        "y1": 52
      }
    },
    {
      "key": "*",
      "kind": "operator",
      "pass": true,
      "expectedByte": "0x82",
      "typedAscii": "0x2A",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7643,
      "insertBlock": 3467,
      "gateBlock": 7621,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8D0",
      "buffer": "0x32 0x9E 0x71 0x82 0x00 0x00 0x00 0x00",
      "canvasDelta": 228,
      "bbox": {
        "x0": 38,
        "y0": 39,
        "x1": 59,
        "y1": 52
      }
    },
    {
      "key": "/",
      "kind": "operator",
      "pass": true,
      "expectedByte": "0x83",
      "typedAscii": "0x2F",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7209,
      "insertBlock": 3427,
      "gateBlock": 7189,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8D1",
      "buffer": "0x32 0x9E 0x71 0x82 0x83 0x00 0x00 0x00",
      "canvasDelta": 251,
      "bbox": {
        "x0": 50,
        "y0": 39,
        "x1": 71,
        "y1": 52
      }
    },
    {
      "key": ".",
      "kind": "punctuation",
      "pass": true,
      "expectedByte": "0x3A",
      "typedAscii": "0x2E",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7822,
      "insertBlock": 3443,
      "gateBlock": 7798,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8D2",
      "buffer": "0x32 0x9E 0x71 0x82 0x83 0x3A 0x00 0x00",
      "canvasDelta": 264,
      "bbox": {
        "x0": 62,
        "y0": 39,
        "x1": 83,
        "y1": 52
      }
    },
    {
      "key": "(",
      "kind": "punctuation",
      "pass": true,
      "expectedByte": "0x10",
      "typedAscii": "0x28",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 7209,
      "insertBlock": 3427,
      "gateBlock": 7189,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8D3",
      "buffer": "0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x00",
      "canvasDelta": 242,
      "bbox": {
        "x0": 74,
        "y0": 39,
        "x1": 95,
        "y1": 52
      }
    },
    {
      "key": ")",
      "kind": "punctuation",
      "pass": true,
      "expectedByte": "0x11",
      "typedAscii": "0x29",
      "tokenAwareExpectation": true,
      "termination": "post_insert_gate_stop",
      "steps": 8053,
      "insertBlock": 3475,
      "gateBlock": 8028,
      "D000C2": 0,
      "restored": true,
      "wipes": 0,
      "cursor": "0xD1A8D4",
      "buffer": "0x32 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11",
      "canvasDelta": 243,
      "bbox": {
        "x0": 86,
        "y0": 39,
        "x1": 107,
        "y1": 52
      }
    }
  ],
  "errors": []
}
```

