# Phase 439 - D1407C USB State Trace

## Summary

- 17 direct literal references to `0xD1407C` were found across the full 4 MB ROM.
- All 17 are true memory references: 9 writes, 8 reads, 0 address-loads.
- No IX/IY base+offset references to D1407C were found.
- After mirror grouping, those 17 references collapse to 10 logical site families.
- Only `0x00` and `0x01` are ever written, so D1407C is a boolean latch.
- The only setter family is the `0x009807 / 0x0491C8` bus-reset handler path, where D1407C and D1407D are both set to `1` and port `0x3120` is read-modify-written.
- The strongest clearer is `0x00C7D2 / 0x02B638`, where `D1407E` is set to `1` immediately before D1407C is cleared and port `0x3100` is accessed.

That keeps the earlier phase-437 label mostly intact: D1407C is still best understood as a bus-reset/connect-side latch. Session 438's D1407E evidence refines that to "pre-active / pending until D1407E takes over" rather than a stable active-state flag.

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 9 |
| Reads | 8 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Logical site families | 10 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| `0x00xxxx` | 8 |
| `0x02xxxx` | 3 |
| `0x04xxxx` | 4 |
| `0x0Bxxxx` | 2 |

## Logical Site Families

| Lead Site | Mirrors | Type | Nearby D140xx (+/-20) | Nearby Port I/O | Interpretation |
| --- | --- | --- | --- | --- | --- |
| `0x0097BC` | `0x04917D` | READ | `D14038`, `D1407B` | `IN A,(0x313D)`, `OUT (0x313D),A` | SOF/front-end gate. If D1407C is clear, the fall-through seeds `D1407B=1` and zeroes `D14038`; if D1407C is set, the code skips that work. |
| `0x009807` | `0x0491C8` | WRITE `0x01` | `D1407D`, `D1408C` | `IN A,(0x3120)`, `OUT (0x3120),A` | Only setter family. This is inside the `0x0096CB / 0x04908C` bus-reset handler; D1407C and D1407D are latched together before the `0x3120` RMW sequence. |
| `0x009892` | `0x04925D` | READ | `D1407B`, `D1407E`, `D140B2` | - | Teardown gate. If `D1407B` is already set or D1407C is set, the fall-through clears `D1407E`, `D17796`, and `D140B2`. |
| `0x00C7D2` | `0x02B638` | WRITE `0x00` | `D1407E` | `IN A,(0x3100)`, `OUT (0x3100),A` | Pipe-activation handoff. `D1407E` is set to `1`, then D1407C is cleared, then port `0x3100` is touched. This is the tightest D1407C/D1407E coupling in the ROM. |
| `0x00FCFF` | `0x02C269` | WRITE `0x00` | `D14078`, `D14079`, `D1407A` | - | Bulk state reset. The immediate window clears `D1407C`, `D14078`, `D14079`, and `D1407A`; the same routine continues on to clear `D1407B`, `D1407E`, and `D1407F`. |
| `0x012D0A` | - | WRITE `0x00` | `D14073`, `D14081` | - | Low-ROM helper epilogue. Clears `D14081` first, then clears D1407C immediately before returning. |
| `0x014DC9` | `0x0BCC9F` | READ | `D14038`, `D1407B`, `D1408D` | - | Deferred USB/link worker gate (local block `0x014DAB` from phase 418). D1407C must be set before the `D14038 > 0x07D0` threshold and `D177B8 < 0x40` path can matter. |
| `0x014DF8` | `0x0BCCCE` | READ | `D14081` | - | Late gate in the same deferred-worker family. If D1407C is set, the code falls through into the helper-call path before `D14081` is consulted. |
| `0x02C394` | - | WRITE `0x00` | - | - | Standalone clear-and-return stub. No nearby D140xx companions or port I/O in the immediate window. |
| `0x041D8A` | - | WRITE `0x00` | `D1407B`, `D1407E`, `D14081` | `IN A,(0x3100)`, `OUT (0x3100),A` | Flash-only clear site. Clears `D14081`, D1407C, and `D1407B`, then immediately enters the `D1407E` / `0x3100` service block. |

## Read Gates

| Lead Site | Mirrors | Gate | What it means |
| --- | --- | --- | --- |
| `0x0097BC` | `0x04917D` | `OR A; JR NZ` | If D1407C is already set, skip the "first SOF" style bookkeeping that sets `D1407B` and zeroes `D14038`. |
| `0x009892` | `0x04925D` | `OR A; JR Z` | If D1407C is clear, skip the teardown path; if it is set, fall through into the D1407E/D140B2 clear sequence. |
| `0x014DC9` | `0x0BCC9F` | `OR A; JR Z` | D1407C is a required gate before the deferred worker bothers with the `D14038` threshold and `D177B8` checks. |
| `0x014DF8` | `0x0BCCCE` | `OR A; JR Z` | D1407C is also required for the later helper-call branch in the same worker family. |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| `D1407B` | 7 |
| `D1407E` | 5 |
| `D14038` | 4 |
| `D14081` | 4 |
| `D14078` | 2 |
| `D14079` | 2 |
| `D1407A` | 2 |
| `D1407D` | 2 |
| `D1408C` | 2 |
| `D1408D` | 2 |
| `D140B2` | 2 |
| `D14073` | 1 |

Two patterns matter most:

- `D1407B` is the dominant sibling latch. The front-end handler uses D1407C to decide whether to seed `D1407B`, and the deferred worker also consults both.
- `D1407E` is the strongest adjacent partner. The activation-site clear (`0x00C7D2 / 0x02B638`) is the exact point where control appears to hand off from D1407C to D1407E.

## Lifecycle

1. Bus reset / connect-side event arrives in the `0x0096CB / 0x04908C` family.
   D1407C is set to `1` alongside `D1407D`, and port `0x3120` is updated.
2. Front-end SOF-style code checks D1407C.
   If the flag is still clear, it seeds `D1407B` and resets `D14038`; if the flag is already set, it skips that bookkeeping.
3. Deferred worker code (`0x014DAB` family from phase 418) uses D1407C as one of its required gates before deeper follow-up work can run.
4. Activation handoff happens at `0x00C7D2 / 0x02B638`.
   `D1407E` is asserted, then D1407C is cleared, then port `0x3100` is touched.
5. Bulk teardown paths clear D1407C again as part of larger state resets.

That is why the safest naming is not `usb_pipe_active` or generic `usb_transfer_pending`. The active state belongs to D1407E. D1407C is the earlier-stage latch that exists before that handoff.

## Conclusion

- D1407C is a boolean pre-active USB latch: only `0x00` and `0x01` are ever written.
- The only setters live in the bus-reset handler family, so `usb_reset_pending` or `usb_connect_pending` is the safest name.
- Session 438's D1407E result is confirmed and strengthened here: D1407C is cleared at the exact point where D1407E becomes active.
- `usb_pipe_activation_pending` is also defensible if you want a name that emphasizes the D1407E handoff instead of the bus-reset source.
