# Phase 927: D0009B-conditioned handoff A/B

Probe: `probe-phase927-d0009b-conditioned-handoff-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase927-d0009b-conditioned-handoff-ab.mjs`

## Result

- Probe PASS: **yes**. Candidate removes duplication: **yes**.
- Both independent `123` pages stay exact: baseline=yes, instrumented-policy shell=yes.
- Baseline `2+3` remains the PHASE926 failure: exact=no, Digit3 termination=max_steps, insert-owner hits=2, repeated final `0x31`=yes.
- The plus-only policy rejected 1 handoff(s) that PHASE924 would accept solely because `D0009B & 0x40` was set.
- Conditioned plus drain ended as `guard_pre_wipe` at 0x001879 after 4138 steps; D0009B=0x00.
- Conditioned Digit3 termination=post_insert_gate_stop, gate hits=3, insert-owner hits=1, repeated final `0x31`=no, final=0x32 0x9E 0x33 0x00.

The A/B supports the narrow predicate as a causal fix candidate: refusing the stale bit-6 handoff lets the plus-conditioned next Digit3 reach the existing post-insert gate exactly once without editing RAM or dispatching ENTER. The next tick must adjudicate where the extended drain stops and its wipe safety before any disk patch.

## Route table

| page | key | policy active | termination | steps | gate hits | repeated 31 | final first 4 bytes | drain stop |
|---|---|---:|---|---:|---:|---:|---|---|
| 123-baseline | 1 | no | post_insert_gate_stop | 7526 | 1 | 0 | 31 00 00 00 | first_zero_handoff @ 0x03F9B0 |
| 123-baseline | 2 | no | post_insert_gate_stop | 4824 | 3 | 0 | 31 32 00 00 | guard_pre_wipe @ 0x001879 |
| 123-baseline | 3 | no | post_insert_gate_stop | 4508 | 3 | 0 | 31 32 33 00 | guard_pre_wipe @ 0x001879 |
| 123-policy-shell | 1 | no | post_insert_gate_stop | 7526 | 1 | 0 | 31 00 00 00 | first_zero_handoff @ 0x03F9B0 |
| 123-policy-shell | 2 | no | post_insert_gate_stop | 4824 | 3 | 0 | 31 32 00 00 | guard_pre_wipe @ 0x001879 |
| 123-policy-shell | 3 | no | post_insert_gate_stop | 4508 | 3 | 0 | 31 32 33 00 | guard_pre_wipe @ 0x001879 |
| 2plus3-baseline | 2 | no | post_insert_gate_stop | 7526 | 1 | 0 | 32 00 00 00 | first_zero_handoff @ 0x03F9B0 |
| 2plus3-baseline | + | no | post_insert_gate_stop | 7654 | 1 | 0 | 32 9E 00 00 | first_zero_handoff @ 0x03F9B0 |
| 2plus3-baseline | 3 | no | max_steps | 300000 | 0 | 1 | 32 9E 33 31 | - @ - |
| 2plus3-d0009b-policy | 2 | no | post_insert_gate_stop | 7526 | 1 | 0 | 32 00 00 00 | first_zero_handoff @ 0x03F9B0 |
| 2plus3-d0009b-policy | + | yes | post_insert_gate_stop | 7654 | 3 | 0 | 32 9E 00 00 | guard_pre_wipe @ 0x001879 |
| 2plus3-d0009b-policy | 3 | no | post_insert_gate_stop | 4558 | 3 | 0 | 32 9E 33 00 | guard_pre_wipe @ 0x001879 |

## Plus handoff A/B

| variant | block | D0058B | D000C3 | D0009B | PHASE924 accepts | PHASE927 accepts |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 10402 | 0x00 | 0x00 | 0x60 | yes | no |
| conditioned | 10402 | 0x00 | 0x00 | 0x60 | yes | no |
| conditioned | 10602 | 0x00 | 0x06 | 0x40 | no | no |
| conditioned | 10802 | 0x00 | 0x06 | 0x40 | no | no |
| conditioned | 11202 | 0x00 | 0x06 | 0x40 | no | no |

## Bounded JSON evidence

