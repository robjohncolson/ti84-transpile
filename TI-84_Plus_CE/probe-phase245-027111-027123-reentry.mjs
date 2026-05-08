#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ENTRY_SP = 0xD1A860;
const IX = 0xD1A860;
const IY = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const ENTRY_027111 = 0x027111;
const ENTRY_027123 = 0x027123;
const EVENT_LOOP_ENTRY = 0x02FD99;
const DISASM_END_INCLUSIVE = 0x027180;

const TRACE_LIMIT = 500;
const IY_TRACK_LEN = 128;

const D02A86_ADDR = 0xD02A86;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;

const ETOP = 0xD02437;
const ECUR = 0xD0243A;
const ETAIL = 0xD0243D;
const EBTM = 0xD02440;
const EBUF = 0xD00A00;
const EEND = 0xD00B00;

const COMMON_SEEDS = [
  [0xD0058E, 0x8F],
  [0xD0058D, 0x00],
  [0xD0059F, 0x00],
  [0xD003E0, 0x00],
  [D00824_ADDR, 0x00],
  [0xD003DA, 0x00],
  [D007E0_ADDR, 0x40],
  [0xD00000, 0x00],
];

const WATCHED_BYTES = [
  { name: 'D02A86', addr: D02A86_ADDR },
  { name: 'D007E0', addr: D007E0_ADDR },
  { name: 'D00824', addr: D00824_ADDR },
];

const SCENARIOS = [
  {
    name: '0x027111',
    entry: ENTRY_027111,
    d02a86: 0x00,
    a: 0x00,
    f: 0x00,
    b: 0x00,
    note: 'Direct Z-path entry from 0x08BFDD with D02A86 already zero.',
  },
  {
    name: '0x027123',
    entry: ENTRY_027123,
    d02a86: 0x03,
    a: 0x04,
    f: 0x02,
    b: 0x04,
    note: 'Direct NZ-path entry with D02A86 already decremented to 0x03 and A restored to 0x04 by the caller.',
  },
];

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

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
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase245-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(mem, blocks, peripherals) {
  const executor = cpuRuntime.createExecutor(blocks, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const exit of exits) {
    if (exit.target === pc && exit.targetMode) return exit.targetMode;
  }
  return mode;
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

function makeRuntime(blocks, romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, blocks, peripherals);
  installStep(cpu, executor);
  return { mem, cpu, executor };
}

function seedEditBuffer(mem) {
  write24(mem, ETOP, EBUF);
  write24(mem, ECUR, EBUF);
  write24(mem, ETAIL, EEND);
  write24(mem, EBTM, EEND);
  mem.fill(0x00, EBUF, EEND);
}

function seedScenario(cpu, mem, scenario) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = scenario.entry;
  cpu.sp = ENTRY_SP;
  cpu.ix = IX;
  cpu.iy = IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = scenario.a & 0xFF;
  cpu.f = scenario.f & 0xFF;
  cpu.b = scenario.b & 0xFF;

  mem.fill(0x00, IY & MEM_MASK, ((IY & MEM_MASK) + IY_TRACK_LEN) & MEM_MASK);
  for (const [addr, value] of COMMON_SEEDS) {
    mem[addr & MEM_MASK] = value & 0xFF;
  }
  seedEditBuffer(mem);
  mem[D02A86_ADDR & MEM_MASK] = scenario.d02a86 & 0xFF;
  write24(mem, ENTRY_SP, RETURN_SENTINEL);
}

