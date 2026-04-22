# Phase 25S — Subroutine Disassembly Report

## 0x082BBE — Pointer/Slot Helper Region

This address region contains multiple small utility functions rather than one large subroutine. Analysis follows:

### 0x082BBE — Entry point (slot lookup + HL adjust)

```asm
082BBE: CD BA 22 08     CALL 0x0822BA       ; call helper (likely slot/pointer lookup)
082BC2: 18 F5           JR -11 → 0x082BB9   ; jump back (loop/retry into prior code)
```

This is a very short entry — just a call then a backward jump. The real body is at 0x0822BA.

### 0x082BC4 — Another entry (pointer setup for CreateVar?)

```asm
082BC4: 2A 8D 25 D0     LD HL,(0xD0258D)    ; load HL from RAM (near pTemp region)
082BC8: 11 F7 FF FF     LD DE,0xFFFFF7      ; DE = -9 (signed)
082BCC: 19              ADD HL,DE           ; HL -= 9
082BCD: C9              RET
```

Loads a pointer from **0xD0258D** and subtracts 9. This is likely computing a pointer to a VAT entry field (VAT entries are 9 bytes before the name).

### 0x082BCE — Another entry

```asm
082BCE: CD C4 2B 08     CALL 0x082BC4       ; calls the HL=*(0xD0258D)-9 routine above
082BD2: 11 F8 05 D0     LD DE,0xD005F8      ; DE = RAM address (some state variable)
082BD6: C3 F2 29 08     JP 0x0829F2         ; tail-jump to 0x0829F2 (pointer compare/store?)
```

### 0x082BDA — HL += 6 utility

```asm
082BDA: 23              INC HL
082BDB: 23              INC HL
082BDC: 23              INC HL
082BDD: 23              INC HL
082BDE: 23              INC HL
082BDF: 23              INC HL
082BE0: C9              RET
```

Adds 6 to HL. Used to skip past a 6-byte field (possibly a VAT entry type + name length + pointer).

### 0x082BE1 — HL -= 7 utility

```asm
082BE1: 2B              DEC HL
082BE2: 2B              DEC HL
082BE3: 2B              DEC HL
082BE4: 2B              DEC HL
082BE5: 2B              DEC HL
082BE6: 2B              DEC HL
082BE7: 2B              DEC HL
082BE8: C9              RET
```

Subtracts 7 from HL.

### 0x082BE9 — Store DE to 0xD025A3

```asm
082BE9: ED 53 A3 25 D0  LD (0xD025A3),DE
082BEE: C9              RET
```

Stores DE into **0xD025A3** — this is a known VAT-related pointer.

### 0x082BEF — Read byte from indirect pointer at 0xD025A3

```asm
082BEF: E5              PUSH HL
082BF0: 2A A3 25 D0     LD HL,(0xD025A3)    ; HL = *(0xD025A3)
082BF4: 7E              LD A,(HL)           ; A = byte at that pointer
082BF5: 23              INC HL              ; advance pointer
082BF6: 22 A3 25 D0     LD (0xD025A3),HL    ; store updated pointer
082BFA: E1              POP HL
082BFB: C9              RET
```

Reads one byte from the stream pointer at **0xD025A3** and advances it. Classic "fetch next byte from token stream" pattern.

### 0x082BFC — Read 3-byte LE value from (HL-2) into BDE

```asm
082BFC: E5              PUSH HL
082BFD: 7E              LD A,(HL)           ; byte at HL
082BFE: 5F              LD E,A
082BFF: 2B              DEC HL
082C00: 7E              LD A,(HL)           ; byte at HL-1
082C01: 57              LD D,A
082C02: 2B              DEC HL
082C03: 7E              LD A,(HL)           ; byte at HL-2
082C04: 47              LD B,A
082C05: CD 85 C8 04     CALL 0x04C885       ; some validation/conversion
082C09: E1              POP HL
082C0A: C9              RET
```

Reads a 3-byte little-endian value backward from HL into B:D:E (or BDE as a 24-bit value). Then calls 0x04C885.

### 0x082C0B — Write 3-byte value from BDE to (HL)

```asm
082C0B: E5              PUSH HL
082C0C: CD A3 C8 04     CALL 0x04C8A3       ; some conversion
082C10: 77              LD (HL),A           ; write byte
082C11: 23              INC HL
082C12: 7A              LD A,D
082C13: 77              LD (HL),A           ; write D
082C14: 23              INC HL
082C15: 7B              LD A,E
082C16: 77              LD (HL),A           ; write E
082C17: E1              POP HL
082C18: C9              RET
```

