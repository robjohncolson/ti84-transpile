#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase202b-graph-trace-report.md');

const MEM_SIZE = 0x1000000;
const ENTRY = 0x08C543;
const STATUS_BAR_ENTRY = 0x0A349A;
const STATUS_BAR_RETURN_PC = 0x08C340;
const MAX_STEPS = 50000;
const MAX_LOOP_ITERATIONS = 500;

const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const SENTINEL_VALUE = 0xFFFFFF;
const GRAPH_FLAG_ADDR = IY_BASE + 0x0E;
const STATUS_FLAG_ADDR = IY_BASE + 0x1B;

const REQUESTED_VRAM_START = 0xD40000;
const REQUESTED_VRAM_END = 0xD52BFF;
const FULL_FRAMEBUFFER_END = REQUESTED_VRAM_START + (320 * 240 * 2) - 1;

const LCD_MMIO_START = 0xE00000;
const LCD_MMIO_END = 0xE00020;

const CALL_TARGET_MIN = 0x080000;
const CALL_TARGET_MAX = 0x09FFFF;

const TRACE_REPORT_COUNT = 50;
const TRACE_SUMMARY_COUNT = 30;
const EVENT_LOG_LIMIT = 64;

const WATCHED_PORTS = new Set([0x003D, 0x003E]);