function register24(cpu, name) {
  return ((cpu[`_${name}`] ?? cpu[name] ?? 0) & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function formatRegs(snapshot) {
  return [
    `PC=${hex(snapshot.pc ?? snapshot._pc ?? 0)}`,
    `A=${hexByte(snapshot.a)}`,
    `F=${hexByte(snapshot.f)}`,
    `BC=${hex(snapshot._bc ?? snapshot.bc ?? 0)}`,
    `DE=${hex(snapshot._de ?? snapshot.de ?? 0)}`,
    `HL=${hex(snapshot._hl ?? snapshot.hl ?? 0)}`,
    `IX=${hex(snapshot._ix ?? snapshot.ix ?? 0)}`,
    `IY=${hex(snapshot._iy ?? snapshot.iy ?? 0)}`,
    `SP=${hex(snapshot.sp ?? 0)}`,
    `IFF1=${snapshot.iff1 ? 1 : 0}`,
    `IFF2=${snapshot.iff2 ? 1 : 0}`,
    `MADL=${snapshot.madl ? 1 : 0}`,
    `MBASE=${hexByte(snapshot.mbase ?? 0)}`,
  ].join(' ');
}

function currentRegs(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    _bc: register24(cpu, 'bc'),
    _de: register24(cpu, 'de'),
    _hl: register24(cpu, 'hl'),
    _ix: register24(cpu, 'ix'),
    _iy: register24(cpu, 'iy'),
    sp: cpu.sp & 0xFFFFFF,
    iff1: cpu.iff1 ? 1 : 0,
    iff2: cpu.iff2 ? 1 : 0,
    madl: cpu.madl ? 1 : 0,
    mbase: (cpu.mbase ?? 0) & 0xFF,
  };
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return inst.direction === 'to-mem'
        ? `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`
        : `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-indexed-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'xor':
      return 'XOR A';
    default:
      return inst.tag + (inst.target !== undefined ? ` ${hex(inst.target)}` : '');
  }
}

function disassembleRange(romBytes, start, endInclusive) {
  const rows = [];
  let pc = start;
  while (pc <= endInclusive) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, endInclusive + 1))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function truncate(text, max = 120) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function blockSummary(meta, pc, romBytes) {
  if (meta?.instructions?.length) {
    return truncate(meta.instructions.map((inst) => inst.dasm).join(' | '));
  }
  try {
    return formatInstruction(decodeInstruction(romBytes, pc, 'adl'));
  } catch {
    return '(decode error)';
  }
}

function transitionInfo(meta, beforePc, afterPc, out) {
  const lastInst = meta?.instructions?.[meta.instructions.length - 1];
  if (out === -1 || lastInst?.tag === 'halt') {
    return { kind: 'halt', text: `HALT -> ${hex(afterPc)}`, target: afterPc };
  }
  if (!lastInst) {
    return { kind: 'linear', text: `next ${hex(afterPc)}`, target: afterPc };
  }

  const fallthrough = lastInst.fallthrough ?? (((lastInst.pc ?? beforePc) + (lastInst.length || 0)) & 0xFFFFFF);
  switch (lastInst.tag) {
    case 'call':
      return { kind: 'call', text: `CALL ${hex(lastInst.target)} -> ${hex(afterPc)}`, target: lastInst.target };
    case 'call-conditional': {
      const taken = afterPc === (lastInst.target & 0xFFFFFF);
      return {
        kind: 'call',
        text: `${lastInst.dasm} ${taken ? 'taken' : 'not taken'} -> ${hex(afterPc)}`,
        target: taken ? lastInst.target : afterPc,
      };
    }
    case 'jp': {
      return { kind: 'jp', text: `JP ${hex(lastInst.target)} -> ${hex(afterPc)}`, target: lastInst.target };
    }
    case 'jp-conditional':
    case 'jr-conditional': {
      const taken = afterPc === (lastInst.target & 0xFFFFFF);
      return {
        kind: lastInst.tag === 'jp-conditional' ? 'jp' : 'jr',
        text: `${lastInst.dasm} ${taken ? 'taken' : 'not taken'} -> ${hex(afterPc)}`,
        target: taken ? lastInst.target : afterPc,
      };
    }
    case 'jr':
      return { kind: 'jr', text: `JR ${hex(lastInst.target)} -> ${hex(afterPc)}`, target: lastInst.target };
    case 'ret':
      return { kind: 'ret', text: `RET -> ${hex(afterPc)}`, target: afterPc };
    case 'ret-conditional': {
      const taken = afterPc !== fallthrough;
      return {
        kind: 'ret',
        text: `${lastInst.dasm} ${taken ? 'taken' : 'not taken'} -> ${hex(afterPc)}`,
        target: afterPc,
      };
    }
    default:
      return { kind: 'linear', text: `next ${hex(afterPc)}`, target: afterPc };
  }
}

function snapshotWatchedBytes(mem) {
  return Object.fromEntries(
    WATCHED_BYTES.map((watch) => [watch.name, mem[watch.addr & MEM_MASK] & 0xFF]),
  );
}

function snapshotIy(mem) {
  const bytes = new Uint8Array(IY_TRACK_LEN);
  for (let index = 0; index < IY_TRACK_LEN; index++) {
    bytes[index] = mem[(IY + index) & MEM_MASK];
  }
  return bytes;
}

function recordWatchedChanges(step, pc, mem, shadow, changes) {
  for (const watch of WATCHED_BYTES) {
    const current = mem[watch.addr & MEM_MASK] & 0xFF;
    if (current !== shadow[watch.name]) {
      changes.push({
        step,
        afterBlock: pc,
        name: watch.name,
        addr: watch.addr,
        oldValue: shadow[watch.name],
        newValue: current,
      });
      shadow[watch.name] = current;
    }
  }
}

function recordIyChanges(step, pc, mem, shadow, changes) {
  for (let index = 0; index < IY_TRACK_LEN; index++) {
    const current = mem[(IY + index) & MEM_MASK] & 0xFF;
    if (current !== shadow[index]) {
      changes.push({
        step,
        afterBlock: pc,
        offset: index,
        addr: IY + index,
        oldValue: shadow[index],
        newValue: current,
      });
      shadow[index] = current;
    }
  }
}

function runScenario(blocks, romBytes, scenario) {
  const { mem, cpu, executor } = makeRuntime(blocks, romBytes);
  seedScenario(cpu, mem, scenario);

  const entryRegs = currentRegs(cpu);
  const watchedBefore = snapshotWatchedBytes(mem);
  const iyBefore = snapshotIy(mem);

  const watchedShadow = { ...watchedBefore };
  const iyShadow = new Uint8Array(iyBefore);
  const uniqueBlocks = new Map();
  const stepLog = [];
  const controlFlow = [];
  const watchedChanges = [];
  const iyChanges = [];

  let eventLoopStep = null;
  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  for (let step = 0; step < TRACE_LIMIT; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    const mode = cpu.madl ? 'adl' : 'z80';
    const key = blockKey(pc, mode);
    const meta = executor.blockMeta?.[key] ?? null;

    if (pc === EVENT_LOOP_ENTRY && eventLoopStep === null) {
      eventLoopStep = step;
    }

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    uniqueBlocks.set(pc, {
      pc,
      count: (uniqueBlocks.get(pc)?.count ?? 0) + 1,
      summary: blockSummary(meta, pc, romBytes),
    });

    let out;
    let afterPc = pc;
    try {
      out = cpu.step();
      afterPc = cpu.pc & 0xFFFFFF;
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      stepLog.push({
        step,
        pc,
        afterPc: null,
        note: `ERROR: ${errorMessage}`,
      });
      break;
    }

    const transition = transitionInfo(meta, pc, afterPc, out);
    stepLog.push({
      step,
      pc,
      afterPc,
      note: transition.text,
    });
    if (transition.kind !== 'linear') {
      controlFlow.push({
        step,
        pc,
        afterPc,
        text: transition.text,
      });
    }

    recordWatchedChanges(step + 1, pc, mem, watchedShadow, watchedChanges);
    recordIyChanges(step + 1, pc, mem, iyShadow, iyChanges);

    if (afterPc === EVENT_LOOP_ENTRY && eventLoopStep === null) {
      eventLoopStep = step + 1;
    }

    if (out === -1) {
      stopReason = 'halt';
      break;
    }

    if (out === -2) {
      stopReason = 'sleep';
      break;
    }

    if (afterPc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }
  }

  return {
    scenario,
    entryRegs,
    finalRegs: currentRegs(cpu),
    stopReason,
    errorMessage,
    finalPc: cpu.pc & 0xFFFFFF,
    eventLoopStep,
    reachedEventLoop: eventLoopStep !== null,
    watchedBefore,
    watchedAfter: snapshotWatchedBytes(mem),
    watchedChanges,
    iyBefore,
    iyAfter: snapshotIy(mem),
    iyChanges,
    stepLog,
    uniqueBlocks: [...uniqueBlocks.values()].sort((left, right) => left.pc - right.pc),
    controlFlow,
  };
}

function printDivider(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

function printDisassembly(title, rows, markers = new Map()) {
  printDivider(title);
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker ? `  ${marker}` : ''}`);
  }
  console.log('');
}

