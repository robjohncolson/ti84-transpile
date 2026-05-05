#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(ROM_PATH);

const MBASE = 0xD0;

const HOME_SCAN_START = 0x058460;
const HOME_SCAN_SPLIT = 0x058700;
const HOME_SCAN_END = 0x058D00;

const TOKEN_AREA_START = 0xD02300;
const TOKEN_STAGING = 0xD0230E;
const TOKEN_AREA_END = 0xD02310;
const CONV_KEY_TO_TOK = 0x05C52C;
const CALL_WINDOW_BYTES = 20;

const CALL_OPCODES = new Set([0xC4, 0xCC, 0xCD, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
const BLOCK_COPY_TAGS = new Set(['ldi', 'ldir', 'ldd', 'lddr']);
const CONTROL_FLOW_TAGS = new Set([
  'call',
  'call-conditional',
  'djnz',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
  'rst',
]);

const EXACT_TOKEN_BYTES = le24(TOKEN_STAGING);
const NEARBY_TOKEN_PATTERNS = [];
for (let addr = TOKEN_AREA_START; addr <= TOKEN_AREA_END; addr += 1) {
  NEARBY_TOKEN_PATTERNS.push({ addr, pattern: le24(addr) });
}

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) => hexByte(value)).join(' ');
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function le24(value) {
  return [value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF];
}

function withinTokenArea(addr) {
  return Number.isInteger(addr) && addr >= TOKEN_AREA_START && addr <= TOKEN_AREA_END;
}

function describeTokenAddr(addr) {
  if (!Number.isInteger(addr)) return 'unknown';
  if (addr === TOKEN_STAGING) return `${hex(addr)} (TOKEN_STAGING)`;
  if (withinTokenArea(addr)) return `${hex(addr)} (nearby token area)`;
  return hex(addr);
}

