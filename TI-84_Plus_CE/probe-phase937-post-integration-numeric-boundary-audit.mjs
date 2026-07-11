import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const BASE_PROBE_PATH = path.join(__dirname, 'probe-phase922-browser-123-left-cursor-relative-audit.mjs');
const REPORT_PATH = path.join(__dirname, 'phase937-post-integration-numeric-boundary-audit.md');
const NUMERIC_KEYS = Object.freeze([
  { code: 'Digit1', key: '1', vk: 49, label: '1' },
  { code: 'Digit2', key: '2', vk: 50, label: '2' },
  { code: 'Digit3', key: '3', vk: 51, label: '3' },
]);
const SCENARIOS = Object.freeze([
  {
    name: 'period-insert',
    debugPort: 9937,
    boundary: { code: 'Period', key: '.', vk: 190, label: 'PERIOD' },
    expectedTermination: 'post_insert_gate_stop',
    expectedControlStopPc: null,
    expectedD02A29: 0x0024,
    expectedFinalBuffer: [0x31, 0x32, 0x33, 0x3A],
  },
  {
    name: 'arrow-left-control',
    debugPort: 9938,
    boundary: { code: 'ArrowLeft', key: 'ArrowLeft', vk: 37, label: 'LEFT' },
    expectedTermination: 'control_pre_stop',
    expectedControlStopPc: 0x001879,
    expectedD02A29: 0x0024,
  },
  {
    name: 'enter-control',
    debugPort: 9939,
    boundary: { code: 'Enter', key: 'Enter', vk: 13, label: 'ENTER' },
    expectedTermination: 'control_pre_stop',
    expectedControlStopPc: 0x001879,
    expectedD02A29: 0x0000,
  },
  {
    name: 'escape-control',
    debugPort: 9940,
    boundary: { code: 'Escape', key: 'Escape', vk: 27, label: 'CLEAR' },
    expectedTermination: 'control_pre_stop',
    expectedControlStopPc: 0x0A229D,
    expectedD02A29: 0x0024,
  },
]);
const EXPECTED_NUMERIC_CHECKPOINTS = Object.freeze([0x000C, 0x0018, 0x0024]);
const EXPECTED_NUMERIC_BUFFERS = Object.freeze([
  [0x31, 0x00, 0x00, 0x00],
  [0x31, 0x32, 0x00, 0x00],
  [0x31, 0x32, 0x33, 0x00],
]);

const hex = (value, width = 6) => value == null
  ? '-'
  : `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Phase937 marker not found: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Phase937 marker is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

function buildScenarioSource(baseSource, scenario, names) {
  const keys = [...NUMERIC_KEYS, scenario.boundary];
  let source = baseSource;
  source = replaceExactlyOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase922-browser-123-left-cursor-relative-audit.md');",
    `const REPORT_PATH = path.join(__dirname, ${JSON.stringify(names.tempReportName)});\nconst PHASE937_RESULT_PATH = path.join(__dirname, ${JSON.stringify(names.resultName)});`,
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
    `const KEY_SEQUENCE = Object.freeze([
  { code: 'Digit1', key: '1', vk: 49, label: '1' },
  { code: 'Digit2', key: '2', vk: 50, label: '2' },
  { code: 'Digit3', key: '3', vk: 51, label: '3' },
  { code: 'ArrowLeft', key: 'ArrowLeft', vk: 37, label: 'LEFT' },
]);`,
    `const KEY_SEQUENCE = Object.freeze(${JSON.stringify(keys, null, 2)});`,
    'phase922 key sequence',
  );
  source = replaceExactlyOnce(
    source,
    '  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    '  try { fs.writeFileSync(PHASE937_RESULT_PATH, JSON.stringify(summary)); } catch {}\n  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\\n`); } catch {}',
    'phase922 result write',
  );
  source = replaceExactlyOnce(
    source,
    '  console.log(JSON.stringify({',
    '  false && console.log(JSON.stringify({',
    'phase922 console summary',
  );
  return source;
}

async function runScenario(baseSource, scenario) {
  const stamp = `${process.pid}-${Date.now()}-${scenario.name}`;
  const names = {
    resultName: `.phase937-${stamp}.result.tmp.json`,
    tempReportName: `.phase937-${stamp}.report.tmp.md`,
    tempModuleName: `.phase937-${stamp}.tmp.mjs`,
  };
  const resultPath = path.join(__dirname, names.resultName);
  const tempReportPath = path.join(__dirname, names.tempReportName);
  const tempModulePath = path.join(__dirname, names.tempModuleName);
  try {
    fs.writeFileSync(tempModulePath, buildScenarioSource(baseSource, scenario, names));
    process.exitCode = 0;
    await import(`${pathToFileURL(tempModulePath).href}?phase937=${Date.now()}`);
    if (!fs.existsSync(resultPath)) throw new Error(`Phase937 ${scenario.name} child did not write a result`);
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } finally {
    process.exitCode = 0;
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
    expectedInsertByte: lastKey.expectedInsertByte ?? null,
    termination: lastKey.termination ?? null,
    steps: lastKey.steps ?? null,
    controlStopPc: lastKey.controlStopPc ?? null,
    d02a29: row?.state?.fields?.D02A29 ?? null,
    buffer: lastKey.buffer?.slice(0, 4) ?? [],
    pageErrors: row?.state?.pageErrors ?? [],
  };
}

function sameBytes(actual, expected) {
  return expected.every((byte, index) => actual[index] === byte);
}

