import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const D02A28 = 0xd02a28;
const WATCH = new Map([
  [0x08f5e1, 'loop exit / token output path'],
  [0x08f663, 'post-gate branch area A'],
  [0x08f66f, 'post-gate branch area B'],
  [0x09098e, 'store D00599 before gate'],
  [0x090992, 'D02A28 gate test'],
  [0x09013c, 'early D02A28 clear block'],
  [0x08e911, 'natural D02A28 inc'],
  [0x090986, 'natural D02A28 dec'],
]);

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function readBytes(mem, addr, len) {
  return Array.from({ length: len }, (_, i) => mem[addr + i]);
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

async function bootSystem() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
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

async function runVariant(name, hookAddress) {
  const system = await bootSystem();
  const { mem, executor, cpu } = system;
  restore(mem, snapshot(mem));
  mem[D02A28] = 0;
  mem[0xd0058c] = 0x90;
  mem[0xd0058e] = 0x90;
  mem[0xd00587] = 0x90;
  mem[0xd0009f] |= 0x20;

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  const hits = new Map();
  const writes = [];
  const gateEvents = [];
  let block = 0;
  let lastB8 = mem[0xd001b8];
  let lastD3 = mem[0xd001d3];
  let lastGate = mem[D02A28];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (WATCH.has(addr)) hits.set(addr, (hits.get(addr) ?? 0) + 1);
      if (addr === hookAddress) {
        mem[D02A28] = 1;
        gateEvents.push({ block, pc: addr, action: `hook set D02A28=1 at ${hex(addr)}`, b8: mem[0xd001b8], d3: mem[0xd001d3] });
      }
      if (addr === 0x090992 || addr === 0x09098e || addr === 0x08f5e1) {
        gateEvents.push({ block, pc: addr, action: `observe gate=${hex(mem[D02A28], 2)}`, b8: mem[0xd001b8], d3: mem[0xd001d3] });
      }
      if (mem[D02A28] !== lastGate) {
        gateEvents.push({ block, pc: addr, action: `D02A28 ${hex(lastGate, 2)}->${hex(mem[D02A28], 2)}`, b8: mem[0xd001b8], d3: mem[0xd001d3] });
        lastGate = mem[D02A28];
      }
      if (mem[0xd001b8] !== lastB8 || mem[0xd001d3] !== lastD3) {
        writes.push({ block, pc: addr, fromB8: lastB8, toB8: mem[0xd001b8], fromD3: lastD3, toD3: mem[0xd001d3], gate: mem[D02A28] });
        lastB8 = mem[0xd001b8];
        lastD3 = mem[0xd001d3];
      }
    },
  });

  console.log(`\n=== ${name} ===`);
  console.log(`hook=${hookAddress == null ? 'none' : hex(hookAddress)} termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)} D02A28=${hex(mem[D02A28], 2)} D001B8=${hex(mem[0xd001b8], 2)} D001D3=${hex(mem[0xd001d3], 2)} writes=${writes.length}`);
  console.log('watch hits:');
  for (const [addr, label] of WATCH) {
    const count = hits.get(addr) ?? 0;
    if (count) console.log(`  ${hex(addr)} ${label}: ${count}`);
  }
  console.log('gate/output events:');
  for (const event of gateEvents.slice(0, 30)) {
    console.log(`  block=${event.block} pc=${hex(event.pc)} ${event.action} b8=${hex(event.b8, 2)} d3=${hex(event.d3, 2)}`);
  }
  if (gateEvents.length > 30) console.log(`  ... ${gateEvents.length - 30} more events omitted`);
  if (writes.length) {
    console.log('output buffer changes:');
    for (const w of writes) {
      console.log(`  block=${w.block} pc=${hex(w.pc)} D001B8 ${hex(w.fromB8, 2)}->${hex(w.toB8, 2)} D001D3 ${hex(w.fromD3, 2)}->${hex(w.toD3, 2)} gate=${hex(w.gate, 2)}`);
    }
  }
}

console.log('Phase 618: narrow D02A28 hook at consumer gates');
await runVariant('baseline no hook', null);
await runVariant('hook at 0x08F5E1 loop exit', 0x08f5e1);
await runVariant('hook at 0x09098E pre-gate store', 0x09098e);
await runVariant('hook at 0x090992 gate test', 0x090992);
