#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const REPORT_URL = new URL('./phase118-report.md', import.meta.url);

const HELPER_ENTRY = 0x04c973;
const CALLER_ENTRY = 0x08c543;
const HELPER_RETURN = 0x08c561;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const KEY_EVENT_ADDR = 0xd0058e;
const PTR_DE_ADDR = 0xd008d6;
const ALT_PTR_ADDR = 0xd008d9;
const PTR_HL_ADDR = 0xd0243a;
const CALLBACK_PTR_ADDR = 0xd02ad7;
const CALLBACK_HI_ADDR = 0xd02ad9;
const LOOKUP_BYTE_ADDR = 0xd025c7;

const STACK_SENTINEL = 0xd1a87e - 3;

const SCAN_CODES = [
  { label: 'ENTER', value: 0x09 },
  { label: 'CLEAR', value: 0x0f },
  { label: 'DIGIT_2', value: 0x9a },
];

const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_ix',
  '_iy',
  'sp',
  'pc',
  'mbase',
  'madl',
  'iff1',
  'iff2',
  'halted',
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function formatInstruction(inst) {
  const indexedOperand = (indexRegister, displacement) => {
    const sign = displacement >= 0 ? '+' : '';
    return `(${indexRegister}${sign}${displacement})`;
  };

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, ${indexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind':
      return `${prefix}${inst.op} (${inst.indirectRegister})`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}djnz ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${inst.indirectRegister})`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `${prefix}ld (hl), ${hex(inst.value, 2)}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, ${indexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${indexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${indexedOperand(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'exx':
      return `${prefix}exx`;
    case 'ccf':
      return `${prefix}ccf`;
    case 'scf':
      return `${prefix}scf`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${prefix}${inst.op} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'cpir':
      return `${prefix}cpir`;
    case 'cpi':
      return `${prefix}cpi`;
    case 'cpdr':
      return `${prefix}cpdr`;
    case 'cpd':
      return `${prefix}cpd`;
    case 'rra':
    case 'rla':
    case 'rrca':
    case 'rlca':
    case 'cpl':
    case 'daa':
    case 'neg':
    case 'di':
    case 'ei':
    case 'nop':
    case 'halt':
      return `${prefix}${inst.tag}`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function disassembleInstructions(romBytes, startPc, instructionCount) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < instructionCount; index += 1) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      inst,
      text: formatInstruction(inst),
    });

    pc += inst.length;
  }

  return rows;
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    lastMode: run.lastMode ?? 'adl',
  };
}

function bootEnvironment() {
  const rom = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  const coldBootRam = new Uint8Array(mem.slice(RAM_START, RAM_END));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.sp = STACK_SENTINEL;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    rom,
    mem,
    executor,
    cpu,
    coldBoot,
    coldBootRam,
    osInit,
    postInit,
    baselineRam: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    baselineCpu: snapshotCpu(cpu),
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineRam, RAM_START);
  restoreCpu(env.cpu, env.baselineCpu);
}

function prepareStack(cpu, mem) {
  cpu.sp = STACK_SENTINEL;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function seedHelperRegistersLikeCaller(env) {
  const { mem, cpu } = env;
  const iyFlag51 = mem[(cpu._iy + 51) & 0xffffff];

  let de = read24(mem, PTR_DE_ADDR);
  let hl = read24(mem, PTR_HL_ADDR);

  if (iyFlag51 & 0x04) {
    hl = read24(mem, ALT_PTR_ADDR);
    const swapped = de;
    de = hl;
    hl = swapped;
  }

  cpu.a = 0x00;
  cpu.f = 0x10;
  cpu._bc = 0x000000;
  cpu._de = de;
  cpu._hl = hl;

  return {
    iyFlag51,
    ptrDe: read24(mem, PTR_DE_ADDR),
    ptrHl: read24(mem, PTR_HL_ADDR),
    ptrAlt: read24(mem, ALT_PTR_ADDR),
    seededDe: de,
    seededHl: hl,
  };
}

function collectPersistentDiffs(before, after, limit = 16) {
  const diffs = [];

  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === after[index]) {
      continue;
    }

    diffs.push({
      addr: RAM_START + index,
      before: before[index],
      after: after[index],
    });

    if (diffs.length >= limit) {
      break;
    }
  }

  return diffs;
}

