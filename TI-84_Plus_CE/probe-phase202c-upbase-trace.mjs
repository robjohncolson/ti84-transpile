#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase202c-upbase-report.md');

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

const EVENT_LOOP_ENTRY = 0x0019BE;
const EVENT_LOOP_MAX_STEPS = 200000;
const EVENT_LOOP_MAX_LOOP_ITERATIONS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const MBASE = 0xD0;
const SENTINEL_VALUE = 0xFFFFFF;

const CALLBACK_PTR = 0xD02AD7;
const SYS_FLAG_ADDR = 0xD0009B;
const SYS_FLAG_MASK = 0x40;
const DEEP_INIT_FLAG_ADDR = 0xD177BA;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const LCD_MMIO_START = 0xE00000;
const LCD_MMIO_END = 0xE00920;
const UPBASE_START = 0xE00010;
const UPBASE_END = 0xE00012;
const LCD_CONTROL_ADDR = 0xE00018;

const KBD_MMIO_REGS = {
  mode: 0xE00803,
  enable: 0xE00807,
  column: 0xE00808,
  interval: 0xE0080F,
};

const ACCESS_SAMPLE_LIMIT = 80;
const INTERRUPT_SAMPLE_LIMIT = 80;
const RECENT_BLOCK_LIMIT = 64;
const TRACE_TAIL_COUNT = 20;
const TOP_PC_LIMIT = 30;

const STAGES = [
  {
    label: 'stage_1_status_bar',
    entry: 0x0A2B72,
    maxSteps: 30000,
  },
  {
    label: 'stage_2_home_row',
    entry: 0x0A29EC,
    maxSteps: 50000,
    beforeRun(memory) {
      seedModeBuffer(memory);
    },
  },
  {
    label: 'stage_3_history',
    entry: 0x0A2854,
    maxSteps: 50000,
  },
  {
    label: 'stage_4_entry_line_bg',
    entry: 0x0A2106,
    maxSteps: 30000,
  },
];

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatWidthValue(width, value) {
  return hex(value, Math.max(2, width * 2));
}

function read24(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
}

function write24(memory, addr, value) {
  memory[addr] = value & 0xFF;
  memory[addr + 1] = (value >> 8) & 0xFF;
  memory[addr + 2] = (value >> 16) & 0xFF;
}

function intersectsRange(addr, width, start, end) {
  const normalizedAddr = addr & 0xFFFFFF;
  const normalizedWidth = Math.max(1, width | 0);
  const lastAddr = normalizedAddr + normalizedWidth - 1;
  return normalizedAddr <= end && lastAddr >= start;
}

function normalizeWidthValue(width, value) {
  const normalized = Number(value) >>> 0;

  if (width <= 1) {
    return normalized & 0xFF;
  }

  if (width === 2) {
    return normalized & 0xFFFF;
  }

  if (width === 3) {
    return normalized & 0xFFFFFF;
  }

  return normalized;
}

function pushRing(list, entry, limit) {
  list.push(entry);

  if (list.length > limit) {
    list.shift();
  }
}

function resetStack(cpu, memory, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  memory.fill(0xFF, cpu.sp, cpu.sp + size);
}

function seedModeBuffer(memory) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    memory[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot, memory) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

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
  if (!executor.lcdMmio) {
    return null;
  }

  return {
    upbase: executor.lcdMmio.upbase,
    control: executor.lcdMmio.control,
  };
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor.lcdMmio) {
    return;
  }

  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function snapshotKeyboardMmio(cpu) {
  return {
    mode: cpu.read8(KBD_MMIO_REGS.mode),
    enable: cpu.read8(KBD_MMIO_REGS.enable),
    column: cpu.read8(KBD_MMIO_REGS.column),
    interval: cpu.read8(KBD_MMIO_REGS.interval),
  };
}

function restoreKeyboardMmio(cpu, snapshot) {
  if (!snapshot) {
    return;
  }

  cpu.write8(KBD_MMIO_REGS.mode, snapshot.mode);
  cpu.write8(KBD_MMIO_REGS.enable, snapshot.enable);
  cpu.write8(KBD_MMIO_REGS.column, snapshot.column);
  cpu.write8(KBD_MMIO_REGS.interval, snapshot.interval);
}

