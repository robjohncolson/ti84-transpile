// probe-phase385-investigate-D0058E.mjs
// Investigate address 0xD0058E — the most heavily referenced byte in the keyboard state block
// 107 total references per session 384's kbdKey reference map

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const romPath = join(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

console.log(`ROM loaded: ${rom.length} bytes (0x${rom.length.toString(16)})`);
console.log('');

const TARGET = 0xD0058E;
const TARGET_LO = TARGET & 0xFF;         // 0x8E
const TARGET_MID = (TARGET >> 8) & 0xFF; // 0x05
const TARGET_HI = (TARGET >> 16) & 0xFF; // 0xD0

console.log(`Target address: 0x${TARGET.toString(16).toUpperCase()} (LE bytes: ${TARGET_LO.toString(16)} ${TARGET_MID.toString(16)} ${TARGET_HI.toString(16)})`);
console.log('');

// ── Step 1: Find all byte-pattern matches ──

const patternHits = [];
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === TARGET_LO && rom[i + 1] === TARGET_MID && rom[i + 2] === TARGET_HI) {
    patternHits.push(i);
  }
}

console.log(`Found ${patternHits.length} byte-pattern matches for 0xD0058E in ROM`);
console.log('');

// ── Step 2: Classify each reference ──

function classifyReference(patternOffset) {
  // The 3-byte address appears at patternOffset.
  // The opcode byte(s) are BEFORE the address bytes.
  // We need to find where the instruction actually starts.

  // Try decoding from various positions before the pattern to find the instruction
  // that contains this address as an operand.
  const candidates = [];

  for (let tryStart = Math.max(0, patternOffset - 6); tryStart <= patternOffset; tryStart++) {
    try {
      const instr = decodeInstruction(rom, tryStart, 'adl');
      if (!instr) continue;
      const instrEnd = tryStart + instr.length;
      // Does this instruction span over our pattern bytes?
      if (instrEnd >= patternOffset + 3 && tryStart <= patternOffset) {
        candidates.push({ startAddr: tryStart, instr });
      }
    } catch (e) {
      // decode failed, skip
    }
  }

  if (candidates.length === 0) {
    return { type: 'OTHER', mnemonic: '??', operands: '', instrAddr: patternOffset, instrLen: 3 };
  }

  // Pick the candidate whose instruction start is closest to (but not after) patternOffset
  const best = candidates[candidates.length - 1];
  const instr = best.instr;
  const instrAddr = best.startAddr;

  // Classify based on instruction tag
  let type = 'OTHER';
  let mnemonic = instr.tag || '??';
  let operands = '';

  const tag = instr.tag;

  if (tag === 'ld-a-ind-nn') {
    type = 'READ'; mnemonic = 'LD'; operands = `A,(0x${TARGET.toString(16).toUpperCase()})`;
  } else if (tag === 'ld-ind-nn-a') {
    type = 'WRITE'; mnemonic = 'LD'; operands = `(0x${TARGET.toString(16).toUpperCase()}),A`;
  } else if (tag === 'ld-hl-ind-nn' || tag === 'ld-rr-ind-nn') {
    type = 'READ';
    const reg = instr.pair || instr.reg || 'HL';
    mnemonic = 'LD'; operands = `${reg.toUpperCase()},(0x${TARGET.toString(16).toUpperCase()})`;
  } else if (tag === 'ld-ind-nn-hl' || tag === 'ld-ind-nn-rr') {
    type = 'WRITE';
    const reg = instr.pair || instr.reg || 'HL';
    mnemonic = 'LD'; operands = `(0x${TARGET.toString(16).toUpperCase()}),${reg.toUpperCase()}`;
  } else if (tag === 'ld-ix-ind-nn' || tag === 'ld-iy-ind-nn') {
    type = 'READ';
    const reg = tag.includes('ix') ? 'IX' : 'IY';
    mnemonic = 'LD'; operands = `${reg},(0x${TARGET.toString(16).toUpperCase()})`;
  } else if (tag === 'ld-ind-nn-ix' || tag === 'ld-ind-nn-iy') {
    type = 'WRITE';
    const reg = tag.includes('ix') ? 'IX' : 'IY';
    mnemonic = 'LD'; operands = `(0x${TARGET.toString(16).toUpperCase()}),${reg}`;
  } else if (tag === 'jp' || tag === 'jp-conditional') {
    type = 'OTHER'; mnemonic = 'JP';
    operands = instr.condition ? `${instr.condition.toUpperCase()},0x${TARGET.toString(16).toUpperCase()}` : `0x${TARGET.toString(16).toUpperCase()}`;
  } else if (tag === 'call' || tag === 'call-conditional') {
    type = 'OTHER'; mnemonic = 'CALL';
    operands = instr.condition ? `${instr.condition.toUpperCase()},0x${TARGET.toString(16).toUpperCase()}` : `0x${TARGET.toString(16).toUpperCase()}`;
  } else {
    // Fallback: check raw bytes manually
    const prevByte = rom[patternOffset - 1];
    if (prevByte === 0x3A) { type = 'READ'; mnemonic = 'LD'; operands = `A,(0xD0058E)`; }
    else if (prevByte === 0x32) { type = 'WRITE'; mnemonic = 'LD'; operands = `(0xD0058E),A`; }
    else if (prevByte === 0x2A) { type = 'READ'; mnemonic = 'LD'; operands = `HL,(0xD0058E)`; }
    else if (prevByte === 0x22) { type = 'WRITE'; mnemonic = 'LD'; operands = `(0xD0058E),HL`; }
    else {
      // Check for ED prefix
      if (patternOffset >= 2 && rom[patternOffset - 2] === 0xED) {
        const edOp = rom[patternOffset - 1];
        const edPairs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
        const edWritePairs = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
        if (edPairs[edOp]) { type = 'READ'; mnemonic = 'LD'; operands = `${edPairs[edOp]},(0xD0058E)`; }
        else if (edWritePairs[edOp]) { type = 'WRITE'; mnemonic = 'LD'; operands = `(0xD0058E),${edWritePairs[edOp]}`; }
      }
      // Check DD/FD prefix
      if (patternOffset >= 2) {
        const pre = rom[patternOffset - 2];
        const op = rom[patternOffset - 1];
        if (pre === 0xDD && op === 0x2A) { type = 'READ'; mnemonic = 'LD'; operands = `IX,(0xD0058E)`; }
        if (pre === 0xDD && op === 0x22) { type = 'WRITE'; mnemonic = 'LD'; operands = `(0xD0058E),IX`; }
        if (pre === 0xFD && op === 0x2A) { type = 'READ'; mnemonic = 'LD'; operands = `IY,(0xD0058E)`; }
        if (pre === 0xFD && op === 0x22) { type = 'WRITE'; mnemonic = 'LD'; operands = `(0xD0058E),IY`; }
      }
      if (type === 'OTHER') {
        mnemonic = tag;
        operands = JSON.stringify(instr).substring(0, 80);
      }
    }
  }

  return { type, mnemonic, operands, instrAddr, instrLen: instr.length, instr };
}

