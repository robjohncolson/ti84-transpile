#!/usr/bin/env node
/**
 * probe-phase566-decode-0A2537.mjs
 * Decode function at 0x0A2537 - row loop top in the glyph rendering pipeline.
 *
 * Pipeline context:
 *   0x0A23AB (save regs) --> 0x0A2400 (setup/glyph param calc)
 *     --> 0x0A23E5 (blit loop entry, ~512B, 3 rendering paths)
 *       --> 0x0A2537 (THIS - row loop top)
 *         --> 0x0A2548 (column blit routine)
 *           --> 0x0A2695 (post-blit column handler + row closer, session 565)
 *             --> JP NZ,0x0A2537 (back to row loop top)
 *
 * Known context:
 *   IX = glyph data pointer (28 bytes per glyph from font table at 0x003D6E)
 *   IY = D00080 (OS flag base)
 *   D0059C = VRAM scanline pointer
 *   Stride = 0x280 (640 bytes per 16bpp scanline)
 *   B register = row count (DJNZ loop)
 *
 * Decode windows:
 *   1. 0x0A2537 to 0x0A2548 (row loop top, ~17 bytes) - IX advance, VRAM update
 *   2. 0x0A2548 to 0x0A2695 (column blit routine body, ~333 bytes)
 *
 * Read-only probe. Raw ROM disassembly only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const ROW_LOOP_TOP = 0x0A2537;
const COL_BLIT     = 0x0A2548;
const POST_BLIT    = 0x0A2695;
const DUMP_START   = ROW_LOOP_TOP;
const DUMP_LEN     = POST_BLIT - ROW_LOOP_TOP;  // full range: 0x0A2537 to 0x0A2695 = 350 bytes

// -- Hex dump --
console.log(`\n=== HEX DUMP: 0x${DUMP_START.toString(16).toUpperCase()} (${DUMP_LEN} bytes) ===`);
for (let i = 0; i < DUMP_LEN; i += 16) {
  const addr = DUMP_START + i;
  const hexParts = [];
  const ascii = [];
  for (let j = 0; j < 16 && i + j < DUMP_LEN; j++) {
    const b = romBytes[addr + j];
    hexParts.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${hexParts.join(' ').padEnd(48)}  ${ascii.join('')}`);
}

function read24(off) {
  return romBytes[off] | (romBytes[off+1] << 8) | (romBytes[off+2] << 16);
}
function signedByte(b) { return b < 128 ? b : b - 256; }
function hex(v, digits) { return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0'); }

const r8 = ['B','C','D','E','H','L','(HL)','A'];
const cc = ['NZ','Z','NC','C','PO','PE','P','M'];

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) ioAddrs.push(addr);
  else if (addr >= 0xD00000) ramAddrs.push(addr);
}

// eZ80 ADL-mode disassembler (same as phase 565 probe)
function disassemble(startAddr, maxBytes) {
  const instructions = [], callTargets = [], ramAddrs = [], ioAddrs = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;
  let stopped = null;

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
        case 0x78: mnemonic=`${sisStr}IN A, (C)`; break;
        case 0x79: mnemonic=`${sisStr}OUT (C), A`; break;
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
        case 0x45: mnemonic=`${sisStr}RETN`; break;
        case 0x4D: mnemonic=`${sisStr}RETI`; break;
        case 0x46: mnemonic=`${sisStr}IM 0`; break;
        case 0x56: mnemonic=`${sisStr}IM 1`; break;
        case 0x5E: mnemonic=`${sisStr}IM 2`; break;
        case 0x47: mnemonic=`${sisStr}LD I, A`; break;
        case 0x4F: mnemonic=`${sisStr}LD R, A`; break;
        case 0x57: mnemonic=`${sisStr}LD A, I`; break;
        case 0x5F: mnemonic=`${sisStr}LD A, R`; break;
        case 0x67: mnemonic=`${sisStr}RRD`; break;
        case 0x6F: mnemonic=`${sisStr}RLD`; break;
        case 0xA0: mnemonic=`${sisStr}LDI`; break;
        case 0xB0: mnemonic=`${sisStr}LDIR`; break;
        case 0xA8: mnemonic=`${sisStr}LDD`; break;
        case 0xB8: mnemonic=`${sisStr}LDDR`; break;
        case 0xA1: mnemonic=`${sisStr}CPI`; break;
        case 0xB1: mnemonic=`${sisStr}CPIR`; break;
        case 0xA9: mnemonic=`${sisStr}CPD`; break;
        case 0xB9: mnemonic=`${sisStr}CPDR`; break;
        case 0x4C: mnemonic=`${sisStr}MLT BC`; comment='*** MLT: BC = B * C'; break;
        case 0x5C: mnemonic=`${sisStr}MLT DE`; comment='*** MLT: DE = D * E'; break;
        case 0x6C: mnemonic=`${sisStr}MLT HL`; comment='*** MLT: HL = H * L'; break;
        case 0x7C: mnemonic=`${sisStr}MLT SP`; comment='*** MLT: SP = SPH * SPL'; break;
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
        case 0x08: mnemonic=`${sisStr}EX AF, AF`; break;
        case 0xE3: mnemonic=`${sisStr}EX (SP), ${indexReg}`; break;
        case 0xEB: mnemonic=`${sisStr}EX DE, HL`; break;
        case 0xE9: mnemonic=`${sisStr}JP (${indexReg})`; break;
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
        case 0x01: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD BC, ${hex(a,6)}`; break; }
        case 0x11: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD DE, ${hex(a,6)}`; break; }
        case 0x21: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD ${indexReg}, ${hex(a,6)}`; break; }
        case 0x31: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD SP, ${hex(a,6)}`; break; }
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
        case 0xC3: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}JP ${hex(a,6)}`; callTargets.push({addr:a,type:'JP'}); terminal=!sisMode; break; }
        case 0xCD: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}CALL ${hex(a,6)}`; callTargets.push({addr:a,type:'CALL'}); break; }
        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const c=cc[(op>>3)&7]; const a=read24(pc); pc+=3;
          mnemonic=`${sisStr}JP ${c}, ${hex(a,6)}`; callTargets.push({addr:a,type:`JP ${c}`}); break;
        }
        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c=cc[(op>>3)&7]; const a=read24(pc); pc+=3;
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
        case 0x18: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR ${hex(t,6)}`; callTargets.push({addr:t,type:'JR'}); terminal=!sisMode&&(d<0||t>=startAddr+maxBytes); break; }
        case 0x20: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR NZ, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR NZ'}); break; }
        case 0x28: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR Z, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR Z'}); break; }
        case 0x30: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR NC, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR NC'}); break; }
        case 0x38: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR C, ${hex(t,6)}`; callTargets.push({addr:t,type:'JR C'}); break; }
        case 0x10: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}DJNZ ${hex(t,6)}`; callTargets.push({addr:t,type:'DJNZ'}); break; }
        case 0xC7: case 0xCF: case 0xD7: case 0xDF: case 0xE7: case 0xEF: case 0xF7: case 0xFF: {
          mnemonic=`${sisStr}RST ${hex(op&0x38)}`; break;
        }
        case 0x3A: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD A, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x32: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), A`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x2A: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD ${indexReg}, (${hex(a,6)})`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x22: { const a=read24(pc); pc+=3; mnemonic=`${sisStr}LD (${hex(a,6)}), ${indexReg}`; trackAddr(a,ramAddrs,ioAddrs); break; }
        case 0x02: mnemonic=`${sisStr}LD (BC), A`; break;
        case 0x12: mnemonic=`${sisStr}LD (DE), A`; break;
        case 0x0A: mnemonic=`${sisStr}LD A, (BC)`; break;
        case 0x1A: mnemonic=`${sisStr}LD A, (DE)`; break;
        case 0xD3: { const n=romBytes[pc++]; mnemonic=`${sisStr}OUT (${hex(n)}), A`; break; }
        case 0xDB: { const n=romBytes[pc++]; mnemonic=`${sisStr}IN A, (${hex(n)})`; break; }
        default: mnemonic=`${sisStr}DB ${hex(op)}  ; unknown`; break;
      }
    }

    const byteArr = [];
    for (let i = instrStart; i < pc; i++) byteArr.push(romBytes[i].toString(16).padStart(2,'0'));
    instructions.push({addr:instrStart, bytes:byteArr.join(' '), mnemonic, comment, terminal});

    if (terminal) { stopped=`terminal (${mnemonic.trim()}) at ${hex(instrStart,6)}`; break; }
  }
  return { instructions, callTargets, ramAddrs, ioAddrs, length: pc - startAddr, stopped };
}

function labelAddr(addr) {
  const m = {
    0x0A2537: 'ROW LOOP TOP (THIS)',
    0x0A2548: 'COLUMN BLIT ROUTINE',
    0x0A2695: 'POST-BLIT COLUMN HANDLER + ROW CLOSER (session 565)',
    0x0A26D6: 'RENDERER EARLY EXIT (14B: restore+SCF+RET)',
    0x0A26E4: 'PIXEL FILL MASK TABLE (7 entries)',
    0x0A2400: 'RENDER SETUP / GLYPH PARAM CALC (session 564)',
    0x0A23AB: 'RENDERING PREAMBLE (session 563)',
    0x0A23C0: 'PRE-RENDER SETUP (session 552)',
    0x0A23E5: 'BLIT LOOP ENTRY (~512B, 3 rendering paths)',
    0x0A1799: 'GLYPH RENDERER (session 560)',
    0x0A1A83: 'ROM TABLE LOOKUP',
    0x0A1A8F: 'WORKSPACE SELECTOR',
    0x0A1A9D: 'VRAM PTR CALC 1',
    0x0A1B1C: 'VRAM PTR CALC 2',
    0x0A1B5B: 'PER-CHAR DISPATCH',
    0x0A2013: 'Y-ADVANCE WRAPPER',
    0x0A1F48: 'Y-ADVANCE COMPLEX',
    0x0A2032: 'LINE WRAP',
    0x0A22B1: 'SPECIAL CHAR HANDLER',
    0x0A22DA: 'SELECT IMMEDIATE VS DEFERRED',
    0x0A237E: 'TEXT BUFFER PTR CALC',
    0x0A239E: 'CLEAR RENDER FLAGS',
    0x0A2802: 'SCROLL_SETUP_AND_FILL',
    0x0A2947: 'LARGE SCROLL HANDLER',
    0x0A2D4C: 'ROW OFFSET (pixel_Y = row*20+37)',
    0x0A5424: 'SMALL FONT GLYPH LOADER',
    0x07BF3E: 'glyph data loader',
    0x0800A0: 'MULTI-STUB CLUSTER / split-screen check',
    0x0800B8: 'FLAG TEST (BIT 5 IY+0x44)',
    0x080259: 'SPLIT-FLAG SECONDARY TEST',
    0x08C308: 'BPP MODE TEST',
    0x055316: 'BPP COORD VALIDATION/CLIPPING',
    0x025C33: 'QUICK NEWLINE',
    0x0B4EE2: 'BLIT SPACE',
    0x04C979: 'width-clip',
    0x02398E: 'FONT APP VALIDATOR (session 565)',
    0x000154: 'OS DISPATCH',
  };
  if (m[addr]) return `  (${m[addr]})`;
  if (addr >= 0x080000 && addr < 0x090000) return '  (OS syscall range)';
  if (addr >= 0x0A0000 && addr < 0x0B0000) return '  (display subsystem)';
  if (addr >= 0x040000 && addr < 0x060000) return '  (OS mid-level)';
  if (addr >= 0xD00000 && addr < 0xD10000) return '  (RAM)';
  return '';
}

function ramLabel(addr) {
  if (addr === 0xD0059C) return '  *** VRAM SCANLINE PTR';
  if (addr === 0xD006C0) return '  *** TEXT BUFFER BASE';
  if (addr === 0xD00595) return '  *** CURSOR ROW';
  if (addr === 0xD00596) return '  *** CURSOR COL';
  if (addr === 0xD02685) return '  *** PIXEL X';
  if (addr === 0xD02687) return '  *** PIXEL Y';
  if (addr === 0xD005C5) return '  *** SMALL FONT WORKSPACE';
  if (addr === 0xD02505) return '  *** SCROLL COUNT';
  if (addr === 0xD025CE) return '  *** ROW COUNT';
  if (addr === 0xD025CF) return '  *** FONT APP FLAG';
  if (addr === 0xD000C6) return '  *** BPP DISPATCH FLAGS';
  if (addr === 0xD02FD9) return '  *** CLIP X MAX';
  if (addr === 0xD02FD6) return '  *** CLIP Y MAX';
  if (addr === 0xD026AC) return '  *** CLIP COORD';
  if (addr === 0xD031F5) return '  *** SCROLL BUFFER PTR';
  if (addr === 0xD031F6) return '  *** SCROLL BUFFER 1';
  if (addr === 0xD052C6) return '  *** SCROLL BUFFER 2';
  if (addr === 0xD0232D) return '  *** TEXT BUF COPY';
  if (addr === 0xD02611) return '  *** FONT APP HEADER';
  if (addr >= 0xD00080 && addr <= 0xD000FF) return `  (IY-relative offset ${hex(addr-0xD00080)})`;
  if (addr >= 0xD00000 && addr < 0xD00080) return '  (OS low RAM)';
  if (addr >= 0xD00100 && addr < 0xD00600) return '  (OS state / render vars)';
  if (addr >= 0xD00800 && addr < 0xD00900) return '  (display/cursor state)';
  if (addr >= 0xD02000 && addr < 0xD03200) return '  (cursor / text / scroll state)';
  if (addr >= 0xD40000 && addr < 0xD70000) return '  (VRAM)';
  return '';
}

// ==========================================
// SECTION 1: Row loop top (0x0A2537 to 0x0A2548)
// ==========================================
console.log(`\n${'='.repeat(72)}`);
console.log(`  SECTION 1: ROW LOOP TOP - 0x0A2537 to 0x0A2548 (${COL_BLIT - ROW_LOOP_TOP} bytes)`);
console.log(`  Context: JP NZ,0x0A2537 in post-blit (0x0A2695) loops back here per row`);
console.log(`  Expected: IX advance, VRAM scanline pointer update, register setup`);
console.log(`${'='.repeat(72)}`);

const rowLoopSize = COL_BLIT - ROW_LOOP_TOP;
const rowResult = disassemble(ROW_LOOP_TOP, rowLoopSize);

for (const instr of rowResult.instructions) {
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(24);
  const cStr     = instr.comment ? `  ; ${instr.comment}` : '';
  let annotation = '';
  if (instr.addr === ROW_LOOP_TOP) annotation = '  ; <<< ROW LOOP TOP (DJNZ/JP NZ target)';
  if (instr.addr === COL_BLIT) annotation = '  ; <<< COLUMN BLIT ROUTINE START';
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${cStr}${annotation}`);
}

if (rowResult.stopped) console.log(`\n  [stopped: ${rowResult.stopped}]`);
console.log(`  Row loop preamble: ${rowResult.length} bytes, ${rowResult.instructions.length} instructions`);

// ==========================================
// SECTION 2: Column blit routine (0x0A2548 to 0x0A2695)
// ==========================================
console.log(`\n${'='.repeat(72)}`);
console.log(`  SECTION 2: COLUMN BLIT ROUTINE - 0x0A2548 to 0x0A2695 (${POST_BLIT - COL_BLIT} bytes)`);
console.log(`  Context: Main glyph column rendering, called per-row from row loop`);
console.log(`  Falls through into 0x0A2695 (post-blit column handler)`);
console.log(`${'='.repeat(72)}`);

const colBlitSize = POST_BLIT - COL_BLIT;
const colResult = disassemble(COL_BLIT, colBlitSize);

for (const instr of colResult.instructions) {
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(24);
  const cStr     = instr.comment ? `  ; ${instr.comment}` : '';
  let annotation = '';
  if (instr.addr === COL_BLIT) annotation = '  ; <<< COLUMN BLIT ENTRY';
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${cStr}${annotation}`);
}

if (colResult.stopped) console.log(`\n  [stopped: ${colResult.stopped}]`);
else console.log(`\n  [reached ${colBlitSize}-byte limit at ${hex(COL_BLIT+colResult.length,6)}]`);
console.log(`  Column blit routine: ${colResult.length} bytes, ${colResult.instructions.length} instructions`);

// ==========================================
// SECTION 3: Full decode (0x0A2537 to 0x0A2695) - combined view
// ==========================================
console.log(`\n${'='.repeat(72)}`);
console.log(`  SECTION 3: FULL DECODE - 0x0A2537 to 0x0A2695 (${DUMP_LEN} bytes)`);
console.log(`${'='.repeat(72)}`);

const fullResult = disassemble(DUMP_START, DUMP_LEN);

for (const instr of fullResult.instructions) {
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(24);
  const cStr     = instr.comment ? `  ; ${instr.comment}` : '';
  let annotation = '';
  if (instr.addr === ROW_LOOP_TOP) annotation = '  ; <<< ROW LOOP TOP';
  if (instr.addr === COL_BLIT)     annotation = '  ; <<< COLUMN BLIT START';
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${cStr}${annotation}`);
}

if (fullResult.stopped) console.log(`\n  [stopped: ${fullResult.stopped}]`);
else console.log(`\n  [reached end of decode window at ${hex(DUMP_START+fullResult.length,6)}]`);

// ==========================================
// SUMMARY
// ==========================================
console.log(`\n${'='.repeat(72)}`);
console.log(`  SUMMARY`);
console.log(`${'='.repeat(72)}`);
console.log(`Function start:       ${hex(DUMP_START,6)}`);
console.log(`Bytes disassembled:   ${fullResult.length}`);
console.log(`End address reached:  ${hex(DUMP_START+fullResult.length,6)}`);
console.log(`Stop reason:          ${fullResult.stopped || 'coverage limit'}`);
console.log(`Instructions decoded: ${fullResult.instructions.length}`);

// RAM addresses
if (fullResult.ramAddrs.length > 0) {
  const unique = [...new Set(fullResult.ramAddrs)].sort((a,b)=>a-b);
  console.log(`\nRAM addresses accessed (${unique.length} unique):`);
  for (const a of unique) console.log(`  ${hex(a,6)}${ramLabel(a)}`);
}

// IO addresses
if (fullResult.ioAddrs.length > 0) {
  const unique = [...new Set(fullResult.ioAddrs)].sort();
  console.log(`\nLCD/IO MMIO accessed:`);
  for (const a of unique) console.log(`  ${hex(a,6)}`);
}

// Branch targets
if (fullResult.callTargets.length > 0) {
  console.log(`\nBranch / CALL targets (${fullResult.callTargets.length} total):`);
  for (const t of fullResult.callTargets)
    console.log(`  ${t.type.padEnd(10)} -> ${hex(t.addr,6)}${labelAddr(t.addr)}`);
}

// IY references
const iyRefs = fullResult.instructions.filter(i => i.mnemonic.includes('IY'));
if (iyRefs.length > 0) {
  console.log(`\nIY register references (IY base = 0xD00080):`);
  for (const i of iyRefs) {
    const as = i.addr.toString(16).padStart(6,'0');
    const m  = i.mnemonic.match(/IY([+-]0x[0-9A-F]+)/i);
    if (m) {
      const sign = m[1][0]==='-' ? -1 : 1;
      const off  = parseInt(m[1].replace(/[+-]/,''), 16) * sign;
      console.log(`  ${as}  ${i.mnemonic.padEnd(40)}  => abs ${hex(0xD00080+off,6)}`);
    } else { console.log(`  ${as}  ${i.mnemonic}`); }
  }
}

// IX references (glyph data pointer)
const ixRefs = fullResult.instructions.filter(i => i.mnemonic.includes('IX'));
if (ixRefs.length > 0) {
  console.log(`\nIX register references (IX = glyph data ptr, 28B/glyph from 0x003D6E):`);
  for (const i of ixRefs) {
    const as = i.addr.toString(16).padStart(6,'0');
    console.log(`  ${as}  ${i.mnemonic}`);
  }
}

// MLT instructions
const mltInstrs = fullResult.instructions.filter(i => i.mnemonic.includes('MLT'));
if (mltInstrs.length > 0) {
  console.log(`\nMLT (multiply) instructions found:`);
  for (const i of mltInstrs)
    console.log(`  ${i.addr.toString(16).padStart(6,'0')}  ${i.mnemonic}  ; ${i.comment}`);
} else {
  console.log(`\nNo MLT instructions in this range.`);
}

// Function boundary analysis
console.log(`\n=== FUNCTION BOUNDARY ANALYSIS ===`);
const retInstrs = fullResult.instructions.filter(i => i.mnemonic.match(/^(\.SIS )?RET($| )/));
const jpInstrs  = fullResult.instructions.filter(i => i.mnemonic.match(/^(\.SIS )?JP 0x/));
const jrInstrs  = fullResult.instructions.filter(i => i.mnemonic.match(/^(\.SIS )?JR /));
const djnzInstrs= fullResult.instructions.filter(i => i.mnemonic.match(/^(\.SIS )?DJNZ /));
const calls     = fullResult.instructions.filter(i => i.mnemonic.match(/^(\.SIS )?CALL /));

console.log(`All RETs (conditional + unconditional):  ${retInstrs.length}`);
for (const r of retInstrs) console.log(`  ${r.addr.toString(16).padStart(6,'0')}  ${r.mnemonic}`);

console.log(`Unconditional JPs:   ${jpInstrs.length}`);
for (const j of jpInstrs) {
  const tm=j.mnemonic.match(/JP (0x[0-9A-F]+)/i); const ta=tm?parseInt(tm[1],16):0;
  console.log(`  ${j.addr.toString(16).padStart(6,'0')}  ${j.mnemonic}${labelAddr(ta)}`);
}

console.log(`JR (relative jumps): ${jrInstrs.length}`);
for (const j of jrInstrs) {
  const tm=j.mnemonic.match(/(0x[0-9A-F]+)/i); const ta=tm?parseInt(tm[1],16):0;
  console.log(`  ${j.addr.toString(16).padStart(6,'0')}  ${j.mnemonic}${labelAddr(ta)}`);
}

console.log(`DJNZ instructions:   ${djnzInstrs.length}`);
for (const d of djnzInstrs) {
  const tm=d.mnemonic.match(/(0x[0-9A-F]+)/i); const ta=tm?parseInt(tm[1],16):0;
  console.log(`  ${d.addr.toString(16).padStart(6,'0')}  ${d.mnemonic}${labelAddr(ta)}`);
}

console.log(`CALL instructions:   ${calls.length}`);
for (const c of calls) {
  const tm=c.mnemonic.match(/CALL (?:\w+, )?(0x[0-9A-F]+)/i); const ta=tm?parseInt(tm[1],16):0;
  console.log(`  ${c.addr.toString(16).padStart(6,'0')}  ${c.mnemonic}${labelAddr(ta)}`);
}

// Internal branch target map (which addresses within this range are jumped to)
console.log(`\n=== INTERNAL BRANCH TARGET MAP ===`);
const internalTargets = new Map();
for (const t of fullResult.callTargets) {
  if (t.addr >= DUMP_START && t.addr < DUMP_START + DUMP_LEN) {
    if (!internalTargets.has(t.addr)) internalTargets.set(t.addr, []);
    internalTargets.get(t.addr).push(t.type);
  }
}
if (internalTargets.size > 0) {
  for (const [addr, types] of [...internalTargets.entries()].sort((a,b)=>a[0]-b[0])) {
    console.log(`  ${hex(addr,6)} <- ${types.join(', ')}`);
  }
} else {
  console.log(`  (no internal branch targets)`);
}

// Cross-check: verify 0x0A2695 post-blit starts correctly
console.log(`\n=== CROSS-CHECK: 0x0A2695 post-blit entry (first 8 bytes) ===`);
const postBlitCheck = disassemble(POST_BLIT, 16);
for (const instr of postBlitCheck.instructions.slice(0, 4)) {
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(24);
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}`);
}

// Rendering path analysis
console.log(`\n=== RENDERING PATH ANALYSIS ===`);
console.log(`Pipeline structure:`);
console.log(`  0x0A23E5  BLIT LOOP ENTRY (3 rendering paths: mono/4bit/16bit)`);
console.log(`  0x0A2537  ROW LOOP TOP (THIS) - row iteration setup`);
console.log(`  0x0A2548  COLUMN BLIT ROUTINE - per-column glyph pixel rendering`);
console.log(`  0x0A2695  POST-BLIT COLUMN HANDLER + ROW CLOSER (session 565)`);
console.log(`            JP NZ,0x0A2537 loops back for next row`);
console.log(`            When rows exhausted: falls through to exit path`);
console.log(`  0x0A26D6  RENDERER EARLY EXIT (14B: register restore + SCF + RET)`);

console.log(`\nRow loop structure:`);
console.log(`  B = row counter (loaded before entering loop)`);
console.log(`  Each iteration:`);
console.log(`    1. Row setup at 0x0A2537 (VRAM ptr advance, IX glyph data advance)`);
console.log(`    2. Column blit at 0x0A2548 (pixel rendering per column)`);
console.log(`    3. Post-blit at 0x0A2695 (column advance, DJNZ -> 0x0A2537)`);

console.log(`\nDone.`);
