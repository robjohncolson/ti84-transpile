#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;

// Function boundaries — the caller continuation is inside 0x05519F
// 0x05519F is the "slow path" of the sync gate at 0x055191.
// 0x055191 checks D000C6 bit 1: if set, RET immediately at 0x05519E.
// If not set, CALL 0x05519F which sets the bit, calls 0x055316 (config selector),
// then continues at 0x0551B1 to initialize LCD parameters before RET at 0x0551FD.
const SYNC_GATE = 0x055191;
const SYNC_GATE_FAST_RET = 0x05519E;
const SLOW_PATH_ENTRY = 0x05519F;
const CALLER_CONTINUATION = 0x0551B1;
const FUNC_RET = 0x0551FD;
const CONFIG_SELECTOR = 0x055316;
const FUNCTION_WINDOW_START = 0x05519F;
const FUNCTION_WINDOW_END = 0x0551FD;

// ROM data sources
const TABLE_BASE = 0x0525D4;
const TABLE_STRIDE = 12;
const LDIR_SOURCE = 0x05550C;
const LDIR_LENGTH = 13;
const FONT_TABLE_PTR = 0x05320F;
const FONT_TABLE_LIMIT_ADDR = 0x05323F;

// RAM targets
const GUARD_FLAG_ADDR = 0xD000C6;
const DESCRIPTOR_PTR_RAM = 0xD005E9;
const LCD_PARAM_D005EC = 0xD005EC;
const LCD_PARAM_D005ED = 0xD005ED;
const LCD_PARAM_D005F0 = 0xD005F0;
const LCD_PARAM_D005F4 = 0xD005F4;
const LCD_PARAM_D02FD6 = 0xD02FD6;
const LCD_PARAM_D02FD9 = 0xD02FD9;
const LCD_PARAM_D02FDC = 0xD02FDC;
const LCD_PARAM_D02FE0 = 0xD02FE0;
const LCD_PARAM_D02FE3 = 0xD02FE3;
const BG_COLOR_ADDR = 0xD026AC; // 16-bit SIS address (MBASE=0xD0 -> 0xD026AC)
const LCD_TYPE_ADDR = 0xD007E0;

// Execution setup
const STACK_BASE = 0xD1A800;
const RETURN_SENTINEL = 0xFFFFFE;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function read16(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8)) >>> 0;
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >> 8) & 0xFF;
  buffer[addr + 2] = (value >> 16) & 0xFF;
}

function write16(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >> 8) & 0xFF;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function isConditionalBranch(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

function isUnconditionalBranch(inst) {
  return ['jr', 'jp', 'jp-indirect'].includes(inst.tag);
}

function isReturn(inst) {
  return ['ret', 'reti', 'retn', 'ret-conditional'].includes(inst.tag);
}

function isRomAddress(value) {
  return Number.isInteger(value) && value >= 0x1000 && value < 0x400000;
}

function isRamAddress(value) {
  return Number.isInteger(value) && value >= 0xD00000 && value < 0xE00000;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister ?? '').toUpperCase()}${formatDisp(displacement)})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (HL)`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (HL)`;
    case 'nop':
      return `${prefix}NOP`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) {
        text += ` ${hex(inst.target)}`;
      }
      if (inst.value !== undefined) {
        text += ` ${hex(inst.value)}`;
      }
      return text;
    }
  }
}

function formatBytesFor(inst) {
  return bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length));
}

// ─── Static disassembly ───

