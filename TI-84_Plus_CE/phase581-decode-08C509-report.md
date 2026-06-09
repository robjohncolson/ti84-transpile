# Phase 581: Decode 0x08C509 — Common Key Processing Path

## Block Info

| Field | Value |
|-------|-------|
| Address | 0x08C509 |
| Pre-block | 0x08C503-0x08C508 (6 bytes, LD (D0058E),A + LD A,0xFE) |
| Main block | 0x08C509-0x08C597 (142 bytes, ~40 instructions) |
| Extended block | 0x08C59B-0x08C688 (237 bytes, ~70 instructions — key remapping/catalog dispatch) |
| Total decoded | 0x08C503-0x08C688 (389 bytes, ~110 instructions) |
| CALL targets | 8 unique |
| JP targets | 9 unique |
| RAM refs | 7 unique addresses |
| IY+ operations | 24 |
| Callers/entry refs | 17 (to 0x08C509 specifically) |

## Entry Points to 0x08C509

17 references route to 0x08C509:

| Address | Type | Context |
|---------|------|---------|
| 0x02015C | JP | OS init |
| 0x030439 | JP | Early bootstrap |
| 0x08C3BF | JP | Cascade top (failed bit 5 IY+52 guard) |
| 0x08C40F | JP Z | Cascade: key == 0x3F/0x28/0x29 or D007E0 == 0x58 |
| 0x08C455 | JP Z | Cascade: key == 0xFE (format) |
| 0x08C45B | JP Z | Cascade: key == 0xFC (recall) |
| 0x08C49D | JR | Catalog sub-dispatch: LD A,0xFA then fall through |
| 0x08C4E7 | JR | Catalog sub-dispatch: LD A,0xFB then fall through |
| 0x08C4FF | JR C | Key transform: CP 0xF3, carry -> skip SUB to 0x08C509 |
| 0x08C581 | JR | Auto-overwrite loop back |
| 0x08C5A3 | JP Z | Key remap: D007E0 == 0x5B -> re-enter at 0x08C509 |
| 0x08C5A9 | JP C | Key remap: key < 0x27 -> re-enter at 0x08C509 |
| 0x08C65D | JP | Post-catalog dispatch: LD A,0x28, re-enter |
| 0x08C663 | JP NZ | Post-catalog dispatch: key != 0x7F, re-enter |
| 0x0A2DC2 | JP | External caller |
| 0x0AE44B | JP | External caller |
| 0x0BC3E3 | JP | External caller |

Additionally, 0x08C519 (the CP 0x28 entry mid-block) has 1 reference from 0x08C606 (JP after key remap via 0x08C7AD).

## Full Annotated Disassembly

### Pre-block: 0x08C503-0x08C508

Several cascade paths write a transformed key to D0058E before falling into 0x08C509.

```
0x08C503  32 8E 05 D0          LD (0xD0058E), A     ; store transformed key in previous-key buffer
0x08C507  3E FE                LD A, 0xFE            ; load 0xFE (format key code) as the key to process
                                                     ; falls through to 0x08C509
```

### Main Block: 0x08C509 — Key Remapping + Common Processing

