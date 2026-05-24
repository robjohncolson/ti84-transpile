# Phase 433 - Trace Report for `0x00E91E`

## Summary

`0x00E91E` is a compact pre-re-enumeration setup helper. It is only `147` bytes long, has no local branches, and performs two jobs in order:

1. call `0x00DB66(0)` to deassert/drain the TX-side control bit before the re-enumeration sequence starts
2. rewrite the 4-byte packed header at the descriptor root pointed to by `D13FDB`, using the current root pointer stored in `D13FD8`

That makes this function a narrow "quiet the link, then restamp the descriptor companion header" stub, not a full USB state machine.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x00E91E` |
| End | `0x00E9B0` |
| Size | `147` bytes (`0x93`) |
| Exit | `RET` at `0x00E9B0` |
| Local control flow | none - straight-line only |
| Direct port I/O | none |

The previous helper, `0x00E583`, ends at `0x00E91D`, so `0x00E91E` starts on the very next ROM byte.

## Direct Callers

Pattern scan of `CALL 0x00E91E` found four direct call sites:

| Site | Role |
| --- | --- |
| `0x008577` | special `D177B8 == 0x98` branch inside `0x008527` |
| `0x008F8D` | P4 CDC full re-enumerate branch |
| `0x009006` | P5 audio/HID full re-enumerate branch |
| `0x0093B1` | another `D177B8 == 0x98` gated wrapper |

The user-provided context already identified the important ones: P4, P5, and the `0x008527` special `0x98` branch. The extra `0x0093B1` hit shows the helper is reused by one more `0x98`-keyed wrapper.

## Exact Body Walkthrough

### 1. Prologue and drain

`0x00E91E..0x00E92F`

- `LD HL,0xFFFFF4`
- `CALL 0x002197`
- `LD BC,0`
- `PUSH BC`
- `CALL 0x00DB66`
- `POP BC`

This allocates a 12-byte IX frame and immediately calls `0x00DB66(0)`.

From phase 423, `0x00DB66(0)` is the TX-side control-bit drain helper:

- if `0x3010 bit5` is still set, clear it
- call `0x014E3F(0x0032)`
- poll `0x3015 bit7` until it falls idle
- watch `D1440F` and `D177B7` as abort gates
- clear `D1440E` on clean completion

So the first half of `0x00E91E` is explicitly "make sure the TX-side control line is down before we rebuild descriptor state."

### 2. Rewrite companion header byte 0

`0x00E930..0x00E945`

The function loads `HL = 0xD13FDB` and dereferences it with `LD IY,(HL)`, so `IY` becomes the descriptor root pointed to by the companion pointer slot `D13FDB`.

Then it does:

- `A = (IY+0)`
- `AND 0x1F`
- save that result in `B`
- `A = (D13FD8)`
- save that low pointer byte in `C`
- `A = B OR C`
- `LD (IY+0),A`

This preserves the existing low 5 bits of the companion descriptor's byte 0 and re-injects the low-byte contribution from the current root pointer slot `D13FD8`.

The important alignment fact is that these descriptor roots are `0x20`-aligned. That means the low byte of `D13FD8` only contributes bits `5..7`, so a raw `OR` is sufficient:

```text
new_byte0 = (old_byte0 & 0x1F) | (low_byte_of_D13FD8)
```

Semantically that means:

- low 5 bits remain descriptor-local control/type bits
- high 3 bits are refreshed from the active root pointer

## 3. Rewrite companion header bytes +1, +2, +3

The rest of the function repeats the same pattern three times with `0x002330`.

### Byte `+1`

`0x00E948..0x00E969`

- load full 24-bit pointer `HL = (D13FD8)`
- `A = 0x08`
- `CALL 0x002330`
- store result byte to `*(D13FDB) + 1`

This is:

```text
*(D13FDB)+1 = (D13FD8 >> 8) & 0xFF
```

### Byte `+2`

`0x00E96A..0x00E98A`

- reload `HL = (D13FD8)`
- `A = 0x10`
- `CALL 0x002330`
- store result byte to `*(D13FDB) + 2`

This is:

```text
*(D13FDB)+2 = (D13FD8 >> 16) & 0xFF
```

### Byte `+3`

`0x00E98B..0x00E9AB`

- reload `HL = (D13FD8)`
- `A = 0x18`
- `CALL 0x002330`
- store result byte to `*(D13FDB) + 3`

This is:

```text
*(D13FDB)+3 = (D13FD8 >> 24) & 0xFF
```

Because the CE root pointers are 24-bit values, that last byte is effectively `0`.

## Direct CALL Targets

| Target | Count | Role in `0x00E91E` |
| --- | ---: | --- |
| `0x002197` | 1 | `__frameset` prologue |
| `0x00DB66` | 1 | TX-side control-bit drain / deassert helper (`arg = 0`) |
| `0x002330` | 3 | 24-bit right-shift helper used to emit pointer bytes for `+1`, `+2`, `+3` |

## RAM Variables Accessed

### Direct absolute `D1xxxx` reads

| Address | Access | Meaning |
| --- | --- | --- |
| `D13FD8` | read byte at `0x00E93C` | low byte of the primary descriptor root pointer slot |
| `D13FD8` | read 24-bit at `0x00E948`, `0x00E96A`, `0x00E98B` | full primary descriptor root pointer |
| `D13FDB` | loaded as pointer-slot address and dereferenced 5 times | companion descriptor root pointer slot |

The `D13FDB` dereference sites are:

- `0x00E934`
- `0x00E943`
- `0x00E963`
- `0x00E985`
- `0x00E9A6`

### Indirect writes through `*(D13FDB)`

| Target | Site | Meaning |
| --- | --- | --- |
| `*(D13FDB)+0` | `0x00E945` | packed header byte 0 |
| `*(D13FDB)+1` | `0x00E969` | `(D13FD8 >> 8) & 0xFF` |
| `*(D13FDB)+2` | `0x00E98A` | `(D13FD8 >> 16) & 0xFF` |
| `*(D13FDB)+3` | `0x00E9AB` | `(D13FD8 >> 24) & 0xFF`, effectively `0` |

### Indirect helper RAM touched by `0x00DB66(0)`

This function itself does not reference these addresses directly, but its first call does:

| Address | Effect |
| --- | --- |
| `D1440E` | cleared on clean completion |
| `D1440F` | polled as an abort/status gate |
| `D177B7` | polled as the `0x55` sentinel gate |

## Port I/O

### Direct in `0x00E91E`

None.

### Indirect via `0x00DB66(0)`

| Port | Direction | Bits | Meaning |
| --- | --- | --- | --- |
| `0x3010` | IN/OUT | `bit5` | clear TX-side control bit if still asserted |
| `0x3015` | IN | `bit7` | wait until TX-side status falls idle |

So `0x00E91E` is "pre-enumerate" partly because it first forces a hardware-side idle condition before it touches the descriptor companion header.

## What State It Prepares Before Re-enumeration

The strongest interpretation is:

1. **Drain/deassert the TX-side control bit** so the link hardware is in a quiet state.
2. **Refresh the companion descriptor root header** at `*(D13FDB)` so bytes `+0..+3` once again encode the current primary root pointer from `D13FD8`.

That matters because the re-enumeration callers immediately continue with:

- `0x00D9EE(1)`
- `0x00DA8C(0)`
- then one or more `0x00883C(...)` descriptor-init wrapper calls

So `0x00E91E` is the narrow setup stage that makes the hardware/control line and the root-A companion descriptor agree before the larger re-enumeration sequence runs.

### Practical interpretation

This function is not selecting modes or dispatching on connection state itself. The callers already decided that. Its job is to prepare a specific descriptor/header pair and clear a specific control-line condition so the next stages can safely rebuild or resubmit descriptors to the host.

## Relationship to `0x00E583`

`0x00E583` ends at `0x00E91D`; `0x00E91E` starts on the next byte.

That adjacency is useful because the two functions are related in style even though they work on different structures:

- `0x00E583` is a large sibling-list walker and cleanup engine.
- `0x00E91E` is a small straight-line refresh helper.

What they share:

- both use `0x002330`
- both repack 24-bit pointers into 4-byte header fields
- both live in the same descriptor/link/USB cluster

What differs:

- `0x00E583` patches live sibling-chain nodes (`D14005`, `D14011`, `D1400B`, `D1400E`) while walking and freeing them
- `0x00E91E` patches the descriptor companion root `*(D13FDB)` from the base pointer slot `D13FD8`

So `0x00E91E` is best understood as a compact sibling of the bigger `0x00E583` pointer-packing logic, not as a continuation of the walker itself.

## Strong Inference: re-enumeration subset of the earlier pool initializer

Phase 426 already showed that the boot-time descriptor-pool initializer (`0x00E2EB..0x00E4E7`) performs a broader header fixup over the `D13FD8` / `D13FDB` pair. `0x00E91E` looks like a runtime subset of that earlier work:

- it only revisits the A-side pair
- it only rewrites the companion root bytes `+0..+3`
- it precedes USB re-enumeration callers instead of initial boot

That is an inference from the shared byte-packing pattern and shared root addresses, but it fits the ROM evidence well.

## Bottom Line

`0x00E91E` is a `147`-byte pre-re-enumeration descriptor refresh stub:

- `0x00DB66(0)` first drains/deasserts the TX-side control line
- then the function rewrites `*(D13FDB)+0..+3` so the companion descriptor root again encodes the current `D13FD8` base pointer

That is exactly the kind of small, state-conditioning work expected immediately before the P4/P5 and `0x008527` re-enumeration branches continue into `0x00D9EE`, `0x00DA8C`, and the descriptor-init wrapper family.

## Probe

Companion probe:

- `TI-84_Plus_CE/probe-phase433-trace-00E91E.mjs`

Run:

```bash
node TI-84_Plus_CE/probe-phase433-trace-00E91E.mjs
```
