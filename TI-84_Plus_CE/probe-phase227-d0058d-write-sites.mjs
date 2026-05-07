#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');

const D0058D_ADDR = 0xD0058D;
const TABLE_SENTINEL_ADDR = 0x03FC41;
const TABLE_ADDR = TABLE_SENTINEL_ADDR + 1;
const TABLE_LEN = 56;

const ROM = fs.readFileSync(ROM_PATH);
const MATRIX_MARKDOWN = fs.readFileSync(MATRIX_PATH, 'utf8');

const GROUP_NAMES = [
  'keyMatrix[0] arrows',
  'keyMatrix[1] operators',
  'keyMatrix[2] row5',
  'keyMatrix[3] row4',
  'keyMatrix[4] row3',
  'keyMatrix[5] row2',
  'keyMatrix[6] function keys',
];

const RET_BYTES = new Set([0xC0, 0xC8, 0xC9, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8]);
const CONTROL_FLOW_OPS = new Set([
  0xC2, 0xC3, 0xC4, 0xCA, 0xCC, 0xCD, 0xD2, 0xD4, 0xDA, 0xDC,
  0xE2, 0xE4, 0xEA, 0xEC, 0xF2, 0xF4, 0xFA, 0xFC,
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(bytes, addr) {
  return (
    (bytes[addr] & 0xFF) |
    ((bytes[addr + 1] & 0xFF) << 8) |
    ((bytes[addr + 2] & 0xFF) << 16)
  ) >>> 0;
}

function sanitizeLabel(label) {
  return String(label)
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u0398|\u03B8/g, 'theta')
    .replace(/\u2192/g, '->')
    .replace(/\u00B2/g, '^2')
    .replace(/\u207B\u00B9/g, '^-1')
    .replace(/Ã—/g, 'x')
    .replace(/Ã·/g, '/')
    .replace(/Î¸/g, 'theta')
    .replace(/â†’/g, '->')
    .replace(/Â²/g, '^2')
    .replace(/â»Â¹/g, '^-1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseKeyboardMatrix(markdown) {
  const groups = Array.from({ length: 7 }, () => Array(8).fill('(unused)'));
  let currentGroup = null;

  for (const line of markdown.split(/\r?\n/)) {
    const groupMatch = line.match(/^keyMatrix\[(\d+)\]/);
    if (groupMatch) {
      currentGroup = Number(groupMatch[1]);
      continue;
    }

    if (currentGroup === null || currentGroup > 6) {
      continue;
    }

    const bitPattern = /B(\d):\s*(.+?)(?=(?:\s+B\d:|$))/g;
    let bitMatch = bitPattern.exec(line);
    while (bitMatch) {
      groups[currentGroup][Number(bitMatch[1])] = sanitizeLabel(bitMatch[2]);
      bitMatch = bitPattern.exec(line);
    }
  }

  return groups;
}

function formatGenericProps(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates',
  ]);
  const parts = [];

  for (const [key, value] of Object.entries(inst)) {
    if (ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    let rendered = value;
    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target' || key === 'value') {
        rendered = value > 0xFF ? hex(value) : hexByte(value);
      } else {
        rendered = String(value);
      }
    }

    parts.push(`${key}=${rendered}`);
  }

  return parts.join(' ');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'nop':
      return 'nop';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    default:
      return `${inst.tag}${formatGenericProps(inst) ? ` ${formatGenericProps(inst)}` : ''}`;
  }
}

function decodeAt(pc) {
  const inst = decodeInstruction(ROM, pc, 'adl');
  const bytes = Array.from(ROM.slice(pc, pc + inst.length), (value) => hexByte(value));
  return { pc, inst, bytes };
}

function findAlignedStart(site, earliest, latestExclusive) {
  for (let candidate = earliest; candidate <= site; candidate += 1) {
    let pc = candidate;
    let ok = true;
    while (pc < latestExclusive) {
      let inst;
      try {
        inst = decodeInstruction(ROM, pc, 'adl');
      } catch {
        ok = false;
        break;
      }

      if (pc === site) {
        return candidate;
      }

      if (pc > site) {
        break;
      }

      pc += Math.max(1, inst.length);
    }

    if (!ok) {
      continue;
    }
  }

  return site;
}

