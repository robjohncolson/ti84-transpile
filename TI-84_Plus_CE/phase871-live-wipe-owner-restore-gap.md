# Phase 871: Live 0x001879 Wipe Owner / Restore Gap

Probe: `probe-phase871-live-wipe-owner-restore-gap.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase871-live-wipe-owner-restore-gap.mjs`

## Summary

- Result: PASS.
- Live browser CLEAR route counts: anchor=1, pre-wipe 0x001879=1, cleanup 0x0018F8=1, poll=9167, termination=max_steps.
- Immediate 0x001879 entry edge: 0x001872 -> 0x001879; cleanup edge: 0x001879 -> 0x0018F8.
- Wipe-owner / restore-gap decision: The immediate wipe owner is the 0x001872 port-0x03 bit-4 branch falling through to 0x001879. On the RAM side, the missing restore packet is D010EF/D010FE plus adjacent D010F4, not the cxMain context vector or core edit/VAT pointers; a follow-up A/B is still needed to prove whether that D010 packet affects the port-branch/restore outcome.
- Residual note: D008E0 may differ from CEmu stack placement, but the route enters 0x001879 with cxMain/edit/VAT state already oracle-compatible; the destructive zeroing happens at 0x001879 before 0x006D64 polling can matter.

## Restore Gap Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Immediate wipe entry owner | yes | Dynamic edge 0x001872 -> 0x001879; static decode is IN0 port 0x03, BIT 4, JR NZ skip-or-fall-through |
| Context vector already valid | yes | D007CA browser @0x001879=0x0585E9, oracle after=0x0585E9 |
| Core edit/VAT fields already valid | yes | Checked D02437/D0243A/D0243D/D02440/D02590/D0259D |
| D010EF/D010FE mirror missing | yes | Browser @0x001879 D010EF=0x000000, D010FE=0x000000; oracle after D010EF=0xD2A83E, D010FE=0xD1A8CC |
| Adjacent D010F4 flag missing | yes | Browser @0x001879 D010F4=0x00; oracle after D010F4=0x1F |
| Wipe destroys oracle-compatible fields | yes | Browser @0x0018F8 D007CA=0x000000, D0243A=0x000000, D02590=0x000000 |

## Field Comparison

| Field | Meaning | CEmu before CLEAR | CEmu after CLEAR | Browser after boot | Browser @0x001879 | Browser @0x0018F8 |
| --- | --- | --- | --- | --- | --- | --- |
| D007CA | cxMain context vector | 0x0585E9 | 0x0585E9 | 0x0585E9 | 0x0585E9 | 0x000000 |
| D008E0 | errSP / longjmp anchor | 0xD1A86C | 0xD1A86C | 0x000000 | 0xD1A863 | 0x000000 |
| D010EF | edit upper mirror | 0xD2A83E | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 |
| D010FE | edit cursor mirror | 0xD1A8CC | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 |
| D010F4 | adjacent D010 mirror flag | 0x1F | 0x1F | 0x00 | 0x00 | 0x00 |
| D02317 | begPC | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0x000000 |
| D0231A | curPC | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0x000000 |
| D0231D | endPC | 0xD2A83D | 0xD2A83D | 0xD2A83D | 0xD2A83D | 0x000000 |
| D0066F | iMathPtr1 source | 0xD1A8A1 | 0xD1A8A1 | 0xD1A8A1 | 0xD1A8A1 | 0x000000 |
| D02437 | edit low pointer | 0xD1A8CC | 0xD1A8CC | 0xD1A8CC | 0xD1A8CC | 0x000000 |
| D0243A | edit cursor | 0xD1A8CD | 0xD1A8CC | 0xD1A8CC | 0xD1A8CC | 0x000000 |
| D0243D | edit end | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0x000000 |
| D02440 | edit boundary | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0xD2A83E | 0x000000 |
| D02505 | display-window lifecycle byte | 0x0A | 0x0A | 0x0A | 0x0A | 0x00 |
| D02590 | OPBase | 0xD3FE81 | 0xD3FE81 | 0xD3FE81 | 0xD3FE81 | 0x000000 |
| D0259D | progPtr | 0xD3FECD | 0xD3FECD | 0xD3FECD | 0xD3FECD | 0x000000 |
| D02A29 | EOL tuple field | 0x000C | 0x0000 | 0x0000 | 0x0000 | 0x0000 |

## Wipe Edges

| Edge | From PC | To PC | To BC | To DE | To HL | To SP | To stack0 | D007CA | D010EF | D010FE | D02437 | D0243A | D0243D | D02590 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0x001879 entry | 0x001872 | 0x001879 | 0x000003 | 0x000430 | 0x000000 | 0xD1A87B | 0x0013E8 | 0x0585E9 | 0x000000 | 0x000000 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0xD3FE81 |
| 0x0018F8 cleanup | 0x001879 | 0x0018F8 | 0x0000FF | 0xD3FF00 | 0xD3FEFF | 0xD1A87B | 0x0013E8 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |

## Anchor-to-Wipe Window

| # | PC | Prev | BC | DE | HL | SP | Stack0 | D007CA | D010EF | D010FE | D0066F | D02437 | D0243A | D0243D | D02505 | D02590 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x001879 | 0x001872 | 0x000003 | 0x000430 | 0x000000 | 0xD1A87B | 0x0013E8 | 0x0585E9 | 0x000000 | 0x000000 | 0xD1A8A1 | 0xD1A8CC | 0xD1A8CC | 0xD2A83E | 0x0A | 0xD3FE81 |
| 1 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FF00 | 0xD3FEFF | 0xD1A87B | 0x0013E8 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 |

## Static Decode: Dynamic 0x001879 Predecessor

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x00186A | `FD CB 42 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x00186E | `CD DE 58 01` | CALL 0x0158DE |
| 0x001872 | `ED 38 03` | in0 {"reg":"a","port":3,"mode":"adl","modePrefix":null} |
| 0x001875 | `CB 67` | bit-test {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x001877 | `20 36` | JR NZ, 0x0018AF |
| 0x001879 | `ED 38 09` | in0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x00187C | `CB E7` | bit-set {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x00187E | `ED 39 09` | out0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x001881 | `21 00 00 D0` | LD HL, 0xD00000 |
| 0x001885 | `11 01 00 D0` | LD DE, 0xD00001 |
| 0x001889 | `01 D7 3F 01` | LD BC, 0x013FD7 |
| 0x00188D | `36 00` | LD (?), 0x00 |
| 0x00188F | `ED B0` | LDIR |
| 0x001891 | `21 7C 78 D1` | LD HL, 0xD1787C |

## Static Decode: 0x001879 Wipe Entry

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x001860 | `05` | dec-reg {"reg":"b","mode":"adl","modePrefix":null} |
| 0x001861 | `9E` | SBC (HL) |
| 0x001862 | `ED 38 09` | in0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x001865 | `CB F7` | bit-set {"bit":6,"reg":"a","mode":"adl","modePrefix":null} |
| 0x001867 | `ED 39 09` | out0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x00186A | `FD CB 42 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x00186E | `CD DE 58 01` | CALL 0x0158DE |
| 0x001872 | `ED 38 03` | in0 {"reg":"a","port":3,"mode":"adl","modePrefix":null} |
| 0x001875 | `CB 67` | bit-test {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x001877 | `20 36` | JR NZ, 0x0018AF |
| 0x001879 | `ED 38 09` | in0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x00187C | `CB E7` | bit-set {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x00187E | `ED 39 09` | out0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x001881 | `21 00 00 D0` | LD HL, 0xD00000 |
| 0x001885 | `11 01 00 D0` | LD DE, 0xD00001 |
| 0x001889 | `01 D7 3F 01` | LD BC, 0x013FD7 |
| 0x00188D | `36 00` | LD (?), 0x00 |
| 0x00188F | `ED B0` | LDIR |
| 0x001891 | `21 7C 78 D1` | LD HL, 0xD1787C |
| 0x001895 | `11 7D 78 D1` | LD DE, 0xD1787D |
| 0x001899 | `01 01 20 00` | LD BC, 0x002001 |
| 0x00189D | `36 00` | LD (?), 0x00 |
| 0x00189F | `ED B0` | LDIR |
| 0x0018A1 | `21 FF FE D3` | LD HL, 0xD3FEFF |
| 0x0018A5 | `11 00 FF D3` | LD DE, 0xD3FF00 |

## Static Decode: D010FE Consumer / Edit-Pointer Writer Window

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0A2DC0 | `08` | ex-af {"mode":"adl","modePrefix":null} |
| 0x0A2DC1 | `78` | ld-reg-reg {"dest":"a","src":"b","mode":"adl","modePrefix":null} |
| 0x0A2DC2 | `C3 09 C5 08` | JP 0x08C509 |
| 0x0A2DC6 | `CD 0D C9 04` | CALL 0x04C90D |
| 0x0A2DCA | `D5` | PUSH DE |
| 0x0A2DCB | `CD 0D C9 04` | CALL 0x04C90D |
| 0x0A2DCF | `22 37 24 D0` | ld-pair-mem {"pair":"hl","addr":13640759,"direction":"to-mem","mode":"adl","modePrefix":null} |
| 0x0A2DD3 | `19` | ADD HL, DE |
| 0x0A2DD4 | `22 3A 24 D0` | ld-pair-mem {"pair":"hl","addr":13640762,"direction":"to-mem","mode":"adl","modePrefix":null} |
| 0x0A2DD8 | `EB` | EX DE,HL |
| 0x0A2DD9 | `2A FE 10 D0` | ld-pair-mem {"pair":"hl","addr":13635838,"direction":"from-mem","mode":"adl","modePrefix":null} |
| 0x0A2DDD | `B7` | OR A |
| 0x0A2DDE | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x0A2DE0 | `F5` | PUSH AF |

## Machine JSON

```json
{
  "pass": true,
  "live": {
    "baseline": {
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
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D00359_SAVE_D02437": "0x000000",
          "D0035C_SAVE_D0243A": "0x000000",
          "D0035F_SAVE_D0243D": "0x000000",
          "D00362_SAVE_D02440": "0x000000",
          "D0066F": "0xD1A8A1",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x00",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x20",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": 361961,
          "D008E0": 13740134,
          "D02505": 10,
          "D02587": 13805794,
          "D0258A": 13805794,
          "D0258D": 13805794,
          "D02590": 13893249,
          "D02593": 13893249,
          "D0259A": 13893249,
          "D0259D": 13893325,
          "D025A0": 13805732,
          "D025C5": 786432
        },
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 3,
        "flagBranch058216": 1,
        "flagMode09142B": 0,
        "flagModeCheck090B81": 0,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 8,
        "flagReturn058A14": 1,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "tailHelper0A2A37": 12,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 112,
        "owner0A31FD": 0,
        "ownerSetup0A322B": 0,
        "ownerEntry0A321D": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "preWipe001879": 1,
        "cleanup0018F8": 1,
        "poll006D64": 9167
      },
      "pageErrors": []
    }
  },
  "wipeOwner": {
    "found": true,
    "preWipeIndex": -1,
    "cleanupIndex": -1,
    "anchorIndex": -1,
    "entryEdge": {
      "from": {
        "pc": "0x001872"
      },
      "to": {
        "index": 5400,
        "block": 77344,
        "pc": "0x001879",
        "prevPc": "0x001872",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D0066F": "0xD1A8A1",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD"
      }
    },
    "cleanupEdge": {
      "from": {
        "pc": "0x001879"
      },
      "to": {
        "index": 5400,
        "block": 77345,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "sp": "0xD1A87B",
        "stack0": "0x0013E8",
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D0066F": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000"
      }
    },
    "contextVectorOk": true,
    "coreEditVatOk": true,
    "d010MirrorGap": true,
    "d010FlagGap": true,
    "portBranchOwner": true,
    "postWipeDestroysContext": true,
    "conclusion": "The immediate wipe owner is the 0x001872 port-0x03 bit-4 branch falling through to 0x001879. On the RAM side, the missing restore packet is D010EF/D010FE plus adjacent D010F4, not the cxMain context vector or core edit/VAT pointers; a follow-up A/B is still needed to prove whether that D010 packet affects the port-branch/restore outcome.",
    "preWipeFields": {
      "D00359_SAVE_D02437": "0x000000",
      "D0035C_SAVE_D0243A": "0x000000",
      "D0035F_SAVE_D0243D": "0x000000",
      "D00362_SAVE_D02440": "0x000000",
      "D0066F": "0xD1A8A1",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D010EF": "0x000000",
      "D010FE": "0x000000",
      "D02317": "0xD2A83E",
      "D0231A": "0xD2A83E",
      "D0231D": "0xD2A83D",
      "D02437": "0xD1A8CC",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02440": "0xD2A83E",
      "D010F4": "0x00",
      "D02504": "0x00",
      "D02505": "0x0A",
      "D02506": "0x00",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00595": "0x00",
      "D00596": "0x00",
      "D0059A": "0x02",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D000CA_IY4A": "0x21",
      "D000C4_IY44": "0x00",
      "D000CC_IY4C": "0x00",
      "D000B2_IY32": "0x00"
    },
    "postWipeFields": {
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
      "D010F4": "0x00",
      "D02504": "0x00",
      "D02505": "0x00",
      "D02506": "0x00",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D00595": "0x00",
      "D00596": "0x00",
      "D0059A": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D000CA_IY4A": "0x00",
      "D000C4_IY44": "0x00",
      "D000CC_IY4C": "0x00",
      "D000B2_IY32": "0x00"
    },
    "oraclePre": {
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
      "D010F4": "0x1F",
      "D02504": "0x00",
      "D02505": "0x0A",
      "D02506": "0x00",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x000C",
      "D00595": "0x25",
      "D00596": "0x00",
      "D0059A": "0x0E",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D000CA_IY4A": "0x21",
      "D000C4_IY44": "0x2E",
      "D000CC_IY4C": "0x00",
      "D000B2_IY32": "0x00"
    },
    "oracleAfter": {
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
      "D010F4": "0x1F",
      "D02504": "0x00",
      "D02505": "0x0A",
      "D02506": "0x00",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00595": "0x25",
      "D00596": "0x00",
      "D0059A": "0x02",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D000CA_IY4A": "0x21",
      "D000C4_IY44": "0x2E",
      "D000CC_IY4C": "0x00",
      "D000B2_IY32": "0x00"
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

