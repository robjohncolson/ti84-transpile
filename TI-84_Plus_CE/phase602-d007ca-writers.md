# Phase 602 — D007CA Writer Static Analysis

## Summary

D007CA is the first field of a **21-byte context descriptor** block (D007CA-D007DE) that holds function pointers for the current application context. The outer event loop reads D007CA via `LD HL,(D007CA); JP (HL)` to dispatch to the active screen handler. For the home screen, D007CA = 0x0585E9 (cxMain).

**Key finding**: D007CA is primarily written by **LDIR block copies** (not individual LD instructions). The 19 `LD (D007CA),HL` instructions are per-handler overrides that swap the dispatch target within a context. The real "re-arm" mechanism is the context descriptor installer at **0x08C782**, which LDIR-copies a 21-byte descriptor from ROM/RAM into D007CA. This function has **39 call sites** across the OS.

## Context Descriptor Layout (D007CA-D007DE, 21 bytes)

| Offset | Address  | Field      | Home Screen Value |
|--------|----------|------------|-------------------|
| +0     | D007CA   | cxMain     | 0x0585E9          |
| +3     | D007CD   | cxPPG      | 0x058B19          |
| +6     | D007D0   | cxRedisp   | 0x058B7E          |
| +9     | D007D3   | cxSizeWin  | 0x0582BC          |
| +C     | D007D6   | cxError    | 0x058BA9          |
| +F     | D007D9   | cxApp      | 0x058C01          |
| +12    | D007DC   | flags      | 0x000000          |

Home screen descriptor stored in ROM at **0x0585D3**.

## The 19 `LD (D007CA),HL` Writers

### Cluster 1: Home Screen Key Dispatcher (0x05xxxx)

| Address  | HL Value   | After            | Context |
|----------|-----------|------------------|---------|
| 0x05CC31 | 0x05CD71  | CALL 0x0874D6; LD (D0081C),A | Key-type dispatcher at 0x05CC14. CP-based cascade: 0x27 returns, 0x09 jumps to 0x08C630, 0x4D returns, 0x1F branches, 0x5A-range falls through. Default: loads 0x05CD71 (a secondary key handler) into D007CA. This **replaces** cxMain with a mode-specific sub-handler during key processing. |

### Cluster 2: Application Context Switchers (0x06xxxx)

| Address  | HL Value   | After            | Context |
|----------|-----------|------------------|---------|
| 0x0601B4 | 0x05FFEF  | RET              | Part of app launch at ~0x060191. Installs handler 0x05FFEF then returns. Preceded by CALL 0x08C782 (descriptor install) and CALL 0x061434. |
| 0x06B432 | 0x06B4E8  | LD A,5; LD (D00813),A | Graph/statistics context switch at ~0x06B406. Installs graph handler 0x06B4E8, sets mode byte D00813=5, calls 0x06B3FC. |

### Cluster 3: Descriptor Machinery (0x080xxx)

| Address  | HL Value   | Triple Write?    | Context |
|----------|-----------|------------------|---------|
| 0x080EB7 | 0x080FB7  | +D007D0=0x081985, +D007D6=0x080DA7 | Full context setup at ~0x080E5B. Sets all three dispatch vectors. Function part of the "app descriptor" system. |
| 0x081018 | 0x0810E8  | +D007D0=0x081029 | Installs 0x0810E8 handler + redisp. RES 4,(IY+0x0C) then RET. |
| 0x081100 | 0x08149F  | +D007D0=0x0ACAA5, +D007D6=0x080DD2 | Full triple-write. Installs list/matrix editor context (0x08149F). Same target as 0x0813E0. |
| 0x0813E0 | 0x08149F  | +D007D0=0x0ACAA5, +D007D6=0x080DD2 | Identical triple-write to 0x081100. Different entry condition (CP 0x09 / CP 0x0D path at ~0x0813AC). |

### Cluster 4: Init/Setup (0x09Dxxx)

All three share the same parent function starting at ~0x09D323.

| Address  | HL Value   | After            | Context |
|----------|-----------|------------------|---------|
| 0x09D327 | 0x09D32D  | JR -0x1D (loop) | Self-referential: installs 0x09D32D (the next instruction) as D007CA, then jumps back into a BIT-test loop. This is a **setup polling loop** that keeps control until conditions are met. |
| 0x09D33D | 0x09D22C  | JP 0x09D22C      | Installs 0x09D22C (app init handler) and immediately jumps to it. Triggered when IY+0x1D bit 1 is RESET. |
| 0x09D353 | 0x09D22C  | RET; RET          | Same target (0x09D22C) but returns instead of jumping. Triggered by key code 0xDA comparison path. |

