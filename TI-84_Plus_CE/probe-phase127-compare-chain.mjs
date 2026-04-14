#!/usr/bin/env node

/**
 * Phase 127 — 0x08C7E1+ Key-Code Compare Chain Disassembly
 *
 * Part A: Static disassembly of 0x08C7AD..0x08C900 (~339 bytes)
 * Part B: Static disassembly of mode=0x44 handler target (~200 bytes)
 * Part C: Dynamic trace with scan code 0x31 (digit '2') from 0x08C7AD
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
const REPORT_PATH = path.join(__dirname, 'phase127-report.md');

// ── Constants ──────────────────────────────────────────────────────────

const PART_A_START = 0x08c7ad;
const PART_A_END = 0x08c900;

const MODE_ADDR = 0xd007e0;
const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;

const STACK_TOP = 0xd1a87e;

const KNOWN_FUNCTIONS = {
  0x085e16: 'render-loop',
  0x0059c6: 'char-print',
  0x0a1cac: 'string-render',
  0x0a2e05: 'zero-clear-D026AC',
  0x08c7ad: 'key-processing-core',
  0x08c4a3: 'key-classifier',
  0x08c543: 'normal-key-path',
  0x08c5d1: 'special-key-path',
};

const MODE_NAMES = {
  0x44: 'home',
  0x52: 'mode-0x52',
  0x4a: 'mode-0x4A',
  0x57: 'mode-0x57',
  0x45: 'mode-0x45',
  0x4b: 'mode-0x4B',
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
    default: break;
  }

  return `${prefix}${text}`;
}

function annotateInstruction(inst) {
  const notes = [];

  // CP instructions (mode checks)
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    const modeName = MODE_NAMES[inst.value];
    notes.push(`CP A, ${hexByte(inst.value)}${modeName ? ` (${modeName})` : ''}`);
  }

  // JP/JR/CALL targets
  const branchTags = ['jp', 'jp-conditional', 'jr', 'jr-conditional', 'call', 'call-conditional'];
  if (branchTags.includes(inst.tag) && inst.target !== undefined) {
    const known = KNOWN_FUNCTIONS[inst.target];
    if (known) {
      notes.push(`-> ${known}`);
    }
  }

  // LD A,(addr) — reads mode/key state
  if (inst.tag === 'ld-a-mem') {
    if (inst.addr === MODE_ADDR) notes.push('reads mode byte');
    else if (inst.addr === KEY_EVENT_ADDR) notes.push('reads key event');
    else notes.push(`reads RAM ${hex(inst.addr)}`);
  }

  // LD-pair-mem from-mem with addr
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'from-mem') {
    if (inst.addr === 0xd008d6) notes.push('reads key-handler table ptr');
    else if (inst.addr === 0xd0243a) notes.push('reads key-handler table ptr 2');
  }

  // SIS LD A,(addr) — short form with MBASE prefix
  if (inst.tag === 'ld-a-mem' && inst.modePrefix === 'sis') {
    const fullAddr = 0xd00000 | (inst.addr & 0xffff);
    if (fullAddr === MODE_ADDR) notes.push('reads mode byte (via SIS)');
    else if (fullAddr === KEY_EVENT_ADDR) notes.push('reads key event (via SIS)');
  }

  return notes;
}

function disassembleRange(romBytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (b) => b.toString(16).padStart(2, '0'),
    ).join(' ');

    const dasm = formatInstruction(inst);
    const notes = annotateInstruction(inst);

    rows.push({ pc: inst.pc, bytes: rawBytes, dasm, notes, inst });
    pc += inst.length;
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
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const coldBoot = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3;

  // OS init
  const osInit = executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080;

  // Post init
  const postInit = executor.runFrom(0x0802b2, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

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

// ── Part A: Static disassembly 0x08C7AD..0x08C900 ─────────────────────

function partA(romBytes) {
  console.log('=== Part A: Static disassembly 0x08C7AD..0x08C900 ===\n');
  const rows = disassembleRange(romBytes, PART_A_START, PART_A_END);
  const lines = renderDisassembly(rows);
  lines.forEach((l) => console.log(l));

  // Collect annotations
  const cpInstructions = [];
  const branchTargets = [];
  const ldAMemInstructions = [];

  for (const row of rows) {
    if (row.inst.tag === 'alu-imm' && row.inst.op === 'cp') {
      cpInstructions.push({ pc: row.pc, value: row.inst.value });
    }

    const branchTags = ['jp', 'jp-conditional', 'jr', 'jr-conditional', 'call', 'call-conditional'];
    if (branchTags.includes(row.inst.tag) && row.inst.target !== undefined) {
      branchTargets.push({
        pc: row.pc,
        tag: row.inst.tag,
        target: row.inst.target,
        condition: row.inst.condition ?? null,
      });
    }

    if (row.inst.tag === 'ld-a-mem') {
      ldAMemInstructions.push({ pc: row.pc, addr: row.inst.addr });
    }
  }

  console.log('\n--- CP instructions (compare A against literal) ---');
  for (const cp of cpInstructions) {
    const modeName = MODE_NAMES[cp.value];
    console.log(`  ${hex(cp.pc)}: CP ${hexByte(cp.value)}${modeName ? ` = ${modeName}` : ''}`);
  }

  console.log('\n--- JP/JR/CALL targets ---');
  for (const b of branchTargets) {
    const known = KNOWN_FUNCTIONS[b.target] ?? '';
    const cond = b.condition ? ` ${b.condition}` : '';
    console.log(`  ${hex(b.pc)}: ${b.tag}${cond} -> ${hex(b.target)} ${known}`);
  }

  console.log('\n--- LD A,(addr) instructions ---');
  for (const ld of ldAMemInstructions) {
    const label = ld.addr === MODE_ADDR ? ' (mode byte)' :
                  ld.addr === KEY_EVENT_ADDR ? ' (key event)' : '';
    console.log(`  ${hex(ld.pc)}: LD A,(${hex(ld.addr)})${label}`);
  }

  return { rows, cpInstructions, branchTargets, ldAMemInstructions };
}

// ── Part B: Static disassembly of mode=0x44 handler ────────────────────

function partB(romBytes, partAResult) {
  console.log('\n=== Part B: Static disassembly of mode=0x44 handler ===\n');

  // Find the CP 0x44 instruction and the branch that follows it
  let mode44Target = null;
  for (let i = 0; i < partAResult.cpInstructions.length; i++) {
    if (partAResult.cpInstructions[i].value === 0x44) {
      // Look for the next branch after this CP
      const cpPc = partAResult.cpInstructions[i].pc;
      for (const b of partAResult.branchTargets) {
        if (b.pc > cpPc && (b.condition === 'z' || b.condition === 'Z')) {
          mode44Target = b.target;
          break;
        }
      }
      // If no conditional z found, try the first branch after CP
      if (!mode44Target) {
        for (const b of partAResult.branchTargets) {
          if (b.pc > cpPc) {
            mode44Target = b.target;
            break;
          }
        }
      }
      break;
    }
  }

  if (!mode44Target) {
    console.log('Could not identify mode=0x44 handler target from Part A.');
    console.log('Attempting fallback: disassemble the first JP Z target after any CP...');

    // Fallback: look for any JP Z or JR Z in the branch list
    for (const b of partAResult.branchTargets) {
      if (b.condition === 'z' || b.condition === 'Z') {
        mode44Target = b.target;
        break;
      }
    }
  }

  if (!mode44Target) {
    console.log('No mode=0x44 handler found. Skipping Part B.');
    return { target: null, rows: [] };
  }

  console.log(`Mode=0x44 handler target: ${hex(mode44Target)}`);
  console.log('');

  const endPc = mode44Target + 200;
  const rows = disassembleRange(romBytes, mode44Target, endPc);
  const lines = renderDisassembly(rows);
  lines.forEach((l) => console.log(l));

  // Look for references to known addresses
  const refs = [];
  for (const row of rows) {
    // Check for 0xD0058E references
    if (row.inst.addr === KEY_EVENT_ADDR || row.inst.target === KEY_EVENT_ADDR) {
      refs.push({ pc: row.pc, type: 'key-event', addr: KEY_EVENT_ADDR });
    }
    // Check for table pointer references
    if (row.inst.addr === 0xd008d6 || row.inst.target === 0xd008d6) {
      refs.push({ pc: row.pc, type: 'key-handler-table', addr: 0xd008d6 });
    }
    if (row.inst.addr === 0xd0243a || row.inst.target === 0xd0243a) {
      refs.push({ pc: row.pc, type: 'key-handler-table-2', addr: 0xd0243a });
    }
    // Check for known function calls
    const branchTags = ['call', 'call-conditional', 'jp', 'jp-conditional'];
    if (branchTags.includes(row.inst.tag) && row.inst.target !== undefined) {
      const known = KNOWN_FUNCTIONS[row.inst.target];
      if (known) {
        refs.push({ pc: row.pc, type: 'known-function', target: row.inst.target, name: known });
      }
    }
  }

  console.log('\n--- References found in mode=0x44 handler ---');
  if (refs.length === 0) {
    console.log('  (none)');
  } else {
    for (const ref of refs) {
      if (ref.type === 'known-function') {
        console.log(`  ${hex(ref.pc)}: calls ${hex(ref.target)} (${ref.name})`);
      } else {
        console.log(`  ${hex(ref.pc)}: references ${hex(ref.addr)} (${ref.type})`);
      }
    }
  }

  return { target: mode44Target, rows, refs };
}

// ── Part C: Dynamic trace ──────────────────────────────────────────────

function partC(env) {
  console.log('\n=== Part C: Dynamic trace with scan code 0x31 (digit 2) ===\n');

  restoreBaseline(env);

  // Set home mode and key event
  env.mem[MODE_ADDR] = 0x44;
  env.mem[KEY_EVENT_ADDR] = 0x31;
  env.cpu.a = 0x31;

  // Trace state
  const blockTrace = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const keyEventReads = [];
  const vramWriteCount = { value: 0 };
  const vramWriterBlocks = [];
  const seenVramWriters = new Set();
  const cursorChanges = [];
  let currentBlock = hex(PART_A_START);
  let currentStep = 0;

  const originalRead8 = env.cpu.read8.bind(env.cpu);
  const originalWrite8 = env.cpu.write8.bind(env.cpu);

  env.cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const masked = addr & 0xffffff;

    if (masked === KEY_EVENT_ADDR) {
      keyEventReads.push({
        value: value & 0xff,
        block: currentBlock,
        step: currentStep,
      });
    }

    return value;
  };

  env.cpu.write8 = (addr, value) => {
    const masked = addr & 0xffffff;
    const maskedVal = value & 0xff;

    if (masked >= VRAM_START && masked < VRAM_END) {
      vramWriteCount.value++;
      if (vramWriterBlocks.length < 30 && !seenVramWriters.has(currentBlock)) {
        seenVramWriters.add(currentBlock);
        vramWriterBlocks.push({ block: currentBlock, addr: masked, step: currentStep });
      }
    }

    if (masked === CUR_ROW_ADDR || masked === CUR_COL_ADDR) {
      cursorChanges.push({
        addr: masked,
        value: maskedVal,
        block: currentBlock,
        step: currentStep,
        which: masked === CUR_ROW_ADDR ? 'row' : 'col',
      });
    }

    return originalWrite8(addr, value);
  };

  function onBlock(pc, mode) {
    const label = `${hex(pc & 0xffffff)}${mode !== 'adl' ? `:${mode}` : ''}`;
    currentBlock = label;
    currentStep = blockTrace.length + 1;
    blockTrace.push(label);
    if (!seenBlocks.has(label)) {
      seenBlocks.add(label);
      uniqueBlocks.push(label);
    }
  }

  let run;
  try {
    run = env.executor.runFrom(PART_A_START, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onBlock,
    });
  } finally {
    env.cpu.read8 = originalRead8;
    env.cpu.write8 = originalWrite8;
  }

  // Print results
  console.log(`Run: steps=${run.steps}, termination=${run.termination}, lastPc=${hex(run.lastPc ?? 0)}`);
  console.log(`Loops forced: ${run.loopsForced ?? 0}`);
  console.log(`Missing blocks: ${[...(run.missingBlocks ?? [])].join(', ') || 'none'}`);
  console.log(`Total blocks visited: ${blockTrace.length}`);
  console.log(`Unique blocks: ${uniqueBlocks.length}`);
  console.log(`Key event reads (0xD0058E): ${keyEventReads.length}`);
  console.log(`VRAM writes: ${vramWriteCount.value}`);
  console.log(`Cursor changes: ${cursorChanges.length}`);

  console.log('\n--- First 200 unique blocks ---');
  const first200 = uniqueBlocks.slice(0, 200);
  for (let i = 0; i < first200.length; i += 10) {
    const chunk = first200.slice(i, i + 10);
    console.log(`  ${chunk.join(', ')}`);
  }

  console.log('\n--- Key event reads (0xD0058E) ---');
  for (const r of keyEventReads.slice(0, 50)) {
    console.log(`  step=${r.step} block=${r.block} value=${hexByte(r.value)}`);
  }
  if (keyEventReads.length > 50) {
    console.log(`  ... +${keyEventReads.length - 50} more`);
  }

  console.log('\n--- VRAM writer blocks ---');
  for (const w of vramWriterBlocks) {
    console.log(`  step=${w.step} block=${w.block} firstAddr=${hex(w.addr)}`);
  }

  console.log('\n--- Cursor changes ---');
  for (const c of cursorChanges.slice(0, 30)) {
    console.log(`  step=${c.step} block=${c.block} ${c.which}=${hexByte(c.value)}`);
  }
  if (cursorChanges.length > 30) {
    console.log(`  ... +${cursorChanges.length - 30} more`);
  }

  return {
    run, blockTrace, uniqueBlocks, keyEventReads, vramWriteCount: vramWriteCount.value,
    vramWriterBlocks, cursorChanges,
  };
}

// ── Report ─────────────────────────────────────────────────────────────

function buildReport(partAResult, partBResult, partCResult, env) {
  const lines = [];

  lines.push('# Phase 127 — 0x08C7E1+ Key-Code Compare Chain Disassembly');
  lines.push('');
  lines.push('Generated by `probe-phase127-compare-chain.mjs`.');
  lines.push('');
  lines.push(`- ROM generatedAt: \`${TRANSPILATION_META?.generatedAt ?? 'n/a'}\``);
  lines.push('');

  // Part A
  lines.push('## Part A — Static Disassembly 0x08C7AD..0x08C900');
  lines.push('');
  lines.push('```text');
  lines.push(...renderDisassembly(partAResult.rows));
  lines.push('```');
  lines.push('');

  lines.push('### CP Instructions (Mode Checks)');
  lines.push('');
  lines.push('| Address | Value | Mode |');
  lines.push('| --- | --- | --- |');
  for (const cp of partAResult.cpInstructions) {
    const modeName = MODE_NAMES[cp.value] ?? '?';
    lines.push(`| \`${hex(cp.pc)}\` | \`${hexByte(cp.value)}\` | ${modeName} |`);
  }
  lines.push('');

  lines.push('### Branch Targets');
  lines.push('');
  lines.push('| Address | Type | Condition | Target | Known |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const b of partAResult.branchTargets) {
    const known = KNOWN_FUNCTIONS[b.target] ?? '';
    lines.push(`| \`${hex(b.pc)}\` | ${b.tag} | ${b.condition ?? '-'} | \`${hex(b.target)}\` | ${known} |`);
  }
  lines.push('');

  lines.push('### LD A,(addr) Instructions');
  lines.push('');
  for (const ld of partAResult.ldAMemInstructions) {
    const label = ld.addr === MODE_ADDR ? ' (mode byte)' :
                  ld.addr === KEY_EVENT_ADDR ? ' (key event)' : '';
    lines.push(`- \`${hex(ld.pc)}\`: LD A, (\`${hex(ld.addr)}\`)${label}`);
  }
  lines.push('');

  // Part B
  lines.push('## Part B — Mode=0x44 (Home) Handler');
  lines.push('');
  if (partBResult.target) {
    lines.push(`Handler target: \`${hex(partBResult.target)}\``);
    lines.push('');
    lines.push('```text');
    lines.push(...renderDisassembly(partBResult.rows));
    lines.push('```');
    lines.push('');

    if (partBResult.refs && partBResult.refs.length > 0) {
      lines.push('### References Found');
      lines.push('');
      for (const ref of partBResult.refs) {
        if (ref.type === 'known-function') {
          lines.push(`- \`${hex(ref.pc)}\`: calls \`${hex(ref.target)}\` (${ref.name})`);
        } else {
          lines.push(`- \`${hex(ref.pc)}\`: references \`${hex(ref.addr)}\` (${ref.type})`);
        }
      }
      lines.push('');
    } else {
      lines.push('No references to known addresses (0xD0058E, 0xD008D6, 0xD0243A, 0x085E16, 0x0059C6, 0x0A1CAC) found in visible slice.');
      lines.push('');
    }
  } else {
    lines.push('Could not identify mode=0x44 handler from Part A compare chain.');
    lines.push('');
  }

  // Part C
  const c = partCResult;
  lines.push('## Part C — Dynamic Trace (scan code 0x31, digit 2)');
  lines.push('');
  lines.push(`- Steps: \`${c.run.steps}\``);
  lines.push(`- Termination: \`${c.run.termination}\``);
  lines.push(`- Last PC: \`${hex(c.run.lastPc ?? 0)}\``);
  lines.push(`- Loops forced: \`${c.run.loopsForced ?? 0}\``);
  lines.push(`- Missing blocks: \`${[...(c.run.missingBlocks ?? [])].join(', ') || 'none'}\``);
  lines.push(`- Total blocks visited: \`${c.blockTrace.length}\``);
  lines.push(`- Unique blocks: \`${c.uniqueBlocks.length}\``);
  lines.push(`- Key event reads (0xD0058E): \`${c.keyEventReads.length}\``);
  lines.push(`- VRAM writes: \`${c.vramWriteCount}\``);
  lines.push(`- Cursor changes: \`${c.cursorChanges.length}\``);
  lines.push('');

  lines.push('### First 200 Unique Blocks');
  lines.push('');
  lines.push('```text');
  const first200 = c.uniqueBlocks.slice(0, 200);
  for (let i = 0; i < first200.length; i += 8) {
    lines.push(first200.slice(i, i + 8).join(', '));
  }
  lines.push('```');
  lines.push('');

  lines.push('### Key Event Reads');
  lines.push('');
  if (c.keyEventReads.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Step | Block | Value |');
    lines.push('| --- | --- | --- |');
    for (const r of c.keyEventReads.slice(0, 50)) {
      lines.push(`| ${r.step} | \`${r.block}\` | \`${hexByte(r.value)}\` |`);
    }
    if (c.keyEventReads.length > 50) {
      lines.push(`| ... | +${c.keyEventReads.length - 50} more | |`);
    }
  }
  lines.push('');

  lines.push('### VRAM Writer Blocks');
  lines.push('');
  if (c.vramWriterBlocks.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Step | Block | First VRAM Addr |');
    lines.push('| --- | --- | --- |');
    for (const w of c.vramWriterBlocks) {
      lines.push(`| ${w.step} | \`${w.block}\` | \`${hex(w.addr)}\` |`);
    }
  }
  lines.push('');

  lines.push('### Cursor Changes');
  lines.push('');
  if (c.cursorChanges.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Step | Block | Which | Value |');
    lines.push('| --- | --- | --- | --- |');
    for (const ch of c.cursorChanges.slice(0, 30)) {
      lines.push(`| ${ch.step} | \`${ch.block}\` | ${ch.which} | \`${hexByte(ch.value)}\` |`);
    }
    if (c.cursorChanges.length > 30) {
      lines.push(`| ... | +${c.cursorChanges.length - 30} more | | |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const env = bootEnvironment();
  console.log('Boot complete.\n');

  const partAResult = partA(env.romBytes);
  const partBResult = partB(env.romBytes, partAResult);
  const partCResult = partC(env);

  const report = buildReport(partAResult, partBResult, partCResult, env);
  fs.writeFileSync(REPORT_PATH, report + '\n', 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  const failureReport = [
    '# Phase 127 — 0x08C7E1+ Key-Code Compare Chain Disassembly',
    '',
    'Generated by `probe-phase127-compare-chain.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
    '',
  ].join('\n');

  console.error(error.stack || String(error));
  fs.writeFileSync(REPORT_PATH, failureReport, 'utf8');
  process.exitCode = 1;
}
