#!/usr/bin/env node

/**
 * Phase 337: Trace all callers of FillRect (0x09F008).
 *
 * TEST A — Static scan of ROM for CALL/JP/conditional-CALL instructions
 *          targeting 0x09F008, with 5-instruction context before each site.
 * TEST B — Dynamic trace during home-screen boot via CoorMon dispatch,
 *          capturing register/stack state on every FillRect entry.
 * TEST C — Dynamic trace during kernel init only (no CoorMon), capturing
 *          FillRect calls that happen before the event loop.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const ROM_SIZE = 0x400000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const COORMON_ENTRY = 0x08BF22;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0xFFFFFF;

const FILLRECT_ENTRY = 0x09F008;
const FILLRECT_INNER = 0x09EFDE;

const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;

const KBD_SCANCODE = 0xD00587;
const KBD_HANDOFF = 0xD0058E;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOPS = 10000;
const COORMON_MAX_STEPS = 100000;
const COORMON_MAX_LOOPS = 10000;

// ── Helpers ────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read16(buffer, addr) {
  const base = addr & 0xFFFFFF;
  return buffer[base] | (buffer[base + 1] << 8);
}

function read24(buffer, addr) {
  const base = addr & 0xFFFFFF;
  return buffer[base] | (buffer[base + 1] << 8) | (buffer[base + 2] << 16);
}

function write24(buffer, addr, value) {
  const base = addr & 0xFFFFFF;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function bytesAt(buffer, addr, length) {
  return [...buffer.slice(addr, addr + length)]
    .map((byte) => hexByte(byte))
    .join(' ');
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

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'ret': return `${prefix}ret`;
    case 'reti': return `${prefix}reti`;
    case 'retn': return `${prefix}retn`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': {
      const w = inst.mode === 'adl' || inst.modePrefix === 'sil' || inst.modePrefix === 'lil' ? 6 : 4;
      return `${prefix}ld ${inst.pair}, ${hex(inst.value, w)}`;
    }
    case 'ld-pair-mem': {
      const addr = inst.addr !== undefined ? hex(inst.addr) : '??';
      if (inst.direction === 'to-mem') return `${prefix}ld (${addr}), ${inst.pair}`;
      return `${prefix}ld ${inst.pair}, (${addr})`;
    }
    case 'ld-mem-pair': return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg': {
      if (['sub', 'and', 'xor', 'or', 'cp'].includes(inst.op)) return `${prefix}${inst.op} ${inst.src}`;
      return `${prefix}${inst.op} a, ${inst.src}`;
    }
    case 'alu-imm': {
      if (['sub', 'and', 'xor', 'or', 'cp'].includes(inst.op)) return `${prefix}${inst.op} ${hexByte(inst.value)}`;
      return `${prefix}${inst.op} a, ${hexByte(inst.value)}`;
    }
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'halt': return `${prefix}halt`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
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
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'rotate-reg': return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${prefix}${inst.op} (${inst.indirectRegister})`;
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function disassembleBackward(romBytes, decodeInstruction, targetPc, count) {
  // Try to disassemble `count` instructions ending just before targetPc.
  // Heuristic: start from targetPc - count*4 and decode forward, keeping
  // only instructions that end at or before targetPc.
  const startGuess = Math.max(0, targetPc - count * 6);
  const rows = [];
  let pc = startGuess;
  while (pc < targetPc) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !inst.length || inst.length < 1) break;
    rows.push({
      pc,
      length: inst.length,
      bytes: bytesAt(romBytes, pc, inst.length),
      text: formatInstruction(inst),
    });
    pc = inst.nextPc & 0xFFFFFF;
  }
  // Keep only the last `count` instructions
  return rows.slice(-count);
}

// ── Load ROM and modules ───────────────────────────────────────────

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing. Run: node scripts/transpile-ti84-rom.mjs');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 337: FillRect caller analysis');
console.log('====================================');
console.log(`FillRect entry:  ${hex(FILLRECT_ENTRY)}`);
console.log(`FillRect inner:  ${hex(FILLRECT_INNER)}`);

// ════════════════════════════════════════════════════════════════════
// TEST A — Static caller scan
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('TEST A: Static ROM scan for CALL/JP to 0x09F008');
console.log('════════════════════════════════════════════');

const targetLE = [
  (FILLRECT_ENTRY) & 0xFF,
  (FILLRECT_ENTRY >>> 8) & 0xFF,
  (FILLRECT_ENTRY >>> 16) & 0xFF,
];

// Opcodes that take a 3-byte immediate address in ADL mode
// CALL nn = 0xCD
// JP nn = 0xC3
// Conditional CALLs: 0xC4 (NZ), 0xCC (Z), 0xD4 (NC), 0xDC (C), 0xE4 (PO), 0xEC (PE), 0xF4 (P), 0xFC (M)
// Conditional JPs:   0xC2 (NZ), 0xCA (Z), 0xD2 (NC), 0xDA (C), 0xE2 (PO), 0xEA (PE), 0xF2 (P), 0xFA (M)
const callOpcodes = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
  [0xC4, 'CALL NZ,'], [0xCC, 'CALL Z,'], [0xD4, 'CALL NC,'], [0xDC, 'CALL C,'],
  [0xE4, 'CALL PO,'], [0xEC, 'CALL PE,'], [0xF4, 'CALL P,'], [0xFC, 'CALL M,'],
  [0xC2, 'JP NZ,'], [0xCA, 'JP Z,'], [0xD2, 'JP NC,'], [0xDA, 'JP C,'],
  [0xE2, 'JP PO,'], [0xEA, 'JP PE,'], [0xF2, 'JP P,'], [0xFA, 'JP M,'],
]);

const callerSites = [];

for (let addr = 0; addr < ROM_SIZE - 3; addr++) {
  const opcode = romBytes[addr];
  if (!callOpcodes.has(opcode)) continue;

  // Check if next 3 bytes match the target address (LE)
  if (
    romBytes[addr + 1] === targetLE[0] &&
    romBytes[addr + 2] === targetLE[1] &&
    romBytes[addr + 3] === targetLE[2]
  ) {
    callerSites.push({
      addr,
      opcode,
      type: callOpcodes.get(opcode),
    });
  }
}

console.log(`\nFound ${callerSites.length} static call/jp sites targeting ${hex(FILLRECT_ENTRY)}:\n`);

for (const site of callerSites) {
  console.log(`  ${hex(site.addr)}: ${site.type} ${hex(FILLRECT_ENTRY)}  [opcode ${hexByte(site.opcode)}]`);
  console.log(`    Raw bytes: ${bytesAt(romBytes, site.addr, 4)}`);

  // Decode 5 instructions before the call site
  const context = disassembleBackward(romBytes, decodeInstruction, site.addr, 5);
  if (context.length > 0) {
    console.log('    Context (5 instructions before):');
    for (const row of context) {
      console.log(`      ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
  }
  console.log('');
}

// Also scan for the inner loop address 0x09EFDE
console.log('  --- Also scanning for direct CALL/JP to inner loop 0x09EFDE ---');
const innerLE = [
  (FILLRECT_INNER) & 0xFF,
  (FILLRECT_INNER >>> 8) & 0xFF,
  (FILLRECT_INNER >>> 16) & 0xFF,
];

let innerCallCount = 0;
for (let addr = 0; addr < ROM_SIZE - 3; addr++) {
  const opcode = romBytes[addr];
  if (!callOpcodes.has(opcode)) continue;
  if (
    romBytes[addr + 1] === innerLE[0] &&
    romBytes[addr + 2] === innerLE[1] &&
    romBytes[addr + 3] === innerLE[2]
  ) {
    console.log(`  ${hex(addr)}: ${callOpcodes.get(opcode)} ${hex(FILLRECT_INNER)}`);
    innerCallCount++;
  }
}
if (innerCallCount === 0) {
  console.log('  No direct CALL/JP to 0x09EFDE found (reached only via fall-through from 0x09F008).');
}

// Also scan for callers of the setup block 0x09EFB7
const SETUP_PC = 0x09EFB7;
console.log('\n  --- Scanning for CALL/JP to setup block 0x09EFB7 ---');
const setupLE = [
  (SETUP_PC) & 0xFF,
  (SETUP_PC >>> 8) & 0xFF,
  (SETUP_PC >>> 16) & 0xFF,
];

let setupCallCount = 0;
for (let addr = 0; addr < ROM_SIZE - 3; addr++) {
  const opcode = romBytes[addr];
  if (!callOpcodes.has(opcode)) continue;
  if (
    romBytes[addr + 1] === setupLE[0] &&
    romBytes[addr + 2] === setupLE[1] &&
    romBytes[addr + 3] === setupLE[2]
  ) {
    console.log(`  ${hex(addr)}: ${callOpcodes.get(opcode)} ${hex(SETUP_PC)}`);
    const context = disassembleBackward(romBytes, decodeInstruction, addr, 3);
    for (const row of context) {
      console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    setupCallCount++;
  }
}
if (setupCallCount === 0) {
  console.log('  No direct CALL/JP to 0x09EFB7 found.');
}

// Scan for callers of the JP-table entry 0x02121C
console.log('\n  --- Scanning for CALL/JP to jump table entry 0x02121C ---');
const jtLE = [0x1C, 0x12, 0x02];
let jtCallCount = 0;
for (let addr = 0; addr < ROM_SIZE - 3; addr++) {
  const opcode = romBytes[addr];
  if (!callOpcodes.has(opcode)) continue;
  if (
    romBytes[addr + 1] === jtLE[0] &&
    romBytes[addr + 2] === jtLE[1] &&
    romBytes[addr + 3] === jtLE[2]
  ) {
    console.log(`  ${hex(addr)}: ${callOpcodes.get(opcode)} 0x02121C`);
    jtCallCount++;
  }
}
if (jtCallCount === 0) {
  console.log('  No direct CALL/JP to 0x02121C. It is likely a jump table entry reached via computed JP.');
}

// Decode the jump table region around 0x02121C
console.log('\n  --- Jump table region around 0x02121C ---');
const jtContext = disassembleBackward(romBytes, decodeInstruction, 0x02121C, 8);
for (const row of jtContext) {
  console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
}
// Also decode forward from the JP
let jtPc = 0x021220;
console.log('    --- (after the JP) ---');
for (let i = 0; i < 4; i++) {
  const inst = decodeInstruction(romBytes, jtPc, 'adl');
  if (!inst || !inst.length) break;
  console.log(`    ${hex(jtPc)}  ${bytesAt(romBytes, jtPc, inst.length).padEnd(20)}  ${formatInstruction(inst)}`);
  jtPc = inst.nextPc & 0xFFFFFF;
}

// ════════════════════════════════════════════════════════════════════
// TEST B — Dynamic trace during home-screen boot via CoorMon
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('TEST B: Dynamic trace — CoorMon dispatch with cxMain = HOME_HANDLER');
console.log('════════════════════════════════════════════');

{
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Boot
  console.log('  Phase 1: Boot from 0x000000');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  console.log(`    steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);

  // Phase 2: Kernel init
  console.log('  Phase 2: Kernel init from 0x08C331');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });
  console.log(`    steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);

  // Post-boot setup
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Install cxMain = HOME_HANDLER
  write24(mem, CXMAIN_PTR, HOME_HANDLER);

  // Set ENTER key pending
  const keyMatrix = peripherals.keyMatrix ?? peripherals.keyboard?.keyMatrix;
  if (keyMatrix) {
    keyMatrix.fill(0xFF);
    keyMatrix[6] = 0x02;
    mem[KBD_HANDOFF] = 0x09;
    mem[KBD_SCANCODE] = 0x09;
  }

  // Track FillRect calls — entry, setup, and inner
  const fillRectHits = [];
  let totalFillRectCalls = 0;
  let totalInnerHits = 0;
  let totalSetupHits = 0;
  let previousBlockPc = 0;
  const firstInnerPrevBlocks = []; // track what block comes before inner loop

  console.log(`\n  Running CoorMon from ${hex(COORMON_ENTRY)} (max ${COORMON_MAX_STEPS} steps)...`);

  const coormon = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: COORMON_MAX_STEPS,
    maxLoopIterations: COORMON_MAX_LOOPS,
    onBlock(blockPc) {
      if (blockPc === FILLRECT_ENTRY) {
        totalFillRectCalls++;

        // Dump registers and stack
        const spVal = cpu.sp & 0xFFFFFF;
        const stackBytes = [];
        for (let i = 0; i < 12; i++) {
          stackBytes.push(mem[(spVal + i) & 0xFFFFFF]);
        }

        const entry = {
          callNumber: totalFillRectCalls,
          a: cpu.a & 0xFF,
          bc: cpu._bc >>> 0,
          de: cpu._de >>> 0,
          hl: cpu._hl >>> 0,
          sp: spVal,
          stackTop12: stackBytes,
          // Decode stack words (return addr + params)
          retAddr: read24(mem, spVal),
          param1: read24(mem, spVal + 3),
          param2: read24(mem, spVal + 6),
          param3: read24(mem, spVal + 9),
        };

        fillRectHits.push(entry);
      }

      if (blockPc === 0x09EFB7) {
        totalSetupHits++;
        if (totalSetupHits <= 5) {
          const spVal = cpu.sp & 0xFFFFFF;
          console.log(`    Setup 0x09EFB7 hit #${totalSetupHits}: prevBlock=${hex(previousBlockPc)} A=${hexByte(cpu.a)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} SP=${hex(spVal)} retAddr=${hex(read24(mem, spVal))}`);
        }
      }

      if (blockPc === FILLRECT_INNER) {
        totalInnerHits++;
        if (firstInnerPrevBlocks.length < 10) {
          firstInnerPrevBlocks.push(previousBlockPc);
        }
        if (totalInnerHits <= 3) {
          const spVal = cpu.sp & 0xFFFFFF;
          console.log(`    Inner 0x09EFDE hit #${totalInnerHits}: prevBlock=${hex(previousBlockPc)} A=${hexByte(cpu.a)} B=${hexByte((cpu._bc >>> 8) & 0xFF)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} SP=${hex(spVal)}`);
        }
      }

      previousBlockPc = blockPc;
    },
  });

  console.log(`    CoorMon: steps=${coormon.steps} termination=${coormon.termination} lastPc=${hex(coormon.lastPc)}`);
  console.log(`\n  Total FillRect (0x09F008) entries: ${totalFillRectCalls}`);
  console.log(`  Total setup (0x09EFB7) entries: ${totalSetupHits}`);
  console.log(`  Total inner loop (0x09EFDE) entries: ${totalInnerHits}`);

  // Show unique previous blocks for inner loop
  const uniquePrevBlocks = [...new Set(firstInnerPrevBlocks)];
  console.log(`\n  Unique blocks preceding 0x09EFDE (first 10 hits): ${uniquePrevBlocks.map((pc) => hex(pc)).join(', ')}`);

  console.log(`\n  FillRect call details:`);
  for (const entry of fillRectHits) {
    console.log(`\n    Call #${entry.callNumber}:`);
    console.log(`      A=${hexByte(entry.a)}  BC=${hex(entry.bc)}  DE=${hex(entry.de)}  HL=${hex(entry.hl)}  SP=${hex(entry.sp)}`);
    console.log(`      Stack top 12 bytes: ${entry.stackTop12.map((b) => hexByte(b)).join(' ')}`);
    console.log(`      [SP+0] ret addr:  ${hex(entry.retAddr)}`);
    console.log(`      [SP+3] param 1:   ${hex(entry.param1)}`);
    console.log(`      [SP+6] param 2:   ${hex(entry.param2)}`);
    console.log(`      [SP+9] param 3:   ${hex(entry.param3)}`);

    // Try to decode color from DE (16-bit)
    const color16 = entry.de & 0xFFFF;
    console.log(`      Color (DE low 16): ${hex(color16, 4)}`);

    // Try to identify the caller by looking at the return address
    const retPc = entry.retAddr;
    if (retPc > 0 && retPc < ROM_SIZE) {
      // The call instruction is 4 bytes before the return address
      const callSite = retPc - 4;
      console.log(`      Likely call site:  ${hex(callSite)}`);
      console.log(`      Caller bytes:      ${bytesAt(romBytes, callSite, 8)}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// TEST C — Extended boot trace (kernel init only, no CoorMon)
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('TEST C: Dynamic trace — kernel init only (no CoorMon)');
console.log('════════════════════════════════════════════');

{
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Boot
  console.log('  Phase 1: Boot from 0x000000');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  console.log(`    steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);

  // Phase 2: Kernel init with FillRect tracking
  console.log('  Phase 2: Kernel init from 0x08C331 (tracking FillRect)');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const initFillRectHits = [];
  let initFillRectCount = 0;
  let initInnerCount = 0;

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
    onBlock(blockPc) {
      if (blockPc === FILLRECT_ENTRY) {
        initFillRectCount++;

        const spVal = cpu.sp & 0xFFFFFF;
        const stackBytes = [];
        for (let i = 0; i < 12; i++) {
          stackBytes.push(mem[(spVal + i) & 0xFFFFFF]);
        }

        initFillRectHits.push({
          callNumber: initFillRectCount,
          a: cpu.a & 0xFF,
          bc: cpu._bc >>> 0,
          de: cpu._de >>> 0,
          hl: cpu._hl >>> 0,
          sp: spVal,
          stackTop12: stackBytes,
          retAddr: read24(mem, spVal),
          param1: read24(mem, spVal + 3),
          param2: read24(mem, spVal + 6),
          param3: read24(mem, spVal + 9),
        });
      }

      if (blockPc === FILLRECT_INNER) {
        initInnerCount++;
      }
    },
  });

  console.log(`    steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);
  console.log(`\n  FillRect entries during kernel init: ${initFillRectCount}`);
  console.log(`  Inner loop entries during kernel init: ${initInnerCount}`);

  for (const entry of initFillRectHits) {
    console.log(`\n    Call #${entry.callNumber}:`);
    console.log(`      A=${hexByte(entry.a)}  BC=${hex(entry.bc)}  DE=${hex(entry.de)}  HL=${hex(entry.hl)}  SP=${hex(entry.sp)}`);
    console.log(`      Stack top 12 bytes: ${entry.stackTop12.map((b) => hexByte(b)).join(' ')}`);
    console.log(`      [SP+0] ret addr:  ${hex(entry.retAddr)}`);
    console.log(`      [SP+3] param 1:   ${hex(entry.param1)}`);
    console.log(`      [SP+6] param 2:   ${hex(entry.param2)}`);
    console.log(`      [SP+9] param 3:   ${hex(entry.param3)}`);

    const color16 = entry.de & 0xFFFF;
    console.log(`      Color (DE low 16): ${hex(color16, 4)}`);

    const retPc = entry.retAddr;
    if (retPc > 0 && retPc < ROM_SIZE) {
      const callSite = retPc - 4;
      console.log(`      Likely call site:  ${hex(callSite)}`);
      console.log(`      Caller bytes:      ${bytesAt(romBytes, callSite, 8)}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Summary');
console.log('════════════════════════════════════════════');
console.log(`Static call sites to ${hex(FILLRECT_ENTRY)}: ${callerSites.length}`);
for (const site of callerSites) {
  console.log(`  ${hex(site.addr)}: ${site.type}`);
}
console.log('\nPhase 337 complete.');
