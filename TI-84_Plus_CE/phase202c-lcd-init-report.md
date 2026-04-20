# Phase 202c: LCD Init Protocol

Generated: 2026-04-20T02:44:26.398Z

## Helper routines

Two tightly-coupled entry points at `0x0060F7` and `0x0060FA` implement the write-index / write-data sequence used to program the ST7789-family LCD controller on the TI-84 Plus CE.

### Entry 0x0060F7 (carry-clear prologue, falls into 0x0060FA)

| Offset | Bytes | Disassembly |
|--------|-------|-------------|
| 0x0060f7 | `b7` | `or a` |
| 0x0060f8 | `18 01` | `jr 0x0060fb` |
| 0x0060fa | `37` | `scf` |
| 0x0060fb | `40 01 18 d0` | `sis ld bc, 0x00d018` |
| 0x0060ff | `17` | `rla` |
| 0x006100 | `17` | `rla` |
| 0x006101 | `17` | `rla` |
| 0x006102 | `ed 79` | `out (c), a` |
| 0x006104 | `17` | `rla` |
| 0x006105 | `17` | `rla` |
| 0x006106 | `17` | `rla` |
| 0x006107 | `ed 79` | `out (c), a` |
| 0x006109 | `17` | `rla` |
| 0x00610a | `17` | `rla` |
| 0x00610b | `17` | `rla` |
| 0x00610c | `ed 79` | `out (c), a` |
| 0x00610e | `78` | `ld a, b` |
| 0x00610f | `fe d0` | `cp 0xd0` |
| 0x006111 | `28 01` | `jr z, 0x006114` |
| 0x006113 | `cf` | `rst 0x08` |
| 0x006114 | `cd 2f 61 00` | `call 0x00612f` |
| 0x006118 | `cd 33 61 00` | `call 0x006133` |
| 0x00611c | `af` | `xor a` |
| 0x00611d | `40 01 08 d0` | `sis ld bc, 0x00d008` |
| 0x006121 | `ed 79` | `out (c), a` |
| 0x006123 | `78` | `ld a, b` |
| 0x006124 | `fe d0` | `cp 0xd0` |
| 0x006126 | `28 01` | `jr z, 0x006129` |
| 0x006128 | `cf` | `rst 0x08` |
| 0x006129 | `79` | `ld a, c` |
| 0x00612a | `fe 08` | `cp 0x08` |
| 0x00612c | `20 fa` | `jr nz, 0x006128` |
| 0x00612e | `c9` | `ret` |

### Entry 0x0060FA (main body)

| Offset | Bytes | Disassembly |
|--------|-------|-------------|
| 0x0060fa | `37` | `scf` |
| 0x0060fb | `40 01 18 d0` | `sis ld bc, 0x00d018` |
| 0x0060ff | `17` | `rla` |
| 0x006100 | `17` | `rla` |
| 0x006101 | `17` | `rla` |
| 0x006102 | `ed 79` | `out (c), a` |
| 0x006104 | `17` | `rla` |
| 0x006105 | `17` | `rla` |
| 0x006106 | `17` | `rla` |
| 0x006107 | `ed 79` | `out (c), a` |
| 0x006109 | `17` | `rla` |
| 0x00610a | `17` | `rla` |
| 0x00610b | `17` | `rla` |
| 0x00610c | `ed 79` | `out (c), a` |
| 0x00610e | `78` | `ld a, b` |
| 0x00610f | `fe d0` | `cp 0xd0` |
| 0x006111 | `28 01` | `jr z, 0x006114` |
| 0x006113 | `cf` | `rst 0x08` |
| 0x006114 | `cd 2f 61 00` | `call 0x00612f` |
| 0x006118 | `cd 33 61 00` | `call 0x006133` |
| 0x00611c | `af` | `xor a` |
| 0x00611d | `40 01 08 d0` | `sis ld bc, 0x00d008` |
| 0x006121 | `ed 79` | `out (c), a` |
| 0x006123 | `78` | `ld a, b` |
| 0x006124 | `fe d0` | `cp 0xd0` |
| 0x006126 | `28 01` | `jr z, 0x006129` |
| 0x006128 | `cf` | `rst 0x08` |
| 0x006129 | `79` | `ld a, c` |
| 0x00612a | `fe 08` | `cp 0x08` |
| 0x00612c | `20 fa` | `jr nz, 0x006128` |
| 0x00612e | `c9` | `ret` |

