#!/usr/bin/env node
// Phase 583 — Decode 0x0855B1: Token classifier called by 0x0223CE
// Raw decode shows: LD A,D / CP 0xFC / JR NZ +0x0B / LD A,E / CP 0x41 / JR NC +0x1D / SUB 0x3C / RET C / ADD A,0x05 / RET
// Two JR branch targets to follow: 0x0855C1 (NZ path) and 0x0855D8 (NC path)
// Goal: full disassembly of main path + both branch targets, caller xrefs, classification logic analysis

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const ENTRY = 0x0855B1;
const BRANCH_NZ = 0x0855C1;  // JR NZ target
const BRANCH_NC = 0x0855D8;  // JR NC target

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

// Format a decoded instruction into a human-readable mnemonic string
// Copied exactly from probe-phase582-decode-0A32F9.mjs
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'NOP'; break;
    case 'halt': text = 'HALT'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'daa': text = 'DAA'; break;
    case 'cpl': text = 'CPL'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'ex-sp-hl': text = 'EX (SP), HL'; break;
    case 'ex-sp-pair': text = `EX (SP), ${inst.pair.toUpperCase()}`; break;
    case 'neg': text = 'NEG'; break;
    case 'retn': text = 'RETN'; break;
    case 'reti': text = 'RETI'; break;
    case 'rrd': text = 'RRD'; break;
    case 'rld': text = 'RLD'; break;
    case 'ldi': text = 'LDI'; break;
    case 'ldd': text = 'LDD'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpi': text = 'CPI'; break;
    case 'cpd': text = 'CPD'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'ini': text = 'INI'; break;
    case 'outi': text = 'OUTI'; break;
    case 'ind': text = 'IND'; break;
    case 'outd': text = 'OUTD'; break;
    case 'inir': text = 'INIR'; break;
    case 'otir': text = 'OTIR'; break;
    case 'indr': text = 'INDR'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'otimr': text = 'OTIMR'; break;
    case 'slp': text = 'SLP'; break;
    case 'stmix': text = 'STMIX'; break;
    case 'rsmix': text = 'RSMIX'; break;
    case 'ld-mb-a': text = 'LD MB, A'; break;
    case 'ld-a-mb': text = 'LD A, MB'; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${inst.pair.toUpperCase()}`; break;
    case 'im': text = `IM ${inst.value}`; break;
    case 'ld-special': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`; break;
    case 'ld-reg-imm': text = `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ind': text = `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-reg': text = `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`; break;
    case 'ld-ind-imm': text = `LD (HL), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ixd':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-ixd-imm':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `INC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `DEC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op.toUpperCase()} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`; break;
    case 'alu-ixd':
      text = `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${inst.indirectRegister.toUpperCase()})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'rst': text = `RST ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `INC ${inst.pair.toUpperCase()}`; break;
    case 'dec-pair': text = `DEC ${inst.pair.toUpperCase()}`; break;
    case 'inc-reg': text = `INC ${inst.reg.toUpperCase()}`; break;
    case 'dec-reg': text = `DEC ${inst.reg.toUpperCase()}`; break;
    case 'add-pair': text = `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'adc-pair': text = `ADC HL, ${inst.src.toUpperCase()}`; break;
    case 'sbc-pair': text = `SBC HL, ${inst.src.toUpperCase()}`; break;
    case 'mlt': text = `MLT ${inst.reg.toUpperCase()}`; break;
    case 'rotate-reg': text = `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`; break;
    case 'rotate-ind': text = `${inst.op.toUpperCase()} (HL)`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (HL)`; break;
    case 'bit-res': text = `RES ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (HL)`; break;
    case 'bit-set': text = `SET ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (HL)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'in-imm': text = `IN A, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `OUT (C), ${inst.reg.toUpperCase()}`; break;
    case 'in-reg': text = `IN ${inst.reg.toUpperCase()}, (C)`; break;
    case 'in0': text = `IN0 ${inst.reg.toUpperCase()}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `OUT0 (${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`; break;
    case 'tst-reg': text = `TST A, ${inst.reg.toUpperCase()}`; break;
    case 'tst-ind': text = 'TST A, (HL)'; break;
    case 'tst-imm': text = `TST A, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `TSTIO ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.pair.toUpperCase()}`;
      break;
    case 'ld-ixiy-indexed':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-pair-ind': text = `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-pair': text = `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`; break;
    default: text = t.toUpperCase(); break;
  }
  return `${prefix}${text}`;
}

