#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x00CC71;
const FUNC_END = 0x00CD7A; // 266 bytes
const SCAN_LIMIT = FUNC_END - TARGET + 0x20; // scan slightly past expected end
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

// Known addresses of interest
const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor base A'],
  [0xD13FDB, 'descriptor base B'],
  [0xD13FDE, 'descriptor base C'],
  [0xD13FE1, 'descriptor base D'],
  [0xD13FE4, 'conn struct +0'],
  [0xD13FED, 'connection table'],
  [0xD14014, 'connection state flag'],
  [0xD14017, 'master descriptor source'],
  [0xD1401A, 'slab pool A'],
  [0xD1401D, 'slab pool B'],
  [0xD14020, 'slab pool C'],
  [0xD14420, 'fixed RAM (BC source)'],
  // Known call targets
  [0x00CAF4, 'layout helper (135 bytes)'],
  [0x00E2EB, 'descriptor bootstrap (509 bytes)'],
  [0x00285F, '_bzero (43 bytes, LDIR)'],
  [0x002553, '_lshru (34 bytes)'],
]);

// Known callers and their params
const CALLERS = [
  { addr: 0x008A52, params: '0/2/0x7D0 (2000)' },
  { addr: 0x008EB5, params: '0/1/0x12C (300)' },
  { addr: 0x0126F5, params: '0/1/0x3E8 (1000)' },
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
    case 'ex':
      return { mnemonic: 'EX', operands: `${upper(inst.dest)},${upper(inst.src)}` };
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
    case 'xor':
      return { mnemonic: 'XOR', operands: upper(inst.src || 'A') };
    case 'or':
      return { mnemonic: 'OR', operands: upper(inst.src || 'A') };
    case 'and':
      return { mnemonic: 'AND', operands: upper(inst.src || 'A') };
    case 'cp':
      return { mnemonic: 'CP', operands: upper(inst.src || 'A') };
    case 'scf':
      return { mnemonic: 'SCF', operands: '' };
    case 'ccf':
      return { mnemonic: 'CCF', operands: '' };
    case 'cpl':
      return { mnemonic: 'CPL', operands: '' };
    case 'neg':
      return { mnemonic: 'NEG', operands: '' };
    case 'rla':
      return { mnemonic: 'RLA', operands: '' };
    case 'rra':
      return { mnemonic: 'RRA', operands: '' };
    case 'rlca':
      return { mnemonic: 'RLCA', operands: '' };
    case 'rrca':
      return { mnemonic: 'RRCA', operands: '' };
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: JSON.stringify(inst) };
  }
}

// --- Scan a function from a starting address until RET ---

