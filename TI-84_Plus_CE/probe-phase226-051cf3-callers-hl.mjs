#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const EXEC_END = Math.min(rom.length, 0x0C0000);
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;

const TARGET_ENTRY = 0x051CF3;
const WRITER_ENTRY = 0x051D37;
const WRITER_SITE = 0x051D4D;
const HL_TABLE_LOADER = 0x051F1C;
const HL_TABLE_ROOT = 0x04F262;

const REQUESTED_SCAN_START = 0x051CF0;
const REQUESTED_SCAN_END = 0x051D00;
const REGION_SCAN_END = 0x051E20;

const BIT_SITES = [0x051D63, 0x051D7A, 0x051DC1];

const MAGIC_LABELS = new Map([
  [0xFA, 'AlphaLock'],
  [0xFB, 'Alpha'],
  [0xFC, '2nd'],
  [0xFE, 'Fn'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(start, length) {
  const from = Math.max(0, start);
  const to = Math.min(rom.length, from + Math.max(0, length));
  return Array.from(rom.slice(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read24LE(buffer, addr) {
  return (
    (buffer[addr] & 0xFF) |
    ((buffer[addr + 1] & 0xFF) << 8) |
    ((buffer[addr + 2] & 0xFF) << 16)
  ) >>> 0;
}

function safeDecode(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc & 0xFFFFFF, mode);
  } catch {
    return null;
  }
}

function rawRow(pc, length = 1) {
  return {
    pc,
    inst: null,
    bytes: bytesAt(pc, length),
    text: `DB ${hexByte(rom[pc] ?? 0)}`,
  };
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return 'DB ?';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveMemAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveMemAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      if (String(inst.src).toLowerCase() === 'a') return `${prefix}${String(inst.op).toUpperCase()} A`;
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ixd': return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'cpir': return `${prefix}CPIR`;
    case 'sbc-pair': return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-ind': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (HL)`;
    case 'ld-ind-pair': return `${prefix}LD (HL), ${String(inst.pair).toUpperCase()}`;
    case 'lea': return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'nop': return `${prefix}NOP`;
    case 'halt': return `${prefix}HALT`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    default: return `${prefix}[${inst.tag}]`;
  }
}

function makeRow(inst) {
  const length = Math.max(1, inst?.length ?? 1);
  return {
    pc: inst.pc,
    inst,
    bytes: bytesAt(inst.pc, length),
    text: formatInstruction(inst),
  };
}

function decodeForwardBytes(startPc, byteBudget, mode = 'adl') {
  const rows = [];
  const end = Math.min(rom.length, startPc + Math.max(0, byteBudget));
  let pc = startPc;

  while (pc < end) {
    const inst = safeDecode(pc, mode);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      rows.push(rawRow(pc));
      pc += 1;
      continue;
    }
    rows.push(makeRow(inst));
    pc = inst.nextPc;
  }

  return rows;
}

function decodeBeforePc(targetPc, lookbackBytes, mode = 'adl') {
  const startBase = Math.max(0, targetPc - lookbackBytes);
  let best = null;

  for (let offset = 0; offset < 8 && startBase + offset < targetPc; offset += 1) {
    const rows = [];
    let pc = startBase + offset;
    let errors = 0;

    while (pc < targetPc) {
      const inst = safeDecode(pc, mode);
      if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > targetPc) {
        errors += 1;
        pc += 1;
        continue;
      }
      rows.push(makeRow(inst));
      pc = inst.nextPc;
    }

    const exact = pc === targetPc;
    const score = (exact ? 1000 : 0) - (errors * 100) + rows.length;
    if (!best || score > best.score) {
      best = { exact, score, rows };
    }
  }

  if (best?.exact) {
    return best.rows;
  }

  return decodeForwardBytes(startBase, targetPc - startBase, mode).filter((row) => row.pc < targetPc);
}

function decodeAroundPc(targetPc, beforeBytes, afterBytes, mode = 'adl') {
  const rows = [...decodeBeforePc(targetPc, beforeBytes, mode)];
  const inst = safeDecode(targetPc, mode);
  if (inst && inst.length && inst.nextPc > targetPc) {
    rows.push(makeRow(inst));
    rows.push(...decodeForwardBytes(inst.nextPc, afterBytes, mode));
  } else {
    rows.push(rawRow(targetPc));
    rows.push(...decodeForwardBytes(targetPc + 1, afterBytes, mode));
  }
  return rows;
}

function decodeLinear(startPc, endPc, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  const limit = Math.min(rom.length, endPc);

  while (pc < limit) {
    const inst = safeDecode(pc, mode);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      rows.push(rawRow(pc));
      pc += 1;
      continue;
    }
    rows.push(makeRow(inst));
    pc = inst.nextPc;
  }

  return rows;
}

