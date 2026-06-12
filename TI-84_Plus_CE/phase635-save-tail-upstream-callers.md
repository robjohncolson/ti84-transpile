# Phase 635: Save-Tail Upstream Callers

Probe: `probe-phase635-save-tail-upstream-callers.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase635-save-tail-upstream-callers.mjs`  
Exit: 0

## Summary

- *** Natural EOL dynamically reaches the shared save tail with active return-stack origins in the `0x08E4xx`/`0x08E5xx`/`0x08EFxx`/`0x0903xx` clusters plus the narrow `0x08F547` save site.
- *** The actual durable tuple-save path is still narrow: the static `CALL 0x08F33E` at `0x08F547` falls through to `0x08F54B`, and both natural `0x08F54B` hits occur before the two later `0x0018F8` cleanup wipes.
- ** The direct-call scan separates hard CALL edges from JP/fallthrough context: `0x08F33E` has 9 direct CALL sites, `0x090755` has 24, and `0x090378` has 3 (`0x09067B`, `0x090AA5`, `0x090EB4`).

## Dynamic Result

- termination=halt steps=316825 lastPc=0x0019B5
- final tuple: `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D01150=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00`

## Dynamic Return-Stack Origin Histogram

| Target | Role | Active return-stack origin | Hits |
|---|---|---|---:|
| 0x08F33E | save-tail mode/key-state prelude | 0x08E4A4 | 2 |
| 0x08F33E | save-tail mode/key-state prelude | 0x08E588 | 6 |
| 0x08F33E | save-tail mode/key-state prelude | 0x08EFD8 | 1 |
| 0x08F33E | save-tail mode/key-state prelude | 0x08F547 | 2 |
| 0x08F33E | save-tail mode/key-state prelude | 0x0903D6 | 2 |
| 0x090755 | D01143 cursor bridge | 0x08E4A4 | 2 |
| 0x090755 | D01143 cursor bridge | 0x08E4B1 | 2 |
| 0x090755 | D01143 cursor bridge | 0x08E588 | 6 |
| 0x090755 | D01143 cursor bridge | 0x08E5CB | 6 |
| 0x090755 | D01143 cursor bridge | 0x08E5EE | 1 |
| 0x090755 | D01143 cursor bridge | 0x08E600 | 1 |
| 0x090755 | D01143 cursor bridge | 0x08EFD8 | 1 |
| 0x090755 | D01143 cursor bridge | 0x08F2F2 | 2 |
| 0x090755 | D01143 cursor bridge | 0x08F547 | 2 |
| 0x090755 | D01143 cursor bridge | 0x0903D6 | 2 |
| 0x090378 | display tuple bridge | 0x08E4A4 | 2 |
| 0x090378 | display tuple bridge | 0x08E4B1 | 2 |
| 0x090378 | display tuple bridge | 0x08E541 | 4 |
| 0x090378 | display tuple bridge | 0x08E588 | 6 |
| 0x090378 | display tuple bridge | 0x08E5CB | 6 |
| 0x090378 | display tuple bridge | 0x08E5EE | 1 |
| 0x090378 | display tuple bridge | 0x08E600 | 1 |
| 0x090378 | display tuple bridge | 0x08EFD8 | 1 |
| 0x090378 | display tuple bridge | 0x08F2F2 | 2 |
| 0x090378 | display tuple bridge | 0x08F3C5 | 5 |
| 0x090378 | display tuple bridge | 0x08F3E5 | 2 |
| 0x090378 | display tuple bridge | 0x08F547 | 2 |
| 0x090378 | display tuple bridge | 0x08F6B9 | 5 |
| 0x090378 | display tuple bridge | 0x08F6F0 | 5 |
| 0x090378 | display tuple bridge | 0x0903D6 | 2 |
| 0x090378 | display tuple bridge | 0x0906C6 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x08E4A4 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x08E4B1 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x08E504 | 4 |
| 0x04C90D | 16-bit tuple reader | 0x08E541 | 4 |
| 0x04C90D | 16-bit tuple reader | 0x08E588 | 6 |
| 0x04C90D | 16-bit tuple reader | 0x08E5CB | 6 |
| 0x04C90D | 16-bit tuple reader | 0x08E5EE | 1 |
| 0x04C90D | 16-bit tuple reader | 0x08E600 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x08EFD8 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x08F2F2 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x08F3C5 | 5 |
| 0x04C90D | 16-bit tuple reader | 0x08F3E5 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x08F547 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x08F6B9 | 5 |
| 0x04C90D | 16-bit tuple reader | 0x08F6F0 | 5 |
| 0x04C90D | 16-bit tuple reader | 0x08F7EF | 20 |
| 0x04C90D | 16-bit tuple reader | 0x0903D6 | 2 |
| 0x04C90D | 16-bit tuple reader | 0x0906C6 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x090799 | 14 |
| 0x04C90D | 16-bit tuple reader | 0x0908AD | 10 |
| 0x04C90D | 16-bit tuple reader | 0x09195E | 1 |
| 0x04C90D | 16-bit tuple reader | 0x091AD0 | 4 |
| 0x04C90D | 16-bit tuple reader | 0x091B22 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x0A2DC6 | 1 |
| 0x04C90D | 16-bit tuple reader | 0x0A2DCB | 1 |
| 0x08F54B | D02A29 save site | 0x00000A | 2 |
| 0x0018F8 | cleanup wipe | (none) | 0 |
| 0x0019B5 | halt | (none) | 0 |

