#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const RENDERER = 0x054E21;
const COLOR_HELPER = 0x0553F0;
const FONT_LOOKUP = 0x07BF3E;
const GEOM_ROM = 0x05550C;
const GEOM_RAM = 0xD02FD9;
const GEOM_LEN = 13;

const VRAM_BASE = 0xD40000;
const VRAM_END = VRAM_BASE + (320 * 240 * 2);
const PEN_COL = 0xD008D2;
const PEN_ROW = 0xD008D5;
const GCUR_Y = 0xD02FD6;
const DISP_W = 0xD02FD9;
const DISP_H = 0xD02FDC;
const STRIDE = 0xD02FE0;
const VRAM_PTR = 0xD02FE3;
const DRAW_BG = 0xD026AA;
const DRAW_FG = 0xD026AC;
const WIDTH_MODE = 0xD005F4;
const OS_FLAGS = 0xD000C6;
const FONT_FLAGS = 0xD000B5;
const GLYPH_BUF = 0xD005A1;

const TEST_CHAR = 0x41;
const TRACE_SP = 0xD1A87E - 3;
const RET_SENTINEL = 0x00FFFFFE;

const NAMES = new Map([
  [PEN_COL, 'penCol'],
  [PEN_ROW, 'penRow'],
  [GCUR_Y, 'gCurYLoc'],
  [DISP_W, 'displayWidth'],
  [DISP_H, 'displayHeight'],
  [STRIDE, 'rowStride'],
  [VRAM_PTR, 'vramBase'],
  [DRAW_BG, 'drawBGColor'],
  [DRAW_FG, 'drawFGColor'],
  [WIDTH_MODE, 'widthMode'],
  [OS_FLAGS, 'osDisplayFlags'],
  [FONT_FLAGS, 'fontTranslateFlags'],
  [GLYPH_BUF, 'glyphBufferHeader'],
  [GLYPH_BUF + 4, 'glyphBitmap'],
]);

function hex(v, w = 6) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hb(v) { return hex((v ?? 0) & 0xFF, 2); }
function bhex(bytes) { return Array.from(bytes, (b) => hb(b)).join(' '); }
function r16(buf, a) { return (buf[a] | (buf[a + 1] << 8)) >>> 0; }
function r24(buf, a) { return (buf[a] | (buf[a + 1] << 8) | (buf[a + 2] << 16)) >>> 0; }
function w16(buf, a, v) { buf[a] = v & 0xFF; buf[a + 1] = (v >>> 8) & 0xFF; }
function w24(buf, a, v) { buf[a] = v & 0xFF; buf[a + 1] = (v >>> 8) & 0xFF; buf[a + 2] = (v >>> 16) & 0xFF; }
function sx8(v) { return v >= 0x80 ? v - 0x100 : v; }
function sis(addr, pfx) { return pfx === 'sis' && addr <= 0xFFFF ? ((0xD00000 | addr) >>> 0) : (addr >>> 0); }
function idx(reg, disp) { return `(${String(reg).toUpperCase()}${disp >= 0 ? '+' : ''}${disp})`; }

