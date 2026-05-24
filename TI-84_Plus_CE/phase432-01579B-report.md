# Phase 432: Trace 0x01579B Report

## Verdict

`0x01579B` is **not** a timer-arm routine. It is a 6-byte leaf that clears the 1-byte RAM flag `D176FC` and returns:

```asm
0x01579B  XOR A
0x01579C  LD (0xD176FC),A
0x0157A0  RET
```

There are **no** timer MMIO writes (`0xF20000-0xF200FF`), **no** legacy port `IN`/`OUT` instructions, and **no** call-outs inside the function body.

## Size

- Total size: **6 bytes**
- Span: `0x01579B..0x0157A0`

## What Timer Hardware It Arms

None.

- Timer 1: no access
- Timer 2: no access
- Timer 3: no access
- Timer control / IRQ status / IRQ enable: no access
- Legacy timer ports: no access

The function does not configure a counter, reload value, prescaler, mode bit, or interrupt source. The earlier “timer arm” interpretation from the `0x00B8BC` caller was provisional and is contradicted by the ROM bytes at `0x01579B`.

## Direct Effects

### Absolute RAM References

| Address | Access | Meaning |
| --- | --- | --- |
| `0xD176FC` | write `0` | Clears a 1-byte gate/busy flag |

### CALL Targets

None.

### Port I/O

None.

### Conditional Paths

None. The routine is an unconditional straight-line leaf:

1. zero `A`
2. store `A` to `D176FC`
3. return

## The Paired Getter

The next leaf at `0x0157A1` is the matching read helper:

```asm
0x0157A1  LD A,(0xD176FC)
0x0157A5  RET
```

That pairing strongly supports the interpretation that `D176FC` is a shared protocol flag with tiny setter/getter utilities, not a timer register shadow.

## Caller Context: `0x00B8BC`

The only direct caller is `0x00B904`, inside the event-`0x47` recovery helper `0x00B8BC`.

That caller:

1. saves interrupt state and executes `DI`
2. zeroes three USB/link recovery blocks:
   - `D176A8` (`0x62` bytes)
   - `D1770A` (`0x60` bytes)
   - `D1776A` (`0x4D` bytes)
3. writes the same caller-supplied 24-bit value into:
   - `D17792`
   - `D176CB`
4. calls `0x01579B`
5. conditionally restores `EI`

Crucially, **`0x00B8BC` also contains no timer MMIO or timer port I/O**. So neither the caller nor callee actually programs hardware timer registers.

## What `D176FC` Actually Does

Existing phase-415/416 decoding already mapped `D176FC`:

- `0x0150E9` (`0x0150C2` generic completion dispatcher) reads `D176FC`
- if `D176FC == 0` and `D1772D != 0`, the dispatcher can take the Channel 3 USB fallback path
- that path calls `0x006EDA`
- on failure, callers may relay into `0x0019B5`

So `D176FC` is a **gate/busy flag** in the USB/link completion path. Clearing it at `0x01579B` does not start a timer; it re-opens the “not busy” path used by later Channel 3 recovery/dispatch logic.

Additional cross-reference evidence:

- sole known setter: `0x0BCD24` writes `1` to `D176FC`
- other clear sites: boot/init and protocol cleanup helpers
- paired getter: `0x0157A1`

## What `D17792` and `D176CB` Really Feed

The two words written by `0x00B8BC` look like “timer latches” only if taken in isolation. Cross-references point elsewhere:

### `D176CB`

- read by `0x0151A7`, the **Channel 3 staging helper**
- copied into `D176C3`, the callback-argument slot for that notification block

### `D17792`

- read by `0x01567C`, the **USB/link notification wrapper**
- pushed into `0x0151FE`, which stores it into `D17773` before arming the `D17770..D1777A` staging block

That means the values staged by `0x00B8BC` are better modeled as **notification/callback arguments for two linked USB/link completion channels**, not hardware timer countdown registers.

## Relationship to USB Recovery

The event-`0x47` path in `0x0089F8` is still a recovery/setup path, but the last step is not “arm timer hardware.” The ROM evidence supports this sequence instead:

1. scrub three USB/link recovery/state blocks
2. pre-stage two callback/notification argument words (`D17792`, `D176CB`)
3. clear `D176FC` so the protocol is no longer marked busy

Later, when the notification/completion machinery runs:

- Channel 3 logic can see `D176FC == 0`
- the generic dispatcher `0x0150C2` is allowed to enter its Channel 3 USB fallback branch
- that branch polls USB status through `0x006EDA`
- failing cases may escalate through `0x0019B5`

So the recovery effect is **software-state re-arming of the USB/link notification path**, not a timer interrupt firing from Timer 1/2/3.

## Configuration Values Written

Hardware timer configuration values written by `0x01579B`: **none**

Related software values staged by the caller:

| Address | Value source | Role |
| --- | --- | --- |
| `D17792` | `(IX+6)` from `0x00B8BC` caller | notification arg for the `0x01567C -> 0x0151FE` path |
| `D176CB` | `(IX+6)` from `0x00B8BC` caller | notification arg source for Channel 3 staging at `0x0151A7` |
| `D176FC` | `0` written by `0x01579B` | clears gate/busy flag |

## Bottom Line

`0x01579B` should be renamed conceptually from “timer arm” to something like:

- `clear_D176FC_gate`
- `usb_link_clear_busy_flag`
- `channel3_gate_clear`

The timer interpretation is not supported by the disassembly. The function is a tiny RAM-flag clear stub used by the event-`0x47` USB/link recovery path.
