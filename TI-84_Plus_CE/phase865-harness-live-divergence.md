# Phase 865: Harness-vs-Live Route Divergence Trace

Probe: `probe-phase865-harness-live-divergence.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase865-harness-live-divergence.mjs`

## Summary

- Result: PASS. Fresh output falsifies the requested common-anchor premise: the Phase856 harness reaches `0x0A31FD` without hitting `0x0A229D`, so the comparable window below starts at the first shared `0x0A1854` route block.
- Harness route: anchor=0, owner=1, spin=80, termination=captured-0a31e2-to-0a31a2.
- Live browser route: anchor=1, owner=0, spin=112, key termination=max_steps.
- First divergence after common prefix: previous=0x058A14, harness next=0x058A2C, live next=0x058A16.
- Controlling state named by the trace: **Z flag at 0x058A14 JR NZ: harness F=0x0A (Z=0) takes 0x058A2C, live F=0x4A (Z=1) falls through 0x058A16; DE also differs (0xD1A8A3 vs 0xD1A8CC)**.
- Interpretation: the Phase856 owner path is selected by synthetic harness context, not by the live browser CLEAR route. The live route keeps `D02505=0x0A`, but the harness-only owner path cannot be compared from `0x0A229D` because that block is absent from the harness route.

## Divergence Diffs At Previous Common Block

| Kind | Name | Harness | Live |
| --- | --- | --- | --- |
| cpu | AF | 0x00090A | 0x00094A |
| cpu | DE | 0xD1A8A3 | 0xD1A8CC |
| cpu | F | 0x00000A | 0x00004A |

## Harness Route Window

| # | PC | Prev | SP | Stack[0] | AF | BC | DE | HL | D02505 | D00595 | D00596 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x0A1854 | 0x0A184A | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0xD031F6 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 1 | 0x0A187C | 0x0A1854 | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 2 | 0x0A188A | 0x0A187C | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 3 | 0x0A189E | 0x0A188A | 0xD1A83C | 0xFF1005 | 0x0554 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 4 | 0x0A18A6 | 0x0A189E | 0xD1A83C | 0xFF1005 | 0x0510 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 5 | 0x0A1A83 | 0x0A18A6 | 0xD1A839 | 0x0A18AF | 0x0200 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 6 | 0x0A18AF | 0x0A1A83 | 0xD1A83C | 0xFF1005 | 0xC000 | 0xFF1005 | 0x000002 | 0x0A26E6 | 0x0A | 0x00 | 0x00 |
| 7 | 0x0A18C1 | 0x0A18AF | 0xD1A83C | 0xFF1005 | 0x0000 | 0xFF0200 | 0x000002 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 8 | 0x0A18C4 | 0x0A18C1 | 0xD1A83C | 0xFF1005 | 0x0044 | 0xFF0100 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 9 | 0x0A18CA | 0x0A18C4 | 0xD1A83C | 0xFF1005 | 0x0044 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 10 | 0x0A18E9 | 0x0A18CA | 0xD1A83C | 0xFF1005 | 0xFFBB | 0xFF0000 | 0xD0330F | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 11 | 0x0A18EB | 0x0A18E9 | 0xD1A83C | 0xFF1005 | 0xFFBB | 0xFF0000 | 0xD0330F | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 12 | 0x0A190D | 0x0A18EB | 0xD1A83C | 0xFF1005 | 0x0711 | 0xFF0000 | 0xD0330E | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 13 | 0x0A191F | 0x0A190D | 0xD1A83C | 0xFF1005 | 0x0055 | 0xFF0500 | 0xD0330E | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 14 | 0x0A1939 | 0x0A191F | 0xD1A83C | 0xFF1005 | 0x0055 | 0xFF0500 | 0x0000FF | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 15 | 0x0A1969 | 0x0A1939 | 0xD1A83C | 0xFF1005 | 0xFFA8 | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 16 | 0x0A1976 | 0x0A1969 | 0xD1A83C | 0xFF1005 | 0x007C | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 17 | 0x0A1980 | 0x0A1976 | 0xD1A83C | 0xFF1005 | 0x007C | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 18 | 0x0A1988 | 0x0A1980 | 0xD1A83C | 0xFF1005 | 0x0038 | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 19 | 0x0A1A83 | 0x0A1988 | 0xD1A836 | 0x0A1994 | 0x0700 | 0xFF0007 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 20 | 0x0A1994 | 0x0A1A83 | 0xD1A839 | 0xD45C8E | 0xFE00 | 0xFF0007 | 0x000007 | 0x0A26EB | 0x0A | 0x00 | 0x00 |
| 21 | 0x0A19A4 | 0x0A1994 | 0xD1A839 | 0xD45C8E | 0x0000 | 0xFF0700 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 22 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0600 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 23 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0500 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 24 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0400 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 25 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0300 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 26 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0200 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 27 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0100 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 28 | 0x0A19AA | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 29 | 0x0A19B5 | 0x0A19AA | 0xD1A839 | 0xD45C8E | 0x0602 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 30 | 0x0A19B7 | 0x0A19B5 | 0xD1A839 | 0xD45C8E | 0x0602 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 31 | 0x0A19D7 | 0x0A19B7 | 0xD1A83C | 0xFF1005 | 0x0054 | 0x000000 | 0x000000 | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 32 | 0x0A1A1D | 0x0A19D7 | 0xD1A83C | 0xFF1005 | 0xFFA8 | 0x000000 | 0x0000FF | 0xD45C9C | 0x0A | 0x00 | 0x00 |
| 33 | 0x0A1854 | 0x0A1A1D | 0xD1A83F | 0xD1A860 | 0xFF1A | 0xFF0F05 | 0x000028 | 0xD03336 | 0x0A | 0x00 | 0x00 |
| 34 | 0x0A187C | 0x0A1854 | 0xD1A83F | 0xD1A860 | 0x005C | 0xFF0F05 | 0x000280 | 0xD45F04 | 0x0A | 0x00 | 0x00 |
| 35 | 0x0A188A | 0x0A187C | 0xD1A83F | 0xD1A860 | 0x005C | 0xFF0F05 | 0x000280 | 0xD45F04 | 0x0A | 0x00 | 0x00 |

