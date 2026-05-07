#!/usr/bin/env node

/**
 * Phase 223: Trace 0x02F68A as a function in the _GetKey chain
 *
 * Context: Session 222 confirmed 0x02F68A is CODE (a CALL target), not data.
 * The only ROM reference is `CALL 0x02F68A` at 0x04AB91.
 * This function is part of the _GetKey chain — _GetKey HALTs, ISR delivers
 * key code. 0x02F68A is called in post-HALT processing.
 *
 * Parts:
 *  A. Static disassembly of 0x02F68A (~200 bytes)
 *  B. Find function boundary (RET scan)
 *  C. Context around the call site at 0x04AB91
 *  D. Dynamic trace — boot CPU, call 0x02F68A with A=0x21
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
const TARGET_FUNC = 0x02F68A;
const CALL_SITE = 0x04AB91;

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
  const error = new Error('__PHASE223_STOP__');
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

/* ── Boot baseline (same as phase 222 probe) ─────────────────────── */

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
    if (error?.message === '__PHASE223_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log('  Boot baseline complete.');
  console.log(`    memInit returned via sentinel: ${memInitReturned ? 'yes' : 'no'}`);

  return new Uint8Array(mem);
}

/* ── PART A: Static disassembly of 0x02F68A ──────────────────────── */

function partA() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART A: Static disassembly of 0x02F68A (~200 bytes)');
  console.log('#'.repeat(80));

  // Raw hex dump first
  console.log(`\nRaw hex dump ${hex(TARGET_FUNC)} - ${hex(TARGET_FUNC + 200)}:`);
  for (let offset = 0; offset < 200; offset += 16) {
    const addr = TARGET_FUNC + offset;
    const len = Math.min(16, 200 - offset);
    const hexStr = bytesToHex(rom, addr, len);
    const ascii = Array.from(rom.slice(addr, addr + len), (b) =>
      b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.',
    ).join('');
    console.log(`  ${hex(addr)} : ${hexStr.padEnd(48)} ${ascii}`);
  }

  // Disassembly
  const rows = disassembleLinear(TARGET_FUNC, TARGET_FUNC + 200);
  printDisassembly(`Disassembly of ${hex(TARGET_FUNC)} (+200 bytes)`, rows);

  // Extract CALL targets
  const calls = rows.filter((r) => r.inst?.tag === 'call' || r.inst?.tag === 'call-conditional');
  console.log(`\n  CALL instructions found: ${calls.length}`);
  for (const c of calls) {
    console.log(`    ${hex(c.pc)} -> ${hex(c.inst.target)}  (${c.text})`);
  }

  // Extract JP targets
  const jumps = rows.filter((r) =>
    r.inst?.tag === 'jp' || r.inst?.tag === 'jp-conditional' ||
    r.inst?.tag === 'jr' || r.inst?.tag === 'jr-conditional',
  );
  console.log(`\n  JP/JR instructions found: ${jumps.length}`);
  for (const j of jumps) {
    console.log(`    ${hex(j.pc)} -> ${hex(j.inst.target)}  (${j.text})`);
  }

  // Look for key patterns
  const cpInstructions = rows.filter((r) =>
    r.inst?.tag === 'alu-imm' && (r.inst.op === 'cp' || r.inst.op === 'sub'),
  );
  console.log(`\n  CP/SUB immediate instructions: ${cpInstructions.length}`);
  for (const c of cpInstructions) {
    console.log(`    ${hex(c.pc)} ${c.text}`);
  }

  const ldAInd = rows.filter((r) =>
    r.inst?.tag === 'ld-reg-ind' && r.inst.dest === 'a',
  );
  console.log(`\n  LD A,(reg) instructions: ${ldAInd.length}`);
  for (const l of ldAInd) {
    console.log(`    ${hex(l.pc)} ${l.text}`);
  }

  const memReads = rows.filter((r) => r.inst?.tag === 'ld-reg-mem' && r.inst.dest === 'a');
  const memWrites = rows.filter((r) => r.inst?.tag === 'ld-mem-reg' && r.inst.src === 'a');
  console.log(`\n  LD A,(nn) memory reads: ${memReads.length}`);
  for (const m of memReads) {
    console.log(`    ${hex(m.pc)} ${m.text}`);
  }
  console.log(`  LD (nn),A memory writes: ${memWrites.length}`);
  for (const m of memWrites) {
    console.log(`    ${hex(m.pc)} ${m.text}`);
  }

  return rows;
}

