# Phase 408: OS Syscall/Jump Table Full Map

## 0. Header Verification

Magic at 0x020100: 0x5A 0xA5 0xFF 0xFF
Expected: 0x5A 0xA5 0xFF 0xFF -- MATCH

## 1. SDK Names (ti84pceg.inc)

Named entries found: 1410

## 2. Table Entry Extraction

Total entries: 2178
Table range: 0x020104 - 0x02230C (8712 bytes)

All 2,178 entries start with 0xC3 (JP opcode). No anomalies.

### Target Categorization

- Targets in flash (>= 0x040000): 1914
- Targets in low ROM (< 0x040000): 264
- Unique targets: 2160
- Duplicate targets (same address in multiple slots): 17

### Target Address Distribution

| Range | Count |
|-------|-------|
| 0x020000-0x02FFFF | 228 |
| 0x030000-0x03FFFF | 36 |
| 0x040000-0x04FFFF | 160 |
| 0x050000-0x05FFFF | 311 |
| 0x060000-0x06FFFF | 173 |
| 0x070000-0x07FFFF | 313 |
| 0x080000-0x08FFFF | 370 |
| 0x090000-0x09FFFF | 261 |
| 0x0A0000-0x0AFFFF | 196 |
| 0x0B0000-0x0BFFFF | 130 |

### Duplicate Targets (top 20)

| Target | Slots | Count |
|--------|-------|-------|
| 0x02672F | #1102, #1398, #1719 | 3 |
| 0x04C973 | #14, #1829 | 2 |
| 0x07DAD0 | #90, #2073 | 2 |
| 0x07DAF8 | #91, #2072 | 2 |
| 0x07F978 | #126, #127 | 2 |
| 0x07F97C | #129, #130 | 2 |
| 0x061E20 | #422, #1758 | 2 |
| 0x0970AB | #624, #1551 | 2 |
| 0x097703 | #637, #1384 | 2 |
| 0x0A3145 | #876, #1083 | 2 |
| 0x09D446 | #881, #882 | 2 |
| 0x099925 | #896, #930 | 2 |
| 0x05D163 | #1233, #1294 | 2 |
| 0x04AEE9 | #1441, #1447 | 2 |
| 0x030078 | #1645, #1646 | 2 |
| 0x04AE11 | #2097, #2098 | 2 |
| 0x04ADF4 | #2099, #2100 | 2 |

## 3. ROM References into the Table

Total references: 20 (12 unconditional, 8 conditional)

Unique slots called directly: 18

### All Referenced Slots

| Slot | Table Addr | JP Target | SDK Name | Callers |
|------|-----------|-----------|----------|---------|
| #1 | 0x020108 | 0x0401DF | BootOS | JP @ 0x0008B7 |
| #2 | 0x02010C | 0x03CF7D | InterruptHandler | JP @ 0x00071D |
| #3 | 0x020110 | 0x04AB5D | Rst10Handler | JP @ 0x000014 |
| #4 | 0x020114 | 0x04AB61 | Rst18Handler | JP @ 0x00001C |
| #5 | 0x020118 | 0x04AB65 | Rst20Handler | JP @ 0x000024 |
| #6 | 0x02011C | 0x04AB69 | Rst28Handler | JP @ 0x00002C |
| #7 | 0x020120 | 0x04AB6D | Rst30Handler | JP @ 0x000034 |
| #9 | 0x020128 | 0x040E7E | -- | CALL @ 0x013EC6 |
| #11 | 0x020130 | 0x023A1C | CallFontHook | CALL @ 0x005981 |
| #12 | 0x020134 | 0x02398E | CallLocalizeHook | CALL @ 0x005990 |
| #74 | 0x02022C | 0x07E5D8 | Tan | CALL Z @ 0x04D014; CALL Z @ 0x04D01C; CALL Z @ 0x04D024 |
| #321 | 0x020608 | 0x08294B | PushRealO4 | JP NC @ 0x06BBD9 |
| #609 | 0x020A88 | 0x05F65F | CpyO1ToES8 | CALL @ 0x0A8219 |
| #1025 | 0x021108 | 0x024334 | FindAppStart | JP PE @ 0x08EA27 |
| #1039 | 0x021140 | 0x040CD1 | ForceCmd | JP P @ 0x0400C0 |
| #1985 | 0x022008 | 0x0BC8AE | -- | CALL C @ 0x08DAB6 |
| #2025 | 0x0220A8 | 0x04AB71 | NMIHandler | JP @ 0x000054 |
| #2047 | 0x022100 | 0x071EA2 | -- | CALL Z @ 0x0AC90C |

