#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const ENTRY = 0x0302EB;
const CALLER_START = 0x02FF0B;
const CALLER_END = 0x02FF4F;
const NEXT_CONTEXT_START = 0x0302FA;
const NEXT_CONTEXT_END = 0x03030E;
const MAX_TRACE_END = 0x030388;

const TABLE_BASE = 0x09F79B;
const TABLE_WINDOW_SIZE = 0x38;
const TABLE_PLANES = [
  { name: 'none', add: 0x00 },
  { name: '2nd', add: 0x38 },
  { name: 'alpha', add: 0x70 },
  { name: 'alpha+2nd', add: 0xA8 },
];

const IY_BASE = 0xD00080;
const NUM_MODE_ADDR = IY_BASE + 0x4B;
const CONTEXT_BYTE_ADDR = 0xD007E0;

const KNOWN_ADDRS = new Map([
  [NUM_MODE_ADDR, 'numMode'],
  [CONTEXT_BYTE_ADDR, 'context byte'],
]);

const KNOWN_TARGETS = new Map([
  [0x022346, '0x09F79B lookup helper'],
  [0x02FFED, 'shared accept-token path'],
  [0x02FE84, 'shared translated-key return'],
  [0x09F79B, 'translation table base'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatSigned(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : '-'}0x${Math.abs(numeric).toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatSigned(displacement)})`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${value > 0xFF ? hex(value) : hexByte(value)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ex-af':
      return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl':
      return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl':
      return { mnemonic: 'ex', operands: '(sp), hl' };

    case 'ret-conditional':
      return { mnemonic: 'ret', operands: inst.condition };
    case 'jr':
      return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp':
      return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'jp', operands: `(${inst.indirectRegister ?? inst.reg ?? 'hl'})` };
    case 'call':
      return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst':
      return { mnemonic: 'rst', operands: hexByte(inst.target ?? inst.vector) };

    case 'push':
      return { mnemonic: 'push', operands: inst.pair };
    case 'pop':
      return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind':
      return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg':
      return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm':
      return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return { mnemonic: 'ld', operands: `${inst.dest ?? 'a'}, (${hex(inst.addr ?? inst.address)})` };
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr ?? inst.address)}), ${inst.src ?? 'a'}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind':
      return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair':
      return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl':
      return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair':
      return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };

    case 'inc-pair':
      return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair':
      return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg':
      return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg':
      return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd':
      return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair':
      return { mnemonic: 'add', operands: `${inst.dest ?? 'hl'}, ${inst.src}` };
    case 'adc-pair':
      return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair':
      return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg':
      return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm':
      return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ind':
      return { mnemonic: inst.op, operands: '(hl)' };
    case 'alu-ixd':
      return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind':
      return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind':
      return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind':
      return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg':
      return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind':
      return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'lea':
      return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'tst-reg':
      return { mnemonic: 'tst', operands: inst.reg };
    case 'tst-ind':
      return { mnemonic: 'tst', operands: '(hl)' };
    case 'tst-imm':
      return { mnemonic: 'tst', operands: hexByte(inst.value) };
    case 'im':
      return { mnemonic: 'im', operands: String(inst.mode_num ?? inst.mode ?? '?') };
    case 'in-reg':
      return { mnemonic: 'in', operands: `${inst.dest ?? inst.reg}, (c)` };
    case 'out-reg':
      return { mnemonic: 'out', operands: `(c), ${inst.src ?? inst.reg}` };
    case 'in-a-imm':
      return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-a-imm':
      return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'ld-mb-a':
      return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb':
      return { mnemonic: 'ld', operands: 'a, mb' };

    default: {
      const operands = fallbackOperands(inst);
      return { mnemonic: inst?.tag ?? 'db', operands };
    }
  }
}

function createDecoder(romBytes) {
  return {
    decodeAt(address) {
      const raw = decodeInstruction(romBytes, address, MODE);
      const rendered = renderInstruction(raw);
      return {
        address,
        mnemonic: rendered.mnemonic,
        operands: rendered.operands,
        length: raw.length,
        bytes: romBytes.subarray(address, address + raw.length),
        raw,
      };
    },
  };
}

function decodeRange(decoder, start, endExclusive) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const row = decoder.decodeAt(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function formatLine(row) {
  const text = `${row.mnemonic}${row.operands ? ` ${row.operands}` : ''}`;
  return `${hex(row.address)}: ${formatBytes(row.bytes).padEnd(20)} ${text}`;
}

function knownTargetLabel(target) {
  return KNOWN_TARGETS.get(target) ?? null;
}

function indexedAbsoluteAddress(raw) {
  if (raw?.indexRegister === 'iy' && typeof raw.displacement === 'number') {
    return (IY_BASE + raw.displacement) & 0xFFFFFF;
  }
  return null;
}

function annotationForRow(row) {
  const notes = [];
  const raw = row.raw;

  if (typeof raw?.addr === 'number' && KNOWN_ADDRS.has(raw.addr)) {
    notes.push(KNOWN_ADDRS.get(raw.addr));
  }

  const indexedAddr = indexedAbsoluteAddress(raw);
  if (indexedAddr !== null) {
    const label = KNOWN_ADDRS.get(indexedAddr);
    if (label) {
      notes.push(`${label} @ ${hex(indexedAddr)}`);
    } else {
      notes.push(`IY-relative @ ${hex(indexedAddr)}`);
    }
  }

  if (typeof raw?.target === 'number') {
    const label = knownTargetLabel(raw.target);
    if (label) {
      notes.push(label);
    }
  }

  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function controlFlowSuccessors(row) {
  const { raw, address, length } = row;
  const next = address + length;

  switch (raw.tag) {
    case 'ret':
    case 'reti':
    case 'retn':
    case 'jp':
    case 'jp-indirect':
      return [];
    case 'jr':
      return [raw.target];
    case 'jr-conditional':
    case 'jp-conditional':
    case 'djnz':
      return [next, raw.target];
    case 'ret-conditional':
      return [next];
    default:
      return [next];
  }
}

function traceReachableFunction(decoder, start, endExclusive) {
  const queue = [start];
  const seen = new Set();
  const rows = [];

  while (queue.length > 0) {
    const address = queue.shift();
    if (seen.has(address) || address < start || address >= endExclusive) continue;

    const row = decoder.decodeAt(address);
    seen.add(address);
    rows.push(row);

    for (const next of controlFlowSuccessors(row)) {
      if (!seen.has(next) && next >= start && next < endExclusive) {
        queue.push(next);
      }
    }
  }

  return rows.sort((left, right) => left.address - right.address);
}

function findDirectCallers(romBytes, target) {
  const callers = [];
  for (let pc = 0; pc < romBytes.length;) {
    let raw;
    try {
      raw = decodeInstruction(romBytes, pc, MODE);
    } catch {
      pc += 1;
      continue;
    }

    if (!raw || !raw.length) {
      pc += 1;
      continue;
    }

    if ((raw.tag === 'call' || raw.tag === 'call-conditional') && raw.target === target) {
      callers.push({ address: pc, tag: raw.tag, condition: raw.condition ?? null });
    }

    pc += raw.length;
  }

  return callers;
}

function findTableByteHits(romBytes, value) {
  const hits = [];
  for (const plane of TABLE_PLANES) {
    for (let slot = 1; slot <= TABLE_WINDOW_SIZE; slot += 1) {
      const address = TABLE_BASE + plane.add + slot;
      if (romBytes[address] === value) {
        hits.push({
          plane: plane.name,
          slot,
          address,
        });
      }
    }
  }
  return hits;
}

function printSection(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`  ${formatLine(row)}${annotationForRow(row)}`);
  }
  console.log('');
}

function printSummary(callers, bodyRows, table44Hits) {
  const readsContextByte = bodyRows.some((row) => row.raw?.addr === CONTEXT_BYTE_ADDR);
  const absoluteReads = bodyRows
    .filter((row) => row.raw?.tag === 'ld-reg-mem' || row.raw?.tag === 'ld-a-mem')
    .map((row) => row.raw.addr);
  const callTargets = bodyRows
    .filter((row) => row.raw?.tag === 'call' || row.raw?.tag === 'call-conditional')
    .map((row) => row.raw.target);

  console.log('=== SUMMARY ===');
  console.log(`  Direct callers of ${hex(ENTRY)}: ${callers.length ? callers.map((caller) => hex(caller.address)).join(', ') : '(none found)'}`);
  console.log(`  Caller contract: ${hex(0x02FF11)} loads DE=${hex(TABLE_BASE)}, ${hex(0x02FF15)} forms HL=DE+A, ${hex(0x02FF16)} calls ${hex(0x022346)}, and ${hex(0x02FF1B)} immediately calls ${hex(ENTRY)}.`);
  console.log(`  That means ${hex(ENTRY)} is inspecting the raw lookup byte at (HL), not a returned token register.`);
  console.log(`  Check 1: if (HL) != ${hexByte(0x44)}, it executes CP A and RET. Z=1 on return, so the caller does not take JP NZ,${hex(0x02FFED)}.`);
  console.log(`  Check 2: if (HL) == ${hexByte(0x44)}, it tests BIT 4,(IY+0x4B) = BIT 4,(${hex(NUM_MODE_ADDR)}).`);
  console.log('  Check 3: if that bit is clear, it returns with Z=1 via RET Z and the key stays on the normal path.');
  console.log(`  Check 4: if that bit is set, it loads A=${hexByte(0x1D)} and RETs with NZ, so the caller jumps to ${hex(0x02FFED)} for the special path.`);
  console.log(`  IY-relative RAM reads inside ${hex(ENTRY)}: ${hex(NUM_MODE_ADDR)} (numMode) only.`);
  console.log(`  Absolute RAM reads inside ${hex(ENTRY)}: ${absoluteReads.length ? absoluteReads.map((addr) => hex(addr)).join(', ') : 'none'}.`);
  console.log(`  Reads ${hex(CONTEXT_BYTE_ADDR)} inside ${hex(ENTRY)}: ${readsContextByte ? 'yes' : 'no'}; that context byte is used later in the caller after the validator returns Z.`);
  console.log(`  CALL targets inside ${hex(ENTRY)}: ${callTargets.length ? callTargets.map((addr) => hex(addr)).join(', ') : 'none'}.`);
  if (table44Hits.length) {
    console.log(`  Translation-table byte ${hexByte(0x44)} appears at ${table44Hits.length} reachable 0x09F79B-plane slot(s): ${table44Hits.map((hit) => `${hit.plane}@slot ${hexByte(hit.slot)} (${hex(hit.address)})`).join(', ')}.`);
  }
  console.log(`  Conclusion: ${hex(ENTRY)} is not a general token-validity filter. It is a narrow special-case gate that remaps/rejects lookup byte ${hexByte(0x44)} when numMode bit 4 is set.`);
  console.log('');
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const decoder = createDecoder(rom);

  const callers = findDirectCallers(rom, ENTRY);
  const callerRows = decodeRange(decoder, CALLER_START, CALLER_END);
  const bodyRows = traceReachableFunction(decoder, ENTRY, MAX_TRACE_END);
  const nextRows = decodeRange(decoder, NEXT_CONTEXT_START, NEXT_CONTEXT_END);
  const table44Hits = findTableByteHits(rom, 0x44);

  console.log('Phase 387 - Disassemble 0x0302EB token-validation gate');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Entry: ${hex(ENTRY)}`);
  console.log(`IY base assumption: ${hex(IY_BASE)} -> IY+0x4B = ${hex(NUM_MODE_ADDR)} (numMode)`);
  console.log('');

  console.log('=== DIRECT CALLERS ===');
  if (!callers.length) {
    console.log(`  No direct CALL ${hex(ENTRY)} sites found.`);
  } else {
    for (const caller of callers) {
      const suffix = caller.condition ? ` (${caller.condition})` : '';
      console.log(`  ${hex(caller.address)}${suffix}`);
    }
  }
  console.log('');

  printSection('=== CALLER WINDOW 0x02FF0B..0x02FF4E ===', callerRows);
  printSection(`=== REACHABLE BODY OF ${hex(ENTRY)} ===`, bodyRows);
  printSection('=== ADJACENT CONTEXT AFTER THE FUNCTION ===', nextRows);
  printSummary(callers, bodyRows, table44Hits);
}

main();
