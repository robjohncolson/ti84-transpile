# Phase 25G-h: TI-OS Scan-Key Cross-Reference Report

Date: 2026-04-21
Table: ROM 0x09F79B, 228 bytes (4 modifier planes × 57 raw scancodes)

## Scheme Identified

The translation table emits **TI-OS `k*` keypress equates** — the codes written to `kbdKey` / returned by `_GetKey` — **not** the `sk*` (scan-key, `_GetCSC`) codes.

This supersedes the note in the task spec that the existing DICT labels "match `sk*` names". The `sk*` constants max out at 0x38 (`skDel`), and named values like `skMath=0x2F`, `skSin=0x26`, `skTan=0x16` do not match the existing DICT entries for `0x8C=MATH`, `0x82=SIN`, `0x84=TAN`. In contrast, the `k*` table covers the full 0x00–0xFE range with entries that map cleanly onto every byte observed in the decoded scancode table, including:

- 0x05 = `kEnter` (observed at physical ENTER, NONE plane)
- 0x09 = `kClear` (observed at physical CLEAR, NONE plane)
- 0x0A = `kDel`, 0x0B = `kIns`, 0x13 = `kBackup`
- 0x9A–0xB3 = `kCapA`–`kCapZ` (ALPHA plane letters)
- 0xB4 = `kVarx`, 0xB5 = `kPi`, 0xB6 = `kInv`, 0xB7 = `kSin`, 0xB9 = `kCos`, 0xBB = `kTan`

### Source

Authoritative source: **`ti84pceg.inc`** from the CE C/C++ Toolchain, bundled with every CE native SDK build.

- URL: https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc
- Search pattern: `^\?k[A-Z][A-Za-z0-9_]*\s+:=\s+0[0-9A-Fa-f]+h`
- First keypress equate (line search): `?kRight := 001h`
- Block: "Keypress Equates" (line comment `;Keypress Equates` at top of section)

This is the same keypress equate list historically documented by WikiTI (`83Plus:Ports:F0`, `83Plus:Ports:F1` and the "GetKey values" references).

## Existing DICT Conflicts (not rewritten here)

Several existing DICT labels in `phase25g-f-decode.mjs` conflict with the authoritative `k*` values:

| Byte | Existing DICT | `k*` authoritative | Comment |
|------|---------------|--------------------|---------|
| 0x00 | `NONE`        | (multiple bit defs) | "no key" convention ≈ OK |
| 0x04 | `EQ`          | `kDown`            | DICT uses sk-style? Inconsistent |
| 0x09 | `ENTER`       | `kClear`           | sk* `skEnter=09h` but OS writes `k*` codes |
| 0x0A | `[+]`         | `kDel`             | sk* `skAdd=0Ah` |
| 0x0B | `[-]`         | `kIns`             | sk* `skSub=0Bh` |
| 0x0C | `[*]`         | `kRecall`          | sk* `skMul=0Ch` |
| 0x0D | `[/]`         | `kLastEnt`         | sk* `skDiv=0Dh` |
| 0x0E | `[^]`         | `kBOL`             | sk* `skPower=0Eh` |
| 0x0F | `[(]`         | `kEOL`             | sk* `skClear=0Fh` |
| 0x10 | `[)]`         | `kSelAll`          | sk* undefined at 10 |
| 0x11 | `[,]`         | `kUnselAll`        | sk* `skChs=11h` |
| 0x80 | `PI`          | `kAdd`             | No standard name matches DICT |
| 0x81 | `INV`         | `kSub`             | ″ |
| 0x82–0x93 | `SIN..ON` | `kMul..kDecPnt`   | Previous phases used aesthetic/TI-BASIC-ish labels; not `k*` |

Per task directive ("Entries that remain genuinely unresolvable should be left out so they fall through"), **existing entries were preserved unchanged.** The conflict is catalogued here for the next session to reconcile.

## Resolved Bytes Added to DICT (k* names)

