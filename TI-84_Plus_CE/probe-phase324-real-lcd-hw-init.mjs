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

const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 10000;
const TRACE_LOOP_LIMIT = 8192;
const STATIC_BYTE_LIMIT = 200;

const TRACE_TARGETS = [0x055191, 0x055280];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function hexAuto(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return hex(value, value <= 0xFFFF ? 4 : 6);
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase324-${process.pid}.mjs`);
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
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hexAuto(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hexAuto(inst.addr ?? inst.address)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': {
      const addr = inst.addr ?? inst.address;
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hexAuto(addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hexAuto(addr)})`;
    }
    case 'ld-mem-pair':
      return `${prefix}LD (${hexAuto(inst.addr ?? inst.address)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src ?? inst.pair).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
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
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-ixd':
      return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ixd':
      return `${prefix}INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `${prefix}DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'ldd':
      return `${prefix}LDD`;
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
    case 'ini':
      return `${prefix}INI`;
    case 'inir':
      return `${prefix}INIR`;
    case 'ind':
      return `${prefix}IND`;
    case 'indr':
      return `${prefix}INDR`;
    case 'outi':
      return `${prefix}OUTI`;
    case 'otir':
      return `${prefix}OTIR`;
    case 'outd':
      return `${prefix}OUTD`;
    case 'otdr':
      return `${prefix}OTDR`;
    case 'otimr':
      return `${prefix}OTIMR`;
    case 'tstio':
      return `${prefix}TSTIO ${hexByte(inst.value)}`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-reg':
      return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'in0':
      return `${prefix}IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0':
      return `${prefix}OUT0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'slp':
      return `${prefix}SLP`;
    default: {
      let rendered = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) rendered += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) rendered += ` ${hexAuto(inst.value)}`;
      return rendered;
    }
  }
}

function isReturnTag(tag) {
  return tag === 'ret' || tag === 'ret-conditional' || tag === 'reti' || tag === 'retn';
}

function isPortIoTag(tag) {
  return (
    tag === 'in-imm' ||
    tag === 'out-imm' ||
    tag === 'in-reg' ||
    tag === 'out-reg' ||
    tag === 'in0' ||
    tag === 'out0' ||
    tag === 'ini' ||
    tag === 'inir' ||
    tag === 'ind' ||
    tag === 'indr' ||
    tag === 'outi' ||
    tag === 'otir' ||
    tag === 'outd' ||
    tag === 'otdr' ||
    tag === 'otimr' ||
    tag === 'tstio'
  );
}

function describeStaticPort(inst) {
  switch (inst.tag) {
    case 'in-imm':
    case 'out-imm':
    case 'in0':
    case 'out0':
      return `${hexByte(inst.port)} (immediate)`;
    case 'tstio':
      return `(C) mask ${hexByte(inst.value)}`;
    default:
      return '(C)';
  }
}

function classifyLcdReference(value) {
  if (value >= 0x8000 && value <= 0x8041) {
    return '0x8000-0x8041';
  }
  if (value >= 0x8000 && value <= 0x80FF) {
    return '0x8000-0x80FF';
  }
  if (value >= 0x3100 && value <= 0x31FF) {
    return '0x3100-0x31FF';
  }
  if (value >= 0x4000 && value <= 0x40FF) {
    return '0x4000-0x40FF';
  }
  return null;
}

function collectImmediateOperands(inst) {
  const refs = [];

  for (const field of ['addr', 'address', 'value', 'port']) {
    const value = inst?.[field];
    if (typeof value === 'number') {
      refs.push({ field, value: value >>> 0 });
    }
  }

  return refs;
}

function disassembleFunction(romBytes, startPc, byteLimit) {
  const rows = [];
  const portIo = [];
  const callTargets = [];
  const lcdRefs = [];
  const seenLcdRefs = new Set();
  const endPc = Math.min(romBytes.length, startPc + byteLimit);

  let mode = 'adl';
  let pc = startPc;
  let returnPoint = null;

  while (pc < endPc) {
    let inst;
    let length = 1;

    try {
      inst = decodeInstruction(romBytes, pc, mode);
      length = Math.max(1, inst?.length ?? 1);
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        text: `DB ${hexByte(romBytes[pc] ?? 0)} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
      continue;
    }

    const bytes = bytesToHex(romBytes.subarray(pc, Math.min(pc + length, endPc)));
    const text = formatInstruction(inst);

    rows.push({ pc, bytes, text });

    if (isPortIoTag(inst.tag)) {
      portIo.push({
        pc,
        port: describeStaticPort(inst),
        text,
      });
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({
        pc,
        target: inst.target >>> 0,
        condition: inst.condition ?? null,
        text,
      });
    }

    for (const ref of collectImmediateOperands(inst)) {
      const rangeLabel = classifyLcdReference(ref.value);
      if (!rangeLabel) continue;

      const key = `${pc}:${ref.field}:${ref.value}`;
      if (seenLcdRefs.has(key)) continue;
      seenLcdRefs.add(key);

      lcdRefs.push({
        pc,
        field: ref.field,
        value: ref.value,
        rangeLabel,
        text,
      });
    }

    if (isReturnTag(inst.tag)) {
      returnPoint = {
        pc,
        text,
      };
      break;
    }

    if (inst.nextMode) {
      mode = inst.nextMode;
    }

    pc += length;
  }

  return {
    rows,
    portIo,
    callTargets,
    lcdRefs,
    returnPoint,
  };
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

  let ioTraceSink = null;
  const rawRead = peripherals.read.bind(peripherals);
  const rawWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const value = rawRead(port);
    if (ioTraceSink) {
      ioTraceSink({
        kind: 'read',
        port: port & 0xFFFF,
        value: value & 0xFF,
        block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      });
    }
    return value;
  };

  peripherals.write = (port, value) => {
    rawWrite(port, value);
    if (ioTraceSink) {
      ioTraceSink({
        kind: 'write',
        port: port & 0xFFFF,
        value: value & 0xFF,
        block: cpu._currentBlockPc ?? cpu.pc ?? 0,
      });
    }
  };

  return {
    mem,
    cpu,
    executor,
    setIoTraceSink(sink) {
      ioTraceSink = typeof sink === 'function' ? sink : null;
    },
  };
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

