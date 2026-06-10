# Phase 604: 0x0158xx Chain and 0x001872 Decode

## Scope

This phase adds `probe-phase604-0158xx-decode.mjs`, a static ROM-byte decoder for the wipe approach path found in session 603:

```text
0x0158D2 -> 0x0158DA -> 0x0158EC -> 0x0158EE -> 0x0158F8 -> 0x001872 -> 0x001879 -> 0x0018F8
```

The probe reads `TI-84_Plus_CE/ROM.rom`, treats direct 24-bit branch/call operands as little-endian ADL-mode addresses, and prints annotated disassembly for:

| Range | Purpose |
| --- | --- |
| `0x001872..0x001900` | Immediate caller path into the bulk wipe |
| `0x0158D2..0x015910` | Memory-management/flash-subsystem chain leading to `0x001872` |
| `0x0018F8..0x001970` | Entry of the bulk wipe routine itself |

## Guard Detection

The probe tags likely guard gates with `; GUARD-CANDIDATE`. These include:

- Conditional relative branches: `JR NZ`, `JR Z`, `JR NC`, `JR C`
- Conditional absolute jumps/calls: `JP cc`, `CALL cc`
- Conditional returns: `RET NZ`, `RET Z`, `RET NC`, `RET C`
- Flag-setting tests and comparisons: `CP`, `BIT`, `AND`, `OR`, `XOR`, `CPI`, `CPIR`, `CPD`, `CPDR`

This is intended to answer three specific questions once the probe is run through the watchdog wrapper:

```powershell
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase604-0158xx-decode.mjs
```

## Findings To Read From Probe Output

### `0x001872` Immediate Caller

Inspect the decode from `0x001872` through `0x0018F8`.

Key things to record from the output:

- Any `CP`, `BIT`, `AND`, `OR`, or `XOR` before the final `CALL 0x0018F8`.
- Any conditional `JR`, `JP`, `CALL`, or `RET` between `0x001872` and `0x001879`.
- Whether `0x001879` is an unconditional transfer into `0x0018F8` or a guarded call/branch.

If the only transfer into `0x0018F8` is an unconditional `CALL 0x0018F8` or `JP 0x0018F8` with no preceding `GUARD-CANDIDATE`, then `0x001872` itself does not protect the wipe. If a tagged conditional branch skips over the call, that branch is the local guard to investigate.

### `0x0158D2..0x0158F8` Chain

Inspect each entry label printed at:

- `0x0158D2`
- `0x0158DA`
- `0x0158EC`
- `0x0158EE`
- `0x0158F8`

For each entry point, record the raw bytes and mnemonic for the transfer to the next entry. A conditional `JR`, `JP`, `CALL`, or `RET` before the transition to `0x001872` is the most likely prevention point for the wipe chain.

### `0x0018F8` Bulk Wipe Entry

Inspect the first instructions at `0x0018F8`.

If the entry begins immediately with register setup and block-transfer instructions such as `LD`, `LDIR`, or unconditional jumps/calls, then the wipe routine has no entry guard. If the first basic block includes `CP`, `BIT`, logical flag-setting operations, or a conditional branch/return before the first memory-clearing stage, then the wipe routine has an internal guard that should be traced.

## Instruction Bytes

The probe prints each line in this format:

```text
0xAAAAAA  BB BB BB BB     MNEMONIC OPERANDS  ; optional guard tag
```

Use the left byte column as the canonical instruction-byte record for this phase. The disassembler intentionally keeps unknown opcodes as `DB 0xNN` rather than guessing, so unsupported eZ80-specific opcodes remain visible in the report output instead of being hidden.
