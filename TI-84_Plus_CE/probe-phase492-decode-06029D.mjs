import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

function ensureTranspiledRom() {
  const transpiled = new URL('./ROM.transpiled.js', import.meta.url);
  const gz = new URL('./ROM.transpiled.js.gz', import.meta.url);
  if (fs.existsSync(transpiled) || !fs.existsSync(gz)) return;
  console.log('ROM.transpiled.js missing; expanding ROM.transpiled.js.gz');
  try {
    execFileSync('gzip', ['-dk', fileURLToPath(gz)], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: 'inherit',
    });
  } catch (error) {
    console.log(`gzip failed (${error.message}); falling back to node:zlib`);
    fs.writeFileSync(transpiled, zlib.gunzipSync(fs.readFileSync(gz)));
  }
}

ensureTranspiledRom();

const { createExecutor } = await import('./cpu-runtime.js');
const { createPeripheralBus } = await import('./peripherals.js');
const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');

const ROM_SIZE = 0x400000;
const DRAW_ADDR = 0x06029d;
const RETURN_SENTINEL = 0x064910;
const BOOT_STEPS = 120000;
const MAX_CALL_STEPS = 50000;
const VRAM_START = 0xd40000;
const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const VRAM_SIZE = LCD_WIDTH * LCD_HEIGHT;
const STACK_ADDR = 0xd1a87e;

const WATCH_ADDRS = new Map([
  [0xd00595, 'D00595 cursor row'],
  [0xd00596, 'D00596 cursor col'],
  [0xd0059c, 'D0059C VRAM pointer'],
  [0xd008d2, 'D008D2 LCD window register'],
  [0xd008d5, 'D008D5 LCD window register'],
]);

const MODE_PREFIXES = new Map([
  [0x40, 'SIS'],
  [0x49, 'LIS'],
  [0x52, 'SIL'],
  [0x5b, 'LIL'],
]);

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const R16 = ['BC', 'DE', 'HL', 'SP'];
const R16_AF = ['BC', 'DE', 'HL', 'AF'];
const CONDITIONS = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const IX_DISP_R = ['B', 'C', 'D', 'E', 'IXH', 'IXL', '(IX+d)', 'A'];
const IY_DISP_R = ['B', 'C', 'D', 'E', 'IYH', 'IYL', '(IY+d)', 'A'];

function hex(value, width) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function h8(value) {
  return `0x${hex(value & 0xff, 2)}`;
}

function h16(value) {
  return `0x${hex(value & 0xffff, 4)}`;
}

function h24(value) {
  return `0x${hex(value & 0xffffff, 6)}`;
}

function read8(bytes, addr) {
  return bytes[addr] ?? 0;
}

function read16(bytes, addr) {
  return read8(bytes, addr) | (read8(bytes, addr + 1) << 8);
}

