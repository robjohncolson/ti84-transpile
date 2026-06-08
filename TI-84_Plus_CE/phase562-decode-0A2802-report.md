# Phase 562: Decode 0x0A2802 - SCROLL SETUP / FRAMEBUFFER FILL

## Function Summary

| Field | Value |
|-------|-------|
| Address | 0x0A2802 |
| Length | ~250 bytes (main body to 0x0A28FC, with continuation at 0x0A28FC and tail to 0x0A298C) |
| Called from | 0x0A1FD1 (scroll trigger sub-function) |
| Purpose | **Scroll framebuffer setup**: saves cursor state, selects scroll source/destination regions, then fills VRAM with solid color or copies data |
| Name | SCROLL_SETUP_AND_FILL |

## Corrected Disassembly (Manual, .SIS-aware)

**Note**: The automated disassembler mishandles .SIS prefix (reads 24-bit instead of 16-bit addresses). Below is the corrected decode. In .SIS mode, MBASE (=0xD0 during OS execution) provides the upper byte, so (0x0595) = (0xD00595).

```asm
; === PROLOGUE: Save cursor state to scratch area ===
0A2802  40 2A 95 05       .SIS LD HL, (D00595)       ; Load current cursor col/row from D00595
0A2806  40 22 C4 07       .SIS LD (D007C4), HL       ; Save to scratch D007C4
0A280A  3A 04 25 D0       LD A, (D02504)             ; Load max column from D02504
0A280E  32 C7 07 D0       LD (D007C7), A             ; Save to scratch D007C7
0A2812  3A 92 00 D0       LD A, (D00092)             ; Load OS flag byte (IY+0x12)
0A2816  32 C8 07 D0       LD (D007C8), A             ; Save to scratch D007C8
0A281A  3A 85 00 D0       LD A, (D00085)             ; Load OS flag byte (IY+0x05)
0A281E  E6 10             AND 0x10                    ; Isolate bit 4
0A2820  32 C9 07 D0       LD (D007C9), A             ; Save to scratch D007C9
0A2824  40 2A 9A 05       .SIS LD HL, (D0059A)       ; Load another cursor/text param
0A2828  40 22 D2 2A       .SIS LD (D02AD2), HL       ; Save to scratch D02AD2

; === CLEAR FLAGS ===
0A282C  FD CB 4C A6       RES 4, (IY+0x4C)          ; Clear "scroll direction" flag
0A2830  FD CB 02 96       RES 2, (IY+0x02)          ; Clear "scroll pending" flag

; === SAVE INTERRUPT STATE & DISABLE ===
0A2834  ED 57             LD A, I                    ; Get interrupt state (P/V flag = IFF2)
0A2836  EA 3D 28 0A       JP PE, 0x0A283D           ; If interrupts were enabled, skip re-read
0A283A  ED 57             LD A, I                    ; Re-read (race condition guard)
0A283C  F5                PUSH AF                    ; Save interrupt state on stack
0A283D  F3                DI                         ; Disable interrupts for critical section

; === REGISTER SAVE (alt registers for buffer pointers) ===
0A283F  D9                EXX                        ; Switch to alt register set
0A2840  E5                PUSH HL                    ; Save HL'
0A2841  C5                PUSH BC                    ; Save BC'
0A2842  D9                EXX                        ; Back to main
0A2843  E5                PUSH HL                    ; Save HL
0A2844  C5                PUSH BC                    ; Save BC
0A2845  D9                EXX                        ; Alt set
0A2846  C1                POP BC                     ; BC' = main BC (source count)
0A2847  E1                POP HL                     ; HL' = main HL (source addr?)
0A2848  D9                EXX                        ; Back to main
0A2849  EB                EX DE, HL                  ; DE = HL (dest buffer addr)
0A284A  C3 B2 28 0A       JP 0x0A28B2               ; Jump to fill loop

; === ALTERNATE ENTRY: SET scroll-up flag ===
0A284E  FD CB 4C E6       SET 4, (IY+0x4C)          ; Set "scroll direction" = up
0A2852  18 0C             JR 0x0A2860               ; Continue to main setup

; === ALTERNATE ENTRY: CLEAR scroll flag, restore col ===
0A2854  FD CB 4C A6       RES 4, (IY+0x4C)          ; Clear scroll direction
0A2858  3A C7 07 D0       LD A, (D007C7)            ; Restore saved max column
0A285C  32 04 25 D0       LD (D02504), A            ; Write back to D02504

; === COMMON SETUP (from 0A2860) ===
0A2860  FD CB 02 96       RES 2, (IY+0x02)          ; Clear "scroll pending"
0A2864  ED 57             LD A, I
0A2866  EA 6C 28 0A       JP PE, 0x0A286C
0A286A  ED 57             LD A, I
0A286C  F5                PUSH AF
0A286D  F3                DI                         ; Disable interrupts

; === SELECT SCROLL BUFFER REGION ===
0A286E  FD CB 4C 6E       BIT 5, (IY+0x4C)          ; Test bit 5 = "large scroll" flag
0A2872  C2 47 29 0A       JP NZ, 0x0A2947           ; If set, jump to large-scroll handler
0A2876  D9                EXX
0A2877  E5                PUSH HL                    ; Save HL' (alt)
0A2878  C5                PUSH BC                    ; Save BC' (alt)

0A2879  FD CB 4C 66       BIT 4, (IY+0x4C)          ; Test bit 4 = "scroll direction"
0A287D  28 10             JR Z, 0x0A288F            ; If clear (scroll down), use primary region

; --- Scroll UP path ---
0A287F  21 2D 4F D0       LD HL, 0xD04F2D           ; Source: scroll workspace @ D04F2D
0A2883  01 D0 02 00       LD BC, 0x0002D0           ; Count: 720 bytes (1 row 320px 16bpp + overhead)
0A2887  D9                EXX
0A2888  21 80 1E D6       LD HL, 0xD61E80           ; VRAM destination for scroll-up
0A288C  D9                EXX
0A288D  18 22             JR 0x0A28B1               ; Skip to fill loop

; --- Scroll DOWN path (primary) ---
0A288F  21 F5 31 D0       LD HL, 0xD031F5           ; Source: scroll buffer @ D031F5 (from session 561)
0A2893  01 D0 20 00       LD BC, 0x0020D0           ; Count: 8400 bytes (0x20D0)
0A2897  D9                EXX
0A2898  21 00 4B D4       LD HL, 0xD44B00           ; VRAM destination for scroll-down
0A289C  D9                EXX

0A289D  CD A0 00 08       CALL 0x0800A0             ; OS syscall - mode/state check
0A28A1  28 0E             JR Z, 0x0A28B1            ; If zero (normal mode), use primary region

; --- Extended scroll region (split-screen?) ---
0A28A3  21 7D 45 D0       LD HL, 0xD0457D           ; Alt source in scroll workspace
0A28A7  01 48 0D 00       LD BC, 0x000D48           ; Count: 3400 bytes
0A28AB  D9                EXX
0A28AC  21 80 83 D5       LD HL, 0xD58380           ; Alt VRAM destination
0A28B0  D9                EXX

; === FILL LOOP (unrolled 16-byte fill per iteration) ===
0A28B1  D9                EXX                        ; HL' = VRAM dest
0A28B2  11 FF 00 00       LD DE, 0x0000FF           ; DE = 0xFF pattern (fill value)
0A28B6  D9                EXX                        ; Back to main: HL=source, BC=count
0A28B7  23                INC HL                     ; Advance source pointer
0A28B8  7E                LD A, (HL)                 ; Read source byte
0A28B9  D9                EXX                        ; HL' = VRAM dest
0A28BA  B7                OR A                       ; Test if source byte is 0
0A28BB  C2 FC 28 0A       JP NZ, 0x0A28FC           ; If non-zero, jump to color fill routine

; --- Zero source -> fill with 0xFF (white) ---
0A28BF  3D                DEC A                      ; A = 0xFF (was 0, DEC wraps to FF)
0A28C0-0A28DF             [LD (HL),A / INC HL x 16] ; Fill 16 VRAM bytes with 0xFF
0A28E0  D9                EXX                        ; Back to main
0A28E1  0B                DEC BC                     ; Decrement source counter
0A28E2  78                LD A, B
0A28E3  B1                OR C                       ; Test BC == 0
0A28E4  20 D1             JR NZ, 0x0A28B7           ; Loop if not done

; === EPILOGUE: Restore registers and interrupt state ===
0A28E6  C1                POP BC                     ; Restore BC'
0A28E7  E1                POP HL                     ; Restore HL'
0A28E8  D9                EXX
0A28E9  F1                POP AF                     ; Restore interrupt state
0A28EA  E2 EF 28 0A       JP PO, 0x0A28EF           ; If interrupts were disabled, skip EI
0A28EE  FB                EI                         ; Re-enable interrupts

; === FINAL: Check direction flag and dispatch ===
0A28EF  FD CB 4C 66       BIT 4, (IY+0x4C)          ; Was this a scroll-up?
0A28F3  FD CB 4C A6       RES 4, (IY+0x4C)          ; Clear the direction flag
0A28F7  C0                RET NZ                     ; If scroll-up: return (caller handles rest)
0A28F8  C3 8C 29 0A       JP 0x0A298C               ; Scroll-down: tail-call to scroll completion
```

