# Phase 446: Trace of `0x00B69E`

Target: `0x00B69E`  
ROM: `TI-84_Plus_CE/ROM.rom`  
Method: direct raw-byte decode with `TI-84_Plus_CE/ez80-decoder.js`, plus caller/reference scans against `TI-84_Plus_CE/ROM.transpiled.js`

## Verdict

`0x00B69E` is **not** a display refresh routine.

The raw ROM bytes contradict both earlier working labels in the repo:

- session 445's "`display refresh`" label
- phase 25g-e's "`FP normalize/cleanup`" label

What the function actually does is a **USB/link recovery/bootstrap sequence**:

- it uses the `D177B7` / `D177BB` USB/link sentinel/latch bytes
- it zero-fills USB/link state blocks
- it installs the USB event callback slot `D14026 = 0x00FBD1`
- it drives controller/interrupt ports in the `0x3010` / `0x30C4` / `0x3114` / `0x313D` / `0x500x` ranges
- it calls already-traced USB/link helpers such as `0x00883C`, `0x00B8BC`, `0x0123AD`, `0x012E4D`, `0x014E81`, `0x006EAF`, `0x006F4D`, and `0x006FAF`

There is **no direct VRAM access**, **no direct LCD MMIO**, and **no LCD-controller port traffic** in this function.

## Function Boundary And Size

- Entry: `0x00B69E`
- Return: `0x00B890`
- Linear span: `0x00B69E..0x00B890`
- Size: `0x1F3` bytes = **499 bytes**

The next distinct routine starts at `0x00B894`, so `0x00B69E` cleanly ends at the `RET` at `0x00B890`.

## Caller Count

Scanning the raw ROM for `CD 9E B6 00` finds exactly **2 unique direct call sites**:

- `0x001574`
- `0x001624`

`ROM.transpiled.js` contains repeated textual mentions because the transpiler emits overlapping basic-block sources, but those duplicate strings still collapse to the same two real call instructions above.

## High-Level Behavior

1. Build a 3-byte stack frame via `0x002197`.
2. Clear bit 5 at port `0x5005`.
3. If `D177B7 != 0x55`:
   - set bit 0 at port `0x3114`
   - write `D177B7 = 0xAA`
   - `_bzero(0xD13FD8, 0x448)`
   - `_bzero(0xD177B8, 0x2)`
   - clear `D177BB`
   - call `0x00B8BC(0x0BB8)` to scrub more USB/link blocks
   - push literal `0, 1` and call `0x00883C`
   - initialize `D14097/D14098/D14091/D14095/D14093/D176FC`
   - call `0x0085C4`
4. Require `D177B7 == 0xAA`; otherwise exit.
5. Write `D177B7 = 0x55`.
6. Clear the secondary callback slot via `0x00B688(0)`.
7. Install `D14026 = 0x00FBD1` (`D14026` is the USB/runtime callback slot from phases 313/314/434).
8. Drive a long USB/link register sequence on `0x5009`, `0x3100`, `0x3010`, `0x30C4`, `0x500D`, `0x5011`, and `0x313D`.
9. Call `0x012E4D`, query `usb_BusPowered()` via `0x006EAF`, optionally run teardown `0x014E81`, then re-set `0x3114 bit0` and call `0x006F4D(1)` and `0x006FAF`.
10. Tear down the IX frame and return.

That is a USB/link service path, not anything in the display pipeline.

## Full Disassembly

