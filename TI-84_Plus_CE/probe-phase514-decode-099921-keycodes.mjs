/**
 * probe-phase514-decode-099921-keycodes.mjs
 * Static disassembly of the OS event loop command dispatcher at 0x099921.
 * Pure ROM byte reading -- no CPU execution.
 */
import { readFileSync } from 'fs';
const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const keyMatrix = {
  7: ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  6: ['ENTER', '+', '-', 'MUL', 'DIV', '^', 'CLEAR', null],
  5: ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  4: ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  3: ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'XTnT'],
  2: ['(grp2b0)', 'STO', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  1: ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
};

function scanCodeToKey(sc) {
  if (sc === 0) return 'NO_KEY';
  const idx = sc - 1;
  const group = 6 - Math.floor(idx / 8);
  const bit = idx % 8;
  if (group < 1 || group > 7) return 'UNKNOWN(g' + group + 'b' + bit + ')';
  const name = keyMatrix[group] && keyMatrix[group][bit];
  return name ? name + '(G' + group + 'B' + bit + ')' : 'UNK(G' + group + 'B' + bit + ')';
}

function keyName(code) {
  if (code >= 0x01 && code <= 0x38) return scanCodeToKey(code);
  const ext = {
    0x39:'CATALOG', 0x3B:'FORMAT(2nd+ZOOM)', 0x3C:'TABLE(2nd+GRAPH)',
    0x3E:'TABLESET(2nd+WIN)', 0x3F:'CALC(2nd+TRACE)', 0x40:'QUIT(2nd+MODE)',
    0x41:'LINK(2nd+XTnT)', 0x42:'LIST(2nd+STAT)', 0x43:'TEST(2nd+MATH)',
    0x44:'ANGLE(2nd+APPS)', 0x45:'DRAW(2nd+PRGM)', 0x46:'DISTR(2nd+VARS)',
    0x47:'MATRIX(2nd+x^-1)', 0x48:'FINANCE(2nd+STO)',
    0x64:'STATPLOT(2nd+Y=)', 0x65:'EE(2nd+,)', 0x66:'ANS(2nd+(-))',
    0x69:'INS(2nd+DEL)', 0x6A:'RECALL', 0x6B:'LINK2', 0x6C:'MEM_MGMT',
    0x6D:'CATALOG2', 0x6E:'CUSTOM', 0x6F:'ASM_PGM', 0x70:'ARCHIVE',
    0x71:'i_IMAG', 0x72:'SOLVE', 0x73:'SIMUL_EQ', 0x7E:'MATRIX_ED',
    0x82:'GRAPH_STYLE', 0x84:'FUNC_TYPE', 0x94:'DRAW_CMD', 0x96:'STRING_ED',
    0xAA:'OFF(2nd+ON)', 0xAE:'DIAG', 0xB0:'TOKEN_SEL', 0xBB:'ANGLE_CMD',
    0xCE:'ALPHA_UPPER', 0xE6:'RESET', 0xEB:'ABOUT', 0xEF:'SELF_TEST',
    0xF2:'LANGUAGE', 0xFC:'OS_UPDATE', 0xFF:'TEST_MODE',
  };
  return ext[code] || 'EXT_0x' + code.toString(16).toUpperCase();
}

function read24(addr) { return rom[addr] | (rom[addr+1] << 8) | (rom[addr+2] << 16); }
function hA(a) { return '0x' + a.toString(16).padStart(6, '0'); }
function hB(b) { return '0x' + b.toString(16).padStart(2, '0'); }

