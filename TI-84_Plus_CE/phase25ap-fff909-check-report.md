# Phase 25AP - 0xFFF909 Validity Check + History Manager Trace

Generated: 2026-04-24

## Summary

- **0xFFF909 is NOT a valid ROM address.** ROM ends at 0x3FFFFF; 0xFFF909 is in unmapped eZ80 address space.
- **0xFFF909 is NOT in the transpiled block map.** It was never a transpiler seed candidate.
- **The corrupted address comes from the history manager's `ret` at 0x0922A1**, which returns through a stack frame that was corrupted by the zero-initialized history buffer.
- **The fix is not to add a transpiler seed.** The fix is to seed the history buffer at 0xD0150B with a valid entry before forcing numLastEntries=1.

## Part A: 0xFFF909 Validity

```
ROM size:       4194304 bytes (0x400000)
ROM range:      0x000000 - 0x3FFFFF
Suspect addr:   0xFFF909
In ROM range?   NO (outside ROM)
Transpiled block at 0xFFF909? NO
```

0xFFF909 is 0xBFF909 bytes past the end of ROM. It is NOT valid code. It falls in unmapped address space above the RAM region (0xD00000-0xDFFFFF is typical TI-84 CE RAM).

## Part B: History Buffer State After MEM_INIT

```
numLastEntries (0xD01D0B): 0x00 (0)
currLastEntry  (0xD01D0C): 0x00 (0)
```

The history buffer at 0xD0150B is completely zeroed after MEM_INIT (all 32 3-byte entries = 0x000000). This is correct for a fresh boot with no history.

## Part C: Full Trace of 0x0921CB with numLastEntries=1

### Setup

Forced `numLastEntries = 1` at 0xD01D0B after MEM_INIT. All other state from normal cold boot + MEM_INIT.

### Trace (42 steps to missing block)

