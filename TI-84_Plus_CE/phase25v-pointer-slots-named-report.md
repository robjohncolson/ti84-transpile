# Phase 25V — Pointer Slot Naming Report

Generated: 2026-04-22

## Background

Session 80's signExtTemp disassembly at 0x0827CA (AdjSymPtrs) revealed 4 pointer
slots adjusted by InsertMem. Three are in the DeltaY(0xD01FB7)..TraceStep(0xD0203D)
gap at a 6-byte stride. The fourth (0xD02567) is already known as `fmtMatSym`.

## Full InsertMem Pointer Table (0x0827CA)

The AdjSymPtrs routine at 0x0827CA iterates through these 11 pointer slots,
calling 0x082823 for each to adjust when memory is inserted/deleted:

| Order | Address | ti84pceg.inc name | Notes |
|-------|---------|-------------------|-------|
| 1 | 0xD0259A | `pTemp` | Temp pointer |
| 2 | 0xD0259D | `progPtr` | Program pointer |
| 3 | 0xD0244E | `editSym` | VAT ptr of variable being edited |
| 4 | 0xD0257B | `tSymPtr1` | Symbol table pointer 1 |
| 5 | 0xD0257E | `tSymPtr2` | Symbol table pointer 2 |
| 6 | 0xD02581 | `chkDelPtr3` | Check-delete pointer 3 |
| 7 | 0xD02584 | `chkDelPtr4` | Check-delete pointer 4 |
| 8 | **0xD01FEA** | **(unnamed)** | **NEW — see below** |
| 9 | **0xD01FF0** | **(unnamed)** | **NEW — see below** |
| 10 | **0xD01FF6** | **(unnamed)** | **NEW — see below** |
| 11 | 0xD02567 | `fmtMatSym` | Format matrix symbol |

## ROM Scan Results

### 0xD01FEA (8 hits)

| ROM offset | Instruction | Context |
|------------|-------------|---------|
| 0x045302 | `LD (0xD01FEA), HL` | Init: stores `chkDelPtr3` value, then zeros type byte |
| 0x06EB0B | `LD HL, (0xD01FEA)` | Read in graph/edit routine, then `RES 6,(HL)` |
| 0x082808 | `LD HL, 0xD01FEA` | InsertMem pointer adjustment loop |
| 0x0A601F | `LD (0xD01FEA), HL` | Stored alongside `LD (editSym), HL` and `LD (editDat), DE` |
| 0x0A6178 | `LD DE, (0xD01FEA)` | Graph/edit: `ED 5B` = LD DE,(nn), calls 0x04C973 |
| 0x0A6502 | `LD DE, (0xD01FEA)` | Graph/edit: same pattern |
| 0x0A70DE | `LD DE, (0xD01FEA)` | Graph/edit: same pattern |
| 0x0B8E41 | `LD DE, (0xD01FEA)` | Graph/edit: same pattern |

### 0xD01FF0 (2 hits)

| ROM offset | Instruction | Context |
|------------|-------------|---------|
| 0x04531C | `LD (0xD01FF0), HL` | Init: stores `chkDelPtr3` value, then zeros type byte |
| 0x082810 | `LD HL, 0xD01FF0` | InsertMem pointer adjustment loop |

### 0xD01FF6 (3 hits)

| ROM offset | Instruction | Context |
|------------|-------------|---------|
| 0x0450AD | `LD HL, (0xD01FF6)` | Dereferences ptr, walks backward: `DEC HL` x3, reads BCD bytes |
| 0x045333 | `LD (0xD01FF6), HL` | Init: stores `chkDelPtr3` value, then zeros type byte |
| 0x082818 | `LD HL, 0xD01FF6` | InsertMem pointer adjustment loop |

### 0xD02567 — fmtMatSym (3 hits)

| ROM offset | Instruction | Context |
|------------|-------------|---------|
| 0x082820 | `LD HL, 0xD02567` | InsertMem pointer adjustment loop |
| 0x099227 | `LD HL, (0xD02567)` | Matrix format: reads ptr, then `LD DE,(fmtMatDat)` |
| 0x0A8F66 | `LD (0xD02567), HL` | Matrix format: stores ptr |

**Confirmed**: 0xD02567 = `?fmtMatSym` (ti84pceg.inc line 2941).

## ti84pceg.inc Equates in 0xD01FC0..0xD0203C

**None found.** The entire 125-byte region between `DeltaY` (0xD01FB7) and
`TraceStep` (0xD0203D) is undocumented in the official SDK equates.

## Structure Analysis: 6-byte Pointer Pairs

Each of the 3 unknown slots is actually a **6-byte pair** of two 3-byte pointers:

| Slot | Primary (ptr) | Companion (+3) | Primary refs | Companion refs |
|------|---------------|----------------|--------------|----------------|
| 1 | 0xD01FEA | 0xD01FED | 8 | 26 |
| 2 | 0xD01FF0 | 0xD01FF3 | 2 | 10 |
| 3 | 0xD01FF6 | 0xD01FF9 | 3 | 49 |

