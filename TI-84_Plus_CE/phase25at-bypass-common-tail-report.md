# Phase 25AT - Bypass Common Tail at 0x0586CE / 0x0586E3 / 0x099914

Execution is pending.

This file is a scaffold added by the subagent because subagent mode required writing the probe and exiting without running post-edit verification. Running `TI-84_Plus_CE/probe-phase25at-bypass-common-tail.mjs` will overwrite this file with the actual scenario results.

Planned scenarios:

- Scenario A: enter at `0x0586CE` after the known `0x09215E` / LCD-loop blocker and after the `0x0586CC` branch point.
- Scenario B: enter at `0x0586E3` so the common-tail `CALL 0x099910` trampoline executes directly.
- Scenario C: enter at `0x099914` as the ParseInp control case.

Seed plan encoded in the probe:

- MEM_INIT via JT slot `0x020164`.
- Tokenized input `2+3` at `0xD1A881`: `72 70 71 3F`.
- Allocator pointers seeded to `FPSbase/FPS=0xD1A881` and `OPBase/OPS/pTemp/progPtr=0xD3FFFF`.
- Main-stack `FAKE_RET=0xCECECE` plus a separate PushErrorHandler-style `errSP` frame with `hlPayload=0x099929`.
- Report fields include `0x099910`/`0x099914` hit state, `OP1`, `errNo` from `0xD008DF`, and the task-requested bytes at `0xD008AF`.
