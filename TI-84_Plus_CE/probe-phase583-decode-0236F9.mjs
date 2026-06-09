#!/usr/bin/env node
// Phase 583 — Decode 0x0236F9: Event posting central dispatch (30B)
// Called by 0x022331 key processor suite.
// Posts event types (0x01/0x04/0x05/0x06/0x0A/0x0D) with mode context.
// Stores event-type byte + D007E0 mode byte + conditionally D0058E into buffer at HL.
// Reads I/O port 0xDCA0 via IN A,(C) with BC=0x00DCA0.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x0236F9;
const END = 0x023717;  // byte after RET at 0x023716
const FUNC_BYTES = END - START;  // 30 bytes
const ROM_SIZE = 0x400000;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

// Format a decoded instruction into a human-readable mnemonic string
// (copied verbatim from probe-phase582-decode-0A32F9.mjs)
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'NOP'; break;
    case 'halt': text = 'HALT'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'daa': text = 'DAA'; break;
    case 'cpl': text = 'CPL'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'ex-sp-hl': text = 'EX (SP), HL'; break;
    case 'ex-sp-pair': text = `EX (SP), ${inst.pair.toUpperCase()}`; break;
    case 'neg': text = 'NEG'; break;
    case 'retn': text = 'RETN'; break;
    case 'reti': text = 'RETI'; break;
    case 'rrd': text = 'RRD'; break;
    case 'rld': text = 'RLD'; break;
    case 'ldi': text = 'LDI'; break;
    case 'ldd': text = 'LDD'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpi': text = 'CPI'; break;
    case 'cpd': text = 'CPD'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'ini': text = 'INI'; break;
    case 'outi': text = 'OUTI'; break;
    case 'ind': text = 'IND'; break;
    case 'outd': text = 'OUTD'; break;
    case 'inir': text = 'INIR'; break;
    case 'otir': text = 'OTIR'; break;
    case 'indr': text = 'INDR'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'otimr': text = 'OTIMR'; break;
    case 'slp': text = 'SLP'; break;
    case 'stmix': text = 'STMIX'; break;
    case 'rsmix': text = 'RSMIX'; break;
    case 'ld-mb-a': text = 'LD MB, A'; break;
    case 'ld-a-mb': text = 'LD A, MB'; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${inst.pair.toUpperCase()}`; break;
    case 'im': text = `IM ${inst.value}`; break;
    case 'ld-special': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`; break;
    case 'ld-reg-imm': text = `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ind': text = `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-reg': text = `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`; break;
    case 'ld-ind-imm': text = `LD (HL), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ixd':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-ixd-imm':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `INC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `DEC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op.toUpperCase()} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`; break;
    case 'alu-ixd':
      text = `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${inst.indirectRegister.toUpperCase()})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'rst': text = `RST ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `INC ${inst.pair.toUpperCase()}`; break;
    case 'dec-pair': text = `DEC ${inst.pair.toUpperCase()}`; break;
    case 'inc-reg': text = `INC ${inst.reg.toUpperCase()}`; break;
    case 'dec-reg': text = `DEC ${inst.reg.toUpperCase()}`; break;
    case 'add-pair': text = `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'adc-pair': text = `ADC HL, ${inst.src.toUpperCase()}`; break;
    case 'sbc-pair': text = `SBC HL, ${inst.src.toUpperCase()}`; break;
    case 'mlt': text = `MLT ${inst.reg.toUpperCase()}`; break;
    case 'rotate-reg': text = `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`; break;
    case 'rotate-ind': text = `${inst.op.toUpperCase()} (HL)`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (HL)`; break;
    case 'bit-res': text = `RES ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (HL)`; break;
    case 'bit-set': text = `SET ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (HL)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'in-imm': text = `IN A, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `OUT (C), ${inst.reg.toUpperCase()}`; break;
    case 'in-reg': text = `IN ${inst.reg.toUpperCase()}, (C)`; break;
    case 'in0': text = `IN0 ${inst.reg.toUpperCase()}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `OUT0 (${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`; break;
    case 'tst-reg': text = `TST A, ${inst.reg.toUpperCase()}`; break;
    case 'tst-ind': text = 'TST A, (HL)'; break;
    case 'tst-imm': text = `TST A, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `TSTIO ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.pair.toUpperCase()}`;
      break;
    case 'ld-ixiy-indexed':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-pair-ind': text = `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-pair': text = `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`; break;
    default: text = t.toUpperCase(); break;
  }
  return `${prefix}${text}`;
}

