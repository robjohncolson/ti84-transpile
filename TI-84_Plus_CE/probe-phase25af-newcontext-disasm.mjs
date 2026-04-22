#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase25af-newcontext-disasm-report.md');

const ADL_MODE = 'adl';
const DISASM_BYTES = 0x80;
const ROM_SCAN_LIMIT = 0x400000;

const NEW_CONTEXT_ADDR = 0x08c79f;
const NEW_CONTEXT0_ADDR = 0x08c7ad;
const CX_CUR_APP_ADDR = 0xd007e0;

const DISASM_TARGETS = [
  { name: 'NewContext', addr: NEW_CONTEXT_ADDR },
  { name: 'NewContext0', addr: NEW_CONTEXT0_ADDR },
];

const WRITE_PATTERNS = [
  { kind: 'ld (0xD007E0), a', bytes: [0x32, 0xe0, 0x07, 0xd0] },
  { kind: 'ld (0xD007E0), hl', bytes: [0x22, 0xe0, 0x07, 0xd0] },
  { kind: 'ed ld (0xD007E0), bc', bytes: [0xed, 0x43, 0xe0, 0x07, 0xd0] },
  { kind: 'ed ld (0xD007E0), de', bytes: [0xed, 0x53, 0xe0, 0x07, 0xd0] },
  { kind: 'ed ld (0xD007E0), hl', bytes: [0xed, 0x63, 0xe0, 0x07, 0xd0] },
  { kind: 'ed ld (0xD007E0), sp', bytes: [0xed, 0x73, 0xe0, 0x07, 0xd0] },
];

