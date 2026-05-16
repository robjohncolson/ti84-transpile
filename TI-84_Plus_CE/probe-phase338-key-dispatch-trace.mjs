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

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 50000;
const COORMON_MAX_LOOP_ITERATIONS = 50000;

const COORMON_ENTRY = 0x08BF22;
const GETCSC_ENTRY = 0x042366;
const COORMON_BRANCH_POINT = 0x08BF3C;
const COORMON_KEY_PRESENT_TARGET = 0x08BF68;
const COORMON_DISPATCH_AREA = 0x08BF82;
const HOME_HANDLER = 0x058241;

const CXMAIN_PTR = 0xD007CA;
const CONTEXT_BYTE_ADDR = 0xD007E0;
const GETCSC_SCAN_ADDR = 0x3B0033;

const ENTER_SCAN = 0x09;
const RIGHT_SCAN = 0x03;

const ORDERED_TRACE_PREVIEW = 100;
const POST_KEY_TRACE_PREVIEW = 80;
const HOME_TRACE_PREVIEW = 80;
const TAIL_TRACE_PREVIEW = 20;
const EVENT_PREVIEW = 40;

const MILESTONES = [
  COORMON_BRANCH_POINT,
  COORMON_KEY_PRESENT_TARGET,
  COORMON_DISPATCH_AREA,
  HOME_HANDLER,
];

const WATCHED_LABELS = new Map([
  [COORMON_ENTRY, 'CoorMon entry'],
  [GETCSC_ENTRY, 'GetCSC entry'],
  [COORMON_BRANCH_POINT, 'Branch point'],
  [COORMON_KEY_PRESENT_TARGET, 'Key-present branch'],
  [0x0BD3FE, 'Key helper A'],
  [0x08BF6C, 'Key helper B call site'],
  [0x08BFA6, 'Flag-return helper'],
  [0x055B8F, 'IY flag helper'],
  [COORMON_DISPATCH_AREA, 'cxMain dispatch area'],
  [0x08BF8E, 'Dispatch helper call site'],
  [0x08C308, 'Dispatch helper'],
  [HOME_HANDLER, 'Home handler'],
]);

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

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function installHomeHandler(mem) {
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
}

function labelForPc(pc) {
  return WATCHED_LABELS.get(pc >>> 0) ?? null;
}

function getInstructionSummary(meta) {
  return meta?.instructions?.[0]?.dasm ?? meta?.instructions?.[0]?.tag ?? '<unknown>';
}

function chunk(items, width) {
  const rows = [];
  for (let index = 0; index < items.length; index += width) {
    rows.push(items.slice(index, index + width));
  }
  return rows;
}

function describeHits(hits) {
  if (!hits || hits.length === 0) {
    return 'no';
  }
  const preview = hits.slice(0, 8).map((hit) => String(hit.step)).join(', ');
  const suffix = hits.length > 8 ? `, ... (+${hits.length - 8} more)` : '';
  return `yes @ step(s) ${preview}${suffix}`;
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

  matches.sort((left, right) => (rank[left.type] ?? 99) - (rank[right.type] ?? 99));
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

function createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, blocks) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
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

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  return { mem, peripherals, executor, cpu, boot, kernelInit };
}

function printSnippet(title, startPc, count, decodeInstruction, romBytes) {
  console.log(`\n${title}`);
  let pc = startPc >>> 0;
  for (let index = 0; index < count; index++) {
    try {
      const instruction = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, instruction?.length ?? 1);
      const bytes = Array.from(romBytes.subarray(pc, pc + length), (value) =>
        value.toString(16).toUpperCase().padStart(2, '0'),
      ).join(' ');
      const text = instruction?.asm ?? instruction?.dasm ?? instruction?.tag ?? '<unknown>';
      console.log(`  ${hex(pc)}: ${bytes.padEnd(24)} ${text}`);
      pc = (pc + length) >>> 0;
    } catch (error) {
      console.log(`  ${hex(pc)}: <decode failed: ${error?.message ?? error}>`);
      pc = (pc + 1) >>> 0;
    }
  }
}