```asm
0x00B69E  21 FD FF FF        LD HL,0xFFFFFD
0x00B6A2  CD 97 21 00        CALL 0x002197
0x00B6A6  01 05 50 00        LD BC,0x005005
0x00B6AA  ED 78              IN A,(C)
0x00B6AC  CB AF              RES 5,A
0x00B6AE  ED 79              OUT (C),A
0x00B6B0  78                 LD A,B
0x00B6B1  FE 50              CP 0x50
0x00B6B3  28 01              JR Z,0x00B6B6
0x00B6B5  CF                 RST 0x08
0x00B6B6  79                 LD A,C
0x00B6B7  FE 05              CP 0x05
0x00B6B9  20 FA              JR NZ,0x00B6B5
0x00B6BB  3A B7 77 D1        LD A,(0xD177B7)
0x00B6BF  FE 55              CP 0x55
0x00B6C1  28 7D              JR Z,0x00B740
0x00B6C3  01 14 31 00        LD BC,0x003114
0x00B6C7  ED 78              IN A,(C)
0x00B6C9  CB C7              SET 0,A
0x00B6CB  ED 79              OUT (C),A
0x00B6CD  78                 LD A,B
0x00B6CE  FE 31              CP 0x31
0x00B6D0  28 01              JR Z,0x00B6D3
0x00B6D2  CF                 RST 0x08
0x00B6D3  79                 LD A,C
0x00B6D4  FE 14              CP 0x14
0x00B6D6  20 FA              JR NZ,0x00B6D2
0x00B6D8  3E AA              LD A,0xAA
0x00B6DA  32 B7 77 D1        LD (0xD177B7),A
0x00B6DE  01 48 04 00        LD BC,0x000448
0x00B6E2  C5                 PUSH BC
0x00B6E3  01 D8 3F D1        LD BC,0xD13FD8
0x00B6E7  C5                 PUSH BC
0x00B6E8  CD 5F 28 00        CALL 0x00285F
0x00B6EC  C1                 POP BC
0x00B6ED  C1                 POP BC
0x00B6EE  01 02 00 00        LD BC,0x000002
0x00B6F2  C5                 PUSH BC
0x00B6F3  01 B8 77 D1        LD BC,0xD177B8
0x00B6F7  C5                 PUSH BC
0x00B6F8  CD 5F 28 00        CALL 0x00285F
0x00B6FC  C1                 POP BC
0x00B6FD  C1                 POP BC
0x00B6FE  AF                 XOR A
0x00B6FF  32 BB 77 D1        LD (0xD177BB),A
0x00B703  01 B8 0B 00        LD BC,0x000BB8
0x00B707  C5                 PUSH BC
0x00B708  CD BC B8 00        CALL 0x00B8BC
0x00B70C  C1                 POP BC
0x00B70D  01 00 00 00        LD BC,0x000000
0x00B711  C5                 PUSH BC
0x00B712  01 01 00 00        LD BC,0x000001
0x00B716  C5                 PUSH BC
0x00B717  CD 3C 88 00        CALL 0x00883C
0x00B71B  C1                 POP BC
0x00B71C  C1                 POP BC
0x00B71D  3E 01              LD A,0x01
0x00B71F  32 97 40 D1        LD (0xD14097),A
0x00B723  AF                 XOR A
0x00B724  32 98 40 D1        LD (0xD14098),A
0x00B728  AF                 XOR A
0x00B729  32 91 40 D1        LD (0xD14091),A
0x00B72D  AF                 XOR A
0x00B72E  32 95 40 D1        LD (0xD14095),A
0x00B732  AF                 XOR A
0x00B733  32 93 40 D1        LD (0xD14093),A
0x00B737  AF                 XOR A
0x00B738  32 FC 76 D1        LD (0xD176FC),A
0x00B73C  CD C4 85 00        CALL 0x0085C4
0x00B740  3A B7 77 D1        LD A,(0xD177B7)
0x00B744  FE AA              CP 0xAA
0x00B746  C2 8C B8 00        JP NZ,0x00B88C
0x00B74A  3E 55              LD A,0x55
0x00B74C  32 B7 77 D1        LD (0xD177B7),A
0x00B750  01 00 00 00        LD BC,0x000000
0x00B754  C5                 PUSH BC
0x00B755  CD 88 B6 00        CALL 0x00B688
0x00B759  C1                 POP BC
0x00B75A  01 D1 FB 00        LD BC,0x00FBD1
0x00B75E  ED 43 26 40 D1     LD (0xD14026),BC
0x00B763  01 09 50 00        LD BC,0x005009
0x00B767  3E 20              LD A,0x20
0x00B769  ED 79              OUT (C),A
0x00B76B  78                 LD A,B
0x00B76C  FE 50              CP 0x50
0x00B76E  28 01              JR Z,0x00B771
0x00B770  CF                 RST 0x08
0x00B771  79                 LD A,C
0x00B772  FE 09              CP 0x09
0x00B774  20 FA              JR NZ,0x00B770
0x00B776  01 00 31 00        LD BC,0x003100
0x00B77A  ED 78              IN A,(C)
0x00B77C  CB EF              SET 5,A
0x00B77E  ED 79              OUT (C),A
0x00B780  78                 LD A,B
0x00B781  FE 31              CP 0x31
0x00B783  28 01              JR Z,0x00B786
0x00B785  CF                 RST 0x08
0x00B786  79                 LD A,C
0x00B787  FE 00              CP 0x00
0x00B789  20 FA              JR NZ,0x00B785
0x00B78B  01 00 31 00        LD BC,0x003100
0x00B78F  ED 78              IN A,(C)
0x00B791  CB E7              SET 4,A
0x00B793  ED 79              OUT (C),A
0x00B795  78                 LD A,B
0x00B796  FE 31              CP 0x31
0x00B798  28 01              JR Z,0x00B79B
0x00B79A  CF                 RST 0x08
0x00B79B  79                 LD A,C
0x00B79C  FE 00              CP 0x00
0x00B79E  20 FA              JR NZ,0x00B79A
0x00B7A0  01 10 30 00        LD BC,0x003010
0x00B7A4  ED 78              IN A,(C)
0x00B7A6  CB A7              RES 4,A
0x00B7A8  ED 79              OUT (C),A
0x00B7AA  78                 LD A,B
0x00B7AB  FE 30              CP 0x30
0x00B7AD  28 01              JR Z,0x00B7B0
0x00B7AF  CF                 RST 0x08
0x00B7B0  79                 LD A,C
0x00B7B1  FE 10              CP 0x10
0x00B7B3  20 FA              JR NZ,0x00B7AF
0x00B7B5  01 10 30 00        LD BC,0x003010
0x00B7B9  ED 78              IN A,(C)
0x00B7BB  CB AF              RES 5,A
0x00B7BD  ED 79              OUT (C),A
0x00B7BF  78                 LD A,B
0x00B7C0  FE 30              CP 0x30
0x00B7C2  28 01              JR Z,0x00B7C5
0x00B7C4  CF                 RST 0x08
0x00B7C5  79                 LD A,C
0x00B7C6  FE 10              CP 0x10
0x00B7C8  20 FA              JR NZ,0x00B7C4
0x00B7CA  01 10 30 00        LD BC,0x003010
0x00B7CE  ED 78              IN A,(C)
0x00B7D0  CB 87              RES 0,A
0x00B7D2  ED 79              OUT (C),A
0x00B7D4  78                 LD A,B
0x00B7D5  FE 30              CP 0x30
0x00B7D7  28 01              JR Z,0x00B7DA
0x00B7D9  CF                 RST 0x08
0x00B7DA  79                 LD A,C
0x00B7DB  FE 10              CP 0x10
0x00B7DD  20 FA              JR NZ,0x00B7D9
0x00B7DF  01 00 00 00        LD BC,0x000000
0x00B7E3  C5                 PUSH BC
0x00B7E4  CD AD 23 01        CALL 0x0123AD
0x00B7E8  C1                 POP BC
0x00B7E9  ED 57              LD A,I
0x00B7EB  F5                 PUSH AF
0x00B7EC  F3                 DI
0x00B7ED  01 C4 30 00        LD BC,0x0030C4
0x00B7F1  ED 78              IN A,(C)
0x00B7F3  CB DF              SET 3,A
0x00B7F5  ED 79              OUT (C),A
0x00B7F7  78                 LD A,B
0x00B7F8  FE 30              CP 0x30
0x00B7FA  28 01              JR Z,0x00B7FD
0x00B7FC  CF                 RST 0x08
0x00B7FD  79                 LD A,C
0x00B7FE  FE C4              CP 0xC4
0x00B800  20 FA              JR NZ,0x00B7FC
0x00B802  01 0D 50 00        LD BC,0x00500D
0x00B806  ED 78              IN A,(C)
0x00B808  CB AF              RES 5,A
0x00B80A  ED 79              OUT (C),A
0x00B80C  78                 LD A,B
0x00B80D  FE 50              CP 0x50
0x00B80F  28 01              JR Z,0x00B812
0x00B811  CF                 RST 0x08
0x00B812  79                 LD A,C
0x00B813  FE 0D              CP 0x0D
0x00B815  20 FA              JR NZ,0x00B811
0x00B817  01 11 50 00        LD BC,0x005011
0x00B81B  ED 78              IN A,(C)
0x00B81D  CB AF              RES 5,A
0x00B81F  ED 79              OUT (C),A
0x00B821  78                 LD A,B
0x00B822  FE 50              CP 0x50
0x00B824  28 01              JR Z,0x00B827
0x00B826  CF                 RST 0x08
0x00B827  79                 LD A,C
0x00B828  FE 11              CP 0x11
0x00B82A  20 FA              JR NZ,0x00B826
0x00B82C  01 09 50 00        LD BC,0x005009
0x00B830  3E 20              LD A,0x20
0x00B832  ED 79              OUT (C),A
0x00B834  78                 LD A,B
0x00B835  FE 50              CP 0x50
0x00B837  28 01              JR Z,0x00B83A
0x00B839  CF                 RST 0x08
0x00B83A  79                 LD A,C
0x00B83B  FE 09              CP 0x09
0x00B83D  20 FA              JR NZ,0x00B839
0x00B83F  F1                 POP AF
0x00B840  E2 45 B8 00        JP PO,0x00B845
0x00B844  FB                 EI
0x00B845  01 3D 31 00        LD BC,0x00313D
0x00B849  ED 78              IN A,(C)
0x00B84B  CB CF              SET 1,A
0x00B84D  ED 79              OUT (C),A
0x00B84F  78                 LD A,B
0x00B850  FE 31              CP 0x31
0x00B852  28 01              JR Z,0x00B855
0x00B854  CF                 RST 0x08
0x00B855  79                 LD A,C
0x00B856  FE 3D              CP 0x3D
0x00B858  20 FA              JR NZ,0x00B854
0x00B85A  CD 4D 2E 01        CALL 0x012E4D
0x00B85E  CD AF 6E 00        CALL 0x006EAF
0x00B862  B7                 OR A
0x00B863  20 27              JR NZ,0x00B88C
0x00B865  CD 81 4E 01        CALL 0x014E81
0x00B869  01 14 31 00        LD BC,0x003114
0x00B86D  ED 78              IN A,(C)
0x00B86F  CB C7              SET 0,A
0x00B871  ED 79              OUT (C),A
0x00B873  78                 LD A,B
0x00B874  FE 31              CP 0x31
0x00B876  28 01              JR Z,0x00B879
0x00B878  CF                 RST 0x08
0x00B879  79                 LD A,C
0x00B87A  FE 14              CP 0x14
0x00B87C  20 FA              JR NZ,0x00B878
0x00B87E  01 01 00 00        LD BC,0x000001
0x00B882  C5                 PUSH BC
0x00B883  CD 4D 6F 00        CALL 0x006F4D
0x00B887  C1                 POP BC
0x00B888  CD AF 6F 00        CALL 0x006FAF
0x00B88C  DD F9              LD SP,IX
0x00B88E  DD E1              POP IX
0x00B890  C9                 RET
```

