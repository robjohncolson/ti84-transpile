# Phase 631: Shared EOL Save Tail Decode

Probe: `probe-phase631-eol-save-tail-decode.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase631-eol-save-tail-decode.mjs`  
Exit: 0

## Summary

- **** The shared EOL save tail is a cursor/display boundary check and save path, not a cleanup path. It checks an editor/display condition through `0x04C973` and `0x04C90D`, then reaches `0x08F54B` only when the condition allows saving the coherent tuple.
- *** `0x08F547` is the narrow save call site: it calls `0x08F33E`, then stores `HL` into `D02A29` and returns. In the natural EOL run this happens twice before the later `0x0018F8` cleanup wipes the tuple.
- *** `0x090755` copies the display-position tuple through `D02A29/D02A2B`; `0x090378` feeds the 16-bit compare helper `0x04C90D`; `0x08F33E` is the mode/key-state prelude that bridges into that display tuple machinery.
- ** Dynamic confirmation: the natural EOL run halted cleanly at `0x0019B5`, hit `0x08F54B` twice, hit `0x0018F8` twice later, and ended with the tuple cleared.

## Dynamic Confirmation

- termination=halt steps=316825 lastPc=0x0019B5
- counts=0x08F479:2 0x08F47D:2 0x04C973:1204 0x08F48A:2 0x08F547:2 0x08F54B:2 0x08F33E:13 0x090755:25 0x090378:47 0x04C90D:103 0x0018F8:2 0x0019B5:1
- final tuple: `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D01150=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00`

