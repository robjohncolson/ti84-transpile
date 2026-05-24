# Phase 423 — D13FED Connection Table Structure Mapped

**Session**: 423
**Date**: 2026-05-23
**Probe**: `probe-phase423-D13FED-map.mjs`

---

## Summary

D13FED is a 5-entry table of 24-bit (3-byte) descriptor pointers. Each entry points to a runtime descriptor struct used by the link/USB protocol stack. The table is accessed exclusively via immediate loads (never read/written as a memory variable itself) — all 35 ROM references are `LD BC/DE/HL,D13FED+offset` patterns.

---

## Table Layout

```
Address   Entry  Refs  Access pattern
--------  -----  ----  --------------
D13FED    [0]     24   LD BC,D13FED (indexed: index*3 + base)
D13FF0    [1]      4   LD HL,D13FF0 (direct)
D13FF3    [2]      6   LD HL,D13FF3 (direct)
D13FF6    [3]      0   (no references — likely unused/reserved)
D13FF9    [4]      1   LD HL,D13FF9 (direct)
```

**Total**: 35 references across 26 distinct ROM sites.

---

## Access Patterns

### Entry 0 (D13FED) — Indexed access, 24 refs

All 24 references use the canonical `*3` indexed idiom:

```
SBC HL,HL         ; HL = 0
LD L,A            ; HL = index
PUSH HL / POP BC  ; BC = index
ADD HL,HL         ; HL = index*2
ADD HL,BC         ; HL = index*3
LD BC,D13FED      ; base
ADD HL,BC         ; HL = &table[index]
```

After computing the address, the code dereferences in several ways:

| Pattern after `ADD HL,BC` | Meaning | Sites |
|---------------------------|---------|-------|
| `ED 27` = LD HL,(HL) | Load descriptor pointer into HL | 0x00ED8F, 0x032370, 0x03C4BC |
| `ED 07` = LD BC,(HL) | Load descriptor pointer into BC | 0x00F444, 0x00FE24, 0x03216D, 0x03CCA3 |
| `ED 31` = LD IY,(HL) | Load descriptor pointer into IY | 0x00EDAC, 0x00EDEA, 0x031C86, 0x03BD82, 0x03BDB3, 0x03C4D4 |
| `ED 1F` = LD (HL),DE | Store descriptor pointer from DE | 0x00F544, 0x03136A, 0x032397, 0x03C118 |
| `ED 0F` = LD (HL),BC | Store descriptor pointer from BC | 0x03122E, 0x03BD03, 0x03BEC8 |
| `C5` = PUSH BC (memset arg) | Pass table base as argument | 0x00CC9C, 0x0390CF |

### Entries 1, 2, 4 — Direct access

These bypass the indexed lookup and address specific slots directly:

- **Entry 1** (D13FF0): 4 refs — 2 store descriptors (`ED 0F`), 1 dereference into IY then check `+8` flag, 1 store
- **Entry 2** (D13FF3): 6 refs — 2 dereference via `ED 07`, 4 store or read through dereference
- **Entry 4** (D13FF9): 1 ref — store descriptor via `ED 0F`

### Entry 3 (D13FF6): Zero references

Entry 3 has no ROM references at all. It may be reserved, populated only at runtime by the indexed write paths, or simply unused in this OS version.

---

## Descriptor Struct Field Access After Dereference

Once a descriptor pointer is loaded from the table, the code accesses struct fields at known offsets. Confirmed field accesses from the dereference traces:

| Offset | Access | Opcode | Sites |
|--------|--------|--------|-------|
| +8 | `LD A,(IY+8)` then `AND 0x80` | `FD 7E 08` + `E6 80` | 0x00EDAC, 0x00EDEA, 0x031C86, 0x02F52B, 0x03C4D4 |
| +9 | `FD 27 09` (LD HL,(IY+9)) | eZ80 indexed load | 0x00EDAC, 0x00EDEA, 0x03C4D4 |
| +12 | `FD 0F 0C` (store at IY+12) | eZ80 indexed store | 0x00EC5C, 0x03BDB3 |

