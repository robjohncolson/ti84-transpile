#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25r-create-allocator-report.md');

const ADL_MODE = 'adl';
const RAM_LO = 0xd00000;
const RAM_HI = 0xd1ffff;
const VAT_LO = 0xd30000;
const VAT_HI = 0xd3ffff;
const SHORT_MBASE = 0xd00000;

const SYMBOLS = new Map([
  [0xd005f8, 'OP1'],
  [0xd005f9, 'OP1+1'],
  [0xd00603, 'OP2'],
  [0xd0060e, 'OP3'],
  [0xd00619, 'OP4'],
  [0xd00624, 'OP5'],
  [0xd0062f, 'OP6'],
  [0xd008df, 'errNo'],
  [0xd008e0, 'errSP'],
  [0xd0259d, 'progPtr'],
  [0xd0259a, 'pTemp'],
  [0xd02590, 'OPBase'],
  [0xd02593, 'OPS'],
  [0xd02596, 'pTempCnt'],
  [0xd3ffff, 'symTable'],
  [0xd00542, 'scratch'],
  [0xd00687, 'asm_ram'],
]);

const KNOWN_INDEX_BASES = { iy: 0xd00080, ix: 0xd1a860 };

const TARGETS = [
  { name: 'Shared Create allocator 0x0822D9', start: 0x0822d9, maxBytes: 0x100 },
  { name: 'CreateTemp helper 0x08359B', start: 0x08359b, maxBytes: 0x40 },
];

const KNOWN_TARGETS = new Map([
  [0x061d1a, 'error handler (0x061D1A)'],
  [0x061d3e, 'error handler (0x061D3E)'],
  [0x080080, 'type filter helper'],
  [0x080084, 'type guard'],
  [0x0820cd, 'special-name length helper'],
  [0x0820f1, 'allocator tail'],
  [0x0821b9, 'heap/VAT move helper'],
  [0x08234a, 'alternate Create path'],
  [0x08283d, 'temp follow-up helper'],
  [0x08285f, 'temp size helper'],
  [0x082bbe, 'pointer/slot helper'],
  [0x08359b, 'CreateTemp'],
  [0x0846ea, 'FindSym'],
]);

const OP_REGIONS = [
  [0xd005f8, 'OP1'],
  [0xd00603, 'OP2'],
  [0xd0060e, 'OP3'],
  [0xd00619, 'OP4'],
  [0xd00624, 'OP5'],
  [0xd0062f, 'OP6'],
];

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function isShortAddressPrefix(modePrefix) {
  return modePrefix === 'sis' || modePrefix === 'lis';
}

function resolveAbsoluteAddr(inst) {
  if (inst?.addr === undefined) return null;
  if (inst.addr >= 0x10000) return inst.addr;
  if (isShortAddressPrefix(inst.modePrefix)) return SHORT_MBASE | inst.addr;
  return inst.addr;
}

