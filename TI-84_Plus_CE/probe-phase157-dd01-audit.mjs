#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PHASE149_REPORT_PATH = path.join(__dirname, 'phase149-report.md');

const romBytes = fs.readFileSync(ROM_PATH);
const phase149Report = fs.readFileSync(PHASE149_REPORT_PATH, 'utf8');

const DEFAULT_MODE = 'adl';
const TRAIL_LIMIT = 5;
const FD01_DETAIL_LIMIT = 20;
const CONTEXT_BEFORE = 6;
const CONTEXT_AFTER = 18;

const PATTERNS = [
  { label: 'FD 01', bytes: [0xfd, 0x01], pair: 'bc', indexRegister: 'iy' },
  { label: 'DD 01', bytes: [0xdd, 0x01], pair: 'bc', indexRegister: 'ix' },
  { label: 'DD 11', bytes: [0xdd, 0x11], pair: 'de', indexRegister: 'ix' },
  { label: 'FD 11', bytes: [0xfd, 0x11], pair: 'de', indexRegister: 'iy' },
];

function hexByte(value) {
  return (value & 0xff).toString(16).padStart(2, '0');
}

function hexWord(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatSigned(value) {
  if (typeof value !== 'number') {
    return String(value);
  }

  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(pc, length) {
  return Array.from(romBytes.slice(pc, pc + length));
}

function formatBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return '<none>';
  }

  return bytes.map(hexByte).join(' ');
}

function formatContext(pc, patternLength = 2) {
  const start = Math.max(0, pc - CONTEXT_BEFORE);
  const end = Math.min(romBytes.length, pc + patternLength + CONTEXT_AFTER);
  const parts = [];

  for (let cursor = start; cursor < end; cursor += 1) {
    let cell = hexByte(romBytes[cursor]);
    if (cursor === pc) {
      cell = `[${cell}`;
    }
    if (cursor === pc + patternLength - 1) {
      cell = `${cell}]`;
    }
    parts.push(cell);
  }

  return `${hexWord(start)}: ${parts.join(' ')}`;
}

function isAdvisoryUndefinedNop(inst, bytes) {
  if (!inst || inst.tag !== 'nop') {
    return false;
  }

  return !(bytes.length === 1 && bytes[0] === 0x00);
}

function isHardTerminator(inst) {
  if (!inst) {
    return false;
  }

  return (
    inst.tag === 'jp'
    || inst.tag === 'jp-indirect'
    || inst.tag === 'jr'
    || inst.tag === 'ret'
    || inst.tag === 'reti'
    || inst.tag === 'retn'
    || inst.tag === 'rst'
    || inst.tag === 'slp'
    || inst.tag === 'halt'
  );
}

function describeInstruction(inst) {
  if (!inst) {
    return '<decode failed>';
  }

  const parts = [inst.tag];
  const entries = Object.entries(inst);

  for (const [key, value] of entries) {
    if (
      key === 'pc'
      || key === 'length'
      || key === 'nextPc'
      || key === 'mode'
      || key === 'modePrefix'
      || key === 'tag'
      || key === 'kind'
      || key === 'terminates'
    ) {
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'displacement') {
        parts.push(`${key}=${formatSigned(value)}`);
        continue;
      }

      if (key === 'value' || key === 'addr' || key === 'target' || key === 'port') {
        const width = value > 0xffff ? 6 : 4;
        parts.push(`${key}=${hexWord(value, width)}`);
        continue;
      }

      parts.push(`${key}=${value}`);
      continue;
    }

    parts.push(`${key}=${String(value)}`);
  }

  parts.push(`len=${inst.length}`);
  return parts.join(' ');
}

function extractManualEvidence(reportText) {
  const lines = reportText.split(/\r?\n/);

  const findLine = (needle) => lines.find((line) => line.includes(needle)) ?? null;

  return {
    page222: findLine('page 222: `LD (IX/Y+d),rr` -> `DD/FD 0F`, `1F`, `2F`'),
    dd01: findLine('| `DD 01` |'),
    dd11: findLine('| `DD 11` |'),
    fd01: findLine('| `FD 01` |'),
    fd11: findLine('| `FD 11` |'),
  };
}

