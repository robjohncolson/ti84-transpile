import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const FLAG_Z = 0x40;

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function u16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function bytes(rom, addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i].toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function insnText(rom, insn) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return `${hex(insn.pc)} ${bytes(rom, insn.pc, insn.length).padEnd(14)} ${fields}`;
}

function decodeWindow(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      rows.push(insnText(rom, insn));
      pc = insn.nextPc;
    } catch (err) {
      rows.push(`${hex(pc)} decode-error ${err.message}`);
      pc++;
    }
  }
  return rows;
}

function findCalls(rom, target) {
  const pattern = [0xcd, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    if (pattern.every((byte, j) => rom[i + j] === byte)) hits.push(i);
  }
  return hits;
}

async function bootSystem(romBytes) {
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

function regSnap(cpu, mem) {
  return {
    a: cpu.a & 0xff,
    b: cpu.b & 0xff,
    f: cpu.f & 0xff,
    z: (cpu.f & FLAG_Z) !== 0,
    hl: cpu._hl & 0xffffff,
    d02a28: mem[0xd02a28],
    d02a29: u16(mem, 0xd02a29),
  };
}

async function dynamicTrace(romBytes) {
  const { mem, executor, cpu } = await bootSystem(romBytes);
  rearmHomeContext(romBytes, mem);
  seedKey(mem, 0x90);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  const watch = new Set([0x0907f4, 0x08f7d6, 0x08f7da, 0x08f7dd, 0x08f7df, 0x08f7e1, 0x08f7e2, 0x0907f8, 0x0907fa, 0x0907fc]);
  const counts = new Map();
  const events = [];
  let block = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (!watch.has(addr)) return;
      counts.set(addr, (counts.get(addr) ?? 0) + 1);
      if (events.length < 120) events.push({ block, pc: addr, ...regSnap(cpu, mem) });
    },
  });

  return { result, counts, events };
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

console.log('Phase 622: 0x08F7D6 size post-processor');
console.log('\n=== static decode: caller 0x0907DB ===');
for (const row of decodeWindow(romBytes, 0x0907db, 0x090805)) console.log(row);
console.log('\n=== static decode: post-processor 0x08F7D6 ===');
for (const row of decodeWindow(romBytes, 0x08f7d6, 0x08f7e8)) console.log(row);
console.log('\n=== static decode: predicate helpers ===');
for (const [name, start, end] of [
  ['0x08E68A predicate', 0x08e68a, 0x08e690],
  ['0x08E690 predicate', 0x08e690, 0x08e696],
]) {
  console.log(`-- ${name} --`);
  for (const row of decodeWindow(romBytes, start, end)) console.log(row);
}
console.log('\n=== direct CALL scan ===');
for (const target of [0x08f7d6, 0x0907db]) {
  const hits = findCalls(romBytes, target);
  console.log(`${hex(target)} callers=${hits.length}: ${hits.map((hit) => hex(hit)).join(', ') || '(none)'}`);
}

console.log('\n=== dynamic trace: one hooked keypress path ===');
const trace = await dynamicTrace(romBytes);
console.log(`termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)} pass=${trace.result.termination === 'halt' && (trace.result.lastPc & 0xffffff) === HALT}`);
console.log('counts=' + [...trace.counts.entries()].sort((a, b) => a[0] - b[0]).map(([addr, count]) => `${hex(addr)}:${count}`).join(' '));
console.log('\nfirst watched events:');
for (const event of trace.events) {
  console.log(`block=${event.block} pc=${hex(event.pc)} A=${hex(event.a, 2)} B=${hex(event.b, 2)} F=${hex(event.f, 2)} Z=${event.z ? 1 : 0} HL=${hex(event.hl)} D02A28=${hex(event.d02a28, 2)} D02A29=${hex(event.d02a29, 4)}`);
}

const postCalls = trace.counts.get(0x08f7d6) ?? 0;
const returnZ = trace.events.filter((event) => event.pc === 0x0907f8 && event.z).length;
const returnNz = trace.events.filter((event) => event.pc === 0x0907f8 && !event.z).length;
const ok = trace.result.termination === 'halt'
  && (trace.result.lastPc & 0xffffff) === HALT
  && postCalls > 0
  && (trace.counts.get(0x0907f8) ?? 0) > 0
  && (trace.counts.get(0x0907fc) ?? 0) > 0
  && returnNz > 0;

if (!ok) {
  console.log('\nphase622: FAIL -- expected live 0x0907F4 -> 0x08F7D6 -> 0x0907F8 path was not proven');
  process.exit(1);
}

console.log(`\nphase622: PASS -- 0x08F7D6 observed ${postCalls}x; 0x0907F8 returned with Z=${returnZ} NZ=${returnNz} in sampled events`);
