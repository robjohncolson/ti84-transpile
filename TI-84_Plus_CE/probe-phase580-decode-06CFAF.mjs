#!/usr/bin/env node

/**
 * Phase 580: Decode 0x06CFAF — GRAPH Key Handler
 *
 * Session 579 decoded the key dispatch pre-processor at 0x06CE7F.
 * When key == 0x07 (GRAPH), it dispatches JP Z,0x06CFAF.
 * Before dispatch, the pre-processor has called 0x06C8B4, 0x06AF6C,
 * and re-read D0146D.
 *
 * This probe:
 *   1. Disassembles 0x06CFAF through ~400 bytes
 *   2. Identifies CALL/JP targets, RAM refs (0xD0xxxx), IY+offset ops
 *   3. Counts callers of 0x06CFAF in the full ROM
 *   4. Analyzes what GRAPH does — screen mode change? graph rendering?
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x06CFAF;
const ROM_SIZE = 0x400000;
const MAX_BYTES = 400;

// Known addresses for cross-reference
const KNOWN = {
  0x03FA09: '_GetCSC',
  0x06C8B4: 'pre-proc sub1',
  0x06AF6C: 'pre-proc sub2',
  0x058241: 'OS_MAIN_DISPLAY_REFRESH',
  0x06C72D: 'SCREEN_MODE_BIT4_TESTER',
  0x06C732: 'SCREEN_MODE_BIT5_TESTER',
  0x06C737: 'SCREEN_MODE_BIT6_TESTER',
  0x06C73C: 'SCREEN_MODE_BIT7_TESTER',
  0x063033: 'INIT_TRAMPOLINE',
  0x08C331: 'EVENT_LOOP_TOP',
  0x08C33D: 'EVENT_LOOP_CLEANUP',
  0x0A27DD: 'KEY_INPUT_SETUP',
  0x06CE73: 'KEY_PRE_PROCESSOR',
};

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
      const dir = inst.direction;
      if (dir === 'to-mem') return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
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
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';

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

// --- Main ---

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

console.log(`=== Phase 580: Decode 0x06CFAF — GRAPH Key Handler ===\n`);
console.log(`Context: Key dispatch pre-processor at 0x06CE7F dispatches here when key == 0x07 (GRAPH).`);
console.log(`Pre-dispatch calls: 0x06C8B4, 0x06AF6C, re-read D0146D.\n`);

// 1. Disassemble from TARGET through MAX_BYTES
console.log(`--- Disassembly from ${hex(TARGET)} (up to ${MAX_BYTES} bytes) ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const ramRefs = new Map();    // addr -> [refs...]
const iyOps = [];
let pc = TARGET;
const end = Math.min(TARGET + MAX_BYTES, rom.length);
let retCount = 0;

while (pc < end) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst || !inst.length) {
    const byteVal = rom[pc];
    console.log(`  ${hex(pc)}  ${byteVal.toString(16).toUpperCase().padStart(2, '0')}          DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`);
    listing.push({ pc, text: `DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`, length: 1 });
    pc += 1;
    continue;
  }

  const len = inst.length;
  const rawBytes = [...rom.subarray(pc, pc + len)]
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const text = formatInstruction(inst);

  // Annotate known addresses
  let annotation = '';
  if (inst.target !== undefined && KNOWN[inst.target]) {
    annotation = `  ; ${KNOWN[inst.target]}`;
  }

  console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${text}${annotation}`);
  listing.push({ pc, text, length: len, inst });

  // Track CALL targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    subCalls.push({ pc, target: inst.target, text });
  }

  // Track JP targets (unconditional and conditional)
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    jpTargets.push({ pc, target: inst.target, text });
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

  // Track termination (but keep going for multi-path functions)
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
    retCount++;
    if (retCount >= 2) break;
  }

  // Unconditional JP outside the function range may be a tail call / function end
  if (inst.tag === 'jp' && (inst.target < TARGET || inst.target >= TARGET + MAX_BYTES)) {
    retCount++;
    if (retCount >= 2) break;
  }

  pc += len;
}

// 2. Scan for callers of 0x06CFAF in ROM
console.log(`\n--- Callers of ${hex(TARGET)} in ROM ---\n`);

const targetLo = TARGET & 0xFF;
const targetMid = (TARGET >> 8) & 0xFF;
const targetHi = (TARGET >> 16) & 0xFF;

const callCallers = [];
const jpCallers = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === targetLo && rom[i + 2] === targetMid && rom[i + 3] === targetHi) {
    if (rom[i] === 0xCD) {
      callCallers.push(i);
    } else if (rom[i] === 0xC3) {
      jpCallers.push(i);
    }
  }
}

// Also check conditional CALL/JP patterns (CD with condition variants)
// Conditional calls: C4 (NZ), CC (Z), D4 (NC), DC (C)
const condCallCallers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === targetLo && rom[i + 2] === targetMid && rom[i + 3] === targetHi) {
    const op = rom[i];
    if (op === 0xC4 || op === 0xCC || op === 0xD4 || op === 0xDC ||
        op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC) {
      condCallCallers.push({ addr: i, opcode: op });
    }
    // Conditional JP: C2 (NZ), CA (Z), D2 (NC), DA (C)
    if (op === 0xC2 || op === 0xCA || op === 0xD2 || op === 0xDA ||
        op === 0xE2 || op === 0xEA || op === 0xF2 || op === 0xFA) {
      jpCallers.push(i);
    }
  }
}

console.log(`  CALL ${hex(TARGET)}: ${callCallers.length} caller(s)`);
for (const c of callCallers) {
  console.log(`    ${hex(c)}`);
}
console.log(`  JP ${hex(TARGET)}: ${jpCallers.length} ref(s)`);
for (const c of jpCallers) {
  console.log(`    ${hex(c)}`);
}
if (condCallCallers.length > 0) {
  console.log(`  Conditional CALL ${hex(TARGET)}: ${condCallCallers.length} ref(s)`);
  for (const c of condCallCallers) {
    console.log(`    ${hex(c.addr)} (opcode ${hexByte(c.opcode)})`);
  }
}
const totalCallers = callCallers.length + jpCallers.length + condCallCallers.length;
console.log(`  Total references: ${totalCallers}`);

// 3. CALL targets summary
console.log(`\n--- CALL targets ---\n`);
for (const c of subCalls) {
  const known = KNOWN[c.target] ? `  ; ${KNOWN[c.target]}` : '';
  console.log(`  ${hex(c.pc)}: ${c.text}${known}`);
}

// 4. JP targets summary
console.log(`\n--- JP targets ---\n`);
for (const j of jpTargets) {
  const known = KNOWN[j.target] ? `  ; ${KNOWN[j.target]}` : '';
  const inRange = (j.target >= TARGET && j.target < TARGET + MAX_BYTES) ? ' (internal)' : ' (external)';
  console.log(`  ${hex(j.pc)}: ${j.text}${known}${inRange}`);
}

// 5. RAM refs
console.log(`\n--- RAM references (>= 0xD00000) ---\n`);
const sortedRam = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRam) {
  console.log(`  ${hex(addr)} (${refs.length} ref${refs.length > 1 ? 's' : ''}):`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 6. IY+ operations
console.log(`\n--- IY+ operations ---\n`);
for (const op of iyOps) {
  console.log(`  ${hex(op.pc)}: IY+0x${op.offset.toString(16).toUpperCase().padStart(2, '0')}  ${op.text}`);
}

// 7. Analysis: check for screen-mode patterns
console.log(`\n--- Screen Mode Analysis ---\n`);

const screenModeTesters = [0x06C72D, 0x06C732, 0x06C737, 0x06C73C];
const screenModeCalls = subCalls.filter(c => screenModeTesters.includes(c.target));
if (screenModeCalls.length > 0) {
  console.log(`  Calls screen-mode bit testers:`);
  for (const c of screenModeCalls) {
    console.log(`    ${hex(c.pc)}: ${c.text}  ; ${KNOWN[c.target]}`);
  }
} else {
  console.log(`  No direct calls to screen-mode bit testers (0x06C72D-0x06C73C)`);
}

// Check for IY+0x02 bit ops (screen mode flags)
const iy02Ops = iyOps.filter(op => op.offset === 0x02);
if (iy02Ops.length > 0) {
  console.log(`  IY+0x02 operations (screen mode flags):`);
  for (const op of iy02Ops) {
    console.log(`    ${hex(op.pc)}: ${op.text}`);
  }
}

// Check for D007E0 (display mode selector)
if (ramRefs.has(0xD007E0)) {
  console.log(`  D007E0 (display mode) references:`);
  for (const r of ramRefs.get(0xD007E0)) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 8. Conclusion
console.log(`\n--- Conclusion ---\n`);
console.log(`  Function: ${hex(TARGET)} — GRAPH key handler`);
console.log(`  Decoded range: ${hex(TARGET)} - ${hex(pc)} (${pc - TARGET} bytes)`);
console.log(`  Instructions: ${listing.length}`);
console.log(`  CALL targets: ${subCalls.length}`);
console.log(`  JP targets: ${jpTargets.length}`);
console.log(`  Unique RAM refs: ${ramRefs.size}`);
console.log(`  IY+ operations: ${iyOps.length}`);
console.log(`  Total callers/refs: ${totalCallers}`);
console.log(`  Screen-mode tester calls: ${screenModeCalls.length}`);
