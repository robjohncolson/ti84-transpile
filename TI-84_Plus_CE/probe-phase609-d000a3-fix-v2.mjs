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
const WALKER_FWD = 0x090917;
const WALKER_BWD = 0x09092e;
const D000A3_BIT3_SET = 0x0907d6;

const STATE_RANGES_EXTENDED = [
  { name: 'ctx', addr: 0xd007ca, len: 21 },
  { name: 'mode', addr: 0xd0008d, len: 1 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'descriptor', addr: 0xd02434, len: 32 },
  { name: 'eventFlags', addr: 0xd0009f, len: 1 },
  { name: 'iyFlags', addr: 0xd00080, len: 128 },
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

const EDIT_BUFFER_ZERO_RANGES = [
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'editBtm_lower', addr: 0xd0243d, len: 3 },
  { name: 'begCurEnd', addr: 0xd02317, len: 9 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editBtm_ext', addr: 0xd02440, len: 9 },
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
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
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

function zeroRanges(mem, ranges) {
  for (const range of ranges) {
    for (let i = 0; i < range.len; i++) mem[range.addr + i] = 0;
  }
}

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase609: D000A3 bit 3 dynamic clearing via onBlock');
console.log('phase609: strategy -- clear bit 3 on EVERY block entry for keys 2-3');

// Phase 0: Cold boot (exact copy from probe-608)
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

// Phase 1: Launch-init
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase609: init done');

// Phase 2: Paint
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase609: paint done vram=' + vramAfterPaint + 'px');

// Capture POST-PAINT snapshot
const postPaintSnapshot = snapshotState(mem, STATE_RANGES_EXTENDED);
const postPaintD000A3 = mem[0xD000A3];
console.log('phase609: post-paint snapshot captured');
console.log('phase609:   D007CA=' + hex(read24(mem, 0xd007ca)) + ' D0231A=' + hex(read24(mem, 0xd0231a)) + ' D0243A=' + hex(read24(mem, 0xd0243a)));
console.log('phase609:   D02317=' + hex(read24(mem, 0xd02317)) + ' D02440=' + hex(read24(mem, 0xd02440)));
console.log('phase609:   D000A3=' + hex(postPaintD000A3, 2) + ' bit3=' + ((postPaintD000A3 >> 3) & 1));

// Phase 3: Key 1 -- run normally (no bit 3 suppression -- key1 already works)
const key1 = keys[0];
console.log('\nphase609: === Key 1/3: key=' + key1.label + ' (scan=' + hex(key1.scanCode, 2) + ') ===');
console.log('phase609: strategy -- run from post-init state (NO bit 3 suppression)');

pressKey(mem, key1.scanCode);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1WipeCount = 0;
let key1CxMainHit = false;
let key1Bit3SetCount = 0;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === WIPE) key1WipeCount++;
    if (addr === CX_MAIN) key1CxMainHit = true;
    if (addr === D000A3_BIT3_SET) key1Bit3SetCount++;
  },
});

const key1Vram = countVRAM(mem);
const key1HaltPC = key1Result.lastPc & 0xFFFFFF;
const key1Steps = key1Result.steps ?? 'unknown';

console.log('phase609: key1 report: steps=' + key1Steps + ' wipes=' + key1WipeCount + ' cxMain=' + key1CxMainHit + ' bit3Sets=' + key1Bit3SetCount + ' vram=' + key1Vram + 'px haltPC=' + hex(key1HaltPC) + ' D007CA=' + hex(read24(mem, 0xd007ca)) + ' D000A3=' + hex(mem[0xD000A3], 2));

// Phase 4: Keys 2 and 3 -- restore post-paint + selective zero + DYNAMIC bit 3 clearing
let allSuccess = true;
let allCxMain = true;

