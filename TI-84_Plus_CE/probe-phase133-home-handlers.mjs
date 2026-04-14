#!/usr/bin/env node

/**
 * Phase 133 — Home-Screen Key Handler Functions
 *
 * Part A: Static disassembly of 0x0800C2, 0x0800A0, 0x08759D (~200 bytes each)
 * Part B: Dynamic trace of each function from cold-boot state
 * Part C: Cross-reference callers (scan ROM for CALL instructions)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase133-report.md');

// ── Constants ──────────────────────────────────────────────────────────

const TARGETS = [0x0800c2, 0x0800a0, 0x08759d];
const TARGET_NAMES = {
  0x0800c2: 'home-handler-1',
  0x0800a0: 'home-handler-2',
  0x08759d: 'home-handler-3',
};

const MODE_ADDR = 0xd007e0;
const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const MODE_TEXT_BUF = 0xd020a6;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;

const STACK_TOP = 0xd1a87e;

const KNOWN_RAM = {
  [KEY_EVENT_ADDR]: 'key event buffer',
  [CUR_ROW_ADDR]: 'curRow',
  [CUR_COL_ADDR]: 'curCol',
  [MODE_ADDR]: 'mode byte',
  [MODE_TEXT_BUF]: 'mode text buffer',
};

const KNOWN_FUNCTIONS = {
  0x085e16: 'render-loop',
  0x0059c6: 'char-print',
  0x0a1cac: 'string-render',
  0x0a2e05: 'zero-clear-D026AC',
  0x08c7ad: 'key-processing-core',
  0x08c4a3: 'key-classifier',
  0x08c543: 'normal-key-path',
  0x08c5d1: 'special-key-path',
  0x0800c2: 'home-handler-1',
  0x0800a0: 'home-handler-2',
  0x08759d: 'home-handler-3',
};

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ── Helpers ────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
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
    case 'ex-de-hl': text = 'ex de, hl'; break;
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
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister}`; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
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
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'add-ix-pair': text = `add ${inst.indexRegister}, ${inst.pair}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function annotateInstruction(inst) {
  const notes = [];

  // Known RAM references
  if (inst.tag === 'ld-a-mem' && KNOWN_RAM[inst.addr]) {
    notes.push(`reads ${KNOWN_RAM[inst.addr]}`);
  } else if (inst.tag === 'ld-a-mem') {
    if (inst.addr >= 0xd00000 && inst.addr < 0xd10000) {
      notes.push(`reads RAM ${hex(inst.addr)}`);
    }
  }

  if (inst.tag === 'ld-mem-a' && KNOWN_RAM[inst.addr]) {
    notes.push(`writes ${KNOWN_RAM[inst.addr]}`);
  } else if (inst.tag === 'ld-mem-a') {
    if (inst.addr >= 0xd00000 && inst.addr < 0xd10000) {
      notes.push(`writes RAM ${hex(inst.addr)}`);
    }
  }

  // LD pair,(addr) or LD (addr),pair
  if (inst.tag === 'ld-pair-mem') {
    const label = KNOWN_RAM[inst.addr] ?? '';
    if (inst.direction === 'from-mem') {
      notes.push(`loads ${inst.pair} from ${hex(inst.addr)}${label ? ` (${label})` : ''}`);
    } else {
      notes.push(`stores ${inst.pair} to ${hex(inst.addr)}${label ? ` (${label})` : ''}`);
    }
  }

  // Branch targets
  const branchTags = ['jp', 'jp-conditional', 'jr', 'jr-conditional', 'call', 'call-conditional'];
  if (branchTags.includes(inst.tag) && inst.target !== undefined) {
    const known = KNOWN_FUNCTIONS[inst.target];
    if (known) notes.push(`-> ${known}`);
  }

  // VRAM range references
  if (inst.addr >= VRAM_START && inst.addr < VRAM_END) {
    notes.push('VRAM');
  }

  // CP instructions
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push(`CP A, ${hexByte(inst.value)}`);
  }

  return notes;
}

function disassembleRange(romBytes, startPc, length) {
  const rows = [];
  let pc = startPc;
  const endPc = startPc + length;

  while (pc < endPc) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch (e) {
      rows.push({
        pc,
        bytes: (romBytes[pc] ?? 0).toString(16).padStart(2, '0'),
        dasm: `??? (decode error: ${e.message})`,
        notes: [],
        inst: { tag: 'unknown', length: 1, nextPc: pc + 1 },
      });
      pc++;
      continue;
    }

    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (b) => b.toString(16).padStart(2, '0'),
    ).join(' ');

    const dasm = formatInstruction(inst);
    const notes = annotateInstruction(inst);

    rows.push({ pc: inst.pc, bytes: rawBytes, dasm, notes, inst });
    pc = inst.nextPc;
  }

  return rows;
}

function renderDisassembly(rows) {
  return rows.map((row) => {
    const addr = hex(row.pc);
    const bytePad = row.bytes.padEnd(20);
    const noteStr = row.notes.length > 0 ? `  ; ${row.notes.join(', ')}` : '';
    return `${addr}  ${bytePad}  ${row.dasm}${noteStr}`;
  });
}

// ── Boot Environment ───────────────────────────────────────────────────

function snapshotCpu(cpu) {
  const snap = {};
  for (const f of CPU_SNAPSHOT_FIELDS) snap[f] = cpu[f];
  return snap;
}

function restoreCpu(cpu, snap) {
  for (const f of CPU_SNAPSHOT_FIELDS) cpu[f] = snap[f];
}

function bootEnvironment() {
  console.log('Booting environment...');
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const coldBoot = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  cold boot: steps=${coldBoot.steps}, term=${coldBoot.termination}`);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3;

  // OS init
  const osInit = executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  OS init: steps=${osInit.steps}, term=${osInit.termination}`);
  cpu.mbase = 0xd0; cpu._iy = 0xd00080;

  // Post init
  const postInit = executor.runFrom(0x0802b2, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  console.log(`  post init: steps=${postInit.steps}, term=${postInit.termination}`);

  return {
    mem, romBytes, peripherals, executor, cpu,
    coldBoot, osInit, postInit,
    baselineCpu: snapshotCpu(cpu),
    baselineRam: new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineRam, RAM_SNAPSHOT_START);
  restoreCpu(env.cpu, env.baselineCpu);
}

// ── Part A: Static disassembly of all three functions ──────────────────

function partA(romBytes) {
  console.log('\n=== Part A: Static disassembly of home handler functions ===\n');

  const results = {};

  for (const target of TARGETS) {
    const name = TARGET_NAMES[target];
    console.log(`--- ${name} (${hex(target)}) ---\n`);

    const rows = disassembleRange(romBytes, target, 200);
    const lines = renderDisassembly(rows);
    lines.forEach((l) => console.log(l));

    // Collect CALL targets
    const callTargets = [];
    const ramRefs = [];
    const branchTargets = [];

    for (const row of rows) {
      // CALL targets
      if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
        callTargets.push({
          pc: row.pc,
          target: row.inst.target,
          condition: row.inst.condition ?? null,
          known: KNOWN_FUNCTIONS[row.inst.target] ?? null,
        });
      }

      // JP/JR targets
      const branchTags = ['jp', 'jp-conditional', 'jr', 'jr-conditional'];
      if (branchTags.includes(row.inst.tag) && row.inst.target !== undefined) {
        branchTargets.push({
          pc: row.pc,
          tag: row.inst.tag,
          target: row.inst.target,
          condition: row.inst.condition ?? null,
        });
      }

      // RAM references
      const addr = row.inst.addr;
      if (addr !== undefined && addr >= 0xd00000 && addr < 0xd53000) {
        const label = KNOWN_RAM[addr] ?? (addr >= VRAM_START && addr < VRAM_END ? 'VRAM' : null);
        ramRefs.push({ pc: row.pc, addr, label, tag: row.inst.tag });
      }
    }

    console.log(`\n  CALL targets (${callTargets.length}):`);
    for (const ct of callTargets) {
      const cond = ct.condition ? ` ${ct.condition}` : '';
      const known = ct.known ? ` (${ct.known})` : '';
      console.log(`    ${hex(ct.pc)}: CALL${cond} ${hex(ct.target)}${known}`);
    }

    console.log(`\n  RAM references (${ramRefs.length}):`);
    for (const rr of ramRefs) {
      const label = rr.label ? ` = ${rr.label}` : '';
      console.log(`    ${hex(rr.pc)}: ${rr.tag} ${hex(rr.addr)}${label}`);
    }

    console.log(`\n  Branch targets (${branchTargets.length}):`);
    for (const bt of branchTargets) {
      const cond = bt.condition ? ` ${bt.condition}` : '';
      console.log(`    ${hex(bt.pc)}: ${bt.tag}${cond} -> ${hex(bt.target)}`);
    }

    console.log('');

    results[target] = { name, rows, callTargets, ramRefs, branchTargets };
  }

  return results;
}

// ── Part B: Dynamic trace of each function ────────────────────────────

function partB(env) {
  console.log('\n=== Part B: Dynamic trace of each function ===\n');

  const results = {};

  for (const target of TARGETS) {
    const name = TARGET_NAMES[target];
    console.log(`--- Dynamic trace: ${name} (${hex(target)}) ---\n`);

    restoreBaseline(env);

    // Pre-seed state
    env.mem[MODE_ADDR] = 0x44;       // home mode
    env.mem[KEY_EVENT_ADDR] = 0x31;  // digit '2' scan code
    env.cpu.sp = STACK_TOP;

    // Snapshot pre-run RAM for comparison
    const preKeyEvent = env.mem[KEY_EVENT_ADDR];
    const preCurRow = env.mem[CUR_ROW_ADDR];
    const preCurCol = env.mem[CUR_COL_ADDR];

    // Snapshot RAM region for diff
    const preRamSnap = new Uint8Array(env.mem.slice(0xd00000, 0xd10000));

    // Tracking variables
    let vramWrites = 0;
    let vramMinRow = Infinity;
    let vramMaxRow = -1;
    const ramWriteAddrs = new Set();
    const blockTrace = [];
    const uniqueBlocks = new Set();
    let currentBlock = hex(target);
    let currentStep = 0;

    const originalRead8 = env.cpu.read8.bind(env.cpu);
    const originalWrite8 = env.cpu.write8.bind(env.cpu);

    env.cpu.write8 = (addr, value) => {
      const masked = addr & 0xffffff;

      if (masked >= VRAM_START && masked < VRAM_END) {
        vramWrites++;
        const row = Math.floor((masked - VRAM_START) / (320 * 2));
        if (row < vramMinRow) vramMinRow = row;
        if (row > vramMaxRow) vramMaxRow = row;
      }

      if (masked >= 0xd00000 && masked < 0xd10000) {
        ramWriteAddrs.add(masked);
      }

      return originalWrite8(addr, value);
    };

    function onBlock(pc, mode) {
      const label = `${hex(pc & 0xffffff)}${mode !== 'adl' ? `:${mode}` : ''}`;
      currentBlock = label;
      currentStep = blockTrace.length + 1;
      blockTrace.push(label);
      uniqueBlocks.add(label);
    }

    let run;
    try {
      run = env.executor.runFrom(target, 'adl', {
        maxSteps: 50000,
        maxLoopIterations: 500,
        onBlock,
      });
    } finally {
      env.cpu.read8 = originalRead8;
      env.cpu.write8 = originalWrite8;
    }

    // Post-run state
    const postKeyEvent = env.mem[KEY_EVENT_ADDR];
    const postCurRow = env.mem[CUR_ROW_ADDR];
    const postCurCol = env.mem[CUR_COL_ADDR];

    // RAM diff
    const ramChangedAddrs = [];
    for (let i = 0; i < 0x10000; i++) {
      if (env.mem[0xd00000 + i] !== preRamSnap[i]) {
        ramChangedAddrs.push(0xd00000 + i);
      }
    }

    const result = {
      name,
      steps: run.steps,
      termination: run.termination,
      lastPc: run.lastPc ?? 0,
      loopsForced: run.loopsForced ?? 0,
      missingBlocks: [...(run.missingBlocks ?? [])],
      totalBlocks: blockTrace.length,
      uniqueBlocks: uniqueBlocks.size,
      vramWrites,
      vramRowRange: vramWrites > 0 ? `${vramMinRow}-${vramMaxRow}` : 'none',
      ramWriteCount: ramWriteAddrs.size,
      keyEvent: { before: preKeyEvent, after: postKeyEvent, changed: preKeyEvent !== postKeyEvent },
      curRow: { before: preCurRow, after: postCurRow, changed: preCurRow !== postCurRow },
      curCol: { before: preCurCol, after: postCurCol, changed: preCurCol !== postCurCol },
      ramChangedCount: ramChangedAddrs.length,
      blockTrace: blockTrace.slice(0, 100),
    };

    console.log(`  Steps: ${result.steps}`);
    console.log(`  Termination: ${result.termination}`);
    console.log(`  Last PC: ${hex(result.lastPc)}`);
    console.log(`  Loops forced: ${result.loopsForced}`);
    console.log(`  Missing blocks: ${result.missingBlocks.join(', ') || 'none'}`);
    console.log(`  Total blocks visited: ${result.totalBlocks}`);
    console.log(`  Unique blocks: ${result.uniqueBlocks}`);
    console.log(`  VRAM writes: ${result.vramWrites} (rows: ${result.vramRowRange})`);
    console.log(`  RAM writes (distinct 0xD00000-0xD10000): ${result.ramWriteCount}`);
    console.log(`  Key event (0xD0058E): ${hexByte(result.keyEvent.before)} -> ${hexByte(result.keyEvent.after)} ${result.keyEvent.changed ? 'CHANGED' : 'unchanged'}`);
    console.log(`  curRow (0xD00595): ${hexByte(result.curRow.before)} -> ${hexByte(result.curRow.after)} ${result.curRow.changed ? 'CHANGED' : 'unchanged'}`);
    console.log(`  curCol (0xD00596): ${hexByte(result.curCol.before)} -> ${hexByte(result.curCol.after)} ${result.curCol.changed ? 'CHANGED' : 'unchanged'}`);
    console.log(`  Total RAM changes (0xD00000-0xD10000): ${result.ramChangedCount}`);

    console.log(`\n  First 50 blocks:`);
    for (let i = 0; i < Math.min(50, blockTrace.length); i += 10) {
      const chunk = blockTrace.slice(i, i + 10);
      console.log(`    ${chunk.join(', ')}`);
    }

    // Show some changed RAM addresses
    if (ramChangedAddrs.length > 0) {
      console.log(`\n  Notable RAM changes (first 30):`);
      for (const addr of ramChangedAddrs.slice(0, 30)) {
        const label = KNOWN_RAM[addr] ? ` (${KNOWN_RAM[addr]})` : '';
        console.log(`    ${hex(addr)}: ${hexByte(preRamSnap[addr - 0xd00000])} -> ${hexByte(env.mem[addr])}${label}`);
      }
      if (ramChangedAddrs.length > 30) {
        console.log(`    ... +${ramChangedAddrs.length - 30} more`);
      }
    }

    console.log('');

    results[target] = result;
  }

  return results;
}

// ── Part C: Cross-reference callers ───────────────────────────────────

function partC(romBytes) {
  console.log('\n=== Part C: Cross-reference callers ===\n');

  const results = {};

  // eZ80 ADL CALL = 0xCD followed by 3-byte LE address
  const searchPatterns = {
    0x0800c2: [0xcd, 0xc2, 0x00, 0x08],
    0x0800a0: [0xcd, 0xa0, 0x00, 0x08],
    0x08759d: [0xcd, 0x9d, 0x75, 0x08],
  };

  const romEnd = Math.min(romBytes.length, 0x400000);

  for (const target of TARGETS) {
    const name = TARGET_NAMES[target];
    const pattern = searchPatterns[target];
    const callers = [];

    for (let i = 0; i < romEnd - 3; i++) {
      if (romBytes[i] === pattern[0] &&
          romBytes[i + 1] === pattern[1] &&
          romBytes[i + 2] === pattern[2] &&
          romBytes[i + 3] === pattern[3]) {
        callers.push(i);
      }
    }

    console.log(`${name} (${hex(target)}): ${callers.length} caller(s)`);
    for (const caller of callers) {
      console.log(`  CALL at ${hex(caller)}`);
    }

    results[target] = { name, callers };
  }

  return results;
}

// ── Report ─────────────────────────────────────────────────────────────

function buildReport(partAResult, partBResult, partCResult) {
  const lines = [];

  lines.push('# Phase 133 — Home-Screen Key Handler Functions');
  lines.push('');
  lines.push('Generated by `probe-phase133-home-handlers.mjs`.');
  lines.push('');
  lines.push(`- ROM generatedAt: \`${TRANSPILATION_META?.generatedAt ?? 'n/a'}\``);
  lines.push('');

  // Part A
  lines.push('## Part A — Static Disassembly');
  lines.push('');

  for (const target of TARGETS) {
    const data = partAResult[target];
    lines.push(`### ${data.name} (${hex(target)})`);
    lines.push('');
    lines.push('```text');
    lines.push(...renderDisassembly(data.rows));
    lines.push('```');
    lines.push('');

    lines.push('#### CALL Targets');
    lines.push('');
    if (data.callTargets.length === 0) {
      lines.push('(none in first 200 bytes)');
    } else {
      lines.push('| From | Condition | Target | Known |');
      lines.push('| --- | --- | --- | --- |');
      for (const ct of data.callTargets) {
        lines.push(`| \`${hex(ct.pc)}\` | ${ct.condition ?? '-'} | \`${hex(ct.target)}\` | ${ct.known ?? ''} |`);
      }
    }
    lines.push('');

    lines.push('#### RAM References');
    lines.push('');
    if (data.ramRefs.length === 0) {
      lines.push('(none in first 200 bytes)');
    } else {
      lines.push('| From | Instruction | Address | Label |');
      lines.push('| --- | --- | --- | --- |');
      for (const rr of data.ramRefs) {
        lines.push(`| \`${hex(rr.pc)}\` | ${rr.tag} | \`${hex(rr.addr)}\` | ${rr.label ?? ''} |`);
      }
    }
    lines.push('');
  }

  // Part B
  lines.push('## Part B — Dynamic Traces');
  lines.push('');

  for (const target of TARGETS) {
    const r = partBResult[target];
    lines.push(`### ${r.name} (${hex(target)})`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Steps | ${r.steps} |`);
    lines.push(`| Termination | \`${r.termination}\` |`);
    lines.push(`| Last PC | \`${hex(r.lastPc)}\` |`);
    lines.push(`| Loops forced | ${r.loopsForced} |`);
    lines.push(`| Missing blocks | ${r.missingBlocks.join(', ') || 'none'} |`);
    lines.push(`| Total blocks | ${r.totalBlocks} |`);
    lines.push(`| Unique blocks | ${r.uniqueBlocks} |`);
    lines.push(`| VRAM writes | ${r.vramWrites} (rows: ${r.vramRowRange}) |`);
    lines.push(`| RAM writes (distinct) | ${r.ramWriteCount} |`);
    lines.push(`| Key event (0xD0058E) | ${hexByte(r.keyEvent.before)} -> ${hexByte(r.keyEvent.after)} ${r.keyEvent.changed ? '**CHANGED**' : 'unchanged'} |`);
    lines.push(`| curRow (0xD00595) | ${hexByte(r.curRow.before)} -> ${hexByte(r.curRow.after)} ${r.curRow.changed ? '**CHANGED**' : 'unchanged'} |`);
    lines.push(`| curCol (0xD00596) | ${hexByte(r.curCol.before)} -> ${hexByte(r.curCol.after)} ${r.curCol.changed ? '**CHANGED**' : 'unchanged'} |`);
    lines.push(`| Total RAM changes | ${r.ramChangedCount} |`);
    lines.push('');

    lines.push('#### Block Trace (first 50)');
    lines.push('');
    lines.push('```text');
    const first50 = r.blockTrace.slice(0, 50);
    for (let i = 0; i < first50.length; i += 8) {
      lines.push(first50.slice(i, i + 8).join(', '));
    }
    lines.push('```');
    lines.push('');
  }

  // Part C
  lines.push('## Part C — Cross-Reference Callers');
  lines.push('');
  lines.push('ROM scanned for `CD xx yy zz` (eZ80 ADL CALL) patterns:');
  lines.push('');

  for (const target of TARGETS) {
    const data = partCResult[target];
    lines.push(`### ${data.name} (${hex(target)})`);
    lines.push('');
    if (data.callers.length === 0) {
      lines.push('No callers found in ROM.');
    } else {
      lines.push(`${data.callers.length} caller(s):`);
      lines.push('');
      for (const caller of data.callers) {
        lines.push(`- CALL at \`${hex(caller)}\``);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 133 — Home-Screen Key Handler Functions\n');

  const env = bootEnvironment();

  const partAResult = partA(env.romBytes);
  const partBResult = partB(env);
  const partCResult = partC(env.romBytes);

  const report = buildReport(partAResult, partBResult, partCResult);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main();
