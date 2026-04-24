# Phase 25AM - Run 0x0585E9 with A=5 (kEnter)

This placeholder report was created without executing the probe.

Subagent mode for this task forbids running the new probe after patching, so the measured results are not embedded yet. Running:

```bash
node TI-84_Plus_CE/probe-phase25am-enter-via-0585E9.mjs
```

will overwrite this file with:

- hit steps for `0x099211`, `0x099914`, `0x0973C8`, and the requested setup helpers
- final `OP1` bytes plus decoded value
- final `errNo`
- final `PC`, step count, and termination mode
- an analysis section stating whether the `CoorMon -> HomeHandler -> 0x0585E9 -> 0x099211 -> ParseInp` chain was confirmed
