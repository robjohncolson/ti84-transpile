# Phase 429: 0x00DCB6 Link-Ready Gate / 0x3031 Handshake Wrapper

`0x00DCB6` is not a passive presence test. It actively toggles `0x3031 bit0`, calls the existing `0x3010` assert helper `0x00DA8C(1)`, then waits for the controller state to settle. The return value in `A` is the gate that `0x00CC71` uses before deciding whether to run the full descriptor bootstrap at `0x00E2EB`.

## Function Boundaries

- Start: `0x00DCB6`
- End: `0x00DD6B`
- Size: `0xB6` bytes (`182` bytes)
- Shape: single entry, single `RET`

## Direct Call Targets

| Target | Purpose | Call Site(s) |
| --- | --- | --- |
| `0x002197` | stack-frame helper | `0x00DCBA` |
| `0x014FA0` | short service/delay helper | `0x00DCDF` with arg `0x0016` |
| `0x00DA8C` | `0x3010` assert helper | `0x00DCE9` with arg `1` |
| `0x014E3F` | notification installer / long wait helper | `0x00DD0E` with arg `0x07D0` (`2000`) |
| `0x0123AD` | `0x3010 bit1` helper / installer wrapper | `0x00DD3D` with arg `0x0032` |
| `0x0021C2` | `HL == 0` test helper | `0x00DD48` |
| `0x002575` | logical shift-right helper | `0x00DD5B` with `B = 6` |

## Port I/O

| Port | Access | Bits | Meaning |
| --- | --- | --- | --- |
| `0x3031` | read-modify-write | `bit 0` | assert handshake/control bit (`SET 0`) at `0x00DCCB`, then deassert it (`RES 0`) at `0x00DCFA` |
| `0x3031` | poll | `bit 0` | `IN A,(C)` then `AND 0x01` at `0x00DD17..0x00DD19`; loop continues until the bit reads low |
| `0x3082` | read | `bits 7:6` | sampled at `0x00DD57`, shifted right by 6 via `0x002575`, masked with `AND 0x03`, then stored to `D141E6` |

Indirect hardware side effects through callees:

- `0x00DA8C(1)` asserts the outer `0x3010 bit0` path and uses `0x014E3F`
- `0x0123AD(0x32)` touches `0x3010 bit1` on the failure cleanup path

## RAM Variables Accessed

| Address | R/W | Role in this routine |
| --- | --- | --- |
| `D141E7` | write | set to `1` after `0x00DA8C(1)` and before dropping `0x3031 bit0`; acts like a handshake/status latch |
| `D1440F` | read | abort flag; any nonzero value forces failure |
| `D177B7` | read | armed sentinel; only `0x55` allows the wait loop to continue |
| `D1440E` | write | cleared on both exit paths to release the notification lock |
| `D141E6` | write | success: `((0x3082 >> 6) & 3)`; failure: `0` |

Local state:

- `(IX-3..IX-1)` is a 3-byte local completion flag.
- It starts as `0`.
- If `0x3031 bit0` is already low when polled, the routine stores `1` there.
- `CALL 0x0021C2` tests that local flag; zero loops back to poll again, nonzero falls through to the success exit.

## Return Condition

### Returns `0`

The failure path starts at `0x00DD33` and returns with `A = 0` when the wait is aborted before `0x3031 bit0` goes low:

- `D1440F != 0`, or
- `D177B7 != 0x55`

Failure cleanup sequence:

1. `XOR A`
2. `LD (D1440E),A`
3. `CALL 0x0123AD(0x32)`
4. `XOR A`
5. `RET`

Because the jump at `0x00DD43` skips `LD A,1`, this path really returns zero.

### Returns Nonzero

The success path returns with `A = 1` when:

- `0x3031 bit0` has gone low, and
- `D1440F == 0`, and
- `D177B7 == 0x55`

Success exit sequence:

1. `XOR A`
2. `LD (D1440E),A`
3. `IN A,(0x3082)`
4. `A = (A >> 6) & 0x03`
5. `LD (D141E6),A`
6. `LD A,1`
7. `RET`

## Behavioral Summary

High-level flow:

1. Allocate a small local flag.
2. Raise `0x3031 bit0`.
3. Call `0x014FA0(0x16)`.
4. Call `0x00DA8C(1)` to assert the outer control path.
5. Set `D141E7 = 1`.
6. Lower `0x3031 bit0`.
7. Call `0x014E3F(2000)`.
8. Poll `0x3031 bit0` until it clears, unless `D1440F` or `D177B7` aborts the wait.
9. On success, latch `0x3082 bits 7:6` into `D141E6`; on failure, zero `D141E6` and run `0x0123AD(0x32)`.

The best interpretation is that `0x00DCB6` performs an active link/controller readiness handshake, not just a raw status read.

## How This Gates `0x00CC71`

The relevant `0x00CC71` tail is:

```asm
0x00CD5A  LD A,(IX+9)
0x00CD5D  CP 0x02
0x00CD5F  JR Z,0x00CD6C
0x00CD61  CALL 0x00DCB6
0x00CD65  OR A
0x00CD66  JR NZ,0x00CD6C
0x00CD68  LD A,0x02
0x00CD6A  JR 0x00CD76
0x00CD6C  CALL 0x00E2EB
```

So the gate is exact:

- `param2 == 2`: skip `0x00DCB6`, always run `0x00E2EB`
- `param2 != 2` (the observed `param2 == 1` callers): call `0x00DCB6`
  - `A != 0`: continue into `0x00E2EB` and full bootstrap
  - `A == 0`: skip `0x00E2EB`, return `A = 2` from `0x00CC71` (partial init)

That makes `0x00DCB6` the concrete "ready enough to bootstrap" gate for the Link/serial and USB alt-mode init paths.
