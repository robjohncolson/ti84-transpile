# Phase 322: _seqcase Scanning Variant at 0x00211B

## Summary

The function at `0x00211B` implements a **linear-scan switch/case** for sparse key dispatch. Unlike the sequential variant at `0x002623` (which indexes into a dense table using arithmetic), this variant walks a list of `{u8 key, u24 target}` pairs comparing each key against the search value. It is used exclusively for key-dispatch tables where scan codes are sparse (non-contiguous).

**22 call sites** found in the ROM, concentrated in the `0x0085xx`-`0x011Bxx` range (key handlers, event dispatch, mode switches).

---

## Full Annotated Disassembly: 0x00211B (54 bytes)

### Inline data format

```
[u16 count][count x {u8 key, u24 addr}][u24 default]
```

### Calling convention

- **HL** = search key (caller sets `L = key_byte`, `H = 0` via `SBC HL,HL; LD L,A`)
- Inline data follows immediately after the `CALL 0x00211B` instruction
- Returns by jumping to the matched (or default) target address
- All registers (AF, BC, DE, IY) are preserved across the call

### Prologue: save state, read count

```
00211B: FD E3        EX (SP), IY       ; IY = return addr (inline data ptr)
                                        ; old IY saved on stack
00211D: F5           PUSH AF            ; save AF
00211E: C5           PUSH BC            ; save BC
00211F: D5           PUSH DE            ; save DE
002120: ED 33 02     LEA IY, IY+2       ; skip u16 count field
002123: FD 17 FE     LD DE, (IY-2)      ; DE = count (24-bit load; only low 16 matter)
                                        ; reads from original inline data start
```

After this: IY points to the first `{u8 key, u24 addr}` entry. DE = entry count. HL = search key.

### Loop body: linear scan

```
002126: 01 00 00 00  LD BC, 0x000000    ; clear BC (loop re-entry point)

; --- LOOP TOP ---
00212A: FD 4E 00     LD C, (IY+0)      ; C = table entry key byte
00212D: FD 23        INC IY            ; IY past key byte, points to u24 addr
00212F: E5           PUSH HL           ; save search key
002130: B7           OR A              ; clear carry flag
002131: ED 42        SBC HL, BC        ; HL - BC: compare search key with table key
002133: E1           POP HL            ; restore search key
002134: 28 11        JR Z, +0x11       ; -> 0x002147 (MATCH FOUND)

; --- NO MATCH: decrement counter, check exhaustion ---
002136: 52 1B        SIL; DEC DE       ; count-- (SIL prefix on DEC DE)
002138: 06 00        LD B, 0x00        ; \
00213A: 0E 00        LD C, 0x00        ;  } clear BC for count-zero test
00213C: EB           EX DE, HL         ; swap: HL = count, DE = search key
00213D: B7           OR A              ; clear carry
00213E: 52 ED 42     SIL; SBC HL, BC   ; HL - 0 = HL (test if count == 0)
002141: EB           EX DE, HL         ; swap back: HL = search key, DE = count
002142: ED 33 03     LEA IY, IY+3      ; skip u24 addr (advance to next entry)
002145: 20 DF        JR NZ, -0x21      ; -> 0x002126 if count != 0 (loop back)
```

### Epilogue: load target and return

Both the match path (JR Z at 0x002134) and the exhaustion path (JR NZ fallthrough at 0x002145) converge here. On match, IY points to the matched entry's u24 addr. On exhaustion, IY points to the u24 default addr (past all entries).

```
002147: FD 27 00     LD HL, (IY+0)     ; HL = target address (matched or default)
00214A: D1           POP DE            ; restore DE
00214B: C1           POP BC            ; restore BC
00214C: F1           POP AF            ; restore AF
00214D: FD E3        EX (SP), IY       ; restore old IY from stack;
                                        ; stack top <- IY (inline data ptr, discarded)
00214F: E3           EX (SP), HL       ; stack top <- target address (from HL);
                                        ; HL <- old inline data ptr (discarded)
002150: C9           RET               ; jump to target address via RET
```