function printRows(rows, highlightPc = null, indent = '  ') {
  for (const row of rows) {
    const marker = row.pc === highlightPc ? '>>' : '  ';
    console.log(`${indent}${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

function scanAbsoluteCallOrJump(target) {
  const hits = [];
  for (let pc = 0; pc <= EXEC_END - 4; pc += 1) {
    const opcode = rom[pc];
    if (opcode !== 0xCD && opcode !== 0xC3) continue;
    if (read24LE(rom, pc + 1) !== target) continue;
    hits.push({
      pc,
      kind: opcode === 0xCD ? 'CALL' : 'JP',
      target,
    });
  }
  return hits;
}

function scanDirectEntryTargets(rangeStart, rangeEnd, externalOnly = false) {
  const hits = [];
  for (let pc = 0; pc <= EXEC_END - 4; pc += 1) {
    const opcode = rom[pc];
    if (opcode !== 0xCD && opcode !== 0xC3) continue;
    const target = read24LE(rom, pc + 1);
    if (target < rangeStart || target > rangeEnd) continue;
    if (externalOnly && pc >= rangeStart && pc <= rangeEnd) continue;
    hits.push({
      pc,
      kind: opcode === 0xCD ? 'CALL' : 'JP',
      target,
    });
  }
  return hits.sort((left, right) => left.pc - right.pc || left.target - right.target);
}

function scanRaw051CF3Literals() {
  const hits = [];
  for (let addr = 0; addr <= EXEC_END - 3; addr += 1) {
    if (rom[addr] !== 0xF3 || rom[addr + 1] !== 0x1C || rom[addr + 2] !== 0x05) continue;

    const prev = addr > 0 ? rom[addr - 1] : null;
    let classification = 'standalone literal/pointer candidate';

    if (prev === 0xCD) classification = 'CALL immediate';
    else if (prev === 0xC3) classification = 'JP immediate';
    else if (prev === 0xCC) classification = 'CALL Z immediate';
    else if (prev === 0xC4) classification = 'CALL NZ immediate';
    else if (prev === 0xDC) classification = 'CALL C immediate';
    else if (prev === 0xD4) classification = 'CALL NC immediate';
    else if (prev === 0xCA) classification = 'JP Z immediate';
    else if (prev === 0xC2) classification = 'JP NZ immediate';
    else if (prev === 0xDA) classification = 'JP C immediate';
    else if (prev === 0xD2) classification = 'JP NC immediate';

    hits.push({
      literalAddr: addr,
      ownerPc: classification.includes('immediate') ? addr - 1 : null,
      classification,
      context: bytesAt(Math.max(0, addr - 4), 11),
    });
  }
  return hits;
}

function collectHlSetters(rows) {
  const setters = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'ld-pair-mem' && inst.pair === 'hl' && inst.direction !== 'to-mem') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'ld-pair-ind' && inst.pair === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'add-pair' && inst.dest === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'lea' && inst.dest === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'inc-pair' && inst.pair === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'dec-pair' && inst.pair === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'pop' && inst.pair === 'hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
      continue;
    }
    if (inst.tag === 'ex-de-hl') {
      setters.push(`${hex(row.pc)} ${row.text}`);
    }
  }

  return setters;
}

function magicLeadLabel(byteValue) {
  const label = MAGIC_LABELS.get(byteValue);
  return label ? `  <-- ${label}` : '';
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function reportDirect051CF3Callers() {
  printHeader('Part 1: Direct CALL/JP 0x051CF3');

  const callers = scanAbsoluteCallOrJump(TARGET_ENTRY);
  if (callers.length === 0) {
    console.log('  No direct CALL/JP sites found.');
    return callers;
  }

  for (const caller of callers) {
    console.log(`  ${hex(caller.pc)}  ${caller.kind} ${hex(caller.target)}`);
  }
  return callers;
}

function reportRequestedNearbyRange() {
  printHeader(`Part 2: Requested nearby entry scan ${hex(REQUESTED_SCAN_START)}-${hex(REQUESTED_SCAN_END)}`);

  const hits = scanDirectEntryTargets(REQUESTED_SCAN_START, REQUESTED_SCAN_END, false);
  if (hits.length === 0) {
    console.log('  No direct CALL/JP sites into the requested nearby range.');
    return hits;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.pc)}  ${hit.kind} ${hex(hit.target)}`);
  }
  return hits;
}