function seedTraceCall(cpu, mem, entryPc) {
  resetCpuForOsCall(cpu, mem);
  cpu.pc = entryPc & 0xFFFFFF;
  cpu.sp = STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;

  const fillStart = Math.max(0, (cpu.sp - 0x40) & 0xFFFFFF);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x20);
  mem.fill(0xFF, fillStart, fillEnd);
  write24(mem, cpu.sp, TRACE_RETURN);
}

function collectCallTargetsFromBlock(meta, nextPc, hits) {
  if (!meta?.instructions || nextPc < 0) return;

  for (const inst of meta.instructions) {
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target === nextPc) {
      hits.add(inst.target & 0xFFFFFF);
    }
  }
}

function traceFunction(runtime, entryPc) {
  const { cpu, mem, executor } = runtime;
  seedTraceCall(cpu, mem, entryPc);

  const ioLog = [];
  const callTargetsHit = new Set();

  let step = 0;
  let stopReason = 'step_limit';
  let errorMessage = null;

  runtime.setIoTraceSink((event) => {
    ioLog.push({
      ...event,
      step,
    });
  });

  while (step < TRACE_STEP_LIMIT) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === TRACE_RETURN) {
      stopReason = 'returned';
      break;
    }

    const mode = cpu.madl ? 'adl' : 'z80';
    const key = blockKey(pc, mode);
    const meta = executor.blockMeta?.[key];

    let out;
    try {
      out = cpu.step();
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      break;
    }

    if (typeof out === 'number' && out >= 0) {
      collectCallTargetsFromBlock(meta, out, callTargetsHit);
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

  runtime.setIoTraceSink(null);

  const finalPc = cpu.pc & 0xFFFFFF;
  const returned = finalPc === TRACE_RETURN;
  if (returned && stopReason === 'step_limit') {
    stopReason = 'returned';
  }

  return {
    steps: step,
    returned,
    finalPc,
    stopReason,
    errorMessage,
    ioLog,
    callTargetsHit: Array.from(callTargetsHit).sort((a, b) => a - b),
  };
}

