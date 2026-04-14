# Phase 58 Event Loop Disassembly

## Executive Summary

- `0x0019BE` is **not** checking a display-dirty flag, keyboard buffer byte, or callback table first. Its first test is `IN A,(0x5015)` followed by `JR Z,0x0019EF`: it is polling the interrupt controller's **masked status byte 1**.
- The stable Phase 56C path is the all-clear path:
  - `0x5015 == 0` -> skip byte-1 service branches
  - `0x5014 == 0` -> skip byte-0 service branches
  - `0x5016 bit 3 == 0` -> skip keyboard IRQ service branch
- The one-shot keyboard detour at `0x001A5D` does **not** read keyboard matrix port `0x0001`. It only:
  - acknowledges byte-2 status bit 3 at `0x500A`
  - clears enable bit 3 in `0x5006`
  - rejoins the common exit
- The observed `sysFlag` change (`0xD0009B: 0xFF -> 0xBF`) is explained entirely by the exit block `0x001A32`, which executes `RES 6,(IY+27)` after loading `IY=0xD00080`.
- The callback slot staying pinned at `0xD02AD7 = 0x0019BE` is also explained by `0x001A32`, which pops `HL` and writes it back to `0xD02AD7` before `RETI`.
- There is no direct render branch in the visited path. The dormant work is gated by **masked IRQ status bits**, not by `sysFlag` or `0xD02AD7`.

## Phase 56C Path Recap

Normal sustained cycle:

```text
0019BE -> 0019EF -> 001A17 -> 001A23 -> 001A2D -> 001A32 -> 0019B5
```

Keyboard-armed detour:

```text
0019BE -> 0019EF -> 001A17 -> 001A5D -> 001A70 -> 001A75 -> 001A32 -> 0019B5
```

## Requested Blocks

### `0x0019BE` entry block

```text
0019BE  40 01 15 50     ld bc, 0x005015   ; BC -> INTC masked-status byte 1
0019C2  ed 78           in a, (c)         ; IO read 0x5015
0019C4  28 29           jr z, 0x0019EF    ; taken in Phase 56C when byte1 == 0
```

- RAM reads: none
- RAM writes: none
- IO reads: `0x5015`
- Conditional branch:
  - `Z -> 0x0019EF` (visited)
  - `NZ -> 0x0019C6` (never visited in Phase 56C)
- Interpretation:
  - The very first test is "are any masked IRQ sources active in status byte 1?"
  - This is the first branch that skips all unreached byte-1 service paths.

### `0x0019EF`

```text
0019EF  0d              dec c             ; 0x15 -> 0x14
0019F0  ed 78           in a, (c)         ; IO read 0x5014 (masked-status byte 0)
0019F2  28 23           jr z, 0x001A17    ; taken in Phase 56C when byte0 == 0
```

- RAM reads: none
- RAM writes: none
- IO reads: `0x5014`
- Conditional branch:
  - `Z -> 0x001A17` (visited)
  - `NZ -> 0x0019F4` (never visited in Phase 56C)
- Interpretation:
  - This is the second all-clear gate. If byte 0 is zero, the loop skips all low-byte IRQ service paths.

### `0x001A17`

```text
001A17  0c              inc c             ; 0x14 -> 0x15
001A18  0c              inc c             ; 0x15 -> 0x16
001A19  ed 78           in a, (c)         ; IO read 0x5016 (masked-status byte 2)
001A1B  0e 0a           ld c, 0x0a        ; switch C to byte-2 acknowledge port 0x500A
001A1D  1f              rra
001A1E  1f              rra
001A1F  1f              rra
001A20  1f              rra
001A21  38 3a           jr c, 0x001A5D    ; byte2 bit3 set -> keyboard-style detour
```

- RAM reads: none
- RAM writes: none
- IO reads: `0x5016`
- Conditional branch:
  - `C -> 0x001A5D` (visited once in Phase 56C with keyboard IRQ armed)
  - `NC -> 0x001A23` (normal path)
- Interpretation:
  - Four `RRA`s mean the carry flag receives original bit 3 of masked-status byte 2.
  - In the current emulator setup, keyboard IRQ is the only proven source on this branch.

### `0x001A23`

```text
001A23  3e ff           ld a, 0xff
001A25  ed 79           out (c), a        ; IO write 0x500A = acknowledge byte-2 sources
001A27  78              ld a, b
001A28  fe 50           cp 0x50           ; sanity check: B should still be 0x50
001A2A  28 01           jr z, 0x001A2D
```

