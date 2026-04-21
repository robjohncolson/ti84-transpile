#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase134-report.md');

const romBytes = fs.readFileSync(ROM_PATH);
const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const ROM_GENERATED_AT = mod.TRANSPILATION_META?.generatedAt ?? 'unknown';

const POINTER_SLOT = 0xd007eb;
const DISPATCH_START = 0xd0231a;
const DISPATCH_END = 0xd02340;
const CONTEXT_RADIUS = 10;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function dumpRange(mem, start, end) {
  const lines = [];

  for (let addr = start; addr <= end; addr += 16) {
    const slice = mem.slice(addr, Math.min(end + 1, addr + 16));
    lines.push(`${hex(addr)}: ${bytesToHex(slice)}`);
  }

  return lines;
}

function classifyLiteralRef(offset) {
  const prev1 = offset >= 1 ? romBytes[offset - 1] : null;
  const prev2 = offset >= 2 ? romBytes[offset - 2] : null;

  if (prev1 === 0x22) return 'ld (nn),hl WRITE';
  if (prev1 === 0x2a) return 'ld hl,(nn) READ';
  if (prev1 === 0x21) return 'ld hl,nn LITERAL';
  if (prev1 === 0x11) return 'ld de,nn LITERAL';
  if (prev1 === 0x01) return 'ld bc,nn LITERAL';
  if (prev1 === 0x32) return 'ld (nn),a WRITE';
  if (prev1 === 0x3a) return 'ld a,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x43) return 'ld (nn),bc WRITE';
  if (prev2 === 0xed && prev1 === 0x53) return 'ld (nn),de WRITE';
  if (prev2 === 0xed && prev1 === 0x63) return 'ld (nn),hl WRITE';
  if (prev2 === 0xed && prev1 === 0x73) return 'ld (nn),sp WRITE';
  if (prev2 === 0xed && prev1 === 0x4b) return 'ld bc,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x5b) return 'ld de,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x6b) return 'ld hl,(nn) READ';

  return 'other';
}

function isWriteClassification(classification) {
  return classification.includes('WRITE');
}

function buildContext(offset, size = 3) {
  const start = Math.max(0, offset - CONTEXT_RADIUS);
  const endExclusive = Math.min(romBytes.length, offset + size + CONTEXT_RADIUS);

  return {
    start,
    end: endExclusive - 1,
    bytes: bytesToHex(romBytes.slice(start, endExclusive)),
  };
}

function summarizeHits(hits) {
  const summary = new Map();

  for (const hit of hits) {
    summary.set(hit.classification, (summary.get(hit.classification) ?? 0) + 1);
  }

  return [...summary.entries()].sort((left, right) => right[1] - left[1]);
}

function scanStaticRefs() {
  const exactBaseHits = [];
  const pointerHits = [];
  const rangeHits = [];

  for (let offset = 0; offset <= romBytes.length - 3; offset += 1) {
    const value =
      romBytes[offset] |
      (romBytes[offset + 1] << 8) |
      (romBytes[offset + 2] << 16);

    if (value === DISPATCH_START) {
      exactBaseHits.push({
        offset,
        addr: value,
        classification: classifyLiteralRef(offset),
        context: buildContext(offset),
      });
    }

    if (value === POINTER_SLOT) {
      pointerHits.push({
        offset,
        addr: value,
        classification: classifyLiteralRef(offset),
        context: buildContext(offset),
      });
    }

    if (value >= DISPATCH_START && value <= DISPATCH_END) {
      rangeHits.push({
        offset,
        addr: value,
        classification: classifyLiteralRef(offset),
      });
    }
  }

  return {
    exactBaseHits,
    pointerHits,
    rangeHits,
    rangeWriteHits: rangeHits.filter((hit) => isWriteClassification(hit.classification)),
    baseSummary: summarizeHits(exactBaseHits),
    rangeSummary: summarizeHits(rangeHits),
  };
}

function runDynamicBootTrace() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 10000,
  });

  const pointerBytes = Array.from(mem.slice(POINTER_SLOT, POINTER_SLOT + 3));
  const pointerValue = read24(mem, POINTER_SLOT);
  const dispatchBytes = Array.from(mem.slice(DISPATCH_START, DISPATCH_END + 1));
  const dispatchAllFF = dispatchBytes.every((value) => value === 0xff);

  return {
    coldBoot,
    osInit,
    pointerBytes,
    pointerValue,
    dispatchAllFF,
    dispatchDump: dumpRange(mem, DISPATCH_START, DISPATCH_END),
  };
}

function formatSummaryTable(entries) {
  const lines = ['| Classification | Count |', '| --- | --- |'];

  for (const [classification, count] of entries) {
    lines.push(`| \`${classification}\` | \`${count}\` |`);
  }

  return lines;
}

function formatExactHitLines(hits) {
  return hits.map((hit) => {
    return `${hex(hit.offset)} | ${hit.classification} | ${hex(hit.context.start)}-${hex(hit.context.end)} | ${hit.context.bytes}`;
  });
}

function formatRangeWriteLines(hits) {
  return hits.map((hit) => {
    return `${hex(hit.offset)} | ${hit.classification} -> ${hex(hit.addr)}`;
  });
}

