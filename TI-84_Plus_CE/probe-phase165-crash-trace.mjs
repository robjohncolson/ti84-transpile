#!/usr/bin/env node
// Phase 165 — Trace backward from 0x58C35B crash to find what produces the garbage address.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CRASH_ADDR = 0x58C35B;
const CRASH_MASKED = CRASH_ADDR & 0x3FFFFF; // 0x18C35B
const WINDOW_SIZE = 20;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const STAGES = [
  { name: 'status_bar_bg',  entry: 0x0A2B72, maxSteps: 30000 },
  { name: 'status_dots',    entry: 0x0A3301, maxSteps: 30000 },
  { name: 'home_row_strip', entry: 0x0A29EC, maxSteps: 50000, seedModeBuffer: true },
  { name: 'history_area',   entry: 0x0A2854, maxSteps: 50000 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0').toUpperCase();
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

// Standard restoreCpu WITHOUT IX=SP fix (matches golden regression probe)
function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_BUF_TEXT.length; i++) {
    mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

// Format a decoded instruction into human-readable disassembly
function formatInstruction(decoded) {
  if (!decoded) return '???';

  switch (decoded.tag) {
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${decoded.condition}`;
    case 'reti':
      return 'reti';
    case 'retn':
      return 'retn';
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;
    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;
    case 'nop':
      return 'nop';
    case 'halt':
      return 'halt';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'ld-a-mem':
      return `ld a, (${hex(decoded.addr)})`;
    case 'ld-mem-a':
      return `ld (${hex(decoded.addr)}), a`;
    case 'out':
      return `out (${hex(decoded.port, 2)}), a`;
    case 'in':
      return `in a, (${hex(decoded.port, 2)})`;
    default:
      return decoded.tag;
  }
}

function safeDecode(pc, mode) {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

// Disassemble all instructions in a block starting at blockPc
function disassembleBlock(blockPc, mode) {
  const instructions = [];
  let pc = blockPc;
  // Decode up to 20 instructions (blocks are typically short)
  for (let i = 0; i < 20; i++) {
    if (pc > 0x3FFFFF) break; // out of ROM
    const inst = safeDecode(pc, mode);
    if (!inst) break;
    instructions.push(inst);
    // Stop after a terminating instruction
    if (['ret', 'ret-conditional', 'reti', 'retn', 'jp', 'jp-indirect', 'halt'].includes(inst.tag)) {
      break;
    }
    pc = inst.nextPc;
  }
  return instructions;
}

// Read 3 bytes from memory as a 24-bit little-endian value
function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

async function main() {
  console.log('=== Phase 165 — 0x58C35B Crash Site Investigation ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot + OS init
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  // Save state
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // Check if 0x18C35B (masked) is a real block
  const maskedKey = CRASH_MASKED.toString(16).padStart(6, '0') + ':adl';
  const maskedKeyZ80 = CRASH_MASKED.toString(16).padStart(6, '0') + ':z80';
  const maskedIsBlock = !!(BLOCKS[maskedKey] || BLOCKS[maskedKeyZ80]);
  console.log(`\nCheck: ${hex(CRASH_MASKED)} (${hex(CRASH_ADDR)} & 0x3FFFFF) in PRELIFTED_BLOCKS? ${maskedIsBlock ? 'YES' : 'NO'}`);
  console.log(`  Key "${maskedKey}": ${BLOCKS[maskedKey] ? 'exists' : 'missing'}`);
  console.log(`  Key "${maskedKeyZ80}": ${BLOCKS[maskedKeyZ80] ? 'exists' : 'missing'}\n`);

  const stageResults = [];

  for (const stage of STAGES) {
    console.log(`\n=== Stage: ${stage.name} ===`);

    // Restore full RAM + CPU
    mem.set(ramSnap, 0x400000);
    clearVram(mem);
    if (stage.seedModeBuffer) {
      seedModeBuffer(mem);
    }
    restoreCpu(cpu, cpuSnap, mem);

    // Rolling window of last N blocks visited
    const window = [];

    const result = executor.runFrom(stage.entry, 'adl', {
      maxSteps: stage.maxSteps,
      maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, steps) {
        const entry = {
          step: steps,
          pc: pc & 0xFFFFFF,
          mode,
          sp: cpu.sp & 0xFFFFFF,
          ix: cpu._ix & 0xFFFFFF,
          hl: cpu._hl & 0xFFFFFF,
          a: cpu.a,
          f: cpu.f,
        };
        window.push(entry);
        if (window.length > WINDOW_SIZE) {
          window.shift();
        }
      },
    });

    console.log(`Terminated at: ${hex(result.lastPc)} (${result.termination})`);
    console.log(`Steps: ${result.steps}`);
    console.log(`SP at exit: ${hex(cpu.sp)} IX at exit: ${hex(cpu._ix)} HL at exit: ${hex(cpu._hl)}`);

    // Dump the rolling window
    console.log(`\nLast ${window.length} blocks visited:`);
    for (let i = 0; i < window.length; i++) {
      const w = window[i];
      const marker = (i === window.length - 1) ? ` -> ${result.termination} ${hex(result.lastPc)}` : '';
      console.log(`  Step ${String(w.step).padStart(5)}: PC=${hex(w.pc)} SP=${hex(w.sp)} IX=${hex(w.ix)} HL=${hex(w.hl)} A=${hex(w.a, 2)} F=${hex(w.f, 2)}${marker}`);
    }

    // Disassemble the last 5 blocks
    const lastN = Math.min(5, window.length);
    console.log(`\nDisassembly of last ${lastN} blocks:`);
    for (let i = window.length - lastN; i < window.length; i++) {
      const w = window[i];
      console.log(`\n  Block ${hex(w.pc)} (step ${w.step}, SP=${hex(w.sp)}, IX=${hex(w.ix)}, HL=${hex(w.hl)}):`);
      const instructions = disassembleBlock(w.pc, w.mode);
      if (instructions.length === 0) {
        console.log(`    (could not decode)`);
      }
      for (const inst of instructions) {
        const text = formatInstruction(inst);
        // Flag suspicious instructions
        let annotation = '';
        if (inst.tag === 'ret' || inst.tag === 'ret-conditional' || inst.tag === 'reti' || inst.tag === 'retn') {
          annotation = '  ; <-- RET pops from SP';
        }
        if (inst.tag === 'jp-indirect') {
          annotation = `  ; <-- JP (${inst.indirectRegister})`;
        }
        if (inst.tag === 'ld-sp-pair') {
          annotation = `  ; <-- SP = ${inst.pair} (corruption source?)`;
        }
        if (inst.tag === 'ld-sp-hl') {
          annotation = '  ; <-- SP = HL (corruption source?)';
        }
        if (inst.tag === 'pop' && inst.pair === 'ix') {
          annotation = '  ; <-- POP IX from stack';
        }
        console.log(`    ${hex(inst.pc)}: ${text}${annotation}`);
      }
    }

    // Analyze: what's on the stack at the last block?
    const lastBlock = window[window.length - 1];
    if (lastBlock) {
      const sp = lastBlock.sp;
      console.log(`\n  Stack dump at last block (SP=${hex(sp)}):`);
      for (let offset = 0; offset < 24; offset += 3) {
        const addr = sp + offset;
        if (addr >= 0 && addr + 2 < MEM_SIZE) {
          const val = read24(mem, addr);
          const annotation = (val === CRASH_ADDR) ? ' <-- CRASH ADDRESS' : '';
          console.log(`    [SP+${offset.toString().padStart(2)}] = ${hex(val)}${annotation}`);
        }
      }
    }

    // Root cause analysis
    console.log('\n  --- Root Cause Analysis ---');
    if (window.length >= 2) {
      const secondToLast = window[window.length - 2];
      const last = window[window.length - 1];
      const lastInstructions = disassembleBlock(last.pc, last.mode);
      const lastInst = lastInstructions[lastInstructions.length - 1];

      if (lastInst) {
        if (lastInst.tag === 'ret' || lastInst.tag === 'reti' || lastInst.tag === 'retn') {
          console.log(`  Last instruction was ${formatInstruction(lastInst)} at ${hex(lastInst.pc)}`);
          console.log(`  SP at entry of last block: ${hex(last.sp)}`);
          const retAddr = read24(mem, last.sp);
          console.log(`  Value at [SP]: ${hex(retAddr)}`);
          if (retAddr === CRASH_ADDR) {
            console.log(`  --> RET popped garbage address ${hex(CRASH_ADDR)} from stack`);
          }
          // Check if SP points into ROM space (corruption indicator)
          if (last.sp < 0x400000) {
            console.log(`  WARNING: SP (${hex(last.sp)}) points into ROM space!`);
          }
        } else if (lastInst.tag === 'jp-indirect') {
          console.log(`  Last instruction was JP (${lastInst.indirectRegister}) at ${hex(lastInst.pc)}`);
          console.log(`  HL at last block: ${hex(last.hl)}`);
          if (last.hl === CRASH_ADDR) {
            console.log(`  --> JP (HL) with HL=${hex(CRASH_ADDR)} (garbage)`);
          }
        } else if (lastInst.tag === 'jp' || lastInst.tag === 'call') {
          console.log(`  Last instruction was ${formatInstruction(lastInst)} at ${hex(lastInst.pc)}`);
          if (lastInst.target === CRASH_ADDR) {
            console.log(`  --> Direct jump/call to ${hex(CRASH_ADDR)} (encoded in ROM)`);
          }
        } else {
          console.log(`  Last instruction: ${formatInstruction(lastInst)} at ${hex(lastInst.pc)}`);
          console.log(`  Block returned ${hex(result.lastPc)} to executor`);
        }
      }

      // Check if IX→SP corruption happened (Phase 159 mechanism)
      let spCorruptionStep = null;
      for (let i = 1; i < window.length; i++) {
        const prev = window[i - 1];
        const cur = window[i];
        // SP changed dramatically
        if (Math.abs(cur.sp - prev.sp) > 0x1000) {
          spCorruptionStep = { step: cur.step, prevSp: prev.sp, newSp: cur.sp, pc: cur.pc, ix: cur.ix };
        }
        // Check if SP = IX and IX is in a weird range
        if (cur.sp === cur.ix && cur.ix < 0x400000) {
          console.log(`  Step ${cur.step}: SP=IX=${hex(cur.sp)} — IX→SP corruption detected`);
        }
      }
      if (spCorruptionStep) {
        console.log(`  SP corruption at step ${spCorruptionStep.step}: SP went from ${hex(spCorruptionStep.prevSp)} to ${hex(spCorruptionStep.newSp)} at PC=${hex(spCorruptionStep.pc)} IX=${hex(spCorruptionStep.ix)}`);
      }
    }

    stageResults.push({
      name: stage.name,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
      window,
    });
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');
  const allCrashAt58C35B = stageResults.every((s) => s.lastPc === CRASH_ADDR);
  console.log(`All 4 stages crash at ${hex(CRASH_ADDR)}: ${allCrashAt58C35B ? 'YES' : 'NO'}`);
  for (const s of stageResults) {
    console.log(`  ${s.name}: steps=${s.steps} term=${s.termination} lastPc=${hex(s.lastPc)}`);
  }
  console.log(`\n${hex(CRASH_MASKED)} in PRELIFTED_BLOCKS: ${maskedIsBlock ? 'YES' : 'NO'}`);

  // Check mechanism consistency
  const mechanisms = [];
  for (const s of stageResults) {
    if (s.window.length === 0) {
      mechanisms.push('no-blocks');
      continue;
    }
    const last = s.window[s.window.length - 1];
    const insts = disassembleBlock(last.pc, last.mode);
    const lastInst = insts[insts.length - 1];
    if (lastInst) {
      mechanisms.push(`${lastInst.tag} at ${hex(lastInst.pc)}`);
    } else {
      mechanisms.push('unknown');
    }
  }
  console.log('\nCrash mechanisms:');
  for (let i = 0; i < stageResults.length; i++) {
    console.log(`  ${stageResults[i].name}: ${mechanisms[i]}`);
  }

  const allSameMechanism = mechanisms.every((m) => m === mechanisms[0]);
  console.log(`\nAll stages crash via same mechanism: ${allSameMechanism ? 'YES' : 'NO'}`);
  if (allSameMechanism) {
    console.log(`Mechanism: ${mechanisms[0]}`);
  }
}

try {
  await main();
} catch (error) {
  console.error('FATAL ERROR:', error.stack || error);
  process.exitCode = 1;
}
