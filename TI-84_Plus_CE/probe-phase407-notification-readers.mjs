/**
 * probe-phase407-notification-readers.mjs
 *
 * Scans the TI-84 Plus CE ROM for readers of the notification payload (D177B8)
 * and notification type (D177B9) addresses. Groups by 4KB page, identifies
 * top clusters, disassembles representative readers, and categorizes behavior.
 */

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = rom.length;

// --- Scan for LD A,(0xD177B8) and LD A,(0xD177B9) ---

const payloadReaders = []; // LD A,(0xD177B8) = 3A B8 77 D1
const typeReaders = [];    // LD A,(0xD177B9) = 3A B9 77 D1

for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0x3A && rom[i + 2] === 0x77 && rom[i + 3] === 0xD1) {
    if (rom[i + 1] === 0xB8) payloadReaders.push(i);
    if (rom[i + 1] === 0xB9) typeReaders.push(i);
  }
}

console.log(`=== Phase 407: Notification Readers Scan ===\n`);
console.log(`LD A,(0xD177B8) payload readers: ${payloadReaders.length}`);
console.log(`LD A,(0xD177B9) type readers:    ${typeReaders.length}`);
console.log(`Total readers:                   ${payloadReaders.length + typeReaders.length}\n`);

// --- Group by 4KB page ---

const allReaders = [
  ...payloadReaders.map(a => ({ addr: a, kind: 'payload' })),
  ...typeReaders.map(a => ({ addr: a, kind: 'type' })),
];

const pageMap = new Map(); // page -> { payload: [addr], type: [addr] }

for (const r of allReaders) {
  const page = r.addr >> 12;
  if (!pageMap.has(page)) pageMap.set(page, { payload: [], type: [] });
  pageMap.get(page)[r.kind].push(r.addr);
}

// Sort pages by total reader count descending
const sortedPages = [...pageMap.entries()]
  .map(([page, data]) => ({
    page,
    pageHex: '0x' + (page << 12).toString(16).toUpperCase().padStart(6, '0'),
    payloadCount: data.payload.length,
    typeCount: data.type.length,
    total: data.payload.length + data.type.length,
    addrs: [...data.payload, ...data.type].sort((a, b) => a - b),
    payloadAddrs: data.payload.sort((a, b) => a - b),
    typeAddrs: data.type.sort((a, b) => a - b),
  }))
  .sort((a, b) => b.total - a.total);

console.log(`Pages with readers: ${sortedPages.length}\n`);

// --- Helper: hex dump ---

