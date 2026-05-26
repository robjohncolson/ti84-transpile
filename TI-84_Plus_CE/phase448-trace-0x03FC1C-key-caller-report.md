# Phase 448: Trace 0x03FC1C (GetK / key-caller wrapper)

## Summary

- `0x03FC1C` is the implementation behind the jump-table veneer at `0x020AA8` (`JP 0x03FC1C`, labeled `GetK` in `ti84pceg.inc`).
- The routine reads `0xD0058D` (`kbdGetKy`) as an index/scratch byte, not `0xD00587`.
- If `D0058D == 0`, it sets `HL = 0` and skips the table lookup.
- If `D0058D != 0`, it clears `D0058D`, loads one byte from `ROM[0x03FC41 + D0058D]`, zero-extends that byte into `HL`, then preserves that `HL` value across a call to `0x03FA09`.
- The call to `0x03FA09` is a real `CALL`, not a `JP`.
- Important correction to the earlier handoff: the lookup byte does **not** feed into `0x03FA09`. `0x03FC1C` calls `0x03FA09`, restores the looked-up `HL`, then passes that `HL` to `0x0AF8C4`, while preserving the `A` result from `0x03FA09`.
- The lookup window is not a clean standalone 64-byte table. `0x03FC41` is simultaneously the wrapper's final `RET`, and bytes after `0x03FC78` already decode as the next routine's code.

## 1. Full Function Decode

Function span: `0x03FC1C..0x03FC41` (`0x26` bytes, including the final `RET` at `0x03FC41`).

```asm
0x03FC1C  21 8D 05 D0      LD HL, 0xD0058D      ; HL = &kbdGetKy
0x03FC20  7E               LD A, (HL)           ; A = D0058D
0x03FC21  B7               OR A
0x03FC22  20 04            JR NZ, 0x03FC28      ; nonzero -> do lookup
0x03FC24  67               LD H, A              ; A==0 here
0x03FC25  6F               LD L, A              ; HL = 0
0x03FC26  18 0D            JR 0x03FC35

0x03FC28  11 00 00 00      LD DE, 0x000000      ; D = 0, E will hold index
0x03FC2C  5F               LD E, A              ; E = D0058D
0x03FC2D  72               LD (HL), D           ; D0058D = 0 (consume index)
0x03FC2E  21 41 FC 03      LD HL, 0x03FC41      ; table/sentinel base
0x03FC32  19               ADD HL, DE           ; HL = 0x03FC41 + index
0x03FC33  6E               LD L, (HL)           ; L = table byte
0x03FC34  62               LD H, D              ; H = 0, so HL = zero-extended byte

0x03FC35  E5               PUSH HL              ; preserve looked-up value
0x03FC36  CD 09 FA 03      CALL 0x03FA09        ; direct CALL to key processor
0x03FC3A  E1               POP HL               ; restore looked-up value
0x03FC3B  F5               PUSH AF              ; preserve A returned by 0x03FA09
0x03FC3C  CD C4 F8 0A      CALL 0x0AF8C4        ; consume HL, separate side path
0x03FC40  F1               POP AF               ; restore 0x03FA09 return value
0x03FC41  C9               RET
```

High-level pseudocode:

```c
uint8_t a = mem[D0058D];
uint16_t hl;

if (a == 0) {
  hl = 0;
} else {
  mem[D0058D] = 0;
  hl = rom[0x03FC41 + a];
}

push(hl);
a = call_03FA09();    // return value preserved
hl = pop();

push(af);
call_0AF8C4(hl);      // separate consumer of the table byte
af = pop();

return a;
```

## 2. What `D0058D` Holds Here

For this wrapper, `D0058D` is expected to be:

- `0x00` for "no pending compact key index"
- a nonzero compact lookup index for the `0x03FC41` ROM map

The code path itself shows this clearly:

- `0x03FC20` reads `D0058D`
- `0x03FC2D` clears `D0058D` after consuming it
- there is no arithmetic other than zero-extending `A` into `DE` and adding that to `0x03FC41`

The direct opcode scan found:

### Direct read