const CALL_PATTERNS = [
  { kind: 'call 0x08C79F', targetName: 'NewContext', targetAddr: NEW_CONTEXT_ADDR, bytes: [0xcd, 0x9f, 0xc7, 0x08] },
  { kind: 'call 0x08C7AD', targetName: 'NewContext0', targetAddr: NEW_CONTEXT0_ADDR, bytes: [0xcd, 0xad, 0xc7, 0x08] },
  { kind: 'call 0x02016C', targetName: 'JT NewContext slot', targetAddr: 0x02016c, bytes: [0xcd, 0x6c, 0x01, 0x02] },
  { kind: 'call 0x020170', targetName: 'JT NewContext0 slot', targetAddr: 0x020170, bytes: [0xcd, 0x70, 0x01, 0x02] },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, pc, length) {
  return Array.from(
    buffer.slice(pc, pc + length),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`; break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key)) {
          continue;
        }
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

async function loadDecoder() {
  const decoderSource = fs.readFileSync(DECODER_PATH, 'utf8');
  const decoderUrl = `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`;
  return import(decoderUrl);
}

function disassembleWindow(buffer, decodeInstruction, startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + byteCount;

  while (pc < end) {
    const inst = decodeInstruction(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      throw new Error(`Decode failed at ${hex(pc)}`);
    }

    rows.push({
      pc: inst.pc,
      bytes: bytesFor(buffer, inst.pc, inst.length),
      text: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function scanPattern(buffer, bytes, limit = buffer.length) {
  const hits = [];
  const end = Math.min(limit, buffer.length);

  outer: for (let i = 0; i <= end - bytes.length; i += 1) {
    for (let j = 0; j < bytes.length; j += 1) {
      if (buffer[i + j] !== bytes[j]) continue outer;
    }
    hits.push(i);
  }

  return hits;
}

function analyzeWriteSites(buffer) {
  return WRITE_PATTERNS.map((pattern) => ({
    ...pattern,
    hits: scanPattern(buffer, pattern.bytes, ROM_SCAN_LIMIT),
  }));
}

function analyzeCallSites(buffer) {
  return CALL_PATTERNS.map((pattern) => {
    const hits = scanPattern(buffer, pattern.bytes, ROM_SCAN_LIMIT);
    return {
      ...pattern,
      hits: hits.map((addr) => ({
        addr,
        loadedA: addr >= 2 && buffer[addr - 2] === 0x3e ? buffer[addr - 1] : null,
      })),
    };
  });
}

function formatAddrList(values) {
  if (!values || values.length === 0) return '(none)';
  return values.map((value) => hex(value)).join(', ');
}

function renderDisassemblySection(lines, title, rows) {
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('```text');
  for (const row of rows) {
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}`);
  }
  lines.push('```');
  lines.push('');
}

function buildReport({ disassemblies, writeSites, callSites }) {
  const lines = [];
  const flatWriteHits = writeSites.flatMap((entry) => entry.hits.map((addr) => ({ addr, kind: entry.kind })));
  const aStoreSites = writeSites.find((entry) => entry.kind === 'ld (0xD007E0), a')?.hits ?? [];
  const newContextStores = aStoreSites.filter((addr) => addr >= NEW_CONTEXT0_ADDR && addr < NEW_CONTEXT0_ADDR + 0x200);
  const homeCandidates = (callSites.find((entry) => entry.targetAddr === NEW_CONTEXT_ADDR)?.hits ?? [])
    .filter((entry) => entry.loadedA === 0x40)
    .map((entry) => entry.addr);

  lines.push('# Phase 25AF - NewContext / NewContext0 Static Disassembly');
  lines.push('');
  lines.push('Generated by `probe-phase25af-newcontext-disasm.mjs` from raw `ROM.rom` bytes.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- ` + '`0x08C79F`' + ` is a thin wrapper: it preserves the caller's ` + '`A`' + ` in ` + '`C`' + `, clears ` + '`0xD0058C`' + `, zeroes ` + '`B`' + `, restores ` + '`A`' + `, and tail-jumps into ` + '`0x08C7AD`' + `.`);
  lines.push(`- The first ` + '`0x80`' + ` bytes at ` + '`0x08C7AD`' + ` are mostly state cleanup and mode compares. The actual ` + '`cxCurApp`' + ` writes happen later in the same routine at ${formatAddrList(newContextStores)}.`);
  lines.push(`- Raw ROM pattern scan found ${aStoreSites.length} ` + '`LD (0xD007E0), A`' + ` byte matches and no ` + '`HL`' + ` / ` + '`ED`' + ` pair-store matches to ` + '`0xD007E0`' + `.`);
  lines.push(`- Strongest home-screen context-init candidates are the direct ` + '`ld a, 0x40 ; call 0x08C79F`' + ` sites at ${formatAddrList(homeCandidates)}.`);
  lines.push(`- No ` + '`CALL 0x02016C`' + ` or ` + '`CALL 0x020170`' + ` byte matches were found in ROM.`);
  lines.push('');

  renderDisassemblySection(
    lines,
    'Disassembly - NewContext (0x08C79F, first 0x80 bytes)',
    disassemblies.get(NEW_CONTEXT_ADDR),
  );

  renderDisassemblySection(
    lines,
    'Disassembly - NewContext0 (0x08C7AD, first 0x80 bytes)',
    disassemblies.get(NEW_CONTEXT0_ADDR),
  );

  lines.push('## cxCurApp Write Scan');
  lines.push('');
  for (const entry of writeSites) {
    lines.push(`- ${entry.kind} (${entry.hits.length}): ${formatAddrList(entry.hits)}`);
  }
  lines.push('');

  lines.push('## Direct Caller Scan');
  lines.push('');
  lines.push('| Target | Count | Caller sites |');
  lines.push('| --- | --- | --- |');
  for (const entry of callSites) {
    lines.push(`| \`${entry.kind}\` | ${entry.hits.length} | ${formatAddrList(entry.hits.map((hit) => hit.addr))} |`);
  }
  lines.push('');

  const newContextCalls = callSites.find((entry) => entry.targetAddr === NEW_CONTEXT_ADDR)?.hits ?? [];
  const newContext0Calls = callSites.find((entry) => entry.targetAddr === NEW_CONTEXT0_ADDR)?.hits ?? [];

  lines.push('### Direct `CALL 0x08C79F` Sites');
  lines.push('');
  lines.push('| Caller | Immediate A before call |');
  lines.push('| --- | --- |');
  for (const entry of newContextCalls) {
    lines.push(`| ${hex(entry.addr)} | ${entry.loadedA === null ? '(none at pc-2)' : `\`${hex(entry.loadedA, 2)}\``} |`);
  }
  lines.push('');

  lines.push('### Direct `CALL 0x08C7AD` Sites');
  lines.push('');
  lines.push('| Caller | Immediate A before call |');
  lines.push('| --- | --- |');
  for (const entry of newContext0Calls) {
    lines.push(`| ${hex(entry.addr)} | ${entry.loadedA === null ? '(none at pc-2)' : `\`${hex(entry.loadedA, 2)}\``} |`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  const disassemblies = new Map();
  for (const target of DISASM_TARGETS) {
    disassemblies.set(target.addr, disassembleWindow(rom, decodeInstruction, target.addr, DISASM_BYTES));
  }

  const writeSites = analyzeWriteSites(rom);
  const callSites = analyzeCallSites(rom);
  const report = buildReport({ disassemblies, writeSites, callSites });

  fs.writeFileSync(REPORT_PATH, report);

  console.log(`Wrote ${REPORT_PATH}`);
}

await main();
