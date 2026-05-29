#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const PIXELS_PER_ROW = 320;
const LCD_ROWS = 240;
const BYTES_PER_ROW = PIXELS_PER_ROW * 2;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_REFRESH_MODE_ADDR = 0xD177B7;

const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
const FLASH_ROUTINE_RAM_DST = 0xD18C22;
const FLASH_ROUTINE_LEN = 90;

const KEY_ONE_SCAN = 0x12;
const EVENT_LOOP_STEPS = 500000;
const MAX_LOOP_ITERATIONS = 5000;
const ASCII_ART_MAX_WIDTH = 96;

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));
  return mem;
}

function runStage(executor, label, entry, mode, options) {
  const result = executor.runFrom(entry, mode, options);
  console.log(
    `  ${label.padEnd(10)} entry=${hex(entry)} mode=${mode} `
    + `steps=${count(result.steps)} term=${result.termination} `
    + `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? mode}`,
  );
  return result;
}

function bootToHomeScreen(executor, cpu, mem) {
  console.log('=== Boot Sequence ===');

  runStage(executor, 'boot', BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  runStage(executor, 'kernelInit', KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  runStage(executor, 'postInit', POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  for (const [index, entry] of STAGE_ENTRIES.entries()) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    fillSentinel(mem, cpu.sp, 12);

    runStage(executor, `stage${index + 1}`, entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
  }

  mem.copyWithin(FLASH_ROUTINE_RAM_DST, FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN);
  console.log(
    `  ramCopy    rom=${hex(FLASH_ROUTINE_ROM_SRC)} -> ram=${hex(FLASH_ROUTINE_RAM_DST)} `
    + `bytes=${count(FLASH_ROUTINE_LEN)}`,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);

  return { resumePc: EVENT_LOOP_ENTRY, resumeMode: 'adl' };
}

function seedEventLoopFlags(mem) {
  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_REFRESH_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
}

function injectKeyOne(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_GATE_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function snapshotVram(mem) {
  return mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(snapshot, row, col) {
  const offset = row * BYTES_PER_ROW + col * 2;
  return snapshot[offset] | (snapshot[offset + 1] << 8);
}

function recordTransition(map, beforeValue, afterValue, width) {
  const key = `${hex(beforeValue, width)} -> ${hex(afterValue, width)}`;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortTransitionEntries(map) {
  return [...map.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
}

function formatTransitions(map) {
  if (!map || map.size === 0) {
    return '--';
  }
  return sortTransitionEntries(map)
    .map(([transition, occurrences]) => `${transition} x${count(occurrences)}`)
    .join(', ');
}

function columnsToRuns(columns) {
  if (!columns || columns.length === 0) {
    return [];
  }

  const sorted = [...columns].sort((left, right) => left - right);
  const runs = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    runs.push([start, previous]);
    start = current;
    previous = current;
  }

  runs.push([start, previous]);
  return runs;
}

function formatRuns(runs) {
  if (!runs || runs.length === 0) {
    return '--';
  }

  return runs
    .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`))
    .join(', ');
}

function median(values) {
  if (!values || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function collectOnRows(afterSnapshot, bbox) {
  if (!bbox) {
    return [];
  }

  const rows = [];
  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
    const onColumns = [];
    for (let col = bbox.minCol; col <= bbox.maxCol; col += 1) {
      if (readPixel(afterSnapshot, row, col) !== 0x0000) {
        onColumns.push(col);
      }
    }
    rows.push({
      row,
      onColumns,
      onRuns: columnsToRuns(onColumns),
      onCount: onColumns.length,
    });
  }
  return rows;
}

function summarizeDiff(beforeSnapshot, afterSnapshot) {
  const rows = [];
  const globalByteTransitions = new Map();
  const globalPixelTransitions = new Map();

  let totalChangedBytes = 0;
  let totalChangedPixels = 0;
  let firstChangedByteIndex = null;
  let lastChangedByteIndex = null;
  let minRow = null;
  let maxRow = null;
  let minCol = null;
  let maxCol = null;

  for (let row = 0; row < LCD_ROWS; row += 1) {
    const rowSummary = {
      row,
      changedBytes: 0,
      changedPixels: 0,
      minByteOffset: null,
      maxByteOffset: null,
      minPixel: null,
      maxPixel: null,
      byteTransitions: new Map(),
      pixelTransitions: new Map(),
      changedPixelColumns: [],
    };

    const rowBase = row * BYTES_PER_ROW;

    for (let byteOffset = 0; byteOffset < BYTES_PER_ROW; byteOffset += 1) {
      const index = rowBase + byteOffset;
      const beforeByte = beforeSnapshot[index];
      const afterByte = afterSnapshot[index];
      if (beforeByte === afterByte) {
        continue;
      }

      rowSummary.changedBytes += 1;
      totalChangedBytes += 1;
      if (rowSummary.minByteOffset === null) {
        rowSummary.minByteOffset = byteOffset;
      }
      rowSummary.maxByteOffset = byteOffset;
      if (firstChangedByteIndex === null) {
        firstChangedByteIndex = index;
      }
      lastChangedByteIndex = index;

      recordTransition(rowSummary.byteTransitions, beforeByte, afterByte, 2);
      recordTransition(globalByteTransitions, beforeByte, afterByte, 2);
    }

    for (let col = 0; col < PIXELS_PER_ROW; col += 1) {
      const pixelOffset = rowBase + col * 2;
      const beforePixel = beforeSnapshot[pixelOffset] | (beforeSnapshot[pixelOffset + 1] << 8);
      const afterPixel = afterSnapshot[pixelOffset] | (afterSnapshot[pixelOffset + 1] << 8);
      if (beforePixel === afterPixel) {
        continue;
      }

      rowSummary.changedPixels += 1;
      totalChangedPixels += 1;
      rowSummary.changedPixelColumns.push(col);
      if (rowSummary.minPixel === null) {
        rowSummary.minPixel = col;
      }
      rowSummary.maxPixel = col;

      if (minRow === null || row < minRow) minRow = row;
      if (maxRow === null || row > maxRow) maxRow = row;
      if (minCol === null || col < minCol) minCol = col;
      if (maxCol === null || col > maxCol) maxCol = col;

      recordTransition(rowSummary.pixelTransitions, beforePixel, afterPixel, 4);
      recordTransition(globalPixelTransitions, beforePixel, afterPixel, 4);
    }

    rowSummary.changedRuns = columnsToRuns(rowSummary.changedPixelColumns);
    rows.push(rowSummary);
  }

  const bbox = minRow === null
    ? null
    : {
      minRow,
      maxRow,
      minCol,
      maxCol,
      width: (maxCol - minCol) + 1,
      height: (maxRow - minRow) + 1,
    };

  const onRows = collectOnRows(afterSnapshot, bbox);
  const totalOnPixels = onRows.reduce((sum, row) => sum + row.onCount, 0);

  return {
    totalChangedBytes,
    totalChangedPixels,
    firstChangedByteAddr: firstChangedByteIndex === null ? null : VRAM_BASE + firstChangedByteIndex,
    lastChangedByteAddr: lastChangedByteIndex === null ? null : VRAM_BASE + lastChangedByteIndex,
    globalByteTransitions,
    globalPixelTransitions,
    rows,
    changedRows: rows.filter((row) => row.changedBytes > 0),
    bbox,
    onRows,
    totalOnPixels,
  };
}

function renderAsciiArt(afterSnapshot, bbox) {
  if (!bbox) {
    return { compression: 1, lines: [] };
  }

  const compression = bbox.width > ASCII_ART_MAX_WIDTH
    ? Math.ceil(bbox.width / ASCII_ART_MAX_WIDTH)
    : 1;

  const lines = [];
  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
    let art = '';
    for (let startCol = bbox.minCol; startCol <= bbox.maxCol; startCol += compression) {
      let on = false;
      const endCol = Math.min(startCol + compression - 1, bbox.maxCol);
      for (let col = startCol; col <= endCol; col += 1) {
        if (readPixel(afterSnapshot, row, col) !== 0x0000) {
          on = true;
          break;
        }
      }
      art += on ? '#' : '.';
    }
    lines.push(`  r${String(row).padStart(3, '0')}: ${art}`);
  }

  return { compression, lines };
}

function analyzeGlyph(diffSummary) {
  if (!diffSummary.bbox) {
    return {
      fillRatio: 0,
      rowsWithInk: 0,
      medianOnWidth: 0,
      maxOnWidth: 0,
      averageRunCount: 0,
      homeCellWidth: PIXELS_PER_ROW / 26,
      homeCellHeight: LCD_ROWS / 10,
      fitsVariableWidth: false,
      fitsLargeFont: false,
      resemblesOne: false,
      reason: 'No changed pixels were found.',
    };
  }

  const { bbox, onRows, totalOnPixels } = diffSummary;
  const rowsWithInk = onRows.filter((row) => row.onCount > 0);
  const onWidths = rowsWithInk.map((row) => row.onCount);
  const maxOnWidth = onWidths.length > 0 ? Math.max(...onWidths) : 0;
  const averageRunCount = rowsWithInk.length > 0
    ? rowsWithInk.reduce((sum, row) => sum + row.onRuns.length, 0) / rowsWithInk.length
    : 0;
  const fillRatio = bbox.width > 0 && bbox.height > 0
    ? totalOnPixels / (bbox.width * bbox.height)
    : 0;

  const homeCellWidth = PIXELS_PER_ROW / 26;
  const homeCellHeight = LCD_ROWS / 10;
  const fitsVariableWidth = bbox.width >= 1 && bbox.width <= 12 && bbox.height >= 8 && bbox.height <= 16;
  const fitsLargeFont = bbox.width >= 1 && bbox.width <= 16 && bbox.height >= 12 && bbox.height <= 18;

  let resemblesOne = false;
  let reason = '';

  if (
    bbox.width <= 12
    && bbox.height >= 8
    && bbox.height <= 18
    && averageRunCount <= 1.5
    && median(onWidths) <= Math.max(4, bbox.width * 0.5)
    && fillRatio <= 0.45
  ) {
    resemblesOne = true;
    reason = 'The bbox is narrow, the per-row stroke width stays small, and the fill ratio is consistent with a single vertical digit stroke.';
  } else if (bbox.width > 20) {
    reason = `The changed bbox is ${bbox.width}px wide, which is far wider than a single TI-84 CE home-screen digit.`;
  } else if (fillRatio > 0.6) {
    reason = `The bbox is ${(fillRatio * 100).toFixed(1)}% filled, which looks like a block/row fill rather than a narrow "1" stroke.`;
  } else if (maxOnWidth > 6) {
    reason = `Rows inside the bbox reach ${maxOnWidth}px of ink, which is thicker than a typical digit "1".`;
  } else {
    reason = 'The row-by-row stroke pattern does not resemble a narrow, mostly single-column digit.';
  }

  return {
    fillRatio,
    rowsWithInk: rowsWithInk.length,
    medianOnWidth: median(onWidths),
    maxOnWidth,
    averageRunCount,
    homeCellWidth,
    homeCellHeight,
    fitsVariableWidth,
    fitsLargeFont,
    resemblesOne,
    reason,
  };
}

function runEventLoopWithHaltBypass(executor, cpu, startPc, startMode, maxSteps) {
  let totalSteps = 0;
  let haltBypasses = 0;
  let currentPc = startPc;
  let currentMode = startMode;
  let lastResult = null;

  while (totalSteps < maxSteps) {
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: maxSteps - totalSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
    });

    lastResult = result;
    totalSteps += result.steps ?? 0;
    currentPc = result.lastPc ?? currentPc;
    currentMode = result.lastMode ?? currentMode;

    const normalizedPc = currentPc & 0xFFFFFF;
    const shouldBypassHalt = (
      result.termination === 'halt'
      && normalizedPc >= HALT_RANGE_START
      && normalizedPc <= HALT_RANGE_END
    );

    if (!shouldBypassHalt) {
      break;
    }

    haltBypasses += 1;
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    cpu.madl = 1;
    cpu.pc = EVENT_LOOP_ENTRY;
    currentPc = EVENT_LOOP_ENTRY;
    currentMode = 'adl';
  }

  return {
    steps: totalSteps,
    termination: totalSteps >= maxSteps ? 'max_steps' : (lastResult?.termination ?? 'unknown'),
    lastPc: currentPc,
    lastMode: currentMode,
    haltBypasses,
  };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 452 VRAM Pattern Probe ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log(`VRAM: base=${hex(VRAM_BASE)} size=${count(VRAM_BYTE_SIZE)} bytes (${PIXELS_PER_ROW}x${LCD_ROWS} @ 16bpp)`);
  console.log(`Key injection: label="1" scan=${hex(KEY_ONE_SCAN, 2)}`);
  console.log('');

  const bootState = bootToHomeScreen(executor, cpu, mem);
  console.log('');

  seedEventLoopFlags(mem);
  console.log('=== Event Loop Seed State ===');
  console.log(`  D14091=${hex(mem[KEY_PROCESSING_ENABLE_ADDR], 2)}  D177B7=${hex(mem[DISPLAY_REFRESH_MODE_ADDR], 2)}  D177BA=${hex(mem[KEY_GATE_ADDR], 2)}`);
  console.log(`  D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}  D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}  D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  const beforeSnapshot = snapshotVram(mem);

  injectKeyOne(mem);
  console.log('=== Injected Key State ===');
  console.log(`  D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}  D177BA=${hex(mem[KEY_GATE_ADDR], 2)}  D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)}`);
  console.log('');

  const eventLoopResult = runEventLoopWithHaltBypass(
    executor,
    cpu,
    bootState.resumePc,
    bootState.resumeMode,
    EVENT_LOOP_STEPS,
  );

  const afterSnapshot = snapshotVram(mem);
  const diffSummary = summarizeDiff(beforeSnapshot, afterSnapshot);
  const asciiArt = renderAsciiArt(afterSnapshot, diffSummary.bbox);
  const glyphAnalysis = analyzeGlyph(diffSummary);

  console.log('=== Event Loop Result ===');
  console.log(
    `  steps=${count(eventLoopResult.steps)} term=${eventLoopResult.termination} `
    + `lastPc=${hex(eventLoopResult.lastPc)} lastMode=${eventLoopResult.lastMode ?? bootState.resumeMode}`,
  );
  console.log(
    `  final D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)} final D177BA=${hex(mem[KEY_GATE_ADDR], 2)} `
    + `final D00080=${hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2)} haltBypasses=${count(eventLoopResult.haltBypasses)}`,
  );
  console.log('');

  console.log('=== Full VRAM Diff Summary ===');
  console.log(`  totalChangedBytes=${count(diffSummary.totalChangedBytes)}`);
  console.log(`  totalChangedPixels=${count(diffSummary.totalChangedPixels)}`);
  console.log(`  firstChangedByte=${hex(diffSummary.firstChangedByteAddr)}`);
  console.log(`  lastChangedByte=${hex(diffSummary.lastChangedByteAddr)}`);
  if (diffSummary.bbox) {
    console.log(
      `  changedBBox rows=${diffSummary.bbox.minRow}-${diffSummary.bbox.maxRow} `
      + `cols=${diffSummary.bbox.minCol}-${diffSummary.bbox.maxCol} `
      + `size=${diffSummary.bbox.width}x${diffSummary.bbox.height}`,
    );
  } else {
    console.log('  changedBBox=none');
  }
  console.log(`  globalByteTransitions=${formatTransitions(diffSummary.globalByteTransitions)}`);
  console.log(`  globalPixelTransitions=${formatTransitions(diffSummary.globalPixelTransitions)}`);

  const singleByteTransition = sortTransitionEntries(diffSummary.globalByteTransitions);
  const singlePixelTransition = sortTransitionEntries(diffSummary.globalPixelTransitions);
  if (
    singleByteTransition.length === 1
    && singleByteTransition[0][0] === '0x00 -> 0xFF'
    && singlePixelTransition.length === 1
    && singlePixelTransition[0][0] === '0x0000 -> 0xFFFF'
  ) {
    console.log('  interpretation=Every changed byte moved from 0x00 to 0xFF, so every changed pixel moved from black (0x0000) to white (0xFFFF).');
  }
  console.log('');

  console.log('=== Row-By-Row Breakdown (all 240 rows) ===');
  for (const row of diffSummary.rows) {
    console.log(
      `  r${String(row.row).padStart(3, '0')} `
      + `bytes=${count(row.changedBytes).padStart(5, ' ')} `
      + `pixels=${count(row.changedPixels).padStart(4, ' ')} `
      + `cols=${row.minPixel === null ? '--' : `${row.minPixel}-${row.maxPixel}`} `
      + `changedRuns=${formatRuns(row.changedRuns)} `
      + `byteTransitions=${formatTransitions(row.byteTransitions)}`,
    );
  }
  console.log('');

  console.log('=== Changed Region Rows ===');
  if (diffSummary.bbox) {
    const onRowsByIndex = new Map(diffSummary.onRows.map((row) => [row.row, row]));
    for (const row of diffSummary.changedRows) {
      const onRow = onRowsByIndex.get(row.row) ?? { onCount: 0, onRuns: [] };
      console.log(
        `  r${String(row.row).padStart(3, '0')} `
        + `changedCols=${formatRuns(row.changedRuns)} `
        + `onCols=${formatRuns(onRow.onRuns)} `
        + `onPixels=${count(onRow.onCount)} `
        + `pixelTransitions=${formatTransitions(row.pixelTransitions)}`,
      );
    }
  } else {
    console.log('  none');
  }
  console.log('');

  console.log('=== ASCII Art (after-state, non-black pixels are "#") ===');
  if (!diffSummary.bbox) {
    console.log('  No changed pixels; ASCII art omitted.');
  } else {
    console.log(
      `  bbox=${diffSummary.bbox.width}x${diffSummary.bbox.height} `
      + `compression=${asciiArt.compression}x horizontally`,
    );
    for (const line of asciiArt.lines) {
      console.log(line);
    }
  }
  console.log('');

  console.log('=== Font Dimension Check ===');
  if (!diffSummary.bbox) {
    console.log('  No changed region to compare against TI-84 CE font sizes.');
  } else {
    const cellsWide = diffSummary.bbox.width / glyphAnalysis.homeCellWidth;
    const cellsTall = diffSummary.bbox.height / glyphAnalysis.homeCellHeight;
    console.log(`  bbox=${diffSummary.bbox.width}x${diffSummary.bbox.height} pixels`);
    console.log(`  homeCellApprox=${glyphAnalysis.homeCellWidth.toFixed(2)}x${glyphAnalysis.homeCellHeight.toFixed(2)} pixels (320/26 by 240/10)`);
    console.log(`  bboxInHomeCells=${cellsWide.toFixed(2)} wide x ${cellsTall.toFixed(2)} tall`);
    console.log(`  variableWidthFontMatch=${glyphAnalysis.fitsVariableWidth ? 'yes' : 'no'} (expected width ~7-12, height ~8-16)`);
    console.log(`  largeFontMatch=${glyphAnalysis.fitsLargeFont ? 'yes' : 'no'} (expected width <=16, height ~12-18)`);
    console.log(`  rowsWithInk=${count(glyphAnalysis.rowsWithInk)} medianOnWidth=${glyphAnalysis.medianOnWidth} maxOnWidth=${glyphAnalysis.maxOnWidth}`);
    console.log(`  fillRatio=${(glyphAnalysis.fillRatio * 100).toFixed(1)}% averageRunCount=${glyphAnalysis.averageRunCount.toFixed(2)}`);
  }
  console.log('');

  console.log('=== Glyph Comparison Against "1" ===');
  console.log(`  resemblesDigitOne=${glyphAnalysis.resemblesOne ? 'yes' : 'no'}`);
  console.log(`  reason=${glyphAnalysis.reason}`);
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