## First Dynamic Events

| # | Block | PC | Inferred caller | SP | HL | DE | BC | Tuple |
|---:|---:|---|---|---|---|---|---|---|
| 1 | 3082 | 0x04C90D | 0x090799 | 0xD1A842 | 0xD1A8A3 | 0xD1A92B | 0x000000 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A7F7 D02A28=0x00` |
| 2 | 3088 | 0x04C90D | 0x08F7EF | 0xD1A845 | 0xD1A8B7 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A7F7 D02A28=0x00` |
| 3 | 5288 | 0x04C90D | 0x0908AD | 0xD1A848 | 0xD1A903 | 0xD2EF2A | 0xFFFFF5 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 4 | 5462 | 0x04C90D | 0x08F7EF | 0xD1A824 | 0xD1A8CD | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 5 | 5511 | 0x090378 | 0x08F3E5 | 0xD1A81B | 0xD2A814 | 0x000013 | 0x00000F | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 6 | 5512 | 0x04C90D | 0x08F3E5 | 0xD1A81B | 0xD2A823 | 0x000013 | 0x00000F | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 7 | 5922 | 0x04C90D | 0x090799 | 0xD1A83F | 0xD1A8A3 | 0x00000E | 0xD10008 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A829 D02A28=0x00` |
| 8 | 10284 | 0x04C90D | 0x0908AD | 0xD1A848 | 0xD1A91C | 0xD2EF2A | 0xFFFFDC | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 9 | 10477 | 0x04C90D | 0x08F7EF | 0xD1A824 | 0xD1A8E3 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x01` |
| 10 | 10508 | 0x04C90D | 0x091AD0 | 0xD1A81B | 0xD2A825 | 0x000011 | 0xD2A83E | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x01` |
| 11 | 10660 | 0x090378 | 0x08F3E5 | 0xD1A81B | 0xD2A829 | 0x000013 | 0x00000F | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x01` |
| 12 | 10661 | 0x04C90D | 0x08F3E5 | 0xD1A81B | 0xD2A838 | 0x000013 | 0x00000F | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x01` |
| 13 | 11298 | 0x04C90D | 0x090799 | 0xD1A83F | 0xD1A8A3 | 0x00000E | 0xD10008 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A83E D02A28=0x00` |
| 14 | 13725 | 0x04C90D | 0x090799 | 0xD1A842 | 0xD1A8A3 | 0x0002B0 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 15 | 13848 | 0x04C90D | 0x08F7EF | 0xD1A845 | 0xD1A8B7 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 16 | 13869 | 0x04C90D | 0x08F7EF | 0xD1A842 | 0xD1A8B7 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 17 | 15516 | 0x04C90D | 0x0908AD | 0xD1A845 | 0xD1A903 | 0xD2EF2A | 0xFFFFF5 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 18 | 15687 | 0x08F33E | 0x0903D6 | 0xD1A839 | 0xD1A8C8 | 0x0000D8 | 0x00000D | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 19 | 15688 | 0x090755 | 0x0903D6 | 0xD1A839 | 0xD1A8C8 | 0x0000D8 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 20 | 15689 | 0x090378 | 0x0903D6 | 0xD1A839 | 0xD1A8B9 | 0x0000D8 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 21 | 15690 | 0x04C90D | 0x0903D6 | 0xD1A839 | 0xD1A8C2 | 0x0000D8 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 22 | 15713 | 0x04C90D | 0x08F7EF | 0xD1A81E | 0xD1A8CD | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 23 | 16095 | 0x04C90D | 0x08F7EF | 0xD1A812 | 0xD1A8CD | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 24 | 16520 | 0x04C90D | 0x090799 | 0xD1A83C | 0xD1A8A3 | 0x00000E | 0x000008 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 25 | 20116 | 0x04C90D | 0x0908AD | 0xD1A845 | 0xD1A91C | 0xD2EF2A | 0xFFFFDC | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 26 | 20306 | 0x08F33E | 0x0903D6 | 0xD1A839 | 0xD1A8DE | 0x000212 | 0x00000D | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 27 | 20307 | 0x090755 | 0x0903D6 | 0xD1A839 | 0xD1A8DE | 0x000212 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 28 | 20308 | 0x090378 | 0x0903D6 | 0xD1A839 | 0xD1A8CF | 0x000212 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 29 | 20309 | 0x04C90D | 0x0903D6 | 0xD1A839 | 0xD1A8D8 | 0x000212 | 0x000009 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 30 | 20449 | 0x04C90D | 0x08F7EF | 0xD1A81E | 0xD1A8E3 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 31 | 20480 | 0x04C90D | 0x091AD0 | 0xD1A815 | 0xD2A825 | 0x000011 | 0xD2A83E | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 32 | 20504 | 0x04C90D | 0x08F7EF | 0xD1A812 | 0xD1A8E3 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 33 | 20879 | 0x04C90D | 0x091AD0 | 0xD1A809 | 0xD2A825 | 0x000011 | 0xD2A83E | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x01` |
| 34 | 21290 | 0x04C90D | 0x090799 | 0xD1A83C | 0xD1A8A3 | 0x00000E | 0x000008 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 35 | 23468 | 0x04C90D | 0x08E504 | 0xD1A83F | 0xD1A8A3 | 0x000000 | 0x000000 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 36 | 23476 | 0x04C90D | 0x08F7EF | 0xD1A83C | 0xD1A8B7 | 0x000000 | 0x000014 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 37 | 23495 | 0x090378 | 0x08F6B9 | 0xD1A836 | 0xD1A8E5 | 0x000000 | 0x00000D | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 38 | 23496 | 0x04C90D | 0x08F6B9 | 0xD1A836 | 0xD1A8F2 | 0x000000 | 0x00000D | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 39 | 23503 | 0x090378 | 0x08F6F0 | 0xD1A839 | 0xD1A8E5 | 0x000000 | 0x00000B | `D02A29=0x013A D02A2B=0x0000 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 40 | 23504 | 0x04C90D | 0x08F6F0 | 0xD1A839 | 0xD1A8F0 | 0x000000 | 0x00000B | `D02A29=0x013A D02A2B=0x0000 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 41 | 23523 | 0x090378 | 0x08F3C5 | 0xD1A839 | 0xD1A8E5 | 0xD1A8E5 | 0x000009 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 42 | 23524 | 0x04C90D | 0x08F3C5 | 0xD1A839 | 0xD1A8EE | 0xD1A8E5 | 0x000009 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 43 | 25888 | 0x04C90D | 0x0908AD | 0xD1A839 | 0xD1A903 | 0xD2EF2A | 0x000029 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 44 | 26053 | 0x08F33E | 0x08F547 | 0xD1A827 | 0xD2A814 | 0xD1A901 | 0xD1A8E5 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 45 | 26054 | 0x090755 | 0x08F547 | 0xD1A827 | 0xD2A814 | 0xD1A901 | 0x000009 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 46 | 26055 | 0x090378 | 0x08F547 | 0xD1A827 | 0xD1A8B9 | 0xD1A901 | 0x000009 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 47 | 26056 | 0x04C90D | 0x08F547 | 0xD1A827 | 0xD1A8C2 | 0xD1A901 | 0x000009 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 48 | 26057 | 0x08F54B | 0x00000A | 0xD1A82A | 0xD1A8C4 | 0x00000E | 0x000009 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 49 | 26059 | 0x04C90D | 0x090799 | 0xD1A830 | 0xD1A8A3 | 0x000000 | 0x000009 | `D02A29=0x00E6 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 50 | 30683 | 0x04C90D | 0x0908AD | 0xD1A839 | 0xD1A91C | 0xD2EF2A | 0x000010 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 51 | 30867 | 0x08F33E | 0x08F547 | 0xD1A827 | 0xD2A814 | 0xD1A91A | 0xD1A8E5 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 52 | 30868 | 0x090755 | 0x08F547 | 0xD1A827 | 0xD2A814 | 0xD1A91A | 0x000009 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 53 | 30869 | 0x090378 | 0x08F547 | 0xD1A827 | 0xD1A8CF | 0xD1A91A | 0x000009 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 54 | 30870 | 0x04C90D | 0x08F547 | 0xD1A827 | 0xD1A8D8 | 0xD1A91A | 0x000009 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 55 | 30871 | 0x08F54B | 0x00000A | 0xD1A82A | 0xD1A8DA | 0x00000E | 0x000009 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 56 | 30873 | 0x04C90D | 0x090799 | 0xD1A830 | 0xD1A8A3 | 0x000000 | 0x000009 | `D02A29=0x0220 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| 57 | 33661 | 0x08F33E | 0x08E588 | 0xD1A84B | 0xD1A8A3 | 0x000000 | 0x000000 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 58 | 33662 | 0x090755 | 0x08E588 | 0xD1A84B | 0xD1A8A3 | 0x000000 | 0x000009 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 59 | 33663 | 0x090378 | 0x08E588 | 0xD1A84B | 0xD1A8A3 | 0x000000 | 0x000009 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 60 | 33664 | 0x04C90D | 0x08E588 | 0xD1A84B | 0xD1A8AC | 0x000000 | 0x000009 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 61 | 33695 | 0x090755 | 0x08E5CB | 0xD1A848 | 0x00FF2C | 0x0000E8 | 0x000007 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 62 | 33696 | 0x090378 | 0x08E5CB | 0xD1A848 | 0xD1A8A3 | 0x0000E8 | 0x000007 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 63 | 33697 | 0x04C90D | 0x08E5CB | 0xD1A848 | 0xD1A8AA | 0x0000E8 | 0x000007 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |
| 64 | 37458 | 0x08F33E | 0x08E588 | 0xD1A848 | 0x000179 | 0x000138 | 0x000013 | `D02A29=0x02A4 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x2D D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A814 D02A28=0x00` |

## Static Direct CALL Scan

| Target | Direct CALL sites |
|---|---|
| 0x08F33E | 0x08E4A4, 0x08E588, 0x08E9FA, 0x08EDB2, 0x08EE82, 0x08EFD8, 0x08F547, 0x08FBAA, 0x0903D6 |
| 0x090755 | 0x08E4B1, 0x08E5CB, 0x08E5EE, 0x08E600, 0x08E625, 0x08E946, 0x08E9E8, 0x08EA46, 0x08EDDE, 0x08EEB4, 0x08EEEB, 0x08F313, 0x08F4A7, 0x08F4C8, 0x08F4D5, 0x08F4EB, 0x08F510, 0x09058A, 0x0905E8, 0x0906EA, 0x090C97, 0x090DF9, 0x091A11, 0x0A8E8D |
| 0x090378 | 0x09067B, 0x090AA5, 0x090EB4 |

## Dynamic Caller Decode Windows

### caller 0x08E4A4

```text
0x08E4A4 CD 3E F3 08     tag=call target=586558 fallthrough=582824 terminates=true mode=adl modePrefix=null
0x08E4A8 40 ED 53 43 2A  tag=ld-mem-pair addr=10819 pair=de mode=adl modePrefix=sis
0x08E4AD 01 07 00 00     tag=ld-pair-imm pair=bc value=7 mode=adl modePrefix=null
0x08E4B1 CD 55 07 09     tag=call target=591701 fallthrough=582837 terminates=true mode=adl modePrefix=null
```

### caller 0x08E4B1

```text
0x08E4B1 CD 55 07 09     tag=call target=591701 fallthrough=582837 terminates=true mode=adl modePrefix=null
0x08E4B5 40 ED 53 45 2A  tag=ld-mem-pair addr=10821 pair=de mode=adl modePrefix=sis
0x08E4BA FD CB 01 56     tag=indexed-cb-bit bit=2 indexRegister=iy displacement=1 mode=adl modePrefix=null
0x08E4BE C8              tag=ret-conditional condition=z fallthrough=582847 terminates=true mode=adl modePrefix=null
```

### caller 0x08E504

```text
0x08E504 CD 0D C9 04     tag=call target=313613 fallthrough=582920 terminates=true mode=adl modePrefix=null
0x08E508 3E 1F           tag=ld-reg-imm dest=a value=31 mode=adl modePrefix=null
0x08E50A E1              tag=pop pair=hl mode=adl modePrefix=null
0x08E50B CD 9F 07 09     tag=call target=591775 fallthrough=582927 terminates=true mode=adl modePrefix=null
```

### caller 0x08E541

```text
0x08E541 CD 7D 03 09     tag=call target=590717 fallthrough=582981 terminates=true mode=adl modePrefix=null
0x08E545 7A              tag=ld-reg-reg dest=a src=d mode=adl modePrefix=null
0x08E546 B7              tag=alu-reg op=or src=a mode=adl modePrefix=null
0x08E547 20 0A           tag=jr-conditional condition=nz target=582995 fallthrough=582985 terminates=true mode=adl modePrefix=null
```

### caller 0x08E588

```text
0x08E588 CD 3E F3 08     tag=call target=586558 fallthrough=583052 terminates=true mode=adl modePrefix=null
0x08E58C 7A              tag=ld-reg-reg dest=a src=d mode=adl modePrefix=null
0x08E58D B3              tag=alu-reg op=or src=e mode=adl modePrefix=null
0x08E58E C8              tag=ret-conditional condition=z fallthrough=583055 terminates=true mode=adl modePrefix=null
```

### caller 0x08E5CB

```text
0x08E5CB CD 55 07 09     tag=call target=591701 fallthrough=583119 terminates=true mode=adl modePrefix=null
0x08E5CF 1B              tag=dec-pair pair=de mode=adl modePrefix=null
0x08E5D0 1B              tag=dec-pair pair=de mode=adl modePrefix=null
0x08E5D1 C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x08E5EE

