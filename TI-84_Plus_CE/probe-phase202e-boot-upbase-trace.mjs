#!/usr/bin/env node
// Phase 202E - Extended Boot Upbase Trace
//
// Install LCD MMIO access hooks BEFORE cold boot, run the cold boot + OS init +
// post-init sequence with much larger step budgets than probe-phase202c-upbase-trace.mjs,
// and capture every write to LCD MMIO (0xE00000-0xE00920), with special focus on
// the upbase register at 0xE00010-0xE00012.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase202e-boot-upbase-report.md');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 500000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MAX_STEPS = 2000000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 5000;
const POST_INIT_MAX_LOOP_ITERATIONS = 1000;

const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const MBASE = 0xD0;

const LCD_MMIO_START = 0xE00000;
const LCD_MMIO_END = 0xE00920;
const UPBASE_START = 0xE00010;
const UPBASE_END = 0xE00012;

const RECENT_BLOCK_LIMIT = 64;
const TRACE_TAIL_COUNT = 30;
const TOP_PC_LIMIT = 20;

// LCD MMIO address region classification for top-PC grouping.
function classifyLcdAddr(addr) {
  if (addr >= 0xE00010 && addr <= 0xE00012) return 'upbase';
  if (addr === 0xE00018 || addr === 0xE00019) return 'ctrl';
  if (addr >= 0xE0001C && addr <= 0xE0001F) return 'lpbase';
  if (addr >= 0xE00024 && addr <= 0xE00027) return 'intr';
  if (addr >= 0xE00200 && addr <= 0xE005FF) return 'palette';
  if (addr >= 0xE00800 && addr <= 0xE0080F) return 'keyboard_cluster';
  if (addr >= 0xE00820 && addr <= 0xE00827) return 'cursor_cluster';
  if (addr >= 0xE00000 && addr <= 0xE000FF) return 'lcd_regs';
  return 'other_lcd';
}

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
  return a <= end && a + w - 1 >= start;
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

function createEnvironment(romBytes, blocks, { timerInterrupt }) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { memory, peripherals, executor, cpu: executor.cpu };
}

function createState() {
  return {
    currentPhase: 'idle',
    currentStep: 0,
    currentPc: null,
    currentMode: 'z80',
    recentBlocks: [],
    phases: [], // array of phase summaries
    upbaseWrites: [], // all upbase writes across phases
    lcdWritesByPc: new Map(), // pc -> {count, byRegion: Map(region->count), sampleAddr}
    lcdWritesByRegion: new Map(), // region -> count
  };
}

function recordBlock(state, pc, mode, meta) {
  state.currentStep += 1;
  state.currentPc = pc & 0xFFFFFF;
  state.currentMode = mode;
  const dasm = meta?.instructions?.[0]?.dasm ?? '???';
  pushRing(
    state.recentBlocks,
    { step: state.currentStep, pc: state.currentPc, phase: state.currentPhase, mode, dasm },
    RECENT_BLOCK_LIMIT,
  );
}

function recordAccess(state, phaseCounts, kind, addr, width, value, beforeUpbase, afterUpbase) {
  if (!intersectsRange(addr, width, LCD_MMIO_START, LCD_MMIO_END)) return;
  const a = addr & 0xFFFFFF;
  const v = normalizeWidthValue(width, value);
  const isUpbase = intersectsRange(a, width, UPBASE_START, UPBASE_END);

  if (kind === 'read') {
    phaseCounts.lcdReads += 1;
    return;
  }

  phaseCounts.lcdWrites += 1;

  const region = classifyLcdAddr(a);
  state.lcdWritesByRegion.set(region, (state.lcdWritesByRegion.get(region) ?? 0) + 1);

  const pc = state.currentPc ?? -1;
  let pcEntry = state.lcdWritesByPc.get(pc);
  if (!pcEntry) {
    pcEntry = { pc, count: 0, byRegion: new Map(), sampleAddr: a };
    state.lcdWritesByPc.set(pc, pcEntry);
  }
  pcEntry.count += 1;
  pcEntry.byRegion.set(region, (pcEntry.byRegion.get(region) ?? 0) + 1);

  if (isUpbase) {
    phaseCounts.upbaseWrites += 1;
    const event = {
      step: state.currentStep,
      phase: state.currentPhase,
      pc,
      addr: a,
      width,
      value: v,
      beforeUpbase,
      afterUpbase,
      traceTail: state.recentBlocks.slice(-TRACE_TAIL_COUNT).map((e) => ({
        step: e.step,
        phase: e.phase,
        pc: e.pc,
        mode: e.mode,
        dasm: e.dasm,
      })),
    };
    state.upbaseWrites.push(event);
    console.log(
      `  [UPBASE WRITE] step=${event.step} phase=${event.phase} pc=${hex(event.pc)} addr=${hex(event.addr)} w=${event.width} val=${formatWidthValue(width, v)} before=${hex(beforeUpbase)} after=${hex(afterUpbase)}`,
    );
  }
}

