# Phase 427 - 0x00285F Zero-Fill Helper Report

Generated from static ROM disassembly and caller scanning for `probe-phase427-trace-00285F.mjs`.

## Bottom Line

`0x00285F` is **not** the generic three-argument `memset(dest, c, n)` routine. It is the adjacent **two-argument zero-fill helper**:

`bzero(dest, count)` or equivalently `memset(dest, 0, count)`.

The generic `memset` sibling is the immediately preceding function at `0x00283A`, with its own trampoline at `0x0000AC`.

## Function Boundaries And Byte Count

- Previous function ends with `RET` at `0x00285E`.
- `0x00285F` is therefore a **true function entry**, not a mid-function label.
- Function body: `0x00285F..0x002889`
- Size: `0x2B` bytes = **43 bytes**
- Next function begins at `0x00288A`

## Calling Convention

This helper uses the standard ZDS/eZ80 stack-frame style:

```asm
00285F  PUSH IY
002861  LD IY,0x000003
002866  ADD IY,SP
```

After that frame setup, the arguments are read from the stack:

- `(IY+3)` = destination pointer, 24-bit
- `(IY+6)` = byte count, 24-bit
- There is **no caller-supplied fill-byte argument**

The fill value is hardcoded inside the helper:

```asm
002876  XOR A
002877  LD (DE),A
```

So the actual signature is:

```c
void bzero(void *dest, size_t count);
```

or equivalently:

```c
void *memset_zero(void *dest, size_t count);
```

It is **not** `void *memset(void *dest, int c, size_t n)`.

## Exact Instruction Sequence

```asm
00285F  FD E5             PUSH IY
002861  FD 21 03 00 00    LD IY,0x000003
002866  FD 39             ADD IY,SP
002868  FD 27 06          LD HL,(IY+0x06)    ; count
00286B  01 00 00 00       LD BC,0x000000
00286F  ED 42             SBC HL,BC          ; count == 0 ?
002871  28 14             JR Z,0x002887
002873  FD 17 03          LD DE,(IY+0x03)    ; dest
002876  AF                XOR A              ; fill = 0
002877  12                LD (DE),A          ; seed first byte
002878  2B                DEC HL
002879  ED 42             SBC HL,BC          ; original count == 1 ?
00287B  28 0A             JR Z,0x002887
00287D  FD 07 06          LD BC,(IY+0x06)    ; reload count
002880  0B                DEC BC             ; count - 1
002881  13                INC DE             ; dest + 1
002882  FD 27 03          LD HL,(IY+0x03)    ; source = dest
002885  ED B0             LDIR               ; copy zero byte across tail
002887  FD E1             POP IY
002889  C9                RET
```

## LDIR Vs Loop

This is neither a plain byte loop nor a generic `LDIR` from a constant buffer.

The helper works like this:

1. If `count == 0`, return.
2. Write one zero byte to `dest[0]`.
3. If `count == 1`, return.
4. Set `HL = dest`, `DE = dest + 1`, `BC = count - 1`.
5. `LDIR` copies the seeded zero byte from `dest[0]` across the remaining `count - 1` bytes.

So the implementation is a **seed-one-byte then `LDIR` self-copy** zero-fill.

## Why This Is `_bzero`, Not Generic `_memset`

The preceding function at `0x00283A` is the generic fill helper:

- `0x0000AC -> JP 0x00283A`
- `0x002843  LD DE,(IY+3)` = dest
- `0x002846  LD HL,(IY+9)` = count
- `0x002849  LD A,(IY+6)` = fill byte

That is the real `memset(dest, c, n)` implementation.

By contrast, `0x00285F`:

- takes only **two** arguments
- never reads a fill byte from stack
- forces the byte value to zero with `XOR A`

So `0x00285F` is the dedicated zero-fill sibling, best described as `_bzero`-style runtime support.

## Parent Call Site In 0x00E2EB

The pool bootstrap function starts at `0x00E2EB`. Its call into `0x00285F` is:

```asm
00E2F3  LD BC,0x000780
00E2F7  PUSH BC
00E2F8  LD BC,(0xD14017)
00E2FD  PUSH BC
00E2FE  CALL 0x00285F
```

So this call passes:

- `count = 0x000780` = **1920 bytes**
- `dest = *(0xD14017)`
- `fill = 0x00` implicitly, inside `0x00285F`

From the call site alone, the zero-fill target is the pointer stored in `D14017`.

## Resolved Destination Address For The 1920-Byte Clear

Earlier in the layout helper, `D14017` is seeded at `0x00CB14` from:

- candidate root `0xD1443F`
- masked with `0xFFFFE0`

That resolves to:

```text
D14017 = 0xD1443F & 0xFFFFE0 = 0xD14420
```

So the `0x00E2FE` call zero-fills:

- start: `0xD14420`
- length: `0x780`
- end: `0xD14B9F`

That matches the descriptor-pool interpretation: **60 slabs x 32 bytes = 1920 bytes**.

## Other Callers In The ROM

Static caller inventory:

- **7 direct `CALL 0x00285F` sites**
- **28 `CALL 0x0000B0` sites** through the trampoline
- `0x0000B0` itself is `JP 0x00285F`

So there are **35 static call sites** that reach the helper, or **34 other callers** besides the `0x00E2FE` pool-bootstrap call.

Representative examples:

| Site | Form | Arguments | Meaning |
| --- | --- | --- | --- |
| `0x00CCA0` | direct | `dest = 0xD13FED`, `count = 0x0D` | clear the small live descriptor-table region |
| `0x0390D3` | via `0x0000B0` | `dest = 0xD13FED`, `count = 0x0D` | mirrored copy of the same table clear |
| `0x00B6E8` | direct | `dest = 0xD13FD8`, `count = 0x448` | clear the larger descriptor/state block |
| `0x048B65` | via `0x0000B0` | `dest = 0xD13FD8`, `count = 0x448` | mirrored copy of the same clear |
| `0x00B8CE` | direct | `dest = 0xD176A8`, `count = 0x62` | zero a 0x62-byte runtime structure |
| `0x070743` | via `0x0000B0` | `dest = *(IX+0x0C)`, `count = 0x09` | zero a small caller-owned block |
| `0x072A6A` | via `0x0000B0` | `dest = *(IX+0x0C)`, `count = 0x0C` | zero another small caller-owned block |

The caller pattern is consistent across the ROM: two pushes only, `dest` plus `count`, with no fill-byte push.

## Final Verdict

`0x00285F` is a **true standalone function** at `0x00285F..0x002889`, not a mid-function entry.

Its calling convention is:

- `(IY+3)` = destination
- `(IY+6)` = count
- fill byte fixed to zero

Its implementation is:

- seed one zero byte
- replicate it with `LDIR`

So the correct identification is:

- **`_bzero`-style helper** or
- **`memset(dest, 0, count)` specialized runtime helper**

For the descriptor-pool bootstrap at `0x00E2EB`, it zero-fills:

- **`0xD14420..0xD14B9F`**
- **1920 bytes**
- **fill value `0x00`**
