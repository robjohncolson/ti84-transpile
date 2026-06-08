#!/usr/bin/env node
/**
 * probe-phase566-decode-09BAFF.mjs
 * Deep decode of the MAIN TOKEN CLASSIFIER at 0x09BAFF (~163 bytes).
 *
 * This is the largest function in the 15-function OS input token parser cluster
 * at 0x09BAAB-0x09BC60, discovered in session 565. It reads a token via
 * CALL 0x09BAAF, classifies it through a cascading CP/JR dispatch chain, and
 * writes the result to:
 *   D005F8 = token class code (B register value 0-8)
 *   D005F9 = token sub-type / numeric digit offset
 *   D005FA = secondary token byte
 *
 * Goals:
 *   1. Full instruction-level disassembly of 0x09BAFF through its end boundary
 *   2. Document every CP/JR pair — what token value is compared, where each branch goes
 *   3. Identify writes to D005F8/D005F9/D005FA for each classification path
 *   4. Find all CALL/JP targets and the function's true end boundary
 *   5. Print a structured summary table of token classifications
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function read16(off) { return romBytes[off] | (romBytes[off+1] << 8); }
function read24(off) { return romBytes[off] | (romBytes[off+1] << 8) | (romBytes[off+2] << 16); }
function signedByte(b) { return b < 128 ? b : b - 256; }
function hex(v, digits) { return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0'); }

const r8 = ['B','C','D','E','H','L','(HL)','A'];
const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xF50000 && addr <= 0xF5001F) ioAddrs.push(addr);
  else if (addr >= 0xE30000 && addr <= 0xE3FFFF) ioAddrs.push(addr);
  else if (addr >= 0xD00000) ramAddrs.push(addr);
}

// Linear eZ80 ADL-mode disassembler (proven working from phase 565 probes)
function disassembleLinear(startAddr, maxBytes) {
  const instructions = [], callTargets = [], ramAddrs = [], ioAddrs = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const instrStart = pc;
    let prefix = null, indexReg = 'HL', indexH = 'H', indexL = 'L', sisMode = false;
    let op = romBytes[pc++];

    if (op === 0x40) {
      const next = romBytes[pc];
      const sisTrig = new Set([0xDD,0xFD,0xED,0xCB,0xCD,0xC3,0xC9,0x21,0x01,0x11,0x31,0x3A,0x32,0x2A,0x22,0xE5,0xE1]);
      if (sisTrig.has(next) || (next >= 0xC0 && next <= 0xFF)) { sisMode = true; op = romBytes[pc++]; }
      else { instructions.push({addr:instrStart,bytes:'40',mnemonic:'LD B, B',comment:'',terminal:false}); continue; }
    }

    if (op === 0xDD || op === 0xFD) {
      prefix = op;
      indexReg = op===0xDD?'IX':'IY'; indexH=op===0xDD?'IXH':'IYH'; indexL=op===0xDD?'IXL':'IYL';
      op = romBytes[pc++];
    }

    const sisStr = sisMode ? '.SIS ' : '';
    let mnemonic = '', comment = '', terminal = false;

    if (op === 0xCB) {
      if (prefix) {
        const disp = signedByte(romBytes[pc++]); const cbOp = romBytes[pc++];
        const bitNum=(cbOp>>3)&7; const ds=disp>=0?`+${hex(disp)}`:`-${hex(-disp)}`;
        if      ((cbOp&0xC0)===0x40) mnemonic=`${sisStr}BIT ${bitNum}, (${indexReg}${ds})`;
        else if ((cbOp&0xC0)===0x80) mnemonic=`${sisStr}RES ${bitNum}, (${indexReg}${ds})`;
        else if ((cbOp&0xC0)===0xC0) mnemonic=`${sisStr}SET ${bitNum}, (${indexReg}${ds})`;
        else { const sh=['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL']; mnemonic=`${sisStr}${sh[(cbOp>>3)&7]} (${indexReg}${ds})`; }
        if (indexReg === 'IY') comment = `IY+${hex(disp&0xFF)} = ${hex(0xD00080 + (disp&0xFF), 6)}`;
      } else {
        const cbOp=romBytes[pc++]; const bitNum=(cbOp>>3)&7; const reg=r8[cbOp&7];
        if      ((cbOp&0xC0)===0x40) mnemonic=`${sisStr}BIT ${bitNum}, ${reg}`;
        else if ((cbOp&0xC0)===0x80) mnemonic=`${sisStr}RES ${bitNum}, ${reg}`;
        else if ((cbOp&0xC0)===0xC0) mnemonic=`${sisStr}SET ${bitNum}, ${reg}`;
        else { const sh=['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL']; mnemonic=`${sisStr}${sh[(cbOp>>3)&7]} ${reg}`; }
      }
    }
    else if (op === 0xED) {
      const edOp = romBytes[pc++];
      switch(edOp) {
        case 0x78: mnemonic=`${sisStr}IN A, (C)`; comment='PORT I/O READ'; break;
        case 0x79: mnemonic=`${sisStr}OUT (C), A`; comment='PORT I/O WRITE'; break;
        case 0x42: mnemonic=`${sisStr}SBC HL, BC`; break;
        case 0x52: mnemonic=`${sisStr}SBC HL, DE`; break;
        case 0x62: mnemonic=`${sisStr}SBC HL, HL`; break;
        case 0x72: mnemonic=`${sisStr}SBC HL, SP`; break;
        case 0x4A: mnemonic=`${sisStr}ADC HL, BC`; break;
        case 0x5A: mnemonic=`${sisStr}ADC HL, DE`; break;
        case 0x6A: mnemonic=`${sisStr}ADC HL, HL`; break;
        case 0x7A: mnemonic=`${sisStr}ADC HL, SP`; break;
        case 0x43: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), BC`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x53: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), DE`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x63: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), HL`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x73: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), SP`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x4B: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD BC, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x5B: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD DE, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x6B: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD HL, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x7B: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD SP, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x44: mnemonic=`${sisStr}NEG`; break;
        case 0x45: mnemonic=`${sisStr}RETN`; terminal=true; break;
        case 0x4D: mnemonic=`${sisStr}RETI`; terminal=true; break;
        case 0x47: mnemonic=`${sisStr}LD I, A`; break;
        case 0x57: mnemonic=`${sisStr}LD A, I`; break;
        case 0xA0: mnemonic=`${sisStr}LDI`; break;
        case 0xB0: mnemonic=`${sisStr}LDIR`; break;
        case 0xA8: mnemonic=`${sisStr}LDD`; break;
        case 0xB8: mnemonic=`${sisStr}LDDR`; break;
        case 0xA1: mnemonic=`${sisStr}CPI`; break;
        case 0xB1: mnemonic=`${sisStr}CPIR`; break;
        case 0xA9: mnemonic=`${sisStr}CPD`; break;
        case 0xB9: mnemonic=`${sisStr}CPDR`; break;
        default: mnemonic=`${sisStr}ED ${hex(edOp)}  ; unknown ED op`; break;
      }
    }
    else {
      switch(op) {
        case 0x00: mnemonic=`${sisStr}NOP`; break;
        case 0x76: mnemonic=`${sisStr}HALT`; break;
        case 0xF3: mnemonic=`${sisStr}DI`; break;
        case 0xFB: mnemonic=`${sisStr}EI`; break;
        case 0xC9: mnemonic=`${sisStr}RET`; terminal=!sisMode; break;
        case 0xD9: mnemonic=`${sisStr}EXX`; break;
        case 0x08: mnemonic=`${sisStr}EX AF, AF'`; break;
        case 0xE3: mnemonic=`${sisStr}EX (SP), ${indexReg}`; break;
        case 0xEB: mnemonic=`${sisStr}EX DE, HL`; break;
        case 0xE9: mnemonic=`${sisStr}JP (${indexReg})`; terminal=!sisMode; break;
        case 0xF9: mnemonic=`${sisStr}LD SP, ${indexReg}`; break;
        case 0x37: mnemonic=`${sisStr}SCF`; break;
        case 0x3F: mnemonic=`${sisStr}CCF`; break;
        case 0x2F: mnemonic=`${sisStr}CPL`; break;
        case 0x27: mnemonic=`${sisStr}DAA`; break;
        case 0x07: mnemonic=`${sisStr}RLCA`; break;
        case 0x0F: mnemonic=`${sisStr}RRCA`; break;
        case 0x17: mnemonic=`${sisStr}RLA`; break;
        case 0x1F: mnemonic=`${sisStr}RRA`; break;
        case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
        case 0x48: case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
        case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: case 0x57:
        case 0x58: case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5E: case 0x5F:
        case 0x60: case 0x61: case 0x62: case 0x63: case 0x64: case 0x65: case 0x66: case 0x67:
        case 0x68: case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6E: case 0x6F:
        case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77:
        case 0x78: case 0x79: case 0x7A: case 0x7B: case 0x7C: case 0x7D: case 0x7E: case 0x7F: {
          let dst=r8[(op>>3)&7], src=r8[op&7];
          if (prefix) {
            if (dst==='H') dst=indexH; if (dst==='L') dst=indexL;
            if (src==='H') src=indexH; if (src==='L') src=indexL;
            if (dst==='(HL)' || src==='(HL)') {
              const d=signedByte(romBytes[pc++]); const ds=d>=0?`+${hex(d)}`:`-${hex(-d)}`;
              if (dst==='(HL)') dst=`(${indexReg}${ds})`; if (src==='(HL)') src=`(${indexReg}${ds})`;
            }
          }
          mnemonic=`${sisStr}LD ${dst}, ${src}`; break;
        }
        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF: {
          const aluOps=['ADD A,','ADC A,','SUB','SBC A,','AND','XOR','OR','CP'];
          let operand=r8[op&7];
          if (prefix) {
            if (operand==='H') operand=indexH; if (operand==='L') operand=indexL;
            if (operand==='(HL)') { const d=signedByte(romBytes[pc++]); operand=`(${indexReg}${d>=0?'+'+hex(d):'-'+hex(-d)})`; }
          }
          mnemonic=`${sisStr}${aluOps[(op>>3)&7]} ${operand}`; break;
        }
        case 0xC6: { const n=romBytes[pc++]; mnemonic=`${sisStr}ADD A, ${hex(n)}`; break; }
        case 0xCE: { const n=romBytes[pc++]; mnemonic=`${sisStr}ADC A, ${hex(n)}`; break; }
        case 0xD6: { const n=romBytes[pc++]; mnemonic=`${sisStr}SUB ${hex(n)}`; break; }
        case 0xDE: { const n=romBytes[pc++]; mnemonic=`${sisStr}SBC A, ${hex(n)}`; break; }
        case 0xE6: { const n=romBytes[pc++]; mnemonic=`${sisStr}AND ${hex(n)}`; break; }
        case 0xEE: { const n=romBytes[pc++]; mnemonic=`${sisStr}XOR ${hex(n)}`; break; }
        case 0xF6: { const n=romBytes[pc++]; mnemonic=`${sisStr}OR ${hex(n)}`; break; }
        case 0xFE: { const n=romBytes[pc++]; mnemonic=`${sisStr}CP ${hex(n)}`; break; }
        case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x34: case 0x3C: {
          let reg=r8[(op>>3)&7];
          if (prefix) { if(reg==='H') reg=indexH; if(reg==='L') reg=indexL;
            if(reg==='(HL)'){const d=signedByte(romBytes[pc++]);reg=`(${indexReg}${d>=0?'+'+hex(d):'-'+hex(-d)})`;} }
          mnemonic=`${sisStr}INC ${reg}`; break;
        }
        case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x35: case 0x3D: {
          let reg=r8[(op>>3)&7];
          if (prefix) { if(reg==='H') reg=indexH; if(reg==='L') reg=indexL;
            if(reg==='(HL)'){const d=signedByte(romBytes[pc++]);reg=`(${indexReg}${d>=0?'+'+hex(d):'-'+hex(-d)})`;} }
          mnemonic=`${sisStr}DEC ${reg}`; break;
        }
        case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x36: case 0x3E: {
          let reg=r8[(op>>3)&7];
          if (prefix&&reg==='H') reg=indexH; if (prefix&&reg==='L') reg=indexL;
          if (prefix&&reg==='(HL)'){const d=signedByte(romBytes[pc++]);reg=`(${indexReg}${d>=0?'+'+hex(d):'-'+hex(-d)})`;}
          const n=romBytes[pc++]; mnemonic=`${sisStr}LD ${reg}, ${hex(n)}`; break;
        }
        case 0x01: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD BC, ${hex(a,w*2)}`; break; }
        case 0x11: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD DE, ${hex(a,w*2)}`; break; }
        case 0x21: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD ${indexReg}, ${hex(a,w*2)}`; break; }
        case 0x31: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD SP, ${hex(a,w*2)}`; break; }
        case 0x03: mnemonic=`${sisStr}INC BC`; break;
        case 0x13: mnemonic=`${sisStr}INC DE`; break;
        case 0x23: mnemonic=`${sisStr}INC ${indexReg}`; break;
        case 0x33: mnemonic=`${sisStr}INC SP`; break;
        case 0x0B: mnemonic=`${sisStr}DEC BC`; break;
        case 0x1B: mnemonic=`${sisStr}DEC DE`; break;
        case 0x2B: mnemonic=`${sisStr}DEC ${indexReg}`; break;
        case 0x3B: mnemonic=`${sisStr}DEC SP`; break;
        case 0x09: mnemonic=`${sisStr}ADD ${indexReg}, BC`; break;
        case 0x19: mnemonic=`${sisStr}ADD ${indexReg}, DE`; break;
        case 0x29: mnemonic=`${sisStr}ADD ${indexReg}, ${indexReg}`; break;
        case 0x39: mnemonic=`${sisStr}ADD ${indexReg}, SP`; break;
        case 0xC5: mnemonic=`${sisStr}PUSH BC`; break;
        case 0xD5: mnemonic=`${sisStr}PUSH DE`; break;
        case 0xE5: mnemonic=`${sisStr}PUSH ${indexReg}`; break;
        case 0xF5: mnemonic=`${sisStr}PUSH AF`; break;
        case 0xC1: mnemonic=`${sisStr}POP BC`; break;
        case 0xD1: mnemonic=`${sisStr}POP DE`; break;
        case 0xE1: mnemonic=`${sisStr}POP ${indexReg}`; break;
        case 0xF1: mnemonic=`${sisStr}POP AF`; break;
        case 0xC3: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}JP ${hex(a,6)}`; callTargets.push({addr:a,type:'JP'}); terminal=!sisMode; break; }
        case 0xCD: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}CALL ${hex(a,6)}`; callTargets.push({addr:a,type:'CALL'}); break; }
        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const c=ccNames[(op>>3)&7]; const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w;
          mnemonic=`${sisStr}JP ${c}, ${hex(a,6)}`; callTargets.push({addr:a,type:`JP ${c}`}); break;
        }
        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c=ccNames[(op>>3)&7]; const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w;
          mnemonic=`${sisStr}CALL ${c}, ${hex(a,6)}`; callTargets.push({addr:a,type:`CALL ${c}`}); break;
        }
        case 0xC0: mnemonic=`${sisStr}RET NZ`; break;
        case 0xC8: mnemonic=`${sisStr}RET Z`; break;
        case 0xD0: mnemonic=`${sisStr}RET NC`; break;
        case 0xD8: mnemonic=`${sisStr}RET C`; break;
        case 0xE0: mnemonic=`${sisStr}RET PO`; break;
        case 0xE8: mnemonic=`${sisStr}RET PE`; break;
        case 0xF0: mnemonic=`${sisStr}RET P`; break;
        case 0xF8: mnemonic=`${sisStr}RET M`; break;
        case 0x18: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR ${hex(t,6)}`; callTargets.push({addr:t,type:'JR'}); terminal=!sisMode; break; }
        case 0x20: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR NZ, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR NZ'}); break; }
        case 0x28: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR Z, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR Z'}); break; }
        case 0x30: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR NC, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR NC'}); break; }
        case 0x38: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR C, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR C'}); break; }
        case 0x10: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}DJNZ ${hex(t,6)}`; callTargets.push({addr:t,type:'DJNZ'}); break; }
        case 0xC7: case 0xCF: case 0xD7: case 0xDF: case 0xE7: case 0xEF: case 0xF7: case 0xFF: {
          mnemonic=`${sisStr}RST ${hex(op&0x38)}`; break;
        }
        case 0x3A: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD A, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x32: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD (${hex(a,6)}), A`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x2A: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD ${indexReg}, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x22: { const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w; mnemonic=`${sisStr}LD (${hex(a,6)}), ${indexReg}`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x02: mnemonic=`${sisStr}LD (BC), A`; break;
        case 0x12: mnemonic=`${sisStr}LD (DE), A`; break;
        case 0x0A: mnemonic=`${sisStr}LD A, (BC)`; break;
        case 0x1A: mnemonic=`${sisStr}LD A, (DE)`; break;
        case 0xD3: { const n=romBytes[pc++]; mnemonic=`${sisStr}OUT (${hex(n)}), A`; comment='PORT I/O WRITE'; break; }
        case 0xDB: { const n=romBytes[pc++]; mnemonic=`${sisStr}IN A, (${hex(n)})`; comment='PORT I/O READ'; break; }
        default: mnemonic=`${sisStr}DB ${hex(op)}  ; unknown`; break;
      }
    }

    const byteArr = [];
    for (let i = instrStart; i < pc; i++) byteArr.push(romBytes[i].toString(16).padStart(2,'0'));
    instructions.push({addr:instrStart, bytes:byteArr.join(' '), mnemonic, comment, terminal});
  }
  return { instructions, callTargets, ramAddrs, ioAddrs, length: pc - startAddr };
}

function ramLabel(addr) {
  const labels = {
    0xD005F8: 'TOKEN CLASS CODE',
    0xD005F9: 'TOKEN SUB-TYPE',
    0xD005FA: 'SECONDARY TOKEN BYTE',
    0xD0061A: 'current parse token',
    0xD0068A: 'expression/var ptr',
    0xD0230E: 'INPUT MODE BYTE',
    0xD02317: 'INPUT BUF BASE PTR',
    0xD0231A: 'INPUT BUF READ PTR',
    0xD0231D: 'INPUT BUF END PTR',
    0xD02320: 'token dispatch selector',
    0xD02593: 'secondary input ptr',
    0xD00587: 'key scan code',
  };
  if (labels[addr]) return `  [${labels[addr]}]`;
  if (addr >= 0xD00080 && addr <= 0xD000FF) return `  [IY+${hex(addr-0xD00080)} flags]`;
  if (addr >= 0xD00500 && addr < 0xD00600) return '  [key/token area]';
  if (addr >= 0xD00600 && addr < 0xD00700) return '  [OS input/display]';
  if (addr >= 0xD02000 && addr < 0xD03200) return '  [text/scroll state]';
  return '';
}

// ======================== MAIN DECODE ========================

const FN_START = 0x09BAFF;
const FN_MAX   = 200;  // decode up to 200 bytes to find the true end

console.log('=== Phase 566: DEEP DECODE 0x09BAFF — MAIN TOKEN CLASSIFIER ===');
console.log(`Function start: ${hex(FN_START,6)}, decoding up to ${FN_MAX} bytes\n`);

// ---- RAW HEX DUMP ----
console.log('--- RAW ROM BYTES ---');
for (let row = 0; row < FN_MAX; row += 16) {
  const addr = FN_START + row;
  const bytes = [];
  for (let i = 0; i < 16 && row + i < FN_MAX; i++) {
    bytes.push(romBytes[addr + i].toString(16).padStart(2, '0'));
  }
  console.log(`  ${addr.toString(16).padStart(6,'0')}  ${bytes.join(' ')}`);
}

// ---- DISASSEMBLE ----
console.log('\n--- FULL DISASSEMBLY ---');
const result = disassembleLinear(FN_START, FN_MAX);

// Track CP/JR pairs for the classification table
const cpJrPairs = [];
let lastCp = null;

// Collect branch targets for labeling
const branchTargetSet = new Set();
for (const ct of result.callTargets) {
  if (ct.addr >= FN_START && ct.addr < FN_START + FN_MAX) {
    branchTargetSet.add(ct.addr);
  }
}

for (const instr of result.instructions) {
  // Label branch targets
  const label = branchTargetSet.has(instr.addr) ? ' <<< BRANCH TARGET' : '';

  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(20);
  const cStr     = instr.comment ? `  ; ${instr.comment}` : '';
  const termMark = instr.terminal ? '  <<<< TERMINAL' : '';

  // Annotate RAM accesses inline
  let ramNote = '';
  const ramMatch = instr.mnemonic.match(/\(0x([0-9A-F]{6})\)/i);
  if (ramMatch) {
    const a = parseInt(ramMatch[1], 16);
    ramNote = ramLabel(a);
  }

  // Track CP instructions
  if (instr.mnemonic.match(/^CP\s/)) {
    const valMatch = instr.mnemonic.match(/CP\s+0x([0-9A-F]+)/i);
    if (valMatch) {
      lastCp = { addr: instr.addr, value: parseInt(valMatch[1], 16), hexStr: '0x' + valMatch[1] };
    }
  }

  // Track JR/JP after CP
  const jrMatch = instr.mnemonic.match(/^JR\s+(Z|NZ|C|NC),\s+0x([0-9A-F]+)/i);
  if (lastCp && jrMatch) {
    cpJrPairs.push({
      cpAddr: lastCp.addr,
      cpValue: lastCp.value,
      cpHex: lastCp.hexStr,
      jrAddr: instr.addr,
      jrCond: jrMatch[1],
      jrTarget: parseInt(jrMatch[2], 16),
      jrTargetHex: '0x' + jrMatch[2].toUpperCase(),
    });
    lastCp = null;
  } else if (!instr.mnemonic.match(/^CP\s/)) {
    lastCp = null;
  }

  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${cStr}${ramNote}${label}${termMark}`);
}

// Find the true function end boundary.
// This function has multiple exit points (JP 0x059FFF, JR to external).
// The *last* instruction that belongs to the classifier (before the next
// function at 0x09BBA6, the sub-token check) defines the true end.
// Session 565 identified 0x09BBA6 as the start of the next function.
const NEXT_FN = 0x09BBA6;
let fnEndAddr = NEXT_FN;  // function spans up to start of next fn
let fnEndKind = 'JP 0x059FFF (at 0x09BBA2, last instruction before 0x09BBA6)';
const fnSize = fnEndAddr - FN_START;  // should be ~163 bytes (0xA7)

// ======================== CP/JR DISPATCH CHAIN ========================

console.log(`\n${'='.repeat(72)}`);
console.log('=== CP/JR DISPATCH CHAIN (cascading token comparisons) ===');
console.log(`${'='.repeat(72)}`);
console.log('  CP Addr  | Token Val | Cond | Branch Target | In-fn?  | Note');
console.log('  ---------|-----------|------|---------------|---------|------');
for (const pair of cpJrPairs) {
  const inside = pair.jrTarget >= FN_START && pair.jrTarget < fnEndAddr;
  const loc = inside ? 'yes' : 'NO (ext)';

  // Token value annotation (TI-OS token codes, NOT ASCII)
  let note = '';
  const v = pair.cpValue;
  if (v === 0xEF) note = 'STO/special 2-byte token';
  else if (v === 0x5F) note = 'error token -> JP 0x061D1A';
  else if (v === 0xEB) note = 'list/prgm token -> CALL 0x099FDA';
  else if (v === 0xAA) note = 'tRe (real part?) -> class B=4';
  else if (v === 0x62) note = 'tVarStrng boundary (>= is var/ident)';
  else if (v === 0x41) note = 'tA (letter tokens start) -> accept if >=';
  else if (v === 0x5C) note = 'tMatrix -> class B=2';
  else if (v === 0x5D) note = 'tList -> class B=1';
  else if (v === 0x5E) note = 'tEq -> class B=3';
  else if (v === 0x61) note = 'tPic -> class B=8';
  else if (v === 0x64) note = 'tGDB boundary (>= is error)';
  else if (v === 0x0A) note = 'digit range limit (0-9)';
  else if (v === 0x21) note = 'sub-token 0x21 check';
  else if (v === 0x72) note = 'tAns -> JP 0x059FFF accept';
  else if (v === 0x3E) note = 'sub-token ">"';
  else if (v === 0x3F) note = 'sub-token "?"';

  console.log(`  ${hex(pair.cpAddr,6)} | ${pair.cpHex.padEnd(9)} | ${pair.jrCond.padEnd(4)} | ${pair.jrTargetHex.padEnd(13)} | ${loc.padEnd(7)} | ${note}`);
}

// ======================== CALL/JP TARGETS ========================

console.log(`\n${'='.repeat(72)}`);
console.log('=== CALL/JP TARGETS ===');
const unique = [...new Map(result.callTargets.map(t => [`${t.type}:${t.addr}`, t])).values()];
unique.sort((a,b) => a.addr - b.addr);

const fnEnd = fnEndAddr || (FN_START + FN_MAX);
const external = unique.filter(t => t.addr < FN_START || t.addr >= fnEnd);
const internal = unique.filter(t => t.addr >= FN_START && t.addr < fnEnd);

if (external.length > 0) {
  console.log(`\nExternal targets (${external.length}):`);
  for (const t of external) {
    let note = '';
    if (t.addr === 0x09BAAF) note = '  (advance+read token from input buffer)';
    else if (t.addr === 0x09B9C8) note = '  (token pre-classifier)';
    else if (t.addr === 0x099FDA) note = '  (list/EX token handler)';
    else if (t.addr === 0x059FFF) note = '  (token accepted/commit)';
    else if (t.addr === 0x061D1A) note = '  (OS error handler)';
    else if (t.addr === 0x09BBA6) note = '  (sub-token check: 0x3E/0x3F)';
    else if (t.addr === 0x07FACF) note = '  (OS utility)';
    else if (t.addr === 0x080090) note = '  (mode test)';
    console.log(`  ${t.type.padEnd(10)} -> ${hex(t.addr,6)}${note}`);
  }
}
if (internal.length > 0) {
  console.log(`\nInternal branch targets (${internal.length}):`);
  for (const t of internal) {
    console.log(`  ${t.type.padEnd(10)} -> ${hex(t.addr,6)}`);
  }
}

// ======================== RAM ADDRESSES ========================

console.log(`\n${'='.repeat(72)}`);
console.log('=== RAM ADDRESSES ACCESSED ===');
const ramUnique = [...new Set(result.ramAddrs)].sort((a,b)=>a-b);
for (const a of ramUnique) console.log(`  ${hex(a,6)}${ramLabel(a)}`);

if (result.ioAddrs.length > 0) {
  console.log('\nI/O port addresses:');
  const ioUnique = [...new Set(result.ioAddrs)].sort((a,b)=>a-b);
  for (const a of ioUnique) console.log(`  ${hex(a,6)}`);
}

// ======================== TOKEN CLASSIFICATION TABLE ========================

console.log(`\n${'='.repeat(72)}`);
console.log('=== TOKEN CLASSIFICATION TABLE (from session 565 + this decode) ===');
console.log('  Token Value | Class (B) | TI Token     | Meaning');
console.log('  ------------|-----------|--------------|--------');
console.log('  0x5C        | B=2       | tMatrix      | matrix variable');
console.log('  0xAA        | B=4       | tRe          | real part / numeric');
console.log('  0x62-0x63   | B=0       | tVarStrng+   | string variable / identifier');
console.log('  0x5D        | B=1       | tList        | list variable');
console.log('  0x5E        | B=3       | tEq          | equation variable');
console.log('  0x61        | B=8       | tPic         | picture variable');
console.log('  else (<0x64)| B=7       | (default)    | other named variable');
console.log('  0xEF        | B=0x1A    | 2-byte STO   | reads sub-token digit 0x50-0x59');
console.log('  0x5F        | error     | error token  | JP 0x061D1A (OS error handler)');
console.log('  0xEB        | redirect  | list/prgm    | CALL 0x099FDA then JP 0x059FFF');
console.log('  0x41-0x5B   | accept    | tA-tTheta    | letters -> JP 0x059FFF direct');
console.log('  0x72        | accept    | tAns         | Ans -> JP 0x059FFF direct');
console.log('  >=0x64      | error     | tGDB+        | JP 0x09BAF1 (reject)');
console.log('');
console.log('  Classification output:');
console.log('    D005F8 = B register (class code 0-8)');
console.log('    D005F9 = sub-type (for 0xEF: digit 0x50-0x59 offset)');
console.log('    D005FA = secondary token byte (from follow-up read)');

// ======================== SUMMARY ========================

console.log(`\n${'='.repeat(72)}`);
console.log('=== SUMMARY ===');
console.log(`Function: 0x09BAFF — MAIN TOKEN CLASSIFIER`);
console.log(`True size: ${fnSize} bytes (${hex(FN_START,6)} - ${hex(fnEndAddr,6)})`);
console.log(`Last instruction: ${fnEndKind}`);
console.log(`Total instructions decoded: ${result.instructions.length}`);
console.log(`CP/JR dispatch pairs: ${cpJrPairs.length}`);
console.log(`External CALL/JP targets: ${external.length}`);
console.log(`RAM addresses referenced: ${ramUnique.length}`);
console.log('');
console.log('Architecture:');
console.log('  1. CALL 0x09BAAF — read next token from input buffer');
console.log('  2. CALL 0x09B9C8 — pre-classify token');
console.log('  3. Cascading CP/JR chain tests token byte value');
console.log('  4. Each branch loads B with a class code (0-8)');
console.log('  5. B stored to D005F8, sub-type to D005F9, secondary to D005FA');
console.log('  6. Most paths exit via JP 0x059FFF (token accepted/commit)');
console.log('  7. Error token 0x5F exits via JP 0x061D1A (OS error)');

console.log('\n=== PROBE COMPLETE ===');