function disassembleContext(site, before = 30, after = 30) {
  const rawStart = Math.max(0, site - before);
  const rawEnd = Math.min(ROM.length, site + after);
  const start = findAlignedStart(site, rawStart, rawEnd);
  const rows = [];

  let pc = start;
  while (pc < rawEnd && rows.length < 48) {
    let decoded;
    try {
      decoded = decodeAt(pc);
    } catch {
      rows.push({
        pc,
        bytes: [hexByte(ROM[pc])],
        inst: { tag: 'db', value: ROM[pc] },
      });
      pc += 1;
      continue;
    }

    rows.push(decoded);
    pc += Math.max(1, decoded.inst.length);
  }

  return rows;
}

function findRetWindow(site, span = 96) {
  let start = Math.max(0, site - span);
  for (let pc = site - 1; pc >= Math.max(0, site - span); pc -= 1) {
    if (RET_BYTES.has(ROM[pc])) {
      start = pc + 1;
      break;
    }
  }

  let end = Math.min(ROM.length - 1, site + span);
  for (let pc = site; pc < Math.min(ROM.length, site + span); pc += 1) {
    if (RET_BYTES.has(ROM[pc])) {
      end = pc;
      break;
    }
  }

  return { start, end };
}

function findTargetRefs(target) {
  const refs = [];

  for (let pc = 0; pc <= ROM.length - 4; pc += 1) {
    const op = ROM[pc];
    if (!CONTROL_FLOW_OPS.has(op)) {
      continue;
    }
    if (read24(ROM, pc + 1) !== target) {
      continue;
    }

    let rendered = `op=${hexByte(op)}`;
    try {
      rendered = formatInstruction(decodeInstruction(ROM, pc, 'adl'));
    } catch {
      // Keep generic fallback.
    }

    refs.push({ pc, rendered });
  }

  return refs;
}

