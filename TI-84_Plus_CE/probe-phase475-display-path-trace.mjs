#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: true, timerInterval: 500 });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 2) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

// ── Stage 1: z80 boot ──
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// ── Stage 2: kernel init ──
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// ── Stage 3: post-init ──
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

// ── State setup ──
// Key injection
mem[0xD00587] = 0x09;
mem[0xD00080] |= 0x18;

// Mode variables
mem[0xD14091] = 1;
mem[0xD00824] = 0x48;
mem[0xD007E0] = 0x48;

// Display state — CRITICAL FLAGS
mem[0xD00000] = 0x01;        // nonzero → display update path fires
mem[0xD00092] |= 0x10;       // bit 4 → cursor active
mem[0xD000B4] |= 0x01;       // display path enable
mem[0xD000C6] |= 0x01;       // bit 0 set → CALL NZ 0x030078 enable

// KEY CHANGE: D00089 bit 4 SET so 0x03D1BE proceeds past BIT 4 check
mem[0xD00089] |= 0x10;

// OS state
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;

// CPU reset
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
// Stack: return to 0x02FDBE (event loop head)
mem[cpu.sp] = 0xBE; mem[cpu.sp + 1] = 0xFD; mem[cpu.sp + 2] = 0x02;

// ── Tracking setup ──
const trackedPcs = [
  0x02FDBE,  // event loop head
  0x02FDD8,  // display update path (D00000 nonzero)
  0x03D1BE,  // BIT 4,(IY+0x09) check
  0x030078,  // display update call (after BIT 0,(IY+0x46))
  0x030300,  // display subroutine
  0x040D11,  // another display call
  0x03FA09,  // display helper
  0x0059C6,  // system call
  0x02FE89,  // after display path
  0x03030E,  // idle path (D00000 == 0)
  0x02FE73,  // pre-return path
  0x030202,  // display subroutine
  0x04E950,  // display helper
  0x02FEA7,  // post-display
];
const retPcs = new Set([0x02FE88, 0x02FDE5, 0x02FE22]);
const trackedPcSet = new Set(trackedPcs);
const hitCounts = Object.fromEntries(trackedPcs.map(pc => [hex(pc, 6), 0]));

// Trace log: capture first N visits to key PCs with register snapshots
const traceLog = [];
const MAX_TRACE_ENTRIES = 200;

// Track the sequence of PCs around 0x03D1BE to understand control flow after it returns
const postCallTrace = [];
let inPostCallCapture = false;
let postCallStepsLeft = 0;
const MAX_POST_CALL_CAPTURES = 5;
let postCallCaptureCount = 0;

const beforeVRAM = mem.slice(VRAM_START, VRAM_END);

// Snapshot key memory before run
const preRunState = {
  D00000: hex(mem[0xD00000]),
  D00080: hex(mem[0xD00080]),
  D00089: hex(mem[0xD00089]),
  D000B4: hex(mem[0xD000B4]),
  D000C6: hex(mem[0xD000C6]),
  D00092: hex(mem[0xD00092]),
  D00591_ptr: hex(mem[0xD00591] | (mem[0xD00592] << 8) | (mem[0xD00593] << 16), 6),
};
console.log('Pre-run state:', preRunState);

// Read ROM bytes around the caller site (0x02FDD8 region) to understand post-CALL flow
const callerBytes = [];
for (let i = 0; i < 64; i++) {
  callerBytes.push(hex(mem[0x02FDD0 + i]));
}
console.log('ROM bytes at 0x02FDD0 (64 bytes):', callerBytes.join(' '));

// Also read 0x03D1BE region
const d1beBytes = [];
for (let i = 0; i < 32; i++) {
  d1beBytes.push(hex(mem[0x03D1BE + i]));
}
console.log('ROM bytes at 0x03D1BE (32 bytes):', d1beBytes.join(' '));

const writeLoopReturn = () => {
  const sp = cpu.sp & 0xFFFFFF;
  mem[sp] = 0xBE;
  mem[(sp + 1) & 0xFFFFFF] = 0xFD;
  mem[(sp + 2) & 0xFFFFFF] = 0x02;
};

