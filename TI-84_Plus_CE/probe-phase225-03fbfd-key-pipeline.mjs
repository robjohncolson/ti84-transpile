#!/usr/bin/env node

/**
 * Phase 225: Trace 0x03FBFD key pipeline function
 *
 * Context: 0x084E98 (362 bytes) handles key codes after they arrive in A.
 * It has 3 callers:
 *   - 0x084D34 (after CALL 0x084ADF)
 *   - 0x084D4F (after CALL 0x03FBFD) <-- our target
 *   - 0x084D6E (hardcodes A=0x4A)
 *
 * 0x03FBFD is called as part of the key processing pipeline BEFORE the
 * D00824 writer at 0x084E98. We need to understand what it does.
 *
 * Parts:
 *  A. Static disassembly of 0x03FBFD (~200 bytes)
 *  B. Find function boundary (backward RET scan + forward RET scan)
 *  C. Find ALL callers in ROM (CALL/JP 0x03FBFD)
 *  D. Dynamic trace — boot CPU, call 0x03FBFD with A=0x8F, trace 500 steps
 *  E. Disassemble sub-call targets found in Part A
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
const ROM_SCAN_LIMIT = Math.min(rom.length, 0x0C0000);

/* -- Key addresses ---------------------------------------------------- */

const TARGET_FUNC = 0x03FBFD;
const CALLER_SITE = 0x084D4F; // CALL 0x03FBFD at this address

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
const KBD_GETCSC_SCAN = 0xD0058E;
const KEY_CODE_D00824 = 0xD00824;
const KEY_CODE_D00826 = 0xD00826;
const VAR_D0059F = 0xD0059F;

// RET-family opcodes
const RET_OPCODES = new Set([0xC9]); // unconditional RET
const COND_RET_OPCODES = new Set([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8]);

/* -- Utility helpers -------------------------------------------------- */

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
  const end = Math.min(buffer.length, start + length);
  return Array.from(buffer.slice(start, end), (byte) =>
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

function read24(mem, addr) {
  const normalized = addr & 0xFFFFFF;
  return mem[normalized] | (mem[normalized + 1] << 8) | (mem[normalized + 2] << 16);
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE225_STOP__');
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

/* -- Disassembly ------------------------------------------------------ */

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
    const annotation = annotateRow(row);
    const suffix = annotation ? `  ; ${annotation}` : '';
    console.log(`  ${hex(row.pc)} ${marker}${row.bytes.padEnd(20)} ${row.text}${suffix}`);
  }
}

function annotateRow(row) {
  const inst = row.inst;
  if (!inst) return '';

  const resolved = formatResolvedAddress(inst);

  if (resolved === KEY_CODE_D00824) return '<-- D00824 (key code storage)';
  if (resolved === KEY_CODE_D00826) return '<-- D00826';
  if (resolved === KBD_GETCSC_SCAN) return '<-- D0058E (GetCSC scan code)';
  if (resolved === VAR_D0059F) return '<-- D0059F';

  // IY+offset annotations
  if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
    const absAddr = IY_ADDR + inst.displacement;
    return `<-- IY+${inst.displacement} = ${hex(absAddr)}`;
  }

  return '';
}

/* -- Part A: Static disassembly of 0x03FBFD --------------------------- */