function traceScenario(name, scanCode, romBytes, createExecutor, createPeripheralBus, blocks) {
  const env = createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, blocks);
  const { mem, executor, cpu } = env;

  installHomeHandler(mem);
  mem[GETCSC_SCAN_ADDR] = scanCode;

  const visits = [];
  const uniquePcs = new Set();
  const milestoneHits = new Map(MILESTONES.map((addr) => [addr, []]));
  const transferEvents = [];
  const incomingEventsByStep = new Map();
  const dynamicTargets = [];
  const dynamicTargetsByStep = new Map();
  const missingBlocks = [];
  const callFrames = [];

  const home = {
    entered: false,
    entryStep: null,
    entryDepth: null,
    entryIndex: null,
    blocks: [],
    totalBlocks: 0,
    returned: false,
    returnStep: null,
    returnTarget: null,
    maxDepth: 0,
  };

  let previous = null;

  function recordIncomingEvent(step, event) {
    if (!incomingEventsByStep.has(step)) {
      incomingEventsByStep.set(step, []);
    }
    incomingEventsByStep.get(step).push(event);
  }

  function noteTransfer(nextPc, nextMode, currentSp, step, missing = false) {
    if (!previous) {
      return;
    }

    const exit = findTargetedExit(previous.meta, nextPc);
    const tookReturn = hasReturnExit(previous.meta) && !fallsThroughTo(previous.meta, nextPc);

    if (exit?.type === 'call') {
      const callReturn = findCallReturnExit(previous.meta);
      const returnAddr = read24(mem, currentSp);
      const frame = {
        callerPc: previous.pc,
        callerMode: previous.mode,
        calleePc: nextPc,
        calleeMode: nextMode,
        returnAddr,
        returnMode: callReturn?.targetMode ?? previous.mode,
      };
      const depthBefore = callFrames.length;
      callFrames.push(frame);
      const event = {
        kind: 'call',
        step,
        fromPc: previous.pc,
        fromMode: previous.mode,
        toPc: nextPc,
        toMode: nextMode,
        depthBefore,
        depthAfter: callFrames.length,
        returnAddr,
        expectedReturnAddr: callReturn?.target ?? null,
        expectedReturnMode: callReturn?.targetMode ?? previous.mode,
        missing,
      };
      transferEvents.push(event);
      recordIncomingEvent(step, event);
      return;
    }

    if (tookReturn) {
      const depthBefore = callFrames.length;
      let matchedFrame = null;
      for (let index = callFrames.length - 1; index >= 0; index--) {
        if (callFrames[index].returnAddr === (nextPc >>> 0)) {
          matchedFrame = callFrames.splice(index, 1)[0];
          break;
        }
      }

      const event = {
        kind: 'return',
        step,
        fromPc: previous.pc,
        fromMode: previous.mode,
        toPc: nextPc,
        toMode: nextMode,
        depthBefore,
        depthAfter: callFrames.length,
        matchedFrame,
        missing,
      };
      transferEvents.push(event);
      recordIncomingEvent(step, event);

      if (
        matchedFrame &&
        matchedFrame.calleePc === HOME_HANDLER &&
        !home.returned
      ) {
        home.returned = true;
        home.returnStep = step;
        home.returnTarget = nextPc >>> 0;
      }
    }
  }

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: COORMON_MAX_STEPS,
    maxLoopIterations: COORMON_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, steps) {
      const blockPc = pc & 0xFFFFFF;
      const blockMode = mode ?? 'adl';
      const step = steps ?? 0;
      const sp = cpu.sp & 0xFFFFFF;

      noteTransfer(blockPc, blockMode, sp, step, false);

      const visit = {
        step,
        index: visits.length,
        pc: blockPc,
        mode: blockMode,
        sp,
        depth: callFrames.length,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        label: labelForPc(blockPc),
        summary: getInstructionSummary(meta),
      };
      visits.push(visit);
      uniquePcs.add(blockPc);

      if (milestoneHits.has(blockPc)) {
        milestoneHits.get(blockPc).push(visit);
      }

      if (blockPc === HOME_HANDLER && !home.entered) {
        home.entered = true;
        home.entryStep = step;
        home.entryDepth = callFrames.length;
        home.entryIndex = visit.index;
      }

      if (home.entered && !home.returned) {
        home.totalBlocks++;
        home.maxDepth = Math.max(home.maxDepth, callFrames.length);
        if (home.blocks.length < HOME_TRACE_PREVIEW) {
          home.blocks.push(visit);
        }
      }

      previous = {
        pc: blockPc,
        mode: blockMode,
        meta,
      };
    },
    onMissingBlock(pc, mode, steps) {
      const blockPc = pc & 0xFFFFFF;
      const blockMode = mode ?? 'adl';
      const step = steps ?? 0;
      const sp = cpu.sp & 0xFFFFFF;

      noteTransfer(blockPc, blockMode, sp, step, true);
      missingBlocks.push({
        step,
        pc: blockPc,
        mode: blockMode,
        depth: callFrames.length,
      });
    },
    onDynamicTarget(target, mode, fromPc, step) {
      const event = {
        step,
        fromPc: fromPc & 0xFFFFFF,
        target: target & 0xFFFFFF,
        mode: mode ?? 'adl',
      };
      dynamicTargets.push(event);
      if (!dynamicTargetsByStep.has(step)) {
        dynamicTargetsByStep.set(step, []);
      }
      dynamicTargetsByStep.get(step).push(event);
    },
  });

  return {
    name,
    scanCode,
    preRun: {
      cxMain: read24(mem, CXMAIN_PTR),
      contextByte: mem[CONTEXT_BYTE_ADDR] & 0xFF,
      getCscScan: mem[GETCSC_SCAN_ADDR] & 0xFF,
      sp: cpu.sp & 0xFFFFFF,
    },
    result,
    visits,
    uniqueCount: uniquePcs.size,
    milestoneHits,
    transferEvents,
    incomingEventsByStep,
    dynamicTargets,
    dynamicTargetsByStep,
    missingBlocks,
    home,
  };
}

