#!/usr/bin/env node
// Probe: Decode 0x02395F - complementary function to 0x023955 (TOKEN DISPLAY EXIT)
// Pure ROM-read probe, no CPU execution needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function read8(addr) { return romBytes[addr]; }
function read24(addr) { return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16); }
function hex(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }
function hexAddr(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }

function hexDump(start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push(romBytes[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function decodeADL(start, maxBytes) {
  const instrs = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end) {
    const off = pc;
    const b = read8(pc);

    if (b === 0xDD || b === 0xFD) {
      const b2 = read8(pc + 1);
      const prefix = b === 0xDD ? 'IX' : 'IY';
      if (b2 === 0xE9) { instrs.push({ addr: off, len: 2, text: 'JP (' + prefix + ')' }); pc += 2; continue; }
      if (b2 === 0xE5) { instrs.push({ addr: off, len: 2, text: 'PUSH ' + prefix }); pc += 2; continue; }
      if (b2 === 0xE1) { instrs.push({ addr: off, len: 2, text: 'POP ' + prefix }); pc += 2; continue; }
      if (b2 === 0x21) { const imm = read24(pc + 2); instrs.push({ addr: off, len: 5, text: 'LD ' + prefix + ',' + hexAddr(imm) }); pc += 5; continue; }
      if (b2 === 0xCB) {
        const d = read8(pc + 2);
        const op = read8(pc + 3);
        const bitN = (op >> 3) & 7;
        const opType = (op >> 6) & 3;
        let opName;
        if (opType === 1) opName = 'BIT ' + bitN + ',(' + prefix + '+' + hex(d) + ')';
        else if (opType === 2) opName = 'RES ' + bitN + ',(' + prefix + '+' + hex(d) + ')';
        else if (opType === 3) opName = 'SET ' + bitN + ',(' + prefix + '+' + hex(d) + ')';
        else opName = prefix + ' CB d=' + hex(d) + ' op=' + hex(op);
        instrs.push({ addr: off, len: 4, text: opName });
        pc += 4;
        continue;
      }
      // Generic IX/IY + offset instructions
      instrs.push({ addr: off, len: 2, text: prefix + ' prefix + ' + hex(b2) }); pc += 2; continue;
    }

    if (b === 0xED) {
      const b2 = read8(pc + 1);
      if (b2 === 0x27) { instrs.push({ addr: off, len: 2, text: 'LD HL,(HL)   ; eZ80 24-bit indirect' }); pc += 2; continue; }
      instrs.push({ addr: off, len: 2, text: 'ED ' + hex(b2) + ' (extended)' }); pc += 2; continue;
    }

    if (b === 0xCB) {
      const b2 = read8(pc + 1);
      const bitN = (b2 >> 3) & 7;
      const reg = b2 & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const opType = (b2 >> 6) & 3;
      if (opType === 0) {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        instrs.push({ addr: off, len: 2, text: shifts[bitN] + ' ' + regNames[reg] });
      } else if (opType === 1) {
        instrs.push({ addr: off, len: 2, text: 'BIT ' + bitN + ',' + regNames[reg] });
      } else if (opType === 2) {
        instrs.push({ addr: off, len: 2, text: 'RES ' + bitN + ',' + regNames[reg] });
      } else {
        instrs.push({ addr: off, len: 2, text: 'SET ' + bitN + ',' + regNames[reg] });
      }
      pc += 2;
      continue;
    }

    switch (b) {
      case 0x00: instrs.push({ addr: off, len: 1, text: 'NOP' }); pc += 1; break;
      case 0x01: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD BC,' + hexAddr(imm) }); pc += 4; break; }
      case 0x03: instrs.push({ addr: off, len: 1, text: 'INC BC' }); pc += 1; break;
      case 0x04: instrs.push({ addr: off, len: 1, text: 'INC B' }); pc += 1; break;
      case 0x05: instrs.push({ addr: off, len: 1, text: 'DEC B' }); pc += 1; break;
      case 0x06: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD B,' + hex(imm) }); pc += 2; break; }
      case 0x0B: instrs.push({ addr: off, len: 1, text: 'DEC BC' }); pc += 1; break;
      case 0x0E: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD C,' + hex(imm) }); pc += 2; break; }
      case 0x11: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD DE,' + hexAddr(imm) }); pc += 4; break; }
      case 0x16: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD D,' + hex(imm) }); pc += 2; break; }
      case 0x18: { const d = read8(pc + 1); const rel = d >= 128 ? d - 256 : d; const target = pc + 2 + rel; instrs.push({ addr: off, len: 2, text: 'JR ' + hexAddr(target) + '   ; rel=' + rel }); pc += 2; break; }
      case 0x1E: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD E,' + hex(imm) }); pc += 2; break; }
      case 0x20: { const d = read8(pc + 1); const rel = d >= 128 ? d - 256 : d; const target = pc + 2 + rel; instrs.push({ addr: off, len: 2, text: 'JR NZ,' + hexAddr(target) + '   ; rel=' + rel }); pc += 2; break; }
      case 0x21: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD HL,' + hexAddr(imm) }); pc += 4; break; }
      case 0x22: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD (' + hexAddr(imm) + '),HL' }); pc += 4; break; }
      case 0x23: instrs.push({ addr: off, len: 1, text: 'INC HL' }); pc += 1; break;
      case 0x26: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD H,' + hex(imm) }); pc += 2; break; }
      case 0x28: { const d = read8(pc + 1); const rel = d >= 128 ? d - 256 : d; const target = pc + 2 + rel; instrs.push({ addr: off, len: 2, text: 'JR Z,' + hexAddr(target) + '   ; rel=' + rel }); pc += 2; break; }
      case 0x2A: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD HL,(' + hexAddr(imm) + ')' }); pc += 4; break; }
      case 0x2E: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD L,' + hex(imm) }); pc += 2; break; }
      case 0x30: { const d = read8(pc + 1); const rel = d >= 128 ? d - 256 : d; const target = pc + 2 + rel; instrs.push({ addr: off, len: 2, text: 'JR NC,' + hexAddr(target) + '   ; rel=' + rel }); pc += 2; break; }
      case 0x34: instrs.push({ addr: off, len: 1, text: 'INC (HL)' }); pc += 1; break;
      case 0x35: instrs.push({ addr: off, len: 1, text: 'DEC (HL)' }); pc += 1; break;
      case 0x36: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD (HL),' + hex(imm) }); pc += 2; break; }
      case 0x38: { const d = read8(pc + 1); const rel = d >= 128 ? d - 256 : d; const target = pc + 2 + rel; instrs.push({ addr: off, len: 2, text: 'JR C,' + hexAddr(target) + '   ; rel=' + rel }); pc += 2; break; }
      case 0x3A: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD A,(' + hexAddr(imm) + ')' }); pc += 4; break; }
      case 0x3E: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'LD A,' + hex(imm) }); pc += 2; break; }
      case 0x32: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'LD (' + hexAddr(imm) + '),A' }); pc += 4; break; }
      case 0x46: instrs.push({ addr: off, len: 1, text: 'LD B,(HL)' }); pc += 1; break;
      case 0x47: instrs.push({ addr: off, len: 1, text: 'LD B,A' }); pc += 1; break;
      case 0x4E: instrs.push({ addr: off, len: 1, text: 'LD C,(HL)' }); pc += 1; break;
      case 0x4F: instrs.push({ addr: off, len: 1, text: 'LD C,A' }); pc += 1; break;
      case 0x56: instrs.push({ addr: off, len: 1, text: 'LD D,(HL)' }); pc += 1; break;
      case 0x57: instrs.push({ addr: off, len: 1, text: 'LD D,A' }); pc += 1; break;
      case 0x5E: instrs.push({ addr: off, len: 1, text: 'LD E,(HL)' }); pc += 1; break;
      case 0x5F: instrs.push({ addr: off, len: 1, text: 'LD E,A' }); pc += 1; break;
      case 0x66: instrs.push({ addr: off, len: 1, text: 'LD H,(HL)' }); pc += 1; break;
      case 0x67: instrs.push({ addr: off, len: 1, text: 'LD H,A' }); pc += 1; break;
      case 0x6E: instrs.push({ addr: off, len: 1, text: 'LD L,(HL)' }); pc += 1; break;
      case 0x6F: instrs.push({ addr: off, len: 1, text: 'LD L,A' }); pc += 1; break;
      case 0x77: instrs.push({ addr: off, len: 1, text: 'LD (HL),A' }); pc += 1; break;
      case 0x78: instrs.push({ addr: off, len: 1, text: 'LD A,B' }); pc += 1; break;
      case 0x79: instrs.push({ addr: off, len: 1, text: 'LD A,C' }); pc += 1; break;
      case 0x7E: instrs.push({ addr: off, len: 1, text: 'LD A,(HL)' }); pc += 1; break;
      case 0xA7: instrs.push({ addr: off, len: 1, text: 'AND A' }); pc += 1; break;
      case 0xAF: instrs.push({ addr: off, len: 1, text: 'XOR A' }); pc += 1; break;
      case 0xB7: instrs.push({ addr: off, len: 1, text: 'OR A' }); pc += 1; break;
      case 0xC0: instrs.push({ addr: off, len: 1, text: 'RET NZ' }); pc += 1; break;
      case 0xC1: instrs.push({ addr: off, len: 1, text: 'POP BC' }); pc += 1; break;
      case 0xC2: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'JP NZ,' + hexAddr(imm) }); pc += 4; break; }
      case 0xC3: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'JP ' + hexAddr(imm) }); pc += 4; break; }
      case 0xC4: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'CALL NZ,' + hexAddr(imm) }); pc += 4; break; }
      case 0xC5: instrs.push({ addr: off, len: 1, text: 'PUSH BC' }); pc += 1; break;
      case 0xC6: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'ADD A,' + hex(imm) }); pc += 2; break; }
      case 0xC8: instrs.push({ addr: off, len: 1, text: 'RET Z' }); pc += 1; break;
      case 0xC9: instrs.push({ addr: off, len: 1, text: 'RET' }); pc += 1; break;
      case 0xCA: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'JP Z,' + hexAddr(imm) }); pc += 4; break; }
      case 0xCC: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'CALL Z,' + hexAddr(imm) }); pc += 4; break; }
      case 0xCD: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'CALL ' + hexAddr(imm) }); pc += 4; break; }
      case 0xD1: instrs.push({ addr: off, len: 1, text: 'POP DE' }); pc += 1; break;
      case 0xD5: instrs.push({ addr: off, len: 1, text: 'PUSH DE' }); pc += 1; break;
      case 0xD6: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'SUB ' + hex(imm) }); pc += 2; break; }
      case 0xD8: instrs.push({ addr: off, len: 1, text: 'RET C' }); pc += 1; break;
      case 0xDA: { const imm = read24(pc + 1); instrs.push({ addr: off, len: 4, text: 'JP C,' + hexAddr(imm) }); pc += 4; break; }
      case 0xE1: instrs.push({ addr: off, len: 1, text: 'POP HL' }); pc += 1; break;
      case 0xE5: instrs.push({ addr: off, len: 1, text: 'PUSH HL' }); pc += 1; break;
      case 0xE6: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'AND ' + hex(imm) }); pc += 2; break; }
      case 0xE9: instrs.push({ addr: off, len: 1, text: 'JP (HL)' }); pc += 1; break;
      case 0xF1: instrs.push({ addr: off, len: 1, text: 'POP AF' }); pc += 1; break;
      case 0xF5: instrs.push({ addr: off, len: 1, text: 'PUSH AF' }); pc += 1; break;
      case 0xFE: { const imm = read8(pc + 1); instrs.push({ addr: off, len: 2, text: 'CP ' + hex(imm) }); pc += 2; break; }
      default:
        instrs.push({ addr: off, len: 1, text: 'DB ' + hex(b) + '   ; unknown opcode' });
        pc += 1;
        break;
    }
  }
  return instrs;
}

