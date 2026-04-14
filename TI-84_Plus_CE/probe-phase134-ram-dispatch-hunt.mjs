#!/usr/bin/env node

/**
 * Phase 134 — RAM Dispatch Table Initialization Hunt
 *
 * Part 1: Static ROM scan for byte patterns 1A 23 D0 (LE for 0xD0231A)
 *         and EB 07 D0 (LE for 0xD007EB) in the 4MB ROM.
 * Part 2: Dynamic 500k-step boot, then dump RAM at 0xD007EB and 0xD0231A-0xD02340.
 * Part 3: Write findings to phase134-report.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase134-report.md');

const STACK_TOP = 0xd1a87e;

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(b) {
  return (b >>> 0).toString(16).padStart(2, '0');
}

function hexDump(buf, start, length) {
  const lines = [];
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const bytes = [];
    const ascii = [];
    for (let j = 0; j < 16 && (i + j) < length; j++) {
      const b = buf[start + i + j];
      bytes.push(hexByte(b));
      ascii.push(b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.');
    }
    lines.push(`${hex(addr)}:  ${bytes.join(' ').padEnd(48)}  ${ascii.join('')}`);
  }
  return lines;
}

function contextHexDump(buf, offset, contextBytes) {
  const lo = Math.max(0, offset - contextBytes);
  const hi = Math.min(buf.length, offset + 3 + contextBytes);
  const bytes = [];
  for (let i = lo; i < hi; i++) {
    const mark = (i >= offset && i < offset + 3) ? `[${hexByte(buf[i])}]` : ` ${hexByte(buf[i])} `;
    bytes.push(mark);
  }
  return `${hex(lo)}: ${bytes.join('')}`;
}

// ── Part 1: Static ROM scan ─────────────────────────────────────────

function staticScan(romBytes) {
  console.log('\n=== Part 1: Static ROM scan ===\n');

  const patterns = [
    { name: '0xD0231A (1A 23 D0)', bytes: [0x1a, 0x23, 0xd0] },
    { name: '0xD007EB (EB 07 D0)', bytes: [0xeb, 0x07, 0xd0] },
  ];

  const results = {};

  for (const pat of patterns) {
    console.log(`Scanning for ${pat.name} ...`);
    const hits = [];
    for (let i = 0; i <= romBytes.length - 3; i++) {
      if (romBytes[i] === pat.bytes[0] &&
          romBytes[i + 1] === pat.bytes[1] &&
          romBytes[i + 2] === pat.bytes[2]) {
        hits.push(i);
      }
    }
    console.log(`  Found ${hits.length} hit(s)`);
    for (const off of hits) {
      console.log(`  @ ${hex(off)}`);
      console.log(`    ${contextHexDump(romBytes, off, 16)}`);
    }
    results[pat.name] = hits.map(off => ({
      offset: off,
      hex: hex(off),
      context: contextHexDump(romBytes, off, 16),
    }));
  }

  return results;
}

// ── Part 2: Dynamic boot trace ──────────────────────────────────────

function dynamicBoot(romBytes) {
  console.log('\n=== Part 2: Dynamic boot trace (500k steps) ===\n');

  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const coldBoot = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  cold boot: steps=${coldBoot.steps}, term=${coldBoot.termination}`);

  // Prepare for OS init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  // Fill 3 bytes at sp with 0xFF (return sentinel)
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;

  // OS init — 500k steps
  const osInit = executor.runFrom(0x08c331, 'adl', { maxSteps: 500000, maxLoopIterations: 10000 });
  console.log(`  OS init: steps=${osInit.steps}, term=${osInit.termination}`);
  console.log(`  Final PC: ${hex(cpu.pc ?? cpu._pc ?? 0)}`);

  // Check 0xD007EB (3-byte LE pointer)
  const ptr0 = mem[0xd007eb];
  const ptr1 = mem[0xd007ec];
  const ptr2 = mem[0xd007ed];
  const ptrValue = ptr0 | (ptr1 << 8) | (ptr2 << 16);
  console.log(`\n  0xD007EB pointer: ${hexByte(ptr0)} ${hexByte(ptr1)} ${hexByte(ptr2)} => ${hex(ptrValue)}`);

  // Dump 0xD0231A - 0xD02340
  const dispatchStart = 0xd0231a;
  const dispatchEnd = 0xd02340;
  const dispatchLen = dispatchEnd - dispatchStart;
  console.log(`\n  RAM dump ${hex(dispatchStart)}-${hex(dispatchEnd)}:`);
  const dumpLines = hexDump(mem, dispatchStart, dispatchLen);
  dumpLines.forEach(l => console.log(`    ${l}`));

  // Check if all 0xFF
  let allFF = true;
  let nonFFCount = 0;
  for (let i = dispatchStart; i < dispatchEnd; i++) {
    if (mem[i] !== 0xff) {
      allFF = false;
      nonFFCount++;
    }
  }
  console.log(`\n  All 0xFF? ${allFF}  (non-FF bytes: ${nonFFCount}/${dispatchLen})`);

  // Also check a wider range around D007EB
  console.log(`\n  RAM dump around 0xD007E0-0xD00810:`);
  const widerDump = hexDump(mem, 0xd007e0, 0x30);
  widerDump.forEach(l => console.log(`    ${l}`));

  return {
    coldBootSteps: coldBoot.steps,
    coldBootTerm: coldBoot.termination,
    osInitSteps: osInit.steps,
    osInitTerm: osInit.termination,
    ptrBytes: `${hexByte(ptr0)} ${hexByte(ptr1)} ${hexByte(ptr2)}`,
    ptrValue: hex(ptrValue),
    dispatchDump: dumpLines,
    allFF,
    nonFFCount,
    dispatchLen,
    widerDump,
  };
}

// ── Part 3: Write report ────────────────────────────────────────────

function writeReport(staticResults, dynamicResults) {
  const lines = [];
  lines.push('# Phase 134 — RAM Dispatch Table Initialization Hunt');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Part 1
  lines.push('## Part 1: Static ROM Scan');
  lines.push('');
  for (const [name, hits] of Object.entries(staticResults)) {
    lines.push(`### Pattern: ${name}`);
    lines.push('');
    if (hits.length === 0) {
      lines.push('No matches found in ROM.');
    } else {
      lines.push(`Found **${hits.length}** match(es):`);
      lines.push('');
      lines.push('| # | Offset | Context |');
      lines.push('|---|--------|---------|');
      hits.forEach((h, i) => {
        lines.push(`| ${i + 1} | \`${h.hex}\` | \`${h.context}\` |`);
      });
    }
    lines.push('');
  }

  // Part 2
  lines.push('## Part 2: Dynamic Boot Trace (500k steps)');
  lines.push('');
  lines.push(`- Cold boot: ${dynamicResults.coldBootSteps} steps, terminated: ${dynamicResults.coldBootTerm}`);
  lines.push(`- OS init: ${dynamicResults.osInitSteps} steps, terminated: ${dynamicResults.osInitTerm}`);
  lines.push('');
  lines.push(`### Pointer at 0xD007EB`);
  lines.push('');
  lines.push(`Bytes: \`${dynamicResults.ptrBytes}\`  =>  **${dynamicResults.ptrValue}**`);
  lines.push('');
  lines.push(`### Dispatch table at 0xD0231A-0xD02340`);
  lines.push('');
  lines.push(`All 0xFF (uninitialized)? **${dynamicResults.allFF}**`);
  lines.push(`Non-FF bytes: ${dynamicResults.nonFFCount} / ${dynamicResults.dispatchLen}`);
  lines.push('');
  lines.push('```');
  dynamicResults.dispatchDump.forEach(l => lines.push(l));
  lines.push('```');
  lines.push('');

  // Interpretation
  lines.push('## Interpretation');
  lines.push('');
  if (dynamicResults.allFF) {
    lines.push('The dispatch table at 0xD0231A-0xD02340 is **still all 0xFF** after 500k boot steps.');
    lines.push('The populator routine runs later in boot than our emulation reaches,');
    lines.push('or is triggered by a hardware event (interrupt, timer) we do not emulate.');
  } else {
    lines.push('The dispatch table has been **partially or fully populated** during 500k boot steps.');
    lines.push('The non-FF entries below may reveal the dispatch populator\'s work:');
  }
  lines.push('');

  const report = lines.join('\n');
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// ── Main ────────────────────────────────────────────────────────────

console.log('Phase 134 — RAM Dispatch Table Initialization Hunt');

const romBytes = decodeEmbeddedRom();
console.log(`ROM size: ${romBytes.length} bytes`);

const staticResults = staticScan(romBytes);
const dynamicResults = dynamicBoot(romBytes);
writeReport(staticResults, dynamicResults);

console.log('\nDone.');
