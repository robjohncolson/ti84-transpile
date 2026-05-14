# Phase 317 — D13FED Struct Table Decoded

**Session**: 317
**Date**: 2026-05-14
**Probe**: `probe-phase317-d13fed-struct-table.mjs`
**Golden regression**: 26/26 PASS

---

## Key Finding

**D13FED is a table of 3-byte (24-bit) callback pointers**, not a linked list of large structures. Each entry holds a single function address. The 0x00F000 event dispatch cluster indexes into this table using `ptr = mem[A*3 + D13FED]` to look up app-registered callbacks at dispatch time.

The 0x0241A3 orchestrator's linked list of handler structures (type tag 0x81, ~0x110 bytes each) is a **separate, independent system** — it does not reference D13FED at all (zero matches in its 311-byte range).

---

## Structure Layout

```
D13FD8  +---------+---------+---------+---------+---------+---------+---------+
        | idx -7  | idx -6  | idx -5  | idx -4  | idx -3  | idx -2  | idx -1  |
D13FED  +---------+---------+---------+---------+---------+
        | idx  0  | idx  1  | idx  2  | idx  3  | idx  4  |   (primary range)
D13FFC  +---------+---------+---------+---------+---------+---------+- - -
        | idx  5  | idx  6  | idx  7  | idx  8  | ...     | idx 27  |
        +- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -+

Each entry = 3 bytes = one 24-bit address pointer (little-endian).
```

### Entry Size: 3 bytes

Proven by the universal access idiom:
```
SBC HL,HL        ; HL = 0
LD L,A           ; HL = index (from A)
PUSH HL / POP BC ; BC = index
ADD HL,HL        ; HL = index*2
ADD HL,BC        ; HL = index*3
LD BC,D13FED     ; base address
ADD HL,BC        ; HL = &table[index]
LD reg,(HL)      ; load the 24-bit pointer
```

24 reference sites in ROM. 15 use the `*3` indexed pattern, 2 push D13FED as a `memset` argument, 7 use direct addressing.

### Primary Index Range: 0–4

Entry 173 at 0x00F430 bounds-checks `CP 5` (index < 5). Additional checks: `CP 2` at 0x00F461, `CP 1` at 0x00EC16. Extensive `OR A` (zero test) checks confirm index 0 is a distinguished case.

5 entries × 3 bytes = 15 bytes: D13FED through D13FFB.

### Extended Range

The region D13FD8–D14040 is a contiguous pointer array. Multiple code paths use different base addresses to access different entry groups:

| Base    | Offset from D13FED | Load refs | Used for |
|---------|-------------------|-----------|----------|
| D13FD8  | −21 (idx −7)      | 5         | Group A  |
| D13FDE  | −15 (idx −5)      | 23        | Group B  |
| D13FED  | 0                 | 24        | Primary  |
| D13FF0  | +3 (idx +1)       | 4         | Direct   |
| D13FF3  | +6 (idx +2)       | 6         | Direct   |

Higher indices (5–27) are referenced but less frequently, likely used for auxiliary callback slots.

---

## Init/Clear

Two call sites zero the table at boot:

| Site     | Call target | Equivalent |
|----------|------------|------------|
| 0x00CC98 | CALL 0x00285F | `memset(D13FED, 0, 13)` |
| 0x0390CF | CALL 0x0000B0 → JP 0x00285F | `memset(D13FED, 0, 13)` |

Both clear **13 bytes** (0x0D): entries 0–3 fully (12 bytes) plus the low byte of entry 4. This partial overlap suggests entry 4 may receive special initialization elsewhere, or the count covers a 1-byte length/header field preceding the 4-entry array.

Function at 0x00285F: standard C-calling-convention `memset` — pushes IY frame, reads dest (IY+3) and count (IY+6) from stack, stores zero via `XOR A; LD (DE),A` + `LDIR`.

---

## D177B8 Master Control Word

D177B8 is a 1-byte state variable with **232 ROM references** — the most-referenced single byte in the D177xx region. It acts as the **current app/context type tag**.

### Written from struct field

