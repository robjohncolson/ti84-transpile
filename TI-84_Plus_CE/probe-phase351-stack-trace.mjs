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
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const TARGET_BLOCK_KEY = '00069a:z80';
const TARGET_RET_PC = 0x0006A8;
const EXPECTED_RETURN_ADDRESS = 0x001AFD;
const MAX_BLOCKS = 500;
const MAX_INSTRUCTIONS = 100000;
const RECENT_HISTORY_LIMIT = 16;
const STACK_FRAME_COUNT = 3;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return memory;
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

function buildFallthroughMap(blocks) {
  const map = new Map();

  for (const block of Object.values(blocks)) {
    const mode = block.mode ?? 'adl';
    const instructions = block.instructions ?? [];

    for (const instruction of instructions) {
      if (typeof instruction.fallthrough !== 'number') {
        continue;
      }

      const key = blockKey(instruction.fallthrough, mode);
      const entries = map.get(key) ?? [];
      entries.push({
        sourcePc: instruction.pc,
        mode,
        dasm: instruction.dasm,
        tag: instruction.tag,
        target: instruction.target,
      });
      map.set(key, entries);
    }
  }

  return map;
}

function describeBlock(block) {
  const instructions = block?.instructions ?? [];

  if (instructions.length === 0) {
    return 'no lifted instructions';
  }

  return instructions
    .slice(0, 2)
    .map((instruction) => instruction.dasm)
    .join(' ; ');
}

function describeAddress(addr, preferredMode, blockMeta, fallthroughMap) {
  const candidateModes = preferredMode
    ? [preferredMode, preferredMode === 'z80' ? 'adl' : 'z80']
    : ['z80', 'adl'];

  let resolvedMode = preferredMode ?? 'z80';
  let block = null;

  for (const mode of candidateModes) {
    const candidate = blockMeta[blockKey(addr, mode)];

    if (!candidate) {
      continue;
    }

    resolvedMode = mode;
    block = candidate;
    break;
  }

  const descriptionParts = [];

  if (block) {
    descriptionParts.push(`${resolvedMode} block ${hex(addr)}: ${describeBlock(block)}`);
  } else {
    descriptionParts.push(`no lifted block at ${hex(addr)}`);
  }

  const inbound = fallthroughMap.get(blockKey(addr, resolvedMode)) ?? [];
  const preferredInbound = inbound.find((entry) => entry.tag === 'call' || entry.tag === 'call-conditional' || entry.tag === 'rst')
    ?? inbound[0];

  if (preferredInbound) {
    descriptionParts.push(`fallthrough from ${preferredInbound.dasm} at ${hex(preferredInbound.sourcePc)}`);
  }

  return descriptionParts.join('; ');
}

function getEffectiveStackBase(cpu) {
  if (cpu.madl) {
    return cpu.sp & 0xFFFFFF;
  }

  return ((cpu.mbase & 0xFF) << 16) | (cpu.sp & 0xFFFF);
}

function readStackBytes(cpu, stackBase, count) {
  const bytes = [];

  for (let offset = 0; offset < count; offset++) {
    bytes.push(cpu.read8((stackBase + offset) & 0xFFFFFF));
  }

  return bytes;
}

function readReturnFrame(cpu, stackBase, mode, index) {
  const width = mode === 'adl' ? 3 : 2;
  const address = (stackBase + (index * width)) & 0xFFFFFF;
  const value = mode === 'adl' ? cpu.read24(address) : cpu.read16(address);

  return { index, address, width, value };
}

