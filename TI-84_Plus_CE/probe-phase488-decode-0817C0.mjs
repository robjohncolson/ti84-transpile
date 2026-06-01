#!/usr/bin/env node
/**
 * probe-phase488-decode-0817C0.mjs
 *
 * Decodes ROM region 0x0817C0-0x0818E7: the real text cursor blink routine.
 * Session 487 identified this as the strongest candidate for cursor blink:
 * references D00595+D00596 x2, calls both rendering functions x2 each.
 *
 * Goals:
 *   1. Full disassembly of the region from raw ROM bytes
 *   2. Identify how D00595/D00596 compute cursor VRAM position
 *   3. Identify glyph codes passed to 0x0A23C0
 *   4. Determine why two calls each (XOR blink draw+erase?)
 *   5. Dynamic test at 3 cursor positions with VRAM capture
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// Key addresses
const A = {
  cursorBlink: 0x0817C0,
  regionEnd: 0x0818E8,
  glyphRenderer: 0x0A23C0,
  pixelWriter: 0x0A239E,
  cursorRow: 0xD00595,
  cursorCol: 0xD00596,
  scratchCol: 0xD0059C,
  cursorStyle: 0xD00092,
  glyphSelector: 0x030202,
  iyBase: 0xD00080,
  vramBase: 0xD40000,
  rowStride: 640,        // 320 pixels * 2 bytes/pixel
  eventLoop: 0x02FDBE,
};

// ─── ROM byte helpers ───

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return '??????';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null) return '??';
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function byteAt(addr) {
  if (addr < 0 || addr >= rom.length) return undefined;
  return rom[addr];
}

function u24At(addr) {
  const b0 = byteAt(addr);
  const b1 = byteAt(addr + 1);
  const b2 = byteAt(addr + 2);
  if (b0 === undefined || b1 === undefined || b2 === undefined) return undefined;
  return b0 | (b1 << 8) | (b2 << 16);
}

function i8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function formatBytes(start, length) {
  const parts = [];
  for (let pc = Math.max(0, start); pc < Math.min(rom.length, start + length); pc += 1) {
    parts.push(hex8(byteAt(pc)));
  }
  return parts.join(' ');
}

function cbText(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const x = op >>> 6;
  const y = (op >>> 3) & 0x07;
  const z = op & 0x07;
  if (x === 0) {
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${rot[y]} ${regs[z]}`;
  }
  if (x === 1) return `BIT ${y},${regs[z]}`;
  if (x === 2) return `RES ${y},${regs[z]}`;
  return `SET ${y},${regs[z]}`;
}

function decodeAt(pc) {
  const op = byteAt(pc);
  if (op === undefined) return { len: 1, text: '<outside ROM>' };

  const single = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B',
    0x05: 'DEC B', 0x07: 'RLCA', 0x08: "EX AF,AF'", 0x09: 'ADD HL,BC',
    0x0A: 'LD A,(BC)', 0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C',
    0x0F: 'RRCA', 0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D',
    0x15: 'DEC D', 0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)',
    0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA',
    0x29: 'ADD HL,HL', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L',
    0x2F: 'CPL', 0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)',
    0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3B: 'DEC SP', 0x3C: 'INC A',
    0x3D: 'DEC A', 0x3F: 'CCF', 0x76: 'HALT', 0xC9: 'RET', 0xD9: 'EXX',
    0xE3: 'EX (SP),HL', 0xE9: 'JP (HL)', 0xEB: 'EX DE,HL', 0xF3: 'DI',
    0xF9: 'LD SP,HL', 0xFB: 'EI',
  };
  if (single[op]) return { len: 1, text: single[op] };

  if (op >= 0x40 && op <= 0x7F) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, text: `LD ${regs[(op >>> 3) & 0x07]},${regs[op & 0x07]}` };
  }
  if (op >= 0x80 && op <= 0xBF) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    return { len: 1, text: `${alu[(op >>> 3) & 0x07]} ${regs[op & 0x07]}` };
  }

  const immediate8 = {
    0x06: 'LD B', 0x0E: 'LD C', 0x16: 'LD D', 0x1E: 'LD E',
    0x26: 'LD H', 0x2E: 'LD L', 0x36: 'LD (HL)', 0x3E: 'LD A',
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP',
    0xDB: 'IN A', 0xD3: 'OUT',
  };
  if (immediate8[op]) return { len: 2, text: `${immediate8[op]},${hex(byteAt(pc + 1), 2)}` };

  const immediate24 = {
    0x01: 'LD BC', 0x11: 'LD DE', 0x21: 'LD HL', 0x31: 'LD SP',
    0x22: 'LD (addr),HL', 0x2A: 'LD HL,(addr)',
    0x32: 'LD (addr),A', 0x3A: 'LD A,(addr)',
  };
  if (immediate24[op]) return { len: 4, text: `${immediate24[op].replace('addr', hex(u24At(pc + 1)))}` };

  if (op === 0x18 || op === 0x10 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const names = { 0x18: 'JR', 0x10: 'DJNZ', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = (pc + 2 + i8(byteAt(pc + 1))) & 0xFFFFFF;
    return { len: 2, text: `${names[op]} ${hex(target)}` };
  }

  if (op === 0xCD || op === 0xC3) {
    return { len: 4, text: `${op === 0xCD ? 'CALL' : 'JP'} ${hex(u24At(pc + 1))}` };
  }

  const callCc = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
  if (callCc[op]) return { len: 4, text: `CALL ${callCc[op]},${hex(u24At(pc + 1))}` };

  const jpCc = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
  if (jpCc[op]) return { len: 4, text: `JP ${jpCc[op]},${hex(u24At(pc + 1))}` };

  const cc = { 0xC0: 'NZ', 0xC8: 'Z', 0xD0: 'NC', 0xD8: 'C', 0xE0: 'PO', 0xE8: 'PE', 0xF0: 'P', 0xF8: 'M' };
  if (cc[op]) return { len: 1, text: `RET ${cc[op]}` };

  const pushPop = {
    0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
    0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF',
  };
  if (pushPop[op]) return { len: 1, text: pushPop[op] };

  if (op === 0xCB) return { len: 2, text: `CB ${cbText(byteAt(pc + 1))}` };

  if (op === 0xED) {
    const op2 = byteAt(pc + 1);
    const edMem = {
      0x43: 'LD (addr),BC', 0x4B: 'LD BC,(addr)',
      0x53: 'LD (addr),DE', 0x5B: 'LD DE,(addr)',
      0x63: 'LD (addr),HL', 0x6B: 'LD HL,(addr)',
      0x73: 'LD (addr),SP', 0x7B: 'LD SP,(addr)',
    };
    if (edMem[op2]) return { len: 5, text: `ED ${edMem[op2].replace('addr', hex(u24At(pc + 2)))}` };

    const edSingle = {
      0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
      0x4D: 'RETI', 0x56: 'IM 1', 0x57: 'LD A,I', 0x5E: 'IM 2', 0x5F: 'LD A,R',
      0x67: 'RRD', 0x6F: 'RLD',
      0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
      0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
      0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
      0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
    };
    if (edSingle[op2]) return { len: 2, text: `ED ${edSingle[op2]}` };
    return { len: 2, text: `ED ${hex(op2, 2)}` };
  }

  if (op === 0xDD || op === 0xFD) {
    const index = op === 0xDD ? 'IX' : 'IY';
    const op2 = byteAt(pc + 1);
    if (op2 === 0x21) return { len: 4, text: `LD ${index},${hex(u24At(pc + 2))}` };
    if (op2 === 0xE5) return { len: 2, text: `PUSH ${index}` };
    if (op2 === 0xE1) return { len: 2, text: `POP ${index}` };
    if (op2 === 0x09) return { len: 2, text: `ADD ${index},BC` };
    if (op2 === 0x19) return { len: 2, text: `ADD ${index},DE` };
    if (op2 === 0x29) return { len: 2, text: `ADD ${index},${index}` };
    if (op2 === 0x39) return { len: 2, text: `ADD ${index},SP` };
    if (op2 === 0x23) return { len: 2, text: `INC ${index}` };
    if (op2 === 0x2B) return { len: 2, text: `DEC ${index}` };
    if (op2 === 0xE9) return { len: 2, text: `JP (${index})` };
    // LD r,(IX+d) / LD (IX+d),r / ALU (IX+d)
    const ixLoad = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
    if (ixLoad[op2]) {
      const d = i8(byteAt(pc + 2));
      const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
      return { len: 3, text: `LD ${ixLoad[op2]},(${index}${dStr})` };
    }
    if (op2 >= 0x70 && op2 <= 0x77 && op2 !== 0x76) {
      const src = ['B', 'C', 'D', 'E', 'H', 'L', '?', 'A'][op2 & 7];
      const d = i8(byteAt(pc + 2));
      const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
      return { len: 3, text: `LD (${index}${dStr}),${src}` };
    }
    const ixAlu = { 0x86: 'ADD A', 0x8E: 'ADC A', 0x96: 'SUB', 0x9E: 'SBC A',
                    0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR', 0xBE: 'CP' };
    if (ixAlu[op2]) {
      const d = i8(byteAt(pc + 2));
      const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
      return { len: 3, text: `${ixAlu[op2]},(${index}${dStr})` };
    }
    if (op2 === 0x34 || op2 === 0x35) {
      const d = i8(byteAt(pc + 2));
      const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
      return { len: 3, text: `${op2 === 0x34 ? 'INC' : 'DEC'} (${index}${dStr})` };
    }
    if (op2 === 0x36) {
      const d = i8(byteAt(pc + 2));
      const dStr = d >= 0 ? `+${hex(d, 2)}` : `-${hex(-d, 2)}`;
      return { len: 4, text: `LD (${index}${dStr}),${hex(byteAt(pc + 3), 2)}` };
    }
    if (op2 === 0xCB) return { len: 4, text: `${index} CB ${i8(byteAt(pc + 2))} ${cbText(byteAt(pc + 3))}` };
    return { len: 2, text: `${index} prefix ${hex(op2, 2)}` };
  }

  if ((op & 0xC7) === 0xC7) return { len: 1, text: `RST ${hex(op & 0x38, 2)}` };

  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function printSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${title}`);
  console.log('='.repeat(60));
}

// ─────────────────────────────────────────────────────────────
// PART 1: Static disassembly of 0x0817C0-0x0818E7
// ─────────────────────────────────────────────────────────────

function staticAnalysis() {
  printSection('PART 1: Full disassembly 0x0817C0-0x0818E7');

  const instructions = [];
  let pc = A.cursorBlink;
  while (pc < A.regionEnd) {
    const decoded = decodeAt(pc);
    instructions.push({ addr: pc, len: decoded.len, text: decoded.text });
    pc += Math.max(1, decoded.len);
  }

  for (const inst of instructions) {
    let annotation = '';
    if (inst.text.includes(hex(A.glyphRenderer))) annotation = '  ; <<< glyph renderer';
    if (inst.text.includes(hex(A.pixelWriter))) annotation = '  ; <<< pixel writer';
    if (inst.text.includes(hex(A.glyphSelector))) annotation = '  ; <<< glyph selector (0x030202)';
    if (inst.text.includes(hex(A.cursorRow))) annotation = '  ; <<< D00595 cursor row';
    if (inst.text.includes(hex(A.cursorCol))) annotation = '  ; <<< D00596 cursor col';
    if (inst.text.includes(hex(A.scratchCol))) annotation = '  ; <<< D0059C scratch col pixel';
    if (inst.text.includes(hex(A.cursorStyle))) annotation = '  ; <<< D00092 cursor style flags';
    if (inst.text.includes(hex(A.vramBase))) annotation = '  ; <<< VRAM base';
    console.log(`${hex(inst.addr)}  ${formatBytes(inst.addr, inst.len).padEnd(16)} ${inst.text}${annotation}`);
  }

  printSection('PART 1b: Reference summary');

  const refTargets = [
    { name: 'D00595 (cursor row)', addr: A.cursorRow },
    { name: 'D00596 (cursor col)', addr: A.cursorCol },
    { name: 'D0059C (scratch col)', addr: A.scratchCol },
    { name: 'D00092 (cursor style)', addr: A.cursorStyle },
    { name: 'D40000 (VRAM base)', addr: A.vramBase },
  ];

  for (const ref of refTargets) {
    const hits = [];
    for (let p = A.cursorBlink; p < A.regionEnd - 2; p++) {
      if (u24At(p) === ref.addr) hits.push(p);
    }
    console.log(`${ref.name}: ${hits.length} refs at ${hits.map(h => hex(h)).join(', ') || 'none'}`);
  }

  console.log('\nCALL targets in region:');
  for (let p = A.cursorBlink; p < A.regionEnd - 3; p++) {
    if (byteAt(p) === 0xCD) {
      const target = u24At(p + 1);
      let label = '';
      if (target === A.glyphRenderer) label = ' (glyph renderer)';
      if (target === A.pixelWriter) label = ' (pixel writer)';
      if (target === A.glyphSelector) label = ' (glyph selector)';
      console.log(`  ${hex(p)}: CALL ${hex(target)}${label}`);
    }
  }

  console.log('\nBranch instructions:');
  for (const inst of instructions) {
    if (inst.text.match(/^(JR |JP |CALL |RET)/)) {
      console.log(`  ${hex(inst.addr)}: ${inst.text}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PART 2: Dynamic cursor blink tests
// ─────────────────────────────────────────────────────────────

async function dynamicTest() {
  printSection('PART 2: Dynamic cursor blink testing');

  // Load transpiled ROM blocks
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  // Create 16MB memory with ROM loaded
  const MEM_SIZE = 0x1000000;
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const { cpu } = executor;

  // Boot
  console.log('Booting ROM...');
  cpu.a = 0; cpu.f = 0; cpu._bc = 0; cpu._de = 0; cpu._hl = 0;
  cpu.sp = 0; cpu._ix = 0; cpu._iy = 0; cpu.im = 0; cpu.madl = 0;
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  // Kernel init
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E;
  cpu.im = 1;
  cpu.madl = 1;
  executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

  console.log('Boot complete.');
  console.log(`IY = ${hex(cpu._iy)}`);
  console.log(`D00595 (row) = ${hex(mem[A.cursorRow], 2)}`);
  console.log(`D00596 (col) = ${hex(mem[A.cursorCol], 2)}`);
  console.log(`D00092 (style) = ${hex(mem[A.cursorStyle], 2)} = 0b${mem[A.cursorStyle].toString(2).padStart(8, '0')}`);

  // VRAM helpers
  const VRAM_PIXELS = 320 * 240;
  const VRAM_SIZE = VRAM_PIXELS * 2;

  function snapshotVram() {
    return new Uint8Array(mem.subarray(A.vramBase, A.vramBase + VRAM_SIZE));
  }

  function diffVram(before, after) {
    const changes = [];
    for (let i = 0; i < VRAM_SIZE; i += 2) {
      if (before[i] !== after[i] || before[i + 1] !== after[i + 1]) {
        const pixelOffset = i / 2;
        const pixelRow = Math.floor(pixelOffset / 320);
        const pixelCol = pixelOffset % 320;
        changes.push({ offset: i, pixelRow, pixelCol,
          before: (before[i + 1] << 8) | before[i],
          after: (after[i + 1] << 8) | after[i] });
      }
    }
    return changes;
  }

  function summarizeChanges(label, changes) {
    if (changes.length === 0) {
      console.log(`${label}: no VRAM changes.`);
      return;
    }
    const rows = new Set(changes.map(c => c.pixelRow));
    const cols = new Set(changes.map(c => c.pixelCol));
    console.log(`${label}: ${changes.length} pixels changed`);
    console.log(`  Row range: ${Math.min(...rows)}-${Math.max(...rows)} (${rows.size} rows)`);
    console.log(`  Col range: ${Math.min(...cols)}-${Math.max(...cols)} (${cols.size} cols)`);
    const sample = changes.slice(0, 6);
    for (const ch of sample) {
      console.log(`  pixel(${ch.pixelRow},${ch.pixelCol}): ${hex(ch.before, 4)} -> ${hex(ch.after, 4)}`);
    }
    if (changes.length > 6) console.log(`  ... ${changes.length - 6} more`);
  }

  // Style flag scan
  printSection('PART 2a: Style flag scan at row=0 col=0');

  const styleTests = [0x1E, 0x16, 0x0E, 0x06, 0x04, 0x02, 0x00];
  let activeStyle = null;

  for (const style of styleTests) {
    mem[A.cursorRow] = 0;
    mem[A.cursorCol] = 0;
    mem[A.cursorStyle] = style;
    cpu.sp = 0xD1A87E;
    cpu._iy = 0xD00080;

    const vBefore = snapshotVram();
    const result = executor.runFrom(A.cursorBlink, 'adl', { maxSteps: 5000, maxLoopIterations: 64 });
    const vAfter = snapshotVram();
    const changes = diffVram(vBefore, vAfter);

    console.log(`Style=${hex(style, 2)} (0b${style.toString(2).padStart(8, '0')}): ${changes.length} changes, term=${result.termination}, steps=${result.steps}`);
    if (changes.length > 0) {
      summarizeChanges('  detail', changes);
      if (activeStyle === null) activeStyle = style;
    }
  }

  if (activeStyle === null) {
    console.log('\nWARNING: No style produced VRAM changes. Trying with style=0x16 anyway.');
    activeStyle = 0x16;
  }
  console.log(`\nUsing active style: ${hex(activeStyle, 2)}`);

  // Position tests
  const testPositions = [
    { name: 'home (0,0)', row: 0, col: 0 },
    { name: 'center (5,13)', row: 5, col: 13 },
    { name: 'bottom-right (9,25)', row: 9, col: 25 },
  ];

  printSection(`PART 2b: Position tests with style=${hex(activeStyle, 2)}`);

  for (const pos of testPositions) {
    console.log(`\n--- ${pos.name} ---`);

    mem[A.cursorRow] = pos.row;
    mem[A.cursorCol] = pos.col;
    mem[A.cursorStyle] = activeStyle;
    cpu.sp = 0xD1A87E;
    cpu._iy = 0xD00080;

    const blockVisits = new Map();
    const vBefore = snapshotVram();

    const r1 = executor.runFrom(A.cursorBlink, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 64,
      onBlock: (pc) => {
        const addr = pc & 0xFFFFFF;
        blockVisits.set(addr, (blockVisits.get(addr) || 0) + 1);
      },
    });

    const vAfter1 = snapshotVram();
    const ch1 = diffVram(vBefore, vAfter1);
    summarizeChanges('First call', ch1);
    console.log(`  termination=${r1.termination} steps=${r1.steps}`);

    for (const [addr, name] of [[A.glyphRenderer, 'glyph 0x0A23C0'], [A.pixelWriter, 'pixel 0x0A239E'], [A.glyphSelector, 'sel 0x030202']]) {
      console.log(`  ${name}: ${blockVisits.get(addr) || 0} visits`);
    }

    const scratch16 = mem[A.scratchCol] | (mem[A.scratchCol + 1] << 8);
    console.log(`  D0059C scratch = ${hex(scratch16, 4)}`);

    // Second call: XOR test
    mem[A.cursorRow] = pos.row;
    mem[A.cursorCol] = pos.col;
    mem[A.cursorStyle] = activeStyle;
    cpu.sp = 0xD1A87E;
    cpu._iy = 0xD00080;

    const r2 = executor.runFrom(A.cursorBlink, 'adl', { maxSteps: 5000, maxLoopIterations: 64 });
    const vAfter2 = snapshotVram();
    const ch2 = diffVram(vAfter1, vAfter2);
    summarizeChanges('Second call', ch2);

    const net = diffVram(vBefore, vAfter2);
    console.log(`Net after 2 calls: ${net.length} pixels differ from original`);
    if (net.length === 0) {
      console.log('*** XOR BLINK CONFIRMED ***');
    } else if (net.length <= 10) {
      console.log('Near-restore:');
      for (const ch of net) console.log(`  pixel(${ch.pixelRow},${ch.pixelCol}): ${hex(ch.before, 4)} -> ${hex(ch.after, 4)}`);
    }
  }

  // Register snapshots at rendering calls
  printSection('PART 2c: Register state at rendering calls (row=3, col=7)');

  mem[A.cursorRow] = 3;
  mem[A.cursorCol] = 7;
  mem[A.cursorStyle] = activeStyle;
  cpu.sp = 0xD1A87E;
  cpu._iy = 0xD00080;

  const callSnaps = [];
  executor.runFrom(A.cursorBlink, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 64,
    onBlock: (pc) => {
      const addr = pc & 0xFFFFFF;
      if (addr === A.glyphRenderer || addr === A.pixelWriter || addr === A.glyphSelector) {
        callSnaps.push({
          target: hex(addr),
          a: cpu.a, f: cpu.f,
          bc: cpu._bc & 0xFFFFFF, de: cpu._de & 0xFFFFFF, hl: cpu._hl & 0xFFFFFF,
          ix: cpu._ix & 0xFFFFFF, iy: cpu._iy & 0xFFFFFF,
          style: mem[A.cursorStyle], row: mem[A.cursorRow], col: mem[A.cursorCol],
          scratch: mem[A.scratchCol] | (mem[A.scratchCol + 1] << 8),
        });
      }
    },
  });

  console.log(`Rendering call snapshots: ${callSnaps.length}`);
  for (let i = 0; i < callSnaps.length; i++) {
    const s = callSnaps[i];
    console.log(`\n  Call #${i + 1} -> ${s.target}`);
    console.log(`    A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)}`);
    console.log(`    IX=${hex(s.ix)} IY=${hex(s.iy)}`);
    console.log(`    style=${hex(s.style, 2)} row=${s.row} col=${s.col} scratch=${hex(s.scratch, 4)}`);
  }

  printSection('ANALYSIS COMPLETE');
}

// ─── Main ───

try {
  staticAnalysis();
} catch (err) {
  console.log(`Static analysis error: ${err.stack || err.message}`);
}

try {
  await dynamicTest();
} catch (err) {
  console.log(`Dynamic test error: ${err.stack || err.message}`);
}