function read24(bytes, addr) {
  return read8(bytes, addr) | (read8(bytes, addr + 1) << 8) | (read8(bytes, addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(addr, size, offset) {
  return (addr + size + signed8(offset)) & 0xffffff;
}

function rawBytes(bytes, addr, size) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(hex(read8(bytes, addr + i), 2));
  return out.join(' ');
}

function modeName(prefix) {
  return prefix == null ? null : MODE_PREFIXES.get(prefix);
}

function hasLongImmediate(prefix) {
  const name = modeName(prefix);
  return name == null || name.startsWith('L');
}

function immediateSize(prefix) {
  return hasLongImmediate(prefix) ? 3 : 2;
}

function readImmediate(bytes, addr, prefix) {
  return immediateSize(prefix) === 3 ? read24(bytes, addr) : read16(bytes, addr);
}

function formatImmediate(value, prefix) {
  return immediateSize(prefix) === 3 ? h24(value) : h16(value);
}

function formatDisplacement(value) {
  const signed = signed8(value);
  return signed < 0 ? `-${h8(-signed)}` : `+${h8(signed)}`;
}

function withMode(prefix, mnemonic) {
  const name = modeName(prefix);
  return name == null ? mnemonic : `${name} ${mnemonic}`;
}

function byteRefs(bytes, addr, size) {
  const refs = [];
  const insn = [];
  for (let i = 0; i < size; i++) insn.push(read8(bytes, addr + i));
  for (const [target, label] of WATCH_ADDRS) {
    const pattern = [target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
    for (let i = 0; i <= insn.length - pattern.length; i++) {
      if (insn[i] === pattern[0] && insn[i + 1] === pattern[1] && insn[i + 2] === pattern[2]) {
        refs.push(label);
      }
    }
  }
  return refs;
}

function annotateInstruction(decoded, bytes, addr) {
  decoded.refs = byteRefs(bytes, addr, decoded.size);
  const immediates = decoded.immediates ?? [];
  for (const value of immediates) {
    if (WATCH_ADDRS.has(value)) decoded.refs.push(WATCH_ADDRS.get(value));
    if (value >= 0xd40000 && value <= 0xd40000 + VRAM_SIZE) {
      decoded.refs.push(`VRAM-like address ${h24(value)}`);
    }
  }
  decoded.refs = [...new Set(decoded.refs)];
  return decoded;
}

function decodeED(bytes, addr, prefix) {
  const op = read8(bytes, addr + 1);
  const table = new Map([
    [0x40, 'IN B,(C)'],
    [0x41, 'OUT (C),B'],
    [0x42, 'SBC HL,BC'],
    [0x43, `LD (${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)}),BC`],
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x46, 'IM 0'],
    [0x47, 'LD I,A'],
    [0x48, 'IN C,(C)'],
    [0x49, 'OUT (C),C'],
    [0x4a, 'ADC HL,BC'],
    [0x4b, `LD BC,(${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)})`],
    [0x4c, 'MLT BC'],
    [0x4d, 'RETI'],
    [0x4f, 'LD R,A'],
    [0x50, 'IN D,(C)'],
    [0x51, 'OUT (C),D'],
    [0x52, 'SBC HL,DE'],
    [0x53, `LD (${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)}),DE`],
    [0x56, 'IM 1'],
    [0x57, 'LD A,I'],
    [0x58, 'IN E,(C)'],
    [0x59, 'OUT (C),E'],
    [0x5a, 'ADC HL,DE'],
    [0x5b, `LD DE,(${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)})`],
    [0x5c, 'MLT DE'],
    [0x5e, 'IM 2'],
    [0x5f, 'LD A,R'],
    [0x60, 'IN H,(C)'],
    [0x61, 'OUT (C),H'],
    [0x62, 'SBC HL,HL'],
    [0x63, `LD (${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)}),HL`],
    [0x67, 'RRD'],
    [0x68, 'IN L,(C)'],
    [0x69, 'OUT (C),L'],
    [0x6a, 'ADC HL,HL'],
    [0x6b, `LD HL,(${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)})`],
    [0x6c, 'MLT HL'],
    [0x6f, 'RLD'],
    [0x72, 'SBC HL,SP'],
    [0x73, `LD (${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)}),SP`],
    [0x78, 'IN A,(C)'],
    [0x79, 'OUT (C),A'],
    [0x7a, 'ADC HL,SP'],
    [0x7b, `LD SP,(${formatImmediate(readImmediate(bytes, addr + 2, prefix), prefix)})`],
    [0x7c, 'MLT SP'],
    [0xa0, 'LDI'],
    [0xa1, 'CPI'],
    [0xa2, 'INI'],
    [0xa3, 'OUTI'],
    [0xa8, 'LDD'],
    [0xa9, 'CPD'],
    [0xaa, 'IND'],
    [0xab, 'OUTD'],
    [0xb0, 'LDIR'],
    [0xb1, 'CPIR'],
    [0xb2, 'INIR'],
    [0xb3, 'OTIR'],
    [0xb8, 'LDDR'],
    [0xb9, 'CPDR'],
    [0xba, 'INDR'],
    [0xbb, 'OTDR'],
  ]);
  const addressOps = new Set([0x43, 0x4b, 0x53, 0x5b, 0x63, 0x6b, 0x73, 0x7b]);
  if (table.has(op)) {
    const size = addressOps.has(op) ? 2 + immediateSize(prefix) : 2;
    const immediates = addressOps.has(op) ? [readImmediate(bytes, addr + 2, prefix)] : [];
    return {
      size,
      mnemonic: table.get(op),
      isBlockCopy: op === 0xb0 || op === 0xb8,
      immediates,
    };
  }
  return { size: 2, mnemonic: `ED ${h8(op)}` };
}

function decodeCB(bytes, addr, indexReg = null) {
  const hasDisp = indexReg != null;
  const opAddr = hasDisp ? addr + 3 : addr + 1;
  const op = read8(bytes, opAddr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const regs = indexReg === 'IX' ? IX_DISP_R : indexReg === 'IY' ? IY_DISP_R : R8;
  const target = regs[z];
  const disp = hasDisp ? formatDisplacement(read8(bytes, addr + 2)) : '';
  const rendered = hasDisp ? target.replace(`${indexReg}+d`, `${indexReg}${disp}`) : target;
  if (x === 0) return { size: hasDisp ? 4 : 2, mnemonic: `${ROT[y]} ${rendered}` };
  if (x === 1) return { size: hasDisp ? 4 : 2, mnemonic: `BIT ${y},${rendered}` };
  if (x === 2) return { size: hasDisp ? 4 : 2, mnemonic: `RES ${y},${rendered}` };
  return { size: hasDisp ? 4 : 2, mnemonic: `SET ${y},${rendered}` };
}

function decodeIndexed(bytes, addr, prefix, indexReg) {
  const op = read8(bytes, addr + 1);
  const other = indexReg === 'IX' ? 'IY' : 'IX';
  const regs = indexReg === 'IX' ? IX_DISP_R : IY_DISP_R;
  const imm = readImmediate(bytes, addr + 2, prefix);
  if (op === 0xcb) return decodeCB(bytes, addr, indexReg);
  if (op === 0xdd || op === 0xfd) return { size: 1, mnemonic: `${other} prefix` };
  if (op === 0x21) return { size: 2 + immediateSize(prefix), mnemonic: `LD ${indexReg},${formatImmediate(imm, prefix)}`, immediates: [imm] };
  if (op === 0x22) return { size: 2 + immediateSize(prefix), mnemonic: `LD (${formatImmediate(imm, prefix)}),${indexReg}`, immediates: [imm] };
  if (op === 0x2a) return { size: 2 + immediateSize(prefix), mnemonic: `LD ${indexReg},(${formatImmediate(imm, prefix)})`, immediates: [imm] };
  if (op === 0x23) return { size: 2, mnemonic: `INC ${indexReg}` };
  if (op === 0x24) return { size: 2, mnemonic: `INC ${indexReg}H` };
  if (op === 0x25) return { size: 2, mnemonic: `DEC ${indexReg}H` };
  if (op === 0x26) return { size: 3, mnemonic: `LD ${indexReg}H,${h8(read8(bytes, addr + 2))}` };
  if (op === 0x29) return { size: 2, mnemonic: `ADD ${indexReg},${indexReg}` };
  if (op === 0x2b) return { size: 2, mnemonic: `DEC ${indexReg}` };
  if (op === 0x2c) return { size: 2, mnemonic: `INC ${indexReg}L` };
  if (op === 0x2d) return { size: 2, mnemonic: `DEC ${indexReg}L` };
  if (op === 0x2e) return { size: 3, mnemonic: `LD ${indexReg}L,${h8(read8(bytes, addr + 2))}` };
  if (op === 0x34) return { size: 3, mnemonic: `INC (${indexReg}${formatDisplacement(read8(bytes, addr + 2))})` };
  if (op === 0x35) return { size: 3, mnemonic: `DEC (${indexReg}${formatDisplacement(read8(bytes, addr + 2))})` };
  if (op === 0x36) return { size: 4, mnemonic: `LD (${indexReg}${formatDisplacement(read8(bytes, addr + 2))}),${h8(read8(bytes, addr + 3))}` };
  if (op === 0x39) return { size: 2, mnemonic: `ADD ${indexReg},SP` };
  if (op === 0xe1) return { size: 2, mnemonic: `POP ${indexReg}` };
  if (op === 0xe3) return { size: 2, mnemonic: `EX (SP),${indexReg}` };
  if (op === 0xe5) return { size: 2, mnemonic: `PUSH ${indexReg}` };
  if (op === 0xe9) return { size: 2, mnemonic: `JP (${indexReg})` };
  if (op === 0xf9) return { size: 2, mnemonic: `LD SP,${indexReg}` };

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 1 && op !== 0x76) {
    let size = 2;
    let left = regs[y];
    let right = regs[z];
    if (left.includes('(IX+d)') || left.includes('(IY+d)') || right.includes('(IX+d)') || right.includes('(IY+d)')) {
      size = 3;
      const disp = formatDisplacement(read8(bytes, addr + 2));
      left = left.replace(`${indexReg}+d`, `${indexReg}${disp}`);
      right = right.replace(`${indexReg}+d`, `${indexReg}${disp}`);
    }
    return { size, mnemonic: `LD ${left},${right}` };
  }
  if (x === 2) {
    let size = 2;
    let operand = regs[z];
    if (operand.includes('(IX+d)') || operand.includes('(IY+d)')) {
      size = 3;
      operand = operand.replace(`${indexReg}+d`, `${indexReg}${formatDisplacement(read8(bytes, addr + 2))}`);
    }
    return { size, mnemonic: `${ALU[y]} ${operand}` };
  }
  return { size: 2, mnemonic: `${indexReg} ${h8(op)}` };
}

function decodeUnprefixed(bytes, addr, prefix = null) {
  const op = read8(bytes, addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xcb) return decodeCB(bytes, addr);
  if (op === 0xed) return decodeED(bytes, addr, prefix);
  if (op === 0xdd) return decodeIndexed(bytes, addr, prefix, 'IX');
  if (op === 0xfd) return decodeIndexed(bytes, addr, prefix, 'IY');

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { size: 1, mnemonic: 'NOP' };
      if (y === 1) return { size: 2, mnemonic: `EX AF,AF'` };
      if (y === 2) {
        const value = read8(bytes, addr + 1);
        return { size: 2, mnemonic: `DJNZ ${h24(relTarget(addr, 2, value))}` };
      }
      if (y === 3) {
        const value = read8(bytes, addr + 1);
        return { size: 2, mnemonic: `JR ${h24(relTarget(addr, 2, value))}` };
      }
      const value = read8(bytes, addr + 1);
      return { size: 2, mnemonic: `JR ${CONDITIONS[y - 4]},${h24(relTarget(addr, 2, value))}` };
    }
    if (z === 1) {
      if (q === 0) {
        const value = readImmediate(bytes, addr + 1, prefix);
        return { size: 1 + immediateSize(prefix), mnemonic: `LD ${R16[p]},${formatImmediate(value, prefix)}`, immediates: [value] };
      }
      return { size: 1, mnemonic: `ADD HL,${R16[p]}` };
    }
    if (z === 2) {
      if (q === 0) {
        if (p === 0) return { size: 1, mnemonic: 'LD (BC),A' };
        if (p === 1) return { size: 1, mnemonic: 'LD (DE),A' };
        const value = readImmediate(bytes, addr + 1, prefix);
        const target = p === 2 ? 'HL' : 'A';
        return { size: 1 + immediateSize(prefix), mnemonic: `LD (${formatImmediate(value, prefix)}),${target}`, immediates: [value] };
      }
      if (p === 0) return { size: 1, mnemonic: 'LD A,(BC)' };
      if (p === 1) return { size: 1, mnemonic: 'LD A,(DE)' };
      const value = readImmediate(bytes, addr + 1, prefix);
      const target = p === 2 ? 'HL' : 'A';
      return { size: 1 + immediateSize(prefix), mnemonic: `LD ${target},(${formatImmediate(value, prefix)})`, immediates: [value] };
    }
    if (z === 3) return { size: 1, mnemonic: `${q === 0 ? 'INC' : 'DEC'} ${R16[p]}` };
    if (z === 4) return { size: 1, mnemonic: `INC ${R8[y]}` };
    if (z === 5) return { size: 1, mnemonic: `DEC ${R8[y]}` };
    if (z === 6) return { size: 2, mnemonic: `LD ${R8[y]},${h8(read8(bytes, addr + 1))}` };
    return {
      size: 1,
      mnemonic: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y],
    };
  }

  if (x === 1) {
    if (op === 0x76) return { size: 1, mnemonic: 'HALT' };
    return { size: 1, mnemonic: `LD ${R8[y]},${R8[z]}` };
  }

  if (x === 2) return { size: 1, mnemonic: `${ALU[y]} ${R8[z]}` };

  if (z === 0) return { size: 1, mnemonic: `RET ${CONDITIONS[y]}`, isRet: false };
  if (z === 1) {
    if (q === 0) return { size: 1, mnemonic: `POP ${R16_AF[p]}` };
    if (p === 0) return { size: 1, mnemonic: 'RET', isRet: true };
    if (p === 1) return { size: 1, mnemonic: 'EXX' };
    if (p === 2) return { size: 1, mnemonic: 'JP (HL)' };
    return { size: 1, mnemonic: 'LD SP,HL' };
  }
  if (z === 2) {
    const value = readImmediate(bytes, addr + 1, prefix);
    return { size: 1 + immediateSize(prefix), mnemonic: `JP ${CONDITIONS[y]},${formatImmediate(value, prefix)}`, target: value, immediates: [value] };
  }
  if (z === 3) {
    if (y === 0) {
      const value = readImmediate(bytes, addr + 1, prefix);
      return { size: 1 + immediateSize(prefix), mnemonic: `JP ${formatImmediate(value, prefix)}`, target: value, immediates: [value] };
    }
    if (y === 2) {
      const port = read8(bytes, addr + 1);
      return { size: 2, mnemonic: `OUT (${h8(port)}),A` };
    }
    if (y === 3) {
      const port = read8(bytes, addr + 1);
      return { size: 2, mnemonic: `IN A,(${h8(port)})` };
    }
    if (y === 4) return { size: 1, mnemonic: 'EX (SP),HL' };
    if (y === 5) return { size: 1, mnemonic: 'EX DE,HL' };
    if (y === 6) return { size: 1, mnemonic: 'DI' };
    if (y === 7) return { size: 1, mnemonic: 'EI' };
  }
  if (z === 4) {
    const value = readImmediate(bytes, addr + 1, prefix);
    return { size: 1 + immediateSize(prefix), mnemonic: `CALL ${CONDITIONS[y]},${formatImmediate(value, prefix)}`, target: value, immediates: [value] };
  }
  if (z === 5) {
    if (q === 0) return { size: 1, mnemonic: `PUSH ${R16_AF[p]}` };
    if (p === 0) {
      const value = readImmediate(bytes, addr + 1, prefix);
      return { size: 1 + immediateSize(prefix), mnemonic: `CALL ${formatImmediate(value, prefix)}`, target: value, immediates: [value] };
    }
    return { size: 1, mnemonic: `RST ${h8(y * 8)}` };
  }
  if (z === 6) return { size: 2, mnemonic: `${ALU[y]} ${h8(read8(bytes, addr + 1))}` };
  return { size: 1, mnemonic: `RST ${h8(y * 8)}` };
}

