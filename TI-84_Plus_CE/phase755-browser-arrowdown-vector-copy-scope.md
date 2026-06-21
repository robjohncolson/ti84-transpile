# Phase 755 Browser ArrowDown Vector-Copy Scope

Probe: `probe-phase755-browser-arrowdown-vector-copy-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase755-browser-arrowdown-vector-copy-scope.mjs`

Serves an in-memory instrumented `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowDown`, and compares three phase754 follow-up strategies around the `0x08C782` context-vector copy owner.

The disk `browser-shell.html` is not patched by this probe.

## Summary

- Overall: **COMPLETE**
- Clean strategies: `stopBeforeOwner`, `restoreAfterOwner`, `stopAtEntryRestore`.
- Preferred in-memory candidate: `restoreAfterOwner`.
- Interpretation: a clean strategy must leave `D007CA=0x0585E9`, `D02590=0xD3FE81`, `D0243A=0xD1A8CC`, avoid `0x202020`/critical zero/page errors, stay bounded under the watchdog, and preserve display pixels.

## Strategy Matrix

| Strategy | Safe | Route | Fields | Display | Stop PC | Steps | D007CA | VRAM before -> after | Restores | 0x0018F8 hits |
|---|---|---|---|---|---|---:|---|---|---:|---:|
| stopBeforeOwner | YES | ok | ok | ok | 0x08C782 | 17652 | 0x0585E9 | 8549 -> 8585 | 0 | 0 |
| restoreAfterOwner | YES | ok | ok | ok | 0x001879 | 51287 | 0x0585E9 | 8549 -> 8585 | 1 | 0 |
| stopAtEntryRestore | YES | ok | ok | ok | 0x06C764 | 17653 | 0x0585E9 | 8549 -> 8585 | 1 | 0 |

## Strategy: stopBeforeOwner

- Title: Stop before 0x08C782 vector copy
- Assessment: safe=true, route=true, saneFields=true, bounded=true, displayPreserved=true, noCorruption=true, noPageErrors=true.
- Stop: pc=0x08C782, label=arrow-down-before-vector-copy-owner, termination=control_pre_stop, steps=17652, uiClear=false.
- Final state: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, VRAM=8585.
- Signals: firstCriticalZero=none, first202020=none, pageErrors=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| reroutePrev08c782 | 1 | 17588 | 0x08C782 | 0x06C757 | 0x0044BB | 0x06C7EF | 0xD007F9 | 0xD1A854 | 0x06C764 | 0x0585E9 | 0xD3FE81 |
| rerouteEntry06c764 | 0 | - | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2185 | 0x08C72F | 0x08C536 | 0x000400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 4 | 2192 | 0x08C745 | 0x08C734 | 0x000400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D | 0x0585E9 | 0xD3FE81 |
| cleanup001879 | 0 | - | - | - | - | - | - | - | - | - | - |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 335 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 0 | - | - | - | - | - | - | - | - | - | - |
| postInsertGate0158de | 0 | - | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - | - |

### Vector Restores

_No vector restore actions captured._

### D007CA Transitions

_No D007CA transitions captured._

## Strategy: restoreAfterOwner

- Title: Allow 0x08C782 then restore D007CA..D007DE
- Assessment: safe=true, route=true, saneFields=true, bounded=true, displayPreserved=true, noCorruption=true, noPageErrors=true.
- Stop: pc=0x001879, label=arrow-down-prewipe-trace-stop, termination=control_pre_stop, steps=51287, uiClear=false.
- Final state: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, VRAM=8585.
- Signals: firstCriticalZero=none, first202020=none, pageErrors=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| reroutePrev08c782 | 1 | 17588 | 0x08C782 | 0x06C757 | 0x0044BB | 0x06C7EF | 0xD007F9 | 0xD1A854 | 0x06C764 | 0x0585E9 | 0xD3FE81 |
| rerouteEntry06c764 | 1 | 17589 | 0x06C764 | 0x08C782 | 0x000000 | 0x06C804 | 0xD007DF | 0xD1A857 | 0x0044BB | 0x06C92C | 0xD3FE81 |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 2 | 2185 | 0x08C72F | 0x08C536 | 0x000400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 5 | 2192 | 0x08C745 | 0x08C734 | 0x000400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D | 0x0585E9 | 0xD3FE81 |
| cleanup001879 | 1 | 51126 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0013E8 | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 846 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 50922 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0158EC | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 50920 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0013DA | 0x0585E9 | 0xD3FE81 |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - | - |

### Vector Restores

| Block | PC | Prev PC | Restored | D007CA before | D007CA after | D007DE byte after |
|---:|---|---|---|---|---|---|
| 17589 | 0x06C764 | 0x08C782 | true | 0x06C92C | 0x0585E9 | 0x00 |

### D007CA Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 17589 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 17589 | 0x06C764 | 0x08C782 | after-persistence-hook | D007CA:0x06C92C->0x0585E9 |

## Strategy: stopAtEntryRestore

