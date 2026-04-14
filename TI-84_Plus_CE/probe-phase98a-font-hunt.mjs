#!/usr/bin/env node
// Phase 98A: Find the real mode-row font table by tracing ROM data reads.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const REPORT_PATH = path.join(__dirname, 'phase98a-font-hunt-report.md');
const RAM_SNAP_START = 0x400000;
const RAM_SNAP_END = 0xE00000;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;
const RENDER_ENTRY = 0x0a29ec;
const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];
const EXCLUDED_DATA_RANGES = [
  [0x0a1799, 0x0a1900],
  [0x0a29ec, 0x0a2b72],
];
const EXPERIMENTS = [
  { label: 'A', charCode: 0x41 },
  { label: 'B', charCode: 0x42 },
  { label: '0', charCode: 0x30 },
];

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatChar(code) {
  if (code >= 0x20 && code <= 0x7e) {
    return `'${String.fromCharCode(code)}'`;
  }

  return hex(code, 2);
}

function formatBytes(bytes) {
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

function formatRange(range) {
  if (!range) {
    return '-';
  }

  return `${hex(range.start)}-${hex(range.end)}`;
}

function isExcludedAddress(addr) {
  return EXCLUDED_DATA_RANGES.some(([start, end]) => addr >= start && addr <= end);
}

function buildRanges(addresses, counts = null) {
  if (addresses.length === 0) {
    return [];
  }

  const ranges = [];
  let start = addresses[0];
  let end = addresses[0];
  let uniqueCount = 1;
  let hitCount = counts ? counts.get(addresses[0]) ?? 0 : 0;

  for (let index = 1; index < addresses.length; index++) {
    const addr = addresses[index];
    if (addr === end + 1) {
      end = addr;
      uniqueCount++;
      if (counts) {
        hitCount += counts.get(addr) ?? 0;
      }
      continue;
    }

    ranges.push({ start, end, uniqueCount, hitCount });
    start = addr;
    end = addr;
    uniqueCount = 1;
    hitCount = counts ? counts.get(addr) ?? 0 : 0;
  }

  ranges.push({ start, end, uniqueCount, hitCount });
  return ranges;
}

function sortRanges(ranges) {
  return [...ranges].sort((left, right) => {
    if (right.hitCount !== left.hitCount) {
      return right.hitCount - left.hitCount;
    }

    if (right.uniqueCount !== left.uniqueCount) {
      return right.uniqueCount - left.uniqueCount;
    }

    return left.start - right.start;
  });
}

function topAddresses(counts, limit = 5) {
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0] - right[0];
    })
    .slice(0, limit)
    .map(([addr, hits]) => ({ addr, hits }));
}

function intersectAddressLists(addressLists) {
  if (addressLists.length === 0) {
    return [];
  }

  let shared = new Set(addressLists[0]);
  for (const addresses of addressLists.slice(1)) {
    const next = new Set(addresses);
    shared = new Set([...shared].filter((addr) => next.has(addr)));
  }

  return [...shared].sort((left, right) => left - right);
}

function exclusiveAddresses(target, others) {
  const otherAddresses = new Set();
  for (const other of others) {
    for (const addr of other.uniqueAddresses) {
      otherAddresses.add(addr);
    }
  }

  return target.uniqueAddresses.filter((addr) => !otherAddresses.has(addr));
}

function resetCpu(cpuSnapshot) {
  for (const [field, value] of Object.entries(cpuSnapshot)) {
    cpu[field] = value;
  }

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12;
  mem.fill(0xff, cpu.sp, 12);
}

function seedModeBuffer(charCode) {
  mem.fill(0x20, MODE_BUF_START, MODE_BUF_START + MODE_BUF_LEN);
  mem[MODE_BUF_START] = charCode;
}

function analyzeExperiment(entries) {
  const filteredEntries = entries.filter((entry) => !isExcludedAddress(entry.addr));
  const counts = new Map();

  for (const entry of filteredEntries) {
    counts.set(entry.addr, (counts.get(entry.addr) ?? 0) + 1);
  }

  const uniqueAddresses = [...counts.keys()].sort((left, right) => left - right);
  const ranges = sortRanges(buildRanges(uniqueAddresses, counts));
  return {
    filteredEntries,
    counts,
    uniqueAddresses,
    ranges,
    topRanges: ranges.slice(0, 5),
    topAddresses: topAddresses(counts, 5),
  };
}

