#!/usr/bin/env node

/**
 * Phase 223: Investigate 0x084EA7 as key code entry point from ISR to home-screen dispatch
 *
 * 0x084EA7 is a major D00824 writer with a BIT 6,(IY+54) check.
 * Home-screen key dispatch at 0x0856A8 reads D00824, does CP cascade for
 * special keys, then CALL 0x04E9D8 for others.
 *
 * Part A: Static disassembly of 0x084EA7 and surrounding context
 * Part B: Find all D00824 writers (static ROM scan)
 * Part C: Dynamic trace — call 0x084EA7 with key code, test BIT 6 gate
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

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const ROM_SCAN_LIMIT = Math.min(rom.length, 0x400000);

/* ── Key addresses ─────────────────────────────────────────────────── */

const TARGET_ADDR = 0x084EA7;
const HOME_DISPATCH = 0x0856A8;

const VAR_D00824 = 0xD00824;
const VAR_D00826 = 0xD00826;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

// IY+54 decimal = IY+0x36 hex = 0xD00080 + 0x36 = 0xD000B6
const IY_PLUS_54 = IY_ADDR + 0x36; // 0xD000B6

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const TRACE_MAX_STEPS = 200;
const TRACE_MAX_LOOP_ITERATIONS = 512;

/* ── Utility helpers ───────────────────────────────────────────────── */

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

function formatResolvedAddress(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${base}${sign}${Math.abs(displacement)})`;
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
    case 'slp': return 'slp';
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
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(formatResolvedAddress(inst))})`;
    case 'ld-mem-reg': return `ld (${hex(formatResolvedAddress(inst))}), ${inst.src}`;
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
    default: return inst.tag;
  }
}

/* ── Disassembly ───────────────────────────────────────────────────── */

function disassembleLinear(start, end) {
  const rows = [];
  let pc = start;
  const limit = Math.min(end, rom.length);

  while (pc < limit) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > rom.length) {
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

function printDisasm(title, start, end) {
  const rows = disassembleLinear(start, end);
  console.log(`\n${'='.repeat(92)}`);
  console.log(`${title} @ ${hex(start)}-${hex(end)}`);
  console.log(`${'='.repeat(92)}`);
  for (const row of rows) {
    const marker = row.entry ? '[ENTRY] ' : '        ';
    const annotation = annotateRow(row);
    const suffix = annotation ? `  ; ${annotation}` : '';
    console.log(`  ${hex(row.pc)} ${marker}${row.bytes.padEnd(20)} ${row.text}${suffix}`);
  }
  return rows;
}

function annotateRow(row) {
  const inst = row.instr ?? row.inst;
  if (!inst) return '';

  const resolved = formatResolvedAddress(inst);
  const target = inst.target ?? resolved ?? null;

  if (resolved === VAR_D00824) return '<-- D00824 (key code storage)';
  if (resolved === VAR_D00826) return '<-- D00826 (key code storage)';
  if (resolved === IY_PLUS_54) return '<-- IY+54 = D000B6 (mode flags)';
  if (target === HOME_DISPATCH) return '<-- home dispatch 0x0856A8';

  // IY+offset annotations
  if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
    const absAddr = IY_ADDR + inst.displacement;
    if (absAddr === IY_PLUS_54) return '<-- IY+54 = D000B6 (mode flags)';
    return `<-- IY+${inst.displacement} = ${hex(absAddr)}`;
  }

  return '';
}

/* ── Part A: Find function boundary and disassemble 0x084EA7 ───────── */

function findFunctionEntry(targetAddr) {
  // Scan backward from targetAddr looking for a RET (0xC9) boundary
  // or a function that is a known block entry
  let addr = targetAddr - 1;
  const minAddr = Math.max(0, targetAddr - 256);

  while (addr >= minAddr) {
    // Check for RET = 0xC9
    if (rom[addr] === 0xC9) {
      return addr + 1; // function starts after the RET
    }
    // Check if this address is a block entry
    if (BLOCKS[blockId(addr)]) {
      // Verify it decodes properly
      const inst = decodeSafe(addr);
      if (inst && inst.length > 0) {
        return addr;
      }
    }
    addr--;
  }

  return minAddr;
}