// Classify instruction by tag for inventory
function classifyTag(inst) {
  const tags = [];
  const t = inst.tag;

  if (t === 'call' || t === 'call-conditional') tags.push('CALL');
  if (t === 'jp' || t === 'jp-conditional' || t === 'jp-indirect') tags.push('JP');
  if (t === 'jr' || t === 'jr-conditional') tags.push('JR');
  if (t === 'di') tags.push('DI');
  if (t === 'ei') tags.push('EI');
  if (t === 'ret' || t === 'ret-conditional') tags.push('RET');
  if (t === 'djnz') tags.push('DJNZ');

  // Port I/O
  if (t === 'in-imm' || t === 'in-reg' || t === 'in0' ||
      t === 'out-imm' || t === 'out-reg' || t === 'out0' ||
      t === 'ini' || t === 'outi' || t === 'ind' || t === 'outd' ||
      t === 'inir' || t === 'otir' || t === 'indr' || t === 'otdr') {
    tags.push('PORT_IO');
  }

  // IY references
  if (inst.indexRegister === 'iy' || inst.pair === 'iy' ||
      inst.dest === 'iy' || inst.src === 'iy' || inst.base === 'iy') {
    tags.push('IY');
  }

  // RAM references (D0xxxx or D4xxxx addresses)
  const addr = inst.addr ?? inst.target ?? inst.value;
  if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    tags.push('RAM');
  }

  return tags;
}

// Extract RAM addresses from instruction
function extractRamAddr(inst) {
  const refs = [];
  for (const field of [inst.addr, inst.target, inst.value]) {
    if (typeof field === 'number' && field >= 0xD00000 && field <= 0xDFFFFF) {
      refs.push(field);
    }
  }
  return refs;
}

// =========================================================================
// Disassemble the 30-byte function
// =========================================================================

const instructions = [];
const calls = [];
const jps = [];
const jrs = [];
const ramRefs = new Map();
const iyOps = [];
const portIo = [];
const retOps = [];

let pc = START;
const end = END;

while (pc < end && pc < rom.length) {
  let decoded;
  try {
    decoded = decodeInstruction(rom, pc, 'adl');
  } catch (e) {
    decoded = { tag: 'unknown', length: 1, pc };
  }
  if (!decoded || !decoded.length) {
    decoded = { tag: 'unknown', length: 1, pc };
  }

  const mnemonic = formatInstruction(decoded);
  const rawBytes = Array.from(rom.subarray(pc, pc + decoded.length))
    .map(b => hexByte(b)).join(' ');
  const tags = classifyTag(decoded);

  const record = { address: pc, rawBytes, length: decoded.length, mnemonic, tags, decoded };
  instructions.push(record);

  if (tags.includes('CALL')) calls.push(record);
  if (tags.includes('JP')) jps.push(record);
  if (tags.includes('JR')) jrs.push(record);
  if (tags.includes('IY')) iyOps.push(record);
  if (tags.includes('PORT_IO')) portIo.push(record);
  if (tags.includes('RET')) retOps.push(record);

  for (const ref of extractRamAddr(decoded)) {
    const key = hex(ref);
    if (!ramRefs.has(key)) ramRefs.set(key, []);
    ramRefs.get(key).push({ pc, mnemonic });
  }

  pc += decoded.length;
}

// =========================================================================
// Scan entire ROM for CALL/JP to 0x0236F9
// =========================================================================

function scanCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;

  const hits = [];
  const limit = Math.min(rom.length, ROM_SIZE) - 4;

  for (let offset = 0; offset <= limit; offset++) {
    // CALL nn = 0xCD nn nn nn (ADL mode: 3-byte address)
    if (rom[offset] === 0xCD && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
      hits.push({ kind: 'CALL', offset });
    }
    // JP nn = 0xC3 nn nn nn
    if (rom[offset] === 0xC3 && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
      hits.push({ kind: 'JP', offset });
    }
    // Conditional CALL: 0xC4/0xCC/0xD4/0xDC/0xE4/0xEC/0xF4/0xFC
    const b = rom[offset];
    if ((b & 0xC7) === 0xC4 && b !== 0xCD && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
      const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      const condIdx = (b >> 3) & 7;
      hits.push({ kind: `CALL ${condNames[condIdx]}`, offset });
    }
    // Conditional JP: 0xC2/0xCA/0xD2/0xDA/0xE2/0xEA/0xF2/0xFA
    if ((b & 0xC7) === 0xC2 && b !== 0xC3 && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
      const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      const condIdx = (b >> 3) & 7;
      hits.push({ kind: `JP ${condNames[condIdx]}`, offset });
    }
  }

  return hits;
}

// =========================================================================
// Output
// =========================================================================

