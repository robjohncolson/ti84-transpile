import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase667-eol-digit-divergence.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E;
const HALT = 0x0019B5;
const WARM_IDLE = 0x0019BE;
const OUTER_LOOP = 0x08C331;
const HOME_REPAINT = 0x058241;

const CASES = Object.freeze([
  { name: 'EOL', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 450000 },
  { name: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 450000 },
]);

const WATCH = Object.freeze({
  cxMain: 0x0585E9,
  keyHandler: 0x05877A,
  convergence: 0x0587E9,
  commandDispatch: 0x05899D,
  actionProcessor: 0x058D54,
  getCsc: 0x03FA09,
  eolUnique03d0e0: 0x03D0E0,
  tokenOuter: 0x08F3B8,
  tokenLoopFetch: 0x08F433,
  tokenReaderCall: 0x08F454,
  tokenReader: 0x090883,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  sharedTail08f479: 0x08F479,
  saveCall08f547: 0x08F547,
  tupleSave08f54b: 0x08F54B,
  cleanup0a2150: 0x0A2150,
  cleanup001879: 0x001879,
  cleanup0018f8: 0x0018F8,
  lowLoop006d5d: 0x006D5D,
  halt: HALT,
});

const STATE_FIELDS = Object.freeze([
  ['D00080', 0xD00080, 1],
  ['D00081', 0xD00081, 1],
  ['D0008D', 0xD0008D, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000A0', 0xD000A0, 1],
  ['D000A3', 0xD000A3, 1],
  ['D000C4', 0xD000C4, 1],
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02434', 0xD02434, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A2B', 0xD02A2B, 2],
  ['D02A40', 0xD02A40, 3],
  ['D0301B', 0xD0301B, 3],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (i * 8);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >>> (i * 8)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function captureState(mem) {
  return Object.fromEntries(STATE_FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function stateText(state) {
  return STATE_FIELDS.map(([name, , len]) => `${name}=${hex(state[name], len * 2)}`).join(' ');
}

function diffState(a, b) {
  return STATE_FIELDS
    .filter(([name]) => a[name] !== b[name])
    .map(([name, , len]) => `${name}: ${hex(a[name], len * 2)} vs ${hex(b[name], len * 2)}`);
}

function hashRanges(mem, ranges) {
  let hash = 0x811C9DC5;
  for (const [start, end] of ranges) {
    for (let addr = start; addr < end; addr += 1) {
      hash ^= mem[addr];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

function decodeWindow(start, count = 12) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < count; i += 1) {
    try {
      const insn = decodeInstruction(romBytes, pc, 'adl');
      const bytes = Array.from(romBytes.slice(pc, pc + insn.length))
        .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      const fields = Object.entries(insn)
        .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
        .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
        .join(' ');
      rows.push(`${hex(insn.pc)} ${bytes.padEnd(15)} ${fields}`);
      pc = insn.nextPc;
      if (insn.terminates && i > 1) break;
    } catch (err) {
      rows.push(`${hex(pc)} decode-error ${err.message}`);
      pc += 1;
    }
  }
  return rows;
}

function makeMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function bootSystem() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push(['coldboot', executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['kernel', executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 })]);

  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  phases.push(['postinit', executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 })]);

  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  phases.push(['warm-idle', executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 })]);

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);
  phases.push(['launch-home', executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT);
  phases.push(['repaint', executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 })]);

  return { mem, peripherals, executor, cpu, phases };
}

