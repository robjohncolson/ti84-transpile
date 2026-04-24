# Phase 25AO - Empty ENTER disassembly at 0x058C65

Generated: 2026-04-24

## Sources

- `TI-84_Plus_CE/ROM.rom`, decoded in ADL mode with `TI-84_Plus_CE/ez80-decoder.js`
- `TI-84_Plus_CE/phase25an-disasm-0921CB-report.md` for the predecessor branch at `0x058637`
  - `0x058637  jp z, 0x058C65`
- `TI-84_Plus_CE/references/ti84pceg.inc`

## Question

Fresh boot sets `numLastEntries` (`0xD01D0B`) to zero. In the ENTER handler:

```text
0x058632  ld a, (0xD01D0B)
0x058636  or a
0x058637  jp z, 0x058C65
```

The key static question is whether the empty-history target at `0x058C65` later rejoins the common tail at `0x058693`, which eventually reaches:

```text
0x0586DF  call 0x0A27DD
0x0586E3  call 0x099910
```

## Primary disassembly - `0x058C65..0x058D00`

```text
0x058C65  CD A8 00 08          call 0x0800A8
0x058C69  C0                   ret nz
0x058C6A  CD 83 8C 05          call 0x058C83
0x058C6E  CD B8 00 08          call 0x0800B8
0x058C72  C4 EE 83 05          call nz, 0x0583EE
0x058C76  FD CB 0C EE          set 5, (iy+12)
0x058C7A  FD CB 05 A6          res 4, (iy+5)
0x058C7E  FD CB 45 8E          res 1, (iy+69)
0x058C82  C9                   ret
0x058C83  CD FF 8C 05          call 0x058CFF
0x058C87  CD 7B FF 07          call 0x07FF7B
0x058C8B  CD 4F 38 08          call 0x08384F
0x058C8F  22 4E 24 D0          ld (0xD0244E), hl
0x058C93  FD CB 46 7E          bit 7, (iy+70)
0x058C97  FD CB 46 BE          res 7, (iy+70)
0x058C9B  F5                   push af
0x058C9C  CC 4D E8 05          call z, 0x05E84D
0x058CA0  F1                   pop af
0x058CA1  C4 6A E8 05          call nz, 0x05E86A
0x058CA5  FD CB 0C B6          res 6, (iy+12)
0x058CA9  FD CB 09 86          res 0, (iy+9)
0x058CAD  CD B8 00 08          call 0x0800B8
0x058CB1  C8                   ret z
0x058CB2  CD 72 E8 05          call 0x05E872
0x058CB6  FD CB 20 A6          res 4, (iy+32)
0x058CBA  CD BB D0 08          call 0x08D0BB
0x058CBE  30 0E                jr nc, 0x058CCE
0x058CC0  CD 8E 8D 05          call 0x058D8E
0x058CC4  CD 7B FF 07          call 0x07FF7B
0x058CC8  CD BB D0 08          call 0x08D0BB
0x058CCC  38 53                jr c, 0x058D21
0x058CCE  FD CB 20 D6          set 2, (iy+32)
0x058CD2  FD CB 44 4E          bit 1, (iy+68)
0x058CD6  C0                   ret nz
0x058CD7  FD CB 20 96          res 2, (iy+32)
0x058CDB  C9                   ret
0x058CDC  FD CB 45 6E          bit 5, (iy+69)
0x058CE0  C8                   ret z
0x058CE1  CD B1 0A 09          call 0x090AB1
0x058CE5  11 64 00 00          ld de, 0x000064
0x058CE9  CD 97 1B 09          call 0x091B97
0x058CED  38 2A                jr c, 0x058D19
0x058CEF  21 19 8D 05          ld hl, 0x058D19
0x058CF3  CD EF 1D 06          call 0x061DEF
0x058CF7  CD DE 62 05          call 0x0562DE
0x058CFB  CD 20 1E 06          call 0x061E20
0x058CFF  CD 2E 8D 05          call 0x058D2E
```

This is already enough to answer the main branch question: the empty-enter block has no direct `jr` or `jp` to `0x058693`. Its visible exits are `ret`, conditional `ret`, or branches deeper into the `0x058Dxx` helper cluster.

