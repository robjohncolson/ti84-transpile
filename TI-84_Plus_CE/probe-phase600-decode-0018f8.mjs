#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const analysisPath = path.join(__dirname, 'phase600-0018f8-analysis.md');

// --- Known addresses for annotation ---

const knownAddrs = new Map([
  [0x001881, 'massive 82KB clear: LD HL,D00000; LD DE,D00001; LD BC,013FD7; LD (HL),0; LDIR'],
  [0x0018F8, '*** PRIMARY TARGET: bulk mem-clear at step 84825 ***'],
  [0x0019B5, '*** HALT block (natural halt after init) ***'],
  [0x0019BE, '*** WIPE TRAP (re-runs 192K-step init) ***'],
  [0x005B96, 'call target from 0x001907'],
  [0x005BB1, 'call target from 0x00190B'],
  [0x00620D, 'call target from 0x001933'],
]);

// --- Formatting helpers (matching phase599 pattern) ---

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function instructionKind(insn) {
  const tag = insn.tag || '';
  if (tag.startsWith('call')) return 'CALL';
  if (tag.startsWith('jp')) return 'JP';
  if (tag.startsWith('jr')) return 'JR';
  if (tag === 'ret' || tag.startsWith('ret-')) return 'RET';
  if (tag.startsWith('bit-test')) return 'BIT';
  if (tag === 'ldir' || tag === 'lddr') return 'BLOCK';
  if (tag === 'halt') return 'HALT';
  if ((tag.startsWith('alu') || tag.startsWith('cp')) && insn.op === 'cp') return 'CP';
  return '';
}

function formatInsn(insn) {
  const tag = insn.tag || '???';
  const parts = [tag.toUpperCase()];

  if (insn.condition) parts.push(insn.condition.toUpperCase());
  if (insn.target !== undefined) parts.push(hex(insn.target));
  else if (insn.value !== undefined) parts.push(`0x${insn.value.toString(16).padStart(2, '0')}`);
  else if (insn.dest && insn.src) parts.push(`${insn.dest},${insn.src}`);
  else if (insn.pair) parts.push(insn.pair.toUpperCase());
  else if (insn.src) parts.push(insn.src);
  else if (insn.dest) parts.push(insn.dest);
  if (insn.op && tag.startsWith('alu')) parts[0] = insn.op.toUpperCase();
  if (insn.bit !== undefined) parts.push(`${insn.bit}`);
  if (insn.displacement !== undefined) parts.push(`d=${insn.displacement}`);
  if (insn.indirectRegister) parts.push(`(${insn.indirectRegister.toUpperCase()})`);

  return parts.join(' ');
}

// --- Decode engine ---

function decode(startAddr, endAddr) {
  let offset = startAddr;
  const lines = [];
  const records = [];

  while (offset < endAddr) {
    const insn = decodeInstruction(romBytes, offset, 'adl');
    const dasm = formatInsn(insn);
    const bytes = [];
    for (let i = 0; i < insn.length; i += 1) {
      bytes.push(romBytes[offset + i].toString(16).padStart(2, '0'));
    }

    const kind = instructionKind(insn);
    const target = insn.target ?? null;
    const tags = [];

    // Flag known addresses
    const knownHere = knownAddrs.get(offset);
    if (knownHere) tags.push(knownHere);

    // Flag LDIR/LDDR
    if (insn.tag === 'ldir') tags.push('*** LDIR — block copy/clear ***');
    if (insn.tag === 'lddr') tags.push('*** LDDR — block copy/clear reverse ***');

    // Flag HALT
    if (kind === 'HALT') tags.push('*** HALT ***');

    // Flag branches
    if (kind === 'JP' || kind === 'JR') tags.push('branch');
    if (kind === 'CALL') {
      const knownTarget = target !== null ? knownAddrs.get(target) : null;
      tags.push(knownTarget ? `call -> ${knownTarget}` : 'call');
    }
    if (kind === 'RET') tags.push('return');

    // Flag LD to D0xxxx addresses (detect memory stores to RAM state)
    if (insn.tag === 'ld-ind-imm24' || insn.tag === 'ld-ind-reg') {
      const destAddr = insn.target ?? insn.address;
      if (destAddr >= 0xD00000 && destAddr <= 0xD3FFFF) {
        tags.push(`*** WRITE to ${hex(destAddr)} ***`);
      }
    }
    // Also catch LD (nn),A and LD (nn),rr patterns
    if (dasm.includes('0xd0') || dasm.includes('0xd1') || dasm.includes('0xd2') || dasm.includes('0xd3')) {
      if (target !== undefined && target !== null && target >= 0xD00000 && target <= 0xD3FFFF) {
        if (!tags.some(t => t.includes('WRITE'))) {
          tags.push(`*** RAM ref ${hex(target)} ***`);
        }
      }
    }

    // Flag backward branches (loops)
    if ((kind === 'JP' || kind === 'JR') && target !== null && target < offset) {
      tags.push(`*** LOOP back to ${hex(target)} ***`);
    }

    const line = `${hex(offset)}  ${bytes.join(' ').padEnd(24)}  ${dasm}${tags.length ? `    ; ${tags.join('; ')}` : ''}`;
    lines.push(line);
    records.push({ address: offset, bytes, dasm, target, kind, insn, tags, line });

    offset += insn.length || 1;
  }

  return { lines, records };
}

