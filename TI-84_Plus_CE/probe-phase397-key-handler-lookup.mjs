#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// Known addresses
const ADDR_04CA87 = 0x04CA87;
const ADDR_04CA94 = 0x04CA94;
const KNOWN = {
  0x09F79B: 'translation table',
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0xD007E0: 'mode byte',
};

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function disasm(rom, startAddr, maxInstr) {
  let pc = startAddr;
  const results = [];
  for (let i = 0; i < maxInstr && pc < rom.length; i++) {
    const startPc = pc;
    const op = rom[pc++];
    let mnemonic = '';
    const bytes = [op];

    if (op === 0xC9) mnemonic = 'RET';
    else if (op === 0x00) mnemonic = 'NOP';
    else if (op === 0xF3) mnemonic = 'DI';
    else if (op === 0xFB) mnemonic = 'EI';
    else if (op === 0x76) mnemonic = 'HALT';
    else if (op === 0xAF) mnemonic = 'XOR A';
    else if (op === 0xA7) mnemonic = 'AND A';
    else if (op === 0xB7) mnemonic = 'OR A';
    else if (op === 0xBF) mnemonic = 'CP A';
    else if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
      const dst = ['B','C','D','E','H','L','(HL)','A'][(op >> 3) & 7];
      const src = ['B','C','D','E','H','L','(HL)','A'][op & 7];
      mnemonic = `LD ${dst},${src}`;
    }
    else if (op >= 0x80 && op <= 0xBF) {
      const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
      const src = ['B','C','D','E','H','L','(HL)','A'][op & 7];
      mnemonic = ops[(op >> 3) & 7] + src;
    }
    else if (op === 0x3E) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD A,${hex(v,2)}`; }
    else if (op === 0x06) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD B,${hex(v,2)}`; }
    else if (op === 0x0E) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD C,${hex(v,2)}`; }
    else if (op === 0x16) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD D,${hex(v,2)}`; }
    else if (op === 0x1E) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD E,${hex(v,2)}`; }
    else if (op === 0x26) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD H,${hex(v,2)}`; }
    else if (op === 0x2E) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD L,${hex(v,2)}`; }
    else if (op === 0xFE) { const v = rom[pc++]; bytes.push(v); mnemonic = `CP ${hex(v,2)}`; }
    else if (op === 0xC6) { const v = rom[pc++]; bytes.push(v); mnemonic = `ADD A,${hex(v,2)}`; }
    else if (op === 0xD6) { const v = rom[pc++]; bytes.push(v); mnemonic = `SUB ${hex(v,2)}`; }
    else if (op === 0xE6) { const v = rom[pc++]; bytes.push(v); mnemonic = `AND ${hex(v,2)}`; }
    else if (op === 0xF6) { const v = rom[pc++]; bytes.push(v); mnemonic = `OR ${hex(v,2)}`; }
    else if (op === 0xEE) { const v = rom[pc++]; bytes.push(v); mnemonic = `XOR ${hex(v,2)}`; }
    else if (op === 0x36) { const v = rom[pc++]; bytes.push(v); mnemonic = `LD (HL),${hex(v,2)}`; }
    else if (op === 0x21) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD HL,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0x11) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD DE,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0x01) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD BC,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0x31) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD SP,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xCD) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL ${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xC3) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP ${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xC4) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL NZ,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xCC) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL Z,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xD4) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL NC,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xDC) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL C,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xC2) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP NZ,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xCA) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP Z,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xD2) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP NC,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xDA) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP C,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xE4) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL PO,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xEC) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL PE,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xF4) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL P,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xFC) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`CALL M,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xE2) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP PO,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xEA) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP PE,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xF2) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP P,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0xFA) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`JP M,${hex(lo|(mi<<8)|(hi<<16))}`; }
    else if (op === 0x18) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`JR ${hex(pc+off)}`; }
    else if (op === 0x20) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`JR NZ,${hex(pc+off)}`; }
    else if (op === 0x28) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`JR Z,${hex(pc+off)}`; }
    else if (op === 0x30) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`JR NC,${hex(pc+off)}`; }
    else if (op === 0x38) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`JR C,${hex(pc+off)}`; }
    else if (op === 0xC5) mnemonic = 'PUSH BC';
    else if (op === 0xD5) mnemonic = 'PUSH DE';
    else if (op === 0xE5) mnemonic = 'PUSH HL';
    else if (op === 0xF5) mnemonic = 'PUSH AF';
    else if (op === 0xC1) mnemonic = 'POP BC';
    else if (op === 0xD1) mnemonic = 'POP DE';
    else if (op === 0xE1) mnemonic = 'POP HL';
    else if (op === 0xF1) mnemonic = 'POP AF';
    else if (op === 0x3C) mnemonic = 'INC A';
    else if (op === 0x3D) mnemonic = 'DEC A';
    else if (op === 0x04) mnemonic = 'INC B';
    else if (op === 0x05) mnemonic = 'DEC B';
    else if (op === 0x0C) mnemonic = 'INC C';
    else if (op === 0x0D) mnemonic = 'DEC C';
    else if (op === 0x14) mnemonic = 'INC D';
    else if (op === 0x15) mnemonic = 'DEC D';
    else if (op === 0x1C) mnemonic = 'INC E';
    else if (op === 0x1D) mnemonic = 'DEC E';
    else if (op === 0x23) mnemonic = 'INC HL';
    else if (op === 0x2B) mnemonic = 'DEC HL';
    else if (op === 0x13) mnemonic = 'INC DE';
    else if (op === 0x1B) mnemonic = 'DEC DE';
    else if (op === 0x03) mnemonic = 'INC BC';
    else if (op === 0x0B) mnemonic = 'DEC BC';
    else if (op === 0x34) mnemonic = 'INC (HL)';
    else if (op === 0x35) mnemonic = 'DEC (HL)';
    else if (op === 0x33) mnemonic = 'INC SP';
    else if (op === 0x3B) mnemonic = 'DEC SP';
    else if (op === 0x3A) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD A,(${hex(lo|(mi<<8)|(hi<<16))})`; }
    else if (op === 0x32) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD (${hex(lo|(mi<<8)|(hi<<16))}),A`; }
    else if (op === 0x2A) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD HL,(${hex(lo|(mi<<8)|(hi<<16))})`; }
    else if (op === 0x22) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD (${hex(lo|(mi<<8)|(hi<<16))}),HL`; }
    else if (op === 0x0A) mnemonic = 'LD A,(BC)';
    else if (op === 0x1A) mnemonic = 'LD A,(DE)';
    else if (op === 0x02) mnemonic = 'LD (BC),A';
    else if (op === 0x12) mnemonic = 'LD (DE),A';
    else if (op === 0xC0) mnemonic = 'RET NZ';
    else if (op === 0xC8) mnemonic = 'RET Z';
    else if (op === 0xD0) mnemonic = 'RET NC';
    else if (op === 0xD8) mnemonic = 'RET C';
    else if (op === 0xE0) mnemonic = 'RET PO';
    else if (op === 0xE8) mnemonic = 'RET PE';
    else if (op === 0xF0) mnemonic = 'RET P';
    else if (op === 0xF8) mnemonic = 'RET M';
    else if (op === 0x07) mnemonic = 'RLCA';
    else if (op === 0x0F) mnemonic = 'RRCA';
    else if (op === 0x17) mnemonic = 'RLA';
    else if (op === 0x1F) mnemonic = 'RRA';
    else if (op === 0xEB) mnemonic = 'EX DE,HL';
    else if (op === 0x08) mnemonic = "EX AF,AF'";
    else if (op === 0xD9) mnemonic = 'EXX';
    else if (op === 0xE3) mnemonic = 'EX (SP),HL';
    else if (op === 0x2F) mnemonic = 'CPL';
    else if (op === 0x37) mnemonic = 'SCF';
    else if (op === 0x3F) mnemonic = 'CCF';
    else if (op === 0x27) mnemonic = 'DAA';
    else if (op === 0xF9) mnemonic = 'LD SP,HL';
    else if (op === 0xE9) mnemonic = 'JP (HL)';
    else if (op === 0x10) { const d = rom[pc++]; bytes.push(d); const off = d > 127 ? d-256 : d; mnemonic=`DJNZ ${hex(pc+off)}`; }
    else if (op === 0x09) mnemonic = 'ADD HL,BC';
    else if (op === 0x19) mnemonic = 'ADD HL,DE';
    else if (op === 0x29) mnemonic = 'ADD HL,HL';
    else if (op === 0x39) mnemonic = 'ADD HL,SP';
    else if (op === 0xED) {
      const op2 = rom[pc++]; bytes.push(op2);
      if (op2 === 0x78) mnemonic = 'IN A,(C)';
      else if (op2 === 0x79) mnemonic = 'OUT (C),A';
      else if (op2 === 0x40) mnemonic = 'IN B,(C)';
      else if (op2 === 0x41) mnemonic = 'OUT (C),B';
      else if (op2 === 0x48) mnemonic = 'IN C,(C)';
      else if (op2 === 0x49) mnemonic = 'OUT (C),C';
      else if (op2 === 0x50) mnemonic = 'IN D,(C)';
      else if (op2 === 0x51) mnemonic = 'OUT (C),D';
      else if (op2 === 0x58) mnemonic = 'IN E,(C)';
      else if (op2 === 0x59) mnemonic = 'OUT (C),E';
      else if (op2 === 0x60) mnemonic = 'IN H,(C)';
      else if (op2 === 0x61) mnemonic = 'OUT (C),H';
      else if (op2 === 0x68) mnemonic = 'IN L,(C)';
      else if (op2 === 0x69) mnemonic = 'OUT (C),L';
      else if (op2 === 0xB0) mnemonic = 'LDIR';
      else if (op2 === 0xB8) mnemonic = 'LDDR';
      else if (op2 === 0xA0) mnemonic = 'LDI';
      else if (op2 === 0xA8) mnemonic = 'LDD';
      else if (op2 === 0xB1) mnemonic = 'CPIR';
      else if (op2 === 0xB9) mnemonic = 'CPDR';
      else if (op2 === 0x4D) mnemonic = 'RETI';
      else if (op2 === 0x45) mnemonic = 'RETN';
      else if (op2 === 0x46) mnemonic = 'IM 0';
      else if (op2 === 0x56) mnemonic = 'IM 1';
      else if (op2 === 0x5E) mnemonic = 'IM 2';
      else if (op2 === 0x47) mnemonic = 'LD I,A';
      else if (op2 === 0x4F) mnemonic = 'LD R,A';
      else if (op2 === 0x57) mnemonic = 'LD A,I';
      else if (op2 === 0x5F) mnemonic = 'LD A,R';
      else if (op2 === 0x44) mnemonic = 'NEG';
      else if (op2 === 0x67) mnemonic = 'RRD';
      else if (op2 === 0x6F) mnemonic = 'RLD';
      else if (op2 === 0x43) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD (${hex(lo|(mi<<8)|(hi<<16))}),BC`; }
      else if (op2 === 0x4B) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD BC,(${hex(lo|(mi<<8)|(hi<<16))})`; }
      else if (op2 === 0x53) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD (${hex(lo|(mi<<8)|(hi<<16))}),DE`; }
      else if (op2 === 0x5B) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD DE,(${hex(lo|(mi<<8)|(hi<<16))})`; }
      else if (op2 === 0x73) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD (${hex(lo|(mi<<8)|(hi<<16))}),SP`; }
      else if (op2 === 0x7B) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD SP,(${hex(lo|(mi<<8)|(hi<<16))})`; }
      else if (op2 === 0x42) mnemonic = 'SBC HL,BC';
      else if (op2 === 0x4A) mnemonic = 'ADC HL,BC';
      else if (op2 === 0x52) mnemonic = 'SBC HL,DE';
      else if (op2 === 0x5A) mnemonic = 'ADC HL,DE';
      else if (op2 === 0x62) mnemonic = 'SBC HL,HL';
      else if (op2 === 0x6A) mnemonic = 'ADC HL,HL';
      else if (op2 === 0x72) mnemonic = 'SBC HL,SP';
      else if (op2 === 0x7A) mnemonic = 'ADC HL,SP';
      else if (op2 === 0x01) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),B`; }
      else if (op2 === 0x09) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),C`; }
      else if (op2 === 0x11) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),D`; }
      else if (op2 === 0x19) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),E`; }
      else if (op2 === 0x21) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),H`; }
      else if (op2 === 0x29) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),L`; }
      else if (op2 === 0x39) { const p = rom[pc++]; bytes.push(p); mnemonic = `OUT0 (${hex(p,2)}),A`; }
      else if (op2 === 0x00) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 B,(${hex(p,2)})`; }
      else if (op2 === 0x08) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 C,(${hex(p,2)})`; }
      else if (op2 === 0x10) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 D,(${hex(p,2)})`; }
      else if (op2 === 0x18) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 E,(${hex(p,2)})`; }
      else if (op2 === 0x20) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 H,(${hex(p,2)})`; }
      else if (op2 === 0x28) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 L,(${hex(p,2)})`; }
      else if (op2 === 0x38) { const p = rom[pc++]; bytes.push(p); mnemonic = `IN0 A,(${hex(p,2)})`; }
      else mnemonic = `ED ${op2.toString(16).padStart(2,'0')} (unknown)`;
    }
    else if (op === 0xDD) {
      const op2 = rom[pc++]; bytes.push(op2);
      if (op2 === 0x21) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD IX,${hex(lo|(mi<<8)|(hi<<16))}`; }
      else if (op2 === 0xE5) mnemonic = 'PUSH IX';
      else if (op2 === 0xE1) mnemonic = 'POP IX';
      else if (op2 === 0xE9) mnemonic = 'JP (IX)';
      else if (op2 === 0x7E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD A,(IX+${hex(d,2)})`; }
      else if (op2 === 0x46) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD B,(IX+${hex(d,2)})`; }
      else if (op2 === 0x4E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD C,(IX+${hex(d,2)})`; }
      else if (op2 === 0x56) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD D,(IX+${hex(d,2)})`; }
      else if (op2 === 0x5E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD E,(IX+${hex(d,2)})`; }
      else if (op2 === 0x66) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD H,(IX+${hex(d,2)})`; }
      else if (op2 === 0x6E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD L,(IX+${hex(d,2)})`; }
      else if (op2 === 0x77) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),A`; }
      else if (op2 === 0x70) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),B`; }
      else if (op2 === 0x71) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),C`; }
      else if (op2 === 0x72) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),D`; }
      else if (op2 === 0x73) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),E`; }
      else if (op2 === 0x74) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),H`; }
      else if (op2 === 0x75) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IX+${hex(d,2)}),L`; }
      else if (op2 === 0x36) { const d = rom[pc++]; const v = rom[pc++]; bytes.push(d,v); mnemonic = `LD (IX+${hex(d,2)}),${hex(v,2)}`; }
      else if (op2 === 0xBE) { const d = rom[pc++]; bytes.push(d); mnemonic = `CP (IX+${hex(d,2)})`; }
      else if (op2 === 0x86) { const d = rom[pc++]; bytes.push(d); mnemonic = `ADD A,(IX+${hex(d,2)})`; }
      else if (op2 === 0x96) { const d = rom[pc++]; bytes.push(d); mnemonic = `SUB (IX+${hex(d,2)})`; }
      else if (op2 === 0xA6) { const d = rom[pc++]; bytes.push(d); mnemonic = `AND (IX+${hex(d,2)})`; }
      else if (op2 === 0xAE) { const d = rom[pc++]; bytes.push(d); mnemonic = `XOR (IX+${hex(d,2)})`; }
      else if (op2 === 0xB6) { const d = rom[pc++]; bytes.push(d); mnemonic = `OR (IX+${hex(d,2)})`; }
      else if (op2 === 0x34) { const d = rom[pc++]; bytes.push(d); mnemonic = `INC (IX+${hex(d,2)})`; }
      else if (op2 === 0x35) { const d = rom[pc++]; bytes.push(d); mnemonic = `DEC (IX+${hex(d,2)})`; }
      else if (op2 === 0xCB) {
        const d = rom[pc++]; bytes.push(d);
        const op3 = rom[pc++]; bytes.push(op3);
        const bit = (op3 >> 3) & 7;
        if ((op3 & 0xC0) === 0x40) mnemonic = `BIT ${bit},(IX+${hex(d,2)})`;
        else if ((op3 & 0xC0) === 0xC0) mnemonic = `SET ${bit},(IX+${hex(d,2)})`;
        else if ((op3 & 0xC0) === 0x80) mnemonic = `RES ${bit},(IX+${hex(d,2)})`;
        else mnemonic = `IX CB ${hex(d,2)} ${hex(op3,2)} (unknown)`;
      }
      else if (op2 === 0x23) mnemonic = 'INC IX';
      else if (op2 === 0x2B) mnemonic = 'DEC IX';
      else if (op2 === 0x09) mnemonic = 'ADD IX,BC';
      else if (op2 === 0x19) mnemonic = 'ADD IX,DE';
      else if (op2 === 0x29) mnemonic = 'ADD IX,IX';
      else if (op2 === 0x39) mnemonic = 'ADD IX,SP';
      else mnemonic = `DD ${op2.toString(16).padStart(2,'0')} (unknown)`;
    }
    else if (op === 0xFD) {
      const op2 = rom[pc++]; bytes.push(op2);
      if (op2 === 0x21) { const lo=rom[pc++],mi=rom[pc++],hi=rom[pc++]; bytes.push(lo,mi,hi); mnemonic=`LD IY,${hex(lo|(mi<<8)|(hi<<16))}`; }
      else if (op2 === 0xE5) mnemonic = 'PUSH IY';
      else if (op2 === 0xE1) mnemonic = 'POP IY';
      else if (op2 === 0xE9) mnemonic = 'JP (IY)';
      else if (op2 === 0x7E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD A,(IY+${hex(d,2)})`; }
      else if (op2 === 0x46) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD B,(IY+${hex(d,2)})`; }
      else if (op2 === 0x4E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD C,(IY+${hex(d,2)})`; }
      else if (op2 === 0x56) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD D,(IY+${hex(d,2)})`; }
      else if (op2 === 0x5E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD E,(IY+${hex(d,2)})`; }
      else if (op2 === 0x66) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD H,(IY+${hex(d,2)})`; }
      else if (op2 === 0x6E) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD L,(IY+${hex(d,2)})`; }
      else if (op2 === 0x77) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),A`; }
      else if (op2 === 0x70) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),B`; }
      else if (op2 === 0x71) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),C`; }
      else if (op2 === 0x72) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),D`; }
      else if (op2 === 0x73) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),E`; }
      else if (op2 === 0x74) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),H`; }
      else if (op2 === 0x75) { const d = rom[pc++]; bytes.push(d); mnemonic = `LD (IY+${hex(d,2)}),L`; }
      else if (op2 === 0x36) { const d = rom[pc++]; const v = rom[pc++]; bytes.push(d,v); mnemonic = `LD (IY+${hex(d,2)}),${hex(v,2)}`; }
      else if (op2 === 0xBE) { const d = rom[pc++]; bytes.push(d); mnemonic = `CP (IY+${hex(d,2)})`; }
      else if (op2 === 0x86) { const d = rom[pc++]; bytes.push(d); mnemonic = `ADD A,(IY+${hex(d,2)})`; }
      else if (op2 === 0x96) { const d = rom[pc++]; bytes.push(d); mnemonic = `SUB (IY+${hex(d,2)})`; }
      else if (op2 === 0xA6) { const d = rom[pc++]; bytes.push(d); mnemonic = `AND (IY+${hex(d,2)})`; }
      else if (op2 === 0xAE) { const d = rom[pc++]; bytes.push(d); mnemonic = `XOR (IY+${hex(d,2)})`; }
      else if (op2 === 0xB6) { const d = rom[pc++]; bytes.push(d); mnemonic = `OR (IY+${hex(d,2)})`; }
      else if (op2 === 0x34) { const d = rom[pc++]; bytes.push(d); mnemonic = `INC (IY+${hex(d,2)})`; }
      else if (op2 === 0x35) { const d = rom[pc++]; bytes.push(d); mnemonic = `DEC (IY+${hex(d,2)})`; }
      else if (op2 === 0xCB) {
        const d = rom[pc++]; bytes.push(d);
        const op3 = rom[pc++]; bytes.push(op3);
        const bit = (op3 >> 3) & 7;
        if ((op3 & 0xC0) === 0x40) mnemonic = `BIT ${bit},(IY+${hex(d,2)})`;
        else if ((op3 & 0xC0) === 0xC0) mnemonic = `SET ${bit},(IY+${hex(d,2)})`;
        else if ((op3 & 0xC0) === 0x80) mnemonic = `RES ${bit},(IY+${hex(d,2)})`;
        else mnemonic = `IY CB ${hex(d,2)} ${hex(op3,2)} (unknown)`;
      }
      else if (op2 === 0x23) mnemonic = 'INC IY';
      else if (op2 === 0x2B) mnemonic = 'DEC IY';
      else if (op2 === 0x09) mnemonic = 'ADD IY,BC';
      else if (op2 === 0x19) mnemonic = 'ADD IY,DE';
      else if (op2 === 0x29) mnemonic = 'ADD IY,IY';
      else if (op2 === 0x39) mnemonic = 'ADD IY,SP';
      else mnemonic = `FD ${op2.toString(16).padStart(2,'0')} (unknown)`;
    }
    else if (op === 0xCB) {
      const op2 = rom[pc++]; bytes.push(op2);
      const reg = ['B','C','D','E','H','L','(HL)','A'][op2 & 7];
      const bit = (op2 >> 3) & 7;
      if ((op2 & 0xC0) === 0x40) mnemonic = `BIT ${bit},${reg}`;
      else if ((op2 & 0xC0) === 0xC0) mnemonic = `SET ${bit},${reg}`;
      else if ((op2 & 0xC0) === 0x80) mnemonic = `RES ${bit},${reg}`;
      else if ((op2 & 0xF8) === 0x00) mnemonic = `RLC ${reg}`;
      else if ((op2 & 0xF8) === 0x08) mnemonic = `RRC ${reg}`;
      else if ((op2 & 0xF8) === 0x10) mnemonic = `RL ${reg}`;
      else if ((op2 & 0xF8) === 0x18) mnemonic = `RR ${reg}`;
      else if ((op2 & 0xF8) === 0x20) mnemonic = `SLA ${reg}`;
      else if ((op2 & 0xF8) === 0x28) mnemonic = `SRA ${reg}`;
      else if ((op2 & 0xF8) === 0x38) mnemonic = `SRL ${reg}`;
      else mnemonic = `CB ${op2.toString(16)} (unknown)`;
    }
    else if ((op & 0xC7) === 0xC7) mnemonic = `RST ${hex(op & 0x38, 2)}`;
    else mnemonic = `DB ${hex(op,2)} (unknown)`;

    // Annotate known addresses
    let annotation = '';
    const addrMatch = mnemonic.match(/0x([0-9A-F]{6})/i);
    if (addrMatch) {
      const addr = parseInt(addrMatch[1], 16);
      if (KNOWN[addr]) annotation = `  ; ${KNOWN[addr]}`;
    }

    results.push({
      addr: startPc,
      bytes,
      mnemonic,
      annotation,
    });
  }
  return results;
}

