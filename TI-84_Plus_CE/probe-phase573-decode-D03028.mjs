// Phase 573 findings: D03028/D0302B decode probe.
// D03028 and D0302B are RAM variables, so the ROM bytes at those addresses are
// not code; this probe reports the live RAM contents after boot as 24-bit values.
// Static ROM scanning looks for literal ADL pointers 28 30 D0 and 2B 30 D0.
// Each hit is classified from the nearest preceding opcode when possible:
// LD rr,imm24 means the variable address is used as an immediate pointer.
// LD rr,(imm24) / LD (imm24),rr are direct loads/stores of the variable value.
// LD A,(imm24) / LD (imm24),A are byte loads/stores against the variable.
// Unknown hits are still reported with a 20-byte byte window for manual decode.
// Boot uses the generated CPU runtime plus createPeripheralBus({ timerInterrupt: false }).
// If runtime export names differ, the probe prints the static reference map first
// and exits non-zero with the missing boot API called out explicitly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romPath = path.join(__dirname, 'ROM.rom');

const TARGETS = [
  { name: 'D03028', addr: 0xd03028, pattern: Buffer.from([0x28, 0x30, 0xd0]) },
  { name: 'D0302B', addr: 0xd0302b, pattern: Buffer.from([0x2b, 0x30, 0xd0]) },
];

function hex(value, width = 6) {
  return `0x${Number(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24(buffer, addr) {
  return buffer[addr] | (buffer[addr + 1] << 8) | (buffer[addr + 2] << 16);
}

function classifyReference(rom, offset) {
  const candidates = [
    { delta: 1, opcodes: new Map([[0x21, 'LD HL,imm24 pointer literal'], [0x01, 'LD BC,imm24 pointer literal'], [0x11, 'LD DE,imm24 pointer literal'], [0x31, 'LD SP,imm24 pointer literal']]) },
    { delta: 1, opcodes: new Map([[0x2a, 'LD HL,(imm24) load'], [0x22, 'LD (imm24),HL store'], [0x3a, 'LD A,(imm24) byte load'], [0x32, 'LD (imm24),A byte store']]) },
  ];

  for (const candidate of candidates) {
    const opcodeAt = offset - candidate.delta;
    if (opcodeAt >= 0 && candidate.opcodes.has(rom[opcodeAt])) {
      return { kind: candidate.opcodes.get(rom[opcodeAt]), instructionOffset: opcodeAt };
    }
  }

  if (offset >= 2 && rom[offset - 2] === 0xed) {
    return { kind: `ED-prefixed operation 0x${rom[offset - 1].toString(16).toUpperCase().padStart(2, '0')}`, instructionOffset: offset - 2 };
  }

  if (offset >= 2 && (rom[offset - 2] === 0xdd || rom[offset - 2] === 0xfd)) {
    const index = rom[offset - 2] === 0xdd ? 'IX' : 'IY';
    return { kind: `${index}-prefixed operation 0x${rom[offset - 1].toString(16).toUpperCase().padStart(2, '0')}`, instructionOffset: offset - 2 };
  }

  return { kind: 'unknown literal/reference context', instructionOffset: Math.max(0, offset - 8) };
}

function findReferences(rom, target) {
  const refs = [];
  for (let offset = 0; offset <= rom.length - target.pattern.length; offset += 1) {
    if (rom[offset] === target.pattern[0] && rom[offset + 1] === target.pattern[1] && rom[offset + 2] === target.pattern[2]) {
      const start = Math.max(0, offset - 20);
      const end = Math.min(rom.length, offset + 23);
      refs.push({
        offset,
        address: offset,
        ...classifyReference(rom, offset),
        windowStart: start,
        window: rom.subarray(start, end),
      });
    }
  }
  return refs;
}

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

async function bootRuntime(romBytes) {
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot — same sequence as probe-phase99d
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return {
    d03028: read24(mem, 0xd03028),
    d0302b: read24(mem, 0xd0302b),
  };
}

const rom = fs.readFileSync(romPath);
console.log('Phase 573 D03028/D0302B decode');
console.log(`ROM: ${romPath} (${rom.length} bytes)`);

const refsByTarget = new Map();
for (const target of TARGETS) {
  const refs = findReferences(rom, target);
  refsByTarget.set(target.name, refs);
  console.log(`\n${target.name} ROM references (${refs.length}):`);
  for (const ref of refs) {
    console.log(`  ${hex(ref.address)}: ${ref.kind}; instruction ${hex(ref.instructionOffset)}; bytes[${hex(ref.windowStart)}]=${bytesToHex(ref.window)}`);
  }
}

try {
  const values = await bootRuntime(rom);
  console.log('\nBoot RAM values:');
  console.log(`  D03028 = ${hex(values.d03028)} (${values.d03028})`);
  console.log(`  D0302B = ${hex(values.d0302b)} (${values.d0302b})`);
  process.exit(0);
} catch (error) {
  console.error('\nBoot RAM read failed after static reference scan:');
  console.error(`  ${error.stack || error.message}`);
  process.exit(1);
}