```
step    1: 0x0921CB  A=0x00 F=0x40 HL=0x000000 BC=0x000000 DE=0x000000 SP=0xD1A86F
step    2: 0x08384B  A=0x00 F=0x40 HL=0x000000 BC=0x000000 DE=0x000000 SP=0xD1A86C
step    3: 0x07FF81  A=0x00 F=0x40 HL=0x000000 BC=0x000000 DE=0x000000 SP=0xD1A869
step    4: 0x07FF99  A=0x05 F=0x40 HL=0x000023 BC=0x000000 DE=0x000000 SP=0xD1A869
step    5: 0x04C940  A=0x05 F=0x40 HL=0x000023 BC=0x000000 DE=0x000000 SP=0xD1A866
step    6: 0x07FF9D  A=0x05 F=0x40 HL=0x000023 BC=0x000000 DE=0x000000 SP=0xD1A869
step    7: 0x08384F  A=0x05 F=0x40 HL=0x000023 BC=0x000000 DE=0x000000 SP=0xD1A86C
step    8: 0x0820CD  A=0x05 F=0x40 HL=0x000023 BC=0x000000 DE=0x000000 SP=0xD1A866
step    9: 0x0820E1  A=0x08 F=0x46 HL=0x000023 BC=0x000006 DE=0x00C600 SP=0xD1A866
step   10: 0x0820E6  A=0x01 F=0x42 HL=0x000023 BC=0x000007 DE=0x00C600 SP=0xD1A866
step   11: 0x083856  A=0x01 F=0x84 HL=0x000023 BC=0x000007 DE=0x00C601 SP=0xD1A869
step   12: 0x082BE2  A=0x00 F=0x44 HL=0xD3FFFF BC=0x000001 DE=0xD40000 SP=0xD1A866
step   13: 0x08386A  A=0x00 F=0x44 HL=0xD3FFF9 BC=0x000001 DE=0xD40000 SP=0xD1A869
step   14: 0x0838C8  A=0x00 F=0x83 HL=0xFFFFF9 BC=0x000001 DE=0xD40000 SP=0xD1A869
step   15: 0x0921CF  A=0x00 F=0x83 HL=0xFFFFF9 BC=0x000001 DE=0x000501 SP=0xD1A86F
  ^^^ Back in history manager. LD A,(0xD01D0B) -> A=1, OR A -> NZ, does NOT ret z.
step   16: 0x0921D5  A=0x01 F=0x00 HL=0xFFFFF9 BC=0x000001 DE=0x000501 SP=0xD1A86F
  ^^^ PUSH HL, PUSH DE — saves HL=0xFFFFF9, DE=0x000501
step   17: 0x080197  A=0x01 F=0x00 HL=0xFFFFF9 BC=0x000001 DE=0x000501 SP=0xD1A866
step   18: 0x04C916  A=0x01 F=0x00 HL=0x000501 BC=0x000001 DE=0xFFFFF9 SP=0xD1A860
step   19: 0x04C940  A=0xA0 F=0x00 HL=0x004FA0 BC=0x000001 DE=0xFFFFF9 SP=0xD1A860
step   20: 0x08019D  A=0xA0 F=0x00 HL=0x004FA0 BC=0x000001 DE=0xFFFFF9 SP=0xD1A863
step   21: 0x0921DB  A=0xA0 F=0x00 HL=0x004FA0 BC=0x000001 DE=0x000501 SP=0xD1A869
  ^^^ PUSH HL (pushes 0x004FA0). Then A=2, CALL 0x092FDD (index into history buffer)
step   22: 0x092FDD  A=0x02 F=0x00 HL=0x004FA0 BC=0x000001 DE=0x000501 SP=0xD1A863
  ^^^ LD HL, 0xD0150B. DEC A -> A=1, not zero. CALL 0x04C90D (read 2 bytes from HL)
step   23: 0x092FE3  A=0x01 F=0x02 HL=0xD0150B BC=0x000001 DE=0x000501 SP=0xD1A863
step   24: 0x04C90D  A=0x01 F=0x02 HL=0xD0150B BC=0x000001 DE=0x000501 SP=0xD1A860
  ^^^ LD DE,0; LD E,(HL); INC HL; LD D,(HL); INC HL; RET
  ^^^ Reads 2 bytes from 0xD0150B = 0x00,0x00 -> DE=0x0000
step   25: 0x092FE7  A=0x01 F=0x02 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A863
  ^^^ ADD HL,DE -> HL=0xD0150D+0=0xD0150D. JR 0x092FE1.
step   26: 0x092FE1  A=0x01 F=0x00 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A863
  ^^^ DEC A -> A=0, Z set. RET Z -> returns.
step   27: 0x0921E2  A=0x00 F=0x42 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A866
  ^^^ EX DE,HL. LD HL,0xD0180B. SBC HL,DE -> 0xD0180B-0xD0150D = 0x0002FE.
  ^^^ SIL SBC HL,DE (with popped DE=0x004FA0). Result negative -> JR NC not taken.
step   28: 0x0921F1  A=0x00 F=0x93 HL=0xFFB35E BC=0x000001 DE=0x004FA0 SP=0xD1A869
  ^^^ POP HL (gets 0xFFFFF9). A=1. CALL 0x09227F (RclVarToEdit with A=1)
step   29: 0x09227F  A=0x01 F=0x93 HL=0x000501 BC=0x000001 DE=0x004FA0 SP=0xD1A869
  ^^^ This is RclVarToEdit. A=1. CALL 0x092FDD again.
step   30: 0x092FDD  A=0x01 F=0x93 HL=0x000501 BC=0x000001 DE=0x004FA0 SP=0xD1A863
  ^^^ LD HL,0xD0150B. DEC A -> A=0, Z set. RET Z -> returns immediately.
step   31: 0x092284  A=0x00 F=0x43 HL=0xD0150B BC=0x000001 DE=0x004FA0 SP=0xD1A866
  ^^^ POP AF (restores earlier A). INC A. PUSH HL. CALL 0x092FDD again with A=2.
step   32: 0x092FDD  A=0x02 F=0x01 HL=0xD0150B BC=0x000001 DE=0x004FA0 SP=0xD1A863
step   33: 0x092FE3  A=0x01 F=0x03 HL=0xD0150B BC=0x000001 DE=0x004FA0 SP=0xD1A863
step   34: 0x04C90D  A=0x01 F=0x03 HL=0xD0150B BC=0x000001 DE=0x004FA0 SP=0xD1A860
  ^^^ Reads 2 bytes from 0xD0150B again = 0x00,0x00 -> DE=0x0000
step   35: 0x092FE7  A=0x01 F=0x03 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A863
step   36: 0x092FE1  A=0x01 F=0x00 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A863
  ^^^ DEC A -> A=0, Z. RET Z.
step   37: 0x09228B  A=0x00 F=0x42 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A866
  ^^^ LD DE,(0xD01508). CALL 0x04C973 (compare HL vs DE).
step   38: 0x04C973  A=0x00 F=0x42 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A863
  ^^^ PUSH HL; OR A; SBC HL,DE; POP HL; RET.
  ^^^ HL=0xD0150D, DE=0x000000 -> SBC = 0xD0150D, NZ set.
step   39: 0x092294  A=0x00 F=0x02 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A866
  ^^^ JR NZ, 0x0922A2 -> taken (NZ).
step   40: 0x0922A2  A=0x00 F=0x02 HL=0xD0150D BC=0x000001 DE=0x000000 SP=0xD1A866
  ^^^ EX DE,HL -> DE=0xD0150D, HL=0x000000.
  ^^^ LD HL,(0xD01508) -> HL=0x000000 (D01508 was never written).
  ^^^ OR A; SBC HL,DE -> 0x000000 - 0xD0150D = 0x2FEAF3 (with borrow wrapping).
  ^^^ PUSH HL; POP BC -> BC = wrapped result.
  ^^^ POP HL -> pops from stack (gets 0xD0150B, the value pushed at step 31).
  ^^^ EX DE,HL -> DE=0xD0150B, HL=0xD0150D.
  ^^^ LDIR: copy BC bytes from HL to DE. With BC = huge wrapped value, this
  ^^^        overwrites the history buffer and potentially corrupts stack/RAM.
step   41: 0x092297  A=0x00 F=0x81 HL=0x000000 BC=0x000000 DE=0xFFFFFE SP=0xD1A869
  ^^^ After LDIR completes (wrapped around), DE=0xFFFFFE.
  ^^^ LD (0xD01508),DE -> stores 0xFFFFFE at 0xD01508.
  ^^^ LD HL,0xD01D0B; DEC (HL) -> decrements numLastEntries (1->0... but corrupted to 0xFF).
  ^^^ RET -> pops return address from SP=0xD1A86C.
step   42: 0xFFF909  *** MISSING BLOCK *** (OUTSIDE ROM — corrupted address)
```