function decodeInstruction(bytes, addr) {
  const first = read8(bytes, addr);
  let prefix = null;
  let opAddr = addr;
  if (MODE_PREFIXES.has(first)) {
    prefix = first;
    opAddr++;
  }
  const decoded = decodeUnprefixed(bytes, opAddr, prefix);
  decoded.size += opAddr - addr;
  decoded.mnemonic = withMode(prefix, decoded.mnemonic);
  decoded.prefix = prefix;
  return annotateInstruction(decoded, bytes, addr);
}

function printDisassembly(rom) {
  console.log(`\n=== Part 1: Static disassembly at ${h24(DRAW_ADDR)} ===`);
  let pc = DRAW_ADDR;
  const end = Math.min(DRAW_ADDR + 100, rom.length);
  const callsAndJumps = [];
  const blockCopies = [];
  const refs = [];
  while (pc < end) {
    const decoded = decodeInstruction(rom, pc);
    const raw = rawBytes(rom, pc, decoded.size).padEnd(17);
    const suffix = [];
    if (decoded.target != null) suffix.push(`target=${h24(decoded.target)}`);
    if (decoded.refs?.length) suffix.push(`refs=${decoded.refs.join(', ')}`);
    if (decoded.isBlockCopy) suffix.push('block-copy');
    console.log(`${h24(pc)}  ${raw}  ${decoded.mnemonic}${suffix.length ? ` ; ${suffix.join(' ; ')}` : ''}`);

    if (decoded.target != null) callsAndJumps.push({ addr: pc, mnemonic: decoded.mnemonic, target: decoded.target });
    if (decoded.isBlockCopy) blockCopies.push({ addr: pc, mnemonic: decoded.mnemonic });
    if (decoded.refs?.length) refs.push({ addr: pc, refs: decoded.refs });
    pc += Math.max(decoded.size, 1);
    if (decoded.isRet) break;
  }

  console.log('\nStatic notes:');
  if (refs.length === 0) {
    console.log('- No direct 24-bit references to D00595/D00596/D0059C/D008D2/D008D5 found in decoded bytes.');
  } else {
    for (const ref of refs) console.log(`- ${h24(ref.addr)} references ${ref.refs.join(', ')}`);
  }
  if (callsAndJumps.length === 0) {
    console.log('- No CALL/JP targets decoded in the first 100 bytes.');
  } else {
    for (const item of callsAndJumps) console.log(`- ${h24(item.addr)} ${item.mnemonic} -> ${h24(item.target)}`);
  }
  if (blockCopies.length === 0) {
    console.log('- No LDIR/LDDR decoded in the first 100 bytes.');
  } else {
    for (const item of blockCopies) console.log(`- ${h24(item.addr)} ${item.mnemonic}`);
  }
}