function findOccurrences(patternBytes) {
  const hits = [];

  for (let pc = 0; pc <= romBytes.length - patternBytes.length; pc += 1) {
    let matched = true;

    for (let index = 0; index < patternBytes.length; index += 1) {
      if (romBytes[pc + index] !== patternBytes[index]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      hits.push(pc);
    }
  }

  return hits;
}

function buildLiftedStartSets(preliftedBlocks) {
  const starts = {
    adl: new Set(),
    z80: new Set(),
  };

  if (!preliftedBlocks) {
    return starts;
  }

  for (const block of Object.values(preliftedBlocks)) {
    if (!block || !Array.isArray(block.instructions) || !starts[block.mode]) {
      continue;
    }

    for (const instruction of block.instructions) {
      if (instruction && typeof instruction.pc === 'number') {
        starts[block.mode].add(instruction.pc);
      }
    }
  }

  return starts;
}

function resolveMode(pc, liftedStarts) {
  if (!liftedStarts) {
    return { mode: DEFAULT_MODE, source: `default:${DEFAULT_MODE}` };
  }

  const inAdl = liftedStarts.adl.has(pc);
  const inZ80 = liftedStarts.z80.has(pc);

  if (inAdl && !inZ80) {
    return { mode: 'adl', source: 'lifted-start:adl' };
  }

  if (inZ80 && !inAdl) {
    return { mode: 'z80', source: 'lifted-start:z80' };
  }

  if (inAdl && inZ80) {
    return { mode: DEFAULT_MODE, source: `lifted-start:both->${DEFAULT_MODE}` };
  }

  return { mode: DEFAULT_MODE, source: `default:${DEFAULT_MODE}` };
}

function decodeTrail(startPc, mode, liftedStarts) {
  const rows = [];
  const issues = [];
  let score = 0;
  let pc = startPc;
  let currentMode = mode;
  let stopScoring = false;

  for (let count = 0; count < TRAIL_LIMIT; count += 1) {
    if (pc >= romBytes.length) {
      rows.push({
        pc,
        mode: currentMode,
        error: 'past-end-of-rom',
      });
      score += 25;
      issues.push(`past ROM at ${hexWord(pc)}`);
      break;
    }

    try {
      const inst = decodeInstruction(romBytes, pc, currentMode);
      const raw = bytesAt(pc, inst.length);
      const undefinedNop = isAdvisoryUndefinedNop(inst, raw);
      const liftedStart = liftedStarts ? liftedStarts[currentMode].has(pc) : null;
      const terminator = isHardTerminator(inst);

      rows.push({
        pc,
        mode: currentMode,
        inst,
        bytes: raw,
        text: describeInstruction(inst),
        undefinedNop,
        liftedStart,
        terminator,
      });

      if (!stopScoring && undefinedNop) {
        score += 3;
        issues.push(`undefined/NOP-like decode at ${hexWord(pc)} (${formatBytes(raw)})`);
      }

      if (inst.kind === 'mode-switch' && inst.nextMode) {
        currentMode = inst.nextMode;
      }

      pc = inst.nextPc;

      if (terminator) {
        stopScoring = true;
      }
    } catch (error) {
      rows.push({
        pc,
        mode: currentMode,
        error: error.message,
      });
      score += 25;
      issues.push(`decode error at ${hexWord(pc)}: ${error.message}`);
      break;
    }
  }

  return { rows, score, issues };
}

function decodeCurrent(pattern, pc, mode) {
  try {
    const inst = decodeInstruction(romBytes, pc, mode);
    const valid = (
      inst.tag === 'ld-indexed-pair'
      && inst.pair === pattern.pair
      && inst.indexRegister === pattern.indexRegister
    );

    return {
      valid,
      inst,
      bytes: bytesAt(pc, inst.length),
      nextPc: inst.nextPc,
      issues: valid
        ? []
        : [`expected ld-indexed-pair ${pattern.pair}/${pattern.indexRegister}, got ${describeInstruction(inst)}`],
      scorePenalty: valid ? 0 : 20,
    };
  } catch (error) {
    return {
      valid: false,
      inst: null,
      bytes: [],
      nextPc: null,
      issues: [error.message],
      scorePenalty: 25,
    };
  }
}

function decodeAlternative(pattern, pc, mode) {
  try {
    const core = decodeInstruction(romBytes, pc + 1, mode);
    const valid = core.tag === 'ld-pair-imm' && core.pair === pattern.pair;
    const totalLength = 1 + core.length;

    return {
      valid,
      prefix: romBytes[pc],
      core,
      bytes: bytesAt(pc, totalLength),
      nextPc: pc + totalLength,
      issues: valid
        ? []
        : [`expected ld-pair-imm ${pattern.pair}, got ${describeInstruction(core)}`],
      scorePenalty: valid ? 0 : 20,
    };
  } catch (error) {
    return {
      valid: false,
      prefix: romBytes[pc],
      core: null,
      bytes: [],
      nextPc: null,
      issues: [error.message],
      scorePenalty: 25,
    };
  }
}

function summarizeAlternative(result) {
  if (!result || !result.core) {
    return '<decode failed>';
  }

  return `ignored ${hexByte(result.prefix)} prefix + ${describeInstruction(result.core)} total-len=${1 + result.core.length}`;
}

function analyzeSite(pattern, pc, liftedStarts) {
  const modeInfo = resolveMode(pc, liftedStarts);
  const mode = modeInfo.mode;

  const current = decodeCurrent(pattern, pc, mode);
  const alternative = decodeAlternative(pattern, pc, mode);

  const currentTrail = current.nextPc !== null
    ? decodeTrail(current.nextPc, mode, liftedStarts)
    : { rows: [], score: 0, issues: ['no current nextPc'] };

  const alternativeTrail = alternative.nextPc !== null
    ? decodeTrail(alternative.nextPc, mode, liftedStarts)
    : { rows: [], score: 0, issues: ['no alternative nextPc'] };

  const currentScore = current.scorePenalty + currentTrail.score;
  const alternativeScore = alternative.scorePenalty + alternativeTrail.score;

  let winner = 'tie';
  if (alternativeScore < currentScore) {
    winner = 'alternative';
  } else if (currentScore < alternativeScore) {
    winner = 'current';
  }

  return {
    pattern,
    pc,
    mode,
    modeSource: modeInfo.source,
    current,
    alternative,
    currentTrail,
    alternativeTrail,
    currentScore,
    alternativeScore,
    winner,
    liftedFlags: liftedStarts
      ? {
          disputedPcAdl: liftedStarts.adl.has(pc),
          disputedPcZ80: liftedStarts.z80.has(pc),
          currentNextLifted: current.nextPc === null ? null : liftedStarts[mode].has(current.nextPc),
          alternativeNextLifted: alternative.nextPc === null ? null : liftedStarts[mode].has(alternative.nextPc),
        }
      : null,
  };
}

function formatTrailRows(trail) {
  if (!trail.rows || trail.rows.length === 0) {
    return ['    <none>'];
  }

  return trail.rows.map((row) => {
    if (row.error) {
      return `    ${hexWord(row.pc)} ${row.mode} ERROR ${row.error}`;
    }

    const lifted = row.liftedStart === null ? '' : row.liftedStart ? ' lifted-start' : ' not-lifted-start';
    const nopFlag = row.undefinedNop ? ' advisory-undefined-nop' : '';
    const terminator = row.terminator ? ' hard-terminator' : '';

    return `    ${hexWord(row.pc)} ${row.mode}  ${formatBytes(row.bytes).padEnd(18, ' ')} ${row.text}${lifted}${nopFlag}${terminator}`;
  });
}

function formatSiteDetail(result, ordinal) {
  const lines = [];

  lines.push(`### ${ordinal}. ${result.pattern.label} at ${hexWord(result.pc)} (${result.mode}, ${result.modeSource})`);
  lines.push(`raw context: ${formatContext(result.pc, result.pattern.bytes.length)}`);

  if (result.liftedFlags) {
    lines.push(
      `lifted-start advisory: site adl=${result.liftedFlags.disputedPcAdl ? 'yes' : 'no'},`
      + ` z80=${result.liftedFlags.disputedPcZ80 ? 'yes' : 'no'},`
      + ` current-next=${result.liftedFlags.currentNextLifted === null ? 'n/a' : result.liftedFlags.currentNextLifted ? 'yes' : 'no'},`
      + ` alt-next=${result.liftedFlags.alternativeNextLifted === null ? 'n/a' : result.liftedFlags.alternativeNextLifted ? 'yes' : 'no'}`
    );
    lines.push('note: lifted-start alignment is only advisory because ROM.transpiled.js was built with the current decoder.');
  }

  lines.push('');
  lines.push(`current decode: ${result.current.inst ? describeInstruction(result.current.inst) : '<decode failed>'}`);
  lines.push(`current bytes:  ${formatBytes(result.current.bytes)}`);
  lines.push(`current next:   ${result.current.nextPc === null ? '<none>' : hexWord(result.current.nextPc)} score=${result.currentScore}`);
  if (result.current.issues.length > 0 || result.currentTrail.issues.length > 0) {
    lines.push(`current notes:  ${[...result.current.issues, ...result.currentTrail.issues].join(' | ')}`);
  }
  lines.push('current trail:');
  lines.push(...formatTrailRows(result.currentTrail));

  lines.push('');
  lines.push(`alternative decode: ${summarizeAlternative(result.alternative)}`);
  lines.push(`alternative bytes:  ${formatBytes(result.alternative.bytes)}`);
  lines.push(`alternative next:   ${result.alternative.nextPc === null ? '<none>' : hexWord(result.alternative.nextPc)} score=${result.alternativeScore}`);
  if (result.alternative.issues.length > 0 || result.alternativeTrail.issues.length > 0) {
    lines.push(`alternative notes:  ${[...result.alternative.issues, ...result.alternativeTrail.issues].join(' | ')}`);
  }
  lines.push('alternative trail:');
  lines.push(...formatTrailRows(result.alternativeTrail));

  lines.push('');
  lines.push(`winner: ${result.winner}`);
  lines.push('');

  return lines;
}

function formatCompactSite(result) {
  return [
    `${hexWord(result.pc)} mode=${result.mode} winner=${result.winner}`,
    `currentScore=${result.currentScore}`,
    `altScore=${result.alternativeScore}`,
    `bytes=${formatContext(result.pc, result.pattern.bytes.length)}`,
  ].join(' | ');
}

function buildVerdict(siteResults, manualEvidence) {
  const currentBetter = siteResults.filter((site) => site.winner === 'current').length;
  const alternativeBetter = siteResults.filter((site) => site.winner === 'alternative').length;
  const ties = siteResults.filter((site) => site.winner === 'tie').length;

  const manualSays01IsNotReal = Boolean(
    manualEvidence.page222
    && manualEvidence.dd01
    && manualEvidence.dd11
    && manualEvidence.fd01
    && manualEvidence.fd11
  );

  const lines = [];
  lines.push(`ROM-context heuristic: alternative-better=${alternativeBetter}, current-better=${currentBetter}, tie=${ties}.`);

  if (manualSays01IsNotReal) {
    lines.push('Manual cross-reference already points one way: page 222 lists DD/FD 0F/1F/2F for `LD (IX/IY+d),rr`, and phase149 flags DD/FD 01/11 as not real DD/FD-only opcodes.');

    if (alternativeBetter >= currentBetter) {
      lines.push('Verdict: DD/FD 01/11 should fall through to the main opcode table.');
      lines.push('Decoder action: remove the explicit `if (op === 0x01)` and `if (op === 0x11)` handlers at ez80-decoder.js lines 641-642.');
      lines.push('Implication in ADL mode: the correct decode is prefix-consumed + main-table `LD BC/DE,imm24`, so the first instruction is 5 bytes total, not 3.');
      return lines;
    }

    lines.push('Verdict: the manual still says these opcodes are not real DD/FD forms. The ROM heuristic found some current-friendly sites, but the safer correctness fix is still to remove lines 641-642 and inspect the outliers afterward.');
    return lines;
  }

  if (alternativeBetter > currentBetter) {
    lines.push('Verdict: ROM-context heuristics lean toward prefix-ignored main-table `LD rr,imm` handling.');
    return lines;
  }

  if (currentBetter > alternativeBetter) {
    lines.push('Verdict: ROM-context heuristics lean toward keeping the current decode, but this conflicts with the local manual summary and should be re-checked against UM0077 before keeping lines 641-642.');
    return lines;
  }

  lines.push('Verdict: the local trailing-byte heuristic is inconclusive on its own. Use the UM0077 table evidence as the deciding signal.');
  return lines;
}

let liftedStarts = null;

try {
  const transpiledModule = await import('./ROM.transpiled.js');
  liftedStarts = buildLiftedStartSets(transpiledModule.PRELIFTED_BLOCKS ?? {});
} catch (error) {
  liftedStarts = null;
}

const manualEvidence = extractManualEvidence(phase149Report);
const patternResults = PATTERNS.map((pattern) => {
  const hits = findOccurrences(pattern.bytes);
  const sites = hits.map((pc) => analyzeSite(pattern, pc, liftedStarts));

  return { pattern, hits, sites };
});

const allSites = patternResults.flatMap((entry) => entry.sites);

const lines = [];

lines.push('# Phase 157 DD/FD 01/11 correctness audit');
lines.push('');
lines.push(`ROM size: ${hexWord(romBytes.length, 8)} bytes`);
lines.push(`Default decode mode for ambiguous sites: ${DEFAULT_MODE}`);
lines.push(`Trail length per interpretation: ${TRAIL_LIMIT} instructions`);
lines.push('');

lines.push('## Manual cross-reference (from phase149-report.md)');
if (manualEvidence.page222) {
  lines.push(`- ${manualEvidence.page222}`);
}
if (manualEvidence.dd01) {
  lines.push(`- ${manualEvidence.dd01}`);
}
if (manualEvidence.dd11) {
  lines.push(`- ${manualEvidence.dd11}`);
}
if (manualEvidence.fd01) {
  lines.push(`- ${manualEvidence.fd01}`);
}
if (manualEvidence.fd11) {
  lines.push(`- ${manualEvidence.fd11}`);
}
lines.push('');

lines.push('## Raw hit counts and heuristic winners');
lines.push('pattern | hits | alt-better | current-better | tie');
lines.push('--- | ---: | ---: | ---: | ---:');

for (const entry of patternResults) {
  const altBetter = entry.sites.filter((site) => site.winner === 'alternative').length;
  const currentBetter = entry.sites.filter((site) => site.winner === 'current').length;
  const ties = entry.sites.filter((site) => site.winner === 'tie').length;
  lines.push(`${entry.pattern.label} | ${entry.hits.length} | ${altBetter} | ${currentBetter} | ${ties}`);
}

lines.push('');
lines.push('## First 20 FD 01 sites with both decodings');

const fd01Sites = patternResults.find((entry) => entry.pattern.label === 'FD 01')?.sites ?? [];
fd01Sites.slice(0, FD01_DETAIL_LIMIT).forEach((site, index) => {
  lines.push(...formatSiteDetail(site, index + 1));
});

lines.push('## Lower-count patterns');
for (const label of ['DD 01', 'DD 11', 'FD 11']) {
  const entry = patternResults.find((item) => item.pattern.label === label);

  lines.push(`### ${label}`);
  if (!entry || entry.sites.length === 0) {
    lines.push('- no hits');
    lines.push('');
    continue;
  }

  for (const site of entry.sites) {
    lines.push(`- ${formatCompactSite(site)}`);
  }
  lines.push('');
}

lines.push('## Final verdict');
for (const verdictLine of buildVerdict(allSites, manualEvidence)) {
  lines.push(`- ${verdictLine}`);
}

console.log(lines.join('\n'));
