# Phase 25X - Disassembly of 0x08A98F (Graph-Window Initializer)

## Scope

- Main routine: `0x08A98F` for 18 bytes (5 instructions).
- Data block A (primary): `0x08A97B` for 10 bytes.
- Data block B (alternate): `0x08A971` for 10 bytes.
- Tail-call target: `0x07F976` (Mov10B = 10x LDI + RET).
- RAM destination: `0xD014FC` = YOffset per `ti84pceg.inc`.

## Summary

0x08A98F is a graph-window initializer that copies 10 bytes of default graph parameters (YMin, YMax, etc.) to RAM starting at YOffset (0xD014FC). It has two entry points: 0x08A98F (primary, source=0x08A97B) and 0x08A995 (alternate, source=0x08A971). Both tail-call 0x07F976 (10x LDI copy).

## Code listing

```
Address    Bytes           Instruction            Comment
---------- --------------- ---------------------- ------------------------------------------
0x08A98F:  21 7B A9 08     LD HL, 0x08A97B        source = primary ROM data table
0x08A993:  18 04           JR +4                  skip alternate entry point
0x08A995:  21 71 A9 08     LD HL, 0x08A971        alternate entry: source = alternate data
0x08A999:  11 FC 14 D0     LD DE, 0xD014FC        dest = YOffset (graph variable RAM)
0x08A99D:  C3 76 F9 07     JP 0x07F976            tail-call Mov10B (10x LDI copy)
```

## Control flow

1. Entry at `0x08A98F`: loads `HL = 0x08A97B` (primary defaults), then `JR +4` skips past the alternate entry.
2. Alternate entry at `0x08A995`: loads `HL = 0x08A971` (alternate defaults), falls through.
3. Common path at `0x08A999`: loads `DE = 0xD014FC` (YOffset), then `JP 0x07F976`.
4. `0x07F976` (Mov10B) executes 10x `LDI` (`ED A0`) then `RET`, copying 10 bytes from `(HL)` to `(DE)`.

## Data blocks

### Primary source (0x08A97B)

| Offset | Hex | Dec |
| ------ | --- | --- |
| +0 | 1B | 27 |
| +1 | 1D | 29 |
| +2 | A5 | 165 |
| +3 | 09 | 9 |
| +4 | 01 | 1 |
| +5 | 08 | 8 |
| +6 | 01 | 1 |
| +7 | 07 | 7 |
| +8 | 01 | 1 |
| +9 | D2 | 210 |

Raw: `1B 1D A5 09 01 08 01 07 01 D2`

### Alternate source (0x08A971)

| Offset | Hex | Dec |
| ------ | --- | --- |
| +0 | 04 | 4 |
| +1 | 31 | 49 |
| +2 | 91 | 145 |
| +3 | B9 | 185 |
| +4 | 00 | 0 |
| +5 | B8 | 184 |
| +6 | 00 | 0 |
| +7 | B7 | 183 |
| +8 | 00 | 0 |
| +9 | BE | 190 |

Raw: `04 31 91 B9 00 B8 00 B7 00 BE`

## Mov10B subroutine (0x07F976)

10x `ED A0` (LDI) followed by `C9` (RET). Copies exactly 10 bytes from `(HL)` to `(DE)`, incrementing both pointers.

## RAM addresses written

| Address range | Size | Symbol |
| --- | --- | --- |
| `0xD014FC`..`0xD01505` | 10 bytes | YOffset region |

## Named routines

| Address | Name | Description |
| --- | --- | --- |
| `0x08A98F` | GraphWindowInit (primary) | Loads primary defaults, tail-calls Mov10B |
| `0x08A995` | GraphWindowInit (alternate) | Loads alternate defaults, tail-calls Mov10B |
| `0x07F976` | Mov10B | 10-byte block copy (10x LDI + RET) |

## Assessment

This routine does NOT affect ParseInp's memory allocation. It initializes graph window variables, which are irrelevant to the expression parser's free-space check. The only RAM it touches is the 10-byte block at YOffset (`0xD014FC`), which holds graph display parameters (Y-axis offset, scale, and related window settings).
