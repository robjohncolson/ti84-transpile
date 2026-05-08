#!/usr/bin/env node

/**
 * Phase 247 — Deep trace of function 0x0003B0
 *
 * From session 246:
 *   0x027111 calls 0x0003B0 after clearing D02A86
 *   Execution gets stuck at 0x006202 — a tight delay loop
 *   Sibling function 0x0270F3 is a CPU clock speed switcher (port I/O)
 *
 * Tasks:
 *   1. Disassemble ROM bytes around 0x0003B0 (±32 bytes)
 *   2. Execute from 0x0003B0 with 200 steps, log each block PC
 *   3. Check if 0x006202 is visited (stall point)
 *   4. Execute from 0x0003B0 with 5000 steps to see if it completes
 *   5. Report: function purpose, port accesses, whether it returns
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
const ADDR_0003B0 = 0x0003B0;
const ADDR_006202 = 0x006202;

// Trace limits
const TRACE_LIMIT_SHORT = 200;
const TRACE_LIMIT_LONG = 5000;

// Common seeds from previous sessions
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
  const tempPath = path.join(os.tmpdir(), `ti84-phase247-${process.pid}.mjs`);
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

/**
 * Disassemble from `start` for `maxBytes`.
 * Returns array of { pc, bytes, text, inst } rows.
 */
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

/**
 * Disassemble from `start` until RET or maxBytes is reached.
 */