function partA() {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART A: Static disassembly of 0x084EA7 and surrounding context');
  console.log('#'.repeat(92));

  // Find function entry by scanning backward
  const funcEntry = findFunctionEntry(TARGET_ADDR);
  console.log(`\nFunction entry estimate: ${hex(funcEntry)}`);
  console.log(`Target address: ${hex(TARGET_ADDR)}`);
  console.log(`Offset into function: ${TARGET_ADDR - funcEntry} bytes`);

  // Disassemble from function entry through ~200 bytes past target
  const disasmEnd = Math.min(ROM_SCAN_LIMIT, TARGET_ADDR + 200);
  const rows = printDisasm('0x084EA7 function context', funcEntry, disasmEnd);

  // Identify key features
  console.log('\n--- Key features found ---');

  const d00824Writes = [];
  const d00826Writes = [];
  const bitChecks = [];
  const callTargets = [];
  const jpTargets = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    const resolved = formatResolvedAddress(inst);

    // D00824 writes
    if (inst.tag === 'ld-mem-reg' && resolved === VAR_D00824) {
      d00824Writes.push(row);
    }

    // D00826 writes
    if (inst.tag === 'ld-mem-reg' && resolved === VAR_D00826) {
      d00826Writes.push(row);
    }

    // BIT tests on IY
    if ((inst.tag === 'indexed-cb-bit' || inst.tag === 'bit-test-ind') &&
        inst.indexRegister === 'iy') {
      bitChecks.push(row);
    }

    // CALL targets
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({ pc: row.pc, target: inst.target, text: row.text });
    }

    // JP targets
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push({ pc: row.pc, target: inst.target, text: row.text });
    }
  }

  console.log(`\nD00824 writes in range: ${d00824Writes.length}`);
  for (const row of d00824Writes) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nD00826 writes in range: ${d00826Writes.length}`);
  for (const row of d00826Writes) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nBIT checks on IY in range: ${bitChecks.length}`);
  for (const row of bitChecks) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nCALL targets: ${callTargets.length}`);
  for (const t of callTargets) {
    console.log(`  ${hex(t.pc)} ${t.text}`);
  }

  console.log(`\nJP targets: ${jpTargets.length}`);
  for (const t of jpTargets) {
    console.log(`  ${hex(t.pc)} ${t.text}`);
  }

  // Also disassemble the broader function area to find the parent caller
  console.log('\n--- Searching for callers of 0x084EA7 in ROM ---');
  const callers = scanForCallersOf(TARGET_ADDR);
  console.log(`Callers found: ${callers.length}`);
  for (const c of callers) {
    console.log(`  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
  }

  // Also search for callers of the function entry
  if (funcEntry !== TARGET_ADDR) {
    const entryCallers = scanForCallersOf(funcEntry);
    console.log(`\nCallers of function entry ${hex(funcEntry)}: ${entryCallers.length}`);
    for (const c of entryCallers) {
      console.log(`  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
    }
  }

  return { funcEntry, rows };
}

/* ── Part B: Find all D00824 writers ───────────────────────────────── */

function scanForCallersOf(target) {
  const results = [];
  const targetLE = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];

  // CALL nn (CD nn nn nn) and JP nn (C3 nn nn nn)
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
        results.push({
          addr,
          type,
          target,
          bytes: bytesToHex(rom, addr, 4),
        });
      }
    }
  }

  return results;
}

function partB() {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART B: All D00824 writers (static ROM scan)');
  console.log('#'.repeat(92));

  const targets = [
    { addr: VAR_D00824, label: 'D00824' },
    { addr: VAR_D00826, label: 'D00826' },
  ];

  for (const { addr: targetAddr, label } of targets) {
    const le = [targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];

    console.log(`\n--- Writers to ${label} (${hex(targetAddr)}) ---`);

    // 1. LD (nn), A — opcode 0x32
    const ldNnA = [];
    for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
      if (rom[i] === 0x32 && rom[i + 1] === le[0] && rom[i + 2] === le[1] && rom[i + 3] === le[2]) {
        ldNnA.push(i);
      }
    }
    console.log(`  LD (${label}), A: ${ldNnA.length} hits`);
    for (const addr of ldNnA) {
      console.log(`    ${hex(addr)}  ${bytesToHex(rom, addr, 4)}`);
      // Show context: 3 instructions before, the instruction, 2 after
      const ctxRows = disassembleLinear(Math.max(0, addr - 12), Math.min(ROM_SCAN_LIMIT, addr + 12));
      for (const row of ctxRows) {
        const marker = row.pc === addr ? '  >>>' : '     ';
        console.log(`${marker} ${hex(row.pc)} ${row.bytes.padEnd(16)} ${row.text}`);
      }
    }

    // 2. ED-prefixed pair stores: LD (nn), rr
    const edPairs = [[0x43, 'BC'], [0x53, 'DE'], [0x63, 'HL'], [0x73, 'SP']];
    for (const [opcode, pair] of edPairs) {
      const hits = [];
      for (let i = 0; i < ROM_SCAN_LIMIT - 5; i++) {
        if (rom[i] === 0xED && rom[i + 1] === opcode &&
            rom[i + 2] === le[0] && rom[i + 3] === le[1] && rom[i + 4] === le[2]) {
          hits.push(i);
        }
      }
      if (hits.length > 0) {
        console.log(`  LD (${label}), ${pair}: ${hits.length} hits`);
        for (const addr of hits) {
          console.log(`    ${hex(addr)}  ${bytesToHex(rom, addr, 5)}`);
        }
      }
    }

    // 3. Indirect writes: LD HL, D00824 followed by LD (HL), A within ~10 bytes
    const indirectLoads = [];
    for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
      if (rom[i] === 0x21 && rom[i + 1] === le[0] && rom[i + 2] === le[1] && rom[i + 3] === le[2]) {
        // Check next ~10 bytes for LD (HL), A = 0x77
        for (let j = i + 4; j < Math.min(i + 14, ROM_SCAN_LIMIT); j++) {
          if (rom[j] === 0x77) {
            indirectLoads.push({ loadAddr: i, storeAddr: j });
            break;
          }
        }
      }
    }
    if (indirectLoads.length > 0) {
      console.log(`  LD HL, ${label} ... LD (HL), A: ${indirectLoads.length} hits`);
      for (const { loadAddr, storeAddr } of indirectLoads) {
        console.log(`    LD HL at ${hex(loadAddr)}, LD (HL),A at ${hex(storeAddr)}`);
      }
    }

    // 4. Also list all reads from D00824 for completeness
    const reads = [];
    // LD A, (nn) = 0x3A
    for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
      if (rom[i] === 0x3A && rom[i + 1] === le[0] && rom[i + 2] === le[1] && rom[i + 3] === le[2]) {
        reads.push({ addr: i, type: 'LD A, (nn)' });
      }
    }
    // LD HL, (nn) = 0x2A or ED 6B
    for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
      if (rom[i] === 0x2A && rom[i + 1] === le[0] && rom[i + 2] === le[1] && rom[i + 3] === le[2]) {
        reads.push({ addr: i, type: 'LD HL, (nn)' });
      }
    }
    console.log(`  Reads from ${label}: ${reads.length}`);
    for (const r of reads) {
      console.log(`    ${hex(r.addr)}  ${r.type}`);
    }
  }

  // Group all D00824 writers by ROM region
  console.log('\n--- D00824 writers grouped by ROM region ---');
  const allWriters = [];
  const le824 = [VAR_D00824 & 0xFF, (VAR_D00824 >> 8) & 0xFF, (VAR_D00824 >> 16) & 0xFF];
  for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
    if (rom[i] === 0x32 && rom[i + 1] === le824[0] && rom[i + 2] === le824[1] && rom[i + 3] === le824[2]) {
      allWriters.push(i);
    }
  }

  const regions = new Map();
  for (const addr of allWriters) {
    const regionBase = Math.floor(addr / 0x10000) * 0x10000;
    const key = hex(regionBase);
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(addr);
  }
  for (const [region, addrs] of [...regions.entries()].sort()) {
    console.log(`  Region ${region}: ${addrs.length} writers`);
    for (const addr of addrs) {
      console.log(`    ${hex(addr)}`);
    }
  }
}

/* ── Part C: Dynamic trace ─────────────────────────────────────────── */

function bootBaseline() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // z80 boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // kernel init
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

  // post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  // Reset CPU state for mem init
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

  console.log(`\n  Boot baseline: memInit returned = ${memInitReturned}`);
  return new Uint8Array(mem);
}

function traceKeyEntry(baselineMemory, entryPoint, inputA, label, bit6Set) {
  const mem = new Uint8Array(baselineMemory);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Reset CPU state
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
  cpu.a = inputA & 0xFF;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));

  // Set or clear BIT 6 of (IY+54) = mem[0xD000B6]
  if (bit6Set) {
    mem[IY_PLUS_54] |= 0x40;
  } else {
    mem[IY_PLUS_54] &= ~0x40;
  }

  // Record D00824 before
  const d00824Before = mem[VAR_D00824] | (mem[VAR_D00824 + 1] << 8);
  const d00826Before = mem[VAR_D00826] | (mem[VAR_D00826 + 1] << 8);

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  const memWrites = [];

  // Intercept writes to D00824/D00826
  const originalWrite8 = cpu.write8?.bind(cpu);
  if (originalWrite8) {
    cpu.write8 = (addr, value) => {
      const normalized = addr & 0xFFFFFF;
      if (normalized >= VAR_D00824 && normalized <= VAR_D00826 + 1) {
        memWrites.push({
          addr: normalized,
          value: value & 0xFF,
          label: normalized === VAR_D00824 ? 'D00824' :
                 normalized === VAR_D00824 + 1 ? 'D00825' :
                 normalized === VAR_D00826 ? 'D00826' : 'D00827',
        });
      }
      return originalWrite8(addr, value);
    };
  }

  let termination = 'unknown';
  let stepCount = 0;

  try {
    const result = executor.runFrom(entryPoint, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        stepCount = step;
        visited.push({
          step,
          pc: pc & 0xFFFFFF,
          a: cpu.a & 0xFF,
          missing: false,
        });
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
      onMissingBlock(pc, _mode, step) {
        stepCount = step;
        visited.push({
          step,
          pc: pc & 0xFFFFFF,
          a: cpu.a & 0xFF,
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
      if (originalWrite8) cpu.write8 = originalWrite8;
      throw error;
    }
  }

  if (originalWrite8) cpu.write8 = originalWrite8;

  const d00824After = mem[VAR_D00824] | (mem[VAR_D00824 + 1] << 8);
  const d00826After = mem[VAR_D00826] | (mem[VAR_D00826 + 1] << 8);

  return {
    label,
    inputA: inputA & 0xFF,
    bit6Set,
    entryPoint,
    termination,
    stepCount,
    visited,
    memWrites,
    d00824Before,
    d00824After,
    d00826Before,
    d00826After,
    finalA: cpu.a & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalF: cpu.f & 0xFF,
    iyPlus54: mem[IY_PLUS_54],
  };
}

function printTrace(trace) {
  console.log(`\n--- ${trace.label} ---`);
  console.log(`  Entry:       ${hex(trace.entryPoint)}`);
  console.log(`  Input A:     ${hexByte(trace.inputA)}`);
  console.log(`  BIT 6 set:   ${trace.bit6Set}`);
  console.log(`  Termination: ${trace.termination}`);
  console.log(`  Steps:       ${trace.stepCount}`);
  console.log(`  Final A:     ${hexByte(trace.finalA)}`);
  console.log(`  Final HL:    ${hex(trace.finalHL)}`);
  console.log(`  Final DE:    ${hex(trace.finalDE)}`);
  console.log(`  Final BC:    ${hex(trace.finalBC)}`);
  console.log(`  Final F:     ${hexByte(trace.finalF)}`);
  console.log(`  IY+54 after: ${hexByte(trace.iyPlus54)}`);
  console.log(`  D00824:      ${hex(trace.d00824Before, 4)} -> ${hex(trace.d00824After, 4)}`);
  console.log(`  D00826:      ${hex(trace.d00826Before, 4)} -> ${hex(trace.d00826After, 4)}`);

  if (trace.memWrites.length > 0) {
    console.log(`  Memory writes to D00824-D00827:`);
    for (const w of trace.memWrites) {
      console.log(`    ${w.label} <- ${hexByte(w.value)}`);
    }
  } else {
    console.log(`  No writes to D00824-D00827 observed`);
  }

  console.log(`  Blocks visited (${trace.visited.length}):`);
  for (const entry of trace.visited) {
    const blockLabel = entry.missing ? `MISSING:${hex(entry.pc)}` : hex(entry.pc);
    console.log(`    step ${String(entry.step).padStart(3)}  block ${blockLabel}  A=${hexByte(entry.a)}`);
  }
}

function partC() {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART C: Dynamic trace of 0x084EA7 with key codes');
  console.log('#'.repeat(92));

  console.log('\nBooting baseline...');
  const baseline = bootBaseline();

  const experiments = [
    { inputA: 0x8F, label: "A=0x8F ('1' key), BIT6=SET", bit6Set: true },
    { inputA: 0x8F, label: "A=0x8F ('1' key), BIT6=CLEAR", bit6Set: false },
    { inputA: 0x05, label: 'A=0x05 (CLEAR key), BIT6=SET', bit6Set: true },
    { inputA: 0x05, label: 'A=0x05 (CLEAR key), BIT6=CLEAR', bit6Set: false },
    { inputA: 0x09, label: 'A=0x09 (ENTER key = 0x09), BIT6=SET', bit6Set: true },
    { inputA: 0x00, label: 'A=0x00 (no key), BIT6=SET', bit6Set: true },
  ];

  for (const exp of experiments) {
    try {
      const trace = traceKeyEntry(baseline, TARGET_ADDR, exp.inputA, exp.label, exp.bit6Set);
      printTrace(trace);
    } catch (error) {
      console.log(`\n--- ${exp.label} ---`);
      console.log(`  ERROR: ${error.message}`);
      if (error.stack) {
        console.log(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n  ')}`);
      }
    }
  }

  // Also try calling the parent function entry if different from TARGET_ADDR
  // (determined by Part A)
}

/* ── Main ──────────────────────────────────────────────────────────── */

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`ROM scan limit: ${hex(ROM_SCAN_LIMIT)}`);
  console.log(`Target: ${hex(TARGET_ADDR)}`);
  console.log(`IY+54 address: ${hex(IY_PLUS_54)}`);
  console.log(`D00824: ${hex(VAR_D00824)}`);

  partA();
  partB();
  partC();

  console.log('\n' + '#'.repeat(92));
  console.log('# SUMMARY');
  console.log('#'.repeat(92));
  console.log('\nDone.');
}

main();
