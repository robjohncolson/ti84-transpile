# Phase 25X - ParseInp ErrMemory path disassembly

## Scope

- ROM: `TI-84_Plus_CE/ROM.rom`
- Decoder: `TI-84_Plus_CE/ez80-decoder.js`
- Include file used for RAM cross-reference: `TI-84_Plus_CE/references/ti84pceg.inc`
- Target PC trace:

```text
0x08226b -> 0x0820b5 -> 0x0820c3 -> 0x08226f -> 0x082273 -> 0x0822a2
-> 0x082bb9 -> 0x082bba -> 0x061d3e (ErrMemory) -> 0x061db2 -> FAKE_RET
```

- Immediate caller on this ParseInp path:

```text
0x09beed: c5                 push bc
0x09beee: 21 03 00 00        ld hl, 0x000003
0x09bef2: cd b5 2b 08        call 0x082bb5
```

That caller requests **3 bytes** from the helper rooted at `0x082BB5`.

## RAM cross-reference

These are the RAM cells touched by the relevant code, resolved against `ti84pceg.inc`:

| Address | Symbol | Notes |
| --- | --- | --- |
| `0xD0258D` | `FPS` | parser/FPS pointer |
| `0xD02590` | `OPBase` | object/operand base pointer |
| `0xD02593` | `OPS` | operand-stack / parser pointer used by `0x0820B5` |
| `0xD0259A` | `pTemp` | fallback temp-pointer anchor |
| `0xD02AD7` | `scrapMem` | 3-byte scratch cell used by `0x04C92E` |
| `0xD005F8` | `OP1` | base of OP1 |
| `0xD005F9` | `OP1+1` | derived from `OP1`; used by adjacent helper `0x0822A4` |

## Disassembly

### 0x0820B5..0x0820D0

```text
0x0820b5: 2a 93 25 d0        ld hl, (0xd02593) ; OPS
0x0820b9: ed 4b 8d 25 d0     ld bc, (0xd0258d) ; FPS
0x0820be: b7                 or a
0x0820bf: ed 42              sbc hl, bc
0x0820c1: 30 05              jr nc, 0x0820c8
0x0820c3: 21 00 00 00        ld hl, 0x000000
0x0820c7: c9                 ret
0x0820c8: 23                 inc hl
0x0820c9: c9                 ret
0x0820ca: e5                 push hl
0x0820cb: 18 05              jr 0x0820d2
0x0820cd: e5                 push hl
0x0820ce: 21 f9 05 d0        ld hl, 0xd005f9 ; OP1+1
```

**What it does**

- `0x0820B5` computes `HL = OPS - FPS`.
- If that subtraction borrows, `jr nc` is not taken and `0x0820C3` returns `HL = 0`.
- If it does not borrow, `0x0820C8` increments the difference and returns `HL = OPS - FPS + 1`.

So the helper returns:

```text
HL = max(OPS - FPS + 1, 0)
```

On the failing trace, execution goes to `0x0820C3`, so the exact failed condition is:

```text
OPS < FPS
```

### 0x08226B..0x082280

```text
0x08226b: cd b5 20 08        call 0x0820b5
0x08226f: b7                 or a
0x082270: ed 52              sbc hl, de
0x082272: d0                 ret nc
0x082273: d5                 push de
0x082274: 2a 9a 25 d0        ld hl, (0xd0259a) ; pTemp
0x082278: ed 4b 90 25 d0     ld bc, (0xd02590) ; OPBase
0x08227d: 03                 inc bc
0x08227e: 11 00 00 00        ld de, 0x000000
```

The requested window stops just before the actual fallback branch. The next three instructions are the ones that send control to `0x0822A2`:

```text
0x082282: af                 xor a
0x082283: ed 42              sbc hl, bc
0x082285: 38 1b              jr c, 0x0822a2
```

**What it does**

`0x082266` arrives here after `ex de, hl` and `call 0x04C92E`, so `DE` holds the requested size. In this trace, the caller passed `DE = 3` after the swap.

There are **two checks** in this block:

1. Primary space check:

```text
0x08226f..0x082272:
  HL = max(OPS - FPS + 1, 0)
  HL = HL - requested_size
  ret nc            ; success if enough bytes exist in the primary span
```

The failing trace does **not** return at `0x082272`, so the exact failed condition is:

```text
max(OPS - FPS + 1, 0) < requested_size
```

For this ParseInp call, `requested_size = 3`, so success would require:

```text
OPS - FPS + 1 >= 3
```

2. Fallback space check:

```text
0x082274..0x082285:
  HL = pTemp
  BC = OPBase + 1
  HL = pTemp - (OPBase + 1)
  jr c, 0x0822a2    ; failure if pTemp is at or below OPBase
```

The trace goes directly from `0x082273` to `0x0822A2`, so the exact failed condition is:

```text
pTemp < OPBase + 1
```

or equivalently:

```text
pTemp <= OPBase
```

### 0x0822A2..0x0822B0

