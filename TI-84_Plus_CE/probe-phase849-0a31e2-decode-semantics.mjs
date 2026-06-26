import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const LIFTED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const PHASE844_REPORT = path.join(__dirname, 'phase844-pre-006dxx-zero-owner.md');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const REPORT_PATH = path.join(__dirname, 'phase849-0a31e2-decode-semantics.md');

const RAM_BASE = 0xD00000;

const WATCHED_FIELDS = Object.freeze([
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
]);

const DECODE_WINDOWS = Object.freeze([
  { label: '0x0A31B8..0x0A31F6 upstream/copy path', start: 0x0A31B8, end: 0x0A31F6 },
  { label: '0x0A31E2 owner block', start: 0x0A31E2, end: 0x0A31F6 },
  { label: '0x0A31A2 return tail', start: 0x0A31A2, end: 0x0A31A6 },
]);

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value !== 'string') return 0;
  return Number.parseInt(value.replace(/^0x/i, ''), 16) >>> 0;
}

function byteText(rom, pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) bytes.push(hex(rom[pc + i] ?? 0, 2).slice(2));
  return bytes.join(' ');
}

function fmtOperand(value, width = 6) {
  return hex(value, width);
}

function formatInstruction(insn) {
  switch (insn.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${insn.condition.toUpperCase()}`;
    case 'jr': return `JR ${fmtOperand(insn.target)}`;
    case 'jr-conditional': return `JR ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'jp': return `JP ${fmtOperand(insn.target)}`;
    case 'jp-conditional': return `JP ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'call': return `CALL ${fmtOperand(insn.target)}`;
    case 'call-conditional': return `CALL ${insn.condition.toUpperCase()},${fmtOperand(insn.target)}`;
    case 'push': return `PUSH ${insn.pair.toUpperCase()}`;
    case 'pop': return `POP ${insn.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${insn.dest.toUpperCase()},${fmtOperand(insn.value, 2)}`;
    case 'ld-pair-imm': return `LD ${insn.pair.toUpperCase()},${fmtOperand(insn.value)}`;
    case 'ex-de-hl': return 'EX DE,HL';
    case 'alu-reg': return `${insn.op.toUpperCase()} ${insn.src.toUpperCase()}`;
    case 'alu-imm': return `${insn.op.toUpperCase()} ${fmtOperand(insn.value, 2)}`;
    case 'sbc-pair': return `SBC HL,${insn.src.toUpperCase()}`;
    case 'add-pair': return `ADD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'inc-reg': return `INC ${insn.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${insn.reg.toUpperCase()}`;
    case 'dec-pair': return `DEC ${insn.pair.toUpperCase()}`;
    case 'mlt': return `MLT ${(insn.pair ?? insn.reg ?? '?').toUpperCase()}`;
    case 'lddr': return 'LDDR';
    case 'ldir': return 'LDIR';
    case 'indexed-cb-bit': return `BIT ${insn.bit},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    default: return `${(insn.tag ?? 'unknown').toUpperCase()} ${JSON.stringify(insn)}`;
  }
}

function decodeRange(rom, start, end) {
  const records = [];
  let pc = start;
  while (pc < end) {
    let insn;
    try {
      insn = decodeInstruction(rom, pc, 'adl');
    } catch (error) {
      insn = { pc, length: 1, tag: 'db', error: String(error?.message || error) };
    }
    if (!Number.isFinite(insn.length) || insn.length <= 0) {
      insn = { pc, length: 1, tag: 'db', error: 'invalid decoded length' };
    }
    const length = Math.min(insn.length, end - pc);
    records.push({
      pc,
      length,
      bytes: byteText(rom, pc, length),
      tag: insn.tag,
      modePrefix: insn.modePrefix ?? null,
      text: insn.tag === 'db' ? `DB ${hex(rom[pc] ?? 0, 2)} ; ${insn.error}` : formatInstruction(insn),
      raw: insn,
    });
    pc += length;
  }
  return records;
}

function decodeTable(records) {
  return [
    '| PC | Bytes | Decode |',
    '| --- | --- | --- |',
    ...records.map((record) => `| ${hex(record.pc)} | \`${record.bytes}\` | \`${record.text}\` |`),
  ].join('\n');
}

