/**
 * probe-phase481-cursor-write-mechanism.mjs
 * Decodes where the idle cursor blink writes VRAM pixels
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

// ROM hex dumps of cursor/display path
console.log("=== ROM HEX DUMP: 0x030170-0x0301F0 (cursor blink path) ===");
for (let addr = 0x030170; addr < 0x0301f0; addr += 16) {
  const bytes = [];
  for (let j = 0; j < 16; j++) bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
  console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
}

console.log("\n=== ROM HEX DUMP: 0x030200-0x030280 (0x030202 glyph selector area) ===");
for (let addr = 0x030200; addr < 0x030280; addr += 16) {
  const bytes = [];
  for (let j = 0; j < 16; j++) bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
  console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
}

console.log("\n=== ROM HEX DUMP: 0x04E950-0x04E9D0 (cursor position save/update) ===");
for (let addr = 0x04e950; addr < 0x04e9d0; addr += 16) {
  const bytes = [];
  for (let j = 0; j < 16; j++) bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
  console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
}

console.log("\n=== ROM HEX DUMP: 0x03FBF0-0x03FC70 (0x03FBF9 subroutine) ===");
for (let addr = 0x03fbf0; addr < 0x03fc70; addr += 16) {
  const bytes = [];
  for (let j = 0; j < 16; j++) bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
  console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
}

// 3-stage boot
console.log("\n=== 3-STAGE BOOT ===");
runFrom(0x080000, 150000);
runFrom(0x0802b2, 150000);
runFrom(0x08c331, 150000);
console.log("Boot complete.");

// Set idle mode state
mem[0xd00824] = 0x48;
mem[0xd007e0] = 0x48;
mem[0xd14091] = 0x01;
mem[0xd00000] = 0x00;  // IDLE path
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

// Track a WIDE range of PCs in the cursor path
const TRACKED_PCS = [
  // Core cursor/display blocks
  0x02fdbe, 0x02fd99, 0x03013a, 0x03013f, 0x030145, 0x03015e,
  0x030173, 0x030177, 0x030180, 0x030190, 0x0301a0, 0x0301b0,
  0x0301c0, 0x0301d0, 0x0301e0, 0x0301f0,
  0x030200, 0x030202, 0x03020a, 0x030210, 0x030220, 0x030230,
  0x030240, 0x030250, 0x030260, 0x030270,
  // Known functions
  0x04e950, 0x04e960, 0x03fbf9, 0x04c979, 0x0059c6, 0x005a75,
  0x030300, 0x03030e, 0x02fdac, 0x05c76c, 0x040d11,
  // Possible cursor write functions in 0x03016x-0x0301Ax
  0x030160, 0x03016a, 0x030170, 0x030178,
  // Session 474 path blocks
  0x030078, 0x03d1be,
];

const hits = new Map(TRACKED_PCS.map(pc => [pc, 0]));
let loopCount = 0;

const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

// Track VRAM state per-block to find which block causes the first VRAM change
let lastVramChanges = 0;
const vramChangeLog = [];

console.log("\n=== RUNNING IDLE EVENT LOOP (500K steps, D00000=0) ===");
runFrom(EVENT_LOOP_HEAD, 500000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits.has(blockPc)) hits.set(blockPc, hits.get(blockPc) + 1);

  if (blockPc === EVENT_LOOP_HEAD) {
    loopCount++;
    // Refresh flags each iteration
    mem[0xd00092] |= 0x16;
    mem[0xd000c6] |= 0x01;
    executor.cpu.sp = STACK_RESET_TOP - 3;

    // Check for new VRAM changes periodically (every 10 iterations for first 100)
    if (loopCount <= 100 && loopCount % 10 === 0) {
      let changes = 0;
      for (let i = 0; i < VRAM_SIZE; i++) {
        if (mem[VRAM_BASE + i] !== vramBefore[i]) changes++;
      }
      if (changes !== lastVramChanges) {
        vramChangeLog.push({ iteration: loopCount, vramBytes: changes });
        lastVramChanges = changes;
      }
    }
  }

  if (RET_POINTS.has(blockPc)) {
    return "stop";
  }
});

// Final VRAM diff
let totalDiff = 0;
let minAddr = Infinity, maxAddr = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore[i]) {
    totalDiff++;
    if (VRAM_BASE + i < minAddr) minAddr = VRAM_BASE + i;
    if (VRAM_BASE + i > maxAddr) maxAddr = VRAM_BASE + i;
  }
}

console.log(`\nLoop iterations: ${loopCount}`);
console.log(`Total VRAM bytes changed: ${totalDiff}`);
if (totalDiff > 0) {
  console.log(`VRAM range: ${hex(minAddr)} - ${hex(maxAddr)}`);
}

console.log(`\nVRAM change log (first 100 iterations):`);
for (const entry of vramChangeLog) {
  console.log(`  Iteration ${entry.iteration}: ${entry.vramBytes} bytes`);
}

console.log("\n=== HIT COUNTS (non-zero) ===");
const sortedHits = [...hits.entries()].filter(([_, count]) => count > 0).sort((a, b) => a[0] - b[0]);
for (const [pc, count] of sortedHits) {
  console.log(`  ${hex(pc)}: ${count} hits`);
}

// Also log any PCs in 0x030100-0x030300 that were NOT in our tracked list
// by checking the first few changed VRAM bytes more carefully
console.log("\n=== KEY RAM STATE ===");
console.log(`D00092: ${hex(mem[0xd00092], 2)}`);
console.log(`D00095: ${hex(mem[0xd00095], 2)}`);
console.log(`D00591: ${hex(mem[0xd00591] | (mem[0xd00592] << 8) | (mem[0xd00593] << 16))}`);
console.log(`D0059C: ${hex(mem[0xd0059c] | (mem[0xd0059d] << 8) | (mem[0xd0059e] << 16))}`);
console.log(`D00595 (row): ${hex(mem[0xd00595], 2)}`);
console.log(`D00596 (col): ${hex(mem[0xd00596], 2)}`);

if (totalDiff > 0) {
  // Show changed addresses with row stride analysis
  const changedAddrs = [];
  for (let i = 0; i < VRAM_SIZE && changedAddrs.length < 30; i++) {
    if (mem[VRAM_BASE + i] !== vramBefore[i]) {
      changedAddrs.push(VRAM_BASE + i);
    }
  }
  console.log(`\nFirst 30 changed VRAM addresses:`);
  for (let i = 0; i < changedAddrs.length; i++) {
    const stride = i > 0 ? changedAddrs[i] - changedAddrs[i-1] : 0;
    console.log(`  ${hex(changedAddrs[i])} (offset ${hex(changedAddrs[i] - VRAM_BASE)})${stride > 0 ? ` stride=${hex(stride)}` : ''}`);
  }
}
