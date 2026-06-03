import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// 0x096C03 is the real logic called by the thin wrapper at 0x0935BF.
// Wrapper: CALL 0x096C03, BIT 0,(IY-0x04), RET Z, EX DE,HL, RET
// Caller 0x096BD3: LD A,(HL); CP 0x0E  -- HL = pointer to token data, 0x0E = token type
const FUNC_START = 0x096C03;
const FUNC_MAX = 200;

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd00595, 'cursor row'],
  [0xd00596, 'cursor column'],
  [0xd007e0, 'screen mode'],
  [0xd008d2, 'VRAM pointer D008D2'],
  [0xd008d5, 'VRAM pointer D008D5'],
  [0xd005f8, 'descriptor buffer (9-byte)'],
  [0xd02575, 'cursor type'],
  [0xd02ac0, 'LCD invalidation'],
  [0xd0060e, 'display context'],
  [0xd0007c, 'IY-0x04 (flags byte)'],
  [0xd00091, 'IY+0x11'],
  [0xd00084, 'IY+0x04'],
  [0xd00085, 'IY+0x05'],
  [0xd00086, 'IY+0x06'],
  [0xd00087, 'IY+0x07'],
]);

const r   = ['B','C','D','E','H','L','(HL)','A'];
const rp  = ['BC','DE','HL','SP'];
const rp2 = ['BC','DE','HL','AF'];
const cc  = ['NZ','Z','NC','C','PO','PE','P','M'];
const alu = ['ADD A','ADC A','SUB','SBC A','AND','XOR','OR','CP'];
const rot = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
const im  = ['0','0/1','1','2','0','0/1','1','2'];

let calls  = [];
let jumps  = [];
let jrs    = [];
let rsts   = [];
let ramRefs= [];

function hex(value, width) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}
function b(addr)   { return rom[addr] !== undefined ? rom[addr] : 0; }
function u16(addr) { return b(addr) | (b(addr+1) << 8); }
function u24(addr) { return b(addr) | (b(addr+1) << 8) | (b(addr+2) << 16); }
function s8(v)     { return v & 0x80 ? v - 0x100 : v; }

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr+len), x => x.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

function regName(code, ix) {
  if (!ix) return r[code];
  if (code === 4) return ix + 'H';
  if (code === 5) return ix + 'L';
  if (code === 6) return '(' + ix + '+d)';
  return r[code];
}
function rpName(code, ix) { return (code === 2 && ix) ? ix : rp[code]; }

function noteTarget(kind, from, to, detail) {
  if (detail === undefined) detail = '';
  const rec = { from, to, detail };
  if (kind === 'CALL') calls.push(rec);
  else if (kind === 'JR') jrs.push(rec);
  else jumps.push(rec);
}
function noteRam(from, addr, detail) {
  if (ramNames.has(addr)) ramRefs.push({ from, addr, detail: detail || ramNames.get(addr) });
  else if (addr >= 0xd00000 && addr < 0xe00000) ramRefs.push({ from, addr, detail: detail || 'unknown RAM' });
}
function annotateRam(addr) {
  if (ramNames.has(addr)) return ' ; ' + ramNames.get(addr);
  if (addr >= 0xd00000 && addr < 0xe00000) return ' ; RAM';
  return '';
}
function fixDisp(text, disp) {
  const s = disp < 0 ? '-' : '+';
  return text.replace('(IX+d)', '(IX' + s + hex(Math.abs(disp),2) + ')')
             .replace('(IY+d)', '(IY' + s + hex(Math.abs(disp),2) + ')');
}

