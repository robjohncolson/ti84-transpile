# Phase 870: Forced-Owner Post-Chain Fallback Trace

Probe: `probe-phase870-forced-owner-fallback.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase870-forced-owner-fallback.mjs`

## Summary

- Result: PASS.
- Forced live route still reaches owner/copy: owner=3, copy=3, post-copy=3. It also later reaches anchor=1, wipe=1, poll=4924.
- Immediate post-owner edge: 0x0A31A2 -> 0x0A323A; this is the first row after `0x0A31E2 -> 0x0A31A2` and shows the owner path returns into `0x0A323A`, not into an oracle-compatible completion path.
- First fallback into the anchor family: 0x0A2A37 -> 0x0A229D; anchor edge 0x0A2A37 -> 0x0A229D; wipe edge 0x001879 -> 0x0018F8.
- Controlling state: post-owner copy returns through 0x0A323A rather than repairing the live route; the first fallback into the anchor family is 0x0A2A37 -> 0x0A229D; 0x0A229D is then reached from 0x0A2A37 with BC=0x000131, HL=0x0000EA, DE=0x00013F, D02505=0x0A, stack0=0x0A2356; forced route did not hit 0x058A16 before the anchor (count=0); forced route did not hit 0x0A223A before the anchor (count=0).
- Interpretation: the forced owner chain is real but only a side excursion. In this forced route, it does not re-enter through `0x058A16` / `0x0A223A`; it falls back directly through `0x0A2A37 -> 0x0A229D`, then reaches the space-fill tail and `0x0018F8` wipe. `D02437` controls owner reachability, but it does not control the later anchor/wipe fallback.

## Route Counts

| Route | 0x0A229D | 0x0A1854 | 0x0A31FD | 0x0A31E2 | 0x0018F8 | 0x006D64 | Termination | Mutations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| harness baseline | 0 | 80 | 1 | 1 | 0 | 0 | captured-0a31e2-to-0a31a2 | 0 |
| live baseline | 1 | 112 | 0 | 0 | 1 | 9167 | max_steps | 0 |
| live forced D02437=0xD1A8A3 | 1 | 1008 | 3 | 3 | 1 | 4924 | max_steps | 1 |
| harness forced D02437=0xD1A8CC | 1 | 112 | 0 | 0 | 1 | 1667 | max_steps | 1 |

## Mutation Points

| Route | PC | Forced D02437 | Before D02437 | After D02437 | After D0243A | After D0243D | After D02440 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| live forced D02437=0xD1A8A3 | 0x05E3E8 | 0xD1A8A3 | 0xD1A8CC | 0xD1A8A3 | 0xD1A8CC | 0xD2A83E | 0xD2A83E |

## Forced Live Compare Trace at D02437 Gate

| # | Role | Harness HL | Harness DE | Harness F | Harness Z | Live HL | Live DE | Live F | Live Z |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |
| 1 | D02440-D0243D | 0xD2A83E | 0xD2A83E | 0x4A | 1 | 0xD2A83E | 0xD2A83E | 0x4A | 1 |
| 2 | D0243A-D02437 | 0xD1A8CC | 0xD1A8A3 | 0x0A | 0 | 0xD1A8CC | 0xD1A8A3 | 0x0A | 0 |

## Post-Owner / Fallback Edges

| Edge | From PC | To PC | From BC | From HL | From D02437 | From D0243A | To BC | To HL | To D02505 | To Stack0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| post-owner | 0x0A31A2 | 0x0A323A | 0x000000 | 0xD0330D | 0xD1A8A3 | 0xD1A8CB | 0x000000 | 0xD0330D | 0x0A | 0x000044 |
| fallback-entry | 0x0A2A37 | 0x0A229D | - | - | - | - | 0x000131 | 0x0000EA | 0x0A | 0x0A2356 |
| clear-tail-entry | - | - | - | - | - | - | - | - | - | - |
| anchor-entry | 0x0A2A37 | 0x0A229D | - | - | - | - | 0x000131 | 0x0000EA | 0x0A | 0x0A2356 |
| wipe-entry | 0x001879 | 0x0018F8 | - | - | - | - | 0x0000FF | 0xD3FEFF | 0x00 | 0x0013E8 |

## Post-Owner Window

| # | PC | Prev | BC | DE | HL | SP | Stack0 | D02437 | D0243A | D0243D | D02505 | D02590 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0x0A31A6 | 0x0A3158 | 0x00B414 | 0xD0EC95 | 0x003200 | 0xD1A80F | 0x003200 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 1 | 0x0A31F6 | 0x0A31A6 | 0x00B414 | 0xD0EC95 | 0x0032ED | 0xD1A80C | 0x0A31AC | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 2 | 0x0A31AC | 0x0A31F6 | 0x00B414 | 0xD0EC95 | 0x025080 | 0xD1A80F | 0x003200 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 3 | 0x0A31F6 | 0x0A31AC | 0x00B414 | 0xD6507F | 0xD400B4 | 0xD1A80C | 0x0A31B8 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 4 | 0x0A31B8 | 0x0A31F6 | 0x00B414 | 0xD6507F | 0x01C200 | 0xD1A80F | 0x003200 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 5 | 0x0A31E2 | 0x0A31B8 | 0x00B414 | 0xD031F6 | 0x002057 | 0xD1A815 | 0x000320 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 6 | 0x0A31A2 | 0x0A31E2 | 0x000000 | 0xD0362D | 0xD0330D | 0xD1A818 | 0x000040 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 7 | 0x0A323A | 0x0A31A2 | 0x000000 | 0xD0362D | 0xD0330D | 0xD1A81E | 0x000044 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 8 | 0x0A2D4C | 0x0A323A | 0x000000 | 0xD0362D | 0xD0330D | 0xD1A81B | 0x0A3241 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 9 | 0x0A3241 | 0x0A2D4C | 0x000000 | 0xD0362D | 0xD0330D | 0xD1A81E | 0x000044 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 10 | 0x0A3257 | 0x0A3241 | 0x000000 | 0xD031F6 | 0x000118 | 0xD1A81B | 0x002520 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 11 | 0x09EF20 | 0x0A3257 | 0x002536 | 0x00013F | 0x000000 | 0xD1A81B | 0x0A3274 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 12 | 0x09EF44 | 0x09EF20 | 0x002536 | 0x00013F | 0x000000 | 0xD1A818 | 0x09EF2E | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 13 | 0x09EF4A | 0x09EF44 | 0x002536 | 0x00013F | 0x000000 | 0xD1A818 | 0x09EF2E | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 14 | 0x09EF5E | 0x09EF4A | 0x002536 | 0x000000 | 0x00013F | 0xD1A809 | 0x002536 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 15 | 0x08C308 | 0x09EF5E | 0x002536 | 0x000000 | 0x002E40 | 0xD1A7FD | 0x09EF70 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 16 | 0x09EF70 | 0x08C308 | 0x002536 | 0x000000 | 0x002E40 | 0xD1A800 | 0x000000 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 17 | 0x09EFB7 | 0x09EF70 | 0x002536 | 0x000000 | 0x002E40 | 0xD1A800 | 0x000000 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 18 | 0x09EFDE | 0x09EFB7 | 0x00A0A0 | 0x00FFFF | 0xD45C80 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 19 | 0x09EFDE | 0x09EFDE | 0x009FA0 | 0x00FFFF | 0xD45C84 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 20 | 0x09EFDE | 0x09EFDE | 0x009EA0 | 0x00FFFF | 0xD45C88 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 21 | 0x09EFDE | 0x09EFDE | 0x009DA0 | 0x00FFFF | 0xD45C8C | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 22 | 0x09EFDE | 0x09EFDE | 0x009CA0 | 0x00FFFF | 0xD45C90 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 23 | 0x09EFDE | 0x09EFDE | 0x009BA0 | 0x00FFFF | 0xD45C94 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 24 | 0x09EFDE | 0x09EFDE | 0x009AA0 | 0x00FFFF | 0xD45C98 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 25 | 0x09EFDE | 0x09EFDE | 0x0099A0 | 0x00FFFF | 0xD45C9C | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |
| 26 | 0x09EFDE | 0x09EFDE | 0x0098A0 | 0x00FFFF | 0xD45CA0 | 0xD1A803 | 0x000140 | 0xD1A8A3 | 0xD1A8CB | 0xD2A83D | 0x0A | 0xD3FE81 |