function samePattern(rom, addr, pattern) {
  if (addr + pattern.length > rom.length || addr + pattern.length > ROM_SIZE) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (rom[addr + i] !== pattern[i]) return false;
  }
  return true;
}

function findCallers(rom) {
  console.log(`\n=== Part 2: CALL/JP sites targeting ${h24(DRAW_ADDR)} ===`);
  const target = [DRAW_ADDR & 0xff, (DRAW_ADDR >> 8) & 0xff, (DRAW_ADDR >> 16) & 0xff];
  const specs = [
    { kind: 'CALL', prefix: null, pattern: [0xcd, ...target] },
    { kind: 'JP', prefix: null, pattern: [0xc3, ...target] },
  ];
  for (const [prefix, name] of MODE_PREFIXES) {
    specs.push({ kind: 'CALL', prefix: name, pattern: [prefix, 0xcd, ...target] });
    specs.push({ kind: 'JP', prefix: name, pattern: [prefix, 0xc3, ...target] });
  }

  const hits = [];
  const scanEnd = Math.min(rom.length, ROM_SIZE);
  for (let addr = 0; addr < scanEnd; addr++) {
    for (const spec of specs) {
      if (samePattern(rom, addr, spec.pattern)) {
        hits.push({ addr, ...spec });
      }
    }
  }

  if (hits.length === 0) {
    console.log('No direct CALL/JP byte-pattern callers found.');
    return hits;
  }

  for (const hit of hits) {
    console.log(`${h24(hit.addr)}  ${rawBytes(rom, hit.addr, hit.pattern.length).padEnd(14)}  ${hit.prefix ? `${hit.prefix} ` : ''}${hit.kind} ${h24(DRAW_ADDR)}`);
  }
  console.log(`Total direct CALL/JP pattern hits: ${hits.length}`);
  return hits;
}

