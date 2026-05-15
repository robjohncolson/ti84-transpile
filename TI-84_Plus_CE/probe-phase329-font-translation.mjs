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
const STACK_BASE = 0xD1A800;
const RETURN_SENTINEL = 0xFFFFFE;

// --- Target addresses ---

// The 5 original sub-functions from session 226
const SUBFUNC_0 = 0x02398E; // HL-preserving flag clearer, 55 callers
const SUBFUNC_1 = 0x0239B3; // loads D025E1
const SUBFUNC_2 = 0x0239CD; // loads D025E4, uses alternate helper 0x0238B2
const SUBFUNC_3 = 0x0239E3; // loads D025E7
const SUBFUNC_4 = 0x0239FE; // loads D025EA, also clears IY+58 bit 1

// The font translation target
const FONT_XLAT = 0x023A1C; // loads D025ED, clears IY+53 bit 5

// Additional siblings discovered in this region
const SUBFUNC_6 = 0x023A35; // loads D025F6
const SUBFUNC_7 = 0x023A50; // loads D025F0
const SUBFUNC_8 = 0x023A6A; // loads D025F9
const SUBFUNC_9 = 0x023A84; // loads D025FC
const SUBFUNC_10 = 0x023A9E; // loads D025F3
const SUBFUNC_11 = 0x023AB8; // loads D025FF

// Common helpers
const PTR_DEREF = 0x025758; // LD HL,(HL); LD A,(HL); INC HL; PUSH HL; POP IX; CP 0x83; RET
const ALT_PTR_DEREF = 0x0238B2; // alternate helper used by SUBFUNC_2
const Z_PATH_HANDLER = 0x025762; // JP Z target — error/increment counter path

// Region boundaries for full disassembly
const REGION_START = 0x02398E;
const REGION_END = 0x023AD1; // last RET of SUBFUNC_11

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
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

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >> 8) & 0xFF;
  buffer[addr + 2] = (value >> 16) & 0xFF;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister ?? '').toUpperCase()}${formatDisp(displacement)})`;
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

function isReturn(inst) {
  return ['ret', 'reti', 'retn', 'ret-conditional'].includes(inst.tag);
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
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
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src ?? 'HL').toUpperCase()})`;
    case 'ld-pair-ind':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src ?? 'HL').toUpperCase()})`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC (HL)`;
    case 'dec-reg':
      return `${prefix}DEC (HL)`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'nop':
      return `${prefix}NOP`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` val=${hex(inst.value)}`;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.displacement !== undefined) text += ` disp=${inst.displacement}`;
      if (inst.pair) text += ` ${inst.pair}`;
      if (inst.src) text += ` src=${inst.src}`;
      if (inst.dest) text += ` dest=${inst.dest}`;
      return text;
    }
  }
}

function formatBytesFor(inst) {
  return bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length));
}

// --- Sub-function catalog ---

