#!/usr/bin/env node

/**
 * probe-phase301-dual-deposit.mjs
 *
 * Session 300 found two byte-for-byte identical code blocks that write
 * to scan code buffer 0xD00587:
 *
 *   Site 1: 0x003D4B — LD (0xD00587),A / SET 3,(IY+0) / OR A / RET Z / LD (0xD0058D),A / RET
 *   Site 2: 0x03F9FA — identical code, 15 bytes before _GetCSC (0x03FA09)
 *
 * This probe:
 *   1. Disassembles 30 bytes before and after each site
 *   2. Searches entire ROM for CALL/JP references to each site
 *   3. Disassembles 10 bytes before each caller for context
 *   4. Prints a comparison table: caller address, which deposit site, ISR vs foreground
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const SITE_1 = 0x003D4B;
const SITE_2 = 0x03F9FA;
const GETCS = 0x03FA09;

const SITES = [
  { addr: SITE_1, label: 'Site1 (ISR-side deposit)', searchBytes: [0x4B, 0x3D, 0x00] },
  { addr: SITE_2, label: 'Site2 (pre-_GetCSC deposit)', searchBytes: [0xFA, 0xF9, 0x03] },
];

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
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
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
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning an array of { addr, inst, bytes, text }.
 */
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

/**
 * Classify whether an address is likely ISR context or foreground.
 * Heuristic: addresses in low ROM (< 0x010000) and near known ISR vectors
 * are ISR-side; addresses near _GetCSC (0x03FA09) are foreground.
 */
function classifyContext(callerAddr, targetSite) {
  // Known ISR entry points and related addresses
  if (callerAddr < 0x010000) return 'ISR (low ROM)';
  if (callerAddr >= 0x03F900 && callerAddr <= 0x03FA20) return 'foreground (_GetCSC vicinity)';
  if (callerAddr >= 0x020000 && callerAddr < 0x030000) return 'mid-ROM (likely foreground)';
  if (callerAddr >= 0x030000) return 'high-ROM (likely foreground)';
  return 'unknown';
}

// ── Section 1: Disassemble 30 bytes before/after each deposit site ─────────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly around dual deposit sites (+/- 30 bytes)');
console.log('='.repeat(80));

for (const site of SITES) {
  const rangeStart = Math.max(0, site.addr - 30);
  const rangeEnd = Math.min(rom.length, site.addr + 30);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${site.label} at ${hex(site.addr)}  (range ${hex(rangeStart)}..${hex(rangeEnd)})`);
  console.log('─'.repeat(70));

  const lines = disasmRange(rangeStart, rangeEnd);
  for (const line of lines) {
    const marker = (line.addr === site.addr) ? ' <<< DEPOSIT' : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}${marker}`);
  }
}

// ── Section 2: Compare raw bytes of the two deposit blocks ─────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Byte-for-byte comparison of deposit blocks (15 bytes each)');
console.log('='.repeat(80));

const BLOCK_LEN = 15;
const site1Bytes = hexBytes(rom, SITE_1, BLOCK_LEN);
const site2Bytes = hexBytes(rom, SITE_2, BLOCK_LEN);

console.log(`\n  Site 1 (${hex(SITE_1)}): ${site1Bytes}`);
console.log(`  Site 2 (${hex(SITE_2)}): ${site2Bytes}`);
console.log(`  Identical: ${site1Bytes === site2Bytes ? 'YES' : 'NO'}`);

if (site1Bytes !== site2Bytes) {
  console.log('  Byte-by-byte diff:');
  for (let i = 0; i < BLOCK_LEN; i++) {
    const b1 = rom[SITE_1 + i];
    const b2 = rom[SITE_2 + i];
    if (b1 !== b2) {
      console.log(`    offset +${i}: Site1=${hex(b1, 2)} Site2=${hex(b2, 2)}`);
    }
  }
}

// ── Section 3: Search entire ROM for CALL/JP references to each site ───────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: CALL/JP references to each deposit site');
console.log('='.repeat(80));

const allCallers = [];