// --- Main decode ---

console.log('Phase 600: Static decode of bulk memory-clear at 0x0018F8');
console.log(`ROM size: ${romBytes.length} bytes`);
console.log('');

// Decode from 0x001880 through 0x001A00 (covers context, 0x0018F8, 0x0019B5, 0x0019BE + margin)
const START = 0x001880;
const END   = 0x001A00;
const decoded = decode(START, END);

console.log(`=== FULL LISTING: ${hex(START)} - ${hex(END)} (${END - START} bytes) ===`);
for (const line of decoded.lines) {
  console.log(line);
}

// --- Summaries ---

console.log('');
console.log('=== LDIR/LDDR INSTRUCTIONS ===');
const blockOps = decoded.records.filter(r => r.insn.tag === 'ldir' || r.insn.tag === 'lddr');
if (blockOps.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of blockOps) {
    console.log(`  ${hex(r.address)}  ${r.dasm}`);
  }
}

console.log('');
console.log('=== CALL/JP/JR TARGETS ===');
const branchRecords = decoded.records.filter(r => ['CALL', 'JP', 'JR'].includes(r.kind));
for (const r of branchRecords) {
  const targetStr = r.target === null ? 'indirect' : hex(r.target);
  const backward = r.target !== null && r.target < r.address ? ' (BACKWARD/LOOP)' : '';
  console.log(`  ${hex(r.address)}  ${r.dasm.padEnd(35)} -> ${targetStr}${backward}`);
}

console.log('');
console.log('=== HALT INSTRUCTIONS ===');
const halts = decoded.records.filter(r => r.kind === 'HALT');
if (halts.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of halts) {
    console.log(`  ${hex(r.address)}  ${r.dasm}`);
  }
}

console.log('');
console.log('=== RET INSTRUCTIONS ===');
const rets = decoded.records.filter(r => r.kind === 'RET');
if (rets.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of rets) {
    console.log(`  ${hex(r.address)}  ${r.dasm}    ; ${r.insn.tag === 'ret' ? 'unconditional' : 'conditional'}`);
  }
}

// --- Register setup tracking for LDIR/LDDR context ---

console.log('');
console.log('=== REGISTER SETUP NEAR LDIR/LDDR (HL/DE/BC loads) ===');
const regLoads = decoded.records.filter(r => {
  const tag = r.insn.tag || '';
  return tag === 'ld-pair-imm' &&
         ['hl', 'de', 'bc'].includes(r.insn.pair);
});
if (regLoads.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of regLoads) {
    const val = r.insn.value !== undefined ? hex(r.insn.value) : '???';
    console.log(`  ${hex(r.address)}  LD ${r.insn.pair.toUpperCase()}, ${val}`);
  }
}

// --- LD (HL),imm tracking (zero-fill setup) ---

console.log('');
console.log('=== LD (HL),n INSTRUCTIONS (zero-fill seeds) ===');
const ldHLimm = decoded.records.filter(r => {
  return r.insn.tag === 'ld-ind-imm';
});
if (ldHLimm.length === 0) {
  console.log('  (none found)');
} else {
  for (const r of ldHLimm) {
    const val = r.insn.value !== undefined ? `0x${r.insn.value.toString(16).padStart(2, '0')}` : '???';
    console.log(`  ${hex(r.address)}  LD (HL), ${val}`);
  }
}

// --- Build analysis markdown from captured output ---

const mdLines = [
  '# Phase 600: Static decode of bulk memory-clear at 0x0018F8',
  '',
  `Generated by \`${path.relative(repoRoot, __filename).replaceAll(path.sep, '/')}\`.`,
  '',
  '## Context',
  '',
  'Block 0x0018F8 wipes D0231A, D0243A, D007CA simultaneously during key processing (step 84,825 inside cxMain).',
  'The raw bytes at 0x001881 show: `LD HL,0xD00000; LD DE,0xD00001; LD BC,0x013FD7; LD (HL),0; LDIR` -- a massive ~82KB clear of D00000-D13FD7.',
  'This probe decodes the full area 0x001880-0x001A00 to understand the structure of the init/wipe sequence.',
  '',
  '## Full Decoded Listing',
  '',
  '```',
];

