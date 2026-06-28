# Phase 877: Owner Callers + D010 Lifetime

Probe: `probe-phase877-owner-callers-d010-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase877-owner-callers-d010-lifetime.mjs`

## Summary

- Result: PASS.
- Browser stable replay packet still omits D0301B: yes.
- Browser stable replay packet omits D010EF/D010FE/D010F4: yes.
- Static owner continuations found for 0x040BEC -> 0x040BF0 and 0x040C5E -> 0x040C62: yes.
- Dynamic route hits any D0301B owner-chain target: no.
- Stable boundary has oracle D010 mirror fields: yes.
- Current stable replay drops D010 mirror fields: yes.
- D0301B+D010 replay closes D010EF/D010FE/D010F4 and leaves only D008E0: yes.
- Adjudication: The direct D0301B owner candidates are real store continuations, but the browser coldboot/replay/CLEAR route never reaches them. The OS has D010EF/D010FE/D010F4 at the stable boundary; the current browser stable replay drops those fields because the allow-list omits them. Replaying D0301B plus the D010 mirror preserves the after-CLEAR oracle fields except the separate D008E0 stack-anchor delta.

## Owner Candidate Static Chains

| Owner | PC | Role | Expected next | Lifted block evidence |
| --- | --- | --- | --- | --- |
| A | 0x040B05 | guard entry | CALL 0x03F1ED -> ret 0x040B09 | 0X040B05 call 0x03f1ed |
| A | 0x040B09 | D00894 branch | NZ -> 0x040BE2, else -> 0x040B12 -> 0x040BDE | 0X040B09 ld a, (0xd00894); 0X040B0D or a; 0X040B0E jp nz, 0x040be2 |
| A | 0x040B27 | alternate direct branch | JP 0x040BE4 | 0X040B27 xor a; 0X040B28 jp 0x040be4 |
| A | 0x040BDE | alternate common entry | LD A,0x03 -> JR 0x040BE4 | 0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4 |
| A | 0x040BEC | pre-store call | CALL 0x04572C -> ret 0x040BF0 | 0X040BEC call 0x04572c |
| A | 0x040BF0 | magic load + store | LD HL,0x5AA55A; LD (D0301B),HL at 0x040BF4 | 0X040BF0 ld hl, 0x5aa55a; 0X040BF4 ld (0xd0301b), hl; 0X040BF8 ld (iy+63), a; 0X040BFB ld sp, 0xd1a87e; 0X040BFF ld a, (0xd1a880); 0X040C03 push af; 0X040C04 xor a; 0X040C05 ld (0xd00000), a; 0X040C09 pop af; 0X040C0A bit 0, a; 0X040C0C jp z, 0x09e0d9 |
| B | 0x040C26 | setup entry | CALL 0x061DEF -> ret 0x040C2E | 0X040C26 ld hl, 0x08c754; 0X040C2A call 0x061def |
| B | 0x040C2E | ON-SP/context setup | CALL 0x040C41 -> ret 0x040C3F | 0X040C2E ld (0xd007fa), sp; 0X040C33 bit 6, (iy+63); 0X040C37 res 1, (iy+67); 0X040C3B call 0x040c41 |
| B | 0x040C56 | pre-owner call 1 | CALL 0x05519F -> ret 0x040C5A | 0X040C56 call 0x05519f |
| B | 0x040C5E | pre-store call 2 | CALL 0x0246D7 -> ret 0x040C62 | 0X040C5E call 0x0246d7 |
| B | 0x040C62 | magic load + store | LD HL,0x5AA55A; LD (D0301B),HL at 0x040C66 | 0X040C62 ld hl, 0x5aa55a; 0X040C66 ld (0xd0301b), hl; 0X040C6A call 0x04c539 |

## Owner Incoming References

| Target | From block | Kind | From block evidence |
| --- | --- | --- | --- |
| 0x040BF0 | 0x040BE2 | call-return-continuation | 0X040BE2 ld a, 0x01; 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BF0 | 0x040BE4 | call-return-continuation | 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BF0 | 0x040BE5 | call-return-continuation | 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BF0 | 0x040BE9 | call-return-continuation | 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BF0 | 0x040BEC | call-return-continuation | 0X040BEC call 0x04572c |
| 0x040BF0 | 0x040BF0 | source-reference | 0X040BF0 ld hl, 0x5aa55a; 0X040BF4 ld (0xd0301b), hl; 0X040BF8 ld (iy+63), a; 0X040BFB ld sp, 0xd1a87e; 0X040BFF ld a, (0xd1a880); 0X040C03 push af; 0X040C04 xor a; 0X040C05 ld (0xd00000), a; 0X040C09 pop af; 0X040C0A bit 0, a; 0X040C0C jp z, 0x09e0d9 |
| 0x040C62 | 0x040C5E | call-return-continuation | 0X040C5E call 0x0246d7 |
| 0x040C62 | 0x040C62 | source-reference | 0X040C62 ld hl, 0x5aa55a; 0X040C66 ld (0xd0301b), hl; 0X040C6A call 0x04c539 |
| 0x040BE4 | 0x040B27 | branch-or-fallthrough | 0X040B27 xor a; 0X040B28 jp 0x040be4 |
| 0x040BE4 | 0x040BDE | branch-or-fallthrough | 0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4 |
| 0x040BE4 | 0x040BE0 | branch-or-fallthrough | 0X040BE0 jr 0x040be4 |
| 0x040BE4 | 0x040BE2 | source-reference | 0X040BE2 ld a, 0x01; 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BE4 | 0x040BE4 | source-reference | 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c |
| 0x040BDE | 0x040B12 | branch-or-fallthrough | 0X040B12 jp 0x040bde |
| 0x040BDE | 0x040BD7 | branch-or-fallthrough | 0X040BD7 ei; 0X040BD8 ld a, (0xd00542); 0X040BDC jr 0x040bde |
| 0x040BDE | 0x040BD8 | branch-or-fallthrough | 0X040BD8 ld a, (0xd00542); 0X040BDC jr 0x040bde |
| 0x040BDE | 0x040BDC | branch-or-fallthrough | 0X040BDC jr 0x040bde |
| 0x040BDE | 0x040BDE | source-reference | 0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4 |
| 0x040BDE | 0x0454BE | branch-or-fallthrough, conditional-branch | 0X0454BE bit 1, (iy+53); 0X0454C2 jp z, 0x040bde |
| 0x040B27 | 0x040B27 | source-reference | 0X040B27 xor a; 0X040B28 jp 0x040be4 |
| 0x040B27 | 0x045575 | branch-or-fallthrough | 0X045575 jp 0x040b27 |
| 0x040C56 | 0x040C3F | branch-or-fallthrough | 0X040C3F jr 0x040c56 |
| 0x040C56 | 0x040C56 | source-reference | 0X040C56 call 0x05519f |
| 0x040C5E | 0x040C5A | call-return-continuation | 0X040C5A call 0x02507d |
| 0x040C5E | 0x040C5E | source-reference | 0X040C5E call 0x0246d7 |
| 0x040C2E | 0x040C26 | call-return-continuation | 0X040C26 ld hl, 0x08c754; 0X040C2A call 0x061def |
| 0x040C2E | 0x040C2A | call-return-continuation | 0X040C2A call 0x061def |
| 0x040C2E | 0x040C2E | source-reference | 0X040C2E ld (0xd007fa), sp; 0X040C33 bit 6, (iy+63); 0X040C37 res 1, (iy+67); 0X040C3B call 0x040c41 |

