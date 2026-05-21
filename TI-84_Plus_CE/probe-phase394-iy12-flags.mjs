#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const EXPECTED_ROM_SIZE = 0x400000;
const TARGET_DISPLACEMENT = 0x12;
const NEGATIVE_TARGET_DISPLACEMENT = 0xEE;
const MODE = 'adl';
const CONTEXT_BEFORE = 2;
const CONTEXT_AFTER = 3;

const IY_BASE = 0xD00080;
const TARGET_ADDR = IY_BASE + TARGET_DISPLACEMENT;

const REGION_TABLE = [
  { start: 0x000000, end: 0x010000, name: 'boot/core' },
  { start: 0x020000, end: 0x030000, name: 'key dispatch / event handling' },
  { start: 0x030000, end: 0x040000, name: 'key translation / menu' },
  { start: 0x040000, end: 0x060000, name: 'screen / cursor / display' },
  { start: 0x060000, end: 0x080000, name: 'graph / editor' },
  { start: 0x080000, end: 0x0A0000, name: 'misc OS services' },
  { start: 0x0A0000, end: 0x0C0000, name: 'math / catalog' },
  { start: 0x0C0000, end: Infinity, name: 'apps / other' },
];

const BIT_METADATA = [
  {
    name: 'clearOverrideGate',
    purpose: 'Key override / deferred-callback gate.',
    rationale:
      'Read in the 0x03FB9C _GetCSC key-present cascade and toggled again by 0x0A27FA / 0x0A34A2 helper paths, so it behaves like a transient scan-override gate instead of a plain shift-state bit.',
    legacyHint: null,
  },
  {
    name: 'keyboardCleanupLatch',
    purpose: 'Clear-only keyboard-service housekeeping latch.',
    rationale:
      'All direct hits are RES-only and live in keyboard acquisition, display, and catalog cleanup helpers, which looks more like one-shot housekeeping than a user-visible mode bit.',
    legacyHint: null,
  },
  {
    name: 'serviceBusyLatch',
    purpose: 'Cross-subsystem service / re-entry latch.',
    rationale:
      'Touched by boot/core helpers, display paths, graph/editor code, misc services, math/catalog cleanup, and JError teardown, so it looks like a generic busy or protected-state flag.',
    legacyHint: null,
  },
  {
    name: 'secondPressLatch',
    purpose: 'Immediate [2nd] key-dispatch latch / pending-shift arm.',
    rationale:
      'Set in the 0x02FECF decision tree and then consumed by nearby key/menu logic, which fits a short-lived dispatch latch that feeds later mode selection.',
    legacyHint: 'Legacy SDK hint: `shift2nd` is bit 3 of `shiftFlags`.',
  },
  {
    name: 'alphaModeFlag',
    purpose: 'ALPHA mode / alpha-translation gate.',
    rationale:
      'SET and BIT sites cluster around key dispatch, translation-table selection, and editor/menu paths already known to steer alpha behavior.',
    legacyHint: 'Legacy SDK hint: `shiftAlpha` is bit 4 of `shiftFlags`.',
  },
  {
    name: 'secondModeFlag',
    purpose: '2ND-mode table-select / active modifier flag.',
    rationale:
      'Session 393 already mapped this bit through the 0x0300DB / 0x03010F path that chooses the 2ND translation-table section.',
    legacyHint: 'Legacy SDK names bit 5 `shiftLwrAlph`, but observed CE ROM behavior in Session 393 matches a 2ND-mode selector.',
  },
  {
    name: 'alphaLockLatch',
    purpose: 'Sticky alpha-lock-style latch in the key pipeline.',
    rationale:
      'Every direct site is in the 0x0300xx / 0x03D7xx / 0x03FBxx / 0x03FCxx key-pipeline cluster, consistent with a sticky modifier latch rather than a general OS flag.',
    legacyHint: 'Legacy SDK hint: `shiftALock` is bit 6 of `shiftFlags`.',
  },
  {
    name: 'keepAlphaGate',
    purpose: 'Keep-alpha / inhibit-alpha-cancel gate.',
    rationale:
      'The only direct bit-op is BIT 7 at 0x03FC01 inside the same 0x03FBFD helper that also manipulates bits 4, 5, and 6, which fits a local “preserve alpha state” test.',
    legacyHint: 'Legacy SDK hint: `shiftKeepAlph` is bit 7 of `shiftFlags`.',
  },
];

