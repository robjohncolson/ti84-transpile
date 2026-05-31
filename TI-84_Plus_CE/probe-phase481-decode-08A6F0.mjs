/**
 * probe-phase481-decode-08A6F0.mjs
 * Decodes 0x08A6F0 cxMain handler — ROM dumps + execution trace
 */
import { readFileSync } from "node:fs";
import { createExecutor } from "./cpu-runtime.js";
import { createPeripheralBus } from "./peripherals.js";
import { PRELIFTED_BLOCKS } from "./ROM.transpiled.js";

const MEM_SIZE = 0x1000000;
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

function hexDump(label, start, length) {
  console.log(`\n=== ROM DUMP: ${label} (${hex(start)} - ${hex(start + length)}) ===`);
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < length; j++) {
      bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
}

// Hex dumps BEFORE boot
hexDump("0x08A6F0 main body", 0x08a6f0, 144);
hexDump("0x08A7BE mode comparator", 0x08a7be, 114);
hexDump("0x08B2AE other cxMain handler", 0x08b2ae, 146);
hexDump("0x08C739 cxMain dispatcher", 0x08c739, 48);

// 3-stage boot
console.log("\n=== 3-STAGE BOOT ===");
runFrom(0x080000, 150000);
runFrom(0x0802b2, 150000);
runFrom(0x08c331, 150000);
console.log("Boot complete.");

// Set home mode state
mem[0xd00824] = 0x48;
mem[0xd007e0] = 0x48;  // 'H' for home mode
mem[0xd14091] = 0x01;
mem[0xd00092] = 0x16;
mem[0xd00089] |= 0x10;
mem[0xd000c6] = 0x01;
mem[0xd000b4] = 0x01;
mem[0xd00080] |= 0x18;
executor.cpu.mbase = 0xd0;
executor.cpu._iy = 0xd00080;

// Install 0x08A6F0 into cxMain handler at D007CA
write24(0xd007ca, 0x08a6f0);
console.log(`\ncxMain (D007CA) set to: ${hex(mem[0xd007ca] | (mem[0xd007cb] << 8) | (mem[0xd007cc] << 16))}`);

// Snapshot RAM state before
const ramBefore = {};
for (let addr = 0xd007c0; addr < 0xd00810; addr++) {
  ramBefore[addr] = mem[addr];
}
for (let addr = 0xd00080; addr < 0xd000e0; addr++) {
  ramBefore[addr] = mem[addr];
}

// Call 0x08A6F0 directly with FAKE_RET on stack
console.log("\n=== CALLING 0x08A6F0 DIRECTLY (home mode D007E0=0x48) ===");
executor.cpu.sp = STACK_RESET_TOP;
executor.cpu.madl = 1;
write24(STACK_RESET_TOP - 3, FAKE_RET);
executor.cpu.sp = STACK_RESET_TOP - 3;

const visited = new Map();
let visitOrder = 0;
const blockSequence = [];

const result = runFrom(0x08a6f0, 100000, (pc) => {
  const blockPc = pc & 0xffffff;
  if (blockPc === FAKE_RET) return "stop";
  if (!visited.has(blockPc)) {
    visited.set(blockPc, { first: visitOrder++, hits: 0 });
  }
  visited.get(blockPc).hits++;
  // Record first 100 blocks in execution order
  if (blockSequence.length < 100) {
    blockSequence.push(blockPc);
  }
});

console.log(`Steps: ${result.steps || 'unknown'}`);
console.log(`Unique blocks visited: ${visited.size}`);

// Sort by first-visit order
const sortedVisited = [...visited.entries()].sort((a, b) => a[1].first - b[1].first);
console.log("\n=== BLOCKS VISITED (by first-visit order) ===");
for (const [pc, info] of sortedVisited) {
  console.log(`  ${hex(pc)}: first=${info.first}, hits=${info.hits}`);
}

console.log("\n=== EXECUTION SEQUENCE (first 50 blocks) ===");
for (let i = 0; i < Math.min(50, blockSequence.length); i++) {
  console.log(`  [${i}] ${hex(blockSequence[i])}`);
}

// RAM changes
console.log("\n=== RAM CHANGES (D007C0-D00810) ===");
for (let addr = 0xd007c0; addr < 0xd00810; addr++) {
  if (ramBefore[addr] !== undefined && mem[addr] !== ramBefore[addr]) {
    console.log(`  ${hex(addr)}: ${hex(ramBefore[addr], 2)} -> ${hex(mem[addr], 2)}`);
  }
}
console.log("\n=== RAM CHANGES (D00080-D000E0) ===");
for (let addr = 0xd00080; addr < 0xd000e0; addr++) {
  if (ramBefore[addr] !== undefined && mem[addr] !== ramBefore[addr]) {
    console.log(`  ${hex(addr)}: ${hex(ramBefore[addr], 2)} -> ${hex(mem[addr], 2)}`);
  }
}

// Key state after
console.log("\n=== KEY STATE AFTER ===");
console.log(`D007E0 (mode): ${hex(mem[0xd007e0], 2)} ('${String.fromCharCode(mem[0xd007e0])}')`);
console.log(`D00824: ${hex(mem[0xd00824], 2)}`);
console.log(`D007CA (cxMain): ${hex(mem[0xd007ca] | (mem[0xd007cb] << 8) | (mem[0xd007cc] << 16))}`);
