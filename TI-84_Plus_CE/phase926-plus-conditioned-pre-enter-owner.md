# Phase 926: Plus-Conditioned Pre-ENTER Owner Trace

Probe: `probe-phase926-plus-conditioned-pre-enter-owner.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase926-plus-conditioned-pre-enter-owner.mjs`

The probe serves an observation-only instrumented copy of `browser-shell.html`, runs independent fresh-page `123` and `2+3` scenarios, extends post-insert traces through the browser debounce drain, and never dispatches ENTER. Disk browser/runtime code is untouched.

## Result

- PASS: **yes**; page errors: [].
- Clean Digit3 reaches `post_insert_gate_stop` in 4508 steps with exact `31 32 33 00`. Plus-conditioned Digit3 inserts `0x33` at 0x05E372 block 1979, never reaches `0x0158DE`, then repeats `0x31` at the same insert owner in block 6377.
- The first edge in the bad Digit3 trace absent from the complete clean Digit3 trace is **0x0A349A -> 0x08C341** at trace index 613. Clean takes **0x0A349A -> 0x0A349F**.
- Static decode names the controller: `0x0A349A: BIT 6,(IY+0x1B)` tests `D0009B` bit 6 and `0x0A349E: RET NZ`. Bad has `D0009B=0x60` and returns to `0x08C341`; clean has `D0009B=0x00` and falls through to `0x0A349F`.
- The mismatch predates Digit3. The plus drain's final flag transition is observed at 0x000710 after 0x000704: `D0009B` 0x20 -> 0x60. The drain then accepts `0x03F9B0` with `D0058B=0`, `D000C3=0`, but `D0009B=0x60`.
- This is a diagnostic owner candidate, not a patch. A narrow observation-only A/B should test refusing handoff while `D0009B` bit 6 is set.

## Route Bounds

| Scenario | Key | Key termination | Steps | Trace end | Buffer[0..3] | Drain termination |
|---|---|---|---:|---|---|---|
| 123 control | 1 | post_insert_gate_stop | 7526 | drain_end | 0x31 0x00 0x00 0x00 | first_zero_handoff |
| 123 control | 2 | post_insert_gate_stop | 4824 | drain_end | 0x31 0x32 0x00 0x00 | guard_pre_wipe |
| 123 control | 3 | post_insert_gate_stop | 4508 | drain_end | 0x31 0x32 0x33 0x00 | guard_pre_wipe |
| 2+3 | 2 | post_insert_gate_stop | 7526 | drain_end | 0x32 0x00 0x00 0x00 | first_zero_handoff |
| 2+3 | + | post_insert_gate_stop | 7654 | drain_end | 0x32 0x9E 0x00 0x00 | first_zero_handoff |
| 2+3 | 3 | max_steps | 300000 | repeated_insert | 0x32 0x9E 0x33 0x31 | - |

## Predecessor Drain Chronology

| Predecessor | Start D0058B/C3/9B | Handoffs `(D0058B,C3,9B)` | Result | End D0058B/C3/9B |
|---|---|---|---|---|
| control Digit2 after `1` | 0x05/0x00/0x00 | (0x00,0x06,0x40) (0x00,0x06,0x40) (0x00,0x06,0x40) | guard_pre_wipe / guard_pre_wipe | 0x01/0x06/0x00 |
| plus after `2` | 0x05/0x00/0x00 | (0x00,0x00,0x60) | first_zero_handoff / first_zero_handoff | 0x00/0x00/0x60 |

The PHASE924 predicate lets the clean Digit2 drain reject three handoffs with `D000C3=0x06`; that bounded drain ends without an accepted handoff, and the next Digit3 is clean. The plus drain later accepts a handoff while `D0009B=0x60`, which directly controls the first subsequent Digit3 edge mismatch.

## Digit3 Start-State Differences

