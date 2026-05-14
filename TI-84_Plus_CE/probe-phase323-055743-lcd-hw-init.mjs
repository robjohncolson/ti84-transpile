#!/usr/bin/env node

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
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TRACE_ENTRY = 0x055743;
const TRACE_ARG = 0x055519;
const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 5000;
const TRACE_LOOP_LIMIT = 8192;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase323-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-ixd':
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.dest ?? inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
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
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-reg':
      return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default: {
      let rendered = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) rendered += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) rendered += ` ${hex(inst.value)}`;
      return rendered;
    }
  }
}

function disassembleWindow(buffer, start, byteCount) {
  const rows = [];
  const end = Math.min(buffer.length, start + byteCount);

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(buffer, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({
        pc,
        bytes: bytesToHex(buffer.subarray(pc, Math.min(pc + length, end))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(buffer[pc]),
        text: `DB ${hexByte(buffer[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return currentMode;
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const out = fn(this);

    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hex(pc)}: ${String(out)}`);
    }

    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }

    return out;
  };
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals, trackMemoryMapped: true });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.rom = romBytes;
  cpu.__executor = executor;
  cpu.__peripherals = peripherals;

  installStep(cpu, executor);

  return { mem, cpu, executor };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;

  const fillStart = Math.max(0, cpu.sp);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x40);
  mem.fill(0xFF, fillStart, fillEnd);
}

function runToStopPc(executor, entryPc, mode, stopPc, maxSteps, maxLoopIterations) {
  let lastPc = entryPc & 0xFFFFFF;
  let steps = 0;
  let termination = 'unknown';
  let hitStop = false;

  const trap = (pc, step) => {
    lastPc = pc & 0xFFFFFF;
    steps = Math.max(steps, (step ?? 0) + 1);
    if (lastPc === stopPc) {
      const error = new Error('__STOP__');
      error.traceStop = true;
      throw error;
    }
  };

  try {
    const result = executor.runFrom(entryPc, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, _mode, _meta, step) {
        trap(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        trap(pc, step);
      },
    });

    lastPc = result.lastPc ?? lastPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.traceStop) {
      hitStop = true;
      lastPc = stopPc;
      termination = 'stop_hit';
    } else {
      throw error;
    }
  }

  return { hitStop, lastPc, steps, termination };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    100000,
    TRACE_LOOP_LIMIT,
  );
}

function seedTraceCall(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.pc = TRACE_ENTRY;
  cpu.sp = STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;

  const fillStart = Math.max(0, (cpu.sp - 0x40) & 0xFFFFFF);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x20);
  mem.fill(0xFF, fillStart, fillEnd);
  write24(mem, cpu.sp, TRACE_RETURN);
  write24(mem, cpu.sp + 3, TRACE_ARG);
}

function summarizePortWrites(events) {
  return events.map((event) => ({
    step: event.step,
    block: hex(event.block),
    port: hex(event.port, event.port > 0xFF ? 4 : 2),
    value: hexByte(event.value),
  }));
}

function summarizePortReads(events) {
  return events.map((event) => ({
    step: event.step,
    block: hex(event.block),
    port: hex(event.port, event.port > 0xFF ? 4 : 2),
    value_returned: hexByte(event.value),
  }));
}

function summarizeMmioWrites(events) {
  return events.map((event) => ({
    step: event.step,
    block: hex(event.block),
    addr: hex(event.addr),
    value: hexByte(event.value),
  }));
}

function summarizeMmioReads(events) {
  return events.map((event) => ({
    step: event.step,
    block: hex(event.block),
    addr: hex(event.addr),
    value_returned: hexByte(event.value),
  }));
}

