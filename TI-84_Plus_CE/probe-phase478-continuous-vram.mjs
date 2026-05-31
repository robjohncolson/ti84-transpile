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

// -- Stage 1: z80 boot --
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// -- Stage 2: kernel init --
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// -- Stage 3: post-init --
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

// -- FULL MODE SETUP: All home-screen values --
// Key injection
mem[0xD00587] = 0x09;         // ENTER key in buffer
mem[0xD00080] |= 0x18;        // bits 3+4 (key available + cursor update enable)

// Mode variables (from session 476 write site map)
mem[0xD00824] = 0x48;          // 'H' = Home mode
mem[0xD007E0] = 0x48;          // 'H' = Home mode
mem[0xD14091] = 0x01;          // mode active flag
mem[0xD00000] = 0x01;          // display counter nonzero -> display update path fires

// Cursor/display state
mem[0xD00092] = 0x16;          // bits 1,2,4 set (cursor active + edit mode + display cursor)
mem[0xD0009D] = 0x00;          // display gate clear
mem[0xD00089] |= 0x10;         // bit 4 -> 0x03D1BE proceeds
mem[0xD000C6] = 0x01;          // single-shot display flag
mem[0xD000B4] = 0x01;          // display path enable

// Cursor position (top-left)
mem[0xD0058C] = 0x00;          // cursor col = 0
mem[0xD0058E] = 0x00;          // cursor row = 0

// OS state
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;

// CPU reset for main run
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;

// Stack: return to 0x02FDBE (event loop head) for looping
mem[cpu.sp] = 0xBE; mem[cpu.sp + 1] = 0xFD; mem[cpu.sp + 2] = 0x02;

// -- Tracking --
const trackedPcs = [
  0x030014,  // cursor activation: SET 6,(IY+0x12)
  0x030018,  // cursor activation: SET 4,(IY+0x12)
  0x03001C,  // cursor activation: SET 7,(IY+0x1F)
  0x03002E,  // key wait setup (entry point)
  0x030052,  // key wait loop
  0x02FDBE,  // event loop head
  0x02FDD8,  // display update path
  0x03D1BE,  // BIT 4,(IY+0x09) check
  0x030078,  // display update call
  0x040D11,  // cursor timing
  0x02FE21,  // XOR A; RET
  0x0059C6,  // pixel write function
  0x005A75,  // pixel write helper
  0x04E950,  // cursor position save/update
  0x02FE89,  // key handler chain
  0x030300,  // cursor/display prep
  0x03030E,  // cursor sentinel dispatch
  0x09EF44,  // heavy loop (screen fill helper)
  0x03013A,  // idle handler
];

const retPcs = new Set([0x02FE88, 0x02FDE5, 0x02FE21]);
const trackedPcSet = new Set(trackedPcs);
const hitCounts = Object.fromEntries(trackedPcs.map(pc => [hex(pc, 6), 0]));

const traceLog = [];
const MAX_TRACE_ENTRIES = 300;

// Snapshot VRAM before run
const beforeVRAM = mem.slice(VRAM_START, VRAM_END);

// Track D00092 changes
const d00092Log = [];

console.log('Pre-run D00092:', hex(mem[0xD00092]));
console.log('Pre-run D00089:', hex(mem[0xD00089]));
console.log('Pre-run D00000:', hex(mem[0xD00000]));
console.log('Pre-run D0058C (cursor col):', hex(mem[0xD0058C]));
console.log('Pre-run D0058E (cursor row):', hex(mem[0xD0058E]));

let prevD00092 = mem[0xD00092];

const writeLoopReturn = () => {
  const sp = cpu.sp & 0xFFFFFF;
  mem[sp] = 0xBE;
  mem[(sp + 1) & 0xFFFFFF] = 0xFD;
  mem[(sp + 2) & 0xFFFFFF] = 0x02;
};