for (const site of SITES) {
  const [lo, mid, hi] = site.searchBytes;

  console.log(`\nSearching for references to ${hex(site.addr)} (bytes: ${hex(lo, 2)} ${hex(mid, 2)} ${hex(hi, 2)})...`);

  for (let i = 0; i < rom.length - 3; i++) {
    // Check for CALL imm24 (opcode CD) or JP imm24 (opcode C3)
    // Also check conditional CALL (C4/CC/D4/DC/E4/EC/F4/FC) and JP (C2/CA/D2/DA/E2/EA/F2/FA)
    const opcode = rom[i];
    let callType = null;

    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      if (opcode === 0xCD) callType = 'CALL';
      else if (opcode === 0xC3) callType = 'JP';
      else if (opcode === 0xC4) callType = 'CALL NZ,';
      else if (opcode === 0xCC) callType = 'CALL Z,';
      else if (opcode === 0xD4) callType = 'CALL NC,';
      else if (opcode === 0xDC) callType = 'CALL C,';
      else if (opcode === 0xE4) callType = 'CALL PO,';
      else if (opcode === 0xEC) callType = 'CALL PE,';
      else if (opcode === 0xF4) callType = 'CALL P,';
      else if (opcode === 0xFC) callType = 'CALL M,';
      else if (opcode === 0xC2) callType = 'JP NZ,';
      else if (opcode === 0xCA) callType = 'JP Z,';
      else if (opcode === 0xD2) callType = 'JP NC,';
      else if (opcode === 0xDA) callType = 'JP C,';
      else if (opcode === 0xE2) callType = 'JP PO,';
      else if (opcode === 0xEA) callType = 'JP PE,';
      else if (opcode === 0xF2) callType = 'JP P,';
      else if (opcode === 0xFA) callType = 'JP M,';
    }

    if (callType) {
      const context = classifyContext(i, site.addr);
      allCallers.push({
        callerAddr: i,
        callType,
        targetSite: site.label,
        targetAddr: site.addr,
        context,
      });
      console.log(`  ${hex(i)}  ${callType} ${hex(site.addr)}  [${context}]`);
    }
  }
}

console.log(`\nTotal callers found: ${allCallers.length}`);

// ── Section 4: Disassembly context before each caller ──────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: 10-byte context before each caller');
console.log('='.repeat(80));

for (const caller of allCallers) {
  const contextStart = Math.max(0, caller.callerAddr - 10);
  const contextEnd = caller.callerAddr + 4; // include the CALL/JP instruction itself

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Caller at ${hex(caller.callerAddr)}: ${caller.callType} ${hex(caller.targetAddr)}`);
  console.log(`Target: ${caller.targetSite}   Context: ${caller.context}`);
  console.log('─'.repeat(70));

  const lines = disasmRange(contextStart, contextEnd);
  for (const line of lines) {
    const marker = (line.addr === caller.callerAddr) ? ' <<< CALLER' : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}${marker}`);
  }
}

// ── Section 5: Comparison table ────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: Comparison table — all callers');
console.log('='.repeat(80));

console.log('');
console.log('  Caller Addr   | Call Type   | Deposit Site                    | Context');
console.log('  ' + '─'.repeat(75));

for (const caller of allCallers) {
  const addr = hex(caller.callerAddr);
  const type = caller.callType.padEnd(11);
  const site = caller.targetSite.padEnd(31);
  const ctx = caller.context;
  console.log(`  ${addr}   | ${type} | ${site} | ${ctx}`);
}

// ── Section 6: Summary ────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: Summary');
console.log('='.repeat(80));

const site1Callers = allCallers.filter(c => c.targetAddr === SITE_1);
const site2Callers = allCallers.filter(c => c.targetAddr === SITE_2);

console.log(`\nDeposit Site 1 (${hex(SITE_1)}): ${site1Callers.length} callers`);
for (const c of site1Callers) {
  console.log(`  ${hex(c.callerAddr)}  ${c.callType}  [${c.context}]`);
}

console.log(`\nDeposit Site 2 (${hex(SITE_2)}): ${site2Callers.length} callers`);
for (const c of site2Callers) {
  console.log(`  ${hex(c.callerAddr)}  ${c.callType}  [${c.context}]`);
}

console.log(`\nDeposit blocks identical: ${site1Bytes === site2Bytes ? 'YES' : 'NO'}`);
console.log(`Site 2 is ${GETCS - SITE_2} bytes before _GetCSC (${hex(GETCS)})`);
console.log('\nDone.');
