#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x0059E9;
const SCAN_LIMIT = Math.min(rom.length, 0x0C0000); // 0x000000-0x0BFFFF inclusive
const CALL_PATTERN = [0xCD, 0xE9, 0x59, 0x00];
const JP_PATTERN = [0xC3, 0xE9, 0x59, 0x00];

const BEFORE_COUNT = 10;
const AFTER_COUNT = 5;
const EXTENDED_BEFORE_COUNT = 20;
const EXTENDED_AFTER_COUNT = 20;
const MAX_INSTRUCTION_LENGTH = 8;

const ISR_RANGE_START = 0x040C00;
const ISR_RANGE_END = 0x041000; // exclusive
const KNOWN_ISR_ENTRY = 0x040CE6;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= SCAN_LIMIT) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
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
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
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
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-ind':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-pair':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return `${prefix}LD SP, HL`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-special':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-mb-a':
      return `${prefix}LD MB, A`;
    case 'ld-a-mb':
      return `${prefix}LD A, MB`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ixd':
      return `${prefix}INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `${prefix}DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-rotate':
      return `${prefix}${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'in0':
      return `${prefix}IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0':
      return `${prefix}OUT0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-reg':
      return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'im':
      return `${prefix}IM ${inst.value}`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'slp':
      return `${prefix}SLP`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'ex-sp-hl':
      return `${prefix}EX (SP), HL`;
    case 'ex-sp-pair':
      return `${prefix}EX (SP), ${String(inst.pair).toUpperCase()}`;
    case 'rrd':
      return `${prefix}RRD`;
    case 'rld':
      return `${prefix}RLD`;
    case 'ldi':
    case 'cpi':
    case 'ldd':
    case 'cpd':
    case 'ldir':
    case 'cpir':
    case 'lddr':
    case 'cpdr':
    case 'ini':
    case 'outi':
    case 'ind':
    case 'outd':
    case 'inir':
    case 'otir':
    case 'indr':
    case 'otdr':
    case 'otimr':
      return `${prefix}${String(inst.tag).toUpperCase()}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg).toUpperCase()}`;
    case 'tst-reg':
      return `${prefix}TST A, ${String(inst.reg).toUpperCase()}`;
    case 'tst-ind':
      return `${prefix}TST A, (HL)`;
    case 'tst-imm':
      return `${prefix}TST A, ${hexByte(inst.value)}`;
    case 'tstio':
      return `${prefix}TSTIO ${hexByte(inst.value)}`;
    case 'stmix':
      return `${prefix}STMIX`;
    case 'rsmix':
      return `${prefix}RSMIX`;
    default:
      if (typeof inst.target === 'number') {
        return `${prefix}${String(inst.tag).toUpperCase()} ${hex(inst.target)}`;
      }
      if (typeof inst.addr === 'number') {
        return `${prefix}${String(inst.tag).toUpperCase()} ${hex(inst.addr)}`;
      }
      if (typeof inst.value === 'number' && inst.value > 0xFF) {
        return `${prefix}${String(inst.tag).toUpperCase()} ${hex(inst.value)}`;
      }
      return `${prefix}${String(inst.tag).toUpperCase()}`;
  }
}

function formatRow(pc, inst, marker = '') {
  const length = Math.max(1, inst?.length ?? 1);
  const bytes = formatBytes(pc, length).padEnd(23);
  const text = formatInstruction(inst);
  return `  ${hex(pc)}  ${bytes}  ${text}${marker}`;
}

function findExactRefs(pattern, type) {
  const hits = [];
  for (let pc = 0; pc <= SCAN_LIMIT - pattern.length; pc += 1) {
    let matches = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[pc + index] !== pattern[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      hits.push({ addr: pc, type });
    }
  }
  return hits;
}

function recoverBefore(pc, count, memo = new Map()) {
  if (count <= 0 || pc <= 0) {
    return [];
  }

  const memoKey = `${pc}:${count}`;
  if (memo.has(memoKey)) {
    return memo.get(memoKey);
  }

  let best = [];
  const start = Math.max(0, pc - MAX_INSTRUCTION_LENGTH);

  for (let candidate = pc - 1; candidate >= start; candidate -= 1) {
    const inst = safeDecode(candidate);
    if (!inst) {
      continue;
    }
    if (candidate + inst.length !== pc) {
      continue;
    }

    const prev = recoverBefore(candidate, count - 1, memo);
    const path = [...prev, { pc: candidate, inst }];
    if (path.length > best.length) {
      best = path;
      continue;
    }
    if (path.length === best.length && path.length > 0) {
      const currentStart = path[0].pc;
      const bestStart = best[0]?.pc ?? Number.MAX_SAFE_INTEGER;
      if (currentStart < bestStart) {
        best = path;
      }
    }
  }

  memo.set(memoKey, best);
  return best;
}

function decodeAfter(startPc, count) {
  const rows = [];
  let pc = startPc;
  while (rows.length < count && pc < SCAN_LIMIT) {
    const inst = safeDecode(pc);
    if (!inst) {
      rows.push({ pc, inst: null });
      pc += 1;
      continue;
    }
    rows.push({ pc, inst });
    pc += inst.length;
  }
  return rows;
}

function dedupeValues(values) {
  return [...new Set(values)];
}

function isInterruptVectorAddress(value) {
  return value === 0x000038 || value === 0x000066;
}

function classifyCaller(site, beforeRows, extendedBeforeRows, extendedAfterRows) {
  const neighborhood = [...extendedBeforeRows, { pc: site.addr, inst: site.inst }, ...extendedAfterRows];
  const tags = neighborhood.map((row) => row.inst?.tag).filter(Boolean);

  const inKnownIsrRange = site.addr >= ISR_RANGE_START && site.addr < ISR_RANGE_END;
  const hasReti = tags.includes('reti') || tags.includes('retn');
  const hasIm = tags.includes('im');
  const interruptControls = dedupeValues(
    neighborhood
      .filter((row) => row.inst?.tag === 'di' || row.inst?.tag === 'ei')
      .map((row) => row.inst.tag.toUpperCase())
  );

  const pushPairs = dedupeValues(
    extendedBeforeRows
      .filter((row) => row.inst?.tag === 'push')
      .map((row) => String(row.inst.pair).toUpperCase())
  );
  const popPairs = dedupeValues(
    extendedAfterRows
      .filter((row) => row.inst?.tag === 'pop')
      .map((row) => String(row.inst.pair).toUpperCase())
  );
  const savedPairs = dedupeValues([...pushPairs, ...popPairs]);
  const hasWideSaveRestore =
    savedPairs.length >= 4 ||
    ['AF', 'BC', 'DE', 'HL'].every((pair) => savedPairs.includes(pair));

  const vectorRefs = dedupeValues(
    neighborhood.flatMap((row) => {
      const refs = [];
      if (typeof row.inst?.target === 'number' && isInterruptVectorAddress(row.inst.target >>> 0)) {
        refs.push(row.inst.target >>> 0);
      }
      if (row.inst?.tag === 'rst' && typeof row.inst.target === 'number' && isInterruptVectorAddress(row.inst.target >>> 0)) {
        refs.push(row.inst.target >>> 0);
      }
      return refs;
    })
  );

  const reasons = [];
  if (inKnownIsrRange) {
    reasons.push(`within keyboard ISR dispatcher range ${hex(ISR_RANGE_START)}-${hex(ISR_RANGE_END - 1)}`);
  }
  if (hasReti) {
    reasons.push('RETI/RETN appears in nearby decoded flow');
  }
  if (hasIm) {
    reasons.push('interrupt-mode instruction appears nearby');
  }
  if (interruptControls.length > 0) {
    reasons.push(`interrupt control nearby: ${interruptControls.join(', ')}`);
  }
  if (hasWideSaveRestore) {
    reasons.push(`multi-register save/restore nearby: ${savedPairs.join(', ')}`);
  }
  if (vectorRefs.length > 0) {
    reasons.push(`interrupt-vector reference nearby: ${vectorRefs.map((value) => hex(value)).join(', ')}`);
  }

  let classification = 'FOREGROUND';
  if (
    inKnownIsrRange ||
    hasReti ||
    vectorRefs.length > 0 ||
    (interruptControls.length > 0 && hasWideSaveRestore) ||
    (hasIm && (interruptControls.length > 0 || hasWideSaveRestore))
  ) {
    classification = 'ISR';
  } else if (interruptControls.length > 0 || hasWideSaveRestore || hasIm) {
    classification = 'UNKNOWN';
  }

  if (classification === 'FOREGROUND' && reasons.length === 0) {
    reasons.push('no nearby ISR markers; looks like ordinary subroutine flow');
  }

  return {
    classification,
    reasons,
    indicators: {
      inKnownIsrRange,
      hasReti,
      hasIm,
      interruptControls,
      pushPairs,
      popPairs,
      vectorRefs,
      recoveredBeforeCount: beforeRows.length,
    },
  };
}

function buildSite(hit) {
  const inst = safeDecode(hit.addr);
  const beforeRows = recoverBefore(hit.addr, BEFORE_COUNT);
  const extendedBeforeRows = recoverBefore(hit.addr, EXTENDED_BEFORE_COUNT);
  const afterRows = decodeAfter(hit.addr + (inst?.length ?? 4), AFTER_COUNT);
  const extendedAfterRows = decodeAfter(hit.addr + (inst?.length ?? 4), EXTENDED_AFTER_COUNT);
  const classification = classifyCaller(hit, beforeRows, extendedBeforeRows, extendedAfterRows);

  return {
    ...hit,
    inst,
    beforeRows,
    afterRows,
    extendedBeforeRows,
    extendedAfterRows,
    classification,
  };
}

function printSite(site) {
  console.log(`--- ${site.type} at ${hex(site.addr)} ---`);
  console.log(`classification: ${site.classification.classification}`);
  console.log(`reason(s): ${site.classification.reasons.join('; ')}`);
  console.log('');
  console.log(`Context before (${BEFORE_COUNT} instructions):`);
  for (const row of site.beforeRows) {
    console.log(formatRow(row.pc, row.inst));
  }
  if (site.beforeRows.length === 0) {
    console.log('  (no recoverable predecessor instructions)');
  }
  console.log(formatRow(site.addr, site.inst, '  <<< target'));
  console.log('');
  if (site.type === 'JP') {
    console.log(`Physical bytes after JP (${AFTER_COUNT} instructions; control does not return here):`);
  } else {
    console.log(`After CALL (${AFTER_COUNT} instructions):`);
  }
  for (const row of site.afterRows) {
    console.log(formatRow(row.pc, row.inst));
  }
  if (site.afterRows.length === 0) {
    console.log('  (no decodable instructions after site)');
  }
  console.log('');
}

const rawHits = [
  ...findExactRefs(CALL_PATTERN, 'CALL'),
  ...findExactRefs(JP_PATTERN, 'JP'),
].sort((left, right) => left.addr - right.addr);

const sites = rawHits.map(buildSite);

const callCount = sites.filter((site) => site.type === 'CALL').length;
const jpCount = sites.filter((site) => site.type === 'JP').length;
const classCounts = {
  ISR: sites.filter((site) => site.classification.classification === 'ISR').length,
  FOREGROUND: sites.filter((site) => site.classification.classification === 'FOREGROUND').length,
  UNKNOWN: sites.filter((site) => site.classification.classification === 'UNKNOWN').length,
};

const isrRangeHits = sites.filter((site) => site.addr >= ISR_RANGE_START && site.addr < ISR_RANGE_END);

console.log('=== Phase 289: Direct CALL/JP Sites to 0x0059E9 ===\n');
console.log(`ROM path: ${ROM_PATH}`);
console.log(`Scan range: ${hex(0x000000)}-${hex(SCAN_LIMIT - 1)}`);
console.log(`Target: ${hex(TARGET)}`);
console.log(`Patterns: CALL=${CALL_PATTERN.map(hexByte).join(' ')}  JP=${JP_PATTERN.map(hexByte).join(' ')}\n`);

console.log(`Found ${sites.length} direct reference(s): ${callCount} CALL, ${jpCount} JP`);
console.log(`Classifications: ISR=${classCounts.ISR}, FOREGROUND=${classCounts.FOREGROUND}, UNKNOWN=${classCounts.UNKNOWN}\n`);

if (sites.length === 0) {
  console.log('No direct CALL/JP sites to 0x0059E9 were found.');
} else {
  for (const site of sites) {
    printSite(site);
  }
}

console.log(`=== Keyboard ISR Dispatcher Check (${hex(ISR_RANGE_START)}-${hex(ISR_RANGE_END - 1)}) ===\n`);
console.log(`Known keyboard ISR dispatcher entry: ${hex(KNOWN_ISR_ENTRY)}`);

if (isrRangeHits.length === 0) {
  console.log(`No direct CALL/JP to ${hex(TARGET)} appears in ${hex(ISR_RANGE_START)}-${hex(ISR_RANGE_END - 1)}.`);
  console.log('Direct-byte evidence therefore does not show 0x040CE6 calling 0x0059E9 from the ISR range.');
} else {
  console.log(`Found ${isrRangeHits.length} direct ISR-range reference(s):`);
  for (const site of isrRangeHits) {
    console.log(`  ${hex(site.addr)}  ${site.type}  classification=${site.classification.classification}`);
  }
}

console.log('\n=== Summary ===\n');
for (const site of sites) {
  console.log(
    `${hex(site.addr)}  ${site.type.padEnd(4)}  ${site.classification.classification.padEnd(10)}  ${formatInstruction(site.inst)}`
  );
}

if (sites.length === 0) {
  console.log('(no entries)');
}

console.log('\n=== Phase 289 complete ===');
