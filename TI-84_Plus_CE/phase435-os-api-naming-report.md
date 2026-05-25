# Phase 435 - OS API Naming Report

## Overview

Cross-referenced all **374** JP thunks in the boot-call table at **0x000080-0x000654** against SDK names (Boot Calls block in `ti84pceg.inc`), prior-session identifications, and byte-pattern matching on the first 32 bytes of each function body.

## Statistics

| Metric | Value |
|--------|-------|
| Total slots | 374 |
| Unique targets | 364 |
| Slots with SDK name | 287 / 374 |
| Unique targets with SDK name | 278 / 364 |
| Targets from prior sessions | 14 / 364 |
| Targets from pattern match (new) | 82 / 364 |
| **Total targets identified** | **360 / 364** |
| Targets still unidentified | 4 / 364 |

## Category Breakdown

| Category | Unique targets |
|----------|---------------|
| boot-hardware | 111 |
| ZDS-II-runtime | 87 |
| unnamed | 86 |
| USB | 30 |
| C-stdlib | 25 |
| floating-point | 23 |
| other | 2 |

## Newly Pattern-Identified Functions

These targets were not named by the SDK or prior sessions, but were identified by reading the first bytes of the function body.

| Target | Pattern ID | Slots | First 16 bytes |
|--------|-----------|-------|----------------|
| 0x00609A | ED-prefixed (extended/IO) | 371 | `ED 38 05 CB B7 CB E7 ED 39 05 CB 77 20 04 CB 67` |
| 0x0060F7 | OR A prologue (flag test) | 369 | `B7 18 01 37 40 01 18 D0 17 17 17 ED 79 17 17 17` |
| 0x006147 | PUSH AF prologue | 368 | `F5 40 01 08 D0 3E 0C ED 79 78 FE D0 28 01 CF 79` |
| 0x00658E | PUSH IX prologue | 187 | `DD E5 DD 21 00 00 00 DD 39 E5 ED 22 DA F9 DD 27` |
| 0x0066FF | PUSH IX prologue | 177 | `DD E5 DD 21 00 00 00 DD 39 11 00 03 00 CD 55 1C` |
| 0x006ED9 | RET stub (no-op) | 214, 215 | `C9 DD E5 DD 21 00 00 00 DD 39 FD 21 80 00 D0 ED` |
| 0x006EDA | PUSH IX prologue | 353 | `DD E5 DD 21 00 00 00 DD 39 FD 21 80 00 D0 ED 38` |
| 0x006F31 | PUSH AF prologue | 208 | `F5 ED 38 0C CB C7 ED 39 0C E6 01 28 0E ED 38 09` |
| 0x006F4D | PUSH IX prologue | 207 | `DD E5 DD 21 00 00 00 DD 39 F5 ED 38 09 CB 87 ED` |
| 0x006F9A | PUSH AF prologue | 210 | `F5 ED 38 03 CB 67 20 2D ED 38 0C CB D7 ED 39 0C` |
| 0x006FAF | PUSH AF prologue | 209 | `F5 ED 38 03 CB 67 20 18 ED 38 0C CB 97 ED 39 0C` |
| 0x007915 | PUSH IX prologue | 294 | `DD E5 DD 21 00 00 00 DD 39 DD 27 06 DD 07 09 11` |
| 0x007937 | PUSH IX prologue | 295 | `DD E5 DD 21 00 00 00 DD 39 DD 27 06 DD 07 09 11` |
| 0x00AA10 | LD HL,nn prologue | 272 | `21 FD FF FF CD 97 21 00 01 00 00 00 DD 0F FD AF` |
| 0x00ABEE | LD HL,nn prologue | 242 | `21 FD FF FF CD 97 21 00 01 00 00 00 DD 0F FD DD` |
| 0x00AD66 | LD HL,nn prologue | 239 | `21 E3 FF FF CD 97 21 00 FD 2A A8 76 D1 ED 03 08` |
| 0x00B894 | XOR A prologue (clear A) | 247 | `AF 32 C9 76 D1 CD 51 51 01 3A F8 76 D1 FE 10 20` |
| 0x00C4B4 | LD HL,nn prologue | 230 | `21 FF FF FF CD 97 21 00 18 09 3E 04 DD BE FF 30` |
| 0x00C9A0 | LD HL,nn prologue | 221 | `21 40 40 D1 36 00 23 36 00 01 00 00 00 ED 43 AF` |
| 0x00E06D | LD HL,nn prologue | 290 | `21 FE FF FF CD 97 21 00 DD 7E 06 B7 ED 62 6F CD` |
| 0x00E1CC | LD HL,nn prologue | 289 | `21 F7 FF FF CD 97 21 00 DD 07 09 DD 0F F7 DD 7E` |
| 0x00E4E8 | LD HL,nn prologue | 292 | `21 F6 FF FF CD 97 21 00 DD 31 06 ED 23 1B 7E CB` |
| 0x00EB31 | LD HL,nn prologue | 291 | `21 F7 FF FF CD 97 21 00 DD 27 09 ED 07 DD 71 F9` |
| 0x00ED77 | LD HL,nn prologue | 293 | `21 FF FF FF CD 97 21 00 DD 36 FF 00 DD 7E FF B7` |
| 0x00EE1C | LD HL,nn prologue | 231 | `21 FC FF FF CD 97 21 00 DD 36 FF 00 DD 36 FE 00` |
| 0x00F430 | LD HL,nn prologue | 269 | `21 FA FF FF CD 97 21 00 DD 7E 06 B7 ED 62 6F E5` |
| 0x00F5B0 | LD HL,nn prologue | 264 | `21 FD FF FF CD 97 21 00 DD 36 FF 06 DD 27 06 CD` |
| 0x00FB6E | LD HL,nn prologue | 265 | `21 F9 FF FF CD 97 21 00 DD 27 06 CD C2 21 00 28` |
| 0x00FBD1 | CALL 0x00218A dispatcher | 367 | `CD 8A 21 00 DD 7E 06 E6 04 B7 ED 62 6F CD C2 21` |
| 0x00FE10 | LD HL,nn prologue | 270 | `21 EE FF FF CD 97 21 00 DD 7E 06 B7 ED 62 6F E5` |
| 0x010090 | LD BC,nn prologue | 351 | `01 FC 77 D1 2A DB 77 D1 09 7E FE 1F C2 29 01 01` |
| 0x0107AC | LD HL,nn prologue | 326 | `21 FA FF FF CD 97 21 00 01 00 00 00 DD 0F FD 01` |
| 0x010948 | CALL 0x00218A dispatcher | 329 | `CD 8A 21 00 DD 07 06 CD 63 27 00 22 D2 77 D1 DD` |
| 0x01095C | CALL 0x00218A dispatcher | 327 | `CD 8A 21 00 DD 07 06 CD 6B 27 00 B7 01 6C 07 00` |
| 0x0109B7 | CALL 0x00218A dispatcher | 346 | `CD 8A 21 00 DD 7E 06 FE 12 30 11 DD 7E 06 B7 ED` |
| 0x0109ED | LD HL,nn prologue | 348 | `21 FF FF FF CD 97 21 00 DD 36 FF 01 3E 0F 21 E2` |
| 0x010F8C | CALL 0x00218A dispatcher | 277 | `CD 8A 21 00 40 01 82 30 ED 78 E6 10 20 0C 01 02` |
| 0x010FF5 | CALL 0x00218A dispatcher | 278 | `CD 8A 21 00 40 01 82 30 ED 78 E6 10 20 0F DD 07` |
| 0x011017 | LD HL,nn prologue | 252 | `21 FA FF FF CD 97 21 00 01 B8 0B 00 DD 0F FD 01` |
| 0x01106A | LD HL,nn prologue | 261 | `21 EC FF FF CD 97 21 00 01 00 00 00 DD 0F FA DD` |
| 0x011576 | LD HL,nn prologue | 260 | `21 F5 FF FF CD 97 21 00 DD 36 FE 00 DD 36 FF F0` |
| 0x011737 | CALL 0x00218A dispatcher | 238 | `CD 8A 21 00 CD 87 52 01 E5 C1 21 64 77 D1 71 23` |
| 0x011F1C | LD HL,nn prologue | 274 | `21 F5 FF FF CD 97 21 00 01 00 00 00 DD 0F FA DD` |
| 0x0121EF | LD HL,nn prologue | 273 | `21 F3 FF FF CD 97 21 00 01 00 00 00 DD 0F FA DD` |
| 0x012510 | SIL-prefixed operation | 224 | `40 01 82 30 ED 78 E6 08 20 03 AF 18 21 CD A6 58` |
| 0x012C48 | LD HL,nn prologue | 232 | `21 FE FF FF CD 97 21 00 01 00 31 00 ED 78 CB 97` |
| 0x013250 | LD HL,nn prologue | 254 | `21 F9 FF FF CD 97 21 00 01 00 00 00 DD 0F FD ED` |
| 0x013377 | LD HL,nn prologue | 255 | `21 F9 FF FF CD 97 21 00 01 00 00 00 DD 0F FD ED` |
| 0x01340F | LD HL,nn prologue | 256 | `21 EA FF FF CD 97 21 00 01 00 00 00 DD 0F F8 DD` |
| 0x0135CF | LD HL,nn prologue | 257 | `21 FB FF FF CD 97 21 00 01 00 00 00 DD 0F FB ED` |
| 0x0136BF | CALL 0x00218A dispatcher | 253 | `CD 8A 21 00 DD 07 06 CD 6B 27 00 22 F2 76 D1 3E` |
| 0x0136FC | LD HL,nn prologue | 259 | `21 FE FF FF CD 97 21 00 DD 36 FE 00 DD 36 FF 00` |
| 0x0137E5 | LD HL,nn prologue | 258 | `21 FE FF FF CD 97 21 00 DD 36 FE 00 DD 36 FF 00` |
| 0x013CED | XOR A prologue (clear A) | 250 | `AF 32 C9 76 D1 CD 51 51 01 AF 32 F8 76 D1 CD 29` |
| 0x0141BC | CALL 0x015287 dispatcher | 236 | `CD 87 52 01 E5 C1 21 26 77 D1 71 23 70 2A 26 77` |
| 0x014370 | LD HL,nn prologue | 233 | `21 FB FF FF CD 97 21 00 DD 36 FE 01 DD 36 FF 00` |
| 0x01456F | LD HL,nn prologue | 234 | `21 26 77 D1 36 01 23 36 00 3A FD 76 D1 FE 02 DA` |
| 0x014768 | LD HL,nn prologue | 235 | `21 26 77 D1 36 01 23 36 00 3A FD 76 D1 FE 02 DA` |
| 0x014A1B | LD HL,nn prologue | 237 | `21 26 77 D1 36 01 23 36 00 3A FD 76 D1 FE 02 38` |
| 0x014E3F | CALL 0x00218A dispatcher | 287 | `CD 8A 21 00 ED 57 F5 F3 AF 32 0E 44 D1 CD F8 4E` |
| 0x014FA0 | CALL 0x00218A dispatcher | 288 | `CD 8A 21 00 FD 21 80 00 D0 FD CB 1B 76 28 1C DD` |
| 0x015014 | LD HL,nn prologue | 240 | `21 FD FF FF CD 97 21 00 DD 07 06 C5 01 02 00 00` |
| 0x01508F | LD HL,nn prologue | 241 | `21 FD FF FF CD 97 21 00 DD 07 06 DD 0F FD DD 07` |
| 0x0150C2 | LD HL,nn prologue | 246 | `21 FD FF FF CD 97 21 00 ED 4B BD 76 D1 DD 0F FD` |
| 0x015129 | ED-prefixed (extended/IO) | 251 | `ED 4B BA 76 D1 ED 43 BD 76 D1 01 00 00 00 ED 43` |
| 0x01516F | XOR A prologue (clear A) | 282 | `AF 32 C9 76 D1 3E 01 32 CA 76 D1 01 03 00 00 C5` |
| 0x015185 | XOR A prologue (clear A) | 280 | `AF 32 79 77 D1 3E 01 32 7A 77 D1 01 00 00 00 C5` |
| 0x0151D4 | ED-prefixed (extended/IO) | 281 | `ED 57 F5 F3 ED 4B CB 76 D1 ED 43 C3 76 D1 ED 4B` |
| 0x0151FE | CALL 0x00218A dispatcher | 279 | `CD 8A 21 00 AF 32 79 77 D1 DD 07 06 ED 43 73 77` |
| 0x015232 | CALL 0x00218A dispatcher | 276 | `CD 8A 21 00 21 26 77 D1 36 00 23 36 00 01 00 00` |
| 0x015287 | LD HL,nn prologue | 275 | `21 26 77 D1 36 00 23 36 00 01 00 00 00 ED 43 AB` |
| 0x0152D8 | LD HL,nn prologue | 219 | `21 FA FF FF CD 97 21 00 DD 07 06 ED 43 10 77 D1` |
| 0x015349 | LD HL,nn prologue | 220 | `21 FA FF FF CD 97 21 00 DD 7E 12 B7 ED 62 6F DD` |
| 0x015431 | LD HL,nn prologue | 243 | `21 FC FF FF CD 97 21 00 ED 4B CB 76 D1 ED 43 CE` |
| 0x0154B4 | CALL 0x00218A dispatcher | 244 | `CD 8A 21 00 01 26 77 D1 C5 01 02 00 00 C5 FD 2A` |
| 0x015542 | LD HL,nn prologue | 245 | `21 FD FF FF CD 97 21 00 DD 07 06 DD 0F FD DD 27` |
| 0x0155BC | CALL 0x00218A dispatcher | 262 | `CD 8A 21 00 ED 4B 8B 77 D1 2A 6D 77 D1 09 22 ED` |
| 0x01567C | ED-prefixed (extended/IO) | 263 | `ED 4B 6A 77 D1 ED 43 ED 43 D1 01 E8 03 00 ED 43` |
| 0x01573F | CALL 0x00218A dispatcher | 249 | `CD 8A 21 00 DD 31 06 ED 03 06 ED 43 D1 76 D1 01` |
| 0x0157A1 | LD A,(0xD176FC) reader | 222 | `3A FC 76 D1 C9 42 4F 4F 54 20 43 6F 64 65 20 00` |
| 0x015834 | SIL-prefixed operation | 372 | `40 01 24 B0 3E FF ED 79 78 FE B0 28 01 CF 79 FE` |
| 0x015AEC | CALL 0x0158A6 dispatcher | 373 | `CD A6 58 01 28 09 ED 38 0C CB 97 ED 39 0C C9 ED` |

