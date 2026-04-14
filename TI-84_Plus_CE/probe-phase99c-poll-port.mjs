#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase99c-poll-port-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const POLL_ENTRY = 0x006138;
const POLL_SECOND_BLOCK_ENTRY = 0x00613E;
const POLL_SECOND_READ_PC = 0x00613F;
const POLL_EXIT_BLOCK = 0x006145;
const POLL_STACK_RETURN = 0xFFFFFF;
const POLL_BC = 0x00D00D;
const POLL_PORT = POLL_BC & 0xFFFF;
const POLL_PORT_MINUS_ONE = (POLL_BC & 0xFF00) | (((POLL_BC & 0xFF) - 1) & 0xFF);

const POLL_MAX_STEPS = 200;
const POLL_MAX_LOOP_ITERATIONS = 512;
const TRACE_LIMIT = 50;

const LEGACY_STUCK_VALUE = 0xFF;
const BREAK_VALUE = 0x00;

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(address, mode = 'adl') {
  return `${address.toString(16).padStart(6, '0')}:${mode}`;
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  const initResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { bootResult, initResult, postInitResult };
}

function seedPollFrame(cpu, mem) {
  cpu.madl = 1;
  cpu.bc = POLL_BC;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 6;
  mem.fill(0xFF, cpu.sp, 6);
  cpu.write24(cpu.sp, 0x000000);
  cpu.write24(cpu.sp + 3, POLL_STACK_RETURN);
}

function getEffectiveReadPc(currentBlockPc) {
  if (currentBlockPc === POLL_SECOND_BLOCK_ENTRY) {
    return POLL_SECOND_READ_PC;
  }

  return currentBlockPc;
}

function installReadTrace(peripherals) {
  const state = {
    enabled: false,
    label: 'idle',
    currentBlockPc: null,
    currentMode: null,
    entries: [],
  };

  const originalRead = peripherals.read.bind(peripherals);

  peripherals.read = (port) => {
    const value = originalRead(port);

    if (!state.enabled || state.entries.length >= TRACE_LIMIT) {
      return value;
    }

    const blockPc = state.currentBlockPc ?? null;
    const readPc = getEffectiveReadPc(blockPc);
    const entry = {
      index: state.entries.length + 1,
      label: state.label,
      blockPc,
      pc: readPc,
      mode: state.currentMode ?? 'n/a',
      port: port & 0xFFFF,
      value: value & 0xFF,
    };

    state.entries.push(entry);
    console.log(
      `[trace:${state.label}] #${entry.index} pc=${hex(entry.pc, 6)} block=${hex(entry.blockPc, 6)} port=${hex(entry.port, 4)} => ${hex(entry.value, 2)}`,
    );

    return value;
  };

  return {
    state,
    originalRead,
  };
}

function createConstantReadHandler(value) {
  return {
    read() {
      return value;
    },
    write() {},
  };
}

function summarizeVisits(result) {
  const visits = result.blockVisits ?? {};
  const keys = [
    blockKey(POLL_ENTRY),
    blockKey(POLL_SECOND_BLOCK_ENTRY),
    blockKey(POLL_SECOND_READ_PC),
    blockKey(POLL_EXIT_BLOCK),
  ];

  return keys
    .map((key) => `${key}=${visits[key] ?? 0}`)
    .join(', ');
}

function pickFirstRead(entries, pc) {
  return entries.find((entry) => entry.pc === pc) ?? null;
}

function renderTraceTable(entries) {
  const lines = [];
  lines.push('| # | pc | block | port | value |');
  lines.push('|---:|---|---|---|---|');

  for (const entry of entries) {
    lines.push(
      `| ${entry.index} | \`${hex(entry.pc, 6)}\` | \`${hex(entry.blockPc, 6)}\` | \`${hex(entry.port, 4)}\` | \`${hex(entry.value, 2)}\` |`,
    );
  }

  return lines;
}