// Classify instruction for inventory
function classifyTag(inst) {
  const tags = [];
  const t = inst.tag;
  if (t === 'call' || t === 'call-conditional') tags.push('CALL');
  if (t === 'jp' || t === 'jp-conditional' || t === 'jp-indirect') tags.push('JP');
  if (t === 'jr' || t === 'jr-conditional') tags.push('JR');
  if (t === 'ret' || t === 'ret-conditional') tags.push('RET');
  if (t === 'djnz') tags.push('DJNZ');
  if (inst.indexRegister === 'iy' || inst.pair === 'iy' ||
      inst.dest === 'iy' || inst.src === 'iy' || inst.base === 'iy') {
    tags.push('IY');
  }
  const addr = inst.addr ?? inst.target ?? inst.value;
  if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xDFFFFF) tags.push('RAM');
  return tags;
}

// Disassemble a region, returning structured records
function disasmRegion(start, maxBytes, label) {
  const instructions = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end && pc < rom.length) {
    let decoded;
    try {
      decoded = decodeInstruction(rom, pc, 'adl');
    } catch (e) {
      decoded = { tag: 'unknown', length: 1, pc };
    }
    if (!decoded || !decoded.length) {
      decoded = { tag: 'unknown', length: 1, pc };
    }

    const mnemonic = formatInstruction(decoded);
    const rawBytes = Array.from(rom.subarray(pc, pc + decoded.length))
      .map(b => hexByte(b)).join(' ');
    const tags = classifyTag(decoded);

    instructions.push({ address: pc, rawBytes, length: decoded.length, mnemonic, tags, decoded });
    pc += decoded.length;
  }

  return { label, start, instructions, endPC: pc };
}

// =========================================================================
// 1. Disassemble the main entry path (0x0855B1) — enough to cover the short main block
// =========================================================================

const mainBlock = disasmRegion(ENTRY, 40, 'MAIN ENTRY (0x0855B1)');

// =========================================================================
// 2. Disassemble the JR NZ target at 0x0855C1 — the D >= 0xFC path but D != 0xFC
// =========================================================================

const branchNZ = disasmRegion(BRANCH_NZ, 100, 'JR NZ PATH (0x0855C1) — D != 0xFC');

// =========================================================================
// 3. Disassemble the JR NC target at 0x0855D8 — the E >= 0x41 path (when D == 0xFC)
// =========================================================================

const branchNC = disasmRegion(BRANCH_NC, 100, 'JR NC PATH (0x0855D8) — D==0xFC, E >= 0x41');

// =========================================================================
// 4. Scan raw ROM for CALL/JP to 0x0855B1 (byte patterns CD B1 55 08 / C3 B1 55 08)
// =========================================================================

function scanRawXrefs(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const results = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const opcode = rom[i];
      if (opcode === 0xCD) {
        results.push({ addr: i, type: 'CALL' });
      } else if (opcode === 0xC3) {
        results.push({ addr: i, type: 'JP' });
      }
      // Conditional calls: 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC
      else if ((opcode & 0xC7) === 0xC4) {
        const conds = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
        const idx = (opcode >> 3) & 0x07;
        results.push({ addr: i, type: `CALL ${conds[idx]}` });
      }
      // Conditional JPs: 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA
      else if ((opcode & 0xC7) === 0xC2) {
        const conds = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
        const idx = (opcode >> 3) & 0x07;
        results.push({ addr: i, type: `JP ${conds[idx]}` });
      }
    }
  }
  return results;
}

// =========================================================================
// Output
// =========================================================================

