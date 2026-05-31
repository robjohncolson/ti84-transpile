/**
 * probe-phase481-combined-paths.mjs
 * Tests combined idle+display paths by alternating D00000
 */
import { readFileSync } from "node:fs";
import { createExecutor } from "./cpu-runtime.js";
import { createPeripheralBus } from "./peripherals.js";
import { PRELIFTED_BLOCKS } from "./ROM.transpiled.js";

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xd1a87e;
const EVENT_LOOP_HEAD = 0x02fdbe;
const RET_POINTS = new Set([0x02fe88, 0x02fde5, 0x02fe21]);

const mem = new Uint8Array(MEM_SIZE);
const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
mem.set(rom.subarray(0, MEM_SIZE), 0);
const peripherals = createPeripheralBus();
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

function runFrom(pc, steps, onBlock) {
  return executor.runFrom(pc, "adl", { maxSteps: steps, maxLoopIterations: 200000, onBlock });
}
const hex = (v, w = 6) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(w, "0");

const TRACKED_PCS = [
  0x02fdbe, 0x03013a, 0x030202, 0x04e950, 0x09ef44,
  0x0059c6, 0x005a75, 0x030078, 0x03d1be, 0x040d11,
  0x03030e, 0x02fd99, 0x030300,
];

function setupModeState() {
  mem[0xd00824] = 0x48;
  mem[0xd007e0] = 0x48;
  mem[0xd14091] = 0x01;
  mem[0xd00092] = 0x16;
  mem[0xd00089] |= 0x10;
  mem[0xd000c6] = 0x01;
  mem[0xd000b4] = 0x01;
  mem[0xd00080] |= 0x18;
  mem[0xd00595] = 0x00;
  mem[0xd00596] = 0x00;
  mem[0xd0058b] = 0x70;
  executor.cpu.mbase = 0xd0;
  executor.cpu._iy = 0xd00080;
  executor.cpu.sp = STACK_RESET_TOP;
}

// 3-stage boot
console.log("=== 3-STAGE BOOT ===");
runFrom(0x080000, 150000);
runFrom(0x0802b2, 150000);
runFrom(0x08c331, 150000);
console.log("Boot complete.");

// Save boot snapshot
const bootSnapshot = mem.slice();

// ============ EXPERIMENT 1: D00000=1 first, then switch to 0 after 0x030078 fires ============
console.log("\n====== EXPERIMENT 1: D00000=1 -> 0 after 0x030078 fires ======");
mem.set(bootSnapshot);
setupModeState();
mem[0xd00000] = 0x01;  // Display path first

let hits1 = new Map(TRACKED_PCS.map(pc => [pc, 0]));
let loopCount1 = 0;
let switched1 = false;
let vramBefore1 = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

runFrom(EVENT_LOOP_HEAD, 500000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits1.has(blockPc)) hits1.set(blockPc, hits1.get(blockPc) + 1);

  if (blockPc === EVENT_LOOP_HEAD) {
    loopCount1++;
    mem[0xd000c6] |= 0x01;
    mem[0xd00092] |= 0x16;
    executor.cpu.sp = STACK_RESET_TOP - 3;
  }

  // Switch to idle after 0x030078 fires
  if (blockPc === 0x030078 && !switched1) {
    switched1 = true;
    mem[0xd00000] = 0x00;
    console.log(`  Switched D00000 to 0 at iteration ${loopCount1} (0x030078 fired)`);
  }

  if (RET_POINTS.has(blockPc)) return "stop";
});

let diff1 = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore1[i]) diff1++;
}
console.log(`  Loops: ${loopCount1}, VRAM bytes changed: ${diff1}`);
console.log(`  Hit counts:`);
for (const [pc, count] of [...hits1.entries()].filter(([_, c]) => c > 0).sort((a, b) => a[0] - b[0])) {
  console.log(`    ${hex(pc)}: ${count}`);
}