const SUB_FUNCTIONS = [
  { addr: 0x02398E, label: 'SUBFUNC_0', pointer: 0xD02611, iyDisp: 53, iyBit: 1, op: 'RES', storeAddr: 0xD025CF, storeVal: 0x0109, helper: 0x025758 },
  { addr: 0x0239B3, label: 'SUBFUNC_1', pointer: 0xD025E1, iyDisp: 52, iyBit: 4, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x0239CD, label: 'SUBFUNC_2', pointer: 0xD025E4, iyDisp: 53, iyBit: 2, op: 'RES', storeAddr: null, storeVal: null, helper: 0x0238B2 },
  { addr: 0x0239E3, label: 'SUBFUNC_3', pointer: 0xD025E7, iyDisp: 53, iyBit: 3, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x0239FE, label: 'SUBFUNC_4', pointer: 0xD025EA, iyDisp: [53, 58], iyBit: [4, 1], op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758, note: 'clears TWO IY bits: (IY+53) bit 4 AND (IY+58) bit 1' },
  { addr: 0x023A1C, label: 'FONT_XLAT', pointer: 0xD025ED, iyDisp: 53, iyBit: 5, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758, note: 'font translation — called by both font lookup functions' },
  { addr: 0x023A35, label: 'SUBFUNC_6', pointer: 0xD025F6, iyDisp: 54, iyBit: 0, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x023A50, label: 'SUBFUNC_7', pointer: 0xD025F0, iyDisp: 53, iyBit: 6, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x023A6A, label: 'SUBFUNC_8', pointer: 0xD025F9, iyDisp: 54, iyBit: 1, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x023A84, label: 'SUBFUNC_9', pointer: 0xD025FC, iyDisp: 54, iyBit: 2, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x023A9E, label: 'SUBFUNC_10', pointer: 0xD025F3, iyDisp: 53, iyBit: 7, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
  { addr: 0x023AB8, label: 'SUBFUNC_11', pointer: 0xD025FF, iyDisp: 54, iyBit: 3, op: 'RES', storeAddr: null, storeVal: null, helper: 0x025758 },
];

// --- Section 1: Full static disassembly ---

function printStaticDisassembly() {
  console.log('=== Phase 329: Font Translation Routines 0x02398E..0x023AD1 ===\n');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
  console.log(`Region: ${hex(REGION_START)} - ${hex(REGION_END)}`);
  console.log(`Sub-functions identified: ${SUB_FUNCTIONS.length}\n`);

  console.log('1) Full static disassembly of 0x02398E through 0x023AD1\n');

  // Find sub-function boundaries
  const funcStartSet = new Set(SUB_FUNCTIONS.map((sf) => sf.addr));

  let pc = REGION_START;
  while (pc <= REGION_END) {
    if (funcStartSet.has(pc)) {
      const sf = SUB_FUNCTIONS.find((s) => s.addr === pc);
      console.log(`\n--- ${sf.label} at ${hex(sf.addr)} ---`);
      console.log(`    D025xx pointer: ${hex(sf.pointer)}`);
      const iyDisps = Array.isArray(sf.iyDisp) ? sf.iyDisp : [sf.iyDisp];
      const iyBits = Array.isArray(sf.iyBit) ? sf.iyBit : [sf.iyBit];
      for (let i = 0; i < iyDisps.length; i++) {
        console.log(`    IY flag: ${sf.op} ${iyBits[i]}, (IY+${iyDisps[i]})`);
      }
      if (sf.storeAddr) {
        console.log(`    Store: ${hex(sf.storeVal, 4)} -> ${hex(sf.storeAddr)}`);
      }
      console.log(`    Helper: ${hex(sf.helper)}`);
      if (sf.note) console.log(`    Note: ${sf.note}`);
      console.log('');
    }

    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      console.log(`  ${hex(pc)}: ?? (decode error)`);
      pc++;
      continue;
    }

    const bytes = formatBytesFor(inst).padEnd(28);
    const text = formatInstruction(inst);
    console.log(`  ${hex(pc)}: ${bytes} ${text}`);
    pc = nextPc(inst);
  }
}

// --- Section 2: Decode 0x023A1C differences ---

