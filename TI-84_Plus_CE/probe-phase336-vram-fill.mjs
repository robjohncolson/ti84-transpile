#!/usr/bin/env node

/**
 * Phase 336: Analyze the VRAM fill kernel at 0x09EFDE.
 *
 * During the event loop this block wrote 26,112 bytes to 0xD40000-0xD44AFF.
 * This probe:
 *   1. Boots OS with the standard staged boot pattern.
 *   2. Disassembles the block at 0x09EFDE (~60 instructions).
 *   3. Disassembles the smaller block at 0x09EFEC (24-write VRAM block).
 *   4. Sets up execution at 0x09EFDE, instruments VRAM writes, runs up to
 *      50,000 steps.
 *   5. Reports: disassembly, register roles, loop type, written values,
 *      exact VRAM range, and whether this is a clear / partial fill / copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;
const MBASE = 0xD0;

const VRAM_BASE = 0xD40000;
const VRAM_END = 0xD5FFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const TARGET_BLOCK_A = 0x09EFDE;
const TARGET_BLOCK_B = 0x09EFEC;
const OUTER_LOOP_HEAD = 0x09EFCB;
const FUNCTION_ENTRY = 0x09F008;
const DISASM_COUNT_A = 60;
const DISASM_COUNT_B = 30;
const DISASM_OUTER_START = 0x09EFC0;
const DISASM_OUTER_END = 0x09F008;
const DISASM_FUNC_START = 0x09F008;
const DISASM_FUNC_END = 0x09F070;
const RUN_MAX_STEPS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(buffer[(start + index) & MEM_MASK]));
  }
  return bytes.join(' ');
}

function write24(buffer, addr, value) {
  const base = addr & 0xFFFFFF;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function read24(buffer, addr) {
  const base = addr & 0xFFFFFF;
  return buffer[base] | (buffer[base + 1] << 8) | (buffer[base + 2] << 16);
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function prepareDirectEntry(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

// ── Disassembly helpers ──

function resolveDecodedAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatPairImmediate(inst) {
  const width = inst.mode === 'adl' || inst.modePrefix === 'sil' || inst.modePrefix === 'lil' ? 6 : 4;
  return hex(inst.value, width);
}

function formatInstruction(inst) {
  if (!inst) {
    return 'decode-error';
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const memAddr = resolveDecodedAddress(inst);

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${formatPairImmediate(inst)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}ld (${hex(memAddr)}), ${inst.pair}`;
      }
      return `${prefix}ld ${inst.pair}, (${hex(memAddr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(memAddr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(memAddr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(memAddr)}), ${inst.src}`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'rotate-reg': return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${prefix}${inst.op} (${inst.indirectRegister})`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg':
      if (inst.op === 'sub' || inst.op === 'and' || inst.op === 'xor' || inst.op === 'or' || inst.op === 'cp') {
        return `${prefix}${inst.op} ${inst.src}`;
      }
      return `${prefix}${inst.op} a, ${inst.src}`;
    case 'alu-imm':
      if (inst.op === 'sub' || inst.op === 'and' || inst.op === 'xor' || inst.op === 'or' || inst.op === 'cp') {
        return `${prefix}${inst.op} ${hexByte(inst.value)}`;
      }
      return `${prefix}${inst.op} a, ${hexByte(inst.value)}`;
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'ldi': return `${prefix}ldi`;
    case 'ldd': return `${prefix}ldd`;
    case 'cpir': return `${prefix}cpir`;
    case 'cpdr': return `${prefix}cpdr`;
    case 'cpi': return `${prefix}cpi`;
    case 'cpd': return `${prefix}cpd`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'ex-sp-hl': return `${prefix}ex (sp), hl`;
    case 'exx': return `${prefix}exx`;
    case 'rla': return `${prefix}rla`;
    case 'rra': return `${prefix}rra`;
    case 'rlca': return `${prefix}rlca`;
    case 'rrca': return `${prefix}rrca`;
    case 'daa': return `${prefix}daa`;
    case 'cpl': return `${prefix}cpl`;
    case 'scf': return `${prefix}scf`;
    case 'ccf': return `${prefix}ccf`;
    case 'neg': return `${prefix}neg`;
    case 'reti': return `${prefix}reti`;
    case 'retn': return `${prefix}retn`;
    case 'rst': return `${prefix}rst ${hex(inst.target, 2)}`;
    case 'im': return `${prefix}im ${inst.value}`;
    case 'in': return `${prefix}in ${inst.dest}, (${inst.port !== undefined ? hexByte(inst.port) : 'c'})`;
    case 'out': return `${prefix}out (${inst.port !== undefined ? hexByte(inst.port) : 'c'}), ${inst.src}`;
    case 'set-bit': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'res-bit': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'indexed-ld-reg':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-ld-ind':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'indexed-ld-imm':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-inc':
      return `${prefix}inc (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-dec':
      return `${prefix}dec (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-alu':
      return `${prefix}${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
    case 'add-ix': return `${prefix}add ix, ${inst.src}`;
    case 'add-iy': return `${prefix}add iy, ${inst.src}`;
    case 'tst-a-imm': return `${prefix}tst a, ${hexByte(inst.value)}`;
    case 'lea': return `${prefix}lea ${inst.dest}, ${inst.indexRegister}${disp(inst.displacement)}`;
    case 'pea': return `${prefix}pea ${inst.indexRegister}${disp(inst.displacement)}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeRow(rom, addr) {
  const inst = decodeInstruction(rom, addr, 'adl');
  return {
    pc: inst.pc >>> 0,
    bytes: bytesAt(rom, inst.pc, inst.length),
    text: formatInstruction(inst),
    length: inst.length,
    tag: inst.tag,
    target: inst.target ?? null,
    inst,
  };
}

function disasmBlock(rom, startAddr, count) {
  const rows = [];
  let pc = startAddr & 0xFFFFFF;
  for (let i = 0; i < count; i++) {
    const row = decodeRow(rom, pc);
    rows.push(row);
    pc = (pc + Math.max(row.length, 1)) & 0xFFFFFF;
    if (row.tag === 'ret' || row.tag === 'reti' || row.tag === 'retn') {
      break;
    }
  }
  return rows;
}

function printDisasm(label, rows) {
  console.log(`\n${label}:`);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
  }
}

// ── Main ──

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 336: VRAM fill kernel analysis (0x09EFDE)');
console.log('================================================');

// ── Step 1: Boot OS ──

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: BOOT_MAX_STEPS,
  maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
resetStack(cpu, mem);

const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: KERNEL_INIT_MAX_STEPS,
  maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
});

cpu.mbase = MBASE;
cpu.iy = IY_BASE;
cpu.hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
resetStack(cpu, mem);

console.log(`boot:        steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)} mode=${boot.lastMode}`);
console.log(`kernel_init: steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)} mode=${kernelInit.lastMode}`);

// ── Step 2: Disassemble all relevant regions from ROM ──

function disasmRange(start, end) {
  const rows = [];
  let pc = start & 0xFFFFFF;
  while (pc < end) {
    const row = decodeRow(romBytes, pc);
    rows.push(row);
    pc = (pc + Math.max(row.length, 1)) & 0xFFFFFF;
  }
  return rows;
}

const disasmOuter = disasmRange(DISASM_OUTER_START, DISASM_OUTER_END);
const disasmA = disasmBlock(romBytes, TARGET_BLOCK_A, DISASM_COUNT_A);
const disasmB = disasmBlock(romBytes, TARGET_BLOCK_B, DISASM_COUNT_B);
const disasmFunc = disasmRange(DISASM_FUNC_START, DISASM_FUNC_END);

printDisasm('Outer loop region (0x09EFC0-0x09F007)', disasmOuter);
printDisasm('Block A: 0x09EFDE inner DJNZ loop (26,112-write heavy hitter)', disasmA);
printDisasm('Block B: 0x09EFEC (24-write sparse tail)', disasmB);
printDisasm('Function entry: 0x09F008 (sets up rows/cols for fill)', disasmFunc);

// Analyze disassembly for LDIR / DJNZ / loop patterns
const allDisasm = [...disasmOuter, ...disasmA];
const loopTypes = { ldir: 0, lddr: 0, djnz: 0, 'jr-conditional': 0, ldi: 0, ldd: 0 };
for (const row of allDisasm) {
  if (row.tag in loopTypes) {
    loopTypes[row.tag]++;
  }
}
console.log('\nLoop pattern detection in outer+inner:');
for (const [tag, count] of Object.entries(loopTypes)) {
  if (count > 0) {
    console.log(`  ${tag}: ${count} occurrence(s)`);
  }
}
if (Object.values(loopTypes).every((c) => c === 0)) {
  console.log('  No LDIR/LDDR/DJNZ/JR found — check for manual loop or block-move.');
}

// Annotate the fill mechanism
console.log('\n=== Structure Analysis ===');
console.log('Inner loop at 0x09EFDE:');
console.log('  ld (hl), e ; inc hl ; ld (hl), d ; inc hl  (x2, then djnz)');
console.log('  = 4 bytes per iteration (2 pixels), B iterations per inner pass');
console.log('Outer loop at 0x09EFCB..0x09EFFF:');
console.log('  Advances D0059C (row pointer) by 0x280 = 640 = one scanline at 16bpp');
console.log('  dec a ; jr nz,0x09EFCB → A = row counter');
console.log('Total: A rows x (B*4 + possible tail) bytes per row');

// ── Step 3: Instrument VRAM writes and execute ──
//
// Strategy:
//   Run A: Enter at 0x09F008 (the function that computes row/col VRAM address,
//          then falls into the outer loop at 0x09EFCB). This is the natural
//          entry the OS uses.
//   Run B: If Run A yields 0 VRAM writes (bad register state), seed registers
//          manually and enter at the outer loop head 0x09EFCB.

function runWithVramTrace(label, entryPc, preSetup) {
  // Fresh state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  if (preSetup) {
    preSetup();
  }

  // Snapshot VRAM before execution
  const vramSnapshotBefore = new Uint8Array(VRAM_END - VRAM_BASE + 1);
  vramSnapshotBefore.set(mem.subarray(VRAM_BASE, VRAM_END + 1));

  // Track VRAM writes
  const vramWriteLog = [];
  let vramWriteCount = 0;
  let vramWriteMinAddr = 0xFFFFFF;
  let vramWriteMaxAddr = 0x000000;
  const writtenValues = new Map();
  const blockVisitCounts = new Map();

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordVramWrite(addr, value, width) {
    const a = addr & 0xFFFFFF;
    if (a >= VRAM_BASE && a <= VRAM_END) {
      vramWriteCount++;
      if (a < vramWriteMinAddr) vramWriteMinAddr = a;
      const endAddr = a + width - 1;
      if (endAddr > vramWriteMaxAddr) vramWriteMaxAddr = endAddr;

      if (vramWriteLog.length < 200) {
        vramWriteLog.push({ addr: a, value, width, pc: cpu.pc });
      }

      const v = value & 0xFF;
      writtenValues.set(v, (writtenValues.get(v) || 0) + 1);
      if (width >= 2) {
        const v2 = (value >>> 8) & 0xFF;
        writtenValues.set(v2, (writtenValues.get(v2) || 0) + 1);
      }
      if (width >= 3) {
        const v3 = (value >>> 16) & 0xFF;
        writtenValues.set(v3, (writtenValues.get(v3) || 0) + 1);
      }
    }
  }

  cpu.write8 = (addr, value) => {
    recordVramWrite(addr, value, 1);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordVramWrite(addr, value, 2);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordVramWrite(addr, value, 3);
    return origWrite24(addr, value);
  };

  const regsBefore = {
    a: cpu.a, f: cpu.f,
    bc: cpu._bc, de: cpu._de, hl: cpu._hl,
    ix: cpu._ix, iy: cpu._iy,
    sp: cpu.sp, pc: cpu.pc,
  };

  const result = executor.runFrom(entryPc, 'adl', {
    maxSteps: RUN_MAX_STEPS,
    maxLoopIterations: RUN_MAX_STEPS,
    onBlock(pc, mode) {
      const key = pc & 0xFFFFFF;
      blockVisitCounts.set(key, (blockVisitCounts.get(key) || 0) + 1);
    },
    onMissingBlock(pc, mode) {
      const key = pc & 0xFFFFFF;
      blockVisitCounts.set(key, (blockVisitCounts.get(key) || 0) + 1);
    },
  });

  const regsAfter = {
    a: cpu.a, f: cpu.f,
    bc: cpu._bc, de: cpu._de, hl: cpu._hl,
    ix: cpu._ix, iy: cpu._iy,
    sp: cpu.sp, pc: cpu.pc,
  };

  // Restore write hooks
  cpu.write8 = origWrite8;
  cpu.write16 = origWrite16;
  cpu.write24 = origWrite24;

  return {
    label, result, regsBefore, regsAfter,
    vramWriteCount, vramWriteMinAddr, vramWriteMaxAddr,
    vramWriteLog, writtenValues, blockVisitCounts, vramSnapshotBefore,
  };
}

function reportRun(run) {
  const {
    label, result, regsBefore, regsAfter,
    vramWriteCount, vramWriteMinAddr, vramWriteMaxAddr,
    vramWriteLog, writtenValues, blockVisitCounts, vramSnapshotBefore,
  } = run;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Run: ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`);
  console.log(`loopsForced=${result.loopsForced ?? 0}`);

  console.log('\nRegisters before execution:');
  console.log(`  A=${hexByte(regsBefore.a)} F=${hexByte(regsBefore.f)} BC=${hex(regsBefore.bc)} DE=${hex(regsBefore.de)} HL=${hex(regsBefore.hl)}`);
  console.log(`  IX=${hex(regsBefore.ix)} IY=${hex(regsBefore.iy)} SP=${hex(regsBefore.sp)}`);

  console.log('\nRegisters after execution:');
  console.log(`  A=${hexByte(regsAfter.a)} F=${hexByte(regsAfter.f)} BC=${hex(regsAfter.bc)} DE=${hex(regsAfter.de)} HL=${hex(regsAfter.hl)}`);
  console.log(`  IX=${hex(regsAfter.ix)} IY=${hex(regsAfter.iy)} SP=${hex(regsAfter.sp)}`);

  console.log('\n--- VRAM Write Analysis ---');
  console.log(`Total VRAM writes: ${vramWriteCount}`);
  if (vramWriteCount > 0) {
    console.log(`VRAM range: ${hex(vramWriteMinAddr)} - ${hex(vramWriteMaxAddr)}`);
    console.log(`Byte span: ${vramWriteMaxAddr - vramWriteMinAddr + 1} bytes (${hex(vramWriteMaxAddr - vramWriteMinAddr + 1)})`);
    console.log(`Expected: 26,112 bytes from 0xD40000 to 0xD44AFF`);
  }

  // Value distribution
  console.log('\nWritten value distribution (top 10):');
  const sortedValues = [...writtenValues.entries()].sort((a, b) => b[1] - a[1]);
  const totalValueWrites = sortedValues.reduce((sum, [, count]) => sum + count, 0);
  for (const [value, count] of sortedValues.slice(0, 10)) {
    const pct = ((count / totalValueWrites) * 100).toFixed(1);
    console.log(`  ${hexByte(value)}: ${count} (${pct}%)`);
  }

  const uniqueValueCount = writtenValues.size;
  console.log(`\nUnique byte values written: ${uniqueValueCount}`);

  if (uniqueValueCount === 0) {
    console.log('No VRAM writes recorded.');
  } else if (uniqueValueCount === 1) {
    const [singleValue] = writtenValues.keys();
    console.log(`ALL writes are the same value: ${hexByte(singleValue)} — this is a SCREEN CLEAR / FILL`);
  } else if (uniqueValueCount <= 4) {
    console.log('Very few unique values — likely a PARTIAL FILL or PATTERN FILL');
  } else {
    console.log('Many unique values — likely a BUFFER COPY (source -> VRAM)');
  }

  // Check VRAM diff
  const vramSnapshotAfter = mem.subarray(VRAM_BASE, VRAM_END + 1);
  const checkEnd = vramWriteCount > 0
    ? Math.min(vramWriteMaxAddr - VRAM_BASE + 1, vramSnapshotBefore.length)
    : 0;
  if (checkEnd > 0) {
    let changedBytes = 0;
    for (let i = 0; i < checkEnd; i++) {
      if (vramSnapshotBefore[i] !== vramSnapshotAfter[i]) {
        changedBytes++;
      }
    }
    console.log(`\nVRAM diff (0xD40000..${hex(VRAM_BASE + checkEnd - 1)}): ${changedBytes} bytes changed`);
  }

  // First 20 writes
  if (vramWriteLog.length > 0) {
    console.log('\nFirst 20 VRAM writes:');
    for (let i = 0; i < Math.min(20, vramWriteLog.length); i++) {
      const w = vramWriteLog[i];
      console.log(`  [${i}] pc=${hex(w.pc)} addr=${hex(w.addr)} val=${hex(w.value, w.width * 2)} width=${w.width}`);
    }
  }

  // Stride analysis
  if (vramWriteLog.length >= 2) {
    const strides = new Map();
    for (let i = 1; i < Math.min(100, vramWriteLog.length); i++) {
      const stride = vramWriteLog[i].addr - vramWriteLog[i - 1].addr;
      strides.set(stride, (strides.get(stride) || 0) + 1);
    }
    console.log('\nWrite stride analysis (first 100 writes):');
    const sortedStrides = [...strides.entries()].sort((a, b) => b[1] - a[1]);
    for (const [stride, count] of sortedStrides.slice(0, 5)) {
      console.log(`  stride=${stride} (${hex(stride, 4)}): ${count} occurrences`);
    }
  }

  // Block visit counts
  console.log('\nBlocks visited during execution (top 15 by hit count):');
  const sortedBlocks = [...blockVisitCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [pc, count] of sortedBlocks.slice(0, 15)) {
    console.log(`  ${hex(pc)}: ${count} visits`);
  }

  return vramWriteCount;
}

// Run A: Enter at function entry 0x09F008
const runA = runWithVramTrace('Run A: function entry 0x09F008', FUNCTION_ENTRY, null);
const countA = reportRun(runA);

// Run B: Seed registers and enter at outer loop 0x09EFCB
// From the disassembly: HL=VRAM dest, DE=fill value (16-bit color), B=inner loop count, A=row count
// Simulate a full-screen clear: 240 rows, 160 iterations/row (160 * 4 bytes = 640 = one scanline)
const runB = runWithVramTrace('Run B: seeded outer loop 0x09EFCB', OUTER_LOOP_HEAD, () => {
  cpu._hl = VRAM_BASE;            // HL = VRAM destination start
  cpu._de = 0xFFFF;               // DE = fill value (white, 16bpp RGB565)
  cpu._bc = (0xA0 << 8) | (cpu._bc & 0xFF);  // B = 160 (0xA0) inner iterations -> 160*4=640 bytes/row
  cpu.a = 0x1E;                   // A = 30 rows (test subset)
  cpu.f = 0x00;

  // The outer loop reads/writes D0059C as the row pointer
  write24(mem, 0xD0059C, VRAM_BASE);

  // Push values that pop bc / pop af expect at 0x09EFE8-0x09EFE9
  // The inner loop ends with pop bc (restores outer BC) and pop af (restores outer A + flags)
  // We need to push af then push bc before entering
  cpu.sp -= 3;
  write24(mem, cpu.sp, cpu._bc & 0xFFFFFF);   // push bc (saved for pop bc)
  cpu.sp -= 3;
  // push af: A in high byte, F in low byte — but in ADL mode it's 3 bytes
  const afValue = ((cpu.a & 0xFF) << 8) | (cpu.f & 0xFF);
  write24(mem, cpu.sp, afValue);               // push af
});
reportRun(runB);

// ── Step 4: Report ──

console.log('\n=== Execution Results ===');
console.log(`steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`);
console.log(`loopsForced=${result.loopsForced ?? 0}`);

console.log('\nRegisters before execution:');
console.log(`  A=${hexByte(regsBefore.a)} F=${hexByte(regsBefore.f)} BC=${hex(regsBefore.bc)} DE=${hex(regsBefore.de)} HL=${hex(regsBefore.hl)}`);
console.log(`  IX=${hex(regsBefore.ix)} IY=${hex(regsBefore.iy)} SP=${hex(regsBefore.sp)}`);

console.log('\nRegisters after execution:');
console.log(`  A=${hexByte(regsAfter.a)} F=${hexByte(regsAfter.f)} BC=${hex(regsAfter.bc)} DE=${hex(regsAfter.de)} HL=${hex(regsAfter.hl)}`);
console.log(`  IX=${hex(regsAfter.ix)} IY=${hex(regsAfter.iy)} SP=${hex(regsAfter.sp)}`);

console.log('\n=== VRAM Write Analysis ===');
console.log(`Total VRAM writes: ${vramWriteCount}`);
if (vramWriteCount > 0) {
  console.log(`VRAM range: ${hex(vramWriteMinAddr)} - ${hex(vramWriteMaxAddr)}`);
  console.log(`Byte span: ${vramWriteMaxAddr - vramWriteMinAddr + 1} bytes (${hex(vramWriteMaxAddr - vramWriteMinAddr + 1)})`);
  console.log(`Expected: 26,112 bytes from 0xD40000 to 0xD44AFF`);
}

// Value distribution
console.log('\nWritten value distribution (top 10):');
const sortedValues = [...writtenValues.entries()].sort((a, b) => b[1] - a[1]);
const totalValueWrites = sortedValues.reduce((sum, [, count]) => sum + count, 0);
for (const [value, count] of sortedValues.slice(0, 10)) {
  const pct = ((count / totalValueWrites) * 100).toFixed(1);
  console.log(`  ${hexByte(value)}: ${count} (${pct}%)`);
}

const uniqueValueCount = writtenValues.size;
console.log(`\nUnique byte values written: ${uniqueValueCount}`);

if (uniqueValueCount === 1) {
  const [singleValue] = writtenValues.keys();
  console.log(`ALL writes are the same value: ${hexByte(singleValue)} — this is a SCREEN CLEAR / FILL`);
} else if (uniqueValueCount <= 4) {
  console.log(`Very few unique values — likely a PARTIAL FILL or PATTERN FILL`);
} else {
  console.log(`Many unique values — likely a BUFFER COPY (source → VRAM)`);
}

// Check if written region differs from before
const vramSnapshotAfter = mem.subarray(VRAM_BASE, VRAM_END + 1);
let changedBytes = 0;
let unchangedBytes = 0;
const checkEnd = Math.min(vramWriteMaxAddr - VRAM_BASE + 1, vramSnapshotBefore.length);
for (let i = 0; i < checkEnd; i++) {
  if (vramSnapshotBefore[i] !== vramSnapshotAfter[i]) {
    changedBytes++;
  } else {
    unchangedBytes++;
  }
}
console.log(`\nVRAM diff (0xD40000..${hex(VRAM_BASE + checkEnd - 1)}): ${changedBytes} bytes changed, ${unchangedBytes} unchanged`);

// First 20 writes
if (vramWriteLog.length > 0) {
  console.log('\nFirst 20 VRAM writes:');
  for (let i = 0; i < Math.min(20, vramWriteLog.length); i++) {
    const w = vramWriteLog[i];
    console.log(`  [${i}] pc=${hex(w.pc)} addr=${hex(w.addr)} val=${hex(w.value, w.width * 2)} width=${w.width}`);
  }
}

// Stride analysis: check if writes are sequential
if (vramWriteLog.length >= 2) {
  const strides = new Map();
  for (let i = 1; i < Math.min(100, vramWriteLog.length); i++) {
    const stride = vramWriteLog[i].addr - vramWriteLog[i - 1].addr;
    strides.set(stride, (strides.get(stride) || 0) + 1);
  }
  console.log('\nWrite stride analysis (first 100 writes):');
  const sortedStrides = [...strides.entries()].sort((a, b) => b[1] - a[1]);
  for (const [stride, count] of sortedStrides.slice(0, 5)) {
    console.log(`  stride=${stride} (${hex(stride, 4)}): ${count} occurrences`);
  }
}

// Block visit counts
console.log('\nBlocks visited during execution (top 15 by hit count):');
const sortedBlocks = [...blockVisitCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [pc, count] of sortedBlocks.slice(0, 15)) {
  console.log(`  ${hex(pc)}: ${count} visits`);
}

// ── Hypothesis ──

console.log('\n=== Hypothesis ===');

const hasLdir = disasmA.some((r) => r.tag === 'ldir');
const hasLddr = disasmA.some((r) => r.tag === 'lddr');
const hasDjnz = disasmA.some((r) => r.tag === 'djnz');
const hasLdi = disasmA.some((r) => r.tag === 'ldi');

if (hasLdir) {
  console.log('Mechanism: LDIR (block copy/fill). HL=source, DE=dest, BC=count.');
} else if (hasLddr) {
  console.log('Mechanism: LDDR (reverse block copy/fill). HL=source, DE=dest, BC=count.');
} else if (hasDjnz) {
  console.log('Mechanism: DJNZ loop (B=counter).');
} else if (hasLdi) {
  console.log('Mechanism: LDI-based manual loop.');
} else {
  console.log('Mechanism: Manual loop or indirect block transfer (no LDIR/DJNZ/LDI found in disasm).');
}

if (uniqueValueCount === 1) {
  console.log('Purpose: Screen clear — writes a single repeated value across the VRAM region.');
} else if (uniqueValueCount <= 4) {
  console.log('Purpose: Pattern fill — writes a small set of values (possibly a stripe/background pattern).');
} else {
  console.log('Purpose: Buffer copy — transfers varied pixel data into the VRAM framebuffer.');
}

const pixelCount = vramWriteCount > 0
  ? Math.floor((vramWriteMaxAddr - vramWriteMinAddr + 1) / 2)
  : 0;
const rowCount = pixelCount > 0 ? Math.floor(pixelCount / 320) : 0;
console.log(`Pixel estimate: ${pixelCount} pixels at 16bpp = ~${rowCount} rows of 320 pixels`);
console.log(`This covers ${((rowCount / 240) * 100).toFixed(1)}% of the 320x240 LCD`);

console.log('\nDone.');
