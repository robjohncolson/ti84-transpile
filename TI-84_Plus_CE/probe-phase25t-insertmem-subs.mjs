#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25t-insertmem-subs-report.md');

const ADL_MODE = 'adl';

const TARGETS = [
  {
    id: 'sub-082739',
    title: 'InsertMem subroutine 0x082739 (post-move helper)',
    start: 0x082739,
    maxBytes: 128,
  },
  {
    id: 'sub-0824D6',
    title: 'InsertMem subroutine 0x0824D6 (tail helper A)',
    start: 0x0824d6,
    maxBytes: 96,
  },
  {
    id: 'sub-0824FD',
    title: 'InsertMem subroutine 0x0824FD (tail helper B)',
    start: 0x0824fd,
    maxBytes: 256,
  },
  {
    id: 'sub-0825d1',
    title: 'Pointer adjust helper 0x0825D1 (called by tail helper B)',
    start: 0x0825d1,
    maxBytes: 48,
    stopAtSecondRet: true,
  },
];

const SYMBOLS = new Map([
  [0xd005f8, 'OP1'],
  [0xd005f9, 'OP1+1'],
  [0xd02577, 'slot_D02577'],
  [0xd02587, 'tempMem'],
  [0xd0258a, 'FPSbase (heap top)'],
  [0xd0258d, 'FPS (VAT region)'],
  [0xd02590, 'OPBase'],
  [0xd02593, 'OPS'],
  [0xd02596, 'pTempCnt'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd025a0, 'newDataPtr (VAT data)'],
  [0xd025a3, 'pagedGetPtr (stream reader)'],
  [0xd3ffff, 'symTable end'],
]);

const KNOWN_TARGETS = new Map([
  [0x04c990, 'system area pointer adjuster'],
  [0x061d1a, 'error handler (0x061D1A)'],
  [0x061d3e, 'error handler (0x061D3E)'],
  [0x07f796, 'carry-test helper'],
  [0x080080, 'slot/length selector'],
  [0x082266, 'post-adjust helper'],
  [0x0821b9, 'InsertMem'],
  [0x0822a4, 'length normalizer'],
  [0x0822ba, 'inner pointer helper'],
  [0x0824d6, 'tail helper A'],
  [0x0824fd, 'tail helper B'],
  [0x082739, 'post-move helper'],
  [0x082bbe, 'pointer/slot helper'],
]);

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function symbolFor(addr) {
  return SYMBOLS.get(addr) || '';
}

function targetNameFor(addr) {
  return KNOWN_TARGETS.get(addr) || '';
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
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
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'ldd': text = 'ldd'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldir': text = 'ldir'; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function commentFor(inst) {
  const notes = [];

  if (Number.isInteger(inst.addr)) {
    const symbol = symbolFor(inst.addr);
    if (symbol) notes.push(symbol);
  }

  if (Number.isInteger(inst.target)) {
    const label = targetNameFor(inst.target);
    if (label) notes.push(label);
  }

  if (Number.isInteger(inst.value) && inst.tag === 'ld-pair-imm') {
    const symbol = symbolFor(inst.value);
    if (symbol) notes.push(symbol);
  }

  return notes.length > 0 ? ` ; ${notes.join(' / ')}` : '';
}

function disasmRange(startAddr, maxBytes, stopAtSecondRet = false) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        bytes: '',
        text: 'decode failed',
        comment: '',
      });
      break;
    }

    const bytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes,
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });

    pc += inst.length;

    // Stop at unconditional RET (but not for targets with stopAtSecondRet)
    if (inst.tag === 'ret' && !stopAtSecondRet) break;
  }

  return rows;
}

