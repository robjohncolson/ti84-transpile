# Phase 126 - 0x0B8E19 Key-Handler Table Initialization Deep-Dive

Status: pending execution.

This file is a placeholder created by a subagent that was instructed not to run the new probe after patching. Running `node TI-84_Plus_CE/probe-phase126-key-table-init.mjs` will overwrite this file with the full report.

Planned contents:
- Part A: 200-byte linear disassembly from `0x0B8E19`, including direct CALL/JP targets and LD references to `0xD008D6` / `0xD0243A`
- Part B: sentinel-preseeded cold-boot + OS-init + post-init pointer-state check
- Part C: direct post-boot trace of `0x0B8E19` writes to `0xD008D6..0xD008D8` and `0xD0243A..0xD0243C`
- Part D: full-ROM direct `CALL` / `JP` byte-pattern search for `0x0B8E19`

Implementation note:
- The probe pre-seeds both 3-byte pointer slots to `0xFFFFFF` before boot so Part B can distinguish untouched RAM from the default zero-filled `Uint8Array` backing store.
