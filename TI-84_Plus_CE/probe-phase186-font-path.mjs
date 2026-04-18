#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase186-report.md');

const MEM_SIZE = 0x1000000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;
const MASK24 = 0xFFFFFF;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE1_ENTRY = 0x0A2B72;
const STAGE3_ENTRY = 0x0A29EC;

const STACK_RESET_TOP = 0xD1A87E;
const IX_RESET = 0xD1A860;
const IY_RESET = 0xD00080;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const DISPLAY_BUF = 0xD006C0;
const DISPLAY_LEN = 64;
const DISPLAY_TEXT = 'ABCDE';
const CELL_WIDTH = 12;
const CELL_COUNT = DISPLAY_TEXT.length;

const MODE_BUF = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';

const GLYPH_BUF = 0xD005A1;
const GLYPH_LEN = 28;
const GLYPH_END = GLYPH_BUF + GLYPH_LEN - 1;
const GLYPH_STRIDE = 28;

const FONT_PTR = 0xD00585;
const FONT_PTR2 = 0xD00588;
const FONT_PTR_END = FONT_PTR + 2;
const ROM_FONT_BASE = 0x0040EE;
const HARD_FONT_BASE = 0x003D6E;

const FONT_COPY_BLOCK = 0x07BF61;
const SUSPECT_BLOCKS = [0x0A1854, 0x0A1969];
const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(JS_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const ADL_BLOCKS = Object.keys(BLOCKS)
  .map((key) => key.split(':'))
  .filter((parts) => parts[1] === 'adl')
  .map((parts) => parseInt(parts[0], 16))
  .filter((value) => Number.isFinite(value))
  .sort((a, b) => a - b);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function printable(code) {
  if (!Number.isInteger(code)) return '?';
  if (code >= 0x20 && code <= 0x7E) return String.fromCharCode(code);
  return '.';
}

function read24LE(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24LE(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >> 8) & 0xFF;
  mem[addr + 2] = (value >> 16) & 0xFF;
}

function snapCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snap, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snap)) cpu[field] = value;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._ix = IX_RESET;
  cpu._iy = IY_RESET;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_SIZE);
}

function clearGlyph(mem) {
  mem.fill(0x00, GLYPH_BUF, GLYPH_BUF + GLYPH_LEN);
}

function seedMode(mem) {
  for (let i = 0; i < MODE_TEXT.length; i += 1) mem[MODE_BUF + i] = MODE_TEXT.charCodeAt(i);
}

function seedDisplay(mem) {
  mem.fill(0x20, DISPLAY_BUF, DISPLAY_BUF + DISPLAY_LEN);
  for (let i = 0; i < DISPLAY_TEXT.length; i += 1) mem[DISPLAY_BUF + i] = DISPLAY_TEXT.charCodeAt(i);
}

function readPixel(mem, row, col) {
  const addr = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[addr] | (mem[addr + 1] << 8);
}

function pixelSymbol(pixel) {
  if (pixel === VRAM_SENTINEL) return ' ';
  if (pixel === WHITE_PIXEL) return '.';
  return '#';
}

function countStripFg(mem) {
  let count = 0;
  for (let row = STRIP_ROW_START; row <= STRIP_ROW_END; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) count += 1;
    }
  }
  return count;
}

function initEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = IY_RESET;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernel,
    post,
    ramSnap: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnap: snapCpu(cpu),
  };
}

function applySeeds(mem, seeds) {
  for (const seed of seeds) write24LE(mem, seed.addr, seed.value);
}

function prepStage3(env, seeds = []) {
  env.mem.set(env.ramSnap, RAM_START);
  clearVram(env.mem);
  clearGlyph(env.mem);
  seedMode(env.mem);
  seedDisplay(env.mem);
  applySeeds(env.mem, seeds);
  restoreCpu(env.cpu, env.cpuSnap, env.mem);

  const stage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });

  clearVram(env.mem);
  clearGlyph(env.mem);
  seedMode(env.mem);
  seedDisplay(env.mem);
  applySeeds(env.mem, seeds);
  restoreCpu(env.cpu, env.cpuSnap, env.mem);

  return stage1;
}

