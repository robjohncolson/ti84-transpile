# Phase 425: Trace Report for `0x00CB7B`

## Summary

`0x00CB7B` is **not** the routine that writes the sibling-walker pointer bytes at node offsets `+0..+2`. That work happens elsewhere. This helper fills the **tail half** of an existing IY-relative `0x20`-byte descriptor node/subrecord:

- `IY+0x0A` from stack arg1 low byte
- `IY+0x0B` from a shifted byte derived from the arg0 root record
- `IY+0x0C..+0x0E` from a nested `+6` child record
- `IY+0x0F..+0x1F` mostly zero-filled

So the descriptor-node format seen by `0x00E583` is only **partially** set here. The `byte0 flags / bytes1-2 address` triplet is not written by `0x00CB7B`.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x00CB7B` |
| End | `0x00CBE8` |
| Size | `110` bytes (`0x6E`) |
| Next function | `0x00CBE9` |
| Port I/O | none |
| Absolute D1xxxx RAM refs | none |
| Direct callers | `0x00CFF2`, `0x00D00E`, `0x00D0E5`, `0x00D162`, `0x00D1A8`, `0x00EBD7` |

## Stack / Calling Convention

`0x00CB7B` begins with:

```text
0x00CB7B  CALL 0x00218A
```

That is the frameless stack helper, not the local-frame allocator used by `0x002197`. After it returns:

- `arg0` is at `IX+6`
- `arg1` is at `IX+9`
- `arg2` is at `IX+12`

Important detail:

- The **destination is implicit in `IY`**. Every visible store in this routine is IY-relative.
- `arg2` exists at all six call sites but is **not read** by this callee.

### Effective argument use

| Input | Use inside `0x00CB7B` |
| --- | --- |
| `arg0 @ IX+6` | 24-bit root/source pointer. The code reads `root[+9..+11]`, then follows `root[+6]` once and reads that nested record's `+12..+14` field. |
| `arg1 @ IX+9` | Only the **low byte** is used; copied directly to `IY+0x0A`. |
| `arg2 @ IX+12` | No visible use. |
| `IY` | Implicit destination node/subrecord base. |

## Exact Writes To The Descriptor Node

| Destination | Source / Operation | Notes |
| --- | --- | --- |
| `IY+0x0A` | `*(IX+9)` low byte | direct byte copy from stack arg1 |
| `IY+0x0B` | `(((uint16)root[+9..+10]) >> 8) \| 0x80` | implemented via `0x00276B` then `0x00230B` with shift count `8`, followed by `SET 7,A` |
| `IY+0x0C..+0x0E` | `*( *(root+6) + 12 )` 24-bit copy | copied with `LD (HL),BC` after one `+6` pointer follow |
| `IY+0x0F` | `0` | explicit zero |
| `IY+0x10..+0x12` | `0` | 24-bit zero |
| `IY+0x13` | `0` | explicit zero |
| `IY+0x14..+0x16` | `0` | 24-bit zero |
| `IY+0x17` | `0` | explicit zero |
| `IY+0x18..+0x1A` | `0` | 24-bit zero |
| `IY+0x1B` | `0` | explicit zero |
| `IY+0x1C..+0x1E` | `0` | 24-bit zero |
| `IY+0x1F` | `0` | explicit zero |

### What it does **not** write

- `IY+0x00..+0x07`: untouched here
- `IY+0x08..+0x09`: untouched here
- the sibling-walker pointer/header triplet at `+0..+2`: untouched here

That means the `0x00E583`-visible node header is produced by sibling/link helpers outside `0x00CB7B`.

## Pointer-Chain Behavior

The repeated `DD 31 06` loads are real 24-bit memory loads:

```text
LD IX,(IX+6)
```

Observed chain:

1. `root = arg0`
2. read `root[+9..+11]`
3. `firstNested = *(root+6)`
4. read `firstNested[+12..+14]`
5. follow the `+6` link **four more times**

Those later four reloaded pointers are **not dereferenced again** before return. So the visible dataflow stops after the first nested read. The remaining reloads look like compiler-emitted chain traversals whose values are dead in this routine.

## CALL Targets

| Target | Label | Role in `0x00CB7B` |
| --- | --- | --- |
| `0x00218A` | frameless stack helper | makes stack args addressable at `IX+6/9/12` |
| `0x00276B` | zero-extend BC -> HL helper | converts the root `+9` word into a 24-bit `HL` value |
| `0x00230B` | 24-bit arithmetic right-shift helper | extracts the shifted high byte used for `IY+0x0B` |

## RAM Variables Read / Written

### Absolute RAM

None.

`0x00CB7B` contains **no** direct `D1xxxx` loads or stores.

### Indirect structure traffic

Reads:

- stack arg1 low byte at `IX+9`
- `root[+9..+11]` where `root = arg0`
- `firstNested[+12..+14]` where `firstNested = *(root+6)`

Writes:

- `IY+0x0A..+0x1F` as listed above

## Port I/O

None.

There are no `IN` or `OUT` instructions in `0x00CB7B`.

## Direct Call Sites

The six direct `CALL 0x00CB7B` references split as follows:

| Site | Enclosing function | Destination already in `IY` | `arg0 @ IX+6` |
| --- | --- | --- | --- |
| `0x00CFF2` | `0x00CD7B` | `*(D13FFC)` | `*(D13FFF)` |
| `0x00D00E` | `0x00CD7B` | `*(D13FFC)` | `*(D14002)` |
| `0x00D0E5` | `0x00CD7B` | `*(D14002)` | `*(D13FFF)` |
| `0x00D162` | `0x00CD7B` | `*(D13FFF)` | `*(D14002)` |
| `0x00D1A8` | `0x00CD7B` | `*(D13FFF)` | `*(D14002)` |
| `0x00EBD7` | `0x00EB31` | inherited from caller-B state | local allocated selector-0 slab `(IX-3)` |

The middle stack argument varies by site, but only its **low byte** matters to `0x00CB7B`. The third stack argument is pushed by all callers and ignored by this callee.

## Bottom Line

- `0x00CB7B` is a **tail-field initializer** for an IY-relative descriptor node/subrecord.
- It is **not** the writer for the sibling-walker header at node bytes `+0..+2`.
- It uses:
  - one explicit stack byte (`arg1.low`)
  - one root-record word (`root[+9..+10]`)
  - one nested-record 24-bit field (`(*(root+6))[+12..+14]`)
- Then it clears the remainder of the destination tail slots through `IY+0x1F`.

## Probe

Companion probe:

- `TI-84_Plus_CE/probe-phase425-trace-00CB7B.mjs`

Run:

```bash
node TI-84_Plus_CE/probe-phase425-trace-00CB7B.mjs
```
