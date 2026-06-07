import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x025762;
const NEARBY_START = 0x025758;
const MAX_INSTRUCTIONS = 80;

const annotations = new Map([
  [0xd02611, 'D02611'],
  [0xd025cf, 'D025CF'],
  [0xd000b5, 'D000B5 / IY+0x35'],
  [0xd00080, 'D00080 / IY base'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len));
}

function formatBytes(bytes) {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function decodeAt(pc) {
  const decoded = decodeInstruction(rom, pc);
  if (Array.isArray(decoded)) {
    const [mnemonic, size] = decoded;
    return { mnemonic, size };
  }
  if (decoded && typeof decoded === 'object') {
    return {
      mnemonic: decoded.mnemonic ?? decoded.text ?? decoded.instruction ?? String(decoded),
      size: decoded.size ?? decoded.length ?? decoded.bytes?.length ?? 1,
    };
  }
  return { mnemonic: String(decoded), size: 1 };
}

function annotateMnemonic(mnemonic) {
  const matches = [];
  for (const [addr, label] of annotations) {
    const bare = addr.toString(16).toUpperCase();
    const prefixed = hex(addr);
    if (mnemonic.toUpperCase().includes(bare) || mnemonic.toUpperCase().includes(prefixed.toUpperCase())) {
      matches.push(label);
    }
  }
  return matches.length ? `${mnemonic} ; ${matches.join(', ')}` : mnemonic;
}

function isFunctionEndingJump(mnemonic) {
  const normalized = mnemonic.trim().toUpperCase();
  if (normalized === 'RET' || normalized.startsWith('RET ')) return true;
  if (normalized === 'RETI' || normalized === 'RETN') return true;
  return normalized.startsWith('JP ') && !normalized.startsWith('JP Z,') && !normalized.startsWith('JP NZ,') &&
    !normalized.startsWith('JP C,') && !normalized.startsWith('JP NC,') && !normalized.startsWith('JP M,') &&
    !normalized.startsWith('JP P,') && !normalized.startsWith('JP PE,') && !normalized.startsWith('JP PO,');
}

function disassemble(start, maxInstructions = MAX_INSTRUCTIONS) {
  let pc = start;
  const rows = [];
  for (let i = 0; i < maxInstructions && pc < rom.length; i += 1) {
    const decoded = decodeAt(pc);
    const size = Math.max(1, decoded.size);
    const raw = bytesAt(pc, size);
    const mnemonic = annotateMnemonic(decoded.mnemonic);
    rows.push({ addr: pc, raw, mnemonic, size });
    pc += size;
    if (isFunctionEndingJump(decoded.mnemonic)) break;
  }
  return rows;
}

function printRows(title, rows) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`${hex(row.addr)}  ${formatBytes(row.raw).padEnd(14)}  ${row.mnemonic}`);
  }
}

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function printXrefs() {
  const patterns = [
    { name: 'CALL 0x025762', bytes: [0xcd, 0x62, 0x57, 0x02] },
    { name: 'JP 0x025762', bytes: [0xc3, 0x62, 0x57, 0x02] },
    { name: 'JP Z,0x025762', bytes: [0xca, 0x62, 0x57, 0x02] },
  ];

  console.log('\nXrefs to 0x025762');
  console.log('----------------');
  for (const pattern of patterns) {
    const hits = findPattern(pattern.bytes);
    console.log(`${pattern.name} (${formatBytes(pattern.bytes)}): ${hits.length} hit(s)`);
    for (const hit of hits) {
      console.log(`  ${hex(hit)}  ${formatBytes(bytesAt(hit, pattern.bytes.length))}`);
    }
  }
}

function printFlowCheck() {
  const nearbyRows = disassemble(NEARBY_START, 16);
  const flowsIntoTarget = nearbyRows.some((row) => row.addr === START);
  printRows(`Flow check from ${hex(NEARBY_START)}`, nearbyRows);
  console.log(`\n0x025758 ${flowsIntoTarget ? 'does' : 'does not'} decode into ${hex(START)} within this linear pass.`);
}

printRows(`Disassembly from ${hex(START)}`, disassemble(START));
printXrefs();
printFlowCheck();