function disassembleUntilRet(romBytes, start, maxBytes = 128) {
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

      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
      if (inst.tag === 'jp') break;
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

// ─── Dynamic trace with full step logging ─────────────────────────────────

function runTrace(blocks, romBytes, entryPc, limit, label) {
  const { mem, cpu, executor } = makeRuntime(blocks, romBytes);
  seedCPU(cpu, mem, entryPc);

  const ioReads = [];
  const ioWrites = [];
  const mmioWrites = [];
  const callTargets = new Set();
  const uniqueBlocks = new Map();
  const stepLog = [];
  let visited006202 = false;

  // Hook I/O
  cpu.onIoRead = (port, value) => {
    ioReads.push({ step: stepLog.length, port, value });
  };
  cpu.onIoWrite = (port, value) => {
    ioWrites.push({ step: stepLog.length, port, value });
  };
  cpu.onMmioWrite = (addr, value) => {
    mmioWrites.push({ step: stepLog.length, addr, value });
  };

  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  for (let step = 0; step < limit; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    const mode = cpu.madl ? 'adl' : 'z80';
    const key = blockKey(pc, mode);
    const meta = executor.blockMeta?.[key] ?? null;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    if (pc === ADDR_006202) {
      visited006202 = true;
    }

    uniqueBlocks.set(pc, (uniqueBlocks.get(pc) ?? 0) + 1);

    // Detect CALL targets from block metadata
    const lastInst = meta?.instructions?.[meta.instructions.length - 1];
    if (lastInst && (lastInst.tag === 'call' || lastInst.tag === 'call-conditional')) {
      callTargets.add(lastInst.target);
    }

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
    mmioWrites,
    callTargets: [...callTargets].sort((a, b) => a - b),
    uniqueBlocks: [...uniqueBlocks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pc, count]) => ({ pc, count })),
    stepCount: stepLog.length,
    visited006202,
    // Log first/last 50 steps
    stepLogHead: stepLog.slice(0, 50),
    stepLogTail: stepLog.length > 100 ? stepLog.slice(-50) : [],
  };
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
  printDivider(`DYNAMIC TRACE: ${result.label}`);
  console.log(`  Entry PC: ${hex(result.entryPc)}`);
  console.log(`  Step limit: ${result.limit}`);
  console.log(`  Steps executed: ${result.stepCount}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  console.log(`  Final regs: ${result.finalRegs}`);
  if (result.errorMessage) {
    console.log(`  Error: ${result.errorMessage}`);
  }
  console.log(`  Visited 0x006202 (stall point): ${result.visited006202}`);
  console.log('');

  // Unique blocks
  console.log(`  Unique blocks visited (${result.uniqueBlocks.length}):`);
  for (const { pc, count } of result.uniqueBlocks) {
    console.log(`    ${hex(pc)} x${count}`);
  }
  console.log('');

  // CALL targets
  console.log(`  CALL targets (${result.callTargets.length}):`);
  for (const target of result.callTargets) {
    console.log(`    ${hex(target)}`);
  }
  console.log('');

  // Port I/O reads
  console.log(`  Port I/O reads (${result.ioReads.length}):`);
  if (result.ioReads.length === 0) {
    console.log('    (none)');
  } else {
    const seen = new Map();
    for (const { port, value } of result.ioReads) {
      const key = `${port}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(value);
    }
    for (const [port, values] of seen) {
      const uniqueValues = [...new Set(values)].map((v) => hexByte(v)).join(', ');
      console.log(`    port ${hex(Number(port), 4)}: ${values.length} reads, values: [${uniqueValues}]`);
    }
  }
  console.log('');

  // Port I/O writes
  console.log(`  Port I/O writes (${result.ioWrites.length}):`);
  if (result.ioWrites.length === 0) {
    console.log('    (none)');
  } else {
    const seen = new Map();
    for (const { port, value } of result.ioWrites) {
      const key = `${port}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(value);
    }
    for (const [port, values] of seen) {
      const uniqueValues = [...new Set(values)].map((v) => hexByte(v)).join(', ');
      console.log(`    port ${hex(Number(port), 4)}: ${values.length} writes, values: [${uniqueValues}]`);
    }
  }
  console.log('');

  // Memory-mapped writes
  console.log(`  Memory-mapped writes 0xE00000+ (${result.mmioWrites.length}):`);
  if (result.mmioWrites.length === 0) {
    console.log('    (none)');
  } else {
    const seen = new Map();
    for (const { addr, value } of result.mmioWrites) {
      const key = `${addr}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(value);
    }
    for (const [addr, values] of seen) {
      const uniqueValues = [...new Set(values)].map((v) => hexByte(v)).join(', ');
      console.log(`    ${hex(Number(addr))}: ${values.length} writes, values: [${uniqueValues}]`);
    }
  }
  console.log('');

  // Step log head
  console.log(`  Step log (first ${result.stepLogHead.length} steps):`);
  for (const row of result.stepLogHead) {
    const after = row.afterPc !== undefined ? hex(row.afterPc) : 'n/a';
    const note = row.note ?? '';
    console.log(`    step ${String(row.step).padStart(4, ' ')}: ${hex(row.pc)} -> ${after}  ${note}`);
  }
  if (result.stepLogTail.length > 0) {
    console.log(`  ... (${result.stepCount - 100} steps omitted) ...`);
    console.log(`  Step log (last ${result.stepLogTail.length} steps):`);
    for (const row of result.stepLogTail) {
      const after = row.afterPc !== undefined ? hex(row.afterPc) : 'n/a';
      const note = row.note ?? '';
      console.log(`    step ${String(row.step).padStart(4, ' ')}: ${hex(row.pc)} -> ${after}  ${note}`);
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

    console.log('Phase 247: Deep trace of function 0x0003B0');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral: timerInterrupt=false, trackMemoryMapped=true');
    console.log('');

    // ── Task 1: Disassemble ROM bytes around 0x0003B0 (±32 bytes) ──
    const contextStart = Math.max(0, ADDR_0003B0 - 32);
    const rowsBefore = disassembleRange(romBytes, contextStart, 32);
    printDisassembly('TASK 1a: CONTEXT BEFORE 0x0003B0 (32 bytes before)', rowsBefore);

    const rowsFrom = disassembleUntilRet(romBytes, ADDR_0003B0, 128);
    printDisassembly('TASK 1b: DISASSEMBLY FROM 0x0003B0 (until RET or 128 bytes)', rowsFrom);

    const lastRow = rowsFrom[rowsFrom.length - 1];
    const afterEnd = lastRow ? lastRow.pc + (lastRow.inst?.length ?? 1) : ADDR_0003B0 + 32;
    const rowsAfter = disassembleRange(romBytes, afterEnd, 32);
    printDisassembly('TASK 1c: CONTEXT AFTER 0x0003B0 function (32 bytes after)', rowsAfter);

    // ── Task 1d: Disassemble 0x006202 (stall point) ──
    const rows006202 = disassembleUntilRet(romBytes, ADDR_006202, 128);
    printDisassembly('TASK 1d: DISASSEMBLY 0x006202 (stall point)', rows006202);

    // ── Task 2: Execute from 0x0003B0, 200 steps ──
    const trace200 = runTrace(blocks, romBytes, ADDR_0003B0, TRACE_LIMIT_SHORT,
      '0x0003B0 function (200 steps)');
    printTrace(trace200);

    // ── Task 3: Execute from 0x0003B0, 5000 steps ──
    const trace5000 = runTrace(blocks, romBytes, ADDR_0003B0, TRACE_LIMIT_LONG,
      '0x0003B0 function (5000 steps)');
    printTrace(trace5000);

    // ── Summary ──
    printDivider('SUMMARY');
    console.log('  0x0003B0 with 200 steps:');
    console.log(`    Stop reason: ${trace200.stopReason}`);
    console.log(`    Final PC: ${hex(trace200.finalPc)}`);
    console.log(`    Steps executed: ${trace200.stepCount}`);
    console.log(`    Visited 0x006202: ${trace200.visited006202}`);
    console.log(`    Port I/O reads: ${trace200.ioReads.length}`);
    console.log(`    Port I/O writes: ${trace200.ioWrites.length}`);
    console.log(`    MMIO writes: ${trace200.mmioWrites.length}`);
    console.log(`    Unique blocks: ${trace200.uniqueBlocks.length}`);
    console.log(`    Returns: ${trace200.stopReason === 'returned_sentinel'}`);
    console.log('');
    console.log('  0x0003B0 with 5000 steps:');
    console.log(`    Stop reason: ${trace5000.stopReason}`);
    console.log(`    Final PC: ${hex(trace5000.finalPc)}`);
    console.log(`    Steps executed: ${trace5000.stepCount}`);
    console.log(`    Visited 0x006202: ${trace5000.visited006202}`);
    console.log(`    Port I/O reads: ${trace5000.ioReads.length}`);
    console.log(`    Port I/O writes: ${trace5000.ioWrites.length}`);
    console.log(`    MMIO writes: ${trace5000.mmioWrites.length}`);
    console.log(`    Unique blocks: ${trace5000.uniqueBlocks.length}`);
    console.log(`    Returns: ${trace5000.stopReason === 'returned_sentinel'}`);
    console.log('');

    // Hot-block analysis (blocks visited >10 times in 5000-step trace)
    const hotBlocks = trace5000.uniqueBlocks.filter((b) => b.count > 10);
    if (hotBlocks.length > 0) {
      console.log('  Hot blocks (>10 visits in 5000-step trace):');
      for (const { pc, count } of hotBlocks) {
        console.log(`    ${hex(pc)} x${count}`);
      }
      console.log('');
    }

    // Function purpose assessment
    console.log('  ANALYSIS:');
    const hasPortIO = trace5000.ioReads.length > 0 || trace5000.ioWrites.length > 0;
    const hasMMIO = trace5000.mmioWrites.length > 0;
    const returns = trace5000.stopReason === 'returned_sentinel';
    const stalls = trace5000.visited006202;
    console.log(`    Has port I/O: ${hasPortIO}`);
    console.log(`    Has MMIO writes: ${hasMMIO}`);
    console.log(`    Returns within 5000 steps: ${returns}`);
    console.log(`    Hits 0x006202 delay loop: ${stalls}`);
    if (stalls && !returns) {
      console.log('    -> Function appears to stall in a delay loop at 0x006202');
      console.log('       This is likely a hardware wait/delay (e.g., LCD timing, clock settle)');
    }
    if (returns) {
      console.log('    -> Function completes and returns normally');
    }
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
