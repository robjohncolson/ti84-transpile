#!/usr/bin/env node

/**
 * Phase 229 — 0x03011C Key Code Lookup Function Trace
 *
 * Traces the key lookup path at 0x03011C that reads from the 09F79B
 * 3-subtable key code map and writes to D0058E (primary key code variable).
 *
 * Deliverables:
 *   1. Static disassembly of 0x030100-0x030180
 *   2. Function entry point (scan backwards for RET/JP/JR)
 *   3. Callers of the function (scan ROM for CALL/JP patterns)
 *   4. Dynamic trace with keyboard inputs
 *   5. HL offset computation formula
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;

const TARGET_ADDR = 0x03011C;
const TABLE_ADDR = 0x09F79B;
const D0058E_ADDR = 0xD0058E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM: ${ROM_PATH}`);
}

const romBytes = readFileSync(ROM_PATH);

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

// ── Part 1: Static Disassembly ───────────────────────────────────────

function staticDisassembly() {
  console.log('='.repeat(72));
  console.log('PART 1: Static Disassembly 0x0300D0 - 0x030180');
  console.log('='.repeat(72));

  // Start from 0x030074 which is a known JP target (from probe-phase141:
  //   JP Z,0x030074 branches there for "not 2nd, use alpha table" case).
  // This gives us known-good alignment through our target at 0x03011C.
  let pc = 0x030074;
  const end = 0x030180;

  while (pc < end) {
    const decoded = decodeInstruction(romBytes, pc, 'adl');
    if (!decoded || !decoded.length) {
      const byte = romBytes[pc];
      console.log(`  ${hex(pc)}:  [${hexByte(byte)}]  ???`);
      pc += 1;
      continue;
    }

    const bytes = [];
    for (let i = 0; i < decoded.length; i++) {
      bytes.push(romBytes[pc + i]);
    }
    const byteStr = bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');

    const marker = pc === TARGET_ADDR ? ' <-- TARGET (LD DE,09F79B)' : '';
    console.log(`  ${hex(pc)}:  ${byteStr.padEnd(20)} ${formatDecoded(decoded)}${marker}`);

    pc += decoded.length;
  }
  console.log();
}

function formatDecoded(d) {
  if (!d) return '???';

  switch (d.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'daa': return 'DAA';
    case 'rra': return 'RRA';
    case 'rla': return 'RLA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'halt': return 'HALT';
    case 'xor-a': return 'XOR A';
    case 'neg': return 'NEG';
    case 'ld-pair-imm': return `LD ${d.pair.toUpperCase()}, ${hex(d.value)}`;
    case 'ld-reg-imm': return `LD ${d.dest.toUpperCase()}, ${hexByte(d.value)}`;
    case 'ld-reg-reg': return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${d.dest.toUpperCase()}, (${d.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${d.dest.toUpperCase()}), ${d.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${d.dest.toUpperCase()}, (${hex(d.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(d.addr)}), ${d.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL), ${hexByte(d.value)}`;
    case 'ld-mem-pair': return `LD (${hex(d.addr)}), ${d.src.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${d.dest.toUpperCase()}, (${hex(d.addr)})`;
    case 'push': return `PUSH ${d.pair.toUpperCase()}`;
    case 'pop': return `POP ${d.pair.toUpperCase()}`;
    case 'call': return `CALL ${hex(d.target)}`;
    case 'call-conditional': return `CALL ${d.condition.toUpperCase()}, ${hex(d.target)}`;
    case 'jp': return `JP ${hex(d.target)}`;
    case 'jp-conditional': return `JP ${d.condition.toUpperCase()}, ${hex(d.target)}`;
    case 'jp-indirect': return `JP (${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'jr': return `JR ${hex(d.target)}`;
    case 'jr-conditional': return `JR ${d.condition.toUpperCase()}, ${hex(d.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${d.condition.toUpperCase()}`;
    case 'reti': return 'RETI';
    case 'add-pair': return `ADD ${d.dest?.toUpperCase() ?? 'HL'}, ${d.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${d.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${d.src.toUpperCase()}`;
    case 'inc-pair': return `INC ${d.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${d.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${d.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${d.reg.toUpperCase()}`;
    case 'add-reg': return `ADD A, ${d.src.toUpperCase()}`;
    case 'adc-reg': return `ADC A, ${d.src.toUpperCase()}`;
    case 'sub-reg': return `SUB ${d.src.toUpperCase()}`;
    case 'sbc-reg': return `SBC A, ${d.src.toUpperCase()}`;
    case 'and-reg': return `AND ${d.src.toUpperCase()}`;
    case 'or-reg': return `OR ${d.src.toUpperCase()}`;
    case 'xor-reg': return `XOR ${d.src.toUpperCase()}`;
    case 'cp-reg': return `CP ${d.src.toUpperCase()}`;
    case 'add-imm': return `ADD A, ${hexByte(d.value)}`;
    case 'adc-imm': return `ADC A, ${hexByte(d.value)}`;
    case 'sub-imm': return `SUB ${hexByte(d.value)}`;
    case 'sbc-imm': return `SBC A, ${hexByte(d.value)}`;
    case 'and-imm': return `AND ${hexByte(d.value)}`;
    case 'or-imm': return `OR ${hexByte(d.value)}`;
    case 'xor-imm': return `XOR ${hexByte(d.value)}`;
    case 'cp-imm': return `CP ${hexByte(d.value)}`;
    case 'bit': return `BIT ${d.bit}, ${d.reg?.toUpperCase() ?? d.src?.toUpperCase() ?? '?'}`;
    case 'set': return `SET ${d.bit}, ${d.reg?.toUpperCase() ?? d.src?.toUpperCase() ?? '?'}`;
    case 'res': return `RES ${d.bit}, ${d.reg?.toUpperCase() ?? d.src?.toUpperCase() ?? '?'}`;
    case 'bit-index': return `BIT ${d.bit}, (${d.indexReg?.toUpperCase() ?? 'IX'}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'set-index': return `SET ${d.bit}, (${d.indexReg?.toUpperCase() ?? 'IX'}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'res-index': return `RES ${d.bit}, (${d.indexReg?.toUpperCase() ?? 'IX'}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'ld-index-reg': return `LD (${d.indexReg.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset}), ${d.src.toUpperCase()}`;
    case 'ld-reg-index': return `LD ${d.dest.toUpperCase()}, (${d.indexReg.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'ld-index-imm': return `LD (${d.indexReg.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset}), ${hexByte(d.value)}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-ix': return 'EX (SP), IX';
    case 'ex-sp-iy': return 'EX (SP), IY';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'djnz': return `DJNZ ${hex(d.target)}`;
    case 'rst': return `RST ${hexByte(d.target ?? d.vector ?? 0)}`;
    case 'out-imm': return `OUT (${hexByte(d.port)}), A`;
    case 'in-imm': return `IN A, (${hexByte(d.port)})`;
    case 'out-c': return `OUT (C), ${d.src?.toUpperCase() ?? 'A'}`;
    case 'in-c': return `IN ${d.dest?.toUpperCase() ?? 'A'}, (C)`;
    case 'sla': return `SLA ${d.reg?.toUpperCase() ?? '?'}`;
    case 'sra': return `SRA ${d.reg?.toUpperCase() ?? '?'}`;
    case 'srl': return `SRL ${d.reg?.toUpperCase() ?? '?'}`;
    case 'rl': return `RL ${d.reg?.toUpperCase() ?? '?'}`;
    case 'rr': return `RR ${d.reg?.toUpperCase() ?? '?'}`;
    case 'rlc': return `RLC ${d.reg?.toUpperCase() ?? '?'}`;
    case 'rrc': return `RRC ${d.reg?.toUpperCase() ?? '?'}`;
    case 'im': return `IM ${d.mode ?? 0}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-ix': return 'LD SP, IX';
    case 'ld-sp-iy': return 'LD SP, IY';
    case 'add-ix': return `ADD IX, ${d.src.toUpperCase()}`;
    case 'add-iy': return `ADD IY, ${d.src.toUpperCase()}`;
    case 'inc-index': return `INC (${d.indexReg.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'dec-index': return `DEC (${d.indexReg.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'tst-imm': return `TST A, ${hexByte(d.value)}`;
    case 'lea': return `LEA ${d.dest?.toUpperCase()}, ${d.indexReg?.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset}`;
    case 'pea': return `PEA ${d.indexReg?.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset}`;
    case 'ld-pair-index-offset': return `LD ${d.dest?.toUpperCase()}, (${d.indexReg?.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset})`;
    case 'ld-index-offset-pair': return `LD (${d.indexReg?.toUpperCase()}${d.offset >= 0 ? '+' : ''}${d.offset}), ${d.src?.toUpperCase()}`;
    case 'indexed-cb-bit': {
      const ir = (d.indexRegister ?? 'iy').toUpperCase();
      const disp = d.displacement ?? 0;
      return `BIT ${d.bit}, (${ir}${disp >= 0 ? '+' : ''}${disp})`;
    }
    case 'indexed-cb-set': {
      const ir = (d.indexRegister ?? 'iy').toUpperCase();
      const disp = d.displacement ?? 0;
      return `SET ${d.bit}, (${ir}${disp >= 0 ? '+' : ''}${disp})`;
    }
    case 'indexed-cb-res': {
      const ir = (d.indexRegister ?? 'iy').toUpperCase();
      const disp = d.displacement ?? 0;
      return `RES ${d.bit}, (${ir}${disp >= 0 ? '+' : ''}${disp})`;
    }
    case 'alu-imm': return `${d.op?.toUpperCase() ?? 'ALU'} ${hexByte(d.value)}`;
    case 'alu-reg': return `${d.op?.toUpperCase() ?? 'ALU'} ${d.src?.toUpperCase() ?? '?'}`;
    case 'bit-test': return `BIT ${d.bit}, ${d.reg?.toUpperCase() ?? '?'}`;
    case 'bit-test-ind': return `BIT ${d.bit}, (HL)`;
    case 'rotate-reg': return `${d.op?.toUpperCase() ?? 'ROT'} ${d.reg?.toUpperCase() ?? '?'}`;
    case 'out-reg': return `OUT (C), ${d.reg?.toUpperCase() ?? 'A'}`;
    case 'in0': return `IN0 ${d.reg?.toUpperCase() ?? 'A'}, (${hexByte(d.port ?? 0)})`;
    default: return `[${d.tag}]`;
  }
}

// ── Part 2: Find Function Entry Point ────────────────────────────────

function findFunctionEntry() {
  console.log('='.repeat(72));
  console.log('PART 2: Find Function Entry Point');
  console.log('='.repeat(72));

  // Scan from a reasonable start point, decoding instructions,
  // and find the last terminator before 0x03011C.

  // Use 0x02FF00 as scan start - known LD DE,0x09F79B at 0x02FF11 gives alignment.
  const scanStart = 0x02FF00;
  const scanEnd = 0x030140;

  console.log(`\nScanning ${hex(scanStart)} - ${hex(scanEnd)} for function boundaries:\n`);

  let pc = scanStart;
  let lastTerminator = null;
  let entryAfterTerminator = null;

  while (pc < scanEnd) {
    const decoded = decodeInstruction(romBytes, pc, 'adl');
    if (!decoded || !decoded.length) {
      pc += 1;
      continue;
    }

    const isTerminator =
      decoded.tag === 'ret' ||
      decoded.tag === 'reti' ||
      decoded.tag === 'jp' ||
      decoded.tag === 'jr' ||
      decoded.tag === 'jp-indirect';

    const bytes = [];
    for (let i = 0; i < decoded.length; i++) {
      bytes.push(romBytes[pc + i]);
    }
    const byteStr = bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');

    const marker = isTerminator ? ' <<< TERMINATOR' : '';
    console.log(`  ${hex(pc)}:  ${byteStr.padEnd(20)} ${formatDecoded(decoded)}${marker}`);

    if (isTerminator && pc < TARGET_ADDR) {
      lastTerminator = pc;
      entryAfterTerminator = pc + decoded.length;
    }

    pc += decoded.length;
  }

  console.log(`\nLast terminator before target: ${hex(lastTerminator)}`);
  console.log(`Function entry point (after terminator): ${hex(entryAfterTerminator)}`);

  return entryAfterTerminator;
}

// ── Part 3: Find Callers ─────────────────────────────────────────────

function findCallers(entryPoint) {
  console.log('\n' + '='.repeat(72));
  console.log('PART 3: Find Callers');
  console.log('='.repeat(72));

  // eZ80 ADL-mode opcodes with 3-byte immediate address:
  //   CALL nn  = CD + 3 bytes
  //   JP nn    = C3 + 3 bytes
  //   CALL cc  = C4/CC/D4/DC/E4/EC/F4/FC + 3 bytes
  //   JP cc    = C2/CA/D2/DA/E2/EA/F2/FA + 3 bytes

  const callOpcodes = [0xCD];
  const jpOpcodes = [0xC3];
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];

  const allOpcodes = [...callOpcodes, ...jpOpcodes, ...condCallOpcodes, ...condJpOpcodes];

  // Search for calls to a range of addresses around the entry point
  const searchTargets = new Set();
  if (entryPoint) searchTargets.add(entryPoint);

  // Also search for calls to the region 0x0300D0 - 0x030130
  for (let addr = 0x0300D0; addr <= 0x030130; addr++) {
    searchTargets.add(addr);
  }

  const callers = [];

  for (let i = 0; i < Math.min(romBytes.length - 4, 0x400000); i++) {
    const opcode = romBytes[i];
    if (!allOpcodes.includes(opcode)) continue;

    const target = read24(romBytes, i + 1);
    if (!searchTargets.has(target)) continue;

    const type = callOpcodes.includes(opcode) ? 'CALL' :
                 jpOpcodes.includes(opcode) ? 'JP' :
                 condCallOpcodes.includes(opcode) ? 'CALL cc' :
                 'JP cc';

    callers.push({ addr: i, target, type, opcode });
  }

  console.log(`\nFound ${callers.length} references to the function region:\n`);

  for (const c of callers) {
    const decoded = decodeInstruction(romBytes, c.addr, 'adl');
    const dasmStr = decoded ? formatDecoded(decoded) : `${c.type} ${hex(c.target)}`;
    console.log(`  ${hex(c.addr)}:  ${dasmStr}  (target: ${hex(c.target)})`);
  }

  // Specifically search for the exact entry point
  if (entryPoint) {
    console.log(`\nCallers targeting exactly ${hex(entryPoint)}:`);
    const exactCallers = callers.filter(c => c.target === entryPoint);
    if (exactCallers.length === 0) {
      console.log('  (none found - function may be reached by fall-through)');
    } else {
      for (const c of exactCallers) {
        console.log(`  ${hex(c.addr)}: ${c.type} ${hex(c.target)}`);
      }
    }
  }

  return callers;
}

// ── Part 4: Dynamic Trace ────────────────────────────────────────────

async function dynamicTrace(entryPoint) {
  console.log('\n' + '='.repeat(72));
  console.log('PART 4: Dynamic Trace');
  console.log('='.repeat(72));

  if (!existsSync(TRANSPILED_PATH)) {
    console.log('\nTranspiled ROM not found - skipping dynamic trace.');
    console.log(`Expected: ${TRANSPILED_PATH}`);
    console.log('Run: node scripts/transpile-ti84-rom.mjs');
    return;
  }

  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const RAW_BLOCKS =
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule;
  const BLOCKS = normalizeBlocks(RAW_BLOCKS);

  function normalizeBlocks(rawBlocks) {
    if (Array.isArray(rawBlocks)) {
      return Object.fromEntries(
        rawBlocks.filter(b => b?.id).map(b => [b.id, b]),
      );
    }
    return rawBlocks ?? {};
  }

  function createMemoryWithRom() {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
    return mem;
  }

  function createRuntime(mem) {
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    return { executor, cpu: executor.cpu, peripherals };
  }

  function resetOsState(cpu, mem) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu.iy = 0xD00080;
    cpu.ix = 0xD1A860;
    cpu.hl = 0;
    cpu.de = 0;
    cpu.bc = 0;
    cpu.a = 0x00;
    cpu.f = 0x40;
    cpu.sp = STACK_TOP;
    mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
  }

  function stopError(name) {
    const error = new Error('__PHASE229_STOP__');
    error.stopName = name;
    return error;
  }

  // Boot the OS to get initialized RAM state
  console.log('\nBooting OS for initialized RAM state...');
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu.iy = 0xD00080;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return');
      },
    });
  } catch (error) {
    if (error?.message !== '__PHASE229_STOP__' || error.stopName !== 'mem_init_return') {
      throw error;
    }
  }

  console.log('OS boot complete.\n');

  // Save initial RAM snapshot for reuse
  const ramSnapshot = new Uint8Array(mem.length);
  ramSnapshot.set(mem);

  // Find existing blocks near our target
  const { compiledBlocks } = executor;
  const nearbyBlocks = [];
  for (const key of Object.keys(compiledBlocks)) {
    const [addrStr, mode] = key.split(':');
    const addr = parseInt(addrStr, 16);
    if (addr >= 0x02FF00 && addr <= 0x030200 && mode === 'adl') {
      nearbyBlocks.push({ addr, key });
    }
  }
  nearbyBlocks.sort((a, b) => a.addr - b.addr);

  console.log('Transpiled blocks near 0x03011C:');
  for (const b of nearbyBlocks) {
    const marker = b.addr === (entryPoint & 0xFFFFFF) ? ' <-- entry point' : '';
    console.log(`  ${hex(b.addr)} (${b.key})${marker}`);
  }
  console.log();

  // Test with various scan codes and modifier flag states.
  // From probe-phase141: the lookup sequence computes A from scan code + modifier offsets,
  // then: LD L,A / LD H,0 / LD DE,0x09F79B / ADD HL,DE / LD A,(HL)
  // The (IY+0x12) flags at bit 4 (alpha) and bit 5 (2nd) determine the section offset.

  const testCases = [
    { name: 'ENTER (scan=0x09, no mod)', scanCode: 0x09, iy12Flags: 0x00 },
    { name: 'ENTER (scan=0x09, 2nd mod)', scanCode: 0x09, iy12Flags: 0x20 },
    { name: 'ENTER (scan=0x09, alpha mod)', scanCode: 0x09, iy12Flags: 0x10 },
    { name: 'GRAPH (scan=0x31, no mod)', scanCode: 0x31, iy12Flags: 0x00 },
    { name: 'GRAPH (scan=0x31, alpha mod)', scanCode: 0x31, iy12Flags: 0x10 },
    { name: 'SIN (scan=0x26, no mod)', scanCode: 0x26, iy12Flags: 0x00 },
    { name: 'SIN (scan=0x26, 2nd mod)', scanCode: 0x26, iy12Flags: 0x20 },
    { name: 'Digit 5 (scan=0x1B, no mod)', scanCode: 0x1B, iy12Flags: 0x00 },
  ];

  // Use the found entry point, falling back to the nearest available block
  let funcEntry = entryPoint || 0x030100;
  const entryKey = `${(funcEntry & 0xFFFFFF).toString(16).padStart(6, '0')}:adl`;
  if (!compiledBlocks[entryKey] && nearbyBlocks.length > 0) {
    // Find the closest block at or before the entry point
    const candidates = nearbyBlocks.filter(b => b.addr <= (funcEntry & 0xFFFFFF));
    if (candidates.length > 0) {
      funcEntry = candidates[candidates.length - 1].addr;
      console.log(`Entry point ${hex(entryPoint)} has no block; using nearest: ${hex(funcEntry)}`);
    } else {
      funcEntry = nearbyBlocks[0].addr;
      console.log(`Entry point ${hex(entryPoint)} has no block; using first nearby: ${hex(funcEntry)}`);
    }
  }

  console.log(`\nTracing function starting at ${hex(funcEntry)} with various inputs:\n`);

  for (const tc of testCases) {
    // Restore from snapshot for clean state
    mem.set(ramSnapshot);

    resetOsState(cpu, mem);

    // Set up IY+0x12 flags (IY = 0xD00080, so IY+0x12 = 0xD00092)
    mem[0xD00092] = tc.iy12Flags;

    // Set A to the scan code
    cpu.a = tc.scanCode;

    // Set up stack with sentinel return
    cpu.sp = STACK_TOP;
    push24(cpu, mem, RETURN_SENTINEL);

    // Clear D0058E to detect the write
    mem[D0058E_ADDR] = 0x00;

    const hlBefore = cpu.hl;

    // Run the function
    let stopReason = 'unknown';
    let stepsRun = 0;
    const pcLog = [];

    try {
      executor.runFrom(funcEntry, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 32,
        onBlock(pc) {
          pcLog.push(pc & 0xFFFFFF);
          stepsRun++;
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            throw stopError('returned');
          }
        },
        onMissingBlock(pc) {
          pcLog.push(pc & 0xFFFFFF);
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            throw stopError('returned');
          }
          throw stopError('missing_block_' + hex(pc));
        },
      });
      stopReason = 'max_steps';
    } catch (error) {
      if (error?.message === '__PHASE229_STOP__') {
        stopReason = error.stopName;
      } else {
        stopReason = `error: ${error.message}`;
      }
    }

    const d0058eAfter = mem[D0058E_ADDR];

    // Verify against direct table lookup
    let expectedFromTable = null;
    let modOffset = 0;
    if (tc.iy12Flags & 0x10) modOffset += 0x70; // alpha
    if (tc.iy12Flags & 0x20) modOffset += 0x38; // 2nd
    const tableIndex = tc.scanCode + modOffset;
    if (TABLE_ADDR + tableIndex < romBytes.length) {
      expectedFromTable = romBytes[TABLE_ADDR + tableIndex];
    }

    console.log(`  Test: ${tc.name}`);
    console.log(`    Input: A=${hexByte(tc.scanCode)}, (IY+12h)=${hexByte(tc.iy12Flags)}`);
    console.log(`    Stop reason: ${stopReason} after ${stepsRun} steps`);
    console.log(`    D0058E written: ${hexByte(d0058eAfter)}`);
    console.log(`    Final: A=${hexByte(cpu.a)}, HL=${hex(cpu.hl)}, DE=${hex(cpu.de)}`);
    console.log(`    Expected from table: ${expectedFromTable !== null ? hexByte(expectedFromTable) : 'n/a'}`);
    console.log(`    Match: ${d0058eAfter === expectedFromTable ? 'YES' : 'NO'}`);
    console.log(`    PC trace: ${pcLog.slice(0, 15).map(p => hex(p)).join(' -> ')}${pcLog.length > 15 ? ' ...' : ''}`);
    console.log();
  }
}

// ── Part 5: Map the HL Computation ───────────────────────────────────

function mapHLComputation() {
  console.log('='.repeat(72));
  console.log('PART 5: HL Offset Computation Formula');
  console.log('='.repeat(72));

  console.log('\nHL Offset Formula:');
  console.log('  offset = scanCode  (raw _GetCSC code, 0x00-0x38)');
  console.log('  if (IY+0x12) bit 4 set (alpha): offset += 0x70');
  console.log('  if (IY+0x12) bit 5 set (2nd):   offset += 0x38');
  console.log('');
  console.log('  HL = offset  (via LD L,A / LD H,0)');
  console.log('  DE = 0x09F79B (table base address)');
  console.log('  HL = HL + DE  (ADD HL,DE)');
  console.log('  A = (HL)      (read key code from table)');
  console.log('');
  console.log('  Result written to D0058E after CP threshold checks.');
  console.log('');
  console.log('Table Layout:');
  console.log('  Section 0 (offset 0x00, base 0x09F79B): No modifier');
  console.log('  Section 1 (offset 0x38, base 0x09F7D3): 2nd pressed');
  console.log('  Section 2 (offset 0x70, base 0x09F80B): Alpha pressed');
  console.log('  Section 3 (offset 0xA8, base 0x09F843): Alpha + 2nd');
  console.log('');

  // Dump sample table entries for verification
  console.log('Sample Table Entries (hex key codes):');
  const sampleScans = [
    { scan: 0x09, name: 'ENTER' },
    { scan: 0x0A, name: '+' },
    { scan: 0x0F, name: 'CLEAR' },
    { scan: 0x21, name: '0' },
    { scan: 0x22, name: '1' },
    { scan: 0x26, name: 'SIN' },
    { scan: 0x31, name: 'GRAPH' },
  ];

  const sectionNames = ['No mod', '2nd', 'Alpha', 'Alpha+2nd'];
  const sectionOffsets = [0x00, 0x38, 0x70, 0xA8];

  console.log('  ' + 'Scan'.padEnd(16) + sectionNames.map(n => n.padEnd(12)).join(''));
  console.log('  ' + '-'.repeat(64));

  for (const s of sampleScans) {
    const values = sectionOffsets.map(off => {
      const addr = TABLE_ADDR + off + s.scan;
      const val = romBytes[addr];
      return hexByte(val).padEnd(12);
    });
    console.log(`  ${hexByte(s.scan)} ${s.name.padEnd(10)} ${values.join('')}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

staticDisassembly();
const entryPoint = findFunctionEntry();
const callers = findCallers(entryPoint);
await dynamicTrace(entryPoint);
mapHLComputation();

console.log('\n' + '='.repeat(72));
console.log('DONE');
console.log('='.repeat(72));
