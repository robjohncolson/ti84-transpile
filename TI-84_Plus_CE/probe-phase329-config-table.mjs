#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);

const TABLE_BASE = 0x0525D4;
const TABLE_STRIDE = 12;
const TABLE_ENTRIES = 3;
const TABLE_END = TABLE_BASE + TABLE_ENTRIES * TABLE_STRIDE; // 0x0525F8
const TARGET_FUNC = 0x055316;
const CALLER_CONTINUATION = 0x0551B1;

// Known LCD state RAM addresses from session 327/328
const KNOWN_LCD_RAM = {
  0xD005E9: 'descriptor pointer (set by 0x055316)',
  0xD005EC: 'rendering param 1',
  0xD005ED: 'rendering param 2',
  0xD005F0: 'rendering param 3',
  0xD005F4: 'rendering param 4',
  0xD02FD6: 'clip param 1',
  0xD02FD9: 'clip param 2',
  0xD02FDC: 'clip param 3',
  0xD02FE0: 'stride (640 for 320x240 at 16bpp)',
  0xD02FE3: 'VRAM base (0xD40000)',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function read16(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${disp})`;
    }
    case 'ld-indexed-pair': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${disp}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-indexed-reg': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${disp}), ${String(inst.src ?? inst.reg).toUpperCase()}`;
    }
    case 'ld-reg-indexed': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD ${String(inst.dest ?? inst.reg).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${disp})`;
    }
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest ?? inst.reg).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.indirectRegister ?? 'HL').toUpperCase()}), ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest ?? inst.reg).toUpperCase()}, (${String(inst.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'ex':
      return `${prefix}EX ${String(inst.left ?? '').toUpperCase()}, ${String(inst.right ?? '').toUpperCase()}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'nop':
      return `${prefix}NOP`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'or-a':
      return `${prefix}OR A`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-reset':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) text += ` target=${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` value=${hex(inst.value)}`;
      if (inst.addr !== undefined) text += ` addr=${hex(inst.addr)}`;
      if (inst.pair !== undefined) text += ` pair=${inst.pair}`;
      if (inst.dest !== undefined) text += ` dest=${inst.dest}`;
      if (inst.src !== undefined) text += ` src=${inst.src}`;
      if (inst.reg !== undefined) text += ` reg=${inst.reg}`;
      if (inst.displacement !== undefined) text += ` disp=${inst.displacement}`;
      if (inst.indexRegister !== undefined) text += ` idx=${inst.indexRegister}`;
      return text;
    }
  }
}

function formatBytesFor(inst) {
  return bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length));
}

// ============================
// Section 1: Hex dump of config table
// ============================
function printTableHexDump() {
  console.log('=== Phase 329: Config Table Decode (0x0525D4) ===\n');
  console.log('1) Raw hex dump of config table (36 bytes: 0x0525D4 - 0x0525F7)\n');

  const tableBytes = rom.subarray(TABLE_BASE, TABLE_END);
  console.log(`  Full dump: ${bytesToHex(tableBytes)}\n`);

  for (let i = 0; i < TABLE_ENTRIES; i++) {
    const base = TABLE_BASE + i * TABLE_STRIDE;
    const entryBytes = rom.subarray(base, base + TABLE_STRIDE);
    console.log(`  Entry ${i} @ ${hex(base)}: ${bytesToHex(entryBytes)}`);

    // Show as 4 x 3-byte (24-bit LE) fields
    const f0 = read24(rom, base);
    const f1 = read24(rom, base + 3);
    const f2 = read24(rom, base + 6);
    const f3 = read24(rom, base + 9);
    console.log(`    field[0] (bytes +0..+2): ${hex(f0)}`);
    console.log(`    field[1] (bytes +3..+5): ${hex(f1)}`);
    console.log(`    field[2] (bytes +6..+8): ${hex(f2)}`);
    console.log(`    field[3] (bytes +9..+11): ${hex(f3)}`);

    // Also show as mixed: 2-byte fields possibility
    const w0 = read16(rom, base);
    const w1 = read16(rom, base + 2);
    const w2 = read16(rom, base + 4);
    const w3 = read16(rom, base + 6);
    const w4 = read16(rom, base + 8);
    const w5 = read16(rom, base + 10);
    console.log(`    as 16-bit words: ${hex(w0, 4)} ${hex(w1, 4)} ${hex(w2, 4)} ${hex(w3, 4)} ${hex(w4, 4)} ${hex(w5, 4)}`);

    // Individual bytes
    const byteVals = Array.from(entryBytes);
    console.log(`    individual bytes: ${byteVals.map((b, idx) => `+${idx}=${hexByte(b)}`).join(' ')}`);
    console.log('');
  }
}