### Confirmed Struct Map

```
Descriptor struct (pointed to by each D13FED entry):
  +0   [3 bytes]  Callback function pointer (loaded into IY for CALL 0x002288)
  +8   [1 byte]   Flag byte — bit 7 = busy/active
  +9   [3 bytes]   Primary context/session pointer (matched against D14014, D141E2)
  +12  [3 bytes]   Secondary working pointer
  +18  [3 bytes]   Size/start field
  +21  [3 bytes]   Size/limit field
  +27  [1 byte]    Staged disposition/state (values: 0, 3, 5, 7)
```

The +8 flag check (`AND 0x80`) is the "busy" gate: if bit 7 is set, the slot is skipped. This appears in both the 0x00ED77 handshake slot-selector and in direct-entry access paths.

---

## ROM Region Distribution

| Region | Refs | Function cluster |
|--------|------|-----------------|
| 0x00C9xx | 2 | Entry-2 direct access (slot setup) |
| 0x00CCxx | 1 | Memset init (boot) |
| 0x00ECxx | 2 | Indexed access with IY dereference |
| 0x00EDxx | 3 | **0x00ED77 handshake slot selector** |
| 0x00F4xx | 1 | **0x00F430 event dispatch** |
| 0x00F5xx | 1 | Event dispatch variant |
| 0x00F6xx | 1 | Entry-4 direct |
| 0x00F7xx | 1 | Entry-1 direct |
| 0x00F9xx | 1 | Entry-2 direct |
| 0x00FAxx | 2 | Entry-1 and entry-2 direct |
| 0x00FExx | 1 | **0x00FE10 transfer dispatcher** |
| 0x02B7xx | 2 | Mirror of 0x00C9xx pattern |
| 0x02F5xx | 1 | Entry-1 with +8 flag check |
| 0x0312xx | 1 | Descriptor store (DE pattern) |
| 0x0313xx | 1 | Descriptor store |
| 0x031Cxx | 1 | Indexed access with +8 flag check |
| 0x0321xx | 1 | Indexed access |
| 0x0323xx | 2 | Indexed access with deref/store |
| 0x0390xx | 1 | Memset init (mirror of 0x00CC) |
| 0x03BCxx-0x03CCxx | 8 | USB/link extended handlers |

The 0x03xxxx region contains **mirrors** of the 0x00xxxx patterns — likely the USB-mode equivalents of the legacy TI-Link handlers.

---

## Related RAM Variables

| Address | Total Refs | READ | WRITE | Role |
|---------|-----------|------|-------|------|
| D13FE7 | 27 | 20 | 1 | Active descriptor pointer (current slot) |
| D14014 | 13 | 3 | 10 | Live context/session pointer (match target) |
| D141E2 | 21 | 16 | 2 | Latched context pointer (secondary match) |
| D141BB | 12 | 2 | 8 | ISR descriptor pointer (set by 0x0094C0) |

D14014 is predominantly **written** (10 writes, 3 reads) — it's set by callers to establish the current session context, then read by 0x00ED77 for matching. D141E2 is predominantly **read** (16 reads) — it's a latched/cached copy used as a fallback match.

---

## Key Findings

1. **All 35 references are immediate loads** — the table address is never itself stored in or read from RAM. It's a compile-time constant baked into every access site.

2. **Entry 3 is unreferenced** — no ROM code ever loads or stores D13FF6 directly. It may exist only as padding or for runtime-only use via indexed writes.

3. **The 0x03xxxx region mirrors the 0x00xxxx region** — the same access patterns appear in both, suggesting the USB subsystem has parallel handler code for the same descriptor table.

4. **The +8 flag byte (bit 7) is the universal gate** — every dereference path that doesn't immediately store checks `(IY+8) AND 0x80` before proceeding. This is the busy/in-use flag.

5. **Two memset sites** (0x00CC9C and 0x0390CF) clear 13 bytes of the table at boot, covering entries 0-3 fully plus one byte of entry 4.
