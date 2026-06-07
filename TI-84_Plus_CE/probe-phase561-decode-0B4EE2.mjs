import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const startAddr = 0x0B4EE2;
const maxLen = 150;
const bytes = rom.slice(startAddr, startAddr + maxLen);

const ramReads = new Set();
const ramWrites = new Set();
const callTargets = new Set();
const branchTargets = new Set();
const notes = [];

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const immAddrOps = {
    0x32: 'LD ({addr}),A',
    0x3A: 'LD A,({addr})',
};

function hex(value, width = 2) {
    return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
    return value & 0x80 ? value - 0x100 : value;
}

function u16(buf, off) {
    return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8);
}

function u24(buf, off) {
    return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8) | ((buf[off + 2] ?? 0) << 16);
}

function fmtBytes(buf, off, len) {
    return Array.from(buf.slice(off, Math.min(off + len, buf.length)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
}

function memKind(addr) {
    if (addr === 0xD0059C) return 'framebuffer write pointer D0059C';
    if (addr === 0x08D2) return 'clip X / cursor column (SIS)';
    if (addr === 0x017F) return 'width limit (SIS)';
    if (addr >= 0xD00000 && addr <= 0xD3FFFF) return 'RAM';
    if (addr < 0x10000) return 'SIS/Z80-space RAM or ROM address';
    return 'absolute address';
}

function trackRead(addr) {
    ramReads.add(`${hex(addr, addr > 0xFFFF ? 6 : 4)} (${memKind(addr)})`);
}

function trackWrite(addr) {
    ramWrites.add(`${hex(addr, addr > 0xFFFF ? 6 : 4)} (${memKind(addr)})`);
}

function decodeCB(op, indexed = null, disp = null) {
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const target = indexed && z === 6 ? `(${indexed}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})` : regs8[z];
    const writeBack = indexed && z !== 6 ? `, ${regs8[z]}` : '';

    if (x === 0) return `${rot[y]} ${target}${writeBack}`;
    if (x === 1) return `BIT ${y},${target}`;
    if (x === 2) return `RES ${y},${target}${writeBack}`;
    return `SET ${y},${target}${writeBack}`;
}

function decodeED(buf, pc, off, sis) {
    const op = buf[off + 1] ?? 0;
    const prefix = sis ? '.SIS ' : '';
    const addrWidth = sis ? 2 : 3;
    const readAddr = at => sis ? u16(buf, at) : u24(buf, at);
    const fullAddrWidth = sis ? 4 : 6;

    const block = {
        0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
        0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
        0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
        0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
    };
    if (block[op]) return { len: 2, text: `${prefix}${block[op]}` };

    if ((op & 0xC7) === 0x43) {
        const addr = readAddr(off + 2);
        const reg = rp[(op >> 4) & 3];
        trackWrite(addr);
        return { len: 2 + addrWidth, text: `${prefix}LD (${hex(addr, fullAddrWidth)}),${reg}` };
    }
    if ((op & 0xC7) === 0x4B) {
        const addr = readAddr(off + 2);
        const reg = rp[(op >> 4) & 3];
        trackRead(addr);
        return { len: 2 + addrWidth, text: `${prefix}LD ${reg},(${hex(addr, fullAddrWidth)})` };
    }

    const simple = {
        0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
        0x4D: 'RETI', 0x4F: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I',
        0x5E: 'IM 2', 0x5F: 'LD A,R', 0x67: 'RRD', 0x6F: 'RLD',
    };
    if (simple[op]) return { len: 2, text: `${prefix}${simple[op]}` };
    return { len: 2, text: `${prefix}ED ${hex(op)} ; unhandled/extended eZ80 opcode` };
}

function decodeIndexed(buf, pc, off, ixReg) {
    const op = buf[off + 1] ?? 0;
    const rr = ixReg;
    const hi = ixReg === 'IX' ? 'IXH' : 'IYH';
    const lo = ixReg === 'IX' ? 'IXL' : 'IYL';
    const regName = r => r === 'H' ? hi : r === 'L' ? lo : r;
    const idxRegs = ['B', 'C', 'D', 'E', hi, lo, `(${rr}+d)`, 'A'];

    if (op === 0xCB) {
        const disp = signed8(buf[off + 2] ?? 0);
        return { len: 4, text: decodeCB(buf[off + 3] ?? 0, rr, disp) };
    }
    if (op === 0x21) return { len: 5, text: `LD ${rr},${hex(u24(buf, off + 2), 6)}` };
    if (op === 0x22) {
        const addr = u24(buf, off + 2);
        trackWrite(addr);
        return { len: 5, text: `LD (${hex(addr, 6)}),${rr}` };
    }
    if (op === 0x2A) {
        const addr = u24(buf, off + 2);
        trackRead(addr);
        return { len: 5, text: `LD ${rr},(${hex(addr, 6)})` };
    }
    if (op === 0xE5) return { len: 2, text: `PUSH ${rr}` };
    if (op === 0xE1) return { len: 2, text: `POP ${rr}` };
    if (op === 0xE9) return { len: 2, text: `JP (${rr})` };
    if (op === 0xF9) return { len: 2, text: `LD SP,${rr}` };
    if ([0x23, 0x2B, 0x24, 0x25, 0x2C, 0x2D].includes(op)) {
        const map = { 0x23: `INC ${rr}`, 0x2B: `DEC ${rr}`, 0x24: `INC ${hi}`, 0x25: `DEC ${hi}`, 0x2C: `INC ${lo}`, 0x2D: `DEC ${lo}` };
        return { len: 2, text: map[op] };
    }
    if (op === 0x36) return { len: 4, text: `LD (${rr}${signed8(buf[off + 2]) < 0 ? '-' : '+'}${hex(Math.abs(signed8(buf[off + 2])))}),${hex(buf[off + 3] ?? 0)}` };
    if ((op & 0xC0) === 0x40 && op !== 0x76) {
        const dst = (op >> 3) & 7;
        const src = op & 7;
        if (dst === 6 || src === 6) {
            const disp = signed8(buf[off + 2] ?? 0);
            return { len: 3, text: `LD ${idxRegs[dst].replace('+d', `${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))}`)},${idxRegs[src].replace('+d', `${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))}`)}` };
        }
        return { len: 2, text: `LD ${regName(regs8[dst])},${regName(regs8[src])}` };
    }
    if ((op & 0xC7) === 0x46) {
        const disp = signed8(buf[off + 2] ?? 0);
        return { len: 3, text: `LD ${regs8[(op >> 3) & 7]},(${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})` };
    }
    if ((op & 0xF8) === 0x70) {
        const disp = signed8(buf[off + 2] ?? 0);
        return { len: 3, text: `LD (${rr}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))}),${regs8[op & 7]}` };
    }
    return { len: 2, text: `${ixReg === 'IX' ? 'DD' : 'FD'} ${hex(op)} ; unhandled indexed opcode` };
}

