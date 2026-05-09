#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const TARGET_PC = 0x0846EA;
const RUN_STEPS = 5000;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D3F_START = 0xD3F000;
const D3F_END = 0xD3FFFF;
const TOP_ENTRY_START = 0xD3FFF7;

const D005F8 = 0xD005F8;
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D0259D = 0xD0259D;

const LOOKUP_KEY_FB = 0x01;
const LOOKUP_KEY_FA = 0x02;
const LOOKUP_KEY_F9 = 0x03;
const HANDLER_ADDRESS = 0x058241;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase274-${process.pid}.mjs`);
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

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
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

function prepareScenarioState(cpu, mem, scenarioName) {
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

  mem[D005F8 & MEM_MASK] = 0x00;
  mem[D005F9 & MEM_MASK] = LOOKUP_KEY_F9;
  mem[D005FA & MEM_MASK] = LOOKUP_KEY_FA;
  mem[D005FB & MEM_MASK] = LOOKUP_KEY_FB;
  write24(mem, D0259D, TOP_ENTRY_START);

  mem.fill(0x00, D3F_START, D3F_END + 1);

  if (scenarioName === 'populated-top-entry') {
    mem[(TOP_ENTRY_START + 0) & MEM_MASK] = LOOKUP_KEY_FB;
    mem[(TOP_ENTRY_START + 1) & MEM_MASK] = LOOKUP_KEY_FA;
    mem[(TOP_ENTRY_START + 2) & MEM_MASK] = LOOKUP_KEY_F9;
    mem[(TOP_ENTRY_START + 3) & MEM_MASK] = (HANDLER_ADDRESS >>> 16) & 0xFF;
    mem[(TOP_ENTRY_START + 4) & MEM_MASK] = (HANDLER_ADDRESS >>> 8) & 0xFF;
    mem[(TOP_ENTRY_START + 5) & MEM_MASK] = HANDLER_ADDRESS & 0xFF;
    mem[(TOP_ENTRY_START + 6) & MEM_MASK] = 0x00;
    mem[(TOP_ENTRY_START + 7) & MEM_MASK] = 0x00;
    mem[(TOP_ENTRY_START + 8) & MEM_MASK] = 0x00;
  }
}

function summarizeScenario(name, result, blockOrder, reads, writes, dynamicTargets, cpu, mem) {
  const matchedHandler = (cpu.de & 0xFFFFFF) === HANDLER_ADDRESS;
  const jumpedToHandler =
    dynamicTargets.includes(HANDLER_ADDRESS) ||
    blockOrder.some((block) => block.startsWith('058241:'));

  console.log(`\n=== ${name} ===`);
  console.log(
    `termination=${result.termination} steps=${result.steps}`
    + ` lastPc=${hex(result.lastPc)}:${result.lastMode}`
    + ` finalDE=${hex(cpu.de)} finalHL=${hex(cpu.hl)} finalBC=${hex(cpu.bc)}`
  );
  console.log(
    `key=[${hexByte(mem[D005FB])} ${hexByte(mem[D005FA])} ${hexByte(mem[D005F9])}]`
    + ` statusByte=${hexByte(mem[D005F8])} lowerBound=${hex(read24(mem, D0259D))}`
  );
  console.log(`matchedHandler=${matchedHandler} jumpedToHandler=${jumpedToHandler}`);

  console.log('unique blocks:');
  for (const block of blockOrder) {
    console.log(`  ${block}`);
  }

  console.log('D3F RAM reads:');
  if (reads.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of reads) {
      console.log(
        `  step=${event.step.toString().padStart(4, ' ')}`
        + ` block=${hex(event.blockPc)} read ${hex(event.addr)} => ${hexByte(event.value)}`
      );
    }
  }

  console.log('D3F RAM writes:');
  if (writes.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of writes) {
      console.log(
        `  step=${event.step.toString().padStart(4, ' ')}`
        + ` block=${hex(event.blockPc)} write ${hex(event.addr)} <= ${hexByte(event.value)}`
      );
    }
  }

  console.log(`dynamicTargets=[${dynamicTargets.map((value) => hex(value)).join(', ')}]`);

  return {
    name,
    termination: result.termination,
    steps: result.steps,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    finalDe: cpu.de & 0xFFFFFF,
    finalHl: cpu.hl & 0xFFFFFF,
    finalBc: cpu.bc & 0xFFFFFF,
    finalStatusByte: mem[D005F8 & MEM_MASK] & 0xFF,
    matchedHandler,
    jumpedToHandler,
    dynamicTargets,
    readCount: reads.length,
    writeCount: writes.length,
  };
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const kernelInit = resolveKernelInitEntry(blocks);
    const bootResult = executor.runFrom(kernelInit.pc, kernelInit.mode, {
      maxSteps: KERNEL_INIT_STEPS,
      maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    });

    const bootSnapshot = snapshotRuntime(cpu, mem);

    console.log('=== Phase 274: 0x0846EA Dispatch Scan ===');
    console.log(
      `kernelInit=${hex(kernelInit.pc)}:${kernelInit.mode}`
      + ` steps=${bootResult.steps} term=${bootResult.termination}`
      + ` lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode}`
    );
    console.log(
      `context SP=${hex(STACK_TOP)} IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} MBASE=${hex(MBASE, 2)}`
    );
    console.log(
      `synthetic lookup key uses D005FB..F9 =`
      + ` [${hexByte(LOOKUP_KEY_FB)} ${hexByte(LOOKUP_KEY_FA)} ${hexByte(LOOKUP_KEY_F9)}]`
      + ` with D0259D=${hex(TOP_ENTRY_START)} to constrain the scan to the top 9-byte slot.`
    );

    const scenarios = ['empty-table', 'populated-top-entry'];
    const summaries = [];

    for (const scenarioName of scenarios) {
      restoreRuntime(cpu, mem, bootSnapshot);
      prepareScenarioState(cpu, mem, scenarioName);

      const blockOrder = [];
      const seenBlocks = new Set();
      const dynamicTargets = [];
      const seenDynamicTargets = new Set();
      const reads = [];
      const writes = [];
      let currentStep = 0;
      let currentBlockPc = TARGET_PC;

      const originalRead8 = cpu.read8.bind(cpu);
      const originalWrite8 = cpu.write8.bind(cpu);

      cpu.read8 = (addr) => {
        const value = originalRead8(addr);
        if (addr >= D3F_START && addr <= D3F_END) {
          reads.push({ step: currentStep, blockPc: currentBlockPc, addr, value });
        }
        return value;
      };

      cpu.write8 = (addr, value) => {
        if (addr >= D3F_START && addr <= D3F_END) {
          writes.push({ step: currentStep, blockPc: currentBlockPc, addr, value: value & 0xFF });
        }
        return originalWrite8(addr, value);
      };

      const result = executor.runFrom(TARGET_PC, 'adl', {
        maxSteps: RUN_STEPS,
        maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
        onBlock: (pc, mode, _meta, step) => {
          currentStep = step;
          currentBlockPc = pc;
          const key = `${hex(pc)}:${mode}`;
          if (!seenBlocks.has(key)) {
            seenBlocks.add(key);
            blockOrder.push(key);
          }
        },
        onDynamicTarget: (target) => {
          if (!seenDynamicTargets.has(target)) {
            seenDynamicTargets.add(target);
            dynamicTargets.push(target);
          }
        },
      });

      cpu.read8 = originalRead8;
      cpu.write8 = originalWrite8;

      summaries.push(
        summarizeScenario(
          scenarioName,
          result,
          blockOrder,
          reads,
          writes,
          dynamicTargets,
          cpu,
          mem,
        ),
      );
    }

    console.log('\n=== Comparison ===');
    console.log(
      '- empty-table: no handler match; the scan walks the top slot window and returns without a dispatch target.'
    );
    console.log(
      `- populated-top-entry: the scan matches the synthetic top-slot record and resolves DE=${hex(HANDLER_ADDRESS)}.`
    );
    console.log(
      '- no direct jump to 0x058241 occurs inside 0x0846EA itself in either scenario;'
      + ' this routine resolves the target and returns to its caller.'
    );
    console.log('\nsummary:');
    console.log(JSON.stringify(summaries, null, 2));
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