function dis(pc) {
  const b = rom[pc];
  if (b===0xC9) return {len:1,text:'RET',type:'ret'};
  if (b===0xC8) return {len:1,text:'RET Z',type:'ret_z'};
  if (b===0xC0) return {len:1,text:'RET NZ',type:'ret_nz'};
  if (b===0xD0) return {len:1,text:'RET NC',type:'ret_nc'};
  if (b===0xD8) return {len:1,text:'RET C',type:'ret_c'};
  if (b===0xFE) {const n=rom[pc+1]; return {len:2,text:'CP '+hB(n),type:'cp',value:n};}
  if (b===0xCA) {const a=read24(pc+1); return {len:4,text:'JP Z,'+hA(a),type:'jp_z',target:a};}
  if (b===0xC2) {const a=read24(pc+1); return {len:4,text:'JP NZ,'+hA(a),type:'jp_nz',target:a};}
  if (b===0xDA) {const a=read24(pc+1); return {len:4,text:'JP C,'+hA(a),type:'jp_c',target:a};}
  if (b===0xD2) {const a=read24(pc+1); return {len:4,text:'JP NC,'+hA(a),type:'jp_nc',target:a};}
  if (b===0xC3) {const a=read24(pc+1); return {len:4,text:'JP '+hA(a),type:'jp',target:a};}
  if (b===0xCD) {const a=read24(pc+1); return {len:4,text:'CALL '+hA(a),type:'call',target:a};}
  if (b===0xCC) {const a=read24(pc+1); return {len:4,text:'CALL Z,'+hA(a),type:'call_z',target:a};}
  if (b===0xC4) {const a=read24(pc+1); return {len:4,text:'CALL NZ,'+hA(a),type:'call_nz',target:a};}
  if (b===0xDC) {const a=read24(pc+1); return {len:4,text:'CALL C,'+hA(a),type:'call_c',target:a};}
  if (b===0xD4) {const a=read24(pc+1); return {len:4,text:'CALL NC,'+hA(a),type:'call_nc',target:a};}
  if (b===0x18) {const d=rom[pc+1]; const o=d<128?d:d-256; return {len:2,text:'JR '+hA(pc+2+o),type:'jr',target:pc+2+o};}
  if (b===0x28) {const d=rom[pc+1]; const o=d<128?d:d-256; return {len:2,text:'JR Z,'+hA(pc+2+o),type:'jr_z',target:pc+2+o};}
  if (b===0x20) {const d=rom[pc+1]; const o=d<128?d:d-256; return {len:2,text:'JR NZ,'+hA(pc+2+o),type:'jr_nz',target:pc+2+o};}
  if (b===0x38) {const d=rom[pc+1]; const o=d<128?d:d-256; return {len:2,text:'JR C,'+hA(pc+2+o),type:'jr_c',target:pc+2+o};}
  if (b===0x30) {const d=rom[pc+1]; const o=d<128?d:d-256; return {len:2,text:'JR NC,'+hA(pc+2+o),type:'jr_nc',target:pc+2+o};}
  if (b===0x3A) {const a=read24(pc+1); return {len:4,text:'LD A,('+hA(a)+')',type:'ld_a_nn',target:a};}
  if (b===0x3E) {const n=rom[pc+1]; return {len:2,text:'LD A,'+hB(n),type:'ld_a_n',value:n};}
  if (b===0x21) {const a=read24(pc+1); return {len:4,text:'LD HL,'+hA(a),type:'ld_hl'};}
  if (b===0x01) {const a=read24(pc+1); return {len:4,text:'LD BC,'+hA(a),type:'ld_bc'};}
  if (b===0x11) {const a=read24(pc+1); return {len:4,text:'LD DE,'+hA(a),type:'ld_de'};}
  if (b===0x22) {const a=read24(pc+1); return {len:4,text:'LD ('+hA(a)+'),HL',type:'ld_nn_hl'};}
  if (b===0x2A) {const a=read24(pc+1); return {len:4,text:'LD HL,('+hA(a)+')',type:'ld_hl_nn'};}
  if (b===0x32) {const a=read24(pc+1); return {len:4,text:'LD ('+hA(a)+'),A',type:'ld_nn_a'};}
  if (b===0xE6) {const n=rom[pc+1]; return {len:2,text:'AND '+hB(n),type:'and'};}
  if (b===0xC6) {const n=rom[pc+1]; return {len:2,text:'ADD A,'+hB(n),type:'add'};}
  if (b===0xD6) {const n=rom[pc+1]; return {len:2,text:'SUB '+hB(n),type:'sub'};}
  if (b===0xB7) return {len:1,text:'OR A',type:'or_a'};
  if (b===0xAF) return {len:1,text:'XOR A',type:'xor_a'};
  if (b===0xC1) return {len:1,text:'POP BC',type:'pop'};
  if (b===0xC5) return {len:1,text:'PUSH BC',type:'push'};
  if (b===0xF5) return {len:1,text:'PUSH AF',type:'push'};
  if (b===0xF1) return {len:1,text:'POP AF',type:'pop'};
  if (b===0xE5) return {len:1,text:'PUSH HL',type:'push'};
  if (b===0x23) return {len:1,text:'INC HL',type:'inc_hl'};
  if (b===0x2B) return {len:1,text:'DEC HL',type:'dec_hl'};
  if (b===0x0B) return {len:1,text:'DEC BC',type:'dec_bc'};
  if (b===0x19) return {len:1,text:'ADD HL,DE',type:'add_hl'};
  if (b===0x09) return {len:1,text:'ADD HL,BC',type:'add_hl'};
  if (b===0xEB) return {len:1,text:'EX DE,HL',type:'ex'};
  if (b===0x5E) return {len:1,text:'LD E,(HL)',type:'ld'};
  if (b===0x4E) return {len:1,text:'LD C,(HL)',type:'ld'};
  if (b===0x47) return {len:1,text:'LD B,A',type:'ld'};
  if (b===0x4F) return {len:1,text:'LD C,A',type:'ld'};
  if (b===0x78) return {len:1,text:'LD A,B',type:'ld'};
  if (b===0x7E) return {len:1,text:'LD A,(HL)',type:'ld'};
  if (b===0x37) return {len:1,text:'SCF',type:'scf'};
  if (b===0x3F) return {len:1,text:'CCF',type:'ccf'};
  if (b===0x3C) return {len:1,text:'INC A',type:'inc'};
  if (b===0x3D) return {len:1,text:'DEC A',type:'dec'};
  if (b===0x00) return {len:1,text:'NOP',type:'nop'};
  if (b===0x54) return {len:1,text:'LD D,H',type:'ld'};
  if (b===0x5D) return {len:1,text:'LD E,L',type:'ld'};
  if (b===0x40) return {len:1,text:'LD B,B',type:'ld'};
  if (b===0xED) {
    const b2=rom[pc+1];
    if (b2===0x42) return {len:2,text:'SBC HL,BC',type:'sbc_hl'};
    if (b2===0x4B) {const a=read24(pc+2); return {len:5,text:'LD BC,('+hA(a)+')',type:'ld_bc_nn'};}
    if (b2===0x53) {const a=read24(pc+2); return {len:5,text:'LD ('+hA(a)+'),DE',type:'ld_nn_de'};}
    return {len:2,text:'DB ED '+hB(b2),type:'unknown'};
  }
  if (b===0xFD) {
    const b2=rom[pc+1];
    if (b2===0xCB) {
      const dp=rom[pc+2]; const op=rom[pc+3];
      const hi=(op>>6)&3; const bit=(op>>3)&7; const lo=op&7;
      if (lo===6) {
        const nm=hi===1?'BIT':hi===3?'SET':hi===2?'RES':'???';
        return {len:4,text:nm+' '+bit+',(IY+'+hB(dp)+')',type:'iy_bit'};
      }
      return {len:4,text:'DB FD CB '+hB(dp)+' '+hB(op),type:'unknown'};
    }
    return {len:2,text:'DB FD '+hB(b2),type:'unknown'};
  }
  if (b===0xCB) {
    const op=rom[pc+1];
    const hi=(op>>6)&3; const bit=(op>>3)&7; const lo=op&7;
    const rn=['B','C','D','E','H','L','(HL)','A'];
    const nm=hi===1?'BIT':hi===3?'SET':hi===2?'RES':'ROT';
    return {len:2,text:nm+' '+bit+','+rn[lo],type:'cb_bit'};
  }
  return {len:1,text:'DB '+hB(b),type:'unknown'};
}