function desc(i) {
  const p = i.modePrefix ? `${String(i.modePrefix).toUpperCase()} ` : '';
  switch (i.tag) {
    case 'push': return `${p}PUSH ${String(i.pair ?? i.reg ?? i.src).toUpperCase()}`;
    case 'pop': return `${p}POP ${String(i.pair ?? i.reg ?? i.dest).toUpperCase()}`;
    case 'ld-pair-imm': return `${p}LD ${String(i.pair).toUpperCase()}, ${hex(i.value, i.value <= 0xFFFF ? 4 : 6)}`;
    case 'ld-pair-mem': return `${p}LD ${String(i.pair).toUpperCase()}, (${hex(sis(i.addr, i.modePrefix))})`;
    case 'ld-mem-pair': return `${p}LD (${hex(sis(i.addr, i.modePrefix))}), ${String(i.pair).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(i.dest).toUpperCase()}, (${hex(sis(i.addr, i.modePrefix))})`;
    case 'ld-reg-imm': return `${p}LD ${String(i.dest).toUpperCase()}, ${hb(i.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(i.dest).toUpperCase()}, ${String(i.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}LD ${String(i.dest).toUpperCase()}, (${String(i.indirectRegister ?? i.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(i.indirectRegister ?? i.dest).toUpperCase()}), ${String(i.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(i.dest).toUpperCase()}, ${idx(i.indexRegister, i.displacement)}`;
    case 'ld-ixd-reg': return `${p}LD ${idx(i.indexRegister, i.displacement)}, ${String(i.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${p}LD ${idx(i.indexRegister, i.displacement)}, ${hb(i.value)}`;
    case 'ld-pair-indexed': return `${p}LD ${String(i.pair).toUpperCase()}, ${idx(i.indexRegister, i.displacement)}`;
    case 'ld-indexed-pair': return `${p}LD ${idx(i.indexRegister, i.displacement)}, ${String(i.pair).toUpperCase()}`;
    case 'ld-sp-pair': return `${p}LD SP, ${String(i.pair ?? i.src ?? 'ix').toUpperCase()}`;
    case 'call': return `${p}CALL ${hex(i.target)}`;
    case 'jp': return `${p}JP ${hex(i.target)}`;
    case 'jp-conditional': return `${p}JP ${String(i.condition).toUpperCase()}, ${hex(i.target)}`;
    case 'jr': return `${p}JR ${hex(i.target)}`;
    case 'jr-conditional': return `${p}JR ${String(i.condition).toUpperCase()}, ${hex(i.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(i.condition).toUpperCase()}`;
    case 'inc-pair': return `${p}INC ${String(i.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(i.pair).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(i.reg).toUpperCase()}`;
    case 'add-pair': return `${p}ADD ${String(i.dest).toUpperCase()}, ${String(i.src).toUpperCase()}`;
    case 'adc-pair': return `${p}ADC HL, ${String(i.src).toUpperCase()}`;
    case 'sbc-pair': return `${p}SBC HL, ${String(i.src).toUpperCase()}`;
    case 'mlt': return `${p}MLT ${String(i.reg ?? i.pair).toUpperCase()}`;
    case 'alu-reg': return `${p}${String(i.op).toUpperCase()} ${String(i.src ?? i.reg).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(i.op).toUpperCase()} ${hb(i.value)}`;
    case 'alu-ixd': return `${p}${String(i.op).toUpperCase()} ${idx(i.indexRegister, i.displacement)}`;
    case 'ex-de-hl': return `${p}EX DE, HL`;
    case 'rotate-reg': return `${p}${String(i.op ?? 'RL').toUpperCase()} ${String(i.reg).toUpperCase()}`;
    case 'indexed-cb-bit': return `${p}BIT ${i.bit}, ${idx(i.indexRegister, i.displacement)}`;
    case 'indexed-cb-rotate': return `${p}${String(i.op ?? 'RL').toUpperCase()} ${idx(i.indexRegister, i.displacement)}`;
    case 'cpl': return `${p}CPL`;
    case 'rrca': return `${p}RRCA`;
    default: return `${p}[${i.tag}]`;
  }
}

function dec(pc) { try { return decodeInstruction(rom, pc, 'adl'); } catch { return null; } }
function next(i) { return i.nextPc ?? (i.pc + i.length); }
function cond(i) { return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(i.tag); }
function hard(i) { return ['jp', 'jp-indirect', 'jr', 'ret', 'reti', 'retn'].includes(i.tag); }