Only one `LD A,(0xD0058D)` site exists:

```asm
0x09CF71  SCF
0x09CF72  LD A, (0xD0058D)
0x09CF76  PUSH AF
...
0x09CFCC  POP AF
0x09CFCD  LD (0xD0058D), A
```

That pair shows `D0058D` being saved and later restored as scratch state around nested processing.

### Direct writes

The ROM has 12 direct `LD (0xD0058D),A` sites:

| Site | Role | Notes |
| --- | --- | --- |
| `0x003D55` | generic setter | low-ROM mirror of the key-ready store helper |
| `0x03FA04` | generic setter | `LD (D00587),A ; SET 3,(IY+0) ; OR A ; RET Z ; LD (D0058D),A` |
| `0x09CFCD` | restore | restores a previously saved `D0058D` value from `AF` |
| `0x028C29` | clear-to-zero | preceded by `XOR A` |
| `0x029AEF` | clear-to-zero | preceded by `XOR A` |
| `0x029C87` | clear-to-zero | preceded by `XOR A` |
| `0x058694` | clear-to-zero | preceded by `SUB A` |
| `0x05A470` | clear-to-zero | preceded by `SUB A` |
| `0x05A4F7` | clear-to-zero | preceded by `SUB A` |
| `0x05B33A` | clear-to-zero | preceded by `SUB A` |
| `0x09CC83` | clear-to-zero | preceded by `SUB A` |
| `0x09CEE3` | clear-to-zero | preceded by `SUB A` |

The two nonzero setter helpers are byte-for-byte the same pattern except for address:

```asm
0x003D4B  32 87 05 D0      LD (0xD00587), A
0x003D4F  FD CB 00 DE      SET 3, (IY+0)
0x003D53  B7               OR A
0x003D54  C8               RET Z
0x003D55  32 8D 05 D0      LD (0xD0058D), A
0x003D59  C9               RET

0x03F9FA  32 87 05 D0      LD (0xD00587), A
0x03F9FE  FD CB 00 DE      SET 3, (IY+0)
0x03FA02  B7               OR A
0x03FA03  C8               RET Z
0x03FA04  32 8D 05 D0      LD (0xD0058D), A
0x03FA08  C9               RET
```

Practical conclusion: `D0058D` is not a long-lived state register. In this path it is a consumable scratch/index byte that is written when a key becomes pending, read by `0x03FC1C`, then cleared.

## 3. The `0x03FC41` Lookup Window

### Raw 64-byte dump (`0x03FC41..0x03FC80`)

This is the exact 8x8 dump requested:

```text
0x03FC41: C9 22 18 1A 19 00 00 00
0x03FC49: 00 69 5F 55 4B 41 37 2D
0x03FC51: 00 68 5E 54 4A 40 36 2C
0x03FC59: 00 67 5D 53 49 3F 35 2B
0x03FC61: 21 66 5C 52 48 3E 34 2A
0x03FC69: 20 00 5B 51 47 3D 33 29
0x03FC71: 1F 0F 0E 0D 0C 0B 15 16
0x03FC79: 17 F5 C5 D5 CD 2B 01 04
```

### Interpretation

The raw 64-byte window is misleading if read as pure table data:

- `0x03FC41 = 0xC9` is the function's `RET`.
- `0x03FC41` also acts as the dead "slot 0" base byte, because the zero case never reaches the lookup.
- bytes after `0x03FC78` already decode as the next routine:

```asm
0x03FC79  F5               PUSH AF
0x03FC7A  C5               PUSH BC
0x03FC7B  D5               PUSH DE
0x03FC7C  CD 2B 01 04      CALL 0x04012B
```

So the live lookup region used by `0x03FC1C` is:

- sentinel/overlap byte: `0x03FC41`
- live payload bytes: `0x03FC42..0x03FC78`

In other words, this wrapper uses a compact 56-byte window rooted at `0x03FC41`, but that window is overlaid with surrounding code at both ends.

### How the lookup works

For nonzero `D0058D`:

```text
index  = D0058D
addr   = 0x03FC41 + index
value  = ROM[addr]
HL     = zero_extend(value)
```

