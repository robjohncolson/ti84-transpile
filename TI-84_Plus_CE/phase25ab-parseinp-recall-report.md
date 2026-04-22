# Phase 25AB - ParseInp Recall from Stored Variable "A"

This placeholder report is overwritten when `node TI-84_Plus_CE/probe-phase25ab-parseinp-recall.mjs` runs.

Planned probe flow:

- Cold boot the ROM
- Call `MEM_INIT` at `0x09DEE0`
- Call `CreateReal` at `0x08238A` with OP1 seeded to variable name `A`
- Capture the returned `DE` pointer and write `42.0` BCD bytes there
- Re-seed OP1 with `A`
- Seed token buffer `0xD00800` with `32 70 33 3f` and set `begPC/curPC/endPC`
- Call `ParseInp` at `0x099914`
- Record whether OP1 becomes `42.0`, stays as `A`, or becomes `5.0`
- Record `errNo`, step count, and whether the stored 9-byte variable data changed

Execution is still pending in this subagent because its wrapper explicitly forbids running post-patch probe / verification commands.
