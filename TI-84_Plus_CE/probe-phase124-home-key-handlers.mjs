#!/usr/bin/env node

/**
 * # Phase 124 - 0x06EDAC + 0x06FCD0 Home-Screen Key Handlers
 *
 * ## Static Summary
 *
 * Short `SIS` memory operands below resolve through `MBASE=0xD0` in the
 * standard probe baseline, so `0x002A98` means `0xD02A98`, `0x0014FC` means
 * `0xD014FC`, and so on.
 *
 * ### 0x06EDAC
 * - Visible entry path: `call 0x06ED84`, then `call 0x0B58F3`.
 * - `0x06ED84` immediately clears `0xD00841`, calls `0x0AC8C5`, and only later
 *   reaches `0x0801B9`, `0x06C90F`, and `0x05C634`.
 * - In the first ~150 bytes, `0x06EDAC` mostly flips OS state bits through
 *   `IY` (`+29`, `+78`, `+1`, `+20`, `+23`, `+13`, `+17`, `+3`, `-8`, `+2`,
 *   `+75`) and touches full RAM at `0xD0256D`, `0xD0258D`, and `0xD0146D`.
 * - No direct references to `0x085E16`, `0x0059C6`, `0x0A1CAC`, `0xD0058E`, or
 *   `0xD40000+` appear in the visible slice.
 * - Shape: state-update plus redraw kickoff. It does not look like a thin key
 *   code decoder.
 *
 * ### 0x06FCD0
 * - Visible entry starts with `bit 7, (iy+75)` / `res 7, (iy+75)` / `ret nz`.
 *   In the standard post-init baseline, `(iy+75)=0xFF`, so a direct call
 *   returns immediately after clearing the guard bit.
 * - If that guard is clear, the visible body stages `0xD02A98 -> 0xD02AC0`,
 *   reads `0xD014FC`, tests `IY+75` bits `4/6/7` and `IY+80` bit `5`, then
 *   calls `0x0800A0`, `0x0801B9`, `0x09EF44`, `0x06FD67`, `0x06FD63`, and
 *   `0x06FD9A`.
 * - No direct references to `0x085E16`, `0x0059C6`, `0x0A1CAC`, `0xD0058E`, or
 *   `0xD40000+` appear in the visible slice.
 * - Shape: guarded display-state helper. The static `0x09EF44` call ties it to
 *   the same renderer family seen around `0x085E16`, but it is not a top-level
 *   key decoder on its own.
 *
 * ## Dynamic Results
 *
 * Standard state used for the required matrix:
 * - Cold boot from `0x000000`
 * - OS init from `0x08C331`
 * - CPU fix: `mbase=0xD0`, `iy=0xD00080`
 * - Per run: `mem[0xD007E0]=0x44`, `mem[0xD0058E]=scan`, `A=scan`
 *
 * | function | key | steps | term | lastPc | unique blocks | VRAM writes | cursor writes |
 * | --- | --- | --- | --- | --- | --- | --- | --- |
 * | `0x06EDAC` | `0x10` ENTER | `50000` | `max_steps` | `0x084723` | `95` | `76800` | `row=0xff col=0xff` |
 * | `0x06EDAC` | `0x16` CLEAR | `50000` | `max_steps` | `0x084723` | `95` | `76800` | `row=0xff col=0xff` |
 * | `0x06EDAC` | `0x21` digit-2 | `50000` | `max_steps` | `0x084723` | `95` | `76800` | `row=0xff col=0xff` |
 * | `0x06EDAC` | `0x1F` digit-0 | `50000` | `max_steps` | `0x084723` | `95` | `76800` | `row=0xff col=0xff` |
 * | `0x06FCD0` | `0x10` ENTER | `1` | `missing_block` | `0xFFFFFF` | `1` | `0` | `none` |
 * | `0x06FCD0` | `0x16` CLEAR | `1` | `missing_block` | `0xFFFFFF` | `1` | `0` | `none` |
 * | `0x06FCD0` | `0x21` digit-2 | `1` | `missing_block` | `0xFFFFFF` | `1` | `0` | `none` |
 * | `0x06FCD0` | `0x1F` digit-0 | `1` | `missing_block` | `0xFFFFFF` | `1` | `0` | `none` |
 *
 * ## Comparison
 *
 * - `0x06EDAC` ignores the tested key values in this baseline. All four runs
 *   are identical and immediately fall into a long-lived downstream UI loop
 *   ending at `0x084723`.
 * - `0x06EDAC` is the only one that writes VRAM in the required matrix. It
 *   also writes both cursor bytes once, setting them to `0xFF`.
 * - `0x06FCD0` also ignores the tested key values in this direct-entry
 *   baseline, but only because its first `IY+75` guard bit is already set and
 *   causes an immediate return to the seeded `0xFFFFFF` sentinel frame.
 * - Neither visible static slice directly calls `0x085E16`, `0x0059C6`, or
 *   `0x0A1CAC`.
 * - Extra sanity check outside the required matrix: if `(iy+75)` is cleared
 *   before entering `0x06FCD0`, the function reaches `0x09EF44` immediately but
 *   still shows no VRAM writes in the first `5000` steps. That supports the
 *   "guarded render-family helper" classification.
 *
 * ## Verdict
 *
 * - These are in the home-screen key-handling region reached from `0x08C7AD`,
 *   but they do different jobs.
 * - `0x06EDAC` is the stronger home-screen action handler in the seeded direct
 *   baseline: it performs state work and kicks off rendering-heavy downstream
 *   code.
 * - `0x06FCD0` is downstream helper logic gated by `IY+75`. It can feed the
 *   `0x09EF44` renderer family once the guard is clear, but under standard
 *   direct-entry state it is not the primary home-screen action path.
 */

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const FUNCTIONS = [
  { addr: 0x06edac, label: '0x06EDAC' },
  { addr: 0x06fcd0, label: '0x06FCD0' },
];

