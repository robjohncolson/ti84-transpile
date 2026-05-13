# Phase 312: Trace Absent Certificate Fields

## Executive Summary

The OS certificate region at `0x3B0001..0x3C0000` still contains only six fields:

- `0x0330`
- `0x0340`
- `0x0350`
- `0x0B00`
- `0x0C00`
- `0x0370`

The three requested-but-absent field types behave as follows:

- `0x0C10` is an optional companion field to `0x0C00`. In this ROM it is never required for the active feature path because `0x0C00 = 00 00 00`.
- `0x0300` and `0x0230` are not boot-critical identity fields. They are handled by certificate maintenance code that deletes/replaces them if present. When they are absent, the helper simply becomes a no-op.
- No absent field causes a crash, panic, or hard error in the current ROM.
- The transpiler/emulator does not need to synthesize any of these fields. It only needs to preserve the correct "not found" behavior from `FindFirstCertField`.

## 1. `FindFirstCertField` miss contract

`FindFirstCertField` is vector `0x000310`, which jumps to `0x001C55`.

Relevant miss behavior:

- `0x001C55` starts scanning at `HL = 0x3B0001`.
- `0x001C33` walks the TLV list until either the requested type matches or the `0xFF` terminator is reached.
- On miss, `0x001C4A` loads `A = 0xFF`, executes `BIT 7,A`, and returns.
- In practice, callers test this as `NZ = not found`, `Z = found`.

All miss-path analysis below is based on that contract.

## 2. Absent field `0x0C10`

### Semantics

`0x0C10` is an optional class-list companion to the `0x0C00` device descriptor.

Evidence:

- The only consumer-side matcher is `0x042323`, which walks a comma-delimited, NUL-terminated ASCII list.
- The higher-level helper `0x0422D2` only consults `0x0C10` when `0x0C00.byte0.bit4` is set.
- `phase310-descriptor-getter-report.md` already established that `0x0C00` is the feature descriptor field.

So `0x0C10` is best understood as an optional whitelist/list-of-classes attached to the `0x0C00` descriptor.

### Direct caller: `0x0422C4`

Direct request site:

```asm
0x0422C0  ld de, 0x000c10
0x0422C4  call 0x000310
0x0422C8  ret nz
0x0422D0  cp a
0x0422D1  ret
```

Miss-path behavior:

- This helper is called from `0x042057`, inside routine `0x04203C`.
- At `0x04205B`, the caller branches `JR NZ,0x042061` on a miss.
- That skips `SET 0,(ix-10)` at `0x04205D`, which means the routine records "no `0x0C10` field present".
- The same routine still continues into the `0x0C00` lookup at `0x042061`.
- At the end, `BIT 0,(ix-10)` at `0x0420B3` fails, so `CALL NZ,0x0002EC` (`CleanupCertificate`) is skipped.

Result:

- Graceful degradation.
- The update/copy path proceeds with `0x0C00` only.
- No default value is synthesized for `0x0C10`.
- No failure is reported solely because `0x0C10` is absent.

### Direct caller: `0x042307`

Direct request site:

```asm
0x042303  ld de, 0x000c10
0x042307  call 0x000310
0x04230B  jr z, 0x042310
0x04230D  sub a
0x04230E  jr 0x04231F
```

Miss-path behavior:

- This lookup is inside helper `0x0422D2`, which implements the feature-0 branch of `0x042366`.
- If `FindFirstCertField` misses, `0x04230D` clears `A` and returns false.
- If the field is found, the code instead parses the `0x0C10` payload and runs `0x042323`, the comma-delimited list matcher.

Important qualifier:

- `0x0422D2` only reaches this `0x0C10` lookup if `0x0422FA` sees `bit 4` set in `0x0C00.byte0`.
- In this ROM, `0x0C00` payload is `00 00 00`.
- That means `byte0.bit4 = 0` and `byte1.bit2 = 0`, so the normal runtime path returns success at `0x0422FF` without ever consulting `0x0C10`.

Result:

- The miss path is a clean "feature test failed" return, not a crash.
- In this ROM it does not gate any active functionality, because the zero descriptor never reaches the `0x0C10` branch.

## 3. Absent field `0x0300`

### Semantics

`0x0300` behaves like a replaceable certificate transfer/container field, not a core boot identity field.

Evidence:

- The z80 helper at `0x006763` first verifies that the incoming structure itself starts with type `0x0300`.
- That same parent path then searches nested field `0x0400`, compares it against `boot.GetCertCalcID`, and also searches nested field `0x0230`.
- The ADL helper `0x02825A` uses `GetOffsetToNextField`, `ChkCertSpace`, `GetCertificateEnd`, and `WriteFlashUnsafe` to append a field into the main certificate region.
- The ADL helper `0x028215` deletes existing `0x0300` and `0x0230` fields before that append occurs.