```text
0x08E5EE CD 55 07 09     tag=call target=591701 fallthrough=583154 terminates=true mode=adl modePrefix=null
0x08E5F2 40 2A 54 11     tag=ld-pair-mem pair=hl addr=4436 direction=from-mem mode=adl modePrefix=sis
0x08E5F6 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08E5F8 40 22 54 11     tag=ld-pair-mem pair=hl addr=4436 direction=to-mem mode=adl modePrefix=sis
0x08E5FC 01 0F 00 00     tag=ld-pair-imm pair=bc value=15 mode=adl modePrefix=null
0x08E600 CD 55 07 09     tag=call target=591701 fallthrough=583172 terminates=true mode=adl modePrefix=null
```

### caller 0x08E600

```text
0x08E600 CD 55 07 09     tag=call target=591701 fallthrough=583172 terminates=true mode=adl modePrefix=null
0x08E604 40 2A 56 11     tag=ld-pair-mem pair=hl addr=4438 direction=from-mem mode=adl modePrefix=sis
0x08E608 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08E60A 40 22 56 11     tag=ld-pair-mem pair=hl addr=4438 direction=to-mem mode=adl modePrefix=sis
0x08E60E FD CB 23 56     tag=indexed-cb-bit bit=2 indexRegister=iy displacement=35 mode=adl modePrefix=null
0x08E612 28 1E           tag=jr-conditional condition=z target=583218 fallthrough=583188 terminates=true mode=adl modePrefix=null
```