## CALL Targets

| Target | Type | Context |
|--------|------|---------|
| 0x0800A0 | CALL | OS syscall - state/mode check (returns Z/NZ to select buffer region) |
| 0x0A2947 | JP NZ | Large-scroll handler (when IY+0x4C bit 5 set) |
| 0x0A298C | JP | Scroll-down completion routine (tail call) |
| 0x0A28FC | JP NZ | Non-zero source byte handler (color copy, not white fill) |

## RAM Addresses

| Address | Direction | Meaning |
|---------|-----------|---------|
| D00085 | Read | OS flags (IY+0x05), bit 4 extracted |
| D00092 | Read | OS flags (IY+0x12) |
| D00595 | Read (.SIS) | Current cursor column |
| D0059A | Read (.SIS) | Cursor/text parameter |
| D007C4 | Write (.SIS) | Scratch: saved cursor position (HL from D00595) |
| D007C7 | Read/Write | Scratch: saved max column (from D02504) |
| D007C8 | Write | Scratch: saved IY+0x12 value |
| D007C9 | Write | Scratch: saved IY+0x05 bit 4 |
| D02504 | Read/Write | Max column count |
| D02AD2 | Write (.SIS) | Scratch: saved cursor param |
| D031F5 | Source buf | Scroll buffer start (8400B, scroll-down path) |
| D04F2D | Source buf | Scroll workspace (720B, scroll-up path) |
| D0457D | Source buf | Alt scroll region (3400B, extended/split) |
| D44B00 | VRAM dest | Scroll-down blit target |
| D58380 | VRAM dest | Extended scroll blit target |
| D61E80 | VRAM dest | Scroll-up blit target |

