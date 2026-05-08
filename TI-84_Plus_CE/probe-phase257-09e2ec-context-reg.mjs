#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const TARGET_ENTRY = 0x09E2EC;
const DISASM_BYTES = 0x64;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;

const MEM_INIT_RET = 0x7FFFF6;
const FAKE_RET = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITER = 32;
const KERNEL_MAX_STEPS = 100000;
const KERNEL_MAX_LOOP_ITER = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITER = 32;
const MEM_INIT_MAX_STEPS = 2000;
const TRACE_MAX_STEPS = 2000;
const TRACE_MAX_LOOP_ITER = 8192;

const WATCH_START = 0xD007CA;
const WATCH_END = 0xD007E0;
const D00824_ADDR = 0xD00824;

const FINAL_24_ADDRS = [0xD007CA, 0xD007CE, 0xD007D2, 0xD007D6, 0xD007DA, 0xD007DE];
const FINAL_16_ADDRS = [0xD007E0];
const FINAL_8_ADDRS = [0xD00824];

const STATIC_WATCH_ADDRS = new Set([
  0xD007CA, 0xD007CE, 0xD007D2, 0xD007D6, 0xD007DA, 0xD007DE, 0xD007E0, 0xD00824,
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', '_currentBlockPc',
];

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, addr, length) {
  const start = Math.max(0, addr);
  const end = Math.min(buffer.length, start + Math.max(0, length));
  return Array.from(buffer.subarray(start, end), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read16(buffer, addr) {
  return (((buffer[addr] ?? 0) & 0xFF) | (((buffer[addr + 1] ?? 0) & 0xFF) << 8)) >>> 0;
}

function read24(buffer, addr) {
  return (
    (((buffer[addr] ?? 0) & 0xFF)) |
    ((((buffer[addr + 1] ?? 0) & 0xFF)) << 8) |
    ((((buffer[addr + 2] ?? 0) & 0xFF)) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr & 0xFFFFFF;
  buffer[base] = value & 0xFF;
  buffer[(base + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  buffer[(base + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase257-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const moduleAssets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(moduleAssets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, moduleAssets };
  } catch (error) {
    cleanupTranspiledModule(moduleAssets);
    throw error;
  }
}

function createRuntime(blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { memory, peripherals, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, memory) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITER,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_MAX_STEPS,
    maxLoopIterations: KERNEL_MAX_LOOP_ITER,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITER,
  });

  return { boot, kernelInit, postInit };
}

function prepareCallState(cpu, memory) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  memory.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function resolveNextMode(meta, returnedPc, currentMode) {
  if (!meta?.exits) {
    return currentMode;
  }
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function parseCallTarget(dasm) {
  const match = /^call(?: [a-z]+,)? 0x([0-9a-f]+)$/i.exec(String(dasm ?? '').trim());
  if (!match) {
    return null;
  }
  return parseInt(match[1], 16) & 0xFFFFFF;
}

function runLiftedTrace(executor, cpu, { entry, mode = 'adl', maxSteps, maxLoopIterations, stopPc = null, watcher = null }) {
  let pc = entry & 0xFFFFFF;
  let currentMode = mode;
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let error = null;
  const missingBlocks = [];
  const callTargets = [];
  const seenCallTargets = new Set();
  const visitedBlocks = [];

  while (steps < maxSteps) {
    cpu.madl = currentMode === 'adl' ? 1 : 0;
    const key = `${pc.toString(16).padStart(6, '0')}:${currentMode}`;
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode: currentMode });
      break;
    }

    cpu._currentBlockPc = pc;
    cpu.pc = pc;
    watcher?.setContext({ step: steps + 1, pc, mode: currentMode });

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    visitedBlocks.push({ step: steps + 1, pc, mode: currentMode });

    const normalizedResult = typeof result === 'number' ? (result & 0xFFFFFF) : null;
    for (const instruction of meta?.instructions ?? []) {
      const target = parseCallTarget(instruction?.dasm);
      if (target === null) {
        continue;
      }
      if (normalizedResult === target && !seenCallTargets.has(target)) {
        seenCallTargets.add(target);
        callTargets.push({
          step: steps + 1,
          fromPc: pc,
          target,
          dasm: instruction.dasm,
        });
      }
    }

    steps += 1;
    lastPc = pc;

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      break;
    }

    const nextPc = result & 0xFFFFFF;
    if (stopPc !== null && nextPc === (stopPc & 0xFFFFFF)) {
      termination = 'stop_pc';
      lastPc = nextPc;
      break;
    }

    currentMode = resolveNextMode(meta, result, currentMode);
    pc = nextPc;
    lastPc = pc;
  }

  return {
    steps,
    termination,
    lastPc,
    lastMode: currentMode,
    error,
    missingBlocks,
    callTargets,
    visitedBlocks,
  };
}

function installWriteWatcher(cpu, memory) {
  const allWrites = [];
  const cxWrites = [];
  const d00824Writes = [];
  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function watchedBytes(startAddr, width, value) {
    const matches = [];
    for (let offset = 0; offset < width; offset += 1) {
      const addr = (startAddr + offset) & 0xFFFFFF;
      if (!((addr >= WATCH_START && addr <= WATCH_END) || addr === D00824_ADDR)) {
        continue;
      }
      matches.push({
        addr,
        oldValue: memory[addr] & 0xFF,
        newValue: (value >>> (offset * 8)) & 0xFF,
      });
    }
    return matches;
  }

  function record(kind, startAddr, width, value) {
    const bytes = watchedBytes(startAddr, width, value >>> 0);
    if (!bytes.length) {
      return;
    }

    const entry = {
      step: currentStep,
      pc: currentPc,
      mode: currentMode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      bytes,
    };

    allWrites.push(entry);
    if (bytes.some((item) => item.addr >= WATCH_START && item.addr <= WATCH_END)) {
      cxWrites.push(entry);
    }
    if (bytes.some((item) => item.addr === D00824_ADDR)) {
      d00824Writes.push(entry);
    }
  }

  cpu.write8 = (addr, value) => {
    record('write8', addr, 1, value & 0xFF);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record('write16', addr, 2, value & 0xFFFF);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record('write24', addr, 3, value & 0xFFFFFF);
    return originalWrite24(addr, value);
  };

  return {
    allWrites,
    cxWrites,
    d00824Writes,
    setContext({ step, pc, mode }) {
      currentStep = step;
      currentPc = pc & 0xFFFFFF;
      currentMode = mode;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function summarizeFinalState(memory) {
  const lines = [];
  for (const addr of FINAL_24_ADDRS) {
    lines.push(`${hex(addr)} bytes=[${bytesAt(memory, addr, 3)}] read24=${hex(read24(memory, addr))}`);
  }
  for (const addr of FINAL_16_ADDRS) {
    lines.push(`${hex(addr)} bytes=[${bytesAt(memory, addr, 2)}] read16=${hex(read16(memory, addr), 4)}`);
  }
  for (const addr of FINAL_8_ADDRS) {
    lines.push(`${hex(addr)} byte=${hexByte(memory[addr] & 0xFF)}`);
  }
  return lines;
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister ?? '').toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  if (inst.tag === 'decode-error') {
    return `DB ${hexByte(inst.byte)} ; ${inst.error}`;
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop':
      return `${prefix}NOP`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'halt':
      return `${prefix}HALT`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.vector, 2)}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.src ?? 'hl').toUpperCase()})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return `${prefix}LD SP, HL`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-rotate':
      return `${prefix}${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'cpi':
      return `${prefix}CPI`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpd':
      return `${prefix}CPD`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'rld':
      return `${prefix}RLD`;
    case 'rrd':
      return `${prefix}RRD`;
    case 'neg':
      return `${prefix}NEG`;
    case 'retn':
      return `${prefix}RETN`;
    case 'reti':
      return `${prefix}RETI`;
    case 'in-port':
      return `${prefix}IN A, (${hex(inst.port, 2)})`;
    case 'out-port':
      return `${prefix}OUT (${hex(inst.port, 2)}), A`;
    case 'ld-special':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-mb-a':
      return `${prefix}LD MB, A`;
    case 'ld-a-mb':
      return `${prefix}LD A, MB`;
    case 'ld-pair-ind':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-pair':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.pair).toUpperCase()}`;
    default: {
      const notable = [];
      for (const field of ['condition', 'target', 'pair', 'reg', 'dest', 'src', 'value', 'addr', 'address']) {
        if (inst[field] !== undefined) {
          notable.push(`${field}=${typeof inst[field] === 'number' ? hex(inst[field]) : inst[field]}`);
        }
      }
      const suffix = notable.length ? ` ${notable.join(' ')}` : '';
      return `${prefix}[${inst.tag}]${suffix}`;
    }
  }
}

