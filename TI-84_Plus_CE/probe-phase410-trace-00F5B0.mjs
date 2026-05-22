#!/usr/bin/env node
/**
 * Phase 410: Trace syscall 0x0004A0 -> 0x00F5B0 (Notification Delivery)
 *
 * Uses the project's eZ80 decoder in ADL mode for correct disassembly.
 * Traces the notification delivery handler and its sub-functions.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

// ── helpers ──────────────────────────────────────────────────────────
function read8(off)  { return rom[off]; }
function read24(off) { return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16); }
function hex(n, w = 6) { return '0x' + n.toString(16).toUpperCase().padStart(w, '0'); }

/** Format a decoded instruction into readable text */
function formatInstr(instr) {
  const tag = instr.tag;
  const u = s => s ? s.toUpperCase() : '?';
  const idxDisp = (ir, d) => `(${u(ir)}${d >= 0 ? '+' : ''}${d})`;

  try {
    // Simple zero-operand
    const SIMPLE = {
      'nop': 'NOP', 'halt': 'HALT', 'ret': 'RET', 'reti': 'RETI', 'retn': 'RETN',
      'di': 'DI', 'ei': 'EI', 'exx': 'EXX', 'ex-af': "EX AF,AF'", 'ex-de-hl': 'EX DE,HL',
      'scf': 'SCF', 'ccf': 'CCF', 'cpl': 'CPL', 'daa': 'DAA', 'neg': 'NEG',
      'rlca': 'RLCA', 'rrca': 'RRCA', 'rla': 'RLA', 'rra': 'RRA',
      'ldi': 'LDI', 'ldd': 'LDD', 'ldir': 'LDIR', 'lddr': 'LDDR',
      'cpi': 'CPI', 'cpd': 'CPD', 'cpir': 'CPIR', 'cpdr': 'CPDR',
      'outi': 'OUTI', 'outd': 'OUTD', 'otir': 'OTIR', 'otdr': 'OTDR',
      'ini': 'INI', 'ind': 'IND', 'inir': 'INIR', 'indr': 'INDR',
      'rrd': 'RRD', 'rld': 'RLD',
      'or-a': 'OR A', 'xor-a': 'XOR A',
      'ex-sp-hl': 'EX (SP),HL', 'ld-sp-hl': 'LD SP,HL', 'jp-hl': 'JP (HL)',
      'ex-sp-ix': 'EX (SP),IX', 'ex-sp-iy': 'EX (SP),IY',
      'ld-sp-ix': 'LD SP,IX', 'ld-sp-iy': 'LD SP,IY',
      'jp-ix': 'JP (IX)', 'jp-iy': 'JP (IY)',
    };
    if (SIMPLE[tag]) return SIMPLE[tag];

    // Indexed register helper
    const ir = instr.indexRegister || instr.indexReg;
    const d = instr.displacement;

    switch (tag) {
      // Loads
      case 'ld-pair-imm': return `LD ${u(instr.pair)},${hex(instr.value)}`;
      case 'ld-reg-imm': return `LD ${u(instr.dest)},${hex(instr.value, 2)}`;
      case 'ld-ind-imm': return `LD (HL),${hex(instr.value, 2)}`;
      case 'ld-reg-reg': return `LD ${u(instr.dest)},${u(instr.src)}`;
      case 'ld-a-mem': return `LD A,(${hex(instr.address ?? instr.addr)})`;
      case 'ld-mem-a': return `LD (${hex(instr.address ?? instr.addr)}),A`;
      case 'ld-hl-mem': return `LD HL,(${hex(instr.address ?? instr.addr)})`;
      case 'ld-mem-hl': return `LD (${hex(instr.address ?? instr.addr)}),HL`;
      case 'ld-reg-mem': return `LD ${u(instr.dest)},(${ hex(instr.addr ?? instr.address)})`;
      case 'ld-mem-reg': return `LD (${hex(instr.addr ?? instr.address)}),${u(instr.src)}`;
      case 'ld-a-bc': return 'LD A,(BC)';
      case 'ld-a-de': return 'LD A,(DE)';
      case 'ld-bc-a': return 'LD (BC),A';
      case 'ld-de-a': return 'LD (DE),A';
      case 'ld-a-ind': return `LD A,(${u(instr.indirectRegister || 'hl')})`;
      case 'ld-ind-a': return `LD (${u(instr.indirectRegister || 'hl')}),A`;
      case 'ld-ind-reg': return `LD (HL),${u(instr.src)}`;
      case 'ld-reg-ind': return `LD ${u(instr.dest)},(HL)`;

      // IX/IY loads
      case 'ld-ixd-imm': case 'ld-iyd-imm':
      case 'ld-idx-disp-imm': return `LD ${idxDisp(ir, d)},${hex(instr.value, 2)}`;
      case 'ld-idx-pair-imm': return `LD ${u(ir)},${hex(instr.value)}`;
      case 'ld-idx-mem': return `LD ${u(ir)},(${hex(instr.address)})`;
      case 'ld-mem-idx': return `LD (${hex(instr.address)}),${u(ir)}`;
      case 'ld-ixd-reg': case 'ld-iyd-reg':
      case 'ld-idx-disp-reg': return `LD ${idxDisp(ir, d)},${u(instr.src || instr.register)}`;
      case 'ld-reg-ixd': case 'ld-reg-iyd':
      case 'ld-reg-idx-disp': return `LD ${u(instr.dest || instr.register)},${idxDisp(ir, d)}`;
      case 'ld-pair-indexed':
        return `LD ${u(instr.pair)},${idxDisp(ir, d)}`;

      // ED loads
      case 'ld-mem-pair': return `LD (${hex(instr.address)}),${u(instr.pair)}`;
      case 'ld-pair-mem': return `LD ${u(instr.pair)},(${hex(instr.address)})`;
      case 'ld-i-a': return 'LD I,A';
      case 'ld-r-a': return 'LD R,A';
      case 'ld-a-i': return 'LD A,I';
      case 'ld-a-r': return 'LD A,R';
      case 'ld-a-mb': return 'LD A,MB';
      case 'ld-mb-a': return 'LD MB,A';

      // INC/DEC
      case 'inc-pair': return `INC ${u(instr.pair)}`;
      case 'dec-pair': return `DEC ${u(instr.pair)}`;
      case 'inc-reg': return `INC ${u(instr.reg)}`;
      case 'dec-reg': return `DEC ${u(instr.reg)}`;
      case 'inc-idx': return `INC ${u(ir)}`;
      case 'dec-idx': return `DEC ${u(ir)}`;
      case 'inc-idx-disp': case 'inc-ixd': case 'inc-iyd':
        return `INC ${idxDisp(ir, d)}`;
      case 'dec-idx-disp': case 'dec-ixd': case 'dec-iyd':
        return `DEC ${idxDisp(ir, d)}`;

      // ALU
      case 'alu-reg': return `${u(instr.op)} ${u(instr.reg)}`;
      case 'alu-imm': return `${u(instr.op)} ${hex(instr.value, 2)}`;
      case 'alu-ind': return `${u(instr.op)} (HL)`;
      case 'alu-idx-disp': case 'alu-ixd': case 'alu-iyd':
        return `${u(instr.op)} ${idxDisp(ir, d)}`;
      case 'add-pair': return `ADD HL,${u(instr.pair)}`;
      case 'adc-pair': return `ADC HL,${u(instr.pair)}`;
      case 'sbc-pair': return `SBC HL,${u(instr.pair)}`;
      case 'add-idx-pair': return `ADD ${u(ir)},${u(instr.pair)}`;

      // Jumps
      case 'jp': return `JP ${hex(instr.target)}`;
      case 'jp-cc': case 'jp-conditional': return `JP ${u(instr.condition)},${hex(instr.target)}`;
      case 'jr': return `JR ${hex(instr.target)}`;
      case 'jr-cc': case 'jr-conditional': return `JR ${u(instr.condition)},${hex(instr.target)}`;
      case 'djnz': return `DJNZ ${hex(instr.target)}`;
      case 'call': return `CALL ${hex(instr.target)}`;
      case 'call-cc': case 'call-conditional': return `CALL ${u(instr.condition)},${hex(instr.target)}`;
      case 'ret-cc': case 'ret-conditional': return `RET ${u(instr.condition)}`;
      case 'rst': return `RST ${hex(instr.vector ?? instr.target ?? 0, 2)}`;

      // PUSH/POP
      case 'push': return `PUSH ${u(instr.pair)}`;
      case 'pop': return `POP ${u(instr.pair)}`;
      case 'push-idx': return `PUSH ${u(ir)}`;
      case 'pop-idx': return `POP ${u(ir)}`;

      // Bit ops
      case 'bit-test': return `BIT ${instr.bit},${u(instr.reg)}`;
      case 'bit-set': return `SET ${instr.bit},${u(instr.reg)}`;
      case 'bit-res': return `RES ${instr.bit},${u(instr.reg)}`;
      case 'bit-test-ind': return `BIT ${instr.bit},(HL)`;
      case 'bit-set-ind': return `SET ${instr.bit},(HL)`;
      case 'bit-res-ind': return `RES ${instr.bit},(HL)`;
      case 'rotate-reg': return `${u(instr.op)} ${u(instr.reg)}`;
      case 'rotate-ind': return `${u(instr.op)} (HL)`;

      // Interrupts
      case 'im': return `IM ${instr.mode_val ?? instr.interruptMode ?? '?'}`;

      // I/O
      case 'out-imm': return `OUT (${hex(instr.port, 2)}),A`;
      case 'in-imm': return `IN A,(${hex(instr.port, 2)})`;
      case 'out-c': return `OUT (C),${u(instr.reg)}`;
      case 'in-c': return `IN ${u(instr.reg)},(C)`;

      // TST
      case 'tst-a-imm': return `TST A,${hex(instr.value, 2)}`;
      case 'tst-a-reg': return `TST A,${u(instr.reg)}`;

      // LEA
      case 'lea': return `LEA ${u(instr.dest)},${idxDisp(ir, d)}`;

      // PEA
      case 'pea': return `PEA ${idxDisp(ir, d)}`;

      // MLT
      case 'mlt': return `MLT ${u(instr.pair)}`;

      default: return `[${tag}]`;
    }
  } catch (e) {
    return `[${tag} ERR: ${e.message}]`;
  }
}

