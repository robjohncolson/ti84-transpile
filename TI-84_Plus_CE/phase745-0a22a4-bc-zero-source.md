# Phase 745: 0x0A22A4 BC-Zero Source Trace

Probe: `probe-phase745-0a22a4-bc-zero-source.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase745-0a22a4-bc-zero-source.mjs`  
Exit: 0

## Summary

- **** Browser EOL/CLEAR captured 7351 observed blocks; final status: Key: CLEAR → 7366 steps (missing_block, peak 8585px).
- **** Dynamic source path: 0x0A223A is entered from 0x058A16 with BC=0x000900; 0x0A2A37 is entered from 0x0A237E with BC=0x000000; 0x0A22A4 is entered from 0x0A2A37 with BC=0x000000, HL=0x000000, DE=0x00013F. The last BC transition to zero before the LDIR tail is 0x000018->0x000000 at observed block 7350 (0x0A229D -> 0x0A2A37), so the owner is the previous block/path 0x0A229D. Static decode shows this is the 0x0A229D tail: LD A,B; PUSH HL; POP BC; CALL 0x0A2A37. With HL=0 at 0x0A229D, POP BC makes BC=0 before the final 0x0A2A37 call and 0x0A22A4 LDIR tail.
- **** Tail entry state: prevPc=0x0A2A37, BC=0x000000, HL=0x000000, DE=0x00013F, SP=0xD1A851, Stack[0]=0x058A1A.
- *** EOL/CLEAR key state at tail is D0058C=0x09, D0058D=0x0F, D0058E=0x00 while BC is already 0x000000; the zero count is therefore owned by the display/text-fill parameter path, not by a raw key byte.
- No disk edit to `browser-shell.html`; this probe served an in-memory instrumented copy only.

## Focus Target Hits

| Target | Hits | First block | Prev PC | BC | HL | DE | SP | Stack[0] |
|---|---:|---:|---|---|---|---|---|---|
| caller058a16 | 1 | 4938 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A854 | 0x08C73D |
| call0a223a | 1 | 4939 | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0xD1A851 | 0x058A1A |
| bridge0a2a37 | 9 | 365 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0A2389 |
| tail0a22a4 | 1 | 7351 | 0x0A2A37 | 0x000000 | 0x000000 | 0x00013F | 0xD1A851 | 0x058A1A |
| tailRet0a22b0 | 0 | - | - | - | - | - | - | - |

## Focused Dynamic Route

| Block | PC | Prev PC | BC | HL | DE | AF | SP | Stack[0] | D0058C/D/E | D0243A | D0243D | D0059C |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 364 | 0x0A237E | 0x05C815 | 0x000000 | 0x000000 | 0xD2A815 | 0x0075 | 0xD1A84E | 0x05C819 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 365 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0x0075 | 0xD1A842 | 0x0A2389 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 366 | 0x0A2389 | 0x0A2A37 | 0x000000 | 0x000000 | 0xD2A815 | 0x0044 | 0xD1A845 | 0xD2A815 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 386 | 0x0A237E | 0x0A17AA | 0x00E000 | 0xD100CC | 0xD2A83E | 0xE010 | 0xD1A83C | 0x0A17AE | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 387 | 0x0A2A37 | 0x0A237E | 0x00E000 | 0xD100CC | 0xD2A83E | 0x0010 | 0xD1A830 | 0x0A2389 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 388 | 0x0A2389 | 0x0A2A37 | 0x00E000 | 0x000000 | 0xD2A83E | 0x0044 | 0xD1A833 | 0xD2A83E | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD4202C |
| 960 | 0x0A237E | 0x0A17AA | 0x00E000 | 0x00FFFF | 0xD2A815 | 0x0031 | 0xD1A848 | 0x0A17AE | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 961 | 0x0A2A37 | 0x0A237E | 0x00E000 | 0x00FFFF | 0xD2A815 | 0x0031 | 0xD1A83C | 0x0A2389 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 962 | 0x0A2389 | 0x0A2A37 | 0x00E000 | 0x000000 | 0xD2A815 | 0x0044 | 0xD1A83F | 0xD2A815 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2330 | 0x0A237E | 0x05C815 | 0x000F00 | 0x000000 | 0xD2A83E | 0x0075 | 0xD1A84E | 0x05C819 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2331 | 0x0A2A37 | 0x0A237E | 0x000F00 | 0x000000 | 0xD2A83E | 0x0075 | 0xD1A842 | 0x0A2389 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2332 | 0x0A2389 | 0x0A2A37 | 0x000F00 | 0x000000 | 0xD2A83E | 0x0044 | 0xD1A845 | 0xD2A83E | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2352 | 0x0A237E | 0x0A17AA | 0x00E000 | 0xD100CC | 0xD2A83E | 0xE010 | 0xD1A83C | 0x0A17AE | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2353 | 0x0A2A37 | 0x0A237E | 0x00E000 | 0xD100CC | 0xD2A83E | 0x0010 | 0xD1A830 | 0x0A2389 | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2354 | 0x0A2389 | 0x0A2A37 | 0x00E000 | 0x000000 | 0xD2A83E | 0x0044 | 0xD1A833 | 0xD2A83E | 0x0F/0x0F/0x0F | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2948 | 0x0A237E | 0x0A17AA | 0x00E000 | 0xD100CC | 0xD2A83E | 0xE010 | 0xD1A836 | 0x0A17AE | 0x00/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2949 | 0x0A2A37 | 0x0A237E | 0x00E000 | 0xD100CC | 0xD2A83E | 0x0010 | 0xD1A82A | 0x0A2389 | 0x00/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 2950 | 0x0A2389 | 0x0A2A37 | 0x00E000 | 0x000000 | 0xD2A83E | 0x0044 | 0xD1A82D | 0xD2A83E | 0x00/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 3796 | 0x0A237E | 0x0A17AA | 0x00E000 | 0x09F7AA | 0xD2003E | 0x0031 | 0xD1A848 | 0x0A17AE | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 3797 | 0x0A2A37 | 0x0A237E | 0x00E000 | 0x09F7AA | 0xD2003E | 0x0031 | 0xD1A83C | 0x0A2389 | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 3798 | 0x0A2389 | 0x0A2A37 | 0x00E000 | 0x000000 | 0xD2003E | 0x0044 | 0xD1A83F | 0xD2003E | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4924 | 0x058A0C | 0x0589EF | 0x000900 | 0x0585E9 | 0xD2003E | 0x09BB | 0xD1A854 | 0x08C73D | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4925 | 0x058A10 | 0x058A0C | 0x000900 | 0x0585E9 | 0xD2003E | 0x0942 | 0xD1A854 | 0x08C73D | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4937 | 0x058A14 | 0x058221 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x094A | 0xD1A854 | 0x08C73D | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4938 | 0x058A16 | 0x058A14 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x094A | 0xD1A854 | 0x08C73D | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4939 | 0x0A223A | 0x058A16 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x094A | 0xD1A851 | 0x058A1A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4940 | 0x0A235E | 0x0A223A | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x094A | 0xD1A84E | 0x0A223E | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4941 | 0x0A223E | 0x0A235E | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x094A | 0xD1A851 | 0x058A1A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4944 | 0x0A2247 | 0x0800BD | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x005C | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4945 | 0x0A2251 | 0x0A2247 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x005C | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4946 | 0x0A2254 | 0x0A2251 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x0044 | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4947 | 0x0A225A | 0x0A2254 | 0x000900 | 0xD1A8CC | 0xD1A8CC | 0x1E44 | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4948 | 0x0A2267 | 0x0A225A | 0x001E00 | 0xD1A8CC | 0xD1A8CC | 0x00B3 | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 4950 | 0x0A226B | 0x0A2D4C | 0x001E00 | 0xD1A8CC | 0xD1A8CC | 0x2520 | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD48204 |
| 6145 | 0x0A227A | 0x09EF2E | 0x001E23 | 0x000000 | 0x00013F | 0x0044 | 0xD1A84E | 0x00004A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 6146 | 0x0A2280 | 0x0A227A | 0x001E23 | 0x000000 | 0x00013F | 0x0018 | 0xD1A851 | 0x058A1A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 7347 | 0x0A228F | 0x03D0E0 | 0x001E23 | 0x000000 | 0x00013F | 0x0044 | 0xD1A84E | 0x000018 | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 7348 | 0x0A2A37 | 0x0A228F | 0x000018 | 0x000000 | 0x00013F | 0x0042 | 0xD1A84E | 0x0A229D | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 7349 | 0x0A229D | 0x0A2A37 | 0x000018 | 0x000000 | 0x00013F | 0x0044 | 0xD1A851 | 0x058A1A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 7350 | 0x0A2A37 | 0x0A229D | 0x000000 | 0x000000 | 0x00013F | 0x0044 | 0xD1A84E | 0x0A22A4 | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |
| 7351 | 0x0A22A4 | 0x0A2A37 | 0x000000 | 0x000000 | 0x00013F | 0x0044 | 0xD1A851 | 0x058A1A | 0x09/0x0F/0x00 | 0xD1A8CC | 0xD2A83E | 0xD45A00 |

## Register Transitions Near the Tail

| Block | PC | Prev PC | Reg | From | To | Owner note |
|---:|---|---|---|---|---|---|
| 7256 | 0x000038 | 0x03D0E0 | BC | 0x00A008 | 0x001E23 | change occurred during previous observed block/path |
| 7257 | 0x0006F3 | 0x000038 | BC | 0x001E23 | 0x00A008 | change occurred during previous observed block/path |
| 7262 | 0x001717 | 0x0008BB | BC | 0x00A008 | 0x00A55A | change occurred during previous observed block/path |
| 7265 | 0x0067F8 | 0x00171E | BC | 0x00A55A | 0x020000 | change occurred during previous observed block/path |
| 7268 | 0x001CC0 | 0x001CA6 | BC | 0x020000 | 0x000000 | change occurred during previous observed block/path |
| 7272 | 0x001CE5 | 0x001CD5 | BC | 0x000000 | 0x09D6B4 | change occurred during previous observed block/path |
| 7281 | 0x001CC0 | 0x001CA6 | BC | 0x09D6B4 | 0x000000 | change occurred during previous observed block/path |
| 7284 | 0x001C81 | 0x001CE4 | BC | 0x000000 | 0x000002 | change occurred during previous observed block/path |
| 7293 | 0x001CC0 | 0x001CA6 | BC | 0x000002 | 0x000000 | change occurred during previous observed block/path |
| 7296 | 0x001C81 | 0x001CE4 | BC | 0x000000 | 0x000001 | change occurred during previous observed block/path |
| 7305 | 0x001CC0 | 0x001CA6 | BC | 0x000001 | 0x000000 | change occurred during previous observed block/path |
| 7308 | 0x001C81 | 0x001CE4 | BC | 0x000000 | 0x000002 | change occurred during previous observed block/path |
| 7317 | 0x001CC0 | 0x001CA6 | BC | 0x000002 | 0x000000 | change occurred during previous observed block/path |
| 7320 | 0x001C81 | 0x001CE4 | BC | 0x000000 | 0x000001 | change occurred during previous observed block/path |
| 7331 | 0x001CC0 | 0x001CA6 | BC | 0x000001 | 0x000000 | change occurred during previous observed block/path |
| 7334 | 0x001C54 | 0x001CE4 | BC | 0x000000 | 0x000002 | change occurred during previous observed block/path |
| 7339 | 0x000719 | 0x001727 | BC | 0x000002 | 0x020000 | change occurred during previous observed block/path |
| 7343 | 0x03CFA4 | 0x03CF7D | BC | 0x020000 | 0x005016 | change occurred during previous observed block/path |
| 7344 | 0x03CFCF | 0x03CFA4 | BC | 0x005016 | 0x005015 | change occurred during previous observed block/path |
| 7345 | 0x03CFFE | 0x03CFCF | BC | 0x005015 | 0x005014 | change occurred during previous observed block/path |
| 7347 | 0x0A228F | 0x03D0E0 | BC | 0x005014 | 0x001E23 | change occurred during previous observed block/path |
| 7347 | 0x0A228F | 0x03D0E0 | DE | 0x0080C0 | 0x00013F | change occurred during previous observed block/path |
| 7347 | 0x0A228F | 0x03D0E0 | SP | 0xD1A842 | 0xD1A84E | change occurred during previous observed block/path |
| 7348 | 0x0A2A37 | 0x0A228F | AF | 0x0044 | 0x0042 | change occurred during previous observed block/path |
| 7348 | 0x0A2A37 | 0x0A228F | BC | 0x001E23 | 0x000018 | change occurred during previous observed block/path |
| 7349 | 0x0A229D | 0x0A2A37 | AF | 0x0042 | 0x0044 | change occurred during previous observed block/path |
| 7349 | 0x0A229D | 0x0A2A37 | SP | 0xD1A84E | 0xD1A851 | change occurred during previous observed block/path |
| 7350 | 0x0A2A37 | 0x0A229D | BC | 0x000018 | 0x000000 | change occurred during previous observed block/path |
| 7350 | 0x0A2A37 | 0x0A229D | SP | 0xD1A851 | 0xD1A84E | change occurred during previous observed block/path |
| 7351 | 0x0A22A4 | 0x0A2A37 | SP | 0xD1A84E | 0xD1A851 | change occurred during previous observed block/path |

## Static Decode

### 0x058A10-0x058A22

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x058A10 | `CD 12 82 05` | `CALL 0x058212` | 0x058212 | 0x058A14 |
| 0x058A14 | `20 16` | `JR NZ,0x058A2C` | 0x058A2C | 0x058A16 |
| 0x058A16 | `CD 3A 22 0A` | `CALL 0x0A223A` | 0x0A223A | 0x058A1A |
| 0x058A1A | `FD CB 49 BE` | `indexed-cb-res {"pc":363034,"length":4,"nextPc":363038,"tag":"indexed-cb-res","bit":7,"indexRegister":"iy","displacement":73,"mode":"adl","modePrefix":null}` | - | - |
| 0x058A1E | `CD 54 8D 05` | `CALL 0x058D54` | 0x058D54 | 0x058A22 |

### 0x0A223A-0x0A22B1

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x0A223A | `CD 5E 23 0A` | `CALL 0x0A235E` | 0x0A235E | 0x0A223E |
| 0x0A223E | `3A 04 25 D0` | `LD A,(0xD02504)` | - | - |
| 0x0A2242 | `F5` | `PUSH AF` | - | - |
| 0x0A2243 | `CD A0 00 08` | `CALL 0x0800A0` | 0x0800A0 | 0x0A2247 |
| 0x0A2247 | `28 08` | `JR Z,0x0A2251` | 0x0A2251 | 0x0A2249 |
| 0x0A2249 | `FE 06` | `CP 0x06` | - | - |
| 0x0A224B | `20 09` | `JR NZ,0x0A2256` | 0x0A2256 | 0x0A224D |
| 0x0A224D | `3E 9B` | `LD A,0x9B` | - | - |
| 0x0A224F | `18 09` | `JR 0x0A225A` | 0x0A225A | - |
| 0x0A2251 | `B7` | `OR A` | - | - |
| 0x0A2252 | `20 02` | `JR NZ,0x0A2256` | 0x0A2256 | 0x0A2254 |
| 0x0A2254 | `3E 1E` | `LD A,0x1E` | - | - |
| 0x0A2256 | `C4 4C 2D 0A` | `CALL NZ,0x0A2D4C` | 0x0A2D4C | 0x0A225A |
| 0x0A225A | `47` | `LD B,A` | - | - |
| 0x0A225B | `3A 05 25 D0` | `LD A,(0xD02505)` | - | - |
| 0x0A225F | `FE 0A` | `CP 0x0A` | - | - |
| 0x0A2261 | `20 04` | `JR NZ,0x0A2267` | 0x0A2267 | 0x0A2263 |
| 0x0A2263 | `3E EF` | `LD A,0xEF` | - | - |
| 0x0A2265 | `18 06` | `JR 0x0A226D` | 0x0A226D | - |
| 0x0A2267 | `CD 4C 2D 0A` | `CALL 0x0A2D4C` | 0x0A2D4C | 0x0A226B |
| 0x0A226B | `D6 02` | `SUB 0x02` | - | - |
| 0x0A226D | `21 00 00 00` | `LD HL,0x000000` | - | - |
| 0x0A2271 | `4F` | `LD C,A` | - | - |
| 0x0A2272 | `11 3F 01 00` | `LD DE,0x00013F` | - | - |
| 0x0A2276 | `CD 20 EF 09` | `CALL 0x09EF20` | 0x09EF20 | 0x0A227A |
| 0x0A227A | `F1` | `POP AF` | - | - |
| 0x0A227B | `FD CB 0D 4E` | `indexed-cb-bit {"pc":664187,"length":4,"nextPc":664191,"tag":"indexed-cb-bit","bit":1,"indexRegister":"iy","displacement":13,"mode":"adl","modePrefix":null}` | - | - |
| 0x0A227F | `C8` | `RET Z` | - | 0x0A2280 |
| 0x0A2280 | `F5` | `PUSH AF` | - | - |
| 0x0A2281 | `FD CB 4C C6` | `indexed-cb-set {"pc":664193,"length":4,"nextPc":664197,"tag":"indexed-cb-set","bit":0,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null}` | - | - |
| 0x0A2285 | `3E 02` | `LD A,0x02` | - | - |
| 0x0A2287 | `FD CB 4C 6E` | `indexed-cb-bit {"pc":664199,"length":4,"nextPc":664203,"tag":"indexed-cb-bit","bit":5,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null}` | - | - |
| 0x0A228B | `CC 89 67 02` | `CALL Z,0x026789` | 0x026789 | 0x0A228F |
| 0x0A228F | `FD CB 4C 86` | `indexed-cb-res {"pc":664207,"length":4,"nextPc":664211,"tag":"indexed-cb-res","bit":0,"indexRegister":"iy","displacement":76,"mode":"adl","modePrefix":null}` | - | - |
| 0x0A2293 | `C1` | `POP BC` | - | - |
| 0x0A2294 | `3A 05 25 D0` | `LD A,(0xD02505)` | - | - |
| 0x0A2298 | `90` | `SUB B` | - | - |
| 0x0A2299 | `CD 37 2A 0A` | `CALL 0x0A2A37` | 0x0A2A37 | 0x0A229D |
| 0x0A229D | `78` | `LD A,B` | - | - |
| 0x0A229E | `E5` | `PUSH HL` | - | - |
| 0x0A229F | `C1` | `POP BC` | - | - |
| 0x0A22A0 | `CD 37 2A 0A` | `CALL 0x0A2A37` | 0x0A2A37 | 0x0A22A4 |
| 0x0A22A4 | `11 C0 06 D0` | `LD DE,0xD006C0` | - | - |
| 0x0A22A8 | `19` | `ADD HL,DE` | - | - |
| 0x0A22A9 | `E5` | `PUSH HL` | - | - |
| 0x0A22AA | `D1` | `POP DE` | - | - |
| 0x0A22AB | `13` | `INC DE` | - | - |
| 0x0A22AC | `36 20` | `LD (HL),0x20` | - | - |
| 0x0A22AE | `ED B0` | `LDIR` | - | - |
| 0x0A22B0 | `C9` | `RET` | - | - |

