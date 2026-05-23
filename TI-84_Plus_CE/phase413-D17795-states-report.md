# Phase 413: D17795 Protocol State Byte Report

This file summarizes the same ROM-wide `D17795` sweep that [`probe-phase413-D17795-states.mjs`](./probe-phase413-D17795-states.mjs) reproduces from `ROM.rom`.

Because subagent mode forbade running the new probe after patching, the numbers below are a static snapshot from the pre-patch scan of the same ROM image.

## Executive Summary

- Exhaustive absolute-address sweep for `95 77 D1` across `ROM.rom` found `21` raw references to `D17795`.
- `15` references are `LD (0xD17795),A` writers.
- `6` references are `LD A,(0xD17795)` readers.
- No `LD (0xD17795),BC/HL/SP` or matching wide readers were found.
- Observed write values are `0x00`, `0x01`, `0x02`, `0x03`, `0x04`, `0x05`, `0x06`, and `0x07`.
- Observed checked values are `0x00` via `OR A`, plus `0x02`, `0x03`, `0x04`, and `0x05` via `CP n`.

The earlier session notes were directionally right but incomplete:

- Worker A at `0x01336A` writes `0x04`.
- Dispatch-table handler index `2` at `0x01210A` also writes `0x04`.
- Dispatch-table handler index `3` at `0x012118` writes `0x05`.
- Worker B at `0x0133E7` and the continuation at `0x013727` write `0x02`.
- The `0x0136D0` helper writes `0x07` after storing `D176F2` and clearing `D176DA` / `D176DD`.

## Writer Map

| Value | Write site(s) | Local context |
| --- | --- | --- |
| `0x00` | `0x00F3E5`, `0x013136`, `0x041CC2` | Pure clear/reset paths. Each site uses `XOR A; LD (D17795),A` while zeroing nearby control bytes. |
| `0x01` | `0x011109` | Small dispatcher entry writes `1` and jumps into the `0x011499` family. |
| `0x02` | `0x0133E7`, `0x013727` | Worker-B family. `0x0133E7` writes `2` after the `D176D1` check; `0x013727` writes `2` just before `CALL 0x01106A`. |
| `0x03` | `0x011309` | Mid-ROM helper writes `3`, then immediately checks whether `D176F8 == 0x07`. |
| `0x04` | `0x0115CE`, `0x01210A`, `0x01336A` | Setup/ready paths. `0x01210A` is dispatch-table handler index `2`, `0x01336A` is worker A, and `0x0115CE` is a broader setup block that also clears `D1777B`, `D1777E`, `D1777F`, `D17782`, `D17787`, `D1778A`, `D1778B`, and `D1778E`. |
| `0x05` | `0x012118` | Dispatch-table handler index `3` writes `5` before `CALL 0x01340F`. |
| `0x06` | `0x011184`, `0x01142A`, `0x011495` | Three sibling mid-ROM paths write `6`; two also seed `D176F2 = 0x00CCCC` before rejoining the `0x011499` family. |
| `0x07` | `0x0136D0` | Error/result path. The write follows `LD (D176F2),HL`, then the helper clears `D176DA` and `D176DD`. |

## Reader Map

| Read site(s) | Checks | Local meaning |
| --- | --- | --- |
| `0x011111` | `OR A` zero-check | Uses `D17795` as a small dispatch index via `SBC HL,HL; LD L,A; CALL 0x00211B`, so state `0` is explicitly meaningful. |
| `0x012241`, `0x012249` | `CP 0x02`, `CP 0x03` | A short branch family distinguishes states `2` and `3`. |
| `0x012281` | `CP 0x05` | Separate gate for the alternate mode written by handler index `3`. |
| `0x01365D`, `0x013665` | `CP 0x03`, `CP 0x04` | Extended worker accepts states `3` or `4` before following the `D176DD` path. |

## Interpreted State Machine

Best-fit model from the ROM sweep:

1. `0x00` is the cleared / idle state.
2. `0x01` is a dispatch-selector state. The direct consumer is the `0x011111` dispatch-index reader.
3. `0x02` is a worker-B-family state. It is produced twice and explicitly consumed by the `0x012241` gate.
4. `0x03` is a mid-stage state. It later shares a reader family with `0x02`, and the extended worker also accepts it alongside `0x04`.
5. `0x04` is a ready/setup state. Worker A and dispatch-table handler index `2` both set it, and the extended worker explicitly accepts it.
6. `0x05` is a separate alternate mode written only by dispatch-table handler index `3` and checked by its own gate at `0x012281`.
7. `0x06` is an auxiliary/error-like substate inside the `0x01117C..0x011499` family, often paired with the `D176F2 = 0x00CCCC` marker.
8. `0x07` is a terminal error/result state written by the `0x0136D0` helper.

So `D17795` is a smaller protocol substate byte than `D176F8`, but it is still a real multi-value state machine rather than a one-off mode flag.

## Corrected Handler Mapping

The task prompt mentions a mode `4 -> 5` transition around “handler 2”. The ROM bytes show the split more precisely:

- `0x01210A` is dispatch-table handler index `2`, and it writes `0x04`.
- `0x012118` is dispatch-table handler index `3`, and it writes `0x05`.

That means the two neighboring handlers select different `D17795` modes; they are not the same handler writing both values.

## Bottom Line

- `D17795` has `8` concrete write values in this ROM: `00..07`.
- The cleanest externally visible reader gates are:
  - `{0x02, 0x03}` at `0x012241` / `0x012249`
  - `{0x03, 0x04}` at `0x01365D` / `0x013665`
  - `{0x05}` at `0x012281`
  - `{0x00}` via the dispatch-index zero-check at `0x011111`
- There is no evidence of any wide `BC` / `HL` / `SP` access to `D17795`; every real reference is a byte-sized absolute load or store.
