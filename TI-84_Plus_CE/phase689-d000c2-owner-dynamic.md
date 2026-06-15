# Phase 689: Dynamic D000C2 Bit7 Owner-Hit Map

Probe: `probe-phase689-d000c2-owner-dynamic.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase689-d000c2-owner-dynamic.mjs`

## Result

- Overall: **PASS**
- VAT snapshot captured: true
- Static bit7 owners instrumented: 31
- Dynamic owners hit: 3/31 (0x00186A, 0x005BB6, 0x0158E3)
- Digit2 early/gate equivalence: true
- 2+3 gate sequence: true
- Follow-up Digit2 gate insert: true
- Stopped browser inserts only hit the 0x0158DE gate test: true
- Continuing after gate return enters destructive cleanup/wipe: true
- Main finding: stopped browser insertions hit only the targeted 0x0158E3 bit7 test, while post-return continuation hits 0x00186A/0x005BB6 clearers only as part of the destructive 0x0158BC -> 0x001879 -> 0x0018F8 cleanup path
- Browser policy decision: Stop at the 0x0013DA gate return and restore the previous D000C2 bit7 value; bounded continuation clears bit7 only by entering destructive cleanup/wipe.

## Browser Recipe Runs

| policy | key | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | owner hits | assertion |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| digit2-early-stop | 2 | stop_0158e8_before_owner | 6308 | 2601 | - | 1 | 1 | 0 | 0 | 0 | 0x00 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanEarly=true |
| digit2-gate-bypass | 2 | gate_return_0013da | 6809 | 2890 | 6790 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanGate=true; eq=true |
| digit2-gate-settle | settle | max_steps | 120000 | - | - | 1 | 1 | 1 | 1 | 1 | 0x00 | 0x000000 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x00186A RES(1), 0x005BB6 RES(1), 0x0158E3 BIT(1) | destructiveSettle=true |

## Gate Sequence And Follow-Up

Sequence: 2 + 3

| policy | key | termination | steps | insert block | gate set block | gate hits | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D0243A | buffer | owner hits | assertion |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| gate | 2 | gate_return_0013da | 6691 | 2890 | 6673 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CD | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanGate=true |
| gate | + | gate_return_0013da | 6806 | 3599 | 6787 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CE | 0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanGate=true |
| gate | 3 | gate_return_0013da | 6371 | 3258 | 6355 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8CF | 0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanGate=true |
| sequence-gate-settle | settle | max_steps | 120000 | - | - | 1 | 1 | 1 | 1 | 1 | 0x00 | 0x000000 | 0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x00186A RES(1), 0x005BB6 RES(1), 0x0158E3 BIT(1) | destructiveSettle=true |
| sequence-followup-digit2-gate | 2 | gate_return_0013da | 6617 | 3505 | 6600 | 1 | 0 | 0 | 0 | 0 | 0x80 | 0xD1A8D0 | 0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x0158E3 BIT(1) | cleanGate=true |
| sequence-followup-digit2-settle | settle | max_steps | 120000 | - | - | 1 | 1 | 1 | 1 | 1 | 0x00 | 0x000000 | 0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x00186A RES(1), 0x005BB6 RES(1), 0x0158E3 BIT(1) | destructiveSettle=true |

## Dynamic Owner Hits

| pc | op | role | cluster | hits | segments | first run | first segment | first D000C2 | first buffer |
|---|---|---|---|---:|---|---|---|---|---|
| 0x00186A | RES | clearer | low-ROM key/flash wrapper cluster | 3 | settle_after_gate_return:3 | digit2-gate-settle | settle_after_gate_return | 0x80 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |
| 0x005BB6 | RES | clearer | low-ROM hardware/service dispatch cluster | 3 | settle_after_gate_return:3 | digit2-gate-settle | settle_after_gate_return | 0x00 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |
| 0x0158E3 | BIT | test | 0x0158DE post-key flash/action gate | 9 | at_0158de_gate:6, settle_after_gate_return:3 | digit2-early-stop | at_0158de_gate | 0x00 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |

