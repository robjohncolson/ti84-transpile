# Phase 149 DD/FD Audit

## Summary

I audited `decodeDDFD()` in `TI-84_Plus_CE/ez80-decoder.js` lines 492-628 against Zilog UM0077 and then scanned the 4 MB ROM for candidate byte patterns.

The decoder currently has explicit handlers for 154 of the 256 possible DD/FD second-byte opcodes. The important finding is that the next DD/FD gaps are not the LEA forms from the task prompt. UM0077 shows that LEA is `ED`-prefixed, and the local decoder already handles those opcodes in `decodeED()` at `ez80-decoder.js` lines 760-770. The real unhandled DD/FD eZ80 instructions are:

- `07/17/27`: indexed 24-bit pair loads from `(IX/IY+d)` to `BC/DE/HL`
- `0F/1F/2F`: indexed 24-bit pair stores from `BC/DE/HL` to `(IX/IY+d)`
- `31/37`: indexed 24-bit loads from `(IX/IY+d)` into `IY/IX`
- `3E/3F`: indexed 24-bit stores from `IY/IX` into `(IX/IY+d)`

All raw hits for those missing encodings were inside the dense code region `0x000000-0x0BFFFF`. The combined raw-hit count for those missing opcodes is 10,104, which is too large to dismiss as data noise.

## Step 1: Explicitly handled DD/FD opcodes

`decodeDDFD()` handles these second-byte opcodes before the fallback:

- `0x09`, `0x19`, `0x21-0x26`, `0x29-0x2E`, `0x34-0x36`, `0x39`
- `0x40-0x75`, `0x77-0xBF`
- `0xCB`, `0xDD`, `0xE1`, `0xE3`, `0xE5`, `0xE9`, `0xED`, `0xF9`, `0xFD`

That is 154 explicit second-byte handlers total. Everything else falls through to the prefix-ignore path or the stacked-prefix NOP path.

### Opcode matrix

Legend:

- `H` = explicit handler in `decodeDDFD()`
- `U` = no explicit handler; falls through to the fallback
- `U*` = no explicit handler, and UM0077 says this second opcode is a real eZ80 DD/FD instruction

| hi\lo | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0x0x | U | U | U | U | U | U | U | U* | U | H | U | U | U | U | U | U* |
| 0x1x | U | U | U | U | U | U | U | U* | U | H | U | U | U | U | U | U* |
| 0x2x | U | H | H | H | H | H | H | U* | U | H | H | H | H | H | H | U* |
| 0x3x | U | U* | U | U | H | H | H | U* | U | H | U | U | U | U | U* | U* |
| 0x4x | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0x5x | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0x6x | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0x7x | H | H | H | H | H | H | U | H | H | H | H | H | H | H | H | H |
| 0x8x | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0x9x | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0xAx | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0xBx | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| 0xCx | U | U | U | U | U | U | U | U | U | U | U | H | U | U | U | U |
| 0xDx | U | U | U | U | U | U | U | U | U | U | U | U | U | H | U | U |
| 0xEx | U | H | U | H | U | H | U | U | U | H | U | U | U | H | U | U |
| 0xFx | U | U | U | U | U | U | U | U | U | H | U | U | U | H | U | U |

## Step 2: Manual cross-reference against UM0077

UM0077 confirms the following DD/FD forms:

- `LD rr,(IX/Y+d)` on page 229: `DD/FD 07`, `17`, `27` are real eZ80 indexed pair loads.
- `LD (IX/Y+d),rr` on page 222: `DD/FD 0F`, `1F`, `2F` are real eZ80 indexed pair stores.
- `LD IX/Y,(IX/Y+d)` on page 215: `DD/FD 31`, `37` are real eZ80 indexed index-register loads.
- `LD (IX/Y+d),IX/Y` on pages 218-219: `DD/FD 3E`, `3F` are real eZ80 indexed index-register stores.
- `LD (Mmn),IX/Y` on page 225: `DD/FD 22` is still the classic memory-store form and is already handled correctly by `decodeDDFD()`.
- `LEA IX/Y,IX/IY+d` and `LEA rr,IX/IY+d` on pages 250-253 are `ED`-prefixed (`ED 32/33/54/55` and `ED 02/03/12/13/22/23`), not DD/FD-prefixed. That matches the existing `decodeED()` logic.