function onBlock(pc, mode, meta, steps) {
  const npc = pc & 0xFFFFFF;

  if (trackedPcSet.has(npc)) {
    const key = hex(npc, 6);
    hitCounts[key]++;
    if (traceLog.length < MAX_TRACE_ENTRIES) {
      traceLog.push({
        pc: key, hit: hitCounts[key],
        a: hex(cpu._a >> 24), f: hex(cpu.f),
        hl: hex(cpu._hl, 6), sp: hex(cpu.sp, 6),
        step: steps,
      });
    }
  }

  // Track D00092 changes
  const curD00092 = mem[0xD00092];
  if (curD00092 !== prevD00092 && d00092Log.length < 50) {
    d00092Log.push({ step: steps, pc: hex(npc, 6), from: hex(prevD00092), to: hex(curD00092) });
    prevD00092 = curD00092;
  }

  if (npc === 0x02FDBE) {
    mem[0xD000C6] |= 0x01;
  }

  if (retPcs.has(npc)) {
    cpu.sp = STACK_RESET_TOP - 3;
    writeLoopReturn();
  }
}

// -- Run from 0x03002E (key wait setup path, NOT 0x02FDBE) --
console.log('\nRunning from 0x03002E with FULL mode setup and continuous VRAM refresh...');
const result = executor.runFrom(0x03002E, 'adl', {
  maxSteps: 1000000,
  maxLoopIterations: 100000,
  diHaltBypass: true,
  onBlock,
});

// -- VRAM diff --
let changedVRAMCount = 0;
const changedVRAM = [];
for (let offset = 0; offset < beforeVRAM.length; offset++) {
  if (beforeVRAM[offset] !== mem[VRAM_START + offset]) {
    changedVRAMCount++;
    if (changedVRAM.length < 30) {
      changedVRAM.push({
        addr: hex(VRAM_START + offset, 6),
        before: hex(beforeVRAM[offset]),
        after: hex(mem[VRAM_START + offset]),
      });
    }
  }
}

// -- Output --
console.log('\n=== Hit counts ===');
for (const [pc, count] of Object.entries(hitCounts)) {
  if (count > 0) console.log(`  ${pc}: ${count}`);
}

console.log('\n=== D00092 changes ===');
for (const entry of d00092Log) {
  console.log(`  step ${entry.step} at ${entry.pc}: ${entry.from} -> ${entry.to}`);
}
console.log('Final D00092:', hex(mem[0xD00092]));

console.log('\n=== VRAM changes ===');
console.log(`Total VRAM bytes changed: ${changedVRAMCount}`);
for (const v of changedVRAM) {
  console.log(`  ${v.addr}: ${v.before} -> ${v.after}`);
}

console.log('\n=== First 50 trace entries ===');
for (const t of traceLog.slice(0, 50)) {
  console.log(`  step ${t.step}: ${t.pc} #${t.hit} A=${t.a} F=${t.f} HL=${t.hl} SP=${t.sp}`);
}

console.log('\n=== Post-run state ===');
console.log('D00000:', hex(mem[0xD00000]));
console.log('D00080:', hex(mem[0xD00080]));
console.log('D00089:', hex(mem[0xD00089]));
console.log('D00092:', hex(mem[0xD00092]));
console.log('D0009D:', hex(mem[0xD0009D]));
console.log('D000B4:', hex(mem[0xD000B4]));
console.log('D000C6:', hex(mem[0xD000C6]));
console.log('D0058C:', hex(mem[0xD0058C]));
console.log('D0058E:', hex(mem[0xD0058E]));
console.log('D00591 (24-bit):', hex(mem[0xD00591] | (mem[0xD00592] << 8) | (mem[0xD00593] << 16), 6));
console.log('D0059C (24-bit):', hex(mem[0xD0059C] | (mem[0xD0059D] << 8) | (mem[0xD0059E] << 16), 6));
console.log('D00824:', hex(mem[0xD00824]));
console.log('D007E0:', hex(mem[0xD007E0]));
console.log('D14091:', hex(mem[0xD14091]));
console.log('Final SP:', hex(cpu.sp, 6));

console.log('\nResult:', { steps: result.steps, reason: result.reason, lastPC: hex(result.lastPC, 6) });
console.log('Done.');
