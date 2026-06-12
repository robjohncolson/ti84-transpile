import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const D02A28 = 0xd02a28;
const D02A29 = 0xd02a29;
const D02A40 = 0xd02a40;
const D0243D = 0xd0243d;
const TOKEN_A = 0xd001b8;
const TOKEN_B = 0xd001d3;

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function u16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function formatInsn(insn) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return `${hex(insn.pc)} len=${insn.length} ${fields}`;
}

function disasmWindow(romBytes, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(romBytes, pc, 'adl');
      rows.push(formatInsn(insn));
      pc = insn.nextPc;
    } catch (err) {
      rows.push(`${hex(pc)} decode-error ${err.message}`);
      pc++;
    }
  }
  return rows;
}

function findCalls(romBytes, target) {
  const pattern = [0xcd, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const hits = [];
  for (let i = 0; i <= romBytes.length - pattern.length; i++) {
    if (pattern.every((byte, j) => romBytes[i + j] === byte)) hits.push(i);
  }
  return hits;
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

function snap(mem) {
  return {
    gate: mem[D02A28],
    cursor: u16(mem, D02A29),
    tokenPtr: u16(mem, D02A40),
    editBtm: u16(mem, D0243D),
    iy23: mem[0xd000a3],
    tokenA: mem[TOKEN_A],
    tokenB: mem[TOKEN_B],
  };
}

async function dynamicTrace(romBytes) {
  const { mem, executor, cpu } = await bootSystem();
  rearmHomeContext(romBytes, mem);
  seedKey(mem, 0x90);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xd008e0, cpu.sp);

  const watch = new Set([0x08f433, 0x08f5e1, 0x08f696, 0x0907db, 0x0907df, 0x0907e3, 0x0907e9, 0x0907f4, 0x0907fb, 0x0907fe, 0x090918, 0x09091c, 0x090923, 0x090927, 0x090992, 0x0018f8]);
  const counts = new Map();
  const firstEvents = [];
  let block = 0;
  let lastCursor = u16(mem, D02A29);
  const cursorChanges = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      block++;
      const addr = pc & 0xffffff;
      if (watch.has(addr)) {
        const prev = counts.get(addr) ?? 0;
        counts.set(addr, prev + 1);
        if (prev < 6) firstEvents.push({ block, pc: addr, ...snap(mem) });
      }
      const cursor = u16(mem, D02A29);
      if (cursor !== lastCursor) {
        cursorChanges.push({ block, pc: addr, from: lastCursor, to: cursor, ...snap(mem) });
        lastCursor = cursor;
      }
    },
  });

  return { result, counts, firstEvents, cursorChanges };
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

console.log('Phase 620: decode 0x0907DB / 0x09091C token-size and walker interior');
for (const [name, start, end] of [
  ['getTokenByteSize 0x0907DB', 0x0907db, 0x090818],
  ['walker 0x090917', 0x090917, 0x09093a],
  ['gate helper 0x090992', 0x090992, 0x09099a],
]) {
  console.log(`\n=== ${name} ===`);
  for (const row of disasmWindow(romBytes, start, end)) console.log(row);
}

console.log('\n=== direct CALL scan ===');
for (const target of [0x0907db, 0x090918, 0x09091c, 0x090992]) {
  const hits = findCalls(romBytes, target);
  console.log(`${hex(target)} callers=${hits.length}: ${hits.map((h) => hex(h)).join(', ') || '(none)'}`);
}

console.log('\n=== dynamic trace: one hooked keypress path ===');
const trace = await dynamicTrace(romBytes);
console.log(`termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)} pass=${trace.result.termination === 'halt' && (trace.result.lastPc & 0xffffff) === HALT}`);
console.log('counts=' + [...trace.counts.entries()].sort((a, b) => a[0] - b[0]).map(([addr, count]) => `${hex(addr)}:${count}`).join(' '));
console.log('\nfirst watched events:');
for (const event of trace.firstEvents.slice(0, 80)) {
  console.log(`block=${event.block} pc=${hex(event.pc)} gate=${hex(event.gate, 2)} cursor=${hex(event.cursor, 4)} tokenPtr=${hex(event.tokenPtr, 4)} editBtm=${hex(event.editBtm, 4)} iy23=${hex(event.iy23, 2)} tok=${hex(event.tokenA, 2)}/${hex(event.tokenB, 2)}`);
}
console.log('\nD02A29 cursor changes:');
for (const event of trace.cursorChanges.slice(0, 40)) {
  console.log(`block=${event.block} pc=${hex(event.pc)} ${hex(event.from, 4)}->${hex(event.to, 4)} gate=${hex(event.gate, 2)} tokenPtr=${hex(event.tokenPtr, 4)} editBtm=${hex(event.editBtm, 4)}`);
}
console.log(`cursorChangeCount=${trace.cursorChanges.length}`);

const ok = trace.result.termination === 'halt'
  && (trace.result.lastPc & 0xffffff) === HALT
  && (trace.counts.get(0x0907db) ?? 0) > 0
  && (trace.counts.get(0x090918) ?? 0) > 0
  && (trace.counts.get(0x090992) ?? 0) > 0;

if (!ok) {
  console.log('\nphase620: FAIL -- expected token-size/walker/gate blocks were not all observed');
  process.exit(1);
}

console.log('\nphase620: PASS -- static decode and dynamic trace captured token-size/walker interior');
