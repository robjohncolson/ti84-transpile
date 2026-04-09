#!/usr/bin/env node

const DEFAULT_ROM_SIZE = 0x400000;
const MAIN_OS_END = 0x100000;
const HEATMAP_REGION_COUNT = 256;
const ONE_KIB = 1024;
const TEN_KIB = 10 * 1024;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatCount(value) {
  return value.toLocaleString('en-US');
}

function formatPercent(value, digits = 2) {
  return `${value.toFixed(digits)}%`;
}

function parseBlockKey(blockId) {
  const [addressText = '', mode = 'adl'] = String(blockId).split(':');
  const startPc = Number.parseInt(addressText, 16);

  return {
    startPc: Number.isInteger(startPc) ? startPc : null,
    mode,
  };
}

function countInstructionBytes(bytes) {
  if (typeof bytes !== 'string') {
    return null;
  }

  const tokens = bytes.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return 0;
  }

  return tokens.length;
}

function getInstructionPc(instruction, blockStartPc, fallbackPc) {
  if (Number.isInteger(instruction?.pc)) {
    return instruction.pc;
  }

  if (Number.isInteger(instruction?.offset)) {
    return blockStartPc + instruction.offset;
  }

  return fallbackPc;
}

function getInstructionLength(instruction) {
  if (Number.isInteger(instruction?.length) && instruction.length > 0) {
    return instruction.length;
  }

  const inferredLength = countInstructionBytes(instruction?.bytes);

  if (Number.isInteger(inferredLength) && inferredLength > 0) {
    return inferredLength;
  }

  return null;
}

function buildBlockEntries(preliftedBlocks, romSize) {
  return Object.entries(preliftedBlocks).flatMap(([blockId, block]) => {
    const parsed = parseBlockKey(blockId);
    const startPc = Number.isInteger(block?.startPc) ? block.startPc : parsed.startPc;
    const mode = typeof block?.mode === 'string' ? block.mode : parsed.mode;

    if (!Number.isInteger(startPc) || startPc < 0 || startPc >= romSize) {
      return [];
    }

    return [
      {
        id: blockId,
        block,
        startPc,
        mode,
      },
    ];
  });
}

function buildNextBlockLookup(entries) {
  const nextStartById = new Map();
  const entriesByMode = new Map();

  for (const entry of entries) {
    if (!entriesByMode.has(entry.mode)) {
      entriesByMode.set(entry.mode, []);
    }

    entriesByMode.get(entry.mode).push(entry);
  }

  for (const modeEntries of entriesByMode.values()) {
    modeEntries.sort((left, right) => left.startPc - right.startPc);

    for (let index = 0; index < modeEntries.length; index += 1) {
      const currentEntry = modeEntries[index];
      const nextEntry = modeEntries[index + 1] ?? null;
      nextStartById.set(currentEntry.id, nextEntry?.startPc ?? null);
    }
  }

  return nextStartById;
}

function collectInstructionRanges(block, blockStartPc, nextBlockStartPc) {
  const instructions = Array.isArray(block?.instructions) ? block.instructions : [];

  if (instructions.length === 0) {
    return [];
  }

  const ranges = [];
  let fallbackPc = blockStartPc;

  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index] ?? {};
    const instructionPc = getInstructionPc(instruction, blockStartPc, fallbackPc);

    if (!Number.isInteger(instructionPc)) {
      continue;
    }

    let instructionLength = getInstructionLength(instruction);

    if (!Number.isInteger(instructionLength) || instructionLength <= 0) {
      const nextInstruction = instructions[index + 1] ?? null;
      const nextPc = nextInstruction
        ? getInstructionPc(nextInstruction, blockStartPc, instructionPc + 1)
        : nextBlockStartPc;

      if (Number.isInteger(nextPc) && nextPc > instructionPc) {
        instructionLength = nextPc - instructionPc;
      }
    }

    if (!Number.isInteger(instructionLength) || instructionLength <= 0) {
      fallbackPc = instructionPc + 1;
      continue;
    }

    ranges.push({
      start: instructionPc,
      length: instructionLength,
    });

    fallbackPc = instructionPc + instructionLength;
  }

  return ranges;
}

