import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const SOURCE_PATH = path.join(__dirname, 'probe-phase927-d0009b-conditioned-handoff-ab.mjs');
const REPORT_PATH = path.join(__dirname, 'phase928-pre-enter-policy-adjudication.md');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-phase928-'));
const tempModule = path.join(tempRoot, 'phase928-browser-capture.mjs');
const tempJson = path.join(tempRoot, 'phase928-raw.json');
const tempChildReport = path.join(tempRoot, 'phase928-child-report.md');
const GUARD_PC = 0x001879;

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactly(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${label}: expected exactly one source match`);
  }
  return source.replace(needle, replacement);
}

function buildCaptureModule() {
  let source = fs.readFileSync(SOURCE_PATH, 'utf8');
  source = replaceExactly(
    source,
    'const __dirname = import.meta.dirname;',
    `const __dirname = ${JSON.stringify(__dirname)};`,
    'source directory',
  );
  source = replaceExactly(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase927-d0009b-conditioned-handoff-ab.md');",
    `const REPORT_PATH = ${JSON.stringify(tempChildReport)};`,
    'child report path',
  );
  source = replaceExactly(
    source,
    'const DEBUG_PORT = 9927;',
    `const DEBUG_PORT = ${12000 + (process.pid % 30000)};`,
    'debug port',
  );

  const drainNeedle = `    record.drainEnd = {
      result,
      block: record.blocks,
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      D0009B: cpu.memory[0xD0009B] ?? 0,
    };`;
  const drainReplacement = `    record.drainEnd = {
      result,
      block: record.blocks,
      D0058B: cpu.memory[0xD0058B] ?? 0,
      D000C3: cpu.memory[0xD000C3] ?? 0,
      D0009B: cpu.memory[0xD0009B] ?? 0,
      snapshot: {
        lastPc: result?.lastPc ?? null,
        wipes: result?.wipes ?? null,
        D0058B: cpu.memory[0xD0058B] ?? 0,
        D000C3: cpu.memory[0xD000C3] ?? 0,
        D0009B: cpu.memory[0xD0009B] ?? 0,
        D00080: cpu.memory[0xD00080] ?? 0,
        D0146D: cpu.memory[0xD0146D] ?? 0,
        D007CA: phase927Read24(0xD007CA),
        D008E0: phase927Read24(0xD008E0),
        D02437: phase927Read24(0xD02437),
        D0243A: phase927Read24(0xD0243A),
        D0243D: phase927Read24(0xD0243D),
        D02440: phase927Read24(0xD02440),
        D02590: phase927Read24(0xD02590),
        D0259D: phase927Read24(0xD0259D),
        buffer: phase927Buffer(window.__phase927.lineBase),
        key: {
          code: window.__coldbootLastKey?.code ?? null,
          termination: window.__coldbootLastKey?.termination ?? null,
          steps: window.__coldbootLastKey?.steps ?? null,
        },
      },
    };`;
  source = replaceExactly(source, drainNeedle, drainReplacement, 'drain snapshot hook');
  source = replaceExactly(
    source,
    '  summary = await runProbe();',
    `  summary = await runProbe();\n  fs.writeFileSync(${JSON.stringify(tempJson)}, JSON.stringify(summary));`,
    'raw summary write',
  );
  return source;
}

function countMilestone(record, kind) {
  return record.milestones.filter((row) => row.kind === kind).length;
}

function compactDrain(record) {
  const result = record.drainEnd.result;
  const snapshot = record.drainEnd.snapshot;
  return {
    key: record.label,
    stopKind: result.stopKind,
    guardPc: result.guardPc,
    lastPc: snapshot.lastPc,
    steps: result.steps,
    wipes: snapshot.wipes,
    D0058B: snapshot.D0058B,
    D000C3: snapshot.D000C3,
    D0009B: snapshot.D0009B,
    D00080: snapshot.D00080,
    D0146D: snapshot.D0146D,
    D007CA: snapshot.D007CA,
    D008E0: snapshot.D008E0,
    D02437: snapshot.D02437,
    D0243A: snapshot.D0243A,
    D0243D: snapshot.D0243D,
    D02440: snapshot.D02440,
    D02590: snapshot.D02590,
    D0259D: snapshot.D0259D,
    buffer: snapshot.buffer,
    keyState: snapshot.key,
    handoffs: record.handoffs,
  };
}

function compactNext(record) {
  return {
    key: record.label,
    termination: record.end.lastKey?.termination ?? null,
    steps: record.end.lastKey?.steps ?? null,
    gateHits: countMilestone(record, 'gate'),
    insertHits: countMilestone(record, 'insert'),
    preWipeHits: countMilestone(record, 'pre_wipe'),
    drainStop: record.drainEnd?.result?.stopKind ?? null,
    drainLastPc: record.drainEnd?.result?.lastPc ?? null,
    drainWipes: record.drainEnd?.result?.wipes ?? null,
    cursor: record.end.cursor,
    descriptor: record.end.descriptor,
    buffer: record.end.buffer,
  };
}

function sameFields(a, b, fields) {
  return fields.every((field) => a[field] === b[field]);
}

function adjudicate(raw) {
  const clean = raw.scenarios.find((scenario) => scenario.name === '123-baseline');
  const plus = raw.scenarios.find((scenario) => scenario.name === '2plus3-d0009b-policy');
  if (!clean || !plus) throw new Error('PHASE927 source scenarios missing');
  const cleanDrain = compactDrain(clean.records[1]);
  const plusDrain = compactDrain(plus.records[1]);
  const cleanNext = compactNext(clean.records[2]);
  const plusNext = compactNext(plus.records[2]);
  const coreFields = ['D0058B', 'D000C3', 'D0009B', 'D00080', 'D0146D', 'D007CA', 'D008E0', 'D02437', 'D0243A', 'D0243D', 'D02440', 'D02590', 'D0259D'];
  const guardParity = [cleanDrain, plusDrain].every((row) => (
    row.stopKind === 'guard_pre_wipe'
    && row.guardPc === GUARD_PC
    && row.lastPc === GUARD_PC
    && row.wipes === 0
  ));
  const stateParity = sameFields(cleanDrain, plusDrain, coreFields);
  const editPreserved = cleanDrain.D0243A !== 0
    && cleanDrain.D0243D !== 0
    && plusDrain.D0243A !== 0
    && plusDrain.D0243D !== 0
    && cleanDrain.buffer.slice(0, 4).join(',') === '49,50,0,0'
    && plusDrain.buffer.slice(0, 4).join(',') === '50,158,0,0';
  const cleanNextExact = cleanNext.termination === 'post_insert_gate_stop'
    && cleanNext.insertHits === 1
    && cleanNext.buffer.slice(0, 4).join(',') === '49,50,51,0';
  const plusNextExact = plusNext.termination === 'post_insert_gate_stop'
    && plusNext.insertHits === 1
    && plusNext.buffer.slice(0, 4).join(',') === '50,158,51,0';
  const noPageErrors = clean.pageErrors.length === 0 && plus.pageErrors.length === 0;
  const safeNormalGuard = guardParity && stateParity && editPreserved && cleanNextExact && plusNextExact && noPageErrors;
  return {
    probe: 'phase928-pre-enter-policy-adjudication',
    pass: safeNormalGuard,
    safeNormalGuard,
    needsAnotherHandoff: !safeNormalGuard,
    sourcePhase927Pass: raw.pass,
    guardParity,
    stateParity,
    editPreserved,
    cleanNextExact,
    plusNextExact,
    noPageErrors,
    comparedFields: coreFields,
    cleanDrain,
    plusDrain,
    cleanNext,
    plusNext,
  };
}

function bytes(values, length = 4) {
  return values.slice(0, length).map((value) => hex(value, 2)).join(' ');
}

function buildReport(data) {
  if (!data || data.error) return `# Phase 928: pre-ENTER policy adjudication\n\nProbe failed: ${data?.error ?? 'unknown error'}\n`;
  const stateRows = data.comparedFields.map((field) => `| ${field} | ${hex(data.cleanDrain[field], field.startsWith('D000') || field === 'D0058B' || field === 'D0146D' ? 2 : 6)} | ${hex(data.plusDrain[field], field.startsWith('D000') || field === 'D0058B' || field === 'D0146D' ? 2 : 6)} | ${data.cleanDrain[field] === data.plusDrain[field] ? 'yes' : 'no'} |`);
  return [
    '# Phase 928: pre-ENTER policy adjudication',
    '',
    'Probe: `probe-phase928-pre-enter-policy-adjudication.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase928-pre-enter-policy-adjudication.mjs`',
    '',
    '## Result',
    '',
    `- Probe PASS: **${data.pass ? 'yes' : 'no'}**. Guarded stop adjudicated safe/normal: **${data.safeNormalGuard ? 'yes' : 'no'}**.`,
    `- Both two-token drains stop at ${hex(GUARD_PC)} with lastPc=${hex(GUARD_PC)} and zero wipes: **${data.guardParity ? 'yes' : 'no'}**.`,
    `- The clean Digit2 drain and conditioned Plus drain have exact parity across all captured key/context/edit control fields: **${data.stateParity ? 'yes' : 'no'}**.`,
    `- Edit state remains live at the guard: clean=${bytes(data.cleanDrain.buffer)}, plus=${bytes(data.plusDrain.buffer)}, cursor clean/plus=${hex(data.cleanDrain.D0243A)}/${hex(data.plusDrain.D0243A)}.`,
    `- The next Digit3 is exact once on both routes: clean=${bytes(data.cleanNext.buffer)} (${data.cleanNext.insertHits} insert), conditioned=${bytes(data.plusNext.buffer)} (${data.plusNext.insertHits} insert).`,
    '',
    data.safeNormalGuard
      ? 'Adjudication: `guard_pre_wipe` is a safe normal drain outcome for the narrow `D0009B` predicate. A further handoff is not required: a clean multi-digit route already ends at the same preserved guard state, and both routes accept the next Digit3 exactly once. PHASE927 therefore clears the condition for the narrow browser predicate patch, subject to the required browser/PHASE921/PHASE927/PHASE922/golden gates in the next tick.'
      : 'Adjudication: the guarded stop is not yet proven equivalent to the clean drain. Do not patch the browser predicate; trace another handoff or the first mismatching field.',
    '',
    '## Guard comparison',
    '',
    '| route | key | stop | lastPc | steps | wipes | first 4 bytes |',
    '|---|---|---|---:|---:|---:|---|',
    `| clean multi-digit | ${data.cleanDrain.key} | ${data.cleanDrain.stopKind} | ${hex(data.cleanDrain.lastPc)} | ${data.cleanDrain.steps} | ${data.cleanDrain.wipes} | ${bytes(data.cleanDrain.buffer)} |`,
    `| conditioned plus | ${data.plusDrain.key} | ${data.plusDrain.stopKind} | ${hex(data.plusDrain.lastPc)} | ${data.plusDrain.steps} | ${data.plusDrain.wipes} | ${bytes(data.plusDrain.buffer)} |`,
    '',
    '| field | clean Digit2 drain | conditioned Plus drain | equal |',
    '|---|---:|---:|---:|',
    ...stateRows,
    '',
    '## Next Digit3 route',
    '',
    '| route | termination | steps | gate hits | insert hits | pre-wipe hits | drain wipes | final first 4 bytes |',
    '|---|---|---:|---:|---:|---:|---:|---|',
    `| clean after 12 | ${data.cleanNext.termination} | ${data.cleanNext.steps} | ${data.cleanNext.gateHits} | ${data.cleanNext.insertHits} | ${data.cleanNext.preWipeHits} | ${data.cleanNext.drainWipes} | ${bytes(data.cleanNext.buffer)} |`,
    `| conditioned after 2+ | ${data.plusNext.termination} | ${data.plusNext.steps} | ${data.plusNext.gateHits} | ${data.plusNext.insertHits} | ${data.plusNext.preWipeHits} | ${data.plusNext.drainWipes} | ${bytes(data.plusNext.buffer)} |`,
    '',
    '## Bounded JSON evidence',
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'The browser shell was modified only in a temporary HTTP response inherited from PHASE927. No disk browser/runtime/transpiler/decoder/peripheral/scheduler/ROM/`follow-alongs/` file was changed.',
    '',
  ].join('\n');
}

let summary;
try {
  fs.writeFileSync(tempModule, buildCaptureModule());
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await import(`${pathToFileURL(tempModule).href}?run=${Date.now()}`);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  if (!fs.existsSync(tempJson)) throw new Error('PHASE927 capture did not produce raw JSON');
  summary = adjudicate(JSON.parse(fs.readFileSync(tempJson, 'utf8')));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase928-pre-enter-policy-adjudication', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