function partA() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART A: Static disassembly of 0x03FBFD (~200 bytes)');
  console.log('#'.repeat(80));

  // Raw hex dump
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

  // Extract JP/JR targets
  const jumps = rows.filter((r) =>
    r.inst?.tag === 'jp' || r.inst?.tag === 'jp-conditional' ||
    r.inst?.tag === 'jr' || r.inst?.tag === 'jr-conditional',
  );
  console.log(`\n  JP/JR instructions found: ${jumps.length}`);
  for (const j of jumps) {
    console.log(`    ${hex(j.pc)} -> ${hex(j.inst.target)}  (${j.text})`);
  }

  // CP/SUB immediate instructions
  const cpInstructions = rows.filter((r) =>
    r.inst?.tag === 'alu-imm' && (r.inst.op === 'cp' || r.inst.op === 'sub'),
  );
  console.log(`\n  CP/SUB immediate instructions: ${cpInstructions.length}`);
  for (const c of cpInstructions) {
    console.log(`    ${hex(c.pc)} ${c.text}  (value = ${c.inst.value} decimal)`);
  }

  // Memory reads/writes
  const memReads = rows.filter((r) => r.inst?.tag === 'ld-reg-mem');
  const memWrites = rows.filter((r) => r.inst?.tag === 'ld-mem-reg');
  console.log(`\n  Memory reads (LD reg,(nn)): ${memReads.length}`);
  for (const m of memReads) {
    const resolved = formatResolvedAddress(m.inst);
    console.log(`    ${hex(m.pc)} ${m.text}  -> addr ${hex(resolved)}`);
  }
  console.log(`  Memory writes (LD (nn),reg): ${memWrites.length}`);
  for (const m of memWrites) {
    const resolved = formatResolvedAddress(m.inst);
    console.log(`    ${hex(m.pc)} ${m.text}  -> addr ${hex(resolved)}`);
  }

  // IY-indexed operations
  const iyOps = rows.filter((r) => r.inst?.indexRegister === 'iy');
  console.log(`\n  IY-indexed operations: ${iyOps.length}`);
  for (const r of iyOps) {
    const absAddr = IY_ADDR + (r.inst.displacement ?? 0);
    console.log(`    ${hex(r.pc)} ${r.text}  -> IY+${r.inst.displacement} = ${hex(absAddr)}`);
  }

  // BIT test instructions
  const bitTests = rows.filter((r) =>
    r.inst?.tag === 'bit-test' || r.inst?.tag === 'bit-test-ind' ||
    r.inst?.tag === 'indexed-cb-bit',
  );
  console.log(`\n  BIT test instructions: ${bitTests.length}`);
  for (const b of bitTests) {
    console.log(`    ${hex(b.pc)} ${b.text}`);
  }

  // RET instructions
  const rets = rows.filter((r) => r.inst?.tag === 'ret' || r.inst?.tag === 'ret-conditional');
  console.log(`\n  RET instructions: ${rets.length}`);
  for (const r of rets) {
    console.log(`    ${hex(r.pc)} ${r.text}`);
  }

  return rows;
}

/* -- Part B: Find function boundary ----------------------------------- */