### Stack at time of missing block

```
SP=0xD1A86C:
  SP+ 0: 0xD1A86C = 0xFFFEFF
  SP+ 3: 0xD1A86F = 0xFFFFFF
  SP+ 6: 0xD1A872 = 0xFFFFFF
```

The stack is corrupted. The return address 0xFFF909 was read from 0xD1A869 (before the `ret` bumped SP to 0xD1A86C).

### Post-run state

```
numLastEntries (0xD01D0B): 0xFF  (was 1, LDIR corrupted it, then DEC made it 0xFF)
currLastEntry  (0xD01D0C): 0x00
History buffer: still all zeros (LDIR with zero source data)
```

## Part D: Root Cause Analysis

### What happens step by step

1. **0x0921CB** calls `ChkFindSym` (0x08384B) to find the history variable, then reads `numLastEntries` from 0xD01D0B.
2. Since `numLastEntries=1`, it does NOT take the `ret z` early exit.
3. It calls `0x092FDD` to index into the history buffer at 0xD0150B. The helper reads 2-byte entry sizes from the buffer. Since the buffer is all zeros, every entry has size 0.
4. It calls `0x09227F` (RclVarToEdit) with A=1 to recall entry 1.
5. RclVarToEdit calls `0x092FDD` again to find the entry, then compares the entry address against `(0xD01508)`.
6. **The critical failure**: At 0x0922A2, the code computes `BC = (0xD01508) - entryAddr`. Since 0xD01508 was never initialized (contains 0x000000) and `entryAddr` is 0xD0150D, the subtraction wraps: `0x000000 - 0xD0150D = 0x2FEAF3` (unsigned).
7. **LDIR with BC=0x2FEAF3**: This copies ~3 million bytes, wrapping around the 16 MB address space, corrupting the stack, numLastEntries, and everything else.
8. After LDIR, `DE=0xFFFFFE` (wrapped destination pointer). The code stores this at 0xD01508.
9. The `ret` at 0x0922A1 pops a corrupted return address (0xFFF909) from the destroyed stack.