function formatIncomingEvents(events) {
  if (!events || events.length === 0) {
    return '';
  }

  return events.map((event) => {
    if (event.kind === 'call') {
      return `CALL ${hex(event.fromPc)} -> ${hex(event.toPc)} depth ${event.depthBefore}->${event.depthAfter} ret=${hex(event.returnAddr)}`;
    }
    if (event.kind === 'return') {
      return `RET ${hex(event.fromPc)} -> ${hex(event.toPc)} depth ${event.depthBefore}->${event.depthAfter}`;
    }
    return `${event.kind} ${hex(event.fromPc)} -> ${hex(event.toPc)}`;
  }).join(' | ');
}

function formatDynamicEvents(events) {
  if (!events || events.length === 0) {
    return '';
  }

  return events.map((event) => (
    `dynamic ${hex(event.fromPc)} -> ${hex(event.target)}`
  )).join(' | ');
}

function printVisits(title, visits, incomingEventsByStep, dynamicTargetsByStep) {
  console.log(`\n${title}`);
  if (!visits || visits.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const visit of visits) {
    const label = visit.label ? ` ${visit.label}` : '';
    const incoming = formatIncomingEvents(incomingEventsByStep.get(visit.step));
    const dynamic = formatDynamicEvents(dynamicTargetsByStep.get(visit.step));
    const extras = [incoming, dynamic].filter(Boolean).join(' | ');
    console.log(
      `  [${String(visit.step).padStart(5)}] depth=${String(visit.depth).padStart(2)} ` +
      `pc=${hex(visit.pc)}${label} A=${hex8(visit.a)} SP=${hex(visit.sp)} ${visit.summary}`,
    );
    if (extras) {
      console.log(`           ${extras}`);
    }
  }
}

