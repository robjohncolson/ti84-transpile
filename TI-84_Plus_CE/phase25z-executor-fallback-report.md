# Phase 25Z: Executor Missing-Block Handling + Error Handler Decode

## Part A: Executor Missing-Block Handling (cpu-runtime.js lines 1064-1087)

When a PC has no transpiled block in `compiledBlocks`:

1. **Callback notification**: If `opts.onMissingBlock` is provided, it fires with `(pc, mode, steps)`.
2. **16-byte skip-ahead**: The executor tries offsets 1 through 16 from the current PC, checking each for a valid compiled block. If found, PC advances to that address and execution continues.
3. **Termination**: If no block is found within 16 bytes, execution terminates with `termination = 'missing_block'`.

**There is NO raw-byte interpreter fallback.** The executor cannot decode or execute individual instructions from ROM bytes. It is strictly skip-or-stop. This is by design -- the project is a 1:1 bytecode lift, not an emulator.

### PopErrorHandler gap analysis

PopErrorHandler at `0x061DD1` has **no transpiled block** (despite the previous version of this report claiming otherwise -- `"061dd1:adl"` does not exist in `ROM.transpiled.js`). The next transpiled block is at `0x061DEE` (29 bytes away). Since 29 > 16, the executor's skip-ahead **cannot bridge this gap**.

However, in the current 918-step ParseInp path, PopErrorHandler is never reached (see Part D), so this gap is not currently triggered.

## Part B: PopErrorHandler Decode (0x061DD1 - 0x061DEE)

ROM bytes: `2a 90 25 d0 d1 19 22 93 25 d0 d1 2a 8a 25 d0 19 22 8d 25 d0 e1 22 e0 08 d0 3a df 08 d0 c9`

Verified decode (eZ80 ADL mode):

```
0x061DD1: LD HL,(0xD02590)    ; load OPBase
0x061DD5: POP DE              ; pop OPS-OPBase delta (saved by PushErrorHandler)
0x061DD6: ADD HL,DE           ; OPS = OPBase + delta
0x061DD7: LD (0xD02593),HL    ; restore OPS
0x061DDB: POP DE              ; pop FPS-FPSbase delta
0x061DDC: LD HL,(0xD0258A)    ; load FPSbase
0x061DE0: ADD HL,DE           ; FPS = FPSbase + delta
0x061DE1: LD (0xD0258D),HL    ; restore FPS
0x061DE5: POP HL              ; pop previous errSP
0x061DE6: LD (0xD008E0),HL    ; restore errSP (chain to previous handler)
0x061DEA: LD A,(0xD008DF)     ; load errNo (set by JError dispatch)
0x061DEE: RET                 ; return with error code in A
```

**Semantics**: Restores operator stack (OPS) and floating-point stack (FPS) to values saved at PushErrorHandler time via deltas from base pointers, restores the previous error handler chain pointer (errSP), loads the error number into A, and returns to caller's error-handling code.

## Part C: Normal-Return Cleanup Stub (0x061E27 - 0x061E32)

ROM bytes: `f1 f1 f1 e3 22 e0 08 d0 e1 f1 c5 c9`

Verified decode (eZ80 ADL mode):

```
0x061E27: POP AF              ; discard saved PopErrorHandler address
0x061E28: POP AF              ; discard saved OPS delta
0x061E29: POP AF              ; discard saved FPS delta
0x061E2A: EX (SP),HL          ; swap HL with saved errSP on stack
0x061E2B: LD (0xD008E0),HL    ; restore previous errSP
0x061E2F: POP HL              ; restore original HL from stack
0x061E30: POP AF              ; discard saved error handler address (pushed by caller)
0x061E31: PUSH BC             ; push BC (return address from PushErrorHandler setup)
0x061E32: RET                 ; return to caller's normal flow
```

**Semantics**: When there is NO error, this stub cleans up the error frame built by PushErrorHandler. It discards the three saved values (PopErrorHandler addr, OPS delta, FPS delta), restores the previous errSP, and returns to normal execution. The stacks (OPS, FPS) are NOT restored because they were never corrupted.

## Bonus: PushErrorHandler Decode (0x061DEF - 0x061E1F)

