# Phase 869: D02437 Owner/Lifetime Trace

Probe: `probe-phase869-d02437-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase869-d02437-lifetime.mjs`

## Summary

- Result: PASS.
- Browser live route starts CLEAR with D02437=0xD1A8CC; raw CEmu before/after CLEAR captures both report 0xD1A8CC -> 0xD1A8CC.
- Harness route carries D02437=0xD1A8A3 before CLEAR while D0243A=0xD1A8CC; that reproduces the Phase867/868 branch-controller mismatch.
- OS boot/lifetime writer for the live value: 0x0A2DCF in p5-launch-home-09dd62 (0xD1A8A3 -> 0xD1A8CC), with D010FE=0xD1A8CC.
- Harness value writer: 0x05E83A in p5-launch-home-09dd62 (0x000000 -> 0xD1A8A3), with D0066F=0xD1A8A1.
- Interpretation: the live route matches the real after-CLEAR oracle for this pointer before the bad wipe; the harness-only owner path inherits a different low edit pointer before CLEAR, so it is still diagnostic rather than hardware-authoritative.

## D02437-Changing Writes

### Live Boot/Lifetime Writer Evidence

| Phase | PC | Kind | Before D02437 | After D02437 | After D0243A | After D0243D | HL | DE | D0066F | D010FE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p5-launch-home-09dd62 | 0x05E83A | write24 | 0x000000 | 0xD1A8A3 | 0x000000 | 0x000000 | 0xD1A8A3 | 0xD1A8A2 | 0xD1A8A1 | 0x000000 |
| p5-launch-home-09dd62 | 0x0A2DCF | write24 | 0xD1A8A3 | 0xD1A8CC | 0xD1A8A3 | 0xD2A83E | 0xD1A8CC | 0x000000 | 0xD1A8A1 | 0xD1A8CC |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD1A8CC | 0xD1A800 | 0xD1A8CC | 0xD2A83E | 0xD02436 | 0xD02437 | 0x000000 | 0x000000 |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD1A800 | 0xD10000 | 0xD1A8CC | 0xD2A83E | 0xD02437 | 0xD02438 | 0x000000 | 0x000000 |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD10000 | 0x000000 | 0xD1A8CC | 0xD2A83E | 0xD02438 | 0xD02439 | 0x000000 | 0x000000 |
| p7-live-clear | 0x0A22A4 | write8 | 0x000000 | 0x000020 | 0x000000 | 0x000000 | 0xD02436 | 0xD02437 | 0x000000 | 0x202020 |
| p7-live-clear | 0x0A22A4 | write8 | 0x000020 | 0x002020 | 0x000000 | 0x000000 | 0xD02437 | 0xD02438 | 0x000000 | 0x202020 |
| p7-live-clear | 0x0A22A4 | write8 | 0x002020 | 0x202020 | 0x000000 | 0x000000 | 0xD02438 | 0xD02439 | 0x000000 | 0x202020 |

### Browser Live CLEAR Route Changes

| Phase | PC | Kind | Before D02437 | After D02437 | After D0243A | After D0243D | HL | DE | D0066F | D010FE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| browser-live-clear | 0x001879 | block-diff:D02437,D0243A,D0243D,D02440,D0066F | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0xD3FEFF | 0xD3FF00 | 0x000000 | 0x000000 |

### Harness Route

