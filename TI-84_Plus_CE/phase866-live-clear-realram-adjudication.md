# Phase 866: Live CLEAR vs Realram After-CLEAR Adjudication

Probe: `probe-phase866-live-clear-realram-adjudication.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase866-live-clear-realram-adjudication.mjs`

## Summary

- Result: PASS. Verdict: **LIVE_DIVERGES_AFTER_ORACLE_COMPATIBLE_PRE_WIPE_STATE**.
- Real capture delta: 570 bytes in 95 ranges. The largest ranges are the descriptor/edit area and row-stride VRAM repaint bands.
- Phase864 live route: owner hits=0, wipes=3, cleanup hits=3, poll hits=20176, cleanup-before-poll=true.
- Phase865 live route: owner hits=0, wipes=1, cleanup hits=1, poll hits=9167, cleanup-before-poll=true.
- Adjudication: both live routes are already oracle-compatible on the core edit/VAT/cx fields before the wipe (`0x0A1854` / `0x0A229D` windows), then `0x0018F8` zeros those fields before the `0x006D64` poll loop. The bounded post-wipe/end state does not match the hardware after-CLEAR capture.
- Consequence: the live CLEAR is **not** correct-but-rebuilt, and a missing `0x006D64` status completion alone is not sufficient because the context has already been destroyed before the poll loop dominates.

## Real Capture Field Delta

| Field | Before digit | Real after CLEAR |
| --- | --- | --- |
| D007CA | 0x0585E9 | 0x0585E9 |
| D008E0 | 0xD1A86C | 0xD1A86C |
| D007E0 | 0x40 | 0x40 |
| D0243A | 0xD1A8CD | 0xD1A8CC |
| D0243D | 0xD2A83E | 0xD2A83E |
| D02505 | 0x0A | 0x0A |
| D02590 | 0xD3FE81 | 0xD3FE81 |
| D0259D | 0xD3FECD | 0xD3FECD |
| D02A29 | 0x000C | 0x0000 |
| D00595 | 0x25 | 0x25 |
| D00596 | 0x00 | 0x00 |

## Live Route Oracle Comparison

| Route point | D007CA | D0243A | D0243D | D02505 | D02590 | D0259D | D02A29 | Oracle match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phase864 afterBoot | 0x0585E9 | 0xD1A8CC | 0xD2A83E | 0x0A | 0xD3FE81 | 0xD3FECD | 0x0000 | yes |
| phase864 first 0x0A1854 spin | 0x0585E9 | 0xD1A8CC | 0xD2A83E | 0x0A | 0xD3FE81 | 0xD3FECD | 0x0000 | yes |
| phase864 first 0x0018F8 wipe | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x0000 | no |
| phase864 bounded end | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x0000 | no |
| phase865 first 0x0A1854 spin | 0x0585E9 | 0xD1A8CC | 0xD2A83E | 0x0A | 0xD3FE81 | 0xD3FECD | 0x0000 | yes |
| phase865 first 0x0A229D anchor | 0x0585E9 | 0xD1A8CC | 0xD2A83E | 0x0A | 0xD3FE81 | 0xD3FECD | 0x0000 | yes |
| phase865 first 0x0018F8 wipe | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x0000 | no |
| phase865 first 0x006D64 poll | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 | 0x000000 | 0x0000 | no |
| phase865 bounded end | 0x000000 | 0x000000 | 0x000000 | - | 0x000000 | - | - | no |

## Largest Real Capture Changed Ranges

| Start | End | Bytes |
| --- | --- | ---: |
| 0xD005A4 | 0xD005C0 | 29 |
| 0xD45C9C | 0xD45CAF | 20 |
| 0xD45F1C | 0xD45F2F | 20 |
| 0xD4619C | 0xD461AF | 20 |
| 0xD4641C | 0xD4642F | 20 |
| 0xD4669C | 0xD466AF | 20 |
| 0xD4691C | 0xD4692F | 20 |
| 0xD46B9C | 0xD46BAF | 20 |
| 0xD46E1C | 0xD46E2F | 20 |
| 0xD4709C | 0xD470AF | 20 |
| 0xD4731C | 0xD4732F | 20 |
| 0xD4759C | 0xD475AF | 20 |
| 0xD4781C | 0xD4782F | 20 |
| 0xD47A9C | 0xD47AAF | 20 |
| 0xD47D1C | 0xD47D2F | 20 |
| 0xD45F06 | 0xD45F15 | 16 |

## Machine JSON

