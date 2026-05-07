#!/usr/bin/env node

/**
 * Phase 224: Trace 0x084E9C -> 0x084EA7 caller chain
 *
 * 0x084EA7 was decoded as a D00824 writer (key code storage).
 * It's reached via JR Z,0x084EA7 from 0x084E9C — NOT a direct CALL target.
 * We need to find the containing function and understand how register B
 * (the key code) arrives.
 *
 * Part A: Find function boundary by scanning backward/forward from 0x084E9C
 * Part B: Static disassembly of the full function
 * Part C: Find all callers of the function entry in the ROM
 * Part D: Dynamic trace — boot runtime, set B to key codes, call function
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

/* -- Key addresses ---------------------------------------------------- */

const TARGET_JR = 0x084E9C;    // JR Z,0x084EA7
const TARGET_WRITER = 0x084EA7; // LD A,B; LD (D00824),A; CP cascade
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

const IY_PLUS_89 = IY_ADDR + 89; // 0xD000D9 — BIT 7 check from session 223

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const TRACE_MAX_STEPS = 100;
const TRACE_MAX_LOOP_ITERATIONS = 512;

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

/* -- Disassembly ------------------------------------------------------ */

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

function annotateRow(row) {
  const inst = row.inst;
  if (!inst) return '';

  const resolved = formatResolvedAddress(inst);
  const target = inst.target ?? resolved ?? null;

  if (resolved === VAR_D00824) return '<-- D00824 (key code storage)';
  if (resolved === VAR_D00826) return '<-- D00826';

  // IY+offset annotations
  if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
    const absAddr = IY_ADDR + inst.displacement;
    if (absAddr === IY_PLUS_89) return `<-- IY+89 = ${hex(IY_PLUS_89)} (BIT 7 check)`;
    return `<-- IY+${inst.displacement} = ${hex(absAddr)}`;
  }

  return '';
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
    const highlight =
      row.pc === TARGET_JR ? ' <<<JR' :
      row.pc === TARGET_WRITER ? ' <<<WRITER' : '';
    console.log(`  ${hex(row.pc)} ${marker}${row.bytes.padEnd(20)} ${row.text}${suffix}${highlight}`);
  }
  return rows;
}

/* -- Part A: Find function boundary ----------------------------------- */

function findFunctionBoundaryBackward(targetAddr) {
  // Scan backward looking for RET (0xC9), unconditional JP (0xC3), or block entry
  let addr = targetAddr - 1;
  const minAddr = Math.max(0, targetAddr - 512);

  while (addr >= minAddr) {
    if (rom[addr] === 0xC9) {
      return addr + 1;
    }
    // Unconditional JP = C3 xx xx xx — treat as boundary if followed by plausible code
    if (rom[addr] === 0xC3) {
      const candidate = addr + 4;
      const inst = decodeSafe(candidate);
      if (inst && inst.length > 0) {
        return candidate;
      }
    }
    // Known block entry
    if (BLOCKS[blockId(addr)]) {
      const inst = decodeSafe(addr);
      if (inst && inst.length > 0) {
        return addr;
      }
    }
    addr--;
  }
  return minAddr;
}

function findFunctionBoundaryForward(startAddr) {
  // Scan forward looking for RET or unconditional JP that ends the function
  let pc = startAddr;
  const maxAddr = Math.min(ROM_SCAN_LIMIT, startAddr + 512);
  let lastRet = startAddr;

  while (pc < maxAddr) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      pc += 1;
      continue;
    }

    if (inst.tag === 'ret') {
      lastRet = inst.nextPc;
      // Check if next byte starts a new function or is data
      const next = decodeSafe(inst.nextPc);
      if (!next || !next.length) {
        return inst.nextPc;
      }
      // If the next instruction is another function entry (CALL target), stop
      if (BLOCKS[blockId(inst.nextPc)]) {
        // Could be a fall-through or new function, keep scanning a bit more
      }
    }

    // Unconditional JP that jumps far away = end of this code path
    if (inst.tag === 'jp' && inst.target !== undefined) {
      const jumpDist = Math.abs(inst.target - pc);
      if (jumpDist > 256) {
        // Check if next address starts a clearly new function
        const next = decodeSafe(inst.nextPc);
        if (next && BLOCKS[blockId(inst.nextPc)]) {
          return inst.nextPc;
        }
      }
    }

    pc = inst.nextPc;
  }

  return lastRet > startAddr ? lastRet : maxAddr;
}

