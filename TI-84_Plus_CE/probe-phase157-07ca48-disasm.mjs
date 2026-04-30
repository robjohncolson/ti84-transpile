#!/usr/bin/env node

/**
 * Phase 157 - Static disassembly of 0x07CA48-0x07CAB8 (normalization pre-loop / FPDiv gap).
 *
 * Goal: determine whether 0x07CA48 is a separate function entry or part of
 * a larger function that includes FPDiv at 0x07CAB9.
 *
 * Regions disassembled:
 *   1. 0x07CA28 - 0x07CA48  (32 bytes before target — what flows in)
 *   2. 0x07CA48 - 0x07CAB9  (113 bytes — the normalization gap)
 *   3. 0x07CAB9 - 0x07CAD9  (32 bytes of FPDiv entry)
 *   4. 0x068D82 - 0x068DB0  (gcd algorithm body)
 *   5. 0x07C74B - 0x07C790  (OP1toOP2 region)
 *
 * Also: scan for CALL/JP instructions targeting 0x07CA48 in the ROM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Formatting helpers (from probe-phase156) ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const byteHex = (value) => hex(value, 2);
const wordHex = (value) => hex(value, 4);

function formatSignedDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatSignedDisplacement(displacement)})`;
}

function formatTarget(value) {
  if (value <= 0xff) return byteHex(value);
  if (value <= 0xffff) return wordHex(value);
  return hex(value);
}

function formatAlu(op, rhs) {
  if (op === 'cp' || op === 'and' || op === 'or' || op === 'xor' || op === 'sub') {
    return `${op} ${rhs}`;
  }
  return `${op} a, ${rhs}`;
}

function formatInstruction(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';

  switch (instr.tag) {
    case 'indexed-cb-bit':
      return `${prefix}bit ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${instr.operation} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${instr.op} ${instr.reg}`;
    case 'rotate-ind':
      return `${prefix}${instr.op} (${instr.indirectRegister})`;
    case 'bit-test':
      return `${prefix}bit ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-res':
      return `${prefix}res ${instr.bit}, ${instr.reg}`;
    case 'bit-res-ind':
      return `${prefix}res ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-set':
      return `${prefix}set ${instr.bit}, ${instr.reg}`;
    case 'bit-set-ind':
      return `${prefix}set ${instr.bit}, (${instr.indirectRegister})`;
    case 'ld-pair-imm':
      return `${prefix}ld ${instr.pair}, ${formatTarget(instr.value)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
      }
      return `${prefix}ld ${instr.pair}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${instr.dest}, ${instr.src}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${instr.dest}, ${byteHex(instr.value)}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${instr.dest}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${instr.dest}, (${instr.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${instr.dest}), ${instr.src}`;
    case 'ld-ind-imm':
      return `${prefix}ld (${instr.dest}), ${byteHex(instr.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${byteHex(instr.value)}`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${instr.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${instr.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${instr.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${instr.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${instr.reg}`;
    case 'add-pair':
      return `${prefix}add ${instr.dest}, ${instr.src}`;
    case 'adc-pair':
      return `${prefix}adc ${instr.dest}, ${instr.src}`;
    case 'sbc-pair':
      return `${prefix}sbc ${instr.dest}, ${instr.src}`;
    case 'alu-reg':
      return `${prefix}${formatAlu(instr.op, instr.src)}`;
    case 'alu-imm':
      return `${prefix}${formatAlu(instr.op, byteHex(instr.value))}`;
    case 'alu-ind':
      return `${prefix}${formatAlu(instr.op, `(${instr.indirectRegister})`)}`;
    case 'alu-ixd':
      return `${prefix}${formatAlu(instr.op, formatIndexed(instr.indexRegister, instr.displacement))}`;
    case 'push':
      return `${prefix}push ${instr.pair}`;
    case 'pop':
      return `${prefix}pop ${instr.pair}`;
    case 'jr-conditional':
      return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(instr.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(instr.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${instr.indirectRegister})`;
    case 'call-conditional':
      return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
    case 'call':
      return `${prefix}call ${hex(instr.target)}`;
    case 'ret-conditional':
      return `${prefix}ret ${instr.condition}`;
    case 'ret':
      return `${prefix}ret`;
    case 'reti':
      return `${prefix}reti`;
    case 'retn':
      return `${prefix}retn`;
    case 'djnz':
      return `${prefix}djnz ${hex(instr.target)}`;
    case 'rst':
      return `${prefix}rst ${formatTarget(instr.target)}`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'ex-af':
      return `${prefix}ex af, af'`;
    case 'ex-sp-hl':
      return `${prefix}ex (sp), hl`;
    case 'ex-sp-ix':
      return `${prefix}ex (sp), ${instr.indexRegister}`;
    case 'exx':
      return `${prefix}exx`;
    case 'di':
      return `${prefix}di`;
    case 'ei':
      return `${prefix}ei`;
    case 'nop':
      return `${prefix}nop`;
    case 'halt':
      return `${prefix}halt`;
    case 'rlca':
      return `${prefix}rlca`;
    case 'rrca':
      return `${prefix}rrca`;
    case 'rla':
      return `${prefix}rla`;
    case 'rra':
      return `${prefix}rra`;
    case 'daa':
      return `${prefix}daa`;
    case 'cpl':
      return `${prefix}cpl`;
    case 'scf':
      return `${prefix}scf`;
    case 'ccf':
      return `${prefix}ccf`;
    case 'ldi':
      return `${prefix}ldi`;
    case 'ldir':
      return `${prefix}ldir`;
    case 'ldd':
      return `${prefix}ldd`;
    case 'lddr':
      return `${prefix}lddr`;
    case 'cpi':
      return `${prefix}cpi`;
    case 'cpir':
      return `${prefix}cpir`;
    case 'cpd':
      return `${prefix}cpd`;
    case 'cpdr':
      return `${prefix}cpdr`;
    case 'ini':
      return `${prefix}ini`;
    case 'inir':
      return `${prefix}inir`;
    case 'ind':
      return `${prefix}ind`;
    case 'indr':
      return `${prefix}indr`;
    case 'outi':
      return `${prefix}outi`;
    case 'otir':
      return `${prefix}otir`;
    case 'outd':
      return `${prefix}outd`;
    case 'otdr':
      return `${prefix}otdr`;
    case 'in-reg':
      return `${prefix}in ${instr.reg}, (c)`;
    case 'out-reg':
      return `${prefix}out (c), ${instr.reg}`;
    case 'in-imm':
      return `${prefix}in a, (${byteHex(instr.port)})`;
    case 'out-imm':
      return `${prefix}out (${byteHex(instr.port)}), a`;
    case 'neg':
      return `${prefix}neg`;
    case 'im':
      return `${prefix}im ${instr.mode}`;
    case 'ld-i-a':
      return `${prefix}ld i, a`;
    case 'ld-a-i':
      return `${prefix}ld a, i`;
    case 'ld-r-a':
      return `${prefix}ld r, a`;
    case 'ld-a-r':
      return `${prefix}ld a, r`;
    case 'ld-mb-a':
      return `${prefix}ld mb, a`;
    case 'ld-a-mb':
      return `${prefix}ld a, mb`;
    case 'rrd':
      return `${prefix}rrd`;
    case 'rld':
      return `${prefix}rld`;
    case 'stmix':
      return `${prefix}stmix`;
    case 'rsmix':
      return `${prefix}rsmix`;
    case 'tst-a':
      return `${prefix}tst a, ${byteHex(instr.value)}`;
    case 'mlt':
      return `${prefix}mlt ${instr.pair}`;
    case 'lea-ix':
      return `${prefix}lea ix, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'lea-iy':
      return `${prefix}lea iy, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'lea-pair':
      return `${prefix}lea ${instr.pair}, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'pea':
      return `${prefix}pea ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    default:
      return `${prefix}${instr.tag}`;
  }
}

// --- Disassembly engine ---

function hexBytes(start, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    bytes.push(byteHex(romBytes[start + i] ?? 0));
  }
  return bytes.join(' ');
}

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      entries.push({
        pc,
        instr,
        bytes: hexBytes(pc, length),
        text: formatInstruction(instr),
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        instr: null,
        bytes: hexBytes(pc, 1),
        text: `decode-error: ${error?.message ?? error}`,
      });
      pc += 1;
    }
  }

  return entries;
}

// --- Known address annotations ---

const ANNOTATIONS = new Map([
  [0x07CA48, '*** TARGET: normalization pre-loop entry ***'],
  [0x07CAB9, 'FPDiv implementation entry'],
  [0x07C74B, 'OP1toOP2'],
  [0x07C77F, 'FPAdd JT slot'],
  [0x07C771, 'FPSub JT slot'],
  [0x068D82, 'gcd algorithm body'],
  [0x07FB33, 'mantissa shift left'],
  [0x07FDF1, 'exponent decrement'],
  [0x07C9AF, 'post-normalization exit (JP C target)'],
  [0x07F8B6, 'target function from session 156'],
  [0x07F8A2, 'AbsOP1'],
  [0x080037, 'helper (session 156)'],
  [0x07FD4A, 'helper (session 156)'],
]);

function getAnnotation(addr) {
  return ANNOTATIONS.get(addr);
}

function printDisasm(label, entries) {
  console.log(`\n--- ${label} ---`);
  for (const entry of entries) {
    const addr = hex(entry.pc);
    const bytes = entry.bytes.padEnd(24);
    const annotation = getAnnotation(entry.pc);
    const annStr = annotation ? `  ; <<< ${annotation}` : '';

    // Mark control flow targets
    let targetNote = '';
    if (entry.instr) {
      const tag = entry.instr.tag;
      if (tag === 'call' || tag === 'call-conditional' ||
          tag === 'jp' || tag === 'jp-conditional' ||
          tag === 'jr' || tag === 'jr-conditional' || tag === 'djnz') {
        const target = entry.instr.target;
        const targetAnn = getAnnotation(target);
        if (targetAnn) targetNote = `  ; -> ${targetAnn}`;
      }
    }

    console.log(`  ${addr}  ${bytes}  ${entry.text}${annStr}${targetNote}`);
  }
}

// --- Block existence check ---

function checkTranspiledBlocks() {
  console.log('\n=== Transpiled block check (0x07CA28-0x07CAD8) ===');

  // Read the transpiled JS and look for block keys
  const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
  let transpiledContent;
  try {
    transpiledContent = fs.readFileSync(transpiledPath, 'utf8');
  } catch {
    // Try gzipped version
    console.log('  ROM.transpiled.js not found, checking for .gz...');
    try {
      execSync(`gunzip -k "${transpiledPath}.gz"`, { cwd: __dirname });
      transpiledContent = fs.readFileSync(transpiledPath, 'utf8');
    } catch {
      console.log('  Could not read transpiled JS. Skipping block check.');
      return;
    }
  }

  const startAddr = 0x07CA28;
  const endAddr = 0x07CAD8;

  for (let addr = startAddr; addr <= endAddr; addr++) {
    const key = `${addr.toString(16).padStart(6, '0')}:adl`;
    // Check if this block key exists (look for it as a property key in PRELIFTED_BLOCKS)
    if (transpiledContent.includes(`"${key}"`) || transpiledContent.includes(`'${key}'`)) {
      const annotation = getAnnotation(addr) || '';
      console.log(`  BLOCK FOUND: ${hex(addr)} (key "${key}") ${annotation}`);
    }
  }

  // Also check a wider search for 07ca in block keys
  const blockKeyPattern = /["']07ca[0-9a-f]{2}:adl["']/g;
  const matches = transpiledContent.match(blockKeyPattern);
  if (matches) {
    console.log('\n  All 0x07CAxx block keys found:');
    for (const m of matches) {
      console.log(`    ${m}`);
    }
  } else {
    console.log('\n  No 0x07CAxx block keys found in transpiled JS.');
  }
}

// --- Scan ROM for CALL/JP to 0x07CA48 ---

function scanForCallsTo(targetAddr) {
  console.log(`\n=== Scanning ROM for CALL/JP to ${hex(targetAddr)} ===`);

  // The target address in little-endian: 0x07CA48 -> 0x48 0xCA 0x07
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const results = [];

  // CALL nn = CD xx xx xx (ADL mode, 4 bytes)
  // JP nn = C3 xx xx xx (ADL mode, 4 bytes)
  // JP cc, nn = C2/CA/D2/DA/E2/EA/F2/FA xx xx xx (4 bytes)
  // CALL cc, nn = C4/CC/D4/DC/E4/EC/F4/FC xx xx xx (4 bytes)

  const callOpcodes = [0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]; // CALL, CALL cc
  const jpOpcodes = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]; // JP, JP cc

  for (let i = 0; i < romBytes.length - 3; i++) {
    const opcode = romBytes[i];
    if (callOpcodes.includes(opcode) || jpOpcodes.includes(opcode)) {
      if (romBytes[i + 1] === lo && romBytes[i + 2] === mid && romBytes[i + 3] === hi) {
        const type = callOpcodes.includes(opcode) ? 'CALL' : 'JP';
        results.push({ addr: i, type, opcode });
      }
    }
  }

  if (results.length === 0) {
    console.log(`  No direct CALL/JP to ${hex(targetAddr)} found in entire ROM.`);
  } else {
    console.log(`  Found ${results.length} reference(s):`);
    for (const r of results) {
      const context = decodeRange(r.addr, r.addr + 8);
      const annotation = getAnnotation(r.addr) || '';
      console.log(`  ${hex(r.addr)}: ${r.type} (opcode ${byteHex(r.opcode)}) ${annotation}`);
      for (const entry of context) {
        console.log(`    ${hex(entry.pc)}  ${entry.bytes.padEnd(24)}  ${entry.text}`);
      }
    }
  }

  return results;
}

// --- Main ---

function main() {
  console.log('=== Phase 157: Static disassembly of 0x07CA48-0x07CAB8 ===');
  console.log('=== Question: Is 0x07CA48 a separate function or part of FPDiv? ===');

  // Region 1: 32 bytes before target (0x07CA28 - 0x07CA48)
  const region1 = decodeRange(0x07CA28, 0x07CA48);
  printDisasm('Region 1: 0x07CA28-0x07CA48 (32 bytes before target)', region1);

  // Region 2: The 113-byte gap (0x07CA48 - 0x07CAB9)
  const region2 = decodeRange(0x07CA48, 0x07CAB9);
  printDisasm('Region 2: 0x07CA48-0x07CAB9 (normalization pre-loop / gap)', region2);

  // Region 3: FPDiv entry (0x07CAB9 - 0x07CAD9)
  const region3 = decodeRange(0x07CAB9, 0x07CAD9);
  printDisasm('Region 3: 0x07CAB9-0x07CAD9 (FPDiv entry, 32 bytes)', region3);

  // Region 4: gcd algorithm body (0x068D82 - 0x068DB0)
  const region4 = decodeRange(0x068D82, 0x068DB0);
  printDisasm('Region 4: 0x068D82-0x068DB0 (gcd algorithm body)', region4);

  // Region 5: OP1toOP2 area (0x07C74B - 0x07C790)
  const region5 = decodeRange(0x07C74B, 0x07C790);
  printDisasm('Region 5: 0x07C74B-0x07C790 (OP1toOP2 region)', region5);

  // Collect all CALL/JP targets from regions 2 and 3
  console.log('\n=== Control flow in Region 2 (normalization gap) ===');
  for (const entry of region2) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'call' || tag === 'call-conditional' ||
        tag === 'jp' || tag === 'jp-conditional' ||
        tag === 'jr' || tag === 'jr-conditional' ||
        tag === 'ret' || tag === 'ret-conditional' ||
        tag === 'djnz' || tag === 'rst') {
      const annotation = entry.instr.target ? (getAnnotation(entry.instr.target) || '') : '';
      console.log(`  ${hex(entry.pc)}  ${entry.text}  ${annotation}`);
    }
  }

  console.log('\n=== Control flow in Region 3 (FPDiv entry) ===');
  for (const entry of region3) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'call' || tag === 'call-conditional' ||
        tag === 'jp' || tag === 'jp-conditional' ||
        tag === 'jr' || tag === 'jr-conditional' ||
        tag === 'ret' || tag === 'ret-conditional' ||
        tag === 'djnz' || tag === 'rst') {
      const annotation = entry.instr.target ? (getAnnotation(entry.instr.target) || '') : '';
      console.log(`  ${hex(entry.pc)}  ${entry.text}  ${annotation}`);
    }
  }

  // Scan for who calls 0x07CA48
  scanForCallsTo(0x07CA48);

  // Also check who calls 0x07CAB9 (FPDiv)
  scanForCallsTo(0x07CAB9);

  // Check transpiled blocks
  checkTranspiledBlocks();

  // Final analysis
  console.log('\n=== Analysis ===');

  // Check if 0x07CA48 ends with a RET or falls through to 0x07CAB9
  const lastInstrBeforeFPDiv = region2[region2.length - 1];
  if (lastInstrBeforeFPDiv) {
    const tag = lastInstrBeforeFPDiv.instr?.tag;
    const endAddr = lastInstrBeforeFPDiv.pc + (lastInstrBeforeFPDiv.instr?.length || 1);
    console.log(`  Last instruction before FPDiv (${hex(lastInstrBeforeFPDiv.pc)}): ${lastInstrBeforeFPDiv.text}`);
    console.log(`  Ends at: ${hex(endAddr)}, FPDiv starts at: ${hex(0x07CAB9)}`);
    if (endAddr === 0x07CAB9 && tag !== 'ret' && tag !== 'jp' && tag !== 'jr') {
      console.log('  => FALLS THROUGH into FPDiv! 0x07CA48 is part of the same function.');
    } else if (tag === 'ret') {
      console.log('  => Returns before FPDiv. 0x07CA48 is a SEPARATE function.');
    } else if (tag === 'jp' || tag === 'jr') {
      console.log('  => Jumps away before FPDiv. Check if it could be a conditional that sometimes falls through.');
    } else {
      console.log(`  => End address ${hex(endAddr)} vs FPDiv ${hex(0x07CAB9)} — gap or overlap.`);
    }
  }

  // Check what's before 0x07CA48
  const lastBeforeTarget = region1[region1.length - 1];
  if (lastBeforeTarget) {
    const tag = lastBeforeTarget.instr?.tag;
    const endAddr = lastBeforeTarget.pc + (lastBeforeTarget.instr?.length || 1);
    console.log(`\n  Last instruction before 0x07CA48 (${hex(lastBeforeTarget.pc)}): ${lastBeforeTarget.text}`);
    console.log(`  Ends at: ${hex(endAddr)}`);
    if (endAddr === 0x07CA48 && (tag === 'ret' || tag === 'jp' || tag === 'jr')) {
      console.log('  => Clean function boundary. 0x07CA48 starts a new block.');
    } else if (endAddr === 0x07CA48) {
      console.log('  => Falls through into 0x07CA48 — part of same function.');
    } else {
      console.log(`  => Misaligned: ends at ${hex(endAddr)}, target at ${hex(0x07CA48)}.`);
    }
  }

  console.log('\nDone.');
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
