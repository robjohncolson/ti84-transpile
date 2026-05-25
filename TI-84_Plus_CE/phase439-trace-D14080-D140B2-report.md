# Phase 439 Report: D14080 / D14082 / D140B2 USB Pipe State Group

## Summary

| Variable | Total refs | Reads | Writes | Static value range | Best-fit role |
| --- | ---: | ---: | ---: | --- | --- |
| `D14080` | 19 | 4 | 15 | `0x00` plus 2 IX-scratch writes that collapse to `0/1` in the surrounding branch | Boolean-ish pipe-config / re-arm latch |
| `D14082` | 20 | 2 | 18 | `0x00`, `0x01` | Service latch B / OTG re-arm request bit |
| `D140B2` | 67 | 6 | 61 | `0x00`, `0x01`, `0x02`, `0x04` | Multi-state pipe / result byte |

All three live inside the wider `D14040..D140B2` USB state slab. `0x00C9A0` clears that whole slab, so any nonzero meaning for these bytes is post-reset runtime state, not persistent configuration.

## D14080

Static profile:
- 19 total refs: 15 writes, 4 reads, no addr-load-only sites.
- 13 writes are direct clears via `XOR A ; LD (D14080),A`.
- 2 writes (`0x008D12`, `0x036D27`) store an IX-local scratch byte after `D177B8 == 0x85` is tested, so the effective range is still boolean `0/1`, not a free counter.
- Every read is a zero/nonzero gate: `LD A,(D14080) ; OR A ; JP/JR ...`.

Key sites:
- `0x008472` / `0x04965A`: early gate wrappers. If `D14080 != 0`, they bypass the normal worker path.
- `0x008D12` / `0x036D27`: P2 init-priority path (`0x008BE9` mirror pair) stores the local `0/1` result before USB packet setup.
- `0x009918` / `0x049309`: cleared after the `0x012456` + `0x006FAF` path and before `dispatch_key(0x01,0x00)`.
- `0x00EEEF` / `0x02B919`: cleared immediately before `D14072` reflects port `0x3082 bit 5`.
- `0x00FD22` / `0x02C28C`: bulk clear alongside `D1407E`, `D1407F`, `D14081`, `D1408D`.
- `0x012810` / `0x0413E0`: clear paired with `D1407E` before touching port `0x31CB`.

Co-access pattern:
- Strongest neighbors are `D14072`, `D1407E`, `D1407F`, `D14081`, and `D1408D`.
- That places `D14080` inside the same pipe arm / teardown cluster as `D1407E` and `D1407F`, not in the `D14082..D14086` service-latch subgroup.

Assessment:
- `D14080` is best read as a boolean-ish pipe-config latch: set on the richer `D177B8 == 0x85` init path, then cleared by multiple reset, disconnect, and re-arm sequences.
- It is not a general counter and it is probably not the primary "pipe active" bit, because `D1407E` already fills that role.

## D14082

Static profile:
- 20 total refs: 18 writes, 2 reads.
- 16 writes clear it to `0x00`.
- Only 2 writes set it to `0x01`: `0x009ABD` and mirror `0x0494AE`.
- The only reads are the tiny getter pair `0x012756` / `0x04132D`, both `LD A,(D14082) ; RET`.

Key sites:
- `0x009ABD` / `0x0494AE`: set to `1` inside the `0x0098D2` masked-status dispatcher when `D14048 bit 4` is present.
- `0x012470` / `0x041070`: first clear inside `0x012456`, before the `0x3080` control sequence.
- `0x012E86` / `0x041A2A`: cleared together with `D14084` and `D14083` in the follow-up sampler/reset helper.
- `0x012FD8` / `0x041B66`: cleared together with `D1407B` in teardown.
- `0x012710`, `0x01277A`, `0x0127D6` and mirrors: clear-only service helpers around the same OTG/control cluster.

Co-access pattern:
- Tightest neighbors are `D14083`, `D14084`, `D14085`, `D14086`, `D14073`, `D14075`, `D1407B`, and `D14098`.
- This is a service-latch family, not a pipe-data family.

Assessment:
- `D14082` is not a durable "USB connected" state. It behaves like a request / service latch raised by one masked interrupt bit and consumed by later helpers.
- The placement of the getter, plus the fact that `0x012456` clears it before doing controller sequencing, fits "OTG re-arm request" or "pending service B" better than "session established".

## D140B2