function decodeCB(addr, ix) {
  let pos = addr + 1;
  let disp = null;
  if (ix) disp = s8(b(pos++));
  const op = b(pos++);
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  const tgt = (ix && z === 6)
    ? '(' + ix + (disp < 0 ? '-' : '+') + hex(Math.abs(disp),2) + ')'
    : regName(z, null);
  let mn;
  if (x === 0) mn = rot[y] + ' ' + tgt;
  else if (x === 1) mn = 'BIT ' + y + ',' + tgt;
  else if (x === 2) mn = 'RES ' + y + ',' + tgt;
  else mn = 'SET ' + y + ',' + tgt;
  return { mnemonic: mn, nextAddr: pos };
}

function decodeED(addr) {
  const op = b(addr+1);
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;

  // eZ80 extension: ED 27 = LD HL,(HL) 24-bit indirect load
  if (op === 0x27) return { mnemonic: 'LD HL,(HL) ; eZ80 24-bit indirect', nextAddr: addr+2 };

  const hasAddr = [0x43,0x4B,0x53,0x5B,0x63,0x6B,0x73,0x7B];
  const t = {
    0x40:'IN B,(C)',   0x41:'OUT (C),B', 0x42:'SBC HL,BC',
    0x43:'LD ('+hex(u24(addr+2),6)+'),BC',
    0x44:'NEG', 0x45:'RETN', 0x46:'IM '+im[y], 0x47:'LD I,A',
    0x48:'IN C,(C)',   0x49:'OUT (C),C', 0x4A:'ADC HL,BC',
    0x4B:'LD BC,('+hex(u24(addr+2),6)+')',
    0x4C:'NEG', 0x4D:'RETI', 0x4E:'IM '+im[y], 0x4F:'LD R,A',
    0x50:'IN D,(C)',   0x51:'OUT (C),D', 0x52:'SBC HL,DE',
    0x53:'LD ('+hex(u24(addr+2),6)+'),DE',
    0x54:'NEG', 0x55:'RETN', 0x56:'IM '+im[y], 0x57:'LD A,I',
    0x58:'IN E,(C)',   0x59:'OUT (C),E', 0x5A:'ADC HL,DE',
    0x5B:'LD DE,('+hex(u24(addr+2),6)+')',
    0x5C:'NEG', 0x5D:'RETN', 0x5E:'IM '+im[y], 0x5F:'LD A,R',
    0x60:'IN H,(C)',   0x61:'OUT (C),H', 0x62:'SBC HL,HL',
    0x63:'LD ('+hex(u24(addr+2),6)+'),HL',
    0x64:'NEG', 0x65:'RETN', 0x66:'IM '+im[y], 0x67:'RRD',
    0x68:'IN L,(C)',   0x69:'OUT (C),L', 0x6A:'ADC HL,HL',
    0x6B:'LD HL,('+hex(u24(addr+2),6)+')',
    0x6C:'NEG', 0x6D:'RETN', 0x6E:'IM '+im[y], 0x6F:'RLD',
    0x70:'IN (C)',     0x71:'OUT (C),0', 0x72:'SBC HL,SP',
    0x73:'LD ('+hex(u24(addr+2),6)+'),SP',
    0x74:'NEG', 0x75:'RETN', 0x76:'IM '+im[y],
    0x78:'IN A,(C)',   0x79:'OUT (C),A', 0x7A:'ADC HL,SP',
    0x7B:'LD SP,('+hex(u24(addr+2),6)+')',
    0x7C:'NEG', 0x7D:'RETN', 0x7E:'IM '+im[y],
    0xA0:'LDI', 0xA1:'CPI', 0xA2:'INI', 0xA3:'OUTI',
    0xA8:'LDD', 0xA9:'CPD', 0xAA:'IND', 0xAB:'OUTD',
    0xB0:'LDIR',0xB1:'CPIR',0xB2:'INIR',0xB3:'OTIR',
    0xB8:'LDDR',0xB9:'CPDR',0xBA:'INDR',0xBB:'OTDR',
  };
  if (hasAddr.includes(op)) {
    const a24 = u24(addr+2);
    noteRam(addr, a24, t[op]);
    return { mnemonic: t[op] + annotateRam(a24), nextAddr: addr+5 };
  }
  if (t[op]) return { mnemonic: t[op], nextAddr: addr+2 };
  return { mnemonic: 'ED '+hex(op,2)+' ; ez80 ext (x='+x+',y='+y+',z='+z+')', nextAddr: addr+2 };
}

