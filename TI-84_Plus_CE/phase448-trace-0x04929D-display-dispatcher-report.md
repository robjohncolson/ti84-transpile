# Phase 448: Trace `0x04929D` Display Dispatcher

## Scope

- ROM: `TI-84_Plus_CE/ROM.rom`
- Decoder: `decodeInstruction(..., "adl")` from `TI-84_Plus_CE/ez80-decoder.js`
- Target window requested: `0x04929D..0x049524`
- Observed function boundary: `0x04929D..0x049525` inclusive, with the `RET` at `0x049525`
- Size: `649` bytes exactly
- Next function starts at `0x049526`, so the prompt's `0x049524` / `0x049527` endpoints were off by one

## Direct Answer

`0x04929D` is **not a direct VRAM renderer**. It is a **flag-driven USB/link event dispatcher** that:

1. Reads the masked status bytes `D14044` and `D14048`.
2. Prioritizes `D14044 bit 1`, then fans later bits into helper calls and one-byte software latches.
3. Performs a large amount of banked I/O on `0x30xx` / `0x31xx` ports.
4. Delegates any real display / notification side effects to subroutines such as `0x049EE4`, `0x041056`, `0x05202F`, and `0x049CCA`.

The code matches the previously traced masked-status USB dispatcher family much more closely than a literal LCD blitter. The "display" work happens only indirectly through helper calls.

## Function Map

| Range | Role | Notes |
| --- | --- | --- |
| `0x04929D..0x0492D6` | Priority gate on `D14044 bit 1` | If clear, jumps to the secondary fan-out at `0x0493FE`. If set, calls `0x049EE4`, clears `D176FD`, sets `D14087`, toggles port `0x313D`, then samples `0x3082 bit 5`. |
| `0x0492D7..0x0493AC` | High-priority service path | Calls `0x041056(1,0)`, `0x05202F(0x001B20)`, writes `0x40` to `0x3084`, clears `D14080`, calls `0x049CCA(1,0)`, sets `D14072`, optionally clears `D177BB` and `D176F8`, toggles `0x3010`, writes `0x314C=1`, then calls `0x052013(0x004108)`, `0x041E95(0x20)`, and `0x0419F1`. |
| `0x0493B0..0x0493FA` | Priority fallback / cleanup path | Used when `0x3082 bit 5` is clear. Calls `0x0003C8` and `0x0003C0`, clears `0x3040 bit 6` and `0x3080 bit 2`, clears `D14076` and `D14072`, then calls `0x041E95(0x10)` and `0x0419F1`. |
| `0x0493FE..0x049451` | Secondary gate on `D14044 bit 0` | If `D14044 bit 0` is set, samples `0x3082 bit 4`: either sets `D14073` and calls `0x0418B7`, or directly clears `0x3010 bit 0`, sets `0x3031 bit 0`, and sets `D14088`. Always clears `D176FD` before the later fan-out. |
| `0x049456..0x049477` | `D14048 bit 5` fan-out | Calls `0x041056(1,0)` and then `0x041E95(0x4000)`. |
| `0x049478..0x049499` | `D14044 bit 2` fan-out | Calls `0x041056(1,0)` and then `0x041E95(0x0200)`. |
| `0x04949A..0x0494E6` | Late latch fan-out, `0x3082 bit 5 == 0` side | `D14048 bit 4 -> D14082=1`; `D14044 bit 3 -> D14085=1`; if `D14075==0`, calls `0x041056(1,0)`; `D14044 bit 4 -> D14086=1`. |
| `0x0494E7..0x049525` | Late latch fan-out, `0x3082 bit 5 != 0` side | `D14048 bit 0 -> D14083=1`; `D14048 bit 6 -> D14084=1` and clear `D14046 bit 6`; `D14044 bit 3` can also set `D14084=1` and clear `D14046 bit 6`; returns. |

## What It Checks Before Doing Work

### Primary masked-status checks

- `D14044 bit 1` at `0x04929D..0x0492A3`
- `0x3082 bit 5` at `0x0492CF..0x0492D3`
- `D177BB` at `0x049323..0x049328`
- `D14044 bit 0` at `0x0493FE..0x049404`
- `0x3082 bit 4` at `0x04940A..0x04940E`
- `D14048 bit 5` at `0x049456..0x04945C`
- `D14044 bit 2` at `0x049478..0x04947E`
- `0x3082 bit 5` again at `0x04949E..0x0494A2`
- `D14048 bit 4` at `0x0494A4..0x0494AA`
- `D14044 bit 3` at `0x0494B2..0x0494B8`
- `D14075 != 0` gate at `0x0494C0..0x0494C5`
- `D14044 bit 4` at `0x0494D7..0x0494DD`
- `D14048 bit 0` at `0x0494E7..0x0494ED`
- `D14048 bit 6` at `0x0494F5..0x0494FB`
- `D14044 bit 3` again at `0x04950D..0x049513`

