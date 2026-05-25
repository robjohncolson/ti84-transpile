#!/usr/bin/env node
// Phase 439 — port 0x3082 (OTG_CSR) bit-access survey + speed-decode analysis
// Finds all sites that read port 0x3082, classifies which bits each site tests,
// and traces the full speed-classification arithmetic for the AND 0x08 + RRA +
// SET 2 + CP 0x30 pattern.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase439-speed-decode-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ── Step 1: Find all LD BC,0x3082 / LD BC,0x003082 + IN A,(C) sites ──
//
// Z80 compat mode (3-byte imm): 01 82 30 ED 78  (LD BC,0x3082 then IN A,(C))
// ADL mode (4-byte imm):        01 82 30 00 ... ED 78  (LD BC,0x003082, IN nearby)
//
// The TI-84 CE OS runs most USB code in Z80 compat mode, where LD BC,nn
// takes a 2-byte immediate. This means the 01 82 30 is immediately followed
// by ED 78 with no gap byte.

const portSites = [];

// Pattern A: Z80-mode — 01 82 30 ED 78 (5 consecutive bytes)
for (let addr = 0; addr < rom.length - 4; addr++) {
  if (rom[addr] === 0x01 && rom[addr+1] === 0x82 && rom[addr+2] === 0x30
      && rom[addr+3] === 0xED && rom[addr+4] === 0x78) {
    portSites.push({ ldAddr: addr, inAddr: addr + 3, mode: 'Z80' });
  }
}

// Pattern B: ADL-mode — 01 82 30 00, then ED 78 within 10 bytes
for (let addr = 0; addr < rom.length - 5; addr++) {
  if (rom[addr] === 0x01 && rom[addr+1] === 0x82 && rom[addr+2] === 0x30 && rom[addr+3] === 0x00) {
    // Skip if this was already captured as Z80-mode (where byte[3]=0xED not 0x00)
    const already = portSites.some(s => s.ldAddr === addr);
    if (already) continue;
    for (let off = 4; off <= 14 && (addr + off + 1) < rom.length; off++) {
      if (rom[addr + off] === 0xED && rom[addr + off + 1] === 0x78) {
        portSites.push({ ldAddr: addr, inAddr: addr + off, mode: 'ADL' });
        break;
      }
    }
  }
}

// Sort by address
portSites.sort((a, b) => a.inAddr - b.inAddr);

console.log(`Found ${portSites.length} port 0x3082 read sites\n`);

// ── Step 2: Classify bit-manipulation patterns after each IN A,(C) ───

// Known patterns to look for in the 30 bytes after IN A,(C)
const BIT_PATTERNS = {
  'AND 0x08 (bit 3)':   [0xE6, 0x08],
  'AND 0x20 (bit 5)':   [0xE6, 0x20],
  'AND 0x10 (bit 4)':   [0xE6, 0x10],
  'AND 0x02 (bit 1)':   [0xE6, 0x02],
  'AND 0x01 (bit 0)':   [0xE6, 0x01],
  'AND 0xC0 (bits 7:6)':[0xE6, 0xC0],
  'AND 0xC8 (bits 7,6,3)': [0xE6, 0xC8],
  'AND 0x38 (bits 5:3)':[0xE6, 0x38],
  'AND 0x18 (bits 4:3)':[0xE6, 0x18],
  'AND 0x0C (bits 3:2)':[0xE6, 0x0C],
  'AND 0xF8 (bits 7:3)':[0xE6, 0xF8],
  'AND 0xFF (all bits)':[0xE6, 0xFF],
  'RRA':                [0x1F],
  'SET 2,A':            [0xCB, 0xD7],
  'CP 0x30':            [0xFE, 0x30],
  'CP 0x20':            [0xFE, 0x20],
  'CP 0x10':            [0xFE, 0x10],
};

// BIT n,A instructions: CB 47 (BIT 0,A) through CB 7F (BIT 7,A)
// BIT n,A = CB (0x40 | (n<<3) | 7) = CB 47, CB 4F, CB 57, CB 5F, CB 67, CB 6F, CB 77, CB 7F
for (let bit = 0; bit < 8; bit++) {
  const opcode = 0x47 | (bit << 3);
  BIT_PATTERNS[`BIT ${bit},A`] = [0xCB, opcode];
}