function installTrace(cpu) {
  const state = { pc: null, step: 0 };
  const vramWrites = [];
  const glyphWrites = [];
  const glyphReads = [];
  const pointerReads = [];

  const r8 = cpu.read8.bind(cpu);
  const r16 = cpu.read16.bind(cpu);
  const r24 = cpu.read24.bind(cpu);
  const w8 = cpu.write8.bind(cpu);
  const w16 = cpu.write16.bind(cpu);
  const w24 = cpu.write24.bind(cpu);

  function setContext(step, pc) {
    state.step = step;
    state.pc = pc === null ? null : pc & MASK24;
  }

  function recordRange(list, start, end, addr, width, value) {
    const base = addr & MASK24;
    for (let i = 0; i < width; i += 1) {
      const current = base + i;
      if (current < start || current > end) continue;
      list.push({
        step: state.step,
        pc: state.pc,
        addr: current,
        offset: current - start,
        value: (value >> (i * 8)) & 0xFF,
      });
    }
  }

  function recordVram(addr, width, value) {
    const base = addr & MASK24;
    if (base < VRAM_BASE || base >= VRAM_BASE + VRAM_SIZE) return;
    const vramOffset = base - VRAM_BASE;
    const pixelIndex = Math.floor(vramOffset / 2);
    vramWrites.push({
      step: state.step,
      pc: state.pc,
      width,
      value: value & (width === 1 ? 0xFF : width === 2 ? 0xFFFF : 0xFFFFFF),
      vramOffset,
      row: Math.floor(pixelIndex / VRAM_WIDTH),
      col: pixelIndex % VRAM_WIDTH,
    });
  }

  cpu.read8 = (addr) => {
    const value = r8(addr);
    recordRange(pointerReads, FONT_PTR, FONT_PTR_END, addr, 1, value);
    recordRange(glyphReads, GLYPH_BUF, GLYPH_END, addr, 1, value);
    return value;
  };
  cpu.read16 = (addr) => {
    const value = r16(addr);
    recordRange(pointerReads, FONT_PTR, FONT_PTR_END, addr, 2, value);
    recordRange(glyphReads, GLYPH_BUF, GLYPH_END, addr, 2, value);
    return value;
  };
  cpu.read24 = (addr) => {
    const value = r24(addr);
    recordRange(pointerReads, FONT_PTR, FONT_PTR_END, addr, 3, value);
    recordRange(glyphReads, GLYPH_BUF, GLYPH_END, addr, 3, value);
    return value;
  };
  cpu.write8 = (addr, value) => {
    recordVram(addr, 1, value);
    recordRange(glyphWrites, GLYPH_BUF, GLYPH_END, addr, 1, value);
    return w8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    recordVram(addr, 2, value);
    recordRange(glyphWrites, GLYPH_BUF, GLYPH_END, addr, 2, value);
    return w16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    recordVram(addr, 3, value);
    recordRange(glyphWrites, GLYPH_BUF, GLYPH_END, addr, 3, value);
    return w24(addr, value);
  };

  return {
    glyphReads,
    glyphWrites,
    pointerReads,
    setContext,
    vramWrites,
    restore() {
      cpu.read8 = r8;
      cpu.read16 = r16;
      cpu.read24 = r24;
      cpu.write8 = w8;
      cpu.write16 = w16;
      cpu.write24 = w24;
    },
  };
}

function topPcs(entries, rowMin, rowMax, colMin, colMax) {
  const counts = new Map();
  for (const entry of entries) {
    if (entry.row < rowMin || entry.row > rowMax) continue;
    if (entry.col < colMin || entry.col > colMax) continue;
    const key = entry.pc ?? -1;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pc, count]) => ({ pc: pc < 0 ? null : pc, count }))
    .sort((a, b) => b.count - a.count || (a.pc ?? 0) - (b.pc ?? 0))
    .slice(0, 5);
}

