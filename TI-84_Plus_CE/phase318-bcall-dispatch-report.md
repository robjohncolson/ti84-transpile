# Phase 318: BCALL/BJUMP Dispatch Mechanism — RST 28h / RST 30h

## Key Finding

**RST 28h and RST 30h are error traps on TI-84 Plus CE OS 5.8.2.0029, NOT BCALL/BJUMP dispatchers.** Both handlers chain through the mega-table to a crash routine (DI + OUT0 + HALT). The CE OS uses direct CALL/JP to mega-table entry addresses instead of the classic Z80 RST-based BCALL mechanism.

## RST 28h Handler Disassembly (0x000028)

```
0x000028: F3           DI                    ; disable interrupts
0x000029: ED 7E        RSMIX                 ; switch to Z80 mode (clear MADL)
0x00002B: 5B C3        JP.LIL 0x02011C       ; .LIL prefix forces 24-bit JP,
          1C 01 02                            ; re-enters ADL mode at target
```

Total: 8 bytes (fills the RST 28h slot exactly: 0x28-0x2F).

### Execution chain

```
RST 28h (CALL 0x000028)
  → 0x000028: DI; RSMIX; JP.LIL 0x02011C
    → 0x02011C: JP 0x04AB69        (mega-table entry 3)
      → 0x04AB69: JP 0x0003AC      (crash stub)
        → 0x0003AC: JP 0x0019B5    (crash vector)
          → 0x0019B5: DI; LD A,0x10; OUT0(0x00),A; NOP; NOP; HALT
```

Result: **unconditional system halt** (hard crash).

## RST 30h Handler Disassembly (0x000030)

```
0x000030: F3           DI
0x000031: ED 7E        RSMIX
0x000033: 5B C3        JP.LIL 0x020120
          20 01 02
```

### Execution chain

```
RST 30h (CALL 0x000030)
  → 0x000030: DI; RSMIX; JP.LIL 0x020120
    → 0x020120: JP 0x04AB6D        (mega-table entry 4)
      → 0x04AB6D: JP 0x0003AC      (crash stub)
        → 0x0003AC: JP 0x0019B5
          → 0x0019B5: DI; HALT     (crash)
```

Identical crash path.

## Crash Stub Region (0x04AB5D-0x04AB74)

The first 6 mega-table entries (0-5) all JP to a contiguous block of 6 crash stubs at 0x04AB5D:

| Entry | Table addr | Stub addr  | Stub target |
|-------|-----------|------------|-------------|
| 0     | 0x020110  | 0x04AB5D   | JP 0x0003AC |
| 1     | 0x020114  | 0x04AB61   | JP 0x0003AC |
| 2     | 0x020118  | 0x04AB65   | JP 0x0003AC |
| 3     | 0x02011C  | 0x04AB69   | JP 0x0003AC → **RST 28h target** |
| 4     | 0x020120  | 0x04AB6D   | JP 0x0003AC → **RST 30h target** |
| 5     | 0x020124  | 0x0272C9   | *real function* (first non-crash entry) |
| 2022  | 0x0220A8  | 0x04AB71   | JP 0x0003AC (additional crash stub) |

Entry 5 (0x020124) is the first entry with a real function target (JP 0x0272C9). Entry 2022 is a late crash stub (possibly a reserved/unused API slot).

## The Real BCALL Mechanism on the CE

The TI-84 Plus CE does NOT use RST-based BCALL. Instead:

1. **Internal OS code** calls functions directly (CALL 0x0272C9, not through the table).
2. **External code (apps, ASM programs)** uses CALL to the mega-table entry address directly: `CALL 0x020124` executes `JP 0x0272C9` (entry 5's target).
3. The mega-table at 0x020110-0x022308 serves as a **stable ABI** — entry addresses don't change across OS versions even if function addresses move.

### Evidence

- Only 6 CALL instructions in the entire transpiled ROM target mega-table addresses (entries 6, 8, 9).
- The ROM internally calls function targets directly rather than through the table.
- RST 28h/30h handlers unconditionally crash — they are error traps for invalid/legacy code.

### CALL-to-table sites found in ROM

| Caller block | Target | Entry | Function |
|-------------|--------|-------|----------|
| 0x013EE9    | CALL 0x020128 | 6  | JP 0x040E7E |
| 0x00598D    | CALL 0x020134 | 9  | JP 0x02398E |
| 0x005987    | CALL 0x020130 | 8  | JP 0x023A1C |

## RST 28h/30h in the Transpiled Code — False Positives

The transpiler identified 187 RST 28h and 87 RST 30h sites. **Nearly all are false positives** from data regions misinterpreted as code:

| Category | Count | Explanation |
|----------|-------|-------------|
| TI-BASIC token table (0x05C3F0+) | ~30 | EF is a 2-byte token prefix, not RST |
| ASCII string regions (0x04F000+) | ~45 | String data containing 0xEF bytes |
| CALL address low byte | 9 | Byte after CD (CALL opcode) = 0xEF |
| Other data/misaligned code | ~100+ | Seeded from wrong entry points |
| Possibly genuine (e.g., 0x00ADF5) | <5 | In FP math region, but still unreachable |

Raw byte counts across the 4MB ROM: 0xEF appears 1,176 times, 0xF7 appears 1,480 times. The vast majority are data bytes.

## Mega-Table Structure Summary

- **Range**: 0x020110 - 0x022308
- **Entry count**: 2,175 (all valid JP instructions)
- **Entry size**: 4 bytes (C3 + 3-byte address)
- **Entries 0-4 + 2022**: Crash stubs (6 total; entries 3/4 = RST 28h/30h error traps)
- **Entry 5+**: Real function pointers (2,169 usable entries)
- **Dispatch formula** (for external code): `CALL (0x020110 + entry_index * 4)`

## Implications for the Transpiler

1. The 187 RST 28h sites should be reviewed — most are data being lifted as code.
2. No runtime BCALL dispatch logic needs to be implemented.
3. The RST 28h/30h handlers can be left as-is (they correctly crash, matching real hardware behavior).
4. The mega-table entries are the stable API surface for external code, not for internal OS dispatch.
