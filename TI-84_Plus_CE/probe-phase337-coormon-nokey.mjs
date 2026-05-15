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
const TRANSPILER_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const COORMON_ENTRY = 0x08BF22;
const GETCSC_ENTRY = 0x042366;
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const IY_BASE = 0xD00080;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0xFFFFFF;
const ROM_LIMIT = 0x400000;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 100000;
const COORMON_MAX_LOOP_ITERATIONS = 100000;

const INTERPRETER_PCS = new Set([0x000310, 0x001C33, 0x001C55]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatBlock(pc, mode) {
  return `${hex(pc)}:${mode ?? 'n/a'}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
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

function bytesHex(buffer, start, length) {
  const from = Math.max(0, start >>> 0);
  const to = Math.min(buffer.length, from + Math.max(0, length | 0));
  return Array.from(buffer.subarray(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetKernelStack(cpu, mem) {
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function isInterpreterPc(pc) {
  return INTERPRETER_PCS.has(pc >>> 0);
}

function getBlockSummary(block) {
  return block?.instructions?.[0]?.dasm ?? block?.instructions?.[0]?.tag ?? '<unknown>';
}

function getBlock(blocks, pc, mode) {
  return blocks[blockKey(pc, mode)] ?? null;
}

function hasBlock(blocks, pc, mode) {
  return Boolean(getBlock(blocks, pc, mode));
}

function readStackEntries(mem, sp, count = 6) {
  const entries = [];
  for (let index = 0; index < count; index++) {
    const addr = (sp + (index * 3)) & 0xFFFFFF;
    entries.push({
      addr,
      value: read24(mem, addr),
    });
  }
  return entries;
}

function printStackEntries(entries, prefix = '  ') {
  for (const entry of entries) {
    console.log(`${prefix}${hex(entry.addr)} -> ${hex(entry.value)}`);
  }
}

function findTargetedExit(meta, targetPc) {
  if (!meta?.exits) {
    return null;
  }

  const target = targetPc >>> 0;
  const matches = meta.exits.filter((exit) => exit.target === target);
  if (matches.length === 0) {
    return null;
  }

  const rank = {
    call: 0,
    jump: 1,
    branch: 2,
    fallthrough: 3,
    'call-return': 4,
  };

  matches.sort((left, right) => {
    const leftRank = rank[left.type] ?? 99;
    const rightRank = rank[right.type] ?? 99;
    return leftRank - rightRank;
  });

  return matches[0];
}

function findCallReturnExit(meta) {
  return meta?.exits?.find((exit) => exit.type === 'call-return') ?? null;
}

function hasReturnExit(meta) {
  return Boolean(meta?.exits?.some((exit) => exit.type === 'return' || exit.type === 'return-conditional'));
}

function fallsThroughTo(meta, targetPc) {
  return Boolean(meta?.exits?.some((exit) => exit.type === 'fallthrough' && exit.target === (targetPc >>> 0)));
}

function findLast(items, predicate) {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) {
      return items[index];
    }
  }
  return null;
}

function describeReturnTarget(blocks, addr, preferredMode) {
  const modes = [];
  if (hasBlock(blocks, addr, preferredMode)) {
    modes.push(preferredMode);
  }
  for (const mode of ['adl', 'z80']) {
    if (mode !== preferredMode && hasBlock(blocks, addr, mode)) {
      modes.push(mode);
    }
  }
  return modes;
}

function disassembleAt(romBytes, startPc, count = 10) {
  let pc = startPc >>> 0;
  for (let index = 0; index < count; index++) {
    try {
      const instruction = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, instruction?.length ?? 1);
      const bytes = bytesHex(romBytes, pc, length);
      const text = instruction?.asm ?? instruction?.dasm ?? instruction?.tag ?? '<unknown>';
      console.log(`  ${hex(pc)}: ${bytes.padEnd(24)} ${text}`);
      pc = (pc + length) >>> 0;
    } catch (error) {
      console.log(`  ${hex(pc)}: <decode failed: ${error?.message ?? error}>`);
      pc = (pc + 1) >>> 0;
    }
  }
}

function searchTranspilerForAddress(addr) {
  const text = fs.readFileSync(TRANSPILER_SCRIPT_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  const needle = `0x${(addr >>> 0).toString(16)}`;
  const exact = new RegExp(`\\b${needle}\\b`, 'i');
  const matches = [];
  const seedMatches = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!exact.test(line)) {
      continue;
    }

    const hit = {
      lineNumber: index + 1,
      text: line.trim(),
    };
    matches.push(hit);
    if (/\{\s*pc:\s*0x[0-9a-f]+/i.test(line)) {
      seedMatches.push(hit);
    }
  }

  return {
    needle,
    matches,
    seedMatches,
    alreadySeeded: seedMatches.length > 0,
  };
}

function runStandardBoot(romBytes, executor, mem) {
  const cpu = executor.cpu;

  console.log('Boot sequence');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  console.log(`  phase1 boot:   steps=${boot.steps} termination=${boot.termination} lastPc=${formatBlock(boot.lastPc, boot.lastMode)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetKernelStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });
  console.log(`  phase2 kernel: steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${formatBlock(kernelInit.lastPc, kernelInit.lastMode)}`);

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  return { boot, kernelInit };
}

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
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 337: CoorMon no-key missing-block probe');
console.log(`CoorMon entry: ${hex(COORMON_ENTRY)}`);
console.log(`GetCSC entry:  ${hex(GETCSC_ENTRY)}`);
console.log(`cxMain ptr:    ${hex(CXMAIN_PTR)}`);
console.log(`home handler:  ${hex(HOME_HANDLER)}`);
console.log(`sentinel:      ${hex(RETURN_SENTINEL)}`);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

