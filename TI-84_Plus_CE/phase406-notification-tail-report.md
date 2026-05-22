# Phase 406: Notification Common Tail at `0x049DF9`

## Executive Summary

- `0x049DF9..0x049E06` is a 14-byte shared epilogue used after every `0x049D3A` payload-store handler.
- It does **not** write `0xD177B9`. The flash dispatcher already commits the new type at `0x049D07`.
- It does **not** call the recursive flush path. The only recursive self-call is earlier at `0x049CFE`.
- It restores interrupt state with the expected `POP AF / JP PO / EI` sequence.
- It returns `A = (IX-1)`, then tears down the IX-based frame with `LD SP,IX / POP IX / RET`.

## Evidence

### Type Commit Happens Before The Tail

```text
0x049CFE  CD CA 9C 04       CALL 0x049CCA
0x049D02  C1                POP BC
0x049D03  C1                POP BC
0x049D04  DD 7E 09          LD A, (IX+0x09)
0x049D07  32 B9 77 D1       LD (0xD177B9), A
0x049D0B  18 04             JR 0x049D11
```

A direct ROM scan for `32 B9 77 D1` finds only two write sites:

- `0x008879`
- `0x049D07`

So the flash copy already commits the type byte before the payload handlers run.

### Handler Flow Into The Tail

```text
0x049DE3  DD 7E 06          LD A, (IX+0x06)
0x049DE6  32 B8 77 D1       LD (0xD177B8), A
0x049DEA  18 0D             JR 0x049DF9

0x049DEC  DD 7E 06          LD A, (IX+0x06)
0x049DEF  32 B8 77 D1       LD (0xD177B8), A
0x049DF3  18 04             JR 0x049DF9

0x049DF5  DD 36 FF 02       LD (IX-0x01), 0x02
```

Notes:

- `0x049DE3` is the last explicit handler (`state 0x18`).
- `0x049DEC` is the inline table default and does the same payload write.
- `0x049DF5` is an adjacent return-slot stub that seeds `(IX-1)=0x02` before falling into the same epilogue. It is **not** the `0x049D3A` table default.

### True Common Tail

```text
0x049DF9  F1                POP AF
0x049DFA  E2 FF 9D 04       JP PO, 0x049DFF
0x049DFE  FB                EI
0x049DFF  DD 7E FF          LD A, (IX-0x01)
0x049E02  DD F9             LD SP, IX
0x049E04  DD E1             POP IX
0x049E06  C9                RET
```

### Save Half Of The Interrupt Pattern

```text
0x049CD6  ED 57             LD A, I
0x049CD8  F5                PUSH AF
0x049CD9  F3                DI
```

That entry-side snippet makes the epilogue unambiguous: the function saves the old IFF2 state in the parity flag via `LD A,I`, pushes it, disables interrupts, then later restores that state with `POP AF / JP PO / EI`.

## Findings

### `D177B9` Type Byte

The tail does **not** touch `0xD177B9`.

- The new type is already committed at `0x049D07`.
- No instruction in `0x049DF9..0x049E06` writes global RAM at all.

### Recursive Flush

The tail does **not** recurse and does **not** call out to helpers.

- The recursive flush is the earlier `CALL 0x049CCA` at `0x049CFE`.
- By the time execution reaches `0x049DF9`, recursion is over and the payload store has already happened.

### Interrupt State Restore

The expected pattern is present exactly:

1. `POP AF`
2. `JP PO, 0x049DFF`
3. `EI`

Interpretation:

- `POP AF` restores the saved flags from the `LD A,I / PUSH AF` prologue.
- `JP PO` skips `EI` when the saved parity flag says IFF2 was clear.
- `EI` runs only when interrupts were previously enabled.

So the epilogue restores the caller's interrupt-enabled state instead of always enabling interrupts unconditionally.

### Return Value In `A`

Session 405's claim is confirmed:

```text
0x049DFF  DD 7E FF          LD A, (IX-0x01)
```

The tail returns the local `return_code` byte from `(IX-1)`, not the payload and not the type byte.