const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);
const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedHexByte(value) {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : '+'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedHexByte(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') {
    return hex(value, 4);
  }
  if (modePrefix === 'sil' || modePrefix === 'lil') {
    return hex(value, 6);
  }
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const upperOp = upper(op);
  if (upperOp === 'ADD' || upperOp === 'ADC' || upperOp === 'SBC') {
    return `${upperOp} A, ${operand}`;
  }
  return `${upperOp} ${operand}`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedHexByte(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';

  switch (inst.tag) {
    case 'db':
      return `DB ${hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'im':
      return `IM ${inst.modeValue ?? inst.value ?? '?'}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ex-af':
      return 'EX AF, AF\'';
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'cpl':
      return 'CPL';
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'daa':
      return 'DAA';
    case 'rsmix':
      return 'RSMIX';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-reg-indexed':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hexByte(inst.port)})`;
    case 'out0':
      return `OUT0 (${hexByte(inst.port)}), ${upper(inst.reg ?? 'A')}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)}, (C)`;
    case 'out-reg':
      return `OUT (C), ${upper(inst.reg)}`;
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, MODE);
  const length = Math.max(1, inst?.length ?? 1);
  const nextPc = inst?.nextPc ?? (pc + length);

  return {
    pc,
    bytes: bytesHex(pc, length),
    inst,
    text: renderInstruction(inst),
    nextPc,
  };
}

function classifyRegion(address) {
  for (const region of REGION_TABLE) {
    if (address >= region.start && address < region.end) {
      return region.name;
    }
  }
  return 'other / unclassified';
}

function classifyKind(opcode) {
  const cls = opcode & 0xC0;
  if (cls === 0x40) return 'BIT';
  if (cls === 0x80) return 'RES';
  if (cls === 0xC0) return 'SET';
  return null;
}

function scanIndexedBitOps(displacement) {
  const hits = [];
  let regVariantCount = 0;

  for (let address = 0; address <= rom.length - 4; address += 1) {
    if (
      rom[address] !== 0xFD ||
      rom[address + 1] !== 0xCB ||
      rom[address + 2] !== displacement
    ) {
      continue;
    }

    const opcode = rom[address + 3];
    const kind = classifyKind(opcode);
    if (!kind) continue;

    const registerTarget = opcode & 0x07;
    if (registerTarget !== 0x06) {
      regVariantCount += 1;
    }

    hits.push({
      addr: address,
      opcode,
      kind,
      bit: (opcode >> 3) & 0x07,
      registerTarget,
      region: classifyRegion(address),
    });
  }

  return { hits, regVariantCount };
}

function tryDecodePath(start, target, maxSteps = 32) {
  const rows = [];
  let pc = start;

  for (let step = 0; step < maxSteps && pc <= target; step += 1) {
    const row = decodeRow(pc);
    rows.push(row);

    if (pc === target) {
      return rows;
    }

    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) {
      return null;
    }

    pc = row.nextPc;
  }

  return null;
}

function findAlignedRows(target, maxLookback = 32) {
  const minStart = Math.max(0, target - maxLookback);
  let best = null;

  for (let start = minStart; start <= target; start += 1) {
    const rows = tryDecodePath(start, target);
    if (!rows) continue;

    const beforeCount = rows.length - 1;
    const byteSpan = target - start;
    const score = beforeCount * 1000 - byteSpan;

    if (!best || score > best.score) {
      best = { score, rows };
    }
  }

  return best?.rows ?? [decodeRow(target)];
}

function buildContext(target, before = CONTEXT_BEFORE, after = CONTEXT_AFTER) {
  const rows = [...findAlignedRows(target)];
  let targetIndex = rows.findIndex((row) => row.pc === target);

  if (targetIndex === -1) {
    return [decodeRow(target)];
  }

  let pc = rows[rows.length - 1].nextPc;
  while (rows.length < targetIndex + 1 + after && pc < rom.length) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }

  targetIndex = rows.findIndex((row) => row.pc === target);
  const startIndex = Math.max(0, targetIndex - before);
  const endIndex = Math.min(rows.length, targetIndex + after + 1);
  return rows.slice(startIndex, endIndex);
}

function makeEmptyAnalysis(bit) {
  return {
    bit,
    metadata: BIT_METADATA[bit],
    sites: {
      SET: [],
      RES: [],
      BIT: [],
    },
  };
}

function buildAnalyses(hits) {
  const analyses = Array.from({ length: 8 }, (_, bit) => makeEmptyAnalysis(bit));

  for (const hit of hits) {
    analyses[hit.bit].sites[hit.kind].push({
      ...hit,
      context: buildContext(hit.addr),
    });
  }

  return analyses.map((analysis) => ({
    ...analysis,
    total:
      analysis.sites.SET.length +
      analysis.sites.RES.length +
      analysis.sites.BIT.length,
  }));
}

