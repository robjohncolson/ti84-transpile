#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const REPORT_PATH = path.join(__dirname, 'phase98c-alt-boot-report.md');

const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const ENTRY_MAX_STEPS = 500000;
const ENTRY_MAX_LOOP_ITERATIONS = 10000;
const BASELINE_STEPS = 691;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTES = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const STATUS_ICON_FG_ADDR = 0xD02ACC;
const STATUS_ICON_NEXT_ADDR = 0xD02ACD;
const STATUS_COLOR_START = 0xD02AD0;
const STATUS_COLOR_LEN = 9;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;
const MODE_SEED_TEXT = 'Normal Float Radian       ';
const MODE_STATE_ADDRS = [0xD00085, 0xD0008A, 0xD0008E, 0xD00092];

const COMPOSITE_STATUS_BG_ENTRY = 0x0A2B72;
const COMPOSITE_MODE_ROW_ENTRY = 0x0A29EC;
const COMPOSITE_HISTORY_ENTRY = 0x0A2854;

const BASELINE_100K_TOTALS = {
  drawn: 25686,
  fg: 11516,
  bg: 14170,
};

const BASELINE_500K_TOTALS = {
  drawn: 31138,
  fg: 16062,
  bg: 15076,
};

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

const EXPERIMENTS = [
  { id: 1, entryAddr: 0x08C331, timerInterrupt: false, maxSteps: ENTRY_MAX_STEPS },
  { id: 2, entryAddr: 0x08C331, timerInterrupt: true, maxSteps: ENTRY_MAX_STEPS },
  { id: 3, entryAddr: 0x08C366, timerInterrupt: false, maxSteps: ENTRY_MAX_STEPS },
  { id: 4, entryAddr: 0x08C366, timerInterrupt: true, maxSteps: ENTRY_MAX_STEPS },
  { id: 5, entryAddr: 0x08C33D, timerInterrupt: false, maxSteps: ENTRY_MAX_STEPS },
  { id: 6, entryAddr: 0x08C33D, timerInterrupt: true, maxSteps: ENTRY_MAX_STEPS },
];

function hex(value, width = 2) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function readRange(mem, start, length) {
  return Array.from(mem.slice(start, start + length));
}

function formatBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function formatEntries(start, bytes) {
  return bytes
    .map((value, index) => `${hex(start + index, 6)}=${hex(value, 2)}`)
    .join(' ');
}

function formatModeBuffer(bytes) {
  return bytes
    .map((value) => {
      if (value >= 0x20 && value < 0x7f) {
        return String.fromCharCode(value);
      }

      return `[${value.toString(16).padStart(2, '0')}]`;
    })
    .join('');
}

function copyCpuFields(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function createMachine(timerInterrupt) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function capturePrimarySnapshot(mem, entryResult) {
  const modeBuffer = readRange(mem, MODE_BUF_START, MODE_BUF_LEN);
  const statusBytes = [mem[STATUS_ICON_FG_ADDR], mem[STATUS_ICON_NEXT_ADDR]];
  const statusColorRange = readRange(mem, STATUS_COLOR_START, STATUS_COLOR_LEN);
  const modeStateBytes = MODE_STATE_ADDRS.map((addr) => ({
    addr,
    value: mem[addr],
  }));

  return {
    steps: entryResult.steps,
    termination: entryResult.termination,
    lastPc: entryResult.lastPc,
    statusBytes,
    statusColorRange,
    modeBuffer,
    modeStateBytes,
    statusIconFg: statusBytes[0],
    statusIconNext: statusBytes[1],
    modeBufferHasData: modeBuffer.some((value) => value !== 0xFF),
  };
}

function clearVram(mem) {
  for (let offset = 0; offset < VRAM_BYTES; offset += 2) {
    mem[VRAM_BASE + offset] = 0xAA;
    mem[VRAM_BASE + offset + 1] = 0xAA;
  }
}

function writeModeSeed(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    mem[MODE_BUF_START + index] = MODE_SEED_TEXT.charCodeAt(index);
  }
}

