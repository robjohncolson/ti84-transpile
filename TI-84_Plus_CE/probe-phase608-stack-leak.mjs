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

// Addresses to track SP at (the runaway loop from session 607)
const TRACK_ADDRS = new Set([0x090917, 0x08F3DC, 0x04C973, 0x090927]);
const TRACK_LABELS = {
  0x090917: 'loop_top',
  0x08F3DC: 'call_08F3DC',
  0x04C973: 'call_04C973',
  0x090927: 'pop_de_ret',
};

// State ranges — base set (post-paint, same as probe-607-key2-runaway)
const STATE_RANGES_BASE = [
  { name: 'ctx', addr: 0xd007ca, len: 21 },
  { name: 'mode', addr: 0xd0008d, len: 1 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'descriptor', addr: 0xd02434, len: 32 },
  { name: 'eventFlags', addr: 0xd0009f, len: 1 },
  { name: 'iyFlags', addr: 0xd00080, len: 128 },
];

// Extended ranges (post-wipe snapshot, from probe-607-postwipe)
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

/**
 * Run key2 ('3', scan=0x91) from OUTER_LOOP with SP tracking.
 * Returns a report object.
 */
function runKey2WithTracking(executor, cpu, mem, snapshot, label, maxSteps) {
  console.log('\nphase608: === ' + label + ' ===');

  restoreState(mem, snapshot);
  pressKey(mem, 0x91); // key '3'

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  const initialSP = cpu.sp & 0xFFFFFF;
  console.log('phase608: initial SP=' + hex(initialSP));
  console.log('phase608: D0243A (editCursorB)=' + hex(read24(mem, 0xd0243a)));
  console.log('phase608: D0231A (editCursorA)=' + hex(read24(mem, 0xd0231a)));

  const spLog = {};
  for (const addr of TRACK_ADDRS) {
    spLog[addr] = { hits: [], label: TRACK_LABELS[addr] };
  }

  let blockCount = 0;
  const spCheckpoints = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps,
    maxLoopIterations: maxSteps,
    onBlock(pc) {
      blockCount++;
      const addr = pc & 0xFFFFFF;

      // Periodic SP checkpoint every 10K blocks
      if (blockCount % 10_000 === 0) {
        spCheckpoints.push({ block: blockCount, sp: cpu.sp & 0xFFFFFF, pc: addr });
      }

      if (TRACK_ADDRS.has(addr)) {
        const sp = cpu.sp & 0xFFFFFF;
        const entry = spLog[addr];
        if (entry.hits.length < 100) {
          entry.hits.push({ block: blockCount, sp });
        }
      }
    },
  });

  const finalSP = cpu.sp & 0xFFFFFF;

  // ── Report ──
  console.log('\nphase608: --- ' + label + ' REPORT ---');
  console.log('phase608: blocks=' + blockCount + ' lastPC=' + hex(result.lastPc) + ' finalSP=' + hex(finalSP));
  console.log('phase608: SP drop=' + (initialSP - finalSP) + ' bytes (initial=' + hex(initialSP) + ' final=' + hex(finalSP) + ')');

  for (const [addrStr, entry] of Object.entries(spLog)) {
    const addr = Number(addrStr);
    const hits = entry.hits;
    if (hits.length === 0) {
      console.log('  ' + hex(addr) + ' (' + entry.label + '): NO HITS');
      continue;
    }

    const firstSP = hits[0].sp;
    const lastSP = hits[hits.length - 1].sp;
    const totalDrop = firstSP - lastSP;

    console.log('  ' + hex(addr) + ' (' + entry.label + '): ' + hits.length + ' hits, SP drop=' + totalDrop);
    console.log('    first SP=' + hex(firstSP) + ' @ block=' + hits[0].block);
    console.log('    last  SP=' + hex(lastSP) + ' @ block=' + hits[hits.length - 1].block);

    // Show first 20 and last 10 hits with deltas
    const showFirst = Math.min(20, hits.length);
    console.log('    first ' + showFirst + ' hits:');
    for (let i = 0; i < showFirst; i++) {
      const delta = i === 0 ? 0 : hits[i - 1].sp - hits[i].sp;
      const sign = delta >= 0 ? '-' : '+';
      console.log('      #' + (i + 1).toString().padStart(3) + ' block=' + hits[i].block.toString().padStart(6) + ' SP=' + hex(hits[i].sp) + ' delta=' + sign + Math.abs(delta));
    }
    if (hits.length > 30) {
      console.log('      ... (' + (hits.length - 30) + ' entries omitted) ...');
    }
    if (hits.length > 20) {
      const showLast = Math.min(10, hits.length - 20);
      const startIdx = hits.length - showLast;
      console.log('    last ' + showLast + ' hits:');
      for (let i = startIdx; i < hits.length; i++) {
        const delta = hits[i - 1].sp - hits[i].sp;
        const sign = delta >= 0 ? '-' : '+';
        console.log('      #' + (i + 1).toString().padStart(3) + ' block=' + hits[i].block.toString().padStart(6) + ' SP=' + hex(hits[i].sp) + ' delta=' + sign + Math.abs(delta));
      }
    }
  }

  // SP checkpoints
  console.log('  SP checkpoints (10K):');
  for (const cp of spCheckpoints) {
    console.log('    block=' + cp.block.toString().padStart(7) + ' SP=' + hex(cp.sp) + ' pc=' + hex(cp.pc));
  }

  // Summary: which addresses show SP decreasing?
  for (const [addrStr, entry] of Object.entries(spLog)) {
    const addr = Number(addrStr);
    const hits = entry.hits;
    if (hits.length < 2) continue;

    let decreasing = 0;
    let increasing = 0;
    let stable = 0;
    for (let i = 1; i < hits.length; i++) {
      const delta = hits[i].sp - hits[i - 1].sp;
      if (delta < 0) decreasing++;
      else if (delta > 0) increasing++;
      else stable++;
    }
    console.log('  ' + hex(addr) + ' trend: dec=' + decreasing + ' inc=' + increasing + ' stable=' + stable);
  }

  // Loop iteration delta
  const loopTopHits = spLog[0x090917]?.hits || [];
  if (loopTopHits.length >= 2) {
    const deltas = [];
    for (let i = 1; i < loopTopHits.length; i++) {
      deltas.push(loopTopHits[i - 1].sp - loopTopHits[i].sp);
    }
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const uniqueDeltas = [...new Set(deltas)];
    console.log('  loop_top avg SP delta/iter=' + avgDelta.toFixed(1) + ' unique=' + JSON.stringify(uniqueDeltas));
  }

  return { blockCount, lastPC: result.lastPc, finalSP, initialSP };
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

