#!/usr/bin/env node

// Phase 202: Digit Token Dispatch Path
// Which of the 5 BufInsert call sites handles digit keypresses?
//
// 1. Static disassembly of ±30 bytes around each BufInsert call site
// 2. Dynamic trace from 0x0584A7 (KeyClassifier call) with digit-4 token
// 3. Fallback entries at 0x058514, 0x058518, 0x05851C if BufInsert not reached

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction as dec } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Paths ---
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');

// --- Constants ---
const MEM_SIZE = 0x1000000;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const EDIT_BUF_ADDR = 0xD00A00;
const EDIT_BUF_SIZE = 0x100;
const TOKEN_LENGTH = 9;

const BUF_INSERT = 0x05E2A0;
const BUF_INSERT_CALL_SITES = [0x058520, 0x05852A, 0x05853C, 0x0585AD, 0x0585CA];

const DIGIT_4_TOKEN = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;

// --- Helpers ---
const hex = (v, w = 6) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
};
const hexByte = (v) => hex((v ?? 0) & 0xFF, 2);
const bytesHex = (mem, start, len) =>
  Array.from(mem.slice(start, start + len), (b) => hexByte(b)).join(' ');

function write24(mem, addr, val) {
  const a = addr & 0xFFFFFF;
  mem[a] = val & 0xFF;
  mem[a + 1] = (val >>> 8) & 0xFF;
  mem[a + 2] = (val >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return (mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16)) >>> 0;
}

// --- Disassembly formatting ---
function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function fmtInst(inst) {
  if (!inst) return 'decode-error';
  const d = (n) => n >= 0 ? `+${n}` : `${n}`;
  const m = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${m}call ${hex(inst.target)}`;
    case 'call-conditional': return `${m}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${m}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${m}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${m}jp (${inst.indirectRegister})`;
    case 'jr': return `${m}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${m}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${m}djnz ${hex(inst.target)}`;
    case 'ret': return `${m}ret`;
    case 'ret-conditional': return `${m}ret ${inst.condition}`;
    case 'push': return `${m}push ${inst.pair}`;
    case 'pop': return `${m}pop ${inst.pair}`;
    case 'inc-pair': return `${m}inc ${inst.pair}`;
    case 'dec-pair': return `${m}dec ${inst.pair}`;
    case 'inc-reg': return `${m}inc ${inst.reg}`;
    case 'dec-reg': return `${m}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${m}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${m}ld ${inst.pair}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${m}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${m}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${m}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${m}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${m}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${m}ld ${inst.dest}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${m}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${m}ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${m}ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-res': return `${m}res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-set': return `${m}set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-bit': return `${m}bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'alu-imm': return `${m}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${m}${inst.op} ${inst.src}`;
    case 'rst': return `${m}rst ${hexByte(inst.target)}`;
    default: return `${m}${inst.tag}`;
  }
}

function disRange(rom, start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = dec(rom, pc, 'adl');
      const rawBytes = Array.from(rom.slice(pc, pc + inst.length), (b) =>
        b.toString(16).toUpperCase().padStart(2, '0')
      ).join(' ');
      rows.push({ pc: hex(inst.pc), bytes: rawBytes, text: fmtInst(inst), length: inst.length, inst });
      pc += inst.length;
    } catch (e) {
      rows.push({ pc: hex(pc), bytes: rom[pc].toString(16).toUpperCase().padStart(2, '0'), text: `decode-error: ${e.message}`, length: 1, inst: null });
      pc += 1;
    }
  }
  return rows;
}

// --- ROM load ---
if (!fs.existsSync(TRANSPILED_JS_PATH)) {
  throw new Error('Missing ROM.transpiled.js. Run: node scripts/transpile-ti84-rom.mjs');
}
const rom = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_JS_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ==========================================================================
// PART 1: Static disassembly around the 5 BufInsert call sites
// ==========================================================================
function staticDisassembly() {
  const results = {};
  for (const site of BUF_INSERT_CALL_SITES) {
    const start = Math.max(0, site - 30);
    const end = Math.min(rom.length, site + 30);
    const rows = disRange(rom, start, end);

    // Find which row contains the call site address
    const siteRows = rows.map((r) => ({
      pc: r.pc,
      bytes: r.bytes,
      text: r.text,
      isCallSite: parseInt(r.pc.slice(2), 16) === site,
    }));

    results[hex(site)] = siteRows;
  }
  return results;
}

