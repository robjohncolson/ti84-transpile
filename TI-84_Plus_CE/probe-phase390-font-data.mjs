#!/usr/bin/env node

/**
 * Phase 390
 *
 * Investigate the character renderer at 0x005A75 — specifically where its
 * font bitmap data comes from, what format it uses, and what glyph dimensions
 * are implied by the code.
 *
 * The probe:
 *   - BFS-disassembles from 0x005A75, following internal branches/jumps;
 *   - identifies IX/IY loads that may point to font data;
 *   - flags LD instructions referencing 0x3Bxxxx-0x3Fffff (flash) or
 *     0x000000-0x010000 (low ROM);
 *   - catalogs indexed memory reads like (IX+d), (IY+d), (HL), (DE), (BC);
 *   - looks for loop structures (DJNZ, DEC+JR NZ, etc.) iterating pixel rows;
 *   - looks for multiplication (MLT) or shift ops computing glyph offsets;
 *   - reports all CALL/JP targets, RAM reads/writes, and font-related findings;
 *   - scans ROM for direct CALL 0x005A75 sites;
 *   - searches nearby ROM for font bitmap data patterns (1bpp glyph tables).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';

const START = 0x005A75;
const MAX_DECODE_BYTES = 0x800;
const BFS_MAX_BRANCHES = 64;

const DIRECT_CALL_PATTERN = Buffer.from([0xCD, 0x75, 0x5A, 0x00]);

const KNOWN_LABELS = {
  0x005A75: 'charRenderer (this function)',
  0xD40000: 'VRAM base',
  0xD65800: 'VRAM end',
};

const RAM_NAMES = {
  0xD007E0: 'kbdKey / scancode buffer',
  0xD00080: 'flags',
  0xD40000: 'VRAM base',
  0xD65800: 'VRAM end',
};

const SIMPLE_OPS = {
  nop: 'NOP', halt: 'HALT', di: 'DI', ei: 'EI', ret: 'RET',
  reti: 'RETI', retn: 'RETN', exx: 'EXX',
  'ex-af': "EX AF,AF'", 'ex-de-hl': 'EX DE,HL',
  'ex-sp-hl': 'EX (SP),HL',
  cpl: 'CPL', neg: 'NEG', ccf: 'CCF', scf: 'SCF', daa: 'DAA',
  rla: 'RLA', rlca: 'RLCA', rra: 'RRA', rrca: 'RRCA',
  rrd: 'RRD', rld: 'RLD',
  ldi: 'LDI', ldir: 'LDIR', ldd: 'LDD', lddr: 'LDDR',
  cpi: 'CPI', cpir: 'CPIR', cpd: 'CPD', cpdr: 'CPDR',
  ini: 'INI', inir: 'INIR', ind: 'IND', indr: 'INDR',
  outi: 'OUTI', otir: 'OTIR', outd: 'OUTD', otdr: 'OTDR',
  slp: 'SLP',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function widthForValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return 4;
  if (modePrefix === 'sil' || modePrefix === 'lil') return 6;
  if (value <= 0xFF) return 2;
  if (value <= 0xFFFF) return 4;
  return 6;
}

function formatValue(value, modePrefix = null) {
  return hex(value, widthForValue(value, modePrefix));
}

function formatBytes(rom, pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    bytes.push((rom[pc + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function formatDisplacement(displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  const magnitude = displacement >= 0 ? displacement : -displacement;
  return `${sign}${hex(magnitude, magnitude <= 0xFF ? 2 : 4)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatDisplacement(displacement)})`;
}

function formatBitTarget(inst) {
  if (inst.indexRegister) return formatIndexed(inst.indexRegister, inst.displacement);
  if (inst.indirectRegister) return `(${String(inst.indirectRegister).toUpperCase()})`;
  return String(inst.reg ?? '?').toUpperCase();
}

function formatAlu(op, operand) {
  const upper = String(op ?? '?').toUpperCase();
  if (upper === 'ADD' || upper === 'ADC' || upper === 'SBC') return `${upper} A,${operand}`;
  return `${upper} ${operand}`;
}

function formatInstruction(inst) {
  if (!inst?.tag) return '???';
  if (SIMPLE_OPS[inst.tag]) return SIMPLE_OPS[inst.tag];

  switch (inst.tag) {
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()},${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-ind-imm': return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-reg-mem': case 'ld-a-mem':
      return `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg': case 'ld-mem-a':
      return `LD (${hex(inst.addr ?? inst.address)}),${String(inst.src ?? 'a').toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'ld-sp-pair': return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-idx': case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-idx-reg': case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-idx-imm': case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg': return formatAlu(inst.op, String(inst.src).toUpperCase());
    case 'alu-imm': case 'alu-immediate': return formatAlu(inst.op, hex(inst.value, 2));
    case 'alu-ind': return formatAlu(inst.op, '(HL)');
    case 'alu-idx': case 'alu-ixd':
      return formatAlu(inst.op, formatIndexed(inst.indexRegister, inst.displacement));
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ind': return 'INC (HL)';
    case 'dec-ind': return 'DEC (HL)';
    case 'inc-ixd': return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `ADD ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `ADC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': case 'jp-cond': return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.reg ?? inst.indirectRegister ?? 'hl').toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': case 'jr-cond': return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': case 'call-cond':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret-conditional': case 'ret-cond': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'rst': return `RST ${hex(inst.vector ?? inst.target, 2)}`;
    case 'in-reg': return `IN ${String(inst.reg ?? inst.dest).toUpperCase()},(C)`;
    case 'in-a-imm': return `IN A,(${hex(inst.port, 2)})`;
    case 'in0': return `IN0 ${String(inst.reg ?? inst.dest).toUpperCase()},(${hex(inst.port, 2)})`;
    case 'out-reg': return `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'out-a-imm': return `OUT (${hex(inst.port, 2)}),A`;
    case 'out0': return `OUT0 (${hex(inst.port, 2)}),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'rotate-reg': return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${String(inst.op).toUpperCase()} (HL)`;
    case 'bit-test': return `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res': case 'bit-reset': return `RES ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-res-ind': case 'bit-reset-ind': return `RES ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-rotate': return `${String(inst.operation ?? inst.op).toUpperCase()} ${formatBitTarget(inst)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},${formatBitTarget(inst)}`;
    case 'indexed-cb-set': return `SET ${inst.bit},${formatBitTarget(inst)}`;
    case 'indexed-cb-res': return `RES ${inst.bit},${formatBitTarget(inst)}`;
    case 'im': return `IM ${inst.mode !== undefined ? inst.mode : inst.interruptMode}`;
    case 'mlt': return `MLT ${String(inst.pair ?? inst.reg).toUpperCase()}`;
    case 'lea': return `LEA ${String(inst.dest).toUpperCase()},${String(inst.base).toUpperCase()}${formatDisplacement(inst.displacement)}`;
    case 'pea': return `PEA ${String(inst.base ?? inst.src).toUpperCase()}${formatDisplacement(inst.displacement)}`;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
      const fields = Object.entries(inst)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`)
        .join(', ');
      return `${inst.tag.toUpperCase()} [${fields}]`;
    }
  }
}

function splitInstruction(text) {
  const firstSpace = text.indexOf(' ');
  if (firstSpace === -1) return { mnemonic: text, operands: '' };
  return { mnemonic: text.slice(0, firstSpace), operands: text.slice(firstSpace + 1) };
}

function safeDecode(rom, pc) {
  try { return decodeInstruction(rom, pc, MODE); } catch { return null; }
}

function isHardTerminator(inst) {
  if (!inst) return false;
  return inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-indirect';
}

function isJumpLike(inst) {
  return inst?.tag === 'jp' || inst?.tag === 'jp-conditional' || inst?.tag === 'jp-cond'
    || inst?.tag === 'jr' || inst?.tag === 'jr-conditional' || inst?.tag === 'jr-cond'
    || inst?.tag === 'djnz';
}

function isCallLike(inst) {
  return inst?.tag === 'call' || inst?.tag === 'call-conditional' || inst?.tag === 'call-cond';
}

function isReturn(inst) {
  return inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn'
    || inst?.tag === 'ret-conditional' || inst?.tag === 'ret-cond';
}

function isPortIo(inst) {
  return inst?.tag === 'in-reg' || inst?.tag === 'in-a-imm'
    || inst?.tag === 'out-reg' || inst?.tag === 'out-a-imm'
    || inst?.tag === 'in0' || inst?.tag === 'out0';
}

function getControlTarget(inst) {
  return inst?.target ?? undefined;
}

function getAbsoluteAddress(inst) {
  return inst?.addr ?? inst?.address ?? undefined;
}

// ─── BFS disassembly ────────────────────────────────────────────────────────

function bfsDisassemble(rom, start) {
  const decoded = new Map(); // pc -> { pc, inst, length, nextPc, bytes }
  const queue = [start];
  const visited = new Set();
  let branchCount = 0;

  while (queue.length > 0 && branchCount < BFS_MAX_BRANCHES) {
    const entry = queue.shift();
    if (visited.has(entry)) continue;
    visited.add(entry);
    branchCount++;

    let pc = entry;
    const limit = Math.min(rom.length, start + MAX_DECODE_BYTES);

    while (pc < limit) {
      if (decoded.has(pc)) break;

      const inst = safeDecode(rom, pc);
      const length = Math.max(1, inst?.length ?? 1);
      decoded.set(pc, {
        pc,
        inst,
        length,
        nextPc: inst?.nextPc ?? (pc + length),
        bytes: formatBytes(rom, pc, length),
      });

      // Collect branch targets
      const target = getControlTarget(inst);
      if (target !== undefined && target >= start && target < start + MAX_DECODE_BYTES) {
        if (!visited.has(target)) queue.push(target);
      }

      // Conditional branches: also follow fall-through
      if (inst?.tag === 'jp-conditional' || inst?.tag === 'jp-cond'
        || inst?.tag === 'jr-conditional' || inst?.tag === 'jr-cond'
        || inst?.tag === 'djnz'
        || inst?.tag === 'call-conditional' || inst?.tag === 'call-cond'
        || inst?.tag === 'call'
        || inst?.tag === 'ret-conditional' || inst?.tag === 'ret-cond') {
        pc += length;
        continue;
      }

      if (isHardTerminator(inst)) break;
      pc += length;
    }
  }

  // Sort by address
  return [...decoded.values()].sort((a, b) => a.pc - b.pc);
}

// ─── Memory-ref extraction ────────────────────────────────────────────────

function extractMemoryRefs(inst) {
  if (!inst) return [];
  const refs = [];

  switch (inst.tag) {
    case 'ld-reg-mem': case 'ld-a-mem':
      refs.push({ direction: 'read', kind: 'absolute', address: inst.addr ?? inst.address });
      break;
    case 'ld-mem-reg': case 'ld-mem-a': case 'ld-mem-pair':
      refs.push({ direction: 'write', kind: 'absolute', address: inst.addr ?? inst.address });
      break;
    case 'ld-pair-mem':
      refs.push({ direction: inst.direction === 'to-mem' ? 'write' : 'read', kind: 'absolute', address: inst.addr });
      break;
    case 'ld-reg-ind':
      refs.push({ direction: 'read', kind: 'register-indirect', register: inst.src });
      break;
    case 'ld-ind-reg':
      refs.push({ direction: 'write', kind: 'register-indirect', register: inst.dest });
      break;
    case 'ld-ind-imm':
      refs.push({ direction: 'write', kind: 'register-indirect', register: 'hl' });
      break;
    case 'alu-ind': case 'bit-test-ind': case 'rotate-ind':
      refs.push({ direction: 'read', kind: 'register-indirect', register: inst.indirectRegister ?? 'hl' });
      break;
    case 'bit-set-ind': case 'bit-res-ind': case 'inc-ind': case 'dec-ind':
      refs.push({ direction: 'read/write', kind: 'register-indirect', register: inst.indirectRegister ?? 'hl' });
      break;
    case 'ld-reg-idx': case 'ld-reg-ixd':
      refs.push({ direction: 'read', kind: 'indexed', indexRegister: inst.indexRegister, displacement: inst.displacement });
      break;
    case 'ld-idx-reg': case 'ld-ixd-reg': case 'ld-idx-imm': case 'ld-ixd-imm':
      refs.push({ direction: 'write', kind: 'indexed', indexRegister: inst.indexRegister, displacement: inst.displacement });
      break;
    case 'alu-idx': case 'alu-ixd': case 'indexed-cb-bit':
      refs.push({ direction: 'read', kind: 'indexed', indexRegister: inst.indexRegister, displacement: inst.displacement });
      break;
    case 'inc-ixd': case 'dec-ixd': case 'indexed-cb-set': case 'indexed-cb-res': case 'indexed-cb-rotate':
      refs.push({ direction: 'read/write', kind: 'indexed', indexRegister: inst.indexRegister, displacement: inst.displacement });
      break;
    default: break;
  }
  return refs;
}

function formatMemoryTarget(ref) {
  if (ref.kind === 'absolute') {
    const label = RAM_NAMES[ref.address] ?? KNOWN_LABELS[ref.address];
    return `${hex(ref.address)}${label ? ` (${label})` : ''}`;
  }
  if (ref.kind === 'register-indirect') return `(${String(ref.register).toUpperCase()})`;
  if (ref.kind === 'indexed') return formatIndexed(ref.indexRegister, ref.displacement);
  return '(?)';
}

// ─── Font-specific annotations ──────────────────────────────────────────────

function isFontDataAddress(addr) {
  if (addr === undefined) return false;
  // Flash font data region (0x3Bxxxx-0x3Fffff)
  if (addr >= 0x3B0000 && addr <= 0x3FFFFF) return 'flash-font-region';
  // Low ROM (0x000000-0x010000) — could hold small font tables
  if (addr >= 0x000000 && addr <= 0x010000) return 'low-ROM';
  // Known font table addresses from TI-84 CE SDK documentation
  if (addr >= 0x3C0000 && addr <= 0x3C2000) return 'likely-font-bitmap-area';
  return false;
}

function buildAnnotations(row) {
  const notes = [];
  const inst = row.inst;
  if (!inst) return notes;

  if (row.pc === START) notes.push('ENTRY');
  if (isHardTerminator(inst)) notes.push('TERM');

  const controlTarget = getControlTarget(inst);
  if (controlTarget !== undefined) {
    const location = controlTarget >= START && controlTarget < START + MAX_DECODE_BYTES ? 'int' : 'ext';
    const label = KNOWN_LABELS[controlTarget];
    notes.push(`${location} ${hex(controlTarget)}${label ? ` (${label})` : ''}`);
  }

  // IX/IY loads — potential font data pointers
  if (inst.tag === 'ld-pair-imm' && (String(inst.pair).toLowerCase() === 'ix' || String(inst.pair).toLowerCase() === 'iy')) {
    notes.push(`*** ${String(inst.pair).toUpperCase()} loaded with ${hex(inst.value)} ***`);
    const fontRegion = isFontDataAddress(inst.value);
    if (fontRegion) notes.push(`*** FONT DATA? (${fontRegion}) ***`);
  }

  // Any pair load to a font-like address
  if (inst.tag === 'ld-pair-imm') {
    const fontRegion = isFontDataAddress(inst.value);
    if (fontRegion) notes.push(`*** potential font ptr (${fontRegion}) ***`);
  }

  // Absolute memory refs in font data regions
  const absAddr = getAbsoluteAddress(inst);
  if (absAddr !== undefined) {
    const fontRegion = isFontDataAddress(absAddr);
    if (fontRegion) notes.push(`*** font-region access (${fontRegion}) ***`);
    const label = RAM_NAMES[absAddr];
    if (label) notes.push(label);
  }

  // Indexed memory access
  for (const ref of extractMemoryRefs(inst)) {
    if (ref.kind === 'indexed') {
      notes.push(`${ref.direction} ${formatIndexed(ref.indexRegister, ref.displacement)}`);
    } else if (ref.kind === 'register-indirect') {
      notes.push(`${ref.direction} (${String(ref.register).toUpperCase()})`);
    } else if (ref.kind === 'absolute') {
      notes.push(`${ref.direction} ${hex(ref.address)}`);
    }
  }

  // MLT = multiply (glyph offset computation)
  if (inst.tag === 'mlt') notes.push('*** MULTIPLY (glyph offset?) ***');

  // Shift/rotate ops — bit manipulation for 1bpp rendering
  if (inst.tag === 'rotate-reg' || inst.tag === 'rotate-ind' || inst.tag === 'indexed-cb-rotate') {
    notes.push('shift/rotate (bitmap rendering?)');
  }

  // DJNZ = tight loop (pixel row iteration?)
  if (inst.tag === 'djnz') notes.push('*** LOOP (pixel rows?) ***');

  // LDIR/LDDR = block copy (could be glyph blit)
  if (inst.tag === 'ldir' || inst.tag === 'lddr') notes.push('*** BLOCK COPY ***');

  // Port I/O
  if (isPortIo(inst)) notes.push('port I/O');

  return notes;
}

// ─── Printing ─────────────────────────────────────────────────────────────

function printDisassembly(label, rows) {
  if (rows.length === 0) return;
  const first = rows[0].pc;
  const last = rows.at(-1)?.nextPc ?? first;
  console.log('='.repeat(120));
  console.log(`${label}: ${hex(first)}..${hex(last - 1)} (${last - first} bytes, ${rows.length} instructions)`);
  console.log('='.repeat(120));
  for (const row of rows) {
    if (!row.inst) {
      console.log(`${hex(row.pc)}  ${row.bytes.padEnd(24)}  DB     ${hex(0, 2)}`);
      continue;
    }
    const rendered = formatInstruction(row.inst);
    const { mnemonic, operands } = splitInstruction(rendered);
    const annotations = buildAnnotations(row);
    const suffix = annotations.length ? `  ; ${annotations.join(' | ')}` : '';
    console.log(
      `${hex(row.pc)}  ${row.bytes.padEnd(24)}  ${mnemonic.padEnd(6)} ${operands.padEnd(38)}${suffix}`,
    );
  }
  console.log('');
}

function printTargetSummary(rows) {
  const targets = new Map();
  for (const row of rows) {
    const target = getControlTarget(row.inst);
    if (target === undefined) continue;
    const kind = isCallLike(row.inst) ? 'CALL' : isJumpLike(row.inst) ? 'JUMP' : 'BRANCH';
    const list = targets.get(target) ?? [];
    list.push({ pc: row.pc, kind, text: formatInstruction(row.inst) });
    targets.set(target, list);
  }

  console.log('--- CALL/JP/JR targets ---');
  if (targets.size === 0) { console.log('  (none)\n'); return; }
  for (const [target, inbound] of [...targets.entries()].sort((a, b) => a[0] - b[0])) {
    const location = target >= START && target < START + MAX_DECODE_BYTES ? 'internal' : 'external';
    const label = KNOWN_LABELS[target];
    console.log(`  ${hex(target)}  ${location}${label ? `  ${label}` : ''}`);
    for (const source of inbound) {
      console.log(`    <- ${hex(source.pc)}  ${source.kind}  ${source.text}`);
    }
  }
  console.log('');
}

function printMemorySummary(rows) {
  const refs = [];
  for (const row of rows) {
    for (const ref of extractMemoryRefs(row.inst)) {
      refs.push({ pc: row.pc, ...ref, text: formatInstruction(row.inst) });
    }
  }
  console.log('--- Memory reads/writes ---');
  if (refs.length === 0) { console.log('  (none)\n'); return; }
  for (const ref of refs) {
    const target = formatMemoryTarget(ref);
    console.log(`  ${hex(ref.pc)}  ${ref.direction.padEnd(10)} ${target.padEnd(34)}  ${ref.text}`);
  }
  console.log('');
}

function printIXIYSummary(rows) {
  const ixRefs = [];
  const iyRefs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    const ir = row.inst.indexRegister ? String(row.inst.indexRegister).toLowerCase() : null;
    if (ir === 'ix') ixRefs.push({ pc: row.pc, displacement: row.inst.displacement, text: formatInstruction(row.inst) });
    if (ir === 'iy') iyRefs.push({ pc: row.pc, displacement: row.inst.displacement, text: formatInstruction(row.inst) });
    // Also catch LD IX,nn / LD IY,nn
    if (row.inst.tag === 'ld-pair-imm') {
      const p = String(row.inst.pair).toLowerCase();
      if (p === 'ix') ixRefs.push({ pc: row.pc, displacement: null, text: formatInstruction(row.inst), load: row.inst.value });
      if (p === 'iy') iyRefs.push({ pc: row.pc, displacement: null, text: formatInstruction(row.inst), load: row.inst.value });
    }
  }

  console.log('--- IX references (potential font data pointer) ---');
  if (ixRefs.length === 0) { console.log('  (none)\n'); } else {
    for (const ref of ixRefs) {
      const extra = ref.load !== undefined ? `  *** LOADS IX = ${hex(ref.load)} ***` : '';
      console.log(`  ${hex(ref.pc)}  disp=${ref.displacement ?? 'n/a'}  ${ref.text}${extra}`);
    }
    console.log('');
  }

  console.log('--- IY references ---');
  if (iyRefs.length === 0) { console.log('  (none)\n'); } else {
    for (const ref of iyRefs) {
      const extra = ref.load !== undefined ? `  *** LOADS IY = ${hex(ref.load)} ***` : '';
      console.log(`  ${hex(ref.pc)}  disp=${ref.displacement ?? 'n/a'}  ${ref.text}${extra}`);
    }
    console.log('');
  }
}

function printLoopSummary(rows) {
  const loops = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.tag === 'djnz') {
      loops.push({ pc: row.pc, target: row.inst.target, text: formatInstruction(row.inst), kind: 'DJNZ' });
    }
    // DEC reg followed by JR NZ
    if (row.inst.tag === 'dec-reg') {
      // Find next instruction
      const nextRow = rows.find(r => r.pc === row.nextPc);
      if (nextRow?.inst && (nextRow.inst.tag === 'jr-conditional' || nextRow.inst.tag === 'jr-cond')
        && String(nextRow.inst.condition).toLowerCase() === 'nz') {
        loops.push({ pc: row.pc, target: nextRow.inst.target, text: `${formatInstruction(row.inst)} + ${formatInstruction(nextRow.inst)}`, kind: 'DEC+JR NZ' });
      }
    }
  }

  console.log('--- Loop structures (pixel row iteration candidates) ---');
  if (loops.length === 0) { console.log('  (none)\n'); return; }
  for (const loop of loops) {
    const bodySize = loop.pc - loop.target;
    console.log(`  ${hex(loop.pc)}  ${loop.kind}  target=${hex(loop.target)}  body~${bodySize} bytes  ${loop.text}`);
  }
  console.log('');
}

function printShiftSummary(rows) {
  const shifts = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.tag === 'rotate-reg' || row.inst.tag === 'rotate-ind' || row.inst.tag === 'indexed-cb-rotate') {
      shifts.push({ pc: row.pc, text: formatInstruction(row.inst) });
    }
    if (row.inst.tag === 'mlt') {
      shifts.push({ pc: row.pc, text: formatInstruction(row.inst), isMlt: true });
    }
  }

  console.log('--- Shift/rotate/multiply ops (glyph offset + bitmap rendering) ---');
  if (shifts.length === 0) { console.log('  (none)\n'); return; }
  for (const s of shifts) {
    const label = s.isMlt ? '  *** MULTIPLY ***' : '';
    console.log(`  ${hex(s.pc)}  ${s.text}${label}`);
  }
  console.log('');
}

function printPairImmLoads(rows) {
  const loads = [];
  for (const row of rows) {
    if (!row.inst || row.inst.tag !== 'ld-pair-imm') continue;
    loads.push({ pc: row.pc, pair: String(row.inst.pair).toUpperCase(), value: row.inst.value, text: formatInstruction(row.inst) });
  }

  console.log('--- All register-pair immediate loads (font pointer candidates) ---');
  if (loads.length === 0) { console.log('  (none)\n'); return; }
  for (const l of loads) {
    const fontRegion = isFontDataAddress(l.value);
    const label = fontRegion ? `  *** ${fontRegion} ***` : '';
    console.log(`  ${hex(l.pc)}  ${l.pair} = ${hex(l.value)}${label}  ${l.text}`);
  }
  console.log('');
}

function findDirectCallers(rom, pattern) {
  const hits = [];
  let offset = 0;
  while (offset <= rom.length - pattern.length) {
    const hit = rom.indexOf(pattern, offset);
    if (hit === -1) break;
    hits.push(hit);
    offset = hit + 1;
  }
  return hits;
}

function printCallerSummary(rom, hits) {
  console.log(`--- Direct CALL 0x005A75 sites (CD 75 5A 00) — ${hits.length} found ---`);
  if (hits.length === 0) { console.log('  (none)\n'); return; }
  for (const hit of hits) {
    const inst = safeDecode(rom, hit);
    console.log(`  ${hex(hit)}  ${formatInstruction(inst)}`);
  }
  console.log('');
}

// ─── Font bitmap search in ROM ──────────────────────────────────────────────

function searchFontBitmaps(rom) {
  console.log('--- Font bitmap search ---');
  console.log('');

  // The TI-84 CE uses several known font regions. Let's check common ones:
  // 1. Small font (5x7 or 6x8) typically at lower ROM addresses
  // 2. Large font (7x12 or similar) typically in flash

  // Look for known TI-OS font table pointer patterns
  // The OS stores font pointers in a structure. Common approach:
  // Read around 0x005A75 for any 3-byte address loads

  // Scan a wider area around the character renderer for 24-bit pointers
  // that point into plausible font data regions
  const fontCandidates = [];

  // Check all 24-bit values loaded by instructions near 0x005A75
  for (let pc = 0x005A00; pc < 0x005F00; pc++) {
    const inst = safeDecode(rom, pc);
    if (!inst) continue;

    // LD pair, imm24
    if (inst.tag === 'ld-pair-imm' && inst.value >= 0x3B0000 && inst.value <= 0x3FFFFF) {
      fontCandidates.push({ pc, pair: inst.pair, addr: inst.value, source: 'ld-pair-imm' });
    }
    // LD pair, imm24 in low ROM
    if (inst.tag === 'ld-pair-imm' && inst.value >= 0x000100 && inst.value <= 0x010000) {
      fontCandidates.push({ pc, pair: inst.pair, addr: inst.value, source: 'ld-pair-imm (low ROM)' });
    }
    // Absolute memory reads from font regions
    const absAddr = getAbsoluteAddress(inst);
    if (absAddr !== undefined && absAddr >= 0x3B0000 && absAddr <= 0x3FFFFF) {
      fontCandidates.push({ pc, addr: absAddr, source: 'abs-mem-ref' });
    }
  }

  if (fontCandidates.length > 0) {
    console.log('  Pointer candidates in/near char renderer:');
    for (const c of fontCandidates) {
      const pairStr = c.pair ? ` ${String(c.pair).toUpperCase()} =` : '';
      console.log(`    ${hex(c.pc)} ${pairStr} ${hex(c.addr)}  (${c.source})`);

      // Dump first 32 bytes at that address to see if it looks like font data
      if (c.addr < rom.length - 32) {
        const sample = formatBytes(rom, c.addr, 32);
        console.log(`      data @ ${hex(c.addr)}: ${sample}`);

        // Check if it looks like 1bpp bitmap (byte patterns with few set bits per row)
        const byteVals = [];
        for (let i = 0; i < 32; i++) byteVals.push(rom[c.addr + i]);
        const popCounts = byteVals.map(b => {
          let n = 0; let v = b;
          while (v) { n += v & 1; v >>= 1; }
          return n;
        });
        const avgPop = popCounts.reduce((a, b) => a + b, 0) / popCounts.length;
        console.log(`      avg popcount per byte: ${avgPop.toFixed(1)} (low = sparse bitmap, high = dense/data)`);
      }
    }
    console.log('');
  } else {
    console.log('  No direct font pointer candidates found in the immediate vicinity.');
    console.log('');
  }

  // Also check known TI-84 CE font data addresses from community docs
  const knownFontAddresses = [
    { addr: 0x3C0000, label: 'potential large font (flash 0x3C0000)' },
    { addr: 0x3C4000, label: 'potential small font (flash 0x3C4000)' },
    { addr: 0x0055E0, label: 'low ROM near char renderer' },
    { addr: 0x005600, label: 'low ROM after char renderer area' },
    { addr: 0x004300, label: 'low ROM glyph area guess' },
  ];

  console.log('  Checking known/suspected font data addresses:');
  for (const { addr, label } of knownFontAddresses) {
    if (addr >= rom.length - 64) { console.log(`    ${hex(addr)} — out of ROM range`); continue; }

    // Show first 64 bytes
    const sample1 = formatBytes(rom, addr, 16);
    const sample2 = formatBytes(rom, addr + 16, 16);

    // Check for typical font-like patterns:
    // Space char (0x20) in a font table is usually all zeros
    // Letters have structured bit patterns
    const first16 = [];
    for (let i = 0; i < 16; i++) first16.push(rom[addr + i]);
    const allZero = first16.every(b => b === 0);
    const allFF = first16.every(b => b === 0xFF);

    console.log(`    ${hex(addr)} ${label}`);
    console.log(`      ${sample1}`);
    console.log(`      ${sample2}`);
    if (allZero) console.log('      (all zeros — could be space glyph or empty area)');
    if (allFF) console.log('      (all 0xFF — erased flash)');
  }
  console.log('');

  // Search for a font table header pattern: look for sequences where
  // every Nth byte changes slowly (glyph bitmaps are structured)
  // Try common glyph sizes: 7 bytes (5x7), 8 bytes (6x8), 12 bytes (7x12)
  console.log('  Searching for font-like repeating structures in ROM...');
  const glyphSizes = [7, 8, 10, 12, 14, 16];
  for (const gs of glyphSizes) {
    // Check a few ROM regions for structured repetition with period gs
    const regions = [
      { start: 0x3C0000, end: Math.min(0x3C1000, rom.length), label: 'flash 0x3C0000' },
      { start: 0x3B0000, end: Math.min(0x3B1000, rom.length), label: 'flash 0x3B0000' },
      { start: 0x004000, end: Math.min(0x006000, rom.length), label: 'low ROM 0x004000' },
      { start: 0x000100, end: Math.min(0x002000, rom.length), label: 'low ROM 0x000100' },
    ];

    for (const region of regions) {
      if (region.start >= rom.length) continue;
      // Check if bytes at offset 0, gs, 2*gs, 3*gs... for 32 glyphs
      // form a "font-like" pattern: first glyph (space=0x20 offset) should be zeros
      const spaceOffset = region.start + 0x20 * gs; // space char
      if (spaceOffset + gs > region.end || spaceOffset + gs > rom.length) continue;

      let spaceIsZero = true;
      for (let i = 0; i < gs; i++) {
        if (rom[spaceOffset + i] !== 0) { spaceIsZero = false; break; }
      }

      if (spaceIsZero) {
        // Check 'A' (0x41) — should have some nonzero bytes
        const aOffset = region.start + 0x41 * gs;
        if (aOffset + gs <= rom.length) {
          let aNonZero = 0;
          for (let i = 0; i < gs; i++) {
            if (rom[aOffset + i] !== 0) aNonZero++;
          }
          if (aNonZero >= 3) {
            console.log(`    *** CANDIDATE: glyph_size=${gs}, region=${region.label}, base=${hex(region.start)} ***`);
            console.log(`      space (0x20) @ ${hex(spaceOffset)}: ${formatBytes(rom, spaceOffset, gs)} (all zero = YES)`);
            console.log(`      'A'   (0x41) @ ${hex(aOffset)}: ${formatBytes(rom, aOffset, gs)} (${aNonZero}/${gs} nonzero)`);

            // Show a few more characters
            for (const ch of [0x30, 0x42, 0x61]) { // '0', 'B', 'a'
              const offset = region.start + ch * gs;
              if (offset + gs <= rom.length) {
                console.log(`      '${String.fromCharCode(ch)}'   (${hex(ch, 2)}) @ ${hex(offset)}: ${formatBytes(rom, offset, gs)}`);
              }
            }
          }
        }
      }
    }
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 390 — 0x005A75 character renderer: font data investigation');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log(`BFS start: ${hex(START)}, max decode: ${MAX_DECODE_BYTES} bytes`);
  console.log('');

  // BFS disassemble from 0x005A75
  const rows = bfsDisassemble(rom, START);
  const coveredEnd = rows.at(-1)?.nextPc ?? START;
  console.log(`BFS decoded: ${hex(START)}..${hex(coveredEnd - 1)} (${rows.length} instructions across ${coveredEnd - START} byte range)`);
  console.log('');

  // Print full disassembly
  printDisassembly('Character renderer at 0x005A75 (BFS)', rows);

  // Summaries
  printTargetSummary(rows);
  printMemorySummary(rows);
  printIXIYSummary(rows);
  printLoopSummary(rows);
  printShiftSummary(rows);
  printPairImmLoads(rows);

  // Caller search
  const callerHits = findDirectCallers(rom, DIRECT_CALL_PATTERN);
  printCallerSummary(rom, callerHits);

  // Font bitmap search
  searchFontBitmaps(rom);

  // ─── Conclusion ─────────────────────────────────────────────────────────
  console.log('='.repeat(120));
  console.log('ANALYSIS');
  console.log('='.repeat(120));
  console.log('');

  // Gather key findings
  const ixLoads = rows.filter(r => r.inst?.tag === 'ld-pair-imm' && String(r.inst.pair).toLowerCase() === 'ix');
  const iyLoads = rows.filter(r => r.inst?.tag === 'ld-pair-imm' && String(r.inst.pair).toLowerCase() === 'iy');
  const mltOps = rows.filter(r => r.inst?.tag === 'mlt');
  const djnzOps = rows.filter(r => r.inst?.tag === 'djnz');
  const shiftOps = rows.filter(r => r.inst?.tag === 'rotate-reg' || r.inst?.tag === 'rotate-ind');
  const ldirOps = rows.filter(r => r.inst?.tag === 'ldir' || r.inst?.tag === 'lddr');

  const externalCalls = [];
  for (const row of rows) {
    const target = getControlTarget(row.inst);
    if (target !== undefined && (target < START || target >= START + MAX_DECODE_BYTES)) {
      if (isCallLike(row.inst)) externalCalls.push({ pc: row.pc, target });
    }
  }

  console.log(`  Instructions decoded: ${rows.length}`);
  console.log(`  Direct callers of 0x005A75: ${callerHits.length}`);
  console.log(`  External CALLs from this function: ${externalCalls.length}`);
  for (const ec of externalCalls) {
    console.log(`    ${hex(ec.pc)} -> ${hex(ec.target)}`);
  }
  console.log(`  IX loads: ${ixLoads.length}`);
  for (const r of ixLoads) console.log(`    ${hex(r.pc)} IX = ${hex(r.inst.value)}`);
  console.log(`  IY loads: ${iyLoads.length}`);
  for (const r of iyLoads) console.log(`    ${hex(r.pc)} IY = ${hex(r.inst.value)}`);
  console.log(`  MLT (multiply) ops: ${mltOps.length}`);
  for (const r of mltOps) console.log(`    ${hex(r.pc)} ${formatInstruction(r.inst)}`);
  console.log(`  DJNZ loops: ${djnzOps.length}`);
  for (const r of djnzOps) console.log(`    ${hex(r.pc)} target=${hex(r.inst.target)}`);
  console.log(`  Shift/rotate ops: ${shiftOps.length}`);
  console.log(`  LDIR/LDDR block ops: ${ldirOps.length}`);
  console.log('');

  // Font data pointer conclusion
  const allPairLoads = rows.filter(r => r.inst?.tag === 'ld-pair-imm');
  const fontPtrCandidates = allPairLoads.filter(r => {
    const v = r.inst.value;
    return (v >= 0x3B0000 && v <= 0x3FFFFF) || (v >= 0x000100 && v <= 0x010000);
  });

  if (fontPtrCandidates.length > 0) {
    console.log('  FONT DATA POINTERS FOUND:');
    for (const r of fontPtrCandidates) {
      console.log(`    ${hex(r.pc)}  ${String(r.inst.pair).toUpperCase()} = ${hex(r.inst.value)}  ${formatInstruction(r.inst)}`);
    }
  } else {
    console.log('  No obvious font data pointers found in immediate loads.');
    console.log('  Font data address may be passed in a register by the caller,');
    console.log('  or loaded via an indirect table lookup.');
  }
  console.log('');

  // Glyph dimensions guess
  if (djnzOps.length > 0) {
    console.log('  GLYPH DIMENSION CLUES:');
    // Look for LD B,n before DJNZ — B is the loop counter
    for (const djnz of djnzOps) {
      // Search backward for LD B,n
      const candidates = rows.filter(r => r.pc < djnz.pc && r.pc >= djnz.pc - 30
        && r.inst?.tag === 'ld-reg-imm' && String(r.inst.dest).toLowerCase() === 'b');
      for (const c of candidates) {
        console.log(`    LD B,${hex(c.inst.value, 2)} at ${hex(c.pc)} -> DJNZ at ${hex(djnz.pc)}: loop count = ${c.inst.value} (height?)`);
      }
    }
  }
  console.log('');
}

main();