### caller 0x08EFD8

```text
0x08EFD8 CD 3E F3 08     tag=call target=586558 fallthrough=585692 terminates=true mode=adl modePrefix=null
0x08EFDC C1              tag=pop pair=bc mode=adl modePrefix=null
0x08EFDD 21 CE 25 D0     tag=ld-pair-imm pair=hl value=13641166 mode=adl modePrefix=null
0x08EFE1 70              tag=ld-ind-reg dest=hl src=b mode=adl modePrefix=null
0x08EFE2 21 6F 26 D0     tag=ld-pair-imm pair=hl value=13641327 mode=adl modePrefix=null
0x08EFE6 71              tag=ld-ind-reg dest=hl src=c mode=adl modePrefix=null
0x08EFE7 C1              tag=pop pair=bc mode=adl modePrefix=null
0x08EFE8 21 D5 08 D0     tag=ld-pair-imm pair=hl value=13633749 mode=adl modePrefix=null
```

### caller 0x08F2F2

```text
0x08F2F2 CD 36 F3 08     tag=call target=586550 fallthrough=586486 terminates=true mode=adl modePrefix=null
0x08F2F6 D5              tag=push pair=de mode=adl modePrefix=null
0x08F2F7 40 2A 1D 2A     tag=ld-pair-mem pair=hl addr=10781 direction=from-mem mode=adl modePrefix=sis
0x08F2FB CD 01 F9 08     tag=call target=588033 fallthrough=586495 terminates=true mode=adl modePrefix=null
```