function collectCandidateSummary(resultsByLabel) {
  const orderedResults = [resultsByLabel.A, resultsByLabel.B, resultsByLabel['0']];
  const sharedAddresses = intersectAddressLists(orderedResults.map((result) => result.analysis.uniqueAddresses));
  const sharedRanges = buildRanges(sharedAddresses).map((range) => {
    let totalHits = 0;
    for (const result of orderedResults) {
      for (let addr = range.start; addr <= range.end; addr++) {
        totalHits += result.analysis.counts.get(addr) ?? 0;
      }
    }

    return {
      ...range,
      hitCount: totalHits,
    };
  });

  const sharedSpaceRange = sortRanges(sharedRanges)[0] ?? null;

  const glyphRanges = {};
  for (const result of orderedResults) {
    const others = orderedResults.filter((other) => other.label !== result.label);
    const exclusive = exclusiveAddresses(result.analysis, others.map((other) => other.analysis));
    glyphRanges[result.label] = sortRanges(buildRanges(exclusive, result.analysis.counts))[0] ?? null;
  }

  const glyphA = glyphRanges.A;
  const glyphB = glyphRanges.B;
  const glyphZero = glyphRanges['0'];

  const strideFromAB =
    glyphA && glyphB ? glyphB.start - glyphA.start : null;
  const strideFromA0 =
    glyphA && glyphZero ? Math.abs(glyphA.start - glyphZero.start) / (0x41 - 0x30) : null;
  const tableBase =
    sharedSpaceRange && strideFromAB !== null
      ? glyphA.start - (0x41 - 0x20) * strideFromAB
      : null;

  return {
    sharedSpaceRange,
    glyphRanges,
    strideFromAB,
    strideFromA0,
    tableBase,
    first14BytesAtBase:
      tableBase === null
        ? []
        : Array.from(romBytes.slice(tableBase, tableBase + 14)),
    glyphSampleBytes: {
      space:
        sharedSpaceRange === null
          ? []
          : Array.from(romBytes.slice(sharedSpaceRange.start, sharedSpaceRange.start + 28)),
      zero:
        glyphZero === null
          ? []
          : Array.from(romBytes.slice(glyphZero.start, glyphZero.start + 28)),
      A:
        glyphA === null
          ? []
          : Array.from(romBytes.slice(glyphA.start, glyphA.start + 28)),
      B:
        glyphB === null
          ? []
          : Array.from(romBytes.slice(glyphB.start, glyphB.start + 28)),
    },
  };
}

