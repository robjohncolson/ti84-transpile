#!/usr/bin/env node

/**
 * Phase 224: Trace how the OS produces magic A values before calling ConvKeyToTok
 *
 * Session 223 found 82 LD A,0xF? sites but NO direct LD A,0xF?→CALL pattern.
 * Magic values are set via memory loads, register copies, or indirect paths.
 *
 * This probe:
 *   1. Maps all ConvKeyToTok (0x05E630) call sites with deep context (50 bytes before)
 *   2. Maps all KeyClassifier (0x05C52C) call sites similarly
 *   3. For each site, traces how A is loaded (immediate, memory, register, indexed)
 *   4. Identifies modifier state variables (2nd mode, Alpha mode flags)
 *   5. Searches for SET/RES instructions near call sites (IY+42, D177B9, D0058E)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const EXEC_END = 0x0C0000;

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const s = Math.max(0, start);
  const e = Math.min(rom.length, s + length);
  return Array.from(rom.slice(s, e), v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
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

const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
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
    case 'rst': return `${prefix}rst ${hex(inst.target)}`;
    case 'cb-bit': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'cb-set': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'cb-res': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'cb-rotate': return `${prefix}${inst.op} ${inst.reg}`;
    case 'out-imm': return `${prefix}out (${hexByte(inst.port)}), a`;
    case 'in-imm': return `${prefix}in a, (${hexByte(inst.port)})`;
    default: return `${prefix}${inst.tag}`;
  }
}

function collectBefore(target, count, lookbackBytes = 120) {
  const rows = [];
  let pc = Math.max(0, target - lookbackBytes);
  while (pc < target) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows.filter(inst => inst.pc < target).slice(-count);
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

function formatLine(inst, marker = '  ') {
  const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
  const text = inst.tag === 'decode-error'
    ? `decode-error: ${inst.errorMessage}`
    : formatInstruction(inst);
  return `${marker} ${hex(inst.pc)}  ${bytes} ${text}`;
}

// ── Known addresses of interest ──
const KNOWN_ADDRS = {
  0xD0058E: 'keyCode storage (written by 0x02F961)',
  0xD000AA: 'IY+0x42 (mode flags: BIT 1 = 2nd mode)',
  0xD177B9: 'switch dispatcher state (used by 0x049E07)',
  0xD00080: 'IY+0x18 (cursor flags)',
  0xD00068: 'IY base (standard)',
};

function annotateAddr(addr) {
  const resolved = addr >>> 0;
  if (KNOWN_ADDRS[resolved]) return ` /* ${KNOWN_ADDRS[resolved]} */`;
  // Check if it's an IY+offset (IY typically = 0xD00068)
  const IY_BASE = 0xD00068;
  if (resolved >= IY_BASE && resolved < IY_BASE + 0x200) {
    return ` /* IY+${hex(resolved - IY_BASE, 2)} */`;
  }
  if (resolved >= 0xD00000 && resolved < 0xD80000) {
    return ' /* RAM */';
  }
  return '';
}

// ── Classify how A is loaded before a CALL ──

function classifyALoad(inst) {
  if (!inst) return null;
  switch (inst.tag) {
    case 'ld-reg-imm':
      if (inst.dest === 'a') return { type: 'immediate', value: inst.value, inst };
      break;
    case 'ld-reg-mem':
      if (inst.dest === 'a') return { type: 'memory', addr: resolveMemAddr(inst), inst };
      break;
    case 'ld-reg-reg':
      if (inst.dest === 'a') return { type: 'register', src: inst.src, inst };
      break;
    case 'ld-reg-ind':
      if (inst.dest === 'a') return { type: 'indirect', src: inst.src, inst };
      break;
    case 'ld-reg-ixd':
      if (inst.dest === 'a') return { type: 'indexed', indexReg: inst.indexRegister, disp: inst.displacement, inst };
      break;
    case 'alu-imm':
    case 'alu-reg':
      // OR, AND, XOR, ADD, SUB etc modify A
      return { type: 'alu', op: inst.op || inst.tag, inst };
    case 'pop':
      if (inst.pair === 'af') return { type: 'pop-af', inst };
      break;
  }
  return null;
}

function classifyModifierOps(inst) {
  // Look for BIT/SET/RES on IY+d (mode flags), or writes to known addresses
  const results = [];
  switch (inst.tag) {
    case 'indexed-cb-bit':
      results.push({ type: 'bit-test', bit: inst.bit, reg: inst.indexRegister, disp: inst.displacement });
      break;
    case 'indexed-cb-set':
      results.push({ type: 'set', bit: inst.bit, reg: inst.indexRegister, disp: inst.displacement });
      break;
    case 'indexed-cb-res':
      results.push({ type: 'res', bit: inst.bit, reg: inst.indexRegister, disp: inst.displacement });
      break;
    case 'ld-mem-reg':
      results.push({ type: 'store', addr: resolveMemAddr(inst), src: inst.src });
      break;
    case 'ld-ixd-reg':
      results.push({ type: 'ixd-store', reg: inst.indexRegister, disp: inst.displacement, src: inst.src });
      break;
    case 'ld-ixd-imm':
      results.push({ type: 'ixd-store-imm', reg: inst.indexRegister, disp: inst.displacement, value: inst.value });
      break;
  }
  return results;
}

// ── CALL pattern bytes ──
const CALL_TARGETS = [
  { target: 0x05E630, label: 'ConvKeyToTok', bytes: [0xCD, 0x30, 0xE6, 0x05] },
  { target: 0x05C52C, label: 'KeyClassifier', bytes: [0xCD, 0x2C, 0xC5, 0x05] },
];

// ── Scan for all call sites ──

function findCallSites(pattern) {
  const hits = [];
  for (let addr = 0; addr < EXEC_END - pattern.length; addr++) {
    if (matchBytes(rom, addr, pattern)) {
      hits.push(addr);
    }
  }
  return hits;
}

// ── Deep analysis of a call site ──

function analyzeCallSite(callAddr, label) {
  const LOOKBACK = 30; // number of instructions to examine
  const beforeInsts = collectBefore(callAddr, LOOKBACK, 120);
  const afterInsts = collectAfter(callAddr, 5);

  // Find all A-loading instructions (last one before CALL is the effective one)
  const aLoads = [];
  const modifierOps = [];
  const branchPoints = [];
  const memRefs = [];

  for (const inst of beforeInsts) {
    const aLoad = classifyALoad(inst);
    if (aLoad) aLoads.push(aLoad);

    const mods = classifyModifierOps(inst);
    if (mods.length > 0) modifierOps.push(...mods.map(m => ({ ...m, pc: inst.pc })));

    // Track branch points (conditional jumps/calls)
    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'call-conditional') {
      branchPoints.push({ pc: inst.pc, condition: inst.condition, target: inst.target });
    }

    // Track memory references
    const addr = resolveMemAddr(inst);
    if (addr !== null) {
      memRefs.push({ pc: inst.pc, addr, tag: inst.tag });
    }
  }

  // Effective A-load is the LAST one before the call (no intervening branch that might skip it)
  const effectiveALoad = aLoads.length > 0 ? aLoads[aLoads.length - 1] : null;

  return {
    callAddr,
    label,
    beforeInsts,
    afterInsts,
    aLoads,
    effectiveALoad,
    modifierOps,
    branchPoints,
    memRefs,
  };
}

function printAnalysis(analysis) {
  const { callAddr, label, beforeInsts, afterInsts, effectiveALoad, aLoads, modifierOps, branchPoints, memRefs } = analysis;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  CALL ${label} at ${hex(callAddr)}  [${regionLabel(callAddr)}]`);
  console.log(`${'─'.repeat(70)}`);

  // Full disassembly context
  console.log('\n  Disassembly (30 instructions before → 5 after):');
  for (const inst of beforeInsts) {
    const marker = (effectiveALoad && inst.pc === effectiveALoad.inst.pc) ? '>>' : '  ';
    console.log(`    ${formatLine(inst, marker)}`);
  }
  // The CALL itself
  const callInst = decodeSafe(callAddr);
  console.log(`    ${formatLine(callInst, '=>')}`);
  for (const inst of afterInsts.slice(1)) { // skip the CALL itself
    console.log(`    ${formatLine(inst, '  ')}`);
  }

  // A-load chain
  console.log('\n  A-loading instructions (chronological):');
  if (aLoads.length === 0) {
    console.log('    (none found in lookback window)');
  } else {
    for (const al of aLoads) {
      const bytes = bytesAt(al.inst.pc, al.inst.length || 1).padEnd(14, ' ');
      let detail = `[${al.type}]`;
      if (al.type === 'immediate') detail += ` value=${hexByte(al.value)}`;
      if (al.type === 'memory') detail += ` addr=${hex(al.addr)}${annotateAddr(al.addr)}`;
      if (al.type === 'register') detail += ` src=${al.src}`;
      if (al.type === 'indirect') detail += ` src=(${al.src})`;
      if (al.type === 'indexed') detail += ` src=(${al.indexReg}${disp(al.disp)})`;
      if (al.type === 'alu') detail += ` op=${al.op}`;
      console.log(`    ${hex(al.inst.pc)}  ${bytes} ${formatInstruction(al.inst)}  ${detail}`);
    }
  }

  // Effective A producer
  console.log('\n  Effective A value at CALL:');
  if (effectiveALoad) {
    let summary = `${effectiveALoad.type}`;
    if (effectiveALoad.type === 'immediate') summary = `A = ${hexByte(effectiveALoad.value)} (literal)`;
    else if (effectiveALoad.type === 'memory') summary = `A = *(${hex(effectiveALoad.addr)})${annotateAddr(effectiveALoad.addr)}`;
    else if (effectiveALoad.type === 'register') summary = `A = ${effectiveALoad.src}`;
    else if (effectiveALoad.type === 'indirect') summary = `A = *(${effectiveALoad.src})`;
    else if (effectiveALoad.type === 'indexed') summary = `A = *(${effectiveALoad.indexReg}${disp(effectiveALoad.disp)})`;
    else if (effectiveALoad.type === 'alu') summary = `A modified by ${effectiveALoad.op}`;
    else if (effectiveALoad.type === 'pop-af') summary = `A = popped from stack (POP AF)`;
    console.log(`    ${summary}  (at ${hex(effectiveALoad.inst.pc)})`);
  } else {
    console.log('    UNKNOWN — A is set by caller or earlier code path');
  }

  // Branch points
  if (branchPoints.length > 0) {
    console.log('\n  Branch points before CALL (conditional paths):');
    for (const bp of branchPoints) {
      console.log(`    ${hex(bp.pc)}  condition=${bp.condition}  target=${hex(bp.target)}`);
    }
  }

  // Modifier flag operations (SET/RES/BIT on IY)
  if (modifierOps.length > 0) {
    console.log('\n  Modifier flag operations:');
    for (const mod of modifierOps) {
      if (mod.type === 'bit-test') {
        console.log(`    ${hex(mod.pc)}  BIT ${mod.bit}, (${mod.reg}${disp(mod.disp)})  /* test flag */`);
      } else if (mod.type === 'set') {
        console.log(`    ${hex(mod.pc)}  SET ${mod.bit}, (${mod.reg}${disp(mod.disp)})  /* set flag */`);
      } else if (mod.type === 'res') {
        console.log(`    ${hex(mod.pc)}  RES ${mod.bit}, (${mod.reg}${disp(mod.disp)})  /* clear flag */`);
      } else if (mod.type === 'store') {
        console.log(`    ${hex(mod.pc)}  LD (${hex(mod.addr)}), ${mod.src}${annotateAddr(mod.addr)}`);
      } else if (mod.type === 'ixd-store') {
        console.log(`    ${hex(mod.pc)}  LD (${mod.reg}${disp(mod.disp)}), ${mod.src}`);
      } else if (mod.type === 'ixd-store-imm') {
        console.log(`    ${hex(mod.pc)}  LD (${mod.reg}${disp(mod.disp)}), ${hexByte(mod.value)}`);
      }
    }
  }

  // Notable memory references
  const notable = memRefs.filter(r => {
    const a = r.addr;
    return a === 0xD0058E || a === 0xD000AA || a === 0xD177B9 ||
           (a >= 0xD00068 && a < 0xD00268);
  });
  if (notable.length > 0) {
    console.log('\n  Notable memory references:');
    for (const ref of notable) {
      console.log(`    ${hex(ref.pc)}  addr=${hex(ref.addr)}${annotateAddr(ref.addr)}  op=${ref.tag}`);
    }
  }
}

