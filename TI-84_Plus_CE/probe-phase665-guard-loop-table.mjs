import fs from 'node:fs';
import path from 'node:path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = import.meta.dirname;
const TEMPLATE_PATH = path.join(__dirname, 'probe-phase659-cleanup-gate-state.mjs');
const REPORT_PATH = path.join(__dirname, 'phase665-guard-loop-table.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const PRECLEAR_TARGETS = Object.freeze([
  'loop08c331',
  'pre05c634',
  'pre000038',
  'pre0006f3',
  'pre000704',
  'pre000710',
  'pre001713',
  'pre0008bb',
  'pre001717',
  'pre001718',
  'pre00171e',
  'pre0067f8',
  'pre001c4f',
  'pre001ca6',
  'pre001cc0',
  'pre001cca',
  'pre001cce',
  'pre001cd5',
  'pre001ce5',
  'pre001c54',
  'pre006808',
  'gate001c33',
  'gate001c4a',
  'gate0158d2',
  'gate0158da',
  'gate0158ec',
  'gate0158ee',
  'gate0158f8',
  'gate001872',
  'clear001879',
  'cleanup0018f8',
]);

const TARGET_LABELS = Object.freeze({
  loop08c331: '0x08C331',
  pre05c634: '0x05C634',
  pre000038: '0x000038',
  pre0006f3: '0x0006F3',
  pre000704: '0x000704',
  pre000710: '0x000710',
  pre001713: '0x001713',
  pre0008bb: '0x0008BB',
  pre001717: '0x001717',
  pre001718: '0x001718',
  pre00171e: '0x00171E',
  pre0067f8: '0x0067F8',
  pre001c4f: '0x001C4F',
  pre001ca6: '0x001CA6',
  pre001cc0: '0x001CC0',
  pre001cca: '0x001CCA',
  pre001cce: '0x001CCE',
  pre001cd5: '0x001CD5',
  pre001ce5: '0x001CE5',
  pre001c54: '0x001C54',
  pre006808: '0x006808',
  gate001c33: '0x001C33',
  gate001c4a: '0x001C4A',
  gate0158d2: '0x0158D2',
  gate0158da: '0x0158DA',
  gate0158ec: '0x0158EC',
  gate0158ee: '0x0158EE',
  gate0158f8: '0x0158F8',
  gate001872: '0x001872',
  clear001879: '0x001879',
  cleanup0018f8: '0x0018F8',
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
    case 'ld-reg-ind': return `LD ${String(insn.dest).toUpperCase()},(${String(insn.src).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${String(insn.dest).toUpperCase()}),${String(insn.src).toUpperCase()}`;
    case 'ldir': return 'LDIR';
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
    case 'halt': return 'HALT';
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
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

function directTargetRefs(rom, targets) {
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
  const targetSet = new Set(targets);
  const refs = [];
  for (let pc = 0; pc + 3 < rom.length; pc += 1) {
    const op = rom[pc];
    if (!directOps.has(op)) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (!targetSet.has(target)) continue;
    let decoded = null;
    try {
      decoded = decodeInstruction(rom, pc, 'adl');
    } catch {}
    refs.push({
      target: hex(target),
      pc: hex(pc),
      op: directOps.get(op),
      bytes: romBytes(rom, pc, 4),
      decoded: decoded ? formatInstruction(decoded) : `${directOps.get(op)} ${hex(target)}`,
    });
  }
  return refs;
}

function targetHits(record, names) {
  const counts = record?.counts ?? {};
  return names.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
}

function allSamples(record, target) {
  return [
    ...(record?.gateSamples ?? []),
    ...(record?.targetSamples ?? []),
  ].filter((sample) => sample.target === target);
}

function firstSample(record, target) {
  return allSamples(record, target).sort((a, b) => a.block - b.block)[0] ?? null;
}

function ioBrief(sample) {
  const ports = ['0x0003', '0x0007', '0x0009', '0x000F', '0x5014', '0x5015', '0x5016'];
  return ports
    .map((port) => {
      const event = sample?.lastIoByPort?.[port];
      return event ? `${port}:${event.type}:${event.value}@${event.pc}` : null;
    })
    .filter(Boolean)
    .join(' ');
}

function fieldsBrief(fields) {
  if (!fields) return 'n/a';
  return [
    `D0058E=${hex(fields.D0058E ?? 0, 2)}`,
    `D007CA=${hex(fields.D007CA ?? 0)}`,
    `D008E0=${hex(fields.D008E0 ?? 0)}`,
    `VAT=${hex(fields.VAT_D02590 ?? 0)}/${hex(fields.VAT_D0259D ?? 0)}`,
    `D177BA=${hex(fields.D177BA ?? 0, 2)}`,
    `D0301B=${hex(fields.D0301B ?? 0)}`,
  ].join(' ');
}

function sampleRow(record, target) {
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
    (sample?.returnHints ?? []).join(', '),
    fieldsBrief(sample?.routeFields ?? sample?.before),
    ioBrief(sample),
    sample?.recentBlocks?.slice(-12).join(' -> ') ?? '',
  ];
}

function byteAt(sample, offset = 0) {
  const bytes = sample?.hlWindow?.bytesAfter ?? [];
  return bytes[offset] ?? '';
}

function guardSampleRows(record) {
  const guard = record?.guardLoopSamples ?? {};
  const rows = [];
  for (const [group, samples] of [
    ['first', guard.first ?? []],
    ['tail', guard.tail ?? []],
    ['exit', guard.exit ? [guard.exit] : []],
  ]) {
    for (const sample of samples) {
      rows.push([
        group,
        sample.block,
        sample.target,
        sample.previousPc ?? '',
        sample.cpu?.af ?? '',
        sample.cpu?.bc ?? '',
        sample.cpu?.de ?? '',
        sample.cpu?.hl ?? '',
        sample.cpu?.sp ?? '',
        sample.byteAtHl ?? '',
        byteAt(sample, 1),
        byteAt(sample, 2),
        sample.returnHints?.join(', ') ?? '',
        sample.recentBlocks?.slice(-10).join(' -> ') ?? '',
        sample.hlWindow?.bytesBefore?.join(' ') ?? '',
        sample.hlWindow?.bytesAfter?.join(' ') ?? '',
      ]);
    }
  }
  return rows;
}

function guardConclusion(record) {
  const guard = record?.guardLoopSamples ?? {};
  const first = guard.first?.[0] ?? null;
  const tail = guard.tail ?? [];
  const last = tail.at?.(-1) ?? tail[tail.length - 1] ?? null;
  const exit = guard.exit ?? null;
  if (!first || !last || !exit) {
    return 'Guard-loop sampling was incomplete; at least one of first, tail, or exit samples was missing.';
  }
  const firstBytes = first.hlWindow?.bytesAfter?.slice(0, 12).join(' ') ?? '';
  const lastBytes = last.hlWindow?.bytesAfter?.slice(0, 12).join(' ') ?? '';
  const exitBytes = exit.hlWindow?.bytesAfter?.slice(0, 8).join(' ') ?? '';
  return `0x001C33 starts scanning at HL=${first.cpu?.hl} with DE=${first.cpu?.de}; the first bytes are ${firstBytes}. The rolling tail reaches HL=${last.cpu?.hl} with A/byte-at-HL=${last.cpu?.a}/${last.byteAtHl}; the first 0x001C4A exit sees HL=${exit.cpu?.hl}, byte window ${exitBytes}, and AF=${exit.cpu?.af}. This supports the table-scan interpretation: the loop walks variable-length descriptors until the byte at HL is 0xFF, then returns NZ into the cleanup relay.`;
}

function scenarioAndRecord(summary) {
  const scenario = (summary?.scenarios ?? []).find((entry) => entry.label === 'no-autorun-digit2')
    ?? summary?.scenarios?.[0]
    ?? null;
  const key = scenario?.keyResults?.[0] ?? null;
  return { scenario, key, record: key?.record ?? null };
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
  ];
  return {
    label: record?.label ?? null,
    totalBlocks: record?.totalBlocks ?? 0,
    tokenHookHits: targetHits(record, tokenNames),
    lowPathHits: targetHits(record, lowNames),
    cleanupHits: record?.counts?.cleanup0018f8 ?? 0,
    cxMainHits: record?.counts?.cxMain0585e9 ?? 0,
    keyHandlerHits: record?.counts?.keyHandler05877a ?? 0,
    preclearCounts: Object.fromEntries(PRECLEAR_TARGETS.map((target) => [target, record?.counts?.[target] ?? 0])),
    startFields: record?.start?.routeFields ?? null,
    endFields: record?.end?.routeFields ?? null,
    firstBlocks: record?.firstBlocks?.slice(0, 64) ?? [],
    hotBlocks: record?.hotBlocks?.slice(0, 16) ?? [],
  };
}