### 0x0A2A20-0x0A2A45

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x0A2A20 | `17` | `RLA` | - | - |
| 0x0A2A21 | `0A` | `LD A,(BC)` | - | - |
| 0x0A2A22 | `E1` | `POP HL` | - | - |
| 0x0A2A23 | `40 22 95 05` | `LD HL,(0x000595)` | - | - |
| 0x0A2A27 | `C9` | `RET` | - | - |
| 0x0A2A28 | `11 AA 07 D0` | `LD DE,0xD007AA` | - | - |
| 0x0A2A2C | `21 9A 2A D0` | `LD HL,0xD02A9A` | - | - |
| 0x0A2A30 | `01 1A 00 00` | `LD BC,0x00001A` | - | - |
| 0x0A2A34 | `ED B0` | `LDIR` | - | - |
| 0x0A2A36 | `C9` | `RET` | - | - |
| 0x0A2A37 | `6F` | `LD L,A` | - | - |
| 0x0A2A38 | `26 1A` | `LD H,0x1A` | - | - |
| 0x0A2A3A | `ED 6C` | `mlt {"pc":666170,"length":2,"nextPc":666172,"tag":"mlt","reg":"hl","mode":"adl","modePrefix":null}` | - | - |
| 0x0A2A3C | `B7` | `OR A` | - | - |
| 0x0A2A3D | `C9` | `RET` | - | - |
| 0x0A2A3E | `CD 68 2A 0A` | `CALL 0x0A2A68` | 0x0A2A68 | 0x0A2A42 |
| 0x0A2A42 | `2B` | `DEC HL` | - | - |
| 0x0A2A43 | `7E` | `LD A,(HL)` | - | - |
| 0x0A2A44 | `C9` | `RET` | - | - |

### 0x0A22A4-0x0A22B1

| PC | Bytes | Decode | Target | Fallthrough |
|---|---|---|---|---|
| 0x0A22A4 | `11 C0 06 D0` | `LD DE,0xD006C0` | - | - |
| 0x0A22A8 | `19` | `ADD HL,DE` | - | - |
| 0x0A22A9 | `E5` | `PUSH HL` | - | - |
| 0x0A22AA | `D1` | `POP DE` | - | - |
| 0x0A22AB | `13` | `INC DE` | - | - |
| 0x0A22AC | `36 20` | `LD (HL),0x20` | - | - |
| 0x0A22AE | `ED B0` | `LDIR` | - | - |
| 0x0A22B0 | `C9` | `RET` | - | - |

## Compact Evidence

