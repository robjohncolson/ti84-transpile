# Phase 188 - SetTextFgColor Producer Trace

## Part A - Static Disassembly

- `SetTextFgColor` takes its caller-supplied color in `HL`.
- In ADL mode with `MBASE = 0xD0`, short stores to `0x2688` / `0x268A` land at `0xD02688` / `0xD0268A`.

### 0x0802B2 - SetTextFgColor

| Address | Bytes | Mnemonic | Notes |
|---|---|---|---|
| 0x0802B2 | `11 FF FF 00` | `ld de, 0x00FFFF` |  |
| 0x0802B6 | `40 ED 53 8A 26` | `ld (0x268A), de` | RAM write candidate -> 0xD0268A |
| 0x0802BB | `40 22 88 26` | `ld (0x2688), hl` | RAM write candidate -> 0xD02688 |
| 0x0802BF | `FD CB 4A E6` | `set 4, (iy+74)` |  |
| 0x0802C3 | `C9` | `ret` |  |

### 0x0A1939 - VRAM writer block 1

| Address | Bytes | Mnemonic | Notes |
|---|---|---|---|
| 0x0A1939 | `7B` | `ld a, e` |  |
| 0x0A193A | `CB 21` | `sla c` |  |
| 0x0A193C | `8A` | `adc a, d` |  |
| 0x0A193D | `77` | `ld (hl), a` |  |
| 0x0A193E | `23` | `inc hl` |  |
| 0x0A193F | `77` | `ld (hl), a` |  |
| 0x0A1940 | `23` | `inc hl` |  |
| 0x0A1941 | `7B` | `ld a, e` |  |
| 0x0A1942 | `CB 21` | `sla c` |  |
| 0x0A1944 | `8A` | `adc a, d` |  |
| 0x0A1945 | `77` | `ld (hl), a` |  |
| 0x0A1946 | `23` | `inc hl` |  |
| 0x0A1947 | `77` | `ld (hl), a` |  |
| 0x0A1948 | `23` | `inc hl` |  |
| 0x0A1949 | `7B` | `ld a, e` |  |
| 0x0A194A | `CB 21` | `sla c` |  |
| 0x0A194C | `8A` | `adc a, d` |  |
| 0x0A194D | `77` | `ld (hl), a` |  |
| 0x0A194E | `23` | `inc hl` |  |
| 0x0A194F | `77` | `ld (hl), a` |  |
| 0x0A1950 | `23` | `inc hl` |  |
| 0x0A1951 | `7B` | `ld a, e` |  |
| 0x0A1952 | `CB 21` | `sla c` |  |
| 0x0A1954 | `8A` | `adc a, d` |  |
| 0x0A1955 | `77` | `ld (hl), a` |  |
| 0x0A1956 | `23` | `inc hl` |  |
| 0x0A1957 | `77` | `ld (hl), a` |  |
| 0x0A1958 | `23` | `inc hl` |  |
| 0x0A1959 | `7B` | `ld a, e` |  |
| 0x0A195A | `CB 21` | `sla c` |  |
| 0x0A195C | `8A` | `adc a, d` |  |
| 0x0A195D | `77` | `ld (hl), a` |  |
| 0x0A195E | `23` | `inc hl` |  |
| 0x0A195F | `77` | `ld (hl), a` |  |
| 0x0A1960 | `23` | `inc hl` |  |
| 0x0A1961 | `C3 69 19 0A` | `jp 0x0A1969` |  |

### 0x0A19D7 - VRAM writer block 2