function partB() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART B: Find function boundary');
  console.log('#'.repeat(80));

  // Scan backward from 0x03FBFD for RET/JP to find start
  console.log('\n--- Backward scan from 0x03FBFD ---');
  let backwardStart = null;

  for (let addr = TARGET_FUNC - 1; addr >= Math.max(0, TARGET_FUNC - 512); addr--) {
    if (rom[addr] === 0xC9) {
      backwardStart = addr + 1;
      console.log(`  Found RET at ${hex(addr)}, function likely starts at ${hex(addr + 1)}`);
      break;
    }
    // Unconditional JP = C3 xx xx xx
    if (rom[addr] === 0xC3 && addr + 3 < TARGET_FUNC) {
      const candidate = addr + 4;
      const inst = decodeSafe(candidate);
      if (inst && inst.length > 0) {
        console.log(`  Found JP at ${hex(addr)}, possible function start at ${hex(candidate)}`);
        if (!backwardStart) backwardStart = candidate;
      }
    }
    // Known block entry
    if (BLOCKS[blockId(addr)]) {
      console.log(`  Found block entry at ${hex(addr)}`);
      if (!backwardStart) backwardStart = addr;
    }
  }

  if (!backwardStart) {
    backwardStart = TARGET_FUNC;
    console.log(`  No boundary found; using TARGET_FUNC as start`);
  }

  // Show the bytes between backward boundary and TARGET_FUNC
  if (backwardStart < TARGET_FUNC) {
    console.log(`\n  Bytes between boundary and target:`);
    const preRows = disassembleLinear(backwardStart, TARGET_FUNC + 4);
    printDisassembly(`Pre-function context (${hex(backwardStart)} to ${hex(TARGET_FUNC)})`, preRows);
  }

  // Scan forward for RET instructions
  console.log('\n--- Forward scan from 0x03FBFD ---');
  const retLocations = [];
  const condRetLocations = [];

  for (let offset = 0; offset < 512; offset++) {
    const addr = TARGET_FUNC + offset;
    if (addr >= ROM_SIZE) break;

    if (RET_OPCODES.has(rom[addr])) {
      retLocations.push({ addr, offset, type: 'RET' });
    }
    if (COND_RET_OPCODES.has(rom[addr])) {
      const inst = decodeSafe(addr);
      if (inst && inst.tag === 'ret-conditional') {
        condRetLocations.push({ addr, offset, type: `RET ${inst.condition}` });
      }
    }
  }

  console.log(`\n  Unconditional RET locations from ${hex(TARGET_FUNC)}:`);
  for (const r of retLocations.slice(0, 10)) {
    console.log(`    ${hex(r.addr)} (offset +${r.offset} = ${r.offset} bytes)`);
  }

  console.log(`\n  Conditional RET locations:`);
  for (const r of condRetLocations.slice(0, 10)) {
    console.log(`    ${hex(r.addr)} (offset +${r.offset}) ${r.type}`);
  }

  // First unconditional RET gives estimated function size
  let functionEnd = null;
  if (retLocations.length > 0) {
    const first = retLocations[0];
    functionEnd = first.addr;
    console.log(`\n  First unconditional RET at ${hex(first.addr)} -> estimated function size: ${first.offset + 1} bytes`);
  }

  // Detailed disassembly up to first RET + a bit more
  const disasmEnd = functionEnd ? functionEnd + 20 : TARGET_FUNC + 300;
  const allRows = disassembleLinear(TARGET_FUNC, disasmEnd);
  const subCalls = [];

  for (const row of allRows) {
    if (!row.inst) continue;
    if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
      subCalls.push({ pc: row.pc, target: row.inst.target, text: row.text });
    }
  }

  console.log(`\n  All sub-calls within function:`);
  for (const s of subCalls) {
    const past = functionEnd && s.pc > functionEnd ? ' [PAST FIRST RET]' : '';
    console.log(`    ${hex(s.pc)} -> ${hex(s.target)}  (${s.text})${past}`);
  }

  if (functionEnd) {
    const funcSize = functionEnd - TARGET_FUNC + 1;
    console.log(`\n  Function boundary estimate: ${hex(TARGET_FUNC)} to ${hex(functionEnd)} (${funcSize} bytes)`);
  }

  return { backwardStart, functionEnd, subCalls };
}

/* -- Part C: Find ALL callers in ROM ---------------------------------- */

function scanForCallersOf(target) {
  const results = [];
  const targetLE = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];

  const opcodes = [
    [0xCD, 'CALL'],
    [0xC3, 'JP'],
    [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
    [0xD4, 'CALL NC'], [0xDC, 'CALL C'],
    [0xC2, 'JP NZ'], [0xCA, 'JP Z'],
    [0xD2, 'JP NC'], [0xDA, 'JP C'],
  ];

  for (let addr = 0; addr < ROM_SCAN_LIMIT - 4; addr++) {
    for (const [opcode, type] of opcodes) {
      if (rom[addr] === opcode &&
          rom[addr + 1] === targetLE[0] &&
          rom[addr + 2] === targetLE[1] &&
          rom[addr + 3] === targetLE[2]) {
        results.push({ addr, type, target, bytes: bytesToHex(rom, addr, 4) });
      }
    }
  }

  // Also scan for JR instructions targeting our address
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 2; addr++) {
    const opcode = rom[addr];
    const jrOpcodes = { 0x18: 'JR', 0x28: 'JR Z', 0x20: 'JR NZ', 0x38: 'JR C', 0x30: 'JR NC' };
    if (jrOpcodes[opcode]) {
      const offset = rom[addr + 1];
      const signedOffset = offset >= 128 ? offset - 256 : offset;
      const jumpTarget = addr + 2 + signedOffset;
      if (jumpTarget === target) {
        results.push({ addr, type: jrOpcodes[opcode], target, bytes: bytesToHex(rom, addr, 2) });
      }
    }
  }

  return results;
}

