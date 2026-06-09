#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

// ── Setup ──────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const INIT_IDLE_LOOP = 0x0019be;
const REPAINT_IDLE_LOOP = 0x0019b5;
const LAUNCH_INIT = 0x09DD62;
const REPAINT = 0x058241;
const WARM_KEY_EVENT = 0x02FD8F;
const VRAM_BASE = 0xD40000;
const W = 320;
const H = 240;

const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

// ── Watch addresses ────────────────────────────────────────────────────────────

const WATCH = {
  getcsc: 0x03FA09,
  dispatch: 0x099921,
  tokenProc: 0x03E1B4,
  cxMain: 0x0585E9,
  keypre: 0x06CE73,
  keyToToken: 0x061D1A,
};

const WATCH_BY_PC = new Map(Object.entries(WATCH).map(([name, pc]) => [pc, name]));

const ADDR_D0058C = 0xD0058C;
const ADDR_D0058D = 0xD0058D;
const ADDR_D0058E = 0xD0058E;
const ADDR_D007CA = 0xD007CA;

// ── Helpers (inlined) ──────────────────────────────────────────────────────────

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function hex8(v) { return `0x${(v & 0xFF).toString(16).padStart(2, '0')}`; }
function read24(m, a) { return m[a] | (m[a + 1] << 8) | (m[a + 2] << 16); }
function write24(m, a, v) { m[a] = v & 0xFF; m[a + 1] = (v >> 8) & 0xFF; m[a + 2] = (v >> 16) & 0xFF; }
function word(m, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return m[a] | (m[a + 1] << 8); }

function snapshotCpu(c) {
  return Object.fromEntries(SNAP_FIELDS.map((f) => [f, c[f]]));
}

function restoreCpu(c, snap) {
  for (const [f, v] of Object.entries(snap)) c[f] = v;
}

function vramStats(m) {
  let black = 0;
  let nonWhite = 0;
  let bodyNonWhite = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = word(m, x, y);
      if (v === 0x0000) black++;
      if (v !== 0xFFFF) {
        nonWhite++;
        if (y >= 30) bodyNonWhite++;
      }
    }
  }
  return { black, nonWhite, bodyNonWhite };
}

function hexdump(m, addr, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(m[(addr + i) & 0xFFFFFF].toString(16).padStart(2, '0'));
  return bytes.join(' ');
}

function snapshotRam(m) {
  return new Uint8Array(m.slice(0x400000, 0xE00000));
}

function restoreRam(m, snap) {
  m.set(snap, 0x400000);
}

// ── Machine init ───────────────────────────────────────────────────────────────

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// ── Boot helpers ───────────────────────────────────────────────────────────────

function bootToIdle() {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  return executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
}

function launchInit() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_RESET_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, INIT_IDLE_LOOP);
  write24(mem, 0xD008E0, launchSp);
  return executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
}

function pushRepaintReturn() {
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, REPAINT_IDLE_LOOP);
}

function runFrom(entry, opts = {}) {
  const { maxSteps, maxLoopIterations, onBlock } = opts;
  let result;
  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      ...(maxLoopIterations != null ? { maxLoopIterations } : {}),
      ...(onBlock ? { onBlock } : {}),
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  return result;
}

