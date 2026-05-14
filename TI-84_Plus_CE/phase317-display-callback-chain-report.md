# Phase 317 — Display Callback Dispatch Call Chain from 0x05F685

## Summary

Traced the complete call chain upstream from `0x05F685` (display callback dispatch wrapper). The function is a thin wrapper that calls OS vector entry 0 (`0x000580 -> JP 0x010220`), which iterates 5 callback slots gated by the `D177D6` pending-flags bitmask. The sole caller is the LCD SPI command handler's SET 4,A case, reached via an ISR dispatch path from the interrupt vector at `0x000043`.

## 0x05F685 Disassembly

```
0x05F685:  CD 80 05 00   CALL 0x000580   ; OS vector entry 0
0x05F689:  C9            RET
```

Two instructions. The wrapper exists so the LCD SPI handler can call display callback dispatch through the OS vector table (entry 0 at `0x000580`), which trampolines to the real implementation at `0x010220`.

## Call Chain (3 levels upstream)

```
Level 0 (target):
  0x010220  display callback dispatch (implementation)
    ↑ JP from 0x000580 (OS vector entry 0)
    ↑ CALL from 0x001A9D (second LCD SPI handler, direct call)

Level 1 (wrapper):
  0x05F685  CALL 0x000580; RET
    ↑ CALL from 0x03D14F (SET 4,A case in LCD SPI command handler)

Level 2 (LCD SPI command handler):
  0x03CF7D  LCD SPI port-I/O dispatch (entry point)
    ↑ JP from 0x02010C (jump table entry 3 at 0x020100)
  0x03CF6A  (alternate entry, same handler)
    ↑ JP from 0x03CD4A (inline case dispatch)

Level 3 (ISR/boot path):
  0x02010C  jump table entry
    ↑ JP from 0x00071C (ISR dispatch logic)
  0x0006F3  ISR handler
    ↑ JP from 0x000043 (interrupt vector)
```

## LCD SPI Command Handler Cases (0x03CF7D)

The handler dispatches on SPI port state by setting bit N of register A, writing to port C, then polling port B for `0x50` ready status:

| Bit Pattern | SET opcode | Target Called | Purpose |
|-------------|-----------|---------------|---------|
| SET 1,A | `CB CF` | `CALL 0x02510E` | SPI transfer |
| SET 2,A | `CB D7` | `CALL 0x02510E` | SPI transfer |
| SET 3,A | `CB DF` | `CALL 0x0BCC81` | Memory/flash op |
| **SET 4,A** | **`CB E7`** | **`CALL 0x05F685`** | **Display callback dispatch** |
| SET 5,A | `CB EF` | `CALL 0x049526` | LCD status/config |

After each case, the handler jumps back to `0x03D0E0` (the dispatch loop top).

## Display Callback Struct (D177BC-D177E1)

The `0x010220` implementation manages 5 callback slots and a pending-flags bitmask:

| Address | Size | Field | Notes |
|---------|------|-------|-------|
| `D177BC` | 1 | Master enable | If zero, entire dispatch bails early |
| `D177BD` | 3 | Slot 0 callback ptr | Always checked first |
| `D177C0` | 3 | Slot 1 callback ptr | Fired when D177D6 bit 1 set |
| `D177C3` | 3 | Slot 2 callback ptr | Fired when D177D6 bit 2 set |
| `D177C6` | 3 | Slot 3 callback ptr | Fired when D177D6 bit 3 set |
| `D177C9` | 3 | Slot 4 callback ptr | Fired when D177D6 bit 4 set |
| `D177D6` | 1 | Pending flags bitmask | Bits 1-4 = slots 1-4 pending |
| `D177D7` | 1 | Command/status byte | Cleared after use |
| `D177E1` | 1 | Slot 4 active flag | Set to 1 when slot 4 fires |

Each slot is dispatched via `CALL (HL)` / `CALL (IY)` after validating the pointer is non-null (`CD C2 21 00` = null check helper at `0x0021C2`; `CD 88 22 00` = indirect call helper at `0x002288`).

## Event Loop Connection

The connection from the main event loop (`0x02FD8F`) to display callback dispatch is **indirect**, mediated by LCD SPI port I/O:

```
Event Loop Path:
  0x02FCC2:  CALL 0x02FD8F   (main key/event handler)
  0x02FE02:  CALL 0x03D1BE   (LCD SPI transaction initiator)
  0x03D1BE -> CALL 0x03D1E4  (SPI dispatch setup, writes to LCD ports)

ISR Path (asynchronous, triggered by SPI completion):
  0x000043 -> JP 0x0006F3    (interrupt vector -> ISR handler)
  0x0006F3 -> ... -> 0x00071C -> JP 0x02010C -> JP 0x03CF7D
  0x03CF7D: LCD SPI command handler reads port state
  0x03D14F: SET 4,A case -> CALL 0x05F685 -> display callback dispatch
```

The event loop does **not** directly call `0x05F685` or `0x010220`. Instead:
1. The event loop initiates LCD operations via `0x03D1BE` (44+ call sites across the OS)
2. `0x03D1BE` writes commands to LCD SPI ports
3. The SPI completion ISR fires and enters `0x03CF7D`
4. The ISR's SET 4,A case calls `0x05F685` to dispatch pending display callbacks

This is a classic interrupt-driven LCD refresh pattern: the main thread queues display work by setting flags in `D177D6` and installing callback pointers at `D177BD-D177C9`, then the ISR fires the callbacks when the LCD SPI transaction completes.

## Key Addresses

| Address | Role |
|---------|------|
| `0x05F685` | Display callback dispatch wrapper (target of this analysis) |
| `0x000580` | OS vector entry 0 (JP to implementation) |
| `0x010220` | Display callback dispatch implementation (~400 bytes) |
| `0x03CF7D` | LCD SPI command handler entry |
| `0x03D14F` | SET 4,A case (sole caller of 0x05F685) |
| `0x03D0E0` | LCD SPI dispatch loop top |
| `0x03D1BE` | LCD SPI transaction initiator (event loop entry point) |
| `0x02010C` | Jump table entry 3 -> LCD SPI handler |
| `0x00071C` | ISR dispatch -> jump table |
| `0x000043` | Interrupt vector -> ISR path |
| `0x02FE02` | Event loop -> LCD SPI trigger |

## Probe

`node TI-84_Plus_CE/probe-phase317-display-callback-chain.mjs` — 24 checks verifying byte patterns across the entire chain.
