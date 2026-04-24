# Phase 25AQ - VAT walker loop disassembly and termination condition

## Scope

- Loop window: `0x082745..0x0827CA`
- Called helper window: `0x04C876..0x04C894`
- Decoder source: `TI-84_Plus_CE/ez80-decoder.js`
- ROM source: `TI-84_Plus_CE/ROM.rom`
- Symbol cross-reference source: `TI-84_Plus_CE/references/ti84pceg.inc`

## Key findings

- The loop backedge is `0x08279A: jp 0x082745`.
- The loop exits at `0x082798: ret c`.
- The exit check is not a sentinel-byte test. It is a pointer lower-bound test against `?OPBase` at `0xD02590`.
- `0x04C876` is not the terminating compare helper. It packs the three bytes in `A:B:C` into a 24-bit `BC` value by round-tripping through `?scrapMem` at `0xD02AD7`.

## Cross-references from ti84pceg.inc

| Address | Symbol | Notes |
| --- | --- | --- |
| `0xD02590` | `?OPBase` | Lower bound used by the terminating compare |
| `0xD02593` | `?OPS` | Useful for coherent allocator seeding, not used by the exit compare |
| `0xD0259A` | `?pTemp` | Useful for coherent allocator seeding |
| `0xD0259D` | `?progPtr` | Useful for coherent allocator seeding |
| `0xD02AD7` | `?scrapMem` | 3-byte scratch used by `0x04C876` |
| `0xD02AD9` | `?scrapMem+2` | High byte of the same scratch triplet |
| `0xD1A881` | `?userMem` | MEM_INIT seed for temp/FPS/newDataPtr family |
| `0xD02577` | `(none)` | Scratch slot used by the walker to preserve incoming `BC` |

## Full disassembly: 0x082745..0x0827CA

```text
0x082745: f5              push af
0x082746: 4e              ld c, (hl)
0x082747: 2b              dec hl
0x082748: 46              ld b, (hl)
0x082749: 2b              dec hl
0x08274a: 7e              ld a, (hl)
0x08274b: 23              inc hl
0x08274c: cd 76 c8 04     call 0x04c876
0x082750: cd b2 21 08     call 0x0821b2
0x082754: 20 1e           jr nz, 0x082774
0x082756: eb              ex de, hl
0x082757: b7              or a
0x082758: ed 42           sbc hl, bc
0x08275a: 30 16           jr nc, 0x082772
0x08275c: 09              add hl, bc
0x08275d: e5              push hl
0x08275e: c5              push bc
0x08275f: e1              pop hl
0x082760: ed 4b 77 25 d0  ld bc, (0xd02577)
0x082765: b7              or a
0x082766: ed 42           sbc hl, bc
0x082768: eb              ex de, hl
0x082769: 2b              dec hl
0x08276a: cd 0b 2c 08     call 0x082c0b
0x08276e: 23              inc hl
0x08276f: d1              pop de
0x082770: 18 02           jr 0x082774
0x082772: 09              add hl, bc
0x082773: eb              ex de, hl
0x082774: 23              inc hl
0x082775: 23              inc hl
0x082776: 23              inc hl
0x082777: 23              inc hl
0x082778: cd 9e 27 08     call 0x08279e
0x08277c: 01 00 00 00     ld bc, 0x000000
0x082780: 0e 0c           ld c, 0x0c
0x082782: 20 09           jr nz, 0x08278d
0x082784: cd e2 2b 08     call 0x082be2
0x082788: 4e              ld c, (hl)
0x082789: 0c              inc c
0x08278a: 0c              inc c
0x08278b: 0c              inc c
0x08278c: 0c              inc c
0x08278d: f1              pop af
0x08278e: b7              or a
0x08278f: ed 42           sbc hl, bc
0x082791: ed 4b 90 25 d0  ld bc, (0xd02590)
0x082796: ed 42           sbc hl, bc
0x082798: d8              ret c
0x082799: 09              add hl, bc
0x08279a: c3 45 27 08     jp 0x082745
0x08279e: 7e              ld a, (hl)
0x08279f: e6 3f           and 0x3f
0x0827a1: cd 84 00 08     call 0x080084
0x0827a5: c8              ret z
0x0827a6: cd 2d 01 08     call 0x08012d
0x0827aa: c0              ret nz
0x0827ab: e5              push hl
0x0827ac: cd e2 2b 08     call 0x082be2
0x0827b0: 7e              ld a, (hl)
0x0827b1: fe 24           cp 0x24
0x0827b3: 28 0a           jr z, 0x0827bf
0x0827b5: fe 72           cp 0x72
0x0827b7: 28 06           jr z, 0x0827bf
0x0827b9: fe 3a           cp 0x3a
0x0827bb: 28 02           jr z, 0x0827bf
0x0827bd: 3e 01           ld a, 0x01
0x0827bf: fe 01           cp 0x01
0x0827c1: e1              pop hl
0x0827c2: c9              ret
0x0827c3: ed 43 d7 2a d0  ld (0xd02ad7), bc
0x0827c8: 18 15           jr 0x0827df
0x0827ca: ed 43 d7 2a d0  ld (0xd02ad7), bc
```