function decodeBase(addr, modePrefix, ix, addrIs16) {
  if (modePrefix === undefined) modePrefix = '';
  if (ix === undefined) ix = '';
  if (addrIs16 === undefined) addrIs16 = false;

  const op = b(addr);
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  const p = y >> 1, q = y & 1;

  if (op === 0xCB) return decodeCB(addr, ix);
  if (op === 0xED && !ix) return decodeED(addr);
  if (op === 0xDD || op === 0xFD) {
    const d = decodeBase(addr+1, modePrefix, op === 0xDD ? 'IX' : 'IY', addrIs16);
    return { mnemonic: d.mnemonic, nextAddr: d.nextAddr };
  }
  if (op === 0x40 || op === 0x49 || op === 0x52 || op === 0x5B) {
    const names = { 0x40:'.SIS', 0x49:'.LIS', 0x52:'.SIL', 0x5B:'.LIL' };
    const d = decodeBase(addr+1, '', ix, (op === 0x40 || op === 0x49));
    return { mnemonic: names[op]+' '+d.mnemonic, nextAddr: d.nextAddr };
  }

  const aw = addrIs16 ? 2 : 3;
  const ah = addrIs16 ? 4 : 6;
  function ra(base) { return addrIs16 ? u16(base) : u24(base); }

  let mn, nextAddr = addr+1;

  if (x === 0) {
    if (z === 0) {
      const misc = ['NOP',"EX AF,AF'",'DJNZ','JR','JR NZ','JR Z','JR NC','JR C'];
      if (y === 2) {
        const to = addr+2+s8(b(addr+1));
        mn = 'DJNZ '+hex(to,6); noteTarget('JR',addr,to,'DJNZ'); nextAddr = addr+2;
      } else if (y >= 3) {
        const to = addr+2+s8(b(addr+1));
        mn = misc[y]+' '+hex(to,6); noteTarget('JR',addr,to,misc[y]); nextAddr = addr+2;
      } else mn = misc[y];
    } else if (z === 1) {
      if (q === 0) {
        const v = ra(addr+1);
        mn = 'LD '+rpName(p,ix)+','+hex(v,ah); nextAddr = addr+1+aw;
      } else mn = 'ADD '+(ix||'HL')+','+rpName(p,ix);
    } else if (z === 2) {
      const nn = ra(addr+1);
      const m = [
        'LD (BC),A','LD A,(BC)','LD (DE),A','LD A,(DE)',
        'LD ('+hex(nn,ah)+'),'+( ix||'HL'),
        'LD '+(ix||'HL')+',('+hex(nn,ah)+')',
        'LD ('+hex(nn,ah)+'),A',
        'LD A,('+hex(nn,ah)+')',
      ];
      mn = m[y];
      if (y >= 4) { nextAddr = addr+1+aw; noteRam(addr,nn,mn); mn += annotateRam(nn); }
    } else if (z === 3) {
      mn = (q?'DEC':'INC')+' '+rpName(p,ix);
    } else if (z === 4) {
      mn = 'INC '+regName(y,ix);
      if (ix && y === 6) { mn = fixDisp(mn,s8(b(addr+1))); nextAddr = addr+2; }
    } else if (z === 5) {
      mn = 'DEC '+regName(y,ix);
      if (ix && y === 6) { mn = fixDisp(mn,s8(b(addr+1))); nextAddr = addr+2; }
    } else if (z === 6) {
      if (ix && y === 6) {
        const d = s8(b(addr+1));
        mn = 'LD ('+ix+(d<0?'-':'+')+hex(Math.abs(d),2)+'),'+hex(b(addr+2),2);
        nextAddr = addr+3;
      } else {
        mn = 'LD '+regName(y,ix)+','+hex(b(addr+1),2); nextAddr = addr+2;
      }
    } else {
      mn = ['RLCA','RRCA','RLA','RRA','DAA','CPL','SCF','CCF'][y];
    }
  } else if (x === 1) {
    if (op === 0x76) {
      mn = 'HALT';
    } else {
      mn = 'LD '+regName(y,ix)+','+regName(z,ix);
      if (ix && (y === 6 || z === 6)) { mn = fixDisp(mn,s8(b(addr+1))); nextAddr = addr+2; }
    }
  } else if (x === 2) {
    mn = alu[y]+' '+regName(z,ix);
    if (ix && z === 6) { mn = fixDisp(mn,s8(b(addr+1))); nextAddr = addr+2; }
  } else {
    if (z === 0) {
      mn = 'RET '+cc[y];
    } else if (z === 1) {
      mn = q === 0
        ? 'POP '+(p===2&&ix?ix:rp2[p])
        : ['RET','EXX','JP ('+(ix||'HL')+')','LD SP,'+(ix||'HL')][p];
    } else if (z === 2) {
      const to = ra(addr+1);
      mn = 'JP '+cc[y]+','+hex(to,ah); noteTarget('JP',addr,to,cc[y]); nextAddr = addr+1+aw;
    } else if (z === 3) {
      if (y === 0) {
        const to = ra(addr+1);
        mn = 'JP '+hex(to,ah); noteTarget('JP',addr,to,''); nextAddr = addr+1+aw;
      } else if (y === 2) { mn = 'OUT ('+hex(b(addr+1),2)+'),A'; nextAddr = addr+2; }
      else if (y === 3)   { mn = 'IN A,('+hex(b(addr+1),2)+')'; nextAddr = addr+2; }
      else {
        const m2 = ['','','','','EX (SP),HL','EX DE,HL','DI','EI'];
        mn = m2[y] || ('opcode '+hex(op,2));
        if (ix && y === 4) mn = 'EX (SP),'+ix;
      }
    } else if (z === 4) {
      const to = ra(addr+1);
      mn = 'CALL '+cc[y]+','+hex(to,ah); noteTarget('CALL',addr,to,cc[y]); nextAddr = addr+1+aw;
    } else if (z === 5) {
      if (q === 0) {
        mn = 'PUSH '+(p===2&&ix?ix:rp2[p]);
      } else if (p === 0) {
        const to = ra(addr+1);
        mn = 'CALL '+hex(to,ah); noteTarget('CALL',addr,to,''); nextAddr = addr+1+aw;
      } else {
        mn = 'opcode '+hex(op,2);
      }
    } else if (z === 6) {
      mn = alu[y]+' '+hex(b(addr+1),2); nextAddr = addr+2;
    } else {
      const ra2 = y * 8;
      if (op === 0xE7) {
        const idx = u16(addr+1);
        const tbl = 0x020104 + idx*4;
        let res = null;
        if (idx < 2178 && tbl+3 < rom.length && b(tbl) === 0xC3) res = u24(tbl+1);
        const rs = res !== null ? ' -> '+hex(res,6) : '';
        mn = 'RST 28h ; BCALL '+hex(idx,4)+rs;
        rsts.push({ from:addr, to:res!==null?res:ra2, detail:'BCALL '+hex(idx,4)+rs });
        nextAddr = addr+3;
      } else {
        mn = 'RST '+hex(ra2,2);
        rsts.push({ from:addr, to:ra2, detail:'' });
      }
    }
  }

  return { mnemonic: mn, nextAddr };
}

