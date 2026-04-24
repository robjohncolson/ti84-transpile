# Phase 25AN - ENTER dispatch from 0x0585E9 with a 500K budget

This placeholder report was created without executing the probe.

Subagent mode for this task forbids running the new probe after patching, so the measured results are not embedded yet. Running:

```bash
node TI-84_Plus_CE/probe-phase25an-enter-500k.mjs
```

will overwrite this file with:

- Scenario A and Scenario B sections
- hit steps for `0x099914`, `0x0973C8`, `0x0973F8`, `0x09740A`, `0x0921CB`, `0x05862F`, and `0x05E3A2`
- `0x0827xx` allocator-band stats, final PC, step count, and whether execution escaped the allocator range before termination
- `OP1` bytes plus decoded value, `errNo`, `0xD01D0B` before/after, and the allocator pointer snapshot for both scenarios
- a comparison section stating whether forcing `0xD01D0B=0x00` changed the ENTER path or let `0x0921CB` return to `0x05862F`
