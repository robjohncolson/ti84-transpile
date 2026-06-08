// probe-phase569-decode-03E1B4.mjs
// Decode 0x03E1B4 — Error Processing Routine
// Discovered in ParseInp error handling paths; 0x03E1B1 referenced as sentinel/intercept point.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
function romByte(addr) { return rom[addr]; }
function romWord(addr) { return rom[addr] | (rom[addr+1] << 8); }
function rom24(addr) { return rom[addr] | (rom[addr+1] << 8) | (rom[addr+2] << 16); }

function hex(v, w = 6) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function hexB(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }

function bytesStr(addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(hexB(rom[addr + i]));
  return out.join(' ');
}

// Format a decoded instruction into a readable mnemonic string
function fmt(inst) {
  const t = inst.tag;
  if (!t) return `DB ${hexB(rom[inst.pc])}`;

  switch (t) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-ix': return 'JP (IX)';
    case 'jp-iy': return 'JP (IY)';
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rst': return `RST ${hex(inst.vector, 2)}`;

    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;

    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${inst.dest.toUpperCase()}), ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-ix': return 'LD SP, IX';
    case 'ld-sp-iy': return 'LD SP, IY';

    // Indexed loads: LD r, (IX+d) / LD (IX+d), r / LD (IX+d), n
    case 'indexed-load':
      if (inst.src && inst.src.startsWith && inst.displacement !== undefined)
        return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
      if (inst.dest && inst.displacement !== undefined && inst.value !== undefined)
        return `LD (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)}), ${hex(inst.value, 2)}`;
      if (inst.dest && inst.displacement !== undefined)
        return `LD (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)}), ${inst.src.toUpperCase()}`;
      return `INDEXED-LOAD ${JSON.stringify(inst)}`;
    case 'indexed-ld-reg':
      return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
    case 'indexed-ld-ind':
      return inst.value !== undefined
        ? `LD (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)}), ${hex(inst.value, 2)}`
        : `LD (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)}), ${inst.src.toUpperCase()}`;

    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-indexed':
      return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-indexed': return `INC (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
    case 'dec-indexed': return `DEC (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;

    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;

    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (HL)`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (HL)`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (HL)`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}+${hexB(inst.displacement & 0xFF)})`;

    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';

    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-ix': return 'EX (SP), IX';
    case 'ex-sp-iy': return 'EX (SP), IY';
    case 'exx': return 'EXX';

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

    case 'in-reg-c': return `IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in0': return `IN0 ${inst.reg.toUpperCase()}, (${hexB(inst.port)})`;
    case 'out0': return `OUT0 (${hexB(inst.port)}), ${inst.reg.toUpperCase()}`;
    case 'in-a-n': return `IN A, (${hex(inst.port, 2)})`;
    case 'out-n-a': return `OUT (${hex(inst.port, 2)}), A`;

    case 'im': return `IM ${inst.value !== undefined ? inst.value : inst.mode}`;

    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';

    case 'tst-imm': return `TST ${hex(inst.value, 2)}`;
    case 'tstio': return `TSTIO ${hex(inst.value, 2)}`;

    case 'ld-special':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'slp': return 'SLP';
    case 'otim': return 'OTIM';
    case 'otdm': return 'OTDM';
    case 'otimr': return 'OTIMR';
    case 'otdmr': return 'OTDMR';
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';

    case 'lea': return `LEA ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}+${hexB(inst.displacement & 0xFF)}`;
    case 'pea': return `PEA ${inst.src.toUpperCase()}+${hexB(inst.displacement & 0xFF)}`;

    case 'mlt': return `MLT ${inst.pair.toUpperCase()}`;

    default:
      return `[${t}] ${JSON.stringify(inst)}`;
  }
}

// Is this a terminator instruction?
function isTerminator(inst) {
  return inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-ix' || inst.tag === 'jp-iy';
}

// Decode a linear stream of instructions
function decodeLinear(start, maxInsns, stopOnTerminator) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInsns && pc < rom.length; i++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = inst.length || 1;
    rows.push({
      addr: pc,
      length: len,
      bytes: bytesStr(pc, len),
      text: fmt(inst),
      inst,
    });
    pc += len;
    if (stopOnTerminator && isTerminator(inst)) break;
  }
  return rows;
}

function printRows(rows) {
  for (const r of rows) {
    console.log(`  ${hex(r.addr)}:  ${r.bytes.padEnd(20)} ${r.text}`);
  }
}

// Scan ROM for CALL/JP/conditional references to a target
function scanRefs(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const condCallOps = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const refs = [];
  for (let addr = 0; addr < 0x400000 - 3; addr++) {
    if (rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      const op = rom[addr];
      if (op === 0xCD) refs.push({ addr, kind: 'CALL' });
      else if (op === 0xC3) refs.push({ addr, kind: 'JP' });
      else if (condCallOps.includes(op)) refs.push({ addr, kind: 'CALL cc' });
      else if (condJpOps.includes(op)) refs.push({ addr, kind: 'JP cc' });
    }
  }
  return refs;
}