- RAM reads: none
- RAM writes: none
- IO writes: `0x500A <- 0xFF`
- Conditional branch:
  - `Z -> 0x001A2D` (visited)
  - `NZ -> 0x001A2C` (panic `RST 0x08`, never visited)
- Interpretation:
  - This is the no-op acknowledge path for byte 2.

### `0x001A2D`

```text
001A2D  79              ld a, c
001A2E  fe 0a           cp 0x0a           ; sanity check: C should be acknowledge port 0x0A
001A30  20 fa           jr nz, 0x001A2C   ; otherwise panic
```

- RAM reads: none
- RAM writes: none
- Conditional branch:
  - `NZ -> 0x001A2C` (`RST 0x08`, never visited)
  - `Z -> 0x001A32` (visited)

### `0x001A32` common exit

```text
001A32  e1              pop hl
001A33  22 d7 2a d0     ld (0xd02ad7), hl ; callback slot rewritten every cycle
001A37  fd 21 80 00 d0  ld iy, 0xd00080
001A3C  fd cb 1b b6     res 6, (iy+27)    ; read-modify-write 0xD0009B
001A40  fd e1           pop iy
001A42  dd e1           pop ix
001A44  d9              exx
001A45  08              ex af, af'
001A46  00              nop
001A47  00              nop
001A48  fb              ei
001A49  ed 4d           reti
```

- RAM reads:
  - `0xD0009B` via `RES 6,(IY+27)` read-modify-write
- RAM writes:
  - `0xD02AD7` (24-bit callback slot)
  - `0xD0009B` (bit 6 cleared)
- Conditional branches: none
- Calls/jumps: `RETI`
- Interpretation:
  - This block explains both Phase 56C observations:
    - `sysFlag` bit 6 gets cleared here.
    - callback slot gets rewritten here.
  - There is no ADL fallthrough after `0x001A32`; the block terminates at `0x001A49`.

### `0x001A5D` keyboard detour

```text
001A5D  af              xor a
001A5E  cb df           set 3, a          ; A = 0x08
001A60  ed 79           out (c), a        ; IO write 0x500A = ack byte2 bit3
001A62  0e 06           ld c, 0x06
001A64  ed 78           in a, (c)         ; IO read 0x5006 = enable-mask byte 2
001A66  cb 9f           res 3, a
001A68  ed 79           out (c), a        ; IO write 0x5006 with bit3 cleared
001A6A  78              ld a, b
001A6B  fe 50           cp 0x50
001A6D  28 01           jr z, 0x001A70
```

- RAM reads: none
- RAM writes: none
- IO reads: `0x5006`
- IO writes:
  - `0x500A <- 0x08`
  - `0x5006 <- (old & ~0x08)`
- Conditional branch:
  - `Z -> 0x001A70` (visited in Phase 56C keyboard pass)
  - `NZ -> 0x001A6F` (`RST 0x08`, never visited)
- Interpretation:
  - This does not inspect key matrix state.
  - It acknowledges the byte-2 source and then disables/masks bit 3 in the enable register.

### `0x001A70`

```text
001A70  79              ld a, c
001A71  fe 06           cp 0x06
001A73  20 fa           jr nz, 0x001A6F   ; panic if C is not 0x06
```

- RAM reads: none
- RAM writes: none
- Conditional branch:
  - `NZ -> 0x001A6F` (`RST 0x08`, never visited)
  - `Z -> 0x001A75` (visited)

### `0x001A75`

```text
001A75  18 bb           jr 0x001A32
```

- RAM reads: none
- RAM writes: none
- Unconditional jump: `0x001A32`

### `0x001A37` probe

`0x001A37` is **not** the next ADL block after `0x001A32`. In the ADL loop it is an instruction boundary *inside* `0x001A32` (`ld iy, 0xD00080`). The only lifted block rooted at `0x001A37` is a **z80-mode** alternate decode:

```text
001A37  fd 21 80 00     ld iy, 0x0080
001A3B  d0              ret nc
```

- This falls into `0x001A3C:z80`, which reuses the same epilogue bytes as the ADL exit.
- Conclusion:
  - `0x001A37` is not an ADL fallthrough target from the Phase 56C loop.
  - `0x001A32` already ends at `RETI`; there is no ADL successor block after it.

