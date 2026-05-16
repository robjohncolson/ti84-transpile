#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;
const COORMON_ENTRY = 0x08BF22;
const COORMON_GETCSC_RETURN = 0x08BF3C;
const COORMON_KEY_PRESENT_TARGET = 0x08BF68;
const COORMON_DISPATCH_AREA = 0x08BF82;
const COORMON_EPILOGUE = 0x08BF9E;
const POST_VRAM_BIT3_CHECK = 0x08BFD1;
const GETCSC_SCAN_ADDR = 0x3B0033;
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const IY9_ADDR = IY_BASE + 0x09;
const ENTER_SCAN = 0x09;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 50000;
const COORMON_MAX_LOOP_ITERATIONS = 50000;

const CHECKPOINTS = [
  { pc: COORMON_ENTRY, name: 'CoorMon entry' },
  { pc: COORMON_GETCSC_RETURN, name: 'GetCSC return' },
  { pc: COORMON_KEY_PRESENT_TARGET, name: 'Key-present branch' },
  { pc: POST_VRAM_BIT3_CHECK, name: 'BIT 3,(IY+9) gate' },
  { pc: COORMON_EPILOGUE, name: 'CoorMon epilogue' },
  { pc: COORMON_DISPATCH_AREA, name: 'cxMain dispatch area' },
];