runStandardBoot(romBytes, executor, mem);

write24(mem, CXMAIN_PTR, HOME_HANDLER);
console.log(`\nInstalled cxMain: ${hex(read24(mem, CXMAIN_PTR))}`);
console.log(`Post-boot stack top: SP=${hex(cpu.sp)} value=${hex(read24(mem, cpu.sp))}`);

const trace = [];
const uniqueBlocks = new Set();
const missingHits = [];
const callEvents = [];
const retEvents = [];
const flowEvents = [];
const logicalFrames = [];
let firstInterpreterEntry = null;
let previous = null;

const coormon = executor.runFrom(COORMON_ENTRY, 'adl', {
  maxSteps: COORMON_MAX_STEPS,
  maxLoopIterations: COORMON_MAX_LOOP_ITERATIONS,
  onMissingBlock(pc, mode, steps) {
    missingHits.push({
      pc: pc >>> 0,
      mode,
      step: steps,
    });
  },
  onBlock(pc, mode, meta, steps) {
    const currentPc = pc & 0xFFFFFF;
    const currentSp = cpu.sp & 0xFFFFFF;
    const currentTop = read24(mem, currentSp);

    trace.push({
      step: steps,
      pc: currentPc,
      mode,
      sp: currentSp,
    });
    uniqueBlocks.add(blockKey(currentPc, mode));

    if (previous) {
      const exit = findTargetedExit(previous.meta, currentPc);
      const tookReturn = hasReturnExit(previous.meta) && !fallsThroughTo(previous.meta, currentPc);
      const spDelta = currentSp - previous.sp;
      const baseEvent = {
        step: steps,
        fromPc: previous.pc,
        fromMode: previous.mode,
        toPc: currentPc,
        toMode: mode,
        exitType: tookReturn ? 'return' : (exit?.type ?? 'dynamic'),
        spBefore: previous.sp,
        spAfter: currentSp,
        spDelta,
      };

      if (exit?.type === 'call') {
        const callReturn = findCallReturnExit(previous.meta);
        const returnAddr = currentTop;
        const callEvent = {
          ...baseEvent,
          returnAddr,
          expectedReturnAddr: callReturn?.target ?? null,
          expectedReturnMode: callReturn?.targetMode ?? previous.mode,
          stackSnapshot: readStackEntries(mem, currentSp, 6),
        };
        callEvents.push(callEvent);
        logicalFrames.push({
          callerPc: previous.pc,
          callerMode: previous.mode,
          calleePc: currentPc,
          calleeMode: mode,
          returnAddr,
          returnMode: callEvent.expectedReturnMode,
          step: steps,
          entrySp: currentSp,
        });
        if (isInterpreterPc(previous.pc) || isInterpreterPc(currentPc)) {
          flowEvents.push(callEvent);
        }
      } else if (tookReturn) {
        const poppedValueAddr = (currentSp - 3) & 0xFFFFFF;
        const poppedValue = read24(mem, poppedValueAddr);
        let matchedFrame = null;
        for (let index = logicalFrames.length - 1; index >= 0; index--) {
          if (logicalFrames[index].returnAddr === currentPc) {
            matchedFrame = logicalFrames.splice(index, 1)[0];
            break;
          }
        }
        const retEvent = {
          ...baseEvent,
          poppedValueAddr,
          poppedValue,
          matchedFrame,
        };
        retEvents.push(retEvent);
        if (isInterpreterPc(previous.pc) || isInterpreterPc(currentPc)) {
          flowEvents.push(retEvent);
        }
      } else if (isInterpreterPc(previous.pc) || isInterpreterPc(currentPc) || exit?.type === 'jump') {
        flowEvents.push(baseEvent);
      }
    }

    if (!firstInterpreterEntry && isInterpreterPc(currentPc)) {
      firstInterpreterEntry = {
        step: steps,
        pc: currentPc,
        mode,
        sp: currentSp,
        stackSnapshot: readStackEntries(mem, currentSp, 6),
        previousPc: previous?.pc ?? null,
        previousMode: previous?.mode ?? null,
      };
    }

    previous = {
      step: steps,
      pc: currentPc,
      mode,
      sp: currentSp,
      meta,
    };
  },
});

