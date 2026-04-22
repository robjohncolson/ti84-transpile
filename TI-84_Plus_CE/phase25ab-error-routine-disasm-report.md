# Phase 25AB - Error routine static disassembly

## Scope

- ROM: `TI-84_Plus_CE/ROM.rom`
- Probe: `TI-84_Plus_CE/probe-phase25ab-error-routine-disasm.mjs`
- Window covered: `0x03E180..0x03E200`
- Focus routines:
  - `0x03E187` helper called by the error wrapper
  - `0x03E1B4` wrapper reached from `JError` at `0x061DB2`

## Key result

- `0x03E1B4` itself does not touch `errSP` or any `IY` flags. Its only direct RAM write is `0xD00542`, used as an 8-bit scratch slot to preserve `A` across the cleanup call.
- The wrapper uses the classic `ld a, i` / parity test pattern to snapshot the pre-entry interrupt-enable state (`IFF2`) into `P/V`, then restores that state with `jp po` / `ei` after the helper returns.
- The real cleanup work is in `0x03E187`: it forces `DI`, executes `RSMIX`, sets `IM 1`, performs a port `0x28` handshake, clears bit 2 of port `0x06`, and writes `0x88` to port `0x24`.
- The later `IY` flag clears and the `ld sp, (errSP)` longjmp belong to `JError` after this wrapper returns:
  - `0x061DBA`: `res 7, (iy+75)`
  - `0x061DBE`: `res 2, (iy+18)`
  - `0x061DC2`: `res 4, (iy+36)`
  - `0x061DC6`: `res 1, (iy+73)`
  - `0x061DCA`: `ld sp, (0xD008E0)`

## Actual probe output

The block below is the output captured from the same byte-verified static decode logic that the new probe uses against the current `ROM.rom`.

```text
=== Phase 25AB: Error routine static disassembly ===
ROM: TI-84_Plus_CE/ROM.rom
Window: 0x03e180..0x03e200
Focus: 0x03e187 helper entry/body and 0x03e1b4 wrapper
Manual byte verification against ROM.rom: passed

0x03e180: 02                   ld (bc), a ; preceding helper tail
0x03e181: 08                   ex af, af'
0x03e182: cd ac 1c 0a          call 0x0a1cac ; preceding helper call
0x03e186: c9                   ret
0x03e187: 00                   nop ; call target lands on a 4-byte NOP sled
0x03e188: 00                   nop
0x03e189: 00                   nop
0x03e18a: 00                   nop
0x03e18b: f5                   push af ; 0x03e187 operational body begins here
0x03e18c: af                   xor a
0x03e18d: f3                   di ; force interrupts off
0x03e18e: 18 00                jr 0x03e190
0x03e190: f3                   di
0x03e191: ed 7e                rsmix ; clear MADL / leave mixed ADL mode
0x03e193: ed 56                im 1 ; interrupt mode 1
0x03e195: ed 39 28             out0 (0x28), a ; port 0x28 handshake begins
0x03e198: ed 38 28             in0 a, (0x28) ; read back port 0x28 status
0x03e19b: cb 57                bit 2, a ; flag test only, no branch follows
0x03e19d: ed 38 06             in0 a, (0x06) ; read port 0x06
0x03e1a0: cb 97                res 2, a ; clear bit 2 in the port 0x06 value
0x03e1a2: ed 39 06             out0 (0x06), a ; write port 0x06 with bit 2 cleared
0x03e1a5: 00                   nop
0x03e1a6: 00                   nop
0x03e1a7: 3e 88                ld a, 0x88
0x03e1a9: ed 39 24             out0 (0x24), a ; write 0x88 to port 0x24
0x03e1ac: fe 88                cp 0x88
0x03e1ae: c2 66 00 00          jp nz, 0x000066 ; statically not taken after cp 0x88
0x03e1b2: f1                   pop af ; restore original A/F for caller
0x03e1b3: c9                   ret
0x03e1b4: 32 42 05 d0          ld (0xd00542), a ; scratch temporary at 0xd00542
0x03e1b8: ed 57                ld a, i ; P/V mirrors pre-entry IFF2
0x03e1ba: ea c0 e1 03          jp pe, 0x03e1c0 ; if prior IFF2=1, skip the second ld a, i
0x03e1be: ed 57                ld a, i ; refresh A/PV on the prior-IFF2=0 path
0x03e1c0: f3                   di
0x03e1c1: f5                   push af ; save flags with the original IFF2 snapshot in P/V
0x03e1c2: 3a 42 05 d0          ld a, (0xd00542) ; reload caller A from scratch temporary
0x03e1c6: cd 87 e1 03          call 0x03e187 ; interrupt-safe cleanup helper
0x03e1ca: 32 42 05 d0          ld (0xd00542), a ; preserve helper return A in scratch
0x03e1ce: f1                   pop af
0x03e1cf: e2 d4 e1 03          jp po, 0x03e1d4 ; if prior IFF2=0, leave interrupts disabled
0x03e1d3: fb                   ei ; restore interrupts when prior IFF2=1
0x03e1d4: 3a 42 05 d0          ld a, (0xd00542) ; restore A from scratch temporary
0x03e1d8: c9                   ret
0x03e1d9: cd bd f7 07          call 0x07f7bd ; adjacent helper, not used by 0x03e1b4
0x03e1dd: e6 3f                and 0x3f
0x03e1df: fe 15                cp 0x15
0x03e1e1: d0                   ret nc
0x03e1e2: d6 0f                sub 0x0f
0x03e1e4: 3f                   ccf
0x03e1e5: c9                   ret
0x03e1e6: fd cb 12 d6          set 2, (iy+18) ; 0xd00092 (?shiftFlagsLoc, IY+18)
0x03e1ea: c9                   ret
0x03e1eb: f5                   push af ; adjacent helper, not used by 0x03e1b4
0x03e1ec: f3                   di
0x03e1ed: 3e 8c                ld a, 0x8c
0x03e1ef: ed 39 24             out0 (0x24), a ; write 0x8c to port 0x24
0x03e1f2: fe 8c                cp 0x8c
0x03e1f4: c2 66 00 00          jp nz, 0x000066 ; statically not taken after cp 0x8c
0x03e1f8: ed 38 06             in0 a, (0x06) ; read port 0x06
0x03e1fb: cb d7                set 2, a ; set bit 2 in the port 0x06 value
0x03e1fd: ed 39 06             out0 (0x06), a ; write port 0x06 with bit 2 set
0x03e200: 00                   nop

=== 0x03E1B4 side effects ===
- Direct RAM writes inside the wrapper: 0xd00542 only (scratch temporary). errNo is written earlier by 0x061db2.
- Interrupt-state wrapper: ld a, i snapshots IFF2 into P/V, di forces interrupts off for the call, and jp po / ei restores the pre-entry interrupt-enable state on exit.
- Helper 0x03e187 touches CPU execution state: di, rsmix (MADL=0), and im 1.
- Helper 0x03e187 touches ports: out0 (0x28), a with A=0x00, in0 a, (0x28), clear bit 2 and rewrite port 0x06, then out0 (0x24), a with A=0x88.
- Not modified in 0x03e1b4/0x03e187: errSP (0xd008e0) and the later JError IY-flag clears at 0x061dba..0x061dc6.
- Nearby but not on this call path: 0x03e1e6 sets bit 2 at IY+18 -> 0xd00092 (?shiftFlagsLoc).
```

