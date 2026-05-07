#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const BUF_INSERT = 0x05E2A0;
const CXMAIN_MIN = 0x058000;
const CXMAIN_MAX = 0x058FFF;
const CONTEXT_BYTES = 16;
const GATE_WINDOW_BYTES = 64;
const MAX_GATE_ROWS = 64;

const KNOWN_CXMAIN_SITES = new Set([
  0x058520,
  0x05852A,
  0x05853C,
  0x0585AD,
  0x0585CA,
  0x058AC9,
]);

const MATCH_SPECS = [
  {
    key: 'adl-call',
    label: 'ADL CALL 0x05E2A0',
    opcode: 'CALL',
    pattern: [0xCD, 0xA0, 0xE2, 0x05],
    length: 4,
    mode: 'adl',
  },
  {
    key: 'adl-jp',
    label: 'ADL JP 0x05E2A0',
    opcode: 'JP',
    pattern: [0xC3, 0xA0, 0xE2, 0x05],
    length: 4,
    mode: 'adl',
  },
  {
    key: 'z80-call',
    label: 'Z80 CALL 0xE2A0 (MBASE=0x05 => 0x05E2A0)',
    opcode: 'CALL',
    pattern: [0xCD, 0xA0, 0xE2],
    length: 3,
    mode: 'z80',
  },
];

const CONDITIONAL_TAGS = new Set([
  'jr-conditional',
  'jp-conditional',
  'call-conditional',
  'ret-conditional',
  'djnz',
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function sliceHex(buffer, start, length) {
  if (length <= 0) return '';
  return bytesToHex(buffer.slice(start, start + length));
}

function matchPattern(buffer, address, pattern) {
  if (address + pattern.length > buffer.length) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if ((buffer[address + index] & 0xFF) !== pattern[index]) return false;
  }
  return true;
}

function scanPattern(buffer, pattern) {
  const matches = [];
  for (let address = 0; address <= buffer.length - pattern.length; address += 1) {
    if (matchPattern(buffer, address, pattern)) matches.push(address);
  }
  return matches;
}

function classifyRegion(address) {
  if (address >= 0x000000 && address < 0x010000) return 'vectors';
  if (address >= 0x010000 && address < 0x050000) return 'OS core';
  if (address >= 0x050000 && address < 0x060000) return 'cxMain/editor';
  if (address >= 0x060000 && address < 0x080000) return 'display/error';
  if (address >= 0x080000 && address < 0x0A0000) return 'FP/validation';
  if (address >= 0x0A0000 && address < 0x0C0000) return 'apps/Y=';
  return 'extended ROM';
}

function prefixText(inst) {
  return inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = prefixText(inst);

  switch (inst.tag) {
    case 'nop':
      return `${prefix}NOP`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') {
        return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
      }
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-ind':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-pair':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-load-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-store-reg':
      return `${prefix}LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-store-imm':
      return `${prefix}LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'indexed-alu':
      return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-inc':
      return `${prefix}INC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-dec':
      return `${prefix}DEC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hexByte(inst.target)}`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function decodeRowsLinear(buffer, start, stopExclusive, mode) {
  const rows = [];
  let pc = start;

  while (pc < stopExclusive && rows.length < MAX_GATE_ROWS) {
    const inst = decodeInstruction(buffer, pc, mode);
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      tag: inst.tag,
      length,
      bytes: sliceHex(buffer, pc, length),
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function analyzeGate(buffer, site, spec) {
  const windowStart = Math.max(0, site - GATE_WINDOW_BYTES);
  const rawCpSites = [];

  for (let address = windowStart; address <= site - 2; address += 1) {
    if ((buffer[address] & 0xFF) === 0xFE && (buffer[address + 1] & 0xFF) === 0x5A) {
      rawCpSites.push(address);
    }
  }

  const aligned = [];
  for (const cpSite of rawCpSites) {
    const rows = decodeRowsLinear(buffer, cpSite, site + spec.length + CONTEXT_BYTES, spec.mode);
    const siteIndex = rows.findIndex((row) => row.pc === site);
    if (siteIndex === -1) continue;

    const pathRows = rows.slice(0, siteIndex + 1);
    const conditionalRows = pathRows.filter((row) =>
      row.pc > cpSite && row.pc < site && CONDITIONAL_TAGS.has(row.tag)
    );

    aligned.push({
      cpSite,
      pathRows,
      conditionalRows,
      distance: site - cpSite,
    });
  }

  aligned.sort((left, right) =>
    left.distance - right.distance || right.conditionalRows.length - left.conditionalRows.length
  );

  if (aligned.length > 0) {
    const best = aligned[0];
    const branchSummary = best.conditionalRows.length > 0
      ? `conditional flow seen after the compare (${best.conditionalRows.map((row) => `${hex(row.pc)} ${row.text}`).join('; ')})`
      : 'no conditional branch decoded between the compare and the site';

    return {
      found: true,
      aligned: true,
      cpSite: best.cpSite,
      summary: `CP 0x5A at ${hex(best.cpSite)}; ${branchSummary}. The BufInsert instruction itself is an unconditional ${spec.opcode}.`,
      pathRows: best.pathRows,
    };
  }

  if (rawCpSites.length > 0) {
    return {
      found: true,
      aligned: false,
      cpSite: rawCpSites[rawCpSites.length - 1],
      summary: `Raw FE 5A appears within ${GATE_WINDOW_BYTES} bytes at ${hex(rawCpSites[rawCpSites.length - 1])}, but a linear ${spec.mode.toUpperCase()} decode from that compare does not land on this site. The BufInsert instruction itself is an unconditional ${spec.opcode}.`,
      pathRows: [],
    };
  }

  return {
    found: false,
    aligned: false,
    cpSite: null,
    summary: `No CP 0x5A appears within the previous ${GATE_WINDOW_BYTES} bytes. This is an unconditional ${spec.opcode} site in the scanned encoding set.`,
    pathRows: [],
  };
}

function buildHit(buffer, address, spec) {
  const beforeStart = Math.max(0, address - CONTEXT_BYTES);
  const beforeLength = address - beforeStart;
  const afterStart = address + spec.length;
  const afterLength = Math.min(CONTEXT_BYTES, buffer.length - afterStart);

  return {
    address,
    spec,
    region: classifyRegion(address),
    insideCxMain: address >= CXMAIN_MIN && address <= CXMAIN_MAX,
    knownCxMain: KNOWN_CXMAIN_SITES.has(address),
    beforeHex: sliceHex(buffer, beforeStart, beforeLength),
    instructionHex: sliceHex(buffer, address, spec.length),
    afterHex: sliceHex(buffer, afterStart, afterLength),
    gate: analyzeGate(buffer, address, spec),
  };
}

function collectHits(buffer) {
  const rawHits = {
    'adl-call': scanPattern(buffer, MATCH_SPECS[0].pattern),
    'adl-jp': scanPattern(buffer, MATCH_SPECS[1].pattern),
    'z80-call': scanPattern(buffer, MATCH_SPECS[2].pattern),
  };

  const adlCallSet = new Set(rawHits['adl-call']);
  const uniqueZ80Calls = rawHits['z80-call'].filter((address) => !adlCallSet.has(address));

  const hits = [
    ...rawHits['adl-call'].map((address) => buildHit(buffer, address, MATCH_SPECS[0])),
    ...rawHits['adl-jp'].map((address) => buildHit(buffer, address, MATCH_SPECS[1])),
    ...uniqueZ80Calls.map((address) => buildHit(buffer, address, MATCH_SPECS[2])),
  ].sort((left, right) => left.address - right.address);

  return {
    rawHits,
    uniqueZ80Calls,
    suppressedZ80OverlapCount: rawHits['z80-call'].length - uniqueZ80Calls.length,
    hits,
  };
}

function formatAddressList(addresses) {
  if (addresses.length === 0) return 'none';
  return addresses.map((address) => hex(address)).join(', ');
}

function formatPathRows(rows, site) {
  return rows.map((row) => {
    const marker = row.pc === site ? ' <site>' : '';
    return `    ${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')}  ${row.text}${marker}`;
  });
}