function estimateBlockLength(startPc, nextBlockStartPc, romSize) {
  if (!Number.isInteger(nextBlockStartPc) || nextBlockStartPc <= startPc) {
    return 0;
  }

  return Math.min(nextBlockStartPc - startPc, romSize - startPc);
}

function buildCoverage(entries, nextBlockStartById, romSize) {
  const osAreaEnd = Math.min(MAIN_OS_END, romSize);
  const regionSize = Math.ceil(romSize / HEATMAP_REGION_COUNT);
  const coverageBitmap = new Uint8Array(romSize);
  const coveredAddresses = new Set();
  const regionCoveredCounts = Array.from({ length: HEATMAP_REGION_COUNT }, () => 0);
  let osCoveredBytes = 0;
  let dataCoveredBytes = 0;

  function markAddress(address) {
    if (address < 0 || address >= romSize || coverageBitmap[address] === 1) {
      return;
    }

    coverageBitmap[address] = 1;
    coveredAddresses.add(address);

    const regionIndex = Math.min(
      HEATMAP_REGION_COUNT - 1,
      Math.floor(address / regionSize),
    );

    regionCoveredCounts[regionIndex] += 1;

    if (address < osAreaEnd) {
      osCoveredBytes += 1;
      return;
    }

    dataCoveredBytes += 1;
  }

  function markRange(start, length) {
    if (!Number.isInteger(start) || !Number.isInteger(length) || length <= 0) {
      return;
    }

    const boundedStart = Math.max(0, start);
    const boundedEnd = Math.min(romSize, start + length);

    for (let address = boundedStart; address < boundedEnd; address += 1) {
      markAddress(address);
    }
  }

  for (const entry of entries) {
    const nextBlockStartPc = nextBlockStartById.get(entry.id) ?? null;
    const instructionRanges = collectInstructionRanges(entry.block, entry.startPc, nextBlockStartPc);

    if (instructionRanges.length > 0) {
      for (const range of instructionRanges) {
        markRange(range.start, range.length);
      }

      continue;
    }

    const estimatedLength = estimateBlockLength(entry.startPc, nextBlockStartPc, romSize);
    markRange(entry.startPc, estimatedLength);
  }

  return {
    coveredAddresses,
    coverageBitmap,
    regionCoveredCounts,
    regionSize,
    osCoveredBytes,
    dataCoveredBytes,
  };
}

function findUncoveredGaps(coverageBitmap, romSize) {
  const osAreaEnd = Math.min(MAIN_OS_END, romSize);
  const gaps = [];
  let gapStart = null;

  function closeGap(endExclusive) {
    if (gapStart === null || endExclusive <= gapStart) {
      gapStart = null;
      return;
    }

    const start = gapStart;
    const length = endExclusive - gapStart;
    gaps.push({
      start,
      end: endExclusive - 1,
      length,
      interesting: start < osAreaEnd,
      region: start < osAreaEnd ? 'OS area' : 'data area',
    });

    gapStart = null;
  }

  for (let address = 0; address < romSize; address += 1) {
    if (address === osAreaEnd && gapStart !== null && gapStart < osAreaEnd) {
      closeGap(address);
    }

    if (coverageBitmap[address] === 0 && gapStart === null) {
      gapStart = address;
      continue;
    }

    if (coverageBitmap[address] === 1 && gapStart !== null) {
      closeGap(address);
    }
  }

  closeGap(romSize);

  return gaps;
}

function printHeatmap(regionCoveredCounts, regionSize, romSize) {
  console.log('--- Coverage Heatmap (16KB regions, non-zero only) ---');

  for (let regionIndex = 0; regionIndex < regionCoveredCounts.length; regionIndex += 1) {
    const coveredBytes = regionCoveredCounts[regionIndex];

    if (coveredBytes === 0) {
      continue;
    }

    const start = regionIndex * regionSize;

    if (start >= romSize) {
      break;
    }

    const endExclusive = Math.min(romSize, start + regionSize);
    const end = endExclusive - 1;
    const regionLength = endExclusive - start;
    const coveragePercent = regionLength === 0 ? 0 : (coveredBytes / regionLength) * 100;

    console.log(
      `  Region ${hex(start)}-${hex(end)}: ${coveragePercent.toFixed(1).padStart(5)}% ` +
        `(${formatCount(coveredBytes)} bytes)`,
    );
  }
}