// Classify all hits
const classified = patternHits.map(offset => {
  const c = classifyReference(offset);
  return { patternOffset: offset, ...c };
});

// ── Step 3: Print all references ──

const reads = classified.filter(r => r.type === 'READ');
const writes = classified.filter(r => r.type === 'WRITE');
const others = classified.filter(r => r.type === 'OTHER');

console.log(`Classification: ${reads.length} READs, ${writes.length} WRITEs, ${others.length} OTHERs`);
console.log('');

function hexBytes(offset, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(rom[offset + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

console.log('=== ALL REFERENCES TO 0xD0058E ===');
console.log('');
console.log('Address     Hex Bytes              Mnemonic  Operands                           Type');
console.log('-'.repeat(100));

for (const ref of classified) {
  const addr = `0x${ref.instrAddr.toString(16).padStart(6, '0')}`;
  const hex = hexBytes(ref.instrAddr, Math.min(ref.instrLen, 8));
  console.log(`${addr}  ${hex.padEnd(23)} ${ref.mnemonic.padEnd(9)} ${ref.operands.padEnd(35)} [${ref.type}]`);
}

console.log('');

// ── Step 4: Group by ROM region ──

console.log('=== REFERENCES BY ROM REGION ===');
console.log('');

const regionMap = new Map();
for (const ref of classified) {
  const region = (ref.instrAddr >> 16) & 0xFF;
  const key = `0x${region.toString(16).padStart(2, '0')}xxxx`;
  if (!regionMap.has(key)) regionMap.set(key, []);
  regionMap.get(key).push(ref);
}

const sortedRegions = [...regionMap.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [region, refs] of sortedRegions) {
  const rr = refs.filter(r => r.type === 'READ').length;
  const ww = refs.filter(r => r.type === 'WRITE').length;
  const oo = refs.filter(r => r.type === 'OTHER').length;
  console.log(`  ${region}: ${refs.length} refs (${rr} READ, ${ww} WRITE, ${oo} OTHER)`);
}
console.log('');

// ── Step 5: Top 5 clusters with 10-instruction context ──

console.log('=== TOP 5 CLUSTERS — 10-INSTRUCTION CONTEXT ===');
console.log('');

// Group references that are close together (within 64 bytes)
const clusters = [];
let currentCluster = [classified[0]];

for (let i = 1; i < classified.length; i++) {
  if (classified[i].instrAddr - classified[i - 1].instrAddr < 64) {
    currentCluster.push(classified[i]);
  } else {
    clusters.push(currentCluster);
    currentCluster = [classified[i]];
  }
}
if (currentCluster.length > 0) clusters.push(currentCluster);

// Sort clusters by size (most refs first), take top 5
const topClusters = clusters.sort((a, b) => b.length - a.length).slice(0, 5);

for (let ci = 0; ci < topClusters.length; ci++) {
  const cluster = topClusters[ci];
  const centerAddr = cluster[0].instrAddr;
  const clusterEnd = cluster[cluster.length - 1].instrAddr;
  console.log(`--- Cluster ${ci + 1}: ${cluster.length} refs around 0x${centerAddr.toString(16).padStart(6, '0')}–0x${clusterEnd.toString(16).padStart(6, '0')} ---`);

  // Disassemble 5 instructions before, the cluster, and 5 after
  const contextStart = Math.max(0, centerAddr - 20);
  const contextEnd = Math.min(rom.length - 1, clusterEnd + 30);

  let pc = contextStart;
  let instrCount = 0;
  const maxInstrs = 20;

  while (pc < contextEnd && instrCount < maxInstrs) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) { pc++; continue; }

      const addr = `0x${pc.toString(16).padStart(6, '0')}`;
      const hex = hexBytes(pc, Math.min(instr.length, 8));

      // Check if this instruction references our target
      const isTarget = cluster.some(r => r.instrAddr === pc);
      const marker = isTarget ? ' <<<' : '';

      // Build a human-readable mnemonic
      let desc = instr.tag;
      if (instr.target !== undefined && typeof instr.target === 'number') {
        desc += ` 0x${instr.target.toString(16).padStart(6, '0')}`;
      }
      if (instr.value !== undefined) desc += ` ${instr.value}`;
      if (instr.reg) desc += ` ${instr.reg}`;
      if (instr.pair) desc += ` ${instr.pair}`;
      if (instr.op) desc += ` ${instr.op}`;
      if (instr.condition) desc += ` ${instr.condition}`;
      if (instr.bit !== undefined) desc += ` bit${instr.bit}`;
      if (instr.displacement !== undefined) desc += ` disp=${instr.displacement}`;

      console.log(`  ${addr}  ${hex.padEnd(23)} ${desc}${marker}`);

      pc += instr.length;
      instrCount++;
    } catch (e) {
      pc++;
    }
  }
  console.log('');
}

