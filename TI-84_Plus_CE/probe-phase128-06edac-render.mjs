#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { PRELIFTED_BLOCKS, TRANSPILATION_META, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import {
  buildFontSignatures,
  decodeTextStrip,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
} from './font-decoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPORT_PATH = path.join(__dirname, 'phase128-report.md');
const PNG_PATH = path.join(__dirname, 'phase128-render.png');

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const FULL_RENDER_ENTRY = 0x06edac;
const STAGE_1_ENTRY = 0x0a2b72;
const STAGE_2_ENTRY = 0x0a3301;
const STAGE_3_ENTRY = 0x0a29ec;

const STACK_RESET_TOP = 0xd1a87e;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const LCD_PIXEL_COUNT = LCD_WIDTH * LCD_HEIGHT;
const VRAM_BYTE_SIZE = LCD_PIXEL_COUNT * 2;
const VRAM_END = VRAM_BASE + VRAM_BYTE_SIZE;
const VRAM_SENTINEL_BYTE = 0xaa;
const VRAM_SENTINEL_WORD = 0xaaaa;
const WHITE_PIXEL = 0xffff;

const MODE_BUF_START = 0xd020a6;
const MODE_TEXT = 'Normal Float Radian       ';
const MODE_TEXT_LEN = 26;

const WORKSPACE_ROW_START = 75;
const WORKSPACE_ROW_END = 219;
const ENTRY_ROW_START = 220;
const ENTRY_ROW_END = 239;

const DECODE_STRIDE = 12;
const DECODE_COMPARE_WIDTH = 10;
const DECODE_MAX_DIST = 30;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im',
  'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const TEXT_REGIONS = [
  {
    key: 'statusBar',
    label: 'Status bar',
    rowStart: 0,
    rowEnd: 16,
    scanRows: [0, 1, 2, 3],
  },
  {
    key: 'modeText',
    label: 'Mode text',
    rowStart: 17,
    rowEnd: 34,
    scanRows: [17, 18, 19, 20, 21],
  },
  {
    key: 'historyArea',
    label: 'History area',
    rowStart: 37,
    rowEnd: 74,
    scanRows: [37, 38, 39, 40, 41],
  },
  {
    key: 'entryLine',
    label: 'Entry line',
    rowStart: 220,
    rowEnd: 239,
    scanRows: [220, 221, 222, 223, 224, 225],
  },
];

const COMPARISON_REGIONS = [
  { label: 'Status bar', rowStart: 0, rowEnd: 16 },
  { label: 'Mode text', rowStart: 17, rowEnd: 34 },
  { label: 'Gap rows 35-36', rowStart: 35, rowEnd: 36 },
  { label: 'History area', rowStart: 37, rowEnd: 74 },
  { label: 'Workspace', rowStart: 75, rowEnd: 219 },
  { label: 'Entry line', rowStart: 220, rowEnd: 239 },
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_TEXT_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_TEXT.charCodeAt(i);
  }
}

function clearVram(mem) {
  mem.fill(VRAM_SENTINEL_BYTE, VRAM_BASE, VRAM_END);
}

function fillRowsWhite(mem, rowStart, rowEnd) {
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < LCD_WIDTH; col++) {
      const off = VRAM_BASE + (row * LCD_WIDTH + col) * 2;
      mem[off] = 0xff;
      mem[off + 1] = 0xff;
    }
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map(f => [f, cpu[f]]));
}

function restoreCpuForRender(cpu, snapshot, mem) {
  for (const f of CPU_SNAPSHOT_FIELDS) cpu[f] = snapshot[f];
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 0x400;
  mem.fill(0xfe, cpu.sp, cpu.sp + 0x400);
}

function extractVramPixels(mem) {
  const px = new Uint16Array(LCD_PIXEL_COUNT);
  for (let i = 0; i < LCD_PIXEL_COUNT; i++) {
    const off = VRAM_BASE + i * 2;
    px[i] = mem[off] | (mem[off + 1] << 8);
  }
  return px;
}

function countNonSentinel(pixels) {
  let c = 0;
  for (const p of pixels) if (p !== VRAM_SENTINEL_WORD) c++;
  return c;
}

// --- VRAM write hook ---

