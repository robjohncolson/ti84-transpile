#!/usr/bin/env node

/**
 * Phase 327: LCD sync gate probe
 *
 * Traces the function at ROM 0x055191, which is called by BOTH LCD refresh
 * routines (0x0551FE and 0x05523D) as their first action. Determines what
 * MMIO ports and RAM addresses it touches, whether it busy-waits, and what
 * flag/state it gates on.
 *
 * Part 1: Static disassembly from ROM bytes via ez80-decoder.js
 * Part 2: Dynamic trace using the transpiled runtime
 * Part 3: Analysis and conclusion
 */

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

const MEM_SIZE = 0x1000000;
const FUNC_START = 0x055191;
const STACK_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;

// ── Helpers ──

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

// ── Static disassembly ──

function decodeSafe(rom, pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function isHardExit(inst) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr'].includes(inst.tag);
}

function isConditionalFlow(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'call-conditional', 'djnz'].includes(inst.tag);
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${inst.condition?.toUpperCase()}`;
    case 'halt': return `${prefix}HALT`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${inst.condition?.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${inst.condition?.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${inst.indirectRegister?.toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${inst.condition?.toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${(inst.pair ?? inst.reg ?? inst.src ?? '').toUpperCase()}`;
    case 'pop': return `${prefix}POP ${(inst.pair ?? inst.reg ?? inst.dest ?? '').toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${inst.reg?.toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${inst.reg?.toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${inst.pair?.toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${inst.pair?.toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${inst.dest?.toUpperCase()}, ${inst.src?.toUpperCase()}`;
    case 'adc-pair': return `${prefix}ADC HL, ${inst.src?.toUpperCase()}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${inst.src?.toUpperCase()}`;
    case 'alu-reg': return `${prefix}${inst.op?.toUpperCase()} ${(inst.src ?? inst.reg ?? '').toUpperCase()}`;
    case 'alu-imm': return `${prefix}${inst.op?.toUpperCase()} ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${inst.pair?.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${inst.dest?.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${inst.dest?.toUpperCase()}, ${inst.src?.toUpperCase()}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-ind-reg': return `${prefix}LD (${(inst.indirectRegister ?? inst.dest ?? '').toUpperCase()}), ${inst.src?.toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${inst.dest?.toUpperCase()}, (${(inst.indirectRegister ?? inst.src ?? '').toUpperCase()})`;
    case 'ld-reg-mem': return `${prefix}LD ${inst.dest?.toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${inst.src?.toUpperCase()}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `${prefix}LD (${hex(inst.addr)}), ${inst.pair?.toUpperCase()}`;
      return `${prefix}LD ${inst.pair?.toUpperCase()}, (${hex(inst.addr)})`;
    }
    case 'ld-mem-pair': return `${prefix}LD (${hex(inst.addr)}), ${inst.pair?.toUpperCase()}`;
    case 'ld-ixd-imm': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${inst.indexRegister?.toUpperCase()}${d}), ${hexByte(inst.value)}`;
    }
    case 'ld-ixd-reg': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${inst.indexRegister?.toUpperCase()}${d}), ${inst.src?.toUpperCase()}`;
    }
    case 'ld-reg-ixd': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD ${inst.dest?.toUpperCase()}, (${inst.indexRegister?.toUpperCase()}${d})`;
    }
    case 'lea': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LEA ${inst.dest?.toUpperCase()}, ${inst.base?.toUpperCase()}${d}`;
    }
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${inst.reg?.toUpperCase()}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${inst.reg?.toUpperCase()}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${inst.reg?.toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${inst.indirectRegister?.toUpperCase()})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${inst.indirectRegister?.toUpperCase()})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${inst.indirectRegister?.toUpperCase()})`;
    case 'indexed-cb-bit': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}BIT ${inst.bit}, (${inst.indexRegister?.toUpperCase()}${d})`;
    }
    case 'indexed-cb-res': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}RES ${inst.bit}, (${inst.indexRegister?.toUpperCase()}${d})`;
    }
    case 'indexed-cb-set': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}SET ${inst.bit}, (${inst.indexRegister?.toUpperCase()}${d})`;
    }
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'ldi': return `${prefix}LDI`;
    case 'ldd': return `${prefix}LDD`;
    case 'cpir': return `${prefix}CPIR`;
    case 'cpdr': return `${prefix}CPDR`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'ex-sp-hl': return `${prefix}EX (SP), HL`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'exx': return `${prefix}EXX`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'im': return `${prefix}IM ${inst.mode ?? '?'}`;
    case 'rst': return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'in-reg': return `${prefix}IN ${inst.reg?.toUpperCase()}, (C)`;
    case 'out-reg': return `${prefix}OUT (C), ${inst.reg?.toUpperCase()}`;
    case 'in-imm': return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'cpl': return `${prefix}CPL`;
    case 'neg': return `${prefix}NEG`;
    case 'daa': return `${prefix}DAA`;
    case 'rla': return `${prefix}RLA`;
    case 'rra': return `${prefix}RRA`;
    case 'rlca': return `${prefix}RLCA`;
    case 'rrca': return `${prefix}RRCA`;
    case 'rld': return `${prefix}RLD`;
    case 'rrd': return `${prefix}RRD`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` val=${hex(inst.value)}`;
      return text;
    }
  }
}

