import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = import.meta.dirname;

const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const PHASE892_REPORT = path.join(__dirname, 'phase892-d008e0-natural-lifetime.md');
const PHASE893_REPORT = path.join(__dirname, 'phase893-d008e0-field-stack-ab.md');
const REPORT_PATH = path.join(__dirname, 'phase894-d008e0-integration-closeout.md');

const ORACLE_D008E0 = 0xD1A86C;
const RAW_ORACLE_STACK = Object.freeze([
  [0xD1A86C, 0x061E27],
  [0xD1A86F, 0x061DD1],
  [0xD1A872, 0x000000],
  [0xD1A875, 0x000000],
  [0xD1A878, 0x000000],
  [0xD1A87B, 0x08C754],
]);

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function extractMachineJson(markdown, reportName) {
  const section = markdown.indexOf('## Machine JSON');
  if (section < 0) throw new Error(`${reportName}: missing Machine JSON section`);
  const fence = markdown.indexOf('```json', section);
  if (fence < 0) throw new Error(`${reportName}: missing json fence`);
  const start = markdown.indexOf('\n', fence) + 1;
  const end = markdown.indexOf('```', start);
  if (start <= 0 || end < 0) throw new Error(`${reportName}: unterminated json fence`);
  return JSON.parse(markdown.slice(start, end));
}

function scenarioById(phase893, id) {
  return phase893.scenarios.find((scenario) => scenario.id === id);
}

function sourceHasRawStackPacketWrites(source) {
  return RAW_ORACLE_STACK.some(([addr, value]) => {
    const pattern = new RegExp(`evalWrite24\\(mem,\\s*${hex(addr)},\\s*${hex(value)}\\)`, 'i');
    return pattern.test(source);
  });
}

function table(rows, columns) {
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row)).join(' | ')} |`),
  ].join('\n');
}

function buildReport(summary) {
  return [
    '# Phase 894: D008E0 Integration Status Closeout',
    '',
    'Probe: `probe-phase894-d008e0-integration-closeout.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase894-d008e0-integration-closeout.mjs`',
    '',
    'This is a source/evidence audit, not a browser execution probe. It parses the Phase892 and Phase893 machine JSON, checks the current `browser-shell.html` integration state, and records the D008E0 integration decision without changing browser source.',
    '',
    '## Result',
    '',
    `- Overall: ${summary.pass ? '**PASS**' : '**FAIL**'}.`,
    `- Source SHA-256: \`${summary.source.sha256}\`.`,
    `- Current helper field write present: ${summary.source.hasPrepareOracleWrite ? 'yes' : 'NO'}.`,
    `- Current raw errSP stack packet source writes present: ${summary.source.hasRawStackPacketWrites ? 'YES' : 'no'}.`,
    `- Phase892 natural oracle D008E0 writes: ${summary.phase892.naturalOracleD008E0Writes}.`,
    `- Phase893 no-helper mismatch: ${summary.phase893.noHelperMismatchNames.join(', ') || 'none'}.`,
    `- Phase893 stack packet load-bearing: ${summary.phase893.stackPacketLoadBearing ? 'YES' : 'no'}.`,
    '',
    '## Decision',
    '',
    '- Keep `prepareColdbootEventFrame()` writing `D008E0 = SCREEN_STACK_TOP - 18` (`0xD1A86C`). Phase893 proved that suppressing only this helper write leaves final `D008E0=0x000000` while the after-CLEAR oracle requires `0xD1A86C`.',
    '- Do not add the raw errSP stack packet (`061E27`, `061DD1`, zeros, `08C754`) as an autonomous browser patch. Phase893 proved it changes only the stack bytes in the bounded CLEAR route, not Phase6/CLEAR termination, page errors, watched fields, or UI-clear behavior.',
    '- Close the D008E0 integration frontier as helper-field-only accepted. The raw stack packet remains diagnostic context for future error-longjmp work, not current browser-demo work.',
    '',
    '## Evidence Checks',
    '',
    table(summary.checks, [
      { label: 'Check', value: (row) => row.name },
      { label: 'Status', value: (row) => (row.pass ? 'PASS' : 'FAIL') },
      { label: 'Detail', value: (row) => row.detail },
    ]),
    '',
    '## Phase893 Variant Summary',
    '',
    table(summary.phase893.variantRows, [
      { label: 'Variant', value: (row) => row.variant },
      { label: 'Clean', value: (row) => (row.clean ? 'yes' : 'NO') },
      { label: 'Final D008E0', value: (row) => row.finalD008E0 },
      { label: 'Field mismatches', value: (row) => String(row.fieldMismatches) },
      { label: 'Stack mismatches', value: (row) => String(row.stackMismatches) },
    ]),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