function createProbeMachine() {
  const peripherals = createPeripheralBus({ timerInterrupt: false, trace: false });
  const romBytes = fs.readFileSync(new URL('./ROM.rom', import.meta.url));
  const memory = new Uint8Array(0x1000000);
  memory.set(romBytes);
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
  return { executor, cpu: executor.cpu, memory };
}

function bootMachine() {
  const { executor, cpu, memory } = createProbeMachine();

  // Cold boot
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_ADDR - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_ADDR - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post init
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return { executor, cpu, memory };
}

function push24(cpu, memory, addr) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  memory[cpu.sp] = addr & 0xff;
  memory[cpu.sp + 1] = (addr >> 8) & 0xff;
  memory[cpu.sp + 2] = (addr >> 16) & 0xff;
}

function snapshotVRAM(memory) {
  const out = new Uint8Array(VRAM_SIZE);
  out.set(memory.subarray(VRAM_START, VRAM_START + VRAM_SIZE));
  return out;
}

function diffVRAM(before, after) {
  let changed = 0;
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  const valueCounts = new Map();

  for (let i = 0; i < VRAM_SIZE; i++) {
    if (before[i] === after[i]) continue;
    changed++;
    const row = Math.floor(i / LCD_WIDTH);
    const col = i % LCD_WIDTH;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    valueCounts.set(after[i], (valueCounts.get(after[i]) ?? 0) + 1);
  }

  if (changed === 0) return { changed, bbox: null, valueCounts };
  return { changed, bbox: { minRow, maxRow, minCol, maxCol }, valueCounts };
}