function renderScenarioTableRow(name, scenario) {
  return `| ${name} | \`${scenario.portValueHex}\` | \`${scenario.prevPortValueHex}\` | ${scenario.result.steps} | \`${scenario.result.termination}\` | \`${hex(scenario.result.lastPc, 6)}\` | \`${scenario.firstMainRead?.portHex ?? 'n/a'}\` | \`${scenario.firstPrevRead?.portHex ?? 'n/a'}\` | \`${scenario.visitSummary}\` |`;
}

function buildReport(setup, legacyScenario, patchedScenario) {
  const lines = [];
  lines.push('# Phase 99C - 0x006138 Poll Port Probe');
  lines.push('');
  lines.push('Generated by `probe-phase99c-poll-port.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Boot: \`steps=${setup.bootResult.steps} termination=${setup.bootResult.termination} lastPc=${hex(setup.bootResult.lastPc, 6)}\``);
  lines.push(`- OS init: \`steps=${setup.initResult.steps} termination=${setup.initResult.termination} lastPc=${hex(setup.initResult.lastPc, 6)}\``);
  lines.push(`- Post-init: \`steps=${setup.postInitResult.steps} termination=${setup.postInitResult.termination} lastPc=${hex(setup.postInitResult.lastPc, 6)}\``);
  lines.push(`- Probe entry: \`${hex(POLL_ENTRY, 6)}\` (ADL)`);
  lines.push(`- Lifted predecessor \`0x006133\` seeds \`BC = ${hex(POLL_BC, 6)}\`, so the poll pair is \`${hex(POLL_PORT, 4)}\` then \`${hex(POLL_PORT_MINUS_ONE, 4)}\`.`);
  lines.push('');
  lines.push('## Port Summary');
  lines.push('');
  lines.push('| port role | port | legacy/default value | current bus value | loop break requirement | proposed fix |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| first \`IN A,(C)\` at \`0x006138\` | \`${hex(POLL_PORT, 4)}\` | \`${legacyScenario.portValueHex}\` | \`${patchedScenario.portValueHex}\` | \`A & 0xF0 == 0\` | \`${hex(BREAK_VALUE, 2)}\` |`);
  lines.push(`| second \`IN A,(C)\` at \`0x00613F\` | \`${hex(POLL_PORT_MINUS_ONE, 4)}\` | \`${legacyScenario.prevPortValueHex}\` | \`${patchedScenario.prevPortValueHex}\` | \`A & 0x04 == 0\` | \`${hex(BREAK_VALUE, 2)}\` |`);
  lines.push('');
  lines.push('## Before / After');
  lines.push('');
  lines.push('| scenario | port BC | port BC-1 | steps | termination | lastPc | first main read | first BC-1 read | block visits |');
  lines.push('|---|---|---|---:|---|---|---|---|---|');
  lines.push(renderScenarioTableRow('legacy default override', legacyScenario));
  lines.push(renderScenarioTableRow('patched bus', patchedScenario));
  lines.push('');
  lines.push('## Trace Excerpts');
  lines.push('');
  lines.push('### Legacy Default Override');
  lines.push('');
  lines.push(...renderTraceTable(legacyScenario.entries));
  lines.push('');
  lines.push('### Patched Bus');
  lines.push('');
  lines.push(...renderTraceTable(patchedScenario.entries));
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push(`- Legacy/default behavior pins both probe ports high at \`${hex(LEGACY_STUCK_VALUE, 2)}\`, which keeps \`0x006138\` and \`0x00613F\` in their polling loops.`);
  lines.push(`- The narrow fix is to return \`${hex(BREAK_VALUE, 2)}\` from ports \`${hex(POLL_PORT, 4)}\` and \`${hex(POLL_PORT_MINUS_ONE, 4)}\`. That clears the high nibble for the first loop and clears bit 2 for the second.`);
  lines.push(`- A successful patched run should visit \`${hex(POLL_EXIT_BLOCK, 6)}\` and avoid terminating on the poll blocks themselves.`);
  lines.push('');
  lines.push('## Regression');
  lines.push('');
  lines.push('- Run `node probe-phase99d-home-verify.mjs` separately to confirm the `Normal/Float/Radian` golden regression remains `PASS 26/26`.');
  return `${lines.join('\n')}\n`;
}

function normalizeScenario(label, directValues, result, entries) {
  const firstMainRead = pickFirstRead(entries, POLL_ENTRY);
  const firstPrevRead = pickFirstRead(entries, POLL_SECOND_READ_PC);

  return {
    label,
    portValue: directValues.portValue,
    prevPortValue: directValues.prevPortValue,
    portValueHex: hex(directValues.portValue, 2),
    prevPortValueHex: hex(directValues.prevPortValue, 2),
    result,
    entries,
    firstMainRead: firstMainRead && {
      ...firstMainRead,
      portHex: hex(firstMainRead.port, 4),
      valueHex: hex(firstMainRead.value, 2),
    },
    firstPrevRead: firstPrevRead && {
      ...firstPrevRead,
      portHex: hex(firstPrevRead.port, 4),
      valueHex: hex(firstPrevRead.value, 2),
    },
    visitSummary: summarizeVisits(result),
  };
}

function runScenario(label, options = {}) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });

  if (options.overrideWithLegacyDefault === true) {
    const legacyHandler = createConstantReadHandler(LEGACY_STUCK_VALUE);
    peripherals.register(POLL_PORT, legacyHandler);
    peripherals.register(POLL_PORT_MINUS_ONE, legacyHandler);
  }

  const tracer = installReadTrace(peripherals);
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const setup = coldBoot(executor, cpu, mem);

  seedPollFrame(cpu, mem);

  const directValues = {
    portValue: tracer.originalRead(POLL_PORT) & 0xFF,
    prevPortValue: tracer.originalRead(POLL_PORT_MINUS_ONE) & 0xFF,
  };

  tracer.state.entries.length = 0;
  tracer.state.enabled = true;
  tracer.state.label = label;
  tracer.state.currentBlockPc = POLL_ENTRY;
  tracer.state.currentMode = 'adl';

  const result = executor.runFrom(POLL_ENTRY, 'adl', {
    maxSteps: POLL_MAX_STEPS,
    maxLoopIterations: POLL_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode) {
      tracer.state.currentBlockPc = pc;
      tracer.state.currentMode = mode;
    },
  });

  tracer.state.enabled = false;

  return {
    setup,
    scenario: normalizeScenario(label, directValues, result, [...tracer.state.entries]),
  };
}

