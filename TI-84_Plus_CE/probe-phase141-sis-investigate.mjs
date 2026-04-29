#!/usr/bin/env node

/**
 * Phase 141 — .SIS prefix block alignment investigation at 0x07B793
 *
 * Steps:
 *   1. Find which PRELIFTED_BLOCKS block covers 0x07B793
 *   2. Disassemble ROM bytes at 0x07B790-0x07B7B0 at multiple alignments
 *   3. Check the transpiled JS for .SIS handling (read16 + mbase vs read24)
 *   4. Determine whether X bounds limitation is .SIS or 8-bit CP
 *   5. Report findings and recommended fix
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load ROM ──────────────────────────────────────────────────────────
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Load transpiled blocks ────────────────────────────────────────────
console.log('Loading ROM.transpiled.js (this takes a moment)...');
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
console.log(`Loaded ${Object.keys(BLOCKS).length} blocks.\n`);

// ── Helpers ───────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexDump(buf, offset, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const addr = offset + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      bytes.push(buf[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines.join('\n');
}

function disasmAt(startAddr, count) {
  const results = [];
  let pc = startAddr;
  for (let i = 0; i < count; i++) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const rawBytes = [];
      for (let j = 0; j < inst.length; j++) {
        rawBytes.push(romBytes[pc + j].toString(16).toUpperCase().padStart(2, '0'));
      }
      results.push({
        addr: pc,
        length: inst.length,
        bytes: rawBytes.join(' '),
        tag: inst.tag,
        modePrefix: inst.modePrefix,
        inst,
      });
      pc = inst.nextPc;
    } catch (e) {
      results.push({
        addr: pc,
        length: 1,
        bytes: romBytes[pc].toString(16).toUpperCase().padStart(2, '0'),
        tag: `ERROR: ${e.message}`,
        modePrefix: null,
        inst: null,
      });
      pc += 1;
    }
  }
  return results;
}

function formatDisasm(results) {
  return results.map(r => {
    const prefix = r.modePrefix ? `[.${r.modePrefix.toUpperCase()}] ` : '';
    let detail = r.tag;
    if (r.inst) {
      const i = r.inst;
      if (i.tag === 'ld-mem-to-reg' || i.tag === 'ld-reg-to-mem') {
        detail += ` addr=${hex(i.addr)}`;
      }
      if (i.tag === 'ld-pair-imm') {
        detail += ` ${i.pair}=${hex(i.value)}`;
      }
      if (i.tag === 'jp' || i.tag === 'jp-conditional' || i.tag === 'jr' || i.tag === 'jr-conditional') {
        detail += ` target=${hex(i.target)}`;
      }
      if (i.tag === 'call' || i.tag === 'call-conditional') {
        detail += ` target=${hex(i.target)}`;
      }
      if (i.tag === 'alu-reg') {
        detail += ` ${i.op} ${i.src}`;
      }
      if (i.tag === 'ld-reg-reg') {
        detail += ` ${i.dest},${i.src}`;
      }
      if (i.tag === 'bit-ind') {
        detail += ` bit ${i.bit}`;
      }
      if (i.tag === 'ld-hl-mem') {
        detail += ` addr=${hex(i.addr)}`;
      }
      if (i.tag === 'ld-mem-hl') {
        detail += ` addr=${hex(i.addr)}`;
      }
    }
    return `    ${hex(r.addr)}: ${r.bytes.padEnd(15)} ${prefix}${detail}`;
  }).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: Raw ROM bytes
// ═══════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 1: Raw ROM bytes at 0x07B790-0x07B7C0');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(hexDump(romBytes, 0x07B790, 0x30));

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: Disassemble at multiple alignments
// ═══════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('STEP 2: Disassembly at multiple alignments');
console.log('═══════════════════════════════════════════════════════════\n');

const alignments = [0x07B790, 0x07B791, 0x07B792, 0x07B793];
for (const start of alignments) {
  console.log(`  --- Starting at ${hex(start)} ---`);
  const results = disasmAt(start, 12);
  console.log(formatDisasm(results));

  // Check if any instruction has .SIS prefix
  const sisInsts = results.filter(r => r.modePrefix === 'sis');
  if (sisInsts.length > 0) {
    console.log(`    >> .SIS prefix FOUND at: ${sisInsts.map(r => hex(r.addr)).join(', ')}`);
  } else {
    console.log('    >> No .SIS prefix found at this alignment');
  }

  // Check if 0x40 appears as LD B,B
  const ldBBInsts = results.filter(r => r.tag === 'ld-reg-reg' && r.inst && r.inst.dest === 'b' && r.inst.src === 'b');
  if (ldBBInsts.length > 0) {
    console.log(`    >> 0x40 decoded as LD B,B at: ${ldBBInsts.map(r => hex(r.addr)).join(', ')}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: Find which block covers 0x07B793
// ═══════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 3: Find blocks covering 0x07B793');
console.log('═══════════════════════════════════════════════════════════\n');

// Direct key checks
const keysToCheck = [
  '07b790:adl', '07b791:adl', '07b792:adl', '07b793:adl',
  '07b794:adl', '07b795:adl', '07b796:adl', '07b797:adl',
  '07b798:adl', '07b799:adl', '07b79a:adl', '07b79b:adl',
  '07b79c:adl', '07b79d:adl', '07b79e:adl', '07b79f:adl',
  '07b7a0:adl', '07b7a4:adl', '07b7a8:adl', '07b7b0:adl',
  '07b7b6:adl',
];

console.log('  Direct block key checks:');
for (const key of keysToCheck) {
  if (key in BLOCKS) {
    console.log(`    ${key}: EXISTS`);
  }
}

// Wider search
console.log('\n  All blocks in range 0x07B780-0x07B7F0:');
const blockKeys = Object.keys(BLOCKS);
const widerBlocks = [];
for (const key of blockKeys) {
  const parts = key.split(':');
  const pc = parseInt(parts[0], 16);
  if (pc >= 0x07B780 && pc <= 0x07B7F0) {
    widerBlocks.push({ key, pc });
  }
}
widerBlocks.sort((a, b) => a.pc - b.pc);
for (const b of widerBlocks) {
  console.log(`    ${b.key} (${hex(b.pc)})`);
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 4: Examine transpiled JS for blocks near 0x07B793
// ═══════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('STEP 4: Transpiled JS source for relevant blocks');
console.log('═══════════════════════════════════════════════════════════\n');

// Check all blocks found in the range
const blocksToInspect = [...widerBlocks];
// Also check the exact key
if (!widerBlocks.find(b => b.key === '07b793:adl') && '07b793:adl' in BLOCKS) {
  blocksToInspect.push({ key: '07b793:adl', pc: 0x07B793 });
}

for (const { key } of blocksToInspect) {
  const block = BLOCKS[key];
  if (!block) continue;
  const src = typeof block === 'function' ? block.toString() : JSON.stringify(block);
  console.log(`  Block ${key}:`);
  console.log(`    Length: ${src.length} chars`);

  // Check for .SIS indicators
  const hasRead16 = src.includes('read16');
  const hasRead24 = src.includes('read24');
  const hasMbase = src.includes('mbase');
  const hasLdBB = src.includes("cpu.b = cpu.b") || src.includes("/* LD B,B */");

  console.log(`    Contains read16: ${hasRead16}`);
  console.log(`    Contains read24: ${hasRead24}`);
  console.log(`    Contains mbase: ${hasMbase}`);
  console.log(`    Contains LD B,B pattern: ${hasLdBB}`);

  // Show the first 1500 chars of the source
  console.log(`    Source (first 1500 chars):`);
  const lines = src.substring(0, 1500).split('\n');
  for (const line of lines) {
    console.log(`      ${line}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 5: Determine the actual .SIS issue
// ═══════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 5: Analysis — what exactly is the .SIS prefix doing?');
console.log('═══════════════════════════════════════════════════════════\n');

// Disassemble starting at 0x07B793 (the function entry) with more instructions
console.log('  Full disassembly from 0x07B793 (bounds-check function):');
const fullDisasm = disasmAt(0x07B793, 25);
console.log(formatDisasm(fullDisasm));

// Check specifically at 0x07B79B where the .SIS prefix should be
console.log(`\n  Byte at 0x07B79B: 0x${romBytes[0x07B79B].toString(16).toUpperCase().padStart(2, '0')}`);
console.log(`  Byte at 0x07B7A4: 0x${romBytes[0x07B7A4].toString(16).toUpperCase().padStart(2, '0')}`);

// Check what the decoder makes of 0x07B79B
console.log('\n  Decoder result at 0x07B79B:');
const inst79b = decodeInstruction(romBytes, 0x07B79B, 'adl');
console.log(`    tag: ${inst79b.tag}`);
console.log(`    modePrefix: ${inst79b.modePrefix}`);
console.log(`    length: ${inst79b.length}`);
console.log(`    nextPc: ${hex(inst79b.nextPc)}`);
if (inst79b.addr !== undefined) console.log(`    addr: ${hex(inst79b.addr)}`);

console.log('\n  Decoder result at 0x07B7A4:');
const instA4 = decodeInstruction(romBytes, 0x07B7A4, 'adl');
console.log(`    tag: ${instA4.tag}`);
console.log(`    modePrefix: ${instA4.modePrefix}`);
console.log(`    length: ${instA4.length}`);
console.log(`    nextPc: ${hex(instA4.nextPc)}`);
if (instA4.addr !== undefined) console.log(`    addr: ${hex(instA4.addr)}`);

// ═══════════════════════════════════════════════════════════════════════
// STEP 6: Check the CP L instruction — 8-bit comparison
// ═══════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('STEP 6: Analyze the CP L instruction at 0x07B7A9');
console.log('═══════════════════════════════════════════════════════════\n');

// The sequence at 0x07B7A4 is:
//   .SIS LD HL,(0x14FE)  -- loads 16-bit value from D014FE with MBASE
//   LD A,C               -- A = C (lower 8 bits of column?)
//   CP L                 -- compare A with L (lower 8 bits of loaded value)
// This CP L is an 8-bit comparison regardless of .SIS prefix!
// If the screen width > 255, this 8-bit compare would wrap.

console.log('  The bounds-check sequence around 0x07B7A4:');
console.log('    .SIS LD HL,(0x14FE)  -- loads HL from (MBASE<<16 | 0x14FE)');
console.log('    LD A,C               -- A = C (X coordinate, lower 8 bits)');
console.log('    CP L                 -- compare A vs L (8-bit!)');
console.log('');
console.log('  TI-84 Plus CE screen is 320x240.');
console.log('  320 = 0x140, which does NOT fit in 8 bits (max 255).');
console.log('  However, the graph window is typically smaller than full screen.');
console.log('  The graph area is about 265 pixels wide (0-264), which is > 255.');
console.log('');
console.log('  If the X coordinate is > 255, LD A,C truncates to 8 bits.');
console.log('  CP L then compares truncated X vs boundary — this IS the 8-bit issue.');
console.log('');

// Check what the SBC HL,DE at 0x07B7A0 does (this is after the first .SIS LD)
console.log('  First bounds check (0x07B79B-0x07B7A2):');
console.log('    .SIS LD HL,(0x1501)  -- loads min-X from (D0:1501)');
console.log('    OR A                 -- clear carry');
console.log('    SBC HL,DE            -- HL = HL - DE (24-bit subtract!)');
console.log('    JR C,+12             -- if HL < DE (X < min), skip to out-of-bounds');
console.log('');
console.log('  This first check uses SBC HL,DE — a full 24-bit subtraction.');
console.log('  DE presumably holds the X coordinate.');
console.log('');
console.log('  Second bounds check (0x07B7A4-0x07B7AA):');
console.log('    .SIS LD HL,(0x14FE)  -- loads max-X from (D0:14FE)');
console.log('    LD A,C               -- A = C (8-bit!)');
console.log('    CP L                 -- 8-bit compare');
console.log('    JR NC,+4             -- if A >= L, skip');
console.log('');
console.log('  This second check uses 8-bit CP — intentional or bug in the OS?');
console.log('  On a real TI-84 CE, C register holds the low byte of X.');
console.log('  If X < 256, this works fine. For X >= 256, it wraps.');

// ═══════════════════════════════════════════════════════════════════════
// STEP 7: Check if the .SIS LD HL,(nn) reads 16-bit or 24-bit
// ═══════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('STEP 7: Verify .SIS LD HL,(nn) — 16-bit read vs 24-bit');
console.log('═══════════════════════════════════════════════════════════\n');

// The .SIS prefix means:
//   - Immediate addresses are 16-bit (+ MBASE for effective 24-bit)
//   - Memory access width is 16-bit (reads 2 bytes, not 3)
// So .SIS LD HL,(0x1501) reads 2 bytes from (MBASE<<16 | 0x1501)
// and loads them into HL (with H cleared? or HL gets 16-bit value?)

// Actually in eZ80, .SIS means "short immediate, short" — both the
// immediate (address) and the data size are 16-bit.
// So HL = read16(MBASE<<16 | 0x1501)

console.log('  .SIS LD HL,(nn): reads 16-bit value from 16-bit address+MBASE');
console.log('  The data loaded into HL is 16 bits — upper byte of HL cleared.');
console.log('');

// Check if the block at 0x07B793 (or wherever it starts) properly uses read16
// We already checked in Step 4, but let's grep the source more carefully
const key793 = '07b793:adl';
if (key793 in BLOCKS) {
  const src793 = BLOCKS[key793].toString();
  console.log('  Block 07b793:adl source grep for read16/mbase:');
  const srcLines = src793.split('\n');
  for (let i = 0; i < srcLines.length; i++) {
    const line = srcLines[i];
    if (line.includes('read16') || line.includes('read24') || line.includes('mbase') || line.includes('0x1501') || line.includes('0x14fe') || line.includes('0x14FE')) {
      console.log(`    Line ${i}: ${line.trim()}`);
    }
  }
}

// Also check blocks that might contain the .SIS code
for (const { key } of widerBlocks) {
  if (key === key793) continue;
  const block = BLOCKS[key];
  if (!block) continue;
  const src = typeof block === 'function' ? block.toString() : '';
  if (src.includes('mbase') || src.includes('0x1501') || src.includes('0x14fe') || src.includes('0x14FE')) {
    console.log(`\n  Block ${key} also references mbase/0x1501/0x14FE:`);
    const srcLines = src.split('\n');
    for (let i = 0; i < srcLines.length; i++) {
      const line = srcLines[i];
      if (line.includes('read16') || line.includes('read24') || line.includes('mbase') || line.includes('0x1501') || line.includes('0x14fe') || line.includes('0x14FE')) {
        console.log(`    Line ${i}: ${line.trim()}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 8: Summary and Recommendation
// ═══════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('STEP 8: Summary and Recommendation');
console.log('═══════════════════════════════════════════════════════════\n');

// Determine alignment status
const has793Block = '07b793:adl' in BLOCKS;
const has79bBlock = '07b79b:adl' in BLOCKS;

console.log(`  Block 07b793:adl exists: ${has793Block}`);
console.log(`  Block 07b79b:adl exists: ${has79bBlock}`);

if (has793Block) {
  const src = BLOCKS['07b793:adl'].toString();
  const correctSIS = src.includes('read16') && src.includes('mbase');
  const wrongAlignment = src.includes('cpu.b = cpu.b') || (src.includes('read24') && !src.includes('read16'));
  console.log(`  Block 07b793:adl has correct .SIS (read16+mbase): ${correctSIS}`);
  console.log(`  Block 07b793:adl has wrong alignment (LD B,B / read24): ${wrongAlignment}`);
}

console.log('\n  Investigation complete. See above for detailed analysis.');
