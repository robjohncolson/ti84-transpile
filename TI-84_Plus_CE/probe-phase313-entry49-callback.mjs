#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = readFileSync(ROM_PATH);

const TARGET_ADDR = 0xD14026;
const TARGET_WORD = TARGET_ADDR & 0xFFFF;
const EXACT_PATTERN = [0x26, 0x40, 0xD1];
const PARTIAL_PATTERN = [0x26, 0x40];
const LOOKBACK = 8;

const HELPER_NAMES = new Map([
  [0x000130, '_frameset0'],
  [0x000138, '_icmpzero'],
  [0x00015C, '_indcall'],
  [0x00218A, '_frameset0 body'],
  [0x0021C2, '_icmpzero body'],
  [0x002288, '_indcall body'],
  [0x00063C, 'vector49 slot'],
  [0x00FBD1, 'vector49 target body'],
  [0x02C0B8, 'direct callback body'],
]);

const SITE_METADATA = new Map([
  [0x00B75E, {
    routine: '0x00B730 (approx)',
    role: 'USB/runtime control path; stores direct callback body 0x00FBD1.',
  }],
  [0x013231, {
    routine: '0x01322D',
    role: 'Shared callback wrapper; reads slot into HL for null-check.',
  }],
  [0x01323F, {
    routine: '0x01322D',
    role: 'Shared callback wrapper; reloads slot into IY and dispatches via _indcall.',
  }],
  [0x02BA66, {
    routine: '0x02BA3A (approx)',
    role: 'USB state/setup path; stores vector 49 (0x00063C) into the callback slot.',
  }],
  [0x041E99, {
    routine: '0x041E95',
    role: 'Second shared callback wrapper; reads slot into HL for null-check.',
  }],
  [0x041EA7, {
    routine: '0x041E95',
    role: 'Second shared callback wrapper; reloads slot into IY and dispatches via _indcall.',
  }],
  [0x048CFC, {
    routine: '0x048CF8',
    role: 'Later runtime rewrite; stores direct callback body 0x02C0B8.',
  }],
]);