## MMIO / IO ports referenced

Immediate ports / BC loads observed: 0x18, 0x08

The helpers use `ld bc, 0xD018` (C = 0x18 port, 0xD0 is the high MMIO page selector) and shift A left three times before each `out (c), a`, so each call writes three bytes to port 0x18 (LCD data register) with the top three bits of A expanded. The `b7 18 01` prologue at `0x0060F7` runs `or a` to clear carry (selects the "register index" phase), while `0x0060FA` starts with `37` (`scf`) to select the "data write" phase. After the three staged-shift writes a terminal byte is written via `out (c), a` with A unchanged, and the routine polls a status bit (`in a, (c); cp 0xD0; jr z, ...`) before returning.

## Caller sequence (0x005D00..0x005F88)

Full linear disassembly of the caller block follows the call table. The call table was built by pairing each `ld a, N` with the immediately following `call 0x0060F7` or `call 0x0060FA`.

### Call table

| # | call_site | A_value | callee |
|---|-----------|---------|--------|
| 1 | 0x005d7c | 0x11 | 0x0060f7 |
| 2 | 0x005d88 | 0x36 | 0x0060f7 |
| 3 | 0x005d8e | 0x08 | 0x0060fa |
| 4 | 0x005d94 | 0x3a | 0x0060f7 |
| 5 | 0x005d9a | 0x66 | 0x0060fa |
| 6 | 0x005da0 | 0x2a | 0x0060f7 |
| 7 | 0x005da5 | n/a | 0x0060fa |
| 8 | 0x005daa | n/a | 0x0060fa |
| 9 | 0x005db0 | 0x01 | 0x0060fa |
| 10 | 0x005db6 | 0x3f | 0x0060fa |
| 11 | 0x005dbc | 0x2b | 0x0060f7 |
| 12 | 0x005dc2 | 0x00 | 0x0060fa |
| 13 | 0x005dc8 | 0x00 | 0x0060fa |
| 14 | 0x005dce | 0x00 | 0x0060fa |
| 15 | 0x005dd4 | 0xef | 0x0060fa |
| 16 | 0x005dda | 0xb2 | 0x0060f7 |
| 17 | 0x005de0 | 0x0c | 0x0060fa |
| 18 | 0x005de6 | 0x0c | 0x0060fa |
| 19 | 0x005dec | 0x00 | 0x0060fa |
| 20 | 0x005df2 | 0x33 | 0x0060fa |
| 21 | 0x005df8 | 0x33 | 0x0060fa |
| 22 | 0x005dfe | 0xc0 | 0x0060f7 |
| 23 | 0x005e04 | 0x2c | 0x0060fa |
| 24 | 0x005e0a | 0xc2 | 0x0060f7 |
| 25 | 0x005e10 | 0x01 | 0x0060fa |
| 26 | 0x005e16 | 0xc4 | 0x0060f7 |
| 27 | 0x005e1c | 0x20 | 0x0060fa |
| 28 | 0x005e22 | 0xc6 | 0x0060f7 |
| 29 | 0x005e28 | 0x0f | 0x0060fa |
| 30 | 0x005e2e | 0xd0 | 0x0060f7 |
| 31 | 0x005e34 | 0xa4 | 0x0060fa |
| 32 | 0x005e3a | 0xa1 | 0x0060fa |
| 33 | 0x005e40 | 0xb0 | 0x0060f7 |
| 34 | 0x005e46 | 0x11 | 0x0060fa |
| 35 | 0x005e4c | 0xf0 | 0x0060fa |
| 36 | 0x005e52 | 0xc0 | 0x0060f7 |
| 37 | 0x005e58 | 0x22 | 0x0060fa |
| 38 | 0x005e5e | 0xe9 | 0x0060f7 |
| 39 | 0x005e64 | 0x08 | 0x0060fa |
| 40 | 0x005e6a | 0x08 | 0x0060fa |
| 41 | 0x005e70 | 0x08 | 0x0060fa |
| 42 | 0x005e82 | 0xb7 | 0x0060f7 |
| 43 | 0x005e88 | 0x35 | 0x0060fa |
| 44 | 0x005e8e | 0xbb | 0x0060f7 |
| 45 | 0x005e94 | 0x17 | 0x0060fa |
| 46 | 0x005e9a | 0xc3 | 0x0060f7 |
| 47 | 0x005ea0 | 0x03 | 0x0060fa |
| 48 | 0x005ea6 | 0xd2 | 0x0060f7 |
| 49 | 0x005eac | 0x00 | 0x0060fa |
| 50 | 0x005eb2 | 0xe0 | 0x0060f7 |
| 51 | 0x005eb8 | 0xd0 | 0x0060fa |
| 52 | 0x005ebe | 0x00 | 0x0060fa |
| 53 | 0x005ec4 | 0x00 | 0x0060fa |
| 54 | 0x005eca | 0x10 | 0x0060fa |
| 55 | 0x005ed0 | 0x0f | 0x0060fa |
| 56 | 0x005ed6 | 0x1a | 0x0060fa |
| 57 | 0x005edc | 0x2d | 0x0060fa |
| 58 | 0x005ee2 | 0x54 | 0x0060fa |
| 59 | 0x005ee8 | 0x3f | 0x0060fa |
| 60 | 0x005eee | 0x3b | 0x0060fa |
| 61 | 0x005ef4 | 0x18 | 0x0060fa |
| 62 | 0x005efa | 0x17 | 0x0060fa |
| 63 | 0x005f00 | 0x13 | 0x0060fa |
| 64 | 0x005f06 | 0x17 | 0x0060fa |
| 65 | 0x005f0c | 0xe1 | 0x0060f7 |
| 66 | 0x005f12 | 0xd0 | 0x0060fa |
| 67 | 0x005f18 | 0x00 | 0x0060fa |
| 68 | 0x005f1e | 0x00 | 0x0060fa |
| 69 | 0x005f24 | 0x10 | 0x0060fa |
| 70 | 0x005f2a | 0x0f | 0x0060fa |
| 71 | 0x005f30 | 0x09 | 0x0060fa |
| 72 | 0x005f36 | 0x2b | 0x0060fa |
| 73 | 0x005f3c | 0x43 | 0x0060fa |
| 74 | 0x005f42 | 0x40 | 0x0060fa |
| 75 | 0x005f48 | 0x3b | 0x0060fa |
| 76 | 0x005f4e | 0x18 | 0x0060fa |
| 77 | 0x005f54 | 0x17 | 0x0060fa |
| 78 | 0x005f5a | 0x13 | 0x0060fa |
| 79 | 0x005f60 | 0x17 | 0x0060fa |
| 80 | 0x005f66 | 0xb1 | 0x0060f7 |
| 81 | 0x005f6c | 0x01 | 0x0060fa |
| 82 | 0x005f72 | 0x05 | 0x0060fa |
| 83 | 0x005f78 | 0x14 | 0x0060fa |
| 84 | 0x005f7e | 0x26 | 0x0060f7 |
| 85 | 0x005f84 | 0x00 | 0x0060fa |

