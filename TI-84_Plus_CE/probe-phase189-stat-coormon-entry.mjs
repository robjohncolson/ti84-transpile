#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Gunzip ROM.transpiled.js.gz first, then rerun this probe.',
  );
}

const rom = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MASK24 = 0xFFFFFF;
const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const HOME_CONTEXT_ENTRY = 0x0585E9;
const HOME_CONTEXT_TABLE = 0x0585D3;
const HOME_WINDOW_START = 0x058000;
const HOME_WINDOW_END = 0x05A000;
const STAT_APP_START = 0x059000;
const STAT_APP_END = 0x05A000;

const MEMINIT_RET = 0x7FFFF6;
const FAKE_RET = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;

const RAW_SCAN_ADDR = 0xD00587;
const KEY_CODE_ADDR = 0xD0058C;
const GETKY_ADDR = 0xD0058D;
const GETCSC_SCAN_ADDR = 0xD0058E;

const PART_A_STEPS = 47;
const PART_B_STEPS = 500;
const LOOP_LIMIT = 8192;

const TRACE_LIMIT = '__PHASE189_TRACE_LIMIT__';
const TRACE_RETURN = '__PHASE189_TRACE_RETURN__';

const FOCUS_ADDRS = [
  { addr: RAW_SCAN_ADDR, label: 'rawKeyStatus / kbdScanCode' },
  { addr: KEY_CODE_ADDR, label: 'keyCode' },
  { addr: GETKY_ADDR, label: 'kbdGetKy / getKy' },
  { addr: GETCSC_SCAN_ADDR, label: 'getCSCscan' },
];

const FOCUS_RANGES = [
  { start: 0xD00080, end: 0xD000FF, label: 'IY-relative flags window' },
  { start: 0xD00500, end: 0xD00600, label: '0xD00500-0xD00600 window' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bhex(value) {
  return hex(value, 2);
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >>> 8) & 0xFF;
  buffer[addr + 2] = (value >>> 16) & 0xFF;
}

function readLittle(buffer, addr, width) {
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    value |= (buffer[(addr + index) & MASK24] & 0xFF) << (index * 8);
  }
  return value >>> 0;
}

function read24(buffer, addr) {
  return readLittle(buffer, addr, 3);
}

function hexBytes(buffer, addr, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push((buffer[(addr + index) & MASK24] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function formatValue(width, value) {
  if (width === 1) return bhex(value);
  if (width === 2) return hex(value, 4);
  return hex(value, 6);
}

function isTrackedRam(addr) {
  return addr >= 0xD00000 && addr < 0xD20000;
}

function in059Range(addr) {
  return Number.isInteger(addr) && addr >= STAT_APP_START && addr < STAT_APP_END;
}

function inHomeWindow(addr) {
  return Number.isInteger(addr) && addr >= HOME_WINDOW_START && addr < HOME_WINDOW_END;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function prepareCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
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

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
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

  return { boot, kernel, postInit };
}

function runMemInit(executor, cpu, mem) {
  prepareCpu(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 4096,
      onBlock(pc) {
        if ((pc & MASK24) === MEMINIT_RET) throw new Error(TRACE_RETURN);
      },
      onMissingBlock(pc) {
        if ((pc & MASK24) === MEMINIT_RET) throw new Error(TRACE_RETURN);
      },
    });
  } catch (error) {
    if (error?.message !== TRACE_RETURN) throw error;
  }
}

function installReadTracer(cpu, mem) {
  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
  };

  const events = [];
  let currentStep = -1;
  let currentPc = null;
  let currentMode = 'adl';

  function setContext(step, pc, mode) {
    currentStep = step;
    currentPc = Number.isInteger(pc) ? (pc & MASK24) : null;
    currentMode = mode ?? 'adl';
  }

  function record(addr, width, value) {
    const normalized = addr & MASK24;
    if (!isTrackedRam(normalized)) return;

    const bytes = [];
    for (let index = 0; index < width; index += 1) {
      bytes.push(mem[(normalized + index) & MASK24] & 0xFF);
    }

    events.push({
      step: currentStep,
      pc: currentPc,
      mode: currentMode,
      addr: normalized,
      width,
      value: value >>> 0,
      bytes,
    });
  }

  cpu.read8 = (addr) => {
    const value = original.read8(addr);
    record(addr, 1, value & 0xFF);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = original.read16(addr);
    record(addr, 2, value & 0xFFFF);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = original.read24(addr);
    record(addr, 3, value & MASK24);
    return value;
  };

  function restore() {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
  }

  return { events, setContext, restore };
}

