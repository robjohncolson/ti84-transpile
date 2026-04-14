# Phase 97D - Mode-Var Reader Probing

Mode buffer watch range: `0xd020a6..0xd020bf`
Adjacent watch ranges: `0xd020c0..0xd020d0`, `0xd020e0..0xd020f0`
Mode-state read watch range: `0xd00080..0xd000ff`

## Per-target summary

| Target | Variant | Term | Mode buffer writes | Mode-state reads | Final PC | Last block PC | Steps |
|---|---|---|---:|---:|---|---|---:|
| `0x0a2812` | `default` | `missing_block` | 0 | 0 | `0x0a2812` | `(none)` | 0 |
| `0x0a2812` | `hl_mode_buffer` | `missing_block` | 0 | 0 | `0x0a2812` | `(none)` | 0 |
| `0x0a2812` | `hl_mode_state` | `missing_block` | 0 | 0 | `0x0a2812` | `(none)` | 0 |
| `0x0a2812` | `de_zero` | `missing_block` | 0 | 0 | `0x0a2812` | `(none)` | 0 |
| `0x0a281a` | `default` | `missing_block` | 0 | 0 | `0x0a281a` | `(none)` | 0 |
| `0x0a281a` | `hl_mode_buffer` | `missing_block` | 0 | 0 | `0x0a281a` | `(none)` | 0 |
| `0x0a281a` | `hl_mode_state` | `missing_block` | 0 | 0 | `0x0a281a` | `(none)` | 0 |
| `0x0a281a` | `de_zero` | `missing_block` | 0 | 0 | `0x0a281a` | `(none)` | 0 |
| `0x0a29a8` | `default` | `missing_block` | 0 | 0 | `0x0a29a8` | `(none)` | 0 |
| `0x0a29a8` | `hl_mode_buffer` | `missing_block` | 0 | 0 | `0x0a29a8` | `(none)` | 0 |
| `0x0a29a8` | `hl_mode_state` | `missing_block` | 0 | 0 | `0x0a29a8` | `(none)` | 0 |
| `0x0a29a8` | `de_zero` | `missing_block` | 0 | 0 | `0x0a29a8` | `(none)` | 0 |
| `0x0a654e` | `default` | `missing_block` | 0 | 0 | `0x0a654e` | `(none)` | 0 |
| `0x0a654e` | `hl_mode_buffer` | `missing_block` | 0 | 0 | `0x0a654e` | `(none)` | 0 |
| `0x0a654e` | `hl_mode_state` | `missing_block` | 0 | 0 | `0x0a654e` | `(none)` | 0 |
| `0x0a654e` | `de_zero` | `missing_block` | 0 | 0 | `0x0a654e` | `(none)` | 0 |

## Direct callers

- `0x0a2812`: none
- `0x0a281a`: none
- `0x0a29a8`: none
- `0x0a654e`: none

## Caller-level probes

No second-level caller probes ran. The direct `CALL nn24` / `JP nn24` scan found no matches for any target.

## Per-probe details

### Target 0x0a2812

Variant `default`
Result: term=`missing_block`, finalPc=`0x0a2812`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_buffer`
Result: term=`missing_block`, finalPc=`0x0a2812`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_state`
Result: term=`missing_block`, finalPc=`0x0a2812`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `de_zero`
Result: term=`missing_block`, finalPc=`0x0a2812`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

### Target 0x0a281a

Variant `default`
Result: term=`missing_block`, finalPc=`0x0a281a`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_buffer`
Result: term=`missing_block`, finalPc=`0x0a281a`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_state`
Result: term=`missing_block`, finalPc=`0x0a281a`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `de_zero`
Result: term=`missing_block`, finalPc=`0x0a281a`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

### Target 0x0a29a8

Variant `default`
Result: term=`missing_block`, finalPc=`0x0a29a8`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_buffer`
Result: term=`missing_block`, finalPc=`0x0a29a8`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_state`
Result: term=`missing_block`, finalPc=`0x0a29a8`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `de_zero`
Result: term=`missing_block`, finalPc=`0x0a29a8`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

### Target 0x0a654e

Variant `default`
Result: term=`missing_block`, finalPc=`0x0a654e`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_buffer`
Result: term=`missing_block`, finalPc=`0x0a654e`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `hl_mode_state`
Result: term=`missing_block`, finalPc=`0x0a654e`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

Variant `de_zero`
Result: term=`missing_block`, finalPc=`0x0a654e`, lastBlockPc=`(none)`, steps=`0`
Mode buffer: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`
ASCII: `..........................`
Write events: none
Mode-state reads: none

## Verdict

No. None of the four target probes wrote to `0xD020A6..0xD020BF`, and no direct `CALL` or `JP` callers were found to run as second-level probes.
All 16 target/variant runs terminated immediately with `missing_block`, executed 0 lifted blocks, performed 0 reads from `0xD00080..0xD000FF`, and left the 26-byte mode buffer unchanged at all `0xFF` bytes.
Inference: the Phase 75 addresses are likely not callable lifted block entry points in `ROM.transpiled.js`; they may be interior instruction addresses or data references rather than runnable function starts.
