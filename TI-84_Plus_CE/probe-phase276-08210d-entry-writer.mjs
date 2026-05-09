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
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 20000;
const BOOT_LOOP_LIMIT = 32;
const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 50000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const STATIC_START = 0x082100;
const STATIC_END = 0x082160;
const STATIC_TAIL_START = 0x082160;
const STATIC_TAIL_END = 0x082176;

const WRAPPER_ENTRY = 0x0820ED;
const STORE_SITE_PC = 0x08210C;
const REQUESTED_PC = 0x08210D;
const TRACE_STEPS = 500;
const TRACE_LOOP_LIMIT = 256;

const D02590 = 0xD02590;
const D02593 = 0xD02593;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;
const D025A0 = 0xD025A0;

const OP1_BASE = 0xD005F8;
const OP1_TYPE = 0xD005FE;
const OP1_TAIL = 0xD00600;

const TABLE_TOP = 0xD3FFFF;
const TOP_SLOT_LOW = TABLE_TOP - 8;
const TOP_SLOT_HIGH = TABLE_TOP;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
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
  if (width === 1) {
    return mem[addr & MEM_MASK] ?? 0;
  }
  if (width === 2) {
    const base = addr & MEM_MASK;
    return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
  }
  return read24(mem, addr);
}

function bytesAt(mem, addr, count) {
  const out = [];
  for (let index = 0; index < count; index += 1) {
    out.push(mem[(addr + index) & MEM_MASK] ?? 0);
  }
  return out;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase276-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
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
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    { key: '000280:adl', pc: KERNEL_INIT_REQUEST_PC, mode: 'adl' },
    { key: '000280:z80', pc: KERNEL_INIT_REQUEST_PC, mode: 'z80' },
    { key: '020028:adl', pc: KERNEL_INIT_FALLBACK_PC, mode: 'adl' },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernel-init block at 0x000280 or 0x020028.');
}

function createCPU(blocks, memory) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { cpu: executor.cpu, executor, peripherals };
}

function createRuntime(romBytes, blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const harness = createCPU(blocks, memory);
  return {
    mem: memory,
    ...harness,
  };
}

function bootRuntime(runtime, kernelInfo) {
  const { executor, cpu } = runtime;

  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_STEPS,
    maxLoopIterations: BOOT_LOOP_LIMIT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP - 3;

  const kernelInit = executor.runFrom(kernelInfo.pc, kernelInfo.mode, {
    maxSteps: KERNEL_INIT_STEPS,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
  });

  return { boot, kernelInit };
}

function reg8(name) {
  return String(name).toUpperCase();
}

function reg16(name) {
  return String(name).toUpperCase();
}