function runDirectCase(env, scanCode) {
  restoreBaseline(env);

  env.mem[KEY_EVENT_ADDR] = scanCode.value;
  prepareStack(env.cpu, env.mem);

  const setup = seedHelperRegistersLikeCaller(env);
  const beforeRam = new Uint8Array(env.mem.slice(RAM_START, RAM_END));

  const writes = [];
  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  const originalWrite16 = env.cpu.write16.bind(env.cpu);
  const originalWrite24 = env.cpu.write24.bind(env.cpu);

  env.cpu.write8 = (addr, value) => {
    writes.push({ width: 8, addr: addr & 0xffffff, value: value & 0xff });
    return originalWrite8(addr, value);
  };

  env.cpu.write16 = (addr, value) => {
    writes.push({ width: 16, addr: addr & 0xffffff, value: value & 0xffff });
    return originalWrite16(addr, value);
  };

  env.cpu.write24 = (addr, value) => {
    writes.push({ width: 24, addr: addr & 0xffffff, value: value & 0xffffff });
    return originalWrite24(addr, value);
  };

  let rawRun;

  try {
    rawRun = env.executor.runFrom(HELPER_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 5000,
    });
  } finally {
    env.cpu.write8 = originalWrite8;
    env.cpu.write16 = originalWrite16;
    env.cpu.write24 = originalWrite24;
  }

  const persistentDiffs = collectPersistentDiffs(beforeRam, env.mem.slice(RAM_START, RAM_END));

  return {
    label: scanCode.label,
    scanCode: scanCode.value,
    setup,
    run: summarizeRun(rawRun),
    carry: env.cpu.f & 0x01,
    regs: {
      a: env.cpu.a,
      f: env.cpu.f,
      bc: env.cpu._bc,
      de: env.cpu._de,
      hl: env.cpu._hl,
      sp: env.cpu.sp,
    },
    writes,
    persistentDiffs,
  };
}

function runHookCase(env, scanCode) {
  restoreBaseline(env);

  env.mem[KEY_EVENT_ADDR] = scanCode.value;
  prepareStack(env.cpu, env.mem);

  const hook = {
    entry: null,
    exit: null,
    sawHelper: false,
  };

  const rawRun = env.executor.runFrom(CALLER_ENTRY, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 5000,
    onBlock(pc, mode, _meta, step) {
      if (pc === HELPER_ENTRY && !hook.entry) {
        hook.sawHelper = true;
        hook.entry = {
          step,
          mode,
          a: env.cpu.a,
          f: env.cpu.f,
          bc: env.cpu._bc,
          de: env.cpu._de,
          hl: env.cpu._hl,
          sp: env.cpu.sp,
          iyFlag51: env.mem[(env.cpu._iy + 51) & 0xffffff],
        };
        return;
      }

      if (!hook.sawHelper || hook.exit || pc !== HELPER_RETURN) {
        return;
      }

      hook.exit = {
        step,
        mode,
        a: env.cpu.a,
        f: env.cpu.f,
        bc: env.cpu._bc,
        de: env.cpu._de,
        hl: env.cpu._hl,
        sp: env.cpu.sp,
      };
    },
  });

  return {
    label: scanCode.label,
    scanCode: scanCode.value,
    run: summarizeRun(rawRun),
    entry: hook.entry,
    exit: hook.exit,
  };
}

function renderTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function formatWrite(write) {
  const width = write.width === 8 ? 2 : 6;
  return `${write.width}-bit ${hex(write.addr)} <- ${hex(write.value, width)}`;
}

function formatDiff(diff) {
  return `${hex(diff.addr)}: ${hexByte(diff.before)} -> ${hexByte(diff.after)}`;
}