### Corrected view of the task prompt's candidate list

| Candidate family from prompt | Manual result | Decoder impact |
|---|---|---|
| `DD/FD 07/17/27` | Real DD/FD eZ80 loads | Missing from `decodeDDFD()`; Phase 142 bug |
| `DD/FD 01/11` | Not DD/FD-only eZ80 opcodes | Not a decoder gap to add |
| `DD/FD 22` as LEA | Incorrect; `DD/FD 22` is `LD (Mmn),IX/IY` | Already handled correctly |
| `DD/FD 31/37` as SP forms | Incorrect; they are indexed `IX/IY` loads | Missing from `decodeDDFD()` |
| `DD/FD 02/12/22/32` LEA | Incorrect prefix; LEA is `ED` | Already handled in `decodeED()` |

## Step 3: ROM scan results

I scanned the ROM for both prefixes and each manual-confirmed missing opcode. Raw byte scans can include data false positives, but every hit below lands in the dense code region, and the counts are high enough that the signal is real.

### Manual-confirmed missing DD/FD instructions

| Opcode | DD meaning | FD meaning | DD hits | FD hits | Total hits | First DD hit | First FD hit |
|---|---|---|---:|---:|---:|---|---|
| `07` | `LD BC,(IX+d)` | `LD BC,(IY+d)` | 2494 | 670 | 3164 | `0x000922` | `0x0020bd` |
| `0F` | `LD (IX+d),BC` | `LD (IY+d),BC` | 1335 | 169 | 1504 | `0x000925` | `0x00102d` |
| `17` | `LD DE,(IX+d)` | `LD DE,(IY+d)` | 183 | 35 | 218 | `0x00037d` | `0x002043` |
| `1F` | `LD (IX+d),DE` | `LD (IY+d),DE` | 45 | 17 | 62 | `0x003043` | `0x00105c` |
| `27` | `LD HL,(IX+d)` | `LD HL,(IY+d)` | 2575 | 226 | 2801 | `0x00099b` | `0x002017` |
| `2F` | `LD (IX+d),HL` | `LD (IY+d),HL` | 1087 | 87 | 1174 | `0x0006af` | `0x001069` |
| `31` | `LD IY,(IX+d)` | `LD IX,(IY+d)` | 922 | 3 | 925 | `0x003262` | `0x00290e` |
| `37` | `LD IX,(IX+d)` | `LD IY,(IY+d)` | 4 | 37 | 41 | `0x01373d` | `0x0028de` |
| `3E` | `LD (IX+d),IY` | `LD (IY+d),IX` | 141 | 74 | 215 | `0x00ae31` | `0x000934` |
| `3F` | `LD (IX+d),IX` | `LD (IY+d),IY` | 0 | 0 | 0 | - | - |

### What the current fallback decodes instead

These are the most dangerous mismatches because the fallback also consumes the wrong instruction length:

| Missing second opcode | Actual eZ80 meaning | Current fallback meaning |
|---|---|---|
| `07` | indexed load into `BC` | `RLCA` |
| `0F` | indexed store from `BC` | `RRCA` |
| `17` | indexed load into `DE` | `RLA` |
| `1F` | indexed store from `DE` | `RRA` |
| `27` | indexed load into `HL` | `DAA` |
| `2F` | indexed store from `HL` | `CPL` |
| `31` | indexed load into `IX/IY` | `LD SP,Mmn` |
| `37` | indexed load into `IX/IY` | `SCF` |
| `3E` | indexed store from `IX/IY` | `LD A,n` |
| `3F` | indexed store from `IX/IY` | `CCF` |

