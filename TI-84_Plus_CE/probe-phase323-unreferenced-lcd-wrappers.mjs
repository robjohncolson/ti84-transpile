#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TARGETS = [
  {
    addr: 0x007B19,
    name: 'read_port_8040_8041_16bit',
    summary: 'reads ports 0x8040 + 0x8041 as 16-bit HL',
  },
  {
    addr: 0x007B70,
    name: 'read_port_800C_800D_16bit',
    summary: 'reads ports 0x800C + 0x800D as 16-bit HL',
  },
  {
    addr: 0x007D89,
    name: 'port_8020_clear_bit4',
    summary: 'RMW clear bit 4 on port 0x8020 (AND 0xEF)',
  },
  {
    addr: 0x007DBB,
    name: 'port_8020_read_bit6',
    summary: 'reads port 0x8020 and masks bit 6',
  },
  {
    addr: 0x007DC6,
    name: 'read_port_8034',
    summary: 'reads port 0x8034',
  },
];

const TARGET_SET = new Set(TARGETS.map((target) => target.addr));

const DIRECT_BRANCH_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
]);

const PREFIXED_16BIT_BRANCHES = [
  { prefix: 0x49, opcode: 0xCD, name: '.SIS CALL' },
  { prefix: 0x52, opcode: 0xCD, name: '.LIS CALL' },
  // Extra safety check: these were not explicitly requested, but they are the JP
  // analogs of the prefixed CALL forms and can still be legitimate direct refs.
  { prefix: 0x49, opcode: 0xC3, name: '.SIS JP' },
  { prefix: 0x52, opcode: 0xC3, name: '.LIS JP' },
];

const LOAD_OPS = new Map([
  [0x21, 'LD HL'],
  [0x11, 'LD DE'],
  [0x01, 'LD BC'],
]);

const OPCODE_TABLE_OPS = new Map([
  [0xC3, 'JP'],
  [0xCD, 'CALL'],
]);

const TABLE_RANGE_LO = 0x007000;
const TABLE_RANGE_HI = 0x008300;
const MIN_TABLE_ENTRIES = 3;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(offset, length) {
  const end = Math.min(offset + length, rom.length);
  return Array.from(rom.subarray(offset, end), (value) => hexByte(value)).join(' ');
}

function contextForRange(offset, length, before = 4, after = 4) {
  const start = Math.max(0, offset - before);
  const end = Math.min(rom.length, offset + length + after);
  const parts = [];

  for (let addr = start; addr < end; addr++) {
    const token = hexByte(rom[addr]);
    parts.push(addr >= offset && addr < offset + length ? `[${token}]` : token);
  }

  return `${hex(start)}: ${parts.join(' ')}`;
}

function section(title) {
  console.log(`\n${'='.repeat(88)}`);
  console.log(title);
  console.log('='.repeat(88));
}

function inPointerTableRange(value) {
  return value >= TABLE_RANGE_LO && value < TABLE_RANGE_HI;
}

function scanPattern(bytes) {
  const hits = [];
  const max = rom.length - bytes.length;
  const first = bytes[0];

  outer: for (let offset = 0; offset <= max; offset++) {
    if (rom[offset] !== first) {
      continue;
    }
    for (let index = 1; index < bytes.length; index++) {
      if (rom[offset + index] !== bytes[index]) {
        continue outer;
      }
    }
    hits.push(offset);
  }

  return hits;
}

function detectRawStrideTables(stride) {
  const tables = [];

  for (let alignment = 0; alignment < stride; alignment++) {
    let cursor = alignment;

    while (cursor <= rom.length - 3) {
      if (!inPointerTableRange(read24(cursor))) {
        cursor += stride;
        continue;
      }

      const entries = [];
      while (cursor <= rom.length - 3) {
        const target = read24(cursor);
        if (!inPointerTableRange(target)) {
          break;
        }
        entries.push({
          entryStart: cursor,
          pointerStart: cursor,
          target,
        });
        cursor += stride;
      }

      if (entries.length >= MIN_TABLE_ENTRIES) {
        tables.push({
          layout: `${stride}-byte raw pointer table`,
          stride,
          entrySize: stride,
          start: entries[0].entryStart,
          end: entries[entries.length - 1].entryStart + stride - 1,
          entries,
        });
      }
    }
  }

  return tables;
}