function partC() {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART C: Find ALL callers of 0x03FBFD in ROM');
  console.log('#'.repeat(80));

  const callers = scanForCallersOf(TARGET_FUNC);
  console.log(`\n  Total callers of ${hex(TARGET_FUNC)}: ${callers.length}`);

  for (const c of callers) {
    console.log(`\n  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);

    // Show context around the caller (20 bytes before, 20 after)
    const contextStart = Math.max(0, c.addr - 24);
    const contextEnd = Math.min(ROM_SIZE, c.addr + 24);
    const contextRows = disassembleLinear(contextStart, contextEnd);
    console.log(`  Context (${hex(contextStart)}-${hex(contextEnd)}):`);
    for (const row of contextRows) {
      const marker = row.pc === c.addr ? '  >>>' : '     ';
      const annotation = annotateRow(row);
      const suffix = annotation ? `  ; ${annotation}` : '';
      console.log(`${marker} ${hex(row.pc)} ${row.bytes.padEnd(20)} ${row.text}${suffix}`);
    }
  }

  // Also look at context around the known caller site 0x084D4F
  console.log(`\n--- Known caller site context: ${hex(CALLER_SITE)} ---`);
  const callerRows = disassembleLinear(CALLER_SITE - 32, CALLER_SITE + 32);
  printDisassembly(`Context around caller at ${hex(CALLER_SITE)}`, callerRows);

  return callers;
}

/* -- Boot baseline ---------------------------------------------------- */

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
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log('  Boot baseline complete.');
  console.log(`    memInit returned via sentinel: ${memInitReturned ? 'yes' : 'no'}`);

  return new Uint8Array(mem);
}

/* -- Part D: Dynamic trace -------------------------------------------- */

function partD(baselineMemory) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART D: Dynamic trace of 0x03FBFD');
  console.log('#'.repeat(80));

  const testCases = [
    { aValue: 0x8F, label: 'A=0x8F (digit "1" key code)' },
    { aValue: 0x00, label: 'A=0x00 (no key)' },
    { aValue: 0x09, label: 'A=0x09 (ENTER key code)' },
    { aValue: 0x70, label: 'A=0x70 (+ key code)' },
    { aValue: 0x05, label: 'A=0x05 (CLEAR key code)' },
    { aValue: 0x38, label: 'A=0x38 (a scan code)' },
    { aValue: 0x4A, label: 'A=0x4A (CP target from 084E98)' },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Dynamic trace: ${tc.label} ---`);

    const mem = new Uint8Array(baselineMemory);
    const { executor, cpu } = createRuntime(mem);

    resetCpuState(cpu, mem);

    // Set input register A
    cpu.a = tc.aValue & 0xFF;

    // Record initial values of key storage vars
    const initialD0058E = mem[KBD_GETCSC_SCAN];
    const initialD00824 = mem[KEY_CODE_D00824];
    const initialD00826 = mem[KEY_CODE_D00826];
    const initialD0059F = mem[VAR_D0059F];

    // Push return sentinel
    push24(cpu, mem, RETURN_SENTINEL);

    const visited = [];

    let termination = 'unknown';
    let steps = 0;

    try {
      executor.runFrom(TARGET_FUNC, 'adl', {
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
      termination = 'maxSteps';
    } catch (error) {
      if (error?.message === '__PHASE225_STOP__' && error.stopName === 'return_sentinel') {
        termination = 'sentinel';
      } else {
        console.log(`    ERROR: ${error.message}`);
        termination = `error: ${error.message}`;
      }
    }

    // Final state
    const finalD0058E = mem[KBD_GETCSC_SCAN];
    const finalD00824 = mem[KEY_CODE_D00824];
    const finalD00826 = mem[KEY_CODE_D00826];
    const finalD0059F = mem[VAR_D0059F];

    console.log(`  Termination: ${termination}`);
    console.log(`  Steps executed: ${steps}`);
    console.log(`  Blocks visited: ${visited.length}`);
    console.log(`  Register state at exit:`);
    console.log(`    A  = ${hexByte(cpu.a)}  F  = ${hexByte(cpu.f)}`);
    console.log(`    HL = ${hex(cpu.hl)}  DE = ${hex(cpu.de)}  BC = ${hex(cpu.bc)}`);
    console.log(`    SP = ${hex(cpu.sp)}  PC = ${hex(cpu.pc)}`);
    console.log(`  Key storage vars:`);
    console.log(`    D0058E: ${hexByte(initialD0058E)} -> ${hexByte(finalD0058E)}${initialD0058E !== finalD0058E ? ' CHANGED' : ''}`);
    console.log(`    D00824: ${hexByte(initialD00824)} -> ${hexByte(finalD00824)}${initialD00824 !== finalD00824 ? ' CHANGED' : ''}`);
    console.log(`    D00826: ${hexByte(initialD00826)} -> ${hexByte(finalD00826)}${initialD00826 !== finalD00826 ? ' CHANGED' : ''}`);
    console.log(`    D0059F: ${hexByte(initialD0059F)} -> ${hexByte(finalD0059F)}${initialD0059F !== finalD0059F ? ' CHANGED' : ''}`);

    console.log('  Block trace:');
    for (const v of visited) {
      const tag = v.missing ? 'MISSING' : 'block  ';
      console.log(
        `    step ${String(v.step).padStart(3)} ${tag} ${hex(v.pc)} A=${hexByte(v.a)} F=${hexByte(v.f)} HL=${hex(v.hl)} DE=${hex(v.de)} BC=${hex(v.bc)}`,
      );
    }
  }
}

/* -- Part E: Disassemble sub-call targets ----------------------------- */

function partE(subCalls) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART E: Disassemble sub-call targets from 0x03FBFD');
  console.log('#'.repeat(80));

  const uniqueTargets = [...new Set(subCalls.map((s) => s.target))].sort((a, b) => a - b);

  for (const target of uniqueTargets) {
    if (target >= ROM_SIZE) continue;

    const rows = disassembleLinear(target, target + 0x80);
    printDisassembly(`Sub-function at ${hex(target)} (first 128 bytes)`, rows);

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
        console.log(`    ${hex(c.pc)} ${c.text}  (value = ${c.inst.value} decimal)`);
      }
    }

    // First RET
    const firstRet = rows.find((r) => r.inst?.tag === 'ret');
    if (firstRet) {
      const size = firstRet.pc - target + 1;
      console.log(`  First RET at ${hex(firstRet.pc)} -> estimated size: ${size} bytes`);
    }
  }
}

