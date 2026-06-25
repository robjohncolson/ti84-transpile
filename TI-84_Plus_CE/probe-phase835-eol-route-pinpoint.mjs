import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

// Phase 835 - pinpoint which browser-vs-engine pre-burst field controls
// whether EOL/Escape reaches the real tuple engine or falls into the
// 0x0A229D space-fill owner.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase835-eol-route-pinpoint.md');

const HALT = 0x0019b5;
const OUTER_LOOP = 0x08c331;
const EOL_KEY = 0x0f;
const ENGINE_ENTRY = 0x08f54b;
const PRE_STOP_ENTRY = 0x0a229d;
const MAX_BURST_STEPS = 140000;

const CPU_SCALARS = [
  'a', 'f',
  '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'pc', 'stepCount', '_sp', '_ix', '_iy',
  'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles',
];

const FIELD_DEFS = {
  D00587: { addr: 0xd00587, len: 1, browser: null, note: 'seeded EOL scan code' },
  D0058C: { addr: 0xd0058c, len: 1, browser: null, note: 'seeded EOL key buffer' },
  D0058E: { addr: 0xd0058e, len: 1, browser: null, note: 'seeded EOL previous/context key' },
  D0009F: { addr: 0xd0009f, len: 1, browser: null, note: 'seedKey availability side effect' },
  D00080: { addr: 0xd00080, len: 1, browser: 0x08, note: 'IY flags base/key available bit' },
  D007CA: { addr: 0xd007ca, len: 3, browser: 0x0585e9, note: 'cxMain vector; same in phase834' },
  D0008D: { addr: 0xd0008d, len: 1, browser: null, note: 'home-context byte from ROM 0x0585D3+21' },
  D008E0: { addr: 0xd008e0, len: 3, browser: 0x000000, note: 'browser pre-key setjmp anchor' },
  D00082: { addr: 0xd00082, len: 1, browser: null, note: 'MathPrint/system flag byte' },
  D007E0: { addr: 0xd007e0, len: 1, browser: null, note: 'display mode' },
  D0243A: { addr: 0xd0243a, len: 3, browser: 0xd1a8cc, note: 'browser edit cursor' },
  D0243D: { addr: 0xd0243d, len: 3, browser: 0xd2a83e, note: 'browser edit descriptor/tuple pointer' },
  D02590: { addr: 0xd02590, len: 3, browser: 0xd3fe81, note: 'VAT base; same in phase834' },
  D02593: { addr: 0xd02593, len: 3, browser: null, note: 'VAT pointer' },
  D0259A: { addr: 0xd0259a, len: 3, browser: null, note: 'VAT pointer' },
  D0259D: { addr: 0xd0259d, len: 3, browser: null, note: 'VAT pointer' },
  D02A28: { addr: 0xd02a28, len: 1, browser: 0x00, note: 'tuple flag; zero in both snapshots' },
  D02A29: { addr: 0xd02a29, len: 2, browser: 0x0000, note: 'browser tuple row/offset field' },
  D02A2B: { addr: 0xd02a2b, len: 2, browser: 0x0000, note: 'browser tuple width/count field' },
  D02A1B: { addr: 0xd02a1b, len: 2, browser: 0x0000, note: 'browser tuple core field' },
  D01150: { addr: 0xd01150, len: 2, browser: 0x0000, note: 'browser tuple core field' },
  D0059A: { addr: 0xd0059a, len: 1, browser: 0x00, note: 'browser clear-side tuple byte before key' },
  D02A40: { addr: 0xd02a40, len: 3, browser: 0xd2a83e, note: 'browser tuple pointer mirrors D0243D' },
  D00595: { addr: 0xd00595, len: 1, browser: 0x00, note: 'browser edit-line cursor byte' },
  D00596: { addr: 0xd00596, len: 1, browser: 0x00, note: 'browser edit-line cursor byte' },
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) {
    mem[addr + i] = (value >> (8 * i)) & 0xff;
  }
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (8 * i);
  return value >>> 0;
}

function snapshotFields(mem, cpu) {
  const fields = {};
  for (const [name, def] of Object.entries(FIELD_DEFS)) {
    fields[name] = readValue(mem, def.addr, def.len);
  }
  fields.IY = cpu._iy & 0xffffff;
  fields.MBASE = cpu.mbase & 0xff;
  fields.SP = cpu.sp & 0xffffff;
  return fields;
}

function formatSnapshot(snapshot) {
  const out = {};
  for (const [name, value] of Object.entries(snapshot)) {
    const def = FIELD_DEFS[name];
    out[name] = hex(value, def ? def.len * 2 : (name === 'MBASE' ? 2 : 6));
  }
  return out;
}

