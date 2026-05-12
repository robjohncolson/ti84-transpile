#!/usr/bin/env node

/**
 * probe-phase303-token-buffer-writer.mjs
 *
 * Traces the TOKEN BUFFER WRITER at 0x0236F9, where ALL token deposit paths
 * converge (identified in session 302). Also traces the related entry point
 * at 0x0236F1 (string copy path from 0x022470).
 *
 * Pipeline: token dispatch 0x022331 -> deposit paths -> 0x0236F9 (buffer writer)
 *
 * 1. Disassembles 0x0236F1 through ~0x023780
 * 2. Traces HL setup at callers to identify the token buffer RAM range
 * 3. Identifies port 0xDCA0 purpose
 * 4. Searches ROM for all callers of 0x0236F9 and 0x0236F1
 * 5. Searches for readers of the token buffer RAM addresses
 * 6. Prints summary
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexBytes(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    bytes.push(buf[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'ld-indexed-pair':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair.toUpperCase()}`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'inc-ixd':
      return `INC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'dec-ixd':
      return `DEC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rotate-a': return `${inst.op.toUpperCase()}A`;
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-reg': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'set-reg': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'res-reg': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'out-c-reg': return `OUT (C), ${inst.src.toUpperCase()}`;
    case 'in-reg-c': return `IN ${inst.dest.toUpperCase()}, (C)`;
    case 'block-transfer': return inst.op.toUpperCase();
    case 'block-search': return inst.op.toUpperCase();
    case 'block-io': return inst.op.toUpperCase();
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'daa': return 'DAA';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'jp-hl': return 'JP (HL)';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-r-a': return 'LD R, A';
    case 'add-pair': return `ADD HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (HL), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (HL)`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'add-ix-pair': return `ADD IX, ${inst.src.toUpperCase()}`;
    case 'add-iy-pair': return `ADD IY, ${inst.src.toUpperCase()}`;
    case 'alu-ixd':
      return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ind-imm': return `LD (HL), ${hex(inst.value, 2)}`;
    case 'ld-ixd-imm':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function disasmRange(start, end) {
  const results = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    const inst = disasmAt(pc);
    if (!inst) {
      results.push({ addr: pc, bytes: hexBytes(rom, pc, 1), text: `DB ${hex(rom[pc], 2)}`, len: 1 });
      pc++;
      continue;
    }
    results.push({
      addr: pc,
      bytes: hexBytes(rom, pc, inst.length),
      text: formatInst(inst),
      len: inst.length,
      inst,
    });
    pc += inst.length;
  }
  return results;
}

function printDisasm(rows) {
  for (const r of rows) {
    const pad = r.bytes.padEnd(20);
    console.log(`  ${hex(r.addr)}:  ${pad}  ${r.text}`);
  }
}

/**
 * Search ROM for a 4-byte CALL pattern (CD xx xx xx) targeting the given address.
 */
function findCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push(i);
    }
  }
  return results;
}

/**
 * Search ROM for references to an address in LD-pair-immediate patterns.
 * Looks for 24-bit address loads: LD HL/BC/DE, addr
 * LD HL,imm24 = 21 xx xx xx
 * LD BC,imm24 = 01 xx xx xx
 * LD DE,imm24 = 11 xx xx xx
 */
function findPairLoadsOf(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  const opcodes = [0x21, 0x01, 0x11]; // HL, BC, DE
  const names = { 0x21: 'HL', 0x01: 'BC', 0x11: 'DE' };
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (opcodes.includes(rom[i]) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, reg: names[rom[i]] });
    }
  }
  return results;
}

/**
 * Search ROM for LD A,(addr) pattern: 3A xx xx xx
 */
function findLdAMem(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0x3A && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push(i);
    }
  }
  return results;
}

/**
 * Search ROM for LD (addr),A pattern: 32 xx xx xx
 * and LD (addr),pair patterns: ED 43/53/63/73 xx xx xx
 */
function findStoresTo(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  const results = [];
  // LD (addr), A
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0x32 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: 'LD (addr), A' });
    }
  }
  // ED-prefixed stores: LD (addr), BC/DE/HL/SP
  const edStores = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i] === 0xED && edStores[rom[i + 1]] && rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
      results.push({ addr: i, type: `LD (addr), ${edStores[rom[i + 1]]}` });
    }
  }
  return results;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Disassembly of 0x0236F1..0x023780
// ═══════════════════════════════════════════════════════════════════════════

const FUNC_START = 0x0236F1;
const FUNC_END   = 0x023780;

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of token buffer writer');
console.log(`  0x0236F1 = string copy entry, 0x0236F9 = main entry`);
console.log(`  Range: ${hex(FUNC_START)}..${hex(FUNC_END)}`);
console.log('='.repeat(80));

