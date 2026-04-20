#!/usr/bin/env node
// Phase 202C - ISR Trace Probe
//
// Builds on probe-phase202c-upbase-trace.mjs. After the same cold boot + os_init +
// post_init + 4 home-screen stages, tries three (or four) strategies to invoke
// the IM1 ISR handler and observe which ROM routine writes the LCD upbase
// register (0xE00010-0xE00012).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase202c-isr-trace-report.md');

const MEM_SIZE = 0x1000000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const MBASE = 0xD0;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const LCD_MMIO_START = 0xE00000;
const LCD_MMIO_END = 0xE00920;
const UPBASE_START = 0xE00010;
const UPBASE_END = 0xE00012;

const ISR_MAX_STEPS = 50000;
const ISR_MAX_LOOP_ITERATIONS = 1000;
const RECENT_BLOCK_LIMIT = 64;
const TRACE_TAIL_COUNT = 30;

const STAGES = [
  { label: 'stage_1_status_bar', entry: 0x0A2B72, maxSteps: 30000 },
  { label: 'stage_2_home_row', entry: 0x0A29EC, maxSteps: 50000, seedMode: true },
  { label: 'stage_3_history', entry: 0x0A2854, maxSteps: 50000 },
  { label: 'stage_4_entry_line_bg', entry: 0x0A2106, maxSteps: 30000 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy',
  'i', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

// ---------- helpers ----------

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatWidthValue(width, value) {
  return hex(value, Math.max(2, width * 2));
}

function intersectsRange(addr, width, start, end) {
  const a = addr & 0xFFFFFF;
  const w = Math.max(1, width | 0);
  return a <= end && (a + w - 1) >= start;
}

function normalizeWidthValue(width, value) {
  const n = Number(value) >>> 0;
  if (width <= 1) return n & 0xFF;
  if (width === 2) return n & 0xFFFF;
  if (width === 3) return n & 0xFFFFFF;
  return n;
}

function pushRing(list, entry, limit) {
  list.push(entry);
  if (list.length > limit) list.shift();
}

function resetStack(cpu, memory, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  memory.fill(0xFF, cpu.sp, cpu.sp + size);
}

function seedModeBuffer(memory) {
  for (let i = 0; i < MODE_BUF_TEXT.length; i += 1) {
    memory[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap, memory) {
  for (const [k, v] of Object.entries(snap)) cpu[k] = v;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_STAGE;
  cpu.f = 0x40;
  resetStack(cpu, memory, 12);
}

function snapshotLcdMmio(executor) {
  if (!executor.lcdMmio) return null;
  return { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control };
}

function restoreLcdMmio(executor, snap) {
  if (!snap || !executor.lcdMmio) return;
  executor.lcdMmio.upbase = snap.upbase;
  executor.lcdMmio.control = snap.control;
}

// ---------- environment ----------

function createEnvironment(romBytes, blocks, { timerInterrupt }) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { memory, peripherals, executor, cpu: executor.cpu };
}

// ---------- per-strategy state ----------

function createStrategyState(label) {
  return {
    label,
    stepBase: 0,
    currentStep: 0,
    currentPc: null,
    currentMode: 'adl',
    recentBlocks: [],
    lcdWrites: 0,
    lcdReads: 0,
    upbaseWrites: [],
    upbaseReads: [],
    otherLcdWrites: [],
    pcExec: new Map(), // pc -> count
    pcLcd: new Map(), // pc -> lcd-access count
    summary: null,
  };
}

function recordBlock(state, pc, mode, meta) {
  const dasm = meta?.instructions?.[0]?.dasm ?? '???';
  const globalStep = state.stepBase + 1;
  const entry = { step: globalStep, pc: pc & 0xFFFFFF, mode, dasm };
  state.currentStep = globalStep;
  state.currentPc = entry.pc;
  state.currentMode = mode;
  state.stepBase = globalStep;
  pushRing(state.recentBlocks, entry, RECENT_BLOCK_LIMIT);
  state.pcExec.set(entry.pc, (state.pcExec.get(entry.pc) ?? 0) + 1);
}

function recordAccess(state, kind, addr, width, value, beforeUpbase, afterUpbase) {
  if (!intersectsRange(addr, width, LCD_MMIO_START, LCD_MMIO_END)) return;
  const a = addr & 0xFFFFFF;
  const v = normalizeWidthValue(width, value);
  const isUpbase = intersectsRange(a, width, UPBASE_START, UPBASE_END);

  if (kind === 'read') state.lcdReads += 1;
  else state.lcdWrites += 1;

  state.pcLcd.set(state.currentPc, (state.pcLcd.get(state.currentPc) ?? 0) + 1);

  const event = {
    step: state.currentStep,
    pc: state.currentPc,
    addr: a,
    width,
    value: v,
    kind,
    beforeUpbase,
    afterUpbase,
  };

  if (isUpbase) {
    if (kind === 'read') {
      state.upbaseReads.push(event);
    } else {
      event.traceTail = state.recentBlocks.slice(-TRACE_TAIL_COUNT).map((e) => ({
        step: e.step,
        pc: e.pc,
        dasm: e.dasm,
      }));
      state.upbaseWrites.push(event);
    }
  } else if (kind === 'write' && state.otherLcdWrites.length < 40) {
    state.otherLcdWrites.push(event);
  }
}

function installStrategyHooks(executor, state) {
  const { cpu } = executor;
  const o = {
    r8: cpu.read8.bind(cpu),
    r16: cpu.read16.bind(cpu),
    r24: cpu.read24.bind(cpu),
    w8: cpu.write8.bind(cpu),
    w16: cpu.write16.bind(cpu),
    w24: cpu.write24.bind(cpu),
  };

  cpu.read8 = (a) => { const v = o.r8(a); recordAccess(state, 'read', a, 1, v); return v; };
  cpu.read16 = (a) => { const v = o.r16(a); recordAccess(state, 'read', a, 2, v); return v; };
  cpu.read24 = (a) => { const v = o.r24(a); recordAccess(state, 'read', a, 3, v); return v; };

  cpu.write8 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w8(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, 'write', a, 1, v, before, after);
    return r;
  };
  cpu.write16 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w16(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, 'write', a, 2, v, before, after);
    return r;
  };
  cpu.write24 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w24(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, 'write', a, 3, v, before, after);
    return r;
  };

  return () => {
    cpu.read8 = o.r8;
    cpu.read16 = o.r16;
    cpu.read24 = o.r24;
    cpu.write8 = o.w8;
    cpu.write16 = o.w16;
    cpu.write24 = o.w24;
  };
}

