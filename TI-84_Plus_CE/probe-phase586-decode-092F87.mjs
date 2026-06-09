import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const TARGET_A = 0x092F87;
const TARGET_B = 0x092F95;
const MAX_BYTES = 200;

const ramNames = new Map([
  [0xd00080, 'IY base (OS flags)'],
  [0xd005f8, 'descriptor buffer (9-byte search key area)'],
  [0xd005f9, 'search key type byte'],
  [0xd005fa, 'D005FA'],
  [0xd005fb, 'D005FB'],
  [0xd0058c, 'pending key code'],
  [0xd0058e, 'key code'],
  [0xd008f0, 'D008F0'],
  [0xd01d0c, 'D01D0C'],
  [0xd02510, 'expression buffer (65 bytes)'],
  [0xd02590, 'symbol table start'],
  [0xd0259d, 'symbol table pointer'],
  [0xd3ffff, 'symbol table end'],
]);

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const im = ['0', '0/1', '1', '2', '0', '0/1', '1', '2'];

let calls = [];
let jumps = [];
let jrs = [];
let rsts = [];
let ramRefs = [];
let iyRefs = [];

function hex(value, width) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function b(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function regName(code, indexPrefix) {
  if (!indexPrefix) return r[code];
  if (code === 4) return indexPrefix + 'H';
  if (code === 5) return indexPrefix + 'L';
  if (code === 6) return `(${indexPrefix}+d)`;
  return r[code];
}

function rpName(code, indexPrefix) {
  if (code === 2 && indexPrefix) return indexPrefix;
  return rp[code];
}

function noteTarget(kind, from, to, detail = '') {
  const rec = { from, to, detail };
  if (kind === 'CALL') calls.push(rec);
  else if (kind === 'JR') jrs.push(rec);
  else jumps.push(rec);
}

function noteRam(from, addr, detail) {
  if (ramNames.has(addr)) ramRefs.push({ from, addr, detail: detail || ramNames.get(addr) });
  else if (addr >= 0xd00000 && addr < 0xe00000) ramRefs.push({ from, addr, detail: detail || 'unknown RAM' });
}

function noteIY(from, offset, op) {
  iyRefs.push({ from, offset, op });
}

function annotateRam(addr) {
  if (ramNames.has(addr)) return ` ; ${ramNames.get(addr)}`;
  if (addr >= 0xd00000 && addr < 0xe00000) return ' ; RAM';
  return '';
}

function prefixedOperand(text, disp) {
  return text.replace('(IX+d)', `(IX${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`)
    .replace('(IY+d)', `(IY${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`);
}

function decodeCB(addr, indexPrefix) {
  let pos = addr + 1;
  let disp = null;
  if (indexPrefix) disp = s8(b(pos++));
  const op = b(pos++);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = indexPrefix && z === 6 ? `(${indexPrefix}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})` : regName(z, null);
  let mnemonic;
  if (x === 0) mnemonic = `${rot[y]} ${target}`;
  else if (x === 1) mnemonic = `BIT ${y},${target}`;
  else if (x === 2) mnemonic = `RES ${y},${target}`;
  else mnemonic = `SET ${y},${target}`;

  if (indexPrefix === 'IY' && disp !== null) {
    noteIY(addr, disp, mnemonic);
  }

  return { mnemonic, nextAddr: pos };
}

function decodeED(addr) {
  const op = b(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const block = {
    0x40: 'IN B,(C)', 0x41: 'OUT (C),B', 0x42: 'SBC HL,BC', 0x43: `LD (${hex(u24(addr + 2), 6)}),BC`,
    0x44: 'NEG', 0x45: 'RETN', 0x46: `IM ${im[y]}`, 0x47: 'LD I,A',
    0x48: 'IN C,(C)', 0x49: 'OUT (C),C', 0x4A: 'ADC HL,BC', 0x4B: `LD BC,(${hex(u24(addr + 2), 6)})`,
    0x4C: 'NEG', 0x4D: 'RETI', 0x4E: `IM ${im[y]}`, 0x4F: 'LD R,A',
    0x50: 'IN D,(C)', 0x51: 'OUT (C),D', 0x52: 'SBC HL,DE', 0x53: `LD (${hex(u24(addr + 2), 6)}),DE`,
    0x54: 'NEG', 0x55: 'RETN', 0x56: `IM ${im[y]}`, 0x57: 'LD A,I',
    0x58: 'IN E,(C)', 0x59: 'OUT (C),E', 0x5A: 'ADC HL,DE', 0x5B: `LD DE,(${hex(u24(addr + 2), 6)})`,
    0x5C: 'NEG', 0x5D: 'RETN', 0x5E: `IM ${im[y]}`, 0x5F: 'LD A,R',
    0x60: 'IN H,(C)', 0x61: 'OUT (C),H', 0x62: 'SBC HL,HL', 0x63: `LD (${hex(u24(addr + 2), 6)}),HL`,
    0x64: 'NEG', 0x65: 'RETN', 0x66: `IM ${im[y]}`, 0x67: 'RRD',
    0x68: 'IN L,(C)', 0x69: 'OUT (C),L', 0x6A: 'ADC HL,HL', 0x6B: `LD HL,(${hex(u24(addr + 2), 6)})`,
    0x6C: 'NEG', 0x6D: 'RETN', 0x6E: `IM ${im[y]}`, 0x6F: 'RLD',
    0x70: 'IN (C)', 0x71: 'OUT (C),0', 0x72: 'SBC HL,SP', 0x73: `LD (${hex(u24(addr + 2), 6)}),SP`,
    0x74: 'NEG', 0x75: 'RETN', 0x76: `IM ${im[y]}`,
    0x78: 'IN A,(C)', 0x79: 'OUT (C),A', 0x7A: 'ADC HL,SP', 0x7B: `LD SP,(${hex(u24(addr + 2), 6)})`,
    0x7C: 'NEG', 0x7D: 'RETN', 0x7E: `IM ${im[y]}`,
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  if ((op === 0x43 || op === 0x4B || op === 0x53 || op === 0x5B || op === 0x63 || op === 0x6B || op === 0x73 || op === 0x7B)) {
    const addr24 = u24(addr + 2);
    noteRam(addr, addr24, block[op]);
    return { mnemonic: block[op] + annotateRam(addr24), nextAddr: addr + 5 };
  }
  if (block[op]) return { mnemonic: block[op], nextAddr: addr + 2 };
  return { mnemonic: `ED ${hex(op, 2)} ; unknown/ez80 extended (x=${x},y=${y},z=${z},p=${p},q=${q})`, nextAddr: addr + 2 };
}

function decodeBase(addr, modePrefix = '', indexPrefix = '', addrIs16 = false) {
  const op = b(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const mode = modePrefix ? `${modePrefix} ` : '';

  if (op === 0xCB) return decodeCB(addr, indexPrefix);
  if (op === 0xED && !indexPrefix) return decodeED(addr);
  if (op === 0xDD || op === 0xFD) {
    const decoded = decodeBase(addr + 1, modePrefix, op === 0xDD ? 'IX' : 'IY', addrIs16);
    return { mnemonic: decoded.mnemonic, nextAddr: decoded.nextAddr };
  }
  if (op === 0x40 || op === 0x49 || op === 0x52 || op === 0x5B) {
    const names = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    const force16 = (op === 0x40 || op === 0x49);
    const decoded = decodeBase(addr + 1, '', indexPrefix, force16);
    return { mnemonic: `${names[op]} ${decoded.mnemonic}`, nextAddr: decoded.nextAddr };
  }

  const addrWidth = addrIs16 ? 2 : 3;
  const addrHexWidth = addrIs16 ? 4 : 6;
  function readAddr(base) {
    return addrIs16 ? u16(base) : u24(base);
  }

  let mnemonic;
  let nextAddr = addr + 1;

  if (x === 0) {
    if (z === 0) {
      const misc = ['NOP', "EX AF,AF'", 'DJNZ', 'JR', 'JR NZ', 'JR Z', 'JR NC', 'JR C'];
      if (y === 2) {
        const to = addr + 2 + s8(b(addr + 1));
        mnemonic = `${misc[y]} ${hex(to, 6)}`;
        noteTarget('JR', addr, to, 'DJNZ');
        nextAddr = addr + 2;
      } else if (y >= 3) {
        const to = addr + 2 + s8(b(addr + 1));
        mnemonic = `${misc[y]} ${hex(to, 6)}`;
        noteTarget('JR', addr, to, misc[y]);
        nextAddr = addr + 2;
      } else {
        mnemonic = misc[y];
      }
    } else if (z === 1) {
      if (q === 0) {
        const immVal = readAddr(addr + 1);
        mnemonic = `LD ${rpName(p, indexPrefix)},${hex(immVal, addrHexWidth)}`;
        nextAddr = addr + 1 + addrWidth;
      } else {
        mnemonic = `ADD ${indexPrefix || 'HL'},${rpName(p, indexPrefix)}`;
      }
    } else if (z === 2) {
      const addr_nn = readAddr(addr + 1);
      const m = [
        `LD (BC),A`, `LD A,(BC)`, `LD (DE),A`, `LD A,(DE)`,
        `LD (${hex(addr_nn, addrHexWidth)}),${indexPrefix || 'HL'}`, `LD ${indexPrefix || 'HL'},(${hex(addr_nn, addrHexWidth)})`,
        `LD (${hex(addr_nn, addrHexWidth)}),A`, `LD A,(${hex(addr_nn, addrHexWidth)})`,
      ];
      mnemonic = m[y];
      if (y >= 4) {
        nextAddr = addr + 1 + addrWidth;
        noteRam(addr, addr_nn, mnemonic);
        mnemonic += annotateRam(addr_nn);
      }
    } else if (z === 3) {
      mnemonic = `${q ? 'DEC' : 'INC'} ${rpName(p, indexPrefix)}`;
    } else if (z === 4) {
      mnemonic = `INC ${regName(y, indexPrefix)}`;
      if (indexPrefix && y === 6) {
        mnemonic = prefixedOperand(mnemonic, s8(b(addr + 1)));
        nextAddr = addr + 2;
      }
    } else if (z === 5) {
      mnemonic = `DEC ${regName(y, indexPrefix)}`;
      if (indexPrefix && y === 6) {
        mnemonic = prefixedOperand(mnemonic, s8(b(addr + 1)));
        nextAddr = addr + 2;
      }
    } else if (z === 6) {
      mnemonic = `LD ${regName(y, indexPrefix)},${hex(b(addr + 1), 2)}`;
      nextAddr = addr + 2;
      if (indexPrefix && y === 6) {
        mnemonic = `LD (${indexPrefix}${s8(b(addr + 1)) < 0 ? '-' : '+'}${hex(Math.abs(s8(b(addr + 1))), 2)}),${hex(b(addr + 2), 2)}`;
        nextAddr = addr + 3;
      }
    } else {
      mnemonic = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y];
    }
  } else if (x === 1) {
    if (op === 0x76) mnemonic = 'HALT';
    else {
      mnemonic = `LD ${regName(y, indexPrefix)},${regName(z, indexPrefix)}`;
      if (indexPrefix && (y === 6 || z === 6)) {
        mnemonic = prefixedOperand(mnemonic, s8(b(addr + 1)));
        nextAddr = addr + 2;
      }
    }
  } else if (x === 2) {
    mnemonic = `${alu[y]} ${regName(z, indexPrefix)}`;
    if (indexPrefix && z === 6) {
      mnemonic = prefixedOperand(mnemonic, s8(b(addr + 1)));
      nextAddr = addr + 2;
    }
  } else {
    if (z === 0) {
      mnemonic = `RET ${cc[y]}`;
    } else if (z === 1) {
      mnemonic = q === 0 ? `POP ${p === 2 && indexPrefix ? indexPrefix : rp2[p]}` : ['RET', 'EXX', `JP (${indexPrefix || 'HL'})`, `LD SP,${indexPrefix || 'HL'}`][p];
    } else if (z === 2) {
      const to = readAddr(addr + 1);
      mnemonic = `JP ${cc[y]},${hex(to, addrHexWidth)}`;
      noteTarget('JP', addr, to, cc[y]);
      nextAddr = addr + 1 + addrWidth;
    } else if (z === 3) {
      if (y === 0) {
        const to = readAddr(addr + 1);
        mnemonic = `JP ${hex(to, addrHexWidth)}`;
        noteTarget('JP', addr, to);
        nextAddr = addr + 1 + addrWidth;
      } else if (y === 2) {
        mnemonic = `OUT (${hex(b(addr + 1), 2)}),A`;
        nextAddr = addr + 2;
      } else if (y === 3) {
        mnemonic = `IN A,(${hex(b(addr + 1), 2)})`;
        nextAddr = addr + 2;
      } else {
        mnemonic = ['', '', '', '', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'][y];
        if (indexPrefix && y === 4) mnemonic = `EX (SP),${indexPrefix}`;
      }
    } else if (z === 4) {
      const to = readAddr(addr + 1);
      mnemonic = `CALL ${cc[y]},${hex(to, addrHexWidth)}`;
      noteTarget('CALL', addr, to, cc[y]);
      nextAddr = addr + 1 + addrWidth;
    } else if (z === 5) {
      if (q === 0) mnemonic = `PUSH ${p === 2 && indexPrefix ? indexPrefix : rp2[p]}`;
      else if (p === 0) {
        const to = readAddr(addr + 1);
        mnemonic = `CALL ${hex(to, addrHexWidth)}`;
        noteTarget('CALL', addr, to);
        nextAddr = addr + 1 + addrWidth;
      } else {
        mnemonic = ['', '', '', ''][p] || `opcode ${hex(op, 2)}`;
      }
    } else if (z === 6) {
      mnemonic = `${alu[y]} ${hex(b(addr + 1), 2)}`;
      nextAddr = addr + 2;
    } else {
      const rstAddr = y * 8;
      if (op === 0xE7) {
        const index = u16(addr + 1);
        const tableAddr = 0x020104 + index * 4;
        let resolvedTarget = null;
        if (index < 2178 && tableAddr + 3 < rom.length && b(tableAddr) === 0xC3) {
          resolvedTarget = u24(tableAddr + 1);
        }
        const resolvedStr = resolvedTarget !== null ? ` -> ${hex(resolvedTarget, 6)}` : '';
        mnemonic = `RST 28h ; BCALL ${hex(index, 4)}${resolvedStr}`;
        rsts.push({ from: addr, to: resolvedTarget ?? rstAddr, detail: `BCALL ${hex(index, 4)}${resolvedStr}` });
        nextAddr = addr + 3;
      } else {
        mnemonic = `RST ${hex(rstAddr, 2)}`;
        rsts.push({ from: addr, to: rstAddr, detail: '' });
      }
    }
  }

  if (indexPrefix === 'IY') {
    const iyMatch = mnemonic.match(/\(IY[+-]0x([0-9A-F]+)\)/);
    if (iyMatch) {
      const rawDisp = parseInt(iyMatch[1], 16);
      const sign = mnemonic.includes('(IY-') ? -1 : 1;
      noteIY(addr - 1, sign * rawDisp, mnemonic);
    }
  }

  return { mnemonic: mode + mnemonic, nextAddr };
}

function decode(addr) {
  const decoded = decodeBase(addr);
  return {
    address: addr,
    bytes: bytesAt(addr, decoded.nextAddr - addr),
    mnemonic: decoded.mnemonic,
    nextAddr: decoded.nextAddr,
  };
}

function printTargets(label, values) {
  console.log(`\n${label}:`);
  if (values.length === 0) {
    console.log('  none');
    return;
  }
  for (const item of values) {
    const to = typeof item.to === 'number' ? hex(item.to, item.to > 0xffff ? 6 : 4) : item.to;
    console.log(`  ${hex(item.from, 6)} -> ${to}${item.detail ? ` (${item.detail})` : ''}`);
  }
}

function resetTracking() {
  calls = [];
  jumps = [];
  jrs = [];
  rsts = [];
  ramRefs = [];
  iyRefs = [];
}

// ============================================================
// Disassemble with branch following
// ============================================================

function disassembleWithBranches(name, start, maxBytes) {
  resetTracking();
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Function: ${name}`);
  console.log(`Start: ${hex(start, 6)}, max ${maxBytes} bytes`);
  console.log('='.repeat(70));

  const visited = new Set();
  const queue = [start];
  const allInsns = new Map();

  while (queue.length > 0) {
    let addr = queue.shift();

    while (addr >= start && addr < start + maxBytes && !visited.has(addr)) {
      visited.add(addr);
      const inst = decode(addr);
      allInsns.set(addr, inst);

      const opByte = rom[addr];

      // RET
      if (opByte === 0xC9) break;

      // Unconditional JP
      if (opByte === 0xC3) {
        const target = u24(addr + 1);
        if (target >= start && target < start + maxBytes && !visited.has(target)) {
          queue.push(target);
        }
        break;
      }

      // Unconditional JR
      if (opByte === 0x18) {
        const target = addr + 2 + s8(b(addr + 1));
        if (target >= start && target < start + maxBytes && !visited.has(target)) {
          queue.push(target);
        }
        break;
      }

      // Conditional JR (NZ/Z/NC/C)
      if (opByte >= 0x20 && opByte <= 0x38 && (opByte & 0x07) === 0 && opByte !== 0x18 && opByte !== 0x10) {
        const target = addr + 2 + s8(b(addr + 1));
        if (target >= start && target < start + maxBytes && !visited.has(target)) {
          queue.push(target);
        }
      }

      // DJNZ
      if (opByte === 0x10) {
        const target = addr + 2 + s8(b(addr + 1));
        if (target >= start && target < start + maxBytes && !visited.has(target)) {
          queue.push(target);
        }
      }

      // Conditional JP
      if ((opByte & 0xC7) === 0xC2) {
        const target = u24(addr + 1);
        if (target >= start && target < start + maxBytes && !visited.has(target)) {
          queue.push(target);
        }
      }

      if (inst.nextAddr <= addr) {
        console.log(`  WARNING: decoder did not advance at ${hex(addr, 6)}`);
        break;
      }

      addr = inst.nextAddr;
    }
  }

  const sortedAddrs = [...allInsns.keys()].sort((a, bb) => a - bb);

  console.log('Address  Bytes           Instruction');
  console.log('-------  --------------  -----------');

  for (const a of sortedAddrs) {
    const inst = allInsns.get(a);
    // Mark the 0x092F95 entry point if inside the 0x092F87 disassembly
    const marker = (start === TARGET_A && a === TARGET_B) ? '  <<< 0x092F95 entry' : '';
    console.log(`${hex(inst.address, 6)}  ${inst.bytes.padEnd(14)}  ${inst.mnemonic}${marker}`);
  }

  const lastAddr = sortedAddrs[sortedAddrs.length - 1];
  const lastInst = allInsns.get(lastAddr);
  const totalBytes = lastAddr + (lastInst.nextAddr - lastAddr) - start;

  console.log(`\n  Total instructions: ${sortedAddrs.length}`);
  console.log(`  Bytes covered: ${totalBytes} (${hex(start, 6)} - ${hex(start + totalBytes, 6)})`);

  printTargets('CALL targets', calls);
  printTargets('JP targets', jumps);
  printTargets('JR targets', jrs);
  printTargets('RST/BCALL targets', rsts);

  console.log('\nRAM references:');
  if (ramRefs.length === 0) {
    console.log('  none');
  } else {
    for (const ref of ramRefs) {
      console.log(`  ${hex(ref.from, 6)} -> ${hex(ref.addr, 6)} (${ref.detail})`);
    }
  }

  console.log('\nIY-relative references:');
  if (iyRefs.length === 0) {
    console.log('  none');
  } else {
    for (const ref of iyRefs) {
      const sign = ref.offset >= 0 ? '+' : '-';
      console.log(`  ${hex(ref.from, 6)}  IY${sign}${hex(Math.abs(ref.offset), 2)} (${ref.op})`);
    }
  }

  return { count: sortedAddrs.length, totalBytes, insns: allInsns, sortedAddrs };
}

// ============================================================
// Scan ROM for callers
// ============================================================

function scanForCallers(target, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Scanning ROM for callers of ${label} (${hex(target, 6)})`);
  console.log('='.repeat(70));

  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;

  const callSites = [];
  const jpSites = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callSites.push(i);
    }
    if (rom[i] === 0xC3 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      jpSites.push(i);
    }
  }

  console.log(`CALL CD sites: ${callSites.length}`);
  for (const addr of callSites.slice(0, 30)) {
    console.log(`  ${hex(addr, 6)}  [${bytesAt(Math.max(0, addr - 4), 12)}]`);
  }
  if (callSites.length > 30) console.log(`  ... +${callSites.length - 30} more`);

  if (jpSites.length > 0) {
    console.log(`JP C3 sites: ${jpSites.length}`);
    for (const addr of jpSites.slice(0, 10)) {
      console.log(`  ${hex(addr, 6)}  [${bytesAt(Math.max(0, addr - 4), 12)}]`);
    }
  } else {
    console.log('JP C3 sites: 0');
  }

  return { callSites, jpSites, total: callSites.length + jpSites.length };
}

// ============================================================
// Main
// ============================================================

console.log('=== Probe: Decode 0x092F87 and 0x092F95 — math/computation helpers ===');
console.log('Called before type-0x09 event posting by callers at 0x022878 and 0x0228CC.');
console.log('0x092F95 is 14 bytes after 0x092F87 — checking for overlap.\n');

// Disassemble 0x092F87 with enough room to cover past 0x092F95
const resultA = disassembleWithBranches('0x092F87 — math/computation helper A', TARGET_A, MAX_BYTES);

// Disassemble 0x092F95 separately
const resultB = disassembleWithBranches('0x092F95 — math/computation helper B', TARGET_B, MAX_BYTES);

// Check overlap
const endA = TARGET_A + resultA.totalBytes;
const overlaps = TARGET_B < endA;

console.log(`\n${'='.repeat(70)}`);
console.log('OVERLAP ANALYSIS');
console.log('='.repeat(70));
console.log(`0x092F87 spans: ${hex(TARGET_A, 6)} - ${hex(endA, 6)} (${resultA.totalBytes} bytes)`);
console.log(`0x092F95 starts at: ${hex(TARGET_B, 6)}`);
if (overlaps) {
  console.log(`>>> 0x092F95 IS a mid-function entry into 0x092F87 (offset +${TARGET_B - TARGET_A} bytes)`);
  const sharedInsns = resultA.sortedAddrs.filter(a => a >= TARGET_B);
  console.log(`    Shared instructions from 0x092F95 onward: ${sharedInsns.length}`);
  const preamble = resultA.sortedAddrs.filter(a => a < TARGET_B);
  console.log(`    Preamble instructions (0x092F87 only, skipped by 0x092F95): ${preamble.length}`);
  if (preamble.length > 0) {
    console.log('    Preamble:');
    for (const a of preamble) {
      const inst = resultA.insns.get(a);
      console.log(`      ${hex(a, 6)}  ${inst.bytes.padEnd(14)}  ${inst.mnemonic}`);
    }
  }
} else {
  console.log(`>>> 0x092F95 is a SEPARATE function (0x092F87 ends before 0x092F95 starts)`);
}

// Also disassemble the branch targets of 0x092F95 that fall outside its maxBytes range
// (0x092FC1 and 0x092FB1 were seen in the initial decode)
console.log(`\n${'='.repeat(70)}`);
console.log('EXTENDED: Disassemble nearby branch targets');
console.log('='.repeat(70));
const resultC = disassembleWithBranches('0x092FC7 — helper called by 0x092F87', 0x092FC7, 100);

// Scan for callers of both
const callersA = scanForCallers(TARGET_A, '0x092F87');
const callersB = scanForCallers(TARGET_B, '0x092F95');

console.log(`\n${'='.repeat(70)}`);
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`0x092F87: ${resultA.totalBytes} bytes, ${resultA.count} instructions`);
console.log(`0x092F95: ${resultB.totalBytes} bytes, ${resultB.count} instructions`);
console.log(`0x092FC7: ${resultC.totalBytes} bytes, ${resultC.count} instructions (helper)`);
console.log(`Overlap: ${overlaps ? 'YES — 0x092F95 is mid-function entry into 0x092F87' : 'NO — separate functions'}`);
console.log(`Callers of 0x092F87: ${callersA.total} (${callersA.callSites.length} CALL + ${callersA.jpSites.length} JP)`);
console.log(`Callers of 0x092F95: ${callersB.total} (${callersB.callSites.length} CALL + ${callersB.jpSites.length} JP)`);