## Direct CALL Targets

| Call Site | Target | Role In This Path |
| --- | --- | --- |
| `0x00B6A2` | `0x002197` | standard ZDS/eZ80 stack-frame helper (`-3` local bytes) |
| `0x00B6E8` | `0x00285F` | `_bzero(dest, count)`; here zeroes `0xD13FD8..0xD1441F` (`0x448` bytes) |
| `0x00B6F8` | `0x00285F` | `_bzero(dest, count)`; here zeroes `0xD177B8..0xD177B9` (`2` bytes) |
| `0x00B708` | `0x00B8BC` | DI-protected USB/link recovery helper; zeroes `D176A8`, `D1770A`, `D1776A`, writes `D17792` and `D176CB`, clears `D176FC` |
| `0x00B717` | `0x00883C` | USB state-machine/event dispatcher; this site pushes literal `0` and `1` before the call |
| `0x00B73C` | `0x0085C4` | tiny helper that clears `D14089` and sets `IY+67 bit2` |
| `0x00B755` | `0x00B688` | local helper that stores its stack argument into `D14029`; here called with `0`, so it clears that callback slot |
| `0x00B7E4` | `0x0123AD` | `0x3010` helper / bus-reset-or-installer wrapper; here called with argument `0` |
| `0x00B85A` | `0x012E4D` | USB follow-up sampler/reset helper; reads `0x3015/0x3014`, clears `D14082/D14084/D14083`, sets `0x3081` bits |
| `0x00B85E` | `0x006EAF` | `usb_BusPowered()` / hardware-ready check on port `0x0F` |
| `0x00B865` | `0x014E81` | notification/USB teardown half; clears `D14077`, `D1440E`, flips `D17779/D1777A` and `D176C9/D176CA` as needed |
| `0x00B883` | `0x006F4D` | low-level USB/link helper on low ports `0x07/0x09/0x0C/0x0A`; called with argument `1` |
| `0x00B888` | `0x006FAF` | low-level USB/link helper on low ports `0x03/0x0C/0x0A` |