## Owners Not Reached

- 0x0012EF RES clearer (low-ROM reset/wake flag initializer)
- 0x0018B7 BIT test (low-ROM key/flash wrapper cluster)
- 0x001915 BIT test (low-ROM key/flash wrapper cluster)
- 0x005D00 BIT test (low-ROM hardware/service dispatch cluster)
- 0x00621F RES clearer (low-ROM hardware/service dispatch cluster)
- 0x0158F0 SET setter (0x0158DE post-key flash/action gate)
- 0x027238 RES clearer (event/parser state cluster)
- 0x040580 RES clearer (keyboard/display event cluster)
- 0x0405DD BIT test (keyboard/display event cluster)
- 0x04062C BIT test (keyboard/display event cluster)
- 0x040740 BIT test (keyboard/display event cluster)
- 0x0408C6 RES clearer (keyboard/display event cluster)
- 0x040972 BIT test (keyboard/display event cluster)
- 0x040EB4 RES clearer (keyboard/display event tail cluster)
- 0x0459F7 RES clearer (home/display transition cluster)
- 0x045B46 SET setter (home/display transition cluster)
- 0x04C057 BIT test (central UI bit7 latch/helper cluster)
- 0x04C0BD BIT test (central UI bit7 latch/helper cluster)
- 0x04C0D3 BIT test (central UI bit7 latch/helper cluster)
- 0x04C14D BIT test (central UI bit7 latch/helper cluster)
- 0x04C167 BIT test (central UI bit7 latch/helper cluster)
- 0x04C53E RES clearer (central UI bit7 latch/helper cluster)
- 0x04C564 BIT test (central UI bit7 latch/helper cluster)
- 0x04C56F SET setter (central UI bit7 latch/helper cluster)
- 0x04C83F BIT test (central UI bit7 latch/helper cluster)
- 0x04C84B SET setter (central UI bit7 latch/helper cluster)
- 0x06B9C5 RES clearer (equation/error UI helper cluster)
- 0x06B9CF BIT test (equation/error UI helper cluster)

## Interpretation

- The dynamic browser recipe hit 3 bit7 owner site(s): 0x00186A RES, 0x005BB6 RES, 0x0158E3 BIT.
- Stopped browser-style insertions only hit `0x0158E3` (`BIT 7,(IY+66)`) at the targeted `0x0158DE` gate. No normal `SET 7` or `RES 7` owner fires before the safe gate-return stop.
- Bounded continuation after `0x0013DA` does hit normal clearers (`0x00186A`, then `0x005BB6`) and clears `D000C2` to `0x00`, but it also falls through `0x0158E8 -> 0x0158BC -> 0x001879 -> 0x0018F8` and wipes the live edit/VAT context. That is not a safe settling path.
- Browser integration should set bit7 only transiently for the `0x0158DE` `RET NZ`, stop at the `0x0013DA` gate return, and restore the previous `D000C2` bit7 value in browser-managed state. It should not leave bit7 set and should not continue into the low-ROM settle/cleanup path.

## Compact JSON

