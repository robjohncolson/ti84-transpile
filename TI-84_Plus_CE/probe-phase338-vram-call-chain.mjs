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

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const COORMON_ENTRY = 0x08BF22;
const COORMON_EPILOGUE = 0x08BF9E;

const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const GETCSC_CERT_ADDR = 0x3B0033;

const IY_BASE = 0xD00080;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0xFFFFFF;

const FILL_REGION_START = 0x09EF44;
const FILL_SETUP_ENTRY = 0x09EF44;
const FILL_LOOP_ENTRY = 0x09EFDE;
const FILLRECT_ENTRY = 0x09F008;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 50000;
const COORMON_MAX_LOOP_ITERATIONS = 50000;

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

function prepareDirectEntry(cpu, mem) {
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function runStandardBoot(executor, mem) {
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetKernelStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  prepareDirectEntry(cpu, mem);

  return { boot, kernelInit };
}

function getBlockSummary(meta) {
  if (!meta?.instructions?.length) {
    return '<unknown>';
  }

  const parts = meta.instructions.map((instruction) => instruction.dasm ?? instruction.tag ?? '<unknown>');
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} ; ${parts[1]}`;
  }
  return `${parts[0]} ; ... ; ${parts[parts.length - 1]}`;
}

function describeExits(meta) {
  if (!meta?.exits?.length) {
    return 'none';
  }

  return meta.exits
    .map((exit) => {
      if (exit.target === undefined) {
        return exit.type;
      }
      return `${exit.type}->${formatBlock(exit.target, exit.targetMode ?? 'adl')}`;
    })
    .join(', ');
}

function findTargetedExit(meta, targetPc, targetMode) {
  if (!meta?.exits) {
    return null;
  }

  const normalizedPc = targetPc >>> 0;
  const exactModeMatches = meta.exits.filter((exit) => (
    exit.target === normalizedPc &&
    (exit.targetMode === undefined || exit.targetMode === targetMode)
  ));
  const looseMatches = meta.exits.filter((exit) => exit.target === normalizedPc);
  const matches = exactModeMatches.length > 0 ? exactModeMatches : looseMatches;

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

function fallsThroughTo(meta, targetPc, targetMode) {
  const normalizedPc = targetPc >>> 0;
  return Boolean(meta?.exits?.some((exit) => (
    exit.type === 'fallthrough' &&
    exit.target === normalizedPc &&
    (exit.targetMode === undefined || exit.targetMode === targetMode)
  )));
}

function isFillRegionPc(pc) {
  const normalized = pc >>> 0;
  return normalized >= FILL_REGION_START && normalized < FILLRECT_ENTRY;
}

function summarizeHits(trace, predicate) {
  const hits = [];
  for (const record of trace) {
    if (predicate(record)) {
      hits.push(record);
    }
  }

  return {
    count: hits.length,
    first: hits.length > 0 ? hits[0] : null,
    last: hits.length > 0 ? hits[hits.length - 1] : null,
    hits,
  };
}

function cloneFrames(frames) {
  return frames.map((frame, index) => ({
    kind: frame.kind,
    depth: index,
    callerPc: frame.callerPc ?? null,
    callerMode: frame.callerMode ?? null,
    entryPc: frame.entryPc,
    entryMode: frame.entryMode,
    returnAddr: frame.returnAddr,
    returnMode: frame.returnMode,
    enterStep: frame.enterStep,
  }));
}

function buildRootFrame() {
  return {
    kind: 'root',
    callerPc: null,
    callerMode: null,
    entryPc: COORMON_ENTRY,
    entryMode: 'adl',
    returnAddr: RETURN_SENTINEL,
    returnMode: 'adl',
    enterStep: 0,
  };
}

function findMatchingFrameIndex(frameStack, targetPc, targetMode) {
  for (let index = frameStack.length - 1; index >= 1; index--) {
    const frame = frameStack[index];
    if (frame.returnAddr === (targetPc >>> 0) && frame.returnMode === targetMode) {
      return index;
    }
  }

  for (let index = frameStack.length - 1; index >= 1; index--) {
    const frame = frameStack[index];
    if (frame.returnAddr === (targetPc >>> 0)) {
      return index;
    }
  }

  return -1;
}

function applyTransition(previous, currentPc, currentMode, currentSp, currentTop, frameStack, mem, step, stackWarnings) {
  if (!previous) {
    return {
      kind: 'entry',
      exitType: 'entry',
      fromPc: null,
      fromMode: null,
      toPc: currentPc,
      toMode: currentMode,
    };
  }

  const exit = findTargetedExit(previous.meta, currentPc, currentMode);
  const tookReturn = hasReturnExit(previous.meta) && !fallsThroughTo(previous.meta, currentPc, currentMode);

  const base = {
    kind: exit?.type ?? (tookReturn ? 'return' : 'dynamic'),
    exitType: exit?.type ?? (tookReturn ? 'return' : 'dynamic'),
    fromPc: previous.pc,
    fromMode: previous.mode,
    toPc: currentPc,
    toMode: currentMode,
    step,
  };

  if (exit?.type === 'call') {
    const callReturn = findCallReturnExit(previous.meta);
    const frame = {
      kind: 'call',
      callerPc: previous.pc,
      callerMode: previous.mode,
      entryPc: currentPc,
      entryMode: currentMode,
      returnAddr: callReturn?.target ?? currentTop,
      returnMode: callReturn?.targetMode ?? previous.mode,
      enterStep: step,
    };
    frameStack.push(frame);

    if (callReturn?.target !== undefined && callReturn.target !== currentTop) {
      stackWarnings.push({
        type: 'call-return-mismatch',
        step,
        callerPc: previous.pc,
        calleePc: currentPc,
        expectedReturnAddr: callReturn.target,
        actualReturnAddr: currentTop,
      });
    }

    return {
      ...base,
      kind: 'call',
      returnAddr: frame.returnAddr,
      returnMode: frame.returnMode,
      actualReturnAddr: currentTop,
    };
  }

  if (tookReturn) {
    const matchedIndex = findMatchingFrameIndex(frameStack, currentPc, currentMode);
    const discardedFrames = [];
    let matchedFrame = null;

    if (matchedIndex >= 1) {
      while (frameStack.length - 1 > matchedIndex) {
        discardedFrames.push(frameStack.pop());
      }
      matchedFrame = frameStack.pop();
      if (discardedFrames.length > 0) {
        stackWarnings.push({
          type: 'discarded-frames',
          step,
          fromPc: previous.pc,
          toPc: currentPc,
          discardedFrames: discardedFrames.map((frame) => ({
            entryPc: frame.entryPc,
            entryMode: frame.entryMode,
            returnAddr: frame.returnAddr,
            returnMode: frame.returnMode,
          })),
        });
      }
    } else if (frameStack.length > 1) {
      matchedFrame = frameStack.pop();
      stackWarnings.push({
        type: 'unmatched-return',
        step,
        fromPc: previous.pc,
        toPc: currentPc,
        poppedFrame: {
          entryPc: matchedFrame.entryPc,
          entryMode: matchedFrame.entryMode,
          returnAddr: matchedFrame.returnAddr,
          returnMode: matchedFrame.returnMode,
        },
      });
    }

    const poppedValueAddr = ((currentSp - 3) & 0xFFFFFF) >>> 0;
    const poppedValue = read24(mem, poppedValueAddr);

    return {
      ...base,
      kind: 'return',
      matchedFrame,
      discardedFrames,
      poppedValueAddr,
      poppedValue,
    };
  }

  return base;
}

function printHitSummary(label, summary) {
  if (summary.count === 0) {
    console.log(`  ${label}: 0 hits`);
    return;
  }

  console.log(
    `  ${label}: ${summary.count} hits, first=${formatBlock(summary.first.pc, summary.first.mode)} ` +
    `@ step ${summary.first.step} trace#${summary.first.index}, ` +
    `last=${formatBlock(summary.last.pc, summary.last.mode)} @ step ${summary.last.step} trace#${summary.last.index}`,
  );
}

