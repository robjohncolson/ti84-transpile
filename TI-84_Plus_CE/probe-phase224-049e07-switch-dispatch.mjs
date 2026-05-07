#!/usr/bin/env node

/**
 * Phase 224: Trace 0x049E07 switch dispatcher (called by 0x02F68A key pipeline)
 *
 * Context: 0x02F68A is a 334-byte key processing pipeline that reads hardware
 * port 0x3082, then calls 0x049E07 TWICE. 0x049E07 is a switch-table dispatcher
 * that resolves key codes via the state byte at (D177B9). This is likely where
 * scan-to-keycode conversion happens.
 *
 * Parts:
 *  A. Static disassembly of 0x049E07 (~300 bytes)
 *  B. Find function boundary (RET scan)
 *  C. Look for dispatch mechanism (JP (HL), table references, D177B9 reads)
 *  D. Dynamic trace — boot CPU, call 0x049E07 with various D177B9 values
 *  E. Dump any key code tables found
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const rom = readFileSync(ROM_PATH);
const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

const ROM_SIZE = rom.length;
const MEM_SIZE = 0x1000000;

// Key addresses
const TARGET_FUNC = 0x049E07;
const CALLER_FUNC = 0x02F68A;
const STATE_BYTE = 0xD177B9; // state byte used for dispatch

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

// Key code storage RAM variables
const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;
const KEY_CODE_D00824 = 0xD00824;
const KEY_CODE_D00826 = 0xD00826;

// RET-family opcodes
const RET_OPCODES = new Set([0xC9]); // unconditional RET
const COND_RET_OPCODES = new Set([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8]);

/* ── Utility helpers ─────────────────────────────────────────────── */

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function blockId(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function write24(mem, addr, value) {
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE224_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc & 0xFFFFFF, 'adl');
  } catch {
    return null;
  }
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${base}${sign}${Math.abs(displacement)})`;
}

function formatResolvedAddress(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'db ?';
  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    case 'ret': return 'ret';
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'neg': return 'neg';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'rst': return `rst ${hex(inst.target, 2)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(formatResolvedAddress(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(formatResolvedAddress(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') return `ld ${inst.pair}, (${hex(inst.addr)})`;
      if (inst.direction === 'to-mem') return `ld (${hex(inst.addr)}), ${inst.pair}`;
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-ind-imm': return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
    case 'ld-pair-indexed': return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ixd': return `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-reg': return `${inst.op} a, ${inst.src}`;
    case 'alu-imm': return `${inst.op} a, ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${inst.op} a, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in0': return `in0 ${inst.reg}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    case 'pop': return `pop ${inst.pair}`;
    case 'push': return `push ${inst.pair}`;
    case 'im': return `im ${inst.value}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${inst.operation} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'tst-reg': return `tst a, ${inst.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hexByte(inst.value)}`;
    case 'tstio': return `tstio ${hexByte(inst.value)}`;
    case 'lea': return `lea ${inst.dest}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'slp': return 'slp';
    default: return inst.tag;
  }
}

function disassembleLinear(start, end) {
  const rows = [];
  let pc = start;
  const limit = Math.min(end, ROM_SIZE);

  while (pc < limit) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > ROM_SIZE) {
      rows.push({
        pc,
        bytes: bytesToHex(rom, pc, 1),
        text: `db ${hexByte(rom[pc])}`,
        entry: Boolean(BLOCKS[blockId(pc)]),
        inst: null,
      });
      pc += 1;
      continue;
    }
    rows.push({
      pc,
      bytes: bytesToHex(rom, pc, inst.length),
      text: formatInstruction(inst),
      entry: Boolean(BLOCKS[blockId(pc)]),
      inst,
    });
    pc = inst.nextPc;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(`\n=== ${title} ===`);
  for (const row of rows) {
    const marker = row.entry ? '[ENTRY] ' : '        ';
    console.log(`  ${hex(row.pc)} ${marker}${row.bytes.padEnd(20)} ${row.text}`);
  }
}

/* ── Boot baseline (same as phase 223) ───────────────────────────── */

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetCpuState(cpu, mem) {
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
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetCpuState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE224_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log('  Boot baseline complete.');
  console.log(`    memInit returned via sentinel: ${memInitReturned ? 'yes' : 'no'}`);

  return new Uint8Array(mem);
}

/* ── PART A: Static disassembly of 0x049E07 ──────────────────────── */

function partA() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART A: Static disassembly of 0x049E07 (~300 bytes)');
  console.log('#'.repeat(80));

  // Raw hex dump
  const DUMP_LEN = 300;
  console.log(`\nRaw hex dump ${hex(TARGET_FUNC)} - ${hex(TARGET_FUNC + DUMP_LEN)}:`);
  for (let offset = 0; offset < DUMP_LEN; offset += 16) {
    const addr = TARGET_FUNC + offset;
    const len = Math.min(16, DUMP_LEN - offset);
    const hexStr = bytesToHex(rom, addr, len);
    const ascii = Array.from(rom.slice(addr, addr + len), (b) =>
      b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.',
    ).join('');
    console.log(`  ${hex(addr)} : ${hexStr.padEnd(48)} ${ascii}`);
  }

  // Disassembly
  const rows = disassembleLinear(TARGET_FUNC, TARGET_FUNC + DUMP_LEN);
  printDisassembly(`Disassembly of ${hex(TARGET_FUNC)} (+300 bytes)`, rows);

  // Extract CALL targets
  const calls = rows.filter((r) => r.inst?.tag === 'call' || r.inst?.tag === 'call-conditional');
  console.log(`\n  CALL instructions found: ${calls.length}`);
  for (const c of calls) {
    console.log(`    ${hex(c.pc)} -> ${hex(c.inst.target)}  (${c.text})`);
  }

  // Extract JP targets
  const jumps = rows.filter((r) =>
    r.inst?.tag === 'jp' || r.inst?.tag === 'jp-conditional' ||
    r.inst?.tag === 'jr' || r.inst?.tag === 'jr-conditional' ||
    r.inst?.tag === 'jp-indirect',
  );
  console.log(`\n  JP/JR/JP(HL) instructions found: ${jumps.length}`);
  for (const j of jumps) {
    console.log(`    ${hex(j.pc)} (${j.text})`);
  }

  // Look for CP instructions (switch case comparisons)
  const cpInstructions = rows.filter((r) =>
    r.inst?.tag === 'alu-imm' && (r.inst.op === 'cp' || r.inst.op === 'sub'),
  );
  console.log(`\n  CP/SUB immediate instructions: ${cpInstructions.length}`);
  for (const c of cpInstructions) {
    console.log(`    ${hex(c.pc)} ${c.text}`);
  }

  // Memory reads (look for D177B9)
  const memReads = rows.filter((r) => r.inst?.tag === 'ld-reg-mem');
  const memWrites = rows.filter((r) => r.inst?.tag === 'ld-mem-reg');
  console.log(`\n  LD reg,(nn) memory reads: ${memReads.length}`);
  for (const m of memReads) {
    const resolved = formatResolvedAddress(m.inst);
    const flag = (resolved === STATE_BYTE) ? ' *** STATE BYTE D177B9 ***' : '';
    console.log(`    ${hex(m.pc)} ${m.text}${flag}`);
  }
  console.log(`  LD (nn),reg memory writes: ${memWrites.length}`);
  for (const m of memWrites) {
    console.log(`    ${hex(m.pc)} ${m.text}`);
  }

  // LD A,(HL) / LD A,(DE) / LD A,(BC) — indirect reads (table lookups)
  const ldAInd = rows.filter((r) =>
    r.inst?.tag === 'ld-reg-ind' && r.inst.dest === 'a',
  );
  console.log(`\n  LD A,(reg) indirect reads: ${ldAInd.length}`);
  for (const l of ldAInd) {
    console.log(`    ${hex(l.pc)} ${l.text}`);
  }

  // Look for JP (HL) — dispatch mechanism
  const jpIndirect = rows.filter((r) => r.inst?.tag === 'jp-indirect');
  if (jpIndirect.length > 0) {
    console.log(`\n  *** JP (HL) / JP (IX) / JP (IY) dispatch found: ${jpIndirect.length}`);
    for (const j of jpIndirect) {
      console.log(`    ${hex(j.pc)} ${j.text}`);
    }
  }

  // LD HL,imm — potential table base addresses
  const ldHLImm = rows.filter((r) =>
    r.inst?.tag === 'ld-pair-imm' && (r.inst.pair === 'hl' || r.inst.pair === 'de'),
  );
  console.log(`\n  LD HL/DE,nn (potential table bases): ${ldHLImm.length}`);
  for (const l of ldHLImm) {
    console.log(`    ${hex(l.pc)} ${l.text}`);
  }

  return rows;
}

/* ── PART B: Find function boundary ──────────────────────────────── */

function partB() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART B: Find function boundary (RET scan)');
  console.log('#'.repeat(80));

  const retLocations = [];
  const condRetLocations = [];

  for (let offset = 0; offset < 512; offset++) {
    const addr = TARGET_FUNC + offset;
    if (addr >= ROM_SIZE) break;

    const byte = rom[addr];
    if (RET_OPCODES.has(byte)) {
      retLocations.push({ addr, offset, type: 'RET' });
    }
    if (COND_RET_OPCODES.has(byte)) {
      const inst = decodeSafe(addr);
      if (inst && inst.tag === 'ret-conditional') {
        condRetLocations.push({ addr, offset, type: `RET ${inst.condition}` });
      }
    }
  }

  console.log(`\n  Unconditional RET (0xC9) locations from ${hex(TARGET_FUNC)}:`);
  for (const r of retLocations) {
    console.log(`    ${hex(r.addr)} (offset +${r.offset} = ${r.offset} bytes)`);
  }

  console.log(`\n  Conditional RET locations:`);
  for (const r of condRetLocations) {
    console.log(`    ${hex(r.addr)} (offset +${r.offset}) ${r.type}`);
  }

  if (retLocations.length > 0) {
    const first = retLocations[0];
    console.log(`\n  First unconditional RET at ${hex(first.addr)} -> estimated function size: ${first.offset + 1} bytes`);
  }

  // Careful disassembly to find all sub-calls
  const allRows = disassembleLinear(TARGET_FUNC, TARGET_FUNC + 512);
  const subCalls = [];
  let functionEnd = null;

  for (const row of allRows) {
    if (!row.inst) continue;

    if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
      subCalls.push({ pc: row.pc, target: row.inst.target, text: row.text });
    }

    if (row.inst.tag === 'ret' && !functionEnd) {
      functionEnd = row.pc;
    }
  }

  console.log(`\n  All sub-calls within ${hex(TARGET_FUNC)}..+512:`);
  for (const s of subCalls) {
    if (functionEnd && s.pc > functionEnd) {
      console.log(`    ${hex(s.pc)} -> ${hex(s.target)}  (${s.text})  [PAST FIRST RET]`);
    } else {
      console.log(`    ${hex(s.pc)} -> ${hex(s.target)}  (${s.text})`);
    }
  }

  if (functionEnd) {
    const funcSize = functionEnd - TARGET_FUNC + 1;
    console.log(`\n  Function boundary estimate: ${hex(TARGET_FUNC)} to ${hex(functionEnd)} (${funcSize} bytes)`);
  }

  return { functionEnd, subCalls };
}

