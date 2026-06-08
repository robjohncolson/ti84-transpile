# Phase 571 P3: Decode 0x05E3EC Boundary Check Helper

## Summary

`0x05E3EC` is a **9-byte, 2-instruction** helper. It loads the edit-buffer boundary pointer from RAM address `0xD02437` into `DE`, then tail-calls `0x04C973` (the HL vs DE compare helper).

## Full Decode

| Address | Bytes | Instruction | Notes |
|---------|-------|-------------|-------|
| `0x05E3EC` | `ED 5B 37 24 D0` | `LD DE,(0xD02437)` | Load boundary pointer |
| `0x05E3F1` | `C3 73 C9 04` | `JP 0x04C973` | Tail-call compare helper |

- **Byte count**: 9 bytes (0x05E3EC - 0x05E3F4)
- **Instruction count**: 2

## RAM References

- **Reads**: `0xD02437` -- edit buffer boundary pointer

## Compare Helper 0x04C973 (6 bytes)

| Address | Bytes | Instruction | Notes |
|---------|-------|-------------|-------|
| `0x04C973` | `E5` | `PUSH HL` | Save HL |
| `0x04C974` | `B7` | `OR A` | Clear carry for clean SBC |
| `0x04C975` | `ED 52` | `SBC HL,DE` | HL - DE, sets Z if equal, CF if HL < DE |
| `0x04C977` | `E1` | `POP HL` | Restore HL (flags unaffected) |
| `0x04C978` | `C9` | `RET` | Return with flags |

This is a non-destructive compare: HL is preserved, only flags are affected. **134 callers** across the ROM.

## Calling Convention

**Entry**:
- `HL` = pointer to compare against boundary

**Exit** (via 0x04C973):
- `Z` flag: set if HL == boundary (HL == [D02437])
- `CF` flag: set if HL < boundary
- `HL` preserved (PUSH/POP in compare helper)
- `DE` = boundary pointer from (0xD02437)

## Callers (9 total, all unconditional CALL)

| Address | Type | Context |
|---------|------|---------|
| `0x025B63` | CALL | After DEC HL; checks if decremented pointer hit boundary |
| `0x05E248` | CALL | After DEC HL; same pattern as 0x025B63 |
| `0x05E6B8` | CALL | After DEC HL; same backward-scan boundary check |
| `0x05E6E5` | CALL | First check before DEC HL; boundary pre-check |
| `0x05E6ED` | CALL | After DEC HL from 0x05E6E5's continuation |
| `0x06A178` | CALL | Push DE, boundary check, POP DE; size calculation context |
| `0x08D32D` | CALL | After DEC HL; token scan with CP 0x26/0x2A context |
| `0x08DD64` | CALL | **0x08DD60 token backward reader** (session 570) |
| `0x08DD6F` | CALL | Second boundary check inside 0x08DD60 after DEC HL |

### Common Caller Pattern

Most callers (7 of 9) follow this idiom:
```
DEC HL               ; step backward
CALL 0x05E3EC        ; check if HL hit boundary
LD D,0x00            ; prep D=0 for single-byte token
JR Z, <skip>         ; if at boundary, skip multi-byte check
```

## Sibling Functions (neighboring context)

The 0x05E3EC function sits in a cluster of similar compare-wrappers:

| Address | Loads | Compares Against | Pattern |
|---------|-------|-----------------|---------|
| `0x05E3D6` | HL from (0xD0243A), DE from (0xD0243D) | Cursor vs end-of-selection | JP 0x04C973 |
| `0x05E3E8` | HL from (0xD0243A) | (reuses HL already loaded) | Falls into 0x05E3EC |
| **`0x05E3EC`** | **DE from (0xD02437)** | **HL (entry) vs boundary** | **JP 0x04C973** |
| `0x05E3F5` | DE from (0xD0243D), HL from (0xD02440) | End-selection vs buffer-end | JP 0x04C973 |

Note: `0x05E3E3` calls `0x05E3F5` then falls through to `0x05E3E8` which falls into `0x05E3EC`, creating a chain of boundary checks.

## Probe

- `TI-84_Plus_CE/probe-phase571-decode-05E3EC.mjs`
- Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase571-decode-05E3EC.mjs`
- **Status**: PASS (exit 0)
