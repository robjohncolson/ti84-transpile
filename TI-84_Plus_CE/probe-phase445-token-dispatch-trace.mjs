#!/usr/bin/env node
/**
 * Phase 445: Trace token dispatch and display refresh paths
 *
 * Disassembles key dispatch at 0x05D58F, its callers at 0x02BDA3 and 0x02BDDE,
 * notification setup at 0x02B373, all CALL 0x003D5A sites in ROM, and all
 * writes to D141B5 (key buffer). Goal: find the REAL home screen event loop
 * and trace from scan code → token → VRAM write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0').toUpperCase();
}

/** Format a decoded instruction into a human-readable string. */
function fmtInstr(ins) {
  const addr = hex(ins.pc);
  const rawBytes = [];
  for (let i = ins.pc; i < ins.pc + ins.length; i++) {
    rawBytes.push((romBytes[i] ?? 0).toString(16).padStart(2, '0').toUpperCase());
  }
  const bytesStr = rawBytes.join(' ').padEnd(20);

  // Build mnemonic from tag + fields
  let asm = ins.tag;
  switch (ins.tag) {
    case 'call':
      asm = `CALL ${ins.condition ? ins.condition + ', ' : ''}${hex(ins.target)}`;
      break;
    case 'jp':
      asm = `JP ${ins.condition ? ins.condition + ', ' : ''}${hex(ins.target)}`;
      break;
    case 'jr':
      asm = `JR ${ins.condition ? ins.condition + ', ' : ''}${hex(ins.target)}`;
      break;
    case 'ret':
      asm = `RET${ins.condition ? ' ' + ins.condition : ''}`;
      break;
    case 'ld-pair-imm':
      asm = `LD ${ins.pair.toUpperCase()}, ${hex(ins.value)}`;
      break;
    case 'ld-pair-mem':
      asm = `LD ${ins.pair.toUpperCase()}, (${hex(ins.addr)})`;
      break;
    case 'ld-mem-pair':
      asm = `LD (${hex(ins.addr)}), ${ins.pair.toUpperCase()}`;
      break;
    case 'ld-mem-reg':
      asm = `LD (${hex(ins.addr)}), ${ins.src.toUpperCase()}`;
      break;
    case 'ld-reg-mem':
      asm = `LD ${ins.dest ? ins.dest.toUpperCase() : '?'}, (${hex(ins.addr)})`;
      break;
    case 'ld-ind-reg':
      asm = `LD (${ins.dest ? ins.dest.toUpperCase() : 'HL'}), ${ins.src ? ins.src.toUpperCase() : '?'}`;
      break;
    case 'ld-ind-imm':
      asm = `LD (${ins.dest ? ins.dest.toUpperCase() : 'HL'}), ${hex(ins.value, 2)}`;
      break;
    case 'inc-pair':
      asm = `INC ${ins.pair.toUpperCase()}`;
      break;
    case 'dec-pair':
      asm = `DEC ${ins.pair.toUpperCase()}`;
      break;
    case 'push':
      asm = `PUSH ${ins.pair.toUpperCase()}`;
      break;
    case 'pop':
      asm = `POP ${ins.pair.toUpperCase()}`;
      break;
    case 'nop':
      asm = 'NOP';
      break;
    case 'di':
      asm = 'DI';
      break;
    case 'ei':
      asm = 'EI';
      break;
    case 'halt':
      asm = 'HALT';
      break;
    case 'xor':
      asm = `XOR ${ins.src ? ins.src.toUpperCase() : 'A'}`;
      break;
    case 'or':
      asm = `OR ${ins.src ? ins.src.toUpperCase() : 'A'}`;
      break;
    case 'and':
      asm = `AND ${ins.src ? ins.src.toUpperCase() : 'A'}`;
      break;
    case 'cp':
      asm = `CP ${ins.value !== undefined ? hex(ins.value, 2) : ins.src ? ins.src.toUpperCase() : '?'}`;
      break;
    case 'add':
      asm = `ADD ${ins.dest ? ins.dest.toUpperCase() + ', ' : ''}${ins.src ? ins.src.toUpperCase() : hex(ins.value ?? 0, 2)}`;
      break;
    case 'sub':
      asm = `SUB ${ins.src ? ins.src.toUpperCase() : hex(ins.value ?? 0, 2)}`;
      break;
    case 'ld-reg-imm':
      asm = `LD ${ins.dest ? ins.dest.toUpperCase() : '?'}, ${hex(ins.value, 2)}`;
      break;
    case 'ld-reg-reg':
      asm = `LD ${(ins.dest || '?').toUpperCase()}, ${(ins.src || '?').toUpperCase()}`;
      break;
    case 'djnz':
      asm = `DJNZ ${hex(ins.target)}`;
      break;
    case 'reti':
      asm = 'RETI';
      break;
    case 'rst':
      asm = `RST ${hex(ins.target, 2)}`;
      break;
    case 'out0':
      asm = `OUT0 (${hex(ins.port, 2)}), ${ins.src ? ins.src.toUpperCase() : 'A'}`;
      break;
    case 'in0':
      asm = `IN0 ${ins.dest ? ins.dest.toUpperCase() : 'A'}, (${hex(ins.port, 2)})`;
      break;
    case 'bit':
      asm = `BIT ${ins.bit}, ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'set':
      asm = `SET ${ins.bit}, ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'res':
      asm = `RES ${ins.bit}, ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'sla':
      asm = `SLA ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'sra':
      asm = `SRA ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'srl':
      asm = `SRL ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'rl':
      asm = `RL ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'rr-shift':
      asm = `RR ${ins.reg ? ins.reg.toUpperCase() : '?'}`;
      break;
    case 'ldir':
      asm = 'LDIR';
      break;
    case 'lddr':
      asm = 'LDDR';
      break;
    case 'cpl':
      asm = 'CPL';
      break;
    case 'scf':
      asm = 'SCF';
      break;
    case 'ccf':
      asm = 'CCF';
      break;
    case 'ex-de-hl':
      asm = 'EX DE, HL';
      break;
    case 'im':
      asm = `IM ${ins.mode ?? '?'}`;
      break;
    default: {
      // Fallback: dump tag + all numeric fields
      const extras = Object.entries(ins)
        .filter(([k]) => !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`)
        .join(' ');
      asm = `${ins.tag} ${extras}`.trim();
    }
  }

  const prefix = ins.modePrefix ? `[${ins.modePrefix}] ` : '';
  return `${addr}  ${bytesStr} ${prefix}${asm}`;
}