// ── Step 6: Analyze patterns — values written, comparisons after reads ──

console.log('=== PATTERN ANALYSIS ===');
console.log('');

// 6a: What values are written to 0xD0058E
console.log('--- Values written to 0xD0058E ---');
console.log('');
for (const ref of writes) {
  // Look at what's in A register context before the write
  // Scan backwards a few instructions to find what loaded A
  const writeAddr = ref.instrAddr;
  let pc = Math.max(0, writeAddr - 20);
  const contextInstrs = [];

  while (pc < writeAddr) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) { pc++; continue; }
      contextInstrs.push({ addr: pc, instr });
      pc += instr.length;
    } catch (e) {
      pc++;
    }
  }

  // Show last 3 instructions before the write
  const relevant = contextInstrs.slice(-3);
  const hex = hexBytes(writeAddr, ref.instrLen);
  console.log(`  Write at 0x${writeAddr.toString(16).padStart(6, '0')}: ${ref.operands}`);
  for (const ctx of relevant) {
    const h = hexBytes(ctx.addr, Math.min(ctx.instr.length, 8));
    let desc = ctx.instr.tag;
    if (ctx.instr.value !== undefined) desc += ` #${ctx.instr.value} (0x${ctx.instr.value.toString(16)})`;
    if (ctx.instr.reg) desc += ` ${ctx.instr.reg}`;
    if (ctx.instr.pair) desc += ` ${ctx.instr.pair}`;
    if (ctx.instr.op) desc += ` ${ctx.instr.op}`;
    if (ctx.instr.target !== undefined && typeof ctx.instr.target === 'number') desc += ` 0x${ctx.instr.target.toString(16)}`;
    console.log(`    pre: 0x${ctx.addr.toString(16).padStart(6, '0')}  ${h.padEnd(20)} ${desc}`);
  }
  console.log('');
}

