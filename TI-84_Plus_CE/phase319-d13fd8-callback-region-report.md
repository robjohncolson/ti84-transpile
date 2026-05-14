# Phase 319 — D13FD8-D14040 Callback Region Mapping

**Date**: 2026-05-14 (auto-session 319)
**Probe**: `probe-phase319-d13fd8-callback-region.mjs`

---

## Summary

The D13FD8-D14040 region (104 bytes) is **not a single uniform callback array**. It is a composite OS state region containing three distinct sub-structures:

1. **D13FD8-D13FF9** (34 bytes): Event/callback dispatch struct — 3 pointer slots (D13FD8, D13FDE, D13FE7/D13FEA) plus control fields, used by the 0x00F000 callback-slot dispatcher and its supporting init functions.
2. **D13FFC-D14002** (9 bytes): USB/communication 3-pointer triplet — 3 consecutive 3-byte pointers managed by a dedicated USB-like init/dispatch pair at 0x00CE-0x00D2.
3. **D14005-D1403E** (58 bytes): General OS state variables — a heterogeneous array of 3-byte values (not callback pointers) covering LCD parameters, cursor position, key state, timer counters, and graph/app configuration.

Total: 35 distinct addresses referenced, 782 ROM reference sites (478 reads, 119 writes, 184 immediates, 1 unknown).

---

## Sub-Structure 1: Event Dispatch Struct (D13FD8-D13FF9)

This is the struct identified in sessions 317-318 as the 0x00F000 cluster's callback table.

| Offset | Address | Refs | R/W/IMM | Role |
|--------|---------|------|---------|------|
| +0 | D13FD8 | 56 | 49/2/5 | **Base pointer** — loaded into IY via `FD 2A` (LD IY,(nn)) in most access patterns. Primary struct base. |
| +2 | D13FDA | 1 | 0/0/0/1 | Likely data (single unknown ref at 0x03CFBA — possibly coincidental byte pattern) |
| +3 | D13FDB | 42 | 0/0/42 | **Computed base** — always `LD HL,D13FDB` as immediate, then indexed with `ED 31` (LEA). 21 sites in 0x00D-0x00E range, 21 mirrored in 0x03A-0x03C range. |
| +6 | D13FDE | 53 | 28/2/23 | **Second pointer slot** — parallel to D13FD8. Written by init code at 0x00E3EB/0x03B5C3 as `LD (D13FDE),HL` (computed from D14017 + offset). |
| +9 | D13FE1 | 24 | 0/0/24 | **Computed base for D13FDE** — always `LD HL,D13FE1` + LEA. Mirrors D13FDB pattern. |
| +15 | D13FE7 | 27 | 26/1/0 | **Third pointer slot** — only 1 write site (0x039913) with `LD (D13FE7),BC`. Heavily read (26 times). |
| +18 | D13FEA | 10 | 8/2/0 | **Control/length field** — written by init code at 0x00E30B/0x03B4C5 as `LD (D13FEA),BC` where BC comes from `LD BC,(D1401D)`. |
| +21 | D13FED | 24 | 0/0/24 | **Callback pointer base** — always loaded as immediate `LD BC,D13FED` by 0x00F000 cluster. The 0x00F444, 0x00F544, 0x00FE24 sites use this to index into callback dispatch. |
| +24 | D13FF0 | 4 | 0/0/4 | **Callback sub-base** — `LD HL,D13FF0` at 0x00F78B, 0x00FA8C (0x00F000 cluster). |
| +27 | D13FF3 | 6 | 0/0/6 | **Callback sub-base** — `LD HL,D13FF3` at 0x00F950, 0x00FA27 (0x00F000 cluster). |
| +33 | D13FF9 | 1 | 0/0/1 | **Callback sub-base** — `LD HL,D13FF9` at 0x00F63E (0x00F000 cluster). |

### Key Observations

- **D13FD8 and D13FDE are parallel pointer bases**: both loaded via `FD 2A` (LD IY,(nn)), both with companion computed-base addresses 3 bytes later (D13FDB, D13FE1). This is a 2-entry pointer array with 6-byte entries (3-byte pointer + 3-byte base).
- **D13FE7 is a third independent pointer**: written at a different site (0x039913 in the 0x039xxx region) vs. the other two (0x00E3 region).
- **D13FED-D13FF9 are sub-indices within the 0x00F000 callback dispatcher**: all references are IMM loads from the dispatcher itself. These are the offsets into the callback struct that the dispatcher uses to locate specific callback slots.
- **ROM code is heavily mirrored**: most 0x00Dxxx-0x00Exxx references have near-identical copies at 0x03Axxx-0x03Cxxx (different ROM banks with identical logic).

### Init/Registration Sites (Non-Zero Writes)