function scanIndirectHlWrites() {
  const hits = [];

  for (let pc = 0; pc <= ROM.length - 4; pc += 1) {
    if (ROM[pc] !== 0x21 || read24(ROM, pc + 1) !== D0058D_ADDR) {
      continue;
    }

    let cursor = pc;
    let hlStillLive = true;
    for (let steps = 0; steps < 8 && cursor < ROM.length; steps += 1) {
      let decoded;
      try {
        decoded = decodeAt(cursor);
      } catch {
        break;
      }

      const { inst } = decoded;
      if (cursor !== pc && inst.tag === 'ld-ind-reg' && inst.dest === 'hl' && inst.src === 'a') {
        hits.push({
          setupPc: pc,
          storePc: cursor,
        });
        break;
      }

      if (cursor !== pc && (
        (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') ||
        (inst.tag === 'add-pair' && inst.dest === 'hl') ||
        (inst.tag === 'inc-pair' && inst.pair === 'hl') ||
        (inst.tag === 'dec-pair' && inst.pair === 'hl') ||
        (inst.tag === 'pop' && inst.pair === 'hl')
      )) {
        hlStillLive = false;
      }

      if (!hlStillLive) {
        break;
      }

      cursor += Math.max(1, decoded.inst.length);
    }
  }

  return hits;
}

function scanD0058DRefs() {
  const writes = [];
  const reads = [];
  const pointers = [];
  const pairWrites = [];
  const pairReads = [];

  for (let pc = 0; pc <= ROM.length - 4; pc += 1) {
    if (ROM[pc] === 0x32 && read24(ROM, pc + 1) === D0058D_ADDR) {
      writes.push({ pc, kind: 'ld-mem-reg-a' });
    }
    if (ROM[pc] === 0x3A && read24(ROM, pc + 1) === D0058D_ADDR) {
      reads.push({ pc, kind: 'ld-reg-mem-a' });
    }
    if (ROM[pc] === 0x21 && read24(ROM, pc + 1) === D0058D_ADDR) {
      pointers.push({ pc, kind: 'ld-hl-imm' });
    }
    if (pc <= ROM.length - 5 && ROM[pc] === 0xED) {
      const op = ROM[pc + 1];
      const addr = read24(ROM, pc + 2);
      if (addr !== D0058D_ADDR) {
        continue;
      }
      if ([0x43, 0x53, 0x63, 0x73].includes(op)) {
        pairWrites.push({ pc, kind: `ed-${hexByte(op)}` });
      }
      if ([0x4B, 0x5B, 0x6B, 0x7B].includes(op)) {
        pairReads.push({ pc, kind: `ed-${hexByte(op)}` });
      }
    }
  }

  return {
    writes,
    reads,
    pointers,
    pairWrites,
    pairReads,
    indirectWrites: scanIndirectHlWrites(),
  };
}

function inferContext(site) {
  if (site === 0x03FA04) {
    return 'generic setter helper; reached via os.SetKbdKey and other callers';
  }
  if (site === 0x003D55) {
    return 'low-ROM mirror of the generic setter helper';
  }
  if (site === 0x058694) {
    return 'home/common-tail path before parse/input work';
  }
  if (site === 0x09CFCD) {
    return 'restore path around nested processing; stack-restores prior D0058D';
  }
  if (site >= 0x09CC00 && site < 0x09D000) {
    return 'interrupt-sensitive keyboard service code';
  }
  if (site >= 0x05A000 && site < 0x05C000) {
    return 'editor/UI-side normal code';
  }
  if (site >= 0x028000 && site < 0x02A000) {
    return 'system/UI-side normal code';
  }
  return 'normal code';
}

function classifyWriteSite(site, rows) {
  const siteIndex = rows.findIndex((row) => row.pc === site);
  const prev = siteIndex > 0 ? rows[siteIndex - 1].inst : null;
  const hasScanMirror = rows.some(
    (row) => row.pc < site && row.inst.tag === 'ld-mem-reg' && row.inst.addr === 0xD00587,
  );

  if (prev?.tag === 'pop' && prev.pair === 'af') {
    return {
      kind: 'restore',
      valueSource: 'A restored from stack via POP AF',
      siteRole: 'replays a previously saved compact index',
      writeValue: 'saved prior D0058D',
      primary: false,
    };
  }

  if (prev?.tag === 'alu-reg' && (
    (prev.op === 'xor' && prev.src === 'a') ||
    (prev.op === 'sub' && prev.src === 'a')
  )) {
    return {
      kind: 'clear-zero',
      valueSource: 'A forced to 0 immediately before store',
      siteRole: 'clear / no-key path',
      writeValue: '0x00',
      primary: false,
    };
  }

  if (site === 0x03FA04 || site === 0x003D55 || hasScanMirror) {
    return {
      kind: 'generic-setter',
      valueSource: 'caller-supplied A',
      siteRole: 'compact index setter',
      writeValue: 'A (1..56 compact matrix index, or 0)',
      primary: site === 0x03FA04,
    };
  }

  if (prev?.tag === 'ld-reg-imm' && prev.dest === 'a') {
    return {
      kind: 'constant-store',
      valueSource: `A loaded with ${hexByte(prev.value)}`,
      siteRole: 'constant store',
      writeValue: hexByte(prev.value),
      primary: false,
    };
  }

  return {
    kind: 'unknown',
    valueSource: 'unable to collapse statically from local window',
    siteRole: 'unknown',
    writeValue: 'A (unknown source)',
    primary: false,
  };
}

function printTable(headers, rows) {
  const widths = headers.map((header, index) => {
    const dataWidth = Math.max(...rows.map((row) => String(row[index]).length), 0);
    return Math.max(header.length, dataWidth);
  });

  const headerLine = headers.map((header, index) => header.padEnd(widths[index])).join(' | ');
  const separator = widths.map((width) => '-'.repeat(width)).join('-+-');

  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((cell, index) => String(cell).padEnd(widths[index])).join(' | '));
  }
}