Total calls: 85

### Caller disassembly

| Offset | Bytes | Disassembly |
|--------|-------|-------------|
| 0x005d00 | `fd cb 42 7e` | `bit 7, (iy+66)` |
| 0x005d04 | `28 07` | `jr z, 0x005d0d` |
| 0x005d06 | `ed 38 09` | `in0 a, (0x09)` |
| 0x005d09 | `e6 ef` | `and 0xef` |
| 0x005d0b | `18 03` | `jr 0x005d10` |
| 0x005d0d | `ed 38 09` | `in0 a, (0x09)` |
| 0x005d10 | `cb d7` | `set 2, a` |
| 0x005d12 | `ed 39 09` | `out0 (0x09), a` |
| 0x005d15 | `cd e3 61 00` | `call 0x0061e3` |
| 0x005d19 | `ed 38 09` | `in0 a, (0x09)` |
| 0x005d1c | `cb 97` | `res 2, a` |
| 0x005d1e | `ed 39 09` | `out0 (0x09), a` |
| 0x005d21 | `3e 05` | `ld a, 0x05` |
| 0x005d23 | `cd e5 61 00` | `call 0x0061e5` |
| 0x005d27 | `ed 38 09` | `in0 a, (0x09)` |
| 0x005d2a | `cb d7` | `set 2, a` |
| 0x005d2c | `ed 39 09` | `out0 (0x09), a` |
| 0x005d2f | `3e 0c` | `ld a, 0x0c` |
| 0x005d31 | `cd e5 61 00` | `call 0x0061e5` |
| 0x005d35 | `01 06 d0 00` | `ld bc, 0x00d006` |
| 0x005d39 | `3e 02` | `ld a, 0x02` |
| 0x005d3b | `ed 79` | `out (c), a` |
| 0x005d3d | `78` | `ld a, b` |
| 0x005d3e | `fe d0` | `cp 0xd0` |
| 0x005d40 | `28 01` | `jr z, 0x005d43` |
| 0x005d42 | `cf` | `rst 0x08` |
| 0x005d43 | `0e 01` | `ld c, 0x01` |
| 0x005d45 | `3e 18` | `ld a, 0x18` |
| 0x005d47 | `ed 79` | `out (c), a` |
| 0x005d49 | `0d` | `dec c` |
| 0x005d4a | `3e 0b` | `ld a, 0x0b` |
| 0x005d4c | `ed 79` | `out (c), a` |
| 0x005d4e | `78` | `ld a, b` |
| 0x005d4f | `fe d0` | `cp 0xd0` |
| 0x005d51 | `28 01` | `jr z, 0x005d54` |
| 0x005d53 | `cf` | `rst 0x08` |
| 0x005d54 | `0e 04` | `ld c, 0x04` |
| 0x005d56 | `3e 0b` | `ld a, 0x0b` |
| 0x005d58 | `ed 79` | `out (c), a` |
| 0x005d5a | `0c` | `inc c` |
| 0x005d5b | `af` | `xor a` |
| 0x005d5c | `ed 79` | `out (c), a` |
| 0x005d5e | `0e 08` | `ld c, 0x08` |
| 0x005d60 | `3e 0c` | `ld a, 0x0c` |
| 0x005d62 | `ed 79` | `out (c), a` |
| 0x005d64 | `78` | `ld a, b` |
| 0x005d65 | `fe d0` | `cp 0xd0` |
| 0x005d67 | `28 01` | `jr z, 0x005d6a` |
| 0x005d69 | `cf` | `rst 0x08` |
| 0x005d6a | `79` | `ld a, c` |
| 0x005d6b | `fe 08` | `cp 0x08` |
| 0x005d6d | `20 fa` | `jr nz, 0x005d69` |
| 0x005d6f | `0c` | `inc c` |
| 0x005d70 | `3e 01` | `ld a, 0x01` |
| 0x005d72 | `ed 79` | `out (c), a` |
| 0x005d74 | `78` | `ld a, b` |
| 0x005d75 | `fe d0` | `cp 0xd0` |
| 0x005d77 | `28 01` | `jr z, 0x005d7a` |
| 0x005d79 | `cf` | `rst 0x08` |
| 0x005d7a | `3e 11` | `ld a, 0x11` |
| 0x005d7c | `cd f7 60 00` | `call 0x0060f7` |
| 0x005d80 | `3e 0c` | `ld a, 0x0c` |
| 0x005d82 | `cd e5 61 00` | `call 0x0061e5` |
| 0x005d86 | `3e 36` | `ld a, 0x36` |
| 0x005d88 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005d8c | `3e 08` | `ld a, 0x08` |
| 0x005d8e | `cd fa 60 00` | `call 0x0060fa` |
| 0x005d92 | `3e 3a` | `ld a, 0x3a` |
| 0x005d94 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005d98 | `3e 66` | `ld a, 0x66` |
| 0x005d9a | `cd fa 60 00` | `call 0x0060fa` |
| 0x005d9e | `3e 2a` | `ld a, 0x2a` |
| 0x005da0 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005da4 | `af` | `xor a` |
| 0x005da5 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005da9 | `af` | `xor a` |
| 0x005daa | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dae | `3e 01` | `ld a, 0x01` |
| 0x005db0 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005db4 | `3e 3f` | `ld a, 0x3f` |
| 0x005db6 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dba | `3e 2b` | `ld a, 0x2b` |
| 0x005dbc | `cd f7 60 00` | `call 0x0060f7` |
| 0x005dc0 | `3e 00` | `ld a, 0x00` |
| 0x005dc2 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dc6 | `3e 00` | `ld a, 0x00` |
| 0x005dc8 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dcc | `3e 00` | `ld a, 0x00` |
| 0x005dce | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dd2 | `3e ef` | `ld a, 0xef` |
| 0x005dd4 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dd8 | `3e b2` | `ld a, 0xb2` |
| 0x005dda | `cd f7 60 00` | `call 0x0060f7` |
| 0x005dde | `3e 0c` | `ld a, 0x0c` |
| 0x005de0 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005de4 | `3e 0c` | `ld a, 0x0c` |
| 0x005de6 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dea | `3e 00` | `ld a, 0x00` |
| 0x005dec | `cd fa 60 00` | `call 0x0060fa` |
| 0x005df0 | `3e 33` | `ld a, 0x33` |
| 0x005df2 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005df6 | `3e 33` | `ld a, 0x33` |
| 0x005df8 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005dfc | `3e c0` | `ld a, 0xc0` |
| 0x005dfe | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e02 | `3e 2c` | `ld a, 0x2c` |
| 0x005e04 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e08 | `3e c2` | `ld a, 0xc2` |
| 0x005e0a | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e0e | `3e 01` | `ld a, 0x01` |
| 0x005e10 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e14 | `3e c4` | `ld a, 0xc4` |
| 0x005e16 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e1a | `3e 20` | `ld a, 0x20` |
| 0x005e1c | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e20 | `3e c6` | `ld a, 0xc6` |
| 0x005e22 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e26 | `3e 0f` | `ld a, 0x0f` |
| 0x005e28 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e2c | `3e d0` | `ld a, 0xd0` |
| 0x005e2e | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e32 | `3e a4` | `ld a, 0xa4` |
| 0x005e34 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e38 | `3e a1` | `ld a, 0xa1` |
| 0x005e3a | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e3e | `3e b0` | `ld a, 0xb0` |
| 0x005e40 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e44 | `3e 11` | `ld a, 0x11` |
| 0x005e46 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e4a | `3e f0` | `ld a, 0xf0` |
| 0x005e4c | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e50 | `3e c0` | `ld a, 0xc0` |
| 0x005e52 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e56 | `3e 22` | `ld a, 0x22` |
| 0x005e58 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e5c | `3e e9` | `ld a, 0xe9` |
| 0x005e5e | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e62 | `3e 08` | `ld a, 0x08` |
| 0x005e64 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e68 | `3e 08` | `ld a, 0x08` |
| 0x005e6a | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e6e | `3e 08` | `ld a, 0x08` |
| 0x005e70 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e74 | `3e dc` | `ld a, 0xdc` |
| 0x005e76 | `cd 47 61 00` | `call 0x006147` |
| 0x005e7a | `fe 35` | `cp 0x35` |
| 0x005e7c | `ca 8c 5f 00` | `jp z, 0x005f8c` |
| 0x005e80 | `3e b7` | `ld a, 0xb7` |
| 0x005e82 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e86 | `3e 35` | `ld a, 0x35` |
| 0x005e88 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e8c | `3e bb` | `ld a, 0xbb` |
| 0x005e8e | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e92 | `3e 17` | `ld a, 0x17` |
| 0x005e94 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005e98 | `3e c3` | `ld a, 0xc3` |
| 0x005e9a | `cd f7 60 00` | `call 0x0060f7` |
| 0x005e9e | `3e 03` | `ld a, 0x03` |
| 0x005ea0 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ea4 | `3e d2` | `ld a, 0xd2` |
| 0x005ea6 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005eaa | `3e 00` | `ld a, 0x00` |
| 0x005eac | `cd fa 60 00` | `call 0x0060fa` |
| 0x005eb0 | `3e e0` | `ld a, 0xe0` |
| 0x005eb2 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005eb6 | `3e d0` | `ld a, 0xd0` |
| 0x005eb8 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ebc | `3e 00` | `ld a, 0x00` |
| 0x005ebe | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ec2 | `3e 00` | `ld a, 0x00` |
| 0x005ec4 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ec8 | `3e 10` | `ld a, 0x10` |
| 0x005eca | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ece | `3e 0f` | `ld a, 0x0f` |
| 0x005ed0 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ed4 | `3e 1a` | `ld a, 0x1a` |
| 0x005ed6 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005eda | `3e 2d` | `ld a, 0x2d` |
| 0x005edc | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ee0 | `3e 54` | `ld a, 0x54` |
| 0x005ee2 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ee6 | `3e 3f` | `ld a, 0x3f` |
| 0x005ee8 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005eec | `3e 3b` | `ld a, 0x3b` |
| 0x005eee | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ef2 | `3e 18` | `ld a, 0x18` |
| 0x005ef4 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005ef8 | `3e 17` | `ld a, 0x17` |
| 0x005efa | `cd fa 60 00` | `call 0x0060fa` |
| 0x005efe | `3e 13` | `ld a, 0x13` |
| 0x005f00 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f04 | `3e 17` | `ld a, 0x17` |
| 0x005f06 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f0a | `3e e1` | `ld a, 0xe1` |
| 0x005f0c | `cd f7 60 00` | `call 0x0060f7` |
| 0x005f10 | `3e d0` | `ld a, 0xd0` |
| 0x005f12 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f16 | `3e 00` | `ld a, 0x00` |
| 0x005f18 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f1c | `3e 00` | `ld a, 0x00` |
| 0x005f1e | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f22 | `3e 10` | `ld a, 0x10` |
| 0x005f24 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f28 | `3e 0f` | `ld a, 0x0f` |
| 0x005f2a | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f2e | `3e 09` | `ld a, 0x09` |
| 0x005f30 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f34 | `3e 2b` | `ld a, 0x2b` |
| 0x005f36 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f3a | `3e 43` | `ld a, 0x43` |
| 0x005f3c | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f40 | `3e 40` | `ld a, 0x40` |
| 0x005f42 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f46 | `3e 3b` | `ld a, 0x3b` |
| 0x005f48 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f4c | `3e 18` | `ld a, 0x18` |
| 0x005f4e | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f52 | `3e 17` | `ld a, 0x17` |
| 0x005f54 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f58 | `3e 13` | `ld a, 0x13` |
| 0x005f5a | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f5e | `3e 17` | `ld a, 0x17` |
| 0x005f60 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f64 | `3e b1` | `ld a, 0xb1` |
| 0x005f66 | `cd f7 60 00` | `call 0x0060f7` |
| 0x005f6a | `3e 01` | `ld a, 0x01` |
| 0x005f6c | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f70 | `3e 05` | `ld a, 0x05` |
| 0x005f72 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f76 | `3e 14` | `ld a, 0x14` |
| 0x005f78 | `cd fa 60 00` | `call 0x0060fa` |
| 0x005f7c | `3e 26` | `ld a, 0x26` |
| 0x005f7e | `cd f7 60 00` | `call 0x0060f7` |
| 0x005f82 | `3e 00` | `ld a, 0x00` |
| 0x005f84 | `cd fa 60 00` | `call 0x0060fa` |

