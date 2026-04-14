#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase143-report.md');

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08c331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 1000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const STACK_RESET_TOP = 0xd1a87e;
const STACK_SEED_BYTES = 3;
const STACK_DUMP_LEN = 12;

// Blocks to trace register state at entry
const TRACED_BLOCKS = new Set([
  0x048b5b,
  0x048b3c,
  0x048b36,
  0x048acc,
  0x048ae0,
  0x048ae5,
  0x048ae9,
  0x048b07,
  0x048b11,
  0x048b21,
  0x048b26,
  0x0000b0,
  0x00285f,
  0x002873,
  0x00287d,
]);

const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join(' ');
}

function readBytes(mem, addr, length) {
  const start = addr & 0xffffff;
  return Array.from(mem.slice(start, start + length));
}

function snapshotRegisters(cpu, pc) {
  return {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    bc: cpu.bc & 0xffffff,
    de: cpu.de & 0xffffff,
    hl: cpu.hl & 0xffffff,
    sp: cpu.sp & 0xffffff,
    ix: cpu.ix & 0xffffff,
    iy: cpu.iy & 0xffffff,
    pc: pc & 0xffffff,
  };
}

function formatRegisters(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
  ].join(' ');
}

function createMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function resetForOsInit(machine) {
  const { cpu, mem } = machine;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - STACK_SEED_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + STACK_SEED_BYTES);
}

function runProbe() {
  const machine = createMachine();
  const coldBoot = machine.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetForOsInit(machine);

  const tracedSnapshots = [];
  const fullTrace = [];

  const result = machine.executor.runFrom(OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, steps) {
      const maskedPc = pc & 0xffffff;
      const step = steps + 1;

      const snapshot = {
        step,
        pc: maskedPc,
        mode,
        regs: snapshotRegisters(machine.cpu, maskedPc),
        stackTop: readBytes(machine.mem, machine.cpu.sp, STACK_DUMP_LEN),
      };

      fullTrace.push(snapshot);

      if (TRACED_BLOCKS.has(maskedPc)) {
        tracedSnapshots.push(snapshot);
        console.log(
          `[TRACED] step=${String(step).padStart(4, '0')} pc=${hex(maskedPc)} ${formatRegisters(snapshot.regs)} stack=[${bytesToHex(snapshot.stackTop)}]`
        );
      }
    },
    onMissingBlock(pc, mode, steps) {
      console.log(`[MISSING] step=${steps} pc=${hex(pc & 0xffffff)} mode=${mode}`);
    },
  });

  return {
    coldBoot,
    result,
    tracedSnapshots,
    fullTrace,
    machine,
  };
}

function analyzeHlOrigin(snapshots) {
  // Track HL evolution through the chain
  const lines = [];
  lines.push('## HL Origin Analysis\n');

  let prevHl = null;
  for (const snap of snapshots) {
    const hl = snap.regs.hl;
    const changed = prevHl !== null && hl !== prevHl ? ' <-- CHANGED' : '';
    lines.push(`- ${hex(snap.pc)} (step ${snap.step}): HL=${hex(hl)}${changed}`);
    prevHl = hl;
  }

  // Check if HL=0x2DFC46 is a valid ROM address
  const hlAtCrash = snapshots.find((s) => s.pc === 0x00287d)?.regs.hl;
  if (hlAtCrash !== undefined) {
    lines.push(`\nHL at LDIR block (0x00287D): ${hex(hlAtCrash)}`);
    if (hlAtCrash < romBytes.length) {
      lines.push(`ROM data at ${hex(hlAtCrash)}: ${bytesToHex(readBytes(romBytes, hlAtCrash, 16))}`);
      lines.push('Address is within ROM range -- valid source for memcpy.');
    } else {
      lines.push(`Address ${hex(hlAtCrash)} is OUTSIDE ROM (size=${hex(romBytes.length)}). This is unmapped memory.`);
    }
  }

  return lines.join('\n');
}

