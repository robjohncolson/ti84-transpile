import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const D02A28 = 0xd02a28;
const TOKEN_A = 0xd001b8;
const TOKEN_B = 0xd001d3;

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from({ length: len }, (_, i) => mem[addr + i]);
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
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

  return { romBytes, mem, executor, cpu };
}

function rearmHomeContext(romBytes, mem) {
  for (let i = 0; i < 21; i++) mem[0xd007ca + i] = romBytes[0x0585d3 + i];
  mem[0xd0008d] = romBytes[0x0585d3 + 21];
}

function seedKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] |= 0x20;
  mem[0xd00080] |= 0x08;
}

async function runVariant(name, hookAddress, restoreAfterHalt) {
  const { romBytes, mem, executor, cpu } = await bootSystem();
  rearmHomeContext(romBytes, mem);
  seedKey(mem, 0x90);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  let block = 0;
  let lastA = mem[TOKEN_A];
  let lastB = mem[TOKEN_B];
  let tokenSnapshot = null;
  let wipeCount = 0;
  let hookCount = 0;
  const events = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (addr === hookAddress) {
        mem[D02A28] = 1;
        hookCount++;
      }
      if (addr === 0x0018f8) wipeCount++;
      if (mem[TOKEN_A] !== lastA || mem[TOKEN_B] !== lastB) {
        events.push({ block, pc: addr, a0: lastA, a1: mem[TOKEN_A], b0: lastB, b1: mem[TOKEN_B], gate: mem[D02A28] });
        lastA = mem[TOKEN_A];
        lastB = mem[TOKEN_B];
        if ((lastA !== 0 || lastB !== 0) && tokenSnapshot == null) {
          tokenSnapshot = {
            block,
            pc: addr,
            a: readBytes(mem, TOKEN_A, 8),
            b: readBytes(mem, TOKEN_B, 8),
          };
        }
      }
    },
  });

  const beforeRestore = { a: mem[TOKEN_A], b: mem[TOKEN_B] };
  if (restoreAfterHalt && tokenSnapshot) {
    writeBytes(mem, TOKEN_A, tokenSnapshot.a);
    writeBytes(mem, TOKEN_B, tokenSnapshot.b);
  }

  const commonPass = result.termination === 'halt'
    && (result.lastPc & 0xffffff) === HALT
    && hookCount > 0
    && tokenSnapshot != null;
  const pass = commonPass && (restoreAfterHalt
    ? (mem[TOKEN_A] === tokenSnapshot.a[0] && mem[TOKEN_B] === tokenSnapshot.b[0])
    : (beforeRestore.a === 0 && beforeRestore.b === 0));

  console.log(`\n=== ${name} ===`);
  console.log(`termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)} hookCount=${hookCount} wipes=${wipeCount}`);
  console.log(`snapshot=${tokenSnapshot ? `block ${tokenSnapshot.block} pc ${hex(tokenSnapshot.pc)} A=${hex(tokenSnapshot.a[0], 2)} B=${hex(tokenSnapshot.b[0], 2)}` : 'none'}`);
  console.log(`beforeRestore A=${hex(beforeRestore.a, 2)} B=${hex(beforeRestore.b, 2)} final A=${hex(mem[TOKEN_A], 2)} B=${hex(mem[TOKEN_B], 2)} pass=${pass}`);
  for (const event of events) {
    console.log(`  block=${event.block} pc=${hex(event.pc)} D001B8 ${hex(event.a0, 2)}->${hex(event.a1, 2)} D001D3 ${hex(event.b0, 2)}->${hex(event.b1, 2)} gate=${hex(event.gate, 2)}`);
  }
  return pass;
}

console.log('Phase 619: persist transient token output buffers across cleanup');
const baselineTransient = await runVariant('baseline hook without restore', 0x08f5e1, false);
const restorePass = await runVariant('hook with post-halt token-buffer restore', 0x08f5e1, true);

if (baselineTransient && restorePass) {
  console.log('\nphase619: PASS -- token buffers are transient without restore and persist with snapshot restore');
  process.exit(0);
}

console.log('\nphase619: FAIL -- expected baseline transient + restored persistent result');
process.exit(1);
