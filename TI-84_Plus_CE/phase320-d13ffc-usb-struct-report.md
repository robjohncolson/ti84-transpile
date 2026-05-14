# Phase 320: D13FFC USB/Comm Struct Investigation

## Summary

D13FFC is the hottest single address in the D13FD8-D14040 callback region with 74 ROM references. It is **not** a callback pointer — it is a **3-byte heap pointer** to a dynamically allocated USB pipe descriptor struct. Together with D13FFF (48 refs) and D14002 (36 refs), it forms a **USB Pipe Triplet**: three pointers to linked USB endpoint/pipe descriptor structures.

## Reference Breakdown

### D13FFC (74 references)

| Operation | Count | Type |
|-----------|-------|------|
| `LD IY, (D13FFC)` — dereference pointer | 54 | PTR READ |
| `LD BC, (D13FFC)` — read raw pointer value | 12 | READ |
| `LD (D13FFC), BC` — write pointer (clear to 0) | 4 | WRITE |
| `LD (D13FFC), HL` — write pointer (from alloc) | 2 | WRITE |

**By region**: 37 refs in low-ROM (0x00CE-0x00D2), 37 refs in mid-ROM (0x0393-0x0397). The two regions are **parallel copies of the same USB driver** (Flash A vs Flash B), not byte-identical but functionally equivalent.

### D13FFF (48 references)

Same pattern: 28× `LD IY,(D13FFF)`, 16× `LD BC,(D13FFF)`, 2× writes from alloc, 2× clear-to-zero.

### D14002 (36 references)

Same pattern: 24× `LD IY,(D14002)`, 10× `LD BC,(D14002)`, 2× writes from alloc.

## Triplet Layout (D13FFC-D14004)

```
D13FFC: [ptr0_lo] [ptr0_mid] [ptr0_hi]   ← USB pipe descriptor 0 pointer (primary)
D13FFF: [ptr1_lo] [ptr1_mid] [ptr1_hi]   ← USB pipe descriptor 1 pointer (secondary)
D14002: [ptr2_lo] [ptr2_mid] [ptr2_hi]   ← USB pipe descriptor 2 pointer (tertiary, optional)
```

Each is a 3-byte (24-bit) eZ80 pointer into heap memory. The triplet occupies 9 bytes total. It is slot 12 (offset 0x24) of the ~35-entry OS pointer table at D13FD8-D14040.

## Heap-Allocated Pipe Descriptor Struct

Each pointer (D13FFC, D13FFF, D14002) points to a ≥16-byte struct with fields at:

| Offset | Size | Field | Access Pattern |
|--------|------|-------|----------------|
| +0x00 | 1 | Pipe flags/status | R/W: bit 0/1 = pipe type, bit 5 = direction, bit 7 = active flag |
| +0x01 | 1 | Endpoint address | W via `CBE9` linking |
| +0x02 | 1 | Max packet size indicator | W via `CBE9` linking |
| +0x03 | 1 | Interval/padding | W (set to 0) |
| +0x04 | 1 | Transfer flags | R/W: same bit patterns as +0x00 |
| +0x08 | 1 | Config/descriptor flags | R/W: AND 0xFC mask, SET/RES bits 0,1,6,7 |
| +0x0A | 1 | Max packet size | W: set to 8 |
| +0x0B | 1 | Interval | W: set to 0 |
| +0x0C | 1 | Toggle/sequence | Modified via RRC (rotate right) |
| +0x0F | 1 | Reserved/padding | W: set to 0 |

The sub-struct at +0x08 is accessed via `LEA IX, IY+0x08`, forming an inner descriptor within the pipe struct.

## Management Functions

### Primary: `0x00CD7B` — USB Pipe Setup (main entry)