function printFullDisassembly() {
  console.log('=== Phase 329: Caller Continuation at 0x05519F (containing 0x0551B1) ===\n');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
  console.log(`Sync gate: ${hex(SYNC_GATE)} (fast-returns at ${hex(SYNC_GATE_FAST_RET)} if D000C6 bit 1 set)`);
  console.log(`Slow path entry: ${hex(SLOW_PATH_ENTRY)}`);
  console.log(`Caller continuation after config selector returns: ${hex(CALLER_CONTINUATION)}`);
  console.log(`Function RET: ${hex(FUNC_RET)}\n`);

  console.log('1) Outer sync gate 0x055191\n');
  console.log('The sync gate checks D000C6 bit 1. If already set, RET immediately (idempotent guard).');
  console.log('If not set, CALL Z 0x05519F which is the slow path that does the real init.\n');

  let pc = SYNC_GATE;
  while (pc <= SYNC_GATE_FAST_RET) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    const bytes = formatBytesFor(inst).padEnd(24);
    const text = formatInstruction(inst);
    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}`);
    pc = nextPc(inst);
  }

  console.log('\n2) Full slow-path function 0x05519F through RET at 0x0551FD\n');
  console.log('This is the function that CONTAINS the caller continuation at 0x0551B1.');
  console.log('It is called from the sync gate when D000C6 bit 1 is NOT set.\n');

  const annotations = {
    0x05519F: '--- SET the sync gate flag (D000C6 bit 1) so this only runs once ---',
    0x0551A8: '--- Push config index 0 as argument, call 0x055316 (config selector) ---',
    0x0551B1: '--- CALLER CONTINUATION: LCD parameter initialization begins here ---',
    0x0551B2: '--- SUB A,A -> A=0x00 ---',
    0x0551B3: '--- Store 0x00 to D005EC (opacity/alpha = transparent) ---',
    0x0551B7: '--- DEC A -> A=0xFF ---',
    0x0551B8: '--- Store 0xFF to D005F4 (opacity/alpha = opaque) ---',
    0x0551BC: '--- Store ROM pointer 0x05320F to D005F0 (font descriptor table pointer) ---',
    0x0551C5: '--- Load 24-bit value from ROM 0x05323F into BC, store to D005ED ---',
    0x0551CF: '--- BC=0x000000, store via SIS LD to (D0)26AC = D026AC (bg color = black) ---',
    0x0551D8: '--- Load LCD type byte from D007E0, compare with 0x58 ---',
    0x0551DE: '--- If LCD type != 0x58: skip to 0x0551E6 (BC=0) ---',
    0x0551E0: '--- LCD type IS 0x58: BC=0x001E (clip offset = 30 pixels) ---',
    0x0551E4: '--- Jump to shared store ---',
    0x0551E6: '--- LCD type NOT 0x58: BC=0x000000 (clip offset = 0) ---',
    0x0551EA: '--- Store clip offset to D02FD6 ---',
    0x0551EF: '--- LDIR: copy 13 bytes from ROM 0x05550C to RAM D02FD9 (VRAM layout params) ---',
    0x0551FD: '--- RET: initialization complete ---',
  };

  pc = SLOW_PATH_ENTRY;
  while (pc <= FUNC_RET) {
    const inst = decodeSafe(pc);
    if (!inst) break;

    if (annotations[inst.pc]) {
      console.log(`  ${annotations[inst.pc]}`);
    }

    const bytes = formatBytesFor(inst).padEnd(24);
    const text = formatInstruction(inst);
    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}`);
    pc = nextPc(inst);
  }

  console.log('\n3) RAM write map — every write in the caller continuation\n');

  const writes = [
    {
      addr: 0xD005EC, width: 8, value: 0x00,
      source: 'Computed: SUB A,A = 0x00',
      meaning: 'Alpha/opacity = 0 (transparent). Initial state; set to 0xFF before rendering.',
    },
    {
      addr: 0xD005F4, width: 8, value: 0xFF,
      source: 'Computed: DEC A -> 0xFF (after SUB A,A)',
      meaning: 'Alpha/opacity = 0xFF (opaque). Used by pixel writer sub 0x0553F0 as alpha channel.',
    },
    {
      addr: 0xD005F0, width: 24, value: 0x05320F,
      source: 'Immediate: LD BC, 0x05320F (ROM constant)',
      meaning: 'Font descriptor table pointer. Points to ROM table at 0x05320F (array of 3-byte entries).',
    },
    {
      addr: 0xD005ED, width: 24, value: read24(rom, 0x05323F),
      source: `ROM load: LD BC, (0x05323F) = ${hex(read24(rom, 0x05323F))}`,
      meaning: 'Font table limit/size (0x000FFF = 4095). Max valid font table index.',
    },
    {
      addr: 0xD026AC, width: 16, value: 0x0000,
      source: 'Computed: BC=0x000000, stored via SIS LD (0x26AC), BC',
      meaning: 'Background color = 0x0000 (black in RGB565). 16-bit SIS write with MBASE=0xD0.',
    },
    {
      addr: 0xD02FD6, width: 24, value: null,
      source: 'Conditional: 0x001E if D007E0==0x58, else 0x000000',
      meaning: 'LCD clip Y-offset. 30 pixels for LCD type 0x58, otherwise 0. Used by text renderer for clipping.',
    },
  ];

  // LDIR writes (ROM 0x05550C -> RAM D02FD9, 13 bytes)
  const ldirWrites = [
    {
      addr: 0xD02FD9, width: 24, value: read24(rom, LDIR_SOURCE),
      source: `ROM copy via LDIR: 3 bytes from ${hex(LDIR_SOURCE)}`,
      meaning: `Screen width in pixels = ${read24(rom, LDIR_SOURCE)} (320 = 0x140). Used for text wrapping.`,
    },
    {
      addr: 0xD02FDC, width: 24, value: read24(rom, LDIR_SOURCE + 3),
      source: `ROM copy via LDIR: 3 bytes from ${hex(LDIR_SOURCE + 3)}`,
      meaning: `Screen height in pixels = ${read24(rom, LDIR_SOURCE + 3)} (240 = 0xF0). Used for vertical bounds.`,
    },
    {
      addr: 0xD02FE0, width: 24, value: read24(rom, LDIR_SOURCE + 7),
      source: `ROM copy via LDIR: 3 bytes from ${hex(LDIR_SOURCE + 7)} (note: 1 byte offset within LDIR block)`,
      meaning: `VRAM row stride = ${read24(rom, LDIR_SOURCE + 7)} (640 = 0x280). 320 pixels × 2 bytes/pixel (RGB565).`,
    },
    {
      addr: 0xD02FE3, width: 24, value: read24(rom, LDIR_SOURCE + 10),
      source: `ROM copy via LDIR: 3 bytes from ${hex(LDIR_SOURCE + 10)}`,
      meaning: `VRAM base address = ${hex(read24(rom, LDIR_SOURCE + 10))}. Start of video RAM.`,
    },
  ];

  console.log('Direct writes in caller continuation:\n');
  for (const w of writes) {
    const val = w.value !== null ? hex(w.value, w.width <= 8 ? 2 : w.width <= 16 ? 4 : 6) : '(conditional)';
    console.log(`  ${hex(w.addr)}: ${val} (${w.width}-bit)`);
    console.log(`    Source: ${w.source}`);
    console.log(`    Meaning: ${w.meaning}`);
    console.log('');
  }

  console.log('LDIR block: 13 bytes from ROM 0x05550C -> RAM D02FD9:\n');
  console.log('  Raw ROM data:');
  console.log(`  ${bytesToHex(rom.subarray(LDIR_SOURCE, LDIR_SOURCE + LDIR_LENGTH))}\n`);
  for (const w of ldirWrites) {
    console.log(`  ${hex(w.addr)}: ${hex(w.value)} (24-bit, byte-aligned read)`);
    console.log(`    Source: ${w.source}`);
    console.log(`    Meaning: ${w.meaning}`);
    console.log('');
  }

  // Also show the byte-level mapping
  console.log('  Byte-level LDIR mapping:');
  for (let i = 0; i < LDIR_LENGTH; i++) {
    console.log(`    ROM ${hex(LDIR_SOURCE + i)} -> RAM ${hex(0xD02FD9 + i)} = ${hexByte(rom[LDIR_SOURCE + i])}`);
  }

  console.log('\n4) Relationship to 0x055191 (sync gate)\n');
  console.log('0x055191 is the sync gate. It checks D000C6 bit 1:');
  console.log('  - If bit 1 SET: RET immediately at 0x05519E (fast path, already initialized)');
  console.log('  - If bit 1 CLEAR: CALL Z 0x05519F (slow path, first-time init)');
  console.log('');
  console.log('0x05519F (the slow path) is the function that CONTAINS 0x0551B1.');
  console.log('It does NOT call 0x055191 again — instead, 0x05519F IS the target of the');
  console.log('conditional call from 0x055191. The call chain is:');
  console.log('');
  console.log('  [any caller] -> 0x055191 (gate)');
  console.log('    -> if D000C6.1 clear: CALL 0x05519F (slow path)');
  console.log('      -> SET D000C6 bit 1 (mark as initialized)');
  console.log('      -> PUSH 0 / CALL 0x055316 (config selector, arg=0)');
  console.log('      -> 0x0551B1: POP BC / init LCD params');
  console.log('      -> LDIR: copy VRAM layout from ROM');
  console.log('      -> RET to 0x05519E');
  console.log('    -> RET (gate returns to original caller)');

  console.log('\n5) Config table cross-reference\n');

  for (let entry = 0; entry < 2; entry++) {
    const base = TABLE_BASE + entry * TABLE_STRIDE;
    const bytes = bytesToHex(rom.subarray(base, base + TABLE_STRIDE));
    const fields = [];
    for (let f = 0; f < 4; f++) {
      fields.push(hex(read24(rom, base + f * 3)));
    }
    console.log(`  Config entry ${entry} @ ${hex(base)}: ${bytes}`);
    console.log(`    Field 0 (+0): ${fields[0]} (config index)`);
    console.log(`    Field 1 (+3): ${fields[1]} (function pointer 1 — text renderer)`);
    console.log(`    Field 2 (+6): ${fields[2]} (function pointer 2)`);
    console.log(`    Field 3 (+9): ${fields[3]} (function pointer 3)`);
    console.log('');
  }
  console.log('  Config selector stores pointer to the selected entry into D005E9.');
  console.log('  Default boot uses selector 0 -> entry at 0x0525D4.');
  console.log('  Entry 0 field 1 = 0x054FC6 (variable-width text renderer).');
  console.log('  Entry 1 field 1 = 0x054E21 (fixed-width text renderer / home screen font).');

  console.log('\n6) Font descriptor table at ROM 0x05320F (stored to D005F0)\n');
  console.log('  First 16 entries:');
  for (let i = 0; i < 16; i++) {
    const addr = FONT_TABLE_PTR + i * 3;
    const ptr = read24(rom, addr);
    console.log(`    [${i}] ${hex(addr)} -> ${hex(ptr)}`);
  }
  console.log(`\n  Font table limit at ROM ${hex(FONT_TABLE_LIMIT_ADDR)}: ${hex(read24(rom, FONT_TABLE_LIMIT_ADDR))} (stored to D005ED)`);
}