const WRAPPER_TARGETS = [0x01322D, 0x041E95];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(start, length) {
  return Array.from(rom.subarray(start, Math.min(start + length, rom.length)))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function searchPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function formatInstruction(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `JP ${nameForTarget(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${nameForTarget(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'call': return `CALL ${nameForTarget(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${nameForTarget(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-ixd-imm':
      return `LD (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'in-reg': return `IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in0': return `IN0 ${inst.reg.toUpperCase()}, (${hex(inst.port, 2)})`;
    case 'out0': return `OUT0 (${hex(inst.port, 2)}), ${inst.reg.toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    default:
      return `[${inst.tag}]`;
  }
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function nameForTarget(target) {
  const helper = HELPER_NAMES.get(target);
  return helper ? `${hex(target)} (${helper})` : hex(target);
}

function findCandidates(hit, mode) {
  const results = [];
  const startMin = Math.max(0, hit - LOOKBACK);
  for (let start = startMin; start <= hit; start += 1) {
    let inst;
    try {
      inst = decodeInstruction(rom, start, mode);
    } catch {
      continue;
    }
    if (!inst || !inst.length) continue;
    if (!(start <= hit && hit < start + inst.length)) continue;

    const isTarget =
      (mode === 'adl' && inst.addr === TARGET_ADDR) ||
      (mode === 'z80' && inst.addr === TARGET_WORD);
    if (!isTarget) continue;

    results.push({ start, mode, inst });
  }

  results.sort((a, b) => {
    const lengthDiff = b.inst.length - a.inst.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.start - b.start;
  });

  return results;
}

function chooseCandidate(hit, mode) {
  const [best] = findCandidates(hit, mode);
  return best ?? null;
}

function findLinearEntry(siteStart, lookback = 24) {
  let best = siteStart;
  const minStart = Math.max(0, siteStart - lookback);
  for (let candidate = minStart; candidate <= siteStart; candidate += 1) {
    let pc = candidate;
    let safety = 0;
    let ok = false;
    while (pc <= siteStart && safety < 32) {
      let inst;
      try {
        inst = decodeInstruction(rom, pc, 'adl');
      } catch {
        ok = false;
        break;
      }
      if (!inst || !inst.length) {
        ok = false;
        break;
      }
      if (pc === siteStart) {
        ok = true;
        break;
      }
      pc += inst.length;
      safety += 1;
    }
    if (ok) {
      best = candidate;
      break;
    }
  }
  return best;
}

function collectContext(siteStart, afterBytes = 28) {
  const start = findLinearEntry(siteStart);
  const end = Math.min(rom.length, siteStart + afterBytes);
  const lines = [];
  let pc = start;
  let safety = 0;
  while (pc < end && safety < 16) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      lines.push({
        addr: pc,
        bytes: bytesAt(pc, 1),
        text: `DB ${hex(rom[pc] ?? 0, 2)}`,
      });
      pc += 1;
      safety += 1;
      continue;
    }
    if (!inst || !inst.length) break;
    lines.push({
      addr: pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInstruction(inst),
    });
    pc += inst.length;
    safety += 1;
  }
  return lines;
}

function classifySite(siteStart, inst) {
  if (inst.tag === 'ld-mem-pair') return 'write';
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') return 'write';
  if (inst.tag === 'ld-mem-reg') return 'write';

  if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-reg-mem') {
    if (inst.pair === 'iy' || inst.dest === 'iy') {
      if (feedsIndirectCall(siteStart)) return 'indirect-call';
    }
    return 'read';
  }

  return 'other';
}

function feedsIndirectCall(siteStart) {
  let pc = siteStart;
  for (let i = 0; i < 4; i += 1) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      return false;
    }
    if (!inst || !inst.length) return false;
    if (
      inst.tag === 'jp-indirect' ||
      (inst.tag === 'call' && (inst.target === 0x00015C || inst.target === 0x002288))
    ) {
      return true;
    }
    pc += inst.length;
  }
  return false;
}

function buildSiteInfo(candidate) {
  const metadata = SITE_METADATA.get(candidate.start) ?? {
    routine: '(unknown)',
    role: '(no manual annotation)',
  };

  const inst = candidate.inst;
  const classification = classifySite(candidate.start, inst);
  const readWrite = classification === 'write'
    ? 'write'
    : (classification === 'read' || classification === 'indirect-call' ? 'read' : 'other');

  let payload = '';
  if (inst.tag === 'ld-mem-pair' || inst.tag === 'ld-pair-imm') {
    payload = inst.pair ? `${inst.pair.toUpperCase()}` : '';
  }
  if (inst.tag === 'ld-mem-pair' || inst.tag === 'ld-pair-mem') {
    payload = inst.pair.toUpperCase();
  } else if (inst.tag === 'ld-reg-mem') {
    payload = inst.dest.toUpperCase();
  } else if (inst.tag === 'ld-mem-reg') {
    payload = inst.src.toUpperCase();
  }

  return {
    site: candidate.start,
    mode: candidate.mode,
    instruction: formatInstruction(inst),
    classification,
    readWrite,
    routine: metadata.routine,
    role: metadata.role,
    payload,
    context: collectContext(candidate.start),
  };
}

function findCallRefs(target) {
  const low = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const high = (target >> 16) & 0xFF;
  const refs = [];

  const callOps = new Set([
    0xCD, 0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA,
    0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
  ]);

  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    if (!callOps.has(rom[pc])) continue;
    if (rom[pc + 1] !== low || rom[pc + 2] !== mid || rom[pc + 3] !== high) continue;
    refs.push(pc);
  }

  return refs;
}

function table(rows, columns) {
  const widths = columns.map((column) => {
    const header = column.label.length;
    const cells = rows.map((row) => String(row[column.key] ?? '').length);
    return Math.max(header, ...cells);
  });

  const header = columns.map((column, index) => column.label.padEnd(widths[index])).join('  ');
  const rule = widths.map((width) => '-'.repeat(width)).join('  ');
  const body = rows.map((row) =>
    columns
      .map((column, index) => String(row[column.key] ?? '').padEnd(widths[index]))
      .join('  ')
  );

  return [header, rule, ...body].join('\n');
}

function main() {
  const exactHits = searchPattern(EXACT_PATTERN);
  const partialHits = searchPattern(PARTIAL_PATTERN);

  const exactSites = [];
  const siteByStart = new Map();
  for (const hit of exactHits) {
    const candidate = chooseCandidate(hit, 'adl');
    if (!candidate) continue;
    if (!siteByStart.has(candidate.start)) {
      const info = buildSiteInfo(candidate);
      siteByStart.set(candidate.start, info);
      exactSites.push(info);
    }
  }

  const partialAliasHits = [];
  const partialDistinctSites = [];
  const partialFalsePositives = [];
  const distinct16Starts = new Set();

  for (const hit of partialHits) {
    const candidate = chooseCandidate(hit, 'z80');
    if (!candidate) {
      partialFalsePositives.push(hit);
      continue;
    }

    if (siteByStart.has(candidate.start)) {
      partialAliasHits.push(hit);
      continue;
    }

    if (distinct16Starts.has(candidate.start)) {
      partialAliasHits.push(hit);
      continue;
    }

    distinct16Starts.add(candidate.start);
    partialDistinctSites.push(buildSiteInfo(candidate));
  }

  exactSites.sort((a, b) => a.site - b.site);
  partialDistinctSites.sort((a, b) => a.site - b.site);

  const readCount = exactSites.filter((site) => site.readWrite === 'read').length;
  const writeCount = exactSites.filter((site) => site.readWrite === 'write').length;
  const indirectCount = exactSites.filter((site) => site.classification === 'indirect-call').length;

  const siteRows = exactSites.map((site) => ({
    site: hex(site.site),
    class: site.classification,
    routine: site.routine,
    payload: site.payload || '-',
    instruction: site.instruction,
  }));

  console.log('Phase 313: Entry 49 Callback Trace');
  console.log(`Target RAM slot: ${hex(TARGET_ADDR)}`);
  console.log('');
  console.log('Raw byte search');
  console.log(`- Exact 24-bit pattern ${EXACT_PATTERN.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}: ${exactHits.length} hit(s)`);
  console.log(`- Partial 16-bit pattern ${PARTIAL_PATTERN.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}: ${partialHits.length} hit(s)`);
  console.log(`- Distinct ADL reference instructions: ${exactSites.length}`);
  console.log(`- Reads vs writes: ${readCount} read(s), ${writeCount} write(s)`);
  console.log(`- Read sites that immediately dispatch through _indcall: ${indirectCount}`);
  console.log(`- Additional distinct 16-bit-only sites: ${partialDistinctSites.length}`);
  console.log(`- Partial-search collisions unrelated to ${hex(TARGET_ADDR)}: ${partialFalsePositives.length}`);
  console.log('');
  console.log('Reference sites');
  console.log(table(siteRows, [
    { key: 'site', label: 'Site' },
    { key: 'class', label: 'Class' },
    { key: 'routine', label: 'Routine' },
    { key: 'payload', label: 'Reg' },
    { key: 'instruction', label: 'Instruction' },
  ]));
  console.log('');

  for (const site of exactSites) {
    console.log(`${hex(site.site)}  ${site.classification}  ${site.routine}`);
    console.log(`  note: ${site.role}`);
    for (const line of site.context) {
      const marker = line.addr === site.site ? '>' : ' ';
      console.log(` ${marker} ${hex(line.addr)}  ${line.bytes.padEnd(16)}  ${line.text}`);
    }
    console.log('');
  }

  console.log('Wrapper call counts');
  for (const wrapper of WRAPPER_TARGETS) {
    const refs = findCallRefs(wrapper);
    const sample = refs.slice(0, 8).map((addr) => hex(addr)).join(', ');
    console.log(`- ${hex(wrapper)}: ${refs.length} direct CALL/JP ref(s); sample call sites: ${sample}`);
  }
  console.log('');

  console.log('Indirect dispatch chain');
  console.log(`- ${hex(0x01322D)} and ${hex(0x041E95)} both do: CALL ${nameForTarget(0x000130)} -> LD HL, (${hex(TARGET_ADDR)}) -> CALL ${nameForTarget(0x000138)} -> LD IY, (${hex(TARGET_ADDR)}) -> CALL ${nameForTarget(0x00015C)}.`);
  console.log(`- ${nameForTarget(0x00015C)} is a single-instruction trampoline: JP (IY).`);
  console.log(`- The slot is therefore invoked as a null-checked indirect jump, not as a literal CALL ${hex(0x00063C)}.`);
  console.log('');

  if (partialDistinctSites.length > 0) {
    console.log('Distinct 16-bit-only candidate sites');
    for (const site of partialDistinctSites) {
      console.log(`- ${hex(site.site)} ${site.instruction}`);
    }
  } else {
    console.log('Distinct 16-bit-only candidate sites');
    console.log(`- none; the 16-bit search only rediscovered the same seven ADL sites plus ${partialFalsePositives.length} unrelated collisions.`);
  }
}

main();
