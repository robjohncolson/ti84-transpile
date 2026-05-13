# Phase 313: Entry 49 Callback Mechanism (`0xD14026`)

## Scope

This pass traces the RAM callback slot at `0xD14026`, which phase 311 previously tied to low-address jump-vector entry 49 (`0x00063C -> 0x00FBD1`).

Method:

- ROM byte search for the ADL-form address bytes `26 40 D1`
- ROM byte search for the 16-bit partial `26 40`
- Disassembly with `decodeInstruction(rom, offset)`
- Follow-up trace of the shared helper vectors:
  - `0x000130 (= _frameset0)`
  - `0x000138 (= _icmpzero)`
  - `0x00015C (= _indcall)`

## Raw Search Result

- Exact `26 40 D1`: `7` raw hits
- Partial `26 40`: `53` raw hits
- Distinct real ADL instructions touching `0xD14026`: `7`
- Reads vs writes: `4` reads, `3` writes
- Of the 4 reads, `2` immediately feed `_indcall`
- Additional distinct 16-bit-only sites: `0`
- Conclusion on the partial search: the same seven real sites also decode as short-form `0x4026` memory operands in 16-bit mode; the other `46` pair hits are unrelated collisions

So there are no extra hidden 16-bit callback references beyond the seven full-address sites.

## Reference Sites

| Site | Class | Containing routine | Effect | Interpretation |
| --- | --- | --- | --- | --- |
| `0x00B75E` | write | `0x00B730` (approx) | `LD (0xD14026), BC` with `BC = 0x00FBD1` | Installs the direct vector-49 body into the slot |
| `0x013231` | read | `0x01322D` | `LD HL, (0xD14026)` | Loads the slot for a null-check |
| `0x01323F` | indirect-call | `0x01322D` | `LD IY, (0xD14026)` then `CALL 0x00015C` | Actual indirect dispatch through the slot |
| `0x02BA66` | write | `0x02BA3A` (approx) | `LD (0xD14026), BC` with `BC = 0x00063C` | Early registration stores the vector slot itself |
| `0x041E99` | read | `0x041E95` | `LD HL, (0xD14026)` | Second null-check wrapper |
| `0x041EA7` | indirect-call | `0x041E95` | `LD IY, (0xD14026)` then `CALL 0x00015C` | Second actual indirect dispatch |
| `0x048CFC` | write | `0x048CF8` | `LD (0xD14026), BC` with `BC = 0x02C0B8` | Later rewrite installs a direct callback body |

## Callback Invocation

The real invocation path is not `CALL 0x00063C`.

Both wrapper routines use the same pattern:

```asm
0x01322D  call 0x000130        ; _frameset0
0x013231  ld   hl, (0xD14026)
0x013235  call 0x000138        ; _icmpzero
0x013239  jr   z, return
0x01323B  ld   bc, (ix+6)
0x01323E  push bc
0x01323F  ld   iy, (0xD14026)
0x013244  call 0x00015C        ; _indcall
```

And the trampoline body is just:

```asm
0x002288  jp (iy)
```

Meaning:

1. Set up an `IX` stack frame
2. Load the callback pointer from `0xD14026`
3. Compare it against zero
4. Push one argument from the caller (`BC` loaded from `IX+6`)
5. Reload the callback pointer into `IY`
6. Indirect-jump to it through `_indcall`

So the slot is a null-checked callback pointer with one stack-framed argument, not a literal vector call.

## Upstream Callers

The two wrappers are not dead code:

- `0x01322D` has `13` direct CALL/JP references
- `0x041E95` has `14` direct CALL/JP references

Representative call sites push bitmask-like values before invoking the wrapper:

- `0x0085BE` pushes `0x0800`
- `0x0095B9` pushes `0x0002`
- `0x0099AC` pushes `0x0020`
- `0x009A05` pushes `0x0010`
- `0x009A82` pushes `0x4000`
- `0x009AA4` pushes `0x0200`
- `0x00A58D` pushes `0x0004`
- `0x0711FD` pushes `0x1000`

That looks like an event/reason bitmask interface, not a fixed timer tick callback.

## What Gets Stored There

The slot is rewritten across at least three states:

1. `0x02BA66` stores `0x00063C`
   - this is the public vector slot itself
   - it keeps the callback indirected through entry 49

2. `0x00B75E` stores `0x00FBD1`
   - this is the concrete target body behind vector 49

3. `0x048CFC` stores `0x02C0B8`
   - this is another direct callback body
   - it is structurally very close to `0x00FBD1`, but routed through the public helper vectors (`_frameset0`, `_icmpzero`) instead of calling the helper bodies directly

So entry 49 is best understood as the first published callback alias. The live slot later moves to direct ROM bodies.

## Classification

Best fit: **USB/runtime event callback**, not a standalone timer callback.

Why:

- Entry 49 sits immediately after the public USB endpoint/FIFO helper block (`0x000608..0x000638`)
- The earliest writer is in the `0x02BAxx` USB-control neighborhood and manipulates the same USB-adjacent port block
- The callback wrappers are called with many different bitmask-style arguments
- Later stores replace the vector alias with direct handler bodies rather than a timer-service stub

There may still be timer-adjacent code in the broader `0x049xxx` service cluster, but the evidence at `0xD14026` points to a **USB-side runtime notification hook / event sink**, not a generic periodic timer callback.

## Bottom Line

- All real `0xD14026` references are now accounted for: `7` total instruction sites
- The slot is read `4` times and written `3` times
- The actual invocation is `LD IY, (0xD14026)` followed by `_indcall -> JP (IY)`
- Entry 49 is only one installed value; the runtime later rewrites the slot to direct bodies `0x00FBD1` and `0x02C0B8`
- The mechanism looks like a USB/runtime event callback path with a pushed bitmask argument