## IY+offset Flags Used

| Offset | Bit | Operation | Meaning |
|--------|-----|-----------|---------|
| IY+0x02 | 2 | RES | Clear "scroll pending" |
| IY+0x4C | 4 | RES/SET/BIT | Scroll direction (0=down, 1=up) |
| IY+0x4C | 5 | BIT | Large scroll flag - jumps to 0x0A2947 |

## Architecture Insights

1. **Three entry points**: The function has multiple entry points:
   - 0x0A2802: Primary entry from scroll trigger (saves state, jumps to fill loop)
   - 0x0A284E: Scroll-up entry (sets bit 4)
   - 0x0A2854: State-restore entry (restores column, clears direction)

2. **Interrupt-safe critical section**: Uses the LD A,I / JP PE pattern to save/restore IFF2 around DI...EI, ensuring the scroll fill is atomic with respect to timer interrupts.

3. **Scroll direction routing**:
   - Scroll DOWN (bit 4 clear): Fills VRAM at D44B00 from buffer D031F5 (8400 bytes = 320px wide x 13.125 rows x 2 bytes/pixel in 16bpp)
   - Scroll UP (bit 4 set): Fills VRAM at D61E80 from buffer D04F2D (720 bytes)
   - Extended region: VRAM at D58380 from D0457D (3400 bytes) - used when CALL 0x0800A0 returns NZ

4. **RLE-compressed VRAM fill**: The inner loop at 0x28B7-0x28E4 reads one source byte. If zero, fills 16 VRAM bytes with 0xFF (white). Non-zero source bytes trigger a different path at 0x0A28FC (likely a color/pattern copy). This is an RLE-like scheme: one source byte controls 16 destination bytes.

5. **Connection to scroll trigger (0x0A1FD1)**: The caller at 0x0A1FD1 calls this to prepare the framebuffer before executing the actual 8400B LDIR scroll. This function either pre-fills the newly-exposed row(s) with white or copies cached content, depending on scroll direction.

6. **Relationship to session 561 findings**: D031F5 is the same scroll buffer base identified in the Y-ADVANCE COMPLEX function (0x0A1F48). The 8400B count (0x20D0) matches the LDIR transfer size from that function. D44B00 in VRAM corresponds to visible area below the status bar (offset from VRAM base D40000 = 0x4B00 = 19200 bytes = 30 rows x 640B in 16bpp).

7. **VRAM layout deduction**:
   - D44B00 = D40000 + 0x4B00 = row 30 (status bar ends, text area begins)
   - D61E80 = D40000 + 0x21E80 = row 215 (near bottom of 240-row display)
   - D58380 = D40000 + 0x18380 = row 152 (middle of display - split screen boundary)

## Function Classification

**SCROLL_SETUP_AND_FILL** (250B+): Multi-entry scroll preparation routine that saves cursor state to scratch RAM, disables interrupts, selects source buffer and VRAM destination based on scroll direction flags, then performs an RLE-compressed fill of the target VRAM region. Critical pre-step before the actual scroll LDIR in the caller.