function scanPattern(pattern) {
  const hits = [];
  for (let i = 0; i < romBytes.length - 3; i++) {
    if (romBytes[i] === pattern[0] && romBytes[i+1] === pattern[1] &&
        romBytes[i+2] === pattern[2] && romBytes[i+3] === pattern[3]) {
      hits.push(i);
    }
  }
  return hits;
}

console.log('=== Probe 548: Decode 0x02395F ===\n');

const START = 0x02395F;
const DUMP_LEN = 0x023990 - START + 1;
console.log('--- Hex dump ' + hexAddr(START) + '..' + hexAddr(START + DUMP_LEN - 1) + ' (' + DUMP_LEN + ' bytes) ---');
console.log(hexDump(START, DUMP_LEN));
console.log();

console.log('--- Context: 0x023955..0x02395E (TOKEN DISPLAY EXIT, 10 bytes) ---');
console.log(hexDump(0x023955, 10));
console.log();

console.log('--- Instruction decode: 0x023955..0x023990 ---');
const allInstrs = decodeADL(0x023955, 0x023990 - 0x023955 + 1);
for (const i of allInstrs) {
  const rawBytes = hexDump(i.addr, i.len);
  console.log('  ' + hexAddr(i.addr) + '  ' + rawBytes.padEnd(18) + '  ' + i.text);
}
console.log();

