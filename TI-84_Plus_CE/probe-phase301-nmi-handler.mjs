#!/usr/bin/env node

/**
 * probe-phase301-nmi-handler.mjs
 *
 * The keyboard scanner wrapper at 0x015930 JPs to 0x000066 (eZ80 NMI vector)
 * on stack bounds failure. This is the OS crash/stack overflow handler.
 *
 * 1. Disassembles 0x000066 through ~0x000120 (or until invalid code/RET)
 * 2. Follows any JP/CALL targets within first 2 levels of indirection
 * 3. Searches ROM for all JP/CALL references to 0x000066
 * 4. Identifies what the OS does on stack overflow (error display? reset? reboot?)
 * 5. Prints summary of NMI behavior
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const NMI_VECTOR = 0x000066;
const NMI_DISASM_END = 0x000120;

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
 * Disassemble a range, returning an array of { addr, inst, bytes, text, len }.
 * Stops early at RET/RETN/RETI if stopAtRet is true.
 */
function disasmRange(start, end, { stopAtRet = false } = {}) {
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
    if (stopAtRet && (inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti')) {
      break;
    }
    pc += inst.length;
  }
  return results;
}

/**
 * Extract JP/CALL targets from disassembled lines.
 */
function extractBranchTargets(lines) {
  const targets = [];
  for (const line of lines) {
    if (!line.inst) continue;
    const tag = line.inst.tag;
    if (tag === 'jp' || tag === 'jp-conditional' || tag === 'call' || tag === 'call-conditional') {
      const target = line.inst.target;
      if (target !== undefined && target < 0x400000) {
        targets.push({
          from: line.addr,
          target,
          type: tag.startsWith('call') ? 'CALL' : 'JP',
          text: line.text,
        });
      }
    }
  }
  return targets;
}

// ── Section 1: Disassemble NMI handler at 0x000066 ────────────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: NMI handler disassembly (0x000066 .. 0x000120)');
console.log('='.repeat(80));

const nmiLines = disasmRange(NMI_VECTOR, NMI_DISASM_END);
for (const line of nmiLines) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
}

// Collect branch targets from NMI handler (level 1)
const level1Targets = extractBranchTargets(nmiLines);

console.log(`\nBranch targets found in NMI handler: ${level1Targets.length}`);
for (const t of level1Targets) {
  console.log(`  ${hex(t.from)}  ${t.type} -> ${hex(t.target)}  (${t.text})`);
}

// ── Section 2: Follow branch targets (level 1 + level 2) ──────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Branch target disassembly (up to 2 levels of indirection)');
console.log('='.repeat(80));

const visited = new Set();
visited.add(NMI_VECTOR);

const level2Targets = [];

for (const t of level1Targets) {
  if (visited.has(t.target)) continue;
  visited.add(t.target);

  const targetEnd = Math.min(t.target + 64, rom.length);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Level 1: ${t.type} target ${hex(t.target)} (from ${hex(t.from)})`);
  console.log('─'.repeat(70));

  const targetLines = disasmRange(t.target, targetEnd, { stopAtRet: true });
  for (const line of targetLines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }

  // Collect level 2 targets
  const sub = extractBranchTargets(targetLines);
  for (const s of sub) {
    level2Targets.push(s);
  }
}

// Level 2
for (const t of level2Targets) {
  if (visited.has(t.target)) continue;
  visited.add(t.target);

  const targetEnd = Math.min(t.target + 64, rom.length);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Level 2: ${t.type} target ${hex(t.target)} (from ${hex(t.from)})`);
  console.log('─'.repeat(70));

  const targetLines = disasmRange(t.target, targetEnd, { stopAtRet: true });
  for (const line of targetLines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }
}

// ── Section 3: Full ROM scan for JP/CALL to 0x000066 ──────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: Full ROM scan for JP/CALL references to 0x000066');
console.log('='.repeat(80));

