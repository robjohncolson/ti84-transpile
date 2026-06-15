# Phase 691: Browser Gate Broad Regression

Probe: `probe-phase691-browser-gate-broad-regression.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase691-browser-gate-broad-regression.mjs`

## Result

- Overall: **PASS**
- Full insertable set: PASS (2 3 + - * / . ( ))
- Long sequence: PASS (2 3 + - * / . ()
- Page errors: []

## Key Assertions

| scenario | idx | key | expected prefix | termination | steps | insert block | gate block | D000C2 | restored | wipes | D0243A | visible buffer | canvas delta | bbox | status |
|---|---:|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|
| full-set | 1 | 2 | 0x32 | post_insert_gate_stop | 6947 | 2601 | 6929 | 0x00 | true | 0 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 205 | 2,39..23,52 | PASS |
| full-set | 2 | 3 | 0x32 0x33 | post_insert_gate_stop | 7606 | 3451 | 7584 | 0x00 | true | 0 | 0xD1A8CE | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 213 | 14,39..35,52 | PASS |
| full-set | 3 | + | 0x32 0x33 0x9E | post_insert_gate_stop | 7251 | 3262 | 7230 | 0x00 | true | 0 | 0xD1A8CF | 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00 | 214 | 28,39..47,52 | PASS |
| full-set | 4 | - | 0x32 0x33 0x9E 0x71 | post_insert_gate_stop | 7219 | 3459 | 7199 | 0x00 | true | 0 | 0xD1A8D0 | 0x32 0x33 0x9E 0x71 0x00 0x00 0x00 0x00 | 260 | 38,39..59,52 | PASS |
| full-set | 5 | * | 0x32 0x33 0x9E 0x71 0x82 | post_insert_gate_stop | 7191 | 3419 | 7171 | 0x00 | true | 0 | 0xD1A8D1 | 0x32 0x33 0x9E 0x71 0x82 0x00 0x00 0x00 | 228 | 50,39..71,52 | PASS |
| full-set | 6 | / | 0x32 0x33 0x9E 0x71 0x82 0x83 | post_insert_gate_stop | 8055 | 3475 | 8030 | 0x00 | true | 0 | 0xD1A8D2 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x00 0x00 | 251 | 62,39..83,52 | PASS |
| full-set | 7 | . | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A | post_insert_gate_stop | 6993 | 3251 | 6974 | 0x00 | true | 0 | 0xD1A8D3 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x00 | 264 | 74,39..95,52 | PASS |
| full-set | 8 | ( | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 | post_insert_gate_stop | 8053 | 3475 | 8028 | 0x00 | true | 0 | 0xD1A8D4 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 | 242 | 86,39..107,52 | PASS |
| full-set | 9 | ) | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11 | post_insert_gate_stop | 7205 | 3427 | 7185 | 0x00 | true | 0 | 0xD1A8D5 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 | 243 | 98,39..119,52 | PASS |
| long-sequence-prefix | 1 | 2 | 0x32 | post_insert_gate_stop | 6947 | 2601 | 6929 | 0x00 | true | 0 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 205 | 2,39..23,52 | PASS |
| long-sequence-prefix | 2 | 3 | 0x32 0x33 | post_insert_gate_stop | 7606 | 3451 | 7584 | 0x00 | true | 0 | 0xD1A8CE | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 213 | 14,39..35,52 | PASS |
| long-sequence-prefix | 3 | + | 0x32 0x33 0x9E | post_insert_gate_stop | 7251 | 3262 | 7230 | 0x00 | true | 0 | 0xD1A8CF | 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00 | 214 | 28,39..47,52 | PASS |
| long-sequence-prefix | 4 | - | 0x32 0x33 0x9E 0x71 | post_insert_gate_stop | 7219 | 3459 | 7199 | 0x00 | true | 0 | 0xD1A8D0 | 0x32 0x33 0x9E 0x71 0x00 0x00 0x00 0x00 | 260 | 38,39..59,52 | PASS |
| long-sequence-prefix | 5 | * | 0x32 0x33 0x9E 0x71 0x82 | post_insert_gate_stop | 7191 | 3419 | 7171 | 0x00 | true | 0 | 0xD1A8D1 | 0x32 0x33 0x9E 0x71 0x82 0x00 0x00 0x00 | 228 | 50,39..71,52 | PASS |
| long-sequence-prefix | 6 | / | 0x32 0x33 0x9E 0x71 0x82 0x83 | post_insert_gate_stop | 8055 | 3475 | 8030 | 0x00 | true | 0 | 0xD1A8D2 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x00 0x00 | 251 | 62,39..83,52 | PASS |
| long-sequence-prefix | 7 | . | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A | post_insert_gate_stop | 6993 | 3251 | 6974 | 0x00 | true | 0 | 0xD1A8D3 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x00 | 264 | 74,39..95,52 | PASS |
| long-sequence-prefix | 8 | ( | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 | post_insert_gate_stop | 8053 | 3475 | 8028 | 0x00 | true | 0 | 0xD1A8D4 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 | 242 | 86,39..107,52 | PASS |

## Notes

- The shell public diagnostics expose the first eight edit-buffer bytes. The full nine-key set therefore asserts the ninth `)` through the key-specific expected byte, cursor advance, gate stop, zero wipes, and canvas delta; the separate eight-key long sequence asserts every expected buffer byte directly.
- Cleanup avoidance is asserted by `post_insert_gate_stop`, `stoppedAtPostInsertGate=true`, restored `D000C2=0x00`, and `wipes=0`; the browser diagnostics do not expose separate counters for `0x0158BC` or `0x001879`.

## Compact JSON

```json
{
  "probe": "phase691-browser-gate-broad-regression",
  "pass": true,
  "fullSet": {
    "pass": true,
    "sequence": [
      "2",
      "3",
      "+",
      "-",
      "*",
      "/",
      ".",
      "(",
      ")"
    ],
    "expectedBytes": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11",
    "finalVisibleBuffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
    "finalD0243A": "0xD1A8D5",
    "rows": [
      {
        "key": "2",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 6947,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CD",
        "canvasDelta": 205,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 23,
          "y1": 52
        }
      },
      {
        "key": "3",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7606,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CE",
        "canvasDelta": 213,
        "bbox": {
          "x0": 14,
          "y0": 39,
          "x1": 35,
          "y1": 52
        }
      },
      {
        "key": "+",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7251,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CF",
        "canvasDelta": 214,
        "bbox": {
          "x0": 28,
          "y0": 39,
          "x1": 47,
          "y1": 52
        }
      },
      {
        "key": "-",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7219,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8D0",
        "canvasDelta": 260,
        "bbox": {
          "x0": 38,
          "y0": 39,
          "x1": 59,
          "y1": 52
        }
      },
      {
        "key": "*",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7191,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x00 0x00 0x00",
        "cursor": "0xD1A8D1",
        "canvasDelta": 228,
        "bbox": {
          "x0": 50,
          "y0": 39,
          "x1": 71,
          "y1": 52
        }
      },
      {
        "key": "/",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 8055,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x00 0x00",
        "cursor": "0xD1A8D2",
        "canvasDelta": 251,
        "bbox": {
          "x0": 62,
          "y0": 39,
          "x1": 83,
          "y1": 52
        }
      },
      {
        "key": ".",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 6993,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x00",
        "cursor": "0xD1A8D3",
        "canvasDelta": 264,
        "bbox": {
          "x0": 74,
          "y0": 39,
          "x1": 95,
          "y1": 52
        }
      },
      {
        "key": "(",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 8053,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
        "cursor": "0xD1A8D4",
        "canvasDelta": 242,
        "bbox": {
          "x0": 86,
          "y0": 39,
          "x1": 107,
          "y1": 52
        }
      },
      {
        "key": ")",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7205,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
        "cursor": "0xD1A8D5",
        "canvasDelta": 243,
        "bbox": {
          "x0": 98,
          "y0": 39,
          "x1": 119,
          "y1": 52
        }
      }
    ]
  },
  "longSequence": {
    "pass": true,
    "sequence": [
      "2",
      "3",
      "+",
      "-",
      "*",
      "/",
      ".",
      "("
    ],
    "expectedBytes": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
    "finalVisibleBuffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
    "finalD0243A": "0xD1A8D4",
    "rows": [
      {
        "key": "2",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 6947,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CD",
        "canvasDelta": 205,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 23,
          "y1": 52
        }
      },
      {
        "key": "3",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7606,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CE",
        "canvasDelta": 213,
        "bbox": {
          "x0": 14,
          "y0": 39,
          "x1": 35,
          "y1": 52
        }
      },
      {
        "key": "+",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7251,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8CF",
        "canvasDelta": 214,
        "bbox": {
          "x0": 28,
          "y0": 39,
          "x1": 47,
          "y1": 52
        }
      },
      {
        "key": "-",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7219,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x00 0x00 0x00 0x00",
        "cursor": "0xD1A8D0",
        "canvasDelta": 260,
        "bbox": {
          "x0": 38,
          "y0": 39,
          "x1": 59,
          "y1": 52
        }
      },
      {
        "key": "*",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 7191,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x00 0x00 0x00",
        "cursor": "0xD1A8D1",
        "canvasDelta": 228,
        "bbox": {
          "x0": 50,
          "y0": 39,
          "x1": 71,
          "y1": 52
        }
      },
      {
        "key": "/",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 8055,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x00 0x00",
        "cursor": "0xD1A8D2",
        "canvasDelta": 251,
        "bbox": {
          "x0": 62,
          "y0": 39,
          "x1": 83,
          "y1": 52
        }
      },
      {
        "key": ".",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 6993,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x00",
        "cursor": "0xD1A8D3",
        "canvasDelta": 264,
        "bbox": {
          "x0": 74,
          "y0": 39,
          "x1": 95,
          "y1": 52
        }
      },
      {
        "key": "(",
        "pass": true,
        "termination": "post_insert_gate_stop",
        "steps": 8053,
        "restored": true,
        "D000C2": 0,
        "wipes": 0,
        "buffer": "0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10",
        "cursor": "0xD1A8D4",
        "canvasDelta": 242,
        "bbox": {
          "x0": 86,
          "y0": 39,
          "x1": 107,
          "y1": 52
        }
      }
    ]
  },
  "errors": []
}
```

