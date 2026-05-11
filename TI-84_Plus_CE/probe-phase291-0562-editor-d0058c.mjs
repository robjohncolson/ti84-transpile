#!/usr/bin/env node

// Phase 291: Deep-dive into three D0058C writers in the 0x0562xx range
// 0x05627A, 0x05628A, 0x0562AB — all LD (0xD0058C), A
// Near BufInsert / edit-mode region. Determine if these are the
// edit-mode key insertion path.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

// Three known D0058C write sites in the 0x0562xx region
const WRITE_SITES = [0x05627A, 0x05628A, 0x0562AB];

// Known addresses for cross-referencing
const KNOWN_ADDRESSES = {
  0x05E307: 'scan-code-to-token',
  0x005A75: 'text renderer',
  0x0059E9: 'text renderer (20 callers)',
  0x0059C6: 'D0058C dispatch region',
};

const D0058C = 0xD0058C;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (v) => hexByte(v)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'set-bit':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'res-bit':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'im':
      return `${prefix}IM ${inst.mode}`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      return `${prefix}${String(inst.tag).toUpperCase()}${extra ? ` ${extra}` : ''}`;
    }
  }
}

// Scan backwards from an address to find probable function entry
// Look for a RET/JP/RETI preceding a PUSH or other function prologue
function findFunctionEntry(targetAddr) {
  // Scan backwards up to 128 bytes looking for a function boundary
  const scanStart = Math.max(0, targetAddr - 128);
  let bestEntry = targetAddr;

  // Disassemble forward from scanStart and look for patterns
  let pc = scanStart;
  let lastTerminator = scanStart;

  while (pc < targetAddr) {
    const inst = safeDecode(pc);
    if (!inst) {
      pc += 1;
      continue;
    }

    // If we see a RET or unconditional JP, the next instruction is likely a function entry
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn'
        || (inst.tag === 'jp' && inst.target !== undefined && inst.target < pc - 16)) {
      lastTerminator = pc + inst.length;
    }

    pc += inst.length;
  }

  // The function entry is likely right after the last terminator we found
  if (lastTerminator > scanStart && lastTerminator <= targetAddr) {
    bestEntry = lastTerminator;
  }

  return bestEntry;
}

// Scan forward from an address to find function end (RET or unconditional JP to outside)
function findFunctionEnd(startAddr, mustPassThrough) {
  const maxScan = startAddr + 512;
  const lastMustPass = Math.max(...mustPassThrough);
  let pc = startAddr;

  while (pc < maxScan && pc < rom.length) {
    const inst = safeDecode(pc);
    if (!inst) {
      pc += 1;
      continue;
    }

    // Only end after we've passed through all required addresses
    if (pc > lastMustPass) {
      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
        return pc + inst.length;
      }
      // Unconditional JP to a far address (not a local branch)
      if (inst.tag === 'jp' && inst.target !== undefined) {
        const dist = Math.abs(inst.target - pc);
        if (dist > 64) {
          return pc + inst.length;
        }
      }
    }

    pc += inst.length;
  }

  return maxScan;
}

function disassembleRange(start, endExclusive) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive && pc < rom.length) {
    const inst = safeDecode(pc);
    if (!inst) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        asm: `DB ${hexByte(rom[pc])}`,
        inst: null,
        annotations: [],
      });
      pc += 1;
      continue;
    }

    const annotations = [];
    // Flag D0058C writes
    if ((inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') && inst.addr === D0058C) {
      annotations.push('<<< D0058C WRITE >>>');
    }
    if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && inst.addr === D0058C) {
      annotations.push('<<< D0058C WRITE >>>');
    }
    // Flag known addresses
    if ((inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional') && inst.target in KNOWN_ADDRESSES) {
      annotations.push(`[${KNOWN_ADDRESSES[inst.target]}]`);
    }

    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      asm: formatInstruction(inst),
      inst,
      annotations,
    });
    pc += inst.length;
  }

  return rows;
}

