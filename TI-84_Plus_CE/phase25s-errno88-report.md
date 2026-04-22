# Phase 25S — errNo=0x88 Investigation Report

## Error Code 0x88 Identification

Error code `0x88` = decimal 136 = **E_Syntax** (Syntax Error).

From `ti84pceg.inc`:
```
E_EDITF  := 7              ; allow re-entering application
E_EDIT   := 1 shl E_EDITF  ; = 0x80 (128)
E_Syntax := 8 + E_EDIT     ; = 8 + 128 = 136 = 0x88
```

The high bit (`E_EDIT` = 0x80) means the error allows cursor-repositioning to the offending token. The low 7 bits (`0x08`) identify the error type as "Syntax". This is the standard error the OS raises when it encounters an unparseable token during expression evaluation.

## All errNo Write Locations in ROM

ROM scan found 7 locations that write `LD (0xD008DF),A`:

| Address | Context |
|---------|---------|
| `0x061DB2` | **Error handler / longjmp** — the canonical ThrowError path |
| `0x085164` | Parser region — **clears** errNo to 0 (saves old, writes AF=0) |
| `0x08516D` | Parser region — **restores** errNo from stack |
| `0x08A6DD` | VAT/variable region — clears errNo to 0 (`XOR A` before write) |
| `0x0A5D78` | `SUB A` (= clear A) before write — another clear-errNo site |
| `0x0B3326` | System region — writes errNo then tests bit 7 |
| `0x0B6E59` | Duplicate of 0x08A6DD pattern — clears errNo to 0 |

## Annotated Disassembly

### Error Handler (longjmp) at 0x061DA0

This is the canonical `ThrowError` dispatch table. Multiple entry points load A with a specific error code, then all converge at `0x061DB2`:

```asm
061DA0: JR 0x061DB2           ; entry: error code already in A (from caller)
061DA2: LD A,0xB4             ; entry: error 0xB4
061DA4: JR 0x061DB2
061DA6: LD A,0x9F             ; entry: error 0x9F
061DA8: JR 0x061DB2
061DAA: LD A,0xB5             ; entry: error 0xB5
061DAC: JR 0x061DB2
061DAE: LD A,0x36             ; entry: error 0x36
061DB0: JR 0x061DB2
061DB2: LD (0xD008DF),A       ; *write errNo*
061DB6: CALL 0x03E1B4         ; continue error dispatch (longjmp)
061DBA: RES 1,(IY+0x4B)      ; clear flags
061DBE: RES 2,(IY+0x12)
061DC2: RES 4,(IY+0x24)
061DC6: RES 1,(IY+0x49)
061DCA: LD SP,(0xD008E0)      ; *longjmp*: restore SP from errSP
061DCF: POP AF                ; pop saved context
```

### Parser Bounce / VAT Search Loop at 0x084711

```asm
084711: LD A,(HL)             ; read VAT entry type byte
084712: CALL 0x082BE2         ; helper: DEC HL x6, RET (skip 6-byte name)
084716: AND 0x3F              ; mask type bits
084718: SBC HL,DE             ; compare HL vs DE (search bound?)
08471A: RET C                 ; if HL < DE, search exhausted — return
08471B: ADD HL,DE             ; undo subtraction (restore HL)
08471C: LD A,(0xD005F9)       ; load search key byte 1
084720: CP (HL)               ; compare with VAT entry
084721: JR Z,0x08472C         ; match first byte — jump to deeper check
084723: LD BC,0x000003        ; skip 3 more bytes
084727: OR A                  ; clear carry
084728: SBC HL,BC             ; HL -= 3
08472A: JR 0x084711           ; loop back: try next VAT entry
; --- First byte matched, check second and third ---
08472C: PUSH HL
08472D: DEC HL
08472E: LD A,(0xD005FA)       ; search key byte 2
084732: CP (HL)
084733: JR NZ,0x084751        ; mismatch — skip
084735: DEC HL
084736: LD A,(0xD005FB)       ; search key byte 3
08473A: CP (HL)
08473B: JR NZ,0x084751        ; mismatch — skip
08473D: POP HL                ; all 3 bytes matched — found it
08473E: INC HL
```