## Local continuation targets

### `0x058D03..0x058D18`

```text
0x058D03  D0                   ret nc
0x058D04  21 18 8D 05          ld hl, 0x058D18
0x058D08  CD EF 1D 06          call 0x061DEF
0x058D0C  21 64 00 00          ld hl, 0x000064
0x058D10  CD 38 24 08          call 0x082438
0x058D14  CD 20 1E 06          call 0x061E20
0x058D18  C9                   ret
```

### `0x058D19..0x058D2D`

```text
0x058D19  CD 3B 32 08          call 0x08323B
0x058D1D  FD CB 45 AE          res 5, (iy+69)
0x058D21  CD 8E 8D 05          call 0x058D8E
0x058D25  FD CB 01 66          bit 4, (iy+1)
0x058D29  CA 42 1D 06          jp z, 0x061D42
0x058D2D  C9                   ret
```

### `0x058D2E..0x058D3A`

```text
0x058D2E  21 2E 00 00          ld hl, 0x00002E
0x058D32  CD 91 FF 07          call 0x07FF91
0x058D36  CD EA 46 08          call 0x0846EA
0x058D3A  C9                   ret
```

### `0x058D8E..0x058DA6`

```text
0x058D8E  CD 2E 8D 05          call 0x058D2E
0x058D92  D4 42 26 08          call nc, 0x082642
0x058D96  CD 7B FF 07          call 0x07FF7B
0x058D9A  CD 4F 38 08          call 0x08384F
0x058D9E  D4 7D 26 08          call nc, 0x08267D
0x058DA2  CD 5C 8B 05          call 0x058B5C
0x058DA6  C3 48 24 08          jp 0x082448
```

## Relevant external targets

### Early guard helpers

`0x058C65` begins by calling `0x0800A8`, which itself collapses to flag tests and returns:

```text
0x0800A8  FD CB 09 7E          bit 7, (iy+9)
0x0800AC  20 F8                jr nz, 0x0800A6
0x0800AE  CD 59 02 08          call 0x080259
0x0800B2  C8                   ret z
0x0800B3  FD CB 45 6E          bit 5, (iy+69)
0x0800B7  C8                   ret z
0x0800B8  FD CB 44 6E          bit 5, (iy+68)
0x0800BC  C9                   ret
```

That makes the entry pair:

```text
0x058C65  call 0x0800A8
0x058C69  ret nz
```

an immediate early-exit gate.

The second flag gate in the empty-enter path is:

```text
0x058C6E  call 0x0800B8
0x058C72  call nz, 0x0583EE
0x058C76  ...
0x058C82  ret
```

So regardless of whether `0x0583EE` runs, the `0x058C65` entry block ends in `ret`.

### `0x0583EE` also returns

```text
0x0583EE  CD 12 0C 09          call 0x090C12
0x0583F2  CD 3E F8 08          call 0x08F83E
0x0583F6  CD CF E5 09          call 0x09E5CF
0x0583FA  CD 34 84 05          call 0x058434
0x0583FE  CD 24 01 09          call 0x090124
0x058402  CD 94 E2 08          call 0x08E294
0x058406  FD CB 44 D6          set 2, (iy+68)
0x05840A  C9                   ret
```

No edge from this helper leads back to `0x058693`.

### Tail jumps from the deeper helper cluster

The strongest non-return exit in the local cluster is `0x058DA6`:

```text
0x058DA6  C3 48 24 08          jp 0x082448
```

That target immediately tail-jumps again:

```text
0x082448  3E 05                ld a, 0x05
0x08244A  18 CE                jr 0x08241A

0x08241A  CD 40 C9 04          call 0x04C940
0x08241E  E5                   push hl
0x08241F  CD D1 22 08          call 0x0822D1
0x082423  C1                   pop bc
0x082424  EB                   ex de, hl
0x082425  71                   ld (hl), c
0x082426  23                   inc hl
0x082427  70                   ld (hl), b
0x082428  2B                   dec hl
0x082429  EB                   ex de, hl
0x08242A  C9                   ret
```

The other unconditional exit is:

```text
0x058D29  CA 42 1D 06          jp z, 0x061D42
```