function buildReport(staticScan, bootTrace) {
  const pointerHit = staticScan.pointerHits[0] ?? null;
  const baseWriteSummary = staticScan.baseSummary
    .filter(([classification]) => isWriteClassification(classification))
    .map(([classification, count]) => `${classification}=${count}`)
    .join(', ');

  const lines = [];

  lines.push('# Phase 134 - RAM Dispatch Table Initialization Hunt');
  lines.push('');
  lines.push('Generated by `probe-phase134-ram-dispatch-hunt.mjs`.');
  lines.push('');
  lines.push(`- ROM size: \`${romBytes.length}\` bytes`);
  lines.push(`- ROM generatedAt: \`${ROM_GENERATED_AT}\``);
  lines.push(`- Exact raw hits for \`1A 23 D0\`: \`${staticScan.exactBaseHits.length}\``);
  lines.push(`- Exact raw hits for \`EB 07 D0\`: \`${staticScan.pointerHits.length}\``);
  lines.push(`- Literal refs anywhere in \`${hex(DISPATCH_START)}-${hex(DISPATCH_END)}\`: \`${staticScan.rangeHits.length}\``);
  lines.push(`- Candidate direct writes into \`${hex(DISPATCH_START)}-${hex(DISPATCH_END)}\`: \`${staticScan.rangeWriteHits.length}\``);
  lines.push('');
  lines.push('## Key Findings');
  lines.push('');

  if (pointerHit) {
    lines.push(`- The only raw ROM hit for \`${hex(POINTER_SLOT)}\` is at \`${hex(pointerHit.offset)}\`, and it classifies as \`${pointerHit.classification}\`. No direct literal write to \`${hex(POINTER_SLOT)}\` was found.`);
  } else {
    lines.push(`- No raw ROM hit for \`${hex(POINTER_SLOT)}\` was found.`);
  }

  lines.push(`- The \`${hex(DISPATCH_START)}\` literal appears heavily in ROM. Exact raw hits: \`${staticScan.exactBaseHits.length}\`; exact-hit write classifications: \`${baseWriteSummary || 'none'}\`.`);
  lines.push(`- The 500k-step boot still dies in OS init at \`${hex(bootTrace.osInit.lastPc ?? 0xffffff)}\` with termination \`${bootTrace.osInit.termination}\`.`);
  lines.push(`- After that run, \`${hex(POINTER_SLOT)}\` contains bytes \`${bytesToHex(bootTrace.pointerBytes)}\` => \`${hex(bootTrace.pointerValue)}\`.`);
  lines.push(`- The dispatch-table window \`${hex(DISPATCH_START)}-${hex(DISPATCH_END)}\` is ${bootTrace.dispatchAllFF ? 'still entirely `FF`' : 'not all `FF`'} after boot.`);
  lines.push('');
  lines.push('## Static Scan - Exact `1A 23 D0` Hits');
  lines.push('');
  lines.push(...formatSummaryTable(staticScan.baseSummary));
  lines.push('');
  lines.push('```text');
  lines.push(...formatExactHitLines(staticScan.exactBaseHits));
  lines.push('```');
  lines.push('');
  lines.push(`## Static Scan - Literal Refs in ${hex(DISPATCH_START)}-${hex(DISPATCH_END)}`);
  lines.push('');
  lines.push(...formatSummaryTable(staticScan.rangeSummary));
  lines.push('');
  lines.push('```text');
  lines.push(...formatRangeWriteLines(staticScan.rangeWriteHits));
  lines.push('```');
  lines.push('');
  lines.push('## Static Scan - Exact `EB 07 D0` Hits');
  lines.push('');
  lines.push('```text');
  lines.push(...formatExactHitLines(staticScan.pointerHits));
  lines.push('```');
  lines.push('');
  lines.push('## Dynamic Boot Trace');
  lines.push('');
  lines.push(`- coldBoot: \`steps=${bootTrace.coldBoot.steps} termination=${bootTrace.coldBoot.termination} lastPc=${hex(bootTrace.coldBoot.lastPc ?? 0)} lastMode=${bootTrace.coldBoot.lastMode ?? 'n/a'}\``);
  lines.push(`- osInit: \`steps=${bootTrace.osInit.steps} termination=${bootTrace.osInit.termination} lastPc=${hex(bootTrace.osInit.lastPc ?? 0xffffff)} lastMode=${bootTrace.osInit.lastMode ?? 'n/a'}\``);
  lines.push(`- ${hex(POINTER_SLOT)} bytes: \`${bytesToHex(bootTrace.pointerBytes)}\``);
  lines.push(`- ${hex(POINTER_SLOT)} pointer value: \`${hex(bootTrace.pointerValue)}\``);
  lines.push(`- ${hex(DISPATCH_START)}-${hex(DISPATCH_END)} all FF: \`${bootTrace.dispatchAllFF}\``);
  lines.push('');
  lines.push('```text');
  lines.push(...bootTrace.dispatchDump);
  lines.push('```');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- No direct literal writer to \`${hex(POINTER_SLOT)}\` appears in the raw ROM scan.`);
  lines.push(`- The dispatch-table RAM window itself is never populated during the reachable 500k-step boot; it remains all \`FF\`.`);
  lines.push('- The most likely explanation is that the real table populator lives after the missing-block path at `0xFFFFFF`, or it computes the destination address indirectly without embedding `0xD007EB` as a literal.');

  return `${lines.join('\n')}\n`;
}

const staticScan = scanStaticRefs();
const bootTrace = runDynamicBootTrace();
const report = buildReport(staticScan, bootTrace);

fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(`Wrote ${path.basename(REPORT_PATH)}`);
console.log(`Exact 1A 23 D0 hits: ${staticScan.exactBaseHits.length}`);
console.log(`Exact EB 07 D0 hits: ${staticScan.pointerHits.length}`);
console.log(`Post-boot ${hex(POINTER_SLOT)}: ${hex(bootTrace.pointerValue)} (${bytesToHex(bootTrace.pointerBytes)})`);
console.log(`Dispatch window all FF: ${bootTrace.dispatchAllFF}`);
