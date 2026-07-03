# Phase 916: Route-Correct Residual Owner Trace

Probe: `probe-phase916-route-correct-residual-owner.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase916-route-correct-residual-owner.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Phase914 first-zero baseline reproduced: pc=0x03F9B0, D0058B=0x00, D00588=0x22, D007CA=0x0585E9, D0243A=0xD1A8CD, token=0x33.
- Route-correct first-zero reset CLEAR: first 0x03F9AE next=0x03D058, 0x0A229D=1, 0x001879=0, 0x0018F8=0, uiClearApplied=true, wipes=0, oracle mismatches=2.
- D0243D owner: observed at 0x05E7D1 after owner PC 0x05E26C, 0xD2A83E -> 0xD2A83D. This is the OS route's edit-tail decrement; the browser UI clear helper does not change D0243D.
- EDIT_TOKEN_D1A8CC owner: no OS block-field change was observed during the route. The temporary wrapper proves `applyColdbootUiLevelClear()` changes token 0x33 -> 0x00 while leaving D0243D 0xD2A83D -> 0xD2A83D.
- Interpretation: The route is now correct; the remaining mismatches are local residuals. D0243D is decremented by the OS block ending at 0x05E26C before the 0x0A229D pre-stop, while EDIT_TOKEN_D1A8CC is cleared later by the browser UI-level clear helper. These are separate owners; neither is caused by the old 0x001879/0x0018F8 wipe route.

## Route Summary

| Scenario | After Digit3 D0058B | After delay D0058B | Idle-frame D0058B | First 0x03F9AE next | 0x03F9B0 | 0x03F9B8 | 0x03F9D1 | 0x03F9D5 | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| first-zero-reset-clear | 0x05 | - | first-zero-baseline stop-first-zero-counter:0x00 | 0x03D058 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 2 |

## First-Zero Stop

| Stop | Term | Steps | PC | D0058B | D00587 | D00588 | D00589 | D007CA | D0243A | Token | 0x001879 seen | 0x0018F8 seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| first-zero-baseline stop-first-zero-counter | phase914_stop_first-zero-counter | 2171 | 0x03F9B0 | 0x00 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 0 | 0 |

## Residual Oracle Fields

| Field | Oracle | Actual |
| --- | --- | --- |
| D0243D | 0xD2A83E | 0xD2A83D |
| EDIT_TOKEN_D1A8CC | 0x33 | 0x00 |

## Residual Field Changes

| Seq | Field | Before | After | Observed At | Owner PC |
| --- | --- | --- | --- | --- | --- |
| 4618 | D0243D | 0xD2A83E | 0xD2A83D | 0x05E7D1 | 0x05E26C |

## UI Clear Helper

| Block | Prev PC | OK | Token before | Token after | D0243A before | D0243A after | D0243D before | D0243D after | Col before | Col after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 73902 | 0x0A229D | yes | 0x33 | 0x00 | 0xD1A8CC | 0xD1A8CC | 0xD2A83D | 0xD2A83D | 0x00 | 0x00 |

## Owner Target Samples

| Seq | PC | Prev | D0243A | D0243D | Token | D00596 | F | HL | DE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4617 | 0x05E26C | 0x05E24C | 0xD1A8CD | 0xD2A83E | 0x33 | 0x01 | 0x4A | 0xD1A8CC | 0xD100CC |
| 4618 | 0x05E7D1 | 0x05E26C | 0xD1A8CC | 0xD2A83D | 0x33 | 0x01 | 0x0C | 0xD2A83D | 0xD10033 |
| 5195 | 0x05E7D1 | 0x05E246 | 0xD1A8CC | 0xD2A83D | 0x33 | 0x00 | 0x42 | 0xD1A8CC | 0xD1A8CC |
| 18000 | 0x0A229D | 0x0A2A37 | 0xD1A8CC | 0xD2A83D | 0x33 | 0x00 | 0x0C | 0x000104 | 0x00013F |

## Static Owner Windows

### 0x05E26C Window

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x05E26C | 5e | tag="ld-reg-ind", dest="e", src="hl", mode="adl", modePrefix=null |
| 0x05E26D | 22 3a 24 d0 | tag="ld-pair-mem", pair="hl", addr=0xD0243A, direction="to-mem", mode="adl", modePrefix=null |
| 0x05E271 | 2a 3d 24 d0 | tag="ld-pair-mem", pair="hl", addr=0xD0243D, direction="from-mem", mode="adl", modePrefix=null |
| 0x05E275 | 2b | tag="dec-pair", pair="hl", mode="adl", modePrefix=null |
| 0x05E276 | 73 | tag="ld-ind-reg", dest="hl", src="e", mode="adl", modePrefix=null |
| 0x05E277 | 22 3d 24 d0 | tag="ld-pair-mem", pair="hl", addr=0xD0243D, direction="to-mem", mode="adl", modePrefix=null |
| 0x05E27B | f6 01 | tag="alu-imm", op="or", value=0x01, mode="adl", modePrefix=null |
| 0x05E27D | c9 | tag="ret", terminates=true, mode="adl", modePrefix=null |
| 0x05E27E | cd 5a e3 05 | tag="call", target=0x05E35A, fallthrough=0x05E282, terminates=true, mode="adl", modePrefix=null |
| 0x05E282 | c8 | tag="ret-conditional", condition="z", fallthrough=0x05E283, terminates=true, mode="adl", modePrefix=null |
| 0x05E283 | cd 64 00 08 | tag="call", target=0x080064, fallthrough=0x05E287, terminates=true, mode="adl", modePrefix=null |
| 0x05E287 | 16 00 | tag="ld-reg-imm", dest="d", value=0x00, mode="adl", modePrefix=null |
| 0x05E289 | 20 08 | tag="jr-conditional", condition="nz", target=0x05E293, fallthrough=0x05E28B, terminates=true, mode="adl", modePrefix=null |
| 0x05E28B | e5 | tag="push", pair="hl", mode="adl", modePrefix=null |
| 0x05E28C | cd 93 e2 05 | tag="call", target=0x05E293, fallthrough=0x05E290, terminates=true, mode="adl", modePrefix=null |
| 0x05E290 | e1 | tag="pop", pair="hl", mode="adl", modePrefix=null |
| 0x05E291 | 53 | tag="ld-reg-reg", dest="d", src="e", mode="adl", modePrefix=null |
| 0x05E292 | 23 | tag="inc-pair", pair="hl", mode="adl", modePrefix=null |
| 0x05E293 | 5e | tag="ld-reg-ind", dest="e", src="hl", mode="adl", modePrefix=null |
| 0x05E294 | 23 | tag="inc-pair", pair="hl", mode="adl", modePrefix=null |
| 0x05E295 | 22 3d 24 d0 | tag="ld-pair-mem", pair="hl", addr=0xD0243D, direction="to-mem", mode="adl", modePrefix=null |
| 0x05E299 | 2a 3a 24 d0 | tag="ld-pair-mem", pair="hl", addr=0xD0243A, direction="from-mem", mode="adl", modePrefix=null |
| 0x05E29D | 73 | tag="ld-ind-reg", dest="hl", src="e", mode="adl", modePrefix=null |
| 0x05E29E | 18 18 | tag="jr", target=0x05E2B8, terminates=true, mode="adl", modePrefix=null |

### 0x05E7D1 Window

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x05E7D1 | c8 | tag="ret-conditional", condition="z", fallthrough=0x05E7D2, terminates=true, mode="adl", modePrefix=null |
| 0x05E7D2 | cd 72 2b 0a | tag="call", target=0x0A2B72, fallthrough=0x05E7D6, terminates=true, mode="adl", modePrefix=null |
| 0x05E7D6 | 18 f5 | tag="jr", target=0x05E7CD, terminates=true, mode="adl", modePrefix=null |
| 0x05E7D8 | cd 7e e2 05 | tag="call", target=0x05E27E, fallthrough=0x05E7DC, terminates=true, mode="adl", modePrefix=null |
| 0x05E7DC | c8 | tag="ret-conditional", condition="z", fallthrough=0x05E7DD, terminates=true, mode="adl", modePrefix=null |
| 0x05E7DD | cd e3 e7 05 | tag="call", target=0x05E7E3, fallthrough=0x05E7E1, terminates=true, mode="adl", modePrefix=null |
| 0x05E7E1 | 18 f5 | tag="jr", target=0x05E7D8, terminates=true, mode="adl", modePrefix=null |
| 0x05E7E3 | fd cb 2a 4e | tag="indexed-cb-bit", bit=0x01, indexRegister="iy", displacement=0x2A, mode="adl", modePrefix=null |
| 0x05E7E7 | 28 05 | tag="jr-conditional", condition="z", target=0x05E7EE, fallthrough=0x05E7E9, terminates=true, mode="adl", modePrefix=null |
| 0x05E7E9 | cd 15 63 02 | tag="call", target=0x026315, fallthrough=0x05E7ED, terminates=true, mode="adl", modePrefix=null |
| 0x05E7ED | c9 | tag="ret", terminates=true, mode="adl", modePrefix=null |
| 0x05E7EE | cd 68 2a 0a | tag="call", target=0x0A2A68, fallthrough=0x05E7F2, terminates=true, mode="adl", modePrefix=null |
| 0x05E7F2 | cd ec 1c 0a | tag="call", target=0x0A1CEC, fallthrough=0x05E7F6, terminates=true, mode="adl", modePrefix=null |
| 0x05E7F6 | c9 | tag="ret", terminates=true, mode="adl", modePrefix=null |
| 0x05E7F7 | cd 7b ff 07 | tag="call", target=0x07FF7B, fallthrough=0x05E7FB, terminates=true, mode="adl", modePrefix=null |
| 0x05E7FB | cd 4f 38 08 | tag="call", target=0x08384F, fallthrough=0x05E7FF, terminates=true, mode="adl", modePrefix=null |
| 0x05E7FF | cd a2 e3 05 | tag="call", target=0x05E3A2, fallthrough=0x05E803, terminates=true, mode="adl", modePrefix=null |

## Bounded Machine JSON

```json
{
  "pass": true,
  "route": {
    "label": "first-zero-reset-clear",
    "firstCounter": {
      "found": true,
      "anchorIndex": 3130,
      "counterIndex": 3241,
      "counterPc": 260526,
      "nextIndex": 3242,
      "nextPc": 249944
    },
    "key": {
      "termination": "control_pre_stop",
      "steps": 73906,
      "uiClearApplied": true,
      "wipes": 0,
      "controlStopPc": 664221,
      "vramPeak": 8585,
      "vramCurrent": 8482
    },
    "counts": {
      "getCsc03FA09": 1,
      "keyDebounceCounter03F9AE": 5,
      "keyDebounceFallthrough03F9B0": 0,
      "keyDebouncePost03F9B8": 0,
      "keyDebounceRefresh03F9D1": 0,
      "keyDebounceClear03F9D5": 0,
      "keyDebounceReturn03D058": 5,
      "clearFallthrough058A16": 0,
      "clearEntry0A223A": 0,
      "clearAnchor0A229D": 1,
      "residualOwner05E26C": 1,
      "residualObserved05E7D1": 2,
      "preWipe001879": 0,
      "cleanup0018F8": 0,
      "poll006D64": 0
    },
    "oracleMismatches": [
      {
        "name": "D0243D",
        "oracle": 13805630,
        "actual": 13805629,
        "match": false
      },
      {
        "name": "EDIT_TOKEN_D1A8CC",
        "oracle": 51,
        "actual": 0,
        "match": false
      }
    ],
    "residualChanges": [
      {
        "block": 4619,
        "seqIndex": 4618,
        "name": "D0243D",
        "before": 13805630,
        "after": 13805629,
        "pc": 387025,
        "ownerPc": 385644
      }
    ],
    "uiClearEvents": [
      {
        "block": 73902,
        "prevPc": 664221,
        "resultOk": true,
        "beforeToken": 51,
        "afterToken": 0,
        "beforeD0243A": 13740236,
        "afterD0243A": 13740236,
        "beforeD0243D": 13805629,
        "afterD0243D": 13805629,
        "beforeCol": 0,
        "afterCol": 0
      }
    ],
    "ownerSamples": [
      {
        "name": "residualOwner05E26C",
        "block": 4618,
        "seqIndex": 4617,
        "pc": 385644,
        "prevPc": 385612,
        "anchorCount": 1,
        "fields": {
          "D00587": 0,
          "D00588": 34,
          "D00589": 0,
          "D0058B": 251,
          "D0058C": 9,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 1,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 385644,
          "currentBlockPc": 385644,
          "sp": 13740110,
          "af": 2378,
          "bc": 2312,
          "de": 13697228,
          "hl": 13740236,
          "ix": 13740128,
          "iy": 13631616,
          "f": 74,
          "halted": false
        }
      },
      {
        "name": "residualObserved05E7D1",
        "block": 4619,
        "seqIndex": 4618,
        "pc": 387025,
        "prevPc": 385644,
        "anchorCount": 1,
        "fields": {
          "D00587": 0,
          "D00588": 34,
          "D00589": 0,
          "D0058B": 251,
          "D0058C": 9,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 1,
          "D0243A": 13740236,
          "D0243D": 13805629,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 387025,
          "currentBlockPc": 387025,
          "sp": 13740113,
          "af": 2316,
          "bc": 2312,
          "de": 13697075,
          "hl": 13805629,
          "ix": 13740128,
          "iy": 13631616,
          "f": 12,
          "halted": false
        }
      },
      {
        "name": "residualObserved05E7D1",
        "block": 5196,
        "seqIndex": 5195,
        "pc": 387025,
        "prevPc": 385606,
        "anchorCount": 1,
        "fields": {
          "D00587": 0,
          "D00588": 34,
          "D00589": 0,
          "D0058B": 251,
          "D0058C": 9,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 0,
          "D0243A": 13740236,
          "D0243D": 13805629,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 387025,
          "currentBlockPc": 387025,
          "sp": 13740113,
          "af": 66,
          "bc": 2312,
          "de": 13740236,
          "hl": 13740236,
          "ix": 13740128,
          "iy": 13631616,
          "f": 66,
          "halted": false
        }
      },
      {
        "name": "clearAnchor0A229D",
        "block": 73902,
        "seqIndex": 18000,
        "pc": 664221,
        "prevPc": 666167,
        "anchorCount": 1,
        "fields": {
          "D00587": 0,
          "D00588": 34,
          "D00589": 0,
          "D0058B": 251,
          "D0058C": 9,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 0,
          "D0243A": 13740236,
          "D0243D": 13805629,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 664221,
          "currentBlockPc": 664221,
          "sp": 13740098,
          "af": 2572,
          "bc": 49,
          "de": 319,
          "hl": 260,
          "ix": 13740128,
          "iy": 13631616,
          "f": 12,
          "halted": false
        }
      }
    ]
  },
  "firstZero": {
    "stop": {
      "termination": "phase914_stop_first-zero-counter",
      "pc": 260528,
      "fields": {
        "D007CA": 361961,
        "D008E0": 13740140,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02317": 13805630,
        "D0231A": 13805630,
        "D0231D": 13805629,
        "D02437": 13740236,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D02440": 13805630,
        "D02505": 10,
        "D02590": 13893249,
        "D0259D": 13893325,
        "D02A29": 0,
        "D0301B": 5940570,
        "D000CA_IY4A": 33,
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "EDIT_TOKEN_D1A8CC": 51
      }
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