function printFontXlatAnalysis() {
  console.log('\n\n2) 0x023A1C (FONT_XLAT) vs 0x02398E (SUBFUNC_0) comparison\n');

  console.log('Both follow the same template:');
  console.log('  PUSH IX / PUSH AF / PUSH HL');
  console.log('  LD HL, <D025xx pointer>');
  console.log('  CALL 0x025758  (pointer deref: HL=(HL); A=(HL); INC HL; IX=HL; CP 0x83)');
  console.log('  POP HL  (restore original HL)');
  console.log('  JP Z, 0x025762  (if derefed byte == 0x83 -> error/counter path)');
  console.log('  POP AF / POP IX');
  console.log('  RES <bit>, (IY+<disp>)  (clear specific IY flag)');
  console.log('  RET\n');

  console.log('Key differences:\n');

  console.log('  SUBFUNC_0 (0x02398E):');
  console.log('    - Pointer: D02611');
  console.log('    - Clears: IY+53 bit 1');
  console.log('    - UNIQUE: After POP HL, does OR 0x01 (sets carry-like flag in A)');
  console.log('    - UNIQUE: Stores 0x0109 to D025CF (SIS-mode LD)');
  console.log('    - 55 call sites — by far the most used\n');

  console.log('  FONT_XLAT (0x023A1C):');
  console.log('    - Pointer: D025ED');
  console.log('    - Clears: IY+53 bit 5');
  console.log('    - No extra store, no OR — pure flag clear');
  console.log('    - 3 call sites: JP at 0x020130, CALL at 0x07BF47, CALL at 0x0A5408');
  console.log('    - Called specifically by font lookup:');
  console.log('      0x07BF47 is inside the fixed-width font renderer (0x07BF3E)');
  console.log('      0x0A5408 is inside the variable-width font renderer (0x0A5424)\n');

  console.log('  SUBFUNC_4 (0x0239FE) is also notable:');
  console.log('    - Pointer: D025EA');
  console.log('    - Clears TWO flags: IY+53 bit 4 AND IY+58 bit 1');
  console.log('    - Only sub-function that touches IY+58\n');

  console.log('  Interpretation:');
  console.log('    These are all "translation reset" routines. Each one:');
  console.log('    1. Dereferences a D025xx pointer to get a handler descriptor');
  console.log('    2. Loads the handler address into IX (via 0x025758)');
  console.log('    3. Clears an IY-based "translation active" flag');
  console.log('    The IY+53/IY+54 bits are a bitmask of which translations are currently active.');
  console.log('    FONT_XLAT specifically resets the "font translation" flag (IY+53 bit 5),');
  console.log('    which the font lookup functions check before rendering glyphs.\n');
}

// --- Section 3: D025xx pointer analysis ---