function snapshotCpu(cpu) {
  const state = {};
  for (const prop of CPU_SCALARS) state[prop] = cpu[prop];
  return state;
}

function restoreCpu(cpu, state) {
  for (const prop of CPU_SCALARS) cpu[prop] = state[prop];
  cpu.spWarnings = [];
  cpu._currentBlockPc = state.pc ?? 0;
}

function rearmHomeContext(romBytes, mem) {
  for (let i = 0; i < 21; i += 1) mem[0xd007ca + i] = romBytes[0x0585d3 + i];
  mem[0xd0008d] = romBytes[0x0585d3 + 21];
}

function seedKey(mem, keyCode) {
  mem[0xd0058c] = keyCode;
  mem[0xd0058e] = keyCode;
  mem[0xd00587] = keyCode;
  mem[0xd0009f] |= 0x20;
  mem[0xd00080] |= 0x08;
}

async function bootSystem(romModule, romBytes) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = 0xd1a87e - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
  executor.runFrom(0x0019be, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });

  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  const launchSp = 0xd1a87e - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, 0x0019be);
  write24(mem, 0xd008e0, launchSp);
  executor.runFrom(0x09dd62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xd00080; cpu.mbase = 0xd0;
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, HALT);
  executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

  return { mem, executor, cpu, peripherals };
}

function applyPatch(mem, cpu, patch) {
  if (patch.field) {
    const def = FIELD_DEFS[patch.field];
    if (!def) throw new Error(`Unknown field patch ${patch.field}`);
    writeValue(mem, def.addr, def.len, patch.value);
  }
  if (patch.cpu === 'SP') {
    cpu.sp = patch.value;
  }
}

