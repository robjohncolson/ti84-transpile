# Phase 202f: LCD Reinit Map Around 0x005c2d

Generated: 2026-04-20

## Scope

- ROM slice inspected: `0x005b00..0x005d20`
- Prior context: [phase202c-lcd-init-report.md](./phase202c-lcd-init-report.md), [phase202e-upbase-writer-scan-report.md](./phase202e-upbase-writer-scan-report.md)
- `scripts/transpile-ti84-rom.mjs` was run before this analysis so `ROM.transpiled.js` was available for block and caller cross-reference.

## Routine Boundaries

| Region | Addresses | Evidence | Conclusion |
| --- | --- | --- | --- |
| Preceding routine | `0x005b96..0x005bb0` | Ends with `ret` at `0x005bb0`; known separate VRAM fill primitive from earlier work | Not part of the LCD reinit routine |
| LCD reinit entry | `0x005bb1` | First byte after that `ret`; direct references in `ROM.transpiled.js` include `call 0x005bb1` from `0x00190b` and `jp 0x005bb1` from `0x000384` | Start of the contiguous LCD reinit byte range |
| `0x005d00` LCD command block | `0x005d00..` | Reached internally from `0x005cf1` (`jr z, 0x005d0d`, fallthrough `0x005d00`) | Same routine, not a separate entry |
| Tail after Phase 202c window | `0x005f88 -> 0x006094..0x0060f6` | `0x005f88` is an unconditional `jp 0x006094`; the z80 tail finishes at `0x0060f6 ret` | The full z80 LCD reinit routine is larger than `0x005d00..0x005f88` |

### Boundary verdict

- The best routine boundary for the LCD reinit overlay is `0x005bb1..0x0060f6`.
- `0x005c2d` is not a standalone routine entry. It is an internal fallthrough block inside that larger routine.
- The `0x00` bytes at `0x005c2d..0x005c2f` are not alignment padding for the z80 overlay. They are live fallthrough bytes inside the block that leads to the store at `0x005c34`.

## Control Flow Analysis

### How execution reaches `0x005c2d`

No direct call or jump to `0x005c2d` was found. In the z80 overlay, control reaches it only by fallthrough:

`0x005bb1 -> 0x005bb6 -> 0x005bc2 -> 0x005bc6 -> 0x005bd1 -> 0x005bd9 -> 0x005be1 -> 0x005bea -> 0x005bf5 -> 0x005c0b -> 0x005c0f -> 0x005c13 -> 0x005c1c -> 0x005c24 -> 0x005c2d`

The important consequence is:

- `0x005c2d` is an internal setup block, not a dispatch target.
- The upbase write at `0x005c34` is part of the routine prologue before the `0x005d00+` LCD command stream.

### Flow around `0x005d00`

The bytes immediately before the known LCD command stream prove it is the same routine:

- `0x005cf1..0x005cfe` toggles ports `0x07` and `0x03`.
- `0x005cfe` branches to `0x005d0d` or falls through to `0x005d00`.
- `0x005d00..0x005f88` is therefore a mid-routine body, not a separately called helper.

### Tail beyond `0x005f88`

The earlier Phase 202c report stopped at `0x005f88`, but the routine does not end there:

- `0x005f88` is `jp 0x006094`
- `0x005e7c` also has an alternate branch to `0x005f8c`
- both paths converge into the `0x006094..0x0060f6` tail
- the first real routine terminator is `ret` at `0x0060f6`

## Relationship To The LCD Init Sequence At `0x005d00+`

`0x005c2d` is part of the same larger LCD init/reinit flow as the `0x005d00..0x005f88` command/data stream.

The structure is:

1. `0x005bb1..0x005c40`: preamble and register setup, including the `0x005c34` store.
2. `0x005c44..0x005cf0`: low-level MMIO and port sequencing.
3. `0x005d00..0x005f88`: the Phase 202c LCD command/data pairs that call `0x0060f7` / `0x0060fa`.
4. `0x005f8c..0x0060f6`: remaining LCD command/data tail and final polling/return logic.

So the answer to the main question is:

- `0x005c2d` is not a separate routine called independently.
- It is part of the same contiguous reinit byte range that later emits the known LCD controller init script.

## Mode Overlay Note

This byte range is mode-overloaded.

- In ADL mode, the same bytes decode as an MMIO setup routine that stores to `0xf800xx` addresses.
- In z80 mode, the same bytes decode as short-address stores like `ld (0x0010), hl`; with MBASE-based MMIO addressing, this is the pattern Phase 202e flagged as the upbase writer idiom.

