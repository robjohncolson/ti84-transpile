#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const STARTS = [
  { label: 'nearby handler 06FA30', address: 0x06fa30 },
  { label: 'key handler 06FA60', address: 0x06fa60 },
];

const MIN_BYTES = 96;
const MAX_BYTES = 256;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function readBytes(address, count) {
  return rom.subarray(address, Math.min(rom.length, address + count));
}

function normalizeDecoded(decoded, address) {
  if (!decoded) {
    return {
      length: 1,
      mnemonic: 'db',
      operands: [`$${rom[address].toString(16).toUpperCase().padStart(2, '0')}`],
    };
  }

  if (Array.isArray(decoded)) {
    return normalizeDecoded({
      length: decoded[1],
      mnemonic: decoded[0]?.mnemonic ?? decoded[0]?.op ?? decoded[0],
      operands: decoded[0]?.operands ?? decoded[0]?.args ?? [],
    }, address);
  }

  const length = decoded.length ?? decoded.size ?? decoded.bytes?.length ?? decoded.byteLength ?? 1;
  const text = decoded.text ?? decoded.disasm ?? decoded.asm ?? decoded.instruction;
  const mnemonic = decoded.mnemonic ?? decoded.opcode ?? decoded.op ?? (typeof text === 'string' ? text.split(/\s+/, 1)[0] : '???');
  let operands = decoded.operands ?? decoded.args ?? decoded.operand ?? '';

  if (typeof text === 'string' && (!operands || operands.length === 0)) {
    operands = text.slice(String(mnemonic).length).trim();
  }

  if (!Array.isArray(operands)) {
    operands = operands ? [String(operands)] : [];
  }

  return { length, mnemonic: String(mnemonic), operands };
}

function decodeAt(address) {
  const window = readBytes(address, 16);

  for (const args of [
    [rom, address],
    [window, address],
    [window, 0, address],
    [rom, address, true],
  ]) {
    try {
      const normalized = normalizeDecoded(decodeInstruction(...args), address);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Try the next known call shape.
    }
  }

  return normalizeDecoded(null, address);
}

function isTerminal(mnemonic, operands) {
  const m = mnemonic.toLowerCase();
  const ops = operands.join(', ').toLowerCase();
  if (m === 'ret' || m === 'reti' || m === 'retn') return true;
  if (m === 'jp' && !/^(z|nz|c|nc|m|p|pe|po),/.test(ops)) return true;
  return false;
}

function collectRefs(text, summary) {
  const targetPattern = /\b(?:call|jp|jr)\s+(?:[a-z]{1,2},\s*)?(?:0x|\$)?([0-9a-f]{4,6})\b/ig;
  for (const match of text.matchAll(targetPattern)) {
    summary.targets.add(hex(Number.parseInt(match[1], 16)));
  }

  const ramPattern = /\b(?:0x|\$)([d-f][0-9a-f]{5}|[89a-f][0-9a-f]{3})\b/ig;
  for (const match of text.matchAll(ramPattern)) {
    summary.ramRefs.add(hex(Number.parseInt(match[1], 16), match[1].length));
  }

  const iyPattern = /\(iy\s*([+-]\s*(?:0x|\$)?[0-9a-f]+)\)/ig;
  for (const match of text.matchAll(iyPattern)) {
    summary.iyOffsets.add(`IY${match[1].replace(/\s+/g, '')}`);
  }

  const portPattern = /\(\s*(?:0x|\$)([0-9a-f]{2,4})\s*\)/ig;
  for (const match of text.matchAll(portPattern)) {
    summary.ports.add(hex(Number.parseInt(match[1], 16), match[1].length));
  }
}

function decodeBlock(start, label) {
  const summary = {
    targets: new Set(),
    ramRefs: new Set(),
    iyOffsets: new Set(),
    ports: new Set(),
    terminals: 0,
    bytes: 0,
    instructions: 0,
  };

  console.log(`\n=== ${label} @ ${hex(start)} ===`);

  let pc = start;
  while (pc < rom.length && summary.bytes < MAX_BYTES) {
    const decoded = decodeAt(pc);
    const bytes = readBytes(pc, decoded.length);
    const operands = decoded.operands.join(', ');
    const text = `${decoded.mnemonic}${operands ? ` ${operands}` : ''}`;

    console.log(`${hex(pc)}  ${byteHex(bytes).padEnd(18)}  ${text}`);
    collectRefs(text, summary);

    summary.instructions += 1;
    summary.bytes += decoded.length;
    if (isTerminal(decoded.mnemonic, decoded.operands)) {
      summary.terminals += 1;
      if (summary.bytes >= MIN_BYTES || summary.terminals >= 2) break;
    }

    pc += decoded.length;
  }

  console.log(`\nSummary for ${hex(start)}:`);
  console.log(`  instructions: ${summary.instructions}`);
  console.log(`  bytes decoded: ${summary.bytes}`);
  console.log(`  terminal instructions: ${summary.terminals}`);
  console.log(`  CALL/JP/JR targets: ${Array.from(summary.targets).sort().join(', ') || '(none)'}`);
  console.log(`  RAM refs: ${Array.from(summary.ramRefs).sort().join(', ') || '(none)'}`);
  console.log(`  IY offsets: ${Array.from(summary.iyOffsets).sort().join(', ') || '(none)'}`);
  console.log(`  ports: ${Array.from(summary.ports).sort().join(', ') || '(none)'}`);
}

console.log(`ROM: ${romPath}`);
console.log(`ROM size: ${rom.length} bytes`);

for (const { address, label } of STARTS) {
  decodeBlock(address, label);
}