## Live Route Window

| # | PC | Prev | SP | Stack[0] | AF | BC | DE | HL | D02505 | D00595 | D00596 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x0A1854 | 0x0A184A | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0xD031F6 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 1 | 0x0A187C | 0x0A1854 | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 2 | 0x0A188A | 0x0A187C | 0xD1A83F | 0xD1A860 | 0x0054 | 0xFF10FC | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 3 | 0x0A189E | 0x0A188A | 0xD1A83C | 0xFF1005 | 0x0554 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 4 | 0x0A18A6 | 0x0A189E | 0xD1A83C | 0xFF1005 | 0x0510 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 5 | 0x0A1A83 | 0x0A18A6 | 0xD1A839 | 0x0A18AF | 0x0200 | 0xFF1005 | 0x000280 | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 6 | 0x0A18AF | 0x0A1A83 | 0xD1A83C | 0xFF1005 | 0xC000 | 0xFF1005 | 0x000002 | 0x0A26E6 | 0x0A | 0x00 | 0x00 |
| 7 | 0x0A18C1 | 0x0A18AF | 0xD1A83C | 0xFF1005 | 0x0000 | 0xFF0200 | 0x000002 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 8 | 0x0A18C4 | 0x0A18C1 | 0xD1A83C | 0xFF1005 | 0x0044 | 0xFF0100 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 9 | 0x0A18CA | 0x0A18C4 | 0xD1A83C | 0xFF1005 | 0x0044 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 10 | 0x0A18E9 | 0x0A18CA | 0xD1A83C | 0xFF1005 | 0xFFBB | 0xFF0000 | 0xD0330F | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 11 | 0x0A18EB | 0x0A18E9 | 0xD1A83C | 0xFF1005 | 0xFFBB | 0xFF0000 | 0xD0330F | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 12 | 0x0A190D | 0x0A18EB | 0xD1A83C | 0xFF1005 | 0x0711 | 0xFF0000 | 0xD0330E | 0xD02A71 | 0x0A | 0x00 | 0x00 |
| 13 | 0x0A191F | 0x0A190D | 0xD1A83C | 0xFF1005 | 0x0055 | 0xFF0500 | 0xD0330E | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 14 | 0x0A1939 | 0x0A191F | 0xD1A83C | 0xFF1005 | 0x0055 | 0xFF0500 | 0x0000FF | 0xD45C84 | 0x0A | 0x00 | 0x00 |
| 15 | 0x0A1969 | 0x0A1939 | 0xD1A83C | 0xFF1005 | 0xFFA8 | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 16 | 0x0A1976 | 0x0A1969 | 0xD1A83C | 0xFF1005 | 0x007C | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 17 | 0x0A1980 | 0x0A1976 | 0xD1A83C | 0xFF1005 | 0x007C | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 18 | 0x0A1988 | 0x0A1980 | 0xD1A83C | 0xFF1005 | 0x0038 | 0xFF0500 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 19 | 0x0A1A83 | 0x0A1988 | 0xD1A836 | 0x0A1994 | 0x0700 | 0xFF0007 | 0x0000FF | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 20 | 0x0A1994 | 0x0A1A83 | 0xD1A839 | 0xD45C8E | 0xFE00 | 0xFF0007 | 0x000007 | 0x0A26EB | 0x0A | 0x00 | 0x00 |
| 21 | 0x0A19A4 | 0x0A1994 | 0xD1A839 | 0xD45C8E | 0x0000 | 0xFF0700 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 22 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0600 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 23 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0500 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 24 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0400 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 25 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0300 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 26 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0200 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 27 | 0x0A19A4 | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0100 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 28 | 0x0A19AA | 0x0A19A4 | 0xD1A839 | 0xD45C8E | 0x0044 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 29 | 0x0A19B5 | 0x0A19AA | 0xD1A839 | 0xD45C8E | 0x0602 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 30 | 0x0A19B7 | 0x0A19B5 | 0xD1A839 | 0xD45C8E | 0x0602 | 0xFF0000 | 0x000000 | 0xD0330E | 0x0A | 0x00 | 0x00 |
| 31 | 0x0A19D7 | 0x0A19B7 | 0xD1A83C | 0xFF1005 | 0x0054 | 0x000000 | 0x000000 | 0xD45C8E | 0x0A | 0x00 | 0x00 |
| 32 | 0x0A1A1D | 0x0A19D7 | 0xD1A83C | 0xFF1005 | 0xFFA8 | 0x000000 | 0x0000FF | 0xD45C9C | 0x0A | 0x00 | 0x00 |
| 33 | 0x0A1854 | 0x0A1A1D | 0xD1A83F | 0xD1A860 | 0xFF1A | 0xFF0F05 | 0x000028 | 0xD03336 | 0x0A | 0x00 | 0x00 |
| 34 | 0x0A187C | 0x0A1854 | 0xD1A83F | 0xD1A860 | 0x005C | 0xFF0F05 | 0x000280 | 0xD45F04 | 0x0A | 0x00 | 0x00 |
| 35 | 0x0A188A | 0x0A187C | 0xD1A83F | 0xD1A860 | 0x005C | 0xFF0F05 | 0x000280 | 0xD45F04 | 0x0A | 0x00 | 0x00 |