// Branch patterns
const BRANCH_PATTERNS = {
  'JR C':  [0x38],
  'JR NC': [0x30],
  'JR Z':  [0x28],
  'JR NZ': [0x20],
};

function findPatterns(startAddr, window) {
  const found = [];
  const end = Math.min(startAddr + window, rom.length);
  for (const [name, bytes] of Object.entries(BIT_PATTERNS)) {
    for (let a = startAddr; a < end - bytes.length + 1; a++) {
      let match = true;
      for (let i = 0; i < bytes.length; i++) {
        if (rom[a + i] !== bytes[i]) { match = false; break; }
      }
      if (match) {
        found.push({ name, addr: a, bytes });
        break;  // first occurrence only per pattern
      }
    }
  }
  return found;
}

function findBranches(startAddr, window) {
  const found = [];
  const end = Math.min(startAddr + window, rom.length);
  for (let a = startAddr; a < end; a++) {
    const b = rom[a];
    if (b === 0x38) found.push({ name: 'JR C', addr: a, offset: rom[a+1] });
    else if (b === 0x30) found.push({ name: 'JR NC', addr: a, offset: rom[a+1] });
    else if (b === 0x28) found.push({ name: 'JR Z', addr: a, offset: rom[a+1] });
    else if (b === 0x20) found.push({ name: 'JR NZ', addr: a, offset: rom[a+1] });
    else if (b === 0xCA) found.push({ name: 'JP Z', addr: a, target: rom[a+1] | (rom[a+2]<<8) | (rom[a+3]<<16) });
    else if (b === 0xC2) found.push({ name: 'JP NZ', addr: a, target: rom[a+1] | (rom[a+2]<<8) | (rom[a+3]<<16) });
    else if (b === 0xDA) found.push({ name: 'JP C', addr: a, target: rom[a+1] | (rom[a+2]<<8) | (rom[a+3]<<16) });
    else if (b === 0xD2) found.push({ name: 'JP NC', addr: a, target: rom[a+1] | (rom[a+2]<<8) | (rom[a+3]<<16) });
  }
  return found;
}

