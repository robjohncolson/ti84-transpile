# Phase 319: Mega-Table Crash Stub Map

## Summary

Exactly **6 of 2175** mega-table entries are crash stubs: entries 0, 1, 2, 3, 4, and 2022. All chain through a contiguous 24-byte stub region at 0x04AB5D-0x04AB74 to the crash relay at 0x0003AC, which forwards to the hard-crash handler at 0x0019B5. No other mega-table entries target the crash path, either directly or through one JP hop.

## Crash Chain (Fully Verified)

```
Entry N table addr → JP 0x04ABxx (stub) → JP 0x0003AC (relay) → JP 0x0019B5 (handler)
```

### Crash Handler Disassembly (0x0019B5, 8 bytes of executable code)

```
0x0019B5: F3           DI                ; disable all interrupts
0x0019B6: 3E 10        LD A, 0x10        ; load 0x10
0x0019B8: ED 39 00     OUT0 (0x00), A    ; write 0x10 to port 0x00
0x0019BB: 00           NOP
0x0019BC: 00           NOP
0x0019BD: 76           HALT              ; CPU halts permanently
```

**Port 0x00 = eZ80 CPU control register.** Writing 0x10 sets the HALT mode configuration bit. Combined with DI (interrupts disabled), the CPU enters an unrecoverable halt state — no interrupt can wake it. This is a deliberate hard crash, not an orderly shutdown.

## The 6 Crash Entries

| Entry | Table Address | Stub Address | Purpose |
|-------|--------------|-------------|---------|
| 0     | 0x020110     | 0x04AB5D    | Reserved/unused slot |
| 1     | 0x020114     | 0x04AB61    | Reserved/unused slot |
| 2     | 0x020118     | 0x04AB65    | Reserved/unused slot |
| 3     | 0x02011C     | 0x04AB69    | **RST 28h error trap** |
| 4     | 0x020120     | 0x04AB6D    | **RST 30h error trap** |
| 2022  | 0x0220A8     | 0x04AB71    | Reserved/unused API slot |

### Crash Stub Region

All 6 stubs occupy a contiguous 24-byte block (6 x 4-byte JP instructions):

```
0x04AB5D: C3 AC 03 00   JP 0x0003AC  ← entry 0
0x04AB61: C3 AC 03 00   JP 0x0003AC  ← entry 1
0x04AB65: C3 AC 03 00   JP 0x0003AC  ← entry 2
0x04AB69: C3 AC 03 00   JP 0x0003AC  ← entry 3
0x04AB6D: C3 AC 03 00   JP 0x0003AC  ← entry 4
0x04AB71: C3 AC 03 00   JP 0x0003AC  ← entry 2022
```

## Entry 2022 Context

Entry 2022 is **isolated** — its immediate neighbors are real function entries:

| Entry | Target     | Status |
|-------|-----------|--------|
| 2020  | JP 0x055BB8 | Real function |
| 2021  | JP 0x02879D | Real function |
| 2022  | JP 0x04AB71 | **CRASH STUB** |
| 2023  | JP 0x0712FA | Real function |
| 2024  | JP 0x07131E | Real function |

This is likely a **reserved but unimplemented API slot** in the OS mega-table ABI. It exists alone in the middle of active entries (unlike entries 0-4 which form a contiguous block at the table start).

## All Paths to the Crash Chain

### References to 0x0003AC (crash relay) — 8 total

| Address  | Instruction     | Context |
|----------|----------------|---------|
| 0x0401E9 | JP 0x0003AC    | ROM code (additional crash path) |
| 0x048E7B | CALL 0x0003AC  | ROM code (error handler that returns!) |
| 0x04AB5D | JP 0x0003AC    | Crash stub for entry 0 |
| 0x04AB61 | JP 0x0003AC    | Crash stub for entry 1 |
| 0x04AB65 | JP 0x0003AC    | Crash stub for entry 2 |
| 0x04AB69 | JP 0x0003AC    | Crash stub for entry 3 |
| 0x04AB6D | JP 0x0003AC    | Crash stub for entry 4 |
| 0x04AB71 | JP 0x0003AC    | Crash stub for entry 2022 |

Two non-stub callers: 0x0401E9 (JP) and 0x048E7B (CALL). The CALL at 0x048E7B is notable — it expects 0x0003AC to return, but since 0x0003AC is a JP chain to HALT, this CALL never returns. This is an intentional "crash and don't come back" call.

### References to 0x0019B5 (crash handler) — 13 total

| Address  | Instruction      | Context |
|----------|-----------------|---------|
| 0x0003AC | JP 0x0019B5     | Crash relay |
| 0x000873 | JP 0x0019B5     | Early ROM error path |
| 0x001420 | JP 0x0019B5     | Init-phase error |
| 0x001BA8 | JP 0x0019B5     | Boot error |
| 0x0094F7 | CALL 0x0019B5   | Error handler |
| 0x0099A3 | CALL 0x0019B5   | Error handler |
| 0x0099B8 | CALL 0x0019B5   | Error handler |
| 0x00F3FB | CALL 0x0019B5   | Error handler |
| 0x01401A | CALL 0x0019B5   | Error handler |
| 0x0141B3 | CALL 0x0019B5   | Error handler |
| 0x0149D2 | CALL 0x0019B5   | Error handler |
| 0x0149ED | CALL 0x0019B5   | Error handler |
| 0x015110 | CALL 0x0019B5   | Error handler |

**The crash handler is widely used** — 13 call/jump sites across the ROM. The 3 JP references (0x0003AC, 0x000873, 0x001420, 0x001BA8) are one-way crash paths. The 9 CALL references are also fatal (CALL to HALT never returns), suggesting these are assertion-failure or integrity-check sites in the OS.

## Key Findings

1. **Exactly 6 crash entries** confirmed across all 2175 mega-table entries. No others found via exhaustive scan (checking both direct target = 0x0003AC and one-hop chains).

2. **Entry 2022 is isolated** — a single reserved slot amid active function entries (2020-2024 neighborhood). Entries 0-4 are a contiguous block at table start.

3. **The crash handler (0x0019B5) is a system-wide error endpoint** — 13 sites reference it, not just the mega-table stubs. It serves as the OS's "fatal error" primitive, used by init, boot, and runtime error handlers.

4. **Port 0x00 write of 0x10** before HALT configures the eZ80 CPU control register for permanent halt mode. This is a hardware-level crash, not a software-recoverable state.

5. **2,169 of 2,175 entries** (99.7%) are real function pointers — the mega-table is overwhelmingly a valid API dispatch table with only 6 reserved/error-trap slots.

## Probe

`probe-phase319-crash-stubs.mjs` — 30/30 assertions passing.