function pressKey() {
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function installControlledLongjmpAnchor() {
  const sp = STACK_RESET_TOP - 24;
  cpu.sp = sp;
  write24(mem, sp, REPAINT_IDLE_LOOP);
  write24(mem, 0xD008E0, sp);
}

// ── Trace infrastructure ───────────────────────────────────────────────────────

function inResetRegion(pc) {
  return (
    (pc >= 0x001900 && pc <= 0x0019FF) ||
    (pc >= 0x09DD00 && pc <= 0x09DDFF) ||
    (pc >= 0x09DE00 && pc <= 0x09DEFF) ||
    (pc >= 0x08C300 && pc <= 0x08C3FF) ||
    (pc >= 0x080200 && pc <= 0x0802FF)
  );
}

function diagnoseLastNormalBlock(rolling) {
  for (let i = rolling.length - 1; i >= 0; i--) {
    if (!inResetRegion(rolling[i])) return rolling[i];
  }
  return rolling.at(-1) ?? 0;
}

function reg(name) {
  return cpu[name] ?? 0;
}

function dumpRegs(label, pc) {
  const names = ['a', 'f', '_bc', '_de', '_hl', '_ix', '_iy', 'sp'];
  const parts = names.map((n) => `${n}=${hex(cpu[n], n.length <= 2 ? 2 : 6)}`);
  console.log(`${label} pc=${hex(pc)} ${parts.join(' ')}`);
}

function formatTrail(rolling) {
  return rolling.map((pc, i) => `${String(i).padStart(3, ' ')} ${hex(pc)}`).join('\n');
}

function makePass2Tracer() {
  const rolling = [];
  const watchHits = Object.fromEntries(Object.keys(WATCH).map((name) => [name, 0]));
  const events = [];
  const state = {
    rolling,
    watchHits,
    events,
    sawWipeTrap: false,
    sawInit: false,
    sawReinit: false,
    lastD0058C: mem[ADDR_D0058C],
    lastD007CA: read24(mem, ADDR_D007CA),
    dumpedHousekeeping: new Set(),
  };

  return {
    state,
    onBlock(pc) {
      rolling.push(pc);
      if (rolling.length > 200) rolling.shift();

      const watchName = WATCH_BY_PC.get(pc);
      if (watchName) watchHits[watchName]++;

      if (pc === 0x0019BE) state.sawWipeTrap = true;
      if (pc === 0x09DD62) state.sawInit = true;
      if (pc === 0x09DEE0) state.sawReinit = true;

      const d0058c = mem[ADDR_D0058C];
      if (d0058c !== state.lastD0058C) {
        events.push(`D0058C changed near ${hex(pc)}: ${hex8(state.lastD0058C)} -> ${hex8(d0058c)}`);
        state.lastD0058C = d0058c;
      }

      const d007ca = read24(mem, ADDR_D007CA);
      if (d007ca !== state.lastD007CA) {
        events.push(`D007CA changed near ${hex(pc)}: ${hex(state.lastD007CA)} -> ${hex(d007ca)}`);
        state.lastD007CA = d007ca;
      }

      if (pc === 0x02FE73) {
        console.log(`\nDecision dump: pending-key relay / D0058C gate D0058C=${hex8(d0058c)}`);
        dumpRegs('REGS', pc);
      }

      if (pc >= 0x030000 && pc <= 0x030FFF && !state.dumpedHousekeeping.has(pc)) {
        state.dumpedHousekeeping.add(pc);
        console.log(`\nDecision dump: housekeeping block D0058C=${hex8(d0058c)}`);
        dumpRegs('REGS', pc);
      }

      if (pc === WATCH.cxMain) {
        console.log(`\nDecision dump: cxMain A=${hex8(cpu.a)}`);
        dumpRegs('REGS', pc);
      }
    },
  };
}

function printPass2Summary(result, trace) {
  const { state } = trace;
  const lastPc = result.lastPc ?? result.pc ?? state.rolling.at(-1) ?? 0;
  console.log('\n=== PASS 2 TRACE SUMMARY ===');
  console.log(`steps=${result.steps} reason=${result.termination ?? result.reason ?? 'unknown'} lastPc=${hex(lastPc)}`);
  console.log(`D007CA=${hex(read24(mem, ADDR_D007CA))}`);
  console.log(`D0058D=${hex8(mem[ADDR_D0058D])} D0058E=${hex8(mem[ADDR_D0058E])}`);
  console.log(`went through wipe trap 0x0019be: ${state.sawWipeTrap ? 'yes' : 'no'}`);
  console.log(`went through init 0x09DD62: ${state.sawInit ? 'yes' : 'no'}`);
  console.log(`went through re-init 0x09DEE0: ${state.sawReinit ? 'yes' : 'no'}`);

  console.log('\nWatch hits:');
  for (const [name, pc] of Object.entries(WATCH)) {
    console.log(`  ${name} ${hex(pc)}: ${state.watchHits[name]}`);
  }

  console.log('\nD0058C/D007CA observations:');
  if (state.events.length === 0) {
    console.log('  none');
  } else {
    for (const ev of state.events) console.log(`  ${ev}`);
  }

  console.log('\nRolling buffer, last 200 blocks:');
  console.log(formatTrail(state.rolling));

  const culprit = diagnoseLastNormalBlock(state.rolling);
  console.log(`\nDIAGNOSIS: last block before reset path was ${hex(culprit)}`);
}

// ── Main execution ─────────────────────────────────────────────────────────────

console.log('=== probe-pass2-trace ===\n');

// Step 1: Boot sequence
console.log('Booting shortcut idle state...');
bootToIdle();

console.log('Running real OS init from 0x09DD62...');
const initResult = launchInit();
const initCx = read24(mem, 0xD007CA);
console.log(`post-init: D007CA=${hex(initCx)} D008E0=${hex(read24(mem, 0xD008E0))} steps=${initResult.steps}`);
if (initCx !== 0x0585E9) {
  console.error(`ABORT: expected post-init D007CA=0x0585E9, got ${hex(initCx)}`);
  process.exit(2);
}

console.log('Running repaint from 0x058241...');
pushRepaintReturn();
const repaintResult = runFrom(REPAINT, { maxSteps: 1500000, maxLoopIterations: 60000 });
console.log(`repaint: steps=${repaintResult.steps} term=${repaintResult.termination ?? 'unknown'} lastPc=${hex(repaintResult.lastPc)}`);

// Golden snapshot
const goldenRam = snapshotRam(mem);
const goldenCpu = snapshotCpu(cpu);
const goldenStats = vramStats(mem);
console.log(`golden VRAM: black=${goldenStats.black} nonWhite=${goldenStats.nonWhite}`);

// Keypress
console.log('\nApplying keypress...');
pressKey();
console.log(`D00587=${hex8(mem[0xD00587])} D0058E=${hex8(mem[0xD0058E])} D0058D=${hex8(mem[0xD0058D])} D00080=${hex8(mem[0xD00080])}`);

// Step 2: Pass 1
console.log('\n=== PASS 1 ===');
installControlledLongjmpAnchor();
const pass1 = runFrom(WARM_KEY_EVENT, { maxSteps: 800000, maxLoopIterations: 100000 });
const pass1Pc = pass1.lastPc ?? pass1.pc ?? 0;
console.log(`pass1: steps=${pass1.steps} term=${pass1.termination ?? 'unknown'} lastPc=${hex(pass1Pc)} D0058E=${hex8(mem[ADDR_D0058E])}`);
if (pass1Pc !== REPAINT_IDLE_LOOP) {
  console.log(`WARNING: pass 1 did not halt at controlled longjmp target ${hex(REPAINT_IDLE_LOOP)}; got ${hex(pass1Pc)}`);
}

// Step 3: Pass 2 with ring-buffer tracing
console.log('\n=== PASS 2 ===');
restoreRam(mem, goldenRam);
restoreCpu(cpu, goldenCpu);
pressKey();
installControlledLongjmpAnchor();

const trace = makePass2Tracer();
const pass2 = runFrom(WARM_KEY_EVENT, {
  maxSteps: 300000,
  maxLoopIterations: 100000,
  onBlock: trace.onBlock,
});

// Step 4: Print results
printPass2Summary(pass2, trace);