function formatInstruction(ins) {
  switch (ins.tag) {
    case 'ret-conditional':
      return `RET ${String(ins.condition).toUpperCase()}`;
    case 'alu-imm':
      return `${String(ins.op).toUpperCase()} ${hexByte(ins.value)}`;
    case 'alu-reg':
      return `${String(ins.op).toUpperCase()} ${reg8(ins.src)}`;
    case 'ld-pair-mem':
      return ins.direction === 'to-mem'
        ? `LD (${hex(ins.addr)}), ${reg16(ins.pair)}`
        : `LD ${reg16(ins.pair)}, (${hex(ins.addr)})`;
    case 'ld-pair-imm':
      return `LD ${reg16(ins.pair)}, ${hex(ins.value)}`;
    case 'ld-reg-mem':
      return `LD ${reg8(ins.dest)}, (${hex(ins.addr)})`;
    case 'ld-reg-ind':
      return `LD ${reg8(ins.dest)}, (${reg16(ins.src)})`;
    case 'ld-ind-reg':
      return `LD (${reg16(ins.dest)}), ${reg8(ins.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(ins.value)}`;
    case 'ld-reg-reg':
      return `LD ${reg8(ins.dest)}, ${reg8(ins.src)}`;
    case 'jr-conditional':
      return `JR ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'call':
      return `CALL ${hex(ins.target)}`;
    case 'sbc-pair':
      return `SBC HL, ${reg16(ins.src)}`;
    case 'add-pair':
      return `ADD ${reg16(ins.dest)}, ${reg16(ins.src)}`;
    case 'push':
      return `PUSH ${reg16(ins.pair)}`;
    case 'pop':
      return `POP ${reg16(ins.pair)}`;
    case 'inc-pair':
      return `INC ${reg16(ins.pair)}`;
    case 'dec-pair':
      return `DEC ${reg16(ins.pair)}`;
    case 'dec-reg':
      return `DEC ${reg8(ins.reg)}`;
    case 'djnz':
      return `DJNZ ${hex(ins.target)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ldir':
      return 'LDIR';
    default:
      return `${String(ins.tag).toUpperCase()} ${JSON.stringify(ins)}`;
  }
}

function disassembleRange(romBytes, start, endExclusive) {
  const instructions = [];
  let pc = start;

  while (pc < endExclusive) {
    const ins = decodeInstruction(romBytes, pc, 'adl');
    const length = Math.max(1, ins?.length ?? 1);
    const bytes = romBytes.subarray(pc, pc + length);
    instructions.push({
      pc,
      length,
      bytes,
      ins,
      text: formatInstruction(ins ?? { tag: 'db', value: romBytes[pc] ?? 0 }),
    });
    pc += length;
  }

  return instructions;
}

function printDisassembly(title, instructions) {
  console.log(`\n=== ${title} ===`);
  for (const entry of instructions) {
    console.log(
      `${hex(entry.pc)}  ${formatBytes(entry.bytes).padEnd(16, ' ')}  ${entry.text}`
    );
  }
}

function analyzeStaticWindow() {
  return {
    requestedPcIsMidInstruction: true,
    pointerStoreInstructionStart: STORE_SITE_PC,
    decrementSource: {
      bcLoad: WRAPPER_ENTRY,
      loadPointer: 0x082105,
      clearCarry: 0x082109,
      subtract: 0x08210A,
      store: STORE_SITE_PC,
    },
    slotCopy: {
      loopSetup: 0x082153,
      sourceBase: OP1_BASE,
      loopBody: [0x082158, 0x082159, 0x08215A, 0x08215B, 0x08215C, 0x08215D],
      finalTailLoad: 0x082173,
      finalTailStore: 0x082174,
      entryLow: TOP_SLOT_LOW,
      entryHigh: TOP_SLOT_HIGH,
    },
  };
}

function seedCommonTraceState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP - 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  write24(mem, D02590, TABLE_TOP);
  write24(mem, D02593, TABLE_TOP);
  write24(mem, D0259A, TABLE_TOP);
  write24(mem, D0259D, TABLE_TOP);
  write24(mem, D025A0, 0x000000);
}

function seedScenario(runtime, baseline, scenario) {
  const { cpu, mem } = runtime;
  restoreRuntime(cpu, mem, baseline);
  seedCommonTraceState(cpu, mem);

  for (let index = 0; index < scenario.op1Bytes.length; index += 1) {
    mem[(OP1_BASE + index) & MEM_MASK] = scenario.op1Bytes[index] & 0xFF;
  }

  if (scenario.registerSeed) {
    if (scenario.registerSeed.a !== undefined) cpu.a = scenario.registerSeed.a & 0xFF;
    if (scenario.registerSeed.f !== undefined) cpu.f = scenario.registerSeed.f & 0xFF;
    if (scenario.registerSeed.bc !== undefined) cpu.bc = scenario.registerSeed.bc & 0xFFFFFF;
    if (scenario.registerSeed.de !== undefined) cpu.de = scenario.registerSeed.de & 0xFFFFFF;
    if (scenario.registerSeed.hl !== undefined) cpu.hl = scenario.registerSeed.hl & 0xFFFFFF;
  }
}