### Nearby Local Helper: `0x00B688`

This is the small helper invoked at `0x00B755`:

```asm
0x00B688  CALL 0x00218A
0x00B68C  LD BC,(IX+6)
0x00B68F  LD (0xD14029),BC
0x00B694  LD SP,IX
0x00B696  POP IX
0x00B698  RET
0x00B699  LD HL,(0xD14029)
0x00B69D  RET
```

So the `0x00B755` call is just `store_24bit_to_D14029(0)`.

## Direct Absolute RAM Accesses

### Direct Reads

| PC | Address | Operation |
| --- | --- | --- |
| `0x00B6BB` | `0xD177B7` | read sentinel / state byte |
| `0x00B740` | `0xD177B7` | re-read sentinel / state byte |

### Direct Writes

| PC | Address | Value / Meaning |
| --- | --- | --- |
| `0x00B6DA` | `0xD177B7` | `0xAA` |
| `0x00B6FF` | `0xD177BB` | `0x00` |
| `0x00B71F` | `0xD14097` | `0x01` |
| `0x00B724` | `0xD14098` | `0x00` |
| `0x00B729` | `0xD14091` | `0x00` |
| `0x00B72E` | `0xD14095` | `0x00` |
| `0x00B733` | `0xD14093` | `0x00` |
| `0x00B738` | `0xD176FC` | `0x00` |
| `0x00B74C` | `0xD177B7` | `0x55` |
| `0x00B75E` | `0xD14026` | `0x00FBD1` callback install |

