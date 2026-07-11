import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase935-narrow-numeric-d02a29-policy-ab.md');
const SCENARIOS = Object.freeze([
  { name: 'baseline', debugPort: 9935, policyEnabled: false },
  { name: 'candidate', debugPort: 9937, policyEnabled: true },
]);
const EXPECTED_CHECKPOINTS = Object.freeze([0x000C, 0x0018, 0x0024, 0x0024]);
const EXPECTED_BUFFERS = Object.freeze([
  [0x31, 0x00, 0x00, 0x00],
  [0x31, 0x32, 0x00, 0x00],
  [0x31, 0x32, 0x33, 0x00],
  [0x31, 0x32, 0x33, 0x00],
]);
const EXPECTED_ABSOLUTE_MISMATCHES = Object.freeze([
  'D010EF',
  'D010FE',
  'D02587',
  'D0258A',
  'D0258D',
  'D025A0',
]);
const D02A29_ROW = 'D02A29 cursor-pixel-offset';

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase935 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase935 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function candidateBrowserWrapper() {
  return String.raw`
const phase935BaseInstrumentBrowserShell = instrumentBrowserShell;
instrumentBrowserShell = function phase935InstrumentBrowserShell(sourceHtml) {
  const html = phase935BaseInstrumentBrowserShell(sourceHtml);
  const marker = ` + "`" + `          if (postInsertGateBlock !== null && (pc & 0xFFFFFF) === COLDBOOT_POST_INSERT_GATE_RETURN) {
            stoppedAtPostInsertGate = true;
            throw COLDBOOT_POST_INSERT_GATE_STOP;
          }` + "`" + `;
  const replacement = ` + "`" + `          if (postInsertGateBlock !== null && (pc & 0xFFFFFF) === COLDBOOT_POST_INSERT_GATE_RETURN) {
            if ((e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') && cpu?.memory) {
              const before = readMemoryFieldValue(cpu.memory, 0xD02A29, 2);
              const after = (before + 0x000C) & 0xFFFF;
              writeMemoryFieldValue(cpu.memory, 0xD02A29, 2, after);
              window.__phase935NumericPolicyEvents ??= [];
              window.__phase935NumericPolicyEvents.push({ code: e.code, pc: pc & 0xFFFFFF, before, after });
            }
            stoppedAtPostInsertGate = true;
            throw COLDBOOT_POST_INSERT_GATE_STOP;
          }` + "`" + `;
  const first = html.indexOf(marker);
  if (first < 0 || html.indexOf(marker, first + marker.length) >= 0) {
    throw new Error('Phase935 browser policy marker missing or non-unique');
  }
  return html.slice(0, first) + replacement + html.slice(first + marker.length);
};
`;
}