The `EX (SP), HL` + `RET` trick replaces the return address on the stack with the resolved target address, then "returns" to it.

---

## Algorithm Description

1. **Entry**: `CALL 0x00211B` pushes the return address (= inline data pointer). The function swaps it into IY.
2. **Read count**: 24-bit load from start of inline data gives the u16 entry count in DE.
3. **Linear scan**: For each of up to `count` entries:
   - Load the u8 key from the entry into C (B stays 0, so BC = key as 24-bit).
   - Compare HL (search key) with BC via `SBC HL, BC` (carry pre-cleared).
   - On Z (match): jump to epilogue. IY points to this entry's u24 target.
   - On NZ: decrement DE. Test if DE == 0 by `EX DE,HL; SBC HL,BC; EX DE,HL` (BC=0).
   - Skip the u24 addr field (`LEA IY, IY+3`). Loop back if count not exhausted.
4. **Exhaustion**: When DE reaches 0, IY points past all entries to the u24 default address. Falls through to the same epilogue.
5. **Epilogue**: Load 24-bit target from `(IY+0)` into HL. Restore all registers. Replace return address with target. `RET` jumps to target.

**Complexity**: O(n) linear scan. No binary search, no hash. Practical for the small tables used (2-11 entries).

---

## Comparison with Sequential Variant at 0x002623

### Sequential variant (0x002623): 34 call sites

**Inline format**: `[u16 count][u24 base][count x u24 target][u24 default]`

**Algorithm**: Computes `index = HL - base`. If `0 <= index < count`, loads `target[index]` via arithmetic (`base_ptr + index * 3`). Otherwise loads default. O(1) lookup.

```
002623: FD E3        EX (SP), IY       ; IY = inline data ptr
002625: F5           PUSH AF
002626: C5           PUSH BC
002627: D5           PUSH DE
002628: ED 33 05     LEA IY, IY+5      ; skip u16 count + u24 base (5 bytes)
00262B: 11 00 00 00  LD DE, 0x000000
00262F: FD 07 FB     LD BC, (IY-5)     ; BC = count (from start of data)
002632: 59           LD E, C
002633: 50           LD D, B           ; DE = count
002634: FD 07 FD     LD BC, (IY-3)     ; BC = base value
002637: B7           OR A              ; clear carry
002638: ED 42        SBC HL, BC        ; HL = HL - base (index computation)
00263A: FA 47 26 00  JP M, 0x002647    ; index < 0 -> default
00263E: E5           PUSH HL
00263F: B7           OR A
002640: ED 52        SBC HL, DE        ; compare index with count
002642: E1           POP HL
002643: FA 49 26 00  JP M, 0x002649    ; index < count -> valid
; Falls through to default path when index >= count
002647: D5           PUSH DE           ; HL = count (for offset past table)
002648: E1           POP HL
002649: E5           PUSH HL           ; BC = index (or count for default)
00264A: C1           POP BC
00264B: 29           ADD HL, HL        ; HL = index * 2
00264C: 09           ADD HL, BC        ; HL = index * 3
00264D: E5           PUSH HL
00264E: C1           POP BC            ; BC = index * 3
00264F: FD 09        ADD IY, BC        ; IY += index * 3
002651: FD 27 00     LD HL, (IY+0)     ; HL = target[index] or default
002654: D1           POP DE
002655: C1           POP BC
002656: F1           POP AF
002657: FD E3        EX (SP), IY
002659: E3           EX (SP), HL
00265A: C9           RET               ; jump to target
```

### Key differences

