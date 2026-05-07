#!/usr/bin/env node

/**
 * Phase 209 — Triple BufInsert investigation
 *
 * Three consecutive CALL 0x05E2A0 sites at 0x08DCE6, 0x08DCEB, 0x08DCF3.
 * Hypothesis: multi-token string builder inserting prefix + body + suffix
 * for 2-byte function tokens (e.g. "sin(" = [0xBB, body, 0x10]).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = readFileSync(path.join(__dirname, 'ROM.rom'));

const BUF_INSERT = 0x05E2A0;
const SITE_A = 0x08DCE6;
const SITE_B = 0x08DCEB;
const SITE_C = 0x08DCF3;
const DISASM_START = 0x08DCC0;
const DISASM_END = 0x08DD10;

const EDIT_BUF = 0xD00A00;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MEM_SIZE = 0x1000000;

const TRACE_MAX_STEPS = 500;
const SEGMENT_STEP_LIMIT = 200;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') {
        return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
      }
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-ind': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-pair': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-load-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-store-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    }
    case 'indexed-store-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
    }
    case 'indexed-alu': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-inc': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}INC (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-dec': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}DEC (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    default: return `${prefix}${inst.tag}`;
  }
}

// -------------------------------------------------------------------
// Part 1: Static disassembly of 0x08DCC0 through 0x08DD10
// -------------------------------------------------------------------
function disassembleRegion(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < 128) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst.length ?? 1);
    const rawBytes = bytesToHex(rom.slice(pc, pc + len));
    const text = formatInstruction(inst);
    let annotation = '';
    if (inst.tag === 'call' && inst.target === BUF_INSERT) annotation = ' <<< BufInsert';
    if (pc === SITE_A) annotation += ' [SITE_A]';
    if (pc === SITE_B) annotation += ' [SITE_B]';
    if (pc === SITE_C) annotation += ' [SITE_C]';
    rows.push({
      addr: hex(pc),
      bytes: rawBytes.padEnd(16, ' '),
      asm: text + annotation,
    });
    pc += len;
  }
  return rows;
}

// -------------------------------------------------------------------
// Part 2: Block entry search
// -------------------------------------------------------------------
function findBlockEntry() {
  const candidates = [
    '08dce6:adl', '08dce0:adl', '08dcd0:adl', '08dcc0:adl',
    '08dcb0:adl', '08dca0:adl', '08dc90:adl', '08dc80:adl',
    '08dc70:adl', '08dc60:adl', '08dc50:adl', '08dc40:adl',
  ];
  const found = [];
  for (const key of candidates) {
    if (BLOCKS[key]) {
      found.push(key);
    }
  }
  return { candidates, found };
}

// -------------------------------------------------------------------
// Part 3 & 4: Trace execution, monitor BufInsert calls
// -------------------------------------------------------------------
function makeStop(name, pc) {
  const error = new Error('__PHASE209_STOP__');
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function runTrace(executor, cpu, mem, entryPc, entryMode) {
  const blocksVisited = [];
  const bufInsertCalls = [];
  let totalSteps = 0;
  let termination = null;
  let lastPc = entryPc;
  let lastMode = entryMode;
  let errorMessage = null;

  const sentinels = new Map([
    [RETURN_SENTINEL, 'return-sentinel'],
  ]);

  let currentPc = entryPc;
  let currentMode = entryMode;

  while (totalSteps < TRACE_MAX_STEPS) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: 200,
        onBlock(pc, dispatchMode, meta, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;

          blocksVisited.push(hex(norm));

          // Monitor BufInsert calls
          if (norm === BUF_INSERT) {
            bufInsertCalls.push({
              callNumber: bufInsertCalls.length + 1,
              step: totalSteps + localStep,
              DE: hex(cpu._de, 6),
              D: hexByte((cpu._de >> 8) & 0xFF),
              E: hexByte(cpu._de & 0xFF),
              A: hexByte(cpu.a),
              HL: hex(cpu._hl, 6),
            });
          }

          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          blocksVisited.push(`MISSING:${hex(norm)}`);
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentObservedSteps;
      if (error?.message === '__PHASE209_STOP__') {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.message ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (termination === 'max_steps' && totalSteps >= TRACE_MAX_STEPS) {
    termination = 'step_limit';
  }

  return {
    totalSteps,
    termination,
    lastPc: hex(lastPc),
    lastMode,
    blocksVisited: blocksVisited.slice(0, 80),
    blocksVisitedCount: blocksVisited.length,
    bufInsertCalls,
    error: errorMessage,
  };
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------
function main() {
  const results = {};

  // Part 1: Static disassembly
  const disasmRows = disassembleRegion(romBytes, DISASM_START, DISASM_END);
  results.disassembly = {
    range: `${hex(DISASM_START)} - ${hex(DISASM_END)}`,
    instructions: disasmRows,
  };

  // Verify the 3 sites are actually CALL 0x05E2A0
  const callPattern = [0xCD, 0xA0, 0xE2, 0x05];
  results.verification = {
    siteA: {
      addr: hex(SITE_A),
      bytes: bytesToHex(romBytes.slice(SITE_A, SITE_A + 4)),
      isBufInsert: callPattern.every((b, i) => romBytes[SITE_A + i] === b),
    },
    siteB: {
      addr: hex(SITE_B),
      bytes: bytesToHex(romBytes.slice(SITE_B, SITE_B + 4)),
      isBufInsert: callPattern.every((b, i) => romBytes[SITE_B + i] === b),
    },
    siteC: {
      addr: hex(SITE_C),
      bytes: bytesToHex(romBytes.slice(SITE_C, SITE_C + 4)),
      isBufInsert: callPattern.every((b, i) => romBytes[SITE_C + i] === b),
    },
  };

  // Part 2: Block entry search
  const blockSearch = findBlockEntry();
  results.blockSearch = blockSearch;

  // Part 3 & 4: Trace execution
  const entryKey = blockSearch.found.length > 0 ? blockSearch.found[0] : null;

  if (entryKey) {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    // Initialize CPU state
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu._iy = 0xD00080;
    cpu.sp = STACK_TOP - 3;
    write24(mem, cpu.sp, RETURN_SENTINEL);

    // Set up edit buffer area (zero it)
    for (let i = 0; i < 32; i++) {
      mem[EDIT_BUF + i] = 0x00;
    }

    // Pre-load registers for 2-byte token scenario
    // A=0x62 (matrix prefix), try loading DE with token values
    cpu.a = 0x62;
    cpu._de = 0x000062; // DE = prefix byte (will be overwritten by block logic)
    cpu._hl = EDIT_BUF;  // HL = edit buffer cursor
    cpu._bc = 0x000110;  // B=0x01 body, C=0x10 "("

    const entryPc = parseInt(entryKey.split(':')[0], 16);
    const entryMode = entryKey.split(':')[1] || 'adl';

    const traceResult = runTrace(executor, cpu, mem, entryPc, entryMode);
    results.trace = traceResult;

    // Part 5: Dump edit buffer after trace
    const bufDump = [];
    for (let i = 0; i < 16; i++) {
      bufDump.push(hexByte(mem[EDIT_BUF + i]));
    }
    results.editBufferAfterTrace = {
      range: `${hex(EDIT_BUF)} - ${hex(EDIT_BUF + 0x10)}`,
      bytes: bufDump.join(' '),
    };
  } else {
    results.trace = { error: 'No matching block found', searched: blockSearch.candidates };
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
