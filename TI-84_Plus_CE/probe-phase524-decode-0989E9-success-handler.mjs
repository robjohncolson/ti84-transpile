import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const TARGET = 0x0989e9;
const MAIN_LIMIT = 0x180;
const SUB_LIMIT = 0x40;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return hex(value & 0xff, 2);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function readU16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytes(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function bytesText(addr, len) {
  return bytes(addr, len).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function inRom(addr) {
  return addr >= 0 && addr < rom.length;
}

function operandAddr(addr, sis) {
  return sis ? readU16(addr) : readU24(addr);
}

function operandAddrLen(sis) {
  return sis ? 2 : 3;
}

function ixDisp(value) {
  const s = signed8(value);
  return s < 0 ? `${s}` : `+${s}`;
}

function decodeCb(op) {
  const bitOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  if (op < 0x40) return `${bitOps[op >> 3]} ${regs[op & 7]}`;
  if (op < 0x80) return `BIT ${(op - 0x40) >> 3},${regs[op & 7]}`;
  if (op < 0xc0) return `RES ${(op - 0x80) >> 3},${regs[op & 7]}`;
  return `SET ${(op - 0xc0) >> 3},${regs[op & 7]}`;
}

function decodeIndexedCb(prefix, disp, op) {
  const index = prefix === 0xdd ? 'IX' : 'IY';
  if (op >= 0x40 && op < 0x80) return `BIT ${(op - 0x40) >> 3},(${index}${ixDisp(disp)})`;
  if (op >= 0x80 && op < 0xc0) return `RES ${(op - 0x80) >> 3},(${index}${ixDisp(disp)})`;
  if (op >= 0xc0) return `SET ${(op - 0xc0) >> 3},(${index}${ixDisp(disp)})`;
  return `CB ${hex8(op)} (${index}${ixDisp(disp)})`;
}

function decodeAt(pc, options = {}) {
  const start = pc;
  let sis = false;
  let prefix = 0;
  if (rom[pc] === 0x40) {
    sis = true;
    pc += 1;
  }
  if (rom[pc] === 0xdd || rom[pc] === 0xfd) {
    prefix = rom[pc];
    pc += 1;
  }

  const op = rom[pc];
  const index = prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : null;
  const hl = index ?? 'HL';
  const memHl = index ? `(${index})` : '(HL)';
  const addrLen = operandAddrLen(sis);
  const suffix = sis ? ' .SIS' : '';
  const out = (len, text, meta = {}) => ({
    addr: start,
    len,
    bytes: bytesText(start, len),
    text: `${text}${suffix}`,
    meta,
  });

  if (prefix && rom[pc] === 0xcb) {
    const disp = rom[pc + 1];
    const cbOp = rom[pc + 2];
    return out(pc + 3 - start, decodeIndexedCb(prefix, disp, cbOp));
  }

  if (!prefix && op === 0xcb) {
    return out(pc + 2 - start, decodeCb(rom[pc + 1]));
  }

  const reg = ['B', 'C', 'D', 'E', index ? `${index}H` : 'H', index ? `${index}L` : 'L', memHl, 'A'];
  const rp = ['BC', 'DE', hl, 'SP'];
  const rp2 = ['BC', 'DE', hl, 'AF'];

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    return out(pc + 1 - start, `LD ${reg[(op >> 3) & 7]},${reg[op & 7]}`);
  }

  if ((op & 0xc7) === 0x06) return out(pc + 2 - start, `LD ${reg[(op >> 3) & 7]},${hex8(rom[pc + 1])}`);
  if ((op & 0xcf) === 0x01) {
    const val = sis ? readU16(pc + 1) : readU24(pc + 1);
    return out(pc + 1 + addrLen - start, `LD ${rp[(op >> 4) & 3]},${hex(val, sis ? 4 : 6)}`);
  }
  if ((op & 0xcf) === 0x03) return out(pc + 1 - start, `INC ${rp[(op >> 4) & 3]}`);
  if ((op & 0xcf) === 0x0b) return out(pc + 1 - start, `DEC ${rp[(op >> 4) & 3]}`);
  if ((op & 0xc7) === 0x04) return out(pc + 1 - start, `INC ${reg[(op >> 3) & 7]}`);
  if ((op & 0xc7) === 0x05) return out(pc + 1 - start, `DEC ${reg[(op >> 3) & 7]}`);
  if ((op & 0xcf) === 0x09) return out(pc + 1 - start, `ADD ${hl},${rp[(op >> 4) & 3]}`);
  if ((op & 0xcf) === 0xc5) return out(pc + 1 - start, `PUSH ${rp2[(op >> 4) & 3]}`);
  if ((op & 0xcf) === 0xc1) return out(pc + 1 - start, `POP ${rp2[(op >> 4) & 3]}`);

  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  if (op >= 0x80 && op <= 0xbf) return out(pc + 1 - start, `${alu[(op >> 3) & 7]} ${reg[op & 7]}`);
  if ((op & 0xc7) === 0xc6) return out(pc + 2 - start, `${alu[(op >> 3) & 7]} ${hex8(rom[pc + 1])}`);

  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  if ((op & 0xc7) === 0xc0) return out(pc + 1 - start, `RET ${cc[(op >> 3) & 7]}`, { terminal: true });
  if ((op & 0xc7) === 0xc2) {
    const target = operandAddr(pc + 1, sis);
    return out(pc + 1 + addrLen - start, `JP ${cc[(op >> 3) & 7]},${hex(target, sis ? 4 : 6)}`, { jp: target });
  }
  if ((op & 0xc7) === 0xc4) {
    const target = operandAddr(pc + 1, sis);
    return out(pc + 1 + addrLen - start, `CALL ${cc[(op >> 3) & 7]},${hex(target, sis ? 4 : 6)}`, { call: target });
  }

  switch (op) {
    case 0x00: return out(pc + 1 - start, 'NOP');
    case 0x02: return out(pc + 1 - start, 'LD (BC),A');
    case 0x07: return out(pc + 1 - start, 'RLCA');
    case 0x08: return out(pc + 1 - start, 'EX AF,AF\'');
    case 0x0a: return out(pc + 1 - start, 'LD A,(BC)');
    case 0x0f: return out(pc + 1 - start, 'RRCA');
    case 0x10: return out(pc + 2 - start, `DJNZ ${hex(pc + 2 + signed8(rom[pc + 1]))}`);
    case 0x12: return out(pc + 1 - start, 'LD (DE),A');
    case 0x17: return out(pc + 1 - start, 'RLA');
    case 0x18: return out(pc + 2 - start, `JR ${hex(pc + 2 + signed8(rom[pc + 1]))}`, { jr: pc + 2 + signed8(rom[pc + 1]) });
    case 0x1a: return out(pc + 1 - start, 'LD A,(DE)');
    case 0x1f: return out(pc + 1 - start, 'RRA');
    case 0x20: case 0x28: case 0x30: case 0x38:
      return out(pc + 2 - start, `JR ${cc[(op - 0x20) >> 3]},${hex(pc + 2 + signed8(rom[pc + 1]))}`, { jr: pc + 2 + signed8(rom[pc + 1]) });
    case 0x22: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `LD (${hex(target, sis ? 4 : 6)}),${hl}`, { ram: target });
    }
    case 0x27: return out(pc + 1 - start, 'DAA');
    case 0x2a: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `LD ${hl},(${hex(target, sis ? 4 : 6)})`, { ram: target });
    }
    case 0x2f: return out(pc + 1 - start, 'CPL');
    case 0x32: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `LD (${hex(target, sis ? 4 : 6)}),A`, { ram: target });
    }
    case 0x37: return out(pc + 1 - start, 'SCF');
    case 0x3a: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `LD A,(${hex(target, sis ? 4 : 6)})`, { ram: target });
    }
    case 0x3f: return out(pc + 1 - start, 'CCF');
    case 0x76: return out(pc + 1 - start, 'HALT');
    case 0xc3: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `JP ${hex(target, sis ? 4 : 6)}`, { jp: target, terminal: true });
    }
    case 0xc9: return out(pc + 1 - start, 'RET', { terminal: true });
    case 0xcd: {
      const target = operandAddr(pc + 1, sis);
      return out(pc + 1 + addrLen - start, `CALL ${hex(target, sis ? 4 : 6)}`, { call: target });
    }
    case 0xd3: return out(pc + 2 - start, `OUT (${hex8(rom[pc + 1])}),A`);
    case 0xd9: return out(pc + 1 - start, 'EXX');
    case 0xdb: return out(pc + 2 - start, `IN A,(${hex8(rom[pc + 1])})`);
    case 0xe3: return out(pc + 1 - start, `EX (SP),${hl}`);
    case 0xe9: return out(pc + 1 - start, `JP (${hl})`, { terminal: true });
    case 0xeb: return out(pc + 1 - start, 'EX DE,HL');
    case 0xf3: return out(pc + 1 - start, 'DI');
    case 0xf9: return out(pc + 1 - start, `LD SP,${hl}`);
    case 0xfb: return out(pc + 1 - start, 'EI');
    default: {
      if (index && (op === 0x34 || op === 0x35 || op === 0x36 || (op >= 0x46 && op <= 0x7e && (op & 7) === 6) || (op >= 0x70 && op <= 0x77))) {
        const disp = rom[pc + 1];
        if (op === 0x34) return out(pc + 2 - start, `INC (${index}${ixDisp(disp)})`);
        if (op === 0x35) return out(pc + 2 - start, `DEC (${index}${ixDisp(disp)})`);
        if (op === 0x36) return out(pc + 3 - start, `LD (${index}${ixDisp(disp)}),${hex8(rom[pc + 2])}`);
        if ((op & 7) === 6) return out(pc + 2 - start, `LD ${reg[(op >> 3) & 7]},(${index}${ixDisp(disp)})`);
        return out(pc + 2 - start, `LD (${index}${ixDisp(disp)}),${reg[op & 7]}`);
      }
      return out(pc + 1 - start, `DB ${hex8(op)}`);
    }
  }
}

