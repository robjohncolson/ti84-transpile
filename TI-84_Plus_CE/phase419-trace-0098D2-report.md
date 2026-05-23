# Phase 419: Trace `0x0098D2` Deep USB Service Routine

## Summary

- `0x0098D2` is the deeper USB/link service dispatcher reached from `0x009B35` when the masked status bytes are nonzero. Exact call-pattern scan finds one direct caller site: `0x009BBA -> CALL 0x0098D2`.
- The routine spans `0x0098D2..0x009B34`, which is `0x263` bytes (`611` decimal) and `256` decoded instructions, ending immediately before `0x009B35`.
- It is not a single linear worker. It is a two-phase bit dispatcher:
  - phase A gives priority to `D14044 bit 1` and can run a larger init/recovery path
  - phase B fans the remaining bits in `D14044` and `D14048` into helper calls or one-byte software latches

## Function Range

| Item | Value |
| --- | --- |
| Start | `0x0098D2` |
| End | `0x009B34` |
| Size | `0x263` bytes (`611` decimal) |
| Direct caller | `0x009BBA -> CALL 0x0098D2` |
| Return | `RET` at `0x009B34` |

## What The Routine Does

At a high level, `0x0098D2` converts the masked status bytes produced by `0x009B35` into concrete USB/link service work.

The entry path first checks `D14044 & 0x02`. If that bit is present, it performs a priority init/recovery sequence:

- sets `D14087 = 1`
- sets bit 1 on port `0x313D`
- samples live port `0x3082` bit 5
- if bit 5 is set, it raises `D14072`, dispatches `dispatch_key(0x01,0x00)`, and may run a larger transfer-recovery path gated by `D177BB`
- if bit 5 is clear, it runs a different cleanup path that calls `0x006F9A`, `0x006F31`, clears port bits on `0x3040` and `0x3080`, clears `D14076` and `D14072`, waits, and then calls `0x012E4D`

If `D14044 bit 1` is absent, the function jumps straight to `0x009A12`, the second dispatch phase. That phase is a fan-out over the remaining masked bits:

- `D14044 bit 0` plus live `0x3082 bit 4` selects between calling `0x012D13` after setting `D14073`, or directly clearing port `0x3010 bit 0` / setting `0x3031 bit 0` while setting `D14088`
- `D14048 bit 5` triggers a call to `0x012456` followed by a long delay
- `D14044 bit 2` triggers another call to `0x012456`
- later branches convert `D14048 bit 4`, `D14048 bit 0`, `D14048 bit 6`, `D14044 bit 3`, and `D14044 bit 4` into latch writes `D14082/D14083/D14084/D14085/D14086`
- when `D14084` is raised on the late paths, the routine also clears bit 6 in `D14046`, changing the mask that `0x009B35` uses on future samples

So the best fit is:

**`0x0098D2` is a masked-status-to-service dispatcher for the initialized USB/link path, with one heavy recovery branch and several smaller per-bit sub-handlers.**

## Direct Port I/O

These are the direct `IN/OUT` operations inside `0x0098D2` itself.

| Port | Access | Notes |
| --- | --- | --- |
| `0x313D` | read-modify-write | sets bit 1 at entry of the priority path |
| `0x3082` | read | live gate port; bit 5 is tested twice, bit 4 once |
| `0x3010` | read-modify-write | clears bits 5, 4, and 0 in the recovery path; later clears bit 0 again in the secondary phase |
| `0x314C` | write | writes `0x01` before `CALL 0x00C9A0` |
| `0x3040` | read-modify-write | clears bit 6 in the alternate cleanup path |
| `0x3080` | read-modify-write | clears bit 2 in the alternate cleanup path |
| `0x3031` | read-modify-write | sets bit 0 when `D14044 bit 0` takes the direct control branch |

Nested callees touch additional ports, but those are callee-side effects, not direct body instructions. The most important nested I/O is:

- `0x012456`: `0x3080` and sometimes `0x3010`
- `0x0123AD`: `0x3010`, then `0x014E3F`
- `0x012D13`: `0x3082`, `0x3080`, `0x3010`, `0x313D`
- `0x012E4D`: `0x3015`, `0x3014`, `0x3081`
- `0x006F31`, `0x006F9A`, `0x006FAF`: low I/O ports `0x03`, `0x09`, `0x0A`, `0x0C`
- `0x00C9A0`: larger `0x314C` / `0x313D` / `0x313C` / `0x3100` style hardware setup

## Direct RAM Accesses

### Reads

