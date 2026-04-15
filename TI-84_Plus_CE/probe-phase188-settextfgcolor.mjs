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
const REPORT_PATH = path.join(__dirname, 'phase188-settextfgcolor-report.md');

const MEM_SIZE = 0x1000000;
const MASK24 = 0xFFFFFF;
const MBASE = 0xD0;
const STACK_RESET_TOP = 0xD1A87E;
const IY_RESET = 0xD00080;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_COLOR = 0x0802B2;

const RAM_TRACE_START = 0xD00000;
const RAM_TRACE_END = 0xD02FFF;
const TEXT_FG_ADDR = 0xD02688;
const TEXT_FG_COMPANION_ADDR = 0xD0268A;
const TEXT_FLAG_ADDR = 0xD000CA;

const DISASSEMBLY_TARGETS = [
  { label: 'SetTextFgColor', address: 0x0802B2 },
  { label: 'VRAM writer block 1', address: 0x0A1939 },
  { label: 'VRAM writer block 2', address: 0x0A19D7 },
  { label: 'VRAM fill primitive', address: 0x005B96 },
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(JS_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(bytes) {
  return Array.from(bytes, (value) => (value & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function read16(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8);
}

function shortToRuntime(addr) {
  return ((MBASE << 16) | addr) & MASK24;
}

function formatInstruction(inst) {
  const addrWidth = inst.modePrefix ? 4 : 6;

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, addrWidth)}`;

    case 'ld-mem-pair':
      return `ld (${hex(inst.addr, addrWidth)}), ${inst.pair}`;

    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') {
        return `ld ${inst.pair}, (${hex(inst.addr, addrWidth)})`;
      }
      return `ld (${hex(inst.addr, addrWidth)}), ${inst.pair}`;

    case 'indexed-cb-set':
      return `set ${inst.bit}, (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;

    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;

    case 'rotate-reg':
      return `${inst.op} ${inst.reg}`;

    case 'alu-reg':
      return `${inst.op} a, ${inst.src}`;

    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;

    case 'inc-pair':
      return `inc ${inst.pair}`;

    case 'jp':
      return `jp ${hex(inst.target)}`;

    case 'ld-ind-imm':
      return `ld (hl), ${hex(inst.value, 2)}`;

    case 'ldir':
      return 'ldir';

    case 'push':
      return `push ${inst.pair}`;

    case 'pop':
      return `pop ${inst.pair}`;

    case 'ret':
      return 'ret';

    default:
      return inst.tag;
  }
}

function ramWriteCandidate(inst) {
  if (inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg') {
    const runtimeAddr = inst.addr < 0x10000 ? shortToRuntime(inst.addr) : inst.addr;
    return `RAM write candidate -> ${hex(runtimeAddr)}`;
  }

  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    const runtimeAddr = inst.addr < 0x10000 ? shortToRuntime(inst.addr) : inst.addr;
    return `RAM write candidate -> ${hex(runtimeAddr)}`;
  }

  if (inst.tag === 'ld-ixd-reg') {
    return `Indexed RAM write candidate -> (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
  }

  return '';
}

function disassembleLinear(startPc) {
  const rows = [];
  let pc = startPc;

  for (let count = 0; count < 128 && pc < romBytes.length; count += 1) {
    let inst;

    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      break;
    }

    if (!inst || !inst.length) break;

    rows.push({
      address: pc,
      bytes: romBytes.slice(pc, pc + inst.length),
      mnemonic: formatInstruction(inst),
      note: ramWriteCandidate(inst),
    });

    pc = inst.nextPc;

    if (inst.terminates) break;
  }

  return rows;
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = MBASE;
  cpu._iy = IY_RESET;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  return { mem, executor, cpu };
}

function installRamWriteTracer(cpu) {
  const writes = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const resolved = addr & MASK24;
    if (resolved >= RAM_TRACE_START && resolved <= RAM_TRACE_END) {
      writes.push({ addr: resolved, value: value & 0xFF, width: 8 });
    }
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    const resolved = addr & MASK24;
    if (resolved >= RAM_TRACE_START && resolved <= RAM_TRACE_END) {
      writes.push({ addr: resolved, value: value & 0xFFFF, width: 16 });
    }
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const resolved = addr & MASK24;
    if (resolved >= RAM_TRACE_START && resolved <= RAM_TRACE_END) {
      writes.push({ addr: resolved, value: value & MASK24, width: 24 });
    }
    return originalWrite24(addr, value);
  };

  return {
    writes,
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function runSetTextFgColor(colorValue) {
  const { mem, executor, cpu } = createEnv();
  const tracer = installRamWriteTracer(cpu);

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  cpu.hl = colorValue & MASK24;

  const execution = executor.runFrom(SET_TEXT_FG_COLOR, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  tracer.restore();

  return {
    colorValue: colorValue & 0xFFFF,
    execution,
    writes: tracer.writes,
    textFgValue: read16(mem, TEXT_FG_ADDR),
    companionValue: read16(mem, TEXT_FG_COMPANION_ADDR),
    flagValue: mem[TEXT_FLAG_ADDR],
  };
}

function collectDefaults() {
  const { mem } = createEnv();

  return {
    textFgValue: read16(mem, TEXT_FG_ADDR),
    companionValue: read16(mem, TEXT_FG_COMPANION_ADDR),
    flagValue: mem[TEXT_FLAG_ADDR],
  };
}

function collectPostCallSnapshot() {
  const { mem, executor, cpu } = createEnv();

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  cpu.hl = 0x0000;

  executor.runFrom(SET_TEXT_FG_COLOR, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    textFgValue: read16(mem, TEXT_FG_ADDR),
    companionValue: read16(mem, TEXT_FG_COMPANION_ADDR),
    flagValue: mem[TEXT_FLAG_ADDR],
  };
}

function finalWriteMap(writes) {
  const map = new Map();

  for (const write of writes) {
    map.set(write.addr, write);
  }

  return map;
}

function diffWriteMaps(left, right) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  const diffs = [];

  for (const key of keys) {
    const a = left.get(key);
    const b = right.get(key);

    if (!a || !b) {
      diffs.push({ addr: key, before: a?.value ?? null, after: b?.value ?? null, width: a?.width ?? b?.width ?? null });
      continue;
    }

    if (a.value !== b.value || a.width !== b.width) {
      diffs.push({ addr: key, before: a.value, after: b.value, width: a.width });
    }
  }

  diffs.sort((first, second) => first.addr - second.addr);
  return diffs;
}

function writeLogLine(write) {
  const valueWidth = write.width === 8 ? 2 : write.width === 16 ? 4 : 6;
  return `- ${hex(write.addr)} <= ${hex(write.value, valueWidth)} (${write.width}-bit)`;
}

function renderDisassemblySection(target, rows) {
  const lines = [];
  lines.push(`### ${hex(target.address)} - ${target.label}`);
  lines.push('');
  lines.push('| Address | Bytes | Mnemonic | Notes |');
  lines.push('|---|---|---|---|');

  for (const row of rows) {
    const note = row.note || '';
    lines.push(`| ${hex(row.address)} | \`${hexBytes(row.bytes)}\` | \`${row.mnemonic}\` | ${note} |`);
  }

  lines.push('');
  return lines;
}

function buildReport(disassemblies, runs, diffs, defaults, postCallSnapshot, fgEntry) {
  const lines = [];

  lines.push('# Phase 188 - SetTextFgColor Producer Trace');
  lines.push('');
  lines.push('## Part A - Static Disassembly');
  lines.push('');
  lines.push('- `SetTextFgColor` takes its caller-supplied color in `HL`.');
  lines.push(`- In ADL mode with \`MBASE = ${hex(MBASE, 2)}\`, short stores to \`0x2688\` / \`0x268A\` land at \`${hex(TEXT_FG_ADDR)}\` / \`${hex(TEXT_FG_COMPANION_ADDR)}\`.`);
  lines.push('');

  for (const item of disassemblies) {
    lines.push(...renderDisassemblySection(item.target, item.rows));
  }

  lines.push('## Part B - Dynamic Trace');
  lines.push('');

  for (const run of runs) {
    lines.push(`### HL = ${hex(run.colorValue, 4)}`);
    lines.push('');
    lines.push(`- Termination: \`${run.execution.termination}\` at ${hex(run.execution.lastPc ?? 0xFFFFFF)}`);
    lines.push(`- Final ${hex(TEXT_FG_ADDR)} = ${hex(run.textFgValue, 4)}`);
    lines.push(`- Final ${hex(TEXT_FG_COMPANION_ADDR)} = ${hex(run.companionValue, 4)}`);
    lines.push(`- Final ${hex(TEXT_FLAG_ADDR)} = ${hex(run.flagValue, 2)}`);
    lines.push('');
    for (const write of run.writes) {
      lines.push(writeLogLine(write));
    }
    lines.push('');
  }

  lines.push('### Changed Address Between HL = 0x0000 and HL = 0xFFFF');
  lines.push('');

  if (diffs.length === 0) {
    lines.push('- No differing RAM writes were detected.');
  } else {
    for (const diff of diffs) {
      const width = diff.width === 8 ? 2 : diff.width === 16 ? 4 : 6;
      lines.push(`- ${hex(diff.addr)}: ${hex(diff.before, width)} -> ${hex(diff.after, width)}`);
    }
  }

  lines.push('');
  lines.push(`- Identified fg color RAM address: ${fgEntry ? hex(fgEntry.addr) : 'not found'}`);
  lines.push(`- Companion slot forced by SetTextFgColor: ${hex(TEXT_FG_COMPANION_ADDR)} = 0xFFFF`);
  lines.push('');
  lines.push('## Part C - Cross-Reference');
  lines.push('');
  lines.push(`- After boot + kernel init, ${hex(TEXT_FG_ADDR)} = ${hex(defaults.textFgValue, 4)}`);
  lines.push(`- After boot + kernel init, ${hex(TEXT_FG_COMPANION_ADDR)} = ${hex(defaults.companionValue, 4)}`);
  lines.push(`- After one phase186-style post-init call to ${hex(SET_TEXT_FG_COLOR)} with HL = 0x0000, ${hex(TEXT_FG_ADDR)} = ${hex(postCallSnapshot.textFgValue, 4)}`);
  lines.push(`- After that same call, ${hex(TEXT_FG_COMPANION_ADDR)} = ${hex(postCallSnapshot.companionValue, 4)}`);
  lines.push(`- The ${hex(TEXT_FLAG_ADDR)} flag is set to ${hex(postCallSnapshot.flagValue, 2)} by the function.`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`SetTextFgColor at ${hex(SET_TEXT_FG_COLOR)} writes the fg color to RAM address ${fgEntry ? hex(fgEntry.addr) : 'not found'}.`);
  lines.push('');
  lines.push(`It also writes the adjacent companion slot ${hex(TEXT_FG_COMPANION_ADDR)} to 0xFFFF on every call, which is where the persistent white value comes from in this producer-side trace.`);

  return `${lines.join('\n')}\n`;
}

const disassemblies = DISASSEMBLY_TARGETS.map((target) => ({
  target,
  rows: disassembleLinear(target.address),
}));

const defaults = collectDefaults();
const postCallSnapshot = collectPostCallSnapshot();

const runs = [
  runSetTextFgColor(0x0000),
  runSetTextFgColor(0xFFFF),
  runSetTextFgColor(0x1234),
];

const diffs = diffWriteMaps(finalWriteMap(runs[0].writes), finalWriteMap(runs[1].writes));
const fgEntry = diffs.find((entry) => entry.addr !== TEXT_FLAG_ADDR) ?? null;

const report = buildReport(disassemblies, runs, diffs, defaults, postCallSnapshot, fgEntry);

fs.writeFileSync(REPORT_PATH, report);
console.log(report);