function buildTableEntries(keyMatrix) {
  const entries = [];

  for (let group = 0; group < 7; group += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      const index = (group * 8) + bit + 1;
      const scanCode = (group << 4) | bit;
      const keyCode = ROM[TABLE_ADDR + index - 1] & 0xFF;
      const label = sanitizeLabel(keyMatrix[group][bit] ?? '(unused)');
      const used = label !== '(unused)' && label !== '(empty)' && keyCode !== 0x00;

      entries.push({
        group,
        bit,
        index,
        scanCode,
        keyCode,
        label,
        used,
      });
    }
  }

  return entries;
}

function summarizeWriteSite(site, keyEntries) {
  if (site.kind === 'generic-setter') {
    return `${keyEntries.filter((entry) => entry.used).length} physical keys + unused zero cells`;
  }
  if (site.kind === 'restore') {
    return 'whatever compact index was saved on the stack';
  }
  if (site.kind === 'clear-zero') {
    return 'no physical key; clear/no-key only';
  }
  return 'unknown';
}

function printSiteContext(siteInfo) {
  const { site, rows, classification, window, refs } = siteInfo;

  console.log(`\nSite ${hex(site)} — ${classification.kind}`);
  console.log(`  Ret-window: ${hex(window.start)}..${hex(window.end)}`);
  console.log(`  Value source: ${classification.valueSource}`);
  console.log(`  Stored value: ${classification.writeValue}`);
  console.log(`  Role: ${classification.siteRole}`);
  console.log(`  Context: ${inferContext(site)}`);
  console.log(`  ISR status: ${site >= 0x09CC00 && site < 0x09D000 ? 'ISR-adjacent normal code' : 'normal code'}`);

  const refTarget = classification.kind === 'generic-setter'
    ? rows.find((row) => row.pc < site && row.inst.tag === 'ld-mem-reg' && row.inst.addr === 0xD00587)?.pc ?? site
    : site;
  const effectiveRefs = classification.kind === 'generic-setter' && refTarget !== site
    ? findTargetRefs(refTarget)
    : refs;

  if (effectiveRefs.length) {
    console.log('  Control-flow refs:');
    for (const ref of effectiveRefs.slice(0, 8)) {
      console.log(`    ${hex(ref.pc)}: ${ref.rendered}`);
    }
  } else {
    console.log('  Control-flow refs: none found via 24-bit CALL/JP scan');
  }

  console.log('  Context disassembly:');
  for (const row of rows) {
    const marker = row.pc === site ? '>' : ' ';
    const text = row.inst.tag === 'db'
      ? `db ${hexByte(row.inst.value)}`
      : formatInstruction(row.inst);
    console.log(`  ${marker} ${hex(row.pc)}  ${row.bytes.join(' ').padEnd(20)}  ${text}`);
  }
}

