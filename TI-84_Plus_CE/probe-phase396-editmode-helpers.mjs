#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = new Uint8Array(readFileSync(new URL('./ROM.rom', import.meta.url)));

const WINDOW_START = 0x006E6D;
const WINDOW_END_INCLUSIVE = 0x006E8D;
const TARGET_IY_BASE = 0xD00080;
const TARGET_DISPLACEMENT = 0x12;
const TARGET_BIT = 2;

const HELPER_PREFIX = [0xFD, 0x21, 0x80, 0x00, 0xD0];
const BIT2_PATTERNS = [
  {
    kind: 'test',
    name: 'TestEditMode',
    bytes: [0xFD, 0xCB, 0x12, 0x56],
    mnemonic: 'BIT 2,(IY+0x12)',
  },
  {
    kind: 'set',
    name: 'SetEditMode',
    bytes: [0xFD, 0xCB, 0x12, 0xD6],
    mnemonic: 'SET 2,(IY+0x12)',
  },
  {
    kind: 'clear',
    name: 'ClearEditMode',
    bytes: [0xFD, 0xCB, 0x12, 0x96],
    mnemonic: 'RES 2,(IY+0x12)',
  },
];

const REGION_TABLE = [
  { start: 0x000000, end: 0x010000, name: 'boot/core' },
  { start: 0x010000, end: 0x020000, name: 'system utilities' },
  { start: 0x020000, end: 0x030000, name: 'key dispatch / event handling' },
  { start: 0x030000, end: 0x040000, name: 'key translation / menu' },
  { start: 0x040000, end: 0x060000, name: 'screen / cursor / display' },
  { start: 0x060000, end: 0x080000, name: 'graph / editor' },
  { start: 0x080000, end: 0x0A0000, name: 'misc OS services' },
  { start: 0x0A0000, end: 0x0C0000, name: 'math / catalog' },
  { start: 0x0C0000, end: 0x400000, name: 'apps / other' },
];

function hex(value, width = 6) {
  return `0x${(Number(value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value ?? 0) || 0) & 0xFF, 2);
}

function read24(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8) | ((rom[addr + 2] ?? 0) << 16)) >>> 0;
}

function read16(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8)) >>> 0;
}

function bytesAt(addr, length) {
  return Array.from(
    rom.subarray(addr, Math.min(addr + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function padRight(text, width) {
  return String(text).padEnd(width);
}

function signedByte(value) {
  const byte = (value ?? 0) & 0xFF;
  return byte < 0x80 ? byte : byte - 0x100;
}

function formatDisp(value) {
  return `${value < 0 ? '-' : '+'}${hexByte(Math.abs(value))}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
}

function matchesAt(addr, bytes) {
  if (addr < 0 || addr + bytes.length > rom.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (rom[addr + index] !== bytes[index]) return false;
  }
  return true;
}