### `0x001A40`, `0x001A48`, `0x001A50` probes

These are instruction boundaries, not lifted ADL block roots:

```text
001A40  fd e1           pop iy            ; inside 0x001A32 epilogue
001A48  fb              ei                ; inside 0x001A32 epilogue
001A50  78              ld a, b           ; inside 0x001A4B / 0x001A4B:z80
```

- `0x001A40` and `0x001A48` live inside the common exit.
- `0x001A50` lives inside the byte-1 bit6 service branch rooted at `0x001A4B`.

## Untaken Sibling Blocks That Matter

These are the blocks Phase 56C never entered because `0x5015` and `0x5014` stayed zero.

### Byte-1 dispatcher (`0x5015 != 0`) from `0x0019C6`

```text
0019C6  0e 09           ld c, 0x09        ; acknowledge register 0x5009
0019C8  17              rla
0019C9  17              rla
0019CA  38 7f           jr c, 0x001A4B    ; original byte1 bit6

0019CC  17              rla
0019CD  da 77 1a 00     jp c, 0x001A77    ; original byte1 bit5

0019D1  17              rla
0019D2  da 8d 1a 00     jp c, 0x001A8D    ; original byte1 bit4

0019D6  17              rla
0019D7  17              rla
0019D8  da bb 1a 00     jp c, 0x001ABB    ; original byte1 bit2

0019DC  17              rla
0019DD  17              rla
0019DE  3e ff           ld a, 0xff
0019E0  ed 79           out (c), a        ; default ack 0x5009 <- 0xFF
0019E2  78              ld a, b
0019E3  fe 50           cp 0x50
0019E5  28 01           jr z, 0x0019E8

0019E8  79              ld a, c
0019E9  fe 09           cp 0x09
0019EB  20 fa           jr nz, 0x0019E7   ; panic rst 0x08

0019ED  18 43           jr 0x001A32
```

Downstream targets:

```text
001A4B  af              xor a
001A4C  cb f7           set 6, a
001A4E  ed 79           out (c), a        ; 0x5009 <- 0x40
001A50  78              ld a, b
001A51  fe 50           cp 0x50
001A53  28 01           jr z, 0x001A56
001A55  cf              rst 0x08
001A56  79              ld a, c
001A57  fe 09           cp 0x09
001A59  20 fa           jr nz, 0x001A55
001A5B  18 d5           jr 0x001A32
```

```text
001A77  af              xor a
001A78  cb ef           set 5, a
001A7A  ed 79           out (c), a        ; 0x5009 <- 0x20
001A7C  78              ld a, b
001A7D  fe 50           cp 0x50
001A7F  28 01           jr z, 0x001A82
001A81  cf              rst 0x08
001A82  79              ld a, c
001A83  fe 09           cp 0x09
001A85  20 fa           jr nz, 0x001A81
001A87  cd 35 9b 00     call 0x009B35
001A8B  18 a5           jr 0x001A32
```

First block of `0x009B35`:

```text
009B35  01 05 50 00     ld bc, 0x005005   ; enable-mask byte 1
009B39  ed 78           in a, (c)
009B3B  cb af           res 5, a
009B3D  ed 79           out (c), a        ; clear enable bit5
```

```text
001A8D  af              xor a
001A8E  cb e7           set 4, a
001A90  ed 79           out (c), a        ; 0x5009 <- 0x10
001A92  78              ld a, b
001A93  fe 50           cp 0x50
001A95  28 01           jr z, 0x001A98
001A97  cf              rst 0x08
001A98  79              ld a, c
001A99  fe 09           cp 0x09
001A9B  20 fa           jr nz, 0x001A97
001A9D  cd 20 02 01     call 0x010220
001AA1  18 8f           jr 0x001A32
```

`0x010220` is a stack-adjust trampoline:

```text
010220  21 ff ff ff     ld hl, 0xffffff
010224  cd 97 21 00     call 0x002197
```

`0x002197`:

```text
002197  dd e3           ex (sp), ix
002199  ed 12 00        lea de, ix+0
00219C  dd 21 00 00 00  ld ix, 0x000000
0021A1  dd 39           add ix, sp
0021A3  39              add hl, sp
0021A4  f9              ld sp, hl
0021A5  eb              ex de, hl
0021A6  e9              jp (hl)
```

