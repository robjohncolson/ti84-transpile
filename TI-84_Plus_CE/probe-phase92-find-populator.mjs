#!/usr/bin/env node
// Phase 92: Find the OS function that populates the mode display buffer at 0xD020A6.
// Phase 91b confirmed: 0x0a29ec reads from 0xD020A6-0xD020BF (26 bytes ASCII mode text).
// In our boot snapshot (100k OS-init steps), this buffer is all 0xFF — uninitialized.
// Goal: Wrap cpu.write8 and run longer OS boot to catch the first write to 0xD020A6.
// That write's block PC identifies the populate function.
//
// Also: try LONGER OS init runs (200k, 500k, 1M steps) to see if the buffer gets
// populated and what gets written.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_END   = 0xD020BF; // inclusive
const MODE_BUF_LEN   = MODE_BUF_END - MODE_BUF_START + 1; // 26
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

// ── Fresh executor + write8 trace ─────────────────────────────────────────────
// Run a fresh boot with write8 wrapped. Trace ALL writes to D020A6-D020BF.
function runWithWriteTrace(maxStepsMain, maxStepsInit = 100000) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Wrap write8 to intercept writes to the mode buffer range
  const origWrite8 = cpu.write8.bind(cpu);
  const modeWrites = []; // { addr, value, blockPc, step }
  let currentBlockPc = 0;
  let stepCount = 0;

  cpu.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END) {
      modeWrites.push({ addr, value, blockPc: currentBlockPc, step: stepCount });
    }
    origWrite8(addr, value);
  };

  // Stage 1: cold boot (z80 mode)
  executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000, maxLoopIterations: 32,
    onBlock: (pc) => { currentBlockPc = pc; stepCount++; }
  });

  // Stage 2: OS init at 0x08C331 (variable step count)
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', {
    maxSteps: maxStepsInit, maxLoopIterations: Math.max(500, maxStepsInit / 100),
    onBlock: (pc) => { currentBlockPc = pc; stepCount++; }
  });

  // Stage 3: additional run at 0x0802b2 (SetTextFgColor)
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 100, maxLoopIterations: 32,
    onBlock: (pc) => { currentBlockPc = pc; stepCount++; }
  });

  // Stage 4: longer continuation from OS init entry (try to drive more OS init)
  if (maxStepsMain > 0) {
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, 12);
    cpu._iy = 0xD00080; cpu.f = 0x40;
    executor.runFrom(0x08C331, 'adl', {
      maxSteps: maxStepsMain, maxLoopIterations: Math.max(2000, maxStepsMain / 200),
      onBlock: (pc) => { currentBlockPc = pc; stepCount++; }
    });
  }

  return { modeWrites, mem };
}