```
0x061DEF: POP DE              ; pop return address into DE
0x061DF0: PUSH HL             ; save error handler address (passed by caller in HL)
0x061DF1: LD HL,(0xD008E0)    ; load current errSP
0x061DF5: PUSH HL             ; push old errSP
0x061DF6: LD BC,(0xD0258A)    ; load FPSbase
0x061DFB: LD HL,(0xD0258D)    ; load FPS
0x061DFF: OR A                ; clear carry
0x061E00: SBC HL,BC           ; FPS - FPSbase = FPS delta
0x061E02: PUSH HL             ; push FPS delta
0x061E03: LD BC,(0xD02590)    ; load OPBase
0x061E08: LD HL,(0xD02593)    ; load OPS
0x061E0C: SBC HL,BC           ; OPS - OPBase = OPS delta
0x061E0E: PUSH HL             ; push OPS delta
0x061E0F: LD HL,0x061DD1      ; PopErrorHandler address
0x061E13: PUSH HL             ; push PopErrorHandler
0x061E14: LD HL,0x061E27      ; NormalReturn stub address
0x061E18: PUSH HL             ; push NormalReturn
0x061E19: LD (0xD008E0),SP    ; save SP as new errSP
0x061E1E: EX DE,HL            ; HL = saved return address
0x061E1F: JP (HL)             ; return to caller
```

**Stack frame built by PushErrorHandler** (top to bottom):

1. NormalReturn address (0x061E27) -- returned to on normal exit
2. PopErrorHandler address (0x061DD1) -- returned to on error via JError
3. OPS delta (OPS - OPBase)
4. FPS delta (FPS - FPSbase)
5. Previous errSP
6. Error handler address (caller-supplied)

## Bonus: JError dispatch (0x061DB2 - 0x061DD0)

```
0x061DB2: LD (0xD008DF),A     ; store error number
0x061DB6: CALL 0x03E1B4       ; helper (cleanup)
0x061DBA: RES 7,(IY+0x4B)    ; clear flag bits
0x061DBE: RES 2,(IY+0x12)
0x061DC2: RES 4,(IY+0x24)
0x061DC6: RES 1,(IY+0x49)
0x061DCA: LD SP,(0xD008E0)    ; restore SP from errSP
0x061DCF: POP AF              ; pop NormalReturn address (discard)
0x061DD0: RET                 ; RET to PopErrorHandler (0x061DD1)
```

## Part D: Probe Results

Probe: `probe-phase25z-executor-fallback.mjs`

### Execution summary

| Metric | Value |
|--------|-------|
| Total execution steps | 918 |
| Steps in error handler region (0x061D00-0x061E40) | 3 (0.33%) |
| Steps as transpiled blocks | 3 |
| Steps as missing blocks | 0 |
| ParseInp termination | return_hit (FAKE_RET) |
| errNo | 0x8D (ErrSyntax) |
| OP1 | 5.0 |

### PCs visited in the error handler region

| PC | Has Block | Step | Landmark |
|----|-----------|------|----------|
| 0x061D3A | YES | 25 | `LD A, 0x8E` (ErrMemory entry point -- but A was set by caller before arriving here) |
| 0x061DB2 | YES | 26 | JError dispatch: `LD (errNo),A` |
| 0x061DBA | YES | 35 | JError cleanup: flag clears + `LD SP,(errSP)` + `POP AF` + `RET` |

### PopErrorHandler was NOT visited

PopErrorHandler at 0x061DD1 was never reached. This is because the probe's error frame was manually built with `ERR_CATCH_ADDR` (0x7FFFFA), not with a proper PushErrorHandler frame. The JError dispatch at 0x061DBA does `LD SP,(errSP)` which points to the probe's manual frame, directing execution to ERR_CATCH_ADDR instead of through PopErrorHandler.

### Block coverage gap

The gap from 0x061DBB to 0x061DED (51 bytes) contains PopErrorHandler (0x061DD1) with NO transpiled block. The executor's 16-byte skip cannot bridge the 29-byte distance from 0x061DD1 to the next block at 0x061DEE.

**Risk**: If a future probe or the browser shell uses PushErrorHandler (which pushes 0x061DD1 onto the stack as the error handler address), the executor will terminate with `missing_block` when JError fires and RETs into PopErrorHandler.

**Recommendation**: The transpiler should seed 0x061DD1 as a block entry point to support the OS's structured error handling. This is 29 bytes / 12 instructions.

## Assessment

The 918-step ParseInp success path (OP1=5.0) is entirely handled by transpiled blocks. Zero steps use the missing-block fallback (the only "missing" event is the synthetic sentinel at 0x7FFFFE). The error handler region is barely touched (3 steps), and only the dispatch path (not the recovery path) is exercised. The immediate gap to fix is the missing PopErrorHandler block at 0x061DD1, which will be needed for any code path using PushErrorHandler.
