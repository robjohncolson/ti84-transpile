#!/usr/bin/env node
// Phase 77 unified static analysis (CC manual after Codex subagent timeouts).
// Combines P2 (JT slot scan), P3 (0x028f02 disasm + caller hunt), and P1 (walker
// candidate scan of PRELIFTED_BLOCKS). Produces phase77-manual-report.md.
//
// Block API (discovered via probe-phase77-diag.mjs):
// - block.startPc (number), block.mode ('adl' | 'z80'), block.instructionCount
// - block.instructions[] = { pc, mode, bytes, dasm, tag, length, target?, targetMode?, fallthrough? }
// - block.exits[] = { type: 'call' | 'call-return' | 'branch' | 'fallthrough', target, targetMode }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase77-manual-report.md');

const romBytes = fs.readFileSync(romPath);
const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');
const out = [];
const log = (s) => out.push(s);

log('# Phase 77 Manual Static Analysis (CC after Codex timeouts)\n');
log('All three investigation-heavy Codex dispatches (P1/P2/P3) timed out. CC pivoted to');
log('a unified Node static-analysis script. P4 (simple probe) succeeded as a null result.\n');

// Load PRELIFTED_BLOCKS first — everything else reuses it
const loadStart = Date.now();
const mod = await import(pathToFileURL(transpiledPath).href);
const blocksRaw = mod.PRELIFTED_BLOCKS;
const blocks = Array.isArray(blocksRaw) ? blocksRaw : Object.values(blocksRaw);
const loadMs = Date.now() - loadStart;
console.log(`Loaded ${blocks.length} blocks in ${loadMs}ms`);

const byPc = new Map();
for (const b of blocks) {
  if (b && typeof b.startPc === 'number') {
    const key = `${b.startPc}_${b.mode}`;
    byPc.set(key, b);
    if (!byPc.has(String(b.startPc))) byPc.set(String(b.startPc), b);
  }
}
const sortedPcs = Array.from(new Set(blocks.map((b) => b.startPc))).sort((a, b) => a - b);

function getBlockByPc(pc, preferredMode) {
  return (preferredMode && byPc.get(`${pc}_${preferredMode}`)) || byPc.get(String(pc));
}

function dasmBlock(pc, mode = 'adl', limit = 40) {
  const lines = [];
  let curPc = pc;
  let steps = 0;
  while (steps < limit) {
    const b = getBlockByPc(curPc, mode);
    if (!b) {
      lines.push(`  ${hex(curPc)}  <not in PRELIFTED_BLOCKS>`);
      break;
    }
    for (const inst of b.instructions || []) {
      lines.push(`  ${hex(inst.pc)}  ${(inst.dasm || '').padEnd(30)}`);
    }
    steps += 1;
    // Follow fallthrough if present, else stop
    const ft = (b.exits || []).find((e) => e.type === 'fallthrough' || e.type === 'call-return');
    if (!ft) break;
    // Don't auto-follow call-return across function boundary — only fallthrough
    if ((b.exits || []).some((e) => e.type === 'branch' || e.type === 'unconditional')) break;
    if (ft.type !== 'fallthrough') break;
    curPc = ft.target;
  }
  return lines;
}

// ============================================================
// Section 1: P3 Section A — Disasm of 0x028f02
// ============================================================
log('## Section 1 — Disasm of 0x028f02 (TEST mode label helper)\n');
log('Following fallthrough chain from function entry.\n');
log('```');
for (const line of dasmBlock(0x028f02, 'adl', 60)) log(line);
log('```\n');

// Also dump 0x028f02's immediate block exits
const block028f02 = getBlockByPc(0x028f02, 'adl');
if (block028f02) {
  log(`Block 0x028f02 (mode=${block028f02.mode}) exits:`);
  for (const e of block028f02.exits || []) {
    log(`- ${e.type} → ${hex(e.target || 0)} (${e.targetMode})`);
  }
  log('');
}

// ============================================================
// Section 2: P3 Section B — caller scan for 0x028f02
// ============================================================
log('## Section 2 — Callers of 0x028f02\n');

const callers028f02 = [];
for (const b of blocks) {
  for (const exit of b.exits || []) {
    if (exit.type === 'call' && exit.target === 0x028f02) {
      callers028f02.push({ block: b, exit });
      break;
    }
  }
}
log(`Found ${callers028f02.length} blocks with \`call 0x028f02\`.\n`);

log('### Caller dasm (block entry + instructions)\n');
for (const { block: b } of callers028f02.slice(0, 12)) {
  log(`\n**Caller block ${hex(b.startPc)} (mode=${b.mode})**:`);
  log('```');
  for (const inst of b.instructions || []) {
    log(`  ${hex(inst.pc)}  ${inst.dasm || ''}`);
  }
  log('```');
}

// For each caller, also find its immediate predecessor (block that falls through / jumps to it)
// to show the A/HL setup leading into the call
log('\n### Predecessors of caller blocks (A/HL setup)\n');
function findPredecessors(targetPc) {
  const preds = [];
  for (const b of blocks) {
    for (const exit of b.exits || []) {
      if (exit.target === targetPc && (exit.type === 'fallthrough' || exit.type === 'branch')) {
        preds.push(b);
        break;
      }
    }
  }
  return preds;
}
for (const { block: b } of callers028f02.slice(0, 8)) {
  const preds = findPredecessors(b.startPc);
  if (preds.length === 0) continue;
  log(`\n**Predecessors of ${hex(b.startPc)}**:`);
  for (const pred of preds.slice(0, 3)) {
    log('```');
    for (const inst of pred.instructions || []) {
      log(`  ${hex(inst.pc)}  ${inst.dasm || ''}`);
    }
    log('```');
  }
}