/* ── PART B: Find function boundary ──────────────────────────────── */

function partB() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART B: Find function boundary (RET scan)');
  console.log('#'.repeat(80));

  // Scan for RET instructions
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
      // Verify it's actually a RET and not part of a multi-byte instruction
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

  // First unconditional RET gives estimated function size
  if (retLocations.length > 0) {
    const first = retLocations[0];
    console.log(`\n  First unconditional RET at ${hex(first.addr)} -> estimated function size: ${first.offset + 1} bytes`);
  }

  // Now do a more careful scan: disassemble and track all sub-calls
  const allRows = disassembleLinear(TARGET_FUNC, TARGET_FUNC + 512);
  const subCalls = [];
  let functionEnd = null;

  for (const row of allRows) {
    if (!row.inst) continue;

    if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
      subCalls.push({ pc: row.pc, target: row.inst.target, text: row.text });
    }

    // First unconditional RET that's NOT inside a conditional block
    if (row.inst.tag === 'ret' && !functionEnd) {
      functionEnd = row.pc;
    }
  }

  console.log(`\n  All sub-calls within 0x02F68A..0x02F68A+512:`);
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

/* ── PART C: Context around call site 0x04AB91 ───────────────────── */

function partC() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART C: Context around call site at 0x04AB91');
  console.log('#'.repeat(80));

  const contextStart = 0x04AB80;
  const contextEnd = 0x04ABB0;

  // Raw hex dump
  console.log(`\nRaw hex dump ${hex(contextStart)} - ${hex(contextEnd)}:`);
  for (let addr = contextStart; addr < contextEnd; addr += 16) {
    const len = Math.min(16, contextEnd - addr);
    console.log(`  ${hex(addr)} : ${bytesToHex(rom, addr, len)}`);
  }

  // Disassembly
  const rows = disassembleLinear(contextStart, contextEnd);
  printDisassembly(`Context around CALL ${hex(TARGET_FUNC)} at ${hex(CALL_SITE)}`, rows);

  // Mark the call site
  const callRow = rows.find((r) => r.pc === CALL_SITE);
  if (callRow) {
    console.log(`\n  >>> CALL instruction at ${hex(CALL_SITE)}: ${callRow.text}`);
  }

  // Analyze what comes before the CALL (register setup)
  console.log('\n  Pre-CALL register context (instructions before 0x04AB91):');
  const preCAll = rows.filter((r) => r.pc < CALL_SITE && r.pc >= CALL_SITE - 20);
  for (const r of preCAll) {
    console.log(`    ${hex(r.pc)} ${r.bytes.padEnd(20)} ${r.text}`);
  }

  // Analyze what comes after the CALL (result usage)
  console.log('\n  Post-CALL instructions (after 0x04AB91):');
  const postCall = rows.filter((r) => r.pc > CALL_SITE && r.pc <= CALL_SITE + 20);
  for (const r of postCall) {
    console.log(`    ${hex(r.pc)} ${r.bytes.padEnd(20)} ${r.text}`);
  }

  // Wider context: what function is 0x04AB91 inside?
  console.log('\n  Wider context (0x04AB60 - 0x04AC00):');
  const widerRows = disassembleLinear(0x04AB60, 0x04AC00);
  printDisassembly('Wider context around call site', widerRows);

  return rows;
}

/* ── PART D: Dynamic trace ───────────────────────────────────────── */