### caller 0x08F3C5

```text
0x08F3C5 CD C8 FA 08     tag=call target=588488 fallthrough=586697 terminates=true mode=adl modePrefix=null
0x08F3C9 40 2A 2B 2A     tag=ld-pair-mem pair=hl addr=10795 direction=from-mem mode=adl modePrefix=sis
0x08F3CD 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08F3CF CD 53 09 09     tag=call target=592211 fallthrough=586707 terminates=true mode=adl modePrefix=null
```

### caller 0x08F3E5

```text
0x08F3E5 CD 7B 07 09     tag=call target=591739 fallthrough=586729 terminates=true mode=adl modePrefix=null
0x08F3E9 2A 46 11 D0     tag=ld-pair-mem pair=hl addr=13635910 direction=from-mem mode=adl modePrefix=null
0x08F3ED 01 13 00 00     tag=ld-pair-imm pair=bc value=19 mode=adl modePrefix=null
0x08F3F1 09              tag=add-pair dest=hl src=bc mode=adl modePrefix=null
0x08F3F2 19              tag=add-pair dest=hl src=de mode=adl modePrefix=null
0x08F3F3 22 1B 2A D0     tag=ld-pair-mem pair=hl addr=13642267 direction=to-mem mode=adl modePrefix=null
0x08F3F7 C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x08F547

```text
0x08F547 CD 3E F3 08     tag=call target=586558 fallthrough=587083 terminates=true mode=adl modePrefix=null
0x08F54B 40 2A 29 2A     tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis
0x08F54F 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08F551 40 22 29 2A     tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis
0x08F555 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F556 FD 72 32        tag=ld-ixd-reg indexRegister=iy displacement=50 src=d mode=adl modePrefix=null
0x08F559 FD 73 23        tag=ld-ixd-reg indexRegister=iy displacement=35 src=e mode=adl modePrefix=null
0x08F55C D1              tag=pop pair=de mode=adl modePrefix=null
```

### caller 0x08F6B9

```text
0x08F6B9 CD 7B 07 09     tag=call target=591739 fallthrough=587453 terminates=true mode=adl modePrefix=null
0x08F6BD 40 2A 56 11     tag=ld-pair-mem pair=hl addr=4438 direction=from-mem mode=adl modePrefix=sis
0x08F6C1 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08F6C3 40 22 56 11     tag=ld-pair-mem pair=hl addr=4438 direction=to-mem mode=adl modePrefix=sis
0x08F6C7 40 22 2B 2A     tag=ld-pair-mem pair=hl addr=10795 direction=to-mem mode=adl modePrefix=sis
0x08F6CB 18 0B           tag=jr target=587480 terminates=true mode=adl modePrefix=null
```

### caller 0x08F6F0

```text
0x08F6F0 CD 7B 07 09     tag=call target=591739 fallthrough=587508 terminates=true mode=adl modePrefix=null
0x08F6F4 40 2A 54 11     tag=ld-pair-mem pair=hl addr=4436 direction=from-mem mode=adl modePrefix=sis
0x08F6F8 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08F6FA 40 22 54 11     tag=ld-pair-mem pair=hl addr=4436 direction=to-mem mode=adl modePrefix=sis
0x08F6FE 40 22 29 2A     tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis
0x08F702 18 0F           tag=jr target=587539 terminates=true mode=adl modePrefix=null
```

### caller 0x08F7EF

```text
0x08F7EF CD 17 1B 09     tag=call target=596759 fallthrough=587763 terminates=true mode=adl modePrefix=null
0x08F7F3 CD 81 1A 09     tag=call target=596609 fallthrough=587767 terminates=true mode=adl modePrefix=null
0x08F7F7 C1              tag=pop pair=bc mode=adl modePrefix=null
0x08F7F8 22 46 11 D0     tag=ld-pair-mem pair=hl addr=13635910 direction=to-mem mode=adl modePrefix=null
0x08F7FC 40 ED 53 38 11  tag=ld-mem-pair addr=4408 pair=de mode=adl modePrefix=sis
0x08F801 32 3A 11 D0     tag=ld-mem-reg addr=13635898 src=a mode=adl modePrefix=null
0x08F805 C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x0903D6

