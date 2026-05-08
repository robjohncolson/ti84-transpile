#!/usr/bin/env node

/**
 * Phase 241: Trace 0x051B84 BIT 4,(HL) test on D003E0
 *
 * Session 239 identified 0x051B84 as a BIT 4 test site on D003E0 that was
 * previously unknown. D003E0 is a critical OS flags byte:
 *   - BIT 0 at 0x04EDDD (controls 0x04E447 vs 0x0850D1)
 *   - BIT 3 at 0x04EABD, 0x04EB66, 0x051CF3 (gates enter-edit paths)
 *   - BIT 4 at 0x051B84 (NEW -- untraced)
 *   - SET 2 at 0x051D89, RES 2+3 at 0x051D52, sole direct writer at 0x04EE3E
 *
 * This probe:
 *   1. Static disassembly around 0x051B84 (0x051B60-0x051BA0)
 *   2. Finds parent function boundaries (scan for RET)
 *   3. Scans ROM for CALL/JP patterns targeting the function
 *   4. Dynamic trace: Scenario A (BIT 4 CLEAR, D003E0=0x00) vs
 *      Scenario B (BIT 4 SET, D003E0=0x10), entry at 0x051B2B
 *   5. Compares paths taken by each scenario
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// Boot chain
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x0802B2;

// Entry point for this probe — the actual function containing BIT 4
const ENTRY_PC = 0x051B7C;
// Also try 0x051B2B as a secondary entry (called from 0x04E9FC)
const ENTRY_PC_ALT = 0x051B2B;

// Disassembly ranges — extended to cover jump target at 0x051BD7
const DISASM_START = 0x051B7C;
const DISASM_END = 0x051C00;
const BIT4_ADDR = 0x051B84;

// Register seeds
const STACK_TOP = 0xD1A800;
const STACK_RESET_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

// Step budget
const STEP_LIMIT = 500;

// Key RAM watch addresses
const D003E0_ADDR = 0xD003E0;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;
const D003DA_ADDR = 0xD003DA;
const D00000_ADDR = 0xD00000;
const D003DD_ADDR = 0xD003DD;
const D010F8_ADDR = 0xD010F8;

// VRAM range
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

// IY flag offsets to watch
const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 8, 18, 29, 40, 0x4B, 0x34, 87];

const WATCHED_ADDRS = [
  { name: 'D003E0', addr: D003E0_ADDR },
  { name: 'D007E0', addr: D007E0_ADDR },
  { name: 'D00824', addr: D00824_ADDR },
  { name: 'D0058E', addr: D0058E_ADDR },
  { name: 'D0058D', addr: D0058D_ADDR },
  { name: 'D0059F', addr: D0059F_ADDR },
  { name: 'D003DA', addr: D003DA_ADDR },
  { name: 'D00000', addr: D00000_ADDR },
  { name: 'D003DD', addr: D003DD_ADDR },
  { name: 'D010F8', addr: D010F8_ADDR },
];

// Known landmark addresses
const LANDMARKS = new Map([
  [0x051B2B, 'alt entry (called from 0x04E9FC)'],
  [0x051B7C, 'func entry (BIT 4 parent function)'],
  [0x051B84, 'BIT 4,(HL) test on D003E0'],
  [0x04E447, '0x04E447 computation loop entry'],
  [0x02FD99, 'main event loop'],
  [0x04EDD0, 'key code action handler'],
  [0x04EAD8, 'main key dispatch loop'],
  [0x04EB02, 'key classifier entry'],
  [0x04EDB1, 'D00824 writer'],
  [0x04EF17, 'D00824 XOR A writer'],
  [0x04EDDD, 'BIT 0 D003E0 test'],
  [0x04EABD, 'BIT 3 D003E0 test'],
  [0x04EB66, 'BIT 3 D003E0 test (2)'],
  [0x051CF3, 'BIT 3 D003E0 test (3)'],
  [0x051D89, 'SET 2 D003E0'],
  [0x051D52, 'RES 2+3 D003E0'],
  [0x04EE3E, 'sole D003E0 writer'],
  [0x0850D1, 'branch target'],
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ---------- Helpers ----------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase241-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }
    this._currentBlockPc = pc;
    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }
    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }
    return result;
  };
}

function snapshotIyFlags(mem, iyBase) {
  const snapshot = {};
  for (const offset of IY_OFFSETS) {
    snapshot[`IY+${offset}`] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snapshot;
}

function formatIySnapshot(snapshot) {
  return IY_OFFSETS
    .map((o) => `IY+0x${o.toString(16).toUpperCase().padStart(2, '0')}=${hexByte(snapshot[`IY+${o}`])}`)
    .join(' ');
}

function diffIySnapshots(before, after) {
  const changes = [];
  for (const offset of IY_OFFSETS) {
    const key = `IY+${offset}`;
    if (before[key] !== after[key]) {
      changes.push(`IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')}: ${hexByte(before[key])} -> ${hexByte(after[key])}`);
    }
  }
  return changes;
}

// ---------- Disassembly ----------

function decodeRomInstructionAt(romBytes, pc) {
  const op = romBytes[pc] ?? 0x00;
  const b1 = romBytes[pc + 1] ?? 0x00;
  const b2 = romBytes[pc + 2] ?? 0x00;
  const b3 = romBytes[pc + 3] ?? 0x00;
  const imm24 = b1 | (b2 << 8) | (b3 << 16);
  const raw = (length) => bytesToHex(romBytes.subarray(pc, pc + length));

  const JR_CONDITIONS = new Map([
    [0x20, 'NZ'], [0x28, 'Z'], [0x30, 'NC'], [0x38, 'C'],
  ]);
  const JP_CONDITIONS = new Map([
    [0xC2, 'NZ'], [0xCA, 'Z'], [0xD2, 'NC'], [0xDA, 'C'],
    [0xE2, 'PO'], [0xEA, 'PE'], [0xF2, 'P'], [0xFA, 'M'],
  ]);
  const CALL_CONDITIONS = new Map([
    [0xC4, 'NZ'], [0xCC, 'Z'], [0xD4, 'NC'], [0xDC, 'C'],
    [0xE4, 'PO'], [0xEC, 'PE'], [0xF4, 'P'], [0xFC, 'M'],
  ]);

  if (op === 0xFD || op === 0xDD) {
    const indexReg = op === 0xFD ? 'IY' : 'IX';
    if (b1 === 0xCB) {
      const displacement = signedByte(b2);
      const subop = b3;
      const group = (subop >> 6) & 0x03;
      const bit = (subop >> 3) & 0x07;
      let mnemonic = 'DB';
      if (group === 1) mnemonic = 'BIT';
      if (group === 2) mnemonic = 'RES';
      if (group === 3) mnemonic = 'SET';
      return { pc, length: 4, bytes: raw(4), text: `${mnemonic} ${bit}, (${indexReg}${displacement >= 0 ? '+' : ''}${displacement})` };
    }
    // Common IX/IY prefixed instructions
    if (b1 === 0x21) return { pc, length: 5, bytes: raw(5), text: `LD ${indexReg}, ${hex(b2 | (b3 << 8) | ((romBytes[pc + 4] ?? 0) << 16))}` };
    if (b1 === 0xE5) return { pc, length: 2, bytes: raw(2), text: `PUSH ${indexReg}` };
    if (b1 === 0xE1) return { pc, length: 2, bytes: raw(2), text: `POP ${indexReg}` };
    if (b1 === 0x7E) return { pc, length: 3, bytes: raw(3), text: `LD A, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x77) return { pc, length: 3, bytes: raw(3), text: `LD (${indexReg}+${signedByte(b2)}), A` };
    if (b1 === 0x46) return { pc, length: 3, bytes: raw(3), text: `LD B, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x4E) return { pc, length: 3, bytes: raw(3), text: `LD C, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x56) return { pc, length: 3, bytes: raw(3), text: `LD D, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x5E) return { pc, length: 3, bytes: raw(3), text: `LD E, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x66) return { pc, length: 3, bytes: raw(3), text: `LD H, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x6E) return { pc, length: 3, bytes: raw(3), text: `LD L, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x36) return { pc, length: 4, bytes: raw(4), text: `LD (${indexReg}+${signedByte(b2)}), ${hexByte(b3)}` };
    if (b1 === 0xBE) return { pc, length: 3, bytes: raw(3), text: `CP (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x23) return { pc, length: 2, bytes: raw(2), text: `INC ${indexReg}` };
    if (b1 === 0x2B) return { pc, length: 2, bytes: raw(2), text: `DEC ${indexReg}` };
    if (b1 === 0xB6) return { pc, length: 3, bytes: raw(3), text: `OR (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0xA6) return { pc, length: 3, bytes: raw(3), text: `AND (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0xAE) return { pc, length: 3, bytes: raw(3), text: `XOR (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x86) return { pc, length: 3, bytes: raw(3), text: `ADD A, (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0x96) return { pc, length: 3, bytes: raw(3), text: `SUB (${indexReg}+${signedByte(b2)})` };
    if (b1 === 0xE9) return { pc, length: 2, bytes: raw(2), text: `JP (${indexReg})` };
    return { pc, length: 2, bytes: raw(2), text: `${indexReg}-prefix ${hexByte(b1)}` };
  }

  // ED prefix
  if (op === 0xED) {
    if (b1 === 0xB0) return { pc, length: 2, bytes: raw(2), text: 'LDIR' };
    if (b1 === 0xB8) return { pc, length: 2, bytes: raw(2), text: 'LDDR' };
    if (b1 === 0xA0) return { pc, length: 2, bytes: raw(2), text: 'LDI' };
    if (b1 === 0xA8) return { pc, length: 2, bytes: raw(2), text: 'LDD' };
    if (b1 === 0xB1) return { pc, length: 2, bytes: raw(2), text: 'CPIR' };
    if (b1 === 0xB9) return { pc, length: 2, bytes: raw(2), text: 'CPDR' };
    if (b1 === 0x43) return { pc, length: 4, bytes: raw(4), text: `LD (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))}), BC` };
    if (b1 === 0x4B) return { pc, length: 4, bytes: raw(4), text: `LD BC, (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))})` };
    if (b1 === 0x53) return { pc, length: 4, bytes: raw(4), text: `LD (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))}), DE` };
    if (b1 === 0x5B) return { pc, length: 4, bytes: raw(4), text: `LD DE, (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))})` };
    if (b1 === 0x73) return { pc, length: 4, bytes: raw(4), text: `LD (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))}), SP` };
    if (b1 === 0x7B) return { pc, length: 4, bytes: raw(4), text: `LD SP, (${hex(b2 | (b3 << 8) | ((romBytes[pc + 3] ?? 0) << 16))})` };
    if (b1 === 0x46) return { pc, length: 2, bytes: raw(2), text: 'IM 0' };
    if (b1 === 0x56) return { pc, length: 2, bytes: raw(2), text: 'IM 1' };
    if (b1 === 0x5E) return { pc, length: 2, bytes: raw(2), text: 'IM 2' };
    return { pc, length: 2, bytes: raw(2), text: `ED ${hexByte(b1)}` };
  }

  if (CALL_CONDITIONS.has(op)) {
    return { pc, length: 4, bytes: raw(4), text: `CALL ${CALL_CONDITIONS.get(op)}, ${hex(imm24)}` };
  }
  if (JP_CONDITIONS.has(op)) {
    return { pc, length: 4, bytes: raw(4), text: `JP ${JP_CONDITIONS.get(op)}, ${hex(imm24)}` };
  }
  if (JR_CONDITIONS.has(op)) {
    const target = (pc + 2 + signedByte(b1)) & 0xFFFFFF;
    return { pc, length: 2, bytes: raw(2), text: `JR ${JR_CONDITIONS.get(op)}, ${hex(target)}` };
  }

  switch (op) {
    case 0x00: return { pc, length: 1, bytes: raw(1), text: 'NOP' };
    case 0x01: return { pc, length: 4, bytes: raw(4), text: `LD BC, ${hex(imm24)}` };
    case 0x02: return { pc, length: 1, bytes: raw(1), text: 'LD (BC), A' };
    case 0x03: return { pc, length: 1, bytes: raw(1), text: 'INC BC' };
    case 0x04: return { pc, length: 1, bytes: raw(1), text: 'INC B' };
    case 0x05: return { pc, length: 1, bytes: raw(1), text: 'DEC B' };
    case 0x06: return { pc, length: 2, bytes: raw(2), text: `LD B, ${hexByte(b1)}` };
    case 0x07: return { pc, length: 1, bytes: raw(1), text: 'RLCA' };
    case 0x08: return { pc, length: 1, bytes: raw(1), text: 'EX AF, AF\'' };
    case 0x09: return { pc, length: 1, bytes: raw(1), text: 'ADD HL, BC' };
    case 0x0A: return { pc, length: 1, bytes: raw(1), text: 'LD A, (BC)' };
    case 0x0B: return { pc, length: 1, bytes: raw(1), text: 'DEC BC' };
    case 0x0C: return { pc, length: 1, bytes: raw(1), text: 'INC C' };
    case 0x0D: return { pc, length: 1, bytes: raw(1), text: 'DEC C' };
    case 0x0E: return { pc, length: 2, bytes: raw(2), text: `LD C, ${hexByte(b1)}` };
    case 0x0F: return { pc, length: 1, bytes: raw(1), text: 'RRCA' };
    case 0x10: return { pc, length: 2, bytes: raw(2), text: `DJNZ ${hex((pc + 2 + signedByte(b1)) & 0xFFFFFF)}` };
    case 0x11: return { pc, length: 4, bytes: raw(4), text: `LD DE, ${hex(imm24)}` };
    case 0x12: return { pc, length: 1, bytes: raw(1), text: 'LD (DE), A' };
    case 0x13: return { pc, length: 1, bytes: raw(1), text: 'INC DE' };
    case 0x14: return { pc, length: 1, bytes: raw(1), text: 'INC D' };
    case 0x15: return { pc, length: 1, bytes: raw(1), text: 'DEC D' };
    case 0x16: return { pc, length: 2, bytes: raw(2), text: `LD D, ${hexByte(b1)}` };
    case 0x17: return { pc, length: 1, bytes: raw(1), text: 'RLA' };
    case 0x18: return { pc, length: 2, bytes: raw(2), text: `JR ${hex((pc + 2 + signedByte(b1)) & 0xFFFFFF)}` };
    case 0x19: return { pc, length: 1, bytes: raw(1), text: 'ADD HL, DE' };
    case 0x1A: return { pc, length: 1, bytes: raw(1), text: 'LD A, (DE)' };
    case 0x1B: return { pc, length: 1, bytes: raw(1), text: 'DEC DE' };
    case 0x1C: return { pc, length: 1, bytes: raw(1), text: 'INC E' };
    case 0x1D: return { pc, length: 1, bytes: raw(1), text: 'DEC E' };
    case 0x1E: return { pc, length: 2, bytes: raw(2), text: `LD E, ${hexByte(b1)}` };
    case 0x1F: return { pc, length: 1, bytes: raw(1), text: 'RRA' };
    case 0x21: return { pc, length: 4, bytes: raw(4), text: `LD HL, ${hex(imm24)}` };
    case 0x22: return { pc, length: 4, bytes: raw(4), text: `LD (${hex(imm24)}), HL` };
    case 0x23: return { pc, length: 1, bytes: raw(1), text: 'INC HL' };
    case 0x24: return { pc, length: 1, bytes: raw(1), text: 'INC H' };
    case 0x25: return { pc, length: 1, bytes: raw(1), text: 'DEC H' };
    case 0x26: return { pc, length: 2, bytes: raw(2), text: `LD H, ${hexByte(b1)}` };
    case 0x27: return { pc, length: 1, bytes: raw(1), text: 'DAA' };
    case 0x29: return { pc, length: 1, bytes: raw(1), text: 'ADD HL, HL' };
    case 0x2A: return { pc, length: 4, bytes: raw(4), text: `LD HL, (${hex(imm24)})` };
    case 0x2B: return { pc, length: 1, bytes: raw(1), text: 'DEC HL' };
    case 0x2C: return { pc, length: 1, bytes: raw(1), text: 'INC L' };
    case 0x2D: return { pc, length: 1, bytes: raw(1), text: 'DEC L' };
    case 0x2E: return { pc, length: 2, bytes: raw(2), text: `LD L, ${hexByte(b1)}` };
    case 0x2F: return { pc, length: 1, bytes: raw(1), text: 'CPL' };
    case 0x31: return { pc, length: 4, bytes: raw(4), text: `LD SP, ${hex(imm24)}` };
    case 0x32: return { pc, length: 4, bytes: raw(4), text: `LD (${hex(imm24)}), A` };
    case 0x34: return { pc, length: 1, bytes: raw(1), text: 'INC (HL)' };
    case 0x35: return { pc, length: 1, bytes: raw(1), text: 'DEC (HL)' };
    case 0x36: return { pc, length: 2, bytes: raw(2), text: `LD (HL), ${hexByte(b1)}` };
    case 0x37: return { pc, length: 1, bytes: raw(1), text: 'SCF' };
    case 0x3A: return { pc, length: 4, bytes: raw(4), text: `LD A, (${hex(imm24)})` };
    case 0x3C: return { pc, length: 1, bytes: raw(1), text: 'INC A' };
    case 0x3D: return { pc, length: 1, bytes: raw(1), text: 'DEC A' };
    case 0x3E: return { pc, length: 2, bytes: raw(2), text: `LD A, ${hexByte(b1)}` };
    case 0x3F: return { pc, length: 1, bytes: raw(1), text: 'CCF' };
    case 0x46: return { pc, length: 1, bytes: raw(1), text: 'LD B, (HL)' };
    case 0x47: return { pc, length: 1, bytes: raw(1), text: 'LD B, A' };
    case 0x4E: return { pc, length: 1, bytes: raw(1), text: 'LD C, (HL)' };
    case 0x4F: return { pc, length: 1, bytes: raw(1), text: 'LD C, A' };
    case 0x56: return { pc, length: 1, bytes: raw(1), text: 'LD D, (HL)' };
    case 0x57: return { pc, length: 1, bytes: raw(1), text: 'LD D, A' };
    case 0x5E: return { pc, length: 1, bytes: raw(1), text: 'LD E, (HL)' };
    case 0x5F: return { pc, length: 1, bytes: raw(1), text: 'LD E, A' };
    case 0x60: return { pc, length: 1, bytes: raw(1), text: 'LD H, B' };
    case 0x61: return { pc, length: 1, bytes: raw(1), text: 'LD H, C' };
    case 0x62: return { pc, length: 1, bytes: raw(1), text: 'LD H, D' };
    case 0x63: return { pc, length: 1, bytes: raw(1), text: 'LD H, E' };
    case 0x66: return { pc, length: 1, bytes: raw(1), text: 'LD H, (HL)' };
    case 0x67: return { pc, length: 1, bytes: raw(1), text: 'LD H, A' };
    case 0x68: return { pc, length: 1, bytes: raw(1), text: 'LD L, B' };
    case 0x69: return { pc, length: 1, bytes: raw(1), text: 'LD L, C' };
    case 0x6E: return { pc, length: 1, bytes: raw(1), text: 'LD L, (HL)' };
    case 0x6F: return { pc, length: 1, bytes: raw(1), text: 'LD L, A' };
    case 0x76: return { pc, length: 1, bytes: raw(1), text: 'HALT' };
    case 0x77: return { pc, length: 1, bytes: raw(1), text: 'LD (HL), A' };
    case 0x78: return { pc, length: 1, bytes: raw(1), text: 'LD A, B' };
    case 0x79: return { pc, length: 1, bytes: raw(1), text: 'LD A, C' };
    case 0x7A: return { pc, length: 1, bytes: raw(1), text: 'LD A, D' };
    case 0x7B: return { pc, length: 1, bytes: raw(1), text: 'LD A, E' };
    case 0x7C: return { pc, length: 1, bytes: raw(1), text: 'LD A, H' };
    case 0x7D: return { pc, length: 1, bytes: raw(1), text: 'LD A, L' };
    case 0x7E: return { pc, length: 1, bytes: raw(1), text: 'LD A, (HL)' };
    case 0x7F: return { pc, length: 1, bytes: raw(1), text: 'LD A, A' };
    case 0x80: return { pc, length: 1, bytes: raw(1), text: 'ADD A, B' };
    case 0x81: return { pc, length: 1, bytes: raw(1), text: 'ADD A, C' };
    case 0x82: return { pc, length: 1, bytes: raw(1), text: 'ADD A, D' };
    case 0x83: return { pc, length: 1, bytes: raw(1), text: 'ADD A, E' };
    case 0x87: return { pc, length: 1, bytes: raw(1), text: 'ADD A, A' };
    case 0x90: return { pc, length: 1, bytes: raw(1), text: 'SUB B' };
    case 0x91: return { pc, length: 1, bytes: raw(1), text: 'SUB C' };
    case 0xA0: return { pc, length: 1, bytes: raw(1), text: 'AND B' };
    case 0xA1: return { pc, length: 1, bytes: raw(1), text: 'AND C' };
    case 0xA7: return { pc, length: 1, bytes: raw(1), text: 'AND A' };
    case 0xAE: return { pc, length: 1, bytes: raw(1), text: 'XOR (HL)' };
    case 0xAF: return { pc, length: 1, bytes: raw(1), text: 'XOR A' };
    case 0xB0: return { pc, length: 1, bytes: raw(1), text: 'OR B' };
    case 0xB1: return { pc, length: 1, bytes: raw(1), text: 'OR C' };
    case 0xB6: return { pc, length: 1, bytes: raw(1), text: 'OR (HL)' };
    case 0xB7: return { pc, length: 1, bytes: raw(1), text: 'OR A' };
    case 0xBE: return { pc, length: 1, bytes: raw(1), text: 'CP (HL)' };
    case 0xC0: return { pc, length: 1, bytes: raw(1), text: 'RET NZ' };
    case 0xC1: return { pc, length: 1, bytes: raw(1), text: 'POP BC' };
    case 0xC3: return { pc, length: 4, bytes: raw(4), text: `JP ${hex(imm24)}` };
    case 0xC5: return { pc, length: 1, bytes: raw(1), text: 'PUSH BC' };
    case 0xC6: return { pc, length: 2, bytes: raw(2), text: `ADD A, ${hexByte(b1)}` };
    case 0xC8: return { pc, length: 1, bytes: raw(1), text: 'RET Z' };
    case 0xC9: return { pc, length: 1, bytes: raw(1), text: 'RET' };
    case 0xCB: {
      const subop = b1;
      const group = (subop >> 6) & 0x03;
      const bit = (subop >> 3) & 0x07;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const reg = regNames[subop & 0x07];
      if (group === 0) {
        const shiftOps = ['RLC', 'RRC', 'RL', 'RL', 'SLA', 'SRA', 'SLL', 'SRL'];
        return { pc, length: 2, bytes: raw(2), text: `${shiftOps[bit]} ${reg}` };
      }
      if (group === 1) return { pc, length: 2, bytes: raw(2), text: `BIT ${bit}, ${reg}` };
      if (group === 2) return { pc, length: 2, bytes: raw(2), text: `RES ${bit}, ${reg}` };
      if (group === 3) return { pc, length: 2, bytes: raw(2), text: `SET ${bit}, ${reg}` };
      return { pc, length: 2, bytes: raw(2), text: `CB ${hexByte(subop)}` };
    }
    case 0xCD: return { pc, length: 4, bytes: raw(4), text: `CALL ${hex(imm24)}` };
    case 0xCE: return { pc, length: 2, bytes: raw(2), text: `ADC A, ${hexByte(b1)}` };
    case 0xD0: return { pc, length: 1, bytes: raw(1), text: 'RET NC' };
    case 0xD1: return { pc, length: 1, bytes: raw(1), text: 'POP DE' };
    case 0xD5: return { pc, length: 1, bytes: raw(1), text: 'PUSH DE' };
    case 0xD6: return { pc, length: 2, bytes: raw(2), text: `SUB ${hexByte(b1)}` };
    case 0xD8: return { pc, length: 1, bytes: raw(1), text: 'RET C' };
    case 0xD9: return { pc, length: 1, bytes: raw(1), text: 'EXX' };
    case 0xDE: return { pc, length: 2, bytes: raw(2), text: `SBC A, ${hexByte(b1)}` };
    case 0xE0: return { pc, length: 1, bytes: raw(1), text: 'RET PO' };
    case 0xE1: return { pc, length: 1, bytes: raw(1), text: 'POP HL' };
    case 0xE3: return { pc, length: 1, bytes: raw(1), text: 'EX (SP), HL' };
    case 0xE5: return { pc, length: 1, bytes: raw(1), text: 'PUSH HL' };
    case 0xE6: return { pc, length: 2, bytes: raw(2), text: `AND ${hexByte(b1)}` };
    case 0xE8: return { pc, length: 1, bytes: raw(1), text: 'RET PE' };
    case 0xE9: return { pc, length: 1, bytes: raw(1), text: 'JP (HL)' };
    case 0xEB: return { pc, length: 1, bytes: raw(1), text: 'EX DE, HL' };
    case 0xEE: return { pc, length: 2, bytes: raw(2), text: `XOR ${hexByte(b1)}` };
    case 0xF0: return { pc, length: 1, bytes: raw(1), text: 'RET P' };
    case 0xF1: return { pc, length: 1, bytes: raw(1), text: 'POP AF' };
    case 0xF3: return { pc, length: 1, bytes: raw(1), text: 'DI' };
    case 0xF5: return { pc, length: 1, bytes: raw(1), text: 'PUSH AF' };
    case 0xF6: return { pc, length: 2, bytes: raw(2), text: `OR ${hexByte(b1)}` };
    case 0xF8: return { pc, length: 1, bytes: raw(1), text: 'RET M' };
    case 0xF9: return { pc, length: 1, bytes: raw(1), text: 'LD SP, HL' };
    case 0xFB: return { pc, length: 1, bytes: raw(1), text: 'EI' };
    case 0xFE: return { pc, length: 2, bytes: raw(2), text: `CP ${hexByte(b1)}` };
    case 0xFF: return { pc, length: 1, bytes: raw(1), text: 'RST 0x38' };
    default: return { pc, length: 1, bytes: raw(1), text: `DB ${hexByte(op)}` };
  }
}

// ---------- Part 1: Static Disassembly ----------

function printDisassembly(romBytes) {
  console.log('========================================================================');
  console.log(`PART 1: Static disassembly ${hex(DISASM_START)} - ${hex(DISASM_END)}`);
  console.log('========================================================================');
  console.log('');

  let pc = DISASM_START;
  while (pc < DISASM_END) {
    const row = decodeRomInstructionAt(romBytes, pc);
    let marker = '';
    if (pc === BIT4_ADDR) marker = ' <-- BIT 4 test';
    if (pc === ENTRY_PC) marker = ' <-- ENTRY';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += Math.max(1, row.length);
  }
  console.log('');
}

// ---------- Part 2: Find parent function ----------

function findFunctionBoundaries(romBytes) {
  console.log('========================================================================');
  console.log('PART 2: Parent function boundaries');
  console.log('========================================================================');
  console.log('');

  // Scan backwards from BIT4_ADDR for RET (0xC9)
  let funcStart = null;
  for (let addr = BIT4_ADDR - 1; addr >= BIT4_ADDR - 256 && addr >= 0; addr--) {
    const byte = romBytes[addr];
    if (byte === 0xC9) {
      funcStart = addr + 1;
      console.log(`  RET found at ${hex(addr)}, function likely starts at ${hex(funcStart)}`);
      break;
    }
  }
  if (funcStart === null) {
    console.log('  No RET found scanning backwards 256 bytes');
    funcStart = BIT4_ADDR - 64;
  }

  // Scan forwards from BIT4_ADDR for RET (0xC9)
  let funcEnd = null;
  for (let addr = BIT4_ADDR + 1; addr <= BIT4_ADDR + 256 && addr < romBytes.length; addr++) {
    const byte = romBytes[addr];
    if (byte === 0xC9) {
      funcEnd = addr;
      console.log(`  RET found at ${hex(addr)}, function likely ends at ${hex(funcEnd)}`);
      break;
    }
  }
  if (funcEnd === null) {
    console.log('  No RET found scanning forwards 256 bytes');
    funcEnd = BIT4_ADDR + 64;
  }

  console.log('');
  console.log(`  Disassembly of parent function (${hex(funcStart)} - ${hex(funcEnd + 1)}):`);
  let pc = funcStart;
  const endPc = Math.min(funcEnd + 1, funcStart + 256);
  while (pc < endPc) {
    const row = decodeRomInstructionAt(romBytes, pc);
    let marker = '';
    if (pc === BIT4_ADDR) marker = ' <-- BIT 4,(HL) test';
    if (pc === ENTRY_PC) marker = ' <-- ENTRY (0x051B2B)';
    console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += Math.max(1, row.length);
  }
  console.log('');

  return { funcStart, funcEnd };
}

// ---------- Part 3: Find callers ----------

function findCallers(romBytes, funcStart, funcEnd) {
  console.log('========================================================================');
  console.log('PART 3: Callers of function containing BIT 4 test');
  console.log('========================================================================');
  console.log('');

  // Scan for CALL/JP patterns targeting addresses in [funcStart, funcEnd]
  // Also scan for the specific entry 0x051B2B
  const targetAddrs = new Set();
  targetAddrs.add(ENTRY_PC); // 0x051B2B
  if (funcStart !== ENTRY_PC) targetAddrs.add(funcStart);

  const callers = [];
  const romLen = romBytes.length;

  for (const target of targetAddrs) {
    const lo = target & 0xFF;
    const mid = (target >>> 8) & 0xFF;
    const hi = (target >>> 16) & 0xFF;

    for (let addr = 0; addr < romLen - 3; addr++) {
      const op = romBytes[addr];
      // ADL CALL: CD xx xx xx
      if (op === 0xCD && romBytes[addr + 1] === lo && romBytes[addr + 2] === mid && romBytes[addr + 3] === hi) {
        callers.push({ addr, type: 'CALL', target });
      }
      // ADL JP: C3 xx xx xx
      if (op === 0xC3 && romBytes[addr + 1] === lo && romBytes[addr + 2] === mid && romBytes[addr + 3] === hi) {
        callers.push({ addr, type: 'JP', target });
      }
      // Conditional CALL (C4/CC/D4/DC/E4/EC/F4/FC)
      if ((op & 0xC7) === 0xC4 && op !== 0xCD && romBytes[addr + 1] === lo && romBytes[addr + 2] === mid && romBytes[addr + 3] === hi) {
        const condNames = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
        callers.push({ addr, type: `CALL ${condNames[op] ?? '??'}`, target });
      }
      // Conditional JP (C2/CA/D2/DA/E2/EA/F2/FA)
      if ((op & 0xC7) === 0xC2 && op !== 0xC3 && romBytes[addr + 1] === lo && romBytes[addr + 2] === mid && romBytes[addr + 3] === hi) {
        const condNames = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
        callers.push({ addr, type: `JP ${condNames[op] ?? '??'}`, target });
      }
    }
  }

  if (callers.length === 0) {
    console.log('  No CALL/JP references found targeting function start or 0x051B2B');
  } else {
    console.log(`  Found ${callers.length} reference(s):`);
    for (const c of callers) {
      const context = bytesToHex(romBytes.subarray(c.addr, c.addr + 6));
      console.log(`    ${hex(c.addr)}: ${c.type} ${hex(c.target)}  [bytes: ${context}]`);
    }
  }
  console.log('');

  return callers;
}

// ---------- Boot ----------

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, memInit };
}

// ---------- Dynamic trace ----------

function runTrace(executor, cpu, mem, scenarioName, d003e0Value, opts = {}) {
  const entryPc = opts.entryPc ?? ENTRY_PC;
  const d010f8Value = opts.d010f8 ?? 0x01;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryPc;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set
  cpu.sp = STACK_TOP;

  // Seed key RAM
  mem[D00000_ADDR] = 0x00;
  mem[D003DA_ADDR] = 0x00;
  mem[D003DD_ADDR] = 0x00; // checked at 0x051B94: CP 0x4A / CP 0x48 / CP 0x49
  mem[D003E0_ADDR] = d003e0Value;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00; // must NOT be 0x80 or function bails to 0x051BD7
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;
  mem[D010F8_ADDR] = d010f8Value; // when BIT 4 SET: CP 0x01 -> if Z, jump to 0x051BD7

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  // Install step shim
  installStepShim(cpu, executor);

  // Snapshots before
  const iyBefore = snapshotIyFlags(mem, IY_HOME);
  const ramBefore = {};
  for (const w of WATCHED_ADDRS) {
    ramBefore[w.name] = mem[w.addr];
  }

  // Trace state
  const visitOrder = [];
  const visitCounts = new Map();
  const landmarkLog = [];
  const ramWriteLog = [];
  const vramWriteBlocks = new Set();
  let vramWriteCount = 0;
  const spTransitions = [];
  let currentStep = 0;

  // Per-step PC log for path comparison
  const pcTrace = [];

  // Install write tracing
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function traceWrite(addr, width) {
    const base = addr & MEM_MASK;
    const pc = cpu._currentBlockPc & 0xFFFFFF;

    if (base >= VRAM_START && base < VRAM_END) {
      vramWriteCount++;
      vramWriteBlocks.add(pc);
    }

    for (const w of WATCHED_ADDRS) {
      if (base <= w.addr && base + width > w.addr) {
        if (ramWriteLog.length < 200) {
          ramWriteLog.push({
            step: currentStep,
            pc,
            addr: w.addr,
            name: w.name,
            valueBefore: mem[w.addr],
          });
        }
      }
    }
  }

  cpu.write8 = (addr, value) => {
    traceWrite(addr, 1);
    originalWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    traceWrite(addr, 2);
    originalWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    traceWrite(addr, 3);
    originalWrite24(addr, value);
  };

  // Run the trace
  let stopReason = 'budget_exhausted';
  let error = null;

  try {
    while (currentStep < STEP_LIMIT) {
      const pc = cpu.pc & 0xFFFFFF;
      currentStep++;

      pcTrace.push(pc);
      visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
      if (!visitOrder.includes(pc)) {
        visitOrder.push(pc);
      }

      if (LANDMARKS.has(pc)) {
        const lastLandmark = landmarkLog[landmarkLog.length - 1];
        if (!lastLandmark || lastLandmark.pc !== pc || currentStep - lastLandmark.step > 1) {
          landmarkLog.push({
            step: currentStep,
            pc,
            note: LANDMARKS.get(pc),
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            sp: cpu.sp & 0xFFFFFF,
            hl: cpu._hl & 0xFFFFFF,
          });
        }
      }

      if (pc === RETURN_SENTINEL || pc === (RETURN_SENTINEL & 0xFFFFFF)) {
        stopReason = 'return_sentinel';
        break;
      }

      const beforeSp = cpu.sp & 0xFFFFFF;
      let result;
      try {
        result = cpu.step();
      } catch (stepError) {
        stopReason = `error: ${stepError?.message ?? String(stepError)}`;
        error = stepError;
        break;
      }

      const afterSp = cpu.sp & 0xFFFFFF;
      if (afterSp !== beforeSp && spTransitions.length < 256) {
        spTransitions.push({
          step: currentStep,
          pc,
          from: beforeSp,
          to: afterSp,
          delta: afterSp - beforeSp,
        });
      }

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }

      const afterPc = cpu.pc & 0xFFFFFF;
      if (afterPc === RETURN_SENTINEL || afterPc === (RETURN_SENTINEL & 0xFFFFFF)) {
        stopReason = 'return_sentinel';
        break;
      }
    }
  } catch (outerError) {
    stopReason = `outer_error: ${outerError?.message ?? String(outerError)}`;
    error = outerError;
  }

  // Restore write functions
  cpu.write8 = originalWrite8;
  cpu.write16 = originalWrite16;
  cpu.write24 = originalWrite24;

  // Snapshots after
  const iyAfter = snapshotIyFlags(mem, IY_HOME);
  const ramAfter = {};
  for (const w of WATCHED_ADDRS) {
    ramAfter[w.name] = mem[w.addr];
  }

  return {
    scenarioName,
    d003e0Value,
    steps: currentStep,
    stopReason,
    error,
    finalPc: cpu.pc & 0xFFFFFF,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalBC: cpu._bc & 0xFFFFFF,
    finalDE: cpu._de & 0xFFFFFF,
    finalHL: cpu._hl & 0xFFFFFF,
    finalIX: cpu._ix & 0xFFFFFF,
    finalIY: cpu._iy & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    visitOrder,
    visitCounts,
    landmarkLog,
    ramBefore,
    ramAfter,
    ramWriteLog,
    iyBefore,
    iyAfter,
    iyChanges: diffIySnapshots(iyBefore, iyAfter),
    vramWriteCount,
    vramWriteBlocks: [...vramWriteBlocks],
    spTransitions,
    pcTrace,
  };
}

// ---------- Print results ----------

function printTraceResults(result) {
  console.log(`  Scenario: ${result.scenarioName} (D003E0=${hexByte(result.d003e0Value)})`);
  console.log(`  Stop reason:       ${result.stopReason}`);
  console.log(`  Error:             ${result.error ? (result.error.message ?? String(result.error)) : '(none)'}`);
  console.log(`  Steps executed:    ${result.steps}`);
  console.log(`  Unique blocks:     ${result.visitOrder.length}`);
  console.log(`  Final PC:          ${hex(result.finalPc)}`);
  console.log(`  Final regs:        A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} BC=${hex(result.finalBC)} DE=${hex(result.finalDE)} HL=${hex(result.finalHL)}`);
  console.log(`  Final index regs:  IX=${hex(result.finalIX)} IY=${hex(result.finalIY)} SP=${hex(result.finalSP)}`);
  console.log('');

  // Landmark log
  console.log('  Landmark log:');
  if (result.landmarkLog.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of result.landmarkLog) {
      console.log(`    Step ${String(entry.step).padStart(5)}: ${hex(entry.pc)} A=${hexByte(entry.a)} F=${hexByte(entry.f)} HL=${hex(entry.hl)} SP=${hex(entry.sp)} -- ${entry.note}`);
    }
  }
  console.log('');

  // RAM watch
  console.log('  RAM watch (before -> after):');
  for (const w of WATCHED_ADDRS) {
    const before = result.ramBefore[w.name];
    const after = result.ramAfter[w.name];
    const changed = before !== after ? ' <-- CHANGED' : '';
    console.log(`    ${w.name} (${hex(w.addr)}): ${hexByte(before)} -> ${hexByte(after)}${changed}`);
  }
  console.log('');

  // RAM write log
  console.log(`  RAM write events: ${result.ramWriteLog.length}`);
  if (result.ramWriteLog.length > 0) {
    const shown = result.ramWriteLog.slice(0, 30);
    for (const entry of shown) {
      console.log(`    Step ${String(entry.step).padStart(5)}: ${hex(entry.pc)} wrote ${entry.name} (${hex(entry.addr)}) (was ${hexByte(entry.valueBefore)})`);
    }
    if (result.ramWriteLog.length > 30) {
      console.log(`    ... and ${result.ramWriteLog.length - 30} more`);
    }
  }
  console.log('');

  // VRAM writes
  console.log(`  VRAM writes: ${result.vramWriteCount} calls, writers: ${result.vramWriteBlocks.length > 0 ? result.vramWriteBlocks.map(hex).join(', ') : '(none)'}`);
  console.log('');

  // IY flag changes
  console.log('  IY flag changes:');
  if (result.iyChanges.length === 0) {
    console.log('    (none)');
  } else {
    for (const change of result.iyChanges) {
      console.log(`    ${change}`);
    }
  }
  console.log('');

  // Hot blocks (top 20)
  const hotBlocks = [...result.visitCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 20);
  console.log('  Hot blocks (top 20):');
  for (const [pc, count] of hotBlocks) {
    const landmark = LANDMARKS.has(pc) ? ` -- ${LANDMARKS.get(pc)}` : '';
    console.log(`    ${hex(pc)}: ${count} visits${landmark}`);
  }
  console.log('');

  // Block visit order
  console.log(`  Block visit order (${result.visitOrder.length} unique):`);
  const MAX_LINE = 96;
  let line = '    ';
  for (let i = 0; i < result.visitOrder.length; i++) {
    const token = hex(result.visitOrder[i]);
    const sep = i > 0 ? ' -> ' : '';
    if (line.length + sep.length + token.length > MAX_LINE && line.trim()) {
      console.log(line);
      line = '      ' + token;
    } else {
      line += sep + token;
    }
  }
  if (line.trim()) console.log(line);
  console.log('');
}

// ---------- Part 5: Compare scenarios ----------

function compareScenarios(resultA, resultB) {
  console.log('========================================================================');
  console.log('PART 5: Scenario comparison (BIT 4 CLEAR vs SET)');
  console.log('========================================================================');
  console.log('');

  // Blocks in A but not B
  const blocksA = new Set(resultA.visitOrder);
  const blocksB = new Set(resultB.visitOrder);

  const onlyA = [...blocksA].filter((pc) => !blocksB.has(pc));
  const onlyB = [...blocksB].filter((pc) => !blocksA.has(pc));
  const common = [...blocksA].filter((pc) => blocksB.has(pc));

  console.log(`  Common blocks: ${common.length}`);
  console.log(`  Only in Scenario A (BIT 4 CLEAR): ${onlyA.length}`);
  if (onlyA.length > 0) {
    for (const pc of onlyA) {
      const landmark = LANDMARKS.has(pc) ? ` -- ${LANDMARKS.get(pc)}` : '';
      console.log(`    ${hex(pc)}${landmark}`);
    }
  }
  console.log(`  Only in Scenario B (BIT 4 SET): ${onlyB.length}`);
  if (onlyB.length > 0) {
    for (const pc of onlyB) {
      const landmark = LANDMARKS.has(pc) ? ` -- ${LANDMARKS.get(pc)}` : '';
      console.log(`    ${hex(pc)}${landmark}`);
    }
  }
  console.log('');

  // Where traces diverge
  const minLen = Math.min(resultA.pcTrace.length, resultB.pcTrace.length);
  let divergeStep = -1;
  for (let i = 0; i < minLen; i++) {
    if (resultA.pcTrace[i] !== resultB.pcTrace[i]) {
      divergeStep = i;
      break;
    }
  }
  if (divergeStep >= 0) {
    console.log(`  Traces diverge at step ${divergeStep + 1}:`);
    console.log(`    A: ${hex(resultA.pcTrace[divergeStep])}`);
    console.log(`    B: ${hex(resultB.pcTrace[divergeStep])}`);
    // Show a few steps before/after
    const start = Math.max(0, divergeStep - 3);
    const end = Math.min(minLen, divergeStep + 5);
    console.log('');
    console.log('    Context (step -> A_pc / B_pc):');
    for (let i = start; i < end; i++) {
      const marker = i === divergeStep ? ' <-- DIVERGE' : '';
      const apc = i < resultA.pcTrace.length ? hex(resultA.pcTrace[i]) : '(end)';
      const bpc = i < resultB.pcTrace.length ? hex(resultB.pcTrace[i]) : '(end)';
      console.log(`      Step ${i + 1}: A=${apc} B=${bpc}${marker}`);
    }
  } else if (resultA.pcTrace.length !== resultB.pcTrace.length) {
    console.log(`  Traces match for ${minLen} common steps, then one ends early.`);
    console.log(`    A length: ${resultA.pcTrace.length}, B length: ${resultB.pcTrace.length}`);
  } else {
    console.log('  Traces are IDENTICAL for all steps.');
  }
  console.log('');

  // RAM differences
  console.log('  RAM final value differences:');
  let anyDiff = false;
  for (const w of WATCHED_ADDRS) {
    const aVal = resultA.ramAfter[w.name];
    const bVal = resultB.ramAfter[w.name];
    if (aVal !== bVal) {
      console.log(`    ${w.name}: A=${hexByte(aVal)} vs B=${hexByte(bVal)}`);
      anyDiff = true;
    }
  }
  if (!anyDiff) {
    console.log('    (none)');
  }
  console.log('');

  // Stop reason differences
  if (resultA.stopReason !== resultB.stopReason) {
    console.log(`  Stop reason differs: A="${resultA.stopReason}" vs B="${resultB.stopReason}"`);
  } else {
    console.log(`  Both stopped with: "${resultA.stopReason}"`);
  }
  console.log('');
}

// ---------- Main ----------

async function main() {
  console.log('Phase 241: Trace 0x051B84 BIT 4,(HL) test on D003E0');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Entry: ${hex(ENTRY_PC)}, SP=${hex(STACK_TOP)}, IX=${hex(IX_HOME)}, IY=${hex(IY_HOME)}`);
    console.log(`Return sentinel: ${hex(RETURN_SENTINEL)}`);
    console.log(`Step limit: ${STEP_LIMIT}`);
    console.log('');

    // PART 1: Static disassembly around the BIT 4 test
    printDisassembly(romBytes);

    // PART 2: Find parent function boundaries
    const { funcStart, funcEnd } = findFunctionBoundaries(romBytes);

    // PART 3: Find callers
    findCallers(romBytes, funcStart, funcEnd);

    // Boot the system
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    console.log('========================================================================');
    console.log('BOOT');
    console.log('========================================================================');
    const bootSummary = coldBoot(executor, cpu, mem);
    console.log(`boot:        steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}`);
    console.log(`kernelInit:  steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}`);
    console.log(`memInit:     steps=${bootSummary.memInit.steps} term=${bootSummary.memInit.termination} lastPc=${hex(bootSummary.memInit.lastPc)}`);
    console.log('');

    // Save boot state for replay
    const bootSnapshot = snapshotCpu(cpu);
    const bootMem = new Uint8Array(mem);

    // PART 4A: Scenario A -- D003E0=0x00 (BIT 4 CLEAR), enter at 0x051B7C
    console.log('========================================================================');
    console.log('PART 4A: Dynamic trace -- Scenario A (D003E0=0x00, BIT 4 CLEAR)');
    console.log('========================================================================');
    console.log('');
    const resultA = runTrace(executor, cpu, mem, 'A: BIT 4 CLEAR', 0x00, { d010f8: 0x00 });
    printTraceResults(resultA);

    // Restore boot state for Scenario B
    mem.set(bootMem);
    restoreCpu(cpu, bootSnapshot);

    // PART 4B: Scenario B -- D003E0=0x10 (BIT 4 SET), D010F8=0x01 (triggers early exit)
    console.log('========================================================================');
    console.log('PART 4B: Dynamic trace -- Scenario B (D003E0=0x10, BIT 4 SET, D010F8=0x01)');
    console.log('========================================================================');
    console.log('');
    const resultB = runTrace(executor, cpu, mem, 'B: BIT 4 SET + D010F8=0x01', 0x10, { d010f8: 0x01 });
    printTraceResults(resultB);

    // Restore boot state for Scenario C
    mem.set(bootMem);
    restoreCpu(cpu, bootSnapshot);

    // PART 4C: Scenario C -- D003E0=0x10 (BIT 4 SET), D010F8=0x00 (does NOT trigger early exit)
    console.log('========================================================================');
    console.log('PART 4C: Dynamic trace -- Scenario C (D003E0=0x10, BIT 4 SET, D010F8=0x00)');
    console.log('========================================================================');
    console.log('');
    const resultC = runTrace(executor, cpu, mem, 'C: BIT 4 SET + D010F8=0x00', 0x10, { d010f8: 0x00 });
    printTraceResults(resultC);

    // PART 5: Compare A vs B (BIT 4 matters when D010F8=0x01)
    console.log('--- Compare A (CLEAR) vs B (SET + D010F8=0x01) ---');
    compareScenarios(resultA, resultB);

    // Compare A vs C (BIT 4 SET but D010F8 not 0x01 — should fall through like A)
    console.log('--- Compare A (CLEAR) vs C (SET + D010F8=0x00) ---');
    compareScenarios(resultA, resultC);

    // PART 6: Summary
    console.log('========================================================================');
    console.log('PART 6: Summary');
    console.log('========================================================================');
    console.log('');
    console.log(`  BIT 4 test at ${hex(BIT4_ADDR)} in function at ${hex(ENTRY_PC)}`);
    console.log(`  Scenario A (CLEAR, D010F8=0x00):       ${resultA.steps} steps, stop=${resultA.stopReason}, finalPC=${hex(resultA.finalPc)}`);
    console.log(`  Scenario B (SET, D010F8=0x01):          ${resultB.steps} steps, stop=${resultB.stopReason}, finalPC=${hex(resultB.finalPc)}`);
    console.log(`  Scenario C (SET, D010F8=0x00):          ${resultC.steps} steps, stop=${resultC.stopReason}, finalPC=${hex(resultC.finalPc)}`);
    console.log('');

    // Determine what the BIT 4 test gates
    const blocksOnlyA_vs_B = resultA.visitOrder.filter((pc) => !resultB.visitCounts.has(pc));
    const blocksOnlyB_vs_A = resultB.visitOrder.filter((pc) => !resultA.visitCounts.has(pc));
    console.log('  BIT 4 CLEAR vs SET+D010F8=0x01:');
    if (blocksOnlyA_vs_B.length > 0 || blocksOnlyB_vs_A.length > 0) {
      console.log('    BIT 4 test DOES gate different code paths.');
      if (blocksOnlyA_vs_B.length > 0) {
        console.log(`    BIT 4 CLEAR uniquely visits: ${blocksOnlyA_vs_B.map(hex).join(', ')}`);
      }
      if (blocksOnlyB_vs_A.length > 0) {
        console.log(`    BIT 4 SET uniquely visits: ${blocksOnlyB_vs_A.map(hex).join(', ')}`);
      }
    } else {
      console.log('    Paths are identical.');
    }
    console.log('');

    console.log('  Interpretation:');
    console.log('    Function at 0x051B7C checks:');
    console.log('      1. D0059F == 0x80 -> bail to 0x051BD7');
    console.log('      2. BIT 4,(D003E0) -> if SET, check D010F8');
    console.log('         If D010F8 == 0x01, bail to 0x051BD7');
    console.log('      3. D003DD == 0x4A/0x48/0x49 -> CALL 0x07A627');
    console.log('      4. Various IY flag checks');
    console.log('    BIT 4 of D003E0 + D010F8==0x01 is a secondary "bail" condition.');
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
