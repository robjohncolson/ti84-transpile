#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'ROM.transpiled.report.json');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs');

const RAW_DUMP_BYTES = 16;
const MAX_DECODE_ROWS = 6;
const DEFAULT_DECODE_MODE = 'adl';
const BLOCK_MODES = ['adl', 'z80'];

const TARGETS = [
  { address: 0x0012CA, label: 'JP target from 0x0006A9' },
  { address: 0x0019B5, label: 'JP target from 0x000704' },
  { address: 0x0019BE, label: 'JP NZ target from 0x000704' },
  { address: 0x02010C, label: 'JP target in post-PLL boot path' },
  { address: 0x001713, label: 'CALL target in post-PLL boot path' },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexLower(value, width = 6) {
  return (Number(value) >>> 0).toString(16).padStart(width, '0');
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withModePrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm': {
      const prefix = inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc'
        ? `${inst.op} a, `
        : `${inst.op} `;
      return withModePrefix(inst, `${prefix}${hex(inst.value, 2)}`);
    }
    case 'alu-reg': {
      const prefix = inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc'
        ? `${inst.op} a, `
        : `${inst.op} `;
      return withModePrefix(inst, `${prefix}${inst.src}`);
    }
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'di':
    case 'ei':
    case 'halt':
    case 'neg':
    case 'nop':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'scf':
      return withModePrefix(inst, inst.tag);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'in-reg':
      return withModePrefix(inst, `in ${inst.reg}, (${inst.port ?? 'c'})`);
    case 'in0':
      return withModePrefix(inst, `in0 ${inst.reg}, (${hex(inst.port, 2)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hex(inst.value, 2)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'out-reg':
      return withModePrefix(inst, `out (${inst.port ?? 'c'}), ${inst.reg}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hex(inst.port, 2)}), ${inst.reg}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'rst':
      return withModePrefix(inst, `rst ${hex(inst.target, 2)}`);
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${inst.src}`);
    default: {
      const ignored = new Set([
        'fallthrough',
        'kind',
        'length',
        'mode',
        'modePrefix',
        'nextMode',
        'nextPc',
        'pc',
        'targetMode',
        'terminates',
      ]);
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
          continue;
        }
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
    }
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

function extractSeedFiles(transpilerSource) {
  const matches = [];
  const seen = new Set();
  const regex = /'TI-84_Plus_CE',\s*'([^']*seed[^']*\.txt)'/gi;

  for (const match of transpilerSource.matchAll(regex)) {
    const relativePath = path.join('TI-84_Plus_CE', match[1]);
    if (seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    matches.push(path.join(repoRoot, relativePath));
  }

  return matches;
}

function findInlineSeedLines(transpilerSource, address) {
  const regex = new RegExp(`pc\\s*:\\s*0x${hexLower(address)}\\b`, 'i');
  const matches = [];
  const lines = transpilerSource.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (regex.test(lines[index])) {
      matches.push(index + 1);
    }
  }

  return matches;
}

function findExternalSeedMatches(seedFiles, address) {
  const candidates = new Set([hexLower(address), `0x${hexLower(address)}`]);
  const matches = [];

  for (const filePath of seedFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const hitLines = [];
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const normalized = lines[index].replace(/#.*/, '').trim().toLowerCase();
      if (candidates.has(normalized)) {
        hitLines.push(index + 1);
      }
    }

    if (hitLines.length > 0) {
      matches.push({
        path: path.relative(repoRoot, filePath),
        lines: hitLines,
      });
    }
  }

  return matches;
}

async function searchFileForPatterns(filePath, items) {
  const normalizedItems = items.map((item) => ({
    ...item,
    patterns: item.patterns.map((pattern) => pattern.toLowerCase()),
  }));
  const found = new Map(normalizedItems.map((item) => [item.id, false]));
  const maxPatternLength = Math.max(...normalizedItems.flatMap((item) => item.patterns.map((pattern) => pattern.length)));
  let carry = '';

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024,
  });

  for await (const chunk of stream) {
    const text = (carry + chunk).toLowerCase();

    for (const item of normalizedItems) {
      if (!found.get(item.id) && item.patterns.some((pattern) => text.includes(pattern))) {
        found.set(item.id, true);
      }
    }

    carry = maxPatternLength > 1 ? text.slice(-(maxPatternLength - 1)) : '';

    if ([...found.values()].every(Boolean)) {
      break;
    }
  }

  return found;
}

async function findTranspiledBlocks() {
  const items = [];

  for (const target of TARGETS) {
    const address = hexLower(target.address);
    for (const mode of BLOCK_MODES) {
      items.push({
        id: `${address}:${mode}`,
        patterns: [
          `"${address}:${mode}": {`,
          `block_${address}_${mode}`,
        ],
      });
    }
  }

  return searchFileForPatterns(TRANSPILED_PATH, items);
}

function inspectReport(reportJson) {
  const candidateFields = [
    'blocks',
    'generatedBlocks',
    'blockIds',
    'entries',
    'preliftedBlocks',
  ];
  const explicitField = candidateFields.find((field) => field in reportJson);

  if (explicitField) {
    return { field: explicitField, available: true };
  }

  for (const [key, value] of Object.entries(reportJson)) {
    if (!/(block|entry)/i.test(key)) {
      continue;
    }
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      return { field: key, available: true };
    }
  }

  return { field: null, available: false };
}

function reportListsAddress(reportJson, reportInfo, address) {
  if (!reportInfo.available) {
    return null;
  }

  const candidate = reportJson[reportInfo.field];
  const lower = hexLower(address);

  const matchesValue = (value) => {
    if (typeof value === 'number') {
      return value === address;
    }
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      return normalized.includes(`0x${lower}`) || normalized.includes(`${lower}:`) || normalized === lower;
    }
    if (!value || typeof value !== 'object') {
      return false;
    }

    return matchesValue(value.id)
      || matchesValue(value.startPc)
      || matchesValue(value.pc)
      || matchesValue(value.address);
  };

  if (Array.isArray(candidate)) {
    return candidate.some((value) => matchesValue(value));
  }

  if (candidate && typeof candidate === 'object') {
    return Object.entries(candidate).some(([key, value]) => matchesValue(key) || matchesValue(value));
  }

  return false;
}

function decodeFromRom(romBytes, decodeInstruction, address, mode) {
  const rows = [];
  const end = Math.min(address + RAW_DUMP_BYTES, romBytes.length);
  let pc = address;

  while (pc < end && rows.length < MAX_DECODE_ROWS) {
    let inst = null;

    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      const byte = romBytes[pc];
      rows.push({
        kind: 'raw',
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        text: `db ${hex(byte, 2)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      kind: 'decoded',
      pc,
      bytes: hexBytes(romBytes, pc, inst.length),
      text: formatInstruction(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function isLikelyCode(sampleBytes, decodedRows) {
  if (sampleBytes.length === 0) {
    return false;
  }

  if (sampleBytes.every((value) => value === 0xFF)) {
    return false;
  }

  return decodedRows.some((row) => row.kind === 'decoded');
}

function formatSeedSummary(inlineSeedLines, externalSeedMatches) {
  const parts = [];

  if (inlineSeedLines.length > 0) {
    parts.push(`inline transpiler seed at scripts/transpile-ti84-rom.mjs:${inlineSeedLines.join(',')}`);
  }

  for (const match of externalSeedMatches) {
    parts.push(`seed file ${match.path}:${match.lines.join(',')}`);
  }

  if (parts.length === 0) {
    return 'not explicitly seeded in transpiler source or loaded seed files';
  }

  return parts.join('; ');
}

async function main() {
  ensureFileExists(TRANSPILED_PATH);
  ensureFileExists(REPORT_PATH);
  ensureFileExists(ROM_PATH);
  ensureFileExists(TRANSPILER_PATH);
  ensureFileExists(DECODER_PATH);

  const transpilerSource = fs.readFileSync(TRANSPILER_PATH, 'utf8');
  const seedFiles = extractSeedFiles(transpilerSource);
  const reportJson = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const reportInfo = inspectReport(reportJson);
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
  const transpiledMatches = await findTranspiledBlocks();

  console.log('Phase 351 Missing-Block Probe');
  console.log('=============================');
  console.log(`Targets: ${TARGETS.length}`);
  console.log(`Transpiled file: ${path.basename(TRANSPILED_PATH)}`);
  console.log(`Report blockCount: ${reportJson.blockCount ?? 'n/a'}`);
  console.log(`Report seedCount: ${reportJson.seedCount ?? 'n/a'}`);
  if (reportInfo.available) {
    console.log(`Report per-block field: ${reportInfo.field}`);
  } else {
    console.log(`Report per-block field: none (summary-only keys: ${Object.keys(reportJson).join(', ')})`);
  }
  console.log(`Seed files scanned: ${seedFiles.length}`);
  console.log('');

  const results = [];

  for (const target of TARGETS) {
    const addressKey = hexLower(target.address);
    const modeStatus = {};

    for (const mode of BLOCK_MODES) {
      modeStatus[mode] = transpiledMatches.get(`${addressKey}:${mode}`) === true;
    }

    const exists = BLOCK_MODES.some((mode) => modeStatus[mode]);
    const inlineSeedLines = findInlineSeedLines(transpilerSource, target.address);
    const externalSeedMatches = findExternalSeedMatches(seedFiles, target.address);
    const reportStatus = reportListsAddress(reportJson, reportInfo, target.address);

    console.log(`${hex(target.address)}  ${target.label}`);
    console.log(`  transpiled: ${exists ? 'EXISTS' : 'MISSING'} (adl=${modeStatus.adl ? 'yes' : 'no'}, z80=${modeStatus.z80 ? 'yes' : 'no'})`);
    console.log(`  seeds: ${formatSeedSummary(inlineSeedLines, externalSeedMatches)}`);
    if (reportStatus === null) {
      console.log('  report: summary-only report; no per-block listing to check');
    } else {
      console.log(`  report: ${reportStatus ? 'lists this block' : 'does not list this block'}`);
    }

    let missingDetails = null;
    if (!exists) {
      const sampleBytes = romBytes.subarray(target.address, Math.min(target.address + RAW_DUMP_BYTES, romBytes.length));
      const decodedRows = decodeFromRom(romBytes, decodeInstruction, target.address, DEFAULT_DECODE_MODE);
      const likelyCode = isLikelyCode(sampleBytes, decodedRows);

      console.log(`  rom bytes: ${hexBytes(romBytes, target.address, RAW_DUMP_BYTES)}`);
      console.log(`  decode (${DEFAULT_DECODE_MODE}):`);
      for (const row of decodedRows) {
        console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
      }
      if (decodedRows.length === 0) {
        console.log('    <no decodable bytes>');
      }
      if (likelyCode) {
        console.log(`  ACTION: ADD SEED ${hex(target.address)} to transpiler`);
      } else {
        console.log('  ACTION: missing block does not look like live code from this sample');
      }

      missingDetails = {
        sampleBytes: hexBytes(romBytes, target.address, RAW_DUMP_BYTES),
        decodeMode: DEFAULT_DECODE_MODE,
        decodedRows,
        likelyCode,
      };
    }

    console.log('');

    results.push({
      ...target,
      exists,
      modeStatus,
      inlineSeedLines,
      externalSeedMatches,
      reportStatus,
      missingDetails,
    });
  }

  const existingCount = results.filter((result) => result.exists).length;
  const explicitSeedCount = results.filter((result) => result.inlineSeedLines.length > 0 || result.externalSeedMatches.length > 0).length;
  const missingSeedRecommendations = results
    .filter((result) => !result.exists && result.missingDetails?.likelyCode)
    .map((result) => hex(result.address));

  console.log('Summary');
  console.log('-------');
  console.log(`Existing blocks: ${existingCount}/${results.length}`);
  console.log(`Explicitly seeded targets: ${explicitSeedCount}/${results.length}`);
  if (missingSeedRecommendations.length > 0) {
    console.log(`ADD SEED: ${missingSeedRecommendations.join(', ')}`);
  } else {
    console.log('ADD SEED: none');
  }
  if (existingCount > 0 && explicitSeedCount < existingCount) {
    console.log('Note: existing-but-unseeded targets were likely discovered by CFG reachability rather than explicit seeding.');
  }
}

await main();