| Address | Bytes | Mnemonic | Notes |
|---|---|---|---|
| 0x0A19D7 | `11 FF 00 00` | `ld de, 0x0000FF` |  |
| 0x0A19DB | `7B` | `ld a, e` |  |
| 0x0A19DC | `CB 21` | `sla c` |  |
| 0x0A19DE | `8A` | `adc a, d` |  |
| 0x0A19DF | `77` | `ld (hl), a` |  |
| 0x0A19E0 | `23` | `inc hl` |  |
| 0x0A19E1 | `77` | `ld (hl), a` |  |
| 0x0A19E2 | `23` | `inc hl` |  |
| 0x0A19E3 | `7B` | `ld a, e` |  |
| 0x0A19E4 | `CB 21` | `sla c` |  |
| 0x0A19E6 | `8A` | `adc a, d` |  |
| 0x0A19E7 | `77` | `ld (hl), a` |  |
| 0x0A19E8 | `23` | `inc hl` |  |
| 0x0A19E9 | `77` | `ld (hl), a` |  |
| 0x0A19EA | `23` | `inc hl` |  |
| 0x0A19EB | `7B` | `ld a, e` |  |
| 0x0A19EC | `CB 21` | `sla c` |  |
| 0x0A19EE | `8A` | `adc a, d` |  |
| 0x0A19EF | `77` | `ld (hl), a` |  |
| 0x0A19F0 | `23` | `inc hl` |  |
| 0x0A19F1 | `77` | `ld (hl), a` |  |
| 0x0A19F2 | `23` | `inc hl` |  |
| 0x0A19F3 | `7B` | `ld a, e` |  |
| 0x0A19F4 | `CB 21` | `sla c` |  |
| 0x0A19F6 | `8A` | `adc a, d` |  |
| 0x0A19F7 | `77` | `ld (hl), a` |  |
| 0x0A19F8 | `23` | `inc hl` |  |
| 0x0A19F9 | `77` | `ld (hl), a` |  |
| 0x0A19FA | `23` | `inc hl` |  |
| 0x0A19FB | `7B` | `ld a, e` |  |
| 0x0A19FC | `CB 21` | `sla c` |  |
| 0x0A19FE | `8A` | `adc a, d` |  |
| 0x0A19FF | `77` | `ld (hl), a` |  |
| 0x0A1A00 | `23` | `inc hl` |  |
| 0x0A1A01 | `77` | `ld (hl), a` |  |
| 0x0A1A02 | `23` | `inc hl` |  |
| 0x0A1A03 | `7B` | `ld a, e` |  |
| 0x0A1A04 | `CB 21` | `sla c` |  |
| 0x0A1A06 | `8A` | `adc a, d` |  |
| 0x0A1A07 | `77` | `ld (hl), a` |  |
| 0x0A1A08 | `23` | `inc hl` |  |
| 0x0A1A09 | `77` | `ld (hl), a` |  |
| 0x0A1A0A | `23` | `inc hl` |  |
| 0x0A1A0B | `7B` | `ld a, e` |  |
| 0x0A1A0C | `CB 21` | `sla c` |  |
| 0x0A1A0E | `8A` | `adc a, d` |  |
| 0x0A1A0F | `77` | `ld (hl), a` |  |
| 0x0A1A10 | `23` | `inc hl` |  |
| 0x0A1A11 | `77` | `ld (hl), a` |  |
| 0x0A1A12 | `23` | `inc hl` |  |
| 0x0A1A13 | `C3 1D 1A 0A` | `jp 0x0A1A1D` |  |

### 0x005B96 - VRAM fill primitive

| Address | Bytes | Mnemonic | Notes |
|---|---|---|---|
| 0x005B96 | `21 00 00 D4` | `ld hl, 0xD40000` |  |
| 0x005B9A | `36 FF` | `ld (hl), 0xFF` |  |
| 0x005B9C | `11 01 00 D4` | `ld de, 0xD40001` |  |
| 0x005BA0 | `01 FF 57 02` | `ld bc, 0x0257FF` |  |
| 0x005BA4 | `ED B0` | `ldir` |  |
| 0x005BA6 | `E5` | `push hl` |  |
| 0x005BA7 | `21 00 00 00` | `ld hl, 0x000000` |  |
| 0x005BAB | `22 95 05 D0` | `ld (0xD00595), hl` | RAM write candidate -> 0xD00595 |
| 0x005BAF | `E1` | `pop hl` |  |
| 0x005BB0 | `C9` | `ret` |  |

## Part B - Dynamic Trace

### HL = 0x0000

- Termination: `missing_block` at 0xFFFFFF
- Final 0xD02688 = 0x0000
- Final 0xD0268A = 0xFFFF
- Final 0xD000CA = 0x10

- 0xD0268A <= 0xFFFF (16-bit)
- 0xD02688 <= 0x0000 (16-bit)
- 0xD000CA <= 0x10 (8-bit)

### HL = 0xFFFF

- Termination: `missing_block` at 0xFFFFFF
- Final 0xD02688 = 0xFFFF
- Final 0xD0268A = 0xFFFF
- Final 0xD000CA = 0x10

- 0xD0268A <= 0xFFFF (16-bit)
- 0xD02688 <= 0xFFFF (16-bit)
- 0xD000CA <= 0x10 (8-bit)

### HL = 0x1234

- Termination: `missing_block` at 0xFFFFFF
- Final 0xD02688 = 0x1234
- Final 0xD0268A = 0xFFFF
- Final 0xD000CA = 0x10

- 0xD0268A <= 0xFFFF (16-bit)
- 0xD02688 <= 0x1234 (16-bit)
- 0xD000CA <= 0x10 (8-bit)

### Changed Address Between HL = 0x0000 and HL = 0xFFFF

- 0xD02688: 0x0000 -> 0xFFFF

- Identified fg color RAM address: 0xD02688
- Companion slot forced by SetTextFgColor: 0xD0268A = 0xFFFF

## Part C - Cross-Reference

- After boot + kernel init, 0xD02688 = 0x0000
- After boot + kernel init, 0xD0268A = 0x0000
- After one phase186-style post-init call to 0x0802B2 with HL = 0x0000, 0xD02688 = 0x0000
- After that same call, 0xD0268A = 0xFFFF
- The 0xD000CA flag is set to 0x10 by the function.

## Verdict

SetTextFgColor at 0x0802B2 writes the fg color to RAM address 0xD02688.

It also writes the adjacent companion slot 0xD0268A to 0xFFFF on every call, which is where the persistent white value comes from in this producer-side trace.
