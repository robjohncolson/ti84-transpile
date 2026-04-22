# Phase 25S - errNo 0x88 / ParseInp VAT loop

## What 0x88 means

- `TI-84_Plus_CE/references/ti84pceg.inc` defines `?E_EDIT := 1 shl 7 = 0x80`.
- The same section defines `?E_Syntax := 8 + E_EDIT = 0x88`.
- So `errNo=0x88` means **Syntax error**, with the edit / re-entry bit set.

## Local report hits

- Relevant:
  - `phase25p-vat-disasm-report.md` already shows `0x061d1a: ld a, 0x88`, which is the shared syntax-error dispatch stub.
  - `phase25r-parseinp-errsp-report.md` records the later ParseInp run ending with `errNo=0x88` while the PC spins in the VAT walker.
- Unrelated false positives:
  - `phase141-report.md` mentions token `0x88`, but that is a token-table entry, not an OS error code.
  - Several other `0x88` hits are just raw byte dumps or non-error contexts.

## Annotated disassembly

### VAT backstep helper `0x082BE2`

This is the exact call target used by the VAT loop. It is only the 6-byte backstep body.

```text
0x082be2: 2b                   dec hl  ; back up 1 byte
0x082be3: 2b                   dec hl  ; back up 2 bytes
0x082be4: 2b                   dec hl  ; back up 3 bytes
0x082be5: 2b                   dec hl  ; back up 4 bytes
0x082be6: 2b                   dec hl  ; back up 5 bytes
0x082be7: 2b                   dec hl  ; back up 6 bytes
0x082be8: c9                   ret
```

Important detail: there is another `dec hl` at `0x082be1`, but the loop calls `0x082be2`, not `0x082be1`. So the loop backs up **6 bytes**, not 7.

### FindSym VAT scan `0x084711`

```text
0x084711: 7e                   ld a, (hl)           ; read current VAT byte
0x084712: cd e2 2b 08          call 0x082be2        ; back up 6 bytes to candidate name area
0x084716: e6 3f                and 0x3f             ; mask flag bits off the VAT byte
0x084718: ed 52                sbc hl, de           ; compare against lower bound
0x08471a: d8                   ret c                ; not found once cursor moves below bound
0x08471b: 19                   add hl, de           ; restore backtracked cursor
0x08471c: 3a f9 05 d0          ld a, (0xd005f9)     ; OP1+1 = first name byte
0x084720: be                   cp (hl)              ; compare first name byte
0x084721: 28 09                jr z, 0x08472c       ; first byte matched
0x084723: 01 03 00 00          ld bc, 0x000003
0x084727: b7                   or a                 ; clear carry before SBC
0x084728: ed 42                sbc hl, bc           ; move back 3 more bytes
0x08472a: 18 e5                jr 0x084711          ; try previous VAT slot

0x08472c: e5                   push hl
0x08472d: 2b                   dec hl
0x08472e: 3a fa 05 d0          ld a, (0xd005fa)     ; OP1+2
0x084732: be                   cp (hl)
0x084733: 20 1c                jr nz, 0x084751      ; second byte mismatch
0x084735: 2b                   dec hl
0x084736: 3a fb 05 d0          ld a, (0xd005fb)     ; OP1+3
0x08473a: be                   cp (hl)
0x08473b: 20 14                jr nz, 0x084751      ; third byte mismatch
0x08473d: e1                   pop hl
0x08473e: 23                   inc hl
0x08473f: 46                   ld b, (hl)
0x084740: 23                   inc hl
0x084741: 56                   ld d, (hl)
0x084742: 23                   inc hl
0x084743: 5e                   ld e, (hl)
0x084744: cd 85 c8 04          call 0x04c885        ; convert stored pointer
0x084748: 23                   inc hl
0x084749: 23                   inc hl
0x08474a: 23                   inc hl
0x08474b: 7e                   ld a, (hl)
0x08474c: 32 f8 05 d0          ld (0xd005f8), a     ; OP1[0] = object type
0x084750: c9                   ret                  ; found

0x084751: e1                   pop hl
0x084752: 3a f9 05 d0          ld a, (0xd005f9)
0x084756: 18 cb                jr 0x084723          ; partial-name miss, continue scan
```

The net miss stride is:

- `call 0x082be2` => `HL -= 6`
- `sbc hl, bc` at `0x084728` => `HL -= 3`
- Total per miss iteration => **9 bytes**

### FindSym setup context `0x0846EA`

This explains why the loop range can become enormous:

```text
0x0846ea: cd 1f 01 08          call 0x08011f
0x0846ee: ca 33 38 08          jp z, 0x083833
0x0846f2: ed 5b 9d 25 d0       ld de, (0xd0259d)    ; progPtr
0x0846f7: 3a f9 05 d0          ld a, (0xd005f9)     ; OP1+1
0x0846fb: fe 24                cp 0x24              ; '$' temp-variable path?
0x0846fd: 20 0b                jr nz, 0x08470a
0x0846ff: 2a 9a 25 d0          ld hl, (0xd0259a)    ; pTemp
0x084703: ed 5b 90 25 d0       ld de, (0xd02590)    ; OPBase
0x084708: 18 04                jr 0x08470e
0x08470a: 21 ff ff d3          ld hl, 0xd3ffff      ; top of VAT
0x08470e: 13                   inc de               ; lower bound becomes base + 1
0x08470f: af                   xor a
0x084710: 47                   ld b, a
```

