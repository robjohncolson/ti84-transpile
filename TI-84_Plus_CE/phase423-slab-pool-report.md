# Phase 423 — Slab Pool Metadata Reference Map

## Summary

Scanned the full 4MB ROM for byte-pattern references to 8 slab-pool RAM addresses. Found **127 total references** across **15 functional clusters**. Identified the slab ALLOC function, POOL INIT, BLOCK LIST management, and BLOCK WALKER functions, plus their 0x03xxxx mirror copies.

## RAM Variables

| Address | Name | Refs | Role |
|---------|------|------|------|
| D1401A | slab pool lower bound (sel 0) | 12 | Pool init writes; free/alloc reads for bounds checking |
| D1401D | slab pool upper bound (sel 0) | 8 | Pool init writes; bounds checking |
| D14020 | slab pool base (sel 2) | 10 | Pool init writes; alloc reads for slot address computation |
| D1406C | free bitmap (sel 2) | 8 | Alloc reads to find free slot; free writes to mark slot available |
| D14005 | block list terminator | 14 | Block list mgmt: loop termination sentinel |
| D14008 | block list head | 24 | Block list mgmt: list head pointer |
| D1400B | current block pointer | 43 | Block walker: iteration cursor |
| D1400E | successor value | 8 | Block walker: next-block pointer for traversal |

## Functional Clusters

### 1. Pool Init — 0x00CB29..0x00CB68 (mirror at 0x038ED1..0x038F42)

3 WRITE refs: stores lower bound (D1401A), upper bound (D1401D), and base (D14020). This is the slab pool initialization function that sets up the memory pool geometry.

- D1401A ← `ED 43 1A 40 D1` (LD (D1401A),BC) — stores lower bound
- D1401D ← `ED 43 1D 40 D1` (LD (D1401D),BC) — stores upper bound
- D14020 ← `ED 43 20 40 D1` (LD (D14020),BC) — stores pool base

### 2. Slab Alloc — 0x00E06D..0x00E355 (mirrors at 0x03B29C, 0x03B450)

The ALLOC function (counterpart to FREE at 0x00E1CC). Entry point estimated at **0x00E06D** (prologue: `21 FE FF FF CD 97 21 00` = `LD HL,-2; CALL __frameset0`).

Key operations:
- Reads D1406C (free bitmap) via `LD BC, D1406C; ADD HL,BC; LD A,(HL)` to find a free slot
- Reads D14020 (pool base) via `LD BC,(D14020)` to compute slot physical address
- Writes D1406C bitmap entry to `02` (marking slot as allocated): `36 02`
- Reads D1401A/D1401D for bounds validation of the allocated address
- Contains the FREE function at 0x00E1CC as a sub-region (selector-driven memory recycler)

The alloc function spans roughly 0x00E06D..0x00E2EE (~641 bytes), making it the largest slab pool function.

### 3. Block List Init — 0x00E5F0..0x00E6A0 (mirror at 0x03B830..0x03B8F0)

Initializes the block list data structure:
- Writes D14008 (block list head) via `LD (D14008),HL`
- Writes D14005 (terminator) via `LD (D14005),BC`
- Reads D14005 for tag byte extraction: `LD A,(D14005); AND 0xE0`

### 4. Block Walker — 0x00E840..0x00E920 (mirrors at 0x00FF30..0x010000, 0x03BAB0..0x03BBD3, 0x03CDF0..0x03CE90)

Iterates the block linked list:
- Copies D14008 (head) to D1400B (current): `LD BC,(D14008); LD (D1400B),BC`
- Traverses via `LD IY,(D1400B)` then field reads at offsets 0x00, 0x01, 0x04, 0x08, 0x0B
- Advances via `LD (D1400E),HL` (successor) then `LD BC,(D1400E); LD (D1400B),BC`
- Terminates when `LD BC,(D14005); LD HL,(D1400B); SBC HL,BC` equals zero

This is the block-list walker with result codes, previously decoded at 0x00FE10 (session 421).

### 5. Block List Bit Manipulation — 0x00E760..0x00E7A0 (mirror at 0x03B9A0..0x03B9E5)

Reads D14008 (head) via `LD IY,(D14008)` and manipulates bit 7 of field at offset 0x08:
- `SET 7,(IY+8)` — marks block as active/in-use
- `RES 7,(IY+8)` — clears active flag

### 6. Isolated Reads

- **0x00CD34**: Reads D1401D in a validation context with calls to 0x0079B9 and 0x007957
- **0x0332DE..0x0332F3**: Reads D1401A twice, with calls to 0x000138 and 0x038E9C — possibly a pool consistency check
- **0x03917E, 0x039C30**: Read D1401D — likely pool validation in a different subsystem

## Mirror Function Map

The ROM contains near-identical copies of these functions in the 0x03xxxx region:

| Primary | Mirror | Function |
|---------|--------|----------|
| 0x00CB29 | 0x038ED1 | Pool init |
| 0x00E06D | 0x03B29C | Slab alloc |
| 0x00E1CC | 0x03B2xx | Slab free |
| 0x00E5F0 | 0x03B830 | Block list init |
| 0x00E760 | 0x03B9A0 | Block bit manipulation |
| 0x00E840 | 0x03BAB0 | Block walker |
| 0x00FF30 | 0x03CDF0 | Block walker (variant) |

## Slab Alloc Function Detail (0x00E06D)

The alloc function works as follows:
1. Prologue: `LD HL,-2; CALL __frameset0` (standard C-calling-convention frame setup)
2. Scans free bitmap (D1406C + selector offset) looking for entry with value 0 (free)
3. When found, marks entry as `02` (allocated)
4. Computes physical address: reads D14020 (base), multiplies selector by slab size (0x0A × shift), adds base
5. Validates address against D1401A (lower) and D1401D (upper) bounds
6. Returns allocated address or error code

## Probe

`TI-84_Plus_CE/probe-phase423-slab-pool-map.mjs` — 11/11 checks passing.