function cellSummary(mem, writes) {
  const maxCol = CELL_COUNT * CELL_WIDTH - 1;
  let rowMin = null;
  let rowMax = null;
  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      if (readPixel(mem, row, col) === VRAM_SENTINEL) continue;
      rowMin = rowMin === null ? row : Math.min(rowMin, row);
      rowMax = rowMax === null ? row : Math.max(rowMax, row);
    }
  }

  if (rowMin === null) return { rowMin: null, rowMax: null, cells: [], patterns: [] };

  const sigToId = new Map();
  const patterns = [];
  const cells = [];
  let nextId = 1;

  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const colMin = cell * CELL_WIDTH;
    const colMax = colMin + CELL_WIDTH - 1;
    const rows = [];
    let drawn = 0;
    let fg = 0;

    for (let row = rowMin; row <= rowMax; row += 1) {
      let text = '';
      for (let col = colMin; col <= colMax; col += 1) {
        const pixel = readPixel(mem, row, col);
        text += pixelSymbol(pixel);
        if (pixel !== VRAM_SENTINEL) drawn += 1;
        if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) fg += 1;
      }
      rows.push(text);
    }

    const signature = rows.join('|');
    if (!sigToId.has(signature)) {
      const id = `P${nextId}`;
      nextId += 1;
      sigToId.set(signature, id);
      patterns.push({ id, rows, signature });
    }

    cells.push({
      cell,
      char: DISPLAY_TEXT[cell],
      colMin,
      colMax,
      drawn,
      fg,
      pattern: sigToId.get(signature),
      rows,
      signature,
      pcs: topPcs(writes, rowMin, rowMax, colMin, colMax),
    });
  }

  return { rowMin, rowMax, cells, patterns };
}

function groupGlyphWrites(glyphWrites, copies) {
  const groups = new Map();
  for (const entry of glyphWrites) {
    const key = `${entry.step}:${entry.pc}`;
    if (!groups.has(key)) {
      groups.set(key, { step: entry.step, pc: entry.pc, bytes: new Uint8Array(GLYPH_LEN) });
    }
    groups.get(key).bytes[entry.offset] = entry.value;
  }

  return [...groups.values()]
    .sort((a, b) => a.step - b.step || (a.pc ?? 0) - (b.pc ?? 0))
    .map((group, index) => {
      const copy = copies.find((entry) => entry.step === group.step && entry.pc === group.pc) ?? null;
      return {
        batch: index,
        step: group.step,
        pc: group.pc,
        charCode: copy?.charCode ?? null,
        char: printable(copy?.charCode ?? null),
        source: copy?.source ?? null,
        signature: bytesToHex(group.bytes),
      };
    });
}

function decodeBlock(startPc) {
  const next = ADL_BLOCKS.find((value) => value > startPc) ?? Number.POSITIVE_INFINITY;
  const rows = [];
  let pc = startPc;
  while (rows.length < 12 && pc < next && pc < romBytes.length) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      break;
    }
    if (!inst || !inst.length) break;
    rows.push({ pc, bytes: romBytes.slice(pc, pc + inst.length), text: inst.dasm || inst.mnemonic || inst.tag });
    pc = inst.nextPc;
  }
  return rows;
}

function runScenario(env, label, seeds = []) {
  const stage1 = prepStage3(env, seeds);
  const trace = installTrace(env.cpu);
  const copies = [];

  const stage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      const step = steps + 1;
      const blockPc = pc & MASK24;
      trace.setContext(step, blockPc);
      if (blockPc !== FONT_COPY_BLOCK) return;
      const de = env.cpu._de & MASK24;
      const hl = env.cpu._hl & MASK24;
      copies.push({
        step,
        pc: blockPc,
        charCode: de % GLYPH_STRIDE === 0 ? Math.floor(de / GLYPH_STRIDE) : null,
        source: (hl + de) & MASK24,
      });
    },
  });

  trace.restore();

  return {
    label,
    stage1,
    stage3,
    stripFg: countStripFg(env.mem),
    finalPtr: read24LE(env.mem, FONT_PTR),
    finalPtr2: read24LE(env.mem, FONT_PTR2),
    finalPtrBytes: Array.from(env.mem.slice(FONT_PTR, FONT_PTR + 3)),
    finalPtr2Bytes: Array.from(env.mem.slice(FONT_PTR2, FONT_PTR2 + 3)),
    finalGlyph: new Uint8Array(env.mem.slice(GLYPH_BUF, GLYPH_BUF + GLYPH_LEN)),
    vramWrites: trace.vramWrites,
    pointerReads: trace.pointerReads,
    glyphWrites: trace.glyphWrites,
    glyphReads: trace.glyphReads,
    cells: cellSummary(env.mem, trace.vramWrites),
    glyphBatches: groupGlyphWrites(trace.glyphWrites, copies),
  };
}

function rawVramLog(entry) {
  return JSON.stringify({
    pc: hex(entry.pc),
    vramOffset: hex(entry.vramOffset),
    row: entry.row,
    col: entry.col,
    value: hex(entry.value, entry.width * 2),
  });
}

function rawPtrLog(entry) {
  return JSON.stringify({ pc: hex(entry.pc), addr: hex(entry.addr), value: hex(entry.value, 2), step: entry.step });
}