function fillEntryLineWhite(mem) {
  for (let row = 220; row < 240; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function countRow(mem, row) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;

  for (let col = 0; col < VRAM_WIDTH; col++) {
    const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
    const pixel = mem[offset] | (mem[offset + 1] << 8);

    if (pixel === VRAM_SENTINEL) {
      continue;
    }

    drawn++;

    if (pixel === 0xFFFF) {
      bg++;
      continue;
    }

    fg++;
  }

  return {
    row,
    drawn,
    fg,
    bg,
  };
}

function countRows(mem, startRow, endRow) {
  const rows = [];

  for (let row = startRow; row <= endRow; row++) {
    rows.push(countRow(mem, row));
  }

  return rows;
}

function countComposite(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let rMin = VRAM_HEIGHT;
  let rMax = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);

      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;

      if (pixel === 0xFFFF) {
        bg++;
      } else {
        fg++;
      }

      if (row < rMin) {
        rMin = row;
      }

      if (row > rMax) {
        rMax = row;
      }
    }
  }

  return {
    drawn,
    fg,
    bg,
    rMin: rMax < 0 ? null : rMin,
    rMax: rMax < 0 ? null : rMax,
  };
}

function runCompositeFromSnapshot(mem, executor, cpu) {
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = copyCpuFields(cpu);

  function resetCpu() {
    for (const [field, value] of Object.entries(cpuSnapshot)) {
      cpu[field] = value;
    }

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  }

  function runStage(addr, label, maxSteps, maxLoopIterations) {
    const result = executor.runFrom(addr, 'adl', { maxSteps, maxLoopIterations });

    return {
      label,
      addr,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
    };
  }

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);
  resetCpu();

  const stageResults = [];
  stageResults.push(runStage(COMPOSITE_STATUS_BG_ENTRY, 'status bar bg', 30000, 500));

  writeModeSeed(mem);

  resetCpu();
  stageResults.push(runStage(COMPOSITE_MODE_ROW_ENTRY, 'mode row', 50000, 500));

  resetCpu();
  stageResults.push(runStage(COMPOSITE_HISTORY_ENTRY, 'history area', 50000, 500));

  fillEntryLineWhite(mem);

  const totals = countComposite(mem);
  const statusRows = countRows(mem, 0, 16);
  const statusBar = statusRows.reduce(
    (accumulator, row) => ({
      drawn: accumulator.drawn + row.drawn,
      fg: accumulator.fg + row.fg,
      bg: accumulator.bg + row.bg,
    }),
    { drawn: 0, fg: 0, bg: 0 },
  );

  return {
    totals,
    statusBar,
    statusRows,
    stageResults,
  };
}

function getConclusion(primary) {
  const parts = [];

  if (primary.steps > BASELINE_STEPS) {
    parts.push('PROGRESS: steps > 691');
  }

  if (primary.statusIconFg !== 0xFF) {
    parts.push('PROGRESS: 0xD02ACC populated');
  }

  if (parts.length === 0) {
    return 'null result';
  }

  return parts.join('; ');
}

function logExperiment(result) {
  const primary = result.primary;
  console.log(
    `[#${result.id}] entry=${hex(result.entryAddr, 6)} timerInterrupt=${result.timerInterrupt} steps=${primary.steps} term=${primary.termination} lastPc=${hex(primary.lastPc, 6)}`,
  );
  console.log(`  modeState=${primary.modeStateBytes.map(({ addr, value }) => `${hex(addr, 6)}=${hex(value, 2)}`).join(' ')}`);
  console.log(`  status=${formatEntries(STATUS_ICON_FG_ADDR, primary.statusBytes)}`);
  console.log(`  statusColors=${formatEntries(STATUS_COLOR_START, primary.statusColorRange)}`);
  console.log(`  modeBuffer=${formatBytes(primary.modeBuffer)}`);
  console.log(`  conclusion=${result.conclusion}`);

  if (!result.composite) {
    console.log('  composite=skipped');
    return;
  }

  console.log(
    `  composite totals=drawn=${result.composite.totals.drawn} fg=${result.composite.totals.fg} bg=${result.composite.totals.bg} statusBarFg=${result.composite.statusBar.fg}`,
  );
}