function installVramWriteHook(cpu) {
  let writeCount = 0;
  const orig8 = cpu.write8.bind(cpu);
  const orig16 = cpu.write16 ? cpu.write16.bind(cpu) : null;
  const orig24 = cpu.write24 ? cpu.write24.bind(cpu) : null;

  function countBytes(addr, n) {
    const s = addr & 0xffffff;
    const e = s + n - 1;
    if (e < VRAM_BASE || s >= VRAM_END) return;
    const first = Math.max(s, VRAM_BASE);
    const last = Math.min(e, VRAM_END - 1);
    writeCount += last - first + 1;
  }

  cpu.write8 = (addr, val) => { countBytes(addr, 1); return orig8(addr, val); };
  if (orig16) cpu.write16 = (addr, val) => { countBytes(addr, 2); return orig16(addr, val); };
  if (orig24) cpu.write24 = (addr, val) => { countBytes(addr, 3); return orig24(addr, val); };

  return {
    getWriteCount() { return writeCount; },
    restore() {
      cpu.write8 = orig8;
      if (orig16) cpu.write16 = orig16;
      if (orig24) cpu.write24 = orig24;
    },
  };
}

// --- Boot ---

function buildEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;

  const osInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080;

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

  return {
    romBytes, mem, executor, cpu,
    coldBoot, osInit, postInit,
    ramSnapshot: new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function resetToPostBoot(env) {
  env.mem.set(env.ramSnapshot, RAM_SNAPSHOT_START);
  restoreCpuForRender(env.cpu, env.cpuSnapshot, env.mem);
}

// --- Part A: Run 0x06EDAC ---

function runFullRender(env) {
  resetToPostBoot(env);
  seedModeBuffer(env.mem);
  clearVram(env.mem);

  const hook = installVramWriteHook(env.cpu);
  let result;

  try {
    result = env.executor.runFrom(FULL_RENDER_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 10000,
    });
  } finally {
    hook.restore();
  }

  const pixels = extractVramPixels(env.mem);
  const vramBytes = new Uint8Array(env.mem.slice(VRAM_BASE, VRAM_END));

  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode ?? 'adl',
    vramWriteCount: hook.getWriteCount(),
    nonSentinelPixels: countNonSentinel(pixels),
    missingBlocks: [...(result.missingBlocks ?? [])],
    loopsForced: result.loopsForced ?? 0,
    pixels,
    vramBytes,
  };
}

// --- Part B: Text decode ---

function decodeRegions(mem, romBytes) {
  const sigs = buildFontSignatures(romBytes);
  const results = {};
  const numCells = Math.floor((LCD_WIDTH - 4) / DECODE_STRIDE);
  const colCandidates = [0, 1, 2, 3, 4];

  for (const region of TEXT_REGIONS) {
    const attempts = [];

    for (const startRow of region.scanRows) {
      for (const startCol of colCandidates) {
        const text = decodeTextStrip(
          mem, startRow, startCol, numCells, sigs,
          DECODE_MAX_DIST, 'auto', DECODE_STRIDE, DECODE_COMPARE_WIDTH,
        );
        const trimmed = text.replace(/\s+$/, '');
        const nonSpace = trimmed.replace(/\s/g, '').length;
        attempts.push({ startRow, startCol, text: trimmed, nonSpace });
      }
    }

    attempts.sort((a, b) => b.nonSpace - a.nonSpace);
    results[region.key] = { label: region.label, best: attempts[0], top3: attempts.slice(0, 3) };
  }

  return results;
}

// --- Part C: 5-stage composite ---