| RAM byte | Control before Digit3 | Plus-conditioned before Digit3 |
|---|---:|---:|
| 0xD00588 | 0x00 | 0x2A |
| 0xD0058B | 0x01 | 0x00 |
| 0xD0058D | 0x1A | 0x2A |
| 0xD00590 | 0xFE | 0xFF |
| 0xD00080 | 0x18 | 0x10 |
| 0xD0009B | 0x00 | 0x60 |
| 0xD000C3 | 0x06 | 0x00 |

`D0009B` is singled out because the first divergent instruction reads it directly. The other differences remain correlated state, not adjudicated owners.

## First Bad Edge

Bad route:

```text
0x0A349A b2591 AF=0x00917C BC=0x000000 DE=0x09F916 HL=0x00FFFF SP=0xD1A860 D00587/8B/8C/8D/8E=0x00/0x00/0x91/0x91/0x91 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x32 0x9E 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x00/0x00 D0009B=0x60 phase=burst
0x08C341 b2592 AF=0x009138 BC=0x000000 DE=0x09F916 HL=0x00FFFF SP=0xD1A863 D00587/8B/8C/8D/8E=0x00/0x00/0x91/0x91/0x91 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x32 0x9E 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x00/0x00 D0009B=0x60 phase=burst
```

Clean route:

```text
0x0A349A b2832 AF=0x00917C BC=0x000000 DE=0x09F916 HL=0x00FFFF SP=0xD1A860 D00587/8B/8C/8D/8E=0x00/0x01/0x91/0x91/0x91 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00 D0009B=0x00 phase=burst
0x0A349F b2833 AF=0x00917C BC=0x000000 DE=0x09F916 HL=0x00FFFF SP=0xD1A860 D00587/8B/8C/8D/8E=0x00/0x01/0x91/0x91/0x91 D00080/9F=0x10/0x00 cursor=0xD1A8CF desc=0xD2A83E end=0xD2A83E buf=0x31 0x32 0x33 0x00 0x00 D000C2/C3/C4=0x00/0x06/0x00 D0009B=0x00 phase=burst
```

Static decode:

```text
0x0A349A  FD CB 1B 76         indexed-cb-bit
0x0A349E  C0                  ret-conditional
0x0A349F  C5                  push
0x0A34A0  D5                  push
```

## Bounded JSON Evidence

