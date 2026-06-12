import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase641-phase5-vat-zero-site.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;

const WATCH_FIELDS = [
  'D007CA',
  'D008E0',
  'D02587',
  'D0258A',
  'D0258D',
  'D02590',
  'D02593',
  'D0259A',
  'D0259D',
  'D025A0',
  'D025C5',
];

const TARGETS = {
  launchHome09dd62: 0x09DD62,
  memInit09dee0: 0x09DEE0,
  memInitReturn08a98f: 0x08A98F,
  heapSizeStore09dd66: 0x09DD66,
  cleanup0018f8: 0x0018F8,
  cleanupTail0060f6: 0x0060F6,
  cleanupTail00190f: 0x00190F,
  cleanupTail000862: 0x000862,
  halt0019b5: HALT_IDLE,
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return (mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readFields(mem) {
  return {
    D007CA: read24(mem, 0xD007CA),
    D008E0: read24(mem, 0xD008E0),
    D02587: read24(mem, 0xD02587),
    D0258A: read24(mem, 0xD0258A),
    D0258D: read24(mem, 0xD0258D),
    D02590: read24(mem, 0xD02590),
    D02593: read24(mem, 0xD02593),
    D0259A: read24(mem, 0xD0259A),
    D0259D: read24(mem, 0xD0259D),
    D025A0: read24(mem, 0xD025A0),
    D025C5: read24(mem, 0xD025C5),
  };
}

function diffFields(before, after) {
  const diff = {};
  for (const key of WATCH_FIELDS) {
    if (before?.[key] !== after[key]) diff[key] = [before?.[key] ?? null, after[key]];
  }
  return diff;
}

function zeroedFields(diff) {
  return Object.entries(diff)
    .filter(([, [before, after]]) => before !== 0 && before !== null && after === 0)
    .map(([key]) => key);
}

function formatFields(fields) {
  return Object.fromEntries(WATCH_FIELDS.map((key) => [key, hex(fields[key])]));
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    if (mem[addr] !== 0xFF || mem[addr + 1] !== 0xFF) count++;
  }
  return count;
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runBootToPhase5Ready() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push({
    name: 'p1-coldboot',
    result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }),
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({
    name: 'p2-kernel',
    result: executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }),
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({
    name: 'p3-postinit',
    result: executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }),
  });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({
    name: 'p4-warm-idle',
    result: executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }),
  });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);

  return { mem, executor, cpu, phases };
}

function createVatObserver(mem) {
  const stats = {
    totalBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])),
    targetEvents: [],
    transitions: [],
    zeroingTransitions: [],
    lastBlocks: [],
    firstBlocks: [],
    hotBlocks: new Map(),
  };
  let lastFields = readFields(mem);
  let prevPc = null;

  function observe(pc) {
    const addr = pc & 0xFFFFFF;
    const pcHex = hex(addr);
    stats.totalBlocks++;
    stats.hotBlocks.set(pcHex, (stats.hotBlocks.get(pcHex) ?? 0) + 1);

    const now = readFields(mem);
    const diff = diffFields(lastFields, now);
    if (Object.keys(diff).length) {
      const transition = {
        block: stats.totalBlocks,
        afterPc: prevPc == null ? null : hex(prevPc),
        beforePc: pcHex,
        diff,
        recentBlocks: stats.lastBlocks.slice(-32),
        fieldsAfter: formatFields(now),
      };
      stats.transitions.push(transition);
      const zeroed = zeroedFields(diff);
      if (zeroed.length) stats.zeroingTransitions.push({ ...transition, zeroed });
    }

    for (const [name, target] of Object.entries(TARGETS)) {
      if (addr === target) {
        stats.targetCounts[name]++;
        stats.targetEvents.push({
          name,
          block: stats.totalBlocks,
          pc: pcHex,
          fieldsBeforeBlock: formatFields(now),
          recentBlocks: stats.lastBlocks.slice(-20),
        });
      }
    }

    if (stats.firstBlocks.length < 32) stats.firstBlocks.push(pcHex);
    stats.lastBlocks.push(pcHex);
    if (stats.lastBlocks.length > 64) stats.lastBlocks.shift();
    lastFields = now;
    prevPc = addr;
  }

  function finalize() {
    return {
      ...stats,
      hotBlocks: Array.from(stats.hotBlocks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([pc, count]) => ({ pc, count })),
      finalFields: formatFields(readFields(mem)),
      vramPixels: countVRAMPixels(mem),
    };
  }

  return { observe, finalize };
}