function printMilestones(run) {
  console.log('\nMilestones');
  for (const addr of MILESTONES) {
    const hits = run.milestoneHits.get(addr) ?? [];
    const label = labelForPc(addr) ?? 'Milestone';
    console.log(`  ${hex(addr)} ${label}: ${describeHits(hits)}`);
    if (addr === COORMON_BRANCH_POINT && hits.length > 0) {
      console.log(`    first-hit A register: ${hex8(hits[0].a)}`);
    }
  }
}

function printTransferSummary(run) {
  const startStep = (run.milestoneHits.get(COORMON_KEY_PRESENT_TARGET)?.[0]?.step) ?? null;
  const filtered = run.transferEvents.filter((event) => startStep === null || event.step >= startStep);
  console.log('\nCall/return depth changes after 0x08BF68');
  if (filtered.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const event of filtered.slice(0, EVENT_PREVIEW)) {
    if (event.kind === 'call') {
      console.log(
        `  step=${String(event.step).padStart(5)} CALL ${hex(event.fromPc)} -> ${hex(event.toPc)} ` +
        `depth ${event.depthBefore}->${event.depthAfter} ret=${hex(event.returnAddr)}` +
        `${event.expectedReturnAddr !== null ? ` expected=${hex(event.expectedReturnAddr)}` : ''}`,
      );
      continue;
    }

    console.log(
      `  step=${String(event.step).padStart(5)} RET  ${hex(event.fromPc)} -> ${hex(event.toPc)} ` +
      `depth ${event.depthBefore}->${event.depthAfter}`,
    );
  }

  if (filtered.length > EVENT_PREVIEW) {
    console.log(`  ... ${filtered.length - EVENT_PREVIEW} more call/return event(s) omitted`);
  }
}

function printHomeSummary(run) {
  console.log('\nHome handler summary');
  if (!run.home.entered) {
    console.log(`  ${hex(HOME_HANDLER)} was not entered.`);
    return;
  }

  console.log(
    `  entered at step ${run.home.entryStep}, ` +
    `depth ${run.home.entryDepth}, total captured subtree blocks ${run.home.totalBlocks}, ` +
    `max depth ${run.home.maxDepth}`,
  );
  if (run.home.returned) {
    console.log(`  returned at step ${run.home.returnStep} to ${hex(run.home.returnTarget)}`);
  } else {
    console.log('  did not return from the home-handler subtree before termination.');
  }

  printVisits(
    `Home-handler subtree preview (first ${Math.min(HOME_TRACE_PREVIEW, run.home.blocks.length)} block(s))`,
    run.home.blocks,
    run.incomingEventsByStep,
    run.dynamicTargetsByStep,
  );
}

function printMissingBlocks(run) {
  console.log('\nMissing blocks');
  if (run.missingBlocks.length === 0) {
    console.log('  none');
    return;
  }

  for (const hit of run.missingBlocks) {
    console.log(
      `  step=${String(hit.step).padStart(5)} pc=${hex(hit.pc)}:${hit.mode} depth=${hit.depth}`,
    );
  }
}

function printDynamicTargets(run) {
  console.log('\nDynamic targets');
  if (run.dynamicTargets.length === 0) {
    console.log('  none');
    return;
  }

  for (const event of run.dynamicTargets.slice(0, EVENT_PREVIEW)) {
    console.log(
      `  step=${String(event.step).padStart(5)} from=${hex(event.fromPc)} target=${hex(event.target)}:${event.mode}`,
    );
  }

  if (run.dynamicTargets.length > EVENT_PREVIEW) {
    console.log(`  ... ${run.dynamicTargets.length - EVENT_PREVIEW} more dynamic target(s) omitted`);
  }
}

