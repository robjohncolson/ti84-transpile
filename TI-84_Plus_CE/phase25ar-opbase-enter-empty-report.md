# Phase 25AR - OPBase reseed + ENTER handler (empty ENTER, numLastEntries=0)

## Status

Pending runtime execution.

This stub was created by the subagent. Running
`node TI-84_Plus_CE/probe-phase25ar-opbase-enter-empty.mjs`
will overwrite this file with the captured report and console output.

## Probe Summary

- Cold boots the ROM, runs `MEM_INIT`, and re-seeds the allocator-family pointers before dispatch.
- Seeds `cxMain=0x058241`, `cxCurApp=0x40`, tokenized `2+3` at `userMem`, and the error frame.
- Leaves `numLastEntries=0` so the ENTER handler should take the empty-ENTER path.
- Calls the second-pass ENTER handler at `0x0585E9` with `A=0x05` and `B=0x05`.
- Records hits for `0x058C65`, `0x058C82`, `0x058693`, `0x0586E3`, `0x099910`, `0x099914`, `0x082745`, and `0x0921CB`.
- Dumps `OP1`, `errNo`, allocator pointers, `SP`, the first 100 block PCs, the last 50 block PCs, and the unique PC count.

## Console Output

Not captured in this subagent run.