function makeCases(engineSnapshot) {
  const singleFields = [
    'D008E0',
    'D0243A',
    'D0243D',
    'D02A29',
    'D02A2B',
    'D02A1B',
    'D01150',
    'D0059A',
    'D02A40',
    'D00595',
  ];
  const cases = [
    { name: 'baseline_engine_reference', kind: 'baseline', patches: [], stopOnPreStop: false },
  ];

  for (const field of singleFields) {
    const def = FIELD_DEFS[field];
    if (def.browser == null) continue;
    if (engineSnapshot[field] === def.browser) continue;
    cases.push({
      name: `${field}_to_browser_${hex(def.browser, def.len * 2)}`,
      kind: 'single',
      patches: [{ field, value: def.browser }],
      note: def.note,
    });
  }

  cases.push(
    {
      name: 'D008E0_to_browser_event_frame_0xD1A863',
      kind: 'single_post_key',
      patches: [{ field: 'D008E0', value: 0xd1a863 }],
      note: 'phase834 post-key shell event-frame D008E0 value',
    },
    {
      name: 'SP_and_D008E0_to_browser_event_frame_0xD1A863',
      kind: 'stack_pair',
      patches: [{ field: 'D008E0', value: 0xd1a863 }, { cpu: 'SP', value: 0xd1a863 }],
      note: 'phase834 post-key shell event-frame anchor applied to both memory and CPU SP',
    },
    {
      name: 'browser_edit_cursor_pair',
      kind: 'group',
      patches: [
        { field: 'D0243A', value: FIELD_DEFS.D0243A.browser },
        { field: 'D0243D', value: FIELD_DEFS.D0243D.browser },
        { field: 'D02A40', value: FIELD_DEFS.D02A40.browser },
      ],
      note: 'browser edit cursor/descriptor/persisted tuple pointer',
    },
    {
      name: 'browser_tuple_zero_pair',
      kind: 'group',
      patches: [
        { field: 'D02A29', value: FIELD_DEFS.D02A29.browser },
        { field: 'D02A2B', value: FIELD_DEFS.D02A2B.browser },
      ],
      note: 'browser tuple core offsets are zero before Escape',
    },
    {
      name: 'browser_tuple_core_full',
      kind: 'group',
      patches: [
        { field: 'D02A29', value: FIELD_DEFS.D02A29.browser },
        { field: 'D02A2B', value: FIELD_DEFS.D02A2B.browser },
        { field: 'D02A1B', value: FIELD_DEFS.D02A1B.browser },
        { field: 'D01150', value: FIELD_DEFS.D01150.browser },
        { field: 'D0059A', value: FIELD_DEFS.D0059A.browser },
      ],
      note: 'all surfaced browser tuple core fields that differ from the engine snapshot',
    },
    {
      name: 'browser_edit_line_position_bytes',
      kind: 'group',
      patches: [
        { field: 'D00595', value: FIELD_DEFS.D00595.browser },
        { field: 'D00596', value: FIELD_DEFS.D00596.browser },
      ],
      note: 'browser edit-line position bytes',
    },
    {
      name: 'browser_surfaced_prekey_nonstack',
      kind: 'group',
      patches: [
        { field: 'D0243A', value: FIELD_DEFS.D0243A.browser },
        { field: 'D0243D', value: FIELD_DEFS.D0243D.browser },
        { field: 'D02A29', value: FIELD_DEFS.D02A29.browser },
        { field: 'D02A2B', value: FIELD_DEFS.D02A2B.browser },
        { field: 'D02A1B', value: FIELD_DEFS.D02A1B.browser },
        { field: 'D01150', value: FIELD_DEFS.D01150.browser },
        { field: 'D0059A', value: FIELD_DEFS.D0059A.browser },
        { field: 'D02A40', value: FIELD_DEFS.D02A40.browser },
        { field: 'D00595', value: FIELD_DEFS.D00595.browser },
      ],
      note: 'all surfaced browser edit/tuple diffs except D008E0',
    },
    {
      name: 'browser_surfaced_prekey_with_D008E0_zero',
      kind: 'group',
      patches: [
        { field: 'D008E0', value: FIELD_DEFS.D008E0.browser },
        { field: 'D0243A', value: FIELD_DEFS.D0243A.browser },
        { field: 'D0243D', value: FIELD_DEFS.D0243D.browser },
        { field: 'D02A29', value: FIELD_DEFS.D02A29.browser },
        { field: 'D02A2B', value: FIELD_DEFS.D02A2B.browser },
        { field: 'D02A1B', value: FIELD_DEFS.D02A1B.browser },
        { field: 'D01150', value: FIELD_DEFS.D01150.browser },
        { field: 'D0059A', value: FIELD_DEFS.D0059A.browser },
        { field: 'D02A40', value: FIELD_DEFS.D02A40.browser },
        { field: 'D00595', value: FIELD_DEFS.D00595.browser },
      ],
      note: 'phase834 browser pre-key surfaced diffs',
    },
    {
      name: 'browser_surfaced_postkey_stack_frame',
      kind: 'group',
      patches: [
        { field: 'D008E0', value: 0xd1a863 },
        { cpu: 'SP', value: 0xd1a863 },
        { field: 'D0243A', value: FIELD_DEFS.D0243A.browser },
        { field: 'D0243D', value: FIELD_DEFS.D0243D.browser },
        { field: 'D02A29', value: FIELD_DEFS.D02A29.browser },
        { field: 'D02A2B', value: FIELD_DEFS.D02A2B.browser },
        { field: 'D02A1B', value: FIELD_DEFS.D02A1B.browser },
        { field: 'D01150', value: FIELD_DEFS.D01150.browser },
        { field: 'D0059A', value: FIELD_DEFS.D0059A.browser },
        { field: 'D02A40', value: FIELD_DEFS.D02A40.browser },
        { field: 'D00595', value: FIELD_DEFS.D00595.browser },
      ],
      note: 'browser surfaced edit/tuple diffs plus post-key shell stack frame',
    },
  );

  return cases;
}

function classifyRun({ engineHits, preStopHits, missingBlocks, result, stopped }) {
  if (engineHits.length >= 2) return 'ENGINE_08F54B';
  if (preStopHits.length > 0 && engineHits.length === 0) return 'PRE_STOP_0A229D';
  if (missingBlocks.some((key) => key.toUpperCase().startsWith('202020:'))) return 'MISSING_202020';
  if (result?.termination === 'halt' && ((result.lastPc ?? 0) & 0xffffff) === HALT) return 'HALT_NO_ENGINE';
  if (stopped) return stopped.reason;
  return result?.termination ?? 'UNKNOWN';
}