```
; --- Key remapping stage: translate special keys to internal tokens ---

0x08C509  FE 69                CP 0x69               ; key == 0x69? (lowercase 'i' token)
0x08C50B  20 04                JR NZ, 0x08C511       ;   no -> try next
0x08C50D  3E FC                LD A, 0xFC            ;   yes -> remap to 0xFC (recall)
0x08C50F  18 F2                JR 0x08C503           ;   store in D0058E & re-enter with A=0xFE

0x08C511  FE 5B                CP 0x5B               ; key == 0x5B?
0x08C513  20 04                JR NZ, 0x08C519       ;   no -> try next
0x08C515  3E FD                LD A, 0xFD            ;   yes -> remap to 0xFD
0x08C517  18 EA                JR 0x08C503           ;   store in D0058E & re-enter with A=0xFE

; --- Parenthesis handling: set mode flags, translate to internal tokens ---

0x08C519  FE 28                CP 0x28               ; key == 0x28 (left paren)?
0x08C51B  F5                   PUSH AF               ; save flags (Z set if match)
0x08C51C  20 08                JR NZ, 0x08C526       ;   no -> try right paren
0x08C51E  FD CB 16 FE          SET 7, (IY+22)        ;   yes -> set "left paren mode" flag
0x08C522  3E DA                LD A, 0xDA            ;   remap key to 0xDA
0x08C524  18 0C                JR 0x08C532           ;   -> convergence point

0x08C526  F1                   POP AF                ; restore flags
0x08C527  FE 29                CP 0x29               ; key == 0x29 (right paren)?
0x08C529  F5                   PUSH AF               ; save flags again
0x08C52A  20 06                JR NZ, 0x08C532       ;   no -> skip to convergence (key unchanged)
0x08C52C  FD CB 1D CE          SET 1, (IY+29)        ;   yes -> set "right paren mode" flag
0x08C530  3E 7F                LD A, 0x7F            ;   remap key to 0x7F

; --- CONVERGENCE POINT: all paths reach here with key in A ---

0x08C532  CD 31 23 02          CALL 0x022331         ; KEY PROCESSOR — insert/process the key token
0x08C536  CD 2F C7 08          CALL 0x08C72F         ; DISPLAY REFRESH — redraw after key insertion

; --- Post-processing ---

0x08C53A  FD CB 09 A6          RES 4, (IY+9)         ; clear "key pending" flag
0x08C53E  F1                   POP AF                 ; recover saved flags from PUSH AF above
0x08C53F  CA 1D C4 08          JP Z, 0x08C41D         ; if original CP matched (Z=1): -> multi-char
                                                       ;   token insertion loop (DJNZ B=8, D0065A table)

; --- Auto-overwrite loop gate ---

0x08C543  FD CB 0E 7E          BIT 7, (IY+14)         ; test "auto-overwrite" mode flag
0x08C547  28 4A                JR Z, 0x08C593         ;   not set -> skip to cleanup

; --- Auto-overwrite loop body (0x08C549-0x08C581) ---

0x08C549  ED 5B D6 08 D0       LD DE, (0xD008D6)     ; DE = overwrite source pointer
0x08C54E  2A 3A 24 D0          LD HL, (0xD0243A)     ; HL = cursor position / edit buffer ptr
0x08C552  FD CB 33 56          BIT 2, (IY+51)         ; test alternate buffer flag
0x08C556  28 05                JR Z, 0x08C55D         ;   not set -> use HL as-is
0x08C558  2A D9 08 D0          LD HL, (0xD008D9)     ;   set -> use alternate source ptr
0x08C55C  EB                   EX DE, HL              ;   swap DE and HL

0x08C55D  CD 73 C9 04          CALL 0x04C973          ; compare/validate positions (carry = done?)
0x08C561  30 20                JR NC, 0x08C583        ;   no carry -> overwrite complete, exit loop

0x08C563  7E                   LD A, (HL)             ; read next char from source
0x08C564  CD 64 00 08          CALL 0x080064          ; classify/transform char (sets Z if multi-byte)
0x08C568  11 00 00 00          LD DE, 0x000000        ; DE = 0 (will hold token pair)
0x08C56C  5F                   LD E, A                ; E = transformed char
0x08C56D  20 03                JR NZ, 0x08C572        ;   single-byte token -> skip
0x08C56F  57                   LD D, A                ;   multi-byte: D = first byte
0x08C570  23                   INC HL                 ;   advance source
0x08C571  5E                   LD E, (HL)             ;   E = second byte of token

0x08C572  FD CB 33 56          BIT 2, (IY+51)         ; alternate buffer mode?
0x08C576  28 05                JR Z, 0x08C57D         ;   no -> skip pointer update
0x08C578  23                   INC HL                 ;   yes -> advance source ptr
0x08C579  22 D6 08 D0          LD (0xD008D6), HL     ;   save updated source position

0x08C57D  CD B3 C5 05          CALL 0x05C5B3          ; INSERT TOKEN (DE = token pair) into edit buffer
0x08C581  18 86                JR 0x08C509            ; LOOP: re-enter common key processing

; --- Auto-overwrite exit ---

0x08C583  FD CB 0E BE          RES 7, (IY+14)         ; clear auto-overwrite flag (done)
0x08C587  21 85 00 D0          LD HL, 0xD00085        ; HL -> system flags byte
0x08C58B  3A 02 08 D0          LD A, (0xD00802)       ; A = secondary flags
0x08C58F  CB A6                RES 4, (HL)            ; clear bit 4 of D00085
0x08C591  B6                   OR (HL)                ; merge secondary flags into system flags
0x08C592  77                   LD (HL), A             ; write merged flags back

; --- Cleanup exit ---

0x08C593  FD CB 33 96          RES 2, (IY+51)         ; clear alternate buffer flag
0x08C597  C3 3D C3 08          JP 0x08C33D            ; -> EVENT LOOP CLEANUP
```

