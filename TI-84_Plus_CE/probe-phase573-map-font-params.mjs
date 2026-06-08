/*
Phase 573 findings scaffold:
- This probe maps all literal ROM references to D02A65 and D02A68 by scanning
  for the little-endian ADL address operands 65 2A D0 and 68 2A D0.
- D02A65 and D02A68 are the two undecoded 3-byte fields in the D02A62-D02A75
  pixel renderer workspace mapped in phase 571.
- The probe decodes nearby eZ80/Z80 instruction forms that commonly carry a
  24-bit immediate address: LD rr,(mn), LD (mn),rr, LD A,(mn), LD (mn),A, and
  indexed/prefixed variants when the operand can be identified safely.
- Runtime values are read after the standard idle boot path, using
  createPeripheralBus({ timerInterrupt: false }) when the local runtime exports
  a compatible machine/CPU factory.
- Each 3-byte field is interpreted as a little-endian ADL pointer candidate and
  classified as RAM, ROM, flash/ROM-table-like, VRAM-like, or unmapped.
- Candidate pointer bytes are sampled against known font/glyph table territory,
  including the 0x07BF3E region cited by earlier glyph table work.
- If the local runtime API differs, the static ROM reference map still runs and
  the boot/read section reports the incompatible API instead of failing silently.
- The output is intentionally machine-readable JSON plus concise text so future
  sessions can diff reference maps and field interpretations.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');

const TARGETS = [
  { name: 'D02A65', addr: 0xd02a65, pattern: [0x65, 0x2a, 0xd0] },
  { name: 'D02A68', addr: 0xd02a68, pattern: [0x68, 0x2a, 0xd0] },
];

const REG16_LOAD_FROM_MEM = new Map([
  [0x2a, 'LD HL,($addr)'],
  [0xed4b, 'LD BC,($addr)'],
  [0xed5b, 'LD DE,($addr)'],
  [0xed7b, 'LD SP,($addr)'],
]);

const REG16_STORE_TO_MEM = new Map([
  [0x22, 'LD ($addr),HL'],
  [0xed43, 'LD ($addr),BC'],
  [0xed53, 'LD ($addr),DE'],
  [0xed73, 'LD ($addr),SP'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function findPattern(bytes, pattern) {
  const hits = [];
  for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function bytesHex(bytes, start, end) {
  return Array.from(bytes.slice(start, end), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function decodeReference(bytes, operandOffset, targetName) {
  const candidates = [];

  const oneBack = bytes[operandOffset - 1];
  if (oneBack !== undefined) {
    if (REG16_LOAD_FROM_MEM.has(oneBack)) {
      candidates.push({
        instructionStart: operandOffset - 1,
        instruction: REG16_LOAD_FROM_MEM.get(oneBack).replace('$addr', targetName),
        access: 'read',
        confidence: 'high',
      });
    }
    if (REG16_STORE_TO_MEM.has(oneBack)) {
      candidates.push({
        instructionStart: operandOffset - 1,
        instruction: REG16_STORE_TO_MEM.get(oneBack).replace('$addr', targetName),
        access: 'write',
        confidence: 'high',
      });
    }
    if (oneBack === 0x3a) {
      candidates.push({
        instructionStart: operandOffset - 1,
        instruction: `LD A,(${targetName})`,
        access: 'read',
        confidence: 'high',
      });
    }
    if (oneBack === 0x32) {
      candidates.push({
        instructionStart: operandOffset - 1,
        instruction: `LD (${targetName}),A`,
        access: 'write',
        confidence: 'high',
      });
    }
  }

  const twoBack = (bytes[operandOffset - 2] << 8) | oneBack;
  if (REG16_LOAD_FROM_MEM.has(twoBack)) {
    candidates.push({
      instructionStart: operandOffset - 2,
      instruction: REG16_LOAD_FROM_MEM.get(twoBack).replace('$addr', targetName),
      access: 'read',
      confidence: 'high',
    });
  }
  if (REG16_STORE_TO_MEM.has(twoBack)) {
    candidates.push({
      instructionStart: operandOffset - 2,
      instruction: REG16_STORE_TO_MEM.get(twoBack).replace('$addr', targetName),
      access: 'write',
      confidence: 'high',
    });
  }

  const threeBack = [bytes[operandOffset - 3], bytes[operandOffset - 2], bytes[operandOffset - 1]];
  if (threeBack[0] === 0xed && threeBack[1] === 0x38) {
    candidates.push({
      instructionStart: operandOffset - 3,
      instruction: `prefixed ED 38 ${hex(threeBack[2], 2)} using ${targetName}`,
      access: 'unknown',
      confidence: 'medium',
    });
  }
  if (threeBack[0] === 0xed && threeBack[1] === 0x39) {
    candidates.push({
      instructionStart: operandOffset - 3,
      instruction: `prefixed ED 39 ${hex(threeBack[2], 2)} using ${targetName}`,
      access: 'unknown',
      confidence: 'medium',
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      instructionStart: Math.max(0, operandOffset - 4),
      instruction: `undecoded instruction with immediate ${targetName}`,
      access: 'unknown',
      confidence: 'low',
    });
  }

  const best = candidates.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.confidence] - rank[b.confidence] || b.instructionStart - a.instructionStart;
  })[0];

  const contextStart = Math.max(0, best.instructionStart - 10);
  const contextEnd = Math.min(bytes.length, operandOffset + 13);
  return {
    romAddress: best.instructionStart,
    operandAddress: operandOffset,
    instruction: best.instruction,
    access: best.access,
    confidence: best.confidence,
    contextBytes: bytesHex(bytes, contextStart, contextEnd),
  };
}

function scanRomReferences(rom) {
  return TARGETS.flatMap((target) =>
    findPattern(rom, target.pattern).map((offset) => ({
      target: target.name,
      ...decodeReference(rom, offset, target.name),
    })),
  ).sort((a, b) => a.romAddress - b.romAddress);
}

function classifyPointer(value, romLength) {
  if (value < romLength) return 'ROM/flash pointer candidate';
  if (value >= 0xd00000 && value <= 0xd3ffff) return 'RAM pointer candidate';
  if (value >= 0xd40000 && value <= 0xd7ffff) return 'memory-mapped IO or VRAM-like candidate';
  if (value >= 0xe30000 && value <= 0xe3ffff) return 'LCD/VRAM-like candidate';
  return 'outside known CE ROM/RAM windows';
}

function interpretValue(name, bytes, rom) {
  if (!bytes) {
    return { name, available: false };
  }
  const value = readU24LE(bytes, 0);
  const inRom = value < rom.length;
  const nearKnownGlyphRegion = value >= 0x07b000 && value <= 0x07d000;
  const sample = inRom ? bytesHex(rom, value, Math.min(rom.length, value + 16)) : null;
  return {
    name,
    rawBytes: bytesHex(bytes, 0, 3),
    littleEndianU24: hex(value),
    classification: classifyPointer(value, rom.length),
    nearKnownGlyphRegion,
    sampleAtPointer: sample,
    interpretation: inRom
      ? '3-byte little-endian ADL pointer into ROM/font-table space'
      : '3-byte little-endian ADL value; not a direct pointer into this ROM image',
  };
}

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;

async function bootRuntime() {
  const rom = fs.readFileSync(romPath);
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot: Z80 reset vector
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  // Kernel init to populate RAM workspace fields
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  // Read D02A65 and D02A68 directly from the memory array
  const values = {};
  for (const target of TARGETS) {
    values[target.name] = Uint8Array.from(mem.slice(target.addr, target.addr + 3));
  }
  return { factoryName: 'createExecutor', values };
}

async function main() {
  if (!fs.existsSync(romPath)) {
    throw new Error(`ROM not found at ${romPath}`);
  }

  const rom = fs.readFileSync(romPath);
  const references = scanRomReferences(rom);

  let boot = null;
  try {
    boot = await bootRuntime();
  } catch (error) {
    boot = { error: error.message };
  }

  const runtimeValues = Object.fromEntries(
    TARGETS.map((target) => [target.name, boot.values?.[target.name] ?? null]),
  );
  const interpretations = TARGETS.map((target) => interpretValue(target.name, runtimeValues[target.name], rom));

  const report = {
    probe: 'phase573-map-font-params',
    romPath,
    romSize: rom.length,
    targets: TARGETS.map((target) => ({ name: target.name, address: hex(target.addr) })),
    boot,
    references,
    interpretations,
    summary: {
      referenceCount: references.length,
      byTarget: Object.fromEntries(TARGETS.map((target) => [
        target.name,
        references.filter((ref) => ref.target === target.name).length,
      ])),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