const CHECKPOINT_NAME_BY_PC = new Map(CHECKPOINTS.map((checkpoint) => [checkpoint.pc, checkpoint.name]));

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const PRELIFTED_BLOCKS = normalizeBlocks(
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule,
);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function upper(value) {
  return String(value ?? '?').toUpperCase();
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function createMemoryBus(rom) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(MEM_SIZE, rom.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function prepareDirectEntry(cpu, mem) {
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
}

function installHomeHandler(mem) {
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
}

function createBootedEnvironment() {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  prepareDirectEntry(cpu, mem);

  return { mem, peripherals, executor, cpu, boot, kernelInit };
}

function bytesHex(buffer, start, length) {
  return Array.from(
    buffer.subarray(start >>> 0, (start + length) >>> 0),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function summarizeBlock(meta) {
  const parts = meta?.instructions?.map((instruction) => (
    instruction?.dasm ?? instruction?.asm ?? instruction?.tag ?? '<unknown>'
  )) ?? [];
  if (parts.length === 0) {
    return '<unknown>';
  }
  const joined = parts.join(' ; ');
  return joined.length > 140 ? `${joined.slice(0, 137)}...` : joined;
}

function formatSignedOffset(offset) {
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return `${sign}0x${absolute.toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatSignedOffsetWithDecimal(offset) {
  return `${formatSignedOffset(offset)} (${offset >= 0 ? '+' : ''}${offset})`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatSignedOffset(displacement)})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '<decode error>';
  }

  if (inst.dasm) {
    return inst.dasm;
  }

  if (inst.asm) {
    return inst.asm;
  }

  switch (inst.tag) {
    case 'nop':
      return 'NOP';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ex-sp-pair':
      return `EX (SP), ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-af':
      return "EX AF, AF'";
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'alu-ixd':
      return `${upper(inst.op)} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'inc-ixd':
      return `INC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-ixiy-indexed':
      return `LD ${upper(inst.dest)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'pea':
      return `PEA ${upper(inst.base)}${formatSignedOffset(inst.displacement)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)}, ${upper(inst.base)}${formatSignedOffset(inst.displacement)}`;
    default:
      return inst.tag ?? '<unknown>';
  }
}

function disassembleRange(startPc, endPc, { minInstructions = 0 } = {}) {
  const rows = [];
  let pc = startPc >>> 0;
  while (pc <= (endPc >>> 0) || rows.length < minInstructions) {
    if (pc >= romBytes.length) {
      break;
    }

    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({
        pc,
        length,
        bytes: bytesHex(romBytes, pc, length),
        text: formatInstruction(inst),
        inst,
      });
      pc = (pc + length) >>> 0;
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesHex(romBytes, pc, 1),
        text: `<decode failed: ${error?.message ?? error}>`,
        inst: null,
      });
      pc = (pc + 1) >>> 0;
    }

    if (rows.length >= 512) {
      break;
    }
  }

  return rows;
}

function printDisassembly(title, startPc, endPc, options = {}) {
  const rows = disassembleRange(startPc, endPc, options);
  const minInstructions = options.minInstructions ?? 0;
  const note = minInstructions > 0 ? `, min ${minInstructions} instructions` : '';

  console.log(`\n${title}`);
  console.log(`  request: ${hex(startPc)} .. ${hex(endPc)}${note}`);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }

  return rows;
}

function extractIyReference(inst) {
  const indexRegister = inst?.indexRegister ?? null;
  const base = inst?.base ?? null;
  const displacement = inst?.displacement;

  if (typeof displacement !== 'number') {
    return null;
  }

  if (indexRegister !== 'iy' && base !== 'iy') {
    return null;
  }

  let operation = inst.tag ?? '<unknown>';
  switch (inst.tag) {
    case 'indexed-cb-bit':
      operation = `BIT ${inst.bit}`;
      break;
    case 'indexed-cb-set':
      operation = `SET ${inst.bit}`;
      break;
    case 'indexed-cb-res':
      operation = `RES ${inst.bit}`;
      break;
    case 'ld-reg-ixd':
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
    case 'ld-pair-indexed':
    case 'ld-indexed-pair':
    case 'ld-ixiy-indexed':
    case 'ld-indexed-ixiy':
      operation = 'LD';
      break;
    case 'alu-ixd':
      operation = upper(inst.op);
      break;
    case 'inc-ixd':
      operation = 'INC';
      break;
    case 'dec-ixd':
      operation = 'DEC';
      break;
    case 'pea':
      operation = 'PEA';
      break;
    case 'lea':
      operation = 'LEA';
      break;
    default:
      operation = upper(inst.tag);
      break;
  }

  return {
    offset: displacement,
    operation,
    mnemonic: formatInstruction(inst),
  };
}

function collectIyFlagSurvey(mem) {
  const entries = [];
  for (let offset = 0; offset <= 0x20; offset++) {
    const addr = (IY_BASE + offset) & 0xFFFFFF;
    const value = mem[addr] & 0xFF;
    if (value !== 0) {
      entries.push({ offset, addr, value });
    }
  }
  return entries;
}

function extractTargetByte(addr, width, value, targetAddr) {
  const base = addr & 0xFFFFFF;
  const normalizedValue = value >>> 0;
  for (let index = 0; index < width; index++) {
    if (((base + index) & 0xFFFFFF) === (targetAddr & 0xFFFFFF)) {
      return (normalizedValue >>> (index * 8)) & 0xFF;
    }
  }
  return null;
}

function attachIy9WriteWatch(cpu, mem, getContext) {
  const writes = [];

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordWrite(kind, addr, width, value, writer) {
    const byteValue = extractTargetByte(addr, width, value, IY9_ADDR);
    if (byteValue === null) {
      return writer();
    }

    const before = mem[IY9_ADDR] & 0xFF;
    const result = writer();
    const after = mem[IY9_ADDR] & 0xFF;
    const context = getContext();
    writes.push({
      step: context.step,
      pc: context.pc,
      mode: context.mode,
      summary: context.summary,
      kind,
      addr: addr & 0xFFFFFF,
      before,
      value: byteValue & 0xFF,
      after,
    });
    return result;
  }

  cpu.write8 = (addr, value) => recordWrite('write8', addr, 1, value, () => origWrite8(addr, value));
  cpu.write16 = (addr, value) => recordWrite('write16', addr, 2, value, () => origWrite16(addr, value));
  cpu.write24 = (addr, value) => recordWrite('write24', addr, 3, value, () => origWrite24(addr, value));

  return {
    writes,
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runScenario(name, { seedBit3 = false } = {}) {
  const env = createBootedEnvironment();
  const { mem, executor, cpu } = env;

  installHomeHandler(mem);
  mem[GETCSC_SCAN_ADDR] = ENTER_SCAN;

  const seedBefore = mem[IY9_ADDR] & 0xFF;
  if (seedBit3) {
    mem[IY9_ADDR] |= 0x08;
  }
  const seedAfter = mem[IY9_ADDR] & 0xFF;

  prepareDirectEntry(cpu, mem);

  let currentStep = 0;
  let currentPc = COORMON_ENTRY;
  let currentMode = 'adl';
  let currentSummary = '<pre-run>';

  const checkpointHits = Object.fromEntries(
    CHECKPOINTS.map((checkpoint) => [checkpoint.name, []]),
  );
  const missingBlocks = [];

  const watch = attachIy9WriteWatch(cpu, mem, () => ({
    step: currentStep,
    pc: currentPc,
    mode: currentMode,
    summary: currentSummary,
  }));

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: COORMON_MAX_STEPS,
    maxLoopIterations: COORMON_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, steps) {
      currentPc = pc & 0xFFFFFF;
      currentMode = mode ?? 'adl';
      currentStep = steps ?? 0;
      currentSummary = summarizeBlock(meta);

      const checkpointName = CHECKPOINT_NAME_BY_PC.get(currentPc);
      if (checkpointName) {
        checkpointHits[checkpointName].push({
          step: currentStep,
          pc: currentPc,
          value: mem[IY9_ADDR] & 0xFF,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          summary: currentSummary,
        });
      }
    },
    onMissingBlock(pc, mode, steps) {
      missingBlocks.push({
        step: steps ?? 0,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  watch.restore();

  return {
    name,
    seedBit3,
    seedBefore,
    seedAfter,
    boot: env.boot,
    kernelInit: env.kernelInit,
    result,
    checkpointHits,
    writes: watch.writes,
    missingBlocks,
    finalIy9: mem[IY9_ADDR] & 0xFF,
    reachedDispatch: checkpointHits['cxMain dispatch area'].length > 0,
    reachedBit3Gate: checkpointHits['BIT 3,(IY+9) gate'].length > 0,
  };
}

function printIyFlagSurvey(entries) {
  console.log('\nInitial IY flag state after boot + kernel init');
  console.log(`  window: ${hex(IY_BASE)} .. ${hex(IY_BASE + 0x20)}`);
  if (entries.length === 0) {
    console.log('  all bytes are 0x00');
    return;
  }

  for (const entry of entries) {
    console.log(
      `  IY${formatSignedOffset(entry.offset)} ` +
      `addr=${hex(entry.addr)} value=${hex8(entry.value)}`,
    );
  }
}

function printIyReferenceSurvey(rows) {
  const refs = rows
    .map((row) => {
      const ref = extractIyReference(row.inst);
      return ref ? { pc: row.pc, ...ref } : null;
    })
    .filter(Boolean);

  console.log('\nIY+offset references in 0x08BF22 .. 0x08C000');
  if (refs.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const ref of refs) {
    console.log(
      `  ${hex(ref.pc)}  offset=${formatSignedOffsetWithDecimal(ref.offset).padEnd(14)} ` +
      `op=${ref.operation.padEnd(6)} ${ref.mnemonic}`,
    );
  }
}

function printCheckpointTable(scenario) {
  console.log(`\n${scenario.name}`);
  console.log(
    `  result: steps=${scenario.result.steps} termination=${scenario.result.termination} ` +
    `lastPc=${hex(scenario.result.lastPc)} lastMode=${scenario.result.lastMode ?? 'n/a'}`,
  );
  console.log(
    `  IY+9 pre-run=${hex8(scenario.seedAfter)} ` +
    `(seed baseline ${hex8(scenario.seedBefore)}${scenario.seedBit3 ? ` -> ${hex8(scenario.seedAfter)}` : ''}) ` +
    `post-run=${hex8(scenario.finalIy9)}`,
  );
  console.log(`  cxMain dispatch 0x08BF82: ${scenario.reachedDispatch ? 'reached' : 'not reached'}`);

  console.log('  checkpoints:');
  for (const checkpoint of CHECKPOINTS) {
    const hits = scenario.checkpointHits[checkpoint.name] ?? [];
    const first = hits[0] ?? null;
    if (!first) {
      console.log(`    ${checkpoint.name.padEnd(20)} not reached`);
      continue;
    }
    const repeats = hits.length > 1 ? ` hits=${hits.length}` : '';
    console.log(
      `    ${checkpoint.name.padEnd(20)} step=${String(first.step).padStart(5)} ` +
      `value=${hex8(first.value)} A=${hex8(first.a)}${repeats}`,
    );
  }

  console.log('  writes to 0xD00089 during CoorMon:');
  if (scenario.writes.length === 0) {
    console.log('    (none)');
  } else {
    for (const write of scenario.writes) {
      console.log(
        `    step=${String(write.step).padStart(5)} pc=${hex(write.pc)}:${write.mode} ` +
        `${write.kind} ${hex(write.addr)} ${hex8(write.before)} -> ${hex8(write.after)} ` +
        `[target byte ${hex8(write.value)}] ${write.summary}`,
      );
    }
  }

  if (scenario.missingBlocks.length > 0) {
    console.log('  missing blocks:');
    for (const missing of scenario.missingBlocks) {
      console.log(
        `    step=${String(missing.step).padStart(5)} pc=${hex(missing.pc)}:${missing.mode}`,
      );
    }
  }
}

function printScenarioComparison(normalRun, seededRun) {
  console.log('\nSeeded BIT 3 comparison');
  console.log(
    `  normal  run reached 0x08BF82: ${normalRun.reachedDispatch ? 'yes' : 'no'} ` +
    `${normalRun.reachedDispatch ? `(step ${normalRun.checkpointHits['cxMain dispatch area'][0].step})` : ''}`,
  );
  console.log(
    `  seeded  run reached 0x08BF82: ${seededRun.reachedDispatch ? 'yes' : 'no'} ` +
    `${seededRun.reachedDispatch ? `(step ${seededRun.checkpointHits['cxMain dispatch area'][0].step})` : ''}`,
  );
  console.log(
    `  seeded IY+9 mutation before CoorMon: ${hex8(seededRun.seedBefore)} -> ${hex8(seededRun.seedAfter)}`,
  );

  const normalGate = normalRun.checkpointHits['BIT 3,(IY+9) gate'][0] ?? null;
  const seededGate = seededRun.checkpointHits['BIT 3,(IY+9) gate'][0] ?? null;
  console.log(
    `  0x08BFD1 value comparison: normal=${normalGate ? hex8(normalGate.value) : 'not reached'} ` +
    `seeded=${seededGate ? hex8(seededGate.value) : 'not reached'}`,
  );
}

console.log('Phase 339: CoorMon IY+9 post-VRAM gate probe');
console.log('=============================================');
console.log(`IY base: ${hex(IY_BASE)}  IY+9: ${hex(IY9_ADDR)}  cxMain ptr: ${hex(CXMAIN_PTR)}`);
console.log(`CoorMon: ${hex(COORMON_ENTRY)}  dispatch area: ${hex(COORMON_DISPATCH_AREA)}  epilogue: ${hex(COORMON_EPILOGUE)}`);
console.log(`ENTER scan source byte: ${hex(GETCSC_SCAN_ADDR)} = ${hex8(ENTER_SCAN)}`);

const iySurveyEnv = createBootedEnvironment();
const iyFlagSurvey = collectIyFlagSurvey(iySurveyEnv.mem);
printIyFlagSurvey(iyFlagSurvey);

printDisassembly(
  'Post-VRAM check disassembly window',
  0x08BFC5,
  0x08BFF0,
  { minInstructions: 20 },
);

printDisassembly(
  'Dispatch-to-epilogue disassembly window',
  0x08BF78,
  0x08BF9E,
);

const fullRangeRows = printDisassembly(
  'Full disassembly: 0x08BF22 .. 0x08C000',
  0x08BF22,
  0x08C000,
);
printIyReferenceSurvey(fullRangeRows);

const normalRun = runScenario('Scenario 1: normal ENTER run', { seedBit3: false });
const seededRun = runScenario('Scenario 2: pre-set BIT 3 in IY+9', { seedBit3: true });

printCheckpointTable(normalRun);
printCheckpointTable(seededRun);
printScenarioComparison(normalRun, seededRun);