function formatWatchedSnapshot(snapshot) {
  return WATCHED_BYTES
    .map((watch) => `${watch.name}=${hexByte(snapshot[watch.name])}`)
    .join(' ');
}

function printWatchedChanges(result) {
  console.log(`  Watched bytes before: ${formatWatchedSnapshot(result.watchedBefore)}`);
  console.log(`  Watched bytes after:  ${formatWatchedSnapshot(result.watchedAfter)}`);
  console.log('  Watched byte changes:');
  if (!result.watchedChanges.length) {
    console.log('    (none)');
  } else {
    for (const change of result.watchedChanges) {
      console.log(
        `    step ${String(change.step).padStart(3, ' ')} after ${hex(change.afterBlock)}: ${change.name} ${hexByte(change.oldValue)} -> ${hexByte(change.newValue)}`,
      );
    }
  }
  console.log('');
}

function printIyChanges(result) {
  console.log(`  IY flag changes (${result.iyChanges.length} total):`);
  if (!result.iyChanges.length) {
    console.log('    (none)');
  } else {
    for (const change of result.iyChanges) {
      console.log(
        `    step ${String(change.step).padStart(3, ' ')} after ${hex(change.afterBlock)}: IY+${hex(change.offset, 2)} ${hexByte(change.oldValue)} -> ${hexByte(change.newValue)}`,
      );
    }
  }
  console.log('');
}

