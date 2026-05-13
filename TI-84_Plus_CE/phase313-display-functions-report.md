# Phase 313: Display/Cursor State Functions (0x0003EC / 0x0003F0)

## Summary

Two unnamed high-traffic ZDS II C runtime vectors write to the D17700-D17721 display state area:

| Vector | Target | Callers | Proposed Name | Purpose |
|--------|--------|---------|---------------|---------|
| 0x0003EC | 0x0152D8 | 74 | `SetTextSpan` | 3-arg: set up a byte-copy span in display memory |
| 0x0003F0 | 0x015349 | 85 | `SetDisplayRegion` | 6-arg: set up dual-source display region fill |

The 3-arg function does NOT call the 6-arg function. They are independent routines that share the same loop structure (decrement counter at D17719, copy byte from source to dest pointer at D1770D).

## 3-Arg Function: `SetTextSpan` (0x0152D8, 113 bytes)

### Stack Frame (ZDS II C ABI)

Prologue: `LD HL, -6; CALL 0x002197` reserves 6 bytes of locals, saves IX.

| Offset | Size | Type | Name | Description |
|--------|------|------|------|-------------|
| IX+6 | 3 | ptr | basePtr | Base address loaded into D17710 |
| IX+9 | 1 | u8 | count | Span length, stored in D17719 |
| IX+12 | 3 | ptr | sourcePtr | Source pointer; combined with count to compute D1770D |

### Algorithm

```
D17710 = arg1 (basePtr)
D17719 = arg2 (count)
HL = sourcePtr + (count - 1)   // OR A clears carry, SBC HL,HL zeros HL, L=A, ADD HL,BC
D1770D = HL                    // working pointer starts at end of region

loop:
  if D17719 == 0: exit
  D17719--
  save D1770D to IX-3 (local)
  D1770D = D1770D - 1          // LEA BC, IY-1
  A = (D17710)                 // read byte from source
  (D1770D) = A                 // write to dest
  save D17710 to IX-6 (local)
  D17710++
  goto loop
```

The function copies `count` bytes from `basePtr` into a region ending at `sourcePtr + count - 1`, working backwards. This is a reverse-direction memcpy used for display buffer fills.

### RAM Writes

| Address | Direction | Purpose |
|---------|-----------|---------|
| D17710 | WRITE then READ/INC | Source pointer (incremented each iteration) |
| D17719 | WRITE then DEC | Counter (decremented to 0) |
| D1770D | WRITE then DEC | Destination pointer (decremented each iteration) |

## 6-Arg Function: `SetDisplayRegion` (0x015349, 232 bytes)

### Stack Frame

Same prologue: `LD HL, -6; CALL 0x002197`.

| Offset | Size | Type | Name | Description |
|--------|------|------|------|-------------|
| IX+6 | 3 | ptr | fillPtr | Primary source/fill pointer -> D1771E |
| IX+9 | 1 | u8 | fillByte | Primary fill attribute -> D17721 |
| IX+12 | 3 | ptr | secPtr | Secondary source pointer -> D1771E (in alt path) |
| IX+15 | 1 | u8 | secByte | Secondary fill attribute -> D17721 (in alt path) |
| IX+18 | 1 | u8 | rowCount | Height / row count -> D17719 |
| IX+21 | 3 | ptr | stridePtr | Stride/column pointer (combined with rowCount to compute D1770D) |

### Algorithm

```
D1770D = stridePtr + (rowCount - 1)    // same pointer arithmetic as 3-arg
D1771E = arg1 (fillPtr)
D17721 = arg2 (fillByte)
D17719 = arg5 (rowCount)

if rowCount == 8:
    D17719 = 4                         // half-height override
    loop (4 iterations):
        D1770D--
        (D1770D) = byte from D1771E
        call 0x002553 with A=D17721, L=8  // bit-rotate helper
        update D1771E, D17721
else:
    D1771E = arg3 (secPtr)             // IX+12
    D17721 = arg4 (secByte)            // IX+15
    // same loop structure as rowCount==8 path
    loop (rowCount iterations):
        D1770D--
        (D1770D) = byte from D1771E
        call 0x002553 with A=D17721, L=8
        update D1771E, D17721
```

