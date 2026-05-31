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

// Stage 1
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 2
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 3
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

// Key injection
mem[0xD00587] = 0x09;       // ENTER key scan code
mem[0xD00080] |= 0x18;      // bit 3 + bit 4

// Mode variables
mem[0xD14091] = 1;
mem[0xD00824] = 0x48;        // mode = 'H' (home screen)
mem[0xD007E0] = 0x48;

// Display state - THE NEW VARIABLES BEING TESTED
mem[0xD00000] = 0x01;        // nonzero -> display update path fires
mem[0xD00092] |= 0x10;       // bit 4 -> cursor active
mem[0xD00591] = 0x00;        // cursor address low = D40000
mem[0xD00592] = 0x00;        // cursor address mid
mem[0xD00593] = 0xD4;        // cursor address high -> points to VRAM start

mem[0xD000B4] |= 0x01;      // display path enable
mem[0xD000C6] |= 0x01;      // CALL NZ 0x030078 enable

// OS state
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;

// D0058C/D0058E for cursor position (set to small values)
mem[0xD0058C] = 0x01;        // cursor row/col
mem[0xD0058E] = 0x01;

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
// Stack with return to event loop head
mem[cpu.sp] = 0xBE; mem[cpu.sp+1] = 0xFD; mem[cpu.sp+2] = 0x02;

const trackedPcs = [
  0x02FDBE,
  0x02FDD8,
  0x02FE89,
  0x03FA09,
  0x030300,
  0x040D11,
  0x0059C6,
  0x030078,
  0x03D1BE,
  0x030202,
  0x04E950,
  0x02FEA7,
  0x03030E,
  0x02FE73,
];
const retPcs = new Set([0x02FE88, 0x02FDE5, 0x02FE22]);
const hitCounts = Object.fromEntries(trackedPcs.map(pc => [`0x${pc.toString(16).toUpperCase().padStart(6, '0')}`, 0]));
const beforeVRAM = mem.slice(VRAM_START, VRAM_END);
const trackedPcSet = new Set(trackedPcs);

const writeLoopReturn = () => {
  const sp = cpu.sp & 0xFFFFFF;
  mem[sp] = 0xBE;
  mem[(sp + 1) & 0xFFFFFF] = 0xFD;
  mem[(sp + 2) & 0xFFFFFF] = 0x02;
};

function onBlock(pc, mode, meta, steps) {
  const normalizedPc = pc & 0xFFFFFF;
  if (trackedPcSet.has(normalizedPc)) {
    hitCounts[`0x${normalizedPc.toString(16).toUpperCase().padStart(6, '0')}`]++;
  }
  if (retPcs.has(normalizedPc)) {
    writeLoopReturn();
  }
}

const idleResult = executor.runFrom(0x02FDBE, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});

const changedVRAM = [];
let changedVRAMCount = 0;
for (let offset = 0; offset < beforeVRAM.length; offset++) {
  const before = beforeVRAM[offset];
  const after = mem[VRAM_START + offset];
  if (before !== after) {
    changedVRAMCount++;
    if (changedVRAM.length < 20) {
      changedVRAM.push({
        address: `0x${(VRAM_START + offset).toString(16).toUpperCase().padStart(6, '0')}`,
        before: `0x${before.toString(16).toUpperCase().padStart(2, '0')}`,
        after: `0x${after.toString(16).toUpperCase().padStart(2, '0')}`,
      });
    }
  }
}

const cursorAddress = mem[0xD00591] | (mem[0xD00592] << 8) | (mem[0xD00593] << 16);
const finalState = {
  D00000: `0x${mem[0xD00000].toString(16).toUpperCase().padStart(2, '0')}`,
  D00092: `0x${mem[0xD00092].toString(16).toUpperCase().padStart(2, '0')}`,
  D00591: `0x${mem[0xD00591].toString(16).toUpperCase().padStart(2, '0')}`,
  D00592: `0x${mem[0xD00592].toString(16).toUpperCase().padStart(2, '0')}`,
  D00593: `0x${mem[0xD00593].toString(16).toUpperCase().padStart(2, '0')}`,
  cursorAddress: `0x${cursorAddress.toString(16).toUpperCase().padStart(6, '0')}`,
  D0009D: `0x${mem[0xD0009D].toString(16).toUpperCase().padStart(2, '0')}`,
  D00080: `0x${mem[0xD00080].toString(16).toUpperCase().padStart(2, '0')}`,
};

const summary = {
  bootResult,
  kernelResult,
  postInitResult,
  idleResult,
  hitCounts,
  changedVRAMCount,
  firstChangedVRAM: changedVRAM,
  finalState,
};

console.log('Hit counts:');
for (const [pc, count] of Object.entries(hitCounts)) {
  console.log(`  ${pc}: ${count}`);
}

console.log(`VRAM bytes changed: ${changedVRAMCount}`);
if (changedVRAM.length > 0) {
  console.log('First changed VRAM addresses:');
  for (const change of changedVRAM) {
    console.log(`  ${change.address}: ${change.before} -> ${change.after}`);
  }
} else {
  console.log('First changed VRAM addresses: none');
}

console.log('Final state:');
for (const [name, value] of Object.entries(finalState)) {
  console.log(`  ${name}: ${value}`);
}

console.log('JSON summary:');
console.log(JSON.stringify(summary, null, 2));