| Event | Block | PC | A | F | HL | DE | BC | SP | Tuple |
|---:|---:|---|---|---|---|---|---|---|---|
| 1 | 3082 | 0x04C90D | 0x1F | 0x08 | 0xD1A8A3 | 0xD1A92B | 0x000000 | 0xD1A842 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A7F7 D02A28=0x00` |
| 2 | 3088 | 0x04C90D | 0x1F | 0x08 | 0xD1A8B7 | 0x000000 | 0x000014 | 0xD1A845 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A7F7 D02A28=0x00` |
| 3 | 5288 | 0x04C90D | 0x2A | 0x42 | 0xD1A903 | 0xD2EF2A | 0xFFFFF5 | 0xD1A848 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 4 | 5462 | 0x04C90D | 0x21 | 0x20 | 0xD1A8CD | 0x000000 | 0x000014 | 0xD1A824 | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 5 | 5511 | 0x090378 | 0x00 | 0x10 | 0xD2A814 | 0x000013 | 0x00000F | 0xD1A81B | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 6 | 5512 | 0x04C90D | 0x00 | 0x00 | 0xD2A823 | 0x000013 | 0x00000F | 0xD1A81B | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x01` |
| 7 | 5922 | 0x04C90D | 0x00 | 0x40 | 0xD1A8A3 | 0x00000E | 0xD10008 | 0xD1A83F | `D02A29=0x013A D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD2A829 D02A28=0x00` |

## Static Decode

### entry / first branch 0x08F479-0x08F4A1

```text
0x08F479 CA 36 F5 08     tag=jp-conditional condition=z target=587062 fallthrough=586877 terminates=true mode=adl modePrefix=null
0x08F47D ED 5B 40 2A D0  tag=ld-pair-mem pair=de addr=13642304 mode=adl modePrefix=null
0x08F482 2A 3D 24 D0     tag=ld-pair-mem pair=hl addr=13640765 direction=from-mem mode=adl modePrefix=null
0x08F486 CD 73 C9 04     tag=call target=313715 fallthrough=586890 terminates=true mode=adl modePrefix=null
0x08F48A C2 47 F5 08     tag=jp-conditional condition=nz target=587079 fallthrough=586894 terminates=true mode=adl modePrefix=null
0x08F48E D1              tag=pop pair=de mode=adl modePrefix=null
0x08F48F D1              tag=pop pair=de mode=adl modePrefix=null
0x08F490 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F491 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F492 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F493 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F494 23              tag=inc-pair pair=hl mode=adl modePrefix=null
0x08F495 7E              tag=ld-reg-ind dest=a src=hl mode=adl modePrefix=null
0x08F496 CD A0 0B 09     tag=call target=592800 fallthrough=586906 terminates=true mode=adl modePrefix=null
0x08F49A CA 0B F6 08     tag=jp-conditional condition=z target=587275 fallthrough=586910 terminates=true mode=adl modePrefix=null
0x08F49E FE 2B           tag=alu-imm op=cp value=43 mode=adl modePrefix=null
0x08F4A0 20 13           tag=jr-conditional condition=nz target=586933 fallthrough=586914 terminates=true mode=adl modePrefix=null
```

### save call site 0x08F547-0x08F55E

```text
0x08F547 CD 3E F3 08     tag=call target=586558 fallthrough=587083 terminates=true mode=adl modePrefix=null
0x08F54B 40 2A 29 2A     tag=ld-pair-mem pair=hl addr=10793 direction=from-mem mode=adl modePrefix=sis
0x08F54F 52 19           tag=add-pair dest=hl src=de mode=adl modePrefix=sil
0x08F551 40 22 29 2A     tag=ld-pair-mem pair=hl addr=10793 direction=to-mem mode=adl modePrefix=sis
0x08F555 D1              tag=pop pair=de mode=adl modePrefix=null
0x08F556 FD 72 32        tag=ld-ixd-reg indexRegister=iy displacement=50 src=d mode=adl modePrefix=null
0x08F559 FD 73 23        tag=ld-ixd-reg indexRegister=iy displacement=35 src=e mode=adl modePrefix=null
0x08F55C D1              tag=pop pair=de mode=adl modePrefix=null
0x08F55D 40 ED 53 56 11  tag=ld-mem-pair addr=4438 pair=de mode=adl modePrefix=sis
```

### mode-specific prelude 0x08F33E-0x08F364

```text
0x08F33E 01 09 00 00     tag=ld-pair-imm pair=bc value=9 mode=adl modePrefix=null
0x08F342 C3 55 07 09     tag=jp target=591701 terminates=true mode=adl modePrefix=null
0x08F346 C5              tag=push pair=bc mode=adl modePrefix=null
0x08F347 32 3B 2A D0     tag=ld-mem-reg addr=13642299 src=a mode=adl modePrefix=null
0x08F34B 57              tag=ld-reg-reg dest=d src=a mode=adl modePrefix=null
0x08F34C D5              tag=push pair=de mode=adl modePrefix=null
0x08F34D ED 5B 43 11 D0  tag=ld-pair-mem pair=de addr=13635907 mode=adl modePrefix=null
0x08F352 D5              tag=push pair=de mode=adl modePrefix=null
0x08F353 CD 4E F2 08     tag=call target=586318 fallthrough=586583 terminates=true mode=adl modePrefix=null
0x08F357 CD 2E 09 09     tag=call target=592174 fallthrough=586587 terminates=true mode=adl modePrefix=null
0x08F35B CD 2E 09 09     tag=call target=592174 fallthrough=586591 terminates=true mode=adl modePrefix=null
0x08F35F CD 6B 08 09     tag=call target=591979 fallthrough=586595 terminates=true mode=adl modePrefix=null
0x08F363 28 49           tag=jr-conditional condition=z target=586670 fallthrough=586597 terminates=true mode=adl modePrefix=null
```

### token cursor bridge 0x090755-0x090778

```text
0x090755 2A 43 11 D0     tag=ld-pair-mem pair=hl addr=13635907 direction=from-mem mode=adl modePrefix=null
0x090759 C3 78 03 09     tag=jp target=590712 terminates=true mode=adl modePrefix=null
0x09075D 2A 43 11 D0     tag=ld-pair-mem pair=hl addr=13635907 direction=from-mem mode=adl modePrefix=null
0x090761 18 22           tag=jr target=591749 terminates=true mode=adl modePrefix=null
0x090763 01 12 00 00     tag=ld-pair-imm pair=bc value=18 mode=adl modePrefix=null
0x090767 2A 43 11 D0     tag=ld-pair-mem pair=hl addr=13635907 direction=from-mem mode=adl modePrefix=null
0x09076B 09              tag=add-pair dest=hl src=bc mode=adl modePrefix=null
0x09076C 7E              tag=ld-reg-ind dest=a src=hl mode=adl modePrefix=null
0x09076D C9              tag=ret terminates=true mode=adl modePrefix=null
0x09076E 01 13 00 00     tag=ld-pair-imm pair=bc value=19 mode=adl modePrefix=null
0x090772 CD 67 07 09     tag=call target=591719 fallthrough=591734 terminates=true mode=adl modePrefix=null
0x090776 32 27 2A D0     tag=ld-mem-reg addr=13642279 src=a mode=adl modePrefix=null
```

### display tuple bridge 0x090378-0x090391

```text
0x090378 09              tag=add-pair dest=hl src=bc mode=adl modePrefix=null
0x090379 C3 0D C9 04     tag=jp target=313613 terminates=true mode=adl modePrefix=null
0x09037D 01 07 00 00     tag=ld-pair-imm pair=bc value=7 mode=adl modePrefix=null
0x090381 2A EC 10 D0     tag=ld-pair-mem pair=hl addr=13635820 direction=from-mem mode=adl modePrefix=null
0x090385 18 F1           tag=jr target=590712 terminates=true mode=adl modePrefix=null
0x090387 7B              tag=ld-reg-reg dest=a src=e mode=adl modePrefix=null
0x090388 FE 01           tag=alu-imm op=cp value=1 mode=adl modePrefix=null
0x09038A 20 08           tag=jr-conditional condition=nz target=590740 fallthrough=590732 terminates=true mode=adl modePrefix=null
0x09038C 21 00 00 00     tag=ld-pair-imm pair=hl value=0 mode=adl modePrefix=null
0x090390 C3 87 01 09     tag=jp target=590215 terminates=true mode=adl modePrefix=null
```

### 16-bit compare helper 0x04C90D-0x04C91A

```text
0x04C90D 11 00 00 00     tag=ld-pair-imm pair=de value=0 mode=adl modePrefix=null
0x04C911 5E              tag=ld-reg-ind dest=e src=hl mode=adl modePrefix=null
0x04C912 23              tag=inc-pair pair=hl mode=adl modePrefix=null
0x04C913 56              tag=ld-reg-ind dest=d src=hl mode=adl modePrefix=null
0x04C914 23              tag=inc-pair pair=hl mode=adl modePrefix=null
0x04C915 C9              tag=ret terminates=true mode=adl modePrefix=null
0x04C916 7E              tag=ld-reg-ind dest=a src=hl mode=adl modePrefix=null
0x04C917 23              tag=inc-pair pair=hl mode=adl modePrefix=null
0x04C918 66              tag=ld-reg-ind dest=h src=hl mode=adl modePrefix=null
0x04C919 6F              tag=ld-reg-reg dest=l src=a mode=adl modePrefix=null
0x04C91A 18 24           tag=jr target=313664 terminates=true mode=adl modePrefix=null
```

## Direct Call Scan

| Target | Direct CALL sites |
|---|---|
| 0x08F479 | (none) |
| 0x08F547 | (none) |
| 0x08F33E | 0x08E4A4, 0x08E588, 0x08E9FA, 0x08EDB2, 0x08EE82, 0x08EFD8, 0x08F547, 0x08FBAA, 0x0903D6 |
| 0x090755 | 0x08E4B1, 0x08E5CB, 0x08E5EE, 0x08E600, 0x08E625, 0x08E946, 0x08E9E8, 0x08EA46, 0x08EDDE, 0x08EEB4, 0x08EEEB, 0x08F313, 0x08F4A7, 0x08F4C8, 0x08F4D5, 0x08F4EB, 0x08F510, 0x09058A, 0x0905E8, 0x0906EA, 0x090C97, 0x090DF9, 0x091A11, 0x0A8E8D |
| 0x090378 | 0x09067B, 0x090AA5, 0x090EB4 |
| 0x04C90D | 0x03EE9A, 0x03EEE7, 0x056774, 0x0567C8, 0x0569D4, 0x056A06, 0x056A0B, 0x087E4E, 0x087E63, 0x087E96, 0x08CDE6, 0x08D153, 0x08D1E4, 0x08D2FE, 0x08D520, 0x08D816, 0x08D821, 0x08D864, 0x08D871, 0x08DEF8, 0x08E504, 0x090680, 0x090799, 0x0908AD, 0x090AC5, 0x090E4B, 0x090FF9, 0x091028, 0x091293, 0x091AD0, 0x091B22, 0x091B48, 0x091B6B, 0x091C34, 0x091CC5, 0x091CDD, 0x091D13, 0x092109, 0x09217C, 0x09264A, 0x092E7E, 0x092FE3, 0x099855, 0x09985D, 0x09C613, 0x09C62B, 0x0A2DC6, 0x0A2DCB, 0x0A6FAB, 0x0A8DFF, 0x0A8E67, 0x0A8F04, 0x0AC5CB, 0x0AF325, 0x0AF3B9, 0x0AF506, 0x0AF65D, 0x0B11B9, 0x0B1457 |
| 0x08F54B | (none) |

## Interpretation

`0x08F479` starts by testing the editor/display condition via `0x04C973`; the zero path returns early while the nonzero path calls through `0x08F48A`. The natural EOL path then reaches `0x08F547`, whose only durable write in this window is the `D02A29 <- HL` save after `0x08F33E` returns. `0x090755` and `0x090378` explain why the tuple is coherent at `0x08F54B`: they bridge the current cursor/display position into the same compare-and-save machinery before cleanup later clears RAM.

No runtime, transpiler, or browser files were changed.
