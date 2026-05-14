# Phase 321: BCALL 0x1E Abort Decode Report

## Executive summary

The raw ROM disproves the phase 320 hypothesis that "BCALL 0x1E" is a deliberate abort entry.

- The TI-84 Plus CE mega-table uses 4-byte `JP target` entries, not packed 3-byte addresses.
- The claimed offset `0x02016A` is not an aligned entry. It lands in the middle of neighboring slots.
- The aligned slot for index `0x1E` relative to `0x020110` is `0x020188`, and its bytes are `C3 2F C7 08`.
- That slot jumps to `0x08C72F`, which is the named `CallMain` dispatcher, not a crash routine.
- `0x08C72F` never touches `0xD0301B` and does not reach the hard-crash handler at `0x0019B5`.
- No `CALL 0x020188` sites exist anywhere in the ROM. Internal code calls `0x08C72F` directly.
- `0xD0301B` is not an error-context pointer. It is a 24-bit sentinel slot that holds either `0x000000` or `0x5AA55A`.

The actual hard-crash paths identified in phase 320 still converge directly on `0x0019B5`. The nearby error-related mega-table entries (`SysErrHandler`, `ErrorEP`, `MonErrHand`) implement error recovery and context switching, not abort-to-halt behavior.

## 1. Mega-table entry decode

### The `0x02016A` offset is not a valid table entry

Raw bytes around the suspected region:

```text
0x020168: C3 6D C6 08    ; SysErrHandler -> 0x08C66D
0x02016C: C3 9F C7 08    ; NewContext    -> 0x08C79F
0x020170: C3 AD C7 08    ; NewContext0   -> 0x08C7AD
0x020184: C3 21 C7 08    ; ErrorEP       -> 0x08C721
0x020188: C3 2F C7 08    ; CallMain      -> 0x08C72F
0x02018C: C3 54 C7 08    ; MonErrHand    -> 0x08C754
```

Reading 3 bytes at `0x02016A` gives `C6 08 C3`, which straddles two different 4-byte table entries:

- `0x020169..0x02016B` are the last 3 bytes of `SysErrHandler`
- `0x02016C` begins the next slot (`NewContext`)

So `0x02016A` is not a decodable BCALL target.

### Correct decode of slot `0x1E`

Using the aligned BCALL-region base `0x020110`, slot `0x1E` is:

```text
0x020110 + (0x1E * 4) = 0x020188
```

Entry bytes:

```text
0x020188: C3 2F C7 08
```

Decoded:

- opcode: `JP`
- target bytes: `2F C7 08`
- target address: `0x08C72F`
- symbolic name from `references/ti84pceg.inc`: `CallMain`

Conclusion: the real mega-table entry corresponding to index `0x1E` jumps to `0x08C72F`, not to a crash stub.

## 2. Full disassembly of the target function

### `0x08C72F` (`CallMain`)

```text
0x08C72F  E5                     PUSH HL
0x08C730  CD 2E 62 05            CALL 0x05622E
0x08C734  E5                     PUSH HL
0x08C735  2A CA 07 D0            LD HL, (0xD007CA)    ; cxMain
0x08C739  CD 45 C7 08            CALL 0x08C745
0x08C73D  FD 21 80 00 D0         LD IY, 0xD00080
0x08C742  E1                     POP HL
0x08C743  E1                     POP HL
0x08C744  C9                     RET
```

Shared inner dispatch thunk used by `CallMain` and `ErrorEP`:

```text
0x08C745  E9                     JP (HL)
```

Behavior:

1. Save the incoming `HL`.
2. Call `0x05622E` to normalize the incoming event/class in `A` and `HL`.
3. Load `cxMain` from `0xD007CA`.
4. Indirect-dispatch through `JP (HL)`.
5. Restore `IY` to the standard OS base (`0xD00080`), unwind the stacked `HL` values, and return.

This is a standard CoorMon/app dispatch stub. It is not an abort routine.

## 3. Abort mechanism / relationship to `0x0019B5`

### `0x08C72F` does not abort

There is no instruction in `0x08C72F` that:

- writes `0xD0301B`
- calls `0x0019B5`
- jumps to `0x0019B5`
- disables interrupts
- performs the `OUT0 (0x00),A ; HALT` crash sequence

It simply dispatches through the `cxMain` function pointer at `0xD007CA`.

### Nearby error-related entries are recovery paths, not hard-crash paths

#### `0x08C66D` (`SysErrHandler`)

