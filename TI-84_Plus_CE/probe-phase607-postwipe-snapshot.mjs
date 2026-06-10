import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HALT_IDLE = 0x0019b5;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;
const OUTER_LOOP = 0x08c331;
const WIPE = 0x0018f8;
const CX_MAIN = 0x0585e9;

// Original state ranges from probe-606
const STATE_RANGES_BASE = [
  { name: 'ctx', addr: 0xd007ca, len: 21 },
  { name: 'mode', addr: 0xd0008d, len: 1 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'descriptor', addr: 0xd02434, len: 32 },
  { name: 'eventFlags', addr: 0xd0009f, len: 1 },
  { name: 'iyFlags', addr: 0xd00080, len: 128 },
];

// Extended ranges for post-wipe snapshot
const STATE_RANGES_EXTENDED = [
  ...STATE_RANGES_BASE,
  { name: 'scanBuf', addr: 0xd0058c, len: 1 },
  { name: 'scanLast', addr: 0xd0058e, len: 1 },
  { name: 'vatPtrs', addr: 0xd02587, len: 22 },
  { name: 'vatExtra', addr: 0xd02577, len: 2 },
  { name: 'editState1', addr: 0xd0244e, len: 3 },
  { name: 'editState2', addr: 0xd0256a, len: 3 },
  { name: 'editState3', addr: 0xd025a0, len: 3 },
  { name: 'begCurEnd', addr: 0xd02317, len: 9 },
  { name: 'editBtm', addr: 0xd02440, len: 9 },
];

const keys = [
  { label: '2', scanCode: 0x9a },
  { label: '3', scanCode: 0x91 },
  { label: '+', scanCode: 0x70 },
];

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function countVRAM(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

function readBytes(mem, addr, len) {
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = mem[addr + i];
  return bytes;
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

function snapshotState(mem, ranges) {
  return ranges.map((range) => ({
    ...range,
    bytes: readBytes(mem, range.addr, range.len),
  }));
}

function restoreState(mem, snapshot) {
  for (const range of snapshot) writeBytes(mem, range.addr, range.bytes);
}

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// ── Load ROM + transpiled blocks ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase607: post-wipe snapshot probe — boot + key1 wipe capture + key2/key3 restore');

// ── Phase 0: Cold boot (exact copy from probe-606/605/603) ──
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// ── Phase 1: Launch-init ──
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase607: init done');

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase607: paint done vram=' + vramAfterPaint + 'px');

// ── Phase 3: Key 1 — run with wipe tracking, capture post-wipe snapshot ──
const key1 = keys[0];
console.log('\nphase607: === Key 1/3: \'' + key1.label + '\' (scan=' + hex(key1.scanCode, 2) + ') ===');
console.log('phase607: strategy — capture state after SECOND wipe, use for keys 2-3');

pressKey(mem, key1.scanCode);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1WipeCount = 0;
let key1CxMainHit = false;
let postWipeSnapshot = null;
let postWipeSnapshotAt = null;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === WIPE) {
      key1WipeCount++;
      if (key1WipeCount === 2) {
        // Capture the extended snapshot right when the second wipe fires
        postWipeSnapshot = snapshotState(mem, STATE_RANGES_EXTENDED);
        postWipeSnapshotAt = 'wipe2-entry';
        console.log('phase607: *** CAPTURED post-wipe snapshot at wipe #2 ***');
        console.log('phase607:   D007CA=' + hex(read24(mem, 0xd007ca)) + ' D0231A=' + hex(read24(mem, 0xd0231a)) + ' D0243A=' + hex(read24(mem, 0xd0243a)));
        console.log('phase607:   D02317=' + hex(read24(mem, 0xd02317)) + ' D02440=' + hex(read24(mem, 0xd02440)));
      }
    }
    if (addr === CX_MAIN) key1CxMainHit = true;
  },
});

const key1Vram = countVRAM(mem);
console.log('phase607: key1 report: steps=' + (key1Result.steps ?? 'unknown') + ' wipes=' + key1WipeCount + ' cxMain=' + key1CxMainHit + ' vram=' + key1Vram + 'px haltPC=' + hex(key1Result.lastPc));

if (!postWipeSnapshot) {
  console.log('phase607: FAIL — never captured post-wipe snapshot (wipeCount < 2)');
  console.log('phase607: key1 wipeCount=' + key1WipeCount);
  process.exit(1);
}

console.log('phase607: post-wipe snapshot captured at: ' + postWipeSnapshotAt);
console.log('phase607: extended ranges captured:');
for (const r of postWipeSnapshot) {
  const preview = Array.from(r.bytes.subarray(0, Math.min(4, r.bytes.length)))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('  ' + r.name + ' @ ' + hex(r.addr) + ' [' + r.len + 'B]: ' + preview + '...');
}

// ── Phase 4: Keys 2 and 3 — restore from post-wipe snapshot ──
let allSuccess = true;

for (let k = 1; k < keys.length; k++) {
  const key = keys[k];
  console.log('\nphase607: === Key ' + (k + 1) + '/3: \'' + key.label + '\' (scan=' + hex(key.scanCode, 2) + ') ===');
  console.log('phase607: restoring from post-wipe snapshot (not post-paint)');

  // Restore the extended post-wipe snapshot
  restoreState(mem, postWipeSnapshot);

  // Seed the key
  pressKey(mem, key.scanCode);

  // Set up SP and return frame
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  // Track events via onBlock
  let wipeCount = 0;
  let cxMainHit = false;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500_000,
    maxLoopIterations: 500_000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === WIPE) wipeCount++;
      if (addr === CX_MAIN) cxMainHit = true;
    },
  });

  const afterVram = countVRAM(mem);
  const haltPC = result.lastPc & 0xFFFFFF;
  const steps = result.steps ?? 'unknown';

  const report = {
    key: key.label,
    scanCode: hex(key.scanCode, 2),
    steps,
    cxMainHit,
    wipeCount,
    vram: afterVram,
    finalD007CA: hex(read24(mem, 0xd007ca)),
    haltPC: hex(haltPC),
  };

  console.log('phase607: key \'' + key.label + '\' report ' + JSON.stringify(report));

  const haltsCorrectly = haltPC === HALT_IDLE;
  const underBudget = typeof steps === 'number' && steps < 300_000;

  if (!haltsCorrectly || !underBudget) {
    console.log('phase607: key \'' + key.label + '\' — ' + (!haltsCorrectly ? 'WRONG HALT' : 'OVER BUDGET'));
    allSuccess = false;
  }
}

// ── Summary ──
console.log('\n' + '='.repeat(60));
if (allSuccess) {
  console.log('phase607: SUCCESS — keys 2-3 halt at 0x0019B5 in < 300K steps with post-wipe snapshot');
} else {
  console.log('phase607: PARTIAL — post-wipe snapshot did not fully fix keys 2-3 (see reports above)');
}
console.log('phase607: done — finalVRAM=' + countVRAM(mem) + 'px');