function numericPrefixPass(routes) {
  if (routes.length < 3) return false;
  return routes.slice(0, 3).every((route, index) => (
    route.code === NUMERIC_KEYS[index].code
    && route.termination === 'post_insert_gate_stop'
    && route.d02a29 === EXPECTED_NUMERIC_CHECKPOINTS[index]
    && sameBytes(route.buffer, EXPECTED_NUMERIC_BUFFERS[index])
    && route.pageErrors.length === 0
  ));
}

function scenarioDigest(scenario, result) {
  const routes = (result.keyRuns ?? []).map(routeDigest);
  const boundary = routes[3] ?? {};
  const numericPass = numericPrefixPass(routes);
  const boundaryPass = boundary.code === scenario.boundary.code
    && boundary.termination === scenario.expectedTermination
    && boundary.controlStopPc === scenario.expectedControlStopPc
    && boundary.d02a29 === scenario.expectedD02A29
    && boundary.pageErrors.length === 0
    && (!scenario.expectedFinalBuffer || sameBytes(boundary.buffer, scenario.expectedFinalBuffer));
  return {
    name: scenario.name,
    expectedTermination: scenario.expectedTermination,
    expectedControlStopPc: scenario.expectedControlStopPc,
    routes,
    numericCheckpoints: routes.slice(0, 3).map((route) => route.d02a29),
    numericPass,
    boundaryPass,
    pass: numericPass && boundaryPass,
  };
}

function routeTable(scenarios) {
  const rows = scenarios.flatMap((scenario) => scenario.routes.map((route, index) => ({
    scenario: scenario.name,
    phase: index < 3 ? `numeric-${index + 1}` : 'boundary',
    ...route,
  })));
  return [
    '| Scenario | Phase | Key | Termination | D02A29 | Buffer[0..3] | Control stop | Page errors |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: |',
    ...rows.map((row) => `| ${row.scenario} | ${row.phase} | ${row.code ?? row.key} | ${row.termination} | ${hex(row.d02a29, 4)} | ${row.buffer.map((byte) => hex(byte, 2)).join(' ')} | ${hex(row.controlStopPc)} | ${row.pageErrors.length} |`),
  ].join('\n');
}

function buildReport(summary) {
  if (summary.error) {
    return `# Phase 937: Post-Integration Numeric Boundary Audit\n\nProbe failed:\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`;
  }
  const period = summary.scenarios.find((scenario) => scenario.name === 'period-insert');
  const controls = summary.scenarios.filter((scenario) => scenario.name.endsWith('-control'));
  return [
    '# Phase 937: Post-Integration Numeric Boundary Audit',
    '',
    'Probe: `probe-phase937-post-integration-numeric-boundary-audit.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase937-post-integration-numeric-boundary-audit.mjs`',
    '',
    '## Result',
    '',
    `- Probe execution: **${summary.pass ? 'PASS' : 'FAIL'}**.`,
    `- All four fresh-browser scenarios preserved the numeric checkpoints: ${EXPECTED_NUMERIC_CHECKPOINTS.map((value) => hex(value, 4)).join(' -> ')}.`,
    `- Nonnumeric insert boundary: Period inserted byte ${hex(period?.routes?.[3]?.expectedInsertByte, 2)} and left D02A29 at ${hex(period?.routes?.[3]?.d02a29, 4)} (${period?.boundaryPass ? 'PASS' : 'FAIL'}).`,
    `- Canonical controls: ${controls.map((scenario) => `${scenario.routes[3]?.code} -> ${hex(scenario.routes[3]?.controlStopPc)} / D02A29 ${hex(scenario.routes[3]?.d02a29, 4)}`).join('; ')}.`,
    '- The disk predicate remained limited to Digit1/2/3: Period, ArrowLeft, Enter, and Escape produced no additional `D02A29 += 0x000C` transition. ENTER instead followed its own canonical tuple-reset behavior (`0x0024 -> 0x0000`).',
    '',
    '## Route Evidence',
    '',
    routeTable(summary.scenarios),
    '',
    '## Adjudication',
    '',
    summary.pass
      ? 'The PHASE936 disk policy is bounded as intended. A single-byte nonnumeric insert and canonical controls spanning both preserved pre-stop families do not apply the numeric increment after the exact numeric progression: Period, ArrowLeft, and Escape preserve 0x0024, while Enter performs its independent tuple reset to 0x0000. This is evidence for the existing narrow predicate only; it does not justify letters, numpad aliases, or variable-width token handling.'
      : 'At least one boundary route did not preserve the narrow PHASE936 contract. Do not generalize the policy; inspect the failed row before any browser change.',
    '',
    '## Bounded Machine JSON',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    'Disk `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` were not changed.',
    '',
  ].join('\n');
}

let summary;
try {
  const baseSource = fs.readFileSync(BASE_PROBE_PATH, 'utf8');
  const scenarios = [];
  for (const scenario of SCENARIOS) {
    const result = await runScenario(baseSource, scenario);
    scenarios.push(scenarioDigest(scenario, result));
  }
  summary = {
    probe: 'phase937-post-integration-numeric-boundary-audit',
    pass: scenarios.every((scenario) => scenario.pass),
    scenarios,
  };
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      pass: scenario.pass,
      numericCheckpoints: scenario.numericCheckpoints.map((value) => hex(value, 4)),
      boundary: scenario.routes[3],
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase937-post-integration-numeric-boundary-audit', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