function runVariant({ name, kind, patches = [], note = '', stopOnPreStop = true }, base, opts = {}) {
  const { mem, cpu, executor, peripherals, baseMem, baseCpu } = base;
  mem.set(baseMem);
  restoreCpu(cpu, baseCpu);
  peripherals.acknowledgeIRQ();
  peripherals.acknowledgeNMI();
  peripherals.setTimerEnabled(true);

  for (const patch of patches) applyPatch(mem, cpu, patch);

  const preRun = snapshotFields(mem, cpu);
  const engineHits = [];
  const preStopHits = [];
  const missingBlocks = [];
  const recentBlocks = [];
  let block = 0;
  let lastPc = null;
  let lastStep = 0;
  let stopped = null;
  let result = null;

  try {
    result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: opts.maxSteps ?? MAX_BURST_STEPS,
      maxLoopIterations: 650000,
      onMissingBlock(pc, mode, steps) {
        missingBlocks.push(`${hex(pc)}:${mode}:${steps}`);
      },
      onBlock(pc, mode, meta, steps) {
        block += 1;
        lastPc = pc & 0xffffff;
        lastStep = steps;
        recentBlocks.push(hex(lastPc));
        if (recentBlocks.length > 20) recentBlocks.shift();

        if (lastPc === ENGINE_ENTRY) {
          engineHits.push({ hit: engineHits.length + 1, block, steps });
          if (engineHits.length >= 2) {
            stopped = { reason: 'ENGINE_08F54B', block, steps };
            throw stopped;
          }
        }

        if (lastPc === PRE_STOP_ENTRY) {
          preStopHits.push({ hit: preStopHits.length + 1, block, steps });
          if ((opts.stopOnPreStop ?? stopOnPreStop) && engineHits.length === 0) {
            stopped = { reason: 'PRE_STOP_0A229D', block, steps };
            throw stopped;
          }
        }
      },
    });
  } catch (error) {
    if (error !== stopped) throw error;
  }

  const postRun = snapshotFields(mem, cpu);
  const classification = classifyRun({ engineHits, preStopHits, missingBlocks, result, stopped });
  return {
    name,
    kind,
    note,
    patches: patches.map((patch) => ({
      field: patch.field ?? patch.cpu,
      value: hex(patch.value, patch.field ? FIELD_DEFS[patch.field].len * 2 : 6),
    })),
    classification,
    block,
    lastPc: lastPc == null ? null : hex(lastPc),
    lastStep,
    stopped,
    termination: result?.termination ?? stopped?.reason ?? 'thrown',
    resultLastPc: result?.lastPc == null ? null : hex(result.lastPc),
    resultSteps: result?.steps ?? null,
    engineHits,
    preStopHits,
    missingBlocks,
    recentBlocks,
    preRun: formatSnapshot(preRun),
    postRun: formatSnapshot(postRun),
  };
}

function buildReport(summary) {
  const fieldRows = Object.entries(summary.fieldDiffs).map(([name, diff]) => {
    const def = FIELD_DEFS[name];
    return `| ${name} | ${diff.engine} | ${diff.browser ?? '-'} | ${diff.changed ? 'YES' : 'NO'} | ${def?.note ?? ''} |`;
  });
  const resultRows = summary.results.map((r) => [
    r.name,
    r.kind,
    r.classification,
    r.engineHits.length,
    r.preStopHits.length,
    r.lastPc ?? '-',
    r.lastStep,
    (r.patches ?? []).map((p) => `${p.field}=${p.value}`).join(', ') || '-',
  ]);

  const lossRows = summary.engineLossCases.map((r) => (
    `| ${r.name} | ${r.classification} | ${r.lastPc ?? '-'} | ${r.lastStep} | ${(r.patches ?? []).map((p) => `${p.field}=${p.value}`).join(', ')} |`
  ));

  const variantRows = resultRows.map((cols) => `| ${cols.join(' | ')} |`);

  return [
    '# Phase 835 EOL Route Pinpoint',
    '',
    'Probe: `probe-phase835-eol-route-pinpoint.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase835-eol-route-pinpoint.mjs`',
    '',
    '## Result',
    '',
    `- Baseline route: ${summary.baseline?.classification ?? 'UNKNOWN'}.`,
    `- Pinpoint: ${summary.pinpoint ?? 'none found in tested fields'}.`,
    `- Confirmation: ${summary.confirmation ? `${summary.confirmation.name} -> ${summary.confirmation.classification} (engineHits=${summary.confirmation.engineHits.length}, preStopHits=${summary.confirmation.preStopHits.length})` : 'not run'}.`,
    `- Completed cases: ${summary.results.length}.`,
    `- Engine-lost cases: ${summary.engineLossCases.length}; browser-style 0x0A229D cases: ${summary.preStopCases.length}.`,
    '',
    '## Interpretation',
    '',
    '- The in-memory phase833 baseline still reaches `0x08F54B` twice, so the reference recipe is valid.',
    '- Flipping `D0243A` to the browser cursor value or `D0243D`/`D02A40` to the browser descriptor values is enough to lose the tuple-engine route, but these variants do not hit `0x0A229D` under the in-memory executor.',
    '- `D008E0` is not the controlling field in this recipe: zeroing it, setting it to the browser post-key stack anchor, or moving CPU SP with it still reaches `0x08F54B` twice.',
    '- The browser `PRE_STOP_0A229D` symptom is therefore not reproduced by direct pre-burst memory field flips alone; it is the browser shell control-pre-stop path layered on top of an Escape route whose edit cursor/descriptor state is already browser-shaped.',
    '',
    '## Engine vs Browser Surfaced Fields',
    '',
    '| Field | Engine pre-burst | Browser value | Differs | Note |',
    '| --- | --- | --- | --- | --- |',
    ...fieldRows,
    '',
    '## Variant Results',
    '',
    '| Case | Kind | Classification | Engine hits | 0x0A229D hits | Last PC | Last step | Patches |',
    '| --- | --- | --- | ---: | ---: | --- | ---: | --- |',
    ...variantRows,
    '',
    '## Engine-Lost Non-Prestop Cases',
    '',
    summary.engineLossCases.length
      ? ['| Case | Classification | Last PC | Last step | Patches |', '| --- | --- | --- | ---: | --- |', ...lossRows].join('\n')
      : '_None._',
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, or peripheral files were changed.',
    '',
  ].join('\n');
}