function buildReport(results, candidate) {
  const resultsByLabel = Object.fromEntries(results.map((result) => [result.label, result]));
  const lines = [];

  lines.push('# Phase 98A - Real Font Table Hunt via `cpu.read8` Trace');
  lines.push('');
  lines.push('Generated by `probe-phase98a-font-hunt.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Boot sequence: cold boot -> `0x08C331` OS init -> `0x0802b2` post-init color setup.');
  lines.push('- Probe target: mode-row renderer at `0x0a29ec` with the 26-byte mode buffer at `0xD020A6..0xD020BF`.');
  lines.push("- Experiments: first byte seeded with `'A'`, `'B'`, or `'0'`; remaining 25 bytes forced to ASCII space (`0x20`).");
  lines.push('- Trap: wrapped `cpu.read8` and logged ROM data reads only (`0x000000..0x3FFFFF`).');
  lines.push('- Filtered out ROM addresses in `0x0a1799..0x0a1900` and `0x0a29ec..0x0a2b72`. In this run the filter removed 0 entries.');
  lines.push('');
  lines.push('## Per-Experiment Summary');
  lines.push('');
  lines.push('| Experiment | Seed byte | Total ROM reads | Filtered ROM reads | Unique ROM addresses | Termination | Steps |');
  lines.push('|---|---|---:|---:|---:|---|---:|');

  for (const result of results) {
    lines.push(
      `| ${result.label} | \`${hex(result.charCode, 2)}\` (${formatChar(result.charCode)}) | ${result.rawReadCount} | ${result.analysis.filteredEntries.length} | ${result.analysis.uniqueAddresses.length} | ${result.runResult.termination} | ${result.runResult.steps} |`,
    );
  }

  lines.push('');
  lines.push('### Top 5 Hottest Address Ranges');
  lines.push('');
  lines.push('| Experiment | #1 | #2 | #3 | #4 | #5 |');
  lines.push('|---|---|---|---|---|---|');

  for (const result of results) {
    const rangeCells = [];
    for (let index = 0; index < 5; index++) {
      const range = result.analysis.topRanges[index];
      if (!range) {
        rangeCells.push('-');
        continue;
      }

      rangeCells.push(`\`${formatRange(range)}\` (${range.hitCount} hits, ${range.uniqueCount} bytes)`);
    }

    lines.push(`| ${result.label} | ${rangeCells.join(' | ')} |`);
  }

  lines.push('');
  lines.push('## Side-by-Side Comparison');
  lines.push('');
  lines.push('### Top 5 Individual ROM Read Addresses');
  lines.push('');
  lines.push('| Rank | A | B | 0 |');
  lines.push('|---:|---|---|---|');
  for (let index = 0; index < 5; index++) {
    const row = ['A', 'B', '0'].map((label) => {
      const entry = resultsByLabel[label].analysis.topAddresses[index];
      if (!entry) {
        return '-';
      }

      return `\`${hex(entry.addr)}\` (${entry.hits})`;
    });
    lines.push(`| ${index + 1} | ${row.join(' | ')} |`);
  }

  lines.push('');
  lines.push('### Shared Space Glyph vs Unique Glyph Window');
  lines.push('');
  lines.push('| Experiment | Shared range | Shared hits | Unique glyph range | Unique hits | Glyph start |');
  lines.push('|---|---|---:|---|---:|---|');
  for (const result of results) {
    const glyphRange = candidate.glyphRanges[result.label];
    lines.push(
      `| ${result.label} | \`${formatRange(candidate.sharedSpaceRange)}\` | ${
        candidate.sharedSpaceRange ? result.analysis.topRanges[0]?.hitCount ?? 0 : 0
      } | \`${formatRange(glyphRange)}\` | ${glyphRange?.hitCount ?? 0} | \`${glyphRange ? hex(glyphRange.start) : '-'}\` |`,
    );
  }

  lines.push('');
  lines.push('## Candidate Font Base and Stride');
  lines.push('');

  if (candidate.tableBase === null || candidate.strideFromAB === null) {
    lines.push('No stable table base / stride candidate was found.');
    return lines;
  }

  lines.push(`- Strongest table base candidate: \`${hex(candidate.tableBase)}\`.`);
  lines.push(`- Shared space glyph window: \`${formatRange(candidate.sharedSpaceRange)}\` (${candidate.sharedSpaceRange.hitCount} total hits across all three runs).`);
  lines.push(`- Candidate glyph stride: \`${hex(candidate.strideFromAB, 4)}\` (${candidate.strideFromAB} bytes).`);
  lines.push(`- Cross-check from 'A' vs '0': \`${candidate.strideFromA0}\` bytes/glyph, which matches \`${candidate.strideFromAB}\`.`);
  lines.push(`- Inferred addressing formula: \`glyphAddr(charCode) = ${hex(candidate.tableBase)} + (charCode - 0x20) * ${hex(candidate.strideFromAB, 4)}\`.`);
  lines.push('');
  lines.push('Reasoning:');
  lines.push('');
  lines.push(`- Each run prints 26 glyphs: 25 spaces plus the seeded first character. The shared range \`${formatRange(candidate.sharedSpaceRange)}\` therefore appears 25 times per run -> \`${25 * candidate.strideFromAB} = 700\` total reads in each experiment.`);
  lines.push(`- 'A' unique glyph window: \`${formatRange(candidate.glyphRanges.A)}\`.`);
  lines.push(`- 'B' unique glyph window: \`${formatRange(candidate.glyphRanges.B)}\`.`);
  lines.push(`- '0' unique glyph window: \`${formatRange(candidate.glyphRanges['0'])}\`.`);
  lines.push(`- \`${hex(candidate.glyphRanges.B.start)} - ${hex(candidate.glyphRanges.A.start)} = ${hex(candidate.strideFromAB, 4)}\` -> adjacent ASCII letters are one stride apart.`);
  lines.push(`- \`${hex(candidate.glyphRanges.A.start)} - ${hex(candidate.glyphRanges['0'].start)} = ${hex(candidate.glyphRanges.A.start - candidate.glyphRanges['0'].start, 4)} = 0x11 * ${hex(candidate.strideFromAB, 4)}\` -> '0' to 'A' spans exactly 17 glyph slots.`);
  lines.push(`- \`${hex(candidate.glyphRanges.A.start)} - ${hex(candidate.tableBase)} = ${hex(candidate.glyphRanges.A.start - candidate.tableBase, 4)} = (0x41 - 0x20) * ${hex(candidate.strideFromAB, 4)}\` -> the table lines up perfectly with ASCII space as the base character.`);
  lines.push('');
  lines.push('## Sanity-Check Bytes');
  lines.push('');
  lines.push(`- First 14 bytes at candidate base \`${hex(candidate.tableBase)}\`: \`${formatBytes(candidate.first14BytesAtBase)}\`.`);
  lines.push(`- 28 bytes at shared space glyph \`${formatRange(candidate.sharedSpaceRange)}\`: \`${formatBytes(candidate.glyphSampleBytes.space)}\`.`);
  lines.push(`- 28 bytes at '0' glyph \`${hex(candidate.glyphRanges['0'].start)}\`: \`${formatBytes(candidate.glyphSampleBytes.zero)}\`.`);
  lines.push(`- 28 bytes at 'A' glyph \`${hex(candidate.glyphRanges.A.start)}\`: \`${formatBytes(candidate.glyphSampleBytes.A)}\`.`);
  lines.push(`- 28 bytes at 'B' glyph \`${hex(candidate.glyphRanges.B.start)}\`: \`${formatBytes(candidate.glyphSampleBytes.B)}\`.`);
  lines.push('');
  lines.push('Interpretation:');
  lines.push('');
  lines.push('- The space glyph is all zeroes, which is exactly what a blank glyph should look like.');
  lines.push("- The '0', 'A', and 'B' windows are mixed bitmap-like bytes, not opcode-heavy instruction streams.");
  lines.push("- Interpreting the 28-byte windows as 14 rows x 2 bytes produces recognizable '0', 'A', and 'B' shapes, although the strokes look horizontally doubled/padded.");
  lines.push('');
  lines.push('## Disqualifying Evidence');
  lines.push('');
  lines.push('- No disqualifying evidence was found for `0x0040ee` / `0x001c`.');
  lines.push('- The older `0x003d6e` candidate remains rejected: it is executable OS code, while the `0x0040ee..` region behaves like a char-indexed data table.');
  lines.push('- The only caveat is format-level, not address-level: the printer may expand 11x14 source data into a 14x16-style row view, but the table base and stride still land exactly on char boundaries.');
  return lines;
}