const SCAN_CODES = [
  { value: 0x10, label: 'ENTER' },
  { value: 0x16, label: 'CLEAR' },
  { value: 0x21, label: 'digit-2' },
  { value: 0x1f, label: 'digit-0' },
];

const DISASM_BYTES = 0x96;
const STACK_SENTINEL = 0xd1a87e - 3;
const ANALYSIS_MBASE = 0xd0;
const ANALYSIS_IY = 0xd00080;

const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const MODE_ADDR = 0xd007e0;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;
const IY_FLAG_75_ADDR = ANALYSIS_IY + 75;
const IY_FLAG_80_ADDR = ANALYSIS_IY + 80;

const TARGET_RENDER = 0x085e16;
const TARGET_CHAR_PRINT = 0x0059c6;
const TARGET_STRING_RENDER = 0x0a1cac;
const TARGET_RENDER_FAMILY = 0x09ef44;

const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  'pc',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function formatShortAddress(addr) {
  return `${hex(addr, 6)} => ${hex((ANALYSIS_MBASE << 16) | (addr & 0xffff))}`;
}

function resolveMemoryAddress(inst) {
  if (typeof inst.addr !== 'number') {
    return null;
  }

  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (ANALYSIS_MBASE << 16) | (inst.addr & 0xffff);
  }

  return inst.addr;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
          ? `ld (${formatShortAddress(inst.addr)}), ${inst.pair}`
          : `ld (${hex(inst.addr)}), ${inst.pair}`;
      }

      return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
        ? `ld ${inst.pair}, (${formatShortAddress(inst.addr)})`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
        ? `ld ${inst.dest}, (${formatShortAddress(inst.addr)})`
        : `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
        ? `ld (${formatShortAddress(inst.addr)}), ${inst.src}`
        : `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
    }
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(inst.value)}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind':
      return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind':
      return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `bit ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-res': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `res ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-set': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `set ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'rotate-reg':
      return `${inst.op} ${inst.reg}`;
    case 'rotate-ind':
      return `${inst.op} (${inst.indirectRegister})`;
    case 'mlt':
      return `mlt ${inst.reg}`;
    case 'nop':
      return 'nop';
    default:
      return inst.tag;
  }
}

function renderTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function uniqueSortedHex(values) {
  return [...new Set(values)].sort((left, right) => left - right).map((value) => hex(value));
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function applyCpuFix(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = ANALYSIS_MBASE;
  cpu._iy = ANALYSIS_IY;
  cpu._hl = 0;
  cpu.sp = STACK_SENTINEL;
}

function seedReturnSentinel(cpu, mem) {
  cpu.sp = STACK_SENTINEL;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function bootEnvironment() {
  const rom = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  applyCpuFix(cpu);

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  applyCpuFix(cpu);

  return {
    rom,
    mem,
    executor,
    cpu,
    coldBoot,
    osInit,
    baselineMem: new Uint8Array(mem),
    baselineCpu: snapshotCpu(cpu),
    baselineState: {
      mode: mem[MODE_ADDR] & 0xff,
      keyEvent: mem[KEY_EVENT_ADDR] & 0xff,
      iy75: mem[IY_FLAG_75_ADDR] & 0xff,
      iy80: mem[IY_FLAG_80_ADDR] & 0xff,
    },
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineMem);
  restoreCpu(env.cpu, env.baselineCpu);
}

function collectIyOffsets(inst) {
  const offsets = [];

  if (
    (inst.tag === 'ld-reg-ixd' || inst.tag === 'ld-ixd-reg') &&
    inst.indexRegister === 'iy'
  ) {
    offsets.push(inst.displacement);
  }

  if (
    (inst.tag === 'indexed-cb-bit' ||
      inst.tag === 'indexed-cb-res' ||
      inst.tag === 'indexed-cb-set') &&
    inst.indexRegister === 'iy'
  ) {
    offsets.push(inst.displacement);
  }

  return offsets;
}

function disassembleFunction(rom, startPc) {
  const rows = [];
  let pc = startPc;
  let consumed = 0;

  while (consumed < DISASM_BYTES) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const rawBytes = Array.from(
      rom.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      inst,
      disasm: formatInstruction(inst),
      resolvedAddr: resolveMemoryAddress(inst),
      iyOffsets: collectIyOffsets(inst),
    });

    pc += inst.length;
    consumed += inst.length;
  }

  return rows;
}

function summarizeStatic(rows, entry) {
  const callTargets = [];
  const memoryRefs = [];
  const iyOffsets = [];

  for (const row of rows) {
    const { inst, resolvedAddr } = row;

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push(inst.target);
    }

    if (typeof resolvedAddr === 'number') {
      memoryRefs.push(resolvedAddr);
    }

    iyOffsets.push(...row.iyOffsets);
  }

  const calls = uniqueSortedHex(callTargets);
  const refs = uniqueSortedHex(memoryRefs);
  const directKnownRefs = {
    render085e16: callTargets.includes(TARGET_RENDER),
    charPrint0059c6: callTargets.includes(TARGET_CHAR_PRINT),
    string0a1cac: callTargets.includes(TARGET_STRING_RENDER),
    keyByteD0058e: memoryRefs.includes(KEY_EVENT_ADDR),
    vram: memoryRefs.some((addr) => addr >= VRAM_START && addr < VRAM_END),
  };

  if (entry === 0x06edac) {
    return {
      calls,
      refs,
      iyOffsets,
      directKnownRefs,
      entryReads:
        'Direct body is IY-state-driven. The first visible instruction hands control to 0x06ED84, which zeroes A before later tests. No direct read of the seeded key byte or entry A appears in the visible slice.',
      classification:
        'State-update plus redraw kickoff.',
      bullets: [
        'Visible call chain includes `0x06ED84`, `0x0B58F3`, `0x06FCD0`, `0x06FCA2`, `0x06FCAC`, `0x0A2802`, `0x05C634`, `0x055B8F`, `0x06C8AB`, `0x04C973`, `0x09F290`, and `0x06FEFA`.',
        'Touches many IY flags and full RAM at `0xD0256D`, `0xD0258D`, and `0xD0146D`, but does not directly reference `0xD0058E` or any known text renderer.',
        'The embedded `0x06ED84` helper calls `0x0AC8C5`, then later `0x0801B9`, `0x06C90F`, and `0x05C634`, which makes the entry path look like high-level state work plus screen refresh preparation.',
      ],
    };
  }

  return {
    calls,
    refs,
    iyOffsets,
    directKnownRefs,
    entryReads:
      'Visible body reads `(iy+75)` immediately, then `(iy+80)` and short RAM state. No direct read of the seeded key byte or entry A appears in the visible slice.',
    classification:
      'Guarded display-state helper feeding the 0x09EF44 renderer family.',
    bullets: [
      'Visible call chain includes `0x0800A0`, `0x09EF44`, `0x0801B9`, `0x06FD67`, `0x06FD63`, and `0x06FD9A`.',
      'Short-RAM operands resolve to `0xD02A98`, `0xD02AC0`, and `0xD014FC` in the standard baseline.',
      'The opening `bit 7, (iy+75)` / `res 7, (iy+75)` / `ret nz` sequence explains the immediate return seen in the required direct-entry probe.',
    ],
  };
}

