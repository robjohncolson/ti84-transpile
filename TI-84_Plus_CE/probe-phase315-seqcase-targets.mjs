#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase315-seqcase-targets-report.md');
const CONTINUATION_PATH = path.join(REPO_ROOT, 'CONTINUATION_PROMPT_CODEX.md');
const TRANSPILER_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

const VECTOR_ADDR = 0x000210;
const SEQCASE_ADDR = 0x002623;
const CALL_OPCODE = 0xcd;

const EXPECTED_VECTOR_CALLS = 49;
const EXPECTED_DIRECT_CALLS = 34;
const TOP_TARGET_COUNT = 10;
const BYTE_PREVIEW = 8;
const MAX_RANGE_SPAN = 0x1000;

const GENERIC_FIRST_WORDS = new Set([
  'a',
  'all',
  'an',
  'and',
  'auto',
  'bit',
  'block',
  'boot',
  'both',
  'byte',
  'bytes',
  'call',
  'caller',
  'callers',
  'case',
  'cluster',
  'code',
  'conditional',
  'context',
  'count',
  'default',
  'direct',
  'display',
  'entry',
  'event',
  'exact',
  'extended',
  'foreground',
  'function',
  'graph',
  'handler',
  'home',
  'human',
  'init',
  'isr',
  'jp',
  'key',
  'largest',
  'line',
  'loop',
  'manual',
  'menu',
  'mode',
  'next',
  'phase',
  'polling',
  'post',
  'previous',
  'primary',
  'probe',
  'range',
  'real',
  'report',
  'result',
  'routine',
  'screen',
  'selector',
  'session',
  'shared',
  'single',
  'site',
  'slot',
  'stack',
  'stat',
  'step',
  'steps',
  'stride',
  'table',
  'target',
  'text',
  'the',
  'tight',
  'timer',
  'top',
  'two',
  'usb',
  'vector',
  'write',
]);

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

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeRawName(value) {
  return normalizeWhitespace(
    value
      .replace(/[`*_>#]/g, ' ')
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^\W+|\W+$/g, ' ')
  );
}

function simplifyName(rawName) {
  const cleaned = sanitizeRawName(rawName);
  if (!cleaned) return '';

  const strongToken = cleaned.match(/\b_?[A-Za-z][A-Za-z0-9_]*(?:\(\))?\b/);
  if (strongToken) {
    const token = strongToken[0];
    if (
      /^_/.test(token) ||
      /\(\)$/.test(token) ||
      /[a-z][A-Z]/.test(token) ||
      /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(token)
    ) {
      return token;
    }
  }

  return cleaned;
}

function isLikelyName(name) {
  if (!name || !/[A-Za-z]/.test(name)) return false;

  const cleaned = name.replace(/^[^A-Za-z_]+/, '');
  if (!cleaned) return false;

  const firstWord = cleaned.split(/\s+/)[0].toLowerCase();
  if (GENERIC_FIRST_WORDS.has(firstWord)) return false;

  if (/^(?:phase|session)\b/i.test(cleaned)) return false;
  if (/\b(?:callers?|steps?|bytes?|report|probe)\b/i.test(cleaned) && !/^_/.test(cleaned)) return false;

  return true;
}

function isLikelyRangeName(name) {
  if (!isLikelyName(name)) return false;

  if (/^[a-z]/.test(name) && !/^_/.test(name) && !/[a-z][A-Z]/.test(name)) {
    return false;
  }

  if (name.split(' ').length > 5 && !/^_/.test(name) && !/[a-z][A-Z]/.test(name)) {
    return false;
  }

  return true;
}

function scoreName(name) {
  let score = 0;

  if (/^_/.test(name)) score += 6;
  if (/[a-z][A-Z]/.test(name)) score += 5;
  if (/\(\)$/.test(name)) score += 4;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) score += 3;
  if (/\b(?:FULLY|DISASSEMBLED|CORRECTION|DISCOVERY|COMPLETE)\b/i.test(name)) score -= 2;
  if (name.split(' ').length > 4) score -= 1;

  return score;
}

function relativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll('\\', '/');
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
}

function loadSeqcaseSites(rom) {
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

  return { vectorSites, directSites, allSites: [...vectorSites, ...directSites] };
}

function addExactName(map, address, rawName, sourcePath, lineNumber, via) {
  const name = simplifyName(rawName);
  if (!isLikelyName(name)) return;

  let byName = map.get(address);
  if (!byName) {
    byName = new Map();
    map.set(address, byName);
  }

  let entry = byName.get(name);
  if (!entry) {
    entry = {
      name,
      score: scoreName(name),
      sources: new Set(),
      vias: new Set(),
    };
    byName.set(name, entry);
  }

  entry.sources.add(`${relativePath(sourcePath)}:${lineNumber}`);
  entry.vias.add(via);
}

function addRangeMatch(ranges, start, end, rawName, sourcePath, lineNumber, via) {
  const name = simplifyName(rawName);
  if (!isLikelyRangeName(name)) return;
  if (end - start > MAX_RANGE_SPAN) return;

  ranges.push({
    start,
    end,
    name,
    score: scoreName(name),
    source: `${relativePath(sourcePath)}:${lineNumber}`,
    via,
  });
}

function parseAddress(value) {
  return Number.parseInt(value.replace(/^0x/i, ''), 16);
}

function scanKnownAddresses() {
  const pointMatches = new Map();
  const rangeMatches = [];

  const phaseReportPaths = readdirSync(__dirname)
    .filter((name) => /^phase.*-report\.md$/i.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(__dirname, name));

  const sourcePaths = [CONTINUATION_PATH, TRANSPILER_PATH, ...phaseReportPaths];

  const rangePatterns = [
    {
      via: 'name(range)',
      regex: /([A-Za-z_][A-Za-z0-9_\/.+\-]*(?:\s+[A-Za-z_][A-Za-z0-9_\/.+\-()]*){0,7})\s*\((0x[0-9A-Fa-f]{4,6})\s*-\s*(0x[0-9A-Fa-f]{4,6})/g,
      extract(match) {
        return { name: match[1], start: parseAddress(match[2]), end: parseAddress(match[3]) };
      },
    },
  ];

  const exactPatterns = [
    {
      via: 'name at addr',
      regex: /([A-Za-z_][A-Za-z0-9_\/.+\-]*(?:\s+[A-Za-z_][A-Za-z0-9_\/.+\-()]*){0,7})\s+at\s+(0x[0-9A-Fa-f]{4,6})\b/g,
      extract(match) {
        return { name: match[1], address: parseAddress(match[2]) };
      },
    },
    {
      via: 'addr = name',
      regex: /\b(0x[0-9A-Fa-f]{4,6})\s*=\s*([A-Za-z_][^,.;)\]]{1,80})/g,
      extract(match) {
        return { address: parseAddress(match[1]), name: match[2] };
      },
    },
    {
      via: 'addr is name',
      regex: /\b(0x[0-9A-Fa-f]{4,6})\s+(?:IS|is)\s+([A-Za-z_][^—.;)\]]{1,80})/g,
      extract(match) {
        return { address: parseAddress(match[1]), name: match[2] };
      },
    },
    {
      via: 'name(addr)',
      regex: /([A-Za-z_][A-Za-z0-9_\/.+\-]*(?:\s+[A-Za-z_][A-Za-z0-9_\/.+\-()]*){0,6})\s*\((0x[0-9A-Fa-f]{4,6})\)/g,
      extract(match) {
        return { name: match[1], address: parseAddress(match[2]) };
      },
    },
  ];

  for (const sourcePath of sourcePaths) {
    const lines = readFileSync(sourcePath, 'utf8').split(/\r?\n/);

    for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
      const line = lines[lineNumber - 1];

      for (const pattern of rangePatterns) {
        pattern.regex.lastIndex = 0;
        let match = pattern.regex.exec(line);
        while (match) {
          const { name, start, end } = pattern.extract(match);
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
            addRangeMatch(rangeMatches, start, end, name, sourcePath, lineNumber, pattern.via);
          }
          match = pattern.regex.exec(line);
        }
      }

      for (const pattern of exactPatterns) {
        pattern.regex.lastIndex = 0;
        let match = pattern.regex.exec(line);
        while (match) {
          const { name, address } = pattern.extract(match);
          if (Number.isFinite(address)) {
            addExactName(pointMatches, address, name, sourcePath, lineNumber, pattern.via);
          }
          match = pattern.regex.exec(line);
        }
      }
    }
  }

  return { pointMatches, rangeMatches };
}

function pickBestName(matchMap) {
  if (!matchMap || matchMap.size === 0) return null;

  return [...matchMap.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.name.length !== right.name.length) return left.name.length - right.name.length;
    return left.name.localeCompare(right.name);
  })[0];
}

function inspectTarget(rom, address) {
  const bytes = rom.slice(address, address + BYTE_PREVIEW);
  const previewBytes = formatBytes(bytes);

  let firstInstruction = null;
  let secondInstruction = null;

  try {
    firstInstruction = decodeInstruction(rom, address, 'adl');
    if (firstInstruction?.nextPc > address && firstInstruction.nextPc < rom.length) {
      secondInstruction = decodeInstruction(rom, firstInstruction.nextPc, 'adl');
    }
  } catch {
    // Leave previews null if decoding fails at a target.
  }

  const firstTag = firstInstruction?.tag || 'unknown';
  let shape = 'straight-line';

  if (firstTag === 'jp' || firstTag === 'jp-conditional') {
    shape = 'jp-trampoline';
  } else if (firstTag === 'jr' || firstTag === 'jr-conditional') {
    shape = 'jr-branch';
  } else if (firstTag === 'ret' || firstTag === 'ret-conditional') {
    shape = 'return-stub';
  } else if (firstTag === 'call' || firstTag === 'call-conditional') {
    shape = 'call-wrapper';
  } else if (firstTag === 'push') {
    shape = 'push-entry';
    if (secondInstruction?.tag === 'push' || secondInstruction?.tag?.startsWith('ld-') || secondInstruction?.tag === 'add-pair') {
      shape = 'stack-prologue';
    }
  } else if (firstTag.startsWith('ld-') || firstTag === 'lea') {
    shape = 'register-setup';
  }

  return {
    previewBytes,
    firstTag,
    secondTag: secondInstruction?.tag || null,
    shape,
  };
}

function buildTargetRecords(rom, sites, known) {
  const targets = new Map();
  const shapeCounts = new Map();

  function noteTarget(target, site, index, isDefault) {
    let record = targets.get(target);
    if (!record) {
      const exactMatches = known.pointMatches.get(target) || new Map();
      const rangeMatches = known.rangeMatches
        .filter((entry) => entry.start <= target && target <= entry.end)
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          const leftSpan = left.end - left.start;
          const rightSpan = right.end - right.start;
          if (leftSpan !== rightSpan) return leftSpan - rightSpan;
          return left.name.localeCompare(right.name);
        });
      const bestExact = pickBestName(exactMatches);
      const bestRange = rangeMatches[0] || null;
      const inspection = inspectTarget(rom, target);

      record = {
        address: target,
        refs: 0,
        sites: [],
        exactMatches,
        rangeMatches,
        bestExact,
        bestRange,
        bestName: bestExact?.name || bestRange?.name || null,
        matchType: bestExact ? 'exact' : (bestRange ? 'range' : 'unknown'),
        previewBytes: inspection.previewBytes,
        firstTag: inspection.firstTag,
        secondTag: inspection.secondTag,
        shape: inspection.shape,
      };
      targets.set(target, record);
      shapeCounts.set(record.shape, (shapeCounts.get(record.shape) || 0) + 1);
    }

    record.refs += 1;
    record.sites.push({
      caller: site.callSite,
      kind: site.kind,
      selector: isDefault ? null : site.base + index,
      isDefault,
    });
  }

  for (const site of sites) {
    for (let index = 0; index < site.caseTargets.length; index += 1) {
      noteTarget(site.caseTargets[index], site, index, false);
    }
    noteTarget(site.defaultTarget, site, site.count, true);
  }

  return {
    targets: [...targets.values()].sort((left, right) => left.address - right.address),
    shapeCounts,
  };
}

function sortByRefs(records) {
  return [...records].sort((left, right) => {
    if (right.refs !== left.refs) return right.refs - left.refs;
    return left.address - right.address;
  });
}

function formatSourceSet(values) {
  return [...values].sort((left, right) => left.localeCompare(right)).join(', ');
}

function buildNamedLines(records) {
  return records
    .filter((record) => record.matchType !== 'unknown')
    .sort((left, right) => {
      if (left.matchType !== right.matchType) return left.matchType.localeCompare(right.matchType);
      if (right.refs !== left.refs) return right.refs - left.refs;
      return left.address - right.address;
    })
    .map((record) => {
      const exact = record.bestExact
        ? `exact=${record.bestExact.name} [${formatSourceSet(record.bestExact.sources)}]`
        : null;
      const range = record.bestRange
        ? `range=${record.bestRange.name} ${hex(record.bestRange.start)}-${hex(record.bestRange.end)} [${record.bestRange.source}]`
        : null;

      return `- ${hex(record.address)} refs=${record.refs} shape=${record.shape} ${[exact, range].filter(Boolean).join(' | ')}`;
    });
}

function buildUnknownLines(records, limit = 20) {
  return sortByRefs(records)
    .filter((record) => record.matchType === 'unknown')
    .slice(0, limit)
    .map(
      (record) =>
        `- ${hex(record.address)} refs=${record.refs} shape=${record.shape} bytes=${record.previewBytes} first=${record.firstTag}${record.secondTag ? ` second=${record.secondTag}` : ''}`
    );
}

function buildTopLines(records, limit = TOP_TARGET_COUNT) {
  return sortByRefs(records)
    .slice(0, limit)
    .map((record, index) => {
      const label = record.bestName ? ` label=${record.bestName}` : '';
      return `${index + 1}. ${hex(record.address)} refs=${record.refs} shape=${record.shape}${label} bytes=${record.previewBytes}`;
    });
}

function buildShapeLines(shapeCounts) {
  return [...shapeCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .map(([shape, count]) => `- ${shape}: ${count}`);
}

function writeReport(reportData) {
  const {
    vectorSites,
    directSites,
    records,
    uniqueCount,
    namedExactCount,
    namedRangeOnlyCount,
    unknownCount,
    shapeCounts,
  } = reportData;

  const totalEntries = vectorSites.reduce((sum, site) => sum + site.count + 1, 0)
    + directSites.reduce((sum, site) => sum + site.count + 1, 0);

  const reportLines = [
    '# Phase 315 `_seqcase` target report',
    '',
    '## Summary',
    `- Parsed all 83 \`_seqcase\` call sites: ${vectorSites.length} vector-wrapped calls through \`${hex(VECTOR_ADDR)}\` and ${directSites.length} direct calls to \`${hex(SEQCASE_ADDR)}\`.`,
    `- Total dispatch table entries (including default arms): ${totalEntries}.`,
    `- Unique jump targets: ${uniqueCount}.`,
    `- Targets with exact known-address matches: ${namedExactCount}.`,
    `- Additional targets only covered by a known function range: ${namedRangeOnlyCount}.`,
    `- Unknown targets after source scraping: ${unknownCount}.`,
    '',
    '## Top 10 most-referenced targets',
    ...buildTopLines(records),
    '',
    '## Entry-shape histogram',
    ...buildShapeLines(shapeCounts),
    '',
    '## Named targets',
    ...(buildNamedLines(records).length > 0 ? buildNamedLines(records) : ['- No named targets matched the scraped address inventory.']),
    '',
    '## Highest-frequency unknown targets',
    ...(buildUnknownLines(records).length > 0 ? buildUnknownLines(records) : ['- None.']),
    '',
    '## Notes',
    `- Exact matches come from direct address hits in \`${relativePath(CONTINUATION_PATH)}\`, \`${relativePath(TRANSPILER_PATH)}\`, and every \`TI-84_Plus_CE/phase*-report.md\` file.`,
    '- Range matches come from previously documented function spans such as `name (0xSTART-0xEND)`; they identify targets that land inside a named function even if the jump does not hit the function entry byte.',
    '- The ROM byte preview shown above is the first 8 bytes at each target, used only to classify the entry shape (`jp-trampoline`, `stack-prologue`, `register-setup`, and so on).',
    '',
  ];

  writeFileSync(REPORT_PATH, `${reportLines.join('\n')}\n`, 'utf8');
}

function main() {
  const rom = readFileSync(ROM_PATH);
  const { vectorSites, directSites, allSites } = loadSeqcaseSites(rom);
  const known = scanKnownAddresses();
  const { targets: records, shapeCounts } = buildTargetRecords(rom, allSites, known);

  const namedExactCount = records.filter((record) => record.matchType === 'exact').length;
  const namedRangeOnlyCount = records.filter((record) => record.matchType === 'range').length;
  const unknownCount = records.filter((record) => record.matchType === 'unknown').length;

  writeReport({
    vectorSites,
    directSites,
    records,
    uniqueCount: records.length,
    namedExactCount,
    namedRangeOnlyCount,
    unknownCount,
    shapeCounts,
  });

  console.log('Phase 315: _seqcase target inventory');
  console.log(`vector call sites: ${vectorSites.length}`);
  console.log(`direct call sites: ${directSites.length}`);
  console.log(`unique targets: ${records.length}`);
  console.log(`named targets: ${namedExactCount + namedRangeOnlyCount} (exact ${namedExactCount}, range-only ${namedRangeOnlyCount})`);
  console.log(`unknown targets: ${unknownCount}`);
  console.log('');
  console.log('Top 10 most-referenced targets:');
  for (const line of buildTopLines(records)) {
    console.log(line);
  }
  console.log('');
  console.log('Entry-shape histogram:');
  for (const line of buildShapeLines(shapeCounts)) {
    console.log(line);
  }
  console.log('');
  console.log(`Report written: ${relativePath(REPORT_PATH)}`);
}

main();
