#!/usr/bin/env node

/**
 * Phase 373 — Disassemble keyboard scan subroutine at 0x003C63
 *
 * Static disassembly of 0x003C63..0x003D59 (full keyboard scan routine,
 * up to the start of _GetCSC at 0x003D5A).
 *
 * Dynamic trace: boot OS through phases 1-3, set ENTER key in keyMatrix,
 * run event loop for 200k steps and log all memory writes to 0xD00000-0xD00FFF
 * during calls to 0x003C63.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const SCAN_START = 0x003C63;
const SCAN_END = 0x003D59;  // exclusive — _GetCSC starts at 0x003D5A

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

// ── helpers ──

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (v) => hexByte(v),
  ).join(' ');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((e) => e?.id).map((e) => [e.id, e]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  romBytes.copy(mem, 0, 0, romBytes.length);
  return mem;
}

// ── instruction formatter (comprehensive) ──

function formatInstruction(inst) {
  if (!inst) return 'unknown';
  const t = inst.tag;

  // Basic loads
  if (t === 'ld-reg-imm') return `LD ${inst.dest.toUpperCase()}, 0x${hexByte(inst.value)}`;
  if (t === 'ld-reg-reg') return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
  if (t === 'ld-reg-mem') return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
  if (t === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-pair-imm') return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
  if (t === 'ld-ind-imm') return `LD (HL), 0x${hexByte(inst.value)}`;
  if (t === 'ld-mem-pair') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
  if (t === 'ld-pair-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;

  // IX/IY indexed
  if (t === 'ld-reg-ixd') return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
  if (t === 'ld-ixd-reg') return `LD (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-ixd-imm') return `LD (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)}), 0x${hexByte(inst.value)}`;
  if (t === 'ld-ixiy-indexed') return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
  if (t === 'inc-ixd') return `INC (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;

  // Stack
  if (t === 'push') return `PUSH ${inst.pair.toUpperCase()}`;
  if (t === 'pop') return `POP ${inst.pair.toUpperCase()}`;

  // Control flow
  if (t === 'call') return `CALL ${hex(inst.target)}`;
  if (t === 'call-conditional') return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'ret') return 'RET';
  if (t === 'ret-conditional') return `RET ${inst.condition.toUpperCase()}`;
  if (t === 'retn') return 'RETN';
  if (t === 'reti') return 'RETI';
  if (t === 'jp') return `JP ${hex(inst.target)}`;
  if (t === 'jp-conditional') return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'jp-indirect') return `JP (${(inst.indirectRegister || 'hl').toUpperCase()})`;
  if (t === 'jr') return `JR ${hex(inst.target)}`;
  if (t === 'jr-conditional') return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'djnz') return `DJNZ ${hex(inst.target)}`;
  if (t === 'rst') return `RST ${hex(inst.vector ?? inst.target, 2)}`;

  // ALU
  if (t === 'alu-reg') return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
  if (t === 'alu-imm') return `${inst.op.toUpperCase()} 0x${hexByte(inst.value)}`;

  // Inc/Dec
  if (t === 'inc-reg') return `INC ${inst.reg.toUpperCase()}`;
  if (t === 'dec-reg') return `DEC ${inst.reg.toUpperCase()}`;
  if (t === 'inc-pair') return `INC ${inst.pair.toUpperCase()}`;
  if (t === 'dec-pair') return `DEC ${inst.pair.toUpperCase()}`;
  if (t === 'add-pair') return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;

  // Bit manipulation
  if (t === 'indexed-cb-bit') return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
  if (t === 'indexed-cb-set') return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
  if (t === 'indexed-cb-res') return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
  if (t === 'bit-test') return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-test-ind') return `BIT ${inst.bit}, (${(inst.indirectRegister || 'hl').toUpperCase()})`;
  if (t === 'bit-set') return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-set-ind') return `SET ${inst.bit}, (${(inst.indirectRegister || 'hl').toUpperCase()})`;
  if (t === 'bit-res') return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-res-ind') return `RES ${inst.bit}, (${(inst.indirectRegister || 'hl').toUpperCase()})`;

  // Rotate
  if (t === 'rla') return 'RLA';
  if (t === 'rlca') return 'RLCA';
  if (t === 'rra') return 'RRA';
  if (t === 'rrca') return 'RRCA';
  if (t === 'rotate-reg') return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
  if (t === 'rotate-ind') return `${inst.op.toUpperCase()} (${(inst.indirectRegister || 'hl').toUpperCase()})`;
  if (t === 'indexed-cb-rotate') return `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;

  // I/O
  if (t === 'in-reg') return `IN ${inst.reg.toUpperCase()}, (C)`;
  if (t === 'out-reg') return `OUT (C), ${inst.reg.toUpperCase()}`;
  if (t === 'in-imm') return `IN A, (0x${hexByte(inst.port)})`;
  if (t === 'out-imm') return `OUT (0x${hexByte(inst.port)}), A`;
  if (t === 'in0') return `IN0 ${inst.reg.toUpperCase()}, (0x${hexByte(inst.port)})`;
  if (t === 'out0') return `OUT0 (0x${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`;
  if (t === 'ini') return 'INI';
  if (t === 'inir') return 'INIR';
  if (t === 'ind') return 'IND';
  if (t === 'indr') return 'INDR';
  if (t === 'outi') return 'OUTI';
  if (t === 'outd') return 'OUTD';

  // Misc
  if (t === 'nop') return 'NOP';
  if (t === 'halt') return 'HALT';
  if (t === 'di') return 'DI';
  if (t === 'ei') return 'EI';
  if (t === 'scf') return 'SCF';
  if (t === 'ccf') return 'CCF';
  if (t === 'cpl') return 'CPL';
  if (t === 'neg') return 'NEG';
  if (t === 'ex-af') return "EX AF, AF'";
  if (t === 'exx') return 'EXX';
  if (t === 'ex-sp-pair') return `EX (SP), ${(inst.pair || 'hl').toUpperCase()}`;
  if (t === 'ex-de-hl') return 'EX DE, HL';
  if (t === 'ldi') return 'LDI';
  if (t === 'ldir') return 'LDIR';
  if (t === 'ldd') return 'LDD';
  if (t === 'lddr') return 'LDDR';
  if (t === 'cpi') return 'CPI';
  if (t === 'cpir') return 'CPIR';
  if (t === 'cpd') return 'CPD';
  if (t === 'cpdr') return 'CPDR';
  if (t === 'im') return `IM ${inst.mode}`;

  // Fallback
  if (t === 'db') return `DB 0x${hexByte(inst.value)}`;
  return t || 'unknown';
}

// ── decode helper ──

function decodeAt(memory, addr, mode = MODE) {
  try {
    const inst = decodeInstruction(memory, addr, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[addr] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── annotation helpers ──

function annotateInstruction(inst, addr) {
  const notes = [];

  // Port reads (keyboard matrix 0xA000-0xA014)
  if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'in0' || inst.tag === 'ini' || inst.tag === 'inir') {
    notes.push('** PORT READ (keyboard matrix?) **');
  }
  if (inst.tag === 'out-reg' || inst.tag === 'out-imm' || inst.tag === 'out0' || inst.tag === 'outi') {
    notes.push('** PORT WRITE **');
  }

  // IY-relative writes (IY=0xD00080): BIT/SET/RES, LD (IY+d)
  if (inst.tag === 'indexed-cb-bit' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** BIT ${inst.bit} test on (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
  }
  if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** SET ${inst.bit} on (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
  }
  if (inst.tag === 'indexed-cb-res' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** RES ${inst.bit} on (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
  }
  if (inst.tag === 'ld-ixd-reg' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** WRITE ${inst.src.toUpperCase()} to (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
    if (target === 0xD00587) notes.push('** WRITES TO SCAN CODE STORAGE 0xD00587 **');
  }
  if (inst.tag === 'ld-ixd-imm' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** WRITE 0x${hexByte(inst.value)} to (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
    if (target === 0xD00587) notes.push('** WRITES TO SCAN CODE STORAGE 0xD00587 **');
  }
  if (inst.tag === 'ld-reg-ixd' && inst.indexRegister === 'iy') {
    const target = 0xD00080 + (inst.displacement ?? 0);
    notes.push(`** READ from (IY${formatDisp(inst.displacement)}) = ${hex(target)} **`);
  }

  // Direct memory writes to 0xD00587
  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000 && inst.addr <= 0xD00FFF) {
    notes.push(`** WRITE ${inst.src.toUpperCase()} to ${hex(inst.addr)} **`);
    if (inst.addr === 0xD00587) notes.push('** WRITES TO SCAN CODE STORAGE 0xD00587 **');
  }

  return notes;
}

// ══════════════════════════════════════════════
//  PART 1 — STATIC DISASSEMBLY
// ══════════════════════════════════════════════

console.log('═══════════════════════════════════════════════');
console.log(' Phase 373 — Disassembly of 0x003C63 keyboard scan subroutine');
console.log('═══════════════════════════════════════════════');
console.log('');

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = fs.readFileSync(ROM_PATH);

console.log('=== STATIC DISASSEMBLY: 0x003C63 .. 0x003D59 ===');
console.log('');

let pc = SCAN_START;
const allInstructions = [];

while (pc <= SCAN_END) {
  const inst = decodeAt(romBytes, pc);
  const length = Math.max(inst.length ?? 1, 1);
  const bytes = hexBytes(romBytes, pc, length);
  const text = formatInstruction(inst);
  const notes = annotateInstruction(inst, pc);
  const errorSuffix = inst.decodeError ? `  ; DECODE ERROR: ${inst.decodeError}` : '';

  allInstructions.push({ pc, length, bytes, text, tag: inst.tag, inst, notes });

  let line = `  ${hex(pc)}: ${bytes.padEnd(20)} ${text}`;
  if (notes.length > 0) line += `  ; ${notes.join(' | ')}`;
  if (errorSuffix) line += errorSuffix;
  console.log(line);

  pc += length;
}

// ── summary of flagged instructions ──

console.log('');
console.log('=== FLAGGED INSTRUCTIONS SUMMARY ===');
console.log('');

const portReads = allInstructions.filter((i) =>
  ['in-reg', 'in-imm', 'in0', 'ini', 'inir', 'ind', 'indr'].includes(i.tag)
);
const portWrites = allInstructions.filter((i) =>
  ['out-reg', 'out-imm', 'out0', 'outi', 'outd'].includes(i.tag)
);
const iyBitOps = allInstructions.filter((i) =>
  ['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(i.tag) &&
  i.inst.indexRegister === 'iy'
);
const iyWrites = allInstructions.filter((i) =>
  (['ld-ixd-reg', 'ld-ixd-imm'].includes(i.tag) && i.inst.indexRegister === 'iy')
);
const iyReads = allInstructions.filter((i) =>
  i.tag === 'ld-reg-ixd' && i.inst.indexRegister === 'iy'
);
const directMemWrites = allInstructions.filter((i) =>
  i.tag === 'ld-mem-reg' && i.inst.addr >= 0xD00000 && i.inst.addr <= 0xD00FFF
);

console.log(`Port reads (IN instructions): ${portReads.length}`);
for (const i of portReads) console.log(`  ${hex(i.pc)}: ${i.text}`);

console.log(`\nPort writes (OUT instructions): ${portWrites.length}`);
for (const i of portWrites) console.log(`  ${hex(i.pc)}: ${i.text}`);

console.log(`\nIY-relative BIT/SET/RES operations: ${iyBitOps.length}`);
for (const i of iyBitOps) {
  const target = 0xD00080 + (i.inst.displacement ?? 0);
  console.log(`  ${hex(i.pc)}: ${i.text}  -> ${hex(target)}`);
}

console.log(`\nIY-relative writes (LD (IY+d), ...): ${iyWrites.length}`);
for (const i of iyWrites) {
  const target = 0xD00080 + (i.inst.displacement ?? 0);
  console.log(`  ${hex(i.pc)}: ${i.text}  -> ${hex(target)}`);
}

console.log(`\nIY-relative reads (LD r, (IY+d)): ${iyReads.length}`);
for (const i of iyReads) {
  const target = 0xD00080 + (i.inst.displacement ?? 0);
  console.log(`  ${hex(i.pc)}: ${i.text}  -> ${hex(target)}`);
}

console.log(`\nDirect memory writes to 0xD00000-0xD00FFF: ${directMemWrites.length}`);
for (const i of directMemWrites) console.log(`  ${hex(i.pc)}: ${i.text}`);

// Check specifically for 0xD00587 references
const scanCodeRefs = allInstructions.filter((i) => {
  if (i.tag === 'ld-ixd-reg' && i.inst.indexRegister === 'iy' && (0xD00080 + (i.inst.displacement ?? 0)) === 0xD00587) return true;
  if (i.tag === 'ld-ixd-imm' && i.inst.indexRegister === 'iy' && (0xD00080 + (i.inst.displacement ?? 0)) === 0xD00587) return true;
  if (i.tag === 'ld-mem-reg' && i.inst.addr === 0xD00587) return true;
  if (i.tag === 'ld-reg-ixd' && i.inst.indexRegister === 'iy' && (0xD00080 + (i.inst.displacement ?? 0)) === 0xD00587) return true;
  if (i.tag === 'ld-reg-mem' && i.inst.addr === 0xD00587) return true;
  // IY offset 0x507 = 0xD00587 - 0xD00080
  return false;
});

const d00080Refs = allInstructions.filter((i) => {
  if (['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(i.tag) && i.inst.indexRegister === 'iy') {
    return (0xD00080 + (i.inst.displacement ?? 0)) >= 0xD00080 && (0xD00080 + (i.inst.displacement ?? 0)) <= 0xD000FF;
  }
  if (['ld-ixd-reg', 'ld-ixd-imm'].includes(i.tag) && i.inst.indexRegister === 'iy') {
    const t = 0xD00080 + (i.inst.displacement ?? 0);
    return t >= 0xD00080 && t <= 0xD000FF;
  }
  return false;
});

console.log(`\nReferences to 0xD00587 (scan code storage): ${scanCodeRefs.length}`);
for (const i of scanCodeRefs) console.log(`  ${hex(i.pc)}: ${i.text}`);

console.log(`\nWrites to 0xD00080..0xD000FF (IY-relative, low offsets): ${d00080Refs.length}`);
for (const i of d00080Refs) {
  const target = 0xD00080 + (i.inst.displacement ?? 0);
  console.log(`  ${hex(i.pc)}: ${i.text}  -> ${hex(target)}`);
}

// ══════════════════════════════════════════════
//  PART 2 — DYNAMIC TRACE
// ══════════════════════════════════════════════

console.log('');
console.log('=== DYNAMIC TRACE ===');
console.log('');

const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

console.log(`Loaded ${count(Object.keys(blocks).length)} blocks from ROM.transpiled.js`);

// Boot phases 1-3
const mem = createMemoryImage(romBytes);
const bootPeripherals = createPeripheralBus({ timerInterrupt: false });
const bootExecutor = createExecutor(blocks, mem, { peripherals: bootPeripherals });
const cpu = bootExecutor.cpu;

// Phase 1
const p1 = bootExecutor.runFrom(PHASE1_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`Phase 1 (cold boot): steps=${count(p1.steps)} termination=${p1.termination} lastPc=${hex(p1.lastPc)}`);

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = BOOT_RESET_SP;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 2
const p2 = bootExecutor.runFrom(PHASE2_ENTRY, MODE, { maxSteps: 100000, maxLoopIterations: 10000 });
console.log(`Phase 2 (OS init): steps=${count(p2.steps)} termination=${p2.termination} lastPc=${hex(p2.lastPc)}`);

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = BOOT_RESET_SP;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 3
const p3 = bootExecutor.runFrom(PHASE3_ENTRY, MODE, { maxSteps: 100, maxLoopIterations: 32 });
console.log(`Phase 3 (home screen): steps=${count(p3.steps)} termination=${p3.termination} lastPc=${hex(p3.lastPc)}`);

// Phase 4 — Event loop with key pressed and memory write tracing
console.log('\n--- Event loop with ENTER key pressed ---');

const eventPeripherals = createPeripheralBus({ timerInterrupt: true });

// Set ENTER key: group 6, bit 0 → keyMatrix[6] = 0xFE
// peripherals exposes keyboard state as .keyboard.keyMatrix
eventPeripherals.keyboard.keyMatrix[6] = 0xFE;
console.log(`Set keyMatrix[6] = 0x${hexByte(eventPeripherals.keyboard.keyMatrix[6])} (ENTER key: group 6, bit 0)`);

const eventExecutor = createExecutor(blocks, mem, { peripherals: eventPeripherals });
const ecpu = eventExecutor.cpu;

// Restore CPU state
ecpu.mbase = 0xD0;
ecpu._iy = 0xD00080;
ecpu.halted = false;
ecpu.iff1 = 1;
ecpu.iff2 = 1;
ecpu.sp = EVENT_RESET_SP;
mem.fill(0xFF, ecpu.sp, ecpu.sp + 12);

// Memory write tracking via Proxy
const memWrites = [];
const inside003C63 = { value: false };
const callCount003C63 = { value: 0 };
const blockHits = new Map();

// Snapshot watched memory before
const watchedBefore = {
  '0xD00080': mem[0xD00080],
  '0xD00587': mem[0xD00587],
  '0xD0058D': mem[0xD0058D],
};

console.log('\nWatched memory BEFORE event loop:');
for (const [addr, val] of Object.entries(watchedBefore)) {
  console.log(`  ${addr} = 0x${hexByte(val)}`);
}

// Run event loop, tracking block entries
const eventResult = eventExecutor.runFrom(EVENT_LOOP_ENTRY, MODE, {
  maxSteps: 200000,
  maxLoopIterations: 100000,
  onBlock(pc, mode, _meta, step) {
    const addr = pc & 0xFFFFFF;
    blockHits.set(addr, (blockHits.get(addr) ?? 0) + 1);

    if (addr === SCAN_START) {
      callCount003C63.value++;
      inside003C63.value = true;

      // Snapshot D00000-D00FFF region at entry
      if (callCount003C63.value <= 5) {
        const snapBefore = {};
        for (const watchAddr of [0xD00080, 0xD00587, 0xD0058D]) {
          snapBefore[hex(watchAddr)] = mem[watchAddr];
        }
        console.log(`\n  [call #${callCount003C63.value} to 0x003C63 at step ${count(step)}]`);
        console.log(`    D00080=0x${hexByte(mem[0xD00080])} D00587=0x${hexByte(mem[0xD00587])} D0058D=0x${hexByte(mem[0xD0058D])}`);
        console.log(`    A=0x${hexByte(ecpu.a)} F=0x${hexByte(ecpu.f)} BC=${hex(ecpu.bc)} DE=${hex(ecpu.de)} HL=${hex(ecpu.hl)}`);
      }
    }

    // Track when we leave the scan subroutine
    if (inside003C63.value && (addr < SCAN_START || addr > SCAN_END)) {
      // Check for memory changes after exiting
      if (callCount003C63.value <= 5) {
        console.log(`    [exited 0x003C63 -> ${hex(addr)} at step ${count(step)}]`);
        console.log(`    D00080=0x${hexByte(mem[0xD00080])} D00587=0x${hexByte(mem[0xD00587])} D0058D=0x${hexByte(mem[0xD0058D])}`);
      }
      inside003C63.value = false;
    }
  },
});

console.log(`\nEvent loop: steps=${count(eventResult.steps)} termination=${eventResult.termination} lastPc=${hex(eventResult.lastPc)}`);
console.log(`Calls to 0x003C63: ${count(callCount003C63.value)}`);

// Snapshot watched memory after
console.log('\nWatched memory AFTER event loop:');
console.log(`  0xD00080 = 0x${hexByte(mem[0xD00080])} (was 0x${hexByte(watchedBefore['0xD00080'])})`);
console.log(`  0xD00587 = 0x${hexByte(mem[0xD00587])} (was 0x${hexByte(watchedBefore['0xD00587'])})`);
console.log(`  0xD0058D = 0x${hexByte(mem[0xD0058D])} (was 0x${hexByte(watchedBefore['0xD0058D'])})`);

// Show bit 3 of (IY+0) = 0xD00080
const iy0val = mem[0xD00080];
console.log(`\n  (IY+0) = 0xD00080 = 0x${hexByte(iy0val)}, bit 3 = ${(iy0val >> 3) & 1}`);

// Dump all D005xx bytes that changed
console.log('\nD00500-D005FF region after trace:');
let changedCount = 0;
for (let a = 0xD00500; a < 0xD00600; a++) {
  if (mem[a] !== 0) {
    console.log(`  ${hex(a)} = 0x${hexByte(mem[a])}`);
    changedCount++;
  }
}
if (changedCount === 0) console.log('  (all zeros)');

// Show blocks in the scan region that were hit
console.log('\nBlock hits in 0x003C00-0x003D5F region:');
const scanRegionHits = [...blockHits.entries()]
  .filter(([addr]) => addr >= 0x003C00 && addr <= 0x003D5F)
  .sort(([a], [b]) => a - b);
for (const [addr, hits] of scanRegionHits) {
  console.log(`  ${hex(addr)} -> ${count(hits)} hits`);
}

console.log('\n=== ANALYSIS ===');
console.log('');
console.log('Key questions:');
console.log(`  1. Does 0x003C63 write to 0xD00587? ${scanCodeRefs.length > 0 ? 'YES (static)' : 'Check dynamic trace above'}`);
console.log(`  2. Does 0x003C63 set bit 3 of 0xD00080? Check IY-relative SET operations above`);
console.log(`  3. Bit 3 of (IY+0) after trace: ${(iy0val >> 3) & 1}`);
console.log('');
console.log('Done.');