const last20 = trace.slice(Math.max(0, trace.length - 20));
const missingAddr = coormon.termination === 'missing_block' ? (coormon.lastPc >>> 0) : null;
const missingMode = coormon.lastMode ?? 'adl';

console.log('\nRun summary');
console.log(`  steps:            ${coormon.steps}`);
console.log(`  termination:      ${coormon.termination}`);
console.log(`  lastPc:           ${formatBlock(coormon.lastPc, coormon.lastMode)}`);
console.log(`  full trace size:  ${trace.length}`);
console.log(`  unique blocks:    ${uniqueBlocks.size}`);
console.log(`  call events:      ${callEvents.length}`);
console.log(`  return events:    ${retEvents.length}`);

console.log('\nLast 20 blocks before termination');
for (const record of last20) {
  const block = getBlock(PRELIFTED_BLOCKS, record.pc, record.mode);
  console.log(`  step=${String(record.step).padStart(6)} pc=${formatBlock(record.pc, record.mode)} sp=${hex(record.sp)} ${getBlockSummary(block)}`);
}

if (missingHits.length > 0) {
  console.log('\nMissing-block callbacks');
  for (const hit of missingHits) {
    console.log(`  step=${String(hit.step).padStart(6)} missing=${formatBlock(hit.pc, hit.mode)}`);
  }
}

if (missingAddr !== null) {
  console.log('\nMissing block diagnostics');
  console.log(`  MISSING ADDRESS: ${formatBlock(missingAddr, missingMode)}`);
  console.log(`  in ROM (< ${hex(ROM_LIMIT)}): ${missingAddr < ROM_LIMIT}`);
  console.log(`  transpiled availability: adl=${hasBlock(PRELIFTED_BLOCKS, missingAddr, 'adl')} z80=${hasBlock(PRELIFTED_BLOCKS, missingAddr, 'z80')}`);
  if (missingAddr === RETURN_SENTINEL) {
    console.log('  note: missing address is the synthetic RETURN_SENTINEL, so this looks like top-level unwind rather than an unseeded ROM block.');
  }

  if (missingAddr < ROM_LIMIT) {
    console.log('\nDisassembly at missing ROM address (10 instructions, ADL decode)');
    disassembleAt(romBytes, missingAddr, 10);
  } else {
    console.log('\nSkipping ROM disassembly because the missing address is outside the ROM window.');
  }
}

console.log('\nTermination stack state');
console.log(`  SP:              ${hex(cpu.sp)}`);
console.log(`  bytes @ SP:      ${bytesHex(mem, cpu.sp, 24)}`);
console.log('  24-bit entries:');
printStackEntries(readStackEntries(mem, cpu.sp, 6), '    ');

