# Phase 409: Notification Sub-Handler Dispatch Table Report

## Scope

Decode the 6-entry dispatch table inside handler `0x0120AA`, which is the common target of the 10-entry CP cascade at `0x01204A` (payload values `0x0B, 0x0D, 0x99, 0x9A, 0x9B, 0x01, 0x98, 0x96, 0x97, 0xFF` in `D177B8`).

## Dispatch Mechanism

**Type**: `_seqcase` inline table via `CALL 0x002623`

The handler at `0x0120AA` does not use a JP table or pointer table. Instead it uses the OS's `_seqcase` helper at `0x002623`, which reads an inline data block immediately after the CALL instruction. The inline data encodes:

- **1 byte**: max index (5, meaning 6 entries numbered 0..5)
- **4 bytes**: header/range parameters (`00 01 00 00`)
- **6 x 3 bytes**: target addresses (little-endian 24-bit)

The dispatch index comes from `(IY+4)`, loaded into HL via `SBC HL,HL; LD L,A`.

### Control flow

```
0x0120AA: Load IX frame params
          CALL 0x00238F (param conversion, A=5)
          LD A,(D1778E)        ; pre-check param A
          LD BC,(D1778B)       ; pre-check param BC
          CALL 0x0023AD        ; bounds check
          JR NC, dispatch      ; pass -> dispatch
          LD BC,7              ; fail -> error code 7
          CALL 0x0136BF        ; report error
          JP epilogue

dispatch: LD A,(IY+4)          ; dispatch index
          SBC HL,HL            ; HL = 0
          LD L,A               ; HL = index
          CALL 0x002623        ; _seqcase with inline table
          ... (inline table: 6 addresses) ...

epilogue: LD SP,IX; POP IX; RET
```

## The 6 Sub-Handlers

| Index (IY+4) | Handler Addr | CALL Target | Classification | D17795 Value |
|:---:|:---:|:---:|---|:---:|
| 0 | `0x0120F8` | `0x013250` | Link receive with size-capped copy | -- |
| 1 | `0x012100` | `0x013377` | Link receive with buffer free + re-alloc | -- |
| 2 | `0x012108` | `0x01340F` | Link transfer init (mode 4) | 4 |
| 3 | `0x012116` | `0x01340F` | Link transfer init (mode 5) | 5 |
| 4 | `0x012124` | `0x0135CF` | Link data validation (4-way pattern match) | -- |
| 5 | `0x01212C` | `0x0136BF` | Default fallback (error code 1) | 7 (via 0x0136BF) |

### Handler 0 — `0x013250`: Link receive with size-capped copy

- Allocates 7-byte stack frame via `CALL 0x002197`
- Reads link buffer pointer from `D1776D`
- Calls `0x0152D8` with params: destination buffer (IY+5), length=4, source=link buffer
- Compares received size against cap `0x03FF` (1023 bytes)
- Stores capped size to `D1778F`
- Checks allocation pointer `D1776A` via `CALL 0x0021C2`; if null, allocates via `CALL 0x010F8C` with param=1 and stores result to `D1776A`
- RAM reads: `D1776D`, `D1776A`, `D1778F`
- RAM writes: `D1778F`, `D1776A`

### Handler 1 — `0x013377`: Link receive with buffer free + re-alloc

- Allocates 7-byte stack frame
- Reads link buffer pointer from `D1776D`
- Checks `D1776A` via `0x0021C2`; if non-null, frees it via `CALL 0x010FF5`
- Clears `D1776A` to 0
- Calls `0x0152D8` to copy 4 bytes from link buffer
- Stores result size to `D1778F`
- Allocates new buffer via `CALL 0x010F8C` with param=1, stores to `D1776A`
- Calls `0x011017` (post-allocation init)
- Checks `D176D1`; if non-null, sets `D17795 = 2` and checks `D14073` flag
- RAM reads: `D1776D`, `D1776A`, `D176D1`, `D14073`
- RAM writes: `D1776A`, `D1778F`, `D17795`

### Handler 2 — `0x01340F` (mode 4): Link transfer context init

- Sets `D17795 = 4` before calling `0x01340F`
- `0x01340F` allocates a large 22-byte stack frame
- Zeros 7 IX-relative local slots (clearing transfer context)
- Reads link buffer from `D1776D`
- Calls `0x0152D8` to read 4 bytes (transfer header) and IY+0 block
- Stores parsed values to `D176A8` (transfer descriptor), `D1775B` and `D1775E` (transfer endpoints)
- Checks `D176DA` via `0x0021C2`; dispatches to `0x013511` if non-null
- RAM reads: `D1776D`, `D176A8`, `D176DA`
- RAM writes: `D176A8`, `D1775B`, `D1775E`

### Handler 3 — `0x01340F` (mode 5): Link transfer context init (alternate)