### Important negative result

- No direct read of `D177B7` inside `0x04929D`
- No direct read of `D14059` inside `0x04929D`

Those gates live in the caller chain (`0x049087` / `0x049526`), not here.

## All CALL / JP Targets

### Direct CALL sites

| Offset | PC | Instruction |
| --- | --- | --- |
| `+0x00A` | `0x0492A7` | `CALL 0x049EE4` |
| `+0x044` | `0x0492E1` | `CALL 0x041056` |
| `+0x04F` | `0x0492EC` | `CALL 0x05202F` |
| `+0x067` | `0x049304` | `CALL 0x0003C4` |
| `+0x07A` | `0x049317` | `CALL 0x049CCA` |
| `+0x0DB` | `0x049378` | `CALL 0x040FAD` |
| `+0x0F3` | `0x049390` | `CALL 0x0003F4` |
| `+0x0FC` | `0x049399` | `CALL 0x052013` |
| `+0x106` | `0x0493A3` | `CALL 0x041E95` |
| `+0x10B` | `0x0493A8` | `CALL 0x0419F1` |
| `+0x113` | `0x0493B0` | `CALL 0x0003C8` |
| `+0x117` | `0x0493B4` | `CALL 0x0003C0` |
| `+0x154` | `0x0493F1` | `CALL 0x041E95` |
| `+0x159` | `0x0493F6` | `CALL 0x0419F1` |
| `+0x179` | `0x049416` | `CALL 0x0418B7` |
| `+0x1CB` | `0x049468` | `CALL 0x041056` |
| `+0x1D6` | `0x049473` | `CALL 0x041E95` |
| `+0x1ED` | `0x04948A` | `CALL 0x041056` |
| `+0x1F8` | `0x049495` | `CALL 0x041E95` |
| `+0x234` | `0x0494D1` | `CALL 0x041056` |

### Direct JP sites

| Offset | PC | Instruction |
| --- | --- | --- |
| `+0x006` | `0x0492A3` | `JP Z,0x0493FE` |
| `+0x036` | `0x0492D3` | `JP Z,0x0493B0` |
| `+0x10F` | `0x0493AC` | `JP 0x049525` |
| `+0x15D` | `0x0493FA` | `JP 0x049525` |

### Assertion / trap stubs

The repeated `RST 0x08` sites at `0x0492C5`, `0x0492FE`, `0x049343`, `0x049358`, `0x04936D`, `0x04938A`, `0x0493C7`, `0x0493DC`, `0x049430`, and `0x049445` appear only in post-I/O verification sequences. They are not dispatch targets for the main logic.

## Required Target Previews

| Target | First 16 bytes | First instructions | Type |
| --- | --- | --- | --- |
| `0x049EE4` | `FD 21 80 00 D0 FD CB 46 46 C4 78 00 03 C3 11 0D` | `LD IY,0xD00080`; `BIT 0,(IY+0x46)`; `CALL NZ,0x030078`; `JP 0x040D11` | Status/callback gate that begins from the `D00080` system flag area. |
| `0x041056` | `CD 30 01 00 01 80 30 00 ED 78 CB BF ED 79 78 FE` | `CALL 0x000130`; `LD BC,0x3080`; `IN A,(C)`; `RES 7,A`; `OUT (C),A` | Low-level framed helper that immediately does port `0x3080` bit manipulation. |
| `0x05202F` | `DD E5 DD 21 00 00 00 DD 39 DD 07 06 78 17 ED 62` | `PUSH IX`; frame setup; `LD BC,(IX+6)`; arithmetic on `B`; later body ORs `C` into `D00080+offset` | Small event-flag setter in the `D00080` system-state block, not a VRAM writer. |
| `0x049CCA` | `21 FF FF FF CD 2C 01 00 DD 36 FF 00 ED 57 F5 F3` | `LD HL,0xFFFFFF`; `CALL 0x00012C`; `LD (IX-1),0`; `LD A,I`; `PUSH AF`; `DI` | Framed notification/state dispatcher; earlier sessions traced it as the `D177B9` notification switcher. |

## Absolute Memory References

### Reads

| Address | PCs | Best-fit meaning |
| --- | --- | --- |
| `D14044` | `0x04929D`, `0x0493FE`, `0x049478`, `0x0494B2`, `0x0494D7`, `0x04950D` | Masked USB status B byte; this function tests bits `1,0,2,3,4`. |
| `D177BB` | `0x049323` | Transfer-in-progress / follow-up latch. |
| `D14048` | `0x049456`, `0x0494A4`, `0x0494E7`, `0x0494F5` | Masked USB status A byte; this function tests bits `5,4,0,6`. |
| `D14075` | `0x0494C0` | Delayed follow-up gate. |
| `D14046` | `0x049503`, `0x04951B` | Event mask/control byte; bit 6 gets cleared on the `D14084` paths. |

