import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);

const HALT_IDLE = 0x0019b5;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;
const OUTER_LOOP = 0x08c331;

const D00081 = 0xD00081;
const D0009F = 0xD0009F;
const D000A3 = 0xD000A3;
const D0058C = 0xD0058C;
const D11104 = 0xD11104;
const D11146 = 0xD11146;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function byteHex(value) {
  return `0x${(value & 0xFF).toString(16).padStart(2, '0')}`;
}

function wordHex(value) {
  return hex(value & 0xFFFFFF, 6);
}

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24FromMem(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function logState(prefix, mem) {
  const d00081 = mem[D00081];
  const d000a3 = mem[D000A3];
  const d11146 = read24FromMem(mem, D11146);
  const d11104 = read24FromMem(mem, D11104);
  console.log(
    `${prefix} D00081=${byteHex(d00081)} bit2=${(d00081 >> 2) & 1} ` +
      `D11146=${wordHex(d11146)} D11104=${wordHex(d11104)} ` +
      `eq=${d11146 === d11104 ? 1 : 0} D000A3=${byteHex(d000a3)} bit3=${(d000a3 >> 3) & 1}`,
  );
}

console.log('=== STATIC DISASSEMBLY 0x0907B0-0x0907F0 ===');
let pc = 0x0907B0;
while (pc < 0x0907F0) {
  const instr = decodeInstruction(view, pc, true);
  const bytes = [];
  for (let i = 0; i < instr.length; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
  const line = `0x${pc.toString(16).padStart(6, '0')}: ${bytes.join(' ').padEnd(20)} ${instr.mnemonic || '???'}`;
  console.log(line);
  pc += instr.length;
}

console.log('\n=== D00081 BIT 2 IY+1 DIRECT REFERENCES ===');
const patterns = [
  { name: 'BIT 2,(IY+1)', bytes: [0xFD, 0xCB, 0x01, 0x56] },
  { name: 'SET 2,(IY+1)', bytes: [0xFD, 0xCB, 0x01, 0xD6] },
  { name: 'RES 2,(IY+1)', bytes: [0xFD, 0xCB, 0x01, 0x96] },
  { name: 'LD A,(IY+1)', bytes: [0xFD, 0x7E, 0x01] },
];

for (const pat of patterns) {
  const hits = [];
  for (let addr = 0; addr < rom.length - pat.bytes.length; addr++) {
    let match = true;
    for (let j = 0; j < pat.bytes.length; j++) {
      if (rom[addr + j] !== pat.bytes[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(hex(addr));
  }
  console.log(`${pat.name}: ${hits.length} hits - ${hits.slice(0, 40).join(', ')}`);
}

console.log('\n=== D00081 BIT 2 HIT CONTEXT ===');
for (const pat of patterns.slice(0, 3)) {
  for (let addr = 0; addr < rom.length - pat.bytes.length; addr++) {
    let match = true;
    for (let j = 0; j < pat.bytes.length; j++) {
      if (rom[addr + j] !== pat.bytes[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    console.log(`\n--- ${pat.name} at ${hex(addr)} ---`);
    let ctxPc = Math.max(0, addr - 12);
    const end = Math.min(rom.length, addr + 24);
    while (ctxPc < end) {
      const instr = decodeInstruction(view, ctxPc, true);
      const bytes = [];
      for (let i = 0; i < instr.length && ctxPc + i < rom.length; i++) {
        bytes.push(rom[ctxPc + i].toString(16).padStart(2, '0'));
      }
      const marker = ctxPc === addr ? '=>' : '  ';
      console.log(`${marker} ${hex(ctxPc)}: ${bytes.join(' ').padEnd(20)} ${instr.mnemonic || '???'}`);
      ctxPc += Math.max(1, instr.length);
    }
  }
}

console.log('\n=== STATIC REFERENCES TO D11146 / D11104 LIL-ENDIAN BYTES ===');
for (const target of [D11146, D11104]) {
  const bytes = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];
  for (let addr = 0; addr < rom.length - bytes.length; addr++) {
    if (rom[addr] === bytes[0] && rom[addr + 1] === bytes[1] && rom[addr + 2] === bytes[2]) {
      hits.push(hex(addr));
    }
  }
  console.log(`${hex(target)} immediate refs: ${hits.length} hits - ${hits.slice(0, 40).join(', ')}`);
}

console.log('\n=== DYNAMIC TRACE BOOT+INIT+PAINT+KEY1 ===');

// Load ROM module and set up executor (probe-609 pattern)
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(rom.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Phase 0: Cold boot (exact copy from probe-609)
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// Phase 1: Launch-init
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase610: init done');

// Phase 2: Paint
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase610: paint done');

// Phase 3: Key 1 ('2'/0x90) through outer loop with onBlock hooks
const hits = {
  res3: 0,
  set3: 0,
  set3Transitions: 0,
};
let pendingSet3 = null;

// Seed key press
mem[D0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[D0009F] = mem[D0009F] | 0x20;
mem[0xD00080] = mem[0xD00080] | 0x08;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === 0x0907BF) {
      hits.res3++;
      console.log(`RES3 hit #${hits.res3} BEFORE RES 3`);
      console.log(`  D000A3=${byteHex(mem[D000A3])} bit3=${(mem[D000A3] >> 3) & 1}`);
    }
    if (addr === 0x0907D6) {
      hits.set3++;
      pendingSet3 = mem[D000A3];
      console.log(`SET3 hit #${hits.set3} AT SET 3`);
      logState('  ', mem);
    }
    if (addr === 0x0907DA && pendingSet3 !== null) {
      const after = mem[D000A3];
      const transitioned = ((pendingSet3 & 0x08) === 0) && ((after & 0x08) !== 0);
      if (transitioned) hits.set3Transitions++;
      console.log(
        `SET3 post #${hits.set3} D000A3 ${byteHex(pendingSet3)} -> ${byteHex(after)} ` +
          `transition=${transitioned ? 1 : 0}`,
      );
      pendingSet3 = null;
    }
  },
});

console.log('\n=== DYNAMIC SUMMARY ===');
console.log(`0x0907BF RES 3 hits: ${hits.res3}`);
console.log(`0x0907D6 SET 3 hits: ${hits.set3}`);
console.log(`D000A3 bit3 0->1 transitions observed after SET 3: ${hits.set3Transitions}`);
