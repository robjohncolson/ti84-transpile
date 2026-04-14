#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS, TRANSPILATION_META, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase131-report.md');

// --- Constants ---

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const TARGET_BLIT = 0x06edac;
const TARGET_POST = 0x06fcd0;

const STACK_RESET_TOP = 0xd1a87e;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const LCD_PIXEL_COUNT = LCD_WIDTH * LCD_HEIGHT;
const VRAM_BYTE_SIZE = LCD_PIXEL_COUNT * 2;
const VRAM_END = VRAM_BASE + VRAM_BYTE_SIZE;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im',
  'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map(f => [f, cpu[f]]));
}

function restoreCpuForRun(cpu, snapshot, mem) {
  for (const f of CPU_SNAPSHOT_FIELDS) cpu[f] = snapshot[f];
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 0x400;
  mem.fill(0xfe, cpu.sp, cpu.sp + 0x400);
}

// --- Part A: Static disassembly ---

function disassembleRegion(rom, startAddr, byteCount, mode = 'adl') {
  const lines = [];
  let pc = startAddr;
  const endAddr = startAddr + byteCount;

  while (pc < endAddr) {
    try {
      const inst = decodeInstruction(rom, pc, mode);
      const rawBytes = [];
      for (let i = 0; i < inst.length; i++) {
        rawBytes.push(rom[pc + i]?.toString(16).padStart(2, '0') ?? '??');
      }
      const bytesStr = rawBytes.join(' ').padEnd(20);

      // Build mnemonic from tag + fields
      let mnemonic = inst.tag || 'unknown';
      const parts = [mnemonic];

      if (inst.modePrefix) parts[0] = `${inst.modePrefix} ${parts[0]}`;

      // Add operand details based on common fields
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

      const desc = extras.length > 0 ? `${mnemonic} ${extras.join(', ')}` : mnemonic;

      lines.push(`${hex(pc)}  ${bytesStr}  ${desc}`);
      pc = inst.nextPc;
    } catch (e) {
      const byte = rom[pc]?.toString(16).padStart(2, '0') ?? '??';
      lines.push(`${hex(pc)}  ${byte.padEnd(20)}  ??? (decode error: ${e.message})`);
      pc++;
    }
  }

  return lines;
}

// --- VRAM write hook ---

function installVramWriteHook(cpu) {
  let writeCount = 0;
  const orig8 = cpu.write8.bind(cpu);
  const orig16 = cpu.write16 ? cpu.write16.bind(cpu) : null;
  const orig24 = cpu.write24 ? cpu.write24.bind(cpu) : null;

  function countBytes(addr, n) {
    const s = addr & 0xffffff;
    const e = s + n - 1;
    if (e < VRAM_BASE || s >= VRAM_END) return;
    const first = Math.max(s, VRAM_BASE);
    const last = Math.min(e, VRAM_END - 1);
    writeCount += last - first + 1;
  }

  cpu.write8 = (addr, val) => { countBytes(addr, 1); return orig8(addr, val); };
  if (orig16) cpu.write16 = (addr, val) => { countBytes(addr, 2); return orig16(addr, val); };
  if (orig24) cpu.write24 = (addr, val) => { countBytes(addr, 3); return orig24(addr, val); };

  return {
    getWriteCount() { return writeCount; },
    restore() {
      cpu.write8 = orig8;
      if (orig16) cpu.write16 = orig16;
      if (orig24) cpu.write24 = orig24;
    },
  };
}

// --- LCD MMIO tracking ---

function installLcdMmioTracker(cpu) {
  const lcdWrites = [];
  const lcdReads = [];

  // Intercept MMIO reads/writes in the LCD region (0xE00000-0xE0002F)
  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);

  cpu.read8 = (addr) => {
    const val = origRead8(addr);
    if (addr >= 0xe00000 && addr < 0xe00030) {
      lcdReads.push({ addr, value: val, reg: addr - 0xe00000 });
    }
    return val;
  };

  cpu.write8 = (addr, val) => {
    if (addr >= 0xe00000 && addr < 0xe00030) {
      lcdWrites.push({ addr, value: val, reg: addr - 0xe00000 });
    }
    return origWrite8(addr, val);
  };

  return {
    getLcdWrites() { return lcdWrites; },
    getLcdReads() { return lcdReads; },
    restore() {
      cpu.read8 = origRead8;
      cpu.write8 = origWrite8;
    },
  };
}

