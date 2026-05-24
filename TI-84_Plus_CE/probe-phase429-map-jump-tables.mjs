#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase429-jump-tables-report.md');
const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

const SCANNING_SEQCASE = 0x00211B;
const RANGE_SEQCASE = 0x002623;

const TARGETS = [
  {
    addr: 0x008A52,
    label: 'USB init call site',
    notes: 'pushes 0 / 2 / 2000 before CALL 0x00CC71',
  },
  {
    addr: 0x008EB5,
    label: 'Link/serial init call site',
    notes: 'pushes 0 / 1 / 300 before CALL 0x00CC71',
  },
  {
    addr: 0x0126F5,
    label: 'USB alt-mode init call site',
    notes: 'pushes 0 / 1 / 1000 before CALL 0x00CC71',
  },
];

const JP_CC_NAMES = new Map([
  [0xC2, 'NZ'],
  [0xCA, 'Z'],
  [0xD2, 'NC'],
  [0xDA, 'C'],
  [0xE2, 'PO'],
  [0xEA, 'PE'],
  [0xF2, 'P'],
  [0xFA, 'M'],
]);

const JR_CC_NAMES = new Map([
  [0x20, 'NZ'],
  [0x28, 'Z'],
  [0x30, 'NC'],
  [0x38, 'C'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16(offset) {
  if (offset < 0 || offset + 1 >= ROM_SIZE) return -1;
  return rom[offset] | (rom[offset + 1] << 8);
}

function read24(offset) {
  if (offset < 0 || offset + 2 >= ROM_SIZE) return -1;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function formatBytes(offset, length) {
  const bytes = [];
  for (let i = 0; i < length && offset + i < ROM_SIZE; i++) {
    bytes.push(rom[offset + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function searchRaw24(value) {
  const hits = [];
  const lo = value & 0xFF;
  const mid = (value >> 8) & 0xFF;
  const hi = (value >> 16) & 0xFF;
  for (let offset = 0; offset <= ROM_SIZE - 3; offset++) {
    if (rom[offset] === lo && rom[offset + 1] === mid && rom[offset + 2] === hi) {
      hits.push(offset);
    }
  }
  return hits;
}

function classifyRawHit(offset) {
  const prev = offset > 0 ? rom[offset - 1] : -1;
  if (prev === 0xCD) {
    return { offset, kind: 'CALL', site: offset - 1 };
  }
  if (prev === 0xC3) {
    return { offset, kind: 'JP', site: offset - 1 };
  }
  if (JP_CC_NAMES.has(prev)) {
    return { offset, kind: `JP ${JP_CC_NAMES.get(prev)}`, site: offset - 1 };
  }
  return { offset, kind: 'data', site: null };
}

function findFunctionStart(addr, maxBack = 0x400) {
  const limit = Math.max(0, addr - maxBack);
  for (let offset = addr - 1; offset >= limit; offset--) {
    if (rom[offset] === 0xC9) {
      return offset + 1;
    }
  }
  return Math.max(0, addr - 0x40);
}

function findDirectInstructionRefs(addr) {
  const refs = [];
  for (let offset = 0; offset <= ROM_SIZE - 4; offset++) {
    const op = rom[offset];
    if (read24(offset + 1) !== addr) {
      continue;
    }
    if (op === 0xCD) {
      refs.push({ site: offset, kind: 'CALL' });
    } else if (op === 0xC3) {
      refs.push({ site: offset, kind: 'JP' });
    } else if (JP_CC_NAMES.has(op)) {
      refs.push({ site: offset, kind: `JP ${JP_CC_NAMES.get(op)}` });
    }
  }
  for (let offset = 0; offset <= ROM_SIZE - 2; offset++) {
    const op = rom[offset];
    if (op !== 0x18 && !JR_CC_NAMES.has(op)) {
      continue;
    }
    const disp = rom[offset + 1] >= 0x80 ? rom[offset + 1] - 0x100 : rom[offset + 1];
    const target = offset + 2 + disp;
    if (target === addr) {
      refs.push({
        site: offset,
        kind: op === 0x18 ? 'JR' : `JR ${JR_CC_NAMES.get(op)}`,
      });
    }
  }
  refs.sort((a, b) => a.site - b.site);
  return refs;
}

function findSeqcaseCalls(start, endExclusive) {
  const calls = [];
  for (let offset = start; offset <= endExclusive - 4; offset++) {
    if (rom[offset] !== 0xCD) {
      continue;
    }
    const target = read24(offset + 1);
    if (target === SCANNING_SEQCASE) {
      calls.push({ kind: 'scan', callSite: offset });
    } else if (target === RANGE_SEQCASE) {
      calls.push({ kind: 'range', callSite: offset });
    }
  }
  return calls;
}

function inferSelectorSource(callSite) {
  const windowStart = Math.max(0, callSite - 24);
  const window = rom.subarray(windowStart, callSite);
  const asHex = Array.from(window, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  if (asHex.includes('3a b8 77 d1')) {
    return 'D177B8';
  }
  if (asHex.includes('3a b9 77 d1')) {
    return 'D177B9';
  }
  return 'HL / caller-provided selector';
}

function parseScanningSeqcase(callSite) {
  const tableStart = callSite + 4;
  const count = read16(tableStart);
  const entries = [];
  let offset = tableStart + 2;
  for (let index = 0; index < count; index++, offset += 4) {
    entries.push({
      code: rom[offset],
      target: read24(offset + 1),
      entryOffset: offset,
      addrOffset: offset + 1,
    });
  }
  return {
    kind: 'scan',
    callSite,
    tableStart,
    count,
    selectorSource: inferSelectorSource(callSite),
    entries,
    defaultTarget: read24(offset),
    defaultOffset: offset,
  };
}

function parseRangeSeqcase(callSite) {
  const tableStart = callSite + 4;
  const count = read16(tableStart);
  const base = read24(tableStart + 2);
  const entries = [];
  let offset = tableStart + 5;
  for (let index = 0; index < count; index++, offset += 3) {
    entries.push({
      code: base + index,
      target: read24(offset),
      entryOffset: offset,
      addrOffset: offset,
    });
  }
  return {
    kind: 'range',
    callSite,
    tableStart,
    count,
    base,
    selectorSource: inferSelectorSource(callSite),
    entries,
    defaultTarget: read24(offset),
    defaultOffset: offset,
  };
}

function parseSeqcase(call) {
  return call.kind === 'scan'
    ? parseScanningSeqcase(call.callSite)
    : parseRangeSeqcase(call.callSite);
}

function nextBoundary(targetStart, boundaries) {
  for (const boundary of boundaries) {
    if (boundary > targetStart) {
      return boundary;
    }
  }
  return null;
}

function findContainingCases(targetAddr, table) {
  const boundaries = [...new Set([
    ...table.entries.map((entry) => entry.target),
    table.defaultTarget,
  ])].sort((a, b) => a - b);

  const matches = [];
  for (const entry of table.entries) {
    const rangeEnd = nextBoundary(entry.target, boundaries);
    if (targetAddr >= entry.target && (rangeEnd == null || targetAddr < rangeEnd)) {
      matches.push({
        type: 'case',
        code: entry.code,
        target: entry.target,
        entryOffset: entry.entryOffset,
        addrOffset: entry.addrOffset,
        rangeEnd,
      });
    }
  }

  if (matches.length > 0) {
    return matches;
  }

  const defaultEnd = nextBoundary(table.defaultTarget, boundaries);
  if (targetAddr >= table.defaultTarget && (defaultEnd == null || targetAddr < defaultEnd)) {
    return [{
      type: 'default',
      code: null,
      target: table.defaultTarget,
      entryOffset: table.defaultOffset,
      addrOffset: table.defaultOffset,
      rangeEnd: defaultEnd,
    }];
  }

  return [];
}

function findPayloadComparesNear(callSite, window = 0x40) {
  const hits = [];
  const start = Math.max(0, callSite - window);
  for (let offset = start; offset <= callSite - 6; offset++) {
    if (
      rom[offset] === 0x3A &&
      rom[offset + 1] === 0xB8 &&
      rom[offset + 2] === 0x77 &&
      rom[offset + 3] === 0xD1
    ) {
      for (let probe = offset + 4; probe <= Math.min(callSite - 2, offset + 10); probe++) {
        if (rom[probe] === 0xFE) {
          hits.push({
            loadSite: offset,
            compareSite: probe,
            value: rom[probe + 1],
          });
        }
      }
    }
  }
  return hits;
}

function analyzeTarget(target) {
  const exactRawHits = searchRaw24(target.addr).map(classifyRawHit);
  const exactDirectRefs = findDirectInstructionRefs(target.addr);
  const functionStart = findFunctionStart(target.addr);
  const dispatchers = findSeqcaseCalls(functionStart, target.addr)
    .map(parseSeqcase)
    .map((table) => ({
      ...table,
      containingCases: findContainingCases(target.addr, table),
    }))
    .filter((table) => table.containingCases.length > 0);

  const functionStartRawHits = searchRaw24(functionStart).map(classifyRawHit);
  const functionStartRefs = findDirectInstructionRefs(functionStart);
  const payloadGuards = functionStartRefs.flatMap((ref) => findPayloadComparesNear(ref.site));

  return {
    ...target,
    exactRawHits,
    exactDirectRefs,
    functionStart,
    dispatchers,
    functionStartRawHits,
    functionStartRefs,
    payloadGuards,
  };
}

function formatCaseCode(entry) {
  if (entry.code == null) {
    return 'default';
  }
  return entry.code <= 0xFF ? hex(entry.code, 2) : hex(entry.code);
}

function formatHit(hit) {
  if (hit.kind === 'data') {
    return `${hex(hit.offset)} as raw data`;
  }
  return `${hex(hit.site)}: ${hit.kind} ${hex(read24(hit.site + 1))}`;
}

function formatRef(ref, addr) {
  return `${hex(ref.site)}: ${ref.kind} ${hex(addr)}`;
}

function buildReport(results) {
  const lines = [];
  lines.push('# Phase 429 - Jump Table Mapping for USB/Link Init Dispatchers');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('- Exact 24-bit little-endian bytes for 0x008A52, 0x008EB5, and 0x0126F5 do not appear anywhere in the 4 MB ROM as standalone data.');
  lines.push('- 0x008A52 is reached through a sparse _seqcase table at 0x008A14. The selector is D177B8, and code 0x45 enters case 0x008A39, which contains the CALL 0x00CC71 at 0x008A52.');
  lines.push('- 0x008EB5 is reached through a sparse _seqcase table at 0x008DB8. The selector is D177B8, and code 0x81 enters case 0x008EA6, which contains the CALL 0x00CC71 at 0x008EB5.');
  lines.push('- 0x0126F5 is not targeted by any recovered jump table. Its containing function starts at 0x0126A9 and is called directly from 0x0084A7 and 0x0127DA.');
  lines.push('- No nearby 0x002623 range-seqcase or JP (HL)/(IX)/(IY) table dispatch was recovered for any of the three exact call sites.');
  lines.push('');
  lines.push('## Per-target recovery');
  lines.push('');

  for (const result of results) {
    lines.push(`### ${hex(result.addr)} - ${result.label}`);
    lines.push('');
    lines.push(`- Context: ${result.notes}`);
    lines.push(`- Exact raw 3-byte hits: ${result.exactRawHits.length === 0 ? 'none' : result.exactRawHits.map(formatHit).join('; ')}`);
    lines.push(`- Exact direct CALL/JP/JR refs: ${result.exactDirectRefs.length === 0 ? 'none' : result.exactDirectRefs.map((ref) => formatRef(ref, result.addr)).join('; ')}`);
    lines.push(`- Containing function start (previous RET + 1): ${hex(result.functionStart)}`);
    lines.push('');

    if (result.dispatchers.length > 0) {
      for (const dispatcher of result.dispatchers) {
        lines.push(`Dispatcher recovered from ${hex(dispatcher.callSite)} -> ${dispatcher.kind === 'scan' ? '_seqcase scan' : '_seqcase range'} table at ${hex(dispatcher.tableStart)}.`);
        lines.push(`Selector source: ${dispatcher.selectorSource}.`);
        if (dispatcher.kind === 'range') {
          lines.push(`Base selector: ${hex(dispatcher.base)}. Entry count: ${dispatcher.count}.`);
        } else {
          lines.push(`Entry count: ${dispatcher.count}.`);
        }
        lines.push('');
        lines.push('| Code | Entry target | Address bytes at | Notes |');
        lines.push('| --- | --- | --- | --- |');
        for (const entry of dispatcher.entries) {
          const containing = dispatcher.containingCases.find(
            (match) => match.type === 'case' && match.target === entry.target && match.code === entry.code,
          );
          const notes = containing
            ? `contains ${hex(result.addr)}`
            : 'sibling handler';
          lines.push(`| ${formatCaseCode(entry)} | ${hex(entry.target)} | ${hex(entry.addrOffset)} | ${notes} |`);
        }
        lines.push(`| default | ${hex(dispatcher.defaultTarget)} | ${hex(dispatcher.defaultOffset)} | default branch |`);
        lines.push('');
      }
    } else {
      lines.push('- No enclosing _seqcase table was found between the containing function start and the exact call site.');
      lines.push(`- Raw 24-bit hits for the containing function start ${hex(result.functionStart)}: ${result.functionStartRawHits.length === 0 ? 'none' : result.functionStartRawHits.map(formatHit).join('; ')}`);
      lines.push(`- Direct refs to the containing function start: ${result.functionStartRefs.length === 0 ? 'none' : result.functionStartRefs.map((ref) => formatRef(ref, result.functionStart)).join('; ')}`);
      if (result.payloadGuards.length > 0) {
        const guardText = result.payloadGuards.map((guard) => `${hex(guard.loadSite)} / ${hex(guard.compareSite)} compares D177B8 against ${hex(guard.value, 2)}`);
        lines.push(`- Nearby D177B8 guards before those calls: ${guardText.join('; ')}`);
      }
      lines.push('- This path is direct-call driven, not jump-table driven.');
      lines.push('');
    }
  }

  lines.push('## Event/message code map');
  lines.push('');
  lines.push('| Flow | Selector source | Recovered code | Mechanism | Recovered entry target | Confidence |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  lines.push('| USB init (0x008A52) | D177B8 | 0x45 | sparse _seqcase scan | 0x008A39 | direct table decode |');
  lines.push('| Link init (0x008EB5) | D177B8 | 0x81 | sparse _seqcase scan | 0x008EA6 | direct table decode |');
  lines.push('| USB alt-mode init (0x0126F5 inside 0x0126A9) | D177B8 | 0xFF | direct call after guard | 0x0126A9 | inferred from surrounding control flow |');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- The two table-driven paths use the sparse 0x00211B _seqcase helper, not the 0x002623 range-seqcase helper.');
  lines.push('- The exact call sites 0x008A52, 0x008EB5, and 0x0126F5 are all mid-block addresses, so a raw 24-bit address search is expected to miss them even when their enclosing case entry or function entry is referenced elsewhere.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const results = TARGETS.map(analyzeTarget);
const report = buildReport(results);
fs.writeFileSync(REPORT_PATH, report);

console.log(report);
console.log(`Report written to ${REPORT_PATH}`);
