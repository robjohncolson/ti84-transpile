# Phase 433 - Trace of `0x01322D`

## Summary

`0x01322D` is a **33-byte null-checked indirect callback dispatcher** for the RAM slot `0xD14026`.
It does not decode or branch on the caller's `0x0800` argument. Instead it forwards one 24-bit stack argument unchanged into the callback, then cleans that argument off the stack after the callback returns.

For the `0x008527` USB follow-up helper, the pushed `0x0800` is therefore best understood as an **event / reason bitmask** passed through the dispatcher to whatever handler is currently installed in `D14026`.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x01322D` |
| End | `0x01324D` |
| Size | `33` bytes (`0x21`) |
| Direct slot used | `0xD14026` |
| Indirect trampoline | `0x002288 = JP (IY)` |

## Raw Disassembly

```asm
0x01322D  cd 8a 21 00       call 0x00218A     ; __frameset0 body
0x013231  2a 26 40 d1       ld   hl,(0xD14026)
0x013235  cd c2 21 00       call 0x0021C2     ; _icmpzero body
0x013239  28 0e             jr   z,0x013249
0x01323B  dd 07 06          ld   bc,(ix+6)
0x01323E  c5                push bc
0x01323F  fd 2a 26 40 d1    ld   iy,(0xD14026)
0x013244  cd 88 22 00       call 0x002288     ; _indcall body
0x013248  c1                pop  bc
0x013249  dd f9             ld   sp,ix
0x01324B  dd e1             pop  ix
0x01324D  c9                ret
```

## How The `0x0800` Argument Is Used

`0x01322D` accesses its single caller-supplied argument through the stack frame:

1. `CALL 0x00218A` installs an `IX` frame.
2. `LD BC,(IX+6)` fetches one 24-bit argument from the caller.
3. `PUSH BC` forwards that same 24-bit value to the callback.
4. `POP BC` after the callback returns discards the forwarded argument.

That means the wrapper treats `0x0800` as a **transparent payload**. It does not mask, compare, or reinterpret bit 11 locally.

Because every recovered caller pushes a single power-of-two constant, the interface looks like a **one-bit event flag API**:

- `0x0002`
- `0x0004`
- `0x0008`
- `0x0010`
- `0x0020`
- `0x0040`
- `0x0080`
- `0x0100`
- `0x0200`
- `0x0800`
- `0x4000`

The USB helper at `0x0085BE` and a sibling caller at `0x013107` both pass `0x0800`.

## How `D14026` Is Used As A Callback Slot

The slot is read twice:

1. `LD HL,(0xD14026)` loads the 24-bit function pointer for a null check.
2. `CALL 0x0021C2` compares that pointer against zero.
3. `JR Z,0x013249` skips dispatch entirely if the slot is null.
4. `LD IY,(0xD14026)` reloads the same 24-bit pointer into `IY`.
5. `CALL 0x002288` jumps through the shared trampoline.

The trampoline is only:

```asm
0x002288  fd e9             jp (iy)
```

So the real mechanism is:

- **load 24-bit function pointer from RAM**
- **null-check**
- **push one 24-bit argument**
- **indirect jump via `JP (IY)`**

This is not a table lookup and not a direct `CALL nn`. It is a **null-checked function-pointer dispatch**.

## Port I/O

`0x01322D` performs **no direct port I/O**.
It does not touch any `0x30xx` USB controller ports itself. Any USB-port interaction happens in its callers or in the installed callback bodies.

## Exact Callers Found

ROM-wide exact byte scan for `CD 2D 32 01` found **13 direct callers**:

| Call Site | Forwarded Flag |
| --- | --- |
| `0x0085BE` | `0x0800` |
| `0x0095B9` | `0x0002` |
| `0x0099AC` | `0x0020` |
| `0x009A05` | `0x0010` |
| `0x009A82` | `0x4000` |
| `0x009AA4` | `0x0200` |
| `0x00A58D` | `0x0004` |
| `0x00D9D5` | `0x0004` |
| `0x00D9E1` | `0x0100` |
| `0x00DA71` | `0x0008` |
| `0x012D73` | `0x0040` |
| `0x012E43` | `0x0080` |
| `0x013107` | `0x0800` |

The `0x008527` caller is therefore one member of a broader event-notification family, not a special one-off path.

## All `D14026` References And Writers

Exact full-address scan for `26 40 D1` found **7 real instruction sites**:

- Reads: `0x013231`, `0x041E99`
- Dispatch loads into `IY`: `0x01323F`, `0x041EA7`
- Writes: `0x00B75E`, `0x02BA66`, `0x048CFC`

No `LD (0xD14026),A` or `LD (0xD14026),HL` stores were found. All static stores are:

| Store Site | Instruction | Stored Value | Meaning |
| --- | --- | --- | --- |
| `0x00B75E` | `LD (0xD14026),BC` | `0x00FBD1` | direct callback body |
| `0x02BA66` | `LD (0xD14026),BC` | `0x00063C` | vector entry 49 |
| `0x048CFC` | `LD (0xD14026),BC` | `0x02C0B8` | alternate direct callback body |

## What Callbacks Could `D14026` Point To?

Static ROM writes show three concrete installed values:

1. `0x00063C`
   - This is not a full body by itself.
   - Its first instruction is `JP 0x00FBD1`.
   - Effective target: `0x00FBD1`.

2. `0x00FBD1`
   - A direct callback body.
   - Starts with the same frame-and-flag handling style as the dispatcher family.

3. `0x02C0B8`
   - Another direct callback body.
   - Structurally parallel to `0x00FBD1`.

So the effective installed callback bodies are:

- `0x00FBD1`
- `0x02C0B8`

with `0x00063C` acting as a public vector alias that immediately forwards to `0x00FBD1`.

## Dispatch Mechanism

The dispatch sequence at `0x01322D` is:

1. Build an `IX` frame.
2. Read `D14026`.
3. Skip if null.
4. Read caller argument from `(IX+6)`.
5. Push that argument.
6. Reload `D14026` into `IY`.
7. `CALL 0x002288`, whose body is `JP (IY)`.

Best-fit label: **null-checked event callback dispatcher for the `D14026` function-pointer slot**.

## Related Note

`0x041E95` is a near-duplicate wrapper for the same slot. It uses helper-vector entry points (`0x000130`, `0x000138`, `0x00015C`) instead of the direct helper bodies (`0x00218A`, `0x0021C2`, `0x002288`), but the callback-slot semantics are the same.