/** Extract CALL/JP/JR targets and RAM addresses from an instruction */
function extractTargets(instr) {
  const calls = [];
  const jumps = [];
  const ram = [];

  switch (instr.tag) {
    case 'call': case 'call-cc': case 'call-conditional': calls.push(instr.target); break;
    case 'jp': case 'jp-cc': case 'jp-conditional': jumps.push(instr.target); break;
    case 'jr': case 'jr-cc': case 'jr-conditional': case 'djnz': jumps.push(instr.target); break;
    case 'rst': if (instr.vector != null) calls.push(instr.vector); else if (instr.target != null) calls.push(instr.target); break;
  }

  // RAM addresses — check all address-like fields
  for (const key of ['address', 'addr', 'target']) {
    if (key === 'target' && (calls.length || jumps.length)) continue; // already handled
    const addr = instr[key];
    if (addr !== undefined && addr >= 0xD00000) ram.push(addr);
  }

  return { calls, jumps, ram };
}

function isRet(instr) {
  return instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn';
}

function isUnconditionalJP(instr) {
  return instr.tag === 'jp';
}

function isJPIndirect(instr) {
  return instr.tag === 'jp-hl' || instr.tag === 'jp-ix' || instr.tag === 'jp-iy';
}

function isConditionalRet(instr) {
  return instr.tag === 'ret-cc' || instr.tag === 'ret-conditional';
}

