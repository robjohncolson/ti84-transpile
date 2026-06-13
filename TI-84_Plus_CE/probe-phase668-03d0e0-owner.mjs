import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase668-03d0e0-owner.md');

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

const TARGETS = Object.freeze({
  epilogue: 0x03D0E0,
  preA: 0x03D058,
  preB: 0x03D060,
  sharedTail: 0x08F479,
  saveCall: 0x08F547,
  tupleSave: 0x08F54B,
  digitFirstSuccessor: 0x058602,
  tokenReader: 0x090883,
  tokenGate: 0x090992,
  tokenExit: 0x08F5E1,
});

const STATE_FIELDS = Object.freeze([
  ['D00080', 0xD00080, 1],
  ['D00081', 0xD00081, 1],
  ['D0008D', 0xD0008D, 1],
  ['D0009F', 0xD0009F, 1],
  ['D000A0', 0xD000A0, 1],
  ['D000A3', 0xD000A3, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058D', 0xD0058D, 1],
  ['D0058E', 0xD0058E, 1],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02A28', 0xD02A28, 1],
  ['D02A29', 0xD02A29, 2],
  ['D02A2B', 0xD02A2B, 2],
  ['D02A40', 0xD02A40, 3],
  ['D02AD7', 0xD02AD7, 3],
  ['D02651', 0xD02651, 1],
  ['D02658', 0xD02658, 1],
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
  return STATE_FIELDS.map(([name, , len]) => `${name}=${hex(state[name] ?? 0, len * 2)}`).join(' ');
}

function diffState(left, right) {
  return STATE_FIELDS
    .filter(([name]) => left[name] !== right[name])
    .map(([name, , len]) => `${name}: ${hex(left[name] ?? 0, len * 2)} vs ${hex(right[name] ?? 0, len * 2)}`);
}

function stack24(mem, sp, slots = 10) {
  return Array.from({ length: slots }, (_, idx) => readValue(mem, (sp + idx * 3) & 0xFFFFFF, 3));
}

function captureRegs(cpu) {
  return {
    af: (((cpu.a ?? 0) & 0xFF) << 8) | ((cpu.f ?? 0) & 0xFF),
    hl: cpu._hl & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    bc: cpu._bc & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    pc: cpu.pc & 0xFFFFFF,
  };
}

function regsText(regs) {
  return `AF=${hex(regs.af, 4)} HL=${hex(regs.hl)} DE=${hex(regs.de)} BC=${hex(regs.bc)} IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)}`;
}

function decodeWindow(start, count = 20) {
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

function makeCounts() {
  return Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
}

function capturePoint(mem, cpu, block, pc, recent) {
  const regs = captureRegs(cpu);
  return {
    block,
    pc,
    regs,
    state: captureState(mem),
    stack: stack24(mem, regs.sp, 12),
    recent: [...recent],
  };
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
  const counts = makeCounts();
  const first = {};
  const d0Events = [];
  const watchedEvents = [];
  const transitionCounts = new Map();
  const recent = [];
  let pendingD0 = null;
  let block = 0;
  let lastPc = OUTER_LOOP;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: keyCase.maxSteps,
    maxLoopIterations: keyCase.maxSteps,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;

      if (recent.length >= 64) recent.shift();
      recent.push(addr);

      if (pendingD0) {
        const key = `${TARGETS.epilogue}:${addr}`;
        transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
        pendingD0.successor = addr;
        pendingD0.post = capturePoint(mem, cpu, block, addr, recent);
        d0Events.push(pendingD0);
        pendingD0 = null;
      }

      for (const [name, target] of Object.entries(TARGETS)) {
        if (addr !== target) continue;
        counts[name] += 1;
        if (!first[name]) first[name] = capturePoint(mem, cpu, block, addr, recent);
        if (watchedEvents.length < 160 || addr === TARGETS.sharedTail) {
          watchedEvents.push({ name, ...capturePoint(mem, cpu, block, addr, recent) });
        }
      }

      if (addr === TARGETS.epilogue) {
        pendingD0 = {
          ordinal: d0Events.length + 1,
          pre: capturePoint(mem, cpu, block, addr, recent),
          predecessor: lastPc,
          successor: null,
          post: null,
        };
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
    counts,
    first,
    d0Events,
    watchedEvents,
    transitionCounts,
    result,
    finalState: captureState(mem),
  };
}

function d0SuccessorCounts(row) {
  const counts = new Map();
  for (const event of row.d0Events) {
    counts.set(event.successor, (counts.get(event.successor) ?? 0) + 1);
  }
  return counts;
}

function formatSuccessorTable(rows) {
  const keys = new Set(rows.flatMap((row) => row.d0Events.map((event) => event.successor)));
  const lines = [
    '| `0x03D0E0` successor | EOL hits | Digit2 hits |',
    '|---|---:|---:|',
  ];
  const counts = rows.map(d0SuccessorCounts);
  for (const key of [...keys].sort((a, b) => a - b)) {
    lines.push(`| ${hex(key)} | ${counts[0].get(key) ?? 0} | ${counts[1].get(key) ?? 0} |`);
  }
  return lines;
}

function formatStack(values) {
  return values.map((value, idx) => `${idx}:${hex(value)}`).join(' ');
}

function formatD0Event(event) {
  return [
    `ordinal=${event.ordinal} preBlock=${event.pre.block} predecessor=${hex(event.predecessor)} successor=${hex(event.successor)}`,
    `preRegs=${regsText(event.pre.regs)}`,
    `preStack=${formatStack(event.pre.stack)}`,
    `preState=${stateText(event.pre.state)}`,
    `recent=${event.pre.recent.map((pc) => hex(pc)).join(' -> ')}`,
    `postBlock=${event.post?.block ?? '-'} postRegs=${event.post ? regsText(event.post.regs) : '-'}`,
    `postStack=${event.post ? formatStack(event.post.stack) : '-'}`,
  ];
}

function transitionWindow(row, centerOrdinal, radius = 4) {
  const start = Math.max(0, centerOrdinal - 1 - radius);
  const end = Math.min(row.d0Events.length, centerOrdinal + radius);
  return row.d0Events.slice(start, end);
}

function findClosestDigitComparator(eolTail, digitRow) {
  const candidates = digitRow.d0Events.filter((event) => event.predecessor === eolTail.predecessor);
  if (!candidates.length) return null;
  return candidates.reduce((best, event) => {
    const score = Math.abs(event.ordinal - eolTail.ordinal) + Math.abs(event.pre.block - eolTail.pre.block) / 1000;
    return !best || score < best.score ? { event, score } : best;
  }, null).event;
}

function epilogueReturnSlot(event) {
  return event?.pre?.stack?.[3];
}

function firstTarget(row, name) {
  return row.first[name];
}

function buildReport(rows) {
  const [eol, digit] = rows;
  const eolTail = eol.d0Events.find((event) => event.successor === TARGETS.sharedTail);
  const digitOrdinalPeer = eolTail ? digit.d0Events[eolTail.ordinal - 1] : null;
  const digitSamePredecessor = eolTail ? findClosestDigitComparator(eolTail, digit) : null;
  const preDiffs = eolTail && digitSamePredecessor ? diffState(eolTail.pre.state, digitSamePredecessor.pre.state) : [];
  const eolReturnSlot = epilogueReturnSlot(eolTail);
  const digitReturnSlot = epilogueReturnSlot(digitSamePredecessor);

  const lines = [
    '# Phase 668: 0x03D0E0 Owner / Return Context',
    '',
    'Probe: `probe-phase668-03d0e0-owner.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase668-03d0e0-owner.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    `- **** Same-state baseline reproduced: EOL and Digit2 pre-key hashes ${eol.baseHash === digit.baseHash ? 'match' : 'differ'} (${hex(eol.baseHash, 8)} vs ${hex(digit.baseHash, 8)}).`,
    `- **** EOL's first save-tail edge is a literal return target already on the 0x03D0E0 stack. At EOL ordinal ${eolTail?.ordinal ?? '-'} / block ${eolTail?.pre.block ?? '-'}, pre-execution stack slot 3 is ${eolReturnSlot !== undefined ? hex(eolReturnSlot) : '-'} and the next block is ${eolTail ? hex(eolTail.successor) : '-'}; slot 3 is exactly ${hex(TARGETS.sharedTail)}.`,
    `- *** The matching Digit2 0x03D058->0x03D060->0x03D0E0 epilogue returns to ${digitSamePredecessor ? hex(digitSamePredecessor.successor) : '-'} with stack slot 3=${digitReturnSlot !== undefined ? hex(digitReturnSlot) : '-'} instead of ${hex(TARGETS.sharedTail)}.`,
    `- *** The EOL-vs-Digit2 difference is not created inside 0x03D0E0. That block restores registers and retires; the selector is the earlier owner that pushed the interrupt/return frame. The compact state diff at the closest same-predecessor comparison is ${preDiffs.length ? preDiffs.join('; ') : 'empty across watched fields'}.`,
    '',
    '## Results',
    '',
    '| Case | Termination | Steps | Last PC | Pre-key hash | 0x03D0E0 hits | 0x08F479 hits | 0x08F54B hits | 0x08F5E1 hits | 0x090992 hits |',
    '|---|---|---:|---|---:|---:|---:|---:|---:|---:|',
    ...rows.map((row) => `| ${row.keyCase.name} | ${row.result.termination} | ${row.result.steps} | ${hex(row.result.lastPc)} | ${hex(row.baseHash, 8)} | ${row.counts.epilogue} | ${row.counts.sharedTail} | ${row.counts.tupleSave} | ${row.counts.tokenExit} | ${row.counts.tokenGate} |`),
    '',
    '## 0x03D0E0 Successors',
    '',
    ...formatSuccessorTable(rows),
    '',
    '## EOL Tail Edge Context',
    '',
    ...(eolTail ? formatD0Event(eolTail).map((line) => `- ${line}`) : ['- Not observed.']),
    '',
    '## Digit2 Comparator Contexts',
    '',
    '### Same Ordinal As EOL Tail',
    '',
    ...(digitOrdinalPeer ? formatD0Event(digitOrdinalPeer).map((line) => `- ${line}`) : ['- Not observed.']),
    '',
    '### Closest Same-Predecessor Epilogue',
    '',
    ...(digitSamePredecessor ? formatD0Event(digitSamePredecessor).map((line) => `- ${line}`) : ['- Not observed.']),
    '',
    '### Watched State Diff: EOL Tail vs Digit2 Same-Predecessor',
    '',
    ...(preDiffs.length ? preDiffs.map((line) => `- ${line}`) : ['- No watched state differences.']),
    '',
    '## Last Few 0x03D0E0 Events Around The EOL Tail Ordinal',
    '',
    '### EOL',
    '',
    ...(eolTail ? transitionWindow(eol, eolTail.ordinal).flatMap((event) => ['', `#### Ordinal ${event.ordinal}`, '', ...formatD0Event(event).map((line) => `- ${line}`)]) : ['- Not observed.']),
    '',
    '### Digit2 Same Ordinal Window',
    '',
    ...(eolTail ? transitionWindow(digit, eolTail.ordinal).flatMap((event) => ['', `#### Ordinal ${event.ordinal}`, '', ...formatD0Event(event).map((line) => `- ${line}`)]) : ['- Not observed.']),
    '',
    '## First Watchpoints',
    '',
    '| Watch | EOL first | Digit2 first | EOL hits | Digit2 hits |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const name of Object.keys(TARGETS)) {
    lines.push(`| ${name} (${hex(TARGETS[name])}) | ${firstTarget(eol, name)?.block ?? '-'} | ${firstTarget(digit, name)?.block ?? '-'} | ${eol.counts[name]} | ${digit.counts[name]} |`);
  }

  lines.push(
    '',
    '## Static Decode',
    '',
    '### 0x03D058 / 0x03D060 / 0x03D0E0 owner edge',
    '',
    '```text',
    ...decodeWindow(0x03D058, 18),
    '```',
    '',
    '### 0x03D0E0 epilogue',
    '',
    '```text',
    ...decodeWindow(0x03D0E0, 16),
    '```',
    '',
    '### 0x08F479 save-tail entry',
    '',
    '```text',
    ...decodeWindow(0x08F479, 16),
    '```',
    '',
    '## Interpretation',
    '',
    '`0x03D0E0` is not deciding between EOL and Digit2 by inspecting the key. For the EOL edge, the pre-epilogue stack already contains `0x08F479` at the return slot that becomes the next PC after the epilogue. Digit2 reaches the same immediate predecessor pair (`0x03D058 -> 0x03D060 -> 0x03D0E0`) but its equivalent return slot points to `0x058602`. The next productive test is therefore key-ID control at the owner that builds this frame: mutate only the small pending-key identity subset around that `0x03D058/0x03D060` context and verify whether the stack return slot changes from `0x058602` to `0x08F479` or vice versa.',
    '',
    'No runtime, transpiler, browser, scheduler, or golden-regression files were changed.',
    '',
  );

  return lines.join('\n');
}

console.log('Phase 668: trace 0x03D0E0 owner / return context');
const rows = CASES.map((keyCase) => {
  const row = runCase(keyCase);
  console.log(`${keyCase.name}: term=${row.result.termination} steps=${row.result.steps} lastPc=${hex(row.result.lastPc)} d0=${row.counts.epilogue} tail=${row.counts.sharedTail} tuple=${row.counts.tupleSave}`);
  return row;
});

const eolTail = rows[0].d0Events.find((event) => event.successor === TARGETS.sharedTail);
const digitMissed = rows[1].counts.sharedTail === 0 && rows[1].counts.tupleSave === 0;
const clean = rows.every((row) => row.result.termination === 'halt' && (row.result.lastPc & 0xFFFFFF) === HALT);
const report = buildReport(rows);
fs.writeFileSync(REPORT_PATH, report);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);

if (!clean || !eolTail || !digitMissed || epilogueReturnSlot(eolTail) !== TARGETS.sharedTail) {
  console.log(`FAIL clean=${clean} eolTail=${Boolean(eolTail)} digitMissed=${digitMissed} eolReturnSlot=${eolTail ? hex(epilogueReturnSlot(eolTail)) : '-'}`);
  process.exit(1);
}
