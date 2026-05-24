#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x00E383;
const SCAN_LIMIT = 0x300;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

// Known addresses of interest
const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor base A'],
  [0xD13FDE, 'descriptor base B'],
  [0xD14017, 'master descriptor source'],
  [0xD1401A, 'slab pool A'],
  [0xD1401D, 'slab pool B'],
  [0xD14020, 'slab pool C'],
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
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL,${upper(inst.src)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hex(inst.value, 2) };
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
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: '' };
  }
}

// ─── Scan a function from a starting address until RET ───

function scanFunction(start, label) {
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    portIo: [],
    jumpTargets: [],
  };
  const pendingForwardTargets = new Set();

  let pc = start;
  while (pc < rom.length && pc < start + SCAN_LIMIT) {
    const inst = safeDecode(pc);

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      summary.callSites.push({ pc, target: inst.target });
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jp-conditional' });
    }

    if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: inst.tag === 'jr-conditional' });
    }

    if (inst.tag === 'djnz') {
      summary.jumpTargets.push({ pc, target: inst.target, conditional: true });
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

    if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
      summary.portIo.push({ pc, inst });
    }

    // Track forward targets for RET detection
    if (
      (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') &&
      typeof inst.target === 'number' &&
      inst.target > pc &&
      inst.target < start + SCAN_LIMIT
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
    });

    if (inst.tag === 'ret' && ![...pendingForwardTargets].some((target) => target > pc)) {
      return { rows, summary, end: pc, complete: true };
    }

    pc = inst.nextPc;
  }

  return { rows, summary, end: pc - 1, complete: false };
}

function annotate(inst, pc) {
  // Check for known RAM addresses in the instruction
  const notes = [];
  const addr = inst.addr || inst.target || inst.value;
  if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
    notes.push(KNOWN_ADDRS.get(addr));
  }
  return notes.join('; ');
}

// ─── Find function start by scanning backward for RET/JP ───

function findFunctionStart(addr) {
  let pc = addr - 1;
  // Scan backward up to 64 bytes looking for RET (0xC9) or unconditional JP (0xC3)
  const limit = Math.max(0, addr - 64);
  while (pc >= limit) {
    const byte = rom[pc];
    if (byte === 0xC9) {
      return pc + 1; // function starts right after RET
    }
    // Check for JP xx xx xx (4 bytes: C3 + 3 addr bytes)
    if (pc >= 4 && rom[pc - 3] === 0xC3) {
      // The byte at pc-3 is JP, so the JP instruction occupies pc-3..pc, and function starts at pc+1
      return pc + 1;
    }
    pc--;
  }
  return null; // couldn't find boundary
}

// ─── Scan for references to key addresses in a range ───