Low range (previously unresolved placeholders 0x01 0x02 0x03 0x05 0x06 0x07 0x08 0x13):

| Byte | `k*` | Name |
|------|------|------|
| 0x01 | kRight      | RIGHT arrow emit |
| 0x02 | kLeft       | LEFT arrow emit |
| 0x03 | kUp         | UP arrow emit |
| 0x05 | kEnter      | ENTER emit |
| 0x06 | kAlphaEnter | ALPHA+ENTER emit |
| 0x07 | kAlphaUp    | ALPHA+UP emit |
| 0x08 | kAlphaDown  | ALPHA+DOWN emit |
| 0x13 | kBackup     | Backup/Link key emit |

High range (0x98–0xFB) — the ALPHA / 2nd+ALPHA plane emissions:

| Byte | `k*` | | Byte | `k*` | | Byte | `k*` |
|------|------|-|------|------|-|------|------|
| 0x98 | kEE       | | 0xB4 | kVarx    | | 0xCB | kQuote     |
| 0x99 | kSpace    | | 0xB5 | kPi      | | 0xCC | kTheta     |
| 0x9A | kCapA     | | 0xB6 | kInv     | | 0xE2 | kOutput    |
| 0x9B | kCapB     | | 0xB7 | kSin     | | 0xE3 | kGetKey    |
| 0x9C | kCapC     | | 0xB8 | kASin    | | 0xE4 | kClrHome   |
| 0x9D | kCapD     | | 0xB9 | kCos     | | 0xE5 | kPrtScr    |
| 0x9E | kCapE     | | 0xBA | kACos    | | 0xE6 | kSinH      |
| 0x9F | kCapF     | | 0xBB | kTan     | | 0xE7 | kCosH      |
| 0xA0 | kCapG     | | 0xBC | kATan    | | 0xE8 | kTanH      |
| 0xA1 | kCapH     | | 0xBD | kSquare  | | 0xE9 | kASinH     |
| 0xA2 | kCapI     | | 0xBE | kSqrt    | | 0xEA | kACosH     |
| 0xA3 | kCapJ     | | 0xBF | kLn      | | 0xEB | kATanH     |
| 0xA4 | kCapK     | | 0xC0 | kExp     | | 0xEC | kLBrace    |
| 0xA5 | kCapL     | | 0xC1 | kLog     | | 0xED | kRBrace    |
| 0xA6 | kCapM     | | 0xC2 | kALog    | | 0xEE | kI         |
| 0xA7 | kCapN     | | 0xC5 | kAns     | | 0xEF | kCONSTeA   |
| 0xA8 | kCapO     | | 0xC6 | kColon   | | 0xF0 | kPlot3     |
| 0xA9 | kCapP     | | 0xC9 | kRoot    | | 0xF1 | kFMin      |
| 0xAA | kCapQ     | | 0xCA | kQuest   | | 0xF2 | kFMax      |
| 0xAB | kCapR     | |      |          | | 0xF3 | kL1A       |
| 0xAC | kCapS     | |      |          | | 0xF4 | kL2A       |
| 0xAD | kCapT     | |      |          | | 0xF5 | kL3A       |
| 0xAE | kCapU     | |      |          | | 0xF6 | kL4A       |
| 0xAF | kCapV     | |      |          | | 0xF7 | kL5A       |
| 0xB0 | kCapW     | |      |          | | 0xF8 | kL6A       |
| 0xB1 | kCapX     | |      |          | | 0xF9 | kunA       |
| 0xB2 | kCapY     | |      |          | | 0xFA | kvnA       |
| 0xB3 | kCapZ     | |      |          | | 0xFB | kwnA (also kExtendEcho3) |

Count resolved: **8 low + 70 high = 78 bytes** added.

## Genuinely Unknown Bytes

The following requested bytes have **no `k*` definition** in `ti84pceg.inc` master:

- **0x94, 0x95, 0x96, 0x97** — gap between `kDecPnt` (0x8D) and `kEE` (0x98). Values 0x8E–0x97 are undefined in the keypress-equate block. Not emitted by any documented key, and absent from WikiTI's GetKey reference.

These are left out of DICT so they fall through to the `tok:0xNN` hex placeholder. If a future phase observes any of these actually being produced by the translation table at runtime, they may be CE-specific extensions (e.g., graphing-mode softkeys) that warrant dedicated investigation.

## Full 0x00–0xFF `k*` Scheme (derived)

Values sourced verbatim from the "Keypress Equates" block of `ti84pceg.inc` (master, commit as of 2026-04-21). Empty rows = gap / undefined.

| Byte | k* | | Byte | k* | | Byte | k* | | Byte | k* |
|------|------|-|------|------|-|------|------|-|------|------|
| 00 | (no key) | | 40 | kQuit      | | 80 | kAdd     | | C0 | kExp       |
| 01 | kRight   | | 41 | kLinkIO    | | 81 | kSub     | | C1 | kLog       |
| 02 | kLeft    | | 42 | kMatrixEd  | | 82 | kMul     | | C2 | kALog      |
| 03 | kUp      | | 43 | kStatEd    | | 83 | kDiv     | | C3 | kToABC     |
| 04 | kDown    | | 44 | kGraph     | | 84 | kExpon   | | C4 | kClrTbl    |
| 05 | kEnter   | | 45 | kMode      | | 85 | kLParen  | | C5 | kAns       |
| 06 | kAlphaEnter | | 46 | kPrgmEd | | 86 | kRParen  | | C6 | kColon     |
| 07 | kAlphaUp | | 47 | kPrgmCr    | | 87 | kLBrack  | | C7 | kNDeriv    |
| 08 | kAlphaDown | | 48 | kWindow  | | 88 | kRBrack  | | C8 | kFnInt     |
| 09 | kClear   | | 49 | kYequ      | | 89 | kShade   | | C9 | kRoot      |
| 0A | kDel     | | 4A | kTable     | | 8A | kStore   | | CA | kQuest     |
| 0B | kIns     | | 4B | kTblSet    | | 8B | kComma   | | CB | kQuote     |
| 0C | kRecall  | | 4C | kChkRAM    | | 8C | kChs     | | CC | kTheta     |
| 0D | kLastEnt | | 4D | kDelMem    | | 8D | kDecPnt  | | CD | kIf        |
| 0E | kBOL     | | 4E | kResetMem  | | 8E | —        | | CE | kThen      |
| 0F | kEOL     | | 4F | kResetDef  | | 8F | —        | | CF | kElse      |
| 10 | kSelAll  | | 50 | kPrgmInput | | 90 | —        | | D0 | kFor       |
| 11 | kUnselAll | | 51 | kZFactEd  | | 91 | —        | | D1 | kWhile     |
| 12 | kLtoTI82 | | 52 | kError     | | 92 | —        | | D2 | kRepeat    |
| 13 | kBackup  | | 53 | kSolveTVM  | | 93 | —        | | D3 | kEnd       |
| 14 | kRecieve | | 54 | kSolveRoot | | 94 | —        | | D4 | kPause     |
| 15 | kLnkQuit | | 55 | kStatP     | | 95 | —        | | D5 | kLbl       |
| 16 | kTrans   | | 56 | kInfStat   | | 96 | —        | | D6 | kGoto      |
| 17 | kRename  | | …  | …          | | 97 | —        | | D7 | kISG       |
| 18 | kOverw   | |    |            | | 98 | kEE      | | D8 | kDSL       |
| 19 | kOmit    | |    |            | | 99 | kSpace   | | D9 | kMenu      |
| 1A | kCont    | |    |            | | 9A | kCapA    | | DA | kExec      |
| 1B | kSendID  | |    |            | | 9B | kCapB    | | DB | kReturn    |
| 1C | kSendSW  | |    |            | | 9C | kCapC    | | DC | kStop      |
| 1D | kYes     | |    |            | | 9D | kCapD    | | DD | kInput     |
| 1E | kNoWay   | |    |            | | 9E | kCapE    | | DE | kPrompt    |
| 1F | kvSendType | |  |            | | 9F | kCapF    | | DF | kDisp      |
| 20 | kOverWAll | |   |            | | A0 | kCapG    | | E0 | kDispG     |
| …  | (21-24 gap) | | |           | | A1 | kCapH    | | E1 | kDispT     |
| 25 | kNo      | |    |            | | A2 | kCapI    | | E2 | kOutput    |
| 26 | kKReset  | |    |            | | A3 | kCapJ    | | E3 | kGetKey    |
| 27 | kApp     | |    |            | | A4 | kCapK    | | E4 | kClrHome   |
| 28 | kDoug    | |    |            | | A5 | kCapL    | | E5 | kPrtScr    |
| 29 | kListflag | |   |            | | A6 | kCapM    | | E6 | kSinH      |
| 2A | —        | |    |            | | A7 | kCapN    | | E7 | kCosH      |
| 2B | kAreYouSure | | |            | | A8 | kCapO    | | E8 | kTanH      |
| 2C | kAppsMenu | |   |            | | A9 | kCapP    | | E9 | kASinH     |
| 2D | kPrgm    | |    |            | | AA | kCapQ    | | EA | kACosH     |
| 2E | kZoom    | |    |            | | AB | kCapR    | | EB | kATanH     |
| 2F | kDraw    | |    |            | | AC | kCapS    | | EC | kLBrace    |
| 30 | kSPlot   | |    |            | | AD | kCapT    | | ED | kRBrace    |
| 31 | kStat    | |    |            | | AE | kCapU    | | EE | kI         |
| 32 | kMath    | |    |            | | AF | kCapV    | | EF | kCONSTeA   |
| 33 | kTest    | |    |            | | B0 | kCapW    | | F0 | kPlot3     |
| 34 | kChar    | |    |            | | B1 | kCapX    | | F1 | kFMin      |
| 35 | kVars    | |    |            | | B2 | kCapY    | | F2 | kFMax      |
| 36 | kMem     | |    |            | | B3 | kCapZ    | | F3 | kL1A       |
| 37 | kMatrix  | |    |            | | B4 | kVarx    | | F4 | kL2A       |
| 38 | kDist    | |    |            | | B5 | kPi      | | F5 | kL3A       |
| 39 | kAngle   | |    |            | | B6 | kInv     | | F6 | kL4A       |
| 3A | kList    | |    |            | | B7 | kSin     | | F7 | kL5A       |
| 3B | kCalc    | |    |            | | B8 | kASin    | | F8 | kL6A       |
| 3C | kFin     | |    |            | | B9 | kCos     | | F9 | kunA       |
| 3D | —        | |    |            | | BA | kACos    | | FA | kvnA       |
| 3E | kCatalog | |    |            | | BB | kTan     | | FB | kwnA / kExtendEcho3 |
| 3F | kInputDone | |  |            | | BC | kATan    | | FC | kExtendEcho2 |
|    |          | |    |            | | BD | kSquare  | | FD | —          |
|    |          | |    |            | | BE | kSqrt    | | FE | kExtendEcho |
|    |          | |    |            | | BF | kLn      | | FF | —          |

## Summary

- **Scheme**: TI-OS k* keypress equates (_GetKey codes), **not** sk*.
- **Source**: `ti84pceg.inc`, CE-Programming/toolchain (master).
- **Resolved**: 78 bytes (8 low + 70 high).
- **Unknown**: 4 bytes (0x94, 0x95, 0x96, 0x97) — documented gap in k* namespace.
- **DICT updates**: additive only; existing 0x00–0x93 labels preserved despite conflicts documented above.
