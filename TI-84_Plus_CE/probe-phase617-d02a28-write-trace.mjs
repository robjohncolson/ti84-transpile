import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const D02A28 = 0xd02a28;

const WATCH = {
  0x08e911: 'W1 block start before inc D02A28',
  0x08e912: 'W1 inc D02A28',
  0x08ea35: 'R1 save+clear prelude',
  0x08ea5b: 'W2 set 1',
  0x08ea66: 'W3 restore A',
  0x08ea9a: 'W4 set 1 / save prelude',
  0x08eaa7: 'W5 restore A',
  0x08eae7: 'W6 set 1 / save prelude',
  0x08eb75: 'W7 set 1',
  0x08ebf3: 'W8 restore A',
  0x08ec40: 'R4 save+clear prelude',
  0x08ecb1: 'W9 restore A',
  0x08ef24: 'R5 save-to-B+clear prelude',
  0x08f5b8: 'W11 clear in 0x08F5E1 exit',
  0x090143: 'W10 xor/clear reset',
  0x09013c: 'W10 block start before xor/clear reset',
  0x090986: 'A2 dec D02A28',
  0x090992: 'R6 gate test',
  0x09098e: 'store D00599 + gate test',
  0x0018f8: 'bulk wipe body',
  0x001853: 'wipe caller entry',
  0x08f5e1: 'token exit path',
  0x09091c: 'seeded runaway loop',
};

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

function runKey(system, snap, label, seedGate) {
  const { mem, executor, cpu } = system;
  restore(mem, snap);
  mem[D02A28] = seedGate ? 1 : 0;
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
  const transitions = [];
  let lastGate = mem[D02A28];
  let prevPc = null;
  let prevBlock = 0;
  let block = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (Object.hasOwn(WATCH, addr)) {
        hits.set(addr, (hits.get(addr) ?? 0) + 1);
      }
      const gate = mem[D02A28];
      if (gate !== lastGate) {
        transitions.push({
          block,
          from: lastGate,
          to: gate,
          pc: addr,
          prevPc,
          prevBlock,
          sp: cpu.sp & 0xffffff,
          d001b8: mem[0xd001b8],
          d001d3: mem[0xd001d3],
        });
        lastGate = gate;
      }
      prevPc = addr;
      prevBlock = block;
    },
  });

  console.log(`\nphase617: ${label}`);
  console.log(`  result steps=${result.steps ?? 'n/a'} pc=${hex(cpu.pc)} D02A28=${hex(mem[D02A28], 2)} D001B8=${hex(mem[0xd001b8], 2)} D001D3=${hex(mem[0xd001d3], 2)} transitions=${transitions.length}`);
  console.log('  watch hits:');
  for (const [addrText, name] of Object.entries(WATCH)) {
    const addr = Number(addrText);
    const count = hits.get(addr) ?? 0;
    if (count) console.log(`    ${hex(addr)} ${name}: ${count}`);
  }
  console.log('  D02A28 transitions:');
  for (const event of transitions.slice(0, 40)) {
    console.log(`    block=${event.block} ${hex(event.from, 2)}->${hex(event.to, 2)} pc=${hex(event.pc)} prev=${hex(event.prevPc ?? 0)} prevBlock=${event.prevBlock} sp=${hex(event.sp)} b8=${hex(event.d001b8, 2)} d3=${hex(event.d001d3, 2)}`);
  }
  if (transitions.length > 40) console.log(`    ... ${transitions.length - 40} more transitions omitted`);
  return { result, hits, transitions };
}

const baselineSystem = await bootSystem();
const baseSnap = snapshot(baselineSystem.mem);
console.log(`phase617: post-paint D007CA=${hex(read24(baselineSystem.mem, 0xd007ca))} D02A28=${hex(baselineSystem.mem[D02A28], 2)}`);
runKey(baselineSystem, baseSnap, 'baseline D02A28=0', false);
runKey(baselineSystem, baseSnap, 'seeded after baseline on same executor', true);

const seededSystem = await bootSystem();
const seededSnap = snapshot(seededSystem.mem);
runKey(seededSystem, seededSnap, 'seeded D02A28=1 on fresh executor', true);