console.log('--- Function boundary analysis for 0x02395F ---');
const fn = decodeADL(0x02395F, 40);
for (const i of fn) {
  const rawBytes = hexDump(i.addr, i.len);
  console.log('  ' + hexAddr(i.addr) + '  ' + rawBytes.padEnd(18) + '  ' + i.text);
  if (i.text === 'RET' || (i.text.startsWith('JR 0x') && !i.text.includes('NZ') && !i.text.includes(' Z,') && !i.text.includes(' C,') && !i.text.includes(' NC,'))) {
    console.log('  --- end of function (' + (i.addr + i.len - 0x02395F) + ' bytes) ---');
    break;
  }
}
console.log();

console.log('--- Cross-references ---');

const call_02395F = scanPattern([0xCD, 0x5F, 0x39, 0x02]);
console.log('CALL 0x02395F (CD 5F 39 02): ' + call_02395F.length + ' hits');
for (const h of call_02395F) console.log('  ' + hexAddr(h));

const jp_02395F = scanPattern([0xC3, 0x5F, 0x39, 0x02]);
console.log('JP 0x02395F (C3 5F 39 02): ' + jp_02395F.length + ' hits');
for (const h of jp_02395F) console.log('  ' + hexAddr(h));

const call_02396D = scanPattern([0xCD, 0x6D, 0x39, 0x02]);
console.log('CALL 0x02396D (CD 6D 39 02): ' + call_02396D.length + ' hits');
for (const h of call_02396D) console.log('  ' + hexAddr(h));

