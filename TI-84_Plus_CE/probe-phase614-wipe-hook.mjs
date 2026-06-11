import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

const HALT_IDLE = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;

// ========== Setup ==========
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase614: wipe interception hook probe');

// ========== Cold boot (exact copy from probe-612) ==========
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
console.log('phase614: init done');

// ========== Paint ==========
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase614: paint done');

// ========== Press key '2' ==========
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] = mem[0xD0009F] | 0x20;
mem[0xD00080] = mem[0xD00080] | 0x08;
console.log('phase614: key 2 pressed (scan=0x90)');

// ========== Re-arm D007CA from ROM descriptor ==========
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
mem[0xD0008D] = romBytes[0x0585D3 + 21];

// ========== Reset CPU state and push halt return ==========
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

// ========== Run with wipe interception hook ==========
let interceptCount = 0;
const returnAddresses = new Map();

console.log('phase614: running outer loop with wipe intercept hook on PC=0x001853');

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc, mode, meta, steps) {
    if ((pc & 0xFFFFFF) === 0x001853) {
      const sp = cpu.sp & 0xFFFFFF;
      const ret = mem[sp] | (mem[sp + 1] << 8) | (mem[sp + 2] << 16);
      interceptCount++;
      returnAddresses.set(ret, (returnAddresses.get(ret) || 0) + 1);
      console.log(`WIPE INTERCEPT: PC=0x001853, return=${hex(ret)}, step=${steps}`);
      if (ret === 0x000862) {
        console.log('SECOND WIPE DETECTED — would skip');
      }
    }
  },
});

const totalSteps = result.steps ?? 'unknown';
const halted = cpu.halted;
console.log('phase614: dispatch done steps=' + totalSteps + ' halted=' + halted);

// ========== Summary report ==========
console.log('\n' + '='.repeat(70));
console.log('phase614: WIPE HOOK REPORT');
console.log('Total 0x001853 hits: ' + interceptCount);

if (returnAddresses.size > 0) {
  console.log('Return addresses seen:');
  for (const [addr, count] of returnAddresses) {
    console.log('  ' + hex(addr) + ' x' + count);
  }
} else {
  console.log('Return addresses seen: (none)');
}

const sawFirst = returnAddresses.has(0x0013E8);
const sawSecond = returnAddresses.has(0x000862);

if (sawFirst && sawSecond) {
  console.log('Distinguishes callers: YES — both 0x0013E8 and 0x000862 seen');
} else if (sawFirst) {
  console.log('Distinguishes callers: PARTIAL — only first caller 0x0013E8 seen');
} else if (sawSecond) {
  console.log('Distinguishes callers: PARTIAL — only second caller 0x000862 seen');
} else {
  console.log('Distinguishes callers: NO — neither expected caller seen');
  if (returnAddresses.size > 0) {
    console.log('  (unexpected return addresses — callers may differ from session-612 findings)');
  }
}

console.log('\nValue assessment:');
console.log('  The onBlock hook can classify wipe calls by return address at zero');
console.log('  runtime cost (no VRAM copy). If both callers appear, the second wipe');
console.log('  (return=0x000862) can be skipped to preserve VRAM. However, this is');
console.log('  narrower than VRAM snapshot/restore — it only covers the 0x001853 call');
console.log('  path and requires precise skip semantics to avoid corrupting CPU state.');
console.log('  VRAM snapshot/restore is more robust as a general solution.');

console.log('\nphase614: done');
process.exit(0);
