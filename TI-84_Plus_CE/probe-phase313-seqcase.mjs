#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const VECTOR_ADDR = 0x000210;
const SEQCASE_ADDR = 0x002623;
const CALL_OPCODE = 0xcd;

const EXPECTED_VECTOR_CALLS = 49;
const EXPECTED_DIRECT_CALLS = 34;
const VALUE_WRAP = 6;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16(rom, offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function read24(rom, offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function formatSignedOffset(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(register, displacement) {
  return `(${register}${formatSignedOffset(displacement)})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ex-sp-pair':
      return `ex (sp), ${inst.pair}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'lea':
      return `lea ${inst.dest}, ${inst.base}${formatSignedOffset(inst.displacement)}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ret':
      return 'ret';
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disassembleSeqcase(rom) {
  const lines = [];
  let pc = SEQCASE_ADDR;

  while (true) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const bytes = rom.slice(inst.pc, inst.nextPc);
    lines.push({
      pc: inst.pc,
      bytes: formatBytes(bytes),
      text: formatInstruction(inst),
    });

    pc = inst.nextPc;
    if (inst.tag === 'ret') break;
  }

  return lines;
}

function findCallSites(rom, target) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    if (rom[pc] !== CALL_OPCODE) continue;
    if (read24(rom, pc + 1) !== target) continue;
    hits.push(pc);
  }

  return hits;
}

function decodeTable(rom, callSite, kind) {
  const tableStart = callSite + 4;
  const count = read16(rom, tableStart);
  const base = read24(rom, tableStart + 2);
  const caseTargets = [];

  for (let index = 0; index < count; index += 1) {
    caseTargets.push(read24(rom, tableStart + 5 + index * 3));
  }

  const defaultTarget = read24(rom, tableStart + 5 + count * 3);
  const tableEnd = tableStart + 5 + (count + 1) * 3;

  return {
    kind,
    callSite,
    tableStart,
    count,
    base,
    caseTargets,
    defaultTarget,
    tableEnd,
    rawBytes: rom.slice(tableStart, tableEnd),
  };
}

function validateSite(rom, site) {
  if (site.tableEnd > rom.length) {
    throw new Error(`${site.kind} caller ${hex(site.callSite)} table overruns ROM`);
  }

  for (const target of [...site.caseTargets, site.defaultTarget]) {
    if (target >= rom.length) {
      throw new Error(`${site.kind} caller ${hex(site.callSite)} target ${hex(target)} is outside ROM`);
    }
  }

  decodeInstruction(rom, site.tableEnd, 'adl');
}

function summarizeSites(sites) {
  const countFreq = new Map();
  const baseFreq = new Map();
  let case0AtTableEnd = 0;
  let maxTable = sites[0];

  for (const site of sites) {
    countFreq.set(site.count, (countFreq.get(site.count) || 0) + 1);
    baseFreq.set(site.base, (baseFreq.get(site.base) || 0) + 1);
    if (site.caseTargets[0] === site.tableEnd) {
      case0AtTableEnd += 1;
    }
    if (site.count > maxTable.count) {
      maxTable = site;
    }
  }

  return {
    countFreq,
    baseFreq,
    case0AtTableEnd,
    maxTable,
  };
}

function formatFrequencyMap(map, formatter = (value) => String(value)) {
  return [...map.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([value, count]) => `${formatter(value)}:${count}`)
    .join(' ');
}

function printCallSite(site) {
  console.log(
    `[${site.kind}] caller=${hex(site.callSite)} table=${hex(site.tableStart)} count=${site.count} base=${hex(site.base)} default=${hex(site.defaultTarget)}`
  );

  const entries = [];
  for (let index = 0; index < site.caseTargets.length; index += 1) {
    entries.push(`${hex(site.base + index)}->${hex(site.caseTargets[index])}`);
  }
  entries.push(`default->${hex(site.defaultTarget)}`);

  for (let index = 0; index < entries.length; index += VALUE_WRAP) {
    console.log(`  ${entries.slice(index, index + VALUE_WRAP).join(', ')}`);
  }
}

function main() {
  const rom = readFileSync(ROM_PATH);

  const seqcaseDisasm = disassembleSeqcase(rom);
  const vectorSites = findCallSites(rom, VECTOR_ADDR).map((callSite) => decodeTable(rom, callSite, 'vector'));
  const directSites = findCallSites(rom, SEQCASE_ADDR).map((callSite) => decodeTable(rom, callSite, 'direct'));

  if (vectorSites.length !== EXPECTED_VECTOR_CALLS) {
    throw new Error(`expected ${EXPECTED_VECTOR_CALLS} vector call sites, found ${vectorSites.length}`);
  }
  if (directSites.length !== EXPECTED_DIRECT_CALLS) {
    throw new Error(`expected ${EXPECTED_DIRECT_CALLS} direct call sites, found ${directSites.length}`);
  }

  for (const site of [...vectorSites, ...directSites]) {
    validateSite(rom, site);
  }

  const vectorSummary = summarizeSites(vectorSites);
  const directSummary = summarizeSites(directSites);

  console.log('Phase 313: _seqcase inline table map');
  console.log(`vector ${hex(VECTOR_ADDR)} -> ${hex(SEQCASE_ADDR)}`);
  console.log('');
  console.log('Findings:');
  console.log('- selector register: HL');
  console.log('- header layout: [u16 case_count][u24 base_value]');
  console.log('- target layout: count sequential 24-bit targets plus one 24-bit default target');
  console.log('- dispatch: clamp (HL - base_value) into 0..case_count, fetch target[count_or_index], rewrite return address, ret');
  console.log('- implementation style: no loop, no CPIR, no value/target pair scan');
  console.log('');
  console.log('_seqcase disassembly:');
  for (const line of seqcaseDisasm) {
    console.log(`${hex(line.pc)}  ${line.bytes.padEnd(11)}  ${line.text}`);
  }
  console.log('');
  console.log('Validation summary:');
  console.log(
    `- vector call sites: ${vectorSites.length} (case0 == tableEnd for ${vectorSummary.case0AtTableEnd}/${vectorSites.length})`
  );
  console.log(
    `- direct call sites: ${directSites.length} (case0 == tableEnd for ${directSummary.case0AtTableEnd}/${directSites.length})`
  );
  console.log(`- vector count frequencies: ${formatFrequencyMap(vectorSummary.countFreq)}`);
  console.log(`- vector base frequencies: ${formatFrequencyMap(vectorSummary.baseFreq, (value) => hex(value))}`);
  console.log(`- direct count frequencies: ${formatFrequencyMap(directSummary.countFreq)}`);
  console.log(`- direct base frequencies: ${formatFrequencyMap(directSummary.baseFreq, (value) => hex(value))}`);
  console.log(
    `- largest direct table: caller ${hex(directSummary.maxTable.callSite)} count=${directSummary.maxTable.count} base=${hex(directSummary.maxTable.base)}`
  );
  console.log('');
  console.log('Vector call sites (49):');
  for (const site of vectorSites) {
    printCallSite(site);
  }
  console.log('');
  console.log('Additional direct call sites (34, same format):');
  for (const site of directSites) {
    printCallSite(site);
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