/* ── PART C: Dispatch mechanism analysis ─────────────────────────── */

function partC(rows) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART C: Dispatch mechanism analysis');
  console.log('#'.repeat(80));

  // Check for references to D177B9 in the wider region
  console.log('\n  Searching for D177B9 references in ROM around 0x049E07...');
  const stateByteLE = [STATE_BYTE & 0xFF, (STATE_BYTE >> 8) & 0xFF, (STATE_BYTE >> 16) & 0xFF];
  const searchStart = Math.max(0, TARGET_FUNC - 0x100);
  const searchEnd = Math.min(ROM_SIZE - 2, TARGET_FUNC + 0x400);

  const refs = [];
  for (let addr = searchStart; addr < searchEnd; addr++) {
    if (rom[addr] === stateByteLE[0] &&
        rom[addr + 1] === stateByteLE[1] &&
        rom[addr + 2] === stateByteLE[2]) {
      refs.push(addr);
    }
  }
  console.log(`  Found ${refs.length} raw byte references to D177B9:`);
  for (const r of refs) {
    // Show context bytes around the match
    const contextStart = Math.max(0, r - 4);
    const contextLen = Math.min(12, ROM_SIZE - contextStart);
    console.log(`    ${hex(r)} context: ${bytesToHex(rom, contextStart, contextLen)}`);
    // Try to decode the instruction that contains this reference
    for (let backtrack = 0; backtrack < 5; backtrack++) {
      const inst = decodeSafe(r - backtrack);
      if (inst && inst.nextPc > r) {
        console.log(`      -> instruction at ${hex(r - backtrack)}: ${formatInstruction(inst)}`);
        break;
      }
    }
  }

  // Analyze the caller 0x02F68A to see how it calls 0x049E07
  console.log(`\n  Context: How ${hex(CALLER_FUNC)} calls ${hex(TARGET_FUNC)}:`);
  const callerRows = disassembleLinear(CALLER_FUNC, CALLER_FUNC + 0x160);
  const callSites = callerRows.filter((r) =>
    (r.inst?.tag === 'call' || r.inst?.tag === 'call-conditional') &&
    r.inst.target === TARGET_FUNC,
  );
  console.log(`  Number of CALL ${hex(TARGET_FUNC)} in caller: ${callSites.length}`);
  for (const cs of callSites) {
    console.log(`    Call at ${hex(cs.pc)}: ${cs.text}`);
    // Show 10 instructions before each call site
    const priorRows = callerRows.filter((r) => r.pc < cs.pc && r.pc >= cs.pc - 30);
    console.log('    Setup before this call:');
    for (const r of priorRows) {
      console.log(`      ${hex(r.pc)} ${r.bytes.padEnd(20)} ${r.text}`);
    }
    // Show 5 instructions after
    const afterRows = callerRows.filter((r) => r.pc > cs.pc && r.pc <= cs.pc + 15);
    console.log('    After this call:');
    for (const r of afterRows) {
      console.log(`      ${hex(r.pc)} ${r.bytes.padEnd(20)} ${r.text}`);
    }
  }

  // Look for table addresses loaded near dispatch
  // Check all LD HL,nn and LD DE,nn in the function for potential table bases
  const tableAddrs = [];
  for (const row of rows) {
    if (row.inst?.tag === 'ld-pair-imm' &&
        (row.inst.pair === 'hl' || row.inst.pair === 'de') &&
        row.inst.value >= 0x040000 && row.inst.value < 0x400000) {
      tableAddrs.push({ pc: row.pc, pair: row.inst.pair, addr: row.inst.value });
    }
  }
  if (tableAddrs.length > 0) {
    console.log(`\n  Potential table base addresses loaded:`);
    for (const t of tableAddrs) {
      console.log(`    ${hex(t.pc)}: LD ${t.pair.toUpperCase()}, ${hex(t.addr)}`);
      // Dump first 64 bytes of potential table
      console.log(`    Table dump at ${hex(t.addr)}:`);
      for (let off = 0; off < 64; off += 16) {
        const a = t.addr + off;
        if (a >= ROM_SIZE) break;
        const len = Math.min(16, ROM_SIZE - a);
        console.log(`      ${hex(a)} : ${bytesToHex(rom, a, len)}`);
      }
    }
  }

  return { callSites, tableAddrs };
}