function main() {
  const keyMatrix = parseKeyboardMatrix(MATRIX_MARKDOWN);
  const xref = scanD0058DRefs();
  const tableEntries = buildTableEntries(keyMatrix);

  console.log('=== Phase 227: D0058D Write-Site Scan ===');
  console.log('Goal: reconstruct raw scan -> compact D0058D index -> 0x03FC42 table -> TI-OS key code.');
  console.log('');

  console.log('--- Section 1: Static ROM Scan ---');
  console.log(`ROM size: ${hex(ROM.length, 6)} bytes`);
  console.log(`D0058D direct writes: ${xref.writes.length}`);
  console.log(`D0058D direct reads:  ${xref.reads.length}`);
  console.log(`D0058D pointer loads: ${xref.pointers.length}`);
  console.log(`D0058D pair writes:   ${xref.pairWrites.length}`);
  console.log(`D0058D pair reads:    ${xref.pairReads.length}`);
  console.log(`D0058D indirect HL writes: ${xref.indirectWrites.length}`);
  console.log('');
  console.log('Observation: all 12 true writes are direct `LD (0xD0058D),A`; there are no pair writes and no indirect `LD (HL),A` stores to D0058D.');
  console.log('Observation: the IRQ vector itself is not a write site; these writes live in helper/handler code elsewhere in ROM.');

  const siteInfos = xref.writes
    .map(({ pc }) => {
      const rows = disassembleContext(pc);
      const classification = classifyWriteSite(pc, rows);
      const window = findRetWindow(pc);
      const refs = findTargetRefs(pc);
      return { site: pc, rows, classification, window, refs };
    })
    .sort((left, right) => left.site - right.site);

  console.log('\nWrite-site classification:');
  printTable(
    ['site', 'kind', 'stored value', 'value source', 'scope'],
    siteInfos.map((info) => [
      hex(info.site),
      info.classification.kind,
      info.classification.writeValue,
      info.classification.valueSource,
      summarizeWriteSite(info.classification, tableEntries),
    ]),
  );

  console.log('\nCross-reference summary:');
  console.log(`  READ  ${hex(xref.reads[0]?.pc)}: LD A,(0xD0058D)`);
  console.log(`  PTR   ${hex(xref.pointers[0]?.pc)}: LD HL,0xD0058D`);
  console.log(`  Table sentinel byte @ ${hex(TABLE_SENTINEL_ADDR)} = ${hexByte(ROM[TABLE_SENTINEL_ADDR])} (RET from preceding code, not a table entry)`);

  for (const siteInfo of siteInfos) {
    printSiteContext(siteInfo);
  }

  console.log('\n--- Section 2: 0x03FC42..0x03FC79 Compact-Index Table ---');
  console.log(`0x03FC1C uses D0058D as a 1-based index: D0058D=0 returns 0, D0058D=n reads ROM[0x03FC41 + n].`);
  console.log(`First real entry: ${hex(TABLE_ADDR)} ; entry count: ${TABLE_LEN}`);

  for (let group = 0; group < 7; group += 1) {
    console.log(`\n${GROUP_NAMES[group]}:`);
    const rows = tableEntries
      .filter((entry) => entry.group === group)
      .map((entry) => [
        hexByte(entry.index),
        hexByte(entry.scanCode),
        `B${entry.bit}`,
        entry.label,
        hexByte(entry.keyCode),
        entry.used ? 'used' : 'unused/zero',
      ]);
    printTable(['idx', 'scan', 'bit', 'physical key', 'key code', 'note'], rows);
  }

  console.log('\n--- Section 3: Reconstructed Pipeline ---');
  console.log('Compact-index formula derived from the 56-entry layout:');
  console.log('  raw scan code = (keyMatrixIndex << 4) | bit');
  console.log('  D0058D index  = (keyMatrixIndex * 8) + bit + 1');
  console.log('  key code      = ROM[0x03FC41 + D0058D index]');
  console.log('');
  console.log('Setter-site conclusion:');
  console.log('  0x03FA04 is the primary generic compact-index writer used by the page-3 helper.');
  console.log('  0x003D55 is a low-ROM mirror of the same pattern.');
  console.log('  0x09CFCD can restore a previously saved compact index after nested processing.');
  console.log('  The other 9 write sites only clear D0058D back to 0.');

  console.log('\n--- Section 4: Physical-Key Cross-Reference ---');
  console.log('Write-site column uses 0x03FA04 as the canonical non-zero setter; 0x003D55 is a mirror helper with identical store semantics.');
  const physicalRows = tableEntries
    .filter((entry) => entry.used)
    .map((entry) => [
      entry.label,
      hexByte(entry.scanCode),
      hexByte(entry.index),
      hexByte(entry.keyCode),
      hex(0x03FA04),
    ]);
  printTable(
    ['Physical Key', 'Scan Code', 'D0058D Index', 'Key Code', 'Write Site Address'],
    physicalRows,
  );

  console.log('\nZero/unused compact cells in the 56-entry table:');
  const zeroRows = tableEntries
    .filter((entry) => !entry.used)
    .map((entry) => [
      hexByte(entry.index),
      hexByte(entry.scanCode),
      entry.label,
      hexByte(entry.keyCode),
    ]);
  printTable(['Index', 'Scan', 'Matrix Cell', 'Key Code'], zeroRows);

  console.log('\nBottom line:');
  console.log('  - 12 write sites = 2 generic setters + 9 clear-to-zero sites + 1 restore site.');
  console.log('  - The compact index is the flattened 7x8 key-matrix slot, 1-based.');
  console.log('  - 0x03FC42..0x03FC79 maps that compact index to the TI-OS key code.');
}

main();
