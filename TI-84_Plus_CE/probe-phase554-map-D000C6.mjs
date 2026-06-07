import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = readFileSync(ROM_PATH);

const targets = [
  { name: 'D000C5', value: 0xD000C5, bytes: [0xC5, 0x00, 0xD0] },
  { name: 'D000C6', value: 0xD000C6, bytes: [0xC6, 0x00, 0xD0] },
  { name: 'D000C7', value: 0xD000C7, bytes: [0xC7, 0x00, 0xD0] },
];

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const bitOps = [
  { min: 0x40, max: 0x7F, op: 'BIT' },
  { min: 0x80, max: 0xBF, op: 'RES' },
  { min: 0xC0, max: 0xFF, op: 'SET' },
];

const summaries = new Map();

for (const target of targets) {
  summaries.set(target.name, {
    refs: [],
    ops: new Map(),
    bits: new Map(),
  });
}

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(offset, count) {
  return Array.from(rom.subarray(Math.max(0, offset), Math.min(rom.length, offset + count)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function inRange(offset) {
  return offset >= 0 && offset < rom.length;
}

function isTargetAt(offset, target) {
  return inRange(offset + 2)
    && rom[offset] === target.bytes[0]
    && rom[offset + 1] === target.bytes[1]
    && rom[offset + 2] === target.bytes[2];
}

function cbInfo(opcode) {
  const group = bitOps.find((candidate) => opcode >= candidate.min && opcode <= candidate.max);
  if (!group) return null;
  return {
    op: group.op,
    bit: (opcode >> 3) & 7,
    operand: reg8[opcode & 7],
    opcode,
  };
}

function findNextHlBitOp(start, limit = 24) {
  for (let i = start; i < Math.min(rom.length - 1, start + limit); i++) {
    if (rom[i] !== 0xCB) continue;
    const info = cbInfo(rom[i + 1]);
    if (info?.operand === '(HL)') {
      return {
        ...info,
        offset: i,
        instruction: `${info.op} ${info.bit},(HL)`,
      };
    }
  }
  return null;
}

function findPreviousHlLoad(refOffset, target) {
  for (let i = Math.max(0, refOffset - 48); i <= refOffset; i++) {
    if (rom[i] === 0x21 && isTargetAt(i + 1, target)) {
      return {
        offset: i,
        prefix: null,
        instruction: `LD HL,${target.name}`,
      };
    }
    if (rom[i] === 0x40 && rom[i + 1] === 0x21 && isTargetAt(i + 2, target)) {
      return {
        offset: i,
        prefix: 'SIS',
        instruction: `SIS LD HL,${target.name}`,
      };
    }
  }
  return null;
}

function classifyDirect(refOffset, target) {
  const prev1 = rom[refOffset - 1];
  const prev2 = rom[refOffset - 2];

  if (prev1 === 0x3A) {
    return {
      kind: 'read',
      op: 'LD A,(addr)',
      instruction: `LD A,(${target.name})`,
      detail: 'direct byte read into A',
    };
  }

  if (prev1 === 0x32) {
    return {
      kind: 'write',
      op: 'LD (addr),A',
      instruction: `LD (${target.name}),A`,
      detail: 'direct byte write from A',
    };
  }

  if (prev1 === 0x21) {
    const bit = findNextHlBitOp(refOffset + 3);
    if (bit) {
      return {
        kind: bit.op.toLowerCase(),
        op: bit.op,
        bit: bit.bit,
        instruction: `LD HL,${target.name}; ${bit.instruction}`,
        detail: `${bit.op} bit ${bit.bit} through (HL) at ${hex(bit.offset)}`,
      };
    }
    return {
      kind: 'address-load',
      op: 'LD HL,addr',
      instruction: `LD HL,${target.name}`,
      detail: 'address loaded into HL; inspect following code for indirect byte use',
    };
  }

  if (prev2 === 0x40 && prev1 === 0x21) {
    return {
      kind: 'address-load',
      op: 'SIS LD HL,addr',
      instruction: `SIS LD HL,${target.name}`,
      detail: 'SIS-prefixed address load; likely not a 24-bit ADL RAM reference unless followed by explicit ADL access',
    };
  }

  return {
    kind: 'unknown',
    op: 'embedded-address',
    instruction: `?? ${target.name}`,
    detail: 'target byte pattern found, but preceding opcode is not one of the common direct/address-load forms',
  };
}

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function bitMeaning(addressName, bit) {
  if (addressName === 'D000C6' && bit === 2) {
    return 'known from Session 553: framebuffer BPP mode selector, BIT 2 NZ = 8bpp path and Z = 16bpp path';
  }
  return 'unknown from static reference scan; inspect callers/control flow around listed ROM offsets';
}

function scanTarget(target) {
  const summary = summaries.get(target.name);

  for (let i = 0; i < rom.length - 2; i++) {
    if (!isTargetAt(i, target)) continue;

    const classification = classifyDirect(i, target);
    const hlLoad = findPreviousHlLoad(i, target);
    const contextStart = Math.max(0, i - 10);
    const contextBytes = bytesAt(contextStart, 28);
    const ref = {
      offset: i,
      instrOffset: classification.instruction.startsWith('LD HL') ? i - 1 : i - 1,
      target: target.name,
      ...classification,
      contextStart,
      contextBytes,
      previousHlLoad: hlLoad,
    };

    summary.refs.push(ref);
    addCount(summary.ops, classification.op);
    if (classification.bit !== undefined) {
      const key = `${classification.op} bit ${classification.bit}`;
      addCount(summary.bits, key);
    }
  }
}

function printRef(ref) {
  const bitText = ref.bit === undefined ? '' : ` bit=${ref.bit}`;
  const prevText = ref.previousHlLoad && ref.previousHlLoad.offset !== ref.offset - 1
    ? ` previous-HL-load=${hex(ref.previousHlLoad.offset)}`
    : '';

  console.log(`${hex(ref.offset)} ${ref.target}: ${ref.instruction}`);
  console.log(`  category=${ref.kind} op=${ref.op}${bitText}${prevText}`);
  console.log(`  detail: ${ref.detail}`);
  console.log(`  bytes ${hex(ref.contextStart)}: ${ref.contextBytes}`);
}

function printSummaryForTarget(target) {
  const summary = summaries.get(target.name);
  console.log('');
  console.log(`=== ${target.name} summary ===`);
  console.log(`total refs: ${summary.refs.length}`);

  console.log('operations:');
  for (const [op, count] of [...summary.ops.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${op}: ${count}`);
  }

  const bitEntries = [...summary.bits.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (bitEntries.length) {
    console.log('bit operations:');
    for (const [bitOp, count] of bitEntries) {
      const bit = Number(bitOp.match(/bit (\d+)/)?.[1]);
      console.log(`  ${bitOp}: ${count} (${bitMeaning(target.name, bit)})`);
    }
  } else {
    console.log('bit operations: none directly recognized');
  }
}

console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length} bytes`);
console.log('Scanning for little-endian RAM address byte patterns C5/C6/C7 00 D0...');

for (const target of targets) {
  scanTarget(target);
}

for (const target of targets) {
  console.log('');
  console.log(`=== ${target.name} references ===`);
  const refs = summaries.get(target.name).refs;
  if (!refs.length) {
    console.log('none found');
    continue;
  }
  for (const ref of refs) {
    printRef(ref);
  }
}

console.log('');
console.log('=== Combined summary ===');
let combinedRefs = 0;
for (const target of targets) {
  combinedRefs += summaries.get(target.name).refs.length;
}
console.log(`total adjacent-block refs: ${combinedRefs}`);

for (const target of targets) {
  printSummaryForTarget(target);
}

const d000c6 = summaries.get('D000C6');
console.log('');
console.log('=== D000C6 bit-level notes ===');
if (!d000c6.refs.length) {
  console.log('No D000C6 references found.');
} else {
  const seenBits = new Set(
    d000c6.refs
      .filter((ref) => ref.bit !== undefined)
      .map((ref) => ref.bit),
  );
  if (!seenBits.size) {
    console.log('No direct BIT/SET/RES operations were recognized after LD HL,D000C6.');
  } else {
    for (const bit of [...seenBits].sort((a, b) => a - b)) {
      console.log(`bit ${bit}: ${bitMeaning('D000C6', bit)}`);
    }
  }

  const directReads = d000c6.refs.filter((ref) => ref.kind === 'read').length;
  const directWrites = d000c6.refs.filter((ref) => ref.kind === 'write').length;
  console.log(`direct byte reads: ${directReads}`);
  console.log(`direct byte writes: ${directWrites}`);
  console.log('Unknown/address-load refs should be traced manually from the printed context bytes to identify whole-byte masks or indirect writers.');
}