| Address | Write Site | Source |
|---------|-----------|--------|
| D13FD8 | 0x00E385 / 0x03B55D | `LD (D13FD8),BC` where BC = `LD BC,(D14017)` — copies LCD parameter as pointer |
| D13FDE | 0x00E3EB / 0x03B5C3 | `LD (D13FDE),HL` where HL = D14017 + 0x80 (computed offset) |
| D13FE7 | 0x039913 | `LD (D13FE7),BC` from stack frame (`DD 07 F2` = LD BC,(IX-14)) |
| D13FEA | 0x00E30B / 0x03B4C5 | `LD (D13FEA),BC` where BC = `LD BC,(D1401D)` — copies from another state var |

---

## Sub-Structure 2: USB/Communication Triplet (D13FFC-D14002)

| Offset | Address | Refs | R/W/IMM | Role |
|--------|---------|------|---------|------|
| +36 | D13FFC | 74 | 68/6/0 | **Primary comm pointer** — 74 references, most heavily used single address in the region. Managed by the 0x00CE-0x00D2 function cluster. |
| +39 | D13FFF | 48 | 44/4/0 | **Secondary comm pointer** — always accessed alongside D13FFC. Written in pairs (0x00CF17 zeroes both D13FFC and D13FFF). |
| +42 | D14002 | 36 | 34/2/0 | **Tertiary comm pointer** — third member of the triplet. Written at 0x00CEE2 via `LD (D14002),HL`. |

### Key Observations

- These three addresses are always accessed together in the 0x00CE-0x00D2 region, forming a cohesive subsystem.
- The init pattern at 0x00CE83/0x00CEA2/0x00CEE2 stores three pointers via `LD (nn),HL` after calling 0x00E06D (allocation/setup).
- The zeroing pattern at 0x00CF17 writes `BC=0` to both D13FFC and D13FFF simultaneously.
- The access pattern (`FD 2A` = LD IY,(D13FFC), then indexed field reads at offsets +0, +4, +8) confirms these are **pointers to larger structures**, not data values.
- Heavy read traffic (68 reads for D13FFC alone) suggests these pointers are dereferenced in hot loops (USB polling, serial communication, or similar).

---

## Sub-Structure 3: General OS State Variables (D14005-D1403E)

A heterogeneous region of 3-byte state variables at stride 3. Most are **not callback pointers** — they store counters, flags, addresses, and configuration values.