/** Disassemble a range and return array of formatted lines. */
function disasmRange(start, end) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    const ins = decodeInstruction(romBytes, pc, 'adl');
    lines.push(fmtInstr(ins));
    pc = ins.nextPc;
    if (ins.length === 0) { pc++; } // safety: avoid infinite loop on unknown
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 1. Disassemble key dispatch at 0x05D58F-0x05D5F0
// ---------------------------------------------------------------------------
console.log('=== KEY DISPATCH 0x05D58F-0x05D5F0 ===');
const dispatchLines = disasmRange(0x05D58F, 0x05D5F0);
dispatchLines.forEach(l => console.log(l));

// ---------------------------------------------------------------------------
// 2. Disassemble notification setup at 0x02B373-0x02B430
// ---------------------------------------------------------------------------
console.log('\n=== NOTIFICATION SETUP 0x02B373-0x02B430 ===');
const notifLines = disasmRange(0x02B373, 0x02B430);
notifLines.forEach(l => console.log(l));

// ---------------------------------------------------------------------------
// 3. Disassemble 0x05D58F callers: 0x02BDA3-0x02BE30
// ---------------------------------------------------------------------------
console.log('\n=== CALLER 1: 0x02BDA3-0x02BE30 ===');
const caller1Lines = disasmRange(0x02BDA3, 0x02BE30);
caller1Lines.forEach(l => console.log(l));

// Also disassemble wider context around 0x02BDDE
console.log('\n=== CALLER 2 CONTEXT: 0x02BDD0-0x02BE30 ===');
const caller2Lines = disasmRange(0x02BDD0, 0x02BE30);
caller2Lines.forEach(l => console.log(l));

