# Phase 443 - Trace Report for `0x001937`

Generated from direct ROM reads of [ROM.rom](./ROM.rom) and the companion probe [probe-phase443-trace-001937.mjs](./probe-phase443-trace-001937.mjs).

## Key Findings

- `0x001937` is the `DI` inside an unnamed wrapper that begins at `0x001933`. The actual `HALT` opcode is at `0x001942`, so the post-interrupt resume PC is `0x001943`, not `0x001938`.
- The low-vector stubs at `0x000000..0x000037` do not decode as `DI; STMIX; JP`. They decode as `DI; LD A,MB; LIL JP target`.
- Vector 0 targets `0x000658`, but that code is boot/setup logic. The live maskable timer wake path in the running OS is the IM1 entry at `0x000038 -> 0x0006F3`.
- The timer-specific handler is the byte0/bit4 branch at `0x001ACF`. It acknowledges the interrupt, decrements `0xD02658` and `0xD02651`, then exits through `0x001A32 -> EI -> RETI`.
- There is no direct jump from the timer IRQ back to `0x003A73`. After `RETI`, execution resumes at `0x001943`, runs a 3-instruction helper, and returns to the outer caller.

## 1. Function Containing `0x001937`

There is no ROM symbol table, so the name below is inferred from boundaries and callers.

### Inferred wrapper: `sleep_until_irq_wrapper` at `0x001933`

Boundary evidence:

- `0x001932` is a hard `RET`, so the previous routine ends there.
- `0x001933` is entered directly by tail jumps, including `0x003A81: JP NZ,0x001933` from the workflow event-loop tail.
- `0x001943` is a separate shared tail helper. It is also reached independently from elsewhere, so it is not the start of the wrapper.

Wrapper body:

```text
0x001933  CD 0D 62 00   call 0x00620D
0x001937  F3            di
0x001938  3E C0         ld a, 0xC0
0x00193A  ED 39 00      out0 (0x00), a
0x00193D  3E C4         ld a, 0xC4
0x00193F  ED 39 09      out0 (0x09), a
0x001942  76            halt
```

Shared tail immediately after the `HALT`:

```text
0x001943  ED 53 D7 2A D0   ld (0xD02AD7), de
0x001948  3A D9 2A D0      ld a, (0xD02AD9)
0x00194C  C9               ret
```

So the “0x001937 HALT barrier” is really:

- barrier entry: `0x001933`
- `DI`: `0x001937`
- `HALT`: `0x001942`
- resume after IRQ `RETI`: `0x001943`

## 2. Low Vector Bank `0x000000..0x00007F`

The ROM does not contain sixteen uniform 8-byte ISR stubs. Only slots `0..6` match the repeated stub form, and that form is:

```text
DI
LD A,MB
LIL JP target
```

Vector-window map:

| Slot | Address | Bytes | Target / meaning |
| --- | --- | --- | --- |
| 0 | `0x000000` | `F3 ED 7E 5B C3 58 06 00` | `0x000658` |
| 1 | `0x000008` | `F3 ED 7E 5B C3 FA 1A 00` | `0x001AFA` |
| 2 | `0x000010` | `F3 ED 7E 5B C3 10 01 02` | `0x020110` |
| 3 | `0x000018` | `F3 ED 7E 5B C3 14 01 02` | `0x020114` |
| 4 | `0x000020` | `F3 ED 7E 5B C3 18 01 02` | `0x020118` |
| 5 | `0x000028` | `F3 ED 7E 5B C3 1C 01 02` | `0x02011C` |
| 6 | `0x000030` | `F3 ED 7E 5B C3 20 01 02` | `0x020120` |
| 7 | `0x000038` | `08 D9 DD E5 FD E5 FD 21` | inline IM1 IRQ entry; later `JP 0x0006F3` at `0x000043` |
| 8 | `0x000040` | `80 00 D0 C3 F3 06 00 E5` | continuation of IM1 body |
| 9 | `0x000048` | `C5 CD BB 08 00 C1 E1 C2` | continuation of IM1 body |
| 10 | `0x000050` | `B5 19 00 F1 C3 A8 20 02` | tail of IM1 body; `JP 0x0220A8` at `0x000054` |
| 11 | `0x000058` | `FF FF FF FF FF FF FF FF` | `RST 38h` fill / padding |
| 12 | `0x000060` | `FF FF FF FF FF FF F5 ED` | padding followed by NMI helper prologue |
| 13 | `0x000068` | `38 3D E6 03 ED 39 3E 28` | NMI helper body; later `JP 0x001AFA` at `0x000072` |
| 14 | `0x000070` | `D6 F1 C3 FA 1A 00 FF FF` | tail of NMI helper |
| 15 | `0x000078` | `FF FF FF FF FF FF FF FF` | `RST 38h` fill / padding |