if (missingAddr !== null) {
  console.log('\nTEST B: Transpiler seed search');
  const seedSearch = searchTranspilerForAddress(missingAddr);
  console.log(`  search token:    ${seedSearch.needle}`);
  console.log(`  text hits:       ${seedSearch.matches.length}`);
  console.log(`  seed-style hits: ${seedSearch.seedMatches.length}`);

  if (seedSearch.alreadySeeded) {
    console.log('  verdict:         already present as a seed in scripts/transpile-ti84-rom.mjs');
  } else if (seedSearch.matches.length > 0) {
    console.log('  verdict:         address appears in the transpiler script, but not as a `{ pc: ... }` seed entry');
  } else {
    console.log('  verdict:         no hit in scripts/transpile-ti84-rom.mjs; seed likely needs to be added');
  }

  for (const hit of seedSearch.matches.slice(0, 8)) {
    console.log(`  line ${String(hit.lineNumber).padStart(5)}: ${hit.text}`);
  }
}

console.log('\nTEST C: Return-chain analysis');
if (!firstInterpreterEntry) {
  console.log('  No interpreter block (0x000310/0x001C33/0x001C55) was entered.');
} else {
  console.log(`  First interpreter block: ${formatBlock(firstInterpreterEntry.pc, firstInterpreterEntry.mode)} at step ${firstInterpreterEntry.step}`);
  if (firstInterpreterEntry.previousPc !== null) {
    console.log(`  Previous block:         ${formatBlock(firstInterpreterEntry.previousPc, firstInterpreterEntry.previousMode)}`);
  }
  console.log('  Stack when interpreter was first entered:');
  printStackEntries(firstInterpreterEntry.stackSnapshot, '    ');
}

const earliestTailInterpreter = last20.find((record) => isInterpreterPc(record.pc)) ?? null;
const tailInterpreterTransfer = earliestTailInterpreter
  ? findLast(
      flowEvents,
      (event) =>
        event.step <= earliestTailInterpreter.step &&
        isInterpreterPc(event.toPc) &&
        (event.exitType === 'call' || event.exitType === 'jump'),
    )
  : null;

if (!earliestTailInterpreter) {
  console.log('  Last 20 blocks do not include interpreter PCs.');
} else {
  console.log(`  Earliest interpreter PC in tail: ${formatBlock(earliestTailInterpreter.pc, earliestTailInterpreter.mode)} at step ${earliestTailInterpreter.step}`);
  if (tailInterpreterTransfer) {
    console.log(`  Entry transfer before tail:      ${formatBlock(tailInterpreterTransfer.fromPc, tailInterpreterTransfer.fromMode)} -> ${formatBlock(tailInterpreterTransfer.toPc, tailInterpreterTransfer.toMode)} via ${tailInterpreterTransfer.exitType}`);
  } else {
    console.log('  Entry transfer before tail:      not found');
  }
}

const outerInterpreterCall = findLast(
  callEvents,
  (event) => isInterpreterPc(event.toPc),
);

if (!outerInterpreterCall) {
  console.log('  No explicit CALL into the interpreter was observed.');
} else {
  const validModes = describeReturnTarget(
    PRELIFTED_BLOCKS,
    outerInterpreterCall.returnAddr,
    outerInterpreterCall.expectedReturnMode,
  );
  console.log(`  CALL into interpreter:           ${formatBlock(outerInterpreterCall.fromPc, outerInterpreterCall.fromMode)} -> ${formatBlock(outerInterpreterCall.toPc, outerInterpreterCall.toMode)} at step ${outerInterpreterCall.step}`);
  console.log(`  Return address on stack:         ${hex(outerInterpreterCall.returnAddr)} (expected ${hex(outerInterpreterCall.expectedReturnAddr)})`);
  console.log(`  Return target transpiled:        ${validModes.length > 0 ? validModes.join(', ') : 'no'}`);
  console.log('  Stack snapshot at CALL entry:');
  printStackEntries(outerInterpreterCall.stackSnapshot, '    ');
}

const lastReturn = findLast(
  retEvents,
  (event) => isInterpreterPc(event.fromPc) || (event.matchedFrame && isInterpreterPc(event.matchedFrame.calleePc)),
);

if (lastReturn) {
  console.log(`  Most recent interpreter RET:     ${formatBlock(lastReturn.fromPc, lastReturn.fromMode)} -> ${formatBlock(lastReturn.toPc, lastReturn.toMode)} at step ${lastReturn.step}`);
  console.log(`  Popped value:                    ${hex(lastReturn.poppedValue)} from ${hex(lastReturn.poppedValueAddr)}`);
}

console.log('\nPhase 337 complete.');
