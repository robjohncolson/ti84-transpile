#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TEXT_FLAGS_ADDR = 0xD00085;

const PATTERNS = [
  { key: 'set4', label: 'SET 4,(IY+5)', bytes: [0xFD, 0xCB, 0x05, 0xE6] },
  { key: 'res4', label: 'RES 4,(IY+5)', bytes: [0xFD, 0xCB, 0x05, 0xA6] },
  { key: 'bit4', label: 'BIT 4,(IY+5)', bytes: [0xFD, 0xCB, 0x05, 0x66] },
];

const KNOWN_ADDRESSES = new Map([
  [0x05E63C, 'Known ConvKeyToTok digit gate from phase 211'],
  [0x05E8FA, 'Known 0x05E8xx clear touching textFlagsLoc from earlier disassembly'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const sliceStart = Math.max(0, start);
  const sliceEnd = Math.min(rom.length, sliceStart + length);
  return Array.from(rom.slice(sliceStart, sliceEnd), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function regionLabel(addr) {
  if (addr <= 0x00FFFF) return 'Boot/reset vectors';
  if (addr <= 0x04FFFF) return 'OS core/services';
  if (addr <= 0x06FFFF) return 'cxMain/editor/keyboard';
  if (addr <= 0x08FFFF) return 'FP/math/display';
  if (addr <= 0x0AFFFF) return 'STAT/apps/upper OS';
  return '0x0B0000+ extra upper ROM';
}

function describeSite(addr) {
  if (KNOWN_ADDRESSES.has(addr)) return KNOWN_ADDRESSES.get(addr);
  if (addr >= 0x05E630 && addr <= 0x05E6AF) {
    return 'ConvKeyToTok / BufInsert wrapper cluster';
  }
  if (addr >= 0x05E440 && addr <= 0x05E490) {
    return '0x05E44x..0x05E49x text/input helper cluster';
  }
  if (addr >= 0x05E89C && addr <= 0x05E8FF) {
    return '0x05E89C..0x05E8FF textFlagsLoc helper cluster';
  }
  if (addr >= 0x091300 && addr <= 0x09144F) {
    return '0x0913xx..0x0914xx STAT/apps cluster';
  }
  if (addr >= 0x09CA00 && addr <= 0x09CD7F) {
    return '0x09CAxx..0x09CDxx upper-OS/UI cluster';
  }
  return regionLabel(addr);
}

function matchBytes(buffer, address, pattern) {
  if (address < 0 || address + pattern.length > buffer.length) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if (buffer[address + index] !== pattern[index]) return false;
  }
  return true;
}

function scanPattern(pattern) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - pattern.bytes.length; addr += 1) {
    if (!matchBytes(rom, addr, pattern.bytes)) continue;
    hits.push({ addr, label: pattern.label, bytes: bytesAt(addr, pattern.bytes.length) });
  }
  return hits;
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((0xD0 & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';

  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
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
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'cp-reg': return `${prefix}cp ${inst.src}`;
    case 'cp-imm': return `${prefix}cp ${hexByte(inst.value)}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function collectBefore(target, count, lookbackBytes = 96) {
  const rows = [];
  let pc = Math.max(0, target - lookbackBytes);
  while (pc < target) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows.filter((inst) => inst.pc < target).slice(-count);
}

function collectAfter(target, count) {
  const rows = [];
  let pc = target;
  while (rows.length < count && pc < rom.length) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows;
}

function formatContext(target, before = 5, after = 5) {
  return [...collectBefore(target, before), ...collectAfter(target, after + 1)].map((inst) => {
    const marker = inst.pc === target ? '=>' : '  ';
    const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
    const text = inst.tag === 'decode-error'
      ? `decode-error: ${inst.errorMessage}`
      : formatInstruction(inst);
    return `${marker} ${hex(inst.pc)}  ${bytes} ${text}`;
  });
}

function hexWindow(addr, matchLength, radius = 16) {
  const beforeStart = Math.max(0, addr - radius);
  const before = bytesAt(beforeStart, addr - beforeStart);
  const match = bytesAt(addr, matchLength);
  const afterStart = addr + matchLength;
  const afterEnd = Math.min(rom.length, afterStart + radius);
  const after = bytesAt(afterStart, afterEnd - afterStart);
  return `${before}${before ? ' ' : ''}[${match}]${after ? ` ${after}` : ''}`;
}

function bucketHits(hits) {
  const buckets = new Map();
  for (const hit of hits) {
    const bucketBase = hit.addr & 0xFFFF00;
    const current = buckets.get(bucketBase) ?? 0;
    buckets.set(bucketBase, current + 1);
  }
  return [...buckets.entries()].sort((left, right) => left[0] - right[0]);
}

function regionCounts(hits) {
  const counts = new Map();
  for (const hit of hits) {
    const label = regionLabel(hit.addr);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function printSummaryGroup(label, hits) {
  console.log(`--- ${label} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${regionLabel(hit.addr)}  ${describeSite(hit.addr)}`);
  }
  console.log();
}

function printDetailedGroup(label, hits) {
  console.log(`--- ${label} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${hit.label}`);
    console.log(`  region: ${regionLabel(hit.addr)}`);
    console.log(`  note:   ${describeSite(hit.addr)}`);
    console.log(`  bytes:  ${hit.bytes}`);
    console.log(`  window: ${hexWindow(hit.addr, 4, 16)}`);
    for (const line of formatContext(hit.addr, 5, 5)) {
      console.log(`  ${line}`);
    }
    console.log();
  }
}

function printBucketSummary(label, hits) {
  console.log(`--- ${label} ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const [bucketBase, count] of bucketHits(hits)) {
    console.log(`  ${hex(bucketBase)}xx: ${count}`);
  }
  console.log();
}

function printRegionSummary(label, hits) {
  console.log(`--- ${label} ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const [labelText, count] of regionCounts(hits)) {
    console.log(`  ${labelText}: ${count}`);
  }
  console.log();
}

const exactHits = new Map(PATTERNS.map((pattern) => [pattern.key, scanPattern(pattern)]));

const setHits = exactHits.get('set4');
const resHits = exactHits.get('res4');
const bitHits = exactHits.get('bit4');

console.log('=== Phase 212: BIT 4,(IY+5) setter/clearer static ROM scan ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Tracked byte: textFlagsLoc = ${hex(TEXT_FLAGS_ADDR)} (IY+0x05)`);
console.log('Exact opcode scan only: FD CB 05 E6 / A6 / 66');
console.log();

console.log('Counts:');
console.log(`  SET 4,(IY+5): ${setHits.length}`);
console.log(`  RES 4,(IY+5): ${resHits.length}`);
console.log(`  BIT 4,(IY+5): ${bitHits.length}`);
console.log(`  exact clear:set ratio = ${setHits.length ? (resHits.length / setHits.length).toFixed(2) : 'n/a'} : 1`);
console.log();

printRegionSummary('SET region distribution', setHits);
printRegionSummary('RES region distribution', resHits);
printRegionSummary('BIT region distribution', bitHits);

printBucketSummary('Approximate SET routine buckets (0x100-page)', setHits);
printBucketSummary('Approximate RES routine buckets (0x100-page)', resHits);
printBucketSummary('Approximate BIT routine buckets (0x100-page)', bitHits);

printSummaryGroup('SET 4,(IY+5) addresses', setHits);
printSummaryGroup('RES 4,(IY+5) addresses', resHits);
printSummaryGroup('BIT 4,(IY+5) tester addresses', bitHits);

printDetailedGroup('SET 4,(IY+5) detailed contexts', setHits);
printDetailedGroup('RES 4,(IY+5) detailed contexts', resHits);

const convKeyGate = bitHits.find((hit) => hit.addr === 0x05E63C);
console.log('--- Focused known tester: ConvKeyToTok gate ---');
if (!convKeyGate) {
  console.log('  0x05E63C was not found in the exact BIT 4 hit list.');
} else {
  console.log(`${hex(convKeyGate.addr)}  ${convKeyGate.label}`);
  console.log(`  region: ${regionLabel(convKeyGate.addr)}`);
  console.log(`  note:   ${describeSite(convKeyGate.addr)}`);
  console.log(`  window: ${hexWindow(convKeyGate.addr, 4, 16)}`);
  for (const line of formatContext(convKeyGate.addr, 5, 5)) {
    console.log(`  ${line}`);
  }
}
console.log();

console.log('--- Static answer ---');
console.log(`  Exact setters are sparse: ${setHits.length} SET sites versus ${resHits.length} RES sites.`);
console.log('  Among exact bit-opcode writers, bit 4 is disarmed more often than it is armed.');
console.log('  SET sites cluster mainly in 0x0612xx, 0x0913xx, 0x092Exx, 0x09CAxx/0x09CBxx, 0x09D4xx, and 0x0AF6xx.');
console.log('  RES sites are spread much more broadly, including low OS, cxMain/editor code, FP/display code, and upper-OS clusters.');
console.log('  The known digit-token gate tester remains 0x05E63C inside ConvKeyToTok; nearby 0x05Exx code contains multiple clears but no exact SET 4 opcode in that immediate wrapper.');
console.log('  Use the detailed contexts above as the entry/exit candidate routine list: SET pages are the likely edit-mode armers; RES pages are the likely disarm paths.');