function annot(addr) {
  if (addr >= rom.length || addr < 0) return '(out of ROM)';
  const bytes = [];
  for (let i=0; i<12 && (addr+i)<rom.length; i++) bytes.push(rom[addr+i].toString(16).padStart(2,'0'));
  let p=addr; const instrs=[];
  for (let i=0; i<3 && (p-addr)<12; i++) { if(p>=rom.length) break; const d=dis(p); instrs.push(d.text); p+=d.len; }
  return '['+bytes.join(' ')+'] '+instrs.join('; ');
}

// === MAIN ===
console.log('=== 0x099921 OS Event Loop Command Dispatcher ===');
console.log('=== Full disassembly ===\n');

const SA = 0x099921;
let pc = SA;
while (pc < SA + 400) {
  const d = dis(pc);
  console.log(hA(pc) + ': ' + d.text);
  if (d.type === 'jp' && pc > SA + 320) break;
  pc += d.len;
}

console.log('\n\n=== KEY CODE DISPATCH TABLE ===\n');
pc = 0x099961;
const table = [];
let curCp = null;

while (pc < 0x099a80) {
  if (pc >= rom.length) break;
  const d = dis(pc);
  if (d.type === 'cp') { curCp = d.value; }
  else if (curCp !== null) {
    const isEq = d.type==='jp_z'||d.type==='call_z'||d.type==='jr_z';
    const isLt = d.type==='jp_c'||d.type==='jr_c';
    if (isEq) table.push({code:curCp, hex:hB(curCp), key:keyName(curCp), cond:'==', handler:hA(d.target), ann:annot(d.target)});
    if (isLt) table.push({code:curCp, hex:hB(curCp), key:'< '+keyName(curCp), cond:'<', handler:hA(d.target), ann:annot(d.target)});
    if (isEq||isLt||d.type==='jp_nz'||d.type==='jr_nz'||d.type==='jp_nc'||d.type==='jr_nc') curCp=null;
  }
  if (d.type==='jp' && pc>0x099a60) break;
  pc += d.len;
}

console.log('Code  Hex    Cond  Key Name                     Handler');
console.log('----  -----  ----  ---------------------------  ---------');
for (const e of table) {
  console.log(String(e.code).padStart(4)+'  '+e.hex.padEnd(7)+e.cond.padEnd(4)+'  '+e.key.substring(0,29).padEnd(29)+e.handler);
}
console.log('\nTotal entries: '+table.length);

console.log('\n\n=== EXACT KEY HANDLERS (==) ===\n');
const exact = table.filter(e=>e.cond==='==');
for (const e of exact) {
  console.log(String(e.code).padStart(4)+'  '+e.hex.padEnd(7)+e.key.substring(0,29).padEnd(29)+e.handler+'  '+e.ann);
}
console.log('\nTotal exact: '+exact.length);

console.log('\n\n=== RANGE HANDLERS (<) ===\n');
const ranges = table.filter(e=>e.cond==='<');
for (const e of ranges) {
  console.log(e.hex+'  < '+e.key.substring(2).padEnd(29)+'  '+e.handler+'  '+e.ann);
}

console.log('\n=== CASCADE STRUCTURE ===');
console.log('Cascade: 0x099961 to ~'+hA(pc)+' ('+( pc-0x099961)+' bytes)');
console.log('\n=== PROBE COMPLETE ===');