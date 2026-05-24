#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// Three callers of 0x00CC71 identified in session 427
const CALLERS = [
  { addr: 0x008A52, label: 'caller A', params: '0/2/0x7D0 (2000)' },
  { addr: 0x008EB5, label: 'caller B', params: '0/1/0x12C (300)' },
  { addr: 0x0126F5, label: 'caller C', params: '0/1/0x3E8 (1000)' },
];

const CC71_TARGET = 0x00CC71;
const SCAN_LIMIT = 0x400;
const ROM_END = 0x400000;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor base A'],
  [0xD13FDB, 'descriptor base B'],
  [0xD13FDE, 'descriptor base C'],
  [0xD13FE1, 'descriptor base D'],
  [0xD14017, 'master descriptor source'],
  [0xD1401A, 'slab pool A'],
  [0xD1401D, 'slab pool B'],
  [0xD14020, 'slab pool C'],
  [0xD13FE4, 'conn struct +0'],
  [0xD13FED, 'connection table'],
  [0xD14420, 'fixed RAM (BC target)'],
  [0x00CC71, 'descriptor subsystem init wrapper'],
  [0x008A52, 'caller A (params 0/2/2000)'],
  [0x008EB5, 'caller B (params 0/1/300)'],
  [0x0126F5, 'caller C (params 0/1/1000)'],
]);

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

function annotate(inst, pc) {
  const notes = [];
  const addr = inst.addr || inst.target || inst.value;
  if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
    notes.push(KNOWN_ADDRS.get(addr));
  }
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

// ─── Scan a function from a starting address until RET ───