function partA() {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART A: Find function boundary around 0x084E9C-0x084EA7');
  console.log('#'.repeat(92));

  const funcEntry = findFunctionBoundaryBackward(TARGET_JR);
  const funcEnd = findFunctionBoundaryForward(TARGET_WRITER);

  console.log(`\nFunction entry estimate: ${hex(funcEntry)}`);
  console.log(`Function end estimate:   ${hex(funcEnd)}`);
  console.log(`Function size:           ${funcEnd - funcEntry} bytes`);
  console.log(`JR at ${hex(TARGET_JR)} is ${TARGET_JR - funcEntry} bytes into function`);
  console.log(`Writer at ${hex(TARGET_WRITER)} is ${TARGET_WRITER - funcEntry} bytes into function`);

  // Show raw bytes around the JR instruction for verification
  console.log(`\nRaw bytes at JR (${hex(TARGET_JR)}): ${bytesToHex(rom, TARGET_JR, 8)}`);
  console.log(`Raw bytes at writer (${hex(TARGET_WRITER)}): ${bytesToHex(rom, TARGET_WRITER, 16)}`);

  return { funcEntry, funcEnd };
}

/* -- Part B: Static disassembly of full function ---------------------- */

function partB(funcEntry, funcEnd) {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART B: Static disassembly of full function');
  console.log('#'.repeat(92));

  // Disassemble the full function
  const rows = printDisasm('Containing function', funcEntry, funcEnd);

  // Identify key features
  console.log('\n--- Key features found ---');

  const d00824Writes = [];
  const bitChecks = [];
  const callTargets = [];
  const jpTargets = [];
  const cpValues = [];
  const retPoints = [];
  const ldAB = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    const resolved = formatResolvedAddress(inst);

    if (inst.tag === 'ld-mem-reg' && resolved === VAR_D00824) {
      d00824Writes.push(row);
    }

    if ((inst.tag === 'indexed-cb-bit' || inst.tag === 'bit-test-ind') &&
        inst.indexRegister === 'iy') {
      bitChecks.push(row);
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({ pc: row.pc, target: inst.target, text: row.text });
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push({ pc: row.pc, target: inst.target, text: row.text });
    }

    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      cpValues.push({ pc: row.pc, value: inst.value, text: row.text });
    }

    if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
      retPoints.push({ pc: row.pc, text: row.text });
    }

    // LD A, B = 0x78
    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a' && inst.src === 'b') {
      ldAB.push({ pc: row.pc, text: row.text });
    }
  }

  console.log(`\nD00824 writes: ${d00824Writes.length}`);
  for (const row of d00824Writes) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nLD A, B instructions: ${ldAB.length}`);
  for (const row of ldAB) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nBIT checks on IY: ${bitChecks.length}`);
  for (const row of bitChecks) {
    console.log(`  ${hex(row.pc)} ${row.text}`);
  }

  console.log(`\nCP (compare) values: ${cpValues.length}`);
  for (const t of cpValues) {
    console.log(`  ${hex(t.pc)} ${t.text}  (comparing with ${hexByte(t.value)} = ${t.value} decimal)`);
  }

  console.log(`\nCALL targets: ${callTargets.length}`);
  for (const t of callTargets) {
    console.log(`  ${hex(t.pc)} ${t.text}`);
  }

  console.log(`\nJP targets: ${jpTargets.length}`);
  for (const t of jpTargets) {
    console.log(`  ${hex(t.pc)} ${t.text}`);
  }

  console.log(`\nRET points: ${retPoints.length}`);
  for (const t of retPoints) {
    console.log(`  ${hex(t.pc)} ${t.text}`);
  }

  return rows;
}

/* -- Part C: Find all callers of the function entry ------------------- */

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
        results.push({
          addr,
          type,
          target,
          bytes: bytesToHex(rom, addr, 4),
        });
      }
    }
  }

  // Also scan for JR instructions targeting our address
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 2; addr++) {
    const opcode = rom[addr];
    // JR e = 0x18, JR Z = 0x28, JR NZ = 0x20, JR C = 0x38, JR NC = 0x30
    const jrOpcodes = { 0x18: 'JR', 0x28: 'JR Z', 0x20: 'JR NZ', 0x38: 'JR C', 0x30: 'JR NC' };
    if (jrOpcodes[opcode]) {
      const offset = rom[addr + 1];
      const signedOffset = offset >= 128 ? offset - 256 : offset;
      const jumpTarget = addr + 2 + signedOffset;
      if (jumpTarget === target) {
        results.push({
          addr,
          type: jrOpcodes[opcode],
          target,
          bytes: bytesToHex(rom, addr, 2),
        });
      }
    }
  }

  return results;
}

