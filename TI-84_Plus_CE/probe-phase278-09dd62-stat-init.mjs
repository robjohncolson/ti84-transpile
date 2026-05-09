#!/usr/bin/env node

/**
 * Phase 278: Trace 0x09DD62 — the single caller of 0x09DEE0 (dispatch table reset)
 *
 * Goals:
 *   1. Static disassembly of 0x09DD62 region (find parent function entry, decode ~150 bytes)
 *   2. Find callers of the parent function
 *   3. Dynamic trace from the parent function entry
 *   4. D0250F write-site scan across entire ROM
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const RAM_START = 0xD00000;

const BOOT_PC = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const CALL_SITE = 0x09DD62;          // The CALL 0x09DEE0 site
const TABLE_RESET_FN = 0x09DEE0;     // dispatch table reset
const TRACE_STEPS = 300;
const TRACE_LOOP_LIMIT = 512;
const TRACE_LOOKBACK = 16;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;

const D0250F = 0xD0250F;
const D02590 = 0xD02590;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;

// Known functions for annotation
const KNOWN_FNS = {
  0x09DEE0: 'dispatch_table_reset',
  0x0846EA: 'FindSym',
  0x08267D: 'VAT_cache_builder',
  0x091E13: 'context_installer',
  0x08A98F: 'post_reset_init',
  0x000600: 'free_RAM_query',
  0x04C9EA: 'bounds_check_fn',
  0x0820ED: 'entry_writer',
  0x084711: 'linear_search_loop',
  0x023093: 'VAT_cache_fn',
};

const CALLER_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL', length: 4 },
  { opcode: 0xC4, mnemonic: 'CALL NZ', length: 4 },
  { opcode: 0xCC, mnemonic: 'CALL Z', length: 4 },
  { opcode: 0xD4, mnemonic: 'CALL NC', length: 4 },
  { opcode: 0xDC, mnemonic: 'CALL C', length: 4 },
  { opcode: 0xE4, mnemonic: 'CALL PO', length: 4 },
  { opcode: 0xEC, mnemonic: 'CALL PE', length: 4 },
  { opcode: 0xF4, mnemonic: 'CALL P', length: 4 },
  { opcode: 0xFC, mnemonic: 'CALL M', length: 4 },
  { opcode: 0xC3, mnemonic: 'JP', length: 4 },
  { opcode: 0xC2, mnemonic: 'JP NZ', length: 4 },
  { opcode: 0xCA, mnemonic: 'JP Z', length: 4 },
  { opcode: 0xD2, mnemonic: 'JP NC', length: 4 },
  { opcode: 0xDA, mnemonic: 'JP C', length: 4 },
  { opcode: 0xE2, mnemonic: 'JP PO', length: 4 },
  { opcode: 0xEA, mnemonic: 'JP PE', length: 4 },
  { opcode: 0xF2, mnemonic: 'JP P', length: 4 },
  { opcode: 0xFA, mnemonic: 'JP M', length: 4 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function bytesAt(mem, addr, count) {
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & MEM_MASK] ?? 0);
}

function regionFor(addr) {
  switch ((addr >>> 16) & 0xFF) {
    case 0x00: return 'OS-low';
    case 0x02: return 'OS-core';
    case 0x04: return 'OS-high';
    case 0x05: return 'editor';
    case 0x06: return 'graph';
    case 0x07: return 'graph-2';
    case 0x08: return 'display';
    case 0x09: return 'STAT';
    case 0x0A: return 'display-2';
    case 0x0B: return 'apps';
    default: return 'other';
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase278-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function snapshotRuntime(cpu, mem) {
  return { cpu: snapshotCpu(cpu), memory: new Uint8Array(mem) };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  for (const f of CPU_SNAPSHOT_FIELDS) cpu[f] = snapshot.cpu[f];
}

function safeDecode(buffer, pc, mode = 'adl') {
  try { return decodeInstruction(buffer, pc, mode); } catch { return null; }
}

function knownLabel(addr) {
  return KNOWN_FNS[addr] ? ` ; ${KNOWN_FNS[addr]}` : '';
}

function formatInstruction(ins) {
  if (!ins) return '(decode failed)';
  switch (ins.tag) {
    case 'call':
      return `CALL ${hex(ins.target)}${knownLabel(ins.target)}`;
    case 'call-conditional':
      return `CALL ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}${knownLabel(ins.target)}`;
    case 'jp':
      return `JP ${hex(ins.target)}${knownLabel(ins.target)}`;
    case 'jp-conditional':
      return `JP ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}${knownLabel(ins.target)}`;
    case 'jr':
      return `JR ${hex(ins.target)}`;
    case 'jr-conditional':
      return `JR ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(ins.pair).toUpperCase()}, ${hex(ins.value)}`;
    case 'ld-pair-mem':
      return ins.direction === 'to-mem'
        ? `LD (${hex(ins.addr)}), ${String(ins.pair).toUpperCase()}`
        : `LD ${String(ins.pair).toUpperCase()}, (${hex(ins.addr)})`;
    case 'ld-imm':
      return `LD ${String(ins.reg).toUpperCase()}, ${hex(ins.value, 2)}`;
    case 'ld-reg-mem':
      return ins.direction === 'to-mem'
        ? `LD (${hex(ins.addr)}), ${String(ins.reg).toUpperCase()}`
        : `LD ${String(ins.reg).toUpperCase()}, (${hex(ins.addr)})`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(ins.condition).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'push':
      return `PUSH ${String(ins.pair ?? ins.reg ?? '??').toUpperCase()}`;
    case 'pop':
      return `POP ${String(ins.pair ?? ins.reg ?? '??').toUpperCase()}`;
    case 'bit':
      return `BIT ${ins.bit}, ${String(ins.reg ?? '??').toUpperCase()}`;
    case 'rst':
      return `RST ${hex(ins.target, 2)}`;
    default: {
      const fields = { ...ins };
      delete fields.pc; delete fields.length; delete fields.nextPc; delete fields.mode; delete fields.modePrefix;
      return `${ins.tag} ${JSON.stringify(fields)}`;
    }
  }
}

function decodeRoutine(rom, startPc, maxInstructions = 60, maxBytes = 0x100) {
  const out = [];
  let pc = startPc;
  const limit = startPc + maxBytes;
  while (pc < limit && out.length < maxInstructions) {
    const ins = safeDecode(rom, pc, 'adl');
    const length = Math.max(1, ins?.length ?? 1);
    out.push({
      pc,
      bytes: rom.subarray(pc, pc + length),
      text: formatInstruction(ins),
      tag: ins?.tag ?? 'db',
      ins,
    });
    pc += length;
    if (ins?.tag === 'ret') break;
    if (ins?.tag === 'jp' && ins.target && (ins.target < startPc - 0x200 || ins.target > startPc + 0x200)) break;
  }
  return out;
}

/**
 * Scan backwards from CALL_SITE to find the likely function entry point.
 * Look for RET / JP (non-local) / data that ends the previous function.
 */
