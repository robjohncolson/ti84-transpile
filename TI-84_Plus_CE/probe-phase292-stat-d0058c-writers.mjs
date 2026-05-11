#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);
const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const TRACE_SP = 0xD1A87E;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const DYNAMIC_WRITE_HIT = '__PHASE292_TARGET_WRITE__';

const TARGET_CONFIGS = [
  {
    address: 0x08C35A,
    functionEntryHint: 0x08C331,
    valueWritten: '0x00',
    source: 'XOR A at 0x08C359 forces A=0 immediately before LD (0xD0058C),A.',
    gateCondition: 'BIT 5,(IY+31) at 0x08C349 followed by JR Z,0x08C359 at 0x08C34D. The write happens when bit 5 is clear.',
    purpose: 'Clear the pending kbdKey byte before the CoorMon wait/service path enters 0x02FCB3.',
    dynamicScenarios: [
      {
        name: 'gate-clear from 0x08C349',
        start: 0x08C349,
        target: 0x08C35A,
        maxSteps: 8,
        seed: {
          a: 0x99,
          iy31: 0x00,
          d0058c: 0xAA,
          d0058e: 0xBB,
        },
      },
    ],
  },
  {
    address: 0x08C36E,
    functionEntryHint: 0x08C331,
    valueWritten: '0x00 or the pre-existing kbdKey byte',
    source: 'Path-dependent join-store: the replay path loads A from (0xD0058C) at 0x08C34F, while the clear path reaches the same join after XOR A at 0x08C359.',
    gateCondition: 'The same BIT 5,(IY+31) gate at 0x08C349 decides the source. Bit 5 set: replay the old kbdKey via 0x08C34F -> 0x08C366. Bit 5 clear: come from the zeroed path at 0x08C359.',
    purpose: 'Join-store for the CoorMon dispatch key byte. It preserves the replayed key or carries the cleared state forward; it does not inject a fixed literal scan code.',
    dynamicScenarios: [
      {
        name: 'replay branch from 0x08C349',
        start: 0x08C349,
        target: 0x08C36E,
        maxSteps: 8,
        seed: {
          a: 0x99,
          iy31: 0x20,
          iy2: 0x01,
          d0058c: 0x5A,
          d0058e: 0xBB,
        },
      },
      {
        name: 'join entry with A=0 model',
        start: 0x08C366,
        target: 0x08C36E,
        maxSteps: 8,
        seed: {
          a: 0x00,
          iy31: 0x00,
          iy2: 0x00,
          d0058c: 0xAA,
          d0058e: 0xBB,
        },
        note: 'This models the zero-valued fallthrough into the join itself. The minimal standalone 0x08C359 -> 0x02FCB3 path is deeper than this probe needs.',
      },
    ],
  },
  {
    address: 0x08C7A1,
    functionEntryHint: 0x08C79F,
    valueWritten: '0x00',
    source: 'LD C,A at 0x08C79F saves the caller value, then SUB A at 0x08C7A0 clears A before the store.',
    gateCondition: 'No local gate. Every entry through 0x08C79F clears D0058C before jumping into 0x08C7AD.',
    purpose: 'Clear any pending kbdKey before NewContext/NewContext0 context setup. The original caller value is restored to A after the clear, so this is not scan-code injection.',
    dynamicScenarios: [
      {
        name: 'NewContext wrapper with A=0x44',
        start: 0x08C79F,
        target: 0x08C7A1,
        maxSteps: 4,
        seed: {
          a: 0x44,
        },
      },
      {
        name: 'NewContext wrapper with A=0x52',
        start: 0x08C79F,
        target: 0x08C7A1,
        maxSteps: 4,
        seed: {
          a: 0x52,
        },
      },
    ],
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, addr, length) {
  return Array.from(
    buffer.subarray(addr, Math.min(buffer.length, addr + length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }

  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  if (inst.dasm) {
    return inst.dasm;
  }

  switch (inst.tag) {
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`)
        .join(' ');
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function disassembleAroundTarget(target, beforeRows = 18, afterRows = 12) {
  const scanStart = Math.max(0, target - beforeRows * 6);
  const scanEnd = Math.min(rom.length, target + afterRows * 6);
  const rows = [];
  let pc = scanStart;

  while (pc < scanEnd) {
    const inst = safeDecode(pc);
    if (!inst) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesAt(rom, pc, 1),
        asm: `DB ${hexByte(rom[pc])}`,
        inst: null,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length: inst.length,
      bytes: bytesAt(rom, pc, inst.length),
      asm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  const targetIndex = rows.findIndex((row) => row.pc === target);
  if (targetIndex < 0) {
    return rows;
  }

  return rows.slice(
    Math.max(0, targetIndex - beforeRows),
    Math.min(rows.length, targetIndex + afterRows + 1),
  );
}

function inferFunctionEntry(target, fallback) {
  const rows = disassembleAroundTarget(target, 48, 4);
  const targetIndex = rows.findIndex((row) => row.pc === target);
  if (targetIndex < 0) {
    return fallback;
  }

  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const tag = rows[i].inst?.tag;
    if (tag === 'ret' || tag === 'reti' || tag === 'retn' || tag === 'jp') {
      return rows[i + 1]?.pc ?? fallback;
    }
  }

  return fallback ?? rows[0]?.pc ?? target;
}

function findImmediateLoadCallers(target) {
  const low = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const high = (target >>> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc <= rom.length - 6; pc += 1) {
    if (
      rom[pc] === 0x3E &&
      rom[pc + 2] === 0xCD &&
      rom[pc + 3] === low &&
      rom[pc + 4] === mid &&
      rom[pc + 5] === high
    ) {
      hits.push({
        loadPc: pc,
        callPc: pc + 2,
        value: rom[pc + 1],
      });
    }
  }

  return hits;
}

function renderStaticRows(title, rows, target) {
  console.log(title);
  for (const row of rows) {
    const marker = row.pc === target ? '  <<< TARGET' : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.asm}${marker}`);
  }
  console.log('');
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      sourceLabel: 'ROM.transpiled.js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    return null;
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase292-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    sourceLabel: 'ROM.transpiled.js.gz',
  };
}

function cleanupTranspiledModule(bundle) {
  if (!bundle?.tempModulePath) {
    return;
  }

  try {
    fs.unlinkSync(bundle.tempModulePath);
  } catch {}
}

async function loadPreliftedBlocks() {
  const bundle = ensureTranspiledModule();
  if (!bundle) {
    return {
      blocks: null,
      sourceLabel: null,
      cleanup() {},
    };
  }

  try {
    const romModule = await import(pathToFileURL(bundle.modulePath).href);
    let blocks = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
    if (Array.isArray(blocks)) {
      blocks = Object.fromEntries(blocks.filter((block) => block?.id).map((block) => [block.id, block]));
    }

    return {
      blocks,
      sourceLabel: bundle.sourceLabel,
      cleanup() {
        cleanupTranspiledModule(bundle);
      },
    };
  } catch (error) {
    cleanupTranspiledModule(bundle);
    throw error;
  }
}

function createDynamicHarness(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = createExecutor(blocks, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
    trackMemoryMapped: true,
  });

  return {
    mem,
    executor,
    cpu: executor.cpu,
  };
}

