#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x00DE8B;
const SCAN_LIMIT = 0x200; // 512 bytes
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor base A'],
  [0xD13FDE, 'descriptor base B'],
  [0xD14017, 'master descriptor source'],
  [0xD1401A, 'selector-0 slab base'],
  [0xD1401D, 'selector-0 slab end/sentinel'],
  [0xD14020, 'selector-2 slab base'],
  [0xD13FED, 'connection table'],
  [0xD14014, 'live context pointer'],
  [0xD13FDB, 'descriptor companion A'],
  [0xD13FE1, 'descriptor companion B'],
  [0xD141E6, 'link mode nibble source'],
]);

const DESCRIPTOR_ADDRS = [
  0xD13FD8,
  0xD13FDE,
  0xD14017,
  0xD1401A,
  0xD1401D,
  0xD14020,
  0xD13FED,
  0xD14014,
  0xD13FDB,
  0xD13FE1,
  0xD141E6,
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= RAM_MIN && addr <= RAM_MAX;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstructionParts(inst) {
  switch (inst.tag) {
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister)})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${hex(inst.value)}` };
    case 'ld-pair-mem':
      return {
        mnemonic: 'LD',
        operands: inst.direction === 'to-mem'
          ? `(${hex(inst.addr)}),${upper(inst.pair)}`
          : `${upper(inst.pair)},(${hex(inst.addr)})`,
      };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.pair)}` };
    case 'ld-pair-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},(${upper(inst.src)})` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.src)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${hex(inst.value, 2)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${upper(inst.src)})` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.src)}` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(HL),${hex(inst.value, 2)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ind-pair':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.pair)}` };
    case 'ld-sp-pair':
      return { mnemonic: 'LD', operands: `SP,${upper(inst.pair)}` };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-ixd':
      return { mnemonic: 'INC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'DEC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL,${upper(inst.src)}` };
    case 'adc-pair':
      return { mnemonic: 'ADC', operands: `HL,${upper(inst.src)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hex(inst.value, 2) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return { mnemonic: 'LEA', operands: `${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}` };
    }
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)},(C)` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A,(${hex(inst.port, 2)})` };
    case 'out-reg':
      return { mnemonic: 'OUT', operands: `(C),${upper(inst.reg)}` };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hex(inst.port, 2)}),A` };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'rst':
      return { mnemonic: 'RST', operands: hex(inst.target, 2) };
    case 'ldir':
      return { mnemonic: 'LDIR', operands: '' };
    case 'ldi':
      return { mnemonic: 'LDI', operands: '' };
    case 'lddr':
      return { mnemonic: 'LDDR', operands: '' };
    case 'cpir':
      return { mnemonic: 'CPIR', operands: '' };
    case 'ei':
      return { mnemonic: 'EI', operands: '' };
    case 'di':
      return { mnemonic: 'DI', operands: '' };
    case 'halt':
      return { mnemonic: 'HALT', operands: '' };
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: JSON.stringify(inst) };
  }
}

function descriptorOffsetNote(displacement) {
  switch (displacement) {
    case 4:
      return 'descriptor status byte +4';
    case 5:
      return 'derived mode byte +5';
    case 7:
      return 'activation byte +7';
    case 11:
      return 'class/type byte +11';
    default:
      return null;
  }
}

function annotate(inst) {
  const notes = [];
  for (const addr of [inst.addr, inst.target, inst.value]) {
    if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
      notes.push(KNOWN_ADDRS.get(addr));
    }
  }
  if (inst.indexRegister && upper(inst.indexRegister) === 'IY') {
    const field = descriptorOffsetNote(inst.displacement);
    if (field) {
      notes.push(field);
    }
  }
  return notes.join('; ');
}

function rowFlags(inst) {
  const flags = [];

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    flags.push(`CALL->${hex(inst.target)}`);
  }

  if (inst.tag === 'in-reg' || inst.tag === 'in-imm') {
    flags.push('PORT-READ');
  }
  if (inst.tag === 'out-reg' || inst.tag === 'out-imm') {
    flags.push('PORT-WRITE');
  }

  if (inst.tag === 'ld-pair-mem' && isTrackedRam(inst.addr)) {
    flags.push(inst.direction === 'to-mem' ? `RAM-W ${hex(inst.addr)}` : `RAM-R ${hex(inst.addr)}`);
  }
  if (inst.tag === 'ld-mem-pair' && isTrackedRam(inst.addr)) {
    flags.push(`RAM-W ${hex(inst.addr)}`);
  }
  if (inst.tag === 'ld-reg-mem' && isTrackedRam(inst.addr)) {
    flags.push(`RAM-R ${hex(inst.addr)}`);
  }
  if (inst.tag === 'ld-mem-reg' && isTrackedRam(inst.addr)) {
    flags.push(`RAM-W ${hex(inst.addr)}`);
  }

  for (const addr of [inst.addr, inst.target, inst.value]) {
    if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
      flags.push(`KNOWN ${hex(addr)}`);
    }
  }

  return flags;
}