| Address | Role in `0x0098D2` |
| --- | --- |
| `D14044` | first masked status byte from `0x009B35`; bits `1,0,2,3,4` are tested |
| `D14048` | second masked status byte from `0x009B35`; bits `5,4,0,6` are tested |
| `D177BB` | transfer-in-progress latch; gates the large recovery path |
| `D1772D` | secondary gate that can trigger a second nested `CALL 0x0019B5` |
| `D14075` | one-byte follow-up gate checked before the late `CALL 0x012456` |
| `D14046` | read-modify-write mask byte; bit 6 is cleared on two late paths |

### Writes

| Address | Role in `0x0098D2` |
| --- | --- |
| `D14087` | set to `1` when the priority init path runs |
| `D14080` | cleared on the priority path |
| `D14072` | set in the bit-1 / `0x3082 bit 5` path, later cleared in the alternate cleanup path |
| `D177BB` | cleared during the transfer-recovery sequence |
| `D176F8` | cleared during the transfer-recovery sequence |
| `D14073` | set before the `CALL 0x012D13` branch |
| `D14088` | cleared after `CALL 0x012D13`, or set on the direct `0x3010/0x3031` control path |
| `D14076` | cleared on the alternate cleanup path |
| `D14082` | set on one late branch |
| `D14085` | set on one late branch |
| `D14086` | set on one late branch |
| `D14083` | set on one late branch |
| `D14084` | set on two terminal branches; this is the known notification busy flag |
| `D14046` | bit 6 cleared on the late `D14084` branches |

The pattern is consistent with `0x0098D2` translating hardware status bits into software latch bytes and only occasionally invoking heavier subroutines.

## Direct Call Targets And Likely Purpose

| Target | Sites | Likely purpose |
| --- | --- | --- |
| `0x012456` | `0x00990D`, `0x009A77`, `0x009A99`, `0x009AE0` | USB/link control helper that toggles `0x3080`, clears `D14082`, and conditionally falls into deeper cleanup helpers depending on stacked args |
| `0x006FAF` | `0x009913` | low-level handshake helper on low ports `0x03/0x0C/0x0A` |
| `0x00883C` | `0x009926` | low-ROM `dispatch_key(key,state)` notification/key dispatcher; here used as `dispatch_key(0x01,0x00)` |
| `0x0123AD` | `0x009987` | `0x3010` / installer helper; its direct body sets `0x3010 bit 1` and can call `0x014E3F` |
| `0x00C9A0` | `0x00999F` | larger hardware/state reset helper that clears a block of `D140xx` bytes and programs several `0x31xx` ports |
| `0x0019B5` | `0x0099A3`, `0x0099B8` | post-HALT FTINTC IRQ dispatcher; `0x0098D2` can re-enter it once or twice during recovery |
| `0x00322D` | `0x0099AC`, `0x009A05` | counted wait/delay helper; called with `0x20` and `0x10` |
| `0x012E4D` | `0x0099BC` | follow-up sampler/reset helper that reads `0x3015/0x3014`, clears `D14082/D14084/D14083`, and sets `0x3081` bits 3 and 2 |
| `0x006F9A` | `0x0099C4` | low-level handshake helper that manipulates low ports `0x03/0x0C/0x0A` |
| `0x006F31` | `0x0099C8` | low-level handshake helper that manipulates low ports `0x0C/0x09` |
| `0x012D13` | `0x009A2A` | deeper payload/FIFO control helper; branches on `D14073` and `D177B8`, manipulates `0x3082/0x3080/0x3010/0x313D`, and dispatches via `0x01322D` |

The routine therefore has many true sub-handlers. It is not just setting flags; it is dispatching into several layers of USB/link control code.

## Relationship To `0x009B35`

From phase 418, `0x009B35` does the hardware sampling:

- `D14044 = mem[0x3085] & D14042`
- `D14048 = mem[0x3084] & D14046`
- `CALL 0x0098D2` only if either masked byte is nonzero

`0x0098D2` does not resample `0x3084` or `0x3085`. It consumes those already-masked bytes and adds one more level of routing:

- `D14044 bit 1` is treated as the highest-priority source
- later branches use `D14044 bits 0/2/3/4`
- the sibling byte contributes `D14048 bits 5/4/0/6`
- live port `0x3082` bits 4 and 5 further steer some of those masked bits into different helper paths

That means `0x009B35` is the sampler/masker, while `0x0098D2` is the actual service dispatcher.

## Overall Flow Structure

`0x0098D2` is **not** a single linear flow.

It has:

- one priority branch at entry (`D14044 bit 1`)
- one large recovery subpath behind `D177BB`
- one alternate cleanup subpath when live `0x3082 bit 5` is clear
- a secondary decision tree beginning at `0x009A12`
- at least `11` unique direct subroutine targets

So the correct structural description is:

**multi-branch dispatcher with multiple sub-handlers and flag-setting exits, not a straight-line USB worker.**
