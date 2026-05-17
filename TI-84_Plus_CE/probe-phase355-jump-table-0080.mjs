#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const RUN_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 500000;

const TABLE_BASE = 0x000080;
const TABLE_BYTE_COUNT = 0x20;
const TABLE_SLOT_SIZE = 4;
const DISASM_BYTE_COUNT = 20;
const POST_RETURN_FIRST_INSTRUCTIONS = 10;
const POST_RETURN_SCAN_LIMIT = 64;
const POST_RETURN_BLOCK_LIMIT = 12;

const TARGETS = [
  0x001768,
  0x001775,
  0x003C59,
  0x00176D,
  0x001770,
];

const SCENARIOS = [
  { label: 'baseline-a=0x05', value: 0x05 },
  { label: 'force-a=0x00', value: 0x00 },
  { label: 'force-a=0x01', value: 0x01 },
  { label: 'force-a=0x06', value: 0x06 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function read24LE(buffer, addr) {
  return (
    (buffer[addr] ?? 0)
    | ((buffer[addr + 1] ?? 0) << 8)
    | ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesToHex(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => (value ?? 0).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
      return withPrefix(inst, 'ccf');
    case 'dec-pair':
      return withPrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withPrefix(inst, `dec ${inst.reg}`);
    case 'di':
      return withPrefix(inst, 'di');
    case 'ei':
      return withPrefix(inst, 'ei');
    case 'ex-de-hl':
      return withPrefix(inst, 'ex de, hl');
    case 'halt':
      return withPrefix(inst, 'halt');
    case 'in-imm':
      return withPrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'in-reg':
      return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'in0':
      return withPrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withPrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withPrefix(inst, `inc ${inst.reg}`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `ld (${hex(inst.addr)}), ${inst.pair}`
          : `ld ${inst.pair}, (${hex(inst.addr)})`,
      );
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'nop':
      return withPrefix(inst, 'nop');
    case 'out-imm':
      return withPrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'out0':
      return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pop':
      return withPrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withPrefix(inst, 'ret');
    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);
    case 'rst':
      return withPrefix(inst, `rst ${hex(inst.target, 2)}`);
    case 'sbc-pair':
      return withPrefix(inst, `sbc hl, ${inst.src}`);
    default: {
      const fields = Object.entries(inst ?? {})
        .filter(([key, value]) => ![
          'pc',
          'length',
          'nextPc',
          'tag',
          'mode',
          'modePrefix',
          'target',
          'fallthrough',
          'terminates',
          'kind',
          'nextMode',
        ].includes(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`);
      return fields.length > 0 ? `${inst.tag} ${fields.join(', ')}` : `${inst?.tag ?? 'db'}`;
    }
  }
}

function decodeRange(romBytes, decodeInstruction, start, mode = 'z80', byteCount = DISASM_BYTE_COUNT) {
  const rows = [];
  const limit = Math.min(start + byteCount, romBytes.length);
  let pc = start;

  while (pc < limit) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        mode,
        length: 1,
        tag: 'db',
        bytes: bytesToHex(romBytes, pc, 1),
        text: `db ${hexByte(romBytes[pc] ?? 0)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      ...inst,
      bytes: bytesToHex(romBytes, pc, inst.length),
      text: formatInstruction(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function summarizeTargetLoads(rows) {
  let aValue = null;
  let bValue = null;
  let firstRetPc = null;

  for (const row of rows) {
    if (row.tag === 'ld-reg-imm' && row.dest === 'a' && aValue === null) {
      aValue = row.value & 0xFF;
    }
    if (row.tag === 'ld-reg-imm' && row.dest === 'b' && bValue === null) {
      bValue = row.value & 0xFF;
    }
    if (row.tag === 'ret' || row.tag === 'ret-conditional') {
      firstRetPc = row.pc & 0xFFFFFF;
      break;
    }
  }

  return {
    aValue,
    bValue,
    firstRetPc,
  };
}

function decodeJumpTable(romBytes) {
  const entries = [];
  for (let offset = 0; offset < TABLE_BYTE_COUNT; offset += TABLE_SLOT_SIZE) {
    const addr = TABLE_BASE + offset;
    entries.push({
      slot: offset / TABLE_SLOT_SIZE,
      offset,
      addr,
      opcode: romBytes[addr] ?? 0,
      target: read24LE(romBytes, addr + 1),
      bytes: bytesToHex(romBytes, addr, TABLE_SLOT_SIZE),
    });
  }
  return entries;
}

function findLongestAdjacentRepeat(sequence) {
  const n = sequence.length;

  for (let length = Math.floor(n / 2); length >= 2; length--) {
    let run = 0;

    for (let i = 0; i + length < n; i++) {
      if (sequence[i] === sequence[i + length]) {
        run++;
        if (run >= length) {
          return {
            start: i - length + 1,
            length,
          };
        }
      } else {
        run = 0;
      }
    }
  }

  return null;
}

function rotateSequence(sequence, startIndex) {
  if (startIndex === 0) {
    return [...sequence];
  }
  return sequence.slice(startIndex).concat(sequence.slice(0, startIndex));
}

function chooseBoundaryStart(cycleEntries) {
  let best = null;

  for (let i = 0; i < cycleEntries.length; i++) {
    const current = cycleEntries[i];
    const next = cycleEntries[(i + 1) % cycleEntries.length];
    const drop = current.pc - next.pc;

    if (drop <= 0) {
      continue;
    }

    if (
      !best
      || drop > best.drop
      || (drop === best.drop && next.pc < best.firstPc)
      || (drop === best.drop && next.pc === best.firstPc && i < best.lastIndex)
    ) {
      best = {
        drop,
        lastIndex: i,
        startIndex: (i + 1) % cycleEntries.length,
        firstPc: next.pc,
      };
    }
  }

  if (best) {
    return best.startIndex;
  }

  let startIndex = 0;
  for (let i = 1; i < cycleEntries.length; i++) {
    if (cycleEntries[i].pc < cycleEntries[startIndex].pc) {
      startIndex = i;
    }
  }
  return startIndex;
}

function analyzeCycle(sequence) {
  const keys = sequence.map((entry) => entry.key);
  const repeat = findLongestAdjacentRepeat(keys);
  if (!repeat) {
    return null;
  }

  const rawEntries = sequence.slice(repeat.start, repeat.start + repeat.length);
  const boundaryStart = chooseBoundaryStart(rawEntries);
  const canonicalEntries = rotateSequence(rawEntries, boundaryStart);
  const uniqueKeyCount = new Set(canonicalEntries.map((entry) => entry.key)).size;

  return {
    start: repeat.start,
    length: repeat.length,
    boundaryStart,
    canonicalEntries,
    canonicalKeys: canonicalEntries.map((entry) => entry.key),
    uniqueKeyCount,
  };
}

function arraysEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function sortBlockKeys(keys) {
  return [...keys].sort((left, right) => {
    const [leftPc, leftMode] = left.split(':');
    const [rightPc, rightMode] = right.split(':');
    const leftValue = Number.parseInt(leftPc, 16);
    const rightValue = Number.parseInt(rightPc, 16);
    return leftValue - rightValue || leftMode.localeCompare(rightMode);
  });
}

function formatBlockKeys(keys) {
  if (!keys || keys.length === 0) {
    return 'none';
  }
  return sortBlockKeys(keys)
    .map((key) => {
      const [pc, mode] = key.split(':');
      return `${hex(Number.parseInt(pc, 16))}:${mode}`;
    })
    .join(', ');
}

function resolveNextMode(meta, returnedPc, currentMode) {
  if (!meta?.exits) {
    return currentMode;
  }
  for (const exit of meta.exits) {
    if (((exit.target ?? -1) & 0xFFFFFF) === (returnedPc & 0xFFFFFF) && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function classifyAAccess(inst) {
  const result = { reads: false, writes: false };

  switch (inst?.tag) {
    case 'push':
      if (inst.pair === 'af') {
        result.reads = true;
      }
      break;
    case 'pop':
      if (inst.pair === 'af') {
        result.writes = true;
      }
      break;
    case 'in-imm':
      result.writes = true;
      break;
    case 'in-reg':
    case 'in0':
      if (inst.reg === 'a') {
        result.writes = true;
      }
      break;
    case 'out-imm':
      result.reads = true;
      break;
    case 'out-reg':
    case 'out0':
      if (inst.reg === 'a') {
        result.reads = true;
      }
      break;
    case 'ld-reg-imm':
      if (inst.dest === 'a') {
        result.writes = true;
      }
      break;
    case 'ld-reg-reg':
      if (inst.src === 'a') {
        result.reads = true;
      }
      if (inst.dest === 'a') {
        result.writes = true;
      }
      break;
    case 'ld-reg-ind':
    case 'ld-reg-mem':
      if (inst.dest === 'a') {
        result.writes = true;
      }
      break;
    case 'ld-ind-reg':
    case 'ld-mem-reg':
      if (inst.src === 'a') {
        result.reads = true;
      }
      break;
    case 'alu-imm':
      result.reads = true;
      if (inst.op !== 'cp') {
        result.writes = true;
      }
      break;
    case 'alu-reg':
      result.reads = true;
      if (inst.op !== 'cp') {
        result.writes = true;
      }
      break;
    case 'ex-af':
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
    case 'daa':
    case 'cpl':
    case 'neg':
      result.reads = true;
      result.writes = true;
      break;
    default:
      break;
  }

  return result;
}

function describeAAccess(access) {
  if (access.reads && access.writes) {
    return 'reads+writes A';
  }
  if (access.reads) {
    return 'reads A';
  }
  if (access.writes) {
    return 'writes A';
  }
  return 'no A access';
}

function createContinuationCapture() {
  return {
    armed: false,
    done: false,
    stubReturn: null,
    first10: [],
    scannedInstructionCount: 0,
    scannedBlockCount: 0,
    returnedAStillAlive: false,
    firstATouch: null,
    firstReturnedAReader: null,
    firstOverwrite: null,
  };
}

function consumeContinuationBlock(capture, blockPc, mode, meta) {
  if (!capture || !capture.armed || capture.done) {
    return;
  }

  capture.scannedBlockCount++;
  const instructions = meta?.instructions ?? [];

  for (const inst of instructions) {
    capture.scannedInstructionCount++;

    const row = {
      index: capture.scannedInstructionCount,
      blockPc: blockPc & 0xFFFFFF,
      pc: inst.pc & 0xFFFFFF,
      mode: inst.mode ?? mode ?? 'adl',
      dasm: inst.dasm ?? formatInstruction(inst),
    };

    if (capture.first10.length < POST_RETURN_FIRST_INSTRUCTIONS) {
      capture.first10.push(row);
    }

    const access = classifyAAccess(inst);
    if (!capture.firstATouch && (access.reads || access.writes)) {
      capture.firstATouch = { ...row, access };
    }

    if (capture.returnedAStillAlive && access.reads && !capture.firstReturnedAReader) {
      capture.firstReturnedAReader = { ...row, access };
    }

    if (capture.returnedAStillAlive && access.writes && !capture.firstOverwrite) {
      capture.firstOverwrite = { ...row, access };
    }

    if (access.writes) {
      capture.returnedAStillAlive = false;
    }

    if (capture.scannedInstructionCount >= POST_RETURN_SCAN_LIMIT) {
      break;
    }
  }

  if (
    capture.first10.length >= POST_RETURN_FIRST_INSTRUCTIONS
    && (!capture.returnedAStillAlive || capture.scannedInstructionCount >= POST_RETURN_SCAN_LIMIT)
  ) {
    capture.done = true;
    capture.armed = false;
  }

  if (capture.scannedInstructionCount >= POST_RETURN_SCAN_LIMIT || capture.scannedBlockCount >= POST_RETURN_BLOCK_LIMIT) {
    capture.done = true;
    capture.armed = false;
  }
}

function installStubOverride(executor, overrideA, continuationCapture, runtimeState) {
  for (const mode of ['z80', 'adl']) {
    const key = `001768:${mode}`;
    const original = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (typeof original !== 'function') {
      continue;
    }

    executor.compiledBlocks[key] = function wrapped001768(cpu) {
      const result = original(cpu);
      cpu.a = overrideA & 0xFF;

      if (continuationCapture && !continuationCapture.stubReturn && typeof result === 'number' && result >= 0) {
        continuationCapture.stubReturn = {
          step: runtimeState.currentStep,
          fromPc: runtimeState.currentPc,
          fromMode: mode,
          returnPc: result & 0xFFFFFF,
          returnMode: resolveNextMode(meta, result, mode),
          aAfterOverride: cpu.a & 0xFF,
          bAfterStub: cpu.b & 0xFF,
          spAfterRet: cpu.sp & 0xFFFFFF,
        };
        continuationCapture.armed = true;
        continuationCapture.returnedAStillAlive = true;
      }

      return result;
    };
  }
}

function runScenario(scenario, createExecutor, createPeripheralBus, blocks, romBytes, captureContinuation = false) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });

  const continuation = captureContinuation ? createContinuationCapture() : null;
  const runtimeState = {
    currentStep: -1,
    currentPc: BOOT_ENTRY,
  };

  installStubOverride(executor, scenario.value, continuation, runtimeState);

  const sequence = [];
  const uniqueBlockKeys = new Set();
  let furthestPc = BOOT_ENTRY;
  let furthestMode = BOOT_MODE;

  const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: RUN_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    wakeFromHalt: 'nmi',
    onBlock(pc, mode, meta, steps) {
      const normalizedMode = mode ?? 'adl';
      const normalizedPc = pc & 0xFFFFFF;
      runtimeState.currentStep = steps;
      runtimeState.currentPc = normalizedPc;

      const key = blockKey(normalizedPc, normalizedMode);
      sequence.push({
        step: steps,
        pc: normalizedPc,
        mode: normalizedMode,
        key,
      });
      uniqueBlockKeys.add(key);

      if (normalizedPc > furthestPc) {
        furthestPc = normalizedPc;
        furthestMode = normalizedMode;
      }

      consumeContinuationBlock(continuation, normalizedPc, normalizedMode, meta);
    },
  });

  return {
    scenario,
    run,
    sequence,
    uniqueBlockKeys,
    uniqueBlockCount: uniqueBlockKeys.size,
    furthestPc,
    furthestMode,
    cycle: analyzeCycle(sequence),
    continuation,
  };
}

function compareWithBaseline(baseline, candidate) {
  const newBlocks = sortBlockKeys(
    [...candidate.uniqueBlockKeys].filter((key) => !baseline.uniqueBlockKeys.has(key)),
  );

  const sameCycle = baseline.cycle && candidate.cycle
    ? baseline.cycle.length === candidate.cycle.length
      && arraysEqual(baseline.cycle.canonicalKeys, candidate.cycle.canonicalKeys)
    : false;

  return {
    newBlocks,
    sameCycle,
  };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? {};

  if (!Object.keys(blocks).length) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  const jumpTableEntries = decodeJumpTable(romBytes);
  const targetDisassembly = TARGETS.map((target) => {
    const rows = decodeRange(romBytes, decodeInstruction, target, 'z80', DISASM_BYTE_COUNT);
    return {
      target,
      rows,
      summary: summarizeTargetLoads(rows),
    };
  });

  const runs = SCENARIOS.map((scenario, index) => runScenario(
    scenario,
    createExecutor,
    createPeripheralBus,
    blocks,
    romBytes,
    index === 0,
  ));

  const baseline = runs[0];

  console.log('Phase 355: Jump Table 0x000080 + 0x001768 override probe');
  console.log('=========================================================');
  console.log(`Boot entry:             ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Run length:             ${RUN_STEPS.toLocaleString()} lifted-block steps`);
  console.log(`Wake from HALT:         nmi`);
  console.log(`Timer interrupt:        false`);
  console.log(`Transpiled ROM:         ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);

  console.log('\nJump table 0x000080..0x00009F');
  console.log('-----------------------------');
  for (const entry of jumpTableEntries) {
    const marker = TARGETS.includes(entry.target) ? '  [requested target]' : '';
    console.log(
      `[${String(entry.slot).padStart(2, '0')}] +${hex(entry.offset, 2)} `
      + `${hex(entry.addr)}  ${entry.bytes}  -> ${entry.opcode === 0xC3 ? 'JP' : `OP ${hexByte(entry.opcode)}`} ${hex(entry.target)}${marker}`,
    );
  }

  console.log('\nTarget disassembly (20 bytes each, z80 decode)');
  console.log('---------------------------------------------');
  for (const item of targetDisassembly) {
    const aText = item.summary.aValue === null ? 'unchanged before first RET' : hexByte(item.summary.aValue);
    const bText = item.summary.bValue === null ? 'unchanged before first RET' : hexByte(item.summary.bValue);
    console.log(`${hex(item.target)}  A=${aText}  B=${bText}  first RET=${hex(item.summary.firstRetPc)}`);
    for (const row of item.rows) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}`);
    }
    console.log('');
  }

  console.log('A-override boot tests');
  console.log('---------------------');
  console.log('scenario         forcedA  uniqueBlocks  furthest         cycleLen  cycle2203  newBlocksVsBaseline');
  for (const run of runs) {
    const compare = run === baseline ? null : compareWithBaseline(baseline, run);
    const cycleLen = run.cycle ? String(run.cycle.length) : 'none';
    const cycle2203 = run.cycle
      ? (baseline.cycle && compare ? (compare.sameCycle ? 'yes' : 'no') : (run.cycle.length === 2203 ? 'baseline' : 'baseline-diff'))
      : 'no-cycle';
    const newBlockCount = run === baseline ? 0 : compare.newBlocks.length;

    console.log(
      `${run.scenario.label.padEnd(16)} `
      + `${hexByte(run.scenario.value).padEnd(8)} `
      + `${String(run.uniqueBlockCount).padStart(12)} `
      + `${`${hex(run.furthestPc)}:${run.furthestMode}`.padEnd(15)} `
      + `${cycleLen.padStart(8)} `
      + `${cycle2203.padEnd(10)} `
      + `${String(newBlockCount).padStart(18)}`,
    );
  }

  for (const run of runs) {
    console.log(`\n${run.scenario.label}`);
    console.log('-'.repeat(run.scenario.label.length));
    console.log(`Forced A after 0x001768 RET: ${hexByte(run.scenario.value)}`);
    console.log(`Termination:                ${run.run.termination}`);
    console.log(`Total steps:                ${run.run.steps.toLocaleString()}`);
    console.log(`Unique blocks visited:      ${run.uniqueBlockCount}`);
    console.log(`Furthest PC reached:        ${hex(run.furthestPc)}:${run.furthestMode}`);
    console.log(`Last PC:                    ${hex(run.run.lastPc)}:${run.run.lastMode ?? 'adl'}`);

    if (run.cycle) {
      console.log(`Detected repeat:            yes`);
      console.log(`Repeat start step:          ${run.cycle.start}`);
      console.log(`Repeat length:              ${run.cycle.length}`);
      console.log(`Unique blocks in repeat:    ${run.cycle.uniqueKeyCount}`);
    } else {
      console.log('Detected repeat:            no exact adjacent repeated window');
    }

    if (run !== baseline) {
      const compare = compareWithBaseline(baseline, run);
      console.log(`Same 2203-step cycle:       ${compare.sameCycle ? 'yes' : 'no'}`);
      console.log(`New blocks vs baseline:     ${compare.newBlocks.length ? formatBlockKeys(compare.newBlocks) : 'none'}`);
    }
  }

  console.log('\nContinuation after 0x001768 returns');
  console.log('----------------------------------');
  if (!baseline.continuation?.stubReturn) {
    console.log('0x001768 was not observed during the baseline run.');
  } else {
    const capture = baseline.continuation;
    console.log(
      `Stub return observed at step ${capture.stubReturn.step}: `
      + `${hex(capture.stubReturn.fromPc)}:${capture.stubReturn.fromMode} -> `
      + `${hex(capture.stubReturn.returnPc)}:${capture.stubReturn.returnMode} `
      + `with A=${hexByte(capture.stubReturn.aAfterOverride)} B=${hexByte(capture.stubReturn.bAfterStub)} SP=${hex(capture.stubReturn.spAfterRet)}`,
    );
    console.log(`First ${POST_RETURN_FIRST_INSTRUCTIONS} executed instructions after the RET:`);
    for (const row of capture.first10) {
      console.log(`  [${String(row.index).padStart(2, '0')}] ${hex(row.pc)}:${row.mode}  ${row.dasm}`);
    }

    if (!capture.firstReturnedAReader) {
      console.log('First reader of returned A: none observed before the scan limit.');
    } else {
      console.log(
        `First reader of returned A: ${hex(capture.firstReturnedAReader.pc)}:${capture.firstReturnedAReader.mode} `
        + `${capture.firstReturnedAReader.dasm} (${describeAAccess(capture.firstReturnedAReader.access)})`,
      );
    }

    if (!capture.firstOverwrite) {
      console.log('First overwrite of returned A: none observed before the scan limit.');
    } else {
      console.log(
        `First overwrite of returned A: ${hex(capture.firstOverwrite.pc)}:${capture.firstOverwrite.mode} `
        + `${capture.firstOverwrite.dasm} (${describeAAccess(capture.firstOverwrite.access)})`,
      );
    }

    if (capture.firstReturnedAReader && capture.firstOverwrite) {
      console.log(
        'Interpretation: the returned A value is first preserved by `push af`, then replaced by `in0 a, (0x3d)` '
        + 'before any branch or compare consumes it.',
      );
    }
  }

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