async function main() {
  console.log('=== Phase 99C - 0x006138 Poll Port Probe ===');
  console.log(`poll ports: bc=${hex(POLL_PORT, 4)} bc-1=${hex(POLL_PORT_MINUS_ONE, 4)} bcSeed=${hex(POLL_BC, 6)}`);

  const legacyRun = runScenario('legacy-default', { overrideWithLegacyDefault: true });
  const patchedRun = runScenario('patched-bus');

  const report = buildReport(legacyRun.setup, legacyRun.scenario, patchedRun.scenario);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(`legacy: termination=${legacyRun.scenario.result.termination} lastPc=${hex(legacyRun.scenario.result.lastPc, 6)} visits=${legacyRun.scenario.visitSummary}`);
  console.log(`patched: termination=${patchedRun.scenario.result.termination} lastPc=${hex(patchedRun.scenario.result.lastPc, 6)} visits=${patchedRun.scenario.visitSummary}`);
  console.log(`report: ${REPORT_PATH}`);
}

main().catch((error) => {
  const message = error.stack || String(error);
  console.error(message);
  fs.writeFileSync(
    REPORT_PATH,
    `# Phase 99C - 0x006138 Poll Port Probe\n\nGenerated by \`probe-phase99c-poll-port.mjs\`.\n\n## Failure\n\n\`\`\`text\n${message}\n\`\`\`\n`,
    'utf8',
  );
  process.exitCode = 1;
});
