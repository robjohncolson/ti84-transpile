#!/usr/bin/env node

/**
 * Phase 177: _GetCSC handler chain disassembly + trace probe
 *
 * 1. Static disassembly of 0x03D180-0x03D200
 * 2. Block presence check for all CALL/JP/JR targets
 * 3. Trace with MBASE=0xD0, ENTER key pressed
 * 4. Stack analysis
 * 5. Jump table verification at 0x020048
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const GETCSC_JUMP_TABLE = 0x020048;
const GETCSC_HANDLER = 0x03D184;
const DISASM_START = 0x03D180;
const DISASM_END = 0x03D200;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0xFFFFFF;

const MMIO_START = 0xE00800;
const MMIO_END = 0xE00FFF;

function hex(value, width = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatInstructionTag(instr) {
  const tag = instr.tag;

  switch (tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'slp': return 'SLP';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'ld-sp-hl': return 'LD SP, HL';

    case 'jp': return `JP ${hex(instr.target, 6)}`;
    case 'jp-conditional': return `JP ${instr.condition.toUpperCase()}, ${hex(instr.target, 6)}`;
    case 'jp-indirect': return `JP (${instr.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(instr.target, 6)}`;
    case 'jr-conditional': return `JR ${instr.condition.toUpperCase()}, ${hex(instr.target, 6)}`;
    case 'djnz': return `DJNZ ${hex(instr.target, 6)}`;
    case 'call': return `CALL ${hex(instr.target, 6)}`;
    case 'call-conditional': return `CALL ${instr.condition.toUpperCase()}, ${hex(instr.target, 6)}`;
    case 'rst': return `RST ${hex(instr.target, 2)}`;
    case 'ret-conditional': return `RET ${instr.condition.toUpperCase()}`;

    case 'ld-reg-imm': return `LD ${instr.dest.toUpperCase()}, ${hex(instr.value, 2)}`;
    case 'ld-reg-reg': return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${instr.dest.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${instr.dest.toUpperCase()}), ${instr.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL), ${hex(instr.value, 2)}`;
    case 'ld-pair-imm': return `LD ${instr.pair.toUpperCase()}, ${hex(instr.value, 6)}`;
    case 'ld-reg-mem': return `LD ${instr.dest.toUpperCase()}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-reg': return `LD (${hex(instr.addr, 6)}), ${instr.src.toUpperCase()}`;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') return `LD (${hex(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
      if (instr.direction === 'from-mem') return `LD ${instr.pair.toUpperCase()}, (${hex(instr.addr, 6)})`;
      return `LD ${instr.pair.toUpperCase()}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-pair': return `LD (${hex(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-pair-ind': return `LD ${instr.pair.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${instr.dest.toUpperCase()}), ${instr.pair.toUpperCase()}`;

    case 'inc-reg': return `INC ${instr.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${instr.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${instr.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${instr.pair.toUpperCase()}`;

    case 'alu-reg': return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
    case 'alu-imm': return `${instr.op.toUpperCase()} A, ${hex(instr.value, 2)}`;
    case 'add-pair': return `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${instr.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${instr.src.toUpperCase()}`;

    case 'push': return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop': return `POP ${instr.pair.toUpperCase()}`;

    case 'in0': return `IN0 ${instr.reg.toUpperCase()}, (${hex(instr.port, 2)})`;
    case 'out0': return `OUT0 (${hex(instr.port, 2)}), ${instr.reg.toUpperCase()}`;
    case 'in-reg': return `IN ${instr.reg.toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${instr.reg.toUpperCase()}`;
    case 'in-imm': return `IN A, (${hex(instr.port, 2)})`;
    case 'out-imm': return `OUT (${hex(instr.port, 2)}), A`;

    case 'bit-test': return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;

    case 'rotate-reg': return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
    case 'rotate-ind': return `${instr.op.toUpperCase()} (${instr.indirectRegister.toUpperCase()})`;

    case 'im': return `IM ${instr.value}`;
    case 'mlt': return `MLT ${instr.reg.toUpperCase()}`;
    case 'tst-reg': return `TST A, ${instr.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST A, (HL)';
    case 'tst-imm': return `TST A, ${hex(instr.value, 2)}`;
    case 'tstio': return `TSTIO ${hex(instr.value, 2)}`;

    case 'lea': {
      const sign = instr.displacement >= 0 ? '+' : '';
      return `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}${sign}${instr.displacement}`;
    }

    case 'ld-idx-imm': return `LD (${instr.indexReg.toUpperCase()}+${hex(instr.displacement & 0xFF, 2)}), ${hex(instr.value, 2)}`;
    case 'ld-idx-reg': return `LD (${instr.indexReg.toUpperCase()}+${hex(instr.displacement & 0xFF, 2)}), ${instr.src.toUpperCase()}`;
    case 'ld-reg-idx': return `LD ${instr.dest.toUpperCase()}, (${instr.indexReg.toUpperCase()}+${hex(instr.displacement & 0xFF, 2)})`;

    default: return `[${tag}]`;
  }
}

function hexBytes(romBytes, pc, length) {
  const bytes = [];
  for (let i = 0; i < length && i < 6; i++) {
    bytes.push((romBytes[pc + i] ?? 0).toString(16).padStart(2, '0'));
  }
  return bytes.join(' ').padEnd(18, ' ');
}

function isFlowTarget(instr) {
  return instr.target !== undefined && instr.tag !== 'rst';
}

function isBranchInstruction(tag) {
  return [
    'jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz',
    'call', 'call-conditional', 'rst',
  ].includes(tag);
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------

console.log('Phase 177: _GetCSC handler chain disassembly + trace');
console.log('====================================================');
console.log('');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS;

// -------------------------------------------------------
// Section 1: Static disassembly of 0x03D180-0x03D200
// -------------------------------------------------------

console.log('=== Section 1: Static disassembly 0x03D180 - 0x03D200 ===');
console.log('');

const branchTargets = new Set();
let pc = DISASM_START;

while (pc < DISASM_END) {
  let instr;
  try {
    instr = decodeInstruction(romBytes, pc, 'adl');
  } catch (err) {
    const byte = romBytes[pc] ?? 0;
    console.log(`  ${hex(pc, 6)}  ${hex(byte, 2).padEnd(18)} ??? (decode error: ${err.message})`);
    pc += 1;
    continue;
  }

  const bytes = hexBytes(romBytes, pc, instr.length);
  const mnemonic = formatInstructionTag(instr);
  const prefix = instr.modePrefix ? `[${instr.modePrefix}] ` : '';
  let flag = '';

  if (isBranchInstruction(instr.tag)) {
    flag = '  <-- BRANCH';
    if (instr.target !== undefined) {
      branchTargets.add(instr.target);
    }
  }

  console.log(`  ${hex(pc, 6)}  ${bytes} ${prefix}${mnemonic}${flag}`);
  pc = instr.nextPc;
}

console.log('');
console.log(`Branch targets found: ${[...branchTargets].map(t => hex(t, 6)).join(', ') || '(none)'}`);
console.log('');

// -------------------------------------------------------
// Section 2: Block presence check
// -------------------------------------------------------

console.log('=== Section 2: Block presence check ===');
console.log('');

for (const target of [...branchTargets].sort((a, b) => a - b)) {
  const adlKey = `${hex(target, 6)}_adl`;
  const z80Key = `${hex(target, 6)}_z80`;
  const hasAdl = blocks[adlKey] !== undefined;
  const hasZ80 = blocks[z80Key] !== undefined;

  // Also check plain numeric keys
  const hasNumeric = blocks[target] !== undefined;

  const status = [];
  if (hasAdl) status.push('adl=PRESENT');
  else status.push('adl=MISSING');
  if (hasZ80) status.push('z80=PRESENT');
  else status.push('z80=MISSING');
  if (hasNumeric) status.push('numeric=PRESENT');

  console.log(`  ${hex(target, 6)}: ${status.join(', ')}`);
}

// Also check the key format used in this codebase
console.log('');
console.log('Block key format check (sample keys from PRELIFTED_BLOCKS):');
const sampleKeys = Object.keys(blocks).slice(0, 10);
for (const key of sampleKeys) {
  console.log(`  key: "${key}"`);
}
console.log(`  Total blocks: ${Object.keys(blocks).length}`);
console.log('');

// -------------------------------------------------------
// Section 3: Trace with MBASE=0xD0
// -------------------------------------------------------

console.log('=== Section 3: Trace _GetCSC with MBASE=0xD0, ENTER key ===');
console.log('');

const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  trace: false,
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

// Boot first
const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});
console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

// Set MBASE=0xD0
cpu.mbase = 0xD0;

// Press ENTER key: keyMatrix[1] bit 0 = 0 means pressed
peripherals.keyboard.keyMatrix.fill(0xFF);
peripherals.keyboard.keyMatrix[1] = 0xFE;  // ENTER pressed (bit 0 clear)

// Seed keyboard MMIO
cpu.write8(0xE00811, 0xFE);  // keyMatrix[1] = 0xFE
cpu.write8(0xE00824, 0x01);  // ready flag
cpu.write8(0xE00900, 0x10);  // scan result

// Set keyboard IRQ
peripherals.write(0x5006, 0x08);  // INTC enable mask byte 2
peripherals.setKeyboardIRQ(true);

// Prepare CPU state
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.madl = 1;

// Stack setup with known sentinel
cpu.sp = STACK_TOP;
cpu.sp -= 3;
memory[cpu.sp] = RETURN_SENTINEL & 0xFF;
memory[cpu.sp + 1] = (RETURN_SENTINEL >> 8) & 0xFF;
memory[cpu.sp + 2] = (RETURN_SENTINEL >> 16) & 0xFF;

const spBefore = cpu.sp;
console.log(`SP before: ${hex(spBefore, 6)}`);
console.log(`Return sentinel at ${hex(spBefore, 6)}: ${hex(memory[spBefore], 2)} ${hex(memory[spBefore + 1], 2)} ${hex(memory[spBefore + 2], 2)}`);
console.log('');

// Tracing
const traceBlocks = [];
const mmioAccesses = [];
const ioAccesses = [];
let traceStep = -1;

const origRead8 = cpu.read8.bind(cpu);
cpu.read8 = (addr) => {
  const norm = Number(addr) & 0xFFFFFF;
  const value = origRead8(norm);
  if (norm >= MMIO_START && norm <= MMIO_END) {
    mmioAccesses.push({ step: traceStep, type: 'read', addr: norm, value });
    console.log(`  MMIO-R [step ${traceStep}] ${hex(norm, 6)} => ${hex(value, 2)}`);
  }
  return value;
};

const origWrite8 = cpu.write8.bind(cpu);
cpu.write8 = (addr, value) => {
  const norm = Number(addr) & 0xFFFFFF;
  if (norm >= MMIO_START && norm <= MMIO_END) {
    mmioAccesses.push({ step: traceStep, type: 'write', addr: norm, value: value & 0xFF });
    console.log(`  MMIO-W [step ${traceStep}] ${hex(norm, 6)} <= ${hex(value & 0xFF, 2)}`);
  }
  origWrite8(norm, value);
};

const origIoRead = cpu._ioRead.bind(cpu);
cpu._ioRead = (port) => {
  const p = Number(port) & 0xFFFF;
  const value = origIoRead(p) & 0xFF;
  ioAccesses.push({ step: traceStep, type: 'in', port: p, value });
  console.log(`  IO-IN  [step ${traceStep}] port ${hex(p, 4)} => ${hex(value, 2)}`);
  return value;
};

const origIoWrite = cpu._ioWrite.bind(cpu);
cpu._ioWrite = (port, value) => {
  const p = Number(port) & 0xFFFF;
  ioAccesses.push({ step: traceStep, type: 'out', port: p, value: value & 0xFF });
  console.log(`  IO-OUT [step ${traceStep}] port ${hex(p, 4)} <= ${hex(value & 0xFF, 2)}`);
  origIoWrite(p, value);
};

// Re-arm IRQ after boot may have cleared it
peripherals.write(0x5006, 0x08);
peripherals.setKeyboardIRQ(true);

console.log(`Running _GetCSC from jump table ${hex(GETCSC_JUMP_TABLE, 6)} ...`);
console.log('');

const result = executor.runFrom(GETCSC_JUMP_TABLE, 'adl', {
  maxSteps: 500,
  maxLoopIterations: 64,
  onBlock: (blockPc, mode, meta, step) => {
    traceStep = step;
    const dasm = meta?.instructions?.[0]?.dasm ?? '???';
    traceBlocks.push({ step, pc: blockPc, mode, dasm });
    console.log(`BLK [step ${String(step).padStart(3)}] ${hex(blockPc, 6)}:${mode} ${dasm}`);
  },
});

console.log('');
console.log('Trace summary:');
console.log(`  Result: A=${hex(cpu.a, 2)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);
console.log(`  Block chain: ${traceBlocks.map(b => hex(b.pc, 6)).join(' -> ') || '(none)'}`);
console.log(`  MMIO accesses: ${mmioAccesses.length}`);
console.log(`  I/O accesses: ${ioAccesses.length}`);

if (mmioAccesses.length > 0) {
  console.log('  MMIO detail:');
  for (const a of mmioAccesses) {
    console.log(`    ${a.type} ${hex(a.addr, 6)} = ${hex(a.value, 2)} (step ${a.step})`);
  }
}

if (ioAccesses.length > 0) {
  console.log('  I/O detail:');
  for (const a of ioAccesses) {
    console.log(`    ${a.type} port ${hex(a.port, 4)} = ${hex(a.value, 2)} (step ${a.step})`);
  }
}

// -------------------------------------------------------
// Section 4: Stack analysis
// -------------------------------------------------------

console.log('');
console.log('=== Section 4: Stack analysis ===');
console.log('');

const spAfter = cpu.sp;
console.log(`SP before: ${hex(spBefore, 6)}`);
console.log(`SP after:  ${hex(spAfter, 6)}`);
console.log(`SP delta:  ${spAfter - spBefore} bytes`);

// Show what's at current SP
console.log(`Stack at SP (${hex(spAfter, 6)}):`);
for (let i = 0; i < 12; i += 3) {
  const addr = spAfter + i;
  const val = memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
  console.log(`  ${hex(addr, 6)}: ${hex(val, 6)}`);
}

console.log(`Execution ended at: ${hex(result.lastPc, 6)}`);
console.log(`Termination reason: ${result.termination}`);

// -------------------------------------------------------
// Section 5: Jump table verification at 0x020048
// -------------------------------------------------------

console.log('');
console.log('=== Section 5: Jump table verification at 0x020048 ===');
console.log('');

// Disassemble a few instructions at the jump table entry
let jtPc = GETCSC_JUMP_TABLE;
for (let i = 0; i < 5 && jtPc < GETCSC_JUMP_TABLE + 0x20; i++) {
  let instr;
  try {
    instr = decodeInstruction(romBytes, jtPc, 'adl');
  } catch (err) {
    console.log(`  ${hex(jtPc, 6)}  ??? (decode error: ${err.message})`);
    jtPc += 1;
    continue;
  }
  const bytes = hexBytes(romBytes, jtPc, instr.length);
  const mnemonic = formatInstructionTag(instr);
  const prefix = instr.modePrefix ? `[${instr.modePrefix}] ` : '';
  console.log(`  ${hex(jtPc, 6)}  ${bytes} ${prefix}${mnemonic}`);

  if (instr.tag === 'jp' || instr.tag === 'call') {
    console.log(`    -> dispatches to ${hex(instr.target, 6)}`);
    if (instr.target === GETCSC_HANDLER) {
      console.log(`    CONFIRMED: jump table dispatches to _GetCSC handler at ${hex(GETCSC_HANDLER, 6)}`);
    } else {
      console.log(`    NOTE: target is ${hex(instr.target, 6)}, expected handler at ${hex(GETCSC_HANDLER, 6)}`);
    }
  }

  jtPc = instr.nextPc;
}

// Also show raw bytes at jump table
console.log('');
console.log('Raw bytes at jump table:');
const jtBytes = [];
for (let i = 0; i < 8; i++) {
  jtBytes.push(hex(romBytes[GETCSC_JUMP_TABLE + i], 2));
}
console.log(`  ${hex(GETCSC_JUMP_TABLE, 6)}: ${jtBytes.join(' ')}`);

console.log('');
console.log('Phase 177 complete.');
