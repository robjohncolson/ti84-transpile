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

const BOOT_PC = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const TARGET_ENTRY = 0x08267D;
const TARGET_CLASSIFIER = 0x0821AE;
const TARGET_RECURSE_SITE = 0x0826C4;
const RUN_STEPS = 500;
const RUN_LOOP_LIMIT = 1024;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const FLAG_C = 0x01;
const FLAG_Z = 0x40;

const D005F8 = 0xD005F8;
const D005FF = 0xD005FF;
const VALID_ENTRY_PTR = 0xD3FFF0;

const DESCRIPTOR_BYTES = [0x03, 0x58, 0x59, 0x5A, 0xD0, 0x81, 0x42, 0x7F];
const VALID_ENTRY_BYTES = [
  0xC1, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
  0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xF0, 0x0F,
];

const WATCH_RANGES = [
  { label: 'D005xx', start: 0xD00500, end: 0xD005FF },
  { label: 'D025xx', start: 0xD02500, end: 0xD025FF },
  { label: 'D3Fxxx', start: 0xD3F000, end: 0xD3FFFF },
];

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function up(name) {
  return name === '(hl)' ? '(HL)' : String(name).toUpperCase();
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function readWidth(mem, addr, width) {
  if (width === 1) return mem[addr & MEM_MASK] ?? 0;
  if (width === 2) {
    const base = addr & MEM_MASK;
    return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
  }
  return read24(mem, addr);
}

function bytesAt(mem, addr, count) {
  return Array.from({ length: count }, (_, index) => mem[(addr + index) & MEM_MASK] ?? 0);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) cpu[field] = snapshot[field];
}

