# Phase 892: Natural D008E0 / Stack-Frame Lifetime Trace

Probe: `probe-phase892-d008e0-natural-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase892-d008e0-natural-lifetime.mjs`

Serves a temporary observation-only copy of the real `browser-shell.html`, boots coldboot mode in headless Chrome, traces `D008E0` and errSP stack slots across Phase 5, Phase 5b, stable replay, Phase 6, the key event-frame helper, and Escape/CLEAR, then compares against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.

## Result

- Overall: **PASS**.
- Browser execution clean: yes.
- Natural D008E0 writes to oracle 0xD1A86C: 0.
- Helper D008E0 writes to oracle 0xD1A86C: 2.
- Stable replay D008E0 writes: 1.
- Live CLEAR errSP stack matches raw oracle stack: NO.
- Adjudication: No natural post-wipe browser route establishes D008E0=0xD1A86C. Phase 5 naturally cycles D008E0 and captures 0xD1A866 at the 0x001879 snapshot, then 0x0018F8 wipes it. Stable replay restores 0xD1A866, Phase 6 repaint zeros it again, and the only observed 0xD1A86C writes are prepareColdbootEventFrame() helper writes before Phase 6 and before the CLEAR key route. The D008E0 field matches the oracle at CLEAR, but the live errSP stack slots are not the raw realram error-frame stack.

## Source Evidence

- Source SHA-256: `0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584`
- Stable replay includes D008E0: yes.
- prepareColdbootEventFrame() writes `SCREEN_STACK_TOP - 18`: yes.
- Other source writes of `D008E0=cpu.sp` exist outside the current helper: yes.
- Manual D0301B force is absent: yes.

## D008E0 Timeline

| Point | Source | D008E0 | CPU SP | D008E0 oracle | errSP stack oracle |
| --- | --- | --- | --- | --- | --- |
| real after-CLEAR oracle | capture | 0xD1A86C | - | yes | yes |
| before Phase5 | browser natural | 0xD1A866 | 0xD1A866 | NO | NO |
| stable snapshot @0x001879 | browser natural | 0xD1A866 | 0xD1A87B | NO | NO |
| after Phase5 | browser natural after wipe | 0x000000 | 0xD1A87E | NO | NO |
| before D0301B owner | browser natural | 0xD1A866 | 0xD1A866 | NO | NO |
| after D0301B owner | browser natural owner | 0x000000 | 0xD1A878 | NO | NO |
| before stable replay | browser replay boundary | 0x000000 | 0xD1A878 | NO | NO |
| after stable replay | browser replay boundary | 0xD1A866 | 0xD1A878 | NO | NO |
| after Phase6 event-frame helper | JS helper | 0xD1A86C | 0xD1A863 | yes | NO |
| after Phase6 repaint | browser natural repaint | 0x000000 | 0xD1A866 | NO | NO |
| after edit seed | browser seed | 0x000000 | 0xD1A866 | NO | NO |
| after key event-frame helper | JS helper | 0xD1A86C | 0xD1A863 | yes | NO |
| before UI clear / at 0x0A229D | browser key route | 0xD1A86C | 0xD1A851 | yes | NO |
| after UI clear | browser UI clear | 0xD1A86C | 0xD1A851 | yes | NO |
| after key route | browser key route | 0xD1A86C | 0xD1A851 | yes | NO |

## Natural Block-Observed D008E0 Changes

| Phase | Block | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- |
| p5-launch-home | 31834 | 0xD1A866 | 0xD1A836 | 0x09A661 | 0x061DEF |
| p5-launch-home | 32630 | 0xD1A836 | 0xD1A866 | 0x09A671 | 0x061E27 |
| p5-launch-home | 32776 | 0xD1A866 | 0xD1A839 | 0x09A661 | 0x061DEF |
| p5-launch-home | 33481 | 0xD1A839 | 0xD1A866 | 0x09A671 | 0x061E27 |
| p5-launch-home | 33639 | 0xD1A866 | 0xD1A836 | 0x09A661 | 0x061DEF |
| p5-launch-home | 34794 | 0xD1A836 | 0xD1A866 | 0x09A671 | 0x061E27 |
| p5-launch-home | 34940 | 0xD1A866 | 0xD1A839 | 0x09A661 | 0x061DEF |
| p5-launch-home | 36136 | 0xD1A839 | 0xD1A866 | 0x09A671 | 0x061E27 |
| p5-launch-home | 42562 | 0xD1A866 | 0xD1A848 | 0x058D0C | 0x061DEF |
| p5-launch-home | 43964 | 0xD1A848 | 0xD1A866 | 0x058D18 | 0x061E27 |
| p5-launch-home | 48131 | 0xD1A866 | 0xD1A848 | 0x08D0F6 | 0x061DEF |
| p5-launch-home | 48139 | 0xD1A848 | 0xD1A833 | 0x08D17B | 0x061DEF |
| p5-launch-home | 48322 | 0xD1A833 | 0xD1A848 | 0x08CAA9 | 0x061E27 |
| p5-launch-home | 48328 | 0xD1A848 | 0xD1A866 | 0x08D12A | 0x061E27 |
| p5-launch-home | 84131 | 0xD1A866 | 0x000000 | 0x0018F8 | 0x001879 |
| phase5b-natural-d0301b-owner | 12 | 0xD1A866 | 0x000000 | 0x045796 | 0x045734 |
| phase6-repaint | 18 | 0xD1A86C | 0x000000 | 0x0582AC | 0x09DCAA |
| phase6-repaint | 33 | 0x000000 | 0xD1A84E | 0x08377D | 0x061DEF |
| phase6-repaint | 582 | 0xD1A84E | 0x000000 | 0x08379A | 0x061E27 |
| phase6-repaint | 45996 | 0x000000 | 0xD1A851 | 0x058350 | 0x061DEF |
| phase6-repaint | 46004 | 0xD1A851 | 0x000000 | 0x058358 | 0x061E27 |