That is why this area looks unusual:

- z80 decode shows several `ret m` / `ret nc` instructions inside what otherwise looks like a setup sequence
- those bytes are the high bytes of 24-bit ADL immediates in the alternate decode

The caller and block evidence still place the `0x005c2d` block inside the larger LCD init/reinit byte range. The upbase-writer interpretation specifically belongs to the z80 overlay.

## Transpiler Seed Audit

The generated block identifiers in `ROM.transpiled.js` omit `0x`, so searching for `block_0x005b` / `block_0x005c` returns nothing useful. The effective coverage check is against symbols/keys such as:

- `block_005bb1_z80`
- `block_005c2d_z80`
- JSON keys like `"005bb1:z80"`

Relevant discovered block starts in this window are already present, including:

- `0x005bb1`, `0x005bb6`, `0x005bc2`, `0x005bc6`
- `0x005bd1`, `0x005bd9`, `0x005be1`, `0x005bea`, `0x005bf5`
- `0x005c0b`, `0x005c0f`, `0x005c13`, `0x005c1c`, `0x005c24`, `0x005c2d`, `0x005c38`, `0x005c40`
- `0x005c44`, `0x005c58`, `0x005c59`, `0x005c5e`, `0x005c6b`, `0x005c6c`, `0x005c71`, `0x005c83`, `0x005c84`, `0x005c98`, `0x005c99`, `0x005cad`, `0x005cae`, `0x005cc7`, `0x005cc8`, `0x005cda`, `0x005cdb`, `0x005ceb`, `0x005cec`, `0x005cf1`
- `0x005d00`, `0x005d06`, `0x005d0d`, `0x005d10`, `0x005d18`, `0x005d26`, `0x005d34`, `0x005d42`, `0x005d43`, `0x005d53`, `0x005d54`

New transpiler seed addresses found in `0x005b00..0x005d20`: none.

## Full Disassembly Of `0x005b00..0x005d20` (z80 overlay)