function reportExternalRegionEntries() {
  printHeader(`Part 3: External entry points inside ${hex(TARGET_ENTRY)}-${hex(REGION_SCAN_END)}`);

  const hits = scanDirectEntryTargets(TARGET_ENTRY, REGION_SCAN_END, true);
  if (hits.length === 0) {
    console.log('  No external CALL/JP sites into the wider region.');
    return hits;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.pc)}  ${hit.kind} ${hex(hit.target)}`);
  }

  console.log('');
  console.log('  Split-entry note:');
  console.log(`    ${hex(TARGET_ENTRY)} is the only direct entry requested by the brief.`);
  console.log(`    ${hex(WRITER_SITE)} lives under a second external entry at ${hex(WRITER_ENTRY)}.`);
  console.log('    The writer path is therefore in the same local region, but not in the same linear entry.');

  return hits;
}

function reportCallerWindows(callers, title, lookbackBytes = 32) {
  printHeader(title);

  if (callers.length === 0) {
    console.log('  No callers to analyze.');
    return;
  }

  for (const caller of callers) {
    console.log(`\n  Caller ${hex(caller.pc)} -> ${hex(caller.target)} (${caller.kind})`);
    const rows = decodeAroundPc(caller.pc, lookbackBytes, 8);
    printRows(rows, caller.pc, '    ');

    const hlSetters = collectHlSetters(rows.filter((row) => row.pc < caller.pc));
    if (hlSetters.length === 0) {
      console.log('    HL setup in last 32 bytes: none visible');
      console.log('    Interpretation: caller-side HL is not explicitly seeded in the requested window.');
    } else {
      console.log('    HL setup candidates in last 32 bytes:');
      for (const line of hlSetters) {
        console.log(`      ${line}`);
      }
    }
  }
}

function reportWriterSetupAndHlSource() {
  printHeader(`Part 5: Writer setup path ${hex(WRITER_ENTRY)} and internal HL source`);

  console.log(`  Setup slice ${hex(WRITER_ENTRY)}-${hex(WRITER_SITE)}:`);
  printRows(decodeLinear(WRITER_ENTRY, WRITER_SITE + 4), null, '    ');

  console.log('');
  console.log('  Static interpretation of the setup gate:');
  console.log(`    ${hex(WRITER_ENTRY)} seeds A=0xD8, tests BIT 1,(IY+53), then runs CALL NZ ${hex(0x02398E)}.`);
  console.log(`    The next instruction is CALL Z ${hex(HL_TABLE_LOADER)}, so ${hex(HL_TABLE_LOADER)} is the explicit HL table-loader path.`);
  console.log(`    That is the clearest static source for the byte copied at ${hex(WRITER_SITE)}.`);

  console.log('');
  console.log(`  HL loader slice ${hex(HL_TABLE_LOADER)}-${hex(HL_TABLE_LOADER + 0x10)}:`);
  printRows(decodeLinear(HL_TABLE_LOADER, HL_TABLE_LOADER + 0x10), null, '    ');

  console.log('');
  console.log('  HL formula when 0x051F1C runs:');
  console.log(`    index = *(0xD0033A)`);
  console.log(`    slot  = ${hex(HL_TABLE_ROOT)} + 3 * index`);
  console.log('    HL    = *(slot)    // 24-bit pointer load via ED 27');
  console.log(`    A     = *(HL)      // then ${hex(WRITER_SITE)} stores that byte into D0059F`);

  console.log('');
  console.log(`  Candidate pointer-table root for P1: ${hex(HL_TABLE_ROOT)}`);
  console.log('  First 16 pointer slots:');
  for (let index = 0; index < 16; index += 1) {
    const slotAddr = HL_TABLE_ROOT + index * 3;
    const target = read24LE(rom, slotAddr);
    const leadByte = target < rom.length ? rom[target] & 0xFF : null;
    const leadText = leadByte === null ? '??' : hexByte(leadByte);
    console.log(
      `    [${String(index).padStart(2, '0')}] slot=${hex(slotAddr)} -> ${hex(target)}  firstByte=${leadText}${leadByte === null ? '' : magicLeadLabel(leadByte)}`,
    );
  }
}