| Address | Refs | R/W/IMM | Writes | Purpose (inferred from context) |
|---------|------|---------|--------|--------------------------------|
| D14005 | 14 | 12/2/0 | 0x00E616, 0x03B850 | LCD/display parameter — written alongside D14008, D14011 |
| D14008 | 24 | 22/2/0 | 0x00E5F8, 0x03B832 | LCD base address — `LD (D14008),HL` after `CALL 0x00229D`/`0x000168` (allocation). Read by 0x00F000 cluster. |
| D1400B | 43 | 33/10/0 | 10 sites across 0x00E8, 0x00FF, 0x0322, 0x03BA, 0x03CD | **Cursor/position counter** — highest write count (10). Updated by increment (`LD BC,(D1400B); INC BC; LD (D1400B),BC` pattern at 0x03CDFA). Read by 0x00F000 cluster. |
| D1400E | 8 | 4/4/0 | 0x00E8EA, 0x00FFC8, 0x03BBA1, 0x03CE5B | **Secondary position** — written as `LD (D1400E),HL` after allocation call, paired with D1400B. Read by 0x00F000 cluster. |
| D14011 | 44 | 40/4/0 | 0x00E620, 0x00E676, 0x03B85A, 0x03B8C0 | **Display state** — 40 reads, paired with D14005 in init. Struct pointer loaded then field-accessed. |
| D14014 | 13 | 3/10/0 | 10 write sites | **Timer/counter** — 10 writes from diverse regions (0x00CC, 0x00EB-0x00EC, 0x0390, 0x03BC-0x03C7). Zeroed at init (0x00CC93), non-zero values written from stack frames. |
| D14017 | 15 | 13/2/0 | 0x00CB16, 0x038EBE | **LCD width parameter** — `LD (D14017),BC` where BC comes from stack. Read 13 times, often as source for D13FD8 init. |
| D1401A | 12 | 10/2/0 | 0x00CB29, 0x038ED1 | **LCD height parameter** — written in same init sequence as D14017. |
| D1401D | 8 | 6/2/0 | 0x00CB55, 0x038F2F | **LCD stride/pitch** — written in same init block. Source value for D13FEA. |
| D14020 | 10 | 8/2/0 | 0x00CB68, 0x038F42 | **LCD config value** — written as `LD (D14020),BC` where BC=0x001800. |
| D14023 | 34 | 4/30/0 | 30 write sites! | **Cursor RAM pointer** — the most-written address in the region. Updated by ~15 distinct functions across 0x00A1-0x00A4, 0x00C3-0x00C4, 0x02A5-0x02A7. Each write stores a different RAM buffer base (D15B, D15C, D15D ranges). This is the current-text-buffer pointer. |
| D14026 | 7 | 4/3/0 | 0x00B760, 0x02BA68, 0x048CFE | **Function pointer / handler** — 3 write sites store distinct code addresses (0x00FBD1, 0x00063C, 0x02C0B8). This IS a callback pointer. |
| D14029 | 4 | 2/2/0 | 0x00B691, 0x04896D | **Function pointer** — written from stack frame value. Another callback slot. |
| D1402C | 15 | 9/6/0 | 6 write sites (0x00A8, 0x02AC, 0x0369, 0x04D4, 0x04D8, 0x04DA) | **Counter/index** — zeroed at init, incremented/set at runtime. Paired with D14032. |
| D1402F | 6 | 4/2/0 | 0x036989, 0x036A5E | **Timer value** — set to 0x64 (100 decimal) or 0 at 0x036989/0x036A5E. Looks like a countdown timer. |
| D14032 | 15 | 9/6/0 | 6 write sites | **Counter/index** — always written alongside D1402C (`LD (D1402C),BC; LD (D14032),BC`). A paired counter. |
| D14035 | 8 | 6/2/0 | 0x0096B0, 0x04906C | **I/O port state** — write is an INC pattern (`LD BC,(D14035); INC BC; LD (D14035),BC`). Read with `LD BC,(D14035)` then `IN A,(C)`. Hardware port counter. |
| D14038 | 19 | 14/5/0 | 0x0097CF, 0x014DB8, 0x014F44, 0x049190, 0x0BCC8E | **I/O port state** — similar to D14035. Written from both zero-init and increment patterns. Used with port I/O. |
| D1403B | 6 | 2/4/0 | 0x00CCC7, 0x00CCE0, 0x039111, 0x03912A | **Computed value** — written as both `LD (D1403B),BC=0` and `LD (D1403B),HL` (computed subtraction result). |
| D1403E | 6 | 4/0/2 | (no writes) | **Read-only / end marker** — 4 reads, 2 IMM loads. No writes in ROM. Value likely set by sub-structure 3 init. |
| D14040 | 65 | 12/0/53 | (no writes) | **Region boundary** — 53 IMM loads (`LD HL,D14040` or `LD BC,D14040`), 12 reads. Used as a base address for further indexing. Marks the end of the D13FD8-D14040 region and start of the next. |

---

## 0x00F000 Cluster References (23 total)

| ROM Site | Target | Type | Instruction |
|----------|--------|------|-------------|
| 0x00FE95 | D13FE7 | READ | LD HL,(nn) — reads the third pointer slot |
| 0x00F444 | D13FED | IMM | LD BC,nn — callback base index |
| 0x00F544 | D13FED | IMM | LD BC,nn |
| 0x00FE24 | D13FED | IMM | LD BC,nn |
| 0x00F78B | D13FF0 | IMM | LD HL,nn — sub-index +24 |
| 0x00FA8C | D13FF0 | IMM | LD HL,nn |
| 0x00F950 | D13FF3 | IMM | LD HL,nn — sub-index +27 |
| 0x00FA27 | D13FF3 | IMM | LD HL,nn |
| 0x00F63E | D13FF9 | IMM | LD HL,nn — sub-index +33 |
| 0x00FFE8 | D14005 | READ | LD BC,(nn) |
| 0x00FF38 | D14008 | READ | LD BC,(nn) |
| 0x00FF3D | D1400B | WRITE | LD (nn),BC — cursor update |
| 0x00FF42 | D1400B | READ | LD HL,(nn) |
| 0x00FF4A | D1400B | READ | LD HL,(nn) |
| 0x00FF83 | D1400B | READ | LD HL,(nn) |
| 0x00FF8D | D1400B | READ | LD HL,(nn) |
| 0x00FFA7 | D1400B | READ | LD HL,(nn) |
| 0x00FFCD | D1400B | READ | LD BC,(nn) |
| 0x00FFE3 | D1400B | WRITE | LD (nn),BC |
| 0x00FFEC | D1400B | READ | LD HL,(nn) |
| 0x00FFF5 | D1400B | READ | LD HL,(nn) |
| 0x00FFC8 | D1400E | WRITE | LD (nn),HL |
| 0x00FFDE | D1400E | READ | LD BC,(nn) |

The 0x00F000 cluster primarily uses D13FED-D13FF9 for its own callback dispatch tables and D1400B/D1400E/D14005/D14008 for display-related cursor/position tracking.

---

## ROM Code Mirroring

