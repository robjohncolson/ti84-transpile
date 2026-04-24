# Phase 25AR - Post-empty-ENTER Static Disassembly

Generated: 2026-04-24

## Executive Answer

- The empty-history ENTER path cannot reach `0x058693` within the same `0x0585E9` invocation.
- The decisive instruction is `0x058637  jp z, 0x058C65`: this is a `JP`, not a `CALL`, so no intra-handler return address is pushed.
- `0x058C82  ret` therefore returns to the caller that entered `0x0585E9` rather than to `0x05863B` or `0x058693`.
- `0x058693` is only reached on the non-empty paths: explicitly by `0x058668  jr 0x058693`, or by fall-through after `0x05868F  call 0x05E872` returns.
- Static conclusion: empty ENTER is a ParseInp dead end for this handler invocation.

## Supporting Stack Snippet

### 0x058621..0x058638

```text
0x058621  F5                 push af
0x058622  CD AE 81 05        call 0x0581AE
0x058626  CD 11 92 09        call 0x099211
0x05862A  FB                 ei
0x05862B  CD CB 21 09        call 0x0921CB
0x05862F  F1                 pop af
0x058630  20 38              jr nz, 0x05866A
0x058632  3A 0B 1D D0        ld a, (0xD01D0B)
0x058636  B7                 or a
0x058637  CA 65 8C 05        jp z, 0x058C65
```

- `0x058621  push af` saves flags before the history-manager call chain.
- `0x058622`, `0x058626`, and `0x05862B` are ordinary `call`s that all return before control reaches `0x05862F`.
- `0x05862F  pop af` balances the earlier `push af`.
- `0x058637  jp z, 0x058C65` pushes no return address.
- Therefore the stack at entry to `0x058C65` is the same stack the outer caller gave to `0x0585E9`.
- When `0x058C82  ret` executes, it consumes that outer caller frame; it does not continue at `0x05863B` and cannot fall into `0x058693`.

## 0x058630..0x058695 - ENTER Handler Branch Window

```text
0x058630  20 38              jr nz, 0x05866A
0x058632  3A 0B 1D D0        ld a, (0xD01D0B)  ; target: numLastEntries
0x058636  B7                 or a
0x058637  CA 65 8C 05        jp z, 0x058C65  ; empty-history dispatch | target: empty-ENTER handler
0x05863B  CD B8 00 08        call 0x0800B8
0x05863F  28 0A              jr z, 0x05864B
0x058641  CD 81 FF 07        call 0x07FF81
0x058645  CD C6 81 05        call 0x0581C6
0x058649  18 14              jr 0x05865F
0x05864B  CD 4B 38 08        call 0x08384B
0x05864F  CD 6A E8 05        call 0x05E86A
0x058653  CD AE E3 05        call 0x05E3AE
0x058657  CD D8 E7 05        call 0x05E7D8
0x05865B  CD AE 81 05        call 0x0581AE
0x05865F  40 ED 5B 80 26     sis ld de, (0x002680)
0x058664  CD E6 8E 05        call 0x058EE6
0x058668  18 29              jr 0x058693  ; target: common tail
0x05866A  E5                 push hl
0x05866B  40 ED 5B 80 26     sis ld de, (0x002680)
0x058670  CD E6 8E 05        call 0x058EE6
0x058674  CD 7B FF 07        call 0x07FF7B
0x058678  CD 4F 38 08        call 0x08384F
0x05867C  11 F9 FF FF        ld de, 0xFFFFF9
0x058680  19                 add hl, de
0x058681  36 23              ld (hl), 0x23
0x058683  E1                 pop hl
0x058684  19                 add hl, de
0x058685  36 21              ld (hl), 0x21
0x058687  CD 4F 38 08        call 0x08384F
0x05868B  CD 4D E8 05        call 0x05E84D
0x05868F  CD 72 E8 05        call 0x05E872
0x058693  97                 sub a  ; common tail
0x058694  32 8D 05 D0        ld (0xD0058D), a
```

Key observation: the only explicit intra-handler branch to `0x058693` in this window is `0x058668  jr 0x058693`, and that sits on the non-empty path. The empty-history path goes to `0x058C65` instead.

## 0x058C65..0x058C90 - Empty-ENTER Handler Tail

```text
0x058C65  CD A8 00 08        call 0x0800A8  ; empty-ENTER handler
0x058C69  C0                 ret nz
0x058C6A  CD 83 8C 05        call 0x058C83
0x058C6E  CD B8 00 08        call 0x0800B8
0x058C72  C4 EE 83 05        call nz, 0x0583EE
0x058C76  FD CB 0C EE        set 5, (iy+12)  ; shared flag helper
0x058C7A  FD CB 05 A6        res 4, (iy+5)
0x058C7E  FD CB 45 8E        res 1, (iy+69)
0x058C82  C9                 ret  ; RET from empty-ENTER
0x058C83  CD FF 8C 05        call 0x058CFF
0x058C87  CD 7B FF 07        call 0x07FF7B
0x058C8B  CD 4F 38 08        call 0x08384F
0x058C8F  22 4E 24 D0        ld (0xD0244E), hl
```

