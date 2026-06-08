# Phase 575 P4: Decode 0x06F7B9 — Font Param Writer Shared Tail

## Summary

`0x06F7B9` is the convergence point (shared tail) for all paths of the font
param writer function group starting at `0x06F6E7`. All paths set bit 1 of
`(IY+2)` (= `grfModeFlags` at `0xD00082`) as a "font param write in progress"
flag, do their work, then JP to `0x06F7B9` which clears that flag and returns.

- **Start**: 0x06F7B9
- **End**: 0x06F7BD
- **Size**: 5 bytes (2 instructions)
- **Function**: RES 1,(IY+2) ; RET

## Full Disassembly

| Address | Bytes | Instruction |
|---------|-------|-------------|
| 0x06F7B9 | `FD CB 02 8E` | `RES 1,(IY+2)` |
| 0x06F7BD | `C9` | `RET` |

## IY Flag Operations

- `RES 1,(IY+2)` — RES bit 1 of (IY+2) = grfModeFlags at 0xD00082

## RAM References

No D0xxxx RAM references in the shared tail itself (all RAM work is in the
convergence paths before the JP).

## Sub-Calls

None — the shared tail is a pure flag-clear + return.

## References To 0x06F7B9

Scan pattern: `B9 F7 06` (little-endian)

| Instruction Address | Type |
|---------------------|------|
| 0x06F6FB | JP (unconditional) |
| 0x06F713 | JP (unconditional) |

## Convergence Paths

All paths in the font param writer group (0x06F6E7-0x06F7B8) converge here:

| Path | Entry | Size | Instructions | Converges via JP? |
|------|-------|------|--------------|-------------------|
| Path A (direct copy) | 0x06F6E7 | 24B | 6 | Yes |
| Path B (.SIS copy) | 0x06F6FF | 24B | 6 | Yes |
| Path C (multi-field copy) | 0x06F717 | 69B | 18 | No (inline RES+RET) |

### Path A: 0x06F6E7 (Direct A-register Copy)

```
0x06F6E7  FD CB 02 CE           SET 1,(IY+2)
0x06F6EB  3A 6E 14 D0           LD A,(0xD0146E)
0x06F6EF  32 65 2A D0           LD (0xD02A65),A
0x06F6F3  32 71 14 D0           LD (0xD01471),A
0x06F6F7  CD 22 B2 07           CALL 0x07B222
0x06F6FB  C3 B9 F7 06           JP 0x06F7B9
```

Copies `(D0146E)` → `A` → writes to `(D02A65)` and `(D01471)`, calls
`0x07B222`, then JP to shared tail.

### Path B: 0x06F6FF (.SIS 16-bit Copy)

```
0x06F6FF  FD CB 02 CE           SET 1,(IY+2)
0x06F703  40 2A 6F 14           .SIS LD HL,(0x00146F)
0x06F707  40 22 65 2A           .SIS LD (0x002A65),HL
0x06F70B  40 22 72 14           .SIS LD (0x001472),HL
0x06F70F  CD 32 B2 07           CALL 0x07B232
0x06F713  C3 B9 F7 06           JP 0x06F7B9
```

Uses `.SIS` prefix to copy 16-bit values: `(D0146F)` → `(D02A65)` and
`(D01472)`, calls `0x07B232`, then JP to shared tail.

### Path C: 0x06F717 (Multi-field Copy with Comparison)

```
0x06F717  CD 2C 02 07           CALL 0x07022C
0x06F71B  21 71 14 D0           LD HL,0xD01471
0x06F71F  11 68 2A D0           LD DE,0xD02A68
0x06F723  CD 84 F9 07           CALL 0x07F984
0x06F727  FD CB 02 CE           SET 1,(IY+2)
0x06F72B  21 6E 14 D0           LD HL,0xD0146E
0x06F72F  11 65 2A D0           LD DE,0xD02A65
0x06F733  CD 84 F9 07           CALL 0x07F984
0x06F737  CD 6C AF 06           CALL 0x06AF6C
0x06F73B  40 ED 4B 6E 14        .SIS LD BC,(0x00146E)
0x06F740  40 ED 5B 6F 14        .SIS LD DE,(0x00146F)
0x06F745  3A 71 14 D0           LD A,(0xD01471)
0x06F749  47                    LD B,A
0x06F74A  40 2A 72 14           .SIS LD HL,(0x001472)
0x06F74E  3E 01                 LD A,0x01
0x06F750  CD 45 B2 07           CALL 0x07B245
0x06F754  FD CB 02 8E           RES 1,(IY+2)
0x06F758  C3 41 02 07           JP 0x070241
```

Calls `0x07022C`, copies D01471→D02A68 and D0146E→D02A65 via `0x07F984`,
then loads font metrics from .SIS addresses, calls `0x07B245`, does inline
RES 1,(IY+2), and JP `0x070241`.

**Note**: Path C does its own inline `RES 1,(IY+2)` at 0x06F754 before
jumping to `0x070241` — it does NOT JP to 0x06F7B9. This path is the only
one that exits via a different route.

## Functional Analysis

### What (IY+2) bit 1 means

`(IY+2)` = `grfModeFlags` at RAM address `0xD00082`. Bit 1 is used as a
"font parameter write in progress" guard flag:

1. **SET 1,(IY+2)** at entry of each path — marks font param writing active
2. Path does its font parameter copying work
3. **RES 1,(IY+2)** at 0x06F7B9 (shared tail) — marks font param writing complete
4. **RET** — returns to caller

This is a classic "busy flag" pattern: set on entry, clear on exit. Other
code can check `BIT 1,(IY+2)` to determine if font parameters are being
updated and should not be read yet.

### RAM workspace addresses touched by convergence paths

| Address | Purpose |
|---------|---------|
| D0146E | Font param source (read) |
| D0146F | Font param source, 16-bit (read via .SIS) |
| D01471 | Font param (read/write) |
| D01472 | Font param, 16-bit (write via .SIS) |
| D02A65 | Pixel renderer workspace: font param copy (write) |
| D02A68 | Pixel renderer workspace: font param copy (write) |
| D02AC8 | New RAM discovered session 574 (write, path D only) |