function detectOpcodePointerTables() {
  const stride = 4;
  const tables = [];

  for (let alignment = 0; alignment < stride; alignment++) {
    let cursor = alignment;

    while (cursor <= rom.length - 4) {
      const opcode = rom[cursor];
      const target = read24(cursor + 1);

      if (!OPCODE_TABLE_OPS.has(opcode) || !inPointerTableRange(target)) {
        cursor += stride;
        continue;
      }

      const entries = [];
      while (cursor <= rom.length - 4) {
        const op = rom[cursor];
        const value = read24(cursor + 1);
        if (!OPCODE_TABLE_OPS.has(op) || !inPointerTableRange(value)) {
          break;
        }
        entries.push({
          entryStart: cursor,
          pointerStart: cursor + 1,
          target: value,
          opcode: op,
          opcodeName: OPCODE_TABLE_OPS.get(op),
        });
        cursor += stride;
      }

      if (entries.length >= MIN_TABLE_ENTRIES) {
        tables.push({
          layout: '4-byte opcode pointer table',
          stride,
          entrySize: stride,
          start: entries[0].entryStart,
          end: entries[entries.length - 1].entryStart + stride - 1,
          entries,
        });
      }
    }
  }

  return tables;
}

function buildTableIndex() {
  const tables = [
    ...detectRawStrideTables(3),
    ...detectRawStrideTables(4),
    ...detectOpcodePointerTables(),
  ]
    .map((table, index) => {
      const matches = [];
      table.entries.forEach((entry, entryIndex) => {
        if (TARGET_SET.has(entry.target)) {
          matches.push({ entryIndex, entry });
        }
      });
      return {
        ...table,
        id: `T${index + 1}`,
        matches,
      };
    })
    .filter((table) => table.matches.length > 0)
    .sort((left, right) => left.start - right.start || left.layout.localeCompare(right.layout));

  const membershipsByPointerStart = new Map();
  const tablesByTarget = new Map(TARGETS.map((target) => [target.addr, []]));

  for (const table of tables) {
    for (const match of table.matches) {
      const membership = {
        table,
        entry: match.entry,
        entryIndex: match.entryIndex,
      };

      if (!membershipsByPointerStart.has(match.entry.pointerStart)) {
        membershipsByPointerStart.set(match.entry.pointerStart, []);
      }
      membershipsByPointerStart.get(match.entry.pointerStart).push(membership);
      tablesByTarget.get(match.entry.target).push(membership);
    }
  }

  return { tables, membershipsByPointerStart, tablesByTarget };
}

function buildBranchMatches(targetAddr) {
  const low = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const high = (targetAddr >> 16) & 0xFF;
  const matches = [];

  for (const [opcode, name] of DIRECT_BRANCH_OPS) {
    for (const offset of scanPattern([opcode, low, mid, high])) {
      matches.push({
        kind: 'CALL/JP',
        subtype: name,
        address: offset,
        bytes: bytesAt(offset, 4),
        text: `${name} ${hex(targetAddr)}`,
        context: contextForRange(offset, 4),
      });
    }
  }

  for (const form of PREFIXED_16BIT_BRANCHES) {
    for (const offset of scanPattern([form.prefix, form.opcode, low, mid])) {
      matches.push({
        kind: 'CALL/JP',
        subtype: form.name,
        address: offset,
        bytes: bytesAt(offset, 4),
        text: `${form.name} ${hex(targetAddr)} (16-bit prefixed)`,
        context: contextForRange(offset, 4),
      });
    }
  }

  return matches.sort((left, right) => left.address - right.address);
}