```json
{
  "pass": true,
  "verdict": "LIVE_DIVERGES_AFTER_ORACLE_COMPATIBLE_PRE_WIPE_STATE",
  "captureDelta": {
    "changedBytes": 570,
    "changedRanges": 95,
    "topRanges": [
      {
        "start": 13632932,
        "end": 13632960,
        "len": 29
      },
      {
        "start": 13917340,
        "end": 13917359,
        "len": 20
      },
      {
        "start": 13917980,
        "end": 13917999,
        "len": 20
      },
      {
        "start": 13918620,
        "end": 13918639,
        "len": 20
      },
      {
        "start": 13919260,
        "end": 13919279,
        "len": 20
      },
      {
        "start": 13919900,
        "end": 13919919,
        "len": 20
      },
      {
        "start": 13920540,
        "end": 13920559,
        "len": 20
      },
      {
        "start": 13921180,
        "end": 13921199,
        "len": 20
      },
      {
        "start": 13921820,
        "end": 13921839,
        "len": 20
      },
      {
        "start": 13922460,
        "end": 13922479,
        "len": 20
      },
      {
        "start": 13923100,
        "end": 13923119,
        "len": 20
      },
      {
        "start": 13923740,
        "end": 13923759,
        "len": 20
      },
      {
        "start": 13924380,
        "end": 13924399,
        "len": 20
      },
      {
        "start": 13925020,
        "end": 13925039,
        "len": 20
      },
      {
        "start": 13925660,
        "end": 13925679,
        "len": 20
      },
      {
        "start": 13917958,
        "end": 13917973,
        "len": 16
      }
    ],
    "firstRanges": [
      {
        "start": 13631628,
        "end": 13631628,
        "len": 1
      },
      {
        "start": 13631643,
        "end": 13631643,
        "len": 1
      },
      {
        "start": 13631790,
        "end": 13631790,
        "len": 1
      },
      {
        "start": 13631794,
        "end": 13631794,
        "len": 1
      },
      {
        "start": 13632909,
        "end": 13632909,
        "len": 1
      },
      {
        "start": 13632912,
        "end": 13632913,
        "len": 2
      },
      {
        "start": 13632916,
        "end": 13632916,
        "len": 1
      },
      {
        "start": 13632922,
        "end": 13632922,
        "len": 1
      },
      {
        "start": 13632924,
        "end": 13632924,
        "len": 1
      },
      {
        "start": 13632932,
        "end": 13632960,
        "len": 29
      },
      {
        "start": 13633746,
        "end": 13633746,
        "len": 1
      },
      {
        "start": 13635826,
        "end": 13635826,
        "len": 1
      },
      {
        "start": 13635830,
        "end": 13635830,
        "len": 1
      },
      {
        "start": 13635892,
        "end": 13635892,
        "len": 1
      },
      {
        "start": 13635896,
        "end": 13635896,
        "len": 1
      },
      {
        "start": 13635913,
        "end": 13635913,
        "len": 1
      },
      {
        "start": 13640762,
        "end": 13640762,
        "len": 1
      },
      {
        "start": 13641368,
        "end": 13641368,
        "len": 1
      },
      {
        "start": 13641400,
        "end": 13641401,
        "len": 2
      },
      {
        "start": 13642275,
        "end": 13642275,
        "len": 1
      },
      {
        "start": 13642281,
        "end": 13642281,
        "len": 1
      },
      {
        "start": 13642307,
        "end": 13642307,
        "len": 1
      },
      {
        "start": 13642375,
        "end": 13642376,
        "len": 2
      },
      {
        "start": 13642455,
        "end": 13642455,
        "len": 1
      }
    ]
  },
  "captureFields": {
    "before": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D007E0": "0x40",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x000C",
      "D00595": "0x25",
      "D00596": "0x00"
    },
    "after": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D007E0": "0x40",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00595": "0x25",
      "D00596": "0x00"
    }
  },
  "phaseSummaries": {
    "phase864": {
      "source": "phase864-owner-exercise-diagnostic.md",
      "termination": "max_steps",
      "steps": 450000,
      "wipes": 3,
      "ownerHits": 0,
      "cleanupHits": 3,
      "pollHits": 20176,
      "cleanupBeforePoll": true,
      "preOracleMatches": true,
      "postOracleMatches": false,
      "postMismatchPoints": [
        "phase864 first 0x0018F8 wipe",
        "phase864 bounded end"
      ]
    },
    "phase865": {
      "source": "phase865-harness-live-divergence.md",
      "termination": "max_steps",
      "steps": 160000,
      "wipes": 1,
      "ownerHits": 0,
      "cleanupHits": 1,
      "pollHits": 9167,
      "cleanupBeforePoll": true,
      "preOracleMatches": true,
      "postOracleMatches": false,
      "postMismatchPoints": [
        "phase865 first 0x0018F8 wipe",
        "phase865 first 0x006D64 poll",
        "phase865 bounded end"
      ]
    }
  },
  "comparisons": {
    "phase864": [
      {
        "label": "phase864 afterBoot",
        "block": null,
        "pc": null,
        "fields": {
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase864 afterBoot",
          "matches": true,
          "compared": 7,
          "mismatches": [],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x0585E9",
              "expected": "0x0585E9",
              "match": true
            },
            {
              "name": "D0243A",
              "actual": "0xD1A8CC",
              "expected": "0xD1A8CC",
              "match": true
            },
            {
              "name": "D0243D",
              "actual": "0xD2A83E",
              "expected": "0xD2A83E",
              "match": true
            },
            {
              "name": "D02505",
              "actual": "0x0A",
              "expected": "0x0A",
              "match": true
            },
            {
              "name": "D02590",
              "actual": "0xD3FE81",
              "expected": "0xD3FE81",
              "match": true
            },
            {
              "name": "D0259D",
              "actual": "0xD3FECD",
              "expected": "0xD3FECD",
              "match": true
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase864 first 0x0A1854 spin",
        "block": 412,
        "pc": "0x0A1854",
        "fields": {
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase864 first 0x0A1854 spin",
          "matches": true,
          "compared": 7,
          "mismatches": [],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x0585E9",
              "expected": "0x0585E9",
              "match": true
            },
            {
              "name": "D0243A",
              "actual": "0xD1A8CC",
              "expected": "0xD1A8CC",
              "match": true
            },
            {
              "name": "D0243D",
              "actual": "0xD2A83E",
              "expected": "0xD2A83E",
              "match": true
            },
            {
              "name": "D02505",
              "actual": "0x0A",
              "expected": "0x0A",
              "match": true
            },
            {
              "name": "D02590",
              "actual": "0xD3FE81",
              "expected": "0xD3FE81",
              "match": true
            },
            {
              "name": "D0259D",
              "actual": "0xD3FECD",
              "expected": "0xD3FECD",
              "match": true
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase864 first 0x0018F8 wipe",
        "block": 77345,
        "pc": "0x0018F8",
        "fields": {
          "D007CA": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase864 first 0x0018F8 wipe",
          "matches": false,
          "compared": 7,
          "mismatches": [
            "D007CA",
            "D0243A",
            "D0243D",
            "D02505",
            "D02590",
            "D0259D"
          ],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x000000",
              "expected": "0x0585E9",
              "match": false
            },
            {
              "name": "D0243A",
              "actual": "0x000000",
              "expected": "0xD1A8CC",
              "match": false
            },
            {
              "name": "D0243D",
              "actual": "0x000000",
              "expected": "0xD2A83E",
              "match": false
            },
            {
              "name": "D02505",
              "actual": "0x00",
              "expected": "0x0A",
              "match": false
            },
            {
              "name": "D02590",
              "actual": "0x000000",
              "expected": "0xD3FE81",
              "match": false
            },
            {
              "name": "D0259D",
              "actual": "0x000000",
              "expected": "0xD3FECD",
              "match": false
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase864 bounded end",
        "block": null,
        "pc": null,
        "fields": {
          "D007CA": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase864 bounded end",
          "matches": false,
          "compared": 7,
          "mismatches": [
            "D007CA",
            "D0243A",
            "D0243D",
            "D02505",
            "D02590",
            "D0259D"
          ],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x000000",
              "expected": "0x0585E9",
              "match": false
            },
            {
              "name": "D0243A",
              "actual": "0x000000",
              "expected": "0xD1A8CC",
              "match": false
            },
            {
              "name": "D0243D",
              "actual": "0x000000",
              "expected": "0xD2A83E",
              "match": false
            },
            {
              "name": "D02505",
              "actual": "0x00",
              "expected": "0x0A",
              "match": false
            },
            {
              "name": "D02590",
              "actual": "0x000000",
              "expected": "0xD3FE81",
              "match": false
            },
            {
              "name": "D0259D",
              "actual": "0x000000",
              "expected": "0xD3FECD",
              "match": false
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      }
    ],
    "phase865": [
      {
        "label": "phase865 first 0x0A1854 spin",
        "block": 412,
        "pc": "0x0A1854",
        "fields": {
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase865 first 0x0A1854 spin",
          "matches": true,
          "compared": 7,
          "mismatches": [],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x0585E9",
              "expected": "0x0585E9",
              "match": true
            },
            {
              "name": "D0243A",
              "actual": "0xD1A8CC",
              "expected": "0xD1A8CC",
              "match": true
            },
            {
              "name": "D0243D",
              "actual": "0xD2A83E",
              "expected": "0xD2A83E",
              "match": true
            },
            {
              "name": "D02505",
              "actual": "0x0A",
              "expected": "0x0A",
              "match": true
            },
            {
              "name": "D02590",
              "actual": "0xD3FE81",
              "expected": "0xD3FE81",
              "match": true
            },
            {
              "name": "D0259D",
              "actual": "0xD3FECD",
              "expected": "0xD3FECD",
              "match": true
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase865 first 0x0A229D anchor",
        "block": 73965,
        "pc": "0x0A229D",
        "fields": {
          "D007CA": "0x0585E9",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase865 first 0x0A229D anchor",
          "matches": true,
          "compared": 7,
          "mismatches": [],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x0585E9",
              "expected": "0x0585E9",
              "match": true
            },
            {
              "name": "D0243A",
              "actual": "0xD1A8CC",
              "expected": "0xD1A8CC",
              "match": true
            },
            {
              "name": "D0243D",
              "actual": "0xD2A83E",
              "expected": "0xD2A83E",
              "match": true
            },
            {
              "name": "D02505",
              "actual": "0x0A",
              "expected": "0x0A",
              "match": true
            },
            {
              "name": "D02590",
              "actual": "0xD3FE81",
              "expected": "0xD3FE81",
              "match": true
            },
            {
              "name": "D0259D",
              "actual": "0xD3FECD",
              "expected": "0xD3FECD",
              "match": true
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase865 first 0x0018F8 wipe",
        "block": 77345,
        "pc": "0x0018F8",
        "fields": {
          "D007CA": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase865 first 0x0018F8 wipe",
          "matches": false,
          "compared": 7,
          "mismatches": [
            "D007CA",
            "D0243A",
            "D0243D",
            "D02505",
            "D02590",
            "D0259D"
          ],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x000000",
              "expected": "0x0585E9",
              "match": false
            },
            {
              "name": "D0243A",
              "actual": "0x000000",
              "expected": "0xD1A8CC",
              "match": false
            },
            {
              "name": "D0243D",
              "actual": "0x000000",
              "expected": "0xD2A83E",
              "match": false
            },
            {
              "name": "D02505",
              "actual": "0x00",
              "expected": "0x0A",
              "match": false
            },
            {
              "name": "D02590",
              "actual": "0x000000",
              "expected": "0xD3FE81",
              "match": false
            },
            {
              "name": "D0259D",
              "actual": "0x000000",
              "expected": "0xD3FECD",
              "match": false
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase865 first 0x006D64 poll",
        "block": 86654,
        "pc": "0x006D64",
        "fields": {
          "D007CA": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "comparison": {
          "label": "phase865 first 0x006D64 poll",
          "matches": false,
          "compared": 7,
          "mismatches": [
            "D007CA",
            "D0243A",
            "D0243D",
            "D02505",
            "D02590",
            "D0259D"
          ],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x000000",
              "expected": "0x0585E9",
              "match": false
            },
            {
              "name": "D0243A",
              "actual": "0x000000",
              "expected": "0xD1A8CC",
              "match": false
            },
            {
              "name": "D0243D",
              "actual": "0x000000",
              "expected": "0xD2A83E",
              "match": false
            },
            {
              "name": "D02505",
              "actual": "0x00",
              "expected": "0x0A",
              "match": false
            },
            {
              "name": "D02590",
              "actual": "0x000000",
              "expected": "0xD3FE81",
              "match": false
            },
            {
              "name": "D0259D",
              "actual": "0x000000",
              "expected": "0xD3FECD",
              "match": false
            },
            {
              "name": "D02A29",
              "actual": "0x0000",
              "expected": "0x0000",
              "match": true
            }
          ]
        }
      },
      {
        "label": "phase865 bounded end",
        "block": null,
        "pc": null,
        "fields": {
          "D007CA": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "-",
          "D02590": "0x000000",
          "D0259D": "-",
          "D02A29": "-"
        },
        "comparison": {
          "label": "phase865 bounded end",
          "matches": false,
          "compared": 4,
          "mismatches": [
            "D007CA",
            "D0243A",
            "D0243D",
            "D02505",
            "D02590",
            "D0259D",
            "D02A29"
          ],
          "rows": [
            {
              "name": "D007CA",
              "actual": "0x000000",
              "expected": "0x0585E9",
              "match": false
            },
            {
              "name": "D0243A",
              "actual": "0x000000",
              "expected": "0xD1A8CC",
              "match": false
            },
            {
              "name": "D0243D",
              "actual": "0x000000",
              "expected": "0xD2A83E",
              "match": false
            },
            {
              "name": "D02505",
              "actual": "-",
              "expected": "0x0A",
              "match": false
            },
            {
              "name": "D02590",
              "actual": "0x000000",
              "expected": "0xD3FE81",
              "match": false
            },
            {
              "name": "D0259D",
              "actual": "-",
              "expected": "0xD3FECD",
              "match": false
            },
            {
              "name": "D02A29",
              "actual": "-",
              "expected": "0x0000",
              "match": false
            }
          ]
        }
      }
    ]
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