### Caller Count by Slot (sorted)

| Slot | SDK Name | Table Addr | Caller Count |
|------|----------|-----------|-------------|
| #74 | Tan | 0x02022C | 3 |
| #3 | Rst10Handler | 0x020110 | 1 |
| #4 | Rst18Handler | 0x020114 | 1 |
| #5 | Rst20Handler | 0x020118 | 1 |
| #6 | Rst28Handler | 0x02011C | 1 |
| #7 | Rst30Handler | 0x020120 | 1 |
| #2025 | NMIHandler | 0x0220A8 | 1 |
| #2 | InterruptHandler | 0x02010C | 1 |
| #1 | BootOS | 0x020108 | 1 |
| #11 | CallFontHook | 0x020130 | 1 |
| #12 | CallLocalizeHook | 0x020134 | 1 |
| #9 | -- | 0x020128 | 1 |
| #1039 | ForceCmd | 0x021140 | 1 |
| #321 | PushRealO4 | 0x020608 | 1 |
| #1985 | -- | 0x022008 | 1 |
| #1025 | FindAppStart | 0x021108 | 1 |
| #609 | CpyO1ToES8 | 0x020A88 | 1 |
| #2047 | -- | 0x022100 | 1 |

## 4. SDK Names Cross-Reference

Named entries: 1410
Named entries with direct ROM callers: 15
Named entries with NO direct ROM callers: 1395 (called by apps/ASM programs at runtime)

### Named Entries (first 50)