Writes a 3-byte value from registers to memory at (HL).

### 0x082C19 — Type mask + table lookup

```asm
082C19: E6 3F           AND A,0x3F          ; mask to 6 bits (type field)
082C1B: CD 2D 01 08     CALL 0x08012D       ; table/dispatch lookup
082C1F: C8              RET Z               ; return if zero flag set
082C20: C3 84 00 08     JP 0x080084         ; else jump to error/default handler
```

Masks A to lower 6 bits and does a table lookup. Likely a VAT type classifier.

### 0x082C24 — FindSym variant (check if variable exists, carry = found)

```asm
082C24: CD 3D 38 08     CALL 0x08383D       ; FindSym or similar
082C28: 18 04           JR +4 → 0x082C2E    ; skip next instruction
```

### 0x082C2A — Another FindSym entry

```asm
082C2A: CD EA 46 08     CALL 0x0846EA       ; different find routine
082C2E: D8              RET C               ; return if carry (found)
082C2F: F5              PUSH AF
082C30: CD AE 21 08     CALL 0x0821AE       ; error check / memory check
082C34: C2 96 1D 06     JP NZ,0x061D96      ; error exit if NZ
082C38: F1              POP AF
082C39: C9              RET
```

If variable not found (no carry), calls 0x0821AE (memory/error check), and if that returns NZ, jumps to **0x061D96** (error handler). This is a "find or error" pattern.

### 0x082C3A — FindSym + flag manipulation

```asm
082C3A: CD EA 46 08     CALL 0x0846EA       ; find variable
082C3E: D8              RET C               ; return if found
082C3F: F5              PUSH AF
082C40: CD AE 21 08     CALL 0x0821AE       ; memory check
082C44: 28 08           JR Z,+8 → 0x082C4E  ; if zero, skip to POP+RET
082C46: FD CB 08 8E     RES 1,(IY+8)        ; reset bit 1 of (IY+8) — a system flag
082C4A: C3 92 1D 06     JP 0x061D92         ; error exit
082C4E: F1              POP AF
082C4F: C9              RET
```

Similar pattern but also manipulates a system flag bit before error exit.

### 0x082C50 — Another find variant (carry check reversed)

```asm
082C50: CD EA 46 08     CALL 0x0846EA
082C54: DA 3A 1D 06     JP C,0x061D3A       ; error if carry SET (variable already exists?)
082C58: 18 E5           JR -27 → 0x082C3F   ; continue with not-found path
```

This errors if the variable IS found — used for "create new, fail if exists" semantics.

### 0x082C5A — Complex routine (archive/program related)

```asm
082C5A: CD BD F7 07     CALL 0x07F7BD       ; some setup
082C5E: CD 51 01 08     CALL 0x080151       ; another helper
082C62: C0              RET NZ              ; return if not zero
082C63: 3E 03           LD A,0x03           ; A = 3
082C65: 32 F8 05 D0     LD (0xD005F8),A     ; store 3 to state variable
082C69: E5              PUSH HL
082C6A: 2B              DEC HL
082C6B: 2B              DEC HL
082C6C: 2B              DEC HL
082C6D: 5E              LD E,(HL)           ; read 3-byte pointer backward
082C6E: 2B              DEC HL
082C6F: 56              LD D,(HL)
082C70: 2B              DEC HL
082C71: 7E              LD A,(HL)
082C72: CD 86 C8 04     CALL 0x04C886       ; convert/validate
082C76: EB              EX DE,HL
082C77: 7E              LD A,(HL)
082C78: 23              INC HL
082C79: B6              OR (HL)             ; check if 2-byte value is zero
082C7A: E1              POP HL
082C7B: C9              RET
```

---

## 0x0821B9 — Heap/VAT Move (InsertMem / MakeRoom)

This is the critical memory insertion routine. It moves memory to create space in the heap, then adjusts all VAT pointers.

### Full Annotated Disassembly