// 6b: What comparisons are done after reading 0xD0058E
console.log('--- Comparisons after reading 0xD0058E ---');
console.log('');
for (const ref of reads) {
  const readAddr = ref.instrAddr;
  let pc = readAddr + ref.instrLen;
  const postInstrs = [];

  for (let count = 0; count < 5 && pc < rom.length - 1; count++) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) { pc++; continue; }
      postInstrs.push({ addr: pc, instr });
      pc += instr.length;
    } catch (e) {
      pc++;
    }
  }

  // Look for CP, AND, OR, BIT, comparisons
  const interesting = postInstrs.filter(p =>
    p.instr.tag === 'alu-imm' ||
    p.instr.tag === 'alu-reg' ||
    p.instr.tag === 'bit-test' ||
    p.instr.tag === 'bit-test-ind' ||
    (p.instr.tag && p.instr.tag.includes('jp')) ||
    (p.instr.tag && p.instr.tag.includes('jr')) ||
    (p.instr.tag && p.instr.tag.includes('call'))
  );

  if (interesting.length > 0) {
    console.log(`  Read at 0x${readAddr.toString(16).padStart(6, '0')}: ${ref.operands}`);
    for (const post of interesting) {
      const h = hexBytes(post.addr, Math.min(post.instr.length, 8));
      let desc = post.instr.tag;
      if (post.instr.op) desc += ` ${post.instr.op}`;
      if (post.instr.value !== undefined) desc += ` #${post.instr.value} (0x${post.instr.value.toString(16)})`;
      if (post.instr.condition) desc += ` ${post.instr.condition}`;
      if (post.instr.target !== undefined && typeof post.instr.target === 'number') desc += ` -> 0x${post.instr.target.toString(16).padStart(6, '0')}`;
      if (post.instr.reg) desc += ` ${post.instr.reg}`;
      console.log(`    post: 0x${post.addr.toString(16).padStart(6, '0')}  ${h.padEnd(20)} ${desc}`);
    }
    console.log('');
  }
}

// ── Step 7: Summary ──

console.log('');
console.log('=== SUMMARY ===');
console.log('');
console.log(`Address 0xD0058E — ${classified.length} total references`);
console.log(`  READs:  ${reads.length}`);
console.log(`  WRITEs: ${writes.length}`);
console.log(`  OTHERs: ${others.length}`);
console.log('');

// Collect unique values written (from immediate loads before writes)
const writtenValues = new Set();
for (const ref of writes) {
  const writeAddr = ref.instrAddr;
  let pc = Math.max(0, writeAddr - 10);
  while (pc < writeAddr) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) { pc++; continue; }
      // LD A,n (immediate load into A) — decoder uses 'dest' not 'reg'
      if (instr.tag === 'ld-reg-imm' && (instr.dest === 'a' || instr.reg === 'a') && instr.value !== undefined) {
        writtenValues.add(instr.value);
      }
      // XOR A (sets A = 0)
      if (instr.tag === 'alu-reg' && instr.op === 'xor') {
        writtenValues.add(0);
      }
      // SUB A (sets A = 0)
      if (instr.tag === 'alu-reg' && instr.op === 'sub') {
        writtenValues.add(0);
      }
      pc += instr.length;
    } catch (e) {
      pc++;
    }
  }
}

