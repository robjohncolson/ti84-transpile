#!/usr/bin/env node
// Phase 53.1: scan the requested error/CALC string regions for direct
// CALL 0x0a1cac sites, infer likely function entries, probe them with the
// explicit-init template, and dump the strongest legible text hits.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzPath = path.join(__dirname, 'ROM.transpiled.js.gz');

const TARGET_ADDR = 0x0A1CAC;
const TARGET_BYTES = [0xCD, 0xAC, 0x1C, 0x0A];

const REGIONS = [
  {
    label: 'error',
    start: 0x061000,
    end: 0x064000,
    description: '0x061000-0x063fff',
  },
  {
    label: 'calc',
    start: 0x054000,
    end: 0x058000,
    description: '0x054000-0x057fff',
  },
];

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
const PROBE_TIMEOUT_MESSAGE = 'phase53_probe_timeout';

const ENTRY_SCAN_BACK_BYTES = 0x100;
const ANCHOR_SCAN_BYTES = 0x100;
const ANCHOR_MIN_LEN = 5;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const ASCII_ROW_START = 36;
const ASCII_ROW_END = 200;
const ASCII_COL_START = 0;
const ASCII_COL_END = 200;

const TOP_HITS_LIMIT = 10;

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

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `[${bbox.minRow}-${bbox.maxRow},${bbox.minCol}-${bbox.maxCol}]`;
}

function rowSpan(bbox) {
  if (!bbox) {
    return 0;
  }

  return bbox.maxRow - bbox.minRow + 1;
}

function isPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7E;
}

function cleanAnchorText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function trimText(text, maxLen = 48) {
  if (text.length <= maxLen) {
    return text;
  }

  return `${text.slice(0, maxLen - 3)}...`;
}

