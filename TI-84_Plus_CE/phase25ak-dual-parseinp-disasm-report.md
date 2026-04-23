# Phase 25AK - Dual ParseInp disassembly report

Static ROM disassembly for `0x0973C8`, `0x0973BA`, and `0x05E872`.

Note: subagent mode for this turn required exiting immediately after patch application, so the permanent probe was not executed post-write. The console block below is the pre-write dry-run capture from the same ROM bytes and decoder logic used to build the probe.

## Findings

- `OP1[0] = 0x0E` is not a new parser-only type. `ti84pceg.inc` defines `?UndefObj := 0Eh`, so the empty-edit path is explicitly setting `OP1` to `UndefObj`.
- `0x0973C8` is an edit-buffer parser wrapper. It starts with `IsEditEmpty (0x05E3E3)`, optionally closes the dirty edit buffer through `0x0973BA -> CloseEditEqu (0x05E872)`, then either skips parsing with `OP1[0] = UndefObj` or calls `ParseInp`.
- The dual-`ParseInp` pattern is real and asymmetric:
  - `0x0973F8: call 0x099914` is the direct path.
  - `0x097402: ld hl, 0x09746E`, `0x097406: call 0x061DEF`, `0x09740A: call 0x099914`, `0x09740E: call 0x061E20` is the protected path.
- `0x097456` explains the split. It reads the current byte from `*(0xD02447)` and returns `Z` for `0x04`, `0x05`, or `0x32`. `0x04` and `0x05` match `StrngObj` and `ProgObj`; `0x32` is not an object type constant from `ti84pceg.inc`, so this gate is partly object-type driven and partly token-value driven.
- The local handler at `0x09746E` is cleanup plus rethrow, not a silent catch. It does `push af`, calls `0x0936D3`, restores `AF`, then `jp 0x061DB2 (JError)`. On the normal path the code calls `PopErrorHandler` explicitly at `0x09740E`.
- After the second `ParseInp` call there is no immediate `OP1` check. The code does `PopErrorHandler`, calls `0x0936D3`, calls `0x07D233`, then pivots to `HL = (0xD02447)` and IY flags. In the normal parse case, `OP1` is whatever `ParseInp` left behind; only the empty-edit fast path overwrites it in this function.
- `0x0973BA` and `0x05E872` do not touch `begPC`, `curPC`, or `endPC`, and they do not initialize the ParseInp token buffer. They operate on edit-buffer state around `0xD02437`, `0xD0243A`, `0xD0066F`, and `0xD00672`.
- `0x05E872` confirms the session-95 dirty-buffer hypothesis. It starts with `bit 2, (iy+1)` / `ret z`, does the close/flush work, then clears the same bit via `res 2, (iy+1)`.

## Dual ParseInp interpretation

The function at `0x0973C8` looks like a home/edit-field wrapper around `ParseInp`, not a bare parser entry. The structure is:

1. Check whether the edit buffer is empty.
2. If needed, flush/close the edit equation buffer.
3. If the field is effectively empty, set `OP1[0] = UndefObj` and skip ParseInp.
4. Otherwise, parse once directly or parse under a temporary error frame that guarantees local cleanup before any parser error is rethrown.
5. Finish with shared field cleanup centered on `0xD02447` and IY flags.

That makes the second `ParseInp` call a guarded parse for specific current-byte classes, not a retry after a failure.

## Shared helper interpretation

`0x0973BA` is a tiny pre-parse helper:

- `call 0x03FBF9`
- `bit 2, (iy+1)`
- `ret z`
- `call 0x05E872`
- `ret`

So its job is not parser-pointer setup. Its job is "run a small UI/helper routine, then if the edit buffer is dirty, close it now."

`0x05E872` supports that reading. It:

- bails out immediately when IY dirty bit 2 is clear,
- calls `BufToBtm (0x05E820)`,
- copies pointer-derived state from `0xD0243A` / `0xD02437` into `0xD00672` and through the pointer stored at `0xD0066F`,
- calls `0x08323B`,
- clears dirty bit 2,
- returns.

That is an edit-field flush/commit helper, not a token-buffer initializer.

## Home-screen path answer

`0x0973C8` is reachable from `CoorMon`, and it is clearly part of home/edit-field parsing. But the code shape does not look like the canonical plain `2+3` Enter evaluator:

- it special-cases empty edit state,
- it closes edit-buffer state before parsing,
- it branches on object/token bytes `0x04`, `0x05`, and `0x32`,
- it uses a local cleanup-and-rethrow handler around only one of the parse paths.

So the answer is:

- Yes, this is a real home-screen reachable parse wrapper.
- No, it is probably not the primary straight-line path CoorMon should use for a simple `2+3` evaluation.
- For plain home-screen Enter on `2+3`, `0x0ACC58` still looks like the stronger candidate direct `ParseInp` caller.

## Captured stdout