function scanFunction(start, maxBytes = SCAN_LIMIT) {
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    portIo: [],
    jumpTargets: [],
    knownRefs: [],
  };
  const pendingForwardTargets = new Set();

  let pc = start;
  while (pc < rom.length && pc < start + maxBytes) {
    const inst = safeDecode(pc);

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      summary.callSites.push({ pc, target: inst.target, conditional: inst.tag === 'call-conditional' });
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jp-conditional', kind: 'JP' });
    }

    if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jr-conditional', kind: 'JR' });
    }

    if (inst.tag === 'djnz') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: true, kind: 'DJNZ' });
    }

    if (inst.tag === 'ld-pair-mem' && isTrackedRam(inst.addr)) {
      if (inst.direction === 'to-mem') {
        summary.ramWrites.push({ pc, addr: inst.addr });
      } else {
        summary.ramReads.push({ pc, addr: inst.addr });
      }
    }
    if (inst.tag === 'ld-mem-pair' && isTrackedRam(inst.addr)) {
      summary.ramWrites.push({ pc, addr: inst.addr });
    }
    if (inst.tag === 'ld-reg-mem' && isTrackedRam(inst.addr)) {
      summary.ramReads.push({ pc, addr: inst.addr });
    }
    if (inst.tag === 'ld-mem-reg' && isTrackedRam(inst.addr)) {
      summary.ramWrites.push({ pc, addr: inst.addr });
    }

    if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
      summary.portIo.push({ pc, tag: inst.tag, port: inst.port ?? null });
    }

    for (const addr of [inst.addr, inst.target, inst.value]) {
      if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
        summary.knownRefs.push({ pc, addr });
      }
    }

    if (
      (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') &&
      typeof inst.target === 'number' &&
      inst.target > pc &&
      inst.target < start + maxBytes
    ) {
      pendingForwardTargets.add(inst.target);
    }

    for (const target of [...pendingForwardTargets]) {
      if (target <= pc) {
        pendingForwardTargets.delete(target);
      }
    }

    const { mnemonic, operands } = formatInstructionParts(inst);
    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
      annotation: annotate(inst),
      flags: rowFlags(inst),
      inst,
    });

    const noPendingTargets = ![...pendingForwardTargets].some((target) => target > pc);
    if (inst.tag === 'ret' && noPendingTargets) {
      return { rows, summary, end: pc, complete: true, terminator: 'RET' };
    }
    if ((inst.tag === 'jp' || inst.tag === 'jr' || inst.tag === 'jp-indirect') && noPendingTargets) {
      return { rows, summary, end: pc, complete: true, terminator: upper(inst.tag) };
    }

    pc = inst.nextPc;
  }

  return { rows, summary, end: pc - 1, complete: false, terminator: 'limit' };
}

function scanForAddressRefs(startAddr, endAddr, targetAddrs) {
  const refs = [];
  for (let pc = startAddr; pc < endAddr - 2; pc++) {
    const addr24 = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
    for (const targetAddr of targetAddrs) {
      if (addr24 === targetAddr) {
        for (let tryPc = Math.max(startAddr, pc - 4); tryPc <= pc; tryPc++) {
          const inst = safeDecode(tryPc);
          if (inst.nextPc > pc && inst.nextPc <= pc + 4) {
            const { mnemonic, operands } = formatInstructionParts(inst);
            refs.push({
              instrPc: tryPc,
              targetAddr,
              text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
              bytes: formatBytes(tryPc, inst.length),
            });
            break;
          }
        }
      }
    }
  }

  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.instrPc}:${ref.targetAddr}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const lines = [];
lines.push('Phase 428 - Trace 0x00DE8B: Post-Boot Descriptor Finalizer');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

lines.push('=== RAW BYTES AROUND TARGET ===');
for (let addr = TARGET - 0x20; addr < TARGET + 0x20; addr += 0x10) {
  lines.push(`${hex(addr)}: ${formatBytes(addr, 0x10)}`);
}

const decoded = scanFunction(TARGET, SCAN_LIMIT);

