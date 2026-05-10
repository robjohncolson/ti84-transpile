#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TARGET = 0x0159C0;
const DECODE_START = 0x015960;
const DEEP_SCAN_START = 0x015900;
const CODE_REGION_END = 0x0C0000;

// Tags that unconditionally terminate a basic block
const UNCONDITIONAL_TERMINATORS = new Set(['ret', 'reti', 'retn', 'jp', 'rst']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesAt(buffer, addr, len) {
  return Array.from(buffer.subarray(addr, addr + len))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';
  const idx = `(${inst.indexRegister ?? 'ix'}${(inst.displacement ?? 0) >= 0 ? '+' : ''}${inst.displacement ?? 0})`;
  switch (inst.tag) {
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem': return `ld ${inst.dest ?? inst.dst}, (${hex(inst.addr)})`;
    case 'ld-pair-mem': return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `ld ${inst.dest ?? inst.dst}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-ind': return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-reg': return `ld (${inst.dest ?? inst.ptr}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (hl), ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-ixd-reg': return `ld ${idx}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${idx}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${idx}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ixd': return `inc ${idx}`;
    case 'dec-ixd': return `dec ${idx}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'nop': return 'nop';
    case 'xor': return 'xor a';
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'add-pair': return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'rra': return 'rra';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rlca': return 'rlca';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'in-reg': return `in ${inst.reg ?? 'a'}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg ?? 'a'}`;
    case 'in0': return `in0 ${inst.reg ?? 'a'}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg ?? 'a'}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-de-hl': return 'ex de, hl';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rst': return `rst ${hex(inst.target ?? inst.vector ?? 0, 2)}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-imm': return `ld sp, ${hex(inst.value)}`;
    case 'ld-indexed-pair': return `ld ${idx}, ${inst.pair ?? inst.src}`;
    case 'ld-pair-indexed': return `ld ${inst.pair ?? inst.dest}, ${idx}`;
    default: return inst.dasm ?? inst.tag ?? '??';
  }
}

function isUnconditionalTerminator(inst) {
  if (!inst) return false;
  return UNCONDITIONAL_TERMINATORS.has(inst.tag);
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] & 0xFF) |
    ((buffer[offset + 1] & 0xFF) << 8) |
    ((buffer[offset + 2] & 0xFF) << 16)
  ) >>> 0;
}

function disassembleRange(rom, start, end) {
  const instructions = [];
  let pc = start;

  while (pc < end) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {}
    const len = Math.max(1, inst?.length ?? 1);
    instructions.push({ pc, len, inst, tag: inst?.tag ?? null });
    pc += len;
  }

  return { instructions, endPc: pc };
}

function main() {
  console.log('=== Phase 288: 0x0159C0 Fall-Through Analysis ===\n');

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM loaded: ${rom.length} bytes\n`);

  // --- Part 1: Disassemble from DECODE_START to TARGET ---
  console.log(`--- Disassembly from ${hex(DECODE_START)} to ${hex(TARGET)} ---\n`);

  const { instructions, endPc } = disassembleRange(rom, DECODE_START, TARGET);

  for (const { pc, len, inst } of instructions) {
    const bytes = bytesAt(rom, pc, len);
    const text = formatInstruction(inst);
    console.log(`  ${hex(pc)}  ${bytes.padEnd(20)}  ${text}`);
  }

  if (endPc !== TARGET) {
    console.log(`\n  WARNING: Decode ended at ${hex(endPc)}, not aligned to target ${hex(TARGET)}`);
    console.log(`  Misalignment of ${endPc - TARGET} bytes — instruction boundaries may be wrong.`);
  } else {
    console.log(`\n  Decode aligned perfectly to ${hex(TARGET)}.`);
  }

  // --- Part 2: Analyze the last instruction before TARGET ---
  console.log(`\n--- Last Instruction Before ${hex(TARGET)} ---\n`);

  if (instructions.length === 0) {
    console.log('  No instructions decoded!');
    return;
  }

  const lastInstr = instructions[instructions.length - 1];
  const lastEnd = lastInstr.pc + lastInstr.len;
  const lastBytes = bytesAt(rom, lastInstr.pc, lastInstr.len);
  const lastText = formatInstruction(lastInstr.inst);

  console.log(`  Address:  ${hex(lastInstr.pc)}`);
  console.log(`  Bytes:    ${lastBytes}`);
  console.log(`  Decoded:  ${lastText}`);
  console.log(`  Tag:      ${lastInstr.tag ?? '(none)'}`);
  console.log(`  Ends at:  ${hex(lastEnd)}`);

  const terminator = isUnconditionalTerminator(lastInstr.inst);
  console.log(`\n  Is unconditional block terminator? ${terminator ? 'YES' : 'NO'}`);

  if (terminator) {
    console.log(`\n  CONCLUSION: Fall-through is NOT possible.`);
    console.log(`  0x0159C0 is a SEPARATE function entry point.`);
    console.log(`  It must be reached via an indirect mechanism (vector table, computed jump, etc.)`);
  } else {
    console.log(`\n  CONCLUSION: Fall-through IS possible.`);
    console.log(`  The preceding code flows directly into 0x0159C0.`);

    // Look further back for a block terminator to find the function boundary
    console.log(`\n--- Searching backward for preceding function entry ---\n`);
    const { instructions: deepInstr } = disassembleRange(rom, DEEP_SCAN_START, DECODE_START);

    // Find the last block terminator in the deep scan
    let lastTerminatorIdx = -1;
    for (let i = 0; i < deepInstr.length; i++) {
      if (isUnconditionalTerminator(deepInstr[i].inst)) {
        lastTerminatorIdx = i;
      }
    }

    if (lastTerminatorIdx >= 0) {
      const termEntry = deepInstr[lastTerminatorIdx];
      const entryAddr = termEntry.pc + termEntry.len;
      const termBytes = bytesAt(rom, termEntry.pc, termEntry.len);
      const termText = formatInstruction(termEntry.inst);
      console.log(`  Last block terminator before ${hex(DECODE_START)}:`);
      console.log(`    ${hex(termEntry.pc)}  ${termBytes.padEnd(16)}  ${termText}`);
      console.log(`\n  Likely function entry (instruction after terminator): ${hex(entryAddr)}`);
      console.log(`  This function spans from ${hex(entryAddr)} through ${hex(TARGET)} and beyond.`);

      // Print the first few instructions of the function
      console.log(`\n  First instructions of the enclosing function:\n`);
      const { instructions: funcInstr } = disassembleRange(rom, entryAddr, TARGET + 0x20);
      const showCount = Math.min(funcInstr.length, 20);
      for (let i = 0; i < showCount; i++) {
        const fi = funcInstr[i];
        const fb = bytesAt(rom, fi.pc, fi.len);
        const ft = formatInstruction(fi.inst);
        const marker = fi.pc === TARGET ? ' <-- 0x0159C0' : '';
        console.log(`    ${hex(fi.pc)}  ${fb.padEnd(20)}  ${ft}${marker}`);
      }
    } else {
      console.log(`  No block terminator found in range ${hex(DEEP_SCAN_START)}..${hex(DECODE_START)}`);
      console.log(`  The function may start even earlier.`);
    }
  }

  // --- Part 3: Scan for vector table entries near TARGET ---
  console.log(`\n--- Vector Table Scan (3-byte LE references to 0x0159C0 region) ---\n`);

  const targetBytes = [TARGET & 0xFF, (TARGET >> 8) & 0xFF, (TARGET >> 16) & 0xFF];
  let exactHits = 0;

  console.log(`  Scanning 0x000000..${hex(CODE_REGION_END)} for bytes C0 59 01 (= ${hex(TARGET)} LE)\n`);

  for (let off = 0; off < CODE_REGION_END - 2; off++) {
    if (rom[off] === targetBytes[0] && rom[off + 1] === targetBytes[1] && rom[off + 2] === targetBytes[2]) {
      // Skip if this is within the function itself
      if (off >= TARGET && off < TARGET + 0xCA) continue;

      // Check surrounding context for table-like patterns
      const prev = off >= 3 ? read24LE(rom, off - 3) : 0;
      const next = off + 3 < rom.length - 2 ? read24LE(rom, off + 3) : 0;
      const prevInCode = prev >= 0x000100 && prev < 0x400000;
      const nextInCode = next >= 0x000100 && next < 0x400000;
      const tableHint = (prevInCode && nextInCode) ? ' [possible table entry]' : '';

      console.log(`  ${hex(off)}: C0 59 01${tableHint}`);
      if (prevInCode) console.log(`    prev 3 bytes -> ${hex(prev)}`);
      if (nextInCode) console.log(`    next 3 bytes -> ${hex(next)}`);
      exactHits++;
    }
  }

  if (exactHits === 0) {
    console.log(`  No occurrences of C0 59 01 found in code region.`);
    console.log(`  This CONFIRMS session 287 finding: 0x0159C0 is never referenced as a literal.`);
  } else {
    console.log(`\n  Found ${exactHits} occurrence(s).`);
  }

  // --- Part 4: Check nearby addresses for vector table entries ---
  console.log(`\n--- Nearby Address Scan (look for table entries referencing ~0x0159xx) ---\n`);

  const nearbyHits = [];
  for (let off = 0; off < CODE_REGION_END - 2; off++) {
    const val = read24LE(rom, off);
    // Look for pointers into the 0x015900..0x015A00 range (excluding self-references)
    if (val >= 0x015900 && val < 0x015A00) {
      if (off >= 0x015900 && off < 0x015A00) continue; // skip self-references
      nearbyHits.push({ off, val });
    }
  }

  if (nearbyHits.length === 0) {
    console.log('  No 3-byte references to 0x0159xx found outside that region.');
  } else {
    console.log(`  Found ${nearbyHits.length} reference(s) to 0x0159xx range:\n`);
    for (const { off, val } of nearbyHits.slice(0, 30)) {
      console.log(`    ${hex(off)}: -> ${hex(val)}`);
    }
    if (nearbyHits.length > 30) {
      console.log(`    ... and ${nearbyHits.length - 30} more`);
    }
  }

  console.log('\n=== Phase 288 Complete ===');
}

main();