// ---------------------------------------------------------------------------
// 4. Find all CALL 0x003D5A in ROM (_GetCSC callers)
// ---------------------------------------------------------------------------
console.log('\n=== ALL CALL 0x003D5A (_GetCSC) SITES IN ROM ===');
// CALL imm24 in ADL mode: CD 5A 3D 00
const getCSCCallers = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xCD && romBytes[i + 1] === 0x5A && romBytes[i + 2] === 0x3D && romBytes[i + 3] === 0x00) {
    getCSCCallers.push(i);
    console.log(`CALL 0x003D5A at ${hex(i)}`);
  }
}
console.log(`Total: ${getCSCCallers.length} sites`);

// For each caller, disassemble a few instructions of context before and after
console.log('\n=== CONTEXT AROUND _GetCSC CALLERS ===');
for (const addr of getCSCCallers) {
  const contextStart = Math.max(0, addr - 20);
  const contextEnd = Math.min(romBytes.length, addr + 30);
  console.log(`\n--- Context at ${hex(addr)} ---`);
  const ctxLines = disasmRange(contextStart, contextEnd);
  ctxLines.forEach(l => console.log(l));
}

// ---------------------------------------------------------------------------
// 5. Find all writes to D141B5 in ROM
// ---------------------------------------------------------------------------
console.log('\n=== ALL WRITES TO D141B5 ===');

// LD (D141B5), A = 0x32 0xB5 0x41 0xD1
const writeD141B5_a = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x32 && romBytes[i + 1] === 0xB5 && romBytes[i + 2] === 0x41 && romBytes[i + 3] === 0xD1) {
    writeD141B5_a.push(i);
    console.log(`LD (0xD141B5), A at ${hex(i)}`);
  }
}

// LD (D141B5), HL via ED opcode: ED 22 B5 41 D1 (SIS) or ED 63 B5 41 D1 (ADL LD (nn),HL)
// Actually in eZ80 ADL: LD (nn),HL = ED 63 nn nn nn (but there's also 0x22 for LD (nn),HL in main)
// 0x22 = LD (nn), HL (main opcode in ADL mode: 22 B5 41 D1)
const writeD141B5_hl = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x22 && romBytes[i + 1] === 0xB5 && romBytes[i + 2] === 0x41 && romBytes[i + 3] === 0xD1) {
    writeD141B5_hl.push(i);
    console.log(`LD (0xD141B5), HL at ${hex(i)}`);
  }
}

// ED 43/53/63/73 nn = LD (nn), BC/DE/HL/SP
for (const [regOp, regName] of [[0x43, 'BC'], [0x53, 'DE'], [0x63, 'HL'], [0x73, 'SP']]) {
  for (let i = 0; i < romBytes.length - 4; i++) {
    if (romBytes[i] === 0xED && romBytes[i + 1] === regOp &&
        romBytes[i + 2] === 0xB5 && romBytes[i + 3] === 0x41 && romBytes[i + 4] === 0xD1) {
      console.log(`LD (0xD141B5), ${regName} [ED] at ${hex(i)}`);
    }
  }
}

// Also check for LD (HL/IX/IY indirect) patterns where HL = D141B5
// This is harder to find statically, but we can search for LD HL, D141B5 nearby
const loadD141B5 = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  // LD HL, imm24 = 0x21 B5 41 D1
  if (romBytes[i] === 0x21 && romBytes[i + 1] === 0xB5 && romBytes[i + 2] === 0x41 && romBytes[i + 3] === 0xD1) {
    loadD141B5.push(i);
    console.log(`LD HL, 0xD141B5 at ${hex(i)} (potential indirect write setup)`);
  }
}

// Also find reads: LD A, (D141B5) = 0x3A B5 41 D1
console.log('\n=== ALL READS FROM D141B5 ===');
const readD141B5 = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x3A && romBytes[i + 1] === 0xB5 && romBytes[i + 2] === 0x41 && romBytes[i + 3] === 0xD1) {
    readD141B5.push(i);
    console.log(`LD A, (0xD141B5) at ${hex(i)}`);
  }
}