console.log('=== Phase 583: Decode 0x0236F9 -- EVENT POSTING CENTRAL DISPATCH (30B) ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom`);
console.log(`Function range: ${hex(START)} .. ${hex(END - 1)} (${FUNC_BYTES} bytes)`);
console.log('');

// =========================================================================
// Full disassembly listing
// =========================================================================

console.log('=== FULL DISASSEMBLY ===');
for (const ins of instructions) {
  const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
  console.log(`${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
}
console.log('');

// =========================================================================
// Annotated pseudocode
// =========================================================================

console.log('=== ANNOTATED PSEUDOCODE ===');
console.log('// 0x0236F9 — Event posting central dispatch');
console.log('// Called with: A = event type byte, HL = pointer to 3-byte event buffer');
console.log('//');
console.log('// PUSH BC                    ; save BC');
console.log('// LD (HL), A                 ; buffer[0] = event type (A)');
console.log('// INC HL');
console.log('// LD A, (D007E0)             ; A = current mode byte');
console.log('// LD (HL), A                 ; buffer[1] = mode byte');
console.log('// INC HL');
console.log('// CP 0x4E                    ; is mode == 0x4E?');
console.log('// LD A, 0x00                 ; A = 0 (default third byte)');
console.log('// JR NZ, +4                  ; if mode != 0x4E, skip next load');
console.log('//   LD A, (D0058E)           ; A = pending key / context byte');
console.log('// LD (HL), A                 ; buffer[2] = 0x00 or D0058E value');
console.log('// DEC HL                     ; restore HL to buffer start');
console.log('// DEC HL');
console.log('// LD BC, 0x00DCA0            ; BC = I/O port 0xDCA0');
console.log('// IN A, (C)                  ; read port 0xDCA0');
console.log('// POP BC                     ; restore BC');
console.log('// RET');
console.log('//');
console.log('// SUMMARY: Writes a 3-byte event record into the buffer pointed to by HL:');
console.log('//   [0] = event type (passed in A)');
console.log('//   [1] = mode byte from D007E0');
console.log('//   [2] = D0058E (pending key) if mode==0x4E, else 0x00');
console.log('//   Then reads I/O port 0xDCA0 into A (return value / side-effect).');
console.log('//   HL is restored to its original value on return.');
console.log('');

// =========================================================================
// Key questions answered
// =========================================================================

console.log('=== ANALYSIS ===');
console.log('');
console.log('Q1: What does the function store into the buffer at HL?');
console.log('  A 3-byte event record:');
console.log('    byte[0] = A on entry (the event type: 0x01, 0x04, 0x05, 0x06, 0x0A, or 0x0D)');
console.log('    byte[1] = contents of D007E0 (the current screen/calculator mode)');
console.log('    byte[2] = if mode == 0x4E: contents of D0058E (pending key / context byte)');
console.log('              otherwise: 0x00');
console.log('  HL is decremented back to its original value before return.');
console.log('');
console.log('Q2: What does IN A,(C) with BC=0x00DCA0 do?');
console.log('  This reads I/O port 0xDCA0. On the TI-84 Plus CE (eZ80-based):');
console.log('    Port 0xDCA0 is in the 0xDCxx range — this is NOT a standard peripheral port.');
console.log('    The eZ80 I/O space 0x0000-0x00FF covers on-chip peripherals (timers, UART, etc).');
console.log('    Port 0xDCA0 (with B=0x00, so the actual 16-bit port is 0x00A0 in Z80 mode');
console.log('    or the full 16-bit C=0xDCA0 in ADL mode) falls in the TI ASIC register space.');
console.log('    Likely candidates: interrupt status/acknowledge register, or a "mailbox" port');
console.log('    used by the key event system to signal that an event has been posted.');
console.log('    The result is returned in A but not stored — this may be a');
console.log('    status read or an acknowledge/clear side-effect.');
console.log('');

// =========================================================================
// RAM references detail
// =========================================================================

console.log('=== RAM REFERENCES ===');
if (ramRefs.size) {
  const sorted = [...ramRefs.entries()].sort();
  for (const [ref, uses] of sorted) {
    console.log(`\n${ref}:`);
    for (const use of uses) {
      console.log(`  ${hex(use.pc)}  ${use.mnemonic}`);
    }
  }
} else {
  console.log('No D0xxxx/D4xxxx references found in instruction operands.');
}

// Check for RAM addresses embedded in immediate values that the decoder
// might report as plain values rather than addresses
console.log('\nKnown RAM addresses in this function:');
console.log('  D007E0 — mode byte (read at LD A,(D007E0))');
console.log('  D0058E — pending key / context byte (read at LD A,(D0058E), conditional)');
console.log('');

// =========================================================================
// Port I/O detail
// =========================================================================

console.log('=== PORT I/O ===');
if (portIo.length) {
  for (const ins of portIo) {
    console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
  }
} else {
  console.log('  (none detected by decoder — but IN A,(C) with BC=0x00DCA0 is present)');
}
console.log('  Note: IN A,(C) reads port address from register C (0xA0 in Z80 mode,');
console.log('  or BC=0x00DCA0 as 16-bit port in ADL mode). BC is loaded immediately');
console.log('  before the IN instruction with LD BC, 0x00DCA0.');
console.log('');

// =========================================================================
// Instruction inventory
// =========================================================================

console.log('=== INSTRUCTION INVENTORY ===');
console.log(`Total instructions: ${instructions.length}`);
console.log(`CALLs: ${calls.length}, JPs: ${jps.length}, JRs: ${jrs.length}, RETs: ${retOps.length}`);
console.log(`IY ops: ${iyOps.length}, Port I/O: ${portIo.length}`);
console.log(`Unique RAM addresses referenced: ${ramRefs.size}`);
console.log('');

if (calls.length) {
  console.log('CALLs:');
  for (const ins of calls) {
    console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
  }
  console.log('');
}

if (jrs.length) {
  console.log('JRs:');
  for (const ins of jrs) {
    const target = ins.decoded.target;
    const inRange = target >= START && target < END;
    console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  ${inRange ? '(internal)' : '(external)'}`);
  }
  console.log('');
}

if (retOps.length) {
  console.log('RETs:');
  for (const ins of retOps) {
    console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
  }
  console.log('');
}

// =========================================================================
// Q3: Full ROM callers of 0x0236F9
// =========================================================================

console.log('=== Q3: ALL CALLERS OF 0x0236F9 (full ROM scan) ===');
const callers = scanCallers(START);
console.log(`Found ${callers.length} call/jump sites:`);
console.log('');

