#!/usr/bin/env node

/**
 * Phase 145 — Analyze dispatch table node structure
 *
 * After boot + OS init, dumps the dispatch table region (0xD02200-0xD02400),
 * reads head/tail pointers at 0xD0231A/0xD0231D, and attempts to walk the
 * linked list. Also records all writes to 0xD02300-0xD02400 during boot.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase145-report.md');

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08c331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 1000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const STACK_RESET_TOP = 0xd1a87e;
const STACK_SEED_BYTES = 3;

// Dispatch table region of interest
const DISPATCH_REGION_START = 0xd02300;
const DISPATCH_REGION_END = 0xd02400;
const EXTENDED_REGION_START = 0xd02200;

// Head/tail pointers
const HEAD_PTR_ADDR = 0xd0231a;
const TAIL_PTR_ADDR = 0xd0231d;

// Also dump the base/start pointer
const BASE_PTR_ADDR = 0xd02317;

// ── Helpers ──

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).padStart(2, '0');
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function readBytes(mem, addr, length) {
  const start = addr & 0xffffff;
  return Array.from(mem.slice(start, start + length));
}

function formatHexLine(mem, addr, len = 16) {
  const bytes = readBytes(mem, addr, len);
  const hexPart = bytes.map((b) => hexByte(b)).join(' ');
  const asciiPart = bytes
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
    .join('');
  return `${hex(addr)}: ${hexPart}  ${asciiPart}`;
}

function formatHexDump(mem, start, end) {
  const lines = [];
  for (let addr = start; addr < end; addr += 16) {
    lines.push(formatHexLine(mem, addr, 16));
  }
  return lines;
}

// ── Write tracker for dispatch region ──

function installDispatchWriteTracker(cpu) {
  const writes = [];
  const state = { currentPc: 0, currentStep: 0 };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(addr, size, value) {
    const start = addr & 0xffffff;
    for (let i = 0; i < size; i++) {
      const byteAddr = (start + i) & 0xffffff;
      if (byteAddr >= EXTENDED_REGION_START && byteAddr < DISPATCH_REGION_END) {
        writes.push({
          step: state.currentStep,
          pc: state.currentPc,
          addr: byteAddr,
          value: (value >> (i * 8)) & 0xff,
        });
      }
    }
  }

  cpu.write8 = (addr, value) => {
    record(addr, 1, value & 0xff);
    return originalWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    record(addr, 2, value & 0xffff);
    return originalWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    record(addr, 3, value & 0xffffff);
    return originalWrite24(addr, value);
  };

  return {
    writes,
    onBlock(pc, steps) {
      state.currentPc = pc & 0xffffff;
      state.currentStep = steps + 1;
    },
    uninstall() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

// ── Machine setup ──

const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const ROM_GENERATED_AT = mod.TRANSPILATION_META?.generatedAt ?? 'unknown';
const romBytes = fs.readFileSync(ROM_PATH);

function createMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return { mem, peripherals, executor, cpu: executor.cpu };
}

function resetForOsInit(machine) {
  const { cpu, mem } = machine;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - STACK_SEED_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + STACK_SEED_BYTES);
}

// ── Linked list walker ──

function walkLinkedList(mem, headAddr, tailAddr) {
  const head = read24(mem, headAddr);
  const tail = read24(mem, tailAddr);
  const results = [];

  console.log(`\nHead pointer at ${hex(headAddr)}: ${hex(head)}`);
  console.log(`Tail pointer at ${hex(tailAddr)}: ${hex(tail)}`);

  if (head === 0 || head === 0xffffff || head < 0xd00000 || head > 0xd10000) {
    console.log('Head pointer looks invalid, skipping walk');
    return { head, tail, nodes: results };
  }

  // Try different node sizes and look for pointer chains
  const nodeSizes = [3, 6, 8, 9, 10, 12, 17];
  console.log('\n--- Attempting linked list walk with various node sizes ---');

  for (const nodeSize of nodeSizes) {
    console.log(`\n  Node size = ${nodeSize}:`);
    let current = head;
    const visited = new Set();
    const nodes = [];
    let steps = 0;

    while (steps < 30 && current >= 0xd02200 && current < 0xd02500) {
      if (visited.has(current)) {
        console.log(`    Cycle detected at ${hex(current)}`);
        break;
      }
      visited.add(current);

      const nodeBytes = readBytes(mem, current, Math.min(nodeSize + 6, 24));
      const bytesStr = nodeBytes.map((b) => hexByte(b)).join(' ');
      console.log(`    Node @ ${hex(current)}: ${bytesStr}`);

      // Look for valid next pointers at various offsets within the node
      let foundNext = false;
      for (let off = 0; off <= nodeSize - 3; off += 1) {
        const candidate = nodeBytes[off] | (nodeBytes[off + 1] << 8) | (nodeBytes[off + 2] << 16);
        if (
          candidate >= EXTENDED_REGION_START &&
          candidate < DISPATCH_REGION_END &&
          candidate !== current
        ) {
          if (!foundNext) {
            console.log(`      Possible next ptr at offset +${off}: ${hex(candidate)}`);
          }
          foundNext = true;
        }
      }

      nodes.push({ addr: current, bytes: nodeBytes });

      // Try next = current + nodeSize
      const nextByStride = current + nodeSize;
      if (nextByStride <= tail && nextByStride < DISPATCH_REGION_END) {
        current = nextByStride;
      } else {
        break;
      }

      steps++;
    }

    if (nodes.length > 0) {
      results.push({ nodeSize, count: nodes.length, nodes });
    }
  }

  return { head, tail, nodes: results };
}

// ── Analyze pointer-based structure ──

function analyzePointerStructure(mem, head, tail) {
  const lines = [];

  // The Phase 138 analysis suggests 0xD02317=base, 0xD0231A=current, 0xD0231D=end
  // and LD B,0x12 means 18 entries. Let's compute entry size from head..tail range.
  const base = read24(mem, BASE_PTR_ADDR);
  lines.push(`Base pointer (0xD02317): ${hex(base)}`);
  lines.push(`Current/Head pointer (0xD0231A): ${hex(head)}`);
  lines.push(`End/Tail pointer (0xD0231D): ${hex(tail)}`);

  if (
    base >= EXTENDED_REGION_START &&
    base < DISPATCH_REGION_END &&
    tail >= EXTENDED_REGION_START &&
    tail < DISPATCH_REGION_END &&
    tail > base
  ) {
    const totalSize = tail - base + 1;
    lines.push(`Total region size (base to tail inclusive): ${totalSize} bytes`);
    lines.push(`Possible entry sizes for 18 (0x12) entries: ${totalSize} / 18 = ${(totalSize / 18).toFixed(2)}`);

    // Also try: total / 17 if tail is the start of the last entry
    for (const numEntries of [17, 18, 19]) {
      const entrySize = totalSize / numEntries;
      if (Number.isInteger(entrySize)) {
        lines.push(`  ${numEntries} entries x ${entrySize} bytes = ${totalSize} (exact fit)`);
      }
    }
  }

  return lines;
}

// ── Main probe ──

function runProbe() {
  console.log('=== Phase 145: Dispatch Table Node Structure ===\n');

  const machine = createMachine();

  // Cold boot
  console.log('Running cold boot...');
  const coldBoot = machine.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  console.log(`Cold boot: steps=${coldBoot.steps} termination=${coldBoot.termination}`);

  // Reset for OS init
  resetForOsInit(machine);

  // Install write tracker
  const tracker = installDispatchWriteTracker(machine.cpu);

  // OS init
  console.log('\nRunning OS init...');
  const result = machine.executor.runFrom(OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, steps) {
      tracker.onBlock(pc, steps);
    },
  });
  console.log(`OS init: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`);

  tracker.uninstall();

  const { mem } = machine;

  // Read head/tail pointers
  const head = read24(mem, HEAD_PTR_ADDR);
  const tail = read24(mem, TAIL_PTR_ADDR);
  const base = read24(mem, BASE_PTR_ADDR);

  console.log(`\nBase (0xD02317): ${hex(base)}`);
  console.log(`Head (0xD0231A): ${hex(head)}`);
  console.log(`Tail (0xD0231D): ${hex(tail)}`);

  // Hex dumps
  console.log('\n--- Hex dump 0xD02200-0xD02300 ---');
  for (const line of formatHexDump(mem, EXTENDED_REGION_START, DISPATCH_REGION_START)) {
    console.log(line);
  }

  console.log('\n--- Hex dump 0xD02300-0xD02400 ---');
  for (const line of formatHexDump(mem, DISPATCH_REGION_START, DISPATCH_REGION_END)) {
    console.log(line);
  }

  // Walk linked list
  const walkResult = walkLinkedList(mem, HEAD_PTR_ADDR, TAIL_PTR_ADDR);

  // Analyze pointer structure
  const structAnalysis = analyzePointerStructure(mem, head, tail);
  console.log('\n--- Pointer Structure Analysis ---');
  for (const line of structAnalysis) {
    console.log(line);
  }

  // Write trace summary
  console.log(`\n--- Write trace: ${tracker.writes.length} writes to 0xD02200-0xD02400 ---`);

  // Summarize by PC
  const pcCounts = new Map();
  for (const w of tracker.writes) {
    const key = hex(w.pc);
    pcCounts.set(key, (pcCounts.get(key) || 0) + 1);
  }
  console.log('\nWrites by PC:');
  for (const [pc, count] of [...pcCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pc}: ${count} writes`);
  }

  // Summarize by target address range
  const addrCounts = new Map();
  for (const w of tracker.writes) {
    const bucket = w.addr & 0xfffff0;
    const key = hex(bucket);
    addrCounts.set(key, (addrCounts.get(key) || 0) + 1);
  }
  console.log('\nWrites by target region (16-byte buckets):');
  for (const [addr, count] of [...addrCounts.entries()].sort()) {
    console.log(`  ${addr}: ${count} writes`);
  }

  // Show first 60 and last 20 writes in detail
  console.log('\nFirst 60 writes:');
  console.log('| Step | PC | Addr | Value |');
  console.log('| --- | --- | --- | --- |');
  for (const w of tracker.writes.slice(0, 60)) {
    console.log(`| ${w.step} | ${hex(w.pc)} | ${hex(w.addr)} | ${hexByte(w.value)} |`);
  }

  if (tracker.writes.length > 60) {
    console.log(`\n... ${tracker.writes.length - 80} writes omitted ...\n`);
    console.log('Last 20 writes:');
    console.log('| Step | PC | Addr | Value |');
    console.log('| --- | --- | --- | --- |');
    for (const w of tracker.writes.slice(-20)) {
      console.log(`| ${w.step} | ${hex(w.pc)} | ${hex(w.addr)} | ${hexByte(w.value)} |`);
    }
  }

  // Also dump the IX target area (0xD02670-0xD02680) that block_0ad46a writes to
  console.log('\n--- IX target area (0xD02670-0xD02690) ---');
  for (const line of formatHexDump(mem, 0xd02670, 0xd02690)) {
    console.log(line);
  }

  // Build the report
  return {
    coldBoot,
    result,
    mem,
    head,
    tail,
    base,
    writes: tracker.writes,
    walkResult,
    structAnalysis,
    pcCounts,
    addrCounts,
  };
}

function buildReport(data) {
  const lines = [];

  lines.push('# Phase 145 - Dispatch Table Node Structure Analysis');
  lines.push('');
  lines.push('Generated by `probe-phase145-dispatch-nodes.mjs`.');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- ROM generatedAt: \`${ROM_GENERATED_AT}\``);
  lines.push(`- Cold boot: steps=${data.coldBoot.steps} termination=${data.coldBoot.termination}`);
  lines.push(`- OS init: steps=${data.result.steps} termination=${data.result.termination} lastPc=${hex(data.result.lastPc ?? 0)}`);
  lines.push('');

  lines.push('## Pointer Header');
  lines.push('');
  lines.push(`| Pointer | Address | Value |`);
  lines.push(`| --- | --- | --- |`);
  lines.push(`| Base/Start | \`0xD02317\` | \`${hex(data.base)}\` |`);
  lines.push(`| Current/Head | \`0xD0231A\` | \`${hex(data.head)}\` |`);
  lines.push(`| End/Tail | \`0xD0231D\` | \`${hex(data.tail)}\` |`);
  lines.push('');

  if (data.tail > data.base && data.tail >= EXTENDED_REGION_START && data.base >= EXTENDED_REGION_START) {
    const totalSize = data.tail - data.base + 1;
    lines.push(`Total region size (base to tail inclusive): **${totalSize} bytes** (${hex(totalSize)})`);
    lines.push('');
    lines.push('Possible entry count / size:');
    lines.push('');
    for (const n of [17, 18, 19, 20]) {
      const es = totalSize / n;
      const exact = Number.isInteger(es) ? 'EXACT' : `~${es.toFixed(2)}`;
      lines.push(`- ${n} entries: ${exact} bytes each`);
    }
    lines.push('');
  }

  lines.push('## Hex Dump: 0xD02200-0xD02300');
  lines.push('');
  lines.push('```text');
  for (const line of formatHexDump(data.mem, EXTENDED_REGION_START, DISPATCH_REGION_START)) {
    lines.push(line);
  }
  lines.push('```');
  lines.push('');

  lines.push('## Hex Dump: 0xD02300-0xD02400');
  lines.push('');
  lines.push('```text');
  for (const line of formatHexDump(data.mem, DISPATCH_REGION_START, DISPATCH_REGION_END)) {
    lines.push(line);
  }
  lines.push('```');
  lines.push('');

  lines.push('## Linked List Walk Attempts');
  lines.push('');
  if (data.walkResult.nodes.length === 0) {
    lines.push('No valid linked list walks found.');
  } else {
    for (const attempt of data.walkResult.nodes) {
      lines.push(`### Node size = ${attempt.nodeSize} (${attempt.count} nodes)`);
      lines.push('');
      lines.push('```text');
      for (const node of attempt.nodes) {
        const bytesStr = node.bytes.map((b) => hexByte(b)).join(' ');
        lines.push(`${hex(node.addr)}: ${bytesStr}`);
      }
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Write Trace During Boot');
  lines.push('');
  lines.push(`Total writes to 0xD02200-0xD02400: **${data.writes.length}**`);
  lines.push('');

  lines.push('### Writes By PC');
  lines.push('');
  lines.push('| PC | Count |');
  lines.push('| --- | --- |');
  for (const [pc, count] of [...data.pcCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${pc}\` | ${count} |`);
  }
  lines.push('');

  lines.push('### Writes By Target Region (16-byte buckets)');
  lines.push('');
  lines.push('| Region | Count |');
  lines.push('| --- | --- |');
  for (const [addr, count] of [...data.addrCounts.entries()].sort()) {
    lines.push(`| \`${addr}\` | ${count} |`);
  }
  lines.push('');

  lines.push('### First 60 Writes (detail)');
  lines.push('');
  lines.push('| Step | PC | Addr | Value |');
  lines.push('| --- | --- | --- | --- |');
  for (const w of data.writes.slice(0, 60)) {
    lines.push(`| ${w.step} | \`${hex(w.pc)}\` | \`${hex(w.addr)}\` | \`${hexByte(w.value)}\` |`);
  }
  lines.push('');

  if (data.writes.length > 80) {
    lines.push('### Last 20 Writes (detail)');
    lines.push('');
    lines.push('| Step | PC | Addr | Value |');
    lines.push('| --- | --- | --- | --- |');
    for (const w of data.writes.slice(-20)) {
      lines.push(`| ${w.step} | \`${hex(w.pc)}\` | \`${hex(w.addr)}\` | \`${hexByte(w.value)}\` |`);
    }
    lines.push('');
  }

  lines.push('## 0x0AD459 Function Analysis');
  lines.push('');
  lines.push('The function at `0x0AD459` (`block_0ad459_adl`) is the dispatch table entry processor.');
  lines.push('It is called in a loop with `LD B, 0x12; CALL 0x0AD459` (18 iterations).');
  lines.push('');
  lines.push('### Execution Flow');
  lines.push('');
  lines.push('```text');
  lines.push('0x0AD459: ld c, 0x00          ; clear C');
  lines.push('          ld de, 0x000000      ; clear DE');
  lines.push('          push ix              ; save IX');
  lines.push('          ld h, a              ; save A in H');
  lines.push('          ld a, i              ; read interrupt vector register');
  lines.push('          jp pe, 0x0AD46A      ; branch on parity (interrupt state)');
  lines.push('');
  lines.push('0x0AD468: ld a, i              ; (fallthrough: re-read I)');
  lines.push('');
  lines.push('0x0AD46A: push af              ; save flags');
  lines.push('          ld a, h              ; restore original A');
  lines.push('          di                   ; disable interrupts');
  lines.push('          ld ix, 0xD02670      ; IX = node workspace at 0xD02670');
  lines.push('          res 6, b             ; clear bit 6 of B (flags field)');
  lines.push('          ld (ix+0), b         ; store B (flags) into workspace');
  lines.push('          ld (ix+1), c         ; store C into workspace');
  lines.push('          ld (ix+2), 0x00      ; clear workspace byte 2');
  lines.push('          ld hl, (0xD0231A)    ; HL = current dispatch pointer');
  lines.push('          push hl              ; save current pointer');
  lines.push('          push de              ; save DE (0)');
  lines.push('          bit 6, (ix+0)        ; test bit 6 of flags');
  lines.push('          jr z, 0x0AD48E       ; if clear, call 0x09BAC9');
  lines.push('```');
  lines.push('');
  lines.push('### Key Observations');
  lines.push('');
  lines.push('1. **IX = 0xD02670** is a 3-byte workspace used during processing (flags, C, zero)');
  lines.push('2. **Reads 0xD0231A** (current pointer) and saves it on the stack');
  lines.push('3. **At 0x0AD4DF**: writes BC to 0xD0231A — this advances the current pointer');
  lines.push('4. **At 0x0AD4B4**: also writes BC to 0xD0231A (alternate path)');
  lines.push('5. **At 0x0AD69B** (exit): writes HL to 0xD0231A — final pointer update');
  lines.push('6. The function processes one entry per call, advancing the current pointer (0xD0231A)');
  lines.push('7. B register carries flags between calls (bit 6 tested, bit 0 tested at various points)');
  lines.push('8. Calls to 0x09BAC9, 0x09BBAD suggest token parsing / string comparison');
  lines.push('');

  lines.push('## 0x056900 Region Analysis');
  lines.push('');
  lines.push('The `cluster_shift_or_remove` function at 0x0568FF:');
  lines.push('');
  lines.push('1. Saves head (0xD0231A) and tail (0xD0231D) on stack');
  lines.push('2. Decrements DE and stores to 0xD0231A (shifts head back)');
  lines.push('3. Reads 0xD0243A, decrements, stores to 0xD0231D (adjusts tail)');
  lines.push('4. Calls `0x0AD459` with B=0x12 (18 iterations)');
  lines.push('5. Restores original head/tail');
  lines.push('6. Loops B times calling 0x0568BA with stride DE=0x000011 (17 bytes)');
  lines.push('');
  lines.push('The `adjacent_initializer` at 0x056A02:');
  lines.push('');
  lines.push('1. Calls helper functions to compute sizes');
  lines.push('2. Writes base to 0xD02317 and 0xD0231A (initializes base = current)');
  lines.push('3. Adds DE to HL, decrements: stores to 0xD0231D (sets tail)');
  lines.push('4. Recomputes and stores final current to 0xD0231A');
  lines.push('');

  lines.push('## Node Structure Hypothesis');
  lines.push('');
  lines.push('The stride `LD DE, 0x000011` (17 bytes) at 0x05693B strongly suggests each dispatch');
  lines.push('table entry is **17 bytes**. With 18 entries, that would be 306 bytes total.');
  lines.push('');
  lines.push('The structure appears to be a **contiguous array** (not a linked list), where:');
  lines.push('- `0xD02317` = base pointer (start of array)');
  lines.push('- `0xD0231A` = current position / cursor');
  lines.push('- `0xD0231D` = end pointer (last valid byte)');
  lines.push('');
  lines.push('Each 17-byte entry likely contains:');
  lines.push('- Flags/type byte(s)');
  lines.push('- A token or command identifier');
  lines.push('- Handler address (3 bytes for eZ80 ADL mode)');
  lines.push('- Additional context/parameters');
  lines.push('');

  return lines.join('\n');
}

// ── Run ──

const data = runProbe();
const report = buildReport(data);
fs.writeFileSync(REPORT_PATH, report, 'utf-8');
console.log(`\nReport written to ${REPORT_PATH}`);