function traceLcdInit(runtime) {
  const { cpu, mem } = runtime;
  seedTraceCall(cpu, mem);

  const portReads = [];
  const portWrites = [];
  const mmioReads = [];
  const mmioWrites = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();

  let step = 0;
  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  cpu.onIoRead = (port, value) => {
    portReads.push({
      step,
      block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      port: port & 0xFFFF,
      value: value & 0xFF,
    });
  };

  cpu.onIoWrite = (port, value) => {
    portWrites.push({
      step,
      block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      port: port & 0xFFFF,
      value: value & 0xFF,
    });
  };

  cpu.onMmioRead = (addr, value) => {
    mmioReads.push({
      step,
      block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      addr: addr & 0xFFFFFF,
      value: value & 0xFF,
    });
  };

  cpu.onMmioWrite = (addr, value) => {
    mmioWrites.push({
      step,
      block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      addr: addr & 0xFFFFFF,
      value: value & 0xFF,
    });
  };

  while (step < TRACE_STEP_LIMIT) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === TRACE_RETURN) {
      stopReason = 'returned';
      break;
    }

    if (!seenBlocks.has(pc)) {
      seenBlocks.add(pc);
      uniqueBlocks.push(pc);
    }

    let out;
    try {
      out = cpu.step();
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      break;
    }

    step += 1;

    if (out === -1) {
      stopReason = 'halt';
      break;
    }
    if (out === -2) {
      stopReason = 'sleep';
      break;
    }
  }

  const finalPc = cpu.pc & 0xFFFFFF;
  const returned = finalPc === TRACE_RETURN;
  if (returned && stopReason === 'budget_exhausted') {
    stopReason = 'returned';
  }

  cpu.onIoRead = () => {};
  cpu.onIoWrite = () => {};
  cpu.onMmioRead = () => {};
  cpu.onMmioWrite = () => {};

  return {
    steps: step,
    returned,
    finalPc,
    stopReason,
    errorMessage,
    uniqueBlocks,
    portWrites,
    portReads,
    mmioWrites,
    mmioReads,
  };
}

function buildAssessment(trace) {
  if (trace.portWrites.length || trace.mmioWrites.length) {
    return 'This path performs hardware writes before D000C6 bit 2 is armed, so it is a strong candidate for required LCD bring-up before VRAM writes can succeed.';
  }
  if (trace.portReads.length || trace.mmioReads.length) {
    return 'This path at least probes hardware state before D000C6 bit 2 is armed, so it may still be part of the LCD enable sequence.';
  }
  return 'No hardware I/O was observed in this trace. If this routine is required before VRAM writes succeed, the dependency is likely indirect through RAM state or a deeper path not exercised here.';
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);

    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    return blocks;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();
  const runtime = createRuntime(romBytes, blocks);

  const bootInfo = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  if (!memInit.hitStop) {
    throw new Error(
      `MEM_INIT did not return via ${hex(MEM_INIT_RET)} ` +
      `(termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`,
    );
  }

  const trace = traceLcdInit(runtime);
  const staticBytes = romBytes.subarray(TRACE_ENTRY, TRACE_ENTRY + 64);
  const staticDisasm = disassembleWindow(romBytes, TRACE_ENTRY, 64);

  console.log('=== 0x055743 LCD Hardware Init Trace ===');
  console.log(`Boot: boot=${bootInfo.boot.termination}/${bootInfo.boot.steps} kernel=${bootInfo.kernelInit.termination}/${bootInfo.kernelInit.steps} post=${bootInfo.postInit.termination}/${bootInfo.postInit.steps} memInit=${memInit.termination}/${memInit.steps}`);
  console.log(`Caller-style argument seed: ${hex(TRACE_ARG)} (mirrors 0x055265 -> PUSH HL before CALL 0x055743)`);
  console.log('Wrapper summary: PUSH IX; LD IY,0xD00080; LD HL,(IX+6); CALL 0x000138');
  console.log(`Steps: ${trace.steps}`);
  console.log(`Returned: ${trace.returned ? 'yes' : `no (final PC ${hex(trace.finalPc)})`}`);
  if (!trace.returned) {
    console.log(`Stop reason: ${trace.stopReason}${trace.errorMessage ? ` (${trace.errorMessage})` : ''}`);
  }
  console.log(`Port writes: ${JSON.stringify(summarizePortWrites(trace.portWrites), null, 2)}`);
  console.log(`Port reads: ${JSON.stringify(summarizePortReads(trace.portReads), null, 2)}`);
  console.log(`MMIO writes: ${JSON.stringify(summarizeMmioWrites(trace.mmioWrites), null, 2)}`);
  console.log(`MMIO reads: ${JSON.stringify(summarizeMmioReads(trace.mmioReads), null, 2)}`);
  console.log(`Unique blocks: ${trace.uniqueBlocks.length} [${trace.uniqueBlocks.map((pc) => hex(pc)).join(', ')}]`);
  console.log(`First 64 bytes hex: ${bytesToHex(staticBytes)}`);
  console.log('Static decode:');
  for (const row of staticDisasm) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(23)} ${row.text}`);
  }
  console.log(`Assessment (inference): ${buildAssessment(trace)}`);
}

await main();
