#!/usr/bin/env node

/**
 * Phase 287: Trace all E00900 reader clusters
 *
 * Part 1: Static scan of ROM for all instructions referencing 0xE00900
 * Part 2: Dynamic trace of 0x040Fxx cluster
 * Part 3: Dynamic trace of 0x0465xx cluster
 * Part 4: Classification summary
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CPU } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const E00900 = 0xE00900;
const TRACE_LIMIT = 200;
const TRACE_SP = 0xD1A000;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_SCAN_CODE = 0x35;

// Known MMIO / RAM addresses of interest
const KBD_STATUS_ADDR = 0xE00818;
const KBD_READY_ADDR = 0xE00824;
const KBD_SCAN_RESULT_ADDR = E00900;
const KBD_SCANCODE_RAM = 0xD0058C;
const KBD_SCANCODE_RAM2 = 0xD0058E;

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'inc-ixd': return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'ld-ind-reg': return `LD (HL), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (HL)`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ei': return 'EI';
    case 'di': return 'DI';
    case 'nop': return 'NOP';
    default:
      if (inst.dasm) return inst.dasm;
      return inst.tag;
  }
}

// --- Part 1: Static scan ---

function staticScanE00900(romBytes) {
  // Search for byte pattern 00 09 E0 (little-endian 0xE00900) in context of load instructions
  const patterns = [
    { label: 'LD A,(0xE00900)',    bytes: [0x3A, 0x00, 0x09, 0xE0] },
    { label: 'LD HL,(0xE00900)',   bytes: [0xED, 0x6B, 0x00, 0x09, 0xE0] },
    { label: 'LD (0xE00900),A',    bytes: [0x32, 0x00, 0x09, 0xE0] },
    { label: 'LD BC,(0xE00900)',   bytes: [0xED, 0x4B, 0x00, 0x09, 0xE0] },
    { label: 'LD DE,(0xE00900)',   bytes: [0xED, 0x5B, 0x00, 0x09, 0xE0] },
    { label: 'LD SP,(0xE00900)',   bytes: [0xED, 0x7B, 0x00, 0x09, 0xE0] },
    { label: 'LD (0xE00900),HL',   bytes: [0xED, 0x63, 0x00, 0x09, 0xE0] },
    { label: 'LD (0xE00900),BC',   bytes: [0xED, 0x43, 0x00, 0x09, 0xE0] },
    { label: 'LD (0xE00900),DE',   bytes: [0xED, 0x53, 0x00, 0x09, 0xE0] },
    { label: 'LD (0xE00900),SP',   bytes: [0xED, 0x73, 0x00, 0x09, 0xE0] },
  ];

  const results = [];

  for (const pattern of patterns) {
    for (let pc = 0; pc <= romBytes.length - pattern.bytes.length; pc++) {
      let match = true;
      for (let i = 0; i < pattern.bytes.length; i++) {
        if (romBytes[pc + i] !== pattern.bytes[i]) {
          match = false;
          break;
        }
      }
      if (!match) continue;

      // Decode surrounding context
      const contextStart = Math.max(0, pc - 6);
      const contextEnd = Math.min(romBytes.length, pc + 16);
      const rawBytes = bytesToHex(romBytes.subarray(pc, Math.min(romBytes.length, pc + pattern.bytes.length)));

      // Disassemble a few instructions around the hit
      const disasmRows = [];
      let dpc = contextStart;
      while (dpc < contextEnd) {
        const inst = decodeInstruction(romBytes, dpc, 'adl');
        const len = Math.max(1, inst?.length ?? 1);
        disasmRows.push({
          pc: dpc,
          bytes: bytesToHex(romBytes.subarray(dpc, Math.min(romBytes.length, dpc + len))),
          text: formatInstruction(inst),
          isHit: dpc === pc,
        });
        dpc += len;
      }

      results.push({ pc, label: pattern.label, rawBytes, disasm: disasmRows });
    }
  }

  return results;
}

// --- Interpreter for dynamic trace ---

function readReg(cpu, reg) {
  if (!(reg in cpu)) throw new Error(`Unsupported 8-bit register ${String(reg)}`);
  return cpu[reg] & 0xFF;
}

function writeReg(cpu, reg, value) {
  if (!(reg in cpu)) throw new Error(`Unsupported 8-bit register ${String(reg)}`);
  cpu[reg] = value & 0xFF;
}

function readPair(cpu, pair) {
  if (pair === 'af') return cpu.af & 0xFFFF;
  if (!(pair in cpu)) throw new Error(`Unsupported pair ${String(pair)}`);
  return cpu[pair] & 0xFFFFFF;
}

function writePair(cpu, pair, value) {
  if (pair === 'af') {
    cpu.af = value & 0xFFFF;
    return;
  }
  if (!(pair in cpu)) throw new Error(`Unsupported pair ${String(pair)}`);
  cpu[pair] = value & 0xFFFFFF;
}

function executeInstruction(cpu, inst) {
  const fallthrough = (inst.nextPc ?? ((cpu.pc + (inst.length ?? 1)) & 0xFFFFFF)) & 0xFFFFFF;

  switch (inst.tag) {
    case 'push':
      cpu.push(readPair(cpu, inst.pair));
      cpu.pc = fallthrough;
      return;

    case 'pop':
      writePair(cpu, inst.pair, cpu.pop());
      cpu.pc = fallthrough;
      return;

    case 'ld-pair-imm':
      writePair(cpu, inst.pair, inst.value);
      cpu.pc = fallthrough;
      return;

    case 'ld-reg-imm':
      writeReg(cpu, inst.dest, inst.value);
      cpu.pc = fallthrough;
      return;

    case 'ld-reg-reg':
      writeReg(cpu, inst.dest, readReg(cpu, inst.src));
      cpu.pc = fallthrough;
      return;

    case 'ld-reg-mem':
      writeReg(cpu, inst.dest, cpu.read8(inst.addr));
      cpu.pc = fallthrough;
      return;

    case 'ld-mem-reg':
      cpu.write8(inst.addr, readReg(cpu, inst.src));
      cpu.pc = fallthrough;
      return;

    case 'ld-ixd-reg':
      cpu.writeIndexed8(inst.indexRegister, inst.displacement, readReg(cpu, inst.src));
      cpu.pc = fallthrough;
      return;

    case 'ld-ixd-imm':
      cpu.writeIndexed8(inst.indexRegister, inst.displacement, inst.value);
      cpu.pc = fallthrough;
      return;

    case 'ld-reg-ixd':
      writeReg(cpu, inst.dest, cpu.readIndexed8(inst.indexRegister, inst.displacement));
      cpu.pc = fallthrough;
      return;

    case 'ld-indexed-pair':
      cpu.write24((cpu[inst.indexRegister] + inst.displacement) & cpu.addressMask, readPair(cpu, inst.pair));
      cpu.pc = fallthrough;
      return;

    case 'ld-pair-indexed':
      writePair(cpu, inst.pair, cpu.read24((cpu[inst.indexRegister] + inst.displacement) & cpu.addressMask));
      cpu.pc = fallthrough;
      return;

    case 'ld-mem-pair':
      cpu.write16(inst.addr, readPair(cpu, inst.pair) & 0xFFFF);
      cpu.pc = fallthrough;
      return;

    case 'ld-pair-mem':
      writePair(cpu, inst.pair, cpu.read16(inst.addr));
      cpu.pc = fallthrough;
      return;

    case 'indexed-cb-bit':
      cpu.testBit(cpu.readIndexed8(inst.indexRegister, inst.displacement), inst.bit);
      cpu.pc = fallthrough;
      return;

    case 'bit-test':
      cpu.testBit(readReg(cpu, inst.reg), inst.bit);
      cpu.pc = fallthrough;
      return;

    case 'inc-ixd': {
      const value = cpu.readIndexed8(inst.indexRegister, inst.displacement);
      cpu.writeIndexed8(inst.indexRegister, inst.displacement, cpu.inc8(value));
      cpu.pc = fallthrough;
      return;
    }

    case 'dec-ixd': {
      const value = cpu.readIndexed8(inst.indexRegister, inst.displacement);
      cpu.writeIndexed8(inst.indexRegister, inst.displacement, cpu.dec8(value));
      cpu.pc = fallthrough;
      return;
    }

    case 'inc-reg':
      writeReg(cpu, inst.reg, cpu.inc8(readReg(cpu, inst.reg)));
      cpu.pc = fallthrough;
      return;

    case 'dec-reg':
      writeReg(cpu, inst.reg, cpu.dec8(readReg(cpu, inst.reg)));
      cpu.pc = fallthrough;
      return;

    case 'inc-pair':
      writePair(cpu, inst.pair, (readPair(cpu, inst.pair) + 1) & 0xFFFFFF);
      cpu.pc = fallthrough;
      return;

    case 'dec-pair':
      writePair(cpu, inst.pair, (readPair(cpu, inst.pair) - 1) & 0xFFFFFF);
      cpu.pc = fallthrough;
      return;

    case 'ld-ind-reg':
      // LD (HL), r
      cpu.write8(cpu.hl & cpu.addressMask, readReg(cpu, inst.src));
      cpu.pc = fallthrough;
      return;

    case 'ld-reg-ind':
      // LD r, (HL)
      writeReg(cpu, inst.dest, cpu.read8(cpu.hl & cpu.addressMask));
      cpu.pc = fallthrough;
      return;

    case 'djnz':
      cpu.b = (cpu.b - 1) & 0xFF;
      cpu.pc = (cpu.b !== 0 ? inst.target : fallthrough) & 0xFFFFFF;
      return;

    case 'alu-reg': {
      const src = readReg(cpu, inst.src);
      switch (inst.op) {
        case 'xor':
          cpu.a = (cpu.a ^ src) & 0xFF;
          cpu.updateOrXorFlags(cpu.a);
          break;
        case 'or':
          cpu.a = (cpu.a | src) & 0xFF;
          cpu.updateOrXorFlags(cpu.a);
          break;
        case 'and':
          cpu.a = (cpu.a & src) & 0xFF;
          cpu.updateLogicFlags(cpu.a);
          break;
        case 'cp':
          cpu.compare(cpu.a, src);
          break;
        case 'add':
          cpu.a = cpu.add8(cpu.a, src);
          break;
        case 'sub':
          cpu.a = cpu.sub8(cpu.a, src);
          break;
        default:
          throw new Error(`Unsupported alu-reg op ${String(inst.op)} at ${hex(cpu.pc)}`);
      }
      cpu.pc = fallthrough;
      return;
    }

    case 'alu-imm':
      switch (inst.op) {
        case 'and':
          cpu.a = (cpu.a & inst.value) & 0xFF;
          cpu.updateLogicFlags(cpu.a);
          break;
        case 'or':
          cpu.a = (cpu.a | inst.value) & 0xFF;
          cpu.updateOrXorFlags(cpu.a);
          break;
        case 'xor':
          cpu.a = (cpu.a ^ inst.value) & 0xFF;
          cpu.updateOrXorFlags(cpu.a);
          break;
        case 'cp':
          cpu.compare(cpu.a, inst.value);
          break;
        case 'add':
          cpu.a = cpu.add8(cpu.a, inst.value);
          break;
        case 'sub':
          cpu.a = cpu.sub8(cpu.a, inst.value);
          break;
        default:
          throw new Error(`Unsupported alu-imm op ${String(inst.op)} at ${hex(cpu.pc)}`);
      }
      cpu.pc = fallthrough;
      return;

    case 'jr':
      cpu.pc = inst.target & 0xFFFFFF;
      return;

    case 'jr-conditional':
      cpu.pc = (cpu.checkCondition(inst.condition) ? inst.target : fallthrough) & 0xFFFFFF;
      return;

    case 'jp':
      cpu.pc = inst.target & 0xFFFFFF;
      return;

    case 'jp-conditional':
      cpu.pc = (cpu.checkCondition(inst.condition) ? inst.target : fallthrough) & 0xFFFFFF;
      return;

    case 'call':
      cpu.push(fallthrough);
      cpu.pc = inst.target & 0xFFFFFF;
      return;

    case 'call-conditional':
      if (cpu.checkCondition(inst.condition)) {
        cpu.push(fallthrough);
        cpu.pc = inst.target & 0xFFFFFF;
        return;
      }
      cpu.pc = fallthrough;
      return;

    case 'ei':
      cpu.iff1 = 1;
      cpu.iff2 = 1;
      cpu.pc = fallthrough;
      return;

    case 'di':
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.pc = fallthrough;
      return;

    case 'ret':
      cpu.pc = cpu.popReturn() & 0xFFFFFF;
      return;

    case 'ret-conditional':
      cpu.pc = cpu.checkCondition(inst.condition) ? (cpu.popReturn() & 0xFFFFFF) : fallthrough;
      return;

    case 'nop':
      cpu.pc = fallthrough;
      return;

    default:
      throw new Error(`Unsupported instruction ${inst.tag} at ${hex(cpu.pc)}`);
  }
}

function snapshot(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    a: cpu.a & 0xFF,
    b: cpu.b & 0xFF,
    c: cpu.c & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
  };
}

function instrumentMemory(cpu) {
  const log = [];
  const state = { step: -1 };

  const wrapRead = (name, width) => {
    const original = cpu[name].bind(cpu);
    cpu[name] = (addr) => {
      const value = original(addr);
      log.push({ step: state.step, dir: 'R', width, addr: addr & 0xFFFFFF, value });
      return value;
    };
  };

  const wrapWrite = (name, width) => {
    const original = cpu[name].bind(cpu);
    cpu[name] = (addr, value) => {
      log.push({ step: state.step, dir: 'W', width, addr: addr & 0xFFFFFF, value });
      return original(addr, value);
    };
  };

  wrapRead('read8', 1);
  wrapRead('read16', 2);
  wrapRead('read24', 3);
  wrapWrite('write8', 1);
  wrapWrite('write16', 2);
  wrapWrite('write24', 3);

  return { log, state };
}

function formatAccess(entry) {
  const widthLabel = entry.width * 8;
  const valueWidth = entry.width === 1 ? 2 : entry.width === 2 ? 4 : 6;
  return `${entry.dir}${widthLabel}@${hex(entry.addr)}=${hex(entry.value, valueWidth)}`;
}

function isInterestingAccess(entry) {
  const addr = entry.addr & 0xFFFFFF;
  // E00900 region, D0058C/D0058E, or other keyboard MMIO
  if (addr >= 0xE00800 && addr <= 0xE00FFF) return true;
  if (addr === KBD_SCANCODE_RAM || addr === KBD_SCANCODE_RAM2) return true;
  if (addr >= 0xD00580 && addr <= 0xD00590) return true;
  return false;
}

// --- Dynamic trace runner ---

function runDynamicTrace(romBytes, entryPoint, label) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const cpu = new CPU(mem);
  cpu.pc = entryPoint;
  cpu.sp = TRACE_SP;
  cpu.iy = 0xE00800;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.i = 0;
  cpu.im = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;

  // Stack: push return sentinel
  write24(mem, TRACE_SP, RETURN_SENTINEL);

  // Seed MMIO
  mem[KBD_STATUS_ADDR] = 0x02;       // scan complete bit
  mem[KBD_READY_ADDR] = 0x01;        // ready bit
  mem[KBD_SCAN_RESULT_ADDR] = TRACE_SCAN_CODE;  // test scan code 0x35

  const access = instrumentMemory(cpu);
  const steps = [];
  let hitUnsupported = null;

  for (let step = 0; step < TRACE_LIMIT; step++) {
    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) break;

    const pc = cpu.pc & 0xFFFFFF;
    const inst = decodeInstruction(romBytes, pc, cpu.madl ? 'adl' : 'z80');
    if (!inst) {
      hitUnsupported = `Decode failed at ${hex(pc)}`;
      break;
    }

    const before = snapshot(cpu);
    const accessStart = access.log.length;

    access.state.step = step;
    try {
      executeInstruction(cpu, inst);
    } catch (e) {
      hitUnsupported = `${e.message} at step ${step}`;
      steps.push({
        step, pc,
        nextPc: pc,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(romBytes.length, pc + Math.max(1, inst.length ?? 1)))),
        text: formatInstruction(inst),
        before,
        after: before,
        accesses: [],
        error: hitUnsupported,
      });
      break;
    }

    const after = snapshot(cpu);
    steps.push({
      step,
      pc,
      nextPc: after.pc,
      bytes: bytesToHex(romBytes.subarray(pc, Math.min(romBytes.length, pc + Math.max(1, inst.length ?? 1)))),
      text: formatInstruction(inst),
      before,
      after,
      accesses: access.log.slice(accessStart),
    });
  }

  return {
    label,
    entryPoint,
    steps,
    final: snapshot(cpu),
    hitUnsupported,
    allAccesses: access.log,
  };
}

// --- Printing ---

function printStaticScan(results) {
  console.log('=== Part 1: Static Scan for E00900 References ===\n');
  console.log(`Found ${results.length} instruction(s) referencing 0xE00900:\n`);

  for (const result of results) {
    console.log(`  ${hex(result.pc)}  ${result.label}  [${result.rawBytes}]`);
    console.log('  Context disassembly:');
    for (const row of result.disasm) {
      const marker = row.isHit ? ' >>>' : '    ';
      console.log(`  ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    console.log('');
  }

  // Group by address range
  const clusters = {};
  for (const result of results) {
    const clusterBase = (result.pc & 0xFFFFF0);
    const key = hex(clusterBase);
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(result);
  }

  console.log('  Cluster summary:');
  for (const [base, hits] of Object.entries(clusters)) {
    const addrs = hits.map(h => hex(h.pc)).join(', ');
    console.log(`    ${base}: ${hits.length} hit(s) at ${addrs}`);
  }
  console.log('');
}

function printDynamicTrace(trace) {
  console.log(`=== ${trace.label} ===\n`);
  console.log(`  Entry: ${hex(trace.entryPoint)}  SP=${hex(TRACE_SP)}  IY=${hex(0xE00800)}`);
  console.log(`  Seeded: E00900=${hexByte(TRACE_SCAN_CODE)}, E00818=0x02, E00824=0x01`);
  console.log(`  Stack: [${hex(TRACE_SP)}]=${hex(RETURN_SENTINEL)} (sentinel)\n`);

  if (trace.hitUnsupported) {
    console.log(`  *** Trace stopped early: ${trace.hitUnsupported}\n`);
  }

  for (const step of trace.steps) {
    const interestingAccesses = step.accesses.filter(isInterestingAccess);
    console.log(
      `  [${String(step.step).padStart(3, '0')}] ${hex(step.pc)}  ${step.bytes.padEnd(18)}  ${step.text}` +
      `  A=${hexByte(step.after.a)} F=${hexByte(step.after.f)} HL=${hex(step.after.hl)} SP=${hex(step.after.sp)}`
    );
    if (interestingAccesses.length > 0) {
      console.log(`        ${interestingAccesses.map(formatAccess).join(' | ')}`);
    }
    if (step.error) {
      console.log(`        ERROR: ${step.error}`);
    }
  }

  console.log('');
  console.log(`  Final: PC=${hex(trace.final.pc)} A=${hexByte(trace.final.a)} HL=${hex(trace.final.hl)} DE=${hex(trace.final.de)} SP=${hex(trace.final.sp)}`);

  // Summarize all E00900 accesses
  const e00900Reads = trace.allAccesses.filter(a => a.addr === E00900 && a.dir === 'R');
  const e00900Writes = trace.allAccesses.filter(a => a.addr === E00900 && a.dir === 'W');
  const ramWrites = trace.allAccesses.filter(a => (a.addr === KBD_SCANCODE_RAM || a.addr === KBD_SCANCODE_RAM2) && a.dir === 'W');

  console.log(`  E00900 reads: ${e00900Reads.length} (values: ${e00900Reads.map(a => hexByte(a.value)).join(', ') || 'none'})`);
  console.log(`  E00900 writes: ${e00900Writes.length} (values: ${e00900Writes.map(a => hexByte(a.value)).join(', ') || 'none'})`);
  console.log(`  D0058C/D0058E writes: ${ramWrites.length} (values: ${ramWrites.map(a => `${hex(a.addr)}=${hexByte(a.value)}`).join(', ') || 'none'})`);
  console.log('');
}

function printSummary(staticResults, traces) {
  console.log('=== Part 4: Classification Summary ===\n');

  // Group static hits by functional cluster
  for (const result of staticResults) {
    const pc = result.pc;
    let classification = 'unknown';
    if (pc >= 0x0159C0 && pc <= 0x015AFF) {
      classification = 'foreground keyboard scanner (phase 286 traced)';
    } else if (pc >= 0x040F00 && pc <= 0x040FFF) {
      classification = '0x040Fxx cluster (Part 2 trace target)';
    } else if (pc >= 0x046500 && pc <= 0x0465FF) {
      classification = '0x0465xx cluster (Part 3 trace target)';
    } else if (pc >= 0x048A00 && pc <= 0x048AFF) {
      classification = 'USB/port init region (phase 286 corrected)';
    }
    console.log(`  ${hex(pc)}  ${result.label.padEnd(22)}  => ${classification}`);
  }

  console.log('');
  for (const trace of traces) {
    const e00900Reads = trace.allAccesses.filter(a => a.addr === E00900 && a.dir === 'R');
    const e00900Writes = trace.allAccesses.filter(a => a.addr === E00900 && a.dir === 'W');
    const ramWrites = trace.allAccesses.filter(a =>
      a.dir === 'W' && a.addr >= 0xD00000 && a.addr < 0xD20000 && a.addr !== E00900
    );
    const mmioWrites = trace.allAccesses.filter(a =>
      a.dir === 'W' && a.addr >= 0xE00800 && a.addr < 0xE01000 && a.addr !== E00900
    );
    const stepsRun = trace.steps.length;
    const hitReturn = trace.final.pc === RETURN_SENTINEL;

    let behavior = '';
    if (e00900Reads.length > 0 && ramWrites.length > 0 && e00900Writes.length > 0) {
      behavior = 'FULL SCANNER: reads scan code, stores to RAM, reprograms scan engine';
    } else if (e00900Reads.length > 0 && ramWrites.length > 0) {
      behavior = 'READER+STORE: reads scan code and stores to RAM';
    } else if (e00900Reads.length > 0 && e00900Writes.length > 0) {
      behavior = 'READER+REPROGRAM: reads scan code and writes back to scan engine';
    } else if (e00900Reads.length > 0) {
      behavior = 'READER-ONLY: reads scan code (no RAM store observed)';
    } else if (trace.hitUnsupported) {
      behavior = `PARTIAL: trace stopped (${trace.hitUnsupported})`;
    } else {
      behavior = 'NO E00900 ACCESS on traced path';
    }

    const ramAddrs = [...new Set(ramWrites.map(a => hex(a.addr)))].slice(0, 10).join(', ');
    const mmioAddrs = [...new Set(mmioWrites.map(a => hex(a.addr)))].slice(0, 10).join(', ');

    console.log(`  ${trace.label}:`);
    console.log(`    Entry=${hex(trace.entryPoint)} Steps=${stepsRun} Returned=${hitReturn}`);
    console.log(`    Behavior: ${behavior}`);
    if (ramAddrs) console.log(`    RAM writes: ${ramAddrs}`);
    if (mmioAddrs) console.log(`    MMIO writes: ${mmioAddrs}`);
    console.log('');
  }
}

// --- Main ---

async function main() {
  console.log('=== Phase 287: Trace E00900 Reader Clusters ===\n');

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  // Part 1: Static scan
  const staticResults = staticScanE00900(romBytes);
  printStaticScan(staticResults);

  // Identify entry points for Part 2 and Part 3
  const cluster040F = staticResults.filter(r => r.pc >= 0x040F00 && r.pc <= 0x040FFF);
  const cluster0465 = staticResults.filter(r => r.pc >= 0x046500 && r.pc <= 0x0465FF);

  // If no hits in exact range, widen search
  const cluster040Fwide = cluster040F.length > 0 ? cluster040F :
    staticResults.filter(r => r.pc >= 0x040E00 && r.pc <= 0x0410FF);
  const cluster0465wide = cluster0465.length > 0 ? cluster0465 :
    staticResults.filter(r => r.pc >= 0x046400 && r.pc <= 0x0466FF);

  const entry040F = cluster040Fwide.length > 0 ? cluster040Fwide[0].pc : null;
  const entry0465 = cluster0465wide.length > 0 ? cluster0465wide[0].pc : null;

  console.log(`  040Fxx cluster entry: ${entry040F ? hex(entry040F) : 'NOT FOUND in static scan'}`);
  console.log(`  0465xx cluster entry: ${entry0465 ? hex(entry0465) : 'NOT FOUND in static scan'}\n`);

  // For dynamic trace, we want to start a few instructions BEFORE the E00900 read
  // to catch function prologues. Back up ~16 bytes from the hit to find a likely entry.
  function findFunctionEntry(romBytes, hitPc) {
    // Scan backwards for a common prologue pattern (PUSH AF/HL/IX or DI)
    for (let scan = hitPc - 32; scan < hitPc; scan++) {
      const inst = decodeInstruction(romBytes, scan, 'adl');
      if (!inst) continue;
      // Check if disassembly from this point reaches hitPc cleanly
      let testPc = scan;
      let reachesHit = false;
      for (let i = 0; i < 20; i++) {
        if (testPc === hitPc) { reachesHit = true; break; }
        if (testPc > hitPc) break;
        const ti = decodeInstruction(romBytes, testPc, 'adl');
        testPc += Math.max(1, ti?.length ?? 1);
      }
      if (reachesHit && (inst.tag === 'push' || inst.tag === 'di' || inst.tag === 'ld-pair-imm')) {
        return scan;
      }
    }
    // Fallback: start 8 bytes before
    return Math.max(0, hitPc - 8);
  }

  const traces = [];

  // Part 2: Dynamic trace of 040Fxx cluster
  if (entry040F !== null) {
    const traceEntry = findFunctionEntry(romBytes, entry040F);
    console.log(`  Part 2: Tracing from ${hex(traceEntry)} (function entry before hit at ${hex(entry040F)})\n`);
    const trace2 = runDynamicTrace(romBytes, traceEntry, 'Part 2: 0x040Fxx Cluster');
    printDynamicTrace(trace2);
    traces.push(trace2);
  } else {
    console.log('  Part 2: SKIPPED — no E00900 reference found in 0x040Fxx range.\n');
  }

  // Part 3: Dynamic trace of 0465xx cluster
  if (entry0465 !== null) {
    const traceEntry = findFunctionEntry(romBytes, entry0465);
    console.log(`  Part 3: Tracing from ${hex(traceEntry)} (function entry before hit at ${hex(entry0465)})\n`);
    const trace3 = runDynamicTrace(romBytes, traceEntry, 'Part 3: 0x0465xx Cluster');
    printDynamicTrace(trace3);
    traces.push(trace3);
  } else {
    console.log('  Part 3: SKIPPED — no E00900 reference found in 0x0465xx range.\n');
  }

  // Part 4: Summary
  printSummary(staticResults, traces);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
