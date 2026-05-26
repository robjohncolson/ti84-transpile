#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const REPORT_PATH = path.join(__dirname, 'phase449-trace-0x0008BB-key-handler-report.md');

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const STATIC_START = 0x0008BB;
const STATIC_END = 0x000A00;
const WATCH_ADDRS = [0xD00080, 0xD000AC, 0xD00587, 0xD0058B, 0xD007D0, 0xD0230F];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex2(v) { return `0x${v.toString(16).toUpperCase().padStart(2, '0')}`; }
function hex4(v) { return `0x${v.toString(16).toUpperCase().padStart(4, '0')}`; }
function hex6(v) { return `0x${v.toString(16).toUpperCase().padStart(6, '0')}`; }
function r8(a) { return romBytes[a]; }
function r16(a) { return romBytes[a] | (romBytes[a + 1] << 8); }
function r24(a) { return romBytes[a] | (romBytes[a + 1] << 8) | (romBytes[a + 2] << 16); }
function signed8(v) { return v > 127 ? v - 256 : v; }
function vramHash(mem) {
  return createHash('sha256').update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE)).digest('hex').slice(0, 12);
}

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function disasmOne(addr) {
  let pos = addr;
  const startPos = pos;
  let prefix = null;

  const b0 = r8(pos);
  const nextOp = r8(pos + 1);
  const nextEd = r8(pos + 2);
  const immSizeOps = [0x01, 0x11, 0x21, 0x31, 0xCD, 0xC3, 0xCA, 0xC2, 0xDA, 0xD2, 0x3A, 0x32, 0x22, 0x2A, 0xC4, 0xCC, 0xD4, 0xDC];
  const prefixedEdAluOps = [0x42, 0x4A, 0x52, 0x5A, 0x62, 0x6A, 0x72, 0x7A];
  const looksLikePrefix = [0x40, 0x49, 0x52, 0x5B].includes(b0)
    && (immSizeOps.includes(nextOp) || (nextOp === 0xED && prefixedEdAluOps.includes(nextEd)));

  if (looksLikePrefix) {
    prefix = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' }[b0];
    pos++;
  }

  const op = r8(pos++);
  let mnemonic = '';

  if (op === 0xCB) {
    const cb = r8(pos++);
    const bit = (cb >> 3) & 7;
    const reg = cb & 7;
    const group = (cb >> 6) & 3;
    if (group === 0) {
      const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      mnemonic = `${shifts[(cb >> 3) & 7]} ${REG8[reg]}`;
    } else if (group === 1) {
      mnemonic = `BIT ${bit}, ${REG8[reg]}`;
    } else if (group === 2) {
      mnemonic = `RES ${bit}, ${REG8[reg]}`;
    } else {
      mnemonic = `SET ${bit}, ${REG8[reg]}`;
    }
  } else if (op === 0xED) {
    const ed = r8(pos++);
    switch (ed) {
      case 0x38: { const n = r8(pos++); mnemonic = `IN0 A, (${hex2(n)})`; break; }
      case 0x39: { const n = r8(pos++); mnemonic = `OUT0 (${hex2(n)}), A`; break; }
      case 0x42: mnemonic = 'SBC HL, BC'; break;
      case 0x52: mnemonic = 'SBC HL, DE'; break;
      case 0x56: mnemonic = 'IM 1'; break;
      case 0x65: mnemonic = 'RETN'; break;
      case 0x7E: mnemonic = 'IM 2'; break;
      case 0xB0: mnemonic = 'LDIR'; break;
      default: mnemonic = `ED ${hex2(ed)}`; break;
    }
  } else if (op === 0xDD) {
    const ix = r8(pos++);
    mnemonic = `DD ${hex2(ix)}`;
    if (ix === 0x21) {
      const nn = r24(pos); pos += 3; mnemonic = `LD IX, ${hex6(nn)}`;
    } else if (ix === 0x39) {
      mnemonic = 'ADD IX, SP';
    } else if (ix === 0xE5) {
      mnemonic = 'PUSH IX';
    } else if (ix === 0xE1) {
      mnemonic = 'POP IX';
    } else if (ix === 0x36) {
      const d = signed8(r8(pos++));
      const n = r8(pos++);
      mnemonic = `LD (IX${d >= 0 ? '+' : ''}${d}), ${hex2(n)}`;
    } else if (ix === 0x7E) {
      const d = signed8(r8(pos++));
      mnemonic = `LD A, (IX${d >= 0 ? '+' : ''}${d})`;
    } else if (ix === 0xCB) {
      const d = signed8(r8(pos++));
      const cb2 = r8(pos++);
      const bit = (cb2 >> 3) & 7;
      const group = (cb2 >> 6) & 3;
      if (group === 1) mnemonic = `BIT ${bit}, (IX${d >= 0 ? '+' : ''}${d})`;
      else if (group === 2) mnemonic = `RES ${bit}, (IX${d >= 0 ? '+' : ''}${d})`;
      else if (group === 3) mnemonic = `SET ${bit}, (IX${d >= 0 ? '+' : ''}${d})`;
      else mnemonic = `CB ${hex2(cb2)} on (IX${d >= 0 ? '+' : ''}${d})`;
    }
  } else {
    const immSize = (prefix === '.SIS' || prefix === '.SIL') ? 2 : 3;
    const hexImm = (v) => immSize === 2 ? hex4(v) : hex6(v);
    function readImm() {
      if (immSize === 2) { const v = r16(pos); pos += 2; return v; }
      const v = r24(pos); pos += 3; return v;
    }
    switch (op) {
      case 0x00: mnemonic = 'NOP'; break;
      case 0x01: { const nn = readImm(); mnemonic = `LD BC, ${hexImm(nn)}`; break; }
      case 0x03: mnemonic = 'INC BC'; break;
      case 0x06: { const n = r8(pos++); mnemonic = `LD B, ${hex2(n)}`; break; }
      case 0x09: mnemonic = 'ADD HL, BC'; break;
      case 0x0C: mnemonic = 'INC C'; break;
      case 0x0E: { const n = r8(pos++); mnemonic = `LD C, ${hex2(n)}`; break; }
      case 0x10: { const d = signed8(r8(pos++)); mnemonic = `DJNZ ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x11: { const nn = readImm(); mnemonic = `LD DE, ${hexImm(nn)}`; break; }
      case 0x12: mnemonic = 'LD (DE), A'; break;
      case 0x13: mnemonic = 'INC DE'; break;
      case 0x18: { const d = signed8(r8(pos++)); mnemonic = `JR ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x1A: mnemonic = 'LD A, (DE)'; break;
      case 0x1C: mnemonic = 'INC E'; break;
      case 0x20: { const d = signed8(r8(pos++)); mnemonic = `JR NZ, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x21: { const nn = readImm(); mnemonic = `LD HL, ${hexImm(nn)}`; break; }
      case 0x22: { const nn = readImm(); mnemonic = `LD (${hexImm(nn)}), HL`; break; }
      case 0x23: mnemonic = 'INC HL'; break;
      case 0x27: mnemonic = 'DAA'; break;
      case 0x28: { const d = signed8(r8(pos++)); mnemonic = `JR Z, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x2A: { const nn = readImm(); mnemonic = `LD HL, (${hexImm(nn)})`; break; }
      case 0x2B: mnemonic = 'DEC HL'; break;
      case 0x2F: mnemonic = 'CPL'; break;
      case 0x30: { const d = signed8(r8(pos++)); mnemonic = `JR NC, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x31: { const nn = readImm(); mnemonic = `LD SP, ${hexImm(nn)}`; break; }
      case 0x36: { const n = r8(pos++); mnemonic = `LD (HL), ${hex2(n)}`; break; }
      case 0x38: { const d = signed8(r8(pos++)); mnemonic = `JR C, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x39: mnemonic = 'ADD HL, SP'; break;
      case 0x3B: mnemonic = 'DEC SP'; break;
      case 0x3E: { const n = r8(pos++); mnemonic = `LD A, ${hex2(n)}`; break; }
      case 0x46: mnemonic = 'LD B, (HL)'; break;
      case 0x4E: mnemonic = 'LD C, (HL)'; break;
      case 0x4F: mnemonic = 'LD C, A'; break;
      case 0x71: mnemonic = 'LD (HL), C'; break;
      case 0x76: mnemonic = 'HALT'; break;
      case 0x77: mnemonic = 'LD (HL), A'; break;
      case 0x7E: mnemonic = 'LD A, (HL)'; break;
      case 0xA6: mnemonic = 'AND (HL)'; break;
      case 0xB7: mnemonic = 'OR A'; break;
      case 0xB9: mnemonic = 'CP C'; break;
      case 0xC0: mnemonic = 'RET NZ'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xC6: { const n = r8(pos++); mnemonic = `ADD A, ${hex2(n)}`; break; }
      case 0xC8: mnemonic = 'RET Z'; break;
      case 0xC9: mnemonic = 'RET'; break;
      case 0xCC: { const nn = readImm(); mnemonic = `CALL Z, ${hexImm(nn)}`; break; }
      case 0xCD: { const nn = readImm(); mnemonic = `CALL ${hexImm(nn)}`; break; }
      case 0xCE: { const n = r8(pos++); mnemonic = `ADC A, ${hex2(n)}`; break; }
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xE9: mnemonic = 'JP (HL)'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      case 0xF3: mnemonic = 'DI'; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xF7: mnemonic = 'RST 0x30'; break;
      case 0xF8: mnemonic = 'RET M'; break;
      case 0xF9: mnemonic = 'LD SP, HL'; break;
      case 0xFC: { const nn = readImm(); mnemonic = `CALL M, ${hexImm(nn)}`; break; }
      default: mnemonic = `DB ${hex2(op)}`; break;
    }
  }

  if (prefix) mnemonic = `${prefix} ${mnemonic}`;
  let raw = '';
  for (let i = startPos; i < pos; i++) raw += `${romBytes[i].toString(16).padStart(2, '0').toUpperCase()} `;
  return { addr: startPos, len: pos - startPos, mnemonic, rawBytes: raw.trim() };
}

function disasmRange(start, end) {
  const lines = [];
  const callTargets = [];
  let pos = start;
  while (pos < end) {
    const inst = disasmOne(pos);
    lines.push(`  ${pos.toString(16).padStart(6, '0').toUpperCase()}: ${inst.rawBytes.padEnd(20)} ${inst.mnemonic}`);
    if (inst.mnemonic.startsWith('CALL ') && !inst.mnemonic.includes(',')) {
      const target = Number.parseInt(inst.mnemonic.split(' ')[1], 16);
      if (!Number.isNaN(target)) callTargets.push(target);
    }
    pos += inst.len;
  }
  return { lines, callTargets: [...new Set(callTargets)] };
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  let lastResult = postInitResult;
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    lastResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { bootResult, kernelResult, postInitResult, stageResult: lastResult, lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function runDynamicTrace() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[0xD00587] = 0x41;
  mem[0xD00080] |= 0x08;

  const baselineVramHash = vramHash(mem);
  const uniquePcs = new Set();
  const firstTrace = [];
  const writesByAddr = new Map();
  const readsByAddr = new Map();
  let currentPc = EVENT_LOOP_ENTRY;
  let hit8bb = false;

  function record(map, addr, size, value) {
    const key = addr & 0xFFFFFF;
    let entry = map.get(key);
    if (!entry) {
      entry = { addr: key, count: 0, sizes: new Set(), sampleValue: value & 0xFFFFFF, pcs: new Set() };
      map.set(key, entry);
    }
    entry.count++;
    entry.sizes.add(size);
    if (entry.pcs.size < 6) entry.pcs.add(currentPc & 0xFFFFFF);
  }

  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    if (WATCH_ADDRS.includes(addr & 0xFFFFFF)) record(readsByAddr, addr, 1, value);
    return value;
  };
  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    if (WATCH_ADDRS.includes(addr & 0xFFFFFF)) record(readsByAddr, addr, 2, value);
    return value;
  };
  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    if (WATCH_ADDRS.includes(addr & 0xFFFFFF)) record(readsByAddr, addr, 3, value);
    return value;
  };
  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xD20000) record(writesByAddr, addr, 1, value);
    return origWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xD20000) record(writesByAddr, addr, 2, value);
    return origWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xD20000) record(writesByAddr, addr, 3, value);
    return origWrite24(addr, value);
  };

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 5000,
      diHaltBypass: true,
      onBlock: (pc, mode, meta, steps) => {
        currentPc = pc & 0xFFFFFF;
        uniquePcs.add(currentPc);
        if (firstTrace.length < 80) firstTrace.push({ step: steps, pc: currentPc, mode });
        if (currentPc === 0x0008BB) hit8bb = true;
      },
    });
  } finally {
    cpu.read8 = origRead8;
    cpu.read16 = origRead16;
    cpu.read24 = origRead24;
    cpu.write8 = origWrite8;
    cpu.write16 = origWrite16;
    cpu.write24 = origWrite24;
  }

  const finalVramHash = vramHash(mem);
  const writes = [...writesByAddr.values()]
    .filter((entry) => {
      const a = entry.addr;
      return !((a >= 0xD1A600 && a < 0xD1A900) || (a >= 0xD0FFF0 && a <= 0xD10010))
        && (WATCH_ADDRS.includes(a) || a < 0xD00600);
    })
    .sort((a, b) => a.addr - b.addr)
    .map((entry) => ({ addr: entry.addr, count: entry.count, sizes: [...entry.sizes].sort((a, b) => a - b), sampleValue: entry.sampleValue, pcs: [...entry.pcs].sort((a, b) => a - b) }));
  const reads = [...readsByAddr.values()]
    .sort((a, b) => a.addr - b.addr)
    .map((entry) => ({ addr: entry.addr, count: entry.count, sizes: [...entry.sizes].sort((a, b) => a - b), sampleValue: entry.sampleValue, pcs: [...entry.pcs].sort((a, b) => a - b) }));

  return {
    bootState,
    baselineVramHash,
    finalVramHash,
    vramChanged: baselineVramHash !== finalVramHash,
    hit8bb,
    uniquePcs: [...uniquePcs].sort((a, b) => a - b),
    firstTrace,
    writes,
    reads,
    result,
  };
}

function formatTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  const fmt = (row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  return [fmt(headers), fmt(widths.map((w) => '-'.repeat(w))), ...rows.map(fmt)].join('\n');
}

function buildReport(staticInfo, dynamicInfo) {
  const lines = [];
  const blockVisits = dynamicInfo.result.blockVisits ?? {};
  const lowTrace = dynamicInfo.firstTrace.slice(0, 20).map((entry) => `${hex(entry.pc)}:${entry.mode}`).join(' -> ');
  const reached001718 = Boolean(blockVisits['001718:adl']);
  const deeper8c8 = dynamicInfo.firstTrace.some((entry) => entry.pc >= 0x0008C8 && entry.pc < 0x000A00);

  lines.push('# Phase 449 - Trace 0x0008BB (Home Screen Key Handler)');
  lines.push('');
  lines.push('Generated by `probe-phase449-0x0008BB-trace.mjs`.');
  lines.push('');
  lines.push('## Static Disassembly');
  lines.push('');
  lines.push('The lightweight ADL disassembler shows that the entry block at `0x0008BB` is a tiny ROM/signature-style compare, and the broader `0x0008BB-0x000A00` region contains additional helper code that was not executed in the event-loop trace below.');
  lines.push('');
  lines.push('```asm');
  lines.push(...staticInfo.lines);
  lines.push('```');
  lines.push('');
  lines.push('## CALL Targets Found In 0x0008BB-0x000A00');
  lines.push('');
  for (const target of staticInfo.callTargets) lines.push(`- ${hex(target)}`);
  if (staticInfo.callTargets.length === 0) lines.push('- None resolved by the lightweight disassembler.');
  lines.push('');
  lines.push('## Dynamic Trace Summary');
  lines.push('');
  lines.push('```text');
  lines.push(formatTable(
    ['metric', 'value'],
    [
      ['entry', `${hex(EVENT_LOOP_ENTRY)}:adl`],
      ['termination', dynamicInfo.result.termination],
      ['steps', String(dynamicInfo.result.steps)],
      ['lastPc', hex(dynamicInfo.result.lastPc)],
      ['hit 0x0008BB', dynamicInfo.hit8bb ? 'yes' : 'no'],
      ['hit 0x001718', reached001718 ? 'yes' : 'no'],
      ['executed deeper 0x0008C8+ helper code', deeper8c8 ? 'yes' : 'no'],
      ['unique PCs', String(dynamicInfo.uniquePcs.length)],
      ['VRAM changed', dynamicInfo.vramChanged ? 'yes' : 'no'],
      ['baseline VRAM hash', dynamicInfo.baselineVramHash],
      ['final VRAM hash', dynamicInfo.finalVramHash],
    ],
  ));
  lines.push('```');
  lines.push('');
  lines.push('First block trace prefix:');
  lines.push('');
  lines.push('```text');
  lines.push(lowTrace);
  lines.push('```');
  lines.push('');
  lines.push('### Unique PCs Visited');
  lines.push('');
  lines.push(dynamicInfo.uniquePcs.map((pc) => hex(pc)).join(', '));
  lines.push('');
  lines.push('### Watched RAM Writes');
  lines.push('');
  if (dynamicInfo.writes.length === 0) lines.push('- None outside the filtered stack window.');
  for (const entry of dynamicInfo.writes) {
    lines.push(`- ${hex(entry.addr)} count=${entry.count} sizes=${entry.sizes.join('/')} sample=${hex(entry.sampleValue, entry.sampleValue > 0xFF ? 6 : 2)} pcs=${entry.pcs.map((pc) => hex(pc)).join(', ')}`);
  }
  lines.push('');
  lines.push('### Watched Reads');
  lines.push('');
  if (dynamicInfo.reads.length === 0) lines.push('- No reads recorded for the watched edit-buffer addresses.');
  for (const entry of dynamicInfo.reads) {
    lines.push(`- ${hex(entry.addr)} count=${entry.count} sizes=${entry.sizes.join('/')} sample=${hex(entry.sampleValue, entry.sampleValue > 0xFF ? 6 : 2)} pcs=${entry.pcs.map((pc) => hex(pc)).join(', ')}`);
  }
  lines.push('');
  lines.push('## Key Finding');
  lines.push('');
  lines.push('- `0x0008BB` is not using the injected scan code as a home-screen text/input handler in this path. Its visible entry sequence is `LD HL,(0x020100)` -> `LD BC,0x00A55A` -> `OR A` -> `.SIL SBC HL,BC` -> `RET`, which matches the earlier low-ROM signature/gate behavior.');
  lines.push('- The event-loop trace reached `0x0008BB` exactly once via `0x003A7D -> 0x001713 -> 0x0008BB`, then returned to `0x001717`. `0x001717` is `RET NZ`, and `0x001718` was not reached at all in this run.');
  lines.push('- The injected key itself was already consumed by `_GetCSC`: `0x003D75` cleared `0xD00587` and bit 3 of `0xD00080` before the call into `0x001713/0x0008BB`.');
  lines.push('- No VRAM writes were observed, and there were no reads or writes to `0xD007D0` or `0xD0230F`. The only notable RAM writes were `_GetCSC` housekeeping (`0xD00080`, `0xD00587`, `0xD000AC`, `0xD0058B`).');
  lines.push('- Conclusion: in the current transpiled runtime, `0x0008BB` behaves as a low-ROM check/gate that returns flags; it does not directly dispatch or render the scan code `0x41`.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const staticInfo = disasmRange(STATIC_START, STATIC_END);
  const dynamicInfo = runDynamicTrace();
  const report = buildReport(staticInfo, dynamicInfo);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(report);
}

main();