const mainDisasm = disasmRange(FUNC_START, FUNC_END);
printDisasm(mainDisasm);

// Collect all CALL/JP targets from the disassembly for sub-tracing
const subTargets = new Set();
const ramAddresses = new Set();    // RAM addresses referenced
const portAddresses = new Set();   // Port addresses referenced

for (const r of mainDisasm) {
  if (!r.inst) continue;
  const tag = r.inst.tag;
  if ((tag === 'call' || tag === 'jp') && r.inst.target) {
    subTargets.add(r.inst.target);
  }
  if ((tag === 'call-conditional' || tag === 'jp-conditional') && r.inst.target) {
    subTargets.add(r.inst.target);
  }
  // Collect RAM addresses from LD instructions
  if (tag === 'ld-reg-mem' && r.inst.addr >= 0xD00000) {
    ramAddresses.add(r.inst.addr);
  }
  if (tag === 'ld-mem-reg' && r.inst.addr >= 0xD00000) {
    ramAddresses.add(r.inst.addr);
  }
  if (tag === 'ld-pair-imm' && r.inst.value >= 0xD00000 && r.inst.value < 0xE00000) {
    ramAddresses.add(r.inst.value);
  }
  if (tag === 'ld-pair-mem' && r.inst.addr >= 0xD00000) {
    ramAddresses.add(r.inst.addr);
  }
  if (tag === 'ld-mem-pair' && r.inst.addr >= 0xD00000) {
    ramAddresses.add(r.inst.addr);
  }
  // Collect port addresses
  if (tag === 'out-imm') portAddresses.add(r.inst.port);
  if (tag === 'in-imm') portAddresses.add(r.inst.port);
  if (tag === 'ld-pair-imm' && r.inst.value >= 0xDC00 && r.inst.value < 0xE000 && r.inst.value < 0x10000) {
    portAddresses.add(r.inst.value);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Trace CALL/JP sub-targets (first 16 instructions each)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 2: Sub-targets called/jumped from token buffer writer');
console.log('='.repeat(80));

for (const t of [...subTargets].sort((a, b) => a - b)) {
  console.log(`\n--- ${hex(t)} (first 16 instructions) ---`);
  const sub = disasmRange(t, t + 80);
  printDisasm(sub.slice(0, 16));
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: RAM addresses referenced in the function
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 3: RAM addresses referenced in token buffer writer');
console.log('='.repeat(80));

for (const addr of [...ramAddresses].sort((a, b) => a - b)) {
  console.log(`\n--- ${hex(addr)} ---`);

  // Find who loads this address into a register pair
  const pairLoads = findPairLoadsOf(addr);
  console.log(`  LD pair, ${hex(addr)}: ${pairLoads.length} references`);
  for (const pl of pairLoads.slice(0, 10)) {
    console.log(`    ${hex(pl.addr)}: LD ${pl.reg}, ${hex(addr)}`);
    // Show 3 instructions of context
    const ctx = disasmRange(pl.addr, pl.addr + 20);
    for (const c of ctx.slice(0, 4)) {
      console.log(`      ${hex(c.addr)}: ${c.text}`);
    }
  }

  // Find who reads this address directly
  const readers = findLdAMem(addr);
  console.log(`  LD A, (${hex(addr)}): ${readers.length} references`);
  for (const r of readers.slice(0, 10)) {
    console.log(`    ${hex(r)}`);
  }

  // Find who writes to this address
  const writers = findStoresTo(addr);
  console.log(`  Stores to (${hex(addr)}): ${writers.length} references`);
  for (const w of writers.slice(0, 10)) {
    console.log(`    ${hex(w.addr)}: ${w.type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: All callers of 0x0236F9 and 0x0236F1
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 4: All callers of token buffer writer');
console.log('='.repeat(80));

const callers0236F9 = findCallers(0x0236F9);
console.log(`\n--- Callers of 0x0236F9 (main entry): ${callers0236F9.length} found ---`);
for (const c of callers0236F9) {
  console.log(`  ${hex(c)}: CALL ${hex(0x0236F9)}`);
  // Trace backwards to find HL setup: disassemble 20 bytes before the CALL
  const ctxStart = Math.max(0, c - 30);
  const ctx = disasmRange(ctxStart, c + 4);
  // Show last 8 instructions before the CALL
  const beforeCall = ctx.filter(r => r.addr < c).slice(-8);
  for (const r of beforeCall) {
    const marker = (r.inst && (r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'hl')) ? ' <<<< HL setup' : '';
    console.log(`    ${hex(r.addr)}: ${r.text}${marker}`);
  }
}

const callers0236F1 = findCallers(0x0236F1);
console.log(`\n--- Callers of 0x0236F1 (string copy entry): ${callers0236F1.length} found ---`);
for (const c of callers0236F1) {
  console.log(`  ${hex(c)}: CALL ${hex(0x0236F1)}`);
  const ctxStart = Math.max(0, c - 30);
  const ctx = disasmRange(ctxStart, c + 4);
  const beforeCall = ctx.filter(r => r.addr < c).slice(-8);
  for (const r of beforeCall) {
    const marker = (r.inst && (r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'hl')) ? ' <<<< HL setup' : '';
    console.log(`    ${hex(r.addr)}: ${r.text}${marker}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Port 0xDCA0 analysis
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 5: Port 0xDCA0 analysis');
console.log('='.repeat(80));

// Search for OUT instructions to port area 0xDCA0
// OUT (C), reg uses BC as port — look for LD BC, 0xDCA0 patterns
const dca0Loads = findPairLoadsOf(0xDCA0);
console.log(`\nLD pair, 0xDCA0: ${dca0Loads.length} references`);
for (const pl of dca0Loads.slice(0, 10)) {
  console.log(`  ${hex(pl.addr)}: LD ${pl.reg}, 0xDCA0`);
  const ctx = disasmRange(pl.addr, pl.addr + 30);
  for (const c of ctx.slice(0, 6)) {
    console.log(`    ${hex(c.addr)}: ${c.text}`);
  }
}

// Also check nearby port addresses (0xDC00 range is LCD controller on TI-84 CE)
const portRange = [0xDC00, 0xDC01, 0xDC02, 0xDC03, 0xDCA0, 0xDCA1, 0xDCA2];
console.log('\nPort references in 0xDCxx range:');
for (const port of portRange) {
  const loads = findPairLoadsOf(port);
  if (loads.length > 0) {
    console.log(`  Port ${hex(port, 4)}: ${loads.length} LD-pair references`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Trace HL at the CoorMon caller (0x08C532)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 6: CoorMon caller context at 0x08C532');
console.log('='.repeat(80));

// Disassemble around the known CoorMon caller
const coormonStart = 0x08C500;
const coormonEnd = 0x08C580;
console.log(`\nDisassembly ${hex(coormonStart)}..${hex(coormonEnd)}:`);
const coormonDisasm = disasmRange(coormonStart, coormonEnd);
printDisasm(coormonDisasm);

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: Token buffer readers — search for LD A,(0xD007E0)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 7: Token buffer related RAM access');
console.log('='.repeat(80));

// Key addresses from session 302: 0xD007E0 (second byte), 0xD0058E (alt second byte)
const keyAddrs = [0xD007E0, 0xD0058E];
for (const addr of keyAddrs) {
  console.log(`\n--- ${hex(addr)} ---`);
  const readers = findLdAMem(addr);
  console.log(`  LD A, (${hex(addr)}): ${readers.length} readers`);
  for (const r of readers.slice(0, 15)) {
    console.log(`    ${hex(r)}`);
  }

  const writers = findStoresTo(addr);
  console.log(`  Stores to (${hex(addr)}): ${writers.length} writers`);
  for (const w of writers.slice(0, 15)) {
    console.log(`    ${hex(w.addr)}: ${w.type}`);
  }

  const pLoads = findPairLoadsOf(addr);
  console.log(`  LD pair, ${hex(addr)}: ${pLoads.length} references`);
  for (const pl of pLoads.slice(0, 10)) {
    console.log(`    ${hex(pl.addr)}: LD ${pl.reg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SECTION 8: SUMMARY');
console.log('='.repeat(80));

console.log(`
Token Buffer Writer Analysis:
  Main entry:        0x0236F9
  String copy entry: 0x0236F1
  Callers of 0x0236F9: ${callers0236F9.length}
  Callers of 0x0236F1: ${callers0236F1.length}
  RAM addresses referenced: ${[...ramAddresses].map(a => hex(a)).join(', ')}
  Port addresses in function: ${[...portAddresses].map(a => hex(a, 4)).join(', ') || 'none found directly'}
  LD pair loads of 0xDCA0: ${dca0Loads.length}

Key RAM addresses from session 302:
  0xD007E0 — second byte source (token value?)
  0xD0058E — alternate second byte (when first == 0x4E)

Port 0xDCA0 is in the 0xDCxx range — this is the TI-84 CE LCD controller
memory-mapped I/O space. Writing to 0xDCA0 likely triggers LCD refresh
or cursor update.
`);

console.log('Done.');