### Direct + Local-Helper Side Effects

| Source | Absolute RAM Effect |
| --- | --- |
| `0x00B755 -> 0x00B688` | writes `D14029 = 0x000000` |
| `0x00B6E8 -> 0x00285F` | zero-fills `0xD13FD8..0xD1441F` (`0x448` bytes) |
| `0x00B6F8 -> 0x00285F` | zero-fills `0xD177B8..0xD177B9` (`2` bytes) |
| `0x00B708 -> 0x00B8BC` | zero-fills `D176A8` (`0x62`), `D1770A` (`0x60`), `D1776A` (`0x4D`); writes caller arg `0x0BB8` into `D17792` and `D176CB`; clears `D176FC` via `0x01579B` |
| `0x00B85A -> 0x012E4D` | clears `D14082`, `D14084`, `D14083` |
| `0x00B865 -> 0x014E81` | can clear `D14077`, clear `D1440E`, set `D1440F`, flip `D17779 -> D1777A`, and flip `D176C9 -> D176CA` |

## Port / MMIO Traffic

### Direct Port I/O Inside `0x00B69E`

| PC | Port | Access | Bit Operation |
| --- | --- | --- | --- |
| `0x00B6AA/AE` | `0x5005` | `IN` / `OUT` | `RES 5` |
| `0x00B6C7/CB` | `0x3114` | `IN` / `OUT` | `SET 0` |
| `0x00B769` | `0x5009` | `OUT` | write `0x20` |
| `0x00B77A/7E` | `0x3100` | `IN` / `OUT` | `SET 5` |
| `0x00B78F/93` | `0x3100` | `IN` / `OUT` | `SET 4` |
| `0x00B7A4/A8` | `0x3010` | `IN` / `OUT` | `RES 4` |
| `0x00B7B9/BD` | `0x3010` | `IN` / `OUT` | `RES 5` |
| `0x00B7CE/D2` | `0x3010` | `IN` / `OUT` | `RES 0` |
| `0x00B7F1/F5` | `0x30C4` | `IN` / `OUT` | `SET 3` |
| `0x00B806/80A` | `0x500D` | `IN` / `OUT` | `RES 5` |
| `0x00B81B/81F` | `0x5011` | `IN` / `OUT` | `RES 5` |
| `0x00B832` | `0x5009` | `OUT` | write `0x20` |
| `0x00B849/84D` | `0x313D` | `IN` / `OUT` | `SET 1` |
| `0x00B86D/871` | `0x3114` | `IN` / `OUT` | `SET 0` |

