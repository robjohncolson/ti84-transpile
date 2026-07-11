import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase931-d0243d-arrowleft-lifetime.md');
const VARIANTS = Object.freeze([
  { name: 'baseline', debugPort: 9932, candidate: false },
  { name: 'cursor-shadow', debugPort: 9933, candidate: true },
]);

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase931 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase931 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function buildVariantSource(baseSource, variant, resultName, reportName) {
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(reportName)});\nconst PHASE931_RESULT_PATH = path.join(__dirname, ${JSON.stringify(resultName)});`,
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
    '  try { fs.writeFileSync(PHASE931_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );

  source = replaceExactlyOnce(
    source,
    `      firstChanges: [],
      start: phase922Capture(label + ':start'),`,
    `      firstChanges: [],
      transitions: [],
      start: phase922Capture(label + ':start'),`,
    'transition list initialization',
  );
  source = replaceExactlyOnce(
    source,
    `      const before = record.lastFields?.[name];
      if (before === after) continue;
      if (!record.firstChanges.some((row) => row.name === name)) {`,
    `      const before = record.lastFields?.[name];
      if (before === after) continue;
      if ((name === 'D0243A' || name === 'D0243D') && record.transitions.length < 32) {
        record.transitions.push({ name, before, after, pc: addr, prevPc: record.prevPc, block: record.blocks });
      }
      if (!record.firstChanges.some((row) => row.name === name)) {`,
    'all transition capture',
  );

  if (!variant.candidate) return source;

  const htmlEdits = [
    [
      '        let controlStopCursorRestored = false;',
      `        let controlStopCursorRestored = false;
        let phase931CursorShadow = null;
        let phase931CursorShadowPc = null;`,
    ],
    [
      `          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
      `          if (e.code === 'ArrowLeft'
              && phase931CursorShadow === null
              && cursorBefore !== null
              && cpu?.memory
              && (pc & 0xFFFFFF) === 0x05E453) {
            const liveCursor = readMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3);
            if (liveCursor === ((cursorBefore - 1) & 0xFFFFFF)) {
              phase931CursorShadow = liveCursor;
              phase931CursorShadowPc = pc & 0xFFFFFF;
            }
          }
          if (controlPreStop && (pc & 0xFFFFFF) === controlPreStop.pc) {`,
    ],
    [
      '              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, cursorBefore);',
      '              writeMemoryFieldValue(cpu.memory, COLDBOOT_EDIT_CURSOR_ADDR, 3, phase931CursorShadow ?? cursorBefore);',
    ],
    [
      `          controlStopCursorRestored,
          uiClearApplied: uiClearResult?.ok === true,`,
      `          controlStopCursorRestored,
          phase931CursorShadow,
          phase931CursorShadowPc,
          uiClearApplied: uiClearResult?.ok === true,`,
    ],
  ];
  const editStatements = htmlEdits.map(([from, to], index) => (
    `  sourceHtml = phase931ReplaceOnce(sourceHtml, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${JSON.stringify(`candidate HTML edit ${index + 1}`)});`
  )).join('\n');
  const candidatePrelude = `function instrumentBrowserShell(sourceHtml) {
  const phase931ReplaceOnce = (value, from, to, label) => {
    const first = value.indexOf(from);
    if (first < 0) throw new Error('Phase931 marker not found: ' + label);
    if (value.indexOf(from, first + from.length) >= 0) throw new Error('Phase931 marker is not unique: ' + label);
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
  const moduleName = `.phase931-${token}.tmp.mjs`;
  const resultName = `.phase931-${token}.result.tmp.json`;
  const reportName = `.phase931-${token}.report.tmp.md`;
  const modulePath = path.join(__dirname, moduleName);
  const resultPath = path.join(__dirname, resultName);
  const reportPath = path.join(__dirname, reportName);
  try {
    fs.writeFileSync(modulePath, buildVariantSource(baseSource, variant, resultName, reportName));
    await import(`${pathToFileURL(modulePath).href}?phase931=${encodeURIComponent(token)}`);
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

function phase931TraceDigest(result) {
  const lineBase = result.afterBoot?.cursor;
  const leftRun = result.keyRuns?.at(-1);
  const left = result.afterLeft?.lastKey ?? {};
  const relativeRows = result.relativeRows ?? [];
  const descriptorRow = relativeRows.find((row) => row.name === 'D0243D-cursor') ?? null;
  return {
    lineBase,
    digitBuffers: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.buffer?.slice(0, 4)) ?? [],
    digitTerminations: result.keyRuns?.slice(0, 3).map((row) => row.state.lastKey?.termination) ?? [],
    leftTermination: left.termination,
    leftSteps: left.steps,
    controlStopPc: left.controlStopPc,
    cursorBefore: left.cursorBefore,
    cursorShadow: left.phase931CursorShadow ?? null,
    cursorShadowPc: left.phase931CursorShadowPc ?? null,
    finalCursor: result.afterLeft?.fields?.D0243A,
    finalDescriptor: result.afterLeft?.fields?.D0243D,
    descriptorRow,
    cursorTransitions: (leftRun?.record?.transitions ?? []).filter((row) => row.name === 'D0243A'),
    descriptorTransitions: (leftRun?.record?.transitions ?? []).filter((row) => row.name === 'D0243D'),
    pageErrors: result.afterLeft?.pageErrors ?? [],
  };
}

function cleanDigits(row) {
  const expected = [[0x31], [0x31, 0x32], [0x31, 0x32, 0x33]];
  return row.digitTerminations.every((value) => value === 'post_insert_gate_stop')
    && expected.every((bytes, index) => bytes.every((value, byteIndex) => (
      row.digitBuffers[index]?.[byteIndex] === value
    )));
}

function transitionRows(rows) {
  return rows.map((row, index) => `| ${index + 1} | ${row.block} | ${hex(row.prevPc)} | ${hex(row.pc)} | ${hex(row.before)} | ${hex(row.after)} |`).join('\n');
}

function buildReport(summary) {
  if (summary.error) return `# Phase 931: D0243D ArrowLeft owner/lifetime\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  const baseline = summary.baseline;
  const candidate = summary.candidate;
  return `# Phase 931: D0243D ArrowLeft Owner/Lifetime

Probe: \`probe-phase931-d0243d-arrowleft-lifetime.mjs\`  
Run: \`node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase931-d0243d-arrowleft-lifetime.mjs\`

## Result

- Probe execution: ${summary.pass ? '**PASS**' : '**FAIL**'}.
- Both bounded routes inserted exact \`31 32 33 00\`, reached the preserved \`0x001879\` control pre-stop in ${baseline.leftSteps.toLocaleString()} steps, and reported zero page errors.
- Baseline and PHASE930-style cursor-shadow routes have the same complete \`D0243D\` lifetime: two decrements by the same \`0x05E26C\` block, both returning through \`0x05E453\`. The first pass (block ${candidate.descriptorTransitions[0]?.block}) produces \`${hex(summary.compatibleDescriptor)}\`; the second pass (block ${candidate.descriptorTransitions[1]?.block}) produces \`${hex(candidate.finalDescriptor)}\` before the route later reaches \`0x001879\`.
- With the candidate final cursor \`${hex(candidate.finalCursor)}\`, the hardware-normalized \`D0243D-cursor\` delta \`${hex(candidate.descriptorRow?.oracle)}\` requires raw \`D0243D=${hex(summary.compatibleDescriptor)}\`. The first transition is therefore the first hardware-compatible one-byte value.

## Complete bounded D0243D timeline

| # | Block | Owner PC | Observed/return PC | Before | After |
| ---: | ---: | --- | --- | --- | --- |
${transitionRows(candidate.descriptorTransitions)}

The two rows come from the lifted block at \`0x05E26C\`: it stores the incoming \`HL\` to \`D0243A\`, loads \`D0243D\`, decrements \`HL\`, copies the displaced byte through the gap, writes the decremented \`HL\` back to \`D0243D\`, and returns. Its first invocation creates the valid one-byte LEFT tuple; its second invocation advances both pointers one byte farther before the pre-stop.

## Why cursor-only replay remains one byte short

| Route | Final D0243A | Final D0243D | D0243D-cursor actual | Hardware oracle | Match |
| --- | --- | --- | --- | --- | --- |
| Baseline | ${hex(baseline.finalCursor)} | ${hex(baseline.finalDescriptor)} | ${hex(baseline.descriptorRow?.actual)} | ${hex(baseline.descriptorRow?.oracle)} | ${baseline.descriptorRow?.match ? 'yes' : 'NO'} |
| Cursor shadow | ${hex(candidate.finalCursor)} | ${hex(candidate.finalDescriptor)} | ${hex(candidate.descriptorRow?.actual)} | ${hex(candidate.descriptorRow?.oracle)} | ${candidate.descriptorRow?.match ? 'yes' : 'NO'} |

PHASE930 replays only the first valid \`D0243A\` value at \`0x001879\`. It does not replay \`D0243D\`, so the second \`0x05E26C\` decrement survives. The final candidate tuple is therefore \`D0243A=${hex(candidate.finalCursor)}\`, \`D0243D=${hex(candidate.finalDescriptor)}\`: normalized delta \`${hex(candidate.descriptorRow?.actual)}\`, exactly one below hardware's \`${hex(candidate.descriptorRow?.oracle)}\`. An equally narrow combined probe-local shadow may now use the first \`D0243D=${hex(summary.compatibleDescriptor)}\` observed at \`0x05E453\`; no disk patch is made here.

## Scope

Only this new probe, this report, and the handoff are persisted. The candidate exists only in the served temporary browser response. \`browser-shell.html\`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and \`follow-alongs/\` are untouched.
`;
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  const baselineResult = await runVariant(baseSource, VARIANTS[0]);
  const candidateResult = await runVariant(baseSource, VARIANTS[1]);
  const baseline = phase931TraceDigest(baselineResult);
  const candidate = phase931TraceDigest(candidateResult);
  const compatibleDescriptor = candidate.finalCursor == null || candidate.descriptorRow?.oracle == null
    ? null
    : (candidate.finalCursor + candidate.descriptorRow.oracle) & 0xFFFFFF;
  const expectedTransitions = candidate.descriptorTransitions.length === 2
    && candidate.descriptorTransitions[0].before === 0xD2A83E
    && candidate.descriptorTransitions[0].after === 0xD2A83D
    && candidate.descriptorTransitions[0].prevPc === 0x05E26C
    && candidate.descriptorTransitions[0].pc === 0x05E453
    && candidate.descriptorTransitions[1].before === 0xD2A83D
    && candidate.descriptorTransitions[1].after === 0xD2A83C
    && candidate.descriptorTransitions[1].prevPc === 0x05E26C
    && candidate.descriptorTransitions[1].pc === 0x05E453
    && candidate.descriptorTransitions[0].block === 2187
    && candidate.descriptorTransitions[1].block === 4424;
  const commonPass = cleanDigits(baseline)
    && cleanDigits(candidate)
    && baseline.pageErrors.length === 0
    && candidate.pageErrors.length === 0
    && baseline.leftTermination === 'control_pre_stop'
    && candidate.leftTermination === 'control_pre_stop'
    && baseline.controlStopPc === 0x001879
    && candidate.controlStopPc === 0x001879;
  const candidateExplained = candidate.cursorShadow === 0xD1A8CE
    && candidate.cursorShadowPc === 0x05E453
    && candidate.finalCursor === 0xD1A8CE
    && candidate.finalDescriptor === 0xD2A83C
    && candidate.descriptorRow?.actual === 0x00FF6E
    && candidate.descriptorRow?.oracle === 0x00FF6F
    && compatibleDescriptor === 0xD2A83D;
  const timelinesMatch = JSON.stringify(baseline.descriptorTransitions) === JSON.stringify(candidate.descriptorTransitions);
  summary = {
    probe: 'phase931-d0243d-arrowleft-lifetime',
    pass: commonPass && expectedTransitions && candidateExplained && timelinesMatch,
    commonPass,
    expectedTransitions,
    candidateExplained,
    timelinesMatch,
    compatibleDescriptor,
    baseline,
    candidate,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    commonPass,
    expectedTransitions,
    candidateExplained,
    timelinesMatch,
    compatibleDescriptor: hex(compatibleDescriptor),
    baseline: {
      finalCursor: hex(baseline.finalCursor),
      finalDescriptor: hex(baseline.finalDescriptor),
      actualDelta: hex(baseline.descriptorRow?.actual),
      transitions: baseline.descriptorTransitions.map((row) => ({
        block: row.block,
        ownerPc: hex(row.prevPc),
        observedPc: hex(row.pc),
        before: hex(row.before),
        after: hex(row.after),
      })),
    },
    candidate: {
      finalCursor: hex(candidate.finalCursor),
      finalDescriptor: hex(candidate.finalDescriptor),
      actualDelta: hex(candidate.descriptorRow?.actual),
      oracleDelta: hex(candidate.descriptorRow?.oracle),
      transitions: candidate.descriptorTransitions.map((row) => ({
        block: row.block,
        ownerPc: hex(row.prevPc),
        observedPc: hex(row.pc),
        before: hex(row.before),
        after: hex(row.after),
      })),
    },
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase931-d0243d-arrowleft-lifetime', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
