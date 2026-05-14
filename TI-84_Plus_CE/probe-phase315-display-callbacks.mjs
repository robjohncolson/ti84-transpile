// probe-phase315-display-callbacks.mjs
// Map the D177BD-D177C9 display callback cluster (5 slots, 3-byte stride)
// Searches ROM for all instructions that read/write these callback slot addresses.

import fs from 'fs';

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));
const ROM_SIZE = rom.length;

const SLOTS = [
  { addr: 0xD177BD, name: 'slot0' },
  { addr: 0xD177C0, name: 'slot1' },
  { addr: 0xD177C3, name: 'slot2' },
  { addr: 0xD177C6, name: 'slot3' },
  { addr: 0xD177C9, name: 'slot4' },
];

// Build search patterns for a given 24-bit address
function patternsFor(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  const a = [lo, mid, hi]; // little-endian bytes

  const writes = [
    { opcodes: [0x22],       suffix: a, len: 4, desc: 'LD (imm24),HL' },
    { opcodes: [0xED, 0x43], suffix: a, len: 5, desc: 'LD (imm24),BC' },
    { opcodes: [0xED, 0x53], suffix: a, len: 5, desc: 'LD (imm24),DE' },
    { opcodes: [0xDD, 0x22], suffix: a, len: 5, desc: 'LD (imm24),IX' },
    { opcodes: [0xFD, 0x22], suffix: a, len: 5, desc: 'LD (imm24),IY' },
    { opcodes: [0x32],       suffix: a, len: 4, desc: 'LD (imm24),A' },
  ];

  const reads = [
    { opcodes: [0x2A],       suffix: a, len: 4, desc: 'LD HL,(imm24)' },
    { opcodes: [0xED, 0x4B], suffix: a, len: 5, desc: 'LD BC,(imm24)' },
    { opcodes: [0xED, 0x5B], suffix: a, len: 5, desc: 'LD DE,(imm24)' },
    { opcodes: [0xDD, 0x2A], suffix: a, len: 5, desc: 'LD IX,(imm24)' },
    { opcodes: [0xFD, 0x2A], suffix: a, len: 5, desc: 'LD IY,(imm24)' },
    { opcodes: [0x3A],       suffix: a, len: 4, desc: 'LD A,(imm24)' },
  ];

  return { writes, reads };
}

