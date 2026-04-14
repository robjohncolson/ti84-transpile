#!/usr/bin/env node

/**
 * Phase 122 - 0x0A2E05 key-action probe
 *
 * Static report:
 * - 0x0A2E05 is not a dispatch-table entry. The lifted block is only:
 *   ld hl, 0x000000
 *   sis ld (0x0026ac), hl
 *   ret
 * - With MBASE=0xD0, that clears RAM word 0xD026AC and returns. The helper
 *   never reads A, never reads 0xD0058E, and contains no compares, indexed
 *   table lookups, or indirect jumps/calls.
 * - Different direct-entry scan codes should therefore follow the same path
 *   and produce the same writes. The only per-case differences that should
 *   survive are the untouched seeded A register and key byte.
 * - The Phase 119 key-processing chain only uses 0x0A2E05 as a tiny reset
 *   helper. In that path the next meaningful PC is 0x08C7E1, where the real
 *   key-state compare chain begins.
 * - The next ~0x96 bytes after the helper belong to a separate utility routine
 *   at 0x0A2E0E. That nearby code has loops and calls 0x04C950 and 0x0A2718,
 *   but still no computed key dispatch. A string table starts at 0x0A2EA4.
 *
 * Dynamic expectation:
 * - Each direct run should visit only 0x0A2E05, write 0x0000 to 0xD026AC, and
 *   terminate on the seeded return sentinel.
 * - If any keyed run diverges, the divergence is coming from caller context,
 *   not from 0x0A2E05 itself.
 *
 * Next targets:
 * - 0x08C7E1 / 0x08C7F5 onward in the Phase 119 path
 * - 0x08C7BF if the caller context around the helper matters
 * - Other static callers of 0x0A2E05 if 0xD026AC zeroing is shared across
 *   unrelated UI flows
 */

import { readFileSync } from 'node:fs';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const ENTRY = 0x0a2e05;
const PHASE119_CALLER = 0x08c7bf;
const PHASE119_RETURN = 0x08c7e1;

const STATIC_WINDOW_BYTES = 0xc8;
const STATIC_CODE_END = 0x0a2ea4;
const STACK_SENTINEL = 0xd1a87e - 3;

const KEY_EVENT_ADDR = 0xd0058e;
const MODE_BUFFER_START = 0xd020a6;
const MODE_BUFFER_END = 0xd020bf;
const TEXT_BUFFER_HEAD = 0xd006c0;
const HELPER_STORE_ADDR = 0xd026ac;
const IY_BASE = 0xd00080;
const MBASE_RAM = 0xd0;

const VRAM_START = 0xd40000;
const VRAM_END = 0xd4c000;

