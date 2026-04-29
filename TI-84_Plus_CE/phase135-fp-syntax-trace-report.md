# Phase 135 — FP Syntax Error Trace Report

## Summary

The ERR:SYNTAX (errNo=0x88) during `gcd(12,8)` is triggered at **step 538** by the
ParseInp token dispatch table at `0x0999AE`, which performs `CP 0x29` (close paren
token) on the token value `0x29`. The comparison **matches** (`JP Z,0x099A7A`), but
`0x099A7A` unconditionally jumps to the **syntax error raiser** at `0x061D1A`.

This means: **the close-paren token `0x29` is classified as a syntax error** by
ParseInp's main dispatch table. This is by design — close parens are not valid at the
point in the parse state where this token is encountered.

## Critical Bug Confirmed

**0xD02595 is NOT errNo** — it is the high byte of the 3-byte OPS pointer
(OPS at 0xD02593/4/5). The probe confirms zero writes to OPS_HI during ParseInp,
while the real errNo at 0xD008DF receives two writes.

## errNo Write Timeline

| Step | PC | errNo | Name | Context |
|------|-------|-------|------|---------|
| 28 | 0x03E1B4 | 0x00 -> 0x8D | E_Undefined | During variable lookup for `gcd` token |
| 538 | 0x03E1B4 | 0x8D -> 0x88 | E_Syntax | Close-paren token `0x29` hit syntax error path |

## Error Chain (step 538)

```
0x0999AE: CP 0x29          ; compare current token with close-paren
0x099A7A: JP 0x061D1A       ; close-paren -> JError_Syntax (matches JP Z)
0x061D1A: LD A,0x88         ; load E_Syntax error code
0x061D24: JP 0x061DB2       ; jump to error writer
0x061DB2: LD (0xD008DF),A   ; WRITE errNo = 0x88
0x061DB6: CALL 0x03E1B4     ; JError dispatch
```

## ParseInp Token Dispatch Table (0x099990)

The dispatch table at `0x099990` is a binary-search-style comparison tree on token
values. Key entries relevant to gcd(12,8):

| Token | Value | Destination | Meaning |
|-------|-------|-------------|---------|
| `0x09` | Close-paren alt? | `0x099F68` | Handled |
| `0x11` | `)` (alternate encoding) | `0x099A7E` | Handled (non-error) |
| `0x29` | `)` close-paren | `0x099A7A` | **SYNTAX ERROR** |
| `0x2B` | `,` comma | `0x099A7E` | Handled (non-error) |
| `0x2C` | Token 0x2C | `0x099CBD` | Handled |
| `0xBB` | 2-byte token prefix | `0x09B5EA` | Handled |

**The close-paren token 0x29 is treated as a syntax error by this dispatch table.**

However, token `0x11` (also a close-paren in the TI-84 token table) routes to
`0x099A7E` which is the normal handler path. This suggests the token encoding for
close-paren in the `gcd(12,8)` input buffer may be wrong.

## Root Cause Analysis

The input tokens used are:
```
[0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x29, 0x3F]
  gcd(   12      ,     8     )     end
```

Token `0x29` for close-paren is causing the syntax error. The dispatch table shows
that `0x11` is the close-paren that gets handled properly (routes to `0x099A7E`
instead of the error path `0x099A7A`).

**Fix: Change the close-paren token from `0x29` to `0x11` in the input buffer.**

Note: The other probe (`probe-phase134-fp-clearing.mjs`) already uses `0x11` for
the close paren, confirming this is the correct encoding.

## First errNo Write (E_Undefined at step 28)

The E_Undefined error at step 28 occurs during the initial `gcd` token processing.
The trail shows: `0x082BE2 -> 0x084716 -> 0x099B1C -> 0x061D3A -> 0x061DB2 -> 0x03E1B4`.
Address `0x061D3A` loads A=0x8D (E_Undefined), meaning the OS tried to look up `gcd`
as a variable name and failed. This is expected — the `0xBB 0x07` two-byte token
triggers variable lookup before the function dispatch path recognizes it as gcd().

## Post-Error Dispatch

After errNo=0x88 is written, JError dispatch runs through `0x03E1B4` (the error
handler), which:
1. Stores A in temp location `0xD00542`
2. Saves/restores interrupt state (DI/EI via ED 0x56, 0xF3)
3. Restores SP from errSP
4. Falls into the ISR dispatch path at `0x000042` -> `0x0006F3` -> `0x001713`

The probe terminates at `0xFFFFFF` (invalid address) after the error handler
exhausts the stack unwind and hits a sentinel.

## Recommendations

1. **Immediate fix**: Change `0x29` to `0x11` in the gcd(12,8) token buffer.
   The `0x11` token is a `LD DE,nn` opcode in Z80 but in the TI-84 token table
   it represents the close-paren that ParseInp's dispatch table can handle.

2. **Validate with probe-phase134-fp-clearing.mjs**: That probe already uses
   `[0xBB, 0x18, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]` — note both the second
   byte (0x18 vs 0x07 for the gcd function ID) and the close-paren (0x11 vs 0x29)
   differ from the seeds probe.

3. **Token encoding audit**: A systematic check of which token values ParseInp
   routes to error vs normal handling would prevent future token encoding mistakes.
