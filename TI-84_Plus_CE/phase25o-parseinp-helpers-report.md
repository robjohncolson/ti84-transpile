# Phase 25O - ParseInp helper disassembly

## Scope

- ParseInp entry under investigation: `0x099914`.
- Helper blocks: `0x099b81`, `0x099b18`, `0x09beed`.
- Failure-loop windows from phase 25K: `0x082be2`, `0x084711`, `0x084716`, `0x08471b`.
- Decoder note: the local `decodeInstruction` implementation expects mode `'adl'`, so this probe uses that instead of a boolean ADL flag.

## ParseInp helper 0x099B81

Raw ROM bytes (64 bytes from 0x099b81):

`fd 36 06 00 fd 36 07 00 fd cb 3e b6 fd cb 20 86 fd cb 58 be fd cb 20 b6 fd cb 1a 9e fd cb 1f 86 fd 7e 0a fd 77 0b fd cb 49 86 fd cb 48 be c9 cd 8b af 09 cd 58 9d 09 da 35 9c 09 cd b8 ba 09 fe`

```text
0x099b81: fd 36 06 00     ld (iy+6), 0x00
0x099b85: fd 36 07 00     ld (iy+7), 0x00
0x099b89: fd cb 3e b6     res 6, (iy+62)
0x099b8d: fd cb 20 86     res 0, (iy+32)
0x099b91: fd cb 58 be     res 7, (iy+88)
0x099b95: fd cb 20 b6     res 6, (iy+32)
0x099b99: fd cb 1a 9e     res 3, (iy+26)
0x099b9d: fd cb 1f 86     res 0, (iy+31)
0x099ba1: fd 7e 0a        ld a, (iy+10)
0x099ba4: fd 77 0b        ld (iy+11), a
0x099ba7: fd cb 49 86     res 0, (iy+73)
0x099bab: fd cb 48 be     res 7, (iy+72)
0x099baf: c9              ret
```

## ParseInp helper 0x099B18

Raw ROM bytes (64 bytes from 0x099b18):

`cd 3d 38 08 da 3a 1d 06 2b cb 4e 23 c2 f6 1c 06 cd ae 21 08 28 0d 21 09 00 00 19 11 00 00 00 5e 19 23 eb ed 53 87 06 d0 cd f9 9a 09 2a 87 06 d0 cd 56 9b 09 22 17 23 d0 22 1a 23 d0 18 96 f5 01`

```text
0x099b18: cd 3d 38 08     call 0x08383d
0x099b1c: da 3a 1d 06     jp c, 0x061d3a
0x099b20: 2b              dec hl
0x099b21: cb 4e           bit 1, (hl)
0x099b23: 23              inc hl
0x099b24: c2 f6 1c 06     jp nz, 0x061cf6
0x099b28: cd ae 21 08     call 0x0821ae
0x099b2c: 28 0d           jr z, 0x099b3b
0x099b2e: 21 09 00 00     ld hl, 0x000009
0x099b32: 19              add hl, de
0x099b33: 11 00 00 00     ld de, 0x000000
0x099b37: 5e              ld e, (hl)
0x099b38: 19              add hl, de
0x099b39: 23              inc hl
0x099b3a: eb              ex de, hl
0x099b3b: ed 53 87 06 d0  ld (0xd00687), de
0x099b40: cd f9 9a 09     call 0x099af9
0x099b44: 2a 87 06 d0     ld hl, (0xd00687)
0x099b48: cd 56 9b 09     call 0x099b56
0x099b4c: 22 17 23 d0     ld (0xd02317), hl
0x099b50: 22 1a 23 d0     ld (0xd0231a), hl
0x099b54: 18 96           jr 0x099aec
```

## ParseInp helper 0x09BEED

Raw ROM bytes (64 bytes from 0x09beed):

`c5 21 03 00 00 cd b5 2b 08 c1 2a 93 25 d0 cd 64 c8 04 77 2b 70 2b 71 18 40 2a 93 25 d0 23 4e 23 46 23 7e cd 76 c8 04 18 31 c5 21 02 00 00 cd b5 2b 08 c1 2a 93 25 d0 70 2b 71 18 1d 2a 93 25 d0`

```text
0x09beed: c5              push bc
0x09beee: 21 03 00 00     ld hl, 0x000003
0x09bef2: cd b5 2b 08     call 0x082bb5
0x09bef6: c1              pop bc
0x09bef7: 2a 93 25 d0     ld hl, (0xd02593)
0x09befb: cd 64 c8 04     call 0x04c864
0x09beff: 77              ld (hl), a
0x09bf00: 2b              dec hl
0x09bf01: 70              ld (hl), b
0x09bf02: 2b              dec hl
0x09bf03: 71              ld (hl), c
0x09bf04: 18 40           jr 0x09bf46
```