// --- I/O port tracking ---

function installIoTracker(cpu) {
  const ioWrites = [];
  const ioReads = [];

  const origOnIoRead = cpu.onIoRead?.bind(cpu) || (() => {});
  const origOnIoWrite = cpu.onIoWrite?.bind(cpu) || (() => {});

  cpu.onIoRead = (port, value) => {
    ioReads.push({ port, value });
    origOnIoRead(port, value);
  };

  cpu.onIoWrite = (port, value) => {
    ioWrites.push({ port, value });
    origOnIoWrite(port, value);
  };

  return {
    getIoWrites() { return ioWrites; },
    getIoReads() { return ioReads; },
    restore() {
      cpu.onIoRead = origOnIoRead;
      cpu.onIoWrite = origOnIoWrite;
    },
  };
}

// --- Boot ---

function buildEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;

  const osInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080;

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

  return {
    romBytes, mem, executor, cpu,
    coldBoot, osInit, postInit,
    ramSnapshot: new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function resetToPostBoot(env) {
  env.mem.set(env.ramSnapshot, RAM_SNAPSHOT_START);
  restoreCpuForRun(env.cpu, env.cpuSnapshot, env.mem);
}

// --- LCD register names ---

const LCD_REG_NAMES = {
  0x00: 'LCDTiming0',
  0x04: 'LCDTiming1',
  0x08: 'LCDTiming2',
  0x0c: 'LCDTiming3',
  0x10: 'LCDUPBASE (lo)',
  0x11: 'LCDUPBASE (mid)',
  0x12: 'LCDUPBASE (hi)',
  0x14: 'LCDLPBASE (lo)',
  0x15: 'LCDLPBASE (mid)',
  0x16: 'LCDLPBASE (hi)',
  0x18: 'LCDControl',
  0x1c: 'LCDIMSC',
  0x20: 'LCDRIS',
  0x24: 'LCDMIS',
  0x28: 'LCDICR',
};

function lcdRegName(reg) {
  return LCD_REG_NAMES[reg] || `LCD_REG_${hex(reg, 2)}`;
}

// --- Main ---

function main() {
  console.log('Phase 131 - 0x06EDAC VRAM Blit Mechanism Analysis');
  console.log('===================================================\n');

  console.log('Booting environment...');
  const env = buildEnvironment();
  console.log(`Boot complete. ROM: ${TRANSPILATION_META?.blockCount ?? '?'} blocks`);
  console.log(`  coldBoot: steps=${env.coldBoot.steps} term=${env.coldBoot.termination}`);
  console.log(`  osInit:   steps=${env.osInit.steps} term=${env.osInit.termination}`);
  console.log(`  postInit: steps=${env.postInit.steps} term=${env.postInit.termination}\n`);

  const report = [];

  report.push('# Phase 131 - 0x06EDAC VRAM Blit Mechanism Analysis');
  report.push('');
  report.push('Generated by `probe-phase131-blit-analysis.mjs`.');
  report.push('');

  // --- Part A: Static disassembly of 0x06EDAC ---
  console.log('--- Part A: Static disassembly of 0x06EDAC (200 bytes) ---');
  const disasmA = disassembleRegion(env.romBytes, TARGET_BLIT, 200, 'adl');
  for (const line of disasmA) console.log(`  ${line}`);
  console.log('');

  report.push('## Part A: Static Disassembly of 0x06EDAC (~200 bytes)');
  report.push('');
  report.push('```');
  for (const line of disasmA) report.push(line);
  report.push('```');
  report.push('');

  // --- Part B: LCD peripheral trace during 0x06EDAC ---
  console.log('--- Part B: LCD peripheral trace during 0x06EDAC ---');
  resetToPostBoot(env);
  env.mem.fill(0xaa, VRAM_BASE, VRAM_END); // sentinel

  const lcdTracker = installLcdMmioTracker(env.cpu);
  const ioTracker = installIoTracker(env.cpu);
  const vramHook = installVramWriteHook(env.cpu);

  let resultB;
  try {
    resultB = env.executor.runFrom(TARGET_BLIT, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 10000,
    });
  } finally {
    lcdTracker.restore();
    ioTracker.restore();
    vramHook.restore();
  }

  const lcdWrites = lcdTracker.getLcdWrites();
  const lcdReads = lcdTracker.getLcdReads();
  const ioWrites = ioTracker.getIoWrites();
  const ioReads = ioTracker.getIoReads();
  const vramWriteCount = vramHook.getWriteCount();

  console.log(`  Steps: ${resultB.steps}`);
  console.log(`  Termination: ${resultB.termination}`);
  console.log(`  Last PC: ${hex(resultB.lastPc)}`);
  console.log(`  VRAM bytes written: ${vramWriteCount}`);
  console.log(`  LCD MMIO writes: ${lcdWrites.length}`);
  console.log(`  LCD MMIO reads: ${lcdReads.length}`);
  console.log(`  I/O port writes: ${ioWrites.length}`);
  console.log(`  I/O port reads: ${ioReads.length}`);

  // Deduplicate LCD writes by register
  const lcdWritesByReg = new Map();
  for (const w of lcdWrites) {
    if (!lcdWritesByReg.has(w.reg)) lcdWritesByReg.set(w.reg, []);
    lcdWritesByReg.get(w.reg).push(w.value);
  }
  const lcdReadsByReg = new Map();
  for (const r of lcdReads) {
    if (!lcdReadsByReg.has(r.reg)) lcdReadsByReg.set(r.reg, []);
    lcdReadsByReg.get(r.reg).push(r.value);
  }

  // Deduplicate I/O by port
  const ioWritesByPort = new Map();
  for (const w of ioWrites) {
    if (!ioWritesByPort.has(w.port)) ioWritesByPort.set(w.port, []);
    ioWritesByPort.get(w.port).push(w.value);
  }
  const ioReadsByPort = new Map();
  for (const r of ioReads) {
    if (!ioReadsByPort.has(r.port)) ioReadsByPort.set(r.port, []);
    ioReadsByPort.get(r.port).push(r.value);
  }

  if (lcdWrites.length > 0) {
    console.log('  LCD MMIO writes by register:');
    for (const [reg, vals] of lcdWritesByReg) {
      const unique = [...new Set(vals)];
      console.log(`    ${lcdRegName(reg)} (reg ${hex(reg, 2)}): ${vals.length} writes, unique values: [${unique.map(v => hex(v, 2)).join(', ')}]`);
    }
  }
  if (lcdReads.length > 0) {
    console.log('  LCD MMIO reads by register:');
    for (const [reg, vals] of lcdReadsByReg) {
      const unique = [...new Set(vals)];
      console.log(`    ${lcdRegName(reg)} (reg ${hex(reg, 2)}): ${vals.length} reads, unique values: [${unique.map(v => hex(v, 2)).join(', ')}]`);
    }
  }
  if (ioWrites.length > 0) {
    console.log('  I/O port writes:');
    for (const [port, vals] of ioWritesByPort) {
      const unique = [...new Set(vals)];
      console.log(`    port ${hex(port, 4)}: ${vals.length} writes, unique values: [${unique.map(v => hex(v, 2)).join(', ')}]`);
    }
  }
  if (ioReads.length > 0) {
    console.log('  I/O port reads:');
    for (const [port, vals] of ioReadsByPort) {
      const unique = [...new Set(vals)];
      console.log(`    port ${hex(port, 4)}: ${vals.length} reads, unique values: [${unique.map(v => hex(v, 2)).join(', ')}]`);
    }
  }

  // Check specific registers of interest
  const upbaseWrites = lcdWritesByReg.get(0x10) || [];
  const upbaseMidWrites = lcdWritesByReg.get(0x11) || [];
  const upbaseHiWrites = lcdWritesByReg.get(0x12) || [];
  const controlWrites = lcdWritesByReg.get(0x18) || [];

  console.log(`\n  LCDUPBASE write activity: lo=${upbaseWrites.length}, mid=${upbaseMidWrites.length}, hi=${upbaseHiWrites.length}`);
  console.log(`  LCDControl write activity: ${controlWrites.length}`);
  console.log('');

  report.push('## Part B: LCD Peripheral Trace During 0x06EDAC');
  report.push('');
  report.push('### Execution Summary');
  report.push('');
  report.push('| Field | Value |');
  report.push('| --- | --- |');
  report.push(`| Entry | \`${hex(TARGET_BLIT)}\` |`);
  report.push(`| Steps | ${resultB.steps} |`);
  report.push(`| Termination | ${resultB.termination} |`);
  report.push(`| Last PC | \`${hex(resultB.lastPc)}\` |`);
  report.push(`| VRAM bytes written | ${vramWriteCount} |`);
  report.push(`| LCD MMIO writes | ${lcdWrites.length} |`);
  report.push(`| LCD MMIO reads | ${lcdReads.length} |`);
  report.push(`| I/O port writes | ${ioWrites.length} |`);
  report.push(`| I/O port reads | ${ioReads.length} |`);
  report.push('');

  if (lcdWrites.length > 0 || lcdReads.length > 0) {
    report.push('### LCD MMIO Activity');
    report.push('');

    if (lcdWrites.length > 0) {
      report.push('#### Writes by Register');
      report.push('');
      report.push('| Register | Name | Count | Unique Values |');
      report.push('| --- | --- | --- | --- |');
      for (const [reg, vals] of lcdWritesByReg) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(reg, 2)} | ${lcdRegName(reg)} | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      report.push('');
    }

    if (lcdReads.length > 0) {
      report.push('#### Reads by Register');
      report.push('');
      report.push('| Register | Name | Count | Unique Values |');
      report.push('| --- | --- | --- | --- |');
      for (const [reg, vals] of lcdReadsByReg) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(reg, 2)} | ${lcdRegName(reg)} | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      report.push('');
    }
  } else {
    report.push('### LCD MMIO Activity');
    report.push('');
    report.push('**No LCD MMIO reads or writes detected during 0x06EDAC execution.**');
    report.push('');
  }

  if (ioWrites.length > 0 || ioReads.length > 0) {
    report.push('### I/O Port Activity');
    report.push('');
    if (ioWrites.length > 0) {
      report.push('#### Writes by Port');
      report.push('');
      report.push('| Port | Count | Unique Values |');
      report.push('| --- | --- | --- |');
      for (const [port, vals] of ioWritesByPort) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(port, 4)} | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      report.push('');
    }
    if (ioReads.length > 0) {
      report.push('#### Reads by Port');
      report.push('');
      report.push('| Port | Count | Unique Values |');
      report.push('| --- | --- | --- |');
      for (const [port, vals] of ioReadsByPort) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(port, 4)} | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      report.push('');
    }
  } else {
    report.push('### I/O Port Activity');
    report.push('');
    report.push('**No I/O port reads or writes detected during 0x06EDAC execution.**');
    report.push('');
  }

  report.push('### Key Register Analysis');
  report.push('');
  report.push(`- **LCDUPBASE (0xE00010-12)**: ${upbaseWrites.length + upbaseMidWrites.length + upbaseHiWrites.length} total byte writes`);
  if (upbaseWrites.length > 0) report.push(`  - Lo byte values: [${[...new Set(upbaseWrites)].map(v => hex(v, 2)).join(', ')}]`);
  if (upbaseMidWrites.length > 0) report.push(`  - Mid byte values: [${[...new Set(upbaseMidWrites)].map(v => hex(v, 2)).join(', ')}]`);
  if (upbaseHiWrites.length > 0) report.push(`  - Hi byte values: [${[...new Set(upbaseHiWrites)].map(v => hex(v, 2)).join(', ')}]`);
  report.push(`- **LCDControl (0xE00018)**: ${controlWrites.length} writes`);
  if (controlWrites.length > 0) report.push(`  - Values: [${[...new Set(controlWrites)].map(v => hex(v, 2)).join(', ')}]`);
  report.push('');

  // --- Part C: Static disassembly of 0x06FCD0 ---
  console.log('--- Part C: Static disassembly of 0x06FCD0 (100 bytes) ---');
  const disasmC = disassembleRegion(env.romBytes, TARGET_POST, 100, 'adl');
  for (const line of disasmC) console.log(`  ${line}`);
  console.log('');

  report.push('## Part C: Static Disassembly of 0x06FCD0 (~100 bytes)');
  report.push('');
  report.push('```');
  for (const line of disasmC) report.push(line);
  report.push('```');
  report.push('');

  // --- Part D: Dynamic trace of 0x06FCD0 ---
  console.log('--- Part D: Dynamic trace of 0x06FCD0 ---');
  resetToPostBoot(env);
  env.mem.fill(0xaa, VRAM_BASE, VRAM_END); // sentinel

  const lcdTracker2 = installLcdMmioTracker(env.cpu);
  const ioTracker2 = installIoTracker(env.cpu);
  const vramHook2 = installVramWriteHook(env.cpu);

  // Track blocks visited
  const blocksVisited = [];

  let resultD;
  try {
    resultD = env.executor.runFrom(TARGET_POST, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onBlock: (pc, mode, meta, steps) => {
        if (blocksVisited.length < 100) {
          blocksVisited.push({ pc, mode, steps });
        }
      },
    });
  } finally {
    lcdTracker2.restore();
    ioTracker2.restore();
    vramHook2.restore();
  }

  const lcdWrites2 = lcdTracker2.getLcdWrites();
  const lcdReads2 = lcdTracker2.getLcdReads();
  const ioWrites2 = ioTracker2.getIoWrites();
  const ioReads2 = ioTracker2.getIoReads();
  const vramWriteCount2 = vramHook2.getWriteCount();

  console.log(`  Steps: ${resultD.steps}`);
  console.log(`  Termination: ${resultD.termination}`);
  console.log(`  Last PC: ${hex(resultD.lastPc)}`);
  console.log(`  VRAM bytes written: ${vramWriteCount2}`);
  console.log(`  LCD MMIO writes: ${lcdWrites2.length}`);
  console.log(`  LCD MMIO reads: ${lcdReads2.length}`);
  console.log(`  I/O port writes: ${ioWrites2.length}`);
  console.log(`  I/O port reads: ${ioReads2.length}`);
  console.log(`  Blocks visited: ${blocksVisited.length}`);
  console.log(`  Missing blocks: ${[...(resultD.missingBlocks ?? [])].join(', ') || 'none'}`);
  console.log(`  Loops forced: ${resultD.loopsForced ?? 0}`);

  // Show first 30 blocks visited
  if (blocksVisited.length > 0) {
    console.log('  First blocks visited:');
    for (const b of blocksVisited.slice(0, 30)) {
      console.log(`    step=${b.steps} pc=${hex(b.pc)} mode=${b.mode}`);
    }
  }
  console.log('');

  // Deduplicate LCD/IO for Part D
  const lcdWritesByReg2 = new Map();
  for (const w of lcdWrites2) {
    if (!lcdWritesByReg2.has(w.reg)) lcdWritesByReg2.set(w.reg, []);
    lcdWritesByReg2.get(w.reg).push(w.value);
  }
  const ioWritesByPort2 = new Map();
  for (const w of ioWrites2) {
    if (!ioWritesByPort2.has(w.port)) ioWritesByPort2.set(w.port, []);
    ioWritesByPort2.get(w.port).push(w.value);
  }
  const ioReadsByPort2 = new Map();
  for (const r of ioReads2) {
    if (!ioReadsByPort2.has(r.port)) ioReadsByPort2.set(r.port, []);
    ioReadsByPort2.get(r.port).push(r.value);
  }

  report.push('## Part D: Dynamic Trace of 0x06FCD0');
  report.push('');
  report.push('### Execution Summary');
  report.push('');
  report.push('| Field | Value |');
  report.push('| --- | --- |');
  report.push(`| Entry | \`${hex(TARGET_POST)}\` |`);
  report.push(`| Steps | ${resultD.steps} |`);
  report.push(`| Termination | ${resultD.termination} |`);
  report.push(`| Last PC | \`${hex(resultD.lastPc)}\` |`);
  report.push(`| VRAM bytes written | ${vramWriteCount2} |`);
  report.push(`| LCD MMIO writes | ${lcdWrites2.length} |`);
  report.push(`| LCD MMIO reads | ${lcdReads2.length} |`);
  report.push(`| I/O port writes | ${ioWrites2.length} |`);
  report.push(`| I/O port reads | ${ioReads2.length} |`);
  report.push(`| Blocks visited | ${blocksVisited.length} |`);
  report.push(`| Missing blocks | ${[...(resultD.missingBlocks ?? [])].join(', ') || 'none'} |`);
  report.push(`| Loops forced | ${resultD.loopsForced ?? 0} |`);
  report.push('');

  if (blocksVisited.length > 0) {
    report.push('### Block Execution Trace (first 30)');
    report.push('');
    report.push('| Step | PC | Mode |');
    report.push('| --- | --- | --- |');
    for (const b of blocksVisited.slice(0, 30)) {
      report.push(`| ${b.steps} | \`${hex(b.pc)}\` | ${b.mode} |`);
    }
    report.push('');
  }

  if (lcdWrites2.length > 0) {
    report.push('### LCD MMIO Writes');
    report.push('');
    report.push('| Register | Name | Count | Unique Values |');
    report.push('| --- | --- | --- | --- |');
    for (const [reg, vals] of lcdWritesByReg2) {
      const unique = [...new Set(vals)];
      report.push(`| ${hex(reg, 2)} | ${lcdRegName(reg)} | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
    }
    report.push('');
  }

  if (ioWrites2.length > 0 || ioReads2.length > 0) {
    report.push('### I/O Port Activity');
    report.push('');
    if (ioWrites2.length > 0) {
      report.push('| Port | Direction | Count | Unique Values |');
      report.push('| --- | --- | --- | --- |');
      for (const [port, vals] of ioWritesByPort2) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(port, 4)} | write | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      for (const [port, vals] of ioReadsByPort2) {
        const unique = [...new Set(vals)];
        report.push(`| ${hex(port, 4)} | read | ${vals.length} | ${unique.map(v => hex(v, 2)).join(', ')} |`);
      }
      report.push('');
    }
  }

  // --- Verdict ---
  report.push('## Verdict');
  report.push('');
  report.push('### 0x06EDAC (VRAM Blit)');
  report.push('');
  if (vramWriteCount > 0) {
    report.push(`- Writes ${vramWriteCount} bytes to VRAM (${(vramWriteCount / VRAM_BYTE_SIZE * 100).toFixed(1)}% of full screen)`);
  }
  if (lcdWrites.length > 0) {
    report.push(`- Touches ${lcdWritesByReg.size} LCD control registers during execution`);
  } else {
    report.push('- Does NOT touch any LCD control registers (pure VRAM writer)');
  }
  if (ioWrites.length > 0) {
    report.push(`- Performs ${ioWrites.length} I/O port writes`);
  } else {
    report.push('- Performs NO I/O port writes');
  }
  report.push('');

  report.push('### 0x06FCD0 (Post-Blit)');
  report.push('');
  if (vramWriteCount2 > 0) {
    report.push(`- Writes ${vramWriteCount2} bytes to VRAM`);
  } else {
    report.push('- Does NOT write to VRAM');
  }
  if (lcdWrites2.length > 0) {
    report.push(`- Touches ${lcdWritesByReg2.size} LCD control registers`);
  } else {
    report.push('- Does NOT touch LCD control registers');
  }
  if (ioWrites2.length > 0) {
    report.push(`- Performs ${ioWrites2.length} I/O port writes`);
  }
  report.push('');

  // Write report
  const reportText = report.join('\n');
  fs.writeFileSync(REPORT_PATH, reportText, 'utf8');
  console.log(`Report written to ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  const msg = error.stack || String(error);
  console.error(msg);
  const failReport = [
    '# Phase 131 - 0x06EDAC VRAM Blit Mechanism Analysis',
    '',
    'Generated by `probe-phase131-blit-analysis.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    msg,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, failReport, 'utf8');
  process.exitCode = 1;
}