| Aspect | Scanning (0x00211B) | Sequential (0x002623) |
|--------|--------------------|-----------------------|
| Inline format | `[u16 count][count x {u8 key, u24 addr}][u24 default]` | `[u16 count][u24 base][count x u24 target][u24 default]` |
| Entry size | 4 bytes per entry (1 key + 3 addr) | 3 bytes per entry (addr only; key implicit from position) |
| Lookup method | Linear scan O(n) | Arithmetic index O(1) |
| Key range | Sparse (arbitrary u8 keys) | Dense (contiguous from base) |
| Bytes per entry overhead | +1 byte (explicit key) | 3 bytes (base value in header) |
| Call sites | 22 | 34 |
| Use case | Sparse dispatch (mode bytes, non-contiguous scan codes) | Dense dispatch (contiguous key ranges) |
| Size of function | 54 bytes (0x00211B-0x002150) | 56 bytes (0x002623-0x00265A) |

### Sibling variant at 0x002151

A nearly identical scanning function exists at `0x002151` (57 bytes). Differences:
- Uses `LEA IY, IY+3` at entry (vs +2), suggesting a u24 count field or 1-byte prefix before the u16 count
- Preserves IY via `PUSH IY` / `POP IY` instead of the `EX (SP), IY` trick at 0x00211B
- **Zero call sites found** -- likely dead code or reserved for future use

---

## Complete Caller List (22 sites)

| Call Site | Count | Key Summary | Default |
|-----------|-------|-------------|---------|
| `0x0085F7` | 11 | 0x00-0x03 (arrows), 0x04-0x15 (operators) | `0x00862E` |
| `0x008659` | 11 | 0x00-0x04, 0x10-0x15 (full dispatch) | `0x008830` |
| `0x0086BF` | 2 | 0x20 ((-)), 0x21 (3) | `0x008834` |
| `0x00874E` | 4 | 0x80, 0x81, 0x82, 0xFF (special keys) | `0x008834` |
| `0x0087C5` | 7 | 0x08, 0x96-0x9B (function keys) | `0x008834` |
| `0x00880D` | 5 | 0x8C, 0x8E-0x91 (special) | `0x008834` |
| `0x0088A8` | 11 | 0x00-0x04, 0x10-0x15 (full key groups) | `0x008940` |
| `0x008966` | 10 | 0x00-0x04, 0x10-0x14 | `0x0089EF` |
| `0x008A10` | 8 | 0x41, 0x45-0x47, 0xC0-0xC4 | `0x008BDD` |
| `0x008DB4` | 4 | 0x80, 0x81, 0x82, 0xFF | `0x008F0A` |
| `0x008FD7` | 5 | 0x8C, 0x8E-0x91 | `0x009040` |
| `0x009229` | 2 | 0x20 ((-)), 0x21 (3) | `0x00927A` |
| `0x00929A` | 4 | 0x06, 0x07, 0x08, 0x10 | `0x009349` |
| `0x009369` | 2 | 0x44 (,), 0x45 (SIN) | `0x009384` |
| `0x00A159` | 8 | 0x01-0x07, 0x22 (6) | `0x00A329` |
| `0x00A40D` | 2 | 0x01, 0x02 | `0x00A44E` |
| `0x00A836` | 3 | 0xF8, 0xF9, 0xFF (OS-internal codes) | `0x00A8B8` |
| `0x00CE16` | 6 | 0x01-0x03, 0x09-0x0B | `0x00CE6B` |
| `0x00E07C` | 2 | 0x00, 0x02 | `0x00E1C4` |
| `0x00E1E1` | 2 | 0x00, 0x02 | `0x00E2E6` |
| `0x011119` | 4 | 0x02, 0x04, 0x05, 0x07 | `0x011499` |
| `0x011B5A` | 6 | 0x00, 0x01, 0x09, 0x1C-0x1E | `0x011C27` |

All 22 sites are in the range `0x008500`-`0x011C00`, which corresponds to OS key handling and UI dispatch code.

---

## Decoded Inline Data Examples

### Example 1: 0x0085F7 (pre-dispatch by key group)

The caller loads A from `0xD177B9` (a state byte), then sets HL = A via `SBC HL,HL; LD L,A`.