### RAM Writes

| Address | Direction | Purpose |
|---------|-----------|---------|
| D1770D | WRITE | Working/destination pointer |
| D1771E | WRITE then READ/UPDATE | Source pointer for fill data |
| D17719 | WRITE then DEC | Row counter |
| D17721 | WRITE then READ/UPDATE | Fill attribute byte |

### Special Case: rowCount == 8

When the row count is exactly 8, the function overrides D17719 to 4 and uses the primary args (IX+6, IX+9) for fill data. It calls `0x002553` — a bit-rotate helper that rotates A through L iterations — suggesting this path handles pixel-level (sub-byte) display manipulation, likely for the 8-pixel-tall character cells on the TI-84 Plus CE LCD.

When rowCount != 8, it uses the secondary args (IX+12, IX+15) and runs a similar loop.

## D17700-D17721 RAM Map

| Address | Size | Refs | Purpose |
|---------|------|------|---------|
| D17700 | 3 | 3 | Base/origin pointer (rarely accessed) |
| D1770A | 3 | 155 | Text buffer base pointer (FP workspace) |
| D1770D | 3 | 23 | Working pointer — set/updated by both functions |
| D17710 | 3 | 9 | Source pointer — used by 3-arg function |
| D17713 | 3 | 150 | Text cursor X (column) position |
| D17716 | 3 | 112 | Text cursor Y (row) position |
| D17719 | 1 | 21 | Span/row counter — decremented by both functions |
| D1771A | 3 | 167 | Display region base pointer (highest ref count) |
| D1771D | 1 | 89 | Text attribute / display mode byte |
| D1771E | 3 | 19 | Secondary source pointer — used by 6-arg function |
| D17721 | 1 | 9 | Secondary fill/attribute byte — used by 6-arg function |

The region D17700-D17721 is a **text/display state block** containing:
- Buffer pointers (D1770A, D1771A)
- Cursor position (D17713 = X, D17716 = Y)
- Working state for span operations (D1770D, D17710, D1771E)
- Counters and attributes (D17719, D1771D, D17721)

The high-traffic addresses D1770A (155 refs), D17713 (150 refs), D1771A (167 refs), and D17716 (112 refs) are the core text cursor and display region state used across hundreds of call sites in the ROM.

## Caller Context

### 3-arg callers (SetTextSpan)

Typical pattern: push a display region pointer (often from D1771A), push a small count (2-4), push a base pointer. Called from:
- **Text editor** (0x02E825, 0x02E83C): after loading D176A8 display context
- **Menu rendering** (0x02CE9C): sets up D17716/D17713 before calling
- **Cursor movement** (0x02EA39): pushes count=2 with a cursor pointer

### 6-arg callers (SetDisplayRegion)

Typical pattern: push 5-6 values including D1771A, a row count (often 0x0D or 0x11), zeros for fill, and D1771D attribute byte. Called from:
- **Screen clear/init** (0x02CB30): count=0x11 (17 rows = full screen), fill=0
- **Graph rendering** (0x02D665, 0x02D688): count=4 and count=0x0D
- **Window setup** (0x02DA54): reads D1771A and D1771D, then fills a region

## Relationship to Known Routines

- **0x002197**: ZDS II C frame helper (shared by both functions)
- **0x002553**: Bit-rotate helper called from 6-arg function's rowCount==8 path
- **D176A8/D176AB**: Display context pointers frequently loaded before calling these functions
- **LCD refresh at 0x06868A**: Consumes the display state set by these functions

## Artifacts

- `probe-phase313-display-functions.mjs` — runnable probe (disassembly + RAM map + caller trace)
- This report