- **Frame**: `LD HL, 0xFFFFFD; CALL 0x2197` (3 local bytes)
- **Logic**: 
  1. Reads USB setup packet from IX+9 (argument struct)
  2. Extracts transfer type from byte 0 bits 7:6 (SRL×5 + AND 3)
  3. Dispatches via switch table (`CALL 0x002623`) based on transfer type
  4. Extracts bRequest from byte 1, dispatches again (`CALL 0x00211B`)
  5. Depending on type: allocates 1, 2, or 3 pipe descriptors
  6. Stores pointers in D13FFC, D13FFF, D14002

### `0x00CE78` — Pipe Allocation Block

Within the CD7B function body:
1. `CALL 0x00E06D` — **heap allocate** pipe descriptor struct (size passed in BC=0)
2. `LD (D13FFC), HL` — store pointer
3. `CALL 0x0021C2` — **null check** (HL == 0? → alloc failed)
4. If OK, repeat for D13FFF
5. If D13FFF alloc fails: `CALL 0x00E1CC` to **free** D13FFC, zero the pointer
6. If 3-pipe mode (IX+0xFF ≠ 2): allocate D14002 too, with rollback on failure

### `0x00CBE9` — Pipe Linking

Links two pipe descriptors together:
- Copies endpoint direction bits (AND 0x1F mask + OR with source bits)
- Sets endpoint address and max packet size fields
- Establishes parent-child relationship between pipe structs

### `0x00CB7B` — Configuration Copy

Copies USB configuration data from D141BE buffer into pipe descriptor fields. Uses `CALL 0x002730` for multi-byte field copy.

### `0x00D2ED` — USB Request Validator

Standalone function checking USB control request fields:
- D141F7 == 0x04 (bRequest)
- D141F6 == 0x51 (bmRequestType: device-to-host, class, interface)
- D141F9 == 0xE0, D141F8 == 0x08 (wValue/wIndex fields)
- D141FB bit 1 set, D141FA bit 0 clear

This pattern matches a **USB HID class Get_Report request** or similar class-specific control transfer.

### Mirror at 0x039240–0x039760

Functionally identical copy of the entire USB pipe management code. Common TI-OS pattern: Flash A (page 0) and Flash B (page 3) contain parallel USB stack implementations.

## Vector Table Entries

The vector table at 0x000200 uses 4-byte `JP addr24` entries. Entries 38-41 point to:

| Entry | Address | Target | Notes |
|-------|---------|--------|-------|
| 38 | 0x000298 | JP 0x003818 | USB-adjacent handler |
| 39 | 0x00029C | JP 0x00388B | USB-adjacent handler |
| 40 | 0x0002A0 | JP 0x0038A9 | USB-adjacent handler |
| 41 | 0x0002A4 | JP 0x0038ED | USB-adjacent handler |

These point to the 0x3800 area, **not** directly to the 0xCE area. The 0xCD7B function is called indirectly: `CALL 0x00D2ED from 0x00D904`, and 0xD904 is itself within the broader USB dispatch chain rooted in the 0x3800 area handlers.

## Related RAM Addresses

| Address | Refs | Role |
|---------|------|------|
| D141BE | 54 | USB configuration descriptor buffer |
| D141F6 | 6 | bmRequestType field |
| D141F7 | 6 | bRequest field |
| D141F8 | 15 | wValue low byte |
| D141F9 | 13 | wValue high byte |

## Subsystem Classification

**USB Communication Subsystem** — specifically the USB pipe/endpoint descriptor manager. This is the TI-OS layer that:

1. Receives USB setup packets (control transfers)
2. Allocates endpoint pipe descriptors from the heap
3. Links them into a chain (parent→child pipe relationships)
4. Copies USB configuration data into the pipe structs
5. Manages pipe lifecycle (alloc, configure, link, free)

The triplet D13FFC/D13FFF/D14002 represents the **currently active USB pipe set**: up to 3 linked pipe descriptors for the active USB connection (e.g., TI-Connect CE communication, USB peripheral mode). The 2-pipe vs 3-pipe allocation path (controlled by IX+0xFF == 2) likely corresponds to different USB interface configurations (bulk-only vs bulk+interrupt).
