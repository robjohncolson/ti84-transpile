# Phase 614: Alternate Exit Path at 0x08F696

## Summary

When the token processing loop's position validation at `0x08F5E1` fails, control diverts to `0x08F696`. This path calls `0x0907DB` to determine the current token's byte size, advances the `D02A29` cursor by that size, then jumps to `0x08F56C` which pops BC/HL and restarts the main loop at `0x08F433`. The alternate path effectively says: "this token doesn't match the edit bottom boundary, so skip over it and try again."

## Entry Condition (0x08F5E1)

The exit validation sequence at `0x08F5E1`:

```
0x08F5E1:  PUSH HL
0x08F5E2:  PUSH DE
0x08F5E3:  LD HL, (0xD0243D)         ; HL = editBtm
0x08F5E7:  LD DE, (0xD02A40)         ; DE = tokenPointer  [note: stored to mem, not loaded — see raw bytes]
0x08F5EC:  CALL 0x08F3DC             ; BIT 3, (IY+0x23) — test flag bit 3
0x08F5F0:  JP Z, 0x08F696            ; if bit 3 CLEAR → alternate exit
0x08F5F4:  CALL 0x04C973             ; compare HL vs DE: PUSH HL / OR A / SBC HL,DE / POP HL / RET
0x08F5F8:  JP NZ, 0x08F696           ; if editBtm ≠ tokenPointer → alternate exit
0x08F5FC:  CALL 0x090859             ; NORMAL PATH: token byte resolution
```

Two conditions send control to `0x08F696`:
1. **(IY+0x23) bit 3 is clear** — a system flag is not set (JP Z at 0x08F5F0)
2. **editBtm (D0243D) ≠ tokenPointer (D02A40)** — position mismatch (JP NZ at 0x08F5F8)

## Disassembly: 0x08F696 – 0x08F6A9

```
ADDR      BYTES               INSTRUCTION                 NOTES
--------  ------------------  --------------------------  --------------------------------
0x08F696  d1                  POP DE                      restore DE from validation push
0x08F697  c5                  PUSH BC                     save BC (loop counter/state)
0x08F698  cd db 07 09         CALL 0x0907DB               tokenSize = getTokenByteSize()
0x08F69C  40 2a 29 2a         .SIS LD HL, (0xD02A29)     HL = cursorPos (16-bit load)
0x08F6A0  5f                  LD E, A                     E = token byte size (returned in A)
0x08F6A1  16 00               LD D, 0x00                  DE = zero-extended token size
0x08F6A3  52 19               ADD HL, DE                  HL = cursorPos + tokenSize
0x08F6A5  40 22 29 2a         .SIS LD (0xD02A29), HL     store advanced cursor
0x08F6A9  c3 6c f5 08         JP 0x08F56C                 → trampoline to loop restart
```

**Total: 20 bytes decoded (0x08F696–0x08F6A9)**

## Trampoline at 0x08F56C

```
0x08F56C  c1                  POP BC                      restore BC (pushed at 0x08F697)
0x08F56D  e1                  POP HL                      restore HL (pushed at 0x08F5E1)
0x08F56E  c3 33 f4 08         JP 0x08F433                 → MAIN LOOP RESTART
```

The trampoline cleans up the stack (matching the PUSH HL/PUSH DE at 0x08F5E1–E2 and PUSH BC at 0x08F697) then jumps to the main loop entry at `0x08F433`.

## Loop Restart at 0x08F433

```
0x08F433  cd 18 09 09         CALL 0x090918               fetch next token
0x08F437  22 40 2a d0         LD (0xD02A40), HL           tokenPointer = result
0x08F43B  cd 59 08 09         CALL 0x090859               resolve token byte
0x08F43F  f5                  PUSH AF
0x08F440  cd dc f3 08         CALL 0x08F3DC               BIT 3, (IY+0x23) — test flag
0x08F444  28 09               JR Z, 0x08F44F              ...
```

The loop fetches the next token, stores it as the new tokenPointer at `D02A40`, and re-enters the processing pipeline.

## Subroutine: 0x0907DB (getTokenByteSize)