```text
001ABB  af              xor a
001ABC  cb d7           set 2, a
001ABE  ed 79           out (c), a        ; 0x5009 <- 0x04
001AC0  78              ld a, b
001AC1  fe 50           cp 0x50
001AC3  28 01           jr z, 0x001AC6
001AC5  cf              rst 0x08
001AC6  79              ld a, c
001AC7  fe 09           cp 0x09
001AC9  20 fa           jr nz, 0x001AC5
001ACB  c3 32 1a 00     jp 0x001A32
```

### Byte-0 dispatcher (`0x5014 != 0`) from `0x0019F4`

```text
0019F4  0e 08           ld c, 0x08        ; acknowledge register 0x5008
0019F6  1f              rra
0019F7  1f              rra
0019F8  1f              rra
0019F9  1f              rra
0019FA  da a3 1a 00     jp c, 0x001AA3    ; original byte0 bit3

0019FE  1f              rra
0019FF  da cf 1a 00     jp c, 0x001ACF    ; original byte0 bit4

001A03  1f              rra
001A04  1f              rra
001A05  1f              rra
001A06  3e ff           ld a, 0xff
001A08  ed 79           out (c), a        ; default ack 0x5008 <- 0xFF
001A0A  78              ld a, b
001A0B  fe 50           cp 0x50
001A0D  28 01           jr z, 0x001A10

001A10  79              ld a, c
001A11  fe 08           cp 0x08
001A13  20 fa           jr nz, 0x001A0F   ; panic rst 0x08

001A15  18 1b           jr 0x001A32
```

Downstream targets:

```text
001AA3  af              xor a
001AA4  cb df           set 3, a
001AA6  ed 79           out (c), a        ; 0x5008 <- 0x08
001AA8  78              ld a, b
001AA9  fe 50           cp 0x50
001AAB  28 01           jr z, 0x001AAE
001AAD  cf              rst 0x08
001AAE  79              ld a, c
001AAF  fe 08           cp 0x08
001AB1  20 fa           jr nz, 0x001AAD
001AB3  cd ab 4d 01     call 0x014DAB
001AB7  c3 32 1a 00     jp 0x001A32
```

First state gate inside `0x014DAB`:

```text
014DAB  ed 4b 38 40 d1  ld bc, (0xd14038)
014DB0  ed 4b 38 40 d1  ld bc, (0xd14038)
014DB5  03              inc bc
014DB6  ed 43 38 40 d1  ld (0xd14038), bc
014DBB  3a 7b 40 d1     ld a, (0xd1407b)
014DBF  b7              or a
014DC0  20 0e           jr nz, 0x014DD0
014DC2  3a 8d 40 d1     ld a, (0xd1408d)
014DC6  b7              or a
014DC7  20 57           jr nz, 0x014E20
```

```text
001ACF  3e 10           ld a, 0x10
001AD1  ed 79           out (c), a        ; 0x5008 <- 0x10
001AD3  78              ld a, b
001AD4  fe 50           cp 0x50
001AD6  28 01           jr z, 0x001AD9
001AD8  cf              rst 0x08
001AD9  79              ld a, c
001ADA  fe 08           cp 0x08
001ADC  20 fa           jr nz, 0x001AD8
001ADE  2a 58 26 d0     ld hl, (0xd02658)
001AE2  2b              dec hl
001AE3  22 58 26 d0     ld (0xd02658), hl
001AE7  3a 51 26 d0     ld a, (0xd02651)
001AEB  3d              dec a
001AEC  fe ff           cp 0xff
001AEE  ca 32 1a 00     jp z, 0x001A32
001AF2  32 51 26 d0     ld (0xd02651), a
001AF6  c3 32 1a 00     jp 0x001A32
```

- This is the only dormant subpath in the local loop body that reads `0xD0xxxx` RAM directly.
- In the repo's interrupt-controller comments, low-byte bit4 is the OS timer bit. That matches the counter/decrement behavior here.

## Control Flow Diagram