```text
0x08C66D  ED 7B FA 07 D0         LD SP, (0xD007FA)    ; onSP
0x08C672  3E 52                  LD A, 0x52
0x08C674  CD 9F C7 08            CALL 0x08C79F        ; NewContext
0x08C678  C3 3D C3 08            JP 0x08C33D          ; back into CoorMon
```

This restores `SP` from `onSP`, selects app/context `0x52`, and re-enters CoorMon. No crash.

#### `0x08C721` (`ErrorEP`)

```text
0x08C721  2A D6 07 D0            LD HL, (0xD007D6)    ; cxErrorEP
0x08C725  CD 45 C7 08            CALL 0x08C745        ; JP (HL)
0x08C729  FD 21 80 00 D0         LD IY, 0xD00080
0x08C72E  C9                     RET
```

This dispatches through the current app's error-entry pointer in `cxErrorEP`. No crash.

#### `0x08C754` (`MonErrHand`)

```text
0x08C754  21 54 C7 08            LD HL, 0x08C754
0x08C758  CD EF 1D 06            CALL 0x061DEF        ; PushErrorHandler
0x08C75C  3E 52                  LD A, 0x52
0x08C75E  CD AD C7 08            CALL 0x08C7AD        ; NewContext0
0x08C762  C3 3D C3 08            JP 0x08C33D
```

This is the only nearby entry that installs a structured error-unwind frame, but it does so through `PushErrorHandler` / `errSP` at `0xD008E0`, not through `0xD0301B`. It then re-enters CoorMon. No crash.

### Bottom line

The aligned mega-table slot `0x020188 -> 0x08C72F` is not an abort mechanism and does not reach `0x0019B5`. The phase 320 "BCALL 0x1E crash" interpretation appears to have confused a low-ROM crash stub (`0x0003AC -> 0x0019B5`) with the real aligned mega-table slot.

## 4. Caller analysis

### Search for `CALL` / `JP` to the mega-table slot itself

Exact ROM byte scans:

- `CALL 0x020188` (`CD 88 01 02`): 0 hits
- `JP 0x020188` (`C3 88 01 02`): 0 hits

So the ROM never calls the table slot directly. Internal code calls the implementation (`0x08C72F`) directly.

### Direct internal uses of `0x08C72F`

#### `CALL` sites

| Address | Context | Surrounding evidence |
| --- | --- | --- |
| `0x04EA9E` | Special event/class dispatch path | `CP 0x29`, `SET 1,(IY+29)`, `LD A,0x7F`, `CALL 0x08C72F`, then `CALL 0x08C41D`, `RET` |
| `0x08C439` | CoorMon notification dispatch | `CALL 0x05C5B3`, `CALL 0x08C72F`, `RES 4,(IY+9)`, loop back to `0x08C331` |
| `0x08C536` | CoorMon main key dispatch | key-classification/token staging tail: `CALL 0x022331`, `CALL 0x08C72F`, then post-dispatch flag and branch handling |

#### `JP` / tail-call sites

| Address | Context | Surrounding evidence |
| --- | --- | --- |
| `0x058776` | Home-app local handler tail-jump back into `CallMain` | phase 300 notes this site as "tail-jump back into CallMain"; immediate setup is `CALL 0x08C79F`, `LD A,0x44`, `JP 0x08C72F` |
| `0x0AB9BE` | Fallback side-entry into dispatcher | reached from `0x0AB9B3: JR NZ,0x0AB9BE` after `CP 0x43`; local static window does not expose the higher-level operation name |
| `0x0AF652` | Pure trampoline into dispatcher | reached by `0x0AF60A: CALL 0x0AF652` with `A=0x05`, and by `0x021964: JP 0x0AF652` |

None of these sites look like crash setup. All of them treat `0x08C72F` as a live dispatcher.

## 5. Error context format: what does `0xD0301B` actually hold?

### Observed writers

#### Store sentinel `0x5AA55A`

```text
0x040BF0  21 5A A5 5A            LD HL, 0x5AA55A
0x040BF4  22 1B 30 D0            LD (0xD0301B), HL

0x040C62  21 5A A5 5A            LD HL, 0x5AA55A
0x040C66  22 1B 30 D0            LD (0xD0301B), HL
```

#### Clear to zero