function printDisasm(label, results) {
  console.log(`\n=== ${label} ===`);
  for (const r of results) {
    const byteStr = r.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(r.addr)}:  ${byteStr.padEnd(20)} ${r.mnemonic}${r.annotation}`);
  }
}

function extractTargets(results) {
  const targets = [];
  for (const r of results) {
    if (/^(CALL|JP)\s/.test(r.mnemonic) && !/\(HL\)|\(IX\)|\(IY\)/.test(r.mnemonic)) {
      const m = r.mnemonic.match(/0x([0-9A-F]{6})/i);
      if (m) targets.push({ from: r.addr, target: parseInt(m[1], 16), instr: r.mnemonic });
    }
  }
  return targets;
}

function extractAddressRefs(results) {
  const refs = [];
  for (const r of results) {
    const m = r.mnemonic.match(/0x([0-9A-F]{6})/i);
    if (m) {
      const addr = parseInt(m[1], 16);
      if (KNOWN[addr]) refs.push({ from: r.addr, addr, name: KNOWN[addr], instr: r.mnemonic });
    }
  }
  return refs;
}

// Search ROM for byte patterns
function searchPattern(pattern, label) {
  const results = [];
  for (let i = 0; i < rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  console.log(`\n--- ${label} (${results.length} hits) ---`);
  for (const addr of results) {
    // Show context: 8 bytes before
    const ctxStart = Math.max(0, addr - 8);
    const ctx = disasm(rom, ctxStart, 12);
    console.log(`  Caller at ${hex(addr)}:`);
    for (const r of ctx) {
      const marker = r.addr === addr ? ' >>>' : '    ';
      const byteStr = r.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      console.log(`  ${marker} ${hex(r.addr)}: ${byteStr.padEnd(20)} ${r.mnemonic}${r.annotation}`);
      if (r.addr > addr + 4) break;
    }
  }
  return results;
}

// ==================== MAIN ====================

console.log('==============================================');
console.log('Phase 397: Key Handler Lookup — 0x04CA87 & 0x04CA94');
console.log('==============================================');

// 1. Disassemble 0x04CA87 (200 instructions)
const dis87 = disasm(rom, ADDR_04CA87, 200);
printDisasm(`Disassembly at 0x04CA87 (200 instrs)`, dis87);

// 2. Disassemble 0x04CA94 separately (the alternate entry point, 13 bytes in)
console.log(`\n--- 0x04CA94 is at offset +${ADDR_04CA94 - ADDR_04CA87} from 0x04CA87 ---`);
const dis94 = disasm(rom, ADDR_04CA94, 180);
printDisasm(`Disassembly at 0x04CA94 (180 instrs)`, dis94);

// 3. Extract CALL/JP targets from both disassemblies
const targets87 = extractTargets(dis87);
const targets94 = extractTargets(dis94);
const allTargets = [...targets87];
// Add targets from dis94 that aren't already in the list
for (const t of targets94) {
  if (!allTargets.find(x => x.target === t.target && x.from === t.from)) {
    allTargets.push(t);
  }
}

console.log('\n=== CALL/JP targets found ===');
for (const t of allTargets) {
  const knownLabel = KNOWN[t.target] ? ` (${KNOWN[t.target]})` : '';
  console.log(`  ${hex(t.from)}: ${t.instr}${knownLabel}`);
}

// 4. Check references to known addresses
console.log('\n=== References to known addresses ===');
const refs87 = extractAddressRefs(dis87);
const refs94 = extractAddressRefs(dis94);
const allRefs = [...refs87];
for (const r of refs94) {
  if (!allRefs.find(x => x.from === r.from)) allRefs.push(r);
}
if (allRefs.length === 0) {
  console.log('  (none found in disassembled range)');
} else {
  for (const r of allRefs) {
    console.log(`  ${hex(r.from)}: ${r.instr}  ; ${r.name}`);
  }
}

// 5. Search for CALL 0x04CA87 / CALL 0x04CA94
searchPattern([0xCD, 0x87, 0xCA, 0x04], 'CALL 0x04CA87');
searchPattern([0xCD, 0x94, 0xCA, 0x04], 'CALL 0x04CA94');
searchPattern([0xC3, 0x87, 0xCA, 0x04], 'JP 0x04CA87');
searchPattern([0xC3, 0x94, 0xCA, 0x04], 'JP 0x04CA94');

// 6. Follow CALL targets — disassemble first 64 bytes of each callee
const uniqueCallTargets = new Set();
for (const t of allTargets) {
  if (t.instr.startsWith('CALL') && t.target < 0x400000) {
    uniqueCallTargets.add(t.target);
  }
}

console.log('\n=== Following CALL targets (first 64 bytes each) ===');
for (const target of [...uniqueCallTargets].sort()) {
  const calleeDis = disasm(rom, target, 40);
  printDisasm(`Callee ${hex(target)}`, calleeDis);

  // Check for known address refs in callee
  const calleeRefs = extractAddressRefs(calleeDis);
  if (calleeRefs.length > 0) {
    console.log('  Known address references in callee:');
    for (const r of calleeRefs) {
      console.log(`    ${hex(r.from)}: ${r.instr}  ; ${r.name}`);
    }
  }
}

// 7. Summary analysis
console.log('\n=== SUMMARY ===');
console.log(`0x04CA87 entry: first instruction is ${dis87[0].mnemonic}`);
console.log(`0x04CA94 entry: first instruction is ${dis94[0].mnemonic}`);
console.log(`Distance: 0x04CA94 - 0x04CA87 = ${ADDR_04CA94 - ADDR_04CA87} bytes`);

// Find RET to determine function boundaries
for (let i = 0; i < dis87.length; i++) {
  if (dis87[i].mnemonic === 'RET' || dis87[i].mnemonic === 'JP (HL)') {
    console.log(`  First RET/JP(HL) in 0x04CA87 disasm at ${hex(dis87[i].addr)} (instruction #${i})`);
    break;
  }
}
