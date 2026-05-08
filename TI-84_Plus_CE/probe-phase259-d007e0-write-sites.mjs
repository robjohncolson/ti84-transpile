#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ROM = fs.readFileSync(ROM_PATH);
const ROM_SIZE = ROM.length;

const TARGET_ADDR = 0xD007E0;
const DIRECT_A_PATTERN = [0x32, 0xE0, 0x07, 0xD0];
const PAIR_WRITE_PATTERNS = [
  { pair: 'bc', bytes: [0xED, 0x43, 0xE0, 0x07, 0xD0] },
  { pair: 'de', bytes: [0xED, 0x53, 0xE0, 0x07, 0xD0] },
  { pair: 'hl', bytes: [0xED, 0x63, 0xE0, 0x07, 0xD0] },
  { pair: 'sp', bytes: [0xED, 0x73, 0xE0, 0x07, 0xD0] },
];

const GATED_START = 0x09E2EC;
const GATED_END = 0x09E310;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page === 0x09) return 'STAT';
  if (page === 0x08) return 'UI/menu';
  if (page === 0x06) return 'Editor';
  if (page === 0x04) return 'OS-core';
  if (page <= 0x03) return 'OS-low';
  if (page >= 0x0A) return `${hex(page, 2)}xxxx`;
  return `${hex(page, 2)}xxxx`;
}