function scanFunction(start, maxBytes) {
  const limit = maxBytes || SCAN_LIMIT;
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    iyAccess: [],
    jumpTargets: [],
    loops: [],
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

    if (inst.indexRegister && upper(inst.indexRegister) === 'IY') {
      const disp = inst.displacement;
      const isWrite = inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm' || inst.tag === 'ld-indexed-pair' ||
                      inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd' || inst.tag === 'ld-indexed-ixiy';
      summary.iyAccess.push({ pc, displacement: disp, isWrite, tag: inst.tag });
    }

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

// ─── Find function start by scanning backward ───

function findFunctionStart(addr, maxBack = 128) {
  let pc = addr - 1;
  const limit = Math.max(0, addr - maxBack);
  while (pc >= limit) {
    const byte = rom[pc];
    // RET = 0xC9
    if (byte === 0xC9) {
      return pc + 1;
    }
    // JP xx xx xx (C3 + 3 addr bytes in ADL)
    if (pc >= 4 && rom[pc - 3] === 0xC3) {
      return pc + 1;
    }
    pc--;
  }
  return null;
}

// ─── Scan for CALL references to target addresses in ROM ───

function scanForCallRefs(startAddr, endAddr, targetAddrs) {
  const refs = [];
  const targetSet = new Set(targetAddrs);
  for (let pc = startAddr; pc < endAddr - 3; pc++) {
    // CALL in ADL mode: CD xx xx xx (4 bytes)
    if (rom[pc] === 0xCD) {
      const lo = rom[pc + 1];
      const mid = rom[pc + 2];
      const hi = rom[pc + 3];
      const addr24 = lo | (mid << 8) | (hi << 16);
      if (targetSet.has(addr24)) {
        refs.push({ instrPc: pc, target: addr24 });
      }
    }
  }
  return refs;
}

// ─── Scan for any address references (CALL, JP, LD, etc.) ───

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

// ─── Main ───

const lines = [];
lines.push('Phase 428 - Trace 0x00CC71 Callers: 0x008A52, 0x008EB5, 0x0126F5');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

// For each caller, find boundaries and disassemble
for (const caller of CALLERS) {
  lines.push('='.repeat(80));
  lines.push(`=== CALLER: ${hex(caller.addr)} (${caller.label}) — params ${caller.params} ===`);
  lines.push('='.repeat(80));
  lines.push('');

  // 1. Find function start
  const funcStart = findFunctionStart(caller.addr, 64);
  lines.push(`--- Function boundary detection ---`);
  if (funcStart !== null && funcStart < caller.addr) {
    lines.push(`Function start: ${hex(funcStart)} (terminator at ${hex(funcStart - 1)}, ${caller.addr - funcStart} bytes before CALL site)`);
  } else {
    lines.push(`No clear function start found in 64 bytes before ${hex(caller.addr)}, using addr - 32 as fallback`);
  }

  // 2. Disassemble the full function from start
  const disasmStart = funcStart !== null && funcStart < caller.addr ? funcStart : caller.addr - 32;
  lines.push('');
  lines.push(`--- Full disassembly from ${hex(disasmStart)} ---`);
  const decoded = scanFunction(disasmStart, 0x300);
  for (const row of decoded.rows) {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    const marker = row.pc === caller.addr ? ' <<<< CALL CC71 SITE' : '';
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(24, ' ')} ${row.text.padEnd(40, ' ')}${ann}${marker}`);
  }
  lines.push(`Span: ${hex(disasmStart)}..${hex(decoded.end)} (${decoded.end - disasmStart + 1} bytes, ${decoded.rows.length} instructions)`);
  lines.push(`Complete (ended at RET): ${decoded.complete}`);
  lines.push('');

  // 3. CALL targets in this function
  lines.push('--- CALL targets ---');
  const callTargets = [...new Set(decoded.summary.callSites.map(s => s.target))].sort((a, b) => a - b);
  if (callTargets.length === 0) {
    lines.push('  (none)');
  } else {
    for (const target of callTargets) {
      const sites = decoded.summary.callSites.filter(s => s.target === target);
      const locs = sites.map(s => `${hex(s.pc)}${s.conditional ? ' (cond)' : ''}`).join(', ');
      const label = KNOWN_ADDRS.get(target) || '';
      lines.push(`  ${hex(target)}${label ? ` (${label})` : ''} called from: ${locs}`);
    }
  }

  // 4. RAM access
  lines.push('');
  lines.push('--- RAM reads ---');
  if (decoded.summary.ramReads.length === 0) {
    lines.push('  (none)');
  } else {
    for (const entry of decoded.summary.ramReads) {
      const label = KNOWN_ADDRS.get(entry.addr) || '';
      lines.push(`  ${hex(entry.addr)} at ${hex(entry.pc)}${label ? ` (${label})` : ''}`);
    }
  }

  lines.push('');
  lines.push('--- RAM writes ---');
  if (decoded.summary.ramWrites.length === 0) {
    lines.push('  (none)');
  } else {
    for (const entry of decoded.summary.ramWrites) {
      const label = KNOWN_ADDRS.get(entry.addr) || '';
      lines.push(`  ${hex(entry.addr)} at ${hex(entry.pc)}${label ? ` (${label})` : ''}`);
    }
  }

  // 5. IY access
  lines.push('');
  lines.push('--- IY-relative access ---');
  if (decoded.summary.iyAccess.length === 0) {
    lines.push('  (none)');
  } else {
    for (const acc of decoded.summary.iyAccess) {
      const rw = acc.isWrite ? 'WRITE' : 'READ';
      lines.push(`  IY+${acc.displacement} ${rw} at ${hex(acc.pc)}`);
    }
  }

  // 6. Loops
  lines.push('');
  lines.push('--- Loops ---');
  if (decoded.summary.loops.length === 0) {
    lines.push('  (none)');
  } else {
    for (const loop of decoded.summary.loops) {
      const type = loop.type || (loop.conditional ? 'conditional backward branch' : 'unconditional backward branch');
      lines.push(`  ${hex(loop.from)} -> ${hex(loop.to)} (${type}, span ${loop.from - loop.to} bytes)`);
    }
  }

  // 7. Jump targets
  lines.push('');
  lines.push('--- Jump targets ---');
  if (decoded.summary.jumpTargets.length === 0) {
    lines.push('  (none)');
  } else {
    for (const jt of decoded.summary.jumpTargets) {
      const cond = jt.conditional ? 'conditional' : 'unconditional';
      const dir = jt.target < jt.pc ? 'backward' : 'forward';
      lines.push(`  ${hex(jt.target)} (${cond}, ${dir}) from ${hex(jt.pc)}`);
    }
  }

  lines.push('');
}

// ─── Who calls these three functions? Scan entire ROM ───

lines.push('='.repeat(80));
lines.push('=== CALLERS OF 0x008A52, 0x008EB5, 0x0126F5 (full ROM scan) ===');
lines.push('='.repeat(80));
lines.push('');

const callerAddrs = CALLERS.map(c => c.addr);
const romCallRefs = scanForCallRefs(0x000000, ROM_END, callerAddrs);

for (const callerInfo of CALLERS) {
  const refsForThis = romCallRefs.filter(r => r.target === callerInfo.addr);
  lines.push(`--- CALL ${hex(callerInfo.addr)} (${callerInfo.label}) — ${refsForThis.length} call site(s) ---`);
  if (refsForThis.length === 0) {
    lines.push('  (none found — may be called via JP, jump table, or RST)');
  } else {
    for (const ref of refsForThis) {
      // Decode a few instructions around the call site for context
      const contextStart = Math.max(0, ref.instrPc - 12);
      lines.push(`  ${hex(ref.instrPc)}: CALL ${hex(ref.target)}`);
      // Show 3 instructions before the call for context
      let scanPc = contextStart;
      const contextRows = [];
      while (scanPc < ref.instrPc + 4 && scanPc < rom.length) {
        const inst = safeDecode(scanPc);
        const { mnemonic, operands } = formatInstructionParts(inst);
        const ann = annotate(inst, scanPc);
        const marker = scanPc === ref.instrPc ? ' <<<<' : '';
        contextRows.push(`    ${hex(scanPc)}  ${formatBytes(scanPc, inst.length).padEnd(20)} ${withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`)}${ann ? ` ; ${ann}` : ''}${marker}`);
        scanPc = inst.nextPc;
        if (scanPc > ref.instrPc + 4) break;
      }
      for (const row of contextRows) {
        lines.push(row);
      }
    }
  }
  lines.push('');
}

