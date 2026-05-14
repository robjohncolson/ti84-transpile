#!/usr/bin/env node
/**
 * probe-phase315-frame-indcall.mjs
 *
 * Deep analysis of the 32 frame-based _indcall dispatch sites.
 * These are C function pointer calls where IY is loaded from an
 * IX-relative stack frame offset, rather than a fixed RAM slot.
 *
 * For each frame-based site:
 *   - Shows 20 preceding bytes as hex
 *   - Identifies IX offset patterns
 *   - Finds containing function (backward search for PUSH IX prologue)
 *   - Groups by containing function and ROM region
 *
 * Usage:  node TI-84_Plus_CE/probe-phase315-frame-indcall.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// 1. Find all CALL/JP sites to _indcall entry points
// ---------------------------------------------------------------------------

function findPatternSites(opcode, target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const sites = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === opcode && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      sites.push(i);
    }
  }
  return sites;
}

// CALL 0x00015C
const callIndcall = findPatternSites(0xCD, 0x00015C);
// JP 0x002288
const jpTrampoline = findPatternSites(0xC3, 0x002288);
// CALL 0x002288
const callTrampoline = findPatternSites(0xCD, 0x002288);

const allSites = [
  ...callIndcall.map(pc => ({ pc, type: 'CALL 0x00015C' })),
  ...jpTrampoline.map(pc => ({ pc, type: 'JP 0x002288' })),
  ...callTrampoline.map(pc => ({ pc, type: 'CALL 0x002288' })),
];

allSites.sort((a, b) => a.pc - b.pc);

console.log('=== All _indcall dispatch sites ===');
console.log(`CALL 0x00015C: ${callIndcall.length} site(s)`);
console.log(`JP 0x002288:   ${jpTrampoline.length} site(s)`);
console.log(`CALL 0x002288: ${callTrampoline.length} site(s)`);
console.log(`Total: ${allSites.length} site(s)`);
console.log('');

// ---------------------------------------------------------------------------
// 2. Classify each site as slot-based or frame-based
// ---------------------------------------------------------------------------

function classifySite(callPC) {
  // Look backward up to 30 bytes for LD IY,(addr) = FD 2A xx xx xx
  for (let j = callPC - 1; j >= Math.max(0, callPC - 30); j--) {
    if (rom[j] === 0xFD && j + 4 < rom.length && rom[j + 1] === 0x2A) {
      const addr = rom[j + 2] | (rom[j + 3] << 8) | (rom[j + 4] << 16);
      if (addr >= 0xD00000) {
        return { kind: 'slot', slotAddr: addr, ldPC: j };
      }
    }
  }
  return { kind: 'frame' };
}

function hexBytes(start, len) {
  const bytes = [];
  const s = Math.max(0, start);
  const e = Math.min(rom.length, start + len);
  for (let i = s; i < e; i++) {
    bytes.push(rom[i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

const slotSites = [];
const frameSites = [];

for (const site of allSites) {
  const cls = classifySite(site.pc);
  if (cls.kind === 'slot') {
    slotSites.push({ ...site, ...cls });
  } else {
    frameSites.push({ ...site, ...cls });
  }
}

console.log(`Slot-based: ${slotSites.length}`);
console.log(`Frame-based: ${frameSites.length}`);
console.log('');

// ---------------------------------------------------------------------------
// 3. Analyze preceding bytes for each frame-based site
// ---------------------------------------------------------------------------

function findIXOffsets(callPC) {
  // Search preceding 20 bytes for IX-related patterns
  const offsets = [];
  const start = Math.max(0, callPC - 20);

  for (let j = start; j < callPC; j++) {
    // DD prefix (IX operations)
    if (rom[j] === 0xDD) {
      // DD 7E dd = LD A,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x7E) {
        offsets.push({ type: 'LD A,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 6E dd = LD L,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x6E) {
        offsets.push({ type: 'LD L,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 66 dd = LD H,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x66) {
        offsets.push({ type: 'LD H,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 46 dd = LD B,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x46) {
        offsets.push({ type: 'LD B,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 4E dd = LD C,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x4E) {
        offsets.push({ type: 'LD C,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 56 dd = LD D,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x56) {
        offsets.push({ type: 'LD D,(IX+d)', offset: rom[j + 2], pc: j });
      }
      // DD 5E dd = LD E,(IX+d)
      if (j + 2 < callPC && rom[j + 1] === 0x5E) {
        offsets.push({ type: 'LD E,(IX+d)', offset: rom[j + 2], pc: j });
      }
    }

    // FD prefix (IY operations)
    if (rom[j] === 0xFD) {
      // FD 37 = LD IY,(IX+d) -- ZDS II extension (undocumented on classic Z80)
      // Actually in eZ80: FD 37 might be a different encoding
      // FD 31 dd = LD IY,(IX+d) in some eZ80 docs
      if (j + 1 < callPC && rom[j + 1] === 0x37) {
        offsets.push({ type: 'FD 37 (IY from IX-frame)', offset: j + 2 < callPC ? rom[j + 2] : null, pc: j });
      }
      // FD 2A xx xx xx = LD IY,(addr) -- already caught in classify, but note non-RAM ones
      if (j + 4 < rom.length && rom[j + 1] === 0x2A) {
        const addr = rom[j + 2] | (rom[j + 3] << 8) | (rom[j + 4] << 16);
        if (addr < 0xD00000) {
          offsets.push({ type: `LD IY,(0x${addr.toString(16).padStart(6, '0')})`, offset: null, pc: j });
        }
      }
    }
  }

  return offsets;
}

function findContainingFunction(callPC) {
  // Search backward up to 500 bytes for function prologue patterns
  const limit = Math.max(0, callPC - 500);

  for (let j = callPC - 1; j >= limit; j--) {
    // DD E5 = PUSH IX (standard eZ80 ADL prologue)
    if (rom[j] === 0xDD && rom[j + 1] === 0xE5) {
      return { addr: j, pattern: 'PUSH IX (DD E5)' };
    }
    // 40 DD E5 = SIS PUSH IX (short mode prefix)
    if (j >= 1 && rom[j - 1] === 0x40 && rom[j] === 0xDD && rom[j + 1] === 0xE5) {
      return { addr: j - 1, pattern: 'SIS PUSH IX (40 DD E5)' };
    }
    // C9 = RET -- if we hit a RET, the function likely starts right after
    // Only use this if we're close (within 30 bytes of the RET)
    if (rom[j] === 0xC9 && j + 1 < callPC) {
      // Function starts at j+1
      return { addr: j + 1, pattern: `after RET at 0x${j.toString(16).padStart(6, '0')}` };
    }
    // ED 45 = RETN, ED 4D = RETI
    if (rom[j] === 0xED && (rom[j + 1] === 0x45 || rom[j + 1] === 0x4D) && j + 2 < callPC) {
      return { addr: j + 2, pattern: `after RETN/RETI at 0x${j.toString(16).padStart(6, '0')}` };
    }
  }
  return null;
}

console.log('=== Frame-Based Dispatch Sites (detailed) ===');
console.log('');

const functionMap = new Map(); // funcStart -> [sites]

for (const site of frameSites) {
  const precStart = site.pc - 20;
  const precHex = hexBytes(precStart, 20);
  const ixOffsets = findIXOffsets(site.pc);
  const funcResult = findContainingFunction(site.pc);

  site.precHex = precHex;
  site.ixOffsets = ixOffsets;
  site.funcStart = funcResult ? funcResult.addr : null;
  site.funcPattern = funcResult ? funcResult.pattern : null;

  const funcStr = funcResult
    ? `0x${funcResult.addr.toString(16).padStart(6, '0')} [${funcResult.pattern}]`
    : 'unknown';

  console.log(`  Site 0x${site.pc.toString(16).padStart(6, '0')}  [${site.type}]`);
  console.log(`    Func: ${funcStr}  (distance: ${funcResult ? site.pc - funcResult.addr : '?'})`);
  console.log(`    Preceding 20 bytes: ${precHex}`);

  if (ixOffsets.length > 0) {
    for (const ix of ixOffsets) {
      const offStr = ix.offset !== null ? `+0x${ix.offset.toString(16).padStart(2, '0')}` : '';
      console.log(`    IX pattern at 0x${ix.pc.toString(16).padStart(6, '0')}: ${ix.type} ${offStr}`);
    }
  } else {
    console.log('    No IX-relative patterns detected in preceding 20 bytes');
  }
  console.log('');

  // Group by function
  const key = site.funcStart !== null ? site.funcStart : -1;
  if (!functionMap.has(key)) functionMap.set(key, []);
  functionMap.get(key).push(site);
}

// ---------------------------------------------------------------------------
// 4. Group by containing function
// ---------------------------------------------------------------------------

console.log('=== Frame-Based Sites Grouped by Containing Function ===');
console.log('');

const sortedFuncs = [...functionMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [funcStart, sites] of sortedFuncs) {
  const funcStr = funcStart >= 0
    ? `0x${funcStart.toString(16).padStart(6, '0')}`
    : 'unknown (no PUSH IX within 200 bytes)';

  console.log(`Function at ${funcStr}  (${sites.length} dispatch site(s)):`);
  for (const s of sites) {
    const ixSummary = s.ixOffsets.length > 0
      ? s.ixOffsets.map(ix => {
          const offStr = ix.offset !== null ? `+0x${ix.offset.toString(16).padStart(2, '0')}` : '';
          return `${ix.type}${offStr}`;
        }).join(', ')
      : 'no IX pattern';
    console.log(`    0x${s.pc.toString(16).padStart(6, '0')}  ${s.type}  [${ixSummary}]`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 5. ROM region clustering
// ---------------------------------------------------------------------------

console.log('=== ROM Region Clustering ===');
console.log('');

// Define ROM regions (4KB granularity)
const regionSize = 0x1000; // 4KB regions
const regionMap = new Map();

for (const site of frameSites) {
  const region = Math.floor(site.pc / regionSize) * regionSize;
  if (!regionMap.has(region)) regionMap.set(region, []);
  regionMap.get(region).push(site);
}

const sortedRegions = [...regionMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [region, sites] of sortedRegions) {
  const endAddr = region + regionSize - 1;
  console.log(`Region 0x${region.toString(16).padStart(6, '0')}-0x${endAddr.toString(16).padStart(6, '0')} (${sites.length} site(s)):`);
  for (const s of sites) {
    const funcStr = s.funcStart !== null
      ? `func=0x${s.funcStart.toString(16).padStart(6, '0')}`
      : 'func=?';
    console.log(`    0x${s.pc.toString(16).padStart(6, '0')}  ${s.type}  ${funcStr}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 6. Broader cluster summary (64KB super-regions)
// ---------------------------------------------------------------------------

console.log('=== 64KB Super-Region Summary ===');
console.log('');

const superSize = 0x10000;
const superMap = new Map();

for (const site of frameSites) {
  const region = Math.floor(site.pc / superSize) * superSize;
  if (!superMap.has(region)) superMap.set(region, []);
  superMap.get(region).push(site);
}

const sortedSuper = [...superMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [region, sites] of sortedSuper) {
  const endAddr = region + superSize - 1;
  const uniqueFuncs = new Set(sites.map(s => s.funcStart).filter(f => f !== null));
  console.log(`0x${region.toString(16).padStart(6, '0')}-0x${endAddr.toString(16).padStart(6, '0')}: ${sites.length} site(s) in ${uniqueFuncs.size} function(s)`);
}
console.log('');

// ---------------------------------------------------------------------------
// 7. Summary statistics
// ---------------------------------------------------------------------------

console.log('=== Summary ===');
console.log(`Total dispatch sites scanned: ${allSites.length}`);
console.log(`  Slot-based: ${slotSites.length}`);
console.log(`  Frame-based: ${frameSites.length}`);
console.log('');

const withFunc = frameSites.filter(s => s.funcStart !== null).length;
const withoutFunc = frameSites.filter(s => s.funcStart === null).length;
console.log(`Frame-based with identified function: ${withFunc}`);
console.log(`Frame-based without function prologue: ${withoutFunc}`);
console.log('');

const multiFuncs = sortedFuncs.filter(([, sites]) => sites.length > 1);
console.log(`Functions with multiple dispatch sites: ${multiFuncs.length}`);
for (const [funcStart, sites] of multiFuncs) {
  const funcStr = funcStart >= 0
    ? `0x${funcStart.toString(16).padStart(6, '0')}`
    : 'unknown';
  console.log(`  ${funcStr}: ${sites.length} sites`);
}
console.log('');

// Unique IX offsets seen
const allOffsets = new Set();
for (const site of frameSites) {
  for (const ix of site.ixOffsets) {
    if (ix.offset !== null) allOffsets.add(ix.offset);
  }
}
console.log(`Unique IX offsets seen: ${allOffsets.size}`);
if (allOffsets.size > 0) {
  const sorted = [...allOffsets].sort((a, b) => a - b);
  console.log(`  Offsets: ${sorted.map(o => `+0x${o.toString(16).padStart(2, '0')}`).join(', ')}`);
}
console.log('');

console.log('Done.');