Practical conclusion:

- vector 0 is not the live periodic timer ISR entry in the running OS
- the live maskable IRQ entry is the IM1 handler at `0x000038`

## 3. What The Timer IRQ Does

### 3.1 Vector 0 target `0x000658`

Following vector 0 literally lands at `0x000658`, but the first 100 bytes are boot/setup code:

- port initialization on `0x01`, `0x07`, and `0x09`
- stack initialization to `0xD1A87E`
- `IM 1` setup at `0x00069A`

So `0x000658` is not the periodic timer ISR that wakes the `HALT` loop.

### 3.2 Real maskable IRQ front end: `0x000038 -> 0x0006F3`

The live IRQ path starts here:

```text
0x000038  ex af, af'
0x000039  exx
0x00003A  push ix
0x00003C  push iy
0x00003E  ld iy, 0xD00080
0x000043  jp 0x0006F3
```

Then the generic front end does:

```text
0x0006F3  in0 a, (0x06)
0x0006F6  bit 2, a
0x000704  set 6, (iy+0x1B)
0x000708  rsmix
0x00070A  cp 0xD0
0x00070C  jp nz, 0x0019B5
0x000710  ld hl, (0xD02AD7)
0x000714  push hl
0x000715  call 0x001713
0x000719  jp nz, 0x0019BE
0x00071D  jp 0x02010C
```

This is a generic IRQ entry, not a direct return to the event loop.

### 3.3 IRQ dispatcher and timer byte0/bit4 handler

The generic IRQ front end feeds the dispatcher at `0x0019B5`, which itself contains a second `DI/HALT` gate:

```text
0x0019B5  F3               di
0x0019B6  3E 10            ld a, 0x10
0x0019B8  ED 39 00         out0 (0x00), a
0x0019BD  76               halt
0x0019BE  40 01 15 50      ld bc, 0x5015
0x0019C2  ED 78            in a, (c)
...
```

The timer/status byte0 bit4 service branch is:

```text
0x001ACF  3E 10               ld a, 0x10
0x001AD1  ED 79               out (c), a
0x001ADE  2A 58 26 D0         ld hl, (0xD02658)
0x001AE2  2B                  dec hl
0x001AE3  22 58 26 D0         ld (0xD02658), hl
0x001AE7  3A 51 26 D0         ld a, (0xD02651)
0x001AEB  3D                  dec a
0x001AEC  FE FF               cp 0xFF
0x001AEE  CA 32 1A 00         jp z, 0x001A32
0x001AF2  32 51 26 D0         ld (0xD02651), a
0x001AF6  C3 32 1A 00         jp 0x001A32
```

Common exit:

```text
0x001A32  ... register restore ...
0x001A48  FB                  ei
0x001A49  ED 4D               reti
```

So the timer IRQ does not route directly to `0x003A73`. It acknowledges the controller state, updates two countdown values, and returns with `RETI`.

## 4. HALT -> Wake -> Event-Loop Path

The workflow event-loop tail is:

```text
0x003A73  call 0x003D5A
0x003A77  pop bc
0x003A78  or a
0x003A79  jr nz, 0x003A7D
0x003A7B  djnz 0x003A72
0x003A7D  call 0x001713
0x003A81  jp nz, 0x001933
0x003A85  jp 0x003A89
```

That gives this concrete wake path:

1. `0x003A81` tail-jumps into the wrapper at `0x001933`.
2. `0x001933` calls `0x00620D`, disables interrupts, programs ports `0x00` and `0x09`, and executes `HALT` at `0x001942`.
3. A timer IRQ wakes the CPU and enters the IM1 path at `0x000038`.
4. The IRQ path runs `0x0006F3`, then the dispatcher at `0x0019B5`, then the timer byte0/bit4 branch at `0x001ACF`.
5. `RETI` at `0x001A49` returns to the instruction after the original `HALT`, which is `0x001943`.
6. `0x001943..0x00194C` stores `DE`, loads `A`, and `RET`s.

Direct answer to the final question:

- the CPU does not resume at `0x001938`; `0x001937` is `DI`, while the `HALT` is `0x001942`
- the CPU resumes at `0x001943`
- the code after the wake does not loop directly back to `0x003A73`
- re-entry to `0x003A73` has to come from the surrounding scheduler or outer caller after the helper returns