function scanPattern(bytes) {
  const hits = [];
  for (let i = 0; i <= ROM_SIZE - bytes.length; i += 1) {
    let matched = true;
    for (let j = 0; j < bytes.length; j += 1) {
      if (ROM[i + j] !== bytes[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(i);
    }
  }
  return hits;
}

function isDirectAWrite(inst) {
  return inst?.tag === 'ld-mem-reg' && inst?.src === 'a' && inst?.addr === TARGET_ADDR;
}

function formatGenericProps(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates',
  ]);
  const parts = [];

  for (const [key, value] of Object.entries(inst ?? {})) {
    if (ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target') {
        parts.push(`${key}=${hex(value)}`);
      } else if (key === 'value') {
        parts.push(`${key}=${hexByte(value)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
      continue;
    }

    parts.push(`${key}=${value}`);
  }

  return parts.join(' ');
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'nop':
      return 'nop';
    default: {
      const props = formatGenericProps(inst);
      return props ? `${inst.tag} ${props}` : String(inst?.tag ?? 'unknown');
    }
  }
}

function findBestDecodeWindow(site, { beforeBytes = 20, afterBytes = 12, slop = 12 } = {}) {
  const desiredStart = Math.max(0, site - beforeBytes);
  const earliestStart = Math.max(0, desiredStart - slop);
  const latestExclusive = Math.min(ROM_SIZE, site + DIRECT_A_PATTERN.length + afterBytes);

  let best = null;

  for (let candidate = earliestStart; candidate <= site; candidate += 1) {
    const instructions = [];
    let pc = candidate;
    let exactSite = false;
    let valid = true;

    while (pc < latestExclusive) {
      let inst;
      try {
        inst = decodeInstruction(ROM, pc, 'adl');
      } catch {
        valid = false;
        break;
      }

      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }

      if (pc < site && pc + inst.length > site) {
        valid = false;
        break;
      }

      instructions.push(inst);

      if (pc === site) {
        if (!isDirectAWrite(inst)) {
          valid = false;
        }
        exactSite = true;
      }

      pc += inst.length;
    }

    if (!valid || !exactSite) {
      continue;
    }

    const coveredBefore = Math.min(site - candidate, beforeBytes);
    const coveredAfter = Math.min(Math.max(0, pc - site), afterBytes + DIRECT_A_PATTERN.length);
    const startPenalty = Math.abs(candidate - desiredStart);
    const score = (coveredBefore * 1000) + (coveredAfter * 10) - startPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, end: pc, instructions, score };
    }
  }

  return best;
}

function findImmALoad(site, decodeWindow) {
  const minPc = Math.max(0, site - 20);

  if (decodeWindow) {
    for (let i = decodeWindow.instructions.length - 1; i >= 0; i -= 1) {
      const inst = decodeWindow.instructions[i];
      if (inst.pc >= site || inst.pc < minPc) {
        continue;
      }
      if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
        return { pc: inst.pc, value: inst.value, source: 'decoded' };
      }
    }
  }

  for (let pc = site - 2; pc >= minPc; pc -= 1) {
    if (pc >= 0 && ROM[pc] === 0x3E) {
      return { pc, value: ROM[pc + 1], source: 'raw' };
    }
  }

  return null;
}

function isContextControl(inst) {
  return inst?.tag === 'call' ||
    inst?.tag === 'call-conditional' ||
    inst?.tag === 'jp' ||
    inst?.tag === 'jp-conditional';
}

function describeContext(inst) {
  if (!inst) {
    return 'n/a';
  }

  if (inst.tag === 'call') {
    return `call ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'call-conditional') {
    return `call ${inst.condition}, ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'jp') {
    return `jp ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'jp-conditional') {
    return `jp ${inst.condition}, ${hex(inst.target)} @${hex(inst.pc)}`;
  }

  return formatInstruction(inst);
}

function findNearestContext(site) {
  const window = findBestDecodeWindow(site, { beforeBytes: 64, afterBytes: 24, slop: 32 });
  if (!window) {
    return null;
  }

  let best = null;
  for (const inst of window.instructions) {
    if (!isContextControl(inst)) {
      continue;
    }

    const distance = Math.abs(inst.pc - site);
    const prefer = inst.pc <= site ? 0 : 1;
    const score = (distance * 10) + prefer;

    if (!best || score < best.score) {
      best = { inst, score };
    }
  }

  return best?.inst ?? null;
}

function printTable(headers, rows) {
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      widths[i] = Math.max(widths[i], String(row[i] ?? '').length);
    }
  }

  console.log(headers.map((header, i) => header.padEnd(widths[i])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(row.map((value, i) => String(value ?? '').padEnd(widths[i])).join('  '));
  }
}

function collectSite(site) {
  const decodeWindow = findBestDecodeWindow(site, { beforeBytes: 20, afterBytes: 8, slop: 12 });
  const aLoad = findImmALoad(site, decodeWindow);
  const contextInst = findNearestContext(site);
  const insideGated = site >= GATED_START && site <= GATED_END;
  const detailInstructions = decodeWindow
    ? decodeWindow.instructions.filter((inst) => (inst.pc + inst.length) > (site - 20) && inst.pc <= site)
    : [];

  return {
    site,
    region: regionLabel(site),
    insideGated,
    classification: insideGated ? 'gated' : 'direct',
    aValue: aLoad?.value ?? null,
    aLoadPc: aLoad?.pc ?? null,
    aLoadSource: aLoad?.source ?? null,
    contextInst,
    detailInstructions,
  };
}

function histogramByValue(sites) {
  const counts = new Map();
  for (const site of sites) {
    if (site.aValue === null || site.aValue === undefined) {
      continue;
    }
    counts.set(site.aValue, (counts.get(site.aValue) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

const directAWriteOffsets = scanPattern(DIRECT_A_PATTERN);
const directAWriteSites = directAWriteOffsets.map(collectSite);

const pairWriteHits = PAIR_WRITE_PATTERNS.flatMap(({ pair, bytes }) =>
  scanPattern(bytes).map((site) => ({ site, pair })),
);

const gatedCount = directAWriteSites.filter((site) => site.insideGated).length;
const directCount = directAWriteSites.length - gatedCount;
const valueHistogram = histogramByValue(directAWriteSites);

console.log('=== Phase 259: D007E0 Direct Write-Site Classification ===\n');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(ROM_SIZE, 8)} (${ROM_SIZE} bytes)`);
console.log(`Target RAM address: ${hex(TARGET_ADDR)}`);
console.log(`Direct A-write pattern: ${DIRECT_A_PATTERN.map(hexByte).join(' ')}`);
console.log(`Gated handler range: ${hex(GATED_START)}..${hex(GATED_END)}\n`);

console.log(`Found ${directAWriteSites.length} direct "LD (${hex(TARGET_ADDR)}),A" byte-pattern hit(s).`);
console.log(`Inside 0x09E2EC gated handler: ${gatedCount}`);
console.log(`Outside 0x09E2EC (direct bypass writes): ${directCount}`);
console.log(`Direct pair-write hits (ED 43/53/63/73 ...): ${pairWriteHits.length}\n`);

if (valueHistogram.length > 0) {
  console.log('Immediate A-value histogram (last LD A,imm8 found within 20 bytes):');
  for (const [value, count] of valueHistogram) {
    console.log(`  ${hexByte(value)} x${count}`);
  }
  console.log('');
}

const mainRows = directAWriteSites.map((site) => [
  hex(site.site),
  site.region,
  site.aValue === null ? 'n/a' : hexByte(site.aValue),
  site.aLoadPc === null
    ? 'n/a'
    : `${site.aLoadSource === 'raw' ? 'raw@' : ''}${hex(site.aLoadPc)}`,
  site.insideGated ? 'yes' : 'no',
  site.classification,
  describeContext(site.contextInst),
]);

printTable(
  ['site', 'region', 'A', 'A-src', 'inside-09E2EC', 'class', 'nearest CALL/JP'],
  mainRows,
);

if (pairWriteHits.length > 0) {
  console.log('\nAdditional direct pair writes to D007E0:');
  printTable(
    ['site', 'pair'],
    pairWriteHits.map((hit) => [hex(hit.site), hit.pair]),
  );
}

console.log('\nPer-site 20-byte prewrite disassembly windows:\n');

for (const site of directAWriteSites) {
  console.log(`${hex(site.site)}  ${site.classification.toUpperCase()}  A=${site.aValue === null ? 'n/a' : hexByte(site.aValue)}  context=${describeContext(site.contextInst)}`);
  if (site.detailInstructions.length === 0) {
    console.log('  (no aligned disassembly window found)');
    console.log('');
    continue;
  }

  for (const inst of site.detailInstructions) {
    const marker = inst.pc === site.site ? ' <== write site' : '';
    console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}${marker}`);
  }
  console.log('');
}