// ============================
// Section 2: Disassemble caller continuation at 0x0551B1
// ============================
function printCallerContinuation() {
  console.log('2) Caller continuation disassembly at 0x0551B1\n');
  console.log('   This code runs after 0x055316 returns. It reads from the config');
  console.log('   descriptor pointer (D005E9) and writes LCD state variables.\n');

  let pc = CALLER_CONTINUATION;
  const maxInstructions = 80;
  let count = 0;
  const fieldReads = [];  // track reads from descriptor via IX/HL offsets
  const ramWrites = [];   // track writes to LCD RAM addresses

  while (pc < rom.length && count < maxInstructions) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      console.log(`  ${hex(pc)}: (decode error)`);
      break;
    }

    const bytes = formatBytesFor(inst).padEnd(24);
    const text = formatInstruction(inst);
    let annotation = '';

    // Annotate known RAM addresses
    if (inst.addr !== undefined && KNOWN_LCD_RAM[inst.addr]) {
      annotation = ` ; ${KNOWN_LCD_RAM[inst.addr]}`;
    }

    // Track indexed reads (IX+N or IY+N patterns)
    if (inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-reg-indexed') {
      const disp = inst.displacement;
      if (disp !== undefined) {
        fieldReads.push({ pc: inst.pc, register: inst.indexRegister, offset: disp, dest: inst.pair || inst.dest });
        annotation += ` ; reads config field at offset ${disp}`;
      }
    }

    // Track indirect reads via HL
    if (inst.tag === 'ld-reg-ind') {
      annotation += ' ; reads via indirect register';
    }

    // Track RAM writes
    if ((inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' ||
         (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')) && inst.addr !== undefined) {
      if (inst.addr >= 0xD00000 && inst.addr < 0xE00000) {
        ramWrites.push({ pc: inst.pc, addr: inst.addr, tag: inst.tag });
      }
    }

    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}${annotation}`);

    // Stop at RET or if we go too far
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      break;
    }

    // Stop at unconditional JP to far target (function boundary)
    if (inst.tag === 'jp' && inst.target !== undefined && Math.abs(inst.target - pc) > 0x200) {
      console.log('  (far jump - likely function boundary)');
      break;
    }

    pc = nextPc(inst);
    count++;
  }

  console.log('\n  Summary of indexed field reads:');
  if (fieldReads.length === 0) {
    console.log('    none detected');
  } else {
    for (const r of fieldReads) {
      console.log(`    ${hex(r.pc)}: ${String(r.dest).toUpperCase()} <- (${String(r.register).toUpperCase()}+${r.offset}) ; config table byte offset ${r.offset}`);
    }
  }

  console.log('\n  Summary of RAM writes:');
  if (ramWrites.length === 0) {
    console.log('    none detected');
  } else {
    for (const w of ramWrites) {
      const label = KNOWN_LCD_RAM[w.addr] || 'unknown';
      console.log(`    ${hex(w.pc)}: -> ${hex(w.addr)} (${label})`);
    }
  }

  console.log('');
}

// ============================
// Section 3: Scan ROM for callers of 0x055316
// ============================
function scanRomForCallers() {
  console.log('3) ROM callers of 0x055316\n');

  // eZ80 ADL CALL nn = CD ll mm hh (4 bytes in ADL mode)
  // Target 0x055316 -> bytes: 16 53 05
  const targetLow = TARGET_FUNC & 0xFF;         // 0x16
  const targetMid = (TARGET_FUNC >> 8) & 0xFF;  // 0x53
  const targetHigh = (TARGET_FUNC >> 16) & 0xFF; // 0x05

  const callers = [];

  for (let i = 0; i < rom.length - 4; i++) {
    // CALL nn (unconditional) = 0xCD
    if (rom[i] === 0xCD && rom[i + 1] === targetLow && rom[i + 2] === targetMid && rom[i + 3] === targetHigh) {
      callers.push({ addr: i, type: 'CALL', bytes: bytesToHex(rom.subarray(i, i + 4)) });
    }

    // CALL cc,nn (conditional) = C4/CC/D4/DC/E4/EC/F4/FC
    const condCalls = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
    if (condCalls.includes(rom[i]) && rom[i + 1] === targetLow && rom[i + 2] === targetMid && rom[i + 3] === targetHigh) {
      const condIdx = condCalls.indexOf(rom[i]);
      const conds = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      callers.push({ addr: i, type: `CALL ${conds[condIdx]}`, bytes: bytesToHex(rom.subarray(i, i + 4)) });
    }

    // JP nn (unconditional) = 0xC3
    if (rom[i] === 0xC3 && rom[i + 1] === targetLow && rom[i + 2] === targetMid && rom[i + 3] === targetHigh) {
      callers.push({ addr: i, type: 'JP', bytes: bytesToHex(rom.subarray(i, i + 4)) });
    }

    // JP cc,nn (conditional) = C2/CA/D2/DA/E2/EA/F2/FA
    const condJps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
    if (condJps.includes(rom[i]) && rom[i + 1] === targetLow && rom[i + 2] === targetMid && rom[i + 3] === targetHigh) {
      const condIdx = condJps.indexOf(rom[i]);
      const conds = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      callers.push({ addr: i, type: `JP ${conds[condIdx]}`, bytes: bytesToHex(rom.subarray(i, i + 4)) });
    }
  }

  // Deduplicate (conditional call opcodes overlap with unconditional check)
  const seen = new Set();
  const unique = [];
  for (const c of callers) {
    if (!seen.has(c.addr)) {
      seen.add(c.addr);
      unique.push(c);
    }
  }

  console.log(`  Found ${unique.length} call/jump sites:\n`);

  for (const caller of unique) {
    // Try to find what argument is being passed by looking at the preceding instructions
    // The argument is pushed on the stack before the CALL
    // Look back for PUSH or LD + PUSH patterns
    let argInfo = 'unknown';
    const contextStart = Math.max(0, caller.addr - 30);

    // Decode a few instructions before the call to find the argument
    let scanPc = contextStart;
    const preInsts = [];
    while (scanPc < caller.addr) {
      const inst = decodeSafe(scanPc);
      if (!inst || !inst.length) {
        scanPc++;
        continue;
      }
      preInsts.push(inst);
      scanPc = nextPc(inst);
    }

    // Look for the last PUSH or LD pair-imm before the CALL
    for (let j = preInsts.length - 1; j >= 0 && j >= preInsts.length - 6; j--) {
      const pi = preInsts[j];
      if (pi.tag === 'ld-pair-imm') {
        argInfo = `${String(pi.pair).toUpperCase()} = ${hex(pi.value)} (may be pushed as arg)`;
        break;
      }
      if (pi.tag === 'push') {
        argInfo = `PUSH ${String(pi.pair ?? pi.src ?? '').toUpperCase()}`;
        // Check the instruction before for the value
        if (j > 0 && preInsts[j - 1].tag === 'ld-pair-imm') {
          const loadInst = preInsts[j - 1];
          argInfo = `arg = ${hex(loadInst.value)} (${String(loadInst.pair).toUpperCase()} loaded then pushed)`;
        }
        break;
      }
    }

    console.log(`  ${hex(caller.addr)}: ${caller.type} ${hex(TARGET_FUNC)}  [${caller.bytes}]`);
    console.log(`    preceding context: ${argInfo}`);

    // Show a few instructions before the call for context
    const contextInsts = preInsts.slice(-4);
    for (const ci of contextInsts) {
      const ciBytes = formatBytesFor(ci).padEnd(20);
      console.log(`      ${hex(ci.pc)}: ${ciBytes} ${formatInstruction(ci)}`);
    }
    console.log('');
  }
}

// ============================
// Section 4: Cross-reference table fields with LCD state
// ============================
function printFieldCrossReference() {
  console.log('4) Cross-reference: config table fields -> LCD state variables\n');

  // First, we need to trace the caller continuation more carefully.
  // The continuation at 0x0551B1 loads the descriptor pointer from D005E9 into IX (or HL),
  // then reads fields from it.

  // Let's trace what happens by looking at the instructions
  let pc = CALLER_CONTINUATION;
  const maxInsts = 80;
  let count = 0;

  // Track register state symbolically
  let ixSource = null;  // what IX points to
  let hlSource = null;  // what HL points to
  const mappings = [];  // field offset -> RAM address mappings

  console.log('  Tracing register flow from 0x0551B1:\n');

  while (pc < rom.length && count < maxInsts) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;

    // Track when IX or HL is loaded from the descriptor pointer address
    if ((inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem') || inst.tag === 'ld-pair-mem') {
      if (inst.addr === 0xD005E9) {
        const reg = String(inst.pair).toUpperCase();
        if (reg === 'IX') ixSource = 'config_descriptor';
        if (reg === 'HL') hlSource = 'config_descriptor';
        console.log(`  * ${hex(inst.pc)}: ${reg} <- (D005E9) = config descriptor pointer`);
      }
    }

    // Track indexed reads from config descriptor
    if ((inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-reg-indexed') && inst.indexRegister) {
      const idxReg = String(inst.indexRegister).toUpperCase();
      if ((idxReg === 'IX' && ixSource === 'config_descriptor') ||
          (idxReg === 'HL')) {
        // This reads from config table
      }
    }

    // Track writes to known LCD RAM after reading from descriptor
    if ((inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg' ||
         (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')) && inst.addr !== undefined) {
      if (inst.addr >= 0xD00000 && inst.addr < 0xE00000) {
        mappings.push({ pc: inst.pc, ramAddr: inst.addr, tag: inst.tag });
      }
    }

    if (inst.tag === 'ret') break;
    if (inst.tag === 'jp' && inst.target !== undefined && Math.abs(inst.target - pc) > 0x200) break;

    pc = nextPc(inst);
    count++;
  }

  console.log('\n  LCD state variable writes found in continuation:');
  for (const m of mappings) {
    const label = KNOWN_LCD_RAM[m.ramAddr] || 'unknown';
    console.log(`    ${hex(m.pc)}: -> ${hex(m.ramAddr)} (${label})`);
  }

  // Compare the 3 entries
  console.log('\n5) Comparison of the 3 config table entries\n');

  const entries = [];
  for (let i = 0; i < TABLE_ENTRIES; i++) {
    const base = TABLE_BASE + i * TABLE_STRIDE;
    entries.push({
      index: i,
      base,
      bytes: Array.from(rom.subarray(base, base + TABLE_STRIDE)),
      f24: [read24(rom, base), read24(rom, base + 3), read24(rom, base + 6), read24(rom, base + 9)],
      f16: [read16(rom, base), read16(rom, base + 2), read16(rom, base + 4),
            read16(rom, base + 6), read16(rom, base + 8), read16(rom, base + 10)],
    });
  }

  // Field-by-field comparison as 24-bit
  console.log('  As 4 x 24-bit fields:');
  console.log('  Offset   Entry 0       Entry 1       Entry 2');
  for (let f = 0; f < 4; f++) {
    const vals = entries.map((e) => hex(e.f24[f]).padEnd(14));
    const same = entries.every((e) => e.f24[f] === entries[0].f24[f]);
    console.log(`  +${(f * 3).toString().padEnd(2)}     ${vals.join('')}${same ? ' (same)' : ' (DIFFERS)'}`);
  }

  // Field-by-field comparison as 16-bit
  console.log('\n  As 6 x 16-bit fields:');
  console.log('  Offset   Entry 0    Entry 1    Entry 2');
  for (let f = 0; f < 6; f++) {
    const vals = entries.map((e) => hex(e.f16[f], 4).padEnd(11));
    const same = entries.every((e) => e.f16[f] === entries[0].f16[f]);
    console.log(`  +${(f * 2).toString().padEnd(2)}     ${vals.join('')}${same ? ' (same)' : ' (DIFFERS)'}`);
  }

  // Byte-by-byte comparison
  console.log('\n  Byte-by-byte comparison:');
  console.log('  Offset   Entry 0  Entry 1  Entry 2');
  for (let b = 0; b < TABLE_STRIDE; b++) {
    const vals = entries.map((e) => hexByte(e.bytes[b]).padEnd(9));
    const same = entries.every((e) => e.bytes[b] === entries[0].bytes[b]);
    console.log(`  +${b.toString().padEnd(2)}     ${vals.join('')}${same ? ' (same)' : ' (DIFFERS)'}`);
  }

  // Hypothesize meanings
  console.log('\n  Hypothesized field meanings (based on LCD params):');

  // Check if any 24-bit field looks like a VRAM address
  for (let i = 0; i < TABLE_ENTRIES; i++) {
    const e = entries[i];
    console.log(`\n  Entry ${i} @ ${hex(e.base)}:`);
    for (let f = 0; f < 4; f++) {
      const val = e.f24[f];
      let guess = '';
      if (val === 0xD40000) guess = 'VRAM base address';
      else if (val === 640 || val === 0x280) guess = 'stride = 640 (320 pixels x 2 bytes)';
      else if (val === 320 || val === 0x140) guess = 'width = 320 pixels';
      else if (val === 240 || val === 0xF0) guess = 'height = 240 pixels';
      else if (val === 160 || val === 0xA0) guess = 'half-height = 160 pixels (split screen?)';
      else if (val >= 0xD00000 && val < 0xE00000) guess = 'RAM address';
      else if (val >= 0x000000 && val < 0x400000 && val > 0x1000) guess = 'ROM address (code/data pointer)';
      else if (val < 1000) guess = `small integer (dimension/offset? decimal=${val})`;
      else guess = `decimal=${val}`;
      console.log(`    field[${f}] (+${f * 3}): ${hex(val)} -- ${guess}`);
    }

    // Also try 16-bit interpretations for display dimensions
    for (let f = 0; f < 6; f++) {
      const val = e.f16[f];
      if (val === 320 || val === 240 || val === 160 || val === 640) {
        console.log(`    16-bit field[${f}] (+${f * 2}): ${hex(val, 4)} = ${val} (LCD dimension)`);
      }
    }
  }
}

// ============================
// Section 5: Extended disassembly of continuation
// ============================
function printExtendedContinuation() {
  console.log('\n6) Extended disassembly: 0x0551B1 forward (continuation after 0x055316)\n');
  console.log('   Looking for LD IX/HL,(D005E9) followed by indexed reads and RAM writes.\n');

  // Also decode a bit before 0x0551B1 for context (the CALL 0x055316 should be nearby)
  const contextStart = 0x055190;
  let pc = contextStart;
  const maxDecode = 120;
  let count = 0;

  console.log(`  --- Context from ${hex(contextStart)} ---\n`);

  while (pc < rom.length && count < maxDecode) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      console.log(`  ${hex(pc)}: ?? (decode error at byte ${hexByte(rom[pc])})`);
      pc++;
      count++;
      continue;
    }

    const bytes = formatBytesFor(inst).padEnd(24);
    const text = formatInstruction(inst);
    let annotation = '';

    // Annotate known addresses
    if (inst.addr !== undefined && KNOWN_LCD_RAM[inst.addr]) {
      annotation = ` ; << ${KNOWN_LCD_RAM[inst.addr]} >>`;
    }
    if (inst.tag === 'call' && inst.target === TARGET_FUNC) {
      annotation = ' ; << CALL config_selector >>';
    }
    if (inst.pc === CALLER_CONTINUATION) {
      annotation += ' ; << CALLER CONTINUATION START >>';
    }

    // Annotate config table references
    if (inst.tag === 'ld-pair-imm' && inst.value === TABLE_BASE) {
      annotation += ` ; << config table base >>`;
    }

    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}${annotation}`);

    // Stop well past the continuation
    if (pc > CALLER_CONTINUATION + 0x100) break;
    if (inst.tag === 'ret' && pc > CALLER_CONTINUATION + 0x20) break;

    pc = nextPc(inst);
    count++;
  }
}

