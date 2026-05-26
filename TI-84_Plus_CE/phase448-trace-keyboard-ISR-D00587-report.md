# Phase 448: Trace `D00587` Keyboard Scan-Code Writers

## Summary

- Absolute 24-bit store scan of `ROM.rom` found exactly four `LD (0xD00587),A` sites:
  - `0x003D4B`
  - `0x003D7B`
  - `0x028C2D`
  - `0x03F9FA`
- No `LD (0xD00587),HL/BC/DE/SP` absolute stores were found. In particular, these patterns were absent:
  - `22 87 05 D0`
  - `ED 43 87 05 D0`
  - `ED 53 87 05 D0`
  - `ED 63 87 05 D0`
  - `ED 73 87 05 D0`
- There is one additional indirect write to `D00587` at `0x03FA0F`: `LD (HL),0x00`, with `HL` loaded from `0xD00587` at `0x03FA09`.
- The real scan-code producer is `0x003D4B`, inside the low ROM keyboard scan routine reached from the scheduler poll wrapper `0x001652 -> 0x003CC2`.
- The inspected `RST 38h` front-end path `0x000038 -> 0x0006F3 -> 0x001713` does not directly reach any `D00587` writer. The `D00587` producer is foreground-polled, not written by that interrupt front-end.

## 1. Raw ROM Search Results

Searches run directly against `TI-84_Plus_CE/ROM.rom`:

- `32 87 05 D0` (`LD (0xD00587),A`) -> `0x003D4B`, `0x003D7B`, `0x028C2D`, `0x03F9FA`
- `AF 32 87 05 D0` (`XOR A; LD (0xD00587),A`) -> `0x003D7A`
- `22 87 05 D0` (`LD (0xD00587),HL`) -> none
- `ED 43 87 05 D0` (`LD (0xD00587),BC`) -> none
- `ED 53 87 05 D0` (`LD (0xD00587),DE`) -> none
- `ED 63 87 05 D0` (`LD (0xD00587),HL`) -> none
- `ED 73 87 05 D0` (`LD (0xD00587),SP`) -> none

Additional pointer search:

- `21 87 05 D0` (`LD HL,0xD00587`) -> `0x03FA09` only

That single `LD HL,0xD00587` is immediately followed by an indirect clear:

```asm
0x03FA09  21 87 05 D0      LD HL,0xD00587
0x03FA0D  F3               DI
0x03FA0E  7E               LD A,(HL)
0x03FA0F  36 00            LD (HL),0x00
0x03FA11  FD CB 00 9E      RES 3,(IY+0)
0x03FA15  FB               EI
```

## 2. Every ROM Write Site

| Write PC | Bytes | Instruction | Containing routine | Role | ISR front-end reachable? |
| --- | --- | --- | --- | --- | --- |
| `0x003D4B` | `32 87 05 D0` | `LD (0xD00587),A` | low ROM keyboard scan routine `0x003CC2..0x003D59` | real scan-code commit | No direct path found from `0x000038 -> 0x0006F3` |
| `0x003D7B` | `32 87 05 D0` | `LD (0xD00587),A` | low ROM `_GetCSC` entry `0x003D5A..0x003D84` | clear after read (`A` was zeroed at `0x003D7A`) | No |
| `0x028C2D` | `32 87 05 D0` | `LD (0xD00587),A` | foreground reset/state routine `0x028B9E..0x028CBB` | clear (`XOR A` at `0x028C28`) | No |
| `0x03F9FA` | `32 87 05 D0` | `LD (0xD00587),A` | banked key-commit helper `0x03F9FA..0x03FA08` just before `0x03FA09` | commit validated/repeated key value | No |
| `0x03FA0F` | `36 00` | `LD (HL),0x00` | `0x03FA09` entry | indirect clear after draining `D00587` | No |

## 3. Containing Function Notes

### `0x003D4B`

This site is a leaf helper inside the low ROM keyboard scan block:

