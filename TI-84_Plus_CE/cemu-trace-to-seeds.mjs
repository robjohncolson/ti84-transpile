// cemu-trace-to-seeds.mjs
// Post-process CEmu PC trace log(s) into a seed file compatible with the transpiler.
// Usage: node TI-84_Plus_CE/cemu-trace-to-seeds.mjs

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const traceDir = 'C:/Users/rober/Downloads/Projects/cemu-build';
const outPath = path.join(repoRoot, 'TI-84_Plus_CE', 'cemu-trace-seeds.txt');

const ROM_MIN = 0x000000;
const ROM_MAX = 0x3fffff;

// Load existing seeds from the transpiler's seed files to find novel PCs.
const existingSeedFiles = [
  'phase100c-seeds.txt',
  'phase111-seeds.txt',
  'phase130-seeds.txt',
  'phase152-seeds.txt',
  'phase179-seeds.txt',
];

function loadExistingSeeds() {
  const existing = new Set();
  for (const name of existingSeedFiles) {
    const filePath = path.join(repoRoot, 'TI-84_Plus_CE', name);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const clean = line.replace(/#.*/, '').trim();
      if (!clean) continue;
      const pc = parseInt(clean.replace(/^0x/i, ''), 16);
      if (Number.isFinite(pc)) existing.add(pc);
    }
  }
  return existing;
}

async function processTraceFile(filePath, romPCs) {
  let totalLines = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalLines++;
    const pc = parseInt(trimmed, 16);
    if (!Number.isFinite(pc)) continue;
    if (pc >= ROM_MIN && pc <= ROM_MAX) romPCs.add(pc);
  }
  return totalLines;
}

async function main() {
  // Find trace files — all *-trace.log files in cemu-build/
  const traceFiles = fs.readdirSync(traceDir)
    .filter((f) => /-trace\.log$/i.test(f))
    .map((f) => path.join(traceDir, f))
    .sort();

  if (traceFiles.length === 0) {
    console.error('No trace files found in', traceDir);
    process.exit(1);
  }

  const romPCs = new Set();
  let totalLines = 0;

  for (const filePath of traceFiles) {
    console.log(`Processing: ${filePath}`);
    totalLines += await processTraceFile(filePath, romPCs);
  }

  const existingSeeds = loadExistingSeeds();

  const sortedPCs = [...romPCs].sort((a, b) => a - b);
  const alreadyPresent = sortedPCs.filter((pc) => existingSeeds.has(pc)).length;
  const novelCount = sortedPCs.length - alreadyPresent;

  // Write output — 0x{6-hex-digit lowercase} (match existing seed file format)
  const lines = sortedPCs.map((pc) => `0x${pc.toString(16).padStart(6, '0')}`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

  console.log(`Total PCs read:       ${totalLines.toLocaleString()}`);
  console.log(`Unique ROM PCs:       ${romPCs.size.toLocaleString()}`);
  console.log(`Already in seed files: ${alreadyPresent.toLocaleString()}`);
  console.log(`Novel (new) PCs:      ${novelCount.toLocaleString()}`);
  console.log(`Output written to:    ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
