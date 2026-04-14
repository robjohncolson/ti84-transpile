#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const SCRIPT_NAME = fileURLToPath(import.meta.url).split(/[/\\]/).pop() ?? 'probe-phase115-menu-modes.mjs';
const REPORT_URL = new URL('./phase115-report.md', import.meta.url);

const RAM_SNAP_START = 0x400000;
const MENU_MODE_ADDR = 0xd007e0;
const LCD_VRAM_BASE = 0xd40000;
const LCD_VRAM_WIDTH = 320;
const LCD_VRAM_HEIGHT = 240;
const LCD_VRAM_BYTES = LCD_VRAM_WIDTH * LCD_VRAM_HEIGHT * 2;
const VRAM_SENTINEL_BYTE = 0xaa;

const MENU_ENTRIES = [
  { name: 'P111 Menu A', addr: 0x0b6a58 },
  { name: 'P111 Menu B', addr: 0x0b6b48 },
];

const MENU_MODES = [0, 1, 2, 3, 4, 5];

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
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function createRuntime(romBytes) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, peripherals, executor, cpu };
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const runtime = createRuntime(romBytes);
  const { mem, executor, cpu } = runtime;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    romBytes,
    mem,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
  };
}

function buildSnapshot() {
  const env = bootEnvironment();

  return {
    romBytes: env.romBytes,
    coldBoot: summarizeRun(env.coldBoot),
    osInit: summarizeRun(env.osInit),
    postInit: summarizeRun(env.postInit),
    cpu: snapshotCpu(env.cpu),
    ram: new Uint8Array(env.mem.slice(RAM_SNAP_START)),
  };
}

function cloneFromSnapshot(snapshot) {
  const runtime = createRuntime(snapshot.romBytes);
  runtime.mem.set(snapshot.ram, RAM_SNAP_START);
  restoreCpu(runtime.cpu, snapshot.cpu);

  if (typeof runtime.peripherals.acknowledgeIRQ === 'function') {
    runtime.peripherals.acknowledgeIRQ();
  }
  if (typeof runtime.peripherals.acknowledgeNMI === 'function') {
    runtime.peripherals.acknowledgeNMI();
  }

  return runtime;
}

function clearVram(mem) {
  mem.fill(VRAM_SENTINEL_BYTE, LCD_VRAM_BASE, LCD_VRAM_BASE + LCD_VRAM_BYTES);
}

function collectVramStats(mem) {
  let drawn = 0;
  let rMin = LCD_VRAM_HEIGHT;
  let rMax = -1;

  for (let row = 0; row < LCD_VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < LCD_VRAM_WIDTH; col += 1) {
      const offset = LCD_VRAM_BASE + (row * LCD_VRAM_WIDTH + col) * 2;
      if (mem[offset] !== VRAM_SENTINEL_BYTE || mem[offset + 1] !== VRAM_SENTINEL_BYTE) {
        drawn += 1;
        if (row < rMin) {
          rMin = row;
        }
        if (row > rMax) {
          rMax = row;
        }
      }
    }
  }

  return {
    drawn,
    rowStart: rMax >= 0 ? rMin : null,
    rowEnd: rMax >= 0 ? rMax : null,
  };
}

function runProbe(snapshot, entry, menuMode) {
  const runtime = cloneFromSnapshot(snapshot);
  const { mem, executor } = runtime;

  mem[MENU_MODE_ADDR] = menuMode;
  clearVram(mem);

  const run = executor.runFrom(entry.addr, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 10000,
  });
  const vram = collectVramStats(mem);

  return {
    entryAddr: entry.addr,
    entryName: entry.name,
    menuMode,
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    drawn: vram.drawn,
    rowStart: vram.rowStart,
    rowEnd: vram.rowEnd,
  };
}

function formatRows(result) {
  if (result.rowStart == null || result.rowEnd == null) {
    return 'none';
  }

  return `${result.rowStart}-${result.rowEnd}`;
}

function formatRunRow(label, run) {
  return `| ${label} | ${run.steps} | ${run.termination} | ${hex(run.lastPc)} |`;
}

function buildReport(snapshot, results) {
  const lines = [
    '# Phase 115 - Menu Renderer Menu-Mode Sweep',
    '',
    `Generated by \`${SCRIPT_NAME}\`. Each run restores the post-init RAM/CPU snapshot, sets \`${hex(MENU_MODE_ADDR)}\`, fills VRAM with \`0xAA\`, and executes the menu renderer with a 300000-step budget.`,
    '',
    '## Boot Environment',
    '| stage | steps | termination | last pc |',
    '|-------|------:|-------------|---------|',
    formatRunRow('coldBoot', snapshot.coldBoot),
    formatRunRow('osInit', snapshot.osInit),
    formatRunRow('postInit', snapshot.postInit),
    '',
    '## Results',
    '| entry | menuMode | drawn pixels | rows | steps | termination | last pc |',
    '|-------|---------:|-------------:|------|------:|-------------|---------|',
  ];

  for (const result of results) {
    lines.push(
      `| ${result.entryName} (${hex(result.entryAddr)}) | ${result.menuMode} (${hex(result.menuMode, 2)}) | ${result.drawn} | ${formatRows(result)} | ${result.steps} | ${result.termination} | ${hex(result.lastPc)} |`,
    );
  }

  lines.push('', '## Best Draw Per Entry');

  for (const entry of MENU_ENTRIES) {
    const entryResults = results
      .filter((result) => result.entryAddr === entry.addr)
      .sort((left, right) => {
        if (right.drawn !== left.drawn) {
          return right.drawn - left.drawn;
        }
        return left.menuMode - right.menuMode;
      });
    const best = entryResults[0];

    lines.push(
      `- ${entry.name} (${hex(entry.addr)}): best draw = ${best.drawn} pixels at menuMode ${best.menuMode} (${hex(best.menuMode, 2)}), rows ${formatRows(best)}, termination ${best.termination} at ${hex(best.lastPc)}.`,
    );
  }

  lines.push('', '## Notes');
  lines.push(`- Menu modes tested: ${MENU_MODES.map((value) => `${value} (${hex(value, 2)})`).join(', ')}.`);
  lines.push(`- VRAM window: ${hex(LCD_VRAM_BASE)} .. ${hex(LCD_VRAM_BASE + LCD_VRAM_BYTES - 1)} (${LCD_VRAM_WIDTH}x${LCD_VRAM_HEIGHT}x2 bytes).`);

  return `${lines.join('\n')}\n`;
}

function main() {
  const snapshot = buildSnapshot();
  const results = [];

  for (const entry of MENU_ENTRIES) {
    for (const menuMode of MENU_MODES) {
      results.push(runProbe(snapshot, entry, menuMode));
    }
  }

  const report = buildReport(snapshot, results);
  writeFileSync(REPORT_URL, report);
  process.stdout.write(`Wrote ${REPORT_URL.pathname}\n`);
}

main();