function printPointerAnalysis() {
  console.log('3) D025xx pointer table analysis\n');

  console.log('Each sub-function loads a different D025xx address into HL before calling');
  console.log('the pointer deref helper. These are 3-byte pointers in RAM that point to');
  console.log('handler descriptors. The deref helper does:');
  console.log('  HL = (HL)          ; follow the 3-byte pointer');
  console.log('  A = (HL)           ; read first byte of descriptor');
  console.log('  HL++               ; advance past it');
  console.log('  IX = HL            ; save descriptor+1 address in IX');
  console.log('  CP 0x83            ; test if descriptor starts with 0x83 (invalid/unset marker)');
  console.log('  RET                ; Z flag set if descriptor is invalid\n');

  console.log('Pointer map (RAM address -> purpose):\n');

  const pointerAddrs = SUB_FUNCTIONS.map((sf) => sf.pointer).sort((a, b) => a - b);
  const uniquePointers = [...new Set(pointerAddrs)];

  for (const addr of uniquePointers) {
    const sfs = SUB_FUNCTIONS.filter((sf) => sf.pointer === addr);
    const labels = sfs.map((sf) => `${sf.label} (${hex(sf.addr)})`).join(', ');
    console.log(`  ${hex(addr)}: used by ${labels}`);
  }

  console.log('\n  Grouped by IY displacement:\n');

  // IY+52 (0x34)
  console.log('  IY+52 (flags byte 0x34):');
  for (const sf of SUB_FUNCTIONS) {
    const disps = Array.isArray(sf.iyDisp) ? sf.iyDisp : [sf.iyDisp];
    const bits = Array.isArray(sf.iyBit) ? sf.iyBit : [sf.iyBit];
    for (let i = 0; i < disps.length; i++) {
      if (disps[i] === 52) {
        console.log(`    bit ${bits[i]}: ${sf.label} (${hex(sf.addr)}) -> pointer ${hex(sf.pointer)}`);
      }
    }
  }

  // IY+53 (0x35)
  console.log('  IY+53 (flags byte 0x35):');
  for (const sf of SUB_FUNCTIONS) {
    const disps = Array.isArray(sf.iyDisp) ? sf.iyDisp : [sf.iyDisp];
    const bits = Array.isArray(sf.iyBit) ? sf.iyBit : [sf.iyBit];
    for (let i = 0; i < disps.length; i++) {
      if (disps[i] === 53) {
        console.log(`    bit ${bits[i]}: ${sf.label} (${hex(sf.addr)}) -> pointer ${hex(sf.pointer)}`);
      }
    }
  }

  // IY+54 (0x36)
  console.log('  IY+54 (flags byte 0x36):');
  for (const sf of SUB_FUNCTIONS) {
    const disps = Array.isArray(sf.iyDisp) ? sf.iyDisp : [sf.iyDisp];
    const bits = Array.isArray(sf.iyBit) ? sf.iyBit : [sf.iyBit];
    for (let i = 0; i < disps.length; i++) {
      if (disps[i] === 54) {
        console.log(`    bit ${bits[i]}: ${sf.label} (${hex(sf.addr)}) -> pointer ${hex(sf.pointer)}`);
      }
    }
  }

  // IY+58 (0x3A)
  console.log('  IY+58 (flags byte 0x3A):');
  for (const sf of SUB_FUNCTIONS) {
    const disps = Array.isArray(sf.iyDisp) ? sf.iyDisp : [sf.iyDisp];
    const bits = Array.isArray(sf.iyBit) ? sf.iyBit : [sf.iyBit];
    for (let i = 0; i < disps.length; i++) {
      if (disps[i] === 58) {
        console.log(`    bit ${bits[i]}: ${sf.label} (${hex(sf.addr)}) -> pointer ${hex(sf.pointer)}`);
      }
    }
  }

  console.log('\n  Additional RAM addresses referenced:');
  console.log(`  ${hex(0xD025CF)}: SUBFUNC_0 stores 0x0109 here (SIS-mode 16-bit store)`);
  console.log(`  ${hex(0xD025D2)}: used by alternate helper 0x0238B2 (stores HL after deref)`);
  console.log(`  ${hex(0xD0265B)}: error counter incremented by Z-path handler 0x025762`);
}

// --- Section 4: Caller scan ---

function scanCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const callers = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      if (rom[i] === 0xCD) {
        callers.push({ addr: i, type: 'CALL' });
      } else if (rom[i] === 0xC3) {
        callers.push({ addr: i, type: 'JP' });
      }
    }
  }

  return callers;
}

function printCallerScan() {
  console.log('\n\n4) All callers of 0x023A1C (FONT_XLAT)\n');

  const callers = scanCallers(0x023A1C);
  console.log(`Found ${callers.length} call/jump sites:\n`);

  for (const caller of callers) {
    // Show context: disassemble a few instructions before and after
    const contextStart = Math.max(0, caller.addr - 8);
    console.log(`  ${caller.type} at ${hex(caller.addr)}:`);

    // Try to find the containing function
    let funcStart = caller.addr;
    for (let scan = caller.addr - 1; scan >= caller.addr - 64; scan--) {
      // Look for a RET or similar terminator just before
      const byte = rom[scan];
      if (byte === 0xC9) { // RET
        funcStart = scan + 1;
        break;
      }
    }

    // Disassemble a few instructions around the call site
    let pc = caller.addr;
    for (let j = 0; j < 3; j++) {
      const inst = decodeSafe(pc);
      if (!inst) break;
      const bytes = formatBytesFor(inst).padEnd(28);
      const text = formatInstruction(inst);
      const marker = pc === caller.addr ? ' <-- HERE' : '';
      console.log(`    ${hex(pc)}: ${bytes} ${text}${marker}`);
      pc = nextPc(inst);
    }
    console.log('');
  }

  // Also show callers of each sub-function for comparison
  console.log('  Caller counts for all sub-functions:\n');
  for (const sf of SUB_FUNCTIONS) {
    const count = scanCallers(sf.addr).length;
    console.log(`    ${sf.label} (${hex(sf.addr)}): ${count} callers`);
  }
  console.log('');
}

