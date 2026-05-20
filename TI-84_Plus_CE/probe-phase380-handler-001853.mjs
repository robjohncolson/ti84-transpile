#!/usr/bin/env node

/**
 * Phase 380: Static disassembly of the OS key handler at 0x001853.
 *
 * Uses BFS to follow all JP/JR/CALL targets within the function until
 * RET, HALT, or a known external address is reached. Summarizes RAM
 * writes, port I/O, and CALL targets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MODE = 'adl';

const ENTRY_POINT = 0x001853;

// Known external addresses — stop BFS here
const EXTERNAL_ADDRESSES = new Set([
  0x0158DE,  // post-key-action dispatcher
  0x001713,  // dispatcher / gate caller
  0x003A73,  // event loop
  0x003A7D,  // dispatch entry
  0x0067F8,  // gpio check
]);

const MAX_INSTRUCTIONS_PER_BRANCH = 150;
const MAX_TOTAL_INSTRUCTIONS = 600;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db': return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'nop': case 'halt': case 'slp': case 'di': case 'ei':
    case 'ret': case 'reti': case 'retn':
    case 'rlca': case 'rrca': case 'rla': case 'rra':
    case 'daa': case 'cpl': case 'scf': case 'ccf': case 'neg':
    case 'rrd': case 'rld':
    case 'ldi': case 'ldd': case 'ldir': case 'lddr':
    case 'cpi': case 'cpd': case 'cpir': case 'cpdr':
    case 'ini': case 'ind': case 'inir': case 'indr':
    case 'outi': case 'outd': case 'otir': case 'otdr':
    case 'otimr': case 'stmix': case 'rsmix': case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ret-conditional': return { mnemonic: 'ret', operands: inst.condition };
    case 'jr': return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional': return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz': return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp': return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional': return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect': return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call': return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional': return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst': return { mnemonic: 'rst', operands: hexByte(inst.target) };

    case 'push': return { mnemonic: 'push', operands: inst.pair };
    case 'pop': return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm': return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm': return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind': return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm': return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem': return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind': return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl': return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair': return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
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
    case 'ld-special': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a': return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb': return { mnemonic: 'ld', operands: 'a, mb' };

    case 'inc-pair': return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair': return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg': return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg': return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd': return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd': return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair': return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair': return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair': return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg': return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm': return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ixd': return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test': return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind': return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set': return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind': return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res': return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind': return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg': return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind': return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg': return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg': return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm': return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm': return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0': return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0': return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af': return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl': return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl': return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair': return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im': return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt': return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg': return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind': return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm': return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio': return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea': return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea': return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return { mnemonic: inst?.tag ?? 'unknown', operands: '' };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function safeDecode(memory, pc) {
  try {
    const decoded = decodeInstruction(memory, pc, MODE);
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
    };
  }
}

// ---------------------------------------------------------------------------
// BFS disassembler
// ---------------------------------------------------------------------------

function isTerminator(tag) {
  return tag === 'ret' || tag === 'reti' || tag === 'retn' || tag === 'halt';
}

function isUnconditionalJump(tag) {
  return tag === 'jp' || tag === 'jr';
}

function isConditionalJump(tag) {
  return tag === 'jp-conditional' || tag === 'jr-conditional';
}

function isConditionalRet(tag) {
  return tag === 'ret-conditional';
}

function isIndirectJump(tag) {
  return tag === 'jp-indirect';
}

function getTarget(inst) {
  if (inst.target !== undefined) return inst.target & 0xFFFFFF;
  return null;
}

function bfsDisassemble(memory, entryPoint) {
  const visited = new Set();
  const queue = [entryPoint];
  const rows = [];
  const callTargets = [];
  const ramWrites = [];
  const portIO = [];
  const externalStops = [];
  let totalInstructions = 0;

  while (queue.length > 0 && totalInstructions < MAX_TOTAL_INSTRUCTIONS) {
    const branchStart = queue.shift();
    if (visited.has(branchStart)) continue;

    let pc = branchStart;
    let branchCount = 0;

    while (branchCount < MAX_INSTRUCTIONS_PER_BRANCH && totalInstructions < MAX_TOTAL_INSTRUCTIONS) {
      if (pc < 0 || pc >= memory.length) break;
      if (visited.has(pc)) {
        rows.push({ pc, bytes: '', text: `; (continues at ${hex(pc)}, already disassembled)`, note: '' });
        break;
      }

      visited.add(pc);
      const inst = safeDecode(memory, pc);
      const length = Math.max(inst.length ?? 1, 1);
      const bytes = bytesToHex(memory, pc, length);
      const text = formatInstruction(inst);
      const note = inst.decodeError ? `decode error: ${inst.decodeError}` : '';

      rows.push({ pc, bytes, text, note });
      totalInstructions += 1;
      branchCount += 1;

      // Collect RAM writes: LD (addr), reg or LD (addr), pair
      if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
        ramWrites.push({ pc, addr: inst.addr, text });
      }
      if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
        ramWrites.push({ pc, addr: inst.addr, text });
      }
      // IY-indexed writes (common pattern: LD (IY+d), value)
      if (inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm') {
        ramWrites.push({ pc, addr: `${inst.indexRegister}${formatSigned(inst.displacement)}`, text });
      }
      if (inst.tag === 'ld-indexed-pair') {
        ramWrites.push({ pc, addr: `${inst.indexRegister}${formatSigned(inst.displacement)}`, text });
      }
      // IY-indexed bit set/res
      if (inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res') {
        ramWrites.push({ pc, addr: `${inst.indexRegister}${formatSigned(inst.displacement)}`, text });
      }
      // Indirect writes via HL/DE/BC
      if (inst.tag === 'ld-ind-reg') {
        ramWrites.push({ pc, addr: `(${inst.dest})`, text });
      }
      if (inst.tag === 'ld-ind-imm') {
        ramWrites.push({ pc, addr: '(hl)', text });
      }

      // Collect port I/O
      if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'in0') {
        portIO.push({ pc, direction: 'IN', port: inst.port ?? 'c', text });
      }
      if (inst.tag === 'out-reg' || inst.tag === 'out-imm' || inst.tag === 'out0') {
        portIO.push({ pc, direction: 'OUT', port: inst.port ?? 'c', text });
      }

      // Collect CALL targets (but do NOT BFS into them — only follow JP/JR branches)
      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        const target = getTarget(inst);
        if (target !== null) {
          callTargets.push({ pc, target, text });
          if (EXTERNAL_ADDRESSES.has(target)) {
            externalStops.push({ pc, target, text });
          }
        }
        // Continue linear after CALL — do not enter the subroutine
        pc += length;
        continue;
      }

      // RST: record as call target, continue linear
      if (inst.tag === 'rst') {
        const target = getTarget(inst);
        if (target !== null) {
          callTargets.push({ pc, target, text });
        }
        pc += length;
        continue;
      }

      // Terminators
      if (isTerminator(inst.tag)) break;
      if (isConditionalRet(inst.tag)) {
        // Conditional RET: fall through to next instruction
        pc += length;
        continue;
      }
      if (isIndirectJump(inst.tag)) {
        rows.push({ pc: pc + length, bytes: '', text: `; indirect jump via (${inst.indirectRegister}) -- cannot follow statically`, note: '' });
        break;
      }

      // Unconditional jump
      if (isUnconditionalJump(inst.tag)) {
        const target = getTarget(inst);
        if (target === null) break;
        if (EXTERNAL_ADDRESSES.has(target)) {
          externalStops.push({ pc, target, text });
          break;
        }
        if (!visited.has(target)) {
          queue.push(target);
        }
        break;
      }

      // Conditional jump: queue the taken branch, continue with fallthrough
      if (isConditionalJump(inst.tag)) {
        const target = getTarget(inst);
        if (target !== null && !EXTERNAL_ADDRESSES.has(target) && !visited.has(target)) {
          queue.push(target);
        }
        if (target !== null && EXTERNAL_ADDRESSES.has(target)) {
          externalStops.push({ pc, target, text });
        }
        pc += length;
        continue;
      }

      // Default: linear fallthrough
      pc += length;
    }
  }

  // Sort rows by address for clean output
  rows.sort((a, b) => a.pc - b.pc);

  return { rows, callTargets, ramWrites, portIO, externalStops, visitedCount: visited.size };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

console.log('=== PROBE: PHASE 380 STATIC DISASSEMBLY OF 0x001853 (KEY HANDLER) ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`entry_point: ${hex(ENTRY_POINT)}`);
console.log(`mode: ${MODE}`);
console.log(`external_stop_addresses: ${[...EXTERNAL_ADDRESSES].map((a) => hex(a)).join(', ')}`);
console.log(`max_instructions_per_branch: ${MAX_INSTRUCTIONS_PER_BRANCH}`);
console.log(`max_total_instructions: ${MAX_TOTAL_INSTRUCTIONS}`);
console.log('');

const { rows, callTargets, ramWrites, portIO, externalStops, visitedCount } = bfsDisassemble(romBytes, ENTRY_POINT);

// 1. Linear disassembly
console.log(`=== DISASSEMBLY FROM ${hex(ENTRY_POINT)} (${visitedCount} addresses visited) ===`);
for (const row of rows) {
  if (row.bytes === '') {
    console.log(`  ${row.text}`);
  } else {
    const noteStr = row.note ? ` [${row.note}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${noteStr}`);
  }
}
console.log('');

// 2. RAM writes summary
console.log(`=== RAM WRITES (${ramWrites.length} found) ===`);
if (ramWrites.length === 0) {
  console.log('  none');
} else {
  for (const write of ramWrites) {
    const addrStr = typeof write.addr === 'number' ? hex(write.addr) : write.addr;
    console.log(`  ${hex(write.pc)}: ${write.text}  -> target: ${addrStr}`);
  }
}
console.log('');

// 3. Port I/O summary
console.log(`=== PORT I/O (${portIO.length} found) ===`);
if (portIO.length === 0) {
  console.log('  none');
} else {
  for (const io of portIO) {
    const portStr = typeof io.port === 'number' ? hexByte(io.port) : io.port;
    console.log(`  ${hex(io.pc)}: ${io.direction} port=${portStr} | ${io.text}`);
  }
}
console.log('');

// 4. CALL targets summary
console.log(`=== CALL TARGETS (${callTargets.length} found) ===`);
if (callTargets.length === 0) {
  console.log('  none');
} else {
  const uniqueTargets = new Map();
  for (const call of callTargets) {
    if (!uniqueTargets.has(call.target)) {
      uniqueTargets.set(call.target, []);
    }
    uniqueTargets.get(call.target).push(call.pc);
  }
  for (const [target, callers] of [...uniqueTargets.entries()].sort((a, b) => a[0] - b[0])) {
    const isExternal = EXTERNAL_ADDRESSES.has(target);
    const label = isExternal ? ' [EXTERNAL]' : '';
    console.log(`  ${hex(target)}${label} called from: ${callers.map((a) => hex(a)).join(', ')}`);
  }
}
console.log('');

// 5. External stops
console.log(`=== EXTERNAL BRANCH/CALL STOPS (${externalStops.length} found) ===`);
if (externalStops.length === 0) {
  console.log('  none');
} else {
  for (const stop of externalStops) {
    console.log(`  ${hex(stop.pc)}: ${stop.text} -> external ${hex(stop.target)}`);
  }
}
console.log('');

// 6. Port 0x09 analysis
const port09Entries = portIO.filter((io) => io.port === 0x09);
console.log(`=== PORT 0x09 ANALYSIS (${port09Entries.length} references) ===`);
if (port09Entries.length === 0) {
  console.log('  No direct port 0x09 I/O found in the static disassembly.');
  console.log('  Port 0x09 may be accessed via register C (IN r,(C) / OUT (C),r) where');
  console.log('  the value of C is set dynamically. Check for LD C,0x09 or LD BC,0x0009');
  console.log('  patterns in the listing above.');
  console.log('');

  // Search for LD C,0x09 or LD BC,xxxx09 patterns
  const port09Indirect = [];
  for (const row of rows) {
    if (row.text.match(/ld c, 0x09/i) || row.text.match(/ld bc,.*09$/i)) {
      port09Indirect.push(row);
    }
  }
  if (port09Indirect.length > 0) {
    console.log('  Possible port 0x09 setup instructions:');
    for (const row of port09Indirect) {
      console.log(`    ${hex(row.pc)}: ${row.text}`);
    }
  } else {
    console.log('  No LD C,0x09 or LD BC,xx09 patterns found either.');
    console.log('  Port 0x09 access may occur in a subroutine called from here,');
    console.log('  or the port number may be computed dynamically.');
  }

  // Also check for any port-C I/O that could be port 0x09
  const portCEntries = portIO.filter((io) => io.port === 'c');
  if (portCEntries.length > 0) {
    console.log('');
    console.log('  Register-indirect port I/O (port determined by C register):');
    for (const io of portCEntries) {
      console.log(`    ${hex(io.pc)}: ${io.direction} ${io.text}`);
    }
    console.log('  These may access port 0x09 if C=0x09 at runtime.');
  }
} else {
  console.log('  Direct port 0x09 I/O instructions:');
  for (const io of port09Entries) {
    console.log(`    ${hex(io.pc)}: ${io.direction} ${io.text}`);
  }
  console.log('');
  console.log('  Port 0x09 on the TI-84 CE is the keyboard scan port.');
  console.log('  IN from port 0x09: reads the keyboard column data for the currently selected row.');
  console.log('  OUT to port 0x09: selects the keyboard row group to scan.');
  console.log('  This confirms 0x001853 directly interacts with the keyboard hardware.');
}
console.log('');

// 7. Overall assessment
console.log('=== ASSESSMENT ===');
console.log(`Function at ${hex(ENTRY_POINT)} spans ${visitedCount} decoded addresses.`);
console.log(`It makes ${callTargets.length} CALL(s) and has ${ramWrites.length} RAM write(s).`);
console.log(`Port I/O operations: ${portIO.length} total.`);
console.log('');
console.log('Dispatch chain context:');
console.log('  0x003A7D (event loop dispatch)');
console.log('    -> 0x001713 (gate caller)');
console.log('      -> 0x001853 (THIS FUNCTION: key acceptance handler)');
console.log('        -> 0x0158DE (post-key-action dispatcher)');
console.log('');

const callsTo0158DE = callTargets.filter((c) => c.target === 0x0158DE);
if (callsTo0158DE.length > 0) {
  console.log(`Confirmed: 0x001853 calls 0x0158DE from ${callsTo0158DE.map((c) => hex(c.pc)).join(', ')}.`);
} else {
  console.log('Note: No direct CALL to 0x0158DE found in the static BFS.');
  console.log('The call may be via JP, RST, or through an intermediate function.');
}

const sysflagWrites = ramWrites.filter((w) => w.addr === 0xD177BA);
if (sysflagWrites.length > 0) {
  console.log(`Confirmed: writes to 0xD177BA (sysflag) at ${sysflagWrites.map((w) => hex(w.pc)).join(', ')}.`);
}

console.log('');
console.log('Key questions answered:');
console.log('  1. What does the full instruction sequence look like? -> See disassembly above.');
console.log('  2. What RAM does it modify? -> See RAM WRITES section.');
console.log('  3. What port I/O does it do? -> See PORT I/O section.');
console.log('  4. What subroutines does it call? -> See CALL TARGETS section.');
console.log('  5. What role does port 0x09 play? -> See PORT 0x09 ANALYSIS section.');
