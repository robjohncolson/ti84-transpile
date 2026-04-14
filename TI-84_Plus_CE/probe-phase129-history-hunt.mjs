#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase129-report.md');

// Key addresses
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;
const VRAM_ROW_STRIDE = 640;
const KEY_EVENT_ADDR = 0xd0058e;
const KEY_CLASSIFIER = 0x08c4a3;
const DISPATCH_ENTRY = 0x085e16;

// History row range
const HIST_ROW_START = 37;
const HIST_ROW_END = 74;
const HIST_VRAM_START = VRAM_START + HIST_ROW_START * VRAM_ROW_STRIDE; // 0xD45C80
const HIST_VRAM_END = VRAM_START + (HIST_ROW_END + 1) * VRAM_ROW_STRIDE; // 0xD4BB80

function hex(v, w = 2) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
}

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return { mem, peripherals, executor, cpu, romBytes };
}

// ─── Part A: ROM scan for history-area VRAM address literals ───

function partA_romScan(romBytes) {
  const results = { vramLiterals: [], rowLiterals: [] };

  // Scan for 24-bit LE literals referencing VRAM addresses in history row range
  // History VRAM range: 0xD45C80 to 0xD4BB80
  const histLo = HIST_VRAM_START;
  const histHi = HIST_VRAM_END;

  for (let i = 0; i < romBytes.length - 2; i++) {
    const val = romBytes[i] | (romBytes[i + 1] << 8) | (romBytes[i + 2] << 16);
    if (val >= histLo && val < histHi) {
      // Check if this looks like it could be part of an instruction (not random data)
      // LD instructions with 24-bit immediate: various opcodes
      // Just record the hit with its ROM offset
      const row = Math.floor((val - VRAM_START) / VRAM_ROW_STRIDE);
      results.vramLiterals.push({
        romOffset: i,
        addr: val,
        row,
      });
      if (results.vramLiterals.length >= 100) break; // cap
    }
  }

  // Scan for row numbers 37-74 used near known cursor/print patterns
  // Look for bytes 0x25 (37) through 0x4A (74) preceded by common LD opcodes
  // LD A, imm8 = 0x3E nn; LD L, imm8 = 0x2E nn; LD (HL), imm8 = 0x36 nn
  const ldOpcodes = [0x3e, 0x06, 0x0e, 0x16, 0x1e, 0x26, 0x2e, 0x36];
  for (let i = 0; i < romBytes.length - 1; i++) {
    if (ldOpcodes.includes(romBytes[i])) {
      const val = romBytes[i + 1];
      if (val >= HIST_ROW_START && val <= HIST_ROW_END) {
        results.rowLiterals.push({
          romOffset: i,
          opcode: romBytes[i],
          value: val,
        });
        if (results.rowLiterals.length >= 200) break;
      }
    }
  }

  return results;
}

// ─── Part B: Known history-related RAM references ───

function partB_ramScan(romBytes) {
  const results = { iyRelative: [], keyEventRefs: [], ansStrings: [] };

  // Scan for references to 0xD02500-0xD02600
  for (let i = 0; i < romBytes.length - 2; i++) {
    const val = romBytes[i] | (romBytes[i + 1] << 8) | (romBytes[i + 2] << 16);
    if (val >= 0xd02500 && val < 0xd02600) {
      results.iyRelative.push({ romOffset: i, addr: val });
      if (results.iyRelative.length >= 50) break;
    }
  }

  // Scan for references to 0xD0058E
  for (let i = 0; i < romBytes.length - 2; i++) {
    const val = romBytes[i] | (romBytes[i + 1] << 8) | (romBytes[i + 2] << 16);
    if (val === 0xd0058e) {
      results.keyEventRefs.push({ romOffset: i });
      if (results.keyEventRefs.length >= 50) break;
    }
  }

  // Scan for ASCII "Ans" (0x41 0x6E 0x73) in ROM
  for (let i = 0; i < romBytes.length - 2; i++) {
    if (romBytes[i] === 0x41 && romBytes[i + 1] === 0x6e && romBytes[i + 2] === 0x73) {
      results.ansStrings.push({ romOffset: i });
      if (results.ansStrings.length >= 30) break;
    }
  }

  return results;
}