This slice already settles the branch question:

- There is no `jr 0x058693`.
- There is no `jp 0x058693`.
- The top-level block ends at `0x058C82  ret`.

That `ret` is not a return to the instruction after `0x058637`, because `0x058637` was a `JP`.

## 0x058693..0x0586F0 - Common Tail With ParseInp Handoff

```text
0x058693  97                 sub a  ; common tail
0x058694  32 8D 05 D0        ld (0xD0058D), a
0x058698  FD CB 0C F6        set 6, (iy+12)
0x05869C  FD CB 00 EE        set 5, (iy+0)
0x0586A0  CD 76 8C 05        call 0x058C76  ; target: shared flag helper
0x0586A4  FB                 ei
0x0586A5  CD 61 29 08        call 0x082961
0x0586A9  CD 5E 21 09        call 0x09215E
0x0586AD  40 ED 53 8C 26     sis ld (0x00268C), de
0x0586B2  40 22 8E 26        sis ld (0x00268E), hl
0x0586B6  CD 02 29 08        call 0x082902
0x0586BA  3E 02              ld a, 0x02
0x0586BC  FD CB 34 66        bit 4, (iy+52)
0x0586C0  C4 B3 39 02        call nz, 0x0239B3
0x0586C4  FD CB 45 86        res 0, (iy+69)
0x0586C8  FD CB 45 CE        set 1, (iy+69)
0x0586CC  20 25              jr nz, 0x0586F3
0x0586CE  FD CB 49 B6        res 6, (iy+73)
0x0586D2  CD D1 1F 0A        call 0x0A1FD1
0x0586D6  FD CB 02 8E        res 1, (iy+2)
0x0586DA  FD CB 44 96        res 2, (iy+68)
0x0586DE  FB                 ei
0x0586DF  CD DD 27 0A        call 0x0A27DD
0x0586E3  CD 10 99 09        call 0x099910  ; ParseInp call site
0x0586E7  FD CB 08 8E        res 1, (iy+8)
0x0586EB  21 00 00 00        ld hl, 0x000000
0x0586EF  40 22 AC 26        sis ld (0x0026AC), hl
```

This is the parser-bearing path. The empty-ENTER path never re-enters it.

## Direct Xref Check For 0x0585E9

Byte scan results:

| Pattern | Hits | Result |
|---|---:|---|
| `CALL 0x0585E9` | 0 | none |
| `JP 0x0585E9` | 1 | `0x058AA2` |
| `JP Z, 0x058C65` | 1 | `0x058637` |

Supporting snippet:

```text
0x058A98  CD B1 0A 09        call 0x090AB1
0x058A9C  CD 2F 82 05        call 0x05822F
0x058AA0  3E 0F              ld a, 0x0F
0x058AA2  C3 E9 85 05        jp 0x0585E9
```

There is no direct `CALL 0x0585E9` in ROM. The only direct code xref is a `JP`. That is consistent with the stack argument: the empty-enter `ret` is unwinding an outer caller frame, not returning to an instruction after `0x058637`.

## Empty-ENTER Helper-Cluster Exits

The broader `0x058Cxx..0x058Dxx` helper cluster contains several local exits. The important distinction is:

- `0x058C69` and `0x058C82` are top-level returns from the empty-enter handler itself.
- the other `ret` sites are helper returns to local call sites such as `0x058C6E` or `0x058C87`.
- the non-return exits jump to external helpers, not to `0x058693`.

Representative exit sites:

| Site | Instruction | Why It Does Not Reach 0x058693 |
|---|---|---|
| `0x058C69` | `ret nz` | top-level early return from empty-ENTER to the caller of `0x0585E9` |
| `0x058C82` | `ret` | top-level final return from empty-ENTER to the caller of `0x0585E9` |
| `0x058CB1` | `ret z` | local helper return back to `0x058C6E` |
| `0x058CD6` | `ret nz` | local helper return back to `0x058C6E` |
| `0x058CDB` | `ret` | local helper return back to `0x058C6E` |
| `0x058D03` | `ret nc` | helper return back to `0x058C87` after the `0x058CFF` call |
| `0x058D18` | `ret` | helper return back to `0x058C87` after the `0x058CFF` call |
| `0x058D29` | `jp z, 0x061D42` | jumps into error/unwind code, not the common tail |
| `0x058D2D` | `ret` | local helper return; not a rejoin to `0x058693` |
| `0x058DA6` | `jp 0x082448` | jumps into a generic dispatcher helper, not the common tail |

None of these exits point at `0x058693`.

## Final Conclusion

`0x058637` sends the empty-history path to `0x058C65` with an unconditional `JP`, so control never returns to `0x05863B` and never falls through to the common tail at `0x058693`. The top-level empty-enter block ends at `0x058C82  ret`, which unwinds the caller of `0x0585E9` rather than resuming inside the handler.

Static answer:

- Empty ENTER does not reach `0x058693`.
- Empty ENTER does not reach the `0x0586E3 -> call 0x099910` ParseInp handoff.
- After `0x058C65` returns, control leaves this `0x0585E9` invocation and goes back to the external caller/dispatcher, not to the common tail.