// LD C, (D141B5) — ED prefix? Actually LD r, (nn) isn't standard z80.
// In eZ80 it might be different. Let's check for LD BC/DE/HL, (D141B5) via ED
for (const [regOp, regName] of [[0x4B, 'BC'], [0x5B, 'DE'], [0x6B, 'HL'], [0x7B, 'SP']]) {
  for (let i = 0; i < romBytes.length - 4; i++) {
    if (romBytes[i] === 0xED && romBytes[i + 1] === regOp &&
        romBytes[i + 2] === 0xB5 && romBytes[i + 3] === 0x41 && romBytes[i + 4] === 0xD1) {
      readD141B5.push(i);
      console.log(`LD ${regName}, (0xD141B5) [ED] at ${hex(i)}`);
    }
  }
}

// LD HL, (D141B5) via 0x2A B5 41 D1
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0x2A && romBytes[i + 1] === 0xB5 && romBytes[i + 2] === 0x41 && romBytes[i + 3] === 0xD1) {
    readD141B5.push(i);
    console.log(`LD HL, (0xD141B5) at ${hex(i)}`);
  }
}

console.log(`\nTotal writes: ${writeD141B5_a.length + writeD141B5_hl.length}`);
console.log(`Total reads: ${readD141B5.length}`);
console.log(`Total LD HL, D141B5 (imm): ${loadD141B5.length}`);

// ---------------------------------------------------------------------------
// 6. Disassemble the scheduler at ~0x001600 to find real event loop
// ---------------------------------------------------------------------------
console.log('\n=== SCHEDULER REGION 0x001600-0x001660 ===');
const schedLines = disasmRange(0x001600, 0x001660);
schedLines.forEach(l => console.log(l));

// ---------------------------------------------------------------------------
// 7. Disassemble 0x001794 (error detection / dispatch entry)
// ---------------------------------------------------------------------------
console.log('\n=== ERROR DETECTION / DISPATCH 0x001794-0x001810 ===');
const errDetLines = disasmRange(0x001794, 0x001810);
errDetLines.forEach(l => console.log(l));

// ---------------------------------------------------------------------------
// 8. Search for _GetCSC API thunk (0x003D5A itself and what calls it)
//    Also look for the jump table entry that maps to 0x003D5A
// ---------------------------------------------------------------------------
console.log('\n=== _GetCSC FUNCTION AT 0x003D5A ===');
const getCSCLines = disasmRange(0x003D5A, 0x003D80);
getCSCLines.forEach(l => console.log(l));

// Search for JP 0x003D5A (thunk/trampoline patterns)
console.log('\n=== JP 0x003D5A SITES ===');
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xC3 && romBytes[i + 1] === 0x5A && romBytes[i + 2] === 0x3D && romBytes[i + 3] === 0x00) {
    console.log(`JP 0x003D5A at ${hex(i)}`);
    // Show a few instructions of context
    const ctx = disasmRange(Math.max(0, i - 6), Math.min(romBytes.length, i + 10));
    ctx.forEach(l => console.log('  ' + l));
  }
}

// ---------------------------------------------------------------------------
// 9. Look for the home screen mode entry — search for calls to 0x05D5C2
//    (table installer) to find where mode-specific key tables are installed
// ---------------------------------------------------------------------------
console.log('\n=== CALLS TO 0x05D5C2 (KEY TABLE INSTALLER) ===');
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xCD && romBytes[i + 1] === 0xC2 && romBytes[i + 2] === 0xD5 && romBytes[i + 3] === 0x05) {
    console.log(`CALL 0x05D5C2 at ${hex(i)}`);
  }
}
// Also check for calls to syscall 0x021E78 (the thunk for 0x05D5C2)
console.log('\n=== CALLS TO 0x021E78 (TABLE INSTALLER SYSCALL) ===');
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xCD && romBytes[i + 1] === 0x78 && romBytes[i + 2] === 0x1E && romBytes[i + 3] === 0x02) {
    console.log(`CALL 0x021E78 at ${hex(i)}`);
    // Show context
    const ctx = disasmRange(Math.max(0, i - 15), Math.min(romBytes.length, i + 15));
    ctx.forEach(l => console.log('  ' + l));
  }
}

// ---------------------------------------------------------------------------
// 10. Wider scheduler context — look for the main OS loop
// ---------------------------------------------------------------------------
console.log('\n=== SCHEDULER WIDER CONTEXT 0x0015E0-0x001700 ===');
const schedWideLines = disasmRange(0x0015E0, 0x001700);
schedWideLines.forEach(l => console.log(l));

console.log('\n=== DONE ===');
