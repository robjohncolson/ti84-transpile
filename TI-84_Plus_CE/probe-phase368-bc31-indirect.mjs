#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;

const STACK_RESET_TOP = 0xD1A87E;
const PART1_START = 0x00BC20;
const PART1_END_EXCLUSIVE = 0x00BC31;
const TARGET_BC31 = 0x00BC31;
const TARGET_BC47 = 0x00BC47;

function hex(v, w = 6) {
  return v == null ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function upper(v) {
  return String(v).toUpperCase();
}

function formatDisp(value) {
  const abs = hexByte(Math.abs(value ?? 0));
  return `${value >= 0 ? '+' : '-'}${abs}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function formatPea(base, displacement) {
  return `${upper(base)}${formatDisp(displacement)}`;
}

function bytesAt(start, length) {
  const end = Math.min(romBytes.length, start + Math.max(length, 0));
  return Array.from(
    romBytes.subarray(start, end),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatFieldValue(value) {
  if (typeof value === 'number') {
    return value > 0xFF ? hex(value) : hexByte(value);
  }
  return String(value);
}

function formatInstruction(inst) {
  if (!inst) return 'DB ??';

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'halt': return withModePrefix(inst, 'HALT');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'ret-conditional': return withModePrefix(inst, `RET ${upper(inst.condition)}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withModePrefix(inst, `JP ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'jp-indirect': return withModePrefix(inst, `JP (${upper(inst.indirectRegister)})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withModePrefix(inst, `JR ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'djnz': return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return withModePrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop': return withModePrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm': return withModePrefix(inst, `LD ${upper(inst.pair)}, ${hex(inst.value)}`);
    case 'ld-sp-hl': return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withModePrefix(inst, `LD SP, ${upper(inst.pair)}`);
    case 'ld-reg-reg': return withModePrefix(inst, `LD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'ld-reg-imm': return withModePrefix(inst, `LD ${upper(inst.dest)}, ${hexByte(inst.value)}`);
    case 'ld-reg-mem': return withModePrefix(inst, `LD ${upper(inst.dest)}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${upper(inst.src)}`);
    case 'ld-pair-mem':
      return withModePrefix(
        inst,
        inst.direction === 'to-mem'
          ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
          : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`,
      );
    case 'ld-mem-pair': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${upper(inst.pair)}`);
    case 'ld-reg-ind': return withModePrefix(inst, `LD ${upper(inst.dest)}, (${upper(inst.src)})`);
    case 'ld-ind-reg': return withModePrefix(inst, `LD (${upper(inst.dest)}), ${upper(inst.src)}`);
    case 'ld-pair-indexed':
      return withModePrefix(inst, `LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withModePrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`);
    case 'ld-reg-ixd':
      return withModePrefix(inst, `LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withModePrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${upper(inst.src)}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'alu-imm': return withModePrefix(inst, `${upper(inst.op)} ${hexByte(inst.value)}`);
    case 'alu-reg': return withModePrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${upper(inst.reg)}`);
    case 'rotate-reg': return withModePrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'rotate-ind': return withModePrefix(inst, `${upper(inst.op)} (${upper(inst.indirectRegister)})`);
    case 'indexed-cb-rotate':
      return withModePrefix(inst, `${upper(inst.operation)} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'out-reg': return withModePrefix(inst, `OUT (BC), ${upper(inst.reg)}`);
    case 'in-reg': return withModePrefix(inst, `IN ${upper(inst.reg)}, (BC)`);
    case 'out-imm': return withModePrefix(inst, `OUT (${hexByte(inst.port)}), A`);
    case 'in-imm': return withModePrefix(inst, `IN A, (${hexByte(inst.port)})`);
    case 'out0': return withModePrefix(inst, `OUT0 (${hexByte(inst.port)}), ${upper(inst.reg)}`);
    case 'in0': return withModePrefix(inst, `IN0 ${upper(inst.reg)}, (${hexByte(inst.port)})`);
    case 'pea': return withModePrefix(inst, `PEA ${formatPea(inst.base, inst.displacement)}`);
    case 'ex-de-hl': return withModePrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withModePrefix(inst, 'EX (SP), HL');
    case 'ex-af': return withModePrefix(inst, "EX AF, AF'");
    case 'exx': return withModePrefix(inst, 'EXX');
    default: {
      const extras = Object.entries(inst)
        .filter(([key, value]) => (
          !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates', 'tag'].includes(key) &&
          value !== undefined &&
          value !== null
        ))
        .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
        .join(' ');
      return withModePrefix(inst, extras ? `${upper(inst.tag)} ${extras}` : upper(inst.tag));
    }
  }
}

function decodeAt(pc) {
  if (pc < 0 || pc >= romBytes.length) return null;
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !inst.length) return null;
    return inst;
  } catch {
    return null;
  }
}

function disassembleRange(startPc, endExclusive) {
  const rows = [];
  let pc = startPc;

  while (pc < endExclusive) {
    const inst = decodeAt(pc);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      inst,
      length,
      bytes: bytesAt(pc, length),
      text: inst ? formatInstruction(inst) : `DB ${hexByte(romBytes[pc])}`,
    });
    pc += length;
  }

  return rows;
}

function scanLittleEndian24(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const hits = [];

  for (let i = 0; i <= romBytes.length - 3; i++) {
    if (romBytes[i] === b0 && romBytes[i + 1] === b1 && romBytes[i + 2] === b2) {
      hits.push(i);
    }
  }

  return hits;
}

function printHitList(label, target, hits) {
  const bytes = [
    (target & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
    ((target >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
    ((target >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ].join(' ');

  console.log(`${label} ${hex(target)} (LE bytes ${bytes})`);
  console.log(`  Hits: ${hits.length}`);
  if (hits.length === 0) {
    console.log('  Locations: none');
    return;
  }
  for (const offset of hits) {
    console.log(`  ${hex(offset)}`);
  }
}

function summarizeRun(label, result) {
  console.log(`${label}: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  if (result.loopsForced > 0) {
    console.log(`  loopsForced=${result.loopsForced}`);
  }
  if (result.error) {
    console.log(`  error: ${result.error.message || result.error}`);
  }
  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`  missing blocks: ${result.missingBlocks.slice(0, 10).join(', ')}`);
  }
}

function resetPhaseStack() {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 368: Trace 0x00BC31 Indirect Caller ===\n');

console.log('--- Part 1: Static disassembly of 0x00BC20-0x00BC30 ---');
console.log(`Raw bytes ${hex(PART1_START)}-${hex(PART1_END_EXCLUSIVE - 1)}: ${bytesAt(PART1_START, PART1_END_EXCLUSIVE - PART1_START)}`);
const part1Rows = disassembleRange(PART1_START, PART1_END_EXCLUSIVE);
for (const row of part1Rows) {
  console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)} ${row.text}`);
}
const lastPreBC31 = part1Rows.filter((row) => row.pc < TARGET_BC31).at(-1) ?? null;
if (lastPreBC31?.inst) {
  const endsAt = lastPreBC31.pc + lastPreBC31.length;
  if (lastPreBC31.inst.terminates && endsAt === TARGET_BC31) {
    console.log(`Reachability note: ${hex(lastPreBC31.pc)} ends at ${hex(TARGET_BC31)} but is a terminating branch (${lastPreBC31.text}), so 0x00BC31 is not a fallthrough target from this window.`);
  } else if (!lastPreBC31.inst.terminates && endsAt === TARGET_BC31) {
    console.log(`Reachability note: ${hex(TARGET_BC31)} is the fallthrough after ${hex(lastPreBC31.pc)} (${lastPreBC31.text}).`);
  } else {
    console.log(`Reachability note: last decoded instruction before 0x00BC31 is ${hex(lastPreBC31.pc)} (${lastPreBC31.text}), nextPc=${hex(endsAt)}.`);
  }
}

console.log('\n--- Part 2: Jump table / literal scan ---');
printHitList('Target', TARGET_BC31, scanLittleEndian24(TARGET_BC31));
printHitList('Target', TARGET_BC47, scanLittleEndian24(TARGET_BC47));

console.log('\n--- Part 3: Dynamic trace before first entry to 0x00BC31 ---');
console.log('(Session 363 showed BC31 is reached at ~step 2685 during Z80 cold boot)\n');

const blockHistory = [];
let foundBC31 = false;

// Phase 1: Z80 cold boot — this is where BC31 gets reached (~step 2685 per session 363)
// Use high maxLoopIterations to avoid premature termination
const phase1 = executor.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 50000,
  onBlock: (pc, mode, _meta, step) => {
    if (pc === TARGET_BC31 && !foundBC31) {
      foundBC31 = true;
      console.log('*** First entry to 0x00BC31 during Phase 1 (Z80 cold boot) ***');
      console.log(`  Step: ${step}`);
      console.log(`  Entry block: ${hex(pc)}:${mode}`);
      console.log(`  Prior 10 blocks: ${blockHistory.length > 0 ? blockHistory.join(' -> ') : '(none)'}`);
      console.log(`  CPU: SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
      console.log(`  A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} MBASE=0x${cpu.mbase.toString(16).padStart(2,'0')} MADL=${cpu.madl}`);
      console.log(`  HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);

      // Read stack contents
      const sp = cpu.sp & 0xFFFFFF;
      if (sp < 0x1000000 - 6) {
        const ret1 = mem[sp] | (mem[sp+1] << 8) | (mem[sp+2] << 16);
        const ret2 = mem[sp+3] | (mem[sp+4] << 8) | (mem[sp+5] << 16);
        console.log(`  Stack: [SP]=${hex(ret1)} [SP+3]=${hex(ret2)}`);
      }

      // Read IX-relative memory that the loop will use
      const ix = cpu._ix & 0xFFFFFF;
      if (ix >= 30 && ix < 0x1000000) {
        const ixM30 = mem[ix-30] | (mem[ix-29] << 8) | (mem[ix-28] << 16);
        const ixM9  = mem[ix-9]  | (mem[ix-8]  << 8) | (mem[ix-7]  << 16);
        const ixM3  = mem[ix-3]  | (mem[ix-2]  << 8) | (mem[ix-1]  << 16);
        console.log(`  (IX-30)=${hex(ixM30)} (IX-9)=${hex(ixM9)} (IX-3)=${hex(ixM3)}`);
      }
    }

    // Also log when we hit BC47 (the LD IX,(IX-30) instruction)
    if (pc === TARGET_BC47 && foundBC31) {
      const ix = cpu._ix & 0xFFFFFF;
      if (ix >= 30 && ix < 0x1000000) {
        const ixM30 = mem[ix-30] | (mem[ix-29] << 8) | (mem[ix-28] << 16);
        console.log(`  >> Block 0x00BC47 entered: IX=${hex(ix)} (IX-30)=${hex(ixM30)}`);
      }
    }

    blockHistory.push(`${hex(pc)}:${mode}`);
    if (blockHistory.length > 12) blockHistory.shift();
  },
});
summarizeRun('Phase 1 (Z80 cold boot)', phase1);

if (!foundBC31) {
  console.log(`0x00BC31 was NOT reached during Phase 1.`);
  console.log(`Tail history: ${blockHistory.length > 0 ? blockHistory.join(' -> ') : '(empty)'}`);

  // Try Phase 2 with onBlock as fallback
  resetPhaseStack();

  const blockHistory2 = [];
  const phase2 = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
    onBlock: (pc, mode, _meta, step) => {
      if (pc === TARGET_BC31 && !foundBC31) {
        foundBC31 = true;
        console.log('*** First entry to 0x00BC31 during Phase 2 (ADL kernel init) ***');
        console.log(`  Step: ${step}`);
        console.log(`  Prior 10 blocks: ${blockHistory2.length > 0 ? blockHistory2.join(' -> ') : '(none)'}`);
        console.log(`  CPU: SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
        console.log(`  A=${hexByte(cpu.a)} F=${hexByte(cpu.f)}`);
        console.log(`  HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);
      }
      blockHistory2.push(`${hex(pc)}:${mode}`);
      if (blockHistory2.length > 12) blockHistory2.shift();
    },
  });
  summarizeRun('Phase 2 (ADL kernel init)', phase2);
  if (!foundBC31) {
    console.log(`0x00BC31 was NOT reached during Phase 2 either.`);
    console.log(`Tail: ${blockHistory2.join(' -> ')}`);
  }
}

// Disassemble the predecessor block if we found BC31
if (foundBC31 && blockHistory.length >= 2) {
  console.log('\n--- Predecessor block disassembly ---');
  // The entry just before 0xBC31 in the history
  const entries = blockHistory.filter(e => !e.startsWith(hex(TARGET_BC31)));
  const lastPred = entries.at(-1);
  if (lastPred) {
    const predPc = parseInt(lastPred.split(':')[0].replace('0x',''), 16);
    const predMode = lastPred.split(':')[1];
    console.log(`Predecessor: ${lastPred}`);
    const predRows = disassembleRange(predPc, Math.min(predPc + 40, 0x400000));
    for (const row of predRows) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)} ${row.text}`);
      // Stop after a terminating instruction
      if (row.inst?.terminates) break;
    }
  }
}

// Also disassemble 0xBC31 onward for reference
console.log('\n--- Disassembly of 0x00BC31 onward (the byte-copy loop) ---');
const bc31Rows = disassembleRange(0x00BC31, 0x00BC80);
for (const row of bc31Rows) {
  console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)} ${row.text}`);
}

console.log('\nDone.');