async function loadBlocks() {
  if (fs.existsSync(transpiledPath)) {
    const mod = await import(pathToFileURL(transpiledPath).href);
    return mod.PRELIFTED_BLOCKS;
  }

  if (!fs.existsSync(transpiledGzPath)) {
    throw new Error(
      `Missing ${transpiledPath} and ${transpiledGzPath}; this script will not re-transpile the ROM.`,
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-phase53-'));
  const tempModulePath = path.join(tempDir, 'ROM.transpiled.mjs');

  try {
    const transpiledSource = gunzipSync(fs.readFileSync(transpiledGzPath));
    fs.writeFileSync(tempModulePath, transpiledSource);

    const mod = await import(`${pathToFileURL(tempModulePath).href}?t=${Date.now()}`);
    return mod.PRELIFTED_BLOCKS;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup failures. The probe should still run if import succeeded.
    }
  }
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
  cpu.hl = 0;
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

function readPixelFromVram(vram, row, col) {
  const offset = row * VRAM_WIDTH * 2 + col * 2;
  return vram[offset] | (vram[offset + 1] << 8);
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

function asciiSliceFromVram(vram, rowStart, rowEnd, colStart, colEnd) {
  const lines = [];

  for (let row = rowStart; row <= rowEnd; row += 1) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = colStart; col <= colEnd; col += 1) {
      const pixel = readPixelFromVram(vram, row, col);

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

function findFunctionEntry(rom, caller, scanBackBytes = ENTRY_SCAN_BACK_BYTES) {
  const floor = Math.max(0, caller - scanBackBytes);

  for (let addr = caller - 1; addr >= floor; addr -= 1) {
    if (rom[addr] === 0xC9) {
      return addr + 1;
    }
  }

  return caller;
}

function scanRegionCallers(rom, region) {
  const hits = [];

  for (let addr = region.start; addr <= region.end - TARGET_BYTES.length; addr += 1) {
    if (
      rom[addr] === TARGET_BYTES[0] &&
      rom[addr + 1] === TARGET_BYTES[1] &&
      rom[addr + 2] === TARGET_BYTES[2] &&
      rom[addr + 3] === TARGET_BYTES[3]
    ) {
      hits.push({
        region,
        caller: addr,
        entry: findFunctionEntry(rom, addr),
      });
    }
  }

  return hits;
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

function pickAnchorString(anchors) {
  if (!anchors || anchors.length === 0) {
    return null;
  }

  for (const anchor of anchors) {
    if (/[A-Za-z]/.test(anchor.text)) {
      return trimText(anchor.text);
    }
  }

  for (const anchor of anchors) {
    if (/[0-9]/.test(anchor.text)) {
      return trimText(anchor.text);
    }
  }

  return trimText(anchors[0].text);
}

function formatTerm(run) {
  return `${run.termination}@${hex(run.lastPc ?? 0)}`;
}

function isLegibleHit(stats) {
  return (
    stats.fg > 500 &&
    stats.fg + stats.bg > 2000 &&
    rowSpan(stats.bbox) >= 30
  );
}

function runProbe(executor, entry) {
  const startedAt = Date.now();
  const raw = executor.runFrom(entry, 'adl', {
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

function compareRows(a, b) {
  if (b.stats.drawn !== a.stats.drawn) {
    return b.stats.drawn - a.stats.drawn;
  }

  if (b.stats.fg !== a.stats.fg) {
    return b.stats.fg - a.stats.fg;
  }

  if (b.stats.bg !== a.stats.bg) {
    return b.stats.bg - a.stats.bg;
  }

  return a.entry - b.entry;
}

function buildVerdict(entryHit) {
  const regionLabels = [...entryHit.regionLabels];

  if (regionLabels.length > 1) {
    return `shared text renderer (${entryHit.callers.length} callers)`;
  }

  if (regionLabels[0] === 'error') {
    return `error-region text renderer (${entryHit.callers.length} callers)`;
  }

  if (regionLabels[0] === 'calc') {
    return `calc-region text renderer (${entryHit.callers.length} callers)`;
  }

  return `text renderer (${entryHit.callers.length} callers)`;
}

function buildProbeLine(row) {
  return [
    row.region.label.padEnd(5, ' '),
    `caller=${hex(row.caller)}`,
    `entry=${hex(row.entry)}`,
    `drawn=${String(row.stats.drawn).padStart(6, ' ')}`,
    `fg=${String(row.stats.fg).padStart(6, ' ')}`,
    `bg=${String(row.stats.bg).padStart(6, ' ')}`,
    `other=${String(row.stats.other).padStart(6, ' ')}`,
    `bbox=${formatBbox(row.stats.bbox).padEnd(20, ' ')}`,
    `term=${formatTerm(row.run).padEnd(24, ' ')}`,
    `anchor=${row.anchor ?? 'none'}`,
  ].join('  ');
}

function formatCallerList(callers) {
  return callers.map((caller) => hex(caller)).join(', ');
}

function formatAnchorList(anchors, limit = 8) {
  if (!anchors || anchors.length === 0) {
    return 'none';
  }

  return anchors
    .slice(0, limit)
    .map((anchor) => `${hex(anchor.addr)}:"${trimText(anchor.text, 36)}"`)
    .join(' | ');
}

function writeAsciiDump(entryHit) {
  const outPath = path.join(
    __dirname,
    `phase53-${entryHit.entry.toString(16).padStart(6, '0')}.txt`,
  );

  const ascii = asciiSliceFromVram(
    entryHit.vram,
    ASCII_ROW_START,
    ASCII_ROW_END,
    ASCII_COL_START,
    ASCII_COL_END,
  );

  const output = [
    `entry=${hex(entryHit.entry)}`,
    `callers=${formatCallerList(entryHit.callers)}`,
    `regions=${[...entryHit.regionLabels].join(',')}`,
    `steps=${entryHit.run.steps} ms=${entryHit.run.ms} term=${entryHit.run.termination} lastPc=${hex(entryHit.run.lastPc ?? 0)}`,
    `drawn=${entryHit.stats.drawn} fg=${entryHit.stats.fg} bg=${entryHit.stats.bg} other=${entryHit.stats.other} bbox=${formatBbox(entryHit.stats.bbox)} rowspan=${rowSpan(entryHit.stats.bbox)}`,
    `anchor=${entryHit.anchor ?? 'none'}`,
    `anchors=${formatAnchorList(entryHit.anchors)}`,
    `verdict=${buildVerdict(entryHit)}`,
    `rows ${ASCII_ROW_START}-${ASCII_ROW_END} cols ${ASCII_COL_START}-${ASCII_COL_END} stride 1`,
    'legend: " " = sentinel, "." = bg, "#" = fg, "?" = other',
    '',
    ascii,
    '',
  ].join('\n');

  fs.writeFileSync(outPath, output);
  return outPath;
}

async function main() {
  const romBytes = fs.readFileSync(romPath);
  const callersByRegion = REGIONS.flatMap((region) => scanRegionCallers(romBytes, region));
  const blocks = await loadBlocks();

  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const clearedVram = buildClearedVramSnapshot();

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  const osInit = callExplicitOsInit(executor, cpu, mem);
  const setText = callSetTextFgColor(executor, cpu, mem);

  const env = {
    mem,
    cpu,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram,
    lcdMmio: executor.lcdMmio,
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };

  console.log(`=== Phase 53.1: scan direct CALL ${hex(TARGET_ADDR)} sites in error/CALC windows ===`);
  console.log(
    `setup boot=${formatTerm(boot)} osInit=${formatTerm(osInit)} setText=${formatTerm(setText)}`,
  );
  console.log('Address = inferred entry (previous RET + 1, or caller if no RET found)');
  console.log('');

  if (callersByRegion.length === 0) {
    console.log('No callers found in the requested windows.');
    return;
  }

  const probeCache = new Map();
  const rows = [];

  for (const hit of callersByRegion) {
    let probe = probeCache.get(hit.entry);

    if (!probe) {
      restoreBaseState(env);
      prepareProbe(cpu, mem);

      const run = runProbe(executor, hit.entry);
      const stats = collectVramStats(mem);
      const anchors = scanPrintableStringsBefore(romBytes, hit.entry);
      const anchor = pickAnchorString(anchors);

      probe = {
        entry: hit.entry,
        run,
        stats,
        anchors,
        anchor,
        vram: mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE),
      };

      probeCache.set(hit.entry, probe);
    }

    const row = {
      ...hit,
      ...probe,
      isLegible: isLegibleHit(probe.stats),
    };

    rows.push(row);
    console.log(buildProbeLine(row));
  }

  const legibleRows = rows.filter((row) => row.isLegible);
  const entryMap = new Map();

  for (const row of legibleRows) {
    let entryHit = entryMap.get(row.entry);

    if (!entryHit) {
      entryHit = {
        entry: row.entry,
        stats: row.stats,
        run: row.run,
        anchors: row.anchors,
        anchor: row.anchor,
        vram: row.vram,
        callers: [],
        regionLabels: new Set(),
      };
      entryMap.set(row.entry, entryHit);
    }

    entryHit.callers.push(row.caller);
    entryHit.regionLabels.add(row.region.label);
  }

  const legibleEntries = [...entryMap.values()].sort(compareRows);
  const topHits = legibleEntries.slice(0, TOP_HITS_LIMIT);

  console.log('\n=== Final Summary ===');
  for (const region of REGIONS) {
    const count = rows.filter((row) => row.region.label === region.label).length;
    console.log(`${region.label}_callers=${count} region=${region.description}`);
  }
  console.log(`unique_entries_probed=${probeCache.size}`);
  console.log(`legible_text_hits=${legibleRows.length} unique_legible_entries=${legibleEntries.length}`);
  console.log(`top_ascii_dumps=${topHits.length}`);

  for (const entryHit of topHits) {
    writeAsciiDump(entryHit);
  }

  console.log('\nTop 10 legible hits');
  console.log('Address | Drawn | Fg | Bg | Bbox | Anchor string | Verdict');

  if (topHits.length === 0) {
    console.log('none');
    return;
  }

  for (const entryHit of topHits) {
    console.log(
      [
        hex(entryHit.entry),
        String(entryHit.stats.drawn),
        String(entryHit.stats.fg),
        String(entryHit.stats.bg),
        formatBbox(entryHit.stats.bbox),
        entryHit.anchor ?? 'none',
        buildVerdict(entryHit),
      ].join(' | '),
    );
  }
}

await main();