// ── Run 1: Standard snapshot (100k OS init, 0 extra) ──────────────────────────
console.log('=== Run 1: Standard snapshot (100k OS init) ===');
const run1 = runWithWriteTrace(0, 100000);
console.log(`  Mode buffer writes: ${run1.modeWrites.length}`);
console.log(`  Buffer state: ${Array.from(run1.mem.slice(MODE_BUF_START, MODE_BUF_END+1)).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);

// ── Run 2: Extended OS init (500k steps) ──────────────────────────────────────
console.log('\n=== Run 2: Extended OS init (500k steps, 0 extra) ===');
const run2 = runWithWriteTrace(0, 500000);
console.log(`  Mode buffer writes: ${run2.modeWrites.length}`);
if (run2.modeWrites.length > 0) {
  console.log('  First 20 writes:');
  for (const w of run2.modeWrites.slice(0, 20)) {
    const ch = w.value >= 0x20 && w.value < 0x7f ? String.fromCharCode(w.value) : `[${w.value.toString(16)}]`;
    console.log(`    step=${w.step} blockPc=0x${w.blockPc.toString(16)} addr=0x${w.addr.toString(16)} val=0x${w.value.toString(16)}(${ch})`);
  }
  const text = Array.from(run2.mem.slice(MODE_BUF_START, MODE_BUF_END+1))
    .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `[${b.toString(16)}]`).join('');
  console.log(`  Buffer text: "${text}"`);
} else {
  console.log('  Buffer state: ' + Array.from(run2.mem.slice(MODE_BUF_START, MODE_BUF_END+1)).map(b => b.toString(16).padStart(2,'0')).join(' '));
}

// ── Run 3: Long extra continuation (try driving home screen init) ─────────────
console.log('\n=== Run 3: 100k init + 200k extra continuation ===');
const run3 = runWithWriteTrace(200000, 100000);
console.log(`  Mode buffer writes: ${run3.modeWrites.length}`);
if (run3.modeWrites.length > 0) {
  console.log('  Unique blockPc values that wrote to mode buffer:');
  const pcs = [...new Set(run3.modeWrites.map(w => w.blockPc))];
  for (const pc of pcs) {
    const writes = run3.modeWrites.filter(w => w.blockPc === pc);
    const vals = writes.map(w => {
      const ch = w.value >= 0x20 && w.value < 0x7f ? String.fromCharCode(w.value) : `[${w.value.toString(16)}]`;
      return `${ch}`;
    }).join('');
    console.log(`    blockPc=0x${pc.toString(16)} → ${writes.length} writes, text="${vals}"`);
  }
  const text = Array.from(run3.mem.slice(MODE_BUF_START, MODE_BUF_END+1))
    .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `[${b.toString(16)}]`).join('');
  console.log(`  Buffer text after all runs: "${text}"`);
} else {
  console.log('  No writes. Buffer: ' + Array.from(run3.mem.slice(MODE_BUF_START, MODE_BUF_END+1)).map(b => b.toString(16).padStart(2,'0')).join(' '));
}

// ── Run 4: Try callers of 0x0a29ec as entry points after snapshot ──────────────
// 0x0a29ec is called from: 0x025b37, 0x060a39, 0x06c865, 0x078f6d, 0x088483
// Run each caller — maybe the caller also calls the mode buffer populator first.
console.log('\n=== Run 4: Callers of 0x0a29ec — do they write to mode buffer? ===');
const CALLERS = [0x025b37, 0x060a39, 0x06c865, 0x078f6d, 0x088483];

for (const caller of CALLERS) {
  const mem4 = new Uint8Array(0x1000000);
  mem4.set(romBytes);
  const p4 = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const ex4 = createExecutor(BLOCKS, mem4, { peripherals: p4 });
  const cpu4 = ex4.cpu;

  // Boot + OS init
  ex4.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu4.halted = false; cpu4.iff1 = 0; cpu4.iff2 = 0;
  cpu4.sp = 0xD1A87E - 3; mem4.fill(0xFF, cpu4.sp, 3);
  ex4.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  cpu4.mbase = 0xD0; cpu4._iy = 0xD00080; cpu4._hl = 0;
  cpu4.halted = false; cpu4.iff1 = 0; cpu4.iff2 = 0;
  cpu4.sp = 0xD1A87E - 3; mem4.fill(0xFF, cpu4.sp, 3);
  ex4.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Wrap write8 on this executor
  const origW = cpu4.write8.bind(cpu4);
  const callerWrites = [];
  let callerBlockPc = 0;
  cpu4.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END) {
      callerWrites.push({ addr, value, blockPc: callerBlockPc });
    }
    origW(addr, value);
  };

  cpu4.halted = false; cpu4.iff1 = 0; cpu4.iff2 = 0;
  cpu4._iy = 0xD00080; cpu4.f = 0x40;
  cpu4.sp = 0xD1A87E - 12; mem4.fill(0xFF, cpu4.sp, 12);
  ex4.runFrom(caller, 'adl', {
    maxSteps: 100000, maxLoopIterations: 2000,
    onBlock: (pc) => { callerBlockPc = pc; }
  });

  const text = Array.from(mem4.slice(MODE_BUF_START, MODE_BUF_END+1))
    .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `[${b.toString(16)}]`).join('');
  console.log(`  caller=0x${caller.toString(16)} → ${callerWrites.length} mode buffer writes, text="${text}"`);
  if (callerWrites.length > 0) {
    const pcs = [...new Set(callerWrites.map(w => w.blockPc))];
    console.log(`    blockPcs: ${pcs.map(p => '0x'+p.toString(16)).join(', ')}`);
  }
}

// ── Run 5: Callers of 0x0a2b72 ────────────────────────────────────────────────
console.log('\n=== Run 5: Callers of 0x0a2b72 — do they write to mode buffer? ===');
const CALLERS2 = [0x05e481, 0x05e7d2, 0x09cb14];

for (const caller of CALLERS2) {
  const mem5 = new Uint8Array(0x1000000);
  mem5.set(romBytes);
  const p5 = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const ex5 = createExecutor(BLOCKS, mem5, { peripherals: p5 });
  const cpu5 = ex5.cpu;

  ex5.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu5.halted = false; cpu5.iff1 = 0; cpu5.iff2 = 0;
  cpu5.sp = 0xD1A87E - 3; mem5.fill(0xFF, cpu5.sp, 3);
  ex5.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  cpu5.mbase = 0xD0; cpu5._iy = 0xD00080; cpu5._hl = 0;
  cpu5.halted = false; cpu5.iff1 = 0; cpu5.iff2 = 0;
  cpu5.sp = 0xD1A87E - 3; mem5.fill(0xFF, cpu5.sp, 3);
  ex5.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const origW5 = cpu5.write8.bind(cpu5);
  const callerWrites5 = [];
  let callerBlockPc5 = 0;
  cpu5.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END) {
      callerWrites5.push({ addr, value, blockPc: callerBlockPc5 });
    }
    origW5(addr, value);
  };

  cpu5.halted = false; cpu5.iff1 = 0; cpu5.iff2 = 0;
  cpu5._iy = 0xD00080; cpu5.f = 0x40;
  cpu5.sp = 0xD1A87E - 12; mem5.fill(0xFF, cpu5.sp, 12);
  ex5.runFrom(caller, 'adl', {
    maxSteps: 100000, maxLoopIterations: 2000,
    onBlock: (pc) => { callerBlockPc5 = pc; }
  });

  const text5 = Array.from(mem5.slice(MODE_BUF_START, MODE_BUF_END+1))
    .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `[${b.toString(16)}]`).join('');
  console.log(`  caller=0x${caller.toString(16)} → ${callerWrites5.length} mode buffer writes, text="${text5}"`);
  if (callerWrites5.length > 0) {
    const pcs5 = [...new Set(callerWrites5.map(w => w.blockPc))];
    console.log(`    blockPcs: ${pcs5.map(p => '0x'+p.toString(16)).join(', ')}`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const allFindings = [];
if (run2.modeWrites.length > 0) allFindings.push('Run2 (500k init): FOUND writes');
if (run3.modeWrites.length > 0) allFindings.push('Run3 (100k+200k): FOUND writes');

const lines = [
  '# Phase 92 — Mode Buffer Populator Hunt\n\n',
  `Mode buffer: 0x${MODE_BUF_START.toString(16)}-0x${MODE_BUF_END.toString(16)} (${MODE_BUF_LEN} bytes)\n\n`,
  `## Summary\n\n`,
  `- Run 1 (100k init): ${run1.modeWrites.length} writes\n`,
  `- Run 2 (500k init): ${run2.modeWrites.length} writes\n`,
  `- Run 3 (100k+200k): ${run3.modeWrites.length} writes\n`,
  allFindings.length > 0 ? `\n**FOUND**: ${allFindings.join(', ')}\n` : '\nNo writes to mode buffer found in any run.\n',
];

fs.writeFileSync(path.join(__dirname, 'phase92-populator-report.md'), lines.join(''));
console.log('\nDone. Report written.');