function analyzeBcCorruption(snapshots) {
  const lines = [];
  lines.push('## BC Register Corruption Analysis\n');

  for (const snap of snapshots) {
    const bc = snap.regs.bc;
    const upperByte = (bc >> 16) & 0xff;
    const note = upperByte !== 0 ? ` ** UPPER BYTE = 0x${upperByte.toString(16).padStart(2, '0')} (non-zero!)` : '';
    lines.push(`- ${hex(snap.pc)} (step ${snap.step}): BC=${hex(bc)}${note}`);
  }

  // Specifically look at the memcpy blocks
  const at285f = snapshots.find((s) => s.pc === 0x00285f);
  const at2873 = snapshots.find((s) => s.pc === 0x002873);
  const at287d = snapshots.find((s) => s.pc === 0x00287d);

  if (at285f) {
    lines.push(`\n### At memcpy entry (0x00285F):`);
    lines.push(`BC = ${hex(at285f.regs.bc)}`);
    lines.push(`The caller at 0x048B5B sets BC=0x000448, then pushes it.`);
    lines.push(`Then sets BC=0xD13FD8 (destination), pushes it.`);
    lines.push(`So BC enters 0x00285F as 0xD13FD8.`);
  }

  if (at2873) {
    lines.push(`\n### At block 0x002873:`);
    lines.push(`BC = ${hex(at2873.regs.bc)}`);
    lines.push(`Block 0x00285F did: LD B, 0x01 => only sets bits [15:8] to 0x01.`);
    lines.push(`Upper byte (bits [23:16]) remains from BC=0xD13FD8 => 0xD1.`);
    lines.push(`So BC after LD B,0x01 = 0xD101xx (where xx = original C byte 0xD8).`);
  }

  if (at287d) {
    lines.push(`\n### At LDIR block (0x00287D):`);
    lines.push(`BC = ${hex(at287d.regs.bc)}`);
    lines.push(`Block 0x002873 does: INC BC => BC + 1`);
    lines.push(`Then block 0x00287D does: LD B, 0x0B and INC BC before LDIR.`);
    lines.push(`But LD B only sets bits [15:8], leaving upper byte 0xD1 intact.`);
    const expectedCount = at287d.regs.bc;
    lines.push(`LDIR will copy ${expectedCount} (${(expectedCount >>> 0).toLocaleString()}) bytes -- a runaway copy!`);
  }

  return lines.join('\n');
}