function buildLoadMatches(targetAddr) {
  const low = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const high = (targetAddr >> 16) & 0xFF;
  const matches = [];

  for (const [opcode, name] of LOAD_OPS) {
    for (const offset of scanPattern([opcode, low, mid, high])) {
      matches.push({
        kind: 'LD',
        subtype: name,
        address: offset,
        bytes: bytesAt(offset, 4),
        text: `${name}, ${hex(targetAddr)}`,
        context: contextForRange(offset, 4),
      });
    }
  }

  return matches.sort((left, right) => left.address - right.address);
}

function describeRawHit(pointerStart, targetAddr, tableIndex) {
  const descriptions = [];

  if (pointerStart >= 1) {
    const directBranch = DIRECT_BRANCH_OPS.get(rom[pointerStart - 1]);
    if (directBranch) {
      descriptions.push(`${directBranch} operand at ${hex(pointerStart - 1)}`);
    }

    const load = LOAD_OPS.get(rom[pointerStart - 1]);
    if (load) {
      descriptions.push(`${load}, ${hex(targetAddr)} operand at ${hex(pointerStart - 1)}`);
    }
  }

  if (pointerStart >= 2) {
    for (const form of PREFIXED_16BIT_BRANCHES) {
      if (
        rom[pointerStart - 2] === form.prefix &&
        rom[pointerStart - 1] === form.opcode
      ) {
        descriptions.push(`${form.name} operand at ${hex(pointerStart - 2)}`);
      }
    }
  }

  const memberships = tableIndex.membershipsByPointerStart.get(pointerStart) || [];
  for (const membership of memberships) {
    if (membership.entry.target !== targetAddr) {
      continue;
    }
    descriptions.push(
      `${membership.table.id} ${membership.table.layout} entry [${membership.entryIndex}]`
    );
  }

  if (descriptions.length === 0) {
    descriptions.push('raw data / pointer candidate');
  }

  return descriptions;
}

function buildRawMatches(targetAddr, tableIndex) {
  const low = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const high = (targetAddr >> 16) & 0xFF;

  return scanPattern([low, mid, high])
    .map((offset) => ({
      address: offset,
      bytes: bytesAt(offset, 3),
      text: describeRawHit(offset, targetAddr, tableIndex).join('; '),
      context: contextForRange(offset, 3),
    }))
    .sort((left, right) => left.address - right.address);
}

function hasTableMembership(rawMatch, targetAddr, tableIndex) {
  const memberships = tableIndex.membershipsByPointerStart.get(rawMatch.address) || [];
  return memberships.some((membership) => membership.entry.target === targetAddr);
}

function classifyTarget(target, branches, loads, rawMatches, tableMemberships) {
  const rawInTables = rawMatches.filter((match) => hasTableMembership(match, target.addr, tableMemberships));

  if (branches.length > 0) {
    return {
      label: 'indeterminate',
      reason: 'direct CALL/JP-like matches were found in the ROM image',
    };
  }

  if (loads.length > 0) {
    return {
      label: 'indeterminate',
      reason: 'the address is loaded into registers, which could feed indirect dispatch',
    };
  }

  if (rawMatches.length === 0) {
    return {
      label: 'truly dead',
      reason: 'no CALL/JP, LD, or raw 24-bit address matches were found',
    };
  }

  if (rawInTables.length === rawMatches.length) {
    return {
      label: 'pointer-table referenced',
      reason: 'every raw 24-bit hit lands inside a dense pointer-table candidate',
    };
  }

  if (rawInTables.length > 0) {
    return {
      label: 'indeterminate',
      reason: 'some raw hits are table-backed, but standalone raw hits still remain',
    };
  }

  return {
    label: 'indeterminate',
    reason: 'only standalone raw 24-bit hits were found',
  };
}

function printMatchList(title, matches) {
  console.log(`\n${title}: ${matches.length}`);
  if (matches.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const match of matches) {
    console.log(`  ${hex(match.address)}  ${match.bytes.padEnd(14)}  ${match.text}`);
    console.log(`    ${match.context}`);
  }
}

