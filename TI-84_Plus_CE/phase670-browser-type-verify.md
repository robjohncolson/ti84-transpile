# Phase 670: Browser Type Verify

Probe: `probe-phase670-browser-type-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase670-browser-type-verify.mjs`

## Result

- Overall: **PASS**
- Final buffer: 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00
- Final D0243A: 0xD1A8CF
- Page errors: []

## Keys

| key | termination | steps | insert block | wipes | buffer | D0243A | D007CA |
|---|---:|---:|---:|---:|---|---:|---:|
| 2 | insert_stop | 3609 | 2601 | 0 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 0x0585E9 |
| 3 | insert_stop | 3788 | 2778 | 0 | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 0x0585E9 |
| + | insert_stop | 4030 | 3019 | 0 | 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CF | 0x0585E9 |

## Full JSON

```json
{
  "probe": "phase670-browser-type-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:62263/browser-shell.html",
  "pass": true,
  "keys": [
    {
      "code": "Digit2",
      "label": "2",
      "expectedInsertByte": 50,
      "cursorBefore": 13740236,
      "insertBlock": 2601,
      "stoppedAfterInsert": true,
      "steps": 3609,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D007CA": 361961,
      "buffer": [
        50,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8614,
      "expected": 50
    },
    {
      "code": "Digit3",
      "label": "3",
      "expectedInsertByte": 51,
      "cursorBefore": 13740237,
      "insertBlock": 2778,
      "stoppedAfterInsert": true,
      "steps": 3788,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740238,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8656,
      "expected": 51
    },
    {
      "code": "Equal",
      "label": "+",
      "expectedInsertByte": 158,
      "cursorBefore": 13740238,
      "insertBlock": 3019,
      "stoppedAfterInsert": true,
      "steps": 4030,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8680,
      "expected": 158
    }
  ],
  "final": {
    "lastKey": {
      "code": "Equal",
      "label": "+",
      "expectedInsertByte": 158,
      "cursorBefore": 13740238,
      "insertBlock": 3019,
      "stoppedAfterInsert": true,
      "steps": 4030,
      "termination": "insert_stop",
      "wipes": 0,
      "D0243A": 13740239,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 0,
      "vramCurrent": 8680
    },
    "status": "Key: + → 4030 steps (insert_stop, insert=0x9e @0xd1a8ce, peak 0px)",
    "errors": [],
    "vram": 8680,
    "buffer": [
      50,
      51,
      158,
      0,
      0,
      0,
      0,
      0
    ],
    "D0243A": 13740239
  }
}
```