```text
0x0822a2: d1                 pop de
0x0822a3: c9                 ret
0x0822a4: c6 07              add 0x07
0x0822a6: 01 00 00 00        ld bc, 0x000000
0x0822aa: 4f                 ld c, a
0x0822ab: cd 80 00 08        call 0x080080
0x0822af: c8                 ret z
0x0822b0: 3a f9 05 d0        ld a, (0xd005f9) ; OP1+1
```

**What it does on the actual failure trace**

- Only `0x0822A2` and `0x0822A3` execute on the recorded ErrMemory path.
- That pair is pure cleanup: `pop de; ret`.
- It does **not** set any new flags. The carry flag from the failed `sbc hl, bc` at `0x082283` is preserved.

`0x0822A4..0x0822B0` is the start of a **different nearby helper**. It is used by the sibling wrapper at `0x082BBE`, not by the `0x082BB5` path in this trace.

That adjacent helper does name/length normalization:

- `C = A + 7`
- call `0x080080`
- if that selector returns Z, return immediately
- otherwise inspect `OP1+1`

So `OP1+1` is **not** the failing condition for this ErrMemory trace.

### 0x082BB5..0x082BC5

```text
0x082bb5: cd 66 22 08        call 0x082266 ; allocator fallback walker
0x082bb9: d0                 ret nc
0x082bba: c3 3e 1d 06        jp 0x061d3e   ; ErrMemory
0x082bbe: cd ba 22 08        call 0x0822ba
0x082bc2: 18 f5              jr 0x082bb9
0x082bc4: 2a 8d 25 d0        ld hl, (0xd0258d) ; FPS
```

**What it does**

- `0x082BB5` is a complete entry point of its own.
- `0x082BB9` is exactly **one byte**: `ret nc`.
- `0x082BBA` does **no setup at all**. It is a plain absolute jump to `ErrMemory`.
- `0x082BBE` is a separate sibling wrapper that also funnels into `0x082BB9`, but it is **not** the path taken in this trace.

So the last gate is simply:

```text
carry clear -> return to caller
carry set   -> jump to ErrMemory
```

## Annotated flow

1. `0x09BEEE` loads `HL = 3` and `0x09BEF2` calls `0x082BB5`.
2. `0x082BB5` calls `0x082266`.
3. `0x082266` swaps the size into `DE`, zero-extends it through `0x04C92E`, then calls `0x0820B5`.
4. `0x0820B5` checks the primary free span between `OPS` and `FPS`.
   On the failing trace, `OPS < FPS`, so `0x0820C3` returns `HL = 0`.
5. Back at `0x08226F`, the code subtracts `DE = 3` from `HL = 0`.
   That borrows, so `ret nc` at `0x082272` is **not** taken.
6. The code then falls back to `pTemp` vs `OPBase + 1`.
   `0x082283` computes `pTemp - (OPBase + 1)`.
   That also borrows, so `jr c, 0x0822A2` is taken.
7. `0x0822A2` just restores `DE` and returns with carry still set.
8. `0x082BB9` sees carry set, so its `ret nc` is **not** taken.
9. `0x082BBA` immediately jumps to `0x061D3E (ErrMemory)`.

## Exact root cause

This is **not a FindSym failure** and it is **not a NULL-pointer check**.

It is a two-stage allocator / workspace-space failure:

1. **Primary span exhausted**

```text
max(OPS - FPS + 1, 0) < requested_size
```

For this trace, `requested_size = 3`, so this means:

```text
OPS - FPS + 1 < 3
```

2. **Fallback span exhausted**

```text
pTemp < OPBase + 1
```

The previously observed Phase 25W seeds make both failures inevitable:

- `OPS = 0xD00800`
- `FPS = 0xD00A00` or `0xD1A881`
- `pTemp = 0xD3FFFF`
- `OPBase = 0xD3FFFF`

Those values imply:

```text
OPS < FPS
pTemp = OPBase
```

So the code first gets `HL = 0` from `0x0820B5`, then immediately fails the fallback test because:

```text
pTemp - (OPBase + 1) = -1
```

That carry survives all the way to `0x082BB9`, which is why `ErrMemory` is thrown.

## Recommendation

To avoid this exact `ErrMemory` site, make **either** of these allocator-space checks succeed before `0x082BB5` is called:

1. Primary success path:

```text
OPS - FPS + 1 >= requested_size
```

For the observed ParseInp call (`requested_size = 3`):

```text
OPS >= FPS + 2
```

2. Fallback success path:

```text
pTemp >= OPBase + 1
```

Practical consequences for the failing probe setup:

- Do **not** seed `pTemp` equal to `OPBase`; that guarantees the fallback branch to `0x0822A2`.
- Give the `OPS/FPS` workspace a real positive gap before ParseInp reaches `0x09BEF2`.
- If `OPS` must remain at `0xD00800`, then `FPS` must be at or below `0xD007FE` for this 3-byte request to pass the primary check.

The last bullet is a direct consequence of the code. Whether `OPS = 0xD00800` is itself the right parser contract is an inference beyond this disassembly, but **for this specific helper** the required arithmetic is exact: the call must see enough `OPS/FPS` headroom, or `pTemp` must sit above `OPBase`, or it will always land in `ErrMemory`.
