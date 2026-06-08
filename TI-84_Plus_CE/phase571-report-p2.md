# Phase 571 P2 — MAP D031F6/D07396 Scroll Buffers

## Summary

Both D031F6 and D07396 are **8,400-byte (0x20D0) screen shadow buffers** used as a double-buffering pair for the LCD scroll system. D031F6 is the primary (active) scroll buffer and D07396 is the secondary (backup/alternate) buffer. They are swapped during scroll operations and copied to/from VRAM.

## Buffer Dimensions

| Address | End Address | Size | Name |
|---------|-------------|------|------|
| D031F6 | D052C5 | 0x20D0 (8,400 bytes) | Primary scroll buffer |
| D07396 | D09465 | 0x20D0 (8,400 bytes) | Secondary scroll buffer |

**8,400 = 40 bytes/row x 210 rows.** The TI-84 CE LCD is 320x240; subtracting the 30-pixel status bar leaves 210 usable rows. At 0x091777, a single row copy uses `LD BC,0x000028` (40 bytes). This is a **character/attribute buffer** (40 columns x 210 rows), not a raw pixel buffer.

Note: D031F5 (one byte before D031F6) is also referenced at 0x0A288F as the start of a 0x20D0-byte region, suggesting D031F5 is a flag/length byte prepended to the buffer.

## Alternate Buffer at D052C6

Multiple references show a conditional alternate: when `BIT 3,(IY+0x4A)` is set, D031F6 is replaced with **D052C6** (= D031F6 + 0x20D0, the byte after the primary buffer). This reveals a **three-buffer scheme**: D031F6 (primary), D052C6 (alternate primary), D07396 (secondary).

## Reference Table — D031F6 (8 references)

| ROM Address | Instruction | Context |
|-------------|-------------|---------|
| 0x09159A | `LD DE,0xD031F6` | Row address calculation — adds computed offset to buffer base, returns DE=pointer into buffer |
| 0x091777 | `LD DE,0xD031F6` | Row fill — conditionally swaps to D052C6 if IY+4A bit 3 set, then LDIR copies 0x28 (40) bytes per row |
| 0x0A1A8F | `LD DE,0xD031F6` | Buffer base selector — returns DE=D031F6 or D052C6 based on IY+4A bit 3 |
| 0x0A1FAB | `LD HL,0xD031F6` | Buffer swap (direction 1) — HL=D031F6, DE=D07396, then LDIR 0x20D0 bytes (copy primary to secondary) |
| 0x0A1FB5 | `LD DE,0xD031F6` | Buffer swap (direction 2) — DE=D031F6, HL=D07396, then LDIR 0x20D0 bytes (copy secondary to primary) |
| 0x0A3187 | `LD DE,0xD031F6` | Scroll up — computes row offset, conditionally uses D052C6, then LDIR block copy |
| 0x0A31D4 | `LD DE,0xD031F6` | Scroll down — same pattern with LDDR (reverse copy) |
| 0x0A3249 | `LD DE,0xD031F6` | Scroll clear — computes offset, fills 0x31F (799) bytes with 0x00 via LDIR |

## Reference Table — D07396 (6 references)

| ROM Address | Instruction | Context |
|-------------|-------------|---------|
| 0x035810 | `LD BC,0xD07396` | Graph mode init — stores D07396 into D03028 (buffer pointer variable), zeroes D0302B (offset) |
| 0x0404BC | `LD HL,0xD07396` | System init clear — zeroes entire 0x20D0-byte buffer (LD (HL),0 + LDIR) |
| 0x047F89 | `LD HL,0xD07396` | Screen mode reset — zeroes entire buffer, also clears D00896 flag |
| 0x04C743 | `LD DE,0xD07396` | Key handler (key 0x1C) — stores D07396 into D03028 pointer, zeroes D0302B offset |
| 0x0A1FAF | `LD DE,0xD07396` | Buffer swap (direction 1) — destination for copy from D031F6 |
| 0x0A1FB9 | `LD HL,0xD07396` | Buffer swap (direction 2) — source for copy to D031F6 |

## Key RAM Variables

| Address | Purpose |
|---------|---------|
| D031F5 | Buffer flag byte (1 byte before D031F6) |
| D031F6-D052C5 | Primary scroll buffer (0x20D0 bytes) |
| D052C6-D07395 | Alternate primary buffer (0x20D0 bytes, when IY+4A bit 3 set) |
| D07396-D09465 | Secondary/backup scroll buffer (0x20D0 bytes) |
| D03028 | 3-byte pointer to active secondary buffer (set to D07396 base) |
| D0302B | 3-byte offset into secondary buffer (zeroed on init) |

## Buffer Swap Function (0x0A1FAB)

Two entry points for bidirectional copy:

```
0x0A1FAB: LD HL,D031F6 / LD DE,D07396 / JR common    ; primary -> secondary
0x0A1FB5: LD DE,D031F6 / LD HL,D07396                 ; secondary -> primary
common:   DI / LD BC,0x20D0 / LDIR / EI / RET
```

The copy is interrupt-safe (DI/EI bracketed) with the double `LD A,I` errata workaround pattern.

## Scroll Direction Functions

| Address | Direction | Method |
|---------|-----------|--------|
| 0x0A3187 | Scroll up | LDIR (forward copy), row-offset arithmetic with `SUB 0x1E` |
| 0x0A31D4 | Scroll down | LDDR (reverse copy), row-offset arithmetic |
| 0x0A3249 | Clear region | Fills 0x31F bytes (799 = ~20 rows) with 0x00 |

## IY Flags Involved

| IY Offset | Bit | Purpose |
|-----------|-----|---------|
| IY+0x4A | bit 3 | Selects alternate buffer D052C6 vs primary D031F6 |
| IY+0x4C | bit 4 | Scroll mode flag (set/reset around scroll operations) |
| IY+0x4C | bit 5 | Large scroll handler trigger |
| IY+0x29 | bit 7 | Set by key handler during scroll-related key processing |
| IY+0x5C | bit 5 | Set alongside IY+29.7 for scroll key 0x1C |

## Probe

`TI-84_Plus_CE/probe-phase571-map-scroll-buffers.mjs` — exit 0, all references decoded.
