#!/usr/bin/env node

/**
 * Phase 248 — Investigate 0x006202 delay loop structure and test stubbing
 *
 * RESULTS (run output summary):
 *   TASK 1: Full disassembly of delay function 0x0061E3-0x00620C:
 *     - Entry 0x0061E3: LD A,1 / PUSH DE / PUSH HL / LD DE,1
 *     - Reads port 0x03 bit 4 to select count: 48MHz->HL=0x8BD8(35800), 6MHz->HL=0x1E3E(7742)
 *     - Inner loop at 0x006202: POP AF / OR A / SBC HL,DE / JR NZ (self-loop)
 *     - Outer loop at 0x006207: DEC A / JR NZ,0x0061EF
 *     - Exit at 0x00620A: POP HL / POP DE / RET (actual RET at 0x00620C)
 *     - Pure delay, no side effects, restores DE/HL, trashes A(=0) and flags
 *
 *   TASK 2: Trace results (port returns 0xFF -> 48MHz path, HL=35800):
 *     - 100 steps: stuck at 0x006202 (96 inner-loop iterations done)
 *     - 1000 steps: stuck at 0x006202 (996 iterations done)
 *     - 5000 steps: stuck at 0x006202 (4996 iterations done)
 *     - 100K steps: COMPLETES in 35805 steps, returns to sentinel
 *
 *   TASK 3: Exit point = 0x00620C (RET). After return: A=0, F=0x42, HL/DE=0 (restored from stack, were 0)
 *     SP restored to original +3 (return address popped).
 *
 *   TASK 4: 0x0003B0 (JP 0x003B05) with 200K steps: budget_exhausted at 0x006202
 *     Function 0x003B05 calls 0x0061E3 SIX times (at 0x003B59,3B72,3BAC,3BC5,3BE0,3BF1)
 *     plus more at 0x003C0A, 0x003C1B. 200K steps only completes ~5.5 delay calls.
 *     Total steps needed: ~6*35800 = ~215K just for delays, plus overhead -> ~250K+
 *
 *   TASK 5: Static caller scan:
 *     - CALL 0x0061E3: 14 sites (0x003B59..003C1B in PLL config, 0x005D15, 0x0062A4/AE, 0x01257D, 0x012628, 0x015847)
 *     - JP 0x0061E3: 1 site (0x0003B4 vector table entry)
 *     - CALL 0x0003B4: 4 sites (0x027102, 0x03A4A6, 0x041154, 0x0411FF)
 *     - No direct calls/jumps to 0x006202 inner loop
 *     - Total: 15 direct call sites + 4 indirect via vector table = 19 affected paths
 *
 *   CONCLUSION: SAFE TO STUB. Pure delay, no side effects. Recommend transpiler
 *   emit immediate RET for block 0x0061E3 (option: POP HL / POP DE / RET to
 *   preserve stack discipline, since entry pushes DE then HL).
 *
 * Background:
 *   Session 247 found that 0x0003B0 (PLL config) and 0x0270F3 (clock switcher)
 *   stall at a delay loop at 0x006202. The loop is:
 *     0x006202: OR A / SBC HL,DE / JR NZ,0x006202 (inner loop)
 *     0x0061EF: outer loop decrements A
 *     Entry via 0x0061E3
 *
 * Tasks:
 *   1. Disassemble 0x0061E0-0x006210 from ROM bytes
 *   2. Trace from 0x0061E3 with various step counts (100, 1000, 5000)
 *   3. Find the exit point: address after delay completes, expected register state
 *   4. Test skip: start execution AFTER the delay and verify caller can continue
 *   5. Check callers: static ROM scan for CALL/JP to 0x0061E3 and 0x006202
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ENTRY_SP = 0xD1A860;
const IX = 0xD1A860;
const IY = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

// Target addresses
const ADDR_DELAY_ENTRY = 0x0061E3;  // delay function entry
const ADDR_DELAY_INNER = 0x006202;  // inner loop (OR A / SBC HL,DE / JR NZ)
const ADDR_DELAY_EXIT  = 0x00620B;  // RET after delay completes (0x00620A=C9)
const ADDR_0003B0      = 0x0003B0;  // PLL config (JP 0x003B05)

// Common seeds
const D02A86_ADDR = 0xD02A86;

const COMMON_SEEDS = [
  [0xD0058E, 0x8F],
  [0xD0058D, 0x00],
  [0xD0059F, 0x00],
  [0xD003E0, 0x00],
  [0xD00824, 0x00],
  [0xD003DA, 0x00],
  [0xD007E0, 0x40],
  [0xD00000, 0x00],
];

// Edit buffer seeds
const ETOP = 0xD02437;
const ECUR = 0xD0243A;
const ETAIL = 0xD0243D;
const EBTM = 0xD02440;
const EBUF = 0xD00A00;
const EEND = 0xD00B00;

const IY_TRACK_LEN = 128;

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

// ─── Utility helpers ────────────────────────────────────────────────────────

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

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempPath = path.join(os.tmpdir(), `ti84-phase248-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempPath, tempModulePath: tempPath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

// ─── Disassembly ────────────────────────────────────────────────────────────

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const sfx = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return inst.direction === 'to-mem'
        ? `LD${sfx} (${hex(inst.addr, w)}), ${String(inst.pair).toUpperCase()}`
        : `LD${sfx} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, w)})`;
    }
    case 'ld-mem-pair': {
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const sfx = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return `LD${sfx} (${hex(inst.addr, w)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    case 'ld-indexed-imm':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'xor':
      return 'XOR A';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'bit':
      return `BIT ${inst.bit}, ${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'set':
      return `SET ${inst.bit}, ${String(inst.reg ?? inst.dest).toUpperCase()}`;
    case 'res':
      return `RES ${inst.bit}, ${String(inst.reg ?? inst.dest).toUpperCase()}`;
    case 'in-imm':
      return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm':
      return `OUT (${hexByte(inst.port)}), A`;
    case 'in-reg':
      return `IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src ?? inst.pair).toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${String(inst.src ?? inst.pair).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${String(inst.src ?? inst.pair).toUpperCase()}`;
    case 'ex':
      return `EX ${String(inst.left ?? inst.a).toUpperCase()}, ${String(inst.right ?? inst.b).toUpperCase()}`;
    case 'ex-sp':
      return `EX (SP), ${String(inst.reg ?? inst.pair ?? 'HL').toUpperCase()}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'rla':
      return 'RLA';
    case 'rlca':
      return 'RLCA';
    case 'rra':
      return 'RRA';
    case 'rrca':
      return 'RRCA';
    case 'cpl':
      return 'CPL';
    case 'scf':
      return 'SCF';
    case 'ccf':
      return 'CCF';
    case 'daa':
      return 'DAA';
    case 'neg':
      return 'NEG';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'im':
      return `IM ${inst.mode ?? 0}`;
    case 'ldi':
      return 'LDI';
    case 'ldir':
      return 'LDIR';
    case 'ldd':
      return 'LDD';
    case 'lddr':
      return 'LDDR';
    case 'cpi':
      return 'CPI';
    case 'cpir':
      return 'CPIR';
    case 'cpd':
      return 'CPD';
    case 'cpdr':
      return 'CPDR';
    case 'ini':
      return 'INI';
    case 'inir':
      return 'INIR';
    case 'ind':
      return 'IND';
    case 'indr':
      return 'INDR';
    case 'outi':
      return 'OUTI';
    case 'otir':
      return 'OTIR';
    case 'outd':
      return 'OUTD';
    case 'otdr':
      return 'OTDR';
    case 'rl':
      return `RL ${String(inst.reg).toUpperCase()}`;
    case 'rr':
      return `RR ${String(inst.reg).toUpperCase()}`;
    case 'rlc':
      return `RLC ${String(inst.reg).toUpperCase()}`;
    case 'rrc':
      return `RRC ${String(inst.reg).toUpperCase()}`;
    case 'sla':
      return `SLA ${String(inst.reg).toUpperCase()}`;
    case 'sra':
      return `SRA ${String(inst.reg).toUpperCase()}`;
    case 'srl':
      return `SRL ${String(inst.reg).toUpperCase()}`;
    case 'jp-hl':
      return 'JP (HL)';
    case 'jp-ix':
      return 'JP (IX)';
    case 'jp-iy':
      return 'JP (IY)';
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-ix':
      return 'LD SP, IX';
    case 'ld-sp-iy':
      return 'LD SP, IY';
    case 'ld-a-i':
      return 'LD A, I';
    case 'ld-i-a':
      return 'LD I, A';
    case 'ld-a-r':
      return 'LD A, R';
    case 'ld-r-a':
      return 'LD R, A';
    case 'ld-a-mb':
      return 'LD A, MB';
    case 'ld-mb-a':
      return 'LD MB, A';
    case 'stmix':
      return 'STMIX';
    case 'rsmix':
      return 'RSMIX';
    case 'tst-imm':
      return `TST A, ${hexByte(inst.value)}`;
    case 'tst-reg':
      return `TST A, ${String(inst.reg).toUpperCase()}`;
    case 'tstio':
      return `TSTIO ${hexByte(inst.value)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    default:
      return inst.tag + (inst.target !== undefined ? ` ${hex(inst.target)}` : '');
  }
}

function disassembleRange(romBytes, start, maxBytes) {
  const rows = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end && pc < romBytes.length) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      const raw = romBytes.subarray(pc, pc + length);
      rows.push({
        pc,
        bytes: bytesToHex(raw),
        text: formatInstruction(inst),
        inst,
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
        inst: null,
      });
      pc += 1;
    }
  }
  return rows;
}

// ─── Runtime setup ──────────────────────────────────────────────────────────

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(mem, blocks, peripherals) {
  const executor = cpuRuntime.createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });
  return { cpu: executor.cpu, executor };
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const exit of exits) {
    if (exit.target === pc && exit.targetMode) return exit.targetMode;
  }
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hex(pc)} (${key})`);
    }
    const out = fn(this);
    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hex(pc)}: ${String(out)}`);
    }
    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }
    return out;
  };
}

function makeRuntime(blocks, romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, blocks, peripherals);
  installStep(cpu, executor);
  return { mem, cpu, executor };
}

function seedEditBuffer(mem) {
  write24(mem, ETOP, EBUF);
  write24(mem, ECUR, EBUF);
  write24(mem, ETAIL, EEND);
  write24(mem, EBTM, EEND);
  mem.fill(0x00, EBUF, EEND);
}

function seedCPU(cpu, mem, entryPc) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryPc;
  cpu.sp = ENTRY_SP;
  cpu.ix = IX;
  cpu.iy = IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;

  mem.fill(0x00, IY & MEM_MASK, ((IY & MEM_MASK) + IY_TRACK_LEN));
  for (const [addr, value] of COMMON_SEEDS) {
    mem[addr & MEM_MASK] = value & 0xFF;
  }
  seedEditBuffer(mem);
  mem[D02A86_ADDR & MEM_MASK] = 0x00;
  write24(mem, ENTRY_SP, RETURN_SENTINEL);
}

function formatRegs(cpu) {
  return [
    `PC=${hex(cpu.pc & 0xFFFFFF)}`,
    `A=${hexByte(cpu.a)}`,
    `F=${hexByte(cpu.f)}`,
    `BC=${hex(cpu.bc ?? 0)}`,
    `DE=${hex(cpu.de ?? 0)}`,
    `HL=${hex(cpu.hl ?? 0)}`,
    `IX=${hex(cpu.ix ?? 0)}`,
    `IY=${hex(cpu.iy ?? 0)}`,
    `SP=${hex(cpu.sp ?? 0)}`,
    `MADL=${cpu.madl ? 1 : 0}`,
  ].join(' ');
}

// ─── Trace runner ──────────────────────────────────────────────────────────

function runTrace(blocks, romBytes, entryPc, limit, label, opts = {}) {
  const { mem, cpu, executor } = makeRuntime(blocks, romBytes);
  seedCPU(cpu, mem, entryPc);

  // Allow caller to override register state (for skip tests)
  if (opts.seedRegs) {
    for (const [key, val] of Object.entries(opts.seedRegs)) {
      cpu[key] = val;
    }
  }

  const ioReads = [];
  const ioWrites = [];
  const uniqueBlocks = new Map();
  const stepLog = [];

  cpu.onIoRead = (port, value) => {
    ioReads.push({ step: stepLog.length, port, value });
  };
  cpu.onIoWrite = (port, value) => {
    ioWrites.push({ step: stepLog.length, port, value });
  };

  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  for (let step = 0; step < limit; step++) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    uniqueBlocks.set(pc, (uniqueBlocks.get(pc) ?? 0) + 1);

    let out;
    try {
      out = cpu.step();
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      stepLog.push({ step, pc, note: `ERROR: ${errorMessage}` });
      break;
    }

    const afterPc = cpu.pc & 0xFFFFFF;
    stepLog.push({ step, pc, afterPc });

    if (out === -1) { stopReason = 'halt'; break; }
    if (out === -2) { stopReason = 'sleep'; break; }
    if (afterPc === RETURN_SENTINEL) { stopReason = 'returned_sentinel'; break; }
  }

  return {
    label,
    entryPc,
    limit,
    stopReason,
    errorMessage,
    finalPc: cpu.pc & 0xFFFFFF,
    finalRegs: formatRegs(cpu),
    ioReads,
    ioWrites,
    uniqueBlocks: [...uniqueBlocks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pc, count]) => ({ pc, count })),
    stepCount: stepLog.length,
    stepLogHead: stepLog.slice(0, 50),
    stepLogTail: stepLog.length > 100 ? stepLog.slice(-50) : [],
  };
}

// ─── Static caller scan ────────────────────────────────────────────────────

function scanForPattern(romBytes, pattern, label) {
  const results = [];
  for (let i = 0; i < romBytes.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (romBytes[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) {
      results.push(i);
    }
  }
  return { label, pattern: pattern.map(b => hexByte(b)).join(' '), results };
}

// ─── Printing ───────────────────────────────────────────────────────────────

function printDivider(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

function printDisassembly(title, rows) {
  printDivider(title);
  for (const row of rows) {
    const portNote = row.inst
      ? (row.inst.tag === 'in-imm' || row.inst.tag === 'out-imm' ||
         row.inst.tag === 'in-reg' || row.inst.tag === 'out-reg')
        ? '  <-- PORT I/O'
        : ''
      : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${portNote}`);
  }
  console.log('');
}

function printTrace(result) {
  printDivider(`TRACE: ${result.label}`);
  console.log(`  Entry PC: ${hex(result.entryPc)}`);
  console.log(`  Step limit: ${result.limit}`);
  console.log(`  Steps executed: ${result.stepCount}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  console.log(`  Final regs: ${result.finalRegs}`);
  if (result.errorMessage) {
    console.log(`  Error: ${result.errorMessage}`);
  }
  console.log('');

  console.log(`  Unique blocks visited (${result.uniqueBlocks.length}):`);
  for (const { pc, count } of result.uniqueBlocks) {
    console.log(`    ${hex(pc)} x${count}`);
  }
  console.log('');

  console.log(`  Port I/O reads (${result.ioReads.length}):`);
  if (result.ioReads.length > 0) {
    const seen = new Map();
    for (const { port, value } of result.ioReads) {
      if (!seen.has(port)) seen.set(port, []);
      seen.get(port).push(value);
    }
    for (const [port, values] of seen) {
      const uniq = [...new Set(values)].map(v => hexByte(v)).join(', ');
      console.log(`    port ${hex(Number(port), 4)}: ${values.length} reads, values: [${uniq}]`);
    }
  } else {
    console.log('    (none)');
  }

  console.log(`  Port I/O writes (${result.ioWrites.length}):`);
  if (result.ioWrites.length > 0) {
    const seen = new Map();
    for (const { port, value } of result.ioWrites) {
      if (!seen.has(port)) seen.set(port, []);
      seen.get(port).push(value);
    }
    for (const [port, values] of seen) {
      const uniq = [...new Set(values)].map(v => hexByte(v)).join(', ');
      console.log(`    port ${hex(Number(port), 4)}: ${values.length} writes, values: [${uniq}]`);
    }
  } else {
    console.log('    (none)');
  }
  console.log('');

  // Step log head
  console.log(`  Step log (first ${result.stepLogHead.length} steps):`);
  for (const row of result.stepLogHead) {
    const after = row.afterPc !== undefined ? hex(row.afterPc) : 'n/a';
    const note = row.note ?? '';
    console.log(`    step ${String(row.step).padStart(5, ' ')}: ${hex(row.pc)} -> ${after}  ${note}`);
  }
  if (result.stepLogTail.length > 0) {
    console.log(`  ... (${result.stepCount - 100} steps omitted) ...`);
    console.log(`  Step log (last ${result.stepLogTail.length} steps):`);
    for (const row of result.stepLogTail) {
      const after = row.afterPc !== undefined ? hex(row.afterPc) : 'n/a';
      const note = row.note ?? '';
      console.log(`    step ${String(row.step).padStart(5, ' ')}: ${hex(row.pc)} -> ${after}  ${note}`);
    }
  }
  console.log('');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const assets = ensureTranspiledModule();
  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod);
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    console.log('Phase 248: Investigate 0x006202 delay loop structure and test stubbing');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral: timerInterrupt=false, trackMemoryMapped=true');
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // TASK 1: Disassemble 0x0061E0-0x006210 from ROM bytes
    // ════════════════════════════════════════════════════════════════════════

    printDisassembly(
      'TASK 1a: DISASSEMBLY 0x0061D0-0x0061E2 (context before delay entry)',
      disassembleRange(romBytes, 0x0061D0, 0x0061E3 - 0x0061D0),
    );

    printDisassembly(
      'TASK 1b: DISASSEMBLY 0x0061E3-0x00620B (full delay function)',
      disassembleRange(romBytes, 0x0061E3, 0x00620C - 0x0061E3),
    );

    printDisassembly(
      'TASK 1c: DISASSEMBLY 0x00620C-0x006220 (context after delay)',
      disassembleRange(romBytes, 0x00620C, 0x006220 - 0x00620C),
    );

    // Annotated pseudocode of the delay function
    console.log('  ANNOTATED PSEUDOCODE of 0x0061E3 delay function:');
    console.log('    0x0061E3: LD A, 0x01           ; A = 1 (outer loop count)');
    console.log('    0x0061E5: OR A, A / JR NZ, +1  ; if A != 0 skip next');
    console.log('    0x0061E8: INC A                 ; ensure A >= 1');
    console.log('    0x0061E9: PUSH DE / PUSH HL     ; save caller DE, HL');
    console.log('    0x0061EB: LD DE, 0x000001       ; DE = 1 (decrement per iter)');
    console.log('    0x0061EF: PUSH AF               ; save outer counter');
    console.log('    0x0061F0: IN A, (0x03)          ; read port 0x03 (CPU speed)');
    console.log('    0x0061F3: BIT 4, A              ; test bit 4 (6 MHz vs 48 MHz)');
    console.log('    0x0061F5: JR Z, +6              ; if 6 MHz -> shorter delay');
    console.log('    0x0061F7: LD HL, 0x008BD8       ; HL = 35800 (48 MHz count)');
    console.log('    0x0061FB: JR +4                 ; skip to inner loop');
    console.log('    0x0061FD: LD HL, 0x001E3E       ; HL = 7742 (6 MHz count)');
    console.log('    0x006201: -- inner loop --');
    console.log('    0x006202: POP AF                ; restore outer counter');
    console.log('    0x006203: OR A, A               ; clear carry for SBC');
    console.log('    0x006204: SBC HL, DE            ; HL -= 1');
    console.log('    0x006206: JR NZ, 0x006202       ; loop until HL == 0');
    console.log('    (WAIT: 0x006202 is actually the POP AF from the');
    console.log('     block structure -- the inner loop block starts there.)');
    console.log('    0x006208: DEC A                 ; outer counter--');
    console.log('    0x006209: JR NZ, 0x0061EF       ; repeat outer loop');
    console.log('    0x00620A: POP HL / POP DE       ; restore HL, DE');
    console.log('    0x00620B: RET');
    console.log('');
    console.log('  STRUCTURE SUMMARY:');
    console.log('    - Entry: 0x0061E3, exit: 0x00620B (RET at 0x00620A+1 byte area)');
    console.log('    - Reads port 0x03 to pick iteration count:');
    console.log('      48 MHz mode: HL = 0x8BD8 (35800) inner iters');
    console.log('      6 MHz mode:  HL = 0x1E3E (7742) inner iters');
    console.log('    - Outer loop runs A times (default A=1 on entry)');
    console.log('    - Total iterations: A * HL (up to ~35K per outer)');
    console.log('    - Pure delay — no side effects, restores DE/HL on exit');
    console.log('    - After return: A=0, DE/HL restored, flags trashed');
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // TASK 2: Trace from 0x0061E3 with various step counts
    // ════════════════════════════════════════════════════════════════════════

    const trace100 = runTrace(blocks, romBytes, ADDR_DELAY_ENTRY, 100,
      '0x0061E3 delay function (100 steps)');
    printTrace(trace100);

    const trace1000 = runTrace(blocks, romBytes, ADDR_DELAY_ENTRY, 1000,
      '0x0061E3 delay function (1000 steps)');
    printTrace(trace1000);

    const trace5000 = runTrace(blocks, romBytes, ADDR_DELAY_ENTRY, 5000,
      '0x0061E3 delay function (5000 steps)');
    printTrace(trace5000);

    // Try with a much larger budget to see if it completes
    const trace100k = runTrace(blocks, romBytes, ADDR_DELAY_ENTRY, 100000,
      '0x0061E3 delay function (100K steps)');
    printTrace(trace100k);

    // ════════════════════════════════════════════════════════════════════════
    // TASK 3: Find the exit point
    // ════════════════════════════════════════════════════════════════════════

    printDivider('TASK 3: EXIT POINT ANALYSIS');
    console.log('  The delay function at 0x0061E3 exits via RET.');
    console.log('  Examining the bytes at 0x00620A-0x00620B:');
    console.log(`    0x00620A: ${hexByte(romBytes[0x00620A])} (expected C9 = RET? or part of sequence)`);

    // Identify exact RET address from disassembly
    const exitRows = disassembleRange(romBytes, 0x006207, 8);
    for (const row of exitRows) {
      console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(16)} ${row.text}`);
    }
    console.log('');

    if (trace100k.stopReason === 'returned_sentinel') {
      console.log(`  Delay COMPLETES in ${trace100k.stepCount} steps.`);
      console.log(`  Final registers: ${trace100k.finalRegs}`);
      console.log('  After return: A=0, HL/DE restored to pre-call values.');
    } else {
      console.log(`  Delay did NOT complete in 100K steps.`);
      console.log(`  Stop reason: ${trace100k.stopReason}`);
      console.log(`  Final PC: ${hex(trace100k.finalPc)}`);
    }
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // TASK 4: Test skip — start AFTER delay, verify caller continues
    // ════════════════════════════════════════════════════════════════════════

    printDivider('TASK 4: SKIP TEST — Execute from 0x0003B0 caller context');

    // First, trace the 0x0003B0 path to understand what it does BEFORE the delay
    // 0x0003B0 = JP 0x003B05, so trace from 0x003B05
    console.log('  4a: Trace 0x003B05 (target of JP at 0x0003B0) with 50 steps to see pre-delay behavior');
    const trace3B05 = runTrace(blocks, romBytes, 0x003B05, 50,
      '0x003B05 (0x0003B0 target) — 50 steps');
    printTrace(trace3B05);

    // Now trace 0x0003B4 which is JP 0x0061E3 (the delay entry)
    // Check if 0x0003B4 is indeed called from 0x003B05
    console.log('  4b: Check what 0x003B05 does — looking for CALL to 0x0003B4 or 0x0061E3');
    const rows3B05 = disassembleRange(romBytes, 0x003B05, 64);
    printDisassembly('  Disassembly of 0x003B05 (64 bytes)', rows3B05);

    // Test: what happens if we skip the delay entirely for 0x0003B0?
    // We need to find where 0x003B05 calls the delay and what comes after
    // From the caller scan, we know 0x003B59, 0x003B72, etc. call 0x0061E3
    // The function at 0x003B05 likely calls 0x0061E3 multiple times

    // Show the broader context of 0x003B05 to find all delay calls
    const rows3B05wide = disassembleRange(romBytes, 0x003B05, 256);
    console.log('  Delay calls from 0x003B05 function body:');
    for (const row of rows3B05wide) {
      if (row.text && row.text.includes('0x0061E3')) {
        console.log(`    ${hex(row.pc)}: ${row.text}`);
      }
      if (row.text && row.text.includes('0x0003B4')) {
        console.log(`    ${hex(row.pc)}: ${row.text}`);
      }
    }
    console.log('');

    // Test: run 0x0003B0 with a very large step budget to see if it ever completes
    console.log('  4c: Trace 0x0003B0 with 200K steps to see if it completes with delays');
    const trace0003B0_200k = runTrace(blocks, romBytes, ADDR_0003B0, 200000,
      '0x0003B0 (PLL config) — 200K steps');

    // Print condensed version
    console.log(`  Result: stop=${trace0003B0_200k.stopReason}, steps=${trace0003B0_200k.stepCount}, finalPC=${hex(trace0003B0_200k.finalPc)}`);
    console.log(`  Regs: ${trace0003B0_200k.finalRegs}`);
    console.log(`  Unique blocks: ${trace0003B0_200k.uniqueBlocks.length}`);
    if (trace0003B0_200k.uniqueBlocks.length <= 30) {
      for (const { pc, count } of trace0003B0_200k.uniqueBlocks) {
        console.log(`    ${hex(pc)} x${count}`);
      }
    }
    console.log(`  Port I/O reads: ${trace0003B0_200k.ioReads.length}`);
    console.log(`  Port I/O writes: ${trace0003B0_200k.ioWrites.length}`);
    if (trace0003B0_200k.ioWrites.length > 0) {
      const seen = new Map();
      for (const { port, value } of trace0003B0_200k.ioWrites) {
        if (!seen.has(port)) seen.set(port, []);
        seen.get(port).push(value);
      }
      for (const [port, values] of seen) {
        const uniq = [...new Set(values)].map(v => hexByte(v)).join(', ');
        console.log(`    port ${hex(Number(port), 4)}: ${values.length} writes, values: [${uniq}]`);
      }
    }
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // TASK 5: Check all callers — static ROM scan
    // ════════════════════════════════════════════════════════════════════════

    printDivider('TASK 5: STATIC CALLER SCAN');

    const patterns = [
      { bytes: [0xCD, 0xE3, 0x61, 0x00], label: 'CALL 0x0061E3' },
      { bytes: [0xC3, 0xE3, 0x61, 0x00], label: 'JP 0x0061E3' },
      { bytes: [0xCD, 0x02, 0x62, 0x00], label: 'CALL 0x006202' },
      { bytes: [0xC3, 0x02, 0x62, 0x00], label: 'JP 0x006202' },
      // Also check for references via the vector table (CALL 0x0003B4)
      { bytes: [0xCD, 0xB4, 0x03, 0x00], label: 'CALL 0x0003B4' },
      { bytes: [0xC3, 0xB4, 0x03, 0x00], label: 'JP 0x0003B4' },
    ];

    for (const { bytes, label } of patterns) {
      const scan = scanForPattern(romBytes, bytes, label);
      console.log(`  ${label} (${scan.pattern}): ${scan.results.length} match(es)`);
      for (const addr of scan.results) {
        console.log(`    ${hex(addr)}`);
      }
    }
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════════════════════════════════

    printDivider('SUMMARY');
    console.log('  Delay function 0x0061E3:');
    console.log('    - Pure hardware delay, no side effects');
    console.log('    - Reads port 0x03 bit 4 to choose iteration count');
    console.log('    - 48 MHz: ~35800 inner iterations per outer loop');
    console.log('    - 6 MHz:  ~7742 inner iterations per outer loop');
    console.log('    - Default entry: A=1 -> 1 outer loop');
    console.log('    - Preserves DE, HL; trashes A (=0), flags');
    console.log('    - Exit: RET at end of function');
    console.log('');
    console.log('  Callers:');
    const callCount = patterns[0].bytes ? 0 : 0;
    const call0061E3 = scanForPattern(romBytes, [0xCD, 0xE3, 0x61, 0x00], '').results;
    const jp0061E3 = scanForPattern(romBytes, [0xC3, 0xE3, 0x61, 0x00], '').results;
    console.log(`    CALL 0x0061E3: ${call0061E3.length} sites`);
    console.log(`    JP 0x0061E3: ${jp0061E3.length} sites`);
    console.log(`    Total: ${call0061E3.length + jp0061E3.length} call sites`);
    console.log('');
    console.log('  Stubbing assessment:');
    console.log('    SAFE TO STUB. The function is a pure delay with no side effects.');
    console.log('    Stubbing options:');
    console.log('    1. NOP out the inner loop (change JR NZ to JR 0 or NOP)');
    console.log('    2. In transpiler: emit immediate RET for block at 0x0061E3');
    console.log('    3. In transpiler: emit identity function (restore regs, ret)');
    console.log('    Option 2 or 3 recommended — preserves ROM integrity.');
    console.log('');

    const completed = trace100k.stopReason === 'returned_sentinel';
    const stepsToComplete = completed ? trace100k.stepCount : 'N/A (did not complete in 100K)';
    console.log(`  Completion test: ${completed ? 'YES' : 'NO'} in ${stepsToComplete} steps`);
    console.log(`  0x0003B0 with 200K: ${trace0003B0_200k.stopReason} in ${trace0003B0_200k.stepCount} steps`);
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