function findFunctionEntry(rom, callSiteAddr, maxScanBack = 0x100) {
  let pc = callSiteAddr - 1;
  const floor = Math.max(0, callSiteAddr - maxScanBack);

  // Decode forward from candidate positions; look for a RET or JP that ends just before a clean entry
  // Strategy: scan backwards byte-by-byte looking for RET (0xC9) or unconditional JP (0xC3 xx xx xx)
  // then the byte after is the entry point.
  const candidates = [];
  while (pc >= floor) {
    const byte = rom[pc];
    if (byte === 0xC9) {
      // RET — next byte is likely a function entry
      candidates.push({ type: 'RET', endAddr: pc, entryAddr: pc + 1 });
    }
    // Also check for JP imm24 (C3 xx xx xx) ending at pc+3
    if (byte === 0xC3 && pc + 4 <= callSiteAddr) {
      const target = (rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16)) >>> 0;
      // Non-local JP = function terminator
      if (target < callSiteAddr - 0x200 || target > callSiteAddr + 0x200) {
        candidates.push({ type: `JP ${hex(target)}`, endAddr: pc + 3, entryAddr: pc + 4 });
      }
    }
    pc--;
  }

  // Return the closest candidate to CALL_SITE (highest entryAddr <= callSiteAddr)
  const valid = candidates.filter((c) => c.entryAddr <= callSiteAddr).sort((a, b) => b.entryAddr - a.entryAddr);
  return valid.length > 0 ? valid[0] : null;
}

function scanCallersOf(rom, targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >>> 8) & 0xFF;
  const hi = (targetAddr >>> 16) & 0xFF;
  const hits = [];
  for (let offset = 0; offset <= rom.length - 4; offset++) {
    for (const pat of CALLER_PATTERNS) {
      if (rom[offset] === pat.opcode && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
        hits.push({
          pc: offset >>> 0,
          mnemonic: pat.mnemonic,
          region: regionFor(offset),
          bytes: rom.subarray(offset, offset + 16),
          decoded: formatInstruction(safeDecode(rom, offset, 'adl')),
        });
      }
    }
  }
  return hits.sort((a, b) => a.pc - b.pc);
}