// ============================
// Main
// ============================

console.log(`ROM size: ${hex(rom.length, 8)} bytes\n`);

printTableHexDump();
printCallerContinuation();
scanRomForCallers();
printFieldCrossReference();
printExtendedContinuation();

// ============================
// Section 7: Decode LDIR source at 0x05550C (13 bytes -> D02FD9)
// ============================
function printLdirSource() {
  console.log('\n7) LDIR source data at 0x05550C (13 bytes copied to D02FD9..D02FE5)\n');
  console.log('   The continuation does LDIR with BC=13, DE=D02FD9, HL=0x05550C');
  console.log('   This copies 13 ROM bytes into the clipping/stride/VRAM region.\n');

  const src = 0x05550C;
  const len = 13;
  const srcBytes = rom.subarray(src, src + len);
  console.log(`  Raw bytes: ${bytesToHex(srcBytes)}\n`);

  // Map destination addresses
  const destBase = 0xD02FD9;
  const targets = {
    0xD02FD9: 'clip param 2',
    0xD02FDC: 'clip param 3',
    0xD02FDF: '(clip param 4?)',
    0xD02FE0: 'stride (expected 640)',
    0xD02FE3: 'VRAM base (expected 0xD40000)',
  };

  for (let i = 0; i < len; i++) {
    const destAddr = destBase + i;
    const label = targets[destAddr] || '';
    console.log(`  +${i.toString().padStart(2)}: ${hexByte(srcBytes[i])} -> ${hex(destAddr)} ${label}`);
  }

  // Decode as 24-bit values at known offsets
  console.log('\n  Decoded 24-bit values at target addresses:');
  // D02FD9 = bytes 0..2
  const d02fd9 = read24(srcBytes, 0);
  console.log(`    D02FD9 (clip param 2): ${hex(d02fd9)} = ${d02fd9} decimal`);
  // D02FDC = bytes 3..5
  const d02fdc = read24(srcBytes, 3);
  console.log(`    D02FDC (clip param 3): ${hex(d02fdc)} = ${d02fdc} decimal`);
  // D02FDF = bytes 6..8
  const d02fdf = read24(srcBytes, 6);
  console.log(`    D02FDF: ${hex(d02fdf)} = ${d02fdf} decimal`);
  // D02FE0 is at byte offset 7 from D02FD9
  // Wait: D02FE0 - D02FD9 = 7
  const d02fe0 = read24(srcBytes, 7);
  console.log(`    D02FE0 (stride): ${hex(d02fe0)} = ${d02fe0} decimal${d02fe0 === 640 ? ' (CONFIRMED: 320*2=640)' : ''}`);
  // D02FE3 is at byte offset 10
  const d02fe3 = read24(srcBytes, 10);
  console.log(`    D02FE3 (VRAM base): ${hex(d02fe3)} = ${d02fe3} decimal${d02fe3 === 0xD40000 ? ' (CONFIRMED: D40000)' : ''}`);
}