const SCAN_CASES = [
  { label: 'ENTER', scanCode: 0x10 },
  { label: 'CLEAR', scanCode: 0x16 },
  { label: 'digit-2', scanCode: 0x21 },
  { label: 'digit-0', scanCode: 0x1f },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function read16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function write16(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
}

function overlaps(addr, size, start, endExclusive) {
  const rangeEnd = addr + size;
  return addr < endExclusive && rangeEnd > start;
}

function classifyWatchedAddress(addr) {
  if (addr === KEY_EVENT_ADDR) {
    return 'key_event';
  }

  if (addr >= MODE_BUFFER_START && addr <= MODE_BUFFER_END) {
    return 'mode_buffer';
  }

  if (addr === TEXT_BUFFER_HEAD) {
    return 'text_buffer_head';
  }

  if (addr === HELPER_STORE_ADDR || addr === HELPER_STORE_ADDR + 1) {
    return 'helper_store';
  }

  return null;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'ld-pair-imm':
      text = `ld ${inst.pair}, ${hex(inst.value)}`;
      break;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        text = `ld (${hex(inst.addr)}), ${inst.pair}`;
      } else {
        text = `ld ${inst.pair}, (${hex(inst.addr)})`;
      }
      break;
    case 'ld-reg-imm':
      text = `ld ${inst.dest}, ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-reg':
      text = `ld ${inst.dest}, ${inst.src}`;
      break;
    case 'ld-reg-ind':
      text = `ld ${inst.dest}, (${inst.src})`;
      break;
    case 'ld-ind-reg':
      text = `ld (${inst.dest}), ${inst.src}`;
      break;
    case 'ld-ind-imm':
      text = `ld (hl), ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'alu-imm':
      text = `${inst.op} ${hexByte(inst.value)}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'call':
      text = `call ${hex(inst.target)}`;
      break;
    case 'call-conditional':
      text = `call ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp':
      text = `jp ${hex(inst.target)}`;
      break;
    case 'jp-conditional':
      text = `jp ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp-indirect':
      text = `jp (${inst.indirectRegister})`;
      break;
    case 'jr':
      text = `jr ${hex(inst.target)}`;
      break;
    case 'jr-conditional':
      text = `jr ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    case 'ret-conditional':
      text = `ret ${inst.condition}`;
      break;
    case 'inc-pair':
      text = `inc ${inst.pair}`;
      break;
    case 'dec-pair':
      text = `dec ${inst.pair}`;
      break;
    case 'inc-reg':
      text = `inc ${inst.reg}`;
      break;
    case 'dec-reg':
      text = `dec ${inst.reg}`;
      break;
    case 'add-pair':
      text = `add ${inst.dest}, ${inst.src}`;
      break;
    case 'djnz':
      text = `djnz ${hex(inst.target)}`;
      break;
    case 'rotate-reg':
      text = `${inst.op} ${inst.reg}`;
      break;
    case 'ex-de-hl':
      text = 'ex de, hl';
      break;
    case 'nop':
      text = 'nop';
      break;
    default:
      break;
  }

  return `${prefix}${text}`;
}