## Prose summary

The routines at `0x0060F7` and `0x0060FA` are the OS's low-level LCD write primitives. `0x0060F7` clears carry and falls through into `0x0060FA`; `0x0060FA` sets carry via `scf`. Both then execute the same shared body: load `bc = 0xD018` (port 0x18 via MMIO page 0xD0), triple-`rla; out (c), a` to clock out nine bits worth of data/index, and finally poll the LCD status. The carry bit therefore encodes whether the byte in A is a *register index* (helper at 0x0060F7) or a *data byte to write to the previously selected register* (helper at 0x0060FA). This matches the standard SPI-style command/data split of the LCD controller.

The caller block at `0x005D00..0x005F88` is the full init sequence. Each entry looks like `ld a, N; call 0x0060F7` (program register N) or `ld a, N; call 0x0060FA` (write data byte N to the currently selected register). Walking the table in order yields the canonical power-on protocol: sleep-out, pixel format, MADCTL / memory-access orientation, column/row address window setup, porch control, gamma / voltage tables, and finally display-on. The sequence is deterministic — every power cycle programs the same registers in the same order, so the table below is effectively the panel's datasheet init script baked into ROM.

In plain terms: these two helpers are a "send-index" / "send-data" pair, and the block in `0x005D00..0x005F88` repeatedly calls them to configure one LCD controller register at a time. Register-select calls (0x0060F7) pick which controller register is being addressed; each is usually followed by one or more data-write calls (0x0060FA) that stuff values into that register. Reading the call table top-to-bottom reconstructs the exact ST7789-style command stream the OS emits to bring the screen up.