function scoreExperiment(result) {
  return {
    steps: result.primary.steps,
    statusBarFg: result.composite ? result.composite.statusBar.fg : -1,
    totalFg: result.composite ? result.composite.totals.fg : -1,
  };
}

function pickBestExperiment(results) {
  return results.reduce((best, current) => {
    if (!best) {
      return current;
    }

    const bestScore = scoreExperiment(best);
    const currentScore = scoreExperiment(current);

    if (currentScore.steps !== bestScore.steps) {
      return currentScore.steps > bestScore.steps ? current : best;
    }

    if (currentScore.statusBarFg !== bestScore.statusBarFg) {
      return currentScore.statusBarFg > bestScore.statusBarFg ? current : best;
    }

    if (currentScore.totalFg !== bestScore.totalFg) {
      return currentScore.totalFg > bestScore.totalFg ? current : best;
    }

    return current.id < best.id ? current : best;
  }, null);
}

function buildReport(results) {
  const anyStepsProgress = results.some((result) => result.primary.steps > BASELINE_STEPS);
  const anyStatusColorProgress = results.some((result) => result.primary.statusIconFg !== 0xFF);
  const anyModeBufferProgress = results.some((result) => result.primary.modeBufferHasData);
  const best = pickBestExperiment(results);
  const bestScore = best ? scoreExperiment(best) : null;

  const lines = [];
  lines.push('# Phase 98C - Alternate Boot Entry Experiments');
  lines.push('');
  lines.push('Generated by `probe-phase98c-alt-boot-entries.mjs`.');
  lines.push('');
  lines.push('## Experiment Matrix');
  lines.push('');
  lines.push('| # | entry | timerInterrupt | maxSteps | steps | termination | lastPc | 0xD02ACC | 0xD02ACD | mode buffer non-0xFF | conclusion |');
  lines.push('|---|---|---|---:|---:|---|---|---|---|---|---|');

  for (const result of results) {
    lines.push(
      `| ${result.id} | \`${hex(result.entryAddr, 6)}\` | \`${result.timerInterrupt}\` | ${result.maxSteps} | ${result.primary.steps} | \`${result.primary.termination}\` | \`${hex(result.primary.lastPc, 6)}\` | \`${hex(result.primary.statusIconFg, 2)}\` | \`${hex(result.primary.statusIconNext, 2)}\` | \`${result.primary.modeBufferHasData ? 'yes' : 'no'}\` | ${result.conclusion} |`,
    );
  }

  lines.push('');

  for (const result of results) {
    lines.push(`## Experiment ${result.id}`);
    lines.push('');
    lines.push(`- Entry addr: \`${hex(result.entryAddr, 6)}\``);
    lines.push(`- timerInterrupt: \`${result.timerInterrupt}\``);
    lines.push(`- maxSteps: \`${result.maxSteps}\``);
    lines.push(`- steps: \`${result.primary.steps}\``);
    lines.push(`- termination: \`${result.primary.termination}\``);
    lines.push(`- lastPc: \`${hex(result.primary.lastPc, 6)}\``);
    lines.push(
      `- Mode state bytes: \`${result.primary.modeStateBytes
        .map(({ addr, value }) => `${hex(addr, 6)}=${hex(value, 2)}`)
        .join(' ')}\``,
    );
    lines.push(`- 0xD02ACC..D bytes: \`${formatEntries(STATUS_ICON_FG_ADDR, result.primary.statusBytes)}\``);
    lines.push(`- 0xD02AD0..0xD02AD8 bytes: \`${formatEntries(STATUS_COLOR_START, result.primary.statusColorRange)}\``);
    lines.push(`- Mode buffer (26 bytes, hex): \`${formatBytes(result.primary.modeBuffer)}\``);
    lines.push(`- Mode buffer (text view): \`${formatModeBuffer(result.primary.modeBuffer)}\``);
    lines.push(`- Conclusion: ${result.conclusion}`);
    lines.push('');

    if (!result.composite) {
      lines.push('- Composite check: skipped because the primary run matched the 691-step / `0xD02ACC == 0xFF` null baseline.');
      lines.push('');
      continue;
    }

    lines.push('### Composite Check');
    lines.push('');
    lines.push(
      `- Totals: \`drawn=${result.composite.totals.drawn} fg=${result.composite.totals.fg} bg=${result.composite.totals.bg}\`.`,
    );
    lines.push(
      `- Status bar band (r0-r16): \`drawn=${result.composite.statusBar.drawn} fg=${result.composite.statusBar.fg} bg=${result.composite.statusBar.bg}\`.`,
    );
    lines.push(
      `- 100k baseline reference: \`drawn=${BASELINE_100K_TOTALS.drawn} fg=${BASELINE_100K_TOTALS.fg} bg=${BASELINE_100K_TOTALS.bg}\`, with status-bar fg = \`0\`.`,
    );
    lines.push(
      `- P97A 500k reference: \`drawn=${BASELINE_500K_TOTALS.drawn} fg=${BASELINE_500K_TOTALS.fg} bg=${BASELINE_500K_TOTALS.bg}\`.`,
    );
    lines.push('');
    lines.push('| row | drawn | fg | bg |');
    lines.push('|---:|---:|---:|---:|');

    for (const row of result.composite.statusRows) {
      lines.push(`| ${row.row} | ${row.drawn} | ${row.fg} | ${row.bg} |`);
    }

    lines.push('');
    lines.push('| stage | entry | steps | termination | lastPc |');
    lines.push('|---|---|---:|---|---|');

    for (const stage of result.composite.stageResults) {
      lines.push(
        `| ${stage.label} | \`${hex(stage.addr, 6)}\` | ${stage.steps} | \`${stage.termination}\` | \`${hex(stage.lastPc, 6)}\` |`,
      );
    }

    lines.push('');
  }

  lines.push('## Final Verdict');
  lines.push('');
  lines.push(`- Any experiment produce > 691 steps? ${anyStepsProgress ? 'Y' : 'N'}`);
  lines.push(`- Any experiment populate 0xD02ACC? ${anyStatusColorProgress ? 'Y' : 'N'}`);
  lines.push(`- Any experiment populate the mode buffer with non-0xFF bytes? ${anyModeBufferProgress ? 'Y' : 'N'}`);

  if (!best || !bestScore) {
    lines.push('- Best experiment: none');
  } else {
    lines.push(
      `- Best experiment: #${best.id} at \`${hex(best.entryAddr, 6)}\` with \`timerInterrupt=${best.timerInterrupt}\`, \`steps=${bestScore.steps}\`, \`statusBarFg=${bestScore.statusBarFg < 0 ? 'n/a' : bestScore.statusBarFg}\`, \`compositeFg=${bestScore.totalFg < 0 ? 'n/a' : bestScore.totalFg}\`.`,
    );
  }

  lines.push('');
  lines.push('## Run Command');
  lines.push('');
  lines.push('```bash');
  lines.push(`cd ${__dirname}`);
  lines.push('node probe-phase98c-alt-boot-entries.mjs');
  lines.push('```');

  return `${lines.join('\n')}\n`;
}

function runExperiment(spec) {
  const machine = createMachine(spec.timerInterrupt);
  const { mem, executor, cpu } = machine;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const entryResult = executor.runFrom(spec.entryAddr, 'adl', {
    maxSteps: spec.maxSteps,
    maxLoopIterations: ENTRY_MAX_LOOP_ITERATIONS,
  });

  const primary = capturePrimarySnapshot(mem, entryResult);
  const progress = primary.steps > BASELINE_STEPS || primary.statusIconFg !== 0xFF;

  return {
    id: spec.id,
    entryAddr: spec.entryAddr,
    timerInterrupt: spec.timerInterrupt,
    maxSteps: spec.maxSteps,
    primary,
    conclusion: getConclusion(primary),
    composite: progress ? runCompositeFromSnapshot(mem, executor, cpu) : null,
  };
}

console.log('=== Phase 98C - Alternate Boot Entry Experiments ===');
const results = [];

for (const experiment of EXPERIMENTS) {
  const result = runExperiment(experiment);
  results.push(result);
  logExperiment(result);
}

const report = buildReport(results);
fs.writeFileSync(REPORT_PATH, report);
console.log(`Report written: ${REPORT_PATH}`);