for (const caller of callers) {
  // Decode the instruction at the caller site for context
  let context = '';
  try {
    // Look at 1-2 instructions before the CALL to see what A was loaded with
    // (event type is passed in A)
    const lookback = 10; // bytes to look back
    const contextStart = Math.max(0, caller.offset - lookback);
    let scanPC = contextStart;
    const contextInsns = [];
    while (scanPC < caller.offset) {
      let d;
      try {
        d = decodeInstruction(rom, scanPC, 'adl');
      } catch {
        d = { tag: 'unknown', length: 1 };
      }
      if (!d || !d.length) d = { tag: 'unknown', length: 1 };
      const m = formatInstruction(d);
      contextInsns.push({ pc: scanPC, mnemonic: m, decoded: d });
      scanPC += d.length;
    }
    // Find the last LD A,imm before the CALL
    for (let i = contextInsns.length - 1; i >= 0; i--) {
      const ci = contextInsns[i];
      if (ci.decoded.tag === 'ld-reg-imm' && ci.decoded.dest === 'a') {
        context = `  ; A=${hexByte(ci.decoded.value)} (event type ${hexByte(ci.decoded.value)})`;
        break;
      }
    }
  } catch {
    // ignore context errors
  }

  console.log(`  ${caller.kind.padEnd(8)} at ${hex(caller.offset)}${context}`);
}

console.log('');

// Group callers by surrounding function (approximate by looking at nearby addresses)
const callerAddresses = callers.map(c => c.offset);
const clusters = [];
let clusterStart = callerAddresses[0];
let clusterEnd = callerAddresses[0];
let clusterMembers = [callers[0]];

for (let i = 1; i < callers.length; i++) {
  if (callerAddresses[i] - clusterEnd < 256) {
    // Same cluster
    clusterEnd = callerAddresses[i];
    clusterMembers.push(callers[i]);
  } else {
    clusters.push({ start: clusterStart, end: clusterEnd, members: clusterMembers });
    clusterStart = callerAddresses[i];
    clusterEnd = callerAddresses[i];
    clusterMembers = [callers[i]];
  }
}
if (clusterMembers.length) {
  clusters.push({ start: clusterStart, end: clusterEnd, members: clusterMembers });
}

console.log('=== CALLER CLUSTERS (grouped by proximity, <256B apart) ===');
for (const cluster of clusters) {
  console.log(`\nCluster ${hex(cluster.start)}..${hex(cluster.end)} (${cluster.members.length} calls):`);
  for (const m of cluster.members) {
    console.log(`  ${m.kind.padEnd(8)} at ${hex(m.offset)}`);
  }
}
console.log('');

// =========================================================================
// Raw bytes verification
// =========================================================================

console.log('=== RAW BYTES VERIFICATION ===');
const rawBytes = Array.from(rom.subarray(START, END));
console.log(`${hex(START)}: ${rawBytes.map(b => hexByte(b)).join(' ')}`);
console.log(`Length: ${rawBytes.length} bytes`);
console.log(`Last byte: ${hexByte(rawBytes[rawBytes.length - 1])} (expected 0xC9 = RET)`);
console.log('');

// =========================================================================
// Summary
// =========================================================================

console.log('=== SUMMARY ===');
console.log(`Function: 0x0236F9 — Event Posting Central Dispatch`);
console.log(`Size: ${FUNC_BYTES} bytes (${instructions.length} instructions)`);
console.log(`Range: ${hex(START)} .. ${hex(END - 1)}`);
console.log(`Callers: ${callers.length} (CALL: ${callers.filter(c => c.kind === 'CALL').length}, JP: ${callers.filter(c => c.kind === 'JP').length}, conditional: ${callers.filter(c => c.kind.includes(' ')).length})`);
console.log(`RAM refs: D007E0 (mode byte, read), D0058E (pending key, conditional read)`);
console.log(`Port I/O: IN A,(C) with BC=0x00DCA0 — reads ASIC register`);
console.log(`Behavior: Writes 3-byte event record to buffer at HL, reads port 0xDCA0, returns`);
console.log('');
console.log('DONE');
