#!/usr/bin/env node

/**
 * Phase 240: Trace 0x04E404 — Post-return from 0x04E447 computation loop
 *
 * Session 239 found the loop at 0x0A1A3B-0x0A1A4E (reached via 0x04E447)
 * terminates at ~1450 steps after ~35 iterations. The exit path is:
 *   0x0A1A30 -> 0x0A1B8B -> 0x0A1CEB -> 0x04E404
 * SP recovers fully.
 *
 * This probe traces what happens AFTER the computation loop returns to
 * 0x04E404. We set PC=0x04E404 directly with plausible register state
 * and run for 2000 steps to see:
 *   - Every unique block visited
 *   - Key RAM writes (D003E0, D007E0, D00824, D0058E)
 *   - VRAM writes (0xD40000-0xD52C00)
 *   - IY flag changes
 *   - Where execution ends (event loop 0x02FD99? HALT? Return?)
 *   - Disassembly of 0x04E404 and the next 30 bytes
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

// Entry point for this probe
const ENTRY_PC = 0x04E404;
const DISASM_START = 0x04E404;
const DISASM_BYTE_COUNT = 30;

// Register seeds
const STACK_TOP = 0xD1A800;
const STACK_RESET_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x00CAFE;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

// Step budget
const STEP_LIMIT = 2000;

// Key RAM watch addresses
const D003E0_ADDR = 0xD003E0;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;
const D003DA_ADDR = 0xD003DA;
const D00000_ADDR = 0xD00000;

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
];

// Known landmark addresses
const LANDMARKS = new Map([
  [0x04E404, 'post-return from computation loop'],
  [0x04E447, '0x04E447 computation loop entry'],
  [0x02FD99, 'main event loop'],
  [0x04EDD0, 'key code action handler'],
  [0x04EAD8, 'main key dispatch loop'],
  [0x04EB02, 'key classifier entry'],
  [0x04EDB1, 'D00824 writer'],
  [0x04EF17, 'D00824 XOR A writer'],
  [0x09EFDE, 'VRAM fill routine'],
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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase240-${process.pid}.mjs`);
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
    return { pc, length: 1, bytes: raw(1), text: `DB ${hexByte(op)}` };
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
    case 0x01: return { pc, length: 4, bytes: raw(4), text: `LD BC, ${hex(imm24)}` };
    case 0x06: return { pc, length: 2, bytes: raw(2), text: `LD B, ${hexByte(b1)}` };
    case 0x0E: return { pc, length: 2, bytes: raw(2), text: `LD C, ${hexByte(b1)}` };
    case 0x11: return { pc, length: 4, bytes: raw(4), text: `LD DE, ${hex(imm24)}` };
    case 0x16: return { pc, length: 2, bytes: raw(2), text: `LD D, ${hexByte(b1)}` };
    case 0x18: return { pc, length: 2, bytes: raw(2), text: `JR ${hex((pc + 2 + signedByte(b1)) & 0xFFFFFF)}` };
    case 0x1E: return { pc, length: 2, bytes: raw(2), text: `LD E, ${hexByte(b1)}` };
    case 0x21: return { pc, length: 4, bytes: raw(4), text: `LD HL, ${hex(imm24)}` };
    case 0x22: return { pc, length: 4, bytes: raw(4), text: `LD (${hex(imm24)}), HL` };
    case 0x23: return { pc, length: 1, bytes: raw(1), text: 'INC HL' };
    case 0x2A: return { pc, length: 4, bytes: raw(4), text: `LD HL, (${hex(imm24)})` };
    case 0x2B: return { pc, length: 1, bytes: raw(1), text: 'DEC HL' };
    case 0x32: return { pc, length: 4, bytes: raw(4), text: `LD (${hex(imm24)}), A` };
    case 0x36: return { pc, length: 2, bytes: raw(2), text: `LD (HL), ${hexByte(b1)}` };
    case 0x3A: return { pc, length: 4, bytes: raw(4), text: `LD A, (${hex(imm24)})` };
    case 0x3E: return { pc, length: 2, bytes: raw(2), text: `LD A, ${hexByte(b1)}` };
    case 0x46: return { pc, length: 1, bytes: raw(1), text: 'LD B, (HL)' };
    case 0x4E: return { pc, length: 1, bytes: raw(1), text: 'LD C, (HL)' };
    case 0x56: return { pc, length: 1, bytes: raw(1), text: 'LD D, (HL)' };
    case 0x5E: return { pc, length: 1, bytes: raw(1), text: 'LD E, (HL)' };
    case 0x66: return { pc, length: 1, bytes: raw(1), text: 'LD H, (HL)' };
    case 0x6E: return { pc, length: 1, bytes: raw(1), text: 'LD L, (HL)' };
    case 0x76: return { pc, length: 1, bytes: raw(1), text: 'HALT' };
    case 0x77: return { pc, length: 1, bytes: raw(1), text: 'LD (HL), A' };
    case 0x7E: return { pc, length: 1, bytes: raw(1), text: 'LD A, (HL)' };
    case 0xA7: return { pc, length: 1, bytes: raw(1), text: 'AND A' };
    case 0xAF: return { pc, length: 1, bytes: raw(1), text: 'XOR A' };
    case 0xB7: return { pc, length: 1, bytes: raw(1), text: 'OR A' };
    case 0xC1: return { pc, length: 1, bytes: raw(1), text: 'POP BC' };
    case 0xC3: return { pc, length: 4, bytes: raw(4), text: `JP ${hex(imm24)}` };
    case 0xC5: return { pc, length: 1, bytes: raw(1), text: 'PUSH BC' };
    case 0xC9: return { pc, length: 1, bytes: raw(1), text: 'RET' };
    case 0xCB: {
      const subop = b1;
      const group = (subop >> 6) & 0x03;
      const bit = (subop >> 3) & 0x07;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const reg = regNames[subop & 0x07];
      if (group === 1) return { pc, length: 2, bytes: raw(2), text: `BIT ${bit}, ${reg}` };
      if (group === 2) return { pc, length: 2, bytes: raw(2), text: `RES ${bit}, ${reg}` };
      if (group === 3) return { pc, length: 2, bytes: raw(2), text: `SET ${bit}, ${reg}` };
      return { pc, length: 2, bytes: raw(2), text: `CB ${hexByte(subop)}` };
    }
    case 0xCD: return { pc, length: 4, bytes: raw(4), text: `CALL ${hex(imm24)}` };
    case 0xD1: return { pc, length: 1, bytes: raw(1), text: 'POP DE' };
    case 0xD5: return { pc, length: 1, bytes: raw(1), text: 'PUSH DE' };
    case 0xD9: return { pc, length: 1, bytes: raw(1), text: 'EXX' };
    case 0xE1: return { pc, length: 1, bytes: raw(1), text: 'POP HL' };
    case 0xE5: return { pc, length: 1, bytes: raw(1), text: 'PUSH HL' };
    case 0xEB: return { pc, length: 1, bytes: raw(1), text: 'EX DE, HL' };
    case 0xF1: return { pc, length: 1, bytes: raw(1), text: 'POP AF' };
    case 0xF3: return { pc, length: 1, bytes: raw(1), text: 'DI' };
    case 0xF5: return { pc, length: 1, bytes: raw(1), text: 'PUSH AF' };
    case 0xFB: return { pc, length: 1, bytes: raw(1), text: 'EI' };
    case 0xFE: return { pc, length: 2, bytes: raw(2), text: `CP ${hexByte(b1)}` };
    default: return { pc, length: 1, bytes: raw(1), text: `DB ${hexByte(op)}` };
  }
}

function printDisassembly(romBytes) {
  console.log('========================================================================');
  console.log(`PART 1: Disassembly from ${hex(DISASM_START)} (${DISASM_BYTE_COUNT} bytes)`);
  console.log('========================================================================');
  console.log('');

  let pc = DISASM_START;
  const end = DISASM_START + DISASM_BYTE_COUNT;
  while (pc < end) {
    const row = decodeRomInstructionAt(romBytes, pc);
    const marker = (pc === ENTRY_PC) ? ' <-- ENTRY' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += Math.max(1, row.length);
  }
  console.log('');
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

function runTrace(executor, cpu, mem) {
  // Seed CPU state as if we just returned from 0x04E447 computation loop
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set (common post-computation state)
  cpu.sp = STACK_TOP;

  // Seed key RAM
  mem[D00000_ADDR] = 0x00;
  mem[D003DA_ADDR] = 0x00;
  mem[D003E0_ADDR] = 0x08;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;

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

  // Track VRAM state before
  const vramSnapshot = new Uint8Array(VRAM_END - VRAM_START);
  vramSnapshot.set(mem.subarray(VRAM_START, VRAM_END));

  // Trace state
  const visitOrder = [];
  const visitCounts = new Map();
  const landmarkLog = [];
  const ramWriteLog = [];
  const vramWriteBlocks = new Set();
  let vramWriteCount = 0;
  const spTransitions = [];
  let currentStep = 0;

  // Install write tracing
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function traceWrite(addr, width) {
    const base = addr & MEM_MASK;
    const pc = cpu._currentBlockPc & 0xFFFFFF;

    // VRAM check
    if (base >= VRAM_START && base < VRAM_END) {
      vramWriteCount++;
      vramWriteBlocks.add(pc);
    }

    // Watched RAM check
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

      // Record visit
      visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
      if (!visitOrder.includes(pc)) {
        visitOrder.push(pc);
      }

      // Log landmarks
      if (LANDMARKS.has(pc)) {
        const lastLandmark = landmarkLog[landmarkLog.length - 1];
        if (!lastLandmark || lastLandmark.pc !== pc || currentStep - lastLandmark.step > 1) {
          landmarkLog.push({
            step: currentStep,
            pc,
            note: LANDMARKS.get(pc),
            a: cpu.a & 0xFF,
            sp: cpu.sp & 0xFFFFFF,
          });
        }
      }

      // Return sentinel check
      if (pc === RETURN_SENTINEL || pc === (RETURN_SENTINEL & 0xFFFFFF)) {
        stopReason = 'return_sentinel';
        break;
      }

      // Step
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

  // VRAM diff
  let vramChangedBytes = 0;
  for (let i = 0; i < vramSnapshot.length; i++) {
    if (vramSnapshot[i] !== mem[VRAM_START + i]) {
      vramChangedBytes++;
    }
  }

  return {
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
    vramChangedBytes,
    vramWriteBlocks: [...vramWriteBlocks],
    spTransitions,
  };
}

// ---------- Print results ----------

function printTraceResults(result) {
  console.log('========================================================================');
  console.log('PART 2: Dynamic trace from 0x04E404 (2000 steps)');
  console.log('========================================================================');
  console.log('');

  console.log(`  Stop reason:       ${result.stopReason}`);
  console.log(`  Error:             ${result.error ? (result.error.message ?? String(result.error)) : '(none)'}`);
  console.log(`  Steps executed:    ${result.steps}`);
  console.log(`  Unique blocks:     ${result.visitOrder.length}`);
  console.log(`  Final PC:          ${hex(result.finalPc)}`);
  console.log(`  Final regs:        A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} BC=${hex(result.finalBC)} DE=${hex(result.finalDE)} HL=${hex(result.finalHL)}`);
  console.log(`  Final index regs:  IX=${hex(result.finalIX)} IY=${hex(result.finalIY)} SP=${hex(result.finalSP)}`);
  console.log('');

  // Destination analysis
  const knownDests = [
    { addr: 0x02FD99, name: 'main event loop' },
    { addr: 0x04EAD8, name: 'key dispatch loop' },
  ];
  for (const dest of knownDests) {
    if (result.visitCounts.has(dest.addr)) {
      console.log(`  ** Reached ${dest.name} at ${hex(dest.addr)} (${result.visitCounts.get(dest.addr)} visits) **`);
    }
  }
  if (result.stopReason === 'halt') {
    console.log('  ** Execution ended at HALT **');
  }
  if (result.stopReason === 'return_sentinel') {
    console.log('  ** Returned to sentinel (0xCAFE) — function completed and returned to caller **');
  }
  console.log('');

  // Landmark log
  console.log('Landmark log:');
  if (result.landmarkLog.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of result.landmarkLog) {
      console.log(`  Step ${String(entry.step).padStart(5)}: ${hex(entry.pc)} A=${hexByte(entry.a)} SP=${hex(entry.sp)} -- ${entry.note}`);
    }
  }
  console.log('');

  // RAM watch
  console.log('RAM watch (before -> after):');
  for (const w of WATCHED_ADDRS) {
    const before = result.ramBefore[w.name];
    const after = result.ramAfter[w.name];
    const changed = before !== after ? ' <-- CHANGED' : '';
    console.log(`  ${w.name} (${hex(w.addr)}): ${hexByte(before)} -> ${hexByte(after)}${changed}`);
  }
  console.log('');

  // RAM write log
  console.log(`RAM write events to watched addresses: ${result.ramWriteLog.length}`);
  if (result.ramWriteLog.length > 0) {
    const shown = result.ramWriteLog.slice(0, 50);
    for (const entry of shown) {
      console.log(`  Step ${String(entry.step).padStart(5)}: ${hex(entry.pc)} wrote ${entry.name} (${hex(entry.addr)}) (was ${hexByte(entry.valueBefore)})`);
    }
    if (result.ramWriteLog.length > 50) {
      console.log(`  ... and ${result.ramWriteLog.length - 50} more`);
    }
  }
  console.log('');

  // VRAM writes
  console.log('VRAM writes (0xD40000-0xD52C00):');
  console.log(`  Total write calls:  ${result.vramWriteCount}`);
  console.log(`  Changed bytes:      ${result.vramChangedBytes}`);
  console.log(`  Writer PCs:         ${result.vramWriteBlocks.length > 0 ? result.vramWriteBlocks.map(hex).join(', ') : '(none)'}`);
  console.log('');

  // IY flag changes
  console.log('IY flag changes:');
  console.log(`  Before: ${formatIySnapshot(result.iyBefore)}`);
  console.log(`  After:  ${formatIySnapshot(result.iyAfter)}`);
  if (result.iyChanges.length === 0) {
    console.log('  Changes: (none)');
  } else {
    for (const change of result.iyChanges) {
      console.log(`  ${change}`);
    }
  }
  console.log('');

  // SP transitions
  console.log(`SP transitions: ${result.spTransitions.length}`);
  if (result.spTransitions.length > 0) {
    const shown = result.spTransitions.slice(0, 40);
    for (const entry of shown) {
      console.log(`  Step ${String(entry.step).padStart(5)}: ${hex(entry.pc)} SP ${hex(entry.from)} -> ${hex(entry.to)} (delta=${entry.delta})`);
    }
    if (result.spTransitions.length > 40) {
      console.log(`  ... and ${result.spTransitions.length - 40} more`);
    }
  }
  console.log('');

  // Hot blocks (top 30)
  const hotBlocks = [...result.visitCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 30);
  console.log('Hot blocks (top 30 by visit count):');
  for (const [pc, count] of hotBlocks) {
    const landmark = LANDMARKS.has(pc) ? ` -- ${LANDMARKS.get(pc)}` : '';
    console.log(`  ${hex(pc)}: ${count} visits${landmark}`);
  }
  console.log('');

  // Full block chain
  console.log(`Block visit order (${result.visitOrder.length} unique blocks):`);
  const MAX_LINE = 100;
  let line = '  ';
  for (let i = 0; i < result.visitOrder.length; i++) {
    const token = hex(result.visitOrder[i]);
    const sep = i > 0 ? ' -> ' : '';
    if (line.length + sep.length + token.length > MAX_LINE && line.trim()) {
      console.log(line);
      line = '    ' + token;
    } else {
      line += sep + token;
    }
  }
  if (line.trim()) console.log(line);
  console.log('');
}

// ---------- Summary ----------

function printSummary(result) {
  console.log('========================================================================');
  console.log('PART 3: Summary');
  console.log('========================================================================');
  console.log('');
  console.log(`  0x04E404 trace completed in ${result.steps} steps.`);
  console.log(`  Stop reason: ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  console.log('');

  if (result.visitCounts.has(0x02FD99)) {
    console.log('  CONCLUSION: Execution reached the main event loop at 0x02FD99.');
  } else if (result.stopReason === 'halt') {
    console.log('  CONCLUSION: Execution ended at HALT.');
  } else if (result.stopReason === 'return_sentinel') {
    console.log('  CONCLUSION: Function returned cleanly to caller (sentinel 0xCAFE).');
  } else {
    console.log(`  CONCLUSION: Execution stopped: ${result.stopReason}`);
  }

  const ramChanges = WATCHED_ADDRS.filter((w) => result.ramBefore[w.name] !== result.ramAfter[w.name]);
  console.log(`  RAM changes: ${ramChanges.length} watched addresses modified${ramChanges.length > 0 ? ': ' + ramChanges.map((w) => w.name).join(', ') : '.'}`);
  console.log(`  VRAM: ${result.vramWriteCount} write calls, ${result.vramChangedBytes} bytes changed.`);
  console.log(`  IY flags: ${result.iyChanges.length} offsets changed.`);
  console.log('');
}

// ---------- Main ----------

async function main() {
  console.log('Phase 240: Trace 0x04E404 — Post-return from computation loop');
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

    // PART 1: Disassembly
    printDisassembly(romBytes);

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

    // PART 2: Dynamic trace
    const result = runTrace(executor, cpu, mem);
    printTraceResults(result);

    // PART 3: Summary
    printSummary(result);

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
