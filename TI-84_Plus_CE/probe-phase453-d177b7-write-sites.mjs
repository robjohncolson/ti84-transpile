#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET_ADDR = 0xD177B7;
const TARGET_BYTES = [0xB7, 0x77, 0xD1];
const WRITE_PATTERNS = [
  { label: 'LD (0xD177B7),A', bytes: [0x32, ...TARGET_BYTES], register: 'A' },
  { label: 'LD (0xD177B7),HL', bytes: [0x22, ...TARGET_BYTES], register: 'HL' },
  { label: 'LD (0xD177B7),BC', bytes: [0xED, 0x43, ...TARGET_BYTES], register: 'BC' },
  { label: 'LD (0xD177B7),DE', bytes: [0xED, 0x53, ...TARGET_BYTES], register: 'DE' },
];
const READ_PATTERNS = [
  { label: 'LD A,(0xD177B7)', bytes: [0x3A, ...TARGET_BYTES], register: 'A' },
  { label: 'LD HL,(0xD177B7)', bytes: [0x2A, ...TARGET_BYTES], register: 'HL' },
  { label: 'LD BC,(0xD177B7)', bytes: [0xED, 0x4B, ...TARGET_BYTES], register: 'BC' },
  { label: 'LD DE,(0xD177B7)', bytes: [0xED, 0x5B, ...TARGET_BYTES], register: 'DE' },
];

const decodeCache = new Map();

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function safeDecode(pc) {
  if (decodeCache.has(pc)) {
    return decodeCache.get(pc);
  }

  let inst;
  try {
    inst = decodeInstruction(rom, pc, 'adl');
  } catch {
    inst = {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      mode: 'adl',
    };
  }

  decodeCache.set(pc, inst);
  return inst;
}

