# Phase 604: Decode the second wipe caller

## Goal

Session 603 showed that the two calls into the bulk RAM wipe at `0x0018F8` diverge at frame 29:

- Hit #1 routes through `0x048BFB`, then later rejoins the shared wipe path.
- Hit #2 routes through `0x013D9F -> 0x0059E9 -> 0x0059F3 -> 0x001C55`, then later reaches the same `0x0158xx -> 0x001872 -> 0x0018F8` wipe path.

The probe in `probe-phase604-013d9f-decode.mjs` statically disassembles the unique addresses so the second wipe can be classified without re-running the long dynamic trace.

## How to run

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase604-013d9f-decode.mjs
```

The probe reads `TI-84_Plus_CE/ROM.rom`, decodes eZ80 ADL-mode 24-bit immediates, prints each range, and annotates:

- `CALL` targets
- `JP` targets
- `JR` and conditional `JR` targets
- flag checks from conditional returns, conditional jumps, `CP A,n`, and `BIT` tests

## Address ranges decoded

| Address | Bytes | Purpose |
| --- | ---: | --- |
| `0x013D9F` | 64 | Hit #2 frame-29 divergence point. The key question is what setup occurs before the call into `0x0059E9`. |
| `0x0059E9` | 32 | First helper in the unique Hit #2 chain. |
| `0x0059F3` | 32 | Second helper in the unique Hit #2 chain, expected to expose the handoff into `0x001C55`. |
| `0x001C55` | 32 | Context-loop-adjacent entry near `0x001C44` and `0x001C7D`; compare its branch and flag behavior against the shared dispatcher path. |
| `0x048BFB` | 32 | Hit #1 frame-29 divergence point for comparison with the context path. |

## Interpretation checklist

Use the printed output to answer these questions:

1. At `0x013D9F`, identify register setup, pushed state, immediate loads, flag checks, and the exact `CALL 0x0059E9` site.
2. At `0x0059E9` and `0x0059F3`, check whether the code loads or tests context-descriptor-like pointers before calling or jumping to `0x001C55`.
3. At `0x001C55`, compare the entry behavior to `0x001C44`: whether it enters the same loop midstream, skips an initial descriptor advance, or changes condition handling.
4. At `0x048BFB`, classify the Hit #1 path separately: memory-management setup should differ from the Hit #2 path if it does not pass through the `0x0059xx -> 0x001C55` context helper chain.

## Current status

This report is a runbook plus placeholder for the probe output. In this subagent invocation the requested files were created, but the probe was not executed because the subagent instructions explicitly said to stop after applying patches and not run verification commands.
