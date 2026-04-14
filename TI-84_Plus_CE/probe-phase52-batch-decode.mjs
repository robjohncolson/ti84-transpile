#!/usr/bin/env node
// Phase 52.1: batch-decode the remaining Phase 50/51 mystery screens with the
// explicit-init template and stride-1 ASCII slices.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xD00080;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;
const PROBE_MAX_STEPS = 200000;
const PROBE_MAX_LOOPS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const PROBE_TIMEOUT_MESSAGE = 'phase52_probe_timeout';

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const ASCII_ROW_START = 36;
const ASCII_ROW_END = 115;
const ASCII_COL_START = 0;
const ASCII_COL_END = 200;

const ANCHOR_SCAN_BYTES = 0x100;
const ANCHOR_MIN_LEN = 5;

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

const TARGETS = [
  {
    addr: 0x05CF6D,
    interpretation: 'Solid inverse-video header bar; likely the top banner of the MEMORY MANAGEMENT screen.',
    confidence: 'low',
  },
  {
    addr: 0x06B6F7,
    interpretation: 'Two inverse-video text blocks; the right-side block likely reads GROUP, but the larger left block is still unresolved.',
    confidence: 'low',
  },
  {
    addr: 0x0B79AF,
    interpretation: 'Multi-row title/about screen; likely a TRANSFORMATION GRAPHING APP title with a smaller version/build line below.',
    confidence: 'low',
  },
  {
    addr: 0x062160,
    interpretation: 'OVERFLOW error banner; this matches the nearby OVERFLOW / Calculation exceeds the range string table.',
    confidence: 'high',
  },
  {
    addr: 0x09D520,
    interpretation: 'Small two-line label in the left corner; text is present but not confidently readable from this probe.',
    confidence: 'low',
  },
  {
    addr: 0x06AFA0,
    interpretation: 'SELECT BACKGROUND PICTURE chooser screen, with a title block and a thumbnail grid below.',
    confidence: 'high',
  },
  {
    addr: 0x06B020,
    interpretation: 'Header-only slice of the same background-picture chooser family; likely the SELECT BACKGROUND PICTURE title strip.',
    confidence: 'medium',
  },
  {
    addr: 0x0B7240,
    interpretation: 'PRESS ANY KEY screen background / inverse-video fill; the nearby PRESS ANY KEY anchor matches this screen family.',
    confidence: 'medium',
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; this script will not re-transpile the ROM.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xFF;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function snapshotCpu(cpu) {
  const snapshot = {};

  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }

  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreBaseState(env) {
  const { mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot } = env;

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (!lcdMmio || !lcdSnapshot) {
    return;
  }

  lcdMmio.upbase = lcdSnapshot.upbase;
  lcdMmio.control = lcdSnapshot.control;
}

function callExplicitOsInit(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOPS,
  });
}

function callSetTextFgColor(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.hl = TEXT_FG_COLOR;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let other = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn += 1;
      if (pixel === TEXT_FG_COLOR) fg += 1;
      else if (pixel === TEXT_BG_COLOR) bg += 1;
      else other += 1;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawn,
    fg,
    bg,
    other,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function asciiSlice(mem, rowStart, rowEnd, colStart, colEnd) {
  const lines = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '?';
    }

    line += '|';
    lines.push(line);
  }

  return lines.join('\n');
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function isPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7E;
}

function cleanAnchorText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function scanPrintableStringsBefore(rom, entryAddr, bytes = ANCHOR_SCAN_BYTES, minLen = ANCHOR_MIN_LEN) {
  const start = Math.max(0, entryAddr - bytes);
  const hits = [];
  let runStart = -1;

  for (let addr = start; addr <= entryAddr; addr += 1) {
    const byte = addr < entryAddr ? rom[addr] : 0x00;

    if (addr < entryAddr && isPrintable(byte)) {
      if (runStart === -1) {
        runStart = addr;
      }
      continue;
    }

    if (runStart === -1) {
      continue;
    }

    const len = addr - runStart;
    if (len >= minLen) {
      const rawText = Buffer.from(rom.subarray(runStart, addr)).toString('ascii');
      const text = cleanAnchorText(rawText);

      if (text.length > 0) {
        hits.push({ addr: runStart, len, text });
      }
    }

    runStart = -1;
  }

  hits.sort((a, b) => b.addr - a.addr);
  return hits;
}