function printFrameChain(title, hit) {
  console.log(`\n${title}`);
  if (!hit) {
    console.log('  (not reached)');
    return;
  }

  console.log(`  block:        ${formatBlock(hit.pc, hit.mode)} at step ${hit.step} trace#${hit.index}`);
  if (hit.transition?.fromPc !== null && hit.transition?.fromPc !== undefined) {
    console.log(
      `  incoming:     ${formatBlock(hit.transition.fromPc, hit.transition.fromMode)} -> ` +
      `${formatBlock(hit.pc, hit.mode)} via ${hit.transition.kind}`,
    );
  }

  for (const frame of hit.frames) {
    if (frame.kind === 'root') {
      console.log(`  depth ${frame.depth}: root ${formatBlock(frame.entryPc, frame.entryMode)}`);
      continue;
    }

    console.log(
      `  depth ${frame.depth}: ${formatBlock(frame.callerPc, frame.callerMode)} -> ` +
      `${formatBlock(frame.entryPc, frame.entryMode)} return ${formatBlock(frame.returnAddr, frame.returnMode)}`,
    );
  }
}

function formatTransition(record) {
  const transition = record.transition;

  if (transition.kind === 'entry') {
    return 'entry';
  }

  if (transition.kind === 'call') {
    return `call from ${formatBlock(transition.fromPc, transition.fromMode)} ret=${formatBlock(transition.returnAddr, transition.returnMode)}`;
  }

  if (transition.kind === 'return') {
    const frameLabel = transition.matchedFrame
      ? ` frame=${formatBlock(transition.matchedFrame.entryPc, transition.matchedFrame.entryMode)}`
      : '';
    return `return from ${formatBlock(transition.fromPc, transition.fromMode)} popped=${hex(transition.poppedValue)}${frameLabel}`;
  }

  return `${transition.kind} from ${formatBlock(transition.fromPc, transition.fromMode)}`;
}