function printTableSummary(table) {
  console.log(
    `  ${table.id}: ${table.layout}  ${hex(table.start)}..${hex(table.end)}  ` +
    `(${table.entries.length} entries, stride ${table.stride})`
  );

  const matchingIndexes = table.matches.map((match) => match.entryIndex);
  const previewStart = Math.max(0, Math.min(...matchingIndexes) - 2);
  const previewEnd = Math.min(table.entries.length - 1, Math.max(...matchingIndexes) + 2);

  for (let index = previewStart; index <= previewEnd; index++) {
    const entry = table.entries[index];
    const isMatch = TARGET_SET.has(entry.target);
    const marker = isMatch ? ' <target>' : '';
    const opcodePrefix = entry.opcodeName ? `${entry.opcodeName} ` : '';
    console.log(
      `    [${String(index).padStart(2)}] ${hex(entry.entryStart)}  ` +
      `${opcodePrefix.padEnd(5)}${hex(entry.target)}${marker}`
    );
  }
}

function main() {
  const tableIndex = buildTableIndex();
  const results = [];

  section('Phase 323 Probe: Unreferenced LCD Wrapper Reference Scan');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Targets: ${TARGETS.length}`);
  console.log('Notes:');
  console.log('  - CALL/JP counts include direct 24-bit CALL/JP plus prefixed 16-bit CALL/JP-like forms.');
  console.log('  - Raw 24-bit hit counts are full byte-pattern scans of xx xx 00 and therefore include');
  console.log('    instruction operands when those operands are stored as 24-bit addresses.');
  console.log(
    `  - Dense table scan range: ${hex(TABLE_RANGE_LO)}..${hex(TABLE_RANGE_HI - 1)} ` +
    '(covers the LCD wrapper neighborhood around the 0x007xxx family).'
  );

  section('Dense Pointer-Table Candidates Containing Target Addresses');
  if (tableIndex.tables.length === 0) {
    console.log('  (none found)');
  } else {
    for (const table of tableIndex.tables) {
      printTableSummary(table);
    }
  }

  for (const target of TARGETS) {
    const branches = buildBranchMatches(target.addr);
    const loads = buildLoadMatches(target.addr);
    const rawMatches = buildRawMatches(target.addr, tableIndex);
    const tableRefs = tableIndex.tablesByTarget.get(target.addr) || [];
    const classification = classifyTarget(target, branches, loads, rawMatches, tableIndex);

    results.push({
      target,
      branches,
      loads,
      rawMatches,
      tableRefs,
      classification,
    });

    section(`${hex(target.addr)}  ${target.name}`);
    console.log(`Summary: ${target.summary}`);
    console.log(`Classification: ${classification.label}`);
    console.log(`Reason: ${classification.reason}`);
    console.log(`Dense table memberships: ${tableRefs.length}`);

    if (tableRefs.length > 0) {
      for (const membership of tableRefs) {
        console.log(
          `  - ${membership.table.id} ${membership.table.layout} ` +
          `entry [${membership.entryIndex}] at ${hex(membership.entry.entryStart)}`
        );
      }
    }

    printMatchList('CALL/JP references', branches);
    printMatchList('LD references', loads);
    printMatchList('Raw 24-bit pattern hits', rawMatches);
  }

  section('Final Classification Summary');
  for (const result of results) {
    const { target, branches, loads, rawMatches, tableRefs, classification } = result;
    console.log(
      `  ${hex(target.addr)}  ${target.name.padEnd(28)}  ${classification.label.padEnd(22)}  ` +
      `CALL/JP=${String(branches.length).padStart(2)}  ` +
      `LD=${String(loads.length).padStart(2)}  ` +
      `RAW=${String(rawMatches.length).padStart(2)}  ` +
      `TABLES=${String(tableRefs.length).padStart(2)}`
    );
  }
}

main();