function parsePhase844Summary() {
  const text = fs.readFileSync(PHASE844_REPORT, 'utf8');
  const marker = '## Full JSON';
  const markerAt = text.indexOf(marker);
  if (markerAt === -1) throw new Error('phase844 Full JSON marker not found');
  const fenceAt = text.indexOf('```json', markerAt);
  if (fenceAt === -1) throw new Error('phase844 Full JSON fence not found');
  const jsonStart = text.indexOf('\n', fenceAt) + 1;
  const jsonEnd = text.indexOf('\n```', jsonStart);
  if (jsonEnd === -1) throw new Error('phase844 Full JSON fence terminator not found');
  return JSON.parse(text.slice(jsonStart, jsonEnd));
}

function readCaptureValue(capture, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > capture.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (capture[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function formatCaptureValue(value, len) {
  return value == null ? 'outside-capture' : hex(value, len * 2);
}

function findJsonStringEnd(text, quoteAt) {
  let escaped = false;
  for (let i = quoteAt + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') return i;
  }
  throw new Error(`unterminated JSON string at offset ${quoteAt}`);
}

function extractLiftedSource(liftedText, functionName) {
  const needle = `function ${functionName}(cpu)`;
  const funcAt = liftedText.indexOf(needle);
  if (funcAt === -1) throw new Error(`lifted source not found for ${functionName}`);
  const sourceAt = liftedText.lastIndexOf('"source":', funcAt);
  if (sourceAt === -1) throw new Error(`source key not found for ${functionName}`);
  const quoteAt = liftedText.indexOf('"', liftedText.indexOf(':', sourceAt) + 1);
  const endAt = findJsonStringEnd(liftedText, quoteAt);
  return JSON.parse(liftedText.slice(quoteAt, endAt + 1));
}

function computeCopyPlan(transition) {
  const before = transition.beforeCpu;
  const after = transition.afterCpu;
  const beforeBc = parseHex(before.bc);
  const beforeDe = parseHex(before.de);
  const beforeHl = parseHex(before.hl);
  const afterDe = parseHex(after.de);
  const afterHl = parseHex(after.hl);
  const b = (beforeBc >>> 8) & 0xFF;
  const countFromB = (0x28 * b) >>> 0;
  const destEndFromBefore = (beforeHl + beforeDe) & 0xFFFFFF;
  const destStartFromAfter = (afterDe + 1) & 0xFFFFFF;
  const destEndFromAfter = (afterDe + countFromB) & 0xFFFFFF;
  const sourceStartFromAfter = (afterHl + 1) & 0xFFFFFF;
  const sourceEndFromAfter = (afterHl + countFromB) & 0xFFFFFF;
  const delta = (destStartFromAfter - sourceStartFromAfter) & 0xFFFFFF;
  return {
    beforeB: b,
    count: countFromB,
    countHex: hex(countFromB, 4),
    destStart: destStartFromAfter,
    destEnd: destEndFromAfter,
    sourceStart: sourceStartFromAfter,
    sourceEnd: sourceEndFromAfter,
    destEndFromBefore,
    destEndMatches: destEndFromBefore === destEndFromAfter,
    delta,
  };
}

function inRange(addr, start, end) {
  return addr >= start && addr <= end;
}

function fieldRows(copyPlan, transition, preClear, afterClear) {
  return WATCHED_FIELDS.map(([name, addr, len]) => {
    const sourceAddr = (addr - copyPlan.delta) & 0xFFFFFF;
    const inDest = inRange(addr, copyPlan.destStart, copyPlan.destEnd);
    const inSource = inRange(sourceAddr, copyPlan.sourceStart, copyPlan.sourceEnd);
    return {
      name,
      addr,
      len,
      sourceAddr,
      inDest,
      inSource,
      phase844Before: transition.previousFields[name],
      phase844After: transition.currentFields[name],
      realBeforeDest: formatCaptureValue(readCaptureValue(preClear, addr, len), len),
      realAfterDest: formatCaptureValue(readCaptureValue(afterClear, addr, len), len),
      realBeforeSource: formatCaptureValue(readCaptureValue(preClear, sourceAddr, len), len),
      realAfterSource: formatCaptureValue(readCaptureValue(afterClear, sourceAddr, len), len),
    };
  });
}

function buildFieldTable(rows) {
  return [
    '| Field | Dest | Source copied by lifted LDDR | In dest range | Phase844 before -> after | Real before -> after | Real source before -> after |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => [
      `| ${row.name}`,
      hex(row.addr),
      hex(row.sourceAddr),
      row.inDest && row.inSource ? 'yes' : 'no',
      `${row.phase844Before} -> ${row.phase844After}`,
      `${row.realBeforeDest} -> ${row.realAfterDest}`,
      `${row.realBeforeSource} -> ${row.realAfterSource} |`,
    ].join(' | ')),
  ].join('\n');
}

function extractImportantSource(source) {
  return source
    .split('\n')
    .filter((line) => (
      line.includes('0x0a31e2')
      || line.includes('0x0a31ef')
      || line.includes('0x0a31f2')
      || line.includes('0x0a31f4')
      || line.includes('lddr')
      || line.includes('subtractWithBorrowWord')
      || line.includes('return 0x0a31a2')
      || line.includes('function block_0a31a2')
      || line.includes('pop')
      || line.includes('ret po')
      || line.includes('popReturn')
    ))
    .join('\n');
}

function summarizeDecode(records) {
  return records.map((record) => `${hex(record.pc)} ${record.text}`).join('; ');
}

function buildReport(summary) {
  const decodeSections = summary.decodes.map((section) => [
    `### ${section.label}`,
    '',
    decodeTable(section.records),
  ].join('\n')).join('\n\n');

  return [
    '# Phase 849: 0x0A31E2 / 0x0A31A2 Decode and Semantics Audit',
    '',
    'Probe: `probe-phase849-0a31e2-decode-semantics.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase849-0a31e2-decode-semantics.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}.`,
    '- `0x0A31E2` is the owner block; `0x0A31A2` is only the return tail reached after `JR 0x0A31A2`.',
    `- Exact field-writing instruction: \`0x0A31F2 ED B8 LDDR\`, copying ${summary.copyPlan.countHex} bytes from ${hex(summary.copyPlan.sourceStart)}..${hex(summary.copyPlan.sourceEnd)} to ${hex(summary.copyPlan.destStart)}..${hex(summary.copyPlan.destEnd)}.`,
    `- All four watched fields are inside that destination range; the lifted source address for each field is dest-${hex(summary.copyPlan.delta, 4)}.`,
    `- Bug class: **${summary.bugClass}**.`,
    '',
    '## Decoded ROM Windows',
    '',
    decodeSections,
    '',
    '## Lifted JS Check',
    '',
    'The emitted JS matches the decoded owner/tail structure in this window: `0x0A31E2` computes the copy endpoints, calls `cpu.lddr()`, then returns `0x0A31A2`; `0x0A31A2` only pops AF and checks `RET PO`.',
    '',
    '```js',
    summary.liftedImportant,
    '```',
    '',
    '## LDDR Range From Phase844 Entry/Exit State',
    '',
    '```json',
    JSON.stringify({
      beforeCpu: summary.beforeCpu,
      afterCpu: summary.afterCpu,
      copyPlan: {
        ...summary.copyPlan,
        sourceStart: hex(summary.copyPlan.sourceStart),
        sourceEnd: hex(summary.copyPlan.sourceEnd),
        destStart: hex(summary.copyPlan.destStart),
        destEnd: hex(summary.copyPlan.destEnd),
        destEndFromBefore: hex(summary.copyPlan.destEndFromBefore),
        delta: hex(summary.copyPlan.delta, 4),
      },
    }, null, 2),
    '```',
    '',
    '## Field / Capture Comparison',
    '',
    buildFieldTable(summary.fieldRows),
    '',
    '## Classification',
    '',
    '- Not **B / decoder bug** in this window: raw bytes decode coherently as the same instructions the lifted block comments show, including `ED B8` as `LDDR` and `F1 E0` as `POP AF; RET PO`.',
    '- Not **A / local emitted-op mismatch** in this window: the lifted JS directly implements the decoded `LDDR` and return tail; the zeroing follows from its computed copy range and source bytes.',
    '- Classified as **C / wrong input state or wrong path into a correct block**: with the captured lifted entry state, the copy source for the watched fields is lower RAM (`D0211A/D0211D/D02270/D0227D`) rather than the live cursor/VAT values. Real hardware after CLEAR keeps/retracts those fields, so a later fix should trace why the lifted route reaches `0x0A31E2` with this B/count/source-stack setup, or why upstream state differs before this copy.',
    '',
    '## Machine Summary',
    '',
    '```json',
    JSON.stringify({
      pass: summary.pass,
      bugClass: summary.bugClass,
      checks: summary.checks,
      oneLineDecode: summary.oneLineDecode,
    }, null, 2),
    '```',
    '',
  ].join('\n');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const liftedText = fs.readFileSync(LIFTED_PATH, 'utf8');
  const phase844 = parsePhase844Summary();
  const preClear = fs.readFileSync(PRE_CLEAR_CAPTURE);
  const afterClear = fs.readFileSync(AFTER_CLEAR_CAPTURE);

  const transition = phase844.zeroTransitions?.D0243A;
  if (!transition) throw new Error('phase844 D0243A transition not found');

  const decodes = DECODE_WINDOWS.map((window) => ({
    ...window,
    records: decodeRange(rom, window.start, window.end),
  }));

  const block0a31e2 = extractLiftedSource(liftedText, 'block_0a31e2_adl');
  const block0a31a2 = extractLiftedSource(liftedText, 'block_0a31a2_adl');
  const copyPlan = computeCopyPlan(transition);
  const rows = fieldRows(copyPlan, transition, preClear, afterClear);

  const checks = {
    decodedOwnerHasLddr: decodes.some((section) => section.records.some((record) => record.pc === 0x0A31F2 && record.tag === 'lddr')),
    decodedTailIsPopAfRetPo: decodes.some((section) => (
      section.records.some((record) => record.pc === 0x0A31A2 && record.text === 'POP AF')
      && section.records.some((record) => record.pc === 0x0A31A3 && record.text === 'RET PO')
    )),
    liftedOwnerHasLddr: block0a31e2.includes('cpu.lddr()'),
    liftedOwnerJumpsToTail: block0a31e2.includes('return 0x0a31a2'),
    liftedTailOnlyReturnLogic: block0a31a2.includes('cpu.af = cpu.pop()') && block0a31a2.includes("cpu.checkCondition('po')"),
    destEndMatchesPhase844After: copyPlan.destEndMatches,
    watchedFieldsAllInCopyDest: rows.every((row) => row.inDest && row.inSource),
    realAfterWatchedFieldsNonZero: rows.every((row) => row.realAfterDest !== '0x000000'),
    phase844WatchedFieldsZeroed: rows.every((row) => row.phase844After === '0x000000'),
  };

  const pass = Object.values(checks).every(Boolean);
  const bugClass = 'C / wrong input state or wrong path into a correct block';
  const summary = {
    pass,
    bugClass,
    checks,
    beforeCpu: transition.beforeCpu,
    afterCpu: transition.afterCpu,
    copyPlan,
    fieldRows: rows,
    decodes,
    liftedImportant: [
      extractImportantSource(block0a31e2),
      extractImportantSource(block0a31a2),
    ].join('\n'),
    oneLineDecode: summarizeDecode(decodes.find((section) => section.start === 0x0A31E2).records),
  };

  fs.writeFileSync(REPORT_PATH, buildReport(summary));
  console.log(JSON.stringify({
    probe: 'phase849-0a31e2-decode-semantics',
    pass: summary.pass,
    bugClass: summary.bugClass,
    copy: {
      count: summary.copyPlan.countHex,
      source: `${hex(summary.copyPlan.sourceStart)}..${hex(summary.copyPlan.sourceEnd)}`,
      dest: `${hex(summary.copyPlan.destStart)}..${hex(summary.copyPlan.destEnd)}`,
      delta: hex(summary.copyPlan.delta, 4),
    },
    checks: summary.checks,
    fields: summary.fieldRows.map((row) => ({
      name: row.name,
      dest: hex(row.addr),
      source: hex(row.sourceAddr),
      phase844: `${row.phase844Before}->${row.phase844After}`,
      real: `${row.realBeforeDest}->${row.realAfterDest}`,
      sourceReal: `${row.realBeforeSource}->${row.realAfterSource}`,
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));

  if (!summary.pass) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 849: 0x0A31E2 / 0x0A31A2 Decode and Semantics Audit',
    '',
    'Probe failed before producing a complete report.',
    '',
    '```',
    message,
    '```',
    '',
  ].join('\n'));
  console.error(message);
  process.exitCode = 1;
}
