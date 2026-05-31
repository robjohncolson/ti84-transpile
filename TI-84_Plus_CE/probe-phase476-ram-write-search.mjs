#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const targets = [
  { name: 'D00824', address: 0xd00824, le24: [0x24, 0x08, 0xd0] },
  { name: 'D007E0', address: 0xd007e0, le24: [0xe0, 0x07, 0xd0] },
  { name: 'D14091', address: 0xd14091, le24: [0x91, 0x40, 0xd1] },
  { name: 'D00000', address: 0xd00000, le24: [0x00, 0x00, 0xd0] },
  { name: 'D00092', address: 0xd00092, le24: [0x92, 0x00, 0xd0] },
];

const regions = [
  { name: 'OS scheduler', start: 0x0015f7, end: 0x001a00 },
  { name: 'post-init boot stage', start: 0x0802b2, end: 0x080400 },
  { name: 'kernel init', start: 0x08c331, end: 0x08c400 },
  { name: 'home screen init', start: 0x08bf22, end: 0x08c000 },
];

const searchSpecs = [];

for (const target of targets) {
  searchSpecs.push({
    target: target.name,
    instruction: 'LD (addr),A',
    bytes: [0x32, ...target.le24],
  });
  searchSpecs.push({
    target: target.name,
    instruction: 'LD (addr),HL',
    bytes: [0x22, ...target.le24],
  });
}

for (let bit = 0; bit < 8; bit++) {
  searchSpecs.push({
    target: 'D00092',
    instruction: `RES ${bit},(IY+0x12)`,
    bytes: [0xfd, 0xcb, 0x12, 0x86 + bit * 8],
  });
  searchSpecs.push({
    target: 'D00092',
    instruction: `SET ${bit},(IY+0x12)`,
    bytes: [0xfd, 0xcb, 0x12, 0xc6 + bit * 8],
  });
}

searchSpecs.push({
  target: 'D00092',
  instruction: 'LD (IY+0x12),n',
  bytes: [0xfd, 0x36, 0x12, null],
});

for (const [opcode, register] of [
  [0x70, 'B'],
  [0x71, 'C'],
  [0x72, 'D'],
  [0x73, 'E'],
  [0x74, 'H'],
  [0x75, 'L'],
  [0x77, 'A'],
]) {
  searchSpecs.push({
    target: 'D00092',
    instruction: `LD (IY+0x12),${register}`,
    bytes: [0xfd, opcode, 0x12],
  });
}

searchSpecs.push(
  {
    target: 'D00092',
    instruction: 'INC (IY+0x12)',
    bytes: [0xfd, 0x34, 0x12],
  },
  {
    target: 'D00092',
    instruction: 'DEC (IY+0x12)',
    bytes: [0xfd, 0x35, 0x12],
  },
);

const targetByAddress = new Map(targets.map((target) => [target.address, target]));