function hexAt(addr, len) {
  const start = Math.max(0, addr);
  const end = Math.min(ROM_SIZE, addr + len);
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(rom[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function addr24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// --- Helper: simple disassembly around a reader ---

function disasmAround(addr) {
  const results = [];
  // Scan forward from the LD A instruction (4 bytes) looking for key patterns
  // within the next 30 bytes
  const scanStart = addr + 4; // after the LD A,(nn) instruction
  const scanEnd = Math.min(scanStart + 30, ROM_SIZE - 3);

  const cpValues = [];
  const branches = [];
  const calls = [];
  let hasOrA = false;

  for (let i = scanStart; i < scanEnd; i++) {
    const b = rom[i];

    // CP n = 0xFE + imm8
    if (b === 0xFE && i + 1 < ROM_SIZE) {
      const val = rom[i + 1];
      cpValues.push({ offset: i, value: val });
      results.push(`  0x${i.toString(16).toUpperCase()}: CP 0x${val.toString(16).toUpperCase().padStart(2, '0')}`);
      i += 1; // skip imm
      continue;
    }

    // OR A = 0xB7
    if (b === 0xB7) {
      hasOrA = true;
      results.push(`  0x${i.toString(16).toUpperCase()}: OR A`);
      continue;
    }

    // JR Z,e = 0x28
    if (b === 0x28 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR Z', target });
      results.push(`  0x${i.toString(16).toUpperCase()}: JR Z, 0x${target.toString(16).toUpperCase()}`);
      i += 1;
      continue;
    }

    // JR NZ,e = 0x20
    if (b === 0x20 && i + 1 < ROM_SIZE) {
      const rel = rom[i + 1];
      const target = i + 2 + ((rel & 0x80) ? rel - 256 : rel);
      branches.push({ offset: i, type: 'JR NZ', target });
      results.push(`  0x${i.toString(16).toUpperCase()}: JR NZ, 0x${target.toString(16).toUpperCase()}`);
      i += 1;
      continue;
    }

    // JP Z,nn = 0xCA
    if (b === 0xCA && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP Z', target });
      results.push(`  0x${i.toString(16).toUpperCase()}: JP Z, 0x${target.toString(16).toUpperCase().padStart(6, '0')}`);
      i += 3;
      continue;
    }

    // JP NZ,nn = 0xC2
    if (b === 0xC2 && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      branches.push({ offset: i, type: 'JP NZ', target });
      results.push(`  0x${i.toString(16).toUpperCase()}: JP NZ, 0x${target.toString(16).toUpperCase().padStart(6, '0')}`);
      i += 3;
      continue;
    }

    // CALL nn = 0xCD
    if (b === 0xCD && i + 3 <= ROM_SIZE) {
      const target = addr24(i + 1);
      calls.push({ offset: i, target });
      results.push(`  0x${i.toString(16).toUpperCase()}: CALL 0x${target.toString(16).toUpperCase().padStart(6, '0')}`);
      i += 3;
      continue;
    }

    // RET = 0xC9
    if (b === 0xC9) {
      results.push(`  0x${i.toString(16).toUpperCase()}: RET`);
      break; // stop at RET
    }
  }

  return { results, cpValues, branches, calls, hasOrA };
}

// --- Categorize a cluster based on its readers ---

function categorizeCluster(representatives) {
  let totalCP = 0;
  let totalBranches = 0;
  let totalCalls = 0;
  let totalOrA = 0;
  let payloadCount = 0;
  let typeCount = 0;

  for (const rep of representatives) {
    totalCP += rep.disasm.cpValues.length;
    totalBranches += rep.disasm.branches.length;
    totalCalls += rep.disasm.calls.length;
    if (rep.disasm.hasOrA) totalOrA++;
    if (rep.kind === 'payload') payloadCount++;
    if (rep.kind === 'type') typeCount++;
  }

  if (typeCount > 0 && totalCP > 0) return 'type checker';
  if (payloadCount > 0 && totalCP > 0) return 'payload discriminator';
  if (totalOrA > 0 && totalBranches > 0 && totalCP === 0) return 'zero-test gate';
  if (totalCalls > 0 && totalCP === 0 && totalBranches === 0) return 'read-and-call';
  if (totalBranches > 0 && totalCP === 0) return 'conditional pass-through';
  if (totalCP > 0) return 'value checker';
  return 'pass-through';
}

// --- Analyze top 10 clusters ---

const top10 = sortedPages.slice(0, 10);
const clusterAnalysis = [];

console.log('=== Top 10 Clusters by Reader Count ===\n');

for (const cluster of top10) {
  const allAddrs = cluster.addrs;
  const addrMin = allAddrs[0];
  const addrMax = allAddrs[allAddrs.length - 1];

  // Pick 2-3 representative addresses (first, middle, last)
  const repIndices = [0];
  if (allAddrs.length >= 3) repIndices.push(Math.floor(allAddrs.length / 2));
  if (allAddrs.length >= 2) repIndices.push(allAddrs.length - 1);

  const representatives = [];

  console.log(`--- Cluster at page ${cluster.pageHex} (0x${addrMin.toString(16).toUpperCase()}..0x${addrMax.toString(16).toUpperCase()}) ---`);
  console.log(`  Payload readers: ${cluster.payloadCount}, Type readers: ${cluster.typeCount}, Total: ${cluster.total}`);

  for (const idx of repIndices) {
    const addr = allAddrs[idx];
    const kind = cluster.payloadAddrs.includes(addr) ? 'payload' : 'type';
    const target = kind === 'payload' ? 'D177B8' : 'D177B9';

    console.log(`\n  Representative: 0x${addr.toString(16).toUpperCase()} (${target} ${kind} reader)`);

    // Hex dump: 30 before + 4 (instruction) + 30 after
    const before = Math.max(0, addr - 30);
    console.log(`    Before (${(addr - before)} bytes): ${hexAt(before, addr - before)}`);
    console.log(`    Instr:  ${hexAt(addr, 4)}`);
    console.log(`    After:  ${hexAt(addr + 4, 30)}`);

    const disasm = disasmAround(addr);
    if (disasm.results.length > 0) {
      console.log(`    Disassembly (after LD A):`);
      for (const line of disasm.results) console.log(`    ${line}`);
    } else {
      console.log(`    Disassembly: (no key instructions found in next 30 bytes)`);
    }

    representatives.push({ addr, kind, disasm });
  }

  const category = categorizeCluster(representatives);
  const keyCPValues = [];
  for (const rep of representatives) {
    for (const cp of rep.disasm.cpValues) {
      if (!keyCPValues.includes(cp.value)) keyCPValues.push(cp.value);
    }
  }

  clusterAnalysis.push({
    pageHex: cluster.pageHex,
    addrRange: `0x${addrMin.toString(16).toUpperCase()}..0x${addrMax.toString(16).toUpperCase()}`,
    payloadCount: cluster.payloadCount,
    typeCount: cluster.typeCount,
    total: cluster.total,
    category,
    cpValues: keyCPValues,
  });

  console.log(`\n  Category: ${category}`);
  if (keyCPValues.length > 0) {
    console.log(`  Key CP values: ${keyCPValues.map(v => '0x' + v.toString(16).toUpperCase().padStart(2, '0')).join(', ')}`);
  }
  console.log('');
}

// --- Summary Table ---

console.log('\n=== Summary Table ===\n');
console.log('Page       | Address Range                    | Payload | Type | Total | Pattern               | CP Values');
console.log('-----------|----------------------------------|---------|------|-------|-----------------------|----------');

for (const c of clusterAnalysis) {
  const cpStr = c.cpValues.length > 0
    ? c.cpValues.map(v => '0x' + v.toString(16).toUpperCase().padStart(2, '0')).join(',')
    : '-';
  console.log(
    `${c.pageHex.padEnd(10)} | ${c.addrRange.padEnd(32)} | ${String(c.payloadCount).padStart(7)} | ${String(c.typeCount).padStart(4)} | ${String(c.total).padStart(5)} | ${c.category.padEnd(21)} | ${cpStr}`
  );
}

// --- All pages table ---

console.log('\n=== All Pages with Readers ===\n');
console.log('Page       | Payload | Type | Total');
console.log('-----------|---------|------|------');

for (const p of sortedPages) {
  console.log(
    `${p.pageHex.padEnd(10)} | ${String(p.payloadCount).padStart(7)} | ${String(p.typeCount).padStart(4)} | ${String(p.total).padStart(5)}`
  );
}

// --- Write report ---

let report = `# Phase 407: Notification Readers Report\n\n`;
report += `## Scan Results\n\n`;
report += `- **LD A,(0xD177B8)** payload readers: ${payloadReaders.length}\n`;
report += `- **LD A,(0xD177B9)** type readers: ${typeReaders.length}\n`;
report += `- **Total readers**: ${payloadReaders.length + typeReaders.length}\n`;
report += `- **Pages with readers**: ${sortedPages.length}\n\n`;

report += `## Top 10 Clusters\n\n`;
report += `| Page | Address Range | Payload | Type | Total | Pattern | CP Values |\n`;
report += `|------|---------------|---------|------|-------|---------|----------|\n`;

for (const c of clusterAnalysis) {
  const cpStr = c.cpValues.length > 0
    ? c.cpValues.map(v => '0x' + v.toString(16).toUpperCase().padStart(2, '0')).join(', ')
    : '-';
  report += `| ${c.pageHex} | ${c.addrRange} | ${c.payloadCount} | ${c.typeCount} | ${c.total} | ${c.category} | ${cpStr} |\n`;
}

report += `\n## All Pages\n\n`;
report += `| Page | Payload | Type | Total |\n`;
report += `|------|---------|------|-------|\n`;

for (const p of sortedPages) {
  report += `| ${p.pageHex} | ${p.payloadCount} | ${p.typeCount} | ${p.total} |\n`;
}

report += `\n## Key Findings\n\n`;
report += `- Notification readers are spread across ${sortedPages.length} 4KB pages\n`;
report += `- Top cluster is at ${clusterAnalysis[0]?.pageHex || 'N/A'} with ${clusterAnalysis[0]?.total || 0} readers\n`;

// Collect all unique CP values across all clusters
const allCPValues = new Set();
for (const c of clusterAnalysis) {
  for (const v of c.cpValues) allCPValues.add(v);
}
if (allCPValues.size > 0) {
  report += `- Unique CP comparison values found: ${[...allCPValues].sort((a,b) => a-b).map(v => '0x' + v.toString(16).toUpperCase().padStart(2, '0')).join(', ')}\n`;
}

// Category breakdown
const catCounts = {};
for (const c of clusterAnalysis) {
  catCounts[c.category] = (catCounts[c.category] || 0) + 1;
}
report += `\n### Cluster Categories (Top 10)\n\n`;
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  report += `- **${cat}**: ${count} cluster(s)\n`;
}

report += `\n## Method\n\n`;
report += `Scanned entire 4MB ROM for byte patterns:\n`;
report += `- LD A,(0xD177B8): 3A B8 77 D1\n`;
report += `- LD A,(0xD177B9): 3A B9 77 D1\n\n`;
report += `For each reader, disassembled the next 30 bytes looking for CP, JR, JP, CALL, OR A, and RET instructions.\n`;

fs.writeFileSync('TI-84_Plus_CE/phase407-notification-readers-report.md', report);
console.log('\nReport written to TI-84_Plus_CE/phase407-notification-readers-report.md');
