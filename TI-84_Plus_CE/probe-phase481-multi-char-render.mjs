/**
 * probe-phase481-multi-char-render.mjs
 * Renders "HOME" at row 0, col 0 via 0x0059C6
 */
import { readFileSync } from "node:fs";
import { createExecutor } from "./cpu-runtime.js";
import { createPeripheralBus } from "./peripherals.js";
import { PRELIFTED_BLOCKS } from "./ROM.transpiled.js";

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xd1a87e;
const FAKE_RET = 0xfedcba;

const mem = new Uint8Array(MEM_SIZE);
const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
mem.set(rom.subarray(0, MEM_SIZE), 0);
const peripherals = createPeripheralBus();
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

function runFrom(pc, steps, onBlock) {
  return executor.runFrom(pc, "adl", { maxSteps: steps, maxLoopIterations: 200000, onBlock });
}
const hex = (v, w = 6) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(w, "0");
function write24(addr, val) {
  mem[addr & 0xffffff] = val & 0xff;
  mem[(addr + 1) & 0xffffff] = (val >>> 8) & 0xff;
  mem[(addr + 2) & 0xffffff] = (val >>> 16) & 0xff;
}
function read24(addr) {
  return mem[addr & 0xffffff] | (mem[(addr + 1) & 0xffffff] << 8) | (mem[(addr + 2) & 0xffffff] << 16);
}

// 3-stage boot
console.log("=== 3-STAGE BOOT ===");
runFrom(0x080000, 150000);
runFrom(0x0802b2, 150000);
runFrom(0x08c331, 150000);
console.log("Boot complete.");

// Home mode state
mem[0xd00824] = 0x48;
mem[0xd007e0] = 0x48;
mem[0xd14091] = 0x01;
mem[0xd00092] = 0x16;
mem[0xd00089] |= 0x10;
mem[0xd000c6] = 0x01;
mem[0xd000b4] = 0x01;
mem[0xd00080] |= 0x18;
mem[0xd00595] = 0x00;  // Row 0
mem[0xd00596] = 0x00;  // Col 0
mem[0xd0058b] = 0x70;
executor.cpu.mbase = 0xd0;
executor.cpu._iy = 0xd00080;

console.log("\n=== RENDERING 'HOME' AT ROW 0, COL 0 ===");
console.log(`Initial D00595 (row): ${hex(mem[0xd00595], 2)}`);
console.log(`Initial D00596 (col): ${hex(mem[0xd00596], 2)}`);
console.log(`Initial D0059C: ${hex(read24(0xd0059c))}`);
console.log(`Expected VRAM start: ${hex(0xd40000 + (0*20+37)*640 + (0*12+2)*2)} (row 0, col 0)`);

const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

const chars = [
  { code: 0x48, name: 'H' },
  { code: 0x4f, name: 'O' },
  { code: 0x4d, name: 'M' },
  { code: 0x45, name: 'E' },
];

let totalVramChanged = 0;

for (const ch of chars) {
  // Reset SP and set up FAKE_RET
  executor.cpu.sp = STACK_RESET_TOP;
  executor.cpu.madl = 1;
  write24(STACK_RESET_TOP - 3, FAKE_RET);
  executor.cpu.sp = STACK_RESET_TOP - 3;
  executor.cpu._a = ch.code;

  const vramBeforeChar = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

  const result = runFrom(0x0059c6, 50000, (pc) => {
    const blockPc = pc & 0xffffff;
    if (blockPc === FAKE_RET) return "stop";
  });

  // Count VRAM changes from this character
  let charVramChanged = 0;
  let minAddr = Infinity, maxAddr = 0;
  for (let i = 0; i < VRAM_SIZE; i++) {
    if (mem[VRAM_BASE + i] !== vramBeforeChar[i]) {
      charVramChanged++;
      if (VRAM_BASE + i < minAddr) minAddr = VRAM_BASE + i;
      if (VRAM_BASE + i > maxAddr) maxAddr = VRAM_BASE + i;
    }
  }
  totalVramChanged += charVramChanged;

  console.log(`\n--- Character '${ch.name}' (${hex(ch.code, 2)}) ---`);
  console.log(`  VRAM bytes changed: ${charVramChanged}`);
  if (charVramChanged > 0) {
    console.log(`  VRAM range: ${hex(minAddr)} - ${hex(maxAddr)}`);
    console.log(`  VRAM offset from base: ${hex(minAddr - VRAM_BASE)} - ${hex(maxAddr - VRAM_BASE)}`);
  }
  console.log(`  D00596 (col) after: ${hex(mem[0xd00596], 2)}`);
  console.log(`  D0059C after: ${hex(read24(0xd0059c))}`);
  console.log(`  D005A0 after: ${hex(mem[0xd005a0], 2)}`);
  console.log(`  Steps used: ${result.steps || 'unknown'}`);
}

// Total VRAM diff from initial snapshot
let totalDiff = 0;
let globalMin = Infinity, globalMax = 0;
for (let i = 0; i < VRAM_SIZE; i++) {
  if (mem[VRAM_BASE + i] !== vramBefore[i]) {
    totalDiff++;
    if (VRAM_BASE + i < globalMin) globalMin = VRAM_BASE + i;
    if (VRAM_BASE + i > globalMax) globalMax = VRAM_BASE + i;
  }
}

console.log("\n=== SUMMARY ===");
console.log(`Total VRAM bytes changed: ${totalDiff}`);
if (totalDiff > 0) {
  console.log(`Global VRAM range: ${hex(globalMin)} - ${hex(globalMax)}`);
  console.log(`Expected range start: ~${hex(0xd40000 + 37*640 + 4)} (row 0, col 0)`);

  // Show first few changed addresses to verify row stride
  const changedAddrs = [];
  for (let i = 0; i < VRAM_SIZE && changedAddrs.length < 20; i++) {
    if (mem[VRAM_BASE + i] !== vramBefore[i]) {
      changedAddrs.push(VRAM_BASE + i);
    }
  }
  console.log(`First 20 changed addresses:`);
  for (const addr of changedAddrs) {
    console.log(`  ${hex(addr)} (offset ${hex(addr - VRAM_BASE)})`);
  }

  // Check row stride (should be 640 = 0x280)
  if (changedAddrs.length >= 2) {
    const strides = new Set();
    for (let i = 1; i < Math.min(changedAddrs.length, 10); i++) {
      strides.add(changedAddrs[i] - changedAddrs[i-1]);
    }
    console.log(`Address strides between first changes: ${[...strides].map(s => hex(s)).join(', ')}`);
  }
}

console.log(`\nFinal D00595 (row): ${hex(mem[0xd00595], 2)}`);
console.log(`Final D00596 (col): ${hex(mem[0xd00596], 2)}`);
console.log(`Final D0059C: ${hex(read24(0xd0059c))}`);
console.log(`Final D005A0: ${hex(mem[0xd005a0], 2)}`);