function containsPattern(bytes, pattern) {
  if (bytes.length < pattern.length) return false;
  for (let offset = 0; offset <= bytes.length - pattern.length; offset += 1) {
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (bytes[offset + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function matchingNearbyByteAddrs(bytes) {
  const hits = [];
  for (const entry of NEARBY_TOKEN_PATTERNS) {
    if (containsPattern(bytes, entry.pattern)) hits.push(entry.addr);
  }
  return hits;
}

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const mode = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const h = (value, width = 6) => hex(value, width);

  switch (inst.tag) {
    case 'nop': return `${mode}nop`;
    case 'call': return `${mode}call ${h(inst.target)}`;
    case 'call-conditional': return `${mode}call ${inst.condition}, ${h(inst.target)}`;
    case 'jp': return `${mode}jp ${h(inst.target)}`;
    case 'jp-conditional': return `${mode}jp ${inst.condition}, ${h(inst.target)}`;
    case 'jp-indirect': return `${mode}jp (${inst.indirectRegister})`;
    case 'jr': return `${mode}jr ${h(inst.target)}`;
    case 'jr-conditional': return `${mode}jr ${inst.condition}, ${h(inst.target)}`;
    case 'djnz': return `${mode}djnz ${h(inst.target)}`;
    case 'ret': return `${mode}ret`;
    case 'ret-conditional': return `${mode}ret ${inst.condition}`;
    case 'push': return `${mode}push ${inst.pair}`;
    case 'pop': return `${mode}pop ${inst.pair}`;
    case 'inc-pair': return `${mode}inc ${inst.pair}`;
    case 'dec-pair': return `${mode}dec ${inst.pair}`;
    case 'inc-reg': return `${mode}inc ${inst.reg}`;
    case 'dec-reg': return `${mode}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${mode}ld ${inst.pair}, ${h(inst.value)}`;
    case 'ld-pair-mem': return `${mode}ld ${inst.pair}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${mode}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${mode}ld ${inst.dest}, ${h(inst.value, 2)}`;
    case 'ld-reg-reg': return `${mode}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${mode}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${mode}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${mode}ld ${inst.dest}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${mode}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${mode}ld ${inst.dest}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'ld-ixd-reg': return `${mode}ld (${inst.indexRegister}${signed(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${mode}ld (${inst.indexRegister}${signed(inst.displacement)}), ${h(inst.value, 2)}`;
    case 'ld-ind-imm': return `${mode}ld (hl), ${h(inst.value, 2)}`;
    case 'ld-pair-indexed': return `${mode}ld ${inst.pair}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'ld-indexed-pair': return `${mode}ld (${inst.indexRegister}${signed(inst.displacement)}), ${inst.pair}`;
    case 'ld-pair-ind': return `${mode}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${mode}ld (${inst.dest}), ${inst.pair}`;
    case 'lea': return `${mode}lea ${inst.dest}, ${inst.base}${signed(inst.displacement)}`;
    case 'alu-imm': return `${mode}${inst.op} ${h(inst.value, 2)}`;
    case 'alu-reg': return `${mode}${inst.op} ${inst.src}`;
    case 'add-pair': return `${mode}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${mode}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${mode}sbc hl, ${inst.src}`;
    case 'bit-test': return `${mode}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${mode}bit ${inst.bit}, (hl)`;
    case 'indexed-cb-bit': return `${mode}bit ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'indexed-cb-res': return `${mode}res ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'indexed-cb-set': return `${mode}set ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'ldi': return `${mode}ldi`;
    case 'ldir': return `${mode}ldir`;
    case 'ldd': return `${mode}ldd`;
    case 'lddr': return `${mode}lddr`;
    case 'rst': return `${mode}rst ${h(inst.target, 2)}`;
    case 'di': return `${mode}di`;
    case 'ei': return `${mode}ei`;
    case 'halt': return `${mode}halt`;
    case 'ex-af': return `${mode}ex af, af'`;
    case 'ex-de-hl': return `${mode}ex de, hl`;
    case 'exx': return `${mode}exx`;
    default: return `${mode}${inst.tag}`;
  }
}

function decodeRow(pc, mode = 'adl') {
  try {
    const inst = decodeInstruction(romBytes, pc, mode);
    return {
      pc,
      length: inst.length,
      bytes: Array.from(romBytes.slice(pc, pc + inst.length)),
      raw: hexBytes(romBytes, pc, inst.length),
      inst,
      text: formatInstruction(inst),
    };
  } catch (error) {
    return {
      pc,
      length: 1,
      bytes: [romBytes[pc] ?? 0],
      raw: hexBytes(romBytes, pc, 1),
      inst: null,
      text: `DECODE ERROR: ${error.message}`,
    };
  }
}

function disassembleRange(start, end, mode = 'adl') {
  const rows = [];
  for (let pc = start; pc < end; ) {
    const row = decodeRow(pc, mode);
    rows.push(row);
    pc += Math.max(row.length, 1);
  }
  return rows;
}

function inspectInterestingRow(row) {
  if (!row.inst) return null;

  const reasons = new Set();
  const resolvedAddr = memAddr(row.inst);

  if (resolvedAddr === TOKEN_STAGING) {
    reasons.add('absolute memory = TOKEN_STAGING');
  } else if (withinTokenArea(resolvedAddr)) {
    reasons.add(`absolute memory = ${hex(resolvedAddr)}`);
  }

  if (Number.isInteger(row.inst.value)) {
    const immediate = row.inst.value >>> 0;
    if (immediate === TOKEN_STAGING) {
      reasons.add('immediate = TOKEN_STAGING');
    } else if (withinTokenArea(immediate)) {
      reasons.add(`immediate = ${hex(immediate)}`);
    }
  }

  if (Number.isInteger(row.inst.target)) {
    const target = row.inst.target >>> 0;
    if (target === TOKEN_STAGING) {
      reasons.add('target = TOKEN_STAGING');
    } else if (withinTokenArea(target)) {
      reasons.add(`target = ${hex(target)}`);
    }
  }

  if (containsPattern(row.bytes, EXACT_TOKEN_BYTES)) {
    reasons.add('raw bytes contain 0E 23 D0');
  }

  const nearbyByteHits = matchingNearbyByteAddrs(row.bytes)
    .filter((addr) => addr !== TOKEN_STAGING)
    .map((addr) => hex(addr));
  if (nearbyByteHits.length > 0) {
    reasons.add(`raw bytes contain nearby token-area addr(s): ${nearbyByteHits.join(', ')}`);
  }

  if (BLOCK_COPY_TAGS.has(row.inst.tag)) {
    reasons.add('block-copy op');
  }

  if (reasons.size === 0) return null;
  return { ...row, reasons: [...reasons] };
}

function isMemoryStoreFrom(inst, src) {
  if (!inst) return false;
  return (
    (inst.tag === 'ld-ind-reg' && inst.src === src) ||
    (inst.tag === 'ld-ixd-reg' && inst.src === src) ||
    (inst.tag === 'ld-mem-reg' && inst.src === src)
  );
}

function storeDestDescription(inst) {
  if (!inst) return 'unknown';
  if (inst.tag === 'ld-ind-reg') return `(${inst.dest})`;
  if (inst.tag === 'ld-ixd-reg') return `(${inst.indexRegister}${signed(inst.displacement)})`;
  if (inst.tag === 'ld-mem-reg') return `(${hex(memAddr(inst) ?? inst.addr)})`;
  if (inst.tag === 'ld-ind-imm') return '(hl)';
  if (inst.tag === 'ld-ixd-imm') return `(${inst.indexRegister}${signed(inst.displacement)})`;
  return inst.tag;
}

function resolvedStoreAddr(inst, pointerBase = null) {
  if (!inst) return null;
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    return memAddr(inst);
  }
  if ((inst.tag === 'ld-ind-reg' || inst.tag === 'ld-ind-imm') && Number.isInteger(pointerBase)) {
    return pointerBase >>> 0;
  }
  if ((inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm') && Number.isInteger(pointerBase)) {
    return (pointerBase + inst.displacement) >>> 0;
  }
  return null;
}

function dedupeMatches(matches) {
  const seen = new Set();
  const result = [];
  for (const match of matches) {
    const key = `${match.kind}|${match.rows.map((row) => row.pc).join(',')}|${match.resolvedAddr ?? 'na'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

function findEStorePatterns(rows) {
  const matches = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.inst) continue;

    if (isMemoryStoreFrom(row.inst, 'e')) {
      matches.push({
        kind: 'direct E store',
        rows: [row],
        dest: storeDestDescription(row.inst),
        resolvedAddr: resolvedStoreAddr(row.inst),
        note: row.inst.tag === 'ld-mem-reg' ? 'absolute store from E' : 'register-indirect store from E',
      });
    }

    const next = rows[i + 1];
    if (
      row.inst.tag === 'ld-reg-reg' &&
      row.inst.dest === 'a' &&
      row.inst.src === 'e' &&
      next?.inst &&
      isMemoryStoreFrom(next.inst, 'a')
    ) {
      matches.push({
        kind: 'A relay from E',
        rows: [row, next],
        dest: storeDestDescription(next.inst),
        resolvedAddr: resolvedStoreAddr(next.inst),
        note: 'ld a, e followed by memory store from A',
      });
    }
  }

  return dedupeMatches(matches);
}

function pointerSeedFromRow(row) {
  if (!row.inst) return null;
  if (
    row.inst.tag === 'ld-pair-imm' &&
    ['bc', 'de', 'hl', 'ix', 'iy'].includes(row.inst.pair) &&
    Number.isInteger(row.inst.value) &&
    withinTokenArea(row.inst.value >>> 0)
  ) {
    return { reg: row.inst.pair, addr: row.inst.value >>> 0 };
  }
  return null;
}

function writesPair(inst, reg) {
  if (!inst) return false;
  if (inst.tag === 'ld-pair-imm' && inst.pair === reg) return true;
  if (inst.tag === 'ld-pair-mem' && inst.pair === reg) return true;
  if (inst.tag === 'ld-pair-indexed' && inst.pair === reg) return true;
  if (inst.tag === 'ld-pair-ind' && inst.pair === reg) return true;
  if (inst.tag === 'ld-ixiy-indexed' && inst.dest === reg) return true;
  if (inst.tag === 'lea' && inst.dest === reg) return true;
  if (inst.tag === 'pop' && inst.pair === reg) return true;
  if (inst.tag === 'add-pair' && inst.dest === reg) return true;
  if ((inst.tag === 'adc-pair' || inst.tag === 'sbc-pair') && reg === 'hl') return true;
  if (inst.tag === 'ex-de-hl' && (reg === 'de' || reg === 'hl')) return true;
  return false;
}

function findPointerBackedWrites(rows) {
  const matches = [];

  for (let i = 0; i < rows.length; i += 1) {
    const seed = pointerSeedFromRow(rows[i]);
    if (!seed) continue;

    let effectiveAddr = seed.addr;
    const limit = Math.min(rows.length, i + 7);

    for (let j = i + 1; j < limit; j += 1) {
      const row = rows[j];
      if (!row.inst) break;

      if (row.inst.tag === 'inc-pair' && row.inst.pair === seed.reg) {
        effectiveAddr = (effectiveAddr + 1) >>> 0;
        continue;
      }
      if (row.inst.tag === 'dec-pair' && row.inst.pair === seed.reg) {
        effectiveAddr = (effectiveAddr - 1) >>> 0;
        continue;
      }

      if (BLOCK_COPY_TAGS.has(row.inst.tag) && (seed.reg === 'hl' || seed.reg === 'de')) {
        matches.push({
          kind: seed.reg === 'de' ? 'block copy to token area' : 'block copy from token area',
          rows: [rows[i], row],
          dest: seed.reg === 'de' ? '(de)' : '(hl)',
          resolvedAddr: effectiveAddr,
          note: `${row.inst.tag} uses ${seed.reg.toUpperCase()} as ${seed.reg === 'de' ? 'destination' : 'source'}`,
        });
      }

      if (row.inst.tag === 'ld-ind-imm' && seed.reg === 'hl') {
        matches.push({
          kind: 'pointer-backed immediate store',
          rows: [rows[i], row],
          dest: '(hl)',
          resolvedAddr: effectiveAddr,
          note: 'ld (hl), n after token-area pointer load',
        });
      }

      if (row.inst.tag === 'ld-ind-reg' && row.inst.dest === seed.reg) {
        matches.push({
          kind: 'pointer-backed register store',
          rows: [rows[i], row],
          dest: `(${seed.reg})`,
          resolvedAddr: effectiveAddr,
          note: `${row.inst.src} -> (${seed.reg})`,
        });
      }

      if (row.inst.tag === 'ld-ixd-reg' && row.inst.indexRegister === seed.reg) {
        matches.push({
          kind: 'pointer-backed indexed store',
          rows: [rows[i], row],
          dest: `(${seed.reg}${signed(row.inst.displacement)})`,
          resolvedAddr: resolvedStoreAddr(row.inst, effectiveAddr),
          note: `${row.inst.src} -> (${seed.reg}${signed(row.inst.displacement)})`,
        });
      }

      if (row.inst.tag === 'ld-ixd-imm' && row.inst.indexRegister === seed.reg) {
        matches.push({
          kind: 'pointer-backed indexed immediate store',
          rows: [rows[i], row],
          dest: `(${seed.reg}${signed(row.inst.displacement)})`,
          resolvedAddr: resolvedStoreAddr(row.inst, effectiveAddr),
          note: `immediate -> (${seed.reg}${signed(row.inst.displacement)})`,
        });
      }

      const next = rows[j + 1];
      if (
        row.inst.tag === 'ld-reg-reg' &&
        row.inst.dest === 'a' &&
        row.inst.src === 'e' &&
        next?.inst
      ) {
        if (next.inst.tag === 'ld-ind-reg' && next.inst.dest === seed.reg && next.inst.src === 'a') {
          matches.push({
            kind: 'pointer-backed A relay from E',
            rows: [rows[i], row, next],
            dest: `(${seed.reg})`,
            resolvedAddr: effectiveAddr,
            note: 'ld a, e then store through token-area pointer',
          });
        }

        if (next.inst.tag === 'ld-ixd-reg' && next.inst.indexRegister === seed.reg && next.inst.src === 'a') {
          matches.push({
            kind: 'pointer-backed indexed A relay from E',
            rows: [rows[i], row, next],
            dest: `(${seed.reg}${signed(next.inst.displacement)})`,
            resolvedAddr: resolvedStoreAddr(next.inst, effectiveAddr),
            note: 'ld a, e then indexed store through token-area pointer',
          });
        }
      }

      if (CONTROL_FLOW_TAGS.has(row.inst.tag) || writesPair(row.inst, seed.reg)) {
        break;
      }
    }
  }

  return dedupeMatches(matches);
}

function analyzeRange(label, start, end) {
  const rows = disassembleRange(start, end, 'adl');
  return {
    label,
    start,
    end,
    rows,
    interestingRows: rows.map(inspectInterestingRow).filter(Boolean),
    eStorePatterns: findEStorePatterns(rows),
    pointerBackedWrites: findPointerBackedWrites(rows),
  };
}

function findConvKeyToTokCallSites() {
  const sites = [];

  for (let pc = 0; pc <= romBytes.length - 4; pc += 1) {
    const opcode = romBytes[pc];

    if (
      (opcode === 0x52 || opcode === 0x5B) &&
      pc <= romBytes.length - 5 &&
      CALL_OPCODES.has(romBytes[pc + 1]) &&
      romBytes[pc + 2] === EXACT_TOKEN_BYTES[0] &&
      romBytes[pc + 3] === 0xC5 &&
      romBytes[pc + 4] === 0x05
    ) {
      const row = decodeRow(pc, 'adl');
      if (row.inst && (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') && row.inst.target === CONV_KEY_TO_TOK) {
        sites.push({
          pc,
          encoding: opcode === 0x52 ? 'sil + call24' : 'lil + call24',
          row,
          length: row.length,
        });
      }
      continue;
    }

    if (
      CALL_OPCODES.has(opcode) &&
      (pc === 0 || (romBytes[pc - 1] !== 0x52 && romBytes[pc - 1] !== 0x5B)) &&
      romBytes[pc + 1] === EXACT_TOKEN_BYTES[0] &&
      romBytes[pc + 2] === 0xC5 &&
      romBytes[pc + 3] === 0x05
    ) {
      const row = decodeRow(pc, 'adl');
      if (row.inst && (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') && row.inst.target === CONV_KEY_TO_TOK) {
        sites.push({
          pc,
          encoding: 'direct24',
          row,
          length: row.length,
        });
      }
    }
  }

  return sites.sort((a, b) => a.pc - b.pc);
}

function analyzeConvKeyToTokCallSite(site) {
  const rows = [];
  const limit = site.pc + site.length + CALL_WINDOW_BYTES;
  for (let pc = site.pc + site.length; pc < limit; ) {
    const row = decodeRow(pc, 'adl');
    rows.push(row);
    pc += Math.max(row.length, 1);
  }

  const directMatches = findEStorePatterns(rows);
  const pointerMatches = findPointerBackedWrites(rows);
  const matches = dedupeMatches([...directMatches, ...pointerMatches]);
  const candidatePcs = new Set(matches.flatMap((match) => match.rows.map((row) => row.pc)));

  return {
    ...site,
    windowRows: rows,
    matches,
    candidatePcs,
  };
}

function formatMatch(match) {
  const pcs = match.rows.map((row) => hex(row.pc)).join(' -> ');
  const text = match.rows.map((row) => row.text).join(' ; ');
  const resolved = Number.isInteger(match.resolvedAddr)
    ? describeTokenAddr(match.resolvedAddr)
    : 'unknown address';
  return `${pcs}: ${text}  [${match.kind}; ${resolved}; ${match.note}]`;
}

function printRangeAnalysis(result) {
  console.log(`\n=== ${result.label} (${hex(result.start)}..${hex(result.end)}) ===`);
  console.log(`Instructions decoded: ${result.rows.length}`);

  console.log('\nInteresting instructions:');
  if (result.interestingRows.length === 0) {
    console.log('  none');
  } else {
    for (const row of result.interestingRows) {
      console.log(`  ${hex(row.pc)}: ${row.raw.padEnd(24)} ${row.text}  [${row.reasons.join('; ')}]`);
    }
  }

  console.log('\nPointer-backed token-area write candidates:');
  if (result.pointerBackedWrites.length === 0) {
    console.log('  none');
  } else {
    for (const match of result.pointerBackedWrites) {
      console.log(`  ${formatMatch(match)}`);
    }
  }

  console.log('\nDirect E-to-memory store patterns:');
  if (result.eStorePatterns.length === 0) {
    console.log('  none');
  } else {
    for (const match of result.eStorePatterns) {
      console.log(`  ${formatMatch(match)}`);
    }
  }
}

function printConvCallAnalysis(results) {
  console.log(`\n=== ConvKeyToTok Post-Call Scan (${results.length} call site(s)) ===`);
  if (results.length === 0) {
    console.log('No 24-bit direct CALL encodings to 0x05C52C found in ROM.');
    return;
  }

  for (const site of results) {
    console.log(`\n${hex(site.pc)}: ${site.row.raw.padEnd(24)} ${site.row.text}  [${site.encoding}]`);
    for (const row of site.windowRows) {
      const mark = site.candidatePcs.has(row.pc) ? '*' : ' ';
      console.log(`  ${mark} ${hex(row.pc)}: ${row.raw.padEnd(24)} ${row.text}`);
    }

    if (site.matches.length === 0) {
      console.log('    no E-to-memory or token-pointer-backed store pattern in the first 20 bytes after call');
    } else {
      for (const match of site.matches) {
        console.log(`    candidate: ${formatMatch(match)}`);
      }
    }
  }
}

function main() {
  console.log('=== Phase 187: Inline Token Staging Static Scan ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`TOKEN_STAGING: ${hex(TOKEN_STAGING)}  nearby range: ${hex(TOKEN_AREA_START)}..${hex(TOKEN_AREA_END)}`);
  console.log(`Home handler scan: ${hex(HOME_SCAN_START)}..${hex(HOME_SCAN_END)}`);
  console.log(`ConvKeyToTok post-call window: ${CALL_WINDOW_BYTES} byte(s)`);

  const primary = analyzeRange('Home handler primary scan', HOME_SCAN_START, HOME_SCAN_SPLIT);
  const extended = analyzeRange('Home handler extended scan', HOME_SCAN_SPLIT, HOME_SCAN_END);
  const convCalls = findConvKeyToTokCallSites().map(analyzeConvKeyToTokCallSite);

  printRangeAnalysis(primary);
  printRangeAnalysis(extended);
  printConvCallAnalysis(convCalls);

  const totalInterestingRows = primary.interestingRows.length + extended.interestingRows.length;
  const totalPointerWrites = primary.pointerBackedWrites.length + extended.pointerBackedWrites.length;
  const totalEStores = primary.eStorePatterns.length + extended.eStorePatterns.length;
  const convSitesWithCandidates = convCalls.filter((site) => site.matches.length > 0).length;

  console.log('\n=== Summary ===');
  console.log(`Interesting home-handler instructions: ${totalInterestingRows}`);
  console.log(`Pointer-backed token-area write candidates: ${totalPointerWrites}`);
  console.log(`Direct E-to-memory store patterns in home handler: ${totalEStores}`);
  console.log(`ConvKeyToTok call sites with post-call store candidates: ${convSitesWithCandidates}/${convCalls.length}`);
}

main();
