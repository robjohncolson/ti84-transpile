# Phase 313 `_seqcase` report

## Verdict
`_seqcase` at `0x002623` is a sequential/range switch helper, not a linear `(case_value, case_target)` scanner.

It expects the selector in `HL`, reads a 5-byte inline header from the return address, clamps `HL - base_value` into the range `0..case_count`, loads a 24-bit branch target from a packed table, rewrites the saved return address on the stack, and `ret`s into the selected case handler.

It does not use `CPIR`, does not walk a loop, and does not compare against explicit per-entry case values.

## `_seqcase` disassembly

```asm
0x002623  fd e3           ex (sp), iy
0x002625  f5              push af
0x002626  c5              push bc
0x002627  d5              push de
0x002628  ed 33 05        lea iy, iy+5
0x00262B  11 00 00 00     ld de, 0x000000
0x00262F  fd 07 fb        ld bc, (iy-5)
0x002632  59              ld e, c
0x002633  50              ld d, b
0x002634  fd 07 fd        ld bc, (iy-3)
0x002637  b7              or a
0x002638  ed 42           sbc hl, bc
0x00263A  fa 47 26 00     jp m, 0x002647
0x00263E  e5              push hl
0x00263F  b7              or a
0x002640  ed 52           sbc hl, de
0x002642  e1              pop hl
0x002643  fa 49 26 00     jp m, 0x002649
0x002647  d5              push de
0x002648  e1              pop hl
0x002649  e5              push hl
0x00264A  c1              pop bc
0x00264B  29              add hl, hl
0x00264C  09              add hl, bc
0x00264D  e5              push hl
0x00264E  c1              pop bc
0x00264F  fd 09           add iy, bc
0x002651  fd 27 00        ld hl, (iy+0)
0x002654  d1              pop de
0x002655  c1              pop bc
0x002656  f1              pop af
0x002657  fd e3           ex (sp), iy
0x002659  e3              ex (sp), hl
0x00265A  c9              ret
```

## Actual table layout

The return address pushed by `CALL _seqcase` points directly at the inline table:

```text
CALL _seqcase
.dw case_count          ; u16, little-endian
.dl base_value          ; u24, little-endian
.dl target_0            ; selector == base_value + 0
.dl target_1            ; selector == base_value + 1
...
.dl target_(count-1)    ; selector == base_value + (count - 1)
.dl default_target      ; selector < base_value or selector >= base_value + count
```

The helper treats the first two bytes as a 16-bit count, the next three bytes as a 24-bit base selector, and every table entry after that as a 24-bit code pointer.

Equivalent pseudocode:

```c
uint16_t count = read_u16(table + 0);
uint32_t base = read_u24(table + 2);
int32_t index = (int32_t)HL - (int32_t)base;

if (index < 0 || index >= count) {
  index = count;
}

uint32_t target = read_u24(table + 5 + index * 3);
return_to(target);
```

The final `ex (sp), iy` / `ex (sp), hl` / `ret` sequence proves that `_seqcase` does not return a target in `HL`; it patches the saved return address and returns directly into the chosen case body.

## Caller evidence

Most callers build the selector in `HL` immediately before the call. The common 8-bit pattern is:

```asm
ld a, (...)
or a
sbc hl, hl
ld l, a
call 0x000210    ; or call 0x002623
```

Examples:

- `0x029FA4`: `or a ; sbc hl, hl ; ld l, a ; call 0x000210`
- `0x031CBE`: `or a ; sbc hl, hl ; ld l, a ; call 0x000210`
- `0x03416F`: `ld hl, (ix-8) ; call 0x000210`
- `0x00AE63`: `ld hl, (ix-20) ; call 0x002623`

The last two sites show that the helper accepts a full 24-bit `HL` selector, not just an 8-bit value copied from `A`.

## Representative inline tables

### Caller `0x029FA8` via vector `0x000210`

```text
raw: 03 00 00 00 00 BD 9F 02 EA A0 02 1F A0 02 E7 A0 02
count = 3
base  = 0x000000
0x000000 -> 0x029FBD
0x000001 -> 0x02A0EA
0x000002 -> 0x02A01F
default  -> 0x02A0E7
```

### Caller `0x029FE5` via vector `0x000210`

```text
raw: 04 00 00 00 00 09 A0 02 EA A0 02 FD 9F 02 EA A0 02 1B A0 02
count = 4
base  = 0x000000
0x000000 -> 0x02A009
0x000001 -> 0x02A0EA
0x000002 -> 0x029FFD
0x000003 -> 0x02A0EA
default  -> 0x02A01B
```

### Caller `0x02A364` via vector `0x000210`