```text
0x0903D6 CD 3E F3 08     tag=call target=586558 fallthrough=590810 terminates=true mode=adl modePrefix=null
0x0903DA D5              tag=push pair=de mode=adl modePrefix=null
0x0903DB B7              tag=alu-reg op=or src=a mode=adl modePrefix=null
0x0903DC CD 1D 07 09     tag=call target=591645 fallthrough=590816 terminates=true mode=adl modePrefix=null
```

### caller 0x0906C6

```text
0x0906C6 CD C8 FA 08     tag=call target=588488 fallthrough=591562 terminates=true mode=adl modePrefix=null
0x0906CA 40 ED 53 1D 2A  tag=ld-mem-pair addr=10781 pair=de mode=adl modePrefix=sis
0x0906CF CD 31 08 09     tag=call target=591921 fallthrough=591571 terminates=true mode=adl modePrefix=null
0x0906D3 CD 59 08 09     tag=call target=591961 fallthrough=591575 terminates=true mode=adl modePrefix=null
```

### caller 0x090799

```text
0x090799 CD 0D C9 04     tag=call target=313613 fallthrough=591773 terminates=true mode=adl modePrefix=null
0x09079D 7E              tag=ld-reg-ind dest=a src=hl mode=adl modePrefix=null
0x09079E E1              tag=pop pair=hl mode=adl modePrefix=null
0x09079F 22 43 11 D0     tag=ld-pair-mem pair=hl addr=13635907 direction=to-mem mode=adl modePrefix=null
0x0907A3 40 ED 53 34 11  tag=ld-mem-pair addr=4404 pair=de mode=adl modePrefix=sis
0x0907A8 32 36 11 D0     tag=ld-mem-reg addr=13635894 src=a mode=adl modePrefix=null
0x0907AC C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x0908AD

```text
0x0908AD CD 0D C9 04     tag=call target=313613 fallthrough=592049 terminates=true mode=adl modePrefix=null
0x0908B1 23              tag=inc-pair pair=hl mode=adl modePrefix=null
0x0908B2 CD 17 09 09     tag=call target=592151 fallthrough=592054 terminates=true mode=adl modePrefix=null
0x0908B6 0B              tag=dec-pair pair=bc mode=adl modePrefix=null
0x0908B7 0B              tag=dec-pair pair=bc mode=adl modePrefix=null
0x0908B8 0B              tag=dec-pair pair=bc mode=adl modePrefix=null
0x0908B9 0B              tag=dec-pair pair=bc mode=adl modePrefix=null
0x0908BA F6 01           tag=alu-imm op=or value=1 mode=adl modePrefix=null
```

### caller 0x09195E

```text
0x09195E CD 1D 1B 09     tag=call target=596765 fallthrough=596322 terminates=true mode=adl modePrefix=null
0x091962 CD 81 1A 09     tag=call target=596609 fallthrough=596326 terminates=true mode=adl modePrefix=null
0x091966 22 04 11 D0     tag=ld-pair-mem pair=hl addr=13635844 direction=to-mem mode=adl modePrefix=null
0x09196A 40 ED 53 F6 10  tag=ld-mem-pair addr=4342 pair=de mode=adl modePrefix=sis
0x09196F 32 F8 10 D0     tag=ld-mem-reg addr=13635832 src=a mode=adl modePrefix=null
0x091973 C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x091AD0