// ── Section 1: Inside ConvKeyToTok (0x05E630) — how does IT call KeyClassifier? ──

console.log('=== Phase 224: Magic A Producer Trace ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Scan region: 0x000000 - ${hex(EXEC_END)}\n`);

// First, let's look inside ConvKeyToTok itself to understand how it calls KeyClassifier
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 1: Inside ConvKeyToTok (0x05E630) — KeyClassifier dispatch');
console.log('═══════════════════════════════════════════════════════════════════════');

// Disassemble ConvKeyToTok from entry to find internal calls to KeyClassifier
const CONV_START = 0x05E630;
const CONV_SCAN_LEN = 0x200; // scan up to 512 bytes into the function

console.log(`\n  Disassembling ConvKeyToTok from ${hex(CONV_START)} (up to ${CONV_SCAN_LEN} bytes):`);
console.log('  Looking for: CALL 0x05C52C, LD A instructions, BIT/SET/RES on IY, memory refs\n');

{
  let pc = CONV_START;
  const end = CONV_START + CONV_SCAN_LEN;
  let internalCallCount = 0;
  const aLoadSites = [];
  const iyOps = [];

  while (pc < end) {
    const inst = decodeSafe(pc);
    const isKeyClassifierCall = (inst.tag === 'call' && inst.target === 0x05C52C);
    const aLoad = classifyALoad(inst);
    const mods = classifyModifierOps(inst);

    let marker = '  ';
    if (isKeyClassifierCall) { marker = '=>'; internalCallCount++; }
    else if (aLoad) { marker = ' A'; aLoadSites.push({ pc, aLoad }); }

    for (const m of mods) {
      if (m.type === 'bit-test' || m.type === 'set' || m.type === 'res') {
        iyOps.push({ pc, ...m });
      }
    }

    const bytes = bytesAt(pc, inst.length || 1).padEnd(20, ' ');
    const text = inst.tag === 'decode-error' ? `decode-error` : formatInstruction(inst);
    console.log(`  ${marker} ${hex(pc)}  ${bytes} ${text}`);

    if (inst.tag === 'ret' && pc > CONV_START + 0x10) {
      // Don't stop on early RETs (conditional), but break on a late unconditional RET
      // Actually, let's just continue scanning — there may be multiple return paths
    }

    pc = inst.length > 0 ? (pc + inst.length) : (pc + 1);
  }

  console.log(`\n  Summary: ${internalCallCount} internal CALL(s) to KeyClassifier`);
  console.log(`  A-load sites inside ConvKeyToTok: ${aLoadSites.length}`);
  console.log(`  IY flag operations: ${iyOps.length}`);
  for (const op of iyOps) {
    console.log(`    ${hex(op.pc)}  ${op.type} bit ${op.bit}, (${op.reg}${disp(op.disp)})`);
  }
}

// ── Section 2: All ConvKeyToTok (0x05E630) CALL sites ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 2: All CALL ConvKeyToTok (0x05E630) sites — deep context');
console.log('═══════════════════════════════════════════════════════════════════════');

const convCallSites = findCallSites(CALL_TARGETS[0].bytes);
console.log(`\n  Found ${convCallSites.length} CALL sites`);

for (const addr of convCallSites) {
  const analysis = analyzeCallSite(addr, 'ConvKeyToTok');
  printAnalysis(analysis);
}

// ── Section 3: All KeyClassifier (0x05C52C) CALL sites ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 3: All CALL KeyClassifier (0x05C52C) sites — deep context');
console.log('═══════════════════════════════════════════════════════════════════════');

const classCallSites = findCallSites(CALL_TARGETS[1].bytes);
console.log(`\n  Found ${classCallSites.length} CALL sites`);

for (const addr of classCallSites) {
  const analysis = analyzeCallSite(addr, 'KeyClassifier');
  printAnalysis(analysis);
}

// ── Section 4: Modifier state variable analysis ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 4: Modifier state variables — SET/RES near call sites');
console.log('═══════════════════════════════════════════════════════════════════════');

// For each ConvKeyToTok call site, scan a wider window for SET/RES/BIT on IY
const WIDE_LOOKBACK = 60; // instructions

for (const callAddr of convCallSites) {
  const insts = collectBefore(callAddr, WIDE_LOOKBACK, 200);
  const modOps = [];

  for (const inst of insts) {
    const mods = classifyModifierOps(inst);
    for (const m of mods) {
      if (m.type === 'set' || m.type === 'res' || m.type === 'bit-test') {
        modOps.push({ pc: inst.pc, ...m });
      }
    }
  }

  if (modOps.length > 0) {
    console.log(`\n  Before CALL ConvKeyToTok at ${hex(callAddr)}:`);
    for (const op of modOps) {
      const iyBase = 0xD00068;
      let addrNote = '';
      if (op.reg === 'iy') {
        const resolved = iyBase + op.disp;
        addrNote = ` → addr=${hex(resolved)}${annotateAddr(resolved)}`;
      }
      console.log(`    ${hex(op.pc)}  ${op.type.toUpperCase()} ${op.bit}, (${op.reg}${disp(op.disp)})${addrNote}`);
    }
  }
}

// ── Section 5: Search for LD A,(D0058E) pattern in ROM ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 5: LD A,(D0058E) — key code loads');
console.log('═══════════════════════════════════════════════════════════════════════');

// Pattern: 3A 8E 05 D0 = LD A,(0xD0058E) in ADL mode (little-endian)
const LD_A_D0058E = [0x3A, 0x8E, 0x05, 0xD0];
const keyCodeLoadSites = [];

for (let addr = 0; addr < EXEC_END - LD_A_D0058E.length; addr++) {
  if (matchBytes(rom, addr, LD_A_D0058E)) {
    keyCodeLoadSites.push(addr);
  }
}

console.log(`\n  Found ${keyCodeLoadSites.length} LD A,(0xD0058E) sites:`);
for (const addr of keyCodeLoadSites) {
  console.log(`\n    ${hex(addr)}  [${regionLabel(addr)}]`);
  const before = collectBefore(addr, 5, 40);
  const after = collectAfter(addr, 8);
  for (const inst of before) {
    console.log(`      ${formatLine(inst)}`);
  }
  const thisInst = decodeSafe(addr);
  console.log(`      ${formatLine(thisInst, '=>')}`);
  for (const inst of after.slice(1)) {
    console.log(`      ${formatLine(inst)}`);
  }
}

// ── Section 6: Search for LD (D0058E),A — key code writers ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 6: LD (D0058E),A — key code writers');
console.log('═══════════════════════════════════════════════════════════════════════');

// Pattern: 32 8E 05 D0 = LD (0xD0058E),A
const ST_A_D0058E = [0x32, 0x8E, 0x05, 0xD0];
const keyCodeWriteSites = [];

for (let addr = 0; addr < EXEC_END - ST_A_D0058E.length; addr++) {
  if (matchBytes(rom, addr, ST_A_D0058E)) {
    keyCodeWriteSites.push(addr);
  }
}

console.log(`\n  Found ${keyCodeWriteSites.length} LD (0xD0058E),A sites:`);
for (const addr of keyCodeWriteSites) {
  console.log(`\n    ${hex(addr)}  [${regionLabel(addr)}]`);
  const before = collectBefore(addr, 8, 50);
  const after = collectAfter(addr, 5);
  for (const inst of before) {
    console.log(`      ${formatLine(inst)}`);
  }
  const thisInst = decodeSafe(addr);
  console.log(`      ${formatLine(thisInst, '=>')}`);
  for (const inst of after.slice(1)) {
    console.log(`      ${formatLine(inst)}`);
  }
}

// ── Section 7: IY+42 (0xD000AA) — BIT 1 = 2nd mode flag ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 7: BIT/SET/RES on IY+0x42 (2nd-mode flag area)');
console.log('═══════════════════════════════════════════════════════════════════════');

// Scan for FD CB 42 xx patterns (IY+0x42 bit operations)
// FD CB dd xx where dd=0x42 and xx encodes BIT/SET/RES
const iyBit42Sites = [];

for (let addr = 0; addr < EXEC_END - 4; addr++) {
  if (rom[addr] === 0xFD && rom[addr + 1] === 0xCB && rom[addr + 2] === 0x42) {
    const op = rom[addr + 3];
    const group = (op >> 6) & 3;
    const bit = (op >> 3) & 7;
    let opName;
    if (group === 1) opName = 'BIT';
    else if (group === 2) opName = 'RES';
    else if (group === 3) opName = 'SET';
    else opName = `ROT(${hex(op, 2)})`;
    iyBit42Sites.push({ addr, opName, bit, op });
  }
}

console.log(`\n  Found ${iyBit42Sites.length} operations on IY+0x42:`);
for (const site of iyBit42Sites) {
  console.log(`\n    ${hex(site.addr)}  ${site.opName} ${site.bit}, (IY+0x42)  [${regionLabel(site.addr)}]`);
  const before = collectBefore(site.addr, 3, 20);
  const after = collectAfter(site.addr, 4);
  for (const inst of before) {
    console.log(`      ${formatLine(inst)}`);
  }
  const thisInst = decodeSafe(site.addr);
  console.log(`      ${formatLine(thisInst, '=>')}`);
  for (const inst of after.slice(1)) {
    console.log(`      ${formatLine(inst)}`);
  }
}

// ── Section 8: Summary and theory ──

console.log('\n\n═══════════════════════════════════════════════════════════════════════');
console.log('  SECTION 8: Summary');
console.log('═══════════════════════════════════════════════════════════════════════');

console.log(`
  ConvKeyToTok call sites: ${convCallSites.length}
  KeyClassifier call sites: ${classCallSites.length}
  LD A,(D0058E) sites: ${keyCodeLoadSites.length}
  LD (D0058E),A sites: ${keyCodeWriteSites.length}
  IY+0x42 operations: ${iyBit42Sites.length}

  ConvKeyToTok call site addresses:`);
for (const addr of convCallSites) {
  console.log(`    ${hex(addr)}  [${regionLabel(addr)}]`);
}

console.log(`\n  KeyClassifier call site addresses:`);
for (const addr of classCallSites) {
  console.log(`    ${hex(addr)}  [${regionLabel(addr)}]`);
}

console.log(`\n  Key code (D0058E) writer addresses:`);
for (const addr of keyCodeWriteSites) {
  console.log(`    ${hex(addr)}  [${regionLabel(addr)}]`);
}

console.log('\nDone.');