function formatIndex(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  const u = (value) => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${u(inst.condition)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${u(inst.pair)}`
        : `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndex(inst.indexRegister, inst.displacement)},${u(inst.src)}`;
    case 'ld-indexed-pair':
      return `LD ${u(inst.pair)},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'inc-reg':
      return `INC ${u(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${u(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${u(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${u(inst.reg)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndex(inst.indexRegister, inst.displacement)}`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out-reg':
      return `OUT (C),${u(inst.reg)}`;
    case 'in-reg':
      return `IN ${u(inst.reg)},(C)`;
    case 'sbc-pair':
      return `SBC HL,${u(inst.src)}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function patternHits(bytes) {
  const needle = Buffer.from(bytes);
  const hits = [];
  let offset = 0;

  while (offset < rom.length) {
    const index = rom.indexOf(needle, offset);
    if (index === -1) {
      break;
    }
    hits.push(index);
    offset = index + 1;
  }

  return hits;
}

function selectBestSequence(hit, maxBack = 192) {
  const searchStart = Math.max(0, hit - maxBack);
  const sequences = [];

  for (let start = searchStart; start <= hit; start++) {
    let pc = start;
    let valid = true;
    const rows = [];

    while (pc < hit) {
      const inst = safeDecode(pc);
      if (!inst || inst.nextPc <= pc || inst.nextPc > hit) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }

    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }

  if (sequences.length === 0) {
    return [];
  }

  return sequences.sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return (left[0]?.pc ?? hit) - (right[0]?.pc ?? hit);
  })[0];
}

function decodeForward(startPc, count = 12) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < count && pc < rom.length; i++) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function isCallOrRet(inst) {
  return inst.tag === 'call'
    || inst.tag === 'call-conditional'
    || inst.tag === 'ret'
    || inst.tag === 'ret-conditional'
    || inst.tag === 'rst';
}

function formatAnchor(row) {
  if (!row) {
    return 'none';
  }
  return `${formatInstruction(row.inst)} @ ${hex(row.pc)}`;
}

function buildContext(pc) {
  const prefix = selectBestSequence(pc, 224);
  const forward = decodeForward(pc, 10);
  const prevAnchor = [...prefix].reverse().find((row) => isCallOrRet(row.inst));
  const nextAnchor = forward.slice(1).find((row) => isCallOrRet(row.inst));

  return {
    prefix,
    rows: [...prefix.slice(-8), ...forward],
    summary: `prev ${formatAnchor(prevAnchor)}; next ${formatAnchor(nextAnchor)}`,
  };
}

function updateAState(state, row) {
  const { pc, inst } = row;
  const location = `${formatInstruction(inst)} @ ${hex(pc)}`;

  switch (inst.tag) {
    case 'ld-reg-imm':
      if (inst.dest === 'a') {
        return { kind: 'imm', value: inst.value & 0xFF, text: `${hex(inst.value, 2)} via ${location}` };
      }
      return state;
    case 'ld-reg-mem':
      if (inst.dest === 'a') {
        return { kind: 'mem', value: null, text: `from ${hex(inst.addr)} via ${location}` };
      }
      return state;
    case 'ld-reg-reg':
      if (inst.dest === 'a') {
        return { kind: 'reg', value: null, text: `from ${String(inst.src).toUpperCase()} via ${location}` };
      }
      return state;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') {
        return { kind: 'imm', value: 0x00, text: `0x00 via ${location}` };
      }
      if (inst.op === 'or' && inst.src === 'a') {
        return state;
      }
      if (inst.op === 'cp') {
        return state;
      }
      return { kind: 'unknown', value: null, text: `A modified by ${location}` };
    case 'alu-imm':
      if (inst.op === 'cp') {
        return state;
      }
      if (inst.op === 'and' && state.kind === 'imm') {
        const nextValue = state.value & (inst.value & 0xFF);
        return { kind: 'imm', value: nextValue, text: `${hex(nextValue, 2)} after ${location}` };
      }
      if (inst.op === 'or' && state.kind === 'imm') {
        const nextValue = state.value | (inst.value & 0xFF);
        return { kind: 'imm', value: nextValue, text: `${hex(nextValue, 2)} after ${location}` };
      }
      if (inst.op === 'xor' && state.kind === 'imm') {
        const nextValue = state.value ^ (inst.value & 0xFF);
        return { kind: 'imm', value: nextValue, text: `${hex(nextValue, 2)} after ${location}` };
      }
      return { kind: 'unknown', value: null, text: `A modified by ${location}` };
    case 'inc-reg':
      if (inst.reg === 'a') {
        if (state.kind === 'imm') {
          const nextValue = (state.value + 1) & 0xFF;
          return { kind: 'imm', value: nextValue, text: `${hex(nextValue, 2)} after ${location}` };
        }
        return { kind: 'unknown', value: null, text: `A incremented by ${location}` };
      }
      return state;
    case 'dec-reg':
      if (inst.reg === 'a') {
        if (state.kind === 'imm') {
          const nextValue = (state.value - 1) & 0xFF;
          return { kind: 'imm', value: nextValue, text: `${hex(nextValue, 2)} after ${location}` };
        }
        return { kind: 'unknown', value: null, text: `A decremented by ${location}` };
      }
      return state;
    case 'call':
    case 'call-conditional':
    case 'rst':
      return { kind: 'unknown', value: null, text: `A may be clobbered by ${location}` };
    case 'pop':
      if (inst.pair === 'af') {
        return { kind: 'unknown', value: null, text: `A restored by ${location}` };
      }
      return state;
    case 'in0':
      if (inst.reg === 'a') {
        return { kind: 'port', value: null, text: `from port ${hex(inst.port, 2)} via ${location}` };
      }
      return state;
    case 'in-reg':
      if (inst.reg === 'a') {
        return { kind: 'port', value: null, text: `from (C) via ${location}` };
      }
      return state;
    default:
      return state;
  }
}

function inferWriteValue(site, prefix) {
  if (site.register !== 'A') {
    return {
      short: `from ${site.register}`,
      detail: `store comes from ${site.register}; no direct immediate-byte inference applies`,
    };
  }

  const relevantRows = prefix.slice(-8);
  let state = { kind: 'unknown', value: null, text: 'no clear A setup in the last 8 decoded instructions' };

  for (const row of relevantRows) {
    state = updateAState(state, row);
  }

  return {
    short: state.kind === 'imm' ? hex(state.value, 2) : 'unknown',
    detail: state.text,
    value: state.kind === 'imm' ? state.value : null,
  };
}

function inferReadUsage(pc) {
  const rows = decodeForward(pc, 4);
  const next = rows[1]?.inst;
  const next2 = rows[2]?.inst;

  if (!next) {
    return { key: 'no-followup', text: 'no decoded follow-up instruction' };
  }

  if (next.tag === 'alu-imm' && next.op === 'cp') {
    let text = `compare against ${hex(next.value, 2)}`;
    if (next2 && (next2.tag === 'jr-conditional' || next2.tag === 'jp-conditional' || next2.tag === 'ret-conditional')) {
      text += ` then ${formatInstruction(next2)}`;
    }
    return { key: `cp-${hex(next.value, 2)}`, text };
  }

  if (next.tag === 'alu-reg' && next.op === 'or' && next.src === 'a') {
    let text = 'zero-test via OR A';
    if (next2 && (next2.tag === 'jr-conditional' || next2.tag === 'jp-conditional' || next2.tag === 'ret-conditional')) {
      text += ` then ${formatInstruction(next2)}`;
    }
    return { key: 'or-a', text };
  }

  return { key: next.tag, text: `followed by ${formatInstruction(next)}` };
}

function buildMarkdownTable(headers, rows) {
  const escapedHeaders = headers.map((header) => header.replace(/\|/g, '\\|'));
  const escapedRows = rows.map((row) => row.map((cell) => String(cell).replace(/\|/g, '\\|')));
  return [
    `| ${escapedHeaders.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...escapedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    return `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`;
  }).join('\n');
}

