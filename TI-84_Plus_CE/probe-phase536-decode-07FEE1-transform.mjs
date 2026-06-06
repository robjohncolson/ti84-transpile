import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x07fee1;
const READ_LEN = 0x80;

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function readU16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function readU24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function bytesHex(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function ramName(addr) {
  const names = new Map([
    [0xd005f8, 'OP1 type'],
    [0xd005f9, 'OP1 data'],
    [0xd00603, 'OP2'],
    [0xd0060e, 'OP3'],
    [0xd00619, 'OP4'],
    [0xd00624, 'OP5'],
  ]);
  if (names.has(addr)) return names.get(addr);
  if (addr >= 0xd005f8 && addr <= 0xd00602) return `OP1+${hex(addr - 0xd005f8)}`;
  if (addr >= 0xd00603 && addr <= 0xd0060d) return `OP2+${hex(addr - 0xd00603)}`;
  if (addr >= 0xd0060e && addr <= 0xd00618) return `OP3+${hex(addr - 0xd0060e)}`;
  if (addr >= 0xd00619 && addr <= 0xd00623) return `OP4+${hex(addr - 0xd00619)}`;
  if (addr >= 0xd00624 && addr <= 0xd0062e) return `OP5+${hex(addr - 0xd00624)}`;
  if (addr >= 0xd00000 && addr <= 0xd3ffff) return 'RAM';
  return null;
}

function annotateAbs(addr) {
  const name = ramName(addr);
  return name ? ` ; ${name}` : '';
}

function ixiyRegName(base, code, disp = null) {
  if (code === 4) return `${base}H`;
  if (code === 5) return `${base}L`;
  if (code === 6) {
    if (disp === null) return `(${base})`;
    const d = signed8(disp);
    return `(${base}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
  }
  return r[code];
}

function decodeCB(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return `${rot[y]} ${r[z]}`;
  if (x === 1) return `BIT ${y},${r[z]}`;
  if (x === 2) return `RES ${y},${r[z]}`;
  return `SET ${y},${r[z]}`;
}

function decodeED(buf, off) {
  const op = buf[off + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  let size = 2;
  let text = `ED ${hex(op)}`;
  let note = '';

  if (x === 1) {
    if (z === 0) text = y === 6 ? 'IN (C)' : `IN ${r[y]},(C)`;
    else if (z === 1) text = y === 6 ? 'OUT (C),0' : `OUT (C),${r[y]}`;
    else if (z === 2) text = q ? `ADC HL,${rp[p]}` : `SBC HL,${rp[p]}`;
    else if (z === 3) {
      const addr = readU24(buf, off + 2);
      size = 5;
      text = q ? `LD ${rp[p]},(${hex(addr, 6)})` : `LD (${hex(addr, 6)}),${rp[p]}`;
      note = annotateAbs(addr);
    } else if (z === 4) text = 'NEG';
    else if (z === 5) text = y === 1 ? 'RETI' : 'RETN';
    else if (z === 6) text = ['IM 0', 'IM 0', 'IM 1', 'IM 2', 'IM 0', 'IM 0', 'IM 1', 'IM 2'][y];
    else if (z === 7) text = ['LD I,A', 'LD R,A', 'LD A,I', 'LD A,R', 'RRD', 'RLD', 'NOP', 'NOP'][y];
  } else if (x === 2 && z <= 3 && y >= 4) {
    text = [
      ['LDI', 'CPI', 'INI', 'OUTI'],
      ['LDD', 'CPD', 'IND', 'OUTD'],
      ['LDIR', 'CPIR', 'INIR', 'OTIR'],
      ['LDDR', 'CPDR', 'INDR', 'OTDR'],
    ][y - 4][z];
  }

  return { size, text, note };
}

function decodeIndexed(buf, off, base) {
  const op = buf[off + 1];
  if (op === 0xcb) {
    const disp = buf[off + 2];
    const cb = buf[off + 3];
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const mem = ixiyRegName(base, 6, disp);
    const target = z === 6 ? mem : `${mem},${r[z]}`;
    const text = x === 0 ? `${rot[y]} ${target}` : x === 1 ? `BIT ${y},${target}` : x === 2 ? `RES ${y},${target}` : `SET ${y},${target}`;
    return { size: 4, text, note: '' };
  }

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const rr = ['BC', 'DE', base, 'SP'];
  const rr2 = ['BC', 'DE', base, 'AF'];
  const regY = ixiyRegName(base, y);
  const regZ = ixiyRegName(base, z);
  let size = 2;
  let text = `${base} prefix ${hex(op)}`;
  let note = '';

  if (x === 0) {
    if (z === 1) {
      if (q === 0) {
        const imm = readU24(buf, off + 2);
        size = 5;
        text = `LD ${rr[p]},${hex(imm, 6)}`;
      } else {
        text = `ADD ${base},${rr[p]}`;
      }
    } else if (z === 4) text = `INC ${regY}`;
    else if (z === 5) text = `DEC ${regY}`;
    else if (z === 6) {
      const imm = buf[off + 2];
      size = 3;
      text = `LD ${regY},${hex(imm)}`;
    } else if (op === 0x09) text = `ADD ${base},BC`;
    else if (op === 0x19) text = `ADD ${base},DE`;
    else if (op === 0x29) text = `ADD ${base},${base}`;
    else if (op === 0x39) text = `ADD ${base},SP`;
    else if (op === 0x22 || op === 0x2a) {
      const addr = readU24(buf, off + 2);
      size = 5;
      text = op === 0x22 ? `LD (${hex(addr, 6)}),${base}` : `LD ${base},(${hex(addr, 6)})`;
      note = annotateAbs(addr);
    } else if (op === 0x23) text = `INC ${base}`;
    else if (op === 0x2b) text = `DEC ${base}`;
    else if (op === 0x34 || op === 0x35) {
      const disp = buf[off + 2];
      size = 3;
      text = `${op === 0x34 ? 'INC' : 'DEC'} ${ixiyRegName(base, 6, disp)}`;
    } else if (op === 0x36) {
      const disp = buf[off + 2];
      const imm = buf[off + 3];
      size = 4;
      text = `LD ${ixiyRegName(base, 6, disp)},${hex(imm)}`;
    } else if (op === 0xe9) text = `JP (${base})`;
  } else if (x === 1) {
    if (op === 0x76) text = 'HALT';
    else {
      let extra = 0;
      let dst = regY;
      let src = regZ;
      if (y === 6) dst = ixiyRegName(base, 6, buf[off + 2]), extra = 1;
      if (z === 6) src = ixiyRegName(base, 6, buf[off + 2]), extra = 1;
      size = 2 + extra;
      text = `LD ${dst},${src}`;
    }
  } else if (x === 2) {
    let extra = 0;
    let operand = regZ;
    if (z === 6) operand = ixiyRegName(base, 6, buf[off + 2]), extra = 1;
    size = 2 + extra;
    text = `${alu[y]} ${operand}`;
  } else {
    if (z === 1 && q === 0) text = `POP ${rr2[p]}`;
    else if (z === 1 && q === 1) {
      if (p === 2) text = `JP (${base})`;
      else if (p === 3) text = `LD SP,${base}`;
    } else if (z === 5 && q === 0) text = `PUSH ${rr2[p]}`;
  }

  return { size, text, note };
}

function decodeOne(buf, off, pc) {
  const op = buf[off];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  let size = 1;
  let text = `DB ${hex(op)}`;
  let note = '';
  let boundary = false;

  if (op === 0xcb) return { size: 2, text: decodeCB(buf[off + 1]), note, boundary };
  if (op === 0xed) return { ...decodeED(buf, off), boundary };
  if (op === 0xdd) return { ...decodeIndexed(buf, off, 'IX'), boundary };
  if (op === 0xfd) return { ...decodeIndexed(buf, off, 'IY'), boundary };

  if (x === 0) {
    if (z === 0) {
      if (y === 0) text = 'NOP';
      else if (y === 1) text = "EX AF,AF'";
      else if (y === 2) {
        const dest = pc + 2 + signed8(buf[off + 1]);
        size = 2;
        text = `DJNZ ${hex(dest, 6)}`;
      } else if (y === 3) {
        const dest = pc + 2 + signed8(buf[off + 1]);
        size = 2;
        text = `JR ${hex(dest, 6)}`;
      } else {
        const dest = pc + 2 + signed8(buf[off + 1]);
        size = 2;
        text = `JR ${cc[y - 4]},${hex(dest, 6)}`;
      }
    } else if (z === 1) {
      if (q === 0) {
        const imm = readU24(buf, off + 1);
        size = 4;
        text = `LD ${rp[p]},${hex(imm, 6)}`;
      } else {
        text = `ADD HL,${rp[p]}`;
      }
    } else if (z === 2) {
      if (q === 0) text = [`LD (BC),A`, `LD (DE),A`, null, null][p] ?? `LD (${hex(readU24(buf, off + 1), 6)}),HL`;
      else text = [`LD A,(BC)`, `LD A,(DE)`, null, null][p] ?? `LD HL,(${hex(readU24(buf, off + 1), 6)})`;
      if (p >= 2) {
        const addr = readU24(buf, off + 1);
        size = 4;
        note = annotateAbs(addr);
      }
    } else if (z === 3) text = `${q ? 'DEC' : 'INC'} ${rp[p]}`;
    else if (z === 4) text = `INC ${r[y]}`;
    else if (z === 5) text = `DEC ${r[y]}`;
    else if (z === 6) {
      size = 2;
      text = `LD ${r[y]},${hex(buf[off + 1])}`;
    } else if (z === 7) text = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y];
  } else if (x === 1) {
    text = op === 0x76 ? 'HALT' : `LD ${r[y]},${r[z]}`;
  } else if (x === 2) {
    text = `${alu[y]} ${r[z]}`;
  } else {
    if (z === 0) {
      text = `RET ${cc[y]}`;
    } else if (z === 1) {
      text = q === 0 ? `POP ${rp2[p]}` : ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p];
      if (q === 1 && p === 0) boundary = true;
    } else if (z === 2) {
      const addr = readU24(buf, off + 1);
      size = 4;
      text = `JP ${cc[y]},${hex(addr, 6)}`;
      note = annotateAbs(addr);
    } else if (z === 3) {
      if (y === 0) {
        const addr = readU24(buf, off + 1);
        size = 4;
        text = `JP ${hex(addr, 6)}`;
        note = annotateAbs(addr);
        boundary = true;
      } else if (y === 2) {
        size = 2;
        text = `OUT (${hex(buf[off + 1])}),A`;
      } else if (y === 3) {
        size = 2;
        text = `IN A,(${hex(buf[off + 1])})`;
      } else if (y === 4) text = 'EX (SP),HL';
      else if (y === 5) text = 'EX DE,HL';
      else if (y === 6) text = 'DI';
      else if (y === 7) text = 'EI';
    } else if (z === 4) {
      const addr = readU24(buf, off + 1);
      size = 4;
      text = `CALL ${cc[y]},${hex(addr, 6)}`;
      note = ' ; call target';
    } else if (z === 5) {
      if (q === 0) text = `PUSH ${rp2[p]}`;
      else if (p === 0) {
        const addr = readU24(buf, off + 1);
        size = 4;
        text = `CALL ${hex(addr, 6)}`;
        note = ' ; call target';
      }
    } else if (z === 6) {
      size = 2;
      text = `${alu[y]} ${hex(buf[off + 1])}`;
    } else if (z === 7) text = `RST ${hex(y * 8)}`;
  }

  if (op === 0x3a || op === 0x32) {
    const addr = readU24(buf, off + 1);
    size = 4;
    text = op === 0x3a ? `LD A,(${hex(addr, 6)})` : `LD (${hex(addr, 6)}),A`;
    note = annotateAbs(addr);
  }

  return { size, text, note, boundary };
}

const rom = fs.readFileSync(ROM_PATH);
const chunk = rom.subarray(START, START + READ_LEN);

console.log('Phase 536 decode probe: transform step at 0x07FEE1');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${hex(START, 6)}..${hex(START + chunk.length - 1, 6)} (${chunk.length} bytes)`);
console.log('');

let off = 0;
while (off < chunk.length) {
  const pc = START + off;
  const inst = decodeOne(chunk, off, pc);
  const bytes = [...chunk.subarray(off, off + inst.size)];
  console.log(`${hex(pc, 6)}  ${bytesHex(bytes).padEnd(15)}  ${inst.text}${inst.note}`);
  off += inst.size;
  if (inst.boundary) {
    console.log(`; Function boundary candidate at ${hex(pc, 6)} (${inst.text})`);
    break;
  }
}

console.log('');
console.log('Legend: RAM/OP annotations are inferred from absolute addresses in the decoded instruction stream.');