### Indirect Helper Port Traffic

| Helper | Known Port Family |
| --- | --- |
| `0x0123AD` | `0x3010` |
| `0x012E4D` | `0x3015`, `0x3014`, `0x3081` |
| `0x006EAF` | `0x0F` |
| `0x014E81` | `0x5004`, `0x7030` |
| `0x006F4D` | low ports `0x07`, `0x09`, `0x0C`, `0x0A` |
| `0x006FAF` | low ports `0x03`, `0x0C`, `0x0A` |

## VRAM / LCD Check

### VRAM Region `0xD40000-0xD52C00`

No direct reads.  
No direct writes.  
No helper in this call chain was previously identified as a VRAM blitter or text renderer.

### LCD Controller Paths

No direct use of:

- `0xE00000-0xE00030`
- `0xF80000-0xF80030`
- the LCD init/write ports used by the true LCD helper pair (`0x0060F7/0x0060FA`, which drive `0xD018` / `0xD008`)

Instead, all observed direct I/O is in USB/link or interrupt-controller ranges:

- `0x3010`
- `0x30C4`
- `0x3100`
- `0x3114`
- `0x313D`
- `0x5005`
- `0x5009`
- `0x500D`
- `0x5011`

So this routine is **not**:

- VRAM -> LCD push
- text/graphics renderer into VRAM
- LCD init/flush helper

## Key Finding

`0x00B69E` is a **USB/link recovery/bootstrap routine**.

It manipulates USB/link sentinels (`D177B7`, `D177BB`), clears multiple USB/link state blocks, installs the USB callback slot (`D14026 = 0x00FBD1`), drives USB/link controller ports, and calls only USB/link-oriented helpers.

Therefore:

- it does **not** read VRAM and push pixels to the LCD
- it does **not** render text/graphics into VRAM
- the scheduler path at `0x001624` is calling a USB/link service routine, not a display refresh routine

The strongest single-byte evidence is the callback install:

```asm
0x00B75A  LD BC,0x00FBD1
0x00B75E  LD (0xD14026),BC
```

Phases 313/314/434 already established:

- `D14026` is a runtime callback slot
- `0x00FBD1` is the universal USB event callback

That write alone is incompatible with a display-refresh interpretation.
