# Phase 137 — 0x0800A0 (= CheckSplitFlag) Caller Analysis (IY+0x14 bit 3 flag)

## Summary

`0x0800A0 (= CheckSplitFlag)` tests bit 3 of `(IY+0x14)` = memory `0xD00094`, returning Z flag.
`0x0800C2` clears that same bit (RES 3).

- **CALL 0x0800A0 (= CheckSplitFlag)**: 111 occurrences in ROM
- **CALL 0x0800C2**: 3 occurrences in ROM
- **Inline BIT 3,(IY+0x14)**: 0 (excluding 0x0800A0 (= CheckSplitFlag) itself)
- **Inline SET 3,(IY+0x14)**: 17
- **Inline RES 3,(IY+0x14)**: 21 (excluding 0x0800C2 itself)

## All CALL 0x0800A0 (= CheckSplitFlag) Addresses

```
0x0455a2
0x0582ec
0x05832c
0x05fe83
0x05fee9
0x0601de
0x060654
0x060734
0x060cab
0x060d45
0x061932
0x06c7d0
0x06c8cd
0x06da98
0x06f151
0x06f2c7
0x06f41a (= DrawSplitLine)
0x06fcf5
0x06fdca
0x06ff18
0x07051e
0x0742ce
0x079074
0x0800ee
0x085675
0x08605a
0x0861de
0x0863f7
0x088491
0x08c8b9
0x09275c
0x0929ac
0x0929b8
0x0931bb
0x0931fa
0x09322f
0x09333d
0x096af8
0x096b1d
0x096d1f
0x096d2b
0x09751c
0x097801
0x097d90
0x0986b0
0x099176
0x09e5eb
0x09e601
0x09e67c
0x09f44a
0x09f49a
0x0a1eff
0x0a21c5
0x0a2243
0x0a289d
0x0a2951
0x0a34ca
0x0a34fc
0x0a353d
0x0a356f
0x0a361d
0x0a384f
0x0ab2e9
0x0ab321
0x0ab7cd
0x0ad065
0x0ad9b2
0x0adac5
0x0adad3
0x0adb2e
0x0b0139
0x0b0818
0x0b1d03
0x0b2bb3
0x0b39eb
0x0b3a51
0x0b41d4
0x0b4276
0x0b4491
0x0b5ec4
0x0b6072
0x0b60e5
0x0b6612
0x0b6626
0x0b6646
0x0b6679
0x0b668d
0x0b66e0
0x0b7b45
0x0b7b70
0x0b80e2
0x0b8163
0x0b89d3
0x0b8a78
0x0b8b09
0x0b8b1d
0x0b8c47
0x0b8d0f
0x0b8d33
0x0b8f6c
0x0b901e
0x0b9254
0x0ba0cb
0x0bad56
0x0badab
0x0bbbc3
0x0bbc0f
0x0bbc3c
0x0bc26e
0x0bc683
0x0bc7bb
```

## All CALL 0x0800C2 Addresses

```
0x05826e
0x05fe4a
0x08c8b5
```

## Inline SET 3,(IY+0x14) Addresses

```
0x03d773
0x04ef57
0x05cbe8
0x06b3d9
0x06b979
0x080cb8
0x087598
0x08a624
0x09c746
0x09c88b
0x09dc48
0x09e2c3
0x09e3c0
0x0a582c
0x0adb77
0x0b194a
0x0b6a6c
```

## Inline RES 3,(IY+0x14) Addresses

```
0x03dd5b
0x05cd56
0x06b4e3
0x07a4de
0x07a510
0x08199d
0x08a8bb
0x093314
0x097478
0x0975be
0x09cacb
0x09cad8
0x09dc86
0x0a65b0
0x0acc39
0x0ae161
0x0ae3ac
0x0ae47e
0x0b1b66
0x0b1b70
0x0b6d0e
```

## Branch Pattern After CALL 0x0800A0 (All Callers)

| Instruction After CALL | Count |
|------------------------|-------|
| JR Z,dd | 83 |
| JR NZ,dd | 14 |
| RET Z | 6 |
| RET NZ | 4 |
| unknown (0xcc) | 1 |
| unknown (0x3a) | 1 |
| unknown (0xc4) | 1 |
| unknown (0x3e) | 1 |

