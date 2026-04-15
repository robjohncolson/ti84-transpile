#!/usr/bin/env node

/**
 * Phase 168 — Stack Frame Fabrication for IX Fix
 *
 * Part A: Disassemble 0x00E882's caller context (find prologue, map frame)
 * Part B: Map the struct accessed by 0x00E4E8's function (IX displacement map)
 * Part C: Fabrication feasibility assessment (build fake struct, test rendering)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE1_ENTRY = 0x0A2B72;
const STAGE3_ENTRY = 0x0A29EC;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const STAGE1_MAX_STEPS = 30000;
const STAGE3_MAX_STEPS = 50000;

const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_LOOPS = 10000;
const STAGE_MAX_LOOPS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = MODE_TEXT.length;

const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

const FUNCTION_START = 0x00E4E8;
const FUNCTION_END = 0x00E57E;
const FRAME_HELPER = 0x002197;

const CALLER_E882 = 0x00E882;
const CALLER_FF75 = 0x00FF75;

const FABRICATED_STRUCT_ADDR = 0xD1A000;

const MAGIC_VALUE = 0xD141EC;
const MAGIC_BYTES = [0xEC, 0x41, 0xD1];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? {};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function signed24(value) {
  const masked = value & 0xFFFFFF;
  return masked & 0x800000 ? masked - 0x1000000 : masked;
}

function read24LE(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24LE(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >> 8) & 0xFF;
  mem[addr + 2] = (value >> 16) & 0xFF;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function safeDecode(pc, mode = 'adl') {
  if (pc < 0 || pc >= ROM_LIMIT) {
    return null;
  }

  try {
    const decoded = decodeInstruction(romBytes, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(decoded) {
  switch (decoded.tag) {
    case 'nop':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rrca':
    case 'rlca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'di':
    case 'ei':
    case 'exx':
    case 'halt':
    case 'slp':
    case 'neg':
    case 'ldir':
    case 'ldi':
      return decoded.tag;

    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;

    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister ?? 'hl'})`;

    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;

    case 'ret-conditional':
      return `ret ${decoded.condition}`;

    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;

    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'inc-reg':
      return `inc ${decoded.reg}`;
    case 'dec-reg':
      return `dec ${decoded.reg}`;

    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-ind':
      return `ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg':
      return `ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem':
      return `ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;

    case 'ld-ixd-imm':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-ixd':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-pair-indexed':
      return `ld ${decoded.pair}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.pair}`;
    case 'ld-ixiy-indexed':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hex(decoded.value, 2)}`;

    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'adc-pair':
      return `adc hl, ${decoded.src}`;
    case 'sbc-pair':
      return `sbc hl, ${decoded.src}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hex(decoded.value, 2)}`;
    case 'alu-ixd':
      return `${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'alu-ind':
      return `${decoded.op} (${decoded.src ?? decoded.indirectRegister ?? 'hl'})`;

    case 'in-imm':
      return `in a, (${hex(decoded.port, 2)})`;
    case 'out-imm':
      return `out (${hex(decoded.port, 2)}), a`;
    case 'in-reg':
      return `in ${decoded.reg}, (c)`;
    case 'out-reg':
      return `out (c), ${decoded.reg}`;

    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;

    case 'bit-test':
      return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind':
      return `bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-res':
      return `res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res-ind':
      return `res ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set':
      return `set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set-ind':
      return `set ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'rotate-reg':
      return `${decoded.op} ${decoded.reg}`;
    case 'rotate-ind':
      return `${decoded.op} (${decoded.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-rotate':
      return `${decoded.operation}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-res':
      return `res ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'indexed-cb-set':
      return `set ${decoded.bit}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'lea':
      return `lea ${decoded.dest}, ${formatIndexedOperand(decoded.base, decoded.displacement)}`;

    case 'mlt':
      return `mlt ${decoded.pair ?? 'hl'}`;

    default: {
      const ignored = new Set([
        'pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag',
      ]);
      const parts = [];
      for (const [key, value] of Object.entries(decoded)) {
        if (ignored.has(key) || value === undefined) continue;
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${String(value)}`);
        }
      }
      return parts.length === 0 ? decoded.tag : `${decoded.tag} ${parts.join(' ')}`;
    }
  }
}

function formatIxRelative(offset) {
  if (offset === 0) return 'IX+0';
  return `IX${offset >= 0 ? '+' : ''}${offset}`;
}

function formatIxSpan(offset, width) {
  if (width <= 1) return formatIxRelative(offset);
  return `${formatIxRelative(offset)}..${formatIxRelative(offset + width - 1)}`;
}

function findIxAccess(decoded) {
  switch (decoded.tag) {
    case 'ld-reg-ixd':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `reads byte ${formatIxSpan(decoded.displacement, 1)} into ${decoded.dest}` };
    case 'ld-ixd-reg':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'write', summary: `writes ${decoded.src} to ${formatIxSpan(decoded.displacement, 1)}` };
    case 'ld-ixd-imm':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'write', summary: `writes imm ${hex(decoded.value, 2)} to ${formatIxSpan(decoded.displacement, 1)}` };
    case 'alu-ixd':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `${decoded.op} reads byte from ${formatIxSpan(decoded.displacement, 1)}` };
    case 'ld-pair-indexed':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'read', summary: `reads 24-bit ${formatIxSpan(decoded.displacement, 3)} into ${decoded.pair}` };
    case 'ld-indexed-pair':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'write', summary: `writes 24-bit ${decoded.pair} to ${formatIxSpan(decoded.displacement, 3)}` };
    case 'ld-ixiy-indexed':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'read', summary: `reads 24-bit ${formatIxSpan(decoded.displacement, 3)} into ${decoded.dest}` };
    case 'ld-indexed-ixiy':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 3, kind: 'write', summary: `writes 24-bit ${decoded.src} to ${formatIxSpan(decoded.displacement, 3)}` };
    case 'indexed-cb-bit':
    case 'indexed-cb-rotate':
    case 'indexed-cb-res':
    case 'indexed-cb-set':
      if (decoded.indexRegister !== 'ix') return null;
      return { offset: decoded.displacement, width: 1, kind: 'read', summary: `${decoded.tag} touches ${formatIxSpan(decoded.displacement, 1)}` };
    default:
      return null;
  }
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index += 1) {
    mem[MODE_BUF_START + index] = MODE_TEXT.charCodeAt(index);
  }
}

function countForegroundPixels(mem, rowStart = STRIP_ROW_START, rowEnd = STRIP_ROW_END) {
  let count = 0;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }
  return count;
}

function countAllForegroundPixels(mem) {
  let count = 0;
  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }
  return count;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function decodeLinearBlock(startPc, endPc, mode = 'adl', maxInstructions = 256) {
  const instructions = [];
  let pc = startPc;

  while (instructions.length < maxInstructions && pc <= endPc && pc < ROM_LIMIT) {
    const inst = safeDecode(pc, mode);
    if (!inst) break;

    instructions.push({
      ...inst,
      bytes: romBytes.slice(inst.pc, inst.pc + inst.length),
    });

    pc = inst.nextPc;

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'halt') {
      break;
    }
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Part A: Disassemble 0x00E882's caller context
// ---------------------------------------------------------------------------

function findPrologue(targetAddr, lookbackBytes = 128) {
  const startFloor = Math.max(0, targetAddr - lookbackBytes);

  for (let start = startFloor; start < targetAddr; start += 1) {
    const candidates = [];
    let pc = start;
    let ok = true;

    while (pc < targetAddr) {
      const inst = safeDecode(pc, 'adl');
      if (!inst || inst.nextPc > targetAddr + 64) {
        ok = false;
        break;
      }
      candidates.push(inst);
      pc = inst.nextPc;

      if (inst.tag === 'ret' || inst.tag === 'halt') break;
    }

    if (!ok || candidates.length < 2) continue;

    for (let i = 0; i < candidates.length - 1; i += 1) {
      const a = candidates[i];
      const b = candidates[i + 1];

      if (
        a.tag === 'ld-pair-imm' && a.pair === 'hl'
        && b.tag === 'call' && b.target === FRAME_HELPER
      ) {
        const frameSize = signed24(a.value);
        if (frameSize < 0) {
          return {
            prologueStart: a.pc,
            frameHelperCall: b.pc,
            localBytes: -frameSize,
            allInstructions: candidates,
            streamStart: start,
          };
        }
      }
    }
  }

  return null;
}

function partA() {
  console.log('=== Part A: Disassemble 0x00E882 Caller Context ===');
  console.log('');

  // Find the prologue for the function containing 0x00E882
  const prologue = findPrologue(CALLER_E882, 200);

  if (!prologue) {
    console.log('Could not find prologue (LD HL, -N; CALL 0x002197) scanning backwards from 0x00E882.');
    console.log('Falling back to linear disassembly around 0x00E882.');
    console.log('');

    const fallbackStart = Math.max(0, CALLER_E882 - 48);
    const instructions = decodeLinearBlock(fallbackStart, CALLER_E882 + 48, 'adl');
    for (const inst of instructions) {
      const marker = inst.pc === CALLER_E882 ? '>>' : '  ';
      const bytes = bytesToHex(inst.bytes);
      console.log(`${marker} ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${formatInstruction(inst)}`);
    }
    console.log('');
    return null;
  }

  console.log(`Found prologue at ${hex(prologue.prologueStart)}: LD HL, -${prologue.localBytes} then CALL ${hex(FRAME_HELPER)}`);
  console.log(`Function allocates ${prologue.localBytes} local bytes below IX.`);
  console.log('');

  // Disassemble from prologue through ~30 bytes past the CALL to 0x00E4E8
  const disasmEnd = CALLER_E882 + 48;
  const instructions = decodeLinearBlock(prologue.prologueStart, disasmEnd, 'adl');

  const ixAccesses = [];
  let ixReplacedAt = null;
  let callerFrameLocalBytes = prologue.localBytes;

  for (const inst of instructions) {
    const marker = inst.pc === CALLER_E882 ? '>>' : '  ';
    const bytes = bytesToHex(inst.bytes);
    const ixAccess = findIxAccess(inst);
    const note = ixAccess ? ` ; ${ixAccess.summary}` : '';
    console.log(`${marker} ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${formatInstruction(inst)}${note}`);

    if (ixAccess) {
      ixAccesses.push({ ...ixAccess, pc: inst.pc, text: formatInstruction(inst) });
    }
  }

  console.log('');
  console.log('Frame layout for the function containing 0x00E882:');
  console.log(`  Local bytes: ${callerFrameLocalBytes}`);
  console.log('  IX+0..IX+2: saved caller IX');
  console.log('  IX+3..IX+5: return address');

  // Identify what IX+9 is
  const positiveAccesses = ixAccesses.filter((a) => a.offset >= 6);
  const negativeAccesses = ixAccesses.filter((a) => a.offset < 0);

  if (positiveAccesses.length > 0) {
    console.log('  Positive IX offsets (arguments):');
    const seen = new Set();
    for (const acc of positiveAccesses) {
      const key = `${acc.offset}:${acc.width}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const argIndex = Math.floor((acc.offset - 6) / 3) + 1;
      const role = acc.width === 3
        ? `24-bit argument ${argIndex}`
        : `byte within argument region (offset ${acc.offset})`;
      console.log(`    ${formatIxSpan(acc.offset, acc.width)}: ${role}`);
    }
  }

  if (negativeAccesses.length > 0) {
    console.log('  Negative IX offsets (locals):');
    const seen = new Set();
    for (const acc of negativeAccesses) {
      const key = `${acc.offset}:${acc.width}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    ${formatIxSpan(acc.offset, acc.width)}: local scratch`);
    }
  }

  // Look specifically for the instruction that pushes IX+9 before calling 0x00E4E8
  console.log('');
  console.log('Key question: What is IX+9 (the value pushed before CALL 0x00E4E8)?');

  const callIdx = instructions.findIndex((inst) => inst.pc === CALLER_E882);
  if (callIdx >= 0) {
    const nearby = instructions.slice(Math.max(0, callIdx - 6), callIdx);
    let pushFound = false;
    for (const inst of nearby) {
      if (inst.tag === 'push') {
        console.log(`  Stack setup before CALL: ${hex(inst.pc)} ${formatInstruction(inst)}`);
        pushFound = true;
      }
      const ixAcc = findIxAccess(inst);
      if (ixAcc) {
        console.log(`  IX access nearby: ${hex(inst.pc)} ${formatInstruction(inst)} — ${ixAcc.summary}`);
      }
    }
    if (!pushFound) {
      console.log('  No PUSH instruction found immediately before the CALL.');
    }
  }

  console.log('');

  // Also do the same for 0x00FF75
  console.log('--- Secondary caller: 0x00FF75 ---');
  const prologue2 = findPrologue(CALLER_FF75, 200);

  if (prologue2) {
    console.log(`Found prologue at ${hex(prologue2.prologueStart)}: LD HL, -${prologue2.localBytes} then CALL ${hex(FRAME_HELPER)}`);
    const instructions2 = decodeLinearBlock(prologue2.prologueStart, CALLER_FF75 + 48, 'adl');

    for (const inst of instructions2) {
      const marker = inst.pc === CALLER_FF75 ? '>>' : '  ';
      const bytes = bytesToHex(inst.bytes);
      const ixAccess = findIxAccess(inst);
      const note = ixAccess ? ` ; ${ixAccess.summary}` : '';
      console.log(`${marker} ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${formatInstruction(inst)}${note}`);
    }
  } else {
    console.log('Could not find prologue for 0x00FF75 caller.');
    const fallbackStart = Math.max(0, CALLER_FF75 - 48);
    const instructions2 = decodeLinearBlock(fallbackStart, CALLER_FF75 + 24, 'adl');
    for (const inst of instructions2) {
      const marker = inst.pc === CALLER_FF75 ? '>>' : '  ';
      const bytes = bytesToHex(inst.bytes);
      console.log(`${marker} ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${formatInstruction(inst)}`);
    }
  }
  console.log('');

  return { prologue, ixAccesses, callerFrameLocalBytes };
}

// ---------------------------------------------------------------------------
// Part B: Map the struct accessed by 0x00E4E8's function
// ---------------------------------------------------------------------------

function partB() {
  console.log('=== Part B: Struct Map for 0x00E4E8 Function ===');
  console.log('');

  const instructions = decodeLinearBlock(FUNCTION_START, FUNCTION_END, 'adl');

  // Track the IX replacement point
  let ixReplaced = false;
  let ixReplacementPc = null;
  const preReplaceAccesses = [];
  const postReplaceAccesses = [];
  const iyAccesses = [];

  for (const inst of instructions) {
    const bytes = bytesToHex(inst.bytes);
    const text = formatInstruction(inst);
    const ixAccess = findIxAccess(inst);

    // Detect LD IX, (IX+6) — the IX replacement
    const isIxReplacement =
      (inst.tag === 'ld-ixiy-indexed' && inst.dest === 'ix' && inst.indexRegister === 'ix')
      || (inst.tag === 'ld-pair-indexed' && inst.pair === 'ix' && inst.indexRegister === 'ix');

    if (isIxReplacement && !ixReplaced) {
      ixReplaced = true;
      ixReplacementPc = inst.pc;
      console.log(`** ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${text}  <-- IX REPLACEMENT POINT`);

      if (ixAccess) {
        preReplaceAccesses.push({ ...ixAccess, pc: inst.pc, text });
      }
      continue;
    }

    // Check for IY accesses
    let iyNote = '';
    if (inst.indexRegister === 'iy') {
      const iyDisp = inst.displacement;
      iyAccesses.push({
        pc: inst.pc,
        displacement: iyDisp,
        text,
        kind: inst.tag.includes('ld-reg-ixd') || inst.tag.includes('alu-ixd') ? 'read' : 'write',
      });
      iyNote = ` ; IY access at (IY${iyDisp >= 0 ? '+' : ''}${iyDisp})`;
    }

    const note = ixAccess ? ` ; ${ixAccess.summary}` : '';
    console.log(`   ${hex(inst.pc)}  ${bytes.padEnd(17)}  ${text}${note}${iyNote}`);

    if (ixAccess) {
      if (!ixReplaced) {
        preReplaceAccesses.push({ ...ixAccess, pc: inst.pc, text });
      } else {
        postReplaceAccesses.push({ ...ixAccess, pc: inst.pc, text });
      }
    }
  }

  console.log('');
  console.log('--- Pre-replacement IX accesses (IX = stack frame pointer) ---');
  if (preReplaceAccesses.length === 0) {
    console.log('  none');
  } else {
    for (const acc of preReplaceAccesses) {
      console.log(`  ${hex(acc.pc)}: ${acc.summary}`);
    }
  }

  console.log('');
  console.log('--- Post-replacement IX accesses (IX = pointer from argument) ---');
  if (postReplaceAccesses.length === 0) {
    console.log('  none');
  } else {
    const structMap = new Map();
    for (const acc of postReplaceAccesses) {
      const key = `${acc.offset}:${acc.width}`;
      if (!structMap.has(key)) {
        structMap.set(key, { offset: acc.offset, width: acc.width, accesses: [] });
      }
      structMap.get(key).accesses.push(acc);
    }

    const sorted = [...structMap.values()].sort((a, b) => a.offset - b.offset);
    console.log('');
    console.log('  Struct field map (offsets relative to the pointer target):');
    for (const field of sorted) {
      const kinds = field.accesses.map((a) => a.kind);
      const uniqueKinds = [...new Set(kinds)].join('/');
      console.log(`    ${formatIxSpan(field.offset, field.width)}: ${uniqueKinds} — ${field.accesses.length} access(es)`);
      for (const acc of field.accesses) {
        console.log(`      ${hex(acc.pc)}: ${acc.summary}`);
      }
    }
  }

  console.log('');
  console.log('--- IY accesses (flag/mode state reads) ---');
  if (iyAccesses.length === 0) {
    console.log('  none');
  } else {
    for (const acc of iyAccesses) {
      console.log(`  ${hex(acc.pc)}: (IY${acc.displacement >= 0 ? '+' : ''}${acc.displacement}) — ${acc.text}`);
    }
  }

  // Search for the magic value 0xD141EC (bytes EC 41 D1) in the ROM
  console.log('');
  console.log(`--- Searching ROM for magic value ${hex(MAGIC_VALUE)} (bytes EC 41 D1) ---`);
  const magicHits = [];
  for (let i = 0; i <= ROM_LIMIT - 3; i += 1) {
    if (romBytes[i] === MAGIC_BYTES[0] && romBytes[i + 1] === MAGIC_BYTES[1] && romBytes[i + 2] === MAGIC_BYTES[2]) {
      magicHits.push(i);
    }
  }

  console.log(`Found ${magicHits.length} occurrence(s) of EC 41 D1 in ROM:`);
  for (const addr of magicHits.slice(0, 30)) {
    // Decode context around the hit
    const contextStart = Math.max(0, addr - 4);
    const contextEnd = Math.min(ROM_LIMIT, addr + 8);
    const contextBytes = bytesToHex(romBytes.slice(contextStart, contextEnd));

    // Check if this is an immediate load instruction
    let decoded = null;
    for (let tryPc = Math.max(0, addr - 6); tryPc <= addr; tryPc += 1) {
      const inst = safeDecode(tryPc, 'adl');
      if (inst && inst.pc + inst.length > addr && inst.pc <= addr) {
        decoded = inst;
        break;
      }
    }

    const instText = decoded ? ` => ${formatInstruction(decoded)}` : '';
    console.log(`  ${hex(addr)}: context=[${contextBytes}]${instText}`);
  }
  if (magicHits.length > 30) {
    console.log(`  ... and ${magicHits.length - 30} more`);
  }

  // Also check if 0xD141EC is a RAM address
  console.log('');
  console.log('  Note: 0xD141EC is a RAM address. If the function writes this value to (IX-6),');
  console.log('  it may be storing a pointer to a known RAM structure (e.g., appvar data, cursor state).');

  return { preReplaceAccesses, postReplaceAccesses, iyAccesses, ixReplacementPc };
}

// ---------------------------------------------------------------------------
// Part C: Fabrication Feasibility Assessment
// ---------------------------------------------------------------------------

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernelInit,
    postInit,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function runBaseline(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  clearVram(env.mem);

  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const stage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  seedModeBuffer(env.mem);
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  const stage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  return {
    stage1,
    stage3,
    stripFgPixels: countForegroundPixels(env.mem),
    allFgPixels: countAllForegroundPixels(env.mem),
  };
}

function partC(env, structMap) {
  console.log('=== Part C: Fabrication Feasibility Assessment ===');
  console.log('');

  // First, run baseline to get comparison numbers
  const baseline = runBaseline(env);
  console.log('--- Baseline (no fabrication) ---');
  console.log(`  Stage 1: steps=${baseline.stage1.steps} term=${baseline.stage1.termination} lastPc=${hex(baseline.stage1.lastPc)}`);
  console.log(`  Stage 3: steps=${baseline.stage3.steps} term=${baseline.stage3.termination} lastPc=${hex(baseline.stage3.lastPc)}`);
  console.log(`  Strip fg pixels (rows ${STRIP_ROW_START}-${STRIP_ROW_END}): ${baseline.stripFgPixels}`);
  console.log(`  All fg pixels: ${baseline.allFgPixels}`);
  console.log('');

  // Document required struct fields based on Part B findings
  console.log('--- Required struct fields at the pointer argument ---');
  console.log(`  Struct base address for test: ${hex(FABRICATED_STRUCT_ADDR)}`);
  console.log('');
  console.log('  The function at 0x00E4E8 does LD IX,(IX+6) to load a pointer, then accesses:');

  if (structMap.postReplaceAccesses.length === 0) {
    console.log('  (No post-replacement IX accesses found — function may only use IY-based state)');
  } else {
    const fieldMap = new Map();
    for (const acc of structMap.postReplaceAccesses) {
      const key = `${acc.offset}:${acc.width}`;
      if (!fieldMap.has(key)) {
        fieldMap.set(key, { offset: acc.offset, width: acc.width, accesses: [] });
      }
      fieldMap.get(key).accesses.push(acc);
    }

    const fields = [...fieldMap.values()].sort((a, b) => a.offset - b.offset);
    for (const field of fields) {
      const readWrite = field.accesses.some((a) => a.kind === 'write') ? 'WRITE' : 'READ';
      console.log(`    Offset ${field.offset >= 0 ? '+' : ''}${field.offset} (${field.width} byte): ${readWrite}`);
      for (const acc of field.accesses) {
        console.log(`      ${hex(acc.pc)}: ${acc.text}`);
      }
    }
  }

  console.log('');
  console.log('  The function also writes 0xD141EC to (IX-6) — this is a local slot,');
  console.log('  relative to the NEW IX (the struct pointer), not the stack frame.');
  console.log('');

  // Now attempt fabrication
  console.log('--- Fabrication Attempt ---');
  console.log(`  Allocating struct at ${hex(FABRICATED_STRUCT_ADDR)}`);
  console.log('');

  // Reset environment
  env.mem.set(env.ramSnapshot, RAM_START);
  clearVram(env.mem);

  // Zero out the struct area
  env.mem.fill(0x00, FABRICATED_STRUCT_ADDR, FABRICATED_STRUCT_ADDR + 64);

  // Fill known fields based on what we discovered
  // The struct fields depend on what Part B found, but we can set safe defaults:
  // - (IX-6) through (IX-4) will be written by the function itself (0xD141EC)
  // - Other fields: set to 0 initially
  // Write a reasonable "self-pointer" pattern: make the struct point to something valid

  // Boot + kernel init
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const stage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  seedModeBuffer(env.mem);

  // Now set up the fabricated frame
  // The function at 0x00E4E8 expects:
  //   IX+0..+2 = saved caller IX (from frame helper)
  //   IX+3..+5 = return address
  //   IX+6..+8 = 24-bit POINTER argument
  // We need to push the pointer argument on the stack before the call

  // Snapshot CPU before stage 3
  const preStage3Snapshot = snapshotCpu(env.cpu);

  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  // We'll try stage 3 with the struct pre-populated
  // But the function 0x00E4E8 is only reached via indirect dispatch during rendering
  // So we can't just call it directly — we need stage 3 to naturally reach it
  // The real question is: does it GET reached during stage 3?

  // Track whether 0x00E4E8 is reached
  let functionReached = false;
  let functionReachCount = 0;
  const functionEntries = [];

  const stage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
    onBlock(pc, mode, meta, steps) {
      if (pc === FUNCTION_START || pc === FUNCTION_START - 3) {
        functionReached = true;
        functionReachCount += 1;
        if (functionEntries.length < 5) {
          functionEntries.push({
            step: steps + 1,
            pc,
            ix: env.cpu._ix & 0xFFFFFF,
            sp: env.cpu.sp & 0xFFFFFF,
            iy: env.cpu._iy & 0xFFFFFF,
          });
        }
      }
    },
  });

  const fabricatedResult = {
    stage1,
    stage3,
    stripFgPixels: countForegroundPixels(env.mem),
    allFgPixels: countAllForegroundPixels(env.mem),
    functionReached,
    functionReachCount,
    functionEntries,
  };

  console.log('  Stage 3 with struct at D1A000:');
  console.log(`    steps=${fabricatedResult.stage3.steps} term=${fabricatedResult.stage3.termination} lastPc=${hex(fabricatedResult.stage3.lastPc)}`);
  console.log(`    Strip fg pixels: ${fabricatedResult.stripFgPixels}`);
  console.log(`    All fg pixels: ${fabricatedResult.allFgPixels}`);
  console.log(`    Function 0x00E4E8 reached: ${functionReached} (${functionReachCount} time(s))`);

  if (functionEntries.length > 0) {
    console.log('    Entries into 0x00E4E8:');
    for (const entry of functionEntries) {
      console.log(`      [step ${entry.step}] PC=${hex(entry.pc)} IX=${hex(entry.ix)} SP=${hex(entry.sp)} IY=${hex(entry.iy)}`);

      // Check what IX+6 points to at entry
      const sp = entry.sp;
      if (sp > 0 && sp < MEM_SIZE - 12) {
        const stackBytes = [];
        for (let i = 0; i < 12; i++) {
          stackBytes.push(env.mem[sp + i]);
        }
        console.log(`      Stack at SP: [${bytesToHex(stackBytes)}]`);
      }
    }
  }

  console.log('');
  console.log('--- Comparison ---');
  console.log(`  Baseline strip fg pixels: ${baseline.stripFgPixels}`);
  console.log(`  Fabricated strip fg pixels: ${fabricatedResult.stripFgPixels}`);
  console.log(`  Baseline all fg pixels: ${baseline.allFgPixels}`);
  console.log(`  Fabricated all fg pixels: ${fabricatedResult.allFgPixels}`);
  console.log(`  Pixel delta (strip): ${fabricatedResult.stripFgPixels - baseline.stripFgPixels}`);
  console.log(`  Pixel delta (all): ${fabricatedResult.allFgPixels - baseline.allFgPixels}`);

  if (!functionReached) {
    console.log('');
    console.log('  CONCLUSION: Function 0x00E4E8 was NOT reached during stage 3.');
    console.log('  This confirms it is only reachable via indirect dispatch (JP table at 0x000510)');
    console.log('  which is not triggered during the current boot+init+render sequence.');
    console.log('  The SP corruption cascade requires a different trigger path.');
    console.log('');
    console.log('  To fabricate a test, we would need to:');
    console.log('  1. Identify what dispatch mechanism triggers entry via the JP table at 0x000510');
    console.log('  2. Or manually CALL 0x00E4E8 with a fabricated stack frame');
    console.log('  3. Then compare VRAM output before/after');
    console.log('');
    console.log('  Attempting direct call test...');

    directCallTest(env, baseline);
  }

  return { baseline, fabricatedResult };
}

function directCallTest(env, baseline) {
  console.log('');
  console.log('--- Direct Call Test: CALL 0x00E4E8 with fabricated argument ---');

  // Reset
  env.mem.set(env.ramSnapshot, RAM_START);
  clearVram(env.mem);

  // Run stage 1 first
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const stage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  seedModeBuffer(env.mem);

  // Prepare the struct at D1A000
  env.mem.fill(0x00, FABRICATED_STRUCT_ADDR, FABRICATED_STRUCT_ADDR + 64);

  // Write some plausible field values
  // The function reads various (IX+d) offsets from the struct
  // We'll zero them out and see what happens
  // Also set IY flags as the function checks (IY+24), (IY+26), (IY+27)

  // Now set up a stack frame as if we're calling 0x00E4E8
  // Stack layout for 0x00E4E8 after frame helper:
  //   1. Push the pointer argument (FABRICATED_STRUCT_ADDR)
  //   2. CALL 0x00E4E8
  //   Frame helper will then:
  //     - EX (SP),IX — saves caller IX, IX <- SP
  //     - LD IX,0; ADD IX,SP — IX = SP
  //     - SP -= localBytes
  // So before the call:
  //   SP -> [return addr 3B] [pointer arg 3B]

  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 24);
  const sp = env.cpu.sp;

  // Layout: SP points to a fabricated stack
  // [argument: 3 bytes at sp+0]
  // [return: halt trap at sp+3] (we'll write a halt at a known address)
  // Actually, the CALL instruction itself pushes the return address.
  // So we push the argument BEFORE the call.
  // The function's frame helper then rearranges things.

  // Let's try: push the struct pointer, then have the CPU call 0x00E4E8
  // We can do this by writing a small stub:
  //   PUSH <FABRICATED_STRUCT_ADDR>
  //   CALL 0x00E4E8
  //   HALT

  // But we don't have a writable code area that's transpiled.
  // Instead, manually set up the stack and jump to 0x00E4E8.
  // After frame helper, IX+6..+8 = first argument.
  // We need to put the argument at SP+3 (after the return address).

  // Write the argument on the stack
  const haltAddr = 0xD19F00; // unused RAM area for halt trap
  env.mem[haltAddr] = 0x76; // HALT opcode

  // Stack: [return addr (haltAddr)] [argument (FABRICATED_STRUCT_ADDR)]
  // But actually, the call pushes the return address.
  // If we manually set up: push the argument, then jump to E4E8,
  // the frame helper expects CALL to have pushed the return address.
  // Let's simulate: SP has argument already pushed, and we set SP to
  // point where the frame helper expects its inputs.

  // The frame helper 0x002197 does:
  //   EX (SP), IX  — pops return addr, pushes old IX, IX <- return addr
  //   LD IX, 0; ADD IX, SP — IX = current SP
  //   ADD HL, SP; LD SP, HL — SP -= |HL| (local allocation)
  //   JP (HL)
  // Wait, it does JP (HL) which actually continues at the return address.
  // Actually, looking again: the last step is "JP (HL)" but HL points
  // back into the caller. The standard eZ80 frame helper pattern is:
  //   The CALL to 0x002197 pushes the return address (= instruction after the call).
  //   EX (SP), IX — swaps top-of-stack (return addr) with IX.
  //     Now stack top = old IX, IX = return address (next instruction in caller)
  //   Wait, that's not right either. Let me re-read the Phase 166 description.

  // From the spec:
  //   Frame helper 0x002197:
  //   EX (SP),IX + LD IX,0 + ADD IX,SP + ADD HL,SP + LD SP,HL + JP (HL)
  //   Effect: saves caller's IX on stack, IX = current SP (frame base),
  //           SP -= |HL| bytes for locals
  //   After: IX+0..+2 = saved caller IX, IX+3..+5 = return address, IX+6+ = arguments

  // So the sequence when CALL 0x00E4E8 happens:
  // Before CALL: stack has [argument] at top
  //   CALL pushes return addr -> stack: [ret addr][argument]
  //   Function prologue: LD HL, -10; CALL 0x002197
  //     CALL 0x002197 pushes return addr (inside E4E8) -> stack: [helper ret][ret addr][argument]
  //     EX (SP), IX -> stack: [old IX][ret addr][argument], IX = helper ret addr
  //     LD IX, 0; ADD IX, SP -> IX = SP (pointing at old IX on stack)
  //     ADD HL, SP; LD SP, HL -> SP -= 10
  //     JP (HL) -- jumps back inside E4E8's body (past the prologue)

  // Wait, JP (HL) after ADD HL,SP... HL = SP + (-10)... that doesn't make sense for a jump.
  // Let me look more carefully. The helper stores HL (which is -10 from the function entry)
  // in a special way. Actually, the standard pattern from the spec says JP (HL) but HL
  // at that point would be the new SP, not a code address. Let me re-read...

  // Actually, from the Phase 166 description:
  //   EX (SP),IX + LD IX,0 + ADD IX,SP + ADD HL,SP + LD SP,HL + JP (HL)
  // The problem is JP (HL) in eZ80 is actually "JP HL" — it jumps to the address IN HL.
  // After ADD HL, SP: HL = old_SP + (-10). That's a stack address, not code.
  // This doesn't work. The helper must be more nuanced.

  // The actual eZ80 frame helper probably works differently. Let me just check the ROM bytes.
  console.log('  Checking frame helper at 0x002197...');
  const helperInstructions = decodeLinearBlock(FRAME_HELPER, FRAME_HELPER + 32, 'adl');
  for (const inst of helperInstructions) {
    const bytes = bytesToHex(inst.bytes);
    console.log(`    ${hex(inst.pc)}  ${bytes.padEnd(14)}  ${formatInstruction(inst)}`);
  }

  // Now manually construct the stack frame
  // Based on the actual frame helper behavior, set up:
  // We know that after frame setup:
  //   IX+0..+2 = saved caller IX
  //   IX+3..+5 = return address (the address after CALL 0x00E4E8 in the caller)
  //   IX+6..+8 = the pushed argument (pointer)

  // For a direct test, we can bypass the frame helper entirely:
  // 1. Point IX directly at a fabricated frame in RAM
  // 2. The frame "data" at IX+0 = dummy saved IX, IX+3 = return-to-halt, IX+6 = struct pointer
  // 3. Allocate locals below IX
  // 4. Jump to the instruction AFTER the prologue in 0x00E4E8

  // First, find where the prologue ends (after the CALL 0x002197)
  const funcInstructions = decodeLinearBlock(FUNCTION_START, FUNCTION_END, 'adl');
  let bodyStart = FUNCTION_START;

  if (
    funcInstructions.length >= 2
    && funcInstructions[0].tag === 'ld-pair-imm' && funcInstructions[0].pair === 'hl'
    && funcInstructions[1].tag === 'call' && funcInstructions[1].target === FRAME_HELPER
  ) {
    bodyStart = funcInstructions[1].nextPc;
    const localBytes = -signed24(funcInstructions[0].value);
    console.log(`  Prologue: LD HL, ${signed24(funcInstructions[0].value)} then CALL ${hex(FRAME_HELPER)}`);
    console.log(`  Body starts at: ${hex(bodyStart)}`);
    console.log(`  Local bytes: ${localBytes}`);

    // Build the fabricated frame in RAM
    const frameBase = FABRICATED_STRUCT_ADDR + 128; // use offset area for the frame
    const structAddr = FABRICATED_STRUCT_ADDR;

    // Frame layout at frameBase:
    //   frameBase+0..+2 = saved caller IX (just use 0)
    //   frameBase+3..+5 = return address (haltAddr)
    //   frameBase+6..+8 = pointer argument (structAddr)
    write24LE(env.mem, frameBase + 0, 0x000000);     // saved IX
    write24LE(env.mem, frameBase + 3, haltAddr);       // return address
    write24LE(env.mem, frameBase + 6, structAddr);     // pointer argument

    // SP should be below IX by localBytes
    const fabricatedSP = frameBase - localBytes;

    // Clear the local area
    env.mem.fill(0x00, fabricatedSP, frameBase);

    // Zero the struct
    env.mem.fill(0x00, structAddr, structAddr + 64);

    // Set CPU state
    restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 0);
    env.cpu._ix = frameBase;
    env.cpu.sp = fabricatedSP;
    env.cpu.madl = 1;
    env.cpu._iy = 0xD00080;

    console.log(`  Frame base (IX): ${hex(frameBase)}`);
    console.log(`  SP: ${hex(fabricatedSP)}`);
    console.log(`  Struct pointer at IX+6: ${hex(structAddr)}`);
    console.log(`  Return address at IX+3: ${hex(haltAddr)} (HALT trap)`);
    console.log(`  Jumping to body at: ${hex(bodyStart)}`);
    console.log('');

    try {
      const directResult = env.executor.runFrom(bodyStart, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: 200,
      });

      console.log(`  Direct call result: steps=${directResult.steps} term=${directResult.termination} lastPc=${hex(directResult.lastPc)}`);
      console.log(`  Final IX: ${hex(env.cpu._ix & 0xFFFFFF)}`);
      console.log(`  Final SP: ${hex(env.cpu.sp & 0xFFFFFF)}`);

      // Check what the function wrote to the struct
      console.log('');
      console.log('  Struct contents after execution:');
      for (let offset = -16; offset <= 16; offset += 1) {
        const addr = structAddr + offset;
        if (addr >= 0 && addr < MEM_SIZE) {
          const val = env.mem[addr];
          if (val !== 0) {
            console.log(`    struct${offset >= 0 ? '+' : ''}${offset}: ${hex(val, 2)}`);
          }
        }
      }

      // Check the (IX-6) write
      const writtenAt = structAddr - 6;
      if (writtenAt >= 0 && writtenAt + 2 < MEM_SIZE) {
        const written = read24LE(env.mem, writtenAt);
        console.log(`  Value at struct-6 (${hex(writtenAt)}): ${hex(written)} ${written === MAGIC_VALUE ? '(matches 0xD141EC!)' : ''}`);
      }

      // Check if function returned properly
      if (directResult.termination === 'halt') {
        console.log('  Function returned to HALT trap — execution completed normally.');
      } else if (directResult.lastPc === haltAddr) {
        console.log('  Reached halt address.');
      } else {
        console.log(`  Function did NOT return to halt trap. Last PC: ${hex(directResult.lastPc)}`);
        console.log('  This may indicate the function branched/crashed due to missing struct data.');
      }
    } catch (err) {
      console.log(`  Direct call FAILED: ${err?.message ?? String(err)}`);
    }
  } else {
    console.log('  Could not identify prologue — skipping direct call test.');
  }

  console.log('');
  console.log('--- Summary ---');
  console.log('  The function at 0x00E4E8 is NOT reached during normal boot+render.');
  console.log('  It is only callable via indirect dispatch (JP table at 0x000510) or');
  console.log('  direct CALL from 0x00E882 / 0x00FF75 during specific OS operations.');
  console.log('  Stack frame fabrication was attempted via direct body entry.');
  console.log('  See results above for feasibility of the pointer argument approach.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Phase 168 — Stack Frame Fabrication for IX Fix ===');
  console.log(`ROM size: ${romBytes.length} bytes`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length}`);
  console.log('');

  const partAResult = partA();

  const partBResult = partB();

  // Search existing probe files for mentions of 0xD141EC
  console.log('--- Searching probe files for 0xD141EC references ---');
  const probeDir = __dirname;
  const probeFiles = fs.readdirSync(probeDir).filter((f) => f.startsWith('probe-') && f.endsWith('.mjs'));
  let found0xD141EC = false;

  for (const file of probeFiles) {
    if (file === 'probe-phase168-frame-fabrication.mjs') continue;
    const content = fs.readFileSync(path.join(probeDir, file), 'utf-8');
    if (content.includes('D141EC') || content.includes('d141ec') || content.includes('0xD141EC')) {
      console.log(`  Found in ${file}`);
      found0xD141EC = true;
    }
  }

  // Also check report files
  const reportFiles = fs.readdirSync(probeDir).filter((f) => f.includes('report') && (f.endsWith('.json') || f.endsWith('.txt') || f.endsWith('.md')));
  for (const file of reportFiles) {
    try {
      const content = fs.readFileSync(path.join(probeDir, file), 'utf-8');
      if (content.includes('D141EC') || content.includes('d141ec') || content.includes('0xD141EC')) {
        console.log(`  Found in ${file}`);
        found0xD141EC = true;
      }
    } catch {
      // skip unreadable
    }
  }

  if (!found0xD141EC) {
    console.log('  No references to 0xD141EC found in existing probe/report files.');
  }
  console.log('');

  console.log('Initializing emulation environment...');
  const env = initializeEnvironment();
  console.log(`  Boot: steps=${env.boot.steps} term=${env.boot.termination}`);
  console.log(`  Kernel init: steps=${env.kernelInit.steps} term=${env.kernelInit.termination}`);
  console.log(`  Post-init: steps=${env.postInit.steps} term=${env.postInit.termination}`);
  console.log('');

  partC(env, partBResult);
}

try {
  await main();
} catch (error) {
  console.error('Phase 168 probe failed.');
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
