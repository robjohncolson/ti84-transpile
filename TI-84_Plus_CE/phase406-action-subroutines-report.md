# Phase 406: Top Action-Subroutine Trace

Static ROM inspection of the five most-called subroutine targets from Phase 405, using 120-byte disassembly windows rooted at each address.

## Headline Finding

The top five callees that receive the action byte are mostly shared FP slot helpers, not local action dispatchers.

- None of the five windows compare `A` against the expected action-code set: `0x08`, `0x09`, `0x0C`, `0x0D`, `0x1B`, `0x1C`, `0x1D`, `0x1E`, `0x1F`.
- Four of the five windows are pure constant-load / copy-helper families centered on the OP-slot RAM block around `0xD005F8`, `0xD00603`, `0xD0060E`, `0xD00619`, `0xD00624`, and `0xD0062F`.
- The only `CP` immediate in the whole top-five set is `CP 0x10` at `0x07C7AD` inside `0x07C74F`, and the surrounding code is arithmetic/normalization-oriented rather than action decoding.
- None of the five windows contain a computed jump such as `JP (HL)` or `JP (IX)`, so there is no local dispatch table in these targets.

## Summary Table

| Target | Prior label | CPs in 120-byte window | CALL/JP highlights | RAM focus | Dispatch table? |
| --- | --- | --- | --- | --- | --- |
| `0x07FA74` | `OP2Set1` | none | helper subentry calls `0x07FD4A`, `0x07FDF1`; otherwise fill loops only | `0xD00603`, `0xD0060E`, `0xD00619`, `0xD00624`, `0xD005F8`, `0xD005FA` | no |
| `0x07F954` | `OP1ToOP6` | none | pointer setup then `JR` into shared copy core at `0x07F974` / `0x07F97A` / `0x07F97C` | `0xD005F8`, `0xD005FA`, `0xD00603`, `0xD00605`, `0xD00610`, `0xD0061B`, `0xD00624`, `0xD00626`, `0xD0062F`, `0xD0063A` | no |
| `0x07F8CC` | `OP1ToOP3` | none | only `JP`/`JR` into shared copy core at `0x07F974`, `0x07F96C`, `0x07F930` | `0xD005F8`, `0xD00603`, `0xD0060E`, `0xD00619`, `0xD00624`, `0xD0062F` | no |
| `0x07F8FA` | `OP1ToOP2` | none | only `JR` into shared copy core at `0x07F974`, `0x07F96C`, `0x07F930` | `0xD005F8`, `0xD00603`, `0xD0060E`, `0xD00619`, `0xD00624`, `0xD0062F` | no |
| `0x07C74F` | `InvSub` | `0x07C7AD: CP 0x10` | calls `0x07CA06`, `0x07F8FA`, `0x07FA74`, `0x07FA07`, `0x07CC36`, `0x07FD50`, `0x07FD4A`, `0x080037`, `0x07FB19`; conditional jump to `0x07F968` | reads/writes around `0xD00603`, writes `0xD005F9`, loops from `0xD005FA`, reads `0xD005F8` | no |

## Per-Target Notes

### `0x07FA74` (`OP2Set1`)

Key bytes:

```text
0x07FA74  ld hl, 0xD00603
0x07FA78  ld a, 0x10
0x07FA7A  ld (hl), 0x00
0x07FA7D  ld (hl), 0x80
0x07FA80  ld (hl), a
...
0x07FA94  ret
```

- No `CP` instructions in the 120-byte window.
- Primary entry is a constant/zero-fill routine: it seeds `HL=0xD00603`, writes `00 80 10`, then zero-fills the remainder of the slot.
- Secondary entries at `0x07FA95`, `0x07FA9B`, `0x07FAA1`, `0x07FAC2`, `0x07FAC9`, and `0x07FACF` simply rebase `HL` to other slot addresses and reuse the same fill logic.
- This is a slot initializer, not an action decoder.

### `0x07F954` (`OP1ToOP6`)

Key bytes:

```text
0x07F954  ld hl, 0xD005F8
0x07F958  ld de, 0xD0062F
0x07F95C  jr 0x07F974
...
0x07F974  ldi
0x07F976  ldi
...
0x07F988  ldi
0x07F98A  ret
```

- No `CP` instructions and no subroutine calls.
- The window is pointer setup plus a shared `LDI` core. `0x07F974..0x07F988` is a 12-byte copy loop; sibling entries branch into `0x07F97A` / `0x07F97C` for shorter copies.
- All visible RAM references are source/destination slot bases, not action-code tables.
- This is a memcpy-style FP-slot helper family.

### `0x07F8CC` (`OP1ToOP3`)

Key bytes:

```text
0x07F8CC  ld de, 0xD0060E
0x07F8D0  ld hl, 0xD005F8
0x07F8D4  jp 0x07F974
```

- No `CP` instructions and no subroutine calls.
- Every entry in the 120-byte window is just HL/DE pointer setup followed by a tail jump or short branch into the shared copy cores (`0x07F974`, `0x07F96C`, `0x07F930`).
- The routine family moves data between OP-style slot buffers; it does not branch on action codes.

### `0x07F8FA` (`OP1ToOP2`)

Key bytes:

```text
0x07F8FA  ld hl, 0xD005F8
0x07F8FE  ld de, 0xD00603
0x07F902  jr 0x07F974
```

- No `CP` instructions and no subroutine calls.
- Like `0x07F8CC`, this window is entirely pointer rebasing plus short branches into the copy helpers.
- It is another FP-slot mover rather than a local action dispatcher.

### `0x07C74F` (`InvSub`)

Key bytes:

```text
0x07C74F  call 0x07CA06
0x07C753  jr 0x07C77F
...
0x07C796  call 0x07FD4A
0x07C79A  jp z, 0x07F968
0x07C79E  call 0x080037
...
0x07C7A8  ld (0xD005F9), a
0x07C7AD  cp 0x10
0x07C7AF  jp nc, 0x07F968
```

- This is the only top-five window with a `CP` immediate: `CP 0x10` at `0x07C7AD`.
- That compare does not match any of the action-code values from the dispatch pipeline.
- The surrounding code calls FP helpers, flips bit 7 of the byte at `0xD00603`, writes `0xD005F9`, loops from `0xD005FA`, and conditionally jumps to `0x07F968` (another slot-copy helper).
- The visible behavior is consistent with arithmetic normalization / subtraction support, not key-action dispatch.

## Conclusion

The Phase 405 caller-count heuristic surfaced shared FP utility routines, not the real action interpreter.

- `0x07FA74`, `0x07F954`, `0x07F8CC`, and `0x07F8FA` are constant-load or slot-copy helpers.
- `0x07C74F` is an arithmetic helper chain with a single `CP 0x10`, but still not an action-code switch.
- No top-five target contains the expected `CP` values or a computed-jump dispatch table.

The next pass should probably pivot away from "most frequently called" and instead look for callees that both:

- receive `A` from the action readers, and
- perform immediate `CP` tests against the known action-code set or branch through a real table.