which also resolves into an unwind/return path:

```text
0x061D42  3E 0E                ld a, 0x0E
0x061D44  18 6C                jr 0x061DB2

0x061DB2  32 DF 08 D0          ld (0xD008DF), a
0x061DB6  CD B4 E1 03          call 0x03E1B4
0x061DBA  FD CB 4B BE          res 7, (iy+75)
0x061DBE  FD CB 12 96          res 2, (iy+18)
0x061DC2  FD CB 24 A6          res 4, (iy+36)
0x061DC6  FD CB 49 8E          res 1, (iy+73)
0x061DCA  ED 7B E0 08 D0       ld sp, (0xD008E0)
0x061DCF  F1                   pop af
0x061DD0  C9                   ret
```

Again, no `0x058693` rejoin appears.

## Reference common tail

For comparison, the ordinary ENTER common tail is:

```text
0x058693  97                   sub a
0x058694  32 8D 05 D0          ld (0xD0058D), a
0x058698  FD CB 0C F6          set 6, (iy+12)
0x05869C  FD CB 00 EE          set 5, (iy+0)
0x0586A0  CD 76 8C 05          call 0x058C76
0x0586A4  FB                   ei
0x0586A5  CD 61 29 08          call 0x082961
0x0586A9  CD 5E 21 09          call 0x09215E
0x0586AD  40 ED 53 8C 26       sis ld (0x00268C), de
0x0586B2  40 22 8E 26          sis ld (0x00268E), hl
0x0586B6  CD 02 29 08          call 0x082902
0x0586BA  3E 02                ld a, 0x02
0x0586BC  FD CB 34 66          bit 4, (iy+52)
0x0586C0  C4 B3 39 02          call nz, 0x0239B3
0x0586C4  FD CB 45 86          res 0, (iy+69)
0x0586C8  FD CB 45 CE          set 1, (iy+69)
0x0586CC  20 25                jr nz, 0x0586F3
0x0586CE  FD CB 49 B6          res 6, (iy+73)
0x0586D2  CD D1 1F 0A          call 0x0A1FD1
0x0586D6  FD CB 02 8E          res 1, (iy+2)
0x0586DA  FD CB 44 96          res 2, (iy+68)
0x0586DE  FB                   ei
0x0586DF  CD DD 27 0A          call 0x0A27DD
0x0586E3  CD 10 99 09          call 0x099910
```

`0x058C76` is a shared helper called by this tail, but the direction matters:

- common path: `0x058693 -> call 0x058C76 -> continue to ParseInp`
- empty-enter path: `0x058C65 -> ... -> fall through to 0x058C76 -> ret`

Sharing `0x058C76` does not mean the empty-enter path rejoins `0x058693`.

## Control-flow conclusion

`0x058C65` does **not** statically reach `0x058693`.

The decisive facts are:

1. The branch from the ENTER handler is `jp z, 0x058C65`, not `call 0x058C65`.
2. The top-level `0x058C65` block ends at `0x058C82  ret`.
3. No direct `jr` or `jp` in the `0x058C65` cluster targets `0x058693`.
4. The deeper exits at `0x058D29` and `0x058DA6` jump into generic dispatcher/unwind code (`0x061D42` and `0x082448`), not into the common tail.
5. The optional helper call at `0x058C72 -> 0x0583EE` also returns locally and does not branch to `0x058693`.

Therefore, on fresh boot with `numLastEntries=0`, the empty-history ENTER path bypasses the common tail and does **not** reach the `0x0586E3 -> call 0x099910` ParseInp handoff.

## Guards that prevent ParseInp on the empty-enter path

- `0x058C69  ret nz` after `call 0x0800A8`
- `0x058CB1  ret z`
- `0x058CD6  ret nz`
- `0x058CDB  ret`
- `0x058CE0  ret z`
- `0x058D03  ret nc`
- `0x058D18  ret`
- `0x058D2D  ret`
- `0x058D29  jp z, 0x061D42`
- `0x058DA6  jp 0x082448`

All visible exits are returns or jumps into non-parser dispatchers. None rejoin the ParseInp-bearing path at `0x058693`.