function printTraceRange(title, records) {
  console.log(`\n${title}`);
  if (records.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const record of records) {
    const indent = '  '.repeat(Math.min(record.depth, 12));
    console.log(
      `${indent}[${String(record.index).padStart(4)}] ` +
      `step=${String(record.step).padStart(5)} depth=${String(record.depth).padStart(2)} ` +
      `pc=${formatBlock(record.pc, record.mode)} sp=${hex(record.sp)} top=${hex(record.stackTop)} ` +
      `via=${formatTransition(record)} :: ${record.summary}`,
    );
  }
}

function printStackWarnings(warnings) {
  console.log('\nShadow stack warnings');
  if (warnings.length === 0) {
    console.log('  none');
    return;
  }

  for (const warning of warnings) {
    if (warning.type === 'call-return-mismatch') {
      console.log(
        `  step=${warning.step} CALL return mismatch: caller=${hex(warning.callerPc)} callee=${hex(warning.calleePc)} ` +
        `expected=${hex(warning.expectedReturnAddr)} actual=${hex(warning.actualReturnAddr)}`,
      );
      continue;
    }

    if (warning.type === 'unmatched-return') {
      console.log(
        `  step=${warning.step} unmatched return: ${hex(warning.fromPc)} -> ${hex(warning.toPc)} ` +
        `popped frame ${formatBlock(warning.poppedFrame.entryPc, warning.poppedFrame.entryMode)} ` +
        `expected return ${formatBlock(warning.poppedFrame.returnAddr, warning.poppedFrame.returnMode)}`,
      );
      continue;
    }

    if (warning.type === 'discarded-frames') {
      const discarded = warning.discardedFrames
        .map((frame) => `${formatBlock(frame.entryPc, frame.entryMode)}=>${formatBlock(frame.returnAddr, frame.returnMode)}`)
        .join(', ');
      console.log(`  step=${warning.step} discarded frames before matching return ${hex(warning.toPc)}: ${discarded}`);
    }
  }
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
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 338: VRAM fill dynamic call chain during CoorMon');
console.log('======================================================');
console.log(`CoorMon entry:     ${hex(COORMON_ENTRY)}`);
console.log(`Fill region start: ${hex(FILL_REGION_START)}`);
console.log(`Fill loop entry:   ${hex(FILL_LOOP_ENTRY)}`);
console.log(`FillRect entry:    ${hex(FILLRECT_ENTRY)}`);
console.log(`CoorMon epilogue:  ${hex(COORMON_EPILOGUE)}`);
console.log(`GetCSC cert byte:  ${hex(GETCSC_CERT_ADDR)}`);
console.log(`Return sentinel:   ${hex(RETURN_SENTINEL)}`);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const boot = runStandardBoot(executor, mem);
write24(mem, CXMAIN_PTR, HOME_HANDLER);
mem[GETCSC_CERT_ADDR] = 0x00;
mem[GETCSC_CERT_ADDR + 1] = 0x00;
mem[GETCSC_CERT_ADDR + 2] = 0x00;
prepareDirectEntry(cpu, mem);

console.log('\nBoot summary');
console.log(
  `  phase1 boot:   steps=${boot.boot.steps} termination=${boot.boot.termination} ` +
  `lastPc=${formatBlock(boot.boot.lastPc, boot.boot.lastMode)}`,
);
console.log(
  `  phase2 kernel: steps=${boot.kernelInit.steps} termination=${boot.kernelInit.termination} ` +
  `lastPc=${formatBlock(boot.kernelInit.lastPc, boot.kernelInit.lastMode)}`,
);
console.log(`  cxMain ptr:     ${hex(read24(mem, CXMAIN_PTR))}`);
console.log(`  no-key bytes:   ${bytesHex(mem, GETCSC_CERT_ADDR, 3)}`);
console.log(`  entry stack:    SP=${hex(cpu.sp)} top=${hex(read24(mem, cpu.sp))}`);

const trace = [];
const uniqueBlocks = new Set();
const missingHits = [];
const stackWarnings = [];
const frameStack = [buildRootFrame()];

let firstRegionHit = null;
let firstSetupHit = null;
let firstLoopHit = null;
let lastLoopHit = null;
let firstFillRectHit = null;
let lastEpilogueHit = null;
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
    const transition = applyTransition(
      previous,
      currentPc,
      mode,
      currentSp,
      currentTop,
      frameStack,
      mem,
      steps,
      stackWarnings,
    );

    const record = {
      index: trace.length,
      step: steps,
      pc: currentPc,
      mode,
      sp: currentSp,
      stackTop: currentTop,
      depth: Math.max(0, frameStack.length - 1),
      summary: getBlockSummary(meta),
      exits: describeExits(meta),
      transition,
    };

    trace.push(record);
    uniqueBlocks.add(blockKey(currentPc, mode));

    if (isFillRegionPc(currentPc) && !firstRegionHit) {
      firstRegionHit = {
        ...record,
        frames: cloneFrames(frameStack),
      };
    }

    if (currentPc === FILL_SETUP_ENTRY && !firstSetupHit) {
      firstSetupHit = {
        ...record,
        frames: cloneFrames(frameStack),
      };
    }

    if (currentPc === FILL_LOOP_ENTRY) {
      if (!firstLoopHit) {
        firstLoopHit = {
          ...record,
          frames: cloneFrames(frameStack),
        };
      }

      lastLoopHit = {
        ...record,
        frames: cloneFrames(frameStack),
      };
    }

    if (currentPc === FILLRECT_ENTRY && !firstFillRectHit) {
      firstFillRectHit = {
        ...record,
        frames: cloneFrames(frameStack),
      };
    }

    if (currentPc === COORMON_EPILOGUE) {
      lastEpilogueHit = {
        ...record,
        frames: cloneFrames(frameStack),
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

const regionSummary = summarizeHits(trace, (record) => isFillRegionPc(record.pc));
const setupSummary = summarizeHits(trace, (record) => record.pc === FILL_SETUP_ENTRY);
const loopSummary = summarizeHits(trace, (record) => record.pc === FILL_LOOP_ENTRY);
const fillRectSummary = summarizeHits(trace, (record) => record.pc === FILLRECT_ENTRY);
const epilogueSummary = summarizeHits(trace, (record) => record.pc === COORMON_EPILOGUE);

console.log('\nRun summary');
console.log(`  steps:            ${coormon.steps}`);
console.log(`  termination:      ${coormon.termination}`);
console.log(`  lastPc:           ${formatBlock(coormon.lastPc, coormon.lastMode)}`);
console.log(`  full trace size:  ${trace.length}`);
console.log(`  unique blocks:    ${uniqueBlocks.size}`);
console.log(`  missing callbacks:${missingHits.length}`);
printHitSummary('fill-region hits', regionSummary);
printHitSummary('0x09EF44 hits', setupSummary);
printHitSummary('0x09EFDE hits', loopSummary);
printHitSummary('0x09F008 hits', fillRectSummary);
printHitSummary('0x08BF9E hits', epilogueSummary);

if (firstRegionHit) {
  console.log(
    `  first region edge:${formatBlock(firstRegionHit.transition.fromPc, firstRegionHit.transition.fromMode)} -> ` +
    `${formatBlock(firstRegionHit.pc, firstRegionHit.mode)} via ${firstRegionHit.transition.kind}`,
  );
}

if (lastLoopHit) {
  console.log(`  last 0x09EFDE:    step=${lastLoopHit.step} trace#${lastLoopHit.index}`);
}

if (lastEpilogueHit) {
  console.log(`  final epilogue:   step=${lastEpilogueHit.step} trace#${lastEpilogueHit.index}`);
}

printFrameChain('Active call chain at first fill-region entry', firstRegionHit);
printFrameChain('Active call chain at first 0x09EF44 visit', firstSetupHit);
printFrameChain('Active call chain at first 0x09EFDE visit', firstLoopHit);
printFrameChain('Active call chain at first 0x09F008 visit', firstFillRectHit);

if (firstLoopHit) {
  printTraceRange(
    'Ordered blocks from CoorMon entry to first 0x09EFDE',
    trace.slice(0, firstLoopHit.index + 1),
  );
} else {
  printTraceRange('Ordered blocks from CoorMon entry (0x09EFDE was not reached)', trace);
}

if (lastLoopHit) {
  console.log(
    `\nLast 0x09EFDE visit anchor: trace#${lastLoopHit.index} step=${lastLoopHit.step} ` +
    `pc=${formatBlock(lastLoopHit.pc, lastLoopHit.mode)}`,
  );
  printTraceRange(
    'Blocks visited after the last 0x09EFDE and before CoorMon return',
    trace.slice(lastLoopHit.index + 1),
  );
}

console.log('\nMissing-block callbacks');
if (missingHits.length === 0) {
  console.log('  none');
} else {
  for (const hit of missingHits) {
    console.log(`  step=${String(hit.step).padStart(5)} missing=${formatBlock(hit.pc, hit.mode)}`);
  }
}

printStackWarnings(stackWarnings);

console.log('\nPhase 338 complete.');
