# Phase 417: `0x0019B5` Trace and `D177D6` Writer Map

## Executive Summary

- `0x0019B5` is not a 99-byte cleanup stub. The decoded path is the post-HALT interrupt-controller service loop: `DI; LD A,0x10; OUT0 (0x00),A; NOP; NOP; HALT`, followed by dispatch over the FTINTC010 masked-status bytes.
- The primary window `0x0019B5-0x001A18` reads masked status from ports `0x5015`, `0x5014`, and `0x5016`, acknowledges through `0x5009`, `0x5008`, and `0x500A`, and branches into six service handlers.
- One of those handlers is the display callback dispatcher: `0x001A8D -> CALL 0x010220`.
- `D177D6` is not externally configured by other ROM subsystems. All exact-address writes are inside `0x010220` itself: bits 1, 2, and 3 are set from live LCD/display status and then cleared after dispatch. There is no direct `D177D6` bit-4 path.

## Part A: `0x0019B5`

### What the bytes decode to

The first 99 bytes (`0x0019B5-0x001A18`) decode as:

1. Sleep entry:
   `DI; LD A,0x10; OUT0 (0x00),A; NOP; NOP; HALT`
2. Byte-1 masked-status dispatch:
   `LD BC,0x5015; IN A,(C); JR Z,0x0019EF`
3. Byte-0 masked-status dispatch:
   `DEC C; IN A,(C); JR Z,0x001A17`
4. Byte-2 masked-status probe:
   `INC C; INC C; IN A,(C); LD C,0x0A; RRA*4; JR C,0x001A5D`

The code after `0x001A18` continues the same routine with the common epilogue and the branch targets:

- `0x001A32`: common exit, writes back `D02AD7`, clears `D0009B` bit 6, restores state, `EI; RETI`
- `0x001A4B`: byte1 bit6 service, acknowledge only
- `0x001A5D`: byte2 bit3 service, acknowledge and clear enable bit 3 in `0x5006`
- `0x001A77`: byte1 bit5 service, acknowledge then `CALL 0x009B35`
- `0x001A8D`: byte1 bit4 service, acknowledge then `CALL 0x010220`
- `0x001AA3`: byte0 bit3 service, acknowledge then `CALL 0x014DAB`
- `0x001ABB`: byte1 bit2 service, acknowledge only
- `0x001ACF`: byte0 bit4 service, acknowledge then decrement `D02658` and `D02651`

### Ports accessed

| Port | Role | Accesses in `0x0019B5` |
| --- | --- | --- |
| `0x0000` | CPU control register | `OUT0 (0x00),0x10` before HALT |
| `0x5015` | FTINTC010 masked status byte 1 | read at `0x0019BE` |
| `0x5009` | FTINTC010 acknowledge byte 1 | writes in byte1 handlers |
| `0x5014` | FTINTC010 masked status byte 0 | read at `0x0019EF` |
| `0x5008` | FTINTC010 acknowledge byte 0 | writes in byte0 handlers |
| `0x5016` | FTINTC010 masked status byte 2 | read at `0x001A17` |
| `0x500A` | FTINTC010 acknowledge byte 2 | generic ack path and byte2/bit3 handler |
| `0x5006` | FTINTC010 enable-mask byte 2 | read/modify/write in the byte2/bit3 handler |

### RAM touched

| Address | Role in this routine |
| --- | --- |
| `D02AD7` | updated from `POP HL` in the common exit before `RETI` |
| `D0009B` | bit 6 cleared in the common exit via `RES 6,(IY+0x1B)` |
| `D02658` | 24-bit counter decremented on the byte0/bit4 path |
| `D02651` | 8-bit counter decremented on the byte0/bit4 path |

### Functions called

| Target | Where | Purpose in the trace |
| --- | --- | --- |
| `0x009B35` | `0x001A87` | byte1/bit5 service helper |
| `0x010220` | `0x001A9D` | display callback dispatcher |
| `0x014DAB` | `0x001AB3` | larger byte0/bit3 service routine |

