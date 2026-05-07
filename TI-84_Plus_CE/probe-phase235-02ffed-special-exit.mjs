#!/usr/bin/env node

/**
 * Phase 235: trace 0x02FFED direct-entry special/fallthrough exit behavior.
 *
 * This probe keeps the requested createMemoryBus/createCPU naming locally.
 * The current runtime exports createExecutor, so createCPU is a thin wrapper
 * that returns both the CPU and executor needed to step lifted blocks.
 */

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

const ENTRY = 0x02FFED;
const SPECIAL_PATH = 0x02FE84;
const HELPER_030300 = 0x030300;
const MAIN_DISPATCH = 0x02FD99;
const HEX_DUMP_END = 0x030010;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;

const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;

const STEP_LIMIT = 300;
const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 18, 29, 40];
const SCENARIOS = [
  {
    label: 'Scenario A',
    seedA: 0x1D,
    note: 'JP NZ path with A already replaced by 0x0302EB',
  },
  {
    label: 'Scenario B',
    seedA: 0x9C,
    note: 'Direct non-special key code control case',
  },
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
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

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
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
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    default:
      return inst.tag;
  }
}

function decodeAt(romBytes, pc) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  const bytes = romBytes.subarray(pc, pc + inst.length);
  return {
    pc: inst.pc >>> 0,
    bytes: bytesToHex(bytes),
    text: formatInstruction(inst),
  };
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase235-${process.pid}.mjs`);
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

function snapshotIyFlags(mem, iyBase) {
  const snapshot = {};
  for (const offset of IY_OFFSETS) {
    snapshot[`IY+${offset}`] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snapshot;
}

function formatIySnapshot(snapshot) {
  return IY_OFFSETS
    .map((offset) => `IY+${offset}=${hexByte(snapshot[`IY+${offset}`])}`)
    .join(' ');
}

function diffIySnapshots(before, after) {
  const changes = [];
  for (const offset of IY_OFFSETS) {
    const key = `IY+${offset}`;
    if (before[key] !== after[key]) {
      changes.push(`${key}:${hexByte(before[key])}->${hexByte(after[key])}`);
    }
  }
  return changes;
}

function makeStopError(reason, pc) {
  const error = new Error('__PHASE235_STOP__');
  error.phase235Stop = {
    reason,
    pc: pc & 0xFFFFFF,
  };
  return error;
}

function printStaticSection(romBytes) {
  console.log('========================================================================');
  console.log('Static ROM bytes: 0x02FFED-0x030010');
  console.log('========================================================================');

  const endInclusive = HEX_DUMP_END;
  const bytes = romBytes.subarray(ENTRY, endInclusive + 1);
  for (let index = 0; index < bytes.length; index += 16) {
    const lineAddr = ENTRY + index;
    const lineBytes = bytes.subarray(index, Math.min(bytes.length, index + 16));
    console.log(`${hex(lineAddr)}: ${bytesToHex(lineBytes)}`);
  }

  console.log('');
  console.log('Decoded checkpoints:');

  const checkpoints = [
    ENTRY,
    0x02FFEE,
    0x02FFF2,
    SPECIAL_PATH,
    0x02FE88,
    HELPER_030300,
    0x030304,
    0x030305,
    0x030309,
    0x03030D,
  ];

  for (const pc of checkpoints) {
    const row = decodeAt(romBytes, pc);
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(14)} ${row.text}`);
  }

  console.log('');
  console.log(
    'Static summary: 0x02FFED is a zero/nonzero gate: OR A; JP NZ,0x02FE84; otherwise JP 0x02FD99.',
  );
  console.log('');
}

function runScenario(blocks, romBytes, scenario) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = createMemoryBus(romBytes);
  const { cpu, executor } = createCPU(mem, blocks, peripherals);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.f = 0x00;
  cpu.a = scenario.seedA & 0xFF;
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  const iyBefore = snapshotIyFlags(mem, cpu.iy);
  const visited = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = ENTRY;

  try {
    const result = executor.runFrom(ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        if (currentPc === MAIN_DISPATCH) {
          throw makeStopError('entered_0x02FD99', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
  } catch (error) {
    if (error?.phase235Stop) {
      stopReason = error.phase235Stop.reason;
      stopPc = error.phase235Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  const iyAfter = snapshotIyFlags(mem, cpu.iy);

  return {
    label: scenario.label,
    note: scenario.note,
    seedA: scenario.seedA,
    steps,
    stopReason,
    stopPc,
    visited,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalIY: cpu.iy & 0xFFFFFF,
    d0058e: mem[D0058E_ADDR],
    d0058d: mem[D0058D_ADDR],
    d0059f: mem[D0059F_ADDR],
    iyBefore,
    iyAfter,
    iyChanges: diffIySnapshots(iyBefore, iyAfter),
    visited02FE84: visited.includes(SPECIAL_PATH),
    visited030300: visited.includes(HELPER_030300),
    visited02FD99: visited.includes(MAIN_DISPATCH),
  };
}

function printScenario(result) {
  console.log('------------------------------------------------------------------------');
  console.log(`${result.label}: A=${hexByte(result.seedA)} (${result.note})`);
  console.log('------------------------------------------------------------------------');
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Stop PC:     ${hex(result.stopPc)}`);
  console.log(`Steps:       ${result.steps}`);
  console.log(`Final A/F:   A=${hexByte(result.finalA)} F=${hexByte(result.finalF)}`);
  console.log(`Final IY:    ${hex(result.finalIY)}`);
  console.log(
    `Visited:     0x02FE84=${result.visited02FE84 ? 'yes' : 'no'}  0x030300=${result.visited030300 ? 'yes' : 'no'}  0x02FD99=${result.visited02FD99 ? 'yes' : 'no'}`,
  );
  console.log(
    `After RAM:   D0058E=${hexByte(result.d0058e)} D0058D=${hexByte(result.d0058d)} D0059F=${hexByte(result.d0059f)}`,
  );
  console.log(`IY before:   ${formatIySnapshot(result.iyBefore)}`);
  console.log(`IY after:    ${formatIySnapshot(result.iyAfter)}`);
  console.log(
    `IY changes:  ${result.iyChanges.length ? result.iyChanges.join('  ') : '(none in watched offsets)'}`,
  );
  console.log(
    `Blocks:      ${result.visited.length ? result.visited.map((pc) => hex(pc)).join(' -> ') : '(none)'}`,
  );
  console.log('');
}

async function main() {
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

    console.log('Phase 235: trace 0x02FFED special/fallthrough exit path');
    console.log(`ROM: ${path.basename(ROM_PATH)}`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Runtime seed: mbase=${hexByte(MBASE)} IY=${hex(IY_BASE)} timerInterrupt=false`);
    console.log('');

    printStaticSection(romBytes);

    for (const scenario of SCENARIOS) {
      const result = runScenario(blocks, romBytes, scenario);
      printScenario(result);
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