```text
0019BE  read masked status byte1 (0x5015)
  Z  -> 0019EF  [visited]
  NZ -> 0019C6  [never visited]
          bit6 -> 001A4B -> 001A56 -> 001A5B -> 001A32
          bit5 -> 001A77 -> 001A82 -> 001A87 call 009B35 -> 001A8B -> 001A32
          bit4 -> 001A8D -> 001A98 -> 001A9D call 010220 -> 001AA1 -> 001A32
          bit2 -> 001ABB -> 001AC6 -> 001ACB -> 001A32
          none -> 0019DC -> 0019E8 -> 0019ED -> 001A32

0019EF  read masked status byte0 (0x5014)
  Z  -> 001A17  [visited]
  NZ -> 0019F4  [never visited]
          bit3 -> 001AA3 -> 001AAE -> 001AB3 call 014DAB -> 001AB7 -> 001A32
          bit4 -> 001ACF -> 001AD9 -> 001ADE -> 001AF2? -> 001A32
          none -> 001A03 -> 001A10 -> 001A15 -> 001A32

001A17  read masked status byte2 (0x5016)
  C  -> 001A5D -> 001A70 -> 001A75 -> 001A32   [visited once with keyboard IRQ armed]
  NC -> 001A23 -> 001A2D -> 001A32             [normal visited path]

001A32  restore callback, clear sysFlag bit6, RETI -> 0019B5 halt
```

## All `0xD0xxxx` Reads In The Loop Body

| Address | Block | Access | Used For Branch? | Notes |
| --- | --- | --- | --- | --- |
| `0xD0009B` | `0x001A32` | read-modify-write | No | `RES 6,(IY+27)` clears `sysFlag` bit 6. This is why Phase 56C sees `0xFF -> 0xBF`. |
| `0xD02658` | `0x001ADE` | read then write | No | 24-bit counter decremented on low-byte bit4 path. |
| `0xD02651` | `0x001AE7` | read | Yes, indirectly | `DEC A ; CP 0xFF ; JP Z,0x001A32`. Only local D0 read that affects a branch. |

Notes:

- There are **no** entry-side `0xD0xxxx` reads in `0x0019BE` or `0x0019EF`.
- The dispatcher decision is driven by IO ports `0x5015`, `0x5014`, and `0x5016`.
- `0xD02AD7` is written, not read, in the exit block.

## Which Branches Skip Versus Enter Dormant Work

### Branches that skip the dormant work

- `0x0019BE: JR Z,0x0019EF`
  - If masked status byte1 is zero, the loop skips every byte-1 service branch.
- `0x0019EF: JR Z,0x001A17`
  - If masked status byte0 is zero, the loop skips every byte-0 service branch.
- `0x001A17: JR C,0x001A5D`
  - This only selects the keyboard IRQ service branch. If carry is clear, the loop takes the generic byte-2 acknowledge path.

These two zero-tests at `0x0019BE` and `0x0019EF` are the exact reason the sustained Phase 56C loop does nothing visible.

### Branches that enter dormant work

- `0x0019BE` fallthrough to `0x0019C6`
  - Requires `0x5015 != 0`.
  - Opens the byte-1 dispatch tree for bits 6, 5, 4, and 2.
- `0x0019EF` fallthrough to `0x0019F4`
  - Requires `0x5014 != 0`.
  - Opens the byte-0 dispatch tree for bits 3 and 4.
- `0x001A17: JR C,0x001A5D`
  - Requires byte2 bit3 to be set.
  - This was already reached with forced keyboard IRQ and proved to be non-rendering.

### Best render-path inference

This is an inference, not a proof:

- The loop body itself looks like a masked-IRQ dispatcher, not a redraw scheduler.
- The strongest candidates for "first dormant work that might lead to redraw" are the unreached branches with real service calls:
  - `0x0019F4 -> 0x001AA3 -> CALL 0x014DAB`
  - `0x0019D1 -> 0x001A8D -> CALL 0x010220`
  - `0x0019CC -> 0x001A77 -> CALL 0x009B35`
- The only dormant branch that directly reads `0xD0xxxx` state is `0x0019FE -> 0x001ACF -> 0x001ADE`, so it is the best candidate if the redraw pipeline is timer-driven.
- The keyboard branch is not the render branch.

## Post-Init RAM State Relevant To Dormant Paths

Observed from the same boot + explicit-init setup used by the event-loop probes:

| Address | Post-init value |
| --- | --- |
| `0xD02651` | `0xFF` |
| `0xD02658` | `0xFFFFFF` |
| `0xD0009B` | `0xFF` |
| `0xD02AD7` | `0xFFFFFF` before manual loop seeding |
| `0xD14038` | `0xFFFFFF` |
| `0xD1407B` | `0xFF` |
| `0xD1408D` | `0xFF` |

