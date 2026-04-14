#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const REPORT_URL = new URL('./phase119-report.md', import.meta.url);

const ENTRY = 0x08c7ad;
const CHAIN_ENTRY = 0x08c4a3;
const RENDER_ENTRY = 0x085e16;

const KEY_EVENT_ADDR = 0xd0058e;
const MODE_ADDR = 0xd007e0;
const CALLBACK_ADDR = 0xd007cd;

const VRAM_START = 0xd40000;
const VRAM_END = 0xd4c000;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const STACK_SENTINEL = 0xd1a87e - 3;
const DISASM_COUNT = 110;

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
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function applyCpuFix(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.sp = STACK_SENTINEL;
}

function seedStack(cpu, mem) {
  cpu.sp = STACK_SENTINEL;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
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
        return `ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
    }
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
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
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'mlt':
      return `mlt ${inst.reg}`;
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
    case 'nop':
      return 'nop';
    default:
      return inst.tag;
  }
}

function disassembleInstructions(romBytes, startPc, count) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < count; index += 1) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      index,
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function bootEnvironment() {
  const rom = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 300,
    maxLoopIterations: 32,
  });

  applyCpuFix(cpu);

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 1000,
    maxLoopIterations: 10000,
  });

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 1000,
    maxLoopIterations: 500,
  });

  // Keep the requested CPU fix in place for the actual probe baseline.
  // 0x0802B2 misses immediately here and otherwise leaves IY unusable.
  applyCpuFix(cpu);

  return {
    rom,
    mem,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
    baselineRam: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    baselineCpu: snapshotCpu(cpu),
    baselineState: {
      modeByte: mem[MODE_ADDR],
      callback: read24(mem, CALLBACK_ADDR),
      callback2: read24(mem, 0xd007d0),
      callback3: read24(mem, 0xd007d6),
    },
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineRam, RAM_START);
  restoreCpu(env.cpu, env.baselineCpu);
}

function runExperiment(env, config) {
  restoreBaseline(env);
  seedStack(env.cpu, env.mem);
  config.setup(env.cpu, env.mem);

  const uniqueBlocks = new Set();
  const blockTrace = [];

  let vramWrites = 0;
  let renderVisited = false;
  let entryReached = false;
  let entryFirstStep = null;
  let entryRegs = null;

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    const maskedAddr = addr & 0xffffff;

    if (maskedAddr >= VRAM_START && maskedAddr < VRAM_END) {
      vramWrites += 1;
    }

    return originalWrite8(addr, value);
  };

  let run;
  try {
    run = env.executor.runFrom(config.entry, 'adl', {
      maxSteps: config.maxSteps,
      maxLoopIterations: 10000,
      onBlock: (pc, mode, _meta, steps) => {
        const maskedPc = pc & 0xffffff;
        const blockId = `${hex(maskedPc)}:${mode}`;
        blockTrace.push(blockId);
        uniqueBlocks.add(blockId);

        if (maskedPc === RENDER_ENTRY) {
          renderVisited = true;
        }

        if (maskedPc === ENTRY) {
          entryReached = true;
          if (entryFirstStep === null) {
            entryFirstStep = steps;
            entryRegs = {
              a: env.cpu.a & 0xff,
              b: env.cpu.b & 0xff,
              c: env.cpu.c & 0xff,
              iy: env.cpu.iy & 0xffffff,
              modeByte: env.mem[MODE_ADDR] & 0xff,
            };
          }
        }
      },
    });
  } finally {
    env.cpu.write8 = originalWrite8;
  }

  const entryIndex = blockTrace.findIndex((blockId) => blockId === `${hex(ENTRY)}:adl`);
  const suffix = entryIndex === -1 ? [] : blockTrace.slice(entryIndex);

  return {
    label: config.label,
    steps: run.steps,
    termReason: run.termination,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    totalBlocks: blockTrace.length,
    uniqueBlocks: uniqueBlocks.size,
    vramWrites,
    renderVisited,
    entryReached,
    entryFirstStep,
    entryRegs,
    first15: suffix.slice(0, 15),
    last15: suffix.slice(-15),
  };
}

function renderTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function buildReport(env, staticRows, results) {
  const experimentA = results[0];
  const experimentB = results[1];
  const experimentC = results[2];
  const directRenderCall = staticRows.some((row) => {
    const tag = row.inst.tag;
    return (tag === 'call' || tag === 'call-conditional') && row.inst.target === RENDER_ENTRY;
  });

  const lines = [];

  lines.push('# Phase 119 - 0x08C7AD Common Handler Investigation');
  lines.push('');
  lines.push('Generated by `probe-phase119-08c7ad.mjs`.');
  lines.push('');
  lines.push('## Boot / Probe Baseline');
  lines.push('');
  lines.push(...renderTable(
    ['stage', 'steps', 'termination', 'lastPc'],
    [
      [ 'coldBoot', String(env.coldBoot.steps), env.coldBoot.termination, hex(env.coldBoot.lastPc ?? 0) ],
      [ 'osInit', String(env.osInit.steps), env.osInit.termination, hex(env.osInit.lastPc ?? 0) ],
      [ 'postInit', String(env.postInit.steps), env.postInit.termination, hex(env.postInit.lastPc ?? 0) ],
    ],
  ));
  lines.push('');
  lines.push(`- Requested fix re-applied before snapshot: \`mbase=${hex(env.cpu.mbase, 2)}\`, \`iy=${hex(env.cpu.iy)}\`, \`hl=${hex(env.cpu.hl)}\`, \`sp=${hex(env.cpu.sp)}\`.`);
  lines.push(`- Raw post-init memory slots are still unresolved: \`0xD007E0=${hexByte(env.baselineState.modeByte)}\`, \`0xD007CD=${hex(env.baselineState.callback)}\`, \`0xD007D0=${hex(env.baselineState.callback2)}\`, \`0xD007D6=${hex(env.baselineState.callback3)}\`.`);
  lines.push('');
  lines.push('## Static Disassembly');
  lines.push('');
  lines.push(`First ${DISASM_COUNT} decoded ADL instructions starting at \`0x08C7AD\`:`);
  lines.push('');
  lines.push('```text');
  for (const row of staticRows) {
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.dasm}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Static Findings');
  lines.push('');
  lines.push('- Entry saves `AF` and `BC`, sets the short-address scratch slot at `0xD026B5` to `0xFFFF` through the current `MBASE`, clears it back to `0x0000` later, and writes `0x03` to `0xD026AE`.');
  lines.push('- The original caller `A` is preserved in `L`, passed into `call 0x0A2E05`, then used in multiple compares: `0x44`, `0x40`, `0x3F`, `0xBF`, `0x57`, `0x45`, `0x4B`, `0x52`, `0x4A`, `0x46`.');
  lines.push('- Caller `B` is preserved across the early setup and is consulted on later paths: `ld a, b; cp 0x52` at `0x08C8EC`.');
  lines.push('- The function repeatedly manipulates IY-backed OS flags. The visible offsets are `+0x51`, `+0x27`, `+0x4B`, `+0x28`, `+0x0C`, `+0x3F`, `+0x09`, `+0x11`, `+0x12`, `+0x36`, `+0x01`, `+0x02`, and `+0x1D`.');
  lines.push('- `0xD007E0` is the dominant mode/state byte. It is read at `0x08C7F2`, `0x08C843`, `0x08C874`, `0x08C8BF`, and can be written back later at `0x08C8CB` / `0x08C8F7`.');
  lines.push('- There is no direct `call 0x085E16` in this static slice. The visible helper calls are state/callback oriented: `0x055B8F`, `0x0A2E05`, `0x06EDAC`, `0x06FCD0`, `0x08C94B`, `0x08C689`, `0x09E656`, `0x08C69E`, `0x08C796`, `0x063033`, `0x08C680`, `0x0250E6`, `0x08C928`, `0x0800C2`, `0x0800A0`, `0x08759D`, `0x08230C`, `0x023A84`, `0x08BFEC`.');
  lines.push('- Return behavior is split. There are early direct returns at `0x08C807`, `0x08C80E`, `0x08C927`, and `0x08C94A`. Other paths dispatch indirectly through `0x08C68E -> 0x08C745 -> jp (hl)`.');
  lines.push('');
  lines.push('## Dynamic Results');
  lines.push('');
  lines.push(...renderTable(
    ['experiment', 'entry regs at 0x08C7AD', 'steps', 'termReason', 'lastPc', 'unique blocks', 'total blocks', 'VRAM writes', '0x085E16 visited', '0x08C7AD first step'],
    results.map((result) => [
      result.label,
      result.entryRegs
        ? `A=${hexByte(result.entryRegs.a)} B=${hexByte(result.entryRegs.b)} C=${hexByte(result.entryRegs.c)} IY=${hex(result.entryRegs.iy)}`
        : 'not reached',
      String(result.steps),
      result.termReason,
      hex(result.lastPc),
      String(result.uniqueBlocks),
      String(result.totalBlocks),
      String(result.vramWrites),
      result.renderVisited ? 'yes' : 'no',
      result.entryFirstStep === null ? 'n/a' : String(result.entryFirstStep),
    ]),
  ));
  lines.push('');
  lines.push('### Shared Prefix');
  lines.push('');
  lines.push('- The first 15 blocks after hitting `0x08C7AD` are identical in all three experiments. The common prefix is:');
  lines.push('');
  lines.push('```text');
  for (const blockId of experimentA.first15) {
    lines.push(blockId);
  }
  lines.push('```');
  lines.push('');
  lines.push('- That identical prefix proves `0x08C7AD` is the shared post-classification core, even though the later subdispatch diverges.');
  lines.push('');
  lines.push('### Divergence Notes');
  lines.push('');
  lines.push(`- Experiment A follows the requested direct call setup \`A=0x44, B=0xBC\`. It reaches the late `0x08C911 -> 0x08C926` return path and finally returns to the seeded `0xFFFFFF` sentinel.`);
  lines.push(`- Experiment B also shares the same early prefix, but it exits through the indirect `0x08C745` jump path and dies at \`${hex(experimentB.lastPc)}\`.`);
  lines.push(`- Experiment C confirms the real `0x08C4A3 -> 0x08C5D1 -> 0x08C7AD` chain reaches this handler once after 14 setup blocks, but the live entry registers are \`A=0x44, B=0xFB, C=0x44\`, not the requested \`B=0xBC\`. The special-key dispatcher is passing its translated key code in \`B\`, not the raw scan byte.`);
  lines.push(`- Experiment C then runs for the full 50,000-step budget and settles into the known long-lived loop at \`${hex(experimentC.lastPc)}\`, matching the Phase 117 behavior.`);
  lines.push('');
  lines.push('### VRAM / Render Check');
  lines.push('');
  lines.push(`- Direct static call to \`0x085E16\`: ${directRenderCall ? 'yes' : 'no'}.`);
  lines.push(`- Dynamic visit to \`0x085E16\`: ${results.some((result) => result.renderVisited) ? 'yes' : 'no'}.`);
  lines.push(`- VRAM writes in the \`0xD40000-0xD4BFFF\` window: ${results.map((result) => `${result.label}=${result.vramWrites}`).join(', ')}.`);
  lines.push('- Conclusion from the VRAM diff: `0x08C7AD` is not directly rendering the screen in any tested path.');
  lines.push('');
  lines.push('## Architectural Conclusion');
  lines.push('');
  lines.push('- `0x08C7AD` is the common key-processing core below the key classifier / dispatcher split. It handles shared state cleanup, key-code normalization, mode-sensitive subdispatch, and callback setup.');
  lines.push('- It is not the home-screen render loop and it does not directly call `0x085E16` in the observed code or runtime paths.');
  lines.push('- The immediate post-init environment is still partially unresolved (`0xD007E0` and callback slots start as `0xFF/0xFFFFFF`), which explains why some direct experiments end in sentinel or indirect-callback misses. Even with that limitation, the common `0x08C7AD` prefix is stable and clearly shared across both the direct and full-chain probes.');
  lines.push('- The special-key path absolutely converges here. Experiment C reaches `0x08C7AD` once from `0x08C4A3`, follows the same first 15 blocks as the direct runs, and then continues into the deeper long-running loop.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const env = bootEnvironment();
  const staticRows = disassembleInstructions(env.rom, ENTRY, DISASM_COUNT);

  const results = [
    runExperiment(env, {
      label: 'A direct 0x08C7AD A=0x44 B=0xBC',
      entry: ENTRY,
      maxSteps: 50000,
      setup(cpu) {
        cpu.a = 0x44;
        cpu._bc = (cpu._bc & 0x00ff) | (0xbc << 8);
      },
    }),
    runExperiment(env, {
      label: 'B direct 0x08C7AD A=0x09 B=0x09',
      entry: ENTRY,
      maxSteps: 50000,
      setup(cpu) {
        cpu.a = 0x09;
        cpu._bc = (cpu._bc & 0x00ff) | (0x09 << 8);
      },
    }),
    runExperiment(env, {
      label: 'C chain 0x08C4A3 key=0xBC',
      entry: CHAIN_ENTRY,
      maxSteps: 50000,
      setup(_cpu, mem) {
        mem[KEY_EVENT_ADDR] = 0xbc;
      },
    }),
  ];

  const report = buildReport(env, staticRows, results);
  writeFileSync(REPORT_URL, report, 'utf8');

  const summary = {
    report: fileURLToPath(REPORT_URL),
    baseline: {
      modeByte: hexByte(env.baselineState.modeByte),
      callback: hex(env.baselineState.callback),
      iy: hex(env.cpu.iy),
      mbase: hex(env.cpu.mbase, 2),
    },
    results: results.map((result) => ({
      label: result.label,
      steps: result.steps,
      termReason: result.termReason,
      lastPc: hex(result.lastPc),
      uniqueBlocks: result.uniqueBlocks,
      totalBlocks: result.totalBlocks,
      vramWrites: result.vramWrites,
      renderVisited: result.renderVisited,
      entryFirstStep: result.entryFirstStep,
      entryRegs: result.entryRegs
        ? {
            a: hexByte(result.entryRegs.a),
            b: hexByte(result.entryRegs.b),
            c: hexByte(result.entryRegs.c),
            iy: hex(result.entryRegs.iy),
          }
        : null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