// ─── Part C: Dynamic trace of 0x085E16 with VRAM row bucketing ───

function partC_dynamicTrace(env) {
  const rowBuckets = new Map(); // row -> { count, firstValue, lastValue }
  const totalRows = Math.ceil((VRAM_END - VRAM_START) / VRAM_ROW_STRIDE);
  let totalWrites = 0;

  const origWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    const masked = addr & 0xffffff;
    if (masked >= VRAM_START && masked < VRAM_END) {
      totalWrites++;
      const row = Math.floor((masked - VRAM_START) / VRAM_ROW_STRIDE);
      if (!rowBuckets.has(row)) {
        rowBuckets.set(row, { count: 0, firstValue: value & 0xff, lastValue: 0, firstAddr: masked });
      }
      const b = rowBuckets.get(row);
      b.count++;
      b.lastValue = value & 0xff;
    }
    return origWrite8(addr, value);
  };

  let run;
  try {
    run = env.executor.runFrom(DISPATCH_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 500,
    });
  } finally {
    env.cpu.write8 = origWrite8;
  }

  // Focus on history rows
  const historyRows = [];
  for (let r = HIST_ROW_START; r <= HIST_ROW_END; r++) {
    const b = rowBuckets.get(r);
    if (b) {
      historyRows.push({ row: r, ...b });
    }
  }

  // Top written rows overall
  const allRows = [...rowBuckets.entries()]
    .map(([row, data]) => ({ row, ...data }))
    .sort((a, b) => b.count - a.count);

  return {
    totalWrites,
    totalRowsWritten: rowBuckets.size,
    steps: run.steps,
    termination: run.termination,
    historyRows,
    topRows: allRows.slice(0, 30),
  };
}

// ─── Part D: History buffer discovery via write-trace ───

function partD_historyBufferDiscovery(env) {
  const RAM_SCAN_START = 0xd00000;
  const RAM_SCAN_END = 0xd10000;

  // Snapshot RAM before key injection
  const preSnapshot = new Uint8Array(env.mem.slice(RAM_SCAN_START, RAM_SCAN_END));

  // Step 1: inject digit '2' (0x31) and run key classifier
  env.mem[KEY_EVENT_ADDR] = 0x31;
  const digitRun = env.executor.runFrom(KEY_CLASSIFIER, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 500,
  });

  // Snapshot after digit
  const postDigitSnapshot = new Uint8Array(env.mem.slice(RAM_SCAN_START, RAM_SCAN_END));

  // Find new 0x32 ('2') bytes after digit injection
  // Note: 0x31 is the scan code, but the character '2' is ASCII 0x32
  // Actually, let's look for both 0x31 and 0x32 and any other changes
  const digitChanges = [];
  for (let i = 0; i < preSnapshot.length; i++) {
    const addr = RAM_SCAN_START + i;
    if (postDigitSnapshot[i] !== preSnapshot[i]) {
      digitChanges.push({
        addr,
        before: preSnapshot[i],
        after: postDigitSnapshot[i],
      });
    }
  }

  // Step 2: inject ENTER (0x10) and run key classifier
  env.mem[KEY_EVENT_ADDR] = 0x10;
  const enterRun = env.executor.runFrom(KEY_CLASSIFIER, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  // Snapshot after ENTER
  const postEnterSnapshot = new Uint8Array(env.mem.slice(RAM_SCAN_START, RAM_SCAN_END));

  const enterChanges = [];
  for (let i = 0; i < preSnapshot.length; i++) {
    const addr = RAM_SCAN_START + i;
    if (postEnterSnapshot[i] !== preSnapshot[i]) {
      enterChanges.push({
        addr,
        before: preSnapshot[i],
        after: postEnterSnapshot[i],
      });
    }
  }

  // Specifically look for 0x32 ('2') that appeared
  const new0x32_afterDigit = digitChanges.filter(c => c.after === 0x32 && c.before !== 0x32);
  const new0x32_afterEnter = enterChanges.filter(c => c.after === 0x32 && c.before !== 0x32);

  // Also look for 0x31 that appeared (the scan code itself)
  const new0x31_afterDigit = digitChanges.filter(c => c.after === 0x31 && c.before !== 0x31);

  return {
    digitRun: { steps: digitRun.steps, termination: digitRun.termination },
    enterRun: { steps: enterRun.steps, termination: enterRun.termination },
    digitChanges: digitChanges.slice(0, 100),
    enterChanges: enterChanges.slice(0, 100),
    totalDigitChanges: digitChanges.length,
    totalEnterChanges: enterChanges.length,
    new0x32_afterDigit,
    new0x31_afterDigit,
    new0x32_afterEnter,
  };
}