// Search ROM for a byte pattern (opcodes + suffix)
function searchPattern(pat) {
  const full = [...pat.opcodes, ...pat.suffix];
  const results = [];
  for (let i = 0; i <= ROM_SIZE - full.length; i++) {
    let match = true;
    for (let j = 0; j < full.length; j++) {
      if (rom[i + j] !== full[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

// Extract hex dump
function hexAt(offset, len) {
  const start = Math.max(0, offset);
  const end = Math.min(ROM_SIZE, offset + len);
  const bytes = [];
  for (let i = start; i < end; i++) bytes.push(rom[i].toString(16).padStart(2, '0'));
  return bytes.join(' ');
}

// Basic disassembly of first instruction at an address (simplified)
function disasmFirst(offset) {
  if (offset < 0 || offset >= ROM_SIZE) return '(out of ROM range)';
  const b0 = rom[offset];
  const raw = hexAt(offset, 10);

  // Common opcodes
  if (b0 === 0xC3 && offset + 3 < ROM_SIZE) {
    const target = rom[offset+1] | (rom[offset+2] << 8) | (rom[offset+3] << 16);
    return `JP 0x${target.toString(16).padStart(6,'0')}  ; ${raw}`;
  }
  if (b0 === 0xCD && offset + 3 < ROM_SIZE) {
    const target = rom[offset+1] | (rom[offset+2] << 8) | (rom[offset+3] << 16);
    return `CALL 0x${target.toString(16).padStart(6,'0')}  ; ${raw}`;
  }
  if (b0 === 0x21 && offset + 3 < ROM_SIZE) {
    const imm = rom[offset+1] | (rom[offset+2] << 8) | (rom[offset+3] << 16);
    return `LD HL,0x${imm.toString(16).padStart(6,'0')}  ; ${raw}`;
  }
  if (b0 === 0xC9) return `RET  ; ${raw}`;
  if (b0 === 0x00) return `NOP  ; ${raw}`;
  if (b0 === 0xF3) return `DI  ; ${raw}`;
  if (b0 === 0xFB) return `EI  ; ${raw}`;
  if (b0 === 0xAF) return `XOR A  ; ${raw}`;
  if (b0 === 0x3E && offset + 1 < ROM_SIZE) {
    return `LD A,0x${rom[offset+1].toString(16).padStart(2,'0')}  ; ${raw}`;
  }
  if (b0 === 0xED) {
    if (offset + 1 < ROM_SIZE) {
      const b1 = rom[offset+1];
      if (b1 === 0x73 && offset + 4 < ROM_SIZE) {
        const imm = rom[offset+2] | (rom[offset+3] << 8) | (rom[offset+4] << 16);
        return `LD (0x${imm.toString(16).padStart(6,'0')}),SP  ; ${raw}`;
      }
    }
    return `ED-prefixed  ; ${raw}`;
  }
  if (b0 === 0xDD || b0 === 0xFD) {
    const prefix = b0 === 0xDD ? 'IX' : 'IY';
    return `${prefix}-prefixed  ; ${raw}`;
  }
  // PUSH/POP
  const pushPop = { 0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
                     0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF' };
  if (pushPop[b0]) return `${pushPop[b0]}  ; ${raw}`;

  return `??? (0x${b0.toString(16).padStart(2,'0')})  ; ${raw}`;
}

// Check for LD HL,imm24 (0x21 xx xx xx) immediately before a write instruction
function checkPriorLoadHL(writeOffset) {
  // LD HL,imm24 is 4 bytes: 21 lo mid hi
  if (writeOffset < 4) return null;
  const prior = writeOffset - 4;
  if (rom[prior] === 0x21) {
    const imm = rom[prior+1] | (rom[prior+2] << 8) | (rom[prior+3] << 16);
    return { offset: prior, target: imm };
  }
  return null;
}

console.log('=== Phase 315: D177BD-D177C9 Display Callback Cluster Probe ===\n');

const allCallbackTargets = new Set();
const slotSummaries = [];

for (const slot of SLOTS) {
  const { writes, reads } = patternsFor(slot.addr);
  const addrHex = `0x${slot.addr.toString(16).toUpperCase()}`;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SLOT: ${addrHex} (${slot.name})`);
  console.log(`${'='.repeat(70)}`);

  const writeResults = [];
  const readResults = [];
  const targets = [];

  // --- WRITES ---
  console.log(`\n--- WRITE sites (stores TO ${addrHex}) ---`);
  let writeCount = 0;
  for (const pat of writes) {
    const hits = searchPattern(pat);
    for (const off of hits) {
      writeCount++;
      const contextStart = Math.max(0, off - 10);
      const contextLen = 20 + pat.len;
      console.log(`  [W${writeCount}] 0x${off.toString(16).padStart(6,'0')}: ${pat.desc}`);
      console.log(`       context: ${hexAt(contextStart, contextLen)}`);
      console.log(`       (context from 0x${contextStart.toString(16).padStart(6,'0')})`);

      // Check for prior LD HL,imm24
      const prior = checkPriorLoadHL(off);
      if (prior) {
        const tgt = prior.target;
        console.log(`       ** LD HL,0x${tgt.toString(16).padStart(6,'0')} immediately before (callback target)`);
        targets.push({ writerOffset: off, target: tgt });
        allCallbackTargets.add(tgt);
      } else {
        console.log(`       (no immediate LD HL,imm24 before — check context for dynamic source)`);
      }

      writeResults.push({ offset: off, desc: pat.desc, target: prior ? prior.target : null });
    }
  }
  if (writeCount === 0) console.log('  (none found)');

  // --- READS ---
  console.log(`\n--- READ sites (loads FROM ${addrHex}) ---`);
  let readCount = 0;
  for (const pat of reads) {
    const hits = searchPattern(pat);
    for (const off of hits) {
      readCount++;
      const afterStart = off + pat.len;
      console.log(`  [R${readCount}] 0x${off.toString(16).padStart(6,'0')}: ${pat.desc}`);
      console.log(`       next 10 bytes after: ${hexAt(afterStart, 10)}`);

      readResults.push({ offset: off, desc: pat.desc });
    }
  }
  if (readCount === 0) console.log('  (none found)');

  slotSummaries.push({
    addr: addrHex,
    name: slot.name,
    writeCount,
    readCount,
    writers: writeResults,
    readers: readResults,
    targets,
  });
}

// --- CALLBACK TARGET ANALYSIS ---
console.log(`\n\n${'='.repeat(70)}`);
console.log('CALLBACK TARGET ANALYSIS');
console.log(`${'='.repeat(70)}`);
console.log(`\nUnique callback targets discovered: ${allCallbackTargets.size}`);

for (const tgt of [...allCallbackTargets].sort((a, b) => a - b)) {
  const tgtHex = `0x${tgt.toString(16).padStart(6, '0')}`;
  console.log(`\n  Target: ${tgtHex}`);
  if (tgt < 0x400000 && tgt < ROM_SIZE) {
    console.log(`    First 10 bytes: ${hexAt(tgt, 10)}`);
    console.log(`    Disasm: ${disasmFirst(tgt)}`);
  } else if (tgt >= 0xD00000) {
    console.log(`    (RAM address — runtime-determined callback)`);
  } else {
    console.log(`    (address outside ROM)`);
  }
}

// --- PER-SLOT SUMMARY TABLE ---
console.log(`\n\n${'='.repeat(70)}`);
console.log('PER-SLOT SUMMARY');
console.log(`${'='.repeat(70)}\n`);

for (const s of slotSummaries) {
  console.log(`${s.addr} (${s.name}): ${s.writeCount} writes, ${s.readCount} reads`);
  for (const w of s.writers) {
    const tgtStr = w.target !== null ? ` → callback 0x${w.target.toString(16).padStart(6,'0')}` : ' → (dynamic)';
    console.log(`  WRITE @ 0x${w.offset.toString(16).padStart(6,'0')}: ${w.desc}${tgtStr}`);
  }
  for (const r of s.readers) {
    console.log(`  READ  @ 0x${r.offset.toString(16).padStart(6,'0')}: ${r.desc}`);
  }
}

// --- CROSS-REFERENCE: look for LD IY,(slot) followed by CALL/JP patterns ---
console.log(`\n\n${'='.repeat(70)}`);
console.log('DISPATCH PATTERN ANALYSIS (read sites → how value is used)');
console.log(`${'='.repeat(70)}\n`);

for (const s of slotSummaries) {
  for (const r of s.readers) {
    const afterOff = r.offset + (r.desc.includes('IX') || r.desc.includes('IY') || r.desc.includes('BC') || r.desc.includes('DE') ? 5 : 4);
    const after10 = hexAt(afterOff, 10);
    console.log(`${s.addr} READ @ 0x${r.offset.toString(16).padStart(6,'0')} (${r.desc}):`);
    console.log(`  following bytes: ${after10}`);

    // Check for common dispatch patterns
    if (afterOff < ROM_SIZE) {
      const b = rom[afterOff];
      if (b === 0xFD && afterOff + 1 < ROM_SIZE) {
        const b1 = rom[afterOff + 1];
        if (b1 === 0xE9) console.log('  ** JP (IY) dispatch!');
        if (b1 === 0xE5) console.log('  ** PUSH IY (may be followed by RET dispatch)');
      }
      if (b === 0xDD && afterOff + 1 < ROM_SIZE) {
        const b1 = rom[afterOff + 1];
        if (b1 === 0xE9) console.log('  ** JP (IX) dispatch!');
      }
      if (b === 0xE9) console.log('  ** JP (HL) dispatch!');
      if (b === 0xCD) {
        const target = rom[afterOff+1] | (rom[afterOff+2] << 8) | (rom[afterOff+3] << 16);
        console.log(`  ** CALL 0x${target.toString(16).padStart(6,'0')}`);
      }
      if (b === 0xC3) {
        const target = rom[afterOff+1] | (rom[afterOff+2] << 8) | (rom[afterOff+3] << 16);
        console.log(`  ** JP 0x${target.toString(16).padStart(6,'0')}`);
      }
    }
  }
}

console.log('\n=== Probe complete ===');
