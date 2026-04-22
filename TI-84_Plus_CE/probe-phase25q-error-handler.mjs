#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25q-error-handler-report.md');

const ADL_MODE = 'adl';
const RAM_LO = 0xd00000;
const RAM_HI = 0xd1ffff;
const KNOWN_INDEX_BASES = { iy: 0xd00080, ix: 0xd1a860 };
const OBSERVED_RUNTIME_TARGET = 0x58c35b;

const SYMBOLS = new Map([
  [0xd0008c, 'IY+0x0c'],
  [0xd00092, 'IY+0x12'],
  [0xd000a4, 'IY+0x24'],
  [0xd000b5, 'IY+0x35'],
  [0xd000c9, 'IY+0x49'],
  [0xd000cb, 'IY+0x4b'],
  [0xd00542, 'scratch'],
  [0xd005f8, 'OP1'],
  [0xd00687, 'asm_ram'],
  [0xd008df, 'errorCodeLatch'],
  [0xd008e0, 'savedErrorSP'],
  [0xd0258a, '?slot_D0258A'],
  [0xd0258d, '?slot_D0258D'],
  [0xd02590, '?slot_D02590'],
  [0xd02593, 'OPS'],
]);

const TARGETS = [
  { name: 'Error convergence 0x061DB2', start: 0x061db2, maxBytes: 128 },
  { name: 'Dispatch tail 0x061D80', start: 0x061d80, maxBytes: 50 },
  { name: 'Common crash sub 0x03E1B4', start: 0x03e1b4, maxBytes: 64 },
  { name: 'Crash continuation 0x03E1CA', start: 0x03e1ca, maxBytes: 64 },
  { name: 'DispErrorScreen 0x062160', start: 0x062160, maxBytes: 64 },
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
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
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
    default: break;
  }

  return `${prefix}${text}`;
}

function symbolFor(addr) {
  return SYMBOLS.get(addr) || '';
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

function collectBranchTargets(rows) {
  const targets = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'].includes(inst.tag)) {
      targets.push({ from: row.pc, type: inst.tag, target: inst.target, text: row.text });
      continue;
    }

    if (inst.tag === 'jp-indirect') {
      targets.push({ from: row.pc, type: inst.tag, target: null, text: row.text });
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

function collectRamEvents(targetName, rows) {
  const events = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (['ld-pair-mem', 'ld-mem-pair', 'ld-reg-mem', 'ld-mem-reg'].includes(inst.tag)) {
      const access = inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' || inst.direction === 'to-mem' ? 'write' : 'read';
      const width = ['ld-reg-mem', 'ld-mem-reg'].includes(inst.tag) ? 8 : 24;
      if (inst.addr >= RAM_LO && inst.addr <= RAM_HI) {
        events.push({ targetName, pc: row.pc, addr: inst.addr, via: 'absolute', access, width, text: row.text });
      }
      continue;
    }

    if (inst.indexRegister && Object.prototype.hasOwnProperty.call(KNOWN_INDEX_BASES, inst.indexRegister)) {
      const access = indexedAccessType(inst);
      if (!access) continue;
      const addr = (KNOWN_INDEX_BASES[inst.indexRegister] + inst.displacement) & 0xffffff;
      if (addr < RAM_LO || addr > RAM_HI) continue;
      events.push({ targetName, pc: row.pc, addr, via: inst.indexRegister, access, width: indexedAccessWidth(inst), text: row.text });
    }
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
  for (const [targetName, rangeEvents] of byRange.entries()) {
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

    result.set(targetName, reads);
  }

  return result;
}

function getRange(disassemblies, start) {
  return disassemblies.find((item) => item.start === start);
}

function renderAccessTable(entries) {
  const lines = [];
  if (entries.length === 0) return ['(none)'];

  lines.push('| Address | Symbol | Via | Access | Width | Site(s) |');
  lines.push('|---|---|---|---|---:|---|');
  for (const entry of entries) {
    const sites = entry.sites.map((site) => `\`${hex(site.pc)} ${site.text}\``).join('<br>');
    lines.push(`| \`${hex(entry.addr)}\` | ${entry.symbol ? `\`${entry.symbol}\`` : ''} | ${entry.via} | ${entry.access} | ${entry.width} | ${sites} |`);
  }
  return lines;
}

function renderReadSeedTable(entries) {
  const lines = [];
  if (entries.length === 0) return ['(none)'];

  lines.push('| Address | Symbol | Via | First read |');
  lines.push('|---|---|---|---|');
  for (const entry of entries) {
    lines.push(`| \`${hex(entry.addr)}\` | ${entry.symbol ? `\`${entry.symbol}\`` : ''} | ${entry.via} | \`${hex(entry.pc)} ${entry.text}\` |`);
  }
  return lines;
}

