#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const FUNCTION_FOCUS = 0x08474B;
const FUNCTION_START_HINT = 0x0846D0;
const FUNCTION_CONTEXT_END = 0x084760;
const EXIT_WINDOW_START = 0x084740;
const EXIT_WINDOW_END = 0x0847B0;
const HELPER_START = 0x04C885;
const HELPER_END = 0x04C895;

const FUNCTION_ENTRY = 0x0846EA;
const INTERNAL_TAIL = 0x08473E;

const XREF_OPS = new Map([
  [0xC2, { kind: 'jp', text: 'JP NZ' }],
  [0xC3, { kind: 'jp', text: 'JP' }],
  [0xC4, { kind: 'call', text: 'CALL NZ' }],
  [0xCA, { kind: 'jp', text: 'JP Z' }],
  [0xCC, { kind: 'call', text: 'CALL Z' }],
  [0xCD, { kind: 'call', text: 'CALL' }],
  [0xD2, { kind: 'jp', text: 'JP NC' }],
  [0xD4, { kind: 'call', text: 'CALL NC' }],
  [0xDA, { kind: 'jp', text: 'JP C' }],
  [0xDC, { kind: 'call', text: 'CALL C' }],
  [0xE2, { kind: 'jp', text: 'JP PO' }],
  [0xE4, { kind: 'call', text: 'CALL PO' }],
  [0xEA, { kind: 'jp', text: 'JP PE' }],
  [0xEC, { kind: 'call', text: 'CALL PE' }],
  [0xF2, { kind: 'jp', text: 'JP P' }],
  [0xF4, { kind: 'call', text: 'CALL P' }],
  [0xFA, { kind: 'jp', text: 'JP M' }],
  [0xFC, { kind: 'call', text: 'CALL M' }],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return (value & 0x80) ? value - 0x100 : value;
}

function read24(rom, addr) {
  return (
    (rom[addr] ?? 0)
    | ((rom[addr + 1] ?? 0) << 8)
    | ((rom[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function formatBytes(rom, addr, size) {
  return Array.from(rom.slice(addr, addr + size), hexByte).join(' ');
}

function makeRow(rom, addr, size, text, extra = {}) {
  return {
    addr,
    size,
    next: addr + size,
    bytes: formatBytes(rom, addr, size),
    text,
    ...extra,
  };
}

function decodeAdl(rom, addr) {
  const op = rom[addr];
  switch (op) {
    case 0x00:
      return makeRow(rom, addr, 1, 'NOP');
    case 0x01:
      return makeRow(rom, addr, 4, `LD BC, ${hex(read24(rom, addr + 1))}`);
    case 0x0B:
      return makeRow(rom, addr, 1, 'DEC BC');
    case 0x10: {
      const target = (addr + 2 + signed8(rom[addr + 1])) >>> 0;
      return makeRow(rom, addr, 2, `DJNZ ${hex(target)}`, { target });
    }
    case 0x11:
      return makeRow(rom, addr, 4, `LD DE, ${hex(read24(rom, addr + 1))}`);
    case 0x13:
      return makeRow(rom, addr, 1, 'INC DE');
    case 0x18: {
      const target = (addr + 2 + signed8(rom[addr + 1])) >>> 0;
      return makeRow(rom, addr, 2, `JR ${hex(target)}`, { target });
    }
    case 0x19:
      return makeRow(rom, addr, 1, 'ADD HL, DE');
    case 0x20: {
      const target = (addr + 2 + signed8(rom[addr + 1])) >>> 0;
      return makeRow(rom, addr, 2, `JR NZ, ${hex(target)}`, { target });
    }
    case 0x21:
      return makeRow(rom, addr, 4, `LD HL, ${hex(read24(rom, addr + 1))}`);
    case 0x23:
      return makeRow(rom, addr, 1, 'INC HL');
    case 0x25:
      return makeRow(rom, addr, 1, 'DEC H');
    case 0x28: {
      const target = (addr + 2 + signed8(rom[addr + 1])) >>> 0;
      return makeRow(rom, addr, 2, `JR Z, ${hex(target)}`, { target });
    }
    case 0x2B:
      return makeRow(rom, addr, 1, 'DEC HL');
    case 0x30: {
      const target = (addr + 2 + signed8(rom[addr + 1])) >>> 0;
      return makeRow(rom, addr, 2, `JR NC, ${hex(target)}`, { target });
    }
    case 0x32:
      return makeRow(rom, addr, 4, `LD (${hex(read24(rom, addr + 1))}), A`);
    case 0x36:
      return makeRow(rom, addr, 2, `LD (HL), ${hex(rom[addr + 1], 2)}`);
    case 0x3A:
      return makeRow(rom, addr, 4, `LD A, (${hex(read24(rom, addr + 1))})`);
    case 0x46:
      return makeRow(rom, addr, 1, 'LD B, (HL)');
    case 0x47:
      return makeRow(rom, addr, 1, 'LD B, A');
    case 0x4E:
      return makeRow(rom, addr, 1, 'LD C, (HL)');
    case 0x4F:
      return makeRow(rom, addr, 1, 'LD C, A');
    case 0x56:
      return makeRow(rom, addr, 1, 'LD D, (HL)');
    case 0x5E:
      return makeRow(rom, addr, 1, 'LD E, (HL)');
    case 0x78:
      return makeRow(rom, addr, 1, 'LD A, B');
    case 0x7A:
      return makeRow(rom, addr, 1, 'LD A, D');
    case 0x7E:
      return makeRow(rom, addr, 1, 'LD A, (HL)');
    case 0x83:
      return makeRow(rom, addr, 1, 'ADD A, E');
    case 0x9A:
      return makeRow(rom, addr, 1, 'SBC A, D');
    case 0xAF:
      return makeRow(rom, addr, 1, 'XOR A');
    case 0xB1:
      return makeRow(rom, addr, 1, 'OR C');
    case 0xB7:
      return makeRow(rom, addr, 1, 'OR A');
    case 0xBE:
      return makeRow(rom, addr, 1, 'CP (HL)');
    case 0xC3: {
      const target = read24(rom, addr + 1);
      return makeRow(rom, addr, 4, `JP ${hex(target)}`, {
        kind: 'jp',
        target,
        boundaryStop: true,
      });
    }
    case 0xC8:
      return makeRow(rom, addr, 1, 'RET Z', { kind: 'ret' });
    case 0xC9:
      return makeRow(rom, addr, 1, 'RET', { kind: 'ret', boundaryStop: true });
    case 0xCA: {
      const target = read24(rom, addr + 1);
      return makeRow(rom, addr, 4, `JP Z, ${hex(target)}`, { kind: 'jp', target });
    }
    case 0xCD: {
      const target = read24(rom, addr + 1);
      return makeRow(rom, addr, 4, `CALL ${hex(target)}`, { kind: 'call', target });
    }
    case 0xD0:
      return makeRow(rom, addr, 1, 'RET NC', { kind: 'ret' });
    case 0xD2: {
      const target = read24(rom, addr + 1);
      return makeRow(rom, addr, 4, `JP NC, ${hex(target)}`, { kind: 'jp', target });
    }
    case 0xD6:
      return makeRow(rom, addr, 2, `SUB ${hex(rom[addr + 1], 2)}`);
    case 0xD8:
      return makeRow(rom, addr, 1, 'RET C', { kind: 'ret' });
    case 0xDA: {
      const target = read24(rom, addr + 1);
      return makeRow(rom, addr, 4, `JP C, ${hex(target)}`, { kind: 'jp', target });
    }
    case 0xE1:
      return makeRow(rom, addr, 1, 'POP HL');
    case 0xE5:
      return makeRow(rom, addr, 1, 'PUSH HL');
    case 0xE6:
      return makeRow(rom, addr, 2, `AND ${hex(rom[addr + 1], 2)}`);
    case 0xED: {
      const op2 = rom[addr + 1];
      switch (op2) {
        case 0x52:
          return makeRow(rom, addr, 2, 'SBC HL, DE');
        case 0x53:
          return makeRow(rom, addr, 5, `LD (${hex(read24(rom, addr + 2))}), DE`);
        case 0x5B:
          return makeRow(rom, addr, 5, `LD DE, (${hex(read24(rom, addr + 2))})`);
        default:
          return makeRow(rom, addr, 2, `DB ED ${hexByte(op2)}`);
      }
    }
    case 0xFE:
      return makeRow(rom, addr, 2, `CP ${hex(rom[addr + 1], 2)}`);
    default:
      return makeRow(rom, addr, 1, `DB ${hexByte(op)}`);
  }
}

function disassembleRange(rom, start, endExclusive) {
  const rows = [];
  let addr = start;
  while (addr < endExclusive) {
    const row = decodeAdl(rom, addr);
    rows.push(row);
    addr = row.next;
  }
  return rows;
}

function findFunctionBoundary(rows, focusAddr) {
  const boundaryStops = rows.filter((row) => row.addr < focusAddr && row.boundaryStop);
  const stop = boundaryStops[boundaryStops.length - 1] ?? null;
  return {
    stop,
    entry: stop ? stop.next : null,
  };
}

function scanDirectXrefs(rom, target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];
  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const op = XREF_OPS.get(rom[addr]);
    if (!op) {
      continue;
    }
    if (rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      hits.push({
        addr,
        kind: op.kind,
        text: op.text,
        bytes: formatBytes(rom, addr, 4),
      });
    }
  }
  return hits;
}

function summarizeKinds(hits) {
  const counts = new Map();
  for (const hit of hits) {
    counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
  }
  return counts;
}

function formatHitList(hits, target) {
  return hits.map((hit) => `  ${hex(hit.addr)}  ${hit.bytes.padEnd(14, ' ')}  ${hit.text} ${hex(target)}`);
}

function findComputedDispatchOps(rom, start, endExclusive) {
  const hits = [];
  for (let addr = start; addr < endExclusive; addr += 1) {
    if (rom[addr] === 0xE9) {
      hits.push({ addr, text: 'JP (HL)' });
      continue;
    }
    if (rom[addr] === 0xDD && rom[addr + 1] === 0xE9) {
      hits.push({ addr, text: 'JP (IX)' });
      continue;
    }
    if (rom[addr] === 0xFD && rom[addr + 1] === 0xE9) {
      hits.push({ addr, text: 'JP (IY)' });
    }
  }
  return hits;
}

function printRows(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`  ${hex(row.addr)}  ${row.bytes.padEnd(17, ' ')} ${row.text}`);
  }
}

function printRawWindow(rom, start, endExclusive) {
  console.log(`\nRaw bytes ${hex(start)}-${hex(endExclusive)} (${endExclusive - start} bytes, end-exclusive)`);
  for (let addr = start; addr < endExclusive; addr += 16) {
    const rowEnd = Math.min(addr + 16, endExclusive);
    console.log(`  ${hex(addr)}  ${Array.from(rom.slice(addr, rowEnd), hexByte).join(' ')}`);
  }
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length < 0x400000) {
    throw new Error(`ROM too small: expected at least 0x400000 bytes, got ${hex(rom.length)}`);
  }

  const helperRows = disassembleRange(rom, HELPER_START, HELPER_END);
  const contextRows = disassembleRange(rom, FUNCTION_START_HINT, FUNCTION_CONTEXT_END);
  const exitRows = disassembleRange(rom, EXIT_WINDOW_START, EXIT_WINDOW_END);
  const boundary = findFunctionBoundary(contextRows, FUNCTION_FOCUS);

  const entryXrefs = scanDirectXrefs(rom, FUNCTION_ENTRY);
  const tailXrefs = scanDirectXrefs(rom, INTERNAL_TAIL);
  const focusXrefs = scanDirectXrefs(rom, FUNCTION_FOCUS);
  const entryKinds = summarizeKinds(entryXrefs);
  const computedDispatch = findComputedDispatchOps(rom, boundary.entry ?? FUNCTION_ENTRY, FUNCTION_CONTEXT_END);

  console.log('=== Phase 279: 0x08474B Exit Path ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Focus: ${hex(FUNCTION_FOCUS)} | helper: ${hex(HELPER_START)} | canonical entry: ${hex(FUNCTION_ENTRY)}`);

  printRawWindow(rom, EXIT_WINDOW_START, EXIT_WINDOW_END);
  printRows(`ADL disassembly ${hex(EXIT_WINDOW_START)}-${hex(EXIT_WINDOW_END)} (exit window)`, exitRows);
  printRows(`ADL disassembly ${hex(FUNCTION_START_HINT)}-${hex(FUNCTION_CONTEXT_END)} (backtrace window)`, contextRows);
  printRows(`ADL disassembly ${hex(HELPER_START)}-${hex(HELPER_END)} (0x04C885 helper)`, helperRows);

  console.log('\nFunction boundary search');
  if (boundary.stop && boundary.entry !== null) {
    console.log(`  Last hard stop before ${hex(FUNCTION_FOCUS)}: ${hex(boundary.stop.addr)}  ${boundary.stop.text}`);
    console.log(`  Next linear address: ${hex(boundary.entry)}`);
  } else {
    console.log('  No hard stop found in the selected backtrace window.');
  }
  console.log(`  Expected function entry from prior reports: ${hex(FUNCTION_ENTRY)}`);
  console.log(`  Boundary verdict: ${boundary.entry === FUNCTION_ENTRY ? 'match' : 'mismatch'}`);

  console.log('\nDirect 24-bit CALL/JP xrefs');
  console.log(`  ${hex(FUNCTION_ENTRY)}: ${entryXrefs.length} hits total`);
  console.log(`    CALL hits: ${entryKinds.get('call') ?? 0}`);
  console.log(`    JP hits: ${entryKinds.get('jp') ?? 0}`);
  for (const line of formatHitList(entryXrefs, FUNCTION_ENTRY)) {
    console.log(line);
  }

  console.log(`\n  ${hex(INTERNAL_TAIL)}: ${tailXrefs.length} hits total`);
  for (const line of formatHitList(tailXrefs, INTERNAL_TAIL)) {
    console.log(line);
  }

  console.log(`\n  ${hex(FUNCTION_FOCUS)}: ${focusXrefs.length} hits total`);
  if (focusXrefs.length > 0) {
    for (const line of formatHitList(focusXrefs, FUNCTION_FOCUS)) {
      console.log(line);
    }
  }

  console.log('\nDispatch-mechanism checks');
  console.log(`  Computed dispatch ops inside ${hex(FUNCTION_ENTRY)}-${hex(FUNCTION_CONTEXT_END)}: ${computedDispatch.length}`);
  if (computedDispatch.length > 0) {
    for (const hit of computedDispatch) {
      console.log(`  ${hex(hit.addr)}  ${hit.text}`);
    }
  } else {
    console.log('  None: no JP (HL), JP (IX), or JP (IY) in this routine window.');
  }

  console.log('\nAnalysis');
  console.log('  1. The containing routine starts at 0x0846EA. The preceding instruction at 0x0846E9 is RET,');
  console.log('     so 0x0846EA is the next function entry point in the linear stream.');
  console.log('  2. The successful-match tail is:');
  console.log('     0x08473E INC HL');
  console.log('     0x08473F LD B,(HL)');
  console.log('     0x084740 INC HL');
  console.log('     0x084741 LD D,(HL)');
  console.log('     0x084742 INC HL');
  console.log('     0x084743 LD E,(HL)');
  console.log('     0x084744 CALL 0x04C885');
  console.log('     0x084748 INC HL');
  console.log('     0x084749 INC HL');
  console.log('     0x08474A INC HL');
  console.log('     0x08474B LD A,(HL)');
  console.log('     0x08474C LD (0xD005F8),A');
  console.log('     0x084750 RET');
  console.log('  3. 0x04C885 is a repack helper, not a dispatcher: it copies B:D:E into D02AD7-D02AD9,');
  console.log('     reloads DE from D02AD7, and returns. That leaves DE holding the 24-bit handler address.');
  console.log('  4. After the D005F8 store there is no fixed CALL, no fixed JP, and no computed JP through HL/IX/IY.');
  console.log('     The code returns immediately. The dispatch mechanism here is "lookup result + RET";');
  console.log('     whatever consumes the handler address happens later in the caller chain, not inside this routine.');
  console.log('  5. Internal tail label 0x08473E has one direct JP xref (0x0838B4). The byte-store site 0x08474B');
  console.log('     itself has no direct callers; it is only reached by falling through the match tail.');
}

main();
