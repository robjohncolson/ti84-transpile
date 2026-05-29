# Phase 458 - Decode 0x0067F8 Timer Check Function

## Scope

- Target function: `0x0067F8`
- Caller context requested: `0x001720-0x001730`
- ROM object passed by the caller: `0x020000`
- Relevant helper pattern:
  - `0x001C4F` advances from a tagged record header to its payload/list body
  - `0x001C33` scans a tagged list for a selector encoded in `DE`

## Caller Context

```asm
0x001720: 00                 nop
0x001721: 02                 ld (bc), a
0x001722: C5                 push bc
0x001723: CD F8 67 00        call 0x0067F8
0x001727: C1                 pop bc
0x001728: 2D                 dec l
0x001729: C9                 ret
0x00172A: 11 30 03 00        ld de, 0x000330
0x00172E: CD 55 1C 00        call 0x001C55
```

The real setup starts a few bytes earlier at `0x00171E`:

```asm
0x00171E: 01 00 00 02        ld bc, 0x020000
0x001722: C5                 push bc
0x001723: CD F8 67 00        call 0x0067F8
0x001727: C1                 pop bc
0x001728: 2D                 dec l
0x001729: C9                 ret
```

So `0x0067F8` receives the object pointer `0x020000` through the stack, returns either `HL=1` or `HL=0`, and the caller converts that into flags with `DEC L`.

## Full Function

```asm
0x0067F8: DD E5              push ix
0x0067FA: DD 21 00 00 00     ld ix, 0x000000
0x0067FF: DD 39              add ix, sp
0x006801: DD 27 06           ld hl, (ix+0x06)
0x006804: CD 4F 1C 00        call 0x001C4F
0x006808: 11 C0 80 00        ld de, 0x0080C0
0x00680C: CD 33 1C 00        call 0x001C33
0x006810: 20 12              jr nz, 0x006824
0x006812: CD 4F 1C 00        call 0x001C4F
0x006816: ED 38 03           in0 a, (0x03)
0x006819: A6                 and (hl)
0x00681A: 23                 inc hl
0x00681B: BE                 cp (hl)
0x00681C: 20 06              jr nz, 0x006824
0x00681E: 21 01 00 00        ld hl, 0x000001
0x006822: 18 04              jr 0x006828
0x006824: 21 00 00 00        ld hl, 0x000000
0x006828: DD E1              pop ix
0x00682A: C9                 ret
```

The next function starts at `0x00682B`, so the body is `0x0067F8..0x00682A`, which is `0x33` bytes total.

## Descriptor Resolution

The caller passes `0x020000`. The first `CALL 0x001C4F` advances through the object header and lands at the first list entry:

- `0x020000` bytes start: `80 0F 00 09 D6 B4 80 12 13 00 80 21 05 80 32 1D 00 80 A1 07 80 C2 01 00 ...`
- `0x001C4F` on `0x020000` skips the `0x0F` header form and leaves `HL = 0x020006`

`0x001C33` is then called with `DE = 0x80C0`, meaning:

- byte 0 must equal `0x80`
- byte 1 high nibble must equal `0xC0`

The matching entry is:

```text
0x020014: 80 C2 01 00
```

The second `CALL 0x001C4F` advances from that entry header byte `0xC2` to the payload bytes:

- payload start: `0x020016`
- mask byte: `0x01`
- expected byte: `0x00`

So the actual check is not an immediate `AND n` / `CP n`; it is data-driven:

```asm
in0 a, (0x03)
and 0x01
cp  0x00
```

## Return Semantics

`0x0067F8` returns:

- `HL = 1` if `(port 0x03 & 0x01) == 0x00`
- `HL = 0` otherwise

The caller immediately does `DEC L; RET`, so the observable flag result is:

- `HL = 1` -> `L` becomes `0x00` -> `Z = 1`
- `HL = 0` -> `L` becomes `0xFF` -> `Z = 0`, `NZ = 1`

From the event-loop side (`0x003A7D`):

```asm
0x003A7D: CD 13 17 00        call 0x001713
0x003A81: C2 33 19 00        jp nz, 0x001933
0x003A85: C3 89 3A 00        jp 0x003A89
```

That means:

- return `1` from `0x0067F8` -> caller returns `Z` -> event loop continues
- return `0` from `0x0067F8` -> caller returns `NZ` -> event loop takes the alternate `0x001933` path

## What Port 0x03 Appears To Be

This function reads **internal I/O port `0x03`** via `IN0`, not an external `IN A,(n)`.

Based on current repo evidence, port `0x03` is best treated as a **shared GPIO/system-status byte**, not as the interrupt controller itself:

- the project peripheral model registers `0x03` with `createGpioHandler(state)`
- the same file models the interrupt controller separately in the `0x5000..0x501F` range
- other ROM paths use port `0x03` bit 4 for unrelated hardware-status decisions, which also argues against `0x03` being a dedicated timer-ack register

So for this function, the safest interpretation is:

- it is polling **bit 0 of a shared hardware status register**
- in the event-loop context that bit acts as a timing/event gate
- the code does **not** prove that `0x03` is a pure timer register

## Answers

1. **How large is the function?**
   `0x33` bytes, from `0x0067F8` through `0x00682A`.

2. **Which port does it read?**
   Internal I/O port `0x03`, via `IN0 A,(0x03)`.

3. **What mask does it AND with?**
   `0x01`.

4. **What value does it compare against?**
   `0x00`.

5. **What does return value 0 vs 1 mean for the caller?**
   `1` means the check passed and the caller returns `Z`; `0` means it failed and the caller returns `NZ`.

6. **Is port 0x03 a timer status register, interrupt controller status, or something else?**
   The current evidence points to **something else**: a shared GPIO/system-status register whose bit 0 is being used here as a timing/event-ready gate.

7. **Does it acknowledge/clear any timer state, or is it purely a read?**
   It is **purely a read**. There are no `OUT`, `OUT0`, or memory-side acknowledge writes anywhere in `0x0067F8`.

## Bottom Line

`0x0067F8` is a small data-driven predicate. It resolves a descriptor under the object at `0x020000`, selects entry `80 C2 01 00`, then returns success only when **port `0x03` bit 0 is clear**. It does not clear or acknowledge hardware state; it just samples that bit and turns it into the `Z/NZ` result that `_GetCSC` uses to decide whether the event loop should continue or divert to its alternate wait path.