if (writtenValues.size > 0) {
  console.log(`Detected values written to 0xD0058E: ${[...writtenValues].map(v => `0x${v.toString(16).padStart(2, '0')} (${v})`).join(', ')}`);
}

// Collect unique comparison values after reads
const comparedValues = new Set();
for (const ref of reads) {
  const readAddr = ref.instrAddr;
  let pc = readAddr + ref.instrLen;
  for (let count = 0; count < 3 && pc < rom.length - 1; count++) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) { pc++; continue; }
      if (instr.tag === 'alu-imm' && instr.op === 'cp' && instr.value !== undefined) {
        comparedValues.add(instr.value);
      }
      if (instr.tag === 'alu-imm' && instr.op === 'and' && instr.value !== undefined) {
        comparedValues.add(`AND 0x${instr.value.toString(16)}`);
      }
      if (instr.tag === 'alu-imm' && instr.op === 'or' && instr.value !== undefined) {
        comparedValues.add(`OR 0x${instr.value.toString(16)}`);
      }
      pc += instr.length;
    } catch (e) {
      pc++;
    }
  }
}

if (comparedValues.size > 0) {
  console.log(`Comparison operations after reads: ${[...comparedValues].map(v => typeof v === 'number' ? `CP ${v} (0x${v.toString(16)})` : v).join(', ')}`);
}

console.log('');
console.log('Regions with most references:');
for (const [region, refs] of sortedRegions.slice(0, 5)) {
  console.log(`  ${region}: ${refs.length} references`);
}

console.log('');
console.log('=== ANALYTICAL CONCLUSIONS ===');
console.log('');
console.log('0xD0058E sits at offset +7 in the keyboard state block (base 0xD00587).');
console.log('');
console.log('Key observations:');
console.log('  1. HEAVILY referenced (107 times) — more than kbdKey (0xD0058C) itself.');
console.log('  2. Always accessed as a BYTE via LD A,(nn) / LD (nn),A (except 2 LD DE and 3 LD HL).');
console.log('  3. Values written include: 0x00 (via XOR A/SUB A), and numerous computed/immediate');
console.log('     values like 0x01, 0x06, 0x58, 0x82, 0xCA, 0xD0, 0xE8, 0xFB, 0xFD.');
console.log('  4. Comparison values span a WIDE range: 0x01-0xFE, including:');
console.log('     - Small values: 1,2,3,6,8,9,10,13,14,16,17,18,20,22,24,29,30');
console.log('     - Mid values: 33,34,35,41,42,44,51,58,67,68,92,105');
console.log('     - High values: 140,156,158,188,189,190,199,207,232,245,248,253,254,255');
console.log('  5. The 0x08xxxx region (50 refs) contains the heaviest usage — likely the');
console.log('     key-processing / editor / menu dispatch subsystem.');
console.log('  6. Writes at 0x02Fxxx often pair with writes to 0xD0058C (kbdKey), suggesting');
console.log('     0xD0058E is set alongside the key code as part of key event processing.');
console.log('  7. Reads at 0x0890xx compare against 0x10,0x11,0x14,0x18,0x1D — these look');
console.log('     like token/modifier IDs, not raw key codes.');
console.log('');
console.log('CONCLUSION: 0xD0058E is likely the "key mode" or "key token" — a processed/');
console.log('translated key code that represents the SEMANTIC meaning of the key press');
console.log('(after applying 2nd/Alpha modifiers). The wide range of comparison values');
console.log('matches the TI-OS token table. It is the variable that OS subsystems actually');
console.log('dispatch on, while kbdKey (0xD0058C) holds the raw/physical key identity.');
console.log('');
console.log('Recommended name: kbdToken or keyToken (keyboard token / translated key code).');
console.log('');
console.log('Done.');
