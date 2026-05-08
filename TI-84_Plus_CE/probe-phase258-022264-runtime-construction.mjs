#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const ROM_EXPECTED_SIZE = 0x400000;
const rom = readFileSync(ROM_PATH);

const TABLE_BASE = 0x022264;
const ALT_BASE = 0x022260;
const TABLE_PAGE_START = 0x022200;
const TABLE_PAGE_END = 0x022300;
const FIRST_ENTRY_TARGET = 0x05523D;
const CONTROL_TABLE = 0x08C958;
const CONTROL_PAGE_START = 0x08C900;
const CONTROL_PAGE_END = 0x08CA00;
const HEADER_DUMP_START = 0x022200;
const HEADER_DUMP_END = 0x022280;
const CONTEXT_RADIUS = 8;
const STRIDE_WINDOW = 20;

const PAIR_LOAD24_OPS = new Map([
  [0x01, 'LD BC'],
  [0x11, 'LD DE'],
  [0x21, 'LD HL'],
  [0x31, 'LD SP'],
]);

const PAIR_LOAD16_OPS = new Map([
  [0x01, 'LD BC'],
  [0x11, 'LD DE'],
  [0x21, 'LD HL'],
  [0x31, 'LD SP'],
]);

const IMM8_LOAD_OPS = new Map([
  [0x06, 'LD B'],
  [0x0E, 'LD C'],
  [0x16, 'LD D'],
  [0x1E, 'LD E'],
  [0x26, 'LD H'],
  [0x2E, 'LD L'],
  [0x3E, 'LD A'],
]);