// ─── Dynamic trace ───

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase329-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    return normalizeBlocks(rawBlocks);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

function classifyWrite(addr) {
  if (addr >= (STACK_BASE - 0x40) && addr < (STACK_BASE + 0x20)) {
    return 'stack';
  }
  if (addr >= 0xE00000) {
    return 'mmio';
  }
  if (addr >= 0xD00000) {
    return 'ram';
  }
  return 'other';
}

function getBlockCallEdge(startPc, cache) {
  if (cache.has(startPc)) {
    return cache.get(startPc);
  }

  let pc = startPc;
  let edge = null;

  while (pc >= 0 && pc < rom.length) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      edge = {
        from: startPc,
        target: inst.target,
        returnPc: nextPc(inst),
        kind: inst.tag,
      };
      break;
    }

    if (isConditionalBranch(inst) || isUnconditionalBranch(inst) || isReturn(inst)) {
      break;
    }

    pc = nextPc(inst);
  }

  cache.set(startPc, edge);
  return edge;
}

async function runDynamicTrace(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  // Set up CPU state for calling 0x055191 (the sync gate)
  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.ix = 0x000000;
  cpu.iy = 0x000000;
  cpu.sp = STACK_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Push return sentinel onto stack
  write24(mem, STACK_BASE, RETURN_SENTINEL);

  // D000C6 bit 1 CLEAR so we take the slow path
  mem[GUARD_FLAG_ADDR] &= ~0x02;

  // Set LCD type to default (not 0x58)
  mem[LCD_TYPE_ADDR] = 0x00;

  // Clear all target RAM addresses
  const targetAddrs = [
    LCD_PARAM_D005EC, LCD_PARAM_D005ED, LCD_PARAM_D005F0, LCD_PARAM_D005F4,
    LCD_PARAM_D02FD6, LCD_PARAM_D02FD9, LCD_PARAM_D02FDC, LCD_PARAM_D02FE0,
    LCD_PARAM_D02FE3, DESCRIPTOR_PTR_RAM,
  ];
  for (const addr of targetAddrs) {
    write24(mem, addr, 0x000000);
  }
  write16(mem, BG_COLOR_ADDR, 0xFFFF); // pre-fill with white to see the change

  const ramWrites = [];
  const blockTrail = [];
  const callEvents = [];
  const callEdgeCache = new Map();
  const returnStack = [];
  let currentDepth = 0;
  let lastBlockPc = null;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordWrite(addr, value, width) {
    const normalizedAddr = addr & 0xFFFFFF;
    const region = classifyWrite(normalizedAddr);
    ramWrites.push({
      addr: normalizedAddr,
      value: value & (width === 8 ? 0xFF : width === 16 ? 0xFFFF : 0xFFFFFF),
      width,
      region,
      pc: cpu._currentBlockPc ?? 0,
    });
  }

  cpu.write8 = (addr, value) => {
    recordWrite(addr, value, 8);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite(addr, value, 16);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite(addr, value, 24);
    return origWrite24(addr, value);
  };

  const result = executor.runFrom(SYNC_GATE, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 16,
    onBlock(pc) {
      if (returnStack.length && pc === returnStack.at(-1)) {
        returnStack.pop();
        currentDepth = Math.max(0, currentDepth - 1);
        callEvents.push({ type: 'return', to: pc, depth: currentDepth });
      }

      if (lastBlockPc !== null) {
        const edge = getBlockCallEdge(lastBlockPc, callEdgeCache);
        if (edge && edge.target === pc) {
          currentDepth += 1;
          returnStack.push(edge.returnPc);
          callEvents.push({
            type: 'call',
            from: edge.from,
            to: edge.target,
            returnPc: edge.returnPc,
            depth: currentDepth,
          });
        }
      }

      blockTrail.push(pc);
      lastBlockPc = pc;
    },
  });

  const logicalTermination =
    result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL
      ? 'returned_to_sentinel'
      : result.termination;

  return {
    logicalTermination,
    rawTermination: result.termination,
    lastPc: result.lastPc,
    steps: result.steps,
    blockTrail,
    callEvents,
    ramWrites,
    mem,
  };
}

