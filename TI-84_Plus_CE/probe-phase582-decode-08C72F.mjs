#!/usr/bin/env node

/**
 * Phase 582: Decode 0x08C72F — Display Refresh After Key
 *
 * Session 581 decoded 0x08C509 (common key processing path). At 0x08C532,
 * after CALL 0x022331 (key processor), it does CALL 0x08C72F (display refresh).
 * This function is called after every key press to update the display.
 *
 * Known nearby code:
 *   0x08C331 = event loop top (session 578, 140B)
 *   0x08C33D = event loop cleanup (session 577, 128B)
 *   0x08C3C3 = key dispatch cascade start (session 579)
 *   0x08C509 = common key processing (session 581, ~140B)
 *   0x08C72F = THIS TARGET
 *
 * Known display functions for cross-reference:
 *   0x058241 = main display refresh (423B, session 575)
 *   0x0620C4 = display dispatcher
 *   0x062055 = parent display dispatcher
 *   0x0A1FB5 = scroll swap
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x08C72F;
const ROM_SIZE = 0x400000;

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;

    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;

    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    }
    case 'ld-reg16-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-reg16-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg16': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-index': return `LD SP, ${String(inst.indexRegister).toUpperCase()}`;
    case 'ld-mem-imm': return `LD (${hex(inst.addr)}), ${hexByte(inst.value)}`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src || inst.pair || 'HL').toUpperCase()})`;
    case 'ld-a-indirect': return `LD A, (${String(inst.reg).toUpperCase()})`;
    case 'ld-indirect-a': return `LD (${String(inst.reg).toUpperCase()}), A`;
    case 'ld-special': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-mb-a': return 'LD MB, A';

    case 'ld-index-imm': return `LD ${String(inst.indexRegister).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-index-mem': return `LD ${String(inst.indexRegister).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-index': return `LD (${hex(inst.addr)}), ${String(inst.indexRegister).toUpperCase()}`;
    case 'ld-indexed-imm': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-indexed': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-index': return `INC ${String(inst.indexRegister).toUpperCase()}`;
    case 'dec-index': return `DEC ${String(inst.indexRegister).toUpperCase()}`;
    case 'inc-indexed': return `INC (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'dec-indexed': return `DEC (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-indexed': return `${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'or-reg': return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg': return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg': return `XOR ${String(inst.src).toUpperCase()}`;
    case 'cp-reg': return `CP ${String(inst.src).toUpperCase()}`;
    case 'or-imm': return `OR ${hexByte(inst.value)}`;
    case 'and-imm': return `AND ${hexByte(inst.value)}`;
    case 'xor-imm': return `XOR ${hexByte(inst.value)}`;
    case 'cp-imm': return `CP ${hexByte(inst.value)}`;

    case 'add-hl-reg16': return `ADD HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-hl-reg16': return `ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-hl-reg16': return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'add-index-reg16': return `ADD ${String(inst.indexRegister).toUpperCase()}, ${String(inst.src).toUpperCase()}`;

    case 'rotate-reg': return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;

    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res': return `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;

    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';

    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';

    case 'in-reg-c': return `IN ${String(inst.dest).toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${String(inst.src).toUpperCase()}`;
    case 'in-a-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm-a': return `OUT (${hexByte(inst.port)}), A`;

    case 'im': return `IM ${inst.mode}`;

    default: {
      let s = inst.tag;
      if (inst.target !== undefined) s += ` target=${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` val=${hex(inst.value, 2)}`;
      if (inst.addr !== undefined) s += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) s += ` dest=${String(inst.dest).toUpperCase()}`;
      if (inst.src !== undefined) s += ` src=${String(inst.src).toUpperCase()}`;
      if (inst.reg !== undefined) s += ` reg=${String(inst.reg).toUpperCase()}`;
      if (inst.bit !== undefined) s += ` bit=${inst.bit}`;
      if (inst.indexRegister !== undefined) s += ` idx=${String(inst.indexRegister).toUpperCase()}`;
      if (inst.displacement !== undefined) s += ` disp=${inst.displacement}`;
      return s;
    }
  }
}

// Known display functions for cross-referencing
const knownDisplayFunctions = new Map([
  [0x058241, 'main display refresh (423B, session 575)'],
  [0x0620C4, 'display dispatcher'],
  [0x062055, 'parent display dispatcher'],
  [0x0A1FB5, 'scroll swap'],
  [0x08C331, 'event loop top'],
  [0x08C33D, 'event loop cleanup'],
  [0x08C509, 'common key processing'],
  [0x022331, 'key processor'],
]);

// --- Main ---

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

console.log(`=== Phase 582: Decode 0x08C72F — Display Refresh After Key ===\n`);
console.log(`Context: 0x08C509 (common key processing) does CALL 0x08C72F`);
console.log(`  after CALL 0x022331 (key processor) to refresh the display.`);
console.log(`  Question: is this a full display refresh or a lightweight update?\n`);

// 1. Disassemble the function
console.log(`--- Disassembly from ${hex(TARGET)} ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const jrTargets = [];
const ramRefs = new Map();
const iyOps = [];
let pc = TARGET;
const maxEnd = TARGET + 400;  // generous scan limit
let funcEnd = null;
let endReason = 'scan limit reached';

// Track multiple unconditional returns/jumps to find the function boundary
// The function may have conditional branches past the first RET
let unconditionalTerminals = 0;

while (pc < maxEnd) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst || !inst.length) {
    const byteVal = rom[pc];
    console.log(`  ${hex(pc)}  ${byteVal.toString(16).toUpperCase().padStart(2, '0')}                   DB ${hexByte(byteVal)}`);
    listing.push({ pc, text: `DB ${hexByte(byteVal)}`, length: 1 });
    pc += 1;
    continue;
  }

  const len = inst.length;
  const rawBytes = [...rom.subarray(pc, pc + len)]
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const text = formatInstruction(inst);

  console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${text}`);
  listing.push({ pc, text, length: len, inst });

  // Track CALL targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    subCalls.push({ pc, target: inst.target, text, conditional: inst.tag === 'call-conditional' });
  }

  // Track JP targets
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    jpTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jp-conditional' });
  }

  // Track JR targets
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    jrTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jr-conditional' });
  }

  // Track DJNZ
  if (inst.tag === 'djnz') {
    jrTargets.push({ pc, target: inst.target, text, conditional: true });
  }

  // Track RAM refs (addresses >= 0xD00000)
  const addrs = [inst.addr, inst.target, inst.value].filter(
    v => typeof v === 'number' && v >= 0xD00000
  );
  for (const a of addrs) {
    if (!ramRefs.has(a)) ramRefs.set(a, []);
    ramRefs.get(a).push({ pc, text });
  }

  // Track IY+ operations
  if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
    iyOps.push({ pc, text, offset: inst.displacement });
  }

  pc += len;

  // Check for terminal instructions
  if (inst.tag === 'ret') {
    endReason = `unconditional RET at ${hex(pc - len)}`;
    funcEnd = pc;
    break;
  }
  if (inst.tag === 'jp' && !inst.condition) {
    // Unconditional JP - check if it jumps outside function body
    if (inst.target < TARGET || inst.target >= maxEnd) {
      endReason = `unconditional JP ${hex(inst.target)} at ${hex(pc - len)}`;
      funcEnd = pc;
      break;
    }
  }
}

const funcSize = (funcEnd || pc) - TARGET;

// 2. Scan for callers of 0x08C72F in ROM
console.log(`\n--- Callers/jumpers to ${hex(TARGET)} in full ROM ---\n`);

const callers = [];
const lo = TARGET & 0xFF;
const mid = (TARGET >> 8) & 0xFF;
const hi = (TARGET >> 16) & 0xFF;

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
    if (rom[i] === 0xCD) {
      callers.push({ offset: i, type: 'CALL' });
    } else if (rom[i] === 0xC3) {
      callers.push({ offset: i, type: 'JP' });
    }
    const condCallOps = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
    const condJpOps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
    if (condCallOps.includes(rom[i])) {
      callers.push({ offset: i, type: 'CALL cc' });
    } else if (condJpOps.includes(rom[i])) {
      callers.push({ offset: i, type: 'JP cc' });
    }
  }
}

// Also check JR refs
for (let i = 0; i < rom.length - 1; i++) {
  const op = rom[i];
  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const disp = rom[i + 1] < 128 ? rom[i + 1] : rom[i + 1] - 256;
    const dest = i + 2 + disp;
    if (dest === TARGET) {
      const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
      callers.push({ offset: i, type: names[op] });
    }
  }
}

// Deduplicate and sort
const uniqueCallers = [...new Map(callers.map(c => [c.offset, c])).values()]
  .sort((a, b) => a.offset - b.offset);

console.log(`  Total references: ${uniqueCallers.length}`);
for (const c of uniqueCallers) {
  console.log(`    ${hex(c.offset)}: ${c.type} ${hex(TARGET)}`);
}

// 3. CALL targets summary
console.log(`\n--- CALL targets (${subCalls.length}) ---\n`);
for (const c of subCalls) {
  const known = knownDisplayFunctions.get(c.target);
  console.log(`  ${hex(c.pc)}: ${c.text}${known ? `  [KNOWN: ${known}]` : ''}`);
}

// 4. JP/JR targets summary
console.log(`\n--- JP/JR targets (${jpTargets.length + jrTargets.length}) ---\n`);
for (const j of jpTargets) {
  const known = knownDisplayFunctions.get(j.target);
  console.log(`  ${hex(j.pc)}: ${j.text}${known ? `  [KNOWN: ${known}]` : ''}`);
}
for (const j of jrTargets) {
  console.log(`  ${hex(j.pc)}: ${j.text}`);
}

// 5. RAM references summary
console.log(`\n--- RAM references (D0xxxx+) (${ramRefs.size} unique addresses) ---\n`);
const sortedRamRefs = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRamRefs) {
  console.log(`  ${hex(addr)}: ${refs.length} ref(s)`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 6. IY+offset operations summary
console.log(`\n--- IY+offset operations (${iyOps.length}) ---\n`);
const iyByOffset = new Map();
for (const op of iyOps) {
  const key = op.offset;
  if (!iyByOffset.has(key)) iyByOffset.set(key, []);
  iyByOffset.get(key).push(op);
}
for (const [offset, ops] of [...iyByOffset.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  IY+${offset} (${hexByte(offset)}): ${ops.length} ref(s)`);
  for (const op of ops) {
    console.log(`    ${hex(op.pc)}: ${op.text}`);
  }
}

// 7. Known display function cross-reference
console.log(`\n--- Known display function cross-reference ---\n`);
for (const [addr, name] of knownDisplayFunctions) {
  const callRefs = subCalls.filter(c => c.target === addr);
  const jpRefs = jpTargets.filter(j => j.target === addr);
  if (callRefs.length === 0 && jpRefs.length === 0) {
    console.log(`  ${hex(addr)} (${name}): NOT referenced`);
  } else {
    for (const r of callRefs) {
      console.log(`  ${hex(addr)} (${name}): CALLED at ${hex(r.pc)}`);
    }
    for (const r of jpRefs) {
      console.log(`  ${hex(addr)} (${name}): JP at ${hex(r.pc)}`);
    }
  }
}

// 8. Also decode what's at the CALL targets to understand the call chain
console.log(`\n--- Sub-call target first-few-instructions ---\n`);
const uniqueCallTargets = [...new Set(subCalls.map(c => c.target))].sort((a, b) => a - b);
for (const target of uniqueCallTargets) {
  if (target >= ROM_SIZE) {
    console.log(`  ${hex(target)}: RAM address (not in ROM)`);
    continue;
  }
  console.log(`  ${hex(target)}:`);
  let subPc = target;
  for (let i = 0; i < 8; i++) {
    const inst = decodeInstruction(rom, subPc, 'adl');
    if (!inst || !inst.length) break;
    const rawBytes = [...rom.subarray(subPc, subPc + inst.length)]
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    const text = formatInstruction(inst);
    console.log(`    ${hex(subPc)}  ${rawBytes.padEnd(20)} ${text}`);
    subPc += inst.length;
    if (inst.tag === 'ret' || (inst.tag === 'jp' && !inst.condition)) break;
  }
  console.log('');
}

// 9. Characterization
console.log(`\n--- Summary ---\n`);
console.log(`  Function: ${hex(TARGET)}`);
console.log(`  Size: ${funcSize} bytes`);
console.log(`  End: ${endReason}`);
console.log(`  Instructions: ${listing.length}`);
console.log(`  CALLs: ${subCalls.length}`);
console.log(`  JP/JR branches: ${jpTargets.length + jrTargets.length}`);
console.log(`  RAM refs: ${ramRefs.size} unique addresses`);
console.log(`  IY+offset ops: ${iyOps.length}`);
console.log(`  External callers: ${uniqueCallers.length}`);

const callsKnownRefresh = subCalls.some(c =>
  c.target === 0x058241 || c.target === 0x0620C4 || c.target === 0x062055
);
const jpsKnownRefresh = jpTargets.some(j =>
  j.target === 0x058241 || j.target === 0x0620C4 || j.target === 0x062055
);

if (callsKnownRefresh || jpsKnownRefresh) {
  console.log(`\n  CHARACTERIZATION: FULL or DELEGATED display refresh.`);
  console.log(`    This routine directly calls/jumps to a known display refresh path.`);
} else if (subCalls.length <= 3 && funcSize < 40) {
  console.log(`\n  CHARACTERIZATION: LIGHTWEIGHT wrapper/stub.`);
  console.log(`    Small function with few calls — likely a thin wrapper or flag-setter.`);
} else if (ramRefs.size + iyOps.length >= 6) {
  console.log(`\n  CHARACTERIZATION: STATE MANIPULATION routine.`);
  console.log(`    Heavy RAM/IY usage suggests cursor/line/status state management.`);
} else {
  console.log(`\n  CHARACTERIZATION: INTERMEDIATE dispatcher or helper.`);
  console.log(`    Moderate complexity — may delegate to unknown sub-functions.`);
}
