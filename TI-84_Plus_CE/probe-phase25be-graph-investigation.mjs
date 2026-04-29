#!/usr/bin/env node
/**
 * Phase 25BE — Graph Subsystem Investigation (Static Analysis)
 *
 * Reads ROM.rom + phase25h-a-jump-table.json to catalog all graph-related
 * JT entries, hex-dump the first 32 bytes of priority routines, and produce
 * basic eZ80 opcode annotations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load ROM ────────────────────────────────────────────────────────────
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Load Jump Table ─────────────────────────────────────────────────────
const jt = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'phase25h-a-jump-table.json'), 'utf8')
);

// ── Graph-related filter keywords ───────────────────────────────────────
const GRAPH_KEYWORDS = [
  'Graph', 'Plot', 'Pixel', 'Line', 'Draw', 'Point',
  'Window', 'Zoom', 'Trace', 'Func', 'YVar', 'Curve', 'Shade',
];

const graphEntries = jt.filter(e =>
  e.name && GRAPH_KEYWORDS.some(kw => e.name.includes(kw))
);

console.log(`\n=== Graph-Related Jump Table Entries (${graphEntries.length}) ===\n`);
console.log('Slot | Slot Addr  | Impl Addr  | Name');
console.log('-----|------------|------------|-----');
for (const e of graphEntries) {
  const slot = String(e.slot).padStart(4);
  console.log(`${slot} | ${e.slotAddr} | ${e.target} | ${e.name}`);
}

// ── Key codes from ti84pceg.inc ─────────────────────────────────────────
console.log('\n=== Graph Key Info ===\n');
console.log('Physical key:  GRAPH — keyMatrix[6] bit 0, scan code 0x60');
console.log('k* code:       kGraph = 0x44 (from scancode table no_mod column)');
console.log('Context ID:    cxGraph = kGraph = 0x44 (from ti84pceg.inc: cxGraph := kGraph)');
console.log('cxCurApp addr: 0xD007E0');
console.log('cxMain addr:   0xD007CA');
console.log('plotSScreen:   0xD09466 (21945 bytes graph back-buffer)');

// ── Graph flags from ti84pceg.inc ───────────────────────────────────────
console.log('\n=== Graph Flags (IY offsets) ===\n');
console.log('graphFlags    = IY+3h    graphDraw = bit 0 (0=valid, 1=dirty)');
console.log('grfDBFlags    = IY+4h');
console.log('plotFlags     = IY+2h');
console.log('graphFlags2   = IY+1Fh');
console.log('plotFlag3     = IY+3Ch');

// ── Priority routines to disassemble ────────────────────────────────────
const PRIORITY_NAMES = [
  'IPoint',        // pixel-level point draw
  'ILine',         // pixel-level line draw
  'ClrGraphRef',   // clear graph reference
  'DrawCmd',       // Draw command dispatcher
  'GraphPars',     // graph parameter parser
];

// Simple eZ80 opcode decoder (first instruction only, enough for static analysis)
function decodeEz80(buf, offset, maxBytes) {
  const instructions = [];
  let pos = 0;

  while (pos < maxBytes && instructions.length < 8) {
    const b = buf[offset + pos];
    if (b === undefined) break;

    const addr = offset + pos;
    let inst = '';
    let len = 1;

    switch (b) {
      case 0xC3: { // JP nn (3-byte address in ADL mode)
        if (pos + 3 < maxBytes) {
          const lo = buf[offset + pos + 1];
          const mi = buf[offset + pos + 2];
          const hi = buf[offset + pos + 3];
          const target = lo | (mi << 8) | (hi << 16);
          inst = `JP 0x${target.toString(16).toUpperCase().padStart(6, '0')}`;
          len = 4;
        } else {
          inst = 'JP ???';
        }
        break;
      }
      case 0xCD: { // CALL nn
        if (pos + 3 < maxBytes) {
          const lo = buf[offset + pos + 1];
          const mi = buf[offset + pos + 2];
          const hi = buf[offset + pos + 3];
          const target = lo | (mi << 8) | (hi << 16);
          inst = `CALL 0x${target.toString(16).toUpperCase().padStart(6, '0')}`;
          len = 4;
        } else {
          inst = 'CALL ???';
        }
        break;
      }
      case 0xC9:
        inst = 'RET';
        break;
      case 0x21: { // LD HL,nn
        if (pos + 3 < maxBytes) {
          const lo = buf[offset + pos + 1];
          const mi = buf[offset + pos + 2];
          const hi = buf[offset + pos + 3];
          const val = lo | (mi << 8) | (hi << 16);
          inst = `LD HL,0x${val.toString(16).toUpperCase().padStart(6, '0')}`;
          len = 4;
        }
        break;
      }
      case 0x11: { // LD DE,nn
        if (pos + 3 < maxBytes) {
          const lo = buf[offset + pos + 1];
          const mi = buf[offset + pos + 2];
          const hi = buf[offset + pos + 3];
          const val = lo | (mi << 8) | (hi << 16);
          inst = `LD DE,0x${val.toString(16).toUpperCase().padStart(6, '0')}`;
          len = 4;
        }
        break;
      }
      case 0x01: { // LD BC,nn
        if (pos + 3 < maxBytes) {
          const lo = buf[offset + pos + 1];
          const mi = buf[offset + pos + 2];
          const hi = buf[offset + pos + 3];
          const val = lo | (mi << 8) | (hi << 16);
          inst = `LD BC,0x${val.toString(16).toUpperCase().padStart(6, '0')}`;
          len = 4;
        }
        break;
      }
      case 0x3E: { // LD A,n
        if (pos + 1 < maxBytes) {
          const val = buf[offset + pos + 1];
          inst = `LD A,0x${val.toString(16).toUpperCase().padStart(2, '0')}`;
          len = 2;
        }
        break;
      }
      case 0xED: { // extended prefix
        if (pos + 1 < maxBytes) {
          const b2 = buf[offset + pos + 1];
          if (b2 === 0x5B && pos + 4 < maxBytes) {
            const lo = buf[offset + pos + 2];
            const mi = buf[offset + pos + 3];
            const hi = buf[offset + pos + 4];
            const val = lo | (mi << 8) | (hi << 16);
            inst = `LD DE,(0x${val.toString(16).toUpperCase().padStart(6, '0')})`;
            len = 5;
          } else if (b2 === 0x4B && pos + 4 < maxBytes) {
            const lo = buf[offset + pos + 2];
            const mi = buf[offset + pos + 3];
            const hi = buf[offset + pos + 4];
            const val = lo | (mi << 8) | (hi << 16);
            inst = `LD BC,(0x${val.toString(16).toUpperCase().padStart(6, '0')})`;
            len = 5;
          } else if (b2 === 0x7B && pos + 4 < maxBytes) {
            const lo = buf[offset + pos + 2];
            const mi = buf[offset + pos + 3];
            const hi = buf[offset + pos + 4];
            const val = lo | (mi << 8) | (hi << 16);
            inst = `LD SP,(0x${val.toString(16).toUpperCase().padStart(6, '0')})`;
            len = 5;
          } else if (b2 === 0x6B && pos + 4 < maxBytes) {
            const lo = buf[offset + pos + 2];
            const mi = buf[offset + pos + 3];
            const hi = buf[offset + pos + 4];
            const val = lo | (mi << 8) | (hi << 16);
            inst = `LD HL,(0x${val.toString(16).toUpperCase().padStart(6, '0')})`;
            len = 5;
          } else {
            inst = `ED ${b2.toString(16).toUpperCase().padStart(2, '0')}`;
            len = 2;
          }
        }
        break;
      }
      case 0xE5: inst = 'PUSH HL'; break;
      case 0xD5: inst = 'PUSH DE'; break;
      case 0xC5: inst = 'PUSH BC'; break;
      case 0xF5: inst = 'PUSH AF'; break;
      case 0xE1: inst = 'POP HL'; break;
      case 0xD1: inst = 'POP DE'; break;
      case 0xC1: inst = 'POP BC'; break;
      case 0xF1: inst = 'POP AF'; break;
      case 0xAF: inst = 'XOR A'; break;
      case 0xA7: inst = 'AND A'; break;
      case 0xB7: inst = 'OR A'; break;
      case 0xFE: {
        if (pos + 1 < maxBytes) {
          inst = `CP 0x${buf[offset + pos + 1].toString(16).toUpperCase().padStart(2, '0')}`;
          len = 2;
        }
        break;
      }
      case 0x18: { // JR e
        if (pos + 1 < maxBytes) {
          const off = buf[offset + pos + 1];
          const rel = off > 127 ? off - 256 : off;
          const target = addr + 2 + rel;
          inst = `JR 0x${target.toString(16).toUpperCase().padStart(6, '0')} (${rel >= 0 ? '+' : ''}${rel})`;
          len = 2;
        }
        break;
      }
      case 0x20: { // JR NZ,e
        if (pos + 1 < maxBytes) {
          const off = buf[offset + pos + 1];
          const rel = off > 127 ? off - 256 : off;
          const target = addr + 2 + rel;
          inst = `JR NZ,0x${target.toString(16).toUpperCase().padStart(6, '0')} (${rel >= 0 ? '+' : ''}${rel})`;
          len = 2;
        }
        break;
      }
      case 0x28: { // JR Z,e
        if (pos + 1 < maxBytes) {
          const off = buf[offset + pos + 1];
          const rel = off > 127 ? off - 256 : off;
          const target = addr + 2 + rel;
          inst = `JR Z,0x${target.toString(16).toUpperCase().padStart(6, '0')} (${rel >= 0 ? '+' : ''}${rel})`;
          len = 2;
        }
        break;
      }
      case 0xCB: { // bit ops prefix
        if (pos + 1 < maxBytes) {
          const b2 = buf[offset + pos + 1];
          const bit = (b2 >> 3) & 7;
          const reg = b2 & 7;
          const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
          if (b2 >= 0x40 && b2 < 0x80) {
            inst = `BIT ${bit},${regNames[reg]}`;
          } else if (b2 >= 0x80 && b2 < 0xC0) {
            inst = `RES ${bit},${regNames[reg]}`;
          } else if (b2 >= 0xC0) {
            inst = `SET ${bit},${regNames[reg]}`;
          } else {
            inst = `CB ${b2.toString(16).toUpperCase().padStart(2, '0')}`;
          }
          len = 2;
        }
        break;
      }
      default: {
        // Common single-byte instructions
        if (b >= 0x40 && b <= 0x7F && b !== 0x76) {
          const src = b & 7;
          const dst = (b >> 3) & 7;
          const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
          inst = `LD ${regNames[dst]},${regNames[src]}`;
        } else {
          inst = `db 0x${b.toString(16).toUpperCase().padStart(2, '0')}`;
        }
      }
    }

    instructions.push({
      addr: `0x${addr.toString(16).toUpperCase().padStart(6, '0')}`,
      hex: Array.from(buf.slice(offset + pos, offset + pos + len))
        .map(x => x.toString(16).toUpperCase().padStart(2, '0'))
        .join(' '),
      inst,
    });

    pos += len;
    // Stop after RET or JP (unconditional control transfer)
    if (b === 0xC9 || b === 0xC3) break;
  }

  return instructions;
}

// ── Hex dump utility ────────────────────────────────────────────────────
function hexDump(buf, offset, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const addr = offset + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      bytes.push(buf[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(
      `  ${addr.toString(16).toUpperCase().padStart(6, '0')}: ${bytes.join(' ')}`
    );
  }
  return lines.join('\n');
}

// ── Disassemble priority routines ───────────────────────────────────────
console.log('\n=== Priority Routine Disassembly (first 32 bytes) ===\n');

const priorityResults = [];

for (const name of PRIORITY_NAMES) {
  const entry = graphEntries.find(e => e.name === name);
  if (!entry) {
    console.log(`[SKIP] ${name} — not found in graph entries`);
    continue;
  }

  const addr = entry.targetNum;
  console.log(`--- ${name} (JT slot ${entry.slot}, impl @ ${entry.target}) ---`);
  console.log(hexDump(rom, addr, 32));
  console.log('');

  const instructions = decodeEz80(rom, addr, 32);
  for (const inst of instructions) {
    console.log(`  ${inst.addr}: ${inst.hex.padEnd(15)} ${inst.inst}`);
  }
  console.log('');

  // Resolve CALL targets to JT names
  const calls = instructions
    .filter(i => i.inst.startsWith('CALL'))
    .map(i => {
      const match = i.inst.match(/CALL 0x([0-9A-F]+)/);
      if (!match) return null;
      const target = parseInt(match[1], 16);
      const jtEntry = jt.find(e => e.targetNum === target);
      return { addr: i.addr, target: `0x${match[1]}`, name: jtEntry?.name || '(unknown)' };
    })
    .filter(Boolean);

  if (calls.length > 0) {
    console.log('  Call targets:');
    for (const c of calls) {
      console.log(`    ${c.addr}: CALL ${c.target} → ${c.name}`);
    }
    console.log('');
  }

  priorityResults.push({ name, entry, instructions, calls });
}

// ── Search for graph context table ──────────────────────────────────────
console.log('\n=== Searching for Graph Context Table ===\n');
console.log('Home screen context table is at 0x0585D3 (cxCurApp = 0x40)');
console.log('Graph mode cxCurApp = cxGraph = kGraph = 0x44');
console.log('');

// The context table format for TI-OS is a sequence of 3-byte pointers.
// cxCurApp 0x44 means the graph app. Search ROM for patterns where
// 0x44 appears at the expected cxCurApp offset in a context table.
// Context table structure: 7 x 3-byte pointers (21 bytes) + 1 byte cxCurApp
// Actually: cxMain(3) + cxPPutaway(3) + cxPutaway(3) + cxRedisp(3) +
//           cxErrorEP(3) + cxSizeWind(3) + cxPage(3) = 21 bytes

// Read the home context table for reference
const HOME_CTX = 0x0585D3;
console.log('Home context table (0x0585D3):');
console.log(hexDump(rom, HOME_CTX, 24));

// The cxCurApp byte follows the 21-byte table — look at offset 21
const homeCxCurApp = rom[HOME_CTX + 21];
console.log(`  Byte at offset 21 (cxCurApp?): 0x${homeCxCurApp.toString(16).toUpperCase().padStart(2, '0')}`);

// Search ROM for the byte 0x44 at similar table boundaries
// Strategy: look for sequences near known graph JT addresses where 0x44 appears
// The graph app table should be near other OS context tables

// Scan a range around the home screen table
console.log('\nSearching ROM for context tables with cxCurApp = 0x44...');

const CTX_TABLE_SIZE = 22; // 7 x 3-byte ptrs + 1-byte cxCurApp
const candidates = [];

// Search in ROM code area (0x000000 to 0x0C0000)
for (let addr = 0x050000; addr < 0x0C0000; addr++) {
  // Look for byte 0x44 that could be a cxCurApp
  if (rom[addr] !== 0x44) continue;

  // Check if the 21 bytes before this look like valid code pointers
  // Each 3-byte pointer should be in ROM range (0x000000-0x3FFFFF) or
  // low enough to be valid OS addresses
  const tableStart = addr - 21;
  if (tableStart < 0) continue;

  let validPtrs = 0;
  for (let i = 0; i < 7; i++) {
    const off = tableStart + i * 3;
    const ptr = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
    // Valid if in ROM range and not all zeros and not all FF
    if (ptr >= 0x010000 && ptr <= 0x0FFFFF) {
      validPtrs++;
    }
  }

  if (validPtrs >= 5) {
    // Read all 7 pointers
    const ptrs = [];
    for (let i = 0; i < 7; i++) {
      const off = tableStart + i * 3;
      const ptr = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
      ptrs.push(ptr);
    }
    candidates.push({ tableAddr: tableStart, cxCurAppAddr: addr, ptrs });
  }
}

console.log(`Found ${candidates.length} candidate context tables with cxCurApp=0x44\n`);

// Show top candidates (limit to first 10)
for (const c of candidates.slice(0, 10)) {
  const addrStr = `0x${c.tableAddr.toString(16).toUpperCase().padStart(6, '0')}`;
  console.log(`  Table @ ${addrStr}:`);
  for (let i = 0; i < 7; i++) {
    const names = ['cxMain', 'cxPPutaway', 'cxPutaway', 'cxRedisp', 'cxErrorEP', 'cxSizeWind', 'cxPage'];
    const ptrStr = `0x${c.ptrs[i].toString(16).toUpperCase().padStart(6, '0')}`;
    // Try to resolve to JT name
    const jtEntry = jt.find(e => e.targetNum === c.ptrs[i]);
    const label = jtEntry ? ` (${jtEntry.name})` : '';
    console.log(`    ${names[i].padEnd(12)} = ${ptrStr}${label}`);
  }
  console.log(hexDump(rom, c.tableAddr, CTX_TABLE_SIZE));
  console.log('');
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log('\n=== Summary ===\n');
console.log(`Total graph-related JT entries: ${graphEntries.length}`);
console.log('');
console.log('Key equates from ti84pceg.inc:');
console.log('  kGraph       = 0x44');
console.log('  cxGraph      = 0x44 (= kGraph)');
console.log('  cxCurApp     = 0xD007E0');
console.log('  cxMain       = 0xD007CA');
console.log('  plotSScreen  = 0xD09466 (21945 bytes)');
console.log('  graphFlags   = IY+3h (bit 0 = graphDraw, 0=valid/1=dirty)');
console.log('  grfDBFlags   = IY+4h');
console.log('');
console.log('Graph key path:');
console.log('  Physical: keyMatrix[6] bit 0, scan code 0x60');
console.log('  Translated: kGraph = 0x44 (no modifier)');
console.log('  Context: cxGraph = 0x44 → NewContext(0x44) switches to graph app');
console.log('');
console.log('Priority primitives for Y=X rendering:');
console.log('  1. IPoint (0x07B451) — plot single pixel in graph coordinates');
console.log('  2. ILine  (0x07B245) — draw line in graph coordinates');
console.log('  3. GraphPars (0x09986C) — parse graph parameters (window vars)');
console.log('  4. DrawCmd (0x05DD96) — draw command dispatcher');
console.log('  5. ClrGraphRef (0x083268) — clear graph reference/buffer');
console.log('');
console.log('Recommended next steps:');
console.log('  1. Deep-disassemble IPoint and ILine (128+ bytes) to understand');
console.log('     coordinate transform (math coords → pixel coords)');
console.log('  2. Find ForceFullScreen / DispGraph in JT (may not be named)');
console.log('  3. Trace NewContext(0x44) to find graph app handler table');
console.log('  4. Identify graph window variables (Xmin, Xmax, Ymin, Ymax)');
console.log('     in RAM — likely near plotSScreen or in appVar area');
console.log('  5. Build a graph-render probe: seed Y1= equation, set window');
console.log('     vars, call graph render entry point');

console.log('\nDone.');