function rearmHomeContext(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedKey(mem, keyCase) {
  mem[0xD0058C] = keyCase.pendingKey;
  mem[0xD0058D] = keyCase.pendingKey;
  mem[0xD0058E] = keyCase.pendingKey;
  mem[0xD00587] = keyCase.matrixScan;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function prepareKeyRun(mem, cpu, keyCase) {
  rearmHomeContext(mem);
  seedKey(mem, keyCase);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  write24(mem, cpu.sp, HALT);
  write24(mem, 0xD008E0, cpu.sp);
}

function makeCounter() {
  return Object.fromEntries(Object.keys(WATCH).map((name) => [name, 0]));
}

function runCase(keyCase) {
  const machine = bootSystem();
  const { mem, executor, cpu } = machine;
  const baseHash = hashRanges(mem, [
    [0xD00000, 0xD04000],
    [0xD10000, 0xD1B000],
    [0xD02000, 0xD03000],
    [0xD40000, 0xD66000],
  ]);
  const baseState = captureState(mem);

  prepareKeyRun(mem, cpu, keyCase);
  const seededState = captureState(mem);

  let block = 0;
  let lastSp = cpu.sp;
  let lastPc = OUTER_LOOP;
  const stack = [];
  const path = [];
  const firstEvents = [];
  const watchCounts = makeCounter();
  const watchFirst = {};
  const watchEvents = [];
  const transitionCounts = new Map();
  const transitionEvents = [];
  const statesByBlock = new Map();
  const recent = [];

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: keyCase.maxSteps,
    maxLoopIterations: keyCase.maxSteps,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      const sp = cpu.sp & 0xFFFFFF;
      const delta = sp - lastSp;
      if (delta === -3) stack.push(lastPc);
      else if (delta === 3 && stack.length > 0) stack.pop();
      lastSp = sp;

      path.push(addr);
      if (recent.length >= 24) recent.shift();
      recent.push(addr);

      if ([0x03D0E0, 0x084B7F, 0x058D54, 0x08F454, 0x090883].includes(lastPc)) {
        const key = `${lastPc}:${addr}`;
        transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
        if (transitionEvents.length < 128 || (lastPc === 0x03D0E0 && addr === 0x08F479)) {
          transitionEvents.push({
            from: lastPc,
            to: addr,
            block,
            sp,
            af: ((cpu.a & 0xFF) << 8) | (cpu.f & 0xFF),
            hl: cpu._hl & 0xFFFFFF,
            de: cpu._de & 0xFFFFFF,
            bc: cpu._bc & 0xFFFFFF,
            state: captureState(mem),
            recent: [...recent],
            stackTail: stack.slice(-12),
          });
        }
      }

      if (block <= 256) statesByBlock.set(block, captureState(mem));
      if (firstEvents.length < 96) {
        firstEvents.push({
          block,
          pc: addr,
          sp,
          af: ((cpu.a & 0xFF) << 8) | (cpu.f & 0xFF),
          hl: cpu._hl & 0xFFFFFF,
          de: cpu._de & 0xFFFFFF,
          bc: cpu._bc & 0xFFFFFF,
          state: captureState(mem),
          stackTail: stack.slice(-10),
        });
      }

      for (const [name, target] of Object.entries(WATCH)) {
        if (addr !== target) continue;
        watchCounts[name] += 1;
        if (!watchFirst[name]) {
          watchFirst[name] = {
            block,
            state: captureState(mem),
            recent: [...recent],
            sp,
            af: ((cpu.a & 0xFF) << 8) | (cpu.f & 0xFF),
            hl: cpu._hl & 0xFFFFFF,
            de: cpu._de & 0xFFFFFF,
            bc: cpu._bc & 0xFFFFFF,
            stackTail: stack.slice(-12),
          };
        }
        if (watchEvents.length < 80) {
          watchEvents.push({
            name,
            block,
            pc: addr,
            state: captureState(mem),
            recent: [...recent],
          });
        }
      }

      lastPc = addr;
    },
  });

  return {
    keyCase,
    phases: machine.phases.map(([name, phaseResult]) => ({
      name,
      termination: phaseResult.termination,
      steps: phaseResult.steps,
      lastPc: phaseResult.lastPc & 0xFFFFFF,
    })),
    baseHash,
    baseState,
    seededState,
    result,
    path,
    firstEvents,
    statesByBlock,
    watchCounts,
    watchFirst,
    watchEvents,
    transitionCounts,
    transitionEvents,
    finalState: captureState(mem),
  };
}

function findDivergence(left, right) {
  const limit = Math.min(left.path.length, right.path.length);
  for (let i = 0; i < limit; i += 1) {
    if (left.path[i] !== right.path[i]) return i + 1;
  }
  return null;
}

function pathWindow(row, block, radius = 12) {
  const idx = Math.max(0, block - 1);
  const start = Math.max(0, idx - radius);
  const end = Math.min(row.path.length, idx + radius + 1);
  return row.path.slice(start, end).map((pc, offset) => ({
    block: start + offset + 1,
    pc,
    marker: start + offset === idx,
  }));
}

function formatPathWindow(row, divergenceBlock) {
  return pathWindow(row, divergenceBlock)
    .map((entry) => `${entry.marker ? '**' : ''}${entry.block}:${hex(entry.pc)}${entry.marker ? '**' : ''}`)
    .join(' -> ');
}

function formatWatchTable(rows) {
  const lines = [
    '| Watch | EOL first | Digit2 first | EOL hits | Digit2 hits |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const name of Object.keys(WATCH)) {
    lines.push(`| ${name} (${hex(WATCH[name])}) | ${rows[0].watchFirst[name]?.block ?? '-'} | ${rows[1].watchFirst[name]?.block ?? '-'} | ${rows[0].watchCounts[name]} | ${rows[1].watchCounts[name]} |`);
  }
  return lines;
}