So `0x0300` is best understood as an outer certificate record copied into flash when a valid model-matched payload is processed.

### Direct caller: `0x028227`

Direct request site:

```asm
0x028223  ld de, 0x000300
0x028227  call 0x000310
0x02822B  jr nz, 0x028238
```

Miss-path behavior:

- This is inside helper `0x028215`.
- On a miss, control jumps directly from `0x02822B` to `0x028238`.
- That skips:
  - `SET 0,(ix-1)` at `0x02822D`
  - `EX DE,HL`
  - `A = 0`
  - `CALL 0x0002E8` (`WriteFlashA`)
- In other words, the routine does not try to zero-mark or delete a `0x0300` field that is not there.
- It immediately proceeds to the follow-up lookup for `0x0230`.

Result:

- Graceful no-op for the `0x0300` half of the cleanup.
- No default is used.
- No error state is entered.

## 4. Absent field `0x0230`

### Semantics

`0x0230` is a subordinate field paired with the `0x0300` record.

Evidence:

- The same z80 parent path that validates a `0x0300` record later searches for a nested `0x0230` with `FindField` at `0x0281CB`.
- The delete helper `0x028215` removes `0x0230` from the main certificate region immediately after checking `0x0300`.
- The append helper `0x02825A` is used both for the outer record and for the nested `0x0230` payload.

So `0x0230` is not a standalone boot-time identity field. It is a nested or companion payload that gets copied/replaced alongside `0x0300`.

### Direct caller: `0x02823C`

Direct request site:

```asm
0x028238  ld de, 0x000230
0x02823C  call 0x000310
0x028240  jr nz, 0x02824D
```

Miss-path behavior:

- Still inside helper `0x028215`.
- On a miss, control jumps from `0x028240` to `0x02824D`.
- That skips:
  - `EX DE,HL`
  - `A = 0`
  - `CALL 0x0002E8` (`WriteFlashA`)
  - `SET 0,(ix-1)` at `0x028249`
- The final block at `0x02824D` tests the cleanup flag:
  - If neither `0x0300` nor `0x0230` was found, the flag is clear and `CALL NZ,0x0002EC` (`CleanupCertificate`) is skipped.
  - If `0x0300` had been found earlier, cleanup still runs because the flag was already set.

Result:

- Graceful no-op for the `0x0230` half of the cleanup.
- No default is used.
- No crash or explicit error on the current-cert miss path.

### Related stricter path: nested `FindField` at `0x0281CB`

This is not a `FindFirstCertField` call and therefore not the main subject of this session, but it explains the role of `0x0230`:

- The z80 parent path calls `FindField` for `0x0230` at `0x0281CB`.
- If that nested field is found, the code copies/appends it.
- If that nested field is missing, the parent path falls through `0x0281D1`, calls `0x028215`, and exits failure.

That stricter behavior applies to an incoming `0x0300` transfer record, not to the current OS certificate image.

## 5. Functional impact

### Does any absent field gate important OS functionality?

No, not in this ROM.

- `0x0C10` only matters for an optional `0x0C00` feature branch that is disabled by the current descriptor bytes `00 00 00`.
- `0x0300` and `0x0230` are part of a replace/delete/append maintenance path, not a boot-critical runtime feature path.
- Their absence only causes the cleanup helper to skip deletion and compaction.

### Crash or error behavior

- No direct `FindFirstCertField` miss among these three fields causes a crash.
- The miss behaviors are either:
  - skip optional work
  - return false from an optional feature test
  - leave cleanup flags clear so no compaction is attempted

## 6. Recommendations for transpiler/emulation

1. Do not synthesize `0x0C10`, `0x0300`, or `0x0230` for this ROM.
2. Preserve the real `FindFirstCertField` miss contract:
   - `Z` on found
   - `NZ` on not found
3. Keep `0x0C00` as the only active descriptor field. Its zero payload already disables the `0x0C10`-dependent branch.
4. Treat `0x0300` and `0x0230` as optional maintenance/update fields. Their absence should leave the delete/cleanup helpers as no-ops.

## 7. Bottom line

The three absent field types are all safe to leave absent in this ROM:

- `0x0C10` is an optional class-list companion to `0x0C00`, but current descriptor bits never require it.
- `0x0300` is a replaceable outer certificate record.
- `0x0230` is a replaceable subordinate payload associated with that record.

None of them needs to be faked for the transpiler or emulator.
