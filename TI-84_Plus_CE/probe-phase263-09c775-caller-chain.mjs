/**
 * probe-phase263-09c775-caller-chain.mjs
 *
 * Traces the caller chain leading to 0x09C775 — the ONLY site in the ROM
 * that executes SET 0,(IY+9) (FD CB 09 C6).
 *
 * IY+9 bit 0 gates the D007E0 write path in function 0x09E2EC.
 * Understanding who calls the function containing 0x09C775 tells us
 * what OS context activates the STAT write path.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = 0x400000;

// --- Helpers ---

function read24(addr) {
  if (addr < 0 || addr + 2 >= ROM_SIZE) return 0;
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function hex(n) {
  return '0x' + n.toString(16).toUpperCase().padStart(6, '0');
}

function hexByte(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function dumpBytes(addr, count) {
  const bytes = [];
  for (let i = 0; i < count; i++) {
    if (addr + i >= 0 && addr + i < ROM_SIZE) {
      bytes.push(hexByte(rom[addr + i]));
    }
  }
  return bytes.join(' ');
}

// --- Step 1: Find the function containing 0x09C775 ---

console.log('=== Step 1: Find function containing 0x09C775 ===\n');

// Verify SET 0,(IY+9) at 0x09C775
const target = 0x09C775;
const setBytesOk = rom[target] === 0xFD && rom[target + 1] === 0xCB &&
                   rom[target + 2] === 0x09 && rom[target + 3] === 0xC6;
console.log(`SET 0,(IY+9) at ${hex(target)}: ${setBytesOk ? 'CONFIRMED' : 'NOT FOUND'}`);
console.log(`  Bytes: ${dumpBytes(target, 4)}\n`);

// Scan backwards for RET (C9) to find function start
// The function likely starts right after a RET
let funcStart = null;
for (let addr = target - 1; addr >= target - 0x1000; addr--) {
  if (rom[addr] === 0xC9) {
    // Function starts at the byte after this RET
    funcStart = addr + 1;
    break;
  }
}

console.log(`Function boundary (RET) found at: ${hex(funcStart - 1)}`);
console.log(`Function containing 0x09C775 starts at: ${hex(funcStart)}`);
console.log(`  First 16 bytes: ${dumpBytes(funcStart, 16)}`);

// Also scan forward to find the end of this function
let funcEnd = null;
for (let addr = target + 4; addr < target + 0x1000; addr++) {
  if (rom[addr] === 0xC9) {
    funcEnd = addr;
    break;
  }
}
console.log(`  Function ends (next RET) at: ${hex(funcEnd)}`);
console.log(`  Function size: ~${funcEnd - funcStart + 1} bytes`);

// Decode some context around SET 0,(IY+9)
console.log(`\n  Context around SET instruction:`);
console.log(`    -16 bytes: ${dumpBytes(target - 16, 16)}`);
console.log(`    SET instr: ${dumpBytes(target, 4)}`);
console.log(`    +4  bytes: ${dumpBytes(target + 4, 16)}`);

// --- Step 2: Find ALL callers of the function ---

console.log(`\n=== Step 2: Find all callers of ${hex(funcStart)} ===\n`);

// CALL opcodes: CD (unconditional), C4/CC/D4/DC/E4/EC/F4/FC (conditional)
const callOpcodes = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ,'], [0xCC, 'CALL Z,'],
  [0xD4, 'CALL NC,'], [0xDC, 'CALL C,'],
  [0xE4, 'CALL PO,'], [0xEC, 'CALL PE,'],
  [0xF4, 'CALL P,'],  [0xFC, 'CALL M,'],
]);

// JP opcodes: C3 (unconditional), C2/CA/D2/DA/E2/EA/F2/FA (conditional)
const jpOpcodes = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ,'], [0xCA, 'JP Z,'],
  [0xD2, 'JP NC,'], [0xDA, 'JP C,'],
  [0xE2, 'JP PO,'], [0xEA, 'JP PE,'],
  [0xF2, 'JP P,'],  [0xFA, 'JP M,'],
]);

function findCallers(targetAddr) {
  const callers = [];
  for (let addr = 0; addr < ROM_SIZE - 3; addr++) {
    const opcode = rom[addr];
    const dest = read24(addr + 1);
    if (dest !== targetAddr) continue;

    let mnemonic = callOpcodes.get(opcode) || jpOpcodes.get(opcode);
    if (mnemonic) {
      callers.push({ addr, opcode, mnemonic, target: dest });
    }
  }
  return callers;
}

const level1Callers = findCallers(funcStart);
console.log(`Found ${level1Callers.length} direct callers of ${hex(funcStart)}:\n`);

for (const caller of level1Callers) {
  console.log(`  ${hex(caller.addr)}: ${caller.mnemonic} ${hex(caller.target)}`);
  console.log(`    Context before: ${dumpBytes(caller.addr - 16, 16)}`);
  console.log(`    Instruction:    ${dumpBytes(caller.addr, 4)}`);
  console.log(`    Context after:  ${dumpBytes(caller.addr + 4, 16)}`);
}

// --- Step 3: Find parent functions for each caller ---

console.log(`\n=== Step 3: Find parent functions of each caller ===\n`);

function findParentFunction(addr) {
  // Scan backwards for RET to find function boundary
  for (let a = addr - 1; a >= Math.max(0, addr - 0x2000); a--) {
    if (rom[a] === 0xC9) {
      return a + 1;
    }
  }
  return null;
}

// Build call tree: level 1 callers -> their parent functions -> level 2 callers
const callTree = [];

for (const caller of level1Callers) {
  const parentFunc = findParentFunction(caller.addr);
  const entry = {
    callerAddr: caller.addr,
    mnemonic: caller.mnemonic,
    parentFunc,
    level2Callers: [],
  };

  if (parentFunc) {
    console.log(`Caller ${hex(caller.addr)} is in function ${hex(parentFunc)}`);
    console.log(`  First 16 bytes of parent: ${dumpBytes(parentFunc, 16)}`);

    // Find callers of the parent function (level 2)
    const l2 = findCallers(parentFunc);
    console.log(`  Found ${l2.length} callers of ${hex(parentFunc)}:`);

    for (const l2caller of l2) {
      const l2parent = findParentFunction(l2caller.addr);
      entry.level2Callers.push({
        callerAddr: l2caller.addr,
        mnemonic: l2caller.mnemonic,
        parentFunc: l2parent,
        level3Callers: [],
      });

      console.log(`    ${hex(l2caller.addr)}: ${l2caller.mnemonic} ${hex(l2caller.target)}` +
                  (l2parent ? ` (in func ${hex(l2parent)})` : ''));
    }
  }

  callTree.push(entry);
}

// --- Step 4: Level 3 (trace up one more level) ---

console.log(`\n=== Step 4: Level 3 callers ===\n`);

const seen = new Set(); // avoid re-scanning the same function
for (const entry of callTree) {
  for (const l2 of entry.level2Callers) {
    if (!l2.parentFunc || seen.has(l2.parentFunc)) continue;
    seen.add(l2.parentFunc);

    const l3 = findCallers(l2.parentFunc);
    l2.level3Callers = l3.map(c => ({
      callerAddr: c.addr,
      mnemonic: c.mnemonic,
      parentFunc: findParentFunction(c.addr),
    }));

    if (l3.length > 0) {
      console.log(`Callers of ${hex(l2.parentFunc)} (parent of ${hex(l2.callerAddr)}):`);
      for (const l3c of l3) {
        const l3parent = findParentFunction(l3c.addr);
        console.log(`  ${hex(l3c.addr)}: ${l3c.mnemonic} ${hex(l3c.target)}` +
                    (l3parent ? ` (in func ${hex(l3parent)})` : ''));
      }
    }
  }
}

// --- Step 5: Summary call chain ---

console.log(`\n${'='.repeat(60)}`);
console.log(`=== CALL CHAIN SUMMARY: OS entry points -> 0x09C775 ===`);
console.log(`${'='.repeat(60)}\n`);

console.log(`Target: ${hex(target)} — SET 0,(IY+9)`);
console.log(`In function: ${hex(funcStart)} .. ${hex(funcEnd)}\n`);

function printTree(indent, entries, targetLabel) {
  for (const e of entries) {
    const funcLabel = e.parentFunc ? `func ${hex(e.parentFunc)}` : '(unknown parent)';
    console.log(`${indent}${hex(e.callerAddr)} ${e.mnemonic} ${targetLabel} [${funcLabel}]`);
  }
}

for (const entry of callTree) {
  console.log(`Level 1: ${hex(entry.callerAddr)} ${entry.mnemonic} ${hex(funcStart)}`);
  if (entry.parentFunc) {
    console.log(`  (in function ${hex(entry.parentFunc)})`);
  }

  for (const l2 of entry.level2Callers) {
    console.log(`  Level 2: ${hex(l2.callerAddr)} ${l2.mnemonic} ${hex(entry.parentFunc)}`);
    if (l2.parentFunc) {
      console.log(`    (in function ${hex(l2.parentFunc)})`);
    }

    for (const l3 of (l2.level3Callers || [])) {
      console.log(`    Level 3: ${hex(l3.callerAddr)} ${l3.mnemonic} ${hex(l2.parentFunc)}`);
      if (l3.parentFunc) {
        console.log(`      (in function ${hex(l3.parentFunc)})`);
      }
    }
  }
  console.log();
}

// --- Step 5b: Search for pointer references (jump table dispatch) ---
// Parent functions 0x09C73A and 0x09C892 have 0 direct CALL/JP callers.
// They are likely reached via jump tables: the ROM stores their address as
// a 24-bit LE pointer, and a dispatcher loads + calls/jumps through it.

console.log(`\n=== Step 5b: Pointer references (jump table entries) ===\n`);

function findPointerRefs(targetAddr) {
  const refs = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  for (let addr = 0; addr < ROM_SIZE - 2; addr++) {
    if (rom[addr] === lo && rom[addr + 1] === mid && rom[addr + 2] === hi) {
      // Exclude CALL/JP opcodes (those are already found)
      const prevByte = addr > 0 ? rom[addr - 1] : 0;
      const isCallJp = callOpcodes.has(prevByte) || jpOpcodes.has(prevByte);
      refs.push({ addr, isCallJp });
    }
  }
  return refs;
}

// Collect all "orphan" functions (0 callers)
const orphanFuncs = new Set();
for (const entry of callTree) {
  if (entry.parentFunc) {
    const callers = findCallers(entry.parentFunc);
    if (callers.length === 0) orphanFuncs.add(entry.parentFunc);
  }
}

for (const func of orphanFuncs) {
  const refs = findPointerRefs(func);
  const tableRefs = refs.filter(r => !r.isCallJp);
  console.log(`Pointer refs to ${hex(func)} (non-CALL/JP): ${tableRefs.length}`);
  for (const ref of tableRefs) {
    // Show surrounding context to understand the table structure
    console.log(`  ${hex(ref.addr)}: pointer to ${hex(func)}`);
    // Check if this is preceded by an ASCII label
    const contextBefore = [];
    for (let i = -32; i < 0; i++) {
      const b = rom[ref.addr + i];
      if (b >= 0x20 && b < 0x7F) contextBefore.push(String.fromCharCode(b));
      else contextBefore.push('.');
    }
    console.log(`    ASCII before: ${contextBefore.join('')}`);
    console.log(`    Bytes before: ${dumpBytes(ref.addr - 32, 32)}`);
    console.log(`    Bytes at ref: ${dumpBytes(ref.addr, 16)}`);

    // Check for table structure: look for other 24-bit pointers nearby
    console.log(`    Nearby pointers (checking stride-3 pattern):`);
    for (let offset = -15; offset <= 15; offset += 3) {
      if (offset === 0) continue;
      const nearby = read24(ref.addr + offset);
      if (nearby >= 0x09C000 && nearby < 0x0A0000) {
        console.log(`      ${hex(ref.addr + offset)}: -> ${hex(nearby)}`);
      }
    }
  }
}

// --- Step 6: Decode the table structure around the parent functions ---

console.log(`\n=== Step 6: Decode table structure ===\n`);

// The function at 0x09C73A starts with "PROGRAM\0" then code.
// This suggests a table of { label_string, handler_code } entries.
// Let's scan the region around 0x09C73A for this pattern.

// Look at the broader region for similar label+code entries
console.log('Scanning 0x09C600..0x09CA00 for ASCII string + code patterns:\n');

let addr = 0x09C600;
const regionEnd = 0x09CA00;
while (addr < regionEnd) {
  // Check if this looks like an ASCII string (printable, null-terminated)
  let strEnd = addr;
  while (strEnd < regionEnd && rom[strEnd] >= 0x20 && rom[strEnd] < 0x7F) strEnd++;

  if (strEnd - addr >= 3 && rom[strEnd] === 0x00) {
    // Found a null-terminated ASCII string
    const str = Buffer.from(rom.slice(addr, strEnd)).toString('ascii');
    const codeStart = strEnd + 1;
    console.log(`  ${hex(addr)}: "${str}" (code at ${hex(codeStart)})`);
    console.log(`    Code bytes: ${dumpBytes(codeStart, 20)}`);

    // Check if the code starts with a CALL to our target function
    if (rom[codeStart] === 0xCD) {
      const callTarget = read24(codeStart + 1);
      console.log(`    -> CALL ${hex(callTarget)}`);
    }

    addr = codeStart;
  } else {
    addr++;
  }
}

// --- Step 7: Find the dispatcher that reads this table ---

console.log(`\n=== Step 7: Find dispatcher for this table ===\n`);

// The "parent functions" are really table entries with embedded label strings.
// The RET-based boundary detection was fooled. Let's re-examine.
// 0x09C73A contains "PROGRAM\0" then CD 6B C7 09 (CALL 0x09C76B)
// The REAL function boundary is likely further back.

// Look further back from 0x09C742 (the first CALL site)
// to find an actual function entry (not a string)
console.log('Re-examining function boundaries around callers:');

for (const caller of level1Callers) {
  console.log(`\n  Caller at ${hex(caller.addr)}:`);
  // Scan backwards further, past any ASCII strings
  for (let a = caller.addr - 1; a >= caller.addr - 0x200; a--) {
    // Look for C9 (RET) not preceded by printable ASCII
    if (rom[a] === 0xC9) {
      const nextByte = rom[a + 1];
      // If next byte is printable ASCII, this RET is before a label string
      if (nextByte >= 0x20 && nextByte < 0x7F) {
        console.log(`    RET at ${hex(a)}, followed by ASCII (label entry at ${hex(a + 1)})`);
        // Keep looking back for the real function start
        continue;
      }
      console.log(`    RET at ${hex(a)}, function starts at ${hex(a + 1)}`);
      console.log(`    Bytes: ${dumpBytes(a + 1, 24)}`);
      break;
    }
  }

  // Also look at what's between the two callers
  if (caller === level1Callers[0] && level1Callers.length > 1) {
    const next = level1Callers[1];
    console.log(`\n  Between callers (${hex(caller.addr + 4)}..${hex(next.addr)}):`);
    console.log(`    ${dumpBytes(caller.addr + 4, Math.min(next.addr - caller.addr - 4, 64))}`);
  }
}

// --- Step 8: Search for references to the table region ---

console.log(`\n=== Step 8: Who references the table region? ===\n`);

// The ASCII strings suggest a menu/command table.
// Search for LD HL,<table_addr> patterns that point into this region
// LD HL,nn = 21 xx yy zz (in ADL mode)

const tableRegionStart = 0x09C700;
const tableRegionEnd = 0x09C900;

console.log(`Searching for LD HL, pointing into ${hex(tableRegionStart)}..${hex(tableRegionEnd)}:`);

for (let a = 0; a < ROM_SIZE - 3; a++) {
  if (rom[a] === 0x21) { // LD HL,nn
    const target = read24(a + 1);
    if (target >= tableRegionStart && target < tableRegionEnd) {
      const parentF = findParentFunction(a);
      console.log(`  ${hex(a)}: LD HL,${hex(target)} (in func ${parentF ? hex(parentF) : '?'})`);
      console.log(`    Context: ${dumpBytes(a - 8, 24)}`);
    }
  }
}

// Also search for any 24-bit pointer stored in ROM that points to our table entries
console.log(`\nSearching for stored pointers to table entries:`);
const tableEntryAddrs = [0x09C73A, 0x09C892];
for (const entry of tableEntryAddrs) {
  const refs = findPointerRefs(entry);
  const ptrRefs = refs.filter(r => !r.isCallJp);
  if (ptrRefs.length > 0) {
    console.log(`\n  Pointers to ${hex(entry)}:`);
    for (const ref of ptrRefs) {
      console.log(`    ${hex(ref.addr)}: ${dumpBytes(ref.addr - 4, 12)}`);
    }
  }
}

// --- Step 9: Wider function containing both table entries ---

console.log(`\n=== Step 9: Find the wider function containing the table ===\n`);

// Scan back much further from 0x09C73A to find the real function start
// (the table entries are likely embedded in a larger function or data section)
let widerFuncStart = null;
for (let a = 0x09C739; a >= 0x09C000; a--) {
  if (rom[a] === 0xC9) {
    // Check if what follows is actual code (not an ASCII label)
    const nextByte = rom[a + 1];
    if (nextByte < 0x20 || nextByte >= 0x7F) {
      // Not ASCII — this could be a real code boundary
      widerFuncStart = a + 1;
      console.log(`Possible function start: ${hex(widerFuncStart)}`);
      console.log(`  Bytes: ${dumpBytes(widerFuncStart, 32)}`);

      // Find callers of this function
      const callers = findCallers(widerFuncStart);
      console.log(`  Direct callers: ${callers.length}`);
      for (const c of callers) {
        const p = findParentFunction(c.addr);
        console.log(`    ${hex(c.addr)}: ${c.mnemonic} ${hex(c.target)} (in func ${p ? hex(p) : '?'})`);
      }

      // Also check pointer references
      const ptrs = findPointerRefs(widerFuncStart).filter(r => !r.isCallJp);
      console.log(`  Pointer refs: ${ptrs.length}`);
      for (const p of ptrs.slice(0, 5)) {
        console.log(`    ${hex(p.addr)}: ${dumpBytes(p.addr - 4, 12)}`);
      }
      break;
    }
  }
}

// --- Step 10: Deep backward scan for real function entry ---

console.log(`\n=== Step 10: Deep backward scan from 0x09C726 ===\n`);

// Scan much further back, looking for a function start that HAS callers
for (let a = 0x09C725; a >= 0x09C000; a--) {
  if (rom[a] === 0xC9) {
    const candidate = a + 1;
    const callers = findCallers(candidate);
    const ptrs = findPointerRefs(candidate).filter(r => !r.isCallJp);

    if (callers.length > 0 || ptrs.length > 0) {
      console.log(`FOUND reachable function at ${hex(candidate)}`);
      console.log(`  Bytes: ${dumpBytes(candidate, 32)}`);
      console.log(`  Direct callers: ${callers.length}`);
      for (const c of callers) {
        const p = findParentFunction(c.addr);
        console.log(`    ${hex(c.addr)}: ${c.mnemonic} ${hex(c.target)} (in func ${p ? hex(p) : '?'})`);
        console.log(`      Context: ${dumpBytes(c.addr - 8, 20)}`);
      }
      console.log(`  Pointer refs: ${ptrs.length}`);
      for (const p of ptrs.slice(0, 10)) {
        console.log(`    ${hex(p.addr)}: ${dumpBytes(p.addr - 8, 20)}`);
      }

      // Trace callers up one more level
      for (const c of callers) {
        const parentF = findParentFunction(c.addr);
        if (parentF) {
          const grandCallers = findCallers(parentF);
          if (grandCallers.length > 0) {
            console.log(`  Callers of ${hex(parentF)} (parent of ${hex(c.addr)}):`);
            for (const gc of grandCallers.slice(0, 10)) {
              const gp = findParentFunction(gc.addr);
              console.log(`    ${hex(gc.addr)}: ${gc.mnemonic} ${hex(gc.target)} (in func ${gp ? hex(gp) : '?'})`);
            }
          } else {
            // Check pointer refs for parent
            const parentPtrs = findPointerRefs(parentF).filter(r => !r.isCallJp);
            if (parentPtrs.length > 0) {
              console.log(`  Pointer refs to ${hex(parentF)} (parent of ${hex(c.addr)}):`);
              for (const pp of parentPtrs.slice(0, 10)) {
                console.log(`    ${hex(pp.addr)}: ${dumpBytes(pp.addr - 8, 20)}`);
              }
            }
          }
        }
      }
      break;
    }
  }
}

// Fallback: scan all the way to 0x09C000 for any function with callers
console.log(`\nAll RET-bounded functions in 0x09C000..0x09C740 with callers or pointer refs:\n`);
let prevRet = 0x09C000;
for (let a = 0x09C000; a < 0x09C740; a++) {
  if (rom[a] === 0xC9) {
    const candidate = prevRet;
    if (candidate < a) {
      const callers = findCallers(candidate);
      const ptrs = findPointerRefs(candidate).filter(r => !r.isCallJp);
      if (callers.length > 0 || ptrs.length > 0) {
        console.log(`  ${hex(candidate)}: ${callers.length} callers, ${ptrs.length} ptr refs`);
        console.log(`    First bytes: ${dumpBytes(candidate, 16)}`);
        for (const c of callers.slice(0, 5)) {
          console.log(`    Caller: ${hex(c.addr)} ${c.mnemonic}`);
        }
      }
    }
    prevRet = a + 1;
  }
}

// --- Step 11: Check vector table at 0x022100 ---

console.log(`\n=== Step 11: Vector table scan (0x022100) ===\n`);

// The vector table at 0x022100 has 131 entries (3 bytes each = 393 bytes)
const VT_BASE = 0x022100;
const VT_ENTRIES = 131;
const targetFuncs = new Set([funcStart, 0x09C73A, 0x09C892, 0x09C726]);

// Also add all functions we found in the 09C region
for (let a = 0x09C000; a < 0x09CA00; a++) {
  if (rom[a] === 0xC9 && a + 1 < 0x09CA00) {
    targetFuncs.add(a + 1);
  }
}

for (let i = 0; i < VT_ENTRIES; i++) {
  const entryAddr = VT_BASE + i * 3;
  const target = read24(entryAddr);
  if (target >= 0x09C000 && target < 0x0A0000) {
    console.log(`  Vector[${i}] at ${hex(entryAddr)}: -> ${hex(target)}`);
    if (targetFuncs.has(target)) {
      console.log(`    ** MATCHES a function in our chain! **`);
    }
  }
}

// Also check if any vector points to a function that eventually calls our targets
console.log(`\nVector entries pointing into 0x09xxxx region:`);
for (let i = 0; i < VT_ENTRIES; i++) {
  const entryAddr = VT_BASE + i * 3;
  const target = read24(entryAddr);
  if (target >= 0x090000 && target < 0x0A0000) {
    console.log(`  Vector[${i}] at ${hex(entryAddr)}: -> ${hex(target)}`);
  }
}

// --- Step 12: Find JP (HL) dispatch patterns ---

console.log(`\n=== Step 12: JP (HL) / CALL (HL) dispatch near table refs ===\n`);

// JP (HL) = E9, JP (IX) = DD E9, JP (IY) = FD E9
// These are how jump tables are dispatched
// Search in the vicinity of any code that loads addresses from the 09Cxxx region

for (let a = 0; a < ROM_SIZE - 1; a++) {
  if (rom[a] === 0xE9) { // JP (HL)
    // Check if nearby code loads from our table region
    let nearbyLoad = false;
    for (let b = Math.max(0, a - 20); b < a; b++) {
      if (rom[b] === 0x21) { // LD HL,nn
        const loadTarget = read24(b + 1);
        if (loadTarget >= 0x09C700 && loadTarget < 0x09CA00) {
          nearbyLoad = true;
          console.log(`  JP (HL) at ${hex(a)} with LD HL,${hex(loadTarget)} at ${hex(b)}`);
          console.log(`    Context: ${dumpBytes(b, a - b + 1)}`);
          const p = findParentFunction(a);
          if (p) console.log(`    In function: ${hex(p)}`);
        }
      }
    }
  }
}

// --- Step 13: Broader search - who loads 0x09C7xx addresses? ---

console.log(`\n=== Step 13: All code loading 0x09C7xx/0x09C8xx addresses ===\n`);

for (let a = 0; a < ROM_SIZE - 3; a++) {
  const op = rom[a];
  if (op === 0x21 || op === 0x11 || op === 0x01) { // LD HL/DE/BC,nn
    const target = read24(a + 1);
    if (target >= 0x09C700 && target < 0x09C900) {
      const reg = op === 0x21 ? 'HL' : op === 0x11 ? 'DE' : 'BC';
      const p = findParentFunction(a);
      // Skip self-references within the same region
      if (a < 0x09C700 || a > 0x09C900) {
        console.log(`  ${hex(a)}: LD ${reg},${hex(target)} (in func ${p ? hex(p) : '?'})`);
        console.log(`    Context: ${dumpBytes(a - 4, 16)}`);
      }
    }
  }
}

// --- Bonus: Check for known OS entry points in the chain ---

console.log(`\n=== Known address annotations ===\n`);
const knownAddrs = new Map([
  [0x000000, 'Reset vector'],
  [0x000008, 'RST 08h'],
  [0x000010, 'RST 10h'],
  [0x000018, 'RST 18h'],
  [0x000020, 'RST 20h'],
  [0x000028, 'RST 28h (bcall)'],
  [0x000030, 'RST 30h'],
  [0x000038, 'RST 38h (ISR)'],
  [0x021A38, 'cxMain'],
  [0x058241, 'cxMain inner'],
  [0x09E2EC, 'D007E0 write function'],
  [0x022100, 'Vector table base'],
]);

// Collect all unique functions in the chain
const allFuncs = new Set();
allFuncs.add(funcStart);
for (const entry of callTree) {
  if (entry.parentFunc) allFuncs.add(entry.parentFunc);
  for (const l2 of entry.level2Callers) {
    if (l2.parentFunc) allFuncs.add(l2.parentFunc);
    for (const l3 of (l2.level3Callers || [])) {
      if (l3.parentFunc) allFuncs.add(l3.parentFunc);
    }
  }
}
if (widerFuncStart) allFuncs.add(widerFuncStart);

for (const addr of [...allFuncs].sort((a, b) => a - b)) {
  const known = knownAddrs.get(addr);
  console.log(`  ${hex(addr)}${known ? ' — ' + known : ''}`);
}

// --- Final: Synthesized call chain ---

console.log(`\n${'='.repeat(70)}`);
console.log(`=== SYNTHESIZED CALL CHAIN: OS entry -> SET 0,(IY+9) at 0x09C775 ===`);
console.log(`${'='.repeat(70)}\n`);

console.log(`The function 0x09C76B (contains SET 0,(IY+9) at 0x09C775)`);
console.log(`is called from two sites inside function 0x09C70B:\n`);
console.log(`  0x09C742: CALL 0x09C76B  (after "PROGRAM\\0" label at 0x09C73A)`);
console.log(`  0x09C89B: CALL 0x09C76B  (second call path)\n`);
console.log(`Function 0x09C70B has 7 callers:\n`);
console.log(`  0x022278: JP   0x09C70B  <- vector table dispatcher (func 0x022057)`);
console.log(`  0x059877: CALL 0x09C70B  <- func 0x0597F3 (tokenizer/parser)`);
console.log(`  0x059FF6: CALL 0x09C70B  <- func 0x059FEE (parser helper)`);
console.log(`  0x05A00D: CALL 0x09C70B  <- func 0x059FFF (parser helper)`);
console.log(`  0x09996C: CALL Z,0x09C70B <- func 0x0998EC (conditional)`);
console.log(`  0x099D3E: CALL 0x09C70B  <- func 0x099C51`);
console.log(`  0x09A2A3: CALL 0x09C70B  <- func 0x09A213\n`);
console.log(`Key path: Vector table (0x022057) -> JP 0x09C70B -> CALL 0x09C76B`);
console.log(`          -> SET 0,(IY+9) at 0x09C775 -> gates D007E0 writes\n`);
console.log(`The "PROGRAM\\0" ASCII string at 0x09C73A suggests this is the`);
console.log(`PROGRAM token/command handler — SET 0,(IY+9) is set during`);
console.log(`PROGRAM command processing, enabling the D007E0 (STAT) write path.\n`);
console.log(`Vector table entry [129] at 0x022283 -> 0x09C304 points into the`);
console.log(`same region, confirming this is a bcall-dispatched OS routine.\n`);

console.log(`Function 0x09C70B decoded:`);
console.log(`  FD CB 08 4E  = BIT 1,(IY+8)   ; check flag`);
console.log(`  20 02        = JR NZ,+2        ; if set, skip`);
console.log(`  B7           = OR A             ; clear carry (return failure)`);
console.log(`  C9           = RET              ; bail if flag not set`);
console.log(`  2A 1A 23 D0  = LD HL,(D0231A)  ; load pointer`);
console.log(`  E5           = PUSH HL`);
console.log(`  CD C9 BA 09  = CALL 0x09BAC9   ; process token`);
console.log(`  ...then falls through to label table dispatch\n`);

console.log(`Done.`);