console.log('=== Phase 583: Decode 0x0855B1 — Token Classifier ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom`);
console.log(`Entry: ${hex(ENTRY)}`);
console.log(`Branch NZ target: ${hex(BRANCH_NZ)}`);
console.log(`Branch NC target: ${hex(BRANCH_NC)}`);
console.log('');

// Print each disassembled region
for (const block of [mainBlock, branchNZ, branchNC]) {
  console.log(`=== ${block.label} ===`);
  console.log(`Range: ${hex(block.start)} .. ${hex(block.endPC - 1)} (${block.endPC - block.start} bytes, ${block.instructions.length} insns)`);

  for (const ins of block.instructions) {
    const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
    console.log(`${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
  }
  console.log('');

  // Inventory for this block
  const calls = block.instructions.filter(i => i.tags.includes('CALL'));
  const jps = block.instructions.filter(i => i.tags.includes('JP'));
  const jrs = block.instructions.filter(i => i.tags.includes('JR'));
  const rets = block.instructions.filter(i => i.tags.includes('RET'));

  if (calls.length) {
    console.log(`  CALLs (${calls.length}):`);
    for (const c of calls) console.log(`    ${hex(c.address)}  ${c.mnemonic}`);
  }
  if (jps.length) {
    console.log(`  JPs (${jps.length}):`);
    for (const j of jps) console.log(`    ${hex(j.address)}  ${j.mnemonic}`);
  }
  if (jrs.length) {
    console.log(`  JRs (${jrs.length}):`);
    for (const j of jrs) console.log(`    ${hex(j.address)}  ${j.mnemonic}`);
  }
  if (rets.length) {
    console.log(`  RETs (${rets.length}):`);
    for (const r of rets) console.log(`    ${hex(r.address)}  ${r.mnemonic}`);
  }
  console.log('');
}

// =========================================================================
// Caller xref scan
// =========================================================================

console.log('=== CALLER XREFS (raw ROM byte scan for CD/C3 B1 55 08) ===');
const xrefs = scanRawXrefs(ENTRY);
if (xrefs.length === 0) {
  console.log('  No CALL/JP xrefs found to 0x0855B1');
} else {
  console.log(`  Found ${xrefs.length} xref(s):`);
  for (const x of xrefs) {
    // Decode the instruction at that address for context
    let context = '';
    try {
      const surrounding = disasmRegion(Math.max(0, x.addr - 8), 24, 'ctx');
      const nearby = surrounding.instructions
        .filter(i => Math.abs(i.address - x.addr) <= 8)
        .map(i => `${hex(i.address)} ${i.mnemonic}`)
        .join(' | ');
      context = ` [${nearby}]`;
    } catch (e) { /* ignore */ }
    console.log(`  ${hex(x.addr)}  ${x.type}${context}`);
  }
}
console.log('');

// =========================================================================
// Also scan for xrefs to the branch targets (someone might jump directly)
// =========================================================================

console.log('=== XREFS to branch targets ===');
for (const [label, addr] of [['0x0855C1 (NZ path)', BRANCH_NZ], ['0x0855D8 (NC path)', BRANCH_NC]]) {
  const refs = scanRawXrefs(addr);
  if (refs.length === 0) {
    console.log(`  ${label}: no external CALL/JP xrefs`);
  } else {
    console.log(`  ${label}: ${refs.length} xref(s)`);
    for (const x of refs) {
      console.log(`    ${hex(x.addr)}  ${x.type}`);
    }
  }
}
console.log('');

// =========================================================================
// Classification logic analysis
// =========================================================================

console.log('=== CLASSIFICATION LOGIC ANALYSIS ===');
console.log('');
console.log('Input: DE register pair (D = high byte, E = low byte of token)');
console.log('');
console.log('Main entry 0x0855B1:');
console.log('  LD A, D       — load high byte');
console.log('  CP 0xFC       — is D == 0xFC? (single-byte token prefix)');
console.log('  JR NZ, 0x0855C1 — if D != 0xFC, go to multi-byte token handler');
console.log('  LD A, E       — D == 0xFC: load low byte');
console.log('  CP 0x41       — is E >= 0x41?');
console.log('  JR NC, 0x0855D8 — if E >= 0x41, go to upper-range handler');
console.log('  SUB 0x3C      — E < 0x41: subtract 0x3C (range 0x3C..0x40 maps to 0..4)');
console.log('  RET C         — if E < 0x3C, carry set → return (invalid/unhandled)');
console.log('  ADD A, 0x05   — add 5 (range 0x3C..0x40 maps to 5..9)');
console.log('  RET           — return with A = classification code');
console.log('');
console.log('Token range mapping (main path, D==0xFC):');
console.log('  E < 0x3C  → RET with carry (unclassified / error)');
console.log('  E = 0x3C  → A = 0x3C - 0x3C + 0x05 = 0x05');
console.log('  E = 0x3D  → A = 0x3D - 0x3C + 0x05 = 0x06');
console.log('  E = 0x3E  → A = 0x3E - 0x3C + 0x05 = 0x07');
console.log('  E = 0x3F  → A = 0x3F - 0x3C + 0x05 = 0x08');
console.log('  E = 0x40  → A = 0x40 - 0x3C + 0x05 = 0x09');
console.log('  E >= 0x41 → handled at 0x0855D8 (branch NC path)');
console.log('');

// =========================================================================
// Dump raw bytes around entry for verification
// =========================================================================

console.log('=== RAW BYTES at entry ===');
const RAW_DUMP_LEN = 64;
const rawStart = ENTRY;
const rawBytes = Array.from(rom.subarray(rawStart, rawStart + RAW_DUMP_LEN));
for (let i = 0; i < RAW_DUMP_LEN; i += 16) {
  const slice = rawBytes.slice(i, i + 16);
  const hexStr = slice.map(b => hexByte(b)).join(' ');
  const addr = rawStart + i;
  console.log(`${hex(addr)}  ${hexStr}`);
}
console.log('');

// =========================================================================
// Collect all unique CALL targets across all blocks for sub-function preview
// =========================================================================

console.log('=== SUB-FUNCTION PREVIEWS (CALL targets from all blocks) ===');
const allCallTargets = new Set();
for (const block of [mainBlock, branchNZ, branchNC]) {
  for (const ins of block.instructions) {
    const d = ins.decoded;
    if ((d.tag === 'call' || d.tag === 'call-conditional') && typeof d.target === 'number') {
      allCallTargets.add(d.target);
    }
  }
}

if (allCallTargets.size === 0) {
  console.log('  No CALL targets found in any block.');
} else {
  for (const target of [...allCallTargets].sort((a, b) => a - b)) {
    console.log(`\n  --- Sub-function at ${hex(target)} ---`);
    const sub = disasmRegion(target, 40, `sub_${hex(target)}`);
    for (const ins of sub.instructions) {
      const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
      console.log(`  ${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
    }
  }
}
console.log('');

// =========================================================================
// Summary
// =========================================================================

console.log('=== SUMMARY ===');
const totalInsns = mainBlock.instructions.length + branchNZ.instructions.length + branchNC.instructions.length;
const totalBytes = (mainBlock.endPC - mainBlock.start) + (branchNZ.endPC - branchNZ.start) + (branchNC.endPC - branchNC.start);
console.log(`Total instructions decoded: ${totalInsns} across 3 blocks (${totalBytes} bytes)`);
console.log(`Main block: ${mainBlock.instructions.length} insns, ${mainBlock.endPC - mainBlock.start}B`);
console.log(`NZ branch: ${branchNZ.instructions.length} insns, ${branchNZ.endPC - branchNZ.start}B`);
console.log(`NC branch: ${branchNC.instructions.length} insns, ${branchNC.endPC - branchNC.start}B`);
console.log(`Callers of 0x0855B1: ${xrefs.length}`);
console.log(`Sub-function targets: ${allCallTargets.size}`);
console.log('');
console.log('DONE');