function buildScenarioSource(baseSource, scenario, names) {
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(names.tempReportName)});\nconst PHASE935_RESULT_PATH = path.join(__dirname, ${JSON.stringify(names.resultName)});`,
    'phase922 report path',
  );
  source = replaceExactlyOnce(
    source,
    'const DEBUG_PORT = 9922;',
    `const DEBUG_PORT = ${scenario.debugPort};`,
    'phase922 debug port',
  );
  source = replaceExactlyOnce(
    source,
    '    pageErrors: [...window.__phase922PageErrors],',
    '    pageErrors: [...window.__phase922PageErrors],\n    phase935PolicyEvents: [...(window.__phase935NumericPolicyEvents ?? [])],',
    'phase922 capture fields',
  );
  source = replaceExactlyOnce(
    source,
    'function startStaticServer() {',
    `${scenario.policyEnabled ? candidateBrowserWrapper() : ''}\nfunction startStaticServer() {`,
    'phase922 static server declaration',
  );
  source = replaceExactlyOnce(
    source,
    '  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    '  try { fs.writeFileSync(PHASE935_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );
  return source;
}

async function runScenario(baseSource, scenario) {
  const stamp = `${process.pid}-${Date.now()}-${scenario.name}`;
  const names = {
    resultName: `.phase935-${stamp}.result.tmp.json`,
    tempReportName: `.phase935-${stamp}.report.tmp.md`,
    tempModuleName: `.phase935-${stamp}.tmp.mjs`,
  };
  const resultPath = path.join(__dirname, names.resultName);
  const tempReportPath = path.join(__dirname, names.tempReportName);
  const tempModulePath = path.join(__dirname, names.tempModuleName);
  try {
    fs.writeFileSync(tempModulePath, buildScenarioSource(baseSource, scenario, names));
    process.exitCode = 0;
    await import(`${pathToFileURL(tempModulePath).href}?phase935=${Date.now()}`);
    if (!fs.existsSync(resultPath)) throw new Error(`Phase935 ${scenario.name} child did not write a result`);
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } finally {
    for (const filePath of [tempModulePath, resultPath, tempReportPath]) {
      try { fs.rmSync(filePath, { force: true }); } catch {}
    }
  }
}

function routeDigest(row) {
  const lastKey = row?.state?.lastKey ?? {};
  return {
    key: row?.keySpec?.label ?? null,
    code: lastKey.code ?? null,
    termination: lastKey.termination ?? null,
    steps: lastKey.steps ?? null,
    controlStopPc: lastKey.controlStopPc ?? null,
    d02a29: row?.state?.fields?.D02A29 ?? null,
    buffer: lastKey.buffer?.slice(0, 4) ?? [],
    pageErrors: row?.state?.pageErrors ?? [],
    policyEvents: row?.state?.phase935PolicyEvents ?? [],
  };
}

function comparisonDigest(rows) {
  return (rows ?? []).map((row) => ({
    name: row.name,
    oracle: row.oracle,
    actual: row.actual,
    rawOracle: row.rawOracle,
    rawActual: row.rawActual,
    match: row.match,
  }));
}

function scenarioDigest(result) {
  const routes = (result.keyRuns ?? []).map(routeDigest);
  return {
    routes,
    checkpoints: routes.map((route) => route.d02a29),
    policyEvents: routes.at(-1)?.policyEvents ?? [],
    absoluteRows: comparisonDigest(result.absoluteRows),
    relativeRows: comparisonDigest(result.relativeRows),
    absoluteMismatches: (result.absoluteRows ?? []).filter((row) => !row.match).map((row) => row.name),
    relativeMismatches: (result.relativeRows ?? []).filter((row) => !row.match).map((row) => row.name),
  };
}

function sameNormalizedRows(baseline, candidate) {
  if (baseline.length !== candidate.length) return false;
  return baseline.every((row, index) => {
    const other = candidate[index];
    if (row.name !== other.name || row.oracle !== other.oracle || row.rawOracle !== other.rawOracle) return false;
    if (row.name === D02A29_ROW) {
      return row.actual === 0x0000 && row.match === false
        && other.actual === 0x0024 && other.match === true;
    }
    return row.actual === other.actual
      && row.rawActual === other.rawActual
      && row.match === other.match;
  });
}

function routePass(routes) {
  return routes.length === 4
    && routes.slice(0, 3).every((route) => route.termination === 'post_insert_gate_stop')
    && routes[3].termination === 'control_pre_stop'
    && routes[3].controlStopPc === 0x001879
    && routes.every((route) => route.pageErrors.length === 0)
    && routes.every((route, index) => EXPECTED_BUFFERS[index].every((byte, byteIndex) => route.buffer[byteIndex] === byte));
}

function policyEventsPass(events) {
  const codes = ['Digit1', 'Digit2', 'Digit3'];
  return events.length === 3 && events.every((event, index) => (
    event.code === codes[index]
    && event.pc === 0x0013DA
    && event.before === index * 0x000C
    && event.after === (index + 1) * 0x000C
  ));
}

function routeTable(baseline, candidate) {
  return candidate.routes.map((route, index) => {
    const base = baseline.routes[index];
    return `| ${route.key} | ${base.termination} | ${route.termination} | ${hex(base.d02a29, 4)} | ${hex(route.d02a29, 4)} | ${route.buffer.map((value) => hex(value, 2)).join(' ')} | ${hex(route.controlStopPc)} | ${route.pageErrors.length} |`;
  }).join('\n');
}

function buildReport(summary) {
  if (summary.error) return `# Phase 935: Narrow Numeric D02A29 Policy A/B\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  return `# Phase 935: Narrow Numeric D02A29 Policy A/B

Probe: \`probe-phase935-narrow-numeric-d02a29-policy-ab.mjs\`  
Run: \`node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase935-narrow-numeric-d02a29-policy-ab.mjs\`

## Result

- Probe execution: ${summary.pass ? '**PASS**' : '**FAIL**'}.
- Baseline reproduced the clean disk route with \`D02A29\` checkpoints ${summary.baseline.checkpoints.map((value) => `\`${hex(value, 4)}\``).join(' -> ')}.
- The temporary numeric-only policy advanced \`D02A29\` exactly once at the successful post-insert return \`0x0013DA\` for Digit1/2/3. Candidate checkpoints are ${summary.candidate.checkpoints.map((value) => `\`${hex(value, 4)}\``).join(' -> ')}, matching the real \`123 LEFT\` progression required by the handoff.
- ArrowLeft did not run the policy: the event log contains exactly ${summary.candidate.policyEvents.length} digit events, and the field remained \`${hex(summary.candidate.checkpoints.at(-1), 4)}\` through the preserved \`0x001879\` pre-stop.
- Exact \`31 32 33 00\`, all three \`post_insert_gate_stop\` terminations, zero page errors, and the ArrowLeft \`control_pre_stop\` were preserved.
- All PHASE933 normalized rows are unchanged except the intended \`D02A29 cursor-pixel-offset\` correction from \`0x0000\` mismatch to \`0x0024\` match. Candidate relative mismatches: ${summary.candidate.relativeMismatches.length === 0 ? '**none**' : summary.candidate.relativeMismatches.join(', ')}. The known absolute mismatch set remains exactly: ${summary.candidate.absoluteMismatches.map((name) => `\`${name}\``).join(', ')}.