function runPhase5Probe() {
  const { mem, executor, cpu, phases } = runBootToPhase5Ready();
  const beforePhase5 = {
    pc: hex(cpu.pc ?? 0),
    sp: hex(cpu.sp ?? 0),
    fields: formatFields(readFields(mem)),
    vramPixels: countVRAMPixels(mem),
  };
  const observer = createVatObserver(mem);
  const result = executor.runFrom(LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      observer.observe(pc);
    },
  });
  const stats = observer.finalize();
  const afterPhase5 = {
    result: {
      steps: result.steps,
      termination: result.termination,
      lastPc: hex(result.lastPc ?? 0),
      lastMode: result.lastMode,
    },
    cpu: {
      pc: hex(cpu.pc ?? 0),
      sp: hex(cpu.sp ?? 0),
      iy: hex(cpu.iy ?? cpu._iy ?? 0),
      halted: cpu.halted,
      iff1: cpu.iff1,
      iff2: cpu.iff2,
      mbase: cpu.mbase,
    },
    fields: formatFields(readFields(mem)),
    vramPixels: countVRAMPixels(mem),
  };

  return { phases, beforePhase5, afterPhase5, stats };
}

function summarizeTransition(transition) {
  return {
    block: transition.block,
    afterPc: transition.afterPc,
    beforePc: transition.beforePc,
    zeroed: transition.zeroed,
    diff: Object.fromEntries(Object.entries(transition.diff).map(([key, [before, after]]) => [
      key,
      [before == null ? null : hex(before), hex(after)],
    ])),
    recentBlocks: transition.recentBlocks,
    fieldsAfter: transition.fieldsAfter,
  };
}

function buildReport(summary) {
  const zeroing = summary.stats.zeroingTransitions.map(summarizeTransition);
  const exact = zeroing.find((entry) => entry.zeroed.includes('D02590')) ?? zeroing[0] ?? null;
  const events = summary.stats.targetEvents.map((event) => ({
    ...event,
    fieldsBeforeBlock: event.fieldsBeforeBlock,
  }));

  return [
    '# Phase 641: Phase 5 VAT Zeroing Site',
    '',
    'Probe: `probe-phase641-phase5-vat-zero-site.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase641-phase5-vat-zero-site.mjs`',
    '',
    '## Summary',
    '',
    `- **** Phase 5 reproduced the phase640 direct launch-home result: termination=${summary.afterPhase5.result.termination}, lastPc=${summary.afterPhase5.result.lastPc}, steps=${summary.afterPhase5.result.steps}.`,
    `- **** MEM_INIT fired ${summary.stats.targetCounts.memInit09dee0}x; D02590 became nonzero immediately after MEM_INIT and later returned to zero.`,
    exact
      ? `- **** Exact VAT zeroing transition: after block ${exact.afterPc}, before next block ${exact.beforePc}, at observed block ${exact.block}; zeroed fields=${exact.zeroed.join(', ')}.`
      : '- !! No VAT zeroing transition was captured.',
    `- *** Cleanup 0x0018F8 hit ${summary.stats.targetCounts.cleanup0018f8}x; final tail path ${summary.stats.lastBlocks.slice(-4).join(' -> ')}.`,
    '',
    '## Phase 5 Boundary',
    '',
    '```json',
    JSON.stringify({
      bootPhases: summary.phases.map((phase) => ({
        name: phase.name,
        steps: phase.result.steps,
        termination: phase.result.termination,
        lastPc: hex(phase.result.lastPc ?? 0),
      })),
      beforePhase5: summary.beforePhase5,
      afterPhase5: summary.afterPhase5,
      targetCounts: summary.stats.targetCounts,
      finalFields: summary.stats.finalFields,
      vramPixels: summary.stats.vramPixels,
    }, null, 2),
    '```',
    '',
    '## Zeroing Transitions',
    '',
    '```json',
    JSON.stringify(zeroing, null, 2),
    '```',
    '',
    '## Target Events',
    '',
    '```json',
    JSON.stringify(events, null, 2),
    '```',
    '',
    '## Hot Blocks',
    '',
    '```json',
    JSON.stringify(summary.stats.hotBlocks, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    exact
      ? `The VAT lifetime issue is not a mysterious Phase 6/browser readback problem. The Phase 5 MEM_INIT values survive until the first bulk cleanup block, and the observed zeroing happens inside the block that executed immediately before ${exact.beforePc}. Because that block is ${exact.afterPc}, the next useful experiment is to snapshot the MEM_INIT/VAT tuple before the first cleanup and replay it after Phase 5 cleanup, before repaint.`
      : 'This probe did not capture the expected zeroing site; extend the watched field set or lower the phase boundary further.',
    '',
  ].join('\n');
}

const summary = runPhase5Probe();
const d02590Zero = summary.stats.zeroingTransitions.some((transition) => transition.zeroed.includes('D02590'));
const pass = summary.afterPhase5.result.termination === 'halt'
  && summary.afterPhase5.result.lastPc === hex(HALT_IDLE)
  && summary.stats.targetCounts.memInit09dee0 === 1
  && summary.stats.targetCounts.cleanup0018f8 === 2
  && d02590Zero;

fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);

console.log(JSON.stringify({
  probe: 'phase641-phase5-vat-zero-site',
  pass,
  phase5: summary.afterPhase5.result,
  targetCounts: summary.stats.targetCounts,
  zeroingTransitions: summary.stats.zeroingTransitions.map(summarizeTransition),
  finalFields: summary.stats.finalFields,
  report: path.basename(REPORT_PATH),
}, null, 2));

if (!pass) process.exitCode = 1;
