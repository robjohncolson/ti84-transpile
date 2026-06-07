import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mem = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const ROM_SIZE = 0x400000;
const CONTEXT_BEFORE = 16;
const CONTEXT_AFTER = 24;

const targets = [
  {
    name: 'D014FE cursor Y / row count',
    addr: 0xD014FE,
    bytes: [0xFE, 0x14, 0xD0],
  },
  {
    name: 'D01501 display width',
    addr: 0xD01501,
    bytes: [0x01, 0x15, 0xD0],
  },
  {
    name: 'D008D5 renderer Y coordinate',
    addr: 0xD008D5,
    bytes: [0xD5, 0x08, 0xD0],
  },
];

const opcodes = [
  { bytes: [0x3A], text: 'LD A,(nn)', kind: 'read', mode: 'u24' },
  { bytes: [0x32], text: 'LD (nn),A', kind: 'write', mode: 'u24' },
  { bytes: [0x2A], text: 'LD HL,(nn)', kind: 'read', mode: 'u24' },
  { bytes: [0x22], text: 'LD (nn),HL', kind: 'write', mode: 'u24' },
  { bytes: [0xED, 0x4B], text: 'LD BC,(nn)', kind: 'read', mode: 'u24' },
  { bytes: [0xED, 0x5B], text: 'LD DE,(nn)', kind: 'read', mode: 'u24' },
  { bytes: [0xED, 0x43], text: 'LD (nn),BC', kind: 'write', mode: 'u24' },
  { bytes: [0xED, 0x53], text: 'LD (nn),DE', kind: 'write', mode: 'u24' },
  { bytes: [0xED, 0x6B], text: 'LD HL,(nn)', kind: 'read', mode: 'u24' },
  { bytes: [0xED, 0x63], text: 'LD (nn),HL', kind: 'write', mode: 'u24' },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function formatBytes(addr, length) {
  const bytes = [];
  for (let offset = 0; offset < length && addr + offset < ROM_SIZE; offset++) {
    bytes.push(byteHex(mem[addr + offset]));
  }
  return bytes.join(' ');
}

function bytesEqual(addr, bytes) {
  if (addr < 0 || addr + bytes.length > ROM_SIZE) {
    return false;
  }
  for (let i = 0; i < bytes.length; i++) {
    if (mem[addr + i] !== bytes[i]) {
      return false;
    }
  }
  return true;
}

function readU24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function classifyHit(hitAddr, targetAddr) {
  const matches = [];

  for (const opcode of opcodes) {
    const opStart = hitAddr - opcode.bytes.length;
    if (!bytesEqual(opStart, opcode.bytes)) {
      continue;
    }
    if (opcode.mode === 'u24' && readU24(hitAddr) !== targetAddr) {
      continue;
    }
    matches.push({
      opStart,
      kind: opcode.kind,
      text: opcode.text,
      bytes: formatBytes(opStart, opcode.bytes.length + 3),
    });
  }

  if (matches.length > 0) {
    return matches;
  }

  return [{
    opStart: hitAddr,
    kind: 'unknown',
    text: 'raw address bytes',
    bytes: formatBytes(hitAddr, 3),
  }];
}

function findTargetHits(target) {
  const hits = [];

  for (let addr = 0; addr <= ROM_SIZE - target.bytes.length; addr++) {
    if (!bytesEqual(addr, target.bytes)) {
      continue;
    }

    const classifications = classifyHit(addr, target.addr);
    const contextStart = Math.max(0, addr - CONTEXT_BEFORE);
    const contextEnd = Math.min(ROM_SIZE, addr + target.bytes.length + CONTEXT_AFTER);

    hits.push({
      addr,
      classifications,
      contextStart,
      context: formatBytes(contextStart, contextEnd - contextStart),
    });
  }

  return hits;
}

function printTarget(target) {
  const hits = findTargetHits(target);
  const counts = { read: 0, write: 0, unknown: 0 };

  console.log('');
  console.log(`=== ${target.name} (${hex(target.addr)}) ===`);
  console.log(`Address byte pattern: ${target.bytes.map(byteHex).join(' ')}`);

  for (const hit of hits) {
    const labels = hit.classifications.map((classification) => {
      counts[classification.kind] = (counts[classification.kind] ?? 0) + 1;
      return `${classification.kind}:${classification.text}@${hex(classification.opStart)}`;
    });

    console.log('');
    console.log(`hit ${hex(hit.addr)} classifications=${labels.join(', ')}`);
    for (const classification of hit.classifications) {
      console.log(`  op ${hex(classification.opStart)} ${classification.kind} ${classification.text} bytes=${classification.bytes}`);
    }
    console.log(`  context ${hex(hit.contextStart)}: ${hit.context}`);
  }

  console.log('');
  console.log(`summary ${target.name}: total=${hits.length} read=${counts.read} write=${counts.write} unknown=${counts.unknown}`);
  return { target, hits, counts };
}

console.log('Probe phase555: map D014FE, D01501, and D008D5 ROM references');
console.log(`ROM range searched: ${hex(0)}-${hex(ROM_SIZE - 1)}`);

const summaries = targets.map(printTarget);

console.log('');
console.log('=== Cross-reference candidates ===');
for (let i = 0; i < summaries.length; i++) {
  for (let j = i + 1; j < summaries.length; j++) {
    const left = summaries[i];
    const right = summaries[j];
    const pairs = [];

    for (const leftHit of left.hits) {
      for (const rightHit of right.hits) {
        const distance = Math.abs(leftHit.addr - rightHit.addr);
        if (distance <= 0x80) {
          pairs.push(`${hex(leftHit.addr)} <-> ${hex(rightHit.addr)} distance=${hex(distance, 2)}`);
        }
      }
    }

    console.log(`${left.target.name} vs ${right.target.name}: nearby<=0x80 count=${pairs.length}`);
    for (const pair of pairs) {
      console.log(`  ${pair}`);
    }
  }
}

console.log('');
console.log('=== Summary counts ===');
for (const summary of summaries) {
  console.log(`${summary.target.name}: total=${summary.hits.length} read=${summary.counts.read} write=${summary.counts.write} unknown=${summary.counts.unknown}`);
}