// --- Section 5: Helper function disassembly ---

function printHelperDisassembly() {
  console.log('5) Helper function disassembly\n');

  console.log('--- 0x025758: Pointer deref helper (used by 11 of 12 sub-functions) ---\n');
  let pc = PTR_DEREF;
  while (true) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    const bytes = formatBytesFor(inst).padEnd(28);
    const text = formatInstruction(inst);
    let annotation = '';
    if (inst.tag === 'ld-pair-ind') annotation = ' ; HL = *(HL) — follow the 3-byte pointer';
    if (inst.tag === 'ld-reg-ind' && inst.dest === 'a') annotation = ' ; A = first byte of target descriptor';
    if (inst.tag === 'inc-pair') annotation = ' ; advance past the type byte';
    if (inst.tag === 'push' && inst.pair === 'hl') annotation = ' ; save descriptor+1 addr';
    if (inst.tag === 'pop' && inst.pair === 'ix') annotation = ' ; IX = descriptor+1 address';
    if (inst.tag === 'alu-imm') annotation = ' ; test if descriptor type == 0x83 (invalid)';
    if (inst.tag === 'ret') annotation = ' ; Z flag = descriptor is invalid';
    console.log(`  ${hex(pc)}: ${bytes} ${text}${annotation}`);
    if (isReturn(inst)) break;
    pc = nextPc(inst);
  }

  console.log('\n--- 0x0238B2: Alternate deref helper (used by SUBFUNC_2 only) ---\n');
  pc = ALT_PTR_DEREF;
  while (true) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    const bytes = formatBytesFor(inst).padEnd(28);
    const text = formatInstruction(inst);
    console.log(`  ${hex(pc)}: ${bytes} ${text}`);
    if (isReturn(inst)) break;
    pc = nextPc(inst);
  }

  console.log('\n--- 0x025762: Z-path error handler (JP Z target) ---\n');
  pc = Z_PATH_HANDLER;
  while (true) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    const bytes = formatBytesFor(inst).padEnd(28);
    const text = formatInstruction(inst);
    let annotation = '';
    if (inst.tag === 'ld-pair-imm' && inst.value === 0xD0265B) annotation = ' ; error counter address';
    if (inst.tag === 'inc-reg') annotation = ' ; increment error counter';
    console.log(`  ${hex(pc)}: ${bytes} ${text}${annotation}`);
    if (inst.tag === 'jp' || inst.tag === 'ret') break;
    pc = nextPc(inst);
  }

  console.log('\n--- 0x023955: Decrement-and-return (JP target from Z-path) ---\n');
  pc = 0x023955;
  while (true) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    const bytes = formatBytesFor(inst).padEnd(28);
    const text = formatInstruction(inst);
    let annotation = '';
    if (inst.tag === 'ld-pair-imm' && inst.value === 0xD0265B) annotation = ' ; same error counter';
    if (inst.tag === 'dec-reg') annotation = ' ; decrement error counter';
    console.log(`  ${hex(pc)}: ${bytes} ${text}${annotation}`);
    if (isReturn(inst)) break;
    pc = nextPc(inst);
  }
  console.log('');
}

// --- Section 6: Dynamic traces ---

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
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
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
  if (addr >= (STACK_BASE - 0x40) && addr < (STACK_BASE + 0x20)) return 'stack';
  if (addr >= 0xE00000) return 'mmio';
  if (addr >= 0xD00000) return 'ram';
  return 'other';
}