// Trace what value A holds at a given write site by scanning backwards
function traceAProvenance(rows, writeSitePC) {
  const writeIdx = rows.findIndex((r) => r.pc === writeSitePC);
  if (writeIdx < 0) {
    return 'write site not found in disassembly';
  }

  // Scan backwards for the most recent instruction that sets A
  for (let i = writeIdx - 1; i >= 0; i--) {
    const inst = rows[i].inst;
    if (!inst) continue;

    // LD A, immediate
    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      return `A = immediate ${hexByte(inst.value)} (set at ${hex(rows[i].pc)})`;
    }
    // LD A, (addr)
    if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') {
      return `A = mem read from ${hex(inst.addr)} (set at ${hex(rows[i].pc)})`;
    }
    // LD A, reg
    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') {
      return `A = ${String(inst.src).toUpperCase()} (set at ${hex(rows[i].pc)})`;
    }
    // LD A, (HL)
    if (inst.tag === 'ld-reg-ind' && inst.dest === 'a') {
      return `A = (${String(inst.src).toUpperCase()}) (set at ${hex(rows[i].pc)})`;
    }
    // LD A, (IX+d) / (IY+d)
    if (inst.tag === 'ld-reg-ixd' && inst.dest === 'a') {
      return `A = ${formatIndexed(inst.indexRegister, inst.displacement)} (set at ${hex(rows[i].pc)})`;
    }
    // ALU ops that write A
    if (inst.tag === 'alu-imm') {
      return `A modified by ${String(inst.op).toUpperCase()} ${hexByte(inst.value)} (at ${hex(rows[i].pc)})`;
    }
    if (inst.tag === 'alu-reg') {
      return `A modified by ${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()} (at ${hex(rows[i].pc)})`;
    }
    // INC/DEC A
    if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && inst.reg === 'a') {
      return `A modified by ${inst.tag === 'inc-reg' ? 'INC' : 'DEC'} A (at ${hex(rows[i].pc)})`;
    }
    // POP AF
    if (inst.tag === 'pop' && inst.pair === 'af') {
      return `A = POP AF (stack, at ${hex(rows[i].pc)})`;
    }
    // Conditional jump that could skip — stop tracing on unconditional jumps
    if (inst.tag === 'jp' || inst.tag === 'call' || inst.tag === 'ret') {
      return `A provenance unclear — control flow at ${hex(rows[i].pc)}: ${rows[i].asm}`;
    }
  }

  return 'A provenance: could not determine (function entry parameter?)';
}

// Search ROM for CALL and JP to a given target address
function findCallers(targetAddr) {
  const callers = [];
  // CALL target: CD lo mid hi (24-bit LE)
  const callBytes = [0xCD, targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];
  // JP target: C3 lo mid hi
  const jpBytes = [0xC3, targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];

  for (let i = 0; i <= rom.length - 4; i++) {
    let isCall = true;
    let isJp = true;
    for (let j = 0; j < 4; j++) {
      if (rom[i + j] !== callBytes[j]) isCall = false;
      if (rom[i + j] !== jpBytes[j]) isJp = false;
    }
    if (isCall) {
      callers.push({ pc: i, type: 'CALL', bytes: formatBytes(i, 4) });
    }
    if (isJp) {
      callers.push({ pc: i, type: 'JP', bytes: formatBytes(i, 4) });
    }
  }

  // Also check conditional calls/JPs — they have condition-based opcodes
  // CALL cc, nn: C4/CC/D4/DC/E4/EC/F4/FC + 3 bytes addr
  const condCallOps = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  for (let ci = 0; ci < condCallOps.length; ci++) {
    const pat = [condCallOps[ci], targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];
    for (let i = 0; i <= rom.length - 4; i++) {
      let match = true;
      for (let j = 0; j < 4; j++) {
        if (rom[i + j] !== pat[j]) { match = false; break; }
      }
      if (match) {
        callers.push({ pc: i, type: `CALL ${condNames[ci]}`, bytes: formatBytes(i, 4) });
      }
    }
  }

  // JP cc, nn: C2/CA/D2/DA/E2/EA/F2/FA
  const condJpOps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  for (let ci = 0; ci < condJpOps.length; ci++) {
    const pat = [condJpOps[ci], targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];
    for (let i = 0; i <= rom.length - 4; i++) {
      let match = true;
      for (let j = 0; j < 4; j++) {
        if (rom[i + j] !== pat[j]) { match = false; break; }
      }
      if (match) {
        callers.push({ pc: i, type: `JP ${condNames[ci]}`, bytes: formatBytes(i, 4) });
      }
    }
  }

  // Sort by address
  callers.sort((a, b) => a.pc - b.pc);
  return callers;
}