function disassemble(start, limit) {
  const rows = [];
  const calls = new Set();
  const jumps = new Set();
  const ram = new Set();
  let pc = start;
  const end = Math.min(start + limit, rom.length);

  while (pc < end) {
    const inst = decodeAt(pc);
    rows.push(inst);
    if (inst.meta.call !== undefined) calls.add(inst.meta.call);
    if (inst.meta.jp !== undefined) jumps.add(inst.meta.jp);
    if (inst.meta.jr !== undefined) jumps.add(inst.meta.jr);
    if (inst.meta.ram !== undefined) ram.add(inst.meta.ram);
    pc += Math.max(inst.len, 1);
    if (inst.meta.terminal) break;
  }

  return { rows, calls: [...calls], jumps: [...jumps], ram: [...ram], byteCount: pc - start };
}

function printDisassembly(title, start, limit) {
  const dis = disassemble(start, limit);
  console.log(`\n## ${title}`);
  console.log(`start: ${hex(start)}  decoded-bytes: ${dis.byteCount}`);
  console.log('addr      bytes              instruction');
  for (const row of dis.rows) {
    console.log(`${hex(row.addr)}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
  if (dis.calls.length) console.log(`CALL targets: ${dis.calls.map((a) => hex(a)).join(', ')}`);
  if (dis.jumps.length) console.log(`Jump targets: ${dis.jumps.map((a) => hex(a)).join(', ')}`);
  if (dis.ram.length) console.log(`Absolute memory refs: ${dis.ram.map((a) => hex(a)).join(', ')}`);
  return dis;
}

console.log('# Phase 524 Probe: Decode 0x0989E9 Type-Init Success Handler');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Target: ${hex(TARGET)}`);
console.log('\nPurpose summary:');
console.log('- Called immediately after successful type-specific initialization, with IX based on SP and a 15-byte local frame reserved.');
console.log('- This probe decodes the handler body, records stack-frame/local accesses, lists absolute RAM references, and follows direct CALL targets enough to identify helper roles.');
console.log('- The following caller then runs 0x09953F as a conditional test, so state produced here is expected to prepare locals/global flags for that post-init branch.');

console.log(`\nRaw bytes @ ${hex(TARGET)}:`);
console.log(bytesText(TARGET, Math.min(MAIN_LIMIT, rom.length - TARGET)));

const main = printDisassembly('Main function 0x0989E9', TARGET, MAIN_LIMIT);

for (const target of main.calls) {
  if (!inRom(target)) {
    console.log(`\n## CALL target ${hex(target)} is outside this ROM image`);
    continue;
  }
  printDisassembly(`CALL target preview ${hex(target)}`, target, SUB_LIMIT);
}

console.log('\n## Structured summary');
console.log(JSON.stringify({
  target: hex(TARGET),
  decodedBytes: main.byteCount,
  callTargets: main.calls.map((a) => hex(a)),
  jumpTargets: main.jumps.map((a) => hex(a)),
  absoluteMemoryReferences: main.ram.map((a) => hex(a)),
  note: 'Interpret the instruction listing above as the authoritative decode; comments summarize that 0x0989E9 prepares post-success state for the 0x09953F conditional path after type initialization.',
}, null, 2));
