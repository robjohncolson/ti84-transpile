#!/usr/bin/env node
// Phase 97a: 500k boot snapshot for real color data on the home-screen composite.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SENTINEL = 0xAAAA;
const RAM_SNAP_START = 0x400000;
const RAM_SNAP_END = 0xE00000;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;
const MODE_SEED_TEXT = 'Normal Float Radian       ';
const STATUS_ICON_FG_ADDR = 0xD02ACC;
const STATUS_ICON_NEXT_ADDR = 0xD02ACD;
const STATUS_COLOR_RANGE_START = 0xD02AD0;
const STATUS_COLOR_RANGE_LEN = 9;
const REPORT_PATH = path.join(__dirname, 'phase97a-500k-report.md');
const BOOT_TARGET_STEPS = 500000;
const CPU_FIELDS = [
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
const MODE_STATE_ADDRS = [0xD00085, 0xD0008A, 0xD0008E, 0xD00092];
const BANDS = [
  {
    key: 'statusBar',
    label: 'Status bar',
    rows: 'r0-16',
    rowStart: 0,
    rowEnd: 16,
    baseline: 'drawn=5440 fg=0 bg=5440',
  },
  {
    key: 'modeRow',
    label: 'Mode row',
    rows: 'r17-34',
    rowStart: 17,
    rowEnd: 34,
    baseline: 'seeded baseline ~=5652 drawn, content present',
  },
  {
    key: 'historyArea',
    label: 'History area',
    rows: 'r37-74',
    rowStart: 37,
    rowEnd: 74,
    baseline: 'drawn~=8160 fg=0 bg~=8160',
  },
  {
    key: 'entryLine',
    label: 'Entry line',
    rows: 'r220-239',
    rowStart: 220,
    rowEnd: 239,
    baseline: 'drawn=6400 fg=0 bg=6400',
  },
];

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function readRange(start, length) {
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

function rangeSummary(rows) {
  if (rows.length === 0) {
    return 'none';
  }

  const parts = [];
  let start = rows[0];
  let prev = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row === prev + 1) {
      prev = row;
      continue;
    }

    parts.push(start === prev ? `r${start}` : `r${start}-r${prev}`);
    start = row;
    prev = row;
  }

  parts.push(start === prev ? `r${start}` : `r${start}-r${prev}`);
  return parts.join(', ');
}

function clearVram() {
  for (let offset = 0; offset < VRAM_WIDTH * VRAM_HEIGHT * 2; offset += 2) {
    mem[VRAM_BASE + offset] = 0xAA;
    mem[VRAM_BASE + offset + 1] = 0xAA;
  }
}

let cpuSnap = null;
let ramSnap = null;

function resetCpu() {
  for (const [field, value] of Object.entries(cpuSnap)) {
    cpu[field] = value;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStage(addr, label, maxSteps, maxLoopIterations) {
  console.log(`\n=== ${label} (${hex(addr, 6)}) ===`);
  const result = executor.runFrom(addr, 'adl', { maxSteps, maxLoopIterations });
  const lastPcText = result.lastPc === undefined ? 'n/a' : hex(result.lastPc, 6);
  console.log(`  steps=${result.steps} term=${result.termination} lastPc=${lastPcText}`);
  return result;
}

function writeModeSeed() {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_SEED_TEXT.charCodeAt(i);
  }
}

function fillEntryLineWhite() {
  for (let row = 220; row < 240; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function asciiRow(row) {
  let out = `r${String(row).padStart(3, '0')}: `;
  for (let col = 0; col < VRAM_WIDTH; col++) {
    const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
    const px = mem[offset] | (mem[offset + 1] << 8);
    out += px === VRAM_SENTINEL ? '.' : px === 0xFFFF ? ' ' : px === 0x0000 ? '#' : '+';
  }
  return out;
}

function countBand(rowStart, rowEnd) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  const rowsWithContent = [];
  const rowsWithFg = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    let rowDrawn = 0;
    let rowFg = 0;

    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const px = mem[offset] | (mem[offset + 1] << 8);
      if (px === VRAM_SENTINEL) {
        continue;
      }

      drawn++;
      rowDrawn++;

      if (px === 0xFFFF) {
        bg++;
        continue;
      }

      fg++;
      rowFg++;
    }

    if (rowDrawn > 0) {
      rowsWithContent.push(row);
    }
    if (rowFg > 0) {
      rowsWithFg.push(row);
    }
  }

  return {
    rowStart,
    rowEnd,
    drawn,
    fg,
    bg,
    rowsWithContent,
    rowsWithFg,
  };
}

