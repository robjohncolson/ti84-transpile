# Phase 418: Trace `0x007CAD` Callback Armer

## Verdict

`0x007CAD` is not a callback-slot registrar, validator, or state initializer. It is a small LCD control-port helper in the `0x8020` wrapper family:

```c
port_8020 = port_8020 | (arg & 0x3E);
```

It reads one byte argument from the caller stack, ORs bits `1-5` into LCD control port `0x8020`, verifies the port number stayed `0x8020`, and returns. It does not touch `D177BD`, `D177D6`, `D177D7`, or any other absolute RAM location by itself.

That means the callback-slot arming in the `0x010220` dispatcher is the later `SET` into `D177D6`, not the call to `0x007CAD`. The `0x007CAD` call is a hardware-side preparation step that happens just before the software pending bit is raised.

## Direct disassembly

Primary body (`0x007CAD` through first `RET`):

```text
0x007CAD  DD E5               PUSH IX
0x007CAF  DD 21 00 00 00      LD IX,0x000000
0x007CB4  DD 39               ADD IX,SP
0x007CB6  01 20 80 00         LD BC,0x008020
0x007CBA  ED 78               IN A,(C)
0x007CBC  6F                  LD L,A
0x007CBD  DD 7E 06            LD A,(IX+6)
0x007CC0  E6 3E               AND 0x3E
0x007CC2  B5                  OR L
0x007CC3  ED 79               OUT (C),A
0x007CC5  78                  LD A,B
0x007CC6  FE 80               CP 0x80
0x007CC8  28 01               JR Z,0x007CCB
0x007CCA  CF                  RST 0x08
0x007CCB  79                  LD A,C
0x007CCC  FE 20               CP 0x20
0x007CCE  20 FA               JR NZ,0x007CCA
0x007CD0  DD E1               POP IX
0x007CD2  C9                  RET
```

The 160-byte linear window after `0x007CAD` shows the adjacent helper family:

- `0x007CD3`: read full `0x8020`
- `0x007CF1`: raw write to `0x8020`
- `0x007D03`: clear bits `1-5` with `AND 0xC1`
- `0x007D0F` onward: one-bit set/clear helpers for `0x8020`

So `0x007CAD` lives inside a generic hardware-control wrapper block, not inside callback bookkeeping code.

## Parameters

`0x007CAD` takes one effective byte parameter from the first stack argument:

- prologue sets `IX = SP`
- `LD A,(IX+6)` reads the low byte of the caller-pushed `BC` value
- high bytes of the pushed ADL argument are ignored

Observed direct callers found by scanning `ROM.rom` for `CD AD 7C 00`:

| Caller | Recovered arg | Context |
| --- | --- | --- |
| `0x01030A` | `0x02` | slot-1 pending-bit path in `0x010220` |
| `0x010334` | `0x02` | slot-2 pending-bit path in `0x010220` |
| `0x01035E` | `0x02` | slot-3 pending-bit path in `0x010220` |
| `0x010A63` | `0x14` | generic LCD control/config path outside callback dispatch |

The non-callback caller at `0x010A63` is the strongest disproof of the "callback-only armer" hypothesis. `0x007CAD` is a reusable control-register helper.

## RAM access map

Inside `0x007CAD` itself:

- no absolute RAM reads
- no absolute RAM writes
- one stack read: `LD A,(IX+6)`

Caller-side RAM activity is where the callback bookkeeping happens:

### Slot 1 path (`0x0102FD` -> `0x010315`)

```text
CALL 0x007CD3
LD (0xD177D7),A
PUSH 0x000002
CALL 0x007CAD
LD A,(0xD177D6)
SET 1,A
LD (0xD177D6),A
```

### Slot 2 path (`0x010320` -> `0x01033F`)

```text
LD A,(0xD177D7)
JR NZ,skip_refresh
CALL 0x007CD3
LD (0xD177D7),A
PUSH 0x000002
CALL 0x007CAD
skip_refresh:
LD A,(0xD177D6)
SET 2,A
LD (0xD177D6),A
```

### Slot 3 path (`0x01034A` -> `0x010369`)

```text
LD A,(0xD177D7)
JR NZ,skip_refresh
CALL 0x007CD3
LD (0xD177D7),A
PUSH 0x000002
CALL 0x007CAD
skip_refresh:
LD A,(0xD177D6)
SET 3,A
LD (0xD177D6),A
```

So `D177D7` is a caller-managed mirror/cache of the current `0x8020` control byte, while `D177D6` is the actual pending-callback software bitmask. `0x007CAD` updates neither one.

## What `0x007CAD` is really doing

What it definitely does:

1. Reads LCD control register `0x8020`.
2. Masks the caller byte with `0x3E`.
3. ORs those masked bits into the current register value.
4. Writes the merged byte back to `0x8020`.

What it definitely does not do:

- read callback pointers from `D177BD`
- validate a slot number
- inspect `D177D6`
- initialize callback metadata in RAM
- call any other callback-management helper

Because the merge is `OR`, the helper only forces selected control bits high. It never clears bits and never replaces the entire register image. In the callback dispatcher, all three callback-related callers pass `0x02`, so they are simply forcing control-port bit 1 high before raising the corresponding pending bit in `D177D6`.

## Best interpretation

The `CALL 0x007CAD` sequence is a hardware re-arm step, not a software callback-arm step.

The concrete callback-arm flow is:

1. Sample LCD status from `0x8034` (`CALL 0x007DC7`).
2. Optionally snapshot current control byte from `0x8020` into `D177D7` (`CALL 0x007CD3`, `LD (D177D7),A`).
3. Force control-port bit 1 high with `CALL 0x007CAD(0x02)`.
4. Mark the selected callback slot pending by setting bit `1`, `2`, or `3` in `D177D6`.

So the answer to the phase question is:

- `0x007CAD` does **not** prepare callback parameters.
- `0x007CAD` does **not** validate callback slots.
- `0x007CAD` does **not** initialize callback RAM state.
- `0x007CAD` **does** update LCD control port `0x8020` using a masked OR byte argument.

The exact hardware meaning of `0x8020` bit 1 is still unresolved here, but the control-flow evidence is enough to conclude that `0x007CAD` is a generic LCD control helper rather than a callback-struct routine.