## JS-Owned D008E0 Writes

| Phase | Source | Before | After |
| --- | --- | --- | --- |
| unscoped-js | evalWrite24 | 0x000000 | 0xD1A866 |
| unscoped-js | evalWrite24 | 0x000000 | 0xD1A866 |
| stable-replay | evalWrite24 | 0x000000 | 0xD1A866 |
| phase6-prepare-event-frame | evalWrite24 | 0xD1A866 | 0xD1A86C |
| key-prepare-event-frame | evalWrite24 | 0x000000 | 0xD1A86C |

## Raw Oracle errSP Stack

| Address | 3-byte value |
| --- | --- |
| 0xD1A86C | 0x061E27 |
| 0xD1A86F | 0x061DD1 |
| 0xD1A872 | 0x000000 |
| 0xD1A875 | 0x000000 |
| 0xD1A878 | 0x000000 |
| 0xD1A87B | 0x08C754 |

## Live CLEAR errSP Stack at 0x0A229D

| Address | 3-byte value |
| --- | --- |
| 0xD1A86C | 0xFFFFFF |
| 0xD1A86F | 0xFFFFFF |
| 0xD1A872 | 0xFFFFFF |
| 0xD1A875 | 0xFFFFFF |
| 0xD1A878 | 0xFFFFFF |
| 0xD1A87B | 0xFFFFFF |

## Target Counts

