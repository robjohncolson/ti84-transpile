#!/usr/bin/env node
/**
 * probe-phase494-decode-060FEA.mjs
 *
 * Static disassembly + dynamic trace of BCALL entry 831 at 0x060FEA.
 * Goal: determine if this is the cursor DRAW function (complement to
 * 0x061003 cursor erase).
 *
 * Callers: 0x022D8A, 0x060F4D, 0x060FBF, 0x0B53E0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const TARGET = 0x060FEA;
const CURSOR_ERASE = 0x061003;
const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2; // 153600 bytes
const STACK_RESET_TOP = 0xD1A87E;

// Known addresses for annotation
const KNOWN_ADDRS = {
  0xD00595: 'cursorRow',
  0xD00596: 'cursorCol',
  0xD0059C: 'scratch',
  0xD008D2: 'lcdReg1',
  0xD008D5: 'lcdReg2',
  0x0A23C0: 'setLCDWindow',
  0x0A239E: 'drawPixelBlock',
  0x0059C6: 'charRenderer',
  0x061003: 'cursorErase',
  0x060FEA: 'TARGET(cursorDraw?)',
};

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return hex(v, 2);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-a-mem': text = `ld a, (${hex(inst.addr)})`; break;
    case 'ld-mem-a': text = `ld (${hex(inst.addr)}), a`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': text = `${inst.op} (hl)`; break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister ?? 'hl'})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister}`; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'nop': text = 'nop'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'bit': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `bit ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'set-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `set ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'res-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `res ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    case 'ini': text = 'ini'; break;
    case 'ind': text = 'ind'; break;
    case 'out-c-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg-c': text = `in ${inst.reg}, (c)`; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.pair}`; break;
    case 'adc-pair': text = `adc hl, ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'im': text = `im ${inst.intMode}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'inc-ind': text = 'inc (hl)'; break;
    case 'dec-ind': text = 'dec (hl)'; break;
    case 'inc-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `inc (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'dec-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `dec (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-ix': text = `ld sp, ${inst.indexRegister}`; break;
    case 'add-ix-pair': text = `add ${inst.indexRegister}, ${inst.pair}`; break;
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `bit ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    default: break;
  }

  return `${prefix}${text}`;
}

function annotate(formatted) {
  if (!formatted) return '';
  for (const [addr, name] of Object.entries(KNOWN_ADDRS)) {
    const h = hex(parseInt(addr), 6);
    if (formatted.includes(h)) return `  ; << ${name}`;
  }
  return '';
}

// Extract addresses from a formatted instruction line for tracking
function extractAddresses(formatted) {
  const addrs = [];
  const matches = formatted.match(/0x[0-9a-f]+/gi) || [];
  for (const m of matches) {
    addrs.push(parseInt(m, 16));
  }
  return addrs;
}

// === PART 1: Static Disassembly ===

console.log('===================================================================');
console.log('PART 1: Static disassembly of 0x060FEA');
console.log('===================================================================\n');

let pc = TARGET;
let instrCount = 0;
const callTargets = [];
const memRefs = [];

for (let i = 0; i < 150; i++) {
  const instr = decodeInstruction(romBytes, pc, 'adl');
  const formatted = formatInstruction(instr);
  const ann = annotate(formatted);
  console.log(`${hex(pc)}: ${formatted.padEnd(40)} [${instr.length}B]${ann}`);

  // Track CALL targets
  if (instr.tag === 'call' || instr.tag === 'call-conditional') {
    callTargets.push(instr.target);
  }

  // Track memory references
  if (instr.addr !== undefined) memRefs.push(instr.addr);

  // Track immediate values that might be cursor glyphs
  if (instr.value !== undefined) {
    if (instr.value === 0xE1 || instr.value === 0xE2 || instr.value === 0xE3) {
      console.log(`  ^^^ CURSOR GLYPH 0x${instr.value.toString(16)} found!`);
    }
  }

  instrCount++;
  pc += instr.length;

  if (instr.tag === 'ret') break;
  if (instr.tag === 'jp') break; // unconditional JP
}

console.log(`\n--- Summary ---`);
console.log(`Instructions until RET/JP: ${instrCount}`);
console.log(`Byte range: ${hex(TARGET)} - ${hex(pc)}`);
console.log(`Size: ${pc - TARGET} bytes`);
console.log(`\nCALL targets:`);
for (const t of callTargets) {
  const name = KNOWN_ADDRS[t] || '';
  console.log(`  ${hex(t)} ${name}`);
}
console.log(`\nMemory references:`);
for (const m of memRefs) {
  const name = KNOWN_ADDRS[m] || (m >= VRAM_BASE && m < VRAM_BASE + VRAM_SIZE ? 'VRAM' : '');
  console.log(`  ${hex(m)} ${name}`);
}

// Also disassemble 0x061003 (cursorErase) for comparison
console.log('\n===================================================================');
console.log('Comparison: Static disassembly of 0x061003 (cursorErase)');
console.log('===================================================================\n');

pc = CURSOR_ERASE;
for (let i = 0; i < 80; i++) {
  const instr = decodeInstruction(romBytes, pc, 'adl');
  const formatted = formatInstruction(instr);
  const ann = annotate(formatted);
  console.log(`${hex(pc)}: ${formatted.padEnd(40)} [${instr.length}B]${ann}`);
  pc += instr.length;
  if (instr.tag === 'ret') break;
  if (instr.tag === 'jp') break;
}

// === PART 2: Dynamic Trace ===

console.log('\n===================================================================');
console.log('PART 2: Dynamic trace');
console.log('===================================================================\n');

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Boot sequence (minimal OS init)
console.log('Booting OS...');
const bootResult = executor.runFrom(0x000000, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
});
console.log(`Boot: ${bootResult.steps} steps, reason: ${bootResult.reason}`);

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const kernelResult = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 10000,
});
console.log(`Kernel init: ${kernelResult.steps} steps, reason: ${kernelResult.reason}`);

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Post-init
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

console.log('Boot complete.\n');

// Snapshot/restore helpers
const cpuFields = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function snapshotCpu() {
  return Object.fromEntries(cpuFields.map(f => [f, cpu[f]]));
}

function restoreCpu(snap) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
}

function snapshotVram() {
  return new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE));
}

function diffVram(before, after) {
  const changes = [];
  for (let i = 0; i < VRAM_SIZE; i += 2) {
    const pixBefore = before[i] | (before[i + 1] << 8);
    const pixAfter = after[i] | (after[i + 1] << 8);
    if (pixBefore !== pixAfter) {
      const row = Math.floor(i / 640);
      const col = Math.floor((i % 640) / 2);
      changes.push({ offset: i, row, col, before: pixBefore, after: pixAfter });
    }
  }
  return changes;
}

const SENTINEL_RET = 0xD1A800;

function setupCallTo(cursorRow, cursorCol) {
  mem[0xD00595] = cursorRow;
  mem[0xD00596] = cursorCol;
  cpu._iy = 0xD00080;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 6;
  mem[cpu.sp] = SENTINEL_RET & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_RET >> 16) & 0xFF;
}

function runTarget() {
  try {
    const result = executor.runFrom(TARGET, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 5000,
      onMissingBlock(blockPc, _mode, steps) {
        if (blockPc >= 0xD00000) {
          throw new Error(`ram_halt at ${hex(blockPc)} after ${steps} steps`);
        }
      },
    });
    console.log(`  Completed: ${result.steps} steps, reason: ${result.reason}`);
    return result;
  } catch (e) {
    console.log(`  Halted: ${e.message}`);
    return null;
  }
}

function reportChanges(changes) {
  console.log(`  VRAM changes: ${changes.length} pixels`);
  if (changes.length === 0) {
    console.log('  NO VRAM changes detected.');
    return;
  }

  const rows = changes.map(c => c.row);
  const cols = changes.map(c => c.col);
  console.log(`  Bounding box: rows ${Math.min(...rows)}-${Math.max(...rows)}, cols ${Math.min(...cols)}-${Math.max(...cols)}`);

  let nonWhite = 0, white = 0, black = 0;
  for (const c of changes) {
    if (c.after === 0xFFFF) white++;
    else if (c.after === 0x0000) black++;
    else nonWhite++;
  }
  console.log(`  Black pixels (0x0000) written: ${black}`);
  console.log(`  White pixels (0xFFFF) written: ${white}`);
  console.log(`  Other non-white pixels written: ${nonWhite}`);

  console.log('  First 20 changes:');
  for (const c of changes.slice(0, 20)) {
    console.log(`    row=${c.row} col=${c.col}: ${hex(c.before, 4)} -> ${hex(c.after, 4)}`);
  }
}

// --- Test A: cursor at row=3, col=10 ---

console.log('--- Test A: D00595=3, D00596=10, PC=0x060FEA ---');
const snapA = snapshotCpu();

// Fill VRAM with sentinel so we can detect any write
mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_SIZE);
const vramBeforeA = snapshotVram();

setupCallTo(3, 10);
runTarget();

const vramAfterA = snapshotVram();
const changesA = diffVram(vramBeforeA, vramAfterA);
reportChanges(changesA);

// --- Test B: cursor at row=7, col=20 ---

console.log('\n--- Test B: D00595=7, D00596=20, PC=0x060FEA ---');
restoreCpu(snapA);

mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_SIZE);
const vramBeforeB = snapshotVram();

setupCallTo(7, 20);
runTarget();

const vramAfterB = snapshotVram();
const changesB = diffVram(vramBeforeB, vramAfterB);
reportChanges(changesB);

// --- Compare A vs B positions ---

if (changesA.length > 0 && changesB.length > 0) {
  const rowsA = changesA.map(c => c.row);
  const colsA = changesA.map(c => c.col);
  const rowsB = changesB.map(c => c.row);
  const colsB = changesB.map(c => c.col);

  const minRowA = Math.min(...rowsA), minRowB = Math.min(...rowsB);
  const minColA = Math.min(...colsA), minColB = Math.min(...colsB);

  console.log('\n--- Position comparison ---');
  console.log(`  Test A (row=3,col=10): VRAM rows ${minRowA}-${Math.max(...rowsA)}, cols ${minColA}-${Math.max(...colsA)}`);
  console.log(`  Test B (row=7,col=20): VRAM rows ${minRowB}-${Math.max(...rowsB)}, cols ${minColB}-${Math.max(...colsB)}`);
  console.log(`  Row shift: ${minRowB - minRowA} pixels (expected ~${(7 - 3) * 16}=${(7 - 3) * 16} for 16px glyphs)`);
  console.log(`  Col shift: ${minColB - minColA} pixels (expected ~${(20 - 10) * 12}=${(20 - 10) * 12} for 12px glyphs)`);
  console.log(`  Position-dependent: ${minRowA !== minRowB || minColA !== minColB ? 'YES' : 'NO'}`);
}

// --- Key questions summary ---

console.log('\n===================================================================');
console.log('KEY QUESTIONS');
console.log('===================================================================');
console.log(`1. Writes NON-white pixels to VRAM? ${changesA.some(c => c.after !== 0xFFFF && c.after !== 0xAAAA) ? 'YES (cursor draw)' : 'NO'}`);
console.log(`2. VRAM position changes with D00595/D00596? ${(changesA.length > 0 && changesB.length > 0) ? 'check above' : 'insufficient data'}`);
console.log(`3. Calls 0x0059C6 (charRenderer)? ${callTargets.includes(0x0059C6) ? 'YES' : 'NO'}`);
console.log(`4. References cursor glyphs (0xE1/0xE2/0xE3)? check disassembly above`);
console.log(`5. Instructions until RET: ${instrCount}`);
console.log(`6. Calls 0x061003 (cursorErase)? ${callTargets.includes(CURSOR_ERASE) ? 'YES' : 'NO'}`);

console.log('\nDone.');