A major finding: the 0x00B-0x00E ROM range and the 0x038-0x03C ROM range contain **near-identical code** with the same access patterns to this region. This suggests two ROM banks with the same logic (possibly ADL vs Z80 mode variants, or flash page duplicates).

| Primary Range | Mirror Range | Function |
|---------------|-------------|----------|
| 0x00B6-0x00B7 | — | I/O port init (D14029, D14026, D14035) |
| 0x00CB-0x00CF | 0x038E-0x0394 | LCD parameter init (D14017-D14020), USB triplet (D13FFC-D14002) |
| 0x00D6-0x00D7 | 0x03A4-0x03A5 | Event struct field access (D13FD8 base) |
| 0x00DE-0x00DF | 0x03AC-0x03AD | Event struct manipulation |
| 0x00E3-0x00E5 | 0x03B5-0x03B7 | D13FD8/D13FDE init, callback setup |
| 0x00E5-0x00E6 | 0x03B8 | LCD address setup (D14005-D14011) |
| 0x00E8-0x00E9 | 0x03BA-0x03C1 | Cursor management (D1400B/D1400E), display refresh |
| 0x00A1-0x00A4 | 0x02A5-0x02A7 | Cursor pointer switching (D14023) |

---

## Structural Summary

```
D13FD8-D14040 (104 bytes)
├── Event Dispatch Struct (34 bytes)
│   ├── D13FD8: Pointer slot 0 (3B ptr + D13FDB 3B base = 6B entry)
│   ├── D13FDE: Pointer slot 1 (3B ptr + D13FE1 3B base = 6B entry)  
│   ├── D13FE7: Pointer slot 2 (3B ptr)
│   ├── D13FEA: Control/length (3B)
│   ├── D13FED: Callback dispatch base (3B, used by 0x00F000)
│   ├── D13FF0: Callback sub-index 0 (3B)
│   ├── D13FF3: Callback sub-index 1 (3B)
│   └── D13FF9: Callback sub-index 2 (3B) [gap at D13FF6-D13FF8]
├── USB/Comm Pointer Triplet (9 bytes)
│   ├── D13FFC: Primary comm struct ptr (3B, 74 refs — hottest address)
│   ├── D13FFF: Secondary comm struct ptr (3B)
│   └── D14002: Tertiary comm struct ptr (3B)
└── General OS State (58 bytes, stride-3 variables)
    ├── D14005-D14008: LCD parameters (base address, dimensions)
    ├── D1400B-D1400E: Cursor position pair (hottest: D1400B = 43 refs)
    ├── D14011: Display struct pointer
    ├── D14014: Timer/counter
    ├── D14017-D14020: LCD geometry (width, height, stride, config)
    ├── D14023: Current text buffer pointer (30 writes — most written)
    ├── D14026-D14029: Callback pointers (only TRUE callbacks in sub-struct 3)
    ├── D1402C-D14032: Paired counters
    ├── D1402F: Countdown timer (set to 100)
    ├── D14035-D14038: I/O port state counters
    ├── D1403B: Computed temp value
    ├── D1403E: Read-only marker
    └── D14040: Region boundary (base addr for next struct)
```

---

## True Callback Pointers in This Region

Only 4 of the 35 referenced addresses are actual runtime-installed **callback function pointers**:

| Address | Write Sites | Values Stored | Purpose |
|---------|-------------|---------------|---------|
| D13FE7 | 0x039913 | Stack frame value | Event handler callback (read by 0x00F000 cluster) |
| D14026 | 0x00B760, 0x02BA68, 0x048CFE | 0x00FBD1, 0x00063C, 0x02C0B8 | Polymorphic handler — different callers install different ROM functions |
| D14029 | 0x00B691, 0x04896D | Stack frame value | Secondary handler callback |
| D13FD8 | 0x00E385, 0x03B55D | Copied from D14017 | Struct base pointer (indirect callback via dereference) |

All other "writes" are state variable updates (counters, buffer pointers, LCD parameters), not callback registrations.

---

## Probe Results

```
Passed: 10/10
Failed: 0
```

---

## Key Addresses for Future Sessions

| Address | Role | Key Write Site |
|---------|------|---------------|
| D13FD8 | Event struct base ptr 0 | 0x00E385 |
| D13FDE | Event struct base ptr 1 | 0x00E3EB |
| D13FE7 | Event callback ptr | 0x039913 |
| D13FED | 0x00F000 dispatch base | (IMM only — not written) |
| D13FFC | USB/comm struct ptr (hot) | 0x00CE83 |
| D1400B | Cursor position (hot) | 10 write sites |
| D14023 | Text buffer ptr (most written) | 30 write sites |
| D14026 | Polymorphic handler ptr | 0x00B760, 0x02BA68, 0x048CFE |
| D14040 | Region end / next struct base | (boundary marker) |