function walk(start) {
  const q = [start], queued = new Set(q), seen = new Set(), insts = new Map(), blocks = new Set([start]), calls = [];
  while (q.length) {
    const block = q.shift();
    if (seen.has(block)) continue;
    seen.add(block);
    let pc = block;
    while (pc >= 0 && pc < rom.length) {
      if (insts.has(pc)) break;
      const i = dec(pc);
      if (!i || !i.length) break;
      insts.set(pc, i);
      if (i.tag === 'call' || i.tag === 'call-conditional') {
        calls.push({ from: i.pc, to: i.target });
        const ft = i.fallthrough ?? next(i);
        blocks.add(ft);
        pc = ft;
        continue;
      }
      if (cond(i)) {
        if (i.target !== undefined) {
          blocks.add(i.target);
          if (!seen.has(i.target) && !queued.has(i.target)) { q.push(i.target); queued.add(i.target); }
        }
        const ft = i.fallthrough ?? next(i);
        blocks.add(ft);
        if (!seen.has(ft) && !queued.has(ft)) { q.push(ft); queued.add(ft); }
        break;
      }
      if (hard(i)) {
        if ((i.tag === 'jp' || i.tag === 'jr') && i.target !== undefined) {
          blocks.add(i.target);
          if (!seen.has(i.target) && !queued.has(i.target)) { q.push(i.target); queued.add(i.target); }
        }
        break;
      }
      pc = next(i);
    }
  }
  const ordered = [...insts.values()].sort((a, b) => a.pc - b.pc);
  const starts = [...blocks].filter((pc) => insts.has(pc)).sort((a, b) => a - b);
  return { ordered, starts, startSet: new Set(starts), calls };
}

function geom() {
  const raw = rom.subarray(GEOM_ROM, GEOM_ROM + GEOM_LEN);
  return { raw, w: r24(raw, 0), h: r24(raw, 3), unk: raw[6], stride: r24(raw, 7), base: r24(raw, 10) };
}

function name(addr) {
  if (NAMES.has(addr)) return NAMES.get(addr);
  if (addr >= GLYPH_BUF && addr < GLYPH_BUF + 0x24) return 'glyphBuffer';
  if (addr >= GEOM_RAM && addr < GEOM_RAM + GEOM_LEN) return 'displayGeometry';
  if (addr >= 0xD00500 && addr < 0xD00600) return 'D005xx';
  if (addr >= 0xD00800 && addr < 0xD00900) return 'D008xx';
  if (addr >= 0xD02600 && addr < 0xD02700) return 'D026xx';
  if (addr >= 0xD02F00 && addr < 0xD03000) return 'D02Fxx';
  return '';
}

function seed(mem) {
  mem.set(rom.subarray(GEOM_ROM, GEOM_ROM + GEOM_LEN), GEOM_RAM);
  mem.fill(0xAA, VRAM_BASE, VRAM_END);
  mem.fill(0x00, GLYPH_BUF, GLYPH_BUF + 0x30);
  w24(mem, PEN_COL, 0);
  mem[PEN_ROW] = 0;
  w24(mem, GCUR_Y, 0);
  w16(mem, DRAW_BG, 0x0000);
  w16(mem, DRAW_FG, 0xFFFF);
  mem[WIDTH_MODE] = 0xFF;
  mem[OS_FLAGS] = 0x00;
  mem[FONT_FLAGS] = 0x00;
}