/* ── PART D: Dynamic trace ───────────────────────────────────────── */

function partD(baselineMemory) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART D: Dynamic trace of 0x049E07 with various D177B9 values');
  console.log('#'.repeat(80));

  // Read baseline D177B9 value
  const baseD177B9 = baselineMemory[STATE_BYTE];
  console.log(`\n  Baseline D177B9 value after boot: ${hexByte(baseD177B9)}`);

  const testCases = [
    { d177b9: baseD177B9, a: 0x21, label: `D177B9=${hexByte(baseD177B9)} (baseline), A=0x21` },
    { d177b9: 0x00, a: 0x21, label: 'D177B9=0x00, A=0x21 (scan code "1")' },
    { d177b9: 0x01, a: 0x21, label: 'D177B9=0x01, A=0x21' },
    { d177b9: 0x02, a: 0x21, label: 'D177B9=0x02, A=0x21' },
    { d177b9: 0x03, a: 0x21, label: 'D177B9=0x03, A=0x21' },
    { d177b9: 0x55, a: 0x21, label: 'D177B9=0x55, A=0x21' },
    { d177b9: 0x00, a: 0x00, label: 'D177B9=0x00, A=0x00 (no key)' },
    { d177b9: 0x00, a: 0x09, label: 'D177B9=0x00, A=0x09 (ENTER)' },
    { d177b9: 0x00, a: 0x38, label: 'D177B9=0x00, A=0x38' },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Dynamic trace: ${tc.label} ---`);

    const mem = new Uint8Array(baselineMemory);
    const { executor, cpu } = createRuntime(mem);

    resetCpuState(cpu, mem);

    // Set state byte
    mem[STATE_BYTE] = tc.d177b9;

    // Set A register (potential scan code input)
    cpu.a = tc.a & 0xFF;

    // Seed keyboard scratch vars
    mem[KBD_RAW_SCAN] = tc.a;
    mem[KBD_KEY] = tc.a;
    mem[KBD_GETKY] = tc.a;
    mem[KBD_GETCSC_SCAN] = tc.a;

    // Record initial values
    const initialD00824 = mem[KEY_CODE_D00824] | (mem[KEY_CODE_D00824 + 1] << 8);
    const initialD00826 = mem[KEY_CODE_D00826] | (mem[KEY_CODE_D00826 + 1] << 8);

    // Push return sentinel
    push24(cpu, mem, RETURN_SENTINEL);

    const visited = [];
    const memWrites = [];
    const watchAddrs = new Set([
      STATE_BYTE,
      KEY_CODE_D00824, KEY_CODE_D00824 + 1,
      KEY_CODE_D00826, KEY_CODE_D00826 + 1,
      KBD_GETCSC_SCAN,
    ]);

    let termination = 'unknown';
    let steps = 0;

    try {
      executor.runFrom(TARGET_FUNC, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 64,
        onBlock(pc, _mode, _meta, step) {
          steps = step;
          visited.push({
            step,
            pc: pc & 0xFFFFFF,
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            hl: cpu.hl & 0xFFFFFF,
            de: cpu.de & 0xFFFFFF,
            bc: cpu.bc & 0xFFFFFF,
            missing: false,
          });
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            throw stopError('return_sentinel');
          }
        },
        onMissingBlock(pc, _mode, step) {
          steps = step;
          visited.push({
            step,
            pc: pc & 0xFFFFFF,
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            hl: cpu.hl & 0xFFFFFF,
            de: cpu.de & 0xFFFFFF,
            bc: cpu.bc & 0xFFFFFF,
            missing: true,
          });
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            throw stopError('return_sentinel');
          }
        },
        onWrite(addr, value) {
          const normalized = addr & 0xFFFFFF;
          if (watchAddrs.has(normalized)) {
            memWrites.push({
              addr: normalized,
              value: value & 0xFF,
              step: visited.length,
            });
          }
        },
      });
      termination = 'max_steps';
    } catch (error) {
      if (error?.message === '__PHASE224_STOP__' && error.stopName === 'return_sentinel') {
        termination = 'sentinel';
      } else {
        console.log(`    ERROR: ${error.message}`);
        termination = `error: ${error.message}`;
      }
    }

    // Final state
    const finalD00824 = mem[KEY_CODE_D00824] | (mem[KEY_CODE_D00824 + 1] << 8);
    const finalD00826 = mem[KEY_CODE_D00826] | (mem[KEY_CODE_D00826 + 1] << 8);
    const finalD177B9 = mem[STATE_BYTE];

    console.log(`  Termination: ${termination}`);
    console.log(`  Steps executed: ${steps}`);
    console.log(`  Blocks visited: ${visited.length}`);
    console.log(`  Register state at exit:`);
    console.log(`    A  = ${hexByte(cpu.a)}  F  = ${hexByte(cpu.f)}`);
    console.log(`    HL = ${hex(cpu.hl)}  DE = ${hex(cpu.de)}  BC = ${hex(cpu.bc)}`);
    console.log(`    SP = ${hex(cpu.sp)}  PC = ${hex(cpu.pc)}`);
    console.log(`  Key variables:`);
    console.log(`    D177B9: ${hexByte(tc.d177b9)} -> ${hexByte(finalD177B9)}${tc.d177b9 !== finalD177B9 ? ' CHANGED' : ''}`);
    console.log(`    D00824: ${hex(initialD00824, 4)} -> ${hex(finalD00824, 4)}${initialD00824 !== finalD00824 ? ' CHANGED' : ''}`);
    console.log(`    D00826: ${hex(initialD00826, 4)} -> ${hex(finalD00826, 4)}${initialD00826 !== finalD00826 ? ' CHANGED' : ''}`);

    if (memWrites.length > 0) {
      console.log(`  Watched writes: ${memWrites.length}`);
      for (const w of memWrites) {
        console.log(`    step ${w.step}: write ${hexByte(w.value)} to ${hex(w.addr)}`);
      }
    } else {
      console.log('  Watched writes: none');
    }

    console.log('  Block trace:');
    for (const v of visited) {
      const tag = v.missing ? 'MISSING' : 'block  ';
      console.log(
        `    step ${String(v.step).padStart(3)} ${tag} ${hex(v.pc)} A=${hexByte(v.a)} F=${hexByte(v.f)} HL=${hex(v.hl)} DE=${hex(v.de)} BC=${hex(v.bc)}`,
      );
    }
  }
}

/* ── PART E: Dump key code tables ────────────────────────────────── */

function partE(tableAddrs) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART E: Dump potential key code tables');
  console.log('#'.repeat(80));

  // Always dump some known potential table regions near 0x049E07
  const tableCandidates = [
    ...tableAddrs.map((t) => ({ addr: t.addr, label: `loaded at ${hex(t.pc)} via LD ${t.pair.toUpperCase()}` })),
  ];

  // Also look for tables immediately after the function
  // (common pattern: function followed by its lookup table)
  const afterFunc = TARGET_FUNC + 300;
  tableCandidates.push({ addr: afterFunc, label: 'bytes after function body' });

  for (const table of tableCandidates) {
    console.log(`\n  Table at ${hex(table.addr)} (${table.label}):`);
    for (let off = 0; off < 128; off += 16) {
      const a = table.addr + off;
      if (a >= ROM_SIZE) break;
      const len = Math.min(16, ROM_SIZE - a);
      const hexStr = bytesToHex(rom, a, len);
      const ascii = Array.from(rom.slice(a, a + len), (b) =>
        b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.',
      ).join('');
      console.log(`    ${hex(a)} : ${hexStr.padEnd(48)} ${ascii}`);
    }
  }

  // Also dump sub-call targets from part B to see if they contain table lookups
  console.log('\n  Sub-call target disassembly (first 64 bytes each):');
}

/* ── PART F: Disassemble sub-call targets ────────────────────────── */

function partF(subCalls, functionEnd) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART F: Disassemble sub-call targets from 0x049E07');
  console.log('#'.repeat(80));

  const relevantCalls = functionEnd
    ? subCalls.filter((s) => s.pc <= functionEnd)
    : subCalls;
  const uniqueTargets = [...new Set(relevantCalls.map((s) => s.target))].sort((a, b) => a - b);

  for (const target of uniqueTargets) {
    if (target < ROM_SIZE) {
      const rows = disassembleLinear(target, target + 0x80);
      printDisassembly(`Sub-function at ${hex(target)}`, rows);

      const innerCalls = rows.filter((r) => r.inst?.tag === 'call' || r.inst?.tag === 'call-conditional');
      if (innerCalls.length > 0) {
        console.log(`  Inner calls:`);
        for (const c of innerCalls) {
          console.log(`    ${hex(c.pc)} -> ${hex(c.inst.target)}  (${c.text})`);
        }
      }

      // Look for table-related patterns
      const cpInstrs = rows.filter((r) =>
        r.inst?.tag === 'alu-imm' && (r.inst.op === 'cp' || r.inst.op === 'sub'),
      );
      if (cpInstrs.length > 0) {
        console.log(`  CP/SUB immediates:`);
        for (const c of cpInstrs) {
          console.log(`    ${hex(c.pc)} ${c.text}`);
        }
      }

      const jpInd = rows.filter((r) => r.inst?.tag === 'jp-indirect');
      if (jpInd.length > 0) {
        console.log(`  *** JP indirect (dispatch): ***`);
        for (const j of jpInd) {
          console.log(`    ${hex(j.pc)} ${j.text}`);
        }
      }

      const ldPairImm = rows.filter((r) =>
        r.inst?.tag === 'ld-pair-imm' && (r.inst.pair === 'hl' || r.inst.pair === 'de'),
      );
      if (ldPairImm.length > 0) {
        console.log(`  LD HL/DE,nn (potential tables):`);
        for (const l of ldPairImm) {
          console.log(`    ${hex(l.pc)} ${l.text}`);
        }
      }
    }
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

function main() {
  console.log('Phase 224: Trace 0x049E07 switch dispatcher (called by 0x02F68A key pipeline)');
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  // Part A: Static disassembly
  const aRows = partA();

  // Part B: Function boundary
  const { functionEnd, subCalls } = partB();

  // Part C: Dispatch mechanism analysis
  const { tableAddrs } = partC(aRows);

  // Part E: Table dumps
  partE(tableAddrs);

  // Part F: Sub-call target disassembly
  if (subCalls.length > 0) {
    partF(subCalls, functionEnd);
  }

  // Part D: Dynamic trace (requires boot)
  console.log('\n' + '#'.repeat(80));
  console.log('# Booting baseline for dynamic traces...');
  console.log('#'.repeat(80));

  const baselineMemory = bootBaseline();
  partD(baselineMemory);

  console.log('\n' + '#'.repeat(80));
  console.log('# SUMMARY');
  console.log('#'.repeat(80));

  console.log(`\n  Target function: ${hex(TARGET_FUNC)}`);
  console.log(`  Caller: ${hex(CALLER_FUNC)} (calls it twice)`);
  console.log(`  State byte: ${hex(STATE_BYTE)} (D177B9)`);
  if (functionEnd) {
    console.log(`  Estimated size: ${functionEnd - TARGET_FUNC + 1} bytes (${hex(TARGET_FUNC)} to ${hex(functionEnd)})`);
  }
  console.log(`  Sub-calls: ${subCalls.length}`);
  for (const s of subCalls) {
    console.log(`    ${hex(s.pc)} -> ${hex(s.target)}`);
  }
  console.log('\nDone.');
}

main();