For non-temp names, the search starts at `HL=0xD3FFFF` and stops only when the backtracked cursor drops below `DE=progPtr+1`.

### ChkFindSym context `0x08383D`

This is the parser-side entry that drops into `FindSym`:

```text
0x08383d: cd 80 00 08          call 0x080080
0x083841: 28 0e                jr z, 0x083851
0x083843: c3 ea 46 08          jp 0x0846ea          ; generic symbol lookup -> FindSym
```

That is why ParseInp ends up in VAT search code at all: once it believes it is resolving a symbol, it naturally lands in `ChkFindSym` / `FindSym`.

## Analysis

### 1. Why ParseInp enters VAT search code

- `ParseInp` helper `0x099b18` calls `0x08383d` (`ChkFindSym`).
- `0x083843` immediately jumps into `0x0846ea` (`FindSym`) on the generic symbol path.
- So the parser is not "randomly" entering VAT logic. It is following the ordinary symbol-resolution path.
- In the phase25R probe, OP1 ended as `ff 58 00 00 00 00 00 00 00`, so the walker is trying to resolve a name whose first byte is `0x58`.

### 2. What condition exits the loop

- Success exit:
  - First-byte match at `0x084721`.
  - Remaining-name-byte checks at `0x08472e` and `0x084736`.
  - Pointer/type extraction at `0x08473e..0x08474c`.
  - Final `ret` at `0x084750`.
- Failure exit:
  - `0x08471a ret c` after `sbc hl, de`.
  - That happens once the backtracked cursor (`current - 6`) falls below the lower bound in `DE`.

### 3. Why the observed run does not exit within the probe budget

The key phase25R snapshot was:

```text
OP1 post-call [ff 58 00 00 00 00 00 00 00]
OPS/progPtr/pTemp/OPBase after: OPBase=0x000000 OPS=0xd1a877 pTemp=0x000000 progPtr=0x000000 errSP=0xd1a869 errNo=0x88
```

That means the non-temp FindSym path uses:

- Start cursor: `HL = 0xD3FFFF`
- Lower bound: `DE = progPtr + 1 = 0x000001`
- Miss stride: 9 bytes per iteration

If no matching name is found, the loop needs about:

- `1,543,737` miss iterations before `ret c`
- About `7,718,685` basic-block hits at roughly 5 blocks per miss iteration

The phase25R probe only allowed:

- `500,000` total block hits
- Roughly `100,000` miss iterations
- About `6.48%` of the full walk

So the observed tail loop is not actually an impossible infinite loop. With `progPtr=0`, it is just scanning far too much address space to finish within the budget.

### 4. Hypothesis for `errNo=0x88` without longjmp

The static evidence is strong on one point: the VAT loop itself does **not** write `errNo`.

- `0x082be2` only decrements `HL`.
- `0x084711..0x084756` only compares bytes, moves `HL`, and returns on success / lower-bound failure.
- None of those addresses stores to `0xD008DF`.
- None of those addresses jumps to `0x061DB2`.

So `errNo=0x88` has to come from outside this loop window.

The most plausible explanation is:

1. The parser has already decided the current parse state is syntactically invalid and latched `E_Syntax` (`0x88`).
2. Control then falls into symbol lookup anyway.
3. Because `progPtr=0`, `FindSym` walks almost the entire VAT address range.
4. The probe budget expires while still in VAT search, so the old syntax-error latch is still sitting in `errNo`.

In other words:

- `errNo=0x88` is real.
- The VAT loop is real.
- But they are not produced by the same tiny loop body.

This also matches a broader TI-OS pattern: `errNo` is a latch, not proof that the shared JError unwind just happened. Static ROM search in this workspace found direct `errNo` stores at multiple sites, for example:

- `0x061db2`
- `0x08a6dd`
- `0x0b3326`
- `0x08516d`
- `0x0a5d78`
- `0x0b6e59`

So "errNo is set" and "the longjmp ran" are separable facts.

## Bottom line

- `0x88` means **Syntax error** (`E_Syntax`) with the edit bit set.
- ParseInp enters VAT code because it is going through `ChkFindSym` / `FindSym` symbol resolution.
- The loop exits on full-name match or when the cursor drops below `progPtr+1`.
- In the observed probe, `progPtr=0`, so the lower bound is `0x000001` and the walk is enormous.
- The most likely explanation for `errNo=0x88` without a visible `0x061db2` unwind is: the syntax error was latched earlier, then the parser fell into a badly bounded VAT search that never finished before the probe timed out.