function onBlock(pc, mode, meta, steps) {
  const normalizedPc = pc & 0xFFFFFF;

  // Track hits
  if (trackedPcSet.has(normalizedPc)) {
    const key = hex(normalizedPc, 6);
    hitCounts[key]++;

    // Log first visits with register state
    if (traceLog.length < MAX_TRACE_ENTRIES) {
      traceLog.push({
        pc: key,
        hit: hitCounts[key],
        a: hex(cpu._a >> 24),
        f: hex(cpu.f),
        hl: hex(cpu._hl, 6),
        sp: hex(cpu.sp, 6),
        iy: hex(cpu._iy, 6),
        step: steps,
      });
    }
  }

  // After 0x03D1BE is hit, capture the next N block PCs to trace control flow
  if (normalizedPc === 0x03D1BE && postCallCaptureCount < MAX_POST_CALL_CAPTURES) {
    inPostCallCapture = true;
    postCallStepsLeft = 30;
    postCallCaptureCount++;
    postCallTrace.push({ marker: `=== CALL 0x03D1BE (visit ${postCallCaptureCount}) ===` });
    postCallTrace.push({
      pc: hex(normalizedPc, 6),
      a: hex(cpu._a >> 24),
      f: hex(cpu.f),
      hl: hex(cpu._hl, 6),
      D00089: hex(mem[0xD00089]),
      D000C6: hex(mem[0xD000C6]),
    });
  } else if (inPostCallCapture) {
    postCallStepsLeft--;
    postCallTrace.push({
      pc: hex(normalizedPc, 6),
      a: hex(cpu._a >> 24),
      f: hex(cpu.f),
      hl: hex(cpu._hl, 6),
    });
    if (postCallStepsLeft <= 0) {
      inPostCallCapture = false;
    }
  }

  // Loop return injection
  if (retPcs.has(normalizedPc)) {
    writeLoopReturn();
  }
}

// ── Run ──
console.log('\nRunning from 0x02FDBE with D00089 bit 4 SET...');
const idleResult = executor.runFrom(0x02FDBE, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});

// ── VRAM diff ──
const changedVRAM = [];
let changedVRAMCount = 0;
for (let offset = 0; offset < beforeVRAM.length; offset++) {
  const before = beforeVRAM[offset];
  const after = mem[VRAM_START + offset];
  if (before !== after) {
    changedVRAMCount++;
    if (changedVRAM.length < 20) {
      changedVRAM.push({
        address: hex(VRAM_START + offset, 6),
        before: hex(before),
        after: hex(after),
      });
    }
  }
}

// ── Final state ──
const cursorAddress = mem[0xD00591] | (mem[0xD00592] << 8) | (mem[0xD00593] << 16);
const finalState = {
  D00000: hex(mem[0xD00000]),
  D00080: hex(mem[0xD00080]),
  D00089: hex(mem[0xD00089]),
  D00092: hex(mem[0xD00092]),
  D000B4: hex(mem[0xD000B4]),
  D000C6: hex(mem[0xD000C6]),
  D0009D: hex(mem[0xD0009D]),
  D00591_ptr: hex(cursorAddress, 6),
  D00824: hex(mem[0xD00824]),
  D007E0: hex(mem[0xD007E0]),
  D00088: hex(mem[0xD00088]),
  D14091: hex(mem[0xD14091]),
};

// ── Output ──
console.log('\n=== Hit Counts ===');
for (const [pc, count] of Object.entries(hitCounts)) {
  console.log(`  ${pc}: ${count}`);
}

console.log(`\n=== VRAM ===`);
console.log(`VRAM bytes changed: ${changedVRAMCount}`);
if (changedVRAM.length > 0) {
  console.log('First changed VRAM addresses:');
  for (const change of changedVRAM) {
    console.log(`  ${change.address}: ${change.before} -> ${change.after}`);
  }
} else {
  console.log('No VRAM changes detected.');
}

console.log('\n=== Post-CALL 0x03D1BE Trace ===');
for (const entry of postCallTrace) {
  if (entry.marker) {
    console.log(entry.marker);
  } else {
    console.log(`  PC=${entry.pc} A=${entry.a} F=${entry.f} HL=${entry.hl}${entry.D00089 ? ` D00089=${entry.D00089}` : ''}${entry.D000C6 ? ` D000C6=${entry.D000C6}` : ''}`);
  }
}

console.log('\n=== Final State ===');
for (const [name, value] of Object.entries(finalState)) {
  console.log(`  ${name}: ${value}`);
}

console.log('\n=== First 50 Trace Entries ===');
for (const entry of traceLog.slice(0, 50)) {
  console.log(`  PC=${entry.pc} hit=${entry.hit} A=${entry.a} F=${entry.f} HL=${entry.hl} SP=${entry.sp} step=${entry.step}`);
}

console.log('\n=== JSON Summary ===');
const summary = {
  probe: 'phase475-display-path-trace',
  purpose: 'Trace display update path with D00089 bit 4 SET to see if 0x03D1BE proceeds and 0x030078 gets reached',
  bootResult,
  kernelResult,
  postInitResult,
  idleResult,
  hitCounts,
  changedVRAMCount,
  firstChangedVRAM: changedVRAM,
  finalState,
  preRunState,
  postCallTrace: postCallTrace.slice(0, 50),
  traceLogSample: traceLog.slice(0, 30),
};
console.log(JSON.stringify(summary, null, 2));