/* -- Main ------------------------------------------------------------- */

function main() {
  console.log('Phase 225: Trace 0x03FBFD key pipeline function');
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`ROM scan limit: ${hex(ROM_SCAN_LIMIT)}`);
  console.log(`Target function: ${hex(TARGET_FUNC)}`);
  console.log(`Known caller site: ${hex(CALLER_SITE)}`);

  // Part A: Static disassembly
  const aRows = partA();

  // Part B: Function boundary
  const { backwardStart, functionEnd, subCalls } = partB();

  // Part C: Find all callers
  const callers = partC();

  // Part E: Sub-call targets (before dynamic to get static picture first)
  if (subCalls.length > 0) {
    const relevantCalls = functionEnd
      ? subCalls.filter((s) => s.pc <= functionEnd)
      : subCalls;
    partE(relevantCalls);
  }

  // Part D: Dynamic trace
  console.log('\n' + '#'.repeat(80));
  console.log('# Booting baseline for dynamic traces...');
  console.log('#'.repeat(80));

  const baselineMemory = bootBaseline();
  partD(baselineMemory);

  // Summary
  console.log('\n' + '#'.repeat(80));
  console.log('# SUMMARY');
  console.log('#'.repeat(80));

  console.log(`\n  Target function: ${hex(TARGET_FUNC)}`);
  if (backwardStart && backwardStart < TARGET_FUNC) {
    console.log(`  Backward boundary: ${hex(backwardStart)} (may start before TARGET)`);
  }
  if (functionEnd) {
    const funcSize = functionEnd - TARGET_FUNC + 1;
    console.log(`  First RET at: ${hex(functionEnd)} -> estimated size: ${funcSize} bytes`);
  }
  console.log(`  Total callers in ROM: ${callers.length}`);
  for (const c of callers) {
    console.log(`    ${hex(c.addr)} ${c.type}`);
  }
  console.log(`  Sub-calls from function: ${subCalls.length}`);
  for (const s of subCalls) {
    console.log(`    ${hex(s.pc)} -> ${hex(s.target)}`);
  }
  console.log('\nDone.');
}

main();