function partC(funcEntry) {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART C: Find all callers of function entry and nearby targets');
  console.log('#'.repeat(92));

  // Search for callers of the function entry
  console.log(`\n--- Callers of function entry ${hex(funcEntry)} ---`);
  const entryCallers = scanForCallersOf(funcEntry);
  console.log(`Found: ${entryCallers.length}`);
  for (const c of entryCallers) {
    console.log(`  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
    // Disassemble 20 bytes before the caller to see how B is set
    const contextStart = Math.max(0, c.addr - 20);
    const contextRows = disassembleLinear(contextStart, c.addr + 4);
    console.log(`  Context (${hex(contextStart)}-${hex(c.addr + 4)}):`);
    for (const row of contextRows) {
      const marker = row.pc === c.addr ? '  >>>' : '     ';
      console.log(`${marker} ${hex(row.pc)} ${row.bytes.padEnd(16)} ${row.text}`);
    }
  }

  // Also search for callers of TARGET_JR and TARGET_WRITER directly
  console.log(`\n--- Direct callers of JR target ${hex(TARGET_JR)} ---`);
  const jrCallers = scanForCallersOf(TARGET_JR);
  console.log(`Found: ${jrCallers.length}`);
  for (const c of jrCallers) {
    console.log(`  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
  }

  console.log(`\n--- Direct callers of writer ${hex(TARGET_WRITER)} ---`);
  const writerCallers = scanForCallersOf(TARGET_WRITER);
  console.log(`Found: ${writerCallers.length}`);
  for (const c of writerCallers) {
    console.log(`  ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
    const contextStart = Math.max(0, c.addr - 20);
    const contextRows = disassembleLinear(contextStart, c.addr + 4);
    console.log(`  Context:`);
    for (const row of contextRows) {
      const marker = row.pc === c.addr ? '  >>>' : '     ';
      console.log(`${marker} ${hex(row.pc)} ${row.bytes.padEnd(16)} ${row.text}`);
    }
  }

  // Also search a wider range of addresses around the function for CALL/JP
  // (sometimes the function entry is slightly different from what backward scan finds)
  console.log(`\n--- Searching for calls to nearby addresses ---`);
  for (let offset = -8; offset <= 8; offset += 2) {
    const searchAddr = funcEntry + offset;
    if (searchAddr === funcEntry) continue;
    if (searchAddr < 0) continue;
    const callers = scanForCallersOf(searchAddr);
    if (callers.length > 0) {
      console.log(`  Callers of ${hex(searchAddr)}: ${callers.length}`);
      for (const c of callers) {
        console.log(`    ${hex(c.addr)} ${c.type} -> ${hex(c.target)} [bytes: ${c.bytes}]`);
      }
    }
  }

  return entryCallers;
}

/* -- Part D: Dynamic trace -------------------------------------------- */

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
    if (error?.message === '__PHASE224_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log(`\n  Boot baseline: memInit returned = ${memInitReturned}`);
  return new Uint8Array(mem);
}

function traceFunction(baselineMemory, entryPoint, regB, label) {
  const mem = new Uint8Array(baselineMemory);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = (regB & 0xFF) << 16; // B is high byte of BC in eZ80 (bits 16-23 of 24-bit BC)
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));

  // Actually B is bits 8-15 of 16-bit BC, or in eZ80 ADL mode:
  // BC is 24 bits: bits 0-7 = C, bits 8-15 = B, bits 16-23 = BCU
  // So B = (bc >> 8) & 0xFF. Let's set it properly.
  cpu.bc = (regB & 0xFF) << 8;

  const d00824Before = mem[VAR_D00824];

  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  const memWrites = [];

  let termination = 'unknown';
  let stepCount = 0;

  try {
    executor.runFrom(entryPoint, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        stepCount = step;
        visited.push({
          step,
          pc: pc & 0xFFFFFF,
          a: cpu.a & 0xFF,
          b: (cpu.bc >> 8) & 0xFF,
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
          b: (cpu.bc >> 8) & 0xFF,
          missing: true,
        });
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE224_STOP__' && error.stopName === 'return_sentinel') {
      termination = 'sentinel';
    } else {
      throw error;
    }
  }

  const d00824After = mem[VAR_D00824];

  return {
    label,
    regB: regB & 0xFF,
    entryPoint,
    termination,
    stepCount,
    visited,
    d00824Before,
    d00824After,
    finalA: cpu.a & 0xFF,
    finalB: (cpu.bc >> 8) & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalF: cpu.f & 0xFF,
  };
}

function printTrace(trace) {
  console.log(`\n--- ${trace.label} ---`);
  console.log(`  Entry:       ${hex(trace.entryPoint)}`);
  console.log(`  Input B:     ${hexByte(trace.regB)}`);
  console.log(`  Termination: ${trace.termination}`);
  console.log(`  Steps:       ${trace.stepCount}`);
  console.log(`  Final A:     ${hexByte(trace.finalA)}`);
  console.log(`  Final B:     ${hexByte(trace.finalB)}`);
  console.log(`  Final HL:    ${hex(trace.finalHL)}`);
  console.log(`  Final DE:    ${hex(trace.finalDE)}`);
  console.log(`  Final BC:    ${hex(trace.finalBC)}`);
  console.log(`  Final F:     ${hexByte(trace.finalF)}`);
  console.log(`  D00824:      ${hexByte(trace.d00824Before)} -> ${hexByte(trace.d00824After)}`);

  console.log(`  Blocks visited (${trace.visited.length}):`);
  for (const entry of trace.visited) {
    const blockLabel = entry.missing ? `MISSING:${hex(entry.pc)}` : hex(entry.pc);
    console.log(`    step ${String(entry.step).padStart(3)}  block ${blockLabel}  A=${hexByte(entry.a)} B=${hexByte(entry.b)}`);
  }
}

function partD(funcEntry) {
  console.log('\n' + '#'.repeat(92));
  console.log('# PART D: Dynamic trace — call function with key codes in B');
  console.log('#'.repeat(92));

  console.log('\nBooting baseline...');
  const baseline = bootBaseline();

  const experiments = [
    { regB: 0x8F, label: "B=0x8F (digit-1 key code)" },
    { regB: 0x70, label: "B=0x70 (+ key code)" },
    { regB: 0x05, label: "B=0x05 (CLEAR key code)" },
    { regB: 0x09, label: "B=0x09 (ENTER key code)" },
    { regB: 0x00, label: "B=0x00 (no key)" },
    { regB: 0x2B, label: "B=0x2B (comma — CP target)" },
    { regB: 0x4A, label: "B=0x4A (CP target)" },
  ];

  // Try calling from the function entry
  console.log(`\n=== Calling from function entry ${hex(funcEntry)} ===`);
  for (const exp of experiments) {
    try {
      const trace = traceFunction(baseline, funcEntry, exp.regB, exp.label);
      printTrace(trace);
    } catch (error) {
      console.log(`\n--- ${exp.label} ---`);
      console.log(`  ERROR: ${error.message}`);
    }
  }

  // Also try calling from 0x084EA6 (LD A,B) directly with A set
  console.log(`\n=== Calling from 0x084EA6 (LD A,B entry) ===`);
  for (const exp of [
    { regB: 0x8F, label: "B=0x8F (digit-1) via 0x084EA6" },
    { regB: 0x2B, label: "B=0x2B (comma) via 0x084EA6" },
  ]) {
    try {
      const trace = traceFunction(baseline, 0x084EA6, exp.regB, exp.label);
      printTrace(trace);
    } catch (error) {
      console.log(`\n--- ${exp.label} ---`);
      console.log(`  ERROR: ${error.message}`);
    }
  }
}

/* -- Main ------------------------------------------------------------- */

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`ROM scan limit: ${hex(ROM_SCAN_LIMIT)}`);
  console.log(`Target JR: ${hex(TARGET_JR)}`);
  console.log(`Target writer: ${hex(TARGET_WRITER)}`);
  console.log(`IY+89 address: ${hex(IY_PLUS_89)}`);
  console.log(`D00824: ${hex(VAR_D00824)}`);

  const { funcEntry, funcEnd } = partA();
  partB(funcEntry, funcEnd);
  const callers = partC(funcEntry);
  partD(funcEntry);

  console.log('\n' + '#'.repeat(92));
  console.log('# SUMMARY');
  console.log('#'.repeat(92));
  console.log(`\nFunction entry: ${hex(funcEntry)}`);
  console.log(`Function end:   ${hex(funcEnd)}`);
  console.log(`Callers found:  ${callers.length}`);
  console.log('\nDone.');
}

main();
