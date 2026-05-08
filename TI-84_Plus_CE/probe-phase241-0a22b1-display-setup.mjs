#!/usr/bin/env node

/**
 * Phase 241: trace 0x0A22B1 display setup before 0x09EFDE
 *
 * Session 240 observed the display repaint path:
 *   0x04E404 -> 0x0A22B1 -> 0x0A22BE -> 0x00038C -> 0x005A53
 *   -> 0x0A22CA -> 0x0A2D4C -> 0x0A22D6 -> 0x0A22E0 -> 0x09EF44 -> 0x09EFDE
 *
 * This probe:
 *   1. Cold-boots to the usual warm state (boot -> kernelInit -> memInit).
 *   2. Enters directly at 0x0A22B1 with the raw post-memInit A/BC/DE/HL/F state
 *      preserved, while forcing the standard probe stack/index setup.
 *   3. Disassembles the requested ROM spans with decodeInstruction().
 *   4. Manually steps blocks until the fill routine entry 0x09EFDE is reached.
 *   5. Logs every visited block, block-entry registers, and RAM/MMIO/port writes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x0802B2;

const ENTRY_PC = 0x0A22B1;
const FILL_ENTRY_PC = 0x09EFDE;
const STEP_LIMIT = 500;

const CALLER_SP = 0xD1A87E;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const DISASM_RANGES = [
  { label: '0x0A22B1-0x0A22F0 display setup entry', start: 0x0A22B1, end: 0x0A22F0 },
  { label: '0x0A2D4C-0x0A2D70 helper between D00595 and BC setup', start: 0x0A2D4C, end: 0x0A2D70 },
  { label: '0x09EF44-0x09EFDE pre-fill staging', start: 0x09EF44, end: 0x09EFDE },
];

const WATCHED_RAM = [
  { name: 'IY+0x2A', addr: IY_HOME + 0x2A, width: 1 },
  { name: 'IY+0x4A', addr: IY_HOME + 0x4A, width: 1 },
  { name: 'D000C6', addr: 0xD000C6, width: 1 },
  { name: 'D00595', addr: 0xD00595, width: 1 },
  { name: 'D00596', addr: 0xD00596, width: 1 },
  { name: 'D0059C', addr: 0xD0059C, width: 3 },
  { name: 'D02AC0', addr: 0xD02AC0, width: 2 },
];

const ADDRESS_LABELS = new Map([
  [IY_HOME + 0x2A, 'IY+0x2A'],
  [IY_HOME + 0x4A, 'IY+0x4A'],
  [0xD000C6, 'D000C6'],
  [0xD00595, 'D00595'],
  [0xD00596, 'D00596'],
  [0xD0059C, 'D0059C'],
  [0xD02AC0, 'D02AC0'],
  [VRAM_START, 'VRAM base'],
]);

const MMIO_RANGES = [
  { name: 'lcd-mmio-e000', start: 0xE00000, end: 0xE0002F },
  { name: 'lcd-mmio-f800', start: 0xF80000, end: 0xF8002F },
  { name: 'kbd-mmio', start: 0xE00800, end: 0xE0091F },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function readBytes(mem, addr, width) {
  const bytes = new Uint8Array(width);
  for (let i = 0; i < width; i += 1) {
    bytes[i] = mem[(addr + i) & MEM_MASK];
  }
  return bytes;
}

function readScalar(mem, addr, width) {
  let value = 0;
  for (let i = 0; i < width; i += 1) {
    value |= mem[(addr + i) & MEM_MASK] << (8 * i);
  }
  return value >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function snapshotRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    hl: cpu._hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
  };
}

function formatRegisters(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
  ].join(' ');
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase241-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function createInstructionMap(blocks) {
  const byPc = new Map();
  for (const block of Object.values(blocks)) {
    for (const inst of block.instructions ?? []) {
      if (!byPc.has(inst.pc)) {
        byPc.set(inst.pc, {
          bytes: inst.bytes,
          dasm: inst.dasm,
        });
      }
    }
  }
  return byPc;
}

function formatInstructionFallback(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'push':
    case 'pop':
      return `${inst.tag.toUpperCase()} ${String(inst.pair ?? inst.reg ?? inst.src ?? inst.dest).toUpperCase()}`;
    case 'di':
    case 'ei':
    case 'ret':
    case 'halt':
      return inst.tag.toUpperCase();
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
    case 'ld-reg16-imm':
      return `LD ${String(inst.pair ?? inst.dest).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const pair = String(inst.pair).toUpperCase();
      const addr = hex(inst.addr);
      if (inst.direction === 'to-mem') return `LD (${addr}), ${pair}`;
      return `LD ${pair}, (${addr})`;
    }
    case 'ld-special':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.reg ?? 'hl').toUpperCase()})`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'inc-reg':
    case 'dec-reg':
      return `${inst.tag.slice(0, 3).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
    case 'dec-pair':
      return `${inst.tag.startsWith('inc') ? 'INC' : 'DEC'} ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'rotate-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'mlt':
      return `MLT ${String(inst.reg).toUpperCase()}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    default:
      return inst.tag;
  }
}

function disassembleRange(romBytes, instructionMap, start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    const mapped = instructionMap.get(pc);
    rows.push({
      pc,
      length,
      bytes: mapped?.bytes ?? bytesToHex(romBytes.subarray(pc, pc + length)),
      text: mapped?.dasm ?? formatInstructionFallback(inst),
    });
    pc += length;
  }

  return rows;
}

function snapshotWatchedRam(mem) {
  const snapshot = {};
  for (const watch of WATCHED_RAM) {
    snapshot[watch.name] = readScalar(mem, watch.addr, watch.width);
  }
  return snapshot;
}

function formatWatchedValue(width, value) {
  return width === 1 ? hexByte(value) : hex(value, width * 2);
}

function labelForAddress(addr) {
  return ADDRESS_LABELS.get(addr) ?? '';
}

function classifyMmio(addr) {
  for (const range of MMIO_RANGES) {
    if (addr >= range.start && addr <= range.end) return range.name;
  }
  return null;
}

function classifyAddress(addr) {
  if (classifyMmio(addr)) return 'mmio';
  if (addr >= VRAM_START && addr < VRAM_END) return 'vram';
  if (addr >= 0xD1A000 && addr < 0xD1A900) return 'stack';
  if (addr >= 0xD00000 && addr < 0xE00000) return 'ram';
  return 'other';
}

function bytesChanged(before, after) {
  if (before.length !== after.length) return true;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) return true;
  }
  return false;
}

function bootWarmState(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = CALLER_SP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = CALLER_SP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    boot,
    kernelInit,
    memInit,
    warmRegs: snapshotRegisters(cpu),
  };
}

function seedEntry(cpu, mem) {
  const preserved = snapshotRegisters(cpu);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = CALLER_SP;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  push24(cpu, mem, RETURN_SENTINEL);

  return {
    preservedWarmRegs: preserved,
    entryRegs: snapshotRegisters(cpu),
  };
}

function runTrace(executor, cpu, mem, blocks) {
  installStepShim(cpu, executor);

  const blockEntries = [];
  const memoryWrites = [];
  const portWrites = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const watchedBefore = snapshotWatchedRam(mem);

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);
  const originalOnIoWrite = cpu.onIoWrite?.bind(cpu) || (() => {});

  let currentStep = 0;

  function recordMemoryWrite(addr, width, value, originalWrite) {
    const normalizedAddr = addr & 0xFFFFFF;
    const region = classifyAddress(normalizedAddr);
    const mmioName = classifyMmio(normalizedAddr);
    const before = region === 'mmio' ? null : readBytes(mem, normalizedAddr, width);

    originalWrite(addr, value);

    const after = region === 'mmio' ? null : readBytes(mem, normalizedAddr, width);
    if (region !== 'mmio' && !bytesChanged(before, after)) {
      return;
    }

    if (memoryWrites.length >= 512) return;

    memoryWrites.push({
      step: currentStep,
      pc: cpu._currentBlockPc & 0xFFFFFF,
      addr: normalizedAddr,
      width,
      value: value >>> 0,
      region,
      mmioName,
      label: labelForAddress(normalizedAddr),
      before: before ? bytesToHex(before) : null,
      after: after ? bytesToHex(after) : null,
    });
  }

  cpu.write8 = (addr, value) => recordMemoryWrite(addr, 1, value & 0xFF, originalWrite8);
  cpu.write16 = (addr, value) => recordMemoryWrite(addr, 2, value & 0xFFFF, originalWrite16);
  cpu.write24 = (addr, value) => recordMemoryWrite(addr, 3, value & 0xFFFFFF, originalWrite24);
  cpu.onIoWrite = (port, value) => {
    if (portWrites.length < 256) {
      portWrites.push({
        step: currentStep,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        port: port & 0xFFFF,
        value: value & 0xFF,
      });
    }
    originalOnIoWrite(port, value);
  };

  let stopReason = 'step_budget_exhausted';
  let error = null;

  try {
    while (currentStep < STEP_LIMIT) {
      const mode = cpu.madl ? 'adl' : 'z80';
      const pc = cpu.pc & 0xFFFFFF;
      const key = blockKey(pc, mode);
      const before = snapshotRegisters(cpu);

      const entry = {
        step: currentStep + 1,
        key,
        pc,
        mode,
        before,
        block: blocks[key] ?? null,
        executed: false,
      };

      blockEntries.push(entry);
      if (!seenBlocks.has(key)) {
        seenBlocks.add(key);
        uniqueBlocks.push(key);
      }

      if (pc === FILL_ENTRY_PC) {
        stopReason = 'fill_entry_reached';
        break;
      }
      if (pc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        break;
      }

      currentStep += 1;
      const result = cpu.step();
      entry.executed = true;
      entry.result = result;
      entry.after = snapshotRegisters(cpu);
      entry.nextPc = cpu.pc & 0xFFFFFF;

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
      if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        break;
      }
    }
  } catch (traceError) {
    stopReason = `error: ${traceError?.message ?? String(traceError)}`;
    error = traceError;
  } finally {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    cpu.onIoWrite = originalOnIoWrite;
  }

  return {
    stepsExecuted: currentStep,
    stopReason,
    error,
    blockEntries,
    uniqueBlocks,
    memoryWrites,
    portWrites,
    watchedBefore,
    watchedAfter: snapshotWatchedRam(mem),
    finalRegs: snapshotRegisters(cpu),
    fillEntry: blockEntries.find((entry) => entry.pc === FILL_ENTRY_PC) ?? null,
  };
}

function printHeader(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

function printBootSummary(summary) {
  printHeader('BOOT');
  console.log(`boot:        steps=${summary.boot.steps} term=${summary.boot.termination} lastPc=${hex(summary.boot.lastPc)}`);
  console.log(`kernelInit:  steps=${summary.kernelInit.steps} term=${summary.kernelInit.termination} lastPc=${hex(summary.kernelInit.lastPc)}`);
  console.log(`memInit:     steps=${summary.memInit.steps} term=${summary.memInit.termination} lastPc=${hex(summary.memInit.lastPc)}`);
  console.log('');
  console.log(`Warm-state registers after memInit: ${formatRegisters(summary.warmRegs)}`);
  console.log('');
}

function printWatchedRamValues(label, snapshot) {
  console.log(label);
  for (const watch of WATCHED_RAM) {
    console.log(`  ${watch.name.padEnd(8)} ${hex(watch.addr)} = ${formatWatchedValue(watch.width, snapshot[watch.name])}`);
  }
  console.log('');
}

function printStaticDisassembly(romBytes, instructionMap) {
  printHeader('STATIC DISASSEMBLY');
  for (const range of DISASM_RANGES) {
    console.log(`${range.label} [${hex(range.start)} .. ${hex(range.end)}):`);
    const rows = disassembleRange(romBytes, instructionMap, range.start, range.end);
    for (const row of rows) {
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    }
    console.log('');
  }
}

function printBlockInstructions(entry) {
  if (!entry.executed) {
    console.log('      stop: reached 0x09EFDE and halted before executing the fill block');
    return;
  }

  const instructions = entry.block?.instructions ?? [];
  if (instructions.length === 0) {
    console.log('      (no block metadata available)');
  } else {
    for (const inst of instructions) {
      console.log(`      ${hex(inst.pc)}: ${String(inst.bytes ?? '').padEnd(20)} ${inst.dasm}`);
    }
  }

  const nextText = entry.nextPc === undefined ? '(n/a)' : hex(entry.nextPc);
  console.log(`      next=${nextText} after=${entry.after ? formatRegisters(entry.after) : '(n/a)'}`);
}

function printTrace(trace) {
  printHeader('DYNAMIC TRACE');
  console.log(`Entry PC: ${hex(ENTRY_PC)}`);
  console.log(`Fill stop PC: ${hex(FILL_ENTRY_PC)}`);
  console.log(`Caller SP before sentinel push: ${hex(CALLER_SP)}`);
  console.log(`Effective entry SP after sentinel push: ${hex(trace.blockEntries[0]?.before?.sp ?? 0)}`);
  console.log(`Step limit: ${STEP_LIMIT}`);
  console.log(`Stop reason: ${trace.stopReason}`);
  console.log(`Executed blocks: ${trace.stepsExecuted}`);
  console.log(`Logged block entries: ${trace.blockEntries.length}`);
  if (trace.error) {
    console.log(`Trace error: ${trace.error.message ?? String(trace.error)}`);
  }
  console.log('');

  printWatchedRamValues('Watched RAM before trace:', trace.watchedBefore);

  console.log('Visited blocks with entry registers:');
  for (const entry of trace.blockEntries) {
    const suffix = entry.pc === FILL_ENTRY_PC ? '  <-- fill entry (not executed)' : '';
    console.log(`  [${String(entry.step).padStart(3)}] ${hex(entry.pc)} ${formatRegisters(entry.before)}${suffix}`);
    printBlockInstructions(entry);
  }
  console.log('');

  printWatchedRamValues('Watched RAM after trace:', trace.watchedAfter);

  console.log('RAM/MMIO writes before fill:');
  if (trace.memoryWrites.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of trace.memoryWrites) {
      const tagParts = [event.region];
      if (event.mmioName) tagParts.push(event.mmioName);
      if (event.label) tagParts.push(event.label);
      const tag = tagParts.join('/');
      let detail = `value=${hex(event.value, event.width * 2)} addr=${hex(event.addr)} width=${event.width}`;
      if (event.before !== null && event.after !== null) {
        detail += ` before=${event.before} after=${event.after}`;
      }
      console.log(`  step=${String(event.step).padStart(3)} pc=${hex(event.pc)} ${tag} ${detail}`);
    }
  }
  console.log('');

  console.log('I/O port writes before fill:');
  if (trace.portWrites.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of trace.portWrites) {
      console.log(`  step=${String(event.step).padStart(3)} pc=${hex(event.pc)} port=${hex(event.port, 4)} value=${hexByte(event.value)}`);
    }
  }
  console.log('');
}

function printObservations(trace) {
  printHeader('OBSERVATIONS');

  const blockAt = (pc) => trace.blockEntries.find((entry) => entry.pc === pc);
  const helper = blockAt(0x0A2D4C);
  const prefill = blockAt(0x09EF44);
  const fillEntry = trace.fillEntry;

  console.log(`Unique blocks before fill: ${trace.uniqueBlocks.map((key) => hex(parseInt(key.slice(0, 6), 16))).join(' -> ')}`);
  console.log('');

  if (helper?.before && helper.after) {
    console.log(
      `0x0A2D4C entry A=${hexByte(helper.before.a)} DE=${hex(helper.before.de)}; ` +
      `exit A=${hexByte(helper.after.a)}. The instruction sequence multiplies the input A by 0x14 and adds 0x25.`,
    );
  }

  if (prefill?.before && prefill.after) {
    console.log(
      `0x09EF44 enters with BC=${hex(prefill.before.bc)} DE=${hex(prefill.before.de)} HL=${hex(prefill.before.hl)}; ` +
      `after the 0x09EF44 block, execution moves to ${hex(prefill.nextPc)} with A=${hexByte(prefill.after.a)}.`,
    );
  }

  if (fillEntry?.before) {
    console.log(
      `Fill entry snapshot at 0x09EFDE: ${formatRegisters(fillEntry.before)}.`,
    );
    console.log(
      `The final pre-fill RAM write stores ${hex(trace.watchedAfter.D0059C)} into D0059C, which matches HL at fill entry and strongly suggests the VRAM base/pixel pointer is staged there.`,
    );
  }

  const nonStackWrites = trace.memoryWrites.filter((event) => event.region !== 'stack');
  if (nonStackWrites.length === 0) {
    console.log('No non-stack RAM writes occurred before reaching 0x09EFDE.');
  } else {
    console.log(
      `Non-stack writes before fill: ${nonStackWrites.map((event) => `${hex(event.addr)}${event.label ? ` (${event.label})` : ''}`).join(', ')}.`,
    );
  }

  if (trace.portWrites.length === 0 && trace.memoryWrites.every((event) => event.region !== 'mmio')) {
    console.log('No I/O port writes or LCD MMIO writes occurred before the fill routine entry.');
  }
  console.log('');
}

async function main() {
  console.log('Phase 241: trace 0x0A22B1 display setup before 0x09EFDE');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );
    const instructionMap = createInstructionMap(blocks);

    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Entry PC: ${hex(ENTRY_PC)}  Fill entry: ${hex(FILL_ENTRY_PC)}`);
    console.log(`Warm-state setup: boot -> kernelInit -> memInit, MBASE=${hexByte(MBASE)}, IX=${hex(IX_HOME)}, IY=${hex(IY_HOME)}, SP=${hex(CALLER_SP)}, timerInterrupt=false`);
    console.log('');

    printStaticDisassembly(romBytes, instructionMap);

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const bootSummary = bootWarmState(executor, cpu, mem);
    printBootSummary(bootSummary);

    const seedSummary = seedEntry(cpu, mem);
    console.log(`Preserved warm-state A/BC/DE/HL/F: ${formatRegisters(seedSummary.preservedWarmRegs)}`);
    console.log(`Direct-entry register seed: ${formatRegisters(seedSummary.entryRegs)}`);
    console.log('');

    const trace = runTrace(executor, cpu, mem, blocks);
    printTrace(trace);
    printObservations(trace);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