## Anchor Window

| # | PC | Prev | BC | DE | HL | SP | Stack0 | D02437 | D0243A | D0243D | D02505 | D02590 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Static Decode: Post-Owner Return Window

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0A31A2 | `F1` | POP AF |
| 0x0A31A3 | `E0` | RET PO |
| 0x0A31A4 | `FB` | ei {"mode":"adl","modePrefix":null} |
| 0x0A31A5 | `C9` | RET |
| 0x0A31A6 | `6A` | ld-reg-reg {"dest":"l","src":"d","mode":"adl","modePrefix":null} |
| 0x0A31A7 | `2C` | inc-reg {"reg":"l","mode":"adl","modePrefix":null} |
| 0x0A31A8 | `CD F6 31 0A` | CALL 0x0A31F6 |
| 0x0A31AC | `2B` | dec-pair {"pair":"hl","mode":"adl","modePrefix":null} |
| 0x0A31AD | `11 00 00 D4` | LD DE, 0xD40000 |
| 0x0A31B1 | `19` | ADD HL, DE |
| 0x0A31B2 | `EB` | EX DE,HL |
| 0x0A31B3 | `68` | ld-reg-reg {"dest":"l","src":"b","mode":"adl","modePrefix":null} |
| 0x0A31B4 | `CD F6 31 0A` | CALL 0x0A31F6 |
| 0x0A31B8 | `E5` | PUSH HL |
| 0x0A31B9 | `C1` | POP BC |
| 0x0A31BA | `E1` | POP HL |
| 0x0A31BB | `EB` | EX DE,HL |
| 0x0A31BC | `E5` | PUSH HL |
| 0x0A31BD | `B7` | OR A |
| 0x0A31BE | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x0A31C0 | `D1` | POP DE |
| 0x0A31C1 | `ED B8` | LDDR |
| 0x0A31C3 | `C1` | POP BC |
| 0x0A31C4 | `F1` | POP AF |
| 0x0A31C5 | `69` | ld-reg-reg {"dest":"l","src":"c","mode":"adl","modePrefix":null} |
| 0x0A31C6 | `26 28` | LD H, 0x28 |
| 0x0A31C8 | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A31CA | `E5` | PUSH HL |
| 0x0A31CB | `D6 1E` | SUB 0x1E |
| 0x0A31CD | `6F` | ld-reg-reg {"dest":"l","src":"a","mode":"adl","modePrefix":null} |
| 0x0A31CE | `2C` | inc-reg {"reg":"l","mode":"adl","modePrefix":null} |
| 0x0A31CF | `26 28` | LD H, 0x28 |
| 0x0A31D1 | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A31D3 | `2B` | dec-pair {"pair":"hl","mode":"adl","modePrefix":null} |
| 0x0A31D4 | `11 F6 31 D0` | LD DE, 0xD031F6 |
| 0x0A31D8 | `FD CB 4A 5E` | indexed-cb-bit {"bit":3,"indexRegister":"iy","displacement":74,"mode":"adl","modePrefix":null} |
| 0x0A31DC | `28 04` | JR Z, 0x0A31E2 |
| 0x0A31DE | `11 C6 52 D0` | LD DE, 0xD052C6 |
| 0x0A31E2 | `19` | ADD HL, DE |
| 0x0A31E3 | `EB` | EX DE,HL |
| 0x0A31E4 | `68` | ld-reg-reg {"dest":"l","src":"b","mode":"adl","modePrefix":null} |
| 0x0A31E5 | `26 28` | LD H, 0x28 |
| 0x0A31E7 | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A31E9 | `E5` | PUSH HL |
| 0x0A31EA | `C1` | POP BC |
| 0x0A31EB | `E1` | POP HL |
| 0x0A31EC | `EB` | EX DE,HL |
| 0x0A31ED | `E5` | PUSH HL |
| 0x0A31EE | `B7` | OR A |
| 0x0A31EF | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x0A31F1 | `D1` | POP DE |
| 0x0A31F2 | `ED B8` | LDDR |
| 0x0A31F4 | `18 AC` | JR 0x0A31A2 |
| 0x0A31F6 | `26 A0` | LD H, 0xA0 |
| 0x0A31F8 | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A31FA | `29` | ADD HL, HL |
| 0x0A31FB | `29` | ADD HL, HL |
| 0x0A31FC | `C9` | RET |
| 0x0A31FD | `DD 7E 01` | ld-reg-ixd {"dest":"a","indexRegister":"ix","displacement":1,"mode":"adl","modePrefix":null} |
| 0x0A3200 | `DD 96 00` | alu-ixd {"op":"sub","indexRegister":"ix","displacement":0,"mode":"adl","modePrefix":null} |
| 0x0A3203 | `3D` | dec-reg {"reg":"a","mode":"adl","modePrefix":null} |
| 0x0A3204 | `C8` | RET Z |
| 0x0A3205 | `FD CB 4C FE` | indexed-cb-set {"bit":7,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null} |
| 0x0A3209 | `6F` | ld-reg-reg {"dest":"l","src":"a","mode":"adl","modePrefix":null} |
| 0x0A320A | `26 14` | LD H, 0x14 |
| 0x0A320C | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A320E | `45` | ld-reg-reg {"dest":"b","src":"l","mode":"adl","modePrefix":null} |
| 0x0A320F | `DD 7E 01` | ld-reg-ixd {"dest":"a","indexRegister":"ix","displacement":1,"mode":"adl","modePrefix":null} |
| 0x0A3212 | `CD 4C 2D 0A` | CALL 0x0A2D4C |
| 0x0A3216 | `3D` | dec-reg {"reg":"a","mode":"adl","modePrefix":null} |
| 0x0A3217 | `0E 14` | LD C, 0x14 |
| 0x0A3219 | `C3 46 31 0A` | JP 0x0A3146 |
| 0x0A321D | `F5` | PUSH AF |
| 0x0A321E | `C5` | PUSH BC |
| 0x0A321F | `D5` | PUSH DE |
| 0x0A3220 | `E5` | PUSH HL |
| 0x0A3221 | `DD E5` | PUSH IX |
| 0x0A3223 | `ED 57` | ld-special {"dest":"a","src":"i","mode":"adl","modePrefix":null} |
| 0x0A3225 | `EA 2B 32 0A` | JP PE, 0x0A322B |
| 0x0A3229 | `ED 57` | ld-special {"dest":"a","src":"i","mode":"adl","modePrefix":null} |
| 0x0A322B | `F3` | di {"mode":"adl","modePrefix":null} |
| 0x0A322C | `F5` | PUSH AF |
| 0x0A322D | `DD 21 04 25 D0` | LD IX, 0xD02504 |
| 0x0A3232 | `FD CB 05 D6` | indexed-cb-set {"bit":2,"indexRegister":"iy","displacement":5,"mode":"adl","modePrefix":null} |
| 0x0A3236 | `CD FD 31 0A` | CALL 0x0A31FD |
| 0x0A323A | `DD 7E 00` | ld-reg-ixd {"dest":"a","indexRegister":"ix","displacement":0,"mode":"adl","modePrefix":null} |
| 0x0A323D | `CD 4C 2D 0A` | CALL 0x0A2D4C |
| 0x0A3241 | `F5` | PUSH AF |
| 0x0A3242 | `D6 1E` | SUB 0x1E |
| 0x0A3244 | `6F` | ld-reg-reg {"dest":"l","src":"a","mode":"adl","modePrefix":null} |
| 0x0A3245 | `26 28` | LD H, 0x28 |
| 0x0A3247 | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A3249 | `11 F6 31 D0` | LD DE, 0xD031F6 |
| 0x0A324D | `FD CB 4A 5E` | indexed-cb-bit {"bit":3,"indexRegister":"iy","displacement":74,"mode":"adl","modePrefix":null} |

