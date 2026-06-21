# Phase 753 Browser ArrowDown Pre-Stop Scope

Probe: `probe-phase753-browser-arrowdown-prestop-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase753-browser-arrowdown-prestop-scope.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, wraps `getColdbootControlPreStop` only for `ArrowDown`, and verifies whether stopping at `0x001879` preserves the browser shell state before `0x0018F8` wipes cx/VAT/cursor fields.

The disk `browser-shell.html` is not patched by this probe.

## Result

- Overall: **COMPLETE**
- Candidate result: **FAIL** for disk patch readiness.
- ArrowDown stop: pc=0x001879, termination=control_pre_stop, label=arrow-down-cleanup-prewipe-owner, steps=185503, uiClear=false.
- State: D007CA=0x06C92C, D008E0=0xD1A863, D02590=0xD3FE81, cursor=0xD1A8CC, VRAM=32940.
- Target hits: 0x001879=1, 0x0018F8=0, 0x001C33=926, 0x0158BC=2.
- Corruption signals: firstCriticalZero=none, first202020=none, pageErrors=0.
- Interpretation: 0x001879 avoids the destructive 0x0018F8 clear, but it is not a clean browser patch point because D007CA has already changed from 0x0585E9 to 0x06C92C. The sampled 0x0158DE and 0x0158BC hits are also after that D007CA change.

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| cleanup001879 | 1 | 185327 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 | 0x06C92C | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 926 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 185123 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC | 0x06C92C | 0xD3FE81 |
| postInsertGate0158de | 2 | 185121 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA | 0x06C92C | 0xD3FE81 |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - | - |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D00587:0x000000->0x000001; D0058C:0x000000->0x000004; D0058D:0x000000->0x000004; D0058E:0x000000->0x000004; D00080:0x000000->0x000008 |
| 141 | 0x03FA04 | 0x03F9FA | entry-vs-previous-block | D00587:0x000001->0x000031 |
| 142 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000004->0x000031 |
| 144 | 0x03D058 | 0x03F9D8 | entry-vs-previous-block | D00080:0x000008->0x000018 |
| 3527 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000004->0x000000; D0058E:0x000004->0x000000 |
| 4123 | 0x000038 | 0x03FA09 | entry-vs-previous-block | D00587:0x000031->0x000000; D00080:0x000018->0x000010 |
| 4377 | 0x02FECF | 0x02FEAF | entry-vs-previous-block | D00080:0x000010->0x000000 |
| 4561 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x000044 |
| 14583 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16162 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 17589 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 183369 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000044->0x000000 |

## Compact Evidence

```json
{
  "completed": true,
  "candidatePass": false,
  "prestop": {
    "code": "ArrowDown",
    "pc": 6265,
    "label": "arrow-down-cleanup-prewipe-owner"
  },
  "fallbackStepCap": 190000,
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "lastPc": "0x08C331",
    "fields": {
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0xD2A83E"
    },
    "vram": 8549
  },
  "after": {
    "status": "Key: DOWN → 185503 steps (control_pre_stop, peak 76665px)",
    "lastPc": "0x08C331",
    "cpu": {
      "pc": "0x001879",
      "sp": "0xD1A87B",
      "af": "0x00EE54",
      "bc": "0x000003",
      "de": "0x000430",
      "hl": "0x000000",
      "ix": "0x000000",
      "iy": "0xD00080",
      "f": "0x54",
      "stepCount": 185503
    },
    "fields": {
      "D007CA": "0x06C92C",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x31",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0xD2A83E"
    },
    "diagnostics": {
      "D007CA": 444716,
      "D008E0": 13740131,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02590": 13893249,
      "D00595": 0,
      "D00596": 0,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 1914
      },
      "vramCurrent": 32940,
      "lastKey": {
        "code": "ArrowDown",
        "label": "DOWN",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "arrow-down-cleanup-prewipe-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 185327,
        "controlStopPc": 6265,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "steps": 185503,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 444716,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 76665,
        "vramCurrent": 32940
      }
    },
    "lastKey": {
      "code": "ArrowDown",
      "label": "DOWN",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "arrow-down-cleanup-prewipe-owner",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 185327,
      "controlStopPc": 6265,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "steps": 185503,
      "termination": "control_pre_stop",
      "wipes": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D007CA": 444716,
      "D008E0": 13740131,
      "D02590": 13893249,
      "D000C2": 0,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 76665,
      "vramCurrent": 32940
    },
    "pageErrors": []
  },
  "targetCounts": {
    "cleanup001879": 1,
    "cleanupTail0018f8": 0,
    "sentinel001c33": 926,
    "sentinel0158bc": 2,
    "postInsertGate0158de": 2,
    "low000b7c": 0,
    "coldIdle0019b5": 0
  },
  "firstSamples": {
    "sentinel001c33": {
      "block": 22,
      "pc": "0x001C33",
      "prevPc": "0x006808",
      "cpu": {
        "pc": "0x001C33",
        "sp": "0xD1A845",
        "af": "0x00090C",
        "bc": "0x09D6B4",
        "de": "0x0080C0",
        "hl": "0x020006",
        "ix": "0xD1A848",
        "iy": "0xD00080",
        "f": "0x0C",
        "stepCount": 22
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00587": "0x01",
        "D0058C": "0x04",
        "D0058D": "0x04",
        "D0058E": "0x04",
        "D00080": "0x08",
        "D000C2": "0x00",
        "D02A28": "0x00",
        "D02A29": "0x000000",
        "D02A40": "0xD2A83E"
      },
      "stackTop": [
        {
          "addr": "0xD1A845",
          "value": "0x006810"
        },
        {
          "addr": "0xD1A848",
          "value": "0xD1A860"
        },
        {
          "addr": "0xD1A84B",
          "value": "0x001727"
        },
        {
          "addr": "0xD1A84E",
          "value": "0x020000"
        },
        {
          "addr": "0xD1A851",
          "value": "0x000719"
        },
        {
          "addr": "0xD1A854",
          "value": "0xD1A8A1"
        }
      ],
      "vram": 8549
    },
    "postInsertGate0158de": {
      "block": 185121,
      "pc": "0x0158DE",
      "prevPc": "0x0013C7",
      "cpu": {
        "pc": "0x0158DE",
        "sp": "0xD1A87B",
        "af": "0x00D042",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x42",
        "stepCount": 185297
      },
      "fields": {
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x31",
        "D0058E": "0x00",
        "D00080": "0x00",
        "D000C2": "0x00",
        "D02A28": "0x00",
        "D02A29": "0x000000",
        "D02A40": "0xD2A83E"
      },
      "stackTop": [
        {
          "addr": "0xD1A87B",
          "value": "0x0013DA"
        },
        {
          "addr": "0xD1A87E",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88A",
          "value": "0x000000"
        }
      ],
      "vram": 32940
    },
    "sentinel0158bc": {
      "block": 185123,
      "pc": "0x0158BC",
      "prevPc": "0x0158E8",
      "cpu": {
        "pc": "0x0158BC",
        "sp": "0xD1A878",
        "af": "0x00D054",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x54",
        "stepCount": 185299
      },
      "fields": {
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x31",
        "D0058E": "0x00",
        "D00080": "0x00",
        "D000C2": "0x00",
        "D02A28": "0x00",
        "D02A29": "0x000000",
        "D02A40": "0xD2A83E"
      },
      "stackTop": [
        {
          "addr": "0xD1A878",
          "value": "0x0158EC"
        },
        {
          "addr": "0xD1A87B",
          "value": "0x0013DA"
        },
        {
          "addr": "0xD1A87E",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        }
      ],
      "vram": 32940
    },
    "cleanup001879": {
      "block": 185327,
      "pc": "0x001879",
      "prevPc": "0x001872",
      "cpu": {
        "pc": "0x001879",
        "sp": "0xD1A87B",
        "af": "0x00EE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x54",
        "stepCount": 185503
      },
      "fields": {
        "D007CA": "0x06C92C",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x31",
        "D0058E": "0x00",
        "D00080": "0x00",
        "D000C2": "0x00",
        "D02A28": "0x00",
        "D02A29": "0x000000",
        "D02A40": "0xD2A83E"
      },
      "stackTop": [
        {
          "addr": "0xD1A87B",
          "value": "0x0013E8"
        },
        {
          "addr": "0xD1A87E",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88A",
          "value": "0x000000"
        }
      ],
      "vram": 32940
    }
  },
  "firstCriticalZero": null,
  "first202020": null,
  "firstBlocks": [
    "0x08C331",
    "0x05C634",
    "0x000038",
    "0x0006F3",
    "0x000704",
    "0x000710",
    "0x001713",
    "0x0008BB",
    "0x001717",
    "0x001718",
    "0x00171E",
    "0x0067F8",
    "0x001C4F",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CCE",
    "0x001CD5",
    "0x001CE5",
    "0x001C54",
    "0x006808",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0"
  ],
  "lastBlocks": [
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C4A",
    "0x0158D2",
    "0x0158DA",
    "0x0158EC",
    "0x0158EE",
    "0x0158F8",
    "0x0013DA",
    "0x0013E4",
    "0x001853",
    "0x0158DE",
    "0x0158E8",
    "0x0158BC",
    "0x001C55",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C42",
    "0x001C5D",
    "0x001C5E",
    "0x001C6B",
    "0x0158C4",
    "0x0158C6",
    "0x001C4F",
    "0x001CA6",
    "0x001CBC",
    "0x001CE5",
    "0x001C54",
    "0x0158CA",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C3C",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CBC",
    "0x001CE5",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CBC",
    "0x001CE5",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CBC",
    "0x001CE5",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CBC",
    "0x001CE5",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C38",
    "0x001C44",
    "0x001C7D",
    "0x001CA6",
    "0x001CC0",
    "0x001CCA",
    "0x001CE4",
    "0x001C81",
    "0x001C82",
    "0x001C48",
    "0x001C33",
    "0x001C4A",
    "0x0158D2",
    "0x0158DA",
    "0x0158EC",
    "0x0158EE",
    "0x0158F8",
    "0x001872",
    "0x001879"
  ],
  "pageErrors": []
}
```

