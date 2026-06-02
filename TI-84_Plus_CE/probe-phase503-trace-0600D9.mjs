#!/usr/bin/env node
// probe-phase503-trace-0600D9.mjs
// Static disassembly of the callers of 0x096B65 (cursor display function).
// Answers: does 0x0600D9's context call 0x061061 / 0x061003 BEFORE calling 0x096B65?
// Also decodes ~30 bytes from callers at 0x0615F6, 0x06161A, 0x06167D.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ROM is mapped at physical address 0x000000.
// TI-84 Plus CE OS starts at 0x000000 in flash.
// Addresses 0x000000-0x3FFFFF are ROM (4 MB).
function romByte(addr) {
  if (addr < 0 || addr >= rom.length) return 0xFF;
  return rom[addr];
}

// ─── Address flags ────────────────────────────────────────────────────────────
const CURSOR_DISPLAY = 0x096B65;  // full cursor display (invalidate)
const CURSOR_DRAW    = 0x061061;  // cursor draw (write to VRAM)
const CURSOR_ERASE   = 0x061003;  // cursor erase (write to VRAM)
const PUTCHAR        = 0x061980;  // putchar

const INTERESTING_CALLS = {
  [CURSOR_DISPLAY]: '*** CALL 0x096B65 (CURSOR DISPLAY / INVALIDATE)',
  [CURSOR_DRAW]:    '*** CALL 0x061061 (CURSOR DRAW)',
  [CURSOR_ERASE]:   '*** CALL 0x061003 (CURSOR ERASE)',
  [PUTCHAR]:        '*** CALL 0x061980 (PUTCHAR)',
};

// ─── Minimal eZ80 disassembler ────────────────────────────────────────────────
// Returns { bytes, mnemonic, flags } where flags is an array of annotation strings.