function decodeSafe(buffer, pc, mode = 'adl') {
  try {
    return decodeInstruction(buffer, pc & 0xFFFFFF, mode);
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      byte: buffer[pc] ?? 0,
      error: error?.message ?? String(error),
    };
  }
}

function collectDisassembly(buffer, startAddr, byteCount, mode = 'adl') {
  const rows = [];
  let pc = startAddr;
  const end = Math.min(buffer.length, startAddr + byteCount);

  while (pc < end) {
    const inst = decodeSafe(buffer, pc, mode);
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      bytes: bytesAt(buffer, pc, length),
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function collectStaticWatchRefs(rows) {
  const refs = [];
  for (const row of rows) {
    const inst = row.inst;
    const addr = inst?.addr ?? inst?.address;
    if (typeof addr !== 'number') {
      continue;
    }
    const normalized = addr & 0xFFFFFF;
    if (!STATIC_WATCH_ADDRS.has(normalized)) {
      continue;
    }
    const kind = inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' ? 'write' : 'read';
    refs.push({
      pc: row.pc,
      addr: normalized,
      kind,
      text: row.text,
    });
  }
  return refs;
}

function printStaticDisassembly() {
  const rows = collectDisassembly(romBytes, TARGET_ENTRY, DISASM_BYTES, 'adl');
  const refs = collectStaticWatchRefs(rows);

  console.log('=== 1. Static Disassembly: 0x09E2EC (+0x64 bytes) ===');
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')}  ${row.text}`);
  }
  console.log('');
  console.log('Static direct references to watched addresses in this window:');
  if (!refs.length) {
    console.log('  (none in first 0x64 bytes)');
  } else {
    for (const ref of refs) {
      console.log(`  ${hex(ref.pc)} ${ref.kind.toUpperCase()} ${hex(ref.addr)}  ${ref.text}`);
    }
  }
  console.log('');
}

function printWrites(title, writes) {
  console.log(title);
  if (!writes.length) {
    console.log('  (none)');
    return;
  }
  for (const entry of writes) {
    const byteSummary = entry.bytes
      .map((item) => `${hex(item.addr)}:${hexByte(item.oldValue)}->${hexByte(item.newValue)}`)
      .join(', ');
    console.log(
      `  step=${String(entry.step).padStart(4, '0')} pc=${hex(entry.pc)} mode=${entry.mode.padEnd(3, ' ')} ` +
      `${entry.kind} start=${hex(entry.startAddr)}  ${byteSummary}`,
    );
  }
}

function printCallTargets(callTargets) {
  const shown = callTargets.slice(0, 20);
  if (!callTargets.length) {
    console.log('  (none)');
    return;
  }
  for (const [index, entry] of shown.entries()) {
    console.log(
      `  ${String(index + 1).padStart(2, '0')}. step=${String(entry.step).padStart(4, '0')} ` +
      `from=${hex(entry.fromPc)} target=${hex(entry.target)}  ${entry.dasm}`,
    );
  }
  if (callTargets.length > shown.length) {
    console.log(`  ... ${callTargets.length - shown.length} more unique call target(s)`);
  }
}

function printFinalState(memory) {
  for (const line of summarizeFinalState(memory)) {
    console.log(`  ${line}`);
  }
}

function runCase(blocks, label, aValue) {
  const runtime = createRuntime(blocks);
  const { memory, executor, cpu } = runtime;

  const bootSummary = coldBoot(executor, cpu, memory);
  const memInit = (() => {
    prepareCallState(cpu, memory);
    cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
    write24(memory, cpu.sp, MEM_INIT_RET);
    return runLiftedTrace(executor, cpu, {
      entry: MEM_INIT_ENTRY,
      mode: 'adl',
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITER,
      stopPc: MEM_INIT_RET,
    });
  })();

  const baselineCpu = snapshotCpu(cpu);

  prepareCallState(cpu, memory);
  cpu.a = aValue & 0xFF;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(memory, cpu.sp, FAKE_RET);

  const watcher = installWriteWatcher(cpu, memory);
  const trace = runLiftedTrace(executor, cpu, {
    entry: TARGET_ENTRY,
    mode: 'adl',
    maxSteps: TRACE_MAX_STEPS,
    maxLoopIterations: TRACE_MAX_LOOP_ITER,
    stopPc: FAKE_RET,
    watcher,
  });
  watcher.restore();

  console.log(`=== ${label} ===`);
  console.log(
    `boot: coldBoot steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}; ` +
    `kernelInit steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}; ` +
    `postInit steps=${bootSummary.postInit.steps} term=${bootSummary.postInit.termination} lastPc=${hex(bootSummary.postInit.lastPc)}`,
  );
  console.log(
    `memInit: steps=${memInit.steps} termination=${memInit.termination} lastPc=${hex(memInit.lastPc)} ` +
    `missing=${memInit.missingBlocks.length}`,
  );
  console.log(
    `trace: entry=${hex(TARGET_ENTRY)} A=${hexByte(aValue)} steps=${trace.steps} termination=${trace.termination} ` +
    `lastPc=${hex(trace.lastPc)} lastMode=${trace.lastMode}`,
  );
  if (trace.error) {
    console.log(`traceError: ${trace.error?.stack ?? String(trace.error)}`);
  }
  console.log('');
  printWrites('Writes to 0xD007CA-0xD007E0:', watcher.cxWrites);
  console.log('');
  printWrites('Writes to 0xD00824:', watcher.d00824Writes);
  console.log('');
  console.log(`CALL targets (first 20 unique, total=${trace.callTargets.length}):`);
  printCallTargets(trace.callTargets);
  console.log('');
  console.log('Final watched state:');
  printFinalState(memory);
  console.log('');
  console.log(`Final full watch range [0xD007CA..0xD007E0]: ${bytesAt(memory, WATCH_START, WATCH_END - WATCH_START + 1)}`);
  console.log('');

  restoreCpu(cpu, baselineCpu);
}

async function main() {
  console.log('Phase 257 probe: trace 0x09E2EC shared context-registration routine');
  console.log(`ROM bytes=${romBytes.length}`);
  console.log('');

  printStaticDisassembly();

  const { blocks, moduleAssets } = await loadBlocks();
  try {
    console.log(`transpiledSource=${moduleAssets.source}`);
    console.log(`blockCount=${Object.keys(blocks).length}`);
    console.log('');

    runCase(blocks, '2. Dynamic Trace With A=0x48 (handler[8] mode)', 0x48);
    runCase(blocks, '3. Dynamic Trace With A=0x00 (home-screen context)', 0x00);
    runCase(blocks, '4. Dynamic Trace With A=0x53 (handler[19] / STAT mode)', 0x53);
  } finally {
    cleanupTranspiledModule(moduleAssets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