| Slot | Address | Name | JP Target | ROM Callers |
|------|---------|------|-----------|-------------|
| #0 | 0x020104 | OSSize | 0x0BD6BA | 0 |
| #1 | 0x020108 | BootOS | 0x0401DF | 1 |
| #2 | 0x02010C | InterruptHandler | 0x03CF7D | 1 |
| #3 | 0x020110 | Rst10Handler | 0x04AB5D | 1 |
| #4 | 0x020114 | Rst18Handler | 0x04AB61 | 1 |
| #5 | 0x020118 | Rst20Handler | 0x04AB65 | 1 |
| #6 | 0x02011C | Rst28Handler | 0x04AB69 | 1 |
| #7 | 0x020120 | Rst30Handler | 0x04AB6D | 1 |
| #10 | 0x02012C | JErrorNo | 0x061DB6 | 0 |
| #11 | 0x020130 | CallFontHook | 0x023A1C | 1 |
| #12 | 0x020134 | CallLocalizeHook | 0x02398E | 1 |
| #13 | 0x020138 | LoadHLInd_s | 0x04C916 | 0 |
| #14 | 0x02013C | CpHLDE | 0x04C973 | 0 |
| #15 | 0x020140 | DivHLBy10_s | 0x04C950 | 0 |
| #16 | 0x020144 | DivHLByA_s | 0x04C952 | 0 |
| #17 | 0x020148 | KbdScan | 0x03F994 | 0 |
| #18 | 0x02014C | GetCSC | 0x03FA09 | 0 |
| #19 | 0x020150 | CoorMon | 0x08C331 | 0 |
| #20 | 0x020154 | Mon | 0x08C33D | 0 |
| #21 | 0x020158 | MonForceKey | 0x08C366 | 0 |
| #22 | 0x02015C | SendKPress | 0x08C509 | 0 |
| #23 | 0x020160 | JForceCmdNoChar | 0x08C630 | 0 |
| #24 | 0x020164 | JForceCmd | 0x08C631 | 0 |
| #25 | 0x020168 | SysErrHandler | 0x08C66D | 0 |
| #26 | 0x02016C | NewContext | 0x08C79F | 0 |
| #27 | 0x020170 | NewContext0 | 0x08C7AD | 0 |
| #28 | 0x020174 | PPutawayPrompt | 0x08C67C | 0 |
| #29 | 0x020178 | PPutAway | 0x08C689 | 0 |
| #30 | 0x02017C | PutAway | 0x08C69E | 0 |
| #31 | 0x020180 | SizeWind | 0x08C708 | 0 |
| #32 | 0x020184 | ErrorEP | 0x08C721 | 0 |
| #33 | 0x020188 | CallMain | 0x08C72F | 0 |
| #34 | 0x02018C | MonErrHand | 0x08C754 | 0 |
| #35 | 0x020190 | AppInit | 0x08C782 | 0 |
| #36 | 0x020194 | Initialize | 0x040B34 | 0 |
| #37 | 0x020198 | Min | 0x07C705 | 0 |
| #38 | 0x02019C | Max | 0x07C711 | 0 |
| #39 | 0x0201A0 | AbsO1PAbsO2 | 0x07C723 | 0 |
| #40 | 0x0201A4 | Intgr | 0x07C72D | 0 |
| #41 | 0x0201A8 | TRunc | 0x07C747 | 0 |
| #42 | 0x0201AC | InvSub | 0x07C74F | 0 |
| #43 | 0x0201B0 | Times2 | 0x07C755 | 0 |
| #44 | 0x0201B4 | Plus1 | 0x07C75B | 0 |
| #45 | 0x0201B8 | Minus1 | 0x07C76D | 0 |
| #46 | 0x0201BC | FPSub | 0x07C771 | 0 |
| #47 | 0x0201C0 | FPAdd | 0x07C77F | 0 |
| #48 | 0x0201C4 | DToR | 0x07C88B | 0 |
| #49 | 0x0201C8 | RToD | 0x07C897 | 0 |
| #50 | 0x0201CC | Cube | 0x07C8A3 | 0 |
| #51 | 0x0201D0 | TimesPT5 | 0x07C8A9 | 0 |

## 5. Table Dump (first 100 entries)

