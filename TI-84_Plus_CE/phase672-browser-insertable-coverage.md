# Phase 672: Browser Insertable Key Coverage

Probe: `probe-phase672-browser-insertable-coverage.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase672-browser-insertable-coverage.mjs`

## Result

- Overall: **PASS**
- Scope: extends phase671 by testing the six additional insertable keys from an empty edit buffer (`-`, `*`, `/`, `.`, `(`, `)`).
- Final buffer: 0x71 0x82 0x83 0x3A 0x10 0x11 0x00 0x00
- Final D0243A: 0xD1A8D2
- Page errors: []

## Keys

| key | code | expected | shell expected | termination | steps | insert block | wipes | buffer | D0243A | D007CA | status |
|---|---|---:|---:|---|---:|---:|---:|---|---:|---:|---|
| - | Minus | 0x71 | 0x71 | insert_stop | 3763 | 2754 | 0 | 0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 0x0585E9 | PASS |
| × | NumpadMultiply | 0x82 | 0x82 | insert_stop | 3657 | 2648 | 0 | 0x71 0x82 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 0x0585E9 | PASS |
| ÷ | Slash | 0x83 | 0x83 | insert_stop | 3999 | 2987 | 0 | 0x71 0x82 0x83 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CF | 0x0585E9 | PASS |
| . | Period | 0x3A | 0x3A | insert_stop | 4018 | 3007 | 0 | 0x71 0x82 0x83 0x3A 0x00 0x00 0x00 0x00 | 0xD1A8D0 | 0x0585E9 | PASS |
| ( | BracketLeft | 0x10 | 0x10 | insert_stop | 3372 | 2365 | 0 | 0x71 0x82 0x83 0x3A 0x10 0x00 0x00 0x00 | 0xD1A8D1 | 0x0585E9 | PASS |
| ) | BracketRight | 0x11 | 0x11 | insert_stop | 3812 | 2803 | 0 | 0x71 0x82 0x83 0x3A 0x10 0x11 0x00 0x00 | 0xD1A8D2 | 0x0585E9 | PASS |

## Full JSON

```json
{
  "probe": "phase672-browser-insertable-coverage",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:51539/browser-shell.html",
  "pass": true,
  "keys": [
    {
      "code": "Minus",
      "label": "-",
      "expectedInsertByte": 113,
      "cursorBefore": 13740236,
      "insertBlock": 2754,
      "stoppedAfterInsert": true,
      "steps": 3763,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D007CA": 361961,
      "buffer": [
        113,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8569,
      "expected": 113,
      "pass": true
    },
    {
      "code": "NumpadMultiply",
      "label": "×",
      "expectedInsertByte": 130,
      "cursorBefore": 13740237,
      "insertBlock": 2648,
      "stoppedAfterInsert": true,
      "steps": 3657,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740238,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8607,
      "expected": 130,
      "pass": true
    },
    {
      "code": "Slash",
      "label": "÷",
      "expectedInsertByte": 131,
      "cursorBefore": 13740238,
      "insertBlock": 2987,
      "stoppedAfterInsert": true,
      "steps": 3999,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8605,
      "expected": 131,
      "pass": true
    },
    {
      "code": "Period",
      "label": ".",
      "expectedInsertByte": 58,
      "cursorBefore": 13740239,
      "insertBlock": 3007,
      "stoppedAfterInsert": true,
      "steps": 4018,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740240,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8585,
      "expected": 58,
      "pass": true
    },
    {
      "code": "BracketLeft",
      "label": "(",
      "expectedInsertByte": 16,
      "cursorBefore": 13740240,
      "insertBlock": 2365,
      "stoppedAfterInsert": true,
      "steps": 3372,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740241,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8623,
      "expected": 16,
      "pass": true
    },
    {
      "code": "BracketRight",
      "label": ")",
      "expectedInsertByte": 17,
      "cursorBefore": 13740241,
      "insertBlock": 2803,
      "stoppedAfterInsert": true,
      "steps": 3812,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        17,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8660,
      "expected": 17,
      "pass": true
    }
  ],
  "final": {
    "lastKey": {
      "code": "BracketRight",
      "label": ")",
      "expectedInsertByte": 17,
      "cursorBefore": 13740241,
      "insertBlock": 2803,
      "stoppedAfterInsert": true,
      "steps": 3812,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        113,
        130,
        131,
        58,
        16,
        17,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8660
    },
    "status": "Key: ) → 3812 steps (insert_stop, insert=0x11 @0xd1a8d1, peak 0px)",
    "errors": [],
    "vram": 8660,
    "buffer": [
      113,
      130,
      131,
      58,
      16,
      17,
      0,
      0
    ],
    "D0243A": 13740242
  },
  "errors": []
}
```