function groupReadsByStep(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = event.step;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }
  return grouped;
}

function summarizeReads(events) {
  const summary = new Map();

  for (const event of events) {
    const key = event.addr;
    if (!summary.has(key)) {
      summary.set(key, {
        addr: event.addr,
        count: 0,
        widths: new Set(),
        values: new Map(),
        firstStep: event.step,
        lastStep: event.step,
      });
    }

    const entry = summary.get(key);
    entry.count += 1;
    entry.widths.add(event.width);
    entry.firstStep = Math.min(entry.firstStep, event.step);
    entry.lastStep = Math.max(entry.lastStep, event.step);
    entry.values.set(event.value >>> 0, (entry.values.get(event.value >>> 0) ?? 0) + 1);
  }

  return [...summary.values()].sort((left, right) => left.addr - right.addr);
}

function formatReadEvent(event) {
  const byteText = event.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return `${hex(event.addr)} w${event.width} [${byteText}] => ${formatValue(event.width, event.value)}`;
}

function formatReadSummary(entry) {
  const widths = [...entry.widths].sort((left, right) => left - right).join(',');
  const values = [...entry.values.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([value, count]) => `${formatValue(3, value).replace(/^0x00/, '0x')}${count > 1 ? ` x${count}` : ''}`)
    .join(', ');
  return `${hex(entry.addr)} count=${entry.count} widths=[${widths}] steps=${entry.firstStep}-${entry.lastStep} values=[${values}]`;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printInitSummary(init) {
  console.log(`Cold boot: ${init.boot.termination} @ ${hex(init.boot.lastPc)}`);
  console.log(`Kernel init: ${init.kernel.termination} @ ${hex(init.kernel.lastPc)}`);
  console.log(`Post-init: ${init.postInit.termination} @ ${hex(init.postInit.lastPc)}`);
}

function printKeySnapshot(mem, label) {
  console.log(
    `${label}: raw=${bhex(mem[RAW_SCAN_ADDR])} keyCode=${bhex(mem[KEY_CODE_ADDR])} getKy=${bhex(mem[GETKY_ADDR])} getCSC=${bhex(mem[GETCSC_SCAN_ADDR])}`,
  );
}

function printTrace(sequence, events, title) {
  const readsByStep = groupReadsByStep(events);

  printSection(title);

  for (const visit of sequence) {
    const reads = readsByStep.get(visit.step) ?? [];
    const markers = [];
    if (visit.missing) markers.push('missing');
    if (in059Range(visit.pc)) markers.push('059xxx');
    const suffix = markers.length ? ` [${markers.join(', ')}]` : '';
    console.log(`[${String(visit.step).padStart(3, '0')}] ${hex(visit.pc)} (${visit.mode})${suffix}`);
    for (const event of reads) {
      console.log(`      ${formatReadEvent(event)}`);
    }
  }
}

function printReadSummaryTable(events, title) {
  printSection(title);

  const summary = summarizeReads(events);
  if (summary.length === 0) {
    console.log('No D0xxxx/D1xxxx RAM reads captured.');
    return;
  }

  for (const entry of summary) {
    console.log(formatReadSummary(entry));
  }
}

function printFocusSummary(events) {
  const summary = summarizeReads(events);
  const byAddr = new Map(summary.map((entry) => [entry.addr, entry]));

  printSection('Focus Addresses');

  for (const item of FOCUS_ADDRS) {
    const entry = byAddr.get(item.addr);
    if (!entry) {
      console.log(`${item.label} @ ${hex(item.addr)}: not read`);
      continue;
    }
    console.log(`${item.label} @ ${hex(item.addr)}: ${formatReadSummary(entry)}`);
  }

  for (const range of FOCUS_RANGES) {
    const hits = summary
      .filter((entry) => entry.addr >= range.start && entry.addr <= range.end)
      .map((entry) => hex(entry.addr));
    console.log(`${range.label} (${hex(range.start)}..${hex(range.end)}): ${hits.length ? hits.join(', ') : 'no reads'}`);
  }
}

function traceEntry(executor, cpu, mem, {
  entryPc,
  entryMode = 'adl',
  maxSteps,
  stopOnReturnPc = null,
}) {
  const tracer = installReadTracer(cpu, mem);
  const sequence = [];
  let returned = false;
  let limitHit = false;
  let runResult = null;
  let errorMessage = null;

  try {
    runResult = executor.runFrom(entryPc, entryMode, {
      maxSteps: maxSteps + 8,
      maxLoopIterations: LOOP_LIMIT,
      onBlock(pc, mode, _meta, step) {
        if (step >= maxSteps) {
          limitHit = true;
          throw new Error(TRACE_LIMIT);
        }

        const normalized = pc & MASK24;
        tracer.setContext(step, normalized, mode);
        sequence.push({ step, pc: normalized, mode, missing: false });
      },
      onMissingBlock(pc, mode, step) {
        const normalized = pc & MASK24;

        if (stopOnReturnPc !== null && normalized === (stopOnReturnPc & MASK24)) {
          returned = true;
          sequence.push({ step, pc: normalized, mode, missing: true });
          throw new Error(TRACE_RETURN);
        }

        if (step >= maxSteps) {
          limitHit = true;
          throw new Error(TRACE_LIMIT);
        }

        tracer.setContext(step, normalized, mode);
        sequence.push({ step, pc: normalized, mode, missing: true });
      },
    });
  } catch (error) {
    if (![TRACE_LIMIT, TRACE_RETURN].includes(error?.message)) {
      errorMessage = error?.stack ?? String(error);
    }
  } finally {
    tracer.restore();
  }

  return {
    sequence,
    readEvents: tracer.events,
    returned,
    limitHit,
    runResult,
    errorMessage,
  };
}

function analyzePartA() {
  const runtime = createRuntime();
  const { mem, executor, cpu } = runtime;

  const init = coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  prepareCpu(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const trace = traceEntry(executor, cpu, mem, {
    entryPc: HOME_CONTEXT_ENTRY,
    entryMode: 'adl',
    maxSteps: PART_A_STEPS,
    stopOnReturnPc: FAKE_RET,
  });

  return { init, mem, trace };
}

function analyzePartB() {
  const runtime = createRuntime();
  const { mem, executor, cpu } = runtime;

  const init = coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  prepareCpu(cpu, mem);

  mem[KEY_CODE_ADDR] = 0x31;
  mem[GETKY_ADDR] = 0x31;
  cpu._ix = IX_ADDR;
  cpu._iy = IY_ADDR;
  cpu.sp = STACK_TOP;
  cpu.a = 0x00;

  const trace = traceEntry(executor, cpu, mem, {
    entryPc: POST_INIT_ENTRY,
    entryMode: 'adl',
    maxSteps: PART_B_STEPS,
  });

  const first059 = trace.sequence.find((visit) => in059Range(visit.pc)) ?? null;

  return { init, mem, trace, first059 };
}

function dumpTable(base, length) {
  const lines = [];
  for (let offset = 0; offset < length; offset += 16) {
    const addr = base + offset;
    lines.push(`${hex(addr)}: ${hexBytes(rom, addr, Math.min(16, length - offset))}`);
  }
  return lines;
}

function analyzeTableVectors(base, length) {
  const rows = [];

  for (let alignment = 0; alignment < 3; alignment += 1) {
    const entries = [];
    for (let slot = 0; slot < Math.floor((length - alignment) / 3) && slot < 12; slot += 1) {
      const addr = base + alignment + (slot * 3);
      const value = read24(rom, addr);
      const markers = [];
      if (inHomeWindow(value)) markers.push('home');
      if (value === 0x000000) markers.push('zero');
      entries.push({
        slot,
        addr,
        value,
        markers,
      });
    }
    rows.push({ alignment, entries });
  }

  return rows;
}

function printPartA(result) {
  const { init, mem, trace } = result;

  printSection('Part A - Direct 0x0585E9 Entry (A=0x31)');
  printInitSummary(init);
  printKeySnapshot(mem, 'Post-MEM_INIT key RAM before direct entry');
  console.log(`Seeded A=${bhex(0x31)}; SP=${hex(STACK_TOP - 3)} return=${hex(FAKE_RET)}`);
  console.log(`Returned to fake stub: ${trace.returned ? 'yes' : 'no'}`);
  console.log(`Read events captured: ${trace.readEvents.length}`);
  if (trace.errorMessage) console.log(`Trace error: ${trace.errorMessage}`);

  printTrace(trace.sequence, trace.readEvents, 'Part A Step Trace');
  printReadSummaryTable(trace.readEvents, 'Part A Read Summary');
  printFocusSummary(trace.readEvents);
}

function printPartB(result) {
  const { init, mem, trace, first059 } = result;
  const keyReads = trace.readEvents.filter((event) => (
    event.addr === RAW_SCAN_ADDR
    || event.addr === KEY_CODE_ADDR
    || event.addr === GETKY_ADDR
    || event.addr === GETCSC_SCAN_ADDR
  ));

  printSection('Part B - CoorMon/Post-Init Entry (0x0802B2)');
  printInitSummary(init);
  printKeySnapshot(mem, 'Seeded key RAM before CoorMon entry');
  console.log(`Registers: IX=${hex(IX_ADDR)} IY=${hex(IY_ADDR)} SP=${hex(STACK_TOP)}`);
  console.log(`Trace termination: ${trace.runResult?.termination ?? (trace.limitHit ? 'manual_limit' : 'exception')}`);
  console.log(`Last PC: ${hex(trace.runResult?.lastPc ?? trace.sequence.at(-1)?.pc ?? POST_INIT_ENTRY)}`);
  console.log(`Reached 0x059xxx: ${first059 ? `yes, first hit ${hex(first059.pc)} at step ${first059.step}` : 'no'}`);
  console.log(`Read D00587/D0058C/D0058D/D0058E: ${keyReads.length ? 'yes' : 'no'}`);
  if (trace.errorMessage) console.log(`Trace error: ${trace.errorMessage}`);

  printTrace(trace.sequence, trace.readEvents, 'Part B Step Trace');
  printReadSummaryTable(trace.readEvents, 'Part B Read Summary');
  printFocusSummary(trace.readEvents);
}

function printPartC() {
  const dumpLength = 128;
  const vectorViews = analyzeTableVectors(HOME_CONTEXT_TABLE, dumpLength);
  const keySlotAtBase = HOME_CONTEXT_TABLE + (0x31 * 3);
  const keySlotAfterStub = HOME_CONTEXT_TABLE + 1 + (0x31 * 3);

  printSection('Part C - 0x0585D3 Context Table Dump');
  console.log(`Base: ${hex(HOME_CONTEXT_TABLE)} length=${dumpLength} bytes`);

  for (const line of dumpTable(HOME_CONTEXT_TABLE, dumpLength)) {
    console.log(line);
  }

  printSection('Candidate 24-bit Vector Views');
  for (const view of vectorViews) {
    console.log(`Alignment +${view.alignment}:`);
    for (const entry of view.entries) {
      const suffix = entry.markers.length ? ` [${entry.markers.join(', ')}]` : '';
      console.log(`  slot ${String(entry.slot).padStart(2, '0')} @ ${hex(entry.addr)} -> ${hex(entry.value)}${suffix}`);
    }
  }

  printSection('Keycode 0x31 Slot Checks');
  console.log(
    `base + 0x31*3 => ${hex(keySlotAtBase)} bytes=[${hexBytes(rom, keySlotAtBase, 3)}] value=${hex(read24(rom, keySlotAtBase))}`,
  );
  console.log(
    `base+1 + 0x31*3 => ${hex(keySlotAfterStub)} bytes=[${hexBytes(rom, keySlotAfterStub, 3)}] value=${hex(read24(rom, keySlotAfterStub))}`,
  );
  console.log(
    'Interpretation: 0x0585D3 is a jp (hl) stub followed by a short inline run of 24-bit home-window vectors; the first 128 bytes do not resemble a 0x32-entry keycode-indexed table, and the 0x31 stride lands inside ordinary code bytes rather than a clean STAT vector slot.',
  );
}

function main() {
  console.log('=== Phase 189 - STAT dispatch RAM / CoorMon probe ===');

  const partA = analyzePartA();
  const partB = analyzePartB();

  printPartA(partA);
  printPartB(partB);
  printPartC();
}

main();
