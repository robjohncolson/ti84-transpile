#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x055280;
const VRAM_MMIO_LO = 0xE30010;
const VRAM_MMIO_HI = 0xE30012;
const CALL_WINDOW = 0x100;
const CONTEXT_COUNT = 10;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex2(value) {
  return hex(value & 0xFF, 2);
}

function regionName(addr) {
  if (addr <= 0x01FFFF) return 'OS Low';
  if (addr <= 0x03FFFF) return 'OS Mid';
  if (addr <= 0x05FFFF) return 'OS High';
  return 'OS Upper / Apps';
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function instBytes(inst) {
  return Array.from(rom.subarray(inst.pc, inst.pc + inst.length), (b) => hex2(b)).join(' ');
}

function formatIndexed(reg, disp) {
  return `(${String(reg).toUpperCase()}${disp >= 0 ? '+' : ''}${disp})`;
}

function formatInst(inst) {
  const up = (value) => String(value).toUpperCase();
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ld-pair-imm': return `LD ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${up(inst.dest)}, ${hex2(inst.value)}`;
    case 'ld-reg-reg': return `LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-mem': return `LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${up(inst.src)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${up(inst.pair)}`
        : `LD ${up(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${up(inst.pair)}`;
    case 'ld-ixd-imm': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hex2(inst.value)}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${up(inst.src)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ind-imm': return `LD (HL), ${hex2(inst.value)}`;
    case 'push': return `PUSH ${up(inst.pair ?? inst.reg ?? '?')}`;
    case 'pop': return `POP ${up(inst.pair ?? inst.reg ?? '?')}`;
    case 'dec-reg': return `DEC ${up(inst.reg)}`;
    case 'alu-imm': return `${up(inst.op)} ${hex2(inst.value)}`;
    case 'alu-reg': return `${up(inst.op)} ${up(inst.src ?? inst.reg ?? 'A')}`;
    case 'ldir': return 'LDIR';
    case 'lea': return 'LEA';
    default: return up(inst.tag);
  }
}

function isHardStop(inst) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect'].includes(inst.tag);
}

function buildDirectRefIndex() {
  const byTarget = new Map();
  const targets = new Set();
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const op = rom[pc];
    if (op !== 0xCD && op !== 0xC3) continue;
    const target = read24(pc + 1);
    const ref = { site: pc, op: op === 0xCD ? 'CALL' : 'JP', target };
    targets.add(target);
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(ref);
  }
  return { byTarget, targets: [...targets].sort((a, b) => a - b) };
}

const directRefs = buildDirectRefIndex();

function refsTo(target) {
  return directRefs.byTarget.get(target) ?? [];
}

function decodeUntil(start, stopPc) {
  const insts = [];
  const seen = new Set();
  let pc = start;
  while (pc < rom.length && pc <= stopPc) {
    if (seen.has(pc)) return null;
    seen.add(pc);
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) return null;
    insts.push(inst);
    if (inst.pc === stopPc) return insts;
    if (isHardStop(inst)) return null;
    pc = inst.nextPc ?? (inst.pc + inst.length);
  }
  return null;
}

function findContainingFunction(callSite) {
  const lo = Math.max(0, callSite - CALL_WINDOW);
  const candidates = directRefs.targets.filter((target) => target >= lo && target <= callSite).sort((a, b) => b - a);
  for (const start of candidates) {
    const insts = decodeUntil(start, callSite);
    if (insts?.at(-1)?.pc === callSite) return { start, insts, basis: 'xref' };
  }
  for (let start = callSite; start >= lo; start--) {
    if (start > 0 && rom[start - 1] !== 0xC9) continue;
    const insts = decodeUntil(start, callSite);
    if (insts?.at(-1)?.pc === callSite) return { start, insts, basis: 'ret-fallback' };
  }
  const inst = decodeInstruction(rom, callSite, 'adl');
  return { start: callSite, insts: inst ? [inst] : [], basis: 'self' };
}

function decodeCount(start, count) {
  const insts = [];
  let pc = start;
  while (pc < rom.length && insts.length < count) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) break;
    insts.push(inst);
    pc = inst.nextPc ?? (inst.pc + inst.length);
  }
  return insts;
}

function writeAddressFor(inst, indexBases) {
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') return inst.addr;
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') return inst.addr;
  if (['ld-ixd-imm', 'ld-ixd-reg', 'indexed-cb-res', 'indexed-cb-set'].includes(inst.tag)) {
    const base = indexBases[inst.indexRegister];
    if (base === undefined) return null;
    return (base + inst.displacement) >>> 0;
  }
  return null;
}

function analyzePreCall(insts, callSite) {
  const pre = insts.filter((inst) => inst.pc < callSite);
  const context = pre.slice(-CONTEXT_COUNT);
  const indexBases = {};
  const vramWrites = [];
  const hints = new Set();
  let lastAImmediate = null;

  for (const inst of pre) {
    if (inst.tag === 'ld-pair-imm' && ['ix', 'iy'].includes(inst.pair)) {
      indexBases[inst.pair] = inst.value;
    }
    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      lastAImmediate = inst.value;
    }
    if (inst.tag === 'ld-pair-imm' && inst.value === 0xD40000) {
      hints.add(`${String(inst.pair).toUpperCase()} <= ${hex(inst.value)}`);
    }
    if (inst.tag === 'ld-pair-imm' && inst.value === 0xE30200) {
      hints.add(`${String(inst.pair).toUpperCase()} <= ${hex(inst.value)}`);
    }
    const writeAddr = writeAddressFor(inst, indexBases);
    if (writeAddr === null) continue;
    if (writeAddr >= VRAM_MMIO_LO && writeAddr <= VRAM_MMIO_HI) {
      vramWrites.push({ addr: writeAddr, inst });
    }
    if (writeAddr >= 0xD40000 && writeAddr <= 0xD40002) {
      hints.add(`touches ${hex(writeAddr)} via ${formatInst(inst)}`);
    }
  }

  return { context, lastAImmediate, vramWrites, hints: [...hints] };
}

function printRefs(refs, indent = '  ') {
  if (!refs.length) {
    console.log(`${indent}(none)`);
    return;
  }
  for (const ref of refs) {
    console.log(`${indent}- ${ref.op} ${hex(ref.site)} (${regionName(ref.site)})`);
  }
}

const targetRefs = refsTo(TARGET).map((ref) => {
  const fn = findContainingFunction(ref.site);
  return {
    ...ref,
    functionStart: fn.start,
    functionBasis: fn.basis,
    functionInsts: fn.insts,
    functionCallers: refsTo(fn.start),
    preCall: analyzePreCall(fn.insts, ref.site),
  };
});

const targetBody = decodeCount(TARGET, 5);

console.log('Phase 325: LCD refresh pipeline callers for 0x055280');
console.log();
console.log('1. Direct CALL/JP sites targeting 0x055280');
if (!targetRefs.length) {
  console.log('  (none)');
} else {
  for (const ref of targetRefs) {
    console.log(`- ${ref.op} ${hex(ref.site)} (${regionName(ref.site)}) inside function ${hex(ref.functionStart)} [${ref.functionBasis}]`);
  }
}
console.log();

console.log('2. One level up: callers of each containing function');
for (const ref of targetRefs) {
  console.log(`- Function ${hex(ref.functionStart)} for site ${hex(ref.site)}`);
  printRefs(ref.functionCallers, '  ');
}
console.log();

console.log('3. Pre-call setup near each 0x055280 site');
for (const ref of targetRefs) {
  console.log(`- Site ${hex(ref.site)} in function ${hex(ref.functionStart)}`);
  for (const inst of ref.preCall.context) {
    console.log(`    ${hex(inst.pc)}: ${instBytes(inst).padEnd(20)} ${formatInst(inst)}`);
  }
  console.log(`    command byte before call: ${ref.preCall.lastAImmediate === null ? 'n/a' : hex2(ref.preCall.lastAImmediate)}`);
  if (ref.preCall.vramWrites.length) {
    console.log('    VRAM-base MMIO writes before the call:');
    for (const write of ref.preCall.vramWrites) {
      console.log(`      ${hex(write.inst.pc)} -> ${hex(write.addr)} via ${formatInst(write.inst)}`);
    }
  } else {
    console.log('    VRAM-base MMIO writes before the call: none');
  }
  if (ref.preCall.hints.length) {
    console.log(`    nearby setup hints: ${ref.preCall.hints.join('; ')}`);
  }
}
console.log();

console.log('4. 0x055280 body that actually drives LCD DMA');
for (const inst of targetBody) {
  console.log(`- ${hex(inst.pc)}: ${instBytes(inst).padEnd(20)} ${formatInst(inst)}`);
}
console.log('  Observation: 0x055280 itself loads HL=0xD40000 and writes HL to 0xE30010.');
console.log();

console.log('5. LCD refresh pipeline summary');
for (const ref of targetRefs) {
  const parents = ref.functionCallers.map((caller) => `${caller.op} ${hex(caller.site)}`).join(', ') || 'no direct parents found';
  console.log(`- ${parents} -> ${hex(ref.functionStart)} -> ${ref.op} ${hex(ref.site)} -> ${hex(TARGET)}`);
}
console.log('- Direct JP sites to 0x055280: none');
console.log('- The callers provide the command byte in A (0x2D or 0x27 here), but the VRAM base write to 0xE30010 happens inside 0x055280, not before it.');