function printRunSummary(run) {
  console.log(`\n=== ${run.name} (${hex8(run.scanCode)}) ===`);
  console.log(
    `Pre-run: mem[${hex(GETCSC_SCAN_ADDR)}]=${hex8(run.preRun.getCscScan)} ` +
    `cxMain=${hex(run.preRun.cxMain)} context=${hex8(run.preRun.contextByte)} SP=${hex(run.preRun.sp)}`,
  );
  console.log(
    `Result: steps=${run.result.steps} termination=${run.result.termination} ` +
    `lastPc=${hex(run.result.lastPc)} uniqueBlocks=${run.uniqueCount}`,
  );

  printMilestones(run);
  printMissingBlocks(run);
  printDynamicTargets(run);

  const orderedPreview = run.visits.slice(0, ORDERED_TRACE_PREVIEW);
  printVisits(
    `Ordered block trace (first ${orderedPreview.length} of ${run.visits.length})`,
    orderedPreview,
    run.incomingEventsByStep,
    run.dynamicTargetsByStep,
  );
  if (run.visits.length > ORDERED_TRACE_PREVIEW) {
    console.log(`  ... ${run.visits.length - ORDERED_TRACE_PREVIEW} more ordered block visit(s) omitted`);
  }

  const postKeyStart = run.milestoneHits.get(COORMON_KEY_PRESENT_TARGET)?.[0]?.index ?? -1;
  if (postKeyStart >= 0) {
    const postKeyVisits = run.visits.slice(postKeyStart, postKeyStart + POST_KEY_TRACE_PREVIEW);
    printVisits(
      `Flow from ${hex(COORMON_KEY_PRESENT_TARGET)} onward ` +
      `(first ${postKeyVisits.length} block(s) from visit ${postKeyStart})`,
      postKeyVisits,
      run.incomingEventsByStep,
      run.dynamicTargetsByStep,
    );
    if ((run.visits.length - postKeyStart) > POST_KEY_TRACE_PREVIEW) {
      console.log(
        `  ... ${(run.visits.length - postKeyStart) - POST_KEY_TRACE_PREVIEW} more block visit(s) after ${hex(COORMON_KEY_PRESENT_TARGET)} omitted`,
      );
    }
  } else {
    console.log(`\nFlow from ${hex(COORMON_KEY_PRESENT_TARGET)} onward`);
    console.log(`  ${hex(COORMON_KEY_PRESENT_TARGET)} was never reached.`);
  }

  const tail = run.visits.slice(Math.max(0, run.visits.length - TAIL_TRACE_PREVIEW));
  printVisits(
    `Tail trace (last ${tail.length} block(s))`,
    tail,
    run.incomingEventsByStep,
    run.dynamicTargetsByStep,
  );

  printTransferSummary(run);
  printHomeSummary(run);
}