function decode(addr) {
  const d = decodeBase(addr);
  return { address:addr, bytes:bytesAt(addr, d.nextAddr-addr), mnemonic:d.mnemonic, nextAddr:d.nextAddr };
}

function printTargets(label, values) {
  console.log('\n' + label + ':');
  if (!values.length) { console.log('  none'); return; }
  for (const item of values) {
    const to = typeof item.to === 'number' ? hex(item.to, item.to>0xffff?6:4) : String(item.to);
    console.log('  '+hex(item.from,6)+' -> '+to+(item.detail?' ('+item.detail+')':''));
  }
}

function disassemble(name, start, maxBytes) {
  calls=[]; jumps=[]; jrs=[]; rsts=[]; ramRefs=[];

  console.log('\n'+'='.repeat(70));
  console.log('Function: '+name);
  console.log('Start: '+hex(start,6)+', max '+maxBytes+' bytes');
  console.log('='.repeat(70));
  console.log('Address  Bytes                  Instruction');
  console.log('-------  --------------------   -----------');

  let addr = start, count = 0, terminatedBy = 'max bytes reached';

  while (addr < start + maxBytes) {
    const inst = decode(addr);
    console.log(hex(inst.address,6)+'  '+inst.bytes.padEnd(20)+'  '+inst.mnemonic);
    count++;
    if (inst.nextAddr <= addr) { console.log('ERROR: stalled at '+hex(addr,6)); break; }

    const op0 = rom[addr];
    if (op0 === 0xC9) { terminatedBy='RET';     addr=inst.nextAddr; break; }
    if (op0 === 0xC3) { terminatedBy='JP nn';   addr=inst.nextAddr; break; }
    if (op0 === 0xE9) { terminatedBy='JP (HL)'; addr=inst.nextAddr; break; }
    addr = inst.nextAddr;
  }

  console.log('\n  Total instructions: '+count);
  console.log('  Bytes decoded: '+(addr-start));
  console.log('  Terminated by: '+terminatedBy);
  printTargets('CALL targets', calls);
  printTargets('JP targets', jumps);
  printTargets('JR targets', jrs);
  printTargets('RST/BCALL targets', rsts);
  console.log('\nKnown RAM references:');
  if (!ramRefs.length) console.log('  none');
  else for (const ref of ramRefs) console.log('  '+hex(ref.from,6)+' -> '+hex(ref.addr,6)+' ('+ref.detail+')');

  return { count, bytes: addr-start, terminatedBy };
}