```json
{
  "pass": true,
  "candidateWorks": true,
  "controlBaselineExact": true,
  "controlPolicyExact": true,
  "plusBaselineExact": false,
  "plusPolicyExact": true,
  "policyObserved": true,
  "scenarios": [
    {
      "name": "123-baseline",
      "usePolicy": false,
      "lineBase": 13740236,
      "routes": [
        {
          "key": "1",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "gateHits": 1,
          "insertHits": 1,
          "preWipeHits": 0,
          "buffer": [
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740237,
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
          },
          "handoffs": [
            {
              "block": 9670,
              "D0058B": 0,
              "D000C3": 0,
              "D0009B": 64,
              "policyActive": false,
              "wouldPhase924Accept": true,
              "wouldPhase927Accept": false
            }
          ]
        },
        {
          "key": "2",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 4824,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
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
          "cursor": 13740238,
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
        {
          "key": "3",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 4508,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
          "buffer": [
            49,
            50,
            51,
            0,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740239,
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
          },
          "handoffs": []
        }
      ],
      "finalBuffer": [
        49,
        50,
        51,
        0,
        0,
        0,
        0,
        0
      ],
      "finalCursor": 13740239,
      "pageErrors": []
    },
    {
      "name": "123-policy-shell",
      "usePolicy": true,
      "lineBase": 13740236,
      "routes": [
        {
          "key": "1",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "gateHits": 1,
          "insertHits": 1,
          "preWipeHits": 0,
          "buffer": [
            49,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740237,
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
          },
          "handoffs": [
            {
              "block": 9670,
              "D0058B": 0,
              "D000C3": 0,
              "D0009B": 64,
              "policyActive": false,
              "wouldPhase924Accept": true,
              "wouldPhase927Accept": false
            }
          ]
        },
        {
          "key": "2",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 4824,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
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
          "cursor": 13740238,
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
        {
          "key": "3",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 4508,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
          "buffer": [
            49,
            50,
            51,
            0,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740239,
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
          },
          "handoffs": []
        }
      ],
      "finalBuffer": [
        49,
        50,
        51,
        0,
        0,
        0,
        0,
        0
      ],
      "finalCursor": 13740239,
      "pageErrors": []
    },
    {
      "name": "2plus3-baseline",
      "usePolicy": false,
      "lineBase": 13740236,
      "routes": [
        {
          "key": "2",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "gateHits": 1,
          "insertHits": 1,
          "preWipeHits": 0,
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
          "cursor": 13740237,
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
          },
          "handoffs": [
            {
              "block": 9670,
              "D0058B": 0,
              "D000C3": 0,
              "D0009B": 64,
              "policyActive": false,
              "wouldPhase924Accept": true,
              "wouldPhase927Accept": false
            }
          ]
        },
        {
          "key": "+",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 7654,
          "gateHits": 1,
          "insertHits": 1,
          "preWipeHits": 0,
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
          "cursor": 13740238,
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
          },
          "handoffs": [
            {
              "block": 10402,
              "D0058B": 0,
              "D000C3": 0,
              "D0009B": 96,
              "policyActive": false,
              "wouldPhase924Accept": true,
              "wouldPhase927Accept": false
            }
          ]
        },
        {
          "key": "3",
          "policyActive": false,
          "termination": "max_steps",
          "steps": 300000,
          "gateHits": 0,
          "insertHits": 2,
          "preWipeHits": 0,
          "buffer": [
            50,
            158,
            51,
            49,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740240,
          "drain": null,
          "handoffs": []
        }
      ],
      "finalBuffer": [
        50,
        158,
        51,
        49,
        0,
        0,
        0,
        0
      ],
      "finalCursor": 13740240,
      "pageErrors": []
    },
    {
      "name": "2plus3-d0009b-policy",
      "usePolicy": true,
      "lineBase": 13740236,
      "routes": [
        {
          "key": "2",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "gateHits": 1,
          "insertHits": 1,
          "preWipeHits": 0,
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
          "cursor": 13740237,
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
          },
          "handoffs": [
            {
              "block": 9670,
              "D0058B": 0,
              "D000C3": 0,
              "D0009B": 64,
              "policyActive": false,
              "wouldPhase924Accept": true,
              "wouldPhase927Accept": false
            }
          ]
        },
        {
          "key": "+",
          "policyActive": true,
          "termination": "post_insert_gate_stop",
          "steps": 7654,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
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
          "cursor": 13740238,
          "drain": {
            "ok": false,
            "stopKind": "guard_pre_wipe",
            "stopPc": null,
            "guardPc": 6265,
            "stopD0058B": 0,
            "blockCount": 4129,
            "steps": 4138,
            "termination": "guard_pre_wipe",
            "lastPc": 6265,
            "lastMode": "adl",
            "wipes": 0,
            "D007CA": 361961,
            "D0243A": 13740238,
            "token": 50
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
        {
          "key": "3",
          "policyActive": false,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "gateHits": 3,
          "insertHits": 1,
          "preWipeHits": 1,
          "buffer": [
            50,
            158,
            51,
            0,
            0,
            0,
            0,
            0
          ],
          "cursor": 13740239,
          "drain": {
            "ok": false,
            "stopKind": "guard_pre_wipe",
            "stopPc": null,
            "guardPc": 6265,
            "stopD0058B": null,
            "blockCount": 2465,
            "steps": 2470,
            "termination": "guard_pre_wipe",
            "lastPc": 6265,
            "lastMode": "adl",
            "wipes": 0,
            "D007CA": 361961,
            "D0243A": 13740239,
            "token": 50
          },
          "handoffs": []
        }
      ],
      "finalBuffer": [
        50,
        158,
        51,
        0,
        0,
        0,
        0,
        0
      ],
      "finalCursor": 13740239,
      "pageErrors": []
    }
  ]
}
```

The browser shell was modified only in the HTTP response served by this probe. No disk browser/runtime/transpiler/decoder/peripheral/scheduler/ROM/`follow-alongs/` file was changed.