## Sample Caller Details (First 20 of 0x0800A0 (= CheckSplitFlag))

### 0x0455a2
```
hex: 0c 04 fd cb 02 96 cd f2 21 0a cd a0 00 08 cc c3 ed 09 e1 d1 ed 53 95 05 d0 f1 fd cb 35 4e
next opcode: 0xcc = unknown (0xcc)
```

### 0x0582ec
```
hex: 01 a6 cd 10 ce 09 21 00 08 00 cd a0 00 08 28 02 2e 06 3a 87 26 d0 32 85 26 d0 40 22 c7 07
next opcode: 0x28 = JR Z,dd -> 0x0582f4
```

### 0x05832c
```
hex: fd cb 15 56 28 1c 01 24 1e 00 cd a0 00 08 28 04 01 9c 9b 00 21 00 00 00 11 3f 01 00 cd 20
next opcode: 0x28 = JR Z,dd -> 0x058336
```

### 0x05fe83
```
hex: cd fe 39 02 cd a3 01 06 3e 39 cd a0 00 08 28 02 3e b1 cd 32 c7 06 28 02 c6 14 32 70 11 d0
next opcode: 0x28 = JR Z,dd -> 0x05fe8b
```

### 0x05fee9
```
hex: 21 03 80 00 40 22 74 25 3e 01 cd a0 00 08 28 02 3e 07 32 95 05 d0 cd d3 36 09 cd 01 e6 09
next opcode: 0x28 = JR Z,dd -> 0x05fef1
```

### 0x0601de
```
hex: fe 39 02 c0 3e 24 21 0e 00 00 cd a0 00 08 28 02 3e 9c cd 32 c7 06 28 08 cd 83 31 09 cd 1b
next opcode: 0x28 = JR Z,dd -> 0x0601e6
```

### 0x060654
```
hex: be 4f 7e 32 6d 11 d0 79 06 c6 cd a0 00 08 28 02 06 4e 80 d6 14 c8 cd 32 c7 06 28 03 d6 14
next opcode: 0x28 = JR Z,dd -> 0x06065c
```

### 0x060734
```
hex: cd 32 c7 06 28 04 fe 01 28 17 cd a0 00 08 28 2f 7d cd 32 c7 06 20 06 fe 07 30 24 18 04 fe
next opcode: 0x28 = JR Z,dd -> 0x060769
```

### 0x060cab
```
hex: d5 af 67 52 ed 52 fa d1 0c 06 cd a0 00 08 28 05 7d fe 06 38 1b 3a 06 25 d0 3d 67 40 22 95
next opcode: 0x28 = JR Z,dd -> 0x060cb6
```

### 0x060d45
```
hex: 05 af 67 52 ed 52 fa 25 0e 06 cd a0 00 08 28 07 7d fe 06 da 25 0e 06 18 7c cd 34 14 06 20
next opcode: 0x28 = JR Z,dd -> 0x060d52
```

### 0x061932
```
hex: b7 3e 56 c8 c6 18 c9 3e 3e c9 cd a0 00 08 28 04 fe b1 18 02 fe 39 d8 fe de d0 40 2a 94 26
next opcode: 0x28 = JR Z,dd -> 0x06193c
```

### 0x06c7d0
```
hex: 40 22 72 14 40 22 77 14 3e 52 cd a0 00 08 28 02 3e 28 fd cb 14 4e 28 02 3e 48 32 6e 14 d0
next opcode: 0x28 = JR Z,dd -> 0x06c7d8
```

### 0x06c8cd
```
hex: 14 d0 cd 90 f2 09 fd cb 0d ce cd a0 00 08 20 0e cd b9 01 08 20 08 cd cd fc 06 cd 4d f2 06
next opcode: 0x20 = JR NZ,dd -> 0x06c8e1
```

### 0x06da98
```
hex: 07 fd cb 2b 96 c9 01 ea d8 00 cd a0 00 08 28 04 01 99 88 00 21 00 00 00 11 3f 01 00 cd 20
next opcode: 0x28 = JR Z,dd -> 0x06daa2
```

### 0x06f151
```
hex: be ad 34 08 73 d4 21 39 f1 06 cd a0 00 08 c0 21 43 f1 06 fd cb 14 4e c0 21 2f f1 06 c9 cd
next opcode: 0xc0 = RET NZ
```

