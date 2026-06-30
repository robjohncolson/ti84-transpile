# Phase 893: D008E0 Field/Stack A/B Adjudication

Probe: `probe-phase893-d008e0-field-stack-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase893-d008e0-field-stack-ab.mjs`

Serves a temporary instrumented copy of `browser-shell.html` and runs three browser-local A/B scenarios: the current helper field-only route, a route that suppresses only `prepareColdbootEventFrame()` writes of `D008E0=SCREEN_STACK_TOP-18`, and a route that keeps the helper field write while also injecting the raw oracle errSP stack packet at `D1A86C..D1A87D`.

## Result

- Overall: **PASS**.
- Baseline field-only route clean: yes.
- No-helper route clean: yes.
- No-helper final field mismatches: D008E0.
- Field-plus-stack route clean: yes.
- Field-plus-stack oracle stack preserved through CLEAR: yes.
- Stack packet behaviorally load-bearing in this bounded route: no.
- Adjudication: The D008E0 helper field write is load-bearing for oracle field fidelity: suppressing only that write leaves D008E0 mismatched after CLEAR. The raw errSP stack packet is not behaviorally load-bearing for the bounded browser CLEAR route: adding the exact stack slots preserves clean Phase6/CLEAR behavior and only changes the stack bytes from FFFFFF to the raw oracle packet.

## Variant Summary

| Variant | Completed | Phase6 | CLEAR | Page errors | Helper writes | Skipped writes | Stack injections | Final D008E0 | Field mismatches | Stack mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current helper field-only baseline | yes | clean | clean | 0 | 2 | 0 | 0 | 0xD1A86C | 0 | 6 |
| no prepareColdbootEventFrame D008E0 oracle write | yes | clean | clean | 0 | 0 | 2 | 0 | 0x000000 | 1 | 6 |
| helper field plus raw oracle errSP stack slots | yes | clean | clean | 0 | 2 | 0 | 2 | 0xD1A86C | 0 | 0 |

## Oracle Stack Packet

| Address | 3-byte value |
| --- | --- |
| 0xD1A86C | 0x061E27 |
| 0xD1A86F | 0x061DD1 |
| 0xD1A872 | 0x000000 |
| 0xD1A875 | 0x000000 |
| 0xD1A878 | 0x000000 |
| 0xD1A87B | 0x08C754 |

## Final Mismatches by Variant

### current helper field-only baseline


Watched fields match the after-CLEAR oracle.

| Address | Actual | Oracle |
| --- | --- | --- |
| 0xD1A86C | 0xFFFFFF | 0x061E27 |
| 0xD1A86F | 0xFFFFFF | 0x061DD1 |
| 0xD1A872 | 0xFFFFFF | 0x000000 |
| 0xD1A875 | 0xFFFFFF | 0x000000 |
| 0xD1A878 | 0xFFFFFF | 0x000000 |
| 0xD1A87B | 0xFFFFFF | 0x08C754 |

### no prepareColdbootEventFrame D008E0 oracle write


| Field | Actual | Oracle |
| --- | --- | --- |
| D008E0 | 0x000000 | 0xD1A86C |

| Address | Actual | Oracle |
| --- | --- | --- |
| 0xD1A86C | 0xFFFFFF | 0x061E27 |
| 0xD1A86F | 0xFFFFFF | 0x061DD1 |
| 0xD1A872 | 0xFFFFFF | 0x000000 |
| 0xD1A875 | 0xFFFFFF | 0x000000 |
| 0xD1A878 | 0xFFFFFF | 0x000000 |
| 0xD1A87B | 0xFFFFFF | 0x08C754 |

### helper field plus raw oracle errSP stack slots


Watched fields match the after-CLEAR oracle.

