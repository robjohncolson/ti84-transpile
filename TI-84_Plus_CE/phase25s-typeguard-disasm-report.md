# Phase 25S - Type guard and name-length helper disassembly

## Scope
- ROM: `TI-84_Plus_CE/ROM.rom`
- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`
- Requested windows: `0x080084` for 128 bytes and `0x0820CD` for 96 bytes
- Important surrounding caller: shared Create allocator at `0x0822D9`

## Direct answers

### Type guard 0x080084
- The actual type-guard subroutine is only `0x080084` through `0x080098`.
- It checks `A` against exactly five values: `0x15`, `0x17`, `0x05`, `0x16`, and `0x06`.
- It returns with `Z=1` only for those five values. All other inputs return with `Z=0`.
- The shared allocator uses `jr z, 0x0822f8`, so only those five type bytes take the helper-count path immediately.
- `CreateReal` enters with `A=0x00`, so `0x080084` returns `Z=0` there. That means `CreateReal` is supposed to take the non-`Z` path, not the special-type path.
- `0x080084` itself does not read or write OP1 or any other absolute RAM address.

### Name-length helper 0x0820CD
- The actual helper is `0x0820CD` through `0x0820EC`; the remaining bytes in the 96-byte window belong to the adjacent allocator tail.
- It starts at `OP1[1]` (`0xD005F9`), not `OP1[0]`.
- With `A=0` and `BC=8`, `cpir` scans `OP1[1]` through `OP1[8]` for the zero terminator.
- If no zero terminator is found in that range, it returns `A=8` with `NZ=1`.
- Otherwise it returns the discovered byte length. The only special case is a one-byte string that consists of just `]` (`0x5D`): that case returns `2` instead of `1`.
- The `A>=7` rejection is not inside `0x0820CD` itself. The caller at `0x0822EF` does `cp 0x07`, and `0x0822F1` follows with `jp nc, 0x061d1a`.

### What CreateReal actually expects in OP1
- `CreateReal` enters at `0x08238A` with `xor a`, so the type byte is `A=0x00`.
- `0x0822D9` immediately stores that byte to `OP1[0]` at `0xD005F8`.
- The visible name bytes begin at `OP1[1]`, which is why `0x0820CD` scans from `0xD005F9` onward.
- A plain real named `A` therefore wants `OP1 = [0x00, 0x41, 0x00, ...]`, not a type byte in `OP1[1]`.
- The later checks for `]`, `$`, `:`, and `r` at `0x0822E7` / `0x08239C` are prefix-byte checks on `OP1[1]` for alternate Create paths; they are not the type guard that `CreateReal` uses.

## Accepted / rejected type bytes

| Input A | 0x080084 result | Allocator meaning at 0x0822E1 |
|---|---|---|
| `0x05` | `Z=1` | take `jr z, 0x0822f8` |
| `0x06` | `Z=1` | take `jr z, 0x0822f8` |
| `0x15` | `Z=1` | take `jr z, 0x0822f8` |
| `0x16` | `Z=1` | take `jr z, 0x0822f8` |
| `0x17` | `Z=1` | take `jr z, 0x0822f8` |
| anything else, including `0x00` | `Z=0` | stay on the non-`Z` path at `0x0822e3` |

## Type guard window 0x080084

Requested raw bytes (`128` bytes from `0x080084`):

```text
0x080084: fe 15 c8 fe 17 c8 18 04 cd bd f7 07 fe 05 c8 fe
0x080094: 16 c8 fe 06 c9 7a b7 c0 7b fe 3f c9 fd cb 14 5e
0x0800a4: 28 17 bf c9 fd cb 09 7e 20 f8 cd 59 02 08 c8 fd
0x0800b4: cb 45 6e c8 fd cb 44 6e c9 fd cb 14 46 c9 fd cb
0x0800c4: 14 9e c9 21 fa 05 d0 cb c6 c9 cd 28 00 08 fd cb
0x0800d4: 09 76 c8 cd f1 ff 07 c0 cd fa f8 07 cd ea 46 08
0x0800e4: cd fb e8 03 c3 68 f9 07 f5 af cd a0 00 08 28 02
0x0800f4: c6 06 32 04 25 d0 87 87 f5 87 87 c1 80 c6 25 32
```

Annotated disassembly:

```text
0x080084: fe 15                cp 0x15  ; Compare incoming A against type 0x15.
0x080086: c8                   ret z  ; If equal, return immediately with Z=1.
0x080087: fe 17                cp 0x17  ; Compare incoming A against type 0x17.
0x080089: c8                   ret z  ; If equal, return immediately with Z=1.
0x08008a: 18 04                jr 0x080090  ; Skip the shared 0x080080 pre-normalization call when entered directly at 0x080084.
0x08008c: cd bd f7 07          call 0x07f7bd  ; The 0x080080 entry normalizes A through 0x07F7BD, then falls through to the same compare chain.
0x080090: fe 05                cp 0x05  ; Compare incoming A against type 0x05.
0x080092: c8                   ret z  ; If equal, return with Z=1.
0x080093: fe 16                cp 0x16  ; Compare incoming A against type 0x16.
0x080095: c8                   ret z  ; If equal, return with Z=1.
0x080096: fe 06                cp 0x06  ; Final compare against type 0x06.
0x080098: c9                   ret  ; Return with flags from cp 0x06. Z=1 only when A==0x06.
0x080099: 7a                   ld a, d
0x08009a: b7                   or a
0x08009b: c0                   ret nz
0x08009c: 7b                   ld a, e
0x08009d: fe 3f                cp 0x3f
0x08009f: c9                   ret
0x0800a0: fd cb 14 5e          bit 3, (iy+20)  ; iy+0x14 | Adjacent helper: tests bit 3 of IY+0x14.
0x0800a4: 28 17                jr z, 0x0800bd
0x0800a6: bf                   cp a
0x0800a7: c9                   ret
0x0800a8: fd cb 09 7e          bit 7, (iy+9)  ; iy+0x09 | Adjacent helper: tests bit 7 of IY+0x09.
0x0800ac: 20 f8                jr nz, 0x0800a6
0x0800ae: cd 59 02 08          call 0x080259
0x0800b2: c8                   ret z
0x0800b3: fd cb 45 6e          bit 5, (iy+69)  ; iy+0x45 | Adjacent helper: tests bit 5 of IY+0x45.
0x0800b7: c8                   ret z
0x0800b8: fd cb 44 6e          bit 5, (iy+68)  ; iy+0x44 | Adjacent helper: tests bit 5 of IY+0x44.
0x0800bc: c9                   ret
0x0800bd: fd cb 14 46          bit 0, (iy+20)  ; iy+0x14 | Adjacent helper: tests bit 0 of IY+0x14.
0x0800c1: c9                   ret
0x0800c2: fd cb 14 9e          res 3, (iy+20)  ; iy+0x14 | Adjacent helper: clears bit 3 of IY+0x14.
0x0800c6: c9                   ret
0x0800c7: 21 fa 05 d0          ld hl, 0xd005fa  ; Adjacent helper: points HL at OP1[2].
0x0800cb: cb c6                set 0, (hl)  ; Adjacent helper: sets bit 0 in OP1[2].
0x0800cd: c9                   ret
0x0800ce: cd 28 00 08          call 0x080028
0x0800d2: fd cb 09 76          bit 6, (iy+9)  ; iy+0x09
0x0800d6: c8                   ret z
0x0800d7: cd f1 ff 07          call 0x07fff1
0x0800db: c0                   ret nz
0x0800dc: cd fa f8 07          call 0x07f8fa
0x0800e0: cd ea 46 08          call 0x0846ea
0x0800e4: cd fb e8 03          call 0x03e8fb
0x0800e8: c3 68 f9 07          jp 0x07f968
0x0800ec: f5                   push af  ; Adjacent helper: begins a RAM writer used after the flag tests.
0x0800ed: af                   xor a
0x0800ee: cd a0 00 08          call 0x0800a0
0x0800f2: 28 02                jr z, 0x0800f6
0x0800f4: c6 06                add 0x06
0x0800f6: 32 04 25 d0          ld (0xd02504), a  ; typeClassScratch | Writes the derived class byte to 0xD02504.
0x0800fa: 87                   add a
0x0800fb: 87                   add a
0x0800fc: f5                   push af
0x0800fd: 87                   add a
0x0800fe: 87                   add a
0x0800ff: c1                   pop bc
0x080100: 80                   add b
0x080101: c6 25                add 0x25
0x080103: 32 84 26 d0          ld (0xd02684), a  ; typeClassTableIndex | Writes the derived table index byte to 0xD02684.
```

Notes:
- `0x080084` through `0x080098` is the real type guard.
- `0x080080` is a sibling entry that first calls `0x07F7BD`, then falls through into the same compare chain at `0x080084`.
- The rest of this 128-byte dump is nearby helper code; that is where the IY-relative flag tests and the `OP1[2]` write appear.

## Name-length helper window 0x0820CD

Requested raw bytes (`96` bytes from `0x0820CD`):

```text
0x0820cd: e5 21 f9 05 d0 7e d6 5d 57 01 08 00 00 af ed b1
0x0820dd: e1 3e 08 c0 0c 91 fe 01 c0 5f 7a b7 7b c0 3c c9
0x0820ed: 01 09 00 00 c5 2a 90 25 d0 b7 ed 42 22 90 25 d0
0x0820fd: 3a fe 05 d0 fe 24 28 2e 2a 9a 25 d0 b7 ed 42 22
0x08210d: 9a 25 d0 fe 72 28 14 fe 3a 28 10 cd bd f7 07 cd
0x08211d: 2d 01 08 28 11 cd 80 00 08 28 0b 2a 9d 25 d0 b7
```

Annotated disassembly:

```text
0x0820cd: e5                   push hl  ; Preserve caller HL.
0x0820ce: 21 f9 05 d0          ld hl, 0xd005f9  ; Start scanning at OP1[1], not OP1[0].
0x0820d2: 7e                   ld a, (hl)  ; Load the first visible name/prefix byte.
0x0820d3: d6 5d                sub 0x5d  ; Compute firstByte - 0x5D. D becomes zero only when OP1[1] is ] .
0x0820d5: 57                   ld d, a
0x0820d6: 01 08 00 00          ld bc, 0x000008  ; Limit the scan to eight bytes.
0x0820da: af                   xor a  ; Search key A=0, so CPIR looks for the zero terminator.
0x0820db: ed b1                cpir  ; Read OP1[1] through OP1[8] until NUL or the eight-byte limit is exhausted.
0x0820dd: e1                   pop hl
0x0820de: 3e 08                ld a, 0x08  ; Default result is A=8 if no NUL is found.
0x0820e0: c0                   ret nz
0x0820e1: 0c                   inc c  ; Convert the remaining count in C into the discovered string length.
0x0820e2: 91                   sub c
0x0820e3: fe 01                cp 0x01  ; Only the one-byte case falls through for special handling.
0x0820e5: c0                   ret nz
0x0820e6: 5f                   ld e, a  ; Save the computed length in E.
0x0820e7: 7a                   ld a, d  ; Restore the first-byte comparison result from D.
0x0820e8: b7                   or a
0x0820e9: 7b                   ld a, e
0x0820ea: c0                   ret nz  ; If the first byte was not ] , return the computed length unchanged.
0x0820eb: 3c                   inc a  ; If the only byte was ] , bump the result from 1 to 2.
0x0820ec: c9                   ret
0x0820ed: 01 09 00 00          ld bc, 0x000009  ; Adjacent helper: allocator tail starts here.
0x0820f1: c5                   push bc
0x0820f2: 2a 90 25 d0          ld hl, (0xd02590)  ; OPBase | Read OPBase.
0x0820f6: b7                   or a
0x0820f7: ed 42                sbc hl, bc
0x0820f9: 22 90 25 d0          ld (0xd02590), hl  ; OPBase | Write the updated OPBase.
0x0820fd: 3a fe 05 d0          ld a, (0xd005fe)  ; OP1[6] | Read OP1[6], the allocator-saved count/type slot.
0x082101: fe 24                cp 0x24
0x082103: 28 2e                jr z, 0x082133
0x082105: 2a 9a 25 d0          ld hl, (0xd0259a)  ; pTemp | Read pTemp.
0x082109: b7                   or a
0x08210a: ed 42                sbc hl, bc
0x08210c: 22 9a 25 d0          ld (0xd0259a), hl  ; pTemp | Write the updated pTemp.
0x082110: fe 72                cp 0x72
0x082112: 28 14                jr z, 0x082128
0x082114: fe 3a                cp 0x3a
0x082116: 28 10                jr z, 0x082128
0x082118: cd bd f7 07          call 0x07f7bd  ; Normalize through 0x07F7BD before the broader 0x080080 filter chain.
0x08211c: cd 2d 01 08          call 0x08012d
0x082120: 28 11                jr z, 0x082133
0x082122: cd 80 00 08          call 0x080080  ; Calls 0x080080, not 0x080084, so this path includes pre-normalization.
0x082126: 28 0b                jr z, 0x082133
0x082128: 2a 9d 25 d0          ld hl, (0xd0259d)  ; progPtr | Read progPtr.
0x08212c: b7                   or a
0x08212d: ed 42                sbc hl, bc
0x08212f: 22 9d 25 d0          ld (0xd0259d), hl  ; progPtr | Write the updated progPtr.
0x082133: ed 5b 93 25 d0       ld de, (0xd02593)  ; OPS | Read OPS.
0x082138: 09                   add hl, bc
0x082139: e5                   push hl
0x08213a: ed 52                sbc hl, de
0x08213c: f5                   push af
0x08213d: e5                   push hl
0x08213e: eb                   ex de, hl
0x08213f: ed 42                sbc hl, bc
0x082141: 22 93 25 d0          ld (0xd02593), hl  ; OPS
0x082145: 23                   inc hl
0x082146: e5                   push hl
0x082147: d1                   pop de
```

Notes:
- `0x0820CD` through `0x0820EC` is the actual name-length helper.
- `0x0820ED` onward is the allocator tail used after the helper result is pushed back into `OP1[6]`.
- Because the scan starts at `OP1[1]`, the helper never treats `OP1[0]` as part of the visible name.

## OP1 layout conclusion

- `OP1[0]` at `0xD005F8` is the variable type byte supplied in `A` by the Create entry point.
- `OP1[1]..` is the zero-terminated name or prefix-plus-name string consumed by `0x0820CD` and by the later `]/$/:/r` prefix checks.
- `CreateReal` specifically uses `A=0x00`, so the correct setup for a simple one-letter name is `OP1[0]=0x00`, `OP1[1]=0x41`, `OP1[2]=0x00`.
- The reason `0x08239C` seems to compare `OP1+1` against type-looking bytes is that it belongs to a different Create-family path after `CreateTemp` setup; it is not redefining the `CreateReal` type byte.

## Caller-side rejection point

The helper itself only computes a small length/count. The hard rejection happens one level up in the allocator:

```text
0x0822eb: cd cd 20 08        call 0x0820cd
0x0822ef: fe 07              cp 0x07
0x0822f1: d2 1a 1d 06        jp nc, 0x061d1a
0x0822f5: 3c                 inc a
```

That is the exact `A >= 7` test: `cp 0x07` followed by `jp nc`.