function reportBitSites() {
  printHeader('Part 6: Internal BIT-test sites');

  const interpretations = new Map([
    [
      0x051D63,
      [
        'BIT 7 set  -> jump to 0x051D91, skip the inline DE payload decode.',
        'BIT 7 clear -> consume two bytes from HL into DE, then store HL -> D00333 and DE -> D00338.',
        'Meaning: bit 7 marks a special/control descriptor instead of a normal inline descriptor.',
      ],
    ],
    [
      0x051D7A,
      [
        'BIT 6 set  -> jump straight to 0x051DA6.',
        'BIT 5 set  -> also jump straight to 0x051DA6 when bit 6 is clear.',
        'A == 0     -> also skips SET 2,(D003E0).',
        'Otherwise  -> SET 2,(D003E0) before continuing.',
        'Meaning: bits 6/5 and zero-value suppress the normal D003E0.bit2 arm.',
      ],
    ],
    [
      0x051DC1,
      [
        `BIT 6 set  -> CALL ${hex(0x051E56)} (highest-priority helper branch).`,
        `else BIT 7 set -> CALL ${hex(0x051E2A)}.`,
        `else BIT 5 set -> CALL ${hex(0x051E40)}.`,
        'else           -> run the generic inline loop at 0x051DE3.',
        'Meaning: later dispatch priority is bit6 > bit7 > bit5 > default.',
      ],
    ],
  ]);

  for (const site of BIT_SITES) {
    console.log(`\n  Around ${hex(site)}:`);
    printRows(decodeAroundPc(site, 20, 20), site, '    ');
    console.log('    Branch meaning:');
    for (const line of interpretations.get(site) ?? []) {
      console.log(`      - ${line}`);
    }
  }
}

function reportRawLiteralRefs() {
  printHeader('Part 7: Raw F3 1C 05 literal scan');

  const hits = scanRaw051CF3Literals();
  if (hits.length === 0) {
    console.log('  No F3 1C 05 literals found.');
    return;
  }

  for (const hit of hits) {
    const owner = hit.ownerPc === null ? 'n/a' : hex(hit.ownerPc);
    console.log(`  literal@${hex(hit.literalAddr)}  owner=${owner}  ${hit.classification}`);
    console.log(`    bytes: ${hit.context}`);
  }

  const standalone = hits.filter((hit) => hit.classification === 'standalone literal/pointer candidate');
  console.log('');
  if (standalone.length === 0) {
    console.log('  Pointer-table result: no standalone 0x051CF3 literals; all matches belong to instruction immediates.');
  } else {
    console.log(`  Pointer-table result: ${standalone.length} standalone literal candidate(s) need follow-up.`);
  }
}

function reportFullRegionDisassembly() {
  printHeader(`Part 8: Full region disassembly ${hex(TARGET_ENTRY)}-${hex(REGION_SCAN_END)}`);
  printRows(decodeLinear(TARGET_ENTRY, REGION_SCAN_END), null, '  ');
}