// 0x000066 in little-endian = 0x66 0x00 0x00
const nmi_lo = NMI_VECTOR & 0xFF;          // 0x66
const nmi_mid = (NMI_VECTOR >> 8) & 0xFF;  // 0x00
const nmi_hi = (NMI_VECTOR >> 16) & 0xFF;  // 0x00

// JP opcodes: C3 (JP), C2 (JP NZ), CA (JP Z), D2 (JP NC), DA (JP C),
//             E2 (JP PO), EA (JP PE), F2 (JP P), FA (JP M)
// CALL opcodes: CD (CALL), C4 (CALL NZ), CC (CALL Z), D4 (CALL NC), DC (CALL C),
//               E4 (CALL PO), EC (CALL PE), F4 (CALL P), FC (CALL M)
const jpOpcodes = new Set([0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);
const callOpcodes = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
const allBranchOpcodes = new Set([...jpOpcodes, ...callOpcodes]);

const nmiRefs = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === nmi_lo && rom[i + 2] === nmi_mid && rom[i + 3] === nmi_hi) {
    const opcode = rom[i];
    if (allBranchOpcodes.has(opcode)) {
      let type;
      if (jpOpcodes.has(opcode)) {
        type = 'JP';
        if (opcode !== 0xC3) {
          const condMap = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
          type = `JP ${condMap[opcode] || '?'}`;
        }
      } else {
        type = 'CALL';
        if (opcode !== 0xCD) {
          const condMap = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
          type = `CALL ${condMap[opcode] || '?'}`;
        }
      }
      nmiRefs.push({ addr: i, type, bytes: hexBytes(rom, i, 4) });
    }
  }
}

console.log(`\nFound ${nmiRefs.length} JP/CALL references to ${hex(NMI_VECTOR)}:\n`);

