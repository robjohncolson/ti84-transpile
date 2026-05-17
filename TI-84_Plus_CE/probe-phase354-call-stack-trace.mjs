#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';

const WARMUP_STEPS = 3000;
const CAPTURE_STEPS = 3000;
const MAX_LOOP_ITERATIONS = 100000;

const MIN_CYCLE_LENGTH = 1500;
const MIN_CYCLE_OVERLAP = 256;
const MAX_TREE_LINES = 600;

const TRANSFER_TAGS = new Set(['call', 'call-conditional', 'ret', 'ret-conditional', 'rst']);
const CALL_TAGS = new Set(['call', 'call-conditional', 'rst']);
const RET_TAGS = new Set(['ret', 'ret-conditional']);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase354-${process.pid}.mjs`);
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

function readMappedValue(cpu, rom, addr, width) {
  let value = 0;
  for (let index = 0; index < width; index++) {
    const current = (addr + index) & MEM_MASK;
    const byte = current < 0x400000
      ? (rom[current] ?? 0)
      : (cpu.mem?.[current] ?? cpu.memory?.[current] ?? 0);
    value |= (byte & 0xFF) << (index * 8);
  }
  return value >>> 0;
}

function getStackState(cpu, rom) {
  if (cpu.madl) {
    const addr = cpu.sp & 0xFFFFFF;
    return {
      addr,
      width: 3,
      value: readMappedValue(cpu, rom, addr, 3) & 0xFFFFFF,
    };
  }

  const addr = (((cpu.mbase ?? 0) & 0xFF) << 16) | (cpu.sp & 0xFFFF);
  return {
    addr,
    width: 2,
    value: readMappedValue(cpu, rom, addr, 2) & 0xFFFF,
  };
}

function signedDelta(before, after) {
  let delta = ((after - before) & 0xFFFFFF) >>> 0;
  if (delta & 0x800000) {
    delta -= 0x1000000;
  }
  return delta;
}

function transferInstructionFor(meta) {
  if (!Array.isArray(meta?.instructions)) {
    return null;
  }

  for (let index = meta.instructions.length - 1; index >= 0; index--) {
    const instruction = meta.instructions[index];
    if (TRANSFER_TAGS.has(instruction?.tag)) {
      return instruction;
    }
  }

  return null;
}

function transferKind(tag) {
  if (RET_TAGS.has(tag)) {
    return 'RET';
  }
  if (tag === 'rst') {
    return 'RST';
  }
  return 'CALL';
}

function inferTaken(instruction, result, spBefore, spAfter) {
  if (instruction.tag === 'call' || instruction.tag === 'ret' || instruction.tag === 'rst') {
    return true;
  }

  if (instruction.tag === 'call-conditional') {
    return result === instruction.target || spAfter !== spBefore;
  }

  if (instruction.tag === 'ret-conditional') {
    return result !== instruction.fallthrough || spAfter !== spBefore;
  }

  return false;
}

function createHarness(rom, blocks, bus) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = createExecutor(blocks, mem, { peripherals: bus });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = bus;
  cpu.pc = BOOT_ENTRY;

  return { mem, cpu, executor };
}

function installTransferWrappers(executor, rom, transferEvents, getContext) {
  for (const [key, meta] of Object.entries(executor.blockMeta)) {
    const instruction = transferInstructionFor(meta);
    if (!instruction) {
      continue;
    }

    const original = executor.compiledBlocks[key];
    if (typeof original !== 'function') {
      continue;
    }

    executor.compiledBlocks[key] = function wrappedTransferBlock(cpu) {
      const context = getContext();
      const spBefore = cpu.sp & 0xFFFFFF;
      const stackBefore = RET_TAGS.has(instruction.tag) ? getStackState(cpu, rom) : null;
      const result = original(cpu);
      const spAfter = cpu.sp & 0xFFFFFF;

      if (context?.phase === 'capture') {
        transferEvents.push({
          captureStep: context.localStep,
          absStep: context.absStep,
          blockPc: context.pc,
          mode: context.mode,
          pc: instruction.pc & 0xFFFFFF,
          bytes: instruction.bytes ?? '',
          dasm: instruction.dasm ?? instruction.tag,
          tag: instruction.tag,
          type: transferKind(instruction.tag),
          condition: instruction.condition ?? null,
          target: RET_TAGS.has(instruction.tag)
            ? (stackBefore?.value ?? null)
            : ((instruction.target ?? null) === null ? null : (instruction.target & 0xFFFFFF)),
          fallthrough: instruction.fallthrough === undefined ? null : (instruction.fallthrough & 0xFFFFFF),
          nextPc: typeof result === 'number' && result >= 0 ? (result & 0xFFFFFF) : null,
          spBefore,
          spAfter,
          spDelta: signedDelta(spBefore, spAfter),
          stackAddr: stackBefore?.addr ?? null,
          stackWidth: stackBefore?.width ?? (cpu.madl ? 3 : 2),
          taken: inferTaken(instruction, result, spBefore, spAfter),
        });
      }

      return result;
    };
  }
}

function runPhase(executor, stepBase, phaseName, startPc, startMode, maxSteps, captureBlocks, missingBlocks, setContext) {
  return executor.runFrom(startPc, startMode, {
    maxSteps,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    wakeFromHalt: 'nmi',
    onBlock(pc, mode, meta, step) {
      const normalizedMode = mode ?? 'adl';
      const context = {
        phase: phaseName,
        localStep: step,
        absStep: stepBase + step,
        pc: pc & 0xFFFFFF,
        mode: normalizedMode,
        key: blockKey(pc, normalizedMode),
      };

      setContext(context);

      if (phaseName === 'capture') {
        captureBlocks.push({
          captureStep: step,
          absStep: stepBase + step,
          pc: pc & 0xFFFFFF,
          mode: normalizedMode,
          key: context.key,
          sp: executor.cpu.sp & 0xFFFFFF,
          instructionCount: Array.isArray(meta?.instructions) ? meta.instructions.length : 0,
        });
      }
    },
    onMissingBlock(pc, mode, step) {
      const normalizedMode = mode ?? 'adl';
      setContext({
        phase: phaseName,
        localStep: step,
        absStep: stepBase + step,
        pc: pc & 0xFFFFFF,
        mode: normalizedMode,
        key: blockKey(pc, normalizedMode),
      });
      missingBlocks.push({
        phase: phaseName,
        captureStep: phaseName === 'capture' ? step : null,
        absStep: stepBase + step,
        pc: pc & 0xFFFFFF,
        mode: normalizedMode,
      });
    },
  });
}

function detectCycle(captureBlocks) {
  if (captureBlocks.length < (MIN_CYCLE_LENGTH + MIN_CYCLE_OVERLAP)) {
    return null;
  }

  const signatures = captureBlocks.map((entry) => `${entry.key}@${entry.sp.toString(16).padStart(6, '0')}`);
  const positionsBySignature = new Map();

  for (let index = 0; index < signatures.length; index++) {
    const signature = signatures[index];
    const positions = positionsBySignature.get(signature) ?? [];
    positions.push(index);
    positionsBySignature.set(signature, positions);
  }

  let best = null;
  const maxStart = captureBlocks.length - MIN_CYCLE_LENGTH - MIN_CYCLE_OVERLAP;

  for (let start = 0; start <= maxStart; start++) {
    const positions = positionsBySignature.get(signatures[start]) ?? [];
    for (const repeat of positions) {
      if (repeat <= start) {
        continue;
      }

      const period = repeat - start;
      const overlap = captureBlocks.length - repeat;
      if (period < MIN_CYCLE_LENGTH || overlap < MIN_CYCLE_OVERLAP) {
        continue;
      }

      let matches = true;
      for (let offset = 0; offset < overlap; offset++) {
        if (signatures[start + offset] !== signatures[repeat + offset]) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      const candidate = { startIndex: start, length: period, overlap };
      if (
        !best ||
        candidate.overlap > best.overlap ||
        (candidate.overlap === best.overlap && candidate.startIndex < best.startIndex) ||
        (candidate.overlap === best.overlap && candidate.startIndex === best.startIndex && candidate.length < best.length)
      ) {
        best = candidate;
      }
      break;
    }
  }

  return best;
}

function annotateTransferEvents(events, captureStartState) {
  const frames = [{
    id: 'root',
    label: `capture-root @ ${hex(captureStartState.pc)} SP=${hex(captureStartState.sp)}`,
    entryPc: captureStartState.pc & 0xFFFFFF,
    callSitePc: null,
    callStep: null,
    synthetic: true,
    parentId: null,
    returnAddr: null,
  }];
  const frameInfo = new Map([[frames[0].id, frames[0]]]);
  let nextFrameId = 1;

  for (const event of events) {
    event.depthBefore = frames.length - 1;
    event.callerFrameId = frames[frames.length - 1]?.id ?? 'root';

    if (!event.taken) {
      event.depthAfter = event.depthBefore;
      event.returningFrameId = null;
      event.returnedToFrameId = event.callerFrameId;
      continue;
    }

    if (CALL_TAGS.has(event.tag)) {
      const frame = {
        id: `f${nextFrameId++}`,
        label: `${event.type} ${hex(event.pc)} -> ${hex(event.target)}`,
        entryPc: event.target ?? null,
        callSitePc: event.pc,
        callStep: event.captureStep,
        synthetic: false,
        parentId: event.callerFrameId,
        returnAddr: event.fallthrough,
      };
      frameInfo.set(frame.id, frame);
      frames.push(frame);
      event.spawnedFrameId = frame.id;
      event.depthAfter = frames.length - 1;
      event.returningFrameId = null;
      event.returnedToFrameId = frame.parentId;
      continue;
    }

    const returningFrame = frames.length > 1 ? frames.pop() : frames[0];
    event.returningFrameId = returningFrame?.id ?? null;
    event.depthAfter = frames.length - 1;
    event.returnedToFrameId = frames[frames.length - 1]?.id ?? 'root';
  }

  return frameInfo;
}

function sameTransferShape(left, right) {
  if (!left || !right) {
    return false;
  }
  return (
    left.type === right.type &&
    left.tag === right.tag &&
    left.pc === right.pc &&
    left.target === right.target &&
    left.taken === right.taken &&
    left.condition === right.condition
  );
}

function formatTransferOp(event) {
  if (event.type === 'RST') {
    return `RST ${hex(event.target ?? 0)}`;
  }

  const cond = event.condition ? ` ${String(event.condition).toUpperCase()}` : '';
  return `${event.type}${cond}`;
}

function describeFrame(frame) {
  if (!frame) {
    return 'n/a';
  }
  if (frame.synthetic) {
    return frame.label;
  }
  return `${hex(frame.entryPc)} from ${hex(frame.callSitePc)} at step ${frame.callStep}`;
}

function renderCallTree(events, cycleStartStep, baseDepth) {
  const lines = [];
  for (const event of events) {
    const relativeStep = event.captureStep - cycleStartStep;
    const depth = event.taken && RET_TAGS.has(event.tag)
      ? Math.max(0, event.depthAfter - baseDepth)
      : Math.max(0, event.depthBefore - baseDepth);
    const indent = '  '.repeat(depth);
    const taken = event.taken ? '' : ' [not taken]';
    const spText = `${hex(event.spBefore)} -> ${hex(event.spAfter)} (${event.spDelta >= 0 ? '+' : ''}${event.spDelta})`;
    const targetText = event.target === null ? 'n/a' : hex(event.target);
    const returnText = event.fallthrough === null ? '' : ` return=${hex(event.fallthrough)}`;

    lines.push(
      `${indent}${String(relativeStep).padStart(4)} [step ${String(event.captureStep).padStart(4)}] ` +
      `${formatTransferOp(event)} @ ${hex(event.pc)} -> ${targetText}${returnText} ` +
      `SP=${spText}${taken}`,
    );
  }

  if (lines.length <= MAX_TREE_LINES) {
    return lines;
  }

  const head = lines.slice(0, Math.min(400, lines.length));
  const tail = lines.slice(Math.max(lines.length - 180, 400));
  return [
    ...head,
    `... ${lines.length - head.length - tail.length} transfer events omitted ...`,
    ...tail,
  ];
}

function printTransferWindow(events, centerStep, radius) {
  const start = Math.max(0, centerStep - radius);
  const end = centerStep + radius;

  for (const event of events) {
    if (event.captureStep < start || event.captureStep > end) {
      continue;
    }

    const marker = event.captureStep === centerStep ? ' <==' : '';
    console.log(
      `  step ${String(event.captureStep).padStart(4)} depth=${String(event.depthBefore).padStart(2)} ` +
      `${formatTransferOp(event).padEnd(10)} @ ${hex(event.pc)} -> ${event.target === null ? 'n/a' : hex(event.target)} ` +
      `taken=${String(event.taken).padEnd(5)} SP=${hex(event.spBefore)} -> ${hex(event.spAfter)}${marker}`,
    );
  }
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const transpiledModule = await import(moduleUrl);
    return normalizeBlocks(
      transpiledModule.PRELIFTED_BLOCKS ??
      transpiledModule.default?.PRELIFTED_BLOCKS ??
      transpiledModule.default ??
      transpiledModule,
    );
  } finally {
    cleanupTranspiledModule(assets);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
  const blocks = await loadBlocks();
  if (!Object.keys(blocks).length) {
    throw new Error('Unable to load PRELIFTED_BLOCKS.');
  }

  const bus = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createHarness(rom, blocks, bus);

  const captureBlocks = [];
  const transferEvents = [];
  const missingBlocks = [];
  let currentContext = null;

  installTransferWrappers(executor, rom, transferEvents, () => currentContext);

  console.log('Phase 354: Call stack trace through one LCD-init cycle');
  console.log('=====================================================');
  console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Warmup steps:        ${WARMUP_STEPS}`);
  console.log(`Capture steps:       ${CAPTURE_STEPS}`);
  console.log(`Timer interrupt:     disabled`);
  console.log('');

  const warmup = runPhase(
    executor,
    0,
    'warmup',
    BOOT_ENTRY,
    BOOT_MODE,
    WARMUP_STEPS,
    captureBlocks,
    missingBlocks,
    (ctx) => { currentContext = ctx; },
  );

  const captureStartState = {
    pc: warmup.lastPc ?? BOOT_ENTRY,
    mode: warmup.lastMode ?? BOOT_MODE,
    sp: cpu.sp & 0xFFFFFF,
  };

  const capture = runPhase(
    executor,
    warmup.steps ?? WARMUP_STEPS,
    'capture',
    captureStartState.pc,
    captureStartState.mode,
    CAPTURE_STEPS,
    captureBlocks,
    missingBlocks,
    (ctx) => { currentContext = ctx; },
  );

  const frameInfo = annotateTransferEvents(transferEvents, captureStartState);

  console.log('Run Summary');
  console.log('-----------');
  console.log(`Warmup termination:  ${warmup.termination} at ${hex(warmup.lastPc)}:${warmup.lastMode ?? 'adl'}`);
  console.log(`Capture termination: ${capture.termination} at ${hex(capture.lastPc)}:${capture.lastMode ?? 'adl'}`);
  console.log(`Capture start state: PC=${hex(captureStartState.pc)}:${captureStartState.mode} SP=${hex(captureStartState.sp)}`);
  console.log(`Blocks captured:     ${captureBlocks.length}`);
  console.log(`Transfer events:     ${transferEvents.length}`);
  console.log(`Missing blocks:      ${missingBlocks.length}`);
  console.log('');

  const cycle = detectCycle(captureBlocks);
  if (!cycle) {
    console.log('Cycle Detection');
    console.log('---------------');
    console.log('No repeating block+SP cycle detected inside the 3000-step capture window.');
    console.log('');
    console.log('First 40 transfer events');
    console.log('------------------------');
    for (const event of transferEvents.slice(0, 40)) {
      console.log(
        `  step ${String(event.captureStep).padStart(4)} ${formatTransferOp(event).padEnd(10)} @ ${hex(event.pc)} -> ` +
        `${event.target === null ? 'n/a' : hex(event.target)} taken=${String(event.taken).padEnd(5)} ` +
        `SP=${hex(event.spBefore)} -> ${hex(event.spAfter)}`,
      );
    }
    return;
  }

  const eventsByStep = new Map();
  for (const event of transferEvents) {
    const bucket = eventsByStep.get(event.captureStep) ?? [];
    bucket.push(event);
    eventsByStep.set(event.captureStep, bucket);
  }

  let cycleStartCall = null;
  for (const event of transferEvents) {
    if (event.captureStep < cycle.startIndex || event.captureStep >= cycle.startIndex + cycle.length) {
      continue;
    }
    if (!event.taken || !CALL_TAGS.has(event.tag)) {
      continue;
    }

    const peer = (eventsByStep.get(event.captureStep + cycle.length) ?? []).find((candidate) =>
      sameTransferShape(event, candidate),
    );
    if (peer) {
      cycleStartCall = event;
      break;
    }
  }

  const cycleStartStep = cycleStartCall?.captureStep ?? cycle.startIndex;
  const cycleEndStep = cycleStartStep + cycle.length;
  const nextCycleCall = cycleStartCall
    ? (eventsByStep.get(cycleStartCall.captureStep + cycle.length) ?? []).find((candidate) =>
      sameTransferShape(cycleStartCall, candidate),
    )
    : null;
  const cycleEvents = transferEvents.filter((event) => event.captureStep >= cycleStartStep && event.captureStep < cycleEndStep);
  const baseDepth = cycleEvents[0]?.depthBefore ?? 0;

  let boundaryRet = null;
  if (nextCycleCall) {
    for (let index = transferEvents.length - 1; index >= 0; index--) {
      const event = transferEvents[index];
      if (event.captureStep >= nextCycleCall.captureStep) {
        continue;
      }
      if (!event.taken || !RET_TAGS.has(event.tag)) {
        continue;
      }
      if (event.returnedToFrameId === nextCycleCall.callerFrameId) {
        boundaryRet = event;
        break;
      }
    }
  }

  console.log('Cycle Detection');
  console.log('---------------');
  console.log(`Cycle start step:    ${cycle.startIndex}`);
  console.log(`Cycle length:        ${cycle.length} block steps`);
  console.log(`Cycle overlap check: ${cycle.overlap} repeated steps`);
  console.log(
    `Chosen boundary:     step ${cycleStartStep} ` +
    `${cycleStartCall ? `${formatTransferOp(cycleStartCall)} @ ${hex(cycleStartCall.pc)} -> ${hex(cycleStartCall.target)}` : '(no CALL/RST on cycle boundary)'}`,
  );
  console.log('');

  console.log('Boundary Pair');
  console.log('-------------');
  if (!cycleStartCall || !nextCycleCall) {
    console.log('Unable to anchor the cycle boundary to a repeating CALL/RST event.');
  } else {
    const callerFrame = frameInfo.get(nextCycleCall.callerFrameId);
    console.log(
      `Reentry CALL:        step ${nextCycleCall.captureStep} ${formatTransferOp(nextCycleCall)} ` +
      `@ ${hex(nextCycleCall.pc)} -> ${hex(nextCycleCall.target)} return=${hex(nextCycleCall.fallthrough)}`,
    );
    console.log(`Caller frame:        ${describeFrame(callerFrame)}`);
    if (boundaryRet) {
      console.log(
        `Boundary RET:        step ${boundaryRet.captureStep} ${formatTransferOp(boundaryRet)} ` +
        `@ ${hex(boundaryRet.pc)} -> ${hex(boundaryRet.target)}`,
      );
      console.log(
        `Cycle-spanning pair: RET ${hex(boundaryRet.pc)} -> ${hex(boundaryRet.target)} ` +
        `then CALL ${hex(nextCycleCall.pc)} -> ${hex(nextCycleCall.target)}`,
      );
    } else {
      console.log('Boundary RET:        not found inside the captured transfer stream');
    }
  }
  console.log('');

  console.log('Call Tree');
  console.log('---------');
  console.log(`Window: cycle-relative steps 0..${cycle.length - 1}, anchored at capture step ${cycleStartStep}`);
  for (const line of renderCallTree(cycleEvents, cycleStartStep, baseDepth)) {
    console.log(`  ${line}`);
  }
  console.log('');

  if (nextCycleCall) {
    console.log('Boundary Window');
    console.log('---------------');
    if (boundaryRet) {
      console.log('Around the RET that hands control back to the caller before the next cycle:');
      printTransferWindow(transferEvents, boundaryRet.captureStep, 8);
      console.log('');
    }
    console.log('Around the CALL that reinvokes the cycle:');
    printTransferWindow(transferEvents, nextCycleCall.captureStep, 8);
    console.log('');
  }

  if (missingBlocks.length > 0) {
    console.log('Missing Blocks');
    console.log('--------------');
    for (const miss of missingBlocks.slice(0, 20)) {
      console.log(`  ${miss.phase} step ${miss.captureStep ?? miss.absStep}: ${hex(miss.pc)}:${miss.mode}`);
    }
    if (missingBlocks.length > 20) {
      console.log(`  ... ${missingBlocks.length - 20} more omitted`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