// ─── Main ───

printFullDisassembly();

console.log('\n\n7) Dynamic trace — boot config (D000C6 bit 1 clear, LCD type != 0x58)\n');

const blocksMap = await loadBlocks();
const trace = await runDynamicTrace(blocksMap);

console.log(`Termination: ${trace.logicalTermination} (raw=${trace.rawTermination})`);
console.log(`Steps: ${trace.steps}`);
console.log(`Last PC: ${hex(trace.lastPc)}`);
console.log('');

console.log('Block trail:');
console.log(`  ${trace.blockTrail.map((pc) => hex(pc)).join(' -> ')}`);
console.log('');

console.log('Call depth events:');
for (const event of trace.callEvents) {
  if (event.type === 'call') {
    console.log(`  CALL ${hex(event.from)} -> ${hex(event.to)} (return ${hex(event.returnPc)}) depth=${event.depth}`);
  } else {
    console.log(`  RETURN -> ${hex(event.to)} depth=${event.depth}`);
  }
}
console.log('');

console.log('Non-stack RAM writes:');
const nonStackWrites = trace.ramWrites.filter((w) => w.region === 'ram');
for (const w of nonStackWrites) {
  const valStr = hex(w.value, w.width <= 8 ? 2 : w.width <= 16 ? 4 : 6);
  console.log(`  ${hex(w.addr)} = ${valStr} (${w.width}-bit, from block ${hex(w.pc)})`);
}
console.log('');

