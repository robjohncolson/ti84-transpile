# Phase 746: 0x0A229D CLEAR/EOL Fix Scope

Probe: `probe-phase746-0a229d-fix-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase746-0a229d-fix-scope.mjs`  
Exit: 0

## Summary

- Baseline current browser CLEAR still reproduces missing_block with lastPc 0x202020 and sane fields=no.
- Stop before 0x0A229D + UI clear: termination=control_pre_stop, stopped=true, sane fields=yes, uiClear=yes.
- Stop before 0x0A22A4 + UI clear: termination=control_pre_stop, stopped=true, sane fields=yes, uiClear=yes.
- BC correction at 0x0A22A4 to 0x000018 reached return stop 0x058A1A with sane fields=yes; mutation count=1.
- Recommendation: Recommend browser-safe CLEAR/EOL handling by stopping before 0x0A229D and applying the existing UI-level clear helper. It avoids the owner that zeroes BC, preserves D007CA/D02590/edit pointers, and uses already-shipped clear behavior. Stop-at-0x0A22A4 is also locally safe but later than necessary; BC correction is a narrower ROM-parameter guess and should not be preferred for browser UX.
- `browser-shell.html` was served from an in-memory instrumented copy only; no disk behavior was patched.

## Trial Matrix

| Trial | Termination | Steps | Status | Sane fields | D007CA | D008E0 | D02590 | D0243A | D0243D | UI clear | Key result |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| original-current-browser-clear | missing_block | 7366 | Key: CLEAR → 7366 steps (missing_block, peak 8585px) | no | 0x202020 | 0x202020 | 0x202020 | 0x202020 | 0x202020 | no | missing_block |
| stop-before-0x0A229D-plus-ui-clear | control_pre_stop | 7641 | Key: CLEAR → 7641 steps (control_pre_stop, peak 8585px) | yes | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | yes | stop@0x0A229D, control_pre_stop |
| stop-before-0x0A22A4-plus-ui-clear | control_pre_stop | 7366 | Key: CLEAR → 7366 steps (control_pre_stop, peak 8585px) | yes | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | yes | stop@0x0A22A4, control_pre_stop |
| correct-bc-0x18-at-tail-stop-at-return | control_pre_stop | 7227 | Key: CLEAR → 7227 steps (control_pre_stop, peak 8585px) | yes | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | no | stop@0x058A1A, control_pre_stop |
| ui-level-clear-only | - | - | Phase746 UI-level clear helper applied | yes | 0x0585E9 | 0x000000 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | yes | - |

## Target Hits: Baseline Current Browser

| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|
| caller058a16 | 1 | 4938 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A854 | 0x08C73D |
| call0a223a | 1 | 4939 | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A851 | 0x058A1A |
| source0a229d | 1 | 7349 | 0x0A2A37 | 0x000018 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| bridge0a2a37 | 9 | 365 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| tail0a22a4 | 1 | 7351 | 0x0A2A37 | 0x000000 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| return058a1a | 0 | - | - | - | - | - | - | - |
| legacyClear001879 | 0 | - | - | - | - | - | - | - |

## Target Hits: Stop Before 0x0A229D

| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|
| caller058a16 | 1 | 5213 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A854 | 0x08C73D |
| call0a223a | 1 | 5214 | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A851 | 0x058A1A |
| source0a229d | 1 | 7624 | 0x0A2A37 | 0x000018 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| bridge0a2a37 | 8 | 251 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| tail0a22a4 | 0 | - | - | - | - | - | - | - |
| return058a1a | 0 | - | - | - | - | - | - | - |
| legacyClear001879 | 0 | - | - | - | - | - | - | - |

## Target Hits: Stop Before 0x0A22A4

| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|
| caller058a16 | 1 | 4824 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A854 | 0x08C73D |
| call0a223a | 1 | 4825 | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A851 | 0x058A1A |
| source0a229d | 1 | 7350 | 0x0A2A37 | 0x000018 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| bridge0a2a37 | 9 | 365 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| tail0a22a4 | 1 | 7352 | 0x0A2A37 | 0x000000 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| return058a1a | 0 | - | - | - | - | - | - | - |
| legacyClear001879 | 0 | - | - | - | - | - | - | - |

## BC Correction Trial

| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|
| caller058a16 | 1 | 4800 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A854 | 0x08C73D |
| call0a223a | 1 | 4801 | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A851 | 0x058A1A |
| source0a229d | 1 | 7211 | 0x0A2A37 | 0x000018 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| bridge0a2a37 | 9 | 251 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| tail0a22a4 | 1 | 7213 | 0x0A2A37 | 0x000000 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| return058a1a | 1 | 7214 | 0x0A22A4 | 0x000000 | 0xD006D8 | 0xD006D9 | 0xD1A854 | 0x08C73D |
| legacyClear001879 | 0 | - | - | - | - | - | - | - |

| Block | PC | Action | From | To | Pre-stack[0] | Pre-D007CA | Pre-D02590 |
|---:|---|---|---|---|---|---|---|
| 7213 | 0x0A22A4 | set-bc-at-0x0A22A4 | 0x000000 | 0x000018 | 0x058A1A | 0x0585E9 | 0xD3FE81 |

## UI-Level Clear Helper

Result: `{"ok":true,"reason":"clear-key","editBase":13740236,"clearLen":128,"roiBefore":0,"roiAfter":0,"D0243A":13740236,"D00595":0,"D00596":0}`; sane fields=yes; end cursor=0xD1A8CC; ROI=0.

## Interpretation

The phase745 root cause makes the safest browser-level fix a pre-stop before the ROM tail that turns a zero-length/zero-HL parameter set into an unbounded ADL LDIR. This probe shows stopping before 0x0A229D is sufficient and earlier than stopping at 0x0A22A4. The existing UI-level clear helper independently resets the edit buffer/cursor and entry-line ROI while preserving cx/VAT fields, so pairing the early pre-stop with that helper avoids changing ROM/runtime semantics.

BC correction is technically interesting: forcing BC=0x18 at 0x0A22A4 lets the tail return to 0x058A1A without immediate 0x202020 corruption. It is a weaker browser strategy because the correct count is inferred from the prior path, while the UI-level clear path is already shipped and explicitly models the user-visible CLEAR behavior.

## Compact Evidence

