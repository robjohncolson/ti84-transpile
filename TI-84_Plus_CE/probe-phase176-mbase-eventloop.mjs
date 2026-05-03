// Phase 176 — MBASE Fix Probe for Event Loop
// Goal: Confirm that setting cpu.mbase = 0xD0 after boot allows the ISR to
//       pass the MBASE gate at block 0x000704 and reach callback dispatch
//       at 0x000710.
//
// The ISR chain is:
//   0x000038 → 0x0006F3 → 0x000704 → LD A,MB → CP 0xD0 → JP NZ,0x0019B5
//   If MBASE != 0xD0, it jumps to HALT at 0x0019B5, bypassing 0x000710.
//
// This probe runs two tests:
//   CONTROL — boot with MBASE=0 (default), expect ISR to stop at MBASE gate
//   FIX     — set cpu.mbase=0xD0 after boot, expect ISR to reach 0x000710+
//
// Run: node TI-84_Plus_CE/probe-phase176-mbase-eventloop.mjs

import { TRANSPILATION_META, ENTRY_POINTS, PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { CPU, createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

function resetCpuState(cpu) {
  cpu.a = 0; cpu.f = 0;
  cpu.b = 0; cpu.c = 0;
  cpu.d = 0; cpu.e = 0;
  cpu.h = 0; cpu.l = 0;
  cpu.sp = 0; cpu._ix = 0; cpu._iy = 0;
  cpu.i = 0; cpu.im = 0;
  cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.halted = false;
  cpu._callDepth = 0;
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return mem[a] | (mem[(a + 1) & 0xffffff] << 8) | (mem[(a + 2) & 0xffffff] << 16);
}

// Key addresses
const MBASE_GATE_BLOCK = 0x000704;   // block that reads MBASE and compares to 0xD0
const CALLBACK_DISPATCH = 0x000710;  // block AFTER the MBASE gate (callback dispatch)
const HALT_BYPASS = 0x0019B5;        // where JP NZ goes when MBASE != 0xD0
const CB_TARGET = 0x0019BE;          // event loop callback target
const CB_PTR_ADDR = 0xD02AD7;       // callback pointer address
const FLAG_ADDR = 0xD0009B;          // IY+27 system flag

// ── Decode ROM ──────────────────────────────────────────────────────────────
console.log('Decoding ROM...');
const romBytes = decodeEmbeddedRom();
console.log(`ROM: ${romBytes.length} bytes (${(romBytes.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Prelifted blocks: ${Object.keys(PRELIFTED_BLOCKS).length}\n`);

// ── Helper: run one full test (control or fix) ─────────────────────────────
function runTest(label, applyMbaseFix) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}\n`);

  const periph = createPeripheralBus({ trace: false, pllDelay: 2 });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: periph });
  const cpu = ex.cpu;

  // Step A: Boot to HALT (same as Test 23)
  resetCpuState(cpu);
  const boot = ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  console.log(`Boot: ${boot.steps} steps → ${boot.termination} at ${hex(boot.lastPc)}`);
  console.log(`MBASE after boot: ${hex(cpu.mbase, 2)}`);

  // Step B: Apply the MBASE fix (or not)
  if (applyMbaseFix) {
    cpu.mbase = 0xD0;
    console.log(`>>> APPLIED FIX: cpu.mbase = ${hex(cpu.mbase, 2)}`);
  } else {
    console.log(`>>> CONTROL: cpu.mbase remains ${hex(cpu.mbase, 2)}`);
  }

  // Step C: Initialize callback + system flags (same as Test 23)
  mem[CB_PTR_ADDR]     = CB_TARGET & 0xFF;
  mem[CB_PTR_ADDR + 1] = (CB_TARGET >> 8) & 0xFF;
  mem[CB_PTR_ADDR + 2] = (CB_TARGET >> 16) & 0xFF;

  // IY = 0xD00080, IY+27 = 0xD0009B — set bit 6
  mem[FLAG_ADDR] |= 0x40;

  // ENTER key: SDK Group 6 = keyMatrix[1], bit 0
  periph.keyboard.keyMatrix[1] = 0xFE;
  periph.setKeyboardIRQ(true);
  periph.write(0x5006, 0x08);

  console.log(`Callback: ${hex(CB_PTR_ADDR)} = ${hex(CB_TARGET)}`);
  console.log(`System flag (IY+27): ${hex(mem[FLAG_ADDR], 2)}`);
  console.log(`Keyboard: ENTER pressed, IRQ bit 19 set`);

  // Step D: Initial ISR run
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.sp = 0xD1A87E;
  cpu.push(boot.lastPc + 1);

  const initBlocks = [];
  const initMissing = [];
  const initResult = ex.runFrom(0x000038, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 200,
    onBlock: (pc, mode) => { initBlocks.push({ pc, mode }); },
    onMissingBlock: (pc, mode) => { if (pc > 0 && pc < 0x100000) initMissing.push({ pc, mode }); },
  });

  console.log(`\nInitial ISR: ${initResult.steps} steps → ${initResult.termination} at ${hex(initResult.lastPc)}`);
  console.log(`  Blocks: ${initBlocks.length} total, ${new Set(initBlocks.map(b => hex(b.pc))).size} unique`);
  console.log(`  Trace: ${initBlocks.map(b => `${hex(b.pc)}:${b.mode}`).join(' → ')}`);
  console.log(`  Reached MBASE gate (${hex(MBASE_GATE_BLOCK)}): ${initBlocks.some(b => b.pc === MBASE_GATE_BLOCK) ? 'YES' : 'NO'}`);
  console.log(`  Reached callback dispatch (${hex(CALLBACK_DISPATCH)}): ${initBlocks.some(b => b.pc === CALLBACK_DISPATCH) ? 'YES <<<' : 'NO'}`);
  console.log(`  Reached HALT bypass (${hex(HALT_BYPASS)}): ${initBlocks.some(b => b.pc === HALT_BYPASS) ? 'YES (bad)' : 'NO'}`);
  console.log(`  Reached callback target (${hex(CB_TARGET)}): ${initBlocks.some(b => b.pc === CB_TARGET) ? 'YES <<<' : 'NO'}`);
  if (initMissing.length > 0) {
    console.log(`  Missing blocks: ${[...new Set(initMissing.map(b => hex(b.pc)))].join(', ')}`);
  }
  console.log(`  A=${hex(cpu.a, 2)} SP=${hex(cpu.sp)} PC=${hex(initResult.lastPc)}`);

  // Step E: 10 ISR Cycles
  console.log(`\n  --- 10 ISR Cycles (max 2000 steps each) ---\n`);

  const summary = {
    reachedGate: 0,
    reachedDispatch: 0,
    reachedHaltBypass: 0,
    reachedCallback: 0,
    totalSteps: 0,
    allUniquePCs: new Set(),
    allMissing: new Set(),
  };

  for (let cycle = 0; cycle < 10; cycle++) {
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    cpu.sp = 0xD1A87E;
    cpu.sp -= 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

    // Re-assert keyboard IRQ each cycle
    periph.keyboard.keyMatrix[1] = 0xFE;
    periph.setKeyboardIRQ(true);
    periph.write(0x5006, 0x08);

    // Re-set system flag each cycle (ISR may clear it)
    mem[FLAG_ADDR] |= 0x40;

    // Re-set callback pointer each cycle (ISR may clear it)
    mem[CB_PTR_ADDR]     = CB_TARGET & 0xFF;
    mem[CB_PTR_ADDR + 1] = (CB_TARGET >> 8) & 0xFF;
    mem[CB_PTR_ADDR + 2] = (CB_TARGET >> 16) & 0xFF;

    const cycleBlocks = [];
    const cycleMissing = [];

    const result = ex.runFrom(0x000038, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: 200,
      onBlock: (pc, mode) => { cycleBlocks.push({ pc, mode }); },
      onMissingBlock: (pc, mode) => { cycleMissing.push({ pc, mode }); },
    });

    const hitGate = cycleBlocks.some(b => b.pc === MBASE_GATE_BLOCK);
    const hitDispatch = cycleBlocks.some(b => b.pc === CALLBACK_DISPATCH);
    const hitHaltBypass = cycleBlocks.some(b => b.pc === HALT_BYPASS);
    const hitCallback = cycleBlocks.some(b => b.pc === CB_TARGET);

    if (hitGate) summary.reachedGate++;
    if (hitDispatch) summary.reachedDispatch++;
    if (hitHaltBypass) summary.reachedHaltBypass++;
    if (hitCallback) summary.reachedCallback++;
    summary.totalSteps += result.steps;
    for (const b of cycleBlocks) summary.allUniquePCs.add(hex(b.pc));
    for (const m of cycleMissing) summary.allMissing.add(hex(m.pc));

    let termReason = result.termination;
    if (cpu.halted) termReason += ' (HALTED)';

    const markers = [];
    if (hitGate) markers.push('GATE');
    if (hitDispatch) markers.push('DISPATCH');
    if (hitHaltBypass) markers.push('HALT-BYPASS');
    if (hitCallback) markers.push('CALLBACK');

    console.log(`  Cycle ${cycle}: ${result.steps} steps → ${termReason} at ${hex(result.lastPc)}`);
    console.log(`    Trace: ${cycleBlocks.map(b => hex(b.pc)).join(' → ')}`);
    console.log(`    Markers: ${markers.length > 0 ? markers.join(', ') : 'none'}`);
    if (cycleMissing.length > 0) {
      const uniq = [...new Set(cycleMissing.map(b => `${hex(b.pc)}:${b.mode}`))];
      console.log(`    MISSING: ${uniq.join(', ')}`);
    }
    console.log(`    A=${hex(cpu.a, 2)} SP=${hex(cpu.sp)} PC=${hex(result.lastPc)}`);

    const cbNow = read24(mem, CB_PTR_ADDR);
    const flagNow = mem[FLAG_ADDR];
    console.log(`    cb@D02AD7=${hex(cbNow)} flag@D0009B=${hex(flagNow, 2)}`);
    console.log('');
  }

  // Summary for this test
  console.log(`  --- ${label} Summary ---`);
  console.log(`  Total steps: ${summary.totalSteps}`);
  console.log(`  Unique PCs across 10 cycles: ${summary.allUniquePCs.size}`);
  console.log(`  Reached MBASE gate:        ${summary.reachedGate}/10`);
  console.log(`  Reached callback dispatch: ${summary.reachedDispatch}/10`);
  console.log(`  Reached HALT bypass:       ${summary.reachedHaltBypass}/10`);
  console.log(`  Reached callback target:   ${summary.reachedCallback}/10`);
  if (summary.allMissing.size > 0) {
    console.log(`  Missing blocks: ${[...summary.allMissing].sort().join(', ')}`);
  }
  console.log('');

  return summary;
}

// ── Run both tests ──────────────────────────────────────────────────────────

const controlResult = runTest('CONTROL — MBASE = 0x00 (default, no fix)', false);
const fixResult = runTest('FIX — MBASE = 0xD0 (applied after boot)', true);

// ── Final comparison ────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('  COMPARISON: CONTROL vs FIX');
console.log('='.repeat(70) + '\n');

console.log(`                          CONTROL    FIX`);
console.log(`  MBASE gate reached:     ${controlResult.reachedGate}/10       ${fixResult.reachedGate}/10`);
console.log(`  Callback dispatch:      ${controlResult.reachedDispatch}/10       ${fixResult.reachedDispatch}/10`);
console.log(`  HALT bypass:            ${controlResult.reachedHaltBypass}/10       ${fixResult.reachedHaltBypass}/10`);
console.log(`  Callback target:        ${controlResult.reachedCallback}/10       ${fixResult.reachedCallback}/10`);
console.log(`  Unique PCs:             ${controlResult.allUniquePCs.size}          ${fixResult.allUniquePCs.size}`);
console.log(`  Total steps:            ${controlResult.totalSteps}        ${fixResult.totalSteps}`);

const fixWorks = fixResult.reachedDispatch > 0 && controlResult.reachedDispatch === 0;
console.log(`\n  VERDICT: ${fixWorks ? 'MBASE fix WORKS — dispatch gate opened' : 'MBASE fix did NOT change dispatch behavior'}`);

if (fixResult.allMissing.size > 0) {
  console.log(`\n  NOTE: FIX test hit missing blocks that may need transpilation:`);
  for (const m of [...fixResult.allMissing].sort()) {
    console.log(`    ${m}`);
  }
}

console.log('\nDone.');