## Dynamic Owner Hit Counts

| Scope | Owner A 0x040BF0/0x040BF4 | Owner B 0x040C62/0x040C66 | All owner-chain targets |
| --- | --- | --- | --- |
| common coldboot -> stable boundary | 0 | 0 | 0 |
| current stable packet | 0 | 0 | 0 |
| current packet + D0301B | 0 | 0 | 0 |
| current packet + D0301B + D010 mirror | 0 | 0 | 0 |

## D010/D0301B Chronology

| Point | D0301B | D010EF | D010FE | D010F4 | D008E0 |
| --- | --- | --- | --- | --- | --- |
| stable boundary before browser replay | 0x000000 | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A866 |
| after current stable replay allow-list | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0xD1A866 |
| current packet before CLEAR | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0xD1A863 |
| current packet final | 0x000000 | 0x000000 | 0x000000 | 0x00 | 0x000000 |
| D0301B + D010 replay before CLEAR | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A863 |
| D0301B + D010 replay final | 0x5AA55A | 0xD2A83E | 0xD1A8CC | 0x1F | 0xD1A863 |

## In-ROM Lifetime Field Changes Before Stable Boundary

| Field | From | To | Prev PC | Observed at PC | Phase |
| --- | --- | --- | --- | --- | --- |
| D010EF | 0x000000 | 0xD2A83E | 0x08D0D6 | 0x090A71 | p5-launch-home |
| D010FE | 0x000000 | 0xD1A8A3 | 0x090A71 | 0x08D0E2 | p5-launch-home |
| D010FE | 0xD1A8A3 | 0xD1A8B9 | 0x091D65 | 0x091DA0 | p5-launch-home |
| D010FE | 0xD1A8B9 | 0xD1A8CC | 0x0918FE | 0x091B4E | p5-launch-home |
| D010F4 | 0x00 | 0x1F | 0x06994F | 0x069989 | p5-launch-home |
| D010EF | 0xD2A83E | 0x000000 | 0x001879 | 0x0018F8 | p5-launch-home |
| D010FE | 0xD1A8CC | 0x000000 | 0x001879 | 0x0018F8 | p5-launch-home |
| D010F4 | 0x1F | 0x00 | 0x001879 | 0x0018F8 | p5-launch-home |

## Browser Stable Replay Packet

| Browser Stable Replay Field |
| --- |
| D007CA |
| D008E0 |
| D02505 |
| D02587 |
| D0258A |
| D0258D |
| D02590 |
| D02593 |
| D0259A |
| D0259D |
| D025A0 |
| D025C5 |

## Probe-Local Patches

| Variant | Stage | Field | Address | Value |
| --- | --- | --- | --- | --- |
| current packet + D0301B | stable replay | D0301B | 0xD0301B | 0x5AA55A |
| current packet + D0301B + D010 mirror | stable replay | D0301B | 0xD0301B | 0x5AA55A |
| current packet + D0301B + D010 mirror | stable replay | D010EF | 0xD010EF | 0xD2A83E |
| current packet + D0301B + D010 mirror | stable replay | D010FE | 0xD010FE | 0xD1A8CC |
| current packet + D0301B + D010 mirror | stable replay | D010F4 | 0xD010F4 | 0x1F |

## Route Counts

| Variant | D0301B before CLEAR | 0x001881 | 0x0018EC | 0x0018F8 | 0x006D64 | Termination |
| --- | --- | --- | --- | --- | --- | --- |
| current stable packet | 0x000000 | 1 | 0 | 1 | 1646 | max_steps |
| current packet + D0301B | 0x5AA55A | 0 | 1 | 0 | 1646 | max_steps |
| current packet + D0301B + D010 mirror | 0x5AA55A | 0 | 1 | 0 | 1646 | max_steps |

## Branch Edges

| Variant | Sentinel block edge | Large clear edge | Short tail edge | Cleanup edge |
| --- | --- | --- | --- | --- |
| current stable packet | 0x0018AF -> 0x0018D7 | 0x0018D7 -> 0x001881 | - | 0x001881 -> 0x0018F8 |
| current packet + D0301B | 0x0018AF -> 0x0018D7 | - | 0x0018D7 -> 0x0018EC | - |
| current packet + D0301B + D010 mirror | 0x0018AF -> 0x0018D7 | - | 0x0018D7 -> 0x0018EC | - |