```text
0x005b00  cb 48            bit 1, b
0x005b02  ca 16 5b         jp z, 0x005b16
0x005b05  00               nop
0x005b06  7b               ld a, e
0x005b07  cb 21            sla c
0x005b09  8a               adc a, d
0x005b0a  77               ld (hl), a
0x005b0b  23               inc hl
0x005b0c  77               ld (hl), a
0x005b0d  23               inc hl
0x005b0e  7b               ld a, e
0x005b0f  cb 21            sla c
0x005b11  8a               adc a, d
0x005b12  77               ld (hl), a
0x005b13  23               inc hl
0x005b14  77               ld (hl), a
0x005b15  23               inc hl
0x005b16  7b               ld a, e
0x005b17  cb 21            sla c
0x005b19  8a               adc a, d
0x005b1a  77               ld (hl), a
0x005b1b  23               inc hl
0x005b1c  77               ld (hl), a
0x005b1d  23               inc hl
0x005b1e  7b               ld a, e
0x005b1f  cb 21            sla c
0x005b21  8a               adc a, d
0x005b22  77               ld (hl), a
0x005b23  23               inc hl
0x005b24  77               ld (hl), a
0x005b25  23               inc hl
0x005b26  7b               ld a, e
0x005b27  cb 21            sla c
0x005b29  8a               adc a, d
0x005b2a  77               ld (hl), a
0x005b2b  23               inc hl
0x005b2c  77               ld (hl), a
0x005b2d  23               inc hl
0x005b2e  7b               ld a, e
0x005b2f  cb 21            sla c
0x005b31  8a               adc a, d
0x005b32  77               ld (hl), a
0x005b33  23               inc hl
0x005b34  77               ld (hl), a
0x005b35  23               inc hl
0x005b36  7b               ld a, e
0x005b37  cb 21            sla c
0x005b39  8a               adc a, d
0x005b3a  77               ld (hl), a
0x005b3b  23               inc hl
0x005b3c  77               ld (hl), a
0x005b3d  23               inc hl
0x005b3e  dd 7e 00         ld a, (ix+0)
0x005b41  dd 23            inc ix
0x005b43  fd cb 05 5e      bit 3, (iy+5)
0x005b47  28 02            jr z, 0x005b4b
0x005b49  ee fe            xor 0xfe
0x005b4b  4f               ld c, a
0x005b4c  11 ff 00         ld de, 0x0000ff
0x005b4f  00               nop
0x005b50  7b               ld a, e
0x005b51  cb 21            sla c
0x005b53  8a               adc a, d
0x005b54  77               ld (hl), a
0x005b55  23               inc hl
0x005b56  77               ld (hl), a
0x005b57  23               inc hl
0x005b58  7b               ld a, e
0x005b59  cb 21            sla c
0x005b5b  8a               adc a, d
0x005b5c  77               ld (hl), a
0x005b5d  23               inc hl
0x005b5e  77               ld (hl), a
0x005b5f  23               inc hl
0x005b60  7b               ld a, e
0x005b61  cb 21            sla c
0x005b63  8a               adc a, d
0x005b64  77               ld (hl), a
0x005b65  23               inc hl
0x005b66  77               ld (hl), a
0x005b67  23               inc hl
0x005b68  7b               ld a, e
0x005b69  cb 21            sla c
0x005b6b  8a               adc a, d
0x005b6c  77               ld (hl), a
0x005b6d  23               inc hl
0x005b6e  77               ld (hl), a
0x005b6f  23               inc hl
0x005b70  7b               ld a, e
0x005b71  cb 21            sla c
0x005b73  8a               adc a, d
0x005b74  77               ld (hl), a
0x005b75  23               inc hl
0x005b76  77               ld (hl), a
0x005b77  23               inc hl
0x005b78  7b               ld a, e
0x005b79  cb 21            sla c
0x005b7b  8a               adc a, d
0x005b7c  77               ld (hl), a
0x005b7d  23               inc hl
0x005b7e  77               ld (hl), a
0x005b7f  23               inc hl
0x005b80  7b               ld a, e
0x005b81  cb 21            sla c
0x005b83  8a               adc a, d
0x005b84  77               ld (hl), a
0x005b85  23               inc hl
0x005b86  77               ld (hl), a
0x005b87  c1               pop bc
0x005b88  21 a0 05         ld hl, 0x0005a0
0x005b8b  d0               ret nc
0x005b8c  34               inc (hl)
0x005b8d  05               dec b
0x005b8e  c2 b6 5a         jp nz, 0x005ab6
0x005b91  00               nop
0x005b92  c3 19 5a         jp 0x005a19
0x005b95  00               nop
0x005b96  21 00 00         ld hl, 0x000000
0x005b99  d4 36 ff         call nc, 0x00ff36
0x005b9c  11 01 00         ld de, 0x000001
0x005b9f  d4 01 ff         call nc, 0x00ff01
0x005ba2  57               ld d, a
0x005ba3  02               ld (bc), a
0x005ba4  ed b0            ldir
0x005ba6  e5               push hl
0x005ba7  21 00 00         ld hl, 0x000000
0x005baa  00               nop
0x005bab  22 95 05         ld (0x000595), hl
0x005bae  d0               ret nc
0x005baf  e1               pop hl
0x005bb0  c9               ret
0x005bb1  fd 21 80 00      ld iy, 0x000080
0x005bb5  d0               ret nc
0x005bb6  fd cb 42 be      res 7, (iy+66)
0x005bba  ed 38 03         in0 a, (0x03)
0x005bbd  cb 67            bit 4, a
0x005bbf  ca 44 5c         jp z, 0x005c44
0x005bc2  00               nop
0x005bc3  cd de 58         call 0x0058de
0x005bc6  01 28 7b         ld bc, 0x007b28
0x005bc9  21 0b 00         ld hl, 0x00000b
0x005bcc  02               ld (bc), a
0x005bcd  22 04 00         ld (0x000004), hl
0x005bd0  f8               ret m
0x005bd1  21 28 18         ld hl, 0x001828
0x005bd4  00               nop
0x005bd5  22 00 00         ld (0x000000), hl
0x005bd8  f8               ret m
0x005bd9  21 0c 00         ld hl, 0x00000c
0x005bdc  00               nop
0x005bdd  22 08 00         ld (0x000008), hl
0x005be0  f8               ret m
0x005be1  00               nop
0x005be2  21 40 00         ld hl, 0x000040
0x005be5  00               nop
0x005be6  22 08 00         ld (0x000008), hl
0x005be9  f8               ret m
0x005bea  ed 38 0a         in0 a, (0x0a)
0x005bed  cb d7            set 2, a
0x005bef  ed 39 0a         out0 (0x0a), a
0x005bf2  cd ec 5a         call 0x005aec
0x005bf5  01 ed 38         ld bc, 0x0038ed
0x005bf8  07               rlca
0x005bf9  cb e7            set 4, a
0x005bfb  ed 39 07         out0 (0x07), a
0x005bfe  3a 0c 00         ld a, (0x00000c)
0x005c01  f9               ld sp, hl
0x005c02  cb b7            res 6, a
0x005c04  32 0c 00         ld (0x00000c), a
0x005c07  f9               ld sp, hl
0x005c08  cd c2 61         call 0x0061c2
0x005c0b  00               nop
0x005c0c  cd c2 61         call 0x0061c2
0x005c0f  00               nop
0x005c10  cd c2 61         call 0x0061c2
0x005c13  00               nop
0x005c14  21 2b 18         ld hl, 0x00182b
0x005c17  00               nop
0x005c18  22 00 00         ld (0x000000), hl
0x005c1b  f8               ret m
0x005c1c  21 0c 00         ld hl, 0x00000c
0x005c1f  00               nop
0x005c20  22 08 00         ld (0x000008), hl
0x005c23  f8               ret m
0x005c24  00               nop
0x005c25  21 40 00         ld hl, 0x000040
0x005c28  00               nop
0x005c29  22 08 00         ld (0x000008), hl
0x005c2c  f8               ret m
0x005c2d  00               nop
0x005c2e  00               nop
0x005c2f  00               nop
0x005c30  21 21 00         ld hl, 0x000021
0x005c33  00               nop
0x005c34  22 10 00         ld (0x000010), hl
0x005c37  f8               ret m
0x005c38  21 00 01         ld hl, 0x000100
0x005c3b  00               nop
0x005c3c  22 08 00         ld (0x000008), hl
0x005c3f  f8               ret m
0x005c40  3a 14 00         ld a, (0x000014)
0x005c43  f8               ret m
0x005c44  3e 03            ld a, 0x03
0x005c46  ed 39 00         out0 (0x00), a
0x005c49  40 01 0c 50      sis ld bc, 0x00500c
0x005c4d  ed 78            in a, (c)
0x005c4f  cb e7            set 4, a
0x005c51  ed 79            out (c), a
0x005c53  78               ld a, b
0x005c54  fe 50            cp 0x50
0x005c56  28 01            jr z, 0x005c59
0x005c58  cf               rst 0x08
0x005c59  79               ld a, c
0x005c5a  fe 0c            cp 0x0c
0x005c5c  20 fa            jr nz, 0x005c58
0x005c5e  0e 04            ld c, 0x04
0x005c60  ed 78            in a, (c)
0x005c62  cb e7            set 4, a
0x005c64  ed 79            out (c), a
0x005c66  78               ld a, b
0x005c67  fe 50            cp 0x50
0x005c69  28 01            jr z, 0x005c6c
0x005c6b  cf               rst 0x08
0x005c6c  79               ld a, c
0x005c6d  fe 04            cp 0x04
0x005c6f  20 fa            jr nz, 0x005c6b
0x005c71  40 01 00 40      sis ld bc, 0x004000
0x005c75  3e 38            ld a, 0x38
0x005c77  ed 79            out (c), a
0x005c79  0c               inc c
0x005c7a  3e 03            ld a, 0x03
0x005c7c  ed 79            out (c), a
0x005c7e  78               ld a, b
0x005c7f  fe 40            cp 0x40
0x005c81  28 01            jr z, 0x005c84
0x005c83  cf               rst 0x08
0x005c84  0c               inc c
0x005c85  3e 0a            ld a, 0x0a
0x005c87  ed 79            out (c), a
0x005c89  0c               inc c
0x005c8a  3e 1f            ld a, 0x1f
0x005c8c  ed 79            out (c), a
0x005c8e  0c               inc c
0x005c8f  3e 3f            ld a, 0x3f
0x005c91  ed 79            out (c), a
0x005c93  78               ld a, b
0x005c94  fe 40            cp 0x40
0x005c96  28 01            jr z, 0x005c99
0x005c98  cf               rst 0x08
0x005c99  0c               inc c
0x005c9a  3e 09            ld a, 0x09
0x005c9c  ed 79            out (c), a
0x005c9e  0c               inc c
0x005c9f  3e 02            ld a, 0x02
0x005ca1  ed 79            out (c), a
0x005ca3  0c               inc c
0x005ca4  3e 04            ld a, 0x04
0x005ca6  ed 79            out (c), a
0x005ca8  78               ld a, b
0x005ca9  fe 40            cp 0x40
0x005cab  28 01            jr z, 0x005cae
0x005cad  cf               rst 0x08
0x005cae  0c               inc c
0x005caf  3e 02            ld a, 0x02
0x005cb1  ed 79            out (c), a
0x005cb3  0c               inc c
0x005cb4  3e 78            ld a, 0x78
0x005cb6  ed 79            out (c), a
0x005cb8  0c               inc c
0x005cb9  3e ef            ld a, 0xef
0x005cbb  ed 79            out (c), a
0x005cbd  0c               inc c
0x005cbe  3e 00            ld a, 0x00
0x005cc0  ed 79            out (c), a
0x005cc2  78               ld a, b
0x005cc3  fe 40            cp 0x40
0x005cc5  28 01            jr z, 0x005cc8
0x005cc7  cf               rst 0x08
0x005cc8  0e 10            ld c, 0x10
0x005cca  af               xor a
0x005ccb  ed 79            out (c), a
0x005ccd  0c               inc c
0x005cce  ed 79            out (c), a
0x005cd0  0c               inc c
0x005cd1  3e d4            ld a, 0xd4
0x005cd3  ed 79            out (c), a
0x005cd5  78               ld a, b
0x005cd6  fe 40            cp 0x40
0x005cd8  28 01            jr z, 0x005cdb
0x005cda  cf               rst 0x08
0x005cdb  0e 19            ld c, 0x19
0x005cdd  3e 09            ld a, 0x09
0x005cdf  ed 79            out (c), a
0x005ce1  0d               dec c
0x005ce2  3e 2d            ld a, 0x2d
0x005ce4  ed 79            out (c), a
0x005ce6  78               ld a, b
0x005ce7  fe 40            cp 0x40
0x005ce9  28 01            jr z, 0x005cec
0x005ceb  cf               rst 0x08
0x005cec  79               ld a, c
0x005ced  fe 18            cp 0x18
0x005cef  20 fa            jr nz, 0x005ceb
0x005cf1  ed 38 07         in0 a, (0x07)
0x005cf4  cb d7            set 2, a
0x005cf6  ed 39 07         out0 (0x07), a
0x005cf9  ed 38 03         in0 a, (0x03)
0x005cfc  cb 67            bit 4, a
0x005cfe  28 0d            jr z, 0x005d0d
0x005d00  fd cb 42 7e      bit 7, (iy+66)
0x005d04  28 07            jr z, 0x005d0d
0x005d06  ed 38 09         in0 a, (0x09)
0x005d09  e6 ef            and 0xef
0x005d0b  18 03            jr 0x005d10
0x005d0d  ed 38 09         in0 a, (0x09)
0x005d10  cb d7            set 2, a
0x005d12  ed 39 09         out0 (0x09), a
0x005d15  cd e3 61         call 0x0061e3
0x005d18  00               nop
0x005d19  ed 38 09         in0 a, (0x09)
0x005d1c  cb 97            res 2, a
0x005d1e  ed 39 09         out0 (0x09), a
```