// ============================================================
// Main
// ============================================================

console.log('probe-phase505-decode-096C03');
console.log('Static eZ80 (ADL mode) disassembly of 0x096C03');
console.log('');
console.log('CONTEXT:');
console.log('  0x0935BF (wrapper): CALL 0x096C03, BIT 0,(IY-0x04), RET Z, EX DE,HL, RET');
console.log('  0x096BD3 (caller):  LD A,(HL); CP 0x0E  after CALL 0x0935BF');
console.log('  -> 0x096C03 returns pointer in HL to token data; [HL]=type; 0x0E=type check');
console.log('');
console.log('Raw bytes at 0x096C03 (first 32):');
console.log(' ', bytesAt(FUNC_START, 32));
console.log('');

const result = disassemble('0x096C03 -- token pointer resolver', FUNC_START, FUNC_MAX);

console.log('\n'+'='.repeat(70));
console.log('ANALYSIS SUMMARY');
console.log('='.repeat(70));
console.log('');
console.log('0x096C03 is the real token-data resolver behind thin wrapper 0x0935BF.');
console.log('Wrapper: CALL 0x096C03 -> BIT 0,(IY-0x04=D0007C) -> RET Z -> EX DE,HL -> RET');
console.log('  D0007C bit0 clear: return HL as-is (normal path).');
console.log('  D0007C bit0 set:   swap DE<->HL, then return.');
console.log('Caller 0x096BD3: LD A,(HL) -> CP 0x0E');
console.log('  HL = pointer to token descriptor; [HL] = token type byte; 0x0E = type check.');
console.log('');
console.log('Decoded '+result.count+' instructions, '+result.bytes+' bytes.');

process.exit(0);