function collectSites(patterns, kind) {
  const sites = [];

  for (const pattern of patterns) {
    for (const pc of patternHits(pattern.bytes)) {
      const inst = safeDecode(pc);
      const context = buildContext(pc);
      const site = {
        kind,
        label: pattern.label,
        register: pattern.register,
        pc,
        inst,
        bytes: rawBytes(pc, inst.length),
        text: formatInstruction(inst),
        contextSummary: context.summary,
        contextRows: context.rows,
      };

      if (kind === 'write') {
        site.valueInfo = inferWriteValue(site, context.prefix);
      } else {
        site.readUse = inferReadUsage(pc);
      }

      sites.push(site);
    }
  }

  return sites.sort((left, right) => left.pc - right.pc);
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return String(left[0]).localeCompare(String(right[0]));
  });
}

const writePatternCounts = WRITE_PATTERNS.map((pattern) => ({
  label: pattern.label,
  hits: patternHits(pattern.bytes).length,
}));
const readPatternCounts = READ_PATTERNS.map((pattern) => ({
  label: pattern.label,
  hits: patternHits(pattern.bytes).length,
}));
const writeSites = collectSites(WRITE_PATTERNS, 'write');
const readSites = collectSites(READ_PATTERNS, 'read');

const lines = [];
lines.push('# Phase 453 - D177B7 Direct Write-Site Probe', '');
lines.push(`ROM: ${ROM_PATH}`);
lines.push(`Target address: ${hex(TARGET_ADDR)}  (ADL little-endian bytes: ${TARGET_BYTES.map(hexByte).join(' ')})`, '');

lines.push('## Pattern Counts', '');
for (const entry of writePatternCounts) {
  lines.push(`- write ${entry.label}: ${entry.hits}`);
}
for (const entry of readPatternCounts) {
  lines.push(`- read ${entry.label}: ${entry.hits}`);
}

const valueCounts = countBy(writeSites, (site) => site.valueInfo.short);
const readUseCounts = countBy(readSites, (site) => site.readUse.text);

lines.push('', '## Write Value Summary', '');
for (const [value, count] of valueCounts) {
  lines.push(`- ${value}: ${count} site(s)`);
}

lines.push('', '## Read Usage Summary', '');
for (const [usage, count] of readUseCounts) {
  lines.push(`- ${usage}: ${count} site(s)`);
}

lines.push('', '## Write Summary Table', '');
lines.push(buildMarkdownTable(
  ['address', 'encoding', 'instruction', 'likely value', 'context'],
  writeSites.map((site) => [
    hex(site.pc),
    `\`${site.bytes}\``,
    `\`${site.text}\``,
    `\`${site.valueInfo.short}\``,
    `\`${site.contextSummary}\``,
  ]),
));

lines.push('', '## Detailed Write Contexts', '');
for (const site of writeSites) {
  lines.push(`### ${hex(site.pc)}  ${site.text}`);
  lines.push(`- encoding: \`${site.bytes}\``);
  lines.push(`- likely value: \`${site.valueInfo.short}\` (${site.valueInfo.detail})`);
  lines.push(`- anchors: ${site.contextSummary}`);
  lines.push('```text');
  lines.push(renderRows(site.contextRows));
  lines.push('```', '');
}

lines.push('## Read Summary Table', '');
lines.push(buildMarkdownTable(
  ['address', 'encoding', 'instruction', 'usage', 'context'],
  readSites.map((site) => [
    hex(site.pc),
    `\`${site.bytes}\``,
    `\`${site.text}\``,
    `\`${site.readUse.text}\``,
    `\`${site.contextSummary}\``,
  ]),
));

console.log(lines.join('\n'));