```json
{
  "pass": true,
  "controlRoutes": [
    {
      "key": "1",
      "termination": "post_insert_gate_stop",
      "steps": 7526,
      "traceEnd": "drain_end",
      "buffer": [
        49,
        0,
        0,
        0
      ],
      "drain": {
        "ok": true,
        "stopKind": "first_zero_handoff",
        "stopPc": 260528,
        "guardPc": null,
        "stopD0058B": 0,
        "blockCount": 2165,
        "steps": 2171,
        "termination": "first_zero_handoff",
        "lastPc": 574257,
        "lastMode": "adl",
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740237,
        "token": 49
      }
    },
    {
      "key": "2",
      "termination": "post_insert_gate_stop",
      "steps": 4824,
      "traceEnd": "drain_end",
      "buffer": [
        49,
        50,
        0,
        0
      ],
      "drain": {
        "ok": false,
        "stopKind": "guard_pre_wipe",
        "stopPc": null,
        "guardPc": 6265,
        "stopD0058B": 0,
        "blockCount": 3962,
        "steps": 3970,
        "termination": "guard_pre_wipe",
        "lastPc": 6265,
        "lastMode": "adl",
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740238,
        "token": 49
      }
    },
    {
      "key": "3",
      "termination": "post_insert_gate_stop",
      "steps": 4508,
      "traceEnd": "drain_end",
      "buffer": [
        49,
        50,
        51,
        0
      ],
      "drain": {
        "ok": false,
        "stopKind": "guard_pre_wipe",
        "stopPc": null,
        "guardPc": 6265,
        "stopD0058B": null,
        "blockCount": 2512,
        "steps": 2518,
        "termination": "guard_pre_wipe",
        "lastPc": 6265,
        "lastMode": "adl",
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740239,
        "token": 49
      }
    }
  ],
  "plusRoutes": [
    {
      "key": "2",
      "termination": "post_insert_gate_stop",
      "steps": 7526,
      "traceEnd": "drain_end",
      "buffer": [
        50,
        0,
        0,
        0
      ],
      "drain": {
        "ok": true,
        "stopKind": "first_zero_handoff",
        "stopPc": 260528,
        "guardPc": null,
        "stopD0058B": 0,
        "blockCount": 2165,
        "steps": 2171,
        "termination": "first_zero_handoff",
        "lastPc": 574257,
        "lastMode": "adl",
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740237,
        "token": 50
      }
    },
    {
      "key": "+",
      "termination": "post_insert_gate_stop",
      "steps": 7654,
      "traceEnd": "drain_end",
      "buffer": [
        50,
        158,
        0,
        0
      ],
      "drain": {
        "ok": true,
        "stopKind": "first_zero_handoff",
        "stopPc": 260528,
        "guardPc": null,
        "stopD0058B": 0,
        "blockCount": 2751,
        "steps": 2757,
        "termination": "first_zero_handoff",
        "lastPc": 574257,
        "lastMode": "adl",
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740238,
        "token": 50
      }
    },
    {
      "key": "3",
      "termination": "max_steps",
      "steps": 300000,
      "traceEnd": "repeated_insert",
      "buffer": [
        50,
        158,
        51,
        49
      ],
      "drain": null
    }
  ],
  "predecessorDrains": {
    "controlDigit2": {
      "start": {
        "block": 4821,
        "D0058B": 5,
        "D000C3": 0,
        "keyRam": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          26,
          26,
          52,
          5,
          0,
          26,
          0,
          149,
          0
        ],
        "flagRam": [
          16,
          4,
          0,
          0,
          0,
          0,
          0,
          0,
          4,
          8,
          32,
          0,
          12,
          14,
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
          0,
          10,
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
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "handoffs": [
        {
          "block": 7602,
          "D0058B": 0,
          "D000C3": 6,
          "D0009B": 64
        },
        {
          "block": 7802,
          "D0058B": 0,
          "D000C3": 6,
          "D0009B": 64
        },
        {
          "block": 8205,
          "D0058B": 0,
          "D000C3": 6,
          "D0009B": 64
        }
      ],
      "end": {
        "block": 8783,
        "D0058B": 1,
        "D000C3": 6,
        "keyRam": [
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
          52,
          1,
          0,
          26,
          0,
          149,
          254
        ],
        "flagRam": [
          24,
          4,
          0,
          0,
          0,
          0,
          0,
          0,
          12,
          8,
          32,
          0,
          12,
          14,
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
          0,
          10,
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
          0,
          6,
          0,
          0,
          0,
          0
        ]
      }
    },
    "plus": {
      "start": {
        "block": 7651,
        "D0058B": 5,
        "D000C3": 0,
        "keyRam": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          42,
          42,
          52,
          5,
          0,
          42,
          0,
          149,
          0
        ],
        "flagRam": [
          16,
          4,
          0,
          0,
          0,
          0,
          0,
          0,
          4,
          8,
          32,
          0,
          12,
          14,
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
          0,
          10,
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
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "handoffs": [
        {
          "block": 10402,
          "D0058B": 0,
          "D000C3": 0,
          "D0009B": 96
        }
      ],
      "end": {
        "block": 10402,
        "D0058B": 0,
        "D000C3": 0,
        "keyRam": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          42,
          0,
          52,
          0,
          0,
          42,
          0,
          149,
          255
        ],
        "flagRam": [
          16,
          4,
          0,
          0,
          0,
          0,
          0,
          0,
          12,
          8,
          32,
          0,
          12,
          14,
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
          0,
          0,
          0,
          96,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          10,
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
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "finalD0009BWrite": {
        "before": 32,
        "after": 96,
        "pc": 1808,
        "prevPc": 1796,
        "block": 10294,
        "phase": "drain",
        "row": [
          1808,
          10294,
          53314,
          20500,
          32960,
          13740193,
          13740076,
          0,
          1,
          0,
          42,
          0,
          16,
          0,
          13740238,
          13805630,
          13805630,
          50,
          158,
          0,
          0,
          0,
          0,
          0,
          0,
          96,
          1
        ]
      }
    }
  },
  "digit3StartDiffs": {
    "keyRam": [
      {
        "addr": 13632904,
        "control": 0,
        "plus": 42
      },
      {
        "addr": 13632907,
        "control": 1,
        "plus": 0
      },
      {
        "addr": 13632909,
        "control": 26,
        "plus": 42
      },
      {
        "addr": 13632912,
        "control": 254,
        "plus": 255
      }
    ],
    "flagRam": [
      {
        "addr": 13631616,
        "control": 24,
        "plus": 16
      },
      {
        "addr": 13631643,
        "control": 0,
        "plus": 96
      },
      {
        "addr": 13631683,
        "control": 6,
        "plus": 0
      }
    ]
  },
  "firstBadEdge": {
    "index": 613,
    "from": 668826,
    "to": 574273,
    "badFrom": [
      668826,
      2591,
      37244,
      0,
      653590,
      65535,
      13740128,
      0,
      0,
      145,
      145,
      145,
      16,
      0,
      13740239,
      13805630,
      13805630,
      50,
      158,
      51,
      0,
      0,
      0,
      0,
      0,
      96,
      0
    ],
    "badTo": [
      574273,
      2592,
      37176,
      0,
      653590,
      65535,
      13740131,
      0,
      0,
      145,
      145,
      145,
      16,
      0,
      13740239,
      13805630,
      13805630,
      50,
      158,
      51,
      0,
      0,
      0,
      0,
      0,
      96,
      0
    ],
    "cleanTransitions": [
      {
        "label": "3",
        "from": 668826,
        "to": 668831,
        "fromRow": [
          668826,
          2832,
          37244,
          0,
          653590,
          65535,
          13740128,
          0,
          1,
          145,
          145,
          145,
          16,
          0,
          13740239,
          13805630,
          13805630,
          49,
          50,
          51,
          0,
          0,
          0,
          6,
          0,
          0,
          0
        ],
        "toRow": [
          668831,
          2833,
          37244,
          0,
          653590,
          65535,
          13740128,
          0,
          1,
          145,
          145,
          145,
          16,
          0,
          13740239,
          13805630,
          13805630,
          49,
          50,
          51,
          0,
          0,
          0,
          6,
          0,
          0,
          0
        ]
      }
    ]
  },
  "intendedInsert": {
    "pc": 385906,
    "block": 1979,
    "changes": [
      {
        "index": 2,
        "before": 0,
        "after": 51
      }
    ],
    "row": [
      385906,
      1979,
      68,
      37128,
      51,
      13740239,
      13740098,
      18,
      0,
      145,
      145,
      145,
      24,
      0,
      13740239,
      13805630,
      13805630,
      50,
      158,
      51,
      0,
      0,
      0,
      0,
      0,
      96,
      0
    ]
  },
  "repeatedInsert": {
    "pc": 385906,
    "block": 6377,
    "changes": [
      {
        "index": 3,
        "before": 0,
        "after": 49
      }
    ],
    "row": [
      385906,
      6377,
      68,
      36608,
      49,
      13740240,
      13740098,
      0,
      5,
      143,
      34,
      0,
      0,
      0,
      13740240,
      13805630,
      13805630,
      50,
      158,
      51,
      49,
      0,
      0,
      0,
      0,
      32,
      0
    ]
  },
  "pageErrors": []
}
```

No ENTER event was sent. No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` file was changed.

