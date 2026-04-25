# Phase 25BA - Approach B RclVarSym Diagnostic

This is a placeholder report.

`probe-phase25ba-approach-b-debug.mjs` overwrites this file with measured results when the probe is executed.

Planned scenarios:
- Scenario 1: Clear `errNo` to `0x00` after `ParseInp` and before `RclVarSym`.
- Scenario 2: Derive the VAT entry from the `CreateReal` OPBase delta, dump the surrounding 32 bytes, compare `progPtr` and `pTemp` against that entry, and retry with forced bracketing pointers.