function printTopGaps(gaps) {
  console.log('--- Top 20 Uncovered Gaps ---');

  const topGaps = gaps.slice(0, 20);

  if (topGaps.length === 0) {
    console.log('  None');
    return;
  }

  topGaps.forEach((gap, index) => {
    console.log(
      `  #${index + 1}: ${hex(gap.start)}-${hex(gap.end)} ` +
        `(${formatCount(gap.length)} bytes, ${gap.region})`,
    );
  });
}

function printSuggestedSeeds(gaps) {
  console.log('--- Suggested New Seeds (from largest OS-area gaps) ---');

  const osAreaSeeds = gaps
    .filter((gap) => gap.interesting)
    .slice(0, 10);

  if (osAreaSeeds.length === 0) {
    console.log('  None');
    return;
  }

  for (const gap of osAreaSeeds) {
    console.log(`  { pc: ${hex(gap.start)}, mode: 'adl' },`);
  }
}

async function main() {
  const { PRELIFTED_BLOCKS, TRANSPILATION_META } = await import('./ROM.transpiled.js');
  const romSize = TRANSPILATION_META?.romSize ?? DEFAULT_ROM_SIZE;
  const osAreaSize = Math.min(MAIN_OS_END, romSize);
  const dataAreaSize = Math.max(0, romSize - osAreaSize);
  const blockEntries = buildBlockEntries(PRELIFTED_BLOCKS ?? {}, romSize);
  const nextBlockStartById = buildNextBlockLookup(blockEntries);
  const coverage = buildCoverage(blockEntries, nextBlockStartById, romSize);
  const coveredBytes = coverage.coveredAddresses.size;
  const coveragePercent = romSize === 0 ? 0 : (coveredBytes / romSize) * 100;
  const gaps = findUncoveredGaps(coverage.coverageBitmap, romSize).sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return left.start - right.start;
  });

  const largestGap = gaps[0] ?? null;
  const gapsOver1KiB = gaps.filter((gap) => gap.length > ONE_KIB).length;
  const gapsOver10KiB = gaps.filter((gap) => gap.length > TEN_KIB).length;
  const osCoveragePercent = osAreaSize === 0 ? 0 : (coverage.osCoveredBytes / osAreaSize) * 100;
  const dataCoveragePercent = dataAreaSize === 0 ? 0 : (coverage.dataCoveredBytes / dataAreaSize) * 100;

  console.log('=== TI-84 Plus CE ROM Coverage Analysis ===');
  console.log();
  console.log(
    `Coverage: ${formatCount(coveredBytes)} / ${formatCount(romSize)} bytes ` +
      `(${formatPercent(coveragePercent)})`,
  );
  console.log(`Blocks: ${formatCount(blockEntries.length)}`);
  console.log();

  printHeatmap(coverage.regionCoveredCounts, coverage.regionSize, romSize);
  console.log();

  printTopGaps(gaps);
  console.log();

  printSuggestedSeeds(gaps);
  console.log();

  console.log('--- Summary ---');
  console.log(`  Total blocks: ${formatCount(blockEntries.length)}`);
  console.log(
    `  Total covered bytes: ${formatCount(coveredBytes)} / ${formatCount(romSize)} ` +
      `(${formatPercent(coveragePercent)})`,
  );
  console.log(`  Gaps > 1KB: ${formatCount(gapsOver1KiB)}`);
  console.log(`  Gaps > 10KB: ${formatCount(gapsOver10KiB)}`);

  if (largestGap) {
    console.log(
      `  Largest gap: ${hex(largestGap.start)}-${hex(largestGap.end)} ` +
        `(${formatCount(largestGap.length)} bytes)`,
    );
  } else {
    console.log('  Largest gap: None');
  }

  console.log(
    `  OS area coverage: ${formatPercent(osCoveragePercent)} ` +
      `(${formatCount(coverage.osCoveredBytes)} / ${formatCount(osAreaSize)} bytes)`,
  );
  console.log(
    `  Data area coverage: ${formatPercent(dataCoveragePercent)} ` +
      `(${formatCount(coverage.dataCoveredBytes)} / ${formatCount(dataAreaSize)} bytes)`,
  );
}

await main().catch((error) => {
  console.error('Failed to analyze ROM coverage.');
  console.error(error);
  process.exitCode = 1;
});