Fixed-address `D1A86C` stack slots match the after-CLEAR oracle.

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "baselineClean": true,
    "noHelperClean": true,
    "stackVariantClean": true,
    "stackVariantStackMatches": true,
    "noHelperFieldMismatchNames": [
      "D008E0"
    ],
    "stackPacketLoadBearing": false,
    "conclusion": "The D008E0 helper field write is load-bearing for oracle field fidelity: suppressing only that write leaves D008E0 mismatched after CLEAR. The raw errSP stack packet is not behaviorally load-bearing for the bounded browser CLEAR route: adding the exact stack slots preserves clean Phase6/CLEAR behavior and only changes the stack bytes from FFFFFF to the raw oracle packet."
  },
  "sourceEvidence": {
    "sha256": "0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584",
    "hasOraclePrepareWrite": true,
    "hasNaturalOwnerStop": true,
    "hasD0301BForce": false
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
  "oracleStack": [
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
  "scenarios": [
    {
      "id": "baseline",
      "label": "current helper field-only baseline",
      "pageUrl": "http://127.0.0.1:62110/browser-shell.html?phase893=baseline",
      "completed": true,
      "rawState": {
        "variant": "baseline",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "baseline",
            "totalSteps": 627404,
            "lastPc": 0,
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740134,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
              {
                "addr": 13740134,
                "value": 0
              },
              {
                "addr": 13740137,
                "value": 64
              },
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              },
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              }
            ],
            "cpuStack": [
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              },
              {
                "addr": 13740158,
                "value": 196608
              },
              {
                "addr": 13740161,
                "value": 0
              },
              {
                "addr": 13740164,
                "value": 0
              },
              {
                "addr": 13740167,
                "value": 0
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740152,
              "af": 65364,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 84,
              "halted": false
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "baseline",
            "totalSteps": 627404,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740140,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740131,
              "af": 65344,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
              }
            ],
            "cpu": {
              "pc": 6581,
              "currentBlockPc": 6581,
              "sp": 13740131,
              "af": 4160,
              "bc": 0,
              "de": 13805589,
              "hl": 13740195,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "errSpStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4164,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 16777215,
                "iy": 13631616,
                "f": 68,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 588233,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4160,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 0
                },
                {
                  "addr": 13740137,
                  "value": 64
                },
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                }
              ],
              "oracleAddrStack": [
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                },
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                },
                {
                  "addr": 13740158,
                  "value": 196608
                },
                {
                  "addr": 13740161,
                  "value": 0
                },
                {
                  "addr": 13740164,
                  "value": 0
                },
                {
                  "addr": 13740167,
                  "value": 0
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740152,
                "af": 65364,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 84,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": 13633760,
            "before": 13740134,
            "after": 13740140,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740140,
                "D010EF": 13805630,
                "D010FE": 13740236,
                "D010F4": 31,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 10,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740131,
                "af": 65344,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": 13633760,
            "before": 0,
            "after": 13740140,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "errSpStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740131,
                "af": 4160,
                "bc": 0,
                "de": 13805589,
                "hl": 13740195,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          }
        ],
        "skippedWrites": [],
        "stackInjections": [],
        "errors": [],
        "helperCallCount": 2,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "baseline",
          "totalSteps": 749042,
          "lastPc": 574257,
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
          "errSpStack": [
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
            },
            {
              "addr": 13740152,
              "value": 16777215
            },
            {
              "addr": 13740155,
              "value": 16777215
            }
          ],
          "oracleAddrStack": [
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
            },
            {
              "addr": 13740152,
              "value": 16777215
            },
            {
              "addr": 13740155,
              "value": 16777215
            }
          ],
          "cpuStack": [
            {
              "addr": 13740113,
              "value": 363034
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 9
            },
            {
              "addr": 13740122,
              "value": 653226
            },
            {
              "addr": 13740125,
              "value": 574778
            },
            {
              "addr": 13740128,
              "value": 2467
            }
          ],
          "cpu": {
            "pc": 664221,
            "currentBlockPc": 664221,
            "sp": 13740113,
            "af": 2572,
            "bc": 24,
            "de": 319,
            "hl": 260,
            "ix": 13740128,
            "iy": 13631616,
            "f": 12,
            "halted": false
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "state": {
        "variant": "baseline",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "baseline",
            "totalSteps": 627404,
            "lastPc": "0x000000",
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
              },
              {
                "addr": "0xD1A878",
                "value": "0x09DD66"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x040C26"
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
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "baseline",
            "totalSteps": 627404,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "baseline",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "baseline",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "oracleAddrStack": [
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
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 588233,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": "0xD1A878",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A87B",
                  "value": "0x040C26"
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0xD1A866",
            "after": "0xD1A86C",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A86C",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "baseline",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "oracleAddrStack": [
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
              }
            }
          }
        ],
        "skippedWrites": [],
        "stackInjections": [],
        "errors": [],
        "helperCallCount": 2,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "baseline",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
          "oracleAddrStack": [
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
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "analysis": {
        "cleanPhase6": true,
        "cleanClear": true,
        "pageErrors": [],
        "helperWrites": 2,
        "skippedPrepareWrites": 0,
        "stackInjectionCount": 0,
        "finalD008E0": 13740140,
        "beforeUiClearD008E0": 13740140,
        "finalFieldMismatches": [],
        "beforeUiClearFieldMismatches": [],
        "finalStackMismatches": [
          {
            "addr": "0xD1A86C",
            "actual": "0xFFFFFF",
            "oracle": "0x061E27"
          },
          {
            "addr": "0xD1A86F",
            "actual": "0xFFFFFF",
            "oracle": "0x061DD1"
          },
          {
            "addr": "0xD1A872",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A878",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "actual": "0xFFFFFF",
            "oracle": "0x08C754"
          }
        ],
        "beforeUiStackMismatches": [
          {
            "addr": "0xD1A86C",
            "actual": "0xFFFFFF",
            "oracle": "0x061E27"
          },
          {
            "addr": "0xD1A86F",
            "actual": "0xFFFFFF",
            "oracle": "0x061DD1"
          },
          {
            "addr": "0xD1A872",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A878",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "actual": "0xFFFFFF",
            "oracle": "0x08C754"
          }
        ],
        "finalStackMatchesOracle": false,
        "beforeUiStackMatchesOracle": false
      }
    },
    {
      "id": "no_prepare_d008e0",
      "label": "no prepareColdbootEventFrame D008E0 oracle write",
      "pageUrl": "http://127.0.0.1:62110/browser-shell.html?phase893=no_prepare_d008e0",
      "completed": true,
      "rawState": {
        "variant": "no_prepare_d008e0",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "no_prepare_d008e0",
            "totalSteps": 627404,
            "lastPc": 0,
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740134,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
              {
                "addr": 13740134,
                "value": 0
              },
              {
                "addr": 13740137,
                "value": 64
              },
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              },
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              }
            ],
            "cpuStack": [
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              },
              {
                "addr": 13740158,
                "value": 196608
              },
              {
                "addr": 13740161,
                "value": 0
              },
              {
                "addr": 13740164,
                "value": 0
              },
              {
                "addr": 13740167,
                "value": 0
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740152,
              "af": 65364,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 84,
              "halted": false
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "no_prepare_d008e0",
            "totalSteps": 627404,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740134,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740131,
              "af": 65344,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
              }
            ],
            "cpu": {
              "pc": 6581,
              "currentBlockPc": 6581,
              "sp": 13740131,
              "af": 4160,
              "bc": 0,
              "de": 13805589,
              "hl": 13740195,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
              "D008E0": 0,
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
            "oracleAddrStack": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4164,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 16777215,
                "iy": 13631616,
                "f": 68,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 588233,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4160,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 0
                },
                {
                  "addr": 13740137,
                  "value": 64
                },
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                }
              ],
              "oracleAddrStack": [
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                },
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                },
                {
                  "addr": 13740158,
                  "value": 196608
                },
                {
                  "addr": 13740161,
                  "value": 0
                },
                {
                  "addr": 13740164,
                  "value": 0
                },
                {
                  "addr": 13740167,
                  "value": 0
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740152,
                "af": 65364,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 84,
                "halted": false
              }
            }
          }
        ],
        "skippedWrites": [
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": 13633760,
            "before": 13740134,
            "attempted": 13740140,
            "snapshot": {
              "label": "skipped-d008e0-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740134,
                "D010EF": 13805630,
                "D010FE": 13740236,
                "D010F4": 31,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 10,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740131,
                "af": 65344,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": 13633760,
            "before": 0,
            "attempted": 13740140,
            "snapshot": {
              "label": "skipped-d008e0-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740131,
                "af": 4160,
                "bc": 0,
                "de": 13805589,
                "hl": 13740195,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          }
        ],
        "stackInjections": [],
        "errors": [],
        "helperCallCount": 2,
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
          "D008E0": 0,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "no_prepare_d008e0",
          "totalSteps": 749042,
          "lastPc": 574257,
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "D008E0": 0,
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
          "oracleAddrStack": [
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
            },
            {
              "addr": 13740152,
              "value": 16777215
            },
            {
              "addr": 13740155,
              "value": 16777215
            }
          ],
          "cpuStack": [
            {
              "addr": 13740113,
              "value": 363034
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 9
            },
            {
              "addr": 13740122,
              "value": 653226
            },
            {
              "addr": 13740125,
              "value": 574778
            },
            {
              "addr": 13740128,
              "value": 2467
            }
          ],
          "cpu": {
            "pc": 664221,
            "currentBlockPc": 664221,
            "sp": 13740113,
            "af": 2572,
            "bc": 24,
            "de": 319,
            "hl": 260,
            "ix": 13740128,
            "iy": 13631616,
            "f": 12,
            "halted": false
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "state": {
        "variant": "no_prepare_d008e0",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "no_prepare_d008e0",
            "totalSteps": 627404,
            "lastPc": "0x000000",
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
              },
              {
                "addr": "0xD1A878",
                "value": "0x09DD66"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x040C26"
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
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "no_prepare_d008e0",
            "totalSteps": 627404,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "no_prepare_d008e0",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "no_prepare_d008e0",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
              "D008E0": 0,
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
            "oracleAddrStack": [
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
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 588233,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": "0xD1A878",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A87B",
                  "value": "0x040C26"
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
              }
            }
          }
        ],
        "skippedWrites": [
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0xD1A866",
            "attempted": "0xD1A86C",
            "snapshot": {
              "label": "skipped-d008e0-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0x000000",
            "attempted": "0xD1A86C",
            "snapshot": {
              "label": "skipped-d008e0-write",
              "variant": "no_prepare_d008e0",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "oracleAddrStack": [
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
              }
            }
          }
        ],
        "stackInjections": [],
        "errors": [],
        "helperCallCount": 2,
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
          "D008E0": 0,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "no_prepare_d008e0",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "D008E0": 0,
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
          "oracleAddrStack": [
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
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "analysis": {
        "cleanPhase6": true,
        "cleanClear": true,
        "pageErrors": [],
        "helperWrites": 0,
        "skippedPrepareWrites": 2,
        "stackInjectionCount": 0,
        "finalD008E0": 0,
        "beforeUiClearD008E0": 0,
        "finalFieldMismatches": [
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          }
        ],
        "beforeUiClearFieldMismatches": [
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          }
        ],
        "finalStackMismatches": [
          {
            "addr": "0xD1A86C",
            "actual": "0xFFFFFF",
            "oracle": "0x061E27"
          },
          {
            "addr": "0xD1A86F",
            "actual": "0xFFFFFF",
            "oracle": "0x061DD1"
          },
          {
            "addr": "0xD1A872",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A878",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "actual": "0xFFFFFF",
            "oracle": "0x08C754"
          }
        ],
        "beforeUiStackMismatches": [
          {
            "addr": "0xD1A86C",
            "actual": "0xFFFFFF",
            "oracle": "0x061E27"
          },
          {
            "addr": "0xD1A86F",
            "actual": "0xFFFFFF",
            "oracle": "0x061DD1"
          },
          {
            "addr": "0xD1A872",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A878",
            "actual": "0xFFFFFF",
            "oracle": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "actual": "0xFFFFFF",
            "oracle": "0x08C754"
          }
        ],
        "finalStackMatchesOracle": false,
        "beforeUiStackMatchesOracle": false
      }
    },
    {
      "id": "field_plus_stack",
      "label": "helper field plus raw oracle errSP stack slots",
      "pageUrl": "http://127.0.0.1:62110/browser-shell.html?phase893=field_plus_stack",
      "completed": true,
      "rawState": {
        "variant": "field_plus_stack",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "field_plus_stack",
            "totalSteps": 627404,
            "lastPc": 0,
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740134,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
              {
                "addr": 13740134,
                "value": 0
              },
              {
                "addr": 13740137,
                "value": 64
              },
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 13740128
              },
              {
                "addr": 13740143,
                "value": 651054
              },
              {
                "addr": 13740146,
                "value": 64
              },
              {
                "addr": 13740149,
                "value": 9812
              },
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              }
            ],
            "cpuStack": [
              {
                "addr": 13740152,
                "value": 646502
              },
              {
                "addr": 13740155,
                "value": 265254
              },
              {
                "addr": 13740158,
                "value": 196608
              },
              {
                "addr": 13740161,
                "value": 0
              },
              {
                "addr": 13740164,
                "value": 0
              },
              {
                "addr": 13740167,
                "value": 0
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740152,
              "af": 65364,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 84,
              "halted": false
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "field_plus_stack",
            "totalSteps": 627404,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740140,
              "D010EF": 13805630,
              "D010FE": 13740236,
              "D010F4": 31,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02440": 0,
              "D02505": 10,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D0301B": 5940570,
              "D000C2_IY42": 0
            },
            "errSpStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              }
            ],
            "cpu": {
              "pc": 646880,
              "currentBlockPc": 646880,
              "sp": 13740131,
              "af": 65344,
              "bc": 239,
              "de": 0,
              "hl": 514,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
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
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              }
            ],
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
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
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              }
            ],
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
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
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              }
            ],
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "cpuStack": [
              {
                "addr": 13740131,
                "value": 6581
              },
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
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              }
            ],
            "cpu": {
              "pc": 6581,
              "currentBlockPc": 6581,
              "sp": 13740131,
              "af": 4160,
              "bc": 0,
              "de": 13805589,
              "hl": 13740195,
              "ix": 13740128,
              "iy": 13631616,
              "f": 64,
              "halted": false
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "errSpStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": 574257,
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "errSpStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "oracleAddrStack": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "cpuStack": [
              {
                "addr": 13740113,
                "value": 363034
              },
              {
                "addr": 13740116,
                "value": 575293
              },
              {
                "addr": 13740119,
                "value": 9
              },
              {
                "addr": 13740122,
                "value": 653226
              },
              {
                "addr": 13740125,
                "value": 574778
              },
              {
                "addr": 13740128,
                "value": 2467
              }
            ],
            "cpu": {
              "pc": 664221,
              "currentBlockPc": 664221,
              "sp": 13740113,
              "af": 2572,
              "bc": 24,
              "de": 319,
              "hl": 260,
              "ix": 13740128,
              "iy": 13631616,
              "f": 12,
              "halted": false
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 312390,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4164,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 16777215,
                "iy": 13631616,
                "f": 68,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 588233,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 0,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 0,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740134,
                  "value": 6590
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
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740134,
                "af": 4160,
                "bc": 45094,
                "de": 14047232,
                "hl": 0,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": 13633760,
            "before": 0,
            "after": 13740134,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740134,
                "D010EF": 0,
                "D010FE": 0,
                "D010F4": 0,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 0,
                "D02590": 0,
                "D0259D": 0,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740134,
                  "value": 0
                },
                {
                  "addr": 13740137,
                  "value": 64
                },
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                }
              ],
              "oracleAddrStack": [
                {
                  "addr": 13740140,
                  "value": 13740128
                },
                {
                  "addr": 13740143,
                  "value": 651054
                },
                {
                  "addr": 13740146,
                  "value": 64
                },
                {
                  "addr": 13740149,
                  "value": 9812
                },
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740152,
                  "value": 646502
                },
                {
                  "addr": 13740155,
                  "value": 265254
                },
                {
                  "addr": 13740158,
                  "value": 196608
                },
                {
                  "addr": 13740161,
                  "value": 0
                },
                {
                  "addr": 13740164,
                  "value": 0
                },
                {
                  "addr": 13740167,
                  "value": 0
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740152,
                "af": 65364,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 84,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": 13633760,
            "before": 13740134,
            "after": 13740140,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": 0,
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740140,
                "D010EF": 13805630,
                "D010FE": 13740236,
                "D010F4": 31,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 10,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740131,
                "af": 65344,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": 13633760,
            "before": 0,
            "after": 13740140,
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "errSpStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "oracleAddrStack": [
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
                },
                {
                  "addr": 13740152,
                  "value": 16777215
                },
                {
                  "addr": 13740155,
                  "value": 16777215
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                }
              ],
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740131,
                "af": 4160,
                "bc": 0,
                "de": 13805589,
                "hl": 13740195,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          }
        ],
        "skippedWrites": [],
        "stackInjections": [
          {
            "phase": "phase6-prepare-event-frame",
            "before": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "after": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "snapshot": {
              "label": "phase6-prepare-event-frame:after-stack-injection",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": 574257,
              "lastMode": "adl",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740140,
                "D010EF": 13805630,
                "D010FE": 13740236,
                "D010F4": 31,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 0,
                "D0243A": 0,
                "D0243D": 0,
                "D02440": 0,
                "D02505": 10,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D0301B": 5940570,
                "D000C2_IY42": 0
              },
              "errSpStack": [
                {
                  "addr": 13740140,
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                },
                {
                  "addr": 13740149,
                  "value": 0
                },
                {
                  "addr": 13740152,
                  "value": 0
                },
                {
                  "addr": 13740155,
                  "value": 575316
                }
              ],
              "oracleAddrStack": [
                {
                  "addr": 13740140,
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                },
                {
                  "addr": 13740149,
                  "value": 0
                },
                {
                  "addr": 13740152,
                  "value": 0
                },
                {
                  "addr": 13740155,
                  "value": 575316
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                }
              ],
              "cpu": {
                "pc": 646880,
                "currentBlockPc": 646880,
                "sp": 13740131,
                "af": 65344,
                "bc": 239,
                "de": 0,
                "hl": 514,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          },
          {
            "phase": "key-prepare-event-frame",
            "before": [
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
              },
              {
                "addr": 13740152,
                "value": 16777215
              },
              {
                "addr": 13740155,
                "value": 16777215
              }
            ],
            "after": [
              {
                "addr": 13740140,
                "value": 400935
              },
              {
                "addr": 13740143,
                "value": 400849
              },
              {
                "addr": 13740146,
                "value": 0
              },
              {
                "addr": 13740149,
                "value": 0
              },
              {
                "addr": 13740152,
                "value": 0
              },
              {
                "addr": 13740155,
                "value": 575316
              }
            ],
            "snapshot": {
              "label": "key-prepare-event-frame:after-stack-injection",
              "variant": "field_plus_stack",
              "totalSteps": 674702,
              "lastPc": 574257,
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "errSpStack": [
                {
                  "addr": 13740140,
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                },
                {
                  "addr": 13740149,
                  "value": 0
                },
                {
                  "addr": 13740152,
                  "value": 0
                },
                {
                  "addr": 13740155,
                  "value": 575316
                }
              ],
              "oracleAddrStack": [
                {
                  "addr": 13740140,
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                },
                {
                  "addr": 13740149,
                  "value": 0
                },
                {
                  "addr": 13740152,
                  "value": 0
                },
                {
                  "addr": 13740155,
                  "value": 575316
                }
              ],
              "cpuStack": [
                {
                  "addr": 13740131,
                  "value": 6581
                },
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
                  "value": 400935
                },
                {
                  "addr": 13740143,
                  "value": 400849
                },
                {
                  "addr": 13740146,
                  "value": 0
                }
              ],
              "cpu": {
                "pc": 6581,
                "currentBlockPc": 6581,
                "sp": 13740131,
                "af": 4160,
                "bc": 0,
                "de": 13805589,
                "hl": 13740195,
                "ix": 13740128,
                "iy": 13631616,
                "f": 64,
                "halted": false
              }
            }
          }
        ],
        "errors": [],
        "helperCallCount": 2,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "field_plus_stack",
          "totalSteps": 749042,
          "lastPc": 574257,
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
          "errSpStack": [
            {
              "addr": 13740140,
              "value": 400935
            },
            {
              "addr": 13740143,
              "value": 400849
            },
            {
              "addr": 13740146,
              "value": 0
            },
            {
              "addr": 13740149,
              "value": 0
            },
            {
              "addr": 13740152,
              "value": 0
            },
            {
              "addr": 13740155,
              "value": 575316
            }
          ],
          "oracleAddrStack": [
            {
              "addr": 13740140,
              "value": 400935
            },
            {
              "addr": 13740143,
              "value": 400849
            },
            {
              "addr": 13740146,
              "value": 0
            },
            {
              "addr": 13740149,
              "value": 0
            },
            {
              "addr": 13740152,
              "value": 0
            },
            {
              "addr": 13740155,
              "value": 575316
            }
          ],
          "cpuStack": [
            {
              "addr": 13740113,
              "value": 363034
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 9
            },
            {
              "addr": 13740122,
              "value": 653226
            },
            {
              "addr": 13740125,
              "value": 574778
            },
            {
              "addr": 13740128,
              "value": 2467
            }
          ],
          "cpu": {
            "pc": 664221,
            "currentBlockPc": 664221,
            "sp": 13740113,
            "af": 2572,
            "bc": 24,
            "de": 319,
            "hl": 260,
            "ix": 13740128,
            "iy": 13631616,
            "f": 12,
            "halted": false
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "state": {
        "variant": "field_plus_stack",
        "snapshots": {
          "phase6-prepare-event-frame:before": {
            "label": "phase6-prepare-event-frame:before",
            "variant": "field_plus_stack",
            "totalSteps": 627404,
            "lastPc": "0x000000",
            "lastMode": "z80",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
              },
              {
                "addr": "0xD1A878",
                "value": "0x09DD66"
              },
              {
                "addr": "0xD1A87B",
                "value": "0x040C26"
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
            }
          },
          "phase6-prepare-event-frame:after": {
            "label": "phase6-prepare-event-frame:after",
            "variant": "field_plus_stack",
            "totalSteps": 627404,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Parsing ROM module...",
            "vram": 0,
            "phase6": null,
            "lastKey": null,
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
            "oracleAddrStack": [
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
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000000"
              }
            ],
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
            }
          },
          "afterBoot": {
            "label": "afterBoot",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              }
            ],
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
            }
          },
          "beforeKey": {
            "label": "beforeKey",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              }
            ],
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
            }
          },
          "key-prepare-event-frame:before": {
            "label": "key-prepare-event-frame:before",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
              }
            ],
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
            }
          },
          "key-prepare-event-frame:after": {
            "label": "key-prepare-event-frame:after",
            "variant": "field_plus_stack",
            "totalSteps": 674702,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
                "value": "0x061E27"
              },
              {
                "addr": "0xD1A86F",
                "value": "0x061DD1"
              },
              {
                "addr": "0xD1A872",
                "value": "0x000000"
              }
            ],
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
            }
          },
          "beforeUiClear": {
            "label": "beforeUiClear",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterUiClear": {
            "label": "afterUiClear",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Coldboot complete. OS event loop is ready.",
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
            "oracleAddrStack": [
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
            }
          },
          "afterKey": {
            "label": "afterKey",
            "variant": "field_plus_stack",
            "totalSteps": 749042,
            "lastPc": "0x08C331",
            "lastMode": "adl",
            "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
            "oracleAddrStack": [
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
            }
          }
        },
        "jsWrites": [
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 312390,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 588233,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "unscoped",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A866",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
                },
                {
                  "addr": "0xD1A878",
                  "value": "0x09DD66"
                },
                {
                  "addr": "0xD1A87B",
                  "value": "0x040C26"
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "phase6-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0xD1A866",
            "after": "0xD1A86C",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": "0x000000",
              "lastMode": "z80",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
              }
            }
          },
          {
            "source": "evalWrite24",
            "phase": "key-prepare-event-frame",
            "addr": "0xD008E0",
            "before": "0x000000",
            "after": "0xD1A86C",
            "snapshot": {
              "label": "d008e0-js-write",
              "variant": "field_plus_stack",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "oracleAddrStack": [
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
              }
            }
          }
        ],
        "skippedWrites": [],
        "stackInjections": [
          {
            "phase": "phase6-prepare-event-frame",
            "before": [
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
            "after": [
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
            "snapshot": {
              "label": "phase6-prepare-event-frame:after-stack-injection",
              "variant": "field_plus_stack",
              "totalSteps": 627404,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "status": "Parsing ROM module...",
              "vram": 0,
              "phase6": null,
              "lastKey": null,
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
              "oracleAddrStack": [
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
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A86F",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A872",
                  "value": "0x000000"
                }
              ],
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
              }
            }
          },
          {
            "phase": "key-prepare-event-frame",
            "before": [
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
            "after": [
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
            "snapshot": {
              "label": "key-prepare-event-frame:after-stack-injection",
              "variant": "field_plus_stack",
              "totalSteps": 674702,
              "lastPc": "0x08C331",
              "lastMode": "adl",
              "status": "Coldboot complete. OS event loop is ready.",
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
              "oracleAddrStack": [
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
                  "value": "0x061E27"
                },
                {
                  "addr": "0xD1A86F",
                  "value": "0x061DD1"
                },
                {
                  "addr": "0xD1A872",
                  "value": "0x000000"
                }
              ],
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
              }
            }
          }
        ],
        "errors": [],
        "helperCallCount": 2,
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
        "finalSnapshot": {
          "label": "final",
          "variant": "field_plus_stack",
          "totalSteps": 749042,
          "lastPc": "0x08C331",
          "lastMode": "adl",
          "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
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
          "oracleAddrStack": [
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
          }
        },
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)"
      },
      "analysis": {
        "cleanPhase6": true,
        "cleanClear": true,
        "pageErrors": [],
        "helperWrites": 2,
        "skippedPrepareWrites": 0,
        "stackInjectionCount": 2,
        "finalD008E0": 13740140,
        "beforeUiClearD008E0": 13740140,
        "finalFieldMismatches": [],
        "beforeUiClearFieldMismatches": [],
        "finalStackMismatches": [],
        "beforeUiStackMismatches": [],
        "finalStackMatchesOracle": true,
        "beforeUiStackMatchesOracle": true
      }
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