// ==========================================================================
// PART 2-4: Dynamic trace experiments
// ==========================================================================
function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem) {
  const romBytes = fs.readFileSync(ROM_PATH);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x60), Math.min(mem.length, STACK_TOP + 0x20));
}

function createCPU(mem, peripherals) {
  const executor = cpuRuntime.createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  try {
    const result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw Object.assign(new Error('__SENTINEL__'), { isSentinel: true, hit: 'memInitRet' });
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw Object.assign(new Error('__SENTINEL__'), { isSentinel: true, hit: 'memInitRet' });
        }
      },
    });
    return result;
  } catch (e) {
    if (e?.isSentinel) return { hit: e.hit, termination: 'sentinel' };
    throw e;
  }
}

function createBaseline() {
  const mem = createMemory();
  loadROM(mem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  cpu.mbase = MBASE;
  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  return new Uint8Array(mem);
}

function setupDigitToken(cpu, mem) {
  // Set OP1 = digit-4 token
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  mem.set(DIGIT_4_TOKEN, OP1_ADDR);

  // Set TOKEN_STAGING = same
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.set(DIGIT_4_TOKEN, TOKEN_STAGING_ADDR);

  // Initialize edit buffer area
  mem.fill(0x00, EDIT_BUF_ADDR, EDIT_BUF_ADDR + EDIT_BUF_SIZE);

  // CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = STACK_TOP;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x60), Math.min(mem.length, STACK_TOP + 0x20));
}

function runTrace(executor, cpu, mem, entryPoint, maxSteps) {
  // Push a return sentinel so RET at top level stops execution
  const SENTINEL_RET = 0x7FFFF0;
  cpu.sp -= 3;
  write24(mem, cpu.sp, SENTINEL_RET);

  const blocksVisited = [];
  const blockSet = new Set();
  const callsFound = [];
  const missingBlocks = [];
  const editBufWrites = [];
  let bufInsertReached = false;
  let bufInsertCallSiteHit = null;
  let lastCallAddr = null;

  // Snapshot edit buffer before
  const editBufBefore = bytesHex(mem, EDIT_BUF_ADDR, 32);

  let finalPc = entryPoint;
  let finalTermination = 'unknown';
  let finalError = null;
  let steps = 0;

  try {
    const result = executor.runFrom(entryPoint, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const normPc = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        finalPc = normPc;

        // Log unique blocks
        const pcHex = hex(normPc);
        if (!blockSet.has(pcHex)) {
          blockSet.add(pcHex);
          blocksVisited.push({ step: steps, pc: pcHex, mode: mode ?? 'adl' });
        }

        // Check for BufInsert
        if (normPc === BUF_INSERT) {
          bufInsertReached = true;
          // The call came from lastCallAddr
          bufInsertCallSiteHit = lastCallAddr;
        }

        // Check for sentinel return address
        if (normPc === SENTINEL_RET) {
          throw Object.assign(new Error('__RET_SENTINEL__'), { isSentinel: true, hit: 'ret' });
        }

        // Detect CALL instructions by reading ROM bytes at this block start
        // We check if any of the 5 BufInsert call sites are in this block
        for (const site of BUF_INSERT_CALL_SITES) {
          if (normPc <= site && site < normPc + 20) {
            // This block might contain the call site
          }
        }

        // Track CALL instructions: decode a few instructions from this block
        try {
          let scanPc = normPc;
          for (let i = 0; i < 10 && scanPc < normPc + 40; i++) {
            const inst = dec(rom, scanPc, 'adl');
            if (inst.tag === 'call' || inst.tag === 'call-conditional') {
              const callInfo = { from: hex(scanPc), target: hex(inst.target), text: fmtInst(inst) };
              if (callsFound.length < 200) callsFound.push(callInfo);
              if (inst.target === BUF_INSERT) {
                lastCallAddr = hex(scanPc);
              }
            }
            scanPc += inst.length;
          }
        } catch (_) {
          // decode error in scan, skip
        }
      },
      onMissingBlock(pc, mode, step) {
        const normPc = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        finalPc = normPc;
        if (missingBlocks.length < 50) {
          missingBlocks.push({ step: steps, pc: hex(normPc), mode: mode ?? 'adl' });
        }

        if (normPc === BUF_INSERT) {
          bufInsertReached = true;
          bufInsertCallSiteHit = lastCallAddr;
        }
        if (normPc === SENTINEL_RET) {
          throw Object.assign(new Error('__RET_SENTINEL__'), { isSentinel: true, hit: 'ret' });
        }
      },
    });

    finalTermination = result.termination ?? 'unknown';
    finalPc = (result.lastPc ?? finalPc) & 0xFFFFFF;
    steps = Math.max(steps, result.steps ?? 0);
  } catch (e) {
    if (e?.isSentinel) {
      finalTermination = 'sentinel_ret';
    } else {
      finalTermination = 'exception';
      finalError = e?.message ?? String(e);
    }
  }

  // Check edit buffer after
  const editBufAfter = bytesHex(mem, EDIT_BUF_ADDR, 32);
  const editBufChanged = editBufBefore !== editBufAfter;

  return {
    entryPoint: hex(entryPoint),
    maxSteps,
    steps,
    termination: finalTermination,
    finalPc: hex(finalPc),
    finalError,
    bufInsertReached,
    bufInsertCallSiteHit,
    blocksVisited: blocksVisited.length,
    blockTrace: blocksVisited.slice(0, 100),
    callsFound,
    missingBlocks,
    editBufBefore,
    editBufAfter,
    editBufChanged,
    op1After: bytesHex(mem, OP1_ADDR, TOKEN_LENGTH),
    tokenStagingAfter: bytesHex(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    cpuState: {
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      bc: hex(cpu._bc ?? ((cpu.b << 8) | cpu.c)),
      de: hex(cpu._de ?? ((cpu.d << 8) | cpu.e)),
      hl: hex(cpu._hl ?? ((cpu.h << 8) | cpu.l)),
      sp: hex(cpu.sp),
      ix: hex(cpu._ix ?? cpu.ix),
      iy: hex(cpu._iy ?? cpu.iy),
    },
  };
}

