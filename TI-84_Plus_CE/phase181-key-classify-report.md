# Phase 181 - Key Classification Subroutine Disassembly

Status: probe added, not re-run in this subagent turn.

Preflight decode already changes the original hypothesis materially:

- `0x058BA3` is a 3-instruction helper: `xor a ; ld (0xD01D0C), a ; ret`.
- `0x058D49` is a 4-instruction helper: `ld a, (0xD0008E) ; and 0xC0 ; ld (0xD0008E), a ; ret`.
- `0x0824FD .. 0x0825D1` matches the earlier InsertMem pointer-adjust pattern (`ld hl, <RAM slot> ; call 0x0825D1`) rather than a key-code dispatch table.

Running:

```bash
node TI-84_Plus_CE/probe-phase181-key-classify.mjs
```

will overwrite this file with the full measured report, including:

- a 150-instruction linear decode window from `0x058D49`
- a 100-instruction linear decode window from `0x058BA3`
- the `0x0825C0 .. 0x0825F0` context disassembly plus the expanded `0x0824FD .. 0x0825F0` slot list
- a 256-byte live dump from the first extracted RAM slot region
- the bounded direct-trace result for `0x058D49` with `kbdKey=0x90`, including unique PCs, `BufInsert` reachability, and `editCursor` before/after

Most likely next candidates after this probe runs are the adjacent routines immediately after the tiny entry helpers:

- `0x058BA9`
- `0x058D54`