function installAccessHooks(executor, state, phaseCountsRef) {
  const { cpu } = executor;
  const o = {
    r8: cpu.read8.bind(cpu),
    r16: cpu.read16.bind(cpu),
    r24: cpu.read24.bind(cpu),
    w8: cpu.write8.bind(cpu),
    w16: cpu.write16.bind(cpu),
    w24: cpu.write24.bind(cpu),
  };

  cpu.read8 = (a) => {
    const v = o.r8(a);
    recordAccess(state, phaseCountsRef.current, 'read', a, 1, v);
    return v;
  };
  cpu.read16 = (a) => {
    const v = o.r16(a);
    recordAccess(state, phaseCountsRef.current, 'read', a, 2, v);
    return v;
  };
  cpu.read24 = (a) => {
    const v = o.r24(a);
    recordAccess(state, phaseCountsRef.current, 'read', a, 3, v);
    return v;
  };
  cpu.write8 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w8(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, phaseCountsRef.current, 'write', a, 1, v, before, after);
    return r;
  };
  cpu.write16 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w16(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, phaseCountsRef.current, 'write', a, 2, v, before, after);
    return r;
  };
  cpu.write24 = (a, v) => {
    const before = executor.lcdMmio?.upbase ?? null;
    const r = o.w24(a, v);
    const after = executor.lcdMmio?.upbase ?? null;
    recordAccess(state, phaseCountsRef.current, 'write', a, 3, v, before, after);
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

function runPhase(executor, state, phaseCountsRef, spec) {
  state.currentPhase = spec.label;
  const phaseCounts = {
    label: spec.label,
    entry: spec.entry,
    mode: spec.mode,
    lcdReads: 0,
    lcdWrites: 0,
    upbaseWrites: 0,
  };
  phaseCountsRef.current = phaseCounts;

  const startedAt = Date.now();
  console.log(`\n[${spec.label}] starting at ${hex(spec.entry)} mode=${spec.mode} maxSteps=${spec.maxSteps}`);
  const result = executor.runFrom(spec.entry, spec.mode, {
    maxSteps: spec.maxSteps,
    maxLoopIterations: spec.maxLoopIterations,
    onBlock(pc, mode, meta /*, step */) {
      recordBlock(state, pc, mode, meta);
    },
  });
  const elapsed = Date.now() - startedAt;

  const summary = {
    ...phaseCounts,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced ?? 0,
    elapsedMs: elapsed,
    finalUpbase: executor.lcdMmio?.upbase ?? null,
  };
  state.phases.push(summary);
  console.log(
    `[${spec.label}] done steps=${summary.steps} term=${summary.termination} lastPc=${hex(summary.lastPc)} lcdW=${summary.lcdWrites} upbaseW=${summary.upbaseWrites} finalUpbase=${hex(summary.finalUpbase)} (${elapsed}ms)`,
  );
  return summary;
}

function topEntries(map, limit, valueOf = (v) => v) {
  return [...map.entries()]
    .sort((a, b) => valueOf(b[1]) - valueOf(a[1]) || a[0] - b[0])
    .slice(0, limit);
}

function buildReport(state, initialUpbase) {
  const lines = [];

  lines.push('# Phase 202E - Extended Boot Upbase Trace');
  lines.push('');
  lines.push('Generated by `probe-phase202e-boot-upbase-trace.mjs`.');
  lines.push('');
  lines.push('LCD MMIO access hooks installed **before** cold boot. Timer interrupt disabled.');
  lines.push('');
  lines.push(`Initial upbase at executor construction: \`${hex(initialUpbase)}\``);
  lines.push('');
  lines.push('## Per-phase Summary');
  lines.push('');
  lines.push('| Phase | Entry | Steps | Termination | Last PC | LCD W | LCD R | Upbase W | Final Upbase |');
  lines.push('| --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- |');
  for (const p of state.phases) {
    lines.push(
      `| ${p.label} | \`${hex(p.entry)}\` | ${p.steps} | \`${p.termination}\` | \`${hex(p.lastPc)}\` | ${p.lcdWrites} | ${p.lcdReads} | ${p.upbaseWrites} | \`${hex(p.finalUpbase)}\` |`,
    );
  }
  lines.push('');

  lines.push('## Upbase Writes');
  lines.push('');
  if (state.upbaseWrites.length === 0) {
    lines.push('_No writes to the LCD upbase register (0xE00010-0xE00012) were observed during cold boot + OS init + post-init._');
    lines.push('');
  } else {
    lines.push(`Observed **${state.upbaseWrites.length}** upbase write(s).`);
    lines.push('');
    lines.push('| # | Step | Phase | PC | Addr | Width | Value | Before | After |');
    lines.push('| --: | --: | --- | --- | --- | --: | --- | --- | --- |');
    state.upbaseWrites.forEach((e, i) => {
      lines.push(
        `| ${i + 1} | ${e.step} | ${e.phase} | \`${hex(e.pc)}\` | \`${hex(e.addr)}\` | ${e.width} | \`${formatWidthValue(e.width, e.value)}\` | \`${hex(e.beforeUpbase)}\` | \`${hex(e.afterUpbase)}\` |`,
      );
    });
    lines.push('');

    state.upbaseWrites.forEach((e, i) => {
      lines.push(`### Trace tail leading to upbase write #${i + 1} (pc=${hex(e.pc)})`);
      lines.push('');
      lines.push('```text');
      for (const t of e.traceTail) {
        lines.push(`step=${t.step} phase=${t.phase} mode=${t.mode} pc=${hex(t.pc)} ${t.dasm}`);
      }
      lines.push('```');
      lines.push('');
    });
  }

  lines.push('## LCD Writes by Region');
  lines.push('');
  if (state.lcdWritesByRegion.size === 0) {
    lines.push('_No LCD MMIO writes observed._');
  } else {
    lines.push('| Region | Writes |');
    lines.push('| --- | --: |');
    for (const [region, count] of topEntries(state.lcdWritesByRegion, 100)) {
      lines.push(`| ${region} | ${count} |`);
    }
  }
  lines.push('');

  lines.push(`## Top ${TOP_PC_LIMIT} PCs by LCD MMIO Writes`);
  lines.push('');
  if (state.lcdWritesByPc.size === 0) {
    lines.push('_No LCD MMIO writes observed._');
  } else {
    lines.push('| PC | Writes | Regions | Sample Addr |');
    lines.push('| --- | --: | --- | --- |');
    const entries = [...state.lcdWritesByPc.values()]
      .sort((a, b) => b.count - a.count || a.pc - b.pc)
      .slice(0, TOP_PC_LIMIT);
    for (const e of entries) {
      const regions = [...e.byRegion.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([r, c]) => `${r} x${c}`)
        .join(', ');
      lines.push(`| \`${hex(e.pc)}\` | ${e.count} | ${regions} | \`${hex(e.sampleAddr)}\` |`);
    }
  }
  lines.push('');

  return lines.join('\n') + '\n';
}

function buildFailureReport(error, state, initialUpbase) {
  const partial = state && state.phases ? buildReport(state, initialUpbase) : '';
  return [
    '# Phase 202E - Extended Boot Upbase Trace',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
    '',
    '## Partial report',
    '',
    partial || '_No partial data captured before failure._',
    '',
  ].join('\n');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  const { memory, executor, cpu } = createEnvironment(romBytes, blocks, { timerInterrupt: false });

  const state = createState();
  const initialUpbase = executor.lcdMmio?.upbase ?? null;

  // KEY DIFFERENCE vs 202C: install hooks BEFORE cold boot.
  const phaseCountsRef = { current: { lcdReads: 0, lcdWrites: 0, upbaseWrites: 0 } };
  const restoreHooks = installAccessHooks(executor, state, phaseCountsRef);

  try {
    // Phase 1: cold boot with massively expanded step budget.
    runPhase(executor, state, phaseCountsRef, {
      label: 'cold_boot',
      entry: BOOT_ENTRY,
      mode: BOOT_MODE,
      maxSteps: BOOT_MAX_STEPS,
      maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    });

    // Phase 2: OS init with 20x the old step budget.
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.mbase = MBASE;
    resetStack(cpu, memory, 3);

    runPhase(executor, state, phaseCountsRef, {
      label: 'os_init',
      entry: OS_INIT_ENTRY,
      mode: 'adl',
      maxSteps: OS_INIT_MAX_STEPS,
      maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    });

    // Phase 3: post-init as in base probe.
    cpu.mbase = MBASE;
    cpu._iy = IY_BASE;
    cpu._ix = IX_STAGE;
    cpu._hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, memory, 3);

    runPhase(executor, state, phaseCountsRef, {
      label: 'post_init',
      entry: POST_INIT_ENTRY,
      mode: 'adl',
      maxSteps: POST_INIT_MAX_STEPS,
      maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
    });
  } catch (error) {
    restoreHooks();
    fs.writeFileSync(REPORT_PATH, buildFailureReport(error, state, initialUpbase), 'utf8');
    throw error;
  }

  restoreHooks();
  const report = buildReport(state, initialUpbase);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\nreport=${REPORT_PATH}`);

  console.log('\nPer-phase summary:');
  for (const p of state.phases) {
    console.log(
      `  [${p.label}] steps=${p.steps} term=${p.termination} lastPc=${hex(p.lastPc)} upbaseW=${p.upbaseWrites} lcdW=${p.lcdWrites} final=${hex(p.finalUpbase)}`,
    );
  }
  console.log(`Total upbase writes: ${state.upbaseWrites.length}`);
  if (state.upbaseWrites.length > 0) {
    const first = state.upbaseWrites[0];
    console.log(
      `First upbase write: step=${first.step} phase=${first.phase} pc=${hex(first.pc)} addr=${hex(first.addr)} w=${first.width} val=${formatWidthValue(first.width, first.value)}`,
    );
  }
}

try {
  await main();
} catch (err) {
  console.error(err.stack || err);
  process.exitCode = 1;
}