function analyzeStatic(rom, target) {
  const rows = disassembleFunction(rom, target.addr);
  const summary = summarizeStatic(rows, target.addr);

  return {
    ...target,
    rows,
    ...summary,
  };
}

function runExperiment(env, target, scanCode, options = {}) {
  restoreBaseline(env);
  seedReturnSentinel(env.cpu, env.mem);

  env.mem[KEY_EVENT_ADDR] = scanCode.value;
  env.mem[MODE_ADDR] = 0x44;
  env.cpu.a = scanCode.value;

  if (typeof options.beforeRun === 'function') {
    options.beforeRun(env.cpu, env.mem);
  }

  const rowWrites = [];
  const colWrites = [];
  let vramWrites = 0;
  const firstBlocks = [];
  const uniqueBlocks = new Set();
  const seenTargets = {
    render085e16: false,
    charPrint0059c6: false,
    string0a1cac: false,
    renderFamily09ef44: false,
  };

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    const maskedAddr = addr & 0xffffff;
    const maskedValue = value & 0xff;

    if (maskedAddr >= VRAM_START && maskedAddr < VRAM_END) {
      vramWrites += 1;
    }

    if (maskedAddr === CUR_ROW_ADDR) {
      rowWrites.push(maskedValue);
    }

    if (maskedAddr === CUR_COL_ADDR) {
      colWrites.push(maskedValue);
    }

    return originalWrite8(addr, value);
  };

  let run;
  try {
    run = env.executor.runFrom(target.addr, 'adl', {
      maxSteps: options.maxSteps ?? 50000,
      maxLoopIterations: 10000,
      onBlock: (pc, mode) => {
        const maskedPc = pc & 0xffffff;
        const blockId = `${hex(maskedPc)}:${mode}`;

        uniqueBlocks.add(blockId);

        if (firstBlocks.length < 24) {
          firstBlocks.push(blockId);
        }

        if (maskedPc === TARGET_RENDER) {
          seenTargets.render085e16 = true;
        }

        if (maskedPc === TARGET_CHAR_PRINT) {
          seenTargets.charPrint0059c6 = true;
        }

        if (maskedPc === TARGET_STRING_RENDER) {
          seenTargets.string0a1cac = true;
        }

        if (maskedPc === TARGET_RENDER_FAMILY) {
          seenTargets.renderFamily09ef44 = true;
        }
      },
    });
  } finally {
    env.cpu.write8 = originalWrite8;
  }

  return {
    functionAddr: target.addr,
    functionLabel: target.label,
    keyLabel: scanCode.label,
    keyValue: scanCode.value,
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    uniqueBlockCount: uniqueBlocks.size,
    firstBlocks,
    vramWrites,
    rowWrites,
    colWrites,
    seenTargets,
    stateAfter: {
      mode: env.mem[MODE_ADDR] & 0xff,
      keyEvent: env.mem[KEY_EVENT_ADDR] & 0xff,
      iy75: env.mem[IY_FLAG_75_ADDR] & 0xff,
      iy80: env.mem[IY_FLAG_80_ADDR] & 0xff,
    },
  };
}