function countComposite() {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let rMin = VRAM_HEIGHT;
  let rMax = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const px = mem[offset] | (mem[offset + 1] << 8);
      if (px === VRAM_SENTINEL) {
        continue;
      }

      drawn++;
      if (px === 0xFFFF) {
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

function makeConclusion(statusBand, statusIconFg) {
  const statusRows = rangeSummary(statusBand.rowsWithFg);
  if (statusBand.fg > 0) {
    return [
      `500k boot produced visible non-white status-bar pixels in ${statusRows}.`,
      `0xD02ACC changed from the 100k baseline 0xFF to ${hex(statusIconFg, 2)}, so the longer boot appears to populate usable icon color data.`,
    ];
  }

  if (statusIconFg !== 0xFF) {
    return [
      `0xD02ACC changed from 0xFF to ${hex(statusIconFg, 2)}, but rows r0-16 still rendered white-only in this composite.`,
      'The remaining blocker is likely the missing status-icon draw path rather than raw color-byte initialization.',
    ];
  }

  return [
    '0xD02ACC remained 0xFF and rows r0-16 stayed white-only after the 500k boot snapshot.',
    'The blocking subsystem still looks like the status-icon color/state population path.',
  ];
}

console.log('=== Phase 97a: 500k boot snapshot ===');
console.log('Stage 1: cold boot from 0x000000 (z80)');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('\nStage 2: OS init from 0x08C331 (adl, 500000 steps target)');
let progressSteps = 0;
let nextProgress = 100000;
const osInitResult = executor.runFrom(0x08C331, 'adl', {
  maxSteps: BOOT_TARGET_STEPS,
  maxLoopIterations: 10000,
  onBlock: () => {
    progressSteps++;
    if (progressSteps < nextProgress) {
      return;
    }

    console.log(`  progress ${progressSteps}/${BOOT_TARGET_STEPS}`);
    nextProgress += 100000;
  },
});
console.log(
  `  final steps=${osInitResult.steps} term=${osInitResult.termination} lastPc=${
    osInitResult.lastPc === undefined ? 'n/a' : hex(osInitResult.lastPc, 6)
  }`,
);

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('\nStage 3: post-init color setup from 0x0802b2');
const colorSetupResult = executor.runFrom(0x0802b2, 'adl', {
  maxSteps: 100,
  maxLoopIterations: 32,
});
console.log(
  `  final steps=${colorSetupResult.steps} term=${colorSetupResult.termination} lastPc=${
    colorSetupResult.lastPc === undefined ? 'n/a' : hex(colorSetupResult.lastPc, 6)
  }`,
);

console.log('\n=== Snapshot bytes after 500k boot ===');
const statusIconFg = mem[STATUS_ICON_FG_ADDR];
const statusIconNext = mem[STATUS_ICON_NEXT_ADDR];
const statusColorRange = readRange(STATUS_COLOR_RANGE_START, STATUS_COLOR_RANGE_LEN);
const modeBufferBytes = readRange(MODE_BUF_START, MODE_BUF_LEN);
const modeStateBytes = MODE_STATE_ADDRS.map((addr) => ({ addr, value: mem[addr] }));

console.log(`Status icon bytes: ${formatEntries(STATUS_ICON_FG_ADDR, [statusIconFg, statusIconNext])}`);
console.log(`Status color range: ${formatEntries(STATUS_COLOR_RANGE_START, statusColorRange)}`);
console.log(`Mode buffer bytes: ${formatEntries(MODE_BUF_START, modeBufferBytes)}`);
console.log(`Mode buffer text: ${formatModeBuffer(modeBufferBytes)}`);
console.log(
  `Mode state hot bytes: ${modeStateBytes
    .map(({ addr, value }) => `${hex(addr, 6)}=${hex(value, 2)}`)
    .join(' ')}`,
);

ramSnap = new Uint8Array(mem.slice(RAM_SNAP_START, RAM_SNAP_END));
cpuSnap = Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));

console.log('\n=== Rebuilding P91/96 composite from 500k snapshot ===');
mem.set(ramSnap, RAM_SNAP_START);
clearVram();
resetCpu();

const stageResults = {};
stageResults.statusBg = runStage(0x0a2b72, 'Stage 1: status bar bg', 30000, 500);

writeModeSeed();
console.log(`\n=== Stage 2: seeded mode buffer ===`);
console.log(`  "${MODE_SEED_TEXT}"`);

resetCpu();
stageResults.modeRow = runStage(0x0a29ec, 'Stage 3: home row strip', 50000, 500);

resetCpu();
stageResults.historyArea = runStage(0x0a2854, 'Stage 4: history area', 50000, 500);

console.log('\n=== Stage 5: direct white fill r220-239 ===');
fillEntryLineWhite();
console.log('  complete');

const totalStats = countComposite();
const bandStats = Object.fromEntries(
  BANDS.map((band) => [band.key, countBand(band.rowStart, band.rowEnd)]),
);
const asciiLines = [];
for (let row = 0; row <= 40; row++) {
  asciiLines.push(asciiRow(row));
}