- Title: Restore at 0x06C764 and stop before alternate dispatch
- Assessment: safe=true, route=true, saneFields=true, bounded=true, displayPreserved=true, noCorruption=true, noPageErrors=true.
- Stop: pc=0x06C764, label=arrow-down-entry-vector-restore-stop, termination=control_pre_stop, steps=17653, uiClear=false.
- Final state: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, VRAM=8585.
- Signals: firstCriticalZero=none, first202020=none, pageErrors=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | Stack[0] | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| reroutePrev08c782 | 1 | 17588 | 0x08C782 | 0x06C757 | 0x0044BB | 0x06C7EF | 0xD007F9 | 0xD1A854 | 0x06C764 | 0x0585E9 | 0xD3FE81 |
| rerouteEntry06c764 | 1 | 17589 | 0x06C764 | 0x08C782 | 0x000000 | 0x06C804 | 0xD007DF | 0xD1A857 | 0x0044BB | 0x06C92C | 0xD3FE81 |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2185 | 0x08C72F | 0x08C536 | 0x000400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x08C53A | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 4 | 2192 | 0x08C745 | 0x08C734 | 0x000400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x08C73D | 0x0585E9 | 0xD3FE81 |
| cleanup001879 | 0 | - | - | - | - | - | - | - | - | - | - |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 335 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x006810 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 0 | - | - | - | - | - | - | - | - | - | - |
| postInsertGate0158de | 0 | - | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - | - |

### Vector Restores

| Block | PC | Prev PC | Restored | D007CA before | D007CA after | D007DE byte after |
|---:|---|---|---|---|---|---|
| 17589 | 0x06C764 | 0x08C782 | true | 0x06C92C | 0x0585E9 | 0x00 |

### D007CA Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 17589 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 17589 | 0x06C764 | 0x08C782 | after-persistence-hook | D007CA:0x06C92C->0x0585E9 |


## Static Decode

### reroute owner candidate 0x08C782

| PC | Bytes | Instruction | Target | Fallthrough |
|---|---|---|---|---|
| 0x08C782 | `0x11 0xCA 0x07 0xD0` | `LD DE,0xD007CA` | - | - |
| 0x08C786 | `0x01 0x15 0x00 0x00` | `LD BC,0x000015` | - | - |
| 0x08C78A | `0xED 0xB0` | `LDIR` | - | - |
| 0x08C78C | `0x7E` | `ld-reg-ind {"pc":575372,"length":1,"nextPc":575373,"tag":"ld-reg-ind","dest":"a","src":"hl","mode":"adl","modePrefix":null}` | - | - |
| 0x08C78D | `0x32 0x8D 0x00 0xD0` | `LD (0xD0008D),A` | - | - |
| 0x08C791 | `0xFD 0xCB 0x4C 0xAE` | `RES 5,(IY+76)` | - | - |
| 0x08C795 | `0xC9` | `RET` | - | - |

### reroute entry 0x06C764