## Final Field Comparison

| Field | Oracle after CLEAR | current stable packet | current packet + D0301B | current packet + D0301B + D010 mirror |
| --- | --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | 0x0585E9 | 0x0585E9 |
| D008E0 | 0xD1A86C | 0x000000 | 0xD1A863 | 0xD1A863 |
| D010EF | 0xD2A83E | 0x000000 | 0x000000 | 0xD2A83E |
| D010FE | 0xD1A8CC | 0x000000 | 0x000000 | 0xD1A8CC |
| D010F4 | 0x1F | 0x00 | 0x00 | 0x1F |
| D02317 | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D0231A | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D0231D | 0xD2A83D | 0x000000 | 0xD2A83D | 0xD2A83D |
| D02437 | 0xD1A8CC | 0x000000 | 0xD1A8CC | 0xD1A8CC |
| D0243A | 0xD1A8CC | 0x000000 | 0xD1A8CC | 0xD1A8CC |
| D0243D | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D02440 | 0xD2A83E | 0x000000 | 0xD2A83E | 0xD2A83E |
| D02505 | 0x0A | 0x00 | 0x0A | 0x0A |
| D02590 | 0xD3FE81 | 0x000000 | 0xD3FE81 | 0xD3FE81 |
| D0259D | 0xD3FECD | 0x000000 | 0xD3FECD | 0xD3FECD |
| D02A29 | 0x0000 | 0x0000 | 0x0000 | 0x0000 |
| D0301B | 0x5AA55A | 0x000000 | 0x5AA55A | 0x5AA55A |
| D000C2_IY42 | 0x00 | 0x00 | 0x00 | 0x00 |

## Final Mismatches

| Variant | Field | Actual | Oracle |
| --- | --- | --- | --- |
| current stable packet | D007CA | 0x000000 | 0x0585E9 |
| current stable packet | D008E0 | 0x000000 | 0xD1A86C |
| current stable packet | D010EF | 0x000000 | 0xD2A83E |
| current stable packet | D010FE | 0x000000 | 0xD1A8CC |
| current stable packet | D010F4 | 0x00 | 0x1F |
| current stable packet | D02317 | 0x000000 | 0xD2A83E |
| current stable packet | D0231A | 0x000000 | 0xD2A83E |
| current stable packet | D0231D | 0x000000 | 0xD2A83D |
| current stable packet | D02437 | 0x000000 | 0xD1A8CC |
| current stable packet | D0243A | 0x000000 | 0xD1A8CC |
| current stable packet | D0243D | 0x000000 | 0xD2A83E |
| current stable packet | D02440 | 0x000000 | 0xD2A83E |
| current stable packet | D02505 | 0x00 | 0x0A |
| current stable packet | D02590 | 0x000000 | 0xD3FE81 |
| current stable packet | D0259D | 0x000000 | 0xD3FECD |
| current stable packet | D0301B | 0x000000 | 0x5AA55A |
| current packet + D0301B | D008E0 | 0xD1A863 | 0xD1A86C |
| current packet + D0301B | D010EF | 0x000000 | 0xD2A83E |
| current packet + D0301B | D010FE | 0x000000 | 0xD1A8CC |
| current packet + D0301B | D010F4 | 0x00 | 0x1F |
| current packet + D0301B + D010 mirror | D008E0 | 0xD1A863 | 0xD1A86C |

## Machine JSON