function topValues(valueCounts) {
  return [...valueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([value, count]) => `${h8(value)}:${count}`)
    .join(', ');
}

function runDrawTest(label, cursorRow, cursorCol) {
  console.log(`\n--- Test ${label}: D00595=${cursorRow}, D00596=${cursorCol} ---`);
  const { executor, cpu, memory } = bootMachine();
  console.log(`Boot complete. PC=${h24(cpu.pc)}`);

  // Set cursor position
  memory[0xd00595] = cursorRow & 0xff;
  memory[0xd00596] = cursorCol & 0xff;

  // Prefill VRAM with 0x00 so any writes are visible
  memory.fill(0x00, VRAM_START, VRAM_START + VRAM_SIZE);

  const before = snapshotVRAM(memory);

  // Set up the call
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_ADDR;
  push24(cpu, memory, RETURN_SENTINEL);

  let stoppedBySentinel = false;
  let result;
  try {
    result = executor.runFrom(DRAW_ADDR, 'adl', {
      maxSteps: MAX_CALL_STEPS,
      maxLoopIterations: 500,
    });
    stoppedBySentinel = cpu.pc === RETURN_SENTINEL || cpu.pc === (RETURN_SENTINEL & 0xFFFF);
  } catch (error) {
    console.log(`Execution error: ${error.stack ?? error.message}`);
    result = { steps: '?', reason: 'error' };
  }

  const after = snapshotVRAM(memory);
  const diff = diffVRAM(before, after);
  const steps = result?.steps ?? '?';
  console.log(`Stopped at PC=${h24(cpu.pc)} after ${steps} steps (${stoppedBySentinel ? 'return sentinel reached' : `reason=${result?.reason ?? 'unknown'}`}).`);
  console.log(`Changed VRAM bytes: ${diff.changed}`);
  if (diff.bbox) {
    const width = diff.bbox.maxCol - diff.bbox.minCol + 1;
    const height = diff.bbox.maxRow - diff.bbox.minRow + 1;
    console.log(`Bounding box: rows ${diff.bbox.minRow}-${diff.bbox.maxRow}, cols ${diff.bbox.minCol}-${diff.bbox.maxCol} (${width} x ${height})`);
    console.log(`Top written values: ${topValues(diff.valueCounts)}`);
  } else {
    console.log('Bounding box: no VRAM changes');
  }

  return { label, cursorRow, cursorCol, steps, stoppedBySentinel, ...diff };
}