## Static Decode: CLEAR/EOL Tail

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x058A10 | `CD 12 82 05` | CALL 0x058212 |
| 0x058A14 | `20 16` | JR NZ, 0x058A2C |
| 0x058A16 | `CD 3A 22 0A` | CALL 0x0A223A |
| 0x058A1A | `FD CB 49 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":73,"mode":"adl","modePrefix":null} |
| 0x058A1E | `CD 54 8D 05` | CALL 0x058D54 |
| 0x058A22 | `CD B8 00 08` | CALL 0x0800B8 |
| 0x0A223A | `CD 5E 23 0A` | CALL 0x0A235E |
| 0x0A223E | `3A 04 25 D0` | LD A, (0xD02504) |
| 0x0A2242 | `F5` | PUSH AF |
| 0x0A2243 | `CD A0 00 08` | CALL 0x0800A0 |
| 0x0A2247 | `28 08` | JR Z, 0x0A2251 |
| 0x0A2249 | `FE 06` | CP 0x06 |
| 0x0A224B | `20 09` | JR NZ, 0x0A2256 |
| 0x0A224D | `3E 9B` | LD A, 0x9B |
| 0x0A224F | `18 09` | JR 0x0A225A |
| 0x0A2251 | `B7` | OR A |
| 0x0A2252 | `20 02` | JR NZ, 0x0A2256 |
| 0x0A2254 | `3E 1E` | LD A, 0x1E |
| 0x0A2256 | `C4 4C 2D 0A` | call-conditional {"condition":"nz","target":666956,"fallthrough":664154,"terminates":true,"mode":"adl","modePrefix":null} |
| 0x0A225A | `47` | ld-reg-reg {"dest":"b","src":"a","mode":"adl","modePrefix":null} |
| 0x0A225B | `3A 05 25 D0` | LD A, (0xD02505) |
| 0x0A225F | `FE 0A` | CP 0x0A |
| 0x0A2261 | `20 04` | JR NZ, 0x0A2267 |
| 0x0A2263 | `3E EF` | LD A, 0xEF |
| 0x0A2265 | `18 06` | JR 0x0A226D |
| 0x0A2267 | `CD 4C 2D 0A` | CALL 0x0A2D4C |
| 0x0A226B | `D6 02` | SUB 0x02 |
| 0x0A226D | `21 00 00 00` | LD HL, 0x000000 |
| 0x0A2271 | `4F` | ld-reg-reg {"dest":"c","src":"a","mode":"adl","modePrefix":null} |
| 0x0A2272 | `11 3F 01 00` | LD DE, 0x00013F |
| 0x0A2276 | `CD 20 EF 09` | CALL 0x09EF20 |
| 0x0A227A | `F1` | POP AF |
| 0x0A227B | `FD CB 0D 4E` | indexed-cb-bit {"bit":1,"indexRegister":"iy","displacement":13,"mode":"adl","modePrefix":null} |
| 0x0A227F | `C8` | RET Z |
| 0x0A2280 | `F5` | PUSH AF |
| 0x0A2281 | `FD CB 4C C6` | indexed-cb-set {"bit":0,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null} |
| 0x0A2285 | `3E 02` | LD A, 0x02 |
| 0x0A2287 | `FD CB 4C 6E` | indexed-cb-bit {"bit":5,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null} |
| 0x0A228B | `CC 89 67 02` | call-conditional {"condition":"z","target":157577,"fallthrough":664207,"terminates":true,"mode":"adl","modePrefix":null} |
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
| 0x0A2A37 | `6F` | ld-reg-reg {"dest":"l","src":"a","mode":"adl","modePrefix":null} |
| 0x0A2A38 | `26 1A` | LD H, 0x1A |
| 0x0A2A3A | `ED 6C` | mlt {"reg":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A3C | `B7` | OR A |
| 0x0A2A3D | `C9` | RET |
| 0x0A2A3E | `CD 68 2A 0A` | CALL 0x0A2A68 |
| 0x0A2A42 | `2B` | dec-pair {"pair":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A43 | `7E` | ld-reg-ind {"dest":"a","src":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A44 | `C9` | RET |
| 0x0A2A45 | `CD 68 2A 0A` | CALL 0x0A2A68 |
| 0x0A2A49 | `7E` | ld-reg-ind {"dest":"a","src":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A4A | `C9` | RET |
| 0x0A2A4B | `E5` | PUSH HL |
| 0x0A2A4C | `CD 8B E3 05` | CALL 0x05E38B |
| 0x0A2A50 | `CD 68 2A 0A` | CALL 0x0A2A68 |
| 0x0A2A54 | `7E` | ld-reg-ind {"dest":"a","src":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A55 | `01 00 00 00` | LD BC, 0x000000 |
| 0x0A2A59 | `4F` | ld-reg-reg {"dest":"c","src":"a","mode":"adl","modePrefix":null} |
| 0x0A2A5A | `23` | inc-pair {"pair":"hl","mode":"adl","modePrefix":null} |
| 0x0A2A5B | `C5` | PUSH BC |
| 0x0A2A5C | `11 0E 06 D0` | LD DE, 0xD0060E |
| 0x0A2A60 | `ED B0` | LDIR |

## Machine JSON

```json
{
  "pass": true,
  "baseline": {
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
        },
        {
          "kind": "field",
          "name": "D02317",
          "harness": "0x000000",
          "live": "0xD2A83E"
        },
        {
          "kind": "field",
          "name": "D0231A",
          "harness": "0x000000",
          "live": "0xD2A83E"
        },
        {
          "kind": "field",
          "name": "D0231D",
          "harness": "0x000000",
          "live": "0xD2A83D"
        },
        {
          "kind": "field",
          "name": "D02437",
          "harness": "0xD1A8A3",
          "live": "0xD1A8CC"
        }
      ]
    },
    "flagOwner": {
      "harness": {
        "found": true,
        "callIndex": 4513,
        "returnIndex": 4525,
        "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
        "rows": [
          {
            "index": 4513,
            "block": 4925,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058A10",
            "prevPc": "0x058A0C",
            "cpu": {
              "pc": "0x058A10",
              "currentBlockPc": "0x058A10",
              "sp": "0xD1A854",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          },
          {
            "index": 4514,
            "block": 4926,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058212",
            "prevPc": "0x058A10",
            "cpu": {
              "pc": "0x058212",
              "currentBlockPc": "0x058212",
              "sp": "0xD1A851",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4515,
            "block": 4927,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x0800B8",
            "prevPc": "0x058212",
            "cpu": {
              "pc": "0x0800B8",
              "currentBlockPc": "0x0800B8",
              "sp": "0xD1A84E",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058216"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4516,
            "block": 4928,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058216",
            "prevPc": "0x0800B8",
            "cpu": {
              "pc": "0x058216",
              "currentBlockPc": "0x058216",
              "sp": "0xD1A851",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4518,
            "block": 4930,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E3",
            "prevPc": "0x05821D",
            "cpu": {
              "pc": "0x05E3E3",
              "currentBlockPc": "0x05E3E3",
              "sp": "0xD1A84E",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4519,
            "block": 4931,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3F5",
            "prevPc": "0x05E3E3",
            "cpu": {
              "pc": "0x05E3F5",
              "currentBlockPc": "0x05E3F5",
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4520,
            "block": 4932,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x04C973",
            "prevPc": "0x05E3F5",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4521,
            "block": 4933,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E7",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x05E3E7",
              "currentBlockPc": "0x05E3E7",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4522,
            "block": 4934,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4523,
            "block": 4935,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x04C973",
            "prevPc": "0x05E3E8",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4524,
            "block": 4936,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058221",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x058221",
              "currentBlockPc": "0x058221",
              "sp": "0xD1A851",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10,
              "flags": {
                "z": false,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4525,
            "block": 4937,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058A14",
            "prevPc": "0x058221",
            "cpu": {
              "pc": "0x058A14",
              "currentBlockPc": "0x058A14",
              "sp": "0xD1A854",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10,
              "flags": {
                "z": false,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          }
        ],
        "compareRows": [
          {
            "role": "D02440-D0243D",
            "pc": "0x04C973",
            "nextPc": "0x05E3E7",
            "hl": 13805630,
            "de": 13805630,
            "resultF": 74,
            "resultZ": true
          },
          {
            "role": "D0243A-D02437",
            "pc": "0x04C973",
            "nextPc": "0x058221",
            "hl": 13740236,
            "de": 13740195,
            "resultF": 10,
            "resultZ": false
          }
        ],
        "branchAfter0800B8": {
          "index": 4516,
          "block": 4928,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
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
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
        "gate": {
          "D000C4_IY44": 0,
          "bit5Set": false,
          "branchF": 84,
          "branchZ": true,
          "D010F4": 0
        },
        "pointerState": {
          "D02437": 13740195,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02440": 13805630,
          "firstCompareEqual": true,
          "secondCompareEqual": false
        },
        "returnState": {
          "af": 2314,
          "f": 10,
          "z": false,
          "de": 13740195,
          "hl": 13740236
        }
      },
      "live": {
        "found": true,
        "callIndex": 4513,
        "returnIndex": 4525,
        "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
        "rows": [
          {
            "index": 4513,
            "block": 4925,
            "pc": "0x058A10",
            "prevPc": "0x058A0C",
            "cpu": {
              "pc": "0x058A10",
              "currentBlockPc": "0x058A10",
              "stepCount": 4935,
              "sp": "0xD1A854",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          },
          {
            "index": 4514,
            "block": 4926,
            "pc": "0x058212",
            "prevPc": "0x058A10",
            "cpu": {
              "pc": "0x058212",
              "currentBlockPc": "0x058212",
              "stepCount": 4936,
              "sp": "0xD1A851",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4515,
            "block": 4927,
            "pc": "0x0800B8",
            "prevPc": "0x058212",
            "cpu": {
              "pc": "0x0800B8",
              "currentBlockPc": "0x0800B8",
              "stepCount": 4937,
              "sp": "0xD1A84E",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058216"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4516,
            "block": 4928,
            "pc": "0x058216",
            "prevPc": "0x0800B8",
            "cpu": {
              "pc": "0x058216",
              "currentBlockPc": "0x058216",
              "stepCount": 4938,
              "sp": "0xD1A851",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4518,
            "block": 4930,
            "pc": "0x05E3E3",
            "prevPc": "0x05821D",
            "cpu": {
              "pc": "0x05E3E3",
              "currentBlockPc": "0x05E3E3",
              "stepCount": 4940,
              "sp": "0xD1A84E",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4519,
            "block": 4931,
            "pc": "0x05E3F5",
            "prevPc": "0x05E3E3",
            "cpu": {
              "pc": "0x05E3F5",
              "currentBlockPc": "0x05E3F5",
              "stepCount": 4941,
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4520,
            "block": 4932,
            "pc": "0x04C973",
            "prevPc": "0x05E3F5",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "stepCount": 4942,
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4521,
            "block": 4933,
            "pc": "0x05E3E7",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x05E3E7",
              "currentBlockPc": "0x05E3E7",
              "stepCount": 4943,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4522,
            "block": 4934,
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "stepCount": 4944,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4523,
            "block": 4935,
            "pc": "0x04C973",
            "prevPc": "0x05E3E8",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "stepCount": 4945,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4524,
            "block": 4936,
            "pc": "0x058221",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x058221",
              "currentBlockPc": "0x058221",
              "stepCount": 4946,
              "sp": "0xD1A851",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4525,
            "block": 4937,
            "pc": "0x058A14",
            "prevPc": "0x058221",
            "cpu": {
              "pc": "0x058A14",
              "currentBlockPc": "0x058A14",
              "stepCount": 4947,
              "sp": "0xD1A854",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8CC",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          }
        ],
        "compareRows": [
          {
            "role": "D02440-D0243D",
            "pc": "0x04C973",
            "nextPc": "0x05E3E7",
            "hl": 13805630,
            "de": 13805630,
            "resultF": 74,
            "resultZ": true
          },
          {
            "role": "D0243A-D02437",
            "pc": "0x04C973",
            "nextPc": "0x058221",
            "hl": 13740236,
            "de": 13740236,
            "resultF": 74,
            "resultZ": true
          }
        ],
        "branchAfter0800B8": {
          "index": 4516,
          "block": 4928,
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "stepCount": 4938,
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
        "gate": {
          "D000C4_IY44": 0,
          "bit5Set": false,
          "branchF": 84,
          "branchZ": true,
          "D010F4": 0
        },
        "pointerState": {
          "D02437": 13740236,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02440": 13805630,
          "firstCompareEqual": true,
          "secondCompareEqual": true
        },
        "returnState": {
          "af": 2378,
          "f": 74,
          "z": true,
          "de": 13740236,
          "hl": 13740236
        }
      },
      "controller": "0x058212 reaches 0x05E3E3 in both routes; the decisive compare is D0243A-D02437 / D0243A-D02437 at 0x04C973. Harness compares HL=0xD1A8CC to DE=0xD1A8A3 and returns F=0x0A (Z=0); live compares HL=0xD1A8CC to DE=0xD1A8CC and returns F=0x4A (Z=1)."
    }
  },
  "forced": {
    "classification": {
      "index": 4575,
      "previousCommonPc": "0x0A31A2",
      "harnessNextPc": null,
      "liveNextPc": "0x0A323A",
      "controllingState": "unclassified",
      "diffs": [
        {
          "kind": "field",
          "name": "D02317",
          "harness": "0x000000",
          "live": "0xD2A83E"
        },
        {
          "kind": "field",
          "name": "D0231A",
          "harness": "0x000000",
          "live": "0xD2A83E"
        },
        {
          "kind": "field",
          "name": "D0231D",
          "harness": "0x000000",
          "live": "0xD2A83D"
        }
      ]
    },
    "flagOwner": {
      "harness": {
        "found": true,
        "callIndex": 4513,
        "returnIndex": 4525,
        "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
        "rows": [
          {
            "index": 4513,
            "block": 4925,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058A10",
            "prevPc": "0x058A0C",
            "cpu": {
              "pc": "0x058A10",
              "currentBlockPc": "0x058A10",
              "sp": "0xD1A854",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          },
          {
            "index": 4514,
            "block": 4926,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058212",
            "prevPc": "0x058A10",
            "cpu": {
              "pc": "0x058212",
              "currentBlockPc": "0x058212",
              "sp": "0xD1A851",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4515,
            "block": 4927,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x0800B8",
            "prevPc": "0x058212",
            "cpu": {
              "pc": "0x0800B8",
              "currentBlockPc": "0x0800B8",
              "sp": "0xD1A84E",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058216"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4516,
            "block": 4928,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058216",
            "prevPc": "0x0800B8",
            "cpu": {
              "pc": "0x058216",
              "currentBlockPc": "0x058216",
              "sp": "0xD1A851",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4518,
            "block": 4930,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E3",
            "prevPc": "0x05821D",
            "cpu": {
              "pc": "0x05E3E3",
              "currentBlockPc": "0x05E3E3",
              "sp": "0xD1A84E",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4519,
            "block": 4931,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3F5",
            "prevPc": "0x05E3E3",
            "cpu": {
              "pc": "0x05E3F5",
              "currentBlockPc": "0x05E3F5",
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4520,
            "block": 4932,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x04C973",
            "prevPc": "0x05E3F5",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
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
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4521,
            "block": 4933,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E7",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x05E3E7",
              "currentBlockPc": "0x05E3E7",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4522,
            "block": 4934,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4523,
            "block": 4935,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x04C973",
            "prevPc": "0x05E3E8",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74,
              "flags": {
                "z": true,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4524,
            "block": 4936,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058221",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x058221",
              "currentBlockPc": "0x058221",
              "sp": "0xD1A851",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10,
              "flags": {
                "z": false,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4525,
            "block": 4937,
            "phase": "p7-clear-outer-loop-to-owner",
            "pc": "0x058A14",
            "prevPc": "0x058221",
            "cpu": {
              "pc": "0x058A14",
              "currentBlockPc": "0x058A14",
              "sp": "0xD1A854",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10,
              "flags": {
                "z": false,
                "c": false,
                "pv": false
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D02317": 0,
                "D0231A": 0,
                "D0231D": 0,
                "D02437": 13740195,
                "D0243A": 13740236,
                "D0243D": 13805630,
                "D02440": 13805630,
                "D010F4": 0,
                "D02504": 0,
                "D02505": 10,
                "D02506": 0,
                "D02590": 13893249,
                "D0259D": 13893325,
                "D02A29": 0,
                "D00595": 0,
                "D00596": 0,
                "D0059A": 0,
                "D00587": 0,
                "D0058C": 9,
                "D0058E": 0,
                "D000CA_IY4A": 33,
                "D000C4_IY44": 0,
                "D000CC_IY4C": 0,
                "D000B2_IY32": 0
              }
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0x000000",
              "D0231A": "0x000000",
              "D0231D": "0x000000",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          }
        ],
        "compareRows": [
          {
            "role": "D02440-D0243D",
            "pc": "0x04C973",
            "nextPc": "0x05E3E7",
            "hl": 13805630,
            "de": 13805630,
            "resultF": 74,
            "resultZ": true
          },
          {
            "role": "D0243A-D02437",
            "pc": "0x04C973",
            "nextPc": "0x058221",
            "hl": 13740236,
            "de": 13740195,
            "resultF": 10,
            "resultZ": false
          }
        ],
        "branchAfter0800B8": {
          "index": 4516,
          "block": 4928,
          "phase": "p7-clear-outer-loop-to-owner",
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
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
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
        "gate": {
          "D000C4_IY44": 0,
          "bit5Set": false,
          "branchF": 84,
          "branchZ": true,
          "D010F4": 0
        },
        "pointerState": {
          "D02437": 13740195,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02440": 13805630,
          "firstCompareEqual": true,
          "secondCompareEqual": false
        },
        "returnState": {
          "af": 2314,
          "f": 10,
          "z": false,
          "de": 13740195,
          "hl": 13740236
        }
      },
      "live": {
        "found": true,
        "callIndex": 4513,
        "returnIndex": 4525,
        "path": "0x058A10 -> 0x058212 -> 0x0800B8 -> 0x058216 -> 0x05E3E3 -> 0x05E3F5 -> 0x04C973 -> 0x05E3E7 -> 0x05E3E8 -> 0x04C973 -> 0x058221 -> 0x058A14",
        "rows": [
          {
            "index": 4513,
            "block": 4925,
            "pc": "0x058A10",
            "prevPc": "0x058A0C",
            "cpu": {
              "pc": "0x058A10",
              "currentBlockPc": "0x058A10",
              "stepCount": 4935,
              "sp": "0xD1A854",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          },
          {
            "index": 4514,
            "block": 4926,
            "pc": "0x058212",
            "prevPc": "0x058A10",
            "cpu": {
              "pc": "0x058212",
              "currentBlockPc": "0x058212",
              "stepCount": 4936,
              "sp": "0xD1A851",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4515,
            "block": 4927,
            "pc": "0x0800B8",
            "prevPc": "0x058212",
            "cpu": {
              "pc": "0x0800B8",
              "currentBlockPc": "0x0800B8",
              "stepCount": 4937,
              "sp": "0xD1A84E",
              "af": "0x0942",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 66
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058216"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4516,
            "block": 4928,
            "pc": "0x058216",
            "prevPc": "0x0800B8",
            "cpu": {
              "pc": "0x058216",
              "currentBlockPc": "0x058216",
              "stepCount": 4938,
              "sp": "0xD1A851",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4518,
            "block": 4930,
            "pc": "0x05E3E3",
            "prevPc": "0x05821D",
            "cpu": {
              "pc": "0x05E3E3",
              "currentBlockPc": "0x05E3E3",
              "stepCount": 4940,
              "sp": "0xD1A84E",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4519,
            "block": 4931,
            "pc": "0x05E3F5",
            "prevPc": "0x05E3E3",
            "cpu": {
              "pc": "0x05E3F5",
              "currentBlockPc": "0x05E3F5",
              "stepCount": 4941,
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2003E",
              "hl": "0x0585E9",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4520,
            "block": 4932,
            "pc": "0x04C973",
            "prevPc": "0x05E3F5",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "stepCount": 4942,
              "sp": "0xD1A84B",
              "af": "0x0954",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 84
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84B",
                "value": "0x05E3E7"
              },
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4521,
            "block": 4933,
            "pc": "0x05E3E7",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x05E3E7",
              "currentBlockPc": "0x05E3E7",
              "stepCount": 4943,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4522,
            "block": 4934,
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "stepCount": 4944,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4523,
            "block": 4935,
            "pc": "0x04C973",
            "prevPc": "0x05E3E8",
            "cpu": {
              "pc": "0x04C973",
              "currentBlockPc": "0x04C973",
              "stepCount": 4945,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          {
            "index": 4524,
            "block": 4936,
            "pc": "0x058221",
            "prevPc": "0x04C973",
            "cpu": {
              "pc": "0x058221",
              "currentBlockPc": "0x058221",
              "stepCount": 4946,
              "sp": "0xD1A851",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
          {
            "index": 4525,
            "block": 4937,
            "pc": "0x058A14",
            "prevPc": "0x058221",
            "cpu": {
              "pc": "0x058A14",
              "currentBlockPc": "0x058A14",
              "stepCount": 4947,
              "sp": "0xD1A854",
              "af": "0x090A",
              "bc": "0x000900",
              "de": "0xD1A8A3",
              "hl": "0xD1A8CC",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 10
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
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
              },
              {
                "addr": "0xD1A860",
                "value": "0x0009A3"
              },
              {
                "addr": "0xD1A863",
                "value": "0x0019B5"
              }
            ]
          }
        ],
        "compareRows": [
          {
            "role": "D02440-D0243D",
            "pc": "0x04C973",
            "nextPc": "0x05E3E7",
            "hl": 13805630,
            "de": 13805630,
            "resultF": 74,
            "resultZ": true
          },
          {
            "role": "D0243A-D02437",
            "pc": "0x04C973",
            "nextPc": "0x058221",
            "hl": 13740236,
            "de": 13740195,
            "resultF": 10,
            "resultZ": false
          }
        ],
        "branchAfter0800B8": {
          "index": 4516,
          "block": 4928,
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "stepCount": 4938,
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 84
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
        "gate": {
          "D000C4_IY44": 0,
          "bit5Set": false,
          "branchF": 84,
          "branchZ": true,
          "D010F4": 0
        },
        "pointerState": {
          "D02437": 13740195,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02440": 13805630,
          "firstCompareEqual": true,
          "secondCompareEqual": false
        },
        "returnState": {
          "af": 2314,
          "f": 10,
          "z": false,
          "de": 13740195,
          "hl": 13740236
        }
      },
      "controller": "0x058212 reaches 0x05E3E3 in both routes; the decisive compare is D0243A-D02437 / D0243A-D02437 at 0x04C973. Harness compares HL=0xD1A8CC to DE=0xD1A8A3 and returns F=0x0A (Z=0); live compares HL=0xD1A8CC to DE=0xD1A8A3 and returns F=0x0A (Z=0)."
    },
    "postOwner": {
      "found": true,
      "ownerIndexes": [
        4560
      ],
      "copyIndexes": [
        4573
      ],
      "postCopyIndexes": [
        4574
      ],
      "firstOwnerIndex": 4560,
      "firstPostCopyIndex": 4574,
      "firstClearCallIndex": -1,
      "firstClearEntryIndex": -1,
      "firstAnchorIndex": -1,
      "firstWipeIndex": -1,
      "firstPollIndex": -1,
      "postOwnerEdge": {
        "from": {
          "index": 4574,
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "af": "0xCE88",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A818",
          "stack0": "0x000040",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        "to": {
          "index": 4575,
          "block": 4987,
          "pc": "0x0A323A",
          "prevPc": "0x0A31A2",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A81E",
          "stack0": "0x000044",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        }
      },
      "fallbackEdge": {
        "from": {
          "pc": "0x0A2A37"
        },
        "to": {
          "index": 5000,
          "block": 107912,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "af": "0x090C",
          "bc": "0x000131",
          "de": "0x00013F",
          "hl": "0x0000EA",
          "sp": "0xD1A842",
          "stack0": "0x0A2356",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        }
      },
      "tailEntryEdge": null,
      "anchorEdge": {
        "from": {
          "pc": "0x0A2A37"
        },
        "to": {
          "index": 5000,
          "block": 107912,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "af": "0x090C",
          "bc": "0x000131",
          "de": "0x00013F",
          "hl": "0x0000EA",
          "sp": "0xD1A842",
          "stack0": "0x0A2356",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        }
      },
      "wipeEdge": {
        "from": {
          "pc": "0x001879"
        },
        "to": {
          "index": 5000,
          "block": 111289,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "af": "0x5200",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "sp": "0xD1A87B",
          "stack0": "0x0013E8",
          "D007CA": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        }
      },
      "controllingState": "post-owner copy returns through 0x0A323A rather than repairing the live route; the first fallback into the anchor family is 0x0A2A37 -> 0x0A229D; 0x0A229D is then reached from 0x0A2A37 with BC=0x000131, HL=0x0000EA, DE=0x00013F, D02505=0x0A, stack0=0x0A2356; forced route did not hit 0x058A16 before the anchor (count=0); forced route did not hit 0x0A223A before the anchor (count=0)",
      "postOwnerWindow": [
        {
          "index": 4568,
          "block": 4980,
          "pc": "0x0A31A6",
          "prevPc": "0x0A3158",
          "af": "0x0090",
          "bc": "0x00B414",
          "de": "0xD0EC95",
          "hl": "0x003200",
          "sp": "0xD1A80F",
          "stack0": "0x003200",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4569,
          "block": 4981,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31A6",
          "af": "0x00A8",
          "bc": "0x00B414",
          "de": "0xD0EC95",
          "hl": "0x0032ED",
          "sp": "0xD1A80C",
          "stack0": "0x0A31AC",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4570,
          "block": 4982,
          "pc": "0x0A31AC",
          "prevPc": "0x0A31F6",
          "af": "0x00A8",
          "bc": "0x00B414",
          "de": "0xD0EC95",
          "hl": "0x025080",
          "sp": "0xD1A80F",
          "stack0": "0x003200",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4571,
          "block": 4983,
          "pc": "0x0A31F6",
          "prevPc": "0x0A31AC",
          "af": "0x00A8",
          "bc": "0x00B414",
          "de": "0xD6507F",
          "hl": "0xD400B4",
          "sp": "0xD1A80C",
          "stack0": "0x0A31B8",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4572,
          "block": 4984,
          "pc": "0x0A31B8",
          "prevPc": "0x0A31F6",
          "af": "0x00A8",
          "bc": "0x00B414",
          "de": "0xD6507F",
          "hl": "0x01C200",
          "sp": "0xD1A80F",
          "stack0": "0x003200",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4573,
          "block": 4985,
          "pc": "0x0A31E2",
          "prevPc": "0x0A31B8",
          "af": "0xCE5C",
          "bc": "0x00B414",
          "de": "0xD031F6",
          "hl": "0x002057",
          "sp": "0xD1A815",
          "stack0": "0x000320",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4574,
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "af": "0xCE88",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A818",
          "stack0": "0x000040",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4575,
          "block": 4987,
          "pc": "0x0A323A",
          "prevPc": "0x0A31A2",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A81E",
          "stack0": "0x000044",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4576,
          "block": 4988,
          "pc": "0x0A2D4C",
          "prevPc": "0x0A323A",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A81B",
          "stack0": "0x0A3241",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4577,
          "block": 4989,
          "pc": "0x0A3241",
          "prevPc": "0x0A2D4C",
          "af": "0x2520",
          "bc": "0x000000",
          "de": "0xD0362D",
          "hl": "0xD0330D",
          "sp": "0xD1A81E",
          "stack0": "0x000044",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4578,
          "block": 4990,
          "pc": "0x0A3257",
          "prevPc": "0x0A3241",
          "af": "0x0754",
          "bc": "0x000000",
          "de": "0xD031F6",
          "hl": "0x000118",
          "sp": "0xD1A81B",
          "stack0": "0x002520",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4579,
          "block": 4991,
          "pc": "0x09EF20",
          "prevPc": "0x0A3257",
          "af": "0x3620",
          "bc": "0x002536",
          "de": "0x00013F",
          "hl": "0x000000",
          "sp": "0xD1A81B",
          "stack0": "0x0A3274",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4580,
          "block": 4992,
          "pc": "0x09EF44",
          "prevPc": "0x09EF20",
          "af": "0x3620",
          "bc": "0x002536",
          "de": "0x00013F",
          "hl": "0x000000",
          "sp": "0xD1A818",
          "stack0": "0x09EF2E",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4581,
          "block": 4993,
          "pc": "0x09EF4A",
          "prevPc": "0x09EF44",
          "af": "0x0040",
          "bc": "0x002536",
          "de": "0x00013F",
          "hl": "0x000000",
          "sp": "0xD1A818",
          "stack0": "0x09EF2E",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4582,
          "block": 4994,
          "pc": "0x09EF5E",
          "prevPc": "0x09EF4A",
          "af": "0x1202",
          "bc": "0x002536",
          "de": "0x000000",
          "hl": "0x00013F",
          "sp": "0xD1A809",
          "stack0": "0x002536",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4583,
          "block": 4995,
          "pc": "0x08C308",
          "prevPc": "0x09EF5E",
          "af": "0x1200",
          "bc": "0x002536",
          "de": "0x000000",
          "hl": "0x002E40",
          "sp": "0xD1A7FD",
          "stack0": "0x09EF70",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4584,
          "block": 4996,
          "pc": "0x09EF70",
          "prevPc": "0x08C308",
          "af": "0x1254",
          "bc": "0x002536",
          "de": "0x000000",
          "hl": "0x002E40",
          "sp": "0xD1A800",
          "stack0": "0x000000",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4585,
          "block": 4997,
          "pc": "0x09EFB7",
          "prevPc": "0x09EF70",
          "af": "0x1254",
          "bc": "0x002536",
          "de": "0x000000",
          "hl": "0x002E40",
          "sp": "0xD1A800",
          "stack0": "0x000000",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4586,
          "block": 4998,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFB7",
          "af": "0x12A4",
          "bc": "0x00A0A0",
          "de": "0x00FFFF",
          "hl": "0xD45C80",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4587,
          "block": 4999,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009FA0",
          "de": "0x00FFFF",
          "hl": "0xD45C84",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4588,
          "block": 5000,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009EA0",
          "de": "0x00FFFF",
          "hl": "0xD45C88",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4589,
          "block": 5001,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009DA0",
          "de": "0x00FFFF",
          "hl": "0xD45C8C",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4590,
          "block": 5002,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009CA0",
          "de": "0x00FFFF",
          "hl": "0xD45C90",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4591,
          "block": 5003,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009BA0",
          "de": "0x00FFFF",
          "hl": "0xD45C94",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4592,
          "block": 5004,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x009AA0",
          "de": "0x00FFFF",
          "hl": "0xD45C98",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4593,
          "block": 5005,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x0099A0",
          "de": "0x00FFFF",
          "hl": "0xD45C9C",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        },
        {
          "index": 4594,
          "block": 5006,
          "pc": "0x09EFDE",
          "prevPc": "0x09EFDE",
          "af": "0x12A4",
          "bc": "0x0098A0",
          "de": "0x00FFFF",
          "hl": "0xD45CA0",
          "sp": "0xD1A803",
          "stack0": "0x000140",
          "D007CA": "0x0585E9",
          "D02437": "0xD1A8A3",
          "D0243A": "0xD1A8CB",
          "D0243D": "0xD2A83D",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD"
        }
      ],
      "anchorWindow": [],
      "wipeWindow": []
    }
  },
  "harness": {
    "clearResult": {
      "steps": 4986,
      "termination": "captured-0a31e2-to-0a31a2",
      "lastPc": "0x0A31A2",
      "lastMode": "adl"
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
      "flagCompareD0243A05E3E8": 2,
      "flagCompare04C973": 8,
      "flagReturn058A14": 1,
      "clearCaller058A16": 0,
      "clearEntry0A223A": 0,
      "tailHelper0A2A37": 7,
      "anchor0A229D": 0,
      "spaceFill0A22A4": 0,
      "liveSpin0A1854": 80,
      "owner0A31FD": 1,
      "ownerSetup0A322B": 1,
      "ownerEntry0A321D": 1,
      "copySetup0A31B8": 1,
      "destructiveCopy0A31E2": 1,
      "postCopy0A31A2": 1,
      "cleanup0018F8": 0,
      "poll006D64": 0
    }
  },
  "inverseHarness": {
    "clearResult": {
      "steps": 100000,
      "termination": "max_steps",
      "lastPc": "0x006CF7",
      "lastMode": "adl"
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
      "cleanup0018F8": 1,
      "poll006D64": 1667
    },
    "mutations": [
      {
        "pc": "0x05E3E8",
        "block": 4934,
        "forceD02437": "0xD1A8CC",
        "before": {
          "index": 4523,
          "block": 4934,
          "phase": "mutation-before",
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E8",
          "cpu": {
            "pc": "0x05E3E8",
            "currentBlockPc": "0x05E3E8",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740195,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0xD1A8A3",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
            }
          ]
        },
        "after": {
          "index": 4523,
          "block": 4934,
          "phase": "mutation-after",
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E8",
          "cpu": {
            "pc": "0x05E3E8",
            "currentBlockPc": "0x05E3E8",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 74,
            "flags": {
              "z": true,
              "c": false,
              "pv": false
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D02317": 0,
              "D0231A": 0,
              "D0231D": 0,
              "D02437": 13740236,
              "D0243A": 13740236,
              "D0243D": 13805630,
              "D02440": 13805630,
              "D010F4": 0,
              "D02504": 0,
              "D02505": 10,
              "D02506": 0,
              "D02590": 13893249,
              "D0259D": 13893325,
              "D02A29": 0,
              "D00595": 0,
              "D00596": 0,
              "D0059A": 0,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D000CA_IY4A": 33,
              "D000C4_IY44": 0,
              "D000CC_IY4C": 0,
              "D000B2_IY32": 0
            }
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
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
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D000CA_IY4A": "0x21",
            "D000C4_IY44": "0x00",
            "D000CC_IY4C": "0x00",
            "D000B2_IY32": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
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
            }
          ]
        }
      }
    ]
  },
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
        "cleanup0018F8": 1,
        "poll006D64": 9167
      }
    },
    "forced": {
      "status": "Key: CLEAR → 160000 steps (max_steps, peak 11254px)",
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
        "vramPeak": 11254,
        "vramCurrent": 3031
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
        "flagCompareD0243A05E3E8": 43,
        "flagCompare04C973": 91,
        "flagReturn058A14": 1,
        "clearCaller058A16": 0,
        "clearEntry0A223A": 0,
        "tailHelper0A2A37": 75,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 1008,
        "owner0A31FD": 3,
        "ownerSetup0A322B": 1,
        "ownerEntry0A321D": 3,
        "copySetup0A31B8": 3,
        "destructiveCopy0A31E2": 3,
        "postCopy0A31A2": 3,
        "cleanup0018F8": 1,
        "poll006D64": 4924
      },
      "mutations": [
        {
          "pc": "0x05E3E8",
          "block": 4934,
          "forceD02437": "0xD1A8A3",
          "before": {
            "index": 4522,
            "block": 4934,
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "stepCount": 4944,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          },
          "after": {
            "index": 4522,
            "block": 4934,
            "pc": "0x05E3E8",
            "prevPc": "0x05E3E7",
            "cpu": {
              "pc": "0x05E3E8",
              "currentBlockPc": "0x05E3E8",
              "stepCount": 4944,
              "sp": "0xD1A84E",
              "af": "0x094A",
              "bc": "0x000900",
              "de": "0xD2A83E",
              "hl": "0xD2A83E",
              "ix": "0xD1A860",
              "iy": "0xD00080",
              "f": 74
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D02317": "0xD2A83E",
              "D0231A": "0xD2A83E",
              "D0231D": "0xD2A83D",
              "D02437": "0xD1A8A3",
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
              "D0058C": "0x09",
              "D0058E": "0x00",
              "D000CA_IY4A": "0x21",
              "D000C4_IY44": "0x00",
              "D000CC_IY4C": "0x00",
              "D000B2_IY32": "0x00"
            },
            "stackTop": [
              {
                "addr": "0xD1A84E",
                "value": "0x058221"
              },
              {
                "addr": "0xD1A851",
                "value": "0x058A14"
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
              }
            ]
          }
        }
      ]
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