## Helper disassembly: 0x04C876..0x04C894

```text
0x04c876: ed 43 d7 2a d0  ld (0xd02ad7), bc
0x04c87b: 32 d9 2a d0     ld (0xd02ad9), a
0x04c87f: ed 4b d7 2a d0  ld bc, (0xd02ad7)
0x04c884: c9              ret
0x04c885: 78              ld a, b
0x04c886: ed 53 d7 2a d0  ld (0xd02ad7), de
0x04c88b: 32 d9 2a d0     ld (0xd02ad9), a
0x04c88f: ed 5b d7 2a d0  ld de, (0xd02ad7)
0x04c894: c9              ret
```

## Analysis

### Loop structure

The walker starts from the VAT tail and iterates backward. Each trip through `0x082745` does four things:

1. Read three bytes from the current VAT entry tail and call `0x04C876` to repack them into a 24-bit `BC`.
2. Call `0x0821B2`, then either skip the pointer-adjust path (`0x082754: jr nz`) or, for matching entry classes, compare and possibly rewrite the entry pointer via `0x082C0B`.
3. Advance `HL` over the fixed entry header and use `0x08279E` plus the optional `0x082BE2` path to derive the variable entry span.
4. Subtract that span from `HL`, compare the result against `?OPBase`, and either return or jump back to `0x082745`.

Two internal conditional branches are easy to misread as exits, but neither terminates the loop:

- `0x082754: jr nz, 0x082774` only skips the pointer-adjust subpath.
- `0x082782: jr nz, 0x08278d` only chooses the fixed-length entry-size path.

The real loop exit is only the `ret c` at `0x082798`.

### Exact exit condition

The terminating sequence is:

```text
0x08278d: f1              pop af
0x08278e: b7              or a
0x08278f: ed 42           sbc hl, bc
0x082791: ed 4b 90 25 d0  ld bc, (0xd02590)   ; ?OPBase
0x082796: ed 42           sbc hl, bc
0x082798: d8              ret c
```

Interpretation:

- By `0x08278F`, `BC` holds the current entry span.
- `0x08278F` backs `HL` up to the candidate address of the previous entry.
- `0x082791` replaces `BC` with `?OPBase`.
- `0x082796` compares the decremented walker cursor against `?OPBase`.
- `0x082798` returns when the subtraction borrows, meaning the cursor has moved below `?OPBase`.

So the loop terminates when:

`next_HL < ?OPBase`

This is a pointer bound check. It is not checking for a sentinel value inside the VAT entry and it is not counting iterations.

### What 0x04C876 actually does

The helper called from `0x08274C` is:

```text
ld (0xd02ad7), bc
ld (0xd02ad9), a
ld bc, (0xd02ad7)
ret
```

In ADL mode, `ld bc, (addr)` reloads a 24-bit value. That means the helper uses `?scrapMem` as a 3-byte temporary so the caller can present the VAT entry bytes in `A:B:C` and receive the packed 24-bit value back in `BC`.

That helper participates in entry-pointer extraction, but not in loop termination.

## Suggested RAM seeds

### Minimal forced-exit seed

If the goal is simply to stop the walker immediately, seed the lower-bound family to the empty-VAT MEM_INIT value:

- `?OPBase = 0xD3FFFF`
- `?OPS = 0xD3FFFF`
- `?pTemp = 0xD3FFFF`
- `?progPtr = 0xD3FFFF`

With `?OPBase = 0xD3FFFF`, the first bound check returns as soon as `HL` backs up by one entry span.

### MEM_INIT-coherent allocator family

To match the ROM's MEM_INIT static initialization while still giving the allocator coherent state:

- `?tempMem = ?FPSbase = ?FPS = ?newDataPtr = ?userMem = 0xD1A881`
- `?OPBase = ?OPS = ?pTemp = ?progPtr = 0xD3FFFF`

This is the empty-VAT starting state implied by `0x09DEE0`.

### If a real walk is desired

The bound seed alone is not enough if you want the loop to traverse actual VAT entries. The bytes near `0xD3FFFF` must also decode as valid VAT entry tails and name-length data so that:

- `0x04C876` reconstructs sane 24-bit entry pointers,
- `0x08279E` derives sane entry sizes,
- `HL` continues moving downward,
- and the cursor eventually crosses `?OPBase`.

Without valid entry bytes, the walker can still loop pathologically even if `?OPBase` itself is sensible.