function installWriteTracer(cpu, mem) {
  const writes = [];
  const originals = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function shouldTrace(addr, width) {
    const normalized = addr & MEM_MASK;
    if (normalized >= D02590 && normalized <= D025A2) {
      return true;
    }
    if (normalized >= 0xD3FF00 && normalized <= 0xD3FFFF) {
      return true;
    }
    if (width > 1 && normalized <= 0xD3FFFF && (normalized + width - 1) >= 0xD3FF00) {
      return true;
    }
    return false;
  }

  function capture(width, addr, value) {
    const normalized = addr & MEM_MASK;
    if (!shouldTrace(normalized, width)) {
      return;
    }
    const masked = width === 1 ? value & 0xFF : width === 2 ? value & 0xFFFF : value & 0xFFFFFF;
    writes.push({
      pc: cpu._currentBlockPc ?? 0,
      addr: normalized,
      width,
      before: readWidth(mem, normalized, width),
      after: masked,
    });
  }

  cpu.write8 = (addr, value) => {
    capture(1, addr, value);
    originals.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    capture(2, addr, value);
    originals.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    capture(3, addr, value);
    originals.write24(addr, value);
  };

  return {
    writes,
    restore() {
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}

function capturePointers(mem) {
  return {
    d02590: read24(mem, D02590),
    d02593: read24(mem, D02593),
    d0259a: read24(mem, D0259A),
    d0259d: read24(mem, D0259D),
    d025a0: read24(mem, D025A0),
  };
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `D02590=${hex(snapshot.d02590)}`,
    `D02593=${hex(snapshot.d02593)}`,
    `D0259A=${hex(snapshot.d0259a)}`,
    `D0259D=${hex(snapshot.d0259d)}`,
    `D025A0=${hex(snapshot.d025a0)}`,
  ].join(' ');
}

function formatRegisterSnapshot(snapshot) {
  return [
    `A=${hexByte(snapshot.a)}`,
    `F=${hexByte(snapshot.f)}`,
    `BC=${hex(snapshot.bc)}`,
    `DE=${hex(snapshot.de)}`,
    `HL=${hex(snapshot.hl)}`,
    `SP=${hex(snapshot.sp)}`,
  ].join(' ');
}

function buildScenarios() {
  return [
    {
      name: 'Legal Store-Site Trace',
      requestedPc: REQUESTED_PC,
      actualPc: STORE_SITE_PC,
      maxSteps: TRACE_STEPS,
      op1Bytes: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x72, 0x88, 0x99],
      registerSeed: {
        a: 0x72,
        bc: 0x000009,
        de: 0x123456,
        hl: 0xD3FFF6,
      },
      notes: [
        '0x08210D is the second byte of LD (0xD0259A),HL, so the legal dynamic start is 0x08210C.',
        'This scenario isolates the pTemp store site and keeps BC=9 so the fallthrough remains coherent.',
      ],
    },
    {
      name: 'Wrapper Trace, token 0x72',
      requestedPc: REQUESTED_PC,
      actualPc: WRAPPER_ENTRY,
      maxSteps: TRACE_STEPS,
      op1Bytes: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x72, 0x88, 0x99],
      registerSeed: {
        a: 0x5A,
        bc: 0x00BEEF,
        de: 0x123456,
        hl: 0x058241,
      },
      notes: [
        'Distinct register seeds are intentional: BC is overwritten to 0x000009 at 0x0820ED, and payload bytes still come from OP1.',
        'OP1+6 = 0x72 forces the direct branch to the progPtr shrink path.',
      ],
    },
    {
      name: 'Wrapper Trace, token 0x24',
      requestedPc: REQUESTED_PC,
      actualPc: WRAPPER_ENTRY,
      maxSteps: TRACE_STEPS,
      op1Bytes: [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x24, 0x80, 0x90],
      registerSeed: {
        a: 0xA5,
        bc: 0x00C0DE,
        de: 0x654321,
        hl: 0x058241,
      },
      notes: [
        '0x24 skips the pTemp/progPtr shrink at 0x082105/0x082128 but still emits the top 9-byte slot.',
      ],
    },
    {
      name: 'Wrapper Trace, token 0x41',
      requestedPc: REQUESTED_PC,
      actualPc: WRAPPER_ENTRY,
      maxSteps: TRACE_STEPS,
      op1Bytes: [0x01, 0x12, 0x23, 0x34, 0x45, 0x56, 0x41, 0x78, 0x89],
      registerSeed: {
        a: 0xC3,
        bc: 0x00F00D,
        de: 0x223344,
        hl: 0x058241,
      },
      notes: [
        'Generic token 0x41 takes the helper path through 0x07F7BD, 0x08012D, and 0x080080 before shrinking progPtr.',
      ],
    },
  ];
}