```text
raw: 05 00 01 00 00 7F A3 02 93 A3 02 A7 A3 02 BB A3 02 6E A4 02 E4 A3 02
count = 5
base  = 0x000001
0x000001 -> 0x02A37F
0x000002 -> 0x02A393
0x000003 -> 0x02A3A7
0x000004 -> 0x02A3BB
0x000005 -> 0x02A46E
default  -> 0x02A3E4
```

### Caller `0x031CC2` via vector `0x000210`

```text
raw: 03 00 A5 00 00 D7 1C 03 10 1D 03 E6 1C 03 E6 1C 03
count = 3
base  = 0x0000A5
0x0000A5 -> 0x031CD7
0x0000A6 -> 0x031D10
0x0000A7 -> 0x031CE6
default  -> 0x031CE6
```

### Caller `0x034172` via vector `0x000210`

```text
raw: 02 00 1F E0 00 AE 41 03 84 41 03 55 43 03
count = 2
base  = 0x00E01F
0x00E01F -> 0x0341AE
0x00E020 -> 0x034184
default  -> 0x034355
```

This site is the clearest proof that `base_value` is a real 24-bit field, not a 16-bit word.

### Caller `0x0086DF` direct to `0x002623`

```text
raw: 08 00 40 00 00 03 87 00 03 87 00 03 87 00 03 87 00 03 87 00 03 87 00 03 87 00 03 87 00 34 88 00
count = 8
base  = 0x000040
0x000040 -> 0x008703
0x000041 -> 0x008703
0x000042 -> 0x008703
0x000043 -> 0x008703
0x000044 -> 0x008703
0x000045 -> 0x008703
0x000046 -> 0x008703
0x000047 -> 0x008703
default  -> 0x008834
```

### Caller `0x008BFD` direct to `0x002623`

```text
raw: 04 00 83 00 00 15 8C 00 F7 8C 00 F7 8C 00 F7 8C 00 94 8D 00
count = 4
base  = 0x000083
0x000083 -> 0x008C15
0x000084 -> 0x008CF7
0x000085 -> 0x008CF7
0x000086 -> 0x008CF7
default  -> 0x008D94
```

### Caller `0x008F2A` direct to `0x002623`

```text
raw: 03 00 96 00 00 3F 8F 00 6A 8F 00 8D 8F 00 B7 8F 00
count = 3
base  = 0x000096
0x000096 -> 0x008F3F
0x000097 -> 0x008F6A
0x000098 -> 0x008F8D
default  -> 0x008FB7
```

### Caller `0x009C69` direct to `0x002623`

```text
raw: 04 00 00 00 00 8D 9C 00 6E 9D 00 81 9C 00 6E 9D 00 9F 9C 00
count = 4
base  = 0x000000
0x000000 -> 0x009C8D
0x000001 -> 0x009D6E
0x000002 -> 0x009C81
0x000003 -> 0x009D6E
default  -> 0x009C9F
```

## Consistency summary

| Set | Call sites | Observed `case_count` values | Observed `base_value` values | Notes |
| --- | ---: | --- | --- | --- |
| Vector `0x000210` -> `_seqcase` | 49 | `2, 3, 4, 5, 6, 8, 9, 11, 12, 13` | `0x000000, 0x000001, 0x000005, 0x000006, 0x000040, 0x000080, 0x000083, 0x000096, 0x0000A0, 0x0000A5, 0x0000C0, 0x00E01F` | All 49 parse cleanly with the same `2 + 3 + 3*(count+1)` layout |
| Direct `CALL 0x002623` | 34 | `3, 4, 5, 6, 8, 9, 11, 12, 13, 84` | `0x000000, 0x000001, 0x000006, 0x000040, 0x000083, 0x000096, 0x0000C0` | Same layout; largest observed table is `0x00AE66` with `count = 84` |

Additional observations:

- Every discovered caller is an unconditional ADL `CALL` (`CD xx xx xx`).
- All decoded targets stay inside the ROM image.
- `39/49` vector tables and `29/34` direct tables place the first case body exactly at the byte after the inline table, but that is a code-generation convenience, not a requirement.
- Repeated targets are common. The helper still treats them as separate sequential values; multiple values can intentionally share one handler.

## Conclusion

The ROM's `_seqcase` implementation is an O(1) range dispatcher:

- input selector: `HL`
- inline metadata: `u16 count`, `u24 base`
- jump entries: `count` sequential `u24` targets plus one `u24` default
- dispatch result: selected target becomes the return address

That format is consistent across the 49 vector callers from phase 312, and the 34 direct callers use the same table encoding.
