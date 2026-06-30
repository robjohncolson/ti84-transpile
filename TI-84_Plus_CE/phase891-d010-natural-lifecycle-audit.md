# Phase 891: Natural D010 Mirror Lifecycle Audit

Probe: `probe-phase891-d010-natural-lifecycle-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase891-d010-natural-lifecycle-audit.mjs`

Serves a temporary observation-only copy of the real `browser-shell.html`, boots coldboot mode in headless Chrome, traces D010 mirror fields across Phase 5, the natural D0301B owner leg, stable replay, Phase 6, and Escape/CLEAR, then compares against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.

## Result

- Overall: **PASS**.
- Browser execution clean: yes.
- Phase 5 writes oracle D010 then wipes it: yes.
- Stable replay restores and preserves D010 through CLEAR: yes.
- Post-wipe natural D010 writes observed: 0.
- Adjudication: The natural launch-home route writes the D010 mirror before the 0x001879 stable snapshot, then 0x0018F8 wipes it. After that wipe, Phase5b owner, Phase6 repaint, edit seed, and Escape/CLEAR do not write D010; the current browser preserves the real after-CLEAR D010 mirror through the stable replay packet.

## Source Evidence

- Source SHA-256: `0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584`
- Stable replay includes D010EF/D010FE/D010F4: yes.
- Manual D0301B force is absent: yes.
- Natural owner entry/stop markers present: yes.
- D008E0 oracle event frame source present: yes.

Stable replay field names:

```json
[
  "D007CA",
  "D008E0",
  "D02505",
  "D02587",
  "D0258A",
  "D0258D",
  "D02590",
  "D02593",
  "D0259A",
  "D0259D",
  "D025A0",
  "D025C5",
  "D010EF",
  "D010FE",
  "D010F4"
]
```

## D010 Timeline

| Point | Source | D010EF | D010FE | D010F4 | Oracle match |
| --- | --- | --- | --- | --- | --- |
| real after-CLEAR oracle | capture | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| stable snapshot @0x001879 | browser snapshot | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| after Phase5 natural route | browser natural | 0x000000 | 0x000000 | 0x00 | NO |
| before D0301B owner | browser natural | 0x000000 | 0x000000 | 0x00 | NO |
| after D0301B owner | browser natural | 0x000000 | 0x000000 | 0x00 | NO |
| before stable replay | browser replay boundary | 0x000000 | 0x000000 | 0x00 | NO |
| after stable replay | browser replay boundary | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| after Phase6 repaint | browser natural | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| after edit seed | browser seed | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| before UI clear | browser key route | 0xD2A83E | 0xD1A8CC | 0x1F | yes |
| after UI clear | browser key route | 0xD2A83E | 0xD1A8CC | 0x1F | yes |

## Phase 5 D010 Changes

| Phase | Block | Field | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- | --- |
| p5-launch-home | 48128 | D010EF | 0x000000 | 0xD2A83E | 0x090A71 | 0x08D0D6 |
| p5-launch-home | 48129 | D010FE | 0x000000 | 0xD1A8A3 | 0x08D0E2 | 0x090A71 |
| p5-launch-home | 48170 | D010FE | 0xD1A8A3 | 0xD1A8B9 | 0x091DA0 | 0x091D65 |
| p5-launch-home | 48207 | D010FE | 0xD1A8B9 | 0xD1A8CC | 0x091B4E | 0x0918FE |
| p5-launch-home | 48236 | D010F4 | 0x00 | 0x1F | 0x069989 | 0x06994F |
| p5-launch-home | 84131 | D010EF | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| p5-launch-home | 84131 | D010FE | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| p5-launch-home | 84131 | D010F4 | 0x1F | 0x00 | 0x0018F8 | 0x001879 |

## Post-Wipe D010 Changes

Natural D0301B owner leg:

No rows.

Escape/CLEAR key route:

No rows.

## Target Counts