### Extended Block: 0x08C59B — Key Range Validator / Remapper

This block is NOT part of the main 0x08C509 flow. It is reached from the cascade at 0x08C44F (`CP 0x7F; JP C, 0x08C59B`) for keys below 0x7F (printable range).

```
0x08C59B  47                   LD B, A                ; save original key in B
0x08C59C  3A E0 07 D0          LD A, (0xD007E0)       ; A = screen mode byte
0x08C5A0  FE 5B                CP 0x5B                ; mode == 0x5B?
0x08C5A2  78                   LD A, B                ; restore key
0x08C5A3  CA 09 C5 08          JP Z, 0x08C509         ;   mode 0x5B -> process key as-is

0x08C5A7  FE 27                CP 0x27                ; key < 0x27? (control codes)
0x08C5A9  DA 09 C5 08          JP C, 0x08C509         ;   yes -> process as-is (no remapping)

; --- Key range classification for non-0x5B modes ---

0x08C5AD  FE 5A                CP 0x5A                ; key < 0x5A?
0x08C5AF  38 26                JR C, 0x08C5D7         ;   yes -> jump to 0x08C5D7 (sub-range checks)

0x08C5B1  FE 75                CP 0x75                ; key < 0x75?
0x08C5B3  30 1C                JR NC, 0x08C5D1        ;   key >= 0x75 -> force mode 0x44

0x08C5B5  FD CB 09 46          BIT 0, (IY+9)          ; test flag bit 0 of IY+9
0x08C5B9  20 C6                JR NZ, 0x08C581        ;   flag set -> loop back (re-enter)

0x08C5BB  FE 69                CP 0x69                ; key < 0x69?
0x08C5BD  38 12                JR C, 0x08C5D1         ;   yes -> force mode 0x44

0x08C5BF  FE 6D                CP 0x6D                ; key == 0x6D?
0x08C5C1  28 0E                JR Z, 0x08C5D1         ;   yes -> force mode 0x44

0x08C5C3  FE 69                CP 0x69                ; key == 0x69? (redundant check)
0x08C5C5  28 BA                JR Z, 0x08C581         ;   yes -> loop back

0x08C5C7  47                   LD B, A                ; save key
0x08C5C8  3A E0 07 D0          LD A, (0xD007E0)       ; read screen mode
0x08C5CC  FE 44                CP 0x44                ; mode == 0x44?
0x08C5CE  78                   LD A, B                ; restore key
0x08C5CF  20 B0                JR NZ, 0x08C581        ;   mode != 0x44 -> loop back

; --- Force screen mode 0x44 ---

0x08C5D1  47                   LD B, A                ; save key in B
0x08C5D2  3E 44                LD A, 0x44             ; A = mode 0x44
0x08C5D4  18 10                JR 0x08C5E6            ; -> mode comparison

0x08C5D6  F5                   PUSH AF                ; (entry from another path)

; --- Sub-range check for key < 0x5A ---

0x08C5D7  47                   LD B, A                ; save key in B
0x08C5D8  FE 59                CP 0x59                ; key == 0x59?
0x08C5DA  20 0A                JR NZ, 0x08C5E6        ;   no -> skip

0x08C5DC  3A 8E 05 D0          LD A, (0xD0058E)       ; A = previous key from D0058E
0x08C5E0  80                   ADD B                  ; A = previous_key + current_key
0x08C5E1  FE 5C                CP 0x5C                ; result == 0x5C?
0x08C5E3  30 4B                JR NC, 0x08C630        ;   >= 0x5C -> exit via XOR A at 0x08C630

0x08C5E5  47                   LD B, A                ; B = combined value

; --- Screen mode comparison ---

0x08C5E6  4F                   LD C, A                ; C = mode byte or key
0x08C5E7  3A E0 07 D0          LD A, (0xD007E0)       ; A = current screen mode
0x08C5EB  FE 50                CP 0x50                ; mode == 0x50?
0x08C5ED  20 09                JR NZ, 0x08C5F8        ;   no -> try 0x52

0x08C5EF  78                   LD A, B                ; A = key
0x08C5F0  FE 40                CP 0x40                ; key == 0x40?
0x08C5F2  28 3C                JR Z, 0x08C630         ;   yes -> exit (XOR A)
0x08C5F4  3E 50                LD A, 0x50             ; A = 0x50
0x08C5F6  18 09                JR 0x08C601            ; -> CALL 0x08C7AD

0x08C5F8  FE 52                CP 0x52                ; mode == 0x52?
0x08C5FA  79                   LD A, C                ; A = saved mode/key
0x08C5FB  20 04                JR NZ, 0x08C601        ;   no -> CALL 0x08C7AD
0x08C5FD  FE 40                CP 0x40                ; key == 0x40?
0x08C5FF  20 92                JR NZ, 0x08C593        ;   no -> cleanup exit

0x08C601  CD AD C7 08          CALL 0x08C7AD          ; MODE SWITCH HANDLER
0x08C605  78                   LD A, B                ; restore key
0x08C606  C3 19 C5 08          JP 0x08C519            ; re-enter at parenthesis check (0x08C519)
```