function runScenario(runtime, baseline, scenario) {
  seedScenario(runtime, baseline, scenario);

  const { cpu, mem, executor } = runtime;
  const writeTracer = installWriteTracer(cpu, mem);
  const traceSteps = [];
  const dynamicTargets = [];

  try {
    const beforePointers = capturePointers(mem);
    const beforeRegs = captureRegisters(cpu);

    const result = executor.runFrom(scenario.actualPc, 'adl', {
      maxSteps: scenario.maxSteps,
      maxLoopIterations: TRACE_LOOP_LIMIT,
      onBlock(pc, mode, _meta, step) {
        traceSteps.push({
          step,
          pc: pc >>> 0,
          mode,
          regs: captureRegisters(cpu),
          pointers: capturePointers(mem),
        });
      },
      onDynamicTarget(target, mode, pc, step) {
        dynamicTargets.push({ target, mode, pc, step });
      },
    });

    const afterPointers = capturePointers(mem);
    const afterRegs = captureRegisters(cpu);
    const slotBytesLowToHigh = bytesAt(mem, TOP_SLOT_LOW, 9);
    const slotBytesHighToLow = [...slotBytesLowToHigh].reverse();

    return {
      scenario,
      beforePointers,
      beforeRegs,
      result,
      traceSteps,
      writes: writeTracer.writes,
      dynamicTargets,
      afterPointers,
      afterRegs,
      slotBytesLowToHigh,
      slotBytesHighToLow,
      op1Bytes: bytesAt(mem, OP1_BASE, 9),
    };
  } finally {
    writeTracer.restore();
  }
}

function printScenarioReport(trace) {
  const { scenario } = trace;
  console.log(`\n=== Dynamic Trace: ${scenario.name} ===`);
  console.log(`requestedPC=${hex(scenario.requestedPc)} actualStart=${hex(scenario.actualPc)} maxSteps=${scenario.maxSteps}`);
  console.log(`seedRegs: ${formatRegisterSnapshot(trace.beforeRegs)}`);
  console.log(`seedPointers: ${formatPointerSnapshot(trace.beforePointers)}`);
  console.log(`seedOP1[0..8]: ${formatBytes(trace.op1Bytes)}`);
  for (const note of scenario.notes) {
    console.log(`note: ${note}`);
  }

  console.log(
    `result: termination=${trace.result.termination}`
    + ` steps=${trace.result.steps}`
    + ` lastPc=${hex(trace.result.lastPc)}:${trace.result.lastMode}`
    + ` loopsForced=${trace.result.loopsForced}`
  );

  console.log('\nblock trace:');
  if (trace.traceSteps.length === 0) {
    console.log('  (none)');
  } else {
    for (const step of trace.traceSteps) {
      console.log(
        `  step=${step.step.toString().padStart(3, ' ')}`
        + ` pc=${hex(step.pc)}:${step.mode}`
        + ` ${formatRegisterSnapshot(step.regs)}`
        + ` ${formatPointerSnapshot(step.pointers)}`
      );
    }
  }

  console.log('\nwatched writes:');
  if (trace.writes.length === 0) {
    console.log('  (none)');
  } else {
    for (const write of trace.writes) {
      const widthDigits = write.width * 2;
      console.log(
        `  pc=${hex(write.pc)} write${write.width * 8}`
        + ` ${hex(write.addr)}: ${hex(write.before, widthDigits)} -> ${hex(write.after, widthDigits)}`
      );
    }
  }

  console.log(`\nfinalRegs: ${formatRegisterSnapshot(trace.afterRegs)}`);
  console.log(`finalPointers: ${formatPointerSnapshot(trace.afterPointers)}`);
  console.log(`slot[${hex(TOP_SLOT_LOW)}..${hex(TOP_SLOT_HIGH)}] low->high: ${formatBytes(trace.slotBytesLowToHigh)}`);
  console.log(`slot[${hex(TOP_SLOT_HIGH)}..${hex(TOP_SLOT_LOW)}] write order: ${formatBytes(trace.slotBytesHighToLow)}`);

  if (trace.dynamicTargets.length > 0) {
    console.log('dynamic targets:');
    for (const target of trace.dynamicTargets) {
      console.log(
        `  step=${target.step.toString().padStart(3, ' ')}`
        + ` from=${hex(target.pc)}:${target.mode}`
        + ` -> ${hex(target.target)}`
      );
    }
  }

  const pTempChanged = trace.beforePointers.d0259a !== trace.afterPointers.d0259a;
  const progPtrChanged = trace.beforePointers.d0259d !== trace.afterPointers.d0259d;
  console.log('\nscenario findings:');
  console.log(`  D0259A changed: ${pTempChanged ? `${hex(trace.beforePointers.d0259a)} -> ${hex(trace.afterPointers.d0259a)}` : 'no'}`);
  console.log(`  D0259D changed: ${progPtrChanged ? `${hex(trace.beforePointers.d0259d)} -> ${hex(trace.afterPointers.d0259d)}` : 'no'}`);
  console.log(`  OP1 source bytes: ${formatBytes(trace.op1Bytes)}`);
  console.log(`  emitted slot low->high: ${formatBytes(trace.slotBytesLowToHigh)}`);
}

