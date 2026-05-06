#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;

// Boot / init addresses
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;

// Key investigation targets
const COORMON_ENTRY = 0x06edfe;
const HOME_HANDLER_BODY = 0x0582b8;
const HOME_HANDLER_END = 0x058700;
const KEY_CLASSIFIER = 0x07f7bd;
const COPY9_CALL = 0x07f9fb;
const TOKEN_VALIDATOR = 0x09927f;
const BUF_INSERT = 0x05e2a0;
const JERROR_ENTRY = 0x061db2;
const JERROR_ALT = 0x061d3a;
const JERROR_ALT2 = 0x061d42;

// cxMain structure (session 187)
const CX_MAIN = 0x0585e9;
const CX_PPUTAWAY = 0x058b19;
const JP_HL_DISPATCH = 0x0585d3;

// Interesting pre-0x0584A3 region
const PRE_COPY9_START = 0x058400;
const PRE_COPY9_END = 0x0584a3;

// OS state
const MBASE = 0xd0;
const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const STACK_TOP = 0xd1a87e;
const OP1_ADDR = 0xd005f8;
const TOKEN_STAGING = 0xd0230e;
const KBD_KEY = 0xd0058c;
const KBD_SCAN = 0xd0058e;

const MEM_INIT_RET = 0x7ffff6;
const RETURN_SENTINEL = 0x7fffe0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const DISASM_COUNT_COORMON = 120;
const DISASM_COUNT_HOME = 200;
const TRACE_STEP_LIMIT = 500;

// --- Utility helpers ---

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return (mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16)) >>> 0;
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function bytesToHexArray(mem, start, length) {
  const out = [];
  for (let i = 0; i < length; i++) {
    out.push(hexByte(mem[(start + i) & 0xffffff]));
  }
  return out;
}