async function runDynamicTrace(blocks, targetAddr, label, setupFn) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  // Default register state
  cpu.a = 0x42;
  cpu.f = 0x00;
  cpu._bc = 0x000000;
  cpu._de = 0x000000;
  cpu._hl = 0xABCDEF; // distinctive value to verify HL preservation
  cpu._ix = 0x000000;
  cpu._iy = 0xD00000; // TI-OS convention: IY = D00000 (flags base)
  cpu.sp = STACK_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Push return sentinel
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Let the setup function configure memory and flags
  if (setupFn) setupFn(mem, cpu);

  // Snapshot IY flags before execution
  const iyBase = cpu._iy & 0xFFFFFF;
  const iy52Before = mem[iyBase + 52];
  const iy53Before = mem[iyBase + 53];
  const iy54Before = mem[iyBase + 54];
  const iy58Before = mem[iyBase + 58];
  const hlBefore = cpu._hl;
  const aBefore = cpu.a;

  const blockTrail = [];
  const ramWrites = [];

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordWrite(addr, value, width) {
    const norm = addr & 0xFFFFFF;
    const region = classifyWrite(norm);
    if (region === 'ram') {
      ramWrites.push({
        addr: norm,
        value: value & (width === 8 ? 0xFF : width === 16 ? 0xFFFF : 0xFFFFFF),
        width,
      });
    }
  }

  cpu.write8 = (addr, value) => { recordWrite(addr, value, 8); return origWrite8(addr, value); };
  cpu.write16 = (addr, value) => { recordWrite(addr, value, 16); return origWrite16(addr, value); };
  cpu.write24 = (addr, value) => { recordWrite(addr, value, 24); return origWrite24(addr, value); };

  const result = executor.runFrom(targetAddr, 'adl', {
    maxSteps: 64,
    maxLoopIterations: 16,
    onBlock(pc) {
      blockTrail.push(pc);
    },
  });

  const logicalTermination =
    result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL
      ? 'returned_to_sentinel'
      : result.termination;

  const iy52After = mem[iyBase + 52];
  const iy53After = mem[iyBase + 53];
  const iy54After = mem[iyBase + 54];
  const iy58After = mem[iyBase + 58];

  return {
    label,
    targetAddr,
    logicalTermination,
    steps: result.steps,
    lastPc: result.lastPc,
    blockTrail,
    ramWrites,
    hlBefore,
    hlAfter: cpu._hl,
    aBefore,
    aAfter: cpu.a,
    iy52: { before: iy52Before, after: iy52After },
    iy53: { before: iy53Before, after: iy53After },
    iy54: { before: iy54Before, after: iy54After },
    iy58: { before: iy58Before, after: iy58After },
    finalIX: cpu._ix,
    finalSP: cpu.sp,
  };
}

function flagDiff(label, before, after) {
  if (before === after) return `    ${label}: ${hexByte(before)} (unchanged)`;
  const changed = before ^ after;
  const bits = [];
  for (let b = 0; b < 8; b++) {
    if (changed & (1 << b)) {
      const was = (before >> b) & 1;
      const now = (after >> b) & 1;
      bits.push(`bit ${b}: ${was}->${now}`);
    }
  }
  return `    ${label}: ${hexByte(before)} -> ${hexByte(after)}  [${bits.join(', ')}]`;
}