function rawGlyphLog(entry) {
  return JSON.stringify({ pc: hex(entry.pc), offset: entry.offset, value: hex(entry.value, 2), step: entry.step });
}

function pcsText(items) {
  if (items.length === 0) return 'none';
  return items.map((item) => `${hex(item.pc)} x${item.count}`).join(', ');
}

function buildReport(env, base, variants) {
  const lines = [];
  const glyphSet = new Set(base.glyphBatches.slice(0, CELL_COUNT).map((entry) => entry.signature)).size;
  const cellSet = new Set(base.cells.cells.map((entry) => entry.signature)).size;

  lines.push('# Phase 186 - Font Path Probe');
  lines.push('');
  lines.push(`- Boot: ${env.boot.termination}`);
  lines.push(`- Kernel init: ${env.kernel.termination}`);
  lines.push(`- Post-init: ${env.post.termination}`);
  lines.push(`- Stage 1: ${base.stage1.termination}`);
  lines.push(`- Stage 3: ${base.stage3.termination} @ ${hex(base.stage3.lastPc)}`);
  lines.push(`- Strip fg: ${base.stripFg}`);
  lines.push(`- Final ${hex(FONT_PTR)}: ${bytesToHex(base.finalPtrBytes)} -> ${hex(base.finalPtr)}`);
  lines.push(`- Final ${hex(FONT_PTR2)}: ${bytesToHex(base.finalPtr2Bytes)} -> ${hex(base.finalPtr2)}`);
  lines.push('');
  lines.push('## Part A - VRAM');
  lines.push('');
  lines.push(`- VRAM write calls: ${base.vramWrites.length}`);
  if (base.cells.rowMin === null) {
    lines.push('- No pixels written in the first five cells.');
  } else {
    lines.push(`- Rows touched in the first five cells: ${base.cells.rowMin}-${base.cells.rowMax}`);
  }
  lines.push('');
  lines.push('| Cell | Char | Cols | Pattern | Drawn | FG | Top PCs |');
  lines.push('|---:|---:|---|---|---:|---:|---|');
  for (const cell of base.cells.cells) {
    lines.push(`| ${cell.cell} | \`${cell.char}\` | ${cell.colMin}-${cell.colMax} | ${cell.pattern} | ${cell.drawn} | ${cell.fg} | ${pcsText(cell.pcs)} |`);
  }
  lines.push('');
  for (const pattern of base.cells.patterns) {
    lines.push(`### ${pattern.id}`);
    lines.push('');
    lines.push('```text');
    for (const row of pattern.rows) lines.push(row);
    lines.push('```');
    lines.push('');
  }
  lines.push('## Part B - D00585 Reads');
  lines.push('');
  if (base.pointerReads.length === 0) {
    lines.push(`- No reads from ${hex(FONT_PTR)}-${hex(FONT_PTR_END)}.`);
  } else {
    for (const entry of base.pointerReads) lines.push(`- ${rawPtrLog(entry)}`);
  }
  lines.push('');
  lines.push('## Part C - Glyph Buffer');
  lines.push('');
  lines.push(`- Final glyph bytes: ${bytesToHex(base.finalGlyph)}`);
  lines.push(`- Glyph write bytes: ${base.glyphWrites.length}`);
  lines.push(`- Glyph read bytes: ${base.glyphReads.length}`);
  lines.push('');
  lines.push('| Batch | Step | PC | Char | Source | Signature |');
  lines.push('|---:|---:|---|---:|---|---|');
  for (const entry of base.glyphBatches.slice(0, 12)) {
    const charText = entry.charCode === null ? 'n/a' : `${hex(entry.charCode, 2)} (${entry.char})`;
    lines.push(`| ${entry.batch} | ${entry.step} | ${hex(entry.pc)} | ${charText} | ${hex(entry.source)} | \`${entry.signature}\` |`);
  }
  lines.push('');
  lines.push('## Suspect Blocks');
  lines.push('');
  for (const blockPc of SUSPECT_BLOCKS) {
    lines.push(`### ${hex(blockPc)}`);
    lines.push('');
    lines.push('```text');
    for (const row of decodeBlock(blockPc)) lines.push(`${hex(row.pc)}  ${bytesToHex(row.bytes).padEnd(16)}  ${row.text}`);
    lines.push('```');
    lines.push('');
  }
  lines.push('## Part D - Pointer Variants');
  lines.push('');
  lines.push('| Variant | Strip FG | Final D00585 | Final D00588 |');
  lines.push('|---|---:|---|---|');
  for (const variant of variants) lines.push(`| ${variant.label} | ${variant.stripFg} | ${hex(variant.finalPtr)} | ${hex(variant.finalPtr2)} |`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  if (glyphSet > 1) {
    lines.push(`- A-E produce ${glyphSet} distinct 28-byte glyph signatures, so ${hex(FONT_COPY_BLOCK)} is receiving different glyphs.`);
  } else {
    lines.push(`- A-E collapse before the glyph buffer; inspect the source path into ${hex(FONT_COPY_BLOCK)}.`);
  }
  if (cellSet > 1) {
    lines.push(`- A-E also produce ${cellSet} distinct VRAM cell patterns. The renderer still differentiates cells.`);
  } else {
    lines.push(`- A-E collapse to one VRAM pattern. Differentiation is being lost after the glyph buffer is filled.`);
    lines.push('- The first post-copy readers are the 0x0A1854 / 0x0A1969 pair. Focus on `LD A,(IX+0)` and the rotate/xor logic immediately after it.');
  }
  if (base.pointerReads.length === 0) lines.push(`- No stage-3 reads touched ${hex(FONT_PTR)}-${hex(FONT_PTR_END)}.`);
  return `${lines.join('\n')}\n`;
}

function printScenario(base, variants, env) {
  console.log('=== Phase 186 - Font Path Probe ===');
  console.log(`Boot=${env.boot.termination} Kernel=${env.kernel.termination} Post=${env.post.termination}`);
  console.log(`Stage1=${base.stage1.termination} Stage3=${base.stage3.termination} lastPc=${hex(base.stage3.lastPc)} stripFg=${base.stripFg}`);
  console.log(`Final ${hex(FONT_PTR)}=${bytesToHex(base.finalPtrBytes)} -> ${hex(base.finalPtr)}`);
  console.log(`Final ${hex(FONT_PTR2)}=${bytesToHex(base.finalPtr2Bytes)} -> ${hex(base.finalPtr2)}`);
  console.log('');
  console.log('=== Part A - Cell Summary ===');
  for (const cell of base.cells.cells) console.log(`cell=${cell.cell} char=${cell.char} pattern=${cell.pattern} drawn=${cell.drawn} fg=${cell.fg} pcs=${pcsText(cell.pcs)}`);
  for (const pattern of base.cells.patterns) {
    console.log(`pattern=${pattern.id}`);
    for (const row of pattern.rows) console.log(row);
  }
  console.log('');
  console.log('=== Part A - Raw VRAM Writes ===');
  for (const entry of base.vramWrites) console.log(rawVramLog(entry));
  console.log('');
  console.log('=== Part B - D00585 Reads ===');
  if (base.pointerReads.length === 0) console.log('none');
  for (const entry of base.pointerReads) console.log(rawPtrLog(entry));
  console.log('');
  console.log('=== Part C - Glyph Writes ===');
  for (const entry of base.glyphWrites) console.log(rawGlyphLog(entry));
  console.log('');
  console.log('=== Part C - Glyph Batches ===');
  for (const entry of base.glyphBatches) console.log(`batch=${entry.batch} step=${entry.step} pc=${hex(entry.pc)} char=${hex(entry.charCode, 2)} (${entry.char}) source=${hex(entry.source)} signature=${entry.signature}`);
  console.log('');
  console.log('=== Part D - Pointer Variants ===');
  for (const variant of variants) console.log(`${variant.label}: stripFg=${variant.stripFg} final85=${hex(variant.finalPtr)} final88=${hex(variant.finalPtr2)}`);
  console.log('');
  console.log(`Report written to ${REPORT_PATH}`);
}

const env = initEnv();
const baseline = runScenario(env, 'baseline', []);
const variants = [
  runScenario(env, 'font_table_dual_seed', [
    { addr: FONT_PTR, value: ROM_FONT_BASE },
    { addr: FONT_PTR2, value: ROM_FONT_BASE },
  ]),
  runScenario(env, 'hardcoded_base_primary_seed', [
    { addr: FONT_PTR, value: HARD_FONT_BASE },
  ]),
];

fs.writeFileSync(REPORT_PATH, buildReport(env, baseline, variants));
printScenario(baseline, variants, env);