### 0x06f2c7
```
hex: 84 d9 fd cb 14 4e 20 0c 06 a5 cd a0 00 08 28 0a 06 51 18 06 06 91 d9 0e 5c d9 d9 d9 7d b7
next opcode: 0x28 = JR Z,dd -> 0x06f2d7
```

### 0x06f41a (= DrawSplitLine)
```
hex: 05 d9 c2 8e f3 06 c3 82 f3 06 cd a0 00 08 c8 fd cb 2b 56 f5 fd cb 2b d6 fd cb 02 4e f5 fd
next opcode: 0xc8 = RET Z
```

### 0x06fcf5
```
hex: 00 00 40 ed 5b fc 14 16 00 1d cd a0 00 08 28 02 0e 99 fd cb 4b 76 28 0a 0e d2 fd cb 50 6e
next opcode: 0x28 = JR Z,dd -> 0x06fcfd
```

### 0x06fdca
```
hex: 18 26 11 25 01 00 21 1a 00 00 cd a0 00 08 20 16 fd cb 4b 66 28 12 0e dd cd e8 fd 06 01 ef
next opcode: 0x20 = JR NZ,dd -> 0x06fde6
```

### 0x06ff18
```
hex: 11 3d 01 00 cd b9 01 08 20 0c cd a0 00 08 20 06 cd 44 ef 09 18 04 cd 20 ef 09 c3 ab c8 06
next opcode: 0x20 = JR NZ,dd -> 0x06ff24
```

## CALL 0x0800C2 Caller Details

### 0x05826e
```
hex: 3c e6 f4 fd 77 3c fd cb 14 be cd c2 00 08 cd a3 8b 05 32 5b 26 d0 32 06 25 d0 cd 22 82 05
next opcode: 0xcd = unknown (0xcd)
```

### 0x05fe4a
```
hex: 20 04 cd 09 ff 05 cd 2d 00 06 cd c2 00 08 af 32 0c 1d d0 cd 34 14 06 20 18 fd cb 3a 4e 20
next opcode: 0xaf = unknown (0xaf)
```

### 0x08c8b5
```
hex: fd cb 1d f6 fd cb 1d fe 18 30 cd c2 00 08 cd a0 00 08 28 26 3a e0 07 d0 cd 9d 75 08 20 1c
next opcode: 0xcd = unknown (0xcd)
```

## Cross-References in Existing Reports

### phase117-report.md

- Line 79: - 0xd00094 = 0xf7
- Line 84: - 0xd00094 = 0xe7
- Line 111: - 0xd00094 = 0xf7
- Line 116: - 0xd00094 = 0xe7
- Line 143: - 0xd00094 = 0xf7
- Line 148: - 0xd00094 = 0xe7

### phase127-report.md

- Line 118: 0x08c8b9  cd a0 00 08           call 0x0800a0 (= CheckSplitFlag)
- Line 208: | `0x08c8b9` | call | - | `0x0800a0 (= CheckSplitFlag)` |  |
- Line 297: 0x08c8b9  cd a0 00 08           call 0x0800a0 (= CheckSplitFlag)
- Line 117: 0x08c8b5  cd c2 00 08           call 0x0800c2
- Line 207: | `0x08c8b5` | call | - | `0x0800c2` |  |
- Line 296: 0x08c8b5  cd c2 00 08           call 0x0800c2

### phase129-report.md

- Line 251: | 0xd00094 | 0xff | 0xdf |
- Line 312: | 0xd00094 | 0xff | 0xdf |

### phase131-report.md

- Line 225: 0x06fcf5  cd a0 00 08           call target=0x0800a0 (= CheckSplitFlag)

### phase133-report.md