### Catalog Dispatch Block: 0x08C60A

This is a separate entry point (reached from cascade paths, not from 0x08C509 directly).

```
0x08C60A  FD 21 80 00 D0       LD IY, 0xD00080        ; reload IY base
0x08C60F  FD CB 09 DE          SET 3, (IY+9)           ; set "catalog active" flag
0x08C613  FB                   EI                      ; enable interrupts
0x08C614  FD CB 28 A6          RES 4, (IY+40)          ; clear flag
0x08C618  FD CB 5B 96          RES 2, (IY+91)          ; clear flag
0x08C61C  FD CB 42 86          RES 0, (IY+66)          ; clear flag
0x08C620  FD CB 5C 86          RES 0, (IY+92)          ; clear flag
0x08C624  FD CB 5A 6E          BIT 5, (IY+90)          ; test flag
0x08C628  3E 09                LD A, 0x09              ; A = 9 (catalog mode?)
0x08C62A  FD CB 5A AE          RES 5, (IY+90)          ; clear flag
0x08C62E  20 01                JR NZ, 0x08C631         ;   flag was set -> skip XOR A

0x08C630  AF                   XOR A                   ; A = 0

0x08C631  FD 21 80 00 D0       LD IY, 0xD00080        ; reload IY base
0x08C636  47                   LD B, A                 ; B = mode value (0 or 9)
0x08C637  ED 7B FA 07 D0       LD SP, (0xD007FA)       ; RESET STACK from saved SP
0x08C63C  FD CB 0C B6          RES 6, (IY+12)          ; clear flag
0x08C640  ED 57                LD A, I                 ; A = interrupt vector
0x08C642  F5                   PUSH AF                 ; save interrupt state
0x08C643  F3                   DI                      ; disable interrupts
0x08C644  CD A0 03 00          CALL 0x0003A0           ; SYSTEM REINIT
0x08C648  F1                   POP AF                  ; restore interrupt state
0x08C649  E2 4E C6 08          JP PO, 0x08C64E         ;   IFF2 was clear -> skip EI
0x08C64D  FB                   EI                      ; re-enable interrupts

0x08C64E  CD AB C7 08          CALL 0x08C7AB           ; post-reinit handler
0x08C652  FD CB 02 96          RES 2, (IY+2)           ; clear flag
0x08C656  78                   LD A, B                 ; A = mode value
0x08C657  FE DA                CP 0xDA                 ; was it 0xDA (left paren token)?
0x08C659  20 06                JR NZ, 0x08C661         ;   no -> check 0x7F
0x08C65B  3E 28                LD A, 0x28              ;   yes -> restore original key 0x28
0x08C65D  C3 09 C5 08          JP 0x08C509             ;   re-enter common processing

0x08C661  FE 7F                CP 0x7F                 ; was it 0x7F (right paren token)?
0x08C663  C2 09 C5 08          JP NZ, 0x08C509         ;   no -> re-enter with current key
0x08C667  3E 29                LD A, 0x29              ;   yes -> restore original key 0x29
0x08C669  C3 5D C6 08          JP 0x08C65D             ;   -> store 0x29 and re-enter

; --- Separate function at 0x08C66D ---

0x08C66D  ED 7B FA 07 D0       LD SP, (0xD007FA)      ; reset stack
0x08C672  3E 52                LD A, 0x52              ; A = 0x52 mode
0x08C674  CD 9F C7 08          CALL 0x08C79F           ; mode handler
0x08C678  C3 3D C3 08          JP 0x08C33D             ; -> event loop cleanup

; --- Another function at 0x08C67C ---

0x08C67C  CD 89 C6 08          CALL 0x08C689           ; call sub
0x08C680  CD 9E C6 08          CALL 0x08C69E           ; call sub
0x08C684  FD CB 11 86          RES 0, (IY+17)          ; clear flag
0x08C688  C9                   RET
```