```json
{
  "pass": true,
  "analysis": {
    "pass": true,
    "browserPacketStillOmitsD0301B": true,
    "browserPacketOmitsD010": true,
    "stableBoundaryD0301B": "0x000000",
    "stableBoundaryD010": {
      "D010EF": "0xD2A83E",
      "D010FE": "0xD1A8CC",
      "D010F4": "0x1F"
    },
    "afterCurrentReplayD010": {
      "D010EF": "0x000000",
      "D010FE": "0x000000",
      "D010F4": "0x00"
    },
    "stableBoundaryHasD010": true,
    "currentReplayDropsD010": true,
    "ownerContinuationsFound": true,
    "ownerCandidatesNotHit": true,
    "commonOwnerCounts": {
      "ownerAStart040B05": 0,
      "ownerAGuard040B09": 0,
      "ownerADirect040B27": 0,
      "ownerAAlt0454BE": 0,
      "ownerAAlt045575": 0,
      "ownerACommon040BDE": 0,
      "ownerACall040BEC": 0,
      "ownerAStore040BF0": 0,
      "ownerAWrite040BF4": 0,
      "ownerBStart040C26": 0,
      "ownerBSetup040C2E": 0,
      "ownerBReturn040C3F": 0,
      "ownerBCall040C56": 0,
      "ownerBReturn040C5A": 0,
      "ownerBCall040C5E": 0,
      "ownerBStore040C62": 0,
      "ownerBWrite040C66": 0
    },
    "allOwnerHitTotal": 0,
    "baselineTakesLargeWipe": true,
    "d0301bSurvivesToClear": true,
    "d0301bTakesShortTail": true,
    "d0301bEditVatMatchesOracle": true,
    "d0301bLeavesOnlyGap": true,
    "d010ReplayClosesD010": true,
    "d010ReplayStillD008E0Only": true,
    "variants": {
      "currentPacket": {
        "name": "currentPacket",
        "label": "current stable packet",
        "stableReplayPatches": [],
        "beforeClearPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x0021C2",
          "lastMode": "adl"
        },
        "beforeClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        "afterClearFields": {
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
        "finalFields": {
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 1,
          "shortTail0018EC": 0,
          "cleanup0018F8": 1,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "0x0018D7 -> 0x001881",
          "shortTail": "-",
          "cleanup": "0x001881 -> 0x0018F8"
        },
        "editVatMatchesOracle": false,
        "allWatchedMismatches": [
          {
            "name": "D007CA",
            "actual": "0x000000",
            "oracle": "0x0585E9"
          },
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          },
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D02317",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D0231A",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D0231D",
            "actual": "0x000000",
            "oracle": "0xD2A83D"
          },
          {
            "name": "D02437",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D0243A",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D0243D",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D02440",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D02505",
            "actual": "0x00",
            "oracle": "0x0A"
          },
          {
            "name": "D02590",
            "actual": "0x000000",
            "oracle": "0xD3FE81"
          },
          {
            "name": "D0259D",
            "actual": "0x000000",
            "oracle": "0xD3FECD"
          },
          {
            "name": "D0301B",
            "actual": "0x000000",
            "oracle": "0x5AA55A"
          }
        ],
        "gapMismatches": [
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D008E0",
            "actual": "0x000000",
            "oracle": "0xD1A86C"
          }
        ],
        "ownerHitCounts": {
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "ownerHitTotal": 0
      },
      "d0301bReplay": {
        "name": "d0301bReplay",
        "label": "current packet + D0301B",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "beforeClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        "afterClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "-",
          "shortTail": "0x0018D7 -> 0x0018EC",
          "cleanup": "-"
        },
        "editVatMatchesOracle": true,
        "allWatchedMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          },
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          }
        ],
        "gapMismatches": [
          {
            "name": "D010EF",
            "actual": "0x000000",
            "oracle": "0xD2A83E"
          },
          {
            "name": "D010FE",
            "actual": "0x000000",
            "oracle": "0xD1A8CC"
          },
          {
            "name": "D010F4",
            "actual": "0x00",
            "oracle": "0x1F"
          },
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ],
        "ownerHitCounts": {
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "ownerHitTotal": 0
      },
      "d0301bD010Replay": {
        "name": "d0301bD010Replay",
        "label": "current packet + D0301B + D010 mirror",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "clearResult": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "beforeClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "afterClearFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "counts": {
          "anchor0A229D": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646
        },
        "edges": {
          "sentinel": "0x0018AF -> 0x0018D7",
          "largeClear": "-",
          "shortTail": "0x0018D7 -> 0x0018EC",
          "cleanup": "-"
        },
        "editVatMatchesOracle": true,
        "allWatchedMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ],
        "gapMismatches": [
          {
            "name": "D008E0",
            "actual": "0xD1A863",
            "oracle": "0xD1A86C"
          }
        ],
        "ownerHitCounts": {
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "ownerHitTotal": 0
      }
    },
    "conclusion": "The direct D0301B owner candidates are real store continuations, but the browser coldboot/replay/CLEAR route never reaches them. The OS has D010EF/D010FE/D010F4 at the stable boundary; the current browser stable replay drops those fields because the allow-list omits them. Replaying D0301B plus the D010 mirror preserves the after-CLEAR oracle fields except the separate D008E0 stack-anchor delta."
  },
  "ownerStatic": {
    "chainRows": [
      {
        "owner": "A",
        "pc": 264965,
        "role": "guard entry",
        "expectedNext": "CALL 0x03F1ED -> ret 0x040B09",
        "pcHex": "0x040B05",
        "dasm": "0X040B05 call 0x03f1ed"
      },
      {
        "owner": "A",
        "pc": 264969,
        "role": "D00894 branch",
        "expectedNext": "NZ -> 0x040BE2, else -> 0x040B12 -> 0x040BDE",
        "pcHex": "0x040B09",
        "dasm": "0X040B09 ld a, (0xd00894); 0X040B0D or a; 0X040B0E jp nz, 0x040be2"
      },
      {
        "owner": "A",
        "pc": 264999,
        "role": "alternate direct branch",
        "expectedNext": "JP 0x040BE4",
        "pcHex": "0x040B27",
        "dasm": "0X040B27 xor a; 0X040B28 jp 0x040be4"
      },
      {
        "owner": "A",
        "pc": 265182,
        "role": "alternate common entry",
        "expectedNext": "LD A,0x03 -> JR 0x040BE4",
        "pcHex": "0x040BDE",
        "dasm": "0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4"
      },
      {
        "owner": "A",
        "pc": 265196,
        "role": "pre-store call",
        "expectedNext": "CALL 0x04572C -> ret 0x040BF0",
        "pcHex": "0x040BEC",
        "dasm": "0X040BEC call 0x04572c"
      },
      {
        "owner": "A",
        "pc": 265200,
        "role": "magic load + store",
        "expectedNext": "LD HL,0x5AA55A; LD (D0301B),HL at 0x040BF4",
        "pcHex": "0x040BF0",
        "dasm": "0X040BF0 ld hl, 0x5aa55a; 0X040BF4 ld (0xd0301b), hl; 0X040BF8 ld (iy+63), a; 0X040BFB ld sp, 0xd1a87e; 0X040BFF ld a, (0xd1a880); 0X040C03 push af; 0X040C04 xor a; 0X040C05 ld (0xd00000), a; 0X040C09 pop af; 0X040C0A bit 0, a; 0X040C0C jp z, 0x09e0d9"
      },
      {
        "owner": "B",
        "pc": 265254,
        "role": "setup entry",
        "expectedNext": "CALL 0x061DEF -> ret 0x040C2E",
        "pcHex": "0x040C26",
        "dasm": "0X040C26 ld hl, 0x08c754; 0X040C2A call 0x061def"
      },
      {
        "owner": "B",
        "pc": 265262,
        "role": "ON-SP/context setup",
        "expectedNext": "CALL 0x040C41 -> ret 0x040C3F",
        "pcHex": "0x040C2E",
        "dasm": "0X040C2E ld (0xd007fa), sp; 0X040C33 bit 6, (iy+63); 0X040C37 res 1, (iy+67); 0X040C3B call 0x040c41"
      },
      {
        "owner": "B",
        "pc": 265302,
        "role": "pre-owner call 1",
        "expectedNext": "CALL 0x05519F -> ret 0x040C5A",
        "pcHex": "0x040C56",
        "dasm": "0X040C56 call 0x05519f"
      },
      {
        "owner": "B",
        "pc": 265310,
        "role": "pre-store call 2",
        "expectedNext": "CALL 0x0246D7 -> ret 0x040C62",
        "pcHex": "0x040C5E",
        "dasm": "0X040C5E call 0x0246d7"
      },
      {
        "owner": "B",
        "pc": 265314,
        "role": "magic load + store",
        "expectedNext": "LD HL,0x5AA55A; LD (D0301B),HL at 0x040C66",
        "pcHex": "0x040C62",
        "dasm": "0X040C62 ld hl, 0x5aa55a; 0X040C66 ld (0xd0301b), hl; 0X040C6A call 0x04c539"
      }
    ],
    "incoming": {
      "0x040BF0": [
        {
          "target": "0x040BF0",
          "from": "0x040BE2",
          "kind": "call-return-continuation",
          "dasm": "0X040BE2 ld a, 0x01; 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BF0",
          "from": "0x040BE4",
          "kind": "call-return-continuation",
          "dasm": "0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BF0",
          "from": "0x040BE5",
          "kind": "call-return-continuation",
          "dasm": "0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BF0",
          "from": "0x040BE9",
          "kind": "call-return-continuation",
          "dasm": "0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BF0",
          "from": "0x040BEC",
          "kind": "call-return-continuation",
          "dasm": "0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BF0",
          "from": "0x040BF0",
          "kind": "source-reference",
          "dasm": "0X040BF0 ld hl, 0x5aa55a; 0X040BF4 ld (0xd0301b), hl; 0X040BF8 ld (iy+63), a; 0X040BFB ld sp, 0xd1a87e; 0X040BFF ld a, (0xd1a880); 0X040C03 push af; 0X040C04 xor a; 0X040C05 ld (0xd00000), a; 0X040C09 pop af; 0X040C0A bit 0, a; 0X040C0C jp z, 0x09e0d9"
        }
      ],
      "0x040C62": [
        {
          "target": "0x040C62",
          "from": "0x040C5E",
          "kind": "call-return-continuation",
          "dasm": "0X040C5E call 0x0246d7"
        },
        {
          "target": "0x040C62",
          "from": "0x040C62",
          "kind": "source-reference",
          "dasm": "0X040C62 ld hl, 0x5aa55a; 0X040C66 ld (0xd0301b), hl; 0X040C6A call 0x04c539"
        }
      ],
      "0x040BE4": [
        {
          "target": "0x040BE4",
          "from": "0x040B27",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040B27 xor a; 0X040B28 jp 0x040be4"
        },
        {
          "target": "0x040BE4",
          "from": "0x040BDE",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4"
        },
        {
          "target": "0x040BE4",
          "from": "0x040BE0",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040BE0 jr 0x040be4"
        },
        {
          "target": "0x040BE4",
          "from": "0x040BE2",
          "kind": "source-reference",
          "dasm": "0X040BE2 ld a, 0x01; 0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        },
        {
          "target": "0x040BE4",
          "from": "0x040BE4",
          "kind": "source-reference",
          "dasm": "0X040BE4 di; 0X040BE5 ld (0xd1a880), a; 0X040BE9 ld a, (iy+63); 0X040BEC call 0x04572c"
        }
      ],
      "0x040BDE": [
        {
          "target": "0x040BDE",
          "from": "0x040B12",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040B12 jp 0x040bde"
        },
        {
          "target": "0x040BDE",
          "from": "0x040BD7",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040BD7 ei; 0X040BD8 ld a, (0xd00542); 0X040BDC jr 0x040bde"
        },
        {
          "target": "0x040BDE",
          "from": "0x040BD8",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040BD8 ld a, (0xd00542); 0X040BDC jr 0x040bde"
        },
        {
          "target": "0x040BDE",
          "from": "0x040BDC",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040BDC jr 0x040bde"
        },
        {
          "target": "0x040BDE",
          "from": "0x040BDE",
          "kind": "source-reference",
          "dasm": "0X040BDE ld a, 0x03; 0X040BE0 jr 0x040be4"
        },
        {
          "target": "0x040BDE",
          "from": "0x0454BE",
          "kind": "branch-or-fallthrough, conditional-branch",
          "dasm": "0X0454BE bit 1, (iy+53); 0X0454C2 jp z, 0x040bde"
        }
      ],
      "0x040B27": [
        {
          "target": "0x040B27",
          "from": "0x040B27",
          "kind": "source-reference",
          "dasm": "0X040B27 xor a; 0X040B28 jp 0x040be4"
        },
        {
          "target": "0x040B27",
          "from": "0x045575",
          "kind": "branch-or-fallthrough",
          "dasm": "0X045575 jp 0x040b27"
        }
      ],
      "0x040C56": [
        {
          "target": "0x040C56",
          "from": "0x040C3F",
          "kind": "branch-or-fallthrough",
          "dasm": "0X040C3F jr 0x040c56"
        },
        {
          "target": "0x040C56",
          "from": "0x040C56",
          "kind": "source-reference",
          "dasm": "0X040C56 call 0x05519f"
        }
      ],
      "0x040C5E": [
        {
          "target": "0x040C5E",
          "from": "0x040C5A",
          "kind": "call-return-continuation",
          "dasm": "0X040C5A call 0x02507d"
        },
        {
          "target": "0x040C5E",
          "from": "0x040C5E",
          "kind": "source-reference",
          "dasm": "0X040C5E call 0x0246d7"
        }
      ],
      "0x040C2E": [
        {
          "target": "0x040C2E",
          "from": "0x040C26",
          "kind": "call-return-continuation",
          "dasm": "0X040C26 ld hl, 0x08c754; 0X040C2A call 0x061def"
        },
        {
          "target": "0x040C2E",
          "from": "0x040C2A",
          "kind": "call-return-continuation",
          "dasm": "0X040C2A call 0x061def"
        },
        {
          "target": "0x040C2E",
          "from": "0x040C2E",
          "kind": "source-reference",
          "dasm": "0X040C2E ld (0xd007fa), sp; 0X040C33 bit 6, (iy+63); 0X040C37 res 1, (iy+67); 0X040C3B call 0x040c41"
        }
      ]
    },
    "ownerAContinuationFound": true,
    "ownerBContinuationFound": true
  },
  "common": {
    "phases": [
      {
        "name": "p1-coldboot",
        "result": {
          "steps": 20000,
          "termination": "max_steps",
          "lastPc": "0x001CC0",
          "lastMode": "adl"
        }
      },
      {
        "name": "p2-kernel",
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x000A92",
          "lastMode": "adl"
        }
      },
      {
        "name": "p3-postinit",
        "result": {
          "steps": 100,
          "termination": "max_steps",
          "lastPc": "0x0158BC",
          "lastMode": "adl"
        }
      },
      {
        "name": "p4-warm-idle",
        "result": {
          "steps": 192290,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        }
      },
      {
        "name": "p5-launch-home",
        "result": {
          "steps": 275843,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        }
      }
    ],
    "stableSnapshot": {
      "atBlock": 396519,
      "watchedFields": {
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
      "replayFields": [
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
          "value": "0x0A"
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
        }
      ]
    },
    "routeSummary": {
      "totalBlocks": 588232,
      "targetCounts": {
        "launchHome09DD62": 1,
        "phase5PreWipe001879": 6,
        "clearCaller058A16": 0,
        "clearEntry0A223A": 0,
        "anchor0A229D": 0,
        "liveSpin0A1854": 32,
        "portBranch001872": 6,
        "portSkip0018AF": 0,
        "sentinelBlock0018D7": 0,
        "largeClear001881": 0,
        "shortTail0018EC": 0,
        "cleanup0018F8": 6,
        "poll006D64": 30264,
        "ownerAStart040B05": 0,
        "ownerAGuard040B09": 0,
        "ownerADirect040B27": 0,
        "ownerAAlt0454BE": 0,
        "ownerAAlt045575": 0,
        "ownerACommon040BDE": 0,
        "ownerACall040BEC": 0,
        "ownerAStore040BF0": 0,
        "ownerAWrite040BF4": 0,
        "ownerBStart040C26": 0,
        "ownerBSetup040C2E": 0,
        "ownerBReturn040C3F": 0,
        "ownerBCall040C56": 0,
        "ownerBReturn040C5A": 0,
        "ownerBCall040C5E": 0,
        "ownerBStore040C62": 0,
        "ownerBWrite040C66": 0
      },
      "fieldChanges": [
        {
          "name": "D010EF",
          "from": "0x000000",
          "to": "0xD2A83E",
          "at": {
            "block": 360517,
            "phase": "p5-launch-home",
            "pc": "0x090A71",
            "prevPc": "0x08D0D6",
            "cpu": {
              "pc": "0x090A71",
              "currentBlockPc": "0x090A71",
              "sp": "0xD1A857",
              "af": "0x0002",
              "bc": "0xD3FE81",
              "de": "0xD1A8A3",
              "hl": "0xD2A83E",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
              "D010EF": "0xD2A83E",
              "D010FE": "0x000000",
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
            "stackTop": [
              {
                "addr": "0xD1A857",
                "value": "0x08D0E2"
              },
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
              }
            ]
          }
        },
        {
          "name": "D010FE",
          "from": "0x000000",
          "to": "0xD1A8A3",
          "at": {
            "block": 360518,
            "phase": "p5-launch-home",
            "pc": "0x08D0E2",
            "prevPc": "0x090A71",
            "cpu": {
              "pc": "0x08D0E2",
              "currentBlockPc": "0x08D0E2",
              "sp": "0xD1A85A",
              "af": "0x0002",
              "bc": "0xD3FE81",
              "de": "0xD1A8A3",
              "hl": "0xD1A8A3",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A866",
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
            "stackTop": [
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
              }
            ]
          }
        },
        {
          "name": "D010FE",
          "from": "0xD1A8A3",
          "to": "0xD1A8B9",
          "at": {
            "block": 360559,
            "phase": "p5-launch-home",
            "pc": "0x091DA0",
            "prevPc": "0x091D65",
            "cpu": {
              "pc": "0x091DA0",
              "currentBlockPc": "0x091DA0",
              "sp": "0xD1A824",
              "af": "0x0240",
              "bc": "0x000016",
              "de": "0xD1A8A3",
              "hl": "0x000000",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A833",
              "D010EF": "0xD2A83E",
              "D010FE": "0xD1A8B9",
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
            "stackTop": [
              {
                "addr": "0xD1A824",
                "value": "0x091D71"
              },
              {
                "addr": "0xD1A827",
                "value": "0x0918AE"
              },
              {
                "addr": "0xD1A82A",
                "value": "0x091810"
              },
              {
                "addr": "0xD1A82D",
                "value": "0x08D1BE"
              }
            ]
          }
        },
        {
          "name": "D010FE",
          "from": "0xD1A8B9",
          "to": "0xD1A8CC",
          "at": {
            "block": 360596,
            "phase": "p5-launch-home",
            "pc": "0x091B4E",
            "prevPc": "0x0918FE",
            "cpu": {
              "pc": "0x091B4E",
              "currentBlockPc": "0x091B4E",
              "sp": "0xD1A815",
              "af": "0x1FA0",
              "bc": "0x000001",
              "de": "0x000013",
              "hl": "0xD1A8B9",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0xA0"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A833",
              "D010EF": "0xD2A83E",
              "D010FE": "0xD1A8CC",
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
            "stackTop": [
              {
                "addr": "0xD1A815",
                "value": "0x09190D"
              },
              {
                "addr": "0xD1A818",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A81B",
                "value": "0x000042"
              },
              {
                "addr": "0xD1A81E",
                "value": "0x091874"
              }
            ]
          }
        },
        {
          "name": "D010F4",
          "from": "0x00",
          "to": "0x1F",
          "at": {
            "block": 360625,
            "phase": "p5-launch-home",
            "pc": "0x069989",
            "prevPc": "0x06994F",
            "cpu": {
              "pc": "0x069989",
              "currentBlockPc": "0x069989",
              "sp": "0xD1A82A",
              "af": "0x0093",
              "bc": "0x00000F",
              "de": "0x000002",
              "hl": "0xD1A8B6",
              "ix": "0xFFFFFF",
              "iy": "0xD00080",
              "f": "0x93"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A833",
              "D010EF": "0xD2A83E",
              "D010FE": "0xD1A8CC",
              "D010F4": "0x1F",
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
            "stackTop": [
              {
                "addr": "0xD1A82A",
                "value": "0xD1A8B4"
              },
              {
                "addr": "0xD1A82D",
                "value": "0x08D1C3"
              },
              {
                "addr": "0xD1A830",
                "value": "0x08D183"
              },
              {
                "addr": "0xD1A833",
                "value": "0x061E27"
              }
            ]
          }
        },
        {
          "name": "D010EF",
          "from": "0xD2A83E",
          "to": "0x000000",
          "at": {
            "block": 396520,
            "phase": "p5-launch-home",
            "pc": "0x0018F8",
            "prevPc": "0x001879",
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
              "f": "0x00"
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
              }
            ]
          }
        },
        {
          "name": "D010FE",
          "from": "0xD1A8CC",
          "to": "0x000000",
          "at": {
            "block": 396520,
            "phase": "p5-launch-home",
            "pc": "0x0018F8",
            "prevPc": "0x001879",
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
              "f": "0x00"
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
              }
            ]
          }
        },
        {
          "name": "D010F4",
          "from": "0x1F",
          "to": "0x00",
          "at": {
            "block": 396520,
            "phase": "p5-launch-home",
            "pc": "0x0018F8",
            "prevPc": "0x001879",
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
              "f": "0x00"
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
              }
            ]
          }
        }
      ],
      "checkpoints": [
        {
          "label": "afterPhase5BeforeReplay",
          "atBlock": 588232,
          "phase": "p5-launch-home",
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
            "f": "0x44"
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
          }
        },
        {
          "label": "afterCurrentStableReplay",
          "atBlock": 588232,
          "phase": "p5-launch-home",
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
            "f": "0x44"
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
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00"
          }
        }
      ]
    }
  },
  "variants": [
    {
      "variant": {
        "name": "currentPacket",
        "label": "current stable packet",
        "stableReplayPatches": [],
        "beforeClearPatches": []
      },
      "boot": {
        "stableReplayPatches": [],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        }
      },
      "clear": {
        "beforeClearPatches": [],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x0021C2",
          "lastMode": "adl"
        },
        "finalFields": {
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
        "targetCounts": {
          "launchHome09DD62": 0,
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 1,
          "shortTail0018EC": 0,
          "cleanup0018F8": 1,
          "poll006D64": 1646,
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            "stackTop": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
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
              "f": "0x0C"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "largeClear001881": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x001881",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x001881",
              "currentBlockPc": "0x001881",
              "sp": "0xD1A87B",
              "af": "0x5293",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0xA55AA6",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x93"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "cleanup0018F8": {
            "block": 77379,
            "phase": "clear-route",
            "pc": "0x0018F8",
            "prevPc": "0x001881",
            "cpu": {
              "pc": "0x0018F8",
              "currentBlockPc": "0x0018F8",
              "sp": "0xD1A87B",
              "af": "0x5281",
              "bc": "0x0000FF",
              "de": "0xD3FF00",
              "hl": "0xD3FEFF",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x81"
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
              }
            ]
          },
          "poll006D64": {
            "block": 86821,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
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
            "stackTop": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            }
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x006D5D",
              "currentBlockPc": "0x006D5D",
              "sp": "0xD1A828",
              "af": "0x0054",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x54"
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
            }
          }
        ]
      }
    },
    {
      "variant": {
        "name": "d0301bReplay",
        "label": "current packet + D0301B",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": []
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          }
        ],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        }
      },
      "clear": {
        "beforeClearPatches": [],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
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
        "targetCounts": {
          "launchHome09DD62": 0,
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646,
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            "stackTop": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
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
              "f": "0x0C"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "shortTail0018EC": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x0018EC",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x0018EC",
              "currentBlockPc": "0x0018EC",
              "sp": "0xD1A87B",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
              }
            ]
          },
          "poll006D64": {
            "block": 86820,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            "stackTop": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            }
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x0021C2",
              "currentBlockPc": "0x0021C2",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D010EF": "0x000000",
              "D010FE": "0x000000",
              "D010F4": "0x00",
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
            }
          }
        ]
      }
    },
    {
      "variant": {
        "name": "d0301bD010Replay",
        "label": "current packet + D0301B + D010 mirror",
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": 13643803,
            "len": 3,
            "value": 5940570,
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": 13635823,
            "len": 3,
            "value": 13805630,
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": 13635838,
            "len": 3,
            "value": 13740236,
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": 13635828,
            "len": 1,
            "value": 31,
            "timing": "stable replay"
          }
        ],
        "beforeClearPatches": []
      },
      "boot": {
        "stableReplayPatches": [
          {
            "name": "D0301B",
            "addr": "0xD0301B",
            "len": 3,
            "value": "0x5AA55A",
            "timing": "stable replay"
          },
          {
            "name": "D010EF",
            "addr": "0xD010EF",
            "len": 3,
            "value": "0xD2A83E",
            "timing": "stable replay"
          },
          {
            "name": "D010FE",
            "addr": "0xD010FE",
            "len": 3,
            "value": "0xD1A8CC",
            "timing": "stable replay"
          },
          {
            "name": "D010F4",
            "addr": "0xD010F4",
            "len": 1,
            "value": "0x1F",
            "timing": "stable replay"
          }
        ],
        "repaintResult": {
          "steps": 47588,
          "termination": "halt",
          "lastPc": "0x0019B5",
          "lastMode": "adl"
        },
        "bootReadyFields": {
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
        }
      },
      "clear": {
        "beforeClearPatches": [],
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": "0x006D64",
          "lastMode": "adl"
        },
        "finalFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
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
        "targetCounts": {
          "launchHome09DD62": 0,
          "phase5PreWipe001879": 0,
          "clearCaller058A16": 1,
          "clearEntry0A223A": 1,
          "anchor0A229D": 1,
          "liveSpin0A1854": 112,
          "portBranch001872": 1,
          "portSkip0018AF": 1,
          "sentinelBlock0018D7": 1,
          "largeClear001881": 0,
          "shortTail0018EC": 1,
          "cleanup0018F8": 0,
          "poll006D64": 1646,
          "ownerAStart040B05": 0,
          "ownerAGuard040B09": 0,
          "ownerADirect040B27": 0,
          "ownerAAlt0454BE": 0,
          "ownerAAlt045575": 0,
          "ownerACommon040BDE": 0,
          "ownerACall040BEC": 0,
          "ownerAStore040BF0": 0,
          "ownerAWrite040BF4": 0,
          "ownerBStart040C26": 0,
          "ownerBSetup040C2E": 0,
          "ownerBReturn040C3F": 0,
          "ownerBCall040C56": 0,
          "ownerBReturn040C5A": 0,
          "ownerBCall040C5E": 0,
          "ownerBStore040C62": 0,
          "ownerBWrite040C66": 0
        },
        "targetFirst": {
          "liveSpin0A1854": {
            "block": 184,
            "phase": "clear-route",
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": "0x0A1854",
              "currentBlockPc": "0x0A1854",
              "sp": "0xD1A83F",
              "af": "0x0054",
              "bc": "0xFF10FC",
              "de": "0xD031F6",
              "hl": "0xD0330E",
              "ix": "0xD005A1",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "stackTop": [
              {
                "addr": "0xD1A83F",
                "value": "0xD1A860"
              },
              {
                "addr": "0xD1A842",
                "value": "0xD100CC"
              },
              {
                "addr": "0xD1A845",
                "value": "0xD2A83E"
              },
              {
                "addr": "0xD1A848",
                "value": "0x00E000"
              }
            ]
          },
          "clearCaller058A16": {
            "block": 4314,
            "phase": "clear-route",
            "pc": "0x058A16",
            "prevPc": "0x058A14",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "clearEntry0A223A": {
            "block": 4315,
            "phase": "clear-route",
            "pc": "0x0A223A",
            "prevPc": "0x058A16",
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
              "f": "0x4A"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "anchor0A229D": {
            "block": 73384,
            "phase": "clear-route",
            "pc": "0x0A229D",
            "prevPc": "0x0A2A37",
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
              "f": "0x0C"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "portBranch001872": {
            "block": 77375,
            "phase": "clear-route",
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "cpu": {
              "pc": "0x001872",
              "currentBlockPc": "0x001872",
              "sp": "0xD1A87B",
              "af": "0x0044",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x44"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "portSkip0018AF": {
            "block": 77376,
            "phase": "clear-route",
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "cpu": {
              "pc": "0x0018AF",
              "currentBlockPc": "0x0018AF",
              "sp": "0xD1A87B",
              "af": "0xFE10",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x10"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "sentinelBlock0018D7": {
            "block": 77377,
            "phase": "clear-route",
            "pc": "0x0018D7",
            "prevPc": "0x0018AF",
            "cpu": {
              "pc": "0x0018D7",
              "currentBlockPc": "0x0018D7",
              "sp": "0xD1A87B",
              "af": "0xFF54",
              "bc": "0x000003",
              "de": "0x000430",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x54"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "shortTail0018EC": {
            "block": 77378,
            "phase": "clear-route",
            "pc": "0x0018EC",
            "prevPc": "0x0018D7",
            "cpu": {
              "pc": "0x0018EC",
              "currentBlockPc": "0x0018EC",
              "sp": "0xD1A87B",
              "af": "0x5242",
              "bc": "0x000003",
              "de": "0x5AA55A",
              "hl": "0x000000",
              "ix": "0xE00800",
              "iy": "0xD00080",
              "f": "0x42"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              }
            ]
          },
          "poll006D64": {
            "block": 86820,
            "phase": "clear-route",
            "pc": "0x006D64",
            "prevPc": "0x0021C2",
            "cpu": {
              "pc": "0x006D64",
              "currentBlockPc": "0x006D64",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x020000",
              "de": "0x000240",
              "hl": "0x000100",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            "stackTop": [
              {
                "addr": "0xD1A82B",
                "value": "0x000000"
              },
              {
                "addr": "0xD1A82E",
                "value": "0x020000"
              },
              {
                "addr": "0xD1A831",
                "value": "0xD1A866"
              },
              {
                "addr": "0xD1A834",
                "value": "0x0064DE"
              }
            ]
          }
        },
        "fieldChanges": [],
        "checkpoints": [
          {
            "label": "beforeClearRun",
            "atBlock": 0,
            "phase": "init",
            "cpu": {
              "pc": "0x000000",
              "currentBlockPc": "0x000000",
              "sp": "0xD1A863",
              "af": "0x0040",
              "bc": "0x000000",
              "de": "0x000000",
              "hl": "0x000000",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": "0x40"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            }
          },
          {
            "label": "afterClearRun",
            "atBlock": 99981,
            "phase": "clear-route",
            "cpu": {
              "pc": "0x0021C2",
              "currentBlockPc": "0x0021C2",
              "sp": "0xD1A82B",
              "af": "0x0002",
              "bc": "0x002001",
              "de": "0x002010",
              "hl": "0x083CFE",
              "ix": "0xD1A831",
              "iy": "0xD00080",
              "f": "0x02"
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
            }
          }
        ]
      }
    }
  ],
  "oracleAfter": {
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
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

