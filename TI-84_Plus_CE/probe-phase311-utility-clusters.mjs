#!/usr/bin/env node

/**
 * Phase 311 Probe: find other general-purpose utility clusters
 *
 * What this probe does:
 *   1. Scans four candidate ROM regions for dense runs of small helpers.
 *   2. Finds candidate entry points from two signals:
 *      - the byte after an unconditional RET (0xC9), when it decodes cleanly
 *      - any direct 24-bit CALL/JP target inside the region
 *   3. Decodes each candidate entry until the next RET and keeps helpers
 *      that fit in 30 bytes or less.
 *   4. Counts exact 24-bit CALL/JP sites plus extra non-overlapping low-word
 *      16-bit CALL/JP matches across the full 4 MB ROM.
 *   5. Groups contiguous post-RET helpers into utility clusters, while also
 *      folding in xref-only alternate entries that start inside the cluster.
 *   6. Prints per-region findings, a cluster summary table, the top 20 hottest
 *      utility entry points, and any string/memory-flavored helpers.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MAX_UTILITY_BYTES = 30;
const HIGH_TRAFFIC_THRESHOLD = 10;

const REGIONS = [
  {
    key: 'before-known',
    label: 'Immediately before the known cluster',
    start: 0x04C800,
    end: 0x04C960,
  },
  {
    key: 'after-known',
    label: 'Immediately after the known cluster',
    start: 0x04CA40,
    end: 0x04CC00,
  },
  {
    key: 'nearby-bank',
    label: 'Nearby in the same ROM bank',
    start: 0x04D000,
    end: 0x04D200,
  },
  {
    key: 'low-helper',
    label: 'Low-address helper region',
    start: 0x000200,
    end: 0x000400,
  },
];

const KNOWN_CLUSTER_REFERENCE = {
  range: '0x04C960..0x04CA40',
  entryCount: 15,
  callerTotal: 442,
  hottestEntry: 0x04C979,
  hottestCallers: 252,
};

const CALL_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const JP_OPS = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

const UTILITY_LABELS = new Map([
  [0x04C824, 'modeFlagGate'],
  [0x04C83A, 'bit42GuardAndSet'],
  [0x04C850, 'clearA_ret'],
  [0x04C852, 'kbdWait11Loops'],
  [0x04C864, 'getBCUpperByte'],
  [0x04C86E, 'testBCNonZero'],
  [0x04C875, 'packB_BC_to_BC'],
  [0x04C876, 'packA_BC_to_BC'],
  [0x04C885, 'packB_DE_to_DE'],
  [0x04C886, 'packA_DE_to_DE'],
  [0x04C895, 'packB_HL_to_HL'],
  [0x04C896, 'packA_HL_to_HL'],
  [0x04C8A3, 'getDEUpperByte'],
  [0x04C8AD, 'testDENonZero'],
  [0x04C8B4, 'getHLUpperByte'],
  [0x04C8BD, 'testHLNonZero'],
  [0x04C8C4, 'signExtendBC_fromBit7'],
  [0x04C8DB, 'signExtendDE_fromBit7'],
  [0x04C8F2, 'signExtendHL_fromBit7'],
  [0x04C907, 'loadDEInd24'],
  [0x04C90D, 'loadDEInd_s'],
  [0x04C916, 'LoadHLInd_s'],
  [0x04C91C, 'zeroExtendBC24'],
  [0x04C92E, 'zeroExtendDE24'],
  [0x04C940, 'zeroExtendHL24'],
  [0x04CA41, 'stackMemmoveBackward_ix'],
  [0x04CA58, 'stackMemmoveForward_ix'],
  [0x04CA6F, 'stackArgPlus3'],
  [0x04CA75, 'constD1787C'],
  [0x04CA7A, 'retOnly'],
  [0x04CA7B, 'iyCallThunk_040D11'],
  [0x04CA84, 'ldA0C_ret'],
  [0x04CB7A, 'copyD026AC_AD_to_ix'],
  [0x04CB8D, 'strideA0IndexToD40000'],
  [0x0003F5, 'ret2_lowhelper'],
]);

const UTILITY_NOTES = new Map([
  [0x04C864, 'extracts the top byte of BC through scrapMem'],
  [0x04C86E, 'tests whether the full 24-bit BC value is non-zero'],
  [0x04C876, 'packs caller-supplied A:B:C into a 24-bit BC'],
  [0x04C886, 'packs caller-supplied A:D:E into a 24-bit DE'],
  [0x04C896, 'packs caller-supplied A:H:L into a 24-bit HL'],
  [0x04C8A3, 'extracts the top byte of DE through scrapMem'],
  [0x04C8B4, 'extracts the top byte of HL through scrapMem'],
  [0x04C8BD, 'tests whether the full 24-bit HL value is non-zero'],
  [0x04C90D, 'loads a 16-bit little-endian word from (HL) into DE and advances HL'],
  [0x04C916, 'loads a 16-bit little-endian word into HL, then zero-extends it'],
  [0x04C91C, 'zero-extends BC to 24 bits through scrapMem'],
  [0x04C92E, 'zero-extends DE to 24 bits through scrapMem'],
  [0x04C940, 'zero-extends HL to 24 bits through scrapMem'],
  [0x04CA41, 'IX-framed LDDR wrapper; memmove-style backward copy'],
  [0x04CA58, 'IX-framed LDIR wrapper; memmove-style forward copy'],
  [0x04CA7B, 'loads a fixed IY base then jumps into 0x040D11'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function printRule(ch = '=', width = 108) {
  console.log(ch.repeat(width));
}

function printSection(title) {
  console.log('');
  printRule('=');
  console.log(title);
  printRule('=');
}

function tryDecode(addr) {
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function findRegionForAddress(addr) {
  return REGIONS.find((region) => addr >= region.start && addr <= region.end) ?? null;
}

function collectXrefs() {
  const direct24 = new Map();
  const direct24Sites = new Map();
  const short16Sites = new Map();

  for (let addr = 0; addr < rom.length - 3; addr += 1) {
    const op = rom[addr];
    const mnemonic = CALL_OPS.get(op) ?? JP_OPS.get(op);
    if (!mnemonic) continue;

    const target24 = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    const target16 = rom[addr + 1] | (rom[addr + 2] << 8);

    const region24 = findRegionForAddress(target24);
    if (region24) {
      const info = direct24.get(target24) ?? { total: 0, calls: 0, jumps: 0 };
      info.total += 1;
      if (CALL_OPS.has(op)) info.calls += 1;
      if (JP_OPS.has(op)) info.jumps += 1;
      direct24.set(target24, info);

      const sites = direct24Sites.get(target24) ?? new Set();
      sites.add(addr);
      direct24Sites.set(target24, sites);
    }

    const region16 = findRegionForAddress(target16);
    if (region16) {
      const sites = short16Sites.get(target16) ?? new Set();
      sites.add(addr);
      short16Sites.set(target16, sites);
    }
  }

  return { direct24, direct24Sites, short16Sites };
}

function refsFor(addr, xrefIndex) {
  const direct = xrefIndex.direct24.get(addr) ?? { total: 0, calls: 0, jumps: 0 };
  const directSites = xrefIndex.direct24Sites.get(addr) ?? new Set();
  const shortSites = xrefIndex.short16Sites.get(addr) ?? new Set();

  let extra16 = 0;
  for (const site of shortSites) {
    if (!directSites.has(site)) extra16 += 1;
  }

  return {
    direct24: direct.total,
    directCalls: direct.calls,
    directJumps: direct.jumps,
    extra16,
    totalKnown: direct.total + extra16,
  };
}

function scanToRet(start, regionEnd) {
  const instructions = [];
  let pc = start;

  while (pc <= regionEnd) {
    const inst = tryDecode(pc);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) return null;

    const end = pc + inst.length - 1;
    if (end > regionEnd) return null;

    instructions.push({ addr: pc, inst });
    pc += inst.length;

    if (inst.tag === 'ret') {
      return {
        start,
        end,
        size: end - start + 1,
        instructions,
      };
    }

    if (pc - start > 0x100) return null;
  }

  return null;
}

function detectEntryStarts(region, xrefIndex) {
  const reasons = new Map();

  function addReason(addr, reason) {
    if (addr < region.start || addr > region.end) return;
    if (!tryDecode(addr)) return;
    const reasonSet = reasons.get(addr) ?? new Set();
    reasonSet.add(reason);
    reasons.set(addr, reasonSet);
  }

  for (let addr = region.start - 1; addr < region.end; addr += 1) {
    if (addr < 0) continue;
    if (rom[addr] !== 0xC9) continue;
    addReason(addr + 1, 'post-ret');
  }

  for (const target of xrefIndex.direct24.keys()) {
    if (target >= region.start && target <= region.end) addReason(target, 'xref24');
  }

  for (const target of xrefIndex.short16Sites.keys()) {
    if (target >= region.start && target <= region.end) addReason(target, 'xref16');
  }

  return [...reasons.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, reasonSet]) => ({
      start,
      reasons: [...reasonSet].sort(),
    }));
}

function discoverRegion(region, xrefIndex) {
  const rawEntries = [];

  for (const candidate of detectEntryStarts(region, xrefIndex)) {
    const fn = scanToRet(candidate.start, region.end);
    if (!fn || fn.size > MAX_UTILITY_BYTES) continue;

    rawEntries.push({
      ...fn,
      region,
      reasons: candidate.reasons,
      refs: refsFor(candidate.start, xrefIndex),
      label: UTILITY_LABELS.get(candidate.start) ?? '(unnamed)',
      note: UTILITY_NOTES.get(candidate.start) ?? '',
    });
  }

  const canonical = [];
  const alternates = [];

  for (const entry of rawEntries) {
    const previous = canonical[canonical.length - 1];
    if (previous && entry.start <= previous.end) {
      alternates.push(entry);
    } else {
      canonical.push(entry);
    }
  }

  const canonicalClusters = [];
  let current = [];

  for (const entry of canonical) {
    const previous = current[current.length - 1];
    if (!previous || entry.start === previous.end + 1) {
      current.push(entry);
      continue;
    }
    if (current.length >= 2) canonicalClusters.push(current);
    current = [entry];
  }
  if (current.length >= 2) canonicalClusters.push(current);

  const clusters = canonicalClusters.map((clusterEntries) => {
    const start = clusterEntries[0].start;
    const end = clusterEntries[clusterEntries.length - 1].end;
    const entries = rawEntries.filter((entry) => entry.start >= start && entry.end <= end);
    const highTraffic = entries.filter((entry) => entry.refs.totalKnown >= HIGH_TRAFFIC_THRESHOLD);
    const totalCallers = entries.reduce((sum, entry) => sum + entry.refs.totalKnown, 0);

    return {
      region,
      start,
      end,
      entries,
      canonicalEntries: clusterEntries,
      alternateEntries: entries.filter((entry) => !clusterEntries.includes(entry)),
      totalCallers,
      highTraffic,
    };
  });

  return {
    region,
    rawEntries,
    canonical,
    alternates,
    clusters,
  };
}

function formatCallerMath(refs) {
  return `${refs.totalKnown} = ${refs.direct24} + ${refs.extra16}`;
}

function stringMemoryKind(entry) {
  const tags = new Set(entry.instructions.map((item) => item.inst.tag));
  if (tags.has('lddr')) return 'LDDR wrapper';
  if (tags.has('ldir')) return 'LDIR wrapper';
  if (tags.has('cpir')) return 'string scan';
  if (entry.label.includes('load') || entry.label.includes('Load')) return 'stream loader';
  return '';
}

function printRegionSummary(result) {
  console.log(`${result.region.label} (${hex(result.region.start)}..${hex(result.region.end)})`);
  console.log(`  candidate utility entries <= ${MAX_UTILITY_BYTES} bytes: ${result.rawEntries.length}`);
  console.log(`  canonical post-RET entries: ${result.canonical.length}`);
  console.log(`  overlapping xref-only alternates: ${result.alternates.length}`);
  if (result.clusters.length === 0) {
    console.log('  no multi-entry utility cluster detected in this window');
    return;
  }

  for (const cluster of result.clusters) {
    const hottest = [...cluster.entries]
      .sort((a, b) => b.refs.totalKnown - a.refs.totalKnown || a.start - b.start)
      .slice(0, 3)
      .map((entry) => `${hex(entry.start)} ${entry.label} (${entry.refs.totalKnown})`)
      .join(', ');
    console.log(
      `  cluster ${hex(cluster.start)}..${hex(cluster.end)}  entries=${cluster.entries.length}` +
      ` (${cluster.canonicalEntries.length} canonical + ${cluster.alternateEntries.length} aliases)` +
      `  callers=${cluster.totalCallers}  high-traffic=${cluster.highTraffic.length}`
    );
    console.log(`    hottest: ${hottest}`);
  }
}

function printClusterTable(clusters) {
  printSection('Discovered Utility Clusters');
  if (clusters.length === 0) {
    console.log('No qualifying utility clusters were found in the requested windows.');
    return;
  }

  console.log(
    `${'Cluster'.padEnd(21)} ${'Region'.padEnd(14)} ${'Entries'.padEnd(12)} ${'Callers'.padEnd(12)} ${'High>=10'.padEnd(9)} Notes`
  );
  printRule('-');
  for (const cluster of clusters) {
    const entryText = `${cluster.entries.length} (${cluster.canonicalEntries.length}+${cluster.alternateEntries.length})`;
    const notes = cluster.region.key === 'before-known'
      ? 'scrapMem pack/zero-extend corridor just ahead of phase 310'
      : cluster.region.key === 'after-known'
        ? 'post-phase-310 mini-strip'
        : 'small helper pair';
    console.log(
      `${`${hex(cluster.start)}..${hex(cluster.end)}`.padEnd(21)}` +
      ` ${cluster.region.key.padEnd(14)}` +
      ` ${entryText.padEnd(12)}` +
      ` ${String(cluster.totalCallers).padEnd(12)}` +
      ` ${String(cluster.highTraffic.length).padEnd(9)}` +
      ` ${notes}`
    );
  }
}

function printTopUtilities(entries) {
  printSection('Top 20 Highest-Caller Utility Entries');
  if (entries.length === 0) {
    console.log('No utility entries were found.');
    return;
  }

  console.log(
    `${'Rank'.padEnd(5)} ${'Entry'.padEnd(10)} ${'Callers'.padEnd(12)} ${'Bytes'.padEnd(6)} ${'Cluster'.padEnd(21)} ${'Label'.padEnd(26)} Notes`
  );
  printRule('-');

  entries.slice(0, 20).forEach((entry, index) => {
    const clusterText = `${hex(entry.cluster.start)}..${hex(entry.cluster.end)}`;
    console.log(
      `${String(index + 1).padEnd(5)}` +
      ` ${hex(entry.start).padEnd(10)}` +
      ` ${formatCallerMath(entry.refs).padEnd(12)}` +
      ` ${String(entry.size).padEnd(6)}` +
      ` ${clusterText.padEnd(21)}` +
      ` ${entry.label.padEnd(26)}` +
      ` ${entry.note}`
    );
  });
}

function printStringMemoryUtilities(entries) {
  printSection('String / Memory-Flavored Utilities');
  const interesting = entries
    .map((entry) => ({ entry, kind: stringMemoryKind(entry) }))
    .filter((item) => item.kind);

  if (interesting.length === 0) {
    console.log('No string/memory-flavored utilities were found in the requested windows.');
    return;
  }

  console.log(
    `${'Entry'.padEnd(10)} ${'Callers'.padEnd(12)} ${'Kind'.padEnd(16)} ${'Label'.padEnd(26)} Notes`
  );
  printRule('-');
  for (const item of interesting) {
    const entry = item.entry;
    console.log(
      `${hex(entry.start).padEnd(10)}` +
      ` ${formatCallerMath(entry.refs).padEnd(12)}` +
      ` ${item.kind.padEnd(16)}` +
      ` ${entry.label.padEnd(26)}` +
      ` ${entry.note}`
    );
  }
}

function main() {
  const xrefIndex = collectXrefs();
  const regionResults = REGIONS.map((region) => discoverRegion(region, xrefIndex));
  const clusters = regionResults.flatMap((result) => result.clusters);

  const allClusterEntries = clusters
    .flatMap((cluster) => cluster.entries.map((entry) => ({ ...entry, cluster })))
    .sort((a, b) => {
      if (b.refs.totalKnown !== a.refs.totalKnown) return b.refs.totalKnown - a.refs.totalKnown;
      if (b.refs.direct24 !== a.refs.direct24) return b.refs.direct24 - a.refs.direct24;
      return a.start - b.start;
    });

  printRule('=');
  console.log('Phase 311 - Utility Cluster Scan');
  printRule('=');
  console.log(`ROM size: ${rom.length} bytes`);
  console.log(`Utility size ceiling: ${MAX_UTILITY_BYTES} bytes`);
  console.log(`High-traffic threshold: ${HIGH_TRAFFIC_THRESHOLD} direct/possible callers`);
  console.log('Caller totals are reported as total = exact 24-bit CALL/JP sites + extra non-overlapping low-word 16-bit matches.');
  console.log(
    `Known reference cluster: ${KNOWN_CLUSTER_REFERENCE.range} with ${KNOWN_CLUSTER_REFERENCE.entryCount} cataloged entries, ` +
    `${KNOWN_CLUSTER_REFERENCE.callerTotal} total callers, and hottest entry ${hex(KNOWN_CLUSTER_REFERENCE.hottestEntry)} ` +
    `(${KNOWN_CLUSTER_REFERENCE.hottestCallers} callers).`
  );

  printSection('Per-Region Summary');
  for (const result of regionResults) {
    printRegionSummary(result);
  }

  printClusterTable(clusters);
  printTopUtilities(allClusterEntries);
  printStringMemoryUtilities(allClusterEntries);

  printSection('Quick Takeaways');
  if (clusters.length === 0) {
    console.log('None of the requested windows produced a new multi-entry utility strip.');
    return;
  }

  const hottestCluster = [...clusters].sort((a, b) => b.totalCallers - a.totalCallers || a.start - b.start)[0];
  console.log(
    `The strongest new strip is ${hex(hottestCluster.start)}..${hex(hottestCluster.end)} in ${hottestCluster.region.key}.`
  );
  console.log(
    `It contributes ${hottestCluster.entries.length} utility entry points ` +
    `(${hottestCluster.canonicalEntries.length} canonical + ${hottestCluster.alternateEntries.length} aliases) ` +
    `with ${hottestCluster.totalCallers} combined callers.`
  );
  console.log(
    `It still trails the phase 310 compare/negate cluster by ${KNOWN_CLUSTER_REFERENCE.callerTotal - hottestCluster.totalCallers} callers, ` +
    `and no new entry beat ${hex(KNOWN_CLUSTER_REFERENCE.hottestEntry)}'s ${KNOWN_CLUSTER_REFERENCE.hottestCallers} callers.`
  );
}

main();
