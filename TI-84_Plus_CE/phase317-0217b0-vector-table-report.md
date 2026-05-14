# Phase 317 — 0x0217B0 JP Vector Table Report

## Discovery: OS Master Vector Table

The 0x0217B0 table is **not** a standalone structure. It is part of a single **contiguous 2175-entry JP vector table** spanning **0x020110 to 0x022308** — the TI-OS master syscall dispatch table. Every entry is a 4-byte ADL `JP` instruction (`C3 xx xx xx`). There are zero breaks in the entire range.

### Table geometry

| Sub-region | Address range | Entry count | Notes |
|------------|--------------|-------------|-------|
| Pre-0x0213C0 | 0x020110–0x0213BF | 1196 | RST handlers, FP math, LCD primitives |
| Session 229 sub-table | 0x0213C0–0x0217AF | 252 | OS internal dispatch |
| **This analysis** | **0x0217B0–0x022308** | **727** | OS API + orchestrator region |

The 0x0217B0 sub-table occupies indices 1448–2174 of the mega-table.

## Dispatch Mechanism

**BCALL operand + 0x020000 = table entry address.**

- `RST 28h` (opcode `0xEF`) = B_CALL — 2-byte operand, call-with-return semantics
- `RST 30h` (opcode `0xF7`) = B_JUMP — 2-byte operand, tail-call semantics

So `BCALL 0x17C0` dispatches to the JP instruction at `0x020000 + 0x17C0 = 0x0217C0`, which is entry [4] of the 0x0217B0 sub-table (the orchestrator at 0x0241A3).

### RST chain

```
RST 28h (0x0028) → DI; LD A,MB; .SIS JP 0x011C
  → 0x02011C (mega-table entry) → JP 0x04AB69
    → JP 0x0003AC (boot vector table) → JP 0x0019B5 (BCALL handler)
```

The handler at 0x0019B5 pops the return address, reads the 2-byte BCALL operand, and uses it directly as the low 16 bits of a 0x02xxxx address to execute the JP instruction found there.

## Reference Analysis (0x0217B0 sub-table)

| Ref type | Entries with refs | Description |
|----------|------------------|-------------|
| B_CALL (RST 28h) | 8 | Called from app code via `EF xx xx` |
| B_JUMP (RST 30h) | 8 | Tail-called via `F7 xx xx` |
| Direct CALL/JP to target | 506 | Bypasses table, calls JP target directly |
| No callers found | 217 | May be called from RAM, flash apps, or unused |

**510 of 727 entries** have at least one identified caller. The vast majority (506) are called by their JP target address directly — other OS code calls `0x09142B` rather than using `BCALL 0x1800`. The table serves primarily as a stable indirection layer for external/app code.

### Entries with BCALL/B_JUMP callers

| Index | BCALL | Target | Refs |
|-------|-------|--------|------|
| 20 | 0x1800 | 0x09142B | 1 BCALL + 2 B_JUMP |
| 21 | 0x1804 | 0x09D359 | 1 B_JUMP |
| 22 | 0x1808 | 0x0A284E | 1 B_JUMP |
| 24 | 0x1810 | 0x0921C4 | 1 B_JUMP |
| 100 | 0x1940 | 0x0970AB | 1 BCALL |
| 164 | 0x1A40 | 0x047B88 | 1 BCALL |
| 218 | 0x1B18 | 0x051B2B | 1 BCALL |
| 228 | 0x1B40 | 0x061986 | 1 BCALL |
| 292 | 0x1C40 | 0x0B28FF | 1 BCALL |
| 356 | 0x1D40 | 0x08C776 | 1 BCALL |
| 534 | 0x2008 | 0x0BC8AE | 2 B_JUMP |
| 540 | 0x2020 | 0x0BC8D7 | 1 BCALL |
| 541 | 0x2024 | 0x0BC8E2 | 1 B_JUMP |
| 598 | 0x2108 | 0x0721E1 | 2 B_JUMP |
| 662 | 0x2208 | 0x03FC7A | 1 B_JUMP |

## Cross-Reference with 0x0241A3 Orchestrator

**Entry [4]** at 0x0217C0 points directly to the orchestrator at 0x0241A3. The orchestrator is called 9 times directly (from the 9 wrappers) but has **zero BCALL/B_JUMP callers** — it is internal-only.

### 9 Orchestrator Wrappers (0x0242E6–0x024324)

Each wrapper is 7 bytes: `LD A, cmd; CALL 0x0241A3; RET`.

| Wrapper addr | Command byte | Callers | Caller locations |
|-------------|-------------|---------|-----------------|
| 0x0242E6 | 0x01 | 2 | JP from mega-table 0x0210F4; CALL from 0x084F3B |
| 0x0242ED | 0x17 | 4 | CALL from 0x02C893, 0x03DB45, 0x03DB50, 0x03E5E2 |
| 0x0242F4 | 0x05 | 1 | JP from mega-table 0x021790 |
| 0x0242FB | 0x00 | 1 | JP from mega-table 0x0210F8 |
| 0x024302 | 0x16 | 3 | CALL from 0x03E78E, 0x03E95F, 0x03E999 |
| 0x024309 | 0x04 | 1 | JP from mega-table 0x021794 |
| 0x024310 | 0x09 | 1 | CALL from 0x084F45 |
| 0x024317 | 0x0D | 1 | CALL from 0x08674A |
| 0x02431E | 0x0C | 1 | CALL from 0x086758 |

Three wrappers (cmd 0x01/0x00/0x05/0x04) are referenced from the mega-table itself at 0x0210F4, 0x0210F8, 0x021790, 0x021794 — making them callable via BCALL. The other six are called directly by internal OS code.

## Notable Patterns

1. **Duplicate targets**: Entries [194] and [195] both point to 0x030078. Entries [646]/[647] and [648]/[649] share targets (0x04AE11 and 0x04ADF4). These are likely aliased API functions.

2. **Cluster at 0x0BC8xx** (entries 533–543): 12 consecutive entries targeting 0x0BC8AB–0x0BC8F8, spaced ~3–11 bytes apart. This is a tightly-packed function block, likely small utility routines (FP helpers or type conversions).

3. **Dense 0x057xxx cluster** (entries 309–344): 36 entries mapping into a narrow 0x0579xx–0x057Axx range. These are very small routines (6–10 bytes each), likely token handlers or dispatch stubs.

4. **0x04C8xx cluster** (entries 358–381): 24 entries into 0x04C864–0x04C9FD. Another dense utility block.

## Artifacts

- `probe-phase317-0217b0-vector-table.mjs` — Probe script (dumps table, finds dispatchers, cross-references orchestrator)
- Golden regression: 5/5 PASS, 0 FAIL (no existing files modified)
