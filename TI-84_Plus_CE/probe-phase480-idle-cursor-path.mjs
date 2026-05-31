/**
 * probe-phase480-idle-cursor-path.mjs
 * Tests the IDLE cursor rendering path (D00000=0x00)
 * Event loop 0x02FDBE: D00000=0 -> idle path -> 0x03030E -> 0x02FD99 -> CALL 0x03013A -> 0x04E950 cursor rendering
 */

import { readFileSync } from "node:fs";
import { createExecutor } from "./cpu-runtime.js";
import { createPeripheralBus } from "./peripherals.js";
import { PRELIFTED_BLOCKS } from "./ROM.transpiled.js";

const MEM_SIZE = 0x1000000;
const BOOT_STEPS = 150_000;
const FINAL_STEPS = 1_000_000;
const MAX_LOOP_ITERATIONS = 200_000;
const EVENT_LOOP_HEAD = 0x02fdbe;
const STACK_RESET_TOP = 0xd1a87e;
const RETURN_ADDRESS = EVENT_LOOP_HEAD;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const RET_POINTS = new Set([0x02fe88, 0x02fde5, 0x02fe21]);
const TRACKED_PCS = [
  0x02fdbe, 0x03013a, 0x030202, 0x04e950, 0x09ef44,
  0x0059c6, 0x005a75, 0x030078, 0x03030e, 0x02fd99,
];

const mem = new Uint8Array(MEM_SIZE);
const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const peripherals = createPeripheralBus();
const hits = new Map(TRACKED_PCS.map((pc) => [pc, 0]));
const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, "0")}`;

function write24(addr, val) {
  mem[addr & 0xffffff] = val & 0xff;
  mem[(addr + 1) & 0xffffff] = (val >>> 8) & 0xff;
  mem[(addr + 2) & 0xffffff] = (val >>> 16) & 0xff;
}

const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

function runFrom(pc, steps, onBlock) {
  return executor.runFrom(pc, "adl", {
    maxSteps: steps,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock,
  });
}

// 3-stage boot
runFrom(0x080000, BOOT_STEPS);
runFrom(0x0802b2, BOOT_STEPS);
runFrom(0x08c331, BOOT_STEPS);

// Set home mode state - D00000=0x00 for IDLE path
mem[0xd00824] = 0x48;
mem[0xd007e0] = 0x48;
mem[0xd14091] = 0x01;
mem[0xd00000] = 0x00; // IDLE path!
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

for (const pc of TRACKED_PCS) hits.set(pc, 0);

const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);

runFrom(EVENT_LOOP_HEAD, FINAL_STEPS, (pc) => {
  const blockPc = pc & 0xffffff;
  if (hits.has(blockPc)) hits.set(blockPc, hits.get(blockPc) + 1);
  if (blockPc === EVENT_LOOP_HEAD) {
    mem[0xd000c6] |= 0x01;
    mem[0xd00092] |= 0x10;
    executor.cpu.sp = STACK_RESET_TOP - 3;
  }
  if (RET_POINTS.has(blockPc)) {
    const sp = STACK_RESET_TOP - 3;
    write24(sp, RETURN_ADDRESS);
    executor.cpu.sp = sp;
  }
});

let changedCount = 0;
const firstChanged = [];
for (let offset = 0; offset < VRAM_SIZE; offset++) {
  if (mem[VRAM_BASE + offset] !== vramBefore[offset]) {
    changedCount++;
    if (firstChanged.length < 64) firstChanged.push(VRAM_BASE + offset);
  }
}

console.log(`VRAM bytes changed: ${changedCount}`);
console.log(
  `First 64 VRAM change addresses: ${
    firstChanged.length > 0
      ? firstChanged.map((a) => hex(a)).join(", ")
      : "(none)"
  }`
);
console.log("Hit counts:");
for (const pc of TRACKED_PCS) console.log(`  ${hex(pc)}: ${hits.get(pc) ?? 0}`);
console.log(`D00092 final: ${hex(mem[0xd00092], 2)}`);
console.log(`D00595 final: ${hex(mem[0xd00595], 2)}`);
console.log(`D00596 final: ${hex(mem[0xd00596], 2)}`);
const d0059c =
  mem[0xd0059c] | (mem[0xd0059d] << 8) | (mem[0xd0059e] << 16);
console.log(`D0059C final: ${hex(d0059c)}`);
console.log(`Final SP: ${hex(executor.cpu.sp)}`);