| Phase | PC | Kind | Before D02437 | After D02437 | After D0243A | After D0243D | HL | DE | D0066F | D010FE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p5-launch-home-09dd62 | 0x05E83A | write24 | 0x000000 | 0xD1A8A3 | 0x000000 | 0x000000 | 0xD1A8A3 | 0xD1A8A2 | 0xD1A8A1 | 0x000000 |
| p5-launch-home-09dd62 | 0x0A2DCF | write24 | 0xD1A8A3 | 0xD1A8CC | 0xD1A8A3 | 0xD2A83E | 0xD1A8CC | 0x000000 | 0xD1A8A1 | 0xD1A8CC |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD1A8CC | 0xD1A800 | 0xD1A8CC | 0xD2A83E | 0xD02436 | 0xD02437 | 0x000000 | 0x000000 |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD1A800 | 0xD10000 | 0xD1A8CC | 0xD2A83E | 0xD02437 | 0xD02438 | 0x000000 | 0x000000 |
| p5-launch-home-09dd62 | 0x001879 | write8 | 0xD10000 | 0x000000 | 0xD1A8CC | 0xD2A83E | 0xD02438 | 0xD02439 | 0x000000 | 0x000000 |
| p6-home-repaint-058241 | 0x05E83A | write24 | 0x000000 | 0xD1A8A3 | 0x000000 | 0x000000 | 0xD1A8A3 | 0xD1A8CB | 0xD1A8A1 | 0x000000 |

## Lifetime Snapshots

### Browser Live Route

| Point | D02437 | D0243A | D0243D | D02440 | D0066F | D010FE | D010EF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before-p7-clear | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD2A83E | 0xD1A8A1 | 0x000000 | 0x000000 |
| after-p7-clear | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |

### Direct Runtime Boot Writer Route

| Point | D02437 | D0243A | D0243D | D02440 | D0066F | D010FE | D010EF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| after-p5-launch-home | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| after-p6-repaint | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| before-p7-clear | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| after-p7-clear | 0x202020 | 0x202020 | 0x202020 | 0x202020 | 0xFFFFFF | 0x202020 | 0x202020 |

### Harness Route

| Point | D02437 | D0243A | D0243D | D02440 | D0066F | D010FE | D010EF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| after-p5-launch-home | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| after-p6-repaint | 0xD1A8A3 | 0xD1A8A3 | 0xD2A815 | 0xD2A83E | 0xD1A8A1 | 0x000000 | 0x000000 |
| after-harness-boundary-restore | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| after-harness-manual-setup | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E | 0xD1A8A1 | 0x000000 | 0x000000 |
| before-p7-clear | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E | 0xD1A8A1 | 0x000000 | 0x000000 |
| after-p7-clear | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0xD2A83E | 0xD1A8A1 | 0x000000 | 0x000000 |

## Raw Capture Cross-Check

| Field | CEmu before CLEAR | CEmu after CLEAR | Live before CLEAR | Harness before CLEAR |
| --- | --- | --- | --- | --- |
| D02437 | 0xD1A8CC | 0xD1A8CC | 0xD1A8CC | 0xD1A8A3 |
| D0243A | 0xD1A8CD | 0xD1A8CC | 0xD1A8CC | 0xD1A8CC |
| D0243D | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E |
| D02440 | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E |
| D0066F | 0xD1A8A1 | 0xD1A8A1 | 0xD1A8A1 | 0xD1A8A1 |
| D010FE | 0xD1A8CC | 0xD1A8CC | 0x000000 | 0x000000 |
| D010EF | 0xD2A83E | 0xD2A83E | 0x000000 | 0x000000 |
| D02590 | 0xD3FE81 | 0xD3FE81 | 0xD3FE81 | 0xD3FE81 |
| D0259D | 0xD3FECD | 0xD3FECD | 0xD3FECD | 0xD3FECD |

## Route Counts

| Route | 0x0562E2 | 0x05E83A | 0x05E844 | 0x04ED11 | 0x04EF6F | 0x058A14 | 0x0A31FD | 0x0A229D | 0x0018F8 | Termination |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| live-style | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | max_steps |
| harness | 0 | 3 | 0 | 0 | 0 | 1 | 1 | 0 | 6 | captured-0a31e2-to-0a31a2 |

## Static Writer Candidates

The dynamic rows above identify which candidates actually wrote this run. Static scan found these direct or LDIR-style references:

```json
[
  {
    "pc": "0x051CFF",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x0562E6",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x05E844",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x06A1AA",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x0978E8",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x09D161",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x09E56B",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x09E5B4",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x0A2DCF",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x0AF3BD",
    "kind": "LD (D02437),HL"
  },
  {
    "pc": "0x04EF74",
    "kind": "LD (D02437),DE"
  },
  {
    "pc": "0x04ED15",
    "kind": "LD DE,D02437 (possible LDIR restore destination)"
  },
  {
    "pc": "0x088762",
    "kind": "LD DE,D02437 (possible LDIR restore destination)"
  },
  {
    "pc": "0x09D1C7",
    "kind": "LD DE,D02437 (possible LDIR restore destination)"
  },
  {
    "pc": "0x04EEB4",
    "kind": "LD HL,D02437 (possible LDIR save source)"
  },
  {
    "pc": "0x088590",
    "kind": "LD HL,D02437 (possible LDIR save source)"
  },
  {
    "pc": "0x09D151",
    "kind": "LD HL,D02437 (possible LDIR save source)"
  }
]
```

## Machine JSON

```json
{
  "pass": true,
  "live": {
    "clear": {
      "result": {
        "termination": "max_steps",
        "steps": 160000,
        "lastPc": null,
        "lastMode": null
      },
      "stopReason": null,
      "fields": {
        "D00359_SAVE_D02437": "0x000000",
        "D0035C_SAVE_D0243A": "0x000000",
        "D0035F_SAVE_D0243D": "0x000000",
        "D00362_SAVE_D02440": "0x000000",
        "D0066F": "0x000000",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000"
      },
      "state": {
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "keyState": {
          "code": "Escape",
          "label": "CLEAR",
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
          "steps": 160000,
          "termination": "max_steps",
          "wipes": 1,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02590": 0,
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
          "vramPeak": 8689,
          "vramCurrent": 3031
        },
        "diagnostics": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 4,
          "D00596": 19,
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
          "vramCurrent": 3031,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
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
            "steps": 160000,
            "termination": "max_steps",
            "wipes": 1,
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02590": 0,
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
            "vramPeak": 8689,
            "vramCurrent": 3031
          }
        },
        "pageErrors": []
      }
    },
    "targetCounts": {
      "initEditPtrs0562e2": 0,
      "initEditPtrs0562e6": 0,
      "restoreContext04ed11": 0,
      "saveContext04eeb4": 0,
      "copyD0243AToD0243704ef6f": 0,
      "writeFromD0066F05e83a": 0,
      "writeFromD0066F05e844": 0,
      "flagOwner058212": 1,
      "flagReturn058A14": 1,
      "owner0A31FD": 0,
      "anchor0A229D": 1,
      "cleanup0018F8": 1,
      "poll006D64": 9167
    },
    "keyWrites": [
      {
        "phase": "browser-live-clear",
        "pc": "0x001879",
        "kind": "block-diff:D02437,D0243A,D0243D,D02440,D0066F",
        "addr": "0xD02437",
        "beforeD02437": "0xD1A8CC",
        "afterD02437": "0x000000",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0x000000",
        "hl": "0xD3FEFF",
        "de": "0xD3FF00",
        "bc": "0x0000FF",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      }
    ]
  },
  "liveBootstrap": {
    "clear": {
      "result": {
        "steps": 7383,
        "termination": "missing_block",
        "lastPc": "0x202020",
        "lastMode": "adl"
      },
      "stopReason": null,
      "fields": {
        "D00359_SAVE_D02437": "0xFFFFFF",
        "D0035C_SAVE_D0243A": "0xFFFFFF",
        "D0035F_SAVE_D0243D": "0xFFFFFF",
        "D00362_SAVE_D02440": "0xFFFFFF",
        "D0066F": "0xFFFFFF",
        "D007CA": "0x202020",
        "D008E0": "0x202020",
        "D010EF": "0x202020",
        "D010FE": "0x202020",
        "D02317": "0x202020",
        "D0231A": "0x202020",
        "D0231D": "0x202020",
        "D02437": "0x202020",
        "D0243A": "0x202020",
        "D0243D": "0x202020",
        "D02440": "0x202020",
        "D02505": "0x20",
        "D02590": "0x202020",
        "D0259D": "0x202020",
        "D02A29": "0x2020"
      }
    },
    "targetCounts": {
      "initEditPtrs0562e2": 0,
      "initEditPtrs0562e6": 0,
      "restoreContext04ed11": 0,
      "saveContext04eeb4": 0,
      "copyD0243AToD0243704ef6f": 0,
      "writeFromD0066F05e83a": 2,
      "writeFromD0066F05e844": 0,
      "flagOwner058212": 1,
      "flagReturn058A14": 1,
      "owner0A31FD": 0,
      "anchor0A229D": 1,
      "cleanup0018F8": 6,
      "poll006D64": 30264
    },
    "keyWrites": [
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x05E83A",
        "kind": "write24",
        "addr": "0xD02437",
        "beforeD02437": "0x000000",
        "afterD02437": "0xD1A8A3",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD1A8A3",
        "de": "0xD1A8A2",
        "bc": "0xD3FE81",
        "sourceD0066F": "0xD1A8A1",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x0A2DCF",
        "kind": "write24",
        "addr": "0xD02437",
        "beforeD02437": "0xD1A8A3",
        "afterD02437": "0xD1A8CC",
        "beforeD0243A": "0xD1A8A3",
        "afterD0243A": "0xD1A8A3",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD1A8CC",
        "de": "0x000000",
        "bc": "0x00000F",
        "sourceD0066F": "0xD1A8A1",
        "sourceD010FE": "0xD1A8CC",
        "sourceD010EF": "0xD2A83E"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02437",
        "beforeD02437": "0xD1A8CC",
        "afterD02437": "0xD1A800",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02436",
        "de": "0xD02437",
        "bc": "0x011BA1",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02438",
        "beforeD02437": "0xD1A800",
        "afterD02437": "0xD10000",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02437",
        "de": "0xD02438",
        "bc": "0x011BA0",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02439",
        "beforeD02437": "0xD10000",
        "afterD02437": "0x000000",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02438",
        "de": "0xD02439",
        "bc": "0x011B9F",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p7-live-clear",
        "pc": "0x0A22A4",
        "kind": "write8",
        "addr": "0xD02437",
        "beforeD02437": "0x000000",
        "afterD02437": "0x000020",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD02436",
        "de": "0xD02437",
        "bc": "0xFFE28A",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x202020",
        "sourceD010EF": "0x202020"
      },
      {
        "phase": "p7-live-clear",
        "pc": "0x0A22A4",
        "kind": "write8",
        "addr": "0xD02438",
        "beforeD02437": "0x000020",
        "afterD02437": "0x002020",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD02437",
        "de": "0xD02438",
        "bc": "0xFFE289",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x202020",
        "sourceD010EF": "0x202020"
      },
      {
        "phase": "p7-live-clear",
        "pc": "0x0A22A4",
        "kind": "write8",
        "addr": "0xD02439",
        "beforeD02437": "0x002020",
        "afterD02437": "0x202020",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD02438",
        "de": "0xD02439",
        "bc": "0xFFE288",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x202020",
        "sourceD010EF": "0x202020"
      }
    ]
  },
  "harness": {
    "clear": {
      "result": {
        "steps": 4986,
        "termination": "captured-0a31e2-to-0a31a2",
        "lastPc": "0x0A31A2",
        "lastMode": "adl"
      },
      "stopReason": "captured-0a31e2-to-0a31a2",
      "fields": {
        "D00359_SAVE_D02437": "0x000000",
        "D0035C_SAVE_D0243A": "0x000000",
        "D0035F_SAVE_D0243D": "0x000000",
        "D00362_SAVE_D02440": "0x000000",
        "D0066F": "0xD1A8A1",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0xD1A8A3",
        "D0243A": "0xD1A8CB",
        "D0243D": "0xD2A83D",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000"
      }
    },
    "targetCounts": {
      "initEditPtrs0562e2": 0,
      "initEditPtrs0562e6": 0,
      "restoreContext04ed11": 0,
      "saveContext04eeb4": 0,
      "copyD0243AToD0243704ef6f": 0,
      "writeFromD0066F05e83a": 3,
      "writeFromD0066F05e844": 0,
      "flagOwner058212": 1,
      "flagReturn058A14": 1,
      "owner0A31FD": 1,
      "anchor0A229D": 0,
      "cleanup0018F8": 6,
      "poll006D64": 30264
    },
    "keyWrites": [
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x05E83A",
        "kind": "write24",
        "addr": "0xD02437",
        "beforeD02437": "0x000000",
        "afterD02437": "0xD1A8A3",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD1A8A3",
        "de": "0xD1A8A2",
        "bc": "0xD3FE81",
        "sourceD0066F": "0xD1A8A1",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x0A2DCF",
        "kind": "write24",
        "addr": "0xD02437",
        "beforeD02437": "0xD1A8A3",
        "afterD02437": "0xD1A8CC",
        "beforeD0243A": "0xD1A8A3",
        "afterD0243A": "0xD1A8A3",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD1A8CC",
        "de": "0x000000",
        "bc": "0x00000F",
        "sourceD0066F": "0xD1A8A1",
        "sourceD010FE": "0xD1A8CC",
        "sourceD010EF": "0xD2A83E"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02437",
        "beforeD02437": "0xD1A8CC",
        "afterD02437": "0xD1A800",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02436",
        "de": "0xD02437",
        "bc": "0x011BA1",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02438",
        "beforeD02437": "0xD1A800",
        "afterD02437": "0xD10000",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02437",
        "de": "0xD02438",
        "bc": "0x011BA0",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p5-launch-home-09dd62",
        "pc": "0x001879",
        "kind": "write8",
        "addr": "0xD02439",
        "beforeD02437": "0xD10000",
        "afterD02437": "0x000000",
        "beforeD0243A": "0xD1A8CC",
        "afterD0243A": "0xD1A8CC",
        "beforeD0243D": "0xD2A83E",
        "afterD0243D": "0xD2A83E",
        "hl": "0xD02438",
        "de": "0xD02439",
        "bc": "0x011B9F",
        "sourceD0066F": "0x000000",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      },
      {
        "phase": "p6-home-repaint-058241",
        "pc": "0x05E83A",
        "kind": "write24",
        "addr": "0xD02437",
        "beforeD02437": "0x000000",
        "afterD02437": "0xD1A8A3",
        "beforeD0243A": "0x000000",
        "afterD0243A": "0x000000",
        "beforeD0243D": "0x000000",
        "afterD0243D": "0x000000",
        "hl": "0xD1A8A3",
        "de": "0xD1A8CB",
        "bc": "0xD3FE81",
        "sourceD0066F": "0xD1A8A1",
        "sourceD010FE": "0x000000",
        "sourceD010EF": "0x000000"
      }
    ]
  },
  "captureFields": {
    "pre": {
      "D00359_SAVE_D02437": "0x000000",
      "D0035C_SAVE_D0243A": "0x000000",
      "D0035F_SAVE_D0243D": "0x000000",
      "D00362_SAVE_D02440": "0x000000",
      "D0066F": "0xD1A8A1",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x000C"
    },
    "after": {
      "D00359_SAVE_D02437": "0x000000",
      "D0035C_SAVE_D0243A": "0x000000",
      "D0035F_SAVE_D0243D": "0x000000",
      "D00362_SAVE_D02440": "0x000000",
      "D0066F": "0xD1A8A1",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D02505": "0x0A",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000"
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