function compareMovement(results) {
  console.log('\n=== Part 3 Summary: Cursor movement check ===');
  for (const result of results) {
    if (!result.bbox) {
      console.log(`Test ${result.label}: no changed region`);
      continue;
    }
    console.log(
      `Test ${result.label}: cursor=(${result.cursorRow},${result.cursorCol}) ` +
        `bbox rows ${result.bbox.minRow}-${result.bbox.maxRow}, cols ${result.bbox.minCol}-${result.bbox.maxCol}`,
    );
  }

  const boxes = results.filter((result) => result.bbox);
  if (boxes.length < 2) {
    console.log('Movement verdict: INCONCLUSIVE - fewer than two tests changed VRAM.');
    return;
  }

  const signatures = new Set(
    boxes.map((result) => `${result.bbox.minRow},${result.bbox.maxRow},${result.bbox.minCol},${result.bbox.maxCol}`),
  );
  const moves = signatures.size > 1;
  const monotonicRows = boxes.every((result, index) => index === 0 || result.bbox.minRow >= boxes[index - 1].bbox.minRow);
  const monotonicCols = boxes.every((result, index) => index === 0 || result.bbox.minCol >= boxes[index - 1].bbox.minCol);

  if (moves && monotonicRows && monotonicCols) {
    console.log('Movement verdict: YES - the changed VRAM region moves with increasing cursor row/col.');
  } else if (moves) {
    console.log('Movement verdict: PARTIAL - changed regions differ, but not monotonically with the tested cursor positions.');
  } else {
    console.log('Movement verdict: NO - all changed regions have the same bounding box.');
  }
}

const romPath = new URL('./ROM.rom', import.meta.url);
const rom = fs.readFileSync(romPath);
console.log(`Loaded ROM.rom: ${rom.length} bytes`);

printDisassembly(rom);
findCallers(rom);

console.log('\n=== Part 3: Dynamic VRAM tests for 0x06029D ===');
const results = [
  runDrawTest('A', 0, 0),
  runDrawTest('B', 5, 13),
  runDrawTest('C', 9, 25),
];
compareMovement(results);

process.exit(0);
