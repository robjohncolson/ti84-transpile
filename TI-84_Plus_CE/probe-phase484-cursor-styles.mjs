#!/usr/bin/env node
/**
 * probe-phase484-cursor-styles.mjs
 *
 * Decode cursor glyph styles selected by D00092 through the cursor render path:
 *   0x030202: selects glyph code 0xE1/0xE2/0xE3 from D00092 bits
 *   0x030173: cursor render entry
 *
 * This probe boots the ROM once, then restores boot VRAM before each render so
 * each D00092 candidate reports only the bytes changed by that one glyph draw.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const VRAM_SIZE = VRAM_END - VRAM_START;
const ROW_STRIDE = 0x280;
const CURSOR_RENDER_ENTRY = 0x030173;
const GLYPH_SELECTOR_ENTRY = 0x030202;
const FONT_GLYPH_SELECTOR_ENTRY = 0x0A23C0;
const CURSOR_VRAM_WRITER_ENTRY = 0x0A239E;
const SENTINEL_PC = 0x500000;
const STACK_RESET_TOP = 0xD1A87E;
const MAX_RENDER_STEPS = 2000;
const MAX_SELECTOR_STEPS = 500;
const CURSOR_VRAM_ADDR = 0xD40000 + (37 * ROW_STRIDE) + (2 * 2);

const TRACK_PCS = [
  CURSOR_RENDER_ENTRY,
  GLYPH_SELECTOR_ENTRY,
  FONT_GLYPH_SELECTOR_ENTRY,
  CURSOR_VRAM_WRITER_ENTRY,
  0x0A2400,
];

const TARGET_GLYPHS = [0xE1, 0xE2, 0xE3];

const TARGETED_CANDIDATES = [
  { value: 0x16, note: 'session483 thin/default: bits 1,2,4' },
  { value: 0x14, note: 'underline guess: bit 1 clear, bits 2,4' },
  { value: 0x12, note: 'block guess: bit 2 clear, bits 1,4' },
  { value: 0x06, note: 'block alternate: bits 1,2' },
];

const candidateValues = [
  ...TARGETED_CANDIDATES.map((candidate) => candidate.value),
  ...Array.from({ length: 0x20 }, (_, value) => value),
];
const CANDIDATES = [...new Set(candidateValues)].map((value) => ({
  value,
  note: TARGETED_CANDIDATES.find((candidate) => candidate.value === value)?.note ?? 'sweep',
}));

const hex = (value, width = 6) => (
  '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0')
);
const hex2 = (value) => hex(value & 0xFF, 2);
const hex4 = (value) => hex(value & 0xFFFF, 4);

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function write16(addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
}

function write24(addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function restoreVram(snapshot) {
  mem.set(snapshot, VRAM_START);
}

function resetCpuForCall() {
  cpu.a = 0;
  cpu.f = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.hl = 0;
  cpu.ix = 0;
  cpu.iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.madl = 1;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;
}

function setupCursorState(d00092) {
  mem[0xD00000] = 0x00;
  mem[0xD00080] = 0x18;
  mem[0xD00085] = 0x00;
  mem[0xD00089] = mem[0xD00089] | 0x10;
  mem[0xD0008D] = mem[0xD0008D] | 0x01;
  mem[0xD00092] = d00092 & 0xFF;
  mem[0xD00095] = 0x00;
  mem[0xD000B2] = 0x00;
  mem[0xD000C6] = mem[0xD000C6] | 0x01;
  mem[0xD00595] = 0x00;
  mem[0xD00596] = 0x00;
  write24(0xD0059C, CURSOR_VRAM_ADDR);
  write16(0xD026AA, 0xFFFF);
  write16(0xD026AC, 0x0000);
}

function callSubroutine(entry, maxSteps, onBlock = null) {
  resetCpuForCall();
  const callStackSp = STACK_RESET_TOP - 3;
  write24(callStackSp, SENTINEL_PC);
  cpu.sp = callStackSp;
  cpu.pc = entry;

  let missingBlock = null;
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: 200000,
    onBlock,
    onMissingBlock(pc, mode, steps) {
      missingBlock = { pc: pc & 0xFFFFFF, mode, steps };
    },
  });

  return { ...result, missingBlock };
}

function runGlyphSelector(d00092) {
  setupCursorState(d00092);
  const result = callSubroutine(GLYPH_SELECTOR_ENTRY, MAX_SELECTOR_STEPS);
  return {
    glyphCode: cpu.a & 0xFF,
    registers: {
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      bc: cpu.bc & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      hl: cpu.hl & 0xFFFFFF,
    },
    result,
  };
}

function diffVram(before, after) {
  const changes = [];
  for (let offset = 0; offset < VRAM_SIZE; offset += 1) {
    if (before[offset] === after[offset]) continue;

    changes.push({
      addr: VRAM_START + offset,
      offset,
      row: Math.floor(offset / ROW_STRIDE),
      byteInRow: offset % ROW_STRIDE,
      col: Math.floor((offset % ROW_STRIDE) / 2),
      lane: offset & 1,
      oldVal: before[offset],
      newVal: after[offset],
    });
  }
  return changes;
}

function formatRanges(values) {
  if (values.length === 0) return '(none)';

  const ranges = [];
  let start = values[0];
  let prev = values[0];

  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value === prev + 1) {
      prev = value;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = value;
    prev = value;
  }

  ranges.push(start === prev ? String(start) : `${start}-${prev}`);
  return ranges.join(', ');
}

function analyzeChanges(changes, before, after) {
  const pixelKeys = new Set(changes.map((change) => `${change.row}:${change.col}`));

  if (pixelKeys.size === 0) {
    return {
      changedBytes: 0,
      pixelCount: 0,
      minRow: null,
      maxRow: null,
      minCol: null,
      maxCol: null,
      height: 0,
      width: 0,
      rows: new Map(),
      gridLines: [],
      signature: 'empty',
      solid: false,
      description: 'no VRAM changes',
      uniqueNew16: [],
      uniqueXor16: [],
    };
  }

  const rowValues = [...new Set(changes.map((change) => change.row))].sort((a, b) => a - b);
  const colValues = [...new Set(changes.map((change) => change.col))].sort((a, b) => a - b);
  const minRow = rowValues[0];
  const maxRow = rowValues[rowValues.length - 1];
  const minCol = colValues[0];
  const maxCol = colValues[colValues.length - 1];
  const height = maxRow - minRow + 1;
  const width = maxCol - minCol + 1;

  const rows = new Map();
  for (const change of changes) {
    if (!rows.has(change.row)) rows.set(change.row, []);
    rows.get(change.row).push(change);
  }

  const gridLines = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    let line = '';
    for (let col = minCol; col <= maxCol; col += 1) {
      line += pixelKeys.has(`${row}:${col}`) ? '#' : '.';
    }
    gridLines.push(line);
  }

  const pixelMap = new Map();
  for (const change of changes) {
    const key = `${change.row}:${change.col}`;
    if (pixelMap.has(key)) continue;

    const pixelOffset = change.offset - change.lane;
    pixelMap.set(key, {
      old16: before[pixelOffset] | (before[pixelOffset + 1] << 8),
      new16: after[pixelOffset] | (after[pixelOffset + 1] << 8),
    });
  }

  const uniqueNew16 = [...new Set([...pixelMap.values()].map((pixel) => pixel.new16))]
    .sort((a, b) => a - b);
  const uniqueXor16 = [...new Set([...pixelMap.values()].map((pixel) => pixel.old16 ^ pixel.new16))]
    .sort((a, b) => a - b);

  const solid = pixelKeys.size === width * height;
  const rowCounts = gridLines.map((line) => [...line].filter((char) => char === '#').length);
  const fullRows = rowCounts.filter((count) => count === width).length;
  const hasOutlineRows = gridLines[0] === '#'.repeat(width)
    && gridLines[gridLines.length - 1] === '#'.repeat(width);
  const hasOutlineSides = gridLines.slice(1, -1).every((line) => (
    line[0] === '#' && line[line.length - 1] === '#'
  ));

  let description = 'sparse cursor glyph';
  if (solid) {
    description = 'filled block cursor';
  } else if (height <= 4 && fullRows === height && width >= 8) {
    description = 'underline cursor';
  } else if (hasOutlineRows && hasOutlineSides) {
    description = 'hollow rectangle / thin cursor';
  } else if (fullRows > 0 && height <= 6) {
    description = 'underline-like horizontal cursor band';
  }

  return {
    changedBytes: changes.length,
    pixelCount: pixelKeys.size,
    minRow,
    maxRow,
    minCol,
    maxCol,
    height,
    width,
    rows,
    gridLines,
    signature: `${width}x${height}:${gridLines.join('/')}`,
    solid,
    description,
    uniqueNew16,
    uniqueXor16,
  };
}

function runRenderCandidate(candidate, bootVram) {
  restoreVram(bootVram);
  const selector = runGlyphSelector(candidate.value);

  restoreVram(bootVram);
  setupCursorState(candidate.value);
  const before = snapshotVram();
  const hits = new Map(TRACK_PCS.map((pc) => [pc, 0]));
  const renderResult = callSubroutine(CURSOR_RENDER_ENTRY, MAX_RENDER_STEPS, (pc) => {
    const masked = pc & 0xFFFFFF;
    if (hits.has(masked)) {
      hits.set(masked, hits.get(masked) + 1);
    }
  });
  const after = snapshotVram();
  const changes = diffVram(before, after);
  const analysis = analyzeChanges(changes, before, after);

  return {
    ...candidate,
    selector,
    renderResult,
    hits,
    changes,
    analysis,
    finalState: {
      d00092: mem[0xD00092],
      d00095: mem[0xD00095],
      d00595: mem[0xD00595],
      d00596: mem[0xD00596],
      d0059c: mem[0xD0059C] | (mem[0xD0059D] << 8) | (mem[0xD0059E] << 16),
    },
  };
}

function printMapping(results) {
  console.log('');
  console.log('=== D00092 SELECTOR / RENDER MAP ===');
  console.log('value  glyph  bytes  pixels  bbox      shape-signature-note');
  for (const result of results) {
    const analysis = result.analysis;
    const bbox = analysis.pixelCount === 0
      ? '(none)'
      : `${analysis.width}x${analysis.height}@r${analysis.minRow}c${analysis.minCol}`;
    const glyph = hex2(result.selector.glyphCode);
    console.log(
      `${hex2(result.value)}  ${glyph}   `
      + `${String(analysis.changedBytes).padStart(5, ' ')}  `
      + `${String(analysis.pixelCount).padStart(6, ' ')}  `
      + `${bbox.padEnd(13, ' ')}  ${result.note}`,
    );
  }
}

function groupByGlyph(results) {
  const groups = new Map();
  for (const result of results) {
    const glyph = result.selector.glyphCode;
    if (!groups.has(glyph)) groups.set(glyph, []);
    groups.get(glyph).push(result);
  }
  return groups;
}

function groupBySignature(results) {
  const groups = new Map();
  for (const result of results) {
    const signature = result.analysis.signature;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(result);
  }
  return groups;
}

function representativeResults(results) {
  const selected = [];
  const seen = new Set();

  for (const targetGlyph of TARGET_GLYPHS) {
    const result = results.find((candidate) => (
      candidate.selector.glyphCode === targetGlyph && candidate.analysis.pixelCount > 0
    ));
    if (result && !seen.has(result.analysis.signature)) {
      selected.push(result);
      seen.add(result.analysis.signature);
    }
  }

  for (const result of results) {
    if (result.analysis.pixelCount === 0) continue;
    if (seen.has(result.analysis.signature)) continue;
    selected.push(result);
    seen.add(result.analysis.signature);
  }

  return selected;
}

function printGroupedRows(result) {
  const rows = [...result.analysis.rows.entries()].sort((a, b) => a[0] - b[0]);
  console.log('Grouped by 0x280-byte VRAM rows:');
  for (const [row, rowChanges] of rows) {
    const cols = [...new Set(rowChanges.map((change) => change.col))].sort((a, b) => a - b);
    console.log(
      `  row ${row} base ${hex(VRAM_START + row * ROW_STRIDE)}: `
      + `${rowChanges.length} bytes, cols ${formatRanges(cols)}`,
    );
  }
}

function printChangedBytes(result) {
  console.log('Changed VRAM bytes:');
  for (const change of result.changes) {
    const laneName = change.lane === 0 ? 'lo' : 'hi';
    console.log(
      `  ${hex(change.addr)} row=${change.row} col=${change.col} ${laneName} `
      + `${hex2(change.oldVal)} -> ${hex2(change.newVal)}`,
    );
  }
}

function printGrid(result) {
  const analysis = result.analysis;
  console.log('');
  console.log('Pixel grid (# = changed pixel):');
  for (let i = 0; i < analysis.gridLines.length; i += 1) {
    const row = analysis.minRow + i;
    console.log(`  r${String(row).padStart(3, ' ')} ${analysis.gridLines[i]}`);
  }
}

function printRepresentative(result, allResults) {
  const analysis = result.analysis;
  const sameGlyph = allResults
    .filter((candidate) => candidate.selector.glyphCode === result.selector.glyphCode)
    .map((candidate) => hex2(candidate.value))
    .join(', ');
  const sameShape = allResults
    .filter((candidate) => candidate.analysis.signature === result.analysis.signature)
    .map((candidate) => hex2(candidate.value))
    .join(', ');

  console.log('');
  console.log(`=== GLYPH ${hex2(result.selector.glyphCode)} REPRESENTATIVE: D00092=${hex2(result.value)} ===`);
  console.log(`Candidate note: ${result.note}`);
  console.log(`D00092 values returning glyph ${hex2(result.selector.glyphCode)}: ${sameGlyph}`);
  console.log(`D00092 values with same rendered shape: ${sameShape}`);
  console.log(`Render termination: ${result.renderResult.termination}`);
  console.log(`Missing-block sentinel: ${result.renderResult.missingBlock ? hex(result.renderResult.missingBlock.pc) : '(none)'}`);
  console.log(`Changed VRAM bytes: ${analysis.changedBytes}`);
  console.log(`Changed pixels: ${analysis.pixelCount}`);
  console.log(
    analysis.pixelCount === 0
      ? 'Bounding box: none'
      : `Bounding box: rows ${analysis.minRow}-${analysis.maxRow} (${analysis.height}), `
        + `cols ${analysis.minCol}-${analysis.maxCol} (${analysis.width})`,
  );
  console.log(`Shape description: ${analysis.description}`);
  console.log(`Solid bounding box: ${analysis.solid ? 'yes' : 'no'}`);
  console.log(`Unique new 16bpp values: ${analysis.uniqueNew16.map(hex4).join(', ') || '(none)'}`);
  console.log(`Unique old^new XOR deltas: ${analysis.uniqueXor16.map(hex4).join(', ') || '(none)'}`);

  console.log('Tracked PC hits:');
  for (const pc of TRACK_PCS) {
    console.log(`  ${hex(pc)}: ${result.hits.get(pc) ?? 0}`);
  }

  if (result.changes.length > 0) {
    printGroupedRows(result);
    printGrid(result);
    printChangedBytes(result);
  }
}

console.log('Phase 484: Cursor style glyph probe');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');

mem[SENTINEL_PC] = 0xC9;
console.log(`Sentinel return target set at ${hex(SENTINEL_PC)}`);
console.log(`Cursor VRAM pointer D0059C will be ${hex(CURSOR_VRAM_ADDR)}`);
console.log(`D00092 candidates: ${CANDIDATES.map((candidate) => hex2(candidate.value)).join(', ')}`);

const bootVram = snapshotVram();
const results = [];

for (const candidate of CANDIDATES) {
  console.log(`Running D00092=${hex2(candidate.value)} (${candidate.note})`);
  results.push(runRenderCandidate(candidate, bootVram));
}

printMapping(results);

const glyphGroups = groupByGlyph(results);
console.log('');
console.log('=== GLYPH CODE GROUPS ===');
for (const [glyph, group] of [...glyphGroups.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${hex2(glyph)} <= ${group.map((result) => hex2(result.value)).join(', ')}`);
}

const signatureGroups = groupBySignature(results);
console.log('');
console.log('=== DISTINCT RENDERED SHAPES ===');
let shapeIndex = 1;
for (const [signature, group] of [...signatureGroups.entries()]) {
  const sample = group[0];
  const analysis = sample.analysis;
  const glyphs = [...new Set(group.map((result) => result.selector.glyphCode))]
    .sort((a, b) => a - b)
    .map(hex2)
    .join(', ');
  const values = group.map((result) => hex2(result.value)).join(', ');
  const bbox = analysis.pixelCount === 0
    ? 'none'
    : `${analysis.width}x${analysis.height}@r${analysis.minRow}c${analysis.minCol}`;
  console.log(`  shape ${shapeIndex}: glyphs ${glyphs}, values ${values}, bbox ${bbox}, ${analysis.description}`);
  console.log(`    signature ${signature}`);
  shapeIndex += 1;
}

console.log('');
console.log('=== TARGET STYLE COVERAGE ===');
for (const glyph of TARGET_GLYPHS) {
  const group = glyphGroups.get(glyph) ?? [];
  if (group.length === 0) {
    console.log(`  ${hex2(glyph)}: not found in D00092 0x00-0x1F sweep`);
    continue;
  }
  const distinctShapes = new Set(group.map((result) => result.analysis.signature));
  console.log(
    `  ${hex2(glyph)}: ${group.length} D00092 values, `
    + `${distinctShapes.size} rendered shape(s), first ${hex2(group[0].value)}`,
  );
}

for (const result of representativeResults(results)) {
  printRepresentative(result, results);
}

console.log('');
console.log('Phase 484 probe complete.');