// ─── Report builder ───

function buildReport(partAResults, partBResults, partCResults, partDResults) {
  const lines = [];

  lines.push('# Phase 129 — History Area Rendering Investigation');
  lines.push('');
  lines.push('Generated by `probe-phase129-history-hunt.mjs`.');
  lines.push('');
  lines.push(`ROM transpilation: \`${TRANSPILATION_META?.generatedAt ?? 'n/a'}\``);
  lines.push('');

  // Part A
  lines.push('## Part A — ROM Scan for History-Area VRAM Literals');
  lines.push('');
  lines.push(`Found **${partAResults.vramLiterals.length}** 24-bit LE literals referencing VRAM in history rows (37-74).`);
  lines.push('');
  if (partAResults.vramLiterals.length > 0) {
    lines.push('| ROM Offset | VRAM Address | Row |');
    lines.push('| --- | --- | --- |');
    for (const hit of partAResults.vramLiterals.slice(0, 40)) {
      lines.push(`| ${hex(hit.romOffset, 6)} | ${hex(hit.addr, 6)} | ${hit.row} |`);
    }
    if (partAResults.vramLiterals.length > 40) {
      lines.push(`| ... | (+${partAResults.vramLiterals.length - 40} more) | |`);
    }
  } else {
    lines.push('No direct VRAM address literals found in history row range.');
  }
  lines.push('');

  lines.push(`Found **${partAResults.rowLiterals.length}** LD-imm8 instructions loading values 37-74.`);
  lines.push('');
  if (partAResults.rowLiterals.length > 0) {
    lines.push('| ROM Offset | Opcode | Value (Row) |');
    lines.push('| --- | --- | --- |');
    for (const hit of partAResults.rowLiterals.slice(0, 40)) {
      lines.push(`| ${hex(hit.romOffset, 6)} | ${hex(hit.opcode, 2)} | ${hit.value} |`);
    }
    if (partAResults.rowLiterals.length > 40) {
      lines.push(`| ... | (+${partAResults.rowLiterals.length - 40} more) | |`);
    }
  }
  lines.push('');

  // Part B
  lines.push('## Part B — Known History-Related RAM References');
  lines.push('');
  lines.push(`### IY-relative region (0xD02500-0xD02600): **${partBResults.iyRelative.length}** refs`);
  lines.push('');
  if (partBResults.iyRelative.length > 0) {
    lines.push('| ROM Offset | Target Address |');
    lines.push('| --- | --- |');
    for (const hit of partBResults.iyRelative.slice(0, 30)) {
      lines.push(`| ${hex(hit.romOffset, 6)} | ${hex(hit.addr, 6)} |`);
    }
  }
  lines.push('');

  lines.push(`### Key event addr (0xD0058E) references: **${partBResults.keyEventRefs.length}** refs`);
  lines.push('');
  if (partBResults.keyEventRefs.length > 0) {
    const offsets = partBResults.keyEventRefs.slice(0, 20).map(r => hex(r.romOffset, 6)).join(', ');
    lines.push(`ROM offsets: ${offsets}`);
  }
  lines.push('');

  lines.push(`### "Ans" string occurrences: **${partBResults.ansStrings.length}** found`);
  lines.push('');
  if (partBResults.ansStrings.length > 0) {
    const offsets = partBResults.ansStrings.slice(0, 20).map(r => hex(r.romOffset, 6)).join(', ');
    lines.push(`ROM offsets: ${offsets}`);
  }
  lines.push('');

  // Part C
  lines.push('## Part C — Dynamic Trace of 0x085E16 (VRAM Row Buckets)');
  lines.push('');
  lines.push(`- Steps: \`${partCResults.steps}\``);
  lines.push(`- Termination: \`${partCResults.termination}\``);
  lines.push(`- Total VRAM writes: \`${partCResults.totalWrites}\``);
  lines.push(`- Rows with writes: \`${partCResults.totalRowsWritten}\``);
  lines.push('');

  lines.push('### Top 30 Written Rows (by count)');
  lines.push('');
  lines.push('| Row | Writes | First Value | Last Value | In History Range? |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of partCResults.topRows) {
    const inHist = r.row >= HIST_ROW_START && r.row <= HIST_ROW_END ? 'YES' : 'no';
    lines.push(`| ${r.row} | ${r.count} | ${hex(r.firstValue)} | ${hex(r.lastValue)} | ${inHist} |`);
  }
  lines.push('');

  lines.push('### History Rows (37-74) Detail');
  lines.push('');
  if (partCResults.historyRows.length === 0) {
    lines.push('**No writes to history rows 37-74 during dispatch.**');
  } else {
    lines.push(`**${partCResults.historyRows.length}** history rows received writes.`);
    lines.push('');
    lines.push('| Row | Writes | First Value | Last Value |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of partCResults.historyRows) {
      lines.push(`| ${r.row} | ${r.count} | ${hex(r.firstValue)} | ${hex(r.lastValue)} |`);
    }
  }
  lines.push('');

  // Part D
  lines.push('## Part D — History Buffer Discovery (Key Injection Trace)');
  lines.push('');
  lines.push(`### Digit "2" injection (scancode 0x31 -> 0x08C4A3, 5k steps)`);
  lines.push(`- Steps: \`${partDResults.digitRun.steps}\``);
  lines.push(`- Termination: \`${partDResults.digitRun.termination}\``);
  lines.push(`- Total RAM changes (0xD00000-0xD10000): \`${partDResults.totalDigitChanges}\``);
  lines.push(`- New 0x32 ('2') bytes: \`${partDResults.new0x32_afterDigit.length}\``);
  lines.push(`- New 0x31 bytes: \`${partDResults.new0x31_afterDigit.length}\``);
  lines.push('');

  if (partDResults.new0x32_afterDigit.length > 0) {
    lines.push('Addresses with new 0x32:');
    lines.push('');
    for (const c of partDResults.new0x32_afterDigit.slice(0, 20)) {
      lines.push(`- ${hex(c.addr, 6)} (was ${hex(c.before)})`);
    }
    lines.push('');
  }

  if (partDResults.new0x31_afterDigit.length > 0) {
    lines.push('Addresses with new 0x31:');
    lines.push('');
    for (const c of partDResults.new0x31_afterDigit.slice(0, 20)) {
      lines.push(`- ${hex(c.addr, 6)} (was ${hex(c.before)})`);
    }
    lines.push('');
  }

  if (partDResults.digitChanges.length > 0) {
    lines.push('First 50 RAM changes after digit injection:');
    lines.push('');
    lines.push('| Address | Before | After |');
    lines.push('| --- | --- | --- |');
    for (const c of partDResults.digitChanges.slice(0, 50)) {
      lines.push(`| ${hex(c.addr, 6)} | ${hex(c.before)} | ${hex(c.after)} |`);
    }
    lines.push('');
  }

  lines.push(`### ENTER injection (scancode 0x10 -> 0x08C4A3, 50k steps)`);
  lines.push(`- Steps: \`${partDResults.enterRun.steps}\``);
  lines.push(`- Termination: \`${partDResults.enterRun.termination}\``);
  lines.push(`- Total RAM changes (0xD00000-0xD10000): \`${partDResults.totalEnterChanges}\``);
  lines.push(`- New 0x32 ('2') bytes after ENTER: \`${partDResults.new0x32_afterEnter.length}\``);
  lines.push('');

  if (partDResults.new0x32_afterEnter.length > 0) {
    lines.push('Addresses with new 0x32 after ENTER:');
    lines.push('');
    for (const c of partDResults.new0x32_afterEnter.slice(0, 20)) {
      lines.push(`- ${hex(c.addr, 6)} (was ${hex(c.before)})`);
    }
    lines.push('');
  }

  if (partDResults.enterChanges.length > 0) {
    lines.push('First 50 RAM changes after ENTER injection:');
    lines.push('');
    lines.push('| Address | Before | After |');
    lines.push('| --- | --- | --- |');
    for (const c of partDResults.enterChanges.slice(0, 50)) {
      lines.push(`| ${hex(c.addr, 6)} | ${hex(c.before)} | ${hex(c.after)} |`);
    }
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('Key findings:');
  lines.push('');

  const histWritten = partCResults.historyRows.length > 0;
  lines.push(`1. History rows (37-74) ${histWritten ? 'ARE' : 'are NOT'} written during 0x085E16 dispatch`);

  if (partAResults.vramLiterals.length > 0) {
    lines.push(`2. Found ${partAResults.vramLiterals.length} ROM references to history-area VRAM addresses`);
  } else {
    lines.push('2. No direct VRAM address literals for history rows found in ROM (computed dynamically?)');
  }

  lines.push(`3. "Ans" string found ${partBResults.ansStrings.length} times in ROM`);
  lines.push(`4. After digit "2" injection: ${partDResults.totalDigitChanges} RAM bytes changed, ${partDResults.new0x32_afterDigit.length} new 0x32 bytes, ${partDResults.new0x31_afterDigit.length} new 0x31 bytes`);
  lines.push(`5. After ENTER injection: ${partDResults.totalEnterChanges} RAM bytes changed, ${partDResults.new0x32_afterEnter.length} new 0x32 bytes`);
  lines.push('');

  return lines.join('\n');
}

// ─── Main ───

function main() {
  console.log('Phase 129 — History Area Rendering Investigation');
  console.log('================================================\n');

  console.log('Booting environment...');
  const env = bootEnvironment();
  console.log('Boot complete.\n');

  console.log('Part A: ROM scan for history-area VRAM literals...');
  const partA = partA_romScan(env.mem.slice(0, 0x400000)); // ROM is in first 4MB
  console.log(`  VRAM literals: ${partA.vramLiterals.length}`);
  console.log(`  Row literals (LD imm8): ${partA.rowLiterals.length}\n`);

  console.log('Part B: Known history-related RAM references...');
  const partB = partB_ramScan(env.mem.slice(0, 0x400000));
  console.log(`  IY-relative refs: ${partB.iyRelative.length}`);
  console.log(`  Key event refs: ${partB.keyEventRefs.length}`);
  console.log(`  "Ans" strings: ${partB.ansStrings.length}\n`);

  console.log('Part C: Dynamic trace of 0x085E16...');
  const partC = partC_dynamicTrace(env);
  console.log(`  Total VRAM writes: ${partC.totalWrites}`);
  console.log(`  Rows with writes: ${partC.totalRowsWritten}`);
  console.log(`  History rows written: ${partC.historyRows.length}`);
  if (partC.topRows.length > 0) {
    console.log(`  Top written row: ${partC.topRows[0].row} (${partC.topRows[0].count} writes)`);
  }
  console.log();

  // Re-boot for Part D (clean state needed)
  console.log('Re-booting for Part D...');
  const env2 = bootEnvironment();

  console.log('Part D: History buffer discovery via key injection...');
  const partD = partD_historyBufferDiscovery(env2);
  console.log(`  Digit run: steps=${partD.digitRun.steps}, termination=${partD.digitRun.termination}`);
  console.log(`  Enter run: steps=${partD.enterRun.steps}, termination=${partD.enterRun.termination}`);
  console.log(`  RAM changes after digit: ${partD.totalDigitChanges}`);
  console.log(`  RAM changes after ENTER: ${partD.totalEnterChanges}`);
  console.log(`  New 0x32 after digit: ${partD.new0x32_afterDigit.length}`);
  console.log(`  New 0x31 after digit: ${partD.new0x31_afterDigit.length}`);
  console.log(`  New 0x32 after ENTER: ${partD.new0x32_afterEnter.length}`);
  console.log();

  const report = buildReport(partA, partB, partC, partD);
  console.log(report);

  fs.writeFileSync(REPORT_PATH, report + '\n', 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  const msg = error.stack || String(error);
  console.error('FATAL:', msg);
  const failReport = [
    '# Phase 129 — History Area Rendering Investigation',
    '',
    '## Failure',
    '',
    '```text',
    msg,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, failReport, 'utf8');
  process.exitCode = 1;
}