### Writes

| Address | PCs | Best-fit meaning |
| --- | --- | --- |
| `D176FD` | `0x0492AC`, `0x049452` | Small counter / scratch byte; both sites clear it. |
| `D14087` | `0x0492B2` | SOF-timer active flag. |
| `D14080` | `0x049309` | Transfer-pending / pipe-config latch; cleared on the heavy path. |
| `D14072` | `0x04931F`, `0x0493E8` | Priority-service / bit-5 recovery latch; set in the priority path, cleared in fallback. |
| `D177BB` | `0x04932B` | Cleared after the follow-up gate is consumed. |
| `D176F8` | `0x049330` | Protocol state byte; cleared together with `D177BB`. |
| `D14076` | `0x0493E3` | Service-pending / completion counter; cleared in fallback. |
| `D14073` | `0x049412` | USB connected / ready flag; set on the attach-detect branch. |
| `D14088` | `0x04941B`, `0x04944D` | Endpoint-ready flag; explicitly cleared on one branch and set on the direct control branch. |
| `D14082` | `0x0494AE` | Service latch / OTG re-arm request bit. |
| `D14085` | `0x0494BC` | Callback-ready flag. |
| `D14086` | `0x0494E1` | Transfer-complete notification latch. |
| `D14083` | `0x0494F1` | Service latch C / late follow-up latch. |
| `D14084` | `0x0494FF`, `0x049517` | Busy / transfer-active latch. |
| `D14046` | `0x049509`, `0x049521` | Control mask byte; both sites clear bit 6 after raising `D14084`. |

### Indexed memory references

None inside `0x04929D` itself. The function uses no IX/IY stack frame and no indexed locals.

## Port I/O

All direct I/O uses `IN/OUT (C)` with full 16-bit BC ports. There are **no** `IN0` / `OUT0` accesses here.

| Port | PCs | Operation |
| --- | --- | --- |
| `0x313D` | `0x0492B6..0x0492C9` | Read-modify-write, set bit 1. |
| `0x3082` | `0x0492CB..0x0492D3`, `0x049406..0x04940E`, `0x04949A..0x0494A2` | Sample masked hardware status bits `5`, `4`, then `5` again. |
| `0x3084` | `0x0492F1..0x049302` | Write `0x40`. |
| `0x3010` | `0x049334..0x049371`, `0x049421..0x049434` | Read-modify-write, clearing bits `5`, `4`, and `0` across two branches. |
| `0x314C` | `0x04937D..0x04938E` | Write `0x01`. |
| `0x3040` | `0x0493B8..0x0493CB` | Read-modify-write, clear bit 6. |
| `0x3080` | `0x0493CD..0x0493E0` | Read-modify-write, clear bit 2. |
| `0x3031` | `0x049436..0x049449` | Read-modify-write, set bit 0. |

### LCD-controller question

- No direct `0x10..0x15` `IN0/OUT0` accesses were found.
- The only low-byte overlap is the banked `0x3010` access, plus helper `0x0419F1` reading `0x3015` downstream.
- So this function is **not** directly programming an LCD register block in the usual `0x10..0x15` sense.

## VRAM / Font / Display Findings

### VRAM

- No direct absolute access in `0xD40000..0xD52BFF`
- No `LD HL,0xD4xxxx`, `LD IX/IY,0xD4xxxx`, or equivalent absolute VRAM references
- Verdict: **no direct VRAM access inside `0x04929D`**

### Font tables

- No direct absolute ROM references in the `0x3Cxxxx` font-table range
- The `0x0003C0` / `0x0003C4` / `0x0003C8` calls are low-ROM vector stubs at addresses near `0x0003C0`, not font data
- Verdict: **no direct font-table access inside `0x04929D`**

## Summary: What This Function Actually Does

The strongest interpretation is:

1. `0x04929D` is the **flash-bank masked-status dispatcher** for the `D14044` / `D14048` USB/link event bytes.
2. It treats `D14044 bit 1` as the top-priority service path, with two subpaths chosen by live `0x3082 bit 5`.
3. It treats `D14044 bit 0`, `D14044 bit 2`, `D14044 bit 3`, `D14044 bit 4`, plus `D14048 bits 5/4/0/6`, as secondary fan-out sources that either:
   - call helper routines, or
   - raise one-byte latches in `D14072..D14088`.
4. It does **not** draw directly. There are no direct VRAM writes, no font fetches, and no explicit framebuffer loops in this function.
5. The "display" effect is deferred into helper calls such as `0x049EE4`, `0x041056`, `0x05202F`, and `0x049CCA`.

So if this routine is part of a display-update path, its role is **dispatch and hardware-event translation**, not rasterization.