```
Call at 0x0085F7: CALL 0x00211B
Inline data at 0x0085FB:
  Count: 11
  Entries:
    key=0x00 (DOWN)   -> 0x00862C   ; arrow keys group
    key=0x01 (LEFT)   -> 0x00862C
    key=0x02 (RIGHT)  -> 0x00862C
    key=0x03 (UP)     -> 0x00862C
    key=0x04 (zero*)  -> 0x008632   ; operator keys group
    key=0x10 (ENTER)  -> 0x008632
    key=0x11 (+)      -> 0x008632
    key=0x12 (-)      -> 0x008632
    key=0x13 (x)      -> 0x008632
    key=0x14 (div)    -> 0x008632
    key=0x15 (^)      -> 0x008632
  Default:            -> 0x00862E
  Total: 49 bytes inline, resumes at 0x00862C
```

Note: Keys 0x00-0x03 all route to the same handler (arrow group). Keys 0x04 and 0x10-0x15 route to another handler (numeric/operator group). Non-matching keys go to the default at 0x00862E.

### Example 2: 0x008A10 (math/app key dispatch)

```
Call at 0x008A10: CALL 0x00211B
Inline data at 0x008A14:
  Count: 8
  Entries:
    key=0x41 (1-key)     -> 0x008AF6
    key=0x45 (SIN)       -> 0x008A39
    key=0x46 (APPS)      -> 0x008A85
    key=0x47 (X,T,theta) -> 0x008B57
    key=0xC0 (virtual)   -> 0x008B7D
    key=0xC1 (virtual)   -> 0x008BBB
    key=0xC2 (virtual)   -> 0x008BBB
    key=0xC4 (virtual)   -> 0x008BE1
  Default:               -> 0x008BDD
  Total: 37 bytes inline, resumes at 0x008A39
```

This table mixes physical scan codes (0x41-0x47) with OS-internal virtual key codes (0xC0-0xC4), demonstrating why a sparse scan is needed -- the key space is non-contiguous and includes synthetic codes.

### Example 3: 0x00A836 (OS-internal status codes)

```
Call at 0x00A836: CALL 0x00211B
Inline data at 0x00A83A:
  Count: 3
  Entries:
    key=0xF8  -> 0x00A8A2
    key=0xF9  -> 0x00A86C
    key=0xFF  -> 0x00A84B
  Default:    -> 0x00A8B8
  Total: 17 bytes inline
```

Keys 0xF8, 0xF9, 0xFF are OS-internal codes (not physical keys). The scanning variant handles these efficiently -- a sequential table from 0x00 to 0xFF would waste 255 entries.

---

## Architectural Notes

1. **Why two variants?** The sequential variant (0x002623) is O(1) but requires contiguous key values. The scanning variant (0x00211B) handles arbitrary sparse key sets at O(n) cost. The OS uses both: sequential for dense ranges (e.g., contiguous menu indices), scanning for key dispatch (non-contiguous scan codes, virtual key codes).

2. **The `EX (SP), IY` / `EX (SP), HL` / `RET` pattern** is a standard eZ80 idiom for inline-data functions. The return address doubles as a data pointer. After processing, the target address replaces the return address so `RET` acts as an indirect jump.

3. **Register contract**: The function preserves AF, BC, DE, and IY. Only HL is modified (set to the target address, but this is immediately consumed by the `EX (SP), HL` swap).

4. **The `SBC HL, BC` comparison** works because the caller zero-extends the key byte into 24-bit HL (via `SBC HL,HL; LD L,A`), and the function zero-extends each table key byte into 24-bit BC (via `LD BC,0; LD C,(IY+0)`). This ensures a clean 24-bit comparison.

5. **Loop counter check via `EX DE,HL`**: Rather than having a separate counter register, the code swaps DE (count) into HL, tests it against zero via `SBC HL, BC` (with BC=0), swaps back, and uses the Z flag. This saves registers at the cost of 5 extra instructions per iteration.