function resetDynamicHarness(harness) {
  harness.mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  if (rom.length < MEM_SIZE) {
    harness.mem.fill(0, rom.length, MEM_SIZE);
  }
}

function seedBaseState(cpu, mem, seed = {}) {
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = seed.a ?? 0x00;
  cpu.f = seed.f ?? 0x00;
  cpu.i = 0;
  cpu.im = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;

  mem[D0058C] = seed.d0058c ?? 0x00;
  mem[D0058E] = seed.d0058e ?? 0x00;

  mem[TRACE_IY + 2] = seed.iy2 ?? 0x00;
  mem[TRACE_IY + 12] = seed.iy12 ?? 0x00;
  mem[TRACE_IY + 13] = seed.iy13 ?? 0x00;
  mem[TRACE_IY + 22] = seed.iy22 ?? 0xFF;
  mem[TRACE_IY + 29] = seed.iy29 ?? 0xFF;
  mem[TRACE_IY + 31] = seed.iy31 ?? 0x00;
  mem[TRACE_IY + 74] = seed.iy74 ?? 0x00;
  mem[TRACE_IY + 75] = seed.iy75 ?? 0x00;
  mem[TRACE_IY + 81] = seed.iy81 ?? 0x00;

  for (const write of seed.extraMemory ?? []) {
    mem[write.addr & 0xFFFFFF] = write.value & 0xFF;
  }
}

function summarizeTrace(trace) {
  return trace.map((entry) => ({
    step: entry.step,
    pc: hex(entry.pc),
    a: hexByte(entry.a),
    f: hexByte(entry.f),
    text: entry.text,
  }));
}