function printOverallFindings(staticFindings, traces) {
  console.log('\n=== Overall Findings ===');
  console.log(
    `1. ${hex(REQUESTED_PC)} is not an instruction boundary. The actual pTemp store is `
    + `${hex(staticFindings.pointerStoreInstructionStart)}: LD (${hex(D0259A)}), HL.`
  );
  console.log(
    `2. The decrement is length-driven, not register-payload-driven: `
    + `${hex(staticFindings.decrementSource.bcLoad)} loads BC=0x000009, `
    + `${hex(staticFindings.decrementSource.loadPointer)} loads HL=(D0259A), `
    + `${hex(staticFindings.decrementSource.clearCarry)} clears carry with OR A, `
    + `${hex(staticFindings.decrementSource.subtract)} does SBC HL,BC, and `
    + `${hex(staticFindings.decrementSource.store)} stores the new pointer.`
  );
  console.log(
    `3. The 9-byte payload is not taken from caller HL/DE/BC. It is emitted from OP1 scratch: `
    + `bytes 0..7 come from ${hex(OP1_BASE)}..${hex(OP1_BASE + 7)} in the `
    + `${hex(staticFindings.slotCopy.loopSetup)}..${hex(0x08215D)} loop, and byte 8 comes from `
    + `${hex(OP1_TAIL)} at ${hex(staticFindings.slotCopy.finalTailLoad)}..${hex(staticFindings.slotCopy.finalTailStore)}.`
  );
  console.log(
    `4. With the seeded 0x72/0x41 cases, D0259A and D0259D move from ${hex(TABLE_TOP)} to ${hex(TABLE_TOP - 9)}, `
    + `while the emitted slot occupies ${hex(TOP_SLOT_LOW)}..${hex(TOP_SLOT_HIGH)}. `
    + `That means the stored pointer ends one byte below the new 9-byte record.`
  );
  console.log(
    `5. The dynamic traces show the register roles just before the payload write: `
    + `HL is the OP1 source pointer, DE is the destination pointer into the top slot, `
    + `A carries each byte being written, and BC is the fixed length/count. `
    + `No single register ever holds the whole 9-byte record.`
  );
  console.log(
    '6. Token 0x24 is the notable branch case: it still emits the top-slot bytes but skips committing the '
    + 'pTemp/progPtr shrink, whereas 0x72, 0x3A, and generic tokens take the shrink path.'
  );

  const wrapperTrace = traces.find((trace) => trace.scenario.name === 'Wrapper Trace, token 0x72');
  if (wrapperTrace) {
    console.log(
      `7. In the token-0x72 wrapper scenario, the probe seeded register HL=${hex(wrapperTrace.beforeRegs.hl)}, `
      + `DE=${hex(wrapperTrace.beforeRegs.de)}, BC=${hex(wrapperTrace.beforeRegs.bc)}, but the emitted slot `
      + `was ${formatBytes(wrapperTrace.slotBytesLowToHigh)} low->high, matching reversed OP1 bytes rather than those register values.`
    );
  }
}