## Static Decode Around 0x0A229D

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0A228F | `FD CB 4C 86` | indexed-cb-res {"bit":0,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null} |
| 0x0A2293 | `C1` | POP BC |
| 0x0A2294 | `3A 05 25 D0` | LD A, (0xD02505) |
| 0x0A2298 | `90` | SUB B |
| 0x0A2299 | `CD 37 2A 0A` | CALL 0x0A2A37 |
| 0x0A229D | `78` | ld-reg-reg {"dest":"a","src":"b","mode":"adl","modePrefix":null} |
| 0x0A229E | `E5` | PUSH HL |
| 0x0A229F | `C1` | POP BC |
| 0x0A22A0 | `CD 37 2A 0A` | CALL 0x0A2A37 |
| 0x0A22A4 | `11 C0 06 D0` | LD DE, 0xD006C0 |
| 0x0A22A8 | `19` | ADD HL, DE |
| 0x0A22A9 | `E5` | PUSH HL |
| 0x0A22AA | `D1` | POP DE |
| 0x0A22AB | `13` | inc-pair {"pair":"de","mode":"adl","modePrefix":null} |
| 0x0A22AC | `36 20` | LD (?), 0x20 |
| 0x0A22AE | `ED B0` | LDIR |
| 0x0A22B0 | `C9` | RET |

