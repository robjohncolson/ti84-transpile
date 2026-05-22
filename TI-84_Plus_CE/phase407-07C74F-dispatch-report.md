# Phase 407: 0x07C74F Dispatch Deep Trace

Static ROM follow-up for the Phase 406 `0x07C74F` window, using a 384-byte linear disassembly (`0x07C74F..0x07C8CE`) plus 30-byte previews of the first 13 unique direct `CALL/JP` targets encountered by `0x07C7DD`.

## Headline

`0x07C74F` still is not the real action-code switch.

- Its local compares are all `CP 0x10` (`0x07C7AD`, `0x07C7F1`, `0x07C873`), not action codes.
- The `CP 0x10` path compares the absolute delta between `0xD005F9` and `0xD00604`, then uses that delta as the loop count for repeated `0x07FB19` `RRD` digit shifts.
- The first genuine action-code branch is delegated immediately to `0x07CA06`, which calls `0x07F7BD` (`A = 0xD005F8 & 0x3F`) and then compares against `0x1C` and `0x1D`.

That means the meaningful dispatch logic is one hop below `0x07C74F`, not inside its `CP 0x10` block.

## Key Findings

### 1. `CP 0x10` is an operand-alignment threshold, not an action compare

The key upstream helper is `0x080037`:

```text
0x080037  ld a, (0xD005F9)
0x08003B  ld hl, 0xD00604
0x08003F  sub (hl)
0x080040  ret
```

So the returned value is the byte difference:

`A = (0xD005F9) - (0xD00604)`

`0x07C74F` then splits on the sign of that subtraction:

- `0x07C7A2: JR NC,0x07C7EF` keeps the non-negative delta and re-checks it at `0x07C7F1`.
- The carry-set path at `0x07C7A4..0x07C7AC` rebuilds the absolute value by restoring the larger byte from `(HL)=0xD00604`, writing it back to `0xD005F9`, and subtracting the smaller saved value.

After the compare, both paths do this:

```text
ld b, a
ld hl, 0xD005FA   ; or 0xD00605 on the sibling path
call 0x07FB19
djnz ...
```

`0x07FB19` is a repeated `RRD` digit-shift helper, so `0x10` is functioning as a BCD/exponent alignment limit. It is not checking the action byte.

### 2. The first real action-code test is in `0x07CA06`

Among the first 13 direct `CALL/JP` targets, only `0x07CA06` contains requested action-code compares in its first 30 bytes:

```text
0x07CA06  call 0x07F7BD
0x07CA0A  cp 0x1C
0x07CA0E  cp 0x1D
0x07CA10  jp z, 0x07D189
```

And `0x07F7BD` is the byte reader/normalizer:

```text
0x07F7BD  ld a, (0xD005F8)
0x07F7C1  and 0x3F
0x07F7C3  ret
```

So the action-code chain is:

1. `0x07C74F` enters `0x07CA06`
2. `0x07CA06` asks `0x07F7BD` for `0xD005F8 & 0x3F`
3. `0x07CA06` compares that stripped action byte against `0x1C` / `0x1D`

This is the first direct evidence of known action-code dispatch near `0x07C74F`.

### 3. No indirect dispatch table shows up here

The 384-byte scan found:

- 70 total `CALL/JP/JR/DJNZ` branch instructions
- 45 unique branch targets
- 29 unique direct `CALL/JP` targets

But it found no:

- `JP (HL)`
- `JP (IX)`
- `JP (IY)`
- other computed-jump style indirect dispatch opcodes in the scanned window

So this is still a compare-and-helper chain, not a local jump-table dispatcher.

## The Prompt’s 13 Direct Targets

The prompt’s “13 CALL/JP targets” line matches the first 13 unique direct `CALL/JP` destinations discovered by `0x07C7DD`:

| Target | First seen | First-30-byte result | Action-code compares? |
| --- | --- | --- | --- |
| `0x07CA06` | `0x07C74F` | calls `0x07F7BD`, then `CP 0x1C` / `CP 0x1D` | yes: `0x1C`, `0x1D` |
| `0x07F8FA` | `0x07C755` | slot copy helper (`0xD005F8 -> 0xD00603`) | no |
| `0x07FA74` | `0x07C75B` | slot initializer writing `00 80 10` | no |
| `0x07FA07` | `0x07C761` | slot rebasing wrapper around shared copy/init cores | no |
| `0x07CC36` | `0x07C787` | clears scratch bytes near `0xD00601` / `0xD0060C` | no |
| `0x07FD50` | `0x07C791` | guard/helper reading `0xD00605`, `0xD005FA`, `0xD005F8` | no |
| `0x07FD4A` | `0x07C796` | zero/guard helper rooted at `0xD005FA` | no |
| `0x07F968` | `0x07C79A` | copy helper (`0xD00603 -> 0xD005F8`) | no |
| `0x080037` | `0x07C79E` | byte-delta helper: `(0xD005F9) - (0xD00604)` | no |
| `0x07FB19` | `0x07C7B8` | repeated `RRD` digit-shift loop | no |
| `0x07FC72` | `0x07C7D3` | arithmetic helper entry | no |
| `0x07FBF2` | `0x07C7D9` | arithmetic helper entry | no |
| `0x07FC7C` | `0x07C7DD` | arithmetic helper entry | no |

Later in the 384-byte scan, `0x07C74F` reaches more local and external helper targets, but none of them changed the main conclusion: the only nearby action-code compares are the `0x1C/0x1D` tests in `0x07CA06`.

## Conclusion

The deeper trace narrows the useful next step:

- Stop treating `0x07C7AD` as a possible action dispatch site. It is an operand-alignment check on slot metadata bytes.
- Pivot to the delegated helper chain rooted at `0x07CA06` and its adjacent entries (`0x07CA27`, `0x07D189`), because that is where `0xD005F8` is finally interpreted as an action code.
- In this cluster, the first confirmed action cases are `0x1C` and `0x1D`. No `0x08`, `0x09`, `0x0C`, `0x0D`, `0x1E`, or `0x1F` compares appeared in the first-30-byte previews of the prompt target set.