function absoluteWidth(inst) {
  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg') return 8;
  return isShortAddressPrefix(inst.modePrefix) ? 16 : 24;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
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
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-ix': text = `ld sp, ${inst.indexRegister || 'ix'}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister || 'ix'}`; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-reset': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'shift': text = `${inst.op} ${inst.reg}`; break;
    case 'in': text = `in ${inst.dest}, (${inst.port !== undefined ? hexByte(inst.port) : 'c'})`; break;
    case 'out': text = `out (${inst.port !== undefined ? hexByte(inst.port) : 'c'}), ${inst.src}`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'in-imm': text = `in (${hexByte(inst.port)})`; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'neg': text = 'neg'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'daa': text = 'daa'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'im': text = `im ${inst.mode ?? inst.value}`; break;
    case 'exx': text = 'exx'; break;
    case 'jp-hl': text = 'jp (hl)'; break;
    case 'jp-ix': text = `jp (${inst.indexRegister || 'ix'})`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-ixd': text = `inc (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'dec-ixd': text = `dec (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'stmix': text = 'stmix'; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-ind-pair': text = `ld (${inst.dest}), ${inst.pair}`; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'slp': text = 'slp'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ini': text = 'ini'; break;
    case 'outi': text = 'outi'; break;
    case 'ind': text = 'ind'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'otir': text = 'otir'; break;
    case 'indr': text = 'indr'; break;
    case 'otdr': text = 'otdr'; break;
    case 'otimr': text = 'otimr'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function symbolFor(addr) {
  if (addr === null || addr === undefined) return '';
  if (SYMBOLS.has(addr)) return SYMBOLS.get(addr);

  for (const [base, name] of OP_REGIONS) {
    if (addr > base && addr < base + 11) {
      return `${name}+${addr - base}`;
    }
  }

  if (addr < 0xd3ffff && addr >= 0xd3ff00) {
    return `symTable-${hex(0xd3ffff - addr, 2)}`;
  }

  return '';
}

function targetName(addr) {
  return KNOWN_TARGETS.get(addr) || '';
}

function disasmRange(startAddr, maxBytes) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, ADL_MODE);
    } catch (error) {
      rows.push({ pc, bytes: '', text: `decode-error: ${error.message}`, inst: null });
      break;
    }

    if (!inst || inst.length === 0) {
      rows.push({ pc, bytes: '', text: 'decode failed', inst: null });
      break;
    }

    const bytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({ pc: inst.pc, bytes, text: formatInstruction(inst), inst });
    pc += inst.length;
  }

  return rows;
}

function collectBranchTargets(targetNameValue, rows) {
  const targets = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'].includes(inst.tag)) {
      targets.push({
        targetName: targetNameValue,
        from: row.pc,
        type: inst.tag,
        target: inst.target,
        knownName: targetName(inst.target),
        text: row.text,
      });
      continue;
    }

    if (inst.tag === 'jp-indirect') {
      targets.push({
        targetName: targetNameValue,
        from: row.pc,
        type: inst.tag,
        target: null,
        knownName: '',
        text: row.text,
      });
    }
  }

  return targets;
}

function indexedAccessType(inst) {
  if (['ld-reg-ixd', 'ld-pair-indexed', 'ld-ixiy-indexed', 'indexed-cb-bit'].includes(inst.tag)) return 'read';
  if (['ld-ixd-reg', 'ld-ixd-imm', 'ld-indexed-pair', 'ld-indexed-ixiy'].includes(inst.tag)) return 'write';
  if (['inc-ixd', 'dec-ixd', 'alu-ixd', 'indexed-cb-set', 'indexed-cb-res', 'indexed-cb-rotate'].includes(inst.tag)) return 'read+write';
  return null;
}

function indexedAccessWidth(inst) {
  return ['ld-pair-indexed', 'ld-indexed-pair', 'ld-ixiy-indexed', 'ld-indexed-ixiy'].includes(inst.tag) ? 24 : 8;
}

function collectRamEvents(targetNameValue, rows) {
  const events = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (['ld-pair-mem', 'ld-mem-pair', 'ld-reg-mem', 'ld-mem-reg'].includes(inst.tag)) {
      const access = inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' || inst.direction === 'to-mem' ? 'write' : 'read';
      const addr = resolveAbsoluteAddr(inst);
      const width = absoluteWidth(inst);
      if (addr >= RAM_LO && addr <= RAM_HI) {
        events.push({ targetName: targetNameValue, pc: row.pc, addr, via: 'absolute', access, width, text: row.text });
      }
      continue;
    }

    if (inst.indexRegister && Object.prototype.hasOwnProperty.call(KNOWN_INDEX_BASES, inst.indexRegister)) {
      const access = indexedAccessType(inst);
      if (!access) continue;
      const addr = (KNOWN_INDEX_BASES[inst.indexRegister] + inst.displacement) & 0xffffff;
      if (addr < RAM_LO || addr > RAM_HI) continue;
      events.push({ targetName: targetNameValue, pc: row.pc, addr, via: inst.indexRegister, access, width: indexedAccessWidth(inst), text: row.text });
    }
  }

  return events;
}