console.log('phase608: stack-leak trace — compare post-paint vs post-wipe snapshot for key2');

// ── Phase 0: Cold boot (exact copy from probe-607) ──
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
console.log('phase608: init done');

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase608: paint done vram=' + vramAfterPaint + 'px');

// ── Capture post-paint snapshot (BASE ranges only, like probe-607-key2-runaway) ──
const postPaintSnapshot = snapshotState(mem, STATE_RANGES_BASE);
console.log('phase608: post-paint snapshot: D0243A=' + hex(read24(mem, 0xd0243a)) + ' D0231A=' + hex(read24(mem, 0xd0231a)));

// ── Phase 3: Key 1 — capture post-wipe snapshot ──
console.log('\nphase608: === Key 1 (\'2\' scan=0x9a) — capture post-wipe snapshot ===');
pressKey(mem, 0x9A);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1WipeCount = 0;
let postWipeSnapshot = null;

executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === WIPE) {
      key1WipeCount++;
      if (key1WipeCount === 2) {
        postWipeSnapshot = snapshotState(mem, STATE_RANGES_EXTENDED);
        console.log('phase608: captured post-wipe snapshot at wipe #2');
        console.log('phase608: post-wipe D0243A=' + hex(read24(mem, 0xd0243a)) + ' D0231A=' + hex(read24(mem, 0xd0231a)));
      }
    }
  },
});

