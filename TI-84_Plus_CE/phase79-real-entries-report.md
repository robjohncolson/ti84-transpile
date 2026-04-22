# Phase 79 — Real entries + 0x05e242 (= BufLeft) probe

## Real function entries (backscan to prev RET)

| target | real entry |
|--------|------------|
| 0x05e7d2 | 0x05e7cd (= DispHead) |
| 0x05e481 | 0x05e448 (= CursorLeft) |
| 0x09cb14 | 0x09cb08 |
| 0x05e242 (= BufLeft) | 0x05e1aa |

## Probe results

| entry | drawn | fg | bg | bbox | steps | term |
|-------|------:|---:|---:|------|------:|------|
| 0x05e7cd (= DispHead) | 0 | 0 | 0 | none | 0 | missing_block |
| 0x05e448 (= CursorLeft) | 0 | 0 | 0 | none | 0 | missing_block |
| 0x09cb08 | 0 | 0 | 0 | none | 0 | missing_block |
| 0x05e1aa | 0 | 0 | 0 | none | 0 | missing_block |

## ASCII Previews