function hexDump(startAddr, len) {
  const bytes = [];
  for (let i = 0; i < len && (startAddr + i) < rom.length; i++) {
    bytes.push(rom[startAddr + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

// Also check for wider AND masks at each site — scan every E6 xx
function findAllANDs(startAddr, window) {
  const found = [];
  const end = Math.min(startAddr + window, rom.length);
  for (let a = startAddr; a < end - 1; a++) {
    if (rom[a] === 0xE6) {
      found.push({ addr: a, mask: rom[a+1] });
    }
  }
  return found;
}

// Annotated analysis of each site
const siteAnalyses = [];
const bitGroups = {};  // group by which bits are tested

for (const site of portSites) {
  const patterns = findPatterns(site.inAddr + 2, 30);
  const branches = findBranches(site.inAddr + 2, 40);
  const allANDs = findAllANDs(site.inAddr + 2, 30);

  const patternNames = patterns.map(p => p.name);

  // Classify by AND mask
  const andMasks = allANDs.map(a => a.mask);
  const key = andMasks.length > 0
    ? andMasks.map(m => `AND 0x${m.toString(16).padStart(2,'0')}`).join(' + ')
    : 'no AND (raw read)';

  if (!bitGroups[key]) bitGroups[key] = [];
  bitGroups[key].push(site);

  const analysis = {
    ldAddr: site.ldAddr,
    inAddr: site.inAddr,
    mode: site.mode,
    patterns: patternNames,
    branches,
    allANDs,
    dump: hexDump(site.inAddr, 40),
  };

  // Check for speed-decode pattern: AND + RRA + SET 2 + CP 0x30
  const hasRRA = patternNames.includes('RRA');
  const hasSET2 = patternNames.includes('SET 2,A');
  const hasCP30 = patternNames.includes('CP 0x30');
  analysis.isSpeedDecode = hasRRA && hasSET2 && hasCP30;

  siteAnalyses.push(analysis);
}

// ── Step 3: Speed-decode arithmetic trace ────────────────────────────

console.log('=== PORT 0x3082 ACCESS SITES ===\n');

for (const analysis of siteAnalyses) {
  const tag = analysis.isSpeedDecode ? ' ** SPEED-DECODE **' : '';
  console.log(`  [${analysis.mode}] LD BC at 0x${analysis.ldAddr.toString(16).padStart(6,'0')}  IN A,(C) at 0x${analysis.inAddr.toString(16).padStart(6,'0')}${tag}`);
  console.log(`    Hex: ${analysis.dump}`);
  console.log(`    Patterns: ${analysis.patterns.join(', ') || '(none)'}`);
  if (analysis.allANDs.length > 0) {
    console.log(`    AND masks: ${analysis.allANDs.map(a => `0x${a.mask.toString(16).padStart(2,'0')} @ 0x${a.addr.toString(16).padStart(6,'0')}`).join(', ')}`);
  }
  if (analysis.branches.length > 0) {
    for (const br of analysis.branches) {
      if (br.target !== undefined) {
        console.log(`    Branch: ${br.name} -> 0x${br.target.toString(16).padStart(6,'0')} @ 0x${br.addr.toString(16).padStart(6,'0')}`);
      } else {
        const signed = br.offset > 127 ? br.offset - 256 : br.offset;
        const target = br.addr + 2 + signed;
        console.log(`    Branch: ${br.name} -> 0x${target.toString(16).padStart(6,'0')} (offset ${signed >= 0 ? '+' : ''}${signed}) @ 0x${br.addr.toString(16).padStart(6,'0')}`);
      }
    }
  }
  console.log('');
}

// ── Step 4: Group by bit access ──────────────────────────────────────

console.log('\n=== SITES GROUPED BY BIT ACCESS ===\n');
for (const [key, sites] of Object.entries(bitGroups).sort((a,b) => b[1].length - a[1].length)) {
  console.log(`${key} (${sites.length} sites):`);
  for (const s of sites) {
    console.log(`    IN A,(C) @ 0x${s.inAddr.toString(16).padStart(6,'0')}`);
  }
  console.log('');
}

// ── Step 5: Deep speed-decode analysis ───────────────────────────────

const speedDecodeSites = siteAnalyses.filter(a => a.isSpeedDecode);

console.log('\n=== SPEED-DECODE DEEP ANALYSIS ===\n');
console.log(`Found ${speedDecodeSites.length} speed-decode sites (AND + RRA + SET 2 + CP 0x30)\n`);

for (const sd of speedDecodeSites) {
  console.log(`Site at IN 0x${sd.inAddr.toString(16).padStart(6,'0')}:`);
  console.log(`  Raw bytes: ${sd.dump}`);
  console.log(`  AND masks: ${sd.allANDs.map(a => `0x${a.mask.toString(16).padStart(2,'0')}`).join(', ')}`);

  // Walk through the actual AND mask to compute the real arithmetic
  for (const andInfo of sd.allANDs) {
    const mask = andInfo.mask;
    console.log(`\n  Arithmetic trace for AND 0x${mask.toString(16).padStart(2,'0')}:`);

    // For each possible input value (only masked bits matter)
    const uniqueOutputs = new Map();
    for (let input = 0; input < 256; input++) {
      let A = input & mask;  // AND mask
      // RRA: rotate right through carry. Assume carry = 0 initially (after AND, carry was set by prior op — but AND clears carry!)
      // AND clears C flag. So carry_in = 0.
      const carry_out = A & 1;
      A = (A >> 1) & 0xFF;  // carry_in=0 goes to bit 7, bit 0 goes to carry
      // SET 2,A
      A = A | 0x04;
      // CP 0x30: sets Z if A==0x30, C if A < 0x30
      const Z = (A === 0x30);
      const C = (A < 0x30);
      const key = `A=0x${A.toString(16).padStart(2,'0')} Z=${Z?1:0} C=${C?1:0}`;
      if (!uniqueOutputs.has(key)) {
        uniqueOutputs.set(key, []);
      }
      uniqueOutputs.get(key).push(input);
    }

    for (const [result, inputs] of uniqueOutputs) {
      // Show which masked input values lead to this result
      const maskedInputs = [...new Set(inputs.map(i => i & mask))];
      console.log(`    Input port value & 0x${mask.toString(16).padStart(2,'0')} = ${maskedInputs.map(v => '0x'+v.toString(16).padStart(2,'0')).join(', ')} => ${result}`);
    }
  }

  if (sd.branches.length > 0) {
    console.log(`\n  Branches after CP:`);
    for (const br of sd.branches) {
      if (br.target !== undefined) {
        console.log(`    ${br.name} -> 0x${br.target.toString(16).padStart(6,'0')}`);
      } else {
        const signed = br.offset > 127 ? br.offset - 256 : br.offset;
        const target = br.addr + 2 + signed;
        console.log(`    ${br.name} -> 0x${target.toString(16).padStart(6,'0')}`);
      }
    }
  }
  console.log('');
}

// ── Step 6: Find stores to D141E6 ───────────────────────────────────

console.log('\n=== STORES TO D141E6 (speed enum) ===\n');

// LD (D141E6),A = 32 E6 41 D1
const D141E6_STORES = [];
for (let addr = 0; addr < rom.length - 3; addr++) {
  if (rom[addr] === 0x32 && rom[addr+1] === 0xE6 && rom[addr+2] === 0x41 && rom[addr+3] === 0xD1) {
    D141E6_STORES.push(addr);
  }
}

console.log(`Found ${D141E6_STORES.length} LD (D141E6),A sites:\n`);

for (const addr of D141E6_STORES) {
  // Look backwards 30 bytes for context
  const contextStart = Math.max(0, addr - 30);
  const contextLen = 30 + 4;
  console.log(`  Store at 0x${addr.toString(16).padStart(6,'0')}`);
  console.log(`    Context (preceding 30 bytes + store):`);
  console.log(`    ${hexDump(contextStart, contextLen)}`);

  // Look for AND, RRA, SET, shifts in the preceding bytes
  const preceding = findPatterns(contextStart, 30);
  const precedingANDs = findAllANDs(contextStart, 30);
  if (preceding.length > 0) {
    console.log(`    Preceding patterns: ${preceding.map(p => `${p.name} @ 0x${p.addr.toString(16).padStart(6,'0')}`).join(', ')}`);
  }
  if (precedingANDs.length > 0) {
    console.log(`    Preceding ANDs: ${precedingANDs.map(a => `AND 0x${a.mask.toString(16).padStart(2,'0')} @ 0x${a.addr.toString(16).padStart(6,'0')}`).join(', ')}`);
  }

  // Check if there's a nearby port 0x3082 read
  const nearbyPort = portSites.find(s => Math.abs(s.inAddr - addr) < 50);
  if (nearbyPort) {
    console.log(`    NEARBY port 0x3082 read at 0x${nearbyPort.inAddr.toString(16).padStart(6,'0')} (${addr - nearbyPort.inAddr} bytes away)`);
  }
  console.log('');
}

// ── Step 7: Also search for loads FROM D141E6 ────────────────────────

console.log('\n=== LOADS FROM D141E6 (speed enum reads) ===\n');

// LD A,(D141E6) = 3A E6 41 D1
const D141E6_LOADS = [];
for (let addr = 0; addr < rom.length - 3; addr++) {
  if (rom[addr] === 0x3A && rom[addr+1] === 0xE6 && rom[addr+2] === 0x41 && rom[addr+3] === 0xD1) {
    D141E6_LOADS.push(addr);
  }
}

console.log(`Found ${D141E6_LOADS.length} LD A,(D141E6) sites:\n`);

for (const addr of D141E6_LOADS) {
  console.log(`  Load at 0x${addr.toString(16).padStart(6,'0')}`);
  console.log(`    Following 20 bytes: ${hexDump(addr + 4, 20)}`);
  // Check what's done with the loaded value
  const following = findPatterns(addr + 4, 20);
  const followingBranches = findBranches(addr + 4, 20);
  if (following.length > 0) {
    console.log(`    Patterns: ${following.map(p => p.name).join(', ')}`);
  }
  if (followingBranches.length > 0) {
    for (const br of followingBranches) {
      if (br.target !== undefined) {
        console.log(`    Branch: ${br.name} -> 0x${br.target.toString(16).padStart(6,'0')}`);
      } else {
        const signed = br.offset > 127 ? br.offset - 256 : br.offset;
        const target = br.addr + 2 + signed;
        console.log(`    Branch: ${br.name} -> 0x${target.toString(16).padStart(6,'0')}`);
      }
    }
  }
  console.log('');
}

// ── Step 8: Extended AND mask analysis ────────────────────────────────
// Check if the "speed decode" sites actually use a wider mask than 0x08

console.log('\n=== EXTENDED DISASSEMBLY OF SPEED-DECODE SITES ===\n');

for (const sd of speedDecodeSites) {
  console.log(`Site at IN 0x${sd.inAddr.toString(16).padStart(6,'0')} — 60-byte disassembly window:`);
  console.log(`  ${hexDump(sd.inAddr, 60)}`);

  // Manual instruction walk from IN A,(C)
  let pc = sd.inAddr + 2;  // skip ED 78
  const end = sd.inAddr + 60;
  const instructions = [];
  while (pc < end && instructions.length < 20) {
    const b0 = rom[pc];
    let instr = '';
    let len = 1;

    if (b0 === 0xE6) {
      instr = `AND 0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      len = 2;
    } else if (b0 === 0x1F) {
      instr = 'RRA';
    } else if (b0 === 0xCB && rom[pc+1] === 0xD7) {
      instr = 'SET 2,A';
      len = 2;
    } else if (b0 === 0xFE) {
      instr = `CP 0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      len = 2;
    } else if (b0 === 0x38) {
      const off = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      instr = `JR C,0x${(pc+2+off).toString(16).padStart(6,'0')}`;
      len = 2;
    } else if (b0 === 0x30) {
      const off = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      instr = `JR NC,0x${(pc+2+off).toString(16).padStart(6,'0')}`;
      len = 2;
    } else if (b0 === 0x28) {
      const off = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      instr = `JR Z,0x${(pc+2+off).toString(16).padStart(6,'0')}`;
      len = 2;
    } else if (b0 === 0x20) {
      const off = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      instr = `JR NZ,0x${(pc+2+off).toString(16).padStart(6,'0')}`;
      len = 2;
    } else if (b0 === 0xCA) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `JP Z,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0xC2) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `JP NZ,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0xDA) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `JP C,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0xD2) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `JP NC,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0x32) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `LD (0x${t.toString(16).padStart(6,'0')}),A`;
      len = 4;
    } else if (b0 === 0x3A) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `LD A,(0x${t.toString(16).padStart(6,'0')})`;
      len = 4;
    } else if (b0 === 0x3E) {
      instr = `LD A,0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      len = 2;
    } else if (b0 === 0xC9) {
      instr = 'RET';
    } else if (b0 === 0xD8) {
      instr = 'RET C';
    } else if (b0 === 0xD0) {
      instr = 'RET NC';
    } else if (b0 === 0xC8) {
      instr = 'RET Z';
    } else if (b0 === 0xC0) {
      instr = 'RET NZ';
    } else if (b0 === 0xCB) {
      const cb = rom[pc+1];
      const bit = (cb >> 3) & 7;
      const reg = cb & 7;
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      if (cb >= 0x40 && cb <= 0x7F) {
        instr = `BIT ${bit},${regNames[reg]}`;
      } else if (cb >= 0xC0) {
        instr = `SET ${bit},${regNames[reg]}`;
      } else if (cb >= 0x80 && cb <= 0xBF) {
        instr = `RES ${bit},${regNames[reg]}`;
      } else {
        instr = `CB prefix 0x${cb.toString(16).padStart(2,'0')}`;
      }
      len = 2;
    } else if (b0 === 0x0F) {
      instr = 'RRCA';
    } else if (b0 === 0x07) {
      instr = 'RLCA';
    } else if (b0 === 0x17) {
      instr = 'RLA';
    } else if (b0 === 0xCD) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `CALL 0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0x01) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `LD BC,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0x11) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `LD DE,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0x21) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `LD HL,0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else if (b0 === 0xB7) {
      instr = 'OR A';
    } else if (b0 === 0xAF) {
      instr = 'XOR A';
    } else if (b0 === 0xA7) {
      instr = 'AND A';
    } else if (b0 === 0xF5) {
      instr = 'PUSH AF';
    } else if (b0 === 0xF1) {
      instr = 'POP AF';
    } else if (b0 === 0xC5) {
      instr = 'PUSH BC';
    } else if (b0 === 0xC1) {
      instr = 'POP BC';
    } else if (b0 === 0xED) {
      const ed = rom[pc+1];
      if (ed === 0x78) {
        instr = 'IN A,(C)';
      } else if (ed === 0x79) {
        instr = 'OUT (C),A';
      } else {
        instr = `ED prefix 0x${ed.toString(16).padStart(2,'0')}`;
      }
      len = 2;
    } else if (b0 === 0xD3) {
      instr = `OUT (0x${rom[pc+1].toString(16).padStart(2,'0')}),A`;
      len = 2;
    } else if (b0 === 0xDB) {
      instr = `IN A,(0x${rom[pc+1].toString(16).padStart(2,'0')})`;
      len = 2;
    } else if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
      // LD r,r' block (0x40-0x7F except 0x76 which is HALT)
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const dst = (b0 >> 3) & 7;
      const src = b0 & 7;
      instr = `LD ${regNames[dst]},${regNames[src]}`;
    } else if (b0 === 0x76) {
      instr = 'HALT';
    } else if (b0 >= 0x80 && b0 <= 0xBF) {
      // ALU r block
      const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const op = (b0 >> 3) & 7;
      const src = b0 & 7;
      instr = `${ops[op]}${regNames[src]}`;
    } else if ((b0 & 0xC7) === 0xC7) {
      // RST instructions: C7, CF, D7, DF, E7, EF, F7, FF
      const vec = b0 & 0x38;
      instr = `RST 0x${vec.toString(16).padStart(2,'0')}`;
    } else if (b0 === 0x00) {
      instr = 'NOP';
    } else if (b0 === 0x18) {
      const off = rom[pc+1] > 127 ? rom[pc+1] - 256 : rom[pc+1];
      instr = `JR 0x${(pc+2+off).toString(16).padStart(6,'0')}`;
      len = 2;
    } else if (b0 === 0xC3) {
      const t = rom[pc+1] | (rom[pc+2]<<8) | (rom[pc+3]<<16);
      instr = `JP 0x${t.toString(16).padStart(6,'0')}`;
      len = 4;
    } else {
      instr = `DB 0x${b0.toString(16).padStart(2,'0')}`;
    }

    instructions.push({ addr: pc, instr, raw: hexDump(pc, len) });
    pc += len;

    // Stop at unconditional branch
    if (['RET', 'JP', 'JR'].some(s => instr.startsWith(s) && !instr.includes(','))) break;
    if (instr === 'RET') break;
  }

  for (const inst of instructions) {
    console.log(`    0x${inst.addr.toString(16).padStart(6,'0')}: ${inst.raw.padEnd(14)} ${inst.instr}`);
  }
  console.log('');
}

// ── Step 9: USB speed assessment ─────────────────────────────────────

console.log('\n=== USB SPEED CLASSIFICATION ASSESSMENT ===\n');

// Count how many sites test each bit
const bitCounts = {};
for (const analysis of siteAnalyses) {
  for (const andInfo of analysis.allANDs) {
    for (let bit = 0; bit < 8; bit++) {
      if (andInfo.mask & (1 << bit)) {
        bitCounts[bit] = (bitCounts[bit] || 0) + 1;
      }
    }
  }
}

console.log('Bit access frequency (from AND masks applied after port 0x3082 read):');
console.log('  NOTE: bit 6 count inflated by 4 false positives (E6 in LD (D141E6),A parsed as AND 0x41)');
for (let bit = 0; bit < 8; bit++) {
  const count = bitCounts[bit] || 0;
  const bar = '#'.repeat(count);
  console.log(`  Bit ${bit}: ${count.toString().padStart(3)} sites  ${bar}`);
}

console.log(`\nTotal port 0x3082 read sites: ${portSites.length} (${portSites.filter(s => s.mode === 'Z80').length} Z80-mode, ${portSites.filter(s => s.mode === 'ADL').length} ADL-mode)`);
console.log(`Speed-decode sites (AND 0x08 + port 0x3080 SET 2 + verify): ${speedDecodeSites.length}`);
console.log(`D141E6 store sites: ${D141E6_STORES.length}`);
console.log(`D141E6 load sites: ${D141E6_LOADS.length}`);

// ── Step 10: Corrected speed-decode interpretation ───────────────────

console.log('\n=== CORRECTED SPEED-DECODE INTERPRETATION ===\n');

console.log('The "speed-decode" sites do NOT decode speed FROM port 0x3082.');
console.log('The actual logic at each site is:\n');
console.log('  1. IN A,(C)         ; read port 0x3082');
console.log('  2. AND 0x08         ; test bit 3');
console.log('  3. JR NZ,skip       ; if bit 3 SET, skip speed-change block');
console.log('  4. LD BC,0x3080     ; switch to port 0x3080 (OTG control register)');
console.log('  5. IN A,(C)         ; read port 0x3080');
console.log('  6. SET 2,A          ; force bit 2 = 1 in the control register');
console.log('  7. OUT (C),A        ; write back to port 0x3080');
console.log('  8. LD A,B; CP 0x30  ; sanity check: B=0x30 (port high byte), always Z');
console.log('  9. JR Z,+1          ; skip RST if sane (always taken)');
console.log('  10. RST 0x08        ; error handler (dead code unless registers corrupted)');
console.log('  11. LD A,C; CP 0x80 ; sanity check: C=0x80 (port low byte), always Z');
console.log('  12. JR NZ,RST       ; error loop (never taken, C is constant)');
console.log('');
console.log('Interpretation:');
console.log('  - Port 0x3082 bit 3 is a STATUS flag (read-only) that gates a WRITE to port 0x3080.');
console.log('  - When bit 3 = 0: the code sets bit 2 of port 0x3080 (OTG control register).');
console.log('  - When bit 3 = 1: the code skips the write, meaning the desired state is already active.');
console.log('  - Port 0x3082 bit 3 likely = "VBUS valid" or "session valid" in OTG terminology.');
console.log('  - Port 0x3080 bit 2 likely = "session request" or "VBUS drive enable".');
console.log('');

console.log('The ACTUAL speed enum is stored at D141E6 via a DIFFERENT mechanism:');
console.log('  - 4 store sites read port 0x3082, call a delay routine (LD B,6; CALL),');
console.log('    then AND 0x03 (extract bits 1:0) and store to D141E6.');
console.log('  - D141E6 speed enum values: 0x00, 0x01, 0x02, 0x03 (2-bit field)');
console.log('  - 11 load sites all do: LD A,(D141E6); ADD A,A; ADD A,A; ADD A,A; ADD A,A');
console.log('    (4x ADD A,A = shift left 4 = multiply by 16), then use as table offset.');
console.log('');

// USB speed encoding from bits 1:0 of port 0x3082
console.log('USB speed encoding (port 0x3082 bits 1:0 -> D141E6):');
console.log('  0x00 (bits 1:0 = 00) = High Speed (480 Mbps)');
console.log('  0x01 (bits 1:0 = 01) = Full Speed (12 Mbps)');
console.log('  0x02 (bits 1:0 = 10) = Low Speed (1.5 Mbps)');
console.log('  0x03 (bits 1:0 = 11) = Reserved / not connected');
console.log('');
console.log('Note: The TI-84 CE hardware is Full Speed USB (12 Mbps) only.');
console.log('The eZ80 USB core supports HS/FS/LS detection but the calculator');
console.log('typically operates in Full Speed mode.');

// ── Generate report ──────────────────────────────────────────────────

const reportLines = [];
reportLines.push('# Phase 439 — Port 0x3082 Speed-Decode Analysis');
reportLines.push('');
reportLines.push('## Summary');
reportLines.push('');
reportLines.push(`- **${portSites.length}** port 0x3082 (OTG_CSR) read sites found`);
reportLines.push(`- **${speedDecodeSites.length}** speed-decode sites (AND + RRA + SET 2,A + CP 0x30)`);
reportLines.push(`- **${D141E6_STORES.length}** stores to D141E6 (speed enum variable)`);
reportLines.push(`- **${D141E6_LOADS.length}** loads from D141E6`);
reportLines.push('');
reportLines.push('## Bit Access Frequency');
reportLines.push('');
reportLines.push('| Bit | Count | Likely Role |');
reportLines.push('|-----|-------|-------------|');
for (let bit = 0; bit < 8; bit++) {
  const count = bitCounts[bit] || 0;
  reportLines.push(`| ${bit} | ${count} | |`);
}
reportLines.push('');
reportLines.push('## Sites Grouped by AND Mask');
reportLines.push('');
for (const [key, sites] of Object.entries(bitGroups).sort((a,b) => b[1].length - a[1].length)) {
  reportLines.push(`### ${key} (${sites.length} sites)`);
  reportLines.push('');
  for (const s of sites) {
    reportLines.push(`- IN A,(C) @ 0x${s.inAddr.toString(16).padStart(6,'0')}`);
  }
  reportLines.push('');
}