## Interpretation

### 0x03E187 helper

- The call target at `0x03E187` starts with a 4-byte NOP sled. The first non-NOP instruction is `push af` at `0x03E18B`.
- The helper immediately zeroes `A`, disables interrupts, and jumps into a second `di` / `rsmix` / `im 1` sequence. In the transpiler model, `rsmix` clears `MADL`, so this routine forces non-mixed addressing before it touches the hardware ports.
- The middle of the helper is not RAM-oriented; it is all CPU-mode and port work:
  - `out0 (0x28), a` with `A=0x00`
  - `in0 a, (0x28)` and `bit 2, a`
  - `in0 a, (0x06)`, `res 2, a`, `out0 (0x06), a`
  - `ld a, 0x88`, `out0 (0x24), a`
- The final `cp 0x88` / `jp nz, 0x000066` is statically dead in straight-line ISA terms because `A` was just loaded with `0x88` and `OUT0` does not overwrite `A`.

### 0x03E1B4 wrapper

- `0x03E1B4` is a small interrupt-safe wrapper around the helper. It saves the incoming `A` to `0xD00542`, snapshots the old interrupt-enable state with `ld a, i`, then disables interrupts and calls `0x03E187` with the original `A` restored from scratch.
- After the call, it stores the helper's return `A` back to `0xD00542`, restores the saved flags from the earlier `ld a, i`, and uses `jp po, 0x03E1D4` / `ei` to conditionally restore interrupts only when they had been enabled before entry.
- The wrapper returns with `A` reloaded from `0xD00542`.

### State modified beyond errNo

| Kind | State | Evidence |
| --- | --- | --- |
| RAM | `0xD00542` scratch temporary | `0x03E1B4`, `0x03E1C2`, `0x03E1CA`, `0x03E1D4` |
| Stack | one saved `AF` in the wrapper, one saved `AF` in the helper | `push af` / `pop af` pairs at `0x03E1C1`/`0x03E1CE` and `0x03E18B`/`0x03E1B2` |
| Interrupt flip-flops | wrapper always forces `DI`; `EI` only occurs if the original `IFF2` was 1 | `0x03E1B8..0x03E1D4` |
| CPU mode | `MADL` cleared by `RSMIX` | `0x03E191` |
| Interrupt mode | forced to `IM 1` | `0x03E193` |
| I/O ports | `0x28`, `0x06`, `0x24` | `0x03E195..0x03E1A9` |
| Not touched here | `errSP`, direct `IY`-flag clears | those happen later in `JError` at `0x061DBA..0x061DCA` |

## Bottom line

`JError` writes `errNo` at `0x061DB2`, then `0x03E1B4` performs an interrupt-safe hardware cleanup wrapper around `0x03E187`, and only after the wrapper returns does `JError` clear the `IY` flag bytes and execute the `ld sp, (errSP)` longjmp. The wrapper itself is not the longjmp routine; it is the cleanup gate immediately before the longjmp sequence.
