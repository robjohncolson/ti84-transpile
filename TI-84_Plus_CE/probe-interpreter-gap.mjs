#!/usr/bin/env node
// Measurement probe: quantify the RAM-execution gap.
//
// The runtime cannot execute RAM-resident code (PC >= 0xD00000) — it stubs
// each such block with a synthetic RET trampoline. The OS runs its event loop,
// keyboard scan, and ISRs from RAM. This probe boots, then drives the OS from
// several plausible event-loop / ISR entries and counts, via onMissingBlock:
//   - how many distinct RAM addresses execution would need an interpreter for
//   - how many total RAM-trampoline hits occur
//   - how many steps run before the FIRST RAM hit (how far it gets unaided)
//   - distinct non-lifted ROM addresses (decoder/lift gaps)
// The output is the concrete size of the "missing interpreter" problem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

const SNAP_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

function measure(label, entry, mode, opts = {}) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: opts.timerInterrupt ?? false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Reset to a clean runnable state for the measured run.
  cpu.halted = false; cpu.iff1 = opts.timerInterrupt ? 1 : 0; cpu.iff2 = cpu.iff1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  if (opts.injectKey != null && peripherals.setKeyPressed) {
    peripherals.setKeyPressed(mem, opts.injectKey);
  }

  const ramAddrs = new Set();
  const romMissing = new Set();
  let ramHits = 0;
  let firstRamStep = null;

  let result;
  try {
    result = executor.runFrom(entry, mode, {
      maxSteps: opts.maxSteps ?? 2_000_000,
      maxLoopIterations: opts.maxLoopIterations ?? 100000,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000) {
          ramHits++;
          ramAddrs.add(pc >>> 0);
          if (firstRamStep === null) firstRamStep = steps;
        } else if (pc < 0x400000) {
          romMissing.add(pc >>> 0);
        }
      },
    });
  } catch (err) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(err && err.message || err) };
  }

  return {
    label, entry, mode,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    error: result.error,
    ramHits,
    distinctRamAddrs: ramAddrs.size,
    firstRamStep,
    distinctRomMissing: romMissing.size,
    sampleRam: [...ramAddrs].slice(0, 8).map((a) => hex(a)),
  };
}

const runs = [
  // entry, mode, opts — several plausible OS loop / ISR entries
  ['post-init continue',        POST_INIT_ENTRY, 'adl', { maxSteps: 2_000_000 }],
  ['event loop 0x0019be',       0x0019be,        'adl', { maxSteps: 2_000_000 }],
  ['event loop 0x0040B2',       0x0040B2,        'adl', { maxSteps: 2_000_000 }],
  ['kbd ISR 0x000038 (no key)', 0x000038,        'adl', { maxSteps: 2_000_000, timerInterrupt: true }],
  ['kbd ISR 0x000038 +key 2',   0x000038,        'adl', { maxSteps: 2_000_000, timerInterrupt: true, injectKey: 0x93 }],
];

console.log('=== Interpreter Gap Measurement ===');
console.log('Counts how much RAM-resident code the OS tries to run (= what an interpreter must cover).\n');

const rows = [];
for (const [label, entry, mode, opts] of runs) {
  const r = measure(label, entry, mode, opts);
  rows.push(r);
  console.log(`--- ${label} (entry=${hex(entry)} ${mode}) ---`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  console.log(`  RAM trampoline hits=${r.ramHits}  distinct RAM addrs=${r.distinctRamAddrs}  firstRamHitAtStep=${r.firstRamStep}`);
  console.log(`  distinct non-lifted ROM addrs=${r.distinctRomMissing}`);
  console.log(`  sample RAM addrs: ${r.sampleRam.join(' ') || '(none)'}`);
  console.log('');
}

console.log('=== SUMMARY ===');
const totalDistinctRam = new Set();
let anyKeyChange = false;
for (const r of rows) {
  console.log(`  ${r.label.padEnd(28)} ramHits=${String(r.ramHits).padStart(8)} distinctRam=${String(r.distinctRamAddrs).padStart(5)} firstRamStep=${r.firstRamStep}`);
}
console.log('\nInterpretation: distinctRam = the number of distinct RAM code locations the OS would');
console.log('execute that are currently stubbed with a RET. firstRamStep shows how few steps run');
console.log('before the OS leaves lifted-ROM territory. Large ramHits with small firstRamStep means');
console.log('the live OS depends heavily on RAM-resident code an interpreter would need to run.');
