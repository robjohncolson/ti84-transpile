# Phase 426 — 0x00E383 Descriptor Pool Initializer Report

## Function Boundaries

**Full function**: `0x00E2EB..0x00E4E7` (509 bytes, ~147 decoded instructions)

The instruction at 0x00E383 is **not** the function entry — it is mid-function. The true entry is at **0x00E2EB**, which begins with `LD HL,0xFFFFF7` / `CALL 0x002197` (the standard stack-frame setup, allocating 9 bytes of locals). The function ends with the manual epilogue `LD SP,IX` / `POP IX` / `RET` at 0x00E4E3..0x00E4E7.

Previous function's RET is at 0x00E2EA. Next function starts at 0x00E4E8.

## High-Level Structure

The function has four major phases:

### Phase 1: Memory allocation and lookup-table initialization (0x00E2EB..0x00E37D)

1. **Stack frame**: `CALL 0x002197` with 9 bytes of locals (HL = 0xFFFFF7 → -9).
2. **memset**: Pushes `0x000780` (1920 bytes) and `*(D14017)` (master descriptor pointer), then `CALL 0x00285F`. This is a bulk memory-clear/init of the 1920-byte descriptor pool starting at the address stored in D14017.
3. **D13FEA write**: Copies `*(D1401D)` (slab pool B) into `D13FEA`.
4. **Two nested loops** at 0x00E310..0x00E362:
   - **Loop A** (0x00E310): Iterates with stride 0x10 (16 bytes), writes `0x01` flags into a lookup table at `D1405C + offset`. This processes entries from the IX-relative local frame.
   - **Loop B** (0x00E33A): Iterates with stride 0x06 (6 bytes), writes `0x01` flags into a lookup table at `D1406C + offset`.
5. **Slab allocation**: Pushes `0x000002` and `CALL 0x00E06D` (slab alloc — 2 units). Result stored in `D141BE`.
6. **Null check**: `CALL 0x0021C2` tests if the allocation returned null. If zero, `JP Z,0x00E4E3` skips the entire descriptor setup and jumps to the epilogue.

### Phase 2: D13FD8 initialization (0x00E37E..0x00E3E0)

1. `LD BC,(0xD14017)` / `LD (0xD13FD8),BC` — **copies the master descriptor source pointer directly into D13FD8**.
2. `LD IY,(0xD14017)` / `LEA BC,IY+64` — computes `D14017_value + 0x40`.
3. Stores that at address `D13FDB` via `LD (HL),BC` with `HL = 0xD13FDB`. So **D13FDB gets D14017 + 0x40**.
4. **First CALL 0x00DF73** with args: `(D13FD8_value, 1, 0, 1, 0, 8)` — 6 stack args pushed right-to-left. This initializes 8 entries of the first descriptor table at the D13FD8 base.
5. **Second CALL 0x00DF73** with args: `(*(D13FDB), 1, 0, 0, 0, 0x40)` — initializes 0x40 (64) entries in the secondary table at D13FDB (D14017 + 0x40).

### Phase 3: D13FDE initialization (0x00E3E1..0x00E449)

1. `LD HL,(0xD14017)` / `LD BC,0x000080` / `ADD HL,BC` → `LD (0xD13FDE),HL` — **D13FDE gets D14017 + 0x80**.
2. `LD HL,(0xD14017)` / `LD BC,0x0000C0` / `ADD HL,BC` → stores at `(IY+3)` where `IY = 0xD13FDE` — **D13FE1 gets D14017 + 0xC0**.
3. **Third CALL 0x00DF73** with args: `(D13FDE_value, 1, 1, 0, 1, 0x40)` — initializes 0x40 entries at the D13FDE base.
4. **Fourth CALL 0x00DF73** with args: `(*(D13FE1), 1, 0, 2, 0x40)` — note the `0x02` parameter differs from the first pool's `0x00`. Initializes 0x40 entries in the secondary table at D13FE1 (D14017 + 0xC0).

### Phase 4: Descriptor header fixup (0x00E44A..0x00E4E7)

This phase performs bit-field manipulation on the descriptor headers at D13FD8 and D13FDB:

1. Reads `*(D13FDB)` byte, masks with `AND 0xE0` (keep top 3 bits).
2. ORs into `*(D13FD8)[0]` — merges high bits from the secondary base into the primary descriptor header byte 0.
3. **CALL 0x002553** twice with `A=0, L=8` then `A=0, L=16` — likely a division/modulo helper. Results written to `(IY+1)` and `(IY+2)` where `IY = *(D13FD8)`.
4. Clears byte at `(IY+3)` via `LD (HL),0x00` after `LEA HL,IY+3`.
5. Repeats a similar pattern for the secondary pool at D13FDB:
   - Reads `*(D13FD8)` byte 0, masks `AND 0xE0`, ORs into `*(D13FDB)[0]`.
   - CALL 0x002553 twice more (L=8, L=16) for `(IY+1)` and `(IY+2)`.
   - Clears `(IY+3)`.