function disassembleLinear(bytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    const inst = decodeInstruction(bytes, pc, 'adl');
    const rawBytes = Array.from(
      bytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function hexDump(bytes, startPc, length) {
  const lines = [];

  for (let offset = 0; offset < length; offset += 16) {
    const addr = startPc + offset;
    const chunk = Array.from(
      bytes.slice(addr, addr + 16),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');
    lines.push(`${hex(addr)}  ${chunk}`);
  }

  return lines;
}

function findCallers(blocks, target) {
  const callers = [];

  for (const [key, block] of Object.entries(blocks)) {
    for (const exit of block.exits || []) {
      if (exit.target === target) {
        callers.push({ key, type: exit.type });
      }
    }
  }

  callers.sort((left, right) => left.key.localeCompare(right.key));
  return callers;
}

function createEnvironment() {
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, peripherals, executor, cpu };
}

function seedReturnSentinel(cpu, mem) {
  cpu.sp = STACK_SENTINEL;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function primeDirectEntry(cpu, mem, scanCode) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE_RAM;
  cpu._iy = IY_BASE;
  cpu.a = scanCode;
  cpu.f = 0;
  cpu._bc = 0;
  cpu._de = 0;
  cpu._hl = 0;
  cpu.cycles = 0;

  seedReturnSentinel(cpu, mem);

  mem[KEY_EVENT_ADDR] = scanCode;
  mem[TEXT_BUFFER_HEAD] = 0x99;
  write16(mem, HELPER_STORE_ADDR, 0xa55a);
}

function installWriteTracker(cpu) {
  const log = {
    vramWriteEvents: 0,
    vramWriteBytes: 0,
    interestingWrites: [],
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function noteWrite(addr, value, size, via) {
    const maskedAddr = addr & 0xffffff;

    if (overlaps(maskedAddr, size, VRAM_START, VRAM_END)) {
      const overlapStart = Math.max(maskedAddr, VRAM_START);
      const overlapEnd = Math.min(maskedAddr + size, VRAM_END);
      log.vramWriteEvents += 1;
      log.vramWriteBytes += overlapEnd - overlapStart;
    }

    for (let index = 0; index < size; index += 1) {
      const byteAddr = (maskedAddr + index) & 0xffffff;
      const label = classifyWatchedAddress(byteAddr);

      if (!label) {
        continue;
      }

      log.interestingWrites.push({
        label,
        addr: byteAddr,
        value: (value >> (index * 8)) & 0xff,
        via,
      });
    }
  }

  cpu.write8 = (addr, value) => {
    noteWrite(addr, value, 1, 'write8');
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    noteWrite(addr, value, 2, 'write16');
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    noteWrite(addr, value, 3, 'write24');
    return originalWrite24(addr, value);
  };

  return {
    log,
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function runExperiment(scanCase) {
  const env = createEnvironment();
  primeDirectEntry(env.cpu, env.mem, scanCase.scanCode);

  const beforeHelperStore = read16(env.mem, HELPER_STORE_ADDR);
  const tracker = installWriteTracker(env.cpu);
  const blockTrace = [];
  const uniqueBlocks = new Set();

  let run;
  try {
    run = env.executor.runFrom(ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 64,
      onBlock: (pc, mode) => {
        const blockId = `${hex(pc)}:${mode}`;
        blockTrace.push(blockId);
        uniqueBlocks.add(blockId);
      },
    });
  } finally {
    tracker.restore();
  }

  return {
    label: scanCase.label,
    scanCode: scanCase.scanCode,
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    missingBlocks: [...(run.missingBlocks ?? [])],
    blockTrace,
    uniqueBlocks: uniqueBlocks.size,
    aAfter: env.cpu.a & 0xff,
    keyEventAfter: env.mem[KEY_EVENT_ADDR] & 0xff,
    helperStoreBefore: beforeHelperStore,
    helperStoreAfter: read16(env.mem, HELPER_STORE_ADDR),
    vramWriteEvents: tracker.log.vramWriteEvents,
    vramWriteBytes: tracker.log.vramWriteBytes,
    interestingWrites: tracker.log.interestingWrites,
  };
}

function formatInterestingWrites(writes) {
  if (writes.length === 0) {
    return 'none';
  }

  return writes
    .map((write) => `${write.label}@${hex(write.addr)}=${hexByte(write.value)} via ${write.via}`)
    .join(', ');
}

function summarizeCallers(callers) {
  if (callers.length === 0) {
    return 'none';
  }

  const shown = callers.slice(0, 12)
    .map((caller) => `${caller.key} (${caller.type})`)
    .join(', ');

  if (callers.length <= 12) {
    return shown;
  }

  return `${shown}, ... +${callers.length - 12} more`;
}

function compareBehavior(results) {
  if (results.length === 0) {
    return true;
  }

  const normalize = (result) => JSON.stringify({
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    missingBlocks: result.missingBlocks,
    blockTrace: result.blockTrace,
    uniqueBlocks: result.uniqueBlocks,
    helperStoreAfter: result.helperStoreAfter,
    vramWriteEvents: result.vramWriteEvents,
    vramWriteBytes: result.vramWriteBytes,
    interestingWrites: result.interestingWrites,
  });

  const baseline = normalize(results[0]);
  return results.every((result) => normalize(result) === baseline);
}

function renderRows(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${row.bytes.padEnd(16)}  ${row.dasm}`);
}

function buildReport(staticView, results) {
  const lines = [];
  const identicalBehavior = compareBehavior(results);

  lines.push('# Phase 122 - 0x0A2E05 Key-Action Probe');
  lines.push('');
  lines.push('## Static ROM Window');
  lines.push('');
  lines.push(`Raw bytes at ${hex(ENTRY)}..${hex(ENTRY + STATIC_WINDOW_BYTES)}:`); 
  lines.push('');
  lines.push('```text');
  lines.push(...staticView.hexRows);
  lines.push('```');
  lines.push('');
  lines.push(`## Entry Disassembly (${hex(ENTRY)})`);
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(staticView.entryRows));
  lines.push('```');
  lines.push('');
  lines.push(`## Nearby Code Before String Table (${hex(ENTRY + 0x09)}..${hex(STATIC_CODE_END - 1)})`);
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(staticView.nearbyRows));
  lines.push('```');
  lines.push('');
  lines.push('## Static Findings');
  lines.push('');
  lines.push(`- ${hex(ENTRY)} is a 3-instruction helper: load HL=0, store it to MBASE-relative ${hex(0x26ac)}, then return.`);
  lines.push(`- With MBASE seeded to ${hexByte(MBASE_RAM)}, the helper clears ${hex(HELPER_STORE_ADDR)}. It does not read A or ${hex(KEY_EVENT_ADDR)}.`);
  lines.push('- There are no compare immediates, no indexed table lookups, and no indirect dispatch instructions in the entry block.');
  lines.push(`- The next routine in ROM starts at ${hex(ENTRY + 0x09)}. It is separate utility code with loops and calls to ${hex(0x04c950)} and ${hex(0x0a2718)}, not part of the ${hex(ENTRY)} helper itself.`);
  lines.push(`- String data begins at ${hex(STATIC_CODE_END)}, so bytes after that point are not executable code in this local window.`);
  lines.push(`- Static callers of ${hex(ENTRY)} (${staticView.callers.length} total): ${summarizeCallers(staticView.callers)}.`);
  lines.push(`- In the Phase 119 path, ${hex(PHASE119_CALLER)} calls this helper and resumes at ${hex(PHASE119_RETURN)}, where the actual key compare chain starts.`);
  lines.push('');
  lines.push('## Dynamic Results');
  lines.push('');
  lines.push('| key | scan | steps | term | lastPc | blocks | A after | key byte after | D026AC before | D026AC after | VRAM writes |');
  lines.push('|---|---:|---:|---|---|---:|---:|---:|---|---|---:|');

  for (const result of results) {
    lines.push(
      `| ${result.label} | ${hexByte(result.scanCode)} | ${result.steps} | ${result.termination} | ${hex(result.lastPc)} | ${result.uniqueBlocks} | ${hexByte(result.aAfter)} | ${hexByte(result.keyEventAfter)} | ${hex(result.helperStoreBefore, 4)} | ${hex(result.helperStoreAfter, 4)} | ${result.vramWriteBytes} |`,
    );
  }

  lines.push('');

  for (const result of results) {
    lines.push(`### ${result.label}`);
    lines.push('');
    lines.push(`- Block trace: ${result.blockTrace.join(' -> ')}`);
    lines.push(`- Interesting writes: ${formatInterestingWrites(result.interestingWrites)}`);
    lines.push(`- Missing blocks after return: ${result.missingBlocks.length === 0 ? 'none' : result.missingBlocks.join(', ')}`);
    lines.push('');
  }

  lines.push('## Divergence');
  lines.push('');

  if (identicalBehavior) {
    lines.push('- All four direct-entry runs follow the same observable behavior: one lifted block, no VRAM writes, and a single helper-store clear to `0xD026AC`.');
    lines.push('- `A` and `0xD0058E` preserve the seeded scan code, which matches the static read: the helper does not dispatch on the key value.');
  } else {
    lines.push('- The keyed runs diverge. That would mean caller context or hidden state is leaking in despite the helper looking trivial in static analysis.');
  }

  lines.push('');
  lines.push('## Next Targets');
  lines.push('');
  lines.push(`- Probe ${hex(PHASE119_RETURN)} and the compare chain at ${hex(0x08c7f2)}+ if the goal is actual scan-code-to-action dispatch.`);
  lines.push(`- Re-run from ${hex(PHASE119_CALLER)} if you want the real Phase 119 caller context wrapped around this helper.`);
  lines.push(`- Check the other ${staticView.callers.length - 1} callers if ${hex(HELPER_STORE_ADDR)} is a shared state-reset slot rather than a key-specific one.`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const staticView = {
    hexRows: hexDump(rom, ENTRY, STATIC_WINDOW_BYTES),
    entryRows: disassembleLinear(rom, ENTRY, ENTRY + 0x09),
    nearbyRows: disassembleLinear(rom, ENTRY + 0x09, STATIC_CODE_END),
    callers: findCallers(PRELIFTED_BLOCKS, ENTRY),
  };

  const results = SCAN_CASES.map(runExperiment);
  const report = buildReport(staticView, results);
  console.log(report);
}

main();