function createEnvironment(romBytes, blocks, { timerInterrupt }) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt,
  });
  const executor = createExecutor(blocks, memory, { peripherals });

  return {
    memory,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function createState() {
  return {
    stepBase: 0,
    currentStep: 0,
    currentPc: null,
    currentPhase: 'idle',
    recentBlocks: [],
    accessCount: 0,
    readCount: 0,
    writeCount: 0,
    accessSamples: [],
    byAddress: new Map(),
    byPc: new Map(),
    upbaseReads: [],
    upbaseWrites: [],
    interruptCount: 0,
    interruptSamples: [],
    runSummaries: [],
    coldBootSummary: null,
    initialUpbase: null,
    preEventUpbase: null,
    finalUpbase: null,
    preEventState: null,
    postEventState: null,
  };
}

function ensureAddressSummary(state, addr) {
  let summary = state.byAddress.get(addr);

  if (!summary) {
    summary = {
      addr,
      count: 0,
      reads: 0,
      writes: 0,
      widths: new Set(),
      pcs: new Map(),
      phases: new Set(),
    };
    state.byAddress.set(addr, summary);
  }

  return summary;
}

function ensurePcSummary(state, pc) {
  let summary = state.byPc.get(pc);

  if (!summary) {
    summary = {
      pc,
      count: 0,
      reads: 0,
      writes: 0,
      addresses: new Map(),
      phases: new Set(),
    };
    state.byPc.set(pc, summary);
  }

  return summary;
}

function captureTraceTail(state) {
  return state.recentBlocks.slice(-TRACE_TAIL_COUNT).map((entry) => ({
    step: entry.step,
    pc: entry.pc,
    phase: entry.phase,
    dasm: entry.dasm,
  }));
}

function recordAccess(state, kind, addr, width, value, extra = {}) {
  if (!intersectsRange(addr, width, LCD_MMIO_START, LCD_MMIO_END)) {
    return;
  }

  const normalizedAddr = addr & 0xFFFFFF;
  const normalizedValue = normalizeWidthValue(width, value);
  const isUpbase = intersectsRange(normalizedAddr, width, UPBASE_START, UPBASE_END);

  const event = {
    step: state.currentStep,
    pc: state.currentPc,
    phase: state.currentPhase,
    kind,
    addr: normalizedAddr,
    width,
    value: normalizedValue,
    isUpbase,
    beforeUpbase: extra.beforeUpbase ?? null,
    afterUpbase: extra.afterUpbase ?? null,
    traceTail: extra.traceTail ?? null,
  };

  state.accessCount += 1;

  if (kind === 'read') {
    state.readCount += 1;
  } else {
    state.writeCount += 1;
  }

  if (state.accessSamples.length < ACCESS_SAMPLE_LIMIT) {
    state.accessSamples.push(event);
  }

  const addressSummary = ensureAddressSummary(state, normalizedAddr);
  addressSummary.count += 1;
  addressSummary.widths.add(width);
  addressSummary.phases.add(state.currentPhase);
  addressSummary.pcs.set(
    state.currentPc ?? -1,
    (addressSummary.pcs.get(state.currentPc ?? -1) ?? 0) + 1,
  );

  if (kind === 'read') {
    addressSummary.reads += 1;
  } else {
    addressSummary.writes += 1;
  }

  const pcSummary = ensurePcSummary(state, state.currentPc ?? -1);
  pcSummary.count += 1;
  pcSummary.phases.add(state.currentPhase);
  pcSummary.addresses.set(
    normalizedAddr,
    (pcSummary.addresses.get(normalizedAddr) ?? 0) + 1,
  );

  if (kind === 'read') {
    pcSummary.reads += 1;
  } else {
    pcSummary.writes += 1;
  }

  if (isUpbase) {
    if (kind === 'read') {
      state.upbaseReads.push(event);
    } else {
      state.upbaseWrites.push(event);
    }
  }

  console.log(
    `  [LCD ${kind}] step=${event.step} phase=${event.phase} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${event.width} value=${formatWidthValue(event.width, event.value)} upbase=${event.isUpbase ? 'yes' : 'no'}`,
  );
}

function installAccessHooks(executor, state) {
  const { cpu } = executor;
  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordAccess(state, 'read', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    recordAccess(state, 'read', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    recordAccess(state, 'read', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const beforeUpbase = executor.lcdMmio?.upbase ?? null;
    const result = originalWrite8(addr, value);
    const afterUpbase = executor.lcdMmio?.upbase ?? null;

    recordAccess(state, 'write', addr, 1, value, {
      beforeUpbase,
      afterUpbase,
      traceTail: intersectsRange(addr, 1, UPBASE_START, UPBASE_END)
        ? captureTraceTail(state)
        : null,
    });

    return result;
  };

  cpu.write16 = (addr, value) => {
    const beforeUpbase = executor.lcdMmio?.upbase ?? null;
    const result = originalWrite16(addr, value);
    const afterUpbase = executor.lcdMmio?.upbase ?? null;

    recordAccess(state, 'write', addr, 2, value, {
      beforeUpbase,
      afterUpbase,
      traceTail: intersectsRange(addr, 2, UPBASE_START, UPBASE_END)
        ? captureTraceTail(state)
        : null,
    });

    return result;
  };

  cpu.write24 = (addr, value) => {
    const beforeUpbase = executor.lcdMmio?.upbase ?? null;
    const result = originalWrite24(addr, value);
    const afterUpbase = executor.lcdMmio?.upbase ?? null;

    recordAccess(state, 'write', addr, 3, value, {
      beforeUpbase,
      afterUpbase,
      traceTail: intersectsRange(addr, 3, UPBASE_START, UPBASE_END)
        ? captureTraceTail(state)
        : null,
    });

    return result;
  };

  return () => {
    cpu.read8 = originalRead8;
    cpu.read16 = originalRead16;
    cpu.read24 = originalRead24;
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
  };
}

function runPhase(executor, state, spec) {
  spec.beforeRun?.();
  state.currentPhase = spec.label;

  const interrupts = [];
  const result = executor.runFrom(spec.entry, spec.mode ?? 'adl', {
    maxSteps: spec.maxSteps,
    maxLoopIterations: spec.maxLoopIterations,
    onBlock(pc, mode, meta, step) {
      const globalStep = state.stepBase + step + 1;
      const normalizedPc = pc & 0xFFFFFF;
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      const blockEntry = {
        step: globalStep,
        pc: normalizedPc,
        phase: spec.label,
        dasm,
      };

      state.currentStep = globalStep;
      state.currentPc = normalizedPc;
      pushRing(state.recentBlocks, blockEntry, RECENT_BLOCK_LIMIT);

      console.log(
        `[${globalStep.toString().padStart(6, '0')}] ${spec.label} ${hex(normalizedPc)} ${dasm}`,
      );
    },
    onInterrupt(type, returnPc, vector, stepCount) {
      const entry = {
        step: state.stepBase + stepCount,
        phase: spec.label,
        type,
        returnPc: returnPc & 0xFFFFFF,
        vector: vector & 0xFFFFFF,
      };

      interrupts.push(entry);
      state.interruptCount += 1;

      if (state.interruptSamples.length < INTERRUPT_SAMPLE_LIMIT) {
        state.interruptSamples.push(entry);
      }
    },
  });

  const summary = {
    label: spec.label,
    entry: spec.entry,
    mode: spec.mode ?? 'adl',
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced ?? 0,
    interrupts,
  };

  state.runSummaries.push(summary);
  state.stepBase += result.steps;
  return summary;
}

function topEntries(map, limit) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, limit);
}

function formatAddressList(entries) {
  if (entries.length === 0) {
    return 'none';
  }

  return entries
    .map(([addr, count]) => `${hex(addr)} x${count}`)
    .join(', ');
}

function formatPcList(entries) {
  if (entries.length === 0) {
    return 'none';
  }

  return entries
    .map(([pc, count]) => `${hex(pc)} x${count}`)
    .join(', ');
}

function buildReport(state) {
  const addressSummaries = [...state.byAddress.values()]
    .sort((left, right) => left.addr - right.addr);
  const pcSummaries = [...state.byPc.values()]
    .sort((left, right) => right.count - left.count || left.pc - right.pc)
    .slice(0, TOP_PC_LIMIT);
  const firstUpbaseWrite = state.upbaseWrites[0] ?? null;
  const allAccessPcs = [...state.byPc.keys()].sort((left, right) => left - right);

  const lines = [];

  lines.push('# Phase 202C - LCD Upbase Trace Report');
  lines.push('');
  lines.push('Generated by `probe-phase202c-upbase-trace.mjs`.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Item | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Cold boot | \`${state.coldBootSummary?.steps ?? 0} steps, ${state.coldBootSummary?.termination ?? 'n/a'}, lastPc=${hex(state.coldBootSummary?.lastPc)}\` |`);
  lines.push(`| OS/event phases | \`${state.runSummaries.length}\` |`);
  lines.push(`| Total LCD MMIO accesses | \`${state.accessCount}\` |`);
  lines.push(`| Reads | \`${state.readCount}\` |`);
  lines.push(`| Writes | \`${state.writeCount}\` |`);
  lines.push(`| Unique addresses | \`${state.byAddress.size}\` |`);
  lines.push(`| Unique PCs | \`${state.byPc.size}\` |`);
  lines.push(`| Upbase reads | \`${state.upbaseReads.length}\` |`);
  lines.push(`| Upbase writes | \`${state.upbaseWrites.length}\` |`);
  lines.push(`| Initial upbase | \`${hex(state.initialUpbase)}\` |`);
  lines.push(`| Pre-event upbase | \`${hex(state.preEventUpbase)}\` |`);
  lines.push(`| Final upbase | \`${hex(state.finalUpbase)}\` |`);
  lines.push(`| Pre-event callback | \`${hex(state.preEventState?.callback)}\` |`);
  lines.push(`| Post-event callback seed | \`${hex(state.postEventState?.callback)}\` |`);
  lines.push(`| Pre-event sysFlag | \`${hex(state.preEventState?.sysFlag, 2)}\` |`);
  lines.push(`| Post-event sysFlag | \`${hex(state.postEventState?.sysFlag, 2)}\` |`);
  lines.push(`| Deep-init flag (0xD177BA) before event loop | \`${hex(state.preEventState?.deepInitFlag, 2)}\` |`);
  lines.push(`| Interrupts seen during traced phases | \`${state.interruptCount}\` |`);
  lines.push('');
  lines.push('## Phase Results');
  lines.push('');
  lines.push('| Phase | Entry | Steps | Termination | Last PC | Loops Forced | Interrupts |');
  lines.push('| --- | --- | ---: | --- | --- | ---: | ---: |');

  for (const summary of state.runSummaries) {
    lines.push(
      `| ${summary.label} | \`${hex(summary.entry)}\` | ${summary.steps} | \`${summary.termination}\` | \`${hex(summary.lastPc)}\` | ${summary.loopsForced} | ${summary.interrupts.length} |`,
    );
  }

  lines.push('');
  lines.push('## Address Summary');
  lines.push('');
  lines.push('| Address | Count | Reads | Writes | Widths | Top PCs |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');

  if (addressSummaries.length === 0) {
    lines.push('| `(none)` | 0 | 0 | 0 | - | - |');
  } else {
    for (const summary of addressSummaries) {
      lines.push(
        `| \`${hex(summary.addr)}\` | ${summary.count} | ${summary.reads} | ${summary.writes} | ${[...summary.widths].sort((left, right) => left - right).join(', ')} | ${formatPcList(topEntries(summary.pcs, 5))} |`,
      );
    }
  }

  lines.push('');
  lines.push('## PC Summary');
  lines.push('');
  lines.push('| PC | Count | Reads | Writes | Addresses |');
  lines.push('| --- | ---: | ---: | ---: | --- |');

  if (pcSummaries.length === 0) {
    lines.push('| `(none)` | 0 | 0 | 0 | - |');
  } else {
    for (const summary of pcSummaries) {
      lines.push(
        `| \`${hex(summary.pc)}\` | ${summary.count} | ${summary.reads} | ${summary.writes} | ${formatAddressList(topEntries(summary.addresses, 8))} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Upbase Findings');
  lines.push('');

  if (state.upbaseWrites.length === 0) {
    lines.push(`No writes to \`${hex(UPBASE_START)}-${hex(UPBASE_END)}\` were observed.`);
    lines.push('');
    lines.push(`PCs that accessed any LCD MMIO in this run: ${allAccessPcs.length === 0 ? 'none' : allAccessPcs.map((pc) => `\`${hex(pc)}\``).join(', ')}.`);
  } else {
    lines.push(`Observed \`${state.upbaseWrites.length}\` write(s) to \`${hex(UPBASE_START)}-${hex(UPBASE_END)}\`.`);
    lines.push('');
    lines.push('| # | Step | Phase | PC | Address | Width | Value | Upbase Before | Upbase After |');
    lines.push('| ---: | ---: | --- | --- | --- | ---: | --- | --- | --- |');

    state.upbaseWrites.forEach((event, index) => {
      lines.push(
        `| ${index + 1} | ${event.step} | ${event.phase} | \`${hex(event.pc)}\` | \`${hex(event.addr)}\` | ${event.width} | \`${formatWidthValue(event.width, event.value)}\` | \`${hex(event.beforeUpbase)}\` | \`${hex(event.afterUpbase)}\` |`,
      );
    });

    if (firstUpbaseWrite?.traceTail) {
      lines.push('');
      lines.push('### Call Chain Before First Upbase Write');
      lines.push('');
      lines.push('```text');
      for (const entry of firstUpbaseWrite.traceTail) {
        lines.push(
          `step=${entry.step} phase=${entry.phase} pc=${hex(entry.pc)} ${entry.dasm}`,
        );
      }
      lines.push('```');
    }
  }

  lines.push('');
  lines.push('## Read Accesses To Upbase');
  lines.push('');

  if (state.upbaseReads.length === 0) {
    lines.push('- none');
  } else {
    for (const event of state.upbaseReads) {
      lines.push(
        `- step=${event.step} phase=${event.phase} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${event.width} value=${formatWidthValue(event.width, event.value)}`,
      );
    }
  }

  lines.push('');
  lines.push('## Access Samples');
  lines.push('');

  if (state.accessSamples.length === 0) {
    lines.push('- none');
  } else {
    for (const event of state.accessSamples) {
      lines.push(
        `- ${event.kind} step=${event.step} phase=${event.phase} pc=${hex(event.pc)} addr=${hex(event.addr)} width=${event.width} value=${formatWidthValue(event.width, event.value)} upbase=${event.isUpbase ? 'yes' : 'no'}`,
      );
    }
  }

  if (state.interruptSamples.length > 0) {
    lines.push('');
    lines.push('## Interrupt Samples');
    lines.push('');
    for (const event of state.interruptSamples) {
      lines.push(
        `- step=${event.step} phase=${event.phase} type=${event.type} returnPc=${hex(event.returnPc)} vector=${hex(event.vector)}`,
      );
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  return [
    '# Phase 202C - LCD Upbase Trace Report',
    '',
    'Generated by `probe-phase202c-upbase-trace.mjs`.',
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
  const blocks = romModule.PRELIFTED_BLOCKS;
  const state = createState();

  const stageEnv = createEnvironment(romBytes, blocks, { timerInterrupt: false });
  const { memory: stageMemory, executor: stageExecutor, cpu: stageCpu } = stageEnv;

  state.initialUpbase = stageExecutor.lcdMmio?.upbase ?? null;

  const coldBootResult = stageExecutor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  state.coldBootSummary = coldBootResult;

  const restoreStageHooks = installAccessHooks(stageExecutor, state);

  try {
    stageCpu.halted = false;
    stageCpu.iff1 = 0;
    stageCpu.iff2 = 0;
    resetStack(stageCpu, stageMemory, 3);

    runPhase(stageExecutor, state, {
      label: 'os_init',
      entry: OS_INIT_ENTRY,
      mode: 'adl',
      maxSteps: OS_INIT_MAX_STEPS,
      maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    });

    stageCpu.mbase = MBASE;
    stageCpu._iy = IY_BASE;
    stageCpu._ix = IX_STAGE;
    stageCpu._hl = 0;
    stageCpu.halted = false;
    stageCpu.iff1 = 0;
    stageCpu.iff2 = 0;
    resetStack(stageCpu, stageMemory, 3);

    runPhase(stageExecutor, state, {
      label: 'post_init',
      entry: POST_INIT_ENTRY,
      mode: 'adl',
      maxSteps: POST_INIT_MAX_STEPS,
      maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
    });

    const postInitCpuSnapshot = snapshotCpu(stageCpu);

    for (const stage of STAGES) {
      restoreCpu(stageCpu, postInitCpuSnapshot, stageMemory);
      runPhase(stageExecutor, state, {
        label: stage.label,
        entry: stage.entry,
        mode: 'adl',
        maxSteps: stage.maxSteps,
        maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
        beforeRun() {
          stage.beforeRun?.(stageMemory);
        },
      });
    }

    restoreStageHooks();

    const stageRamSnapshot = new Uint8Array(
      stageMemory.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END),
    );
    const stageLcdSnapshot = snapshotLcdMmio(stageExecutor);
    const stageKeyboardSnapshot = snapshotKeyboardMmio(stageCpu);
    const intcEnableMask = [
      stageEnv.peripherals.read(0x5004),
      stageEnv.peripherals.read(0x5005),
      stageEnv.peripherals.read(0x5006),
    ];
    const timerWrites = stageEnv.peripherals.getState().timers.writes;

    state.preEventUpbase = stageLcdSnapshot?.upbase ?? null;

    const eventEnv = createEnvironment(romBytes, blocks, { timerInterrupt: true });
    const {
      memory: eventMemory,
      executor: eventExecutor,
      cpu: eventCpu,
      peripherals: eventPeripherals,
    } = eventEnv;

    eventMemory.set(stageRamSnapshot, RAM_SNAPSHOT_START);
    restoreCpu(eventCpu, postInitCpuSnapshot, eventMemory);
    restoreLcdMmio(eventExecutor, stageLcdSnapshot);
    restoreKeyboardMmio(eventCpu, stageKeyboardSnapshot);

    eventPeripherals.write(0x5004, intcEnableMask[0]);
    eventPeripherals.write(0x5005, intcEnableMask[1]);
    eventPeripherals.write(0x5006, intcEnableMask[2]);

    for (const [port, value] of Object.entries(timerWrites)) {
      eventPeripherals.write(Number(port), value);
    }

    state.preEventState = {
      callback: read24(eventMemory, CALLBACK_PTR),
      sysFlag: eventMemory[SYS_FLAG_ADDR],
      deepInitFlag: eventMemory[DEEP_INIT_FLAG_ADDR],
      upbase: eventExecutor.lcdMmio?.upbase ?? null,
    };

    write24(eventMemory, CALLBACK_PTR, EVENT_LOOP_ENTRY);
    eventMemory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;

    state.postEventState = {
      callback: read24(eventMemory, CALLBACK_PTR),
      sysFlag: eventMemory[SYS_FLAG_ADDR],
      deepInitFlag: eventMemory[DEEP_INIT_FLAG_ADDR],
      upbase: eventExecutor.lcdMmio?.upbase ?? null,
    };

    eventCpu.mbase = MBASE;
    eventCpu._iy = IY_BASE;
    eventCpu._ix = IX_STAGE;
    eventCpu.im = 1;
    eventCpu.iff1 = 1;
    eventCpu.iff2 = 1;
    eventCpu.halted = false;
    resetStack(eventCpu, eventMemory, 3);

    const restoreEventHooks = installAccessHooks(eventExecutor, state);

    try {
      runPhase(eventExecutor, state, {
        label: 'event_loop',
        entry: EVENT_LOOP_ENTRY,
        mode: 'adl',
        maxSteps: EVENT_LOOP_MAX_STEPS,
        maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
      });
    } finally {
      restoreEventHooks();
    }

    state.finalUpbase = eventExecutor.lcdMmio?.upbase ?? null;

    const report = buildReport(state);
    fs.writeFileSync(REPORT_PATH, report, 'utf8');
    console.log(`report=${REPORT_PATH}`);
  } catch (error) {
    try {
      restoreStageHooks();
    } catch {}

    fs.writeFileSync(REPORT_PATH, buildFailureReport(error), 'utf8');
    throw error;
  }
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