## Static Decode Around Divergence

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x058A10 | `CD 12 82 05` | CALL 0x058212 |
| 0x058A14 | `20 16` | JR NZ, 0x058A2C |
| 0x058A16 | `CD 3A 22 0A` | CALL 0x0A223A |
| 0x058A1A | `FD CB 49 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":73,"mode":"adl","modePrefix":null} |
| 0x058A1E | `CD 54 8D 05` | CALL 0x058D54 |
| 0x058A22 | `CD B8 00 08` | CALL 0x0800B8 |
| 0x058A26 | `C4 E8 83 05` | call-conditional {"condition":"nz","target":361448,"fallthrough":363050,"terminates":true,"mode":"adl","modePrefix":null} |
| 0x058A2A | `18 2C` | JR 0x058A58 |
| 0x058A2C | `CD B8 00 08` | CALL 0x0800B8 |
| 0x058A30 | `28 1A` | JR Z, 0x058A4C |
| 0x058A32 | `3E 09` | LD A, 0x09 |
| 0x058A34 | `CD 14 0F 09` | CALL 0x090F14 |

## Machine JSON

```json
{
  "pass": true,
  "classification": {
    "index": 4526,
    "previousCommonPc": "0x058A14",
    "harnessNextPc": "0x058A2C",
    "liveNextPc": "0x058A16",
    "controllingState": "Z flag at 0x058A14 JR NZ: harness F=0x0A (Z=0) takes 0x058A2C, live F=0x4A (Z=1) falls through 0x058A16; DE also differs (0xD1A8A3 vs 0xD1A8CC)",
    "diffs": [
      {
        "kind": "cpu",
        "name": "AF",
        "harness": "0x00090A",
        "live": "0x00094A"
      },
      {
        "kind": "cpu",
        "name": "DE",
        "harness": "0xD1A8A3",
        "live": "0xD1A8CC"
      },
      {
        "kind": "cpu",
        "name": "F",
        "harness": "0x00000A",
        "live": "0x00004A"
      }
    ]
  },
  "harness": {
    "clearResult": {
      "steps": 4986,
      "termination": "captured-0a31e2-to-0a31a2",
      "lastPc": "0x0A31A2",
      "lastMode": "adl"
    },
    "targetCounts": {
      "anchor0A229D": 0,
      "liveSpin0A1854": 80,
      "owner0A31FD": 1,
      "ownerSetup0A322B": 1,
      "ownerEntry0A321D": 1,
      "copySetup0A31B8": 1,
      "destructiveCopy0A31E2": 1,
      "postCopy0A31A2": 1,
      "cleanup0018F8": 0,
      "poll006D64": 0
    },
    "targetFirst": {
      "liveSpin0A1854": {
        "index": 0,
        "block": 412,
        "phase": "p7-clear-outer-loop-to-owner",
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
          "f": 84,
          "flags": {
            "z": true,
            "c": false,
            "pv": true
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 0,
            "D0059A": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D000CA_IY4A": 32,
            "D000CC_IY4C": 0,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058E": "0x0F",
          "D000CA_IY4A": "0x20",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
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
          },
          {
            "addr": "0xD1A84B",
            "value": "0x00E044"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C883"
          }
        ]
      },
      "ownerEntry0A321D": {
        "index": 4558,
        "block": 4970,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A321D",
        "prevPc": "0x0A20EA",
        "cpu": {
          "pc": "0x0A321D",
          "currentBlockPc": "0x0A321D",
          "sp": "0xD1A830",
          "af": "0xFF38",
          "bc": "0x000100",
          "de": "0xD00595",
          "hl": "0xD02504",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 56,
          "flags": {
            "z": false,
            "c": false,
            "pv": false
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 0,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A830",
            "value": "0x0A20EE"
          },
          {
            "addr": "0xD1A833",
            "value": "0x0A1164"
          },
          {
            "addr": "0xD1A836",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A83C",
            "value": "0x0A2C16"
          },
          {
            "addr": "0xD1A83F",
            "value": "0x000000"
          }
        ]
      },
      "ownerSetup0A322B": {
        "index": 4559,
        "block": 4971,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A322B",
        "prevPc": "0x0A321D",
        "cpu": {
          "pc": "0x0A322B",
          "currentBlockPc": "0x0A322B",
          "sp": "0xD1A821",
          "af": "0x0044",
          "bc": "0x000100",
          "de": "0xD00595",
          "hl": "0xD02504",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 68,
          "flags": {
            "z": true,
            "c": false,
            "pv": true
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 0,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A821",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A824",
            "value": "0xD02504"
          },
          {
            "addr": "0xD1A827",
            "value": "0xD00595"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000100"
          },
          {
            "addr": "0xD1A82D",
            "value": "0x00FF38"
          },
          {
            "addr": "0xD1A830",
            "value": "0x0A20EE"
          }
        ]
      },
      "owner0A31FD": {
        "index": 4560,
        "block": 4972,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A31FD",
        "prevPc": "0x0A322B",
        "cpu": {
          "pc": "0x0A31FD",
          "currentBlockPc": "0x0A31FD",
          "sp": "0xD1A81B",
          "af": "0x0044",
          "bc": "0x000100",
          "de": "0xD00595",
          "hl": "0xD02504",
          "ix": "0xD02504",
          "iy": "0xD00080",
          "f": 68,
          "flags": {
            "z": true,
            "c": false,
            "pv": true
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 0,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A81B",
            "value": "0x0A323A"
          },
          {
            "addr": "0xD1A81E",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A821",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A824",
            "value": "0xD02504"
          },
          {
            "addr": "0xD1A827",
            "value": "0xD00595"
          },
          {
            "addr": "0xD1A82A",
            "value": "0x000100"
          }
        ]
      },
      "copySetup0A31B8": {
        "index": 4572,
        "block": 4984,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A31B8",
        "prevPc": "0x0A31F6",
        "cpu": {
          "pc": "0x0A31B8",
          "currentBlockPc": "0x0A31B8",
          "sp": "0xD1A80F",
          "af": "0x00A8",
          "bc": "0x00B414",
          "de": "0xD6507F",
          "hl": "0x01C200",
          "ix": "0xD02504",
          "iy": "0xD00080",
          "f": 168,
          "flags": {
            "z": false,
            "c": false,
            "pv": false
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 128,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x80",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A80F",
            "value": "0x003200"
          },
          {
            "addr": "0xD1A812",
            "value": "0x00B414"
          },
          {
            "addr": "0xD1A815",
            "value": "0xD0EC95"
          },
          {
            "addr": "0xD1A818",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A81B",
            "value": "0x0A323A"
          },
          {
            "addr": "0xD1A81E",
            "value": "0x000044"
          }
        ]
      },
      "destructiveCopy0A31E2": {
        "index": 4573,
        "block": 4985,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A31E2",
        "prevPc": "0x0A31B8",
        "cpu": {
          "pc": "0x0A31E2",
          "currentBlockPc": "0x0A31E2",
          "sp": "0xD1A815",
          "af": "0xCE5C",
          "bc": "0x00B414",
          "de": "0xD031F6",
          "hl": "0x002057",
          "ix": "0xD02504",
          "iy": "0xD00080",
          "f": 92,
          "flags": {
            "z": true,
            "c": false,
            "pv": true
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 128,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x80",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A815",
            "value": "0x000320"
          },
          {
            "addr": "0xD1A818",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A81B",
            "value": "0x0A323A"
          },
          {
            "addr": "0xD1A81E",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A821",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A824",
            "value": "0xD02504"
          }
        ]
      },
      "postCopy0A31A2": {
        "index": 4574,
        "block": 4986,
        "phase": "p7-clear-outer-loop-to-owner",
        "pc": "0x0A31A2",
        "prevPc": "0x0A31E2",
        "cpu": {
          "pc": "0x0A31A2",
          "currentBlockPc": "0x0A31A2",
          "sp": "0xD1A818",
          "af": "0xCE88",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "ix": "0xD02504",
          "iy": "0xD00080",
          "f": 136,
          "flags": {
            "z": false,
            "c": false,
            "pv": false
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740235,
            "D0243D": 13805629,
            "D02504": 0,
            "D02505": 10,
            "D02506": 0,
            "D02590": 13893249,
            "D0259D": 13893325,
            "D02A29": 0,
            "D00595": 0,
            "D00596": 25,
            "D0059A": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D000CA_IY4A": 33,
            "D000CC_IY4C": 128,
            "D000B2_IY32": 0
          }
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x19",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x80",
          "D000B2_IY32": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A818",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A81B",
            "value": "0x0A323A"
          },
          {
            "addr": "0xD1A81E",
            "value": "0x000044"
          },
          {
            "addr": "0xD1A821",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A824",
            "value": "0xD02504"
          },
          {
            "addr": "0xD1A827",
            "value": "0xD00595"
          }
        ]
      }
    },
    "lddrSamples": [
      {
        "logicalPc": "0x0A31C1",
        "blockPc": "0x0A31B8",
        "block": 4984,
        "before": {
          "index": 4573,
          "block": 4984,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x0A31B8",
          "prevPc": "0x0A31B8",
          "cpu": {
            "pc": "0x0A31B8",
            "currentBlockPc": "0x0A31B8",
            "sp": "0xD1A812",
            "af": "0x0082",
            "bc": "0x01C200",
            "de": "0xD6507F",
            "hl": "0xD61E7F",
            "ix": "0xD02504",
            "iy": "0xD00080",
            "f": 130,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740235,
              "D0243D": 13805629,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 25,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000CC_IY4C": 128,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x19",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000CC_IY4C": "0x80",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A812",
              "value": "0x00B414"
            },
            {
              "addr": "0xD1A815",
              "value": "0xD0EC95"
            },
            {
              "addr": "0xD1A818",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A81B",
              "value": "0x0A323A"
            },
            {
              "addr": "0xD1A81E",
              "value": "0x000044"
            },
            {
              "addr": "0xD1A821",
              "value": "0xD1A860"
            }
          ]
        },
        "after": {
          "index": 4573,
          "block": 4984,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x0A31B8",
          "prevPc": "0x0A31B8",
          "cpu": {
            "pc": "0x0A31B8",
            "currentBlockPc": "0x0A31B8",
            "sp": "0xD1A812",
            "af": "0x0080",
            "bc": "0x000000",
            "de": "0xD48E7F",
            "hl": "0xD45C7F",
            "ix": "0xD02504",
            "iy": "0xD00080",
            "f": 128,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740235,
              "D0243D": 13805629,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 25,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000CC_IY4C": 128,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x19",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000CC_IY4C": "0x80",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A812",
              "value": "0x00B414"
            },
            {
              "addr": "0xD1A815",
              "value": "0xD0EC95"
            },
            {
              "addr": "0xD1A818",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A81B",
              "value": "0x0A323A"
            },
            {
              "addr": "0xD1A81E",
              "value": "0x000044"
            },
            {
              "addr": "0xD1A821",
              "value": "0xD1A860"
            }
          ]
        },
        "copyPlan": {
          "count": "0x1C200",
          "sourceStart": "0xD45C80",
          "sourceEnd": "0xD61E7F",
          "destStart": "0xD48E80",
          "destEnd": "0xD6507F"
        }
      },
      {
        "logicalPc": "0x0A31F2",
        "blockPc": "0x0A31E2",
        "block": 4985,
        "before": {
          "index": 4574,
          "block": 4985,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x0A31E2",
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": "0x0A31E2",
            "currentBlockPc": "0x0A31E2",
            "sp": "0xD1A818",
            "af": "0xCE8A",
            "bc": "0x001C20",
            "de": "0xD0524D",
            "hl": "0xD04F2D",
            "ix": "0xD02504",
            "iy": "0xD00080",
            "f": 138,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740235,
              "D0243D": 13805629,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 25,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000CC_IY4C": 128,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x19",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000CC_IY4C": "0x80",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A818",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A81B",
              "value": "0x0A323A"
            },
            {
              "addr": "0xD1A81E",
              "value": "0x000044"
            },
            {
              "addr": "0xD1A821",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A824",
              "value": "0xD02504"
            },
            {
              "addr": "0xD1A827",
              "value": "0xD00595"
            }
          ]
        },
        "after": {
          "index": 4574,
          "block": 4985,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x0A31E2",
          "prevPc": "0x0A31E2",
          "cpu": {
            "pc": "0x0A31E2",
            "currentBlockPc": "0x0A31E2",
            "sp": "0xD1A818",
            "af": "0xCE88",
            "bc": "0x000000",
            "de": "0xD0362D",
            "hl": "0xD0330D",
            "ix": "0xD02504",
            "iy": "0xD00080",
            "f": 136,
            "flags": {
              "z": false,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740235,
              "D0243D": 13805629,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 25,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000CC_IY4C": 128,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CB",
            "D0243D": "0xD2A83D",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D00595": "0x00",
            "D00596": "0x19",
            "D0059A": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000CC_IY4C": "0x80",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A818",
              "value": "0x000040"
            },
            {
              "addr": "0xD1A81B",
              "value": "0x0A323A"
            },
            {
              "addr": "0xD1A81E",
              "value": "0x000044"
            },
            {
              "addr": "0xD1A821",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A824",
              "value": "0xD02504"
            },
            {
              "addr": "0xD1A827",
              "value": "0xD00595"
            }
          ]
        },
        "copyPlan": {
          "count": "0x1C20",
          "sourceStart": "0xD0330E",
          "sourceEnd": "0xD04F2D",
          "destStart": "0xD0362E",
          "destEnd": "0xD0524D"
        }
      }
    ]
  },
  "live": {
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
    "targetCounts": {
      "anchor0A229D": 1,
      "liveSpin0A1854": 112,
      "owner0A31FD": 0,
      "ownerSetup0A322B": 0,
      "ownerEntry0A321D": 0,
      "copySetup0A31B8": 0,
      "destructiveCopy0A31E2": 0,
      "postCopy0A31A2": 0,
      "cleanup0018F8": 1,
      "poll006D64": 9167
    },
    "targetFirst": {
      "liveSpin0A1854": {
        "index": 0,
        "block": 412,
        "pc": "0x0A1854",
        "prevPc": "0x0A184A",
        "cpu": {
          "pc": "0x0A1854",
          "currentBlockPc": "0x0A1854",
          "stepCount": 413,
          "sp": "0xD1A83F",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD031F6",
          "hl": "0xD0330E",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058E": "0x0F",
          "D000CA_IY4A": "0x20",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
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
          },
          {
            "addr": "0xD1A84B",
            "value": "0x00E044"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C883"
          }
        ]
      },
      "anchor0A229D": {
        "index": 5000,
        "block": 73965,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A229D",
          "currentBlockPc": "0x0A229D",
          "stepCount": 73978,
          "sp": "0xD1A851",
          "af": "0x0A0C",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000104",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 12
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
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
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x21",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
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
          }
        ]
      },
      "cleanup0018F8": {
        "index": 5000,
        "block": 77345,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "cpu": {
          "pc": "0x0018F8",
          "currentBlockPc": "0x0018F8",
          "stepCount": 77367,
          "sp": "0xD1A87B",
          "af": "0x5200",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": 0
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
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
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
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
        ]
      },
      "poll006D64": {
        "index": 5000,
        "block": 86654,
        "pc": "0x006D64",
        "prevPc": "0x0021C2",
        "cpu": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "stepCount": 86676,
          "sp": "0xD1A82B",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "f": 2
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D00595": "0x04",
          "D00596": "0x13",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
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
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83A",
            "value": "0x000100"
          }
        ]
      }
    },
    "topHotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 33600
      },
      {
        "pc": "0x0021C2",
        "count": 9171
      },
      {
        "pc": "0x006D5D",
        "count": 9167
      },
      {
        "pc": "0x006D64",
        "count": 9167
      },
      {
        "pc": "0x006CDF",
        "count": 9165
      },
      {
        "pc": "0x006D0F",
        "count": 9164
      },
      {
        "pc": "0x006D38",
        "count": 9163
      },
      {
        "pc": "0x006D4F",
        "count": 9163
      },
      {
        "pc": "0x006CF7",
        "count": 9162
      },
      {
        "pc": "0x026815",
        "count": 8400
      },
      {
        "pc": "0x02681A",
        "count": 8400
      },
      {
        "pc": "0x026823",
        "count": 8400
      },
      {
        "pc": "0x026810",
        "count": 8190
      },
      {
        "pc": "0x005AE8",
        "count": 1392
      },
      {
        "pc": "0x005B16",
        "count": 1392
      },
      {
        "pc": "0x005B4B",
        "count": 1392
      },
      {
        "pc": "0x005AB6",
        "count": 1305
      },
      {
        "pc": "0x0A19A4",
        "count": 784
      },
      {
        "pc": "0x02682A",
        "count": 420
      },
      {
        "pc": "0x0060B3",
        "count": 255
      },
      {
        "pc": "0x001377",
        "count": 254
      },
      {
        "pc": "0x0A1A83",
        "count": 224
      },
      {
        "pc": "0x09EFE8",
        "count": 210
      },
      {
        "pc": "0x09EFEF",
        "count": 210
      }
    ]
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