// ── disassemble a function ───────────────────────────────────────────
function disasmFunction(startAddr, label, maxInstr = 200) {
  console.log(`\n=== ${label} at ${hex(startAddr)} ===\n`);

  const allCalls = new Set();
  const allJumps = new Set();
  const allRam = new Set();
  const lines = [];
  let pc = startAddr;
  let count = 0;
  let endReason = 'max instructions';

  while (count < maxInstr && pc < 0x400000) {
    let instr;
    try {
      instr = decodeInstruction(rom, pc, 'adl');
    } catch (e) {
      console.log(`${hex(pc)}:  [decode error: ${e.message}]`);
      break;
    }

    const text = formatInstr(instr);
    const { calls, jumps, ram } = extractTargets(instr);
    calls.forEach(c => allCalls.add(c));
    jumps.forEach(j => allJumps.add(j));
    ram.forEach(r => allRam.add(r));

    // Raw bytes
    const bytes = [];
    for (let i = 0; i < instr.length; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);

    let annotation = '';
    if (calls.length) annotation = '  ; CALL';
    if (jumps.length) {
      const jType = instr.tag === 'jp' ? 'unconditional' : 'conditional';
      annotation += (annotation ? ' + ' : '  ; ') + jType + ' jump';
    }
    if (ram.length) annotation += (annotation ? ', ' : '  ; ') + 'RAM';

    // Mode prefix
    const pfx = instr.modePrefix ? `[${instr.modePrefix}] ` : '';
    console.log(`${hex(pc)}:  ${byteStr}  ${pfx}${text}${annotation}`);
    lines.push({ addr: pc, text, instr, calls, jumps, ram });

    if (isRet(instr)) {
      endReason = 'RET';
      console.log(`  >>> RET at ${hex(pc)}`);
      break;
    }

    if (isJPIndirect(instr)) {
      endReason = 'JP indirect';
      console.log(`  >>> JP indirect at ${hex(pc)}`);
      break;
    }

    if (isUnconditionalJP(instr)) {
      const t = instr.target;
      // Follow internal jumps
      if (t >= startAddr && t < startAddr + 0x800) {
        pc = t;
        count++;
        continue;
      }
      endReason = `tail JP to ${hex(t)}`;
      console.log(`  >>> tail JP to ${hex(t)}`);
      break;
    }

    pc = instr.nextPc;
    count++;
  }

  return { allCalls, allJumps, allRam, lines, endReason, instrCount: count };
}