lines.push('');
lines.push('=== DISASSEMBLY FROM 0x00DE8B ===');
for (const row of decoded.rows) {
  const ann = row.annotation ? ` ; ${row.annotation}` : '';
  const flags = row.flags.length ? ` [${row.flags.join(' | ')}]` : '';
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text.padEnd(38, ' ')}${flags}${ann}`);
}
lines.push(`Span: ${hex(TARGET)}..${hex(decoded.end)} (${decoded.end - TARGET + 1} bytes, ${decoded.rows.length} instructions)`);
lines.push(`Complete: ${decoded.complete} (terminator: ${decoded.terminator})`);

lines.push('');
lines.push('=== CALL TARGETS ===');
if (decoded.summary.callSites.length === 0) {
  lines.push('- none');
} else {
  const callTargets = [...new Set(decoded.summary.callSites.map((site) => site.target))].sort((a, b) => a - b);
  for (const target of callTargets) {
    const sites = decoded.summary.callSites.filter((site) => site.target === target);
    const where = sites.map((site) => `${hex(site.pc)}${site.conditional ? ' (cond)' : ''}`).join(', ');
    lines.push(`- ${hex(target)} called from ${where}`);
  }
}

lines.push('');
lines.push('=== RAM READS ===');
if (decoded.summary.ramReads.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramReads) {
    const label = KNOWN_ADDRS.get(entry.addr) || '';
    lines.push(`- ${hex(entry.addr)} at ${hex(entry.pc)}${label ? ` (${label})` : ''}`);
  }
}

lines.push('');
lines.push('=== RAM WRITES ===');
if (decoded.summary.ramWrites.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramWrites) {
    const label = KNOWN_ADDRS.get(entry.addr) || '';
    lines.push(`- ${hex(entry.addr)} at ${hex(entry.pc)}${label ? ` (${label})` : ''}`);
  }
}

lines.push('');
lines.push('=== PORT I/O ===');
if (decoded.summary.portIo.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.portIo) {
    const kind = entry.tag.startsWith('in') ? 'read' : 'write';
    const port = entry.port == null ? '(C)' : hex(entry.port, 2);
    lines.push(`- ${kind} ${port} at ${hex(entry.pc)}`);
  }
}

lines.push('');
lines.push('=== KNOWN DESCRIPTOR-SUBSYSTEM CONNECTIONS ===');
const localRefs = scanForAddressRefs(TARGET, Math.min(rom.length, decoded.end + 0x10), DESCRIPTOR_ADDRS);
for (const addr of DESCRIPTOR_ADDRS) {
  const refs = localRefs.filter((ref) => ref.targetAddr === addr);
  const label = KNOWN_ADDRS.get(addr) || '';
  if (refs.length === 0) {
    lines.push(`- ${hex(addr)}${label ? ` (${label})` : ''}: no direct reference in 0x00DE8B`);
    continue;
  }
  const details = refs.map((ref) => `${hex(ref.instrPc)} ${ref.text}`).join(' | ');
  lines.push(`- ${hex(addr)}${label ? ` (${label})` : ''}: ${details}`);
}

lines.push('');
lines.push('=== BRANCHES ===');
if (decoded.summary.jumpTargets.length === 0) {
  lines.push('- none');
} else {
  for (const jump of decoded.summary.jumpTargets) {
    const cond = jump.conditional ? 'conditional' : 'unconditional';
    const dir = jump.target < jump.pc ? 'backward' : 'forward';
    lines.push(`- ${jump.kind} ${hex(jump.target)} (${cond}, ${dir}) from ${hex(jump.pc)}`);
  }
}

lines.push('');
lines.push('=== CALLERS OF 0x00DE8B ===');
const callerRefs = scanForAddressRefs(0x000000, rom.length, [TARGET]);
if (callerRefs.length === 0) {
  lines.push('- none found');
} else {
  for (const ref of callerRefs) {
    lines.push(`- ${hex(ref.instrPc)}: ${ref.bytes.padEnd(20, ' ')} ${ref.text}`);
  }
}

lines.push('');
lines.push('=== QUICK NOTES ===');
lines.push('- The function finalizes descriptor-root bytes at offsets +4, +5, +7, and +11 for two A-side roots and two B-side roots.');
lines.push('- D141E6 is read four times, shifted into the upper nibble via four ADD A steps, and bit 6 is forced only for the A-side root pair.');
lines.push('- Tail logic checks port 0x3015 bit 4; if clear it calls 0x00DA8C(1), then always calls 0x00DB66(1).');
lines.push('- No direct references to D14017, D1401A, D1401D, D14020, D13FED, or D14014 appear inside 0x00DE8B.');

console.log(lines.join('\n'));
