# Phase 427 — 0x00DF73 Per-Table Descriptor Initializer

## Function Boundaries

- **Start**: 0x00DF73 (preceded by RET at 0x00DF72)
- **End**: 0x00E06C (RET)
- **Size**: 250 bytes, 100 instructions
- **No loops**: The function is straight-line with one conditional forward branch (error path)

## Prologue / Epilogue

```
0x00DF73  LD HL,0xFFFFFD        ; -3 (stack frame: 3 bytes)
0x00DF77  CALL 0x002197         ; ZDS II C prologue — allocates stack frame
...
0x00E068  LD SP,IX              ; ZDS II C epilogue — tear down frame
0x00E06A  POP IX
0x00E06C  RET
```

This is a standard ZDS II C function. IX is the frame pointer. The function uses IX-0x03 as a 3-byte local variable (stores a pointer/handle from the slab allocator).

## How It Works — Single Entry Initialization

This function does NOT iterate. It initializes **one descriptor entry** per call. The caller (0x00E2EB) calls it 4 times, once per table base. The "table" concept is managed by the caller, not this function.

### Parameters

IY points to the descriptor entry being initialized (the 32-byte slab). IX points to a **parameter block** (likely a struct of configuration values). The function reads from the parameter block at various offsets (+0x06, +0x09, +0x0C, +0x0F, +0x12, +0x15) using IX, and writes computed values into the descriptor entry via IY.

The curious pattern `LD IX,(IX+0x06)` appears 10 times — this is IX = IX->next, walking a linked list of parameter nodes. Each time it dereferences IX+0x06 to advance to the next parameter node, then reads a field from that node.

### Fields Written to Descriptor Entry (IY-relative)

| Offset | Field | How Initialized |
|--------|-------|-----------------|
| +0 | type/flags byte 0 | Read (IY+0), mask with 0xE0, OR with (param.+0x09 * 2). Combines upper 3 bits from existing value with shifted subtype from params |
| +4 | link field | Direct copy from param node at +0x0C |
| +5 | computed field | LEA IY+4 then shifts via CALL 0x00257F (B=7 = shift 7 bits), ORed with param +0x12, stored at (HL) which is IY+5 |
| +6 | direct copy | From param node at +0x15, after advancing IX |
| +7 | flags byte 7 | Read (IY+7), mask with 0xF8 (clear low 3 bits), OR with bottom 3 bits computed from CALL 0x00276B / CALL 0x00230B (division: A=8 means divide by 256) |
| +16 (0x10) | status byte | SET bit 0, then later conditionally combined with slab alloc result upper bits, then RES bit 0 |
| +17 (0x11) | alloc field L | Low byte from CALL 0x002330 with A=0x08 (shift right 8) on slab pointer |
| +18 (0x12) | alloc field H | Low byte from CALL 0x002330 with A=0x10 (shift right 16) on slab pointer |
| +19 (0x13) | zero | Explicitly cleared to 0x00 |
| +20 (0x14) | status byte 2 | SET bit 0 (marks "pending"), then RES bit 0 after allocation completes |

### Slab Allocation

At 0x00DFFF, the function calls `CALL 0x00E06D` (the slab allocator, decoded in session 423 as a first-fit linear scanner). The result in HL is the allocated slab pointer. This pointer is stored at IX-0x03 (local variable) and its components are distributed into the descriptor entry fields:

1. Upper 5 bits of the alloc result go into IY+0x10 bits 7..5 (masked with 0xE0)
2. Bits 15..8 go into IY+0x11
3. Bits 23..16 go into IY+0x12
4. IY+0x13 is zeroed

If allocation fails (CALL 0x0021C2 returns Z), the function skips all post-allocation writes and returns HL=0 (error path at 0x00E010..0x00E013).

## CALL Targets

| Address | Purpose | Called From |
|---------|---------|-------------|
| 0x002197 | ZDS II C prologue (stack frame setup) | 0x00DF77 |
| 0x0021C2 | ZDS II C comparison/null check | 0x00E00A |
| 0x00230B | ZDS II C shift/divide (A=8 → shift right 8) | 0x00DFD0 |
| 0x002330 | ZDS II C shift/divide (A=8/0x10) | 0x00E031, 0x00E040 |
| 0x00257F | ZDS II C shift (B=7 → shift right 7) | 0x00DFA9 |
| 0x00276B | ZDS II C helper (arithmetic) | 0x00DFCA |
| 0x00E06D | Slab allocator (first-fit linear scan) | 0x00DFFF |

## Callers

0x00DF73 is called exactly 4 times, all from the descriptor pool initializer at 0x00E2EB:

| Call Site | Context |
|-----------|---------|
| 0x00E3B5 | Table base D13FD8 |
| 0x00E3D7 | Table base D13FDB |
| 0x00E41A | Table base D13FDE |
| 0x00E440 | Table base D13FE1 |

## Relationship to 0x20-byte Slab Structure

The function writes to IY offsets +0, +4, +5, +6, +7, +16, +17, +18, +19, +20 — covering 10 of the 32 bytes. The remaining bytes (+1..+3, +8..+15, +21..+31) are presumably initialized by the caller or by the earlier memset in the pool initializer at 0x00E2EB.

### Revised Descriptor Entry Layout (32 bytes)

Based on this decode:

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| +0 | 1 | type/subtype composite | Upper 3 bits = type tag, lower 5 bits = shifted subtype from param |
| +1..+3 | 3 | (link ptr 1) | Not touched by this function |
| +4 | 1 | param copy 1 | Direct copy from param chain |
| +5 | 1 | shifted composite | Shift-7 of IY+4..+5, ORed with param +0x12 |
| +6 | 1 | param copy 2 | Direct copy from param chain |
| +7 | 1 | flags | Upper 5 bits preserved, lower 3 bits = division result |
| +8..+15 | 8 | (not touched) | May be flags, subtype, addresses from caller/memset |
| +16 | 1 | alloc status | Bit 0 = pending flag, bits 7..5 = upper bits of slab alloc ptr |
| +17 | 1 | alloc byte 1 | Bits 15..8 of slab alloc pointer |
| +18 | 1 | alloc byte 2 | Bits 23..16 of slab alloc pointer |
| +19 | 1 | zero | Always cleared |
| +20 | 1 | status byte 2 | Bit 0 = pending flag (SET then RES pattern) |
| +21..+31 | 11 | (not touched) | Reserved |

## Key Observations

1. **No iteration**: This function handles exactly one descriptor entry. The 4 calls from the pool initializer each set up one entry in one table segment.

2. **Parameter chain via IX+0x06**: The function walks a linked list of parameter nodes 10 times using `LD IX,(IX+0x06)`. Each node contributes one configuration value. This is a classic C struct-of-pointers or linked parameter list pattern.

3. **Slab allocation embedded**: Each descriptor entry gets its own slab allocation (CALL 0x00E06D), and the 24-bit pointer is packed into bytes +16..+18 of the entry.

4. **SET/RES bit 0 pattern on +16 and +20**: These bits are set before allocation and reset after, suggesting they serve as "initialization in progress" flags.

5. **ZDS II C runtime heavy**: 6 of 7 CALL targets are ZDS II C runtime helpers (stack frame, comparison, shifts, division). Only the slab allocator (0x00E06D) is application code.