// ============================================================
// Section 3: P2 — JT slot scan
// ============================================================
log('\n## Section 3 — JT slot scan (BCALL targets)\n');

const JT_BASE = 0x020104;
const JT_COUNT = 980;
const slotEntries = [];
for (let i = 0; i < JT_COUNT; i += 1) {
  const off = JT_BASE + i * 3;
  const target = romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
  slotEntries.push({ slot: i, target, slotOffset: i * 3 });
}

const tokenSlots = slotEntries.filter((s) => s.target >= 0x0a0300 && s.target <= 0x0a0600);
const printSlots = slotEntries.filter((s) => s.target >= 0x005000 && s.target <= 0x006500);
const modeRegionSlots = slotEntries.filter((s) => s.target >= 0x0a2000 && s.target <= 0x0a7000);

log(`- Slots targeting 0x0a0300-0x0a0600 (token-table region): **${tokenSlots.length}**`);
log(`- Slots targeting 0x005000-0x006500 (char-print region): **${printSlots.length}**`);
log(`- Slots targeting 0x0a2000-0x0a7000 (near token table): **${modeRegionSlots.length}**\n`);

log('### Mode-region slots (all 16)\n');
log('| slot | slotOffset | target | block@target? |');
log('|------|------------|--------|---------------|');
for (const s of modeRegionSlots) {
  const b = getBlockByPc(s.target, 'adl');
  log(`| ${s.slot} | ${hex(s.slotOffset, 4)} | ${hex(s.target)} | ${b ? 'yes' : 'no'} |`);
}
log('');

// Dasm preview for each slot target (first 10 insts)
log('### Mode-region slot target dasm (first 10 insts each)\n');
for (const s of modeRegionSlots) {
  log(`\n**Slot ${s.slot} → ${hex(s.target)}**`);
  log('```');
  const b = getBlockByPc(s.target, 'adl');
  if (!b) {
    log(`  <no block>`);
    log('```');
    continue;
  }
  const lines = [];
  let curPc = s.target;
  let steps = 0;
  while (steps < 15 && lines.length < 12) {
    const blk = getBlockByPc(curPc, 'adl');
    if (!blk) {
      lines.push(`  ${hex(curPc)}  <missing block>`);
      break;
    }
    for (const inst of blk.instructions || []) {
      if (lines.length >= 12) break;
      lines.push(`  ${hex(inst.pc)}  ${inst.dasm || ''}`);
    }
    steps += 1;
    const ft = (blk.exits || []).find((e) => e.type === 'fallthrough');
    if (!ft) break;
    curPc = ft.target;
  }
  for (const line of lines) log(line);
  log('```');
}

// ============================================================
// Section 4: P1 — Walker candidate scan using block.exits
// ============================================================
log('\n## Section 4 — Walker candidate scan\n');

// Find all blocks whose exits include a CALL to 0x0059c6
const printCallers = [];
for (const b of blocks) {
  for (const exit of b.exits || []) {
    if (exit.type === 'call' && exit.target === 0x0059c6) {
      printCallers.push(b);
      break;
    }
  }
}
log(`Total blocks with \`call 0x0059c6\`: **${printCallers.length}**\n`);

// Also find blocks calling 0x0a1cac (the string-render primitive from Phase 63)
const stringCallers = [];
for (const b of blocks) {
  for (const exit of b.exits || []) {
    if (exit.type === 'call' && exit.target === 0x0a1cac) {
      stringCallers.push(b);
      break;
    }
  }
}
log(`Total blocks with \`call 0x0a1cac\`: **${stringCallers.length}**\n`);

// Cluster print-callers by function (approximate: within ±256 bytes)
const printCallerSet = new Set(printCallers.map((b) => b.startPc));
const clusters = [];
const assigned = new Set();
const sortedPrintPcs = Array.from(printCallerSet).sort((a, b) => a - b);
for (const pc of sortedPrintPcs) {
  if (assigned.has(pc)) continue;
  const cluster = [pc];
  assigned.add(pc);
  for (const other of sortedPrintPcs) {
    if (assigned.has(other)) continue;
    if (other > pc && other - pc < 256) {
      cluster.push(other);
      assigned.add(other);
    }
  }
  clusters.push(cluster);
}
const multiClusters = clusters.filter((c) => c.length >= 2);
log(`Found ${clusters.length} clusters total, ${multiClusters.length} with 2+ print-call blocks.\n`);

// For each multi-cluster, dump all its blocks' dasm
log('### Multi-call clusters (2+ print calls within 256 bytes)\n');
const rankedMulti = multiClusters.sort((a, b) => b.length - a.length);
log(`Top ${Math.min(rankedMulti.length, 20)} multi-print clusters (by print-call count):\n`);
log('| funcEntry | call count | span |');
log('|-----------|-----------:|------|');
for (const cluster of rankedMulti.slice(0, 20)) {
  const span = cluster[cluster.length - 1] - cluster[0];
  log(`| ${hex(cluster[0])} | ${cluster.length} | ${span} bytes |`);
}
log('');

log('### Dasm of top 8 multi-print clusters\n');
for (const cluster of rankedMulti.slice(0, 8)) {
  log(`\n#### Cluster at ${hex(cluster[0])} (${cluster.length} print calls)\n`);
  log('```');
  // Dump all blocks in [cluster[0] - 32, cluster[last] + 32] range
  const lo = cluster[0] - 32;
  const hi = cluster[cluster.length - 1] + 32;
  const inRange = blocks
    .filter((b) => b.startPc >= lo && b.startPc <= hi)
    .sort((a, b) => a.startPc - b.startPc);
  for (const b of inRange.slice(0, 24)) {
    for (const inst of b.instructions || []) {
      log(`  ${hex(inst.pc)}  ${(inst.dasm || '').padEnd(32)}`);
    }
  }
  log('```');
}

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);