function collectVatEvents(targetNameValue, rows) {
  const events = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (!['ld-pair-mem', 'ld-mem-pair', 'ld-reg-mem', 'ld-mem-reg'].includes(inst.tag)) continue;

    const addr = resolveAbsoluteAddr(inst);
    if (addr < VAT_LO || addr > VAT_HI) continue;

    const access = inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' || inst.direction === 'to-mem' ? 'write' : 'read';
    events.push({
      targetName: targetNameValue,
      pc: row.pc,
      addr,
      via: 'absolute',
      access,
      width: absoluteWidth(inst),
      text: row.text,
    });
  }

  return events;
}

function groupEvents(events) {
  const grouped = new Map();

  for (const event of events) {
    const key = `${event.targetName}|${event.via}|${event.addr}|${event.access}|${event.width}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        targetName: event.targetName,
        via: event.via,
        addr: event.addr,
        access: event.access,
        width: event.width,
        symbol: symbolFor(event.addr),
        sites: [],
      });
    }
    grouped.get(key).sites.push({ pc: event.pc, text: event.text });
  }

  return [...grouped.values()].sort((left, right) => left.addr - right.addr || left.width - right.width);
}

function findReadsBeforeWrite(events) {
  const byRange = new Map();
  for (const event of events) {
    if (!byRange.has(event.targetName)) byRange.set(event.targetName, []);
    byRange.get(event.targetName).push(event);
  }

  const result = new Map();
  for (const [targetNameValue, rangeEvents] of byRange.entries()) {
    const written = new Set();
    const reads = [];

    for (const event of rangeEvents) {
      const key = String(event.addr);
      const readsHere = event.access === 'read' || event.access === 'read+write';
      const writesHere = event.access === 'write' || event.access === 'read+write';

      if (readsHere && !written.has(key) && !reads.some((item) => item.addr === event.addr)) {
        reads.push({ addr: event.addr, symbol: symbolFor(event.addr), via: event.via, pc: event.pc, text: event.text });
      }
      if (writesHere) written.add(key);
    }

    result.set(targetNameValue, reads);
  }

  return result;
}

function rangeByStart(disassemblies, start) {
  return disassemblies.find((item) => item.start === start);
}

function formatResolvedAddress(addr) {
  const symbol = symbolFor(addr);
  return symbol ? `\`${hex(addr)}\` (\`${symbol}\`)` : `\`${hex(addr)}\``;
}

function formatAddressList(entries) {
  if (!entries || entries.length === 0) return '(none)';
  return entries.map((entry) => formatResolvedAddress(entry.addr)).join(', ');
}

function renderAccessTable(entries) {
  if (entries.length === 0) return ['(none)'];

  const lines = [
    '| Address | Symbol | Via | Access | Width | Site(s) |',
    '|---|---|---|---|---:|---|',
  ];

  for (const entry of entries) {
    const sites = entry.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
    lines.push(`| \`${hex(entry.addr)}\` | ${entry.symbol ? `\`${entry.symbol}\`` : ''} | ${entry.via} | ${entry.access} | ${entry.width} | ${sites} |`);
  }

  return lines;
}

function renderReadSeedTable(entries) {
  if (entries.length === 0) return ['(none)'];

  const lines = [
    '| Address | Symbol | Via | First read |',
    '|---|---|---|---|',
  ];

  for (const entry of entries) {
    lines.push(`| \`${hex(entry.addr)}\` | ${entry.symbol ? `\`${entry.symbol}\`` : ''} | ${entry.via} | \`${hex(entry.pc)} ${entry.text}\` |`);
  }

  return lines;
}

function renderBranchTable(entries) {
  if (entries.length === 0) return ['(none)'];

  const lines = [
    '| From | Kind | Target | Name | Instruction |',
    '|---|---|---|---|---|',
  ];

  for (const entry of entries) {
    const target = entry.target === null ? '`(indirect)`' : `\`${hex(entry.target)}\``;
    lines.push(`| \`${hex(entry.from)}\` | ${entry.type} | ${target} | ${entry.knownName} | \`${entry.text}\` |`);
  }

  return lines;
}

