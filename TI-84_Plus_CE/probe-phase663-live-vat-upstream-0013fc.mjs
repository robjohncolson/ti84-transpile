import fs from 'node:fs';
import path from 'node:path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = import.meta.dirname;
const TEMPLATE_PATH = path.join(__dirname, 'probe-phase659-cleanup-gate-state.mjs');
const REPORT_PATH = path.join(__dirname, 'phase663-live-vat-upstream-0013fc.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const UPSTREAM_TARGETS = Object.freeze([
  'up003c42',
  'up003b0d',
  'up003b17',
  'up0013f4',
  'up0013f8',
  'up0028d1',
  'up0013fc',
]);

const TARGET_LABELS = Object.freeze({
  up003c42: '0x003C42',
  up003b0d: '0x003B0D',
  up003b17: '0x003B17',
  up0013f4: '0x0013F4',
  up0013f8: '0x0013F8',
  up0028d1: '0x0028D1',
  up0013fc: '0x0013FC',
  frame0061e9: '0x0061E9',
  lowBranch0013fc: '0x0013FC',
});

function replaceOnce(source, needle, replacement) {
  if (!source.includes(needle)) {
    throw new Error(`Template marker not found: ${needle.slice(0, 120)}`);
  }
  return source.replace(needle, replacement);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function markdownTable(rows) {
  return rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');
}

function romBytes(rom, pc, length) {
  return Array.from(rom.slice(pc, pc + length))
    .map((byte) => hex(byte, 2))
    .join(' ');
}

function formatInstruction(insn) {
  const tag = insn.tag ?? 'unknown';
  switch (tag) {
    case 'call': return `CALL ${hex(insn.target)}`;
    case 'call-conditional': return `CALL ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jp': return `JP ${hex(insn.target)}`;
    case 'jp-conditional': return `JP ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jr': return `JR ${hex(insn.target)}`;
    case 'jr-conditional': return `JR ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(insn.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(insn.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(insn.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(insn.pair).toUpperCase()},${hex(insn.value)}`;
    case 'ld-reg-imm': return `LD ${String(insn.dest).toUpperCase()},${hex(insn.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(insn.dest).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(insn.addr)}),${String(insn.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return insn.direction === 'to-mem'
        ? `LD (${hex(insn.addr)}),${String(insn.pair).toUpperCase()}`
        : `LD ${String(insn.pair).toUpperCase()},(${hex(insn.addr)})`;
    case 'inc-reg': return `INC ${String(insn.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(insn.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(insn.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(insn.pair).toUpperCase()}`;
    case 'alu-reg': return `${String(insn.op).toUpperCase()} ${String(insn.src).toUpperCase()}`;
    case 'alu-imm': return `${String(insn.op).toUpperCase()} ${hex(insn.value, 2)}`;
    case 'bit-test': return `BIT ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'bit-set': return `SET ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'bit-res': return `RES ${insn.bit},${String(insn.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${insn.bit},(${String(insn.indexRegister).toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'indexed-cb-set':
      return `SET ${insn.bit},(${String(insn.indexRegister).toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'indexed-cb-res':
      return `RES ${insn.bit},(${String(insn.indexRegister).toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'in0': return `IN0 ${String(insn.reg).toUpperCase()},(${hex(insn.port, 2)})`;
    case 'out0': return `OUT0 (${hex(insn.port, 2)}),${String(insn.reg).toUpperCase()}`;
    case 'ldir': return 'LDIR';
    case 'halt': return 'HALT';
    case 'nop': return 'NOP';
    default:
      return `${String(tag).toUpperCase()} ${JSON.stringify(insn).replaceAll('|', '\\|')}`;
  }
}

function decodeWindow(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      const length = Math.max(1, insn.length ?? (insn.nextPc - pc));
      rows.push({
        address: hex(pc),
        bytes: romBytes(rom, pc, length),
        instruction: formatInstruction(insn),
      });
      pc = insn.nextPc ?? (pc + length);
    } catch (error) {
      rows.push({
        address: hex(pc),
        bytes: hex(rom[pc] ?? 0, 2),
        instruction: `DB ${hex(rom[pc] ?? 0, 2)} ; ${error.message}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function directTargetRefs(rom, target) {
  const directOps = new Map([
    [0xC3, 'JP'],
    [0xCD, 'CALL'],
    [0xC2, 'JP NZ'],
    [0xCA, 'JP Z'],
    [0xD2, 'JP NC'],
    [0xDA, 'JP C'],
    [0xE2, 'JP PO'],
    [0xEA, 'JP PE'],
    [0xF2, 'JP P'],
    [0xFA, 'JP M'],
    [0xC4, 'CALL NZ'],
    [0xCC, 'CALL Z'],
    [0xD4, 'CALL NC'],
    [0xDC, 'CALL C'],
    [0xE4, 'CALL PO'],
    [0xEC, 'CALL PE'],
    [0xF4, 'CALL P'],
    [0xFC, 'CALL M'],
  ]);
  const refs = [];
  for (let pc = 0; pc + 3 < rom.length; pc += 1) {
    const op = rom[pc];
    if (!directOps.has(op)) continue;
    const value = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (value !== target) continue;
    let decoded = null;
    try {
      decoded = decodeInstruction(rom, pc, 'adl');
    } catch {}
    refs.push({
      pc,
      op: directOps.get(op),
      bytes: romBytes(rom, pc, 4),
      decoded: decoded ? formatInstruction(decoded) : `${directOps.get(op)} ${hex(target)}`,
      context: decodeWindow(rom, Math.max(0, pc - 12), Math.min(rom.length, pc + 24)),
    });
  }
  return refs;
}

function targetHits(record, names) {
  const counts = record?.counts ?? {};
  return names.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
}

function samplesFor(record, target) {
  return [
    ...(record?.gateSamples ?? []),
    ...(record?.targetSamples ?? []),
  ].filter((sample) => sample.target === target);
}

function firstSample(record, target) {
  return samplesFor(record, target).sort((a, b) => a.block - b.block)[0] ?? null;
}

function cpuBrief(cpu) {
  if (!cpu) return 'n/a';
  return `AF=${cpu.af} IX=${cpu.ix} SP=${cpu.sp} Z=${cpu.flags?.z} C=${cpu.flags?.c}`;
}

function fieldBrief(fields) {
  if (!fields) return 'n/a';
  return [
    `D0058E=${hex(fields.D0058E ?? 0, 2)}`,
    `D007CA=${hex(fields.D007CA ?? 0)}`,
    `D008E0=${hex(fields.D008E0 ?? 0)}`,
    `VAT=${hex(fields.VAT_D02590 ?? 0)}/${hex(fields.VAT_D0259D ?? 0)}`,
  ].join(' ');
}

function sampleBrief(sample) {
  if (!sample) return 'missing';
  const recent = sample.recentBlocks?.slice(-10).join(' -> ') ?? '';
  return [
    `${sample.target}@${sample.pc}#${sample.block}`,
    `prev=${sample.previousPc ?? 'n/a'}`,
    cpuBrief(sample.cpu),
    `stack0=${sample.stack24?.[0]?.value ?? 'n/a'}`,
    fieldBrief(sample.routeFields ?? sample.before),
    `recent=${recent}`,
  ].join('; ');
}

function hitRows(record, targets) {
  return targets.map((target) => {
    const sample = firstSample(record, target);
    return [
      TARGET_LABELS[target] ?? target,
      record?.counts?.[target] ?? 0,
      sample?.block ?? '',
      sample?.previousPc ?? '',
      sample?.cpu?.af ?? '',
      sample?.cpu?.ix ?? '',
      sample?.cpu?.sp ?? '',
      sample?.stack24?.[0]?.value ?? '',
      fieldBrief(sample?.routeFields ?? sample?.before),
      sample?.recentBlocks?.slice(-12).join(' -> ') ?? '',
    ];
  });
}

function routeSummary(record) {
  const tokenNames = [
    'outer08f3b8',
    'tokenReader090883',
    'tokenExit08f5e1',
    'tokenGate090992',
    'tokenStore09098e',
    'eolTuple08f54b',
  ];
  const lowNames = [
    'low006d38',
    'low006d4f',
    'low006d5d',
    'displaySeed013d11',
    'displayLoop0059c6',
    'lowBranch0013fc',
    ...UPSTREAM_TARGETS,
  ];
  return {
    label: record?.label,
    totalBlocks: record?.totalBlocks ?? 0,
    tokenHookHits: targetHits(record, tokenNames),
    lowPathHits: targetHits(record, lowNames),
    cleanupHits: record?.counts?.cleanup0018f8 ?? 0,
    cxMainHits: record?.counts?.cxMain0585e9 ?? 0,
    keyHandlerHits: record?.counts?.keyHandler05877a ?? 0,
    upstreamCounts: Object.fromEntries(UPSTREAM_TARGETS.map((target) => [target, record?.counts?.[target] ?? 0])),
    frame0061e9Hits: record?.counts?.frame0061e9 ?? 0,
    startFields: record?.start?.routeFields ?? null,
    endFields: record?.end?.routeFields ?? null,
    firstBlocks: record?.firstBlocks?.slice(0, 24) ?? [],
    lastBlocks: record?.lastBlocks?.slice(-24) ?? [],
    hotBlocks: record?.hotBlocks?.slice(0, 16) ?? [],
  };
}

function scenarioAndRecord(summary) {
  const scenario = (summary?.scenarios ?? []).find((entry) => entry.label === 'no-autorun-digit2')
    ?? summary?.scenarios?.[0]
    ?? null;
  const key = scenario?.keyResults?.[0] ?? null;
  return { scenario, key, record: key?.record ?? null };
}

function conclusionText(record) {
  const missing = UPSTREAM_TARGETS.filter((target) => (record?.counts?.[target] ?? 0) === 0);
  if (missing.length) {
    return `The live-VAT route did not hit the full named upstream chain; missing ${missing.map((name) => TARGET_LABELS[name]).join(', ')}. Use the raw samples before treating the selector path as mapped.`;
  }
  const first0013fc = firstSample(record, 'up0013fc') ?? firstSample(record, 'lowBranch0013fc');
  const firstCleanup = firstSample(record, 'cleanup0018f8');
  const chain = UPSTREAM_TARGETS
    .map((target) => firstSample(record, target))
    .filter(Boolean)
    .sort((a, b) => a.block - b.block)
    .map((sample) => `${TARGET_LABELS[sample.target]}#${sample.block}`)
    .join(' -> ');
  if (firstCleanup && first0013fc && firstCleanup.block < first0013fc.block) {
    return `The live-VAT Digit2 route reaches the named 0x0013FC upstream window only AFTER the first destructive cleanup: cleanup0018f8#${firstCleanup.block} precedes ${chain}. At 0x0013FC, D007CA/D008E0/VAT are already zero. This corrects the prior selector hypothesis: this 0x003C42 -> ... -> 0x0013FC window is a post-cleanup status/low-transfer path, not the pre-cleanup branch that originally selects the clear.`;
  }
  return `The live-VAT Digit2 route reaches ${chain}. Token/tail hooks have not fired by that point; compare the cleanup samples to determine whether this low-ROM path is pre- or post-clear.`;
}

function buildReport(summary, pass, staticData) {
  const { scenario, key, record } = scenarioAndRecord(summary);
  const route = routeSummary(record);
  const first0013fc = firstSample(record, 'up0013fc') ?? firstSample(record, 'lowBranch0013fc');
  const first0061e9 = firstSample(record, 'frame0061e9');
  const firstCleanup = firstSample(record, 'cleanup0018f8');
  const lines = [
    '# Phase 663: Live-VAT Upstream Trace Before 0x0013FC',
    '',
    'Probe: `probe-phase663-live-vat-upstream-0013fc.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase663-live-vat-upstream-0013fc.mjs`',
    '',
    '## Summary',
    '',
    `- ${pass ? 'PASS' : 'FAIL'}: browser coldboot no-AutoRun Digit2 route completed with live-VAT upstream instrumentation.`,
    `- Route: total blocks=${route.totalBlocks}, cxMain hits=${route.cxMainHits}, key-handler hits=${route.keyHandlerHits}, token/tail hits=${route.tokenHookHits}, low-path hits=${route.lowPathHits}, cleanup hits=${route.cleanupHits}.`,
    `- Upstream counts: ${JSON.stringify(route.upstreamCounts)}; dynamic 0x0061E9 hits=${route.frame0061e9Hits}.`,
    `- First cleanup sample: ${sampleBrief(firstCleanup)}.`,
    `- First 0x0013FC sample: ${sampleBrief(first0013fc)}.`,
    `- First 0x0061E9 sample: ${sampleBrief(first0061e9)}.`,
    `- Finding: ${conclusionText(record)}`,
    '- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.',
    '',
    '## Dynamic Upstream Samples',
    '',
    markdownTable([
      ['Target', 'Hits', 'First block', 'Previous PC', 'AF', 'IX', 'SP', 'Stack0', 'Route fields', 'Recent tail'],
      ['---', '---:', '---:', '---', '---', '---', '---', '---', '---', '---'],
      ...hitRows(record, [...UPSTREAM_TARGETS, 'frame0061e9']),
    ]),
    '',
    '## Static Decode Windows',
    '',
    ...staticData.windows.flatMap((window) => [
      `### ${window.label}`,
      '',
      markdownTable([
        ['Address', 'Bytes', 'Instruction'],
        ['---', '---', '---'],
        ...window.rows.map((row) => [row.address, row.bytes, row.instruction]),
      ]),
      '',
    ]),
    '## Static 0x0061E9 Direct References',
    '',
    staticData.refs.length
      ? markdownTable([
        ['PC', 'Kind', 'Bytes', 'Decoded'],
        ['---', '---', '---', '---'],
        ...staticData.refs.map((ref) => [hex(ref.pc), ref.op, ref.bytes, ref.decoded]),
      ])
      : 'No direct 24-bit CALL/JP references to `0x0061E9` were found by raw opcode scan.',
    '',
    '## Raw Route Summary',
    '',
    '```json',
    JSON.stringify({
      scenario: scenario?.label ?? null,
      key: key?.label ?? null,
      replayOk: Boolean(scenario?.replayOk),
      errors: summary?.errors ?? [],
      route,
      upstreamSamples: Object.fromEntries([...UPSTREAM_TARGETS, 'frame0061e9'].map((target) => [
        target,
        samplesFor(record, target).slice(0, 4),
      ])),
      first0013fc,
      first0061e9,
      firstCleanup,
      direct0061e9Refs: staticData.refs,
    }, null, 2),
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function makeProbeSource() {
  let source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  source = replaceOnce(
    source,
    'const __dirname = import.meta.dirname;',
    `const __dirname = ${JSON.stringify(__dirname)};`,
  );
  source = replaceOnce(
    source,
    "const REPORT_PATH = path.join(__dirname, 'phase659-cleanup-gate-state.md');",
    "const REPORT_PATH = path.join(__dirname, 'phase663-live-vat-upstream-0013fc.md');",
  );
  source = replaceOnce(source, 'const debugPort = 9659;', 'const debugPort = 9663;');
  source = replaceOnce(
    source,
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase659-'));",
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase663-'));",
  );
  source = replaceOnce(
    source,
    `  lowBranch0013fc: 0x0013FC,
  gate001c33: 0x001C33,`,
    `  lowBranch0013fc: 0x0013FC,
  up003c42: 0x003C42,
  up003b0d: 0x003B0D,
  up003b17: 0x003B17,
  up0013f4: 0x0013F4,
  up0013f8: 0x0013F8,
  up0028d1: 0x0028D1,
  up0013fc: 0x0013FC,
  frame0061e9: 0x0061E9,
  gate001c33: 0x001C33,`,
  );
  source = replaceOnce(
    source,
    `  ['D0243D', 0xD0243D, 3],
  ['D02A40', 0xD02A40, 3],`,
    `  ['D0243D', 0xD0243D, 3],
  ['D0301B', 0xD0301B, 3],
  ['D02A40', 0xD02A40, 3],`,
  );
  source = replaceOnce(
    source,
    `const phase659_GATE_TARGETS = Object.freeze([
  'gate001c33',`,
    `const phase659_GATE_TARGETS = Object.freeze([
  'up003c42',
  'up003b0d',
  'up003b17',
  'up0013f4',
  'up0013f8',
  'up0028d1',
  'up0013fc',
  'frame0061e9',
  'lowBranch0013fc',
  'gate001c33',`,
  );
  source = replaceOnce(
    source,
    "probe: 'phase659-cleanup-gate-state',",
    "probe: 'phase663-live-vat-upstream-0013fc',",
  );
  source = replaceOnce(
    source,
    "    probe: 'phase659-cleanup-gate-state',",
    "    probe: 'phase663-live-vat-upstream-0013fc',",
  );
  return `${source}\nexport { summary };\n`;
}

const rom = fs.readFileSync(ROM_PATH);
const staticData = {
  refs: directTargetRefs(rom, 0x0061E9),
  windows: [
    { label: '0x003B00..0x003C60 upstream low-ROM selector window', rows: decodeWindow(rom, 0x003B00, 0x003C60) },
    { label: '0x0013E8..0x001405 low-status entry window', rows: decodeWindow(rom, 0x0013E8, 0x001405) },
    { label: '0x0028C0..0x0028E8 low-ROM branch helper window', rows: decodeWindow(rom, 0x0028C0, 0x0028E8) },
    { label: '0x0061D0..0x006210 0x0061E9 context window', rows: decodeWindow(rom, 0x0061D0, 0x006210) },
  ],
};

const source = makeProbeSource();
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const originalConsoleLog = console.log;
console.log = () => {};
let mod;
try {
  mod = await import(moduleUrl);
} finally {
  console.log = originalConsoleLog;
}
const summary = mod.summary;
const { scenario, record } = scenarioAndRecord(summary);
const missingTargets = UPSTREAM_TARGETS.filter((target) => (record?.counts?.[target] ?? 0) === 0);
const pass = Boolean(
  summary
    && (summary.errors ?? []).length === 0
    && scenario?.replayOk
    && record?.totalBlocks > 1000
    && missingTargets.length === 0
    && (record?.counts?.lowBranch0013fc ?? 0) > 0
    && (record?.start?.routeFields?.VAT_D02590 ?? 0) !== 0
);

fs.writeFileSync(REPORT_PATH, buildReport(summary, pass, staticData));
console.log(JSON.stringify({
  probe: 'phase663-live-vat-upstream-0013fc',
  pass,
  missingTargets,
  route: routeSummary(record),
}, null, 2));

process.exitCode = pass ? 0 : 1;