console.log('8) Final LCD parameter state after boot init\n');

const finalState = [
  { name: 'D000C6 (guard flags)', addr: GUARD_FLAG_ADDR, width: 8 },
  { name: 'D005E9 (config descriptor ptr)', addr: DESCRIPTOR_PTR_RAM, width: 24 },
  { name: 'D005EC (alpha/opacity init)', addr: LCD_PARAM_D005EC, width: 8 },
  { name: 'D005ED (font table limit)', addr: LCD_PARAM_D005ED, width: 24 },
  { name: 'D005F0 (font descriptor table ptr)', addr: LCD_PARAM_D005F0, width: 24 },
  { name: 'D005F4 (alpha/opacity active)', addr: LCD_PARAM_D005F4, width: 8 },
  { name: 'D026AC (bg color, RGB565)', addr: BG_COLOR_ADDR, width: 16 },
  { name: 'D02FD6 (clip Y-offset)', addr: LCD_PARAM_D02FD6, width: 24 },
  { name: 'D02FD9 (screen width)', addr: LCD_PARAM_D02FD9, width: 24 },
  { name: 'D02FDC (screen height)', addr: LCD_PARAM_D02FDC, width: 24 },
  { name: 'D02FE0 (VRAM row stride)', addr: LCD_PARAM_D02FE0, width: 24 },
  { name: 'D02FE3 (VRAM base address)', addr: LCD_PARAM_D02FE3, width: 24 },
];