const KNOWN_RENDER_ROUTINES = new Map([
  [0x005B96, 'VRAM fill primitive'],
  [0x0A1939, 'VRAM pixel writer A'],
  [0x0A19D7, 'VRAM pixel writer B'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatWidthValue(width, value) {
  return hex(value, Math.max(2, width * 2));
}

function intersectsRange(addr, width, start, end) {
  const normalizedAddr = addr & 0xFFFFFF;
  const normalizedWidth = Math.max(1, width | 0);
  const lastAddr = normalizedAddr + normalizedWidth - 1;
  return normalizedAddr <= end && lastAddr >= start;
}

function pushLimited(list, entry) {
  if (list.length < EVENT_LOG_LIMIT) {
    list.push(entry);
  }
}

function initializeCpu(cpu, memory) {
  cpu.a = 0;
  cpu.f = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;
  cpu._a2 = 0;
  cpu._f2 = 0;
  cpu._bc2 = 0;
  cpu._de2 = 0;
  cpu._hl2 = 0;
  cpu.sp = STACK_TOP;
  cpu._ix = IX_STAGE;
  cpu._iy = IY_BASE;
  cpu.i = 0;
  cpu.im = 1;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.cycles = 0;

  memory[GRAPH_FLAG_ADDR] &= 0x7F;
  memory[STATUS_FLAG_ADDR] &= 0xBF;

  cpu.sp -= 3;
  memory[cpu.sp] = 0xFF;
  memory[cpu.sp + 1] = 0xFF;
  memory[cpu.sp + 2] = 0xFF;
}

function createProbeState(executor) {
  return {
    currentPc: ENTRY,
    currentStep: 0,
    traceOrder: [],
    uniquePcs: new Set(),
    vramWriteCount: 0,
    vramWrites: [],
    lcdAccessCount: 0,
    lcdAccesses: [],
    portAccessCount: 0,
    portAccesses: [],
    knownRoutineHits: [],
    seenRoutineHits: new Set(),
    branchTargets: [],
    seenBranchTargets: new Set(),
    dynamicTargets: [],
    seenDynamicTargets: new Set(),
    initialUpbase: executor.lcdMmio?.upbase ?? null,
  };
}

function recordVramWrite(state, addr, width, value) {
  const hitsRequestedWindow = intersectsRange(
    addr,
    width,
    REQUESTED_VRAM_START,
    REQUESTED_VRAM_END,
  );
  const hitsFullFramebuffer = intersectsRange(
    addr,
    width,
    REQUESTED_VRAM_START,
    FULL_FRAMEBUFFER_END,
  );

  if (!hitsRequestedWindow && !hitsFullFramebuffer) {
    return;
  }

  state.vramWriteCount += 1;

  const event = {
    step: state.currentStep,
    pc: state.currentPc,
    addr: addr & 0xFFFFFF,
    width,
    value,
    range: hitsRequestedWindow ? 'requested-window' : 'full-16bpp-tail',
  };

  pushLimited(state.vramWrites, event);

  console.log(
    `  [VRAM write] step=${event.step} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${width} value=${formatWidthValue(width, value)} range=${event.range}`,
  );
}

function recordLcdAccess(state, kind, addr, width, value) {
  if (!intersectsRange(addr, width, LCD_MMIO_START, LCD_MMIO_END)) {
    return;
  }

  state.lcdAccessCount += 1;

  const event = {
    step: state.currentStep,
    pc: state.currentPc,
    kind,
    addr: addr & 0xFFFFFF,
    width,
    value,
  };

  pushLimited(state.lcdAccesses, event);

  console.log(
    `  [LCD ${kind}] step=${event.step} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${width} value=${formatWidthValue(width, value)}`,
  );
}

function recordPortAccess(state, kind, port, value) {
  const normalizedPort = port & 0xFFFF;
  if (!WATCHED_PORTS.has(normalizedPort)) {
    return;
  }

  state.portAccessCount += 1;

  const event = {
    step: state.currentStep,
    pc: state.currentPc,
    kind,
    port: normalizedPort,
    value: value & 0xFF,
  };

  pushLimited(state.portAccesses, event);

  console.log(
    `  [port ${kind}] step=${event.step} pc=${hex(event.pc)} port=${hex(event.port, 4)} value=${hex(event.value, 2)}`,
  );
}

function recordKnownRoutineHit(state, pc, step) {
  if (!KNOWN_RENDER_ROUTINES.has(pc)) {
    return;
  }

  const key = `${pc}:${step}`;
  if (state.seenRoutineHits.has(key)) {
    return;
  }

  state.seenRoutineHits.add(key);

  const hit = {
    step,
    pc,
    label: KNOWN_RENDER_ROUTINES.get(pc),
  };

  state.knownRoutineHits.push(hit);
  console.log(`  [known routine] step=${step} pc=${hex(pc)} ${hit.label}`);
}

function recordBranchTarget(state, sourcePc, instructionPc, step, dasm, target) {
  if (target < CALL_TARGET_MIN || target > CALL_TARGET_MAX) {
    return;
  }

  if (target === STATUS_BAR_ENTRY) {
    return;
  }

  const key = `${sourcePc}:${instructionPc}:${target}:${dasm}`;
  if (state.seenBranchTargets.has(key)) {
    return;
  }

  state.seenBranchTargets.add(key);

  const event = {
    step,
    sourcePc,
    instructionPc,
    target,
    dasm,
  };

  state.branchTargets.push(event);

  console.log(
    `  [call/jp target] step=${step} source=${hex(sourcePc)} inst=${hex(instructionPc)} target=${hex(target)} dasm=${dasm}`,
  );
}

function inspectVisitedBlock(state, pc, meta, step) {
  recordKnownRoutineHit(state, pc, step);

  const instructions = meta?.instructions ?? [];
  const targetRegex = /\b(?:call|jp)\s+(?:[a-z]{1,3},\s*)?0x([0-9a-f]{1,6})\b/gi;

  for (const instruction of instructions) {
    const dasm = instruction?.dasm ?? '';
    if (dasm.length === 0) {
      continue;
    }

    targetRegex.lastIndex = 0;

    for (let match = targetRegex.exec(dasm); match; match = targetRegex.exec(dasm)) {
      const target = parseInt(match[1], 16);
      recordBranchTarget(state, pc, instruction.pc ?? pc, step, dasm, target);
    }
  }
}

function recordDynamicTarget(state, sourcePc, step, target) {
  const key = `${sourcePc}:${step}:${target}`;
  if (state.seenDynamicTargets.has(key)) {
    return;
  }

  state.seenDynamicTargets.add(key);

  const event = {
    step,
    sourcePc,
    target: target & 0xFFFFFF,
  };

  state.dynamicTargets.push(event);

  console.log(
    `  [dynamic target] step=${step} source=${hex(sourcePc)} target=${hex(event.target)}`,
  );
}

function installAccessHooks(cpu, state) {
  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordLcdAccess(state, 'read', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    recordLcdAccess(state, 'read', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    recordLcdAccess(state, 'read', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    recordVramWrite(state, addr, 1, value);
    recordLcdAccess(state, 'write', addr, 1, value);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordVramWrite(state, addr, 2, value);
    recordLcdAccess(state, 'write', addr, 2, value);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordVramWrite(state, addr, 3, value);
    recordLcdAccess(state, 'write', addr, 3, value);
    return originalWrite24(addr, value);
  };

  cpu.onIoRead = (port, value) => {
    recordPortAccess(state, 'read', port, value);
  };

  cpu.onIoWrite = (port, value) => {
    recordPortAccess(state, 'write', port, value);
  };
}

function formatMemoryEvent(event) {
  return `step=${event.step} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${event.width} value=${formatWidthValue(event.width, event.value)}${event.range ? ` range=${event.range}` : ''}`;
}

function formatPortEvent(event) {
  return `step=${event.step} pc=${hex(event.pc)} port=${hex(event.port, 4)} ${event.kind}=${hex(event.value, 2)}`;
}

function formatBranchEvent(event) {
  return `step=${event.step} source=${hex(event.sourcePc)} inst=${hex(event.instructionPc)} target=${hex(event.target)} dasm=${event.dasm}`;
}

function formatDynamicTarget(event) {
  return `step=${event.step} source=${hex(event.sourcePc)} target=${hex(event.target)}`;
}

function buildReport(result, state) {
  const traceOrder = state.traceOrder;
  const uniqueSorted = [...state.uniquePcs].sort((left, right) => left - right);
  const first50 = traceOrder.slice(0, TRACE_REPORT_COUNT);
  const firstStatusBarIndex = traceOrder.indexOf(STATUS_BAR_ENTRY);
  const afterStatusBar = firstStatusBarIndex === -1
    ? []
    : traceOrder.slice(firstStatusBarIndex + 1, firstStatusBarIndex + 11);
  const reachedRenderer = state.vramWriteCount > 0
    || state.lcdAccessCount > 0
    || state.knownRoutineHits.length > 0;

  const lines = [];

  lines.push('# Phase 202B - GRAPH Trace Report');
  lines.push('');
  lines.push('Generated by `probe-phase202b-graph-trace.mjs`.');
  lines.push('');
  lines.push('## Run Summary');
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Entry PC | \`${hex(ENTRY)}\` |`);
  lines.push(`| Steps | \`${result.steps}\` |`);
  lines.push(`| Termination | \`${result.termination}\` |`);
  lines.push(`| Last PC | \`${hex(result.lastPc)}\` |`);
  lines.push(`| Loops forced | \`${result.loopsForced ?? 0}\` |`);
  lines.push(`| Initial LCD upbase | \`${hex(state.initialUpbase)}\` |`);
  lines.push(`| Final LCD upbase | \`${hex(result.finalUpbase)}\` |`);
  lines.push(`| Reached \`${hex(STATUS_BAR_RETURN_PC)}\` | \`${traceOrder.includes(STATUS_BAR_RETURN_PC) ? 'yes' : 'no'}\` |`);
  lines.push(`| VRAM writes detected | \`${state.vramWriteCount > 0 ? 'yes' : 'no'} (${state.vramWriteCount})\` |`);
  lines.push(`| LCD MMIO accesses detected | \`${state.lcdAccessCount > 0 ? 'yes' : 'no'} (${state.lcdAccessCount})\` |`);
  lines.push(`| IRQ port 0x3D/0x3E accesses | \`${state.portAccessCount > 0 ? 'yes' : 'no'} (${state.portAccessCount})\` |`);
  lines.push('');
  lines.push('## First 50 PCs');
  lines.push('');
  lines.push('```text');
  if (first50.length === 0) {
    lines.push('(none)');
  } else {
    first50.forEach((pc, index) => {
      lines.push(`${index.toString().padStart(2, '0')}: ${hex(pc)}`);
    });
  }
  lines.push('```');
  lines.push('');
  lines.push('## PCs After Status Bar');
  lines.push('');
  if (firstStatusBarIndex === -1) {
    lines.push('- `0x0A349A` was not visited in this run.');
  } else if (afterStatusBar.length === 0) {
    lines.push('- `0x0A349A` was visited, but no later block PCs were recorded after it.');
  } else {
    lines.push(`- First PCs after \`${hex(STATUS_BAR_ENTRY)}\`: ${afterStatusBar.map((pc) => `\`${hex(pc)}\``).join(', ')}`);
  }
  lines.push('');
  lines.push('## Unique PCs');
  lines.push('');
  lines.push('```text');
  if (uniqueSorted.length === 0) {
    lines.push('(none)');
  } else {
    uniqueSorted.forEach((pc) => {
      lines.push(hex(pc));
    });
  }
  lines.push('```');
  lines.push('');
  lines.push('## Access Points');
  lines.push('');
  lines.push(`- Requested VRAM window: \`${hex(REQUESTED_VRAM_START)}-${hex(REQUESTED_VRAM_END)}\``);
  lines.push(`- Full 16bpp framebuffer window: \`${hex(REQUESTED_VRAM_START)}-${hex(FULL_FRAMEBUFFER_END)}\``);
  lines.push(`- LCD MMIO watch range: \`${hex(LCD_MMIO_START)}-${hex(LCD_MMIO_END)}\``);
  lines.push('');
  lines.push('### VRAM Writes');
  lines.push('');
  if (state.vramWrites.length === 0) {
    lines.push('- none observed');
  } else {
    state.vramWrites.forEach((event) => {
      lines.push(`- ${formatMemoryEvent(event)}`);
    });
  }
  lines.push('');
  lines.push('### LCD MMIO Accesses');
  lines.push('');
  if (state.lcdAccesses.length === 0) {
    lines.push('- none observed');
  } else {
    state.lcdAccesses.forEach((event) => {
      lines.push(`- ${event.kind}: ${formatMemoryEvent(event)}`);
    });
  }
  lines.push('');
  lines.push('### IRQ Port 0x3D/0x3E Accesses');
  lines.push('');
  if (state.portAccesses.length === 0) {
    lines.push('- none observed');
  } else {
    state.portAccesses.forEach((event) => {
      lines.push(`- ${formatPortEvent(event)}`);
    });
  }
  lines.push('');
  lines.push('### Known Render Routine Hits');
  lines.push('');
  if (state.knownRoutineHits.length === 0) {
    lines.push('- none observed');
  } else {
    state.knownRoutineHits.forEach((hit) => {
      lines.push(`- step=${hit.step} pc=${hex(hit.pc)} ${hit.label}`);
    });
  }
  lines.push('');
  lines.push('### 0x08xxxx / 0x09xxxx Call or JP Targets');
  lines.push('');
  if (state.branchTargets.length === 0) {
    lines.push('- none observed');
  } else {
    state.branchTargets.forEach((event) => {
      lines.push(`- ${formatBranchEvent(event)}`);
    });
  }
  lines.push('');
  lines.push('### Dynamic Targets');
  lines.push('');
  if (state.dynamicTargets.length === 0) {
    lines.push('- none observed');
  } else {
    state.dynamicTargets.forEach((event) => {
      lines.push(`- ${formatDynamicTarget(event)}`);
    });
  }
  lines.push('');
  lines.push('## Assessment');
  lines.push('');

  if (reachedRenderer) {
    lines.push(`This direct-entry trace reached at least one renderer signal: VRAM writes=${state.vramWriteCount}, LCD MMIO accesses=${state.lcdAccessCount}, known routine hits=${state.knownRoutineHits.length}.`);
  } else {
    lines.push(`This direct-entry trace did not reach a confirmed GRAPH renderer. It terminated as \`${result.termination}\` at \`${hex(result.lastPc)}\` after \`${result.steps}\` steps with no VRAM writes, no LCD MMIO accesses, and no hits on the known VRAM helpers.`);
  }

  if (state.branchTargets.length > 0) {
    const targetPreview = state.branchTargets
      .slice(0, 6)
      .map((event) => hex(event.target))
      .join(', ');
    lines.push('');
    lines.push(`Visited blocks did reference additional 0x08xxxx/0x09xxxx targets: ${targetPreview}. Those are the first places to inspect if the trace still stops short of the actual renderer.`);
  }

  if (!reachedRenderer) {
    lines.push('');
    lines.push('If this still stops too early, the next step is to seed more GRAPH-specific state or start from the earlier event-loop handoff so the downstream callback path is fully initialized.');
  }

  lines.push('');

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  return [
    '# Phase 202B - GRAPH Trace Report',
    '',
    'Generated by `probe-phase202b-graph-trace.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
    '',
  ].join('\n');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, memory, { peripherals });
  const { cpu } = executor;

  initializeCpu(cpu, memory);

  const state = createProbeState(executor);
  installAccessHooks(cpu, state);

  const result = executor.runFrom(ENTRY, 'adl', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const traceStep = step + 1;
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';

      state.currentPc = normalizedPc;
      state.currentStep = traceStep;
      state.traceOrder.push(normalizedPc);
      state.uniquePcs.add(normalizedPc);

      console.log(`[${traceStep.toString().padStart(5, '0')}] ${hex(normalizedPc)} ${dasm}`);
      inspectVisitedBlock(state, normalizedPc, meta, traceStep);
    },
    onDynamicTarget(target, mode, sourcePc, step) {
      recordDynamicTarget(state, sourcePc & 0xFFFFFF, step + 1, target);
    },
  });

  const uniqueSorted = [...state.uniquePcs].sort((left, right) => left - right);
  const first30 = state.traceOrder.slice(0, TRACE_SUMMARY_COUNT);
  const finalUpbase = executor.lcdMmio?.upbase ?? null;

  console.log('');
  console.log('=== Summary ===');
  console.log(`steps=${result.steps}`);
  console.log(`termination=${result.termination}`);
  console.log(`lastPc=${hex(result.lastPc)}`);
  console.log(`uniquePcs(${uniqueSorted.length})=${uniqueSorted.map((pc) => hex(pc)).join(', ')}`);
  console.log(`vramWrites=${state.vramWriteCount > 0 ? 'yes' : 'no'} count=${state.vramWriteCount}`);
  console.log(`lcdMmioAccess=${state.lcdAccessCount > 0 ? 'yes' : 'no'} count=${state.lcdAccessCount}`);
  console.log(`irqPortAccess=${state.portAccessCount > 0 ? 'yes' : 'no'} count=${state.portAccessCount}`);
  console.log(`knownRenderRoutineHits=${state.knownRoutineHits.length}`);
  console.log(`initialUpbase=${hex(state.initialUpbase)} finalUpbase=${hex(finalUpbase)}`);
  console.log(`first30=${first30.map((pc) => hex(pc)).join(', ')}`);

  const report = buildReport(
    {
      ...result,
      finalUpbase,
    },
    state,
  );

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`report=${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  fs.writeFileSync(REPORT_PATH, buildFailureReport(error), 'utf8');
  throw error;
}