function hexB(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function hexA(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }

// Read a 3-byte little-endian address from rom at offset.
function read24(offset) {
  return romByte(offset) | (romByte(offset+1) << 8) | (romByte(offset+2) << 16);
}

// Sign-extend an 8-bit value.
function s8(v) { return (v & 0x80) ? v - 256 : v; }

// 8-bit register names.
const R8 = ['B','C','D','E','H','L','(HL)','A'];

// Disassemble one instruction starting at romAddr (physical = logical for ROM).
function disassembleOne(addr) {
  let offset = addr;
  const startAddr = addr;
  const rawBytes = [];

  function nextByte() {
    const b = romByte(offset);
    rawBytes.push(b);
    offset++;
    return b;
  }

  let adlPrefix = '';  // .SIS/.LIS/.SIL/.LIL
  let xyPrefix = 0;    // 0, 0xDD (IX), or 0xFD (IY)

  // Consume ADL / suffix prefixes first.
  let b = nextByte();

  // .SIS=0x40 .LIS=0x49 .SIL=0x52 .LIL=0x5B
  if      (b === 0x40) { adlPrefix = '.SIS '; b = nextByte(); }
  else if (b === 0x49) { adlPrefix = '.LIS '; b = nextByte(); }
  else if (b === 0x52) { adlPrefix = '.SIL '; b = nextByte(); }
  else if (b === 0x5B) { adlPrefix = '.LIL '; b = nextByte(); }

  // IX/IY prefix.
  if      (b === 0xDD) { xyPrefix = 0xDD; b = nextByte(); }
  else if (b === 0xFD) { xyPrefix = 0xFD; b = nextByte(); }

  const xyName = xyPrefix === 0xDD ? 'IX' : (xyPrefix === 0xFD ? 'IY' : 'HL');
  const xyLo   = xyPrefix === 0xDD ? 'IXL' : (xyPrefix === 0xFD ? 'IYL' : 'L');
  const xyHi   = xyPrefix === 0xDD ? 'IXH' : (xyPrefix === 0xFD ? 'IYH' : 'H');

  let mnem = '';
  const flags = [];

  // Helper: flag IY+disp accesses for blink-condition offsets.
  function checkIYdisp(rawDisp) {
    if (xyPrefix !== 0xFD) return;
    const d = rawDisp & 0xFF;
    if (d === 0x18 || d === 0x13 || d === 0xFC || d === 0xFD || d === 0xFE || d === 0xFF) {
      flags.push(`IY+0x${d.toString(16).toUpperCase()} access`);
    }
  }

  // ─── CB prefix (bit ops) ────────────────────────────────────────────────
  if (b === 0xCB) {
    let disp = 0;
    let rawDisp = 0;
    if (xyPrefix) {
      rawDisp = nextByte();
      disp = s8(rawDisp);
    }
    const cb = nextByte();
    const cbReg = xyPrefix
      ? `(${xyName}${disp >= 0 ? '+' : ''}${disp})`
      : R8[cb & 7];
    const bitNum = (cb >> 3) & 7;
    const cbGrp = cb >> 6;
    if (cbGrp === 0) {
      const shiftOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnem = `${adlPrefix}${shiftOps[(cb >> 3) & 7]} ${cbReg}`;
    } else if (cbGrp === 1) {
      mnem = `${adlPrefix}BIT ${bitNum},${cbReg}`;
      if (xyPrefix === 0xFD) {
        const d = rawDisp & 0xFF;
        if (d === 0x18 || d === 0x13 || d === 0xFC || d === 0xFD || d === 0xFE || d === 0xFF) {
          flags.push(`IY+0x${d.toString(16).toUpperCase()} bit ${bitNum} test (blink condition)`);
        }
      }
    } else if (cbGrp === 2) {
      mnem = `${adlPrefix}RES ${bitNum},${cbReg}`;
    } else {
      mnem = `${adlPrefix}SET ${bitNum},${cbReg}`;
    }
  }

  // ─── ED prefix (extended) ───────────────────────────────────────────────
  else if (b === 0xED) {
    const ed = nextByte();
    if (ed === 0x43) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),BC`; }
    else if (ed === 0x4B) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD BC,(${hexA(nn)})`; }
    else if (ed === 0x53) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),DE`; }
    else if (ed === 0x5B) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD DE,(${hexA(nn)})`; }
    else if (ed === 0x63) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),HL`; }
    else if (ed === 0x6B) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD HL,(${hexA(nn)})`; }
    else if (ed === 0x73) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),SP`; }
    else if (ed === 0x7B) { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD SP,(${hexA(nn)})`; }
    else if (ed === 0x44) mnem = `${adlPrefix}NEG`;
    else if (ed === 0x45) mnem = `${adlPrefix}RETN`;
    else if (ed === 0x46) mnem = `${adlPrefix}IM 0`;
    else if (ed === 0x47) mnem = `${adlPrefix}LD I,A`;
    else if (ed === 0x4D) mnem = `${adlPrefix}RETI`;
    else if (ed === 0x4F) mnem = `${adlPrefix}LD R,A`;
    else if (ed === 0x56) mnem = `${adlPrefix}IM 1`;
    else if (ed === 0x57) mnem = `${adlPrefix}LD A,I`;
    else if (ed === 0x5E) mnem = `${adlPrefix}IM 2`;
    else if (ed === 0x5F) mnem = `${adlPrefix}LD A,R`;
    else if (ed === 0x67) mnem = `${adlPrefix}RRD`;
    else if (ed === 0x6F) mnem = `${adlPrefix}RLD`;
    else if (ed === 0xA0) mnem = `${adlPrefix}LDI`;
    else if (ed === 0xA1) mnem = `${adlPrefix}CPI`;
    else if (ed === 0xA2) mnem = `${adlPrefix}INI`;
    else if (ed === 0xA3) mnem = `${adlPrefix}OUTI`;
    else if (ed === 0xA8) mnem = `${adlPrefix}LDD`;
    else if (ed === 0xA9) mnem = `${adlPrefix}CPD`;
    else if (ed === 0xB0) mnem = `${adlPrefix}LDIR`;
    else if (ed === 0xB1) mnem = `${adlPrefix}CPIR`;
    else if (ed === 0xB8) mnem = `${adlPrefix}LDDR`;
    else if (ed === 0xB9) mnem = `${adlPrefix}CPDR`;
    else if (ed === 0x32) mnem = `${adlPrefix}RSMIX`;
    else if (ed === 0x33) mnem = `${adlPrefix}STMIX`;
    else mnem = `${adlPrefix}ED ${hexB(ed)}`;
  }

  // ─── Main opcode table ──────────────────────────────────────────────────
  else {
    switch (b) {
      case 0x00: mnem = `${adlPrefix}NOP`; break;
      case 0x02: mnem = `${adlPrefix}LD (BC),A`; break;
      case 0x07: mnem = `${adlPrefix}RLCA`; break;
      case 0x08: mnem = `${adlPrefix}EX AF,AF'`; break;
      case 0x09: mnem = `${adlPrefix}ADD ${xyName},BC`; break;
      case 0x0A: mnem = `${adlPrefix}LD A,(BC)`; break;
      case 0x0F: mnem = `${adlPrefix}RRCA`; break;
      case 0x10: { const e = s8(nextByte()); const dst = offset + e; mnem = `${adlPrefix}DJNZ ${hexA(dst)}`; break; }
      case 0x12: mnem = `${adlPrefix}LD (DE),A`; break;
      case 0x17: mnem = `${adlPrefix}RLA`; break;
      case 0x19: mnem = `${adlPrefix}ADD ${xyName},DE`; break;
      case 0x1A: mnem = `${adlPrefix}LD A,(DE)`; break;
      case 0x1F: mnem = `${adlPrefix}RRA`; break;
      case 0x22: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),${xyName}`; break; }
      case 0x27: mnem = `${adlPrefix}DAA`; break;
      case 0x29: mnem = `${adlPrefix}ADD ${xyName},${xyName}`; break;
      case 0x2A: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD ${xyName},(${hexA(nn)})`; break; }
      case 0x2F: mnem = `${adlPrefix}CPL`; break;
      case 0x32: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD (${hexA(nn)}),A`; break; }
      case 0x37: mnem = `${adlPrefix}SCF`; break;
      case 0x39: mnem = `${adlPrefix}ADD ${xyName},SP`; break;
      case 0x3A: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD A,(${hexA(nn)})`; break; }
      case 0x3F: mnem = `${adlPrefix}CCF`; break;

      // LD rr,nn (24-bit in ADL mode)
      case 0x01: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD BC,${hexA(nn)}`; break; }
      case 0x11: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD DE,${hexA(nn)}`; break; }
      case 0x21: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD ${xyName},${hexA(nn)}`; break; }
      case 0x31: { const nn = read24(offset); offset+=3; rawBytes.push(nn&0xFF,(nn>>8)&0xFF,(nn>>16)&0xFF); mnem = `${adlPrefix}LD SP,${hexA(nn)}`; break; }

      // INC/DEC rr
      case 0x03: mnem = `${adlPrefix}INC BC`; break;
      case 0x0B: mnem = `${adlPrefix}DEC BC`; break;
      case 0x13: mnem = `${adlPrefix}INC DE`; break;
      case 0x1B: mnem = `${adlPrefix}DEC DE`; break;
      case 0x23: mnem = `${adlPrefix}INC ${xyName}`; break;
      case 0x2B: mnem = `${adlPrefix}DEC ${xyName}`; break;
      case 0x33: mnem = `${adlPrefix}INC SP`; break;
      case 0x3B: mnem = `${adlPrefix}DEC SP`; break;

      // INC/DEC r
      case 0x04: mnem = `${adlPrefix}INC B`; break;
      case 0x05: mnem = `${adlPrefix}DEC B`; break;
      case 0x0C: mnem = `${adlPrefix}INC C`; break;
      case 0x0D: mnem = `${adlPrefix}DEC C`; break;
      case 0x14: mnem = `${adlPrefix}INC D`; break;
      case 0x15: mnem = `${adlPrefix}DEC D`; break;
      case 0x1C: mnem = `${adlPrefix}INC E`; break;
      case 0x1D: mnem = `${adlPrefix}DEC E`; break;
      case 0x24: mnem = `${adlPrefix}INC ${xyHi}`; break;
      case 0x25: mnem = `${adlPrefix}DEC ${xyHi}`; break;
      case 0x2C: mnem = `${adlPrefix}INC ${xyLo}`; break;
      case 0x2D: mnem = `${adlPrefix}DEC ${xyLo}`; break;
      case 0x34: {
        if (xyPrefix) { const d=s8(nextByte()); checkIYdisp(d<0?d+256:d); mnem=`${adlPrefix}INC (${xyName}${d>=0?'+':''}${d})`; }
        else mnem=`${adlPrefix}INC (HL)`;
        break;
      }
      case 0x35: {
        if (xyPrefix) { const d=s8(nextByte()); checkIYdisp(d<0?d+256:d); mnem=`${adlPrefix}DEC (${xyName}${d>=0?'+':''}${d})`; }
        else mnem=`${adlPrefix}DEC (HL)`;
        break;
      }
      case 0x3C: mnem = `${adlPrefix}INC A`; break;
      case 0x3D: mnem = `${adlPrefix}DEC A`; break;

      // LD r,n
      case 0x06: { const n=nextByte(); mnem=`${adlPrefix}LD B,0x${hexB(n)}`; break; }
      case 0x0E: { const n=nextByte(); mnem=`${adlPrefix}LD C,0x${hexB(n)}`; break; }
      case 0x16: { const n=nextByte(); mnem=`${adlPrefix}LD D,0x${hexB(n)}`; break; }
      case 0x1E: { const n=nextByte(); mnem=`${adlPrefix}LD E,0x${hexB(n)}`; break; }
      case 0x26: { const n=nextByte(); mnem=`${adlPrefix}LD ${xyHi},0x${hexB(n)}`; break; }
      case 0x2E: { const n=nextByte(); mnem=`${adlPrefix}LD ${xyLo},0x${hexB(n)}`; break; }
      case 0x36: {
        if (xyPrefix) { const rawD=nextByte(); const d=s8(rawD); checkIYdisp(rawD); const n=nextByte(); mnem=`${adlPrefix}LD (${xyName}${d>=0?'+':''}${d}),0x${hexB(n)}`; }
        else { const n=nextByte(); mnem=`${adlPrefix}LD (HL),0x${hexB(n)}`; }
        break;
      }
      case 0x3E: { const n=nextByte(); mnem=`${adlPrefix}LD A,0x${hexB(n)}`; break; }

      // PUSH/POP
      case 0xC1: mnem=`${adlPrefix}POP BC`; break;
      case 0xD1: mnem=`${adlPrefix}POP DE`; break;
      case 0xE1: mnem=`${adlPrefix}POP ${xyName}`; break;
      case 0xF1: mnem=`${adlPrefix}POP AF`; break;
      case 0xC5: mnem=`${adlPrefix}PUSH BC`; break;
      case 0xD5: mnem=`${adlPrefix}PUSH DE`; break;
      case 0xE5: mnem=`${adlPrefix}PUSH ${xyName}`; break;
      case 0xF5: mnem=`${adlPrefix}PUSH AF`; break;

      // RET / EXX / JP (HL/IX/IY) / LD SP,HL
      case 0xC9: mnem=`${adlPrefix}RET`; break;
      case 0xD9: mnem=`${adlPrefix}EXX`; break;
      case 0xE9: mnem=`${adlPrefix}JP (${xyName})`; break;
      case 0xF9: mnem=`${adlPrefix}LD SP,${xyName}`; break;

      // RET cc
      case 0xC0: mnem=`${adlPrefix}RET NZ`; break;
      case 0xC8: mnem=`${adlPrefix}RET Z`; break;
      case 0xD0: mnem=`${adlPrefix}RET NC`; break;
      case 0xD8: mnem=`${adlPrefix}RET C`; break;
      case 0xE0: mnem=`${adlPrefix}RET PO`; break;
      case 0xE8: mnem=`${adlPrefix}RET PE`; break;
      case 0xF0: mnem=`${adlPrefix}RET P`; break;
      case 0xF8: mnem=`${adlPrefix}RET M`; break;

      // JP nn
      case 0xC3: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP ${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t].replace('CALL','JP')); break; }

      // CALL nn
      case 0xCD: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL ${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }

      // JP cc,nn
      case 0xC2: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP NZ,${hexA(t)}`; break; }
      case 0xCA: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP Z,${hexA(t)}`; break; }
      case 0xD2: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP NC,${hexA(t)}`; break; }
      case 0xDA: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP C,${hexA(t)}`; break; }
      case 0xE2: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP PO,${hexA(t)}`; break; }
      case 0xEA: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP PE,${hexA(t)}`; break; }
      case 0xF2: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP P,${hexA(t)}`; break; }
      case 0xFA: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}JP M,${hexA(t)}`; break; }

      // CALL cc,nn
      case 0xC4: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL NZ,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xCC: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL Z,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xD4: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL NC,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xDC: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL C,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xE4: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL PO,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xEC: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL PE,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xF4: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL P,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }
      case 0xFC: { const t=read24(offset); offset+=3; rawBytes.push(t&0xFF,(t>>8)&0xFF,(t>>16)&0xFF); mnem=`${adlPrefix}CALL M,${hexA(t)}`; if(INTERESTING_CALLS[t]) flags.push(INTERESTING_CALLS[t]); break; }

      // JR
      case 0x18: { const e=s8(nextByte()); mnem=`${adlPrefix}JR ${hexA(offset+e)}`; break; }
      case 0x20: { const e=s8(nextByte()); mnem=`${adlPrefix}JR NZ,${hexA(offset+e)}`; break; }
      case 0x28: { const e=s8(nextByte()); mnem=`${adlPrefix}JR Z,${hexA(offset+e)}`; break; }
      case 0x30: { const e=s8(nextByte()); mnem=`${adlPrefix}JR NC,${hexA(offset+e)}`; break; }
      case 0x38: { const e=s8(nextByte()); mnem=`${adlPrefix}JR C,${hexA(offset+e)}`; break; }

      // RST — RST 28h (E7) = BCALL
      case 0xC7: mnem=`${adlPrefix}RST 00h`; break;
      case 0xCF: mnem=`${adlPrefix}RST 08h`; break;
      case 0xD7: mnem=`${adlPrefix}RST 10h`; break;
      case 0xDF: mnem=`${adlPrefix}RST 18h`; break;
      case 0xE7: {
        const lo=nextByte(), hi=nextByte();
        const bcall=lo|(hi<<8);
        mnem=`${adlPrefix}RST 28h (BCALL 0x${bcall.toString(16).toUpperCase().padStart(4,'0')})`;
        flags.push(`BCALL 0x${bcall.toString(16).toUpperCase().padStart(4,'0')}`);
        break;
      }
      case 0xEF: mnem=`${adlPrefix}RST 28h`; flags.push('RST 28h (bare)'); break;
      case 0xF7: mnem=`${adlPrefix}RST 30h`; break;
      case 0xFF: mnem=`${adlPrefix}RST 38h`; break;

      // Arithmetic/logic on A with register operands (0x80-0xBF)
      case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x87:
        mnem=`${adlPrefix}ADD A,${R8[b&7]}`; break;
      case 0x86: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}ADD A,(${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}ADD A,(HL)`; break; }
      case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8F:
        mnem=`${adlPrefix}ADC A,${R8[b&7]}`; break;
      case 0x8E: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}ADC A,(${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}ADC A,(HL)`; break; }
      case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x97:
        mnem=`${adlPrefix}SUB ${R8[b&7]}`; break;
      case 0x96: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}SUB (${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}SUB (HL)`; break; }
      case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9F:
        mnem=`${adlPrefix}SBC A,${R8[b&7]}`; break;
      case 0x9E: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}SBC A,(${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}SBC A,(HL)`; break; }
      case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA7:
        mnem=`${adlPrefix}AND ${R8[b&7]}`; break;
      case 0xA6: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}AND (${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}AND (HL)`; break; }
      case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAF:
        mnem=`${adlPrefix}XOR ${R8[b&7]}`; break;
      case 0xAE: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}XOR (${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}XOR (HL)`; break; }
      case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB7:
        mnem=`${adlPrefix}OR ${R8[b&7]}`; break;
      case 0xB6: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}OR (${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}OR (HL)`; break; }
      case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBF:
        mnem=`${adlPrefix}CP ${R8[b&7]}`; break;
      case 0xBE: { if(xyPrefix){const rawD=nextByte();const d=s8(rawD);checkIYdisp(rawD);mnem=`${adlPrefix}CP (${xyName}${d>=0?'+':''}${d})`;}else mnem=`${adlPrefix}CP (HL)`; break; }

      // Arithmetic/logic with immediate byte
      case 0xC6: { const n=nextByte(); mnem=`${adlPrefix}ADD A,0x${hexB(n)}`; break; }
      case 0xCE: { const n=nextByte(); mnem=`${adlPrefix}ADC A,0x${hexB(n)}`; break; }
      case 0xD6: { const n=nextByte(); mnem=`${adlPrefix}SUB 0x${hexB(n)}`; break; }
      case 0xDE: { const n=nextByte(); mnem=`${adlPrefix}SBC A,0x${hexB(n)}`; break; }
      case 0xE6: { const n=nextByte(); mnem=`${adlPrefix}AND 0x${hexB(n)}`; break; }
      case 0xEE: { const n=nextByte(); mnem=`${adlPrefix}XOR 0x${hexB(n)}`; break; }
      case 0xF6: { const n=nextByte(); mnem=`${adlPrefix}OR 0x${hexB(n)}`; break; }
      case 0xFE: { const n=nextByte(); mnem=`${adlPrefix}CP 0x${hexB(n)}`; break; }

      // IN/OUT
      case 0xDB: { const n=nextByte(); mnem=`${adlPrefix}IN A,(0x${hexB(n)})`; break; }
      case 0xD3: { const n=nextByte(); mnem=`${adlPrefix}OUT (0x${hexB(n)}),A`; break; }

      // EX
      case 0xEB: mnem=`${adlPrefix}EX DE,HL`; break;
      case 0xE3: mnem=`${adlPrefix}EX (SP),${xyName}`; break;

      // DI/EI/HALT
      case 0xF3: mnem=`${adlPrefix}DI`; break;
      case 0xFB: mnem=`${adlPrefix}EI`; break;
      case 0x76: mnem=`${adlPrefix}HALT`; break;

      default: {
        // LD r,r  (0x40-0x7F excluding 0x76 HALT)
        if (b >= 0x40 && b <= 0x7F) {
          const dst = (b >> 3) & 7;
          const src = b & 7;
          let dstN, srcN;
          let dstRawD = 0, srcRawD = 0;

          // With IX/IY prefix: H/L -> xyHi/xyLo, (HL) -> (XY+d)
          if (xyPrefix && src === 6) { srcRawD = nextByte(); const d=s8(srcRawD); checkIYdisp(srcRawD); srcN=`(${xyName}${d>=0?'+':''}${d})`; }
          else if (xyPrefix && src === 4) srcN = xyHi;
          else if (xyPrefix && src === 5) srcN = xyLo;
          else srcN = R8[src];

          if (xyPrefix && dst === 6) { dstRawD = nextByte(); const d=s8(dstRawD); checkIYdisp(dstRawD); dstN=`(${xyName}${d>=0?'+':''}${d})`; }
          else if (xyPrefix && dst === 4) dstN = xyHi;
          else if (xyPrefix && dst === 5) dstN = xyLo;
          else dstN = R8[dst];

          mnem = `${adlPrefix}LD ${dstN},${srcN}`;
        } else {
          mnem = `${adlPrefix}??? 0x${hexB(b)}`;
        }
      }
    }
  }

  const hexStr = rawBytes.map(hexB).join(' ');
  return { addr: startAddr, len: offset - startAddr, hexStr, mnem, flags };
}