function compareRuns(left, right) {
  console.log(`\n=== ${left.name} vs ${right.name} ===`);
  console.log(
    `${left.name}: steps=${left.result.steps} unique=${left.uniqueCount} ` +
    `lastPc=${hex(left.result.lastPc)} termination=${left.result.termination}`,
  );
  console.log(
    `${right.name}: steps=${right.result.steps} unique=${right.uniqueCount} ` +
    `lastPc=${hex(right.result.lastPc)} termination=${right.result.termination}`,
  );

  console.log(
    `Reached ${hex(COORMON_DISPATCH_AREA)}: ` +
    `${left.name}=${(left.milestoneHits.get(COORMON_DISPATCH_AREA)?.length ?? 0) > 0 ? 'yes' : 'no'}, ` +
    `${right.name}=${(right.milestoneHits.get(COORMON_DISPATCH_AREA)?.length ?? 0) > 0 ? 'yes' : 'no'}`,
  );
  console.log(
    `Reached ${hex(HOME_HANDLER)}: ` +
    `${left.name}=${left.home.entered ? 'yes' : 'no'}, ` +
    `${right.name}=${right.home.entered ? 'yes' : 'no'}`,
  );

  const leftStart = left.milestoneHits.get(COORMON_KEY_PRESENT_TARGET)?.[0]?.index ?? -1;
  const rightStart = right.milestoneHits.get(COORMON_KEY_PRESENT_TARGET)?.[0]?.index ?? -1;
  if (leftStart < 0 || rightStart < 0) {
    console.log(`Could not compare post-${hex(COORMON_KEY_PRESENT_TARGET)} flow because one run never reached it.`);
    return;
  }

  const leftSeq = left.visits.slice(leftStart);
  const rightSeq = right.visits.slice(rightStart);
  const minLength = Math.min(leftSeq.length, rightSeq.length);
  let sharedPrefix = 0;

  while (sharedPrefix < minLength && leftSeq[sharedPrefix].pc === rightSeq[sharedPrefix].pc) {
    sharedPrefix++;
  }

  console.log(`Shared prefix after ${hex(COORMON_KEY_PRESENT_TARGET)}: ${sharedPrefix} block(s)`);

  if (sharedPrefix < minLength) {
    const leftVisit = leftSeq[sharedPrefix];
    const rightVisit = rightSeq[sharedPrefix];
    console.log(
      `First divergence at relative block ${sharedPrefix}: ` +
      `${left.name}=${hex(leftVisit.pc)} (step ${leftVisit.step}), ` +
      `${right.name}=${hex(rightVisit.pc)} (step ${rightVisit.step})`,
    );

    const leftWindow = leftSeq.slice(sharedPrefix, sharedPrefix + 12);
    const rightWindow = rightSeq.slice(sharedPrefix, sharedPrefix + 12);
    printVisits(
      `${left.name} divergence window`,
      leftWindow,
      left.incomingEventsByStep,
      left.dynamicTargetsByStep,
    );
    printVisits(
      `${right.name} divergence window`,
      rightWindow,
      right.incomingEventsByStep,
      right.dynamicTargetsByStep,
    );
    return;
  }

  if (leftSeq.length !== rightSeq.length) {
    console.log(
      `Post-${hex(COORMON_KEY_PRESENT_TARGET)} flow matches for ${sharedPrefix} block(s), then one run ends first: ` +
      `${left.name}=${leftSeq.length} block(s), ${right.name}=${rightSeq.length} block(s)`,
    );
    return;
  }

  console.log(`Post-${hex(COORMON_KEY_PRESENT_TARGET)} flow is identical for the entire recorded run.`);
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

console.log('Phase 338: Key dispatch trace past 0x08BF68');
console.log('='.repeat(72));
console.log(`CoorMon entry:        ${hex(COORMON_ENTRY)}`);
console.log(`GetCSC entry:         ${hex(GETCSC_ENTRY)}`);
console.log(`Branch point:         ${hex(COORMON_BRANCH_POINT)}`);
console.log(`Key-present target:   ${hex(COORMON_KEY_PRESENT_TARGET)}`);
console.log(`cxMain dispatch area: ${hex(COORMON_DISPATCH_AREA)}`);
console.log(`Home handler:         ${hex(HOME_HANDLER)}`);
console.log(`cxMain pointer:       ${hex(CXMAIN_PTR)}`);
console.log(`GetCSC scan byte:     ${hex(GETCSC_SCAN_ADDR)}`);
console.log(`Return sentinel:      ${hex(RETURN_SENTINEL)}`);

printSnippet('Static snippet: CoorMon around 0x08BF22', COORMON_ENTRY, 12, decodeInstruction, romBytes);
printSnippet('Static snippet: key-present path around 0x08BF68', COORMON_KEY_PRESENT_TARGET, 10, decodeInstruction, romBytes);
printSnippet('Static snippet: cxMain dispatch area around 0x08BF82', COORMON_DISPATCH_AREA, 10, decodeInstruction, romBytes);
printSnippet('Static snippet: home handler entry 0x058241', HOME_HANDLER, 10, decodeInstruction, romBytes);

const enterRun = traceScenario(
  'ENTER',
  ENTER_SCAN,
  romBytes,
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
);
const rightRun = traceScenario(
  'RIGHT',
  RIGHT_SCAN,
  romBytes,
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
);

printRunSummary(enterRun);
printRunSummary(rightRun);
compareRuns(enterRun, rightRun);