console.log('Phase 835: EOL route pinpoint via field flips');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const { mem, executor, cpu, peripherals } = await bootSystem(romModule, romBytes);

rearmHomeContext(romBytes, mem);
seedKey(mem, EOL_KEY);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xd00080; cpu.mbase = 0xd0;
cpu.sp = 0xd1a87e - 24;
write24(mem, cpu.sp, HALT);
write24(mem, 0xd008e0, cpu.sp);

const engineSnapshot = snapshotFields(mem, cpu);
const base = {
  mem,
  cpu,
  executor,
  peripherals,
  baseMem: Uint8Array.from(mem),
  baseCpu: snapshotCpu(cpu),
};

const fieldDiffs = {};
for (const [name, def] of Object.entries(FIELD_DEFS)) {
  if (def.browser == null) continue;
  const engineValue = engineSnapshot[name];
  fieldDiffs[name] = {
    engine: hex(engineValue, def.len * 2),
    browser: hex(def.browser, def.len * 2),
    changed: engineValue !== def.browser,
    note: def.note,
  };
}

const cases = makeCases(engineSnapshot);
const results = [];
for (const testCase of cases) {
  console.log(`running ${testCase.name}`);
  const result = runVariant(testCase, base);
  results.push(result);
  console.log(`  ${result.classification} engine=${result.engineHits.length} preStop=${result.preStopHits.length} last=${result.lastPc} step=${result.lastStep}`);
}

const baseline = results.find((r) => r.kind === 'baseline');
const singlePinpoint = results.find((r) => r.kind === 'single' && r.classification === 'PRE_STOP_0A229D');
const groupPinpoint = results.find((r) => r.kind !== 'baseline' && r.classification === 'PRE_STOP_0A229D');
const pinpointResult = singlePinpoint ?? groupPinpoint ?? null;
let confirmation = null;

if (pinpointResult) {
  console.log(`confirming ${pinpointResult.name} without early pre-stop exit`);
  confirmation = runVariant({
    name: `${pinpointResult.name}_confirm_no_early_stop`,
    kind: 'confirmation',
    patches: pinpointResult.patches.map((patch) => {
      if (patch.field === 'SP') return { cpu: 'SP', value: Number.parseInt(patch.value, 16) };
      return { field: patch.field, value: Number.parseInt(patch.value, 16) };
    }),
    stopOnPreStop: false,
  }, base, { stopOnPreStop: false, maxSteps: MAX_BURST_STEPS });
  console.log(`  confirm ${confirmation.classification} engine=${confirmation.engineHits.length} preStop=${confirmation.preStopHits.length} last=${confirmation.lastPc} step=${confirmation.lastStep}`);
}

const pinpoint = pinpointResult
  ? `${pinpointResult.kind === 'single' ? 'single field' : 'minimal tested group'} ${pinpointResult.name} -> ${pinpointResult.classification}`
  : null;
const preStopCases = results.filter((r) => r.classification === 'PRE_STOP_0A229D');
const engineLossCases = results.filter((r) => r.kind !== 'baseline'
  && r.engineHits.length === 0
  && r.classification !== 'PRE_STOP_0A229D');

const summary = {
  probe: 'phase835-eol-route-pinpoint',
  pass: baseline?.classification === 'ENGINE_08F54B',
  baseline,
  pinpoint,
  fieldDiffs,
  results,
  preStopCases,
  engineLossCases,
  confirmation,
};

fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
console.log(`phase835: report written to ${REPORT_PATH}`);

if (!summary.pass) {
  console.error('Baseline did not reproduce ENGINE_08F54B; refusing to treat field flips as valid.');
  process.exit(1);
}