function trimAnchorText(text, maxLen = 40) {
  if (text.length <= maxLen) {
    return text;
  }

  return `${text.slice(0, maxLen - 3)}...`;
}

function formatAnchors(anchors, limit = anchors.length, maxLen = 40) {
  if (!anchors || anchors.length === 0) {
    return 'none';
  }

  return anchors
    .slice(0, limit)
    .map((anchor) => `${hex(anchor.addr)}:"${trimAnchorText(anchor.text, maxLen)}"`)
    .join(' | ');
}

function runProbe(executor, address) {
  const startedAt = Date.now();
  const raw = executor.runFrom(address, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
    maxLoopIterations: PROBE_MAX_LOOPS,
    onBlock() {
      if (Date.now() - startedAt > PROBE_TIMEOUT_MS) {
        throw new Error(PROBE_TIMEOUT_MESSAGE);
      }
    },
  });

  const timedOut =
    raw.termination === 'error' &&
    raw.error instanceof Error &&
    raw.error.message === PROBE_TIMEOUT_MESSAGE;

  return {
    ...raw,
    ms: Date.now() - startedAt,
    timedOut,
    termination: timedOut ? 'timeout' : raw.termination,
  };
}

function buildOutput(target, result, stats, anchors, ascii) {
  return [
    `entry=${hex(target.addr)}`,
    `steps=${result.steps} ms=${result.ms} term=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`,
    `drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} other=${stats.other} bbox=${formatBbox(stats.bbox)}`,
    `anchors=${formatAnchors(anchors)}`,
    `rows ${ASCII_ROW_START}-${ASCII_ROW_END} cols ${ASCII_COL_START}-${ASCII_COL_END} stride 1`,
    'legend: " " = sentinel, "." = bg, "#" = fg',
    '',
    ascii,
    '',
  ].join('\n');
}

function summarizeStage(result, stats) {
  return [
    `steps=${result.steps}`,
    `ms=${result.ms}`,
    `term=${result.termination}`,
    `lastPc=${hex(result.lastPc ?? 0)}`,
    `fg=${stats.fg}`,
    `bg=${stats.bg}`,
    `bbox=${formatBbox(stats.bbox)}`,
  ].join(' ');
}

async function main() {
  const romBytes = fs.readFileSync(romPath);
  const blocks = await loadBlocks();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const clearedVram = buildClearedVramSnapshot();

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  const osInit = callExplicitOsInit(executor, cpu, mem);
  const setTextFg = callSetTextFgColor(executor, cpu, mem);

  const env = {
    mem,
    cpu,
    executor,
    clearedVram,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
    lcdMmio: executor.lcdMmio,
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };

  console.log(
    `setup boot=${boot.termination}@${hex(boot.lastPc ?? 0)} ` +
    `osInit=${osInit.termination}@${hex(osInit.lastPc ?? 0)} ` +
    `setText=${setTextFg.termination}@${hex(setTextFg.lastPc ?? 0)}`,
  );

  const summary = [];

  for (const target of TARGETS) {
    restoreBaseState(env);
    prepareProbe(cpu, mem);

    const result = runProbe(executor, target.addr);
    const stats = collectVramStats(mem);
    const anchors = scanPrintableStringsBefore(romBytes, target.addr);
    const ascii = asciiSlice(mem, ASCII_ROW_START, ASCII_ROW_END, ASCII_COL_START, ASCII_COL_END);
    const output = buildOutput(target, result, stats, anchors, ascii);
    const outPath = path.join(__dirname, `phase52-decode-${target.addr.toString(16).padStart(6, '0')}.txt`);

    fs.writeFileSync(outPath, output);

    console.log(`\n=== ${hex(target.addr)} ===`);
    console.log(output);
    console.log(`interpretation=${target.interpretation}`);
    console.log(`confidence=${target.confidence}`);

    summary.push({
      ...target,
      result,
      stats,
      anchors,
    });
  }

  console.log('\n=== Final Summary ===');
  console.log('Address | Best stage stats | Interpretation | Anchor strings | Confidence');

  for (const row of summary) {
    console.log(
      [
        hex(row.addr),
        summarizeStage(row.result, row.stats),
        row.interpretation,
        formatAnchors(row.anchors, 6, 28),
        row.confidence,
      ].join(' | '),
    );
  }
}

await main();