for (let k = 1; k < keys.length; k++) {
  const key = keys[k];
  console.log('\nphase609: === Key ' + (k + 1) + '/3: key=' + key.label + ' (scan=' + hex(key.scanCode, 2) + ') ===');
  console.log('phase609: strategy -- restore post-PAINT snapshot + zero edit pointers + DYNAMIC D000A3 bit 3 clearing');

  // Step 1: Restore full post-paint snapshot
  restoreState(mem, postPaintSnapshot);

  // Step 2: Zero edit buffer pointers (same as probe-608)
  zeroRanges(mem, EDIT_BUFFER_ZERO_RANGES);

  // Step 3: Clear D000A3 bit 3 initially
  mem[0xD000A3] &= ~0x08;

  console.log('phase609: after setup:');
  console.log('phase609:   D007CA=' + hex(read24(mem, 0xd007ca)) + ' (should be non-zero = cxMain context)');
  console.log('phase609:   D0243A=' + hex(read24(mem, 0xd0243a)) + ' (should be 0 = zeroed)');
  console.log('phase609:   D000A3=' + hex(mem[0xD000A3], 2) + ' bit3=' + ((mem[0xD000A3] >> 3) & 1) + ' (should be 0)');

  pressKey(mem, key.scanCode);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  let wipeCount = 0;
  let cxMainHit = false;
  let bit3ClearCount = 0;
  let bit3SetCount = 0;
  let walkerFwdCount = 0;
  let walkerBwdCount = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500_000,
    maxLoopIterations: 500_000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;

      // DYNAMIC: clear D000A3 bit 3 on every block entry
      if (mem[0xD000A3] & 0x08) {
        mem[0xD000A3] &= ~0x08;
        bit3ClearCount++;
      }

      if (addr === WIPE) wipeCount++;
      if (addr === CX_MAIN) cxMainHit = true;
      if (addr === D000A3_BIT3_SET) bit3SetCount++;
      if (addr === WALKER_FWD) walkerFwdCount++;
      if (addr === WALKER_BWD) walkerBwdCount++;
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
    bit3ClearCount,
    bit3SetCount,
    walkerFwd: walkerFwdCount,
    walkerBwd: walkerBwdCount,
    vram: afterVram,
    finalD007CA: hex(read24(mem, 0xd007ca)),
    finalD000A3: hex(mem[0xD000A3], 2),
    haltPC: hex(haltPC),
  };

  console.log('phase609: key=' + key.label + ' report ' + JSON.stringify(report));

  const haltsCorrectly = haltPC === HALT_IDLE;
  const underBudget = typeof steps === 'number' && steps < 400_000;

  if (haltsCorrectly && underBudget) {
    console.log('phase609: key=' + key.label + ' -- PASS (halts at HALT_IDLE in budget)');
  } else if (haltsCorrectly && !underBudget) {
    console.log('phase609: key=' + key.label + ' -- OVER BUDGET (' + steps + ' steps, limit 400K)');
    allSuccess = false;
  } else {
    console.log('phase609: key=' + key.label + ' -- WRONG HALT at ' + hex(haltPC));
    allSuccess = false;
  }

  if (!cxMainHit) {
    console.log('phase609: key=' + key.label + ' -- NO cxMain dispatch');
    allCxMain = false;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('phase609: KEY 1: steps=' + key1Steps + ' cxMain=' + key1CxMainHit + ' haltPC=' + hex(key1HaltPC) + ' bit3Sets=' + key1Bit3SetCount);

if (allSuccess && allCxMain) {
  console.log('phase609: PASS -- all 3 keys halt at 0x0019B5 in budget AND cxMain dispatches for all');
} else if (allCxMain && !allSuccess) {
  console.log('phase609: PARTIAL -- all keys reached cxMain but NOT all halted in budget');
} else if (allSuccess && !allCxMain) {
  console.log('phase609: PARTIAL -- all keys halt correctly but NOT all reached cxMain');
} else {
  console.log('phase609: FAIL -- neither halt nor cxMain fully satisfied');
}

console.log('phase609: done -- finalVRAM=' + countVRAM(mem) + 'px');