| Phase | 0x001879 | 0x0018F8 | 0x061DEF | 0x061E27 | 0x0A229D |
| --- | --- | --- | --- | --- | --- |
| unscoped-js | 0 | 0 | 0 | 0 | 0 |
| p5-launch-home | 2 | 2 | 7 | 7 | 0 |
| phase5b-natural-d0301b-owner | 0 | 0 | 0 | 0 | 0 |
| stable-replay | 0 | 0 | 0 | 0 | 0 |
| phase6-prepare-event-frame | 0 | 0 | 0 | 0 | 0 |
| phase6-repaint | 0 | 0 | 2 | 2 | 0 |
| edit-context-seed | 0 | 0 | 0 | 0 | 0 |
| key-route | 0 | 0 | 0 | 0 | 1 |
| key-prepare-event-frame | 0 | 0 | 0 | 0 | 0 |
| ui-clear | 0 | 0 | 0 | 0 | 0 |

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "pass": true,
    "cleanBrowser": true,
    "naturalOracleD008E0Writes": 0,
    "helperOracleD008E0Writes": 2,
    "stableReplayD008E0Writes": 1,
    "p5WipesD008E0": true,
    "p5StableValue": 13740134,
    "afterP5Value": 0,
    "afterReplayValue": 13740134,
    "afterPhase6Value": 0,
    "keyStackMatchesOracle": false,
    "conclusion": "No natural post-wipe browser route establishes D008E0=0xD1A86C. Phase 5 naturally cycles D008E0 and captures 0xD1A866 at the 0x001879 snapshot, then 0x0018F8 wipes it. Stable replay restores 0xD1A866, Phase 6 repaint zeros it again, and the only observed 0xD1A86C writes are prepareColdbootEventFrame() helper writes before Phase 6 and before the CLEAR key route. The D008E0 field matches the oracle at CLEAR, but the live errSP stack slots are not the raw realram error-frame stack."
  },
  "sourceEvidence": {
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
    "stableReplayIncludesD008E0": true,
    "hasOraclePrepareWrite": true,
    "hasOtherD008E0CpuSpWrites": true,
    "hasD0301BForce": false,
    "hasNaturalOwnerStop": true
  },
  "oracleFields": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
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
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000C2_IY42": "0x00"
  },
  "oracleErrSpStack": [
    {
      "addr": "0xD1A86C",
      "value": "0x061E27"
    },
    {
      "addr": "0xD1A86F",
      "value": "0x061DD1"
    },
    {
      "addr": "0xD1A872",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A875",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A878",
      "value": "0x000000"
    },
    {
      "addr": "0xD1A87B",
      "value": "0x08C754"
    }
  ],
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
        "D007CA": 361961,
        "D008E0": 0,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02317": 13805630,
        "D0231A": 13805630,
        "D0231D": 13805629,
        "D02437": 13740236,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02440": 13805630,
        "D02505": 10,
        "D02590": 13893249,
        "D0259D": 13893325,
        "D02A29": 0,
        "D0301B": 5940570,
        "D000C2_IY42": 0
      },
      "errSpStack": [],
      "cpuStack": [
        {
          "addr": 13740134,
          "value": 16777215
        },
        {
          "addr": 13740137,
          "value": 16777215
        },
        {
          "addr": 13740140,
          "value": 16777215
        },
        {
          "addr": 13740143,
          "value": 16777215
        },
        {
          "addr": 13740146,
          "value": 16777215
        },
        {
          "addr": 13740149,
          "value": 16777215
        }
      ],
      "vram": 8482,
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
      "status": "Coldboot complete. OS event loop is ready."
    },
    "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
    "vram": 8482
  },
  "state": {
    "records": {
      "unscoped-js": {
        "name": "unscoped-js",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": null,
        "start": null,
        "end": null,
        "d008e0Changes": [],
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped-js",
            "before": "0x000000",
            "after": "0xD1A866",
            "stack": {
              "label": "evalWrite24",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped-js",
            "before": "0x000000",
            "after": "0xD1A866",
            "stack": {
              "label": "evalWrite24",
              "runtimeMode": "coldboot",
              "totalSteps": 588233,
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      },
      "p5-launch-home": {
        "name": "p5-launch-home",
        "active": false,
        "blockCount": 275843,
        "prevPc": 6581,
        "lastD008E0": 0,
        "start": {
          "label": "p5-launch-home:start",
          "runtimeMode": "coldboot",
          "totalSteps": 312390,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "p5-launch-home:end",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            },
            {
              "addr": "0xD1A88D",
              "value": "0x008000"
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [
          {
            "phase": "p5-launch-home",
            "block": 31834,
            "before": "0xD1A866",
            "after": "0xD1A836",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A661",
                "currentBlockPc": "0x09A661",
                "sp": "0xD1A836",
                "af": "0x0C4A",
                "bc": "0xD3FE9A",
                "de": "0x061E27",
                "hl": "0x09A661",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A836",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A836",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A836",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 32630,
            "before": "0xD1A836",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A671",
                "currentBlockPc": "0x09A671",
                "sp": "0xD1A848",
                "af": "0xA671",
                "bc": "0x09A671",
                "de": "0xD01FD2",
                "hl": "0xD00601",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x71",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x0BCEA2"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x000C80"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x0BCF7E"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x0BD02B"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0xD01F77"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 32776,
            "before": "0xD1A866",
            "after": "0xD1A839",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A661",
                "currentBlockPc": "0x09A661",
                "sp": "0xD1A839",
                "af": "0x0D4A",
                "bc": "0xD3FE9A",
                "de": "0x061E27",
                "hl": "0x09A661",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A839",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A839",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x09A671"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A839",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x09A671"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 33481,
            "before": "0xD1A839",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A671",
                "currentBlockPc": "0x09A671",
                "sp": "0xD1A84B",
                "af": "0xA671",
                "bc": "0x09A671",
                "de": "0xD01FD2",
                "hl": "0xD00601",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x71",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A84B",
                  "value": "0x0BCEAC"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x0BCF7E"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x0BD02B"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0xD01F77"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000040"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 33639,
            "before": "0xD1A866",
            "after": "0xD1A836",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A661",
                "currentBlockPc": "0x09A661",
                "sp": "0xD1A836",
                "af": "0x0A4A",
                "bc": "0xD3FE9A",
                "de": "0x061E27",
                "hl": "0x09A661",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A836",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A836",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A836",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 34794,
            "before": "0xD1A836",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A671",
                "currentBlockPc": "0x09A671",
                "sp": "0xD1A848",
                "af": "0xA671",
                "bc": "0x09A671",
                "de": "0xD00638",
                "hl": "0xD1A8F8",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x71",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x0BCEA2"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x000AA4"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x0BCF82"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x0BD02B"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0xD01F77"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 34940,
            "before": "0xD1A866",
            "after": "0xD1A839",
            "pc": "0x09A661",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A661",
                "currentBlockPc": "0x09A661",
                "sp": "0xD1A839",
                "af": "0x0B4A",
                "bc": "0xD3FE9A",
                "de": "0x061E27",
                "hl": "0x09A661",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x4A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A839",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A839",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x09A671"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A839",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x09A671"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 36136,
            "before": "0xD1A839",
            "after": "0xD1A866",
            "pc": "0x09A671",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09A671",
                "currentBlockPc": "0x09A671",
                "sp": "0xD1A84B",
                "af": "0xA671",
                "bc": "0x09A671",
                "de": "0xD00638",
                "hl": "0xD1A8F8",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x71",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A84B",
                  "value": "0x0BCEAC"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x0BCF82"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x0BD02B"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0xD01F77"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000040"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 42562,
            "before": "0xD1A866",
            "after": "0xD1A848",
            "pc": "0x058D0C",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x058D0C",
                "currentBlockPc": "0x058D0C",
                "sp": "0xD1A848",
                "af": "0x0142",
                "bc": "0xD3FE8A",
                "de": "0x061E27",
                "hl": "0x058D0C",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A848",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE8A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x058D18"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x058D18"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 43964,
            "before": "0xD1A848",
            "after": "0xD1A866",
            "pc": "0x058D18",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x058D18",
                "currentBlockPc": "0x058D18",
                "sp": "0xD1A85A",
                "af": "0x8D18",
                "bc": "0x058D18",
                "de": "0xD1A8A3",
                "hl": "0xD3FED6",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x18",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A85A",
                  "value": "0x058C87"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x058C6E"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x09DEC2"
                },
                {
                  "addr": "0xD1A863",
                  "value": "0x09DD9E"
                },
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
                },
                {
                  "addr": "0xD1A869",
                  "value": "0xFFFFFF"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 48131,
            "before": "0xD1A866",
            "after": "0xD1A848",
            "pc": "0x08D0F6",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x08D0F6",
                "currentBlockPc": "0x08D0F6",
                "sp": "0xD1A848",
                "af": "0x0042",
                "bc": "0xD3FE81",
                "de": "0x061E27",
                "hl": "0x08D0F6",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A848",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8A3",
                "D010F4": "0x00",
                "D02317": "0xD2A83E",
                "D0231A": "0xD2A83E",
                "D0231D": "0xD2A83D",
                "D02437": "0xD1A8A3",
                "D0243A": "0xD1A8A3",
                "D0243D": "0xD2A83E",
                "D02440": "0xD2A83E",
                "D02505": "0x00",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x08D10A"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x08D10A"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 48139,
            "before": "0xD1A848",
            "after": "0xD1A833",
            "pc": "0x08D17B",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x08D17B",
                "currentBlockPc": "0x08D17B",
                "sp": "0xD1A833",
                "af": "0x0042",
                "bc": "0xD3FE81",
                "de": "0x061E27",
                "hl": "0x08D17B",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A833",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8A3",
                "D010F4": "0x00",
                "D02317": "0xD2A83E",
                "D0231A": "0xD2A83E",
                "D0231D": "0xD2A83D",
                "D02437": "0xD1A8A3",
                "D0243A": "0xD1A8A3",
                "D0243D": "0xD2A83E",
                "D02440": "0xD2A83E",
                "D02505": "0x00",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A833",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A836",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0xD1A848"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x08CAC8"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A833",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A836",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0xD1A848"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0x08CAC8"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 48322,
            "before": "0xD1A833",
            "after": "0xD1A848",
            "pc": "0x08CAA9",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x08CAA9",
                "currentBlockPc": "0x08CAA9",
                "sp": "0xD1A845",
                "af": "0xCAC8",
                "bc": "0x08CAA9",
                "de": "0x000000",
                "hl": "0xD2A83E",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0xC8",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A848",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0xD2A83E",
                "D0231A": "0xD2A83E",
                "D0231D": "0xD2A83D",
                "D02437": "0xD1A8CC",
                "D0243A": "0xD1A8CC",
                "D0243D": "0xD2A83E",
                "D02440": "0xD2A83E",
                "D02505": "0x00",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x08D10A"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A845",
                  "value": "0x08D120"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0xD1A866"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 48328,
            "before": "0xD1A848",
            "after": "0xD1A866",
            "pc": "0x08D12A",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x08D12A",
                "currentBlockPc": "0x08D12A",
                "sp": "0xD1A85A",
                "af": "0xD10A",
                "bc": "0x08D12A",
                "de": "0x000000",
                "hl": "0xD2A83E",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x0A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A866",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0xD2A83E",
                "D0231A": "0xD2A83E",
                "D0231D": "0xD2A83D",
                "D02437": "0xD1A8CC",
                "D0243A": "0xD1A8CC",
                "D0243D": "0xD2A83E",
                "D02440": "0xD2A83E",
                "D02505": "0x00",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A85A",
                  "value": "0x058CBE"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x058C6E"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x09DEC2"
                },
                {
                  "addr": "0xD1A863",
                  "value": "0x09DD9E"
                },
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
                },
                {
                  "addr": "0xD1A869",
                  "value": "0xFFFFFF"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "p5-launch-home",
            "block": 84131,
            "before": "0xD1A866",
            "after": "0x000000",
            "pc": "0x0018F8",
            "prevPc": "0x001879",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
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
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 2,
          "stableWipe0018F8": 2,
          "pushErr091A": 7,
          "popErr061E27": 7,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 1,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
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
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A863",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          "pushErr091A": {
            "block": 31833,
            "pc": "0x061DEF",
            "prevPc": "0x09A658",
            "snapshot": {
              "label": "pushErr091A",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x061DEF",
                "currentBlockPc": "0x061DEF",
                "sp": "0xD1A845",
                "af": "0x0CBB",
                "bc": "0xD1A8D4",
                "de": "0xD1A8E6",
                "hl": "0x09A671",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0xBB",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A845",
                  "value": "0x09A661"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x0BCEA2"
                },
                {
                  "addr": "0xD1A84B",
                  "value": "0x000C80"
                },
                {
                  "addr": "0xD1A84E",
                  "value": "0x0BCF7E"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x0BD02B"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          "popErr061E27": {
            "block": 32629,
            "pc": "0x061E27",
            "prevPc": "0x061E20",
            "snapshot": {
              "label": "popErr061E27",
              "runtimeMode": "coldboot",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x061E27",
                "currentBlockPc": "0x061E27",
                "sp": "0xD1A839",
                "af": "0x0C42",
                "bc": "0x09A671",
                "de": "0xD01FD2",
                "hl": "0xD00601",
                "ix": "0xFFFFFF",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0xD1A836",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x00",
                "D02590": "0xD3FE9A",
                "D0259D": "0xD3FED6",
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A836",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A839",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A83C",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A83F",
                  "value": "0x000009"
                },
                {
                  "addr": "0xD1A842",
                  "value": "0xD1A866"
                },
                {
                  "addr": "0xD1A845",
                  "value": "0x09A671"
                },
                {
                  "addr": "0xD1A848",
                  "value": "0x0BCEA2"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "lastPc": "0x000000",
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
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A866",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x000003"
                },
                {
                  "addr": "0xD1A869",
                  "value": "0xFFFFFF"
                },
                {
                  "addr": "0xD1A86C",
                  "value": "0x001C81"
                },
                {
                  "addr": "0xD1A86F",
                  "value": "0x001C48"
                },
                {
                  "addr": "0xD1A872",
                  "value": "0x0158D2"
                },
                {
                  "addr": "0xD1A875",
                  "value": "0x0158EC"
                }
              ],
              "cpuStack": [
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
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
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
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        }
      },
      "phase5b-natural-d0301b-owner": {
        "name": "phase5b-natural-d0301b-owner",
        "active": false,
        "blockCount": 39172,
        "prevPc": 646880,
        "lastD008E0": 0,
        "start": {
          "label": "phase5b-natural-d0301b-owner:start",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "phase5b-natural-d0301b-owner:end",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
            {
              "addr": "0xD1A878",
              "value": "0x09DD66"
            },
            {
              "addr": "0xD1A87B",
              "value": "0x040C26"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
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
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [
          {
            "phase": "phase5b-natural-d0301b-owner",
            "block": 12,
            "before": "0xD1A866",
            "after": "0x000000",
            "pc": "0x045796",
            "prevPc": "0x045734",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 588233,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x045796",
                "currentBlockPc": "0x045796",
                "sp": "0xD1A85A",
                "af": "0x0041",
                "bc": "0x000000",
                "de": "0xD40155",
                "hl": "0xD40154",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x41",
                "halted": false
              },
              "fields": {
                "D007CA": "0x000000",
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
                {
                  "addr": "0xD1A85A",
                  "value": "0x045768"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x000040"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x000054"
                },
                {
                  "addr": "0xD1A863",
                  "value": "0x040BF0"
                },
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
                },
                {
                  "addr": "0xD1A869",
                  "value": "0xFFFFFF"
                }
              ],
              "vram": 171,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 1,
          "ownerStop09DEE0": 1,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
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
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x000000",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x0019BE"
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "lastPc": "0x000000",
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
                "D007CA": "0x000000",
                "D008E0": "0x000000",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
                {
                  "addr": "0xD1A878",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A87B",
                  "value": "0x040C26"
                },
                {
                  "addr": "0xD1A87E",
                  "value": "0x030000"
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
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        }
      },
      "stable-replay": {
        "name": "stable-replay",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": 13740134,
        "start": {
          "label": "stable-replay:start",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
            {
              "addr": "0xD1A878",
              "value": "0x09DD66"
            },
            {
              "addr": "0xD1A87B",
              "value": "0x040C26"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
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
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "stable-replay:end",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A869",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A86C",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A86F",
              "value": "0x09EF2E"
            },
            {
              "addr": "0xD1A872",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A875",
              "value": "0x002654"
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A878",
              "value": "0x09DD66"
            },
            {
              "addr": "0xD1A87B",
              "value": "0x040C26"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
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
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [],
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "stable-replay",
            "before": "0x000000",
            "after": "0xD1A866",
            "stack": {
              "label": "evalWrite24",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x000000",
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
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A866",
                "D010EF": "0x000000",
                "D010FE": "0x000000",
                "D010F4": "0x00",
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
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A866",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A869",
                  "value": "0x000040"
                },
                {
                  "addr": "0xD1A86C",
                  "value": "0xD1A860"
                },
                {
                  "addr": "0xD1A86F",
                  "value": "0x09EF2E"
                },
                {
                  "addr": "0xD1A872",
                  "value": "0x000040"
                },
                {
                  "addr": "0xD1A875",
                  "value": "0x002654"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A878",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A87B",
                  "value": "0x040C26"
                },
                {
                  "addr": "0xD1A87E",
                  "value": "0x030000"
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
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      },
      "phase6-prepare-event-frame": {
        "name": "phase6-prepare-event-frame",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": 13740140,
        "start": {
          "label": "phase6-prepare-event-frame:start",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A869",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A86C",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A86F",
              "value": "0x09EF2E"
            },
            {
              "addr": "0xD1A872",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A875",
              "value": "0x002654"
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A878",
              "value": "0x09DD66"
            },
            {
              "addr": "0xD1A87B",
              "value": "0x040C26"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
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
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "phase6-prepare-event-frame:end",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "cpu": {
            "pc": "0x09DEE0",
            "currentBlockPc": "0x09DEE0",
            "sp": "0xD1A863",
            "af": "0xFF40",
            "bc": "0x0000EF",
            "de": "0x000000",
            "hl": "0x000202",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [],
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "before": "0xD1A866",
            "after": "0xD1A86C",
            "stack": {
              "label": "evalWrite24",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "cpu": {
                "pc": "0x09DEE0",
                "currentBlockPc": "0x09DEE0",
                "sp": "0xD1A863",
                "af": "0xFF40",
                "bc": "0x0000EF",
                "de": "0x000000",
                "hl": "0x000202",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x40",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
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
              "cpuStack": [
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      },
      "phase6-repaint": {
        "name": "phase6-repaint",
        "active": false,
        "blockCount": 47243,
        "prevPc": 6581,
        "lastD008E0": 0,
        "start": {
          "label": "phase6-repaint:start",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "cpu": {
            "pc": "0x09DEE0",
            "currentBlockPc": "0x09DEE0",
            "sp": "0xD1A863",
            "af": "0xFF40",
            "bc": "0x0000EF",
            "de": "0x000000",
            "hl": "0x000202",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "phase6-repaint:end",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8A3",
            "D0243D": "0xD2A815",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [
          {
            "phase": "phase6-repaint",
            "block": 18,
            "before": "0xD1A86C",
            "after": "0x000000",
            "pc": "0x0582AC",
            "prevPc": "0x09DCAA",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x0582AC",
                "currentBlockPc": "0x0582AC",
                "sp": "0xD1A863",
                "af": "0x0E54",
                "bc": "0x000000",
                "de": "0xD007DF",
                "hl": "0x000000",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x54",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0x000000",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "phase6-repaint",
            "block": 33,
            "before": "0x000000",
            "after": "0xD1A84E",
            "pc": "0x08377D",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x08377D",
                "currentBlockPc": "0x08377D",
                "sp": "0xD1A84E",
                "af": "0x0042",
                "bc": "0xD3FE81",
                "de": "0x061E27",
                "hl": "0x08377D",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A84E",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A84E",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x08379A"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A84E",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x08379A"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "phase6-repaint",
            "block": 582,
            "before": "0xD1A84E",
            "after": "0x000000",
            "pc": "0x08379A",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x08379A",
                "currentBlockPc": "0x08379A",
                "sp": "0xD1A860",
                "af": "0x379A",
                "bc": "0x08379A",
                "de": "0xD3FE81",
                "hl": "0x08377D",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x9A",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0x000000",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
                {
                  "addr": "0xD1A860",
                  "value": "0x0582B4"
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
                },
                {
                  "addr": "0xD1A86C",
                  "value": "0xFFFFFF"
                },
                {
                  "addr": "0xD1A86F",
                  "value": "0xFFFFFF"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "phase6-repaint",
            "block": 45996,
            "before": "0x000000",
            "after": "0xD1A851",
            "pc": "0x058350",
            "prevPc": "0x061DEF",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x058350",
                "currentBlockPc": "0x058350",
                "sp": "0xD1A851",
                "af": "0x0042",
                "bc": "0xD3FE81",
                "de": "0x061E27",
                "hl": "0x058350",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x42",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A851",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A851",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x05845D"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A851",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x05845D"
                }
              ],
              "vram": 8482,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          {
            "phase": "phase6-repaint",
            "block": 46004,
            "before": "0xD1A851",
            "after": "0x000000",
            "pc": "0x058358",
            "prevPc": "0x061E27",
            "snapshot": {
              "label": "d008e0-change",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x058358",
                "currentBlockPc": "0x058358",
                "sp": "0xD1A863",
                "af": "0x845D",
                "bc": "0x058358",
                "de": "0x061E27",
                "hl": "0x058350",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x5D",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0x000000",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
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
                }
              ],
              "vram": 8482,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        ],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 2,
          "popErr061E27": 2,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 1,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {
          "phase6Repaint058241": {
            "block": 1,
            "pc": "0x058241",
            "prevPc": null,
            "snapshot": {
              "label": "phase6Repaint058241",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x058241",
                "currentBlockPc": "0x058241",
                "sp": "0xD1A863",
                "af": "0xFF40",
                "bc": "0x0000EF",
                "de": "0x000000",
                "hl": "0x000202",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x40",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
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
              "cpuStack": [
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
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          "pushErr091A": {
            "block": 32,
            "pc": "0x061DEF",
            "prevPc": "0x083775",
            "snapshot": {
              "label": "pushErr091A",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x061DEF",
                "currentBlockPc": "0x061DEF",
                "sp": "0xD1A85D",
                "af": "0x0044",
                "bc": "0xFFFFF5",
                "de": "0xD00624",
                "hl": "0x08379A",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x44",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0x000000",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [],
              "cpuStack": [
                {
                  "addr": "0xD1A85D",
                  "value": "0x08377D"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x0582B4"
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
                },
                {
                  "addr": "0xD1A86C",
                  "value": "0xFFFFFF"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          },
          "popErr061E27": {
            "block": 581,
            "pc": "0x061E27",
            "prevPc": "0x061E20",
            "snapshot": {
              "label": "popErr061E27",
              "runtimeMode": "coldboot",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x061E27",
                "currentBlockPc": "0x061E27",
                "sp": "0xD1A851",
                "af": "0xFEBB",
                "bc": "0x08379A",
                "de": "0xD3FE81",
                "hl": "0x08377D",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0xBB",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A84E",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
                "D02317": "0x000000",
                "D0231A": "0x000000",
                "D0231D": "0x000000",
                "D02437": "0x000000",
                "D0243A": "0x000000",
                "D0243D": "0x000000",
                "D02440": "0x000000",
                "D02505": "0x0A",
                "D02590": "0xD3FE81",
                "D0259D": "0xD3FECD",
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
                {
                  "addr": "0xD1A84E",
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A851",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x08379A"
                }
              ],
              "cpuStack": [
                {
                  "addr": "0xD1A851",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A854",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x000000"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x08379A"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x0582B4"
                }
              ],
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "status": "Parsing ROM module..."
            }
          }
        }
      },
      "edit-context-seed": {
        "name": "edit-context-seed",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": 0,
        "start": {
          "label": "edit-context-seed:start",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
            "D0243A": "0xD1A8A3",
            "D0243D": "0xD2A815",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Parsing ROM module..."
        },
        "end": {
          "label": "edit-context-seed:end",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Parsing ROM module..."
        },
        "d008e0Changes": [],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      },
      "key-route": {
        "name": "key-route",
        "active": false,
        "blockCount": 74324,
        "prevPc": 664221,
        "lastD008E0": 13740140,
        "start": {
          "label": "key-route:start",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        },
        "end": {
          "label": "key-route:end",
          "runtimeMode": "coldboot",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
        },
        "d008e0Changes": [],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 2,
          "clearAnchor0A229D": 1
        },
        "targetFirst": {
          "keyCxMain0585E9": {
            "block": 2149,
            "pc": "0x0585E9",
            "prevPc": "0x08C745",
            "snapshot": {
              "label": "keyCxMain0585E9",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x0585E9",
                "currentBlockPc": "0x0585E9",
                "sp": "0xD1A854",
                "af": "0x0F03",
                "bc": "0x000F00",
                "de": "0xD2A815",
                "hl": "0x0585E9",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x03",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
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
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
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
              "cpuStack": [
                {
                  "addr": "0xD1A854",
                  "value": "0x08C73D"
                },
                {
                  "addr": "0xD1A857",
                  "value": "0x000F0F"
                },
                {
                  "addr": "0xD1A85A",
                  "value": "0x00FFFF"
                },
                {
                  "addr": "0xD1A85D",
                  "value": "0x08C53A"
                },
                {
                  "addr": "0xD1A860",
                  "value": "0x000FA3"
                },
                {
                  "addr": "0xD1A863",
                  "value": "0x0019B5"
                }
              ],
              "vram": 8518,
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
              "status": "Coldboot complete. OS event loop is ready."
            }
          },
          "clearAnchor0A229D": {
            "block": 74324,
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
            "snapshot": {
              "label": "clearAnchor0A229D",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
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
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
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
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
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
              "cpuStack": [
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
                }
              ],
              "vram": 8482,
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
              "status": "Coldboot complete. OS event loop is ready."
            }
          }
        }
      },
      "key-prepare-event-frame": {
        "name": "key-prepare-event-frame",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": 13740140,
        "start": {
          "label": "key-prepare-event-frame:start",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0x000000",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [],
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        },
        "end": {
          "label": "key-prepare-event-frame:end",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A863",
            "af": "0x1040",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0xD1A8A3",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        },
        "d008e0Changes": [],
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "before": "0x000000",
            "after": "0xD1A86C",
            "stack": {
              "label": "evalWrite24",
              "runtimeMode": "coldboot",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "cpu": {
                "pc": "0x0019B5",
                "currentBlockPc": "0x0019B5",
                "sp": "0xD1A863",
                "af": "0x1040",
                "bc": "0x000000",
                "de": "0xD2A815",
                "hl": "0xD1A8A3",
                "ix": "0xD1A860",
                "iy": "0xD00080",
                "f": "0x40",
                "halted": false
              },
              "fields": {
                "D007CA": "0x0585E9",
                "D008E0": "0xD1A86C",
                "D010EF": "0xD2A83E",
                "D010FE": "0xD1A8CC",
                "D010F4": "0x1F",
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
                "D02A29": "0x0000",
                "D0301B": "0x5AA55A",
                "D000C2_IY42": "0x00"
              },
              "errSpStack": [
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
              "cpuStack": [
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
                }
              ],
              "vram": 8482,
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
              "status": "Coldboot complete. OS event loop is ready."
            }
          }
        ],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      },
      "ui-clear": {
        "name": "ui-clear",
        "active": false,
        "blockCount": 0,
        "prevPc": null,
        "lastD008E0": 13740140,
        "start": {
          "label": "ui-clear:start",
          "runtimeMode": "coldboot",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        },
        "end": {
          "label": "ui-clear:end",
          "runtimeMode": "coldboot",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        },
        "d008e0Changes": [],
        "jsWrites": [],
        "targetCounts": {
          "stableSnapshot001879": 0,
          "stableWipe0018F8": 0,
          "pushErr091A": 0,
          "popErr061E27": 0,
          "naturalOwner0454BE": 0,
          "ownerStop09DEE0": 0,
          "phase6Repaint058241": 0,
          "keyCxMain0585E9": 0,
          "clearAnchor0A229D": 0
        },
        "targetFirst": {}
      }
    },
    "snapshots": {
      "beforeP5": {
        "label": "beforeP5",
        "runtimeMode": "coldboot",
        "totalSteps": 312390,
        "lastPc": "0x000000",
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
          "D007CA": "0x000000",
          "D008E0": "0xD1A866",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
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
          }
        ],
        "cpuStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
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
          }
        ],
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "stableSnapshotHit": {
        "label": "stableSnapshotHit",
        "runtimeMode": "coldboot",
        "totalSteps": 312390,
        "lastPc": "0x000000",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x000003"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x001C81"
          },
          {
            "addr": "0xD1A86F",
            "value": "0x001C48"
          },
          {
            "addr": "0xD1A872",
            "value": "0x0158D2"
          },
          {
            "addr": "0xD1A875",
            "value": "0x0158EC"
          }
        ],
        "cpuStack": [
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
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "afterP5": {
        "label": "afterP5",
        "runtimeMode": "coldboot",
        "totalSteps": 588233,
        "lastPc": "0x000000",
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
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "beforeNaturalD0301BOwner": {
        "label": "beforeNaturalD0301BOwner",
        "runtimeMode": "coldboot",
        "totalSteps": 588233,
        "lastPc": "0x000000",
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
          "D007CA": "0x000000",
          "D008E0": "0xD1A866",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
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
          }
        ],
        "cpuStack": [
          {
            "addr": "0xD1A866",
            "value": "0x0019BE"
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
          }
        ],
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "afterNaturalD0301BOwner": {
        "label": "afterNaturalD0301BOwner",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": "0x000000",
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
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
          {
            "addr": "0xD1A878",
            "value": "0x09DD66"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x040C26"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x030000"
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
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "beforeStableReplay": {
        "label": "beforeStableReplay",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": "0x000000",
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
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
          {
            "addr": "0xD1A878",
            "value": "0x09DD66"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x040C26"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x030000"
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
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "afterStableReplay": {
        "label": "afterStableReplay",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": "0x000000",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A869",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A86F",
            "value": "0x09EF2E"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A875",
            "value": "0x002654"
          }
        ],
        "cpuStack": [
          {
            "addr": "0xD1A878",
            "value": "0x09DD66"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x040C26"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x030000"
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
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "phase6-prepare-event-frame:before": {
        "label": "phase6-prepare-event-frame:before",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": "0x000000",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
          {
            "addr": "0xD1A866",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A869",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A86F",
            "value": "0x09EF2E"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A875",
            "value": "0x002654"
          }
        ],
        "cpuStack": [
          {
            "addr": "0xD1A878",
            "value": "0x09DD66"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x040C26"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x030000"
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
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "phase6-prepare-event-frame:after": {
        "label": "phase6-prepare-event-frame:after",
        "runtimeMode": "coldboot",
        "totalSteps": 627404,
        "lastPc": "0x08C331",
        "lastMode": "adl",
        "cpu": {
          "pc": "0x09DEE0",
          "currentBlockPc": "0x09DEE0",
          "sp": "0xD1A863",
          "af": "0xFF40",
          "bc": "0x0000EF",
          "de": "0x000000",
          "hl": "0x000202",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x40",
          "halted": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 0,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "afterPhase6Run": {
        "label": "afterPhase6Run",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
        "phase6": null,
        "lastKey": null,
        "status": "Parsing ROM module..."
      },
      "beforeEditSeed": {
        "label": "beforeEditSeed",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Parsing ROM module..."
      },
      "afterEditSeed": {
        "label": "afterEditSeed",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Parsing ROM module..."
      },
      "beforeKey": {
        "label": "beforeKey",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "key-prepare-event-frame:before": {
        "label": "key-prepare-event-frame:before",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [],
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "key-prepare-event-frame:after": {
        "label": "key-prepare-event-frame:after",
        "runtimeMode": "coldboot",
        "totalSteps": 674702,
        "lastPc": "0x08C331",
        "lastMode": "adl",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A863",
          "af": "0x1040",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x40",
          "halted": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "beforeUiClearCall": {
        "label": "beforeUiClearCall",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "beforeUiClear": {
        "label": "beforeUiClear",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "afterUiClear": {
        "label": "afterUiClear",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Coldboot complete. OS event loop is ready."
      },
      "afterKey": {
        "label": "afterKey",
        "runtimeMode": "coldboot",
        "totalSteps": 749042,
        "lastPc": "0x08C331",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
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
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00"
        },
        "errSpStack": [
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
        "cpuStack": [
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
          }
        ],
        "vram": 8482,
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
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      }
    },
    "jsWrites": [
      {
        "source": "evalWrite24",
        "phase": "unscoped-js",
        "before": "0x000000",
        "after": "0xD1A866",
        "stack": {
          "label": "evalWrite24",
          "runtimeMode": "coldboot",
          "totalSteps": 312390,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        }
      },
      {
        "source": "evalWrite24",
        "phase": "unscoped-js",
        "before": "0x000000",
        "after": "0xD1A866",
        "stack": {
          "label": "evalWrite24",
          "runtimeMode": "coldboot",
          "totalSteps": 588233,
          "lastPc": "0x000000",
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
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A866",
              "value": "0x0019BE"
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        }
      },
      {
        "source": "evalWrite24",
        "phase": "stable-replay",
        "before": "0x000000",
        "after": "0xD1A866",
        "stack": {
          "label": "evalWrite24",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
            {
              "addr": "0xD1A866",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A869",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A86C",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A86F",
              "value": "0x09EF2E"
            },
            {
              "addr": "0xD1A872",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A875",
              "value": "0x002654"
            }
          ],
          "cpuStack": [
            {
              "addr": "0xD1A878",
              "value": "0x09DD66"
            },
            {
              "addr": "0xD1A87B",
              "value": "0x040C26"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
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
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        }
      },
      {
        "source": "evalWrite24",
        "phase": "phase6-prepare-event-frame",
        "before": "0xD1A866",
        "after": "0xD1A86C",
        "stack": {
          "label": "evalWrite24",
          "runtimeMode": "coldboot",
          "totalSteps": 627404,
          "lastPc": "0x000000",
          "lastMode": "z80",
          "cpu": {
            "pc": "0x09DEE0",
            "currentBlockPc": "0x09DEE0",
            "sp": "0xD1A863",
            "af": "0xFF40",
            "bc": "0x0000EF",
            "de": "0x000000",
            "hl": "0x000202",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 0,
          "phase6": null,
          "lastKey": null,
          "status": "Parsing ROM module..."
        }
      },
      {
        "source": "evalWrite24",
        "phase": "key-prepare-event-frame",
        "before": "0x000000",
        "after": "0xD1A86C",
        "stack": {
          "label": "evalWrite24",
          "runtimeMode": "coldboot",
          "totalSteps": 674702,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "cpu": {
            "pc": "0x0019B5",
            "currentBlockPc": "0x0019B5",
            "sp": "0xD1A863",
            "af": "0x1040",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0xD1A8A3",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
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
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00"
          },
          "errSpStack": [
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
          "cpuStack": [
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
            }
          ],
          "vram": 8482,
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
          "status": "Coldboot complete. OS event loop is ready."
        }
      }
    ],
    "helperCallCount": 2,
    "errors": []
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

