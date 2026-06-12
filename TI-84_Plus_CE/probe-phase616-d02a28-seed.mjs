import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const GATE_TEST = 0x090992;
const STORE_AND_GATE = 0x09098e;
const EXIT_PATH = 0x08f5e1;

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readBytes(mem, addr, len) {
  return Array.from({ length: len }, (_, i) => mem[addr + i]);
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

function bootSystem() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  return import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href).then((romModule) => {
    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
    executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
    cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
    executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
    cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
    cpu._iy = 0xd00080; cpu.mbase = 0xd0;
    cpu.sp = 0xd1a87e - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
    executor.runFrom(0x0019be, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });

    peripherals.setTimerEnabled(false);
    cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
    cpu._iy = 0xd00080; cpu.mbase = 0xd0;
    const launchSp = 0xd1a87e - 24;
    cpu.sp = launchSp;
    write24(mem, launchSp, 0x0019be);
    write24(mem, 0xd008e0, launchSp);
    executor.runFrom(0x09dd62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

    peripherals.setTimerEnabled(true);
    cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
    cpu._iy = 0xd00080; cpu.mbase = 0xd0;
    cpu.sp = (cpu.sp - 3) & 0xffffff;
    write24(mem, cpu.sp, HALT);
    executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

    return { mem, executor, cpu };
  });
}

function snapshot(mem) {
  return {
    ctx: readBytes(mem, 0xd007ca, 21),
    flags: readBytes(mem, 0xd00080, 128),
    desc: readBytes(mem, 0xd02434, 32),
    d0008d: mem[0xd0008d],
    d0009f: mem[0xd0009f],
    d0231a: read24(mem, 0xd0231a),
    d0243a: read24(mem, 0xd0243a),
  };
}

function restore(mem, snap) {
  writeBytes(mem, 0xd007ca, snap.ctx);
  writeBytes(mem, 0xd00080, snap.flags);
  writeBytes(mem, 0xd02434, snap.desc);
  mem[0xd0008d] = snap.d0008d;
  mem[0xd0009f] = snap.d0009f;
  write24(mem, 0xd0231a, snap.d0231a);
  write24(mem, 0xd0243a, snap.d0243a);
}

function runKey({ mem, executor, cpu }, snap, label, seedGate) {
  restore(mem, snap);
  mem[0xd02a28] = seedGate ? 1 : 0;
  mem[0xd0058c] = 0x90;
  mem[0xd0058e] = 0x90;
  mem[0xd00587] = 0x90;
  mem[0xd0009f] |= 0x20;

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  const events = [];
  let lastB8 = mem[0xd001b8];
  let lastD3 = mem[0xd001d3];
  let gateTests = 0;
  let storeAndGate = 0;
  let exitHits = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      const addr = pc & 0xffffff;
      if (addr === GATE_TEST) gateTests++;
      if (addr === STORE_AND_GATE) storeAndGate++;
      if (addr === EXIT_PATH) exitHits++;
      if (mem[0xd001b8] !== lastB8 || mem[0xd001d3] !== lastD3) {
        events.push({
          pc: addr,
          b8: mem[0xd001b8],
          d3: mem[0xd001d3],
          gate: mem[0xd02a28],
        });
        lastB8 = mem[0xd001b8];
        lastD3 = mem[0xd001d3];
      }
    },
  });

  console.log(`${label}: exit=${result.reason ?? 'unknown'} steps=${result.steps ?? 'n/a'} pc=${hex(cpu.pc)} gate=${hex(mem[0xd02a28], 2)} b8=${hex(mem[0xd001b8], 2)} d3=${hex(mem[0xd001d3], 2)} gateTests=${gateTests} storeAndGate=${storeAndGate} exitHits=${exitHits} events=${events.length}`);
  for (const event of events.slice(0, 12)) {
    console.log(`  event pc=${hex(event.pc)} D001B8=${hex(event.b8, 2)} D001D3=${hex(event.d3, 2)} D02A28=${hex(event.gate, 2)}`);
  }
}

const system = await bootSystem();
const clean = snapshot(system.mem);
console.log(`post-paint: D007CA=${hex(read24(system.mem, 0xd007ca))} D02A28=${hex(system.mem[0xd02a28], 2)} D001B8=${hex(system.mem[0xd001b8], 2)} D001D3=${hex(system.mem[0xd001d3], 2)}`);
runKey(system, clean, 'baseline D02A28=0', false);
runKey(system, clean, 'seeded D02A28=1', true);