```text
0x00086B  21 00 00 00            LD HL, 0x000000
0x00086F  22 1B 30 D0            LD (0xD0301B), HL

0x001418  21 00 00 00            LD HL, 0x000000
0x00141C  22 1B 30 D0            LD (0xD0301B), HL

0x001B02  21 00 00 00            LD HL, 0x000000
0x001B06  22 1B 30 D0            LD (0xD0301B), HL

0x0141A8  21 00 00 00            LD HL, 0x000000
0x0141AE  22 1B 30 D0            LD (0xD0301B), HL
```

### Observed readers

#### 24-bit compare against `0x5AA55A`

```text
0x0018E0  2A 1B 30 D0            LD HL, (0xD0301B)
0x0018E4  11 5A A5 5A            LD DE, 0x5AA55A
0x0018E8  ED 52                  SBC HL, DE
0x0018EA  20 95                  JR NZ, 0x001881
```

#### Bytewise compare against `5A A5 5A`

```text
0x0402BB  3A 1B 30 D0            LD A, (0xD0301B)
0x0402BF  FE 5A                  CP 0x5A
0x0402C1  20 12                  JR NZ, 0x0402D5
0x0402C3  3A 1C 30 D0            LD A, (0xD0301C)
0x0402C7  FE A5                  CP 0xA5
0x0402C9  20 0A                  JR NZ, 0x0402D5
0x0402CB  3A 1D 30 D0            LD A, (0xD0301D)
0x0402CF  FE 5A                  CP 0x5A
0x0402D1  CA 9B 03 04            JP Z, 0x04039B
```

### Real format

`0xD0301B` is a 3-byte slot, not a pointer:

| Offset | Meaning |
| --- | --- |
| `+0` | low byte: `0x5A` or `0x00` |
| `+1` | mid byte: `0xA5` or `0x00` |
| `+2` | high byte: `0x5A` or `0x00` |

Observed values:

- valid sentinel: `0x5AA55A`
- cleared state: `0x000000`

There is no evidence of:

- pointer dereference through this value
- field extraction from a larger structure
- length/count fields
- backtrace or error-record storage

Interpretation: `0xD0301B` is a 24-bit sentinel or watchdog cookie used by early init / RAM-clear gating, not an error-context structure.

## 6. Relationship to the direct `0x0019B5` crash paths

Phase 320's direct crash findings still stand:

- direct `JP 0x0019B5` sites: `0x0003AC`, `0x000873`, `0x001420`, `0x001BA8`
- direct `CALL 0x0019B5` sites: `0x0094F7`, `0x0099A3`, `0x0099B8`, `0x00F3FB`, `0x01401A`, `0x0141B3`, `0x0149D2`, `0x0149ED`, `0x015110`

Those paths are true non-return hard crashes:

```text
0x0019B5  F3           DI
0x0019B6  3E 10        LD A,0x10
0x0019B8  ED 39 00     OUT0 (0x00),A
0x0019BD  76           HALT
```

### What changed relative to phase 320

- Clearing `0xD0301B` before some crash sites no longer looks like "clear error context".
- With the new evidence, it means "invalidate the `0x5AA55A` sentinel" before halting.
- The actual structured error machinery is elsewhere:
  - `errNo` at `0xD008DF`
  - `errSP` at `0xD008E0`
  - `JError` convergence at `0x061DB2`
  - `PushErrorHandler` at `0x061DEF`
  - app-specific error dispatch through `cxErrorEP` at `0xD007D6`

### Final comparison

| Path type | Mechanism | Uses `0xD0301B`? | Uses `errSP` / `errNo`? | Reaches `0x0019B5`? |
| --- | --- | --- | --- | --- |
| `CallMain` (`0x020188 -> 0x08C72F`) | app main dispatch | no | no | no |
| `ErrorEP` / `MonErrHand` | structured error recovery / context reset | no | yes | no |
| direct crash sites from phase 320 | immediate panic / hardware halt | sometimes clears it to `0` | no | yes |

So BCALL slot `0x1E` is not a "clean abort with error context." The ROM instead shows a clear split:

- structured recoverable errors: `JError` / `PushErrorHandler` / `ErrorEP`
- unrecoverable panic crashes: direct `JP` / `CALL 0x0019B5`

## Final conclusion

The requested BCALL `0x1E` decode resolves to `CallMain`, not to an abort routine. The phase 320 abort hypothesis is not supported by the ROM bytes.

If a future session wants the actual programmatic error/abort path, the next candidates to analyze are:

1. the low-ROM crash stub at `0x0003AC`
2. `SysErrHandler` / `MonErrHand` / `ErrorEP` as the real error-entry family
3. the `JError` / `PushErrorHandler` unwind machinery at `0x061DB2` / `0x061DEF`

