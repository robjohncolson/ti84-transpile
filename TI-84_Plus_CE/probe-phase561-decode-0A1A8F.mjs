#!/usr/bin/env node
/**
 * probe-phase561-decode-0A1A8F.mjs
 *
 * Decode pixel renderer utilities at 0x0A1A83 and 0x0A1A8F,
 * called from the glyph renderer at 0x0A1799.
 *
 * Read-only probe -- no CPU execution, just ROM disassembly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const BASE = 0x0A1A83;
const LEN = 200;

// --- hex dump ---
console.log('\n=== HEX DUMP: 0x' + BASE.toString(16).toUpperCase() + ' .. 0x' + (BASE + LEN - 1).toString(16).toUpperCase() + ' (' + LEN + ' bytes) ===\n');
for (let i = 0; i < LEN; i += 16) {
  const addr = BASE + i;
  const hex = [];
  const ascii = [];
  for (let j = 0; j < 16 && i + j < LEN; j++) {
    const b = romBytes[addr + j];
    hex.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.');
  }
  console.log(addr.toString(16).padStart(6, '0') + '  ' + hex.join(' ').padEnd(48) + '  ' + ascii.join(''));
}

// --- eZ80 ADL-mode disassembler ---

function r24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}
function s8(b) { return b < 128 ? b : b - 256; }

const reg8  = ['B','C','D','E','H','L','(HL)','A'];
const reg16 = ['BC','DE','HL','SP'];
const reg16af = ['BC','DE','HL','AF'];
const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];

function hex(n) { return '0x' + n.toString(16).toUpperCase(); }

function disasm(buf, pc) {
  const start = pc;
  let b = buf[pc++];
  let prefix = '';
  let idxReg = 'HL';

  if (b === 0xDD || b === 0xFD) {
    idxReg = b === 0xDD ? 'IX' : 'IY';
    prefix = idxReg;
    b = buf[pc++];
  }

  // .SIS prefix
  if (b === 0x40) {
    const inner = disasm(buf, pc);
    return { addr: start, len: 1 + inner.len, text: '.SIS ' + inner.text, calls: inner.calls, ram: inner.ram };
  }

  const calls = [];
  const ram = [];

  // CB prefix
  if (b === 0xCB) {
    if (prefix) {
      const d = s8(buf[pc++]);
      const op = buf[pc++];
      const bit = (op >> 3) & 7;
      const what = op >> 6;
      const dStr = d >= 0 ? ('+' + d) : ('' + d);
      if (what === 1) return { addr: start, len: pc - start, text: 'BIT ' + bit + ',(' + idxReg + dStr + ')', calls, ram };
      if (what === 2) return { addr: start, len: pc - start, text: 'RES ' + bit + ',(' + idxReg + dStr + ')', calls, ram };
      if (what === 3) return { addr: start, len: pc - start, text: 'SET ' + bit + ',(' + idxReg + dStr + ')', calls, ram };
      return { addr: start, len: pc - start, text: 'CB.' + prefix + ' ' + op.toString(16), calls, ram };
    }
    const op = buf[pc++];
    const bit = (op >> 3) & 7;
    const r = op & 7;
    const what = op >> 6;
    if (what === 0) {
      const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      return { addr: start, len: pc - start, text: shifts[bit] + ' ' + reg8[r], calls, ram };
    }
    if (what === 1) return { addr: start, len: pc - start, text: 'BIT ' + bit + ',' + reg8[r], calls, ram };
    if (what === 2) return { addr: start, len: pc - start, text: 'RES ' + bit + ',' + reg8[r], calls, ram };
    if (what === 3) return { addr: start, len: pc - start, text: 'SET ' + bit + ',' + reg8[r], calls, ram };
  }

  // ED prefix
  if (b === 0xED) {
    const op = buf[pc++];
    if ((op & 0xCF) === 0x4B) {
      const rr = (op >> 4) & 3;
      const nn = r24(buf, pc); pc += 3;
      if (nn >= 0xD00000) ram.push(nn);
      return { addr: start, len: pc - start, text: 'LD ' + reg16[rr] + ',(' + hex(nn) + ')', calls, ram };
    }
    if ((op & 0xCF) === 0x43) {
      const rr = (op >> 4) & 3;
      const nn = r24(buf, pc); pc += 3;
      if (nn >= 0xD00000) ram.push(nn);
      return { addr: start, len: pc - start, text: 'LD (' + hex(nn) + '),' + reg16[rr], calls, ram };
    }
    if ((op & 0xCF) === 0x42) return { addr: start, len: pc - start, text: 'SBC HL,' + reg16[(op >> 4) & 3], calls, ram };
    if ((op & 0xCF) === 0x4A) return { addr: start, len: pc - start, text: 'ADC HL,' + reg16[(op >> 4) & 3], calls, ram };
    if ((op & 0xCF) === 0x4C) return { addr: start, len: pc - start, text: 'MLT ' + reg16[(op >> 4) & 3], calls, ram };
    if (op === 0xB0) return { addr: start, len: pc - start, text: 'LDIR', calls, ram };
    if (op === 0xB8) return { addr: start, len: pc - start, text: 'LDDR', calls, ram };
    if (op === 0xB1) return { addr: start, len: pc - start, text: 'CPIR', calls, ram };
    if (op === 0x44) return { addr: start, len: pc - start, text: 'NEG', calls, ram };
    if (op === 0x4D) return { addr: start, len: pc - start, text: 'RETI', calls, ram };
    if (op === 0x45) return { addr: start, len: pc - start, text: 'RETN', calls, ram };
    if ((op & 0xC7) === 0x40) return { addr: start, len: pc - start, text: 'IN ' + reg8[(op >> 3) & 7] + ',(C)', calls, ram };
    if ((op & 0xC7) === 0x41) return { addr: start, len: pc - start, text: 'OUT (C),' + reg8[(op >> 3) & 7], calls, ram };
    // LEA instructions
    const leaMap = {0x02: ['BC','IX'], 0x03: ['BC','IY'], 0x12: ['DE','IX'], 0x13: ['DE','IY'],
                    0x22: ['HL','IX'], 0x23: ['HL','IY'], 0x32: ['IX','IX'], 0x33: ['IY','IY'],
                    0x54: ['IX','IY'], 0x55: ['IY','IX']};
    if (leaMap[op]) {
      const d = s8(buf[pc++]);
      return { addr: start, len: pc - start, text: 'LEA ' + leaMap[op][0] + ',' + leaMap[op][1] + (d >= 0 ? '+' : '') + d, calls, ram };
    }
    if (op === 0x64) { const n = buf[pc++]; return { addr: start, len: pc - start, text: 'TST A,' + hex(n), calls, ram }; }
    return { addr: start, len: pc - start, text: 'ED ' + op.toString(16).padStart(2,'0'), calls, ram };
  }

  // main opcodes
  if (b === 0x00) return { addr: start, len: 1, text: 'NOP', calls, ram };
  if (b === 0x76) return { addr: start, len: pc - start, text: 'HALT', calls, ram };
  if (b === 0xC9) return { addr: start, len: pc - start, text: 'RET', calls, ram };
  if ((b & 0xC7) === 0xC0 && b !== 0xC0 || b === 0xC0) {
    if ((b & 0xC7) === 0xC0) return { addr: start, len: pc - start, text: 'RET ' + ccNames[(b >> 3) & 7], calls, ram };
  }
  if (b === 0xCD) { const nn = r24(buf, pc); pc += 3; calls.push(nn); return { addr: start, len: pc - start, text: 'CALL ' + hex(nn), calls, ram }; }
  if ((b & 0xC7) === 0xC4) { const nn = r24(buf, pc); pc += 3; calls.push(nn); return { addr: start, len: pc - start, text: 'CALL ' + ccNames[(b >> 3) & 7] + ',' + hex(nn), calls, ram }; }
  if (b === 0xC3) { const nn = r24(buf, pc); pc += 3; calls.push(nn); return { addr: start, len: pc - start, text: 'JP ' + hex(nn), calls, ram }; }
  if ((b & 0xC7) === 0xC2) { const nn = r24(buf, pc); pc += 3; calls.push(nn); return { addr: start, len: pc - start, text: 'JP ' + ccNames[(b >> 3) & 7] + ',' + hex(nn), calls, ram }; }
  if (b === 0xE9) return { addr: start, len: pc - start, text: 'JP (' + idxReg + ')', calls, ram };
  if (b === 0x18) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'JR ' + hex(t), calls, ram }; }
  if (b === 0x20) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'JR NZ,' + hex(t), calls, ram }; }
  if (b === 0x28) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'JR Z,' + hex(t), calls, ram }; }
  if (b === 0x30) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'JR NC,' + hex(t), calls, ram }; }
  if (b === 0x38) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'JR C,' + hex(t), calls, ram }; }
  if (b === 0x10) { const e = s8(buf[pc++]); const t = pc + e; return { addr: start, len: pc - start, text: 'DJNZ ' + hex(t), calls, ram }; }

  // LD r,r
  if (b >= 0x40 && b <= 0x7F) {
    let dst = (b >> 3) & 7;
    let src = b & 7;
    let dstName = reg8[dst];
    let srcName = reg8[src];
    if (prefix && (dst === 6 || src === 6)) {
      const d = s8(buf[pc++]);
      const dStr = d >= 0 ? ('+' + d) : ('' + d);
      if (dst === 6) dstName = '(' + idxReg + dStr + ')';
      else srcName = '(' + idxReg + dStr + ')';
    }
    return { addr: start, len: pc - start, text: 'LD ' + dstName + ',' + srcName, calls, ram };
  }

  // ALU A,r
  if (b >= 0x80 && b <= 0xBF) {
    const ops = ['ADD','ADC','SUB','SBC','AND','XOR','OR','CP'];
    const op = (b >> 3) & 7;
    let r = b & 7;
    let rName = reg8[r];
    if (prefix && r === 6) {
      const d = s8(buf[pc++]);
      rName = '(' + idxReg + (d >= 0 ? '+' : '') + d + ')';
    }
    return { addr: start, len: pc - start, text: ops[op] + ' A,' + rName, calls, ram };
  }

  // LD r,n
  if ((b & 0xC7) === 0x06) {
    const r = (b >> 3) & 7;
    if (prefix && r === 6) {
      const d = s8(buf[pc++]);
      const n = buf[pc++];
      return { addr: start, len: pc - start, text: 'LD (' + idxReg + (d >= 0 ? '+' : '') + d + '),' + hex(n), calls, ram };
    }
    const n = buf[pc++];
    return { addr: start, len: pc - start, text: 'LD ' + reg8[r] + ',' + hex(n), calls, ram };
  }

  // LD rr,nn
  if ((b & 0xCF) === 0x01) {
    const rr = (b >> 4) & 3;
    const nn = r24(buf, pc); pc += 3;
    const name = prefix && rr === 2 ? idxReg : reg16[rr];
    return { addr: start, len: pc - start, text: 'LD ' + name + ',' + hex(nn), calls, ram };
  }

  if (b === 0x32) { const nn = r24(buf, pc); pc += 3; if (nn >= 0xD00000) ram.push(nn); return { addr: start, len: pc - start, text: 'LD (' + hex(nn) + '),A', calls, ram }; }
  if (b === 0x3A) { const nn = r24(buf, pc); pc += 3; if (nn >= 0xD00000) ram.push(nn); return { addr: start, len: pc - start, text: 'LD A,(' + hex(nn) + ')', calls, ram }; }
  if (b === 0x22) { const nn = r24(buf, pc); pc += 3; if (nn >= 0xD00000) ram.push(nn); const name = prefix ? idxReg : 'HL'; return { addr: start, len: pc - start, text: 'LD (' + hex(nn) + '),' + name, calls, ram }; }
  if (b === 0x2A) { const nn = r24(buf, pc); pc += 3; if (nn >= 0xD00000) ram.push(nn); const name = prefix ? idxReg : 'HL'; return { addr: start, len: pc - start, text: 'LD ' + name + ',(' + hex(nn) + ')', calls, ram }; }

  if (b === 0x02) return { addr: start, len: pc - start, text: 'LD (BC),A', calls, ram };
  if (b === 0x0A) return { addr: start, len: pc - start, text: 'LD A,(BC)', calls, ram };
  if (b === 0x12) return { addr: start, len: pc - start, text: 'LD (DE),A', calls, ram };
  if (b === 0x1A) return { addr: start, len: pc - start, text: 'LD A,(DE)', calls, ram };

  // INC/DEC r
  if ((b & 0xC7) === 0x04) {
    const r = (b >> 3) & 7;
    if (prefix && r === 6) { const d = s8(buf[pc++]); return { addr: start, len: pc - start, text: 'INC (' + idxReg + (d >= 0 ? '+' : '') + d + ')', calls, ram }; }
    return { addr: start, len: pc - start, text: 'INC ' + reg8[r], calls, ram };
  }
  if ((b & 0xC7) === 0x05) {
    const r = (b >> 3) & 7;
    if (prefix && r === 6) { const d = s8(buf[pc++]); return { addr: start, len: pc - start, text: 'DEC (' + idxReg + (d >= 0 ? '+' : '') + d + ')', calls, ram }; }
    return { addr: start, len: pc - start, text: 'DEC ' + reg8[r], calls, ram };
  }

  // INC/DEC rr
  if ((b & 0xCF) === 0x03) { const rr = (b >> 4) & 3; const name = prefix && rr === 2 ? idxReg : reg16[rr]; return { addr: start, len: pc - start, text: 'INC ' + name, calls, ram }; }
  if ((b & 0xCF) === 0x0B) { const rr = (b >> 4) & 3; const name = prefix && rr === 2 ? idxReg : reg16[rr]; return { addr: start, len: pc - start, text: 'DEC ' + name, calls, ram }; }

  // ADD HL,rr
  if ((b & 0xCF) === 0x09) { const rr = (b >> 4) & 3; const name = prefix ? idxReg : 'HL'; return { addr: start, len: pc - start, text: 'ADD ' + name + ',' + reg16[rr], calls, ram }; }

  // PUSH/POP
  if ((b & 0xCF) === 0xC5) { const rr = (b >> 4) & 3; const name = prefix && rr === 2 ? idxReg : reg16af[rr]; return { addr: start, len: pc - start, text: 'PUSH ' + name, calls, ram }; }
  if ((b & 0xCF) === 0xC1) { const rr = (b >> 4) & 3; const name = prefix && rr === 2 ? idxReg : reg16af[rr]; return { addr: start, len: pc - start, text: 'POP ' + name, calls, ram }; }

  // ALU A,n
  if ((b & 0xC7) === 0xC6) {
    const ops = ['ADD','ADC','SUB','SBC','AND','XOR','OR','CP'];
    const op = (b >> 3) & 7;
    const n = buf[pc++];
    return { addr: start, len: pc - start, text: ops[op] + ' A,' + hex(n), calls, ram };
  }

  // RST
  if ((b & 0xC7) === 0xC7) {
    const t = b & 0x38;
    return { addr: start, len: pc - start, text: 'RST ' + hex(t), calls, ram };
  }

  if (b === 0x08) return { addr: start, len: pc - start, text: "EX AF,AF'", calls, ram };
  if (b === 0xEB) return { addr: start, len: pc - start, text: 'EX DE,HL', calls, ram };
  if (b === 0xE3) return { addr: start, len: pc - start, text: 'EX (SP),' + (prefix || 'HL'), calls, ram };
  if (b === 0xD9) return { addr: start, len: pc - start, text: 'EXX', calls, ram };
  if (b === 0xF3) return { addr: start, len: pc - start, text: 'DI', calls, ram };
  if (b === 0xFB) return { addr: start, len: pc - start, text: 'EI', calls, ram };
  if (b === 0x37) return { addr: start, len: pc - start, text: 'SCF', calls, ram };
  if (b === 0x3F) return { addr: start, len: pc - start, text: 'CCF', calls, ram };
  if (b === 0x2F) return { addr: start, len: pc - start, text: 'CPL', calls, ram };
  if (b === 0x27) return { addr: start, len: pc - start, text: 'DAA', calls, ram };
  if (b === 0x07) return { addr: start, len: pc - start, text: 'RLCA', calls, ram };
  if (b === 0x0F) return { addr: start, len: pc - start, text: 'RRCA', calls, ram };
  if (b === 0x17) return { addr: start, len: pc - start, text: 'RLA', calls, ram };
  if (b === 0x1F) return { addr: start, len: pc - start, text: 'RRA', calls, ram };
  if (b === 0xF9) return { addr: start, len: pc - start, text: 'LD SP,' + (prefix || 'HL'), calls, ram };
  if (b === 0xD3) { const n = buf[pc++]; return { addr: start, len: pc - start, text: 'OUT (' + hex(n) + '),A', calls, ram }; }
  if (b === 0xDB) { const n = buf[pc++]; return { addr: start, len: pc - start, text: 'IN A,(' + hex(n) + ')', calls, ram }; }

  return { addr: start, len: pc - start, text: 'DB ' + hex(b) + (prefix ? ' (after ' + prefix + ' prefix)' : ''), calls, ram };
}

// --- disassemble region ---
console.log('\n=== DISASSEMBLY: 0x' + BASE.toString(16).toUpperCase() + ' ===\n');

const allCalls = new Set();
const allRam = new Set();
const funcBoundaries = [];
let pc = BASE;
const endAddr = BASE + LEN;
let prevWasRet = false;
let retCount = 0;

while (pc < endAddr) {
  const inst = disasm(romBytes, pc);
  const addrStr = inst.addr.toString(16).padStart(6, '0').toUpperCase();
  const hexBytes = [];
  for (let i = 0; i < inst.len; i++) hexBytes.push(romBytes[inst.addr + i].toString(16).padStart(2, '0'));

  if (prevWasRet || inst.addr === BASE) {
    funcBoundaries.push(inst.addr);
    console.log('\n--- Function at 0x' + addrStr + ' ---');
  }

  console.log('  ' + addrStr + '  ' + hexBytes.join(' ').padEnd(18) + '  ' + inst.text);

  for (const c of inst.calls) allCalls.add(c);
  for (const r of inst.ram) allRam.add(r);

  prevWasRet = inst.text === 'RET' || inst.text === 'RETI' || inst.text === 'RETN';
  if (prevWasRet) retCount++;

  pc += inst.len;

  // Stop after we have decoded enough past both targets
  if (retCount >= 4) break;
}

// --- summary ---
console.log('\n=== SUMMARY ===\n');
console.log('Function boundaries found:');
for (const fb of funcBoundaries) {
  console.log('  0x' + fb.toString(16).toUpperCase());
}

console.log('\nCALL/JP targets:');
for (const c of [...allCalls].sort((a,b) => a - b)) {
  const label = c >= 0xD00000 ? ' (RAM)' : c >= 0x0A0000 ? ' (OS text module)' : '';
  console.log('  0x' + c.toString(16).toUpperCase() + label);
}

console.log('\nRAM addresses referenced:');
for (const r of [...allRam].sort((a,b) => a - b)) {
  console.log('  0x' + r.toString(16).toUpperCase());
}

console.log('\nKnown workspace context:');
console.log('  D02A62-D02A75 = pixel renderer workspace');
console.log('  D0059C = framebuffer write pointer');
console.log('  0x0280 = 640B stride (320px * 2 bytes/px for 16bpp)');

console.log('\n=== DONE ===');
