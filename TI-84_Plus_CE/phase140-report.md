# Phase 140 - IY+0x14 Cross-Reference with TI-OS Documentation

Generated from static ROM analysis of [`ROM.rom`](./ROM.rom), the new probe [`probe-phase140-iy-flags.mjs`](./probe-phase140-iy-flags.mjs), and the earlier caller inventory in [`phase137-report.md`](./phase137-report.md).

## Summary

- Direct `FD CB 14 xx` opcode usage is spread across most bits in the byte, with bit 0 and bit 5 slightly ahead of bit 3 in raw opcode count.
- That does **not** contradict Phase 137: bit 3 testing is centralized through `CALL 0x0800A0`, so the 111 bit-3 test sites do not appear as inline `BIT 3,(IY+0x14)` opcodes.
- The TI-84 Plus CE include-file naming does **not** support the `textFlags @ 0x14` hypothesis. On the CE, `IY+0x14` is `sGrFlags`, and bit 3 is `grfSplitOverride`.
- The older `textEraseBelow` / `textScrolled` names belong to classic `textFlags` at `IY+0x05`, not CE byte `IY+0x14`.

## 1. IY Flag Map Reconstruction

The probe scans the ROM for the exact memory-only eZ80/Z80 indexed-bit forms:

- `BIT n,(IY+0x14)` as `FD CB 14 xx`
- `SET n,(IY+0x14)` as `FD CB 14 xx`
- `RES n,(IY+0x14)` as `FD CB 14 xx`

### Direct opcode counts for `IY+0x14`

| Bit | CE include name | `BIT` | `SET` | `RES` | Direct total |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | `grfSplit` | 57 | 4 | 7 | 68 |
| 1 | `vertSplit` | 31 | 4 | 8 | 43 |
| 2 | `graphDraw` | 1 | 6 | 2 | 9 |
| 3 | `grfSplitOverride` | 1 | 17 | 22 | 40 |
| 4 | `write_on_graph` | 2 | 1 | 4 | 7 |
| 5 | `g_style_active` | 6 | 21 | 38 | 65 |
| 6 | `cmp_mod_box` | 1 | 2 | 4 | 7 |
| 7 | `textWrite` | 0 | 0 | 1 | 1 |

### What the direct scan shows

- Every bit in this byte is used at least once except `BIT 7,(IY+0x14)`, which does not appear directly in the ROM.
- The heaviest raw direct usage is bit 0 (`68`) and bit 5 (`65`), followed by bit 1 (`43`) and bit 3 (`40`).
- Bit 3 has only **one** direct `BIT` opcode because the only raw `BIT 3,(IY+0x14)` instruction is the shared helper at `0x0800A0`.
- Bit 3 has `22` direct `RES` sites, but one of those is the shared clear helper at `0x0800C2`, leaving `21` inline clears. That matches Phase 137.

## 2. TI-OS Documentation Cross-Reference

### CE include-file mapping around the target byte

The CE flag-byte layout around this area is:

- `indicFlags = 0x12`
- `tblFlags = 0x13`
- `sGrFlags = 0x14`
- `newIndicFlags = 0x15`

So the target byte at `IY+0x14` is `sGrFlags`, not `textFlags`.

### Official CE names for `sGrFlags` bits

Based on the TI-84 Plus CE include-file listing, the byte at `IY+0x14` is:

| Bit | CE symbol |
| --- | --- |
| 0 | `grfSplit` |
| 1 | `vertSplit` |
| 2 | `graphDraw` |
| 3 | `grfSplitOverride` |
| 4 | `write_on_graph` |
| 5 | `g_style_active` |
| 6 | `cmp_mod_box` |
| 7 | `textWrite` |

That makes the best documentation-backed name for `(IY+0x14),bit3`:

> `sGrFlags.grfSplitOverride`

### Why the `textFlags` hypothesis looked plausible

On older TI-83+/84+ include files, `textFlags` is a **different** byte:

- `textFlags = 0x05`
- `textEraseBelow = 1`
- `textScrolled = 2`
- `textInverse = 3`

So the older text-related names are real, but they belong to `IY+0x05`, not `IY+0x14`. The Phase 137 intuition that this byte felt “text/UI related” is still useful behaviorally, but the CE include file gives a different official symbol name.

## 3. Verification Against Phase 137

Phase 137 already established:

- `CALL 0x0800A0` = `111` callers
- `CALL 0x0800C2` = `3` callers

Those helpers matter because they hide much of bit 3's usage from a raw `FD CB 14 xx` scan.

### Reconciling the two views

- Raw direct scan for bit 3: `1 BIT + 17 SET + 22 RES = 40`
- Add the shared test helper callers from Phase 137: `40 + 111 = 151`
- Add the shared clear-helper callers as separate sites: `151 + 3 = 154`

So bit 3 is **not** the leader in raw inline opcode count, but it **is** the dominant effective flag once helper-call usage is folded back in.

That is the key verification result:

- Bit 0 direct total: `68`
- Bit 5 direct total: `65`
- Bit 1 direct total: `43`
- Bit 3 direct total: `40`
- Bit 3 test-helper callers alone: `111`

The `111` bit-3 test sites already exceed every other bit's full direct total, which confirms that bit 3 is still the most heavily consulted flag in this byte.

## Conclusion

The official TI-84 Plus CE-style name for `(IY+0x14),bit3` is most likely `grfSplitOverride` in the `sGrFlags` byte. The older `textEraseBelow` / `textScrolled` hypothesis comes from a real but different flag byte (`textFlags` at `IY+0x05`) on older TI-OS families.

In other words:

- **CE byte `IY+0x14`**: `sGrFlags`
- **CE bit 3**: `grfSplitOverride`
- **Older text flag names**: valid, but attached to `IY+0x05`, not `IY+0x14`

## Sources

- [Phase 137 report](./phase137-report.md)
- [84PCE: OS: Include File](https://wikiti.brandonw.net/index.php?title=84PCE:OS:Include_File)
- [83Plus: OS: ti83plus.inc](https://wikiti.brandonw.net/index.php?title=83Plus:OS:ti83plus.inc)