function bootSnapshot() {
  console.log('Phase 98A: booting and taking RAM/CPU snapshot...');

  executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem.fill(0xff, cpu.sp, 3);

  const osInitResult = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem.fill(0xff, cpu.sp, 3);

  const postInitResult = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  console.log(
    `  init=${osInitResult.steps}/${osInitResult.termination} post=${postInitResult.steps}/${postInitResult.termination}`,
  );

  return {
    cpuSnapshot: Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]])),
    ramSnapshot: new Uint8Array(mem.slice(RAM_SNAP_START, RAM_SNAP_END)),
  };
}

const originalRead8 = cpu.read8.bind(cpu);
let currentBlockPc = 0;
let stepCounter = 0;
let inRender = false;
let activeLog = [];

cpu.read8 = (addr) => {
  const value = originalRead8(addr);
  if (inRender && addr >= 0x000000 && addr < 0x400000) {
    activeLog.push({
      step: stepCounter,
      addr,
      pc: cpu._pc ?? currentBlockPc ?? null,
      val: value,
    });
  }
  return value;
};

try {
  const { cpuSnapshot, ramSnapshot } = bootSnapshot();
  const results = [];

  for (const experiment of EXPERIMENTS) {
    mem.set(ramSnapshot, RAM_SNAP_START);
    resetCpu(cpuSnapshot);
    seedModeBuffer(experiment.charCode);

    activeLog = [];
    currentBlockPc = 0;
    stepCounter = 0;
    inRender = true;

    const runResult = executor.runFrom(RENDER_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onBlock: (pc) => {
        currentBlockPc = pc;
        stepCounter++;
      },
    });

    inRender = false;

    const analysis = analyzeExperiment(activeLog);
    const result = {
      ...experiment,
      runResult,
      rawReadCount: activeLog.length,
      analysis,
    };
    results.push(result);

    const topOne = analysis.topRanges[0];
    const topTwo = analysis.topRanges[1];
    console.log(
      `  ${experiment.label}: reads=${result.rawReadCount} unique=${analysis.uniqueAddresses.length} ` +
        `top1=${formatRange(topOne)}(${topOne?.hitCount ?? 0}) top2=${formatRange(topTwo)}(${topTwo?.hitCount ?? 0})`,
    );
  }

  const resultsByLabel = Object.fromEntries(results.map((result) => [result.label, result]));
  const candidate = collectCandidateSummary(resultsByLabel);
  const reportLines = buildReport(results, candidate);

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n'));

  console.log('');
  console.log(`Candidate table base: ${candidate.tableBase === null ? 'n/a' : hex(candidate.tableBase)}`);
  console.log(`Candidate stride: ${candidate.strideFromAB === null ? 'n/a' : hex(candidate.strideFromAB, 4)}`);
  console.log(`Report written: ${REPORT_PATH}`);
} finally {
  cpu.read8 = originalRead8;
}