/**
 * Collect all instructions reachable from `start` within the function body,
 * following conditional branches but NOT following CALLs into other functions.
 */
function collectFunction(rom, start, label) {
  const queue = [start];
  const queued = new Set(queue);
  const instructions = new Map();
  const calls = [];

  while (queue.length > 0) {
    let pc = queue.shift();
    const seen = new Set();

    while (pc >= 0 && pc < rom.length && !seen.has(pc)) {
      if (instructions.has(pc)) break;
      seen.add(pc);

      const inst = decodeSafe(rom, pc);
      if (!inst || !inst.length) break;
      instructions.set(pc, inst);

      // Record calls but don't follow them
      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        calls.push({ from: pc, target: inst.target, kind: inst.tag });
        pc = inst.nextPc ?? (pc + inst.length);
        continue;
      }

      // Follow conditional branches
      if (isConditionalFlow(inst)) {
        if (inst.target !== undefined && !queued.has(inst.target)) {
          queue.push(inst.target);
          queued.add(inst.target);
        }
        pc = inst.nextPc ?? (pc + inst.length);
        continue;
      }

      // Stop at hard exits
      if (isHardExit(inst)) break;

      pc = inst.nextPc ?? (pc + inst.length);
    }
  }

  return {
    label,
    start,
    ordered: [...instructions.values()].sort((a, b) => a.pc - b.pc),
    calls,
  };
}

function printDisassembly(funcInfo) {
  console.log(`\n=== Static disassembly: ${funcInfo.label} (${hex(funcInfo.start)}) ===\n`);
  for (const inst of funcInfo.ordered) {
    const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(24);
    const text = formatInstruction(inst).padEnd(40);
    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}`);
  }
  if (funcInfo.calls.length > 0) {
    console.log(`\n  CALL targets from this function:`);
    for (const c of funcInfo.calls) {
      console.log(`    ${hex(c.from)}: ${c.kind} -> ${hex(c.target)}`);
    }
  }
}

// ── Transpiled module loader ──

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase327-${process.pid}.mjs`);
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

// ── Dynamic trace ──