### Initialization pattern (at 0x0452EF)

All three pairs are initialized the same way:

```
LD HL, (chkDelPtr3)     ; 0xD02581 — safe "no variable" sentinel
LD (slot_primary), HL   ; store sentinel as pointer
LD (HL), 0              ; zero the type byte at that sentinel
LD HL, (asm_ram)        ; 0xD00687
LD (slot_companion), HL ; store asm_ram as companion
```

This is identical to how `editSym`/`editDat` pairs work: one pointer to the
VAT entry, one pointer to the data area. The sentinel value (`chkDelPtr3`) means
"no variable currently assigned to this slot."

## Proposed Names

Based on the usage patterns:

### 0xD01FEA / 0xD01FED = `chkDelPtr5` / `chkDelPtr6`

**Evidence**:
- Stored alongside `editSym` (0xD0244E) at 0x0A601F — acts as a parallel
  symbol pointer for the graph/edit subsystem
- Read with `LD DE,(nn)` in 4 graph-related routines (0x0A6178, 0x0A6502,
  0x0A70DE, 0x0B8E41) — all call 0x04C973 afterward
- The companion at 0xD01FED has 26 references — heavily used
- Pattern matches `editSym`/`editDat` (ptr-to-VAT / ptr-to-data)

**Proposed name**: `graphEditSym` (0xD01FEA) / `graphEditDat` (0xD01FED)

### 0xD01FF0 / 0xD01FF3 = `chkDelPtr7` / `chkDelPtr8`

**Evidence**:
- Only 2 references to the primary (init + InsertMem)
- Companion has 10 references
- Initialized identically to the other pairs
- Lightest usage suggests a rarely-active editing context

**Proposed name**: `editSym2` (0xD01FF0) / `editDat2` (0xD01FF3)

### 0xD01FF6 / 0xD01FF9 = `chkDelPtr9` / `chkDelPtrA`

**Evidence**:
- The 0x0450AD reference dereferences the pointer and walks backward through
  a data structure (`DEC HL` x3, then reads 3 bytes with `LD E,(HL); DEC HL;
  LD D,(HL); DEC HL; LD B,(HL)`) — classic VAT entry traversal
- Companion at 0xD01FF9 has **49 references** — the most heavily used of all three
- Used in graph variable management (0x045xxx routines)

**Proposed name**: `graphVarSym` (0xD01FF6) / `graphVarDat` (0xD01FF9)

## Stride Analysis

The 3 primary pointers are exactly **6 bytes** apart:

| From | To | Delta |
|------|----|-------|
| 0xD01FEA | 0xD01FF0 | 6 |
| 0xD01FF0 | 0xD01FF6 | 6 |

This confirms the 6-byte pair structure: each pair = 3-byte primary + 3-byte
companion = 6 bytes total, packed contiguously.

## Memory Map (DeltaY..TraceStep gap)

| Address | Size | Name | Status |
|---------|------|------|--------|
| 0xD01FB7 | 9 | DeltaY | Known (ti84pceg.inc) |
| 0xD01FC0 | 42 | *(uncharted)* | Bytes between DeltaY end and first slot |
| 0xD01FEA | 3 | graphEditSym | **NEW** — ptr to VAT entry |
| 0xD01FED | 3 | graphEditDat | **NEW** — ptr to data |
| 0xD01FF0 | 3 | editSym2 | **NEW** — secondary edit sym ptr |
| 0xD01FF3 | 3 | editDat2 | **NEW** — secondary edit dat ptr |
| 0xD01FF6 | 3 | graphVarSym | **NEW** — graph variable sym ptr |
| 0xD01FF9 | 3 | graphVarDat | **NEW** — graph variable dat ptr |
| 0xD01FFC | 65 | *(uncharted)* | Bytes between last slot and TraceStep |
| 0xD0203D | 9 | TraceStep | Known (ti84pceg.inc) |

## Summary

| Address | Proposed Name | Confidence | Rationale |
|---------|---------------|------------|-----------|
| 0xD01FEA | `graphEditSym` | HIGH | Stored with editSym, used by graph edit routines |
| 0xD01FED | `graphEditDat` | HIGH | Companion at +3, 26 refs, classic sym/dat pair |
| 0xD01FF0 | `editSym2` | MEDIUM | Minimal refs; parallel structure to slot 1 |
| 0xD01FF3 | `editDat2` | MEDIUM | Companion at +3, 10 refs |
| 0xD01FF6 | `graphVarSym` | HIGH | VAT traversal at 0x0450AD, 49-ref companion |
| 0xD01FF9 | `graphVarDat` | HIGH | Most-referenced companion (49 hits) |
| 0xD02567 | `fmtMatSym` | CONFIRMED | ti84pceg.inc line 2941 |