for (const param of finalState) {
  let value;
  if (param.width === 8) {
    value = trace.mem[param.addr];
  } else if (param.width === 16) {
    value = read16(trace.mem, param.addr);
  } else {
    value = read24(trace.mem, param.addr);
  }
  const w = param.width <= 8 ? 2 : param.width <= 16 ? 4 : 6;
  console.log(`  ${param.name}: ${hex(value, w)}`);
}

console.log('\n9) Summary\n');
console.log('The function at 0x05519F is the slow path of the LCD sync gate 0x055191.');
console.log('It runs exactly once (guarded by D000C6 bit 1) during boot to initialize');
console.log('all LCD rendering parameters. The caller continuation at 0x0551B1 performs:');
console.log('');
console.log('  1. D005EC = 0x00 (alpha = transparent, initial state)');
console.log('  2. D005F4 = 0xFF (alpha = opaque, active rendering alpha)');
console.log(`  3. D005F0 = 0x05320F (font descriptor table pointer in ROM)`);
console.log(`  4. D005ED = ${hex(read24(rom, 0x05323F))} (font table limit, loaded from ROM 0x05323F)`);
console.log('  5. D026AC = 0x0000 (background color = black, RGB565, via SIS LD)');
console.log('  6. D02FD6 = 0x001E or 0x0000 (clip Y-offset, depends on LCD type at D007E0)');
console.log('  7. LDIR copies 13 bytes from ROM 0x05550C to D02FD9:');
console.log(`     D02FD9 = 0x000140 (screen width = 320)`);
console.log(`     D02FDC = 0x0000F0 (screen height = 240)`);
console.log(`     D02FE0 = 0x000280 (VRAM row stride = 640 = 320×2)`);
console.log(`     D02FE3 = 0xD40000 (VRAM base address)`);
console.log('');
console.log('Session 327 misattributed these writes to 0x055316 (the config selector).');
console.log('0x055316 only writes D005E9 (config descriptor pointer). All other LCD');
console.log('parameter initialization happens in the caller continuation at 0x0551B1.');