| PC | Bytes | Instruction | Target | Fallthrough |
|---|---|---|---|---|
| 0x06C764 | `0xCD 0x27 0xC9 0x06` | `CALL 0x06C927` | 0x06C927 | 0x06C768 |
| 0x06C768 | `0xF1` | `POP AF` | - | - |
| 0x06C769 | `0xCD 0x92 0xE9 0x05` | `CALL 0x05E992` | 0x05E992 | 0x06C76D |
| 0x06C76D | `0xFD 0xCB 0x02 0x8E` | `RES 1,(IY+2)` | - | - |
| 0x06C771 | `0xFD 0xCB 0x1F 0x9E` | `RES 3,(IY+31)` | - | - |
| 0x06C775 | `0xCD 0xBD 0xFC 0x06` | `CALL 0x06FCBD` | 0x06FCBD | 0x06C779 |
| 0x06C779 | `0x30 0x2F` | `jr-conditional {"pc":444281,"length":2,"nextPc":444283,"tag":"jr-conditional","condition":"nc","target":444330,"fallthrough":444283,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C7AA | 0x06C77B |
| 0x06C77B | `0x78` | `LD A,B` | - | - |
| 0x06C77C | `0x21 0x05 0xC8 0x06` | `LD HL,0x06C805` | - | - |
| 0x06C780 | `0x01 0x09 0x00 0x00` | `LD BC,0x000009` | - | - |
| 0x06C784 | `0xED 0xB1` | `cpir {"pc":444292,"length":2,"nextPc":444294,"tag":"cpir","mode":"adl","modePrefix":null}` | - | - |
| 0x06C786 | `0x28 0x22` | `jr-conditional {"pc":444294,"length":2,"nextPc":444296,"tag":"jr-conditional","condition":"z","target":444330,"fallthrough":444296,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C7AA | 0x06C788 |
| 0x06C788 | `0xFD 0xCB 0x03 0x46` | `BIT 0,(IY+3)` | - | - |
| 0x06C78C | `0x28 0x14` | `jr-conditional {"pc":444300,"length":2,"nextPc":444302,"tag":"jr-conditional","condition":"z","target":444322,"fallthrough":444302,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C7A2 | 0x06C78E |
| 0x06C78E | `0xB7` | `OR A` | - | - |
| 0x06C78F | `0x28 0x19` | `jr-conditional {"pc":444303,"length":2,"nextPc":444305,"tag":"jr-conditional","condition":"z","target":444330,"fallthrough":444305,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C7AA | 0x06C791 |
| 0x06C791 | `0xFE 0x06` | `CP 0x06` | - | - |
| 0x06C793 | `0x38 0x09` | `jr-conditional {"pc":444307,"length":2,"nextPc":444309,"tag":"jr-conditional","condition":"c","target":444318,"fallthrough":444309,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C79E | 0x06C795 |
| 0x06C795 | `0xFE 0x07` | `CP 0x07` | - | - |
| 0x06C797 | `0x28 0x05` | `jr-conditional {"pc":444311,"length":2,"nextPc":444313,"tag":"jr-conditional","condition":"z","target":444318,"fallthrough":444313,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C79E | 0x06C799 |
| 0x06C799 | `0xFE 0x05` | `CP 0x05` | - | - |
| 0x06C79B | `0x20 0x0D` | `jr-conditional {"pc":444315,"length":2,"nextPc":444317,"tag":"jr-conditional","condition":"nz","target":444330,"fallthrough":444317,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C7AA | 0x06C79D |
| 0x06C79D | `0xC9` | `RET` | - | - |

### alternate cxMain target 0x06C92C

| PC | Bytes | Instruction | Target | Fallthrough |
|---|---|---|---|---|
| 0x06C92C | `0xFD 0xCB 0x0D 0xCE` | `SET 1,(IY+13)` | - | - |
| 0x06C930 | `0xFD 0xCB 0x02 0x8E` | `RES 1,(IY+2)` | - | - |
| 0x06C934 | `0x47` | `LD B,A` | - | - |
| 0x06C935 | `0x3E 0x06` | `LD A,0x06` | - | - |
| 0x06C937 | `0xFD 0xCB 0x35 0x5E` | `BIT 3,(IY+53)` | - | - |
| 0x06C93B | `0xC4 0xE3 0x39 0x02` | `call-conditional {"pc":444731,"length":4,"nextPc":444735,"tag":"call-conditional","condition":"nz","target":145891,"fallthrough":444735,"terminates":true,"mode":"adl","modePrefix":null}` | 0x0239E3 | 0x06C93F |
| 0x06C93F | `0xC0` | `ret-conditional {"pc":444735,"length":1,"nextPc":444736,"tag":"ret-conditional","condition":"nz","fallthrough":444736,"terminates":true,"mode":"adl","modePrefix":null}` | - | 0x06C940 |
| 0x06C940 | `0x78` | `LD A,B` | - | - |
| 0x06C941 | `0xFE 0xFB` | `CP 0xFB` | - | - |
| 0x06C943 | `0x20 0x0C` | `jr-conditional {"pc":444739,"length":2,"nextPc":444741,"tag":"jr-conditional","condition":"nz","target":444753,"fallthrough":444741,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06C951 | 0x06C945 |
| 0x06C945 | `0x3A 0x8E 0x05 0xD0` | `LD A,(0xD0058E)` | - | - |
| 0x06C949 | `0xFE 0xF8` | `CP 0xF8` | - | - |
| 0x06C94B | `0x3E 0xFB` | `LD A,0xFB` | - | - |
| 0x06C94D | `0xCC 0xE4 0xD1 0x03` | `call-conditional {"pc":444749,"length":4,"nextPc":444753,"tag":"call-conditional","condition":"z","target":250340,"fallthrough":444753,"terminates":true,"mode":"adl","modePrefix":null}` | 0x03D1E4 | 0x06C951 |
| 0x06C951 | `0xCD 0xDA 0x8E 0x05` | `CALL 0x058EDA` | 0x058EDA | 0x06C955 |
| 0x06C955 | `0xC8` | `ret-conditional {"pc":444757,"length":1,"nextPc":444758,"tag":"ret-conditional","condition":"z","fallthrough":444758,"terminates":true,"mode":"adl","modePrefix":null}` | - | 0x06C956 |
| 0x06C956 | `0xFD 0xCB 0x4E 0x9E` | `RES 3,(IY+78)` | - | - |
| 0x06C95A | `0xFD 0xCB 0x4E 0xA6` | `RES 4,(IY+78)` | - | - |
| 0x06C95E | `0xFD 0xCB 0x14 0xAE` | `RES 5,(IY+20)` | - | - |
| 0x06C962 | `0xFD 0xCB 0x11 0x46` | `BIT 0,(IY+17)` | - | - |
| 0x06C966 | `0xCA 0x03 0xCB 0x06` | `jp-conditional {"pc":444774,"length":4,"nextPc":444778,"tag":"jp-conditional","condition":"z","target":445187,"fallthrough":444778,"terminates":true,"mode":"adl","modePrefix":null}` | 0x06CB03 | 0x06C96A |
| 0x06C96A | `0xFE 0xFE` | `CP 0xFE` | - | - |
| 0x06C96C | `0xCA 0xAB 0x70 0x09` | `jp-conditional {"pc":444780,"length":4,"nextPc":444784,"tag":"jp-conditional","condition":"z","target":618667,"fallthrough":444784,"terminates":true,"mode":"adl","modePrefix":null}` | 0x0970AB | 0x06C970 |
| 0x06C970 | `0xFE 0x0C` | `CP 0x0C` | - | - |

### cxMain dispatch wrapper 0x08C72F

| PC | Bytes | Instruction | Target | Fallthrough |
|---|---|---|---|---|
| 0x08C72F | `0xE5` | `PUSH HL` | - | - |
| 0x08C730 | `0xCD 0x2E 0x62 0x05` | `CALL 0x05622E` | 0x05622E | 0x08C734 |
| 0x08C734 | `0xE5` | `PUSH HL` | - | - |
| 0x08C735 | `0x2A 0xCA 0x07 0xD0` | `LD UNDEFINED,(0xD007CA)` | - | - |
| 0x08C739 | `0xCD 0x45 0xC7 0x08` | `CALL 0x08C745` | 0x08C745 | 0x08C73D |
| 0x08C73D | `0xFD 0x21 0x80 0x00 0xD0` | `LD IY,0xD00080` | - | - |
| 0x08C742 | `0xE1` | `POP HL` | - | - |
| 0x08C743 | `0xE1` | `POP HL` | - | - |
| 0x08C744 | `0xC9` | `RET` | - | - |

## Compact Evidence

```json
{
  "completed": true,
  "traceStepCap": 190000,
  "cleanStrategyNames": [
    "stopBeforeOwner",
    "restoreAfterOwner",
    "stopAtEntryRestore"
  ],
  "preferredStrategyName": "restoreAfterOwner",
  "strategyResults": [
    {
      "strategyName": "stopBeforeOwner",
      "title": "Stop before 0x08C782 vector copy",
      "assessment": {
        "routePass": true,
        "saneFields": true,
        "bounded": true,
        "displayPreserved": true,
        "noCorruption": true,
        "noPageErrors": true,
        "safeCandidate": true
      },
      "controlStop": {
        "pc": 575362,
        "label": "arrow-down-before-vector-copy-owner"
      },
      "restoreVectorAt": null,
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
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: DOWN → 17652 steps (control_pre_stop, peak 8625px)",
        "lastPc": "0x08C331",
        "cpu": {
          "pc": "0x08C782",
          "sp": "0xD1A854",
          "af": "0x000054",
          "bc": "0x0044BB",
          "de": "0xD007F9",
          "hl": "0x06C7EF",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 17652
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x44",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "diagnostics": {
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
            "code": "ArrowDown",
            "label": "DOWN",
            "expectedInsertByte": null,
            "controlPreStopPc": 575362,
            "controlPreStopLabel": "arrow-down-before-vector-copy-owner",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 17588,
            "controlStopPc": 575362,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 17652,
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
            "vramPeak": 8625,
            "vramCurrent": 8585
          }
        },
        "lastKey": {
          "code": "ArrowDown",
          "label": "DOWN",
          "expectedInsertByte": null,
          "controlPreStopPc": 575362,
          "controlPreStopLabel": "arrow-down-before-vector-copy-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 17588,
          "controlStopPc": 575362,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": true,
          "steps": 17652,
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
          "vramPeak": 8625,
          "vramCurrent": 8585
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reroutePrev08c782": 1,
        "rerouteEntry06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 1,
        "cxJpTrampoline08c745": 4,
        "cleanup001879": 0,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 335,
        "sentinel0158bc": 0,
        "postInsertGate0158de": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0
      },
      "vectorRestores": [],
      "d007caTransitions": [],
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
            "D007DE": "0x00",
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
        "cxDispatchWrapper08c72f": {
          "block": 2185,
          "pc": "0x08C72F",
          "prevPc": "0x08C536",
          "cpu": {
            "pc": "0x08C72F",
            "sp": "0xD1A85D",
            "af": "0x00049B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x00FFFF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x9B",
            "stepCount": 2189
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x00049B"
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
          "vram": 8585
        },
        "cxJpTrampoline08c745": {
          "block": 2192,
          "pc": "0x08C745",
          "prevPc": "0x08C734",
          "cpu": {
            "pc": "0x08C745",
            "sp": "0xD1A854",
            "af": "0x00041B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x1B",
            "stepCount": 2196
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000404"
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
              "value": "0x00049B"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        },
        "reroutePrev08c782": {
          "block": 17588,
          "pc": "0x08C782",
          "prevPc": "0x06C757",
          "cpu": {
            "pc": "0x08C782",
            "sp": "0xD1A854",
            "af": "0x000054",
            "bc": "0x0044BB",
            "de": "0xD007F9",
            "hl": "0x06C7EF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "stepCount": 17652
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x44",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
            "D00080": "0x00",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x06C764"
            },
            {
              "addr": "0xD1A857",
              "value": "0x0044BB"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x08C911"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x004454"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C605"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        }
      },
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    },
    {
      "strategyName": "restoreAfterOwner",
      "title": "Allow 0x08C782 then restore D007CA..D007DE",
      "assessment": {
        "routePass": true,
        "saneFields": true,
        "bounded": true,
        "displayPreserved": true,
        "noCorruption": true,
        "noPageErrors": true,
        "safeCandidate": true
      },
      "controlStop": {
        "pc": 6265,
        "label": "arrow-down-prewipe-trace-stop"
      },
      "restoreVectorAt": 444260,
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
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: DOWN → 51287 steps (control_pre_stop, peak 8625px)",
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
          "stepCount": 51287
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "diagnostics": {
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
            "code": "ArrowDown",
            "label": "DOWN",
            "expectedInsertByte": null,
            "controlPreStopPc": 6265,
            "controlPreStopLabel": "arrow-down-prewipe-trace-stop",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 51126,
            "controlStopPc": 6265,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 51287,
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
            "vramPeak": 8625,
            "vramCurrent": 8585
          }
        },
        "lastKey": {
          "code": "ArrowDown",
          "label": "DOWN",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "arrow-down-prewipe-trace-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 51126,
          "controlStopPc": 6265,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": true,
          "steps": 51287,
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
          "vramPeak": 8625,
          "vramCurrent": 8585
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reroutePrev08c782": 1,
        "rerouteEntry06c764": 1,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 5,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 846,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "low000b7c": 0,
        "coldIdle0019b5": 0
      },
      "vectorRestores": [
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "strategy": "restoreAfterOwner",
          "restored": true,
          "before": {
            "D007CA": 444716,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 0,
            "D0058C": 68,
            "D0058D": 49,
            "D0058E": 0,
            "D007DE": 0,
            "D00080": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 0,
            "D0058C": 68,
            "D0058D": 49,
            "D0058E": 0,
            "D007DE": 0,
            "D00080": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630
          }
        }
      ],
      "d007caTransitions": [
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 444716
            }
          }
        },
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "after-persistence-hook",
          "diff": {
            "D007CA": {
              "before": 444716,
              "after": 361961
            }
          }
        }
      ],
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
            "D007DE": "0x00",
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
        "cxDispatchWrapper08c72f": {
          "block": 2185,
          "pc": "0x08C72F",
          "prevPc": "0x08C536",
          "cpu": {
            "pc": "0x08C72F",
            "sp": "0xD1A85D",
            "af": "0x00049B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x00FFFF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x9B",
            "stepCount": 2189
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x00049B"
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
          "vram": 8585
        },
        "cxJpTrampoline08c745": {
          "block": 2192,
          "pc": "0x08C745",
          "prevPc": "0x08C734",
          "cpu": {
            "pc": "0x08C745",
            "sp": "0xD1A854",
            "af": "0x00041B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x1B",
            "stepCount": 2196
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000404"
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
              "value": "0x00049B"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        },
        "reroutePrev08c782": {
          "block": 17588,
          "pc": "0x08C782",
          "prevPc": "0x06C757",
          "cpu": {
            "pc": "0x08C782",
            "sp": "0xD1A854",
            "af": "0x000054",
            "bc": "0x0044BB",
            "de": "0xD007F9",
            "hl": "0x06C7EF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "stepCount": 17652
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x44",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
            "D00080": "0x00",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x06C764"
            },
            {
              "addr": "0xD1A857",
              "value": "0x0044BB"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x08C911"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x004454"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C605"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        },
        "rerouteEntry06c764": {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "cpu": {
            "pc": "0x06C764",
            "sp": "0xD1A857",
            "af": "0x00AA40",
            "bc": "0x000000",
            "de": "0xD007DF",
            "hl": "0x06C804",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "stepCount": 17653
          },
          "fields": {
            "D007CA": "0x06C92C",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x44",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
            "D00080": "0x00",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A857",
              "value": "0x0044BB"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x08C911"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x004454"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C605"
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
          "vram": 8585
        },
        "postInsertGate0158de": {
          "block": 50920,
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
            "stepCount": 51081
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
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
          "vram": 8585
        },
        "sentinel0158bc": {
          "block": 50922,
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
            "stepCount": 51083
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
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
          "vram": 8585
        },
        "cleanup001879": {
          "block": 51126,
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
            "stepCount": 51287
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
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
          "vram": 8585
        }
      },
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    },
    {
      "strategyName": "stopAtEntryRestore",
      "title": "Restore at 0x06C764 and stop before alternate dispatch",
      "assessment": {
        "routePass": true,
        "saneFields": true,
        "bounded": true,
        "displayPreserved": true,
        "noCorruption": true,
        "noPageErrors": true,
        "safeCandidate": true
      },
      "controlStop": {
        "pc": 444260,
        "label": "arrow-down-entry-vector-restore-stop"
      },
      "restoreVectorAt": 444260,
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
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: DOWN → 17653 steps (control_pre_stop, peak 8625px)",
        "lastPc": "0x08C331",
        "cpu": {
          "pc": "0x06C764",
          "sp": "0xD1A857",
          "af": "0x00AA40",
          "bc": "0x000000",
          "de": "0xD007DF",
          "hl": "0x06C804",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x40",
          "stepCount": 17653
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x44",
          "D0058D": "0x31",
          "D0058E": "0x00",
          "D007DE": "0x00",
          "D00080": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "diagnostics": {
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
            "code": "ArrowDown",
            "label": "DOWN",
            "expectedInsertByte": null,
            "controlPreStopPc": 444260,
            "controlPreStopLabel": "arrow-down-entry-vector-restore-stop",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 17589,
            "controlStopPc": 444260,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "steps": 17653,
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
            "vramPeak": 8625,
            "vramCurrent": 8585
          }
        },
        "lastKey": {
          "code": "ArrowDown",
          "label": "DOWN",
          "expectedInsertByte": null,
          "controlPreStopPc": 444260,
          "controlPreStopLabel": "arrow-down-entry-vector-restore-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 17589,
          "controlStopPc": 444260,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": true,
          "steps": 17653,
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
          "vramPeak": 8625,
          "vramCurrent": 8585
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reroutePrev08c782": 1,
        "rerouteEntry06c764": 1,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 1,
        "cxJpTrampoline08c745": 4,
        "cleanup001879": 0,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 335,
        "sentinel0158bc": 0,
        "postInsertGate0158de": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0
      },
      "vectorRestores": [
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "strategy": "stopAtEntryRestore",
          "restored": true,
          "before": {
            "D007CA": 444716,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 0,
            "D0058C": 68,
            "D0058D": 49,
            "D0058E": 0,
            "D007DE": 0,
            "D00080": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 0,
            "D0058C": 68,
            "D0058D": 49,
            "D0058E": 0,
            "D007DE": 0,
            "D00080": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630
          }
        }
      ],
      "d007caTransitions": [
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 444716
            }
          }
        },
        {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "after-persistence-hook",
          "diff": {
            "D007CA": {
              "before": 444716,
              "after": 361961
            }
          }
        }
      ],
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
            "D007DE": "0x00",
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
        "cxDispatchWrapper08c72f": {
          "block": 2185,
          "pc": "0x08C72F",
          "prevPc": "0x08C536",
          "cpu": {
            "pc": "0x08C72F",
            "sp": "0xD1A85D",
            "af": "0x00049B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x00FFFF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x9B",
            "stepCount": 2189
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x00049B"
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
          "vram": 8585
        },
        "cxJpTrampoline08c745": {
          "block": 2192,
          "pc": "0x08C745",
          "prevPc": "0x08C734",
          "cpu": {
            "pc": "0x08C745",
            "sp": "0xD1A854",
            "af": "0x00041B",
            "bc": "0x000400",
            "de": "0xD2A815",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x1B",
            "stepCount": 2196
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x31",
            "D0058C": "0x04",
            "D0058D": "0x31",
            "D0058E": "0x04",
            "D007DE": "0x00",
            "D00080": "0x18",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000404"
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
              "value": "0x00049B"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        },
        "reroutePrev08c782": {
          "block": 17588,
          "pc": "0x08C782",
          "prevPc": "0x06C757",
          "cpu": {
            "pc": "0x08C782",
            "sp": "0xD1A854",
            "af": "0x000054",
            "bc": "0x0044BB",
            "de": "0xD007F9",
            "hl": "0x06C7EF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "stepCount": 17652
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x44",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
            "D00080": "0x00",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x06C764"
            },
            {
              "addr": "0xD1A857",
              "value": "0x0044BB"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x08C911"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x004454"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C605"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            }
          ],
          "vram": 8585
        },
        "rerouteEntry06c764": {
          "block": 17589,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "cpu": {
            "pc": "0x06C764",
            "sp": "0xD1A857",
            "af": "0x00AA40",
            "bc": "0x000000",
            "de": "0xD007DF",
            "hl": "0x06C804",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "stepCount": 17653
          },
          "fields": {
            "D007CA": "0x06C92C",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00587": "0x00",
            "D0058C": "0x44",
            "D0058D": "0x31",
            "D0058E": "0x00",
            "D007DE": "0x00",
            "D00080": "0x00",
            "D000C2": "0x00",
            "D02A28": "0x00",
            "D02A29": "0x000000",
            "D02A40": "0xD2A83E"
          },
          "stackTop": [
            {
              "addr": "0xD1A857",
              "value": "0x0044BB"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x08C911"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x004454"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C605"
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
          "vram": 8585
        }
      },
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    }
  ],
  "staticDecode": [
    {
      "label": "reroute owner candidate 0x08C782",
      "start": 575362,
      "instructionCount": 20,
      "rows": [
        {
          "pc": 575362,
          "bytes": "0x11 0xCA 0x07 0xD0",
          "asm": "LD DE,0xD007CA",
          "tag": "ld-pair-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575366,
          "bytes": "0x01 0x15 0x00 0x00",
          "asm": "LD BC,0x000015",
          "tag": "ld-pair-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575370,
          "bytes": "0xED 0xB0",
          "asm": "LDIR",
          "tag": "ldir",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575372,
          "bytes": "0x7E",
          "asm": "ld-reg-ind {\"pc\":575372,\"length\":1,\"nextPc\":575373,\"tag\":\"ld-reg-ind\",\"dest\":\"a\",\"src\":\"hl\",\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "ld-reg-ind",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575373,
          "bytes": "0x32 0x8D 0x00 0xD0",
          "asm": "LD (0xD0008D),A",
          "tag": "ld-mem-reg",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575377,
          "bytes": "0xFD 0xCB 0x4C 0xAE",
          "asm": "RES 5,(IY+76)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575381,
          "bytes": "0xC9",
          "asm": "RET",
          "tag": "ret",
          "target": null,
          "fallthrough": null
        }
      ]
    },
    {
      "label": "reroute entry 0x06C764",
      "start": 444260,
      "instructionCount": 24,
      "rows": [
        {
          "pc": 444260,
          "bytes": "0xCD 0x27 0xC9 0x06",
          "asm": "CALL 0x06C927",
          "tag": "call",
          "target": 444711,
          "fallthrough": 444264
        },
        {
          "pc": 444264,
          "bytes": "0xF1",
          "asm": "POP AF",
          "tag": "pop",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444265,
          "bytes": "0xCD 0x92 0xE9 0x05",
          "asm": "CALL 0x05E992",
          "tag": "call",
          "target": 387474,
          "fallthrough": 444269
        },
        {
          "pc": 444269,
          "bytes": "0xFD 0xCB 0x02 0x8E",
          "asm": "RES 1,(IY+2)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444273,
          "bytes": "0xFD 0xCB 0x1F 0x9E",
          "asm": "RES 3,(IY+31)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444277,
          "bytes": "0xCD 0xBD 0xFC 0x06",
          "asm": "CALL 0x06FCBD",
          "tag": "call",
          "target": 457917,
          "fallthrough": 444281
        },
        {
          "pc": 444281,
          "bytes": "0x30 0x2F",
          "asm": "jr-conditional {\"pc\":444281,\"length\":2,\"nextPc\":444283,\"tag\":\"jr-conditional\",\"condition\":\"nc\",\"target\":444330,\"fallthrough\":444283,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444330,
          "fallthrough": 444283
        },
        {
          "pc": 444283,
          "bytes": "0x78",
          "asm": "LD A,B",
          "tag": "ld-reg-reg",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444284,
          "bytes": "0x21 0x05 0xC8 0x06",
          "asm": "LD HL,0x06C805",
          "tag": "ld-pair-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444288,
          "bytes": "0x01 0x09 0x00 0x00",
          "asm": "LD BC,0x000009",
          "tag": "ld-pair-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444292,
          "bytes": "0xED 0xB1",
          "asm": "cpir {\"pc\":444292,\"length\":2,\"nextPc\":444294,\"tag\":\"cpir\",\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "cpir",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444294,
          "bytes": "0x28 0x22",
          "asm": "jr-conditional {\"pc\":444294,\"length\":2,\"nextPc\":444296,\"tag\":\"jr-conditional\",\"condition\":\"z\",\"target\":444330,\"fallthrough\":444296,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444330,
          "fallthrough": 444296
        },
        {
          "pc": 444296,
          "bytes": "0xFD 0xCB 0x03 0x46",
          "asm": "BIT 0,(IY+3)",
          "tag": "indexed-cb-bit",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444300,
          "bytes": "0x28 0x14",
          "asm": "jr-conditional {\"pc\":444300,\"length\":2,\"nextPc\":444302,\"tag\":\"jr-conditional\",\"condition\":\"z\",\"target\":444322,\"fallthrough\":444302,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444322,
          "fallthrough": 444302
        },
        {
          "pc": 444302,
          "bytes": "0xB7",
          "asm": "OR A",
          "tag": "alu-reg",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444303,
          "bytes": "0x28 0x19",
          "asm": "jr-conditional {\"pc\":444303,\"length\":2,\"nextPc\":444305,\"tag\":\"jr-conditional\",\"condition\":\"z\",\"target\":444330,\"fallthrough\":444305,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444330,
          "fallthrough": 444305
        },
        {
          "pc": 444305,
          "bytes": "0xFE 0x06",
          "asm": "CP 0x06",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444307,
          "bytes": "0x38 0x09",
          "asm": "jr-conditional {\"pc\":444307,\"length\":2,\"nextPc\":444309,\"tag\":\"jr-conditional\",\"condition\":\"c\",\"target\":444318,\"fallthrough\":444309,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444318,
          "fallthrough": 444309
        },
        {
          "pc": 444309,
          "bytes": "0xFE 0x07",
          "asm": "CP 0x07",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444311,
          "bytes": "0x28 0x05",
          "asm": "jr-conditional {\"pc\":444311,\"length\":2,\"nextPc\":444313,\"tag\":\"jr-conditional\",\"condition\":\"z\",\"target\":444318,\"fallthrough\":444313,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444318,
          "fallthrough": 444313
        },
        {
          "pc": 444313,
          "bytes": "0xFE 0x05",
          "asm": "CP 0x05",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444315,
          "bytes": "0x20 0x0D",
          "asm": "jr-conditional {\"pc\":444315,\"length\":2,\"nextPc\":444317,\"tag\":\"jr-conditional\",\"condition\":\"nz\",\"target\":444330,\"fallthrough\":444317,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444330,
          "fallthrough": 444317
        },
        {
          "pc": 444317,
          "bytes": "0xC9",
          "asm": "RET",
          "tag": "ret",
          "target": null,
          "fallthrough": null
        }
      ]
    },
    {
      "label": "alternate cxMain target 0x06C92C",
      "start": 444716,
      "instructionCount": 24,
      "rows": [
        {
          "pc": 444716,
          "bytes": "0xFD 0xCB 0x0D 0xCE",
          "asm": "SET 1,(IY+13)",
          "tag": "indexed-cb-set",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444720,
          "bytes": "0xFD 0xCB 0x02 0x8E",
          "asm": "RES 1,(IY+2)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444724,
          "bytes": "0x47",
          "asm": "LD B,A",
          "tag": "ld-reg-reg",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444725,
          "bytes": "0x3E 0x06",
          "asm": "LD A,0x06",
          "tag": "ld-reg-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444727,
          "bytes": "0xFD 0xCB 0x35 0x5E",
          "asm": "BIT 3,(IY+53)",
          "tag": "indexed-cb-bit",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444731,
          "bytes": "0xC4 0xE3 0x39 0x02",
          "asm": "call-conditional {\"pc\":444731,\"length\":4,\"nextPc\":444735,\"tag\":\"call-conditional\",\"condition\":\"nz\",\"target\":145891,\"fallthrough\":444735,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "call-conditional",
          "target": 145891,
          "fallthrough": 444735
        },
        {
          "pc": 444735,
          "bytes": "0xC0",
          "asm": "ret-conditional {\"pc\":444735,\"length\":1,\"nextPc\":444736,\"tag\":\"ret-conditional\",\"condition\":\"nz\",\"fallthrough\":444736,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "ret-conditional",
          "target": null,
          "fallthrough": 444736
        },
        {
          "pc": 444736,
          "bytes": "0x78",
          "asm": "LD A,B",
          "tag": "ld-reg-reg",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444737,
          "bytes": "0xFE 0xFB",
          "asm": "CP 0xFB",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444739,
          "bytes": "0x20 0x0C",
          "asm": "jr-conditional {\"pc\":444739,\"length\":2,\"nextPc\":444741,\"tag\":\"jr-conditional\",\"condition\":\"nz\",\"target\":444753,\"fallthrough\":444741,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jr-conditional",
          "target": 444753,
          "fallthrough": 444741
        },
        {
          "pc": 444741,
          "bytes": "0x3A 0x8E 0x05 0xD0",
          "asm": "LD A,(0xD0058E)",
          "tag": "ld-reg-mem",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444745,
          "bytes": "0xFE 0xF8",
          "asm": "CP 0xF8",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444747,
          "bytes": "0x3E 0xFB",
          "asm": "LD A,0xFB",
          "tag": "ld-reg-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444749,
          "bytes": "0xCC 0xE4 0xD1 0x03",
          "asm": "call-conditional {\"pc\":444749,\"length\":4,\"nextPc\":444753,\"tag\":\"call-conditional\",\"condition\":\"z\",\"target\":250340,\"fallthrough\":444753,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "call-conditional",
          "target": 250340,
          "fallthrough": 444753
        },
        {
          "pc": 444753,
          "bytes": "0xCD 0xDA 0x8E 0x05",
          "asm": "CALL 0x058EDA",
          "tag": "call",
          "target": 364250,
          "fallthrough": 444757
        },
        {
          "pc": 444757,
          "bytes": "0xC8",
          "asm": "ret-conditional {\"pc\":444757,\"length\":1,\"nextPc\":444758,\"tag\":\"ret-conditional\",\"condition\":\"z\",\"fallthrough\":444758,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "ret-conditional",
          "target": null,
          "fallthrough": 444758
        },
        {
          "pc": 444758,
          "bytes": "0xFD 0xCB 0x4E 0x9E",
          "asm": "RES 3,(IY+78)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444762,
          "bytes": "0xFD 0xCB 0x4E 0xA6",
          "asm": "RES 4,(IY+78)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444766,
          "bytes": "0xFD 0xCB 0x14 0xAE",
          "asm": "RES 5,(IY+20)",
          "tag": "indexed-cb-res",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444770,
          "bytes": "0xFD 0xCB 0x11 0x46",
          "asm": "BIT 0,(IY+17)",
          "tag": "indexed-cb-bit",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444774,
          "bytes": "0xCA 0x03 0xCB 0x06",
          "asm": "jp-conditional {\"pc\":444774,\"length\":4,\"nextPc\":444778,\"tag\":\"jp-conditional\",\"condition\":\"z\",\"target\":445187,\"fallthrough\":444778,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jp-conditional",
          "target": 445187,
          "fallthrough": 444778
        },
        {
          "pc": 444778,
          "bytes": "0xFE 0xFE",
          "asm": "CP 0xFE",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 444780,
          "bytes": "0xCA 0xAB 0x70 0x09",
          "asm": "jp-conditional {\"pc\":444780,\"length\":4,\"nextPc\":444784,\"tag\":\"jp-conditional\",\"condition\":\"z\",\"target\":618667,\"fallthrough\":444784,\"terminates\":true,\"mode\":\"adl\",\"modePrefix\":null}",
          "tag": "jp-conditional",
          "target": 618667,
          "fallthrough": 444784
        },
        {
          "pc": 444784,
          "bytes": "0xFE 0x0C",
          "asm": "CP 0x0C",
          "tag": "alu-imm",
          "target": null,
          "fallthrough": null
        }
      ]
    },
    {
      "label": "cxMain dispatch wrapper 0x08C72F",
      "start": 575279,
      "instructionCount": 18,
      "rows": [
        {
          "pc": 575279,
          "bytes": "0xE5",
          "asm": "PUSH HL",
          "tag": "push",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575280,
          "bytes": "0xCD 0x2E 0x62 0x05",
          "asm": "CALL 0x05622E",
          "tag": "call",
          "target": 352814,
          "fallthrough": 575284
        },
        {
          "pc": 575284,
          "bytes": "0xE5",
          "asm": "PUSH HL",
          "tag": "push",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575285,
          "bytes": "0x2A 0xCA 0x07 0xD0",
          "asm": "LD UNDEFINED,(0xD007CA)",
          "tag": "ld-pair-mem",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575289,
          "bytes": "0xCD 0x45 0xC7 0x08",
          "asm": "CALL 0x08C745",
          "tag": "call",
          "target": 575301,
          "fallthrough": 575293
        },
        {
          "pc": 575293,
          "bytes": "0xFD 0x21 0x80 0x00 0xD0",
          "asm": "LD IY,0xD00080",
          "tag": "ld-pair-imm",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575298,
          "bytes": "0xE1",
          "asm": "POP HL",
          "tag": "pop",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575299,
          "bytes": "0xE1",
          "asm": "POP HL",
          "tag": "pop",
          "target": null,
          "fallthrough": null
        },
        {
          "pc": 575300,
          "bytes": "0xC9",
          "asm": "RET",
          "tag": "ret",
          "target": null,
          "fallthrough": null
        }
      ]
    }
  ]
}
```