printLdirSource();

// ============================
// Section 8: Revisit config table - it is a vtable, not dimensions
// ============================
function printVtableAnalysis() {
  console.log('\n8) Config table re-analysis: entries 0 and 1 are function-pointer vtables\n');
  console.log('   Entry 0 field[0]=0 and Entry 1 field[0]=1 are mode indices.');
  console.log('   Fields 1-3 are ROM code pointers (function pointers).\n');

  for (let i = 0; i < 2; i++) {
    const base = TABLE_BASE + i * TABLE_STRIDE;
    const mode = read24(rom, base);
    const fn1 = read24(rom, base + 3);
    const fn2 = read24(rom, base + 6);
    const fn3 = read24(rom, base + 9);

    console.log(`  Entry ${i} @ ${hex(base)}:`);
    console.log(`    +0: mode index = ${mode}`);
    console.log(`    +3: function pointer 1 = ${hex(fn1)}`);
    console.log(`    +6: function pointer 2 = ${hex(fn2)}`);
    console.log(`    +9: function pointer 3 = ${hex(fn3)}`);

    // Disassemble the first few instructions of each function pointer
    for (const [label, addr] of [['fn1', fn1], ['fn2', fn2], ['fn3', fn3]]) {
      console.log(`\n    --- ${label} @ ${hex(addr)} ---`);
      let pc = addr;
      for (let j = 0; j < 8; j++) {
        const inst = decodeSafe(pc);
        if (!inst || !inst.length) break;
        const bytes = formatBytesFor(inst).padEnd(24);
        console.log(`      ${hex(inst.pc)}: ${bytes} ${formatInstruction(inst)}`);
        if (inst.tag === 'ret') break;
        pc = nextPc(inst);
      }
    }
    console.log('');
  }

  console.log('  Entry 2 @ 0x0525EC overlaps with code (0x055316 function prologue).');
  console.log('  The session-328 note that "selector 2 lands on bytes that already');
  console.log('  decode as code, not a clean descriptor record" is confirmed.');
  console.log('  The table has only 2 valid entries (indices 0 and 1).');
  console.log('  Index 0 = full-screen mode, Index 1 = split-screen/graph mode (hypothesis).');
}

printVtableAnalysis();

console.log('\n=== Phase 329 complete ===');