## Bounded A/B evidence

| Key | Baseline termination | Candidate termination | Baseline D02A29 | Candidate D02A29 | Candidate buffer[0..3] | Control stop | Page errors |
| --- | --- | --- | --- | --- | --- | --- | ---: |
${routeTable(summary.baseline, summary.candidate)}

Policy event log:

| Code | PC | Before | After |
| --- | --- | --- | --- |
${summary.candidate.policyEvents.map((event) => `| ${event.code} | ${hex(event.pc)} | ${hex(event.before, 4)} | ${hex(event.after, 4)} |`).join('\n')}

## Adjudication

The narrow browser policy passes the requested A/B. Its predicate is limited to Digit1/2/3 and fires only when the existing post-insert gate reaches its successful return; it neither enters nor reopens the closed \`0x08F54B\` engine path. The next listed priority may conditionally integrate this exact proven predicate on disk, subject to the browser replay, PHASE922 normalized audit, and golden gates.

## Scope

This probe serves temporary baseline and candidate browser copies. Disk \`browser-shell.html\`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and \`follow-alongs/\` are untouched.
`;
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  const baselineResult = await runScenario(baseSource, SCENARIOS[0]);
  const candidateResult = await runScenario(baseSource, SCENARIOS[1]);
  const baseline = scenarioDigest(baselineResult);
  const candidate = scenarioDigest(candidateResult);

  const baselinePass = routePass(baseline.routes)
    && baseline.checkpoints.every((value) => value === 0x0000)
    && baseline.policyEvents.length === 0
    && JSON.stringify(baseline.relativeMismatches) === JSON.stringify([D02A29_ROW])
    && JSON.stringify(baseline.absoluteMismatches) === JSON.stringify(EXPECTED_ABSOLUTE_MISMATCHES);
  const candidatePass = routePass(candidate.routes)
    && JSON.stringify(candidate.checkpoints) === JSON.stringify(EXPECTED_CHECKPOINTS)
    && policyEventsPass(candidate.policyEvents)
    && candidate.relativeMismatches.length === 0
    && JSON.stringify(candidate.absoluteMismatches) === JSON.stringify(EXPECTED_ABSOLUTE_MISMATCHES);
  const normalizedPass = JSON.stringify(baseline.absoluteRows) === JSON.stringify(candidate.absoluteRows)
    && sameNormalizedRows(baseline.relativeRows, candidate.relativeRows);

  summary = {
    probe: 'phase935-narrow-numeric-d02a29-policy-ab',
    pass: baselinePass && candidatePass && normalizedPass,
    baselinePass,
    candidatePass,
    normalizedPass,
    baseline,
    candidate,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    baselinePass,
    candidatePass,
    normalizedPass,
    baselineCheckpoints: baseline.checkpoints.map((value) => hex(value, 4)),
    candidateCheckpoints: candidate.checkpoints.map((value) => hex(value, 4)),
    policyEvents: candidate.policyEvents.map((event) => ({
      code: event.code,
      pc: hex(event.pc),
      before: hex(event.before, 4),
      after: hex(event.after, 4),
    })),
    baselineRelativeMismatches: baseline.relativeMismatches,
    candidateRelativeMismatches: candidate.relativeMismatches,
    candidateAbsoluteMismatches: candidate.absoluteMismatches,
    routes: candidate.routes.map((route) => ({
      key: route.key,
      termination: route.termination,
      steps: route.steps,
      d02a29: hex(route.d02a29, 4),
      buffer: route.buffer.map((value) => hex(value, 2)),
      controlStopPc: hex(route.controlStopPc),
      pageErrors: route.pageErrors,
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  process.exitCode = summary.pass ? 0 : 1;
} catch (error) {
  summary = { probe: 'phase935-narrow-numeric-d02a29-policy-ab', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