function runWriteScenario(harness, scenario) {
  resetDynamicHarness(harness);
  const { mem, executor, cpu } = harness;
  seedBaseState(cpu, mem, scenario.seed);

  let currentStep = -1;
  let hit = null;
  let termination = 'unknown';
  const trace = [];
  const missing = [];

  const originalWrite8 = cpu.write8.bind(cpu);

  cpu.write8 = (addr, value) => {
    const result = originalWrite8(addr, value);
    if ((addr & 0xFFFFFF) === D0058C && (cpu._currentBlockPc & 0xFFFFFF) === scenario.target) {
      hit = {
        step: currentStep,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        a: cpu.a & 0xFF,
        value: value & 0xFF,
        f: cpu.f & 0xFF,
      };
      const error = new Error(DYNAMIC_WRITE_HIT);
      error.code = DYNAMIC_WRITE_HIT;
      throw error;
    }
    return result;
  };

  try {
    const runResult = executor.runFrom(scenario.start, 'adl', {
      maxSteps: scenario.maxSteps ?? 24,
      maxLoopIterations: scenario.maxLoopIterations ?? 16,
      onBlock(pc, mode, meta, step) {
        currentStep = step;
        if (trace.length >= 16) {
          return;
        }
        trace.push({
          step,
          pc: pc & 0xFFFFFF,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          text: (meta?.instructions ?? []).map((inst) => inst.dasm ?? formatInstruction(inst)).join(' | ') || '(no metadata)',
          mode,
        });
      },
      onMissingBlock(pc, mode, step) {
        missing.push({
          step,
          pc: pc & 0xFFFFFF,
          mode,
        });
      },
    });
    termination = runResult.termination;
  } catch (error) {
    if (error?.code === DYNAMIC_WRITE_HIT || error?.message === DYNAMIC_WRITE_HIT) {
      termination = 'target_write';
    } else {
      throw error;
    }
  } finally {
    cpu.write8 = originalWrite8;
  }

  return {
    name: scenario.name,
    note: scenario.note ?? null,
    start: hex(scenario.start),
    termination,
    hit: hit
      ? {
          pc: hex(hit.pc),
          step: hit.step,
          a_at_write: hexByte(hit.a),
          value_written: hexByte(hit.value),
          flags: hexByte(hit.f),
        }
      : null,
    path: trace.map((entry) => hex(entry.pc)),
    trace: summarizeTrace(trace),
    missing: missing.map((entry) => ({
      step: entry.step,
      pc: hex(entry.pc),
      mode: entry.mode,
    })),
  };
}

function analyzeTarget(config, harness) {
  const rows = disassembleAroundTarget(config.address, 16, 12);
  const functionEntry = inferFunctionEntry(config.address, config.functionEntryHint);

  const result = {
    value_written: config.valueWritten,
    source: config.source,
    function_entry: hex(functionEntry),
    gate_condition: config.gateCondition,
    purpose: config.purpose,
  };

  if (config.address === 0x08C7A1) {
    const callerSamples = findImmediateLoadCallers(0x08C79F);
    const uniqueValues = [...new Set(callerSamples.map((sample) => sample.value))].sort((left, right) => left - right);
    result.direct_ld_a_imm_callers = callerSamples.map((sample) => ({
      load_pc: hex(sample.loadPc),
      call_pc: hex(sample.callPc),
      value: hexByte(sample.value),
    }));
    result.observed_caller_values = uniqueValues.map((value) => hexByte(value));
  }

  if (!harness) {
    result.dynamic_verification = {
      available: false,
      reason: 'ROM.transpiled.js / ROM.transpiled.js.gz not available',
    };
    return { rows, result };
  }

  result.dynamic_verification = {
    available: true,
    scenarios: config.dynamicScenarios.map((scenario) => runWriteScenario(harness, scenario)),
  };

  return { rows, result };
}

async function main() {
  console.log('=== Phase 292: STAT D0058C Writers ===');
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log('');

  let harness = null;
  let dynamicSource = null;
  let dynamicLoadError = null;
  let blocksBundle = null;

  try {
    blocksBundle = await loadPreliftedBlocks();
    if (blocksBundle.blocks) {
      harness = createDynamicHarness(blocksBundle.blocks);
      dynamicSource = blocksBundle.sourceLabel;
    }
  } catch (error) {
    dynamicLoadError = error?.message ?? String(error);
  }

  const report = {
    generated_at: new Date().toISOString(),
    dynamic_available: harness !== null,
    dynamic_source: dynamicSource,
    dynamic_error: dynamicLoadError,
  };

  try {
    for (const config of TARGET_CONFIGS) {
      const { rows, result } = analyzeTarget(config, harness);
      renderStaticRows(`=== Static window for ${hex(config.address)} ===`, rows, config.address);
      report[hex(config.address)] = result;
    }

    console.log('=== Structured Report ===');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    blocksBundle?.cleanup?.();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