// ── main ─────────────────────────────────────────────────────────────
console.log('========================================');
console.log('Phase 410: Trace Syscall 0x0004A0 -> 0x00F5B0');
console.log('========================================\n');

// Step 1: Verify syscall vector
const vecByte = read8(0x0004A0);
const vecTarget = read24(0x0004A1);
console.log('--- Syscall Vector Verification ---');
console.log(`Bytes at 0x0004A0: ${[0,1,2,3].map(i => rom[0x0004A0 + i].toString(16).padStart(2,'0')).join(' ')}`);
if (vecByte === 0xC3 && vecTarget === 0x00F5B0) {
  console.log('CONFIRMED: JP 0x00F5B0');
} else {
  console.log(`UNEXPECTED: opcode=${hex(vecByte, 2)}, target=${hex(vecTarget)}`);
}

// Step 2: Disassemble main function
const main = disasmFunction(0x00F5B0, 'Main handler (syscall 0x0004A0)', 200);

// Step 3: Also disassemble 0x00FB66 and 0x00FB69 (exit paths)
const fb66 = disasmFunction(0x00FB66, 'Exit path 0x00FB66', 60);
const fb69 = disasmFunction(0x00FB69, 'Exit path 0x00FB69', 60);

// Step 4: Also disassemble 0x00FB6E (next syscall vector at 0x0004A4)
const fb6e = disasmFunction(0x00FB6E, 'Next syscall 0x0004A4 handler (0x00FB6E)', 60);

// Step 4b: Trace the JR Z branch at 0x00F636 (the "D14084 == 0" path)
const f636 = disasmFunction(0x00F636, 'Branch at 0x00F636 (D14084==0 path)', 80);

// Step 5: Follow interesting sub-functions from main
const allCalls = new Set([...main.allCalls, ...fb66.allCalls, ...fb69.allCalls, ...f636.allCalls]);
const allRam = new Set([...main.allRam, ...fb66.allRam, ...fb69.allRam]);

// Disassemble sub-functions (one level)
const seen = new Set([0x00F5B0, 0x00FB66, 0x00FB69, 0x00FB6E]);
const subTargets = [...allCalls].filter(t => !seen.has(t) && t < 0x400000 && t > 0x100).sort((a, b) => a - b);

for (const target of subTargets.slice(0, 15)) {
  seen.add(target);
  const sub = disasmFunction(target, `Sub-function`, 60);
  sub.allCalls.forEach(c => allCalls.add(c));
  sub.allRam.forEach(r => allRam.add(r));
}

// Step 6: Summary
console.log('\n\n==================');
console.log('=== SUMMARY ===');
console.log('==================\n');

console.log('Main function:');
console.log(`  Start: ${hex(0x00F5B0)}`);
console.log(`  End reason: ${main.endReason}`);
console.log(`  Instructions: ${main.instrCount}`);

console.log('\nAll CALL targets:');
[...allCalls].filter(a => a != null).sort((a, b) => a - b).forEach(a => console.log(`  ${hex(a)}`));

console.log('\nAll RAM addresses accessed:');
[...allRam].filter(a => a != null).sort((a, b) => a - b).forEach(a => console.log(`  ${hex(a)}`));

// Step 7: Nearby syscall vectors
console.log('\n--- Nearby syscall vectors ---');
for (let i = 0x000490; i <= 0x0004B0; i += 4) {
  const op = read8(i);
  if (op === 0xC3) {
    const t = read24(i + 1);
    console.log(`  ${hex(i)}: JP ${hex(t)}`);
  }
}

console.log('\n=== Phase 410 probe complete ===');