const CALL24_OPS = new Map([
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xCD, 'CALL'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const JP24_OPS = new Map([
  [0xC2, 'JP NZ'],
  [0xC3, 'JP'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

const IMM24_CONTEXT_OPS = new Map([
  ...PAIR_LOAD24_OPS,
  ...CALL24_OPS,
  ...JP24_OPS,
  [0x22, 'LD (nn), HL'],
  [0x2A, 'LD HL, (nn)'],
  [0x32, 'LD (nn), A'],
  [0x3A, 'LD A, (nn)'],
]);

const SLA_REG_NAMES = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

const REQUESTED_LOAD_PATTERNS = [
  {
    label: 'ADL LD HL, 0x022264',
    bytes: [0x21, 0x64, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: TABLE_BASE,
  },
  {
    label: 'ADL LD HL, 0x022260',
    bytes: [0x21, 0x60, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: ALT_BASE,
  },
  {
    label: 'ADL LD DE, 0x022264',
    bytes: [0x11, 0x64, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: TABLE_BASE,
  },
  {
    label: 'ADL LD DE, 0x022260',
    bytes: [0x11, 0x60, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: ALT_BASE,
  },
  {
    label: 'ADL LD BC, 0x022264',
    bytes: [0x01, 0x64, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: TABLE_BASE,
  },
  {
    label: 'ADL LD BC, 0x022260',
    bytes: [0x01, 0x60, 0x22, 0x02],
    type: 'pair-immediate load',
    mode: 'adl',
    target: ALT_BASE,
  },
  {
    label: 'z80 LD HL, 0x2264',
    bytes: [0x21, 0x64, 0x22],
    type: 'pair-immediate load',
    mode: 'z80',
    target: 0x2264,
  },
  {
    label: 'z80 LD DE, 0x2264',
    bytes: [0x11, 0x64, 0x22],
    type: 'pair-immediate load',
    mode: 'z80',
    target: 0x2264,
  },
  {
    label: 'z80 LD HL, 0x2260',
    bytes: [0x21, 0x60, 0x22],
    type: 'pair-immediate load',
    mode: 'z80',
    target: 0x2260,
  },
  {
    label: 'z80 LD DE, 0x2260',
    bytes: [0x11, 0x60, 0x22],
    type: 'pair-immediate load',
    mode: 'z80',
    target: 0x2260,
  },
];

const REQUESTED_FIRST_TARGET_PATTERNS = [
  {
    label: 'CALL 0x05523D',
    bytes: [0xCD, 0x3D, 0x52, 0x05],
    type: 'call transfer',
    target: FIRST_ENTRY_TARGET,
  },
  {
    label: 'JP 0x05523D',
    bytes: [0xC3, 0x3D, 0x52, 0x05],
    type: 'jump transfer',
    target: FIRST_ENTRY_TARGET,
  },
  {
    label: 'LD HL, 0x05523D',
    bytes: [0x21, 0x3D, 0x52, 0x05],
    type: 'pair-immediate load',
    target: FIRST_ENTRY_TARGET,
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return Array.from(rom.subarray(safeStart, safeEnd), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read16(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8) | ((rom[addr + 2] ?? 0) << 16)) >>> 0;
}

function formatContext(addr, length, radius = CONTEXT_RADIUS) {
  const beforeCount = Math.min(radius, addr);
  const afterStart = addr + length;
  const afterCount = Math.min(radius, Math.max(0, rom.length - afterStart));
  const before = bytesAt(addr - beforeCount, beforeCount);
  const middle = bytesAt(addr, length);
  const after = bytesAt(afterStart, afterCount);
  return `${before ? `${before} ` : ''}[${middle}]${after ? ` ${after}` : ''}`;
}

function regionLabel(addr) {
  const bank = (addr >>> 16) & 0xFF;
  const page = addr & 0xFFFF00;
  return `bank=${hex(bank, 2)} page=${hex(page)}`;
}

function targetPurpose(target, mode = 'adl') {
  if (target === TABLE_BASE) {
    return mode === 'z80'
      ? 'possible low-16-bit vector-table base if MADL is cleared'
      : 'direct materialization of the vector-table base';
  }

  if (target === ALT_BASE) {
    return mode === 'z80'
      ? 'possible low-16-bit vector-table base minus 4 if MADL is cleared'
      : 'direct materialization of table base minus 4';
  }

  if (target === FIRST_ENTRY_TARGET) {
    return 'first JP target from the 0x022264 vector table';
  }

  if (target === CONTROL_TABLE) {
    return 'known 24-bit handler-table base for comparison';
  }

  if (target >= TABLE_PAGE_START && target < TABLE_PAGE_END) {
    return 'same ROM page as the 0x022264 vector table';
  }

  if (target >= CONTROL_PAGE_START && target < CONTROL_PAGE_END) {
    return 'same ROM page as the known 0x08C958 handler table';
  }

  return 'generic immediate target';
}

function sortByAddr(items) {
  return items.slice().sort((left, right) => left.addr - right.addr);
}

function findPattern(pattern) {
  const hits = [];

  outer: for (let addr = 0; addr <= rom.length - pattern.length; addr += 1) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[addr + index] !== pattern[index]) {
        continue outer;
      }
    }

    hits.push(addr);
  }

  return hits;
}

function makeExactPatternHit(spec, addr) {
  return {
    addr,
    len: spec.bytes.length,
    bytes: bytesAt(addr, spec.bytes.length),
    label: spec.label,
    type: spec.type,
    mode: spec.mode ?? 'adl',
    target: spec.target,
    region: regionLabel(addr),
    purpose: targetPurpose(spec.target, spec.mode ?? 'adl'),
    context: formatContext(addr, spec.bytes.length),
  };
}

function findExactPatternHits(spec) {
  return findPattern(spec.bytes).map((addr) => makeExactPatternHit(spec, addr));
}

function describeImm24Context(rawAddr, target) {
  const opcodeAddr = rawAddr - 1;

  if (opcodeAddr < 0) {
    return {
      type: 'raw 24-bit window',
      detail: 'match is at ROM start; no preceding opcode byte',
      purpose: 'possible data literal or unaligned overlap',
    };
  }

  const opcode = rom[opcodeAddr];
  const mnemonic = IMM24_CONTEXT_OPS.get(opcode);

  if (!mnemonic) {
    return {
      type: 'raw 24-bit window',
      detail: `prev=${hexByte(opcode)} @ ${hex(opcodeAddr)}`,
      purpose: 'possible data literal or unaligned overlap',
    };
  }

  return {
    type: `imm24 for ${mnemonic}`,
    detail: `${mnemonic} immediate starts at ${hex(opcodeAddr)} opcode=${hexByte(opcode)}`,
    purpose: targetPurpose(target, 'adl'),
  };
}

function findRaw24Windows(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr] === lo && rom[addr + 1] === mid && rom[addr + 2] === hi) {
      const classification = describeImm24Context(addr, target);
      hits.push({
        addr,
        len: 3,
        bytes: bytesAt(addr, 3),
        type: classification.type,
        region: regionLabel(addr),
        purpose: classification.purpose,
        detail: classification.detail,
        context: formatContext(addr, 3),
      });
    }
  }

  return hits;
}

function find0222xxAddressLoads() {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const opcode = rom[addr];
    const mnemonic = PAIR_LOAD24_OPS.get(opcode);

    if (!mnemonic) {
      continue;
    }

    const target = read24(addr + 1);
    if (target >= TABLE_PAGE_START && target < TABLE_PAGE_END) {
      hits.push({
        addr,
        len: 4,
        bytes: bytesAt(addr, 4),
        label: `${mnemonic}, ${hex(target)}`,
        type: 'pair-immediate load',
        mode: 'adl',
        target,
        region: regionLabel(addr),
        purpose: targetPurpose(target, 'adl'),
        context: formatContext(addr, 4),
      });
    }
  }

  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    const opcode = rom[addr];
    const mnemonic = PAIR_LOAD16_OPS.get(opcode);

    if (!mnemonic) {
      continue;
    }

    const target = read16(addr + 1);
    if (target >= 0x2200 && target < 0x2300) {
      hits.push({
        addr,
        len: 3,
        bytes: bytesAt(addr, 3),
        label: `${mnemonic}, ${hex(target, 4)}`,
        type: 'pair-immediate load',
        mode: 'z80',
        target,
        region: regionLabel(addr),
        purpose: targetPurpose(target, 'z80'),
        context: formatContext(addr, 3),
      });
    }
  }

  return sortByAddr(hits);
}

function addStrideCandidate(map, key, candidate, loadHit) {
  const existing = map.get(key);
  const refText = `${hex(loadHit.addr)} ${loadHit.label}`;

  if (existing) {
    existing.refs.add(refText);
    return;
  }

  map.set(key, {
    ...candidate,
    refs: new Set([refText]),
  });
}

function collectStrideCandidates(loadHits) {
  const imm4Loads = new Map();
  const addAA = new Map();
  const addHLHL = new Map();
  const slaPairs = new Map();

  for (const loadHit of loadHits) {
    const start = Math.max(0, loadHit.addr - STRIDE_WINDOW);
    const end = Math.min(rom.length, loadHit.addr + loadHit.len + STRIDE_WINDOW);

    for (let addr = start; addr <= end - 2; addr += 1) {
      const imm8Mnemonic = IMM8_LOAD_OPS.get(rom[addr]);

      if (imm8Mnemonic && rom[addr + 1] === 0x04) {
        addStrideCandidate(
          imm4Loads,
          `imm4:${addr}`,
          {
            addr,
            len: 2,
            bytes: bytesAt(addr, 2),
            type: 'LD r, 0x04',
            region: regionLabel(addr),
            purpose: 'possible explicit stride constant near a 0x0222xx base load',
            detail: `${imm8Mnemonic}, 0x04`,
            context: formatContext(addr, 2),
          },
          loadHit,
        );
      }

      if (rom[addr] === 0x87 && rom[addr + 1] === 0x87) {
        addStrideCandidate(
          addAA,
          `adda:${addr}`,
          {
            addr,
            len: 2,
            bytes: bytesAt(addr, 2),
            type: 'ADD A, A pair',
            region: regionLabel(addr),
            purpose: 'possible A * 4 index calculation near a 0x0222xx base load',
            detail: 'ADD A, A ; ADD A, A',
            context: formatContext(addr, 2),
          },
          loadHit,
        );
      }

      if (rom[addr] === 0x29 && rom[addr + 1] === 0x29) {
        addStrideCandidate(
          addHLHL,
          `addhl:${addr}`,
          {
            addr,
            len: 2,
            bytes: bytesAt(addr, 2),
            type: 'ADD HL, HL pair',
            region: regionLabel(addr),
            purpose: 'possible HL * 4 index calculation near a 0x0222xx base load',
            detail: 'ADD HL, HL ; ADD HL, HL',
            context: formatContext(addr, 2),
          },
          loadHit,
        );
      }
    }

    for (let addr = start; addr <= end - 4; addr += 1) {
      if (
        rom[addr] === 0xCB &&
        rom[addr + 1] >= 0x20 &&
        rom[addr + 1] <= 0x27 &&
        rom[addr + 2] === 0xCB &&
        rom[addr + 3] === rom[addr + 1]
      ) {
        const regName = SLA_REG_NAMES[rom[addr + 1] & 0x07];
        addStrideCandidate(
          slaPairs,
          `sla:${addr}:${rom[addr + 1]}`,
          {
            addr,
            len: 4,
            bytes: bytesAt(addr, 4),
            type: 'SLA pair',
            region: regionLabel(addr),
            purpose: 'possible shift-left-twice index calculation near a 0x0222xx base load',
            detail: `SLA ${regName} ; SLA ${regName}`,
            context: formatContext(addr, 4),
          },
          loadHit,
        );
      }
    }
  }

  return {
    imm4Loads: sortByAddr(Array.from(imm4Loads.values())),
    addAA: sortByAddr(Array.from(addAA.values())),
    addHLHL: sortByAddr(Array.from(addHLHL.values())),
    slaPairs: sortByAddr(Array.from(slaPairs.values())),
  };
}

function findTargetedOps(target, opMap) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const mnemonic = opMap.get(rom[addr]);
    if (!mnemonic) {
      continue;
    }

    if (rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      hits.push({
        addr,
        len: 4,
        bytes: bytesAt(addr, 4),
        label: `${mnemonic} ${hex(target)}`,
        type: mnemonic.startsWith('CALL') ? 'call transfer' : 'jump transfer',
        region: regionLabel(addr),
        purpose: targetPurpose(target),
        detail: mnemonic,
        context: formatContext(addr, 4),
      });
    }
  }

  return hits;
}

function printSection(title) {
  console.log(title);
}

function printClassifiedHits(title, hits) {
  printSection(title);
  console.log(`hits=${hits.length}`);

  if (!hits.length) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const hit of hits) {
    const extras = [];
    if (hit.label) extras.push(`label=${hit.label}`);
    if (hit.mode) extras.push(`mode=${hit.mode}`);
    if (hit.target !== undefined) extras.push(`target=${hex(hit.target)}`);
    if (hit.detail) extras.push(`detail=${hit.detail}`);
    if (hit.refs) extras.push(`refs=${Array.from(hit.refs).sort().join(' | ')}`);

    console.log(
      `${hex(hit.addr)} bytes=${hit.bytes} type=${hit.type} region=${hit.region} purpose=${hit.purpose} ${extras.join(' ')} context=${hit.context}`,
    );
  }

  console.log('');
}