// ============================================================
console.log('==============================================');
console.log('Phase 569: Decode 0x03E1B4 Error Processing');
console.log('==============================================');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Bytes at 0x03E1B4: ${bytesStr(0x03E1B4, 16)}`);
console.log('');

// 1) Context from 0x03E1A0 — find if 0x03E1B4 is mid-function
console.log('=== Context: linear decode from 0x03E1A0 ===');
const contextRows = decodeLinear(0x03E1A0, 80, true);
printRows(contextRows);

// Check alignment
let aligned = false;
for (const r of contextRows) {
  if (r.addr === 0x03E1B4) { aligned = true; break; }
}
if (aligned) {
  console.log('  --> 0x03E1B4 is instruction-aligned from 0x03E1A0.');
} else {
  console.log('  --> 0x03E1B4 NOT reached / not aligned from 0x03E1A0 context.');
}
console.log('');

// 2) Decode from sentinel 0x03E1B1
console.log('=== Decode from sentinel 0x03E1B1 ===');
const sentinelRows = decodeLinear(0x03E1B1, 80, true);
printRows(sentinelRows);
console.log('');

// 3) Decode from 0x03E1B4 specifically — the main target
console.log('=== Decode from 0x03E1B4 (error processing) ===');
const targetRows = decodeLinear(0x03E1B4, 120, true);
printRows(targetRows);
const last = targetRows[targetRows.length - 1];
const endAddr = last ? last.addr + last.length : 0x03E1B4;
console.log(`  Function: ${hex(0x03E1B4)}..${hex(endAddr - 1)} = ${endAddr - 0x03E1B4} bytes, ${targetRows.length} instructions`);
console.log(`  Terminator: ${last ? last.text : 'none'}`);
console.log('');

// 4) Error state analysis
console.log('=== Error State Analysis ===');
for (const r of targetRows) {
  const t = r.text;
  const tag = r.inst.tag || '';

  // IY-relative accesses (OS flags)
  if (t.includes('IY+') || t.includes('IY-')) {
    console.log(`  ${hex(r.addr)}: IY access — ${t}`);
  }

  // Direct RAM accesses (D0xxxx range)
  if (r.inst.addr >= 0xD00000 || (r.inst.target >= 0xD00000)) {
    // handled below
  }
  if (t.match(/\(0x[0-9A-F]{5,6}\)/)) {
    const m = t.match(/0x([0-9A-F]{5,6})/);
    if (m) {
      const a = parseInt(m[1], 16);
      if (a >= 0xD00000) console.log(`  ${hex(r.addr)}: RAM ${hex(a)} — ${t}`);
    }
  }

  // CALL/JP targets
  if (tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional') {
    console.log(`  ${hex(r.addr)}: ${tag.toUpperCase()} — ${t}`);
  }

  // CP / comparisons
  if (tag === 'alu-imm' && r.inst.op === 'cp') {
    console.log(`  ${hex(r.addr)}: Compare — ${t}`);
  }

  // DI / EI (interrupt management)
  if (tag === 'di' || tag === 'ei') {
    console.log(`  ${hex(r.addr)}: Interrupt — ${t}`);
  }

  // LD A, I / LD A, R (interrupt flag reads)
  if (tag === 'ld-a-i' || tag === 'ld-a-r') {
    console.log(`  ${hex(r.addr)}: IFF read — ${t}`);
  }
}
console.log('');

// 5) Continue decoding past the first terminator to see what follows
console.log('=== What follows after the function ===');
const afterRows = decodeLinear(endAddr, 30, true);
printRows(afterRows);
console.log('');

// 6) ROM reference scan
console.log('=== ROM References ===');

function printRefs(label, addr) {
  const refs = scanRefs(addr);
  console.log(`${label} (${hex(addr)}): ${refs.length} total refs`);
  for (const ref of refs) {
    console.log(`  ${hex(ref.addr)}: ${ref.kind}`);
  }
  return refs;
}

printRefs('0x03E1B4 error processing', 0x03E1B4);
console.log('');
printRefs('0x03E1B1 sentinel/intercept', 0x03E1B1);
console.log('');

// 7) Scan nearby entries to see which addresses have callers
console.log('=== Nearby entry points with ROM references (0x03E180-0x03E260) ===');
for (let probe = 0x03E180; probe <= 0x03E260; probe++) {
  const refs = scanRefs(probe);
  if (refs.length > 0) {
    console.log(`  ${hex(probe)}: ${refs.length} refs`);
  }
}
console.log('');

// 8) Pre-context decode
console.log('=== Pre-context: decode from 0x03E180 ===');
const preRows = decodeLinear(0x03E180, 60, false);
printRows(preRows);
console.log('');

// 9) Decode the subroutine at 0x03E187 (called from the error handler)
console.log('=== Subroutine 0x03E187 (called from error handler) ===');
const subRows = decodeLinear(0x03E187, 80, true);
printRows(subRows);
const subLast = subRows[subRows.length - 1];
const subEnd = subLast ? subLast.addr + subLast.length : 0x03E187;
console.log(`  Subroutine: ${hex(0x03E187)}..${hex(subEnd - 1)} = ${subEnd - 0x03E187} bytes`);
console.log('');
printRefs('0x03E187 subroutine', 0x03E187);
console.log('');

// 10) Decode callers at 0x047A7E, 0x047B2D, 0x047B5D, 0x061DB6 (a few instructions of context)
console.log('=== Caller context ===');
const callerAddrs = [0x047A7E, 0x047B2D, 0x047B5D, 0x061DB6];
for (const ca of callerAddrs) {
  // Decode 5 instructions before and 5 after the call site
  const before = Math.max(0, ca - 15);
  console.log(`--- Caller near ${hex(ca)} (context from ${hex(before)}) ---`);
  const callerRows = decodeLinear(before, 20, false);
  printRows(callerRows);
  console.log('');
}

console.log('Done.');
process.exit(0);