function hook(cpu, ctx) {
  const o = {
    r8: cpu.read8.bind(cpu), r16: cpu.read16.bind(cpu), r24: cpu.read24.bind(cpu),
    w8: cpu.write8.bind(cpu), w16: cpu.write16.bind(cpu), w24: cpu.write24.bind(cpu),
  };
  const reads = [], writes = [], vram = [];
  const rec = (list, kind, addr, value, width) => list.push({ step: ctx.step, pc: ctx.pc, addr: addr & 0xFFFFFF, value, width, kind, n: name(addr & 0xFFFFFF) });
  const state = (addr) => addr >= 0xD00000 && addr < 0xD10000;
  cpu.read8 = (a) => { const v = o.r8(a); if (state(a)) rec(reads, 'r', a, v & 0xFF, 1); return v; };
  cpu.read16 = (a) => { const v = o.r16(a); if (state(a)) rec(reads, 'r', a, v & 0xFFFF, 2); return v; };
  cpu.read24 = (a) => { const v = o.r24(a); if (state(a)) rec(reads, 'r', a, v & 0xFFFFFF, 3); return v; };
  cpu.write8 = (a, v) => { o.w8(a, v); if (a >= VRAM_BASE && a < VRAM_END) rec(vram, 'w', a, v & 0xFF, 1); else if (state(a)) rec(writes, 'w', a, v & 0xFF, 1); };
  cpu.write16 = (a, v) => { o.w16(a, v); if (a >= VRAM_BASE && a < VRAM_END) rec(vram, 'w', a, v & 0xFFFF, 2); else if (state(a)) rec(writes, 'w', a, v & 0xFFFF, 2); };
  cpu.write24 = (a, v) => { o.w24(a, v); if (a >= VRAM_BASE && a < VRAM_END) rec(vram, 'w', a, v & 0xFFFFFF, 3); else if (state(a)) rec(writes, 'w', a, v & 0xFFFFFF, 3); };
  return { reads, writes, vram, off() { cpu.read8 = o.r8; cpu.read16 = o.r16; cpu.read24 = o.r24; cpu.write8 = o.w8; cpu.write16 = o.w16; cpu.write24 = o.w24; } };
}

function trace() {
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);
  seed(mem);

  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  const cpu = ex.cpu;
  cpu.a = 0; cpu.f = 0; cpu.bc = 0; cpu.de = 0; cpu.hl = 0; cpu.ix = 0; cpu.iy = 0xD00080;
  cpu.sp = TRACE_SP; cpu.madl = 1; cpu.mbase = 0xD0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.im = 0;

  w24(mem, cpu.sp, RET_SENTINEL);
  w24(mem, cpu.sp + 3, TEST_CHAR);
  w24(mem, cpu.sp + 6, 0);
  w24(mem, cpu.sp + 9, 0);

  const ctx = { step: 0, pc: RENDERER };
  const h = hook(cpu, ctx);
  const blocks = [], missing = [];
  let result;
  try {
    result = ex.runFrom(RENDERER, 'adl', {
      maxSteps: 4000,
      maxLoopIterations: 4096,
      onBlock: (pc, mode, meta, step) => {
        ctx.step = step + 1;
        ctx.pc = pc & 0xFFFFFF;
        blocks.push({ step: step + 1, pc: pc & 0xFFFFFF, mode, dasm: meta?.instructions?.[0]?.dasm ?? '(unknown)' });
      },
      onMissingBlock: (pc, mode, step) => missing.push({ pc, mode, step }),
    });
  } finally {
    h.off();
  }

  return { mem, result, blocks, missing, reads: h.reads, writes: h.writes, vram: h.vram };
}

function pixels(mem, vram) {
  const seen = new Set(), out = [];
  for (const e of vram) {
    const a = e.addr & 0xFFFFFE;
    if (a < VRAM_BASE || a + 1 >= VRAM_END || seen.has(a)) continue;
    seen.add(a);
    const off = a - VRAM_BASE;
    out.push({ addr: a, x: Math.floor((off % 640) / 2), y: Math.floor(off / 640), word: r16(mem, a) });
  }
  return out;
}

function glyph(mem) {
  const rows = [];
  const base = GLYPH_BUF + 4;
  for (let row = 0; row < 14; row += 1) {
    const b0 = mem[base + row * 2], b1 = mem[base + row * 2 + 1];
    const word = (b0 << 8) | b1;
    let bits = '';
    for (let bit = 15; bit >= 4; bit -= 1) bits += ((word >> bit) & 1) ? '#' : '.';
    rows.push({ row, b0, b1, bits });
  }
  rows.push({ row: 14, b0: mem[GLYPH_BUF + 0x20], b1: mem[GLYPH_BUF + 0x21], bits: '............', pad: true });
  return rows;
}

