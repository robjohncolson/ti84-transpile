# Phase 571 P4: Decode 0x05E37D — Token Buffer Cursor Guard

## Scope

Fully decode the 14-byte function at 0x05E37D that precedes (and conditionally falls through into) the token byte fetcher at 0x05E38B.

## Disassembly

```
Address   Bytes              Mnemonic
0x05E37D  2A 3D 24 D0        LD HL,(0xD0243D)      ; HL = token buffer cursor
0x05E381  ED 5B 40 24 D0     LD DE,(0xD02440)      ; DE = token buffer end pointer
0x05E386  CD 73 C9 04        CALL 0x04C973         ; cpHLDE: compare HL vs DE
0x05E38A  C8                 RET Z                 ; if cursor == end, return (Z set)
                             ; else fall through into 0x05E38B (token byte fetcher)
```

**Size**: 14 bytes (0x05E37D - 0x05E38A inclusive).

## Sub-call: 0x04C973 — cpHLDE

Standard non-destructive 24-bit pointer comparison (6 bytes):

```
0x04C973  E5        PUSH HL
0x04C974  B7        OR A         ; clear carry
0x04C975  ED 52     SBC HL,DE    ; HL - DE -> sets Z if equal, C if HL < DE
0x04C977  E1        POP HL       ; restore HL
0x04C978  C9        RET
```

Returns: Z if HL == DE, NZ+NC if HL > DE, NZ+C if HL < DE. HL and DE preserved.

## Semantics

This function is a **token buffer cursor guard**. It:

1. Loads the token buffer cursor from D0243D into HL.
2. Loads the token buffer end pointer from D02440 into DE.
3. Compares them (non-destructive cpHLDE).
4. If cursor == end (buffer exhausted): returns with Z set. The caller sees Z and knows there are no more tokens.
5. If cursor != end (tokens remain): falls through into 0x05E38B, which reads the token byte at (HL) and classifies it as single-byte or multi-byte.

**Calling convention**:
- Input: none (reads D0243D and D02440 from RAM)
- Output on Z path (cursor == end): Z flag set, returns immediately
- Output on NZ path (tokens remain): falls through into 0x05E38B which returns A=E=token byte (single-byte: NZ+CF=0) or DE=2-byte token (multi-byte: NZ+CF=1), with HL = cursor pointing at the token

## RAM Addresses

| Address  | Role                    | Refs in ROM |
|----------|-------------------------|-------------|
| D0243D   | Token buffer cursor     | 104         |
| D02440   | Token buffer end pointer| 56          |
| D0243A   | Edit cursor (session 570) | 134       |
| D02437   | Edit buffer boundary (session 570) | 54 |

D0243D/D02440 are a parallel cursor/boundary pair to D0243A/D02437. The edit buffer uses D0243A/D02437; the token buffer uses D0243D/D02440. Both are 3-byte pointers in the D024xx RAM region.

## Entry Point Confirmation

The instruction immediately before 0x05E37D is `RET` at 0x05E37C, confirming 0x05E37D is a clean entry point (no fall-through from above).

## Callers (23 total)

| Address  | Type | Region |
|----------|------|--------|
| 0x020D10 | JP   | Low OS |
| 0x0225CE | CALL | Low OS |
| 0x0259C9 | CALL | Low OS |
| 0x025CFC | CALL | Low OS |
| 0x025D30 | CALL | Low OS |
| 0x025F43 | CALL | Low OS |
| 0x02660B | CALL | Low OS |
| 0x05E319 | CALL | Token module |
| 0x05E367 | CALL | Token module |
| 0x05E42E | CALL | Token module |
| 0x05E43C | CALL | Token module |
| 0x05E4AF | CALL | Token module |
| 0x05E642 | CALL | Token module |
| 0x0908EB | CALL | Editor |
| 0x090C21 | CALL | Editor |
| 0x090CE8 | CALL | Editor |
| 0x090DA9 | CALL | Editor |
| 0x091BEC | CALL | Editor |
| 0x091C53 | CALL | Editor |
| 0x091C6C | CALL | Editor |
| 0x097152 | CALL | Parser |
| 0x09CA22 | CALL | Parser |
| 0x09CA4E | CALL | Parser |

23 callers total (22 CALL + 1 JP). This makes it one of the most-called token functions, more than the token byte fetcher itself (13 callers). This is expected: callers that want to read the next token must first check whether tokens remain.

## Relationship to 0x05E38B

0x05E37D + 0x05E38B form a **guard-then-fetch pair**:

```
0x05E37D: "Is there a token to read?"   (14B, 23 callers)
0x05E38B: "Read and classify the token"  (19B, 13 callers)
```

Direct callers of 0x05E38B skip the boundary check (they already know tokens remain). Callers of 0x05E37D get both the check and the fetch.

## Artifacts

- Probe: `TI-84_Plus_CE/probe-phase571-decode-05E37D.mjs`
- Report: `TI-84_Plus_CE/phase571-report-p4.md`