## RAM References

| Address | Name/Role | Refs | Access |
|---------|-----------|------|--------|
| D0058E | Previous key buffer | 3 | R at 0x08C5DC, W at 0x08C503 (via LD (D0058E),A) |
| D007E0 | Screen mode byte | 4 | R at 0x08C59C, 0x08C5C8, 0x08C5E7 |
| D007FA | Saved stack pointer | 2 | R at 0x08C637, 0x08C66D (LD SP,(D007FA)) |
| D00802 | Secondary system flags | 1 | R at 0x08C58B |
| D008D6 | Overwrite source pointer | 2 | R at 0x08C549, W at 0x08C579 |
| D008D9 | Alternate source pointer | 1 | R at 0x08C558 |
| D0243A | Cursor/edit buffer pointer | 1 | R at 0x08C54E |
| D00085 | System flags byte | 2 | R/W at 0x08C587-0x08C592 |

## IY+Offset Flag Map

| Offset | Bit | Operation | Address | Interpretation |
|--------|-----|-----------|---------|----------------|
| IY+9 | 0 | BIT (test) | 0x08C5B5 | Input mode flag |
| IY+9 | 3 | SET | 0x08C60F | Catalog active flag |
| IY+9 | 4 | RES (clear) | 0x08C53A | Key pending flag |
| IY+14 | 7 | BIT (test) | 0x08C543 | Auto-overwrite mode |
| IY+14 | 7 | RES (clear) | 0x08C583 | Clear auto-overwrite |
| IY+22 | 7 | SET | 0x08C51E | Left paren mode |
| IY+29 | 1 | SET | 0x08C52C | Right paren mode |
| IY+40 | 4 | RES | 0x08C614 | (catalog init) |
| IY+51 | 2 | BIT (test) | 0x08C552, 0x08C572 | Alternate buffer mode |
| IY+51 | 2 | RES (clear) | 0x08C593 | Clear alt buffer |
| IY+66 | 0 | RES | 0x08C61C | (catalog init) |
| IY+90 | 5 | BIT/RES | 0x08C624, 0x08C62A | (catalog flag) |
| IY+91 | 2 | RES | 0x08C618 | (catalog init) |
| IY+92 | 0 | RES | 0x08C620 | (catalog init) |

## CALL Targets

| Address | Called From | Purpose |
|---------|------------|---------|
| 0x022331 | 0x08C532 | Key processor — inserts/processes the key token |
| 0x08C72F | 0x08C536 | Display refresh after key insertion |
| 0x04C973 | 0x08C55D | Position compare (carry = more chars to overwrite) |
| 0x080064 | 0x08C564 | Char classifier (Z = multi-byte token) |
| 0x05C5B3 | 0x08C57D | Token inserter (DE = token pair) |
| 0x08C7AD | 0x08C601 | Screen mode switch handler |
| 0x0003A0 | 0x08C644 | System reinit |
| 0x08C7AB | 0x08C64E | Post-reinit handler |
| 0x08C79F | 0x08C674 | Mode 0x52 handler |
| 0x08C689 | 0x08C67C | Sub-function |
| 0x08C69E | 0x08C680 | Sub-function |

## Relationship to Multi-Char Token Loop (0x08C41D)

The multi-char token insertion loop at 0x08C41D is **after** the convergence point at 0x08C532. The flow is:

1. Key arrives at 0x08C509
2. Key is remapped (0x69->0xFC, 0x5B->0xFD, 0x28->0xDA, 0x29->0x7F) or left unchanged
3. PUSH AF saves the comparison flags
4. Convergence: CALL 0x022331 (process key) + CALL 0x08C72F (refresh display)
5. POP AF recovers original comparison result
6. If the original CP at 0x08C519/0x08C527 matched (Z=1, meaning key was 0x28 or 0x29): **JP Z, 0x08C41D** goes to the multi-char token loop
7. If not: post-processing continues at 0x08C543 (auto-overwrite check)

So the multi-char token loop is a **conditional exit** from the common key processing path, triggered specifically by parenthesis keys.

## Architectural Summary

### What "common key processing" does

The block at 0x08C509 is the **key normalization and insertion pipeline** for the TI-84 event loop. It serves as the single convergence point where most key codes are prepared and dispatched to the actual key processor (0x022331).

**Phase 1: Key Remapping (0x08C509-0x08C530)**
- Translates high-level key codes to internal token values
- 0x69 -> 0xFC, 0x5B -> 0xFD (special function keys)
- 0x28 (left paren) -> 0xDA with SET 7,(IY+22) flag
- 0x29 (right paren) -> 0x7F with SET 1,(IY+29) flag
- Keys that don't match any remapping pass through unchanged

**Phase 2: Key Processing (0x08C532-0x08C536)**
- CALL 0x022331 — the actual key processor, which interprets the token in A and modifies the edit buffer
- CALL 0x08C72F — redraws the display to reflect the change

**Phase 3: Post-Processing (0x08C53A-0x08C597)**
- RES 4,(IY+9) — clears the "key pending" flag
- Recovers original comparison flags (POP AF)
- If the key was a parenthesis (Z flag set from CP 0x28/0x29): dispatches to the multi-char token loop at 0x08C41D (which inserts up to 8 tokens from the D0065A string table)
- If auto-overwrite mode is active (BIT 7,(IY+14)): enters a loop that reads characters from D008D6/D0243A source buffers, classifies them (single vs multi-byte tokens via 0x080064), inserts them (via 0x05C5B3), and loops back to 0x08C509
- On loop completion: clears auto-overwrite flag, merges system flags, exits

**Phase 4: Cleanup (0x08C593-0x08C597)**
- RES 2,(IY+51) — clears alternate buffer flag
- JP 0x08C33D — returns to event loop cleanup

### Key Flow Diagram

```
       0x08C3C3 (cascade top)
           |
    CP 0xB4/0x3F/0x28/0x29/0x7F/0xFE/0xFC/0xFA/0xFB
           |
      [various transforms]
           |
           v
  0x08C509 -----> CP 0x69? yes: A=0xFC, store D0058E, re-enter
       |              CP 0x5B? yes: A=0xFD, store D0058E, re-enter
       |              CP 0x28? yes: SET 7,(IY+22), A=0xDA
       |              CP 0x29? yes: SET 1,(IY+29), A=0x7F
       v
  0x08C532: CALL 0x022331 (key processor)
            CALL 0x08C72F (display refresh)
            RES 4,(IY+9)
       |
       +--[Z flag: was paren]--> 0x08C41D (multi-char token loop) --> 0x08C331
       |
       +--[BIT 7,(IY+14) set]--> auto-overwrite loop
       |       reads D008D6/D0243A, classifies, inserts
       |       loops back to 0x08C509
       |       on exit: clears flags
       |
       v
  0x08C593: RES 2,(IY+51)
  0x08C597: JP 0x08C33D (event loop cleanup)
```

### The extended key remapper (0x08C59B)

Reached from the cascade for printable keys (< 0x7F). Validates the key against the current screen mode (D007E0) and applies mode-dependent remapping:
- Mode 0x5B: accept key as-is -> 0x08C509
- Control codes (< 0x27): accept as-is -> 0x08C509
- Keys 0x5A-0x74: complex range validation against IY+9 flags and screen mode
- Key 0x59: combines with previous key (D0058E) for two-key sequences
- Mode 0x50/0x52: special handling for key 0x40
- Falls through to CALL 0x08C7AD (mode switch) then re-enters at 0x08C519