- Identical to handler 2 except `D17795 = 5`
- Same subroutine `0x01340F`, same behavior
- The mode byte in `D17795` tells downstream code which protocol variant is active

### Handler 4 — `0x0135CF`: Link data validation (4-way pattern match)

- Allocates 5-byte stack frame
- Reads link buffer from `D1776D`
- Calls `0x0152D8` to read 2 bytes from the link buffer
- Compares received word against 4 magic constants: `0xCCCC`, `0xCCCD`, `0x0CCC`, `0x0CCD`
- Each match branches to the same merge point at `0x01362F`
- These look like TI link protocol handshake/acknowledgment signatures
- RAM reads: `D1776D`

### Handler 5 — `0x0136BF` (param=1): Default/fallback error reporter

- Pushes `BC=1` as error code, calls `0x0136BF`
- `0x0136BF` calls `0x00218A` (stack frame), reads `(IX+6)` into BC
- Calls `0x00276B` (likely notification result formatter), stores result HL to `D176F2`
- Sets `D17795 = 7` (error/complete state)
- Clears `D176DA` and `D176DD` to 0
- Checks `D14073` flag; if set, calls `0x01106A`; otherwise sets `D14079 = 1`
- Same function is used on bounds-check failure (with `BC=7` instead of `BC=1`)
- RAM reads: `D14073`
- RAM writes: `D176F2`, `D17795`, `D176DA`, `D176DD`, `D14079`

## Key RAM Addresses

| Address | Size | Role |
|---------|------|------|
| `D1776D` | 3 | Link/USB buffer pointer (source for all data reads) |
| `D1776A` | 3 | Allocated receive buffer pointer (handler 0 allocs, handler 1 frees/re-allocs) |
| `D17795` | 1 | Link protocol state/mode (4=transfer mode A, 5=transfer mode B, 7=error/done, 2=post-receive) |
| `D1778E` | 1 | Pre-check parameter (read in prelude, compared by 0x0023AD) |
| `D1778B` | 3 | Pre-check parameter BC (bounds reference) |
| `D1778F` | 3 | Received data size (capped at 0x3FF by handler 0) |
| `D176A8` | 3 | Transfer descriptor (written by handler 2/3) |
| `D1775B` | 3 | Transfer endpoint A (written by handler 2/3) |
| `D1775E` | 3 | Transfer endpoint B (written by handler 2/3) |
| `D176DA` | 3 | Transfer context pointer (checked by handler 2/3, cleared by 0x0136BF) |
| `D176DD` | 3 | Secondary transfer pointer (cleared by 0x0136BF) |
| `D176D1` | 3 | Post-receive validation pointer (checked by handler 1) |
| `D176F2` | 3 | Notification result/error storage |
| `D14073` | 1 | USB active flag (guards callback dispatch) |
| `D14079` | 1 | Notification pending flag (set to 1 when USB not active) |

## Key Subroutines

| Address | Role | Called by |
|---------|------|-----------|
| `0x002197` | Stack frame allocator | Handlers 0, 1, 2/3, 4 |
| `0x002623` | `_seqcase` inline dispatch table walker | Prelude |
| `0x00238F` | Parameter conversion (A=5 -> sets up context) | Prelude |
| `0x0023AD` | Bounds check (carry = out of range) | Prelude |
| `0x0021C2` | Null-check / comparison (tests HL against zero) | Handlers 0, 1, 2/3 |
| `0x010F8C` | Memory allocator (param=1) | Handlers 0, 1 |
| `0x010FF5` | Memory free | Handler 1 |
| `0x011017` | Post-allocation init | Handler 1 |
| `0x0152D8` | Buffer copy/read from link | All data handlers (0-4) |
| `0x0136BF` | Error/completion reporter | Handler 5, error path |
| `0x01106A` | USB callback dispatch | Handler 5 (via 0x0136BF) |
| `0x00276B` | Result formatter | Handler 5 (via 0x0136BF) |

## Architecture Summary

The 6-entry dispatch table implements a **USB/link protocol state machine**:

```
IY+4=0: Receive data, cap at 1023 bytes, alloc buffer if needed
IY+4=1: Free old buffer, receive data, re-alloc, validate received content
IY+4=2: Set mode=4, init transfer context from 4-byte header
IY+4=3: Set mode=5, init transfer context from 4-byte header
IY+4=4: Validate received 2-byte word against 4 protocol signatures
IY+4=5: Report error/completion (fallback)
```

The common subroutine `0x0152D8` is the core data-copy primitive used by all data-handling entries. It reads from the link buffer at `D1776D` with a caller-specified length and destination.

The protocol mode byte at `D17795` tracks the current link transaction phase: values 4 and 5 are active transfer modes, value 7 is error/done, and value 2 is post-receive.

## Probe Output

Generated by `node TI-84_Plus_CE/probe-phase409-notification-dispatch.mjs` — see full disassembly in probe stdout.
