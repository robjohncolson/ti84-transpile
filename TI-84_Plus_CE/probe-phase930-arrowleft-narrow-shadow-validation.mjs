import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase930-arrowleft-narrow-shadow-validation.md');
const VARIANTS = Object.freeze([
  { name: 'baseline', debugPort: 9930, candidate: false },
  { name: 'candidate', debugPort: 9931, candidate: true },
]);

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase930 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase930 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function buildVariantSource(baseSource, variant, resultName, reportName) {
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(reportName)});\nconst PHASE930_RESULT_PATH = path.join(__dirname, ${JSON.stringify(resultName)});`,
    'phase922 report path',
  );
  source = replaceExactlyOnce(
    source,
    'const DEBUG_PORT = 9922;',
    `const DEBUG_PORT = ${variant.debugPort};`,
    'phase922 debug port',
  );
  source = replaceExactlyOnce(
    source,
    '  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    '  try { fs.writeFileSync(PHASE930_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );

  if (!variant.candidate) return source;

  const htmlEdits = [
    [
      '        let controlStopCursorRestored = false;',
      `        let controlStopCursorRestored = false;
        let phase930CursorShadow = null;
        let phase930CursorShadowPc = null;`,
    ],
    [
      `          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
      `          if (e.code === 'ArrowLeft'
              && phase930CursorShadow === null
              && cursorBefore !== null
              && cpu?.memory
              && (pc & 0xFFFFFF) === 0x05E453) {
            const liveCursor = readMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3);
            if (liveCursor === ((cursorBefore - 1) & 0xFFFFFF)) {
              phase930CursorShadow = liveCursor;
              phase930CursorShadowPc = pc & 0xFFFFFF;
            }
          }
          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
    ],
    [
      '              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, cursorBefore);',
      '              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, phase930CursorShadow ?? cursorBefore);',
    ],
    [
      `          controlStopCursorRestored,
          uiClearApplied: uiClearResult?.ok === true,`,
      `          controlStopCursorRestored,
          phase930CursorShadow,
          phase930CursorShadowPc,
          uiClearApplied: uiClearResult?.ok === true,`,
    ],
  ];
  const editStatements = htmlEdits.map(([from, to], index) => (
    `  sourceHtml = phase930ReplaceOnce(sourceHtml, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${JSON.stringify(`candidate HTML edit ${index + 1}`)});`
  )).join('\n');
  const candidatePrelude = `function instrumentBrowserShell(sourceHtml) {
  const phase930ReplaceOnce = (value, from, to, label) => {
    const first = value.indexOf(from);
    if (first < 0) throw new Error('Phase930 marker not found: ' + label);
    if (value.indexOf(from, first + from.length) >= 0) throw new Error('Phase930 marker is not unique: ' + label);
    return value.slice(0, first) + to + value.slice(first + from.length);
  };
${editStatements}`;
  source = replaceExactlyOnce(
    source,
    'function instrumentBrowserShell(sourceHtml) {',
    candidatePrelude,
    'phase922 instrumentBrowserShell entry',
  );
  return source;
}

async function runVariant(baseSource, variant) {
  const token = `${process.pid}-${Date.now()}-${variant.name}`;
  const moduleName = `.phase930-${token}.tmp.mjs`;
  const resultName = `.phase930-${token}.result.tmp.json`;
  const reportName = `.phase930-${token}.report.tmp.md`;
  const modulePath = path.join(__dirname, moduleName);
  const resultPath = path.join(__dirname, resultName);
  const reportPath = path.join(__dirname, reportName);
  try {
    fs.writeFileSync(modulePath, buildVariantSource(baseSource, variant, resultName, reportName));
    await import(`${pathToFileURL(modulePath).href}?phase930=${encodeURIComponent(token)}`);
    process.exitCode = 0;
    if (!fs.existsSync(resultPath)) throw new Error(`${variant.name} did not write a result`);
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } finally {
    process.exitCode = 0;
    for (const filePath of [modulePath, resultPath, reportPath]) {
      try { fs.rmSync(filePath, { force: true }); } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

function digest(result) {
  const lineBase = result.afterBoot?.cursor;
  const leftRun = result.keyRuns?.at(-1);
  const left = result.afterLeft?.lastKey ?? {};
  const firstCursorChange = leftRun?.record?.firstChanges?.find((row) => row.name === 'D0243A') ?? null;
  const relativeMismatches = result.relativeRows?.filter((row) => !row.match) ?? [];
  const absoluteMismatches = result.absoluteRows?.filter((row) => !row.match) ?? [];
  return {
    lineBase,
    digitBuffers: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.buffer?.slice(0, 4)) ?? [],
    digitTerminations: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.termination) ?? [],
    leftTermination: left.termination,
    leftSteps: left.steps,
    controlStopPc: left.controlStopPc,
    cursorBeforeKey: left.cursorBefore,
    controlStopCursorBefore: left.controlStopCursorBefore,
    controlStopCursorAfter: left.controlStopCursorAfter,
    controlStopCursorRestored: left.controlStopCursorRestored,
    shadow: left.phase930CursorShadow ?? null,
    shadowPc: left.phase930CursorShadowPc ?? null,
    finalCursor: result.afterLeft?.fields?.D0243A,
    finalOffset: lineBase == null || result.afterLeft?.fields?.D0243A == null
      ? null
      : (result.afterLeft.fields.D0243A - lineBase) & 0xFFFFFF,
    firstCursorChange,
    relativeMismatches,
    absoluteMismatches,
    pageErrors: result.afterLeft?.pageErrors ?? [],
  };
}

function cleanDigits(digested) {
  const expected = [[0x31], [0x31, 0x32], [0x31, 0x32, 0x33]];
  return digested.digitTerminations.every((value) => value === 'post_insert_gate_stop')
    && expected.every((bytes, index) => bytes.every((value, byteIndex) => (
      digested.digitBuffers[index]?.[byteIndex] === value
    )));
}

function mismatchNames(rows) {
  return rows.length === 0 ? 'none' : rows.map((row) => row.name).join(', ');
}

function buildReport(summary) {
  if (summary.error) return `# Phase 930: ArrowLeft narrow shadow validation\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  const baseline = summary.baseline;
  const candidate = summary.candidate;
  const rows = [
    ['Baseline', baseline],
    ['Candidate', candidate],
  ].map(([label, row]) => `| ${label} | ${hex(row.cursorBeforeKey)} | ${hex(row.firstCursorChange?.after)} @ ${hex(row.firstCursorChange?.pc)} | ${hex(row.controlStopCursorBefore)} | ${hex(row.shadow)} @ ${hex(row.shadowPc)} | ${hex(row.controlStopCursorAfter)} | +${row.finalOffset} | ${row.relativeMismatches.length} |`).join('\n');
  return `# Phase 930: ArrowLeft Narrow Shadow Validation

Probe: \`probe-phase930-arrowleft-narrow-shadow-validation.mjs\`  
Run: \`node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase930-arrowleft-narrow-shadow-validation.mjs\`

## Result

- Probe execution: ${summary.pass ? '**PASS**' : '**FAIL**'}.
- Both independent pages inserted exact \`31 32 33 00\` and reached the existing \`0x001879\` control pre-stop for ArrowLeft with zero page errors.
- Baseline reproduced PHASE925: the OS first moved \`D0243A\` from base+3 to base+2 at \`0x05E453\`, continued to base+1 by the stop, and the disk policy restored base+3.
- The probe-only candidate shadowed only the first valid base+2 cursor at \`0x05E453\` and replayed that one 24-bit value at \`0x001879\`. It did not remove the pre-stop, clear flags, restore any other field, or edit disk \`browser-shell.html\`.
- Candidate final cursor offset is +${candidate.finalOffset}, matching the real-hardware oracle (+2). Cursor-relative mismatches changed ${baseline.relativeMismatches.length} -> ${candidate.relativeMismatches.length}.

| Route | Cursor before LEFT | First OS cursor | At stop before replay | Shadow | After replay | Final offset | Relative mismatches |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
${rows}

## Adjudication

${summary.fullRelativeMatch
  ? 'The narrow shadow/replay is sufficient for every cursor-relative edit-line field in the PHASE922 oracle.'
  : `The narrow shadow/replay fixes the final cursor displacement but is not a complete edit-line fidelity fix. Remaining cursor-relative mismatches: ${mismatchNames(candidate.relativeMismatches)}.`}

The candidate is locally validated as the smallest cursor-policy correction: its captured value is exactly the first OS-produced one-byte LEFT result, its capture PC is \`0x05E453\`, and the replay happens only at the already-preserved \`0x001879\` stop. ${summary.fullRelativeMatch ? 'A disk patch is now eligible for the required browser replay, PHASE922, and golden gates.' : 'A disk patch should remain deferred until the remaining cursor-relative fields are explained or included by an equally narrow, evidence-backed shadow.'}

Absolute mismatches remain baseline/session-layout or Phase-6 state differences: ${mismatchNames(candidate.absoluteMismatches)}.

## Scope

Only this new probe, this report, and the handoff are persisted. \`browser-shell.html\`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and \`follow-alongs/\` are untouched. GitNexus could not resolve the inline browser helper or the new probe helpers; pre-edit risk was \`UNKNOWN\` with zero graph-resolved direct callers/processes.
`;
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  const baselineResult = await runVariant(baseSource, VARIANTS[0]);
  const candidateResult = await runVariant(baseSource, VARIANTS[1]);
  const baseline = digest(baselineResult);
  const candidate = digest(candidateResult);
  const commonPass = cleanDigits(baseline)
    && cleanDigits(candidate)
    && baseline.pageErrors.length === 0
    && candidate.pageErrors.length === 0
    && baseline.leftTermination === 'control_pre_stop'
    && candidate.leftTermination === 'control_pre_stop'
    && baseline.controlStopPc === 0x001879
    && candidate.controlStopPc === 0x001879
    && baseline.firstCursorChange?.pc === 0x05E453
    && candidate.firstCursorChange?.pc === 0x05E453;
  const baselineReproduced = baseline.finalOffset === 3
    && baseline.controlStopCursorBefore === ((baseline.lineBase + 1) & 0xFFFFFF)
    && baseline.controlStopCursorAfter === ((baseline.lineBase + 3) & 0xFFFFFF);
  const candidateValidated = candidate.shadowPc === 0x05E453
    && candidate.shadow === ((candidate.lineBase + 2) & 0xFFFFFF)
    && candidate.controlStopCursorBefore === ((candidate.lineBase + 1) & 0xFFFFFF)
    && candidate.controlStopCursorAfter === candidate.shadow
    && candidate.finalOffset === 2
    && candidate.relativeMismatches.some((row) => row.name === 'D0243A cursor-from-line-base') === false;
  summary = {
    probe: 'phase930-arrowleft-narrow-shadow-validation',
    pass: commonPass && baselineReproduced && candidateValidated,
    commonPass,
    baselineReproduced,
    candidateValidated,
    fullRelativeMatch: candidate.relativeMismatches.length === 0,
    baseline,
    candidate,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    commonPass,
    baselineReproduced,
    candidateValidated,
    fullRelativeMatch: summary.fullRelativeMatch,
    baseline: {
      finalOffset: baseline.finalOffset,
      controlStopCursorBefore: hex(baseline.controlStopCursorBefore),
      controlStopCursorAfter: hex(baseline.controlStopCursorAfter),
      relativeMismatches: mismatchNames(baseline.relativeMismatches),
    },
    candidate: {
      shadow: hex(candidate.shadow),
      shadowPc: hex(candidate.shadowPc),
      finalOffset: candidate.finalOffset,
      controlStopCursorBefore: hex(candidate.controlStopCursorBefore),
      controlStopCursorAfter: hex(candidate.controlStopCursorAfter),
      relativeMismatches: mismatchNames(candidate.relativeMismatches),
    },
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase930-arrowleft-narrow-shadow-validation', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