// ─── Also scan for JP references (non-CALL) ───

lines.push('=== JP REFERENCES to 0x008A52, 0x008EB5, 0x0126F5 (full ROM scan) ===');
lines.push('');

for (const callerInfo of CALLERS) {
  const jpRefs = scanForAddressRefs(0x000000, ROM_END, [callerInfo.addr]);
  // Filter out the CALL refs we already found
  const callPcs = new Set(romCallRefs.filter(r => r.target === callerInfo.addr).map(r => r.instrPc));
  const nonCallRefs = jpRefs.filter(r => !callPcs.has(r.instrPc));
  lines.push(`--- Non-CALL refs to ${hex(callerInfo.addr)} (${callerInfo.label}) — ${nonCallRefs.length} ref(s) ---`);
  if (nonCallRefs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const ref of nonCallRefs) {
      const label = KNOWN_ADDRS.get(ref.targetAddr) || '';
      lines.push(`  ${hex(ref.instrPc)}: ${ref.bytes.padEnd(20)} ${ref.text}${label ? ` ; ${label}` : ''}`);
    }
  }
  lines.push('');
}

// ─── Parameter setup analysis: zoom into instructions before CALL CC71 ───

lines.push('='.repeat(80));
lines.push('=== PARAMETER SETUP BEFORE CALL 0x00CC71 (detailed) ===');
lines.push('='.repeat(80));
lines.push('');

for (const caller of CALLERS) {
  lines.push(`--- ${hex(caller.addr)} (${caller.label}) — expected params: ${caller.params} ---`);
  // Show 10 instructions before the CALL CC71 site
  // Find the CALL CC71 in the function
  const scanStart = Math.max(0, caller.addr - 40);
  let pc = scanStart;
  const preRows = [];
  while (pc < caller.addr + 4 && pc < rom.length) {
    const inst = safeDecode(pc);
    const { mnemonic, operands } = formatInstructionParts(inst);
    const ann = annotate(inst, pc);
    const marker = pc === caller.addr ? ' <<<< CALL CC71' : '';
    preRows.push(`  ${hex(pc)}  ${formatBytes(pc, inst.length).padEnd(20)} ${withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`)}${ann ? ` ; ${ann}` : ''}${marker}`);
    pc = inst.nextPc;
  }
  for (const row of preRows) {
    lines.push(row);
  }
  lines.push('');
}

console.log(lines.join('\n'));