Implications:

- The byte0-bit4 path (`0x001ACF -> 0x001ADE`) is **not** blocked by `0xD02651 == 0`; with the current snapshot it would decrement `0xFF -> 0xFE` and reach `0x001AF2`.
- That means the real blocker is still the IRQ status test at `0x0019EF`, not the D0 counters.

## Ranked RAM Bytes To Try Toggling

Strictly speaking, the immediate gate is **not a RAM byte**. It is the interrupt controller masked-status ports. If you only toggle RAM, `0x0019BE` still takes the zero-status path.

If Phase 59 wants RAM-side seed points anyway, this is the ranking:

1. `0xD02651`
   - Only local D0 byte that directly affects a branch.
   - Relevant only after forcing byte0 bit4 (`0x5014` bit4).
   - Try `0x00`, `0x01`, and `0xFF` to distinguish immediate exit versus writeback path.
2. `0xD02658`
   - 24-bit counter decremented on the same timer path.
   - Try `0x000000`, `0x000001`, and `0x000026`.
3. `0xD1407B`
   - First branch gate inside `0x014DAB` after forcing byte0 bit3.
4. `0xD1408D`
   - Second branch gate inside `0x014DAB` if `0xD1407B` is zero.
5. `0xD14038`
   - Rolling counter in `0x014DAB`; the function increments it and compares later against `0x0007D0`.
6. `0xD0009B`
   - Low-value render seed. It is only cleared on exit; no entry branch in this loop tests it.
7. `0xD02AD7`
   - Low-value render seed. The loop writes it back on exit; it is not the first decision point once `0x0019BE` is running.

## Unreached Conditional Targets For Phase 59

Never reached in either Phase 56C pass:

| From | Condition | Target | Meaning |
| --- | --- | --- | --- |
| `0x0019BE` | `NZ` on `IN (0x5015)` | `0x0019C6` | Byte-1 IRQ dispatcher |
| `0x0019C6` | byte1 bit6 set | `0x001A4B` | Ack bit6 and return |
| `0x0019CC` | byte1 bit5 set | `0x001A77` | Ack bit5, call `0x009B35` |
| `0x0019D1` | byte1 bit4 set | `0x001A8D` | Ack bit4, call `0x010220` |
| `0x0019D6` | byte1 bit2 set | `0x001ABB` | Ack bit2 and return |
| `0x0019DC` | `Z` on `B==0x50` sanity check | `0x0019E8` | Default byte-1 ack path |
| `0x0019EF` | `NZ` on `IN (0x5014)` | `0x0019F4` | Byte-0 IRQ dispatcher |
| `0x0019F4` | byte0 bit3 set | `0x001AA3` | Ack bit3, call `0x014DAB` |
| `0x0019FE` | byte0 bit4 set | `0x001ACF` | Ack bit4, read `D02658/D02651` |
| `0x001A03` | `Z` on `B==0x50` sanity check | `0x001A10` | Default byte-0 ack path |
| `0x001A23` | `NZ` on `B!=0x50` | `0x001A2C` | Panic `RST 0x08` |
| `0x001A2D` | `NZ` on `C!=0x0A` | `0x001A2C` | Panic `RST 0x08` |
| `0x001A5D` | `NZ` on `B!=0x50` | `0x001A6F` | Panic `RST 0x08` |
| `0x001A70` | `NZ` on `C!=0x06` | `0x001A6F` | Panic `RST 0x08` |

Reached only in the keyboard-armed Phase 56C pass:

| From | Condition | Target |
| --- | --- | --- |
| `0x001A17` | byte2 bit3 set | `0x001A5D` |

No conditional targets exist in `0x001A32` itself.

## Bottom Line For Phase 59

- The next seed should target **masked IRQ status bits**, not `sysFlag`.
- The cleanest first experiments are:
  1. force `0x5014` bit3 and trace `0x001AA3 -> 0x014DAB`
  2. force `0x5014` bit4 and trace `0x001ACF -> 0x001ADE`
  3. force `0x5015` bit4 or bit5 and trace the corresponding service calls
- If you want a RAM-assisted run, pair those IRQ seeds with:
  - `0xD02651` / `0xD02658` for the timer path
  - `0xD1407B` / `0xD1408D` / `0xD14038` for the `0x014DAB` path