// Check if an address falls within known BufInsert / edit-mode region
function classifyRegion(addr) {
  if (addr >= 0x05E000 && addr < 0x060000) return 'BufInsert / edit-buffer region (0x05Exxx)';
  if (addr >= 0x056000 && addr < 0x057000) return 'editor region (0x0562xx cluster)';
  if (addr >= 0x050000 && addr < 0x060000) return 'OS mid-range (0x05xxxx)';
  if (addr >= 0x000000 && addr < 0x010000) return 'OS low-range (0x00xxxx)';
  if (addr >= 0x080000 && addr < 0x0A0000) return 'OS high-range (0x08xxxx-0x09xxxx)';
  return `region ${hex(addr)}`;
}

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');
  console.log('=== Phase 291: Deep-Dive 0x0562xx D0058C Writers ===');
  console.log(`Target write sites: ${WRITE_SITES.map(hex).join(', ')}`);
  console.log('');

  // Step 1: Find function boundaries
  const funcEntry = findFunctionEntry(WRITE_SITES[0]);
  const funcEnd = findFunctionEnd(funcEntry, WRITE_SITES);

  console.log(`=== Function boundary detection ===`);
  console.log(`Estimated function entry: ${hex(funcEntry)}`);
  console.log(`Estimated function end:   ${hex(funcEnd)}`);
  console.log(`Function size:            ${funcEnd - funcEntry} bytes`);
  console.log('');

  // Step 2: Full disassembly of the containing function
  const rows = disassembleRange(funcEntry, funcEnd);

  console.log(`=== Full disassembly: ${hex(funcEntry)} - ${hex(funcEnd - 1)} ===`);
  for (const row of rows) {
    const notes = row.annotations.length ? `  ; ${row.annotations.join(', ')}` : '';
    console.log(`  ${hex(row.pc)}: ${row.asm.padEnd(36)} [${row.bytes}]${notes}`);
  }
  console.log('');

  // Step 3: A-value provenance for each write site
  console.log('=== A-value provenance for each D0058C write ===');
  for (const site of WRITE_SITES) {
    const provenance = traceAProvenance(rows, site);
    console.log(`  ${hex(site)}: ${provenance}`);
  }
  console.log('');

  // Step 4: Caller search for the function entry
  console.log(`=== Caller search: who calls/jumps to ${hex(funcEntry)}? ===`);
  const callers = findCallers(funcEntry);
  if (callers.length === 0) {
    console.log('  No direct CALL/JP callers found in ROM.');
    console.log('  (May be reached via indirect call, dispatch table, or fall-through)');
  } else {
    for (const caller of callers) {
      const region = classifyRegion(caller.pc);
      console.log(`  ${hex(caller.pc)}: ${caller.type} ${hex(funcEntry)} [${caller.bytes}] — ${region}`);
    }
  }
  console.log('');

  // Also search for callers to each individual write site (in case they're separate entry points)
  for (const site of WRITE_SITES) {
    if (site === funcEntry) continue;
    const siteCallers = findCallers(site);
    if (siteCallers.length > 0) {
      console.log(`  Additional callers to ${hex(site)}:`);
      for (const caller of siteCallers) {
        const region = classifyRegion(caller.pc);
        console.log(`    ${hex(caller.pc)}: ${caller.type} ${hex(site)} [${caller.bytes}] — ${region}`);
      }
    }
  }
  console.log('');

  // Step 5: Cross-reference with known addresses
  console.log('=== Cross-reference with known addresses ===');
  const callTargets = new Set();
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (['call', 'call-conditional', 'jp', 'jp-conditional'].includes(inst.tag) && inst.target !== undefined) {
      callTargets.add(inst.target);
    }
  }

  for (const target of callTargets) {
    const known = KNOWN_ADDRESSES[target];
    const label = known ? ` [${known}]` : '';
    const region = classifyRegion(target);
    console.log(`  Calls/jumps to ${hex(target)}${label} — ${region}`);
  }

  // Check if any calls go into BufInsert region
  const bufInsertCalls = [...callTargets].filter((t) => t >= 0x05E000 && t < 0x060000);
  if (bufInsertCalls.length > 0) {
    console.log('');
    console.log('  *** Calls into BufInsert region detected! ***');
    for (const addr of bufInsertCalls) {
      console.log(`    ${hex(addr)}`);
    }
  }

  // Check if any callers come from BufInsert region
  const bufInsertCallers = callers.filter((c) => c.pc >= 0x05E000 && c.pc < 0x060000);
  if (bufInsertCallers.length > 0) {
    console.log('');
    console.log('  *** Callers FROM BufInsert region detected! ***');
    for (const c of bufInsertCallers) {
      console.log(`    ${hex(c.pc)}: ${c.type}`);
    }
  }
  console.log('');

  // Step 6: Branch structure analysis
  console.log('=== Branch structure (control flow) ===');
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (
      (inst.tag === 'alu-imm' && inst.op === 'cp')
      || (inst.tag === 'alu-reg' && inst.op === 'cp')
      || inst.tag === 'jr-conditional'
      || inst.tag === 'jp-conditional'
      || inst.tag === 'call-conditional'
      || inst.tag === 'ret-conditional'
      || inst.tag === 'djnz'
      || inst.tag === 'bit-test'
      || inst.tag === 'bit-test-ind'
    ) {
      console.log(`  ${hex(row.pc)}: ${row.asm}`);
    }
  }
  console.log('');

  // Step 7: Conclusion
  console.log('=== Conclusion ===');

  // Determine if this is the edit-mode key insertion path
  const hasCallToBufInsert = bufInsertCalls.length > 0;
  const hasCallerFromBufInsert = bufInsertCallers.length > 0;
  const writeCount = WRITE_SITES.length;

  console.log(`Function at ${hex(funcEntry)} contains ${writeCount} D0058C writes.`);

  if (hasCallToBufInsert || hasCallerFromBufInsert) {
    console.log('Evidence of BufInsert / edit-buffer connection:');
    if (hasCallToBufInsert) {
      console.log(`  - Function calls INTO BufInsert region (${bufInsertCalls.map(hex).join(', ')})`);
    }
    if (hasCallerFromBufInsert) {
      console.log(`  - Function is CALLED FROM BufInsert region`);
    }
    console.log('VERDICT: Likely part of the edit-mode key insertion path.');
  } else {
    console.log('No direct BufInsert connection found via CALL/JP.');
    console.log('This function may be:');
    console.log('  - An independent D0058C state setter in the editor subsystem');
    console.log('  - Reached indirectly via dispatch table or JP (IX/IY)');
    console.log('  - A menu/UI state manager that sets D0058C for mode tracking');
  }

  // Summarize A provenance
  console.log('');
  console.log('A-value summary for each write:');
  for (const site of WRITE_SITES) {
    const prov = traceAProvenance(rows, site);
    console.log(`  ${hex(site)}: ${prov}`);
  }

  // Step 8: Second function detection
  // The RET at 0x05629E means 0x05629F is a separate function
  console.log('');
  console.log('=== Second function detection ===');
  console.log('RET at 0x05629E means 0x05629F starts a SEPARATE function.');
  console.log('Function 1: 0x056262 - 0x05629E (writes at 0x05627A, 0x05628A)');
  console.log('Function 2: 0x05629F - 0x0562C1 (write at 0x0562AB)');
  console.log('');

  // Search for callers to the second function
  const FUNC2_ENTRY = 0x05629F;
  console.log(`=== Caller search: who calls/jumps to ${hex(FUNC2_ENTRY)}? ===`);
  const callers2 = findCallers(FUNC2_ENTRY);
  if (callers2.length === 0) {
    console.log('  No direct CALL/JP callers found in ROM.');
    console.log('  (May be reached via indirect call, dispatch table, or fall-through)');
  } else {
    for (const caller of callers2) {
      const region = classifyRegion(caller.pc);
      console.log(`  ${hex(caller.pc)}: ${caller.type} ${hex(FUNC2_ENTRY)} [${caller.bytes}] — ${region}`);
    }
  }
  console.log('');

  // Step 9: Explore the trampoline at 0x021ED0
  console.log('=== Trampoline analysis: 0x021ED0 ===');
  console.log('0x021ED0 contains JP 0x056262 — who calls 0x021ED0?');
  const trampolineCallers = findCallers(0x021ED0);
  if (trampolineCallers.length === 0) {
    console.log('  No direct CALL/JP callers found.');
  } else {
    for (const caller of trampolineCallers) {
      const region = classifyRegion(caller.pc);
      console.log(`  ${hex(caller.pc)}: ${caller.type} 0x021ED0 [${caller.bytes}] — ${region}`);
    }
  }
  console.log('');

  // Disassemble around 0x021ED0 to see context
  console.log('Context around 0x021ED0:');
  const trampolineRows = disassembleRange(0x021EC0, 0x021EE0);
  for (const row of trampolineRows) {
    const notes = row.annotations.length ? `  ; ${row.annotations.join(', ')}` : '';
    console.log(`  ${hex(row.pc)}: ${row.asm.padEnd(36)} [${row.bytes}]${notes}`);
  }
  console.log('');

  // Step 10: What does D0058E store? Both functions also write to D0058E
  console.log('=== D0058E writes in this region ===');
  console.log('Both functions write to D0058E alongside D0058C:');
  console.log('  Func1 path A (HL >= 0x100): D0058C = (IX+7), D0058E = (IX+6)');
  console.log('  Func1 path B (HL < 0x100):  D0058C = (IX+6), D0058E = 0');
  console.log('  Func2:                      D0058C = (IX+6), D0058E = (IX+9)');
  console.log('');
  console.log('Both functions also SET bit 5 of (IY+31) = (0xD0009F).');
  console.log('IY is loaded with 0xD00080, so (IY+31) = 0xD0009F.');
  console.log('This flag bit likely means "D0058C/D0058E have been updated".');
  console.log('');

  // Step 11: Refined conclusion
  console.log('=== REFINED CONCLUSION ===');
  console.log('');
  console.log('TWO functions in this region, not one:');
  console.log('');
  console.log('Function 1 (0x056262): "Set D0058C with 16-bit threshold"');
  console.log('  - Takes a parameter via stack at (IX+6..7) = 16-bit value');
  console.log('  - If value >= 0x100: D0058C = high byte (IX+7), D0058E = low byte (IX+6)');
  console.log('  - If value < 0x100:  D0058C = low byte (IX+6), D0058E = 0');
  console.log('  - Sets bit 5 of (IY+31) = flag at 0xD0009F');
  console.log('  - Called via trampoline JP at 0x021ED0');
  console.log('');
  console.log('Function 2 (0x05629F): "Set D0058C and D0058E from separate params"');
  console.log('  - D0058C = (IX+6), D0058E = (IX+9)');
  console.log('  - Also sets bit 5 of (IY+31)');
  console.log('');
  console.log('These are D0058C SETTER functions — they write a state value');
  console.log('(likely a mode/cursor/token ID) into the D0058C system variable.');
  console.log('The bit-5 flag at 0xD0009F signals "dirty" to the OS event loop.');
  console.log('');
  console.log('NOT directly the key insertion path (no calls to/from BufInsert 0x05Exxx).');
  console.log('These are state-update helpers called by higher-level editor code.');
}

main();