function scanFunction(start, maxBytes) {
  const limit = maxBytes || SCAN_LIMIT;
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    ixAccess: [],
    iyAccess: [],
    jumpTargets: [],
    loops: [],
    portIO: [],
  };
  const pendingForwardTargets = new Set();

  let pc = start;
  while (pc < rom.length && pc < start + limit) {
    const inst = safeDecode(pc);

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      summary.callSites.push({ pc, target: inst.target, conditional: inst.tag === 'call-conditional' });
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jp-conditional' });
    }

    if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jr-conditional' });
      if (inst.target < pc) {
        summary.loops.push({ from: pc, to: inst.target, conditional: inst.tag === 'jr-conditional' });
      }
    }

    if (inst.tag === 'djnz') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: true });
      if (inst.target < pc) {
        summary.loops.push({ from: pc, to: inst.target, conditional: true, type: 'DJNZ' });
      }
    }

    // Track IX-relative access (caller parameters at IX+6, IX+9, IX+12)
    if (inst.indexRegister && upper(inst.indexRegister) === 'IX') {
      const disp = inst.displacement;
      const isWrite = inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm' || inst.tag === 'ld-indexed-pair' ||
                      inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd' || inst.tag === 'ld-indexed-ixiy';
      summary.ixAccess.push({
        pc,
        displacement: disp,
        isWrite,
        tag: inst.tag,
      });
    }

    // Track IY-relative access (descriptor entry fields)
    if (inst.indexRegister && upper(inst.indexRegister) === 'IY') {
      const disp = inst.displacement;
      const isWrite = inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm' || inst.tag === 'ld-indexed-pair' ||
                      inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd' || inst.tag === 'ld-indexed-ixiy';
      summary.iyAccess.push({
        pc,
        displacement: disp,
        isWrite,
        tag: inst.tag,
      });
    }

    // Track port I/O
    if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
      summary.portIO.push({ pc, tag: inst.tag, port: inst.port });
    }

    // Track RAM access
    if (
      inst.tag === 'ld-pair-mem' ||
      inst.tag === 'ld-reg-mem' ||
      inst.tag === 'ld-mem-reg'
    ) {
      const addr = inst.addr;
      if (isTrackedRam(addr)) {
        if (inst.tag === 'ld-mem-reg' || (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')) {
          summary.ramWrites.push({ pc, addr });
        } else {
          summary.ramReads.push({ pc, addr });
        }
      }
    }

    // Track forward targets for RET detection
    if (
      (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') &&
      typeof inst.target === 'number' &&
      inst.target > pc &&
      inst.target < start + limit
    ) {
      pendingForwardTargets.add(inst.target);
    }

    for (const target of [...pendingForwardTargets]) {
      if (target <= pc) {
        pendingForwardTargets.delete(target);
      }
    }

    const { mnemonic, operands } = formatInstructionParts(inst);
    const annotation = annotate(inst, pc);
    rows.push({
      pc,
      tag: inst.tag,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
      annotation,
      inst,
    });

    if (inst.tag === 'ret' && ![...pendingForwardTargets].some((target) => target > pc)) {
      return { rows, summary, end: pc, complete: true };
    }

    pc = inst.nextPc;
  }

  return { rows, summary, end: pc - 1, complete: false };
}

function annotate(inst, pc) {
  const notes = [];
  const addr = inst.addr || inst.target || inst.value;
  if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
    notes.push(KNOWN_ADDRS.get(addr));
  }
  // Annotate IX displacements with parameter meaning
  if (inst.indexRegister && upper(inst.indexRegister) === 'IX') {
    const d = inst.displacement;
    if (d === 6 || d === 7 || d === 8) notes.push(`param1 byte (IX+${d})`);
    else if (d === 9 || d === 10 || d === 11) notes.push(`param2 byte (IX+${d})`);
    else if (d === 12 || d === 13 || d === 14) notes.push(`param3 byte (IX+${d})`);
  }
  // Annotate IY displacements with field meaning
  if (inst.indexRegister && upper(inst.indexRegister) === 'IY') {
    const d = inst.displacement;
    if (d >= 0 && d <= 7) notes.push(`link ptr region (offset +${d})`);
    else if (d === 8) notes.push('flags (offset +8)');
    else if (d === 9) notes.push('subtype (offset +9)');
    else if (d >= 10 && d <= 11) notes.push(`primary addr (offset +${d})`);
    else if (d >= 12 && d <= 14) notes.push(`secondary value (offset +${d})`);
    else if (d >= 15 && d <= 31) notes.push(`reserved (offset +${d})`);
  }
  return notes.join('; ');
}

// --- Scan for references to key addresses in a range ---