for (const line of decoded.lines) {
  mdLines.push(line);
}
mdLines.push('```');

// LDIR/LDDR summary
mdLines.push('', '## LDIR/LDDR Block Operations', '');
if (blockOps.length === 0) {
  mdLines.push('None found in this window.');
} else {
  for (const r of blockOps) {
    mdLines.push(`- \`${hex(r.address)}\`: ${r.dasm}`);
  }
}

// Register loads
mdLines.push('', '## Register Setup (HL/DE/BC Loads)', '');
if (regLoads.length === 0) {
  mdLines.push('None found.');
} else {
  for (const r of regLoads) {
    const val = r.insn.value !== undefined ? hex(r.insn.value) : '???';
    mdLines.push(`- \`${hex(r.address)}\`: LD ${r.insn.pair.toUpperCase()}, ${val}`);
  }
}

// LD (HL),n
mdLines.push('', '## LD (HL),n Zero-Fill Seeds', '');
if (ldHLimm.length === 0) {
  mdLines.push('None found.');
} else {
  for (const r of ldHLimm) {
    const val = r.insn.value !== undefined ? `0x${r.insn.value.toString(16).padStart(2, '0')}` : '???';
    mdLines.push(`- \`${hex(r.address)}\`: LD (HL), ${val}`);
  }
}

// Branch targets
mdLines.push('', '## Branch Targets (CALL/JP/JR)', '');
for (const r of branchRecords) {
  const targetStr = r.target === null ? 'indirect' : hex(r.target);
  const backward = r.target !== null && r.target < r.address ? ' **(LOOP)**' : '';
  mdLines.push(`- \`${hex(r.address)}\`: ${r.dasm} -> ${targetStr}${backward}`);
}

// Halts and rets
mdLines.push('', '## Function Boundaries', '');
for (const r of rets) {
  mdLines.push(`- \`${hex(r.address)}\`: ${r.dasm} (${r.insn.tag === 'ret' ? 'unconditional' : 'conditional'})`);
}
for (const r of halts) {
  mdLines.push(`- \`${hex(r.address)}\`: HALT`);
}

// Interpretation
mdLines.push('', '## Interpretation', '');
mdLines.push('The sequence at 0x001881 sets up a massive LDIR clear:');
mdLines.push('1. LD HL, 0xD00000 (source/first byte)');
mdLines.push('2. LD DE, 0xD00001 (destination = source + 1)');
mdLines.push('3. LD BC, 0x013FD7 (length = 81,879 bytes)');
mdLines.push('4. LD (HL), 0x00 (seed the first byte with zero)');
mdLines.push('5. LDIR (copy forward: each byte copies the zero from the previous byte)');
mdLines.push('');
mdLines.push('This zeroes the entire range D00000-D13FD7 (~82KB), which includes:');
mdLines.push('- D007CA (cxMain dispatch vector)');
mdLines.push('- D0231A (edit cursor descriptor)');
mdLines.push('- D0243A (edit cursor descriptor)');
mdLines.push('- D0058C/D0058E (key scan code / translated key)');
mdLines.push('');
mdLines.push('A second clear at 0x001891 targets D1787C-D19880 (VRAM area, 0x2001 = 8193 bytes).');
mdLines.push('A third sequence at 0x0018A1 targets D3FEFF-D3FFFF (high RAM, 255 bytes, written downward via LDIR from FF end).');
mdLines.push('');
mdLines.push('Block 0x0018F8 itself (LD (HL),0; LDIR) is part of a fourth clear sequence set up by registers loaded at 0x0018EC-0x0018F7 (HL=D000FF, DE=D00100, BC depends on prior context). After the LDIR, it:');
mdLines.push('- XOR A; LD (0xD177B7),A -- clears a flag byte');
mdLines.push('- LD A,0x95; LD (0xD0058F),A -- sets a status byte');
mdLines.push('- CALL 0x005B96; CALL 0x005BB1 -- reinitializes subsystems');
mdLines.push('');
mdLines.push('The 0x0019B5 halt block is the natural idle point after init completes.');
mdLines.push('The 0x0019BE "wipe trap" is the start of a new function that re-runs the full init (192K steps).');

mdLines.push('');

fs.writeFileSync(analysisPath, mdLines.join('\n'));
console.log('');
console.log(`Analysis written to ${analysisPath}`);