## Loop body 0x082BE2

Raw ROM bytes (16 bytes from 0x082be2):

`2b 2b 2b 2b 2b 2b c9 ed 53 a3 25 d0 c9 e5 2a a3`

```text
0x082be2: 2b              dec hl
0x082be3: 2b              dec hl
0x082be4: 2b              dec hl
0x082be5: 2b              dec hl
0x082be6: 2b              dec hl
0x082be7: 2b              dec hl
0x082be8: c9              ret
```

## Loop body 0x084711

Raw ROM bytes (16 bytes from 0x084711):

`7e cd e2 2b 08 e6 3f ed 52 d8 19 3a f9 05 d0 be`

```text
0x084711: 7e              ld a, (hl)
0x084712: cd e2 2b 08     call 0x082be2
0x084716: e6 3f           and 0x3f
0x084718: ed 52           sbc hl, de
0x08471a: d8              ret c
0x08471b: 19              add hl, de
0x08471c: 3a f9 05 d0     ld a, (0xd005f9)
0x084720: be              cp (hl)
```

## Loop body 0x084716

Raw ROM bytes (16 bytes from 0x084716):

`e6 3f ed 52 d8 19 3a f9 05 d0 be 28 09 01 03 00`

```text
0x084716: e6 3f           and 0x3f
0x084718: ed 52           sbc hl, de
0x08471a: d8              ret c
0x08471b: 19              add hl, de
0x08471c: 3a f9 05 d0     ld a, (0xd005f9)
0x084720: be              cp (hl)
0x084721: 28 09           jr z, 0x08472c
0x084723: 01 03 00 00     ld bc, 0x000003
```

## Loop body 0x08471B

Raw ROM bytes (16 bytes from 0x08471b):

`19 3a f9 05 d0 be 28 09 01 03 00 00 b7 ed 42 18`

```text
0x08471b: 19              add hl, de
0x08471c: 3a f9 05 d0     ld a, (0xd005f9)
0x084720: be              cp (hl)
0x084721: 28 09           jr z, 0x08472c
0x084723: 01 03 00 00     ld bc, 0x000003
0x084727: b7              or a
0x084728: ed 42           sbc hl, bc
0x08472a: 18 e5           jr 0x084711
```

## RAM LD references

### Absolute-address LDs

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd005f9` | `?OP1+1` | read | 8 | `0x08471c ld a, (0xd005f9)` |
| `0xd00687` | `?asm_ram` | write | 24 | `0x099b3b ld (0xd00687), de` |
| `0xd00687` | `?asm_ram` | read | 24 | `0x099b44 ld hl, (0xd00687)` |
| `0xd02317` | `?begPC` | write | 24 | `0x099b4c ld (0xd02317), hl` |
| `0xd0231a` | `?curPC` | write | 24 | `0x099b50 ld (0xd0231a), hl` |
| `0xd02593` | `?OPS` | read | 24 | `0x09bef7 ld hl, (0xd02593)` |

### IY-relative LDs resolved with `IY = 0xd00080`

| Address | Access | Width | Site(s) |
|---|---|---:|---|
| `0xd00086` | write | 8 | `0x099b81 ld (iy+6), 0x00` |
| `0xd00087` | write | 8 | `0x099b85 ld (iy+7), 0x00` |
| `0xd0008a` | read | 8 | `0x099ba1 ld a, (iy+10)` |
| `0xd0008b` | write | 8 | `0x099ba4 ld (iy+11), a` |

## Conclusion

- `0x09beed` reads `?OPS = 0xd02593`. This is the only pointer-like absolute RAM read in the three straight-line helper entry blocks.
- `0x099b18` uses `?asm_ram = 0xd00687` as a scratch spill: it stores DE there, reloads it into HL, and then calls onward. That slot is active, but it is not the caller-provided parse pointer.
- `0x099b18` overwrites `?begPC = 0xd02317` and `?curPC = 0xd0231a`; it does not read them in this first block. That means the phase 25K seed values for those slots were being replaced before the later loop.
- The loop at `0x084711` reads `0xd005f9` (`?OP1+1`) as a byte compare input, not as a pointer fetch.
- `0x099b81` only touches IY-relative session bytes (`0xd00086`, `0xd00087`, `0xd0008a`, `0xd0008b` when `IY = 0xd00080`). Those look like parser state flags/bytes rather than caller-owned pointer slots.
- No straight-line read was found here from `0xd02587`, `0xd0231d`, `0xd007fa`, or `0xd008e0`.
- Inference: the next ParseInp probe should prioritize the `?OPS` family around `0xd02593`; the `?begPC/?curPC` pair behaves like ParseInp-maintained output state in these first blocks, not the input contract.

