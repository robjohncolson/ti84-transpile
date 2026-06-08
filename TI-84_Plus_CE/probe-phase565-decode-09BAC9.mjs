#!/usr/bin/env node
/**
 * probe-phase565-decode-09BAC9.mjs
 * Decode function at 0x09BAC9 — "Input Reader" candidate (priority since session 558).
 *
 * ========== FINDINGS ==========
 *
 * 0x09BAC9 is a TINY 8-BYTE FUNCTION (not the large input reader expected):
 *
 *   09BAC9: LD BC, (D0231A)     ; load current input buffer pointer
 *   09BACE: INC BC               ; advance past current byte
 *   09BACF: JR 0x09BABD          ; fall into shared tail
 *
 * It is a "NEXT TOKEN / ADVANCE INPUT CURSOR" helper — loads the input buffer
 * pointer from D0231A, increments it, then jumps to 0x09BABD which does:
 *
 *   09BABD: LD HL, (D0231D)     ; load input buffer END pointer
 *   09BAC1: XOR A               ; clear carry
 *   09BAC2: SBC HL, BC          ; end - current
 *   09BAC4: RET C               ; if current > end, return with A=0 (no more input)
 *   09BAC5: PUSH BC / POP HL    ; HL = current ptr
 *   09BAC7: LD A, (HL)          ; read byte at current position
 *   09BAC8: RET                  ; return with A = token byte
 *
 * The companion at 0x09BAAB also increments D0231A then falls into the same
 * 0x09BABD tail, but it calls 0x080051 first (an OS syscall).
 *
 * ========== SURROUNDING FUNCTION MAP (0x09BA00-0x09BC60) ==========
 *
 * 0x09BA00-0x09BA55: Input buffer insertion/splice (LDIR copy, D0231A/D02317/D0230E)
 *                     Tail-calls JP 0x07F914
 * 0x09BA59-0x09BA6F: Input buffer delete (CALL 0x059487, updates D0231A)
 * 0x09BA70-0x09BAAA: Token dispatch table — compares (IY+0x36), calls 0x05B813,
 *                     builds HL = 0x05A829 + A*3, JP (HL) = jump table dispatch
 * 0x09BAAB-0x09BAC8: Advance + read next token (CALL 0x080051, update D0231A, read)
 * 0x09BAC9-0x09BACF: *** THIS FUNCTION — quick advance + read (no syscall)
 * 0x09BAD1-0x09BAD7: Read byte from (D02593)+1 — secondary input pointer
 * 0x09BAD8-0x09BADD: Advance (D02593)+1 and read — variant of 0x09BAD1
 * 0x09BADF-0x09BAF1: Input validation — calls 0x09BAF5, 0x09C4E0, 0x09BAD1
 *                     Error path: JP 0x061D1A (OS error handler)
 * 0x09BAF5-0x09BAFB: Read D0230E low nibble, JP 0x080090 (mode test)
 * 0x09BAFF-0x09BBA2: *** MAIN TOKEN CLASSIFIER (163B) ***
 *                     Reads token via 0x09BAAF, classifies via 0x09B9C8,
 *                     massive CP/JR chain testing token codes:
 *                       0xEF = special (STO token? reads digit 0x50-0x59, stores to D005F9)
 *                       0x5F = error (JP 0x061D1A)
 *                       0xEB = CALL 0x099FDA then JP 0x059FFF
 *                       0x62 = variable name (CALL 0x09BBA6 for sub-token check)
 *                       0xAA = accepted token
 *                       0x41-0x5B = letters (JP 0x059FFF)
 *                       0x5C = B=2, 0xAA = B=4, 0x62-0x63 = B=0, 0x5D = B=1,
 *                       0x5E = B=3, 0x61 = B=8, else B=7
 *                     Stores classification B -> D005F8, second token -> D005FA
 *                     Final: JP 0x059FFF (token accepted)
 * 0x09BBA6-0x09BBB1: Sub-token check — calls 0x09BAC9 (this fn), tests for
 *                     0x3E ('>') or 0x3F ('?'), returns Z flag
 * 0x09BBB2-0x09BBB9: Address compare (HL = 0x099A8A - BC)
 * 0x09BBBA-0x09BBC8: CALL 0x082C3A, CALL 0x09AC21, clear D005F8
 * 0x09BBC9-0x09BBE7: Token validity check — cascading CP/RET Z for 0xB5, 0xAB,
 *                     0xEB, 0x41-0x61 range, 0xAA, 0x64+
 * 0x09BBEB-0x09BC12: Complex input parse — calls 0x09BAD1, 0x09BF50, 0x09BAAB,
 *                     0x09BB03; handles token 0x11, calls 0x09BBA6
 * 0x09BC16-0x09BC5F: Expression evaluator setup — calls 0x09A00F, 0x07F8A2,
 *                     0x082AC2, 0x07F7BD; reads D0061A, D0068A; handles type 0x02
 *
 * ========== KEY DATA STRUCTURES ==========
 *
 * D0231A = Current input buffer read pointer (3 bytes)
 * D0231D = Input buffer end pointer (3 bytes)
 * D02317 = Input buffer base/start pointer (3 bytes)
 * D0230E = Input mode/type byte (low nibble = mode)
 * D02320 = Token dispatch selector
 * D02593 = Secondary input pointer (for sub-expressions?)
 * D005F8 = Token classification code (0-8, set by classifier)
 * D005F9 = Token sub-type / numeric digit offset
 * D005FA = Secondary token byte
 * D0061A = Current token being parsed
 * D0068A = Expression/variable pointer
 *
 * ========== CLASSIFICATION ==========
 *
 * Function: INPUT CURSOR ADVANCE + READ (quick variant, no syscall)
 * Size: 8 bytes (0x09BAC9-0x09BAD0)
 * Rating: 3 stars (small helper, but key piece of the input tokenizer pipeline)
 * Related: 0x09BAAB (advance+read with syscall), 0x09BAFF (main token classifier)
 *
 * The broader region 0x09BA00-0x09BC60 is the OS INPUT TOKENIZER/PARSER core,
 * containing ~15 small functions that tokenize, classify, and dispatch input
 * tokens from the input buffer at D0231A-D0231D. This is the "input reader"
 * subsystem referenced in session 558.
 *
 * No direct keyboard port I/O (0xF500xx) — this layer operates on already-
 * scanned tokens in RAM, not raw key matrix hardware. The keyboard hardware
 * layer is upstream (ISR/scan code level). D00587 not referenced here either.
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
const cc = ['NZ','Z','NC','C','PO','PE','P','M'];

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xF50000 && addr <= 0xF5001F) ioAddrs.push(addr);
  else if (addr >= 0xE30000 && addr <= 0xE3FFFF) ioAddrs.push(addr);
  else if (addr >= 0xD00000) ramAddrs.push(addr);
}

// Linear eZ80 ADL-mode disassembler
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
          const c=cc[(op>>3)&7]; const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w;
          mnemonic=`${sisStr}JP ${c}, ${hex(a,6)}`; callTargets.push({addr:a,type:`JP ${c}`}); break;
        }
        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c=cc[(op>>3)&7]; const w=sisMode?2:3; const a=sisMode?read16(pc):read24(pc); pc+=w;
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
        case 0x18: { const d=signedByte(romBytes[pc++]); const t=pc+d; mnemonic=`${sisStr}JR ${hex(t,6)}`; callTargets.push({addr:t,type:'JR'}); break; }
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
    0xD005F8: '*** TOKEN CLASS CODE',
    0xD005F9: '*** TOKEN SUB-TYPE',
    0xD005FA: '*** SECONDARY TOKEN',
    0xD0061A: '(current parse token)',
    0xD0068A: '(expression/var ptr)',
    0xD0230E: '*** INPUT MODE BYTE',
    0xD02317: '*** INPUT BUF BASE PTR',
    0xD0231A: '*** INPUT BUF READ PTR',
    0xD0231D: '*** INPUT BUF END PTR',
    0xD02320: '(token dispatch selector)',
    0xD02593: '(secondary input ptr)',
  };
  if (labels[addr]) return `  ${labels[addr]}`;
  if (addr >= 0xD00080 && addr <= 0xD000FF) return `  (IY+${hex(addr-0xD00080)} flags)`;
  if (addr >= 0xD00500 && addr < 0xD00600) return '  (key/token area)';
  if (addr >= 0xD00600 && addr < 0xD00700) return '  (OS input/display)';
  if (addr >= 0xD02000 && addr < 0xD03200) return '  (text/scroll state)';
  return '';
}

// ======================== MAIN DECODE ========================

const START = 0x09BAAB;  // true entry of the input reader cluster containing 0x09BAC9
const LEN   = 0x1B0;     // through 0x09BC5B

console.log('=== Phase 565: decode 0x09BAC9 INPUT CURSOR ADVANCE + surrounding tokenizer ===');
console.log(`Decoding ${hex(START,6)} to ${hex(START+LEN,6)} (${LEN} bytes)\n`);

const result = disassembleLinear(START, LEN);

// Annotate function boundaries
const funcBounds = [
  [0x09BAAB, '--- fn: ADVANCE+READ (with syscall) ---'],
  [0x09BAC9, '--- fn: 0x09BAC9 ADVANCE+READ (quick, no syscall) [TARGET] ---'],
  [0x09BAD1, '--- fn: READ SECONDARY (D02593) ---'],
  [0x09BAD8, '--- fn: ADVANCE SECONDARY (D02593) ---'],
  [0x09BADF, '--- fn: INPUT VALIDATION ---'],
  [0x09BAF5, '--- fn: MODE NIBBLE TEST ---'],
  [0x09BAFF, '--- fn: MAIN TOKEN CLASSIFIER (163B) ---'],
  [0x09BBA6, '--- fn: SUB-TOKEN CHECK (calls 0x09BAC9) ---'],
  [0x09BBB2, '--- fn: ADDRESS COMPARE ---'],
  [0x09BBBA, '--- fn: CLEAR TOKEN CLASS ---'],
  [0x09BBC9, '--- fn: TOKEN VALIDITY CHECK ---'],
  [0x09BBEB, '--- fn: COMPLEX INPUT PARSE ---'],
  [0x09BC16, '--- fn: EXPRESSION EVAL SETUP ---'],
];
const boundMap = new Map(funcBounds);

for (const instr of result.instructions) {
  if (boundMap.has(instr.addr)) {
    console.log(`\n  ${boundMap.get(instr.addr)}`);
  }
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(20);
  const cStr     = instr.comment ? `  ; ${instr.comment}` : '';
  const termMark = instr.terminal ? '  <<<< END' : '';
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${cStr}${termMark}`);
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('=== SUMMARY ===');
console.log(`Decoded: ${result.length} bytes, ${result.instructions.length} instructions`);

const unique = [...new Map(result.callTargets.map(t => [`${t.type}:${t.addr}`, t])).values()];
unique.sort((a,b) => a.addr - b.addr);
console.log(`\nExternal CALL/JP targets (${unique.filter(t=>t.addr<START||t.addr>=START+LEN).length}):`);
for (const t of unique) {
  if (t.addr < START || t.addr >= START + LEN) {
    console.log(`  ${t.type.padEnd(10)} -> ${hex(t.addr,6)}`);
  }
}

console.log('\nRAM addresses:');
const ramUnique = [...new Set(result.ramAddrs)].sort((a,b)=>a-b);
for (const a of ramUnique) console.log(`  ${hex(a,6)}${ramLabel(a)}`);

console.log('\nKeyboard/input verdict:');
console.log('  This is NOT a keyboard hardware reader.');
console.log('  It is the OS INPUT TOKEN PARSER — reads pre-tokenized input');
console.log('  from the input buffer (D0231A-D0231D), classifies tokens,');
console.log('  and dispatches to expression evaluation.');
console.log('  No keyboard port I/O (F500xx), no scan codes (D00587).');