function scanForAddressRefs(startAddr, endAddr, targetAddrs) {
  const refs = [];
  for (let pc = startAddr; pc < endAddr - 3; pc++) {
    // Check for 3-byte little-endian address pattern
    const lo = rom[pc];
    const mid = rom[pc + 1];
    const hi = rom[pc + 2];
    const addr24 = lo | (mid << 8) | (hi << 16);
    for (const targetAddr of targetAddrs) {
      if (addr24 === targetAddr) {
        // Try to decode the instruction at a few candidate positions before this
        // to see if this is an operand
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
  // Deduplicate by instrPc
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
lines.push('Phase 426 - Trace 0x00E383: Descriptor Pool Initializer');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

// 1. Find function start
lines.push('=== FUNCTION BOUNDARY DETECTION ===');
const funcStart = findFunctionStart(TARGET);
lines.push(`Scanning backward from ${hex(TARGET)} for function boundary...`);
if (funcStart !== null && funcStart < TARGET) {
  lines.push(`Possible function start at ${hex(funcStart)} (found terminator at ${hex(funcStart - 1)})`);
  lines.push(`Bytes between detected start and target: ${TARGET - funcStart}`);
  // Also decode from funcStart to see if TARGET is mid-function
  lines.push('');
  lines.push('--- Disassembly from detected function start ---');
  const preDecoded = scanFunction(funcStart, 'pre-target');
  for (const row of preDecoded.rows) {
    if (row.pc > TARGET + 0x10 && row.pc < TARGET) continue; // skip middle
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    const marker = row.pc === TARGET ? ' <<<< TARGET' : '';
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(36, ' ')}${ann}${marker}`);
    if (row.pc > TARGET + SCAN_LIMIT) break;
  }
  lines.push(`Function span: ${hex(funcStart)}..${hex(preDecoded.end)} (${preDecoded.end - funcStart + 1} bytes)`);
  lines.push(`Complete: ${preDecoded.complete}`);
} else {
  lines.push(`No clear function boundary found in 64 bytes before ${hex(TARGET)}`);
}

// 2. Decode from TARGET directly
lines.push('');
lines.push('=== DISASSEMBLY FROM TARGET 0x00E383 ===');
const decoded = scanFunction(TARGET, 'target');
for (const row of decoded.rows) {
  const ann = row.annotation ? ` ; ${row.annotation}` : '';
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(36, ' ')}${ann}`);
}
lines.push(`Span: ${hex(TARGET)}..${hex(decoded.end)} (${decoded.end - TARGET + 1} bytes, ${decoded.rows.length} instructions)`);
lines.push(`Complete (ended at RET): ${decoded.complete}`);

// 3. Summary
lines.push('');
lines.push('=== CALL TARGETS ===');
const callTargets = [...new Set(decoded.summary.callSites.map(s => s.target))].sort((a, b) => a - b);
if (callTargets.length === 0) {
  lines.push('- none');
} else {
  for (const target of callTargets) {
    const sites = decoded.summary.callSites.filter(s => s.target === target).map(s => hex(s.pc)).join(', ');
    lines.push(`- ${hex(target)} called from: ${sites}`);
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
lines.push('=== JUMP TARGETS ===');
if (decoded.summary.jumpTargets.length === 0) {
  lines.push('- none');
} else {
  for (const jt of decoded.summary.jumpTargets) {
    const cond = jt.conditional ? 'conditional' : 'unconditional';
    const dir = jt.target < jt.pc ? 'backward' : 'forward';
    lines.push(`- ${hex(jt.target)} (${cond}, ${dir}) from ${hex(jt.pc)}`);
  }
}

// 4. Scan for references to key addresses in 0xE300..0xE500
lines.push('');
lines.push('=== ADDRESS REFERENCES IN 0x00E300..0x00E500 ===');
const keyAddrs = [0xD13FD8, 0xD13FDE, 0xD14017, 0xD1401A, 0xD1401D, 0xD14020,
                  0xD13FE4, 0xD13FEA, 0xD13FF0, 0xD13FF6, 0xD13FFC, 0xD13FFF, 0xD14002,
                  0xD14005, 0xD14008, 0xD1400B, 0xD1400E, 0xD14011, 0xD14014];
const refs = scanForAddressRefs(0x00E300, 0x00E500, keyAddrs);
if (refs.length === 0) {
  lines.push('- none found');
} else {
  for (const ref of refs) {
    const label = KNOWN_ADDRS.get(ref.targetAddr) || '';
    lines.push(`- ${hex(ref.instrPc)}: ${ref.bytes.padEnd(17)} ${ref.text.padEnd(36)} refs ${hex(ref.targetAddr)}${label ? ` (${label})` : ''}`);
  }
}

// 5. Also scan the wider range for D13FD8/D13FDE/D14017 specifically
lines.push('');
lines.push('=== KEY ADDRESS REFERENCES IN 0x00E200..0x00E700 (wider scan) ===');
const wideRefs = scanForAddressRefs(0x00E200, 0x00E700, [0xD13FD8, 0xD13FDE, 0xD14017]);
if (wideRefs.length === 0) {
  lines.push('- none found');
} else {
  for (const ref of wideRefs) {
    const label = KNOWN_ADDRS.get(ref.targetAddr) || '';
    lines.push(`- ${hex(ref.instrPc)}: ${ref.bytes.padEnd(17)} ${ref.text.padEnd(36)} refs ${hex(ref.targetAddr)}${label ? ` (${label})` : ''}`);
  }
}

// 6. Also decode a few functions around the area to understand context
lines.push('');
lines.push('=== RAW BYTES at 0x00E370..0x00E3A0 (context around target) ===');
for (let addr = 0x00E370; addr < 0x00E3A0; addr += 16) {
  const end = Math.min(addr + 16, 0x00E3A0);
  const bytesStr = formatBytes(addr, end - addr);
  lines.push(`${hex(addr)}: ${bytesStr}`);
}

console.log(lines.join('\n'));