function printDynamicTrace(result) {
  console.log(`--- Dynamic trace: ${result.label} ---`);
  console.log(`  Target: ${hex(result.targetAddr)}`);
  console.log(`  Termination: ${result.logicalTermination}`);
  console.log(`  Steps: ${result.steps}`);
  console.log(`  Block trail: ${result.blockTrail.map((pc) => hex(pc)).join(' -> ')}`);
  console.log(`  HL: ${hex(result.hlBefore)} -> ${hex(result.hlAfter)} ${result.hlBefore === result.hlAfter ? '(preserved)' : '(CHANGED)'}`);
  console.log(`  A: ${hexByte(result.aBefore)} -> ${hexByte(result.aAfter)}`);
  console.log(`  IX after: ${hex(result.finalIX)}`);
  console.log(`  SP after: ${hex(result.finalSP)}`);
  console.log('  IY flag changes:');
  console.log(flagDiff('IY+52', result.iy52.before, result.iy52.after));
  console.log(flagDiff('IY+53', result.iy53.before, result.iy53.after));
  console.log(flagDiff('IY+54', result.iy54.before, result.iy54.after));
  console.log(flagDiff('IY+58', result.iy58.before, result.iy58.after));

  if (result.ramWrites.length) {
    console.log('  Non-stack RAM writes:');
    for (const w of result.ramWrites) {
      console.log(`    write${w.width} ${hex(w.addr)} = ${hex(w.value, w.width / 4)}`);
    }
  }
  console.log('');
}

// --- Main ---

printStaticDisassembly();
printFontXlatAnalysis();
printPointerAnalysis();
printCallerScan();
printHelperDisassembly();

console.log('6) Dynamic traces\n');

const blocksMap = await loadBlocks();

// We need to set up valid pointer chains for the deref to work.
// Each D025xx pointer must point to a valid descriptor in RAM.
// We'll create fake descriptors so the deref doesn't hit 0x83 (invalid marker).

const FAKE_DESCRIPTOR_BASE = 0xD10000; // safe RAM area for fake descriptors

const scenarios = [
  {
    targetAddr: SUBFUNC_0,
    label: 'SUBFUNC_0 (0x02398E) — valid descriptor',
    setup(mem, cpu) {
      // Set all IY flag bits so we can see them get cleared
      const iyBase = cpu._iy & 0xFFFFFF;
      mem[iyBase + 52] = 0xFF;
      mem[iyBase + 53] = 0xFF;
      mem[iyBase + 54] = 0xFF;
      mem[iyBase + 58] = 0xFF;

      // D02611 -> points to a descriptor at FAKE_DESCRIPTOR_BASE
      write24(mem, 0xD02611, FAKE_DESCRIPTOR_BASE);
      // Descriptor: type byte (not 0x83) followed by handler address
      mem[FAKE_DESCRIPTOR_BASE] = 0x01; // valid type
      write24(mem, FAKE_DESCRIPTOR_BASE + 1, 0x070000); // fake handler addr
    },
  },
  {
    targetAddr: FONT_XLAT,
    label: 'FONT_XLAT (0x023A1C) — valid descriptor',
    setup(mem, cpu) {
      const iyBase = cpu._iy & 0xFFFFFF;
      mem[iyBase + 52] = 0xFF;
      mem[iyBase + 53] = 0xFF;
      mem[iyBase + 54] = 0xFF;
      mem[iyBase + 58] = 0xFF;

      // D025ED -> descriptor
      write24(mem, 0xD025ED, FAKE_DESCRIPTOR_BASE);
      mem[FAKE_DESCRIPTOR_BASE] = 0x01;
      write24(mem, FAKE_DESCRIPTOR_BASE + 1, 0x070000);
    },
  },
  {
    targetAddr: FONT_XLAT,
    label: 'FONT_XLAT (0x023A1C) — invalid descriptor (0x83)',
    setup(mem, cpu) {
      const iyBase = cpu._iy & 0xFFFFFF;
      mem[iyBase + 52] = 0xFF;
      mem[iyBase + 53] = 0xFF;
      mem[iyBase + 54] = 0xFF;
      mem[iyBase + 58] = 0xFF;

      // D025ED -> descriptor with 0x83 type (invalid)
      write24(mem, 0xD025ED, FAKE_DESCRIPTOR_BASE);
      mem[FAKE_DESCRIPTOR_BASE] = 0x83; // invalid marker
    },
  },
  {
    targetAddr: SUBFUNC_4,
    label: 'SUBFUNC_4 (0x0239FE) — valid descriptor (dual flag clear)',
    setup(mem, cpu) {
      const iyBase = cpu._iy & 0xFFFFFF;
      mem[iyBase + 52] = 0xFF;
      mem[iyBase + 53] = 0xFF;
      mem[iyBase + 54] = 0xFF;
      mem[iyBase + 58] = 0xFF;

      write24(mem, 0xD025EA, FAKE_DESCRIPTOR_BASE);
      mem[FAKE_DESCRIPTOR_BASE] = 0x01;
      write24(mem, FAKE_DESCRIPTOR_BASE + 1, 0x070000);
    },
  },
  {
    targetAddr: SUBFUNC_0,
    label: 'SUBFUNC_0 (0x02398E) — HL preservation test (HL=0xBEEF42)',
    setup(mem, cpu) {
      const iyBase = cpu._iy & 0xFFFFFF;
      mem[iyBase + 53] = 0xFF;
      cpu._hl = 0xBEEF42;

      write24(mem, 0xD02611, FAKE_DESCRIPTOR_BASE);
      mem[FAKE_DESCRIPTOR_BASE] = 0x01;
      write24(mem, FAKE_DESCRIPTOR_BASE + 1, 0x070000);
    },
  },
];