```asm
; Entry: BC = size to insert, HL = insertion point?
; Adjusts multiple system pointers in 0xD025xx region

0821B9: F5              PUSH AF
0821BA: 2A 8A 25 D0     LD HL,(0xD0258A)    ; HL = *(0xD0258A) — some heap pointer
0821BE: C5              PUSH BC             ; save size
0821BF: E5              PUSH HL             ; save original pointer
0821C0: 09              ADD HL,BC           ; HL += size (new end position)
0821C1: 22 8A 25 D0     LD (0xD0258A),HL    ; update heap pointer
0821C5: ED 42           SBC HL,BC           ; HL -= BC (restore, but with carry effect)
0821C7: EB              EX DE,HL            ; DE = old pointer value

0821C8: 2A 8D 25 D0     LD HL,(0xD0258D)    ; HL = *(0xD0258D) — another heap pointer
0821CC: ED 52           SBC HL,DE           ; HL = *(0xD0258D) - DE (byte count to move)
0821CE: E5              PUSH HL             ; save byte count
0821CF: F5              PUSH AF             ; save flags
0821D0: 19              ADD HL,DE           ; HL = original 0xD0258D value
0821D1: 09              ADD HL,BC           ; HL += size (destination end)
0821D2: 22 8D 25 D0     LD (0xD0258D),HL    ; update second pointer (grows by BC)
0821D6: 2B              DEC HL              ; HL points to last byte of destination

0821D7: E5              PUSH HL             ; dest end
0821D8: D1              POP DE              ; DE = dest end
0821D9: ED 42           SBC HL,BC           ; HL = source end (dest - size)
                                            ; Wait — HL was popped into DE, then SBC HL,BC
                                            ; Actually: after POP DE, HL still = old value from before PUSH
                                            ; Re-analyzing: PUSH HL then POP DE means DE=HL, HL is unchanged
                                            ; So: DE = dest_end, HL = dest_end, then SBC HL,BC → HL = source_end
0821DB: F1              POP AF              ; restore flags
0821DC: C1              POP BC              ; BC = byte count to move (was pushed at 0821CE)

; Block copy loop (LDDR-like, unrolled 9x for speed)
0821DD: 28 18           JR Z,+24 → 0x0821F7  ; if count=0, skip copy

0821DF: ED A8           LDD                 ; copy (HL)→(DE), dec HL,DE,BC
0821E1: ED A8           LDD
0821E3: ED A8           LDD
0821E5: ED A8           LDD
0821E7: ED A8           LDD
0821E9: ED A8           LDD
0821EB: ED A8           LDD
0821ED: ED A8           LDD
0821EF: ED A8           LDD                 ; 9 LDDs per iteration
0821F1: 78              LD A,B
0821F2: B1              OR C                ; test if BC=0
0821F3: C2 DF 21 08     JP NZ,0x0821DF      ; loop if more bytes

; After block copy, adjust system pointers
0821F7: D1              POP DE              ; DE = original heap pointer (pushed at 0821BF)
0821F8: C1              POP BC              ; BC = original size (pushed at 0821BE)
0821F9: F1              POP AF              ; restore AF (pushed at 0821B9)

0821FA: 28 39           JR Z,+57 → 0x082235  ; if Z flag, skip pointer adjustment

; Adjust pointer at 0xD02587
0821FC: 2A 87 25 D0     LD HL,(0xD02587)    ; HL = *(0xD02587)
082200: 09              ADD HL,BC           ; HL += size
082201: 22 87 25 D0     LD (0xD02587),HL    ; update it

; Adjust pointer at 0xD025A0
082205: 2A A0 25 D0     LD HL,(0xD025A0)    ; HL = *(0xD025A0)
082209: E5              PUSH HL
08220A: EB              EX DE,HL            ; HL = old heap ptr, DE = *(0xD025A0)
08220B: ED 52           SBC HL,DE           ; compare: old_heap - *(0xD025A0)
08220D: 28 27           JR Z,+39 → 0x082236 ; if equal, skip VAT walk
08220F: C5              PUSH BC
082210: E5              PUSH HL
082211: C1              POP BC              ; BC = old_heap - *(0xD025A0) = bytes between
082212: 19              ADD HL,DE           ; HL = ... reconstruct source
                                            ; Actually: HL was (old_heap - D025A0_val), DE = D025A0_val
                                            ; ADD HL,DE = old_heap. Then:
082213: 2B              DEC HL              ; HL = old_heap - 1
082214: ED 5B 8A 25 D0  LD DE,(0xD0258A)    ; DE = updated heap pointer
082219: 1B              DEC DE              ; DE = updated_heap - 1
08221A: ED B8           LDDR                ; copy BC bytes backward (HL→DE, decrementing)
08221C: EB              EX DE,HL

08221D: C1              POP BC              ; restore original size

; Call pointer update routines
08221E: CD 90 C9 04     CALL 0x04C990       ; update system pointers (likely adjusts all VAT ptrs by BC)
082222: CD 39 27 08     CALL 0x082739       ; another pointer update pass
082226: ED 4B 77 25 D0  LD BC,(0xD02577)    ; load a counter/size from 0xD02577
08222B: CD D6 24 08     CALL 0x0824D6       ; yet another adjustment
08222F: CD FD 24 08     CALL 0x0824FD       ; and another
082233: D1              POP DE              ; balance stack (from 082209)
082234: C9              RET

; Skip-pointer-adjustment path
082235: ...             (continues at 082235)
```

