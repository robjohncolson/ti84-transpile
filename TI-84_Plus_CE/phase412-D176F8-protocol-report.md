# Phase 412: D176F8 Protocol Byte Report

## Executive Summary

- A ROM-wide scan for `F8 76 D1` found `69` raw hits.
- `44` hits are `LD (0xD176F8),A` writers and `25` hits are `LD A,(0xD176F8)` readers.
- There are no `LD (0xD176F8),HL`, `LD (0xD176F8),BC`, `LD HL,(0xD176F8)`, or `LD BC,(0xD176F8)` forms.
- No convincing IX/IY-based alias of `D176F8` was found. This looks like a standalone byte-sized state register, not a field reached through an indexed struct base.
- Session 411's values are correct:
  - `0x0A = active transfer`
  - `0x0C = header`
  - `0x0D = complete`
- The full observed value set is much larger: `00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 0A, 0C, 0D, 0E, 0F, 10`.
- `0x0B` never appears as a writer or reader compare target.

## Absolute Writer Map

| Value | Write site(s) | Routine / family | Gate / local context |
| --- | --- | --- | --- |
| `0x00` | `0x009876`, `0x00993F`, `0x00F3E0`, `0x049241`, `0x049330` | boot / global reset paths | Unconditional clears while zeroing `D177BB`, `D1407F`, and other startup flags. |
| `0x00` | `0x00B8AD`, `0x00B8B2`, `0x04DF61`, `0x04DFAE`, `0x04E02A` | state-`0x10` cleanup helpers | Reader first checks `D176F8 == 0x10`; if the side flag is clear, these paths zero `D176F8` and often `D176FB` too. |
| `0x00` | `0x01136B`, `0x013CF7`, `0x02D775`, `0x04D56F` | post-processing / restart helpers | Clears after a prior `0x0F` or after tearing down a substate and companion bytes. |
| `0x00` | `0x02BFAF`, `0x02BFE1`, `0x02CB86`, `0x02F249`, `0x06363F`, `0x063952`, `0x063F55`, `0x06412C` | wrapper / receive-family exits | Unconditional cleanup after helper calls or after copying data into the transport buffers. |
| `0x01` | `0x014522`, `0x047E91` | mirrored success paths | Both write `0x01` immediately after copying `D1771A -> D1772A`, then call the next helper (`0x0141BC` or `0x000430`). |
| `0x02` | `0x014003`, `0x0145AA` | handshake / checker stage | `0x014003` is gated by the `D176F2` null/zero test; `0x0145AA` follows a packet read / stack cleanup path. |
| `0x03` | `0x0149F3` | checker-success continuation | Written only after `CALL 0x006EDA` succeeds; the routine then queues `BC=0x00AA10` and calls `0x0117F4`. |
| `0x04` | `0x014A48` | `0x03 -> 0x04` promotion | Reached only when arithmetic on the current state proves `D176F8 == 0x03`; the routine then calls `0x01167C`. |
| `0x05` | `0x04865D` | sequencer block around `0x04862A` | Writes `0x05`, seeds `D176F5 = 0x00000B`, and jumps into the common `CALL 0x000464` continuation. |
| `0x06` | `0x048752` | sequencer block around `0x04874D` | Same continuation family as `0x05`, but entered from a later pop/return chain. |
| `0x07` | `0x0481A3` | sequencer block around `0x04818A` | Writes `0x07`, zeros `D17726..D17727`, then compares `D176EC - D176E6`. |
| `0x08` | `0x048935` | sequencer block around `0x04892D` | Writes `0x08` and enters the same `CALL 0x000464` transport continuation family. |
| `0x09` | `0x0654FB` | late-stage sender block around `0x0654F3` | Writes `0x09`, then pushes `D17722` and calls `0x000464`. |
| `0x0A` | `0x0656BC` | `0x09 -> 0x0A` promotion | Reader at `0x0656A9` first proves the current state is `0x09`; this block upgrades it to `0x0A` and seeds `D176BD`, `D176D7`, `D176DD`, and `D176DA`. |
| `0x0C` | `0x02E7A9` | header path | Immediate writer stub: `LD A,0x0C; LD (D176F8),A; ... CALL 0x06A367`. This matches session 411's header interpretation. |
| `0x0D` | `0x0135A4` | USB receive worker B (`0x013377..0x0135CE`) | Written only after worker B accepts states `0x0A/0x0C/0x0D`, copies the payload, calls `0x00704E`, and advances `D176DA`. This matches session 411's complete state. |
| `0x0E` | `0x02DF2D` | pre-header / staging path | Writes `0x0E`, zeroes `D176F5`, then pushes `0x13` and `0x99` into `CALL 0x049CCA`. Exact semantics are still unclear, but it is a real protocol state. |
| `0x0F` | `0x00B5EB`, `0x00B626`, `0x02D7E6`, `0x043E0A`, `0x043E45` | mirrored packet-builder entry paths | All five sites write `0x0F` before entering packet copy / transport setup code. Multiple readers later test for `0x0F`, so this is an important staging state. |
| `0x10` | `0x04DEDD`, `0x04DF00` | tiny state-set stubs | Both are immediate `LD A,0x10; LD (D176F8),A; CALL ...` blocks. Readers at `0x00B89D` and `0x04DF51` special-case `0x10` and may clear it. |

## Absolute Reader Map

