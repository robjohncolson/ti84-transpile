# Phase 90 — Direct Caller Probe

Goal: find which of the 5 callers of 0x0a29ec (= RStrCurRow) is the home screen event handler.


## Summary

| probe | drawn | fg | bg | bbox | chars | text | steps | term |
|-------|------:|---:|---:|------|------:|------|------:|------|
| caller_25b37 | 5652 | 4716 | 936 | r17-34 c0-313 | 26 | `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]` | 20751 | missing_block |
| caller_60a39 | 0 | 0 | 0 | none | 0 | `` | 2 | missing_block |
| caller_6c865 | 5652 | 4716 | 936 | r17-34 c0-313 | 26 | `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]` | 20833 | missing_block |
| caller_78f6d | 0 | 0 | 0 | none | 0 | `` | 11 | missing_block |
| caller_8847f | 5652 | 4716 | 936 | r17-34 c0-313 | 26 | `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]` | 20744 | missing_block |
| caller_5e481 | 10228 | 3756 | 6472 | r0-34 c0-319 | 22 | `il [0],#roloc,emannqe[c1][2][ef]` | 20909 | missing_block |
| caller_5e7d2 | 10228 | 3756 | 6472 | r0-34 c0-319 | 22 | `il [0],#roloc,emannqe[c1][2][ef]` | 20905 | missing_block |
| caller_9cb14 | 10444 | 3954 | 6490 | r0-34 c0-319 | 23 | `il [0],#roloc,emannqe[c1][2][ef]:` | 21702 | missing_block |
| 0a29ec_direct | 5652 | 4716 | 936 | r17-34 c0-313 | 26 | `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]` | 20742 | missing_block |
| 0a2b72_direct | 10228 | 3756 | 6472 | r0-34 c0-319 | 22 | `il [0],#roloc,emannqe[c1][2][ef]` | 20897 | missing_block |

## caller_25b37 — 5652px

Decoded text: `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]`

| col | code | char |
|-----|------|------|
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |

## caller_6c865 — 5652px

Decoded text: `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]`

| col | code | char |
|-----|------|------|
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |

## caller_8847f — 5652px

Decoded text: `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]`

| col | code | char |
|-----|------|------|
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |

## caller_5e481 — 10228px

Decoded text: `il [0],#roloc,emannqe[c1][2][ef]`

| col | code | char |
|-----|------|------|
| 0 | 0x69 | `i` |
| 0 | 0x6c | `l` |
| 0 | 0x20 | ` ` |
| 0 | 0x0 | [0] |
| 0 | 0x2c | `,` |
| 0 | 0x23 | `#` |
| 0 | 0x72 | `r` |
| 0 | 0x6f | `o` |
| 0 | 0x6c | `l` |
| 0 | 0x6f | `o` |
| 0 | 0x63 | `c` |
| 0 | 0x2c | `,` |
| 0 | 0x65 | `e` |
| 0 | 0x6d | `m` |
| 0 | 0x61 | `a` |
| 0 | 0x6e | `n` |
| 0 | 0x6e | `n` |
| 0 | 0x71 | `q` |
| 0 | 0x65 | `e` |
| 0 | 0xc1 | [c1] |
| 0 | 0x2 | [2] |
| 0 | 0xef | [ef] |

## caller_5e7d2 — 10228px

Decoded text: `il [0],#roloc,emannqe[c1][2][ef]`

| col | code | char |
|-----|------|------|
| 0 | 0x69 | `i` |
| 0 | 0x6c | `l` |
| 0 | 0x20 | ` ` |
| 0 | 0x0 | [0] |
| 0 | 0x2c | `,` |
| 0 | 0x23 | `#` |
| 0 | 0x72 | `r` |
| 0 | 0x6f | `o` |
| 0 | 0x6c | `l` |
| 0 | 0x6f | `o` |
| 0 | 0x63 | `c` |
| 0 | 0x2c | `,` |
| 0 | 0x65 | `e` |
| 0 | 0x6d | `m` |
| 0 | 0x61 | `a` |
| 0 | 0x6e | `n` |
| 0 | 0x6e | `n` |
| 0 | 0x71 | `q` |
| 0 | 0x65 | `e` |
| 0 | 0xc1 | [c1] |
| 0 | 0x2 | [2] |
| 0 | 0xef | [ef] |

## caller_9cb14 — 10444px

Decoded text: `il [0],#roloc,emannqe[c1][2][ef]:`

| col | code | char |
|-----|------|------|
| 0 | 0x69 | `i` |
| 0 | 0x6c | `l` |
| 0 | 0x20 | ` ` |
| 0 | 0x0 | [0] |
| 0 | 0x2c | `,` |
| 0 | 0x23 | `#` |
| 0 | 0x72 | `r` |
| 0 | 0x6f | `o` |
| 0 | 0x6c | `l` |
| 0 | 0x6f | `o` |
| 0 | 0x63 | `c` |
| 0 | 0x2c | `,` |
| 0 | 0x65 | `e` |
| 0 | 0x6d | `m` |
| 0 | 0x61 | `a` |
| 0 | 0x6e | `n` |
| 0 | 0x6e | `n` |
| 0 | 0x71 | `q` |
| 0 | 0x65 | `e` |
| 0 | 0xc1 | [c1] |
| 0 | 0x2 | [2] |
| 0 | 0xef | [ef] |
| 65535 | 0x3a | `:` |

## 0a29ec_direct — 5652px

Decoded text: `[ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff][ff]`

| col | code | char |
|-----|------|------|
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |
| 65535 | 0xff | [ff] |

## 0a2b72_direct — 10228px

Decoded text: `il [0],#roloc,emannqe[c1][2][ef]`

| col | code | char |
|-----|------|------|
| 0 | 0x69 | `i` |
| 0 | 0x6c | `l` |
| 0 | 0x20 | ` ` |
| 0 | 0x0 | [0] |
| 0 | 0x2c | `,` |
| 0 | 0x23 | `#` |
| 0 | 0x72 | `r` |
| 0 | 0x6f | `o` |
| 0 | 0x6c | `l` |
| 0 | 0x6f | `o` |
| 0 | 0x63 | `c` |
| 0 | 0x2c | `,` |
| 0 | 0x65 | `e` |
| 0 | 0x6d | `m` |
| 0 | 0x61 | `a` |
| 0 | 0x6e | `n` |
| 0 | 0x6e | `n` |
| 0 | 0x71 | `q` |
| 0 | 0x65 | `e` |
| 0 | 0xc1 | [c1] |
| 0 | 0x2 | [2] |
| 0 | 0xef | [ef] |