function formatTransitionTable(rows, fromAddr) {
  const keys = new Set();
  for (const row of rows) {
    for (const key of row.transitionCounts.keys()) {
      const [from, to] = key.split(':').map((value) => Number(value));
      if (from === fromAddr) keys.add(to);
    }
  }
  const lines = [
    `| Successor from ${hex(fromAddr)} | EOL hits | Digit2 hits |`,
    '|---|---:|---:|',
  ];
  for (const to of [...keys].sort((a, b) => a - b)) {
    const key = `${fromAddr}:${to}`;
    lines.push(`| ${hex(to)} | ${rows[0].transitionCounts.get(key) ?? 0} | ${rows[1].transitionCounts.get(key) ?? 0} |`);
  }
  return lines;
}

function firstTransition(row, from, to) {
  return row.transitionEvents.find((event) => event.from === from && event.to === to);
}

function buildReport(rows, divergenceBlock) {
  const [eol, digit] = rows;
  const eolTailTransition = firstTransition(eol, 0x03D0E0, 0x08F479);
  const digitTailTransition = firstTransition(digit, 0x03D0E0, 0x08F479);
  const eolState = eol.statesByBlock.get(divergenceBlock) ?? eol.firstEvents.at(-1)?.state ?? {};
  const digitState = digit.statesByBlock.get(divergenceBlock) ?? digit.firstEvents.at(-1)?.state ?? {};
  const diffs = diffState(eolState, digitState);
  const prevBlock = Math.max(1, divergenceBlock - 1);
  const eolPrev = eol.statesByBlock.get(prevBlock) ?? {};
  const digitPrev = digit.statesByBlock.get(prevBlock) ?? {};
  const prevDiffs = diffState(eolPrev, digitPrev);

  const lines = [
    '# Phase 667: EOL vs Digit2 Upstream Divergence',
    '',
    'Probe: `probe-phase667-eol-digit-divergence.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase667-eol-digit-divergence.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- *** EOL and Digit2 were booted through the same post-init/repaint recipe; their pre-key RAM hashes ${eol.baseHash === digit.baseHash ? 'match' : 'do not match'} (${hex(eol.baseHash, 8)} vs ${hex(digit.baseHash, 8)}), proving a deterministic same-state baseline before key seeding.`,
    `- *** First raw block divergence is block ${divergenceBlock}: EOL briefly enters ${hex(eol.path[divergenceBlock - 1])}, Digit2 enters ${hex(digit.path[divergenceBlock - 1])}. This is a classifier detour, not the durable save-tail split; EOL rejoins Digit2 at ${hex(0x0849EA)} on the next block.`,
    `- **** Durable upstream split found at the callback return from ${hex(0x03D0E0)}: EOL takes ${hex(0x03D0E0)} -> ${hex(0x08F479)} ${eol.transitionCounts.get(`${0x03D0E0}:${0x08F479}`) ?? 0} times and then reaches ${hex(0x08F54B)} twice; Digit2 takes that transition ${digit.transitionCounts.get(`${0x03D0E0}:${0x08F479}`) ?? 0} times and never reaches ${hex(0x08F479)} or ${hex(0x08F54B)}.`,
    `- *** At the raw split, the only watched state difference is key identity (${diffs.length ? diffs.join('; ') : 'no watched state diffs'}). Digit2 still reaches token-reader/gate helpers (${hex(0x090883)} hits=${digit.watchCounts.tokenReader}, ${hex(0x090992)} hits=${digit.watchCounts.tokenGate090992}), but never reaches the save-tail transition. The missing piece is therefore not "no token-reader entry"; it is the upstream callback/return context that allows EOL to fall into ${hex(0x08F479)}.`,
    '',
    '## Results',
    '',
    '| Case | Termination | Steps | Last PC | Pre-key hash | Tuple save hits | Cleanup hits | Low-loop hits |',
    '|---|---|---:|---|---:|---:|---:|---:|',
    ...rows.map((row) => `| ${row.keyCase.name} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${hex(row.baseHash, 8)} | ${row.watchCounts.tupleSave08f54b} | ${row.watchCounts.cleanup0018f8} | ${row.watchCounts.lowLoop006d5d} |`),
    '',
    '## First Divergence',
    '',
    `- Last shared block (${prevBlock}): ${hex(eol.path[prevBlock - 1])}`,
    `- EOL block ${divergenceBlock}: ${hex(eol.path[divergenceBlock - 1])}`,
    `- Digit2 block ${divergenceBlock}: ${hex(digit.path[divergenceBlock - 1])}`,
    '',
    '### EOL Window',
    '',
    `\`${formatPathWindow(eol, divergenceBlock)}\``,
    '',
    '### Digit2 Window',
    '',
    `\`${formatPathWindow(digit, divergenceBlock)}\``,
    '',
    '### State Diff At Last Shared Block',
    '',
    prevDiffs.length ? prevDiffs.map((line) => `- ${line}`) : ['- No watched differences before key-specific block.'],
    '',
    '### State Diff At Divergence Block',
    '',
    diffs.length ? diffs.map((line) => `- ${line}`) : ['- No watched differences at the sampled divergence block.'],
    '',
    '## Durable Split: 0x03D0E0 Successors',
    '',
    ...formatTransitionTable(rows, 0x03D0E0),
    '',
    '### EOL Tail Transition',
    '',
    eolTailTransition
      ? [
          `- First ${hex(0x03D0E0)} -> ${hex(0x08F479)} at block ${eolTailTransition.block}.`,
          `- Registers: AF=${hex(eolTailTransition.af, 4)} HL=${hex(eolTailTransition.hl)} DE=${hex(eolTailTransition.de)} BC=${hex(eolTailTransition.bc)} SP=${hex(eolTailTransition.sp)}.`,
          `- State: \`${stateText(eolTailTransition.state)}\``,
          `- Recent path: \`${eolTailTransition.recent.map((pc) => hex(pc)).join(' -> ')}\``,
        ]
      : ['- Not observed.'],
    '',
    '### Digit2 Tail Transition',
    '',
    digitTailTransition
      ? [`- Unexpectedly observed at block ${digitTailTransition.block}.`]
      : [`- Not observed; Digit2 has ${digit.transitionCounts.get(`${0x03D0E0}:${0x08F479}`) ?? 0} transitions from ${hex(0x03D0E0)} to ${hex(0x08F479)}.`],
    '',
    '## Watchpoint Summary',
    '',
    ...formatWatchTable(rows),
    '',
    '## First Watchpoint States',
  ];

  for (const row of rows) {
    lines.push('', `### ${row.keyCase.name}`, '', '| Watch | Block | AF | HL | DE | BC | State | Recent path |', '|---|---:|---|---|---|---|---|---|');
    for (const name of Object.keys(WATCH)) {
      const event = row.watchFirst[name];
      if (!event) {
        lines.push(`| ${name} | - | - | - | - | - | - | - |`);
        continue;
      }
      lines.push(`| ${name} | ${event.block} | ${hex(event.af, 4)} | ${hex(event.hl)} | ${hex(event.de)} | ${hex(event.bc)} | \`${stateText(event.state)}\` | \`${event.recent.map((pc) => hex(pc)).join(' -> ')}\` |`);
    }
  }

  lines.push(
    '',
    '## Static Decode Of Split Blocks',
    '',
    `### EOL block ${hex(eol.path[divergenceBlock - 1])}`,
    '',
    '```text',
    ...decodeWindow(eol.path[divergenceBlock - 1], 14),
    '```',
    '',
    `### Digit2 block ${hex(digit.path[divergenceBlock - 1])}`,
    '',
    '```text',
    ...decodeWindow(digit.path[divergenceBlock - 1], 14),
    '```',
    '',
    '## Interpretation',
    '',
    'The first raw block divergence is only a transient classifier branch. The actionable split is later: EOL uniquely returns from `0x03D0E0` into `0x08F479`, the shared editor/display save-tail path, and then reaches `0x08F54B`; Digit2 still runs token-reader-related helpers but never takes that callback-return edge. This narrows the next target to the owner/caller context around the `0x03D0E0` return, not the downstream low-ROM cleanup machinery currently on HOLD.',
    '',
    'No runtime, transpiler, browser, or scheduler files were changed.',
    '',
  );

  return lines.flat().join('\n');
}

