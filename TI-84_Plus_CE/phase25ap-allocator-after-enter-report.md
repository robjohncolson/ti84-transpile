# Phase 25AP - Allocator Trace After Empty ENTER Return

## Status

Pending runtime execution.

This stub was created by the subagent. Running
`node TI-84_Plus_CE/probe-phase25ap-allocator-after-enter.mjs`
will overwrite this file with the captured trace and console output.

## Probe Summary

- Cold boots the ROM, runs `MEM_INIT`, then seeds `cxMain=0x058241` and `cxCurApp=0x40`.
- Seeds tokenized `2+3` at `userMem` and installs an error frame.
- Calls the second-pass ENTER handler at `0x0585E9` with `A=0x05` and `B=0x05`.
- Captures the first 200 executed instruction PCs, the empty-enter RET target, the first 30 instructions after that RET, the first 10 unique PCs after the RET target, and the first allocator-band entry in `0x0827xx`.
- Dumps `SP` plus the top 6 stack bytes before `CALL 0x0921CB`, at the empty-enter RET, and at the first allocator-band instruction.

## Static ROM Notes

- `0x058C82` is a plain `RET`.
- `0x0821B2` is `or a ; ret z`, so the `NZ` flag consumed at `0x082754` is effectively checking whether `A != 0`.
- `0x082754` is `jr nz, 0x082774`, which selects the fast side of the allocator preparation when `A` is non-zero.
- The actual loop back-edge is `0x082799 -> jp 0x082745`.
- The actual loop exit condition is `0x082798` (`ret c`): carry set returns and exits, while carry clear falls through to the back-edge.

## Console Output

Not captured in this subagent run.