| Read site(s) | Test performed | Interpretation |
| --- | --- | --- |
| `0x00AB4C` | `CP 0x01` | State `0x01` dispatches to `CALL 0x01456F`. |
| `0x00AB6C`, `0x00AB74` | `CP 0x02`, `CP 0x03` | States `0x02` and `0x03` dispatch to `CALL 0x014768`. |
| `0x00B89D` | `CP 0x10` then checks `D177BB` | Special-case clear for state `0x10`. |
| `0x00F2F4`, `0x00F318`, `0x00F320` | `OR A` zero check, `CP 0x02`, `CP 0x03` | Global gate that treats `0x00`, `0x02`, and `0x03` specially before looking at `D1772D` / `D1772A`. |
| `0x0111F2` | `CP 0x0F` | Buffer / length bookkeeping path that only runs when the staging state is `0x0F`. |
| `0x01130D`, `0x011315` | `CP 0x07`, `CP 0x0F` | A later bookkeeping path accepts either `0x07` or `0x0F`. |
| `0x011362` | `CP 0x0F`, then clear to `0x00` | Consumes `0x0F` and explicitly clears it. |
| `0x0134A2`, `0x0134AA` | `CP 0x0C`, `CP 0x0A` | Worker B only continues through this copy path when the state is `0x0C` or `0x0A`. |
| `0x013511`, `0x013519`, `0x013521` | `CP 0x0C`, `CP 0x0D`, `CP 0x0A` | Worker B's post-copy gate accepts header, complete, or active-transfer states. |
| `0x014A35` | arithmetic equality test for `0x03` | If the current state is `0x03`, the routine upgrades it to `0x04`. |
| `0x02BDEF`, `0x02BE60` | `CP 0x0F` | Side guard that changes scratch-byte clearing when the staging state is `0x0F`. |
| `0x0480C9`, `0x0637AB` | `OR A; SBC HL,HL; LD L,A; CALL 0x000124` | The state byte is used as a small dispatch index. This is why states `0x05..0x08` and `0x09..0x0A` matter even when there is no explicit `CP` nearby. |
| `0x0482E2` | arithmetic equality test for `0x07` | State `0x07` triggers a special branch that clears `D176A8`. |
| `0x04DDF4` | `CP 0x01` | Another mirrored `state==1` dispatch guard. |
| `0x04DF51` | `CP 0x10` | Mirrored `state==0x10` special-case reader. |
| `0x0656A9` | arithmetic equality test for `0x09` | This is the direct precursor to the `0x09 -> 0x0A` transition. |

## Compare / Test Summary

Direct `CP` instructions after `LD A,(D176F8)` compare against:

- `0x01`
- `0x02`
- `0x03`
- `0x07`
- `0x0A`
- `0x0C`
- `0x0D`
- `0x0F`
- `0x10`

Additional non-`CP` state tests exist:

- `0x00` via `OR A` zero checks
- `0x03` via arithmetic subtraction in the `0x014A35` block
- `0x07` via arithmetic subtraction in the `0x0482E2` block
- `0x09` via arithmetic subtraction in the `0x0656A9` block

## Interpreted State Machine

This is the best-fit model from the ROM scan:

1. `0x00` is the idle / cleared state.
2. `0x01 -> 0x02 -> 0x03 -> 0x04` is an early handshake / validation chain.
3. `0x05`, `0x06`, `0x07`, and `0x08` are real intermediate protocol states. They are written as distinct immediates and later consumed by dispatch-style readers rather than only by `CP`.
4. `0x09 -> 0x0A` is a late promotion into the active-transfer state.
5. `0x0C -> 0x0D` is the header-to-complete path confirmed by worker B in session 411.
6. `0x0E` and `0x0F` are auxiliary staging states. `0x0F` is especially important because multiple mirrored packet-builder entries write it and multiple readers test it later.
7. `0x10` is a special sentinel / modal state that is set by small wrapper stubs and explicitly cleared by dedicated readers.

So the session 411 view was accurate but incomplete. `D176F8` is not just a three-value worker-local tag; it is a broader transport state byte shared by multiple mirrored link / USB code families.

## Nearby RAM: `D176F0..D17700`

Direct absolute references in the immediate neighborhood show that `D176F8` sits inside a tight protocol-control cluster:

| Address | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `D176F2` | `57` | `57` | Very active companion field; checked immediately before the `0x014003` state-`0x02` write. Likely a primary pointer / descriptor slot. |
| `D176F5` | `1` | `15` | Written with `0x00000B` in the `0x05` path and cleared in the `0x0E` path. Looks like a 24-bit remaining-length / limit field. |
| `D176F8` | `25` | `44` | Protocol byte under study. |
| `D176F9` | `1` | `3` | Small auxiliary flag near the `0x00` and `0x0F` families. |
| `D176FA` | `4` | `6` | Adjacent short field used by the same transport family. |
| `D176FB` | `4` | `30` | Frequently cleared alongside `D176F8`; likely an ack / subflag byte. |
| `D176FC` | `3` | `5` | Cleared on the `0x02` checker path and touched by later helpers. |
| `D176FD` | `27` | `21` | Read before the `0x03 -> 0x04` promotion; likely a byte count or fragment counter. |
| `D176FE` | `6` | `9` | Small adjacent counter / flag. |
| `D176FF` | `6` | `11` | Small adjacent counter / flag. |

The closest out-of-window companions that travel with `D176F8` most often are:

- `D17713`, `D1771A`, `D17722`, `D1772A` for pointers / accumulation
- `D1772D`, `D17745`, `D17747`, `D1774B`, `D17751` for side flags and callback pointers
- `D17795` as a second protocol byte already identified in session 409/411

## Bottom Line

- `D176F8` is a byte-sized protocol state register with at least `16` concrete values.
- The transport path seen in session 411 (`0x0A`, `0x0C`, `0x0D`) is only one slice of the larger machine.
- The cleanest newly visible transitions are:
  - `0x09 -> 0x0A`
  - `0x0C -> 0x0D`
  - `0x03 -> 0x04`
  - several mirrored entries into `0x0F`
- There is no evidence that the ROM reaches `D176F8` through an IX/IY-based struct alias. The byte is accessed directly everywhere it appears.