/**
 * Scan ROM for writes to D0250F.
 * Patterns:
 *   LD (imm24), A  = 0x32 0F 25 D0  (4 bytes)
 *   LD (imm24), rr = ED 43/53/63/73 0F 25 D0  (5 bytes, stores BC/DE/HL/SP)
 */
function scanWritesToD0250F(rom) {
  const hits = [];
  for (let offset = 0; offset <= rom.length - 4; offset++) {
    // LD (D0250F), A
    if (rom[offset] === 0x32 && rom[offset + 1] === 0x0F && rom[offset + 2] === 0x25 && rom[offset + 3] === 0xD0) {
      // Try to figure out what A was loaded with by looking back
      let valueHint = '(A)';
      // Check if preceding instruction is LD A, imm8 (3E xx)
      if (offset >= 2 && rom[offset - 2] === 0x3E) {
        valueHint = `A=${hex(rom[offset - 1], 2)}`;
      }
      // Check LD A, imm8 immediately before (could be 1-byte gap)
      if (offset >= 3 && rom[offset - 3] === 0x3E) {
        // Only if middle byte is a single-byte instruction
        const midIns = safeDecode(rom, offset - 2, 'adl');
        if (midIns && midIns.length === 1) {
          valueHint = `A=${hex(rom[offset - 2], 2)} (after ${midIns.tag})`;
        }
      }
      hits.push({
        pc: offset,
        type: 'LD (D0250F), A',
        region: regionFor(offset),
        valueHint,
        bytes: rom.subarray(Math.max(0, offset - 4), offset + 4),
        context: formatBytes(rom.subarray(Math.max(0, offset - 4), offset + 8)),
      });
    }
    // ED-prefixed stores: LD (imm24), rr
    if (offset <= rom.length - 5 && rom[offset] === 0xED) {
      const op2 = rom[offset + 1];
      let pair = null;
      if (op2 === 0x43) pair = 'BC';
      else if (op2 === 0x53) pair = 'DE';
      else if (op2 === 0x63) pair = 'HL';
      else if (op2 === 0x73) pair = 'SP';
      if (pair && rom[offset + 2] === 0x0F && rom[offset + 3] === 0x25 && rom[offset + 4] === 0xD0) {
        hits.push({
          pc: offset,
          type: `LD (D0250F), ${pair}`,
          region: regionFor(offset),
          valueHint: `(${pair})`,
          bytes: rom.subarray(offset, offset + 5),
          context: formatBytes(rom.subarray(Math.max(0, offset - 2), offset + 8)),
        });
      }
    }
  }
  return hits;
}

function findTraceEntry(blocks, pc) {
  for (let delta = 0; delta <= TRACE_LOOKBACK; delta++) {
    const candidate = (pc - delta) & 0xFFFFFF;
    const key = `${candidate.toString(16).padStart(6, '0')}:adl`;
    if (blocks[key]) return { pc: candidate, delta };
  }
  return { pc, delta: null };
}

function capturePointers(mem) {
  return {
    d0250f: mem[D0250F & MEM_MASK] ?? 0,
    d02590: read24(mem, D02590),
    d0259a: read24(mem, D0259A),
    d0259d: read24(mem, D0259D),
  };
}

function installWriteTracer(cpu, mem, state) {
  const events = [];
  const origW8 = cpu.write8.bind(cpu);
  const origW16 = cpu.write16.bind(cpu);
  const origW24 = cpu.write24.bind(cpu);

  function overlap(addr, width, start, end) {
    const first = addr & 0xFFFFFF;
    const last = (first + width - 1) & 0xFFFFFF;
    return first <= last ? (first <= end && last >= start) : true;
  }

  function labels(addr, width) {
    const out = [];
    if (overlap(addr, width, D0250F, D0250F)) out.push('D0250F');
    if (overlap(addr, width, D02590, D02590 + 2)) out.push('D02590');
    if (overlap(addr, width, D0259A, D0259A + 2)) out.push('D0259A');
    if (overlap(addr, width, D0259D, D0259D + 2)) out.push('D0259D');
    if (overlap(addr, width, 0xD02500, 0xD025FF)) out.push('D025xx');
    if (overlap(addr, width, 0xD3F000, 0xD3FFFF)) out.push('D3Fxxx');
    if ((addr & 0xFFFFFF) >= RAM_START) out.push('RAM');
    return out;
  }

  function record(kind, addr, width, before, after) {
    const l = labels(addr, width);
    if (l.length === 0) return;
    events.push({ step: state.step, blockPc: state.blockPc, kind, addr: addr & 0xFFFFFF, width, before: before >>> 0, after: after >>> 0, labels: l });
  }

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = mem[a & MEM_MASK] ?? 0;
    const r = origW8(addr, value);
    record('write8', a, 1, before, value & 0xFF);
    return r;
  };
  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = (mem[a & MEM_MASK] ?? 0) | ((mem[(a + 1) & MEM_MASK] ?? 0) << 8);
    const r = origW16(addr, value);
    record('write16', a, 2, before, value & 0xFFFF);
    return r;
  };
  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = read24(mem, a);
    const r = origW24(addr, value);
    record('write24', a, 3, before, value & 0xFFFFFF);
    return r;
  };

  return {
    events,
    restore() { cpu.write8 = origW8; cpu.write16 = origW16; cpu.write24 = origW24; },
  };
}