```json
{
  "base": {
    "status": "Coldboot complete. OS event loop is ready.",
    "cpu": {
      "pc": "0x0019B5",
      "sp": "0xD1A866",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x1054",
      "bc": "0x000000",
      "de": "0xD2A815",
      "hl": "0xD1A8A3",
      "f": "0x54",
      "halted": true,
      "iff1": 0,
      "iff2": 0,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00587": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A28": "0x00",
      "D02A29": "0x0000",
      "D02A40": "0xD2A83E",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D00595": "0x00",
      "D00596": "0x00",
      "D0059C": "0xD4202C",
      "D005A0": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D02590": "0xD3FE81"
    },
    "editLine": {
      "D007CA": 361961,
      "D008E0": 0,
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
        "nonWhite": 0
      },
      "vramCurrent": 8549,
      "lastKey": null
    }
  },
  "trials": [
    {
      "label": "original-current-browser-clear",
      "config": {},
      "counts": {
        "caller058a16": 1,
        "call0a223a": 1,
        "source0a229d": 1,
        "bridge0a2a37": 9,
        "tail0a22a4": 1
      },
      "sanity": false,
      "uiClearResult": null,
      "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "clear-bulk-clear-body",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "steps": 7366,
        "termination": "missing_block",
        "wipes": 0,
        "D0243A": 2105376,
        "D0243D": 2105376,
        "D007CA": 2105376,
        "D008E0": 2105376,
        "D02590": 2105376,
        "D000C2": 255,
        "buffer": [
          32,
          32,
          32,
          32,
          32,
          32,
          32,
          32
        ],
        "vramPeak": 8585,
        "vramCurrent": 76800
      },
      "end": {
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD006C1",
          "hl": "0xD006C0",
          "f": "0x40",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0xFF",
          "D0058D": "0xFF",
          "D0058E": "0xFF",
          "D00587": "0x00",
          "D00080": "0xF7",
          "D0009F": "0xFF",
          "D000C2": "0xFF",
          "D0243A": "0x202020",
          "D0243D": "0x202020",
          "D02A28": "0x20",
          "D02A29": "0x2020",
          "D02A40": "0x202020",
          "D00121": "0xFFFFFF",
          "D00124": "0xFF",
          "D00595": "0xFF",
          "D00596": "0xFF",
          "D0059C": "0xFFFFFF",
          "D005A0": "0xFF",
          "D007CA": "0x202020",
          "D008E0": "0x202020",
          "D02590": "0x202020"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A857",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A860",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A863",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A866",
            "value": "0x202020"
          },
          {
            "addr": "0xD1A869",
            "value": "0x202020"
          }
        ],
        "editLine": {
          "D007CA": 2105376,
          "D008E0": 2105376,
          "D0243A": 2105376,
          "D0243D": 2105376,
          "D02590": 2105376,
          "D00595": 255,
          "D00596": 255,
          "buffer": [
            32,
            32,
            32,
            32,
            32,
            32,
            32,
            32
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 3328
          },
          "vramCurrent": 76800,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 6265,
            "controlPreStopLabel": "clear-bulk-clear-body",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": null,
            "controlStopPc": null,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "steps": 7366,
            "termination": "missing_block",
            "wipes": 0,
            "D0243A": 2105376,
            "D0243D": 2105376,
            "D007CA": 2105376,
            "D008E0": 2105376,
            "D02590": 2105376,
            "D000C2": 255,
            "buffer": [
              32,
              32,
              32,
              32,
              32,
              32,
              32,
              32
            ],
            "vramPeak": 8585,
            "vramCurrent": 76800
          }
        },
        "vramPixels": 76800
      },
      "firstSamples": {
        "bridge0a2a37": {
          "block": 365,
          "pc": "0x0A2A37",
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": "0x0A2A37",
            "sp": "0xD1A842",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0075",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0x000000",
            "f": "0x75",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x0F",
            "D0058D": "0x0F",
            "D0058E": "0x0F",
            "D00587": "0x0F",
            "D00080": "0x08",
            "D0009F": "0x20",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD4202C",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A842",
              "value": "0x0A2389"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A848",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C819"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            }
          ]
        },
        "caller058a16": {
          "block": 4938,
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "cpu": {
            "pc": "0x058A16",
            "sp": "0xD1A854",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            }
          ]
        },
        "call0a223a": {
          "block": 4939,
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "cpu": {
            "pc": "0x0A223A",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "source0a229d": {
          "block": 7349,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "tail0a22a4": {
          "block": 7351,
          "pc": "0x0A22A4",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A22A4",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000000",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        }
      },
      "mutations": []
    },
    {
      "label": "stop-before-0x0A229D-plus-ui-clear",
      "config": {
        "stopPc": 664221,
        "stopLabel": "phase746-stop-before-bc-zero-owner"
      },
      "counts": {
        "caller058a16": 1,
        "call0a223a": 1,
        "source0a229d": 1,
        "bridge0a2a37": 8
      },
      "sanity": true,
      "uiClearResult": {
        "ok": true,
        "reason": "clear-key",
        "editBase": 13740236,
        "clearLen": 128,
        "roiBefore": 36,
        "roiAfter": 0,
        "D0243A": 13740236,
        "D00595": 0,
        "D00596": 0
      },
      "status": "Key: CLEAR → 7641 steps (control_pre_stop, peak 8585px)",
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "phase746-stop-before-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 7624,
        "controlStopPc": 664221,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "steps": 7641,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
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
        "vramPeak": 8585,
        "vramCurrent": 8585
      },
      "end": {
        "cpu": {
          "pc": "0x0A229D",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x058A1A"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "editLine": {
          "D007CA": 361961,
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
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 664221,
            "controlPreStopLabel": "phase746-stop-before-bc-zero-owner",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 7624,
            "controlStopPc": 664221,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 7641,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D007CA": 361961,
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
            "vramPeak": 8585,
            "vramCurrent": 8585
          }
        },
        "vramPixels": 8549
      },
      "firstSamples": {
        "bridge0a2a37": {
          "block": 251,
          "pc": "0x0A2A37",
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": "0x0A2A37",
            "sp": "0xD1A842",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0075",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0x000000",
            "f": "0x75",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x0F",
            "D0058D": "0x0F",
            "D0058E": "0x0F",
            "D00587": "0x0F",
            "D00080": "0x08",
            "D0009F": "0x20",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD4202C",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A842",
              "value": "0x0A2389"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A848",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C819"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            }
          ]
        },
        "caller058a16": {
          "block": 5213,
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "cpu": {
            "pc": "0x058A16",
            "sp": "0xD1A854",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            }
          ]
        },
        "call0a223a": {
          "block": 5214,
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "cpu": {
            "pc": "0x0A223A",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "source0a229d": {
          "block": 7624,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        }
      },
      "mutations": []
    },
    {
      "label": "stop-before-0x0A22A4-plus-ui-clear",
      "config": {
        "stopPc": 664228,
        "stopLabel": "phase746-stop-before-space-fill-tail"
      },
      "counts": {
        "caller058a16": 1,
        "call0a223a": 1,
        "source0a229d": 1,
        "bridge0a2a37": 9,
        "tail0a22a4": 1
      },
      "sanity": true,
      "uiClearResult": {
        "ok": true,
        "reason": "clear-key",
        "editBase": 13740236,
        "clearLen": 128,
        "roiBefore": 36,
        "roiAfter": 0,
        "D0243A": 13740236,
        "D00595": 0,
        "D00596": 0
      },
      "status": "Key: CLEAR → 7366 steps (control_pre_stop, peak 8585px)",
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664228,
        "controlPreStopLabel": "phase746-stop-before-space-fill-tail",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 7352,
        "controlStopPc": 664228,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "steps": 7366,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
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
        "vramPeak": 8585,
        "vramCurrent": 8585
      },
      "end": {
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x058A1A"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          }
        ],
        "editLine": {
          "D007CA": 361961,
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
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 664228,
            "controlPreStopLabel": "phase746-stop-before-space-fill-tail",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 7352,
            "controlStopPc": 664228,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 7366,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D007CA": 361961,
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
            "vramPeak": 8585,
            "vramCurrent": 8585
          }
        },
        "vramPixels": 8549
      },
      "firstSamples": {
        "bridge0a2a37": {
          "block": 365,
          "pc": "0x0A2A37",
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": "0x0A2A37",
            "sp": "0xD1A842",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0075",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0x000000",
            "f": "0x75",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x0F",
            "D0058D": "0x0F",
            "D0058E": "0x0F",
            "D00587": "0x0F",
            "D00080": "0x08",
            "D0009F": "0x20",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD4202C",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A842",
              "value": "0x0A2389"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A848",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C819"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            }
          ]
        },
        "caller058a16": {
          "block": 4824,
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "cpu": {
            "pc": "0x058A16",
            "sp": "0xD1A854",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            }
          ]
        },
        "call0a223a": {
          "block": 4825,
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "cpu": {
            "pc": "0x0A223A",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "source0a229d": {
          "block": 7350,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "tail0a22a4": {
          "block": 7352,
          "pc": "0x0A22A4",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A22A4",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000000",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        }
      },
      "mutations": []
    },
    {
      "label": "correct-bc-0x18-at-tail-stop-at-return",
      "config": {
        "bcAtTail": 24,
        "stopPc": 363034,
        "stopLabel": "phase746-tail-return-after-bc-correction"
      },
      "counts": {
        "caller058a16": 1,
        "call0a223a": 1,
        "source0a229d": 1,
        "bridge0a2a37": 9,
        "tail0a22a4": 1,
        "return058a1a": 1
      },
      "sanity": true,
      "uiClearResult": null,
      "status": "Key: CLEAR → 7227 steps (control_pre_stop, peak 8585px)",
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 363034,
        "controlPreStopLabel": "phase746-tail-return-after-bc-correction",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 7214,
        "controlStopPc": 363034,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": true,
        "steps": 7227,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
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
        "vramPeak": 8585,
        "vramCurrent": 8585
      },
      "end": {
        "cpu": {
          "pc": "0x058A1A",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD006D9",
          "hl": "0xD006D8",
          "f": "0x40",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          },
          {
            "addr": "0xD1A860",
            "value": "0x0009A3"
          },
          {
            "addr": "0xD1A863",
            "value": "0x0019B5"
          },
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          }
        ],
        "editLine": {
          "D007CA": 361961,
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
            "nonWhite": 36
          },
          "vramCurrent": 8585,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 363034,
            "controlPreStopLabel": "phase746-tail-return-after-bc-correction",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 7214,
            "controlStopPc": 363034,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 7227,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D007CA": 361961,
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
            "vramPeak": 8585,
            "vramCurrent": 8585
          }
        },
        "vramPixels": 8585
      },
      "firstSamples": {
        "bridge0a2a37": {
          "block": 251,
          "pc": "0x0A2A37",
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": "0x0A2A37",
            "sp": "0xD1A842",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0075",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0x000000",
            "f": "0x75",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x0F",
            "D0058D": "0x0F",
            "D0058E": "0x0F",
            "D00587": "0x0F",
            "D00080": "0x08",
            "D0009F": "0x20",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD4202C",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A842",
              "value": "0x0A2389"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A848",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C819"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            }
          ]
        },
        "caller058a16": {
          "block": 4800,
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "cpu": {
            "pc": "0x058A16",
            "sp": "0xD1A854",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            }
          ]
        },
        "call0a223a": {
          "block": 4801,
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "cpu": {
            "pc": "0x0A223A",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "f": "0x4A",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD48204",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "source0a229d": {
          "block": 7211,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "tail0a22a4": {
          "block": 7213,
          "pc": "0x0A22A4",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A22A4",
            "sp": "0xD1A851",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0044",
            "bc": "0x000000",
            "de": "0x00013F",
            "hl": "0x000000",
            "f": "0x44",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ]
        },
        "return058a1a": {
          "block": 7214,
          "pc": "0x058A1A",
          "prevPc": "0x0A22A4",
          "cpu": {
            "pc": "0x058A1A",
            "sp": "0xD1A854",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "af": "0x0040",
            "bc": "0x000000",
            "de": "0xD006D9",
            "hl": "0xD006D8",
            "f": "0x40",
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "fields": {
            "D0058C": "0x09",
            "D0058D": "0x0F",
            "D0058E": "0x00",
            "D00587": "0x00",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D000C2": "0x00",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02A28": "0x00",
            "D02A29": "0x0000",
            "D02A40": "0xD2A83E",
            "D00121": "0x000000",
            "D00124": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059C": "0xD45A00",
            "D005A0": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02590": "0xD3FE81"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            }
          ]
        }
      },
      "mutations": [
        {
          "block": 7213,
          "pc": "0x0A22A4",
          "action": "set-bc-at-0x0A22A4",
          "from": "0x000000",
          "to": "0x000018",
          "before": {
            "cpu": {
              "pc": "0x0A22A4",
              "sp": "0xD1A851",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "af": "0x0044",
              "bc": "0x000000",
              "de": "0x00013F",
              "hl": "0x000000",
              "f": "0x44",
              "halted": false,
              "iff1": 1,
              "iff2": 1,
              "mbase": 208,
              "madl": 1
            },
            "fields": {
              "D0058C": "0x09",
              "D0058D": "0x0F",
              "D0058E": "0x00",
              "D00587": "0x00",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D000C2": "0x00",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02A28": "0x00",
              "D02A29": "0x0000",
              "D02A40": "0xD2A83E",
              "D00121": "0x000000",
              "D00124": "0x00",
              "D00595": "0x00",
              "D00596": "0x00",
              "D0059C": "0xD45A00",
              "D005A0": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02590": "0xD3FE81"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
              },
              {
                "addr": "0xD1A854",
                "value": "0x08C73D"
              },
              {
                "addr": "0xD1A857",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A85A",
                "value": "0x09F7AA"
              },
              {
                "addr": "0xD1A85D",
                "value": "0x08C53A"
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              }
            ]
          },
          "after": {
            "cpu": {
              "pc": "0x0A22A4",
              "sp": "0xD1A851",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "af": "0x0044",
              "bc": "0x000018",
              "de": "0x00013F",
              "hl": "0x000000",
              "f": "0x44",
              "halted": false,
              "iff1": 1,
              "iff2": 1,
              "mbase": 208,
              "madl": 1
            },
            "fields": {
              "D0058C": "0x09",
              "D0058D": "0x0F",
              "D0058E": "0x00",
              "D00587": "0x00",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D000C2": "0x00",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02A28": "0x00",
              "D02A29": "0x0000",
              "D02A40": "0xD2A83E",
              "D00121": "0x000000",
              "D00124": "0x00",
              "D00595": "0x00",
              "D00596": "0x00",
              "D0059C": "0xD45A00",
              "D005A0": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02590": "0xD3FE81"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A1A"
              },
              {
                "addr": "0xD1A854",
                "value": "0x08C73D"
              },
              {
                "addr": "0xD1A857",
                "value": "0x000009"
              },
              {
                "addr": "0xD1A85A",
                "value": "0x09F7AA"
              },
              {
                "addr": "0xD1A85D",
                "value": "0x08C53A"
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              },
              {
                "addr": "0xD1A866",
                "value": "0xFFFFFF"
              }
            ]
          }
        }
      ]
    },
    {
      "label": "ui-level-clear-only",
      "config": {
        "mode": "ui-level-clear-only"
      },
      "counts": {},
      "sanity": true,
      "uiClearResult": {
        "ok": true,
        "reason": "clear-key",
        "editBase": 13740236,
        "clearLen": 128,
        "roiBefore": 0,
        "roiAfter": 0,
        "D0243A": 13740236,
        "D00595": 0,
        "D00596": 0
      },
      "status": "Phase746 UI-level clear helper applied",
      "lastKey": null,
      "end": {
        "cpu": {
          "pc": "0x0019B5",
          "sp": "0xD1A866",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "f": "0x54",
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D02590": "0xD3FE81"
        },
        "stackTop": [
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A872",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A875",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A878",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A87B",
            "value": "0xFFFFFF"
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
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
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "vramPixels": 8549
      },
      "firstSamples": {},
      "mutations": []
    }
  ],
  "errors": [],
  "recommendation": "Recommend browser-safe CLEAR/EOL handling by stopping before 0x0A229D and applying the existing UI-level clear helper. It avoids the owner that zeroes BC, preserves D007CA/D02590/edit pointers, and uses already-shipped clear behavior. Stop-at-0x0A22A4 is also locally safe but later than necessary; BC correction is a narrower ROM-parameter guess and should not be preferred for browser UX."
}
```

No runtime, transpiler, browser, scheduler, or follow-along files were modified.