```
0x0907DB  cd 53 2b 0a         CALL 0x0A2B53               look up token in table
0x0907DF  cd 92 09 09         CALL 0x090992               validate/check token
0x0907E3  28 19               JR Z, 0x0907FE              if invalid → branch
0x0907E5  ...                 RES 2, (IY+0x32)            clear a flag
0x0907E9  cd 24 60 02         CALL 0x026024               get token data pointer
0x0907ED  LD DE, 0x000000
0x0907F1  LD E, (HL)                                      E = first byte of token data
0x0907F2  ADD HL, DE                                       HL += offset
0x0907F3  LD A, (HL)                                      A = byte size value
0x0907F4  cd d6 f7 08         CALL 0x08F7D6               post-process size
0x0907F8  JR NZ, 0x0907FC                                 if adjusted → skip
0x0907FA  ADD A, B                                         add base size
0x0907FB  RET                                              return size in A
```

Returns the byte size of the current token in register A. This determines how far to advance the cursor.

## RAM Address Map

| Address | Access | Role |
|---------|--------|------|
| `D02A29` | **read+write** | **cursorPos** — main cursor position in token stream; advanced by token size |
| `D0243D` | read | **editBtm** — bottom boundary of edit region; loaded for comparison |
| `D02A40` | read (via DE at entry) | **tokenPointer** — current token position; compared against editBtm |
| `(IY+0x23)` bit 3 | read (test) | **system flag** — when clear, forces alternate exit regardless of position |

Only **D02A29** is modified by this path. The cursor is advanced by the token's byte size, effectively skipping the current token.

## Comparison With Normal Exit

| Aspect | Normal Path (0x08F5FC) | Alternate Path (0x08F696) |
|--------|------------------------|---------------------------|
| **Entry condition** | bit 3 set AND editBtm = tokenPointer | bit 3 clear OR editBtm ≠ tokenPointer |
| **Action** | CALL 0x090859 — resolve token byte, continue processing | Skip token: advance D02A29 cursor by token size |
| **Next step** | Falls through to token type dispatch (0x08F600+) | JP 0x08F56C → JP 0x08F433 — restart loop |
| **Effect** | Token is processed and rendered/executed | Token is skipped entirely; loop retries with next token |

## Control Flow Diagram

```
0x08F5E1 ──┬── bit3=1 AND editBtm=tokenPtr ──→ 0x08F5FC (normal: process token)
            │
            └── bit3=0 OR editBtm≠tokenPtr ──→ 0x08F696 (alternate exit)
                                                   │
                                                   ├── POP DE, PUSH BC
                                                   ├── CALL 0x0907DB (get token byte size → A)
                                                   ├── D02A29 += A (advance cursor)
                                                   └── JP 0x08F56C
                                                          │
                                                          ├── POP BC, POP HL (stack cleanup)
                                                          └── JP 0x08F433 (loop restart)
```

## Interpretation

The alternate exit is a **token-skip mechanism**. When the OS determines that the current cursor position does not align with the edit boundary (or a required flag is unset), it cannot safely process the token at this position. Instead, it:

1. Queries the token's byte size via `0x0907DB`
2. Advances the cursor (`D02A29`) past the token
3. Restarts the main loop to try the next token

This is likely used during edit-buffer scrolling or re-parsing, where the OS needs to skip tokens that fall before the visible/active edit region. The cursor catches up to the edit bottom boundary by repeatedly advancing through tokens until `D02A29` (after being stored back to `D02A40` at `0x08F437`) equals `D0243D`.

## Adjacent Code (0x08F6AD+)

The instructions at `0x08F6AD` and beyond are **not part of this path** — they are separate subroutines:

```
0x08F6AD  CALL 0x08F6B5             ; entry to cursor-movement helper
0x08F6B1  JP 0x08F6EC               ; → secondary cursor routine
0x08F6B5  LD BC, 0x00000D           ; load constant 13 (line length?)
0x08F6B9  CALL 0x09077B             ; compute offset
...
0x08F6EB  RET
```

These are cursor-movement helpers called from other paths, operating on `D01156`, `D02A2B`, `D0115A`, and `D008D5`.