function printPatternGroup(title, patterns) {
  printSection(title);

  for (const spec of patterns) {
    printClassifiedHits(`--- ${spec.label} (${bytesAt(0, 0) || ''}${spec.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')}) ---`, findExactPatternHits(spec));
  }
}

function dumpRange(start, endExclusive) {
  printSection(`=== 5. ROM Byte Dump ${hex(start)}..${hex(endExclusive)} (end-exclusive) ===`);

  for (let addr = start; addr < endExclusive; addr += 16) {
    const width = Math.min(16, endExclusive - addr);
    const notes = [];

    if (addr <= ALT_BASE && ALT_BASE < addr + width) {
      notes.push('contains 0x022260');
    }
    if (addr <= TABLE_BASE && TABLE_BASE < addr + width) {
      notes.push('contains 0x022264 entry[0]');
    }

    const suffix = notes.length ? `  ; ${notes.join(', ')}` : '';
    console.log(`${hex(addr)}: ${bytesAt(addr, width)}${suffix}`);
  }

  console.log('');
}

function main() {
  console.log('Phase 258 probe: search ROM for runtime construction of vector-table base 0x022264');
  console.log(`ROM path=${ROM_PATH.pathname}`);
  console.log(`ROM bytes=${rom.length} expected=${ROM_EXPECTED_SIZE}`);
  if (rom.length !== ROM_EXPECTED_SIZE) {
    console.log('warning=ROM size does not match the expected 4,194,304 bytes');
  }
  console.log('');

  printSection('=== 1. Exact LD / Immediate Pattern Search For 0x022264 And Nearby Bases ===');
  for (const spec of REQUESTED_LOAD_PATTERNS) {
    const patternText = spec.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    printClassifiedHits(`--- ${spec.label} pattern=${patternText} ---`, findExactPatternHits(spec));
  }

  const pageLoadHits = find0222xxAddressLoads();
  const strideSignals = collectStrideCandidates(pageLoadHits);

  printSection('=== 2. Search For x4 Stride Computation Near 0x0222xx Address Loads ===');
  printClassifiedHits('--- 0x0222xx address-load candidates (ADL and z80 low-16 variants) ---', pageLoadHits);
  printClassifiedHits('--- LD r, 0x04 within +/-20 bytes of a 0x0222xx load ---', strideSignals.imm4Loads);
  printClassifiedHits('--- ADD A, A ; ADD A, A within +/-20 bytes ---', strideSignals.addAA);
  printClassifiedHits('--- ADD HL, HL ; ADD HL, HL within +/-20 bytes ---', strideSignals.addHLHL);
  printClassifiedHits('--- SLA r ; SLA r within +/-20 bytes ---', strideSignals.slaPairs);

  printSection('=== 3. First Vector-Entry Target Search For 0x05523D ===');
  for (const spec of REQUESTED_FIRST_TARGET_PATTERNS) {
    const patternText = spec.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    printClassifiedHits(`--- ${spec.label} pattern=${patternText} ---`, findExactPatternHits(spec));
  }

  const allCallSites05523D = findTargetedOps(FIRST_ENTRY_TARGET, CALL24_OPS);
  console.log(`all-call-sites-to-${hex(FIRST_ENTRY_TARGET)}=${allCallSites05523D.length}`);
  console.log('');
  printClassifiedHits('--- All 24-bit CALL forms targeting 0x05523D ---', allCallSites05523D);

  printSection('=== 4. Raw 24-bit Window Scan And Known-Table Comparison ===');
  printClassifiedHits('--- Any 3-byte window equal to 0x022264 (64 22 02) ---', findRaw24Windows(TABLE_BASE));
  printClassifiedHits('--- Any 3-byte window equal to 0x022260 (60 22 02) ---', findRaw24Windows(ALT_BASE));
  printClassifiedHits('--- Control comparison: any 3-byte window equal to 0x08C958 (58 C9 08) ---', findRaw24Windows(CONTROL_TABLE));

  dumpRange(HEADER_DUMP_START, HEADER_DUMP_END);
}

main();
