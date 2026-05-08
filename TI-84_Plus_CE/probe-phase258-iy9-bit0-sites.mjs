#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;
const TARGET_OFFSET = 0x09;
const TARGET_ADDR = IY_BASE + TARGET_OFFSET;
const CONTEXT_RADIUS = 16;
const DECODE_BEFORE = 5;
const DECODE_AFTER = 5;
const PREV_LOOKBACK = 8;
const SIS_MBASE = 0xD0;

const PATTERNS = [
  {
    type: 'SET',
    classification: 'SET (armer)',
    label: 'SET 0,(IY+9)',
    bytes: [0xFD, 0xCB, 0x09, 0xC6],
  },
  {
    type: 'RES',
    classification: 'RES (disarmer)',
    label: 'RES 0,(IY+9)',
    bytes: [0xFD, 0xCB, 0x09, 0x86],
  },
  {
    type: 'BIT',
    classification: 'BIT (tester)',
    label: 'BIT 0,(IY+9)',
    bytes: [0xFD, 0xCB, 0x09, 0x46],
  },
  {
    type: 'LD',
    classification: 'LD (direct write)',
    label: 'LD (0xD00089),A',
    bytes: [0x32, 0x89, 0x00, 0xD0],
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function signedByte(value) {
  const v = value & 0xFF;
  return v & 0x80 ? v - 0x100 : v;
}

function formatDisp(value) {
  const disp = signedByte(value);
  return disp >= 0 ? `+${disp}` : `${disp}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function sliceBytes(start, length) {
  const sliceStart = Math.max(0, start);
  const sliceEnd = Math.min(rom.length, sliceStart + length);
  return rom.subarray(sliceStart, sliceEnd);
}

function regionBucket(addr) {
  return `0x${((addr >>> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}xxxx`;
}

function decodeSafe(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    return {
      ...inst,
      nextPc: inst.pc + (inst.length || 1),
    };
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
      modePrefix: null,
    };
  }
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if ((inst.modePrefix === 'sis' || inst.modePrefix === 'lis') && inst.addr < 0x10000) {
    return (((SIS_MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  if (inst.tag === 'decode-error') return `decode-error: ${inst.errorMessage}`;

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${String(inst.condition).toUpperCase()}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.pair}`;
    case 'ld-pair-ind': return `${prefix}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${prefix}ld (${inst.dest}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': {
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    }
    case 'ld-ixd-reg': {
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`;
    }
    case 'ld-ixd-imm': {
      return `${prefix}ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${hexByte(inst.value)}`;
    }
    case 'indexed-cb-bit': {
      return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    }
    case 'indexed-cb-set': {
      return `${prefix}set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    }
    case 'indexed-cb-res': {
      return `${prefix}res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    }
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    case 'slp': return `${prefix}slp`;
    case 'lea': return `${prefix}lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function bytesAt(pc, length) {
  return bytesToHex(sliceBytes(pc, length));
}

function previousInstruction(targetPc) {
  const start = Math.max(0, targetPc - PREV_LOOKBACK);
  for (let pc = start; pc < targetPc; pc += 1) {
    const inst = decodeSafe(pc);
    if (inst.nextPc === targetPc) return inst;
  }
  return null;
}

function collectBefore(targetPc, count) {
  const rows = [];
  let current = targetPc;
  for (let index = 0; index < count; index += 1) {
    const inst = previousInstruction(current);
    if (!inst) break;
    rows.push(inst);
    current = inst.pc;
  }
  return rows.reverse();
}

function collectAfter(targetPc, count) {
  const rows = [];
  let pc = targetPc;
  for (let index = 0; index < count && pc < rom.length; index += 1) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.nextPc;
  }
  return rows;
}

function formatDecodeWindow(targetPc) {
  const rows = [
    ...collectBefore(targetPc, DECODE_BEFORE),
    ...collectAfter(targetPc, DECODE_AFTER + 1),
  ];

  return rows.map((inst) => {
    const marker = inst.pc === targetPc ? '=>' : '  ';
    const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
    return `${marker} ${hex(inst.pc)}  ${bytes} ${formatInstruction(inst)}`;
  });
}

function rawContext(addr, length) {
  const beforeStart = Math.max(0, addr - CONTEXT_RADIUS);
  const afterStart = addr + length;

  return {
    start: beforeStart,
    end: Math.min(rom.length, afterStart + CONTEXT_RADIUS) - 1,
    before: bytesToHex(sliceBytes(beforeStart, addr - beforeStart)),
    site: bytesToHex(sliceBytes(addr, length)),
    after: bytesToHex(sliceBytes(afterStart, CONTEXT_RADIUS)),
  };
}

function scanPattern(spec) {
  const hits = [];
  const length = spec.bytes.length;

  for (let addr = 0; addr <= rom.length - length; addr += 1) {
    let matched = true;
    for (let index = 0; index < length; index += 1) {
      if (rom[addr + index] !== spec.bytes[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    hits.push({
      type: spec.type,
      classification: spec.classification,
      label: spec.label,
      addr,
      length,
      region: regionBucket(addr),
      raw: rawContext(addr, length),
      decode: formatDecodeWindow(addr),
    });
  }

  return hits;
}

function printTypeSection(type, hits) {
  console.log(`--- ${type} sites (${hits.length}) ---`);
  if (!hits.length) {
    console.log('none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${hit.classification}  ${hit.label}  region=${hit.region}`);
    console.log(`  raw context ${hex(hit.raw.start)}-${hex(hit.raw.end)}`);
    console.log(`    before: ${hit.raw.before || '(start of ROM)'}`);
    console.log(`    site:   ${hit.raw.site}`);
    console.log(`    after:  ${hit.raw.after || '(end of ROM)'}`);
    console.log('  nearby decode:');
    for (const line of hit.decode) {
      console.log(`    ${line}`);
    }
    console.log();
  }
}

function printSummary(allHits) {
  const counts = new Map();
  const byRegion = new Map();

  for (const hit of allHits) {
    counts.set(hit.type, (counts.get(hit.type) ?? 0) + 1);

    const regionEntry = byRegion.get(hit.region) ?? new Map();
    const typedList = regionEntry.get(hit.type) ?? [];
    typedList.push(hex(hit.addr));
    regionEntry.set(hit.type, typedList);
    byRegion.set(hit.region, regionEntry);
  }

  console.log('=== Summary ===');
  console.log('Totals by type:');
  for (const type of ['SET', 'RES', 'BIT', 'LD']) {
    console.log(`  ${type}: ${counts.get(type) ?? 0}`);
  }
  console.log();

  console.log('Addresses by region:');
  const regions = [...byRegion.keys()].sort();
  if (!regions.length) {
    console.log('  none');
    return;
  }

  for (const region of regions) {
    const regionEntry = byRegion.get(region);
    const parts = [];
    for (const type of ['SET', 'RES', 'BIT', 'LD']) {
      const addresses = regionEntry.get(type) ?? [];
      if (!addresses.length) continue;
      parts.push(`${type}=[${addresses.join(', ')}]`);
    }
    console.log(`  ${region}: ${parts.join('  ')}`);
  }
}

function main() {
  const hitsByType = new Map(PATTERNS.map((spec) => [spec.type, scanPattern(spec)]));
  const allHits = [...hitsByType.values()].flat().sort((left, right) => left.addr - right.addr);

  console.log('=== Phase 258: IY+9 bit 0 static site scan ===');
  console.log(`ROM size: ${rom.length} bytes`);
  console.log(`IY base: ${hex(IY_BASE)}  target byte: ${hex(TARGET_ADDR)}  offset: ${hexByte(TARGET_OFFSET)}`);
  console.log('Direct-write scan uses the corrected ADL encoding `32 89 00 D0` for `LD (0xD00089),A`.');
  console.log();

  for (const type of ['SET', 'RES', 'BIT', 'LD']) {
    printTypeSection(type, hitsByType.get(type) ?? []);
  }

  printSummary(allHits);
}

main();