function printScenario(result) {
  printDivider(`DYNAMIC TRACE ${result.scenario.name}`);
  console.log(`  Note: ${result.scenario.note}`);
  console.log(`  Entry regs: ${formatRegs(result.entryRegs)}`);
  console.log(`  Exit regs:  ${formatRegs(result.finalRegs)}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  console.log(`  Reached 0x02FD99: ${result.reachedEventLoop ? `yes, step ${result.eventLoopStep}` : 'no'}`);
  if (result.errorMessage) {
    console.log(`  Error: ${result.errorMessage}`);
  }
  console.log('');

  console.log(`  Unique blocks visited (${result.uniqueBlocks.length} total):`);
  for (const block of result.uniqueBlocks) {
    console.log(`    ${hex(block.pc)} x${block.count}  ${block.summary}`);
  }
  console.log('');

  console.log(`  Step log (${result.stepLog.length} steps recorded):`);
  for (const row of result.stepLog) {
    const afterText = row.afterPc === null ? 'n/a' : hex(row.afterPc);
    console.log(`    step ${String(row.step).padStart(3, ' ')}: ${hex(row.pc)} -> ${afterText}  ${row.note}`);
  }
  console.log('');

  console.log(`  Control-flow events (${result.controlFlow.length} total):`);
  if (!result.controlFlow.length) {
    console.log('    (none)');
  } else {
    for (const row of result.controlFlow) {
      console.log(`    step ${String(row.step).padStart(3, ' ')} at ${hex(row.pc)}: ${row.text}`);
    }
  }
  console.log('');

  printWatchedChanges(result);
  printIyChanges(result);
}

function staticHeadline(rows) {
  return rows
    .filter((row) => row.pc === ENTRY_027111 || row.pc === ENTRY_027123 || row.pc === 0x027116 || row.pc === 0x02713A)
    .map((row) => `${hex(row.pc)} ${row.text}`)
    .join('; ');
}

function printConclusion(run111, run123, rows111, rows123) {
  printDivider('ANSWER');
  console.log('  Static decode:');
  console.log(`    ${staticHeadline(rows111)}`);
  console.log(`    ${staticHeadline(rows123)}`);
  console.log('');

  console.log('  Dynamic determination:');
  console.log(
    `    0x027111 ${run111.reachedEventLoop ? `does reach 0x02FD99 (first seen at step ${run111.eventLoopStep})` : `does not reach 0x02FD99 within ${TRACE_LIMIT} steps`}.`,
  );
  console.log(
    `    0x027123 ${run123.reachedEventLoop ? `does reach 0x02FD99 (first seen at step ${run123.eventLoopStep})` : `does not reach 0x02FD99 within ${TRACE_LIMIT} steps`}.`,
  );
  console.log('');

  console.log('  Interpretation:');
  console.log('    0x027111 is a small prelude that clears D02A86 and immediately CALLs 0x0003B0.');
  console.log('    0x027123 is the heavier re-entry path: it saves AF/context, disables interrupts, snapshots short-address state, and CALLs 0x0003E8.');
  console.log('    The trace output above shows whether either path converges back to 0x02FD99 or diverts elsewhere under the requested direct-entry seed state.');
  console.log('');
}

async function main() {
  const assets = ensureTranspiledModule();
  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod);
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    const rows111 = disassembleRange(romBytes, ENTRY_027111, DISASM_END_INCLUSIVE);
    const rows123 = disassembleRange(romBytes, ENTRY_027123, DISASM_END_INCLUSIVE);

    console.log('Phase 245: 0x027111 / 0x027123 post-display event-loop re-entry');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
    console.log(`Entry seed: SP=${hex(ENTRY_SP)} IX=${hex(IX)} IY=${hex(IY)} MBASE=${hexByte(MBASE)} RET=${hex(RETURN_SENTINEL)}`);
    console.log('');

    printDisassembly(
      `STATIC DISASSEMBLY ${hex(ENTRY_027111)}..${hex(DISASM_END_INCLUSIVE)}`,
      rows111,
      new Map([
        [ENTRY_027111, '<-- 0x027111 entry'],
        [ENTRY_027123, '<-- 0x027123 entry'],
      ]),
    );

    printDisassembly(
      `STATIC DISASSEMBLY ${hex(ENTRY_027123)}..${hex(DISASM_END_INCLUSIVE)}`,
      rows123,
      new Map([[ENTRY_027123, '<-- 0x027123 entry']]),
    );

    const run111 = runScenario(blocks, romBytes, SCENARIOS[0]);
    const run123 = runScenario(blocks, romBytes, SCENARIOS[1]);

    printScenario(run111);
    printScenario(run123);
    printConclusion(run111, run123, rows111, rows123);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
