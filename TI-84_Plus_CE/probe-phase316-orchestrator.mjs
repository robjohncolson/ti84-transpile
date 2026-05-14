#!/usr/bin/env node
/**
 * probe-phase316-orchestrator.mjs
 *
 * Deep analysis of the multi-callback orchestrator at 0x0241A3.
 * This function has 5 _indcall dispatch sites — more than any other function
 * in the ROM. It coordinates multiple callback invocations per call, driven
 * by a command byte passed in register A.
 *
 * Analysis:
 *   1. Disassemble the function from 0x0241A3 to RET
 *   2. Find all 5 _indcall dispatch sites with their IX offsets
 *   3. Map the stack frame layout from IX-relative accesses
 *   4. Find all callers (CALL/JP to 0x0241A3) with context bytes
 *   5. Identify the wrapper functions and their command byte values
 *   6. Identify subroutine calls made by the orchestrator
 *
 * Usage:  node TI-84_Plus_CE/probe-phase316-orchestrator.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(n, w = 6) { return '0x' + n.toString(16).padStart(w, '0'); }
function hexByte(b) { return b.toString(16).padStart(2, '0'); }
function signedByte(b) { return b > 127 ? b - 256 : b; }

function dumpHex(start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(hexByte(rom[start + i]));
  return parts.join(' ');
}

function findPattern(opcode, target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const sites = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === opcode && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      sites.push(i);
    }
  }
  return sites;
}

function addr24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// ---------------------------------------------------------------------------
// 1. Disassemble function 0x0241A3
// ---------------------------------------------------------------------------

const FUNC_START = 0x0241A3;
const FUNC_END   = 0x0242DA; // RET at 0x0242D9, function body ends at 0x0242DA

console.log('================================================================');
console.log('  Phase 316: Multi-Callback Orchestrator at ' + hex(FUNC_START));
console.log('================================================================');
console.log('');

console.log('=== 1. Raw hex dump ===');
console.log('');
const funcLen = FUNC_END - FUNC_START;
for (let i = 0; i < funcLen; i += 16) {
  const addr = FUNC_START + i;
  const rowLen = Math.min(16, funcLen - i);
  console.log(hex(addr) + ': ' + dumpHex(addr, rowLen));
}
console.log('');

// ---------------------------------------------------------------------------
// 2. IX-relative access map (stack frame layout)
// ---------------------------------------------------------------------------

console.log('=== 2. Stack frame layout (IX-relative accesses) ===');
console.log('');

const ixAccesses = new Map(); // offset -> [{pc, opDesc}]

for (let i = FUNC_START; i < FUNC_END; ) {
  const b0 = rom[i];

  // DD prefix (IX ops)
  if (b0 === 0xDD && i + 2 < FUNC_END) {
    const b1 = rom[i + 1];
    const b2 = rom[i + 2];
    const off = signedByte(b2);
    let desc = null;
    let len = 3;

    // Single-byte offset IX instructions
    if (b1 === 0x07) desc = `LD BC,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x0F) desc = `LD (IX${off >= 0 ? '+' : ''}${off}),BC`;
    else if (b1 === 0x17) desc = `LD DE,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x1F) desc = `LD (IX${off >= 0 ? '+' : ''}${off}),DE`;
    else if (b1 === 0x27) desc = `LD HL,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x2F) desc = `LD (IX${off >= 0 ? '+' : ''}${off}),HL`;
    else if (b1 === 0x31) desc = `LD IX,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x34) desc = `INC (IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x35) desc = `DEC (IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x36) { desc = `LD (IX${off >= 0 ? '+' : ''}${off}),${hexByte(rom[i+3])}`; len = 4; }
    else if (b1 === 0x46) desc = `LD B,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x4E) desc = `LD C,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x56) desc = `LD D,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x5E) desc = `LD E,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x66) desc = `LD H,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x6E) desc = `LD L,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0x77) desc = `LD (IX${off >= 0 ? '+' : ''}${off}),A`;
    else if (b1 === 0x7E) desc = `LD A,(IX${off >= 0 ? '+' : ''}${off})`;
    else if (b1 === 0xCB) {
      // IX bit ops: DD CB off op
      const bitOp = rom[i + 3];
      const bitNum = (bitOp >> 3) & 7;
      if ((bitOp & 0xC7) === 0x46) desc = `BIT ${bitNum},(IX${off >= 0 ? '+' : ''}${off})`;
      else if ((bitOp & 0xC7) === 0xC6) desc = `SET ${bitNum},(IX${off >= 0 ? '+' : ''}${off})`;
      else if ((bitOp & 0xC7) === 0x86) desc = `RES ${bitNum},(IX${off >= 0 ? '+' : ''}${off})`;
      else if ((bitOp & 0xC7) === 0x06) desc = `RLC ${bitNum},(IX${off >= 0 ? '+' : ''}${off})`;
      else if ((bitOp & 0xC7) === 0x16) desc = `RL (IX${off >= 0 ? '+' : ''}${off})`;
      else desc = `CB-IX op=${hexByte(bitOp)} (IX${off >= 0 ? '+' : ''}${off})`;
      len = 4;
    }
    // Two-byte non-offset IX instructions
    else if (b1 === 0xE5) { desc = 'PUSH IX'; len = 2; }
    else if (b1 === 0xE1) { desc = 'POP IX'; len = 2; }
    else if (b1 === 0xF9) { desc = 'LD SP,IX'; len = 2; }
    else if (b1 === 0x39) { desc = 'ADD IX,SP'; len = 2; }
    else if (b1 === 0x21) {
      const imm = addr24(i + 2);
      desc = `LD IX,${hex(imm)}`;
      len = 5;
    }
    else {
      desc = `DD ${hexByte(b1)} ${hexByte(b2)}`;
    }

    if (desc && off !== undefined && len >= 3 && b1 !== 0xE5 && b1 !== 0xE1 && b1 !== 0xF9 && b1 !== 0x39 && b1 !== 0x21) {
      if (!ixAccesses.has(off)) ixAccesses.set(off, []);
      ixAccesses.get(off).push({ pc: i, desc });
    }

    console.log(`  ${hex(i)}: ${dumpHex(i, len).padEnd(14)} ${desc}`);
    i += len;
    continue;
  }

  // FD prefix (IY ops)
  if (b0 === 0xFD && i + 1 < FUNC_END) {
    const b1 = rom[i + 1];
    let desc = null;
    let len = 2;

    if (b1 === 0xE5) desc = 'PUSH IY';
    else if (b1 === 0xE1) desc = 'POP IY';
    else if (b1 === 0x37) {
      const off = signedByte(rom[i + 2]);
      desc = `LD IY,(IX${off >= 0 ? '+' : ''}${off})`;
      len = 3;
    } else {
      desc = `FD ${hexByte(b1)}`;
    }

    console.log(`  ${hex(i)}: ${dumpHex(i, len).padEnd(14)} ${desc}`);
    i += len;
    continue;
  }

  // CALL nn
  if (b0 === 0xCD) {
    const target = addr24(i + 1);
    const label = target === 0x00015C ? ' (_indcall)' :
                  target === 0x023FDA ? ' (iterator_init)' :
                  target === 0x024027 ? ' (sentinel_check)' :
                  target === 0x024763 ? ' (callback_validate)' :
                  target === 0x000138 ? ' (_frameset)' :
                  target === 0x0000CC ? ' (_frameset0)' : '';
    console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} CALL ${hex(target)}${label}`);
    i += 4;
    continue;
  }

  // JP nn (unconditional)
  if (b0 === 0xC3) {
    const target = addr24(i + 1);
    console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} JP ${hex(target)}`);
    i += 4;
    continue;
  }

  // JP cc,nn (conditional)
  if ((b0 & 0xC7) === 0xC2) {
    const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(b0 >> 3) & 7];
    const target = addr24(i + 1);
    console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} JP ${cc},${hex(target)}`);
    i += 4;
    continue;
  }

  // JR/JR cc
  if (b0 === 0x18 || b0 === 0x28 || b0 === 0x20 || b0 === 0x38 || b0 === 0x30) {
    const cc = b0 === 0x18 ? '' : b0 === 0x28 ? 'Z,' : b0 === 0x20 ? 'NZ,' : b0 === 0x38 ? 'C,' : 'NC,';
    const offset = signedByte(rom[i + 1]);
    const target = i + 2 + offset;
    console.log(`  ${hex(i)}: ${dumpHex(i, 2).padEnd(14)} JR ${cc}${hex(target)}`);
    i += 2;
    continue;
  }

  // RET
  if (b0 === 0xC9) {
    console.log(`  ${hex(i)}: c9             RET`);
    i += 1;
    continue;
  }

  // LD rr,nn (16/24-bit immediate loads)
  if (b0 === 0x01) { console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} LD BC,${hex(addr24(i+1))}`); i += 4; continue; }
  if (b0 === 0x11) { console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} LD DE,${hex(addr24(i+1))}`); i += 4; continue; }
  if (b0 === 0x21) { console.log(`  ${hex(i)}: ${dumpHex(i, 4).padEnd(14)} LD HL,${hex(addr24(i+1))}`); i += 4; continue; }

  // LD A,n
  if (b0 === 0x3E) {
    console.log(`  ${hex(i)}: ${dumpHex(i, 2).padEnd(14)} LD A,${hexByte(rom[i+1])}`);
    i += 2;
    continue;
  }

  // ED prefix
  if (b0 === 0xED) {
    const b1 = rom[i + 1];
    let desc = `ED ${hexByte(b1)}`;
    let len = 2;
    if (b1 === 0x52) desc = 'SBC HL,DE';
    else if (b1 === 0x17) { desc = `LD DE,(HL)`; }
    else if (b1 === 0x27) { desc = `LD HL,(HL)`; }
    console.log(`  ${hex(i)}: ${dumpHex(i, len).padEnd(14)} ${desc}`);
    i += len;
    continue;
  }

  // CB prefix (bit ops without IX)
  if (b0 === 0xCB) {
    const b1 = rom[i + 1];
    const bitNum = (b1 >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[b1 & 7];
    let desc;
    if ((b1 & 0xC0) === 0x40) desc = `BIT ${bitNum},${reg}`;
    else if ((b1 & 0xC0) === 0xC0) desc = `SET ${bitNum},${reg}`;
    else if ((b1 & 0xC0) === 0x80) desc = `RES ${bitNum},${reg}`;
    else desc = `CB ${hexByte(b1)}`;
    console.log(`  ${hex(i)}: ${dumpHex(i, 2).padEnd(14)} ${desc}`);
    i += 2;
    continue;
  }

  // Single-byte opcodes
  const singleOps = {
    0x00: 'NOP', 0x09: 'ADD HL,BC', 0x19: 'ADD HL,DE', 0x29: 'ADD HL,HL',
    0x3B: 'DEC SP', 0x33: 'INC SP',
    0x7E: 'LD A,(HL)', 0x77: 'LD (HL),A', 0x23: 'INC HL', 0x2B: 'DEC HL',
    0x97: 'SUB A', 0xB7: 'OR A', 0xBF: 'CP A', 0xFE: 'CP',
    0xE5: 'PUSH HL', 0xE1: 'POP HL', 0xC5: 'PUSH BC', 0xC1: 'POP BC',
    0xD5: 'PUSH DE', 0xD1: 'POP DE', 0xF5: 'PUSH AF', 0xF1: 'POP AF',
    0xEB: 'EX DE,HL', 0xAF: 'XOR A',
  };

  if (b0 === 0xFE) {
    console.log(`  ${hex(i)}: ${dumpHex(i, 2).padEnd(14)} CP ${hexByte(rom[i+1])}`);
    i += 2;
    continue;
  }

  if (singleOps[b0]) {
    console.log(`  ${hex(i)}: ${hexByte(b0).padEnd(14)} ${singleOps[b0]}`);
    i += 1;
    continue;
  }

  // Fallback
  console.log(`  ${hex(i)}: ${hexByte(b0).padEnd(14)} ???`);
  i += 1;
}

console.log('');

// ---------------------------------------------------------------------------
// 3. Stack frame summary
// ---------------------------------------------------------------------------

console.log('=== 3. Stack frame map ===');
console.log('');

const sortedOffsets = [...ixAccesses.keys()].sort((a, b) => a - b);
for (const off of sortedOffsets) {
  const accesses = ixAccesses.get(off);
  const reads = accesses.filter(a => !a.desc.includes('LD (IX') && !a.desc.includes('INC') && !a.desc.includes('DEC') && !a.desc.includes('SET') && !a.desc.includes('RES'));
  const writes = accesses.filter(a => a.desc.includes('LD (IX') || a.desc.includes('INC') || a.desc.includes('DEC') || a.desc.includes('SET') || a.desc.includes('RES'));
  const tests = accesses.filter(a => a.desc.includes('BIT'));

  console.log(`  IX${off >= 0 ? '+' : ''}${off} (${off < 0 ? 'local' : 'param'}): ${accesses.length} access(es)`);
  for (const a of accesses) {
    console.log(`    ${hex(a.pc)}: ${a.desc}`);
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 4. _indcall dispatch sites
// ---------------------------------------------------------------------------

console.log('=== 4. _indcall dispatch sites (CALL 0x00015C) ===');
console.log('');

const indcallSites = findPattern(0xCD, 0x00015C).filter(pc => pc >= FUNC_START && pc < FUNC_END);
console.log(`Found ${indcallSites.length} _indcall sites in function:`);
console.log('');

for (const site of indcallSites) {
  console.log(`  Site at ${hex(site)}:`);
  console.log(`    Context (-20 bytes): ${dumpHex(site - 20, 24)}`);

  // Look backward for DD 31 (LD IX,(IX+off)) which reloads IX with callback pointer
  for (let j = site - 1; j >= Math.max(FUNC_START, site - 12); j--) {
    if (rom[j] === 0xDD && rom[j + 1] === 0x31) {
      const off = signedByte(rom[j + 2]);
      console.log(`    IX reload: LD IX,(IX${off >= 0 ? '+' : ''}${off}) at ${hex(j)}`);
    }
    if (rom[j] === 0xDD && rom[j + 1] === 0x07) {
      const off = signedByte(rom[j + 2]);
      console.log(`    BC load: LD BC,(IX${off >= 0 ? '+' : ''}${off}) at ${hex(j)}`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 5. Callers of 0x0241A3
// ---------------------------------------------------------------------------

console.log('=== 5. Callers of ' + hex(FUNC_START) + ' ===');
console.log('');

const callCallers = findPattern(0xCD, FUNC_START);
const jpCallers = findPattern(0xC3, FUNC_START);

console.log(`CALL callers: ${callCallers.length}`);
for (const pc of callCallers) {
  console.log(`  ${hex(pc)}: ${dumpHex(Math.max(0, pc - 10), 14)}`);
  // Check if this is a LD A,xx ; CALL pattern
  if (rom[pc - 2] === 0x3E) {
    const aVal = rom[pc - 1];
    console.log(`    => Wrapper: LD A,${hexByte(aVal)} then CALL (command byte = ${aVal})`);
  }
}
console.log('');

console.log(`JP callers: ${jpCallers.length}`);
for (const pc of jpCallers) {
  console.log(`  ${hex(pc)}: ${dumpHex(Math.max(0, pc - 10), 14)}`);
}
console.log('');

// ---------------------------------------------------------------------------
// 6. Wrapper function table
// ---------------------------------------------------------------------------

console.log('=== 6. Wrapper function table ===');
console.log('');

const wrappers = [];
for (const pc of callCallers) {
  if (rom[pc - 2] === 0x3E) {
    const aVal = rom[pc - 1];
    const wrapperStart = pc - 2;
    // Check for RET after CALL (pc + 4)
    const hasRet = rom[pc + 4] === 0xC9;
    wrappers.push({ addr: wrapperStart, cmdByte: aVal, hasRet });
  }
}

console.log('| Wrapper Addr | Cmd Byte (A) | Bit Pattern     | Bits Set |');
console.log('|-------------|-------------|-----------------|----------|');
for (const w of wrappers) {
  const bits = w.cmdByte.toString(2).padStart(8, '0');
  const bitsSet = [];
  for (let b = 0; b < 8; b++) {
    if (w.cmdByte & (1 << b)) bitsSet.push(b);
  }
  console.log(`| ${hex(w.addr)}    | 0x${hexByte(w.cmdByte)}        | ${bits}        | ${bitsSet.join(',')} |`);
}
console.log('');

// ---------------------------------------------------------------------------
// 7. Bit-field analysis of the command byte
// ---------------------------------------------------------------------------

console.log('=== 7. Command byte bit-field analysis ===');
console.log('');

// The function tests individual bits of the command byte stored at IX-21
// DD CB EB 46 = BIT 0,(IX-21)
// DD CB EB 56 = BIT 2,(IX-21)
// DD CB EB 4E = BIT 1,(IX-21)
// DD CB EB 5E = BIT 3,(IX-21)
// DD CB EB 66 = BIT 4,(IX-21)
// DD CB EB 7E = BIT 7,(IX-21)
// DD CB EB FE = SET 7,(IX-21)

const bitTests = [];
for (let i = FUNC_START; i < FUNC_END - 3; i++) {
  if (rom[i] === 0xDD && rom[i + 1] === 0xCB) {
    const off = signedByte(rom[i + 2]);
    const op = rom[i + 3];
    const bitNum = (op >> 3) & 7;
    let opName;
    if ((op & 0xC7) === 0x46) opName = 'BIT';
    else if ((op & 0xC7) === 0xC6) opName = 'SET';
    else if ((op & 0xC7) === 0x86) opName = 'RES';
    else if ((op & 0xC7) === 0x16) opName = 'RL';
    else continue;
    bitTests.push({ pc: i, off, bitNum, opName });
  }
}

console.log('Bit operations on command byte (IX-21):');
for (const bt of bitTests.filter(t => t.off === -21)) {
  console.log(`  ${hex(bt.pc)}: ${bt.opName} ${bt.bitNum},(IX-21)`);
}
console.log('');

// Map what each bit controls
console.log('Bit meanings (from control flow analysis):');
console.log('  Bit 0: Selects between two code paths for DE/HL setup');
console.log('         Set => DE=0x0242DB (0xFF), HL=0x000138 (_frameset)');
console.log('         Clear => DE=0x0242DC (0x00), HL=0x0242DD');
console.log('  Bit 1: Controls callback validation path');
console.log('  Bit 2: Selects HL=0x047432 vs HL=0x0000C8');
console.log('  Bit 3: Enables extra callback_validate call (0x024763)');
console.log('  Bit 4: Enables secondary null-check path');
console.log('  Bit 7: Internal flag — SET during execution to mark callback errors');
console.log('');

// ---------------------------------------------------------------------------
// 8. Subroutine calls from the orchestrator
// ---------------------------------------------------------------------------

console.log('=== 8. Subroutine calls ===');
console.log('');

for (let i = FUNC_START; i < FUNC_END - 3; i++) {
  if (rom[i] === 0xCD) {
    const target = addr24(i + 1);
    if (target !== 0x00015C) {
      console.log(`  ${hex(i)}: CALL ${hex(target)}`);
    }
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 9. Jump table entry
// ---------------------------------------------------------------------------

console.log('=== 9. Jump table entry ===');
console.log('');
console.log('Function 0x0241A3 is entry in a JP vector table at 0x0217C0:');
const jtStart = 0x217B0;
for (let i = jtStart; i < jtStart + 0x40; i += 4) {
  if (rom[i] === 0xC3) {
    const target = addr24(i + 1);
    const marker = target === FUNC_START ? ' <-- THIS FUNCTION' : '';
    console.log(`  ${hex(i)}: JP ${hex(target)}${marker}`);
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 10. Helper function after the orchestrator
// ---------------------------------------------------------------------------

console.log('=== 10. Post-function data/helpers ===');
console.log('');
console.log('Bytes after RET at ' + hex(FUNC_END - 1) + ':');
console.log(`  ${hex(0x0242DA)}: ${dumpHex(0x0242DA, 12)}`);
console.log('  0x0242DA: FF (padding/sentinel)');
console.log('  0x0242DB: FF (used when bit 0 set — "non-null" sentinel)');
console.log('  0x0242DC-0x0242E5: Small helper — null-pointer comparison:');
console.log('    LD DE,0x000000 ; EX DE,HL ; OR A ; SBC HL,DE ; RET');
console.log('    Returns Z if HL == 0 (null check)');
console.log('');

// ---------------------------------------------------------------------------
// 11. Summary
// ---------------------------------------------------------------------------

console.log('=== 11. Summary ===');
console.log('');
console.log('Function 0x0241A3 is a multi-callback orchestrator that:');
console.log('');
console.log('1. Takes a COMMAND BYTE in register A (stored at IX-21)');
console.log('2. Uses individual bits of the command byte to control behavior:');
console.log('   - Which callbacks to invoke (up to 5 dispatch sites)');
console.log('   - Which validation/null-check paths to take');
console.log('   - Error handling (bit 7 = error flag)');
console.log('');
console.log('3. Stack frame layout (24 bytes of locals):');
console.log('   IX-21: Command byte (A register on entry)');
console.log('   IX-20: Counter/index low byte');
console.log('   IX-19: Counter/index high byte');
console.log('   IX-18: Saved HL (secondary callback pointer)');
console.log('   IX-15: Saved IX (primary callback pointer / struct base)');
console.log('   IX-12: Saved DE (return value accumulator)');
console.log('   IX-9:  Saved BC/DE (intermediate results)');
console.log('   IX-6:  Working pointer (callback arg)');
console.log('   IX-3:  Iterator cursor (HL) for linked-list traversal');
console.log('');
console.log('4. Main loop structure:');
console.log('   - Calls 0x023FDA (iterator_init) to get first element');
console.log('   - Loops: loads element, checks for sentinel (0x81), calls callbacks');
console.log('   - Calls 0x024027 (sentinel_check) to validate list terminator');
console.log('   - 5 _indcall dispatches: 3 in the main loop, 2 in cleanup/finalize');
console.log('');
console.log('5. 9 wrapper functions pass different command bytes:');
for (const w of wrappers) {
  const bits = [];
  for (let b = 0; b < 8; b++) {
    if (w.cmdByte & (1 << b)) bits.push(`bit${b}`);
  }
  console.log(`   ${hex(w.addr)}: A=${hexByte(w.cmdByte)} (${bits.join('+') || 'none'}) `);
}
console.log('');
console.log('6. Called from JP vector table at 0x0217C0 (OS dispatch table)');
console.log('   and via 9 thin wrapper functions at 0x0242E6-0x024327');
console.log('');
console.log('7. This is likely the OS **event/notification dispatcher** —');
console.log('   it iterates a linked list of registered handlers and invokes');
console.log('   callbacks based on the event type (command byte bits).');
console.log('   The 5 dispatch sites correspond to: pre-event hook, main handler,');
console.log('   post-event hook, error handler, and cleanup/finalize callback.');