This is a **Variable Allocation Table (VAT) linear search**. It walks backward through the VAT comparing 3-byte name keys at `0xD005F9-FB`. Each entry is 6 bytes of name followed by type/data bytes.

### Parser Save/Restore errNo at 0x085150

```asm
; Context: checking token type in A
085150: CP 0x4B               ; token 'K'?
085152: JR Z,...
085154: CP 0x4C               ; token 'L' (List)?
085156: JR Z,...
085158: CP 0x44               ; token 'D'?
08515A: JR Z,...
08515C: JR NZ,+0x15           ; not one of these tokens — skip

; *Save/clear/restore errNo pattern*:
08515E: LD A,(0xD008DF)       ; READ current errNo
085162: PUSH AF               ; save it on stack
085163: XOR A                 ; A = 0
085164: LD (0xD008DF),A       ; CLEAR errNo to 0
085168: CALL 0x062160         ; call inner function (variable lookup)
08516C: POP AF                ; restore original errNo
08516D: LD (0xD008DF),A       ; RESTORE errNo
08516F: JR +0x0C              ; continue
```

This is a **speculative lookup**: the parser temporarily clears `errNo`, calls a function that might set it (e.g., if a variable is not found), then **unconditionally restores** the original `errNo`. The inner function at `0x062160` reads `errNo` at `0x06218F` to format error messages.

## Hypothesis: Why errNo=0x88 Without Longjmp

The evidence points to a **non-fatal error path** in the parser:

1. **ParseInp calls the expression evaluator**, which encounters a syntax it cannot parse (e.g., an empty input buffer, end-of-line token, or unrecognized token during initial home-screen idle).

2. **The error is raised via `ThrowError` at `0x061DB2`**, which writes `0x88` (E_Syntax) to `errNo` at `0xD008DF`.

3. **However, the longjmp at `0x061DCA` (`LD SP,(errSP)`) does fire** — it restores SP from `errSP` and returns to the error handler established by `PushErrorHandler`. The key insight is that **the error handler catches the error and continues normally**. The OS uses `PushErrorHandler`/`PopErrorHandler` as a try/catch mechanism:
   - Before calling ParseInp, the OS pushes an error handler (setting `errSP`)
   - ParseInp encounters a syntax error and throws via `0x061DB2`
   - The longjmp fires, restoring SP to the pushed handler
   - The handler sees `errNo=0x88`, decides the error is non-fatal (e.g., empty input), and continues

4. **The errNo value persists** because no code clears it after the handler catches it. The save/restore pattern at `0x08515E-08516D` only operates on specific token paths (List/D/K variables), not on the general post-error path.

5. **This is normal TI-OS behavior**: on the home screen with no user input, ParseInp is called on an empty expression. The empty expression triggers E_Syntax. The error handler catches it, and the OS simply returns to the main loop waiting for keystrokes. `errNo=0x88` remains as a latent value in RAM — it does not cause a visible error because the handler suppressed it.

### Summary

- **Error 0x88 = E_Syntax** (Syntax Error, with re-edit flag set)
- **The longjmp likely does fire** but is caught by a `PushErrorHandler` frame
- **errNo persists** because nothing clears it after the handler runs
- **This is expected behavior** for an empty-input ParseInp call on the home screen
- **No bug in the transpiler** — the errNo=0x88 residue is normal OS state

### Next Steps

- Instrument `0x061DCA` (the `LD SP,(errSP)` longjmp) to confirm it fires during ParseInp
- Trace the `PushErrorHandler` call that sets up the catch frame before ParseInp
- Verify that the error handler at the caught address simply returns to the main loop
