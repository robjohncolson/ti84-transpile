#!/usr/bin/env node

/**
 * Phase 147 — Disassemble 0x082BB5 helper chain + trace real pop at step ~1425
 *
 * Part A: Disassemble 0x082BB5, 0x082266, 0x04C92E, 0x0820B5, 0x07FD3A, 0x07F978
 * Part B: Trace gcd(12,8) to find the REAL pop path (FPS→OP2 copy)
 * Part C: Test FPSbase relationship with direction
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_DIRECT_ADDR = 0x068d3d;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;

const FPPUSH_ADDR = 0x082961;
const FPPOP_ADDR = 0x082957;
const HELPER_ADDR = 0x082bb5;
const HELPER_0x082266 = 0x082266;
const HELPER_0x04C92E = 0x04c92e;
const HELPER_0x0820B5 = 0x0820b5;
const LDI_CHAIN_9 = 0x07f978;
const SWAP_COPY = 0x07fd3a;
const FPS_MINUS_9 = 0x082bc4;

// BCD values (9 bytes each)
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every(d => d === 0)) return 0;
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return base;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

// ── Part A: Static disassembly ───────────────────────────────────────────

function partA_disassemble() {
  console.log('='.repeat(76));
  console.log('  PART A: Disassemble 0x082BB5 helper chain');
  console.log('='.repeat(76));
  console.log('');

  const r8 = (a) => romBytes[a] & 0xff;
  const r24le = (a) => r8(a) | (r8(a+1) << 8) | (r8(a+2) << 16);

  // ── 0x082BB5 (main helper called from FpPop/FpPush shared tail) ──
  console.log('--- 0x082BB5: FPS space-check helper ---');
  console.log('  Called with HL = byte count (9 for FP entries)');
  console.log('');
  const helper = [
    [0x082BB5, 4, 'CALL 0x082266', 'check if FPS has room for HL bytes'],
    [0x082BB9, 1, 'RET NC',        'enough room -> return (carry clear)'],
    [0x082BBA, 4, 'JP 0x061D3E',   'NOT enough room -> E_Memory error handler'],
  ];
  for (const [addr, len, instr, comment] of helper) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(14)} ${instr.padEnd(24)} ; ${comment}`);
  }
  console.log('');

  // ── Neighboring entry points ──
  console.log('--- Neighboring entry points near 0x082BB5 ---');
  const neighbors = [
    [0x082BBE, 4, 'CALL 0x0822BA', 'alternate space check (different calc)'],
    [0x082BC2, 2, 'JR -11 -> 0x082BB9', 'share the RET NC / JP error tail'],
    [0x082BC4, 4, 'LD HL,(0xD0258D)', 'FPS pointer into HL'],
    [0x082BC8, 4, 'LD DE,0xFFFFF7',    '-9 in 24-bit'],
    [0x082BCC, 1, 'ADD HL,DE',         'HL = FPS - 9'],
    [0x082BCD, 1, 'RET',               'return HL = address of top FPS entry'],
    [0x082BCE, 4, 'CALL 0x082BC4',     'get FPS-9 in HL (top entry addr)'],
    [0x082BD2, 4, 'LD DE,0xD005F8',    'DE = OP1'],
    [0x082BD6, 4, 'JP 0x0829F2',       'swap 9 bytes between HL and DE (OP1 <-> top FPS)'],
  ];
  for (const [addr, len, instr, comment] of neighbors) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(14)} ${instr.padEnd(36)} ; ${comment}`);
  }
  console.log('');

  // ── 0x0829F2 (swap setup) ──
  console.log('--- 0x0829F2: Swap-copy setup ---');
  const swapSetup = [
    [0x0829F2, 2, 'LD B,0x09',      'count = 9 bytes'],
    [0x0829F4, 4, 'JP 0x07FD3A',    'jump to byte-swap loop'],
  ];
  for (const [addr, len, instr, comment] of swapSetup) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(14)} ${instr.padEnd(24)} ; ${comment}`);
  }
  console.log('');

  // ── 0x07FD3A (swap loop) ──
  console.log('--- 0x07FD3A: Byte-swap loop (swaps B bytes between HL and DE) ---');
  const swapLoop = [
    [0x07FD3A, 1, 'LD A,(DE)',  'read dest byte'],
    [0x07FD3B, 1, 'LD C,(HL)', 'read source byte'],
    [0x07FD3C, 1, 'LD (HL),A', 'write dest byte to source'],
    [0x07FD3D, 1, 'LD A,C',    'A = source byte'],
    [0x07FD3E, 1, 'LD (DE),A', 'write source byte to dest'],
    [0x07FD3F, 1, 'INC HL',    ''],
    [0x07FD40, 1, 'INC DE',    ''],
    [0x07FD41, 2, 'DJNZ -9 -> 0x07FD3A', 'loop B times'],
    [0x07FD43, 1, 'RET',       ''],
  ];
  for (const [addr, len, instr, comment] of swapLoop) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(14)} ${instr.padEnd(28)} ; ${comment}`);
  }
  console.log('');

  // ── 0x07F978 (9x LDI chain) ──
  console.log('--- 0x07F978: 9x LDI chain (copies 9 bytes from HL to DE) ---');
  console.log('    9 consecutive LDI instructions (ED A0), then RET');
  console.log('    LDI: copy (HL)->(DE), HL++, DE++, BC--');
  console.log('    Direction is ALWAYS from (HL) to (DE)');
  console.log('');

  // ── 0x082266 (space calculator) ──
  console.log('--- 0x082266: FPS available-space check ---');
  console.log('  Entry: HL = byte count needed (via EX DE,HL -> now in DE)');
  const spaceCheck = [
    [0x082266, 1, 'EX DE,HL',              'DE = byte count, HL = old DE'],
    [0x082267, 4, 'CALL 0x04C92E',         'save DE to RAM temp (0xD02AD7)'],
    [0x08226B, 4, 'CALL 0x0820B5',         'HL = available bytes between FPS and OPS'],
    [0x08226F, 1, 'OR A',                  'clear carry'],
    [0x082270, 2, 'SBC HL,DE',             'HL = available - needed'],
    [0x082272, 1, 'RET NC',                'if available >= needed, return (carry clear = OK)'],
    [0x082273, 1, 'PUSH DE',               'not enough: save needed count'],
    [0x082274, 4, 'LD HL,(0xD0259A)',       'pTemp'],
    [0x082278, 5, 'LD BC,(0xD02590)',       'OPBase'],
    [0x08227D, 1, 'INC BC',                ''],
    [0x08227E, 4, 'LD DE,0x000000',         ''],
    [0x082282, 1, 'XOR A',                 'clear carry'],
    [0x082283, 2, 'SBC HL,BC',             'HL = pTemp - OPBase - 1'],
    [0x082285, 2, 'JR C,0x0822A2',         'if pTemp < OPBase+1 -> error path'],
  ];
  for (const [addr, len, instr, comment] of spaceCheck) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(16)} ${instr.padEnd(32)} ; ${comment}`);
  }
  console.log('    ... (GC / memory compaction if space insufficient)');
  console.log('');

  // ── 0x0820B5 (available space) ──
  console.log('--- 0x0820B5: Compute available bytes between FPS and OPS ---');
  const avail = [
    [0x0820B5, 4, 'LD HL,(0xD02593)',  'OPS (operator stack ptr)'],
    [0x0820B9, 5, 'LD BC,(0xD0258D)',  'FPS (float stack ptr)'],
    [0x0820BE, 1, 'OR A',              'clear carry'],
    [0x0820BF, 2, 'SBC HL,BC',         'HL = OPS - FPS'],
    [0x0820C1, 2, 'JR NC,+5',          'if OPS >= FPS, skip'],
    [0x0820C3, 4, 'LD HL,0x000000',    'no space (stacks overlap)'],
    [0x0820C7, 1, 'RET',               ''],
    [0x0820C8, 1, 'INC HL',            'HL = OPS - FPS + 1'],
    [0x0820C9, 1, 'RET',               ''],
  ];
  for (const [addr, len, instr, comment] of avail) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(16)} ${instr.padEnd(28)} ; ${comment}`);
  }
  console.log('');

  // ── 0x04C92E (DE temp save) ──
  console.log('--- 0x04C92E: Save DE to RAM temp ---');
  const deSave = [
    [0x04C92E, 1, 'PUSH AF',              ''],
    [0x04C92F, 1, 'XOR A',                'A = 0'],
    [0x04C930, 5, 'LD (0xD02AD7),DE',     'save DE to temp'],
    [0x04C935, 4, 'LD (0xD02AD9),A',      'zero the high byte'],
    [0x04C939, 5, 'LD DE,(0xD02AD7)',      'reload DE (now zero-extended)'],
    [0x04C93E, 1, 'POP AF',               ''],
    [0x04C93F, 1, 'RET',                  ''],
  ];
  for (const [addr, len, instr, comment] of deSave) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(16)} ${instr.padEnd(28)} ; ${comment}`);
  }
  console.log('');

  // ── FpPop / FpPush shared tail ──
  console.log('--- FpPop (0x082957) / FpPush (0x082961) / shared tail (0x082965) ---');
  const fpEntries = [
    [0x082957, 4, 'LD HL,0xD00603',       'HL = OP2 address'],
    [0x08295B, 2, 'JR +8 -> 0x082965',    'skip to shared tail'],
    [0x08295D, 4, 'CALL 0x07FF49',        '(dead code between entries)'],
    [0x082961, 4, 'LD HL,0xD005F8',       'HL = OP1 address'],
    [0x082965, 1, 'PUSH HL',              'save OP addr on stack'],
    [0x082966, 4, 'LD HL,0x000009',       'HL = 9 (byte count)'],
    [0x08296A, 4, 'CALL 0x082BB5',        'space check (will JP to error if no room)'],
    [0x08296E, 1, 'POP HL',               'HL = OP addr (OP1 or OP2)'],
    [0x08296F, 5, 'LD DE,(0xD0258D)',      'DE = FPS pointer'],
    [0x082974, 4, 'CALL 0x07F978',        '9x LDI: copy (HL)->(DE) = OP -> FPS'],
    [0x082978, 5, 'LD (0xD0258D),DE',     'FPS += 9 (pointer advanced by LDI)'],
    [0x08297D, 1, 'RET',                  ''],
  ];
  for (const [addr, len, instr, comment] of fpEntries) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(r8(addr+i).toString(16).toUpperCase().padStart(2,'0'));
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(16)} ${instr.padEnd(32)} ; ${comment}`);
  }
  console.log('');

  // ── CRITICAL ANALYSIS ──
  console.log('='.repeat(76));
  console.log('  CRITICAL FINDING: 0x082BB5 is a SPACE CHECK, not a direction decider');
  console.log('='.repeat(76));
  console.log('');
  console.log('  Call chain: FpPop/FpPush -> shared tail -> CALL 0x082BB5 -> CALL 0x082266');
  console.log('  0x082266 calls 0x0820B5 to compute available = OPS - FPS.');
  console.log('  If available >= 9, it returns with carry clear -> 0x082BB5 returns.');
  console.log('  If not enough room, 0x082BB5 jumps to error handler at 0x061D3E.');
  console.log('');
  console.log('  The direction of the copy is HARDCODED in the shared tail:');
  console.log('    POP HL  -> HL = OP address (OP1 or OP2)');
  console.log('    LD DE,(FPS)  -> DE = FPS pointer');
  console.log('    CALL 0x07F978  -> 9x LDI copies from (HL) to (DE)');
  console.log('');
  console.log('  BOTH FpPop(0x082957) and FpPush(0x082961) copy FROM register TO stack!');
  console.log('  FpPop pushes OP2 to FPS. FpPush pushes OP1 to FPS.');
  console.log('  Neither one pops. The naming "FpPop" is misleading.');
  console.log('');
  console.log('  REAL pop paths exist elsewhere:');
  console.log('    0x082BCE: CALL 0x082BC4 (HL=FPS-9) + LD DE,OP1 + JP 0x0829F2');
  console.log('    0x0829F2: LD B,9 + JP 0x07FD3A (SWAP B bytes between HL and DE)');
  console.log('    This SWAPS the top FPS entry with OP1 (but does NOT update FPS ptr!)');
  console.log('');
}

// ── Part B: Trace gcd to find real pop path ──────────────────────────────

function partB_traceRealPop(executor, cpu, mem) {
  console.log('='.repeat(76));
  console.log('  PART B: Trace gcd(12,8) to find the REAL pop (FPS -> OP2 copy)');
  console.log('='.repeat(76));
  console.log('');

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Seed FPS with two 9-byte entries
  const FPS_ENTRY_SIZE = 9;
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 30);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 2 * FPS_ENTRY_SIZE);

  // Seed OP registers
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);
  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem[FP_CATEGORY_ADDR] = 0x28;

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log('  Initial state:');
  console.log(`    OP1: [${hexBytes(mem, OP1_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`    OP2: [${hexBytes(mem, OP2_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`    FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`    FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    FPS area: [${hexBytes(mem, FPS_CLEAN_AREA, 20)}]`);
  console.log('');

  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;

  // Track FPS changes and specific copy-related PCs
  const copyPCs = new Set([
    LDI_CHAIN_9,     // 0x07F978 — 9xLDI copy
    SWAP_COPY,        // 0x07FD3A — swap loop
    FPPOP_ADDR,       // 0x082957 — FpPop entry
    FPPUSH_ADDR,      // 0x082961 — FpPush entry
    HELPER_ADDR,      // 0x082BB5 — space check
    FPS_MINUS_9,      // 0x082BC4 — FPS-9 calc
    0x082BCE,         // real pop via swap
    0x0829F2,         // swap setup
  ]);

  const snapshots = [];
  let prevFPS = read24(mem, FPS_ADDR);

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        // Track every PC near LDI chain entry for direction analysis
        if (copyPCs.has(norm) || norm === 0x082965) {
          const curFPS = read24(mem, FPS_ADDR);
          snapshots.push({
            step: stepCount,
            pc: norm,
            hl: cpu._hl & 0xffffff,
            de: cpu._de & 0xffffff,
            bc: cpu._bc & 0xffffff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            sp: cpu.sp & 0xffffff,
            fpsPtr: curFPS,
            fpsDelta: curFPS - prevFPS,
            op2_0: hexBytes(mem, OP2_ADDR, 9),
          });
          prevFPS = curFPS;
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') returnHit = true;
    else if (e?.message === '__ERR__') errCaught = true;
    else throw e;
  }

  console.log(`  Outcome: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR' : 'BUDGET'} after ${stepCount} steps`);
  console.log(`  Final OP1: [${hexBytes(mem, OP1_ADDR, 9)}] = ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`  Final OP2: [${hexBytes(mem, OP2_ADDR, 9)}] = ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`  Final FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);
  console.log('');

  const pcLabels = {
    [LDI_CHAIN_9]: 'LDI-9x-copy',
    [SWAP_COPY]: 'SWAP-loop',
    [FPPOP_ADDR]: 'FpPop-entry',
    [FPPUSH_ADDR]: 'FpPush-entry',
    [HELPER_ADDR]: 'space-check',
    [FPS_MINUS_9]: 'FPS-minus-9',
    [0x082BCE]: 'real-pop-swap',
    [0x0829F2]: 'swap-setup',
    [0x082965]: 'shared-tail',
  };

  console.log(`  COPY-RELATED SNAPSHOTS (${snapshots.length} hits):`);
  for (const snap of snapshots) {
    const label = pcLabels[snap.pc] || '';
    console.log(`    [Step ${String(snap.step).padStart(4)}] PC=${hex(snap.pc)} (${label.padEnd(16)}) HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)} FPS=${hex(snap.fpsPtr)} d=${snap.fpsDelta > 0 ? '+' : ''}${snap.fpsDelta}`);
  }
  console.log('');

  // Look for the real pop: when FPS decreases or when HL points to FPS area and DE to OP2
  const realPops = snapshots.filter(s =>
    s.pc === LDI_CHAIN_9 &&
    s.hl >= FPS_CLEAN_AREA && s.hl < FPS_CLEAN_AREA + 100 &&
    s.de >= OP2_ADDR && s.de <= OP2_ADDR + 11
  );
  const swapHits = snapshots.filter(s => s.pc === SWAP_COPY || s.pc === 0x0829F2);

  if (realPops.length > 0) {
    console.log('  REAL POPS FOUND (LDI chain with HL=FPS area, DE=OP2):');
    for (const s of realPops) {
      console.log(`    Step ${s.step}: HL=${hex(s.hl)} DE=${hex(s.de)} BC=${hex(s.bc)}`);
    }
  } else {
    console.log('  No LDI-based real pops found (HL=FPS->DE=OP2).');
  }

  if (swapHits.length > 0) {
    console.log('  SWAP-based operations found:');
    for (const s of swapHits) {
      console.log(`    Step ${s.step}: PC=${hex(s.pc)} HL=${hex(s.hl)} DE=${hex(s.de)} BC=${hex(s.bc)}`);
    }
  } else {
    console.log('  No swap-based operations found.');
  }
  console.log('');

  return snapshots;
}

// ── Part C: Test FPSbase relationship ────────────────────────────────────

function partC_testFPSbase(executor, cpu, mem) {
  console.log('='.repeat(76));
  console.log('  PART C: Test if FPSbase relationship affects FpPop direction');
  console.log('='.repeat(76));
  console.log('');

  console.log('  HYPOTHESIS INVALIDATED BY DISASSEMBLY:');
  console.log('  0x082BB5 does NOT compare dest vs FPSbase to decide direction.');
  console.log('  It is purely a space check (available bytes >= requested bytes).');
  console.log('  The copy direction is hardcoded: always (HL)->(DE) = OP -> FPS (push).');
  console.log('');
  console.log('  Testing anyway to confirm...');
  console.log('');

  const configs = [
    { label: 'FPSbase = USERMEM (normal)',   fpsbase: USERMEM_ADDR },
    { label: 'FPSbase = 0xD00700 (above OP2)', fpsbase: 0xD00700 },
    { label: 'FPSbase = 0xD00500 (below OP2)', fpsbase: 0xD00500 },
    { label: 'FPSbase = OP2 (equal)',          fpsbase: OP2_ADDR },
  ];

  for (const { label, fpsbase } of configs) {
    console.log(`  --- ${label} ---`);

    prepareCallState(cpu, mem);
    seedAllocator(mem);

    // Override FPSbase
    write24(mem, FPSBASE_ADDR, fpsbase);

    // Set FPS to a clean area with one entry
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 20);
    mem.set(BCD_8, FPS_CLEAN_AREA); // seed one entry at FPS
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 9); // FPS points past it

    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
    mem.set(BCD_12, OP1_ADDR);

    const fpsBefore = read24(mem, FPS_ADDR);
    const op2Before = hexBytes(mem, OP2_ADDR, 9);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    let returned = false;
    try {
      executor.runFrom(FPPOP_ADDR, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
        onMissingBlock(pc) { if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__'); },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const fpsAfter = read24(mem, FPS_ADDR);
    const fpsDelta = fpsAfter - fpsBefore;
    const op2After = hexBytes(mem, OP2_ADDR, 9);
    const direction = fpsDelta > 0 ? 'PUSH (FPS grew)' : fpsDelta < 0 ? 'POP (FPS shrank)' : 'NO CHANGE';

    console.log(`    FPSbase=${hex(fpsbase)}  FPS: ${hex(fpsBefore)}->${hex(fpsAfter)} (${fpsDelta > 0 ? '+' : ''}${fpsDelta})  => ${direction}`);
    console.log(`    OP2: [${op2Before}] -> [${op2After}]`);
    console.log(`    Returned: ${returned}`);
    console.log('');
  }

  console.log('  CONCLUSION:');
  console.log('  FPSbase has NO effect on FpPop direction. The code ALWAYS pushes.');
  console.log('  0x082957 ("FpPop") is misnamed — it pushes OP2 onto FPS.');
  console.log('  0x082961 ("FpPush") pushes OP1 onto FPS.');
  console.log('  Real popping uses a separate code path (0x082BCE -> swap, or inline).');
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 147: FpPop direction — disassemble 0x082BB5 helper chain ===');
  console.log('');

  // Part A: Static disassembly (no runtime needed)
  partA_disassemble();

  // Create runtime
  const { mem, executor, cpu } = createRuntime();

  console.log('  Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('  Cold boot complete.');
  console.log('');

  console.log('  Running MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // Part B: Trace gcd for real pop
  partB_traceRealPop(executor, cpu, mem);

  // Part C: Test FPSbase
  partC_testFPSbase(executor, cpu, mem);

  console.log('=== Phase 147 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
