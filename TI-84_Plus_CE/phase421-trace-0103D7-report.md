# Phase 421: Trace `0x0103D7` Frame State Serializer

## Function boundaries

- Start: `0x0103D7`
- End: `0x010402`
- Size: `44` bytes (`0x2C`)
- Shape: `CALL 0x00218A` prologue, three output writes, `LD SP,IX; POP IX; RET` epilogue

This is a compact export/helper routine, not an internal control-flow hub.

## What it actually reads

The direct trace corrects the earlier high-level hypothesis.

Read order inside `0x0103D7`:

1. `0x0103DB  LD A,(D177D8)`
2. `0x0103E3  LD A,(D177DB)`
3. `0x0103EB  LD HL,(D177DE)`
4. `0x0103EF  LD BC,(D177CC)`
5. `0x0103F4  SIS ADD HL,BC`

So the function directly reads **four** frame-pacing cells:

- `D177D8`: sub-step
- `D177DB`: stage
- `D177DE`: iteration / offset component
- `D177CC`: base pointer / base component

It does **not** directly read `D177CF`.

Instead, the final output is a **derived 16-bit sum**:

- `low16(D177DE + D177CC)`

That matters because `0x010090` computes the same effective pointer state in the frame-pacing FSM. The serializer is exporting the derived low-16-bit position, not the raw `D177CF` cell.

## Where the snapshot goes

`0x0103D7` does not write a packed IX-indexed struct.

Its IX-frame slots are **three caller-supplied output pointers**:

| IX slot | Use | Write performed |
| --- | --- | --- |
| `IX+6` | 1-byte destination pointer | `*(ptr) = D177D8` |
| `IX+9` | 1-byte destination pointer | `*(ptr) = D177DB` |
| `IX+12` | 2-byte destination pointer | `*(ptr+0) = low byte of low16(D177DE + D177CC)`; `*(ptr+1) = high byte` |

Concrete instruction pattern:

```asm
0x0103DF  DD 27 06     LD HL,(IX+6)
0x0103E2  77           LD (HL),A

0x0103E7  DD 27 09     LD HL,(IX+9)
0x0103EA  77           LD (HL),A

0x0103F8  DD 27 0C     LD HL,(IX+12)
0x0103FB  71           LD (HL),C
0x0103FC  23           INC HL
0x0103FD  70           LD (HL),B
```

So the routine is a **serializer/getter with out-parameters**, not a state copier into internal dispatcher storage.

## Who calls `0x0103D7`

Direct ROM `CALL`/`JP` refs to `0x0103D7`:

- `0x0005A8: JP 0x0103D7`

That address sits in the ROM vector block that starts at `0x000580` (vector 224), so `0x0005A8` is **vector 234**.

The useful caller context is one layer above that vector:

- `0x05F69F: CALL 0x0005A8`

Inside wrapper region `0x05F68F-0x05F6AA`, the ROM does:

1. `CALL 0x000130` frame helper
2. Load three arguments from its own `(IX+6)`, `(IX+9)`, `(IX+12)`
3. Push them as three out-pointer arguments
4. `CALL 0x0005A8`

That proves how the serializer is consumed:

- the consumer is **caller-owned memory buffers**
- the ABI is **three explicit output pointers**
- this looks like an **SDK/export-style display service**, not an internal callback path

Sibling services in the same vector cluster (`0x010403`, `0x01042E`, `0x010466`, `0x0104CC`, `0x0104F7`, `0x010948`) use the same general “wrapper pushes out-pointers -> vector -> getter/service” style, which reinforces the export/API interpretation.

## Connection to `0x010220` display callback dispatcher

The connection to `0x010220` is **indirect**, not a direct producer/consumer edge.

What is true:

- `0x010220` is the display callback dispatcher.
- Its slot-3 path calls `0x010090`.
- `0x010090` is the frame-pacing FSM that owns the same state family (`D177D8`, `D177DB`, `D177DE`, `D177CC`, derived effective pointer state).
- `0x0103D7` exports part of that same frame-pacing state to caller-provided buffers.

What is **not** supported by the direct trace:

- no direct `CALL`/`JP` from `0x010220` to `0x0103D7`
- no internal IX-struct handoff from dispatcher to serializer
- no direct `D177CF` read in `0x0103D7`

Best-fit interpretation:

- `0x0103D7` is a **frame-state getter/serializer** for the display subsystem
- `0x010220` and `0x0103D7` share the same subsystem state, but the serializer is **not** feeding the dispatcher inline
- the vector/wrapper structure makes it look more like a **diagnostic or public API export** than an internal scheduler helper

## Bottom line

`0x0103D7` is not a five-field internal snapshotter. It is a **44-byte export helper** that:

- writes `D177D8` to caller output #1
- writes `D177DB` to caller output #2
- writes `low16(D177DE + D177CC)` to caller output #3

The only direct ROM xref is vector 234 at `0x0005A8`, and the only in-ROM consumer of that vector is wrapper `0x05F68F-0x05F6AA` via `0x05F69F`.
