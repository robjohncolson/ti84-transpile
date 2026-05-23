# Phase 414: Trace 0x015185 Notification Completion Callback

## Verdict

- `0x015185` is the 33-byte completion callback that `0x0151FE` stages into `D17770`.
- It does three direct things before returning:
  - clears `D17779`
  - sets `D1777A = 1`
  - indirect-dispatches the hook stored in `D143EA`
- The callback does not touch ports and does not call the main delivery path again. It is a post-delivery handoff shim.
- In the `0x01567C` wrapper path traced in phase 412, `D143EA` is loaded with `0x0121EF`, so this callback effectively dispatches `0x0121EF` after flipping the completion flags.

## Full Disassembly

Function body: `0x015185..0x0151A5` (`0x21` bytes, 33 decimal).

```text
0x015185  AF                  XOR A
0x015186  32 79 77 D1         LD (0xD17779),A
0x01518A  3E 01               LD A,0x01
0x01518C  32 7A 77 D1         LD (0xD1777A),A
0x015190  01 00 00 00         LD BC,0x000000
0x015194  C5                  PUSH BC
0x015195  01 03 00 00         LD BC,0x000003
0x015199  C5                  PUSH BC
0x01519A  FD 2A EA 43 D1      LD IY,(0xD143EA)
0x01519F  CD 88 22 00         CALL 0x002288
0x0151A3  C1                  POP BC
0x0151A4  C1                  POP BC
0x0151A5  C9                  RET
```

## RAM Addresses Accessed

| Address | Access | Purpose |
| --- | --- | --- |
| `0xD17779` | write | Notification active/armed flag for Channel 2. Cleared immediately on callback entry. |
| `0xD1777A` | write | Notification completion byte for Channel 2. Set to `1` to mark completion. |
| `0xD143EA` | read | Descriptor callback slot 1 / hook. Loaded into `IY` just before the indirect trampoline call. |

Among the notification-state bytes named in the session prompt, only `D17779` and `D1777A` are touched directly by this function.

## Stack Setup

Before dispatching the hook, the callback prepares two literal stack arguments:

| Site | Effect |
| --- | --- |
| `0x015190` + `0x015194` | push `0x000000` |
| `0x015195` + `0x015199` | push `0x000003` |
| `0x0151A3` + `0x0151A4` | pop both arguments back off the stack after the hook returns |

Under the same IX-frame calling convention seen in `0x0151FE`, the last push becomes the first stack argument, so this is effectively a `(3, 0)` call setup.

## Subroutines Called

### Direct call

| Site | Target | Role |
| --- | --- | --- |
| `0x01519F` | `0x002288` | `_indcall` trampoline. Phase 314 and phase 411 identified this as a single-instruction helper: `JP (IY)`. |

### Effective indirect target

`0x015185` does not hardcode the real follow-up body. Instead it loads `IY` from `D143EA` and calls the trampoline.

Known wrapper context from phase 412:

- `0x01567C` stores `0x0121EF` into `D143EA`
- `0x01567C` then stages `0x015185` into `D17770` through `0x0151FE`

So in that notification path, `0x015185` effectively dispatches:

```text
0x0121EF(3, 0)
```

Pattern scan context:

- `0x0004E0` is a direct `JP 0x015185` vector stub
- `0x01520F` is the `LD BC,0x015185` site inside `0x0151FE` that registers this callback into `D17770`
- no direct `CALL 0x015185` sites were found in the ROM scan used for this report

## What The Function Does

In plain English, `0x015185` is the "notification finished" callback for the staged `D17770..D1777A` block.

Its sequence is:

1. Clear the Channel 2 active/armed flag (`D17779 = 0`).
2. Mark the Channel 2 completion byte as done (`D1777A = 1`).
3. Push two small literal arguments (`3` and `0`) for a follow-up routine.
4. Load a callback pointer from `D143EA`.
5. Indirect-jump to that callback through the shared `JP (IY)` trampoline at `0x002288`.
6. Clean up the two pushed arguments and return.

That matches the phase 413 staging pattern exactly:

- `0x0151FE` arms the block by clearing `D17779`, clearing `D1777A`, storing `0x015185` in `D17770`, then setting `D17779 = 1`
- `0x015185` flips the same block into its completion state by clearing `D17779` and setting `D1777A = 1`

So the best-fit interpretation is:

**`0x015185` is the post-delivery completion shim that marks the staged notification record complete and then hands off to the descriptor hook selected in `D143EA`.**