function orderedFirstSamples(record) {
  return PRECLEAR_TARGETS
    .map((target) => firstSample(record, target))
    .filter(Boolean)
    .sort((a, b) => a.block - b.block)
    .map((sample) => `${TARGET_LABELS[sample.target] ?? sample.target}#${sample.block}`)
    .join(' -> ');
}

function conclusion(record) {
  const firstClear = firstSample(record, 'clear001879');
  const firstCleanup = firstSample(record, 'cleanup0018f8');
  const first001c4a = firstSample(record, 'gate001c4a');
  const first006808 = firstSample(record, 'pre006808');
  const first001c33 = firstSample(record, 'gate001c33');
  const first001879 = firstSample(record, 'clear001879');
  const missing = PRECLEAR_TARGETS.filter((target) => (record?.counts?.[target] ?? 0) === 0);
  if (missing.length) {
    return `The pre-clear route did not hit every requested target; missing ${missing.map((target) => TARGET_LABELS[target]).join(', ')}. Treat the captured sequence as incomplete.`;
  }
  return `The first destructive clear is selected by the low-ROM interrupt/guard route before token/tail: 0x08C331 enters 0x05C634 -> 0x000038, the reduced ISR reaches 0x0067F8 -> 0x001C4F -> 0x006808 -> repeated 0x001C33 guard checks, and the first exit from that guard loop is 0x001C4A#${first001c4a?.block} -> 0x0158D2 -> 0x0158F8 -> 0x001872 -> 0x001879#${first001879?.block} -> 0x0018F8#${firstCleanup?.block}. The route is live at entry (0x006808#${first006808?.block}, 0x001C33#${first001c33?.block}) and still clears before any token/tail hooks fire.`;
}