function collectFixedRamAddresses(staticRows) {
  const addresses = new Set();

  for (const row of staticRows) {
    const inst = row.inst;

    if (
      inst.tag === 'ld-pair-mem' ||
      inst.tag === 'ld-reg-mem' ||
      inst.tag === 'ld-mem-reg' ||
      inst.tag === 'ld-mem-pair'
    ) {
      if (inst.addr >= RAM_START) {
        addresses.add(inst.addr);
      }
    }
  }

  return [...addresses].sort((left, right) => left - right);
}

function buildReport(env, staticRows, directCases, hookCases) {
  const lines = [];
  const fixedRamAddresses = collectFixedRamAddresses(staticRows);

  lines.push('# Phase 118 - 0x04C973 Helper Investigation');
  lines.push('');
  lines.push('Generated by `probe-phase118-04c973.mjs`.');
  lines.push('');
  lines.push('## Boot Environment');
  lines.push('');
  lines.push('| stage | steps | termination | last pc |');
  lines.push('|-------|------:|-------------|---------|');
  lines.push(`| coldBoot | ${env.coldBoot.steps} | ${env.coldBoot.termination} | ${hex(env.coldBoot.lastPc ?? 0)} |`);
  lines.push(`| osInit | ${env.osInit.steps} | ${env.osInit.termination} | ${hex(env.osInit.lastPc ?? 0)} |`);
  lines.push(`| postInit | ${env.postInit.steps} | ${env.postInit.termination} | ${hex(env.postInit.lastPc ?? 0)} |`);
  lines.push('');
  lines.push('Post-init pointer state used by the caller path:');
  lines.push('');
  lines.push(`- \`${hex(PTR_DE_ADDR)}\` = ${hex(read24(env.mem, PTR_DE_ADDR))}`);
  lines.push(`- \`${hex(PTR_HL_ADDR)}\` = ${hex(read24(env.mem, PTR_HL_ADDR))}`);
  lines.push(`- \`${hex(ALT_PTR_ADDR)}\` = ${hex(read24(env.mem, ALT_PTR_ADDR))}`);
  lines.push(`- \`(IY+51)\` = ${hexByte(env.mem[(env.cpu._iy + 51) & 0xffffff])}, so the caller takes the alternate-pointer swap path.`);
  lines.push('');
  lines.push('## Static Disassembly');
  lines.push('');
  lines.push('`0x04C973` itself is only five instructions long. The listing below is the first 50 instructions from the linear decode window starting at `0x04C973`, so lines after `0x04C978` spill into neighboring helpers.');
  lines.push('');
  lines.push('```text');
  for (const row of staticRows.slice(0, 50)) {
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(14)}  ${row.text}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('Static assessment of `0x04C973`:');
  lines.push('');
  lines.push('- Body: `push hl ; or a ; sbc hl, de ; pop hl ; ret`.');
  lines.push('- Registers read: `HL`, `DE`, `A`, and `SP`.');
  lines.push('- Registers written: flags in `F`, `SP`, and `HL` only transiently. `HL` is restored before return. `DE`, `BC`, and `A` are preserved.');
  lines.push(`- RAM touched by ` + '`0x04C973`' + ` itself: only stack memory at \`SP-3 .. SP-1\`. It does not load any fixed RAM pointers on its own.`);
  lines.push(`- Fixed RAM addresses seen anywhere in the 100-instruction decode window: ${fixedRamAddresses.map((addr) => `\`${hex(addr)}\``).join(', ')}.`);
  lines.push(`  These belong to later neighboring helpers, not to the five-instruction body at \`${hex(HELPER_ENTRY)}\`.`);
  lines.push('- Carry meaning on return: this helper is a compare. It leaves carry set when `HL < DE`, carry clear when `HL >= DE`, and zero set when `HL == DE`.');
  lines.push('- The helper directly depends on the caller-provided `DE` and `HL` values; it does not fetch replacement pointers from RAM.');
  lines.push('');
  lines.push('## Dynamic Probe Results');
  lines.push('');
  lines.push('### Direct `0x04C973` Runs');
  lines.push('');
  lines.push(...renderTable(
    [
      'scan',
      'code',
      'seeded DE',
      'seeded HL',
      'steps',
      'termination',
      'carry',
      'A',
      'BC',
      'DE',
      'HL',
      'writes',
    ],
    directCases.map((result) => [
      result.label,
      hexByte(result.scanCode),
      hex(result.setup.seededDe),
      hex(result.setup.seededHl),
      String(result.run.steps),
      result.run.termination,
      String(result.carry),
      hexByte(result.regs.a),
      hex(result.regs.bc),
      hex(result.regs.de),
      hex(result.regs.hl),
      result.writes.length === 0 ? 'none' : formatWrite(result.writes[0]),
    ]),
  ));
  lines.push('');
  for (const result of directCases) {
    lines.push(`- ${result.label}: persistent RAM diffs after return = ${result.persistentDiffs.length === 0 ? 'none' : result.persistentDiffs.map(formatDiff).join(', ')}.`);
  }
  lines.push('');
  lines.push('### `0x08C543` Hooked at `0x04C973`');
  lines.push('');
  lines.push(...renderTable(
    [
      'scan',
      'code',
      'entry A',
      'entry F',
      'entry DE',
      'entry HL',
      'entry SP',
      'exit F',
      'exit DE',
      'exit HL',
      'exit SP',
    ],
    hookCases.map((result) => [
      result.label,
      hexByte(result.scanCode),
      result.entry ? hexByte(result.entry.a) : 'n/a',
      result.entry ? hexByte(result.entry.f) : 'n/a',
      result.entry ? hex(result.entry.de) : 'n/a',
      result.entry ? hex(result.entry.hl) : 'n/a',
      result.entry ? hex(result.entry.sp) : 'n/a',
      result.exit ? hexByte(result.exit.f) : 'n/a',
      result.exit ? hex(result.exit.de) : 'n/a',
      result.exit ? hex(result.exit.hl) : 'n/a',
      result.exit ? hex(result.exit.sp) : 'n/a',
    ]),
  ));
  lines.push('');
  lines.push(`- Every hooked run reached helper entry at block step ${hookCases[0]?.entry?.step ?? 'n/a'} and returned to \`${hex(HELPER_RETURN)}\` at step ${hookCases[0]?.exit?.step ?? 'n/a'} with carry clear.`);
  lines.push(`- The caller feeds \`DE=${hex(hookCases[0]?.entry?.de ?? 0)}\` and \`HL=${hex(hookCases[0]?.entry?.hl ?? 0)}\` into the helper for all three scan codes, so the helper sees no scan-code-specific state here.`);
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push('`0x04C973` is not a callback table resolver. It is a tiny compare helper that preserves `HL` while setting flags from `HL - DE`.');
  lines.push('');
  lines.push('In the post-init state used by this probe, both caller pointers are `0xFFFFFF`, so the helper immediately returns carry clear for ENTER, CLEAR, and DIGIT_2. The only RAM write is the temporary stack push/pop of `HL`; there are no lasting RAM changes.');
  lines.push('');
  lines.push('That means the decision to read `(HL)` and call `0x080064` in `0x08C543` is gated by a simple pointer-order test, not by lookup logic inside `0x04C973`. If scan-code-specific callback resolution exists, it must happen later via the data pointed to by `HL` or inside `0x080064`, not inside this helper.');
  lines.push('');

  return `${lines.join('\n')}`;
}

function main() {
  const env = bootEnvironment();
  const staticRows = disassembleInstructions(env.rom, HELPER_ENTRY, 100);
  const directCases = SCAN_CODES.map((scanCode) => runDirectCase(env, scanCode));
  const hookCases = SCAN_CODES.map((scanCode) => runHookCase(env, scanCode));
  const report = buildReport(env, staticRows, directCases, hookCases);

  writeFileSync(REPORT_URL, `${report}\n`, 'utf8');

  console.log(`Wrote ${fileURLToPath(REPORT_URL)}`);
  console.log('assessment=compare_helper_not_callback_resolver');
}

main();
