#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const VECTOR_BASE = 0x000200;
const VECTOR_END = 0x000400;
const ENTRY_SIZE = 4;
const TOP_N = 10;

const CALL_OPS = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseNames(incText) {
  const nameByAddr = new Map();
  const re = /^\?([A-Za-z_][A-Za-z0-9_.]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;
  while ((match = re.exec(incText)) !== null) {
    nameByAddr.set(parseInt(match[2], 16), match[1]);
  }
  return nameByAddr;
}

function readVectors(rom, nameByAddr) {
  const entries = [];
  for (let addr = VECTOR_BASE; addr < VECTOR_END; addr += ENTRY_SIZE) {
    const opcode = rom[addr];
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    entries.push({
      vector: addr,
      opcode,
      target,
      name: nameByAddr.get(addr) || '(unnamed)',
      valid: opcode === 0xC3,
    });
  }
  return entries;
}

function countRomCalls(rom) {
  const counts = new Map();
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const op = rom[pc];
    if (!CALL_OPS.has(op)) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (target < VECTOR_BASE || target >= VECTOR_END) continue;
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  return counts;
}

function countLiftedCalls(preliftedBlocks) {
  const sitesByTarget = new Map();
  for (const block of Object.values(preliftedBlocks)) {
    for (const inst of block.instructions || []) {
      if (inst.tag !== 'call' && inst.tag !== 'call-conditional') continue;
      if (inst.target < VECTOR_BASE || inst.target >= VECTOR_END) continue;
      let sites = sitesByTarget.get(inst.target);
      if (!sites) {
        sites = new Set();
        sitesByTarget.set(inst.target, sites);
      }
      sites.add(`${inst.mode}:${inst.pc.toString(16)}`);
    }
  }

  const counts = new Map();
  for (const [target, sites] of sitesByTarget.entries()) {
    counts.set(target, sites.size);
  }
  return counts;
}

function table(rows, columns) {
  const widths = columns.map((col) => {
    const headerWidth = col.label.length;
    const cellWidth = Math.max(...rows.map((row) => String(row[col.key] ?? '').length), 0);
    return Math.max(headerWidth, cellWidth);
  });

  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join('  ');
  const rule = columns.map((_, i) => '-'.repeat(widths[i])).join('  ');
  const body = rows.map((row) =>
    columns.map((col, i) => String(row[col.key] ?? '').padEnd(widths[i])).join('  ')
  );

  return [header, rule, ...body].join('\n');
}

async function main() {
  const rom = readFileSync(ROM_PATH);
  const incText = readFileSync(INC_PATH, 'utf8');
  const nameByAddr = parseNames(incText);
  const vectors = readVectors(rom, nameByAddr);

  const romCalls = countRomCalls(rom);

  let liftedCalls = new Map();
  try {
    const transpiled = await import(pathToFileURL(JS_PATH).href);
    liftedCalls = countLiftedCalls(transpiled.PRELIFTED_BLOCKS);
  } catch (error) {
    console.warn(`warning: could not load ${JS_PATH}: ${error.message}`);
  }

  const ranked = vectors
    .map((entry) => ({
      vector: hex(entry.vector),
      name: entry.name,
      target: hex(entry.target),
      romCalls: romCalls.get(entry.vector) || 0,
      liftedCalls: liftedCalls.get(entry.vector) || 0,
      valid: entry.valid ? 'JP' : hex(entry.opcode, 2),
    }))
    .sort((a, b) => b.romCalls - a.romCalls || a.vector.localeCompare(b.vector))
    .slice(0, TOP_N);

  console.log('Phase 312: Top low-address vectors');
  console.log(`Vector range: ${hex(VECTOR_BASE)}..${hex(VECTOR_END)}`);
  console.log(`Entries: ${(VECTOR_END - VECTOR_BASE) / ENTRY_SIZE}`);
  console.log('');
  console.log('Notes:');
  console.log('- romCalls = direct ROM scan of CALL and conditional CALL opcodes.');
  console.log('- liftedCalls = unique lifted call sites from ROM.transpiled.js.');
  console.log('- The lifted ranking matches the same hot set, but the ROM count is authoritative.');
  console.log('');
  console.log(table(ranked, [
    { key: 'vector', label: 'Vector' },
    { key: 'name', label: 'Name' },
    { key: 'target', label: 'Target' },
    { key: 'romCalls', label: 'ROM Calls' },
    { key: 'liftedCalls', label: 'Lifted Calls' },
    { key: 'valid', label: 'Op' },
  ]));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