6. Epilogue: `LD SP,IX` / `POP IX` / `RET`.

## All RAM Addresses Written

| Address | What | How |
|---------|------|-----|
| **D13FD8** | Descriptor base A (24-bit pointer) | Direct copy of `*(D14017)` |
| **D13FDB** | Secondary table A (24-bit pointer) | `*(D14017) + 0x40` |
| **D13FDE** | Descriptor base B (24-bit pointer) | `*(D14017) + 0x80` |
| **D13FE1** | Secondary table B (24-bit pointer) | `*(D14017) + 0xC0` |
| **D13FEA** | Slab pool copy | Copy of `*(D1401D)` (slab pool B) |
| **D141BE** | Slab alloc result | Result of `CALL 0x00E06D(2)` |
| **D1405C+n** | Lookup table flags (loop A) | Written `0x01` per 16-byte-stride entry |
| **D1406C+n** | Lookup table flags (loop B) | Written `0x01` per 6-byte-stride entry |
| Descriptor header bytes at `*(D13FD8)+0..+3` | Header fixup | Bit-merge + divide results |
| Descriptor header bytes at `*(D13FDB)+0..+3` | Header fixup | Bit-merge + divide results |

## All RAM Addresses Read

| Address | Purpose |
|---------|---------|
| **D14017** | Master descriptor source (read 5 times) |
| **D1401D** | Slab pool B pointer (read once at 0x00E304) |
| **D13FD8** | Descriptor base A (read many times for header fixup) |
| **D13FDE** | Descriptor base B (read once at 0x00E414) |
| **D13FDB** | Secondary table A (read multiple times) |
| **D141BE** | Slab alloc result (read at 0x00E372 for null check) |

## All CALL Targets

| Target | Purpose | Call Sites |
|--------|---------|------------|
| **0x002197** | Stack frame setup (9 bytes) | 0x00E2EF |
| **0x00285F** | memset/init (1920 bytes at D14017 base) | 0x00E2FE |
| **0x00E06D** | Slab allocator (2 units) | 0x00E369 |
| **0x0021C2** | Null/zero test | 0x00E376 |
| **0x00DF73** | Descriptor table entry initializer (called 4 times) | 0x00E3B5, 0x00E3D7, 0x00E41A, 0x00E440 |
| **0x002553** | Division/modulo helper (A, L inputs → C output) | 0x00E46D, 0x00E482, 0x00E4B3, 0x00E4CB |

## Descriptor Memory Layout

Starting from the pointer stored at D14017, the function carves 0x100 (256) bytes of descriptor pool into four sections:

```
D14017_value + 0x00..0x3F  →  D13FD8 pool (8 entries via CALL 0x00DF73)
D14017_value + 0x40..0x7F  →  D13FDB pool (64 entries via CALL 0x00DF73)
D14017_value + 0x80..0xBF  →  D13FDE pool (64 entries via CALL 0x00DF73)
D14017_value + 0xC0..0xFF  →  D13FE1 pool (64 entries via CALL 0x00DF73)
```

The full memset at the start clears 1920 (0x780) bytes, which is larger than 256 — suggesting the descriptor pool occupies more space than just the four sections initialized here, or D14017 points into a larger pre-allocated block.

## Does It Initialize Slab Pools?

- **D1401D** (slab pool B): **Read**, not written. The value is copied into D13FEA.
- **D1401A** (slab pool A): **Not referenced** in this function.
- **D14020** (slab pool C): **Not referenced** in this function.
- **D14017** (master source): **Read-only** — used as the base for all descriptor pool offsets.

So this function does **not** initialize the slab pool pointers (D1401A/D1401D/D14020). It consumes D1401D and D14017 as inputs — those must be initialized by a prior caller.

## Other State Set Up

Beyond D13FD8/D13FDE, this function also initializes:
1. **D13FDB** and **D13FE1** — secondary descriptor tables at +0x40 and +0xC0 offsets.
2. **D13FEA** — copy of slab pool B pointer.
3. **D141BE** — result of slab allocation (2 units from 0x00E06D).
4. **D1405C/D1406C lookup tables** — flag bytes set to 0x01 during the two initialization loops.
5. **Descriptor header bytes** — the 4-byte headers at each pool base get bit-field assembly from the 0x002553 helper.

## Key Observations

1. The `JP Z,0x00E4E3` at 0x00E37A means the entire descriptor setup (phases 2-4) is conditional on successful slab allocation. If `CALL 0x00E06D` returns null, no descriptor bases are written.
2. The 0x00DF73 function is the workhorse — called 4 times with 6 stack arguments each time. The arguments appear to be: `(base_ptr, flag1, flag2, flag3, flag4, entry_count)`.
3. The 0x002553 helper takes `A` (numerator?) and `L` (denominator?) and returns `C`. Called with denominators 8 and 16, consistent with computing sub-byte offsets or bit positions.