function markdownTable(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

function renderListing(lines, dump) {
  lines.push(`### ${dump.title}`);
  lines.push('');
  lines.push(`Raw ROM bytes (${dump.maxBytes} bytes from ${hex(dump.start)}):`);
  lines.push('');
  lines.push(`\`${dump.raw}\``);
  lines.push('');
  lines.push('```text');
  for (const row of dump.rows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
}

function collectRamRefs(dump) {
  const refs = [];
  for (const row of dump.rows) {
    // Check addr field (ld-pair-mem, ld-reg-mem, ld-mem-reg, ld-mem-pair)
    const inst = decodeInstruction(romBytes, row.pc, ADL_MODE);
    if (!inst) continue;

    if (Number.isInteger(inst.addr)) {
      const sym = symbolFor(inst.addr);
      if (sym) {
        const isWrite = inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' ||
          (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem');
        refs.push({
          addr: inst.addr,
          symbol: sym,
          access: isWrite ? 'write' : 'read',
          site: `\`${hex(row.pc)} ${row.text}\``,
        });
      }
    }

    // Check ld-pair-imm value as potential pointer
    if (inst.tag === 'ld-pair-imm' && Number.isInteger(inst.value)) {
      const sym = symbolFor(inst.value);
      if (sym) {
        refs.push({
          addr: inst.value,
          symbol: sym,
          access: 'load-addr',
          site: `\`${hex(row.pc)} ${row.text}\``,
        });
      }
    }
  }
  return refs;
}

function collectCalls(dump) {
  const calls = [];
  for (const row of dump.rows) {
    const inst = decodeInstruction(romBytes, row.pc, ADL_MODE);
    if (!inst) continue;
    if (inst.tag === 'call' || inst.tag === 'call-conditional' ||
        inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      const label = targetNameFor(inst.target) || `unknown (${hex(inst.target)})`;
      calls.push({
        site: hex(row.pc),
        kind: inst.tag.startsWith('call') ? 'call' : 'jp',
        target: hex(inst.target),
        meaning: label,
      });
    }
  }
  return calls;
}

function buildReport(dumps) {
  const lines = [];

  lines.push('# Phase 25T - InsertMem subroutine disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('Three pointer-update subroutines called by InsertMem (0x0821B9) after the heap/VAT memory move:');
  lines.push('');
  for (const dump of dumps) {
    lines.push(`- \`${hex(dump.start)}\`: ${dump.title}`);
  }
  lines.push('');
  lines.push('Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.');
  lines.push('');

  // --- Per-subroutine analysis ---
  for (const dump of dumps) {
    lines.push(`## ${dump.title}`);
    lines.push('');

    const refs = collectRamRefs(dump);
    const calls = collectCalls(dump);

    // RAM references
    if (refs.length > 0) {
      lines.push('### RAM references');
      lines.push('');
      // Group by address
      const grouped = new Map();
      for (const ref of refs) {
        const key = ref.addr;
        if (!grouped.has(key)) grouped.set(key, { addr: ref.addr, symbol: ref.symbol, accesses: [] });
        grouped.get(key).accesses.push({ access: ref.access, site: ref.site });
      }
      const tableRows = [];
      for (const [, entry] of grouped) {
        const accessTypes = [...new Set(entry.accesses.map((a) => a.access))].join('+');
        const sites = entry.accesses.map((a) => a.site).join('<br>');
        tableRows.push([`\`${hex(entry.addr)}\``, `\`${entry.symbol}\``, accessTypes, sites]);
      }
      lines.push(...markdownTable(['Address', 'Symbol', 'Access', 'Site(s)'], tableRows));
    } else {
      lines.push('No direct references to known RAM symbols found.');
      lines.push('');
    }

    // Calls
    if (calls.length > 0) {
      lines.push('### Calls and jumps');
      lines.push('');
      const callRows = calls.map((c) => [`\`${c.site}\``, c.kind, `\`${c.target}\``, c.meaning]);
      lines.push(...markdownTable(['Site', 'Kind', 'Target', 'Meaning'], callRows));
    }
  }

  // --- Summary section ---
  lines.push('## Summary');
  lines.push('');

  const allRefs = new Map();
  for (const dump of dumps) {
    const refs = collectRamRefs(dump);
    for (const ref of refs) {
      const key = `${dump.id}:${ref.symbol}`;
      if (!allRefs.has(key)) {
        allRefs.set(key, { sub: hex(dump.start), symbol: ref.symbol, accesses: new Set() });
      }
      allRefs.get(key).accesses.add(ref.access);
    }
  }

  // Build pointer matrix
  const targetSymbols = ['OPBase', 'OPS', 'pTempCnt', 'pTemp', 'progPtr',
    'FPSbase (heap top)', 'FPS (VAT region)', 'newDataPtr (VAT data)',
    'pagedGetPtr (stream reader)', 'tempMem'];
  const subAddrs = dumps.map((d) => hex(d.start));

  lines.push('### Pointer access matrix');
  lines.push('');
  const matrixHeaders = ['Symbol', ...subAddrs];
  const matrixRows = [];
  for (const sym of targetSymbols) {
    const row = [sym];
    for (const dump of dumps) {
      const key = `${dump.id}:${sym}`;
      const entry = allRefs.get(key);
      row.push(entry ? [...entry.accesses].join('+') : '-');
    }
    matrixRows.push(row);
  }
  lines.push(...markdownTable(matrixHeaders, matrixRows));

  lines.push('### Key findings');
  lines.push('');
  lines.push('*(filled by analysis after running the probe)*');
  lines.push('');

  // --- Annotated disassembly ---
  lines.push('## Annotated disassembly');
  lines.push('');
  for (const dump of dumps) {
    renderListing(lines, dump);
  }

  return lines.join('\n');
}

// --- Main ---
const dumps = TARGETS.map((target) => ({
  ...target,
  raw: Array.from(
    romBytes.slice(target.start, target.start + target.maxBytes),
    (value) => value.toString(16).padStart(2, '0'),
  ).join(' '),
  rows: disasmRange(target.start, target.maxBytes, target.stopAtSecondRet || false),
}));

// Console output
for (const dump of dumps) {
  console.log(`\n=== ${dump.title} ===`);
  console.log(`Raw: ${dump.raw.slice(0, 80)}...`);
  console.log('');
  for (const row of dump.rows) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}${row.comment}`);
  }

  const refs = collectRamRefs(dump);
  if (refs.length > 0) {
    console.log('\nRAM references:');
    for (const ref of refs) {
      console.log(`  ${hex(ref.addr)} ${ref.symbol} [${ref.access}] at ${ref.site}`);
    }
  }

  const calls = collectCalls(dump);
  if (calls.length > 0) {
    console.log('\nCalls/jumps:');
    for (const c of calls) {
      console.log(`  ${c.site} ${c.kind} -> ${c.target} (${c.meaning})`);
    }
  }
}

const report = buildReport(dumps);
fs.writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`\n[phase25t] wrote ${path.relative(__dirname, REPORT_PATH)}`);