const jp_02396D = scanPattern([0xC3, 0x6D, 0x39, 0x02]);
console.log('JP 0x02396D (C3 6D 39 02): ' + jp_02396D.length + ' hits');
for (const h of jp_02396D) console.log('  ' + hexAddr(h));

const call_023955 = scanPattern([0xCD, 0x55, 0x39, 0x02]);
console.log('\nCALL 0x023955 (CD 55 39 02): ' + call_023955.length + ' hits');

const jp_023955 = scanPattern([0xC3, 0x55, 0x39, 0x02]);
console.log('JP 0x023955 (C3 55 39 02): ' + jp_023955.length + ' hits');

const call_02398E = scanPattern([0xCD, 0x8E, 0x39, 0x02]);
console.log('CALL 0x02398E (CD 8E 39 02): ' + call_02398E.length + ' hits');

// Check for CALL NZ 0x02398E (C4 8E 39 02)
const callnz_02398E = scanPattern([0xC4, 0x8E, 0x39, 0x02]);
console.log('CALL NZ,0x02398E (C4 8E 39 02): ' + callnz_02398E.length + ' hits');

console.log('\n--- JR instructions targeting 0x023955 ---');
for (let addr = 0x023940; addr < 0x023980; addr++) {
  if (read8(addr) === 0x18) {
    const d = read8(addr + 1);
    const rel = d >= 128 ? d - 256 : d;
    const target = addr + 2 + rel;
    if (target === 0x023955) {
      console.log('  ' + hexAddr(addr) + ': JR ' + hexAddr(target) + ' (rel=' + rel + ')');
    }
  }
}

console.log('\n--- Related: 0x025762 (ABORT/CLEANUP) xrefs ---');
const call_025762 = scanPattern([0xCD, 0x62, 0x57, 0x02]);
console.log('CALL 0x025762: ' + call_025762.length + ' hits');
const jp_z_025762 = scanPattern([0xCA, 0x62, 0x57, 0x02]);
console.log('JP Z,0x025762: ' + jp_z_025762.length + ' hits');

console.log('\n=== SUMMARY ===');
console.log('D0265B counter semantics:');
console.log('  0x023955 = TOKEN DISPLAY EXIT: DEC (D0265B)');
console.log('  0x02395F = complement: INC (D0265B) + sub-call');
console.log('  0x025762 = ABORT/CLEANUP: INC (D0265B) + CALL 0x025774 + JP 0x023955');
console.log('Pattern: entry increments counter, exit decrements = nesting depth tracker');