At 0x0088E1 and 0x049D7B: `LD A,(IX+6); LD (D177B8),A` — copies the struct's index field (offset +6 in the current handler structure) into D177B8. This happens across 14 sequential cases (a `_seqcase`-style dispatch writing different values).

### Value space (from CP comparisons)

| Value | Refs | Likely meaning |
|-------|------|----------------|
| 0x00  | 33   | Idle/no app    |
| 0x01  | 19   | Home screen    |
| 0x40  | 19   | Graph mode     |
| 0xFF  | 18   | Invalid/reset  |
| 0x02  | 10   | Edit mode      |
| 0x80  | 7    | Settings       |
| 0x0D  | 6    | STAT editor    |
| 0xC3  | 6    | Extended mode  |
| 0x0B  | 5    | LIST editor    |
| 0x06  | 4    | PRGM editor    |
| 0x97  | 4    | Graph trace    |
| 0x98  | 4    | Graph window   |
| 0xC0  | 4    | App context    |
| 0x11  | 3    | TABLE editor   |
| 0x42  | 3    | STAT PLOT      |
| 0x43  | 3    | Y= editor      |
| 0x8F  | 3    | Graph format   |
| 0x99  | 3    | ZOOM           |

---

## Relationship Between Systems

```
╔══════════════════════════════════╗     ╔══════════════════════════════════╗
║  D13FED Pointer Table            ║     ║  0x0241A3 Handler Structures     ║
║  (0x00F000 event cluster)        ║     ║  (JP vector table 0x0217C0)      ║
╠══════════════════════════════════╣     ╠══════════════════════════════════╣
║  Entry: 3 bytes (address)        ║     ║  Entry: ~0x110 bytes (struct)    ║
║  Layout: flat indexed array      ║     ║  Layout: linked list             ║
║  Indices 0-4 (primary)           ║     ║  Type tag 0x81 at offset +0      ║
║  Accessed by: entries 168-174    ║     ║  Filter flags at +0x10C, +0x10E  ║
║  Null check: 0x0021C2 (36 calls) ║     ║  5 _indcall dispatch sites       ║
║  Shared epilogue: 0x00FB66       ║     ║  9 thin wrappers at 0x0242E6     ║
╠══════════════════════════════════╣     ╠══════════════════════════════════╣
║  DOES NOT reference 0x0241A3     ║     ║  DOES NOT reference D13FED       ║
╚══════════════════════════════════╝     ╚══════════════════════════════════╝
                ↑                                      ↑
                └──── Both part of OS event/callback dispatch system ────┘
```

Both systems serve the OS event/notification architecture but operate independently:
- **D13FED table**: Compact slot array for app-registered callbacks (5 primary slots). The 0x00F000 cluster looks up a callback by index, null-checks it, and calls it.
- **0x0241A3 orchestrator**: Walks a linked list of heavyweight handler structures, filtering by command-byte bit fields. More complex dispatch logic with primary/secondary callbacks and cleanup paths.

---

## Related RAM Regions

| Region | Size | Alignment | Purpose |
|--------|------|-----------|---------|
| D13FD8–D14040 | ~104 bytes | 3-byte | Callback pointer table (main) |
| D14040–D140B3 | ~116 bytes | byte-level | App context data (D1408D = 123 refs) |
| D141B2–D14200 | ~78 bytes | mixed | Secondary state (D14200 = 117 refs) |
| D143E7–D14420 | ~57 bytes | 3-byte | Auxiliary callback pointers |
| D177B8 | 1 byte | — | Master app/context type tag (232 refs) |

---

## Probe Output

Full probe: `node TI-84_Plus_CE/probe-phase317-d13fed-struct-table.mjs`

Includes 8 analysis sections:
1. ROM reference scan (24 sites)
2. Access pattern analysis (indexed vs direct vs memset)
3. Table extent (indices −7 to 66)
4. Index bound checks (CP 5 at entry 173)
5. Init/clear call sites (two memset calls)
6. Parallel table bases (D13FD8, D13FDE)
7. Dynamic RAM dump after OS boot
8. Relationship to 0x0241A3 orchestrator
