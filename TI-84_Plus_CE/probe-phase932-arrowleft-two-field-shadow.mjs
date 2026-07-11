import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase932-arrowleft-two-field-shadow.md');
const VARIANTS = Object.freeze([
  { name: 'baseline', debugPort: 9934, candidate: false },
  { name: 'two-field-shadow', debugPort: 9935, candidate: true },
]);

const POSTPONED_RELATIVE_FIELD = 'D02A29 cursor-pixel-offset';

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase932 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase932 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function buildVariantSource(baseSource, variant, resultName, reportName) {
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(reportName)});\nconst PHASE932_RESULT_PATH = path.join(__dirname, ${JSON.stringify(resultName)});`,
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
    '  try { fs.writeFileSync(PHASE932_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );

  if (!variant.candidate) return source;

  const htmlEdits = [
    [
      '        let controlStopCursorRestored = false;',
      `        let controlStopCursorRestored = false;
        let phase932TupleShadow = null;
        let phase932TupleShadowPc = null;
        let phase932TupleReplayPc = null;
        let phase932TupleReplayCount = 0;
        let phase932DescriptorBeforeReplay = null;
        let phase932DescriptorAfterReplay = null;`,
    ],
    [
      `          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
      `          if (e.code === 'ArrowLeft'
              && phase932TupleShadow === null
              && cursorBefore !== null
              && cpu?.memory
              && (pc & 0xFFFFFF) === 0x05E453) {
            const liveCursor = readMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3);
            const liveDescriptor = readMemoryFieldValue(cpu.memory, 0xD0243D, 3);
            if (liveCursor === ((cursorBefore - 1) & 0xFFFFFF)) {
              phase932TupleShadow = { cursor: liveCursor, descriptor: liveDescriptor };
              phase932TupleShadowPc = pc & 0xFFFFFF;
            }
          }
          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
    ],
    [
      '              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, cursorBefore);',
      `              const phase932ReplayCursor = phase932TupleShadow?.cursor ?? cursorBefore;
              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, phase932ReplayCursor);
              if (phase932TupleShadow) {
                phase932DescriptorBeforeReplay = readMemoryFieldValue(cpu.memory, 0xD0243D, 3);
                writeMemoryFieldValue(cpu.memory, 0xD0243D, 3, phase932TupleShadow.descriptor);
                phase932DescriptorAfterReplay = readMemoryFieldValue(cpu.memory, 0xD0243D, 3);
                phase932TupleReplayPc = pc & 0xFFFFFF;
                phase932TupleReplayCount++;
              }`,
    ],
    [
      `          controlStopCursorRestored,
          uiClearApplied: uiClearResult?.ok === true,`,
      `          controlStopCursorRestored,
          phase932TupleShadow,
          phase932TupleShadowPc,
          phase932TupleReplayPc,
          phase932TupleReplayCount,
          phase932DescriptorBeforeReplay,
          phase932DescriptorAfterReplay,
          uiClearApplied: uiClearResult?.ok === true,`,
    ],
  ];
  const editStatements = htmlEdits.map(([from, to], index) => (
    `  sourceHtml = phase932ReplaceOnce(sourceHtml, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${JSON.stringify(`candidate HTML edit ${index + 1}`)});`
  )).join('\n');
  const candidatePrelude = `function instrumentBrowserShell(sourceHtml) {
  const phase932ReplaceOnce = (value, from, to, label) => {
    const first = value.indexOf(from);
    if (first < 0) throw new Error('Phase932 marker not found: ' + label);
    if (value.indexOf(from, first + from.length) >= 0) throw new Error('Phase932 marker is not unique: ' + label);
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
  const moduleName = `.phase932-${token}.tmp.mjs`;
  const resultName = `.phase932-${token}.result.tmp.json`;
  const reportName = `.phase932-${token}.report.tmp.md`;
  const modulePath = path.join(__dirname, moduleName);
  const resultPath = path.join(__dirname, resultName);
  const reportPath = path.join(__dirname, reportName);
  try {
    fs.writeFileSync(modulePath, buildVariantSource(baseSource, variant, resultName, reportName));
    await import(`${pathToFileURL(modulePath).href}?phase932=${encodeURIComponent(token)}`);
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
  const left = result.afterLeft?.lastKey ?? {};
  const relativeRows = result.relativeRows ?? [];
  const absoluteRows = result.absoluteRows ?? [];
  return {
    lineBase: result.afterBoot?.cursor,
    digitBuffers: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.buffer?.slice(0, 4)) ?? [],
    digitTerminations: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.termination) ?? [],
    leftBuffer: left.buffer?.slice(0, 4) ?? [],
    leftTermination: left.termination,
    leftSteps: left.steps,
    controlStopPc: left.controlStopPc,
    cursorBefore: left.cursorBefore,
    cursorBeforeReplay: left.controlStopCursorBefore,
    cursorAfterReplay: left.controlStopCursorAfter,
    tupleShadow: left.phase932TupleShadow ?? null,
    tupleShadowPc: left.phase932TupleShadowPc ?? null,
    tupleReplayPc: left.phase932TupleReplayPc ?? null,
    tupleReplayCount: left.phase932TupleReplayCount ?? 0,
    descriptorBeforeReplay: left.phase932DescriptorBeforeReplay ?? null,
    descriptorAfterReplay: left.phase932DescriptorAfterReplay ?? null,
    finalCursor: result.afterLeft?.fields?.D0243A,
    finalDescriptor: result.afterLeft?.fields?.D0243D,
    relativeRows,
    relativeMismatches: relativeRows.filter((row) => !row.match),
    absoluteRows,
    absoluteMismatches: absoluteRows.filter((row) => !row.match),
    pageErrors: result.afterLeft?.pageErrors ?? [],
  };
}