function formatWrite(event) {
  return (
    `step=${String(event.step).padStart(3)} block=${hex(event.blockPc)} ${event.kind} `
    + `${hex(event.addr)} ${hex(event.before, event.width * 2)} -> ${hex(event.after, event.width * 2)} `
    + `[${event.labels.join(', ')}]`
  );
}

function printWriteSection(title, events) {
  console.log(`${title} (${events.length})`);
  if (events.length === 0) { console.log('  (none)'); return; }
  for (const e of events) console.log(`  ${formatWrite(e)}`);
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  console.log('=== Phase 278: 0x09DD62 — STAT Init / Single Caller of 0x09DEE0 ===');
  console.log(`ROM=${ROM_PATH} bytes=${rom.length}`);
  console.log('');

  // --- 1. Find parent function entry ---
  console.log('=== Step 1: Find Parent Function Entry ===');
  const entry = findFunctionEntry(rom, CALL_SITE);
  let parentEntry = entry ? entry.entryAddr : CALL_SITE;
  if (entry) {
    console.log(`Scanning backwards from ${hex(CALL_SITE)} for function boundary...`);
    console.log(`Found ${entry.type} at ${hex(entry.endAddr)} => parent function entry = ${hex(entry.entryAddr)}`);
  } else {
    console.log(`Could not find clear function boundary; using ${hex(CALL_SITE)} as starting point.`);
  }
  console.log('');

  // --- 2. Disassemble parent function ---
  console.log('=== Step 2: Disassembly of Parent Function ===');
  const routine = decodeRoutine(rom, parentEntry, 80, 0x150);
  for (const item of routine) {
    const marker = item.pc === CALL_SITE ? ' <<<< CALL 0x09DEE0 site' : '';
    console.log(`${hex(item.pc)}  ${formatBytes(item.bytes).padEnd(24)}  ${item.text}${marker}`);
  }
  console.log('');

  // Also decode a few instructions before the parent entry for context
  if (parentEntry > 0x10) {
    console.log('=== Context: 8 instructions before parent entry ===');
    const before = decodeRoutine(rom, parentEntry - 0x20, 8, 0x20);
    for (const item of before) {
      console.log(`${hex(item.pc)}  ${formatBytes(item.bytes).padEnd(24)}  ${item.text}`);
    }
    console.log('');
  }

  // --- 3. Find callers of parent function ---
  console.log(`=== Step 3: Callers of Parent Function ${hex(parentEntry)} ===`);
  const parentCallers = scanCallersOf(rom, parentEntry);
  if (parentCallers.length === 0) {
    console.log('  (none found — may be called indirectly or via jump table)');
  } else {
    for (const c of parentCallers) {
      console.log(`${hex(c.pc)}  ${c.mnemonic}  region=${c.region}`);
      console.log(`  decoded: ${c.decoded}`);
      console.log(`  bytes16: ${formatBytes(c.bytes)}`);
    }
  }
  console.log('');

  // --- 4. D0250F write-site scan ---
  console.log('=== Step 4: ROM-wide Writes to D0250F ===');
  const d0250fSites = scanWritesToD0250F(rom);
  console.log(`Found ${d0250fSites.length} write site(s):`);
  for (const site of d0250fSites) {
    console.log(`  ${hex(site.pc)}  ${site.type}  region=${site.region}  hint=${site.valueHint}`);
    console.log(`    context: ${site.context}`);
  }
  console.log('');

  // --- 5. Dynamic trace ---
  console.log('=== Step 5: Dynamic Trace ===');
  const { blocks, assets } = await loadBlocks();
  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
    const executor = createExecutor(blocks, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
    const cpu = executor.cpu;

    // Boot to get baseline state
    executor.runFrom(BOOT_PC, BOOT_MODE, { maxSteps: BOOT_STEPS, maxLoopIterations: BOOT_LOOP_LIMIT });
    const baseline = snapshotRuntime(cpu, mem);

    // Set up for trace
    restoreRuntime(cpu, mem, baseline);
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.im = 0;
    cpu.i = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu._ix = IX_BASE;
    cpu._iy = IY_BASE;
    cpu.a = 0;
    cpu.f = 0;
    cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, RETURN_SENTINEL);

    const traceEntry = findTraceEntry(blocks, parentEntry);
    console.log(`Trace entry: requested=${hex(parentEntry)} actual=${hex(traceEntry.pc)} delta=${traceEntry.delta}`);
    const beforePtrs = capturePointers(mem);
    console.log(`Before: D0250F=${hex(beforePtrs.d0250f, 2)} D02590=${hex(beforePtrs.d02590)} D0259A=${hex(beforePtrs.d0259a)} D0259D=${hex(beforePtrs.d0259d)}`);

    const state = { step: 0, blockPc: traceEntry.pc };
    const tracer = installWriteTracer(cpu, mem, state);
    const blockTrace = [];
    const uniqueBlocks = [];
    const seenBlocks = new Set();
    let termination = 'unknown';
    const STOP = '__RETURN_SENTINEL__';

    try {
      try {
        const result = executor.runFrom(traceEntry.pc, 'adl', {
          maxSteps: TRACE_STEPS,
          maxLoopIterations: TRACE_LOOP_LIMIT,
          onBlock(pc, mode, _meta, step) {
            state.step = step;
            state.blockPc = pc & 0xFFFFFF;
            blockTrace.push({ step, pc: pc & 0xFFFFFF, mode });
            const key = `${hex(pc)}:${mode}`;
            if (!seenBlocks.has(key)) { seenBlocks.add(key); uniqueBlocks.push(key); }
          },
          onDynamicTarget(target, mode, pc, step) {
            blockTrace.push({ step, pc: pc & 0xFFFFFF, mode, dynamic: true, target: target & 0xFFFFFF });
          },
          onMissingBlock(pc) {
            if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw new Error(STOP);
          },
        });
        termination = result.termination;
      } catch (error) {
        if (error?.message === STOP) termination = 'returned-to-sentinel';
        else throw error;
      }
    } finally {
      tracer.restore();
    }

    const afterPtrs = capturePointers(mem);
    console.log(`After:  D0250F=${hex(afterPtrs.d0250f, 2)} D02590=${hex(afterPtrs.d02590)} D0259A=${hex(afterPtrs.d0259a)} D0259D=${hex(afterPtrs.d0259d)}`);
    console.log(`Termination: ${termination}`);
    console.log(`Blocks visited: ${blockTrace.length}, unique: ${uniqueBlocks.length}`);
    console.log('');

    console.log('Block trace:');
    for (const b of blockTrace.slice(0, 80)) {
      const label = KNOWN_FNS[b.pc] ? ` ; ${KNOWN_FNS[b.pc]}` : '';
      const dyn = b.dynamic ? ` -> dynamic ${hex(b.target)}` : '';
      console.log(`  step=${String(b.step).padStart(3)} pc=${hex(b.pc)} ${b.mode}${label}${dyn}`);
    }
    if (blockTrace.length > 80) console.log(`  ... (${blockTrace.length - 80} more)`);
    console.log('');

    // Categorize writes
    const d0250fWrites = tracer.events.filter((e) => e.labels.includes('D0250F'));
    const ptrWrites = tracer.events.filter((e) => e.labels.some((l) => ['D02590', 'D0259A', 'D0259D'].includes(l)));
    const d025xxWrites = tracer.events.filter((e) => e.labels.includes('D025xx') && !e.labels.includes('D0250F') && !e.labels.some((l) => ['D02590', 'D0259A', 'D0259D'].includes(l)));
    const tableWrites = tracer.events.filter((e) => e.labels.includes('D3Fxxx'));

    printWriteSection('D0250F writes', d0250fWrites);
    console.log('');
    printWriteSection('Dispatch pointer writes (D02590/9A/9D)', ptrWrites);
    console.log('');
    printWriteSection('Other D025xx writes', d025xxWrites);
    console.log('');
    printWriteSection('D3Fxxx table writes', tableWrites);
    console.log('');

    // Summary of all CALL targets seen
    console.log('=== CALL targets in disassembly ===');
    for (const item of routine) {
      if (item.ins && (item.ins.tag === 'call' || item.ins.tag === 'call-conditional')) {
        const t = item.ins.target;
        console.log(`  ${hex(item.pc)} -> ${hex(t)}${knownLabel(t)}`);
      }
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