function runComposite(env) {
  resetToPostBoot(env);
  clearVram(env.mem);

  const stages = [];

  // Stage 1
  restoreCpuForRender(env.cpu, env.cpuSnapshot, env.mem);
  let r = env.executor.runFrom(STAGE_1_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
  stages.push({ label: 'Stage 1: white background', steps: r.steps, term: r.termination });

  // Stage 2
  restoreCpuForRender(env.cpu, env.cpuSnapshot, env.mem);
  r = env.executor.runFrom(STAGE_2_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
  stages.push({ label: 'Stage 2: status dots', steps: r.steps, term: r.termination });

  // Stage 3
  seedModeBuffer(env.mem);
  restoreCpuForRender(env.cpu, env.cpuSnapshot, env.mem);
  r = env.executor.runFrom(STAGE_3_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  stages.push({ label: 'Stage 3: mode text', steps: r.steps, term: r.termination });

  // Stage 4
  fillRowsWhite(env.mem, WORKSPACE_ROW_START, WORKSPACE_ROW_END);
  stages.push({ label: 'Stage 4: workspace white fill', steps: null, term: 'memory_fill' });

  // Stage 5
  fillRowsWhite(env.mem, ENTRY_ROW_START, ENTRY_ROW_END);
  stages.push({ label: 'Stage 5: entry line white fill', steps: null, term: 'memory_fill' });

  const pixels = extractVramPixels(env.mem);
  return { stages, pixels };
}

// --- Part C: Comparison ---

function compareVrams(pixelsA, pixelsB) {
  let matching = 0;
  let differing = 0;
  const diffs = [];

  for (let i = 0; i < LCD_PIXEL_COUNT; i++) {
    if (pixelsA[i] === pixelsB[i]) {
      matching++;
    } else {
      differing++;
      if (diffs.length < 20) {
        diffs.push({
          pixel: i,
          row: Math.floor(i / LCD_WIDTH),
          col: i % LCD_WIDTH,
          a: pixelsA[i],
          b: pixelsB[i],
        });
      }
    }
  }

  const regionStats = COMPARISON_REGIONS.map(r => {
    let match = 0;
    let diff = 0;
    for (let row = r.rowStart; row <= r.rowEnd; row++) {
      for (let col = 0; col < LCD_WIDTH; col++) {
        const idx = row * LCD_WIDTH + col;
        if (pixelsA[idx] === pixelsB[idx]) match++;
        else diff++;
      }
    }
    return { label: r.label, rowStart: r.rowStart, rowEnd: r.rowEnd, match, diff };
  });

  return { matching, differing, diffs, regionStats };
}

// --- PNG encoder (inline, zero deps) ---

function buildCrcTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
}

const CRC_TABLE = buildCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (const v of buf) c = CRC_TABLE[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.alloc(4);
  lb.writeUInt32BE(data.length, 0);
  const ci = Buffer.concat([tb, data]);
  const cb = Buffer.alloc(4);
  cb.writeUInt32BE(crc32(ci), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

function encodeMinimalPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let r = 0; r < height; r++) {
    raw[r * (stride + 1)] = 0;
    raw.set(rgba.subarray(r * stride, r * stride + stride), r * (stride + 1) + 1);
  }
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(width, 0);
  hdr.writeUInt32BE(height, 4);
  hdr[8] = 8;
  hdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', hdr),
    makeChunk('IDAT', deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function vramToRgba(mem) {
  const rgba = new Uint8Array(LCD_PIXEL_COUNT * 4);
  for (let i = 0; i < LCD_PIXEL_COUNT; i++) {
    const off = VRAM_BASE + i * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    rgba[i * 4] = Math.round(((px >> 11) & 0x1f) * 255 / 31);
    rgba[i * 4 + 1] = Math.round(((px >> 5) & 0x3f) * 255 / 63);
    rgba[i * 4 + 2] = Math.round((px & 0x1f) * 255 / 31);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

// --- Report builder ---

function buildReport(env, partA, partB, composite, cmp, pngSize) {
  const L = [];

  L.push('# Phase 128 - 0x06EDAC Full-Screen Render Analysis');
  L.push('');
  L.push('Generated by `probe-phase128-06edac-render.mjs`.');
  L.push('');

  L.push('## Setup');
  L.push('');
  L.push(`- ROM: ${TRANSPILATION_META?.blockCount ?? '?'} blocks, ${TRANSPILATION_META?.coveragePercent ?? '?'}% coverage`);
  L.push(`- coldBoot: steps=${env.coldBoot.steps} term=${env.coldBoot.termination}`);
  L.push(`- osInit: steps=${env.osInit.steps} term=${env.osInit.termination}`);
  L.push(`- postInit: steps=${env.postInit.steps} term=${env.postInit.termination}`);
  L.push('');

  L.push('## Part A - 0x06EDAC Execution');
  L.push('');
  L.push('| Field | Value |');
  L.push('| --- | --- |');
  L.push(`| Entry | \`${hex(FULL_RENDER_ENTRY)}\` |`);
  L.push(`| Steps | ${partA.steps} |`);
  L.push(`| Termination | ${partA.termination} |`);
  L.push(`| Last PC | \`${hex(partA.lastPc)}\` (${partA.lastMode}) |`);
  L.push(`| VRAM write count (bytes) | ${partA.vramWriteCount} |`);
  L.push(`| Non-sentinel pixels | ${partA.nonSentinelPixels} / ${LCD_PIXEL_COUNT} |`);
  L.push(`| Loops forced | ${partA.loopsForced} |`);
  L.push(`| Missing blocks | ${partA.missingBlocks.length === 0 ? 'none' : partA.missingBlocks.join(', ')} |`);
  L.push('');

  L.push('## Part B - Text Decode from 0x06EDAC VRAM');
  L.push('');
  for (const region of TEXT_REGIONS) {
    const data = partB[region.key];
    L.push(`### ${data.label} (rows ${region.rowStart}-${region.rowEnd})`);
    L.push('');
    L.push('| startRow | startCol | decoded text | non-space chars |');
    L.push('| --- | --- | --- | --- |');
    for (const a of data.top3) {
      const escaped = a.text.replace(/\|/g, '\\|');
      L.push(`| ${a.startRow} | ${a.startCol} | \`${escaped}\` | ${a.nonSpace} |`);
    }
    L.push('');
  }

  L.push('## Part C - VRAM Comparison (0x06EDAC vs 5-Stage Composite)');
  L.push('');
  L.push('### Composite Stage Summary');
  L.push('');
  L.push('| Stage | Steps | Termination |');
  L.push('| --- | --- | --- |');
  for (const s of composite.stages) {
    L.push(`| ${s.label} | ${s.steps ?? 'n/a'} | ${s.term} |`);
  }
  L.push('');

  L.push('### Pixel Comparison');
  L.push('');
  L.push(`- **Matching pixels**: ${cmp.matching} / ${LCD_PIXEL_COUNT}`);
  L.push(`- **Differing pixels**: ${cmp.differing} / ${LCD_PIXEL_COUNT}`);
  L.push(`- **Match rate**: ${((cmp.matching / LCD_PIXEL_COUNT) * 100).toFixed(2)}%`);
  L.push('');

  L.push('### Per-Region Breakdown');
  L.push('');
  L.push('| Region | Rows | Match | Diff |');
  L.push('| --- | --- | --- | --- |');
  for (const r of cmp.regionStats) {
    L.push(`| ${r.label} | ${r.rowStart}-${r.rowEnd} | ${r.match} | ${r.diff} |`);
  }
  L.push('');

  if (cmp.diffs.length > 0) {
    L.push('### First 20 Differing Pixels');
    L.push('');
    L.push('| pixel | row | col | 0x06EDAC | composite |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const d of cmp.diffs) {
      L.push(`| ${d.pixel} | ${d.row} | ${d.col} | \`${hex(d.a, 4)}\` | \`${hex(d.b, 4)}\` |`);
    }
    L.push('');
  } else {
    L.push('No differing pixels - VRAMs are **identical**.');
    L.push('');
  }

  L.push('## Part D - PNG Output');
  L.push('');
  L.push(`- File: \`phase128-render.png\``);
  L.push(`- Size: ${pngSize} bytes`);
  L.push(`- Dimensions: ${LCD_WIDTH}x${LCD_HEIGHT}`);
  L.push('');

  L.push('## Verdict');
  L.push('');
  if (cmp.differing === 0) {
    L.push('**IDENTICAL** - 0x06EDAC produces the exact same VRAM output as the 5-stage manual composite.');
    L.push('This confirms 0x06EDAC is the single-call home-screen renderer.');
  } else {
    const pct = ((cmp.matching / LCD_PIXEL_COUNT) * 100).toFixed(2);
    L.push(`**DIFFERS** - ${cmp.differing} pixels differ (${pct}% match).`);
    L.push('0x06EDAC renders content that does not perfectly match the 5-stage composite.');
  }
  L.push('');

  return L.join('\n');
}

// --- Main ---

function main() {
  console.log('Phase 128 - 0x06EDAC Full-Screen Render Analysis');
  console.log('=================================================\n');

  console.log('Booting environment...');
  const env = buildEnvironment();
  console.log(`Boot complete. ROM: ${TRANSPILATION_META?.blockCount ?? '?'} blocks, ${TRANSPILATION_META?.coveragePercent ?? '?'}% coverage`);
  console.log(`  coldBoot: steps=${env.coldBoot.steps} term=${env.coldBoot.termination}`);
  console.log(`  osInit:   steps=${env.osInit.steps} term=${env.osInit.termination}`);
  console.log(`  postInit: steps=${env.postInit.steps} term=${env.postInit.termination}\n`);

  // Part A
  console.log('--- Part A: Run 0x06EDAC ---');
  const partA = runFullRender(env);
  console.log(`  Steps: ${partA.steps}`);
  console.log(`  Termination: ${partA.termination}`);
  console.log(`  Last PC: ${hex(partA.lastPc)} (${partA.lastMode})`);
  console.log(`  VRAM write count (bytes): ${partA.vramWriteCount}`);
  console.log(`  Non-sentinel pixels: ${partA.nonSentinelPixels}/${LCD_PIXEL_COUNT}`);
  console.log(`  Loops forced: ${partA.loopsForced}`);
  console.log(`  Missing blocks: ${partA.missingBlocks.length === 0 ? 'none' : partA.missingBlocks.join(', ')}\n`);

  // Part B - decode text from the 0x06EDAC render
  console.log('--- Part B: Text Decode ---');
  const savedVram = new Uint8Array(env.mem.slice(VRAM_BASE, VRAM_END));
  env.mem.set(partA.vramBytes, VRAM_BASE);
  const partB = decodeRegions(env.mem, env.romBytes);
  env.mem.set(savedVram, VRAM_BASE);

  for (const region of TEXT_REGIONS) {
    const data = partB[region.key];
    console.log(`  ${data.label}:`);
    for (const a of data.top3) {
      console.log(`    row=${a.startRow} col=${a.startCol}: "${a.text}" (${a.nonSpace} non-space)`);
    }
  }
  console.log('');

  // Part C - 5-stage composite + comparison
  console.log('--- Part C: 5-Stage Composite Comparison ---');
  const composite = runComposite(env);
  for (const s of composite.stages) {
    console.log(`  ${s.label}: steps=${s.steps ?? 'n/a'} term=${s.term}`);
  }

  const cmp = compareVrams(partA.pixels, composite.pixels);
  console.log(`  Matching pixels: ${cmp.matching}/${LCD_PIXEL_COUNT}`);
  console.log(`  Differing pixels: ${cmp.differing}/${LCD_PIXEL_COUNT}`);
  console.log('  Per-region:');
  for (const r of cmp.regionStats) {
    console.log(`    ${r.label}: match=${r.match} diff=${r.diff} (rows ${r.rowStart}-${r.rowEnd})`);
  }
  if (cmp.diffs.length > 0) {
    console.log('  First differing pixels:');
    for (const d of cmp.diffs) {
      console.log(`    pixel=${d.pixel} row=${d.row} col=${d.col} 06EDAC=${hex(d.a, 4)} composite=${hex(d.b, 4)}`);
    }
  }
  console.log('');

  // Part D - Write PNG
  console.log('--- Part D: PNG Output ---');
  env.mem.set(partA.vramBytes, VRAM_BASE);
  const rgba = vramToRgba(env.mem);
  env.mem.set(savedVram, VRAM_BASE);

  const pngBuf = encodeMinimalPng(LCD_WIDTH, LCD_HEIGHT, rgba);
  fs.writeFileSync(PNG_PATH, pngBuf);
  const pngSize = fs.statSync(PNG_PATH).size;
  console.log(`  Wrote ${PNG_PATH}`);
  console.log(`  PNG size: ${pngSize} bytes\n`);

  // Write report
  const report = buildReport(env, partA, partB, composite, cmp, pngSize);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`Report written to ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  const msg = error.stack || String(error);
  console.error(msg);
  const failReport = [
    '# Phase 128 - 0x06EDAC Full-Screen Render Analysis',
    '',
    'Generated by `probe-phase128-06edac-render.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    msg,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, failReport, 'utf8');
  process.exitCode = 1;
}
