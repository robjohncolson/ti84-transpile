import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const D000A3 = 0xd000a3;
const IY_OFFSET = 0x23;

function hex(value, width = 6) {
  return `0x${Number(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function contextBytes(rom, offset, before = 8, after = 8) {
  const start = Math.max(0, offset - before);
  const end = Math.min(rom.length, offset + after);
  return bytesHex(rom.subarray(start, end));
}

function bitOpKind(opcode) {
  if (opcode >= 0x40 && opcode <= 0x7f) return 'BIT';
  if (opcode >= 0x80 && opcode <= 0xbf) return 'RES';
  if (opcode >= 0xc0 && opcode <= 0xff) return 'SET';
  return null;
}

function bitNumber(opcode) {
  return (opcode >> 3) & 0x07;
}

function classify(hit) {
  if (hit.type === 'SET' || hit.type === 'RES' || hit.type === 'LD_WRITE' || hit.type === 'LD_IMM') {
    return 'writer';
  }
  return 'reader';
}

function findXrefs(rom) {
  const hits = [];

  for (let i = 0; i < rom.length; i += 1) {
    if (i + 3 < rom.length && rom[i] === 0xfd && rom[i + 1] === 0xcb && rom[i + 2] === IY_OFFSET) {
      const opcode = rom[i + 3];
      const kind = bitOpKind(opcode);
      if (kind) {
        const bit = bitNumber(opcode);
        hits.push({
          address: i,
          type: kind,
          bit,
          length: 4,
          class: kind === 'BIT' ? 'reader' : 'writer',
          context: contextBytes(rom, i, 8, 16),
        });
      }
    }

    if (i + 2 < rom.length && rom[i] === 0xfd && rom[i + 1] === 0x7e && rom[i + 2] === IY_OFFSET) {
      hits.push({
        address: i,
        type: 'LD_READ',
        bit: null,
        length: 3,
        class: 'reader',
        context: contextBytes(rom, i, 8, 16),
      });
    }

    if (i + 2 < rom.length && rom[i] === 0xfd && rom[i + 1] === 0x77 && rom[i + 2] === IY_OFFSET) {
      hits.push({
        address: i,
        type: 'LD_WRITE',
        bit: null,
        length: 3,
        class: 'writer',
        context: contextBytes(rom, i, 8, 16),
      });
    }

    if (i + 3 < rom.length && rom[i] === 0xfd && rom[i + 1] === 0x36 && rom[i + 2] === IY_OFFSET) {
      hits.push({
        address: i,
        type: 'LD_IMM',
        bit: null,
        immediate: rom[i + 3],
        length: 4,
        class: 'writer',
        context: contextBytes(rom, i, 8, 16),
      });
    }

    if (i + 2 < rom.length && rom[i] === 0xa3 && rom[i + 1] === 0x00 && rom[i + 2] === 0xd0) {
      hits.push({
        address: i,
        type: 'DIRECT_D000A3_BYTES',
        bit: null,
        length: 3,
        class: 'reader',
        context: contextBytes(rom, i, 8, 16),
      });
    }
  }

  hits.sort((a, b) => a.address - b.address || a.type.localeCompare(b.type));
  for (const hit of hits) {
    hit.class = hit.class ?? classify(hit);
  }
  return hits;
}

function instructionText(hit) {
  if (hit.type === 'BIT' || hit.type === 'SET' || hit.type === 'RES') {
    return `${hit.type} ${hit.bit},(IY+${hex(IY_OFFSET, 2)})`;
  }
  if (hit.type === 'LD_READ') return `LD A,(IY+${hex(IY_OFFSET, 2)})`;
  if (hit.type === 'LD_WRITE') return `LD (IY+${hex(IY_OFFSET, 2)}),A`;
  if (hit.type === 'LD_IMM') return `LD (IY+${hex(IY_OFFSET, 2)}),${hex(hit.immediate, 2)}`;
  return 'direct address bytes A3 00 D0';
}

function logStaticSummary(hits, rom) {
  const writers = hits.filter((hit) => hit.class === 'writer');
  const readers = hits.filter((hit) => hit.class === 'reader');
  const bit3Tests = hits.filter((hit) => hit.type === 'BIT' && hit.bit === 3);
  const set3 = hits.filter((hit) => hit.type === 'SET' && hit.bit === 3);
  const res3 = hits.filter((hit) => hit.type === 'RES' && hit.bit === 3);

  console.log('=== D000A3 / IY+0x23 static cross-reference ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Total references: ${hits.length}`);
  console.log(`Readers: ${readers.length}`);
  console.log(`Writers: ${writers.length}`);
  console.log(`BIT 3 tests: ${bit3Tests.length}`);
  console.log(`SET 3 writers: ${set3.length}`);
  console.log(`RES 3 writers: ${res3.length}`);
  console.log(`SET 3 addresses: ${set3.map((hit) => hex(hit.address)).join(', ') || '(none)'}`);
  console.log(`RES 3 addresses: ${res3.map((hit) => hex(hit.address)).join(', ') || '(none)'}`);

  console.log('\n=== All references ===');
  for (const hit of hits) {
    const flag = hit.bit === 3 && (hit.type === 'BIT' || hit.type === 'SET' || hit.type === 'RES') ? ' <-- bit 3' : '';
    console.log(`${hex(hit.address)} ${hit.class.padEnd(6)} ${instructionText(hit).padEnd(24)} ${hit.context}${flag}`);
  }

  console.log('\n=== SET 3 / RES 3 extended context (16 bytes before and after) ===');
  for (const hit of [...set3, ...res3].sort((a, b) => a.address - b.address)) {
    console.log(`${hex(hit.address)} ${instructionText(hit)} :: ${contextBytes(rom, hit.address, 16, 20)}`);
  }
}

function write24mem(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function logD000A3(mem, label) {
  const value = mem[D000A3] & 0xff;
  const bit3 = (value >>> 3) & 1;
  console.log(`${label}: D000A3=${hex(value, 2)} bit3=${bit3 ? 'SET' : 'CLEAR'} raw=0b${value.toString(2).padStart(8, '0')}`);
}

async function dynamicVerification(rom) {
  console.log('\n=== Dynamic D000A3 verification ===');

  // Load transpiled ROM
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  const MEM_SIZE = 0x1000000;
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, MEM_SIZE));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot (same sequence as probe-608)
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

  logD000A3(mem, 'After cold boot');

  // Launch-init
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = 0xD1A87E - 24;
  cpu.sp = launchSp;
  write24mem(mem, launchSp, 0x0019be);
  write24mem(mem, 0xD008E0, launchSp);
  executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  logD000A3(mem, 'After init (0x09DD62)');

  // Paint
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24mem(mem, cpu.sp, 0x0019b5);
  executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  logD000A3(mem, 'After paint (0x058241)');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const hits = findXrefs(rom);
  logStaticSummary(hits, rom);
  await dynamicVerification(rom);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
