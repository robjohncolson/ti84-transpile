# Phase 100F: Disassembly of the Function Containing PC `0x00287d`

## Notes

- Opcode meanings were cross-checked against the Zilog eZ80 CPU manual (`UM0077`).
- The repo's existing lifted/transpiled listing mislabels the key `FD 07/17/27` opcodes. In ADL mode they are:
  - `FD 07 dd` = `LD BC,(IY+d)`
  - `FD 17 dd` = `LD DE,(IY+d)`
  - `FD 27 dd` = `LD HL,(IY+d)`
- To stay on real instruction boundaries, the listing starts at `0x00283a`, which is the nearest confirmed function entry before `0x002840`.

## Disassembly Listing

```asm
; 0x00283a: generic byte-fill helper
00283a: fd e5                push iy
00283c: fd 21 03 00 00       ld iy, 0x000003
002841: fd 39                add iy, sp
002843: fd 17 03             ld de, (iy+3)
002846: fd 27 09             ld hl, (iy+9)
002849: fd 7e 06             ld a, (iy+6)
00284c: 01 00 00 00          ld bc, 0x000000
002850: 18 03                jr 0x002855
002852: 12                   ld (de), a
002853: 13                   inc de
002854: 2b                   dec hl
002855: ed 42                sbc hl, bc
002857: 20 f9                jr nz, 0x002852
002859: fd 27 03             ld hl, (iy+3)
00285c: fd e1                pop iy
00285e: c9                   ret

; 0x00285f: zero-fill helper using one seed store + overlapping LDIR
00285f: fd e5                push iy
002861: fd 21 03 00 00       ld iy, 0x000003
002866: fd 39                add iy, sp
002868: fd 27 06             ld hl, (iy+6)
00286b: 01 00 00 00          ld bc, 0x000000
00286f: ed 42                sbc hl, bc
002871: 28 14                jr z, 0x002887
002873: fd 17 03             ld de, (iy+3)
002876: af                   xor a
002877: 12                   ld (de), a
002878: 2b                   dec hl
002879: ed 42                sbc hl, bc
00287b: 28 0a                jr z, 0x002887
00287d: fd 07 06             ld bc, (iy+6)
002880: 0b                   dec bc
002881: 13                   inc de
002882: fd 27 03             ld hl, (iy+3)
002885: ed b0                ldir
002887: fd e1                pop iy
002889: c9                   ret

; 0x00288a: write one byte to the pointer stored at 0xd00105, then advance it
00288a: dd e5                push ix
00288c: dd 21 00 00 00       ld ix, 0x000000
002891: dd 39                add ix, sp
002893: ed 4b 05 01 d0       ld bc, (0xd00105)
002898: dd 7e 06             ld a, (ix+6)
00289b: 02                   ld (bc), a
00289c: 03                   inc bc
00289d: ed 43 05 01 d0       ld (0xd00105), bc
0028a2: dd e1                pop ix
0028a4: c9                   ret

; 0x0028a5: wrapper that pushes two arguments and calls 0x002bed
0028a5: dd e5                push ix
0028a7: dd 21 00 00 00       ld ix, 0x000000
0028ac: dd 39                add ix, sp
0028ae: fd e5                push iy
0028b0: 01 d1 28 00          ld bc, 0x0028d1
0028b4: ed 43 08 01 d0       ld (0xd00108), bc
0028b9: ed 65 09             pea ix+9
0028bc: dd 07 06             ld bc, (ix+6)
0028bf: c5                   push bc
0028c0: 01 00 00 00          ld bc, 0x000000
0028c4: c5                   push bc
0028c5: cd ed 2b 00          call 0x002bed
0028c9: c1                   pop bc
0028ca: c1                   pop bc
0028cb: c1                   pop bc
0028cc: fd e1                pop iy
0028ce: dd e1                pop ix
0028d0: c9                   ret
0028d1: c9                   ret
```

## Function Entry Point

The function that contains `PC 0x00287d` starts at `0x00285f`:

```asm
00285f: fd e5  push iy
...
002887: fd e1  pop iy
002889: c9     ret
```

## Function Purpose

`0x00285f` is not a plain `memcpy` wrapper. It is a specialized bulk zero-fill helper:

1. It loads the byte count from the stack into `HL`.
2. If the count is zero, it returns immediately.
3. It loads the destination pointer into `DE`.
4. `xor a` forces the fill value to `0x00`.
5. `ld (de), a` seeds the first byte with zero.
6. For counts greater than 1, it reloads the count into `BC`, decrements it, reloads the original destination into `HL`, advances `DE` to `dest+1`, then runs `ldir`.

Because `HL = dest`, `DE = dest+1`, and `BC = count-1`, the `LDIR` is intentionally overlapping. That causes the single zero byte just written at `dest[0]` to be replicated across the entire region.

So this is best described as a `bzero` / `memset(..., 0, len)` helper implemented as:

```text
store one zero byte
then use overlapping LDIR to clone it across the remaining bytes
```

The adjacent function at `0x00283a` is the real generic byte-fill helper. It takes a fill byte from the stack (`ld a, (iy+6)`) and loops with `ld (de), a`.

## Parameter Passing Convention

The target function uses stack arguments in ADL mode:

- Return address: `[SP+0 .. SP+2]`
- Destination pointer: `[SP+3 .. SP+5]`
- Length: `[SP+6 .. SP+8]`

Evidence:

- `fd 17 03` at `0x002873` loads `DE <- (IY+3)` after `IY = SP+3`
- `fd 27 06` at `0x002868` loads `HL <- (IY+6)`
- `fd 07 06` at `0x00287d` reloads `BC <- (IY+6)`

There is no fill-value parameter in `0x00285f`; the fill byte is hard-coded by `xor a`.

For comparison, the neighboring generic helper at `0x00283a` uses:

- `[SP+3 .. SP+5]` = destination
- `[SP+6]` = fill byte
- `[SP+9 .. SP+11]` = length

## Specific Instruction at PC `0x00287d`

`PC 0x00287d` is:

```asm
00287d: fd 07 06    ld bc, (iy+6)
```

So `0x00287d` is neither:

- the `LDIR` itself
- nor the `ld (de), a ; dec hl` seed sequence

It is the setup instruction that reloads the byte count before:

```asm
002885: ed b0       ldir
```

The actual writes in this function happen at:

- `0x002877`: `ld (de), a`
- `0x002885`: `ldir`

Inference: if a dynamic trace attributed bulk writes to `0x00287d`, it was very likely reporting the entry PC of the translated/basic block that runs through `0x002885`, not the exact store instruction.

## Verdict on the "generic bulk 0xFF memset" Hypothesis

This disassembly refutes that hypothesis.

- The function containing `0x00287d` is not a `0xFF` fill helper.
- It is not a general `memcpy` wrapper either.
- It is a specialized bulk `0x00` clear routine.
- The fill value is hard-coded by `xor a`, so the function always writes zero.

If earlier probes showed `0xFF` writes attributed to `0x00287d`, that discrepancy is not explained by the ROM bytes here. The static code at `0x00285f` only supports a zero-fill interpretation.
