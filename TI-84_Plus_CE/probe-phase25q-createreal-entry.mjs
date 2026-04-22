#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25q-createreal-entry-report.md');

const ADL_MODE = 'adl';
const RAM_LO = 0xd00000;
const RAM_HI = 0xd1ffff;
const KNOWN_INDEX_BASES = { iy: 0xd00080, ix: 0xd1a860 };

const SYMBOLS = new Map([
  [0xd005f8, '?OP1'],
  [0xd005f9, '?OP1+1'],
  [0xd00603, '?OP2'],
  [0xd0060e, '?OP3'],
  [0xd00619, '?OP4'],
  [0xd00624, '?OP5'],
  [0xd0062f, '?OP6'],
  [0xd008df, '?errNo'],
  [0xd008e0, '?errSP'],
  [0xd0259d, '?progPtr'],
  [0xd0259a, '?pTemp'],
  [0xd02590, '?OPBase'],
  [0xd3ffff, '?symTable'],
  [0xd00080, '?IY_base'],
  [0xd1a860, '?IX_base'],
]);

// Also match nearby addresses for OP regions
function symbolFor(addr) {
  if (SYMBOLS.has(addr)) return SYMBOLS.get(addr);
  // Check if within known OP regions (each is 11 bytes)
  const ops = [
    [0xd005f8, 'OP1'], [0xd00603, 'OP2'], [0xd0060e, 'OP3'],
    [0xd00619, 'OP4'], [0xd00624, 'OP5'], [0xd0062f, 'OP6'],
  ];
  for (const [base, name] of ops) {
    if (addr > base && addr < base + 11) {
      return `?${name}+${addr - base}`;
    }
  }
  return '';
}

