#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25o-parseinp-helpers-report.md');

const ADL_MODE = 'adl'; // The in-repo decoder uses the string mode token.
const RAM_LO = 0xd00000;
const RAM_HI = 0xd1ffff;
const KNOWN_INDEX_BASES = { iy: 0xd00080 };

const SYMBOLS = new Map([
  [0xd005f8, '?OP1'],
  [0xd00687, '?asm_ram'],
  [0xd02317, '?begPC'],
  [0xd0231a, '?curPC'],
  [0xd0231d, '?endPC'],
  [0xd02593, '?OPS'],
]);

const TARGETS = [
  { name: 'ParseInp helper 0x099B81', start: 0x099b81, maxBytes: 64 },
  { name: 'ParseInp helper 0x099B18', start: 0x099b18, maxBytes: 64 },
  { name: 'ParseInp helper 0x09BEED', start: 0x09beed, maxBytes: 64 },
  { name: 'Loop body 0x082BE2', start: 0x082be2, maxBytes: 16 },
  { name: 'Loop body 0x084711', start: 0x084711, maxBytes: 16 },
  { name: 'Loop body 0x084716', start: 0x084716, maxBytes: 16 },
  { name: 'Loop body 0x08471B', start: 0x08471b, maxBytes: 16 },
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
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
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

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
    if (inst.tag === 'jp' || inst.tag === 'jr') break;
  }

  return rows;
}

function referenceEvents(target, rows) {
  const events = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

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

    if (inst.indexRegister && Object.hasOwn(KNOWN_INDEX_BASES, inst.indexRegister)) {
      const usesIndexLd = inst.tag === 'ld-reg-ixd'
        || inst.tag === 'ld-ixd-reg'
        || inst.tag === 'ld-ixd-imm'
        || inst.tag === 'ld-pair-indexed'
        || inst.tag === 'ld-indexed-pair'
        || inst.tag === 'ld-ixiy-indexed'
        || inst.tag === 'ld-indexed-ixiy';
      if (!usesIndexLd) continue;

      const addr = (KNOWN_INDEX_BASES[inst.indexRegister] + inst.displacement) & 0xffffff;
      if (addr < RAM_LO || addr > RAM_HI) continue;

      const access = inst.tag === 'ld-reg-ixd' || inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed'
        ? 'read'
        : 'write';

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

function symbolFor(addr) {
  if (SYMBOLS.has(addr)) return SYMBOLS.get(addr);
  if (addr === 0xd005f9) return '?OP1+1';
  return '';
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

function buildReport(disassemblies, groupedAbsolute, groupedIndexed) {
  const lines = [];

  lines.push('# Phase 25O - ParseInp helper disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- ParseInp entry under investigation: `0x099914`.');
  lines.push('- Helper blocks: `0x099b81`, `0x099b18`, `0x09beed`.');
  lines.push('- Failure-loop windows from phase 25K: `0x082be2`, `0x084711`, `0x084716`, `0x08471b`.');
  lines.push("- Decoder note: the local `decodeInstruction` implementation expects mode `'adl'`, so this probe uses that instead of a boolean ADL flag.");
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
      lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(15)} ${row.text}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## RAM LD references');
  lines.push('');
  lines.push('### Absolute-address LDs');
  lines.push('');
  lines.push('| Address | Symbol | Access | Width | Site(s) |');
  lines.push('|---|---|---|---:|---|');
  for (const item of groupedAbsolute) {
    const sites = item.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
    lines.push(`| \`${hex(item.addr)}\` | ${item.symbol ? `\`${item.symbol}\`` : ''} | ${item.access} | ${item.width} | ${sites} |`);
  }
  lines.push('');

  lines.push('### IY-relative LDs resolved with `IY = 0xd00080`');
  lines.push('');
  lines.push('| Address | Access | Width | Site(s) |');
  lines.push('|---|---|---:|---|');
  for (const item of groupedIndexed) {
    const sites = item.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
    lines.push(`| \`${hex(item.addr)}\` | ${item.access} | ${item.width} | ${sites} |`);
  }
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  lines.push('- `0x09beed` reads `?OPS = 0xd02593`. This is the only pointer-like absolute RAM read in the three straight-line helper entry blocks.');
  lines.push('- `0x099b18` uses `?asm_ram = 0xd00687` as a scratch spill: it stores DE there, reloads it into HL, and then calls onward. That slot is active, but it is not the caller-provided parse pointer.');
  lines.push('- `0x099b18` overwrites `?begPC = 0xd02317` and `?curPC = 0xd0231a`; it does not read them in this first block. That means the phase 25K seed values for those slots were being replaced before the later loop.');
  lines.push('- The loop at `0x084711` reads `0xd005f9` (`?OP1+1`) as a byte compare input, not as a pointer fetch.');
  lines.push('- `0x099b81` only touches IY-relative session bytes (`0xd00086`, `0xd00087`, `0xd0008a`, `0xd0008b` when `IY = 0xd00080`). Those look like parser state flags/bytes rather than caller-owned pointer slots.');
  lines.push('- No straight-line read was found here from `0xd02587`, `0xd0231d`, `0xd007fa`, or `0xd008e0`.');
  lines.push('- Inference: the next ParseInp probe should prioritize the `?OPS` family around `0xd02593`; the `?begPC/?curPC` pair behaves like ParseInp-maintained output state in these first blocks, not the input contract.');
  lines.push('');

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

  const allEvents = disassemblies.flatMap((item) => referenceEvents(item, item.rows));
  const absolute = groupEvents(allEvents.filter((event) => event.via === 'absolute'));
  const indexed = groupEvents(allEvents.filter((event) => event.via !== 'absolute'));
  const report = buildReport(disassemblies, absolute, indexed);

  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  process.stdout.write(report);
  process.stdout.write('\n');
  process.stdout.write(`wrote ${path.relative(__dirname, REPORT_PATH)}\n`);
}

main();