### Cluster 5: Context Manager (0x0ABxxx)

| Address  | HL Value   | Triple Write?    | Context |
|----------|-----------|------------------|---------|
| 0x0AB767 | 0x0AB83D  | No               | Context manager at ~0x0AB734 (3 callers: 0x0AB6D6, 0x0AB6E2, 0x0AB911). Installs the "default context menu handler" 0x0AB83D. Preceded by zero-fill of memory page at 0x400000. |
| 0x0AB8E7 | 0x0ABA44  | No               | Installs secondary context handler. Triggered by CP 0x08 / CP 0x04 path. 0x0ABA44 = key-type aware context handler. |
| 0x0ABA7D | 0x0AC035  | +D007D0=0x0ACBEB, +D007D6=0x0976F1 | Full triple-write. Part of a sub-function at ~0x0ABA44 (2 callers: 0x0AB6EE, 0x0AB6F4). Installs a catalog/menu browsing context. |
| 0x0ABB09 | 0x0AB83D  | No               | Same target as 0x0AB767. Context restore path at ~0x0ABAAF. Decrements D02455, then re-installs default handler. |
| 0x0ABE84 | 0x0AB83D  | +D007D0=0x0ACC03 | Installs default handler with modified redisp. Called from 0x0AB987. |

### Cluster 6: Specialized Apps (0x0Axxxx-0x0Bxxxx)

| Address  | HL Value   | Triple Write?    | Context |
|----------|-----------|------------------|---------|
| 0x0ACC8A | 0x0ACCDD  | +D007D0=0x0ACBC7, +D007D6=0x0976F1 | Full triple-write at ~0x0ACC86 (2 callers: 0x0ABA0B, 0x0ACC9F). Sub-context within catalog/menu. |
| 0x0B1D4D | 0x0B1D3B  | +D007D0=0x0B1B70 | Self-referential (0x0B1D3B = function start). Memory editor or similar. Sets D02506=0, SET 6,(IY+0x05), RES 6,(IY+0x0D). |
| 0x0B48EC | 0x0B4DAE  | No               | Part of function at ~0x0B48E6. Installs table/list view handler. Calls 0x0AD060 after. |
| 0x0B6170 | 0x0B62D8  | +D007D0=0x0ACBEB, +D007D6=0x097703 | Full triple-write at ~0x0B6153 (1 caller: 0x0B3EB0). Finance/specialized app context. |

## LDIR Block-Copy Writers (the REAL mechanism)

These are MORE important than the 19 individual writers. They copy entire descriptors into D007CA.

| Address  | Source     | Length | Context |
|----------|-----------|--------|---------|
| 0x023816 | 0x023866  | 21     | Boot/reset context install |
| 0x025106 | D007E2    | 23     | **Context RESTORE**: copies saved context from D007E2 back to D007CA. 2 callers: 0x063033, 0x09D1D7 |
| 0x025AF9 | D00185    | 21     | Restore from RAM backup at D00185 |
| 0x04ED0F | D00340    | 24     | App descriptor block copy from D00340 |
| 0x07AD3A | (D0069F)+0x105 | 22 | Indirect: reads base from D0069F, adds 0x105 offset. App-state descriptor. |
| 0x07AD56 | (D0069F)+0x105 | 22 | Same source as above, different entry. 3 callers: 0x07994E, 0x07AEDD, 0x07AF2F |
| 0x08C78A | SP+3      | 21     | **Stack-relative restore**: copies descriptor from stack frame. This is the alternate entry to the installer (0x08C776). |

### Context Descriptor Installer: 0x08C782

```
0x08C782: LD DE,0xD007CA    ; 11 CA 07 D0
0x08C786: LD BC,0x000015    ; 01 15 00 00  (21 bytes)
0x08C78A: LDIR              ; ED B0
0x08C78C: LD A,(HL)         ; 7E  (read byte after descriptor = mode flag)
0x08C78D: LD (0xD0008D),A   ; 32 8D 00 D0
0x08C791: RES 1,(IY+0x4C)   ; FD CB 4C AE
0x08C795: RET               ; C9
```

**39 call sites** across the OS. Called with HL = pointer to a 21-byte context descriptor. Copies the descriptor into D007CA-D007DE, then reads an extra byte (the 22nd) into D0008D (a mode flag). The home screen install is at:

```
0x058222: LD HL,0x0585D3    ; 21 D3 85 05  (home screen descriptor in ROM)
0x058226: CALL 0x08C782     ; CD 82 C7 08
```

Called from 0x05827E and 0x058C5B.

## D007CA Readers (16 total)

The outer loop dispatch reads D007CA at **0x08C735**:
```
0x08C72E: PUSH HL
0x08C72F: CALL 0x05622E     ; key-code-to-handler lookup
0x08C733: PUSH HL
0x08C734: LD HL,(D007CA)    ; 2A CA 07 D0
0x08C738: CALL 0x08C745     ; which is JP (HL)
         ...                 ; handler returns here
0x08C73D: LD IY,0xD00080
0x08C742: POP HL
0x08C743: POP HL
0x08C744: RET
```

0x08C745 is a single `E9` = `JP (HL)`, making the CALL+JP(HL) pattern an indirect CALL. The handler RETurns to 0x08C73D. **D007CA is NOT consumed by this read** — it stays intact for the next iteration.

## Analysis: Why D007CA Stays Zero After Key Processing

### The Zeroing Mechanism

D007CA is zeroed by a **bulk memory clear at PC 0x0018F8** (session 599 finding). This LDIR at 0x0018F8 writes zero to a large RAM range that includes D007CA:

```
0x0018F8: LD HL,0xD000FF    ; 21 FF 00 D0
0x0018FC: LD DE,0xD00100    ; 11 00 01 D0
0x001900: LD (HL),0         ; 36 00
0x001902: LDIR              ; ED B0  (clears D000FF upward)
```

This wipe runs **inside cxMain's execution path** (pinpointed at step 84,825 of the 276K-step key processing path). It is a RAM initialization sequence that the cxMain handler calls during certain operations.

### Why the 19 Writers Don't Fire

None of the 19 `LD (D007CA),HL` writers fire during key processing because:

1. **They are all context-switch operations**, not "re-arm after key" operations.
2. The normal key processing flow is: outer loop reads D007CA -> JP (HL) -> cxMain processes key -> RET -> outer loop reads D007CA again. **No re-arm is needed** because D007CA is a persistent pointer, not a one-shot vector.
3. The wipe at 0x0018F8 is the problem — it destroys D007CA inside cxMain's own call tree.

### The Real Re-Arm Path

In the real OS, D007CA would be **re-installed by the context descriptor installer (0x08C782)** after any operation that wipes RAM. The two most relevant restore mechanisms are:

1. **Context restore from D007E2** (0x0250FA/0x025106): LDIR copies 23 bytes from D007E2 (saved context backup) back to D007CA. Called from 0x063033 and 0x09D1D7.
2. **Home screen descriptor re-install** (0x058222): `LD HL,0x0585D3; CALL 0x08C782` copies the home screen descriptor from ROM into D007CA. Called from 0x05827E and 0x058C5B.

### Hypothesis

The bulk wipe at 0x0018F8 should NOT run during normal key processing in the real OS. It runs in the transpiled path because:

- The lifted code may be taking a code path that the real OS wouldn't (e.g., a cold-init branch that triggers the RAM wipe)
- OR the wipe is part of a "clear screen / reset display" operation that normally saves/restores the context descriptor around the wipe, but the save/restore pair is broken in the lifted code

**Most likely fix**: Either (a) prevent the bulk wipe from running during key dispatch by checking which code path triggers it, or (b) save D007CA before the wipe and restore it after, matching what the context restore at 0x0250FA does. The saved context at D007E2 should contain the correct descriptor if it was seeded during initialization.

## All 39 Callers of Context Installer (0x08C782)

```
0x02371B  0x025807  0x03D763  0x04EF33  0x0578E2  0x058226  0x05CBF9
0x0601A7  0x061EEA  0x06AF8A  0x06B3BF  0x06C760  0x07AD40  0x080E82
0x08A620  0x08AA51  0x08AAB7  0x08AC58  0x093328  0x09C74E  0x09C893
0x09CC2E  0x09D0D0  0x09DC40  0x09E2BA  0x0AB725  0x0AD0E2  0x0B1946
0x0B1CFB  0x0B1E65  0x0B2A0F  0x0B3ACD  0x0B4F10  0x0B6A52  0x0B7FC5
0x0B878D  0x0B8A9A  0x0BA1C5  0x0BC4C9
```

Plus 1 JP: `0x020190`
