# Phase 409: Trace Inside `0x05D58F`

## Summary

- `0x05D58F` is **table-driven**, but not as an array of `JP`/`CALL` targets.
- The key code arrives as a stack/frame argument at **`(IX+6)`**, not by re-reading `0xD141B5`.
- The routine multiplies the key by 4, adds it to a table base stored in **`RAM[0xD1441D]`**, and copies a **4-byte record** into the destination pointer from **`(IX+9)`**.
- There is **no CP cascade** (`CP nn` / `JR Z`) in the traced window.
- There is **no key-driven computed jump** (`JP (HL)` / `JP (IX)` / `CALL (HL)`) in the traced window.
- The only `JP (HL)` seen in the helper path belongs to the compiler/frame gate `0x000130 -> 0x00218A`, not to key dispatch logic.

## Core Entry Trace

The key dispatch entry itself is short:

```asm
0x05D58F  CALL 0x000130        ; frame/helper setup
0x05D593  LD HL,(0xD1441D)     ; load current table base
0x05D597  CALL 0x000138        ; zero-test helper
0x05D59B  JR Z,0x05D5BD        ; bail out if table base is null
0x05D59D  LD BC,0x000004       ; record size = 4
0x05D5A2  LD A,(IX+6)          ; raw key code argument
0x05D5A6  SBC HL,HL
0x05D5A8  LD L,A
0x05D5A9  ADD HL,HL
0x05D5AA  ADD HL,HL            ; HL = 4 * key
0x05D5AB  LD BC,(0xD1441D)     ; reload table base
0x05D5B0  ADD HL,BC            ; HL = table_base + 4*key
0x05D5B1  PUSH HL              ; src
0x05D5B2  LD BC,(IX+9)         ; dst pointer
0x05D5B5  PUSH BC              ; dst
0x05D5B6  CALL 0x0000A4        ; memcpy helper
0x05D5BD  LD SP,IX
0x05D5BF  POP IX
0x05D5C1  RET
```

`0x0000A4` is not an indirect dispatcher. Prior tracing already identified it as a jump to `0x0027E8`, a forward-copy helper equivalent to `memcpy(dst, src, len)`.

## Dispatch Mechanism Answer

Direct answer to the requested questions:

| Question | Answer |
|---|---|
| Dispatch table indexed by key code? | **Yes**, but it is a table of 4-byte records, not a table of `JP`/`CALL` code pointers. |
| CP cascade? | **No**. No `CP nn` ladder appears in the traced window. |
| Computed jump? | **No** in the key path. The only `JP (HL)` belongs to the generic frame helper at `0x00218A`. |
| First action after key arrives? | Load key from `(IX+6)`, compute `table_base + 4*key`, copy 4 bytes to destination `(IX+9)`. |

## First 20 Control Targets

These are the first unique `CALL` / `JP` / `JR` targets seen while tracing `0x05D58F..0x05D74E`:

| # | From | Kind | Target |
|---|---|---|---|
| 1 | `0x05D58F` | `CALL` | `0x000130` |
| 2 | `0x05D597` | `CALL` | `0x000138` |
| 3 | `0x05D59B` | `JR Z` | `0x05D5BD` |
| 4 | `0x05D5B6` | `CALL` | `0x0000A4` |
| 5 | `0x05D5DA` | `CALL` | `0x07F954` |
| 6 | `0x05D5E2` | `JP NZ` | `0x061D4A` |
| 7 | `0x05D5E6` | `CALL` | `0x099AF9` |
| 8 | `0x05D5EA` | `CALL` | `0x082945` |
| 9 | `0x05D5EE` | `CALL` | `0x08294B` |
| 10 | `0x05D5F6` | `CALL` | `0x082934` |
| 11 | `0x05D5FA` | `CALL` | `0x08293F` |
| 12 | `0x05D5FE` | `CALL` | `0x07FFDC` |
| 13 | `0x05D602` | `CALL` | `0x07F920` |
| 14 | `0x05D606` | `CALL` | `0x05F607` |
| 15 | `0x05D60A` | `CALL` | `0x05F62B` |
| 16 | `0x05D610` | `JR NZ` | `0x05D634` |
| 17 | `0x05D612` | `CALL` | `0x09AC73` |
| 18 | `0x05D616` | `CALL` | `0x05F673` |
| 19 | `0x05D61A` | `CALL` | `0x07F831` |
| 20 | `0x05D61E` | `JR C` | `0x05D63C` |

## Subroutine Calls Seen In The Traced Window

Unique call targets in `0x05D58F..0x05D74E`:

`0x000130`, `0x000138`, `0x0000A4`, `0x07F954`, `0x099AF9`, `0x082945`, `0x08294B`, `0x082934`, `0x08293F`, `0x07FFDC`, `0x07F920`, `0x05F607`, `0x05F62B`, `0x09AC73`, `0x05F673`, `0x07F831`, `0x05F4D7`, `0x05F5B9`, `0x05F5BF`, `0x07C771`, `0x07FDC9`, `0x07FD4A`, `0x07C8AD`, `0x05F4EF`, `0x07C77F`, `0x05F677`, `0x05F67B`, `0x05F5CF`, `0x0832BE`, `0x061DEF`, `0x07FAAF`, `0x082957`, `0x09A5B5`, `0x05D9B1`, `0x05F663`, `0x05F667`, `0x05F66B`, `0x07FAC2`, `0x05F643`, `0x07FDD6`, `0x07F8A2`, `0x05F5D7`, `0x07FA3D`, `0x07CAB9`, `0x07F8B6`, `0x05F63B`, `0x07C755`, `0x05F637`, `0x07C8A9`, `0x05F633`, `0x07C74F`, `0x05F521`, `0x05F535`, `0x05F563`, `0x07F829`, `0x05F501`, `0x05F4F5`

Notable later hits:

- `0x05D638 -> CALL 0x07FDC9`
- `0x05D6B0 -> CALL 0x07FDD6`
- `0x05D6FC -> CALL 0x07FDD6`

That supports the earlier phase-403/405 conclusion that the copied 4-byte record is later interpreted through the action-byte helper pipeline, not jumped through as code.

## RAM Addresses Read / Written

Absolute RAM accesses seen in the traced window:

| Address | Access | Site(s) | Notes |
|---|---|---|---|
| `0xD1441D` | read | `0x05D593`, `0x05D5AB` | current dispatch-table base |
| `0xD1441D` | write | `0x05D5C9` | adjacent table-base setter at `0x05D5C2` |
| `0xD14084` | write | `0x05D5CF` | cleared by adjacent setup routine |
| `0xD0060E` | read | `0x05D66D`, `0x05D68D` | later action-path state read |

Indexed memory touches worth noting:

- `(IX+6)` read at `0x05D5A2`: the raw key code argument
- `(IX+9)` read at `0x05D5B2`: destination pointer for the 4-byte record
- `(IY+7)` bit test at `0x05D5DE`
- `(IY+7)` bit set at `0x05D671`

## Conclusion

`0x05D58F` is **not** a CP ladder and **not** a computed-jump dispatcher. It is a **table lookup and 4-byte record copy wrapper**:

1. Check whether `RAM[0xD1441D]` points to a live dispatch table.
2. Use the incoming key code from `(IX+6)` as an index.
3. Compute `table_base + 4*key`.
4. Copy that 4-byte record into the caller-provided destination pointer from `(IX+9)`.

So the answer to “what happens after the key code arrives?” is:

- first, the key is translated into a **4-byte action descriptor** by indexed table lookup;
- then, in the deeper `0x05D5D8+` chain, the OS follows a **call-heavy action pipeline** that eventually reaches helpers such as `0x07FDC9` and `0x07FDD6`.

The key bottleneck is therefore **data-driven descriptor fetch**, not a hardcoded compare ladder or an array of code pointers.

---

## Extended Trace: The Main Processing Pipeline at 0x05D5D8

The adjacent function at **0x05D5D8** (called from 0x068335 and 0x06D3E2, NOT from 0x02BD96) is the heavy key-processing pipeline. Probe output covers 600 bytes / 109 CALL instructions.

### Pipeline Structure

```
0x05D5D8  PUSH AF              ; save key code
0x05D5D9  PUSH BC
0x05D5DA  CALL 0x07F954        ; init
0x05D5DE  BIT 3,(IY+7)
0x05D5E2  JP NZ,0x061D4A       ; -> error sled (SYNTAX 0x90)
          ... ~109 CALL cascade ...
          multiple conditional exits via JP to:
            0x061D4A (error: SYNTAX)
            0x061D4E (error: ARGUMENT)
            0x05D849 (late processing)
            0x05D871 (alternate path)
            0x05DA03 (cleanup/teardown)
```

### Error/Status Code Sled at 0x061D4A

26 consecutive `LD A,<code> / JR 0x061DB2` entries. Different pipeline exit points land at different offsets:

| Entry Addr | Code | Likely Meaning |
|------------|------|----------------|
| 0x061D4A | 0x90 | E_SYNTAX |
| 0x061D4E | 0x91 | E_ARGUMENT |
| 0x061D52 | 0x92 | E_DIMENSION_MISMATCH |
| 0x061D56 | 0x93 | E_DIMENSION |
| 0x061D5A | 0x86 | E_ARCHIVED |
| 0x061D5E | 0x15 | E_UNDEFINED |
| 0x061D62 | 0x96 | E_SINGULAR_MAT |
| 0x061D66 | 0x98 | E_STAT |
| 0x061D6A | 0x99 | E_STAT_PLOT |
| 0x061D6E | 0x9A | (unknown) |
| 0x061D72 | 0x9C | (unknown) |
| 0x061D76 | 0x1B | (unknown) |
| 0x061D7A | 0xAA | (unknown) |
| 0x061D7E | 0x2D | (unknown) |
| 0x061D82 | 0x28 | (unknown) |
| 0x061D86 | 0x2E | (unknown) |
| 0x061D8A | 0xAB | (unknown) |
| 0x061D8E | 0xAC | (unknown) |
| 0x061D92 | 0xAF | (unknown) |
| 0x061D96 | 0x2F | (unknown) |
| 0x061D9A | 0x30 | (unknown) |
| 0x061D9E | 0x31 | (unknown) |
| 0x061DA2 | 0xB4 | (unknown) |
| 0x061DA6 | 0x9F | (unknown) |
| 0x061DAA | 0xB5 | (unknown) |
| 0x061DAE | 0x36 | (unknown) |

Common handler at **0x061DB2**: `LD (0xD008DF),A` then calls `0x03E1B4` (error dispatcher).

### Frequently-Called Subroutines

| Address | Calls | Role |
|---------|-------|------|
| 0x07F831 | 8x | **Key state checker**: reads D005FA and D00605, tests for zero |
| 0x05F5B9 | 6x | OP2 register base (LD DE,D00603) |
| 0x05F5BF | 4x | OP1 register copy (LD DE,D005F8, C=0x7E) |
| 0x05F4D7 | 4x | OP1 load from (D022BA) pointer |
| 0x07C77F | 4x | State management |
| 0x07C8AD | 3x | Table-driven BCD accumulator using OP registers |
| 0x07C771 | 3x | State management |
| 0x07C8A9 | 2x | Table handler variant (default table at 0x07CC48) |
| 0x082934-082957 | 5x | Display/screen update cluster |

### OP1/OP2 FP Register Helpers (0x05F4D7-0x05F62B)

All ~25 helpers follow the pattern: `LD DE,<register_base>` then jump to a common copier. Two RAM regions:
- **D005F8-D00602**: OP1 (11 bytes)
- **D00603-D0060D**: OP2 (11 bytes)

These are the TI-OS OP1-OP6 floating-point scratch registers, confirming session 407's identification.

### Additional RAM Addresses (from the pipeline)

| Address | Access | Purpose |
|---------|--------|---------|
| D005F8 | R/W | OP1[0] — FP register |
| D005F9 | W | Key type (stored by 0x07C8AD) |
| D005FA | R (8x) | **Key code** — primary state variable checked by 0x07F831 |
| D00605 | R | Key state flag |
| D0060E | R/W | Saved HL value |
| D008DF | W | Error status code (from sled) |
| D022BA | R | Pointer to current expression/data |

### Lookup Pattern: LD HL,<table> / CALL 0x07C8AD

Three instances in the pipeline:
1. `LD HL,0x05DA30 / CALL 0x07C8AD` at 0x05D648
2. `LD HL,0x0A7ECE / CALL 0x07C8AD` at 0x05D6B4
3. `LD HL,0x05DA30 / CALL 0x07C8AD` at 0x05D75A

Plus: `LD HL,0x05D9EF / CALL 0x061DEF` at 0x05D675 (teardown handler)

The tables at 0x05DA30 and 0x0A7ECE both start with 0x00 (end sentinel for the BCD table scanner), so these are essentially no-op/empty table lookups in the default key path.

### Architecture Diagram

```
0x02BD96 (key reader)
  reads D141B5 (scan code)
  CALL 0x05D58F (table index: key*4 -> 4-byte descriptor)
  CALL 0x02B373

0x05D5D8 (pipeline, from 0x068335/0x06D3E2)
  109 subroutine calls in sequence
  OP1/OP2 as scratch (D005F8-D0060D)
  State checks via 0x07F831 (D005FA)
  Error exits via JP to 0x061D4A sled
  Table lookups via 0x07C8AD (BCD accumulation)
  Display updates via 0x082934-082957
```