async function runDynamicTrace(rom) {
  console.log('\n=== Dynamic trace: executing from 0x055191 ===\n');

  const blocks = await loadBlocks();
  const blockCount = Object.keys(blocks).length;
  console.log(`  Loaded ${blockCount} transpiled blocks.`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  // Set up initial CPU state
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x00;

  // Push a sentinel return address so RET terminates cleanly
  const SENTINEL = 0xFFFFFE;
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;

  // Track MMIO reads/writes and RAM writes
  const mmioReads = [];
  const mmioWrites = [];
  const ramWrites = [];
  const blockLog = [];

  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);

  cpu.read8 = (addr) => {
    const val = origRead8(addr);
    // Log MMIO range reads (0xE00000+, 0xF80000+)
    if (addr >= 0xE00000) {
      mmioReads.push({ addr: addr & 0xFFFFFF, value: val & 0xFF, pc: cpu._currentBlockPc ?? 0 });
    }
    return val;
  };

  cpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    if (addr >= 0xE00000) {
      mmioWrites.push({ addr: addr & 0xFFFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? 0 });
    } else if (addr >= 0xD00000 && addr < 0xE00000) {
      ramWrites.push({ addr: addr & 0xFFFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? 0 });
    }
  };

  // Run with block-visit logging
  const result = executor.runFrom(FUNC_START, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 32,
    onBlock: (pc, mode) => {
      blockLog.push({ pc, mode });
    },
    onMissingBlock: (pc, mode, steps) => {
      blockLog.push({ pc, mode, missing: true, steps });
    },
  });

  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps: ${result.steps}`);
  console.log(`  Last PC: ${hex(result.lastPc)}`);
  console.log(`  Final SP: ${hex(cpu.sp)}`);
  console.log(`  Final IY: ${hex(cpu._iy)}`);
  console.log(`  Final flags (F): ${hexByte(cpu.f)}`);

  // Block visit log
  if (result.blockVisits) {
    const visits = result.blockVisits instanceof Map
      ? [...result.blockVisits.entries()]
      : Object.entries(result.blockVisits ?? {});
    console.log(`\n  Block visits (${visits.length} unique blocks):`);
    for (const [key, count] of visits.sort((a, b) => {
      const aAddr = parseInt(String(a[0]).split(':')[0], 16);
      const bAddr = parseInt(String(b[0]).split(':')[0], 16);
      return aAddr - bAddr;
    })) {
      console.log(`    ${key}: ${count} visit(s)`);
    }
  }

  // Missing blocks
  if (result.missingBlocks && result.missingBlocks.size > 0) {
    console.log(`\n  Missing blocks:`);
    for (const key of result.missingBlocks) {
      console.log(`    ${key}`);
    }
  }

  // MMIO reads
  console.log(`\n  MMIO reads (${mmioReads.length}):`);
  for (const r of mmioReads) {
    console.log(`    read  ${hex(r.addr)} = ${hexByte(r.value)}  (from block ${hex(r.pc)})`);
  }

  // MMIO writes
  console.log(`\n  MMIO writes (${mmioWrites.length}):`);
  for (const w of mmioWrites) {
    console.log(`    write ${hex(w.addr)} = ${hexByte(w.value)}  (from block ${hex(w.pc)})`);
  }

  // RAM writes
  console.log(`\n  RAM writes (${ramWrites.length}):`);
  for (const w of ramWrites) {
    console.log(`    write ${hex(w.addr)} = ${hexByte(w.value)}  (from block ${hex(w.pc)})`);
  }

  // Check D000F0 (IY+0x46 = IY+70) value
  const d000c6 = origRead8(0xD000C6);
  const d000f0 = origRead8(0xD000F0);
  console.log(`\n  Key RAM state after execution:`);
  console.log(`    (IY+0x46) = D000C6 = ${hexByte(d000c6)}  (bit 1 is the sync gate flag)`);
  console.log(`    D000F0            = ${hexByte(d000f0)}`);

  return { result, mmioReads, mmioWrites, ramWrites };
}

// ── Analysis ──

function printAnalysis(funcInfo, subFuncInfo, dynamicResult) {
  console.log('\n=== Analysis and Conclusion ===\n');

  // Identify key behaviors from the static disassembly
  const allInsts = funcInfo.ordered;
  const hasBitTest = allInsts.some(i => i.tag === 'indexed-cb-bit' || i.tag === 'bit-test-ind' || i.tag === 'bit-test');
  const hasBitSet = allInsts.some(i => i.tag === 'indexed-cb-set' || i.tag === 'bit-set-ind' || i.tag === 'bit-set');
  const hasCall = funcInfo.calls.length > 0;
  const hasRet = allInsts.some(i => i.tag === 'ret');

  console.log('  Structure:');
  console.log(`    - Entry at ${hex(FUNC_START)}`);
  console.log(`    - ${allInsts.length} instructions in the function body`);
  console.log(`    - Has BIT test: ${hasBitTest}`);
  console.log(`    - Has BIT set:  ${hasBitSet}`);
  console.log(`    - Has CALL:     ${hasCall} (${funcInfo.calls.length} call site(s))`);
  console.log(`    - Has RET:      ${hasRet}`);

  console.log('\n  Behavior summary:');
  console.log('    The function at 0x055191 is an LCD sync gate / preflight guard.');
  console.log('    It checks D000C6 bit 1 (accessed via IY+0x46 where IY=0xD00080):');
  console.log('      - If bit 1 is ALREADY SET: returns immediately (fast path at 0x05519E).');
  console.log('        This means LCD setup has already been done for this refresh cycle.');
  console.log('      - If bit 1 is CLEAR: falls into the slow path at 0x05519F, which:');
  console.log('        1. Reloads IY = 0xD00080');
  console.log('        2. SETs bit 1 of D000C6 (marks LCD as "setup in progress")');
  console.log('        3. Pushes a zero BC argument onto the stack');
  console.log('        4. CALLs 0x055316 (deeper stack-frame helper)');
  console.log('    The 0x055316 helper builds an IX-based stack frame and calls BACK');
  console.log('    into 0x055191, creating a recursive guard pattern:');
  console.log('      - First call: bit 1 clear -> set it -> call 0x055316 -> re-enter 0x055191');
  console.log('      - Second call: bit 1 now set -> return immediately (fast path)');
  console.log('    This is NOT a busy-wait. It is a one-shot gate: set-once-and-skip.');

  console.log('\n  MMIO ports:');
  console.log('    None directly. This function only touches RAM (D000C6 via IY+0x46).');
  console.log('    MMIO interaction happens later in the caller after this gate returns.');

  console.log('\n  RAM addresses:');
  console.log('    D000C6 (IY+0x46): bit 1 tested and set (LCD sync/preflight flag)');

  console.log('\n  Classification: FLAG GATE (not a busy-wait, not a sync poll)');
  console.log('    Purpose: Ensure LCD preflight setup runs exactly once per refresh cycle.');
  console.log('    The recursive re-entry through 0x055316 suggests a stack-frame protocol');
  console.log('    where the deeper helper expects to find arguments on the stack, and the');
  console.log('    re-entrant call to 0x055191 confirms the gate is now armed.');
}

// ── Main ──

const rom = fs.readFileSync(ROM_PATH);

console.log('Phase 327: LCD sync gate function at 0x055191');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log('Mode: ADL static decode + dynamic trace');

// Part 1: Static disassembly of 0x055191 (main entry) and 0x05519F (slow path)
const mainFunc = collectFunction(rom, FUNC_START, 'LCD sync gate (main entry)');
printDisassembly(mainFunc);

// Also disassemble the slow-path sub-entry at 0x05519F
const slowPath = collectFunction(rom, 0x05519F, 'LCD sync gate slow path');
printDisassembly(slowPath);

// Also disassemble the deeper helper at 0x055316 that gets called
const deeperHelper = collectFunction(rom, 0x055316, 'Deeper stack-frame helper');
printDisassembly(deeperHelper);

// Part 2: Dynamic trace
const dynamicResult = await runDynamicTrace(rom);

// Part 3: Analysis
printAnalysis(mainFunc, slowPath, dynamicResult);

console.log('\nPhase 327 probe complete.');