function matchesAt(buffer, offset, bytes) {
  if (offset + bytes.length > buffer.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== null && buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function hexByte(byte) {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function hex24(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function hexAddress(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function bytesToHex(buffer, start, length) {
  const bytes = [];
  for (let i = start; i < start + length && i < buffer.length; i++) {
    if (i >= 0) bytes.push(hexByte(buffer[i]));
  }
  return bytes.join(' ');
}

function signed8(byte) {
  return byte >= 0x80 ? byte - 0x100 : byte;
}

function contextFor(offset, length) {
  return {
    before: bytesToHex(rom, Math.max(0, offset - 8), Math.min(8, offset)),
    match: bytesToHex(rom, offset, length),
    after: bytesToHex(rom, offset + length, 8),
  };
}

function compareMatches(a, b) {
  return (
    a.offset - b.offset ||
    a.target.localeCompare(b.target) ||
    a.instruction.localeCompare(b.instruction)
  );
}

function findPatternMatches() {
  const matches = [];
  for (const spec of searchSpecs) {
    for (let offset = 0; offset <= rom.length - spec.bytes.length; offset++) {
      if (!matchesAt(rom, offset, spec.bytes)) continue;
      matches.push({
        offset,
        target: spec.target,
        instruction: spec.instruction,
        length: spec.bytes.length,
        context: contextFor(offset, spec.bytes.length),
      });
    }
  }
  return matches.sort(compareMatches);
}

function findNearestIxLoad(offset) {
  const searchStart = Math.max(0, offset - 128);
  for (let cursor = offset - 5; cursor >= searchStart; cursor--) {
    if (rom[cursor] !== 0xdd || rom[cursor + 1] !== 0x21) continue;
    return {
      offset: cursor,
      base: rom[cursor + 2] | (rom[cursor + 3] << 8) | (rom[cursor + 4] << 16),
    };
  }
  return null;
}

function addIxHeuristicMatch(matches, offset, displacementOffset, instruction, length) {
  const ixLoad = findNearestIxLoad(offset);
  if (!ixLoad) return;

  const displacement = signed8(rom[displacementOffset]);
  const address = (ixLoad.base + displacement) & 0xffffff;
  const target = targetByAddress.get(address);
  if (!target) return;

  matches.push({
    offset,
    target: target.name,
    instruction: `${instruction} ; IX loaded with ${hex24(ixLoad.base)} at ${hexAddress(ixLoad.offset)}`,
    length,
    context: contextFor(offset, length),
  });
}

function findIxHeuristicMatches() {
  const matches = [];

  for (let offset = 0; offset < rom.length; offset++) {
    if (rom[offset] !== 0xdd) continue;

    const opcode = rom[offset + 1];

    if (opcode === 0x34) {
      addIxHeuristicMatch(matches, offset, offset + 2, 'INC (IX+d)', 3);
    } else if (opcode === 0x35) {
      addIxHeuristicMatch(matches, offset, offset + 2, 'DEC (IX+d)', 3);
    } else if (opcode === 0x36) {
      addIxHeuristicMatch(matches, offset, offset + 2, 'LD (IX+d),n', 4);
    } else if (opcode >= 0x70 && opcode <= 0x77 && opcode !== 0x76) {
      const register = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][opcode - 0x70];
      addIxHeuristicMatch(matches, offset, offset + 2, `LD (IX+d),${register}`, 3);
    } else if (opcode === 0xcb) {
      const bitOpcode = rom[offset + 3];
      const bit = (bitOpcode >> 3) & 0x07;
      if ((bitOpcode & 0xc7) === 0x86) {
        addIxHeuristicMatch(matches, offset, offset + 2, `RES ${bit},(IX+d)`, 4);
      } else if ((bitOpcode & 0xc7) === 0xc6) {
        addIxHeuristicMatch(matches, offset, offset + 2, `SET ${bit},(IX+d)`, 4);
      }
    }
  }

  return matches.sort(compareMatches);
}

function printMatch(match) {
  console.log(`${hexAddress(match.offset)}  ${match.target}  ${match.instruction}`);
  console.log(`  before: ${match.context.before}`);
  console.log(`  match : ${match.context.match}`);
  console.log(`  after : ${match.context.after}`);
}

function printSummary(matches) {
  const summary = new Map();
  for (const match of matches) {
    const key = `${match.target} | ${match.instruction}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  console.log('Summary by target/instruction:');
  if (summary.size === 0) {
    console.log('  none');
    return;
  }

  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

const directMatches = findPatternMatches();
const ixHeuristicMatches = findIxHeuristicMatches();
const allMatches = [...directMatches, ...ixHeuristicMatches].sort(compareMatches);

console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
console.log(`ROM size: ${rom.length} bytes (${hexAddress(rom.length)} bytes)`);
console.log(`Targets: ${targets.map((target) => target.name).join(', ')}`);
console.log('');

console.log(`Full-ROM direct/IY pattern matches: ${directMatches.length}`);
for (const match of directMatches) printMatch(match);
console.log('');

console.log(`Full-ROM IX heuristic matches: ${ixHeuristicMatches.length}`);
console.log('IX heuristic requires a nearby DD 21 imm24 load within 128 bytes before the write.');
for (const match of ixHeuristicMatches) printMatch(match);
console.log('');

console.log('Known-region checks:');
for (const region of regions) {
  const matches = allMatches.filter((match) => match.offset >= region.start && match.offset < region.end);
  console.log(`${region.name} ${hexAddress(region.start)}-${hexAddress(region.end)}: ${matches.length}`);
  for (const match of matches) printMatch(match);
}
console.log('');

printSummary(allMatches);
