# Phase 672: Native Insertable Key Discovery

Probe: `probe-phase672-native-insertable-discovery.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase672-native-insertable-discovery.mjs`

## Result

- Overall: **PASS**
- Keys inserted without wipe: 9/9
- Confirmed expected bytes matched: 9/9

## Key Bytes

| key | PC code | OS scan | internal seed | ROM table byte | expected insert | inserted byte | insert block | steps | wipes | D0243A | buffer | status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 2 | Digit2 | 0x1A | 0x90 | 0x90 | 0x32 | 0x32 | 3470 | 4487 | 0 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| 3 | Digit3 | 0x22 | 0x91 | 0x91 | 0x33 | 0x33 | 3059 | 4072 | 0 | 0xD1A8CE | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| + | Equal | 0x2A | 0x70 | 0x80 | 0x9E | 0x9E | 3180 | 4194 | 0 | 0xD1A8CF | 0x32 0x33 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| - | Minus | 0x0B | 0x81 | 0x81 | 0x71 | 0x71 | 3383 | 4399 | 0 | 0xD1A8D0 | 0x32 0x33 0x9E 0x71 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| * | NumpadMultiply | 0x0C | 0x82 | 0x82 | 0x82 | 0x82 | 3385 | 4401 | 0 | 0xD1A8D1 | 0x32 0x33 0x9E 0x71 0x82 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| / | Slash | 0x0D | 0x83 | 0x83 | 0x83 | 0x83 | 3178 | 4192 | 0 | 0xD1A8D2 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x00 0x00 0x00 0x00 0x00 0x00 | PASS |
| . | Period | 0x19 | 0x8D | 0x8D | 0x3A | 0x3A | 3060 | 4073 | 0 | 0xD1A8D3 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x00 0x00 0x00 0x00 0x00 | PASS |
| ( | BracketLeft | 0x1D | 0x85 | 0x85 | 0x10 | 0x10 | 3384 | 4400 | 0 | 0xD1A8D4 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 0x00 0x00 0x00 0x00 | PASS |
| ) | BracketRight | 0x15 | 0x86 | 0x86 | 0x11 | 0x11 | 3384 | 4400 | 0 | 0xD1A8D5 | 0x32 0x33 0x9E 0x71 0x82 0x83 0x3A 0x10 0x11 0x00 0x00 0x00 | PASS |

## Full JSON

```json
{
  "probe": "phase672-native-insertable-discovery",
  "pass": true,
  "phases": [
    {
      "name": "coldboot",
      "termination": "max_steps",
      "steps": 20000,
      "lastPc": 7360
    },
    {
      "name": "kernel",
      "termination": "max_steps",
      "steps": 100000,
      "lastPc": 2706
    },
    {
      "name": "postinit",
      "termination": "max_steps",
      "steps": 100,
      "lastPc": 88252
    },
    {
      "name": "warm-idle",
      "termination": "halt",
      "steps": 192290,
      "lastPc": 6581
    },
    {
      "name": "launch-home",
      "termination": "halt",
      "steps": 83858,
      "lastPc": 6581
    },
    {
      "name": "repaint",
      "termination": "halt",
      "steps": 205616,
      "lastPc": 6581
    }
  ],
  "keys": [
    {
      "name": "2",
      "pcCode": "Digit2",
      "osScan": 26,
      "internal": 144,
      "translated": 144,
      "expected": 50,
      "cursorBefore": 13740236,
      "insertedByte": 50,
      "insertBlock": 3470,
      "termination": "insert_stop",
      "steps": 4487,
      "blocks": 4470,
      "lastPc": 588633,
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
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "3",
      "pcCode": "Digit3",
      "osScan": 34,
      "internal": 145,
      "translated": 145,
      "expected": 51,
      "cursorBefore": 13740237,
      "insertedByte": 51,
      "insertBlock": 3059,
      "termination": "insert_stop",
      "steps": 4072,
      "blocks": 4059,
      "lastPc": 588633,
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
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "+",
      "pcCode": "Equal",
      "osScan": 42,
      "internal": 112,
      "translated": 128,
      "expected": 158,
      "cursorBefore": 13740238,
      "insertedByte": 158,
      "insertBlock": 3180,
      "termination": "insert_stop",
      "steps": 4194,
      "blocks": 4180,
      "lastPc": 588633,
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
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "-",
      "pcCode": "Minus",
      "osScan": 11,
      "internal": 129,
      "translated": 129,
      "expected": 113,
      "cursorBefore": 13740239,
      "insertedByte": 113,
      "insertBlock": 3383,
      "termination": "insert_stop",
      "steps": 4399,
      "blocks": 4383,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740240,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "*",
      "pcCode": "NumpadMultiply",
      "osScan": 12,
      "internal": 130,
      "translated": 130,
      "expected": 130,
      "cursorBefore": 13740240,
      "insertedByte": 130,
      "insertBlock": 3385,
      "termination": "insert_stop",
      "steps": 4401,
      "blocks": 4385,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740241,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        130,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "/",
      "pcCode": "Slash",
      "osScan": 13,
      "internal": 131,
      "translated": 131,
      "expected": 131,
      "cursorBefore": 13740241,
      "insertedByte": 131,
      "insertBlock": 3178,
      "termination": "insert_stop",
      "steps": 4192,
      "blocks": 4178,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740242,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        130,
        131,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": ".",
      "pcCode": "Period",
      "osScan": 25,
      "internal": 141,
      "translated": 141,
      "expected": 58,
      "cursorBefore": 13740242,
      "insertedByte": 58,
      "insertBlock": 3060,
      "termination": "insert_stop",
      "steps": 4073,
      "blocks": 4060,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740243,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        130,
        131,
        58,
        0,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": "(",
      "pcCode": "BracketLeft",
      "osScan": 29,
      "internal": 133,
      "translated": 133,
      "expected": 16,
      "cursorBefore": 13740243,
      "insertedByte": 16,
      "insertBlock": 3384,
      "termination": "insert_stop",
      "steps": 4400,
      "blocks": 4384,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740244,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        130,
        131,
        58,
        16,
        0,
        0,
        0,
        0
      ],
      "pass": true
    },
    {
      "name": ")",
      "pcCode": "BracketRight",
      "osScan": 21,
      "internal": 134,
      "translated": 134,
      "expected": 17,
      "cursorBefore": 13740244,
      "insertedByte": 17,
      "insertBlock": 3384,
      "termination": "insert_stop",
      "steps": 4400,
      "blocks": 4384,
      "lastPc": 588633,
      "wipes": 0,
      "D0243A": 13740245,
      "D007CA": 361961,
      "buffer": [
        50,
        51,
        158,
        113,
        130,
        131,
        58,
        16,
        17,
        0,
        0,
        0
      ],
      "pass": true
    }
  ]
}
```