if (!postWipeSnapshot) {
  console.log('phase608: FAIL — never captured post-wipe snapshot (wipeCount=' + key1WipeCount + ')');
  process.exit(1);
}

// ── Compare the two snapshots ──
console.log('\nphase608: ═══ SNAPSHOT COMPARISON ═══');
console.log('phase608: Comparing post-paint vs post-wipe state at key addresses:');
const compareAddrs = [
  { name: 'D0243A (editCursorB)', addr: 0xd0243a, len: 3 },
  { name: 'D0231A (editCursorA)', addr: 0xd0231a, len: 3 },
  { name: 'D02317 (begCurEnd)', addr: 0xd02317, len: 9 },
  { name: 'D02440 (editBtm)', addr: 0xd02440, len: 9 },
  { name: 'D007CA (ctx)', addr: 0xd007ca, len: 21 },
  { name: 'D0009F (eventFlags)', addr: 0xd0009f, len: 1 },
];

for (const { name, addr, len } of compareAddrs) {
  // Find in post-paint
  const paintRange = postPaintSnapshot.find(r => r.addr === addr);
  const wipeRange = postWipeSnapshot.find(r => r.addr === addr);

  const paintHex = paintRange
    ? Array.from(paintRange.bytes.subarray(0, len)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    : '(not captured)';
  const wipeHex = wipeRange
    ? Array.from(wipeRange.bytes.subarray(0, len)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    : '(not captured)';

  const match = paintHex === wipeHex ? 'SAME' : 'DIFFERENT';
  console.log('  ' + name + ': ' + match);
  if (match === 'DIFFERENT') {
    console.log('    paint: ' + paintHex);
    console.log('    wipe:  ' + wipeHex);
  }
}

// ── Run A: Key 2 with POST-PAINT snapshot (should reproduce runaway) ──
const resultA = runKey2WithTracking(executor, cpu, mem, postPaintSnapshot, 'RUN A: post-paint snapshot (expect runaway)', 200_000);

// ── Run B: Key 2 with POST-WIPE snapshot (should work) ──
const resultB = runKey2WithTracking(executor, cpu, mem, postWipeSnapshot, 'RUN B: post-wipe snapshot (expect normal)', 200_000);

// ── Final comparison ──
console.log('\n' + '='.repeat(60));
console.log('phase608: ═══ FINAL COMPARISON ═══');
console.log('  Run A (post-paint): blocks=' + resultA.blockCount + ' lastPC=' + hex(resultA.lastPC) + ' SP drop=' + (resultA.initialSP - resultA.finalSP));
console.log('  Run B (post-wipe):  blocks=' + resultB.blockCount + ' lastPC=' + hex(resultB.lastPC) + ' SP drop=' + (resultB.initialSP - resultB.finalSP));

const aRunaway = (resultA.lastPC & 0xFFFFFF) !== HALT_IDLE;
const bRunaway = (resultB.lastPC & 0xFFFFFF) !== HALT_IDLE;
console.log('  Run A runaway: ' + aRunaway);
console.log('  Run B runaway: ' + bRunaway);

if (aRunaway && !bRunaway) {
  console.log('  CONFIRMED: post-paint snapshot causes runaway, post-wipe snapshot fixes it');
  console.log('  ROOT CAUSE: state difference between snapshots (see comparison above)');
} else if (!aRunaway && !bRunaway) {
  console.log('  BOTH NORMAL: neither snapshot causes runaway at 200K steps');
} else {
  console.log('  UNEXPECTED: check reports above');
}

console.log('\nphase608: done');