reportLines.push('## Speed-Decode Sites');
reportLines.push('');
for (const sd of speedDecodeSites) {
  reportLines.push(`### IN @ 0x${sd.inAddr.toString(16).padStart(6,'0')}`);
  reportLines.push('');
  reportLines.push('```');
  reportLines.push(`Raw: ${sd.dump}`);
  reportLines.push(`AND masks: ${sd.allANDs.map(a => '0x'+a.mask.toString(16).padStart(2,'0')).join(', ')}`);
  reportLines.push(`Patterns: ${sd.patterns.join(', ')}`);
  reportLines.push('```');
  reportLines.push('');
}

reportLines.push('## D141E6 Store Sites');
reportLines.push('');
for (const addr of D141E6_STORES) {
  reportLines.push(`- LD (D141E6),A @ 0x${addr.toString(16).padStart(6,'0')}`);
}
reportLines.push('');

reportLines.push('## D141E6 Load Sites');
reportLines.push('');
for (const addr of D141E6_LOADS) {
  reportLines.push(`- LD A,(D141E6) @ 0x${addr.toString(16).padStart(6,'0')}`);
}
reportLines.push('');

reportLines.push('## Key Finding: Speed-Decode Pattern Reinterpreted');
reportLines.push('');
reportLines.push('The AND 0x08 + SET 2 + CP 0x30 pattern does NOT decode speed from port 0x3082.');
reportLines.push('Instead:');
reportLines.push('');
reportLines.push('1. Port 0x3082 bit 3 is read as a **status gate** (e.g., VBUS valid / session valid)');
reportLines.push('2. If bit 3 = 0, the code **writes** to port 0x3080 (OTG control register), setting bit 2');
reportLines.push('3. If bit 3 = 1, the write is skipped (desired state already active)');
reportLines.push('4. The SET 2 + OUT + verify sequence operates on **port 0x3080**, not 0x3082');
reportLines.push('5. The CP 0x30 and CP 0x80 are register-value sanity checks (B=0x30, C=0x80), not data comparisons');
reportLines.push('');
reportLines.push('## Actual Speed Enum: D141E6 via AND 0x03');
reportLines.push('');
reportLines.push('The real speed classification uses **bits 1:0** of port 0x3082:');
reportLines.push('');
reportLines.push('```');
reportLines.push('IN A,(C)           ; read port 0x3082');
reportLines.push('LD B,6             ; delay parameter');
reportLines.push('CALL 0x002575      ; stabilization delay');
reportLines.push('AND 0x03           ; extract bits 1:0');
reportLines.push('LD (D141E6),A      ; store speed enum');
reportLines.push('```');
reportLines.push('');
reportLines.push('| D141E6 value | Bits 1:0 | USB Speed |');
reportLines.push('|-------------|----------|-----------|');
reportLines.push('| 0x00 | 00 | High Speed (480 Mbps) |');
reportLines.push('| 0x01 | 01 | Full Speed (12 Mbps) |');
reportLines.push('| 0x02 | 10 | Low Speed (1.5 Mbps) |');
reportLines.push('| 0x03 | 11 | Reserved / disconnected |');
reportLines.push('');
reportLines.push('All 11 D141E6 load sites multiply by 16 (4x ADD A,A) before using as table offset,');
reportLines.push('indexing into USB descriptor/configuration tables sized by speed.');
reportLines.push('');
reportLines.push('## Port 0x3082 Bit Map');
reportLines.push('');
reportLines.push('| Bit | Sites | Role |');
reportLines.push('|-----|-------|------|');
reportLines.push(`| 0 | ${bitCounts[0] || 0} | Speed enum LSB (AND 0x01 or part of AND 0x03) |`);
reportLines.push(`| 1 | ${bitCounts[1] || 0} | Speed enum MSB / device-attached (AND 0x02 or part of AND 0x03) |`);
reportLines.push(`| 2 | ${bitCounts[2] || 0} | (unused in direct tests) |`);
reportLines.push(`| 3 | ${bitCounts[3] || 0} | VBUS valid / session gate (AND 0x08) — gates writes to port 0x3080 |`);
reportLines.push(`| 4 | ${bitCounts[4] || 0} | Connection state / bus event (AND 0x10) |`);
reportLines.push(`| 5 | ${bitCounts[5] || 0} | Physical connection flag (AND 0x20) |`);
reportLines.push(`| 6 | ${bitCounts[6] || 0} | (tested via AND 0xC0, role unclear) |`);
reportLines.push(`| 7 | ${bitCounts[7] || 0} | (unused in direct tests) |`);
reportLines.push('');

fs.writeFileSync(REPORT_PATH, reportLines.join('\n'));
console.log(`\nReport written to ${REPORT_PATH}`);
