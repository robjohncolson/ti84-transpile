# Phase 25AE - CoorMon Home-Screen Dispatch Probe with Seeded cxCurApp

This is a placeholder report created alongside `probe-phase25ae-coormon-homeapp.mjs`.

Running the probe will overwrite this file with the runtime report, including:

- `cxCurApp` before and after CoorMon
- Known-routine hit counts for `GetCSC`, `ParseInp`, JT slots, and the `0x08C308` sub-dispatch area
- The first 200 unique PCs in execution order
- The GetCSC-to-dispatch chain
- All reads from `0xD007CA-0xD007E1`
- Final `errNo`, `OP1`, and pointer snapshots

The probe was not executed in this subagent session because post-patch verification and probe execution were explicitly disallowed.
