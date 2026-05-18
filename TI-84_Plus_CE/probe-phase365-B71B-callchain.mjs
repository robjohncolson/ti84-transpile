#!/usr/bin/env node

/**
 * Phase 365: Investigate 0x00B71B — call chain, purpose, and the partial write to 0xD14097.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase365-B71B-callchain.mjs
 *
 * This probe:
 *   1. Disassembles the region around 0x00B71B to understand the function.
 *   2. Scans the entire ROM for CALL/JP to 0x00B71B.
 *   3. Disassembles context around each caller.
 *   4. Identifies which instruction writes the 0x01 byte to 0xD14097.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

// --- helpers ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(buffer, start, length) {
  const safeStart = start & 0xFFFFFF;
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.subarray(safeStart, safeEnd), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const mp = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${mp}NOP`;
    case 'di': return `${mp}DI`;
    case 'ei': return `${mp}EI`;
    case 'ret': return `${mp}RET`;
    case 'reti': return `${mp}RETI`;
    case 'retn': return `${mp}RETN`;
    case 'ret-conditional': return `${mp}RET ${String(inst.condition).toUpperCase()}`;
    case 'call': return `${mp}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${mp}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${mp}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${mp}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${mp}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${mp}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${mp}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `${mp}RST ${hex(inst.target ?? 0, 2)}`;
    case 'push': return `${mp}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${mp}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${mp}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-sp-hl': return `${mp}LD SP, HL`;
    case 'ld-sp-pair': return `${mp}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-reg':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-ind':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${mp}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-reg':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-imm':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'ld-indexed-pair':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${mp}LD ${String(inst.pair).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-ixiy':
      return `${mp}LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `${mp}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`;
    case 'lea':
      return `${mp}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${signedDisp(inst.displacement)}`;
    case 'add-pair':
      return `${mp}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${mp}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${mp}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'ex-sp-hl': return `${mp}EX (SP), HL`;
    case 'ex-sp-pair': return `${mp}EX (SP), ${String(inst.pair).toUpperCase()}`;
    case 'ex-de-hl': return `${mp}EX DE, HL`;
    case 'ex-af': return `${mp}EX AF, AF'`;
    case 'ld-mem-a': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD (${hex(addr)}), A`;
    }
    case 'ld-a-mem': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD A, (${hex(addr)})`;
    }
    case 'ld-mem-pair': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD (${hex(addr)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-pair-mem': {
      const addr = inst.address ?? inst.target ?? inst.value;
      return `${mp}LD ${String(inst.pair).toUpperCase()}, (${hex(addr)})`;
    }
    default: {
      const extras = Object.entries(inst)
        .filter(([key]) => !['tag', 'pc', 'nextPc', 'length', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key))
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value, value > 0xFF ? 6 : 2) : String(value)}`)
        .join(' ');
      return `${mp}${extras ? `${inst.tag} ${extras}` : inst.tag}`;
    }
  }
}

function disassembleWindow(romBytes, startPc, maxBytes, mode = 'adl') {
  const rows = [];
  const endPc = Math.min(romBytes.length, startPc + maxBytes);
  let pc = startPc;

  while (pc < endPc) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: inst ? formatInstruction(inst) : `DB ${hb(romBytes[pc])}`,
      inst,
    });
    pc += length;
  }

  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');
}

// --- ROM byte pattern search ---

function searchPattern(romBytes, pattern, maxAddr = 0x400000) {
  const results = [];
  const limit = Math.min(romBytes.length, maxAddr) - pattern.length;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (romBytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      results.push(i);
    }
  }
  return results;
}

// --- find function entry ---

function findFunctionEntry(romBytes, targetPc, mode = 'adl') {
  // Walk backwards looking for a RET (0xC9) or another function terminator,
  // then the byte after it is likely a function entry.
  // Also check if targetPc itself looks like a function entry.
  const scanBack = 128;
  const startScan = Math.max(0, targetPc - scanBack);

  // Disassemble forward from various candidate start points
  // and see which ones land exactly on targetPc
  const candidates = [];

  for (let candidateStart = startScan; candidateStart < targetPc; candidateStart++) {
    // Check if the byte before candidateStart is a RET or unconditional JP
    if (candidateStart > 0) {
      const prevByte = romBytes[candidateStart - 1];
      if (prevByte === 0xC9) { // RET
        candidates.push(candidateStart);
      }
    }
  }

  return candidates;
}

function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('Phase 365: Investigate 0x00B71B Call Chain and Purpose');
  console.log('======================================================');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');

  // =============================================
  // PART 1: Disassemble the region around 0x00B71B
  // =============================================
  console.log('=== PART 1: DISASSEMBLY OF 0x00B71B REGION ===');
  console.log('');

  // First, look for function boundaries by scanning back for RET
  console.log('Scanning backward from 0x00B71B for RET (function boundary)...');
  for (let addr = 0x00B71A; addr >= 0x00B700; addr--) {
    if (romBytes[addr] === 0xC9) {
      console.log(`  Found RET at ${hex(addr)} => likely function entry at ${hex(addr + 1)}`);
    }
  }
  console.log('');

  // Wide context: 0x00B700 - 0x00B780
  printDisassembly(
    'Disassembly 0x00B700 - 0x00B780 (wide context)',
    disassembleWindow(romBytes, 0x00B700, 0x80, 'adl'),
  );

  // Narrower focus on 0x00B71B itself
  printDisassembly(
    'Disassembly 0x00B71B - 0x00B760 (from target address)',
    disassembleWindow(romBytes, 0x00B71B, 0x45, 'adl'),
  );

  // =============================================
  // PART 2: Find all CALL/JP to 0x00B71B in ROM
  // =============================================
  console.log('=== PART 2: STATIC ROM SCAN FOR CALLERS ===');
  console.log('');

  // CALL 0x00B71B = CD 1B B7 00
  const callPattern = [0xCD, 0x1B, 0xB7, 0x00];
  const callSites = searchPattern(romBytes, callPattern);
  console.log(`CALL 0x00B71B (CD 1B B7 00): ${callSites.length} hit(s)`);
  for (const addr of callSites) {
    console.log(`  ${hex(addr)}  ${bytesAt(romBytes, addr, 4)}`);
  }
  console.log('');

  // JP 0x00B71B = C3 1B B7 00
  const jpPattern = [0xC3, 0x1B, 0xB7, 0x00];
  const jpSites = searchPattern(romBytes, jpPattern);
  console.log(`JP 0x00B71B (C3 1B B7 00): ${jpSites.length} hit(s)`);
  for (const addr of jpSites) {
    console.log(`  ${hex(addr)}  ${bytesAt(romBytes, addr, 4)}`);
  }
  console.log('');

  // Also search for JP CC variants (conditional jumps)
  // JP cc, nn: C2/CA/D2/DA/E2/EA/F2/FA followed by 1B B7 00
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const condJpSuffix = [0x1B, 0xB7, 0x00];
  const condJpSites = [];
  for (const opcode of condJpOpcodes) {
    const pattern = [opcode, ...condJpSuffix];
    const hits = searchPattern(romBytes, pattern);
    for (const addr of hits) {
      condJpSites.push({ addr, opcode });
    }
  }
  if (condJpSites.length > 0) {
    console.log(`Conditional JP to 0x00B71B: ${condJpSites.length} hit(s)`);
    for (const { addr, opcode } of condJpSites) {
      console.log(`  ${hex(addr)}  ${bytesAt(romBytes, addr, 4)}  (opcode ${hb(opcode)})`);
    }
    console.log('');
  }

  // Also search for CALL CC variants
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condCallSites = [];
  for (const opcode of condCallOpcodes) {
    const pattern = [opcode, ...condJpSuffix];
    const hits = searchPattern(romBytes, pattern);
    for (const addr of hits) {
      condCallSites.push({ addr, opcode });
    }
  }
  if (condCallSites.length > 0) {
    console.log(`Conditional CALL to 0x00B71B: ${condCallSites.length} hit(s)`);
    for (const { addr, opcode } of condCallSites) {
      console.log(`  ${hex(addr)}  ${bytesAt(romBytes, addr, 4)}  (opcode ${hb(opcode)})`);
    }
    console.log('');
  }

  // =============================================
  // PART 3: Disassemble context around each caller
  // =============================================
  console.log('=== PART 3: CALLER CONTEXT DISASSEMBLY ===');
  console.log('');

  const allCallerAddrs = [
    ...callSites.map((addr) => ({ addr, type: 'CALL' })),
    ...jpSites.map((addr) => ({ addr, type: 'JP' })),
    ...condJpSites.map(({ addr, opcode }) => ({ addr, type: `JP cc (${hb(opcode)})` })),
    ...condCallSites.map(({ addr, opcode }) => ({ addr, type: `CALL cc (${hb(opcode)})` })),
  ];

  for (const { addr, type } of allCallerAddrs) {
    const contextBefore = Math.max(0, addr - 24);
    const contextLength = 24 + 4 + 24; // 24 before, 4 for the instruction, 24 after
    printDisassembly(
      `${type} 0x00B71B at ${hex(addr)} (context ${hex(contextBefore)} - ${hex(contextBefore + contextLength)})`,
      disassembleWindow(romBytes, contextBefore, contextLength, 'adl'),
    );
  }

  // =============================================
  // PART 4: Analyze the write to 0xD14097
  // =============================================
  console.log('=== PART 4: TRACE WRITES TO 0xD14097 ===');
  console.log('');

  // Look for the address 0xD14097 in the ROM near 0x00B71B
  // In LE: 97 40 D1
  const addrPattern = [0x97, 0x40, 0xD1];
  console.log('Scanning ROM for references to address 0xD14097 (bytes 97 40 D1):');
  const addrHits = searchPattern(romBytes, addrPattern);
  for (const addr of addrHits) {
    // Show a few bytes before to identify the instruction
    const contextStart = Math.max(0, addr - 4);
    console.log(`  ${hex(addr)}: context bytes = ${bytesAt(romBytes, contextStart, 12)}`);
  }
  console.log('');

  // Also look for 0xD14095 (the full 3-byte base address)
  const addr95Pattern = [0x95, 0x40, 0xD1];
  console.log('Scanning ROM for references to address 0xD14095 (bytes 95 40 D1):');
  const addr95Hits = searchPattern(romBytes, addr95Pattern);
  for (const addr of addr95Hits) {
    const contextStart = Math.max(0, addr - 4);
    console.log(`  ${hex(addr)}: context bytes = ${bytesAt(romBytes, contextStart, 12)}`);
  }
  console.log('');

  // And 0xD14096
  const addr96Pattern = [0x96, 0x40, 0xD1];
  console.log('Scanning ROM for references to address 0xD14096 (bytes 96 40 D1):');
  const addr96Hits = searchPattern(romBytes, addr96Pattern);
  for (const addr of addr96Hits) {
    const contextStart = Math.max(0, addr - 4);
    console.log(`  ${hex(addr)}: context bytes = ${bytesAt(romBytes, contextStart, 12)}`);
  }
  console.log('');

  // Now check for IX-relative addressing that could reach 0xD14097.
  // If IX = 0xD140B3 (the frame pointer observed in phase 364), then:
  //   0xD14097 = IX - 28 (0x1C)
  //   0xD14095 = IX - 30 (0x1E)
  //   0xD14096 = IX - 29 (0x1D)
  console.log('Checking for IX-relative writes near 0x00B71B:');
  console.log('  If IX = 0xD140B3, then:');
  console.log('    0xD14095 = IX - 30 (0x1E)');
  console.log('    0xD14096 = IX - 29 (0x1D)');
  console.log('    0xD14097 = IX - 28 (0x1C)');
  console.log('');

  // Scan the disassembly of 0x00B71B for IX-relative stores
  console.log('IX-relative instructions in 0x00B700 - 0x00B780:');
  const rows = disassembleWindow(romBytes, 0x00B700, 0x80, 'adl');
  for (const row of rows) {
    if (!row.inst) continue;
    const tag = row.inst.tag;
    // Look for any IX-related instruction
    if (tag.includes('ix') || tag.includes('indexed') ||
        (row.inst.indexRegister && String(row.inst.indexRegister).toLowerCase() === 'ix')) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
      if (row.inst.displacement !== undefined) {
        console.log(`    displacement = ${signedDisp(row.inst.displacement)} (${row.inst.displacement >= 0 ? hex(row.inst.displacement, 2) : '-' + hex(-row.inst.displacement, 2)})`);
        if (row.inst.displacement === -28 || row.inst.displacement === -30 || row.inst.displacement === -29) {
          console.log(`    ** This targets 0xD140${(0xB3 + row.inst.displacement) & 0xFF < 16 ? '0' : ''}${((0xB3 + row.inst.displacement) & 0xFF).toString(16).toUpperCase()} when IX=0xD140B3 **`);
        }
      }
    }
  }
  console.log('');

  // Also check broader range 0x00B680 - 0x00B7FF for IX writes
  console.log('IX-relative instructions in wider range 0x00B680 - 0x00B7FF:');
  const wideRows = disassembleWindow(romBytes, 0x00B680, 0x180, 'adl');
  for (const row of wideRows) {
    if (!row.inst) continue;
    const tag = row.inst.tag;
    if (tag.includes('ix') || tag.includes('indexed') ||
        (row.inst.indexRegister && String(row.inst.indexRegister).toLowerCase() === 'ix')) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
      if (row.inst.displacement !== undefined) {
        console.log(`    displacement = ${signedDisp(row.inst.displacement)}`);
      }
    }
  }
  console.log('');

  // =============================================
  // PART 5: Look for the specific byte 0x01 write
  // =============================================
  console.log('=== PART 5: IDENTIFY THE 0x01 BYTE WRITE ===');
  console.log('');

  // The context says 0x00B71B writes only the high byte (0x01) to 0xD14097.
  // Look for LD A, 0x01 (3E 01) or LD (IX+d), 0x01 patterns near 0x00B71B
  console.log('Instructions near 0x00B71B that load or store value 0x01:');
  const nearRows = disassembleWindow(romBytes, 0x00B700, 0xC0, 'adl');
  for (const row of nearRows) {
    if (!row.inst) continue;
    const v = row.inst.value;
    if (v === 0x01 || v === 0x0001 || v === 0x000001) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
    }
    // Also check for LD A, 1 followed by LD (addr), A patterns
    if (row.inst.tag === 'ld-reg-imm' && row.inst.dest === 'a' && row.inst.value === 0x01) {
      console.log(`    ^ LD A, 0x01 — A register loaded with 1`);
    }
  }
  console.log('');

  // =============================================
  // PART 6: Extended function analysis
  // =============================================
  console.log('=== PART 6: EXTENDED FUNCTION ANALYSIS ===');
  console.log('');

  // Try to find the complete function containing 0x00B71B
  // Walk back to find a PUSH or function prologue
  console.log('Looking for function prologue near 0x00B71B...');
  const prologueRows = disassembleWindow(romBytes, 0x00B690, 0xD0, 'adl');
  for (const row of prologueRows) {
    if (!row.inst) continue;
    if (row.inst.tag === 'push' || row.inst.tag === 'pop' || row.inst.tag === 'ret' ||
        row.inst.tag === 'call' || row.inst.tag === 'jp') {
      const marker = row.pc <= 0x00B71B ? '<=' : '  ';
      console.log(`  ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
    }
  }
  console.log('');

  // Check what's at 0x00BC47 and 0x00BC72 for reference (the linked-list consumer)
  console.log('For reference: Linked-list consumer 0x00BC47 - 0x00BC80');
  printDisassembly(
    'Disassembly 0x00BC30 - 0x00BC80',
    disassembleWindow(romBytes, 0x00BC30, 0x50, 'adl'),
  );

  // =============================================
  // PART 7: Summary analysis
  // =============================================
  console.log('=== PART 7: SUMMARY ===');
  console.log('');

  console.log('Callers found:');
  console.log(`  CALL 0x00B71B: ${callSites.length} site(s) at ${callSites.map(hex).join(', ') || '(none)'}`);
  console.log(`  JP 0x00B71B:   ${jpSites.length} site(s) at ${jpSites.map(hex).join(', ') || '(none)'}`);
  console.log(`  Cond JP:       ${condJpSites.length} site(s)`);
  console.log(`  Cond CALL:     ${condCallSites.length} site(s)`);
  console.log('');

  console.log('Address references found in ROM:');
  console.log(`  0xD14095 refs: ${addr95Hits.length} at ${addr95Hits.map(hex).join(', ') || '(none)'}`);
  console.log(`  0xD14096 refs: ${addr96Hits.length} at ${addr96Hits.map(hex).join(', ') || '(none)'}`);
  console.log(`  0xD14097 refs: ${addrHits.length} at ${addrHits.map(hex).join(', ') || '(none)'}`);
  console.log('');
}

main();