for (const scenario of scenarios) {
  const result = await runDynamicTrace(
    blocksMap,
    scenario.targetAddr,
    scenario.label,
    scenario.setup,
  );
  printDynamicTrace(result);
}

// --- Summary ---

console.log('7) Summary\n');
console.log('The 0x02398E-0x023AD1 region contains 12 "translation reset" sub-functions.');
console.log('All share the same template:');
console.log('  1. Save registers (PUSH IX/AF/HL)');
console.log('  2. Load a D025xx pointer into HL');
console.log('  3. Call the pointer-deref helper (0x025758 or 0x0238B2)');
console.log('     -> follows the pointer, reads descriptor type byte into A,');
console.log('        loads descriptor+1 address into IX, tests type against 0x83');
console.log('  4. If type == 0x83 (invalid): jump to error handler that increments D0265B');
console.log('  5. Otherwise: restore AF/IX, clear specific IY flag bit(s), RET');
console.log('');
console.log('FONT_XLAT (0x023A1C) is structurally identical to the others except:');
console.log('  - Uses pointer D025ED');
console.log('  - Clears IY+53 bit 5 (the "font translation active" flag)');
console.log('  - Called by exactly 3 sites:');
console.log('    * JP at 0x020130 (vector table entry)');
console.log('    * CALL at 0x07BF47 (inside fixed-width font renderer 0x07BF3E)');
console.log('    * CALL at 0x0A5408 (inside variable-width font renderer 0x0A5424)');
console.log('');
console.log('SUBFUNC_0 (0x02398E) is the only variant with extra side effects:');
console.log('  - OR 0x01 into A (ensures A != 0 on return)');
console.log('  - Stores 0x0109 to D025CF (SIS-mode 16-bit store)');
console.log('  - Has 55 call sites — the "default" translation reset');
console.log('');
console.log('The D025xx pointers form a translation handler table:');
console.log('  D025CF: mode/config value (written by SUBFUNC_0)');
console.log('  D025D2: secondary handler pointer (written by alt helper 0x0238B2)');
console.log('  D025E1..D025FF: 3-byte pointers to handler descriptors (one per translation)');
console.log('  D02611: primary handler pointer (used by SUBFUNC_0)');
console.log('  D0265B: error counter (incremented when descriptor type == 0x83)');
console.log('');
console.log('The IY+52/53/54/58 flag bytes track which translations are currently active.');
console.log('Each sub-function RES-es its specific bit to mark its translation as inactive.');
console.log('Font renderers check IY+53 bit 5 before glyph lookup; FONT_XLAT clears it.');