```json
{
  "before": {
    "status": "Coldboot complete. OS event loop is ready.",
    "lastPc": "0x08C331",
    "cpu": {
      "pc": "0x0019B5",
      "sp": "0xD1A866",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x1054",
      "bc": "0x000000",
      "de": "0xD2A815",
      "hl": "0xD1A8A3",
      "f": "0x54",
      "halted": true,
      "iff1": 0,
      "iff2": 0,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00587": "0x00",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D000C2": "0x00",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A28": "0x00",
      "D02A29": "0x0000",
      "D02A40": "0xD2A83E",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D0059C": "0xD4202C",
      "D005A0": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D02590": "0xD3FE81"
    }
  },
  "after": {
    "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
    "lastPc": "0x202020",
    "cpu": {
      "pc": "0x0A22A4",
      "sp": "0xD1A854",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "af": "0x0040",
      "bc": "0x000000",
      "de": "0xD006C1",
      "hl": "0xD006C0",
      "f": "0x40",
      "halted": false,
      "iff1": 1,
      "iff2": 1,
      "mbase": 208,
      "madl": 1
    },
    "fields": {
      "D0058C": "0xFF",
      "D0058D": "0xFF",
      "D0058E": "0xFF",
      "D00587": "0x00",
      "D00080": "0xF7",
      "D0009F": "0xFF",
      "D000C2": "0xFF",
      "D0243A": "0x202020",
      "D0243D": "0x202020",
      "D02A28": "0x20",
      "D02A29": "0x2020",
      "D02A40": "0x202020",
      "D00121": "0xFFFFFF",
      "D00124": "0xFF",
      "D0059C": "0xFFFFFF",
      "D005A0": "0xFF",
      "D007CA": "0x202020",
      "D008E0": "0x202020",
      "D02590": "0x202020"
    },
    "stackTop": [
      {
        "addr": "0xD1A854",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A857",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85A",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A85D",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A860",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A863",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A866",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A869",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A86C",
        "value": "0x202020"
      },
      {
        "addr": "0xD1A86F",
        "value": "0x202020"
      }
    ],
    "d006c0": {
      "bytes": [
        "0xFF",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20",
        "0x20"
      ],
      "ascii": ".                               "
    },
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "clear-bulk-clear-body",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "steps": 7366,
      "termination": "missing_block",
      "wipes": 0,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D02590": 2105376,
      "D000C2": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "vramPeak": 8585,
      "vramCurrent": 76800
    }
  },
  "record": {
    "totalBlocks": 7351,
    "counts": {
      "caller058a16": 1,
      "call0a223a": 1,
      "bridge0a2a37": 9,
      "tail0a22a4": 1
    },
    "firstSamples": {
      "call0a223a": {
        "block": 4939,
        "pc": "0x0A223A",
        "prevPc": "0x058A16",
        "cpu": {
          "pc": "0x0A223A",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
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
        "windows": {}
      },
      "bridge0a2a37": {
        "block": 365,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0x0A2389"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A848",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x000075"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x05C819"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A857",
            "value": "0x00FFFF"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x000010"
          }
        ],
        "windows": {}
      },
      "tail0a22a4": {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
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
        "windows": {}
      }
    },
    "focusEvents": [
      {
        "block": 364,
        "pc": "0x0A237E",
        "prevPc": "0x05C815",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x05C819"
        }
      },
      {
        "block": 365,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A842",
          "value": "0x0A2389"
        }
      },
      {
        "block": 366,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A845",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A845",
          "value": "0xD2A815"
        }
      },
      {
        "block": 386,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xE010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83C",
          "value": "0x0A17AE"
        }
      },
      {
        "block": 387,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A830",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A830",
          "value": "0x0A2389"
        }
      },
      {
        "block": 388,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A833",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x20",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A833",
          "value": "0xD2A83E"
        }
      },
      {
        "block": 960,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A848",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A848",
          "value": "0x0A17AE"
        }
      },
      {
        "block": 961,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2A815",
          "hl": "0x00FFFF",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83C",
          "value": "0x0A2389"
        }
      },
      {
        "block": 962,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A83F",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A815",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83F",
          "value": "0xD2A815"
        }
      },
      {
        "block": 2330,
        "pc": "0x0A237E",
        "prevPc": "0x05C815",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000F00",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x05C819"
        }
      },
      {
        "block": 2331,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A842",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0075",
          "bc": "0x000F00",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x75",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A842",
          "value": "0x0A2389"
        }
      },
      {
        "block": 2332,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A845",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000F00",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A845",
          "value": "0xD2A83E"
        }
      },
      {
        "block": 2352,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xE010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83C",
          "value": "0x0A17AE"
        }
      },
      {
        "block": 2353,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A830",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A830",
          "value": "0x0A2389"
        }
      },
      {
        "block": 2354,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A833",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A833",
          "value": "0xD2A83E"
        }
      },
      {
        "block": 2948,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A836",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xE010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A836",
          "value": "0x0A17AE"
        }
      },
      {
        "block": 2949,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A82A",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0010",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0xD100CC",
          "f": "0x10",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A82A",
          "value": "0x0A2389"
        }
      },
      {
        "block": 2950,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A82D",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2A83E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x00",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A82D",
          "value": "0xD2A83E"
        }
      },
      {
        "block": 3796,
        "pc": "0x0A237E",
        "prevPc": "0x0A17AA",
        "cpu": {
          "pc": "0x0A237E",
          "sp": "0xD1A848",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2003E",
          "hl": "0x09F7AA",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A848",
          "value": "0x0A17AE"
        }
      },
      {
        "block": 3797,
        "pc": "0x0A2A37",
        "prevPc": "0x0A237E",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A83C",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0031",
          "bc": "0x00E000",
          "de": "0xD2003E",
          "hl": "0x09F7AA",
          "f": "0x31",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83C",
          "value": "0x0A2389"
        }
      },
      {
        "block": 3798,
        "pc": "0x0A2389",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A2389",
          "sp": "0xD1A83F",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x00E000",
          "de": "0xD2003E",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A83F",
          "value": "0xD2003E"
        }
      },
      {
        "block": 4924,
        "pc": "0x058A0C",
        "prevPc": "0x0589EF",
        "cpu": {
          "pc": "0x058A0C",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x09BB",
          "bc": "0x000900",
          "de": "0xD2003E",
          "hl": "0x0585E9",
          "f": "0xBB",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A854",
          "value": "0x08C73D"
        }
      },
      {
        "block": 4925,
        "pc": "0x058A10",
        "prevPc": "0x058A0C",
        "cpu": {
          "pc": "0x058A10",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0942",
          "bc": "0x000900",
          "de": "0xD2003E",
          "hl": "0x0585E9",
          "f": "0x42",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A854",
          "value": "0x08C73D"
        }
      },
      {
        "block": 4937,
        "pc": "0x058A14",
        "prevPc": "0x058221",
        "cpu": {
          "pc": "0x058A14",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A854",
          "value": "0x08C73D"
        }
      },
      {
        "block": 4938,
        "pc": "0x058A16",
        "prevPc": "0x058A14",
        "cpu": {
          "pc": "0x058A16",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A854",
          "value": "0x08C73D"
        }
      },
      {
        "block": 4939,
        "pc": "0x0A223A",
        "prevPc": "0x058A16",
        "cpu": {
          "pc": "0x0A223A",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        }
      },
      {
        "block": 4940,
        "pc": "0x0A235E",
        "prevPc": "0x0A223A",
        "cpu": {
          "pc": "0x0A235E",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x0A223E"
        }
      },
      {
        "block": 4941,
        "pc": "0x0A223E",
        "prevPc": "0x0A235E",
        "cpu": {
          "pc": "0x0A223E",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x094A",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x4A",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        }
      },
      {
        "block": 4944,
        "pc": "0x0A2247",
        "prevPc": "0x0800BD",
        "cpu": {
          "pc": "0x0A2247",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x5C",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 4945,
        "pc": "0x0A2251",
        "prevPc": "0x0A2247",
        "cpu": {
          "pc": "0x0A2251",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x5C",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 4946,
        "pc": "0x0A2254",
        "prevPc": "0x0A2251",
        "cpu": {
          "pc": "0x0A2254",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 4947,
        "pc": "0x0A225A",
        "prevPc": "0x0A2254",
        "cpu": {
          "pc": "0x0A225A",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x1E44",
          "bc": "0x000900",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 4948,
        "pc": "0x0A2267",
        "prevPc": "0x0A225A",
        "cpu": {
          "pc": "0x0A2267",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x00B3",
          "bc": "0x001E00",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0xB3",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 4950,
        "pc": "0x0A226B",
        "prevPc": "0x0A2D4C",
        "cpu": {
          "pc": "0x0A226B",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0x001E00",
          "de": "0xD1A8CC",
          "hl": "0xD1A8CC",
          "f": "0x20",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD48204",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 6145,
        "pc": "0x0A227A",
        "prevPc": "0x09EF2E",
        "cpu": {
          "pc": "0x0A227A",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x00004A"
        }
      },
      {
        "block": 6146,
        "pc": "0x0A2280",
        "prevPc": "0x0A227A",
        "cpu": {
          "pc": "0x0A2280",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0018",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x18",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        }
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "cpu": {
          "pc": "0x0A228F",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x001E23",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x000018"
        }
      },
      {
        "block": 7348,
        "pc": "0x0A2A37",
        "prevPc": "0x0A228F",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x0A229D"
        }
      },
      {
        "block": 7349,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A229D",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        }
      },
      {
        "block": 7350,
        "pc": "0x0A2A37",
        "prevPc": "0x0A229D",
        "cpu": {
          "pc": "0x0A2A37",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A84E",
          "value": "0x0A22A4"
        }
      },
      {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A851",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0044",
          "bc": "0x000000",
          "de": "0x00013F",
          "hl": "0x000000",
          "f": "0x44",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D0058C": "0x09",
          "D0058D": "0x0F",
          "D0058E": "0x00",
          "D00587": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D02A29": "0x0000",
          "D02A40": "0xD2A83E",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D0059C": "0xD45A00",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81"
        },
        "stack0": {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        }
      }
    ],
    "zeroTransition": {
      "block": 7350,
      "pc": "0x0A2A37",
      "prevPc": "0x0A229D",
      "reg": "bc",
      "from": "0x000018",
      "to": "0x000000"
    },
    "registerTransitions": [
      {
        "block": 5271,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000BA0",
        "to": "0x000AA0"
      },
      {
        "block": 5272,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000AA0",
        "to": "0x0009A0"
      },
      {
        "block": 5273,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0009A0",
        "to": "0x0008A0"
      },
      {
        "block": 5274,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0008A0",
        "to": "0x0007A0"
      },
      {
        "block": 5275,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0007A0",
        "to": "0x0006A0"
      },
      {
        "block": 5276,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0006A0",
        "to": "0x0005A0"
      },
      {
        "block": 5277,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0005A0",
        "to": "0x0004A0"
      },
      {
        "block": 5278,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0004A0",
        "to": "0x0003A0"
      },
      {
        "block": 5279,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0003A0",
        "to": "0x0002A0"
      },
      {
        "block": 5280,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0002A0",
        "to": "0x0001A0"
      },
      {
        "block": 5281,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0001A0",
        "to": "0x0000A0"
      },
      {
        "block": 5282,
        "pc": "0x09EFEF",
        "prevPc": "0x09EFE8",
        "reg": "bc",
        "from": "0x0000A0",
        "to": "0x000140"
      },
      {
        "block": 5284,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFCB",
        "reg": "bc",
        "from": "0x000140",
        "to": "0x00A0A0"
      },
      {
        "block": 5285,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x00A0A0",
        "to": "0x009FA0"
      },
      {
        "block": 5286,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009FA0",
        "to": "0x009EA0"
      },
      {
        "block": 5287,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009EA0",
        "to": "0x009DA0"
      },
      {
        "block": 5288,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009DA0",
        "to": "0x009CA0"
      },
      {
        "block": 5289,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009CA0",
        "to": "0x009BA0"
      },
      {
        "block": 5290,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009BA0",
        "to": "0x009AA0"
      },
      {
        "block": 5291,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009AA0",
        "to": "0x0099A0"
      },
      {
        "block": 5292,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0099A0",
        "to": "0x0098A0"
      },
      {
        "block": 5293,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0098A0",
        "to": "0x0097A0"
      },
      {
        "block": 5294,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0097A0",
        "to": "0x0096A0"
      },
      {
        "block": 5295,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0096A0",
        "to": "0x0095A0"
      },
      {
        "block": 5296,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0095A0",
        "to": "0x0094A0"
      },
      {
        "block": 5297,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0094A0",
        "to": "0x0093A0"
      },
      {
        "block": 5298,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0093A0",
        "to": "0x0092A0"
      },
      {
        "block": 5299,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0092A0",
        "to": "0x0091A0"
      },
      {
        "block": 5300,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0091A0",
        "to": "0x0090A0"
      },
      {
        "block": 5301,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0090A0",
        "to": "0x008FA0"
      },
      {
        "block": 5302,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008FA0",
        "to": "0x008EA0"
      },
      {
        "block": 5303,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008EA0",
        "to": "0x008DA0"
      },
      {
        "block": 5304,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008DA0",
        "to": "0x008CA0"
      },
      {
        "block": 5305,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008CA0",
        "to": "0x008BA0"
      },
      {
        "block": 5306,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008BA0",
        "to": "0x008AA0"
      },
      {
        "block": 5307,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008AA0",
        "to": "0x0089A0"
      },
      {
        "block": 5308,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0089A0",
        "to": "0x0088A0"
      },
      {
        "block": 5309,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0088A0",
        "to": "0x0087A0"
      },
      {
        "block": 5310,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0087A0",
        "to": "0x0086A0"
      },
      {
        "block": 5311,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0086A0",
        "to": "0x0085A0"
      },
      {
        "block": 5312,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0085A0",
        "to": "0x0084A0"
      },
      {
        "block": 5313,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0084A0",
        "to": "0x0083A0"
      },
      {
        "block": 5314,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0083A0",
        "to": "0x0082A0"
      },
      {
        "block": 5315,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0082A0",
        "to": "0x0081A0"
      },
      {
        "block": 5316,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0081A0",
        "to": "0x0080A0"
      },
      {
        "block": 5317,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0080A0",
        "to": "0x007FA0"
      },
      {
        "block": 5318,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007FA0",
        "to": "0x007EA0"
      },
      {
        "block": 5319,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007EA0",
        "to": "0x007DA0"
      },
      {
        "block": 5320,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007DA0",
        "to": "0x007CA0"
      },
      {
        "block": 5321,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007CA0",
        "to": "0x007BA0"
      },
      {
        "block": 5322,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007BA0",
        "to": "0x007AA0"
      },
      {
        "block": 5323,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007AA0",
        "to": "0x0079A0"
      },
      {
        "block": 5324,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0079A0",
        "to": "0x0078A0"
      },
      {
        "block": 5325,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0078A0",
        "to": "0x0077A0"
      },
      {
        "block": 5326,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0077A0",
        "to": "0x0076A0"
      },
      {
        "block": 5327,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0076A0",
        "to": "0x0075A0"
      },
      {
        "block": 5328,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0075A0",
        "to": "0x0074A0"
      },
      {
        "block": 5329,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0074A0",
        "to": "0x0073A0"
      },
      {
        "block": 5330,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0073A0",
        "to": "0x0072A0"
      },
      {
        "block": 5331,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0072A0",
        "to": "0x0071A0"
      },
      {
        "block": 5332,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0071A0",
        "to": "0x0070A0"
      },
      {
        "block": 5333,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0070A0",
        "to": "0x006FA0"
      },
      {
        "block": 5334,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006FA0",
        "to": "0x006EA0"
      },
      {
        "block": 5335,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006EA0",
        "to": "0x006DA0"
      },
      {
        "block": 5336,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006DA0",
        "to": "0x006CA0"
      },
      {
        "block": 5337,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006CA0",
        "to": "0x006BA0"
      },
      {
        "block": 5338,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006BA0",
        "to": "0x006AA0"
      },
      {
        "block": 5339,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006AA0",
        "to": "0x0069A0"
      },
      {
        "block": 5340,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0069A0",
        "to": "0x0068A0"
      },
      {
        "block": 5341,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0068A0",
        "to": "0x0067A0"
      },
      {
        "block": 5342,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0067A0",
        "to": "0x0066A0"
      },
      {
        "block": 5343,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0066A0",
        "to": "0x0065A0"
      },
      {
        "block": 5344,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0065A0",
        "to": "0x0064A0"
      },
      {
        "block": 5345,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0064A0",
        "to": "0x0063A0"
      },
      {
        "block": 5346,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0063A0",
        "to": "0x0062A0"
      },
      {
        "block": 5347,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0062A0",
        "to": "0x0061A0"
      },
      {
        "block": 5348,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0061A0",
        "to": "0x0060A0"
      },
      {
        "block": 5349,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0060A0",
        "to": "0x005FA0"
      },
      {
        "block": 5350,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005FA0",
        "to": "0x005EA0"
      },
      {
        "block": 5351,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005EA0",
        "to": "0x005DA0"
      },
      {
        "block": 5352,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005DA0",
        "to": "0x005CA0"
      },
      {
        "block": 5353,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005CA0",
        "to": "0x005BA0"
      },
      {
        "block": 5354,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005BA0",
        "to": "0x005AA0"
      },
      {
        "block": 5355,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005AA0",
        "to": "0x0059A0"
      },
      {
        "block": 5356,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0059A0",
        "to": "0x0058A0"
      },
      {
        "block": 5357,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0058A0",
        "to": "0x0057A0"
      },
      {
        "block": 5358,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0057A0",
        "to": "0x0056A0"
      },
      {
        "block": 5359,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0056A0",
        "to": "0x0055A0"
      },
      {
        "block": 5360,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0055A0",
        "to": "0x0054A0"
      },
      {
        "block": 5361,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0054A0",
        "to": "0x0053A0"
      },
      {
        "block": 5362,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0053A0",
        "to": "0x0052A0"
      },
      {
        "block": 5363,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0052A0",
        "to": "0x0051A0"
      },
      {
        "block": 5364,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0051A0",
        "to": "0x0050A0"
      },
      {
        "block": 5365,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0050A0",
        "to": "0x004FA0"
      },
      {
        "block": 5366,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004FA0",
        "to": "0x004EA0"
      },
      {
        "block": 5367,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004EA0",
        "to": "0x004DA0"
      },
      {
        "block": 5368,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004DA0",
        "to": "0x004CA0"
      },
      {
        "block": 5369,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004CA0",
        "to": "0x004BA0"
      },
      {
        "block": 5370,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004BA0",
        "to": "0x004AA0"
      },
      {
        "block": 5371,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004AA0",
        "to": "0x0049A0"
      },
      {
        "block": 5372,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0049A0",
        "to": "0x0048A0"
      },
      {
        "block": 5373,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0048A0",
        "to": "0x0047A0"
      },
      {
        "block": 5374,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0047A0",
        "to": "0x0046A0"
      },
      {
        "block": 5375,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0046A0",
        "to": "0x0045A0"
      },
      {
        "block": 5376,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0045A0",
        "to": "0x0044A0"
      },
      {
        "block": 5377,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0044A0",
        "to": "0x0043A0"
      },
      {
        "block": 5378,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0043A0",
        "to": "0x0042A0"
      },
      {
        "block": 5379,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0042A0",
        "to": "0x0041A0"
      },
      {
        "block": 5380,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0041A0",
        "to": "0x0040A0"
      },
      {
        "block": 5381,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0040A0",
        "to": "0x003FA0"
      },
      {
        "block": 5382,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003FA0",
        "to": "0x003EA0"
      },
      {
        "block": 5383,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003EA0",
        "to": "0x003DA0"
      },
      {
        "block": 5384,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003DA0",
        "to": "0x003CA0"
      },
      {
        "block": 5385,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003CA0",
        "to": "0x003BA0"
      },
      {
        "block": 5386,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003BA0",
        "to": "0x003AA0"
      },
      {
        "block": 5387,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003AA0",
        "to": "0x0039A0"
      },
      {
        "block": 5388,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0039A0",
        "to": "0x0038A0"
      },
      {
        "block": 5389,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0038A0",
        "to": "0x0037A0"
      },
      {
        "block": 5390,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0037A0",
        "to": "0x0036A0"
      },
      {
        "block": 5391,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0036A0",
        "to": "0x0035A0"
      },
      {
        "block": 5392,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0035A0",
        "to": "0x0034A0"
      },
      {
        "block": 5393,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0034A0",
        "to": "0x0033A0"
      },
      {
        "block": 5394,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0033A0",
        "to": "0x0032A0"
      },
      {
        "block": 5395,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0032A0",
        "to": "0x0031A0"
      },
      {
        "block": 5396,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0031A0",
        "to": "0x0030A0"
      },
      {
        "block": 5397,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0030A0",
        "to": "0x002FA0"
      },
      {
        "block": 5398,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002FA0",
        "to": "0x002EA0"
      },
      {
        "block": 5399,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002EA0",
        "to": "0x002DA0"
      },
      {
        "block": 5400,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002DA0",
        "to": "0x002CA0"
      },
      {
        "block": 5401,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002CA0",
        "to": "0x002BA0"
      },
      {
        "block": 5402,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002BA0",
        "to": "0x002AA0"
      },
      {
        "block": 5403,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002AA0",
        "to": "0x0029A0"
      },
      {
        "block": 5404,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0029A0",
        "to": "0x0028A0"
      },
      {
        "block": 5405,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0028A0",
        "to": "0x0027A0"
      },
      {
        "block": 5406,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0027A0",
        "to": "0x0026A0"
      },
      {
        "block": 5407,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0026A0",
        "to": "0x0025A0"
      },
      {
        "block": 5408,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0025A0",
        "to": "0x0024A0"
      },
      {
        "block": 5409,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0024A0",
        "to": "0x0023A0"
      },
      {
        "block": 5410,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0023A0",
        "to": "0x0022A0"
      },
      {
        "block": 5411,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0022A0",
        "to": "0x0021A0"
      },
      {
        "block": 5412,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0021A0",
        "to": "0x0020A0"
      },
      {
        "block": 5413,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0020A0",
        "to": "0x001FA0"
      },
      {
        "block": 5414,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001FA0",
        "to": "0x001EA0"
      },
      {
        "block": 5415,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001EA0",
        "to": "0x001DA0"
      },
      {
        "block": 5416,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001DA0",
        "to": "0x001CA0"
      },
      {
        "block": 5417,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001CA0",
        "to": "0x001BA0"
      },
      {
        "block": 5418,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001BA0",
        "to": "0x001AA0"
      },
      {
        "block": 5419,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001AA0",
        "to": "0x0019A0"
      },
      {
        "block": 5420,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0019A0",
        "to": "0x0018A0"
      },
      {
        "block": 5421,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0018A0",
        "to": "0x0017A0"
      },
      {
        "block": 5422,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0017A0",
        "to": "0x0016A0"
      },
      {
        "block": 5423,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0016A0",
        "to": "0x0015A0"
      },
      {
        "block": 5424,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0015A0",
        "to": "0x0014A0"
      },
      {
        "block": 5425,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0014A0",
        "to": "0x0013A0"
      },
      {
        "block": 5426,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0013A0",
        "to": "0x0012A0"
      },
      {
        "block": 5427,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0012A0",
        "to": "0x0011A0"
      },
      {
        "block": 5428,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0011A0",
        "to": "0x0010A0"
      },
      {
        "block": 5429,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0010A0",
        "to": "0x000FA0"
      },
      {
        "block": 5430,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000FA0",
        "to": "0x000EA0"
      },
      {
        "block": 5431,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000EA0",
        "to": "0x000DA0"
      },
      {
        "block": 5432,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000DA0",
        "to": "0x000CA0"
      },
      {
        "block": 5433,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000CA0",
        "to": "0x000BA0"
      },
      {
        "block": 5434,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000BA0",
        "to": "0x000AA0"
      },
      {
        "block": 5435,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000AA0",
        "to": "0x0009A0"
      },
      {
        "block": 5436,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0009A0",
        "to": "0x0008A0"
      },
      {
        "block": 5437,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0008A0",
        "to": "0x0007A0"
      },
      {
        "block": 5438,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0007A0",
        "to": "0x0006A0"
      },
      {
        "block": 5439,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0006A0",
        "to": "0x0005A0"
      },
      {
        "block": 5440,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0005A0",
        "to": "0x0004A0"
      },
      {
        "block": 5441,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0004A0",
        "to": "0x0003A0"
      },
      {
        "block": 5442,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0003A0",
        "to": "0x0002A0"
      },
      {
        "block": 5443,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0002A0",
        "to": "0x0001A0"
      },
      {
        "block": 5444,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0001A0",
        "to": "0x0000A0"
      },
      {
        "block": 5445,
        "pc": "0x09EFEF",
        "prevPc": "0x09EFE8",
        "reg": "bc",
        "from": "0x0000A0",
        "to": "0x000140"
      },
      {
        "block": 5447,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFCB",
        "reg": "bc",
        "from": "0x000140",
        "to": "0x00A0A0"
      },
      {
        "block": 5448,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x00A0A0",
        "to": "0x009FA0"
      },
      {
        "block": 5449,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009FA0",
        "to": "0x009EA0"
      },
      {
        "block": 5450,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009EA0",
        "to": "0x009DA0"
      },
      {
        "block": 5451,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009DA0",
        "to": "0x009CA0"
      },
      {
        "block": 5452,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009CA0",
        "to": "0x009BA0"
      },
      {
        "block": 5453,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009BA0",
        "to": "0x009AA0"
      },
      {
        "block": 5454,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009AA0",
        "to": "0x0099A0"
      },
      {
        "block": 5455,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0099A0",
        "to": "0x0098A0"
      },
      {
        "block": 5456,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0098A0",
        "to": "0x0097A0"
      },
      {
        "block": 5457,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0097A0",
        "to": "0x0096A0"
      },
      {
        "block": 5458,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0096A0",
        "to": "0x0095A0"
      },
      {
        "block": 5459,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0095A0",
        "to": "0x0094A0"
      },
      {
        "block": 5460,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0094A0",
        "to": "0x0093A0"
      },
      {
        "block": 5461,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0093A0",
        "to": "0x0092A0"
      },
      {
        "block": 5462,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0092A0",
        "to": "0x0091A0"
      },
      {
        "block": 5463,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0091A0",
        "to": "0x0090A0"
      },
      {
        "block": 5464,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0090A0",
        "to": "0x008FA0"
      },
      {
        "block": 5465,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008FA0",
        "to": "0x008EA0"
      },
      {
        "block": 5466,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008EA0",
        "to": "0x008DA0"
      },
      {
        "block": 5467,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008DA0",
        "to": "0x008CA0"
      },
      {
        "block": 5468,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008CA0",
        "to": "0x008BA0"
      },
      {
        "block": 5469,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008BA0",
        "to": "0x008AA0"
      },
      {
        "block": 5470,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008AA0",
        "to": "0x0089A0"
      },
      {
        "block": 5471,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0089A0",
        "to": "0x0088A0"
      },
      {
        "block": 5472,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0088A0",
        "to": "0x0087A0"
      },
      {
        "block": 5473,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0087A0",
        "to": "0x0086A0"
      },
      {
        "block": 5474,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0086A0",
        "to": "0x0085A0"
      },
      {
        "block": 5475,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0085A0",
        "to": "0x0084A0"
      },
      {
        "block": 5476,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0084A0",
        "to": "0x0083A0"
      },
      {
        "block": 5477,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0083A0",
        "to": "0x0082A0"
      },
      {
        "block": 5478,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0082A0",
        "to": "0x0081A0"
      },
      {
        "block": 5479,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0081A0",
        "to": "0x0080A0"
      },
      {
        "block": 5480,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0080A0",
        "to": "0x007FA0"
      },
      {
        "block": 5481,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007FA0",
        "to": "0x007EA0"
      },
      {
        "block": 5482,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007EA0",
        "to": "0x007DA0"
      },
      {
        "block": 5483,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007DA0",
        "to": "0x007CA0"
      },
      {
        "block": 5484,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007CA0",
        "to": "0x007BA0"
      },
      {
        "block": 5485,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007BA0",
        "to": "0x007AA0"
      },
      {
        "block": 5486,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007AA0",
        "to": "0x0079A0"
      },
      {
        "block": 5487,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0079A0",
        "to": "0x0078A0"
      },
      {
        "block": 5488,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0078A0",
        "to": "0x0077A0"
      },
      {
        "block": 5489,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0077A0",
        "to": "0x0076A0"
      },
      {
        "block": 5490,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0076A0",
        "to": "0x0075A0"
      },
      {
        "block": 5491,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0075A0",
        "to": "0x0074A0"
      },
      {
        "block": 5492,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0074A0",
        "to": "0x0073A0"
      },
      {
        "block": 5493,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0073A0",
        "to": "0x0072A0"
      },
      {
        "block": 5494,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0072A0",
        "to": "0x0071A0"
      },
      {
        "block": 5495,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0071A0",
        "to": "0x0070A0"
      },
      {
        "block": 5496,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0070A0",
        "to": "0x006FA0"
      },
      {
        "block": 5497,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006FA0",
        "to": "0x006EA0"
      },
      {
        "block": 5498,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006EA0",
        "to": "0x006DA0"
      },
      {
        "block": 5499,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006DA0",
        "to": "0x006CA0"
      },
      {
        "block": 5500,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006CA0",
        "to": "0x006BA0"
      },
      {
        "block": 5501,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006BA0",
        "to": "0x006AA0"
      },
      {
        "block": 5502,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006AA0",
        "to": "0x0069A0"
      },
      {
        "block": 5503,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0069A0",
        "to": "0x0068A0"
      },
      {
        "block": 5504,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0068A0",
        "to": "0x0067A0"
      },
      {
        "block": 5505,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0067A0",
        "to": "0x0066A0"
      },
      {
        "block": 5506,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0066A0",
        "to": "0x0065A0"
      },
      {
        "block": 5507,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0065A0",
        "to": "0x0064A0"
      },
      {
        "block": 5508,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0064A0",
        "to": "0x0063A0"
      },
      {
        "block": 5509,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0063A0",
        "to": "0x0062A0"
      },
      {
        "block": 5510,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0062A0",
        "to": "0x0061A0"
      },
      {
        "block": 5511,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0061A0",
        "to": "0x0060A0"
      },
      {
        "block": 5512,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0060A0",
        "to": "0x005FA0"
      },
      {
        "block": 5513,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005FA0",
        "to": "0x005EA0"
      },
      {
        "block": 5514,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005EA0",
        "to": "0x005DA0"
      },
      {
        "block": 5515,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005DA0",
        "to": "0x005CA0"
      },
      {
        "block": 5516,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005CA0",
        "to": "0x005BA0"
      },
      {
        "block": 5517,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005BA0",
        "to": "0x005AA0"
      },
      {
        "block": 5518,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005AA0",
        "to": "0x0059A0"
      },
      {
        "block": 5519,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0059A0",
        "to": "0x0058A0"
      },
      {
        "block": 5520,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0058A0",
        "to": "0x0057A0"
      },
      {
        "block": 5521,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0057A0",
        "to": "0x0056A0"
      },
      {
        "block": 5522,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0056A0",
        "to": "0x0055A0"
      },
      {
        "block": 5523,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0055A0",
        "to": "0x0054A0"
      },
      {
        "block": 5524,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0054A0",
        "to": "0x0053A0"
      },
      {
        "block": 5525,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0053A0",
        "to": "0x0052A0"
      },
      {
        "block": 5526,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0052A0",
        "to": "0x0051A0"
      },
      {
        "block": 5527,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0051A0",
        "to": "0x0050A0"
      },
      {
        "block": 5528,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0050A0",
        "to": "0x004FA0"
      },
      {
        "block": 5529,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004FA0",
        "to": "0x004EA0"
      },
      {
        "block": 5530,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004EA0",
        "to": "0x004DA0"
      },
      {
        "block": 5531,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004DA0",
        "to": "0x004CA0"
      },
      {
        "block": 5532,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004CA0",
        "to": "0x004BA0"
      },
      {
        "block": 5533,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004BA0",
        "to": "0x004AA0"
      },
      {
        "block": 5534,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004AA0",
        "to": "0x0049A0"
      },
      {
        "block": 5535,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0049A0",
        "to": "0x0048A0"
      },
      {
        "block": 5536,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0048A0",
        "to": "0x0047A0"
      },
      {
        "block": 5537,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0047A0",
        "to": "0x0046A0"
      },
      {
        "block": 5538,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0046A0",
        "to": "0x0045A0"
      },
      {
        "block": 5539,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0045A0",
        "to": "0x0044A0"
      },
      {
        "block": 5540,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0044A0",
        "to": "0x0043A0"
      },
      {
        "block": 5541,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0043A0",
        "to": "0x0042A0"
      },
      {
        "block": 5542,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0042A0",
        "to": "0x0041A0"
      },
      {
        "block": 5543,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0041A0",
        "to": "0x0040A0"
      },
      {
        "block": 5544,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0040A0",
        "to": "0x003FA0"
      },
      {
        "block": 5545,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003FA0",
        "to": "0x003EA0"
      },
      {
        "block": 5546,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003EA0",
        "to": "0x003DA0"
      },
      {
        "block": 5547,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003DA0",
        "to": "0x003CA0"
      },
      {
        "block": 5548,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003CA0",
        "to": "0x003BA0"
      },
      {
        "block": 5549,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003BA0",
        "to": "0x003AA0"
      },
      {
        "block": 5550,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003AA0",
        "to": "0x0039A0"
      },
      {
        "block": 5551,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0039A0",
        "to": "0x0038A0"
      },
      {
        "block": 5552,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0038A0",
        "to": "0x0037A0"
      },
      {
        "block": 5553,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0037A0",
        "to": "0x0036A0"
      },
      {
        "block": 5554,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0036A0",
        "to": "0x0035A0"
      },
      {
        "block": 5555,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0035A0",
        "to": "0x0034A0"
      },
      {
        "block": 5556,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0034A0",
        "to": "0x0033A0"
      },
      {
        "block": 5557,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0033A0",
        "to": "0x0032A0"
      },
      {
        "block": 5558,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0032A0",
        "to": "0x0031A0"
      },
      {
        "block": 5559,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0031A0",
        "to": "0x0030A0"
      },
      {
        "block": 5560,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0030A0",
        "to": "0x002FA0"
      },
      {
        "block": 5561,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002FA0",
        "to": "0x002EA0"
      },
      {
        "block": 5562,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002EA0",
        "to": "0x002DA0"
      },
      {
        "block": 5563,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002DA0",
        "to": "0x002CA0"
      },
      {
        "block": 5564,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002CA0",
        "to": "0x002BA0"
      },
      {
        "block": 5565,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002BA0",
        "to": "0x002AA0"
      },
      {
        "block": 5566,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002AA0",
        "to": "0x0029A0"
      },
      {
        "block": 5567,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0029A0",
        "to": "0x0028A0"
      },
      {
        "block": 5568,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0028A0",
        "to": "0x0027A0"
      },
      {
        "block": 5569,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0027A0",
        "to": "0x0026A0"
      },
      {
        "block": 5570,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0026A0",
        "to": "0x0025A0"
      },
      {
        "block": 5571,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0025A0",
        "to": "0x0024A0"
      },
      {
        "block": 5572,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0024A0",
        "to": "0x0023A0"
      },
      {
        "block": 5573,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0023A0",
        "to": "0x0022A0"
      },
      {
        "block": 5574,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0022A0",
        "to": "0x0021A0"
      },
      {
        "block": 5575,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0021A0",
        "to": "0x0020A0"
      },
      {
        "block": 5576,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0020A0",
        "to": "0x001FA0"
      },
      {
        "block": 5577,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001FA0",
        "to": "0x001EA0"
      },
      {
        "block": 5578,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001EA0",
        "to": "0x001DA0"
      },
      {
        "block": 5579,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001DA0",
        "to": "0x001CA0"
      },
      {
        "block": 5580,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001CA0",
        "to": "0x001BA0"
      },
      {
        "block": 5581,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001BA0",
        "to": "0x001AA0"
      },
      {
        "block": 5582,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001AA0",
        "to": "0x0019A0"
      },
      {
        "block": 5583,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0019A0",
        "to": "0x0018A0"
      },
      {
        "block": 5584,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0018A0",
        "to": "0x0017A0"
      },
      {
        "block": 5585,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0017A0",
        "to": "0x0016A0"
      },
      {
        "block": 5586,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0016A0",
        "to": "0x0015A0"
      },
      {
        "block": 5587,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0015A0",
        "to": "0x0014A0"
      },
      {
        "block": 5588,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0014A0",
        "to": "0x0013A0"
      },
      {
        "block": 5589,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0013A0",
        "to": "0x0012A0"
      },
      {
        "block": 5590,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0012A0",
        "to": "0x0011A0"
      },
      {
        "block": 5591,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0011A0",
        "to": "0x0010A0"
      },
      {
        "block": 5592,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0010A0",
        "to": "0x000FA0"
      },
      {
        "block": 5593,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000FA0",
        "to": "0x000EA0"
      },
      {
        "block": 5594,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000EA0",
        "to": "0x000DA0"
      },
      {
        "block": 5595,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000DA0",
        "to": "0x000CA0"
      },
      {
        "block": 5596,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000CA0",
        "to": "0x000BA0"
      },
      {
        "block": 5597,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000BA0",
        "to": "0x000AA0"
      },
      {
        "block": 5598,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000AA0",
        "to": "0x0009A0"
      },
      {
        "block": 5599,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0009A0",
        "to": "0x0008A0"
      },
      {
        "block": 5600,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0008A0",
        "to": "0x0007A0"
      },
      {
        "block": 5601,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0007A0",
        "to": "0x0006A0"
      },
      {
        "block": 5602,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0006A0",
        "to": "0x0005A0"
      },
      {
        "block": 5603,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0005A0",
        "to": "0x0004A0"
      },
      {
        "block": 5604,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0004A0",
        "to": "0x0003A0"
      },
      {
        "block": 5605,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0003A0",
        "to": "0x0002A0"
      },
      {
        "block": 5606,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0002A0",
        "to": "0x0001A0"
      },
      {
        "block": 5607,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0001A0",
        "to": "0x0000A0"
      },
      {
        "block": 5608,
        "pc": "0x09EFEF",
        "prevPc": "0x09EFE8",
        "reg": "bc",
        "from": "0x0000A0",
        "to": "0x000140"
      },
      {
        "block": 5610,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFCB",
        "reg": "bc",
        "from": "0x000140",
        "to": "0x00A0A0"
      },
      {
        "block": 5611,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x00A0A0",
        "to": "0x009FA0"
      },
      {
        "block": 5612,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009FA0",
        "to": "0x009EA0"
      },
      {
        "block": 5613,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009EA0",
        "to": "0x009DA0"
      },
      {
        "block": 5614,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009DA0",
        "to": "0x009CA0"
      },
      {
        "block": 5615,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009CA0",
        "to": "0x009BA0"
      },
      {
        "block": 5616,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009BA0",
        "to": "0x009AA0"
      },
      {
        "block": 5617,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009AA0",
        "to": "0x0099A0"
      },
      {
        "block": 5618,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0099A0",
        "to": "0x0098A0"
      },
      {
        "block": 5619,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0098A0",
        "to": "0x0097A0"
      },
      {
        "block": 5620,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0097A0",
        "to": "0x0096A0"
      },
      {
        "block": 5621,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0096A0",
        "to": "0x0095A0"
      },
      {
        "block": 5622,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0095A0",
        "to": "0x0094A0"
      },
      {
        "block": 5623,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0094A0",
        "to": "0x0093A0"
      },
      {
        "block": 5624,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0093A0",
        "to": "0x0092A0"
      },
      {
        "block": 5625,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0092A0",
        "to": "0x0091A0"
      },
      {
        "block": 5626,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0091A0",
        "to": "0x0090A0"
      },
      {
        "block": 5627,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0090A0",
        "to": "0x008FA0"
      },
      {
        "block": 5628,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008FA0",
        "to": "0x008EA0"
      },
      {
        "block": 5629,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008EA0",
        "to": "0x008DA0"
      },
      {
        "block": 5630,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008DA0",
        "to": "0x008CA0"
      },
      {
        "block": 5631,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008CA0",
        "to": "0x008BA0"
      },
      {
        "block": 5632,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008BA0",
        "to": "0x008AA0"
      },
      {
        "block": 5633,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008AA0",
        "to": "0x0089A0"
      },
      {
        "block": 5634,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0089A0",
        "to": "0x0088A0"
      },
      {
        "block": 5635,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0088A0",
        "to": "0x0087A0"
      },
      {
        "block": 5636,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0087A0",
        "to": "0x0086A0"
      },
      {
        "block": 5637,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0086A0",
        "to": "0x0085A0"
      },
      {
        "block": 5638,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0085A0",
        "to": "0x0084A0"
      },
      {
        "block": 5639,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0084A0",
        "to": "0x0083A0"
      },
      {
        "block": 5640,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0083A0",
        "to": "0x0082A0"
      },
      {
        "block": 5641,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0082A0",
        "to": "0x0081A0"
      },
      {
        "block": 5642,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0081A0",
        "to": "0x0080A0"
      },
      {
        "block": 5643,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0080A0",
        "to": "0x007FA0"
      },
      {
        "block": 5644,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007FA0",
        "to": "0x007EA0"
      },
      {
        "block": 5645,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007EA0",
        "to": "0x007DA0"
      },
      {
        "block": 5646,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007DA0",
        "to": "0x007CA0"
      },
      {
        "block": 5647,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007CA0",
        "to": "0x007BA0"
      },
      {
        "block": 5648,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007BA0",
        "to": "0x007AA0"
      },
      {
        "block": 5649,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007AA0",
        "to": "0x0079A0"
      },
      {
        "block": 5650,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0079A0",
        "to": "0x0078A0"
      },
      {
        "block": 5651,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0078A0",
        "to": "0x0077A0"
      },
      {
        "block": 5652,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0077A0",
        "to": "0x0076A0"
      },
      {
        "block": 5653,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0076A0",
        "to": "0x0075A0"
      },
      {
        "block": 5654,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0075A0",
        "to": "0x0074A0"
      },
      {
        "block": 5655,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0074A0",
        "to": "0x0073A0"
      },
      {
        "block": 5656,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0073A0",
        "to": "0x0072A0"
      },
      {
        "block": 5657,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0072A0",
        "to": "0x0071A0"
      },
      {
        "block": 5658,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0071A0",
        "to": "0x0070A0"
      },
      {
        "block": 5659,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0070A0",
        "to": "0x006FA0"
      },
      {
        "block": 5660,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006FA0",
        "to": "0x006EA0"
      },
      {
        "block": 5661,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006EA0",
        "to": "0x006DA0"
      },
      {
        "block": 5662,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006DA0",
        "to": "0x006CA0"
      },
      {
        "block": 5663,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006CA0",
        "to": "0x006BA0"
      },
      {
        "block": 5664,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006BA0",
        "to": "0x006AA0"
      },
      {
        "block": 5665,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006AA0",
        "to": "0x0069A0"
      },
      {
        "block": 5666,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0069A0",
        "to": "0x0068A0"
      },
      {
        "block": 5667,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0068A0",
        "to": "0x0067A0"
      },
      {
        "block": 5668,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0067A0",
        "to": "0x0066A0"
      },
      {
        "block": 5669,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0066A0",
        "to": "0x0065A0"
      },
      {
        "block": 5670,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0065A0",
        "to": "0x0064A0"
      },
      {
        "block": 5671,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0064A0",
        "to": "0x0063A0"
      },
      {
        "block": 5672,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0063A0",
        "to": "0x0062A0"
      },
      {
        "block": 5673,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0062A0",
        "to": "0x0061A0"
      },
      {
        "block": 5674,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0061A0",
        "to": "0x0060A0"
      },
      {
        "block": 5675,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0060A0",
        "to": "0x005FA0"
      },
      {
        "block": 5676,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005FA0",
        "to": "0x005EA0"
      },
      {
        "block": 5677,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005EA0",
        "to": "0x005DA0"
      },
      {
        "block": 5678,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005DA0",
        "to": "0x005CA0"
      },
      {
        "block": 5679,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005CA0",
        "to": "0x005BA0"
      },
      {
        "block": 5680,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005BA0",
        "to": "0x005AA0"
      },
      {
        "block": 5681,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005AA0",
        "to": "0x0059A0"
      },
      {
        "block": 5682,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0059A0",
        "to": "0x0058A0"
      },
      {
        "block": 5683,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0058A0",
        "to": "0x0057A0"
      },
      {
        "block": 5684,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0057A0",
        "to": "0x0056A0"
      },
      {
        "block": 5685,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0056A0",
        "to": "0x0055A0"
      },
      {
        "block": 5686,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0055A0",
        "to": "0x0054A0"
      },
      {
        "block": 5687,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0054A0",
        "to": "0x0053A0"
      },
      {
        "block": 5688,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0053A0",
        "to": "0x0052A0"
      },
      {
        "block": 5689,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0052A0",
        "to": "0x0051A0"
      },
      {
        "block": 5690,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0051A0",
        "to": "0x0050A0"
      },
      {
        "block": 5691,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0050A0",
        "to": "0x004FA0"
      },
      {
        "block": 5692,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004FA0",
        "to": "0x004EA0"
      },
      {
        "block": 5693,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004EA0",
        "to": "0x004DA0"
      },
      {
        "block": 5694,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004DA0",
        "to": "0x004CA0"
      },
      {
        "block": 5695,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004CA0",
        "to": "0x004BA0"
      },
      {
        "block": 5696,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004BA0",
        "to": "0x004AA0"
      },
      {
        "block": 5697,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004AA0",
        "to": "0x0049A0"
      },
      {
        "block": 5698,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0049A0",
        "to": "0x0048A0"
      },
      {
        "block": 5699,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0048A0",
        "to": "0x0047A0"
      },
      {
        "block": 5700,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0047A0",
        "to": "0x0046A0"
      },
      {
        "block": 5701,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0046A0",
        "to": "0x0045A0"
      },
      {
        "block": 5702,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0045A0",
        "to": "0x0044A0"
      },
      {
        "block": 5703,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0044A0",
        "to": "0x0043A0"
      },
      {
        "block": 5704,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0043A0",
        "to": "0x0042A0"
      },
      {
        "block": 5705,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0042A0",
        "to": "0x0041A0"
      },
      {
        "block": 5706,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0041A0",
        "to": "0x0040A0"
      },
      {
        "block": 5707,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0040A0",
        "to": "0x003FA0"
      },
      {
        "block": 5708,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003FA0",
        "to": "0x003EA0"
      },
      {
        "block": 5709,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003EA0",
        "to": "0x003DA0"
      },
      {
        "block": 5710,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003DA0",
        "to": "0x003CA0"
      },
      {
        "block": 5711,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003CA0",
        "to": "0x003BA0"
      },
      {
        "block": 5712,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003BA0",
        "to": "0x003AA0"
      },
      {
        "block": 5713,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003AA0",
        "to": "0x0039A0"
      },
      {
        "block": 5714,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0039A0",
        "to": "0x0038A0"
      },
      {
        "block": 5715,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0038A0",
        "to": "0x0037A0"
      },
      {
        "block": 5716,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0037A0",
        "to": "0x0036A0"
      },
      {
        "block": 5717,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0036A0",
        "to": "0x0035A0"
      },
      {
        "block": 5718,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0035A0",
        "to": "0x0034A0"
      },
      {
        "block": 5719,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0034A0",
        "to": "0x0033A0"
      },
      {
        "block": 5720,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0033A0",
        "to": "0x0032A0"
      },
      {
        "block": 5721,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0032A0",
        "to": "0x0031A0"
      },
      {
        "block": 5722,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0031A0",
        "to": "0x0030A0"
      },
      {
        "block": 5723,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0030A0",
        "to": "0x002FA0"
      },
      {
        "block": 5724,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002FA0",
        "to": "0x002EA0"
      },
      {
        "block": 5725,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002EA0",
        "to": "0x002DA0"
      },
      {
        "block": 5726,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002DA0",
        "to": "0x002CA0"
      },
      {
        "block": 5727,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002CA0",
        "to": "0x002BA0"
      },
      {
        "block": 5728,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002BA0",
        "to": "0x002AA0"
      },
      {
        "block": 5729,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002AA0",
        "to": "0x0029A0"
      },
      {
        "block": 5730,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0029A0",
        "to": "0x0028A0"
      },
      {
        "block": 5731,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0028A0",
        "to": "0x0027A0"
      },
      {
        "block": 5732,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0027A0",
        "to": "0x0026A0"
      },
      {
        "block": 5733,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0026A0",
        "to": "0x0025A0"
      },
      {
        "block": 5734,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0025A0",
        "to": "0x0024A0"
      },
      {
        "block": 5735,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0024A0",
        "to": "0x0023A0"
      },
      {
        "block": 5736,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0023A0",
        "to": "0x0022A0"
      },
      {
        "block": 5737,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0022A0",
        "to": "0x0021A0"
      },
      {
        "block": 5738,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0021A0",
        "to": "0x0020A0"
      },
      {
        "block": 5739,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0020A0",
        "to": "0x001FA0"
      },
      {
        "block": 5740,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001FA0",
        "to": "0x001EA0"
      },
      {
        "block": 5741,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001EA0",
        "to": "0x001DA0"
      },
      {
        "block": 5742,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001DA0",
        "to": "0x001CA0"
      },
      {
        "block": 5743,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001CA0",
        "to": "0x001BA0"
      },
      {
        "block": 5744,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001BA0",
        "to": "0x001AA0"
      },
      {
        "block": 5745,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001AA0",
        "to": "0x0019A0"
      },
      {
        "block": 5746,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0019A0",
        "to": "0x0018A0"
      },
      {
        "block": 5747,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0018A0",
        "to": "0x0017A0"
      },
      {
        "block": 5748,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0017A0",
        "to": "0x0016A0"
      },
      {
        "block": 5749,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0016A0",
        "to": "0x0015A0"
      },
      {
        "block": 5750,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0015A0",
        "to": "0x0014A0"
      },
      {
        "block": 5751,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0014A0",
        "to": "0x0013A0"
      },
      {
        "block": 5752,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0013A0",
        "to": "0x0012A0"
      },
      {
        "block": 5753,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0012A0",
        "to": "0x0011A0"
      },
      {
        "block": 5754,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0011A0",
        "to": "0x0010A0"
      },
      {
        "block": 5755,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0010A0",
        "to": "0x000FA0"
      },
      {
        "block": 5756,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000FA0",
        "to": "0x000EA0"
      },
      {
        "block": 5757,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000EA0",
        "to": "0x000DA0"
      },
      {
        "block": 5758,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000DA0",
        "to": "0x000CA0"
      },
      {
        "block": 5759,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000CA0",
        "to": "0x000BA0"
      },
      {
        "block": 5760,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000BA0",
        "to": "0x000AA0"
      },
      {
        "block": 5761,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000AA0",
        "to": "0x0009A0"
      },
      {
        "block": 5762,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0009A0",
        "to": "0x0008A0"
      },
      {
        "block": 5763,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0008A0",
        "to": "0x0007A0"
      },
      {
        "block": 5764,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0007A0",
        "to": "0x0006A0"
      },
      {
        "block": 5765,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0006A0",
        "to": "0x0005A0"
      },
      {
        "block": 5766,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0005A0",
        "to": "0x0004A0"
      },
      {
        "block": 5767,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0004A0",
        "to": "0x0003A0"
      },
      {
        "block": 5768,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0003A0",
        "to": "0x0002A0"
      },
      {
        "block": 5769,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0002A0",
        "to": "0x0001A0"
      },
      {
        "block": 5770,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0001A0",
        "to": "0x0000A0"
      },
      {
        "block": 5771,
        "pc": "0x09EFEF",
        "prevPc": "0x09EFE8",
        "reg": "bc",
        "from": "0x0000A0",
        "to": "0x000140"
      },
      {
        "block": 5773,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFCB",
        "reg": "bc",
        "from": "0x000140",
        "to": "0x00A0A0"
      },
      {
        "block": 5774,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x00A0A0",
        "to": "0x009FA0"
      },
      {
        "block": 5775,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009FA0",
        "to": "0x009EA0"
      },
      {
        "block": 5776,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009EA0",
        "to": "0x009DA0"
      },
      {
        "block": 5777,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009DA0",
        "to": "0x009CA0"
      },
      {
        "block": 5778,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009CA0",
        "to": "0x009BA0"
      },
      {
        "block": 5779,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009BA0",
        "to": "0x009AA0"
      },
      {
        "block": 5780,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x009AA0",
        "to": "0x0099A0"
      },
      {
        "block": 5781,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0099A0",
        "to": "0x0098A0"
      },
      {
        "block": 5782,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0098A0",
        "to": "0x0097A0"
      },
      {
        "block": 5783,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0097A0",
        "to": "0x0096A0"
      },
      {
        "block": 5784,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0096A0",
        "to": "0x0095A0"
      },
      {
        "block": 5785,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0095A0",
        "to": "0x0094A0"
      },
      {
        "block": 5786,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0094A0",
        "to": "0x0093A0"
      },
      {
        "block": 5787,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0093A0",
        "to": "0x0092A0"
      },
      {
        "block": 5788,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0092A0",
        "to": "0x0091A0"
      },
      {
        "block": 5789,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0091A0",
        "to": "0x0090A0"
      },
      {
        "block": 5790,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0090A0",
        "to": "0x008FA0"
      },
      {
        "block": 5791,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008FA0",
        "to": "0x008EA0"
      },
      {
        "block": 5792,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008EA0",
        "to": "0x008DA0"
      },
      {
        "block": 5793,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008DA0",
        "to": "0x008CA0"
      },
      {
        "block": 5794,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008CA0",
        "to": "0x008BA0"
      },
      {
        "block": 5795,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008BA0",
        "to": "0x008AA0"
      },
      {
        "block": 5796,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x008AA0",
        "to": "0x0089A0"
      },
      {
        "block": 5797,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0089A0",
        "to": "0x0088A0"
      },
      {
        "block": 5798,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0088A0",
        "to": "0x0087A0"
      },
      {
        "block": 5799,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0087A0",
        "to": "0x0086A0"
      },
      {
        "block": 5800,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0086A0",
        "to": "0x0085A0"
      },
      {
        "block": 5801,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0085A0",
        "to": "0x0084A0"
      },
      {
        "block": 5802,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0084A0",
        "to": "0x0083A0"
      },
      {
        "block": 5803,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0083A0",
        "to": "0x0082A0"
      },
      {
        "block": 5804,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0082A0",
        "to": "0x0081A0"
      },
      {
        "block": 5805,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0081A0",
        "to": "0x0080A0"
      },
      {
        "block": 5806,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0080A0",
        "to": "0x007FA0"
      },
      {
        "block": 5807,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007FA0",
        "to": "0x007EA0"
      },
      {
        "block": 5808,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007EA0",
        "to": "0x007DA0"
      },
      {
        "block": 5809,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007DA0",
        "to": "0x007CA0"
      },
      {
        "block": 5810,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007CA0",
        "to": "0x007BA0"
      },
      {
        "block": 5811,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007BA0",
        "to": "0x007AA0"
      },
      {
        "block": 5812,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x007AA0",
        "to": "0x0079A0"
      },
      {
        "block": 5813,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0079A0",
        "to": "0x0078A0"
      },
      {
        "block": 5814,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0078A0",
        "to": "0x0077A0"
      },
      {
        "block": 5815,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0077A0",
        "to": "0x0076A0"
      },
      {
        "block": 5816,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0076A0",
        "to": "0x0075A0"
      },
      {
        "block": 5817,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0075A0",
        "to": "0x0074A0"
      },
      {
        "block": 5818,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0074A0",
        "to": "0x0073A0"
      },
      {
        "block": 5819,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0073A0",
        "to": "0x0072A0"
      },
      {
        "block": 5820,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0072A0",
        "to": "0x0071A0"
      },
      {
        "block": 5821,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0071A0",
        "to": "0x0070A0"
      },
      {
        "block": 5822,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0070A0",
        "to": "0x006FA0"
      },
      {
        "block": 5823,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006FA0",
        "to": "0x006EA0"
      },
      {
        "block": 5824,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006EA0",
        "to": "0x006DA0"
      },
      {
        "block": 5825,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006DA0",
        "to": "0x006CA0"
      },
      {
        "block": 5826,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006CA0",
        "to": "0x006BA0"
      },
      {
        "block": 5827,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006BA0",
        "to": "0x006AA0"
      },
      {
        "block": 5828,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x006AA0",
        "to": "0x0069A0"
      },
      {
        "block": 5829,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0069A0",
        "to": "0x0068A0"
      },
      {
        "block": 5830,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0068A0",
        "to": "0x0067A0"
      },
      {
        "block": 5831,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0067A0",
        "to": "0x0066A0"
      },
      {
        "block": 5832,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0066A0",
        "to": "0x0065A0"
      },
      {
        "block": 5833,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0065A0",
        "to": "0x0064A0"
      },
      {
        "block": 5834,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0064A0",
        "to": "0x0063A0"
      },
      {
        "block": 5835,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0063A0",
        "to": "0x0062A0"
      },
      {
        "block": 5836,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0062A0",
        "to": "0x0061A0"
      },
      {
        "block": 5837,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0061A0",
        "to": "0x0060A0"
      },
      {
        "block": 5838,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0060A0",
        "to": "0x005FA0"
      },
      {
        "block": 5839,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005FA0",
        "to": "0x005EA0"
      },
      {
        "block": 5840,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005EA0",
        "to": "0x005DA0"
      },
      {
        "block": 5841,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005DA0",
        "to": "0x005CA0"
      },
      {
        "block": 5842,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005CA0",
        "to": "0x005BA0"
      },
      {
        "block": 5843,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005BA0",
        "to": "0x005AA0"
      },
      {
        "block": 5844,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x005AA0",
        "to": "0x0059A0"
      },
      {
        "block": 5845,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0059A0",
        "to": "0x0058A0"
      },
      {
        "block": 5846,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0058A0",
        "to": "0x0057A0"
      },
      {
        "block": 5847,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0057A0",
        "to": "0x0056A0"
      },
      {
        "block": 5848,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0056A0",
        "to": "0x0055A0"
      },
      {
        "block": 5849,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0055A0",
        "to": "0x0054A0"
      },
      {
        "block": 5850,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0054A0",
        "to": "0x0053A0"
      },
      {
        "block": 5851,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0053A0",
        "to": "0x0052A0"
      },
      {
        "block": 5852,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0052A0",
        "to": "0x0051A0"
      },
      {
        "block": 5853,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0051A0",
        "to": "0x0050A0"
      },
      {
        "block": 5854,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0050A0",
        "to": "0x004FA0"
      },
      {
        "block": 5855,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004FA0",
        "to": "0x004EA0"
      },
      {
        "block": 5856,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004EA0",
        "to": "0x004DA0"
      },
      {
        "block": 5857,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004DA0",
        "to": "0x004CA0"
      },
      {
        "block": 5858,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004CA0",
        "to": "0x004BA0"
      },
      {
        "block": 5859,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004BA0",
        "to": "0x004AA0"
      },
      {
        "block": 5860,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x004AA0",
        "to": "0x0049A0"
      },
      {
        "block": 5861,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0049A0",
        "to": "0x0048A0"
      },
      {
        "block": 5862,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0048A0",
        "to": "0x0047A0"
      },
      {
        "block": 5863,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0047A0",
        "to": "0x0046A0"
      },
      {
        "block": 5864,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0046A0",
        "to": "0x0045A0"
      },
      {
        "block": 5865,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0045A0",
        "to": "0x0044A0"
      },
      {
        "block": 5866,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0044A0",
        "to": "0x0043A0"
      },
      {
        "block": 5867,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0043A0",
        "to": "0x0042A0"
      },
      {
        "block": 5868,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0042A0",
        "to": "0x0041A0"
      },
      {
        "block": 5869,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0041A0",
        "to": "0x0040A0"
      },
      {
        "block": 5870,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0040A0",
        "to": "0x003FA0"
      },
      {
        "block": 5871,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003FA0",
        "to": "0x003EA0"
      },
      {
        "block": 5872,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003EA0",
        "to": "0x003DA0"
      },
      {
        "block": 5873,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003DA0",
        "to": "0x003CA0"
      },
      {
        "block": 5874,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003CA0",
        "to": "0x003BA0"
      },
      {
        "block": 5875,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003BA0",
        "to": "0x003AA0"
      },
      {
        "block": 5876,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x003AA0",
        "to": "0x0039A0"
      },
      {
        "block": 5877,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0039A0",
        "to": "0x0038A0"
      },
      {
        "block": 5878,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0038A0",
        "to": "0x0037A0"
      },
      {
        "block": 5879,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0037A0",
        "to": "0x0036A0"
      },
      {
        "block": 5880,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0036A0",
        "to": "0x0035A0"
      },
      {
        "block": 5881,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0035A0",
        "to": "0x0034A0"
      },
      {
        "block": 5882,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0034A0",
        "to": "0x0033A0"
      },
      {
        "block": 5883,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0033A0",
        "to": "0x0032A0"
      },
      {
        "block": 5884,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0032A0",
        "to": "0x0031A0"
      },
      {
        "block": 5885,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0031A0",
        "to": "0x0030A0"
      },
      {
        "block": 5886,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0030A0",
        "to": "0x002FA0"
      },
      {
        "block": 5887,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002FA0",
        "to": "0x002EA0"
      },
      {
        "block": 5888,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002EA0",
        "to": "0x002DA0"
      },
      {
        "block": 5889,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002DA0",
        "to": "0x002CA0"
      },
      {
        "block": 5890,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002CA0",
        "to": "0x002BA0"
      },
      {
        "block": 5891,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002BA0",
        "to": "0x002AA0"
      },
      {
        "block": 5892,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x002AA0",
        "to": "0x0029A0"
      },
      {
        "block": 5893,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0029A0",
        "to": "0x0028A0"
      },
      {
        "block": 5894,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0028A0",
        "to": "0x0027A0"
      },
      {
        "block": 5895,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0027A0",
        "to": "0x0026A0"
      },
      {
        "block": 5896,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0026A0",
        "to": "0x0025A0"
      },
      {
        "block": 5897,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0025A0",
        "to": "0x0024A0"
      },
      {
        "block": 5898,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0024A0",
        "to": "0x0023A0"
      },
      {
        "block": 5899,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0023A0",
        "to": "0x0022A0"
      },
      {
        "block": 5900,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0022A0",
        "to": "0x0021A0"
      },
      {
        "block": 5901,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0021A0",
        "to": "0x0020A0"
      },
      {
        "block": 5902,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0020A0",
        "to": "0x001FA0"
      },
      {
        "block": 5903,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001FA0",
        "to": "0x001EA0"
      },
      {
        "block": 5904,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001EA0",
        "to": "0x001DA0"
      },
      {
        "block": 5905,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001DA0",
        "to": "0x001CA0"
      },
      {
        "block": 5906,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001CA0",
        "to": "0x001BA0"
      },
      {
        "block": 5907,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001BA0",
        "to": "0x001AA0"
      },
      {
        "block": 5908,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x001AA0",
        "to": "0x0019A0"
      },
      {
        "block": 5909,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0019A0",
        "to": "0x0018A0"
      },
      {
        "block": 5910,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0018A0",
        "to": "0x0017A0"
      },
      {
        "block": 5911,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0017A0",
        "to": "0x0016A0"
      },
      {
        "block": 5912,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0016A0",
        "to": "0x0015A0"
      },
      {
        "block": 5913,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0015A0",
        "to": "0x0014A0"
      },
      {
        "block": 5914,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0014A0",
        "to": "0x0013A0"
      },
      {
        "block": 5915,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0013A0",
        "to": "0x0012A0"
      },
      {
        "block": 5916,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0012A0",
        "to": "0x0011A0"
      },
      {
        "block": 5917,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0011A0",
        "to": "0x0010A0"
      },
      {
        "block": 5918,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0010A0",
        "to": "0x000FA0"
      },
      {
        "block": 5919,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000FA0",
        "to": "0x000EA0"
      },
      {
        "block": 5920,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000EA0",
        "to": "0x000DA0"
      },
      {
        "block": 5921,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000DA0",
        "to": "0x000CA0"
      },
      {
        "block": 5922,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000CA0",
        "to": "0x000BA0"
      },
      {
        "block": 5923,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000BA0",
        "to": "0x000AA0"
      },
      {
        "block": 5924,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x000AA0",
        "to": "0x0009A0"
      },
      {
        "block": 5925,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0009A0",
        "to": "0x0008A0"
      },
      {
        "block": 5926,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0008A0",
        "to": "0x0007A0"
      },
      {
        "block": 5927,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0007A0",
        "to": "0x0006A0"
      },
      {
        "block": 5928,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0006A0",
        "to": "0x0005A0"
      },
      {
        "block": 5929,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0005A0",
        "to": "0x0004A0"
      },
      {
        "block": 5930,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0004A0",
        "to": "0x0003A0"
      },
      {
        "block": 5931,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0003A0",
        "to": "0x0002A0"
      },
      {
        "block": 5932,
        "pc": "0x09EFDE",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0002A0",
        "to": "0x0001A0"
      },
      {
        "block": 5933,
        "pc": "0x09EFE8",
        "prevPc": "0x09EFDE",
        "reg": "bc",
        "from": "0x0001A0",
        "to": "0x0000A0"
      },
      {
        "block": 5934,
        "pc": "0x09EFEF",
        "prevPc": "0x09EFE8",
        "reg": "bc",
        "from": "0x0000A0",
        "to": "0x000140"
      },
      {
        "block": 5936,
        "pc": "0x09F736",
        "prevPc": "0x09F001",
        "reg": "bc",
        "from": "0x000140",
        "to": "0x001E23"
      },
      {
        "block": 5939,
        "pc": "0x0006F3",
        "prevPc": "0x000038",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x00A008"
      },
      {
        "block": 5944,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "reg": "bc",
        "from": "0x00A008",
        "to": "0x00A55A"
      },
      {
        "block": 5947,
        "pc": "0x0067F8",
        "prevPc": "0x00171E",
        "reg": "bc",
        "from": "0x00A55A",
        "to": "0x020000"
      },
      {
        "block": 5950,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x000000"
      },
      {
        "block": 5954,
        "pc": "0x001CE5",
        "prevPc": "0x001CD5",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x09D6B4"
      },
      {
        "block": 5963,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x09D6B4",
        "to": "0x000000"
      },
      {
        "block": 5966,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 5975,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 5978,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 5987,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 5990,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 5999,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 6002,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6013,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6016,
        "pc": "0x001C54",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 6021,
        "pc": "0x000719",
        "prevPc": "0x001727",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x020000"
      },
      {
        "block": 6025,
        "pc": "0x03CFA4",
        "prevPc": "0x03CF7D",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x005016"
      },
      {
        "block": 6026,
        "pc": "0x03CFCF",
        "prevPc": "0x03CFA4",
        "reg": "bc",
        "from": "0x005016",
        "to": "0x005015"
      },
      {
        "block": 6027,
        "pc": "0x03CFD4",
        "prevPc": "0x03CFCF",
        "reg": "bc",
        "from": "0x005015",
        "to": "0x005014"
      },
      {
        "block": 6028,
        "pc": "0x03CFDB",
        "prevPc": "0x03CFD4",
        "reg": "bc",
        "from": "0x005014",
        "to": "0x005008"
      },
      {
        "block": 6042,
        "pc": "0x003CD4",
        "prevPc": "0x003CC2",
        "reg": "bc",
        "from": "0x005008",
        "to": "0x00A000"
      },
      {
        "block": 6043,
        "pc": "0x003CE0",
        "prevPc": "0x003CD4",
        "reg": "bc",
        "from": "0x00A000",
        "to": "0x00A00C"
      },
      {
        "block": 6044,
        "pc": "0x003CEE",
        "prevPc": "0x003CE0",
        "reg": "bc",
        "from": "0x00A00C",
        "to": "0x00A008"
      },
      {
        "block": 6053,
        "pc": "0x000038",
        "prevPc": "0x03D0E0",
        "reg": "bc",
        "from": "0x00A008",
        "to": "0x001E23"
      },
      {
        "block": 6054,
        "pc": "0x0006F3",
        "prevPc": "0x000038",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x00A008"
      },
      {
        "block": 6059,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "reg": "bc",
        "from": "0x00A008",
        "to": "0x00A55A"
      },
      {
        "block": 6062,
        "pc": "0x0067F8",
        "prevPc": "0x00171E",
        "reg": "bc",
        "from": "0x00A55A",
        "to": "0x020000"
      },
      {
        "block": 6065,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x000000"
      },
      {
        "block": 6069,
        "pc": "0x001CE5",
        "prevPc": "0x001CD5",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x09D6B4"
      },
      {
        "block": 6078,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x09D6B4",
        "to": "0x000000"
      },
      {
        "block": 6081,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 6090,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 6093,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6102,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6105,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 6114,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 6117,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6128,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6131,
        "pc": "0x001C54",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 6136,
        "pc": "0x000719",
        "prevPc": "0x001727",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x020000"
      },
      {
        "block": 6140,
        "pc": "0x03CFA4",
        "prevPc": "0x03CF7D",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x005016"
      },
      {
        "block": 6141,
        "pc": "0x03CFCF",
        "prevPc": "0x03CFA4",
        "reg": "bc",
        "from": "0x005016",
        "to": "0x005015"
      },
      {
        "block": 6142,
        "pc": "0x03CFFE",
        "prevPc": "0x03CFCF",
        "reg": "bc",
        "from": "0x005015",
        "to": "0x005014"
      },
      {
        "block": 6144,
        "pc": "0x09EF2E",
        "prevPc": "0x03D0E0",
        "reg": "bc",
        "from": "0x005014",
        "to": "0x001E23"
      },
      {
        "block": 6145,
        "pc": "0x0A227A",
        "prevPc": "0x09EF2E",
        "reg": "sp",
        "from": "0xD1A84B",
        "to": "0xD1A84E"
      },
      {
        "block": 6146,
        "pc": "0x0A2280",
        "prevPc": "0x0A227A",
        "reg": "af",
        "from": "0x0044",
        "to": "0x0018"
      },
      {
        "block": 6146,
        "pc": "0x0A2280",
        "prevPc": "0x0A227A",
        "reg": "sp",
        "from": "0xD1A84E",
        "to": "0xD1A851"
      },
      {
        "block": 6147,
        "pc": "0x026789",
        "prevPc": "0x0A2280",
        "reg": "af",
        "from": "0x0018",
        "to": "0x025C"
      },
      {
        "block": 6147,
        "pc": "0x026789",
        "prevPc": "0x0A2280",
        "reg": "sp",
        "from": "0xD1A851",
        "to": "0xD1A84B"
      },
      {
        "block": 6151,
        "pc": "0x0267B6",
        "prevPc": "0x026146",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x000007"
      },
      {
        "block": 6153,
        "pc": "0x0267C5",
        "prevPc": "0x026146",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000000"
      },
      {
        "block": 6156,
        "pc": "0x026815",
        "prevPc": "0x0267F0",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000027"
      },
      {
        "block": 6159,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6163,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6167,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6171,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6175,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6179,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 6183,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 6187,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 6191,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 6195,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 6199,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 6203,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 6207,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 6211,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 6215,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 6219,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 6223,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 6227,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 6231,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 6235,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 6239,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 6243,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 6247,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 6251,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 6255,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 6259,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 6263,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 6267,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 6271,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 6275,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 6279,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 6283,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 6287,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 6291,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 6295,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 6299,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 6303,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 6307,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 6311,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6312,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6316,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6317,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6320,
        "pc": "0x026815",
        "prevPc": "0x0267F7",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000027"
      },
      {
        "block": 6323,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6327,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6331,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6335,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6339,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6343,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 6347,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 6351,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 6355,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 6359,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 6363,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 6367,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 6371,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 6375,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 6379,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 6383,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 6387,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 6391,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 6395,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 6399,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 6403,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 6407,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 6411,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 6415,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 6419,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 6423,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 6427,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 6431,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 6435,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 6439,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 6443,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 6447,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 6451,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 6455,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 6459,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 6463,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 6467,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 6471,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 6475,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6476,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6480,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6481,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6484,
        "pc": "0x026815",
        "prevPc": "0x0267F7",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000027"
      },
      {
        "block": 6487,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6491,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6495,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6499,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6503,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6507,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 6511,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 6515,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 6519,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 6523,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 6527,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 6531,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 6535,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 6539,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 6543,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 6547,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 6551,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 6555,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 6559,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 6563,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 6567,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 6571,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 6575,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 6579,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 6583,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 6587,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 6591,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 6595,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 6599,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 6603,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 6607,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 6611,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 6615,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 6619,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 6623,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 6627,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 6631,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 6635,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 6639,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6640,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6644,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6645,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6648,
        "pc": "0x026815",
        "prevPc": "0x0267F7",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000027"
      },
      {
        "block": 6651,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6655,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6659,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6663,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6667,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6671,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 6675,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 6679,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 6683,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 6687,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 6691,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 6695,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 6699,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 6703,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 6707,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 6711,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 6715,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 6719,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 6723,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 6727,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 6731,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 6735,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 6739,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 6743,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 6747,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 6751,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 6755,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 6759,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 6763,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 6767,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 6771,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 6775,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 6779,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 6783,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 6787,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 6791,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 6795,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 6799,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 6803,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6804,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6808,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6809,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6812,
        "pc": "0x026815",
        "prevPc": "0x0267F7",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000027"
      },
      {
        "block": 6815,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6819,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6823,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6827,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6831,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6835,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 6839,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 6843,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 6847,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 6851,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 6855,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 6859,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 6863,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 6867,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 6871,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 6875,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 6879,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 6883,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 6887,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 6891,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 6895,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 6899,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 6903,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 6907,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 6911,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 6915,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 6919,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 6923,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 6927,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 6931,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 6935,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 6939,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 6943,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 6947,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 6951,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 6955,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 6959,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 6963,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 6967,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6968,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6972,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 6973,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 6976,
        "pc": "0x026815",
        "prevPc": "0x0267F7",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000027"
      },
      {
        "block": 6979,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000027",
        "to": "0x000026"
      },
      {
        "block": 6983,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000026",
        "to": "0x000025"
      },
      {
        "block": 6987,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000025",
        "to": "0x000024"
      },
      {
        "block": 6991,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000024",
        "to": "0x000023"
      },
      {
        "block": 6995,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000023",
        "to": "0x000022"
      },
      {
        "block": 6999,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000022",
        "to": "0x000021"
      },
      {
        "block": 7003,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000021",
        "to": "0x000020"
      },
      {
        "block": 7007,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000020",
        "to": "0x00001F"
      },
      {
        "block": 7011,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001F",
        "to": "0x00001E"
      },
      {
        "block": 7015,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001E",
        "to": "0x00001D"
      },
      {
        "block": 7019,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001D",
        "to": "0x00001C"
      },
      {
        "block": 7023,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001C",
        "to": "0x00001B"
      },
      {
        "block": 7027,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001B",
        "to": "0x00001A"
      },
      {
        "block": 7031,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00001A",
        "to": "0x000019"
      },
      {
        "block": 7035,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000019",
        "to": "0x000018"
      },
      {
        "block": 7039,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000017"
      },
      {
        "block": 7043,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000017",
        "to": "0x000016"
      },
      {
        "block": 7047,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000016",
        "to": "0x000015"
      },
      {
        "block": 7051,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000015",
        "to": "0x000014"
      },
      {
        "block": 7055,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000014",
        "to": "0x000013"
      },
      {
        "block": 7059,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000013",
        "to": "0x000012"
      },
      {
        "block": 7063,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000012",
        "to": "0x000011"
      },
      {
        "block": 7067,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000011",
        "to": "0x000010"
      },
      {
        "block": 7071,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000010",
        "to": "0x00000F"
      },
      {
        "block": 7075,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000F",
        "to": "0x00000E"
      },
      {
        "block": 7079,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000E",
        "to": "0x00000D"
      },
      {
        "block": 7083,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000D",
        "to": "0x00000C"
      },
      {
        "block": 7087,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000C",
        "to": "0x00000B"
      },
      {
        "block": 7091,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000B",
        "to": "0x00000A"
      },
      {
        "block": 7095,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x00000A",
        "to": "0x000009"
      },
      {
        "block": 7099,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000009",
        "to": "0x000008"
      },
      {
        "block": 7103,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000008",
        "to": "0x000007"
      },
      {
        "block": 7107,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000007",
        "to": "0x000006"
      },
      {
        "block": 7111,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000006",
        "to": "0x000005"
      },
      {
        "block": 7115,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000005",
        "to": "0x000004"
      },
      {
        "block": 7119,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000004",
        "to": "0x000003"
      },
      {
        "block": 7123,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000003",
        "to": "0x000002"
      },
      {
        "block": 7127,
        "pc": "0x026810",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000001"
      },
      {
        "block": 7131,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7132,
        "pc": "0x026810",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7136,
        "pc": "0x02682A",
        "prevPc": "0x026823",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7137,
        "pc": "0x02683C",
        "prevPc": "0x02682A",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7140,
        "pc": "0x026851",
        "prevPc": "0x026848",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x001E23"
      },
      {
        "block": 7142,
        "pc": "0x0006F3",
        "prevPc": "0x000038",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x005014"
      },
      {
        "block": 7147,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "reg": "bc",
        "from": "0x005014",
        "to": "0x00A55A"
      },
      {
        "block": 7150,
        "pc": "0x0067F8",
        "prevPc": "0x00171E",
        "reg": "bc",
        "from": "0x00A55A",
        "to": "0x020000"
      },
      {
        "block": 7153,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x000000"
      },
      {
        "block": 7157,
        "pc": "0x001CE5",
        "prevPc": "0x001CD5",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x09D6B4"
      },
      {
        "block": 7166,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x09D6B4",
        "to": "0x000000"
      },
      {
        "block": 7169,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7178,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 7181,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7190,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7193,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7202,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 7205,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7216,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7219,
        "pc": "0x001C54",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7224,
        "pc": "0x000719",
        "prevPc": "0x001727",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x020000"
      },
      {
        "block": 7228,
        "pc": "0x03CFA4",
        "prevPc": "0x03CF7D",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x005016"
      },
      {
        "block": 7229,
        "pc": "0x03CFCF",
        "prevPc": "0x03CFA4",
        "reg": "bc",
        "from": "0x005016",
        "to": "0x005015"
      },
      {
        "block": 7230,
        "pc": "0x03CFD4",
        "prevPc": "0x03CFCF",
        "reg": "bc",
        "from": "0x005015",
        "to": "0x005014"
      },
      {
        "block": 7231,
        "pc": "0x03CFDB",
        "prevPc": "0x03CFD4",
        "reg": "bc",
        "from": "0x005014",
        "to": "0x005008"
      },
      {
        "block": 7245,
        "pc": "0x003CD4",
        "prevPc": "0x003CC2",
        "reg": "bc",
        "from": "0x005008",
        "to": "0x00A000"
      },
      {
        "block": 7246,
        "pc": "0x003CE0",
        "prevPc": "0x003CD4",
        "reg": "bc",
        "from": "0x00A000",
        "to": "0x00A00C"
      },
      {
        "block": 7247,
        "pc": "0x003CEE",
        "prevPc": "0x003CE0",
        "reg": "bc",
        "from": "0x00A00C",
        "to": "0x00A008"
      },
      {
        "block": 7256,
        "pc": "0x000038",
        "prevPc": "0x03D0E0",
        "reg": "bc",
        "from": "0x00A008",
        "to": "0x001E23"
      },
      {
        "block": 7257,
        "pc": "0x0006F3",
        "prevPc": "0x000038",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x00A008"
      },
      {
        "block": 7262,
        "pc": "0x001717",
        "prevPc": "0x0008BB",
        "reg": "bc",
        "from": "0x00A008",
        "to": "0x00A55A"
      },
      {
        "block": 7265,
        "pc": "0x0067F8",
        "prevPc": "0x00171E",
        "reg": "bc",
        "from": "0x00A55A",
        "to": "0x020000"
      },
      {
        "block": 7268,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x000000"
      },
      {
        "block": 7272,
        "pc": "0x001CE5",
        "prevPc": "0x001CD5",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x09D6B4"
      },
      {
        "block": 7281,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x09D6B4",
        "to": "0x000000"
      },
      {
        "block": 7284,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7293,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 7296,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7305,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7308,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7317,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x000000"
      },
      {
        "block": 7320,
        "pc": "0x001C81",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000001"
      },
      {
        "block": 7331,
        "pc": "0x001CC0",
        "prevPc": "0x001CA6",
        "reg": "bc",
        "from": "0x000001",
        "to": "0x000000"
      },
      {
        "block": 7334,
        "pc": "0x001C54",
        "prevPc": "0x001CE4",
        "reg": "bc",
        "from": "0x000000",
        "to": "0x000002"
      },
      {
        "block": 7339,
        "pc": "0x000719",
        "prevPc": "0x001727",
        "reg": "bc",
        "from": "0x000002",
        "to": "0x020000"
      },
      {
        "block": 7343,
        "pc": "0x03CFA4",
        "prevPc": "0x03CF7D",
        "reg": "bc",
        "from": "0x020000",
        "to": "0x005016"
      },
      {
        "block": 7344,
        "pc": "0x03CFCF",
        "prevPc": "0x03CFA4",
        "reg": "bc",
        "from": "0x005016",
        "to": "0x005015"
      },
      {
        "block": 7345,
        "pc": "0x03CFFE",
        "prevPc": "0x03CFCF",
        "reg": "bc",
        "from": "0x005015",
        "to": "0x005014"
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "reg": "bc",
        "from": "0x005014",
        "to": "0x001E23"
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "reg": "de",
        "from": "0x0080C0",
        "to": "0x00013F"
      },
      {
        "block": 7347,
        "pc": "0x0A228F",
        "prevPc": "0x03D0E0",
        "reg": "sp",
        "from": "0xD1A842",
        "to": "0xD1A84E"
      },
      {
        "block": 7348,
        "pc": "0x0A2A37",
        "prevPc": "0x0A228F",
        "reg": "af",
        "from": "0x0044",
        "to": "0x0042"
      },
      {
        "block": 7348,
        "pc": "0x0A2A37",
        "prevPc": "0x0A228F",
        "reg": "bc",
        "from": "0x001E23",
        "to": "0x000018"
      },
      {
        "block": 7349,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "reg": "af",
        "from": "0x0042",
        "to": "0x0044"
      },
      {
        "block": 7349,
        "pc": "0x0A229D",
        "prevPc": "0x0A2A37",
        "reg": "sp",
        "from": "0xD1A84E",
        "to": "0xD1A851"
      },
      {
        "block": 7350,
        "pc": "0x0A2A37",
        "prevPc": "0x0A229D",
        "reg": "bc",
        "from": "0x000018",
        "to": "0x000000"
      },
      {
        "block": 7350,
        "pc": "0x0A2A37",
        "prevPc": "0x0A229D",
        "reg": "sp",
        "from": "0xD1A851",
        "to": "0xD1A84E"
      },
      {
        "block": 7351,
        "pc": "0x0A22A4",
        "prevPc": "0x0A2A37",
        "reg": "sp",
        "from": "0xD1A84E",
        "to": "0xD1A851"
      }
    ],
    "lastBlocks": [
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x02682A",
      "0x02683C",
      "0x026840",
      "0x0267F7",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x02682A",
      "0x026810",
      "0x026815",
      "0x02681A",
      "0x026823",
      "0x02682A",
      "0x02683C",
      "0x026840",
      "0x026848",
      "0x026851",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x00171E",
      "0x0067F8",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CCE",
      "0x001CD5",
      "0x001CE5",
      "0x001C54",
      "0x006808",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C54",
      "0x006816",
      "0x00681E",
      "0x006828",
      "0x001727",
      "0x000719",
      "0x00071D",
      "0x02010C",
      "0x03CF7D",
      "0x03CFA4",
      "0x03CFCF",
      "0x03CFD4",
      "0x03CFDB",
      "0x03CFE0",
      "0x03CFE5",
      "0x03CFEA",
      "0x03D029",
      "0x03D033",
      "0x03D038",
      "0x03D044",
      "0x03D1C3",
      "0x03D04C",
      "0x03D054",
      "0x03F994",
      "0x0003D4",
      "0x003CC2",
      "0x003CD4",
      "0x003CE0",
      "0x003CEE",
      "0x003CF3",
      "0x03F998",
      "0x03F99A",
      "0x03F9AB",
      "0x03F9AE",
      "0x03D058",
      "0x03D060",
      "0x03D0E0",
      "0x000038",
      "0x0006F3",
      "0x000704",
      "0x000710",
      "0x001713",
      "0x0008BB",
      "0x001717",
      "0x001718",
      "0x00171E",
      "0x0067F8",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CCE",
      "0x001CD5",
      "0x001CE5",
      "0x001C54",
      "0x006808",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C54",
      "0x006816",
      "0x00681E",
      "0x006828",
      "0x001727",
      "0x000719",
      "0x00071D",
      "0x02010C",
      "0x03CF7D",
      "0x03CFA4",
      "0x03CFCF",
      "0x03CFFE",
      "0x03D0E0",
      "0x0A228F",
      "0x0A2A37",
      "0x0A229D",
      "0x0A2A37",
      "0x0A22A4"
    ],
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 960
      },
      {
        "pc": "0x0A19A4",
        "count": 560
      },
      {
        "pc": "0x026815",
        "count": 240
      },
      {
        "pc": "0x02681A",
        "count": 240
      },
      {
        "pc": "0x026823",
        "count": 240
      },
      {
        "pc": "0x026810",
        "count": 234
      },
      {
        "pc": "0x0A1A83",
        "count": 160
      },
      {
        "pc": "0x0A3408",
        "count": 96
      },
      {
        "pc": "0x0A3404",
        "count": 96
      },
      {
        "pc": "0x001CA6",
        "count": 90
      },
      {
        "pc": "0x001CC0",
        "count": 90
      },
      {
        "pc": "0x001CCA",
        "count": 90
      },
      {
        "pc": "0x0A1854",
        "count": 80
      },
      {
        "pc": "0x0A187C",
        "count": 80
      },
      {
        "pc": "0x0A188A",
        "count": 80
      },
      {
        "pc": "0x0A189E",
        "count": 80
      },
      {
        "pc": "0x0A18A6",
        "count": 80
      },
      {
        "pc": "0x0A18AF",
        "count": 80
      },
      {
        "pc": "0x0A18C1",
        "count": 80
      },
      {
        "pc": "0x0A18C4",
        "count": 80
      },
      {
        "pc": "0x0A18CA",
        "count": 80
      },
      {
        "pc": "0x0A18E9",
        "count": 80
      },
      {
        "pc": "0x0A18EB",
        "count": 80
      },
      {
        "pc": "0x0A190D",
        "count": 80
      },
      {
        "pc": "0x0A191F",
        "count": 80
      },
      {
        "pc": "0x0A1939",
        "count": 80
      },
      {
        "pc": "0x0A1969",
        "count": 80
      },
      {
        "pc": "0x0A1976",
        "count": 80
      },
      {
        "pc": "0x0A1980",
        "count": 80
      },
      {
        "pc": "0x0A1988",
        "count": 80
      },
      {
        "pc": "0x0A1994",
        "count": 80
      },
      {
        "pc": "0x0A19AA",
        "count": 80
      }
    ]
  },
  "staticDecode": {
    "caller058a10_058a22": [
      {
        "pc": "0x058A10",
        "bytes": "CD 12 82 05",
        "asm": "CALL 0x058212",
        "tag": "call",
        "target": "0x058212",
        "fallthrough": "0x058A14",
        "length": 4,
        "raw": {
          "pc": 363024,
          "length": 4,
          "nextPc": 363028,
          "tag": "call",
          "target": 360978,
          "fallthrough": 363028,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x058A14",
        "bytes": "20 16",
        "asm": "JR NZ,0x058A2C",
        "tag": "jr-conditional",
        "target": "0x058A2C",
        "fallthrough": "0x058A16",
        "length": 2,
        "raw": {
          "pc": 363028,
          "length": 2,
          "nextPc": 363030,
          "tag": "jr-conditional",
          "condition": "nz",
          "target": 363052,
          "fallthrough": 363030,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x058A16",
        "bytes": "CD 3A 22 0A",
        "asm": "CALL 0x0A223A",
        "tag": "call",
        "target": "0x0A223A",
        "fallthrough": "0x058A1A",
        "length": 4,
        "raw": {
          "pc": 363030,
          "length": 4,
          "nextPc": 363034,
          "tag": "call",
          "target": 664122,
          "fallthrough": 363034,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x058A1A",
        "bytes": "FD CB 49 BE",
        "asm": "indexed-cb-res {\"pc\":363034,\"length\":4,\"nextPc\":363038,\"tag\":\"indexed-cb-res\",\"bit\":7,\"indexRegister\":\"iy\",\"displacement\":73,\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "indexed-cb-res",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 363034,
          "length": 4,
          "nextPc": 363038,
          "tag": "indexed-cb-res",
          "bit": 7,
          "indexRegister": "iy",
          "displacement": 73,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x058A1E",
        "bytes": "CD 54 8D 05",
        "asm": "CALL 0x058D54",
        "tag": "call",
        "target": "0x058D54",
        "fallthrough": "0x058A22",
        "length": 4,
        "raw": {
          "pc": 363038,
          "length": 4,
          "nextPc": 363042,
          "tag": "call",
          "target": 363860,
          "fallthrough": 363042,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      }
    ],
    "source0a223a_0a22b1": [
      {
        "pc": "0x0A223A",
        "bytes": "CD 5E 23 0A",
        "asm": "CALL 0x0A235E",
        "tag": "call",
        "target": "0x0A235E",
        "fallthrough": "0x0A223E",
        "length": 4,
        "raw": {
          "pc": 664122,
          "length": 4,
          "nextPc": 664126,
          "tag": "call",
          "target": 664414,
          "fallthrough": 664126,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A223E",
        "bytes": "3A 04 25 D0",
        "asm": "LD A,(0xD02504)",
        "tag": "ld-reg-mem",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664126,
          "length": 4,
          "nextPc": 664130,
          "tag": "ld-reg-mem",
          "dest": "a",
          "addr": 13640964,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2242",
        "bytes": "F5",
        "asm": "PUSH AF",
        "tag": "push",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664130,
          "length": 1,
          "nextPc": 664131,
          "tag": "push",
          "pair": "af",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2243",
        "bytes": "CD A0 00 08",
        "asm": "CALL 0x0800A0",
        "tag": "call",
        "target": "0x0800A0",
        "fallthrough": "0x0A2247",
        "length": 4,
        "raw": {
          "pc": 664131,
          "length": 4,
          "nextPc": 664135,
          "tag": "call",
          "target": 524448,
          "fallthrough": 664135,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2247",
        "bytes": "28 08",
        "asm": "JR Z,0x0A2251",
        "tag": "jr-conditional",
        "target": "0x0A2251",
        "fallthrough": "0x0A2249",
        "length": 2,
        "raw": {
          "pc": 664135,
          "length": 2,
          "nextPc": 664137,
          "tag": "jr-conditional",
          "condition": "z",
          "target": 664145,
          "fallthrough": 664137,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2249",
        "bytes": "FE 06",
        "asm": "CP 0x06",
        "tag": "alu-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664137,
          "length": 2,
          "nextPc": 664139,
          "tag": "alu-imm",
          "op": "cp",
          "value": 6,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A224B",
        "bytes": "20 09",
        "asm": "JR NZ,0x0A2256",
        "tag": "jr-conditional",
        "target": "0x0A2256",
        "fallthrough": "0x0A224D",
        "length": 2,
        "raw": {
          "pc": 664139,
          "length": 2,
          "nextPc": 664141,
          "tag": "jr-conditional",
          "condition": "nz",
          "target": 664150,
          "fallthrough": 664141,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A224D",
        "bytes": "3E 9B",
        "asm": "LD A,0x9B",
        "tag": "ld-reg-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664141,
          "length": 2,
          "nextPc": 664143,
          "tag": "ld-reg-imm",
          "dest": "a",
          "value": 155,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A224F",
        "bytes": "18 09",
        "asm": "JR 0x0A225A",
        "tag": "jr",
        "target": "0x0A225A",
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664143,
          "length": 2,
          "nextPc": 664145,
          "tag": "jr",
          "target": 664154,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2251",
        "bytes": "B7",
        "asm": "OR A",
        "tag": "alu-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664145,
          "length": 1,
          "nextPc": 664146,
          "tag": "alu-reg",
          "op": "or",
          "src": "a",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2252",
        "bytes": "20 02",
        "asm": "JR NZ,0x0A2256",
        "tag": "jr-conditional",
        "target": "0x0A2256",
        "fallthrough": "0x0A2254",
        "length": 2,
        "raw": {
          "pc": 664146,
          "length": 2,
          "nextPc": 664148,
          "tag": "jr-conditional",
          "condition": "nz",
          "target": 664150,
          "fallthrough": 664148,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2254",
        "bytes": "3E 1E",
        "asm": "LD A,0x1E",
        "tag": "ld-reg-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664148,
          "length": 2,
          "nextPc": 664150,
          "tag": "ld-reg-imm",
          "dest": "a",
          "value": 30,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2256",
        "bytes": "C4 4C 2D 0A",
        "asm": "CALL NZ,0x0A2D4C",
        "tag": "call-conditional",
        "target": "0x0A2D4C",
        "fallthrough": "0x0A225A",
        "length": 4,
        "raw": {
          "pc": 664150,
          "length": 4,
          "nextPc": 664154,
          "tag": "call-conditional",
          "condition": "nz",
          "target": 666956,
          "fallthrough": 664154,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A225A",
        "bytes": "47",
        "asm": "LD B,A",
        "tag": "ld-reg-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664154,
          "length": 1,
          "nextPc": 664155,
          "tag": "ld-reg-reg",
          "dest": "b",
          "src": "a",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A225B",
        "bytes": "3A 05 25 D0",
        "asm": "LD A,(0xD02505)",
        "tag": "ld-reg-mem",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664155,
          "length": 4,
          "nextPc": 664159,
          "tag": "ld-reg-mem",
          "dest": "a",
          "addr": 13640965,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A225F",
        "bytes": "FE 0A",
        "asm": "CP 0x0A",
        "tag": "alu-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664159,
          "length": 2,
          "nextPc": 664161,
          "tag": "alu-imm",
          "op": "cp",
          "value": 10,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2261",
        "bytes": "20 04",
        "asm": "JR NZ,0x0A2267",
        "tag": "jr-conditional",
        "target": "0x0A2267",
        "fallthrough": "0x0A2263",
        "length": 2,
        "raw": {
          "pc": 664161,
          "length": 2,
          "nextPc": 664163,
          "tag": "jr-conditional",
          "condition": "nz",
          "target": 664167,
          "fallthrough": 664163,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2263",
        "bytes": "3E EF",
        "asm": "LD A,0xEF",
        "tag": "ld-reg-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664163,
          "length": 2,
          "nextPc": 664165,
          "tag": "ld-reg-imm",
          "dest": "a",
          "value": 239,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2265",
        "bytes": "18 06",
        "asm": "JR 0x0A226D",
        "tag": "jr",
        "target": "0x0A226D",
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664165,
          "length": 2,
          "nextPc": 664167,
          "tag": "jr",
          "target": 664173,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2267",
        "bytes": "CD 4C 2D 0A",
        "asm": "CALL 0x0A2D4C",
        "tag": "call",
        "target": "0x0A2D4C",
        "fallthrough": "0x0A226B",
        "length": 4,
        "raw": {
          "pc": 664167,
          "length": 4,
          "nextPc": 664171,
          "tag": "call",
          "target": 666956,
          "fallthrough": 664171,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A226B",
        "bytes": "D6 02",
        "asm": "SUB 0x02",
        "tag": "alu-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664171,
          "length": 2,
          "nextPc": 664173,
          "tag": "alu-imm",
          "op": "sub",
          "value": 2,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A226D",
        "bytes": "21 00 00 00",
        "asm": "LD HL,0x000000",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664173,
          "length": 4,
          "nextPc": 664177,
          "tag": "ld-pair-imm",
          "pair": "hl",
          "value": 0,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2271",
        "bytes": "4F",
        "asm": "LD C,A",
        "tag": "ld-reg-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664177,
          "length": 1,
          "nextPc": 664178,
          "tag": "ld-reg-reg",
          "dest": "c",
          "src": "a",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2272",
        "bytes": "11 3F 01 00",
        "asm": "LD DE,0x00013F",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664178,
          "length": 4,
          "nextPc": 664182,
          "tag": "ld-pair-imm",
          "pair": "de",
          "value": 319,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2276",
        "bytes": "CD 20 EF 09",
        "asm": "CALL 0x09EF20",
        "tag": "call",
        "target": "0x09EF20",
        "fallthrough": "0x0A227A",
        "length": 4,
        "raw": {
          "pc": 664182,
          "length": 4,
          "nextPc": 664186,
          "tag": "call",
          "target": 651040,
          "fallthrough": 664186,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A227A",
        "bytes": "F1",
        "asm": "POP AF",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664186,
          "length": 1,
          "nextPc": 664187,
          "tag": "pop",
          "pair": "af",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A227B",
        "bytes": "FD CB 0D 4E",
        "asm": "indexed-cb-bit {\"pc\":664187,\"length\":4,\"nextPc\":664191,\"tag\":\"indexed-cb-bit\",\"bit\":1,\"indexRegister\":\"iy\",\"displacement\":13,\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "indexed-cb-bit",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664187,
          "length": 4,
          "nextPc": 664191,
          "tag": "indexed-cb-bit",
          "bit": 1,
          "indexRegister": "iy",
          "displacement": 13,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A227F",
        "bytes": "C8",
        "asm": "RET Z",
        "tag": "ret-conditional",
        "target": null,
        "fallthrough": "0x0A2280",
        "length": 1,
        "raw": {
          "pc": 664191,
          "length": 1,
          "nextPc": 664192,
          "tag": "ret-conditional",
          "condition": "z",
          "fallthrough": 664192,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2280",
        "bytes": "F5",
        "asm": "PUSH AF",
        "tag": "push",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664192,
          "length": 1,
          "nextPc": 664193,
          "tag": "push",
          "pair": "af",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2281",
        "bytes": "FD CB 4C C6",
        "asm": "indexed-cb-set {\"pc\":664193,\"length\":4,\"nextPc\":664197,\"tag\":\"indexed-cb-set\",\"bit\":0,\"indexRegister\":\"iy\",\"displacement\":76,\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "indexed-cb-set",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664193,
          "length": 4,
          "nextPc": 664197,
          "tag": "indexed-cb-set",
          "bit": 0,
          "indexRegister": "iy",
          "displacement": 76,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2285",
        "bytes": "3E 02",
        "asm": "LD A,0x02",
        "tag": "ld-reg-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664197,
          "length": 2,
          "nextPc": 664199,
          "tag": "ld-reg-imm",
          "dest": "a",
          "value": 2,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2287",
        "bytes": "FD CB 4C 6E",
        "asm": "indexed-cb-bit {\"pc\":664199,\"length\":4,\"nextPc\":664203,\"tag\":\"indexed-cb-bit\",\"bit\":5,\"indexRegister\":\"iy\",\"displacement\":76,\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "indexed-cb-bit",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664199,
          "length": 4,
          "nextPc": 664203,
          "tag": "indexed-cb-bit",
          "bit": 5,
          "indexRegister": "iy",
          "displacement": 76,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A228B",
        "bytes": "CC 89 67 02",
        "asm": "CALL Z,0x026789",
        "tag": "call-conditional",
        "target": "0x026789",
        "fallthrough": "0x0A228F",
        "length": 4,
        "raw": {
          "pc": 664203,
          "length": 4,
          "nextPc": 664207,
          "tag": "call-conditional",
          "condition": "z",
          "target": 157577,
          "fallthrough": 664207,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A228F",
        "bytes": "FD CB 4C 86",
        "asm": "indexed-cb-res {\"pc\":664207,\"length\":4,\"nextPc\":664211,\"tag\":\"indexed-cb-res\",\"bit\":0,\"indexRegister\":\"iy\",\"displacement\":76,\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "indexed-cb-res",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664207,
          "length": 4,
          "nextPc": 664211,
          "tag": "indexed-cb-res",
          "bit": 0,
          "indexRegister": "iy",
          "displacement": 76,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2293",
        "bytes": "C1",
        "asm": "POP BC",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664211,
          "length": 1,
          "nextPc": 664212,
          "tag": "pop",
          "pair": "bc",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2294",
        "bytes": "3A 05 25 D0",
        "asm": "LD A,(0xD02505)",
        "tag": "ld-reg-mem",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664212,
          "length": 4,
          "nextPc": 664216,
          "tag": "ld-reg-mem",
          "dest": "a",
          "addr": 13640965,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2298",
        "bytes": "90",
        "asm": "SUB B",
        "tag": "alu-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664216,
          "length": 1,
          "nextPc": 664217,
          "tag": "alu-reg",
          "op": "sub",
          "src": "b",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2299",
        "bytes": "CD 37 2A 0A",
        "asm": "CALL 0x0A2A37",
        "tag": "call",
        "target": "0x0A2A37",
        "fallthrough": "0x0A229D",
        "length": 4,
        "raw": {
          "pc": 664217,
          "length": 4,
          "nextPc": 664221,
          "tag": "call",
          "target": 666167,
          "fallthrough": 664221,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A229D",
        "bytes": "78",
        "asm": "LD A,B",
        "tag": "ld-reg-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664221,
          "length": 1,
          "nextPc": 664222,
          "tag": "ld-reg-reg",
          "dest": "a",
          "src": "b",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A229E",
        "bytes": "E5",
        "asm": "PUSH HL",
        "tag": "push",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664222,
          "length": 1,
          "nextPc": 664223,
          "tag": "push",
          "pair": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A229F",
        "bytes": "C1",
        "asm": "POP BC",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664223,
          "length": 1,
          "nextPc": 664224,
          "tag": "pop",
          "pair": "bc",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A0",
        "bytes": "CD 37 2A 0A",
        "asm": "CALL 0x0A2A37",
        "tag": "call",
        "target": "0x0A2A37",
        "fallthrough": "0x0A22A4",
        "length": 4,
        "raw": {
          "pc": 664224,
          "length": 4,
          "nextPc": 664228,
          "tag": "call",
          "target": 666167,
          "fallthrough": 664228,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A4",
        "bytes": "11 C0 06 D0",
        "asm": "LD DE,0xD006C0",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664228,
          "length": 4,
          "nextPc": 664232,
          "tag": "ld-pair-imm",
          "pair": "de",
          "value": 13633216,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A8",
        "bytes": "19",
        "asm": "ADD HL,DE",
        "tag": "add-pair",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664232,
          "length": 1,
          "nextPc": 664233,
          "tag": "add-pair",
          "dest": "hl",
          "src": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A9",
        "bytes": "E5",
        "asm": "PUSH HL",
        "tag": "push",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664233,
          "length": 1,
          "nextPc": 664234,
          "tag": "push",
          "pair": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AA",
        "bytes": "D1",
        "asm": "POP DE",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664234,
          "length": 1,
          "nextPc": 664235,
          "tag": "pop",
          "pair": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AB",
        "bytes": "13",
        "asm": "INC DE",
        "tag": "inc-pair",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664235,
          "length": 1,
          "nextPc": 664236,
          "tag": "inc-pair",
          "pair": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AC",
        "bytes": "36 20",
        "asm": "LD (HL),0x20",
        "tag": "ld-ind-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664236,
          "length": 2,
          "nextPc": 664238,
          "tag": "ld-ind-imm",
          "value": 32,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AE",
        "bytes": "ED B0",
        "asm": "LDIR",
        "tag": "ldir",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664238,
          "length": 2,
          "nextPc": 664240,
          "tag": "ldir",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22B0",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664240,
          "length": 1,
          "nextPc": 664241,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      }
    ],
    "bridge0a2a20_0a2a45": [
      {
        "pc": "0x0A2A20",
        "bytes": "17",
        "asm": "RLA",
        "tag": "rla",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666144,
          "length": 1,
          "nextPc": 666145,
          "tag": "rla",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A21",
        "bytes": "0A",
        "asm": "LD A,(BC)",
        "tag": "ld-reg-ind",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666145,
          "length": 1,
          "nextPc": 666146,
          "tag": "ld-reg-ind",
          "dest": "a",
          "src": "bc",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A22",
        "bytes": "E1",
        "asm": "POP HL",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666146,
          "length": 1,
          "nextPc": 666147,
          "tag": "pop",
          "pair": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A23",
        "bytes": "40 22 95 05",
        "asm": "LD HL,(0x000595)",
        "tag": "ld-pair-mem",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 666147,
          "length": 4,
          "nextPc": 666151,
          "tag": "ld-pair-mem",
          "pair": "hl",
          "addr": 1429,
          "direction": "to-mem",
          "mode": "adl",
          "modePrefix": "sis"
        }
      },
      {
        "pc": "0x0A2A27",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666151,
          "length": 1,
          "nextPc": 666152,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A28",
        "bytes": "11 AA 07 D0",
        "asm": "LD DE,0xD007AA",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 666152,
          "length": 4,
          "nextPc": 666156,
          "tag": "ld-pair-imm",
          "pair": "de",
          "value": 13633450,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A2C",
        "bytes": "21 9A 2A D0",
        "asm": "LD HL,0xD02A9A",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 666156,
          "length": 4,
          "nextPc": 666160,
          "tag": "ld-pair-imm",
          "pair": "hl",
          "value": 13642394,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A30",
        "bytes": "01 1A 00 00",
        "asm": "LD BC,0x00001A",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 666160,
          "length": 4,
          "nextPc": 666164,
          "tag": "ld-pair-imm",
          "pair": "bc",
          "value": 26,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A34",
        "bytes": "ED B0",
        "asm": "LDIR",
        "tag": "ldir",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 666164,
          "length": 2,
          "nextPc": 666166,
          "tag": "ldir",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A36",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666166,
          "length": 1,
          "nextPc": 666167,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A37",
        "bytes": "6F",
        "asm": "LD L,A",
        "tag": "ld-reg-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666167,
          "length": 1,
          "nextPc": 666168,
          "tag": "ld-reg-reg",
          "dest": "l",
          "src": "a",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A38",
        "bytes": "26 1A",
        "asm": "LD H,0x1A",
        "tag": "ld-reg-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 666168,
          "length": 2,
          "nextPc": 666170,
          "tag": "ld-reg-imm",
          "dest": "h",
          "value": 26,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A3A",
        "bytes": "ED 6C",
        "asm": "mlt {\"pc\":666170,\"length\":2,\"nextPc\":666172,\"tag\":\"mlt\",\"reg\":\"hl\",\"mode\":\"adl\",\"modePrefix\":null}",
        "tag": "mlt",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 666170,
          "length": 2,
          "nextPc": 666172,
          "tag": "mlt",
          "reg": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A3C",
        "bytes": "B7",
        "asm": "OR A",
        "tag": "alu-reg",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666172,
          "length": 1,
          "nextPc": 666173,
          "tag": "alu-reg",
          "op": "or",
          "src": "a",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A3D",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666173,
          "length": 1,
          "nextPc": 666174,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A3E",
        "bytes": "CD 68 2A 0A",
        "asm": "CALL 0x0A2A68",
        "tag": "call",
        "target": "0x0A2A68",
        "fallthrough": "0x0A2A42",
        "length": 4,
        "raw": {
          "pc": 666174,
          "length": 4,
          "nextPc": 666178,
          "tag": "call",
          "target": 666216,
          "fallthrough": 666178,
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A42",
        "bytes": "2B",
        "asm": "DEC HL",
        "tag": "dec-pair",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666178,
          "length": 1,
          "nextPc": 666179,
          "tag": "dec-pair",
          "pair": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A43",
        "bytes": "7E",
        "asm": "LD A,(HL)",
        "tag": "ld-reg-ind",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666179,
          "length": 1,
          "nextPc": 666180,
          "tag": "ld-reg-ind",
          "dest": "a",
          "src": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A2A44",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 666180,
          "length": 1,
          "nextPc": 666181,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      }
    ],
    "tail0a22a4_0a22b1": [
      {
        "pc": "0x0A22A4",
        "bytes": "11 C0 06 D0",
        "asm": "LD DE,0xD006C0",
        "tag": "ld-pair-imm",
        "target": null,
        "fallthrough": null,
        "length": 4,
        "raw": {
          "pc": 664228,
          "length": 4,
          "nextPc": 664232,
          "tag": "ld-pair-imm",
          "pair": "de",
          "value": 13633216,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A8",
        "bytes": "19",
        "asm": "ADD HL,DE",
        "tag": "add-pair",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664232,
          "length": 1,
          "nextPc": 664233,
          "tag": "add-pair",
          "dest": "hl",
          "src": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22A9",
        "bytes": "E5",
        "asm": "PUSH HL",
        "tag": "push",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664233,
          "length": 1,
          "nextPc": 664234,
          "tag": "push",
          "pair": "hl",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AA",
        "bytes": "D1",
        "asm": "POP DE",
        "tag": "pop",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664234,
          "length": 1,
          "nextPc": 664235,
          "tag": "pop",
          "pair": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AB",
        "bytes": "13",
        "asm": "INC DE",
        "tag": "inc-pair",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664235,
          "length": 1,
          "nextPc": 664236,
          "tag": "inc-pair",
          "pair": "de",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AC",
        "bytes": "36 20",
        "asm": "LD (HL),0x20",
        "tag": "ld-ind-imm",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664236,
          "length": 2,
          "nextPc": 664238,
          "tag": "ld-ind-imm",
          "value": 32,
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22AE",
        "bytes": "ED B0",
        "asm": "LDIR",
        "tag": "ldir",
        "target": null,
        "fallthrough": null,
        "length": 2,
        "raw": {
          "pc": 664238,
          "length": 2,
          "nextPc": 664240,
          "tag": "ldir",
          "mode": "adl",
          "modePrefix": null
        }
      },
      {
        "pc": "0x0A22B0",
        "bytes": "C9",
        "asm": "RET",
        "tag": "ret",
        "target": null,
        "fallthrough": null,
        "length": 1,
        "raw": {
          "pc": 664240,
          "length": 1,
          "nextPc": 664241,
          "tag": "ret",
          "terminates": true,
          "mode": "adl",
          "modePrefix": null
        }
      }
    ]
  },
  "errors": []
}
```

## Interpretation

The current browser CLEAR/EOL failure is a zero-count call into the 0x0A22A4 space-fill tail. The decisive dynamic comparison is 0x0A223A entering with BC=0x0900 versus the later 0x0A22A4 entry from 0x0A2A37 with BC=0, HL=0, and DE=0x00013F. The captured register transition identifies the immediate owner of the zero count as the previous observed block/path before the tail, not the post-run space corruption caused by LDIR.

No runtime, transpiler, browser, scheduler, or follow-along files were modified.