function summarize(events) {
  const map = new Map();
  for (const e of events) {
    const k = `${e.addr}:${e.width}`;
    if (!map.has(k)) map.set(k, { addr: e.addr, width: e.width, count: 0, first: e.step, last: e.value, n: e.n });
    const x = map.get(k);
    x.count += 1;
    x.last = e.value;
  }
  return [...map.values()].sort((a, b) => (b.count - a.count) || (a.addr - b.addr));
}

function fe(e) {
  const n = e.n ? ` [${e.n}]` : '';
  return `  step ${String(e.step).padStart(3)} ${hex(e.pc)} ${hex(e.addr)} w${e.width} ${e.kind === 'r' ? '=>' : '<='} ${hex(e.value, e.width * 2)}${n}`;
}

function helperPreview() {
  const out = [];
  let pc = COLOR_HELPER;
  while (pc <= 0x0553FA) {
    const i = dec(pc);
    if (!i) break;
    out.push(i);
    if (i.pc === 0x0553FA) break;
    pc = next(i);
  }
  return out;
}

const st = walk(RENDERER);
const g = geom();
const hp = helperPreview();
const tr = trace();
const px = pixels(tr.mem, tr.vram);
const gr = glyph(tr.mem);
const rs = summarize(tr.reads);

console.log('Phase 328: Fixed-width Home-Screen Renderer 0x054E21');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log();

console.log('=== 1. Static Disassembly / CFG ===');
console.log(`Reachable instructions: ${st.ordered.length}`);
console.log(`Basic blocks:           ${st.starts.length}`);
console.log(`Direct calls:           ${st.calls.length}`);
console.log();
for (const i of st.ordered) {
  if (st.startSet.has(i.pc)) console.log(`  [block ${hex(i.pc)}]`);
  console.log(`    ${hex(i.pc)}: ${bhex(rom.subarray(i.pc, i.pc + i.length)).padEnd(24)} ${desc(i)}`);
}
console.log();

console.log('=== 2. Geometry / State ===');
console.log(`Geometry template @ ${hex(GEOM_ROM)} -> ${hex(GEOM_RAM)}: ${bhex(g.raw)}`);
console.log(`  displayWidth=${g.w} displayHeight=${g.h} unknown=${hb(g.unk)} rowStride=${g.stride} vramBase=${hex(g.base)}`);
console.log(`  penCol=${hex(PEN_COL)} penRow=${hex(PEN_ROW)} gCurYLoc=${hex(GCUR_Y)}`);
console.log(`  drawBGColor=${hex(DRAW_BG)} drawFGColor=${hex(DRAW_FG)} widthMode=${hex(WIDTH_MODE)}`);
console.log(`  IY-relative state used here: BIT 2,(IY+70) -> ${hex(OS_FLAGS)}`);
console.log('  VRAM formula with D000C6 bit 2 clear: base + signExtend8(penRow)*640 + penCol*2, then + row*640 + bit*2.');
console.log(`  Calls fixed font lookup: ${st.calls.some((c) => c.to === FONT_LOOKUP) ? 'yes' : 'no'} at ${hex(0x054E45)}.`);
console.log('  Cursor advance: 0x054FAA..0x054FB3 adds 12 to D008D2.');
console.log();

console.log('0x0553F0 fast path preview:');
for (const i of hp) console.log(`  ${hex(i.pc)}: ${bhex(rom.subarray(i.pc, i.pc + i.length)).padEnd(20)} ${desc(i)}`);
console.log();

console.log('=== 3. Dynamic Trace Setup ===');
console.log(`arg0='A' (${hb(TEST_CHAR)}), arg1=0, arg2=0, return=${hex(RET_SENTINEL)}`);
console.log(`seed penCol=${hex(r24(tr.mem, PEN_COL))} penRow=${hb(tr.mem[PEN_ROW])} gCurYLoc=${hex(r24(tr.mem, GCUR_Y))}`);
console.log(`seed drawBG=${hex(r16(tr.mem, DRAW_BG), 4)} drawFG=${hex(r16(tr.mem, DRAW_FG), 4)} widthMode=${hb(tr.mem[WIDTH_MODE])}`);
console.log(`seed D000C6=${hb(tr.mem[OS_FLAGS])} D000B5=${hb(tr.mem[FONT_FLAGS])}`);
console.log();