function decodeAt(pc) {
  const b0 = rom[pc] ?? 0;
  const b1 = rom[pc + 1] ?? 0;
  const b2 = rom[pc + 2] ?? 0;
  const b3 = rom[pc + 3] ?? 0;

  if (b0 === 0xFD && b1 === 0x21) {
    const value = read24(pc + 2);
    return { addr: pc, length: 5, tag: 'ld-iy-imm', value, text: `ld iy, ${hex(value)}` };
  }

  if (b0 === 0xFD && b1 === 0xCB) {
    const displacement = signedByte(b2);
    if (b3 === 0x56) {
      return {
        addr: pc,
        length: 4,
        tag: 'indexed-cb-bit',
        bit: 2,
        indexRegister: 'iy',
        displacement,
        text: `bit 2, ${formatIndexed('iy', displacement)}`,
      };
    }
    if (b3 === 0xD6) {
      return {
        addr: pc,
        length: 4,
        tag: 'indexed-cb-set',
        bit: 2,
        indexRegister: 'iy',
        displacement,
        text: `set 2, ${formatIndexed('iy', displacement)}`,
      };
    }
    if (b3 === 0x96) {
      return {
        addr: pc,
        length: 4,
        tag: 'indexed-cb-res',
        bit: 2,
        indexRegister: 'iy',
        displacement,
        text: `res 2, ${formatIndexed('iy', displacement)}`,
      };
    }
  }

  if (b0 === 0xCD) {
    const target = read24(pc + 1);
    return { addr: pc, length: 4, tag: 'call', target, text: `call ${hex(target)}` };
  }

  if (b0 === 0xC3) {
    const target = read24(pc + 1);
    return { addr: pc, length: 4, tag: 'jp', target, text: `jp ${hex(target)}` };
  }

  if (b0 === 0xDD && b1 === 0xF9) {
    return { addr: pc, length: 2, tag: 'ld-sp-ix', text: 'ld sp, ix' };
  }

  if (b0 === 0xDD && b1 === 0xE1) {
    return { addr: pc, length: 2, tag: 'pop-ix', text: 'pop ix' };
  }

  if (b0 === 0x01) {
    const value = read16(pc + 1);
    return { addr: pc, length: 3, tag: 'ld-bc-imm16', value, text: `ld bc, ${hex(value, 4)}` };
  }

  if (b0 === 0xC5) return { addr: pc, length: 1, tag: 'push-bc', text: 'push bc' };
  if (b0 === 0xC1) return { addr: pc, length: 1, tag: 'pop-bc', text: 'pop bc' };
  if (b0 === 0xAF) return { addr: pc, length: 1, tag: 'xor-a', text: 'xor a' };
  if (b0 === 0xC8) return { addr: pc, length: 1, tag: 'ret-z', text: 'ret z' };
  if (b0 === 0x3C) return { addr: pc, length: 1, tag: 'inc-a', text: 'inc a' };
  if (b0 === 0xC9) return { addr: pc, length: 1, tag: 'ret', text: 'ret' };
  if (b0 === 0x00) return { addr: pc, length: 1, tag: 'nop', text: 'nop' };

  return { addr: pc, length: 1, tag: 'db', text: `db ${hexByte(b0)}` };
}

function disassembleRange(start, endInclusive) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive) {
    const row = decodeAt(pc);
    row.bytes = bytesAt(pc, row.length);
    rows.push(row);
    pc += row.length;
  }

  return rows;
}

function regionName(addr) {
  return REGION_TABLE.find((region) => addr >= region.start && addr < region.end)?.name ?? 'unknown';
}

function formatAddressList(addresses) {
  if (!addresses.length) return '(none)';
  return addresses.map((addr) => hex(addr)).join(', ');
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function detectHelpers() {
  const starts = [];

  for (let addr = WINDOW_START; addr <= WINDOW_END_INCLUSIVE - HELPER_PREFIX.length + 1; addr += 1) {
    if (matchesAt(addr, HELPER_PREFIX)) {
      starts.push(addr);
    }
  }

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] - 1 : WINDOW_END_INCLUSIVE;
    const rows = disassembleRange(start, end);
    const opRow = rows.find((row) =>
      row.tag === 'indexed-cb-bit' || row.tag === 'indexed-cb-set' || row.tag === 'indexed-cb-res',
    );

    let kind = 'unknown';
    let name = 'UnknownEditModeHelper';
    let purpose = 'Unknown edit-mode helper.';

    if (opRow?.tag === 'indexed-cb-bit') {
      kind = 'test';
      name = 'TestEditMode';
      purpose = rows.some((row) => row.tag === 'xor-a')
        && rows.some((row) => row.tag === 'ret-z')
        && rows.some((row) => row.tag === 'inc-a')
        ? 'Returns A=1 when edit mode is set, otherwise A=0.'
        : 'Tests the edit-mode bit.';
    } else if (opRow?.tag === 'indexed-cb-set') {
      kind = 'set';
      name = 'SetEditMode';
      purpose = 'Sets edit mode by setting bit 2 of (IY+0x12).';
    } else if (opRow?.tag === 'indexed-cb-res') {
      kind = 'clear';
      name = 'ClearEditMode';
      purpose = 'Clears edit mode by clearing bit 2 of (IY+0x12).';
    }

    return {
      kind,
      name,
      start,
      end,
      rows,
      opAddr: opRow?.addr ?? null,
      opMnemonic: BIT2_PATTERNS.find((pattern) => pattern.kind === kind)?.mnemonic ?? '(unknown)',
      purpose,
    };
  });
}