```asm
0x003CC2  ... hardware scan setup ...
0x003D36  LD A,H
0x003D37  DEC A
0x003D3D  RLA
0x003D3E  RLA
0x003D3F  RLA
0x003D40  INC A
0x003D41  RR L
0x003D43  JR NC,0x003D40
0x003D47  SCF
0x003D48  LD A,0xFF
0x003D4A  RET
0x003D4B  LD (0xD00587),A
0x003D4F  SET 3,(IY+0)
0x003D53  OR A
0x003D54  RET Z
0x003D55  LD (0xD0058D),A
0x003D59  RET
```

Containment:

- No `PUSH IX` prologue is present.
- The callable outer routine starts at `0x003CC2`.
- Direct code references to `0x003CC2` are:
  - `0x001656` -> `CALL 0x003CC2`
  - `0x003C63` -> `CALL 0x003CC2`
  - `0x0003D4` -> `JP 0x003CC2`
- Direct code references to `0x003D4B` are:
  - `0x003C98` -> `JP 0x003D4B`
  - `0x003C9C` -> `CALL 0x003D4B`

This is the only site that actually commits the computed scan code to `D00587`.

### `0x003D7B`

This site is inside the low ROM `_GetCSC` consumer path:

```asm
0x003D5A  LD B,0x34
0x003D5C  BIT 3,(IY+0)
0x003D60  JR NZ,0x003D75
...
0x003D75  LD A,(0xD00587)
0x003D79  LD B,A
0x003D7A  XOR A
0x003D7B  LD (0xD00587),A
0x003D7F  LD A,B
0x003D80  RES 3,(IY+0)
0x003D84  RET
```

Containment:

- Direct ROM caller to `0x003D5A` is only `0x003A73`.
- `0x003D7B` is a consume-and-clear step, not a producer.

### `0x028C2D`

Boundary scan shows the previous hard terminator at `0x028B9D`, so this write sits inside a routine starting at `0x028B9E` and returning at `0x028CBB`:

```asm
0x028C20  RES 5,(IY+31)
0x028C24  RES 3,(IY+0)
0x028C28  XOR A
0x028C29  LD (0xD0058D),A
0x028C2D  LD (0xD00587),A
0x028C31  CALL 0x0298B2
...
0x028CBB  RET
```

This is a foreground reset/clear path. It zeroes both `D0058D` and `D00587`; it does not derive a scan code from hardware state.

### `0x03F9FA`

This is the banked twin of the low ROM commit helper:

```asm
0x03F9FA  LD (0xD00587),A
0x03F9FE  SET 3,(IY+0)
0x03FA02  OR A
0x03FA03  RET Z
0x03FA04  LD (0xD0058D),A
0x03FA08  RET
0x03FA09  LD HL,0xD00587
```

Containment:

- It is a standalone helper entry ending at `0x03FA08`.
- Direct references to `0x03F9FA` are:
  - `0x03F9CD` -> `JP 0x03F9FA`
  - `0x03F9D1` -> `CALL 0x03F9FA`
  - `0x0562D5` -> `CALL 0x03F9FA`

Like `0x003D4B`, this routine commits a validated key value already present in `A`. It does not scan the keyboard matrix itself.

### `0x03FA0F`

This write is not an absolute-address opcode, so it does not appear in the `32 87 05 D0` scan. It is still a real write to `D00587`:

```asm
0x03FA09  LD HL,0xD00587
0x03FA0D  DI
0x03FA0E  LD A,(HL)
0x03FA0F  LD (HL),0x00
```

This is the banked consumer entry that drains `D00587` before the later `D141B5` handoff.

## 4. Is the Writer in the `RST 38h` ISR Chain?

### What the interrupt front-end does

The `RST 38h` front-end is:

```asm
0x000038  EX AF,AF'
0x000039  EXX
0x00003A  PUSH IX
0x00003C  PUSH IY
0x00003E  LD IY,0xD00080
0x000043  JP 0x0006F3
```

And the next stage is:

```asm
0x0006F3  IN0 A,(0x06)
...
0x000715  CALL 0x001713
0x000719  JP NZ,0x0019BE
0x00071D  JP 0x02010C
```

### What the cross-references say

Cross-reference scan for the real producer path:

- `0x001652` is called from:
  - `0x0015F7`
  - `0x0017A0`
- `0x003CC2` is referenced only by:
  - `0x001656` -> `CALL 0x003CC2`
  - `0x003C63` -> `CALL 0x003CC2`
  - `0x0003D4` -> `JP 0x003CC2`
- `0x003D4B` is referenced only by:
  - `0x003C98` -> `JP 0x003D4B`
  - `0x003C9C` -> `CALL 0x003D4B`

No direct `CALL` or `JP` from the inspected `0x000038 -> 0x0006F3 -> 0x001713` chain reaches `0x001652`, `0x003CC2`, or `0x003D4B`.

### Conclusion on ISR reachability

The `D00587` producer used by the home-screen pipeline is not in the visible `RST 38h` interrupt front-end chain. The real producer is the scheduler polling path:

```text
0x0015F7 -> CALL 0x001652 -> CALL 0x003CC2 -> ... -> 0x003D4B -> D00587
```

So the concrete answer is:

- If the question is "which function computes and writes the scan code?" -> `0x003CC2`, with the final store at `0x003D4B`.
- If the question is "which function inside the `RST 38h` front-end writes `D00587`?" -> none was found in the inspected `0x000038 -> 0x0006F3 -> 0x001713` path.

## 5. Verified `0x03FA09` Entry Code

ROM bytes at `0x03FA09` are:

```text
21 87 05 D0 F3 7E 36 00 FD CB 00 9E FB
```

Disassembly:

```asm
0x03FA09  LD HL,0xD00587
0x03FA0D  DI
0x03FA0E  LD A,(HL)
0x03FA0F  LD (HL),0x00
0x03FA11  RES 3,(IY+0)
0x03FA15  EI
```

So Session 446 was correct about the drain/clear sequence, with one extra detail at the front: the routine first loads `HL` with `0xD00587`.

## 6. Scan-Code Computation Logic

The sequential scan code written by `0x003D4B` is computed in `0x003CC2..0x003D43`, not in `0x03FA09`.

High-level logic:

1. The routine scans keyboard groups in reverse order.
2. `H` tracks the current group index in scan order.
3. `L` holds the active bit mask for the detected key.
4. `0x003D36..0x003D43` convert that `(group, bit)` pair into the OS scan code:

```asm
0x003D36  LD A,H
0x003D37  DEC A
0x003D3D  RLA
0x003D3E  RLA
0x003D3F  RLA
0x003D40  INC A
0x003D41  RR L
0x003D43  JR NC,0x003D40
```

That yields:

```text
scan_code = (group_index_in_OS_order * 8) + bit + 1
```

Using the matrix naming from `keyboard-matrix.md`, this is equivalent to:

```text
OS_scan_code = (6 - matrix_group) * 8 + bit + 1
```

Examples:

- `GRAPH` -> `0x01`
- `2ND` -> `0x06`
- `ENTER` -> `0x29`
- `DOWN` -> `0x31`

The final computed value is committed at `0x003D4B` by `LD (0xD00587),A`.

## Final Answer

The home-screen `D00587` scan-code writer is `0x003D4B` inside the low ROM keyboard scan routine `0x003CC2`. The other `D00587` writes are clears or banked helper copies:

- `0x003D7B` clears after low ROM `_GetCSC`
- `0x028C2D` clears during a foreground reset path
- `0x03F9FA` is the banked commit helper just before `0x03FA09`
- `0x03FA0F` is the indirect clear inside `0x03FA09`

The inspected `RST 38h` front-end path does not directly reach the producer. The actual producer is the scheduler poll path `0x0015F7 -> 0x001652 -> 0x003CC2 -> 0x003D4B`.