```text
=== func_0973C8 0x0973C8 ===
0x0973C8  CD E3 E3 05           call 0x05E3E3
0x0973CC  20 12                 jr nz, 0x0973E0
0x0973CE  CD 58 6F 09           call 0x096F58
0x0973D2  28 0C                 jr z, 0x0973E0
0x0973D4  CD BA 73 09           call 0x0973BA
0x0973D8  3E 0E                 ld a, 0x0E
0x0973DA  32 F8 05 D0           ld (0xD005F8), a
0x0973DE  18 3A                 jr 0x09741A
0x0973E0  CD BA 73 09           call 0x0973BA
0x0973E4  FD CB 05 F6           set 6, (iy+5)
0x0973E8  FD CB 01 66           bit 4, (iy+1)
0x0973EC  20 7A                 jr nz, 0x097468
0x0973EE  CD 8D FF 07           call 0x07FF8D
0x0973F2  CD 56 74 09           call 0x097456
0x0973F6  28 06                 jr z, 0x0973FE
0x0973F8  CD 14 99 09           call 0x099914
0x0973FC  18 18                 jr 0x097416
0x0973FE  CD D3 36 09           call 0x0936D3
0x097402  21 6E 74 09           ld hl, 0x09746E
0x097406  CD EF 1D 06           call 0x061DEF
0x09740A  CD 14 99 09           call 0x099914
0x09740E  CD 20 1E 06           call 0x061E20
0x097412  CD D3 36 09           call 0x0936D3
0x097416  CD 33 D2 07           call 0x07D233
0x09741A  2A 47 24 D0           ld hl, (0xD02447)
0x09741E  FD CB 05 6E           bit 5, (iy+5)
0x097422  28 44                 jr z, 0x097468
0x097424  CD 90 E2 0A           call 0x0AE290
0x097428  20 11                 jr nz, 0x09743B
0x09742A  CD 72 FF 07           call 0x07FF72
0x09742E  E5                    push hl
0x09742F  CD 4E FF 07           call 0x07FF4E
0x097433  E1                    pop hl
0x097434  7E                    ld a, (hl)
0x097435  CD 31 F1 0A           call 0x0AF131
0x097439  18 2D                 jr 0x097468
0x09743B  CD 9F 7A 09           call 0x097A9F
0x09743F  28 08                 jr z, 0x097449
0x097441  3E 06                 ld a, 0x06
0x097443  CD CD 39 02           call 0x0239CD
0x097447  20 1F                 jr nz, 0x097468
0x097449  7E                    ld a, (hl)
0x09744A  CD 56 74 09           call 0x097456
0x09744E  20 14                 jr nz, 0x097464
0x097450  CD 7A 35 09           call 0x09357A
0x097454  18 12                 jr 0x097468
0x097456  2A 47 24 D0           ld hl, (0xD02447)
0x09745A  7E                    ld a, (hl)
0x09745B  FE 04                 cp 0x04
0x09745D  C8                    ret z
0x09745E  FE 05                 cp 0x05
0x097460  C8                    ret z
0x097461  FE 32                 cp 0x32
0x097463  C9                    ret
0x097464  CD 15 A5 09           call 0x09A515
0x097468  CD 23 36 08           call 0x083623
0x09746C  18 0E                 jr 0x09747C
0x09746E  F5                    push af
0x09746F  CD D3 36 09           call 0x0936D3
0x097473  F1                    pop af
0x097474  C3 B2 1D 06           jp 0x061DB2
0x097478  FD CB 14 9E           res 3, (iy+20)
0x09747C  CD 8D FF 07           call 0x07FF8D
0x097480  CD EA 46 08           call 0x0846EA
0x097484  D4 7D 26 08           call nc, 0x08267D
0x097488  C9                    ret

=== func_0973BA 0x0973BA ===
0x0973BA  CD F9 FB 03           call 0x03FBF9
0x0973BE  FD CB 01 56           bit 2, (iy+1)
0x0973C2  C8                    ret z
0x0973C3  CD 72 E8 05           call 0x05E872
0x0973C7  C9                    ret

=== func_05E872 0x05E872 ===
0x05E872  FD CB 01 56           bit 2, (iy+1)
0x05E876  C8                    ret z
0x05E877  CD 20 E8 05           call 0x05E820
0x05E87B  2A 3A 24 D0           ld hl, (0xD0243A)
0x05E87F  22 72 06 D0           ld (0xD00672), hl
0x05E883  ED 5B 37 24 D0        ld de, (0xD02437)
0x05E888  B7                    or a
0x05E889  ED 52                 sbc hl, de
0x05E88B  EB                    ex de, hl
0x05E88C  2A 6F 06 D0           ld hl, (0xD0066F)
0x05E890  73                    ld (hl), e
0x05E891  23                    inc hl
0x05E892  72                    ld (hl), d
0x05E893  CD 3B 32 08           call 0x08323B
0x05E897  FD CB 01 96           res 2, (iy+1)
0x05E89B  C9                    ret
0x05E89C  3A 85 00 D0           ld a, (0xD00085)
0x05E8A0  EE 10                 xor 0x10
0x05E8A2  32 85 00 D0           ld (0xD00085), a
0x05E8A6  C9                    ret
0x05E8A7  2B                    dec hl
0x05E8A8  E5                    push hl
0x05E8A9  2B                    dec hl
0x05E8AA  CD 64 00 08           call 0x080064
0x05E8AE  E1                    pop hl
0x05E8AF  16 00                 ld d, 0x00
0x05E8B1  5E                    ld e, (hl)
0x05E8B2  C0                    ret nz
0x05E8B3  2B                    dec hl
0x05E8B4  56                    ld d, (hl)
0x05E8B5  C9                    ret
```