const TARGETS = [
  { name: 'Context before entry (other CreateXxx)', start: 0x082340, maxBytes: 48 },
  { name: 'CreateReal region 0x082370', start: 0x082370, maxBytes: 128 },
  { name: 'CreateReal impl 0x08238A (overlap)', start: 0x08238a, maxBytes: 64 },
];

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
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
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
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
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister || 'ix'}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-reset': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'shift': text = `${inst.op} ${inst.reg}`; break;
    case 'in': text = `in ${inst.dest}, (${inst.port !== undefined ? hexByte(inst.port) : 'c'})`; break;
    case 'out': text = `out (${inst.port !== undefined ? hexByte(inst.port) : 'c'}), ${inst.src}`; break;
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
    case 'im': text = `im ${inst.mode}`; break;
    case 'exx': text = 'exx'; break;
    case 'jp-hl': text = 'jp (hl)'; break;
    case 'jp-ix': text = `jp (${inst.indexRegister || 'ix'})`; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'inc-ixd': text = `inc (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'dec-ixd': text = `dec (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'xor-a': text = 'xor a'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function disasmRange(startAddr, maxBytes) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, ADL_MODE);
    if (!inst || inst.length === 0) {
      rows.push({
        pc,
        bytes: '',
        text: '??? (decode failed)',
        inst: null,
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
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function referenceEvents(target, rows) {
  const events = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    // Absolute address RAM accesses
    if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg') {
      const access = inst.tag === 'ld-mem-pair'
        || inst.tag === 'ld-mem-reg'
        || inst.direction === 'to-mem'
        ? 'write'
        : 'read';
      const width = inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' ? 8 : 24;
      if (inst.addr >= RAM_LO && inst.addr <= RAM_HI) {
        events.push({
          target: target.name,
          pc: row.pc,
          addr: inst.addr,
          access,
          width,
          text: row.text,
          via: 'absolute',
        });
      }
      continue;
    }

    // Index register offset accesses (IX and IY)
    if (inst.indexRegister && Object.hasOwn(KNOWN_INDEX_BASES, inst.indexRegister)) {
      const usesIndexLd = inst.tag === 'ld-reg-ixd'
        || inst.tag === 'ld-ixd-reg'
        || inst.tag === 'ld-ixd-imm'
        || inst.tag === 'ld-pair-indexed'
        || inst.tag === 'ld-indexed-pair'
        || inst.tag === 'ld-ixiy-indexed'
        || inst.tag === 'ld-indexed-ixiy'
        || inst.tag === 'inc-ixd'
        || inst.tag === 'dec-ixd'
        || inst.tag === 'alu-ixd'
        || inst.tag === 'indexed-cb-bit'
        || inst.tag === 'indexed-cb-set'
        || inst.tag === 'indexed-cb-res';
      if (!usesIndexLd) continue;

      const addr = (KNOWN_INDEX_BASES[inst.indexRegister] + inst.displacement) & 0xffffff;
      if (addr < RAM_LO || addr > RAM_HI) continue;

      let access;
      if (inst.tag === 'ld-reg-ixd' || inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed' || inst.tag === 'indexed-cb-bit') {
        access = 'read';
      } else if (inst.tag === 'alu-ixd') {
        access = 'read';
      } else if (inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd') {
        access = 'read+write';
      } else if (inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res') {
        access = 'read+write';
      } else {
        access = 'write';
      }

      events.push({
        target: target.name,
        pc: row.pc,
        addr,
        access,
        width: inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-indexed-pair' || inst.tag === 'ld-ixiy-indexed' || inst.tag === 'ld-indexed-ixiy' ? 24 : 8,
        text: row.text,
        via: inst.indexRegister,
      });
    }
  }

  return events;
}

function groupEvents(events) {
  const grouped = new Map();

  for (const event of events) {
    const key = `${event.via}:${event.addr}:${event.access}:${event.width}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        via: event.via,
        addr: event.addr,
        access: event.access,
        width: event.width,
        symbol: symbolFor(event.addr),
        sites: [],
      });
    }
    const bucket = grouped.get(key);
    const siteKey = `${event.pc}:${event.text}`;
    if (!bucket.sites.some((site) => `${site.pc}:${site.text}` === siteKey)) {
      bucket.sites.push({ target: event.target, pc: event.pc, text: event.text });
    }
  }

  return [...grouped.values()].sort((left, right) => left.addr - right.addr || left.width - right.width);
}

function findReadBeforeWrite(allEvents) {
  const results = [];
  const targetGroups = new Map();

  for (const event of allEvents) {
    if (!targetGroups.has(event.target)) {
      targetGroups.set(event.target, []);
    }
    targetGroups.get(event.target).push(event);
  }

  for (const [targetName, events] of targetGroups) {
    const written = new Set();
    const readBeforeWrite = new Map();

    for (const event of events) {
      const addrKey = `${event.addr}`;
      if (event.access === 'read' || event.access === 'read+write') {
        if (!written.has(addrKey) && !readBeforeWrite.has(addrKey)) {
          readBeforeWrite.set(addrKey, {
            addr: event.addr,
            pc: event.pc,
            text: event.text,
            via: event.via,
            symbol: symbolFor(event.addr),
          });
        }
      }
      if (event.access === 'write' || event.access === 'read+write') {
        written.add(addrKey);
      }
    }

    if (readBeforeWrite.size > 0) {
      results.push({ target: targetName, reads: [...readBeforeWrite.values()] });
    }
  }

  return results;
}

function buildReport(disassemblies, groupedAbsolute, groupedIndexed, readBeforeWrite) {
  const lines = [];

  lines.push('# Phase 25Q - CreateReal entry sequence disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- CreateReal JT slot: `0x020534` -> impl at `0x08238A`');
  lines.push('- Entry sequence: xor a; ld hl,9; jr 0x082386');
  lines.push('- Type-check at `0x08239c`: reads OP1+1 (0xD005F9)');
  lines.push('- Compares against: 0x5D (list `]`), 0x24 (`$` string), 0x3A (`:` program), 0x72 (`r`)');
  lines.push('- OP4 read at 0xD00619');
  lines.push('- IX = `0xD1A860`, IY = `0xD00080`');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`## ${item.name}`);
    lines.push('');
    lines.push(`Raw ROM bytes (${item.maxBytes} bytes from ${hex(item.start)}):`);
    lines.push('');
    lines.push(`\`${item.raw}\``);
    lines.push('');
    lines.push('```text');
    for (const row of item.rows) {
      const sym = symbolFor(row.inst?.addr || 0);
      const symNote = sym ? `  ; ${sym}` : '';
      // Also annotate branch targets
      let branchNote = '';
      if (row.inst && (row.inst.tag === 'call' || row.inst.tag === 'jp' || row.inst.tag === 'jr' ||
          row.inst.tag === 'call-conditional' || row.inst.tag === 'jp-conditional' || row.inst.tag === 'jr-conditional')) {
        // Check if target is a known address
        if (row.inst.target === 0x082386) branchNote = '  ; <- shared entry point';
        if (row.inst.target === 0x08239c) branchNote = '  ; <- type-check';
      }
      lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}${symNote}${branchNote}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## RAM LD references');
  lines.push('');
  lines.push('### Absolute-address LDs (0xD00000-0xD1FFFF)');
  lines.push('');
  if (groupedAbsolute.length === 0) {
    lines.push('(none found)');
  } else {
    lines.push('| Address | Symbol | Access | Width | Site(s) |');
    lines.push('|---|---|---|---:|---|');
    for (const item of groupedAbsolute) {
      const sites = item.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
      lines.push(`| \`${hex(item.addr)}\` | ${item.symbol ? `\`${item.symbol}\`` : ''} | ${item.access} | ${item.width} | ${sites} |`);
    }
  }
  lines.push('');

  lines.push('### IX-relative LDs resolved with `IX = 0xD1A860`');
  lines.push('');
  const ixItems = groupedIndexed.filter((item) => item.via === 'ix');
  if (ixItems.length === 0) {
    lines.push('(none found)');
  } else {
    lines.push('| Address | Symbol | Access | Width | Site(s) |');
    lines.push('|---|---|---|---:|---|');
    for (const item of ixItems) {
      const sites = item.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
      lines.push(`| \`${hex(item.addr)}\` | ${item.symbol ? `\`${item.symbol}\`` : ''} | ${item.access} | ${item.width} | ${sites} |`);
    }
  }
  lines.push('');

  lines.push('### IY-relative LDs resolved with `IY = 0xD00080`');
  lines.push('');
  const iyItems = groupedIndexed.filter((item) => item.via === 'iy');
  if (iyItems.length === 0) {
    lines.push('(none found)');
  } else {
    lines.push('| Address | Symbol | Access | Width | Site(s) |');
    lines.push('|---|---|---|---:|---|');
    for (const item of iyItems) {
      const sites = item.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
      lines.push(`| \`${hex(item.addr)}\` | ${item.symbol ? `\`${item.symbol}\`` : ''} | ${item.access} | ${item.width} | ${sites} |`);
    }
  }
  lines.push('');

  lines.push('## Reads-before-write analysis');
  lines.push('');
  lines.push('RAM addresses read before any write in the same block (these must be pre-initialized):');
  lines.push('');
  if (readBeforeWrite.length === 0) {
    lines.push('(none found)');
  } else {
    for (const group of readBeforeWrite) {
      lines.push(`### ${group.target}`);
      lines.push('');
      lines.push('| Address | Symbol | Via | First read at |');
      lines.push('|---|---|---|---|');
      for (const read of group.reads) {
        lines.push(`| \`${hex(read.addr)}\` | ${read.symbol ? `\`${read.symbol}\`` : ''} | ${read.via} | \`${hex(read.pc)} ${read.text}\` |`);
      }
      lines.push('');
    }
  }

  lines.push('## Call/jump targets');
  lines.push('');
  lines.push('Unique call/jump targets found across all blocks:');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function analyzeFindings(disassemblies) {
  const lines = [];
  lines.push('## Key Findings');
  lines.push('');

  // Q1: What does 0x082386 do with A=0 and HL=9?
  lines.push('### Q1: What does code at 0x082386 do with A=0 and HL=9?');
  lines.push('');
  const region = disassemblies.find(d => d.start === 0x082370);
  if (region) {
    // Find instruction at 0x082386
    const at86 = region.rows.find(r => r.pc === 0x082386);
    if (at86) {
      lines.push(`At 0x082386: \`${at86.text}\``);
    }
    // Show the sequence from 0x082386 onward
    lines.push('');
    lines.push('Instruction sequence from 0x082386:');
    lines.push('```');
    let started = false;
    let count = 0;
    for (const row of region.rows) {
      if (row.pc >= 0x082386) started = true;
      if (started && count < 12) {
        lines.push(`${hex(row.pc)}: ${row.text}`);
        count++;
      }
    }
    lines.push('```');
  }
  lines.push('');

  // Q2: Does A=0 bypass the type check?
  lines.push('### Q2: Does A=0 bypass the type check at 0x08239c?');
  lines.push('');
  if (region) {
    const at9c = region.rows.find(r => r.pc === 0x08239c);
    if (at9c) {
      lines.push(`At 0x08239c: \`${at9c.text}\``);
    }
    // Show the sequence around the type-check
    lines.push('');
    lines.push('Type-check sequence:');
    lines.push('```');
    let started = false;
    let count = 0;
    for (const row of region.rows) {
      if (row.pc >= 0x082396) started = true;
      if (started && count < 16) {
        lines.push(`${hex(row.pc)}: ${row.text}`);
        count++;
      }
    }
    lines.push('```');
    lines.push('');
    lines.push('Analysis: A=0 means a read from OP1+1 is loaded into A. The `or a` / `cp` sequence ');
    lines.push('determines whether the variable name starts with a special prefix byte. A=0 at entry ');
    lines.push('is the INITIAL register state, but it gets overwritten by the OP1+1 read before the compare.');
  }
  lines.push('');

  // Q3: Other CreateXxx entries
  lines.push('### Q3: What other CreateXxx entries share code near 0x082370?');
  lines.push('');
  const context = disassemblies.find(d => d.start === 0x082340);
  if (context) {
    lines.push('Entries in the 0x082340-0x082370 region:');
    lines.push('```');
    for (const row of context.rows) {
      lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('Look for `xor a` / `ld a, N` patterns followed by `jr` to 0x082386 — ');
    lines.push('these are other CreateXxx entry points that share the same dispatcher at 0x082386.');
  }
  lines.push('');

  // Q4: OP4 read
  lines.push('### Q4: What does the OP4 (0xD00619) read do?');
  lines.push('');
  if (region) {
    // Find any instruction referencing 0xD00619
    const op4refs = region.rows.filter(r => r.inst && r.inst.addr === 0xd00619);
    if (op4refs.length > 0) {
      for (const ref of op4refs) {
        lines.push(`At ${hex(ref.pc)}: \`${ref.text}\``);
      }
    } else {
      lines.push('No direct absolute reference to 0xD00619 found in main region.');
      lines.push('Check OP4 area references (0xD00619-0xD00623):');
      const op4area = region.rows.filter(r => r.inst && r.inst.addr >= 0xd00619 && r.inst.addr <= 0xd00623);
      if (op4area.length > 0) {
        for (const ref of op4area) {
          lines.push(`At ${hex(ref.pc)}: \`${ref.text}\` (addr: ${hex(ref.inst.addr)})`);
        }
      } else {
        lines.push('OP4 may be accessed via indirect HL or index register. Check the overlap block.');
      }
    }
  }
  lines.push('');

  return lines.join('\n') + '\n';
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

  const allEvents = disassemblies.flatMap((item) => referenceEvents(item, item.rows));
  const absolute = groupEvents(allEvents.filter((event) => event.via === 'absolute'));
  const indexed = groupEvents(allEvents.filter((event) => event.via !== 'absolute'));
  const readBeforeWrite = findReadBeforeWrite(allEvents);

  // Collect call/jump targets
  const callTargets = new Map();
  const jumpTargets = new Map();
  for (const item of disassemblies) {
    for (const row of item.rows) {
      if (!row.inst) continue;
      if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
        const target = row.inst.target;
        if (!callTargets.has(target)) callTargets.set(target, []);
        callTargets.get(target).push({ from: row.pc, block: item.name });
      }
      if (row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional' || row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional') {
        const target = row.inst.target;
        if (!jumpTargets.has(target)) jumpTargets.set(target, []);
        jumpTargets.get(target).push({ from: row.pc, block: item.name });
      }
    }
  }

  let report = buildReport(disassemblies, absolute, indexed, readBeforeWrite);

  // Append call/jump targets
  const targetLines = [];
  targetLines.push('### Calls');
  targetLines.push('');
  if (callTargets.size === 0) {
    targetLines.push('(none)');
  } else {
    targetLines.push('| Target | Called from |');
    targetLines.push('|---|---|');
    for (const [target, sites] of [...callTargets.entries()].sort((a, b) => a[0] - b[0])) {
      const from = sites.map((s) => `\`${hex(s.from)}\` (${s.block})`).join(', ');
      targetLines.push(`| \`${hex(target)}\` | ${from} |`);
    }
  }
  targetLines.push('');
  targetLines.push('### Jumps');
  targetLines.push('');
  if (jumpTargets.size === 0) {
    targetLines.push('(none)');
  } else {
    targetLines.push('| Target | From |');
    targetLines.push('|---|---|');
    for (const [target, sites] of [...jumpTargets.entries()].sort((a, b) => a[0] - b[0])) {
      const from = sites.map((s) => `\`${hex(s.from)}\` (${s.block})`).join(', ');
      targetLines.push(`| \`${hex(target)}\` | ${from} |`);
    }
  }
  targetLines.push('');

  report += targetLines.join('\n') + '\n';

  // Add analysis
  report += analyzeFindings(disassemblies);

  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  process.stdout.write(report);
  process.stdout.write('\n');
  process.stdout.write(`wrote ${path.relative(__dirname, REPORT_PATH)}\n`);
}

main();