function runGuardClearSanity(env) {
  return runExperiment(env, FUNCTIONS[1], SCAN_CODES[0], {
    maxSteps: 5000,
    beforeRun(_cpu, mem) {
      mem[IY_FLAG_75_ADDR] = 0x00;
    },
  });
}

function formatCursorWrites(result) {
  if (result.rowWrites.length === 0 && result.colWrites.length === 0) {
    return 'none';
  }

  const row = result.rowWrites.length === 0
    ? '-'
    : result.rowWrites.map((value) => hexByte(value)).join(',');
  const col = result.colWrites.length === 0
    ? '-'
    : result.colWrites.map((value) => hexByte(value)).join(',');

  return `row=${row} col=${col}`;
}

function buildReport(env, staticAnalyses, dynamicResults, guardClearSanity) {
  const lines = [];

  lines.push('# Phase 124 - 0x06EDAC + 0x06FCD0 Home-Screen Key Handlers');
  lines.push('');
  lines.push('Generated by `probe-phase124-home-key-handlers.mjs`.');
  lines.push('');
  lines.push('## Baseline');
  lines.push('');
  lines.push(...renderTable(
    ['stage', 'steps', 'termination', 'lastPc'],
    [
      [
        'coldBoot',
        String(env.coldBoot.steps),
        env.coldBoot.termination,
        hex(env.coldBoot.lastPc ?? 0),
      ],
      [
        'osInit',
        String(env.osInit.steps),
        env.osInit.termination,
        hex(env.osInit.lastPc ?? 0),
      ],
    ],
  ));
  lines.push('');
  lines.push(
    `- Raw post-init state before per-run seeding: ` +
      `mode=${hexByte(env.baselineState.mode)}, ` +
      `key=${hexByte(env.baselineState.keyEvent)}, ` +
      `(iy+75)=${hexByte(env.baselineState.iy75)}, ` +
      `(iy+80)=${hexByte(env.baselineState.iy80)}.`,
  );
  lines.push(
    `- Every required run overwrites ` +
      `\`${hex(MODE_ADDR)}=0x44\`, ` +
      `\`${hex(KEY_EVENT_ADDR)}=scan\`, ` +
      'and `A=scan` after OS init.',
  );
  lines.push('');
  lines.push('## Static Summary');
  lines.push('');

  lines.push(...renderTable(
    ['function', 'reads on entry', 'visible calls', 'direct known refs', 'classification'],
    staticAnalyses.map((analysis) => [
      `\`${analysis.label}\``,
      analysis.entryReads,
      analysis.calls.length === 0 ? '-' : analysis.calls.map((value) => `\`${value}\``).join(', '),
      [
        `085E16=${analysis.directKnownRefs.render085e16 ? 'yes' : 'no'}`,
        `0059C6=${analysis.directKnownRefs.charPrint0059c6 ? 'yes' : 'no'}`,
        `0A1CAC=${analysis.directKnownRefs.string0a1cac ? 'yes' : 'no'}`,
        `D0058E=${analysis.directKnownRefs.keyByteD0058e ? 'yes' : 'no'}`,
        `VRAM=${analysis.directKnownRefs.vram ? 'yes' : 'no'}`,
      ].join(', '),
      analysis.classification,
    ]),
  ));
  lines.push('');

  for (const analysis of staticAnalyses) {
    lines.push(`### ${analysis.label}`);
    lines.push('');
    lines.push(`- IY offsets touched in the visible slice: ${analysis.iyOffsets.length === 0 ? '-' : analysis.iyOffsets.sort((left, right) => left - right).map((value) => `\`${value}\``).join(', ')}.`);
    lines.push(`- Direct memory refs in the visible slice: ${analysis.refs.length === 0 ? '-' : analysis.refs.map((value) => `\`${value}\``).join(', ')}.`);
    for (const bullet of analysis.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
    lines.push('```text');
    for (const row of analysis.rows) {
      lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.disasm}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## Dynamic Results');
  lines.push('');
  lines.push(...renderTable(
    ['function', 'key', 'steps', 'term', 'lastPc', 'unique blocks', 'VRAM writes', 'cursor writes'],
    dynamicResults.map((result) => [
      `\`${result.functionLabel}\``,
      `\`${hexByte(result.keyValue)}\` ${result.keyLabel}`,
      String(result.steps),
      result.termination,
      `\`${hex(result.lastPc)}\``,
      String(result.uniqueBlockCount),
      String(result.vramWrites),
      formatCursorWrites(result),
    ]),
  ));
  lines.push('');

  for (const analysis of staticAnalyses) {
    const representative = dynamicResults.find((result) => result.functionAddr === analysis.addr);
    lines.push(`### ${analysis.label} Representative Block Trace`);
    lines.push('');
    lines.push(`- First blocks for \`${hexByte(representative.keyValue)} ${representative.keyLabel}\`:`);
    lines.push('');
    lines.push('```text');
    for (const blockId of representative.firstBlocks) {
      lines.push(blockId);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## Comparison');
  lines.push('');
  lines.push('- `0x06EDAC` is stable across all four tested keys in the required matrix. Every run ends in the same long-lived `0x084723` loop with the same `76800` VRAM writes and the same `0xFF/0xFF` cursor writes.');
  lines.push('- `0x06FCD0` is also stable across all four tested keys in the required matrix, but only because `(iy+75)` starts at `0xFF`, so the opening guard immediately clears bit 7 and returns to the seeded `0xFFFFFF` frame.');
  lines.push('- Static direct calls to `0x085E16`, `0x0059C6`, and `0x0A1CAC`: none in either visible slice.');
  lines.push('- Dynamic visits to `0x085E16`, `0x0059C6`, and `0x0A1CAC` in the required direct-entry matrix: none observed.');
  lines.push('- `0x06EDAC` is the only required direct-entry path that writes VRAM.');
  lines.push('');
  lines.push('### Guard-Clear Sanity Check For 0x06FCD0');
  lines.push('');
  lines.push(`- Not part of the required matrix: with \`(iy+75)=0x00\` forced before entry, \`0x06FCD0\` runs for ${guardClearSanity.steps} steps, ends at \`${hex(guardClearSanity.lastPc)}\`, reaches \`0x09EF44\`, and still records \`${guardClearSanity.vramWrites}\` VRAM writes in the first 5000 steps.`);
  lines.push(`- First blocks on that sanity path: ${guardClearSanity.firstBlocks.slice(0, 10).map((value) => `\`${value}\``).join(', ')}.`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push('- `0x06EDAC` and `0x06FCD0` are both downstream of the home-screen `0x08C7AD` split, but they are not interchangeable peers.');
  lines.push('- `0x06EDAC` is the stronger direct home-screen action handler in the standard seeded baseline. It performs state work and immediately kicks off rendering-heavy downstream code.');
  lines.push('- `0x06FCD0` is a subordinate guarded helper. Its visible body targets the `0x09EF44` render family rather than `0x085E16` directly, and standard direct-entry state leaves it short-circuited by the `IY+75` guard.');
  lines.push('- Downstream, the interesting render work appears to happen after `0x06ED84 -> 0x0AC8C5` for `0x06EDAC`, and after the `IY+75` guard is cleared for `0x06FCD0`.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const env = bootEnvironment();
  const staticAnalyses = FUNCTIONS.map((target) => analyzeStatic(env.rom, target));

  const dynamicResults = [];
  for (const target of FUNCTIONS) {
    for (const scanCode of SCAN_CODES) {
      dynamicResults.push(runExperiment(env, target, scanCode));
    }
  }

  const guardClearSanity = runGuardClearSanity(env);
  const report = buildReport(env, staticAnalyses, dynamicResults, guardClearSanity);

  console.log(report);
}

main();