| Index | Address | Target | SDK Name |
|-------|---------|--------|----------|
| #0 | 0x020104 | 0x0BD6BA | OSSize |
| #1 | 0x020108 | 0x0401DF | BootOS |
| #2 | 0x02010C | 0x03CF7D | InterruptHandler |
| #3 | 0x020110 | 0x04AB5D | Rst10Handler |
| #4 | 0x020114 | 0x04AB61 | Rst18Handler |
| #5 | 0x020118 | 0x04AB65 | Rst20Handler |
| #6 | 0x02011C | 0x04AB69 | Rst28Handler |
| #7 | 0x020120 | 0x04AB6D | Rst30Handler |
| #8 | 0x020124 | 0x0272C9 |  |
| #9 | 0x020128 | 0x040E7E |  |
| #10 | 0x02012C | 0x061DB6 | JErrorNo |
| #11 | 0x020130 | 0x023A1C | CallFontHook |
| #12 | 0x020134 | 0x02398E | CallLocalizeHook |
| #13 | 0x020138 | 0x04C916 | LoadHLInd_s |
| #14 | 0x02013C | 0x04C973 | CpHLDE |
| #15 | 0x020140 | 0x04C950 | DivHLBy10_s |
| #16 | 0x020144 | 0x04C952 | DivHLByA_s |
| #17 | 0x020148 | 0x03F994 | KbdScan |
| #18 | 0x02014C | 0x03FA09 | GetCSC |
| #19 | 0x020150 | 0x08C331 | CoorMon |
| #20 | 0x020154 | 0x08C33D | Mon |
| #21 | 0x020158 | 0x08C366 | MonForceKey |
| #22 | 0x02015C | 0x08C509 | SendKPress |
| #23 | 0x020160 | 0x08C630 | JForceCmdNoChar |
| #24 | 0x020164 | 0x08C631 | JForceCmd |
| #25 | 0x020168 | 0x08C66D | SysErrHandler |
| #26 | 0x02016C | 0x08C79F | NewContext |
| #27 | 0x020170 | 0x08C7AD | NewContext0 |
| #28 | 0x020174 | 0x08C67C | PPutawayPrompt |
| #29 | 0x020178 | 0x08C689 | PPutAway |
| #30 | 0x02017C | 0x08C69E | PutAway |
| #31 | 0x020180 | 0x08C708 | SizeWind |
| #32 | 0x020184 | 0x08C721 | ErrorEP |
| #33 | 0x020188 | 0x08C72F | CallMain |
| #34 | 0x02018C | 0x08C754 | MonErrHand |
| #35 | 0x020190 | 0x08C782 | AppInit |
| #36 | 0x020194 | 0x040B34 | Initialize |
| #37 | 0x020198 | 0x07C705 | Min |
| #38 | 0x02019C | 0x07C711 | Max |
| #39 | 0x0201A0 | 0x07C723 | AbsO1PAbsO2 |
| #40 | 0x0201A4 | 0x07C72D | Intgr |
| #41 | 0x0201A8 | 0x07C747 | TRunc |
| #42 | 0x0201AC | 0x07C74F | InvSub |
| #43 | 0x0201B0 | 0x07C755 | Times2 |
| #44 | 0x0201B4 | 0x07C75B | Plus1 |
| #45 | 0x0201B8 | 0x07C76D | Minus1 |
| #46 | 0x0201BC | 0x07C771 | FPSub |
| #47 | 0x0201C0 | 0x07C77F | FPAdd |
| #48 | 0x0201C4 | 0x07C88B | DToR |
| #49 | 0x0201C8 | 0x07C897 | RToD |
| #50 | 0x0201CC | 0x07C8A3 | Cube |
| #51 | 0x0201D0 | 0x07C8A9 | TimesPT5 |
| #52 | 0x0201D4 | 0x07C8B3 | FPSquare |
| #53 | 0x0201D8 | 0x07C8B7 | FPMult |
| #54 | 0x0201DC | 0x07C9AF | LJRnd |
| #55 | 0x0201E0 | 0x07CA02 | InvOP1Sc |
| #56 | 0x0201E4 | 0x07CA06 | InvOP1S |
| #57 | 0x0201E8 | 0x07CA27 | InvOP2S |
| #58 | 0x0201EC | 0x07CA48 | Frac |
| #59 | 0x0201F0 | 0x07CAB1 | FPRecip |
| #60 | 0x0201F4 | 0x07CAB9 | FPDiv |
| #61 | 0x0201F8 | 0x07DF66 | SqRoot |
| #62 | 0x0201FC | 0x0685DF | RndGuard |
| #63 | 0x020200 | 0x0685FE | Rnfx |
| #64 | 0x020204 | 0x07CBB3 | Int |
| #65 | 0x020208 | 0x07CBB5 | Round |
| #66 | 0x02020C | 0x07E053 | LnX |
| #67 | 0x020210 | 0x07E071 | LogX |
| #68 | 0x020214 | 0x07CB98 | LJNoRnd |
| #69 | 0x020218 | 0x07E20D | EToX |
| #70 | 0x02021C | 0x07E219 | TenX |
| #71 | 0x020220 | 0x07E543 | SinCosRad |
| #72 | 0x020224 | 0x07E57B | Sin |
| #73 | 0x020228 | 0x07E5B5 | Cos |
| #74 | 0x02022C | 0x07E5D8 | Tan |
| #75 | 0x020230 | 0x07EB41 | SinhCosh |
| #76 | 0x020234 | 0x07EB45 | Tanh |
| #77 | 0x020238 | 0x07EB49 | Cosh |
| #78 | 0x02023C | 0x07EB4D | Sinh |
| #79 | 0x020240 | 0x07EC12 | ACosRad |
| #80 | 0x020244 | 0x07EC18 | ATanRad |
| #81 | 0x020248 | 0x07EC1E | ATan2Rad |
| #82 | 0x02024C | 0x07EC25 | ASinRad |
| #83 | 0x020250 | 0x07EC2F | ACos |
| #84 | 0x020254 | 0x07EC40 | ATan |
| #85 | 0x020258 | 0x07EC4F | ASin |
| #86 | 0x02025C | 0x07ECBF | ATan2 |
| #87 | 0x020260 | 0x07EED3 | ATanh |
| #88 | 0x020264 | 0x07EF5A | ASinh |
| #89 | 0x020268 | 0x07EF6B | ACosh |
| #90 | 0x02026C | 0x07DAD0 | PToR |
| #91 | 0x020270 | 0x07DAF8 | RToP |
| #92 | 0x020274 | 0x07F796 | HLTimes9 |
| #93 | 0x020278 | 0x07F7A4 | CkOP1Cplx |
| #94 | 0x02027C | 0x07F7BD | CkOP1Real |
| #95 | 0x020280 | 0x0685AA | Angle |
| #96 | 0x020284 | 0x07F7F2 | COP1Set0 |
| #97 | 0x020288 | 0x07F813 | Cpop4OP3 |
| #98 | 0x02028C | 0x07F81D | Mov9OP2Cp |
| #99 | 0x020290 | 0x07F829 | AbsO1O2Cp |

