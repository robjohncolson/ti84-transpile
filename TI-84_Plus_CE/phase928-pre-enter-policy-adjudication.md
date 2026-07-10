# Phase 928: pre-ENTER policy adjudication

Probe: `probe-phase928-pre-enter-policy-adjudication.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase928-pre-enter-policy-adjudication.mjs`

## Result

- Probe PASS: **yes**. Guarded stop adjudicated safe/normal: **yes**.
- Both two-token drains stop at 0x001879 with lastPc=0x001879 and zero wipes: **yes**.
- The clean Digit2 drain and conditioned Plus drain have exact parity across all captured key/context/edit control fields: **yes**.
- Edit state remains live at the guard: clean=0x31 0x32 0x00 0x00, plus=0x32 0x9E 0x00 0x00, cursor clean/plus=0xD1A8CE/0xD1A8CE.
- The next Digit3 is exact once on both routes: clean=0x31 0x32 0x33 0x00 (1 insert), conditioned=0x32 0x9E 0x33 0x00 (1 insert).

Adjudication: `guard_pre_wipe` is a safe normal drain outcome for the narrow `D0009B` predicate. A further handoff is not required: a clean multi-digit route already ends at the same preserved guard state, and both routes accept the next Digit3 exactly once. PHASE927 therefore clears the condition for the narrow browser predicate patch, subject to the required browser/PHASE921/PHASE927/PHASE922/golden gates in the next tick.

## Guard comparison

| route | key | stop | lastPc | steps | wipes | first 4 bytes |
|---|---|---|---:|---:|---:|---|
| clean multi-digit | 2 | guard_pre_wipe | 0x001879 | 3970 | 0 | 0x31 0x32 0x00 0x00 |
| conditioned plus | + | guard_pre_wipe | 0x001879 | 4138 | 0 | 0x32 0x9E 0x00 0x00 |

| field | clean Digit2 drain | conditioned Plus drain | equal |
|---|---:|---:|---:|
| D0058B | 0x01 | 0x01 | yes |
| D000C3 | 0x06 | 0x06 | yes |
| D0009B | 0x00 | 0x00 | yes |
| D00080 | 0x18 | 0x18 | yes |
| D0146D | 0x00 | 0x00 | yes |
| D007CA | 0x0585E9 | 0x0585E9 | yes |
| D008E0 | 0xD1A86C | 0xD1A86C | yes |
| D02437 | 0xD1A8CC | 0xD1A8CC | yes |
| D0243A | 0xD1A8CE | 0xD1A8CE | yes |
| D0243D | 0xD2A83E | 0xD2A83E | yes |
| D02440 | 0xD2A83E | 0xD2A83E | yes |
| D02590 | 0xD3FE81 | 0xD3FE81 | yes |
| D0259D | 0xD3FECD | 0xD3FECD | yes |

## Next Digit3 route

| route | termination | steps | gate hits | insert hits | pre-wipe hits | drain wipes | final first 4 bytes |
|---|---|---:|---:|---:|---:|---:|---|
| clean after 12 | post_insert_gate_stop | 4508 | 3 | 1 | 1 | 0 | 0x31 0x32 0x33 0x00 |
| conditioned after 2+ | post_insert_gate_stop | 4558 | 3 | 1 | 1 | 0 | 0x32 0x9E 0x33 0x00 |

## Bounded JSON evidence

```json
{
  "probe": "phase928-pre-enter-policy-adjudication",
  "pass": true,
  "safeNormalGuard": true,
  "needsAnotherHandoff": false,
  "sourcePhase927Pass": true,
  "guardParity": true,
  "stateParity": true,
  "editPreserved": true,
  "cleanNextExact": true,
  "plusNextExact": true,
  "noPageErrors": true,
  "comparedFields": [
    "D0058B",
    "D000C3",
    "D0009B",
    "D00080",
    "D0146D",
    "D007CA",
    "D008E0",
    "D02437",
    "D0243A",
    "D0243D",
    "D02440",
    "D02590",
    "D0259D"
  ],
  "cleanDrain": {
    "key": "2",
    "stopKind": "guard_pre_wipe",
    "guardPc": 6265,
    "lastPc": 6265,
    "steps": 3970,
    "wipes": 0,
    "D0058B": 1,
    "D000C3": 6,
    "D0009B": 0,
    "D00080": 24,
    "D0146D": 0,
    "D007CA": 361961,
    "D008E0": 13740140,
    "D02437": 13740236,
    "D0243A": 13740238,
    "D0243D": 13805630,
    "D02440": 13805630,
    "D02590": 13893249,
    "D0259D": 13893325,
    "buffer": [
      49,
      50,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "keyState": {
      "code": "Digit2",
      "termination": "post_insert_gate_stop",
      "steps": 4824
    },
    "handoffs": [
      {
        "block": 7602,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": false,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      },
      {
        "block": 7802,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": false,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      },
      {
        "block": 8205,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": false,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      }
    ]
  },
  "plusDrain": {
    "key": "+",
    "stopKind": "guard_pre_wipe",
    "guardPc": 6265,
    "lastPc": 6265,
    "steps": 4138,
    "wipes": 0,
    "D0058B": 1,
    "D000C3": 6,
    "D0009B": 0,
    "D00080": 24,
    "D0146D": 0,
    "D007CA": 361961,
    "D008E0": 13740140,
    "D02437": 13740236,
    "D0243A": 13740238,
    "D0243D": 13805630,
    "D02440": 13805630,
    "D02590": 13893249,
    "D0259D": 13893325,
    "buffer": [
      50,
      158,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "keyState": {
      "code": "NumpadAdd",
      "termination": "post_insert_gate_stop",
      "steps": 7654
    },
    "handoffs": [
      {
        "block": 10402,
        "D0058B": 0,
        "D000C3": 0,
        "D0009B": 96,
        "policyActive": true,
        "wouldPhase924Accept": true,
        "wouldPhase927Accept": false
      },
      {
        "block": 10602,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": true,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      },
      {
        "block": 10802,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": true,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      },
      {
        "block": 11202,
        "D0058B": 0,
        "D000C3": 6,
        "D0009B": 64,
        "policyActive": true,
        "wouldPhase924Accept": false,
        "wouldPhase927Accept": false
      }
    ]
  },
  "cleanNext": {
    "key": "3",
    "termination": "post_insert_gate_stop",
    "steps": 4508,
    "gateHits": 3,
    "insertHits": 1,
    "preWipeHits": 1,
    "drainStop": "guard_pre_wipe",
    "drainLastPc": 6265,
    "drainWipes": 0,
    "cursor": 13740239,
    "descriptor": 13805630,
    "buffer": [
      49,
      50,
      51,
      0,
      0,
      0,
      0,
      0
    ]
  },
  "plusNext": {
    "key": "3",
    "termination": "post_insert_gate_stop",
    "steps": 4558,
    "gateHits": 3,
    "insertHits": 1,
    "preWipeHits": 1,
    "drainStop": "guard_pre_wipe",
    "drainLastPc": 6265,
    "drainWipes": 0,
    "cursor": 13740239,
    "descriptor": 13805630,
    "buffer": [
      50,
      158,
      51,
      0,
      0,
      0,
      0,
      0
    ]
  }
}
```

The browser shell was modified only in a temporary HTTP response inherited from PHASE927. No disk browser/runtime/transpiler/decoder/peripheral/scheduler/ROM/`follow-alongs/` file was changed.

