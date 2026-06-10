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

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// Key sequence: internal key codes (from scancode-translate.js / probe-phase212)
// '2' = 0x90, '3' = 0x91, '+' = 0x70, '5' = 0x93, '1' = 0x8F
const KEY_SEQUENCE = [
  { key: '2', scan: 0x90 },
  { key: '3', scan: 0x91 },
  { key: '+', scan: 0x70 },
  { key: '5', scan: 0x93 },
  { key: '1', scan: 0x8F },
];

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase612: multi-key cxMain dispatch test (5 keys)');

// ========== Cold boot (exact copy from probe-610) ==========
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

// ========== Key loop ==========
const results = [];

for (let ki = 0; ki < KEY_SEQUENCE.length; ki++) {
  const entry = KEY_SEQUENCE[ki];
  const keyNum = ki + 1;
  console.log('\nphase612: === Key ' + keyNum + '/' + KEY_SEQUENCE.length + ': key=' + entry.key + ' (scan=' + hex(entry.scan, 2) + ') ===');

  // Re-arm D007CA from ROM descriptor (21 bytes from ROM[0x0585D3])
  for (let i = 0; i < 21; i++) {
    mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  }
  mem[0xD0008D] = romBytes[0x0585D3 + 21];

  // Press the key
  pressKey(mem, entry.scan);

  // Reset CPU state
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  let cxMainHit = false;
  let vramPeak = 0;
  let blockCount = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 350_000,
    maxLoopIterations: 350_000,
    onBlock(pc) {
      if ((pc & 0xFFFFFF) === CX_MAIN) cxMainHit = true;
      blockCount++;
      if (blockCount % 5000 === 0) {
        const v = countVRAM(mem);
        if (v > vramPeak) vramPeak = v;
      }
    },
  });

  // Final VRAM sample
  const vFinal = countVRAM(mem);
  if (vFinal > vramPeak) vramPeak = vFinal;

  const steps = result.steps ?? 'unknown';
  const halted = cpu.halted;
  const lastPC = result.lastPc & 0xFFFFFF;

  console.log('phase612: key' + keyNum + ' steps=' + steps + ' halted=' + halted + ' lastPC=' + hex(lastPC) + ' cxMain=' + cxMainHit + ' vram=' + vramPeak + 'px');

  const pass = halted && cxMainHit && vramPeak > 100 && typeof steps === 'number' && steps < 350_000;

  results.push({
    key: entry.key,
    scan: entry.scan,
    steps,
    halted,
    cxMain: cxMainHit,
    vramPeak,
    pass,
  });
}

// ========== Summary ==========
console.log('\n' + '='.repeat(70));
console.log('phase612: SUMMARY');
console.log('Key | Scan   | Steps  | Halted | cxMain | VRAM Peak | Status');
console.log('----|--------|--------|--------|--------|-----------|-------');
for (const r of results) {
  const scanStr = hex(r.scan, 2).padEnd(6);
  const stepsStr = String(r.steps).padEnd(6);
  const haltStr = String(r.halted).padEnd(6);
  const cxStr = String(r.cxMain).padEnd(6);
  const vramStr = (r.vramPeak + 'px').padStart(7);
  const status = r.pass ? 'PASS' : 'FAIL';
  console.log(r.key.padEnd(3) + ' | ' + scanStr + ' | ' + stepsStr + ' | ' + haltStr + ' | ' + cxStr + ' | ' + vramStr + '   | ' + status);
}

const allPass = results.every(r => r.pass);
if (allPass) {
  console.log('phase612: ALL PASS -- all ' + KEY_SEQUENCE.length + ' keys: halt + cxMain + VRAM > 100px + under budget');
} else {
  const passCount = results.filter(r => r.pass).length;
  console.log('phase612: PARTIAL -- ' + passCount + '/' + KEY_SEQUENCE.length + ' keys passed');
}

console.log('phase612: done');
process.exit(allPass ? 0 : 1);