function classifyTransferInstruction(meta) {
  const instructions = meta?.instructions ?? [];

  return instructions.find((instruction) => (
    instruction.tag === 'call'
    || instruction.tag === 'call-conditional'
    || instruction.tag === 'rst'
  )) ?? null;
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const memory = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
const { cpu, compiledBlocks, blockMeta } = executor;

const fallthroughMap = buildFallthroughMap(PRELIFTED_BLOCKS);
const recentBlocks = [];
const trackedControlFrames = [];
const retPoHits = [];
const missingBlockEvents = [];

let observedInstructionCount = 0;

const originalPush = cpu.push.bind(cpu);
cpu.push = (value) => {
  const mode = cpu.madl ? 'adl' : 'z80';
  const pc = cpu._currentBlockPc & 0xFFFFFF;
  const key = blockKey(pc, mode);
  const meta = blockMeta[key];
  const transfer = classifyTransferInstruction(meta);

  originalPush(value);

  if (!transfer) {
    return;
  }

  trackedControlFrames.push({
    blockPc: pc,
    blockMode: mode,
    dasm: transfer.dasm,
    tag: transfer.tag,
    target: transfer.target,
    returnAddress: value & (mode === 'adl' ? 0xFFFFFF : 0xFFFF),
    stackBase: getEffectiveStackBase(cpu),
    spAfterPush: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
  });
};

const originalPopReturn = cpu.popReturn.bind(cpu);
cpu.popReturn = () => {
  const mode = cpu.madl ? 'adl' : 'z80';
  const stackBase = getEffectiveStackBase(cpu);
  const poppedAddress = originalPopReturn();
  const normalizedAddress = poppedAddress & (mode === 'adl' ? 0xFFFFFF : 0xFFFF);

  for (let index = trackedControlFrames.length - 1; index >= 0; index--) {
    const frame = trackedControlFrames[index];

    if (frame.stackBase === stackBase && frame.returnAddress === normalizedAddress) {
      trackedControlFrames.splice(index, 1);
      break;
    }
  }

  return poppedAddress;
};

function logRetPoProbe(cpuInstance, takeReturn) {
  const mode = cpuInstance.madl ? 'adl' : 'z80';
  const sp = cpuInstance.sp & 0xFFFFFF;
  const stackBase = getEffectiveStackBase(cpuInstance);
  const rawBytes = readStackBytes(cpuInstance, stackBase, 8);
  const frames = [];

  for (let index = 0; index < STACK_FRAME_COUNT; index++) {
    frames.push(readReturnFrame(cpuInstance, stackBase, mode, index));
  }

  const returnAddress = frames[0]?.value ?? 0;
  const matchingFrame = [...trackedControlFrames].reverse().find((frame) => (
    frame.stackBase === stackBase
    && frame.returnAddress === returnAddress
    && frame.blockMode === mode
  )) ?? null;

  const verdict = returnAddress === EXPECTED_RETURN_ADDRESS
    ? `matches the post-CALL site after ${hex(0x001AFA)} -> ${hex(0x0058A6)}`
    : (returnAddress >= 0x00069A && returnAddress <= 0x0006D8)
      ? 'points back into the 0x00069A loop region'
      : `does not match expected ${hex(EXPECTED_RETURN_ADDRESS)}`;

  const hit = {
    sp,
    mode,
    stackBase,
    returnAddress,
    takeReturn,
    matchingFrame,
    recentBlocks: recentBlocks.slice(),
  };

  retPoHits.push(hit);

  console.log('');
  console.log(`At ${hex(TARGET_RET_PC)} (RET PO) [hit ${retPoHits.length}]:`);
  console.log(`  SP = ${hex(sp)}`);

  if (mode === 'z80') {
    console.log(`  Stack memory base = ${hex(stackBase)} (MBASE=${hex(cpuInstance.mbase, 2)}; z80 RET uses 16-bit return addresses)`);
  }

  console.log(`  Stack[SP+0] = ${byteHex(rawBytes[0])} (return addr low)`);
  console.log(`  Stack[SP+1] = ${byteHex(rawBytes[1])} (${mode === 'adl' ? 'return addr mid' : 'return addr high in z80 mode'})`);
  console.log(`  Stack[SP+2] = ${byteHex(rawBytes[2])} (${mode === 'adl' ? 'return addr high' : 'next stack byte in z80 mode'})`);
  console.log(`  Return address: ${hex(returnAddress)}`);
  console.log(`  This points to: ${describeAddress(returnAddress, mode, blockMeta, fallthroughMap)}`);

  if (matchingFrame) {
    console.log(`  Pushed by: ${matchingFrame.dasm} at ${hex(matchingFrame.blockPc)} -> target ${hex(matchingFrame.target)}`);
  } else {
    console.log('  Pushed by: no tracked CALL/RST frame matched this stack slot');
  }

  console.log(`  RET PO action: ${takeReturn ? 'condition met, stack return will be taken' : 'condition not met, execution falls through to 0x0006A9'}`);
  console.log(`  Verdict: ${verdict}.`);
  console.log('  Top stack frames:');

  for (const frame of frames) {
    console.log(`    [${frame.index}] ${hex(frame.value)} -> ${describeAddress(frame.value, mode, blockMeta, fallthroughMap)}`);
  }

  const recentFlow = recentBlocks.map((entry) => `${hex(entry.pc)}:${entry.mode}`).join(' -> ');
  console.log(`  Recent blocks: ${recentFlow}`);
}

if (!compiledBlocks[TARGET_BLOCK_KEY]) {
  throw new Error(`Missing lifted block ${TARGET_BLOCK_KEY}.`);
}

compiledBlocks[TARGET_BLOCK_KEY] = function patchedBlock00069aZ80(cpuInstance) {
  cpuInstance.im = 1;
  cpuInstance.ioWritePage0(0x28, cpuInstance.a);
  cpuInstance.a = cpuInstance.ioReadPage0AndUpdateFlags(0x28);
  cpuInstance.testBit(cpuInstance.a, 2);
  cpuInstance.ix = 0x000800;

  const takeReturn = cpuInstance.checkCondition('po');
  logRetPoProbe(cpuInstance, takeReturn);

  if (takeReturn) {
    return cpuInstance.popReturn();
  }

  return 0x0006A9;
};

console.log('Phase 351: RET PO stack trace at 0x0006A8');
console.log('==========================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Target RET PO:       ${hex(TARGET_RET_PC)} inside ${TARGET_BLOCK_KEY}`);
console.log(`Expected return:     ${hex(EXPECTED_RETURN_ADDRESS)} (after CALL 0x0058A6 at 0x001AFA)`);
console.log(`Block limit:         ${MAX_BLOCKS}`);
console.log(`Instruction budget:  ${MAX_INSTRUCTIONS.toLocaleString()} (reported, not forced by executor)`);
console.log(`Timer interrupt:     disabled`);
console.log(
  `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_BLOCKS,
  maxLoopIterations: 50000,
  wakeFromHalt: 'nmi',
  onBlock(blockPc, mode, meta) {
    const normalizedMode = mode ?? 'adl';
    const pc = blockPc & 0xFFFFFF;

    observedInstructionCount += meta?.instructionCount ?? 0;
    recentBlocks.push({ pc, mode: normalizedMode });

    if (recentBlocks.length > RECENT_HISTORY_LIMIT) {
      recentBlocks.shift();
    }
  },
  onMissingBlock(pc, mode, steps) {
    missingBlockEvents.push({ pc, mode, steps });
  },
});

console.log('');
console.log('Summary');
console.log('=======');
console.log(`Termination:         ${run.termination}`);
console.log(`Blocks executed:     ${run.steps}`);
console.log(`Instructions seen:   ${observedInstructionCount}`);
console.log(`RET PO hits:         ${retPoHits.length}`);
console.log(`Last PC:             ${hex(run.lastPc)}:${run.lastMode}`);

if (retPoHits.length === 0) {
  console.log(`Expected return ${hex(EXPECTED_RETURN_ADDRESS)} observed at top of stack: no hits captured`);
} else {
  const uniqueReturns = [...new Set(retPoHits.map((hit) => hit.returnAddress))]
    .map((address) => hex(address))
    .join(', ');
  const allExpected = retPoHits.every((hit) => hit.returnAddress === EXPECTED_RETURN_ADDRESS);
  console.log(`Observed top return addresses: ${uniqueReturns}`);
  console.log(`All hits match ${hex(EXPECTED_RETURN_ADDRESS)}: ${allExpected ? 'YES' : 'NO'}`);
}

if (missingBlockEvents.length > 0) {
  console.log(`Missing blocks:      ${missingBlockEvents.length}`);

  for (const event of missingBlockEvents.slice(0, 10)) {
    console.log(`  step=${event.steps} pc=${hex(event.pc)}:${event.mode}`);
  }
} else {
  console.log('Missing blocks:      none');
}

console.log('\n--- probe complete ---');
