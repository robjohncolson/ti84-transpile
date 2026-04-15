#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase188-report.md');

const MEM_SIZE = 0x1000000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;
const MASK24 = 0xFFFFFF;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE1_ENTRY = 0x0A2B72;
const STAGE3_ENTRY = 0x0A29EC;

const STACK_RESET_TOP = 0xD1A87E;
const IX_RESET = 0xD1A860;
const IY_RESET = 0xD00080;

const DISPLAY_BUF = 0xD006C0;
const DISPLAY_LEN = 64;
const DISPLAY_TEXT = 'ABCDE';

const MODE_BUF = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const TRACE_START = 0xD00000;
const TRACE_END = 0xD02FFF;
const TARGET_BLOCKS = [0x0A1939, 0x0A19D7, 0x005B96];
const TARGET_BLOCK_SET = new Set(TARGET_BLOCKS);

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(JS_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';

  let masked = Number(value);
  if (width === 2) masked &= 0xFF;
  else if (width === 4) masked &= 0xFFFF;
  else if (width === 6) masked &= MASK24;
  else masked >>>= 0;

  return `0x${masked.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2).slice(2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function maskForWidth(width) {
  if (width === 8) return 0xFF;
  if (width === 16) return 0xFFFF;
  return MASK24;
}

function widthHexDigits(width) {
  if (width === 8) return 2;
  if (width === 16) return 4;
  return 6;
}

function formatWidth(width) {
  return `${width}-bit`;
}

function incrementCount(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function snapCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snap, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snap)) cpu[field] = value;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._ix = IX_RESET;
  cpu._iy = IY_RESET;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_SIZE);
}

function seedDisplay(mem) {
  mem.fill(0x20, DISPLAY_BUF, DISPLAY_BUF + DISPLAY_LEN);
  for (let i = 0; i < DISPLAY_TEXT.length; i += 1) mem[DISPLAY_BUF + i] = DISPLAY_TEXT.charCodeAt(i);
}

function seedMode(mem) {
  for (let i = 0; i < MODE_TEXT.length; i += 1) mem[MODE_BUF + i] = MODE_TEXT.charCodeAt(i);
}

function initEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  cpu.mbase = 0xD0;
  cpu._iy = IY_RESET;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernel,
    post,
    ramSnap: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnap: snapCpu(cpu),
  };
}

function prepStage3(env) {
  env.mem.set(env.ramSnap, RAM_START);
  clearVram(env.mem);
  seedMode(env.mem);
  seedDisplay(env.mem);
  restoreCpu(env.cpu, env.cpuSnap, env.mem);

  const stage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });

  clearVram(env.mem);
  seedMode(env.mem);
  seedDisplay(env.mem);
  restoreCpu(env.cpu, env.cpuSnap, env.mem);

  return stage1;
}

function installColorReadTrace(cpu) {
  const state = { step: 0, blockPc: null };
  const blockHits = new Map();
  const colorReads = [];

  const read8 = cpu.read8.bind(cpu);
  const read16 = cpu.read16.bind(cpu);
  const read24 = cpu.read24.bind(cpu);

  function setContext(step, pc) {
    state.step = step;
    state.blockPc = pc === null ? null : pc & MASK24;

    if (TARGET_BLOCK_SET.has(state.blockPc)) incrementCount(blockHits, state.blockPc);
  }

  function record(addr, value, width) {
    const a = addr & MASK24;
    if (!TARGET_BLOCK_SET.has(state.blockPc)) return;
    if (a < TRACE_START || a > TRACE_END) return;

    colorReads.push({
      step: state.step,
      block: state.blockPc,
      addr: a,
      width,
      value: value & maskForWidth(width),
    });
  }

  cpu.read8 = (addr) => {
    const value = read8(addr);
    record(addr, value, 8);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = read16(addr);
    record(addr, value, 16);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = read24(addr);
    record(addr, value, 24);
    return value;
  };

  return {
    blockHits,
    colorReads,
    setContext,
    restore() {
      cpu.read8 = read8;
      cpu.read16 = read16;
      cpu.read24 = read24;
    },
  };
}

function pickTypicalValue(summary) {
  const values = [...summary.values.values()];
  if (values.length === 0) return null;

  const widthRank = { 16: 0, 24: 1, 8: 2 };
  values.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if ((widthRank[a.width] ?? 99) !== (widthRank[b.width] ?? 99)) {
      return (widthRank[a.width] ?? 99) - (widthRank[b.width] ?? 99);
    }
    return a.value - b.value;
  });

  return values[0];
}

function classifySuspect(summary) {
  const values = [...summary.values.values()];

  function countWhere(predicate) {
    return values.filter(predicate).reduce((sum, entry) => sum + entry.count, 0);
  }

  function totalWidth(width) {
    return countWhere((entry) => entry.width === width);
  }

  const width16Total = totalWidth(16);
  const width16FFFF = countWhere((entry) => entry.width === 16 && entry.value === 0xFFFF);
  const width24Total = totalWidth(24);
  const width24FFFF = countWhere((entry) => entry.width === 24 && (entry.value & 0xFFFF) === 0xFFFF);
  const width8Total = totalWidth(8);
  const width8FF = countWhere((entry) => entry.width === 8 && entry.value === 0xFF);

  if (width16Total > 0 && width16FFFF === width16Total) {
    return { suspect: true, score: 4, label: 'YES - 16-bit reads are always 0xFFFF' };
  }

  if (width16FFFF > 0) {
    return { suspect: true, score: 3, label: 'YES - some 16-bit reads are 0xFFFF' };
  }

  if (width24Total > 0 && width24FFFF === width24Total) {
    return { suspect: true, score: 2, label: 'MAYBE - 24-bit low 16 bits are always 0xFFFF' };
  }

  if (width24FFFF > 0) {
    return { suspect: true, score: 1, label: 'MAYBE - some 24-bit low 16 bits are 0xFFFF' };
  }

  if (width8Total > 0 && width8FF === width8Total) {
    return { suspect: false, score: 0, label: 'maybe - byte reads are always 0xFF' };
  }

  return { suspect: false, score: 0, label: 'no' };
}

function summarizeReads(colorReads) {
  const byAddr = new Map();

  for (const read of colorReads) {
    if (!byAddr.has(read.addr)) {
      byAddr.set(read.addr, {
        addr: read.addr,
        count: 0,
        widths: new Map(),
        blocks: new Map(),
        values: new Map(),
      });
    }

    const entry = byAddr.get(read.addr);
    entry.count += 1;
    incrementCount(entry.widths, read.width);
    incrementCount(entry.blocks, read.block);

    const valueKey = `${read.width}:${read.value}`;
    if (!entry.values.has(valueKey)) {
      entry.values.set(valueKey, { width: read.width, value: read.value, count: 0 });
    }
    entry.values.get(valueKey).count += 1;
  }

  return [...byAddr.values()]
    .sort((a, b) => a.addr - b.addr)
    .map((entry) => ({
      ...entry,
      typicalValue: pickTypicalValue(entry),
      suspectInfo: classifySuspect(entry),
    }));
}

function blockKey(startPc) {
  return `${startPc.toString(16).padStart(6, '0')}:adl`;
}

function disassembleBlock(startPc) {
  const meta = BLOCKS[blockKey(startPc)] ?? null;
  if (!meta) {
    return {
      startPc,
      rows: [],
      missing: true,
    };
  }

  const rows = [];
  let pc = startPc;

  for (let i = 0; i < meta.instructionCount; i += 1) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch (error) {
      rows.push({
        pc,
        bytes: new Uint8Array(),
        text: `decode error: ${error.message}`,
      });
      break;
    }

    if (!inst || !inst.length) break;

    rows.push({
      pc,
      bytes: romBytes.slice(pc, pc + inst.length),
      text: inst.dasm || inst.mnemonic || inst.tag || '(unknown)',
    });

    pc = inst.nextPc;
  }

  return {
    startPc,
    rows,
    missing: false,
  };
}

function runProbe(env) {
  const stage1 = prepStage3(env);
  const trace = installColorReadTrace(env.cpu);

  let stage3;
  try {
    stage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onBlock(pc, mode, meta, steps) {
        trace.setContext(steps + 1, pc);
      },
    });
  } finally {
    trace.restore();
  }

  const summaries = summarizeReads(trace.colorReads);
  const suspects = summaries
    .filter((entry) => entry.suspectInfo.suspect)
    .sort((a, b) => {
      if (b.suspectInfo.score !== a.suspectInfo.score) return b.suspectInfo.score - a.suspectInfo.score;
      if (b.count !== a.count) return b.count - a.count;
      return a.addr - b.addr;
    });

  return {
    stage1,
    stage3,
    blockHits: trace.blockHits,
    colorReads: trace.colorReads,
    summaries,
    suspects,
    disassembly: TARGET_BLOCKS.map((pc) => disassembleBlock(pc)),
  };
}

function formatWidthCounts(widths) {
  if (widths.size === 0) return 'none';

  return [...widths.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([width, count]) => `${formatWidth(width)} x${count}`)
    .join(', ');
}

function formatBlockCounts(blocks) {
  if (blocks.size === 0) return 'none';

  return [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pc, count]) => `${hex(pc)} x${count}`)
    .join(', ');
}

function formatValueCounts(summary, limit = 6) {
  const values = [...summary.values.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.width !== b.width) return a.width - b.width;
      return a.value - b.value;
    })
    .slice(0, limit);

  if (values.length === 0) return 'none';

  return values
    .map((entry) => `${formatWidth(entry.width)} ${hex(entry.value, widthHexDigits(entry.width))} x${entry.count}`)
    .join(', ');
}

function formatTypicalValue(summary) {
  if (!summary.typicalValue) return 'n/a';

  return `${formatWidth(summary.typicalValue.width)} ${hex(
    summary.typicalValue.value,
    widthHexDigits(summary.typicalValue.width),
  )}`;
}

function formatTargetBlockHits(blockHits) {
  return TARGET_BLOCKS.map((pc) => `${hex(pc)} x${blockHits.get(pc) ?? 0}`).join(', ');
}

function buildVerdict(result) {
  const lines = [];

  if (result.colorReads.length === 0) {
    const hitCount = [...result.blockHits.values()].reduce((sum, count) => sum + count, 0);

    if (hitCount === 0) {
      lines.push('- None of the target writer blocks executed before stage 3 terminated.');
    } else {
      lines.push(`- The target blocks executed (${formatTargetBlockHits(result.blockHits)}), but none of their traced reads hit ${hex(TRACE_START)}-${hex(TRACE_END)}.`);
      lines.push('- That means the foreground color came from a register, an immediate, or RAM outside the traced window.');
    }

    return lines;
  }

  if (result.suspects.length === 0) {
    lines.push('- No traced RAM address returned 0xFFFF on a 16-bit read or in the low 16 bits of a 24-bit read.');
    lines.push('- Review the grouped table below for byte-oriented reads that stay at 0xFF across adjacent addresses.');
    return lines;
  }

  for (const entry of result.suspects.slice(0, 5)) {
    lines.push(
      `- ${hex(entry.addr)} is a prime suspect: ${entry.suspectInfo.label}; values seen ${formatValueCounts(entry, 4)}; blocks ${formatBlockCounts(entry.blocks)}.`,
    );
  }

  if (result.suspects.length > 5) {
    lines.push(`- ${result.suspects.length - 5} additional suspect address(es) are listed in the summary table.`);
  }

  return lines;
}

function buildReport(env, result) {
  const lines = [];

  lines.push('# Phase 188 - FG Color Read Trace');
  lines.push('');
  lines.push(`- Boot: ${env.boot.termination} @ ${hex(env.boot.lastPc)}`);
  lines.push(`- Kernel init: ${env.kernel.termination} @ ${hex(env.kernel.lastPc)}`);
  lines.push(`- Post-init: ${env.post.termination} @ ${hex(env.post.lastPc)}`);
  lines.push(`- Stage 1: ${result.stage1.termination} @ ${hex(result.stage1.lastPc)}`);
  lines.push(`- Stage 3: ${result.stage3.termination} @ ${hex(result.stage3.lastPc)}`);
  lines.push(`- Target block hits: ${formatTargetBlockHits(result.blockHits)}`);
  lines.push(`- Traced reads in ${hex(TRACE_START)}-${hex(TRACE_END)}: ${result.colorReads.length}`);
  lines.push('');
  lines.push('## 1. Disassembly');
  lines.push('');

  for (const block of result.disassembly) {
    lines.push(`### ${hex(block.startPc)}`);
    lines.push('');

    if (block.missing) {
      lines.push('- Missing ADL block metadata.');
      lines.push('');
      continue;
    }

    lines.push('```text');
    for (const row of block.rows) {
      lines.push(`${hex(row.pc)}  ${bytesToHex(row.bytes).padEnd(18)}  ${row.text}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## 2. All color reads grouped by RAM address');
  lines.push('');

  if (result.summaries.length === 0) {
    lines.push(`- No reads from ${hex(TRACE_START)}-${hex(TRACE_END)} were captured while the target blocks were active.`);
  } else {
    lines.push('| RAM Address | Read Count | Width Mix | Values Seen | Blocks |');
    lines.push('|---|---:|---|---|---|');
    for (const summary of result.summaries) {
      lines.push(
        `| ${hex(summary.addr)} | ${summary.count} | ${formatWidthCounts(summary.widths)} | ${formatValueCounts(summary)} | ${formatBlockCounts(summary.blocks)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## 3. Verdict');
  lines.push('');
  for (const line of buildVerdict(result)) lines.push(line);
  lines.push('');
  lines.push('## 4. Summary Table');
  lines.push('');

  if (result.summaries.length === 0) {
    lines.push('| RAM Address | Read Count | Typical Value | Suspect? |');
    lines.push('|---|---:|---|---|');
    lines.push('| none | 0 | n/a | n/a |');
  } else {
    lines.push('| RAM Address | Read Count | Typical Value | Suspect? |');
    lines.push('|---|---:|---|---|');
    for (const summary of result.summaries) {
      lines.push(
        `| ${hex(summary.addr)} | ${summary.count} | ${formatTypicalValue(summary)} | ${summary.suspectInfo.label} |`,
      );
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = initEnv();
  const result = runProbe(env);
  const report = buildReport(env, result);

  fs.writeFileSync(REPORT_PATH, report);
  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  const failureReport = [
    '# Phase 188 - FG Color Read Trace',
    '',
    '## Failure',
    '',
    '```text',
    message,
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_PATH, `${failureReport}\n`);
  console.error(message);
  process.exitCode = 1;
}
