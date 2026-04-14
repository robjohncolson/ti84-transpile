# Phase 74: Home Status String Search (Manual Trace by CC)

## Plain-String Search Results

Searched ROM for uppercase status bar words. Results:

| Word | Hits | Addresses |
|------|-----:|-----------|
| NORMAL | 0 | — |
| FLOAT | 0 | — |
| AUTO | 2 | 0x883ae, 0xa1499 |
| REAL | 4 | 0x3ecfe, 0x55fcf, 0x62521, 0x62531 |
| RADIAN | 2 | 0x29139, 0x62496 |
| DEGREE | 2 | 0x29132, 0x624af |
| FUNCTION | 5 | 0x55e29, 0x55e69, 0x55fa7, 0x8a1f9, 0x8bce2 |
| PARAMETRIC | 2 | 0x8a263, 0x8bd29 |
| POLAR | 2 | 0x8a283, 0x8bd34 |

**Key observation**: NORMAL and FLOAT are not present as plain ASCII. The home status bar does NOT use these strings directly.

## TI-BASIC Token Table Discovery (at 0x0a0450)

Searched for the mixed-case "Normal", "Float", etc. — found a dense cluster at **0x0a0450-0x0a04e0** with this format:

```
<token_code> <length> <name_ascii>
```

Entries decoded:

| Token | Length | Name | Address |
|------:|-------:|------|---------|
| 0x4C | 4 | prgm | 0x0a0452 |
| 0x4D | 6 | Radian | 0x0a0457 |
| 0x4E | 6 | Degree | 0x0a045f |
| 0x4F | 6 | Normal | 0x0a0467 |
| 0x50 | 3 | Sci | 0x0a046f |
| 0x51 | 3 | Eng | 0x0a0474 |
| 0x52 | 5 | Float | 0x0a0479 |
| 0x53 | 4 | Fix ' ' (space) | 0x0a0495 |
| 0x54 | 5 | Horiz | 0x0a049b |
| 0x55 | 4 | Full | 0x0a04a2 |
| 0x56 | 4 | Func | 0x0a04a8 |
| 0x57 | 5 | Param | 0x0a04ae |
| 0x58 | 5 | Polar | 0x0a04b5 |
| 0x59 | 3 | Seq | 0x0a04bc |
| 0x5A | 10 | IndpntAuto | 0x0a04c0 |
| 0x5B | 9 | IndpntAsk | 0x0a04cc |
| 0x5C | 10 | DependAuto | 0x0a04d7 |
| 0x5D | 9 | DependAsk | 0x0a04e3 |

**This is the TI-BASIC token-to-name table.** Each mode setting has a token code in the range 0x4C-0x5D. The home status bar renders these by token code, not by plain string lookup.

## TEST Mode Angle Display (unrelated to home bar)

Block 0x0296dd contains:
- `ld hl, 0x029132 (DEGREE plain string) ; ld a, 0x91 ; call 0x028f02`
- `ld hl, 0x029139 (RADIAN plain string) ; ld a, 0x92 ; call 0x028f02`

This function loads plain "DEGREE"/"RADIAN" strings and calls 0x028f02 with a label code (0x91/0x92). The surrounding ROM string pool (0x029080-0x0291e0) contains TEST MODE setup strings: "ANGLE:", "STAT DIAGNOSTICS:", "RESET OPTIONS", "NUMERIC SOLVER:", etc. **This is the TEST MODE configuration screen, not the home status bar.**

## Verdict

The TI-84 home-screen status bar displays mode settings by **token code** (0x4C-0x5D range), not plain strings. The rendering flow is probably:

1. Read current notation mode from 0xD0008X+ RAM var → get token code (e.g., 0x4F for Normal)
2. Look up token in 0x0a0450 table: read length byte + copy name bytes into VRAM via 0x0059c6 char print
3. Advance cursor, repeat for next setting (float, angle, graph mode, etc.)

## Next Steps (Phase 75+)

1. **Find the "print token by code" helper**. It would take A=token_code, look up `table[A-0x4C]`, read length, iterate chars, call 0x0059c6 per char.
2. **Find code that reads mode state RAM and dispatches to the print-token helper**. This is the home status bar renderer.
3. **Search for loads of 0x0a0450 or 0x0a0452** — functions using `ld hl, 0x0a0452` are token-table consumers.
