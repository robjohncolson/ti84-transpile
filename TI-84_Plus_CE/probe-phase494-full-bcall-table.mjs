import fs from 'fs';

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));

const TABLE_START = 0x020104;
const TABLE_END = 0x02230B;
const ENTRY_SIZE = 4;
const NUM_ENTRIES = 2178;

const knownFunctions = new Map([
  [0x061003, 'cursor erase (entry 832)'],
  [0x060FEA, 'cursor draw candidate (entry 831)'],
  [0x0059C6, 'character renderer'],
  [0x0A23C0, 'setLCDWindow'],
  [0x0A239E, 'drawPixelBlock'],
  [0x0A2400, 'pixel renderer'],
  [0x05E386, 'validation'],
  [0x005A48, 'VRAM row calculator'],
  [0x0A2032, 'rendering pipeline function'],
  [0x0A1CEC, 'rendering pipeline function'],
  [0x0A22B1, 'rendering pipeline function'],
  [0x04C979, 'idle loop function'],
  [0x060EF5, 'cursor cluster entry'],
  [0x060F85, 'cursor cluster entry'],
  [0x060B8D, 'cursor cluster entry'],
  [0x060C23, 'cursor cluster entry'],
  [0x060C39, 'cursor cluster entry'],
  [0x06118A, 'cursor cluster entry'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function clusterLabel(base) {
  if (base >= 0x060000 && base <= 0x060FFF) return 'display/cursor';
  if (base >= 0x0A2000 && base <= 0x0A2FFF) return 'rendering pipeline';
  if (base >= 0x040000 && base <= 0x04FFFF) return 'math/FPU';
  if (base >= 0x050000 && base <= 0x05FFFF) return 'text editing';
  if (base >= 0x090000 && base <= 0x09FFFF) return 'system/menu';
  if (base >= 0x0B0000 && base <= 0x0BFFFF) return 'USB/filesystem';
  return '';
}

const entries = [];
const nonJpEntries = [];

for (let i = 0; i < NUM_ENTRIES; i++) {
  const offset = TABLE_START + i * ENTRY_SIZE;
  const opcode = rom[offset];

  if (opcode !== 0xC3) {
    nonJpEntries.push({ index: i, tableOffset: offset, opcode });
    continue;
  }

  const target = rom[offset + 1] | (rom[offset + 2] << 8) | (rom[offset + 3] << 16);
  entries.push({ index: i, tableOffset: offset, target });
}

const rangeDistribution = new Map();
for (const entry of entries) {
  const region = entry.target >>> 16;
  rangeDistribution.set(region, (rangeDistribution.get(region) ?? 0) + 1);
}

const clusters = new Map();
for (const entry of entries) {
  const base = entry.target & 0xFFF000;
  const cluster = clusters.get(base) ?? { base, count: 0, entries: [] };
  cluster.count += 1;
  cluster.entries.push(entry);
  clusters.set(base, cluster);
}

const denseClusters = [...clusters.values()]
  .filter((cluster) => cluster.count >= 5)
  .sort((a, b) => b.count - a.count || a.base - b.base);

const knownMatches = entries
  .filter((entry) => knownFunctions.has(entry.target))
  .map((entry) => ({
    index: entry.index,
    tableOffset: entry.tableOffset,
    target: entry.target,
    name: knownFunctions.get(entry.target),
  }));

const byTarget = new Map();
for (const entry of entries) {
  const matches = byTarget.get(entry.target) ?? [];
  matches.push(entry);
  byTarget.set(entry.target, matches);
}

const duplicateTargets = [...byTarget.entries()]
  .filter(([, matches]) => matches.length > 1)
  .map(([target, matches]) => ({ target, entries: matches }))
  .sort((a, b) => b.entries.length - a.entries.length || a.target - b.target);

const sequentialRuns = [];
let run = [];
for (const entry of entries) {
  const prev = run.at(-1);
  if (
    prev &&
    entry.index === prev.index + 1 &&
    entry.target > prev.target &&
    entry.target - prev.target <= 0x100
  ) {
    run.push(entry);
  } else {
    if (run.length >= 5) sequentialRuns.push(run);
    run = [entry];
  }
}
if (run.length >= 5) sequentialRuns.push(run);

const cursorCluster = entries.filter((entry) => entry.index >= 820 && entry.index <= 840);

const jsonTable = entries.map((entry) => ({
  index: entry.index,
  target_hex: hex(entry.target),
}));

fs.writeFileSync(
  new URL('./bcall-table.json', import.meta.url),
  `${JSON.stringify(jsonTable, null, 2)}\n`,
);

console.log('=== Full BCALL Jump Table Probe ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Table range: ${hex(TABLE_START)}-${hex(TABLE_END)}`);
console.log(`Expected entries: ${NUM_ENTRIES}`);
console.log(`JP entries extracted: ${entries.length}`);
console.log(`Non-JP entries: ${nonJpEntries.length}`);
for (const entry of nonJpEntries) {
  console.log(
    `WARNING: Entry ${entry.index} at ${hex(entry.tableOffset)} is not JP (${hex(entry.opcode ?? 0, 2)})`,
  );
}

console.log('\n=== Address Range Distribution ===');
for (const [region, count] of [...rangeDistribution.entries()].sort((a, b) => a[0] - b[0])) {
  const label = `${hex(region, 2)}xxxx`;
  const bar = '#'.repeat(Math.max(1, Math.round((count / entries.length) * 80)));
  console.log(`${label}: ${count.toString().padStart(4)} ${bar}`);
}

console.log('\n=== Top 20 Densest 0x1000 Clusters ===');
for (const cluster of denseClusters.slice(0, 20)) {
  const label = clusterLabel(cluster.base);
  const suffix = label ? ` (${label})` : '';
  console.log(`${hex(cluster.base)}-${hex(cluster.base + 0xFFF)}: ${cluster.count}${suffix}`);
}

console.log('\n=== Known Function Matches ===');
if (knownMatches.length === 0) {
  console.log('None');
} else {
  for (const match of knownMatches) {
    console.log(
      `entry ${match.index.toString().padStart(4)} table=${hex(match.tableOffset)} target=${hex(match.target)} ${match.name}`,
    );
  }
}

console.log('\n=== Duplicate Targets ===');
if (duplicateTargets.length === 0) {
  console.log('None');
} else {
  for (const duplicate of duplicateTargets) {
    const indexes = duplicate.entries.map((entry) => entry.index).join(', ');
    console.log(`${hex(duplicate.target)} <= entries ${indexes}`);
  }
}

console.log('\n=== Notable Sequential Runs (5+ consecutive entries, target delta <= 0x100) ===');
if (sequentialRuns.length === 0) {
  console.log('None');
} else {
  for (const runEntries of sequentialRuns) {
    const first = runEntries[0];
    const last = runEntries.at(-1);
    console.log(
      `entries ${first.index}-${last.index}: ${hex(first.target)} -> ${hex(last.target)} (${runEntries.length} entries)`,
    );
    console.log(`  ${runEntries.map((entry) => hex(entry.target)).join(', ')}`);
  }
}

console.log('\n=== Cursor Cluster Entries 820-840 ===');
for (const entry of cursorCluster) {
  const label = knownFunctions.has(entry.target) ? ` ← ${knownFunctions.get(entry.target)}` : '';
  console.log(`entry ${entry.index}: table=${hex(entry.tableOffset)} target=${hex(entry.target)}${label}`);
}

console.log('\n=== Full Entry List JSON Output ===');
console.log('Wrote TI-84_Plus_CE/bcall-table.json');