### Why the address is 0xFFF909

The LDIR with a massive byte count wraps through all of memory. The bytes that happen to land at the stack return address position (0xD1A869-0xD1A86B) are whatever memory contents existed at the corresponding source offset — effectively garbage/ROM data that forms 0x09F9FF in little-endian, which is 0xFFF909.

### Is 0xFFF909 a valid ROM address?

**No.** ROM ends at 0x3FFFFF. 0xFFF909 is in unmapped address space. It is not a transpiler seed candidate.

### Can we seed the history buffer to make this path work?

**Yes.** To properly test the history-recall path, the history buffer at 0xD0150B needs to contain a valid entry. A valid setup requires:

1. **`0xD01508`** (history end pointer): Must point to the end of the last valid entry in the buffer. For example, if one 4-byte entry is stored at 0xD0150B, then `0xD01508 = 0xD0150F`.
2. **`0xD0150B`** (history buffer): Must contain a valid entry. The entry format is a 2-byte size prefix followed by the tokenized expression data. For example, for a `2+3` entry (tokens `0x32 0x70 0x33`):
   - `0xD0150B-0xD0150C`: size = 0x0003 (little-endian: `03 00`)
   - `0xD0150D-0xD0150F`: tokens = `32 70 33`
3. **`0xD01D0B`** (numLastEntries): = 1
4. **`0xD01D0C`** (currLastEntry): = 0

### What would valid seeding look like?

```javascript
// Seed a single history entry: "2+3" (tokens 0x32, 0x70, 0x33)
const tokens = [0x32, 0x70, 0x33];
const entrySize = tokens.length;

// Write size prefix (2 bytes, little-endian)
mem[0xD0150B] = entrySize & 0xFF;
mem[0xD0150C] = (entrySize >> 8) & 0xFF;

// Write token data
for (let i = 0; i < tokens.length; i++) {
  mem[0xD0150D + i] = tokens[i];
}

// Set history end pointer
write24(mem, 0xD01508, 0xD0150B + 2 + entrySize);  // 0xD01510

// Set entry count
mem[0xD01D0B] = 1;  // numLastEntries
mem[0xD01D0C] = 0;  // currLastEntry
```

This would give the history manager a valid entry to recall, and the LDIR at 0x0922AE would copy the correct number of bytes instead of wrapping around memory.

## Conclusion

**0xFFF909 is a corrupted address caused by an LDIR that wraps the entire address space.** The root cause is that forcing `numLastEntries=1` without populating the history buffer creates an impossible state: the history manager tries to recall an entry from an all-zero buffer, computes a negative/wrapped byte count for LDIR, and destroys the stack.

**Next step**: Create a probe that seeds the history buffer with a valid entry (as shown above) before forcing `numLastEntries=1`, then re-runs the ENTER handler to see if the history-recall path reaches ParseInp at 0x0586E3.

## Probes

- `TI-84_Plus_CE/probe-phase25ap-fff909-check.mjs` — main probe (Parts A-E)
- `TI-84_Plus_CE/probe-phase25ap-disasm-092297.mjs` — supplemental disassembly
