#!/usr/bin/env node

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 100000;
const BOOT_MAX_LOOP_ITERATIONS = BOOT_MAX_STEPS;

const TRACK_RAM_START = 0xD00000;
const TRACK_RAM_END_EXCLUSIVE = 0xE00000;
const POST_BOOT_SCAN_START = 0xD00000;
const POST_BOOT_SCAN_END_EXCLUSIVE = 0xD30000;

const TARGETS = [
  {
    label: '0x062055',
    description: 'bridge to cxMain',
    value: 0x062055,
    bytes: [0x55, 0x20, 0x06],
  },
  {
    label: '0x058241',
    description: 'cxMain pre-handler control',
    value: 0x058241,
    bytes: [0x41, 0x82, 0x05],
  },
  {
    label: '0x08C79F',
    description: 'context-switch comparator control',
    value: 0x08C79F,
    bytes: [0x9F, 0xC7, 0x08],
  },
  {
    label: '0x08C808',
    description: 'event-loop dispatcher control',
    value: 0x08C808,
    bytes: [0x08, 0xC8, 0x08],
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function mask24(value) {
  return value & 0xFFFFFF;
}

function isTrackedRamWindow(addr, size = 3) {
  return (
    addr >= TRACK_RAM_START &&
    addr + size <= TRACK_RAM_END_EXCLUSIVE
  );
}

function readBytes(mem, addr, size = 3) {
  return Array.from(mem.slice(addr, addr + size));
}

function scanRangeForTarget(mem, target, start, endExclusive) {
  const hits = [];

  for (let addr = start; addr <= endExclusive - target.bytes.length; addr += 1) {
    let matched = true;
    for (let index = 0; index < target.bytes.length; index += 1) {
      if (mem[addr + index] !== target.bytes[index]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      hits.push(addr);
    }
  }

  return hits;
}

function installPointerWriteProbe(cpu, mem) {
  const events = [];
  let currentStep = 0;
  let currentPc = BOOT_ENTRY;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordMatches(writeKind, rawAddr, rawValue, widthBytes) {
    const writeAddr = mask24(rawAddr);
    const writeValue = Number(rawValue) >>> 0;
    const pc = cpu._currentBlockPc ?? currentPc;
    const seenThisWrite = new Set();

    // Check every possible 3-byte window touched by this write so byte-at-a-time
    // population of a pointer is still caught once the full sequence is present.
    for (let matchAddr = writeAddr - 2; matchAddr <= writeAddr + widthBytes - 1; matchAddr += 1) {
      if (!isTrackedRamWindow(matchAddr, 3)) {
        continue;
      }

      const bytes = readBytes(mem, matchAddr, 3);

      for (const target of TARGETS) {
        if (
          bytes[0] === target.bytes[0] &&
          bytes[1] === target.bytes[1] &&
          bytes[2] === target.bytes[2]
        ) {
          const key = `${target.label}:${matchAddr}`;
          if (seenThisWrite.has(key)) {
            continue;
          }
          seenThisWrite.add(key);

          events.push({
            target,
            step: currentStep,
            pc,
            matchAddr,
            matchBytes: bytes,
            writeKind,
            writeAddr,
            writeValue,
            widthBytes,
          });
        }
      }
    }
  }

  cpu.write8 = (addr, value) => {
    const result = originalWrite8(addr, value);
    recordMatches('write8', addr, value, 1);
    return result;
  };

  cpu.write16 = (addr, value) => {
    const result = originalWrite16(addr, value);
    recordMatches('write16', addr, value, 2);
    return result;
  };

  cpu.write24 = (addr, value) => {
    const result = originalWrite24(addr, value);
    recordMatches('write24', addr, value, 3);
    return result;
  };

  return {
    events,
    setContext(step, pc) {
      currentStep = step;
      currentPc = pc;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function printHeader(title) {
  console.log(`=== ${title} ===`);
}

function printEventSection(target, events) {
  printHeader(`Dynamic Write Matches ${target.label} (${target.description})`);
  console.log(`Target value: ${hex(target.value)}`);
  console.log(`Target bytes: ${formatBytes(target.bytes)}`);
  console.log(`Match count: ${events.length}`);

  if (events.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const [index, event] of events.entries()) {
    console.log(
      `  [${index + 1}] matchAddr=${hex(event.matchAddr)} ` +
      `write=${event.writeKind}@${hex(event.writeAddr)} ` +
      `value=${hex(event.writeValue, event.widthBytes * 2)} ` +
      `pc=${hex(event.pc)} step=${event.step} ` +
      `bytes=${formatBytes(event.matchBytes)}`,
    );
  }

  console.log('');
}

function printPostBootScan(target, hits) {
  printHeader(`Post-Boot RAM Scan ${target.label} (${target.description})`);
  console.log(
    `Range: [${hex(POST_BOOT_SCAN_START)}, ${hex(POST_BOOT_SCAN_END_EXCLUSIVE)})`,
  );
  console.log(`Target bytes: ${formatBytes(target.bytes)}`);
  console.log(`Hit count: ${hits.length}`);

  if (hits.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit)}`);
  }

  console.log('');
}

async function main() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const probe = installPointerWriteProbe(cpu, mem);

  let bootResult;

  try {
    probe.setContext(0, BOOT_ENTRY);
    bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
      maxSteps: BOOT_MAX_STEPS,
      maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, steps) {
        probe.setContext(steps + 1, pc);
      },
    });
  } finally {
    probe.restore();
  }

  const eventsByTarget = new Map(TARGETS.map((target) => [target.label, []]));
  for (const event of probe.events) {
    eventsByTarget.get(event.target.label).push(event);
  }

  const postBootScans = new Map(
    TARGETS.map((target) => [
      target.label,
      scanRangeForTarget(mem, target, POST_BOOT_SCAN_START, POST_BOOT_SCAN_END_EXCLUSIVE),
    ]),
  );

  printHeader('Phase 256 RAM Pointer Probe');
  console.log(`ROM generatedAt: ${TRANSPILATION_META?.generatedAt ?? 'unknown'}`);
  console.log(`Boot entry: ${hex(BOOT_ENTRY)} mode=${BOOT_MODE}`);
  console.log(`Step limit: ${BOOT_MAX_STEPS}`);
  console.log(`Timer interrupts: disabled via createPeripheralBus({ timerInterrupt: false })`);
  console.log(`Dynamic RAM window: [${hex(TRACK_RAM_START)}, ${hex(TRACK_RAM_END_EXCLUSIVE)})`);
  console.log('');

  printHeader('Boot Result');
  console.log(`Steps executed: ${bootResult.steps}`);
  console.log(`Termination: ${bootResult.termination}`);
  console.log(`Last PC: ${hex(bootResult.lastPc)}`);
  console.log(`Last mode: ${bootResult.lastMode ?? 'n/a'}`);
  console.log(`Missing blocks: ${(bootResult.missingBlocks ?? []).length}`);
  console.log('');

  for (const target of TARGETS) {
    printEventSection(target, eventsByTarget.get(target.label) ?? []);
  }

  for (const target of TARGETS) {
    printPostBootScan(target, postBootScans.get(target.label) ?? []);
  }

  printHeader('Summary');
  for (const target of TARGETS) {
    const dynamicCount = (eventsByTarget.get(target.label) ?? []).length;
    const postBootCount = (postBootScans.get(target.label) ?? []).length;
    console.log(
      `  ${target.label} dynamicMatches=${dynamicCount} postBootRamHits=${postBootCount}`,
    );
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
