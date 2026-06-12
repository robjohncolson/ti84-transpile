#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase633-browser-coldboot-debug.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const COLDBOOT_EVENT_LOOP_ENTRY = 0x003A73;
const LAUNCH_HOME_INIT = 0x09DD62;
const HOME_REPAINT = 0x058241;
const INIT_IDLE = 0x0019BE;
const IDLE_HALT = 0x0019B5;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function makeMachine(timerInterrupt = false) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function summarize(label, cpu, mem, result = null) {
  return {
    label,
    result: result ? {
      steps: result.steps,
      termination: result.termination,
      lastPc: hex(result.lastPc),
      lastMode: result.lastMode,
    } : null,
    pc: result ? hex(result.lastPc) : null,
    sp: hex(cpu.sp),
    iy: hex(cpu._iy),
    iff1: cpu.iff1,
    halted: cpu.halted,
    d007ca: hex(read24(mem, 0xD007CA)),
    d007e0: hex(mem[0xD007E0], 2),
    d008e0: hex(read24(mem, 0xD008E0)),
    d02590: hex(read24(mem, 0xD02590)),
    d02593: hex(read24(mem, 0xD02593)),
    d0259a: hex(read24(mem, 0xD0259A)),
    d0259d: hex(read24(mem, 0xD0259D)),
  };
}

function runBrowserShellColdbootRecipe() {
  const machine = makeMachine(false);
  const { executor, cpu, mem } = machine;
  const rows = [];

  const p1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  rows.push(summarize('browser phase1 0x000000', cpu, mem, p1));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const p2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  rows.push(summarize('browser phase2 0x08C331', cpu, mem, p2));

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const p3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  rows.push(summarize('browser phase3 0x0802B2', cpu, mem, p3));

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  mem[0xD02AD7] = 0xBE;
  mem[0xD02AD8] = 0x19;
  mem[0xD02AD9] = 0x00;
  mem[0xD0009B] |= 0x40;
  mem[0x020100] = 0x5A;
  mem[0x020101] = 0xA5;
  mem[0x020102] = 0x00;
  mem[0xD177BA] = 0x00;

  const frame = executor.runFrom(COLDBOOT_EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 10000,
    diHaltBypass: true,
    diHaltBypassEntry: COLDBOOT_EVENT_LOOP_ENTRY,
  });
  rows.push(summarize('browser first 50K frame', cpu, mem, frame));
  return rows;
}

function runProvenLaunchHomeRecipe() {
  const machine = makeMachine(false);
  const { executor, peripherals, cpu, mem } = machine;
  const rows = [];

  const boot = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  rows.push(summarize('proven phase1 0x000000', cpu, mem, boot));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const kernel = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  rows.push(summarize('proven phase2 0x08C331', cpu, mem, kernel));

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const post = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  rows.push(summarize('proven phase3 0x0802B2', cpu, mem, post));

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  const idle = executor.runFrom(INIT_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });
  rows.push(summarize('proven warm idle 0x0019BE', cpu, mem, idle));

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, cpu.sp, INIT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  const init = executor.runFrom(LAUNCH_HOME_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  rows.push(summarize('proven launch-home 0x09DD62', cpu, mem, init));

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  if ((cpu.sp & 0xffffff) < 0x400000) cpu.sp = STACK_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, IDLE_HALT);

  const paint = executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  rows.push(summarize('proven repaint 0x058241', cpu, mem, paint));
  return rows;
}

const browserRows = runBrowserShellColdbootRecipe();
const provenRows = runProvenLaunchHomeRecipe();
const allRows = [...browserRows, ...provenRows];

const lines = [];
lines.push('# Phase 633 - Browser Coldboot Debug');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('- Reproduces the `browser-shell.html` coldboot recipe outside the browser and compares it to the proven `0x09DD62` launch-home init recipe.');
lines.push('- The browser recipe never runs the warm-idle `0x0019BE` continuation or `0x09DD62` before starting AutoRun. It enters the event-loop frame with `D007CA=0x000000` and VAT pointers still zero.');
lines.push('- The first browser-style AutoRun frame reproduces the observed blocker exactly: `50000` steps, `max_steps`, `PC=0x003D6B`.');
lines.push('- The comparison side confirms the omitted warm-idle stage exists and reaches `0x0019B5`; this probe is intentionally conservative and does not claim to fully recreate the later live home-screen state.');
lines.push('');
lines.push('## Results');
lines.push('');
lines.push('| Step | Term | Steps | PC | D007CA | D007E0 | D008E0 | D02590 | D0259A | D0259D |');
lines.push('| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |');
for (const row of allRows) {
  lines.push(`| ${row.label} | ${row.result?.termination ?? ''} | ${row.result?.steps ?? ''} | ${row.result?.lastPc ?? ''} | ${row.d007ca} | ${row.d007e0} | ${row.d008e0} | ${row.d02590} | ${row.d0259a} | ${row.d0259d} |`);
}
lines.push('');
lines.push('## Interpretation');
lines.push('');
lines.push('The headless browser probe waits for the transient status text `Coldboot complete`, but `initializeColdbootRuntime()` immediately calls `startAutoRunLoop()`. The next animation-frame run overwrites the status with `Coldboot: 50000 steps, max_steps | ... PC=0x003d6b`, so the harness can miss completion even when initialization returned.');
lines.push('');
lines.push('More importantly, the browser coldboot state is not equivalent to the current post-session-596+ probe boot state. It uses the older shortcut sequence `0x000000 -> 0x08C331 -> 0x0802B2`, manually seeds event-loop RAM, and starts at `0x003A73`. That sequence leaves `D007CA=0x000000` and VAT pointers at zero in this probe. Starting AutoRun from that state sends the shell into the `0x003D6B` max-steps loop.');
lines.push('');
lines.push('## Next Fix Direction');
lines.push('');
lines.push('Update `browser-shell.html` coldboot in two steps: first, stop auto-starting AutoRun before a stable coldboot-ready status can be observed by the harness; second, replace the old event-loop seed with the current proven multi-key setup path from the phase597+ probes rather than entering `0x003A73` with zeroed `D007CA`/VAT state.');

fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  probe: 'phase633-browser-coldboot-debug',
  browserRows,
  provenRows,
  report: path.basename(REPORT_PATH),
}, null, 2));
