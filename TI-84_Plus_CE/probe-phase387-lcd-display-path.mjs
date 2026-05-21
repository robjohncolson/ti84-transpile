#!/usr/bin/env node
/**
 * probe-phase387-lcd-display-path.mjs
 *
 * Static disassembly of the LCD/display update path at 0x005900-0x005C00.
 * Session 383 showed heavy activity in 0x005A48-0x005B92 after key dispatch.
 * Known entry points: 0x005B96, 0x005BB1 (called from handler 0x001853, session 380).
 * LCD controller: ST7789V via SPI. SPI command functions at 0x0060FA/0x0060F7.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// --- Helpers ---

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function disasmRange(start, end) {
  let pc = start;
  const results = [];
  while (pc < end) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const rawBytes = [];
      for (let i = 0; i < inst.length; i++) {
        rawBytes.push((rom[pc + i] ?? 0).toString(16).padStart(2, '0'));
      }
      results.push({
        address: pc,
        bytes: rawBytes.join(' '),
        inst,
      });
      pc = inst.nextPc;
    } catch (e) {
      const byte = (rom[pc] ?? 0).toString(16).padStart(2, '0');
      results.push({
        address: pc,
        bytes: byte,
        inst: { tag: '???', length: 1, nextPc: pc + 1 },
        error: e.message,
      });
      pc++;
    }
  }
  return results;
}

function formatInstr(inst) {
  const tag = inst.tag || 'unknown';
  const extras = [];
  if (inst.op) extras.push(inst.op);
  if (inst.reg) extras.push(inst.reg);
  if (inst.destReg) extras.push(`dest=${inst.destReg}`);
  if (inst.srcReg) extras.push(`src=${inst.srcReg}`);
  if (inst.pair) extras.push(inst.pair);
  if (inst.indirectRegister) extras.push(`(${inst.indirectRegister})`);
  if (inst.target !== undefined) extras.push(`target=${hex(inst.target)}`);
  if (inst.immediate !== undefined) extras.push(`imm=${hex(inst.immediate, 4)}`);
  if (inst.displacement !== undefined) extras.push(`disp=${inst.displacement}`);
  if (inst.condition) extras.push(`cond=${inst.condition}`);
  if (inst.bit !== undefined) extras.push(`bit=${inst.bit}`);
  if (inst.port !== undefined) extras.push(`port=${hex(inst.port, 4)}`);
  if (inst.address !== undefined) extras.push(`addr=${hex(inst.address)}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  return extras.length > 0 ? `${prefix}${tag} ${extras.join(', ')}` : `${prefix}${tag}`;
}

// --- Main ---

const START = 0x005900;
const END   = 0x005C00;

console.log('='.repeat(80));
console.log(`PROBE phase387: LCD display path disassembly ${hex(START)}-${hex(END)}`);
console.log('='.repeat(80));

// --- Part 1: Raw disassembly ---

console.log('\n--- RAW DISASSEMBLY ---\n');

const instrs = disasmRange(START, END);

for (const entry of instrs) {
  const addrStr = hex(entry.address);
  const bytesStr = entry.bytes.padEnd(24);
  const desc = entry.error
    ? `??? (${entry.error})`
    : formatInstr(entry.inst);
  console.log(`${addrStr}  ${bytesStr}  ${desc}`);
}

// --- Part 2: Analysis ---

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS');
console.log('='.repeat(80));

// 2a: Function boundaries (RET, JP, RETI, RETN split functions)
console.log('\n--- FUNCTION BOUNDARIES ---\n');

const functions = [];
let funcStart = START;

for (const entry of instrs) {
  const tag = entry.inst.tag;
  const isTerminator =
    tag === 'ret' ||
    tag === 'reti' ||
    tag === 'retn' ||
    (tag === 'jp' && !entry.inst.condition);

  if (isTerminator) {
    const funcEnd = entry.address + entry.inst.length;
    functions.push({ start: funcStart, end: funcEnd, terminator: tag });
    // Next function starts after
    funcStart = funcEnd;
  }
}

// Last fragment if not terminated
if (funcStart < END) {
  functions.push({ start: funcStart, end: END, terminator: '(none)' });
}

for (const fn of functions) {
  const size = fn.end - fn.start;
  const markers = [];
  if (fn.start <= 0x005B96 && fn.end > 0x005B96) markers.push('CONTAINS 0x005B96');
  if (fn.start <= 0x005BB1 && fn.end > 0x005BB1) markers.push('CONTAINS 0x005BB1');
  if (fn.start === 0x005B96) markers.push('ENTRY 0x005B96');
  if (fn.start === 0x005BB1) markers.push('ENTRY 0x005BB1');
  const markerStr = markers.length > 0 ? ` ** ${markers.join(', ')} **` : '';
  console.log(`  ${hex(fn.start)} - ${hex(fn.end)}  (${size} bytes, ends with ${fn.terminator})${markerStr}`);
}

// 2b: Port I/O instructions
console.log('\n--- PORT I/O INSTRUCTIONS ---\n');

let portCount = 0;
for (const entry of instrs) {
  const tag = entry.inst.tag;
  if (tag === 'in' || tag === 'out' || tag === 'in0' || tag === 'out0' ||
      tag === 'ini' || tag === 'outi' || tag === 'ind' || tag === 'outd' ||
      tag === 'inir' || tag === 'otir' || tag === 'indr' || tag === 'otdr') {
    const portStr = entry.inst.port !== undefined ? hex(entry.inst.port, 4) : '(reg)';
    console.log(`  ${hex(entry.address)}  ${tag.padEnd(6)}  port=${portStr}  [${entry.bytes}]`);
    portCount++;
  }
}
if (portCount === 0) console.log('  (none found)');

// 2c: Memory references to framebuffer (0xD40000+) or LCD MMIO (0xE00000+)
console.log('\n--- FRAMEBUFFER / LCD MMIO REFERENCES ---\n');

let memRefCount = 0;
for (const entry of instrs) {
  const inst = entry.inst;
  const addrs = [];
  if (inst.address !== undefined) addrs.push(inst.address);
  if (inst.immediate !== undefined) addrs.push(inst.immediate);
  if (inst.target !== undefined) addrs.push(inst.target);

  for (const addr of addrs) {
    if (addr >= 0xD40000 && addr < 0xD80000) {
      console.log(`  ${hex(entry.address)}  FRAMEBUFFER  ${formatInstr(inst)}  ref=${hex(addr)}`);
      memRefCount++;
    } else if (addr >= 0xE00000 && addr < 0xF00000) {
      console.log(`  ${hex(entry.address)}  LCD_MMIO     ${formatInstr(inst)}  ref=${hex(addr)}`);
      memRefCount++;
    }
  }
}
if (memRefCount === 0) console.log('  (none found)');

// 2d: All CALL/JP targets
console.log('\n--- CALL / JP TARGETS ---\n');

const callTargets = new Map(); // target -> [{from, type}]
const jpTargets = new Map();

for (const entry of instrs) {
  const tag = entry.inst.tag;
  const target = entry.inst.target;
  if (target === undefined) continue;

  if (tag === 'call') {
    if (!callTargets.has(target)) callTargets.set(target, []);
    callTargets.get(target).push({
      from: entry.address,
      cond: entry.inst.condition || 'always',
    });
  } else if (tag === 'jp') {
    if (!jpTargets.has(target)) jpTargets.set(target, []);
    jpTargets.get(target).push({
      from: entry.address,
      cond: entry.inst.condition || 'always',
    });
  }
}

console.log('  CALL targets:');
for (const [target, refs] of [...callTargets.entries()].sort((a, b) => a[0] - b[0])) {
  const inRange = target >= START && target < END ? ' [IN RANGE]' : '';
  const lcdSpi = (target === 0x0060FA || target === 0x0060F7) ? ' ** LCD SPI **' : '';
  const callers = refs.map(r => `${hex(r.from)}(${r.cond})`).join(', ');
  console.log(`    ${hex(target)}${inRange}${lcdSpi}  <- ${callers}`);
}

console.log('\n  JP targets:');
for (const [target, refs] of [...jpTargets.entries()].sort((a, b) => a[0] - b[0])) {
  const inRange = target >= START && target < END ? ' [IN RANGE]' : '';
  const callers = refs.map(r => `${hex(r.from)}(${r.cond})`).join(', ');
  console.log(`    ${hex(target)}${inRange}  <- ${callers}`);
}

// 2e: Identify functions containing 0x005B96 and 0x005BB1
console.log('\n--- KNOWN ENTRY POINTS ---\n');

for (const addr of [0x005B96, 0x005BB1]) {
  const fn = functions.find(f => f.start <= addr && f.end > addr);
  if (fn) {
    console.log(`  ${hex(addr)} is inside function ${hex(fn.start)}-${hex(fn.end)} (${fn.end - fn.start} bytes)`);
    // Print the first few instructions from this address
    const subset = instrs.filter(e => e.address >= addr && e.address < fn.end);
    for (const entry of subset.slice(0, 15)) {
      console.log(`    ${hex(entry.address)}  ${entry.bytes.padEnd(24)}  ${formatInstr(entry.inst)}`);
    }
    if (subset.length > 15) console.log(`    ... (${subset.length - 15} more instructions)`);
  } else {
    console.log(`  ${hex(addr)} not found in any detected function`);
  }
}

// --- Part 3: Summary ---

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

console.log(`\nTotal instructions disassembled: ${instrs.length}`);
console.log(`Range: ${hex(START)} - ${hex(END)} (${END - START} bytes)`);

console.log(`\nFunction map (${functions.length} blocks):`);
for (const fn of functions) {
  const size = fn.end - fn.start;
  const markers = [];
  if (fn.start <= 0x005B96 && fn.end > 0x005B96) markers.push('0x005B96');
  if (fn.start <= 0x005BB1 && fn.end > 0x005BB1) markers.push('0x005BB1');
  const markerStr = markers.length > 0 ? `  [entry: ${markers.join(', ')}]` : '';
  console.log(`  ${hex(fn.start)}  ${String(size).padStart(4)} bytes  end=${fn.terminator}${markerStr}`);
}

console.log(`\nPort I/O: ${portCount} instructions`);
console.log(`Framebuffer/LCD MMIO refs: ${memRefCount}`);
console.log(`CALL targets: ${callTargets.size} unique`);
console.log(`JP targets: ${jpTargets.size} unique`);

// Call graph: external vs internal
const externalCalls = [...callTargets.keys()].filter(t => t < START || t >= END);
const internalCalls = [...callTargets.keys()].filter(t => t >= START && t < END);
console.log(`\nExternal CALL targets: ${externalCalls.map(t => hex(t)).join(', ') || '(none)'}`);
console.log(`Internal CALL targets: ${internalCalls.map(t => hex(t)).join(', ') || '(none)'}`);

const externalJps = [...jpTargets.keys()].filter(t => t < START || t >= END);
const internalJps = [...jpTargets.keys()].filter(t => t >= START && t < END);
console.log(`External JP targets: ${externalJps.map(t => hex(t)).join(', ') || '(none)'}`);
console.log(`Internal JP targets: ${internalJps.map(t => hex(t)).join(', ') || '(none)'}`);

console.log('\nLCD SPI functions referenced:');
if (callTargets.has(0x0060FA)) console.log(`  0x0060FA called from: ${callTargets.get(0x0060FA).map(r => hex(r.from)).join(', ')}`);
else console.log('  0x0060FA: not called from this range');
if (callTargets.has(0x0060F7)) console.log(`  0x0060F7 called from: ${callTargets.get(0x0060F7).map(r => hex(r.from)).join(', ')}`);
else console.log('  0x0060F7: not called from this range');

console.log('\nDone.');