## Short ADL Overlay Snippet

The same bytes decode differently in ADL mode. This is the overlap that makes `0x005c2d` appear as a z80 short store in one interpretation and a `0xf80010` MMIO store in the other:

```text
0x005c14  21 2b 18 00      ld hl, 0x00182b
0x005c18  22 00 00 f8      ld (0xf80000), hl
0x005c1c  21 0c 00 00      ld hl, 0x00000c
0x005c20  22 08 00 f8      ld (0xf80008), hl
0x005c24  00               nop
0x005c25  21 40 00 00      ld hl, 0x000040
0x005c29  22 08 00 f8      ld (0xf80008), hl
0x005c2d  00               nop
0x005c2e  00               nop
0x005c2f  00               nop
0x005c30  21 21 00 00      ld hl, 0x000021
0x005c34  22 10 00 f8      ld (0xf80010), hl
0x005c38  21 00 01 00      ld hl, 0x000100
0x005c3c  22 08 00 f8      ld (0xf80008), hl
0x005c40  3a 14 00 f8      ld a, (0xf80014)
```

That overlap is why the safest conclusion is:

- the bytes around `0x005c2d` are definitely part of the larger LCD reinit region
- the upbase-writer interpretation is the z80 overlay of that region
- the known `0x005d00+` LCD init table is a later body inside the same contiguous flow
