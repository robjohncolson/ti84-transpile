#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

const rom = fs.readFileSync(ROM_PATH);
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

function disasmRegion(start, end, mode, label) {
  console.log(`\n=== ${label} (${mode} mode) ===`);
  let offset = start;
  const ios = [];
  const calls = [];
  const ramRefs = [];
  while (offset < end) {
    const instr = decodeInstruction(rom, offset, mode);
    if (!instr || !instr.length) { console.log(`  ${hex(offset)}: ??? (decode failed)`); offset++; continue; }

    const fields = [];
    if (instr.tag) fields.push(instr.tag);
    if (instr.op) fields.push(`op=${instr.op}`);
    if (instr.dest) fields.push(`dest=${instr.dest}`);
    if (instr.src) fields.push(`src=${instr.src}`);
    if (instr.pair) fields.push(`pair=${instr.pair}`);
    if (instr.value !== undefined && instr.value !== null) fields.push(`value=${hex(instr.value)}`);
    if (instr.addr !== undefined && instr.addr !== null) fields.push(`addr=${hex(instr.addr)}`);
    if (instr.target !== undefined && instr.target !== null) fields.push(`target=${hex(instr.target)}`);
    if (instr.port !== undefined && instr.port !== null) fields.push(`port=${hex(instr.port, 2)}`);
    if (instr.condition) fields.push(`cond=${instr.condition}`);
    if (instr.reg) fields.push(`reg=${instr.reg}`);
    if (instr.bit !== undefined && instr.bit !== null) fields.push(`bit=${instr.bit}`);
    if (instr.terminates) fields.push('TERM');

    console.log(`  ${hex(offset)} [${instr.length}]: ${fields.join(' ')}`);

    if (instr.tag && (instr.tag.includes('in0') || instr.tag.includes('out0'))) ios.push({ addr: offset, port: instr.port, tag: instr.tag });
    if (instr.tag && (instr.tag === 'call' || instr.tag === 'jp') && instr.target) calls.push({ addr: offset, target: instr.target });
    if (instr.addr !== undefined && instr.addr >= 0xD00000 && instr.addr <= 0xD1FFFF) ramRefs.push({ addr: offset, ramAddr: instr.addr });

    offset += instr.length;
  }
  if (ios.length) { console.log(`  I/O ports: ${ios.map(i => `${hex(i.addr)}:port=${hex(i.port,2)}(${i.tag})`).join(', ')}`); }
  if (calls.length) { console.log(`  CALL/JP targets: ${calls.map(c => `${hex(c.addr)}->${hex(c.target)}`).join(', ')}`); }
  if (ramRefs.length) { console.log(`  RAM refs (0xD0xxxx): ${ramRefs.map(r => `${hex(r.addr)}->${hex(r.ramAddr)}`).join(', ')}`); }
}

console.log('Phase 352: Region disassembly — furthest boot point + missing block + hot loops');
console.log('================================================================================');

disasmRegion(0x0158F8, 0x015960, 'adl', '0x0158F8: Furthest PC reached during 10K boot');
disasmRegion(0x00D7BE, 0x00D830, 'z80', '0x00D7BE: Missing block (hit 4x during boot)');
disasmRegion(0x006114, 0x006180, 'adl', '0x006114: Hot loop area (LCD/memory init)');

console.log('\n--- probe complete ---');