Static profile:
- 67 total refs: 61 writes, 6 reads.
- Write histogram from the direct stores: `0x01` x45, `0x00` x7, `0x02` x7, `0x04` x2.
- Read sites split into three behaviors:
  - `CP 0x02` at `0x00C639` / `0x02B49F`
  - `CP 0x01` at `0x00C658` / `0x02B4BE`
  - `OR A ; JP NZ` at `0x00F27D` / `0x02BF32`

Key sites:
- `0x009772`, `0x00985A`: non-initialized USB controller ISR (`0x0096CB`) sets `D140B2 = 1` on SOF / reset-style controller events while also zeroing `D140AF` and `D14040`.
- `0x0098A4`: same ISR clears `D140B2` together with `D1407E` and `D17796` on teardown.
- `0x00A85D`, `0x00A893`, `0x00A8A9` and bank-2 mirrors: write `1` while co-accessing `D1407F`, `D177BB`, `D14040`, `D140A6`.
- `0x00A9CF`: writes `4` after copying `D1409F/D140A0` into `D140AA`.
- `0x00A9E3`, `0x00AA02`, `0x00AA0A` and mirrors: write `2` after branching on `D140A2` and helper results.
- `0x00C680` / `0x02B4E6`: clear to `0` when `D140AF` null-check fails.
- `0x00C9D1`: hard reset clears it as part of the tail of the `D14040..D140B2` sweep.
- `0x00F27D` / `0x02BF32`: large USB state machine treats any nonzero `D140B2` as a guard that diverts later `D140AF`-dependent work.

Co-access pattern:
- Strongest companions are `D14040`, `D140AF`, `D1407E`, `D1407F`, `D1408B`, `D1408D`, `D177BB`, `D14095`, `D140A2`, and `D140AA`.
- This is wider than the `D14070` mini-block. `D140B2` ties the pipe-active bytes to descriptor / pointer / payload state in `D140A6..D140AF`.

Assessment:
- `D140B2` is clearly not a boolean. The code distinguishes at least four values, and the read sites compare against specific constants.
- Best fit is a pipe/result stage byte:
  - `0x00` = idle / teardown / no valid transfer state
  - `0x01` = common armed/configured path
  - `0x02` = typed follow-up state selected by the `D140A2` branch family
  - `0x04` = an earlier classifier state, set before the `D140A2` refinement

## Group Assessment

The pipe-state group now looks like this:

| Byte | Best-fit role |
| --- | --- |
| `D1407C` | bus-reset / connect-side latch |
| `D1407E` | pipe-active flag |
| `D1407F` | configuration / protocol-mode latch |
| `D14080` | pipe-config / re-arm latch |
| `D14082` | service-latch request bit |
| `D140B2` | cross-cluster pipe/result state byte |

What this means structurally:
- `D14080` and `D14082` are not peers of `D140B2`.
- `D14080` and `D14082` behave like small boolean extension latches appended just beyond the `D14070..D1407F` core block.
- `D140B2` is the tail sentinel of the larger `D14040..D140B2` state slab and carries richer phase information than the nearby booleans.

Special role of `D140B2` at the `0x00C9A0` boundary:
- `0x00C9A0` zeroes through `D140B2`, not merely around it.
- Later code uses `D140B2 == 0` as the "no live result / safe to proceed" state and `D140B2 != 0` as a block or alternate-route condition.
- That makes `D140B2` a natural tail flag for the whole slab: clearing it means the larger pipe / descriptor / pointer cluster is back to idle.

Lifecycle view:
1. Hard reset clears `D1407E`, `D1407F`, `D14080`, `D14082`-adjacent latches, `D140AF`, and `D140B2`.
2. The controller ISR and init helpers raise `D140B2 = 1` on active bring-up paths.
3. The P2 init-priority path may raise `D14080` to its nonzero state.
4. The masked-status dispatcher may raise `D14082 = 1` as a pending service request.
5. The classifier path writes `D140B2 = 4`, then refines to `2` in the `D140A2` branch family.
6. Teardown / null-pointer / disconnect helpers clear `D14080`, `D14082`, `D1407E`, and eventually `D140B2`.

Bottom line:
- `D14080` is a boolean-ish pipe-config latch.
- `D14082` is a boolean service request latch.
- `D140B2` is a richer pipe/result state byte that bridges the small `D1407x` pipe flags to the larger `D140A6..D140AF` descriptor/pointer state.