function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const rom = fs.readFileSync(ROM_PATH);
  const { rawHits, uniqueZ80Calls, suppressedZ80OverlapCount, hits } = collectHits(rom);

  const knownFound = [...KNOWN_CXMAIN_SITES].filter((address) =>
    hits.some((hit) => hit.address === address)
  ).sort((left, right) => left - right);
  const knownMissing = [...KNOWN_CXMAIN_SITES].filter((address) =>
    !hits.some((hit) => hit.address === address)
  ).sort((left, right) => left - right);
  const outsideCxMain = hits.filter((hit) => !hit.insideCxMain);

  const lines = [];
  lines.push('Phase 208 BufInsert call-site sweep');
  lines.push(`ROM: ${ROM_PATH}`);
  lines.push(`BufInsert target: ${hex(BUF_INSERT)}`);
  lines.push(`ROM size: ${rom.length} bytes`);
  lines.push('');
  lines.push('Summary');
  lines.push(`  Unique reported sites: ${hits.length}`);
  lines.push(`  ADL CALL raw matches (${bytesToHex(MATCH_SPECS[0].pattern)}): ${rawHits['adl-call'].length}`);
  lines.push(`  ADL JP raw matches   (${bytesToHex(MATCH_SPECS[1].pattern)}): ${rawHits['adl-jp'].length}`);
  lines.push(`  Z80 CALL raw matches (${bytesToHex(MATCH_SPECS[2].pattern)}): ${rawHits['z80-call'].length}`);
  lines.push(`  Z80 CALL unique after ADL overlap suppression: ${uniqueZ80Calls.length} (${suppressedZ80OverlapCount} overlap ADL CALL)`);
  lines.push(`  Known cxMain sites found: ${formatAddressList(knownFound)}`);
  lines.push(`  Known cxMain sites missing: ${formatAddressList(knownMissing)}`);
  lines.push('');
  lines.push(`Outside 0x058000-0x058FFF (${outsideCxMain.length})`);

  if (outsideCxMain.length === 0) {
    lines.push('  none');
  } else {
    for (const hit of outsideCxMain) {
      lines.push(`  ${hex(hit.address)} | ${hit.spec.label} | ${hit.region}`);
      lines.push(`    Gate check: ${hit.gate.summary}`);
    }
  }

  lines.push('');
  lines.push(`All call sites (${hits.length})`);

  for (const hit of hits) {
    const locationBits = [
      hit.spec.label,
      hit.region,
      hit.insideCxMain ? 'inside 0x058000-0x058FFF' : 'OUTSIDE 0x058000-0x058FFF',
    ];
    if (hit.knownCxMain) locationBits.push('known session-202 cxMain site');

    lines.push(`${hex(hit.address)} | ${locationBits.join(' | ')}`);
    lines.push(`  before16: ${hit.beforeHex || '(start of ROM)'}`);
    lines.push(`  instr:    ${hit.instructionHex}`);
    lines.push(`  after16:  ${hit.afterHex || '(end of ROM)'}`);
    lines.push(`  gate:     ${hit.gate.summary}`);

    if (hit.gate.pathRows.length > 0) {
      lines.push('  gate path:');
      lines.push(...formatPathRows(hit.gate.pathRows, hit.address));
    }
  }

  console.log(lines.join('\n'));
}

main();
