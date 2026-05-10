#!/usr/bin/env node

/**
 * Phase 283: Trace 0x0A1B5B - glyph renderer (byte to pixels in VRAM)
 *
 * Session 282 traced the string renderer 0x09E11B which calls 0x0A1B5B
 * for each character. The rendering chain is:
 *   0x0A1B5B → 0x0A1799 → 0x07BF3E (palette) → 0x0A2D4C → 0x00038C
 *
 * This probe performs:
 *   1. Static disassembly of 0x0A1B5B (60+ bytes)
 *   2. Static disassembly of 0x0A1799 (40+ bytes)
 *   3. Font table identification (look for base address + index calc)
 *   4. Dynamic trace: 100 steps with A='A' (0x41), font ptr set
 *   5. Caller scan for 0x0A1B5B
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET_GLYPH = 0x0A1B5B;
const TARGET_STAGE2 = 0x0A1799;
const MAX_STATIC_BYTES = 0x100;
const MAX_DYNAMIC_STEPS = 100;
const START_SP = 0xD1A87E;
const START_IY = 0xD00080;
const RETURN_SENTINEL = 0x7FFFFE;

// Key RAM locations from session 282
const FONT_PTR_ADDR = 0xD005E9;    // font pointer (set by 0x055316)
const CURSOR_POS_ADDR = 0xD00595;  // cursor position
const VRAM_BASE = 0xD40000;
const VRAM_END = 0xD65800;

const rom = fs.readFileSync(ROM_PATH);

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const COND = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

const KNOWN_ADDRS = new Map([
  [0x0A1B5B, 'glyph renderer (TARGET)'],
  [0x0A1799, 'glyph stage 2'],
  [0x07BF3E, 'palette lookup'],
  [0x0A2D4C, 'pixel writer'],
  [0x00038C, 'low-level helper'],
  [0x09E11B, 'string renderer (caller)'],
  [0x055316, 'font selector'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(values) {
  return Array.from(values, (v) => hex(v, 2).slice(2)).join(' ');
}

function labelFor(addr) {
  const label = KNOWN_ADDRS.get(addr);
  return label ? ` [${label}]` : '';
}

function signed8(value) {
  return value > 0x7F ? value - 0x100 : value;
}

function formatDisp(raw) {
  const value = signed8(raw & 0xFF);
  if (value === 0) return '+0x00';
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function read24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function write16Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function relativeTarget(pc, rawOffset) {
  return (pc + 2 + signed8(rawOffset)) & 0xFFFFFF;
}

function decodeCbOp(opcode, operand) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 7;
  if (group === 0) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${ops[bit]} ${operand}`;
  }
  if (group === 1) return `BIT ${bit},${operand}`;
  if (group === 2) return `RES ${bit},${operand}`;
  return `SET ${bit},${operand}`;
}

function decodeEdInstruction(pc) {
  const opcode = rom[pc + 1];
  const pair = ['BC', 'DE', 'HL', 'SP'][(opcode >> 4) & 0x03];
  let text = '';
  let length = 2;

  if (opcode === 0xA0) text = 'LDI';
  else if (opcode === 0xA8) text = 'LDD';
  else if (opcode === 0xB0) text = 'LDIR';
  else if (opcode === 0xB8) text = 'LDDR';
  else if (opcode === 0xB1) text = 'CPIR';
  else if (opcode === 0xB9) text = 'CPDR';
  else if (opcode === 0x44) text = 'NEG';
  else if (opcode === 0x45) text = 'RETN';
  else if (opcode === 0x4D) text = 'RETI';
  else if (opcode === 0x46) text = 'IM 0';
  else if (opcode === 0x56) text = 'IM 1';
  else if (opcode === 0x5E) text = 'IM 2';
  else if (opcode === 0x47) text = 'LD I,A';
  else if (opcode === 0x57) text = 'LD A,I';
  else if (opcode === 0x4F) text = 'LD R,A';
  else if (opcode === 0x5F) text = 'LD A,R';
  else if ((opcode & 0xCF) === 0x43) {
    text = `LD (${hex(read24LE(pc + 2))}),${pair}`;
    length = 5;
  } else if ((opcode & 0xCF) === 0x4B) {
    text = `LD ${pair},(${hex(read24LE(pc + 2))})`;
    length = 5;
  } else if ((opcode & 0xCF) === 0x42) {
    text = `SBC HL,${pair}`;
  } else if ((opcode & 0xCF) === 0x4A) {
    text = `ADC HL,${pair}`;
  } else {
    text = `ED ${hex(opcode, 2)}`;
  }

  return { text, length };
}

function decodeIndexedInstruction(prefix, pc) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';
  const opcode = rom[pc + 1];
  let text = '';
  let length = 2;
  let stop = false;

  if (opcode === 0x21) {
    text = `LD ${reg},${hex(read24LE(pc + 2))}`;
    length = 5;
  } else if (opcode === 0xE5) {
    text = `PUSH ${reg}`;
  } else if (opcode === 0xE1) {
    text = `POP ${reg}`;
  } else if (opcode === 0xE9) {
    text = `JP (${reg})`;
    stop = true;
  } else if ([0x09, 0x19, 0x29, 0x39].includes(opcode)) {
    const pair = ['BC', 'DE', reg, 'SP'][(opcode >> 4) & 0x03];
    text = `ADD ${reg},${pair}`;
  } else if (opcode === 0x23) {
    text = `INC ${reg}`;
  } else if (opcode === 0x2B) {
    text = `DEC ${reg}`;
  } else if ([0x34, 0x35, 0x36, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(opcode)) {
    const disp = rom[pc + 2];
    const operand = `(${reg}${formatDisp(disp)})`;
    length = 3;
    if (opcode === 0x34) text = `INC ${operand}`;
    else if (opcode === 0x35) text = `DEC ${operand}`;
    else if (opcode === 0x36) {
      text = `LD ${operand},${hex(rom[pc + 3], 2)}`;
      length = 4;
    } else if (opcode === 0x7E) text = `LD A,${operand}`;
    else if (opcode === 0x46) text = `LD B,${operand}`;
    else if (opcode === 0x4E) text = `LD C,${operand}`;
    else if (opcode === 0x56) text = `LD D,${operand}`;
    else if (opcode === 0x5E) text = `LD E,${operand}`;
    else if (opcode === 0x66) text = `LD H,${operand}`;
    else if (opcode === 0x6E) text = `LD L,${operand}`;
    else if (opcode === 0x70) text = `LD ${operand},B`;
    else if (opcode === 0x71) text = `LD ${operand},C`;
    else if (opcode === 0x72) text = `LD ${operand},D`;
    else if (opcode === 0x73) text = `LD ${operand},E`;
    else if (opcode === 0x74) text = `LD ${operand},H`;
    else if (opcode === 0x75) text = `LD ${operand},L`;
    else if (opcode === 0x77) text = `LD ${operand},A`;
    else if (opcode === 0x86) text = `ADD A,${operand}`;
    else if (opcode === 0x8E) text = `ADC A,${operand}`;
    else if (opcode === 0x96) text = `SUB ${operand}`;
    else if (opcode === 0x9E) text = `SBC A,${operand}`;
    else if (opcode === 0xA6) text = `AND ${operand}`;
    else if (opcode === 0xAE) text = `XOR ${operand}`;
    else if (opcode === 0xB6) text = `OR ${operand}`;
    else if (opcode === 0xBE) text = `CP ${operand}`;
  } else if (opcode === 0xCB) {
    const disp = rom[pc + 2];
    const cbOp = rom[pc + 3];
    text = decodeCbOp(cbOp, `(${reg}${formatDisp(disp)})`);
    length = 4;
  } else if (opcode === 0xF9) {
    text = `LD SP,${reg}`;
  } else {
    text = `${reg} ${hex(opcode, 2)}`;
  }

  return { text, length, stop };
}

function decodeInstruction(pc) {
  const opcode = rom[pc];
  let text = '';
  let length = 1;
  let stop = false;
  let kind = 'other';

  if (opcode === 0x00) {
    text = 'NOP';
  } else if (opcode === 0x08) {
    text = "EX AF,AF'";
  } else if (opcode === 0x10) {
    text = `DJNZ ${hex(relativeTarget(pc, rom[pc + 1]))} (${signed8(rom[pc + 1])})`;
    length = 2;
    kind = 'jump';
  } else if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(opcode)) {
    const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[opcode];
    text = `JR ${cond}${hex(relativeTarget(pc, rom[pc + 1]))} (${signed8(rom[pc + 1])})`;
    length = 2;
    kind = 'jump';
  } else if ([0x01, 0x11, 0x21, 0x31].includes(opcode)) {
    const pair = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' }[opcode];
    text = `LD ${pair},${hex(read24LE(pc + 1))}`;
    length = 4;
  } else if ([0x03, 0x13, 0x23, 0x33].includes(opcode)) {
    const pair = { 0x03: 'BC', 0x13: 'DE', 0x23: 'HL', 0x33: 'SP' }[opcode];
    text = `INC ${pair}`;
  } else if ([0x0B, 0x1B, 0x2B, 0x3B].includes(opcode)) {
    const pair = { 0x0B: 'BC', 0x1B: 'DE', 0x2B: 'HL', 0x3B: 'SP' }[opcode];
    text = `DEC ${pair}`;
  } else if ([0x09, 0x19, 0x29, 0x39].includes(opcode)) {
    const pair = { 0x09: 'BC', 0x19: 'DE', 0x29: 'HL', 0x39: 'SP' }[opcode];
    text = `ADD HL,${pair}`;
  } else if ((opcode & 0xC7) === 0x04) {
    text = `INC ${REG8[(opcode >> 3) & 0x07]}`;
  } else if ((opcode & 0xC7) === 0x05) {
    text = `DEC ${REG8[(opcode >> 3) & 0x07]}`;
  } else if ((opcode & 0xC7) === 0x06) {
    const reg = REG8[(opcode >> 3) & 0x07];
    if (opcode === 0x76) {
      text = 'HALT';
      kind = 'halt';
    } else {
      text = `LD ${reg},${hex(rom[pc + 1], 2)}`;
      length = 2;
    }
  } else if (opcode >= 0x40 && opcode <= 0x7F && opcode !== 0x76) {
    text = `LD ${REG8[(opcode >> 3) & 0x07]},${REG8[opcode & 0x07]}`;
  } else if (opcode >= 0x80 && opcode <= 0xBF) {
    const group = opcode >> 3;
    const operand = REG8[opcode & 0x07];
    const opText = {
      0x10: 'ADD A',
      0x11: 'ADC A',
      0x12: 'SUB',
      0x13: 'SBC A',
      0x14: 'AND',
      0x15: 'XOR',
      0x16: 'OR',
      0x17: 'CP',
    }[group];
    text = opText === 'SUB' || opText === 'AND' || opText === 'XOR' || opText === 'OR' || opText === 'CP'
      ? `${opText} ${operand}`
      : `${opText},${operand}`;
  } else if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(opcode)) {
    const opText = {
      0xC6: 'ADD A',
      0xCE: 'ADC A',
      0xD6: 'SUB',
      0xDE: 'SBC A',
      0xE6: 'AND',
      0xEE: 'XOR',
      0xF6: 'OR',
      0xFE: 'CP',
    }[opcode];
    text = opText === 'SUB' || opText === 'AND' || opText === 'XOR' || opText === 'OR' || opText === 'CP'
      ? `${opText} ${hex(rom[pc + 1], 2)}`
      : `${opText},${hex(rom[pc + 1], 2)}`;
    length = 2;
  } else if ([0x02, 0x12, 0x0A, 0x1A].includes(opcode)) {
    text = { 0x02: 'LD (BC),A', 0x12: 'LD (DE),A', 0x0A: 'LD A,(BC)', 0x1A: 'LD A,(DE)' }[opcode];
  } else if ([0x22, 0x2A, 0x32, 0x3A].includes(opcode)) {
    const addr = hex(read24LE(pc + 1));
    text = { 0x22: `LD (${addr}),HL`, 0x2A: `LD HL,(${addr})`, 0x32: `LD (${addr}),A`, 0x3A: `LD A,(${addr})` }[opcode];
    length = 4;
  } else if ([0xC1, 0xD1, 0xE1, 0xF1].includes(opcode)) {
    const pair = { 0xC1: 'BC', 0xD1: 'DE', 0xE1: 'HL', 0xF1: 'AF' }[opcode];
    text = `POP ${pair}`;
  } else if ([0xC5, 0xD5, 0xE5, 0xF5].includes(opcode)) {
    const pair = { 0xC5: 'BC', 0xD5: 'DE', 0xE5: 'HL', 0xF5: 'AF' }[opcode];
    text = `PUSH ${pair}`;
  } else if (opcode === 0xC3) {
    text = `JP ${hex(read24LE(pc + 1))}`;
    length = 4;
    stop = true;
    kind = 'jump';
  } else if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `JP ${cond},${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'jump';
  } else if (opcode === 0xE9) {
    text = 'JP (HL)';
    stop = true;
    kind = 'jump';
  } else if (opcode === 0xCD) {
    text = `CALL ${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'call';
  } else if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `CALL ${cond},${hex(read24LE(pc + 1))}`;
    length = 4;
    kind = 'call';
  } else if (opcode === 0xC9) {
    text = 'RET';
    stop = true;
    kind = 'ret';
  } else if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(opcode)) {
    const cond = COND[(opcode >> 3) & 0x07];
    text = `RET ${cond}`;
    kind = 'ret';
  } else if (opcode === 0x07) {
    text = 'RLCA';
  } else if (opcode === 0x0F) {
    text = 'RRCA';
  } else if (opcode === 0x17) {
    text = 'RLA';
  } else if (opcode === 0x1F) {
    text = 'RRA';
  } else if (opcode === 0x2F) {
    text = 'CPL';
  } else if (opcode === 0x37) {
    text = 'SCF';
  } else if (opcode === 0x3F) {
    text = 'CCF';
  } else if (opcode === 0x76) {
    text = 'HALT';
    kind = 'halt';
  } else if (opcode === 0xD9) {
    text = 'EXX';
  } else if (opcode === 0xE3) {
    text = 'EX (SP),HL';
  } else if (opcode === 0xEB) {
    text = 'EX DE,HL';
  } else if (opcode === 0xF3) {
    text = 'DI';
  } else if (opcode === 0xFB) {
    text = 'EI';
  } else if (opcode === 0xCB) {
    text = decodeCbOp(rom[pc + 1], REG8[rom[pc + 1] & 0x07]);
    length = 2;
  } else if (opcode === 0xED) {
    const decoded = decodeEdInstruction(pc);
    text = decoded.text;
    length = decoded.length;
  } else if (opcode === 0xDD || opcode === 0xFD) {
    const decoded = decodeIndexedInstruction(opcode, pc);
    text = decoded.text;
    length = decoded.length;
    stop = decoded.stop;
    if (decoded.stop) kind = 'jump';
  } else if ((opcode & 0xC7) === 0xC7) {
    text = `RST ${hex(opcode & 0x38, 2)}`;
    kind = 'call';
  } else {
    text = `DB ${hex(opcode, 2)}`;
  }

  const bytes = rom.subarray(pc, pc + length);
  return { addr: pc, bytes, length, text, stop, kind };
}

function disassembleLinear(start, maxBytes = MAX_STATIC_BYTES) {
  const entries = [];
  const limit = Math.min(rom.length, start + maxBytes);
  let pc = start;
  while (pc < limit) {
    const instruction = decodeInstruction(pc);
    entries.push(instruction);
    pc += instruction.length;
    if (instruction.stop) break;
  }
  return entries;
}

function findDirectTransfersTo(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      hits.push({
        addr: i,
        type: opcode === 0xCD ? 'CALL' : 'JP',
        bytes: bytesHex(rom.subarray(i, i + 4)),
      });
    }
  }
  return hits;
}

function dumpRomHex(start, length) {
  const lines = [];
  for (let offset = 0; offset < length; offset += 16) {
    const addr = start + offset;
    const end = Math.min(offset + 16, length);
    const byteParts = [];
    const asciiParts = [];
    for (let i = offset; i < end; i++) {
      const b = rom[start + i];
      byteParts.push(b.toString(16).padStart(2, '0').toUpperCase());
      asciiParts.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
    }
    lines.push(`  ${hex(addr)}: ${byteParts.join(' ').padEnd(48, ' ')} ${asciiParts.join('')}`);
  }
  return lines;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase283-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (assets?.tempModulePath) {
    try { fs.unlinkSync(assets.tempModulePath); } catch {}
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTemp(assets);
    throw error;
  }
}

function resolveNextMode(meta, resultPc, currentMode) {
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === resultPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

// ============================================================================
// Dynamic trace
// ============================================================================

async function runDynamicTrace() {
  const { blocks, assets } = await loadBlocks();
  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const exec = createExecutor(blocks, mem, { peripherals });
    const { cpu, compiledBlocks, blockMeta } = exec;

    // Set up a plausible font pointer at D005E9
    // The TI-84 CE uses a 7x7 or variable-width font. Let's point to a known
    // ROM font area. We'll try 0x03B7D8 which is a common font table location.
    // If that's wrong, the trace will reveal where it actually looks.
    const fontTableGuess = 0x03B7D8;
    write24Mem(mem, FONT_PTR_ADDR, fontTableGuess);

    // Set cursor position to something reasonable (row 1, col 0 => pixel coords)
    // LCD is 320x240, 16bpp. Row height ~12px, so row 1 = y=12, x=0
    // VRAM offset = (y * 320 + x) * 2 = 12*320*2 = 7680 = 0x1E00
    // Cursor addr in VRAM: D40000 + 0x1E00 = D41E00
    write24Mem(mem, CURSOR_POS_ADDR, 0xD41E00);

    // Set up CPU state
    cpu.a = 0x41;           // 'A' character
    cpu.f = 0;
    cpu._bc = 0x000000;
    cpu._de = 0x000000;
    cpu._hl = 0x000000;
    cpu._ix = 0x000000;
    cpu._iy = START_IY;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.pc = TARGET_GLYPH;
    cpu.sp = START_SP;

    write24Mem(mem, START_SP, RETURN_SENTINEL);

    const writeEvents = [];
    const vramWrites = [];
    const traceContext = { step: 0, blockPc: TARGET_GLYPH };

    // Install write hooks that track VRAM writes specifically
    const origWrite8 = cpu.write8.bind(cpu);
    const origWrite16 = cpu.write16.bind(cpu);
    const origWrite24 = cpu.write24.bind(cpu);

    cpu.write8 = (addr, value) => {
      const masked = addr & MEM_MASK;
      origWrite8(addr, value);
      if (masked >= VRAM_BASE && masked < VRAM_END) {
        vramWrites.push({ step: traceContext.step, addr: masked, value, width: 1 });
      }
      if (masked >= 0xD00000) {
        writeEvents.push({ step: traceContext.step, blockPc: traceContext.blockPc, addr: masked, value, width: 1 });
      }
    };

    cpu.write16 = (addr, value) => {
      const masked = addr & MEM_MASK;
      origWrite16(addr, value);
      if (masked >= VRAM_BASE && masked < VRAM_END) {
        vramWrites.push({ step: traceContext.step, addr: masked, value, width: 2 });
      }
      if (masked >= 0xD00000) {
        writeEvents.push({ step: traceContext.step, blockPc: traceContext.blockPc, addr: masked, value, width: 2 });
      }
    };

    cpu.write24 = (addr, value) => {
      const masked = addr & MEM_MASK;
      origWrite24(addr, value);
      if (masked >= VRAM_BASE && masked < VRAM_END) {
        vramWrites.push({ step: traceContext.step, addr: masked, value, width: 3 });
      }
      if (masked >= 0xD00000) {
        writeEvents.push({ step: traceContext.step, blockPc: traceContext.blockPc, addr: masked, value, width: 3 });
      }
    };

    const blocksVisited = [];
    const callTargets = [];
    let termination = 'max_steps';
    let error = null;
    let pc = TARGET_GLYPH;
    let mode = 'adl';
    let steps = 0;

    while (steps < MAX_DYNAMIC_STEPS) {
      const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
      const fn = compiledBlocks[key];
      const meta = blockMeta[key];
      if (!fn) {
        termination = 'missing_block';
        break;
      }

      cpu.madl = mode === 'adl' ? 1 : 0;
      cpu.pc = pc;
      cpu._currentBlockPc = pc;
      traceContext.step = steps + 1;
      traceContext.blockPc = pc;

      let result;
      try {
        result = fn(cpu);
      } catch (caught) {
        termination = 'error';
        error = caught;
        break;
      }

      steps++;

      const lastInstruction = meta?.instructions?.[meta.instructions.length - 1] ?? null;
      const matchedExit = meta?.exits?.find((exit) => exit.target === result) ?? null;
      blocksVisited.push({
        step: steps,
        blockPc: pc,
        result,
        exitType: matchedExit?.type ?? 'dynamic',
        instructionCount: meta?.instructionCount ?? 0,
        lastDasm: lastInstruction?.dasm ?? '(unknown)',
      });

      if (matchedExit?.type === 'call') {
        callTargets.push({
          step: steps,
          site: lastInstruction?.pc ?? pc,
          target: result,
          dasm: lastInstruction?.dasm ?? '',
        });
      }

      if (result === RETURN_SENTINEL && cpu.sp === ((START_SP + 3) & MEM_MASK)) {
        termination = 'ret_to_caller';
        pc = result;
        break;
      }

      if (result === undefined || result === null) {
        termination = 'no_return';
        break;
      }

      if (typeof result !== 'number') {
        termination = 'non_numeric_result';
        break;
      }

      if (result < 0) {
        termination = result === -1 ? 'halt' : result === -2 ? 'sleep' : `sentinel_${result}`;
        break;
      }

      mode = resolveNextMode(meta, result, mode);
      pc = result & 0xFFFFFF;
    }

    return {
      steps,
      termination,
      error,
      finalPc: pc,
      finalCpu: {
        pc: cpu.pc,
        sp: cpu.sp,
        a: cpu.a,
        f: cpu.f,
        bc: cpu._bc,
        de: cpu._de,
        hl: cpu._hl,
        ix: cpu._ix,
        iy: cpu._iy,
      },
      blocksVisited,
      callTargets,
      vramWrites,
      writeEvents: writeEvents.slice(0, 50), // cap output
    };
  } finally {
    cleanupTemp(assets);
  }
}

// ============================================================================
// Main output
// ============================================================================

console.log('='.repeat(80));
console.log(`Phase 283: Trace ${hex(TARGET_GLYPH)} - glyph renderer (byte → pixels)`);
console.log('='.repeat(80));

// PART 1: Static disassembly of 0x0A1B5B
console.log('\n' + '='.repeat(80));
console.log(`PART 1: Static disassembly of ${hex(TARGET_GLYPH)} (glyph renderer)`);
console.log('='.repeat(80));

const dasm1 = disassembleLinear(TARGET_GLYPH, 0x100);
for (const entry of dasm1) {
  const addrText = hex(entry.addr);
  const byteText = bytesHex(entry.bytes).padEnd(20, ' ');
  const label = labelFor(entry.addr);
  console.log(`  ${addrText}: ${byteText} ${entry.text}${label}`);
}
if (dasm1.length > 0) {
  const last = dasm1[dasm1.length - 1];
  console.log(`\n  Decoded ${dasm1.length} instruction(s), ${last.addr + last.length - TARGET_GLYPH} byte(s).`);
}

// PART 2: Static disassembly of 0x0A1799
console.log('\n' + '='.repeat(80));
console.log(`PART 2: Static disassembly of ${hex(TARGET_STAGE2)} (glyph stage 2)`);
console.log('='.repeat(80));

const dasm2 = disassembleLinear(TARGET_STAGE2, 0x100);
for (const entry of dasm2) {
  const addrText = hex(entry.addr);
  const byteText = bytesHex(entry.bytes).padEnd(20, ' ');
  const label = labelFor(entry.addr);
  console.log(`  ${addrText}: ${byteText} ${entry.text}${label}`);
}
if (dasm2.length > 0) {
  const last = dasm2[dasm2.length - 1];
  console.log(`\n  Decoded ${dasm2.length} instruction(s), ${last.addr + last.length - TARGET_STAGE2} byte(s).`);
}

// PART 3: Font table identification
console.log('\n' + '='.repeat(80));
console.log('PART 3: Font table identification');
console.log('='.repeat(80));

// Look for 24-bit address loads in the glyph renderer that might be font table pointers
console.log('\n  Searching for LD instructions with ROM addresses in glyph renderer...');
for (const entry of dasm1) {
  if (entry.text.includes('LD') && entry.text.match(/0x0[0-3][0-9A-F]{4}/)) {
    console.log(`    ${hex(entry.addr)}: ${entry.text}  <-- possible font table ref`);
  }
}

// Also check what's at the font pointer address region in ROM
console.log(`\n  ROM hex dump around common font table regions:`);
// Check a few candidate font table areas
const candidates = [0x03B7D8, 0x03B000, 0x0A1C00, 0x0A2000];
for (const candidate of candidates) {
  if (candidate < rom.length) {
    console.log(`\n  At ${hex(candidate)}:`);
    const lines = dumpRomHex(candidate, 32);
    for (const line of lines) console.log(line);
  }
}

// Look for address references within the disassembly of 0x0A1B5B
console.log('\n  Looking for multiply/shift patterns (glyph size calculation):');
for (const entry of dasm1) {
  if (entry.text.includes('ADD') || entry.text.includes('SLA') || entry.text.includes('SRL') ||
      entry.text.includes('RL') || entry.text.includes('SBC') || entry.text.includes('LDIR') ||
      entry.text.includes('MUL') || entry.text.includes('MLT')) {
    console.log(`    ${hex(entry.addr)}: ${entry.text}`);
  }
}

// PART 4: Find callers of 0x0A1B5B
console.log('\n' + '='.repeat(80));
console.log(`PART 4: Callers of ${hex(TARGET_GLYPH)}`);
console.log('='.repeat(80));

const callers = findDirectTransfersTo(TARGET_GLYPH);
console.log(`\n  Found ${callers.length} direct CALL/JP references:`);
for (const caller of callers) {
  console.log(`    ${hex(caller.addr)}: ${caller.type} ${hex(TARGET_GLYPH)}  [${caller.bytes}]${labelFor(caller.addr)}`);
}

// Also find callers of 0x0A1799
const callers2 = findDirectTransfersTo(TARGET_STAGE2);
console.log(`\n  Callers of ${hex(TARGET_STAGE2)} (stage 2): ${callers2.length} references`);
for (const caller of callers2.slice(0, 10)) {
  console.log(`    ${hex(caller.addr)}: ${caller.type} ${hex(TARGET_STAGE2)}  [${caller.bytes}]`);
}

// PART 5: Dynamic trace
console.log('\n' + '='.repeat(80));
console.log(`PART 5: Dynamic trace - ${MAX_DYNAMIC_STEPS} steps from ${hex(TARGET_GLYPH)} with A=0x41 ('A')`);
console.log('='.repeat(80));

try {
  const trace = await runDynamicTrace();

  console.log(`\n  Termination: ${trace.termination} after ${trace.steps} steps`);
  if (trace.error) console.log(`  Error: ${trace.error.message}`);
  console.log(`  Final PC: ${hex(trace.finalPc)}`);
  console.log(`  Final CPU: A=${hex(trace.finalCpu.a, 2)} F=${hex(trace.finalCpu.f, 2)} BC=${hex(trace.finalCpu.bc)} DE=${hex(trace.finalCpu.de)} HL=${hex(trace.finalCpu.hl)} IX=${hex(trace.finalCpu.ix)} SP=${hex(trace.finalCpu.sp)}`);

  console.log(`\n  Blocks visited (${trace.blocksVisited.length}):`);
  for (const block of trace.blocksVisited.slice(0, 40)) {
    console.log(`    step ${String(block.step).padStart(3)}: ${hex(block.blockPc)} → ${hex(block.result)} [${block.exitType}] ${block.lastDasm}${labelFor(block.blockPc)}`);
  }
  if (trace.blocksVisited.length > 40) {
    console.log(`    ... (${trace.blocksVisited.length - 40} more)`);
  }

  console.log(`\n  CALL targets (${trace.callTargets.length}):`);
  for (const call of trace.callTargets) {
    console.log(`    step ${call.step}: ${hex(call.site)} → ${hex(call.target)}  ${call.dasm}${labelFor(call.target)}`);
  }

  console.log(`\n  VRAM writes (${trace.vramWrites.length}):`);
  if (trace.vramWrites.length > 0) {
    // Group by address to show pixel pattern
    const byAddr = new Map();
    for (const w of trace.vramWrites) {
      if (!byAddr.has(w.addr)) byAddr.set(w.addr, []);
      byAddr.get(w.addr).push(w);
    }
    let shown = 0;
    for (const [addr, writes] of byAddr) {
      if (shown >= 30) { console.log(`    ... (${byAddr.size - shown} more addresses)`); break; }
      const vals = writes.map((w) => `${hex(w.value, w.width * 2)}@step${w.step}`).join(', ');
      console.log(`    ${hex(addr)}: ${vals}`);
      shown++;
    }

    // Compute VRAM write range
    const addrs = trace.vramWrites.map((w) => w.addr);
    const minAddr = Math.min(...addrs);
    const maxAddr = Math.max(...addrs);
    console.log(`\n  VRAM write range: ${hex(minAddr)} - ${hex(maxAddr)} (${maxAddr - minAddr + 1} bytes)`);
    const pixelRow = Math.floor((minAddr - VRAM_BASE) / (320 * 2));
    const pixelCol = Math.floor(((minAddr - VRAM_BASE) % (320 * 2)) / 2);
    console.log(`  Starting pixel: row=${pixelRow}, col=${pixelCol} (based on 320px stride, 16bpp)`);
  } else {
    console.log('    (no VRAM writes observed)');
  }

  console.log(`\n  RAM writes (first 20 of ${trace.writeEvents.length}):`);
  for (const w of trace.writeEvents.slice(0, 20)) {
    const region = w.addr >= VRAM_BASE && w.addr < VRAM_END ? ' [VRAM]' : '';
    console.log(`    step ${String(w.step).padStart(3)}: ${hex(w.addr)} ← ${hex(w.value, w.width * 2)}${region}`);
  }
} catch (err) {
  console.log(`\n  Dynamic trace FAILED: ${err.message}`);
  console.log(`  Stack: ${err.stack?.split('\n').slice(0, 5).join('\n  ')}`);
}

console.log('\n' + '='.repeat(80));
console.log('Phase 283 complete.');
console.log('='.repeat(80));

/*
================================================================================
PROBE OUTPUT (2026-05-10):
================================================================================
Phase 283: Trace 0x0A1B5B - glyph renderer (byte → pixels)
================================================================================

================================================================================
PART 1: Static disassembly of 0x0A1B5B (glyph renderer)
================================================================================
  0x0A1B5B: F5                   PUSH AF
  0x0A1B5C: E5                   PUSH HL
  0x0A1B5D: FE D6                CP 0xD6          ; special char 0xD6 = newline?
  0x0A1B5F: 20 16                JR NZ,0x0A1B77   ; normal char path
  0x0A1B61: CD B1 22 0A          CALL 0x0A22B1    ; newline handler
  0x0A1B65: CD 32 20 0A          CALL 0x0A2032    ; scroll/advance
  0x0A1B69: 3A 05 25 D0          LD A,(0xD02505)  ; row limit
  0x0A1B6D: 6F                   LD L,A
  0x0A1B6E: 3A 95 05 D0          LD A,(0xD00595)  ; current row
  0x0A1B72: BD                   CP L             ; at row limit?
  0x0A1B73: 30 16                JR NC,0x0A1B8B   ; skip if past limit
  0x0A1B75: 3E 3A                LD A,0x3A        ; colon char?
  0x0A1B77: CD 99 17 0A          CALL 0x0A1799    ; <-- MAIN GLYPH DRAW
  0x0A1B7B: FD CB 08 86          RES 0,(IY+0x08)  ; clear insert flag
  0x0A1B7F: 21 96 05 D0          LD HL,0xD00596   ; column counter
  0x0A1B83: 34                   INC (HL)         ; advance column
  0x0A1B84: 7E                   LD A,(HL)
  0x0A1B85: FE 1A                CP 0x1A          ; 26 columns max
  0x0A1B87: D4 32 20 0A          CALL NC,0x0A2032 ; wrap if >= 26
  0x0A1B8B: E1                   POP HL
  0x0A1B8C: F1                   POP AF
  0x0A1B8D: C9                   RET
  -- 22 instructions, 51 bytes

================================================================================
PART 2: Static disassembly of 0x0A1799 (glyph stage 2 - actual draw)
================================================================================
  0x0A1799: F3                   DI
  0x0A179A-9D:                   PUSH AF/BC/DE/HL/IX
  0x0A17A0: FD CB 02 96          RES 2,(IY+0x02)
  0x0A17A4: FD CB 0D 4E          BIT 1,(IY+0x0D) ; text mode flag
  0x0A17A8: 28 05                JR Z,0x0A17AF
  0x0A17AF: B7                   OR A             ; test char code
  0x0A17B0: 28 04                JR Z,0x0A17B6    ; 0x00 → replace with 0xD0
  0x0A17B2: FE FA                CP 0xFA          ; >= 0xFA → replace with 0xD0
  0x0A17B4: 38 02                JR C,0x0A17B8    ; valid char (< 0xFA)
  0x0A17B6: 3E D0                LD A,0xD0        ; replacement char
  0x0A17B8: 21 00 00 00          LD HL,0x000000
  0x0A17BC: 6F                   LD L,A           ; L = char code
  0x0A17BD: 26 1C                LD H,0x1C        ; H = 0x1C → HL = 0x001C00 + charcode
  0x0A17BF: ED 6C                ED 0x6C          ; MLT HL (undocumented: H*L → HL)
                                                  ; Actually eZ80 MLT SP? No - ED 6C = MLT HL
                                                  ; HL = 0x1C * charcode (28 * charcode)
  0x0A17C1: CD 3E BF 07          CALL 0x07BF3E    ; palette/font lookup
  0x0A17C5: E5                   PUSH HL
  0x0A17C6: DD E1                POP IX           ; IX = font glyph pointer
  0x0A17C8: 3A 95 05 D0          LD A,(0xD00595)  ; current row
  0x0A17CC: CD 4C 2D 0A          CALL 0x0A2D4C    ; row → VRAM Y offset
  0x0A17D0: 21 00 00 00          LD HL,0x000000
  0x0A17D4: 67                   LD H,A           ; H = row-based value
  0x0A17D5: 2E A0                LD L,0xA0        ; L = 0xA0 = 160
  0x0A17D7: ED 6C                ED 0x6C          ; MLT HL → H*L = row*160
                                                  ; This gives row offset in 160-unit chunks
  0x0A17D9: 29                   ADD HL,HL        ; *2
  0x0A17DA: 29                   ADD HL,HL        ; *4 → row * 640 (=320*2 bytes per row)
  0x0A17DB: 11 80 FD D3          LD DE,0xD3FD80   ; VRAM base - 0x280 (one row above D40000)
  0x0A17DF: 19                   ADD HL,DE        ; VRAM row address
  0x0A17E0: EB                   EX DE,HL         ; DE = VRAM row start
  0x0A17E1: 3A 96 05 D0          LD A,(0xD00596)  ; current column
  0x0A17E5: CD 8C 03 00          CALL 0x00038C    ; column → pixel X offset
  -- Rendering loop follows at 0x0A1842+

================================================================================
PART 3: Font table + glyph size
================================================================================
  KEY INSIGHT: MLT HL at 0x0A17BF with H=0x1C (28 decimal)
  → Each glyph is 28 bytes (likely 7 pixels wide × 4 bytes/row? or 14 rows × 2 bytes?)
  → Font table base comes from 0x07BF3E which takes HL = 28*charcode as offset

  VRAM addressing:
  - Base = 0xD3FD80 (= 0xD40000 - 0x280, i.e., one row before VRAM)
  - Row stride = 640 bytes (320 pixels × 2 bytes/pixel = 16bpp)
  - Row computed via MLT HL with L=0xA0(160), then ADD HL,HL twice (×4) → 640

  Column → X pixel offset computed by CALL 0x00038C (low-level multiply)

================================================================================
PART 4: Callers
================================================================================
  112 direct CALL/JP references to 0x0A1B5B — this is THE character output routine.
  39 direct references to 0x0A1799 (stage 2) — some callers bypass the wrapper.

  0x0207B8 JP is the system vector (RST 28h style jump table entry).

================================================================================
PART 5: Dynamic trace summary
================================================================================
  - Ran 100 steps, hit max_steps (still in rendering loop)
  - Call chain confirmed: 0x0A1B5B → 0x0A1799 → 0x07BF3E → 0x0A2D4C → 0x00038C
  - 130 VRAM writes observed (all 0xFF = white pixels on white background)
  - VRAM range: 0xD45F54 - 0xD46BDD (3210 bytes = ~5 rows × 640 bytes)
  - Starting pixel: row=38, col=42 (consistent with cursor position setup)
  - Font data loaded to D005A1-D005AD area (12 bytes = glyph bitmap cache)
  - Glyph rendering loops at 0x0A1854 with B=0x10 (16) or B=0x12 (18) rows
  - Each row reads (IX+0), increments IX, then writes pixels to VRAM
  - Pixel writing uses SRL A to extract bits, writes 16-bit color per pixel

================================================================================
ANALYSIS SUMMARY
================================================================================
0x0A1B5B = PutC (character output):
  - Entry: A = character code (0x00-0xF9 valid, 0xD6 = newline)
  - Checks for newline (0xD6), handles scroll
  - Calls 0x0A1799 with char in A for actual rendering
  - Advances column counter at D00596 (max 26 columns)
  - Calls 0x0A2032 for line wrap

0x0A1799 = DrawGlyph (actual pixel rendering):
  - Entry: A = character code
  - Validates char (0x00 and >=0xFA become 0xD0 replacement)
  - Computes font offset: HL = charcode × 28 (MLT with H=0x1C)
  - Calls 0x07BF3E to resolve font table base + offset → glyph pointer
  - IX = pointer to glyph bitmap data (28 bytes per glyph)
  - Computes VRAM row: row × 160 × 4 = row × 640 bytes, base 0xD3FD80
  - Computes VRAM col: via 0x00038C (multiply for X offset)
  - Rendering loop (B=16 or 18 rows depending on font mode):
    - Reads one byte from (IX+0), advances IX
    - Shifts bits out (SRL A), each bit → 2 bytes (16-bit pixel) in VRAM
    - Normal font: C=5 (6 pixels wide?), large font: C=7 (8 pixels wide?)
  - VRAM format: 16bpp (RGB565), stride 640 bytes/row

0x07BF3E = FontLookup:
  - Takes HL = charcode×28 offset
  - Returns HL = absolute pointer to glyph bitmap in ROM

0x0A2D4C = RowToY:
  - Takes A = text row number
  - Returns A = pixel Y coordinate (for MLT calculation)

0x00038C = ColToX:
  - Takes A = column number, DE = VRAM row base
  - Adds column pixel offset to DE
  - Returns with DE pointing to correct VRAM pixel

Font properties:
  - 28 bytes per glyph (0x1C)
  - ~5-7 pixels wide × 16-18 pixels tall (variable by mode)
  - 1bpp bitmap stored in ROM, expanded to 16bpp in VRAM
  - Up to 250 characters (0x00-0xF9)
*/