// ─── Disassemble a range ──────────────────────────────────────────────────────
function disassembleRange(startAddr, endAddr) {
  const insns = [];
  let addr = startAddr;
  while (addr < endAddr) {
    const insn = disassembleOne(addr);
    insns.push(insn);
    addr += insn.len;
    if (insn.len === 0) { addr++; break; }  // safety
  }
  return insns;
}

// ─── Print helpers ────────────────────────────────────────────────────────────
function printInsns(insns) {
  for (const insn of insns) {
    const hexPad = insn.hexStr.padEnd(26);
    let line = `${hexA(insn.addr)}  ${hexPad}  ${insn.mnem}`;
    if (insn.flags.length > 0) {
      line += `   ; ${insn.flags.join(' | ')}`;
    }
    console.log(line);
  }
}

function collectInteresting(insns) {
  const found = [];
  for (const insn of insns) {
    if (insn.flags.length > 0) {
      found.push({ addr: hexA(insn.addr), mnem: insn.mnem, flags: insn.flags });
    }
  }
  return found;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('probe-phase503-trace-0600D9: Static disassembly around 0x096B65 callers');
console.log('='.repeat(80));
console.log('');

// Region 1: 0x0600A0 to 0x060140 (wide window around 0x0600D9)
console.log('─'.repeat(80));
console.log('REGION 1: 0x0600A0 – 0x060140  (main editor loop, contains 0x0600D9)');
console.log('─'.repeat(80));
const r1 = disassembleRange(0x0600A0, 0x060140);
printInsns(r1);
console.log('');

// Region 2: 0x0615E0 to 0x061614 (contains 0x0615F6)
console.log('─'.repeat(80));
console.log('REGION 2: 0x0615E0 – 0x061614  (contains caller 0x0615F6)');
console.log('─'.repeat(80));
const r2 = disassembleRange(0x0615E0, 0x061614);
printInsns(r2);
console.log('');

// Region 3: 0x061604 to 0x061640 (contains 0x06161A)
console.log('─'.repeat(80));
console.log('REGION 3: 0x061604 – 0x061640  (contains caller 0x06161A)');
console.log('─'.repeat(80));
const r3 = disassembleRange(0x061604, 0x061640);
printInsns(r3);
console.log('');

// Region 4: 0x061665 to 0x0616A2 (contains 0x06167D)
console.log('─'.repeat(80));
console.log('REGION 4: 0x061665 – 0x0616A2  (contains caller 0x06167D)');
console.log('─'.repeat(80));
const r4 = disassembleRange(0x061665, 0x0616A2);
printInsns(r4);
console.log('');

// Summary
console.log('='.repeat(80));
console.log('SUMMARY: Interesting instructions per region');
console.log('='.repeat(80));

const regions = [
  { name: 'REGION 1 (0x0600A0–0x060140, caller 0x0600D9)', insns: r1 },
  { name: 'REGION 2 (0x0615E0–0x061614, caller 0x0615F6)', insns: r2 },
  { name: 'REGION 3 (0x061604–0x061640, caller 0x06161A)', insns: r3 },
  { name: 'REGION 4 (0x061665–0x0616A2, caller 0x06167D)', insns: r4 },
];

for (const region of regions) {
  const interesting = collectInteresting(region.insns);
  console.log('');
  console.log(`  ${region.name}`);
  if (interesting.length === 0) {
    console.log('    (no flagged instructions)');
  } else {
    for (const item of interesting) {
      console.log(`    ${item.addr}  ${item.mnem}`);
      for (const f of item.flags) {
        console.log(`      -> ${f}`);
      }
    }
  }
}

console.log('');
console.log('Done.');
