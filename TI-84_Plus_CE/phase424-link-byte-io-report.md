# Phase 424: Link Byte I/O Report

## Summary

- The requested scan window `0x00D000..0x00DBFF` contains **no** `IN`, `OUT`, `IN0`, or `OUT0` references to `0x3030` or `0x3031`.
- The first legacy TI-Link code that actually touches the pair is the already-known ISR `0x0094C0..0x0096CA`.
- In that ISR and in every additional `0x3030`/`0x3031` user validated from the ROM, the accesses are **status/control only**:
  - reads immediately feed `AND`, `BIT`, `RRCA`, or `SRL`
  - writes are read-modify-write bit toggles such as `SET 0`, `SET 1`, `SET 7`, `RES 0`, or masked `AND`
- No validated function copies an unmasked byte from `0x3030` or `0x3031` into RAM as payload data, and no validated function writes a RAM-sourced payload byte out to `0x3030` or `0x3031`.

The implication is the same across the legacy and USB-adjacent paths: on this ROM build, `0x3030` and `0x3031` behave like **link/USB status-control registers**, not CPU-visible byte FIFOs. The actual serialization/deserialization of TI-Link bytes is therefore most likely handled inside the underlying peripheral block, with the CPU only arming, acknowledging, polling, and dispatching software descriptors.

## Requested Region: `0x00D000..0x00DBFF`

The scan requested for the `0x00D000-0x00DC00` band came back negative:

- no `IN A,(C)` / `OUT (C),A` sites resolve to `BC = 0x3030` or `BC = 0x3031`
- no `IN0` / `OUT0` sites reference immediate ports `0x30` or `0x31`

That rules out the initially suspected `0x00D0xx-0x00DBxx` block as the location of CPU-driven byte transfer on the TI-Link data ports.

## Legacy ISR Findings

## `0x0094C0..0x0096CA` - legacy TI-Link ISR

This is still the first code on the legacy path that touches the data-port pair. Its relevant accesses are:

| PC | Access | Immediate use | Meaning |
| --- | --- | --- | --- |
| `0x00956E` | `IN 0x3030` | `AND 0x80` | test activity/status bit 7 |
| `0x00957E` | `IN 0x3030` | `AND 0x02` | test RX-ready bit 1 |
| `0x009588` / `0x00958E` | `IN` / `OUT 0x3030` | `SET 1`, `AND 0xD7` | acknowledge/toggle control bits, not payload |
| `0x00959F` | `IN 0x3030` | `AND 0x01` | test busy bit 0 before disconnect |
| `0x0095CA` | `IN 0x3030` | `AND 0x08` | test error/state bit 3 |
| `0x0095D4` / `0x0095DA` | `IN` / `OUT 0x3030` | `SET 3`, `AND 0xDD` | control/status RMW |
| `0x0095F2` | `IN 0x3031` | `AND 0x01` | test bit 0 only |
| `0x009608` | `IN 0x3030` | `AND 0x80` | re-test bit 7 |

Nothing in `0x0094C0` resembles byte transfer:

- no pointer walk over a TX or RX byte buffer
- no `LD A,(...)` followed by `OUT (0x3030/0x3031),A`
- no `IN A,(0x3030/0x3031)` followed by a direct RAM store of the raw byte

The ISR uses the pair only to decide when to call higher-level workers and when to clear or raise software latches.

## ISR callee scan

The direct ISR callees do not reveal hidden byte I/O either:

| Callee | Result |
| --- | --- |
| `0x00ED77` | no `0x3030`/`0x3031` access at all |
| `0x00FE10` | only `IN 0x3030` with `AND 0x01` busy-bit test |
| `0x00DA8C` | no `0x3030`/`0x3031`; only `0x3010` / `0x3015` control work |
| `0x00DB66` | no data-port I/O; TX-side control-bit arm/drain helper |
| `0x00DC0E` | no data-port I/O; RX-side control-bit arm/drain helper |
| `0x0019B5`, `0x01322D` | no evidence of hidden `0x3030`/`0x3031` payload movement on the traced path |

So the legacy ISR's software path is:

`0x0094C0` status polling / control-bit RMW  
`-> 0x00ED77` descriptor-slot selection  
`-> 0x00FE10` disposition staging  
`-> callback workers`

That path never exposes a per-byte TI-Link payload transfer to the CPU.

## Every Validated `0x3030` / `0x3031` User

The phase 424 probe also cross-checked the rest of the ROM for code that touches the pair. The validated functions fall into a few families:

| Function / family | Observed access pattern | Verdict |
| --- | --- | --- |
| `0x006EDA` | `IN 0x3030` bit 0, poll `IN 0x3031` bits 2-3 with timeout | readiness/status poller only |
| `0x0094C0` | `IN 0x3030` bits 7/1/0/3, RMW writes on `0x3030`, `IN 0x3031` bit 0 | legacy ISR status/control only |
| `0x0098D2` | `IN`/`OUT 0x3031` with `SET 0` | direct control branch, not payload |
| `0x00DCB6..0x00DD6B` | `SET 0` then `RES 0` on `0x3031`, later poll `0x3031` bit 0 | control handshake wrapper |
| `0x00DD6C..0x00DE0D` | sibling of the above | control handshake wrapper |
| `0x00DE0E..0x00DE8A` | test `0x3030` bit 2, later `SET 7` on `0x3030`, then poll bit 7 | control handshake wrapper |
| `0x00E583` | `IN 0x3030` bit 0 | busy-bit gate before cleanup tail |
| `0x00CCD3..0x00CD7A` | `IN 0x3030` bit 0, then higher-level state work | status gate only |
| `0x0126A9..0x01270A` | `IN 0x3030` bit 0 | status wait wrapper |
| `0x01270B..0x012755` | `IN 0x3031` bits 2-3, then set `0x3081` / `0x3080` bits | controller-status decoder |
| `0x012B93` local helper | `IN 0x3031`, shift right twice, `AND 0x03` | 2-bit status decoder |

Higher addresses such as `0x03AAxx`, `0x0412xx`, and `0x048Fxx` are banked or relocated clones of the same control/status logic. They repeat the same behavior:

- `0x3030` is only tested on specific bits or modified with single-bit RMW sequences
- `0x3031` is only tested on specific bits or modified with `SET 0` / `RES 0`
- no raw byte read from either port is preserved as payload
- no payload byte is sourced from RAM and written to either port

## What This Means For The Data Path

The complete CPU-visible path around TI-Link looks like this:

1. Hardware raises status on the link block.
2. `0x009B35` selects the legacy path and dispatches to `0x0094C0` when `D14073 == 0`.
3. `0x0094C0` acknowledges interrupt bits on `0x3014`, then samples and occasionally RMWs `0x3030` / `0x3031`.
4. Based on those status bits, it calls:
   - `0x00ED77` to choose a descriptor slot
   - `0x00FE10` to stage a disposition
   - `0x00DA8C` / `0x00DB66` / `0x00DC0E` to toggle control-line state
5. Downstream workers update RAM state and callbacks, but they still do not expose CPU-side byte I/O on `0x3030` / `0x3031`.

So the byte path is **not**:

`RAM buffer -> A -> OUT (0x3030/0x3031)`  
or  
`IN (0x3030/0x3031) -> A -> RAM buffer`

Instead, the byte path appears to be:

`descriptor / state machine -> peripheral control bits -> hardware-owned serializer/deserializer`

with the CPU watching status transitions rather than pushing or pulling individual payload bytes.

## Bottom Line

No CPU routine in the requested band, the legacy ISR chain, or the additional validated `0x3030`/`0x3031` users performs actual per-byte TI-Link payload I/O through those ports.

If this ROM really does implement byte-level TI-Link transfer, that transfer is happening below the CPU-visible software layer:

- inside the `0x30xx` peripheral block itself
- behind a hardware FIFO or serializer that the OS only controls through status/control bits
- or through a different port/register family than `0x3030` / `0x3031`

For phase 424, the strongest defensible conclusion is:

**`0x3030` and `0x3031` are control/status registers, not the byte payload interface.**