The lookup is therefore:

```text
D0058D compact index  ->  one ROM byte  ->  HL low byte
```

Notably:

- index `0` never reaches the table
- the looked-up byte is not passed into `0x03FA09`
- the looked-up byte is preserved in `HL` for the later `CALL 0x0AF8C4`

### Compact row view of the live payload

A useful way to read the live bytes is as 7 compact rows after the dead slot-0 byte:

```text
idx 01-08 : 22 18 1A 19 00 00 00 00
idx 09-16 : 69 5F 55 4B 41 37 2D 00
idx 17-24 : 68 5E 54 4A 40 36 2C 00
idx 25-32 : 67 5D 53 49 3F 35 2B 21
idx 33-40 : 66 5C 52 48 3E 34 2A 20
idx 41-48 : 00 5B 51 47 3D 33 29 1F
idx 49-55 : 0F 0E 0D 0C 0B 15 16
```

Observations:

- several cells are explicitly `00`, so the map includes unused/invalid compact slots
- the final live byte is at `0x03FC78 = 0x16`
- `0x03FC79` is already code, so this particular lookup window stops before a clean 8th payload row

## 4. Callers of `0x03FC1C`

### Public veneer

The jump-table entry is:

```asm
0x020AA8  C3 1C FC 03      JP 0x03FC1C
```

This is the exported `GetK` veneer.

### Direct internal caller

Only one direct `CALL 0x03FC1C` site was found:

```asm
0x099CE3  CALL 0x09B5B0
0x099CE7  CALL 0x040D40
0x099CEB  CALL 0x03FC1C
0x099CEF  CALL 0x07F968
0x099CF3  CALL 0x09B107
0x099CF7  JP   0x09AF34
```

So the complete caller set is:

| Site | Kind | Notes |
| --- | --- | --- |
| `0x020AA8` | public veneer (`JP`) | exported `GetK` entry |
| `0x099CEB` | internal direct caller (`CALL`) | sits in a wait/process/postprocess chain |

No other `CALL 0x03FC1C` or `JP 0x03FC1C` sites were found by raw ROM scan.

## 5. Relationship to `0x03FA09`

The relationship is simpler and more constrained than the earlier handoff implied:

- `0x03FC1C` calls `0x03FA09` directly at `0x03FC36`
- it does **not** jump to `0x03FA09`
- it preserves the looked-up `HL` across that call with `PUSH HL` / `POP HL`
- it preserves the `A` returned by `0x03FA09` across the later `CALL 0x0AF8C4` with `PUSH AF` / `POP AF`

So the dataflow is:

```text
D0058D -> lookup byte -> HL ----+
                                +-> CALL 0x0AF8C4(HL)

D00587 / key state -> CALL 0x03FA09 -> A -> returned from 0x03FC1C
```

This means `0x03FC1C` has two separate effects:

1. it runs the foreground key-processor path at `0x03FA09`
2. it separately feeds the looked-up byte into `0x0AF8C4`

The lookup byte is **not** the input to `0x03FA09`.

## 6. Other State Accessed

Directly inside `0x03FC1C`, only one RAM byte is touched:

| Address | Access | Purpose |
| --- | --- | --- |
| `0xD0058D` | read, maybe clear | compact pending-key/scratch index |

Everything else is indirect through the callees:

- `0x03FA09` handles the `D00587` -> `D141B5` key-processing path
- `0x0AF8C4` consumes the looked-up `HL` value and mutates its own OP/scratch area

`0x03FC1C` itself does not read `D00587`, does not read `D141B5`, and does not write `D141B5`.

## Bottom Line

`0x03FC1C` is a small wrapper around two different subpaths:

- it consumes and clears `D0058D`
- it optionally looks up one byte from the compact ROM window rooted at `0x03FC41`
- it always calls `0x03FA09`
- it then calls `0x0AF8C4` with the looked-up `HL`
- it finally returns the `A` value produced by `0x03FA09`

The key correction is that the lookup byte and the `0x03FA09` call are parallel side paths, not a single "table lookup then pass result to key processor" chain.