function countRegions(analysis) {
  const counts = new Map();

  for (const kind of ['SET', 'RES', 'BIT']) {
    for (const site of analysis.sites[kind]) {
      counts.set(site.region, (counts.get(site.region) || 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
}

function summarizeRegions(analysis) {
  const entries = countRegions(analysis);
  if (!entries.length) return 'none';
  return entries.map(([region, count]) => `${region} x${count}`).join('; ');
}

function printHeader() {
  console.log('Phase 394 - IY+0x12 Full Flag Census');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Expected ROM size: ${hex(EXPECTED_ROM_SIZE)} (${EXPECTED_ROM_SIZE} bytes)`);
  console.log(`Observed ROM size: ${hex(rom.length)} (${rom.length} bytes)`);
  console.log(`IY base: ${hex(IY_BASE)}  target byte: ${hex(TARGET_ADDR)} (IY+0x12)`);
  console.log('');
  if (rom.length !== EXPECTED_ROM_SIZE) {
    console.log('WARNING: ROM size does not match the expected 4 MiB image.');
    console.log('');
  }
}

function printScanStats(positiveScan, negativeScan) {
  console.log('Scan Stats');
  console.log('----------');
  console.log(`FD CB 12 xx bit-op hits: ${positiveScan.hits.length}`);
  console.log(`FD CB 12 xx register-target variants: ${positiveScan.regVariantCount}`);
  console.log(`FD CB EE xx (IY-0x12) bit-op hits: ${negativeScan.hits.length}`);
  if (negativeScan.hits.length) {
    console.log(`  Sites: ${negativeScan.hits.map((hit) => hex(hit.addr)).join(', ')}`);
  } else {
    console.log('  Sites: none');
  }
  console.log('');
}

function printSummaryTable(analyses) {
  console.log('Bit | SET sites | RES sites | BIT sites | Total | Proposed purpose');
  console.log('----|-----------|-----------|-----------|-------|------------------------------');

  for (const analysis of analyses) {
    const line = [
      String(analysis.bit).padStart(3, ' '),
      String(analysis.sites.SET.length).padStart(9, ' '),
      String(analysis.sites.RES.length).padStart(9, ' '),
      String(analysis.sites.BIT.length).padStart(9, ' '),
      String(analysis.total).padStart(5, ' '),
      `${analysis.metadata.name} - ${analysis.metadata.purpose}`,
    ].join(' | ');

    console.log(line);
  }

  console.log('');
}

function printContextRows(site) {
  for (const row of site.context) {
    const marker = row.pc === site.addr ? '>' : ' ';
    console.log(`      ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text}`);
  }
}

function printSiteGroup(kind, sites) {
  console.log(`${kind} sites (${sites.length})`);
  if (!sites.length) {
    console.log('  - none');
    return;
  }

  for (const site of sites) {
    console.log(`  - ${hex(site.addr)} [${site.region}] opcode=${hexByte(site.opcode)}`);
    printContextRows(site);
  }
}

function printBitDetail(analysis) {
  console.log(`Bit ${analysis.bit} - ${analysis.metadata.name}`);
  console.log(`  Proposed purpose: ${analysis.metadata.purpose}`);
  console.log(`  Why: ${analysis.metadata.rationale}`);
  if (analysis.metadata.legacyHint) {
    console.log(`  Legacy hint: ${analysis.metadata.legacyHint}`);
  }
  console.log(`  Region mix: ${summarizeRegions(analysis)}`);
  console.log(`  Total hits: ${analysis.total}`);
  printSiteGroup('SET', analysis.sites.SET);
  printSiteGroup('RES', analysis.sites.RES);
  printSiteGroup('BIT', analysis.sites.BIT);
  console.log('');
}

function main() {
  const positiveScan = scanIndexedBitOps(TARGET_DISPLACEMENT);
  const negativeScan = scanIndexedBitOps(NEGATIVE_TARGET_DISPLACEMENT);
  const analyses = buildAnalyses(positiveScan.hits);

  printHeader();
  printScanStats(positiveScan, negativeScan);
  printSummaryTable(analyses);

  for (const analysis of analyses) {
    printBitDetail(analysis);
  }

  const allBitsDocumented = analyses.every((analysis) => analysis.total > 0);
  console.log(allBitsDocumented ? 'PASS' : 'FAIL');
}

main();