### Prompt-listed suspect patterns after manual correction

These are the raw counts for the specific patterns named in the task prompt.

| Pattern | Raw hits | Manual status |
|---|---:|---|
| `DD 01` | 2 | Not a DD/FD-only eZ80 opcode |
| `DD 02` | 0 | LEA is `ED`-prefixed, not DD/FD |
| `DD 07` | 2494 | Real missing indexed pair load |
| `DD 11` | 4 | Not a DD/FD-only eZ80 opcode |
| `DD 12` | 3 | LEA is `ED`-prefixed, not DD/FD |
| `DD 17` | 183 | Real missing indexed pair load |
| `DD 22` | 30 | Classic `LD (Mmn),IX`; already handled |
| `DD 27` | 2575 | Real missing indexed pair load |
| `DD 31` | 922 | Real missing indexed index-register load |
| `DD 32` | 1 | LEA is `ED`-prefixed, not DD/FD |
| `DD 37` | 4 | Real missing indexed index-register load |
| `FD 01` | 137 | Not a DD/FD-only eZ80 opcode |
| `FD 02` | 13 | LEA is `ED`-prefixed, not DD/FD |
| `FD 07` | 670 | Real missing indexed pair load |
| `FD 11` | 11 | Not a DD/FD-only eZ80 opcode |
| `FD 12` | 0 | LEA is `ED`-prefixed, not DD/FD |
| `FD 17` | 35 | Real missing indexed pair load |
| `FD 22` | 6 | Classic `LD (Mmn),IY`; already handled |
| `FD 27` | 226 | Real missing indexed pair load |
| `FD 31` | 3 | Real missing indexed index-register load |
| `FD 32` | 3 | LEA is `ED`-prefixed, not DD/FD |
| `FD 37` | 37 | Real missing indexed index-register load |

## Priority ranking

1. Add `0F/1F/2F` next. These indexed pair stores are definitely real, heavily used, and currently fall through to rotate or CPL opcodes. `0F` and `2F` alone account for 2,678 raw hits.
2. Add `31` next to that. It is used 925 times, and the fallback misdecodes it as `LD SP,Mmn`, which is a much more destructive semantic and length mismatch than the one-byte ALU/control fallbacks.
3. Keep the Phase 142 fix for `07/17/27`. Those loads remain extremely common, with 6,183 combined raw hits.
4. Add `3E/37` after that. They are real and used, especially `3E`, but their counts are lower than the pair-load and pair-store families.
5. Leave `3F` for last. I found no hits in this ROM, so it is still worth correctness coverage but not urgent for the TI-84 CE boot path.

## Recommendation

The next decoder patch should add explicit `decodeDDFD()` handlers for these second opcodes in this order:

1. `0F`, `1F`, `2F`
2. `31`
3. `37`, `3E`, `3F`
4. Keep `07`, `17`, `27` if the separate Phase 142 fix is not merged yet

Do not add DD/FD LEA handlers. UM0077 shows LEA is `ED`-prefixed, and the local decoder already matches that design in `decodeED()`.

## Sources

- Local decoder: `TI-84_Plus_CE/ez80-decoder.js`
- Zilog eZ80 CPU User Manual UM0077: https://www.zilog.com/docs/um0077.pdf
  - page 215: `LD IX/Y,(IX/Y+d)` -> `DD/FD 31`, `37`
  - pages 218-219: `LD (IX/Y+d),IX/Y` -> `DD/FD 3E`, `3F`
  - page 222: `LD (IX/Y+d),rr` -> `DD/FD 0F`, `1F`, `2F`
  - page 225: `LD (Mmn),IX/Y` -> `DD/FD 22`
  - page 229: `LD rr,(IX/Y+d)` -> `DD/FD 07`, `17`, `27`
  - pages 250-253: `LEA` -> `ED` prefix, not DD/FD