| Phase | 0x001879 | 0x0018F8 | 0x0454BE | 0x09DEE0 | 0x0A229D |
| --- | --- | --- | --- | --- | --- |
| p5-launch-home | 2 | 2 | 0 | 1 | 0 |
| phase5b-natural-d0301b-owner | 0 | 0 | 1 | 1 | 0 |
| key-route | 0 | 0 | 0 | 0 | 1 |

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "pass": true,
    "cleanBrowser": true,
    "p5WritesOracleThenWipes": true,
    "replayRestoresOracle": true,
    "postWipeNaturalD010Writes": 0,
    "conclusion": "The natural launch-home route writes the D010 mirror before the 0x001879 stable snapshot, then 0x0018F8 wipes it. After that wipe, Phase5b owner, Phase6 repaint, edit seed, and Escape/CLEAR do not write D010; the current browser preserves the real after-CLEAR D010 mirror through the stable replay packet."
  },
  "sourceEvidence": {
    "file": "browser-shell.html",
    "sha256": "0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584",
    "replayNames": [
      "D007CA",
      "D008E0",
      "D02505",
      "D02587",
      "D0258A",
      "D0258D",
      "D02590",
      "D02593",
      "D0259A",
      "D0259D",
      "D025A0",
      "D025C5",
      "D010EF",
      "D010FE",
      "D010F4"
    ],
    "hasD010Replay": true,
    "hasD0301BForce": false,
    "hasNaturalOwnerEntry": true,
    "hasOwnerStopBefore09DEE0": true,
    "hasD008E0OracleErrSp": true
  },
  "oracleFields": {
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D0301B": "0x5AA55A"
  },
  "pageState": {
    "phase6": {
      "steps": 47298,
      "termination": "halt",
      "lastPc": 6581,
      "vram": 8482,
      "vatSnapshotCaptured": true,
      "naturalD0301BOwner": {
        "entry": 283838,
        "steps": 39171,
        "termination": "stopped_before_target",
        "lastPc": 646880,
        "beforeD0301B": 0,
        "afterD0301B": 5940570
      }
    },
    "owner": {
      "entry": 283838,
      "steps": 39171,
      "termination": "stopped_before_target",
      "lastPc": 646880,
      "beforeD0301B": 0,
      "afterD0301B": 5940570
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 664221,
      "controlPreStopLabel": "clear-eol-bc-zero-owner",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 74324,
      "controlStopPc": 664221,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": true,
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
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 74340,
      "termination": "control_pre_stop",
      "wipes": 0,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D007CA": 361961,
      "D008E0": 13740140,
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
      "vramPeak": 8518,
      "vramCurrent": 8482
    },
    "afterBoot": {
      "label": "afterBootEval",
      "runtimeMode": "coldboot",
      "totalSteps": 674702,
      "lastPc": 574257,
      "lastMode": "adl",
      "cpu": {
        "pc": 6581,
        "currentBlockPc": 6581,
        "sp": 13740134,
        "af": 4180,
        "bc": 0,
        "de": 13805589,
        "hl": 13740195,
        "ix": 13740128,
        "iy": 13631616,
        "f": 84,
        "halted": true
      },
      "fields": {
        "D008E0": 0,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D0301B": 5940570
      },
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": null,
      "vram": 8482,
      "status": "Coldboot complete. OS event loop is ready."
    },
    "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
    "vram": 8482
  },
  "state": {
    "records": {
      "p5-launch-home": {
        "name": "p5-launch-home",
        "active": false,
        "blockCount": 275843,
        "prevPc": 6581,
        "lastFields": {
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x000000"
        },
        "changes": [
          {
            "phase": "p5-launch-home",
            "block": 31834,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A836",
            "pc": "0x09A661",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 32630,
            "name": "D008E0",
            "before": "0xD1A836",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 32776,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A839",
            "pc": "0x09A661",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 33481,
            "name": "D008E0",
            "before": "0xD1A839",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 33639,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A836",
            "pc": "0x09A661",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 34794,
            "name": "D008E0",
            "before": "0xD1A836",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 34940,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A839",
            "pc": "0x09A661",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 36136,
            "name": "D008E0",
            "before": "0xD1A839",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 42562,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A848",
            "pc": "0x058D0C",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 43964,
            "name": "D008E0",
            "before": "0xD1A848",
            "after": "0xD1A866",
            "pc": "0x058D18",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 48128,
            "name": "D010EF",
            "before": "0x000000",
            "after": "0xD2A83E",
            "pc": "0x090A71",
            "prevPc": "0x08D0D6"
          },
          {
            "phase": "p5-launch-home",
            "block": 48129,
            "name": "D010FE",
            "before": "0x000000",
            "after": "0xD1A8A3",
            "pc": "0x08D0E2",
            "prevPc": "0x090A71"
          },
          {
            "phase": "p5-launch-home",
            "block": 48131,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0xD1A848",
            "pc": "0x08D0F6",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 48139,
            "name": "D008E0",
            "before": "0xD1A848",
            "after": "0xD1A833",
            "pc": "0x08D17B",
            "prevPc": "0x061DEF"
          },
          {
            "phase": "p5-launch-home",
            "block": 48170,
            "name": "D010FE",
            "before": "0xD1A8A3",
            "after": "0xD1A8B9",
            "pc": "0x091DA0",
            "prevPc": "0x091D65"
          },
          {
            "phase": "p5-launch-home",
            "block": 48207,
            "name": "D010FE",
            "before": "0xD1A8B9",
            "after": "0xD1A8CC",
            "pc": "0x091B4E",
            "prevPc": "0x0918FE"
          },
          {
            "phase": "p5-launch-home",
            "block": 48236,
            "name": "D010F4",
            "before": "0x00",
            "after": "0x1F",
            "pc": "0x069989",
            "prevPc": "0x06994F"
          },
          {
            "phase": "p5-launch-home",
            "block": 48322,
            "name": "D008E0",
            "before": "0xD1A833",
            "after": "0xD1A848",
            "pc": "0x08CAA9",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 48328,
            "name": "D008E0",
            "before": "0xD1A848",
            "after": "0xD1A866",
            "pc": "0x08D12A",
            "prevPc": "0x061E27"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010EF",
            "before": "0xD2A83E",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010FE",
            "before": "0xD1A8CC",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010F4",
            "before": "0x1F",
            "after": "0x00",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          }
        ],
        "d010Changes": [
          {
            "phase": "p5-launch-home",
            "block": 48128,
            "name": "D010EF",
            "before": "0x000000",
            "after": "0xD2A83E",
            "pc": "0x090A71",
            "prevPc": "0x08D0D6"
          },
          {
            "phase": "p5-launch-home",
            "block": 48129,
            "name": "D010FE",
            "before": "0x000000",
            "after": "0xD1A8A3",
            "pc": "0x08D0E2",
            "prevPc": "0x090A71"
          },
          {
            "phase": "p5-launch-home",
            "block": 48170,
            "name": "D010FE",
            "before": "0xD1A8A3",
            "after": "0xD1A8B9",
            "pc": "0x091DA0",
            "prevPc": "0x091D65"
          },
          {
            "phase": "p5-launch-home",
            "block": 48207,
            "name": "D010FE",
            "before": "0xD1A8B9",
            "after": "0xD1A8CC",
            "pc": "0x091B4E",
            "prevPc": "0x0918FE"
          },
          {
            "phase": "p5-launch-home",
            "block": 48236,
            "name": "D010F4",
            "before": "0x00",
            "after": "0x1F",
            "pc": "0x069989",
            "prevPc": "0x06994F"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010EF",
            "before": "0xD2A83E",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010FE",
            "before": "0xD1A8CC",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "name": "D010F4",
            "before": "0x1F",
            "after": "0x00",
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          }
        ],
        "targetCounts": {
          "stableSnapshot001879": 2,
          "stableWipe0018F8": 2,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 1,
          "clearCaller058A16": 0,
          "clearEntry0A223A": 0,
          "anchor0A229D": 0
        },
        "targetFirst": {
          "ownerStop09DEE0": {
            "block": 2,
            "pc": "0x09DEE0",
            "prevPc": "0x09DD62",
            "snapshot": {
              "label": "ownerStop09DEE0",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09DEE0",
                "currentBlockPc": "0x09DEE0",
                "sp": "0xD1A863",
                "af": "0x1044",
                "bc": "0x00B026",
                "de": "0xD65800",
                "hl": "0x000000",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x44",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D0301B": "0x000000"
              },
              "phase6": null,
              "lastKey": null,
              "vram": 0,
              "status": "Parsing ROM module..."
            }
          },
          "stableSnapshot001879": {
            "block": 84130,
            "pc": "0x001879",
            "prevPc": "0x001872",
            "snapshot": {
              "label": "stableSnapshot001879",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "cpu": {
                "pc": "0x001879",
                "currentBlockPc": "0x001879",
                "sp": "0xD1A87B",
                "af": "0xEE54",
                "bc": "0x000003",
                "de": "0x000430",
                "hl": "0x000000",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x54",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A866",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D0301B": "0x000000"
              },
              "phase6": null,
              "lastKey": null,
              "vram": 0,
              "status": "Parsing ROM module..."
            }
          },
          "stableWipe0018F8": {
            "block": 84131,
            "pc": "0x0018F8",
            "prevPc": "0x001879",
            "snapshot": {
              "label": "stableWipe0018F8",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "cpu": {
                "pc": "0x0018F8",
                "currentBlockPc": "0x0018F8",
                "sp": "0xD1A87B",
                "af": "0x5200",
                "bc": "0x0000FF",
                "de": "0xD3FF00",
                "hl": "0xD3FEFF",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x00",
                "halted": false
              },
              "fields": {
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D0301B": "0x000000"
              },
              "phase6": null,
              "lastKey": null,
              "vram": 0,
              "status": "Parsing ROM module..."
            }
          }
        },
        "start": {
          "label": "p5-launch-home:start",
          "runtimeMode": "coldboot",
          "totalSteps": 312390,
          "lastPc": 0,
          "lastMode": "z80",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A866",
            "af": "0x1044",
            "bc": "0x00B026",
            "de": "0xD65800",
            "hl": "0x000000",
            "ix": "0xFFFFFF",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D0301B": "0x000000"
          },
          "phase6": null,
          "lastKey": null,
          "vram": 0,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "p5-launch-home:end",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": 0,
          "lastMode": "z80",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A87E",
            "af": "0x1044",
            "bc": "0x00B026",
            "de": "0xD65800",
            "hl": "0x000000",
            "ix": "0xFFFFFF",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": true
          },
          "fields": {
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D0301B": "0x000000"
          },
          "phase6": null,
          "lastKey": null,
          "vram": 0,
          "status": "Parsing ROM module..."
        }
      },
      "phase5b-natural-d0301b-owner": {
        "name": "phase5b-natural-d0301b-owner",
        "active": false,
        "blockCount": 39172,
        "prevPc": 646880,
        "lastFields": {
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x5AA55A"
        },
        "changes": [
          {
            "phase": "phase5b-natural-d0301b-owner",
            "block": 12,
            "name": "D008E0",
            "before": "0xD1A866",
            "after": "0x000000",
            "pc": "0x045796",
            "prevPc": "0x045734"
          },
          {
            "phase": "phase5b-natural-d0301b-owner",
            "block": 27,
            "name": "D0301B",
            "before": "0x000000",
            "after": "0x5AA55A",
            "pc": "0x040C10",
            "prevPc": "0x040BF0"
          }
        ],
        "d010Changes": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "naturalOwner0454BE": 1,
          "ownerStop09DEE0": 1,
          "clearCaller058A16": 0,
          "clearEntry0A223A": 0,
          "anchor0A229D": 0
        },
        "targetFirst": {
          "naturalOwner0454BE": {
            "block": 1,
            "pc": "0x0454BE",
            "prevPc": null,
            "snapshot": {
              "label": "naturalOwner0454BE",
              "runtimeMode": "coldboot",
              "totalSteps": 588233,
              "lastPc": 0,
              "lastMode": "z80",
              "cpu": {
                "pc": "0x0454BE",
                "currentBlockPc": "0x0454BE",
                "sp": "0xD1A866",
                "af": "0x1040",
                "bc": "0x00B026",
                "de": "0xD65800",
                "hl": "0x000000",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x40",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D0301B": "0x000000"
              },
              "phase6": null,
              "lastKey": null,
              "vram": 0,
              "status": "Parsing ROM module..."
            }
          },
          "ownerStop09DEE0": {
            "block": 39172,
            "pc": "0x09DEE0",
            "prevPc": "0x09DD40",
            "snapshot": {
              "label": "ownerStop09DEE0",
              "runtimeMode": "coldboot",
              "totalSteps": 588233,
              "lastPc": 0,
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09DEE0",
                "currentBlockPc": "0x09DEE0",
                "sp": "0xD1A878",
                "af": "0xFF54",
                "bc": "0x0000EF",
                "de": "0x000000",
                "hl": "0x000202",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x54",
                "halted": false
              },
              "fields": {
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D0301B": "0x5AA55A"
              },
              "phase6": null,
              "lastKey": null,
              "vram": 0,
              "status": "Parsing ROM module..."
            }
          }
        },
        "start": {
          "label": "phase5b-natural-d0301b-owner:start",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": 0,
          "lastMode": "z80",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A866",
            "af": "0x1040",
            "bc": "0x00B026",
            "de": "0xD65800",
            "hl": "0x000000",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D0301B": "0x000000"
          },
          "phase6": null,
          "lastKey": null,
          "vram": 0,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "phase5b-natural-d0301b-owner:end",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": 0,
          "lastMode": "z80",
          "cpu": {
            "pc": "0x09DEE0",
            "currentBlockPc": "0x09DEE0",
            "sp": "0xD1A878",
            "af": "0xFF54",
            "bc": "0x0000EF",
            "de": "0x000000",
            "hl": "0x000202",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D0301B": "0x5AA55A"
          },
          "phase6": null,
          "lastKey": null,
          "vram": 0,
          "status": "Parsing ROM module..."
        }
      },
      "key-route": {
        "name": "key-route",
        "active": false,
        "blockCount": 74324,
        "prevPc": 664221,
        "lastFields": {
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "changes": [
          {
            "phase": "key-route",
            "block": 1,
            "name": "D008E0",
            "before": "0x000000",
            "after": "0xD1A86C",
            "pc": "0x08C331",
            "prevPc": null
          }
        ],
        "d010Changes": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1
        },
        "targetFirst": {
          "clearCaller058A16": {
            "block": 5291,
            "pc": "0x058A16",
            "prevPc": "0x058A14",
            "snapshot": {
              "label": "clearCaller058A16",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "cpu": {
                "pc": "0x058A16",
                "currentBlockPc": "0x058A16",
                "sp": "0xD1A854",
                "af": "0x094A",
                "bc": "0x000900",
                "de": "0xD1A8CC",
                "hl": "0xD1A8CC",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D0301B": "0x5AA55A"
              },
              "phase6": {
                "steps": 47298,
                "termination": "halt",
                "lastPc": 6581,
                "vram": 8482,
                "vatSnapshotCaptured": true,
                "naturalD0301BOwner": {
                  "entry": 283838,
                  "steps": 39171,
                  "termination": "stopped_before_target",
                  "lastPc": 646880,
                  "beforeD0301B": 0,
                  "afterD0301B": 5940570
                }
              },
              "lastKey": null,
              "vram": 8518,
              "status": "Coldboot complete. OS event loop is ready."
            }
          },
          "clearEntry0A223A": {
            "block": 5292,
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
            "snapshot": {
              "label": "clearEntry0A223A",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "cpu": {
                "pc": "0x0A223A",
                "currentBlockPc": "0x0A223A",
                "sp": "0xD1A851",
                "af": "0x094A",
                "bc": "0x000900",
                "de": "0xD1A8CC",
                "hl": "0xD1A8CC",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D0301B": "0x5AA55A"
              },
              "phase6": {
                "steps": 47298,
                "termination": "halt",
                "lastPc": 6581,
                "vram": 8482,
                "vatSnapshotCaptured": true,
                "naturalD0301BOwner": {
                  "entry": 283838,
                  "steps": 39171,
                  "termination": "stopped_before_target",
                  "lastPc": 646880,
                  "beforeD0301B": 0,
                  "afterD0301B": 5940570
                }
              },
              "lastKey": null,
              "vram": 8518,
              "status": "Coldboot complete. OS event loop is ready."
            }
          },
          "anchor0A229D": {
            "block": 74324,
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
            "snapshot": {
              "label": "anchor0A229D",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "cpu": {
                "pc": "0x0A229D",
                "currentBlockPc": "0x0A229D",
                "sp": "0xD1A851",
                "af": "0x0A0C",
                "bc": "0x000018",
                "de": "0x00013F",
                "hl": "0x000104",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x0C",
                "halted": false
              },
              "fields": {
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D0301B": "0x5AA55A"
              },
              "phase6": {
                "steps": 47298,
                "termination": "halt",
                "lastPc": 6581,
                "vram": 8482,
                "vatSnapshotCaptured": true,
                "naturalD0301BOwner": {
                  "entry": 283838,
                  "steps": 39171,
                  "termination": "stopped_before_target",
                  "lastPc": 646880,
                  "beforeD0301B": 0,
                  "afterD0301B": 5940570
                }
              },
              "lastKey": null,
              "vram": 8482,
              "status": "Coldboot complete. OS event loop is ready."
            }
          }
        },
        "start": {
          "label": "key-route:start",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": 574257,
          "lastMode": "adl",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A866",
            "af": "0x1054",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0xD1A8A3",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": true
          },
          "fields": {
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D0301B": "0x5AA55A"
          },
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "vram": 8482,
          "status": "Coldboot complete. OS event loop is ready."
        },
        "end": {
          "label": "key-route:end",
          "runtimeMode": "coldboot",
          "totalSteps": 749042,
          "lastPc": 574257,
          "lastMode": "adl",
          "cpu": {
            "pc": "0x0A229D",
            "currentBlockPc": "0x0A229D",
            "sp": "0xD1A851",
            "af": "0x0A0C",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000104",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x0C",
            "halted": false
          },
          "fields": {
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D0301B": "0x5AA55A"
          },
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": 664221,
            "controlPreStopLabel": "clear-eol-bc-zero-owner",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 74324,
            "controlStopPc": 664221,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": true,
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
            "stoppedBeforeControlClear": true,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 74340,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
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
            "vramPeak": 8518,
            "vramCurrent": 8482
          },
          "vram": 8482,
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
        }
      }
    },
    "snapshots": {
      "beforeP5": {
        "label": "beforeP5",
        "runtimeMode": "coldboot",
        "totalSteps": 312390,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1044",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x44",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A866",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x000000"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "stableSnapshotHit": {
        "label": "stableSnapshotHit",
        "runtimeMode": "coldboot",
        "totalSteps": 312390,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x001879",
          "currentBlockPc": "0x001879",
          "sp": "0xD1A87B",
          "af": "0xEE54",
          "bc": "0x000003",
          "de": "0x000430",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A866",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x000000"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "afterP5": {
        "label": "afterP5",
        "runtimeMode": "coldboot",
        "totalSteps": 588233,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A87E",
          "af": "0x1044",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xFFFFFF",
          "iy": "0xD00080",
          "f": "0x44",
          "halted": true
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x000000"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "beforeNaturalD0301BOwner": {
        "label": "beforeNaturalD0301BOwner",
        "runtimeMode": "coldboot",
        "totalSteps": 588233,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1040",
          "bc": "0x00B026",
          "de": "0xD65800",
          "hl": "0x000000",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x40",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A866",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x000000"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "afterNaturalD0301BOwner": {
        "label": "afterNaturalD0301BOwner",
        "runtimeMode": "coldboot",
        "totalSteps": 588233,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x09DEE0",
          "currentBlockPc": "0x09DEE0",
          "sp": "0xD1A878",
          "af": "0xFF54",
          "bc": "0x0000EF",
          "de": "0x000000",
          "hl": "0x000202",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": false
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x5AA55A"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "beforeStableReplay": {
        "label": "beforeStableReplay",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x09DEE0",
          "currentBlockPc": "0x09DEE0",
          "sp": "0xD1A878",
          "af": "0xFF54",
          "bc": "0x0000EF",
          "de": "0x000000",
          "hl": "0x000202",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": false
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D0301B": "0x5AA55A"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "afterStableReplay": {
        "label": "afterStableReplay",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": 0,
        "lastMode": "z80",
        "cpu": {
          "pc": "0x09DEE0",
          "currentBlockPc": "0x09DEE0",
          "sp": "0xD1A878",
          "af": "0xFF54",
          "bc": "0x0000EF",
          "de": "0x000000",
          "hl": "0x000202",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A866",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 0,
        "status": "Parsing ROM module..."
      },
      "afterPhase6BeforeExpose": {
        "label": "afterPhase6BeforeExpose",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": true
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": null,
        "lastKey": null,
        "vram": 8482,
        "status": "Parsing ROM module..."
      },
      "afterPhase6": {
        "label": "afterPhase6",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": true
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "vram": 8482,
        "status": "Parsing ROM module..."
      },
      "afterEditSeed": {
        "label": "afterEditSeed",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": true
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "vram": 8482,
        "status": "Parsing ROM module..."
      },
      "beforeKey": {
        "label": "beforeKey",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": true
        },
        "fields": {
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "vram": 8482,
        "status": "Coldboot complete. OS event loop is ready."
      },
      "beforeUiClear": {
        "label": "beforeUiClear",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0A229D",
          "currentBlockPc": "0x0A229D",
          "sp": "0xD1A851",
          "af": "0x0A0C",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000104",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x0C",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "vram": 8482,
        "status": "Coldboot complete. OS event loop is ready."
      },
      "afterUiClear": {
        "label": "afterUiClear",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0A229D",
          "currentBlockPc": "0x0A229D",
          "sp": "0xD1A851",
          "af": "0x0A0C",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000104",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x0C",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "vram": 8482,
        "status": "Coldboot complete. OS event loop is ready."
      },
      "afterKey": {
        "label": "afterKey",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": 574257,
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0A229D",
          "currentBlockPc": "0x0A229D",
          "sp": "0xD1A851",
          "af": "0x0A0C",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000104",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x0C",
          "halted": false
        },
        "fields": {
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D0301B": "0x5AA55A"
        },
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 664221,
          "controlPreStopLabel": "clear-eol-bc-zero-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 74324,
          "controlStopPc": 664221,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": true,
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
          "stoppedBeforeControlClear": true,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 74340,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
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
          "vramPeak": 8518,
          "vramCurrent": 8482
        },
        "vram": 8482,
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      }
    },
    "stableReplaySnapshot": [
      {
        "name": "D007CA",
        "addr": "0xD007CA",
        "len": 3,
        "value": "0x0585E9"
      },
      {
        "name": "D008E0",
        "addr": "0xD008E0",
        "len": 3,
        "value": "0xD1A866"
      },
      {
        "name": "D02505",
        "addr": "0xD02505",
        "len": 1,
        "value": "0x00000A"
      },
      {
        "name": "D02587",
        "addr": "0xD02587",
        "len": 3,
        "value": "0xD2A8E2"
      },
      {
        "name": "D0258A",
        "addr": "0xD0258A",
        "len": 3,
        "value": "0xD2A8E2"
      },
      {
        "name": "D0258D",
        "addr": "0xD0258D",
        "len": 3,
        "value": "0xD2A8E2"
      },
      {
        "name": "D02590",
        "addr": "0xD02590",
        "len": 3,
        "value": "0xD3FE81"
      },
      {
        "name": "D02593",
        "addr": "0xD02593",
        "len": 3,
        "value": "0xD3FE81"
      },
      {
        "name": "D0259A",
        "addr": "0xD0259A",
        "len": 3,
        "value": "0xD3FE81"
      },
      {
        "name": "D0259D",
        "addr": "0xD0259D",
        "len": 3,
        "value": "0xD3FECD"
      },
      {
        "name": "D025A0",
        "addr": "0xD025A0",
        "len": 3,
        "value": "0xD2A8A4"
      },
      {
        "name": "D025C5",
        "addr": "0xD025C5",
        "len": 3,
        "value": "0x0C0000"
      },
      {
        "name": "D010EF",
        "addr": "0xD010EF",
        "len": 3,
        "value": "0xD2A83E"
      },
      {
        "name": "D010FE",
        "addr": "0xD010FE",
        "len": 3,
        "value": "0xD1A8CC"
      },
      {
        "name": "D010F4",
        "addr": "0xD010F4",
        "len": 1,
        "value": "0x1F"
      }
    ],
    "replayD010Values": {
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F"
    },
    "errors": []
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