function partD(baselineMemory) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART D: Dynamic trace of 0x02F68A');
  console.log('#'.repeat(80));

  const testCases = [
    { scanCode: 0x21, label: 'A=0x21 (scan code for "1" key, group 4 bit 1)' },
    { scanCode: 0x00, label: 'A=0x00 (no key)' },
    { scanCode: 0x09, label: 'A=0x09 (ENTER key)' },
    { scanCode: 0x38, label: 'A=0x38 (a typical scan code)' },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Dynamic trace: ${tc.label} ---`);

    const mem = new Uint8Array(baselineMemory);
    const { executor, cpu } = createRuntime(mem);

    resetCpuState(cpu, mem);

    // Seed keyboard scratch vars
    mem[KBD_RAW_SCAN] = tc.scanCode;
    mem[KBD_KEY] = tc.scanCode;
    mem[KBD_GETKY] = tc.scanCode;
    mem[KBD_GETCSC_SCAN] = tc.scanCode;

    // Record initial values of key storage vars
    const initialD00824 = mem[KEY_CODE_D00824] | (mem[KEY_CODE_D00824 + 1] << 8);
    const initialD00826 = mem[KEY_CODE_D00826] | (mem[KEY_CODE_D00826 + 1] << 8);

    // Set input register
    cpu.a = tc.scanCode & 0xFF;

    // Push return sentinel
    push24(cpu, mem, RETURN_SENTINEL);

    const visited = [];
    const memWrites = [];
    const watchAddrs = new Set([
      KEY_CODE_D00824, KEY_CODE_D00824 + 1,
      KEY_CODE_D00826, KEY_CODE_D00826 + 1,
      KBD_GETCSC_SCAN,
    ]);

    // Intercept writes to watched addresses
    const originalWrite8 = cpu.write8?.bind(cpu);
    if (originalWrite8) {
      cpu.write8 = (addr, value) => {
        const normalized = addr & 0xFFFFFF;
        if (watchAddrs.has(normalized)) {
          memWrites.push({
            addr: normalized,
            value: value & 0xFF,
            step: visited.length,
          });
        }
        return originalWrite8(addr, value);
      };
    }

    let termination = 'unknown';
    let steps = 0;

    try {
      const result = executor.runFrom(TARGET_FUNC, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
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
      });
      termination = result.termination ?? 'unknown';
    } catch (error) {
      if (error?.message === '__PHASE223_STOP__' && error.stopName === 'return_sentinel') {
        termination = 'sentinel';
      } else {
        console.log(`    ERROR: ${error.message}`);
        termination = `error: ${error.message}`;
      }
    }

    if (originalWrite8) {
      cpu.write8 = originalWrite8;
    }

    // Final state
    const finalD00824 = mem[KEY_CODE_D00824] | (mem[KEY_CODE_D00824 + 1] << 8);
    const finalD00826 = mem[KEY_CODE_D00826] | (mem[KEY_CODE_D00826 + 1] << 8);

    console.log(`  Termination: ${termination}`);
    console.log(`  Steps executed: ${steps}`);
    console.log(`  Blocks visited: ${visited.length}`);
    console.log(`  Register state at exit:`);
    console.log(`    A  = ${hexByte(cpu.a)}  F  = ${hexByte(cpu.f)}`);
    console.log(`    HL = ${hex(cpu.hl)}  DE = ${hex(cpu.de)}  BC = ${hex(cpu.bc)}`);
    console.log(`    SP = ${hex(cpu.sp)}  PC = ${hex(cpu.pc)}`);
    console.log(`  Key storage vars:`);
    console.log(`    D00824: ${hex(initialD00824, 4)} -> ${hex(finalD00824, 4)}${initialD00824 !== finalD00824 ? ' CHANGED' : ''}`);
    console.log(`    D00826: ${hex(initialD00826, 4)} -> ${hex(finalD00826, 4)}${initialD00826 !== finalD00826 ? ' CHANGED' : ''}`);
    console.log(`    D0058E: ${hexByte(tc.scanCode)} -> ${hexByte(mem[KBD_GETCSC_SCAN])}${tc.scanCode !== mem[KBD_GETCSC_SCAN] ? ' CHANGED' : ''}`);

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

/* ── PART E: Disassemble sub-call targets found in Part A ────────── */

function partE(subCalls) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART E: Disassemble sub-call targets from 0x02F68A');
  console.log('#'.repeat(80));

  const uniqueTargets = [...new Set(subCalls.map((s) => s.target))].sort((a, b) => a - b);

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

      const innerCps = rows.filter((r) =>
        r.inst?.tag === 'alu-imm' && (r.inst.op === 'cp' || r.inst.op === 'sub'),
      );
      if (innerCps.length > 0) {
        console.log(`  CP/SUB immediates:`);
        for (const c of innerCps) {
          console.log(`    ${hex(c.pc)} ${c.text}`);
        }
      }
    }
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

function main() {
  console.log('Phase 223: Trace 0x02F68A as a function in the _GetKey chain');
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  // Part A: Static disassembly
  const aRows = partA();

  // Part B: Function boundary
  const { functionEnd, subCalls } = partB();

  // Part C: Call site context
  partC();

  // Part E: Sub-call target disassembly (before dynamic to get static picture first)
  if (subCalls.length > 0) {
    // Filter to calls within the function boundary
    const relevantCalls = functionEnd
      ? subCalls.filter((s) => s.pc <= functionEnd)
      : subCalls;
    partE(relevantCalls);
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
  console.log(`  Only caller: CALL ${hex(TARGET_FUNC)} at ${hex(CALL_SITE)}`);
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