function scanForAddressRefs(startAddr, endAddr, targetAddrs) {
  const refs = [];
  for (let pc = startAddr; pc < endAddr - 3; pc++) {
    const lo = rom[pc];
    const mid = rom[pc + 1];
    const hi = rom[pc + 2];
    const addr24 = lo | (mid << 8) | (hi << 16);
    for (const targetAddr of targetAddrs) {
      if (addr24 === targetAddr) {
        for (let tryPc = Math.max(startAddr, pc - 4); tryPc <= pc; tryPc++) {
          const inst = safeDecode(tryPc);
          if (inst.nextPc === pc + 3 || (inst.nextPc > pc && inst.nextPc <= pc + 4)) {
            const { mnemonic, operands } = formatInstructionParts(inst);
            refs.push({
              instrPc: tryPc,
              addrPc: pc,
              targetAddr,
              instrLength: inst.length,
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
  return refs.filter(r => {
    const key = `${r.instrPc}:${r.targetAddr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Main ---

const lines = [];
lines.push('Phase 428 - Trace 0x00CC71: Descriptor Subsystem Init Wrapper (266 bytes)');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

lines.push('=== KNOWN CALLERS ===');
for (const caller of CALLERS) {
  lines.push(`- ${hex(caller.addr)}: params ${caller.params}`);
}
lines.push('');

// 1. Disassemble the function
lines.push('=== DISASSEMBLY 0x00CC71..0x00CD7A (266 bytes) ===');
const decoded = scanFunction(TARGET, 300);
for (const row of decoded.rows) {
  const ann = row.annotation ? ` ; ${row.annotation}` : '';
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text.padEnd(40, ' ')}${ann}`);
}
lines.push(`Span: ${hex(TARGET)}..${hex(decoded.end)} (${decoded.end - TARGET + 1} bytes, ${decoded.rows.length} instructions)`);
lines.push(`Complete (ended at RET): ${decoded.complete}`);

// 2. CALL targets
lines.push('');
lines.push('=== CALL TARGETS ===');
const callTargets = [...new Set(decoded.summary.callSites.map(s => s.target))].sort((a, b) => a - b);
if (callTargets.length === 0) {
  lines.push('- none');
} else {
  for (const target of callTargets) {
    const sites = decoded.summary.callSites.filter(s => s.target === target);
    const locs = sites.map(s => `${hex(s.pc)}${s.conditional ? ' (cond)' : ''}`).join(', ');
    const label = KNOWN_ADDRS.get(target) || '';
    lines.push(`- ${hex(target)} called from: ${locs}${label ? ` [${label}]` : ''}`);
  }
}

// 3. IX-relative access (caller parameters)
lines.push('');
lines.push('=== IX-RELATIVE ACCESS (caller parameters) ===');
if (decoded.summary.ixAccess.length === 0) {
  lines.push('- none');
} else {
  const byOffset = new Map();
  for (const acc of decoded.summary.ixAccess) {
    const key = acc.displacement;
    if (!byOffset.has(key)) byOffset.set(key, []);
    byOffset.get(key).push(acc);
  }
  const offsets = [...byOffset.keys()].sort((a, b) => a - b);
  for (const offset of offsets) {
    const accesses = byOffset.get(offset);
    const writes = accesses.filter(a => a.isWrite);
    const reads = accesses.filter(a => !a.isWrite);
    const desc = [];
    if (writes.length > 0) desc.push(`${writes.length} write(s) at ${writes.map(w => hex(w.pc)).join(', ')}`);
    if (reads.length > 0) desc.push(`${reads.length} read(s) at ${reads.map(r => hex(r.pc)).join(', ')}`);
    let paramName = 'local';
    if (offset >= 6 && offset <= 8) paramName = 'param1 (24-bit)';
    else if (offset >= 9 && offset <= 11) paramName = 'param2 (24-bit)';
    else if (offset >= 12 && offset <= 14) paramName = 'param3 (24-bit, timeout/count)';
    lines.push(`- IX+${offset} (${paramName}): ${desc.join(', ')}`);
  }
}

// 4. IY-relative access
lines.push('');
lines.push('=== IY-RELATIVE ACCESS (descriptor entry fields) ===');
if (decoded.summary.iyAccess.length === 0) {
  lines.push('- none');
} else {
  const byOffset = new Map();
  for (const acc of decoded.summary.iyAccess) {
    const key = acc.displacement;
    if (!byOffset.has(key)) byOffset.set(key, []);
    byOffset.get(key).push(acc);
  }
  const offsets = [...byOffset.keys()].sort((a, b) => a - b);
  for (const offset of offsets) {
    const accesses = byOffset.get(offset);
    const writes = accesses.filter(a => a.isWrite);
    const reads = accesses.filter(a => !a.isWrite);
    const desc = [];
    if (writes.length > 0) desc.push(`${writes.length} write(s) at ${writes.map(w => hex(w.pc)).join(', ')}`);
    if (reads.length > 0) desc.push(`${reads.length} read(s) at ${reads.map(r => hex(r.pc)).join(', ')}`);
    const fieldName = offset >= 0 && offset <= 7 ? 'link ptr'
      : offset === 8 ? 'flags'
      : offset === 9 ? 'subtype'
      : offset >= 10 && offset <= 11 ? 'primary addr'
      : offset >= 12 && offset <= 14 ? 'secondary value'
      : `reserved`;
    lines.push(`- IY+${offset} (${fieldName}): ${desc.join(', ')}`);
  }
}

// 5. RAM reads/writes
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

// 6. Port I/O
lines.push('');
lines.push('=== PORT I/O ===');
if (decoded.summary.portIO.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.portIO) {
    lines.push(`- ${entry.tag} at ${hex(entry.pc)} port=${entry.port != null ? hex(entry.port, 2) : '(C)'}`);
  }
}

// 7. Loops
lines.push('');
lines.push('=== LOOPS ===');
if (decoded.summary.loops.length === 0) {
  lines.push('- none');
} else {
  for (const loop of decoded.summary.loops) {
    const type = loop.type || (loop.conditional ? 'conditional backward branch' : 'unconditional backward branch');
    lines.push(`- ${hex(loop.from)} -> ${hex(loop.to)} (${type}, span ${loop.from - loop.to} bytes)`);
  }
}

// 8. Jump targets
lines.push('');
lines.push('=== ALL JUMP TARGETS ===');
if (decoded.summary.jumpTargets.length === 0) {
  lines.push('- none');
} else {
  for (const jt of decoded.summary.jumpTargets) {
    const cond = jt.conditional ? 'conditional' : 'unconditional';
    const dir = jt.target < jt.pc ? 'backward' : 'forward';
    lines.push(`- ${hex(jt.target)} (${cond}, ${dir}) from ${hex(jt.pc)}`);
  }
}

// 9. Address references to known pools
lines.push('');
lines.push('=== ADDRESS REFERENCES TO KNOWN POOLS (in function range) ===');
const keyAddrs = [0xD13FD8, 0xD13FDB, 0xD13FDE, 0xD13FE1, 0xD13FED, 0xD14014, 0xD14017, 0xD1401A, 0xD1401D, 0xD14020, 0xD14420];
const refs = scanForAddressRefs(TARGET, FUNC_END + 16, keyAddrs);
if (refs.length === 0) {
  lines.push('- none found');
} else {
  for (const ref of refs) {
    const label = KNOWN_ADDRS.get(ref.targetAddr) || '';
    lines.push(`- ${hex(ref.instrPc)}: ${ref.bytes.padEnd(20)} ${ref.text.padEnd(40)} refs ${hex(ref.targetAddr)}${label ? ` (${label})` : ''}`);
  }
}

// 10. Verify callers reference this function
lines.push('');
lines.push('=== CALLER VERIFICATION (scan for CALL 0x00CC71) ===');
const callerScanRanges = [
  [0x008A00, 0x008B00],
  [0x008E00, 0x008F00],
  [0x012600, 0x012800],
];
for (const [scanStart, scanEnd] of callerScanRanges) {
  const callerRefs = scanForAddressRefs(scanStart, scanEnd, [TARGET]);
  if (callerRefs.length > 0) {
    for (const ref of callerRefs) {
      lines.push(`- ${hex(ref.instrPc)}: ${ref.bytes.padEnd(20)} ${ref.text}`);
    }
  }
}

// 11. If function did not complete within expected range, try extended scan
if (!decoded.complete) {
  lines.push('');
  lines.push('=== EXTENDED SCAN (function did not end with RET within expected range) ===');
  const extended = scanFunction(TARGET, 0x400);
  lines.push(`Extended scan found ${extended.rows.length} instructions, complete: ${extended.complete}`);
  if (extended.complete) {
    lines.push(`Function ends at ${hex(extended.end)} (${extended.end - TARGET + 1} bytes)`);
  }
}

console.log(lines.join('\n'));