function findDirectReferences(targetAddr) {
  const refs = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const opcode = rom[addr];
    if ((opcode === 0xCD || opcode === 0xC3) && rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      refs.push({
        addr,
        type: opcode === 0xCD ? 'CALL' : 'JP',
        target: targetAddr,
        bytes: bytesAt(addr, 4),
        region: regionName(addr),
      });
    }
  }

  return refs;
}

function findPatternHits(bytes) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - bytes.length; addr += 1) {
    if (matchesAt(addr, bytes)) hits.push(addr);
  }
  return hits;
}

function buildInlineBit2Analysis(helpers) {
  const helperOpAddrs = new Set(helpers.map((helper) => helper.opAddr).filter((addr) => addr !== null));
  const patternResults = BIT2_PATTERNS.map((pattern) => {
    const allHits = findPatternHits(pattern.bytes);
    const inlineHits = allHits.filter((addr) => !helperOpAddrs.has(addr));
    return { ...pattern, allHits, inlineHits };
  });

  const regionStats = new Map();

  for (const result of patternResults) {
    for (const addr of result.inlineHits) {
      const region = regionName(addr);
      if (!regionStats.has(region)) {
        regionStats.set(region, {
          total: 0,
          test: 0,
          set: 0,
          clear: 0,
          addresses: [],
        });
      }
      const entry = regionStats.get(region);
      entry.total += 1;
      entry[result.kind] += 1;
      entry.addresses.push(addr);
    }
  }

  return {
    totalHits: patternResults.reduce((sum, result) => sum + result.allHits.length, 0),
    inlineHits: patternResults.reduce((sum, result) => sum + result.inlineHits.length, 0),
    patternResults,
    regionStats,
  };
}

function printHelperWindow(rows) {
  printSection(`Linear disassembly ${hex(WINDOW_START)}..${hex(WINDOW_END_INCLUSIVE)}`);
  for (const row of rows) {
    console.log(`${hex(row.addr)}  ${padRight(row.bytes, 16)}  ${row.text}`);
  }
}

function printDetectedHelpers(helpers) {
  printSection('Detected helper entries and purposes');
  console.log(`IY base = ${hex(TARGET_IY_BASE)}, target byte = ${hex(TARGET_IY_BASE + TARGET_DISPLACEMENT)} (IY+0x12), bit ${TARGET_BIT}`);
  console.log('The prompt markers 0x006E73 / 0x006E7F / 0x006E89 are the inner BIT/SET/RES instructions.');
  console.log('The actual callable helper entries begin at the preceding `LD IY, 0xD00080` stubs.');
  console.log('');

  for (const helper of helpers) {
    console.log(
      `${helper.name}: entry ${hex(helper.start)}..${hex(helper.end)} `
      + `(${helper.end - helper.start + 1} bytes), inner op ${hex(helper.opAddr)} ${helper.opMnemonic}`,
    );
    console.log(`  purpose: ${helper.purpose}`);
  }

  console.log('');
  console.log('Per-helper listings:');
  for (const helper of helpers) {
    console.log('');
    console.log(`--- ${helper.name} ---`);
    for (const row of helper.rows) {
      console.log(`${hex(row.addr)}  ${padRight(row.bytes, 16)}  ${row.text}`);
    }
  }
}

function printDirectReferenceScan(helpers) {
  printSection('Direct 24-bit CALL/JP references to helper entries');

  const allRefs = [];

  for (const helper of helpers) {
    const entryRefs = findDirectReferences(helper.start);
    const markerRefs = findDirectReferences(helper.opAddr);
    allRefs.push(...entryRefs.map((ref) => ({ ...ref, helperName: helper.name })));

    console.log('');
    console.log(`${helper.name}`);
    console.log(`  actual entry  ${hex(helper.start)} -> ${entryRefs.length} direct reference(s)`);
    console.log(`  inner marker  ${hex(helper.opAddr)} -> ${markerRefs.length} direct reference(s)`);

    if (!entryRefs.length) {
      console.log('  entry refs: (none)');
    } else {
      for (const ref of entryRefs) {
        console.log(`  ${hex(ref.addr)}  ${padRight(ref.type, 4)}  ${ref.bytes}  [${ref.region}]`);
      }
    }
  }

  const regionBuckets = new Map();
  for (const ref of allRefs) {
    if (!regionBuckets.has(ref.region)) regionBuckets.set(ref.region, []);
    regionBuckets.get(ref.region).push(ref);
  }

  console.log('');
  console.log('Grouped by ROM region:');
  if (!allRefs.length) {
    console.log('  (no direct helper callers found anywhere in the ROM)');
    return;
  }

  for (const region of REGION_TABLE.map((entry) => entry.name)) {
    const refs = regionBuckets.get(region);
    if (!refs?.length) continue;
    console.log(`  ${region}:`);
    for (const ref of refs) {
      console.log(`    ${hex(ref.addr)}  ${ref.type} ${ref.helperName} (${hex(ref.target)})`);
    }
  }
}