```json
{
  "phases": [
    {
      "name": "coldboot",
      "termination": "max_steps",
      "steps": 20000,
      "lastPc": "0x001CC0"
    },
    {
      "name": "kernel",
      "termination": "max_steps",
      "steps": 100000,
      "lastPc": "0x000A92"
    },
    {
      "name": "postinit",
      "termination": "max_steps",
      "steps": 100,
      "lastPc": "0x0158BC"
    },
    {
      "name": "warm-idle",
      "termination": "halt",
      "steps": 192290,
      "lastPc": "0x0019B5"
    },
    {
      "name": "launch-home",
      "termination": "halt",
      "steps": 275843,
      "lastPc": "0x0019B5"
    },
    {
      "name": "repaint",
      "termination": "halt",
      "steps": 49474,
      "lastPc": "0x0019B5"
    }
  ],
  "base": {
    "pc": "0x0019B5",
    "f": "0x54",
    "bc": "0x000000",
    "de": "0xD2A815",
    "hl": "0xD1A8A3",
    "ix": "0xD1A860",
    "iy": "0xD00080",
    "sp": "0xD1A866",
    "D00080": "0x08",
    "D0009F": "0x20",
    "D000C2": "0x00",
    "D00587": "0x1A",
    "D0058C": "0x90",
    "D0058D": "0x90",
    "D0058E": "0x90",
    "D007CA": "0x0585E9",
    "D008E0": "0x000000",
    "D0231A": "0xD2A83E",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02587": "0xD3A854",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "vram": {
      "hash": "0xA5610B57",
      "nonWhite": 8549
    }
  },
  "assertions": {
    "allOwnersInstrumented": true,
    "digit2EarlyClean": true,
    "digit2GateClean": true,
    "digit2EarlyGateEquivalent": true,
    "digit2SettleDestructive": true,
    "sequenceGateClean": true,
    "sequenceFinalBuffer": true,
    "sequenceSettleDestructive": true,
    "followupGateClean": true,
    "followupBuffer": true,
    "followupSettleDestructive": true,
    "stoppedRunsOnlyGateTest": true,
    "settleDestructiveObserved": true
  },
  "policyDecision": "Stop at the 0x0013DA gate return and restore the previous D000C2 bit7 value; bounded continuation clears bit7 only by entering destructive cleanup/wipe.",
  "dynamicOwnerHits": [
    {
      "pc": "0x00186A",
      "op": "RES",
      "role": "clearer",
      "cluster": "low-ROM key/flash wrapper cluster",
      "count": 3,
      "segments": {
        "settle_after_gate_return": 3
      },
      "samples": [
        {
          "run": "digit2-gate-settle",
          "segment": "settle_after_gate_return",
          "block": 3,
          "blockPc": "0x001853",
          "steps": 2,
          "D000C2": "0x80",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-gate-settle",
          "segment": "settle_after_gate_return",
          "block": 3,
          "blockPc": "0x001853",
          "steps": 2,
          "D000C2": "0x80",
          "D0243A": "0xD1A8CF",
          "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-followup-digit2-settle",
          "segment": "settle_after_gate_return",
          "block": 3,
          "blockPc": "0x001853",
          "steps": 2,
          "D000C2": "0x80",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        }
      ]
    },
    {
      "pc": "0x005BB6",
      "op": "RES",
      "role": "clearer",
      "cluster": "low-ROM hardware/service dispatch cluster",
      "count": 3,
      "segments": {
        "settle_after_gate_return": 3
      },
      "samples": [
        {
          "run": "digit2-gate-settle",
          "segment": "settle_after_gate_return",
          "block": 110,
          "blockPc": "0x005BB1",
          "steps": 109,
          "D000C2": "0x00",
          "D0243A": "0x000000",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-gate-settle",
          "segment": "settle_after_gate_return",
          "block": 110,
          "blockPc": "0x005BB1",
          "steps": 109,
          "D000C2": "0x00",
          "D0243A": "0x000000",
          "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-followup-digit2-settle",
          "segment": "settle_after_gate_return",
          "block": 110,
          "blockPc": "0x005BB1",
          "steps": 109,
          "D000C2": "0x00",
          "D0243A": "0x000000",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        }
      ]
    },
    {
      "pc": "0x0158E3",
      "op": "BIT",
      "role": "test",
      "cluster": "0x0158DE post-key flash/action gate",
      "count": 9,
      "segments": {
        "at_0158de_gate": 6,
        "settle_after_gate_return": 3
      },
      "samples": [
        {
          "run": "digit2-early-stop",
          "segment": "at_0158de_gate",
          "block": 6293,
          "blockPc": "0x0158DE",
          "steps": 6307,
          "D000C2": "0x00",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "digit2-gate-bypass",
          "segment": "at_0158de_gate",
          "block": 6790,
          "blockPc": "0x0158DE",
          "steps": 6808,
          "D000C2": "0x80",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "digit2-gate-settle",
          "segment": "settle_after_gate_return",
          "block": 4,
          "blockPc": "0x0158DE",
          "steps": 3,
          "D000C2": "0x00",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-gate-step1-2",
          "segment": "at_0158de_gate",
          "block": 6673,
          "blockPc": "0x0158DE",
          "steps": 6690,
          "D000C2": "0x80",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "run": "sequence-gate-step2-+",
          "segment": "at_0158de_gate",
          "block": 6787,
          "blockPc": "0x0158DE",
          "steps": 6805,
          "D000C2": "0x80",
          "D0243A": "0xD1A8CE",
          "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
        }
      ]
    }
  ],
  "digit2": {
    "early": {
      "key": "2",
      "policy": "digit2-early-stop",
      "termination": "stop_0158e8_before_owner",
      "steps": 6308,
      "insertBlock": 2601,
      "gateSetBlock": null,
      "counts": {
        "getcsc": 1,
        "cxMain": 1,
        "gate": 1,
        "preOwnerCall": 1,
        "cleanupOwner": 0,
        "cleanupEntry": 0,
        "wipe": 0
      },
      "after": {
        "pc": "0x0158E8",
        "f": "0x54",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87B",
        "D00080": "0x18",
        "D0009F": "0x00",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754
        }
      },
      "ownerHits": [
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "at_0158de_gate": 1
          },
          "samples": [
            {
              "run": "digit2-early-stop",
              "segment": "at_0158de_gate",
              "block": 6293,
              "blockPc": "0x0158DE",
              "steps": 6307,
              "D000C2": "0x00",
              "D0243A": "0xD1A8CD",
              "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": [
        {
          "kind": "inserted-prefix",
          "block": 2601,
          "steps": 2607,
          "pc": "0x05E372",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "key": "2",
          "expectedPrefix": "0x32"
        },
        {
          "kind": "release-key",
          "block": 2601,
          "steps": 2607,
          "pc": "0x05E372",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-entry",
          "block": 6293,
          "steps": 6307,
          "pc": "0x0158DE",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "stop-before-owner",
          "block": 6294,
          "steps": 6308,
          "pc": "0x0158E8",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        }
      ]
    },
    "gate": {
      "key": "2",
      "policy": "digit2-gate-bypass",
      "termination": "gate_return_0013da",
      "steps": 6809,
      "insertBlock": 2890,
      "gateSetBlock": 6790,
      "counts": {
        "getcsc": 1,
        "cxMain": 1,
        "gate": 1,
        "preOwnerCall": 0,
        "cleanupOwner": 0,
        "cleanupEntry": 0,
        "wipe": 0
      },
      "after": {
        "pc": "0x0013DA",
        "f": "0x90",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87E",
        "D00080": "0x18",
        "D0009F": "0x00",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754
        }
      },
      "ownerHits": [
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "at_0158de_gate": 1
          },
          "samples": [
            {
              "run": "digit2-gate-bypass",
              "segment": "at_0158de_gate",
              "block": 6790,
              "blockPc": "0x0158DE",
              "steps": 6808,
              "D000C2": "0x80",
              "D0243A": "0xD1A8CD",
              "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": [
        {
          "kind": "inserted-prefix",
          "block": 2890,
          "steps": 2898,
          "pc": "0x05E372",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "key": "2",
          "expectedPrefix": "0x32"
        },
        {
          "kind": "release-key",
          "block": 2890,
          "steps": 2898,
          "pc": "0x05E372",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-entry",
          "block": 6790,
          "steps": 6808,
          "pc": "0x0158DE",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-bit7-set",
          "block": 6790,
          "steps": 6808,
          "pc": "0x0158DE",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-return-stop",
          "block": 6791,
          "steps": 6809,
          "pc": "0x0013DA",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
        }
      ]
    },
    "settle": {
      "key": "settle",
      "policy": "digit2-gate-settle",
      "termination": "max_steps",
      "steps": 120000,
      "insertBlock": null,
      "gateSetBlock": null,
      "counts": {
        "gate": 1,
        "preOwnerCall": 1,
        "cleanupOwner": 1,
        "cleanupEntry": 1,
        "wipe": 1
      },
      "after": {
        "pc": "0x000BFE",
        "f": "0x0C",
        "bc": "0xFFFFFF",
        "de": "0x00003B",
        "hl": "0x00004D",
        "ix": "0xD1A3E9",
        "iy": "0xD00080",
        "sp": "0xD1A3BC",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0231A": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02587": "0x000000",
        "D02590": "0x000000",
        "D02593": "0x000000",
        "D0259A": "0x000000",
        "D0259D": "0x000000",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0xBFA2B21B",
          "nonWhite": 3039
        }
      },
      "ownerHits": [
        {
          "pc": "0x00186A",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM key/flash wrapper cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "digit2-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 3,
              "blockPc": "0x001853",
              "steps": 2,
              "D000C2": "0x80",
              "D0243A": "0xD1A8CD",
              "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x005BB6",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM hardware/service dispatch cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "digit2-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 110,
              "blockPc": "0x005BB1",
              "steps": 109,
              "D000C2": "0x00",
              "D0243A": "0x000000",
              "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "digit2-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 4,
              "blockPc": "0x0158DE",
              "steps": 3,
              "D000C2": "0x00",
              "D0243A": "0xD1A8CD",
              "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": []
    }
  },
  "sequence": {
    "keys": [
      "2",
      "+",
      "3"
    ],
    "expectedPrefix": "0x32 0x9E 0x33",
    "gate": [
      {
        "key": "2",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6691,
        "insertBlock": 2890,
        "gateSetBlock": 6673,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x4BBD1039",
            "nonWhite": 8754
          }
        },
        "ownerHits": [
          {
            "pc": "0x0158E3",
            "op": "BIT",
            "role": "test",
            "cluster": "0x0158DE post-key flash/action gate",
            "count": 1,
            "segments": {
              "at_0158de_gate": 1
            },
            "samples": [
              {
                "run": "sequence-gate-step1-2",
                "segment": "at_0158de_gate",
                "block": 6673,
                "blockPc": "0x0158DE",
                "steps": 6690,
                "D000C2": "0x80",
                "D0243A": "0xD1A8CD",
                "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
              }
            ]
          }
        ],
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "2",
            "expectedPrefix": "0x32"
          },
          {
            "kind": "release-key",
            "block": 2890,
            "steps": 2898,
            "pc": "0x05E372",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6673,
            "steps": 6690,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6673,
            "steps": 6690,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6674,
            "steps": 6691,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CD",
            "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "+",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6806,
        "insertBlock": 3599,
        "gateSetBlock": 6787,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2A",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0x736E415D",
            "nonWhite": 8820
          }
        },
        "ownerHits": [
          {
            "pc": "0x0158E3",
            "op": "BIT",
            "role": "test",
            "cluster": "0x0158DE post-key flash/action gate",
            "count": 1,
            "segments": {
              "at_0158de_gate": 1
            },
            "samples": [
              {
                "run": "sequence-gate-step2-+",
                "segment": "at_0158de_gate",
                "block": 6787,
                "blockPc": "0x0158DE",
                "steps": 6805,
                "D000C2": "0x80",
                "D0243A": "0xD1A8CE",
                "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
              }
            ]
          }
        ],
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3599,
            "steps": 3608,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00",
            "key": "+",
            "expectedPrefix": "0x32 0x9E"
          },
          {
            "kind": "release-key",
            "block": 3599,
            "steps": 3608,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6787,
            "steps": 6805,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6787,
            "steps": 6805,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6788,
            "steps": 6806,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CE",
            "buffer": "0x32 0x9E 0x00 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      },
      {
        "key": "3",
        "policy": "gate",
        "termination": "gate_return_0013da",
        "steps": 6371,
        "insertBlock": 3258,
        "gateSetBlock": 6355,
        "counts": {
          "getcsc": 1,
          "cxMain": 1,
          "gate": 1,
          "preOwnerCall": 0,
          "cleanupOwner": 0,
          "cleanupEntry": 0,
          "wipe": 0
        },
        "after": {
          "pc": "0x0013DA",
          "f": "0x90",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A87E",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x80",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x22",
          "D0058E": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CF",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "vram": {
            "hash": "0xD6F1F62B",
            "nonWhite": 8887
          }
        },
        "ownerHits": [
          {
            "pc": "0x0158E3",
            "op": "BIT",
            "role": "test",
            "cluster": "0x0158DE post-key flash/action gate",
            "count": 1,
            "segments": {
              "at_0158de_gate": 1
            },
            "samples": [
              {
                "run": "sequence-gate-step3-3",
                "segment": "at_0158de_gate",
                "block": 6355,
                "blockPc": "0x0158DE",
                "steps": 6370,
                "D000C2": "0x80",
                "D0243A": "0xD1A8CF",
                "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
              }
            ]
          }
        ],
        "events": [
          {
            "kind": "inserted-prefix",
            "block": 3258,
            "steps": 3265,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00",
            "key": "3",
            "expectedPrefix": "0x32 0x9E 0x33"
          },
          {
            "kind": "release-key",
            "block": 3258,
            "steps": 3265,
            "pc": "0x05E372",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-entry",
            "block": 6355,
            "steps": 6370,
            "pc": "0x0158DE",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-bit7-set",
            "block": 6355,
            "steps": 6370,
            "pc": "0x0158DE",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          },
          {
            "kind": "gate-return-stop",
            "block": 6356,
            "steps": 6371,
            "pc": "0x0013DA",
            "D000C2": "0x80",
            "D007CA": "0x0585E9",
            "D0243A": "0xD1A8CF",
            "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
          }
        ]
      }
    ],
    "settle": {
      "key": "settle",
      "policy": "sequence-gate-settle",
      "termination": "max_steps",
      "steps": 120000,
      "insertBlock": null,
      "gateSetBlock": null,
      "counts": {
        "gate": 1,
        "preOwnerCall": 1,
        "cleanupOwner": 1,
        "cleanupEntry": 1,
        "wipe": 1
      },
      "after": {
        "pc": "0x000BFE",
        "f": "0x0C",
        "bc": "0xFFFFFF",
        "de": "0x00003B",
        "hl": "0x00004D",
        "ix": "0xD1A3E9",
        "iy": "0xD00080",
        "sp": "0xD1A3BC",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0231A": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02587": "0x000000",
        "D02590": "0x000000",
        "D02593": "0x000000",
        "D0259A": "0x000000",
        "D0259D": "0x000000",
        "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0xBFA2B21B",
          "nonWhite": 3039
        }
      },
      "ownerHits": [
        {
          "pc": "0x00186A",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM key/flash wrapper cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 3,
              "blockPc": "0x001853",
              "steps": 2,
              "D000C2": "0x80",
              "D0243A": "0xD1A8CF",
              "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x005BB6",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM hardware/service dispatch cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 110,
              "blockPc": "0x005BB1",
              "steps": 109,
              "D000C2": "0x00",
              "D0243A": "0x000000",
              "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-gate-settle",
              "segment": "settle_after_gate_return",
              "block": 4,
              "blockPc": "0x0158DE",
              "steps": 3,
              "D000C2": "0x00",
              "D0243A": "0xD1A8CF",
              "buffer": "0x32 0x9E 0x33 0x00 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": []
    }
  },
  "followup": {
    "expectedPrefix": "0x32 0x9E 0x33 0x32",
    "gate": {
      "key": "2",
      "policy": "sequence-followup-digit2-gate",
      "termination": "gate_return_0013da",
      "steps": 6617,
      "insertBlock": 3505,
      "gateSetBlock": 6600,
      "counts": {
        "getcsc": 1,
        "cxMain": 1,
        "gate": 1,
        "preOwnerCall": 0,
        "cleanupOwner": 0,
        "cleanupEntry": 0,
        "wipe": 0
      },
      "after": {
        "pc": "0x0013DA",
        "f": "0x90",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87E",
        "D00080": "0x18",
        "D0009F": "0x00",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8D0",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0x89DC5E75",
          "nonWhite": 8952
        }
      },
      "ownerHits": [
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "at_0158de_gate": 1
          },
          "samples": [
            {
              "run": "sequence-followup-digit2-gate",
              "segment": "at_0158de_gate",
              "block": 6600,
              "blockPc": "0x0158DE",
              "steps": 6616,
              "D000C2": "0x80",
              "D0243A": "0xD1A8D0",
              "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": [
        {
          "kind": "inserted-prefix",
          "block": 3505,
          "steps": 3514,
          "pc": "0x000038",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00",
          "key": "2",
          "expectedPrefix": "0x32 0x9E 0x33 0x32"
        },
        {
          "kind": "release-key",
          "block": 3505,
          "steps": 3514,
          "pc": "0x000038",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-entry",
          "block": 6600,
          "steps": 6616,
          "pc": "0x0158DE",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-bit7-set",
          "block": 6600,
          "steps": 6616,
          "pc": "0x0158DE",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        },
        {
          "kind": "gate-return-stop",
          "block": 6601,
          "steps": 6617,
          "pc": "0x0013DA",
          "D000C2": "0x80",
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8D0",
          "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
        }
      ]
    },
    "settle": {
      "key": "settle",
      "policy": "sequence-followup-digit2-settle",
      "termination": "max_steps",
      "steps": 120000,
      "insertBlock": null,
      "gateSetBlock": null,
      "counts": {
        "gate": 1,
        "preOwnerCall": 1,
        "cleanupOwner": 1,
        "cleanupEntry": 1,
        "wipe": 1
      },
      "after": {
        "pc": "0x000BFE",
        "f": "0x0C",
        "bc": "0xFFFFFF",
        "de": "0x00003B",
        "hl": "0x00004D",
        "ix": "0xD1A3E9",
        "iy": "0xD00080",
        "sp": "0xD1A3BC",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0231A": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02587": "0x000000",
        "D02590": "0x000000",
        "D02593": "0x000000",
        "D0259A": "0x000000",
        "D0259D": "0x000000",
        "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "vram": {
          "hash": "0xBFA2B21B",
          "nonWhite": 3039
        }
      },
      "ownerHits": [
        {
          "pc": "0x00186A",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM key/flash wrapper cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-followup-digit2-settle",
              "segment": "settle_after_gate_return",
              "block": 3,
              "blockPc": "0x001853",
              "steps": 2,
              "D000C2": "0x80",
              "D0243A": "0xD1A8D0",
              "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x005BB6",
          "op": "RES",
          "role": "clearer",
          "cluster": "low-ROM hardware/service dispatch cluster",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-followup-digit2-settle",
              "segment": "settle_after_gate_return",
              "block": 110,
              "blockPc": "0x005BB1",
              "steps": 109,
              "D000C2": "0x00",
              "D0243A": "0x000000",
              "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
            }
          ]
        },
        {
          "pc": "0x0158E3",
          "op": "BIT",
          "role": "test",
          "cluster": "0x0158DE post-key flash/action gate",
          "count": 1,
          "segments": {
            "settle_after_gate_return": 1
          },
          "samples": [
            {
              "run": "sequence-followup-digit2-settle",
              "segment": "settle_after_gate_return",
              "block": 4,
              "blockPc": "0x0158DE",
              "steps": 3,
              "D000C2": "0x00",
              "D0243A": "0xD1A8D0",
              "buffer": "0x32 0x9E 0x33 0x32 0x00 0x00 0x00 0x00"
            }
          ]
        }
      ],
      "events": []
    }
  }
}
```