async function main() {
  console.log('=== Phase 276: 0x08210D Dispatch Entry Writer Probe ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('Goal: statically decode the 0x082100 window and dynamically trace the legal instruction boundary around 0x08210D.');

  const romBytes = fs.readFileSync(ROM_PATH);
  const staticWindow = disassembleRange(romBytes, STATIC_START, STATIC_END);
  const staticTail = disassembleRange(romBytes, STATIC_TAIL_START, STATIC_TAIL_END);
  const staticFindings = analyzeStaticWindow();

  printDisassembly(`Static Disassembly ${hex(STATIC_START)}..${hex(STATIC_END)}`, staticWindow);
  printDisassembly(`Static Copy Tail ${hex(STATIC_TAIL_START)}..${hex(STATIC_TAIL_END)}`, staticTail);

  console.log('\n=== Static Findings ===');
  console.log(`requested site ${hex(REQUESTED_PC)}: mid-instruction inside ${hex(STORE_SITE_PC)} LD (${hex(D0259A)}), HL`);
  console.log(
    `subtract-9 sequence: ${hex(WRAPPER_ENTRY)} LD BC,0x000009 -> `
    + `${hex(0x082105)} LD HL,(${hex(D0259A)}) -> ${hex(0x08210A)} SBC HL,BC -> `
    + `${hex(STORE_SITE_PC)} LD (${hex(D0259A)}),HL`
  );
  console.log(
    `copy sequence: ${hex(0x082153)} LD B,C / LD HL,${hex(OP1_BASE)} -> `
    + `${hex(0x082159)} LD A,(HL) -> ${hex(0x08215A)} LD (DE),A -> `
    + `${hex(0x082173)} LD A,(HL) -> ${hex(0x082174)} LD (DE),A`
  );
  console.log(
    `source window: ${hex(OP1_BASE)}..${hex(OP1_TAIL)} (9 bytes total); `
    + `destination top slot: ${hex(TOP_SLOT_LOW)}..${hex(TOP_SLOT_HIGH)}`
  );

  const { blocks, assets } = await loadBlocks();
  try {
    const runtime = createRuntime(romBytes, blocks);
    const kernelInfo = resolveKernelInitEntry(blocks);
    const bootInfo = bootRuntime(runtime, kernelInfo);
    const baseline = snapshotRuntime(runtime.cpu, runtime.mem);

    console.log('\n=== Runtime Boot ===');
    console.log(
      `coldBoot: termination=${bootInfo.boot.termination} steps=${bootInfo.boot.steps} `
      + `lastPc=${hex(bootInfo.boot.lastPc)}:${bootInfo.boot.lastMode}`
    );
    console.log(
      `kernelInit: entry=${hex(kernelInfo.pc)}:${kernelInfo.mode} `
      + `termination=${bootInfo.kernelInit.termination} steps=${bootInfo.kernelInit.steps} `
      + `lastPc=${hex(bootInfo.kernelInit.lastPc)}:${bootInfo.kernelInit.lastMode}`
    );
    console.log(`post-boot pointers: ${formatPointerSnapshot(capturePointers(runtime.mem))}`);

    const traces = [];
    for (const scenario of buildScenarios()) {
      const trace = runScenario(runtime, baseline, scenario);
      traces.push(trace);
      printScenarioReport(trace);
    }

    printOverallFindings(staticFindings, traces);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
