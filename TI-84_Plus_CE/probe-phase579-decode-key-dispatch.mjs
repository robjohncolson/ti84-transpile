// Phase 579: Decode key dispatch cascade at 0x08C3C3+
// After key input (CALL 0x0A27DD), if A != 0, the event loop dispatches
// on the internal key code via a CP cascade: 0xB4, 0x3F, 0x28, 0x29,
// 0x58, 0x7F, 0xFE, 0xFC, 0xFA.

import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';
import { scanCodeToKeyCode, reverseLookup } from './scancode-translate.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

// ── hex formatting ──────────────────────────────────────────────────
function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}
function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

// ── instruction formatting (mirrors phase202c-classify) ─────────────
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
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem': text = `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`; break;
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
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${inst.pair.toUpperCase()}`; break;
    case 'ld-special': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-mb-a': text = 'LD MB, A'; break;
    case 'ld-a-mb': text = 'LD A, MB'; break;
    case 'im': text = `IM ${inst.value}`; break;
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
    default: text = `[${t}]`; break;
  }
  return `${prefix}${text}`;
}

// ── key code name lookup ────────────────────────────────────────────
// Build reverse map: internal key code -> human-readable key name
const KEY_NAMES_BY_INTERNAL_CODE = new Map();

// OS scan code -> key name from keyboard-matrix.md
const SCAN_CODE_TO_KEY_NAME = new Map([
  [0x01, 'GRAPH'], [0x02, 'TRACE'], [0x03, 'ZOOM'], [0x04, 'WINDOW'],
  [0x05, 'Y='], [0x06, '2ND'], [0x07, 'MODE'], [0x08, 'DEL'],
  [0x0A, 'STO>'], [0x0B, 'LN'], [0x0C, 'LOG'], [0x0D, 'x^2'],
  [0x0E, 'x^-1'], [0x0F, 'MATH'], [0x10, 'ALPHA'],
  [0x11, '0'], [0x12, '1'], [0x13, '4'], [0x14, '7'],
  [0x15, ','], [0x16, 'SIN'], [0x17, 'APPS'], [0x18, 'X,T,0,n'],
  [0x19, '.'], [0x1A, '2'], [0x1B, '5'], [0x1C, '8'],
  [0x1D, '('], [0x1E, 'COS'], [0x1F, 'PRGM'], [0x20, 'STAT'],
  [0x21, '(-)'], [0x22, '3'], [0x23, '6'], [0x24, '9'],
  [0x25, ')'], [0x26, 'TAN'], [0x27, 'VARS'],
  [0x29, 'ENTER'], [0x2A, '+'], [0x2B, '-'], [0x2C, '*'],
  [0x2D, '/'], [0x2E, '^'], [0x2F, 'CLEAR'],
  [0x31, 'DOWN'], [0x32, 'LEFT'], [0x33, 'RIGHT'], [0x34, 'UP'],
]);

const MOD_NAMES = ['', '2nd+', 'alpha+', 'alpha+2nd+'];

// For each internal code, find which scan code + modifier produces it
function lookupKeyName(internalCode) {
  for (let mod = 0; mod < 4; mod++) {
    for (let sc = 0; sc < scanCodeToKeyCode[mod].length; sc++) {
      if (scanCodeToKeyCode[mod][sc] === internalCode) {
        const keyName = SCAN_CODE_TO_KEY_NAME.get(sc) || `sc${hexByte(sc)}`;
        const modPrefix = MOD_NAMES[mod];
        return `${modPrefix}${keyName}`;
      }
    }
  }
  return `unknown(${hexByte(internalCode)})`;
}

// ── disassembly helpers ─────────────────────────────────────────────
function decode(pc) {
  const inst = decodeInstruction(rom, pc, 'adl');
  return { pc, length: inst.length, tag: inst.tag, inst, asm: formatInstruction(inst) };
}

function disassemble(startPc, maxInsns) {
  const out = [];
  let pc = startPc;
  for (let i = 0; i < maxInsns && pc < rom.length; i++) {
    const d = decode(pc);
    out.push(d);
    pc += d.length;
    // Stop at unconditional JP or RET
    if (d.tag === 'jp' || d.tag === 'ret') break;
  }
  return out;
}

// ── extract CP value from an instruction ────────────────────────────
function getCpValue(d) {
  if (d.tag === 'alu-imm' && d.inst.op === 'cp') return d.inst.value;
  if (d.tag === 'alu-reg' && d.inst.op === 'cp') return null; // CP reg, no immediate
  return null;
}

// ── extract branch target from conditional jump ─────────────────────
function getBranchTarget(d) {
  if (d.tag === 'jr-conditional') return { target: d.inst.target, condition: d.inst.condition };
  if (d.tag === 'jp-conditional') return { target: d.inst.target, condition: d.inst.condition };
  if (d.tag === 'jr') return { target: d.inst.target, condition: 'always' };
  if (d.tag === 'jp') return { target: d.inst.target, condition: 'always' };
  return null;
}

// ── main: disassemble the dispatch region ───────────────────────────
// Start slightly before 0x08C3C3 to capture the OR A / JR NZ preamble
const REGION_START = 0x08C3BD;
const MAX_INSNS = 200;

console.log('# Phase 579: Key Dispatch Cascade Decode');
console.log('');
console.log('## Full Disassembly of Dispatch Region');
console.log('');

const allInsns = [];
let pc = REGION_START;
for (let i = 0; i < MAX_INSNS && pc < REGION_START + 600; i++) {
  const d = decode(pc);
  allInsns.push(d);
  pc += d.length;
}

// Print full disassembly
for (const d of allInsns) {
  console.log(`  ${hex(d.pc)}: ${d.asm}`);
}

// ── find all CP + conditional branch pairs ──────────────────────────
console.log('');
console.log('## CP Dispatch Table');
console.log('');
console.log('| Key Code | Key Name | CP Address | Branch | Condition | Handler Address |');
console.log('|----------|----------|------------|--------|-----------|-----------------|');

const handlers = [];

for (let i = 0; i < allInsns.length; i++) {
  const cpVal = getCpValue(allInsns[i]);
  if (cpVal === null) continue;

  // Look ahead for the next conditional or unconditional branch
  let branch = null;
  for (let j = i + 1; j < Math.min(i + 4, allInsns.length); j++) {
    branch = getBranchTarget(allInsns[j]);
    if (branch) {
      branch.branchPc = allInsns[j].pc;
      branch.branchAsm = allInsns[j].asm;
      break;
    }
  }

  const keyName = lookupKeyName(cpVal);
  const handlerAddr = branch ? branch.target : null;

  console.log(`| ${hexByte(cpVal)} | ${keyName} | ${hex(allInsns[i].pc)} | ${branch?.branchAsm || 'none'} | ${branch?.condition || '-'} | ${handlerAddr !== null ? hex(handlerAddr) : 'unknown'} |`);

  if (handlerAddr !== null) {
    handlers.push({ keyCode: cpVal, keyName, cpAddr: allInsns[i].pc, handlerAddr });
  }
}

// ── disassemble each handler ────────────────────────────────────────
console.log('');
console.log('## Handler Disassembly');

for (const h of handlers) {
  console.log('');
  console.log(`### ${hexByte(h.keyCode)} ${h.keyName} -> ${hex(h.handlerAddr)}`);
  console.log('');

  const handlerInsns = disassemble(h.handlerAddr, 30);

  const calls = [];
  const ramWrites = [];
  let terminalJp = null;

  for (const d of handlerInsns) {
    console.log(`  ${hex(d.pc)}: ${d.asm}`);

    // Collect CALLs
    if (d.tag === 'call' || d.tag === 'call-conditional') {
      calls.push(hex(d.inst.target));
    }
    // Collect RAM writes (LD (addr), reg)
    if (d.tag === 'ld-mem-reg' || d.tag === 'ld-mem-pair') {
      ramWrites.push(d.asm);
    }
    // Track terminal JP
    if (d.tag === 'jp') {
      terminalJp = hex(d.inst.target);
    }
  }

  console.log('');
  console.log(`  Summary: ${calls.length ? 'CALL ' + calls.join(', ') : 'no CALLs'}`);
  if (ramWrites.length) console.log(`  RAM writes: ${ramWrites.join('; ')}`);
  if (terminalJp) console.log(`  Terminal: JP ${terminalJp}`);
}

// ── check for expected key codes ────────────────────────────────────
const EXPECTED = [0xB4, 0x3F, 0x28, 0x29, 0x58, 0x7F, 0xFE, 0xFC, 0xFA];
const foundCodes = new Set(handlers.map(h => h.keyCode));
const missing = EXPECTED.filter(c => !foundCodes.has(c));

console.log('');
if (missing.length) {
  console.log(`WARNING: Expected key codes not found in dispatch: ${missing.map(c => hexByte(c)).join(', ')}`);
} else {
  console.log('All 9 expected key codes found in dispatch.');
}

const extra = handlers.filter(h => !EXPECTED.includes(h.keyCode));
if (extra.length) {
  console.log(`Additional key codes found: ${extra.map(h => `${hexByte(h.keyCode)} (${h.keyName})`).join(', ')}`);
}

console.log('');
console.log('DONE');