### Last 20 entries

| Index | Address | Target | SDK Name |
|-------|---------|--------|----------|
| #2158 | 0x0222BC | 0x04BBDA |  |
| #2159 | 0x0222C0 | 0x04BCF7 |  |
| #2160 | 0x0222C4 | 0x04BD06 |  |
| #2161 | 0x0222C8 | 0x04BD20 |  |
| #2162 | 0x0222CC | 0x04BD5F |  |
| #2163 | 0x0222D0 | 0x04BD79 |  |
| #2164 | 0x0222D4 | 0x04BD88 |  |
| #2165 | 0x0222D8 | 0x04BD97 |  |
| #2166 | 0x0222DC | 0x04BDA6 |  |
| #2167 | 0x0222E0 | 0x04BDB5 |  |
| #2168 | 0x0222E4 | 0x04CA87 |  |
| #2169 | 0x0222E8 | 0x04CA94 |  |
| #2170 | 0x0222EC | 0x04BDCF |  |
| #2171 | 0x0222F0 | 0x04BDDE |  |
| #2172 | 0x0222F4 | 0x0831B0 |  |
| #2173 | 0x0222F8 | 0x05E851 |  |
| #2174 | 0x0222FC | 0x05206E |  |
| #2175 | 0x022300 | 0x04C194 |  |
| #2176 | 0x022304 | 0x034F0C |  |
| #2177 | 0x022308 | 0x03573F |  |

## 6. RST Vector Mapping

| RST | Slot | SDK Name | JP Target |
|-----|------|----------|-----------|
| RST 0x10 | #3 | Rst10Handler | 0x04AB5D |
| RST 0x18 | #4 | Rst18Handler | 0x04AB61 |
| RST 0x20 | #5 | Rst20Handler | 0x04AB65 |
| RST 0x28 | #6 | Rst28Handler | 0x04AB69 |
| RST 0x30 | #7 | Rst30Handler | 0x04AB6D |

## 7. Summary

- **Table location**: 0x020104 - 0x02230C
- **Entries**: 2178 (all verified JP 0xC3)
- **Magic header**: 5A A5 FF FF at 0x020100
- **Unique JP targets**: 2160
- **Targets in flash**: 1914 (87.9%)
- **Targets in low ROM**: 264 (12.1%)
- **Duplicate target addresses**: 17
- **Slots called directly from ROM**: 18
- **Total CALL/JP references**: 20
- **SDK-named entries**: 1410
- **Named entries called from ROM**: 15
