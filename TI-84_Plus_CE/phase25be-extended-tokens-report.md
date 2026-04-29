# Phase 25BE - Extended Token Verification Probe

## Date

2026-04-29T03:10:16.335Z

## Summary

- Each expression runs in a completely fresh runtime: new memory image, new executor, new peripheral bus, and a cold boot before `MEM_INIT -> ParseInp`.
- Cases passed: 4/4.
- Acceptance: return to `0x7FFFFE`, decode OP1 to the expected real value within `1e-6`, and allow `errNo` values `0x00` or `0x8D`.
- Verdict: SUCCESS.

## Matrix

| Expression | Tokens | Expected | Result | OP1 | errNo | Final PC | Parse outcome |
|:---|:---|---:|:---|:---|:---|:---|:---|
| asin(1) | `c3 31 11 3f` | 1.5707963268 | PASS | 1.5707963268 | 0x8d | 0x7ffffe | returned to 0x7ffffe |
| 10^(2) | `c1 32 11 3f` | 100 | PASS | 100 | 0x8d | 0x7ffffe | returned to 0x7ffffe |
| 5! | `35 2d 3f` | 120 | PASS | 120 | 0x8d | 0x7ffffe | returned to 0x7ffffe |
| int(3.7) | `b1 33 3a 37 11 3f` | 3 | PASS | 3 | 0x8d | 0x7ffffe | returned to 0x7ffffe |

## Console Output

```text
PASS asin(1) -> OP1=1.5707963268 expected=1.5707963268 errNo=0x8d finalPc=0x7ffffe
PASS 10^(2) -> OP1=100 expected=100 errNo=0x8d finalPc=0x7ffffe
PASS 5! -> OP1=120 expected=120 errNo=0x8d finalPc=0x7ffffe
PASS int(3.7) -> OP1=3 expected=3 errNo=0x8d finalPc=0x7ffffe
```