function formatPortNumber(port) {
  return hex(port, port > 0xFF ? 4 : 2);
}

function formatPortIoEvent(event) {
  const arrow = event.kind === 'read' ? '=>' : '<=';
  return `${event.kind.toUpperCase()} ${formatPortNumber(event.port)} ${arrow} ${hexByte(event.value)} @ ${hex(event.block)} step ${event.step}`;
}

function printList(title, items, formatter) {
  console.log(`${title}:`);
  if (!items.length) {
    console.log('  none');
    return;
  }
  for (const item of items) {
    console.log(`  ${formatter(item)}`);
  }
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

function prepareRuntime(romBytes, blocks) {
  const runtime = createRuntime(romBytes, blocks);
  const bootInfo = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);

  if (!memInit.hitStop) {
    throw new Error(
      `MEM_INIT did not return via ${hex(MEM_INIT_RET)} ` +
      `(termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`,
    );
  }

  return { runtime, bootInfo, memInit };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  for (const entryPc of TRACE_TARGETS) {
    const staticInfo = disassembleFunction(romBytes, entryPc, STATIC_BYTE_LIMIT);

    console.log(`=== ${hex(entryPc)} STATIC DISASSEMBLY ===`);
    for (const row of staticInfo.rows) {
      console.log(`${hex(row.pc)}: ${row.bytes.padEnd(23)} ${row.text}`);
    }
    printList(
      'Port I/O instructions',
      staticInfo.portIo,
      (item) => `${hex(item.pc)} ${item.port} ${item.text}`,
    );
    printList(
      'CALL targets',
      staticInfo.callTargets,
      (item) => `${hex(item.pc)} -> ${hex(item.target)}${item.condition ? ` (${String(item.condition).toUpperCase()})` : ''}`,
    );
    printList(
      'LCD port references',
      staticInfo.lcdRefs,
      (item) => `${hex(item.pc)} ${item.field}=${hexAuto(item.value)} [${item.rangeLabel}] via ${item.text}`,
    );
    console.log(
      `Return point: ${
        staticInfo.returnPoint
          ? `${hex(staticInfo.returnPoint.pc)} ${staticInfo.returnPoint.text}`
          : `none within first ${STATIC_BYTE_LIMIT} bytes`
      }`,
    );
    console.log();

    const { runtime, bootInfo, memInit } = prepareRuntime(romBytes, blocks);
    const trace = traceFunction(runtime, entryPc);

    console.log(`=== ${hex(entryPc)} DYNAMIC TRACE ===`);
    console.log(
      `Boot prep: boot=${bootInfo.boot.termination}/${bootInfo.boot.steps} ` +
      `kernel=${bootInfo.kernelInit.termination}/${bootInfo.kernelInit.steps} ` +
      `post=${bootInfo.postInit.termination}/${bootInfo.postInit.steps} ` +
      `memInit=${memInit.termination}/${memInit.steps}`,
    );
    console.log(`Result: ${trace.returned ? 'RETURNED' : 'HUNG'} after ${trace.steps} steps`);
    if (!trace.returned) {
      console.log(
        `Stop reason: ${trace.stopReason}${trace.errorMessage ? ` (${trace.errorMessage})` : ''}; final PC ${hex(trace.finalPc)}`,
      );
    }
    printList('Port I/O log', trace.ioLog, formatPortIoEvent);
    printList('Call targets hit', trace.callTargetsHit, (target) => hex(target));
    console.log();
  }
}

await main();
