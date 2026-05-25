# Phase 437: D14073 Write Sites + D14070-D1407F USB State Block

## Summary

- `D14073` has 12 write sites: 6 constant SET, 4 constant CLEAR, and 2 live port-sample stores.
- The `D14073` lifecycle is now explicit: callback/event completion -> attach detect -> enumerate/enable -> state-machine cleanup -> disable/teardown.
- `D14070` and `D14071` are zero-reference gaps.
- No addr-load style references were found anywhere in `D14070-D1407F`; the whole window behaves like a byte-state block, not a pointer block.

## D14073 Write Sites

| Write PC | Category | Value written | Semantic block | Prologue search | Direct callers | Context |
| --- | --- | --- | --- | --- | --- | --- |
| `0x008B3F` | SET | `1` (`LD A,0x01`) | `0x00840C` low-ROM event-completion callback | `PUSH IX @ 0x00840C` | `0x013A1C CALL` | Clears `D1440E`, then latches `D14073=1` after the `D1440F` / `D177B7` gate succeeds. |
| `0x009A26` | SET | `1` (`LD A,0x01`) | `0x0098D2` deep USB service dispatcher | no `PUSH IX`; nearest RET-bounded entry `0x0099A2` (semantic block `0x0098D2`) | `0x009BBA CALL` | Priority attach-detect path: live `0x3082` bit 4 is present, so the dispatcher sets `D14073=1` before `CALL 0x012D13`. |
| `0x00F11E` | CLEAR | `0` (`XOR A`) | `0x00EFA0` large USB state-machine cleanup | no `PUSH IX`; nearest RET-bounded entry `0x00EFA0` | none found by exact CALL/JP scan | Cleanup / disconnect arm: after the `D14088` + `0x3082` handling path, it clears `D14073` before the tail helper call. |
| `0x012EED` | SET | `1` (`LD A,0x01`) | `0x012E4D` USB enable / enumerate helper | no `PUSH IX`; nearest RET-bounded entry `0x012E4D` | `0x0099BC CALL`, `0x009A0A CALL`, `0x00B85A CALL` | Post-null-check enable path: sets `D14073=1`, then writes `D14042=0x0F` and `D14046=0x21`. |
| `0x012F80` | CLEAR | `0` (`XOR A`) | `0x012E4D` USB disable / teardown helper | no `PUSH IX`; nearest RET-bounded entry `0x012E4D` | `0x0099BC CALL`, `0x009A0A CALL`, `0x00B85A CALL` | Endpoint teardown path: clears `D14073`, then writes `D14042=0x1F` and `D14046=0x30`. |
| `0x01304B` | SAMPLED | `0x3082 bit 4` (`IN A,(0x3082); AND 0x10`) | `0x01301D` USB port polling loop | no `PUSH IX`; nearest RET-bounded entry `0x01301D` | `0x008469 CALL` | Stores the raw `0x3082` bit-4 sample (`0x00` or `0x10`) into `D14073` instead of forcing a constant 0/1. |
| `0x02BC87` | CLEAR | `0` (`XOR A`) | `0x02B806` banked mirror of large USB state-machine cleanup | no `PUSH IX`; nearest RET-bounded entry `0x02B806` | none found by exact CALL/JP scan | Mirror of `0x00F11E`: clears `D14073` during the mirrored cleanup/disconnect path. |
| `0x036773` | SET | `1` (`LD A,0x01`) | `0x03662B` banked mirror of event-completion callback | no `PUSH IX`; nearest RET-bounded entry `0x03662B` | none found by exact CALL/JP scan | Mirror of `0x008B3F`: clears `D1440E`, then latches `D14073=1` on callback completion. |
| `0x041A91` | SET | `1` (`LD A,0x01`) | `0x0419F1` flash mirror of USB enable / enumerate helper | no `PUSH IX`; nearest RET-bounded entry `0x0419F1` | `0x048DFC CALL`, `0x0493A8 CALL`, `0x0493F6 CALL` | Mirror of `0x012EED`: sets `D14073=1`, then writes `D14042=0x0F` and `D14046=0x21`. |
| `0x041B0E` | CLEAR | `0` (`XOR A`) | `0x0419F1` flash mirror of USB disable / teardown helper | no `PUSH IX`; nearest RET-bounded entry `0x0419F1` | `0x048DFC CALL`, `0x0493A8 CALL`, `0x0493F6 CALL` | Mirror of `0x012F80`: clears `D14073`, then writes `D14042=0x1F` and `D14046=0x30`. |
| `0x041BD7` | SAMPLED | `0x3082 bit 4` (`IN A,(0x3082); AND 0x10`) | `0x041BA9` flash mirror of USB port polling loop | no `PUSH IX`; nearest RET-bounded entry `0x041BA9` | `0x049631 CALL` | Mirror of `0x01304B`: stores the raw `0x3082` bit-4 sample (`0x00` or `0x10`) into `D14073`. |
| `0x049412` | SET | `1` (`LD A,0x01`) | `0x04929D` flash mirror of deep USB service dispatcher | no `PUSH IX`; nearest RET-bounded entry `0x04929D` | `0x0495AB CALL` | Mirror of `0x009A26`: attach-detect path sets `D14073=1` before the mirrored helper call. |

### Write-Site Families