function snapshotRuntime(cpu, mem) {
  return { cpu: snapshotCpu(cpu), memory: new Uint8Array(mem) };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase277-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function formatDecoded(inst) {
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${up(inst.pair)}`;
    case 'pop': return `POP ${up(inst.pair)}`;
    case 'ld-pair-imm': return `LD ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${up(inst.pair)}`
        : `LD ${up(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-reg-mem': return `LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-reg-ind': return `LD ${up(inst.dest)}, (${up(inst.src)})`;
    case 'ld-ind-reg': return `LD (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-reg-reg': return `LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-imm': return `LD ${up(inst.dest)}, ${hexByte(inst.value)}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${up(inst.src)}`;
    case 'add-pair': return `ADD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'sbc-pair': return `SBC HL, ${up(inst.src)}`;
    case 'inc-pair': return `INC ${up(inst.pair)}`;
    case 'dec-pair': return `DEC ${up(inst.pair)}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'bit-test': return 'BIT ...';
    case 'lddr': return 'LDDR';
    case 'ldd': return 'LDD';
    case 'cpl': return 'CPL';
    case 'nop': return 'NOP';
    default: return inst.tag ?? 'UNKNOWN';
  }
}

function disassembleRange(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    const bytes = rom.subarray(pc, pc + length);
    rows.push({
      pc,
      bytes,
      text: inst ? formatDecoded(inst) : `DB ${hexByte(rom[pc])}`,
    });
    pc += length;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${formatBytes(row.bytes).padEnd(19)}  ${row.text}`);
  }
  console.log('');
}

function overlapsRange(addr, width, start, end) {
  const normalized = addr & 0xFFFFFF;
  const last = (normalized + width - 1) & 0xFFFFFF;
  if (normalized <= last) return last >= start && normalized <= end;
  return normalized <= end || last >= start;
}

function labelsFor(addr, width) {
  return WATCH_RANGES.filter((range) => overlapsRange(addr, width, range.start, range.end)).map((range) => range.label);
}

function captureRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    c: !!(cpu.f & FLAG_C),
    z: !!(cpu.f & FLAG_Z),
  };
}

function formatRegs(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `C=${regs.c ? 1 : 0}`,
    `Z=${regs.z ? 1 : 0}`,
  ].join(' ');
}

function installWriteTracer(cpu, mem, state) {
  const writes = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, addr, width, afterValue) {
    const labels = labelsFor(addr, width);
    if (labels.length === 0) return;
    writes.push({
      kind,
      step: state.step,
      blockPc: state.blockPc,
      addr: addr & 0xFFFFFF,
      width,
      beforeValue: readWidth(mem, addr, width),
      afterValue: afterValue >>> 0,
      labels,
    });
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
    writes,
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function seedExperiment(cpu, mem, experiment) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  cpu.a = 0x00;
  cpu.f = experiment.carry ? FLAG_C : 0x00;
  cpu.bc = 0x000000;
  cpu.de = experiment.de & 0xFFFFFF;
  cpu.hl = experiment.de & 0xFFFFFF;

  for (let index = 0; index <= (D005FF - D005F8); index += 1) {
    mem[(D005F8 + index) & MEM_MASK] = DESCRIPTOR_BYTES[index] & 0xFF;
  }
  for (let index = 0; index < VALID_ENTRY_BYTES.length; index += 1) {
    mem[(VALID_ENTRY_PTR + index) & MEM_MASK] = VALID_ENTRY_BYTES[index] & 0xFF;
  }
}

function normalizeTermination(result) {
  if (result.termination === 'missing_block' && ((result.lastPc ?? 0) & 0xFFFFFF) === RETURN_SENTINEL) {
    return 'returned-to-sentinel';
  }
  return result.termination;
}

function annotateCalls(calls, steps, result) {
  const lastNextPc = (result.lastPc ?? 0) & 0xFFFFFF;
  for (const call of calls) {
    const nextPc = call.step + 1 < steps.length ? steps[call.step + 1].pc : lastNextPc;
    if (call.kind === 'call') {
      call.taken = nextPc === call.target;
    } else if (call.kind === 'call-conditional') {
      if (nextPc === call.target) call.taken = true;
      else if (nextPc === call.fallthrough) call.taken = false;
      else call.taken = null;
    }
  }
}

function runExperiment(executor, cpu, mem, baseline, experiment) {
  restoreRuntime(cpu, mem, baseline);
  seedExperiment(cpu, mem, experiment);

  const state = { step: 0, blockPc: TARGET_ENTRY };
  const tracer = installWriteTracer(cpu, mem, state);
  const steps = [];
  const uniqueBlocks = [];
  const seen = new Set();
  const calls = [];

  let result;
  try {
    result = executor.runFrom(TARGET_ENTRY, 'adl', {
      maxSteps: RUN_STEPS,
      maxLoopIterations: RUN_LOOP_LIMIT,
      onBlock(pc, mode, meta, step) {
        state.step = step;
        state.blockPc = pc & 0xFFFFFF;

        const instructions = (meta?.instructions ?? []).map((inst) => ({
          pc: inst.pc & 0xFFFFFF,
          tag: inst.tag,
          dasm: inst.dasm,
          target: Number.isInteger(inst.target) ? (inst.target & 0xFFFFFF) : null,
          condition: inst.condition ?? null,
          fallthrough: Number.isInteger(inst.fallthrough) ? (inst.fallthrough & 0xFFFFFF) : null,
        }));

        steps.push({
          step,
          pc: pc & 0xFFFFFF,
          mode,
          regs: captureRegs(cpu),
          instructions,
        });

        const key = `${hex(pc)}:${mode}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueBlocks.push(key);
        }

        for (const inst of instructions) {
          if (inst.tag !== 'call' && inst.tag !== 'call-conditional') continue;
          calls.push({
            step,
            pc: inst.pc,
            kind: inst.tag,
            dasm: inst.dasm,
            target: inst.target,
            condition: inst.condition,
            fallthrough: inst.fallthrough,
            taken: null,
          });
        }
      },
    });
  } finally {
    tracer.restore();
  }

  annotateCalls(calls, steps, result);

  return {
    ...experiment,
    result,
    termination: normalizeTermination(result),
    steps,
    uniqueBlocks,
    calls,
    writes: tracer.writes,
    finalRegs: captureRegs(cpu),
    finalDescriptor: bytesAt(mem, D005F8, DESCRIPTOR_BYTES.length),
    finalEntry: bytesAt(mem, VALID_ENTRY_PTR, VALID_ENTRY_BYTES.length),
  };
}

function formatWrite(event) {
  const digits = Math.max(2, event.width * 2);
  return [
    `step=${String(event.step).padStart(3, ' ')}`,
    `block=${hex(event.blockPc)}`,
    `${event.kind}@${hex(event.addr)}`,
    `[${event.labels.join(', ')}]`,
    `${hex(event.beforeValue, digits)}->${hex(event.afterValue, digits)}`,
  ].join(' ');
}

function formatCall(call) {
  const status = call.taken === true ? 'taken' : call.taken === false ? 'not-taken' : 'unknown';
  return `step=${String(call.step).padStart(3, ' ')} ${hex(call.pc)} ${call.dasm} [${status}]`;
}