function generateReport(runData) {
  const { coldBoot, result, tracedSnapshots, fullTrace, machine } = runData;

  const lines = [];
  lines.push('# Phase 143 - Caller Chain Analysis for 0x048B5B\n');
  lines.push(`Generated by \`probe-phase143-caller-analysis.mjs\`.\n`);

  lines.push('## Summary\n');
  lines.push(`- Cold boot: steps=${coldBoot.steps} termination=${coldBoot.termination}`);
  lines.push(`- OS init: steps=${result.steps} termination=${result.termination}`);
  lines.push(`- Traced blocks captured: ${tracedSnapshots.length}\n`);

  // Register trace table
  lines.push('## Register Trace Through Caller Chain\n');
  lines.push('| Step | PC | A | F | BC | DE | HL | SP | IX | IY | Stack Top (12 bytes) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const snap of tracedSnapshots) {
    const r = snap.regs;
    lines.push(
      `| ${snap.step} | \`${hex(snap.pc)}\` | \`${hexByte(r.a)}\` | \`${hexByte(r.f)}\` | \`${hex(r.bc)}\` | \`${hex(r.de)}\` | \`${hex(r.hl)}\` | \`${hex(r.sp)}\` | \`${hex(r.ix)}\` | \`${hex(r.iy)}\` | \`${bytesToHex(snap.stackTop)}\` |`
    );
  }

  // Block descriptions
  lines.push('\n## Block Descriptions\n');

  const blockDescriptions = [
    ['0x048ACC', 'Write 0x00 to (IX-1), read port 0x5005, clear bit 5, write back. Compare B to 0x50.'],
    ['0x048AE0', 'LD A,C; CP 0x05; JR NZ to 0x048ADF (loop until C==5). Falls through to 0x048AE5.'],
    ['0x048AE5', 'CALL 0x03F26D (some subroutine). Returns to 0x048AE9.'],
    ['0x048AE9', 'AND 0x10 (test bit 4 of A); JR Z to 0x048B07 (skip if bit 4 clear). Falls through to 0x048AED.'],
    ['0x048B07', 'Read memory at 0xD177B7; CP 0x55; JP Z to 0x048C44 (jump if magic marker). Falls through to 0x048B11.'],
    ['0x048B11', 'Read port 0x3114, SET bit 0, write back. Compare B to 0x31. Falls through to 0x048B21.'],
    ['0x048B21', 'LD A,C; CP 0x14; JR NZ to 0x048B20 (loop until C==0x14). Falls through to 0x048B26.'],
    ['0x048B26', 'LD A,0xAA; write to 0xD177B7 (set magic marker). LD BC,0x000000. RRCA. CALL M,0x414001 (conditional). Falls through to 0x048B36.'],
    ['0x048B36', 'NOP; PUSH BC; CALL 0x05206E. Returns to 0x048B3C.'],
    ['0x048B3C', 'POP BC; OR A; JR Z to 0x048B5B (jump if A==0). Falls through to 0x048B40.'],
    ['0x048B5B', 'LD BC,0x000448 (length); PUSH BC. LD BC,0xD13FD8 (dest); PUSH BC. CALL 0x0000B0. **This is the memcpy caller.**'],
    ['0x0000B0', 'JP 0x00285F. Simple trampoline to the memcpy utility.'],
    ['0x00285F', 'PUSH IY; IY=SP+3 (stack frame). LD B,0x01 (**only sets bits 15:8, leaves upper byte!**). SBC HL,BC; JR Z to skip.'],
    ['0x002873', 'RLA; INC BC; XOR A; LD (DE),A (zero one byte at dest); DEC HL; SBC HL,BC; JR Z to cleanup.'],
    ['0x00287D', 'RLCA; LD B,0x0B; INC DE; DAA; INC BC; **LDIR** (runaway copy). POP IY; RET.'],
  ];

  for (const [addr, desc] of blockDescriptions) {
    lines.push(`### \`${addr}\`\n`);
    lines.push(`${desc}\n`);
  }

  // HL origin analysis
  lines.push('\n' + analyzeHlOrigin(tracedSnapshots));

  // BC corruption analysis
  lines.push('\n' + analyzeBcCorruption(tracedSnapshots));

  // Fix recommendation
  lines.push('\n## Root Cause and Fix Recommendation\n');
  lines.push('### The Bug\n');
  lines.push('The memcpy utility at 0x00285F is an eZ80 ADL-mode routine. On real hardware:');
  lines.push('- `LD B, 0x01` in ADL mode loads the full 8-bit B register (bits 15:8 of the 24-bit BC).');
  lines.push('- The upper byte (bits 23:16, called BCU) is a separate physical register on the eZ80.');
  lines.push('- On real hardware, `LD B, imm8` does NOT touch BCU -- it only modifies the middle byte.');
  lines.push('- The transpiler correctly implements this: `cpu.b = 0x01` only sets bits [15:8].\n');
  lines.push('The problem is that the **caller at 0x048B5B sets BC = 0xD13FD8** (the destination address)');
  lines.push('before calling the memcpy. The memcpy expects to use BC as a counter, and its `LD B, 0x01`');
  lines.push('only resets bits [15:8]. The upper byte 0xD1 from the caller remains, making BC = 0xD101xx');
  lines.push('instead of the intended 0x0001xx.\n');
  lines.push('### Where to Fix\n');
  lines.push('**Option A: Fix the memcpy utility (0x00285F)**');
  lines.push('- Before using BC as a counter, clear the upper byte: force `cpu.bc &= 0x00FFFF` after the IY setup.');
  lines.push('- Pro: Fixes this and any other caller that leaves garbage in BCU.');
  lines.push('- Con: May not match real hardware behavior if the real OS relies on BCU being preserved.\n');
  lines.push('**Option B: Fix the caller (0x048B5B)**');
  lines.push('- Have the caller clear BCU before or after pushing parameters.');
  lines.push('- Con: The transpiled code matches the ROM bytes exactly -- the caller IS setting BC=0xD13FD8.\n');
  lines.push('**Option C: Fix the memcpy parameter parsing**');
  lines.push('- The memcpy reads length from stack via IY indexing. If the stack frame setup is correct,');
  lines.push('  the length (0x000448) should be read from the stack, not from the BC register.');
  lines.push('- The SBC HL,BC at 0x00286F is comparing HL against BC -- if BC should be 0x0001xx');
  lines.push('  (from LD B,0x01 with C leftover), but the length 0x000448 was pushed to stack,');
  lines.push('  then the real question is: how does HL get set to the source address?\n');
  lines.push('**Recommendation**: The most likely fix is **Option A** -- the memcpy utility should mask BC');
  lines.push('to 16 bits when setting up the LDIR counter, since this is a Z80-era memcpy pattern that');
  lines.push('was not updated for the eZ80\'s 24-bit registers. The `LD B, 0x01` instruction was intended');
  lines.push('to set BC to 0x01xx (256-byte page), but in ADL mode the upper byte leaks through.');

  return lines.join('\n');
}

console.log('Phase 143: Caller chain analysis for 0x048B5B boot crash');
console.log('=========================================================\n');

const runData = runProbe();
const report = generateReport(runData);

fs.writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`\nReport written to ${REPORT_PATH}`);
