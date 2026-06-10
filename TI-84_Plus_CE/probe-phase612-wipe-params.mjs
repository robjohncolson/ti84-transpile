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
const CX_MAIN = 0x0585e9;
const BULK_WIPE = 0x0018f8;

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function hex8(value) {
  return hex(value & 0xff, 2);
}

function hex16(value) {
  return hex(value & 0xffff, 4);
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

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// ========== Load ROM + transpiled blocks ==========
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase612: BULK_WIPE parameter capture during key processing');

// ========== Cold boot (copied from probe-611) ==========
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

// ========== Init ==========
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase612: init done');

// ========== Paint ==========
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase612: paint done vram=' + vramAfterPaint + 'px');

// ========== Key: '2' / 0x90 with BULK_WIPE register snapshots ==========
console.log('\nphase612: === Key: key=2 (scan=0x90) — capturing registers at each 0x0018F8 hit ===');

pressKey(mem, 0x90);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let blockCount = 0;
const hits = [];

const keyResult = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    blockCount++;
    const maskedPC = pc & 0xFFFFFF;

    if (maskedPC === BULK_WIPE) {
      const sp = cpu.sp & 0xFFFFFF;
      const retAddr = (mem[sp] | (mem[sp + 1] << 8) | (mem[sp + 2] << 16)) >>> 0;
      const hit = {
        hitNum: hits.length + 1,
        blockCount,
        a: cpu.a & 0xFF,
        bc: cpu._bc & 0xFFFFFF,
        de: cpu._de & 0xFFFFFF,
        hl: cpu._hl & 0xFFFFFF,
        ix: cpu._ix & 0xFFFFFF,
        sp: sp,
        returnAddress: retAddr,
        iy0: mem[0xD00080],
        iy35: mem[0xD000A3],
        iy50: mem[0xD000B2],
        vram: countVRAM(mem),
      };
      hits.push(hit);

      console.log('\n[BULK_WIPE hit #' + hit.hitNum + '] block=' + hit.blockCount);
      console.log('  A=' + hex8(hit.a) + ' BC=' + hex(hit.bc) + ' DE=' + hex(hit.de) + ' HL=' + hex(hit.hl));
      console.log('  IX=' + hex(hit.ix) + ' SP=' + hex(hit.sp));
      console.log('  return address=' + hex(hit.returnAddress));
      console.log('  IY flags: [IY+0]=' + hex8(hit.iy0) + ' [IY+35]=' + hex8(hit.iy35) + ' [IY+50]=' + hex8(hit.iy50));
      console.log('  VRAM=' + hit.vram + 'px');
    }
  },
});

const finalVram = countVRAM(mem);
const keySteps = keyResult.steps ?? 'unknown';
const keyHaltPC = keyResult.lastPc & 0xFFFFFF;

// ========== Comparison table ==========
console.log('\n' + '='.repeat(70));
console.log('phase612: BULK_WIPE comparison table (' + hits.length + ' hits)');
console.log('='.repeat(70));

if (hits.length === 0) {
  console.log('  No 0x0018F8 hits detected.');
} else if (hits.length === 1) {
  console.log('  Only 1 hit — cannot compare.');
} else {
  // Header
  const fields = ['block', 'A', 'BC', 'DE', 'HL', 'IX', 'SP', 'retAddr', '[IY+0]', '[IY+35]', '[IY+50]', 'VRAM'];
  console.log('  ' + 'Field'.padEnd(12) + hits.map((h, i) => ('Hit #' + (i + 1)).padEnd(14)).join('') + 'Same?');
  console.log('  ' + '-'.repeat(12 + hits.length * 14 + 6));

  function row(label, extractFn, fmtFn) {
    const vals = hits.map(extractFn);
    const allSame = vals.every(v => v === vals[0]);
    const formatted = vals.map(v => fmtFn(v).padEnd(14)).join('');
    console.log('  ' + label.padEnd(12) + formatted + (allSame ? 'YES' : 'NO ***'));
  }

  row('block',    h => h.blockCount, v => String(v));
  row('A',        h => h.a,          v => hex8(v));
  row('BC',       h => h.bc,         v => hex(v));
  row('DE',       h => h.de,         v => hex(v));
  row('HL',       h => h.hl,         v => hex(v));
  row('IX',       h => h.ix,         v => hex(v));
  row('SP',       h => h.sp,         v => hex(v));
  row('retAddr',  h => h.returnAddress, v => hex(v));
  row('[IY+0]',   h => h.iy0,        v => hex8(v));
  row('[IY+35]',  h => h.iy35,       v => hex8(v));
  row('[IY+50]',  h => h.iy50,       v => hex8(v));
  row('VRAM',     h => h.vram,       v => v + 'px');
}

console.log('\nphase612: key processing ended at step ' + keySteps + ' lastPC=' + hex(keyHaltPC) + ' finalVRAM=' + finalVram + 'px');

if (hits.length >= 2) {
  const sameRet = hits[0].returnAddress === hits[1].returnAddress;
  console.log('\n>>> KEY FINDING: Return addresses between hit 1 and hit 2 are ' + (sameRet ? 'THE SAME (' + hex(hits[0].returnAddress) + ')' : 'DIFFERENT (' + hex(hits[0].returnAddress) + ' vs ' + hex(hits[1].returnAddress) + ')'));
  console.log('>>> This means the two wipes come from ' + (sameRet ? 'the SAME caller' : 'DIFFERENT callers'));
}

console.log('\nphase612: done');