---

## Key RAM Addresses Referenced

| Address | Name (inferred) | Usage |
|---------|-----------------|-------|
| **0xD02587** | heapBot / userMemStart | Adjusted by +BC after insertion |
| **0xD0258A** | heapTop / userMemEnd | Updated to heapTop + BC (grows heap) |
| **0xD0258D** | vatStart / progTop | Updated to include new space; source for block copy |
| **0xD02590** | OPBase | Not directly referenced here (may be updated by subroutine calls) |
| **0xD0259A** | pTemp | Not directly referenced here |
| **0xD0259D** | progPtr | Not directly referenced here |
| **0xD025A0** | vatEnd / symTabPtr | Used as comparison point for VAT walk |
| **0xD025A3** | tokenStreamPtr | Read/write in helper at 0x082BEF (stream fetch) |
| **0xD02577** | (counter/size) | Loaded for pointer adjustment call |
| **0xD005F8** | (state variable) | Written with type/flag values |

## Key Subroutines Called

| Address | Called From | Purpose (inferred) |
|---------|------------|---------------------|
| **0x04C885** | 0x082C05 | BDE pointer validation/conversion |
| **0x04C8A3** | 0x082C0C | BDE pointer write conversion |
| **0x04C990** | 0x08221E | System pointer mass-update (adjusts all pointers by BC) |
| **0x082739** | 0x082222 | Secondary pointer adjustment pass |
| **0x0824D6** | 0x08222B | Pointer adjustment (uses BC from 0xD02577) |
| **0x0824FD** | 0x08222F | Final pointer adjustment |
| **0x08383D** | 0x082C24 | FindSym (search VAT for variable) |
| **0x0846EA** | 0x082C2A+ | Another FindSym variant |
| **0x0821AE** | 0x082C30+ | Memory/availability check before error |
| **0x0822BA** | 0x082BBE | Slot/pointer lookup (called by main entry) |
| **0x0829F2** | 0x082BD6 | Pointer compare/store |
| **0x07F7BD** | 0x082C5A | Archive/program setup |
| **0x080151** | 0x082C5E | Helper routine |

## Error Exit Addresses

| Address | Context |
|---------|---------|
| **0x061D96** | Variable not found + memory check fails (NZ) |
| **0x061D92** | Variable not found + flag manipulation error |
| **0x061D3A** | Variable already exists (duplicate create) |

## Analysis Summary

### 0x082BBE region
This is NOT a single subroutine — it's a collection of ~15 small utility functions packed together:
- **Stream reader** (0x082BEF): reads bytes from a token stream pointer at 0xD025A3
- **Pointer arithmetic** (0x082BDA, 0x082BE1): HL += 6, HL -= 7 for VAT entry navigation
- **3-byte read/write** (0x082BFC, 0x082C0B): read/write 24-bit pointers from VAT entries
- **Type classifier** (0x082C19): masks type to 6 bits, does table lookup
- **FindSym wrappers** (0x082C24, 0x082C2A, 0x082C3A, 0x082C50): find variable with various error handling strategies
- **Pointer store** (0x082BE9): saves DE to 0xD025A3

### 0x0821B9 (InsertMem / MakeRoom)
This is the core memory insertion routine:
1. **Grows heap** by adding BC bytes to 0xD0258A (heap top)
2. **Grows VAT region** by adding BC to 0xD0258D
3. **Block copies** existing data upward using unrolled LDDR (9 LDD per iteration for speed)
4. **Adjusts system pointers**: 0xD02587 += BC, then does a secondary move for VAT region at 0xD025A0
5. **Calls 4 pointer-update routines** (0x04C990, 0x082739, 0x0824D6, 0x0824FD) to adjust all system pointers that reference the moved region

The key insight: OPBase (0xD02590), pTemp (0xD0259A), and progPtr (0xD0259D) are NOT directly adjusted by 0x0821B9 itself — they must be adjusted by one of the four subroutine calls (likely 0x04C990 or 0x082739), which probably walk a table of pointer addresses and add BC to any that fall within the moved range.