Observed producers of `(IX-1)` in the surrounding dispatcher:

- `0x049CD2`: initialize `(IX-1)=0x00`
- `0x049D0D`: set `(IX-1)=0x01` on early blocked/abort path
- `0x049D24`: store the result of `CALL 0x049A23` into `(IX-1)`
- `0x049DF5`: seed `(IX-1)=0x02` in the adjacent return-2 stub

So on the normal matched handler path, the common tail returns `A=0x00`.

### RAM Reads/Writes In The True Tail

Inside `0x049DF9..0x049E06`:

- Local frame read: `(IX-1)` at `0x049DFF`
- Global RAM reads: none
- Global RAM writes: none

It does **not** read or write `0xD177B8` or `0xD177B9`.

## Forward 120-Byte Window Note

The requested forward window from `0x049DF9` immediately crosses into the next function:

```text
0x049E07  21 FF FF FF       LD HL, 0xFFFFFF
0x049E0B  CD 2C 01 00       CALL 0x00012C
0x049E0F  DD 36 FF 00       LD (IX-0x01), 0x00
0x049E13  3A B9 77 D1       LD A, (0xD177B9)
0x049E17  B7                OR A
0x049E18  ED 62             SBC HL, HL
0x049E1A  6F                LD L, A
0x049E1B  CD 24 01 00       CALL 0x000124
```

This is **not** part of the common tail. It is the next routine, the `get_last_key`-style state dispatch previously identified in earlier phase work. The bytes at `0x049E1F` and later are inline `_seqcase` data for that next function, not straight-line code from the tail.

## CALL Targets Visible In That Forward Window

The true tail has no `CALL` instructions. The only calls in the requested 120-byte forward window belong to the next function at `0x049E07`.

### `CALL 0x00012C` From `0x049E0B`

Jump-table vector:

```text
0x00012C  C3 97 21 00       JP 0x002197
```

Resolved helper (`0x002197`):

```text
0x002197  DD E3             EX (SP), IX
0x002199  ED 12 00          LEA DE, IX+0x00
0x00219C  DD 21 00 00 00    LD IX, 0x000000
0x0021A1  DD 39             ADD IX, SP
0x0021A3  39                ADD HL, SP
0x0021A4  F9                LD SP, HL
0x0021A5  EB                EX DE, HL
0x0021A6  E9                JP (HL)
```

This is a frame/setup trampoline, not part of the notification tail.

### `CALL 0x000124` From `0x049E1B`

Jump-table vector:

```text
0x000124  C3 1B 21 00       JP 0x00211B
```

Resolved helper (`0x00211B`):

```text
0x00211B  FD E3             EX (SP), IY
0x00211D  F5                PUSH AF
0x00211E  C5                PUSH BC
0x00211F  D5                PUSH DE
0x002120  ED 33 02          LEA IY, IY+0x02
0x002123  FD 17 FE          ld-pair-indexed
0x002126  01 00 00 00       LD BC, 0x000000
0x00212A  FD 4E 00          LD C, (IY+0x00)
0x00212D  FD 23             INC IY
0x00212F  E5                PUSH HL
0x002130  B7                OR A
0x002131  ED 42             SBC HL, BC
0x002133  E1                POP HL
0x002134  28 11             JR Z, 0x002147
0x002136  52 1B             DEC DE
0x002138  06 00             LD B, 0x00
```

This is the OS `_seqcase` helper used by the next routine's state-based dispatch.

## Bottom Line

After every handler stores the payload byte to `0xD177B8`, the shared path at `0x049DF9` does only four things:

1. restore saved flags with `POP AF`
2. conditionally re-enable interrupts with `JP PO / EI`
3. load the function result from `(IX-1)` into `A`
4. tear down the IX frame and `RET`

So the notification lifecycle is:

1. exit guard decides whether the old state can be left
2. recursive flush runs if needed
3. new type is committed to `0xD177B9`
4. handler stores payload to `0xD177B8`
5. `0x049DF9` restores interrupts and returns the local status code