function memAddr(inst, mbase = MBASE) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((mbase & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const d = (n) => (n >= 0 ? `+${n}` : `${n}`);
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
    case 'reti': return `${m}reti`;
    case 'push': return `${m}push ${inst.pair}`;
    case 'pop': return `${m}pop ${inst.pair}`;
    case 'ex-de-hl': return `${m}ex de, hl`;
    case 'exx': return `${m}exx`;
    case 'inc-pair': return `${m}inc ${inst.pair}`;
    case 'dec-pair': return `${m}dec ${inst.pair}`;
    case 'inc-reg': return `${m}inc ${inst.reg}`;
    case 'dec-reg': return `${m}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${m}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${m}ld ${inst.pair}, (${hex(memAddr(inst))})`;
    case 'ld-mem-pair': return `${m}ld (${hex(memAddr(inst))}), ${inst.pair}`;
    case 'ld-reg-imm': return `${m}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${m}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${m}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${m}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${m}ld ${inst.dest}, (${hex(memAddr(inst))})`;
    case 'ld-mem-reg': return `${m}ld (${hex(memAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${m}ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${m}ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-res': return `${m}res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-set': return `${m}set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-bit': return `${m}bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'alu-imm': return `${m}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${m}${inst.op} ${inst.src}`;
    case 'ld-sp-hl': return `${m}ld sp, hl`;
    case 'ld-sp-ix': return `${m}ld sp, ix`;
    case 'ld-sp-iy': return `${m}ld sp, iy`;
    case 'add-hl-pair': return `${m}add hl, ${inst.pair}`;
    case 'sbc-hl-pair': return `${m}sbc hl, ${inst.pair}`;
    case 'adc-hl-pair': return `${m}adc hl, ${inst.pair}`;
    case 'ldir': return `${m}ldir`;
    case 'lddr': return `${m}lddr`;
    case 'rst': return `${m}rst ${hex(inst.target, 2)}`;
    case 'nop': return `${m}nop`;
    case 'di': return `${m}di`;
    case 'ei': return `${m}ei`;
    case 'halt': return `${m}halt`;
    case 'or-reg': return `${m}or ${inst.src}`;
    case 'and-reg': return `${m}and ${inst.src}`;
    case 'xor-reg': return `${m}xor ${inst.src}`;
    case 'bit': return `${m}bit ${inst.bit}, ${inst.src}`;
    case 'set': return `${m}set ${inst.bit}, ${inst.src}`;
    case 'res': return `${m}res ${inst.bit}, ${inst.src}`;
    default: return `${m}${inst.tag}`;
  }
}

// --- Disassembly ---

function decodeSequential(startPc, maxInstructions, stopOnRet = false) {
  const rows = [];
  let pc = startPc & 0xffffff;
  for (let i = 0; i < maxInstructions; i++) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const isRet = inst.tag === 'ret' || inst.tag === 'ret-conditional';
      rows.push({
        pcValue: inst.pc >>> 0,
        pc: hex(inst.pc),
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        op: inst.op ?? null,
        condition: inst.condition ?? null,
        targetValue: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
        target: Number.isInteger(inst.target) ? hex(inst.target) : null,
        length: inst.length,
        value: inst.value ?? null,
        bit: inst.bit ?? null,
        displacement: inst.displacement ?? null,
        indirectRegister: inst.indirectRegister ?? null,
        addr: memAddr(inst),
      });
      pc = (inst.pc + inst.length) & 0xffffff;
      if (stopOnRet && isRet) break;
    } catch (err) {
      rows.push({
        pcValue: pc,
        pc: hex(pc),
        bytes: bytesFor(rom, pc, 1),
        text: `decode error: ${err.message}`,
        tag: 'decode-error',
        op: null,
        condition: null,
        targetValue: null,
        target: null,
        length: 1,
        value: null,
        bit: null,
        displacement: null,
        indirectRegister: null,
        addr: null,
      });
      pc = (pc + 1) & 0xffffff;
    }
  }
  return rows;
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xffffff;
  const stop = endPc & 0xffffff;
  while (pc < stop) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pcValue: inst.pc >>> 0,
        pc: hex(inst.pc),
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        op: inst.op ?? null,
        condition: inst.condition ?? null,
        targetValue: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
        target: Number.isInteger(inst.target) ? hex(inst.target) : null,
        length: inst.length,
        addr: memAddr(inst),
      });
      pc = (inst.pc + inst.length) & 0xffffff;
    } catch (err) {
      rows.push({
        pcValue: pc,
        pc: hex(pc),
        bytes: bytesFor(rom, pc, 1),
        text: `decode error: ${err.message}`,
        tag: 'decode-error',
        op: null,
        condition: null,
        targetValue: null,
        target: null,
        length: 1,
        addr: null,
      });
      pc = (pc + 1) & 0xffffff;
    }
  }
  return rows;
}

// --- Analysis helpers ---

function findCpBranches(rows) {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.tag === 'alu-imm' && row.op === 'cp') {
      for (let j = i + 1; j < Math.min(rows.length, i + 4); j++) {
        const next = rows[j];
        if (['jr-conditional', 'jp-conditional', 'call-conditional', 'ret-conditional'].includes(next.tag)) {
          results.push({
            comparePc: row.pc,
            compareText: row.text,
            compareValue: row.value,
            branchPc: next.pc,
            branchText: next.text,
            branchTarget: next.target,
            branchCondition: next.condition,
          });
          break;
        }
        if (['jp', 'jr', 'call', 'ret', 'jp-indirect'].includes(next.tag)) break;
      }
    }
  }
  return results;
}

function findIndirectJumps(rows) {
  return rows
    .filter((r) => r.tag === 'jp-indirect')
    .map((r) => ({ pc: r.pc, text: r.text, register: r.indirectRegister }));
}

function findCallTargets(rows) {
  const targets = new Map();
  for (const row of rows) {
    if ((row.tag === 'call' || row.tag === 'call-conditional') && row.targetValue !== null) {
      const existing = targets.get(row.targetValue) ?? { target: row.target, callers: [] };
      existing.callers.push(row.pc);
      targets.set(row.targetValue, existing);
    }
  }
  return [...targets.values()];
}

function findJumpTargets(rows) {
  const targets = new Map();
  for (const row of rows) {
    if (['jp', 'jp-conditional', 'jr', 'jr-conditional'].includes(row.tag) && row.targetValue !== null) {
      const existing = targets.get(row.targetValue) ?? { target: row.target, sources: [], conditions: [] };
      existing.sources.push(row.pc);
      if (row.condition) existing.conditions.push(row.condition);
      targets.set(row.targetValue, existing);
    }
  }
  return [...targets.values()];
}

function findMemoryRefs(rows, addresses) {
  return rows
    .filter((r) => r.addr !== null && addresses.includes(r.addr))
    .map((r) => ({ pc: r.pc, addr: hex(r.addr), text: r.text }));
}

function findBitOps(rows) {
  return rows
    .filter((r) => ['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(r.tag))
    .map((r) => ({ pc: r.pc, text: r.text, bit: r.bit, displacement: r.displacement }));
}

// --- Pointer table scan ---

function scan24BitPointerTable(startPc, maxEntries) {
  const entries = [];
  for (let i = 0; i < maxEntries; i++) {
    const addr = startPc + i * 3;
    const value = (rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16)) >>> 0;
    if (value === 0 || value === 0xffffff) break;
    entries.push({ index: i, offset: hex(addr), value: hex(value) });
  }
  return entries;
}

// --- Boot / baseline ---

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem) {
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return rom.length;
}

function createCPU(mem, peripherals) {
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xff, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x40));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__RET__'); },
    });
  } catch (err) {
    if (err?.message === '__RET__') returned = true;
    else throw err;
  }
  return { returned };
}

function createBaseline() {
  const mem = createMemory();
  loadROM(mem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  cpu.mbase = MBASE;
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return { mem: new Uint8Array(mem), memInitReturned: memInit.returned };
}

// --- Execution trace ---

function makeSentinelError(hit, pc) {
  const err = new Error('__SENTINEL__');
  err.isSentinel = true;
  err.hit = hit;
  err.pc = pc & 0xffffff;
  return err;
}

function traceFrom(baselineMem, entry, setupFn, sentinels, maxSteps) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);

  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  if (setupFn) setupFn(cpu, mem);

  const allSentinels = { ret: RETURN_SENTINEL, ...sentinels };

  const blockLog = [];
  const uniqueBlocks = new Set();
  const notableHits = [];

  let steps = 0;
  let lastPc = entry;
  let lastMode = 'adl';
  let hitName = null;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const p = pc & 0xffffff;
        lastPc = p;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        uniqueBlocks.add(p);
        blockLog.push({
          step: (step ?? 0) + 1,
          pc: hex(p),
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          hl: hex(cpu.hl),
          de: hex(cpu.de),
          bc: hex(cpu.bc),
          sp: hex(cpu.sp),
        });
        for (const [name, target] of Object.entries(allSentinels)) {
          if (p === target) throw makeSentinelError(name, p);
        }
      },
      onMissingBlock(pc, mode, step) {
        const p = pc & 0xffffff;
        lastPc = p;
        steps = Math.max(steps, (step ?? 0) + 1);
        blockLog.push({
          step: (step ?? 0) + 1,
          pc: hex(p),
          missing: true,
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          hl: hex(cpu.hl),
          sp: hex(cpu.sp),
        });
        for (const [name, target] of Object.entries(allSentinels)) {
          if (p === target) throw makeSentinelError(name, p);
        }
      },
    });
    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: hex((result.lastPc ?? lastPc) & 0xffffff),
      termination: result.termination ?? 'unknown',
      blockLog,
      uniqueBlockCount: uniqueBlocks.size,
      uniqueBlocks: [...uniqueBlocks].map((p) => hex(p)),
      cpu: {
        a: hexByte(cpu.a),
        f: hexByte(cpu.f),
        bc: hex(cpu.bc),
        de: hex(cpu.de),
        hl: hex(cpu.hl),
        sp: hex(cpu.sp),
      },
    };
  } catch (err) {
    if (err?.isSentinel) {
      return {
        hit: err.hit,
        steps,
        lastPc: hex(err.pc),
        termination: 'sentinel',
        blockLog,
        uniqueBlockCount: uniqueBlocks.size,
        uniqueBlocks: [...uniqueBlocks].map((p) => hex(p)),
        cpu: {
          a: hexByte(cpu.a),
          f: hexByte(cpu.f),
          bc: hex(cpu.bc),
          de: hex(cpu.de),
          hl: hex(cpu.hl),
          sp: hex(cpu.sp),
        },
      };
    }
    return {
      hit: null,
      steps,
      lastPc: hex(lastPc),
      termination: 'exception',
      error: err?.message ?? String(err),
      blockLog,
      uniqueBlockCount: uniqueBlocks.size,
      uniqueBlocks: [...uniqueBlocks].map((p) => hex(p)),
    };
  }
}

// --- Main ---

function main() {
  // ====== PART 1: Static disassembly of CoorMon entry 0x06EDFE ======

  const coormonRows = decodeSequential(COORMON_ENTRY, DISASM_COUNT_COORMON, false);
  const coormonCpBranches = findCpBranches(coormonRows);
  const coormonIndirectJumps = findIndirectJumps(coormonRows);
  const coormonCalls = findCallTargets(coormonRows);
  const coormonJumps = findJumpTargets(coormonRows);
  const coormonBitOps = findBitOps(coormonRows);

  // ====== PART 2: Home handler pre-Copy9 region (0x058400-0x0584A3) ======

  const preCopy9Rows = decodeRange(PRE_COPY9_START, PRE_COPY9_END);
  const preCopy9CpBranches = findCpBranches(preCopy9Rows);
  const preCopy9IndirectJumps = findIndirectJumps(preCopy9Rows);
  const preCopy9BitOps = findBitOps(preCopy9Rows);
  const preCopy9MemRefs = findMemoryRefs(preCopy9Rows, [
    KBD_KEY, KBD_SCAN, TOKEN_STAGING, TOKEN_STAGING + 1,
    0xd000c4, // IY+0x44
  ]);

  // ====== PART 3: Wider home handler (0x0582B8-0x058700) looking for digit bypass ======

  const homeRows = decodeRange(HOME_HANDLER_BODY, HOME_HANDLER_END);
  const homeCpBranches = findCpBranches(homeRows);
  const homeIndirectJumps = findIndirectJumps(homeRows);
  const homeBufInsertCalls = homeRows
    .filter((r) => (r.tag === 'call' || r.tag === 'call-conditional') && r.targetValue === BUF_INSERT)
    .map((r) => ({ pc: r.pc, text: r.text }));

  // All call sites to 0x09927F (token validator)
  const homeTokenValidatorCalls = homeRows
    .filter((r) => (r.tag === 'call' || r.tag === 'call-conditional') && r.targetValue === TOKEN_VALIDATOR)
    .map((r) => ({ pc: r.pc, text: r.text }));

  // ====== PART 4: JP (HL) dispatch at 0x0585D3 and cxMain structure ======

  const dispatchRows = decodeSequential(JP_HL_DISPATCH, 30, false);

  // Read the cxMain pointer table starting at 0x0585E9
  const cxMainTable = scan24BitPointerTable(CX_MAIN, 20);

  // ====== PART 5: Disassemble around 0x0584A7 (KeyClassifier call) to see full branch logic ======

  const keyClassifierRegion = decodeRange(0x058490, 0x058550);
  const keyClassifierCpBranches = findCpBranches(keyClassifierRegion);

  // ====== PART 6: Look for ConvKeyToTok and key classification ======
  // Check if CoorMon calls ConvKeyToTok (0x05BF17 or nearby) before home handler

  const convKeyToTokRegion = decodeSequential(0x05bf17, 40, false);

  // ====== PART 7: Build baseline and run execution traces ======

  const baseline = createBaseline();

  // Trace A: From 0x0582B8 with digit-4 key pre-seeded
  const traceDigit = traceFrom(
    baseline.mem,
    HOME_HANDLER_BODY,
    (cpu, mem) => {
      cpu.a = 0x92; // scan code for digit 4
      mem[KBD_KEY] = 0x92;
      mem[KBD_SCAN] = 0x92;
      // Pre-seed TOKEN_STAGING with digit-4 token
      mem[TOKEN_STAGING] = 0x00;
      mem[TOKEN_STAGING + 1] = 0x34;
    },
    {
      tokenValidator: TOKEN_VALIDATOR,
      bufInsert: BUF_INSERT,
      jerror: JERROR_ENTRY,
      jerrorAlt: JERROR_ALT,
      jerrorAlt2: JERROR_ALT2,
    },
    TRACE_STEP_LIMIT,
  );

  // Trace B: From 0x0582B8 with "plus" key pre-seeded
  const tracePlus = traceFrom(
    baseline.mem,
    HOME_HANDLER_BODY,
    (cpu, mem) => {
      cpu.a = 0x80; // scan code for +
      mem[KBD_KEY] = 0x80;
      mem[KBD_SCAN] = 0x80;
      mem[TOKEN_STAGING] = 0x00;
      mem[TOKEN_STAGING + 1] = 0x70; // plus token
    },
    {
      tokenValidator: TOKEN_VALIDATOR,
      bufInsert: BUF_INSERT,
      jerror: JERROR_ENTRY,
      jerrorAlt: JERROR_ALT,
      jerrorAlt2: JERROR_ALT2,
    },
    TRACE_STEP_LIMIT,
  );

  // Trace C: From 0x0582B8 with function key (sin) pre-seeded
  const traceSin = traceFrom(
    baseline.mem,
    HOME_HANDLER_BODY,
    (cpu, mem) => {
      cpu.a = 0xc2; // scan code for SIN
      mem[KBD_KEY] = 0xc2;
      mem[KBD_SCAN] = 0xc2;
      mem[TOKEN_STAGING] = 0x00;
      mem[TOKEN_STAGING + 1] = 0xc1; // sin token (type byte >= 0x5D, should pass CP 0x5D)
    },
    {
      tokenValidator: TOKEN_VALIDATOR,
      bufInsert: BUF_INSERT,
      jerror: JERROR_ENTRY,
      jerrorAlt: JERROR_ALT,
      jerrorAlt2: JERROR_ALT2,
    },
    TRACE_STEP_LIMIT,
  );

  // ====== PART 8: Check what's between CoorMon and home handler entry ======
  // Is there intermediary code that classifies keys before 0x0582B8?

  const preHomeRows = decodeRange(0x058241, 0x0582b8);
  const preHomeCpBranches = findCpBranches(preHomeRows);
  const preHomeIndirectJumps = findIndirectJumps(preHomeRows);
  const preHomeBitOps = findBitOps(preHomeRows);

  // ====== Build summary ======

  const digitReachedValidator = traceDigit.uniqueBlocks.includes(hex(TOKEN_VALIDATOR));
  const digitReachedBufInsert = traceDigit.uniqueBlocks.includes(hex(BUF_INSERT));
  const plusReachedValidator = tracePlus.uniqueBlocks.includes(hex(TOKEN_VALIDATOR));
  const plusReachedBufInsert = tracePlus.uniqueBlocks.includes(hex(BUF_INSERT));
  const sinReachedValidator = traceSin.uniqueBlocks.includes(hex(TOKEN_VALIDATOR));
  const sinReachedBufInsert = traceSin.uniqueBlocks.includes(hex(BUF_INSERT));

  // Check if digit trace diverges from plus trace
  const digitBlocks = new Set(traceDigit.uniqueBlocks);
  const plusBlocks = new Set(tracePlus.uniqueBlocks);
  const digitOnlyBlocks = [...digitBlocks].filter((b) => !plusBlocks.has(b));
  const plusOnlyBlocks = [...plusBlocks].filter((b) => !digitBlocks.has(b));

  // Find earliest divergence point
  let divergenceStep = null;
  const minLen = Math.min(traceDigit.blockLog.length, tracePlus.blockLog.length);
  for (let i = 0; i < minLen; i++) {
    if (traceDigit.blockLog[i].pc !== tracePlus.blockLog[i].pc) {
      divergenceStep = i;
      break;
    }
  }

  const summary = {
    question: 'How does CoorMon classify digit keys vs function keys? Is there a digit bypass that avoids 0x09927F?',
    coormonHasKeyClassification: coormonCpBranches.length > 0 || coormonIndirectJumps.length > 0,
    coormonIndirectJumpCount: coormonIndirectJumps.length,
    coormonCpBranchCount: coormonCpBranches.length,
    preHomeHandlerBranches: preHomeCpBranches.length,
    preCopy9Branches: preCopy9CpBranches.length,
    homeHandlerBufInsertCallSites: homeBufInsertCalls.length,
    homeHandlerTokenValidatorCallSites: homeTokenValidatorCalls.length,
    traceResults: {
      digit4: {
        reachedTokenValidator: digitReachedValidator,
        reachedBufInsert: digitReachedBufInsert,
        hit: traceDigit.hit,
        steps: traceDigit.steps,
      },
      plus: {
        reachedTokenValidator: plusReachedValidator,
        reachedBufInsert: plusReachedBufInsert,
        hit: tracePlus.hit,
        steps: tracePlus.steps,
      },
      sin: {
        reachedTokenValidator: sinReachedValidator,
        reachedBufInsert: sinReachedBufInsert,
        hit: traceSin.hit,
        steps: traceSin.steps,
      },
    },
    pathDivergence: {
      divergenceStep,
      digitOnlyBlocks,
      plusOnlyBlocks,
    },
    conclusion: null,
  };

  // Build conclusion
  if (digitReachedBufInsert && !digitReachedValidator) {
    summary.conclusion = 'Digit keys BYPASS 0x09927F and reach BufInsert directly. The digit fast-path exists.';
  } else if (!digitReachedValidator && !digitReachedBufInsert) {
    summary.conclusion = 'Digit keys reach neither 0x09927F nor BufInsert in the trace limit. The classification happens earlier or elsewhere.';
  } else if (digitReachedValidator) {
    summary.conclusion = 'Digit keys DO reach 0x09927F from this entry point. The bypass must be at CoorMon level or in an intermediary dispatcher not yet traced.';
  } else {
    summary.conclusion = 'Inconclusive — extend trace or check CoorMon dispatch path.';
  }

  return {
    probe: 'probe-phase204-coormon-digit-classify.mjs',
    generatedAt: new Date().toISOString(),
    memInitReturned: baseline.memInitReturned,
    timerInterrupt: false,

    part1_coormon: {
      description: 'Static disassembly of CoorMon entry 0x06EDFE',
      start: hex(COORMON_ENTRY),
      instructionCount: coormonRows.length,
      instructions: coormonRows.slice(0, 60).map((r) => ({
        pc: r.pc,
        bytes: r.bytes,
        text: r.text,
      })),
      cpBranches: coormonCpBranches,
      indirectJumps: coormonIndirectJumps,
      callTargets: coormonCalls,
      jumpTargets: coormonJumps,
      bitOps: coormonBitOps,
    },

    part2_preCopy9: {
      description: 'Pre-Copy9 region 0x058400-0x0584A3 — branches before Copy9/KeyClassifier',
      start: hex(PRE_COPY9_START),
      end: hex(PRE_COPY9_END),
      instructionCount: preCopy9Rows.length,
      instructions: preCopy9Rows.map((r) => ({
        pc: r.pc,
        bytes: r.bytes,
        text: r.text,
      })),
      cpBranches: preCopy9CpBranches,
      indirectJumps: preCopy9IndirectJumps,
      bitOps: preCopy9BitOps,
      memoryRefs: preCopy9MemRefs,
    },

    part3_homeHandler: {
      description: 'Home handler 0x0582B8-0x058700 — all CP branches, indirect jumps, BufInsert/TokenValidator call sites',
      bufInsertCallSites: homeBufInsertCalls,
      tokenValidatorCallSites: homeTokenValidatorCalls,
      cpBranches: homeCpBranches,
      indirectJumps: homeIndirectJumps,
    },

    part4_jpHlDispatch: {
      description: 'JP (HL) dispatch at 0x0585D3 and cxMain pointer table',
      dispatchInstructions: dispatchRows.slice(0, 15).map((r) => ({
        pc: r.pc,
        bytes: r.bytes,
        text: r.text,
      })),
      cxMainTable,
    },

    part5_keyClassifierRegion: {
      description: 'Instructions around KeyClassifier call (0x058490-0x058550)',
      instructions: keyClassifierRegion.map((r) => ({
        pc: r.pc,
        bytes: r.bytes,
        text: r.text,
      })),
      cpBranches: keyClassifierCpBranches,
    },

    part6_preHomeEntry: {
      description: 'Home handler entry 0x058241-0x0582B8 — intermediary before body',
      instructionCount: preHomeRows.length,
      instructions: preHomeRows.map((r) => ({
        pc: r.pc,
        bytes: r.bytes,
        text: r.text,
      })),
      cpBranches: preHomeCpBranches,
      indirectJumps: preHomeIndirectJumps,
      bitOps: preHomeBitOps,
    },

    part7_traces: {
      description: 'Execution traces from 0x0582B8 with different key types',
      digit4: {
        setup: 'A=0x92, kbdKey=0x92, TOKEN_STAGING[1]=0x34 (digit 4)',
        hit: traceDigit.hit,
        steps: traceDigit.steps,
        lastPc: traceDigit.lastPc,
        termination: traceDigit.termination,
        uniqueBlockCount: traceDigit.uniqueBlockCount,
        blockLog: traceDigit.blockLog.slice(0, 80),
        reachedTokenValidator: digitReachedValidator,
        reachedBufInsert: digitReachedBufInsert,
        cpu: traceDigit.cpu,
        error: traceDigit.error ?? null,
      },
      plus: {
        setup: 'A=0x80, kbdKey=0x80, TOKEN_STAGING[1]=0x70 (plus)',
        hit: tracePlus.hit,
        steps: tracePlus.steps,
        lastPc: tracePlus.lastPc,
        termination: tracePlus.termination,
        uniqueBlockCount: tracePlus.uniqueBlockCount,
        blockLog: tracePlus.blockLog.slice(0, 80),
        reachedTokenValidator: plusReachedValidator,
        reachedBufInsert: plusReachedBufInsert,
        cpu: tracePlus.cpu,
        error: tracePlus.error ?? null,
      },
      sin: {
        setup: 'A=0xC2, kbdKey=0xC2, TOKEN_STAGING[1]=0xC1 (sin)',
        hit: traceSin.hit,
        steps: traceSin.steps,
        lastPc: traceSin.lastPc,
        termination: traceSin.termination,
        uniqueBlockCount: traceSin.uniqueBlockCount,
        blockLog: traceSin.blockLog.slice(0, 80),
        reachedTokenValidator: sinReachedValidator,
        reachedBufInsert: sinReachedBufInsert,
        cpu: traceSin.cpu,
        error: traceSin.error ?? null,
      },
    },

    part8_divergence: {
      description: 'Path divergence analysis: digit vs plus vs sin',
      divergenceStep,
      digitOnlyBlocks,
      plusOnlyBlocks,
      digitBlockCount: traceDigit.uniqueBlockCount,
      plusBlockCount: tracePlus.uniqueBlockCount,
      sinBlockCount: traceSin.uniqueBlockCount,
    },

    summary,
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (err) {
  console.log(JSON.stringify({
    probe: 'probe-phase204-coormon-digit-classify.mjs',
    error: {
      message: err?.message ?? String(err),
      stack: err?.stack ?? String(err),
    },
  }, null, 2));
  process.exitCode = 1;
}
