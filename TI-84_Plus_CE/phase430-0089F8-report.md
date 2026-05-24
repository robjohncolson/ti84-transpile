# Phase 430: Trace 0x0089F8 USB/Link Init Dispatcher

## Size Verification

- Full callable span: `0x0089F8..0x008BE8` = `497` bytes.
- Inline `_seqcase` table: `0x008A14..0x008A38` = `37` bytes.
- Real post-table handler body: `0x008A39..0x008BE8` = `432` bytes.
- Why earlier notes said "`~439 bytes`":
  - the final inline-table entry bytes at `0x008A32..0x008A35` are `C4 E1 8B 00`
  - if you linear-disassemble those bytes as code instead of table data, they look like `CALL NZ,0x008BE1`
  - that false code view yields `0x008A32..0x008BE8` = `439` bytes
  - the actual default target field is `0x008A36..0x008A38 -> 0x008BDD`

So the function really is a `497`-byte entry with a `37`-byte inline dispatch table. The "`439` bytes" number is a table-as-code artifact, not the true entry span.

## Dispatcher Integration

The function prologue is:

```asm
0x0089F8  LD HL,0xFFFFFE
0x0089FC  CALL 0x002197
0x008A00  LD (IX-1),0x01
0x008A04  LD (IX-2),0x00
0x008A08  LD A,(0xD177B8)
0x008A0C  OR A
0x008A0D  SBC HL,HL
0x008A0F  LD L,A
0x008A10  CALL 0x00211B
```

That means:

- `D177B8` is the selector/event byte.
- `HL` is zero-extended from `A` before calling `_seqcase`.
- `_seqcase` at `0x00211B` consumes inline data immediately after the call.

Verified inline layout:

```text
[u16 count][8 x {u8 code,u24 target}][u24 default]
```

The decoded table is:

| Code | Target | Rough Size | Verified role inside 0x0089F8 |
| --- | --- | ---: | --- |
| `0x41` | `0x008AF6` | `97` bytes | Controller/PHY arm path |
| `0x45` | `0x008A39` | `76` bytes | Descriptor bootstrap path |
| `0x46` | `0x008A85` | `113` bytes | Ready-gate / settle-check path |
| `0x47` | `0x008B57` | `38` bytes | DI-protected recovery/timer path |
| `0xC0` | `0x008B7D` | `62` bytes | Vendor/control follow-up path |
| `0xC1` | `0x008BBB` | `34` bytes | Shared follow-up path |
| `0xC2` | `0x008BBB` | `34` bytes | Shared follow-up path |
| `0xC4` | `0x008BE1` | `8` bytes | Recognized no-op / straight to epilogue |
| default | `0x008BDD` | `4` bytes body + epilogue | Set retval to `0`, then exit |

Important: the `0x4x` / `0xCx` split looks superficially like `bmRequestType`-style USB bytes, but the verified behavior does **not** support treating them as literal SETUP-packet request-type values. In this routine they behave as **internal USB/link event selectors stored in `D177B8`**, not raw wire-level request headers.

## USB Event Code Mapping

Best-fit subsystem meanings from the actual case bodies:

| Code | Best-fit meaning | Why |
| --- | --- | --- |
| `0x41` | Controller enable / PHY-arm event | Calls `0x00D9EE`, sets bit 0 on port `0x3114`, waits on port `0x3082 bit 4`, clears `D1440E`, sets `D14073`, reports status `(0,1)` |
| `0x45` | Descriptor bootstrap event | Delays, then calls `0x00CC71(0,2,2000)` to build the two-descriptor / 2000-byte layout, then reports success/failure via status `0x46` / `0x86` |
| `0x46` | Ready-gate / link-settle event | Calls `0x00DCB6` twice with short delays, then `0x00D681`, then reports status `0x41` or `0x47` depending on the second-stage outcome |
| `0x47` | Interrupt-guarded recovery / timeout event | Saves interrupt state, `DI`, calls `0x00B8BC(3000)`, reports status `0x83`, restores interrupt enable state |
| `0xC0` | Vendor/control follow-up with optional re-arm | Clears `D14082`, optionally calls `0x012456`, then `0x0125EA(0x12,0xC0)`, and only if that succeeds does it continue to `0x012933` |
| `0xC1` | Shared vendor/control follow-up | Calls `0x012456(1,0)`, then `0x0125EA(0x10,0xFF)` and exits |
| `0xC2` | Same as `0xC1` | Shares the exact same handler body at `0x008BBB` |
| `0xC4` | Already-satisfied / no-op event | Jumps directly to the common epilogue; retval stays `1` |

So in USB terms the safe interpretation is:

- `0x41/0x45/0x46/0x47` are **bring-up / bootstrap / settle / recovery phases**
- `0xC0/0xC1/0xC2/0xC4` are **later vendor/control follow-up phases**

They are **not** best modeled as literal class/vendor request types from the bus.

## Init Sequence Flow

The concrete flow inside `0x0089F8` is:

1. Build an IX frame and seed local return latch `(IX-1)=1`.
2. Read the selector byte from `D177B8`.
3. Dispatch through `_seqcase`.
4. Depending on the selector:
   - `0x45` runs the descriptor bootstrap wrapper `0x00CC71(0,2,2000)`.
   - `0x41` performs the controller/PHY arm sequence:
     - `0x00D9EE(1)`
     - read port `0x3114`
     - set bit 0
     - write back to `0x3114`
     - run the short BC-register assertion loop
     - `0x014E3F(0x04B0)`
     - poll `0x3082 bit 4` while `D1440F==0` and `D177B7==0x55`
     - clear `D1440E`
     - set `D14073=1`
     - report status `(0,1)`
   - `0x46` runs the link-ready handshake gate:
     - `0x00DCB6`
     - `0x014FA0(0x23)`
     - `0x00DCB6`
     - `0x014FA0(0x23)`
     - `0x00D681(1)`
     - report status `(2,0x41)` or `(2,0x47)`
   - `0x47` runs the DI-protected recovery/timer helper `0x00B8BC(0x0BB8)` and reports `(0x11,0x83)`.
   - `0xC0` optionally re-arms controller state through `0x012456`, then uses `0x0125EA` plus `0x012933` for follow-up notification work.
   - `0xC1/0xC2` share a shorter `0x012456 -> 0x0125EA` path.
   - `0xC4` is a straight exit.
   - default sets retval to `0`.
5. The common epilogue at `0x008BE1` returns `A=(IX-1)`.

## Direct CALL Targets

Direct call targets inside `0x0089F8`:

| Target | Count | Notes |
| --- | ---: | --- |
| `0x002197` | 1 | frame setup helper |
| `0x00211B` | 1 | sparse inline dispatcher |
| `0x00883C` | 7 | status/event reporter |
| `0x014FA0` | 3 | short delay helper (`0xFA`, `0x23`, `0x23`) |
| `0x00CC71` | 1 | descriptor bootstrap wrapper with args `0,2,2000` |
| `0x00DCB6` | 2 | link-ready handshake gate |
| `0x00D681` | 1 | secondary descriptor/bootstrap stage |
| `0x00D9EE` | 1 | USB side-band helper |
| `0x00B8BC` | 1 | DI-protected recovery helper |
| `0x014E3F` | 1 | long wait helper (`0x04B0`) |
| `0x012456` | 2 | controller re-arm helper |
| `0x0125EA` | 2 | status-submit helper |
| `0x012933` | 1 | post-submit follow-up helper |

Two especially relevant helpers:

- `0x00CC71` is the already-traced descriptor init wrapper that consumes the `0/2/2000` triple.
- `0x0125EA` is not a data-transfer routine; it waits on `0x3082 bit 1` / `D1440F` / `D177B7`, can substitute failure code `0xFF/0x10`, and then calls `0x00883C` with the final pair.

## Port I/O

Direct port I/O inside `0x0089F8` itself:

| Site | Port | Access | Notes |
| --- | --- | --- | --- |
| `0x008B04` | `0x3114` | `IN A,(C)` | `0x41` case: read controller/PHY register |
| `0x008B08` | `0x3114` | `OUT (C),A` | `0x41` case: write controller/PHY register after `SET 0,A` |
| `0x008B23` | `0x3082` | `IN A,(C)` | `0x41` case: live wait-loop gate on bit 4 |
| `0x008B86` | `0x3082` | `IN A,(C)` | `0xC0` case: test bit 3 before optional `0x012456` |

Directly verified behavior:

- Port `0x3114` is **not** polled for completion. The short loop after the write only asserts that `BC` still equals `0x3114`.
- The real polling loop is on port `0x3082 bit 4` in the `0x41` case.

Nested helpers touch more ports (`0x3010`, `0x3014`, `0x3015`, `0x3018`, `0x3031`, `0x3080`, `0x3081`, `0x314C`), but those are callee-side effects, not direct instructions in `0x0089F8`.

## RAM Variables Accessed

Direct absolute RAM references in `0x0089F8`:

| Address | Access | Role |
| --- | --- | --- |
| `D177B8` | read | selector/event byte loaded before `_seqcase` |
| `D14073` | read/write | mode latch checked in `0x46`, set to `1` in `0x41` |
| `D1440F` | read | abort/delivery flag inside the `0x41` wait loop |
| `D177B7` | read | armed sentinel; only `0x55` keeps the `0x41` wait loop spinning |
| `D1440E` | write | notification lock cleared before the `0x41` success exit |
| `D14082` | write | service latch cleared in the `0xC0` case |

Local IX-frame bytes:

| Slot | Meaning |
| --- | --- |
| `(IX-1)` | return latch; seeded to `1`, cleared only on explicit failure paths, returned in `A` |
| `(IX-2)` | scratch/local byte; seeded to `0`, not read directly again inside `0x0089F8` |

## Return Value Logic

Success signaling is simple and local:

```asm
0x008A00  LD (IX-1),0x01
...
0x008BDD  LD (IX-1),0x00    ; failure/default body
0x008BE1  LD A,(IX-1)
0x008BE4  LD SP,IX
0x008BE6  POP IX
0x008BE8  RET
```

That means:

- the routine defaults to returning `A=1`
- any recognized case that does **not** clear `(IX-1)` returns `1`
- the default case returns `0`
- the `0xC0` case also returns `0` if `0x0125EA` fails

So to any caller, including `0x009118`, "`success`" is simply "the local return latch was left at `1`".

## Bottom Line

`0x0089F8` is best understood as a **USB/link init dispatcher with an inline 8-way event table**:

- `0x45` allocates the descriptor/bootstrap layout
- `0x41` arms the controller/PHY and transitions the subsystem into the `D14073=1` mode
- `0x46` runs readiness and settle gates
- `0x47` is a DI-protected recovery/timer path
- `0xC0/C1/C2/C4` are later control/follow-up events

The key structural point is that the function is `497` bytes end-to-end and the old "`439` bytes" figure only appears when the tail of the inline `_seqcase` table is mistaken for executable code.
