#!/usr/bin/env node

/**
 * Phase 223: Find what OS code produces magic A values (0xFA-0xFE)
 * for the key classifier at 0x05C52C.
 *
 * Magic A values decoded in session 222:
 *   A=0xFE → Fn table
 *   A=0xFC → 2nd table
 *   A=0xFB → Alpha table
 *   A=0xFA → AlphaLock table
 *   Other  → SUB 0x5A → primary table
 *
 * Strategy:
 *   1. Scan ROM for LD A,0xFA / 0xFB / 0xFC / 0xFE (opcode 3E xx)
 *   2. Find all CALL sites for ConvKeyToTok (0x05E630) and key classifier (0x05C52C)
 *   3. Cross-reference: which LD A,0xF? are near a CALL to those targets?
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const EXEC_END = 0x0C0000; // executable region limit

const MAGIC_VALUES = [
  { value: 0xFA, label: 'AlphaLock table' },
  { value: 0xFB, label: 'Alpha table' },
  { value: 0xFC, label: '2nd table' },
  { value: 0xFE, label: 'Fn table' },
];

// CALL targets of interest (little-endian 3-byte addresses after CD opcode)
const CALL_TARGETS = [
  { target: 0x05E630, label: 'ConvKeyToTok', bytes: [0xCD, 0x30, 0xE6, 0x05] },
  { target: 0x05C52C, label: 'KeyClassifier', bytes: [0xCD, 0x2C, 0xC5, 0x05] },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const sliceStart = Math.max(0, start);
  const sliceEnd = Math.min(rom.length, sliceStart + length);
  return Array.from(rom.slice(sliceStart, sliceEnd), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function regionLabel(addr) {
  if (addr <= 0x00FFFF) return 'Boot/reset vectors';
  if (addr <= 0x04FFFF) return 'OS core/services';
  if (addr <= 0x06FFFF) return 'cxMain/editor/keyboard';
  if (addr <= 0x08FFFF) return 'FP/math/display';
  if (addr <= 0x0AFFFF) return 'STAT/apps/upper OS';
  return '0x0B0000+ extra upper ROM';
}

function matchBytes(buffer, address, pattern) {
  if (address < 0 || address + pattern.length > buffer.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (buffer[address + i] !== pattern[i]) return false;
  }
  return true;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return { pc, length: 1, tag: 'decode-error', errorMessage: error?.message ?? String(error) };
  }
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((0xD0 & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'cp-reg': return `${prefix}cp ${inst.src}`;
    case 'cp-imm': return `${prefix}cp ${hexByte(inst.value)}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function collectBefore(target, count, lookbackBytes = 96) {
  const rows = [];
  let pc = Math.max(0, target - lookbackBytes);
  while (pc < target) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows.filter((inst) => inst.pc < target).slice(-count);
}

function collectAfter(target, count) {
  const rows = [];
  let pc = target;
  while (rows.length < count && pc < rom.length) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows;
}

function formatContext(target, before = 5, after = 5) {
  return [...collectBefore(target, before), ...collectAfter(target, after + 1)].map((inst) => {
    const marker = inst.pc === target ? '=>' : '  ';
    const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
    const text = inst.tag === 'decode-error'
      ? `decode-error: ${inst.errorMessage}`
      : formatInstruction(inst);
    return `${marker} ${hex(inst.pc)}  ${bytes} ${text}`;
  });
}

// ── Section 1: Scan for LD A, 0xF? ──

console.log('=== Phase 223: Magic A Value Producers for Key Classifier ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Scan region: 0x000000 - ${hex(EXEC_END)}`);
console.log();

const magicHits = new Map(); // value → [{addr}]
for (const { value, label } of MAGIC_VALUES) {
  const hits = [];
  for (let addr = 0; addr < EXEC_END - 1; addr++) {
    if (rom[addr] === 0x3E && rom[addr + 1] === value) {
      hits.push({ addr, value, label });
    }
  }
  magicHits.set(value, hits);
  console.log(`LD A,${hex(value, 2)} (${label}): ${hits.length} hits`);
}
console.log();

// ── Section 2: Scan for CALL sites to ConvKeyToTok and KeyClassifier ──

const callHits = new Map(); // target → [{addr}]
for (const { target, label, bytes } of CALL_TARGETS) {
  const hits = [];
  for (let addr = 0; addr < EXEC_END - bytes.length; addr++) {
    if (matchBytes(rom, addr, bytes)) {
      hits.push({ addr, target, label });
    }
  }
  callHits.set(target, hits);
  console.log(`CALL ${label} (${hex(target)}): ${hits.length} call sites`);
}
console.log();

// ── Section 3: Detailed LD A,0xF? hits ──

for (const { value, label } of MAGIC_VALUES) {
  const hits = magicHits.get(value);
  console.log(`\n========================================`);
  console.log(`  LD A,${hex(value, 2)}  —  ${label}`);
  console.log(`  ${hits.length} hits in executable ROM`);
  console.log(`========================================`);

  for (const hit of hits) {
    console.log();
    console.log(`  ${hex(hit.addr)}  [${regionLabel(hit.addr)}]`);
    for (const line of formatContext(hit.addr, 8, 8)) {
      console.log(`    ${line}`);
    }
  }
}

// ── Section 4: CALL site details ──

for (const { target, label } of CALL_TARGETS) {
  const hits = callHits.get(target);
  console.log(`\n========================================`);
  console.log(`  CALL ${label} (${hex(target)})`);
  console.log(`  ${hits.length} call sites`);
  console.log(`========================================`);

  for (const hit of hits) {
    console.log();
    console.log(`  ${hex(hit.addr)}  [${regionLabel(hit.addr)}]`);
    for (const line of formatContext(hit.addr, 10, 5)) {
      console.log(`    ${line}`);
    }
  }
}

// ── Section 5: Cross-reference — LD A,0xF? near CALL ConvKeyToTok / KeyClassifier ──

const PROXIMITY_BYTES = 50;

console.log(`\n========================================`);
console.log(`  Cross-reference: LD A,0xF? within ${PROXIMITY_BYTES} bytes before a CALL target`);
console.log(`========================================`);

const allCallSites = [];
for (const { target } of CALL_TARGETS) {
  for (const hit of callHits.get(target)) {
    allCallSites.push(hit);
  }
}

let crossRefCount = 0;
for (const { value, label } of MAGIC_VALUES) {
  const hits = magicHits.get(value);
  const nearby = [];

  for (const ldHit of hits) {
    for (const callSite of allCallSites) {
      const distance = callSite.addr - ldHit.addr;
      if (distance > 0 && distance <= PROXIMITY_BYTES) {
        nearby.push({ ldAddr: ldHit.addr, callAddr: callSite.addr, callLabel: callSite.label, distance });
      }
    }
  }

  if (nearby.length > 0) {
    console.log(`\n  LD A,${hex(value, 2)} (${label}):`);
    for (const match of nearby) {
      crossRefCount++;
      console.log(`    ${hex(match.ldAddr)} → CALL ${match.callLabel} at ${hex(match.callAddr)} (${match.distance} bytes apart)`);
      console.log(`    Context around LD A:`);
      for (const line of formatContext(match.ldAddr, 5, 12)) {
        console.log(`      ${line}`);
      }
    }
  }
}

if (crossRefCount === 0) {
  console.log('\n  No direct LD A,0xF? found within proximity of CALL sites.');
  console.log('  The magic values may be set indirectly (via memory load, table lookup, or register copy).');
  console.log();

  // Wider scan: look for any of the magic values being loaded from memory near call sites
  console.log('  Wider search: disassembling 60 bytes before each CALL site for any A-loading instruction...');
  console.log();

  for (const callSite of allCallSites) {
    const beforeInsts = collectBefore(callSite.addr, 20, 60);
    const aLoaders = beforeInsts.filter((inst) => {
      if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') return true;
      if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') return true;
      if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') return true;
      if (inst.tag === 'ld-reg-ind' && inst.dest === 'a') return true;
      if (inst.tag === 'ld-reg-ixd' && inst.dest === 'a') return true;
      return false;
    });

    if (aLoaders.length > 0) {
      console.log(`  Before CALL ${callSite.label} at ${hex(callSite.addr)} [${regionLabel(callSite.addr)}]:`);
      for (const inst of aLoaders) {
        const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
        console.log(`    ${hex(inst.pc)}  ${bytes} ${formatInstruction(inst)}`);
      }
      console.log();
    }
  }
}

// ── Section 6: Summary ──

console.log(`\n========================================`);
console.log(`  Summary`);
console.log(`========================================`);
console.log();

for (const { value, label } of MAGIC_VALUES) {
  const hits = magicHits.get(value);
  console.log(`LD A,${hex(value, 2)} (${label}): ${hits.length} sites`);
  const keyRegion = hits.filter((h) => h.addr >= 0x040000 && h.addr <= 0x06FFFF);
  if (keyRegion.length > 0) {
    console.log(`  In key-handling region (0x04xxxx-0x06xxxx): ${keyRegion.length}`);
    for (const h of keyRegion) {
      console.log(`    ${hex(h.addr)}  [${regionLabel(h.addr)}]`);
    }
  }
  const allRegion = hits.filter((h) => h.addr < 0x040000 || h.addr > 0x06FFFF);
  if (allRegion.length > 0) {
    console.log(`  Outside key-handling region: ${allRegion.length}`);
    for (const h of allRegion) {
      console.log(`    ${hex(h.addr)}  [${regionLabel(h.addr)}]`);
    }
  }
  console.log();
}

console.log(`Total CALL ConvKeyToTok sites: ${callHits.get(0x05E630).length}`);
console.log(`Total CALL KeyClassifier sites: ${callHits.get(0x05C52C).length}`);
console.log(`Cross-references found: ${crossRefCount}`);
console.log();
console.log('Done.');