console.log('\n=== Composite totals ===');
console.log(
  `drawn=${totalStats.drawn} fg=${totalStats.fg} bg=${totalStats.bg} rMin=${
    totalStats.rMin === null ? 'none' : `r${totalStats.rMin}`
  } rMax=${totalStats.rMax === null ? 'none' : `r${totalStats.rMax}`}`,
);

for (const band of BANDS) {
  const stats = bandStats[band.key];
  console.log(
    `  ${band.rows}: drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} rowsWithFg=${rangeSummary(
      stats.rowsWithFg,
    )}`,
  );
}

console.log('\n=== ASCII preview r0-r40 ===');
console.log(asciiLines.join('\n'));

const conclusion = makeConclusion(bandStats.statusBar, statusIconFg);
const lines = [];
lines.push('# Phase 97a — 500k Boot Snapshot for Real Color Data');
lines.push('');
lines.push('Generated by `probe-phase97a-500k-boot.mjs`.');
lines.push('');
lines.push('## Boot Snapshot');
lines.push('');
lines.push('- Boot pattern: cold boot -> `0x08C331` with 500000 steps -> `0x0802b2` post-init color setup.');
lines.push(
  `- 100k baseline reference: \`mem[0xD02ACC] = 0xFF\`, mode buffer = \`0xFF x 26\`, composite totals = \`drawn=25686 fg=11516 bg=14170\`.`,
);
lines.push(
  `- 500k init result: steps=${osInitResult.steps}, term=${osInitResult.termination}, lastPc=${
    osInitResult.lastPc === undefined ? 'n/a' : hex(osInitResult.lastPc, 6)
  }.`,
);
lines.push('');
lines.push('### Status Icon Color Bytes');
lines.push('');
lines.push('| address | 100k baseline | 500k boot snapshot |');
lines.push('|---|---|---|');
lines.push(`| \`0xD02ACC\` | \`0xFF\` | \`${hex(statusIconFg, 2)}\` |`);
lines.push(`| \`0xD02ACD\` | not logged | \`${hex(statusIconNext, 2)}\` |`);
lines.push(
  `| \`0xD02AD0..0xD02AD8\` | not logged | \`${formatBytes(statusColorRange)}\` |`,
);
lines.push('');
lines.push('### Mode Buffer Before Composite');
lines.push('');
lines.push(`- 100k baseline: \`0xFF x 26\`.`);
lines.push(`- 500k bytes: \`${formatBytes(modeBufferBytes)}\``);
lines.push(`- 500k text view: \`${formatModeBuffer(modeBufferBytes)}\``);
lines.push('');
lines.push('### Mode State Hot Bytes');
lines.push('');
lines.push('| address | value |');
lines.push('|---|---|');
for (const { addr, value } of modeStateBytes) {
  lines.push(`| \`${hex(addr, 6)}\` | \`${hex(value, 2)}\` |`);
}
lines.push('');
lines.push('## Composite Counts');
lines.push('');
lines.push('| band | rows | 100k baseline | 500k composite | rows with fg |');
lines.push('|---|---|---|---|---|');
for (const band of BANDS) {
  const stats = bandStats[band.key];
  lines.push(
    `| ${band.label} | \`${band.rows}\` | ${band.baseline} | \`drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg}\` | \`${rangeSummary(
      stats.rowsWithFg,
    )}\` |`,
  );
}
lines.push('');
lines.push(`- Full composite baseline (100k): \`drawn=25686 fg=11516 bg=14170\`.`);
lines.push(`- Full composite 500k: \`drawn=${totalStats.drawn} fg=${totalStats.fg} bg=${totalStats.bg}\`.`);
lines.push(
  `- Row span with non-sentinel content: \`rMin=${
    totalStats.rMin === null ? 'none' : totalStats.rMin
  }\`, \`rMax=${totalStats.rMax === null ? 'none' : totalStats.rMax}\`.`,
);
lines.push('');
lines.push('## ASCII Preview r0-r40');
lines.push('');
lines.push('```');
lines.push(asciiLines.join('\n'));
lines.push('```');
lines.push('');
lines.push('## Conclusion');
lines.push('');
for (const sentence of conclusion) {
  lines.push(`- ${sentence}`);
}
lines.push('');
lines.push('## Stage Notes');
lines.push('');
lines.push(`- \`0x0a2b72\`: steps=${stageResults.statusBg.steps}, term=${stageResults.statusBg.termination}`);
lines.push(`- \`0x0a29ec\`: steps=${stageResults.modeRow.steps}, term=${stageResults.modeRow.termination}`);
lines.push(
  `- \`0x0a2854\`: steps=${stageResults.historyArea.steps}, term=${stageResults.historyArea.termination}`,
);

fs.writeFileSync(REPORT_PATH, lines.join('\n'));
console.log(`\nReport written: ${REPORT_PATH}`);
