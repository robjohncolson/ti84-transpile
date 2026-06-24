# Phase 750 Browser F4 Corruption Trace

Probe: `probe-phase819-browser-f4-corruption-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase819-browser-f4-corruption-trace.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `F4`, and records the pre-`missing_block` route plus field/stack corruption signals.

No disk browser/runtime/transpiler behavior is patched by this probe.

## Result

- F4 no longer ends at 0x202020; final lastPc=0x0A255F, termination=max_steps.
- Final key state: termination=max_steps, steps=40000, lastPc=0x0A255F, final cpu.pc=0x0A2588.
- Base was sane before key: D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CC, lastPc=0x08C331.
- First 0x202020 signal: none during observed blocks.
- CDP/page errors: 0.

## Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|---|
| eolCaller058a16 | 0 | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 3 | 572 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| enterClear0a2150 | 0 | - | - | - | - | - | - | - | - |
| tokenOuter08f3b8 | 0 | - | - | - | - | - | - | - | - |
| tokenTuple08f54b | 0 | - | - | - | - | - | - | - | - |
| tokenExit08f5e1 | 0 | - | - | - | - | - | - | - | - |
| tokenGate090992 | 0 | - | - | - | - | - | - | - | - |
| cleanup001879 | 0 | - | - | - | - | - | - | - | - |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - |
| postInsertGate0158de | 0 | - | - | - | - | - | - | - | - |
| postInsertReturn0013da | 0 | - | - | - | - | - | - | - | - |
| low000a92 | 0 | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - |
| low006d5d | 0 | - | - | - | - | - | - | - | - |
| display09efde | 1788 | 2590 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A830 | 0x00012B |

## Tail Snapshots

| Block | Step | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 | D0243A |
|---:|---:|---|---|---|---|---|---|---|---|---|---|
| 39847 | 39976 | 0x0A26B4 | 0x0A269A | 0x000000 | 0xD40E4A | 0xD00008 | 0xD1A82A | 0x000708 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39848 | 39977 | 0x0A2537 | 0x0A26B4 | 0x000608 | 0xD410BA | 0xD00008 | 0xD1A82D | 0xD026BB | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39849 | 39978 | 0x0A2548 | 0x0A2537 | 0x000808 | 0xD410BA | 0xD08008 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39850 | 39979 | 0x0A254F | 0x0A2548 | 0x0008CC | 0xD410BA | 0xD08008 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39851 | 39980 | 0x0A2555 | 0x0A254F | 0x0008CC | 0xD410BA | 0xD08008 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39852 | 39981 | 0x0A2572 | 0x0A2555 | 0x000898 | 0xD410BA | 0xD08008 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39853 | 39982 | 0x0A2588 | 0x0A2572 | 0x000204 | 0xD05651 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39854 | 39983 | 0x0A255F | 0x0A2588 | 0x000798 | 0xD410BC | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39855 | 39984 | 0x0A2572 | 0x0A255F | 0x000730 | 0xD410BC | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39856 | 39985 | 0x0A2588 | 0x0A2572 | 0x000104 | 0xD05651 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39857 | 39986 | 0x0A255F | 0x0A2588 | 0x000630 | 0xD410BE | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39858 | 39987 | 0x0A2563 | 0x0A255F | 0x000660 | 0xD410BE | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39859 | 39988 | 0x0A257E | 0x0A2563 | 0x000104 | 0xD05651 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39860 | 39989 | 0x0A2585 | 0x0A257E | 0x000004 | 0xD05651 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39861 | 39990 | 0x0A255F | 0x0A2585 | 0x000560 | 0xD410C0 | 0x0052AA | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39862 | 39991 | 0x0A2563 | 0x0A255F | 0x0005C0 | 0xD410C0 | 0x0052AA | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39863 | 39992 | 0x0A257E | 0x0A2563 | 0x008004 | 0xD05652 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39864 | 39993 | 0x0A2588 | 0x0A257E | 0x004004 | 0xD05652 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39865 | 39994 | 0x0A255F | 0x0A2588 | 0x0004C0 | 0xD410C2 | 0x0052AA | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39866 | 39995 | 0x0A2572 | 0x0A255F | 0x000480 | 0xD410C2 | 0x0052AA | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39867 | 39996 | 0x0A2588 | 0x0A2572 | 0x002004 | 0xD05652 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39868 | 39997 | 0x0A255F | 0x0A2588 | 0x000380 | 0xD410C4 | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39869 | 39998 | 0x0A2572 | 0x0A255F | 0x000300 | 0xD410C4 | 0x00FFFF | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |
| 39870 | 39999 | 0x0A2588 | 0x0A2572 | 0x001004 | 0xD05652 | 0xD05651 | 0xD1A827 | 0xD08008 | 0x06C92C | 0xD3FE81 | 0xD1A8CC |

## Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D00587:0x000000->0x000032; D0058C:0x000000->0x00005A; D0058D:0x000000->0x00005A; D0058E:0x000000->0x00005A; D00080:0x000000->0x000008; D0009F:0x000000->0x000020 |
| 142 | 0x03FA04 | 0x03F9FA | entry-vs-previous-block | D00587:0x000032->0x000002 |
| 143 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x00005A->0x000002 |
| 145 | 0x03D058 | 0x03F9D8 | entry-vs-previous-block | D00080:0x000008->0x000018 |
| 1151 | 0x08C366 | 0x08C34F | entry-vs-previous-block | D0009F:0x000020->0x000000 |
| 11387 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 12982 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 14974 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |

## Compact Evidence

```json
{
  "finding": "F4 no longer ends at 0x202020; final lastPc=0x0A255F, termination=max_steps.",
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
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00"
    },
    "vram": 8549
  },
  "after": {
    "status": "Key: TRACE → 40000 steps (max_steps, peak 8585px)",
    "lastPc": "0x0A255F",
    "cpu": {
      "pc": "0x0A2588",
      "sp": "0xD1A827",
      "af": "0x006100",
      "bc": "0x000200",
      "de": "0x00FFFF",
      "hl": "0xD410C6",
      "ix": "0xD005CD",
      "iy": "0xD00080",
      "f": "0x00",
      "stepCount": 39999
    },
    "fields": {
      "D007CA": "0x06C92C",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D00587": "0x00",
      "D0058C": "0x5A",
      "D0058D": "0x02",
      "D0058E": "0x5A",
      "D00080": "0x10",
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D02A28": "0x00",
      "D02A29": "0x000000",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00"
    },
    "lastKey": {
      "code": "F4",
      "label": "TRACE",
      "expectedInsertByte": null,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 40000,
      "termination": "max_steps",
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
      "vramPeak": 8585,
      "vramCurrent": 8585
    },
    "stackTop": [
      {
        "addr": "0xD1A827",
        "value": "0xD08008"
      },
      {
        "addr": "0xD1A82A",
        "value": "0x000608"
      },
      {
        "addr": "0xD1A82D",
        "value": "0xD026BB"
      },
      {
        "addr": "0xD1A830",
        "value": "0x00A01E"
      },
      {
        "addr": "0xD1A833",
        "value": "0x000002"
      },
      {
        "addr": "0xD1A836",
        "value": "0x08BD13"
      },
      {
        "addr": "0xD1A839",
        "value": "0x000044"
      },
      {
        "addr": "0xD1A83C",
        "value": "0x00E947"
      }
    ]
  },
  "record": {
    "totalBlocks": 39870,
    "regionCounts": {
      "near0a2100_0a23ff": 174,
      "token08f000_090fff": 0,
      "low000000_006fff": 15099,
      "cleanup001000_001fff": 9392,
      "display09e000_0a2fff": 16530
    },
    "targetCounts": {
      "spaceFillBridge0a2a37": 3,
      "display09efde": 1788
    },
    "firstSamples": {
      "spaceFillBridge0a2a37": {
        "block": 572,
        "step": 574,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A842",
          "af": "0x000075",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x75",
          "stepCount": 574
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
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
        ],
        "windows": {
          "aroundSp": {
            "start": "0xD1A82A",
            "ascii": "............?..T...h.`...#.......u........`.....",
            "bytes": [
              "0x02",
              "0x00",
              "0x00",
              "0x02",
              "0x00",
              "0x00",
              "0x02",
              "0x00",
              "0x00",
              "0x01",
              "0x00",
              "0x00",
              "0x3F",
              "0xA8",
              "0xD1",
              "0x54",
              "0x1C",
              "0x00",
              "0x16",
              "0x68",
              "0x00",
              "0x60",
              "0xA8",
              "0xD1",
              "0x89",
              "0x23",
              "0x0A",
              "0x15",
              "0xA8",
              "0xD2",
              "0x00",
              "0x00",
              "0x00",
              "0x75",
              "0x00",
              "0x00",
              "0x19",
              "0xC8",
              "0x05",
              "0x00",
              "0x00",
              "0x00",
              "0x60",
              "0xA8",
              "0xD1",
              "0xFF",
              "0xFF",
              "0x00"
            ]
          },
          "aroundHl": {
            "start": "0xFFFFE8",
            "ascii": "..................@.......~[.X....~[......~[....",
            "bytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x1C",
              "0x00",
              "0x00",
              "0xB3",
              "0x40",
              "0xD1",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0xF3",
              "0xED",
              "0x7E",
              "0x5B",
              "0xC3",
              "0x58",
              "0x06",
              "0x00",
              "0xF3",
              "0xED",
              "0x7E",
              "0x5B",
              "0xC3",
              "0xFA",
              "0x1A",
              "0x00",
              "0xF3",
              "0xED",
              "0x7E",
              "0x5B",
              "0xC3",
              "0x10",
              "0x01",
              "0x02"
            ]
          },
          "aroundDe": {
            "start": "0xD2A7FD",
            "ascii": "................................................",
            "bytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x1F",
              "0x00",
              "0x00",
              "0x01",
              "0x00",
              "0x0E",
              "0x00",
              "0x0C",
              "0x00",
              "0x07",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x01",
              "0x00",
              "0x01",
              "0x00"
            ]
          },
          "D006C0": {
            "start": "0xD006A0",
            "ascii": "................................................................"
          },
          "D1A840": {
            "start": "0xD1A820",
            "ascii": ".......0..............?..T...h.`...#.......u........`..........."
          }
        }
      },
      "display09efde": {
        "block": 2590,
        "step": 2596,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFB7",
        "cpu": {
          "pc": "0x09EFDE",
          "sp": "0xD1A830",
          "af": "0x000C85",
          "bc": "0x009595",
          "de": "0x0052AA",
          "hl": "0xD42304",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x85",
          "stepCount": 2596
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x00012B"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000C18"
          },
          {
            "addr": "0xD1A836",
            "value": "0x000E19"
          },
          {
            "addr": "0xD1A839",
            "value": "0x00012C"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000045"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A845",
            "value": "0x055CDA"
          }
        ],
        "windows": {
          "aroundSp": {
            "start": "0xD1A818",
            "ascii": "......'..T...h....p.....+........,.....E..`...\\.",
            "bytes": [
              "0x02",
              "0x00",
              "0x00",
              "0x01",
              "0x00",
              "0x00",
              "0x27",
              "0xA8",
              "0xD1",
              "0x54",
              "0x1C",
              "0x00",
              "0x16",
              "0x68",
              "0x00",
              "0x80",
              "0x11",
              "0x00",
              "0x70",
              "0xEF",
              "0x09",
              "0x02",
              "0x00",
              "0x00",
              "0x2B",
              "0x01",
              "0x00",
              "0x18",
              "0x0C",
              "0x00",
              "0x19",
              "0x0E",
              "0x00",
              "0x2C",
              "0x01",
              "0x00",
              "0x02",
              "0x00",
              "0x00",
              "0x45",
              "0x00",
              "0x00",
              "0x60",
              "0xA8",
              "0xD1",
              "0xDA",
              "0x5C",
              "0x05"
            ]
          },
          "aroundHl": {
            "start": "0xD422EC",
            "ascii": ".R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R.R",
            "bytes": [
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52",
              "0xAA",
              "0x52"
            ]
          },
          "aroundDe": {
            "start": "0x005292",
            "ascii": "0.0.0.0.0.0.0.0.8.8.....0.8..........`0``0`0....",
            "bytes": [
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x30",
              "0x00",
              "0x38",
              "0xE0",
              "0x38",
              "0xE0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x30",
              "0x00",
              "0x38",
              "0x00",
              "0x18",
              "0x80",
              "0x08",
              "0x80",
              "0x08",
              "0xC0",
              "0x18",
              "0xC0",
              "0x18",
              "0x60",
              "0x30",
              "0x60",
              "0x60",
              "0x30",
              "0x60",
              "0x30",
              "0xC0",
              "0x18",
              "0xC0",
              "0x18"
            ]
          },
          "D006C0": {
            "start": "0xD006A0",
            "ascii": "................................................................"
          },
          "D1A840": {
            "start": "0xD1A820",
            "ascii": ".T...h....p.....+........,.....E..`...\\........R..........DZ..D."
          }
        }
      }
    },
    "first202020": null,
    "firstFieldZero": null,
    "hotBlocks": [
      {
        "pc": "0x0A2588",
        "count": 2351
      },
      {
        "pc": "0x0A255F",
        "count": 2351
      },
      {
        "pc": "0x0A2563",
        "count": 1839
      },
      {
        "pc": "0x0A257E",
        "count": 1839
      },
      {
        "pc": "0x09EFDE",
        "count": 1788
      },
      {
        "pc": "0x003D28",
        "count": 847
      },
      {
        "pc": "0x003D25",
        "count": 847
      },
      {
        "pc": "0x0A2572",
        "count": 843
      },
      {
        "pc": "0x001CA6",
        "count": 795
      },
      {
        "pc": "0x001CC0",
        "count": 783
      },
      {
        "pc": "0x001CCA",
        "count": 783
      },
      {
        "pc": "0x001C33",
        "count": 665
      },
      {
        "pc": "0x001C38",
        "count": 665
      },
      {
        "pc": "0x001C3C",
        "count": 653
      },
      {
        "pc": "0x001CE4",
        "count": 653
      },
      {
        "pc": "0x001C44",
        "count": 532
      },
      {
        "pc": "0x001C7D",
        "count": 532
      },
      {
        "pc": "0x001C81",
        "count": 532
      },
      {
        "pc": "0x001C82",
        "count": 532
      },
      {
        "pc": "0x001C48",
        "count": 532
      },
      {
        "pc": "0x0A3404",
        "count": 504
      },
      {
        "pc": "0x0A3411",
        "count": 484
      },
      {
        "pc": "0x0A2548",
        "count": 403
      },
      {
        "pc": "0x0A254F",
        "count": 403
      },
      {
        "pc": "0x0A258B",
        "count": 402
      },
      {
        "pc": "0x0A2695",
        "count": 402
      },
      {
        "pc": "0x0A2555",
        "count": 331
      },
      {
        "pc": "0x0A2585",
        "count": 331
      },
      {
        "pc": "0x0A269A",
        "count": 330
      },
      {
        "pc": "0x0A26B4",
        "count": 330
      },
      {
        "pc": "0x0A2537",
        "count": 303
      },
      {
        "pc": "0x0A3408",
        "count": 272
      },
      {
        "pc": "0x001C4F",
        "count": 263
      },
      {
        "pc": "0x001C54",
        "count": 263
      },
      {
        "pc": "0x0A19A4",
        "count": 224
      },
      {
        "pc": "0x0A3418",
        "count": 168
      },
      {
        "pc": "0x001CE5",
        "count": 142
      },
      {
        "pc": "0x001C42",
        "count": 133
      },
      {
        "pc": "0x000038",
        "count": 130
      },
      {
        "pc": "0x0006F3",
        "count": 130
      }
    ],
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
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C54",
      "0x006816",
      "0x00681E",
      "0x006828",
      "0x001727",
      "0x000719",
      "0x00071D",
      "0x02010C",
      "0x03CF7D",
      "0x03CFA4",
      "0x03CFCF",
      "0x03CFD4",
      "0x03CFDB",
      "0x03CFE0",
      "0x03CFE5",
      "0x03CFEA",
      "0x03D029",
      "0x03D033",
      "0x03D038",
      "0x03D044",
      "0x03D04C",
      "0x03D054",
      "0x03F994",
      "0x0003D4",
      "0x003CC2",
      "0x003CD4",
      "0x003CE0",
      "0x003CEE",
      "0x003CF3",
      "0x003CF7",
      "0x003D09",
      "0x003D11",
      "0x003D1C",
      "0x003D21",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D2E",
      "0x003D31",
      "0x003D25",
      "0x003D34",
      "0x003D36",
      "0x003D3D",
      "0x003D40",
      "0x003D45",
      "0x03F998",
      "0x03F99A",
      "0x03F9A5",
      "0x03F9B1",
      "0x03F9D1",
      "0x03F9FA",
      "0x03FA04",
      "0x03F9D5",
      "0x03F9D8",
      "0x03D058",
      "0x03D060",
      "0x03D0E0",
      "0x05C67C",
      "0x08C339",
      "0x06CE73",
      "0x06CE7F",
      "0x06CE7B",
      "0x06C8AB",
      "0x08C33D",
      "0x0A349A",
      "0x0A349F",
      "0x0A32F9",
      "0x0A3301",
      "0x08C308",
      "0x0A331E"
    ],
    "lastBlocks": [
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A26C7",
      "0x0A26D2",
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
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C54",
      "0x006816",
      "0x00681E",
      "0x006828",
      "0x001727",
      "0x000719",
      "0x00071D",
      "0x02010C",
      "0x03CF7D",
      "0x03CFA4",
      "0x03CFCF",
      "0x03CFD4",
      "0x03CFDB",
      "0x03CFE0",
      "0x03CFE5",
      "0x03CFEA",
      "0x03D029",
      "0x03D033",
      "0x03D038",
      "0x03D044",
      "0x03D1C3",
      "0x03D04C",
      "0x03D054",
      "0x03F994",
      "0x0003D4",
      "0x003CC2",
      "0x003CD4",
      "0x003CE0",
      "0x003CEE",
      "0x003CF3",
      "0x003CF7",
      "0x003D09",
      "0x003D11",
      "0x003D1C",
      "0x003D21",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D25",
      "0x003D28",
      "0x003D2E",
      "0x003D31",
      "0x003D25",
      "0x003D34",
      "0x003D36",
      "0x003D3D",
      "0x003D40",
      "0x003D45",
      "0x03F998",
      "0x03F99A",
      "0x03F9AB",
      "0x03F9B1",
      "0x03F9B8",
      "0x03F9BA",
      "0x03F9BE",
      "0x03F9C2",
      "0x03F9C5",
      "0x03D058",
      "0x03D060",
      "0x03D0E0",
      "0x0A2725",
      "0x0A271C",
      "0x0A2721",
      "0x0A23E5",
      "0x0A23F3",
      "0x0A23C0",
      "0x0A23C7",
      "0x0A23DC",
      "0x0A5424",
      "0x0A5439",
      "0x0A23E4",
      "0x0A2400",
      "0x0A2449",
      "0x04C979",
      "0x0A2451",
      "0x0A2457",
      "0x0A246B",
      "0x0A2471",
      "0x0A247D",
      "0x0A2493",
      "0x0A249E",
      "0x0A24A6",
      "0x0A24AC",
      "0x0A24C8",
      "0x0A24E4",
      "0x0A24EB",
      "0x0A24F8",
      "0x0A24FD",
      "0x0A2507",
      "0x0A1A9D",
      "0x08C308",
      "0x0A1AA8",
      "0x0A1AB3",
      "0x0A1AC6",
      "0x0A2515",
      "0x0A1B1C",
      "0x0A1B22",
      "0x0A1B57",
      "0x0A2528",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2585",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2585",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A258B",
      "0x0A2695",
      "0x0A269A",
      "0x0A26B4",
      "0x0A2537",
      "0x0A2548",
      "0x0A254F",
      "0x0A2555",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2585",
      "0x0A255F",
      "0x0A2563",
      "0x0A257E",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588",
      "0x0A255F",
      "0x0A2572",
      "0x0A2588"
    ],
    "tailSnapshots": [
      {
        "block": 39839,
        "step": 39968,
        "pc": "0x0A2588",
        "prevPc": "0x0A257E",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x006108",
          "bc": "0x000804",
          "de": "0xD05629",
          "hl": "0xD0562A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x08",
          "stepCount": 39968
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39840,
        "step": 39969,
        "pc": "0x0A255F",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x006108",
          "bc": "0x000100",
          "de": "0x0052AA",
          "hl": "0xD40E48",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x08",
          "stepCount": 39969
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39841,
        "step": 39970,
        "pc": "0x0A2563",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2563",
          "sp": "0xD1A827",
          "af": "0x006144",
          "bc": "0x000100",
          "de": "0x0052AA",
          "hl": "0xD40E48",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 39970
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39842,
        "step": 39971,
        "pc": "0x0A257E",
        "prevPc": "0x0A2563",
        "cpu": {
          "pc": "0x0A257E",
          "sp": "0xD1A827",
          "af": "0x006120",
          "bc": "0x000804",
          "de": "0xD05629",
          "hl": "0xD0562A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x20",
          "stepCount": 39971
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39843,
        "step": 39972,
        "pc": "0x0A2588",
        "prevPc": "0x0A257E",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x000404",
          "de": "0xD05629",
          "hl": "0xD0562A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39972
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39844,
        "step": 39973,
        "pc": "0x0A258B",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A258B",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x000000",
          "de": "0x0052AA",
          "hl": "0xD40E4A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39973
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39845,
        "step": 39974,
        "pc": "0x0A2695",
        "prevPc": "0x0A258B",
        "cpu": {
          "pc": "0x0A2695",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x000000",
          "de": "0x0052AA",
          "hl": "0xD40E4A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39974
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39846,
        "step": 39975,
        "pc": "0x0A269A",
        "prevPc": "0x0A2695",
        "cpu": {
          "pc": "0x0A269A",
          "sp": "0xD1A82A",
          "af": "0x006190",
          "bc": "0x000000",
          "de": "0xD08008",
          "hl": "0xD40E4A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x90",
          "stepCount": 39975
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x0A2725"
          }
        ],
        "windows": null
      },
      {
        "block": 39847,
        "step": 39976,
        "pc": "0x0A26B4",
        "prevPc": "0x0A269A",
        "cpu": {
          "pc": "0x0A26B4",
          "sp": "0xD1A82A",
          "af": "0x000044",
          "bc": "0x000000",
          "de": "0xD00008",
          "hl": "0xD40E4A",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x44",
          "stepCount": 39976
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x000708"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x0A2725"
          }
        ],
        "windows": null
      },
      {
        "block": 39848,
        "step": 39977,
        "pc": "0x0A2537",
        "prevPc": "0x0A26B4",
        "cpu": {
          "pc": "0x0A2537",
          "sp": "0xD1A82D",
          "af": "0x000002",
          "bc": "0x000608",
          "de": "0xD00008",
          "hl": "0xD410BA",
          "ix": "0xD005CC",
          "iy": "0xD00080",
          "f": "0x02",
          "stepCount": 39977
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x0A2725"
          },
          {
            "addr": "0xD1A842",
            "value": "0x08B604"
          }
        ],
        "windows": null
      },
      {
        "block": 39849,
        "step": 39978,
        "pc": "0x0A2548",
        "prevPc": "0x0A2537",
        "cpu": {
          "pc": "0x0A2548",
          "sp": "0xD1A827",
          "af": "0x00CC54",
          "bc": "0x000808",
          "de": "0xD08008",
          "hl": "0xD410BA",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 39978
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39850,
        "step": 39979,
        "pc": "0x0A254F",
        "prevPc": "0x0A2548",
        "cpu": {
          "pc": "0x0A254F",
          "sp": "0xD1A827",
          "af": "0x00CC10",
          "bc": "0x0008CC",
          "de": "0xD08008",
          "hl": "0xD410BA",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x10",
          "stepCount": 39979
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39851,
        "step": 39980,
        "pc": "0x0A2555",
        "prevPc": "0x0A254F",
        "cpu": {
          "pc": "0x0A2555",
          "sp": "0xD1A827",
          "af": "0x00CC90",
          "bc": "0x0008CC",
          "de": "0xD08008",
          "hl": "0xD410BA",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x90",
          "stepCount": 39980
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39852,
        "step": 39981,
        "pc": "0x0A2572",
        "prevPc": "0x0A2555",
        "cpu": {
          "pc": "0x0A2572",
          "sp": "0xD1A827",
          "af": "0x00CC89",
          "bc": "0x000898",
          "de": "0xD08008",
          "hl": "0xD410BA",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x89",
          "stepCount": 39981
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39853,
        "step": 39982,
        "pc": "0x0A2588",
        "prevPc": "0x0A2572",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x00E600",
          "bc": "0x000204",
          "de": "0xD05651",
          "hl": "0xD05651",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39982
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39854,
        "step": 39983,
        "pc": "0x0A255F",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x00E600",
          "bc": "0x000798",
          "de": "0x00FFFF",
          "hl": "0xD410BC",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39983
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39855,
        "step": 39984,
        "pc": "0x0A2572",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2572",
          "sp": "0xD1A827",
          "af": "0x00E625",
          "bc": "0x000730",
          "de": "0x00FFFF",
          "hl": "0xD410BC",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x25",
          "stepCount": 39984
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39856,
        "step": 39985,
        "pc": "0x0A2588",
        "prevPc": "0x0A2572",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x00E600",
          "bc": "0x000104",
          "de": "0xD05651",
          "hl": "0xD05651",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39985
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39857,
        "step": 39986,
        "pc": "0x0A255F",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x00E600",
          "bc": "0x000630",
          "de": "0x00FFFF",
          "hl": "0xD410BE",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39986
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39858,
        "step": 39987,
        "pc": "0x0A2563",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2563",
          "sp": "0xD1A827",
          "af": "0x00E624",
          "bc": "0x000660",
          "de": "0x00FFFF",
          "hl": "0xD410BE",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x24",
          "stepCount": 39987
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39859,
        "step": 39988,
        "pc": "0x0A257E",
        "prevPc": "0x0A2563",
        "cpu": {
          "pc": "0x0A257E",
          "sp": "0xD1A827",
          "af": "0x00E6A0",
          "bc": "0x000104",
          "de": "0xD05651",
          "hl": "0xD05651",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0xA0",
          "stepCount": 39988
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39860,
        "step": 39989,
        "pc": "0x0A2585",
        "prevPc": "0x0A257E",
        "cpu": {
          "pc": "0x0A2585",
          "sp": "0xD1A827",
          "af": "0x00E645",
          "bc": "0x000004",
          "de": "0xD05651",
          "hl": "0xD05651",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x45",
          "stepCount": 39989
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39861,
        "step": 39990,
        "pc": "0x0A255F",
        "prevPc": "0x0A2585",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x00E645",
          "bc": "0x000560",
          "de": "0x0052AA",
          "hl": "0xD410C0",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x45",
          "stepCount": 39990
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39862,
        "step": 39991,
        "pc": "0x0A2563",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2563",
          "sp": "0xD1A827",
          "af": "0x00E684",
          "bc": "0x0005C0",
          "de": "0x0052AA",
          "hl": "0xD410C0",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x84",
          "stepCount": 39991
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39863,
        "step": 39992,
        "pc": "0x0A257E",
        "prevPc": "0x0A2563",
        "cpu": {
          "pc": "0x0A257E",
          "sp": "0xD1A827",
          "af": "0x006120",
          "bc": "0x008004",
          "de": "0xD05651",
          "hl": "0xD05652",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x20",
          "stepCount": 39992
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39864,
        "step": 39993,
        "pc": "0x0A2588",
        "prevPc": "0x0A257E",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x004004",
          "de": "0xD05651",
          "hl": "0xD05652",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39993
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39865,
        "step": 39994,
        "pc": "0x0A255F",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x0004C0",
          "de": "0x0052AA",
          "hl": "0xD410C2",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39994
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39866,
        "step": 39995,
        "pc": "0x0A2572",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2572",
          "sp": "0xD1A827",
          "af": "0x006181",
          "bc": "0x000480",
          "de": "0x0052AA",
          "hl": "0xD410C2",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x81",
          "stepCount": 39995
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39867,
        "step": 39996,
        "pc": "0x0A2588",
        "prevPc": "0x0A2572",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x006120",
          "bc": "0x002004",
          "de": "0xD05651",
          "hl": "0xD05652",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x20",
          "stepCount": 39996
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39868,
        "step": 39997,
        "pc": "0x0A255F",
        "prevPc": "0x0A2588",
        "cpu": {
          "pc": "0x0A255F",
          "sp": "0xD1A827",
          "af": "0x006120",
          "bc": "0x000380",
          "de": "0x00FFFF",
          "hl": "0xD410C4",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x20",
          "stepCount": 39997
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39869,
        "step": 39998,
        "pc": "0x0A2572",
        "prevPc": "0x0A255F",
        "cpu": {
          "pc": "0x0A2572",
          "sp": "0xD1A827",
          "af": "0x006145",
          "bc": "0x000300",
          "de": "0x00FFFF",
          "hl": "0xD410C4",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x45",
          "stepCount": 39998
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      },
      {
        "block": 39870,
        "step": 39999,
        "pc": "0x0A2588",
        "prevPc": "0x0A2572",
        "cpu": {
          "pc": "0x0A2588",
          "sp": "0xD1A827",
          "af": "0x006100",
          "bc": "0x001004",
          "de": "0xD05651",
          "hl": "0xD05652",
          "ix": "0xD005CD",
          "iy": "0xD00080",
          "f": "0x00",
          "stepCount": 39999
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x02",
          "D0058C": "0x5A",
          "D0058D": "0x02",
          "D0058E": "0x5A",
          "D00080": "0x18",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A827",
            "value": "0xD08008"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000608"
          },
          {
            "addr": "0xD1A82D",
            "value": "0xD026BB"
          },
          {
            "addr": "0xD1A830",
            "value": "0x00A01E"
          },
          {
            "addr": "0xD1A833",
            "value": "0x000002"
          },
          {
            "addr": "0xD1A836",
            "value": "0x08BD13"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x00E947"
          }
        ],
        "windows": null
      }
    ],
    "fieldTransitions": [
      {
        "block": 1,
        "pc": "0x08C331",
        "prevPc": null,
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0x000000",
            "after": "0xD1A863"
          },
          "D00587": {
            "before": "0x000000",
            "after": "0x000032"
          },
          "D0058C": {
            "before": "0x000000",
            "after": "0x00005A"
          },
          "D0058D": {
            "before": "0x000000",
            "after": "0x00005A"
          },
          "D0058E": {
            "before": "0x000000",
            "after": "0x00005A"
          },
          "D00080": {
            "before": "0x000000",
            "after": "0x000008"
          },
          "D0009F": {
            "before": "0x000000",
            "after": "0x000020"
          }
        }
      },
      {
        "block": 142,
        "pc": "0x03FA04",
        "prevPc": "0x03F9FA",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00587": {
            "before": "0x000032",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 143,
        "pc": "0x03F9D5",
        "prevPc": "0x03FA04",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0058D": {
            "before": "0x00005A",
            "after": "0x000002"
          }
        }
      },
      {
        "block": 145,
        "pc": "0x03D058",
        "prevPc": "0x03F9D8",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D00080": {
            "before": "0x000008",
            "after": "0x000018"
          }
        }
      },
      {
        "block": 1151,
        "pc": "0x08C366",
        "prevPc": "0x08C34F",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D0009F": {
            "before": "0x000020",
            "after": "0x000000"
          }
        }
      },
      {
        "block": 11387,
        "pc": "0x08377D",
        "prevPc": "0x061DEF",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0xD1A863",
            "after": "0xD1A839"
          }
        }
      },
      {
        "block": 12982,
        "pc": "0x08379A",
        "prevPc": "0x061E27",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D008E0": {
            "before": "0xD1A839",
            "after": "0xD1A863"
          }
        }
      },
      {
        "block": 14974,
        "pc": "0x06C764",
        "prevPc": "0x08C782",
        "timing": "entry-vs-previous-block",
        "diff": {
          "D007CA": {
            "before": "0x0585E9",
            "after": "0x06C92C"
          }
        }
      }
    ]
  },
  "cdpPageErrors": []
}
```

