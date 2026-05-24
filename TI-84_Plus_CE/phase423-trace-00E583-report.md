# Phase 423 — 0x00E583 Sibling List Walker (923 bytes)

## Function Identity

| Field | Value |
|-------|-------|
| Address | 0x00E583–0x00E91D |
| Size | 923 bytes (0x39B) |
| Prologue | `LD HL,-10; CALL 0x2197` (10-byte stack frame) |
| Epilogue | `LD A,(IX-3); LD SP,IX; POP IX; RET` at 0xE916 |
| Return value | IX-3: 0x01 = early exit / busy, 0x00 = success |

## Callers (2)

| Caller | Context |
|--------|---------|
| 0x00D295 | Within USB transfer orchestration layer |
| 0x00ED10 | Within endpoint/link processing |

No JP references found.

## CALL Targets (12 unique, 24 total calls)

| Target | Label | Count |
|--------|-------|-------|
| 0x002197 | Stack frame setup | 1 |
| 0x0021C2 | Validate/check helper | 2 |
| 0x00229D | Shift-combine helper | 6 |
| 0x0022F9 | Shift-extract helper | 6 |
| 0x002330 | Bitfield extract | 2 |
| 0x00276B | Helper (unknown) | 1 |
| 0x0027E8 | Helper (unknown) | 1 |
| 0x006EAF | USB status check | 1 |
| 0x00DA8C | Link-state toggle | 1 |
| 0x00E1CC | Slab free helper | 1 |
| 0x00E4E8 | Header field extractor | 1 |
| 0x014E3F | Helper (unknown) | 1 |

## RAM Variables (13 unique addresses)

| Address | R | W | Role |
|---------|---|---|------|
| D14005 | 4 | 1 | Block-list head pointer |
| D14008 | 7 | 1 | Current node pointer |
| D1400B | 7 | 2 | Phase 2 walking pointer |
| D1400E | 1 | 1 | Phase 2 next-link storage |
| D14011 | 20 | 2 | Sibling pointer (primary walk target) |
| D14076 | 2 | 1 | Iteration counter (incremented during validation) |
| D141BB | 0 | 1 | Stored from Phase 2 processing |
| D141EA | 1 | 0 | Read during secondary path |
| D141EC | 1 | 1 | Active-transfer flag (set to 0x01 in prologue, cleared in secondary path) |
| D1440E | 0 | 1 | Cleared in secondary path |
| D1440F | 1 | 0 | State condition check |
| D176FB | 0 | 1 | Set to 0x01 after post-loop processing |
| D177B7 | 1 | 0 | State condition check (compared to 0x55) |

## Port I/O

4 reads of port 0x3030 (USB status register) via `IN A,(C)` with `BC=0x3030`. Bit 0 is checked — if set, the function returns early with result 0x01 (busy).

## Loop Structure

### Loop 1 — Sibling linked-list walk (0xE623–0xE679)

Walks a singly-linked list via D14011 (sibling pointer). Each node is a 3+ byte structure:

```
byte 0: flags — bit 0 = valid entry, bits 7:5 = upper address bits
byte 1: address bits 7:0
byte 2: address bits 15:8
```

The loop loads `IY = (D14011)`, checks `IY+0 AND 0x01` (valid bit). If zero, exits the loop. Otherwise extracts address fields from bytes 0–2 via shift-extract (0x22F9) and shift-combine (0x229D), stores the result back to D14011, and jumps back.

This follows the sibling chain until it finds a terminal (invalid) entry or reaches the end.

### Loop 2 — Circular sibling processing (0xE8A3–0xE914)

Walks the same list a second time using D1400B as the cursor, starting from D14008 (current node). For each entry:

1. Extracts IY+0x0B, masks bit 7 off (RES 7,A)
2. Computes offset into an entry table
3. Calls 0x276B (helper) then 0xE4E8 (header field extractor)
4. Validates via 0x21C2, stores results
5. Extracts next-link address from IY+0/1/2 into D1400E
6. Calls 0xE1CC (slab free) with BC=0
7. Advances D1400B from D1400E
8. Compares D1400B against D14005 (block-list head) — loops until it wraps back to the head

This is a circular linked-list traversal: it processes every sibling and stops when it returns to the starting node.

## Control Flow Summary

```
PROLOGUE → set IX-3=1, D141EC=1, load params
  ↓
USB STATUS CHECK (0x6EAF)
  → if zero: check port 0x3030 → if busy: return 1
  ↓
PHASE 1: extract header fields, build D14008/D14005/D14011
  ↓
LOOP 1: walk sibling list via D14011 (linear scan)
  ↓
POST-LOOP: process results, extract bitfields, call 0x14E3F
  ↓
VALIDATION: check IX+0x0F, call 0x21C2, increment D14076
  → if port busy: return 1
  → if valid: set IY+8 bit 7, return 0
  ↓
SECONDARY PATH: check iteration limit (300), state conditions
  → may call 0xDA8C (link-state toggle)
  → may call 0xDA8C, clear D1440E
  ↓
PHASE 2 / LOOP 2: circular walk from D14008
  → for each sibling: extract, validate, free slab, advance
  → until cursor == D14005 (back to head)
  ↓
EPILOGUE: return IX-3
```

## Relationship to Known Functions

**0x00E4E8 (header field extractor)**: Called once at 0xE882 during Loop 2. Extracts header fields from each sibling node to determine the next link and validate entry type. 0xE583 is the primary consumer of 0xE4E8.

**0x00FE10 (transfer engine)**: Not called directly, but shares the same data structures — D14008 (current node), D14005 (block-list head), D14011 (sibling ptr). 0xE583 walks and validates the sibling list; 0xFE10 performs the actual data transfer using the same linked structure.

**0x00DA8C (link-state toggle)**: Called at 0xE829 during the secondary path — toggles the USB link state when certain conditions are met during list processing.

**0x00E1CC (slab free)**: Called at 0xE8F8 during Loop 2 — frees memory slab entries after each sibling is processed.

## Functional Summary

0x00E583 is a **sibling descriptor list walker** in the USB subsystem. It:

1. Checks USB readiness (port 0x3030, function 0x6EAF)
2. Extracts a linked list of sibling descriptors from header fields
3. Walks the sibling chain (Loop 1) to find the terminal entry
4. Validates and processes the result, updating descriptor flags
5. Performs a circular re-walk (Loop 2) to extract headers from each sibling, free their slab allocations, and advance through the ring
6. Returns 0 on success or 1 if the USB bus was busy

The 300-iteration limit (0x012C) in the secondary path is a watchdog against infinite loops in a corrupted descriptor chain.
