# TI-84 CE Keyboard Matrix — MMIO at 0xE00800

Scan codes from 0x0159C0 = `(group << 4) | bit`. 63/64 active positions.
Phase 24F verified keys marked with **V**.

## Scan Code Table

```
       Bit0      Bit1      Bit2      Bit3      Bit4      Bit5      Bit6      Bit7
G0:    (none)    DOWN      LEFT      RIGHT(V)  UP        ???       ???       ???
G1:    MATH      APPS(V+)  SIN       COS       TAN       ^         ???       ???
G2:    ???       X,T,θ,n   ???       ,         (         )         ÷         ???
G3:    0(V)      1         4         7         ???       ???       ???       STAT
G4:    GRAPH(V)  TRACE     ZOOM      WINDOW    Y=(V)     2ND       MODE      DEL
       (note: swap? see below)
G5:    ???       STO→      LN        LOG       x²        x⁻¹      ???       ALPHA
G6:    ENTER(V)  CLEAR(V)  ???       ???       ???       2ND(V)    ???       ???
       (note: 2ND conflict — see G4:B5 vs G6:B5)
G7:    ???       ???       ???       ???       ???       ???       ???       ON
```

## Phase 24F Verified Positions (ground truth)

| Key     | Group | Bit | Scan Code | Source          |
|---------|-------|-----|-----------|-----------------|
| ENTER   | 6     | 0   | 0x60      | Phase 24F test  |
| CLEAR   | 6     | 1   | 0x61      | Phase 24F test  |
| 2ND     | 6     | 5   | 0x65      | Phase 24F test  |
| RIGHT   | 0     | 2   | 0x02      | Phase 24F test  |  
| Y=      | 5     | 4   | 0x54      | Phase 24F test  |
| GRAPH   | 4     | 0   | 0x40      | Phase 24F test  |
| +       | 1     | 1   | 0x11      | Phase 24F test  |
| 0       | 3     | 0   | 0x30      | Phase 24F test  |

## Notes

- G0:B0 is the only dead position (returns 0x00 = no key)
- All scan codes = `(group << 4) | bit` — no remapping by the ROM
- The unverified positions above are inferred from the standard TI-84 CE physical layout
  but NOT confirmed against actual hardware. Only the 8 verified positions are certain.
- To verify remaining keys: run 0x0159C0 on a real TI-84 CE with CEmu trace comparison

## Full Scan Code Map (for keyboard module)

```
0x00: (dead)  0x01: DOWN    0x02: LEFT    0x03: RIGHT   0x04: UP
0x05: ???     0x06: ???     0x07: ???
0x10: ???     0x11: +       0x12: -       0x13: ×       0x14: ÷
0x15: ^       0x16: ???     0x17: ???
0x20: (-)     0x21: 3       0x22: 6       0x23: 9       0x24: )
0x25: TAN     0x26: VARS    0x27: ???
0x30: 0       0x31: 2       0x32: 5       0x33: 8       0x34: (
0x35: COS     0x36: PRGM    0x37: STAT
0x40: GRAPH   0x41: TRACE   0x42: ZOOM    0x43: WINDOW  0x44: Y=
0x45: 2ND     0x46: MODE    0x47: DEL
0x50: ???     0x51: STO→    0x52: LN      0x53: LOG     0x54: x²
0x55: x⁻¹    0x56: MATH    0x57: ALPHA
0x60: ENTER   0x61: CLEAR   0x62: ???     0x63: ???     0x64: ???
0x65: ???     0x66: ???     0x67: ???
0x70: .       0x71: 1       0x72: 4       0x73: 7       0x74: ,
0x75: SIN     0x76: APPS    0x77: X,T,θ,n
```
