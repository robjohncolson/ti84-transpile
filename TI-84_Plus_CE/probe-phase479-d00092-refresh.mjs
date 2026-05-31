import { readFileSync } from "node:fs";

import createExecutor from "./cpu-runtime.js";
import createPeripheralBus from "./peripherals.js";
import * as transpiledRom from "./ROM.transpiled.js";

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
  0x02fdbe,
  0x030078,
  0x04e950,
  0x09ef44,
  0x0059c6,
  0x005a75,
];

const BLOCKS =
  transpiledRom.BLOCKS ??
  transpiledRom.blocks ??
  transpiledRom.default?.BLOCKS ??
  transpiledRom.default;

if (!BLOCKS) {
  throw new Error("ROM.transpiled.js did not export BLOCKS");
}

const mem = new Uint8Array(MEM_SIZE);
const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const cpu = {
  a: 0,
  f: 0,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  h: 0,
  l: 0,
  a2: 0,
  f2: 0,
  b2: 0,
  c2: 0,
  d2: 0,
  e2: 0,
  h2: 0,
  l2: 0,
  ix: 0,
  iy: 0,
  _ix: 0,
  _iy: 0,
  i: 0,
  r: 0,
  pc: 0,
  sp: STACK_RESET_TOP,
  mbase: 0,
  iff1: 0,
  iff2: 0,
  im: 0,
  halted: false,
};

const peripherals = createPeripheralBus(mem);
const hits = new Map(TRACKED_PCS.map((pc) => [pc, 0]));

const hex = (value, width = 6) =>
  `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, "0")}`;

function write24(address, value) {
  mem[address & 0xffffff] = value & 0xff;
  mem[(address + 1) & 0xffffff] = (value >>> 8) & 0xff;
  mem[(address + 2) & 0xffffff] = (value >>> 16) & 0xff;
}

function refreshReturnStack() {
  const sp = STACK_RESET_TOP - 3;
  write24(sp, RETURN_ADDRESS);
  cpu.sp = sp;
}

const executor = createExecutor(BLOCKS, mem, {
  peripherals,
  onBlock: (pc) => {
    const blockPc = pc & 0xffffff;

    if (hits.has(blockPc)) {
      hits.set(blockPc, hits.get(blockPc) + 1);
    }

    if (blockPc === EVENT_LOOP_HEAD) {
      mem[0xd000c6] |= 0x01;
      mem[0xd00092] |= 0x10;
      cpu.sp = STACK_RESET_TOP - 3;
    }

    if (RET_POINTS.has(blockPc)) {
      refreshReturnStack();
    }
  },
});

const execute =
  typeof executor === "function" ? executor : executor.execute ?? executor.run;

if (typeof execute !== "function") {
  throw new Error("createExecutor did not return an executable function");
}

function runFrom(pc, steps) {
  cpu.pc = pc;
  return execute(cpu, pc, steps, { maxLoopIterations: MAX_LOOP_ITERATIONS });
}

runFrom(0x080000, BOOT_STEPS);
runFrom(0x0802b2, BOOT_STEPS);
runFrom(0x08c331, BOOT_STEPS);

mem[0xd00824] = 0x48;
mem[0xd007e0] = 0x48;
mem[0xd14091] = 0x01;
mem[0xd00000] = 0x01;
mem[0xd00092] = 0x16;
mem[0xd00089] |= 0x10;
mem[0xd000c6] = 0x01;
mem[0xd000b4] = 0x01;
mem[0xd00080] |= 0x18;
write24(0xd0059c, VRAM_BASE);
mem[0xd00595] = 0x00;
mem[0xd00596] = 0x00;
mem[0xd0058b] = 0x70;
cpu.mbase = 0xd0;
cpu._iy = 0xd00080;

for (const pc of TRACKED_PCS) {
  hits.set(pc, 0);
}

const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE);
runFrom(EVENT_LOOP_HEAD, FINAL_STEPS);

let changedCount = 0;
const firstChanged = [];

for (let offset = 0; offset < VRAM_SIZE; offset += 1) {
  if (mem[VRAM_BASE + offset] !== vramBefore[offset]) {
    changedCount += 1;
    if (firstChanged.length < 64) {
      firstChanged.push(VRAM_BASE + offset);
    }
  }
}

console.log(`VRAM bytes changed: ${changedCount}`);
console.log(
  `First 64 VRAM change addresses: ${
    firstChanged.length > 0 ? firstChanged.map((address) => hex(address)).join(", ") : "(none)"
  }`,
);
console.log("Hit counts:");
for (const pc of TRACKED_PCS) {
  console.log(`${hex(pc)}: ${hits.get(pc) ?? 0}`);
}
console.log(`D00092 final value: ${hex(mem[0xd00092], 2)}`);
console.log(`Final SP: ${hex(cpu.sp)}`);