function annotationForRow(row) {
  const notes = [];
  const inst = row.inst;
  if (!inst) return '';

  if (inst.addr !== undefined) {
    const resolved = resolveAbsoluteAddr(inst);
    const symbol = symbolFor(resolved);
    if (symbol) notes.push(symbol);
    if (resolved !== inst.addr) notes.push(`resolves ${hex(resolved)}`);
  }

  if (inst.target !== undefined) {
    const known = targetName(inst.target);
    if (known) notes.push(known);
  }

  return notes.length ? `  ; ${notes.join(', ')}` : '';
}

function buildReport(disassemblies, groupedRamByRange, groupedVatByRange, readsBeforeWriteByRange, branchTargetsByRange) {
  const lines = [];

  const allocator = rangeByStart(disassemblies, 0x0822d9);
  const helper = rangeByStart(disassemblies, 0x08359b);
  const allocatorSeeds = readsBeforeWriteByRange.get(allocator.name) || [];
  const helperSeeds = readsBeforeWriteByRange.get(helper.name) || [];
  const allocatorBranches = branchTargetsByRange.get(allocator.name) || [];
  const helperBranches = branchTargetsByRange.get(helper.name) || [];
  const allocatorCalls = allocatorBranches.filter((entry) => entry.type === 'call' || entry.type === 'call-conditional');
  const helperCalls = helperBranches.filter((entry) => entry.type === 'call' || entry.type === 'call-conditional');
  const directVatWrites = (groupedVatByRange.get(allocator.name) || []).filter((entry) => entry.access !== 'read');
  const helperVatWrites = (groupedVatByRange.get(helper.name) || []).filter((entry) => entry.access !== 'read');

  lines.push('# Phase 25R - Shared Create allocator static disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Main target: `0x0822D9` for 256 bytes.');
  lines.push('- Secondary target: `0x08359B` for 64 bytes.');
  lines.push('- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.');
  lines.push('- Short-mode absolute references (`sis` / `lis`) are resolved against `MBASE = 0xD0`, so `0x2596` is reported as `0xD02596`.');
  lines.push('');
  lines.push('## Direct answers');
  lines.push('');
  lines.push('### 1. What does `0x0822D9` do with `A=type` and `HL=size`?');
  lines.push('');
  lines.push('- `0x0822D9` immediately stores the incoming type byte into `OP1[0]` via `ld (0xD005F8), a`.');
  lines.push('- `0x0822DD` calls `0x080084`. If that helper leaves `Z=1`, execution jumps straight to `0x0822F8` and uses `0x0820CD` to derive a small count/value in `A` from the name bytes.');
  lines.push('- If the type guard does not set `Z`, the allocator reads `OP1+1`. A `]`-prefixed name stays on the `0x0822EB` path, uses `0x0820CD`, rejects `A >= 7` by jumping to `0x061D1A`, then increments `A`. Any other prefix branches to `0x08234A`, the alternate Create path already seen in the phase25q probe.');
  lines.push('- The computed `A` value is pushed at `0x0822FC`. The incoming `HL` is preserved until `call 0x082BBE`; that helper uses `HL` while ultimately returning with `BC = original HL`, so the caller-supplied size (`9` for CreateReal, `18` for CreateCplx) is what the subsequent `call 0x0821B9` uses.');
  lines.push('- After `0x0821B9`, the routine snapshots the resulting pointer through `DE` into `OP1+3`, clears `OP1+2`, restores the saved count into `OP1+6`, turns that count into `BC = count + 7`, calls `0x0820F1`, reloads `DE` from `OP1+3`, and returns.');
  lines.push('');
  lines.push('### 2. Which RAM addresses does it read?');
  lines.push('');
  lines.push(`- Reads-before-write in the allocator window: ${formatAddressList(allocatorSeeds)}.`);
  lines.push(`- Reads-before-write in the ` + '`0x08359B`' + ` helper window: ${formatAddressList(helperSeeds)}.`);
  lines.push('- The full read/write tables are below; the seed list is the minimum set that must exist before a dynamic probe enters these windows.');
  lines.push('');
  lines.push('### 3. Does it call `0x08359B` or any other known subroutine?');
  lines.push('');
  lines.push('- `0x0822D9` itself does not call `0x08359B`. Its direct calls in the 256-byte body are `0x080084`, `0x0820CD`, `0x082BBE`, `0x0821B9`, `0x07F8A2`, and `0x0820F1`.');
  lines.push('- The sibling Create entry points immediately after the allocator body do call `0x08359B`: `0x082393`, `0x0823DD`, and `0x0823EE`.');
  lines.push('- The `0x08359B` window is not the allocator itself; it is a temp-name helper. It increments `pTempCnt`, mirrors that counter into `OP1+2`, writes `$` into `OP1+1`, calls `0x0846EA (FindSym)`, then either returns immediately or continues into collision / relocation logic through `0x08285F`, `0x08283D`, and `0x083615`.');
  lines.push('');
  lines.push('### 4. What does it write to the VAT area (`symTable` region near `0xD3FFFF`)?');
  lines.push('');
  if (directVatWrites.length === 0 && helperVatWrites.length === 0) {
    lines.push('- No direct VAT-region write appears in either probed window.');
    lines.push('- VAT traversal starts deeper in `0x0846EA (FindSym)`, which loads `HL = 0xD3FFFF`; that call is outside the 64-byte `0x08359B` probe window.');
  } else {
    lines.push(`- Direct VAT writes in the allocator window: ${formatAddressList(directVatWrites)}.`);
    lines.push(`- Direct VAT writes in the helper window: ${formatAddressList(helperVatWrites)}.`);
  }
  lines.push('');
  lines.push('### 5. Where does it return?');
  lines.push('');
  lines.push('- Normal allocator return: `0x082349: ret`, immediately after `ld de, (0xD005FB)`, so `DE` is the value returned to the caller.');
  lines.push('- Explicit allocator error exits in the 256-byte window: `0x0822F1: jp nc, 0x061D1A` and the nested `0x082BB9 -> jp 0x061D3E` path reached through `0x082BBE` on carry.');
  lines.push('- `0x08359B` has an early restore-and-return at `0x0835BF: ret`; otherwise it branches onward to `0x083615`, which is outside the 64-byte probe window.');
  lines.push('');
  lines.push('## RAM read/write table');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(...renderAccessTable(groupedRamByRange.get(item.name) || []));
    lines.push('');
  }

  lines.push('## Reads-before-write');
  lines.push('');
  lines.push('These addresses are read before the local window writes them, so they are the immediate pre-seed candidates for future dynamic probes.');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(...renderReadSeedTable(readsBeforeWriteByRange.get(item.name) || []));
    lines.push('');
  }

  lines.push('## Branch targets');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(...renderBranchTable(branchTargetsByRange.get(item.name) || []));
    lines.push('');
  }

  lines.push('## Full annotated disassembly');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(`Raw bytes (\`${item.maxBytes}\` bytes from \`${hex(item.start)}\`):`);
    lines.push('');
    lines.push(`\`${item.raw}\``);
    lines.push('');
    lines.push('```text');
    for (const row of item.rows) {
      lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}${annotationForRow(row)}`);
    }
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const disassemblies = TARGETS.map((target) => ({
    ...target,
    raw: Array.from(
      romBytes.slice(target.start, target.start + target.maxBytes),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' '),
    rows: disasmRange(target.start, target.maxBytes),
  }));

  const allRamEvents = disassemblies.flatMap((item) => collectRamEvents(item.name, item.rows));
  const allVatEvents = disassemblies.flatMap((item) => collectVatEvents(item.name, item.rows));
  const groupedRamByRange = new Map();
  const groupedVatByRange = new Map();
  const readsBeforeWriteByRange = findReadsBeforeWrite(allRamEvents);
  const branchTargetsByRange = new Map();

  for (const item of disassemblies) {
    groupedRamByRange.set(item.name, groupEvents(allRamEvents.filter((event) => event.targetName === item.name)));
    groupedVatByRange.set(item.name, groupEvents(allVatEvents.filter((event) => event.targetName === item.name)));
    branchTargetsByRange.set(item.name, collectBranchTargets(item.name, item.rows));
  }

  const report = buildReport(disassemblies, groupedRamByRange, groupedVatByRange, readsBeforeWriteByRange, branchTargetsByRange);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  process.stdout.write(report);
}

main();