- Event-completion latches: `0x008B3F`, `0x036773`.
- Immediate attach-detect latches: `0x009A26`, `0x049412`.
- Enable/enumerate latches: `0x012EED`, `0x041A91`.
- Raw hardware sample stores: `0x01304B`, `0x041BD7`.
- Cleanup clears inside the large state machines: `0x00F11E`, `0x02BC87`.
- Disable/teardown clears: `0x012F80`, `0x041B0E`.

## D14070-D1407F Reference Counts

| Address | Total | Reads | Writes | Addr-loads | Proposed purpose | Evidence |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `0xD14070` | 0 | 0 | 0 | 0 | unused gap / reserved byte | No literal references anywhere in the ROM. |
| `0xD14071` | 0 | 0 | 0 | 0 | unused gap / reserved byte | No literal references anywhere in the ROM. |
| `0xD14072` | 19 | 11 | 8 | 0 | best-fit: priority-service / bit-5 recovery latch | Raised on the `D14044` bit-1 + `0x3082` bit-5 path in `0x0098D2`, then cleared by the alternate cleanup/reset branches. |
| `0xD14073` | 52 | 40 | 12 | 0 | confirmed: USB device-connected / ready flag | 40 reads are zero/nonzero gates; 12 writes set it on connect/enumerate and clear it on cleanup/disable. |
| `0xD14074` | 29 | 3 | 26 | 0 | confirmed: USB subsystem active flag | The earlier phase-435 scan showed 26 writes vs 3 reads; it gates entry into the higher-level USB path. |
| `0xD14075` | 6 | 2 | 4 | 0 | best-fit: delayed follow-up gate | `0x008527` clears it immediately before `CALL 0x01322D(0x0800)`; late follow-up branches read it as a one-byte gate. |
| `0xD14076` | 15 | 5 | 10 | 0 | best-fit: service-pending / completion counter | `0x00E583` increments it as a completion-side counter, while recovery/reset helpers clear it back to zero. |
| `0xD14077` | 6 | 4 | 2 | 0 | confirmed: arm/init latch | `0x014EF8` sets it to 1, `0x014E81` clears it to 0, and both halves guard on its current value. |
| `0xD14078` | 11 | 2 | 9 | 0 | best-fit: transfer sub-state latch A | Mostly cleared as part of the `D14078` / `D14079` / `D1407A` cleanup trio; only a small late branch family reads it. |
| `0xD14079` | 14 | 2 | 12 | 0 | best-fit: notification-pending / retry latch | `0x0136BF` sets it to 1 when USB is not active; cleanup paths clear it alongside `D14078` and `D1407A`. |
| `0xD1407A` | 13 | 2 | 11 | 0 | best-fit: transfer-stage latch C | Several `0x011FBB` / `0x012042` / `0x0122FA` dispatch arms set it to 1, then the cleanup trio clears it back to 0. |
| `0xD1407B` | 19 | 6 | 13 | 0 | confirmed: first-SOF / reset-detect latch | Set on the first SOF path, then cleared during reset/teardown handling in the `0x0096CB` USB controller worker and mirrors. |
| `0xD1407C` | 17 | 8 | 9 | 0 | confirmed: bus-reset / connect latch | Set to 1 on the bus-reset path, then polled by downstream workers before reset-handling calls. |
| `0xD1407D` | 6 | 2 | 4 | 0 | best-fit: controller-arm-needed companion flag | Set alongside `D1407C` on bus reset, then read/cleared before `CALL 0x014F97` in the later arm helper path. |
| `0xD1407E` | 28 | 5 | 23 | 0 | confirmed: follow-up dispatch / endpoint-ready gate | Graph/notification handlers read it to optionally `dispatch_key(0x10,0x03)`; reset/teardown paths clear it heavily. |
| `0xD1407F` | 12 | 6 | 6 | 0 | best-fit: USB configuration / protocol-mode latch | Set in the `0x00A859` / `0x02AC81` family, cleared on bus reset/global reset, and read by several transfer-mode branches. |

## Structural Layout

```text
D14070-D14071  reserved / currently unused gap
D14072         priority-service / bit-5 recovery latch
D14073         USB device-connected / ready flag
D14074         USB subsystem active flag
D14075         delayed follow-up gate
D14076         service-pending / completion counter
D14077         arm/init latch
D14078-D1407A  transfer / notification sub-state trio
  D14078       late transfer sub-state latch A
  D14079       notification-pending / retry latch
  D1407A       transfer-stage latch C
D1407B-D1407F  USB hardware event front-end
  D1407B       first-SOF / reset-detect latch
  D1407C       bus-reset / connect latch
  D1407D       controller-arm-needed companion flag
  D1407E       follow-up dispatch / endpoint-ready gate
  D1407F       configuration / protocol-mode latch
```

## Lifecycle Interpretation

- `D14073` is the inner connection gate. It is set by immediate attach detection (`0x009A26` / `0x049412`), by raw port-bit sampling (`0x01304B` / `0x041BD7`), and by the explicit enable/enumerate helper (`0x012EED` / `0x041A91`).
- It is cleared in two distinct places: inside the large runtime USB state machines (`0x00F11E` / `0x02BC87`) and inside the explicit disable/teardown helper (`0x012F80` / `0x041B0E`).
- The surrounding bytes split cleanly into three layers: front-end service gates (`D14072-D14076`), one arm/init latch (`D14077`), and the hardware USB event/reset/config cluster (`D1407B-D1407F`).

Generated from direct ROM byte-pattern scans for phase 437.