- Line 28: 0x0800ee  cd a0 00 08           call 0x0800a0 (= CheckSplitFlag)  ; -> home-handler-2
- Line 111: | `0x0800ee` | - | `0x0800a0 (= CheckSplitFlag)` | home-handler-2 |
- Line 131: ### home-handler-2 (0x0800a0 (= CheckSplitFlag))
- Line 134: 0x0800a0 (= CheckSplitFlag)  fd cb 14 5e           indexed-cb-bit
- Line 164: 0x0800ee  cd a0 00 08           call 0x0800a0 (= CheckSplitFlag)  ; -> home-handler-2
- Line 237: | `0x0800ee` | - | `0x0800a0 (= CheckSplitFlag)` | home-handler-2 |
- Line 416: ### home-handler-2 (0x0800a0 (= CheckSplitFlag))
- Line 437: 0x0800a0 (= CheckSplitFlag), 0x0800a6
- Line 476: ### home-handler-2 (0x0800a0 (= CheckSplitFlag))
- Line 9: ### home-handler-1 (0x0800c2)

### phase137-report.md

- Line 5: `0x0800A0 (= CheckSplitFlag)` tests bit 3 of `(IY+0x14)` = memory `0xD00094`, returning Z flag.
- Line 345: - Line 79: - 0xd00094 = 0xf7
- Line 346: - Line 84: - 0xd00094 = 0xe7
- Line 347: - Line 111: - 0xd00094 = 0xf7
- Line 348: - Line 116: - 0xd00094 = 0xe7
- Line 349: - Line 143: - 0xd00094 = 0xf7
- Line 350: - Line 148: - 0xd00094 = 0xe7
- Line 363: - Line 251: | 0xd00094 | 0xff | 0xdf |
- Line 364: - Line 312: | 0xd00094 | 0xff | 0xdf |
- Line 404: `BIT 3,(IY+0x14)` tests bit 3 of the OS flags byte at `0xD00094`.

## Address Range Distribution

| ROM Region | Caller Count |
|------------|-------------|
| 0x0b0000–0x0bffff | 41 |
| 0x090000–0x09ffff | 21 |
| 0x0a0000–0x0affff | 19 |
| 0x060000–0x06ffff | 15 |
| 0x080000–0x08ffff | 7 |
| 0x050000–0x05ffff | 4 |
| 0x070000–0x07ffff | 3 |
| 0x040000–0x04ffff | 1 |

## Hypothesis

Out of 111 callers:
- 89 branch on Z (flag IS clear / bit=0) — "if flag not set, do X"
- 18 branch on NZ (flag IS set / bit=1) — "if flag set, do X"

### Interpretation

`BIT 3,(IY+0x14)` tests bit 3 of the OS flags byte at `0xD00094`.
On the TI-84 Plus CE, `IY` points to the OS flag area at `0xD00080`.
Offset `0x14` (20 decimal) = byte `0xD00094`.

In the TI OS flag nomenclature, this is part of the **system flags** area.
Bit 3 of offset `0x14` from the flag base is commonly associated with
the **text write / cursor** system — specifically whether the OS is in a
state where text input operations should be processed or deferred.

The majority of callers branch on Z (bit is clear), suggesting most code
checks "is this flag active?" and skips an operation when it is NOT set.

The companion `RES 3,(IY+0x14)` at `0x0800C2` (clears the flag) being called
from only 3 sites suggests the flag is cleared in specific
cleanup/reset paths rather than toggled frequently.

With 111 callers testing and 17 inline SET + 3 CALL-based RES,
this flag appears to be a widely-consulted OS state bit — likely a "busy" or
"mode active" indicator that many subsystems check before proceeding.

### Known Values from Other Phases

- Phase 100d: `0xD00094` transitions from `0x00` to `0xFF` during boot
- Phase 117: `0xD00094` = `0xF7` / `0xE7` (bit 3 = 0 in `0xF7`, bit 3 = 1... no, `0xF7` = 11110111 so bit 3 = 0; `0xE7` = 11100111 so bit 3 = 0)
- Phase 129: `0xD00094` = `0xFF` (all bits set, including bit 3) / `0xDF` (bit 5 cleared)
- Phase 91a: `0xD00094` = `0xFF` at mode-bytes snapshot

When `0xD00094 = 0xFF`, bit 3 = 1 → `BIT 3,(IY+0x14)` returns NZ.
When `0xD00094 = 0xF7`, bit 3 = 0 → `BIT 3,(IY+0x14)` returns Z.

The flag starts clear (0x00), gets set to 0xFF during boot, and is selectively
manipulated. The `RES 3` calls clear just bit 3 while preserving other bits.

---
*Generated by probe-phase137-iy14-flag-analysis.mjs*