function buildReport(disassemblies, groupedEventsByRange, readsBeforeWriteByRange) {
  const lines = [];
  const mainRange = getRange(disassemblies, 0x061db2);
  const screenRange = getRange(disassemblies, 0x062160);
  const mainTargets = collectBranchTargets(mainRange.rows);
  const callsDispErrorScreen = mainTargets.some((entry) => entry.target === 0x062160);
  const mainSeeds = readsBeforeWriteByRange.get(mainRange.name) || [];
  const directUnwindSeeds = mainSeeds.filter((entry) => [0xd000cb, 0xd00092, 0xd000a4, 0xd000c9, 0xd008e0].includes(entry.addr));

  lines.push('# Phase 25Q - Error Handler convergence point');
  lines.push('');
  lines.push('## Direct answers');
  lines.push('');
  lines.push(`- Does \`0x061DB2\` CALL or JP to \`0x062160\`? ${callsDispErrorScreen ? 'Yes.' : 'No. The only direct branch in the 128-byte window is `0x061DB6: call 0x03E1B4`.'}`);
  lines.push('- Does `0x061DB2` manipulate `SP`? Yes, but in the return-side continuation immediately after the call: `0x061DCA` does `ld sp, (0xD008E0)`, then `pop af; ret`. The same 128-byte family also saves `SP` back to `0xD008E0` at `0x061E19` and uses `ex (sp), hl` at `0x061E2A`.');
  lines.push(`- Does \`0x061DB2\` read RAM that would need seeding? Yes. On the observed unwind path the minimum static reads-before-write are ${directUnwindSeeds.map((entry) => `\`${hex(entry.addr)}\``).join(', ')}. Deeper helper logic in the same 128-byte window also reads \`0xD0258A\`, \`0xD02590\`, and \`0xD02593\`.`);
  lines.push(`- What is the full control flow from \`0x061DB2\` to \`0x58C35B\`? Statically: \`0x061DB2\` saves the error code to \`0xD008DF\`, calls \`0x03E1B4\`, that wrapper eventually returns through \`0x03E1CA\`, the call returns to \`0x061DBA\`, and \`0x061DCA\` restores \`SP\` from \`0xD008E0\` before a final \`ret\`. The session-75 endpoint \`0x58C35B\` is therefore a dynamic return PC popped from the restored stack, not a static ROM jump target.`);
  lines.push('');
  lines.push('## Key observations');
  lines.push('');
  lines.push('- `0x061D80..0x061DB0` is not hidden logic; it is just the tail of the dispatch table, continuing the repeated `ld a, error_code ; jr 0x061DB2` pattern.');
  lines.push('- `0x061DB2` and `0x062160` are data-linked even without a direct branch: `0x061DB2` writes the incoming error code to `0xD008DF`, and `0x062160` later reads `0xD008DF` when formatting the displayed error text.');
  lines.push('- `0x03E1B4` / `0x03E1CA` preserve `A` through `0xD00542` and preserve the previous interrupt-enable state through the classic `ld a, i` / `push af` / `pop af` pattern.');
  lines.push('');
  lines.push('## Static control-flow interpretation');
  lines.push('');
  lines.push('1. `0x061DB2: ld (0xD008DF), a` saves the error code byte from the dispatch table.');
  lines.push('2. `0x061DB6: call 0x03E1B4` enters the common interrupt-preserving wrapper.');
  lines.push('3. `0x03E1B4..0x03E1C6` saves `A` into `0xD00542`, captures the old interrupt state, disables interrupts, reloads `A`, and calls `0x03E187`.');
  lines.push('4. When that subcall returns, execution continues at `0x03E1CA`, which restores `A` from `0xD00542` and finishes with `ret` at `0x03E1D8`.');
  lines.push('5. That `ret` returns to `0x061DBA`, because `0x061DB6` was a normal `call` with return address `0x061DBA`.');
  lines.push('6. `0x061DBA..0x061DC6` clears four `IY`-relative status bits: `IY+0x4B`, `IY+0x12`, `IY+0x24`, and `IY+0x49`.');
  lines.push('7. `0x061DCA..0x061DD0` restores `SP` from `0xD008E0`, pops `AF`, and `ret`s again.');
  lines.push(`8. The final return target is whatever 24-bit PC lives on the restored stack. In the observed failing run that value was \`${hex(OBSERVED_RUNTIME_TARGET)}\`, so the transpiler's \`missing_block\` stop is a dynamic return target, not a static branch encoded in ROM.`);
  lines.push('');
  lines.push('## RAM reads and writes');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(...renderAccessTable(groupedEventsByRange.get(item.name) || []));
    lines.push('');
  }

  lines.push('## Reads-before-write');
  lines.push('');
  lines.push('These are the RAM locations each disassembled window reads before it writes them locally, so they are the obvious pre-seed candidates for static or dynamic probes.');
  lines.push('');

  for (const item of disassemblies) {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(...renderReadSeedTable(readsBeforeWriteByRange.get(item.name) || []));
    lines.push('');
  }

  lines.push('## Disassembly');
  lines.push('');

  for (const item of disassemblies) {
    const branches = collectBranchTargets(item.rows);
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(`Raw bytes (\`${item.maxBytes}\` bytes from \`${hex(item.start)}\`):`);
    lines.push('');
    lines.push(`\`${item.raw}\``);
    lines.push('');
    lines.push('Branch targets:');
    if (branches.length === 0) {
      lines.push('- (none)');
    } else {
      for (const branch of branches) {
        lines.push(`- \`${hex(branch.from)}\` ${branch.type} -> ${branch.target === null ? '`(indirect)`' : `\`${hex(branch.target)}\``} via \`${branch.text}\``);
      }
    }
    lines.push('');
    lines.push('```text');
    for (const row of item.rows) {
      lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}`);
    }
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const disassemblies = TARGETS.map((target) => ({
    ...target,
    raw: Array.from(romBytes.slice(target.start, target.start + target.maxBytes), (value) => value.toString(16).padStart(2, '0')).join(' '),
    rows: disasmRange(target.start, target.maxBytes),
  }));

  const allEvents = disassemblies.flatMap((item) => collectRamEvents(item.name, item.rows));
  const groupedEventsByRange = new Map();
  const readsBeforeWriteByRange = findReadsBeforeWrite(allEvents);

  for (const item of disassemblies) {
    groupedEventsByRange.set(item.name, groupEvents(allEvents.filter((event) => event.targetName === item.name)));
  }

  const report = buildReport(disassemblies, groupedEventsByRange, readsBeforeWriteByRange);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  process.stdout.write(report);
}

main();
