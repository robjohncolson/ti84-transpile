#!/usr/bin/env node

/**
 * Phase 310 Probe: map USB/FIFO jump-vector entries 36-48.
 *
 * Scope:
 * - Read jump-vector entries [36..48] from 0x000578.
 * - Disassemble each target handler.
 * - Extract IN/OUT port accesses and register usage.
 * - Count CALL/JP references to each vector slot and direct target.
 * - Print summary tables for endpoint, FIFO-map, and FIFO-config handlers.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REF_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const rom = readFileSync(ROM_PATH);
const referenceText = readFileSync(REF_PATH, 'utf8');

const TABLE_START = 0x000578;
const ENTRY_SIZE = 4;
const ENTRY_START = 36;
const ENTRY_END = 48;
const PREVIEW_BYTES = 0x30;
const LAST_ENTRY_SCAN_LIMIT = 0x100;

const CALLER_CONTEXT = new Map([
  [0x02A1F2, 'usb init/reset batch'],
  [0x02A1FD, 'usb init/reset batch'],
  [0x02A208, 'usb init/reset batch'],
  [0x02A215, 'usb init/reset batch'],
  [0x02A220, 'usb init/reset batch'],
  [0x02A22B, 'usb init/reset batch'],
  [0x02A31E, 'direction-specific stall path'],
  [0x02A32D, 'direction-specific stall path'],
  [0x02A9D8, 'usb endpoint sweep/reset loop'],
  [0x02A9E3, 'usb endpoint sweep/reset loop'],
  [0x02A9EE, 'usb endpoint sweep/reset loop'],
  [0x02AA0D, 'usb endpoint sweep/reset loop'],
  [0x02AA18, 'usb endpoint sweep/reset loop'],
  [0x02AA23, 'usb endpoint sweep/reset loop'],
]);

const DIRECT_TARGET_CONTEXT = [
  { start: 0x009E00, end: 0x00A6FF, label: 'runtime endpoint helpers' },
  { start: 0x00BD00, end: 0x00C5FF, label: 'usb config builders' },
  { start: 0x00F900, end: 0x00F9FF, label: 'runtime transfer helper' },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatName(name) {
  return name.startsWith('usb_') ? name.slice(4) : name;
}

function parseReferenceNames() {
  const map = new Map();
  const regex = /^\?(usb_[A-Za-z0-9_]+)\s*:=\s*([0-9A-Fa-f]+)h$/gm;
  let match;
  while ((match = regex.exec(referenceText))) {
    const [, name, addrHex] = match;
    map.set(parseInt(addrHex, 16), name);
  }
  return map;
}

const referenceNames = parseReferenceNames();

function readVectorEntries() {
  const entries = [];
  for (let index = ENTRY_START; index <= ENTRY_END; index++) {
    const addr = TABLE_START + index * ENTRY_SIZE;
    const opcode = rom[addr];
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    const name = referenceNames.get(addr) ?? `vector_${index}`;
    entries.push({ index, addr, opcode, target, name });
  }
  return entries;
}

function findLastEntryEnd(start) {
  let pc = start;
  const limit = Math.min(start + LAST_ENTRY_SCAN_LIMIT, rom.length);
  while (pc < limit) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst?.length) break;
    pc += inst.length;
    if (inst.tag === 'ret') {
      return pc;
    }
  }
  return limit;
}

function disasmRange(start, endExclusive) {
  const lines = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst?.length) {
      break;
    }
    const bytes = Array.from(rom.subarray(pc, pc + inst.length))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    lines.push({ addr: pc, bytes, inst });
    pc += inst.length;
  }
  return lines;
}

function formatInstruction(inst) {
  if (inst.dasm) return inst.dasm;
  switch (inst.tag) {
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ret': return 'ret';
    case 'rst': return `rst ${hex(inst.target, 2)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-indexed': return `ld ${inst.pair}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    default: return `[${inst.tag}]`;
  }
}

function findRefsTo(targetAddr) {
  const low = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const high = (targetAddr >> 16) & 0xFF;
  const refs = [];
  for (let pc = 0; pc < rom.length - 3; pc++) {
    const op = rom[pc];
    if ((op === 0xCD || op === 0xC3) && rom[pc + 1] === low && rom[pc + 2] === mid && rom[pc + 3] === high) {
      refs.push({ site: pc, kind: op === 0xCD ? 'CALL' : 'JP' });
    }
  }
  return refs;
}

function classifySites(refs, classifier) {
  const counts = new Map();
  for (const ref of refs) {
    const label = classifier(ref.site);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function classifyVectorSite(site) {
  return CALLER_CONTEXT.get(site) ?? 'other';
}

function classifyTargetSite(site) {
  for (const range of DIRECT_TARGET_CONTEXT) {
    if (site >= range.start && site <= range.end) {
      return range.label;
    }
  }
  return 'other';
}

function collectRegisters(lines) {
  const regs = new Set();
  for (const { inst } of lines) {
    for (const field of ['pair', 'dest', 'src', 'reg', 'indexRegister']) {
      if (inst[field]) regs.add(String(inst[field]).toUpperCase());
    }
    if (inst.tag === 'add-pair') {
      regs.add(String(inst.dest).toUpperCase());
      regs.add(String(inst.src).toUpperCase());
    }
  }
  return [...regs].sort();
}

function extractPortOps(lines) {
  const ops = [];
  let currentBC = null;
  for (const { addr, inst } of lines) {
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      currentBC = inst.value & 0xFFFF;
      continue;
    }
    if (inst.tag === 'inc-reg' && inst.reg === 'c' && currentBC !== null) {
      currentBC = (currentBC + 1) & 0xFFFF;
      continue;
    }
    if (inst.tag === 'dec-reg' && inst.reg === 'c' && currentBC !== null) {
      currentBC = (currentBC - 1) & 0xFFFF;
      continue;
    }
    if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && currentBC !== null) {
      ops.push({
        addr,
        port: currentBC,
        access: inst.tag === 'in-reg' ? 'read' : 'write',
        reg: inst.reg.toUpperCase(),
      });
      continue;
    }
    if (inst.tag === 'in0' || inst.tag === 'out0' || inst.tag === 'in-imm' || inst.tag === 'out-imm') {
      ops.push({
        addr,
        port: inst.port & 0xFFFF,
        access: inst.tag.startsWith('in') ? 'read' : 'write',
        reg: (inst.reg ?? 'A').toUpperCase(),
      });
    }
  }
  return ops;
}

function summarizePorts(portOps) {
  const grouped = new Map();
  for (const op of portOps) {
    const key = hex(op.port, 4);
    let row = grouped.get(key);
    if (!row) {
      row = { port: key, reads: 0, writes: 0, regs: new Set() };
      grouped.set(key, row);
    }
    if (op.access === 'read') row.reads++;
    if (op.access === 'write') row.writes++;
    row.regs.add(op.reg);
  }
  return [...grouped.values()].sort((a, b) => a.port.localeCompare(b.port));
}

function portFamily(port) {
  if (port >= 0x3160 && port <= 0x316D) return '0x3161 family';
  if (port >= 0x3180 && port <= 0x318D) return '0x3181 family';
  if (port >= 0x31A8 && port <= 0x31AB) return '0x31A8 family';
  if (port >= 0x31AC && port <= 0x31AF) return '0x31AC family';
  return 'other';
}

function deriveOperation(entry) {
  const name = formatName(entry.name);
  if (name.includes('ClrStall')) return 'clear STALL bit';
  if (name.includes('SetStall')) return 'set STALL bit';
  if (name.includes('ClrReset')) return 'clear RESET bit';
  if (name.includes('SetReset')) return 'set RESET bit';
  if (name.includes('SendZlp')) return 'set ZLP/send bit';
  if (name.includes('SetFifoMap')) return 'write FIFO-map byte';
  if (name.includes('SetEndpointConfig')) return 'write endpoint config word';
  if (name.includes('ClrEndpointConfig')) return 'clear endpoint config word';
  if (name.includes('SetFifoConfig')) return 'write FIFO-config byte';
  return 'unknown';
}

function buildEntries() {
  const raw = readVectorEntries();
  return raw.map((entry, offset) => {
    const next = raw[offset + 1];
    const end = next ? next.target : findLastEntryEnd(entry.target);
    const lines = disasmRange(entry.target, end);
    const portOps = extractPortOps(lines);
    return {
      ...entry,
      end,
      length: end - entry.target,
      lines,
      registers: collectRegisters(lines),
      portOps,
      portSummary: summarizePorts(portOps),
      vectorRefs: findRefsTo(entry.addr),
      targetRefs: findRefsTo(entry.target),
      operation: deriveOperation(entry),
    };
  });
}

function printSection(title) {
  console.log(`\n${'='.repeat(96)}`);
  console.log(title);
  console.log('='.repeat(96));
}

function printPreview(entry) {
  console.log(`\n[${entry.index}] ${hex(entry.addr)} -> ${hex(entry.target)} ${formatName(entry.name)}`);
  console.log(`  length: ${hex(entry.length, 4)} (${entry.length} bytes)`);
  console.log(`  registers: ${entry.registers.join(', ')}`);
  console.log(`  operation: ${entry.operation}`);
  const previewEnd = Math.min(entry.target + PREVIEW_BYTES, entry.end);
  for (const line of entry.lines) {
    if (line.addr >= previewEnd) break;
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${formatInstruction(line.inst)}`);
  }
}

function printRefList(label, refs, classifier) {
  if (refs.length === 0) {
    console.log(`  ${label}: none`);
    return;
  }
  const counts = classifySites(refs, classifier);
  const parts = refs.map((ref) => `${ref.kind}@${hex(ref.site)} (${classifier(ref.site)})`);
  console.log(`  ${label}: ${refs.length}`);
  console.log(`    ${parts.join(', ')}`);
  console.log(`    by-context: ${[...counts.entries()].map(([name, count]) => `${name}=${count}`).join(', ')}`);
}

function printSummaryTable(entries) {
  console.log();
  console.log('Idx  Vector    Target    Len    Name                    Ports                            VecRefs  TgtRefs');
  console.log('-'.repeat(96));
  for (const entry of entries) {
    const ports = entry.portSummary
      .map((row) => `${row.port}${row.reads ? ' R' : ''}${row.writes ? ' W' : ''}`)
      .join(', ');
    console.log(
      `${String(entry.index).padStart(3)}  ${hex(entry.addr)}  ${hex(entry.target)}  ${hex(entry.length, 4)}  ` +
      `${formatName(entry.name).padEnd(22)}  ${ports.padEnd(30)}  ` +
      `${String(entry.vectorRefs.length).padStart(3)}      ${String(entry.targetRefs.length).padStart(3)}`,
    );
  }
}

function printPortFamilyTable(entries) {
  const families = new Map();
  for (const entry of entries) {
    for (const op of entry.portOps) {
      const name = portFamily(op.port);
      let row = families.get(name);
      if (!row) {
        row = { ports: new Set(), readers: new Set(), writers: new Set() };
        families.set(name, row);
      }
      row.ports.add(hex(op.port, 4));
      if (op.access === 'read') row.readers.add(entry.index);
      if (op.access === 'write') row.writers.add(entry.index);
    }
  }

  console.log();
  console.log('Family           Effective Ports                                  Readers        Writers');
  console.log('-'.repeat(96));
  for (const [family, row] of families.entries()) {
    console.log(
      `${family.padEnd(15)}  ${[...row.ports].sort().join(', ').padEnd(46)}  ` +
      `${[...row.readers].sort((a, b) => a - b).join(', ').padEnd(13)}  ` +
      `${[...row.writers].sort((a, b) => a - b).join(', ')}`,
    );
  }
}

function main() {
  const entries = buildEntries();

  printSection('SECTION 1: Vector entries 36-48');
  for (const entry of entries) {
    console.log(
      `[${entry.index}] ${hex(entry.addr)} opcode=${hex(entry.opcode, 2)} target=${hex(entry.target)} ` +
      `${formatName(entry.name)}`,
    );
  }

  printSection('SECTION 2: Disassembly previews (first 0x30 bytes)');
  for (const entry of entries) {
    printPreview(entry);
  }

  printSection('SECTION 3: Caller references to vector slots');
  for (const entry of entries) {
    console.log(`\n[${entry.index}] ${hex(entry.addr)} ${formatName(entry.name)}`);
    printRefList('vector refs', entry.vectorRefs, classifyVectorSite);
  }

  printSection('SECTION 4: Direct caller references to target bodies');
  for (const entry of entries) {
    console.log(`\n[${entry.index}] ${hex(entry.target)} ${formatName(entry.name)}`);
    printRefList('target refs', entry.targetRefs, classifyTargetSite);
  }

  printSection('SECTION 5: Port-family summary');
  printPortFamilyTable(entries);

  printSection('SECTION 6: Final summary table');
  printSummaryTable(entries);

  console.log('\nNotes:');
  console.log('- Entries 36-44 are endpoint bit-twiddlers that select endpoint 1..4 from the first stack argument.');
  console.log('- Entry 45 writes FIFO-map bytes to 0x31A8..0x31AB.');
  console.log('- Entry 46 writes a 16-bit endpoint config word to IN (0x3160/61..0x316C/6D) or OUT (0x3180/81..0x318C/8D) ports.');
  console.log('- Entry 47 is the zeroing wrapper around entry 46.');
  console.log('- Entry 48 writes FIFO-config bytes to 0x31AC..0x31AF.');
  console.log('- No vector-slot callers from the known OS event-loop USB/timer path were found.');
}

main();