// ==========================================================================
// Main
// ==========================================================================
function main() {
  console.error('Phase 202: Building baseline...');
  const baselineMem = createBaseline();

  // Part 1: Static disassembly
  console.error('Phase 202: Static disassembly of BufInsert call sites...');
  const disasm = staticDisassembly();

  // Part 2: Trace from 0x0584A7
  console.error('Phase 202: Trace from 0x0584A7 (KeyClassifier call)...');
  const traceEntries = [
    { label: 'keyClassifier_call', entry: 0x0584A7, maxSteps: 500 },
  ];

  const traceResults = {};
  for (const { label, entry, maxSteps } of traceEntries) {
    const mem = new Uint8Array(baselineMem);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const { cpu, executor } = createCPU(mem, peripherals);
    setupDigitToken(cpu, mem);
    traceResults[label] = runTrace(executor, cpu, mem, entry, maxSteps);
  }

  // Part 3: If BufInsert not reached, try 0x058514
  if (!traceResults.keyClassifier_call.bufInsertReached) {
    console.error('Phase 202: BufInsert not reached from 0x0584A7, trying 0x058514...');
    const mem = new Uint8Array(baselineMem);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const { cpu, executor } = createCPU(mem, peripherals);
    setupDigitToken(cpu, mem);
    traceResults.post_bit5_branch = runTrace(executor, cpu, mem, 0x058514, 500);
  }

  // Part 4: If still not reached, try 0x058518 and 0x05851C
  const bit5Reached = traceResults.post_bit5_branch?.bufInsertReached ?? false;
  if (!traceResults.keyClassifier_call.bufInsertReached && !bit5Reached) {
    console.error('Phase 202: Trying 0x058518 and 0x05851C...');

    for (const [label, addr] of [['entry_058518', 0x058518], ['entry_05851C', 0x05851C]]) {
      const mem = new Uint8Array(baselineMem);
      const peripherals = createPeripheralBus({ timerInterrupt: false });
      const { cpu, executor } = createCPU(mem, peripherals);
      setupDigitToken(cpu, mem);
      traceResults[label] = runTrace(executor, cpu, mem, addr, 200);
    }
  }

  // Output
  const output = {
    probe: 'phase202-digit-bufinsert-path',
    generatedAt: new Date().toISOString(),
    staticDisassembly: disasm,
    traceResults,
    summary: {
      bufInsertReachedFrom: null,
      callSiteHit: null,
    },
  };

  // Determine which trace reached BufInsert
  for (const [label, result] of Object.entries(traceResults)) {
    if (result.bufInsertReached) {
      output.summary.bufInsertReachedFrom = label;
      output.summary.callSiteHit = result.bufInsertCallSiteHit;
      break;
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

try {
  main();
} catch (e) {
  console.error('Phase 202 FATAL:', e);
  process.exit(1);
}
