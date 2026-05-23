# Phase 418: Trace `0x010220` Display Callback Dispatcher

## Summary

- `0x010220` is the real display callback dispatcher behind vector 224 (`0x000580 -> JP 0x010220`) and the direct ISR service call at `0x001A9D`.
- The routine does not implement a counted loop or pointer walk over `D177BD-D177C9`. It is a fully unrolled five-slot pipeline with fixed-address blocks for slots 0-4.
- `D177D6` is a consume-then-rearm queue for slots 1-3 only. Existing bits are consumed first; new bits 1/2/3 are synthesized from the current status sample later in the same pass, so that newly armed work is deferred to the next dispatcher invocation.
- Slot 0 and slot 4 are immediate-status callbacks. Slot 0 is gated by the sampled status byte bit 0, and slot 4 is gated by sampled bit 4 and sets `D177E1 = 1` before the callback.

## Entry And Exit

Entry points:

- `0x000580`: OS vector 224 relay, `JP 0x010220`
- `0x001A9D`: direct `CALL 0x010220` from the `0x0019B5` byte1/bit4 ISR service path

Exit behavior:

- `0x01022D` is the earliest escape: if `D177BC == 0`, the function jumps straight to the common epilogue at `0x01038D`.
- All other paths also converge on `0x01038D`.
- The only real return is `0x0103A3`, after `CALL 0x007DC7`, a final byte save into `(IX-1)`, `CALL 0x007DDB`, and frame teardown (`LD SP,IX; POP IX; RET`).

## Function Shape

| Phase | Range | Purpose |
| --- | --- | --- |
| Prologue | `0x010220-0x010240` | `__frameset`, master-enable test, sample LCD/display status through `0x007DC7`, store sample in `(IX-1)` |
| Immediate pass A | `0x010241-0x0102F2` | If sampled bit0 is set, clear/use `D177D7`, dispatch slot0, then consume queued `D177D6` bits 1/2/3 for slots1-3 |
| Arm pass B | `0x0102F6-0x010369` | Re-check the sampled byte and set `D177D6` bits 1/2/3 for the next invocation |
| Immediate slot4 | `0x01036D-0x010389` | If sampled bit4 is set, write `D177E1 = 1` and dispatch slot4 immediately |
| Epilogue | `0x01038D-0x0103A3` | Final `0x8034` read/write helper pair and return |

The important correction is that the dispatcher is not "iterating" by incrementing through the callback table. The five 3-byte entries are handled by five hard-coded basic blocks:

- slot0: `D177BD`
- slot1: `D177C0`
- slot2: `D177C3`
- slot3: `D177C6`
- slot4: `D177C9`

## Per-Slot Behavior

| Slot | Pointer | Gate | Queueing | Side effects before callback |
| --- | --- | --- | --- | --- |
| 0 | `D177BD` | sampled status bit0 (`(IX-1) & 0x01`) | not queued through `D177D6` | if `D177D7 != 0`, `CALL 0x007CF1`, then clear `D177D7` |
| 1 | `D177C0` | existing `D177D6 bit1` | bit1 cleared first, re-armed later from sampled status bit1 | `SET 5,(0xD000BF)` |
| 2 | `D177C3` | existing `D177D6 bit2` | bit2 cleared first, re-armed later from sampled status bit2 | none |
| 3 | `D177C6` | existing `D177D6 bit3` | bit3 cleared first, re-armed later from sampled status bit3 | `CALL 0x010090` |
| 4 | `D177C9` | sampled status bit4 (`(IX-1) & 0x10`) | not queued through `D177D6` | `D177E1 = 1` |

Every real callback dispatch uses the same pattern:

1. `LD HL,(slot)`
2. `CALL 0x0021C2` to test `HL == 0`
3. `JR Z,skip`
4. `LD IY,(slot)`
5. `CALL 0x002288` (`JP (IY)`)

## `D177D6` Timing

The function uses `D177D6` as a deferred pending-bit byte, but only for slots 1-3:

- consume side:
  - `0x010284`: clear bit1
  - `0x0102B6`: clear bit2
  - `0x0102DB`: clear bit3
- arm side:
  - `0x010315`: set bit1 from sampled status bit1
  - `0x01033F`: set bit2 from sampled status bit2
  - `0x010369`: set bit3 from sampled status bit3

Because the arm side runs after the consume side, any bit set during the current invocation is not revisited until the next `0x010220` entry. That makes slots 1-3 a one-pass-delayed queue, not immediate callbacks.

This also confirms the corrected phase 417 model:

- slot 0 has no dedicated `D177D6` bit
- slots 1-3 use `D177D6` bits 1/2/3
- slot 4 does not use `D177D6 bit4`

## `D177D7` And `D177E1`

`D177D7` is not just a passive byte:

- It is read at the front of the slot0 path.
- If non-zero, it is written through helper `0x007CF1` before slot0 dispatch.
- It is then explicitly cleared at `0x010256`.
- Later, the sampled-bit2 and sampled-bit3 arm paths reuse `D177D7` as a latch: when `D177D7 == 0`, they refresh it from `0x007CD3` and call `0x007CAD(2)` before setting the corresponding `D177D6` bit.

`D177E1` is simpler:

- It is written only in the slot4 path (`0x010376: D177E1 = 1`).
- Slot4 then null-checks `D177C9` and dispatches immediately.

## Direct RAM Access Map

Direct accesses inside `0x010220` are:

- `D177BC`: read once at entry
- `D177BD`, `D177C0`, `D177C3`, `D177C6`, `D177C9`: each read twice (`HL` null-check preload, then `IY` dispatch load)
- `D177D6`: read during the slot1-3 consume phase and written by both the consume and arm phases
- `D177D7`: read before slot0 and during sampled-bit2/bit3 arm paths; written when cleared or refreshed
- `D177E1`: written once before slot4
- `D000BF`: written once before slot1 dispatch (`SET 5,(IY+63)` after loading `IY = 0xD00080`)
- `(IX-1)`: one-byte local frame slot used to hold the sampled `0x8034` status byte across the whole pass

The slot3 helper call `0x010090` is outside the direct body of `0x010220`, but its entry immediately reads `D177DB` and `D177D8`. That is a callee side effect, not a direct access by dispatcher instructions themselves.

## Conclusion

`0x010220` is best described as a two-phase, fully unrolled display callback dispatcher:

1. sample status and service immediate work (slot0, then previously queued slots1-3)
2. queue the next slot1-3 work from the same sample
3. optionally fire slot4 immediately
4. finalize through a common epilogue

That is the key structural result from tracing this routine. The "dispatch loop" terminology is conceptually useful for the five callback slots, but the ROM implementation itself is an explicit straight-line pipeline with branch skips, not a real indexed loop.