function run() {
  const source = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
  const phase892 = extractMachineJson(fs.readFileSync(PHASE892_REPORT, 'utf8'), 'phase892 report');
  const phase893 = extractMachineJson(fs.readFileSync(PHASE893_REPORT, 'utf8'), 'phase893 report');

  const baseline = scenarioById(phase893, 'baseline');
  const noHelper = scenarioById(phase893, 'no_prepare_d008e0');
  const fieldPlusStack = scenarioById(phase893, 'field_plus_stack');

  const checks = [];
  function check(name, pass, detail) {
    checks.push({ name, pass: Boolean(pass), detail });
  }

  const prepareFunctionMatch = source.match(/function prepareColdbootEventFrame\(\) \{[\s\S]*?\n\}/);
  const hasPrepareOracleWrite = /evalWrite24\(mem,\s*0xD008E0,\s*SCREEN_STACK_TOP\s*-\s*18\);/.test(prepareFunctionMatch?.[0] ?? '');
  const hasRawStackPacketWrites = sourceHasRawStackPacketWrites(source);
  const sourceSha = crypto.createHash('sha256').update(source).digest('hex');

  check('Phase892 passed', phase892.pass === true && phase892.analysis?.pass === true, 'prior lifetime trace machine JSON reports pass=true');
  check('No natural post-wipe oracle D008E0 owner', phase892.analysis?.naturalOracleD008E0Writes === 0, `naturalOracleD008E0Writes=${phase892.analysis?.naturalOracleD008E0Writes}`);
  check('Helper writes oracle D008E0 twice', phase892.analysis?.helperOracleD008E0Writes === 2, `helperOracleD008E0Writes=${phase892.analysis?.helperOracleD008E0Writes}`);
  check('Live raw errSP stack does not naturally match oracle', phase892.analysis?.keyStackMatchesOracle === false, `keyStackMatchesOracle=${phase892.analysis?.keyStackMatchesOracle}`);
  check('Phase893 passed', phase893.pass === true, 'field/stack A/B machine JSON reports pass=true');
  check('Current source has helper oracle field write', hasPrepareOracleWrite, 'prepareColdbootEventFrame writes D008E0 = SCREEN_STACK_TOP - 18');
  check('Current source has no raw oracle stack packet writes', !hasRawStackPacketWrites, 'no direct evalWrite24 source writes for the six raw errSP stack slots');
  check('Baseline route is clean', phase893.analysis?.baselineClean === true && baseline?.analysis?.finalFieldMismatches?.length === 0, 'Phase893 baseline field-only route has no watched-field mismatches');
  check('No-helper route isolates D008E0 mismatch', phase893.analysis?.noHelperFieldMismatchNames?.length === 1 && phase893.analysis.noHelperFieldMismatchNames[0] === 'D008E0', `mismatches=${phase893.analysis?.noHelperFieldMismatchNames?.join(',')}`);
  check('Raw stack packet is not load-bearing', phase893.analysis?.stackPacketLoadBearing === false, `stackPacketLoadBearing=${phase893.analysis?.stackPacketLoadBearing}`);
  check('Field-plus-stack remains clean', phase893.analysis?.stackVariantClean === true && phase893.analysis?.stackVariantStackMatches === true, 'injected stack packet matches stack oracle but changes no bounded behavior');

  const variantRows = [
    {
      variant: 'baseline',
      clean: Boolean(baseline?.analysis?.cleanPhase6 && baseline?.analysis?.cleanClear && !baseline?.analysis?.pageErrors?.length),
      finalD008E0: baseline?.analysis?.finalD008E0 == null ? '-' : hex(baseline.analysis.finalD008E0),
      fieldMismatches: baseline?.analysis?.finalFieldMismatches?.length ?? null,
      stackMismatches: baseline?.analysis?.finalStackMismatches?.length ?? null,
    },
    {
      variant: 'no_prepare_d008e0',
      clean: Boolean(noHelper?.analysis?.cleanPhase6 && noHelper?.analysis?.cleanClear && !noHelper?.analysis?.pageErrors?.length),
      finalD008E0: noHelper?.analysis?.finalD008E0 == null ? '-' : hex(noHelper.analysis.finalD008E0),
      fieldMismatches: noHelper?.analysis?.finalFieldMismatches?.length ?? null,
      stackMismatches: noHelper?.analysis?.finalStackMismatches?.length ?? null,
    },
    {
      variant: 'field_plus_stack',
      clean: Boolean(fieldPlusStack?.analysis?.cleanPhase6 && fieldPlusStack?.analysis?.cleanClear && !fieldPlusStack?.analysis?.pageErrors?.length),
      finalD008E0: fieldPlusStack?.analysis?.finalD008E0 == null ? '-' : hex(fieldPlusStack.analysis.finalD008E0),
      fieldMismatches: fieldPlusStack?.analysis?.finalFieldMismatches?.length ?? null,
      stackMismatches: fieldPlusStack?.analysis?.finalStackMismatches?.length ?? null,
    },
  ];

  const summary = {
    probe: 'phase894-d008e0-integration-closeout',
    pass: checks.every((row) => row.pass),
    source: {
      sha256: sourceSha,
      hasPrepareOracleWrite,
      hasRawStackPacketWrites,
      oracleD008E0: hex(ORACLE_D008E0),
    },
    phase892: {
      naturalOracleD008E0Writes: phase892.analysis?.naturalOracleD008E0Writes,
      helperOracleD008E0Writes: phase892.analysis?.helperOracleD008E0Writes,
      stableReplayD008E0Writes: phase892.analysis?.stableReplayD008E0Writes,
      keyStackMatchesOracle: phase892.analysis?.keyStackMatchesOracle,
    },
    phase893: {
      baselineClean: phase893.analysis?.baselineClean,
      noHelperClean: phase893.analysis?.noHelperClean,
      stackVariantClean: phase893.analysis?.stackVariantClean,
      stackVariantStackMatches: phase893.analysis?.stackVariantStackMatches,
      noHelperMismatchNames: phase893.analysis?.noHelperFieldMismatchNames ?? [],
      stackPacketLoadBearing: phase893.analysis?.stackPacketLoadBearing,
      variantRows,
    },
    decision: {
      keepPrepareColdbootEventFrameD008E0FieldWrite: true,
      addRawErrSpStackPacketToBrowserShell: false,
      d008e0FrontierClosedForCurrentBrowserClearRoute: true,
      remainingAutoSafeD008E0Work: false,
    },
    checks,
  };

  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    sourceSha: summary.source.sha256,
    keepHelperFieldWrite: summary.decision.keepPrepareColdbootEventFrameD008E0FieldWrite,
    addRawErrSpStackPacket: summary.decision.addRawErrSpStackPacketToBrowserShell,
    checksPassed: summary.checks.filter((row) => row.pass).length,
    checksTotal: summary.checks.length,
    report: path.basename(REPORT_PATH),
  }, null, 2));

  if (!summary.pass) process.exitCode = 1;
}

try {
  run();
} catch (error) {
  const failure = {
    probe: 'phase894-d008e0-integration-closeout',
    pass: false,
    error: String(error?.stack || error),
  };
  fs.writeFileSync(REPORT_PATH, `${buildReport({
    ...failure,
    source: { sha256: 'unavailable', hasPrepareOracleWrite: false, hasRawStackPacketWrites: false },
    phase892: {},
    phase893: { noHelperMismatchNames: [], variantRows: [] },
    decision: {},
    checks: [{ name: 'probe threw', pass: false, detail: failure.error.replace(/\r?\n/g, ' ') }],
  })}\n`);
  console.error(failure.error);
  process.exitCode = 1;
}