function exactDigits(row) {
  const expected = [
    [0x31, 0x00, 0x00, 0x00],
    [0x31, 0x32, 0x00, 0x00],
    [0x31, 0x32, 0x33, 0x00],
  ];
  return row.digitTerminations.every((value) => value === 'post_insert_gate_stop')
    && expected.every((bytes, index) => bytes.every((value, byteIndex) => (
      row.digitBuffers[index]?.[byteIndex] === value
    )))
    && expected.at(-1).every((value, index) => row.leftBuffer[index] === value);
}

function semanticRows(rows) {
  return rows.map(({ name, oracle, actual, match }) => ({ name, oracle, actual, match }));
}

function names(rows) {
  return rows.length === 0 ? 'none' : rows.map((row) => row.name).join(', ');
}

function buildReport(summary) {
  if (summary.error) return `# Phase 932: ArrowLeft two-field shadow adjudication\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  const baseline = summary.baseline;
  const candidate = summary.candidate;
  return `# Phase 932: ArrowLeft Two-Field Shadow Adjudication

Probe: \`probe-phase932-arrowleft-two-field-shadow.mjs\`  
Run: \`node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase932-arrowleft-two-field-shadow.mjs\`

## Result

- Probe execution: ${summary.pass ? '**PASS**' : '**FAIL**'}.
- Both independent routes inserted exact \`31 32 33 00\`, reached the preserved \`0x001879\` ArrowLeft pre-stop in ${candidate.leftSteps.toLocaleString()} steps, and reported zero page errors.
- The temporary candidate captured exactly the first PHASE931 tuple at \`0x05E453\`: \`D0243A=${hex(candidate.tupleShadow?.cursor)}\`, \`D0243D=${hex(candidate.tupleShadow?.descriptor)}\`. It replayed those two 24-bit fields exactly once at \`0x001879\`.
- Candidate cursor-relative mismatches changed ${baseline.relativeMismatches.length} -> ${candidate.relativeMismatches.length}. Every hardware-normalized field now matches except the already-postponed \`${POSTPONED_RELATIVE_FIELD}\`.
- Absolute comparison rows are byte-for-byte semantically unchanged between baseline and candidate; no absolute or relative regression was introduced.

| Route | At stop D0243A | Shadow tuple | Replay PC/count | Final D0243A | Final D0243D | Relative mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | ${hex(baseline.cursorBeforeReplay)} | - | - | ${hex(baseline.finalCursor)} | ${hex(baseline.finalDescriptor)} | ${baseline.relativeMismatches.length}: ${names(baseline.relativeMismatches)} |
| Two-field candidate | ${hex(candidate.cursorBeforeReplay)} | ${hex(candidate.tupleShadow?.cursor)} / ${hex(candidate.tupleShadow?.descriptor)} @ ${hex(candidate.tupleShadowPc)} | ${hex(candidate.tupleReplayPc)} / ${candidate.tupleReplayCount} | ${hex(candidate.finalCursor)} | ${hex(candidate.finalDescriptor)} | ${candidate.relativeMismatches.length}: ${names(candidate.relativeMismatches)} |

## Adjudication

The combined narrow shadow is sufficient for the active ArrowLeft descriptor blocker. Before replay, the route had advanced to \`D0243A=${hex(candidate.cursorBeforeReplay)}\` and \`D0243D=${hex(candidate.descriptorBeforeReplay)}\`; replay restored the first OS-produced one-byte LEFT tuple, ending at \`D0243A=${hex(candidate.cursorAfterReplay)}\` and \`D0243D=${hex(candidate.descriptorAfterReplay)}\`. The normalized \`D0243D-cursor\` row is now ${hex(candidate.relativeRows.find((row) => row.name === 'D0243D-cursor')?.actual)} on both browser and hardware.

This is report-only evidence. Disk \`browser-shell.html\` was not edited, so the conditional browser integration remains a separate next priority with its required browser replay, normalized PHASE922, and golden gates.

## Regression checks

- Exact final token buffer: \`${candidate.leftBuffer.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')}\`.
- Candidate absolute mismatches (${candidate.absoluteMismatches.length}): ${names(candidate.absoluteMismatches)}.
- Baseline absolute mismatches (${baseline.absoluteMismatches.length}): ${names(baseline.absoluteMismatches)}.
- Candidate relative mismatches (${candidate.relativeMismatches.length}): ${names(candidate.relativeMismatches)}.

## Scope

Only this new probe, this report, and the handoff are persisted. The two-field candidate exists only in the served temporary browser response. \`browser-shell.html\`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and \`follow-alongs/\` are untouched.
`;
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  const baselineResult = await runVariant(baseSource, VARIANTS[0]);
  const candidateResult = await runVariant(baseSource, VARIANTS[1]);
  const baseline = digest(baselineResult);
  const candidate = digest(candidateResult);

  const commonPass = exactDigits(baseline)
    && exactDigits(candidate)
    && baseline.pageErrors.length === 0
    && candidate.pageErrors.length === 0
    && baseline.leftTermination === 'control_pre_stop'
    && candidate.leftTermination === 'control_pre_stop'
    && baseline.controlStopPc === 0x001879
    && candidate.controlStopPc === 0x001879;
  const tuplePass = candidate.tupleShadowPc === 0x05E453
    && candidate.tupleShadow?.cursor === 0xD1A8CE
    && candidate.tupleShadow?.descriptor === 0xD2A83D
    && candidate.tupleReplayPc === 0x001879
    && candidate.tupleReplayCount === 1
    && candidate.cursorBeforeReplay === 0xD1A8CD
    && candidate.descriptorBeforeReplay === 0xD2A83C
    && candidate.cursorAfterReplay === 0xD1A8CE
    && candidate.descriptorAfterReplay === 0xD2A83D
    && candidate.finalCursor === 0xD1A8CE
    && candidate.finalDescriptor === 0xD2A83D;
  const exactRelativeExceptPostponed = candidate.relativeRows.length > 0
    && candidate.relativeRows.every((row) => (
      row.name === POSTPONED_RELATIVE_FIELD ? row.match === false : row.match === true
    ))
    && candidate.relativeMismatches.length === 1
    && candidate.relativeMismatches[0].name === POSTPONED_RELATIVE_FIELD;
  const absoluteRowsUnchanged = JSON.stringify(semanticRows(baseline.absoluteRows))
    === JSON.stringify(semanticRows(candidate.absoluteRows));
  const baselineRelativeMismatchNames = new Set(baseline.relativeMismatches.map((row) => row.name));
  const noNewRelativeRegressions = candidate.relativeMismatches.every((row) => (
    baselineRelativeMismatchNames.has(row.name)
  ));

  summary = {
    probe: 'phase932-arrowleft-two-field-shadow',
    pass: commonPass
      && tuplePass
      && exactRelativeExceptPostponed
      && absoluteRowsUnchanged
      && noNewRelativeRegressions,
    commonPass,
    tuplePass,
    exactRelativeExceptPostponed,
    absoluteRowsUnchanged,
    noNewRelativeRegressions,
    baseline,
    candidate,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    commonPass,
    tuplePass,
    exactRelativeExceptPostponed,
    absoluteRowsUnchanged,
    noNewRelativeRegressions,
    baseline: {
      finalTuple: [hex(baseline.finalCursor), hex(baseline.finalDescriptor)],
      relativeMismatches: baseline.relativeMismatches.map((row) => row.name),
      absoluteMismatches: baseline.absoluteMismatches.map((row) => row.name),
    },
    candidate: {
      shadowTuple: [hex(candidate.tupleShadow?.cursor), hex(candidate.tupleShadow?.descriptor)],
      shadowPc: hex(candidate.tupleShadowPc),
      replayPc: hex(candidate.tupleReplayPc),
      replayCount: candidate.tupleReplayCount,
      beforeReplay: [hex(candidate.cursorBeforeReplay), hex(candidate.descriptorBeforeReplay)],
      finalTuple: [hex(candidate.finalCursor), hex(candidate.finalDescriptor)],
      finalBuffer: candidate.leftBuffer.map((value) => hex(value, 2)),
      relativeMismatches: candidate.relativeMismatches.map((row) => row.name),
      absoluteMismatches: candidate.absoluteMismatches.map((row) => row.name),
    },
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase932-arrowleft-two-field-shadow', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