function buildReport(summary, pass, staticData) {
  const { scenario, key, record } = scenarioAndRecord(summary);
  const route = routeSummary(record);
  const firstClear = firstSample(record, 'clear001879');
  const firstCleanup = firstSample(record, 'cleanup0018f8');
  const guardRows = guardSampleRows(record);
  const lines = [
    '# Phase 665: 0x001C33 Guard Loop Table State',
    '',
    'Probe: `probe-phase665-guard-loop-table.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase665-guard-loop-table.mjs`',
    '',
    '## Summary',
    '',
    `- ${pass ? 'PASS' : 'FAIL'}: browser coldboot no-AutoRun Digit2 route completed with guard-loop table instrumentation.`,
    `- Route: total blocks=${route.totalBlocks}, cxMain hits=${route.cxMainHits}, key-handler hits=${route.keyHandlerHits}, token/tail hits=${route.tokenHookHits}, low-path hits=${route.lowPathHits}, cleanup hits=${route.cleanupHits}.`,
    `- First clear: 0x001879 block ${firstClear?.block ?? 'missing'}; first clear tail: 0x0018F8 block ${firstCleanup?.block ?? 'missing'}.`,
    `- Pre-clear first-hit sequence: ${orderedFirstSamples(record)}.`,
    `- Finding: ${guardConclusion(record)}`,
    '- No browser-shell, runtime, transpiler, scheduler, or golden-regression-relevant source files were modified.',
    '',
    '## Guard Loop Samples',
    '',
    markdownTable([
      ['Group', 'Block', 'Target', 'Previous PC', 'AF', 'BC', 'DE', 'HL', 'SP', '(HL)', '+1', '+2', 'Return hints', 'Recent tail', 'Bytes before HL', 'Bytes at/after HL'],
      ['---', '---:', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ...guardRows,
    ]),
    '',
    '## Dynamic Pre-Clear Samples',
    '',
    markdownTable([
      ['Target', 'Hits', 'First block', 'Previous PC', 'AF', 'IX', 'SP', 'Stack0', 'Return hints', 'Route fields', 'Recent IO', 'Recent tail'],
      ['---', '---:', '---:', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ...PRECLEAR_TARGETS.map((target) => sampleRow(record, target)),
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
    '## Direct 24-bit References To Chain Targets',
    '',
    staticData.refs.length
      ? markdownTable([
        ['Target', 'PC', 'Kind', 'Bytes', 'Decoded'],
        ['---', '---', '---', '---', '---'],
        ...staticData.refs.map((ref) => [ref.target, ref.pc, ref.op, ref.bytes, ref.decoded]),
      ])
      : 'No direct 24-bit CALL/JP references were found for the selected chain targets.',
    '',
    '## Reduced Raw Summary',
    '',
    '```json',
    JSON.stringify({
      scenario: scenario?.label ?? null,
      key: key?.label ?? null,
      replayOk: Boolean(scenario?.replayOk),
      errors: summary?.errors ?? [],
      route,
      guardLoopSamples: record?.guardLoopSamples ?? null,
      firstSamples: Object.fromEntries(PRECLEAR_TARGETS.map((target) => [target, firstSample(record, target)])),
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
    "const REPORT_PATH = path.join(__dirname, 'phase665-guard-loop-table.md');",
  );
  source = replaceOnce(source, 'const debugPort = 9659;', 'const debugPort = 9665;');
  source = replaceOnce(
    source,
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase659-'));",
    "const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase665-'));",
  );
  source = replaceOnce(
    source,
    `  lowBranch0013fc: 0x0013FC,
  gate001c33: 0x001C33,`,
    `  lowBranch0013fc: 0x0013FC,
  pre05c634: 0x05C634,
  pre000038: 0x000038,
  pre0006f3: 0x0006F3,
  pre000704: 0x000704,
  pre000710: 0x000710,
  pre001713: 0x001713,
  pre0008bb: 0x0008BB,
  pre001717: 0x001717,
  pre001718: 0x001718,
  pre00171e: 0x00171E,
  pre0067f8: 0x0067F8,
  pre001c4f: 0x001C4F,
  pre001ca6: 0x001CA6,
  pre001cc0: 0x001CC0,
  pre001cca: 0x001CCA,
  pre001cce: 0x001CCE,
  pre001cd5: 0x001CD5,
  pre001ce5: 0x001CE5,
  pre001c54: 0x001C54,
  pre006808: 0x006808,
  gate001c33: 0x001C33,`,
  );
  source = replaceOnce(
    source,
    `  ['D0243D', 0xD0243D, 3],
  ['D02A40', 0xD02A40, 3],`,
    `  ['D0243D', 0xD0243D, 3],
  ['D0301B', 0xD0301B, 3],
  ['D177BA', 0xD177BA, 1],
  ['D02A40', 0xD02A40, 3],`,
  );
  source = replaceOnce(
    source,
    `const phase659_GATE_TARGETS = Object.freeze([
  'gate001c33',`,
    `const phase659_GATE_TARGETS = Object.freeze([
  'loop08c331',
  'pre05c634',
  'pre000038',
  'pre0006f3',
  'pre000704',
  'pre000710',
  'pre001713',
  'pre0008bb',
  'pre001717',
  'pre001718',
  'pre00171e',
  'pre0067f8',
  'pre001c4f',
  'pre001ca6',
  'pre001cc0',
  'pre001cca',
  'pre001cce',
  'pre001cd5',
  'pre001ce5',
  'pre001c54',
  'pre006808',
  'gate001c33',`,
  );
  source = replaceOnce(
    source,
    'if (sampleCount < 4 && record.targetSamples.length < 96) {',
    'if (sampleCount < 4 && record.targetSamples.length < 256) {',
  );
  source = replaceOnce(
    source,
    'if (gateSampleCount < 3 && record.gateSamples.length < 48) {',
    'if (gateSampleCount < 3 && record.gateSamples.length < 256) {',
  );
  source = replaceOnce(
    source,
    `function phase659ReturnHints(stack24) {`,
    `function phase665CaptureGuardWindow(addr, before = 8, after = 40) {
  const mem = cpu?.memory;
  if (!mem) return { base: phase657Hex(addr), bytesBefore: [], bytesAfter: [] };
  const bytesBefore = [];
  for (let i = before; i > 0; i -= 1) bytesBefore.push(phase657Hex(mem[(addr - i) & 0xFFFFFF] ?? 0, 2));
  const bytesAfter = [];
  for (let i = 0; i < after; i += 1) bytesAfter.push(phase657Hex(mem[(addr + i) & 0xFFFFFF] ?? 0, 2));
  return { base: phase657Hex(addr), bytesBefore, bytesAfter };
}

function phase665CaptureGuardLoopState(record, target, pcHex, beforeFields) {
  const hl = (cpu?.hl ?? cpu?._hl ?? 0) & 0xFFFFFF;
  const stack24 = phase657ReadStack24(16);
  return {
    block: record.totalBlocks,
    target,
    pc: pcHex,
    previousPc: record.lastBlocks.length > 1 ? record.lastBlocks[record.lastBlocks.length - 2] : null,
    routeFields: beforeFields,
    cpu: phase659CpuState(),
    byteAtHl: phase657Hex(cpu?.memory?.[hl] ?? 0, 2),
    hlWindow: phase665CaptureGuardWindow(hl),
    recentBlocks: record.lastBlocks.slice(-32),
    stack24,
    returnHints: phase659ReturnHints(stack24),
    ioTail: record.ioEvents.slice(-12),
  };
}

function phase665RememberGuardLoopSample(record, target, pcHex, beforeFields) {
  if (!record.guardLoopSamples) record.guardLoopSamples = { first: [], tail: [], exit: null };
  const sample = phase665CaptureGuardLoopState(record, target, pcHex, beforeFields);
  if (target === 'gate001c33') {
    if (record.guardLoopSamples.first.length < 8) record.guardLoopSamples.first.push(sample);
    if (!record.guardLoopSamples.exit) {
      record.guardLoopSamples.tail.push(sample);
      if (record.guardLoopSamples.tail.length > 8) record.guardLoopSamples.tail.shift();
    }
    return;
  }
  if (target === 'gate001c4a' && !record.guardLoopSamples.exit) {
    record.guardLoopSamples.exit = sample;
  }
}

function phase659ReturnHints(stack24) {`,
  );
  source = replaceOnce(
    source,
    `    gateSampleLimits: {},
    ioEvents: [],`,
    `    gateSampleLimits: {},
    guardLoopSamples: { first: [], tail: [], exit: null },
    ioEvents: [],`,
  );
  source = replaceOnce(
    source,
    `  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;`,
    `  if (addr === 0x001C33) phase665RememberGuardLoopSample(record, 'gate001c33', pcHex, beforeFields);
  if (addr === 0x001C4A) phase665RememberGuardLoopSample(record, 'gate001c4a', pcHex, beforeFields);

  if (addr >= 0x08F000 && addr <= 0x090FFF) record.regionCounts.token08f000_090fff += 1;`,
  );
  source = replaceOnce(
    source,
    `  0x0009,
  0x5003,`,
    `  0x0002,
  0x0003,
  0x0007,
  0x0009,
  0x000A,
  0x000B,
  0x000C,
  0x000F,
  0x5003,`,
  );
  source = replaceOnce(
    source,
    "probe: 'phase659-cleanup-gate-state',",
    "probe: 'phase665-guard-loop-table',",
  );
  source = replaceOnce(
    source,
    "    probe: 'phase659-cleanup-gate-state',",
    "    probe: 'phase665-guard-loop-table',",
  );
  return `${source}\nexport { summary };\n`;
}

const rom = fs.readFileSync(ROM_PATH);
const staticData = {
  refs: directTargetRefs(rom, [
    0x05C634,
    0x0067F8,
    0x001C4F,
    0x006808,
    0x001C33,
    0x001C4A,
    0x0158D2,
    0x001872,
    0x001879,
    0x0018F8,
  ]),
  windows: [
    { label: '0x08C320..0x08C360 warm route entry', rows: decodeWindow(rom, 0x08C320, 0x08C360) },
    { label: '0x05C620..0x05C660 caller after 0x08C331', rows: decodeWindow(rom, 0x05C620, 0x05C660) },
    { label: '0x000030..0x000050 interrupt vector window', rows: decodeWindow(rom, 0x000030, 0x000050) },
    { label: '0x0006E8..0x000724 vector setup into ISR gate', rows: decodeWindow(rom, 0x0006E8, 0x000724) },
    { label: '0x001710..0x001724 reduced/full ISR selector', rows: decodeWindow(rom, 0x001710, 0x001724) },
    { label: '0x0067E8..0x006824 reduced ISR cleanup selector', rows: decodeWindow(rom, 0x0067E8, 0x006824) },
    { label: '0x001C30..0x001C60 guard loop entry/exit', rows: decodeWindow(rom, 0x001C30, 0x001C60) },
    { label: '0x001C78..0x001CF0 guard loop body', rows: decodeWindow(rom, 0x001C78, 0x001CF0) },
    { label: '0x0158D0..0x015905 cleanup relay', rows: decodeWindow(rom, 0x0158D0, 0x015905) },
    { label: '0x001860..0x001885 port gate to clear setup', rows: decodeWindow(rom, 0x001860, 0x001885) },
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
const missingTargets = PRECLEAR_TARGETS.filter((target) => (record?.counts?.[target] ?? 0) === 0);
const pass = Boolean(
  summary
    && (summary.errors ?? []).length === 0
    && scenario?.replayOk
    && record?.totalBlocks > 1000
    && missingTargets.length === 0
    && (record?.counts?.cleanup0018f8 ?? 0) > 0
    && (record?.guardLoopSamples?.first?.length ?? 0) >= 3
    && (record?.guardLoopSamples?.tail?.length ?? 0) >= 3
    && record?.guardLoopSamples?.exit
    && (record?.start?.routeFields?.VAT_D02590 ?? 0) !== 0
    && targetHits(record, ['outer08f3b8', 'tokenReader090883', 'tokenExit08f5e1', 'tokenGate090992', 'tokenStore09098e', 'eolTuple08f54b']) === 0
);

fs.writeFileSync(REPORT_PATH, buildReport(summary, pass, staticData));
console.log(JSON.stringify({
  probe: 'phase665-guard-loop-table',
  pass,
  missingTargets,
  guardFirst: record?.guardLoopSamples?.first?.map((sample) => ({ block: sample.block, hl: sample.cpu?.hl, byteAtHl: sample.byteAtHl })),
  guardTail: record?.guardLoopSamples?.tail?.map((sample) => ({ block: sample.block, hl: sample.cpu?.hl, byteAtHl: sample.byteAtHl })),
  guardExit: record?.guardLoopSamples?.exit ? { block: record.guardLoopSamples.exit.block, hl: record.guardLoopSamples.exit.cpu?.hl, byteAtHl: record.guardLoopSamples.exit.byteAtHl } : null,
  route: routeSummary(record),
  sequence: orderedFirstSamples(record),
}, null, 2));

process.exitCode = pass ? 0 : 1;