// ---------- phase runner (stage/init phases, no hooks mutate state) ----------

function runPlainPhase(executor, label, entry, mode, maxSteps, maxLoopIterations) {
  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
  });
  console.log(`[${label}] steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  return result;
}

// ---------- strategies ----------

function runStrategy(label, executor, cpu, memory, peripherals, setup) {
  const state = createStrategyState(label);
  const restore = installStrategyHooks(executor, state);

  let termination = 'max_steps';
  let lastPc = null;
  let steps = 0;

  try {
    const entry = setup({ cpu, memory, peripherals, executor });
    const startAddr = entry.pc;
    const startMode = entry.mode;

    const result = executor.runFrom(startAddr, startMode, {
      maxSteps: ISR_MAX_STEPS,
      maxLoopIterations: ISR_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta /*, step */) {
        recordBlock(state, pc, mode, meta);
      },
      onInterrupt() {},
    });

    steps = result.steps;
    termination = result.termination;
    lastPc = result.lastPc;
  } catch (err) {
    termination = `error: ${err.message}`;
  } finally {
    restore();
  }

  state.summary = {
    label,
    steps,
    termination,
    lastPc,
    upbaseWrites: state.upbaseWrites.length,
    upbaseReads: state.upbaseReads.length,
    lcdWrites: state.lcdWrites,
    lcdReads: state.lcdReads,
  };
  return state;
}

// ---------- report ----------

function topEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit);
}

function renderStrategy(state) {
  const lines = [];
  const s = state.summary;
  lines.push(`### Strategy ${s.label}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Steps | ${s.steps} |`);
  lines.push(`| Termination | \`${s.termination}\` |`);
  lines.push(`| Last PC | \`${hex(s.lastPc)}\` |`);
  lines.push(`| LCD reads | ${s.lcdReads} |`);
  lines.push(`| LCD writes | ${s.lcdWrites} |`);
  lines.push(`| Upbase writes | ${s.upbaseWrites} |`);
  lines.push(`| Upbase reads | ${s.upbaseReads} |`);
  lines.push('');

  if (state.upbaseWrites.length > 0) {
    lines.push('#### Upbase writes');
    lines.push('');
    lines.push('| # | Step | PC | Addr | Width | Value | Before | After |');
    lines.push('| --: | --: | --- | --- | --: | --- | --- | --- |');
    state.upbaseWrites.forEach((e, i) => {
      lines.push(`| ${i + 1} | ${e.step} | \`${hex(e.pc)}\` | \`${hex(e.addr)}\` | ${e.width} | \`${formatWidthValue(e.width, e.value)}\` | \`${hex(e.beforeUpbase)}\` | \`${hex(e.afterUpbase)}\` |`);
    });
    lines.push('');
    state.upbaseWrites.forEach((e, i) => {
      lines.push(`##### Trace tail leading to upbase write #${i + 1}`);
      lines.push('');
      lines.push('```text');
      for (const t of e.traceTail ?? []) {
        lines.push(`step=${t.step} pc=${hex(t.pc)} ${t.dasm}`);
      }
      lines.push('```');
      lines.push('');
    });
  } else {
    lines.push('_No upbase writes observed._');
    lines.push('');
    lines.push('#### Top 20 PCs by execution frequency');
    lines.push('');
    lines.push('| PC | Count |');
    lines.push('| --- | --: |');
    for (const [pc, count] of topEntries(state.pcExec, 20)) {
      lines.push(`| \`${hex(pc)}\` | ${count} |`);
    }
    lines.push('');
    lines.push('#### Top 10 PCs that touched LCD MMIO');
    lines.push('');
    if (state.pcLcd.size === 0) {
      lines.push('_None._');
    } else {
      lines.push('| PC | LCD accesses |');
      lines.push('| --- | --: |');
      for (const [pc, count] of topEntries(state.pcLcd, 10)) {
        lines.push(`| \`${hex(pc)}\` | ${count} |`);
      }
    }
    lines.push('');
  }

  if (state.otherLcdWrites.length > 0) {
    lines.push('#### Non-upbase LCD writes (first 40)');
    lines.push('');
    lines.push('| Step | PC | Addr | Width | Value |');
    lines.push('| --: | --- | --- | --: | --- |');
    for (const e of state.otherLcdWrites) {
      lines.push(`| ${e.step} | \`${hex(e.pc)}\` | \`${hex(e.addr)}\` | ${e.width} | \`${formatWidthValue(e.width, e.value)}\` |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildReport(strategies, preRunInfo) {
  const lines = [];
  lines.push('# Phase 202C - ISR Trace Report');
  lines.push('');
  lines.push('Generated by `probe-phase202c-isr-trace.mjs`.');
  lines.push('');
  lines.push('## Pre-run state');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(preRunInfo)) {
    lines.push(`| ${k} | \`${v}\` |`);
  }
  lines.push('');
  lines.push('## Strategy summary');
  lines.push('');
  lines.push('| Strategy | Steps | Termination | Last PC | LCD W | LCD R | Upbase W | Upbase R |');
  lines.push('| --- | --: | --- | --- | --: | --: | --: | --: |');
  for (const s of strategies) {
    const x = s.summary;
    lines.push(`| ${x.label} | ${x.steps} | \`${x.termination}\` | \`${hex(x.lastPc)}\` | ${x.lcdWrites} | ${x.lcdReads} | ${x.upbaseWrites} | ${x.upbaseReads} |`);
  }
  lines.push('');
  lines.push('## Per-strategy detail');
  lines.push('');
  for (const s of strategies) {
    lines.push(renderStrategy(s));
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// ---------- stage setup (shared) ----------

async function preparePostStageSnapshot(romBytes, blocks) {
  const env = createEnvironment(romBytes, blocks, { timerInterrupt: false });
  const { memory, executor, cpu, peripherals } = env;

  // Cold boot
  runPlainPhase(executor, 'cold_boot', BOOT_ENTRY, BOOT_MODE, BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);

  // os_init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);
  runPlainPhase(executor, 'os_init', OS_INIT_ENTRY, 'adl', OS_INIT_MAX_STEPS, OS_INIT_MAX_LOOP_ITERATIONS);

  // post_init
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_STAGE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);
  runPlainPhase(executor, 'post_init', POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, POST_INIT_MAX_LOOP_ITERATIONS);

  const postInitSnapshot = snapshotCpu(cpu);

  // stages
  for (const stage of STAGES) {
    restoreCpu(cpu, postInitSnapshot, memory);
    if (stage.seedMode) seedModeBuffer(memory);
    runPlainPhase(executor, stage.label, stage.entry, 'adl', stage.maxSteps, ISR_MAX_LOOP_ITERATIONS);
  }

  return {
    ramSnapshot: new Uint8Array(memory.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    lcdSnapshot: snapshotLcdMmio(executor),
    postInitSnapshot,
    intcEnableMask: [
      peripherals.read(0x5004),
      peripherals.read(0x5005),
      peripherals.read(0x5006),
    ],
    timerWrites: peripherals.getState().timers.writes,
    preUpbase: executor.lcdMmio?.upbase ?? null,
  };
}

function buildRestoredEnv(romBytes, blocks, snapshot, timerInterrupt) {
  const env = createEnvironment(romBytes, blocks, { timerInterrupt });
  const { memory, executor, cpu, peripherals } = env;
  memory.set(snapshot.ramSnapshot, RAM_SNAPSHOT_START);
  restoreCpu(cpu, snapshot.postInitSnapshot, memory);
  restoreLcdMmio(executor, snapshot.lcdSnapshot);
  peripherals.write(0x5004, snapshot.intcEnableMask[0]);
  peripherals.write(0x5005, snapshot.intcEnableMask[1]);
  peripherals.write(0x5006, snapshot.intcEnableMask[2]);
  for (const [port, value] of Object.entries(snapshot.timerWrites)) {
    peripherals.write(Number(port), value);
  }
  return env;
}

// ---------- main ----------

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  console.log('Preparing post-stage snapshot...');
  const snapshot = await preparePostStageSnapshot(romBytes, blocks);
  console.log(`snapshot upbase=${hex(snapshot.preUpbase)}`);

  const strategies = [];

  // ---------- Strategy A: jump to IVT at 0x00038 in z80 mode ----------
  {
    console.log('\n=== Strategy A: jump_ivt_z80 ===');
    const env = buildRestoredEnv(romBytes, blocks, snapshot, false);
    const { cpu, memory, peripherals, executor } = env;
    const state = runStrategy('jump_ivt_z80', executor, cpu, memory, peripherals, (ctx) => {
      // Emulate an IM1 IRQ dispatch: push current pc, set IFFs to 0, jump to 0x38 z80.
      ctx.cpu.iff1 = 0;
      ctx.cpu.iff2 = 0;
      ctx.cpu.im = 1;
      ctx.cpu.halted = false;
      ctx.cpu.mbase = MBASE;
      ctx.cpu._iy = IY_BASE;
      resetStack(ctx.cpu, ctx.memory, 3);
      // Push a sentinel return address so RET from ISR lands somewhere safe.
      ctx.cpu.push(0x000000);
      return { pc: 0x000038, mode: 'z80' };
    });
    strategies.push(state);
  }

  // ---------- Strategy B: jump to dispatch gate at 0x0719 in ADL mode ----------
  {
    console.log('\n=== Strategy B: jump_dispatch_gate ===');
    const env = buildRestoredEnv(romBytes, blocks, snapshot, false);
    const { cpu, memory, peripherals, executor } = env;
    const state = runStrategy('jump_dispatch_gate', executor, cpu, memory, peripherals, (ctx) => {
      ctx.cpu.iff1 = 0;
      ctx.cpu.iff2 = 0;
      ctx.cpu.im = 1;
      ctx.cpu.halted = false;
      ctx.cpu.mbase = MBASE;
      ctx.cpu._iy = IY_BASE;
      resetStack(ctx.cpu, ctx.memory, 3);
      ctx.cpu.push(0x000000);
      return { pc: 0x000719, mode: 'adl' };
    });
    strategies.push(state);
  }

  // ---------- Strategy C: raise timer IRQ via ticks ----------
  {
    console.log('\n=== Strategy C: raise_timer_irq ===');
    const env = buildRestoredEnv(romBytes, blocks, snapshot, true);
    const { cpu, memory, peripherals, executor } = env;
    const state = runStrategy('raise_timer_irq', executor, cpu, memory, peripherals, (ctx) => {
      ctx.cpu.halted = false;
      ctx.cpu.mbase = MBASE;
      ctx.cpu._iy = IY_BASE;
      ctx.cpu._ix = IX_STAGE;
      ctx.cpu.im = 1;
      ctx.cpu.iff1 = 1;
      ctx.cpu.iff2 = 1;
      resetStack(ctx.cpu, ctx.memory, 3);
      // Force an IRQ pending before the first block so the runtime-interrupt
      // check inside runFrom fires on the first loop iteration.
      ctx.peripherals.triggerIRQ();
      // Start executing from the event-loop entry so the runtime observes
      // pending IRQ + iff1 on the first block boundary.
      return { pc: 0x0019BE, mode: 'adl' };
    });
    strategies.push(state);
  }

  // ---------- Strategy D: explicitly triggerIRQ() while running ----------
  {
    console.log('\n=== Strategy D: trigger_irq_then_run_halt ===');
    const env = buildRestoredEnv(romBytes, blocks, snapshot, false);
    const { cpu, memory, peripherals, executor } = env;
    const state = runStrategy('trigger_irq_then_run_halt', executor, cpu, memory, peripherals, (ctx) => {
      ctx.cpu.halted = false;
      ctx.cpu.mbase = MBASE;
      ctx.cpu._iy = IY_BASE;
      ctx.cpu._ix = IX_STAGE;
      ctx.cpu.im = 1;
      ctx.cpu.iff1 = 1;
      ctx.cpu.iff2 = 1;
      resetStack(ctx.cpu, ctx.memory, 3);
      ctx.peripherals.triggerIRQ();
      return { pc: 0x0019BE, mode: 'adl' };
    });
    strategies.push(state);
  }

  const preRun = {
    pre_upbase: hex(snapshot.preUpbase),
    intc_enable_mask: snapshot.intcEnableMask.map((v) => hex(v, 2)).join(' '),
    timer_writes: Object.entries(snapshot.timerWrites)
      .map(([p, v]) => `${hex(Number(p), 4)}=${hex(v, 2)}`)
      .join(', ') || 'none',
  };

  fs.writeFileSync(REPORT_PATH, buildReport(strategies, preRun), 'utf8');
  console.log(`\nreport=${REPORT_PATH}`);

  for (const s of strategies) {
    const x = s.summary;
    console.log(`[${x.label}] steps=${x.steps} term=${x.termination} lastPc=${hex(x.lastPc)} upbaseW=${x.upbaseWrites} lcdW=${x.lcdWrites}`);
  }
}

try {
  await main();
} catch (err) {
  console.error(err.stack || err);
  try {
    fs.writeFileSync(REPORT_PATH, `# Phase 202C - ISR Trace Report\n\nFailure:\n\n\`\`\`\n${err.stack || err}\n\`\`\`\n`);
  } catch {}
  process.exitCode = 1;
}