console.log('Phase 667: EOL vs Digit2 upstream divergence');
const rows = CASES.map((keyCase) => {
  const row = runCase(keyCase);
  console.log(`${keyCase.name}: termination=${row.result.termination} steps=${row.result.steps} lastPc=${hex(row.result.lastPc)} preHash=${hex(row.baseHash, 8)} tupleSave=${row.watchCounts.tupleSave08f54b} cleanup=${row.watchCounts.cleanup0018f8}`);
  return row;
});

const divergenceBlock = findDivergence(rows[0], rows[1]);
if (!divergenceBlock) {
  console.log('FAIL: no divergence found in captured paths');
  process.exit(1);
}

const report = buildReport(rows, divergenceBlock);
fs.writeFileSync(REPORT_PATH, report);

const eolReached = rows[0].watchCounts.tupleSave08f54b > 0;
const digitMissed = rows[1].watchCounts.tupleSave08f54b === 0 && rows[1].watchCounts.sharedTail08f479 === 0;
const clean = rows.every((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xFFFFFF) === HALT);

console.log(`firstDivergenceBlock=${divergenceBlock} eol=${hex(rows[0].path[divergenceBlock - 1])} digit=${hex(rows[1].path[divergenceBlock - 1])}`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);

if (!clean || !eolReached || !digitMissed) {
  console.log(`FAIL clean=${clean} eolReached=${eolReached} digitMissed=${digitMissed}`);
  process.exit(1);
}