// ============ EXPERIMENT 2: D00000=0 first 200K steps, then switch to 1 ============
console.log("\n====== EXPERIMENT 2: D00000=0 (200K) -> 1 (300K) ======");
mem.set(bootSnapshot);
setupModeState();
mem[0xd00000] = 0x00;  // Idle first

let hits2 = new Map(TRACKED_PCS.map(pc => [pc, 0]));
let loopCount2 = 0;
let vramBefore2 = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);
let totalSteps2 = 0;

// Phase 1: idle for 200K steps
runFrom(EVENT_LOOP_HEAD, 200000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits2.has(blockPc)) hits2.set(blockPc, hits2.get(blockPc) + 1);
  if (blockPc === EVENT_LOOP_HEAD) {
    loopCount2++;
    mem[0xd000c6] |= 0x01;
    mem[0xd00092] |= 0x16;
    executor.cpu.sp = STACK_RESET_TOP - 3;
  }
  if (RET_POINTS.has(blockPc)) return "stop";
});

let midDiff2 = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore2[i]) midDiff2++;
}
console.log(`  After idle phase: loops=${loopCount2}, VRAM bytes=${midDiff2}`);

// Phase 2: switch to display
mem[0xd00000] = 0x01;
console.log(`  Switching D00000 to 1...`);
runFrom(EVENT_LOOP_HEAD, 300000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits2.has(blockPc)) hits2.set(blockPc, hits2.get(blockPc) + 1);
  if (blockPc === EVENT_LOOP_HEAD) {
    loopCount2++;
    mem[0xd000c6] |= 0x01;
    mem[0xd00092] |= 0x16;
    executor.cpu.sp = STACK_RESET_TOP - 3;
  }
  if (RET_POINTS.has(blockPc)) return "stop";
});

let finalDiff2 = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore2[i]) finalDiff2++;
}
console.log(`  Final: loops=${loopCount2}, VRAM bytes=${finalDiff2}`);
console.log(`  Hit counts:`);
for (const [pc, count] of [...hits2.entries()].filter(([_, c]) => c > 0).sort((a, b) => a[0] - b[0])) {
  console.log(`    ${hex(pc)}: ${count}`);
}

// ============ EXPERIMENT 3: Alternate D00000 every 100 iterations ============
console.log("\n====== EXPERIMENT 3: Alternate D00000 every 100 iterations ======");
mem.set(bootSnapshot);
setupModeState();
mem[0xd00000] = 0x01;

let hits3 = new Map(TRACKED_PCS.map(pc => [pc, 0]));
let loopCount3 = 0;
let vramBefore3 = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

runFrom(EVENT_LOOP_HEAD, 500000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits3.has(blockPc)) hits3.set(blockPc, hits3.get(blockPc) + 1);
  if (blockPc === EVENT_LOOP_HEAD) {
    loopCount3++;
    mem[0xd000c6] |= 0x01;
    mem[0xd00092] |= 0x16;
    executor.cpu.sp = STACK_RESET_TOP - 3;
    // Alternate every 100 iterations
    mem[0xd00000] = (Math.floor(loopCount3 / 100) % 2 === 0) ? 0x01 : 0x00;
  }
  if (RET_POINTS.has(blockPc)) return "stop";
});

let finalDiff3 = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore3[i]) finalDiff3++;
}
console.log(`  Final: loops=${loopCount3}, VRAM bytes=${finalDiff3}`);
console.log(`  Hit counts:`);
for (const [pc, count] of [...hits3.entries()].filter(([_, c]) => c > 0).sort((a, b) => a[0] - b[0])) {
  console.log(`    ${hex(pc)}: ${count}`);
}

console.log("\n=== SUMMARY ===");
console.log(`Experiment 1 (display->idle): ${diff1} VRAM bytes`);
console.log(`Experiment 2 (idle->display): ${finalDiff2} VRAM bytes`);
console.log(`Experiment 3 (alternating):   ${finalDiff3} VRAM bytes`);
