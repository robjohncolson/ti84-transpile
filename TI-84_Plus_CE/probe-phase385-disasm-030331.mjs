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
const WINDOW_START = 0x030300;
const WINDOW_END_EXCLUSIVE = 0x030400;
const FOCUS_ADDR = 0x030331;

// In this OS path the short-immediate forms in the 0x03030E block run with
// MBASE=0xD0, so sis/lis addresses like 0x0001 resolve to 0xD00001.
const SHORT_ADDR_MBASE = 0xD0;
const IY_BASE = 0xD00080;

const KEYBOARD_ADDRS = new Map([
  [0xD00587, { name: 'kbdScanCode', note: 'scan code returned by GetCSC' }],
  [0xD00588, { name: 'kbdLGSC', note: 'last key / LGSC byte' }],
  [0xD00589, { name: 'kbdPSC', note: 'previous key byte' }],
  [0xD0058A, { name: 'kbdWUR', note: 'repeat/update byte' }],
  [0xD0058B, { name: 'kbdDebncCnt', note: 'debounce counter' }],
  [0xD0058C, { name: 'kbdKey', note: 'primary key byte' }],
  [0xD0058D, { name: 'kbdGetKy', note: 'GetKey result byte' }],
  [0xD0058E, { name: 'keyExtend', note: 'extension / secondary key byte' }],
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

function bytesToHex(buffer, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(buffer.length, addr + Math.max(length, 0));
  return Array.from(
    buffer.subarray(addr, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
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
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return { mnemonic: 'db', operands: hexByte(inst.value) };
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
      return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call':
      return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst':
      return { mnemonic: 'rst', operands: hexByte(inst.target) };

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
      return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
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
    case 'ld-pair-indexed':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-special':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a':
      return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb':
      return { mnemonic: 'ld', operands: 'a, mb' };

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
      return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair':
      return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair':
      return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg':
      return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm':
      return { mnemonic: inst.op, operands: hexByte(inst.value) };
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
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg':
      return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg':
      return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm':
      return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm':
      return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0':
      return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0':
      return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af':
      return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl':
      return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl':
      return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair':
      return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im':
      return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt':
      return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg':
      return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind':
      return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm':
      return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio':
      return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea':
      return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea':
      return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return {
        mnemonic: inst?.tag ?? 'unknown',
        operands: fallbackOperands(inst),
      };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function resolveDirectAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }

  const viaShort = inst.mode === MODE
    && (inst.modePrefix === 'sis' || inst.modePrefix === 'lis')
    && inst.addr >= 0
    && inst.addr <= 0xFFFF;

  return {
    raw: inst.addr >>> 0,
    effective: viaShort ? (((SHORT_ADDR_MBASE << 16) | inst.addr) >>> 0) : (inst.addr >>> 0),
    viaShort,
  };
}

function resolveIndexedAddress(inst) {
  if (!inst || !Number.isInteger(inst.displacement)) {
    return null;
  }

  if (inst.indexRegister === 'iy') {
    return (IY_BASE + inst.displacement) & 0xFFFFFF;
  }

  return null;
}

function describeKeyboard(addr) {
  const entry = KEYBOARD_ADDRS.get(addr);
  if (!entry) {
    return null;
  }
  return `${entry.name} (${hex(addr)})`;
}

function isReadTag(inst) {
  return inst.tag === 'ld-reg-mem'
    || (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem')
    || inst.tag === 'ld-reg-ixd'
    || inst.tag === 'alu-ixd'
    || inst.tag === 'bit-test'
    || inst.tag === 'bit-test-ind'
    || inst.tag === 'indexed-cb-bit'
    || inst.tag === 'indexed-cb-rotate'
    || inst.tag === 'rotate-ind';
}

function isWriteTag(inst) {
  return inst.tag === 'ld-mem-reg'
    || inst.tag === 'ld-mem-pair'
    || (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')
    || inst.tag === 'ld-ixd-reg'
    || inst.tag === 'ld-ixd-imm'
    || inst.tag === 'indexed-cb-set'
    || inst.tag === 'indexed-cb-res'
    || inst.tag === 'inc-ixd'
    || inst.tag === 'dec-ixd';
}

function isReadWriteTag(inst) {
  return inst.tag === 'indexed-cb-rotate' || inst.tag === 'rotate-ind';
}

function buildMemoryAnnotations(inst) {
  const notes = [];

  const direct = resolveDirectAddress(inst);
  if (direct) {
    const keyboard = describeKeyboard(direct.effective);
    const kind = isReadTag(inst) ? 'READ' : isWriteTag(inst) ? 'WRITE' : isReadWriteTag(inst) ? 'RMW' : 'ADDR';

    if (keyboard) {
      notes.push(`${kind} ${keyboard}`);
    } else if (direct.viaShort) {
      notes.push(`short addr ${hex(direct.raw, 6)} -> effective ${hex(direct.effective)} with MBASE=${hex(SHORT_ADDR_MBASE, 2)}`);
    }
  }

  const indexed = resolveIndexedAddress(inst);
  if (indexed !== null) {
    const keyboard = describeKeyboard(indexed);
    if (keyboard) {
      const kind = isReadTag(inst) ? 'READ' : isWriteTag(inst) ? 'WRITE' : 'RMW';
      notes.push(`${kind} ${keyboard} via IY`);
    } else {
      notes.push(`IY${formatSigned(inst.displacement)} -> ${hex(indexed)}`);
    }
  }

  return notes;
}

function isUnconditionalTerminator(inst) {
  return inst.tag === 'ret'
    || inst.tag === 'reti'
    || inst.tag === 'retn'
    || inst.tag === 'jp'
    || inst.tag === 'jp-indirect'
    || inst.tag === 'jr'
    || inst.tag === 'halt'
    || inst.tag === 'slp';
}

function findProbableEntry(rows) {
  let candidate = null;

  for (const row of rows) {
    if (row.pc >= FOCUS_ADDR) {
      break;
    }
    if (isUnconditionalTerminator(row.inst)) {
      candidate = row.pc + row.length;
    }
  }

  return candidate;
}

function findSwapPattern(rows) {
  for (let index = 0; index < rows.length - 5; index += 1) {
    const a = rows[index];
    const b = rows[index + 1];
    const c = rows[index + 2];
    const d = rows[index + 3];
    const e = rows[index + 4];
    const f = rows[index + 5];

    if (
      a.inst.tag === 'ld-reg-reg'
      && a.inst.dest === 'b'
      && a.inst.src === 'a'
      && b.inst.tag === 'ld-reg-mem'
      && b.inst.dest === 'a'
      && b.inst.addr === 0xD0058C
      && c.inst.tag === 'ld-mem-reg'
      && c.inst.addr === 0xD0058E
      && c.inst.src === 'a'
      && d.inst.tag === 'ld-reg-reg'
      && d.inst.dest === 'a'
      && d.inst.src === 'b'
      && e.inst.tag === 'ld-mem-reg'
      && e.inst.addr === 0xD0058C
      && e.inst.src === 'a'
      && f.inst.tag === 'ld-reg-mem'
      && f.inst.dest === 'a'
      && f.inst.addr === 0xD0058E
    ) {
      return {
        startPc: a.pc,
        savePrimaryPc: c.pc,
        replacePrimaryPc: e.pc,
        reloadExtendPc: f.pc,
        endPc: f.pc,
      };
    }
  }

  return null;
}

function collectKeyboardHits(rows) {
  const hits = [];

  for (const row of rows) {
    const direct = resolveDirectAddress(row.inst);
    if (direct && KEYBOARD_ADDRS.has(direct.effective)) {
      hits.push({
        pc: row.pc,
        addr: direct.effective,
        access: isReadTag(row.inst) ? 'read' : isWriteTag(row.inst) ? 'write' : 'ref',
        text: row.text,
      });
    }

    const indexed = resolveIndexedAddress(row.inst);
    if (indexed !== null && KEYBOARD_ADDRS.has(indexed)) {
      hits.push({
        pc: row.pc,
        addr: indexed,
        access: isReadTag(row.inst) ? 'read' : isWriteTag(row.inst) ? 'write' : 'ref',
        text: row.text,
      });
    }
  }

  return hits;
}

function disassembleWindow(memory) {
  const rows = [];
  let pc = WINDOW_START;

  while (pc < WINDOW_END_EXCLUSIVE && pc < memory.length) {
    const inst = safeDecode(memory, pc, MODE);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      length,
      bytes: bytesToHex(memory, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function annotateRows(rows, probableEntry, swapPattern) {
  const swapStart = swapPattern?.startPc ?? null;

  return rows.map((row) => {
    const notes = [];

    if (row.pc === probableEntry) {
      notes.push('probable function entry');
    }

    if (row.inst.tag === 'call') {
      notes.push(`CALL target ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'call-conditional') {
      notes.push(`conditional CALL ${row.inst.condition} -> ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'jp') {
      notes.push(`JP target ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'jp-conditional') {
      notes.push(`conditional JP ${row.inst.condition} -> ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'jr') {
      notes.push(`unconditional branch -> ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'jr-conditional') {
      notes.push(`conditional branch ${row.inst.condition} -> ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'djnz') {
      notes.push(`loop branch -> ${hex(row.inst.target)}`);
    } else if (row.inst.tag === 'ret' || row.inst.tag === 'reti' || row.inst.tag === 'retn') {
      notes.push('terminator');
    } else if (row.inst.tag === 'ret-conditional') {
      notes.push(`conditional return ${row.inst.condition}`);
    }

    notes.push(...buildMemoryAnnotations(row.inst));

    if (row.pc === 0x03032C) {
      notes.push('load primary byte from D00001 into A');
    } else if (row.pc === 0x030330) {
      notes.push('kbdKey gets primary byte');
    } else if (row.pc === 0x030334) {
      notes.push('load candidate extension/second byte from D00002');
    } else if (row.pc === 0x030339) {
      notes.push('zero second byte takes fast path to 0x03034F');
    } else if (row.pc === swapStart) {
      notes.push('nonzero second-byte swap path begins');
    } else if (row.pc === swapPattern?.savePrimaryPc) {
      notes.push('copy old kbdKey -> keyExtend');
    } else if (row.pc === swapPattern?.replacePrimaryPc) {
      notes.push('replace kbdKey with second byte');
    } else if (row.pc === swapPattern?.reloadExtendPc) {
      notes.push('reload keyExtend into A before tail-jump');
    } else if (row.pc === 0x03034F) {
      notes.push('zero-extension path: keyExtend = 0');
    } else if (row.pc === 0x030353) {
      notes.push('tail-jump with A = keyExtend (or 0)');
    }

    return {
      ...row,
      notes,
    };
  });
}

function printDisassembly(rows) {
  console.log('=== STATIC DISASSEMBLY: 0x030300..0x030400 (end-exclusive; 256 bytes) ===');
  console.log('');
  for (const row of rows) {
    const suffix = row.notes.length ? ` ; ${row.notes.join(' | ')}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${suffix}`);
  }
  console.log('');
}

function printKeyboardSummary(hits) {
  const requested = [0xD00587, 0xD00588, 0xD00589, 0xD0058A, 0xD0058B, 0xD0058C, 0xD0058E];

  console.log('Keyboard RAM refs in this window:');
  for (const addr of requested) {
    const label = KEYBOARD_ADDRS.get(addr);
    const addrHits = hits.filter((hit) => hit.addr === addr);
    if (addrHits.length === 0) {
      console.log(`  ${label.name.padEnd(11)} ${hex(addr)}  none`);
      continue;
    }

    console.log(`  ${label.name.padEnd(11)} ${hex(addr)}  ${addrHits.length} hit(s)`);
    for (const hit of addrHits) {
      console.log(`    ${hex(hit.pc)}  ${hit.access.toUpperCase().padEnd(5)}  ${hit.text}`);
    }
  }
  console.log('');
}

function printControlFlowSummary(rows) {
  const calls = rows
    .filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional')
    .map((row) => `${hex(row.pc)} -> ${hex(row.inst.target)} (${row.inst.tag})`);

  const jumps = rows
    .filter((row) => row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional' || row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional' || row.inst.tag === 'djnz')
    .map((row) => `${hex(row.pc)} -> ${hex(row.inst.target)} (${row.inst.tag})`);

  console.log('CALL targets:');
  for (const line of calls) {
    console.log(`  ${line}`);
  }
  if (!calls.length) {
    console.log('  none');
  }
  console.log('');

  console.log('JP/JR targets and conditional branches:');
  for (const line of jumps) {
    console.log(`  ${line}`);
  }
  if (!jumps.length) {
    console.log('  none');
  }
  console.log('');
}

function printPipelineAnalysis(rows, probableEntry, swapPattern) {
  const entrySource = rows.find((row) => row.pc === 0x03030E);

  console.log('=== ANALYSIS ===');
  console.log(`Probable entry point: ${probableEntry !== null ? hex(probableEntry) : 'not found'}${probableEntry === 0x03030E ? ' (immediately after RET at 0x03030D)' : ''}`);
  console.log('');

  console.log('Key observations:');
  console.log('  1. The block starts at 0x03030E, not 0x030331. It enters after a hard RET at 0x03030D.');
  console.log('  2. 0x03030E begins with `sis ld hl,(0x000001)`, compares that 16-bit short-RAM word against 0xFFFF, 0xFFFE, and 0xFFFD, then falls through to the byte-swap logic at 0x03032C.');
  console.log('  3. The focus slice at 0x03032C reads two bytes from 0xD00001 and 0xD00002, not from kbdScanCode (0xD00587).');
  console.log('  4. `kbdKey` (0xD0058C) is used as the primary byte latch. `keyExtend` (0xD0058E) is used as the secondary / extension byte latch.');

  if (swapPattern) {
    console.log('  5. Nonzero second-byte path:');
    console.log(`     ${hex(swapPattern.startPc)} saves the second byte in B.`);
    console.log(`     ${hex(swapPattern.savePrimaryPc)} copies current kbdKey -> keyExtend.`);
    console.log(`     ${hex(swapPattern.replacePrimaryPc)} writes the second byte back to kbdKey.`);
    console.log(`     ${hex(swapPattern.reloadExtendPc)} reloads keyExtend into A before the tail-jump.`);
    console.log('  6. Zero second-byte path: 0x03034F stores 0 into keyExtend and leaves kbdKey holding the first byte.');
  } else {
    console.log('  5. The expected kbdKey/keyExtend swap pattern was not found.');
  }

  console.log(`  7. 0x030353 tail-jumps to ${hex(0x02FE73)} with A holding keyExtend (old primary byte) or 0.`);
  console.log('  8. Static inference: this looks like primary/extension-byte packaging, not raw-scan -> TI-BASIC key translation.');
  console.log('     If the second byte is nonzero, the pair becomes `kbdKey = second byte`, `keyExtend = first byte`.');
  console.log('     If the second byte is zero, the pair becomes `kbdKey = first byte`, `keyExtend = 0`.');
  console.log('  9. So 0xD0058E acts as an extension/original-byte buffer in this routine, not as a generic flag byte.');
  console.log('');

  if (entrySource) {
    console.log(`Entry line for context: ${hex(entrySource.pc)}  ${entrySource.text}`);
    console.log('');
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
const rawRows = disassembleWindow(rom);
const probableEntry = findProbableEntry(rawRows);
const swapPattern = findSwapPattern(rawRows);
const annotatedRows = annotateRows(rawRows, probableEntry, swapPattern);
const keyboardHits = collectKeyboardHits(annotatedRows);

console.log('Phase 385: static disassembly of 0x030300..0x030400 around 0x030331');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Mode: ${MODE}`);
console.log(`Assumed short-address MBASE for sis/lis refs: ${hex(SHORT_ADDR_MBASE, 2)}`);
console.log('');

printDisassembly(annotatedRows);
printKeyboardSummary(keyboardHits);
printControlFlowSummary(annotatedRows);
printPipelineAnalysis(annotatedRows, probableEntry, swapPattern);