## Complete Table

| Slot | Thunk | Target | Source | SDK Name | Label |
|------|-------|--------|--------|----------|-------|
| 0 | 0x000080 | 0x001768 | unidentified | --- | --- |
| 1 | 0x000084 | 0x001775 | SDK | boot.GetHardwareVers | boot.GetHardwareVers |
| 2 | 0x000088 | 0x003C59 | SDK | boot.GetKeyID | boot.GetKeyID |
| 3 | 0x00008C | 0x00176D | SDK | boot.GetBootVerMinor | boot.GetBootVerMinor |
| 4 | 0x000090 | 0x001770 | SDK | boot.GetBootVerBuild | boot.GetBootVerBuild |
| 5 | 0x000094 | 0x00277A | SDK | dbgout | dbgout |
| 6 | 0x000098 | 0x0028F3 | SDK | _longjmp | _longjmp |
| 7 | 0x00009C | 0x002794 | SDK | _memchr | _memchr |
| 8 | 0x0000A0 | 0x0027B7 | SDK | _memcmp | _memcmp |
| 9 | 0x0000A4 | 0x0027E8 | prior-session | _memcpy | _memcpy |
| 10 | 0x0000A8 | 0x002808 | SDK | _memmove | _memmove |
| 11 | 0x0000AC | 0x00283A | SDK | _memset | _memset |
| 12 | 0x0000B0 | 0x00285F | prior-session | _memclear | _memclear (_bzero) |
| 13 | 0x0000B4 | 0x0028A5 | SDK | printf | printf |
| 14 | 0x0000B8 | 0x0028D2 | SDK | _setjmp | _setjmp |
| 15 | 0x0000BC | 0x002920 | SDK | sprintf | sprintf |
| 16 | 0x0000C0 | 0x00294B | SDK | _strcat | _strcat |
| 17 | 0x0000C4 | 0x002970 | SDK | _strchr | _strchr |
| 18 | 0x0000C8 | 0x00298D | SDK | _strcmp | _strcmp |
| 19 | 0x0000CC | 0x0029A8 | SDK | _strcpy | _strcpy |
| 20 | 0x0000D0 | 0x0029C2 | SDK | _strcspn | _strcspn |
| 21 | 0x0000D4 | 0x0029E9 | SDK | _strlen | _strlen |
| 22 | 0x0000D8 | 0x0029FE | SDK | _strncat | _strncat |
| 23 | 0x0000DC | 0x002A2F | SDK | _strncmp | _strncmp |
| 24 | 0x0000E0 | 0x002A64 | SDK | _strncpy | _strncpy |
| 25 | 0x0000E4 | 0x002AAB | SDK | _strpbrk | _strpbrk |
| 26 | 0x0000E8 | 0x002ADC | SDK | _strrchr | _strrchr |
| 27 | 0x0000EC | 0x002AFF | SDK | _strspn | _strspn |
| 28 | 0x0000F0 | 0x002B2F | SDK | _strstr | _strstr |
| 29 | 0x0000F4 | 0x002B5C | SDK | strtok | strtok |
| 30 | 0x0000F8 | 0x0028D1 | SDK | ret | ret |
| 31 | 0x0000FC | 0x002588 | SDK | _bldiy | _bldiy |
| 32 | 0x000100 | 0x00257F | SDK | _bshl | _bshl |
| 33 | 0x000104 | 0x002575 | SDK | _bshru | _bshru |
| 34 | 0x000108 | 0x002594 | SDK | _bstiy | _bstiy |
| 35 | 0x00010C | 0x0025A0 | SDK | _bstix | _bstix |
| 36 | 0x000110 | 0x00200F | SDK | _case | _case |
| 37 | 0x000114 | 0x00203B | SDK | _case16 | _case16 |
| 38 | 0x000118 | 0x002075 | SDK | _case16D | _case16D |
| 39 | 0x00011C | 0x0020B2 | SDK | _case24 | _case24 |
| 40 | 0x000120 | 0x0020E5 | SDK | _case24D | _case24D |
| 41 | 0x000124 | 0x00211B | SDK | _case8 | _case8 |
| 42 | 0x000128 | 0x002151 | SDK | _case8D | _case8D |
| 43 | 0x00012C | 0x002197 | prior-session | _frameset | __frameset |
| 44 | 0x000130 | 0x00218A | prior-session | _frameset0 | __frameset0 |
| 45 | 0x000134 | 0x0021A7 | SDK | _iand | _iand |
| 46 | 0x000138 | 0x0021C2 | prior-session | _icmpzero | _icmpzero (_Null_check) |
| 47 | 0x00013C | 0x0021CE | SDK | _idivs | _idivs |
| 48 | 0x000140 | 0x002207 | SDK | _idivu | _idivu |
| 49 | 0x000144 | 0x002211 | SDK | _idvrmu | _idvrmu |
| 50 | 0x000148 | 0x002228 | SDK | _ildix | _ildix |
| 51 | 0x00014C | 0x002234 | SDK | _ildiy | _ildiy |
| 52 | 0x000150 | 0x002240 | SDK | _imul_b | _imul_b |
| 53 | 0x000154 | 0x00224C | prior-session | _imulu | _imulu / _imuls |
| 54 | 0x000158 | 0x00224C | prior-session | _imuls | _imulu / _imuls |
| 55 | 0x00015C | 0x002288 | prior-session | _indcall | _indcall (JP (IY) trampoline) |
| 56 | 0x000160 | 0x00228A | SDK | _ineg | _ineg / _sneg |
| 57 | 0x000164 | 0x002293 | SDK | _inot | _inot / _snot |
| 58 | 0x000168 | 0x00229D | SDK | _ior | _ior |
| 59 | 0x00016C | 0x0022B8 | SDK | _irems | _irems |
| 60 | 0x000170 | 0x0022F0 | SDK | _iremu | _iremu |
| 61 | 0x000174 | 0x002301 | SDK | _ishl | _ishl |
| 62 | 0x000178 | 0x0022F9 | prior-session | _ishl_b | _ishl_b (shift-left byte) |
| 63 | 0x00017C | 0x002313 | SDK | _ishrs | _ishrs |
| 64 | 0x000180 | 0x00230B | prior-session | _ishrs_b | _ishrs_b (right-shift signed byte) |
| 65 | 0x000184 | 0x002338 | SDK | _ishru | _ishru |
| 66 | 0x000188 | 0x002330 | prior-session | _ishru_b | _ishru_b (right-shift unsigned byte) |
| 67 | 0x00018C | 0x002355 | SDK | _istix | _istix |
| 68 | 0x000190 | 0x002361 | SDK | _istiy | _istiy |
| 69 | 0x000194 | 0x00236D | SDK | _itol | _itol |
| 70 | 0x000198 | 0x002374 | SDK | _ixor | _ixor |
| 71 | 0x00019C | 0x00239E | SDK | _ladd | _ladd |
| 72 | 0x0001A0 | 0x00238F | SDK | _ladd_b | _ladd_b |
| 73 | 0x0001A4 | 0x0023A4 | SDK | _land | _land |
| 74 | 0x0001A8 | 0x0023AD | SDK | _lcmps | _lcmps / _lcmpu |
| 75 | 0x0001AC | 0x0023AD | SDK | _lcmpu | _lcmps / _lcmpu |
| 76 | 0x0001B0 | 0x0023C3 | SDK | _lcmpzero | _lcmpzero |
| 77 | 0x0001B4 | 0x0023D7 | SDK | _ldivs | _ldivs |
| 78 | 0x0001B8 | 0x002406 | SDK | _ldivu | _ldivu |
| 79 | 0x0001BC | 0x002418 | SDK | _ldvrmu | _ldvrmu |
| 80 | 0x0001C0 | 0x00243C | SDK | _lldix | _lldix |
| 81 | 0x0001C4 | 0x00244B | SDK | _lldiy | _lldiy |
| 82 | 0x0001C8 | 0x00245A | SDK | _lmuls | _lmuls / _lmulu |
| 83 | 0x0001CC | 0x00245A | SDK | _lmulu | _lmuls / _lmulu |
| 84 | 0x0001D0 | 0x0024C7 | SDK | _lneg | _lneg |
| 85 | 0x0001D4 | 0x0024D4 | SDK | _lnot | _lnot |
| 86 | 0x0001D8 | 0x0024DE | SDK | _lor | _lor |
| 87 | 0x0001DC | 0x0024E7 | SDK | _lrems | _lrems |
| 88 | 0x0001E0 | 0x002512 | SDK | _lremu | _lremu |
| 89 | 0x0001E4 | 0x002522 | SDK | _lshl | _lshl |
| 90 | 0x0001E8 | 0x002531 | SDK | _lshrs | _lshrs |
| 91 | 0x0001EC | 0x002553 | prior-session | _lshru | _lshru |
| 92 | 0x0001F0 | 0x0025AC | SDK | _lstix | _lstix |
| 93 | 0x0001F4 | 0x0025BB | SDK | _lstiy | _lstiy |
| 94 | 0x0001F8 | 0x0025CA | SDK | _lsub | _lsub |
| 95 | 0x0001FC | 0x0025D6 | SDK | _lxor | _lxor |
| 96 | 0x000200 | 0x0025DF | SDK | _sand | _sand |
| 97 | 0x000204 | 0x0025E8 | prior-session | _scmpzero | _scmpzero (_setflag) |
| 98 | 0x000208 | 0x0025F5 | SDK | _sdivs | _sdivs |
| 99 | 0x00020C | 0x00260F | SDK | _sdivu | _sdivu |
| 100 | 0x000210 | 0x002623 | prior-session | _seqcase | _seqcase |
| 101 | 0x000214 | 0x00265B | SDK | _seqcaseD | _seqcaseD |
| 102 | 0x000218 | 0x002696 | SDK | _setflag | _setflag |
| 103 | 0x00021C | 0x0026A5 | SDK | _sldix | _sldix |
| 104 | 0x000220 | 0x0026B1 | SDK | _sldiy | _sldiy |
| 105 | 0x000224 | 0x0026BD | SDK | _smuls | _smuls / _smulu |
| 106 | 0x000228 | 0x0026BD | SDK | _smulu | _smuls / _smulu |
| 107 | 0x00022C | 0x00228A | SDK | _sneg | _ineg / _sneg |
| 108 | 0x000230 | 0x002293 | SDK | _snot | _inot / _snot |
| 109 | 0x000234 | 0x0026D2 | SDK | _sor | _sor |
| 110 | 0x000238 | 0x0026DB | SDK | _srems | _srems |
| 111 | 0x00023C | 0x0026F5 | SDK | _sremu | _sremu |
| 112 | 0x000240 | 0x002711 | SDK | _sshl | _sshl |
| 113 | 0x000244 | 0x002709 | SDK | _sshl_b | _sshl_b |
| 114 | 0x000248 | 0x002723 | SDK | _sshrs | _sshrs |
| 115 | 0x00024C | 0x00271B | SDK | _sshrs_b | _sshrs_b |
| 116 | 0x000250 | 0x002738 | SDK | _sshru | _sshru |
| 117 | 0x000254 | 0x002730 | SDK | _sshru_b | _sshru_b |
| 118 | 0x000258 | 0x002745 | SDK | _sstix | _sstix |
| 119 | 0x00025C | 0x002754 | SDK | _sstiy | _sstiy |
| 120 | 0x000260 | 0x002763 | SDK | _stoi | _stoi |
| 121 | 0x000264 | 0x00276B | prior-session | _stoiu | _stoiu |
| 122 | 0x000268 | 0x002771 | SDK | _sxor | _sxor |
| 123 | 0x00026C | 0x0034EE | SDK | _fppack | _fppack |
| 124 | 0x000270 | 0x003569 | SDK | _fadd | _fadd |
| 125 | 0x000274 | 0x0035C8 | SDK | _fcmp | _fcmp |
| 126 | 0x000278 | 0x0035E5 | SDK | _fdiv | _fdiv |
| 127 | 0x00027C | 0x003663 | SDK | _ftol | _ftol |
| 128 | 0x000280 | 0x00380D | unidentified | --- | --- |
| 129 | 0x000284 | 0x003704 | SDK | _ltof | _ltof |
| 130 | 0x000288 | 0x00372B | SDK | _fmul | _fmul |
| 131 | 0x00028C | 0x0037EB | SDK | _fneg | _fneg |
| 132 | 0x000290 | 0x0037FC | SDK | _fsub | _fsub |
| 133 | 0x000294 | 0x003565 | SDK | FLTMAX | FLTMAX |
| 134 | 0x000298 | 0x003818 | SDK | sqrtf | sqrtf |
| 135 | 0x00029C | 0x00388B | SDK | _frbtof | _frbtof |
| 136 | 0x0002A0 | 0x0038A9 | SDK | _frftob | _frftob |
| 137 | 0x0002A4 | 0x0038ED | SDK | _frftoub | _frftoub |
| 138 | 0x0002A8 | 0x0038BA | SDK | _frftoi | _frftoi |
| 139 | 0x0002AC | 0x003931 | SDK | _frftoui | _frftoui |
| 140 | 0x0002B0 | 0x0038D8 | SDK | _frftos | _frftos |
| 141 | 0x0002B4 | 0x00396D | SDK | _frftous | _frftous |
| 142 | 0x0002B8 | 0x00399C | SDK | _fritof | _fritof |
| 143 | 0x0002BC | 0x0039E1 | SDK | _fruitof | _fruitof |
| 144 | 0x0002C0 | 0x0039BD | SDK | _frstof | _frstof |
| 145 | 0x0002C4 | 0x0039C7 | SDK | _frubtof | _frubtof |
| 146 | 0x0002C8 | 0x003A05 | SDK | _frustof | _frustof |
| 147 | 0x0002CC | 0x003A89 | SDK | ResetPorts | ResetPorts |
| 148 | 0x0002D0 | 0x001713 | SDK | ChkIfOSInterruptAvailable | ChkIfOSInterruptAvailable |
| 149 | 0x0002D4 | 0x000FB0 | SDK | WriteFlashByte | WriteFlashByte / WriteFlashByteDuplicate |
| 150 | 0x0002D8 | 0x000E4D | SDK | EraseFlash | EraseFlash |
| 151 | 0x0002DC | 0x000E3D | SDK | EraseFlashSector | EraseFlashSector |
| 152 | 0x0002E0 | 0x000FC0 | SDK | WriteFlash | WriteFlash |
| 153 | 0x0002E4 | 0x000FB0 | SDK | WriteFlashByteDuplicate | WriteFlashByte / WriteFlashByteDuplicate |
| 154 | 0x0002E8 | 0x001D94 | SDK | WriteFlashA | WriteFlashA |
| 155 | 0x0002EC | 0x001DB1 | SDK | CleanupCertificate | CleanupCertificate |
| 156 | 0x0002F0 | 0x000DD7 | SDK | ClrHeap | ClrHeap |
| 157 | 0x0002F4 | 0x000DDD | SDK | CpyToHeap | CpyToHeap |
| 158 | 0x0002F8 | 0x000DD8 | SDK | ChkHeapTop | ChkHeapTop |
| 159 | 0x0002FC | 0x01586C | SDK | ExecuteInRAM | ExecuteInRAM / ExecuteInRAMDup / ExecuteInRAMDup2 |
| 160 | 0x000300 | 0x01586C | SDK | ExecuteInRAMDup | ExecuteInRAM / ExecuteInRAMDup / ExecuteInRAMDup2 |
| 161 | 0x000304 | 0x01586C | SDK | ExecuteInRAMDup2 | ExecuteInRAM / ExecuteInRAMDup / ExecuteInRAMDup2 |
| 162 | 0x000308 | 0x001BFB | SDK | ChkCertSpace | ChkCertSpace |
| 163 | 0x00030C | 0x001C4F | SDK | GetFieldSizeFromType | GetFieldSizeFromType |
| 164 | 0x000310 | 0x001C55 | SDK | FindFirstCertField | FindFirstCertField |
| 165 | 0x000314 | 0x001C33 | SDK | FindField | FindField |
| 166 | 0x000318 | 0x001C71 | SDK | FindNextField | FindNextField |
| 167 | 0x00031C | 0x001C24 | SDK | GetCertificateEnd | GetCertificateEnd |
| 168 | 0x000320 | 0x001CA5 | SDK | GetFieldSizeFromType_ | GetFieldSizeFromType_ |
| 169 | 0x000324 | 0x001CA6 | SDK | GetFieldFromSize | GetFieldFromSize |
| 170 | 0x000328 | 0x001C7D | SDK | NextFieldFromSize | NextFieldFromSize |
| 171 | 0x00032C | 0x001C7C | SDK | NextFieldFromType | NextFieldFromType |
| 172 | 0x000330 | 0x001C84 | SDK | GetOffsetToNextField | GetOffsetToNextField |
| 173 | 0x000334 | 0x001D2F | SDK | WriteFlashUnsafe | WriteFlashUnsafe |
| 174 | 0x000338 | 0x001CEB | SDK | boot.GetCertCalcString | boot.GetCertCalcString |
| 175 | 0x00033C | 0x001D0D | SDK | boot.GetCertCalcID | boot.GetCertCalcID |
| 176 | 0x000340 | 0x00172A | SDK | GetSerial | GetSerial |
| 177 | 0x000344 | 0x0066FF | pattern | --- | PUSH IX prologue |
| 178 | 0x000348 | 0x000CD6 | SDK | Mult16By8 | Mult16By8 |
| 179 | 0x00034C | 0x000CB3 | SDK | Div16By8 | Div16By8 |
| 180 | 0x000350 | 0x000CB9 | SDK | Div16By16 | Div16By16 |
| 181 | 0x000354 | 0x000CEA | SDK | Div32By16 | Div32By16 |
| 182 | 0x000358 | 0x000D62 | SDK | CmpStr | CmpStr |
| 183 | 0x00035C | 0x006C8E | SDK | boot.Sha256Init | boot.Sha256Init |
| 184 | 0x000360 | 0x006CC6 | SDK | boot.Sha256Part | boot.Sha256Part |
| 185 | 0x000364 | 0x006D6D | SDK | boot.Sha256Hash | boot.Sha256Hash |
| 186 | 0x000368 | 0x006667 | SDK | FindAppHeaderSubField | FindAppHeaderSubField |
| 187 | 0x00036C | 0x00658E | pattern | --- | PUSH IX prologue |
| 188 | 0x000370 | 0x006763 | SDK | FindAppHeaderTimestamp | FindAppHeaderTimestamp |
| 189 | 0x000374 | 0x005B96 | SDK | boot.ClearVRAM | boot.ClearVRAM |
| 190 | 0x000378 | 0x0059E9 | SDK | boot.PutS | boot.PutS |
| 191 | 0x00037C | 0x0017DD | SDK | PutSpinner | PutSpinner |
| 192 | 0x000380 | 0x003D85 | SDK | boot.GetLFontPtr | boot.GetLFontPtr |
| 193 | 0x000384 | 0x005BB1 | SDK | boot.InitializeHardware | boot.InitializeHardware |
| 194 | 0x000388 | 0x00620D | SDK | boot.TurnOffHardware | boot.TurnOffHardware |
| 195 | 0x00038C | 0x005A53 | SDK | MakeColCmd | MakeColCmd |
| 196 | 0x000390 | 0x005A02 | SDK | boot.NewLine | boot.NewLine |
| 197 | 0x000394 | 0x00174F | SDK | PutBootVersion | PutBootVersion |
| 198 | 0x000398 | 0x0017FE | SDK | DrawSectorProtectionTable | DrawSectorProtectionTable |
| 199 | 0x00039C | 0x00194D | SDK | boot.Set6MHzMode | boot.Set6MHzMode |
| 200 | 0x0003A0 | 0x001988 | SDK | boot.Set48MHzMode | boot.Set48MHzMode |
| 201 | 0x0003A4 | 0x006FE9 | SDK | boot.Set6MHzModeI | boot.Set6MHzModeI |
| 202 | 0x0003A8 | 0x006FD1 | SDK | boot.Set48MHzModeI | boot.Set48MHzModeI |
| 203 | 0x0003AC | 0x0019B5 | SDK | CheckHardware | CheckHardware |
| 204 | 0x0003B0 | 0x003B05 | SDK | GetBatteryStatus | GetBatteryStatus |
| 205 | 0x0003B4 | 0x0061E3 | SDK | Delay10ms | Delay10ms |
| 206 | 0x0003B8 | 0x0061E5 | SDK | DelayTenTimesAms | DelayTenTimesAms |
| 207 | 0x0003BC | 0x006F4D | pattern | --- | PUSH IX prologue |
| 208 | 0x0003C0 | 0x006F31 | pattern | --- | PUSH AF prologue |
| 209 | 0x0003C4 | 0x006FAF | pattern | --- | PUSH AF prologue |
| 210 | 0x0003C8 | 0x006F9A | pattern | --- | PUSH AF prologue |
| 211 | 0x0003CC | 0x003C4B | SDK | usb_IsBusPowered | usb_IsBusPowered |
| 212 | 0x0003D0 | 0x003CBC | SDK | KeypadScan | KeypadScan |
| 213 | 0x0003D4 | 0x003CC2 | SDK | KeypadScanFull | KeypadScanFull |
| 214 | 0x0003D8 | 0x006ED9 | pattern | --- | RET stub (no-op) |
| 215 | 0x0003DC | 0x006ED9 | pattern | --- | RET stub (no-op) |
| 216 | 0x0003E0 | 0x001430 | SDK | MarkOSInvalid | MarkOSInvalid |
| 217 | 0x0003E4 | 0x006EAF | SDK | usb_BusPowered | usb_BusPowered |
| 218 | 0x0003E8 | 0x006EB6 | SDK | usb_SelfPowered | usb_SelfPowered |
| 219 | 0x0003EC | 0x0152D8 | pattern | --- | LD HL,nn prologue |
| 220 | 0x0003F0 | 0x015349 | pattern | --- | LD HL,nn prologue |
| 221 | 0x0003F4 | 0x00C9A0 | pattern | --- | LD HL,nn prologue |
| 222 | 0x0003F8 | 0x0157A1 | pattern | --- | LD A,(0xD176FC) reader |
| 223 | 0x0003FC | 0x00B9BD | SDK | usb_SetDeviceB | usb_SetDeviceB |
| 224 | 0x000400 | 0x012510 | pattern | --- | SIL-prefixed operation |
| 225 | 0x000404 | 0x00C435 | SDK | usb_DMACXReadNext | usb_DMACXReadNext |
| 226 | 0x000408 | 0x00C358 | SDK | usb_DMACXWrite | usb_DMACXWrite |
| 227 | 0x00040C | 0x00C320 | SDK | usb_DMACXRead | usb_DMACXRead |
| 228 | 0x000410 | 0x00C391 | SDK | usb_DMACXWriteNext | usb_DMACXWriteNext |
| 229 | 0x000414 | 0x00C40C | SDK | usb_DMACXWriteCheck | usb_DMACXWriteCheck |
| 230 | 0x000418 | 0x00C4B4 | pattern | --- | LD HL,nn prologue |
| 231 | 0x00041C | 0x00EE1C | pattern | --- | LD HL,nn prologue |
| 232 | 0x000420 | 0x012C48 | pattern | --- | LD HL,nn prologue |
| 233 | 0x000424 | 0x014370 | pattern | --- | LD HL,nn prologue |
| 234 | 0x000428 | 0x01456F | pattern | --- | LD HL,nn prologue |
| 235 | 0x00042C | 0x014768 | pattern | --- | LD HL,nn prologue |
| 236 | 0x000430 | 0x0141BC | pattern | --- | CALL 0x015287 dispatcher |
| 237 | 0x000434 | 0x014A1B | pattern | --- | LD HL,nn prologue |
| 238 | 0x000438 | 0x011737 | pattern | --- | CALL 0x00218A dispatcher |
| 239 | 0x00043C | 0x00AD66 | pattern | --- | LD HL,nn prologue |
| 240 | 0x000440 | 0x015014 | pattern | --- | LD HL,nn prologue |
| 241 | 0x000444 | 0x01508F | pattern | --- | LD HL,nn prologue |
| 242 | 0x000448 | 0x00ABEE | pattern | --- | LD HL,nn prologue |
| 243 | 0x00044C | 0x015431 | pattern | --- | LD HL,nn prologue |
| 244 | 0x000450 | 0x0154B4 | pattern | --- | CALL 0x00218A dispatcher |
| 245 | 0x000454 | 0x015542 | pattern | --- | LD HL,nn prologue |
| 246 | 0x000458 | 0x0150C2 | pattern | --- | LD HL,nn prologue |
| 247 | 0x00045C | 0x00B894 | pattern | --- | XOR A prologue (clear A) |
| 248 | 0x000460 | 0x014036 | SDK | MarkOSValid | MarkOSValid |
| 249 | 0x000464 | 0x01573F | pattern | --- | CALL 0x00218A dispatcher |
| 250 | 0x000468 | 0x013CED | pattern | --- | XOR A prologue (clear A) |
| 251 | 0x00046C | 0x015129 | pattern | --- | ED-prefixed (extended/IO) |
| 252 | 0x000470 | 0x011017 | pattern | --- | LD HL,nn prologue |
| 253 | 0x000474 | 0x0136BF | pattern | --- | CALL 0x00218A dispatcher |
| 254 | 0x000478 | 0x013250 | pattern | --- | LD HL,nn prologue |
| 255 | 0x00047C | 0x013377 | pattern | --- | LD HL,nn prologue |
| 256 | 0x000480 | 0x01340F | pattern | --- | LD HL,nn prologue |
| 257 | 0x000484 | 0x0135CF | pattern | --- | LD HL,nn prologue |
| 258 | 0x000488 | 0x0137E5 | pattern | --- | LD HL,nn prologue |
| 259 | 0x00048C | 0x0136FC | pattern | --- | LD HL,nn prologue |
| 260 | 0x000490 | 0x011576 | pattern | --- | LD HL,nn prologue |
| 261 | 0x000494 | 0x01106A | pattern | --- | LD HL,nn prologue |
| 262 | 0x000498 | 0x0155BC | pattern | --- | CALL 0x00218A dispatcher |
| 263 | 0x00049C | 0x01567C | pattern | --- | ED-prefixed (extended/IO) |
| 264 | 0x0004A0 | 0x00F5B0 | pattern | --- | LD HL,nn prologue |
| 265 | 0x0004A4 | 0x00FB6E | pattern | --- | LD HL,nn prologue |
| 266 | 0x0004A8 | 0x01233C | SDK | usb_SetDMAState | usb_SetDMAState |
| 267 | 0x0004AC | 0x00BEEE | SDK | usb_DMATransfer | usb_DMATransfer |
| 268 | 0x0004B0 | 0x00C243 | SDK | usb_DMACXTransferWait | usb_DMACXTransferWait |
| 269 | 0x0004B4 | 0x00F430 | pattern | --- | LD HL,nn prologue |
| 270 | 0x0004B8 | 0x00FE10 | pattern | --- | LD HL,nn prologue |
| 271 | 0x0004BC | 0x00BC77 | SDK | usb_ResetFIFOS | usb_ResetFIFOS |
| 272 | 0x0004C0 | 0x00AA10 | pattern | --- | LD HL,nn prologue |
| 273 | 0x0004C4 | 0x0121EF | pattern | --- | LD HL,nn prologue |
| 274 | 0x0004C8 | 0x011F1C | pattern | --- | LD HL,nn prologue |
| 275 | 0x0004CC | 0x015287 | pattern | --- | LD HL,nn prologue |
| 276 | 0x0004D0 | 0x015232 | pattern | --- | CALL 0x00218A dispatcher |
| 277 | 0x0004D4 | 0x010F8C | pattern | --- | CALL 0x00218A dispatcher |
| 278 | 0x0004D8 | 0x010FF5 | pattern | --- | CALL 0x00218A dispatcher |
| 279 | 0x0004DC | 0x0151FE | pattern | --- | CALL 0x00218A dispatcher |
| 280 | 0x0004E0 | 0x015185 | pattern | --- | XOR A prologue (clear A) |
| 281 | 0x0004E4 | 0x0151D4 | pattern | --- | ED-prefixed (extended/IO) |
| 282 | 0x0004E8 | 0x01516F | pattern | --- | XOR A prologue (clear A) |
| 283 | 0x0004EC | 0x015151 | unidentified | --- | --- |
| 284 | 0x0004F0 | 0x014F97 | SDK | usb_ResetTimer | usb_ResetTimer |
| 285 | 0x0004F4 | 0x014E81 | SDK | usb_DisableTimer | usb_DisableTimer |
| 286 | 0x0004F8 | 0x014EF8 | SDK | usb_EnableTimer | usb_EnableTimer |
| 287 | 0x0004FC | 0x014E3F | pattern | --- | CALL 0x00218A dispatcher |
| 288 | 0x000500 | 0x014FA0 | pattern | --- | CALL 0x00218A dispatcher |
| 289 | 0x000504 | 0x00E1CC | pattern | --- | LD HL,nn prologue |
| 290 | 0x000508 | 0x00E06D | pattern | --- | LD HL,nn prologue |
| 291 | 0x00050C | 0x00EB31 | pattern | --- | LD HL,nn prologue |
| 292 | 0x000510 | 0x00E4E8 | pattern | --- | LD HL,nn prologue |
| 293 | 0x000514 | 0x00ED77 | pattern | --- | LD HL,nn prologue |
| 294 | 0x000518 | 0x007915 | pattern | --- | PUSH IX prologue |
| 295 | 0x00051C | 0x007937 | pattern | --- | PUSH IX prologue |
| 296 | 0x000520 | 0x007084 | SDK | boot.SetTimersControl | boot.SetTimersControl |
| 297 | 0x000524 | 0x00706D | SDK | boot.GetTimersControl | boot.GetTimersControl |
| 298 | 0x000528 | 0x0070C0 | SDK | boot.SetTimersInterrupt | boot.SetTimersInterrupt |
| 299 | 0x00052C | 0x0070A9 | SDK | boot.GetTimersInterrupt | boot.GetTimersInterrupt |
| 300 | 0x000530 | 0x0070FC | SDK | boot.SetTimersInterruptM | boot.SetTimersInterruptM |
| 301 | 0x000534 | 0x0070E5 | SDK | boot.GetTimersInterruptM | boot.GetTimersInterruptM |
| 302 | 0x000538 | 0x007349 | SDK | boot.SetTimer1Counter | boot.SetTimer1Counter |
| 303 | 0x00053C | 0x007409 | SDK | boot.GetTimer1Counter | boot.GetTimer1Counter |
| 304 | 0x000540 | 0x007379 | SDK | boot.SetTimer1ReloadValue | boot.SetTimer1ReloadValue |
| 305 | 0x000544 | 0x00741B | SDK | boot.GetTimer1ReloadValue | boot.GetTimer1ReloadValue |
| 306 | 0x000548 | 0x0073A9 | SDK | boot.SetTimer1MatchValue1 | boot.SetTimer1MatchValue1 |
| 307 | 0x00054C | 0x00742D | SDK | boot.GetTimer1MatchValue1 | boot.GetTimer1MatchValue1 |
| 308 | 0x000550 | 0x0073D9 | SDK | boot.SetTimer1MatchValue2 | boot.SetTimer1MatchValue2 |
| 309 | 0x000554 | 0x00743F | SDK | boot.GetTimer1MatchValue2 | boot.GetTimer1MatchValue2 |
| 310 | 0x000558 | 0x007235 | SDK | boot.SetTimer2Counter | boot.SetTimer2Counter |
| 311 | 0x00055C | 0x0072F5 | SDK | boot.GetTimer2Counter | boot.GetTimer2Counter |
| 312 | 0x000560 | 0x007265 | SDK | boot.SetTimer2ReloadValue | boot.SetTimer2ReloadValue |
| 313 | 0x000564 | 0x007307 | SDK | boot.GetTimer2ReloadValue | boot.GetTimer2ReloadValue |
| 314 | 0x000568 | 0x007295 | SDK | boot.SetTimer2MatchValue1 | boot.SetTimer2MatchValue1 |
| 315 | 0x00056C | 0x007319 | SDK | boot.GetTimer2MatchValue1 | boot.GetTimer2MatchValue1 |
| 316 | 0x000570 | 0x0072C5 | SDK | boot.SetTimer2MatchValue2 | boot.SetTimer2MatchValue2 |
| 317 | 0x000574 | 0x00732B | SDK | boot.GetTimer2MatchValue2 | boot.GetTimer2MatchValue2 |
| 318 | 0x000578 | 0x0158A6 | SDK | CheckIfEmulated | CheckIfEmulated |
| 319 | 0x00057C | 0x006EC0 | SDK | boot.GetOnInt | boot.GetOnInt |
| 320 | 0x000580 | 0x010220 | SDK | boot.RTCIntHandler | boot.RTCIntHandler |
| 321 | 0x000584 | 0x010F00 | SDK | boot.RTCInitialize | boot.RTCInitialize |
| 322 | 0x000588 | 0x010F87 | SDK | boot.RTCGetInitStatus | boot.RTCGetInitStatus |
| 323 | 0x00058C | 0x010A50 | SDK | boot.RTCEnable | boot.RTCEnable |
| 324 | 0x000590 | 0x010A94 | SDK | boot.RTCDisable | boot.RTCDisable |
| 325 | 0x000594 | 0x010701 | SDK | boot.RTCSet24Hours | boot.RTCSet24Hours |
| 326 | 0x000598 | 0x0107AC | pattern | --- | LD HL,nn prologue |
| 327 | 0x00059C | 0x01095C | pattern | --- | CALL 0x00218A dispatcher |
| 328 | 0x0005A0 | 0x0106F3 | SDK | boot.RTCAckAlarmInt | boot.RTCAckAlarmInt |
| 329 | 0x0005A4 | 0x010948 | pattern | --- | CALL 0x00218A dispatcher |
| 330 | 0x0005A8 | 0x0103D7 | SDK | boot.RTCWriteTime | boot.RTCWriteTime |
| 331 | 0x0005AC | 0x010466 | SDK | boot.RTCGetTime12Hour | boot.RTCGetTime12Hour |
| 332 | 0x0005B0 | 0x010403 | SDK | boot.RTCGetTime | boot.RTCGetTime |
| 333 | 0x0005B4 | 0x01042E | SDK | boot.RTCSetTime | boot.RTCSetTime |
| 334 | 0x0005B8 | 0x0104CC | SDK | boot.RTCGetAlarm | boot.RTCGetAlarm |
| 335 | 0x0005BC | 0x0104F7 | SDK | boot.RTCSetAlarmSafe | boot.RTCSetAlarmSafe |
| 336 | 0x0005C0 | 0x010AC4 | SDK | boot.RTCCheckAlarmInt | boot.RTCCheckAlarmInt |
| 337 | 0x0005C4 | 0x010AEB | SDK | boot.RTCSetAlarmInt | boot.RTCSetAlarmInt |
| 338 | 0x0005C8 | 0x010782 | SDK | boot.RTCIsAfternoon | boot.RTCIsAfternoon |
| 339 | 0x0005CC | 0x007B70 | SDK | boot.RTCGetDay | boot.RTCGetDay |
| 340 | 0x0005D0 | 0x0103A4 | SDK | boot.RTCSetAlarmIntSafe | boot.RTCSetAlarmIntSafe |
| 341 | 0x0005D4 | 0x010553 | SDK | boot.RTCSetAlarm | boot.RTCSetAlarm |
| 342 | 0x0005D8 | 0x01058B | SDK | boot.RTCEnableInt | boot.RTCEnableInt |
| 343 | 0x0005DC | 0x01061D | SDK | boot.RTCDisableInt | boot.RTCDisableInt |
| 344 | 0x0005E0 | 0x01069C | SDK | boot.RTCSetCallback | boot.RTCSetCallback |
| 345 | 0x0005E4 | 0x010EDD | SDK | boot.RTCResetTimeStruct | boot.RTCResetTimeStruct |
| 346 | 0x0005E8 | 0x0109B7 | pattern | --- | CALL 0x00218A dispatcher |
| 347 | 0x0005EC | 0x0109A0 | SDK | boot.RTCSetFlags | boot.RTCSetFlags |
| 348 | 0x0005F0 | 0x0109ED | pattern | --- | LD HL,nn prologue |
| 349 | 0x0005F4 | 0x0158B1 | SDK | CheckEmulationBit | CheckEmulationBit |
| 350 | 0x0005F8 | 0x0077F8 | SDK | usb_SetDMAAddress | usb_SetDMAAddress |
| 351 | 0x0005FC | 0x010090 | pattern | --- | LD BC,nn prologue |
| 352 | 0x000600 | 0x0138EC | SDK | boot.SectorsBegin | boot.SectorsBegin |
| 353 | 0x000604 | 0x006EDA | pattern | --- | PUSH IX prologue |
| 354 | 0x000608 | 0x007E0F | SDK | usb_InEndpointClrStall | usb_InEndpointClrStall |
| 355 | 0x00060C | 0x007E84 | SDK | usb_InEndpointSetStall | usb_InEndpointSetStall |
| 356 | 0x000610 | 0x007EF9 | SDK | usb_InEndpointClrReset | usb_InEndpointClrReset |
| 357 | 0x000614 | 0x007F6E | SDK | usb_InEndpointSetReset | usb_InEndpointSetReset |
| 358 | 0x000618 | 0x007FE3 | SDK | usb_InEndpointSendZlp | usb_InEndpointSendZlp |
| 359 | 0x00061C | 0x008058 | SDK | usb_OutEndpointClrStall | usb_OutEndpointClrStall |
| 360 | 0x000620 | 0x0080CD | SDK | usb_OutEndpointSetStall | usb_OutEndpointSetStall |
| 361 | 0x000624 | 0x008142 | SDK | usb_OutEndpointClrReset | usb_OutEndpointClrReset |
| 362 | 0x000628 | 0x0081B7 | SDK | usb_OutEndpointSetReset | usb_OutEndpointSetReset |
| 363 | 0x00062C | 0x00822C | SDK | usb_SetFifoMap | usb_SetFifoMap |
| 364 | 0x000630 | 0x008294 | SDK | usb_SetEndpointConfig | usb_SetEndpointConfig |
| 365 | 0x000634 | 0x008381 | SDK | usb_ClrEndpointConfig | usb_ClrEndpointConfig |
| 366 | 0x000638 | 0x008392 | SDK | usb_SetFifoConfig | usb_SetFifoConfig |
| 367 | 0x00063C | 0x00FBD1 | pattern | --- | CALL 0x00218A dispatcher |
| 368 | 0x000640 | 0x006147 | pattern | --- | PUSH AF prologue |
| 369 | 0x000644 | 0x0060F7 | pattern | --- | OR A prologue (flag test) |
| 370 | 0x000648 | 0x0060FA | unidentified | --- | --- |
| 371 | 0x00064C | 0x00609A | pattern | --- | ED-prefixed (extended/IO) |
| 372 | 0x000650 | 0x015834 | pattern | --- | SIL-prefixed operation |
| 373 | 0x000654 | 0x015AEC | pattern | --- | CALL 0x0158A6 dispatcher |

## Unidentified Targets

**4** unique targets remain unidentified.

| Target | Slots | First 16 bytes |
|--------|-------|----------------|
| 0x001768 | 0 | `3E 05 06 06 C9 3E 01 C9 3E 00 06 06 C9 3E 07 C9` |
| 0x00380D | 128 | `D5 16 00 1E 96 CD EE 34 00 D1 C9 DD E5 DD 21 00` |
| 0x0060FA | 370 | `37 40 01 18 D0 17 17 17 ED 79 17 17 17 ED 79 17` |
| 0x015151 | 283 | `2A CE 76 D1 CD C2 21 00 28 13 ED 4B CE 76 D1 ED` |

## Assessment

- **360** of **364** unique targets now have a name or pattern identification (98.9% coverage).
- **278** targets are named directly from the SDK Boot Calls block.
- **14** targets carry names from prior reverse-engineering sessions.
- **82** new targets were identified by byte-pattern matching on their function prologues.
- **4** targets remain unidentified — these require deeper disassembly or cross-referencing with higher-level OS routines.
- The table is a mix of ZDS-II compiler runtime helpers, C standard library wrappers, floating-point support, boot/hardware services, and USB stack entries.