for (const ref of nmiRefs) {
  console.log(`  ${hex(ref.addr)}  ${ref.type.padEnd(10)}  [${ref.bytes}]`);

  // Show context: disassemble a few instructions before and after
  const ctxStart = Math.max(0, ref.addr - 12);
  const ctxEnd = Math.min(rom.length, ref.addr + 16);
  const ctxLines = disasmRange(ctxStart, ctxEnd);
  for (const line of ctxLines) {
    const marker = (line.addr === ref.addr) ? ' <<<' : '';
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}${marker}`);
  }
  console.log();
}

// ── Section 4: Behavior analysis ──────────────────────────────────────────────

console.log(`${'='.repeat(80)}`);
console.log('SECTION 4: NMI handler behavior analysis');
console.log('='.repeat(80));

// Analyze the NMI handler for clues about what it does
const behaviorClues = [];

for (const line of nmiLines) {
  if (!line.inst) continue;
  const tag = line.inst.tag;
  const text = line.text;

  // Look for RST instructions (OS syscalls on TI)
  if (tag === 'rst') {
    behaviorClues.push(`RST at ${hex(line.addr)}: ${text} — OS syscall / reset vector`);
  }
  // Look for port I/O (hardware reset?)
  if (tag === 'out-imm' || tag === 'in-imm') {
    behaviorClues.push(`I/O at ${hex(line.addr)}: ${text} — hardware port access`);
  }
  // Look for DI (disable interrupts — crash handler typically does this)
  if (tag === 'di') {
    behaviorClues.push(`DI at ${hex(line.addr)}: interrupts disabled — typical crash/reset behavior`);
  }
  // Look for HALT
  if (tag === 'halt') {
    behaviorClues.push(`HALT at ${hex(line.addr)}: CPU halted — system frozen / waiting for interrupt`);
  }
  // Look for infinite loops (JP to self or nearby)
  if (tag === 'jp' && line.inst.target !== undefined) {
    const dist = Math.abs(line.inst.target - line.addr);
    if (dist === 0) {
      behaviorClues.push(`INFINITE LOOP at ${hex(line.addr)}: JP to self — system hang`);
    } else if (dist <= 4) {
      behaviorClues.push(`TIGHT LOOP at ${hex(line.addr)}: JP ${hex(line.inst.target)} — near-self jump`);
    }
  }
  // Look for writes to known OS error/status addresses
  if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair') {
    const addr = line.inst.addr;
    if (addr >= 0xD00000 && addr <= 0xD3FFFF) {
      behaviorClues.push(`RAM write at ${hex(line.addr)}: ${text} — OS state update`);
    }
  }
  // Look for SP manipulation (stack reset)
  if (tag === 'ld-sp-hl' || (tag === 'ld-pair-imm' && line.inst.pair === 'sp')) {
    behaviorClues.push(`STACK RESET at ${hex(line.addr)}: ${text} — reinitializing stack pointer`);
  }
}

if (behaviorClues.length > 0) {
  console.log('\nBehavior clues found in NMI handler:');
  for (const clue of behaviorClues) {
    console.log(`  * ${clue}`);
  }
} else {
  console.log('\nNo obvious behavior clues found in direct NMI handler code.');
}

// Also check level-1 targets for behavior clues
console.log('\nBehavior clues from branch targets:');
for (const t of level1Targets) {
  const targetEnd = Math.min(t.target + 64, rom.length);
  const targetLines = disasmRange(t.target, targetEnd, { stopAtRet: true });

  for (const line of targetLines) {
    if (!line.inst) continue;
    const tag = line.inst.tag;

    if (tag === 'di') {
      console.log(`  * DI at ${hex(line.addr)} (in ${hex(t.target)}): interrupts disabled`);
    }
    if (tag === 'halt') {
      console.log(`  * HALT at ${hex(line.addr)} (in ${hex(t.target)}): CPU halted`);
    }
    if (tag === 'rst') {
      console.log(`  * RST at ${hex(line.addr)} (in ${hex(t.target)}): ${line.text}`);
    }
    if (tag === 'jp' && line.inst.target !== undefined && Math.abs(line.inst.target - line.addr) === 0) {
      console.log(`  * INFINITE LOOP at ${hex(line.addr)} (in ${hex(t.target)}): JP to self`);
    }
    if (tag === 'ld-sp-hl' || (tag === 'ld-pair-imm' && line.inst.pair === 'sp')) {
      console.log(`  * STACK RESET at ${hex(line.addr)} (in ${hex(t.target)}): ${line.text}`);
    }
    if (tag === 'out-imm' || tag === 'in-imm') {
      console.log(`  * I/O at ${hex(line.addr)} (in ${hex(t.target)}): ${line.text}`);
    }
  }
}

// ── Section 5: Summary ──────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: Summary');
console.log('='.repeat(80));

console.log(`\nNMI vector address: ${hex(NMI_VECTOR)}`);
console.log(`Total JP/CALL references to NMI vector: ${nmiRefs.length}`);

const jpRefs = nmiRefs.filter(r => r.type.startsWith('JP'));
const callRefs = nmiRefs.filter(r => r.type.startsWith('CALL'));
console.log(`  JP references:   ${jpRefs.length}  — ${jpRefs.map(r => hex(r.addr)).join(', ') || 'none'}`);
console.log(`  CALL references: ${callRefs.length}  — ${callRefs.map(r => hex(r.addr)).join(', ') || 'none'}`);

console.log(`\nLevel-1 branch targets from NMI handler: ${level1Targets.length}`);
for (const t of level1Targets) {
  console.log(`  ${hex(t.target)} (${t.type} from ${hex(t.from)})`);
}

console.log(`\nLevel-2 branch targets: ${level2Targets.length}`);
for (const t of level2Targets) {
  console.log(`  ${hex(t.target)} (${t.type} from ${hex(t.from)})`);
}

console.log(`\nKey finding: The eZ80 NMI at 0x000066 is the OS crash/stack-overflow handler.`);
console.log(`Callers (like keyboard scanner at 0x015930) JP here on fatal stack bounds failure.`);
console.log(`Behavior analysis above shows what the OS does: error display, reset, or reboot.\n`);

console.log('Done.');