function reportControlFlowSummary() {
  printHeader('Part 9: Behavior-tree summary');

  console.log('  External entry 0x051CF3:');
  console.log('    - Reads D003E0 bit 3.');
  console.log('    - If bit 3 is clear, seeds D02437/D0243A with D00369 and D0243D/D02440 with D0036C.');
  console.log(`    - Calls ${hex(0x051CE0)}, fills D006DA.. with 0x20/LDIR, writes D00595=1, clears D02506, then JP ${hex(0x0972C3)}.`);
  console.log('    - This entry does not contain the D0059F write.');

  console.log('');
  console.log('  External entry 0x051D37 (writer entry):');
  console.log('    - Writes D00337=1.');
  console.log('    - Chooses an HL source through the IY+53 gate; the explicit table-loader path is 0x051F1C.');
  console.log(`    - Reads A=(HL), advances HL, then writes A -> D0059F at ${hex(WRITER_SITE)}.`);
  console.log('    - Clears D003E0 bits 2 and 3, then conditionally restores bit 3 depending on the 0x051B7C check.');

  console.log('');
  console.log('  D0059F bit interpretation from the local code:');
  console.log('    - bit 7 clear: normal inline descriptor. The next two bytes become DE, then HL -> D00333 and DE -> D00338.');
  console.log('    - bit 7 set: special/control descriptor. The DE payload decode is skipped; D00595 is reset to 1 and 0x051F2C is used.');
  console.log('    - bit 6 set: later dispatch goes to helper 0x051E56.');
  console.log('    - bit 5 set with bits 6/7 clear: later dispatch goes to helper 0x051E40.');
  console.log('    - bits 6/5 clear and A!=0: D003E0 bit 2 is armed before the generic path.');
  console.log('    - A==0: the generic path runs without setting D003E0 bit 2.');

  console.log('');
  console.log('  Later dispatch tree at 0x051DC1:');
  console.log(`    - bit6=1              -> CALL ${hex(0x051E56)} -> shared tail`);
  console.log(`    - bit6=0, bit7=1     -> CALL ${hex(0x051E2A)} -> shared tail`);
  console.log(`    - bit6=0, bit7=0, bit5=1 -> CALL ${hex(0x051E40)} -> shared tail`);
  console.log('    - none of the above   -> inline generic loop at 0x051DE3');

  console.log('');
  console.log('  Direct RAM side effects visible inside 0x051CF3-0x051E20:');
  console.log('    - D02437, D0243A, D0243D, D02440');
  console.log('    - D00595');
  console.log('    - D02506');
  console.log('    - D00337');
  console.log('    - D0059F');
  console.log('    - D00333');
  console.log('    - D00338');
  console.log('    - D008D5');
  console.log('    - D026AC');
  console.log('    - D003E0 bit 2 / bit 3 through SET/RES on (HL)=D003E0');

  console.log('');
  console.log('  Return / exit behavior:');
  console.log(`    - 0x051CF3 exits by JP ${hex(0x0972C3)}.`);
  console.log(`    - 0x051D37 path returns at ${hex(0x051E29)} after restoring D00595 and popping IX.`);
}

function main() {
  console.log('=== Phase 226: 0x051CF3 Callers + HL Table Source ===');
  console.log(`ROM bytes scanned: 0x000000-${hex(EXEC_END)}`);
  console.log(`Primary target entry: ${hex(TARGET_ENTRY)}`);
  console.log(`Observed writer site: ${hex(WRITER_SITE)}`);

  const exactCallers = reportDirect051CF3Callers();
  reportRequestedNearbyRange();
  const externalEntries = reportExternalRegionEntries();
  reportCallerWindows(exactCallers, 'Part 4A: 32-byte windows before direct 0x051CF3 callers');
  reportCallerWindows(
    externalEntries.filter((hit) => hit.target === WRITER_ENTRY),
    `Part 4B: 32-byte windows before direct ${hex(WRITER_ENTRY)} callers`,
  );
  reportWriterSetupAndHlSource();
  reportBitSites();
  reportRawLiteralRefs();
  reportFullRegionDisassembly();
  reportControlFlowSummary();
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase226-051cf3-callers-hl.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