### Best interpretation

The routine is a post-HALT masked-IRQ dispatcher, not a reset/cleanup helper. It waits in HALT, then services FTINTC010 status bits in priority order and returns via `RETI`. Some callers use it as a synchronous service entry (`CALL 0x0019B5`), while some low-ROM jump sites use it as a terminal sleep/dispatch sink (`JP 0x0019B5`).

### Direct callers found

Pattern search results:

- `CALL 0x0019B5` (`CD B5 19 00`): `0x0094F7`, `0x0099A3`, `0x0099B8`, `0x00F3FB`, `0x01401A`, `0x0141B3`, `0x0149D2`, `0x0149ED`, `0x015110`
- `JP 0x0019B5` (`C3 B5 19 00`): `0x0003AC`, `0x000873`, `0x001420`, `0x001BA8`

That is the requested 13 direct callers total.

## Part B: `D177D6` writers

### Exact direct writes found

Only six exact-address stores to `D177D6` exist in ROM, all inside the display callback dispatcher at `0x010220`:

| PC | Action | Meaning |
| --- | --- | --- |
| `0x010284` | clear bit 1 | clear slot-1 pending bit after slot 1 dispatch |
| `0x0102B6` | clear bit 2 | clear slot-2 pending bit after slot 2 dispatch |
| `0x0102DB` | clear bit 3 | clear slot-3 pending bit after slot 3 dispatch |
| `0x010315` | set bit 1 | arm slot 1 when `(IX-1) & 0x02` is set |
| `0x01033F` | set bit 2 | arm slot 2 when `(IX-1) & 0x04` is set |
| `0x010369` | set bit 3 | arm slot 3 when `(IX-1) & 0x08` is set |

### Corrected bit mapping

Direct decode corrects the earlier assumption that `D177D6` bit 4 drives slot 4:

- slot 0 (`D177BD`) has no dedicated bit; it runs first whenever `D177D6 != 0`
- bit 1 drives slot 1 (`D177C0`)
- bit 2 drives slot 2 (`D177C3`)
- bit 3 drives slot 3 (`D177C6`)
- slot 4 (`D177C9`) is gated separately by `(IX-1) & 0x10`; `0x010374` writes `D177E1 = 1` before slot-4 dispatch

There is no exact-address writer or reader for a `D177D6` bit-4 path in the decoded dispatcher.

### What enables the bits

All three set paths live inside `0x010220`, so the OS is generating pending bits from display/LCD hardware state rather than from separate producer functions:

1. `0x010231` calls `0x007DC7`, which reads port `0x8034`.
2. The returned byte is stored in `(IX-1)` and immediately tested for bits `0x02`, `0x04`, and `0x08`.
3. When those bits are present, the dispatcher sets `D177D6` bit 1, 2, or 3 respectively.
4. Two of the set paths also refresh `D177D7` via `CALL 0x007CD3` and replay `CALL 0x007CAD(2)` before writing the new bit.

So the correlation is:

- LCD/display status bit `0x02` in `(IX-1)` enables callback slot 1
- LCD/display status bit `0x04` in `(IX-1)` enables callback slot 2
- LCD/display status bit `0x08` in `(IX-1)` enables callback slot 3

No ROM code outside the display dispatcher writes `D177D6` directly.

### Indirect writer that still matters

The display callback-struct reset at `0x010EDD` performs:

`memset(0xD177BD, 0, 0x71)`

Because `D177D6 = D177BD + 0x19`, this boot/reset memset also clears `D177D6` indirectly. It is not an exact-address writer, but it does reset the byte.

## Deliverables

- `TI-84_Plus_CE/probe-phase417-trace-0019B5.mjs`
- `TI-84_Plus_CE/probe-phase417-D177D6-writers.mjs`
- `TI-84_Plus_CE/phase417-0019B5-D177D6-report.md`