console.log('=== 4. Dynamic Trace Result ===');
console.log(`termination=${tr.result.termination} steps=${tr.result.steps} lastPc=${hex(tr.result.lastPc ?? 0)}`);
if (tr.result.error) console.log(`error=${tr.result.error.message}`);
if (tr.missing.length) for (const m of tr.missing) console.log(`missing block: step ${m.step} ${hex(m.pc)} ${m.mode}`);
console.log();
console.log('Blocks visited:');
for (const b of tr.blocks) console.log(`  step ${String(b.step).padStart(3)} ${hex(b.pc)} ${b.dasm}`);
console.log();

console.log(`Glyph buffer D005A1..D005C4: ${bhex(tr.mem.subarray(GLYPH_BUF, GLYPH_BUF + 0x24))}`);
for (const row of gr) console.log(`  row ${String(row.row).padStart(2)}: ${row.bits}  ${hb(row.b0)} ${hb(row.b1)}${row.pad ? ' ; zero padding row from D005C1/C2' : ''}`);
console.log();

console.log(`VRAM byte writes (${tr.vram.length} events):`);
for (const e of tr.vram) console.log(fe(e));
console.log();

console.log(`Touched 16bpp pixels (${px.length} unique destinations):`);
for (const p of px) console.log(`  ${hex(p.addr)} x=${p.x} y=${p.y} word=${hex(p.word, 4)}`);
console.log();

console.log(`Tracked RAM reads (${tr.reads.length} events):`);
for (const e of tr.reads) console.log(fe(e));
console.log();

console.log('RAM read summary:');
for (const s of rs) console.log(`  ${hex(s.addr)} w${s.width} count=${s.count} firstStep=${s.first} last=${hex(s.last, s.width * 2)}${s.n ? ` [${s.n}]` : ''}`);
console.log();

console.log(`Tracked RAM writes (${tr.writes.length} events):`);
for (const e of tr.writes) console.log(fe(e));
console.log();

console.log('=== 5. Answers ===');
console.log(`How many instructions / basic blocks? ${st.ordered.length} instructions, ${st.starts.length} basic blocks.`);
console.log(`What VRAM addresses does it write to? ${px.length ? `${hex(px[0].addr)} .. ${hex(px[px.length - 1].addr)} in this row-0/col-0 trace` : 'no VRAM writes observed'}. Full byte log is above.`);
console.log('How does it compute VRAM addresses? It sign-extends D008D5, multiplies by D02FE0 (=640), adds D008D2 twice when D000C6 bit 2 is clear, then adds D02FE3 (=0xD40000).');
console.log('Where does it get cursor row/column from? Column is D008D2 penCol, row is D008D5 penRow, and D02FD6 gCurYLoc is the vertical clip floor. No IY-relative cursor slot is used.');
console.log(`Does it call 0x07BF3E internally? ${st.calls.some((c) => c.to === FONT_LOOKUP) ? 'Yes' : 'No'}.`);
console.log('How does it render the 28-byte glyph? It skips the 4-byte header, consumes two bytes per row into a shift register, rotates once per pixel, and chooses drawFGColor vs drawBGColor from the carry result. It iterates 15 rows: 14 glyph rows plus one zero padding row.');
console.log('Does it advance the cursor? Yes, by 12 pixels via D008D2.');
console.log(`What colors does it use? Background from ${hex(DRAW_BG)} and foreground from ${hex(DRAW_FG)}. In this trace BG=${hex(r16(tr.mem, DRAW_BG), 4)} FG=${hex(r16(tr.mem, DRAW_FG), 4)}.`);