function printInlineBit2Analysis(analysis) {
  printSection('Global edit-mode bit-2 footprint (including inline sites)');
  console.log(
    `Total BIT/SET/RES 2,(IY+0x12) hits in the full 4 MiB ROM: ${analysis.totalHits} `
    + `(3 inside the helper window, ${analysis.inlineHits} inline elsewhere)`,
  );
  console.log('');

  for (const result of analysis.patternResults) {
    console.log(
      `${padRight(result.mnemonic, 18)} total=${padRight(result.allHits.length, 2)} `
      + `inline=${padRight(result.inlineHits.length, 2)} `
      + `${result.inlineHits.length ? formatAddressList(result.inlineHits) : '(none)'}`,
    );
  }

  console.log('');
  console.log('Inline sites grouped by subsystem region:');
  for (const region of REGION_TABLE.map((entry) => entry.name)) {
    const entry = analysis.regionStats.get(region);
    if (!entry?.total) continue;
    console.log(
      `  ${region}: total=${entry.total}, `
      + `test=${entry.test}, set=${entry.set}, clear=${entry.clear}`,
    );
    console.log(`    ${formatAddressList(entry.addresses)}`);
  }
}

function printSummary(helpers, analysis) {
  printSection('Summary');

  const clearRefs = findDirectReferences(helpers.find((helper) => helper.kind === 'clear')?.start ?? -1);
  const directTotal = helpers.reduce((sum, helper) => sum + findDirectReferences(helper.start).length, 0);

  console.log(
    `Window ${hex(WINDOW_START)}..${hex(WINDOW_END_INCLUSIVE)} contains ${helpers.length} helper entries: `
    + `${helpers.map((helper) => `${helper.name}@${hex(helper.start)}`).join(', ')}`,
  );
  console.log(
    `Actual helper starts are ${helpers.map((helper) => hex(helper.start)).join(', ')}; `
    + `the prompt marker addresses ${helpers.map((helper) => hex(helper.opAddr)).join(', ')} are inner bit-op instructions.`,
  );
  console.log(`Direct 24-bit CALL/JP references to helper entries: ${directTotal}`);
  console.log(
    clearRefs.length
      ? `  Only ${helpers.find((helper) => helper.kind === 'clear')?.name} has a direct caller: ${hex(clearRefs[0].addr)} in ${clearRefs[0].region}.`
      : '  No direct callers were found for any helper entry.',
  );
  console.log(
    `Global edit-mode bit-2 activity is broader than direct helper usage: ${analysis.inlineHits} inline sites remain after removing the 3 helper-body ops.`,
  );
  console.log(
    'Largest inline clusters: '
    + REGION_TABLE.map((region) => ({
      name: region.name,
      total: analysis.regionStats.get(region.name)?.total ?? 0,
    }))
      .filter((entry) => entry.total > 0)
      .sort((left, right) => right.total - left.total)
      .slice(0, 4)
      .map((entry) => `${entry.name} (${entry.total})`)
      .join(', '),
  );
}

function main() {
  const linearRows = disassembleRange(WINDOW_START, WINDOW_END_INCLUSIVE);
  const helpers = detectHelpers();
  const inlineAnalysis = buildInlineBit2Analysis(helpers);

  console.log('Phase 396 - Edit-mode OS helper scan');
  console.log(`ROM size: ${rom.length} bytes`);

  printHelperWindow(linearRows);
  printDetectedHelpers(helpers);
  printDirectReferenceScan(helpers);
  printInlineBit2Analysis(inlineAnalysis);
  printSummary(helpers, inlineAnalysis);
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        probe: 'probe-phase396-editmode-helpers.mjs',
        error: {
          message: error?.message ?? String(error),
          stack: error?.stack ?? String(error),
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