function decode(buf, pc, off) {
    let op = buf[off] ?? 0;
    let sis = false;

    if (op === 0x40 && off + 1 < buf.length) {
        sis = true;
        op = buf[off + 1];
    }

    const base = sis ? 1 : 0;
    const prefix = sis ? '.SIS ' : '';
    const addrWidth = sis ? 2 : 3;
    const addrFmtWidth = sis ? 4 : 6;
    const readAddr = at => sis ? u16(buf, at) : u24(buf, at);

    if (op === 0xCB) return { len: base + 2, text: `${prefix}${decodeCB(buf[off + base + 1] ?? 0)}` };
    if (op === 0xED) {
        const dec = decodeED(buf, pc, off + base, sis);
        return { len: base + dec.len, text: dec.text };
    }
    if (!sis && (op === 0xDD || op === 0xFD)) return decodeIndexed(buf, pc, off, op === 0xDD ? 'IX' : 'IY');

    const immAt = off + base + 1;
    const wordAt = off + base + 1;
    const relTarget = () => (pc + base + 2 + signed8(buf[immAt] ?? 0)) & 0xFFFFFF;

    if (op === 0x00) return { len: base + 1, text: `${prefix}NOP` };
    if (op === 0x76) return { len: base + 1, text: `${prefix}HALT` };
    if (op === 0xC9) return { len: base + 1, text: `${prefix}RET`, boundary: true };
    if (op === 0xD9) return { len: base + 1, text: `${prefix}EXX` };
    if (op === 0xE3) return { len: base + 1, text: `${prefix}EX (SP),HL` };
    if (op === 0xEB) return { len: base + 1, text: `${prefix}EX DE,HL` };
    if (op === 0xF3) return { len: base + 1, text: `${prefix}DI` };
    if (op === 0xFB) return { len: base + 1, text: `${prefix}EI` };

    if ((op & 0xC7) === 0x04) return { len: base + 1, text: `${prefix}INC ${regs8[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x05) return { len: base + 1, text: `${prefix}DEC ${regs8[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x06) return { len: base + 2, text: `${prefix}LD ${regs8[(op >> 3) & 7]},${hex(buf[immAt] ?? 0)}` };
    if ((op & 0xCF) === 0x01) return { len: base + 1 + addrWidth, text: `${prefix}LD ${rp[(op >> 4) & 3]},${hex(readAddr(wordAt), addrFmtWidth)}` };
    if ((op & 0xCF) === 0x03) return { len: base + 1, text: `${prefix}INC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x0B) return { len: base + 1, text: `${prefix}DEC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x09) return { len: base + 1, text: `${prefix}ADD HL,${rp[(op >> 4) & 3]}` };
    if ((op & 0xC0) === 0x40) return { len: base + 1, text: `${prefix}LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}` };
    if ((op & 0xC7) === 0xC0) return { len: base + 1, text: `${prefix}RET ${cc[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0xC2) {
        const target = readAddr(wordAt);
        branchTargets.add(hex(target, addrFmtWidth));
        return { len: base + 1 + addrWidth, text: `${prefix}JP ${cc[(op >> 3) & 7]},${hex(target, addrFmtWidth)}` };
    }
    if ((op & 0xC7) === 0xC4) {
        const target = readAddr(wordAt);
        callTargets.add(hex(target, addrFmtWidth));
        return { len: base + 1 + addrWidth, text: `${prefix}CALL ${cc[(op >> 3) & 7]},${hex(target, addrFmtWidth)}` };
    }
    if ((op & 0xC7) === 0xC6) return { len: base + 2, text: `${prefix}${alu[(op >> 3) & 7]} ${hex(buf[immAt] ?? 0)}` };
    if ((op & 0xC7) === 0xC7) return { len: base + 1, text: `${prefix}RST ${hex(op & 0x38)}` };
    if ((op & 0xCF) === 0xC1) return { len: base + 1, text: `${prefix}POP ${rp2[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0xC5) return { len: base + 1, text: `${prefix}PUSH ${rp2[(op >> 4) & 3]}` };
    if ((op & 0xF8) === 0x80) return { len: base + 1, text: `${prefix}${alu[(op >> 3) & 7]} ${regs8[op & 7]}` };

    if (op === 0x02) return { len: base + 1, text: `${prefix}LD (BC),A` };
    if (op === 0x0A) return { len: base + 1, text: `${prefix}LD A,(BC)` };
    if (op === 0x12) return { len: base + 1, text: `${prefix}LD (DE),A` };
    if (op === 0x1A) return { len: base + 1, text: `${prefix}LD A,(DE)` };
    if (op === 0x07) return { len: base + 1, text: `${prefix}RLCA` };
    if (op === 0x0F) return { len: base + 1, text: `${prefix}RRCA` };
    if (op === 0x17) return { len: base + 1, text: `${prefix}RLA` };
    if (op === 0x1F) return { len: base + 1, text: `${prefix}RRA` };
    if (op === 0x22 || op === 0x2A) {
        const addr = readAddr(wordAt);
        if (op === 0x22) trackWrite(addr); else trackRead(addr);
        return { len: base + 1 + addrWidth, text: `${prefix}LD ${op === 0x22 ? `(${hex(addr, addrFmtWidth)}),HL` : `HL,(${hex(addr, addrFmtWidth)})`}` };
    }
    if (immAddrOps[op]) {
        const addr = readAddr(wordAt);
        if (op === 0x32) trackWrite(addr); else trackRead(addr);
        return { len: base + 1 + addrWidth, text: `${prefix}${immAddrOps[op].replace('{addr}', hex(addr, addrFmtWidth))}` };
    }
    if (op === 0x10) {
        const target = relTarget();
        branchTargets.add(hex(target, 6));
        return { len: base + 2, text: `${prefix}DJNZ ${hex(target, 6)} (${signed8(buf[immAt] ?? 0)})` };
    }
    if (op === 0x18 || [0x20, 0x28, 0x30, 0x38].includes(op)) {
        const target = relTarget();
        branchTargets.add(hex(target, 6));
        const m = op === 0x18 ? 'JR' : `JR ${cc[(op >> 3) & 3]},`;
        return { len: base + 2, text: `${prefix}${m}${op === 0x18 ? ' ' : ''}${hex(target, 6)} (${signed8(buf[immAt] ?? 0)})` };
    }
    if (op === 0xC3) {
        const target = readAddr(wordAt);
        branchTargets.add(hex(target, addrFmtWidth));
        return { len: base + 1 + addrWidth, text: `${prefix}JP ${hex(target, addrFmtWidth)}`, boundary: true };
    }
    if (op === 0xCD) {
        const target = readAddr(wordAt);
        callTargets.add(hex(target, addrFmtWidth));
        return { len: base + 1 + addrWidth, text: `${prefix}CALL ${hex(target, addrFmtWidth)}` };
    }
    if (op === 0xE9) return { len: base + 1, text: `${prefix}JP (HL)`, boundary: true };

    return { len: base + 1, text: `${prefix}DB ${hex(op)} ; unknown opcode` };
}

console.log(`=== Decoding 0x0B4EE2: Partial-Clip Blit ===`);
console.log(`Bytes at 0x${startAddr.toString(16)}:`);

for (let i = 0; i < bytes.length; i += 16) {
    const addr = startAddr + i;
    const hexLine = Array.from(bytes.slice(i, Math.min(i + 16, bytes.length)))
        .map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hexLine}`);
}

console.log(`\n=== Disassembly ===`);

let off = 0;
let boundary = null;
while (off < bytes.length) {
    const pc = startAddr + off;
    const ins = decode(bytes, pc, off);
    console.log(`${pc.toString(16).padStart(6, '0')}: ${fmtBytes(bytes, off, ins.len).padEnd(16)} ${ins.text}`);

    if (/LD \((?:0x)?D0059C\),/i.test(ins.text) || /LD .*,\((?:0x)?D0059C\)/i.test(ins.text)) {
        notes.push(`D0059C access at ${hex(pc, 6)}: ${ins.text}`);
    }
    if (/\(HL\)|\(DE\)|\(BC\)|LDIR|LDI|LDDR|LDD/.test(ins.text)) {
        notes.push(`Possible blit/pointer operation at ${hex(pc, 6)}: ${ins.text}`);
    }
    if (/0x0280|0x280/i.test(ins.text)) {
        notes.push(`Framebuffer stride-sized constant near ${hex(pc, 6)}: ${ins.text}`);
    }

    off += Math.max(ins.len, 1);
    if (ins.boundary) {
        boundary = startAddr + off;
        break;
    }
}

if (!boundary) {
    boundary = startAddr + off;
    console.log(`; No unconditional RET/JP boundary found within ${maxLen} bytes.`);
}

console.log(`\n=== Summary ===`);
console.log(`Function start: ${hex(startAddr, 6)}`);
console.log(`Decoded through: ${hex(boundary, 6)} (${boundary - startAddr} bytes)`);
console.log(`Boundary: ${boundary - startAddr < maxLen ? 'clear RET/JP reached' : 'not reached in probe window'}`);
console.log(`CALL targets: ${callTargets.size ? Array.from(callTargets).join(', ') : 'none observed'}`);
console.log(`Branch targets: ${branchTargets.size ? Array.from(branchTargets).join(', ') : 'none observed'}`);
console.log(`RAM/absolute reads: ${ramReads.size ? Array.from(ramReads).join(', ') : 'none decoded as direct absolute reads'}`);
console.log(`RAM/absolute writes: ${ramWrites.size ? Array.from(ramWrites).join(', ') : 'none decoded as direct absolute writes'}`);

console.log(`\n=== Architectural Notes ===`);
if (notes.length) {
    for (const note of notes) console.log(`- ${note}`);
} else {
    console.log('- No obvious direct framebuffer pointer or block-copy opcode was decoded in the scanned window.');
}
console.log('- Interpret indirect writes through (HL), (DE), or indexed memory against caller-provided D0059C state from 0x025C33.');
console.log('- .SIS-prefixed direct operands are decoded as 16-bit addresses; ADL CALL/JP/LD absolute operands are decoded as 24-bit addresses.');
