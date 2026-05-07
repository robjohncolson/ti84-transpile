#!/usr/bin/env node

/**
 * Phase 230 — 0x02FE84 Special Path for Key Codes 0xE2-0xFB
 *
 * When the key lookup function at 0x0300F1-0x030172 reads a key code from
 * the 09F79B table:
 *   - key code < 0xE2:  normal write to D0058E
 *   - key code >= 0xFC: special path (JR NC)
 *   - 0xE2 <= key code < 0xFC: LD (D0058E),A / LD A,0xFC / JP 0x02FE84
 *
 * This probe traces what 0x02FE84 does with those 0xE2-0xFB key codes.
 *
 * Deliverables:
 *   1. Static disassembly of 0x02FE84 and surrounding region
 *   2. Dynamic trace for representative key codes in 0xE2-0xFB range
 *   3. Summary table: key_code -> behavior
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

const TARGET_ADDR = 0x02FE84;
const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;
const IY_BASE = 0xD00080;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM: ${ROM_PATH}`);
}

const romBytes = readFileSync(ROM_PATH);

// -- Helpers ----------------------------------------------------------------

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

// -- Part 1: Static Disassembly ---------------------------------------------

function staticDisassembly() {
  console.log('='.repeat(72));
  console.log('PART 1: Static Disassembly around 0x02FE84');
  console.log('='.repeat(72));

  // Disassemble a wide region around the target to see the full function
  // Start from 0x02FE40 to catch the function prologue
  let pc = 0x02FE40;
  const end = 0x02FF40;

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

    const marker = pc === TARGET_ADDR ? ' <-- TARGET (JP from key lookup)' : '';
    console.log(`  ${hex(pc)}:  ${byteStr.padEnd(20)} ${formatDecoded(decoded)}${marker}`);

    pc += decoded.length;
  }
  console.log();
}

// -- Part 2: Find callers of 0x02FE84 --------------------------------------

function findCallers() {
  console.log('='.repeat(72));
  console.log('PART 2: Find all CALL/JP references to 0x02FE84');
  console.log('='.repeat(72));

  const callOpcodes = [0xCD];
  const jpOpcodes = [0xC3];
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const allOpcodes = [...callOpcodes, ...jpOpcodes, ...condCallOpcodes, ...condJpOpcodes];

  // Search for references to 0x02FE84 and nearby addresses
  const searchTargets = new Set();
  for (let addr = 0x02FE70; addr <= 0x02FEA0; addr++) {
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

  console.log(`\nFound ${callers.length} references to 0x02FE70-0x02FEA0 region:\n`);

  for (const c of callers) {
    const decoded = decodeInstruction(romBytes, c.addr, 'adl');
    const dasmStr = decoded ? formatDecoded(decoded) : `${c.type} ${hex(c.target)}`;
    console.log(`  ${hex(c.addr)}:  ${dasmStr}  (target: ${hex(c.target)})`);
  }

  console.log();
  return callers;
}

// -- Part 3: Dynamic Trace --------------------------------------------------

async function dynamicTrace() {
  console.log('='.repeat(72));
  console.log('PART 3: Dynamic Trace of 0x02FE84 with key codes 0xE2-0xFB');
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
    cpu.iy = IY_BASE;
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
    const error = new Error('__PHASE230_STOP__');
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
  cpu.iy = IY_BASE;
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
    if (error?.message !== '__PHASE230_STOP__' || error.stopName !== 'mem_init_return') {
      throw error;
    }
  }

  console.log('OS boot complete.\n');

  // Save initial RAM snapshot for reuse
  const ramSnapshot = new Uint8Array(mem.length);
  ramSnapshot.set(mem);

  // Show nearby transpiled blocks
  const { compiledBlocks } = executor;
  const nearbyBlocks = [];
  for (const key of Object.keys(compiledBlocks)) {
    const [addrStr, mode] = key.split(':');
    const addr = parseInt(addrStr, 16);
    if (addr >= 0x02FE00 && addr <= 0x030000 && mode === 'adl') {
      nearbyBlocks.push({ addr, key });
    }
  }
  nearbyBlocks.sort((a, b) => a.addr - b.addr);

  console.log('Transpiled blocks near 0x02FE84:');
  for (const b of nearbyBlocks) {
    const marker = b.addr === TARGET_ADDR ? ' <-- TARGET' : '';
    console.log(`  ${hex(b.addr)} (${b.key})${marker}`);
  }
  console.log();

  // RAM addresses to watch for writes
  const watchAddrs = {
    0xD0058E: 'D0058E (key code)',
    0xD0058D: 'D0058D (secondary key)',
    0xD0059F: 'D0059F (magic A)',
  };
  // Also watch IY flag area
  for (let off = 0x00; off <= 0x30; off++) {
    const addr = IY_BASE + off;
    watchAddrs[addr] = `IY+${hex(off, 2)} (${hex(addr)})`;
  }

  // Test cases: representative key codes in the 0xE2-0xFB range
  const testKeyCodes = [0xE2, 0xE5, 0xEA, 0xF0, 0xF5, 0xFB];

  console.log('Testing key codes in 0xE2-0xFB range through 0x02FE84:\n');

  const results = [];

  for (const keyCode of testKeyCodes) {
    // Restore from snapshot for clean state
    mem.set(ramSnapshot);
    resetOsState(cpu, mem);

    // Set up as the key lookup function does before JP 0x02FE84:
    //   LD (D0058E), A  -- key code already written
    //   LD A, 0xFC
    //   JP 0x02FE84
    cpu.a = 0xFC;         // A = 0xFC (as set by the key lookup function)
    cpu.de = (0x01 << 8) | (cpu.de & 0xFF); // D = 0x01 (flag from key lookup)
    mem[D0058E_ADDR] = keyCode;  // Pre-seed with the actual key code

    // Set up stack with sentinel return
    cpu.sp = STACK_TOP;
    push24(cpu, mem, RETURN_SENTINEL);

    // Snapshot watched RAM values before execution
    const ramBefore = {};
    for (const addr of Object.keys(watchAddrs)) {
      ramBefore[addr] = mem[Number(addr)];
    }

    // Run from 0x02FE84
    let stopReason = 'unknown';
    let stepsRun = 0;
    const pcLog = [];
    const ramWrites = [];

    // Monkey-patch mem to capture writes in the watch range
    const origWrite = mem.constructor.prototype.set;

    try {
      executor.runFrom(TARGET_ADDR, 'adl', {
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
      if (error?.message === '__PHASE230_STOP__') {
        stopReason = error.stopName;
      } else {
        stopReason = `error: ${error.message}`;
      }
    }

    // Check which watched RAM values changed
    const ramChanges = [];
    for (const addrStr of Object.keys(watchAddrs)) {
      const addr = Number(addrStr);
      const before = ramBefore[addrStr];
      const after = mem[addr];
      if (before !== after) {
        ramChanges.push({
          addr,
          name: watchAddrs[addrStr],
          before,
          after,
        });
      }
    }

    const result = {
      keyCode,
      stopReason,
      stepsRun,
      finalA: cpu.a,
      finalHL: cpu.hl,
      finalDE: cpu.de,
      finalBC: cpu.bc,
      finalF: cpu.f,
      d0058e: mem[D0058E_ADDR],
      d0058d: mem[D0058D_ADDR],
      d0059f: mem[D0059F_ADDR],
      ramChanges,
      pcTrace: pcLog,
    };
    results.push(result);

    console.log(`  Key Code: ${hexByte(keyCode)}`);
    console.log(`    Setup: A=0xFC, D=0x01, (D0058E)=${hexByte(keyCode)}`);
    console.log(`    Stop reason: ${stopReason} after ${stepsRun} steps`);
    console.log(`    Final regs: A=${hexByte(cpu.a)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} F=${hexByte(cpu.f)}`);
    console.log(`    D0058E=${hexByte(mem[D0058E_ADDR])} D0058D=${hexByte(mem[D0058D_ADDR])} D0059F=${hexByte(mem[D0059F_ADDR])}`);

    if (ramChanges.length > 0) {
      console.log(`    RAM changes:`);
      for (const ch of ramChanges) {
        console.log(`      ${ch.name}: ${hexByte(ch.before)} -> ${hexByte(ch.after)}`);
      }
    } else {
      console.log(`    RAM changes: (none in watched range)`);
    }

    console.log(`    PC trace: ${pcLog.slice(0, 20).map(p => hex(p)).join(' -> ')}${pcLog.length > 20 ? ' ...' : ''}`);
    console.log();
  }

  // -- Summary Table --
  console.log('='.repeat(72));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(72));
  console.log();
  console.log('Key    Stop         Steps  D0058E  D0058D  D0059F  Final A  Blocks visited');
  console.log('-'.repeat(90));

  for (const r of results) {
    const blocks = [...new Set(r.pcTrace)].map(p => hex(p)).join(', ');
    console.log(
      `${hexByte(r.keyCode).padEnd(7)}` +
      `${r.stopReason.padEnd(13)}` +
      `${String(r.stepsRun).padEnd(7)}` +
      `${hexByte(r.d0058e).padEnd(8)}` +
      `${hexByte(r.d0058d).padEnd(8)}` +
      `${hexByte(r.d0059f).padEnd(8)}` +
      `${hexByte(r.finalA).padEnd(9)}` +
      blocks
    );
  }

  console.log();

  // Check if all key codes have the same behavior pattern
  const uniqueTraces = new Set(results.map(r => r.pcTrace.map(p => hex(p)).join('->')));
  if (uniqueTraces.size === 1) {
    console.log('All test key codes follow the SAME block trace path.');
  } else {
    console.log(`Found ${uniqueTraces.size} distinct execution paths.`);
  }

  // Show unique block sets
  const allBlocks = new Set();
  for (const r of results) {
    for (const pc of r.pcTrace) allBlocks.add(pc);
  }
  console.log(`\nAll unique blocks visited across all tests:`);
  const sortedBlocks = [...allBlocks].sort((a, b) => a - b);
  for (const b of sortedBlocks) {
    console.log(`  ${hex(b)}`);
  }
}

// -- Main -------------------------------------------------------------------

async function main() {
  staticDisassembly();
  findCallers();
  await dynamicTrace();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
