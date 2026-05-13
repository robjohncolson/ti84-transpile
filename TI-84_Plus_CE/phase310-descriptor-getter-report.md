# Phase 310 Descriptor Getter Report

## Executive summary

- `0x0421A7` is a 13-byte wrapper around the ROM certificate helpers `FindFirstCertField` (`0x000310`) and `GetFieldSizeFromType` (`0x00030C`).
- It does not build or populate a RAM descriptor table. It returns `HL` pointing at the payload of cert field `0x0C00` inside the ROM certificate region `0x3B0001..0x3C0000`.
- In this ROM, the field is present at header `0x3B0031`, payload `0x3B0033`, size `3`, bytes `00 00 00`.
- If the field is absent, the getter falls back to a static 3-byte zero stub at `0x0421BC`.
- There is no `0x0C10` field in this ROM, although one helper path knows how to look for it.

## 1. Disassembly of `0x0421A7`

```asm
0x0421A7  11 00 0C 00   ld de, 0x000C00   ; requested cert field id
0x0421AB  CD 10 03 00   call 0x000310     ; FindFirstCertField
0x0421AF  20 06         jr nz, 0x0421B7   ; miss -> fallback
0x0421B1  CD 0C 03 00   call 0x00030C     ; GetFieldSizeFromType
0x0421B5  18 04         jr 0x0421BB
0x0421B7  21 BC 21 04   ld hl, 0x0421BC   ; fallback payload
0x0421BB  C9            ret
```

Length: `13` bytes.

Register and return behavior:

- Input: no caller-supplied argument is consumed directly. The routine hardcodes `DE = 0x0C00`.
- Success path:
  - `FindFirstCertField` returns a pointer to the `0x0C00` field header.
  - `GetFieldSizeFromType` advances `HL` to the payload and returns `BC = payload size`.
  - `A` and flags are scratch.
- Miss path:
  - `HL = 0x0421BC`.
  - The fallback bytes are `00 00 00`.
- Clobbers:
  - `DE` always.
  - `HL` always.
  - `BC`, `A`, and flags on the success path.

The important correction to the original mental model is that `0x0421A7` does not use the feature index in `A`. The feature index is consumed later by `0x042366`. `0x0421A7` only resolves the current descriptor record.

## 2. What the "descriptor table" really is

`FindFirstCertField` scans the certificate block from `0x3B0001` up to `0x3C0000`. In this ROM that block contains six fields:

| Field addr | Type | Payload addr | Size |
| --- | --- | --- | --- |
| `0x3B0001` | `0x0330` | `0x3B0004` | 24 |
| `0x3B001C` | `0x0340` | `0x3B001F` | 1 |
| `0x3B0020` | `0x0350` | `0x3B0023` | 3 |
| `0x3B0026` | `0x0B00` | `0x3B0029` | 8 |
| `0x3B0031` | `0x0C00` | `0x3B0033` | 3 |
| `0x3B0036` | `0x0370` | `0x3B0038` | 3 |

End marker: `0x3B003B = 0xFF`.

So the returned "table" is not a mutable array in RAM. It is one 3-byte ROM payload:

- Field header at `0x3B0031`: `0C 03`
- Payload at `0x3B0033`: `00 00 00`

The fallback payload at `0x0421BC` is also `00 00 00`, which means the current ROM behaves the same whether the field is found or not.

### Header format

The field parser at `0x001C33` and `0x001CA6` implies this certificate format:

- `byte0`: high 8 bits of the field type
- `byte1 high nibble`: low 4 bits of the field type
- `byte1 low nibble`: payload-size encoding
  - `0x0..0xC` = inline payload size
  - `0x0D` = next byte is size
  - `0x0E` = next two bytes are size
  - `0x0F` = next three bytes are size

For `0x0C00`, `byte0 = 0x0C`, `byte1 = 0x03`, so the type is `0x0C00` and the inline payload size is `3`.

### Payload format

Observed direct consumers imply one 3-byte descriptor record:

| Byte | Observed use |
| --- | --- |
| `byte0` | Primary flag bits. `0x042366` uses bits `0,1,2,3,4,5` and the aggregate mask `byte0 & 0x3F`. |
| `byte1` | Secondary mode byte. `0x0421BF` checks bit `7` and returns low bits `0..2`. `0x0422D2` tests bit `2`. |
| `byte2` | No direct use among the six static callsites of `0x0421A7` in this ROM. Current value is `0x00`. This is an inference, not a global proof. |

In other words, the current ROM does not contain multiple descriptor entries. It contains one descriptor record whose internal bits are interpreted in different ways.

## 3. How the descriptor is populated

It is not populated at runtime.

Evidence:

- `0x0421A7` only looks up cert field `0x0C00` in the ROM certificate block.
- `FindFirstCertField` hardcodes the search window `0x3B0001..0x3C0000`.
- No code in this path writes into that region.
- The field exists in-place in the ROM image already.

What does happen at runtime is consumption:

- `0x042061` copies the 3-byte payload into a caller-owned stack/RAM buffer at `(ix+6)` by OR-ing each byte.
- `0x043768` caches the returned payload pointer into RAM at `0xD17713` and stores size `3` at `0xD17726`.

That is descriptor usage, not descriptor initialization.

## 4. How `0x0421A7` feeds `0x042366` (`setClassResult`)

`0x042366` first resolves the descriptor with `0x0421A7`, then treats the returned 3-byte payload as a feature bitfield record.

Common setup:

- `call 0x0421A7`
- `ld a, (hl)`
- `and 0x3F`
- `ld b, a`

So `B` becomes `byte0 & 0x3F`.

Feature map:

| Feature index in `A` | Behavior |
| --- | --- |
| `0` | Uses helper `0x0422D2`. If `byte1.bit2` is set, it performs an external lookup and tests mask `0x20` at offset `+0x10E`. Otherwise, if `byte0.bit4` is clear it returns true. If `byte0.bit4` is set, it optionally looks up cert field `0x0C10` and compares the caller buffer against a comma-delimited list using `0x042323`. |
| `1` | Calls `0x0421BF`. If the returned subtype is `4`, it forces success. Otherwise it tests `byte0.bit4`. |
| `2` | Tests `byte0.bit0`. |
| `3` | True when any bit in `byte0 & 0x3F` is set. |
| `4` | No explicit handler. Falls through false. |
| `5` | No explicit handler. Falls through false. |
| `6` | No explicit handler. Falls through false. |
| `7` | Tests `byte0.bit1`. |
| `8` | Tests `byte0.bit2`. |
| `9` | Tests `byte0.bit3`. |
| `10` | Tests `byte0.bit5`. |

One concrete mismatch with the prompt: the code has an explicit `A=10` case, and no explicit handling for `A=4..6`.

## 5. Other callers of `0x0421A7`

There are six static ADL-mode `CALL 0x0421A7` sites:

| Call site | Role |
| --- | --- |
| `0x029B0C` | Loads `byte0` into `B` and forwards it to `0x028A91`. |
| `0x0421BF` | Helper that returns `byte1 & 7` when `byte1.bit7` is set. |
| `0x0422DB` | Complex feature-0 helper used by `setClassResult`. |
| `0x04236A` | Main `setClassResult` entry. |
| `0x043768` | Caches the payload pointer in RAM and stores hardcoded size `3`. |
| `0x0BD3E8` | Variant helper: if `byte1.bit7` is set return `byte1 & 7`; otherwise return `8` when `byte0 & 0x3F` is nonzero, else `0`. |

So `0x0421A7` is a shared descriptor resolver, not a one-off helper for `setClassResult`.

## Conclusion

`0x0421A7` is the `0x0C00` certificate-field payload resolver. It returns a pointer to one static 3-byte ROM descriptor record at `0x3B0033`, or a zeroed fallback stub at `0x0421BC` if the field is missing. The descriptor is not written to RAM at boot. The later feature logic in `0x042366` interprets bits inside that single 3-byte record, with optional extra behavior driven by a second cert field `0x0C10` that is not present in this ROM.