```text
0x091AD0 CD 0D C9 04     tag=call target=313613 fallthrough=596692 terminates=true mode=adl modePrefix=null
0x091AD4 19              tag=add-pair dest=hl src=de mode=adl modePrefix=null
0x091AD5 D1              tag=pop pair=de mode=adl modePrefix=null
0x091AD6 C9              tag=ret terminates=true mode=adl modePrefix=null
```

### caller 0x091B22

```text
0x091B22 CD 0D C9 04     tag=call target=313613 fallthrough=596774 terminates=true mode=adl modePrefix=null
0x091B26 01 0D 00 00     tag=ld-pair-imm pair=bc value=13 mode=adl modePrefix=null
0x091B2A 09              tag=add-pair dest=hl src=bc mode=adl modePrefix=null
0x091B2B 1B              tag=dec-pair pair=de mode=adl modePrefix=null
0x091B2C 19              tag=add-pair dest=hl src=de mode=adl modePrefix=null
0x091B2D 19              tag=add-pair dest=hl src=de mode=adl modePrefix=null
0x091B2E C3 0D C9 04     tag=jp target=313613 terminates=true mode=adl modePrefix=null
```

## Interpretation

The save-tail path is not one EOL-only function. EOL enters shared editor/display positioning code, and the durable tuple save is the narrow static `0x08F547 -> 0x08F33E` call site that falls through to `0x08F54B`. The dynamic return-stack histogram shows which upstream contexts are active when the bridge helpers execute; the static direct-call scan identifies the hard CALL edges. Together they show the EOL-specific condition is upstream of the shared bridge machinery, while the final coherent save remains at `0x08F547/0x08F54B`.

No runtime, transpiler, or browser files were changed.
