# Phase 415: Trace 0x002288 Completion Dispatcher

## Verdict

- `0x002288` is not a Channel 2 cleanup routine. It is the shared `_indcall` trampoline: `JP (IY)`.
- The reachable body is exactly two bytes: `FD E9`.
- There are no RAM references, no port I/O operations, no stack-frame setup calls, and no `CP` comparisons in the reachable body.
- `0x002288` does not write `D177B7`, does not clear `D143EA`, and does not touch `D1440E`.
- Any post-completion cleanup after `0x015185` must happen in the callback pointer already loaded into `IY`, not in `0x002288` itself.

## Reachable Disassembly

Function entry: `0x002288`

```text
0x002288  FD E9              JP (IY)
```

That is the entire reachable function body. Because the very first instruction is an indirect jump, the linear trace ends immediately.

## What The Probe Is Checking

The new probe:

- reads `TI-84_Plus_CE/ROM.rom`
- decodes from `0x002288` in ADL mode
- follows unconditional `JP` and `JR` targets when they are explicit ROM addresses
- stops at `RET`, `HALT`, `SLP`, indirect jump, or a 200-byte budget
- reports:
  - every decoded instruction with address, bytes, and mnemonic
  - absolute RAM references (`>= 0xD00000`)
  - port I/O instructions
  - `CALL` targets
  - `JP`/`JR` targets
  - pattern checks for frame helpers and `CP`-style dispatch logic

For `0x002288`, those checks should all come back empty except for one dynamic jump target:

- `JP (IY)` at `0x002288`

## Implications For Channel 2 Completion

Phase 414 already established this flow:

1. `0x015185` clears `D17779`
2. `0x015185` sets `D1777A = 1`
3. `0x015185` pushes `(3, 0)` on the stack
4. `0x015185` loads `IY` from `D143EA`
5. `0x015185` calls `0x002288`

Since `0x002288` is only `JP (IY)`, it contributes no cleanup logic of its own. It simply transfers control to the callback that `0x015185` already selected through `D143EA`.

So the answers to the session questions are:

- Does `0x002288` update `D177B7`? No.
- Does `0x002288` clear `D143EA`? No.
- Does `0x002288` route cleanup by channel ID? No; there is no compare or dispatch logic here.
- Where is the real follow-up behavior? In the concrete callback target loaded into `IY`.

## Next Trace Target

If the goal is to find where `D177B7`, `D143EA`, or `D1440E` are modified after Channel 2 completion, the next useful target is not `0x002288`. It is the actual callback pointer staged into `D143EA` for this path.

Phase 414 already tied one wrapper path to:

- `D143EA = 0x0121EF`

So the natural next step is to trace `0x0121EF` rather than the trampoline at `0x002288`.