function printExperimentReport(summary) {
  console.log(`=== ${summary.name} ===`);
  console.log(`Seed: DE=${hex(summary.de)} HL=${hex(summary.de)} carry=${summary.carry ? 'set' : 'clear'}`);
  console.log(
    `Result: termination=${summary.termination} raw=${summary.result.termination} steps=${summary.result.steps} `
    + `lastPc=${hex(summary.result.lastPc)}:${summary.result.lastMode}`
  );
  console.log(`Returned to sentinel: ${summary.termination === 'returned-to-sentinel' ? 'yes' : 'no'}`);
  console.log(`Unique blocks (${summary.uniqueBlocks.length}): ${summary.uniqueBlocks.join(' -> ') || '(none)'}`);

  console.log('Calls observed:');
  if (summary.calls.length === 0) console.log('  (none)');
  else for (const call of summary.calls) console.log(`  ${formatCall(call)}`);

  console.log('RAM writes in watched ranges:');
  if (summary.writes.length === 0) console.log('  (none)');
  else for (const event of summary.writes) console.log(`  ${formatWrite(event)}`);

  console.log('Register evolution:');
  if (summary.steps.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of summary.steps) {
      const instructionText = row.instructions.map((inst) => inst.dasm).join(' | ') || '(no instructions)';
      console.log(
        `  step=${String(row.step).padStart(3, ' ')} pc=${hex(row.pc)}:${row.mode} `
        + `${formatRegs(row.regs)} :: ${instructionText}`
      );
    }
  }

  console.log(`Final regs: ${formatRegs(summary.finalRegs)}`);
  console.log(`Final D005F8-D005FF: ${formatBytes(summary.finalDescriptor)}`);
  console.log(`Final ${hex(VALID_ENTRY_PTR)}..${hex(VALID_ENTRY_PTR + VALID_ENTRY_BYTES.length - 1)}: ${formatBytes(summary.finalEntry)}`);
  console.log('');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log('=== Phase 277: Trace 0x08267D (CALL NC target after 0x0846EA) ===');
    console.log(`ROM=${ROM_PATH}`);
    console.log(`Boot=${hex(BOOT_PC)}:${BOOT_MODE} steps=${BOOT_STEPS} timerInterrupt=false`);
    console.log(`Target=${hex(TARGET_ENTRY)} ADL maxSteps=${RUN_STEPS}`);
    console.log(`Seed descriptor D005F8-D005FF: ${formatBytes(DESCRIPTOR_BYTES)}`);
    console.log(`Seed valid entry ${hex(VALID_ENTRY_PTR)}..${hex(VALID_ENTRY_PTR + VALID_ENTRY_BYTES.length - 1)}: ${formatBytes(VALID_ENTRY_BYTES)}`);
    console.log('');

    printDisassembly(
      `Static ADL Window ${hex(TARGET_CLASSIFIER)}..${hex(TARGET_CLASSIFIER + 0x10)}`,
      disassembleRange(rom, TARGET_CLASSIFIER, TARGET_CLASSIFIER + 0x10),
    );
    printDisassembly(
      `Static ADL Window ${hex(TARGET_ENTRY)}..${hex(TARGET_RECURSE_SITE + 0x10)}`,
      disassembleRange(rom, TARGET_ENTRY, TARGET_RECURSE_SITE + 0x10),
    );

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const executor = createExecutor(blocks, mem, {
      peripherals: createPeripheralBus({ timerInterrupt: false }),
    });
    const cpu = executor.cpu;

    const bootResult = executor.runFrom(BOOT_PC, BOOT_MODE, {
      maxSteps: BOOT_STEPS,
      maxLoopIterations: BOOT_LOOP_LIMIT,
    });
    const baseline = snapshotRuntime(cpu, mem);

    console.log('=== Boot Snapshot ===');
    console.log(
      `termination=${bootResult.termination} steps=${bootResult.steps} `
      + `lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode} halted=${bootResult.halted ? 'yes' : 'no'}`
    );
    console.log('');

    const experiments = [
      { name: 'Exp A - DE valid pointer, carry clear', de: VALID_ENTRY_PTR, carry: false },
      { name: 'Exp B - DE null pointer, carry clear', de: 0x000000, carry: false },
      { name: 'Exp C - DE valid pointer, carry set', de: VALID_ENTRY_PTR, carry: true },
    ];

    const summaries = experiments.map((experiment) => runExperiment(executor, cpu, mem, baseline, experiment));
    for (const summary of summaries) printExperimentReport(summary);

    console.log('=== Summary ===');
    const compact = summaries.map((summary) => ({
      name: summary.name,
      de: hex(summary.de),
      carry: summary.carry ? 'set' : 'clear',
      termination: summary.termination,
      steps: summary.result.steps,
      lastPc: hex(summary.result.lastPc),
      uniqueBlocks: summary.uniqueBlocks,
      calls: summary.calls.map((call) => ({
        step: call.step,
        pc: hex(call.pc),
        dasm: call.dasm,
        taken: call.taken,
      })),
      writeCount: summary.writes.length,
      finalRegs: {
        a: hexByte(summary.finalRegs.a),
        f: hexByte(summary.finalRegs.f),
        bc: hex(summary.finalRegs.bc),
        de: hex(summary.finalRegs.de),
        hl: hex(summary.finalRegs.hl),
        sp: hex(summary.finalRegs.sp),
      },
    }));
    console.log(JSON.stringify({ phase: 277, target: hex(TARGET_ENTRY), experiments: compact }, null, 2));
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
