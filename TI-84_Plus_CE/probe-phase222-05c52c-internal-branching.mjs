#!/usr/bin/env node

/**
 * Phase 222 — Trace 0x05C52C internal branching (key classifier / secondary table selection)
 *
 * ConvKeyToTok at 0x05E630 calls 0x05C52C as its FIRST instruction.
 * 0x05C52C subtracts 0x5A from the scan code and indexes the primary token table
 * at 0x05BF84 (166 entries). When primary entry is 0x00, secondary tables should
 * be consulted but session 221 showed ALL IY flag combos still produce 0x00.
 *
 * This probe:
 *  1. Static disassembly of 0x05C52C–0x05C600+ to find branch structure
 *  2. Dynamic traces with different A values (primary hit vs primary=0x00)
 *  3. Mode flag experiments on primary=0x00 scan codes
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');
if (!existsSync(transpiledPath)) throw new Error(existsSync(transpiledGzipPath) ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.' : 'ROM.transpiled.js is missing.');
if (!existsSync(romPath)) throw new Error('ROM.rom is missing.');

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);
const BLOCKS = Array.isArray(PRELIFTED_BLOCKS) ? Object.fromEntries(PRELIFTED_BLOCKS.filter((b) => b?.id).map((b) => [b.id, b])) : (PRELIFTED_BLOCKS ?? {});

const MEM_SIZE = 0x1000000;
const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

// Key addresses
const KEY_CLASSIFIER = 0x05C52C;
const CONV_KEY_TO_TOK = 0x05E630;
const PRIMARY_TABLE = 0x05BF84;
const PRIMARY_TABLE_LEN = 166;
const SECONDARY_TABLE_FN = 0x05C01D;   // 400 entries, function tokens
const SECONDARY_TABLE_2ND = 0x05C1B0;  // 400 entries, 2nd-mode 2-byte
const SECONDARY_TABLE_ALPHA = 0x05C3AA; // 264 entries, Alpha-mode
const SECONDARY_TABLE_ALPHALOCK = 0x05C4A0; // 18 entries, Alpha-Lock

const DISASM_START = 0x05C52C;
const DISASM_END = 0x05C650;  // generous range

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const POST_INIT_ENTRY = 0x0802B2;
const MAX_LOOP_ITERATIONS = 8192;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

// Helpers
const hex = (v, w = 6) => v === null || v === undefined || Number.isNaN(v) ? null : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hexByte = (v) => hex((v ?? 0) & 0xFF, 2);
const blockKey = (addr, mode = 'adl') => `${addr.toString(16).padStart(6, '0')}:${mode}`;

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}
function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}
function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function dec(pc) {
  try { return decodeInstruction(rom, pc, 'adl'); }
  catch (e) { return { pc, length: 1, tag: 'decode-error', errorMessage: e?.message ?? String(e) }; }
}

function fmt(inst) {
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const effAddr = (inst) => {
    if (!Number.isInteger(inst?.addr)) return null;
    return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
      ? (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0
      : inst.addr >>> 0;
  };
  const idx = (reg, d) => `(${String(reg).toUpperCase()}${d >= 0 ? '+' : ''}${d})`;
  switch (inst.tag) {
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${p}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${p}RETI`;
    case 'retn': return `${p}RETN`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(inst.dest).toUpperCase()}, (${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${p}LD (${hex(effAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(inst.dest).toUpperCase()}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}LD ${idx(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${p}SET ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'add-pair': return `${p}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ixd': return `${p}${String(inst.op).toUpperCase()} ${idx(inst.indexRegister, inst.displacement)}`;
    case 'push': return `${p}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair).toUpperCase()}`;
    case 'ldir': return `${p}LDIR`;
    case 'lddr': return `${p}LDDR`;
    case 'nop': return `${p}NOP`;
    case 'ex-sp-hl': return `${p}EX (SP), HL`;
    case 'ex-de-hl': return `${p}EX DE, HL`;
    case 'halt': return `${p}HALT`;
    case 'di': return `${p}DI`;
    case 'ei': return `${p}EI`;
    case 'rst': return `${p}RST ${hex(inst.target, 2)}`;
    case 'sbc-pair': return `${p}SBC ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `${p}ADC ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'in-reg-c': return `${p}IN ${String(inst.dest).toUpperCase()}, (C)`;
    case 'out-c-reg': return `${p}OUT (C), ${String(inst.src).toUpperCase()}`;
    case 'neg': return `${p}NEG`;
    case 'ld-pair-mem': return `${p}LD ${String(inst.pair).toUpperCase()}, (${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${p}LD (${hex(effAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-ixd-imm': return `${p}LD ${idx(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'inc-ixd': return `${p}INC ${idx(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `${p}DEC ${idx(inst.indexRegister, inst.displacement)}`;
    default: {
      const extra = Object.entries(inst).filter(([k]) => !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : String(v)}`).join(' ');
      return `${p}[${inst.tag}]${extra ? ` ${extra}` : ''}`;
    }
  }
}

function bytesAt(start, len) {
  return Array.from(rom.slice(Math.max(0, start), Math.min(rom.length, Math.max(0, start) + Math.max(0, len))), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function disasm(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const inst = dec(pc);
    const len = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      bytes: bytesAt(pc, len),
      text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : fmt(inst),
    });
    pc += len;
  }
  return rows;
}

// ========== PART 1: Static disassembly of 0x05C52C ==========
function part1_staticDisassembly() {
  console.log('=== PART 1: Static disassembly of 0x05C52C–0x05C650 ===\n');

  const rows = disasm(DISASM_START, DISASM_END);
  for (const row of rows) {
    const marker = row.pc === KEY_CLASSIFIER ? '>>' : '  ';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(30)} ${row.text}`);
  }
  console.log();

  // Identify key features
  const cpRows = rows.filter((r) => r.inst?.tag === 'alu-imm' && r.inst?.op === 'cp');
  const ldHLRows = rows.filter((r) => r.inst?.tag === 'ld-pair-imm' && r.inst?.pair === 'hl');
  const jrRows = rows.filter((r) => ['jr', 'jr-conditional', 'jp', 'jp-conditional'].includes(r.inst?.tag));
  const iyRows = rows.filter((r) => r.inst?.tag === 'indexed-cb-bit' || r.inst?.tag === 'indexed-cb-set' || r.inst?.tag === 'indexed-cb-res' || (r.inst?.indexRegister === 'iy'));
  const retRows = rows.filter((r) => ['ret', 'ret-conditional', 'reti', 'retn'].includes(r.inst?.tag));
  const addHLRows = rows.filter((r) => r.inst?.tag === 'add-pair' && r.inst?.dest === 'hl');

  console.log('--- Key features ---');
  console.log(`  CP instructions: ${cpRows.map((r) => `${hex(r.pc)} CP ${hexByte(r.inst.value)}`).join(', ') || 'none'}`);
  console.log(`  LD HL,imm:       ${ldHLRows.map((r) => `${hex(r.pc)} LD HL,${hex(r.inst.value)}`).join(', ') || 'none'}`);
  console.log(`  ADD HL,?:        ${addHLRows.map((r) => `${hex(r.pc)} ADD HL,${String(r.inst.src).toUpperCase()}`).join(', ') || 'none'}`);
  console.log(`  Branches:        ${jrRows.map((r) => `${hex(r.pc)} ${r.text}`).join(', ') || 'none'}`);
  console.log(`  IY-indexed ops:  ${iyRows.map((r) => `${hex(r.pc)} ${r.text}`).join(', ') || 'none'}`);
  console.log(`  RET:             ${retRows.map((r) => `${hex(r.pc)} ${r.text}`).join(', ') || 'none'}`);
  console.log();

  // Check for known table addresses in the disassembly range
  const KNOWN_TABLES = [
    { addr: PRIMARY_TABLE, name: 'Primary (0x05BF84)' },
    { addr: SECONDARY_TABLE_FN, name: 'Secondary-Fn (0x05C01D)' },
    { addr: SECONDARY_TABLE_2ND, name: 'Secondary-2nd (0x05C1B0)' },
    { addr: SECONDARY_TABLE_ALPHA, name: 'Secondary-Alpha (0x05C3AA)' },
    { addr: SECONDARY_TABLE_ALPHALOCK, name: 'Secondary-AlphaLock (0x05C4A0)' },
  ];

  console.log('--- Table address references in LD HL instructions ---');
  for (const tbl of KNOWN_TABLES) {
    const match = ldHLRows.find((r) => r.inst.value === tbl.addr);
    if (match) {
      console.log(`  FOUND: ${hex(match.pc)} loads ${tbl.name}`);
    } else {
      console.log(`  NOT FOUND: ${tbl.name}`);
    }
  }
  console.log();

  // Also scan raw bytes for the table addresses in the range
  console.log('--- Raw byte scan for table addresses in 0x05C52C–0x05C650 ---');
  for (const tbl of KNOWN_TABLES) {
    const lo = tbl.addr & 0xFF, mid = (tbl.addr >>> 8) & 0xFF, hi = (tbl.addr >>> 16) & 0xFF;
    for (let a = DISASM_START; a < DISASM_END - 2; a++) {
      if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
        console.log(`  FOUND ${tbl.name} bytes at ${hex(a)} (context: ${bytesAt(a - 2, 8)})`);
      }
    }
  }

  // Wider scan: look for table addresses ANYWHERE in the 0x05BF00–0x05E700 region
  console.log('\n--- Wider scan: table addresses in 0x05BF00–0x05E700 (as 3-byte LE) ---');
  for (const tbl of KNOWN_TABLES) {
    const lo = tbl.addr & 0xFF, mid = (tbl.addr >>> 8) & 0xFF, hi = (tbl.addr >>> 16) & 0xFF;
    const hits = [];
    for (let a = 0x05BF00; a < 0x05E700 - 2; a++) {
      if (rom[a] === lo && rom[a + 1] === mid && rom[a + 2] === hi) {
        hits.push(a);
      }
    }
    console.log(`  ${tbl.name}: ${hits.length} hits at ${hits.map((a) => hex(a)).join(', ') || 'none'}`);
  }
  console.log();

  return rows;
}

// ========== PART 2: Primary table analysis ==========
function part2_primaryTable() {
  console.log('=== PART 2: Primary table analysis ===\n');

  // Dump the primary table entries for our test scan codes
  // ConvKeyToTok at 0x05E630 calls 0x05C52C with A = key code (not scan code)
  // Key code ≥ 0x5A, index = A - 0x5A
  const testCodes = [
    { keyCode: 0x8F, label: 'digit 1 (scan 0x41)', expectedToken: 0x31 },
    { keyCode: 0x76, label: 'LOG key (scan 0x53)', expectedToken: 0x00 },
    { keyCode: 0x69, label: 'COS⁻¹ (scan ???)', expectedToken: 0x00 },
    { keyCode: 0x5A, label: 'first entry', expectedToken: null },
    { keyCode: 0x5B, label: 'second entry', expectedToken: null },
  ];

  console.log('--- Primary table entries for test key codes ---');
  for (const tc of testCodes) {
    const idx = tc.keyCode - 0x5A;
    if (idx >= 0 && idx < PRIMARY_TABLE_LEN) {
      const val = rom[PRIMARY_TABLE + idx];
      console.log(`  A=${hexByte(tc.keyCode)} (${tc.label}): index=${idx}, primary[${idx}]=${hexByte(val)}${tc.expectedToken !== null ? ` (expected=${hexByte(tc.expectedToken)}, ${val === tc.expectedToken ? 'MATCH' : 'MISMATCH'})` : ''}`);
    } else {
      console.log(`  A=${hexByte(tc.keyCode)} (${tc.label}): index=${idx} OUT OF RANGE`);
    }
  }

  // Find all key codes that map to 0x00 in primary table
  const zeroEntries = [];
  for (let i = 0; i < PRIMARY_TABLE_LEN; i++) {
    if (rom[PRIMARY_TABLE + i] === 0x00) {
      zeroEntries.push({ keyCode: 0x5A + i, index: i });
    }
  }
  console.log(`\n  Total primary=0x00 entries: ${zeroEntries.length} of ${PRIMARY_TABLE_LEN}`);
  console.log(`  Key codes with primary=0x00: ${zeroEntries.map((e) => hexByte(e.keyCode)).join(', ')}`);
  console.log();
}

// ========== PART 3: Dynamic traces ==========
function part3_dynamicTraces() {
  console.log('=== PART 3: Dynamic traces of 0x05C52C ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot for baseline state
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });

  // memInit
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE;
  cpu.iy = IY_ADDR; cpu.ix = IX_ADDR; cpu.sp = STACK_TOP;
  cpu.sp -= 3; write24(mem, cpu.sp, MEM_INIT_RET);
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); },
    });
  } catch (e) { if (e?.message !== '__MEMINIT_RET__') throw e; }

  // Save baseline memory
  const baselineMem = new Uint8Array(mem);

  console.log('Boot complete. Testing 0x05C52C with different A values.\n');

  // Test cases
  const testCases = [
    { a: 0x8F, label: 'digit 1 (key code 0x8F, primary=0x31)' },
    { a: 0x76, label: 'LOG key (key code 0x76, primary=0x00 — should trigger secondary)' },
    { a: 0x69, label: 'key code 0x69 (primary=0x00 — should trigger secondary)' },
    { a: 0x5A, label: 'first valid key code (0x5A)' },
    { a: 0xFE, label: 'near-max key code (0xFE)' },
  ];

  for (const tc of testCases) {
    // Reset state
    const tmem = new Uint8Array(baselineMem);
    const tperi = createPeripheralBus({ timerInterrupt: false });
    const texec = createExecutor(BLOCKS, tmem, { peripherals: tperi });
    const tcpu = texec.cpu;

    tcpu.halted = false; tcpu.iff1 = 0; tcpu.iff2 = 0; tcpu.madl = 1;
    tcpu.mbase = MBASE; tcpu.iy = IY_ADDR; tcpu.ix = IX_ADDR;
    tcpu.sp = STACK_TOP; tcpu.hl = 0; tcpu.de = 0; tcpu.bc = 0;
    tcpu.f = 0x40;
    tcpu.a = tc.a;

    // Push return sentinel
    push24(tcpu, tmem, RETURN_SENTINEL);

    const visitedBlocks = [];
    const aValues = [];
    let termination = 'max_steps';
    let result = null;

    try {
      result = texec.runFrom(KEY_CLASSIFIER, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 64,
        onBlock(pc, _m, _meta, step) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push({ addr: hex(addr), step: step ?? visitedBlocks.length, a: hexByte(tcpu.a), hl: hex(tcpu.hl), de: hex(tcpu.de), f: hexByte(tcpu.f) });
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
        onMissingBlock(pc) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push({ addr: `MISSING:${hex(addr)}`, a: hexByte(tcpu.a) });
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
      });
      termination = result?.termination ?? termination;
    } catch (e) {
      if (e?.message === '__STOP__') termination = 'sentinel';
      else { termination = 'exception'; console.log(`  ERROR: ${e.message}`); }
    }

    console.log(`--- A=${hexByte(tc.a)} (${tc.label}) ---`);
    console.log(`  Steps: ${result?.steps ?? '?'}, termination: ${termination}`);
    console.log(`  Final: A=${hexByte(tcpu.a)}, HL=${hex(tcpu.hl)}, DE=${hex(tcpu.de)}, BC=${hex(tcpu.bc)}, F=${hexByte(tcpu.f)}`);
    console.log(`  Blocks visited (${visitedBlocks.length}):`);
    for (const vb of visitedBlocks) {
      console.log(`    ${vb.addr}  A=${vb.a} HL=${vb.hl} DE=${vb.de} F=${vb.f}`);
    }
    console.log();
  }
}

// ========== PART 4: Mode flag experiments ==========
function part4_modeFlagExperiments() {
  console.log('=== PART 4: Mode flag experiments for primary=0x00 scan codes ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });

  // memInit
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE;
  cpu.iy = IY_ADDR; cpu.ix = IX_ADDR; cpu.sp = STACK_TOP;
  cpu.sp -= 3; write24(mem, cpu.sp, MEM_INIT_RET);
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); },
    });
  } catch (e) { if (e?.message !== '__MEMINIT_RET__') throw e; }

  const baselineMem = new Uint8Array(mem);

  // Use A=0x76 (LOG key, primary=0x00) as test case
  const testKeyCode = 0x76;
  console.log(`Testing key code ${hexByte(testKeyCode)} (primary=0x00) with various mode flags.\n`);

  // Test: call 0x05C52C directly with mode flags set
  const experiments = [
    { label: 'baseline (no flags)', setup: () => {} },
    { label: 'IY+0 bit 4 SET (2nd mode?)', setup: (m) => { m[IY_ADDR + 0] |= 0x10; } },
    { label: 'IY+0 bit 3 SET (Alpha mode?)', setup: (m) => { m[IY_ADDR + 0] |= 0x08; } },
    { label: 'IY+0 bit 4+3 SET (2nd+Alpha)', setup: (m) => { m[IY_ADDR + 0] |= 0x18; } },
    { label: 'IY+0 bit 5 SET', setup: (m) => { m[IY_ADDR + 0] |= 0x20; } },
    { label: 'IY+0 bit 6 SET', setup: (m) => { m[IY_ADDR + 0] |= 0x40; } },
    { label: 'IY+0 bit 7 SET', setup: (m) => { m[IY_ADDR + 0] |= 0x80; } },
    { label: 'IY+0 = 0xFF (all bits)', setup: (m) => { m[IY_ADDR + 0] = 0xFF; } },
    { label: 'IY+1 = 0xFF', setup: (m) => { m[IY_ADDR + 1] = 0xFF; } },
    { label: 'IY+2 = 0xFF', setup: (m) => { m[IY_ADDR + 2] = 0xFF; } },
    { label: 'IY+5 = 0xFF', setup: (m) => { m[IY_ADDR + 5] = 0xFF; } },
    { label: 'IY+9 = 0xFF', setup: (m) => { m[IY_ADDR + 9] = 0xFF; } },
    { label: 'IY+12 = 0xFF', setup: (m) => { m[IY_ADDR + 12] = 0xFF; } },
    { label: 'IY+0x18 = 0xFF', setup: (m) => { m[IY_ADDR + 0x18] = 0xFF; } },
    { label: 'IY+0x2A = 0xFF', setup: (m) => { m[IY_ADDR + 0x2A] = 0xFF; } },
  ];

  // Also test at ConvKeyToTok (0x05E630) level, not just 0x05C52C
  console.log('--- Direct 0x05C52C calls ---\n');

  for (const exp of experiments) {
    const tmem = new Uint8Array(baselineMem);
    exp.setup(tmem);

    const tperi = createPeripheralBus({ timerInterrupt: false });
    const texec = createExecutor(BLOCKS, tmem, { peripherals: tperi });
    const tcpu = texec.cpu;

    tcpu.halted = false; tcpu.iff1 = 0; tcpu.iff2 = 0; tcpu.madl = 1;
    tcpu.mbase = MBASE; tcpu.iy = IY_ADDR; tcpu.ix = IX_ADDR;
    tcpu.sp = STACK_TOP; tcpu.hl = 0; tcpu.de = 0; tcpu.bc = 0; tcpu.f = 0x40;
    tcpu.a = testKeyCode;

    push24(tcpu, tmem, RETURN_SENTINEL);

    const visitedBlocks = [];
    let termination = 'max_steps';
    let result = null;
    try {
      result = texec.runFrom(KEY_CLASSIFIER, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 64,
        onBlock(pc) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push(hex(addr));
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
        onMissingBlock(pc) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push(`MISSING:${hex(addr)}`);
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
      });
      termination = result?.termination ?? termination;
    } catch (e) {
      if (e?.message === '__STOP__') termination = 'sentinel';
    }

    const returnedA = tcpu.a;
    console.log(`  ${exp.label}: A_ret=${hexByte(returnedA)}, blocks=${visitedBlocks.length}, term=${termination}${returnedA !== 0x00 ? ' *** NON-ZERO ***' : ''}`);
  }

  // Now test at ConvKeyToTok level with edit buffer seeded
  console.log('\n--- ConvKeyToTok (0x05E630) calls with edit buffer seeded ---\n');

  // Set up edit buffer pointers
  const editExperiments = [
    { label: 'baseline (no flags, BIT 4 SET)', setup: (m) => { m[IY_ADDR + 5] |= 0x10; } },
    { label: 'IY+0 bit 4 SET (2nd) + BIT4(IY+5)', setup: (m) => { m[IY_ADDR + 0] |= 0x10; m[IY_ADDR + 5] |= 0x10; } },
    { label: 'IY+0 bit 3 SET (Alpha) + BIT4(IY+5)', setup: (m) => { m[IY_ADDR + 0] |= 0x08; m[IY_ADDR + 5] |= 0x10; } },
    { label: 'IY+0 bit 4+3 SET (2nd+Alpha) + BIT4(IY+5)', setup: (m) => { m[IY_ADDR + 0] |= 0x18; m[IY_ADDR + 5] |= 0x10; } },
    { label: 'IY+0 = 0xFF + BIT4(IY+5)', setup: (m) => { m[IY_ADDR + 0] = 0xFF; m[IY_ADDR + 5] |= 0x10; } },
  ];

  for (const exp of editExperiments) {
    const tmem = new Uint8Array(baselineMem);

    // Seed edit buffer
    write24(tmem, 0xD02437, 0xD00A00); // editTop
    write24(tmem, 0xD0243A, 0xD00A00); // editCursor
    write24(tmem, 0xD0243D, 0xD00B00); // editTail
    write24(tmem, 0xD02440, 0xD00B00); // editBtm
    tmem.fill(0x00, 0xD00A00, 0xD00A10); // Clear edit buffer

    exp.setup(tmem);

    const tperi = createPeripheralBus({ timerInterrupt: false });
    const texec = createExecutor(BLOCKS, tmem, { peripherals: tperi });
    const tcpu = texec.cpu;

    tcpu.halted = false; tcpu.iff1 = 0; tcpu.iff2 = 0; tcpu.madl = 1;
    tcpu.mbase = MBASE; tcpu.iy = IY_ADDR; tcpu.ix = IX_ADDR;
    tcpu.sp = STACK_TOP; tcpu.hl = 0; tcpu.de = 0; tcpu.bc = 0; tcpu.f = 0x40;
    tcpu.a = testKeyCode;

    push24(tcpu, tmem, RETURN_SENTINEL);

    const visitedBlocks = [];
    let termination = 'max_steps';
    let result = null;
    let bufInsertHit = false;
    try {
      result = texec.runFrom(CONV_KEY_TO_TOK, 'adl', {
        maxSteps: 300,
        maxLoopIterations: 64,
        onBlock(pc) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push(hex(addr));
          if (addr === 0x05E2A0) bufInsertHit = true;
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
        onMissingBlock(pc) {
          const addr = pc & 0xFFFFFF;
          visitedBlocks.push(`MISSING:${hex(addr)}`);
          if (addr === RETURN_SENTINEL) throw new Error('__STOP__');
        },
      });
      termination = result?.termination ?? termination;
    } catch (e) {
      if (e?.message === '__STOP__') termination = 'sentinel';
    }

    const editBuf = Array.from(tmem.slice(0xD00A00, 0xD00A08), (b) => hexByte(b));
    console.log(`  ${exp.label}`);
    console.log(`    A_ret=${hexByte(tcpu.a)}, blocks=${visitedBlocks.length}, term=${termination}, BufInsert=${bufInsertHit}`);
    console.log(`    Edit buffer: ${editBuf.join(' ')}`);
    console.log(`    Blocks: ${visitedBlocks.slice(0, 20).join(' → ')}${visitedBlocks.length > 20 ? ' ...' : ''}`);
    console.log();
  }
}

// ========== PART 5: Search for alternative entry points ==========
function part5_alternativeEntries() {
  console.log('=== PART 5: Search for alternative entry points and table selection mechanism ===\n');

  // Disassemble 0x05E630 (ConvKeyToTok) through ~0x05E700 to see what happens AFTER 0x05C52C returns
  console.log('--- ConvKeyToTok (0x05E630) disassembly ---\n');
  const rows = disasm(0x05E630, 0x05E6D0);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(30)} ${row.text}`);
  }
  console.log();

  // Look for CALL sites to 0x05C52C — are there multiple callers with different setups?
  console.log('--- All CALL/JP to 0x05C52C in ROM ---\n');
  const lo = KEY_CLASSIFIER & 0xFF, mid = (KEY_CLASSIFIER >>> 8) & 0xFF, hi = (KEY_CLASSIFIER >>> 16) & 0xFF;
  const directOps = new Map([
    [0xCD, 'CALL'], [0xC3, 'JP'],
    [0xCC, 'CALL Z'], [0xC4, 'CALL NZ'], [0xDC, 'CALL C'], [0xD4, 'CALL NC'],
    [0xCA, 'JP Z'], [0xC2, 'JP NZ'], [0xDA, 'JP C'], [0xD2, 'JP NC'],
  ]);
  for (let addr = 0; addr <= rom.length - 4; addr++) {
    const kind = directOps.get(rom[addr]);
    if (!kind) continue;
    if (rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue;
    const context = bytesAt(Math.max(0, addr - 8), 20);
    console.log(`  ${hex(addr)}: ${kind} 0x05C52C  context: ${context}`);
  }
  console.log();

  // Look for what sets up the secondary table selection BEFORE ConvKeyToTok
  // The caller of ConvKeyToTok passes A = key code. But maybe secondary table
  // selection doesn't happen in 0x05C52C at all — maybe ConvKeyToTok itself
  // uses a DIFFERENT call for secondary tables
  console.log('--- Disassembly around secondary table addresses (0x05C01D, 0x05C1B0, 0x05C3AA, 0x05C4A0) ---\n');

  // Check what's immediately before each table — there might be code that falls through to the table
  // or code that loads the table address
  const tables = [
    { addr: SECONDARY_TABLE_FN, name: 'Fn', len: 400 },
    { addr: SECONDARY_TABLE_2ND, name: '2nd', len: 400 },
    { addr: SECONDARY_TABLE_ALPHA, name: 'Alpha', len: 264 },
    { addr: SECONDARY_TABLE_ALPHALOCK, name: 'AlphaLock', len: 18 },
  ];

  for (const tbl of tables) {
    // Look for LD HL,<table_addr> anywhere in ROM
    const tLo = tbl.addr & 0xFF, tMid = (tbl.addr >>> 8) & 0xFF, tHi = (tbl.addr >>> 16) & 0xFF;
    const hits = [];
    for (let a = 0; a < rom.length - 3; a++) {
      // LD HL,nn in ADL mode = 0x21 nn nn nn
      if (rom[a] === 0x21 && rom[a + 1] === tLo && rom[a + 2] === tMid && rom[a + 3] === tHi) {
        hits.push(a);
      }
    }
    console.log(`  LD HL,${hex(tbl.addr)} (${tbl.name} table): ${hits.length} hits at ${hits.map((a) => hex(a)).join(', ') || 'none'}`);
    for (const h of hits) {
      // Disassemble context around each hit
      const start = Math.max(0, h - 12);
      const end = Math.min(rom.length, h + 20);
      const ctx = disasm(start, end);
      for (const row of ctx) {
        const marker = row.pc === h ? '>>' : '  ';
        console.log(`    ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
      }
      console.log();
    }
  }

  // Also check: is 0x05C52C's behavior conditional on HL input, not just A?
  // Look at the function prologue for what registers it reads
  console.log('--- First 20 instructions of 0x05C52C (register usage analysis) ---\n');
  const prologueRows = disasm(KEY_CLASSIFIER, KEY_CLASSIFIER + 0x40);
  const regsRead = new Set();
  for (const row of prologueRows.slice(0, 20)) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
    // Track which registers are read before being written
    const inst = row.inst;
    if (inst.src) regsRead.add(String(inst.src));
    if (inst.indexRegister) regsRead.add(String(inst.indexRegister));
  }
  console.log(`\n  Registers referenced in first 20 instructions: ${[...regsRead].join(', ')}`);
  console.log();
}

// ========== Main ==========
function main() {
  console.log('=== Phase 222: 0x05C52C Internal Branching (Key Classifier) ===\n');

  part1_staticDisassembly();
  part2_primaryTable();
  part3_dynamicTraces();
  part4_modeFlagExperiments();
  part5_alternativeEntries();

  console.log('=== Phase 222 Complete ===');
}

try { main(); } catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase222-05c52c-internal-branching.mjs',
    error: { message: error?.message ?? String(error), stack: error?.stack ?? String(error) }
  }, null, 2));
  process.exitCode = 1;
}
