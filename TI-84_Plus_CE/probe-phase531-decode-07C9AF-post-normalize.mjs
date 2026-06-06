import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(n, w = 2) {
    return (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function signed8(n) {
    return n < 0x80 ? n : n - 0x100;
}

function rom8(a) {
    return rom[a];
}

function rom16(a) {
    return rom[a] | (rom[a + 1] << 8);
}

function rom24(a) {
    return rom[a] | (rom[a + 1] << 8) | (rom[a + 2] << 16);
}

function relTarget(pc, off) {
    return (pc + 2 + signed8(off)) & 0xFFFFFF;
}

function fmt24(a) {
    return `0x${hex(a, 6)}`;
}

function fmtDisp(d) {
    const s = signed8(d);
    return s < 0 ? `-${hex(-s)}` : `+${hex(s)}`;
}

const START = 0x07C9AF;
const LEN = 200;
const END = START + LEN;
const SIGN_NORMALIZE = 0x07C9E1;

const calls = [];
const branches = [];
const ramRefs = [];
const boundaries = [
    { addr: START, label: 'entry: 0x07C9AF post-normalize dispatch' },
    { addr: SIGN_NORMALIZE, label: 'known entry: 0x07C9E1 sign normalization' },
];

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function noteCall(from, target) {
    calls.push({ from, target });
}

function noteBranch(from, target, kind) {
    branches.push({ from, target, kind });
}

function noteRamRef(from, target, access) {
    ramRefs.push({ from, target, access });
}

function decodeCB(pc) {
    const op = rom8(pc + 1);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    if (x === 0) return { len: 2, text: `${rot[y]} ${r[z]}` };
    if (x === 1) return { len: 2, text: `BIT ${y},${r[z]}` };
    if (x === 2) return { len: 2, text: `RES ${y},${r[z]}` };
    return { len: 2, text: `SET ${y},${r[z]}` };
}

function decodeED(pc) {
    const op = rom8(pc + 1);
    const lo = op & 7;
    const hi = op >> 3;
    if (op === 0x44) return { len: 2, text: 'NEG' };
    if (op === 0x45) return { len: 2, text: 'RETN' };
    if (op === 0x47) return { len: 2, text: 'LD I,A' };
    if (op === 0x4D) return { len: 2, text: 'RETI' };
    if (op === 0x4F) return { len: 2, text: 'LD R,A' };
    if (op === 0x57) return { len: 2, text: 'LD A,I' };
    if (op === 0x5F) return { len: 2, text: 'LD A,R' };
    if (op === 0x67) return { len: 2, text: 'RRD' };
    if (op === 0x6F) return { len: 2, text: 'RLD' };
    if (op >= 0x40 && op <= 0x7F) {
        const reg = r[hi & 7];
        if (lo === 0) return { len: 2, text: `IN ${reg},(C)` };
        if (lo === 1) return { len: 2, text: `OUT (C),${reg}` };
        if (lo === 2) return { len: 2, text: `${(hi & 1) ? 'ADC' : 'SBC'} HL,${rp[(hi >> 1) & 3]}` };
        if (lo === 3) {
            const addr = rom24(pc + 2);
            noteRamRef(pc, addr, (hi & 1) ? `LD ${rp[(hi >> 1) & 3]},(addr24)` : `LD (addr24),${rp[(hi >> 1) & 3]}`);
            return { len: 5, text: `${(hi & 1) ? `LD ${rp[(hi >> 1) & 3]},(${fmt24(addr)})` : `LD (${fmt24(addr)}),${rp[(hi >> 1) & 3]}`}` };
        }
    }
    return { len: 2, text: `ED ${hex(op)} ; unknown/undecoded` };
}

function decodeIndex(pc, prefix, name) {
    const op = rom8(pc + 1);
    if (op === 0xCB) {
        const disp = rom8(pc + 2);
        const cb = rom8(pc + 3);
        const x = cb >> 6;
        const y = (cb >> 3) & 7;
        const z = cb & 7;
        const mem = `(${name}${fmtDisp(disp)})`;
        const target = z === 6 ? mem : `${mem},${r[z]}`;
        if (x === 0) return { len: 4, text: `${rot[y]} ${target}` };
        if (x === 1) return { len: 4, text: `BIT ${y},${mem}` };
        if (x === 2) return { len: 4, text: `RES ${y},${target}` };
        return { len: 4, text: `SET ${y},${target}` };
    }
    const indexByteRegs = prefix === 0xDD
        ? new Map([[0x24, 'IXH'], [0x25, 'IXH'], [0x26, 'IXH'], [0x2C, 'IXL'], [0x2D, 'IXL'], [0x2E, 'IXL']])
        : new Map([[0x24, 'IYH'], [0x25, 'IYH'], [0x26, 'IYH'], [0x2C, 'IYL'], [0x2D, 'IYL'], [0x2E, 'IYL']]);
    if (op === 0x21) return { len: 5, text: `LD ${name},${fmt24(rom24(pc + 2))}` };
    if (op === 0x22) {
        const addr = rom24(pc + 2);
        noteRamRef(pc, addr, `LD (addr24),${name}`);
        return { len: 5, text: `LD (${fmt24(addr)}),${name}` };
    }
    if (op === 0x2A) {
        const addr = rom24(pc + 2);
        noteRamRef(pc, addr, `LD ${name},(addr24)`);
        return { len: 5, text: `LD ${name},(${fmt24(addr)})` };
    }
    if (op === 0x23) return { len: 2, text: `INC ${name}` };
    if (op === 0x2B) return { len: 2, text: `DEC ${name}` };
    if (op === 0x34 || op === 0x35) return { len: 3, text: `${op === 0x34 ? 'INC' : 'DEC'} (${name}${fmtDisp(rom8(pc + 2))})` };
    if (op === 0x36) return { len: 4, text: `LD (${name}${fmtDisp(rom8(pc + 2))}),0x${hex(rom8(pc + 3))}` };
    if (indexByteRegs.has(op)) {
        const reg = indexByteRegs.get(op);
        if ((op & 0x07) === 0x04) return { len: 2, text: `INC ${reg}` };
        if ((op & 0x07) === 0x05) return { len: 2, text: `DEC ${reg}` };
        return { len: 3, text: `LD ${reg},0x${hex(rom8(pc + 2))}` };
    }
    if ((op & 0xC7) === 0x46) return { len: 3, text: `LD ${r[(op >> 3) & 7]},(${name}${fmtDisp(rom8(pc + 2))})` };
    if ((op & 0xF8) === 0x70) return { len: 3, text: `LD (${name}${fmtDisp(rom8(pc + 2))}),${r[op & 7]}` };
    if ((op & 0xC7) === 0x86) return { len: 3, text: `${alu[(op >> 3) & 7]} (${name}${fmtDisp(rom8(pc + 2))})` };
    return decodeBase(pc + 1, `${hex(prefix)} prefix fallback`, 1);
}

function decodeBase(pc, prefixNote = '', prefixLen = 0) {
    const op = rom8(pc);
    if (op === 0x00) return { len: 1 + prefixLen, text: `${prefixNote ? `${prefixNote}; ` : ''}NOP` };
    if (op === 0x08) return { len: 1 + prefixLen, text: 'EX AF,AF\'' };
    if (op === 0x10) {
        const target = relTarget(pc, rom8(pc + 1));
        noteBranch(pc - prefixLen, target, 'DJNZ');
        return { len: 2 + prefixLen, text: `DJNZ ${fmt24(target)}` };
    }
    if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
        const names = new Map([[0x18, 'JR'], [0x20, 'JR NZ'], [0x28, 'JR Z'], [0x30, 'JR NC'], [0x38, 'JR C']]);
        const target = relTarget(pc, rom8(pc + 1));
        noteBranch(pc - prefixLen, target, names.get(op));
        return { len: 2 + prefixLen, text: `${names.get(op)} ${fmt24(target)}` };
    }
    if ((op & 0xCF) === 0x01) return { len: 4 + prefixLen, text: `LD ${rp[(op >> 4) & 3]},${fmt24(rom24(pc + 1))}` };
    if ((op & 0xCF) === 0x03) return { len: 1 + prefixLen, text: `INC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x0B) return { len: 1 + prefixLen, text: `DEC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0x04) return { len: 1 + prefixLen, text: `INC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x05) return { len: 1 + prefixLen, text: `DEC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x06) return { len: 2 + prefixLen, text: `LD ${r[(op >> 3) & 7]},0x${hex(rom8(pc + 1))}` };
    if (op === 0x07) return { len: 1 + prefixLen, text: 'RLCA' };
    if (op === 0x0F) return { len: 1 + prefixLen, text: 'RRCA' };
    if (op === 0x17) return { len: 1 + prefixLen, text: 'RLA' };
    if (op === 0x1F) return { len: 1 + prefixLen, text: 'RRA' };
    if (op === 0x27) return { len: 1 + prefixLen, text: 'DAA' };
    if (op === 0x2F) return { len: 1 + prefixLen, text: 'CPL' };
    if (op === 0x37) return { len: 1 + prefixLen, text: 'SCF' };
    if (op === 0x3F) return { len: 1 + prefixLen, text: 'CCF' };
    if (op === 0x22 || op === 0x2A || op === 0x32 || op === 0x3A) {
        const addr = rom24(pc + 1);
        const text = {
            0x22: `LD (${fmt24(addr)}),HL`,
            0x2A: `LD HL,(${fmt24(addr)})`,
            0x32: `LD (${fmt24(addr)}),A`,
            0x3A: `LD A,(${fmt24(addr)})`,
        }[op];
        noteRamRef(pc - prefixLen, addr, text);
        return { len: 4 + prefixLen, text };
    }
    if (op >= 0x40 && op <= 0x7F) {
        if (op === 0x76) return { len: 1 + prefixLen, text: 'HALT' };
        return { len: 1 + prefixLen, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
    }
    if (op >= 0x80 && op <= 0xBF) return { len: 1 + prefixLen, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}` };
    if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(op)) return { len: 1 + prefixLen, text: `RET ${cc[(op >> 3) & 7]}` };
    if (op === 0xC9) return { len: 1 + prefixLen, text: 'RET' };
    if ((op & 0xC7) === 0xC2) {
        const target = rom24(pc + 1);
        noteBranch(pc - prefixLen, target, `JP ${cc[(op >> 3) & 7]}`);
        return { len: 4 + prefixLen, text: `JP ${cc[(op >> 3) & 7]},${fmt24(target)}` };
    }
    if (op === 0xC3) {
        const target = rom24(pc + 1);
        noteBranch(pc - prefixLen, target, 'JP');
        return { len: 4 + prefixLen, text: `JP ${fmt24(target)}` };
    }
    if ((op & 0xC7) === 0xC4) {
        const target = rom24(pc + 1);
        noteCall(pc - prefixLen, target);
        return { len: 4 + prefixLen, text: `CALL ${cc[(op >> 3) & 7]},${fmt24(target)}` };
    }
    if (op === 0xCD) {
        const target = rom24(pc + 1);
        noteCall(pc - prefixLen, target);
        return { len: 4 + prefixLen, text: `CALL ${fmt24(target)}` };
    }
    if ((op & 0xC7) === 0xC7) return { len: 1 + prefixLen, text: `RST 0x${hex(op & 0x38)}` };
    if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) return { len: 2 + prefixLen, text: `${alu[(op >> 3) & 7]} 0x${hex(rom8(pc + 1))}` };
    if (op === 0xD3) return { len: 2 + prefixLen, text: `OUT (0x${hex(rom8(pc + 1))}),A` };
    if (op === 0xDB) return { len: 2 + prefixLen, text: `IN A,(0x${hex(rom8(pc + 1))})` };
    if (op === 0xE3) return { len: 1 + prefixLen, text: 'EX (SP),HL' };
    if (op === 0xE9) return { len: 1 + prefixLen, text: 'JP (HL)' };
    if (op === 0xEB) return { len: 1 + prefixLen, text: 'EX DE,HL' };
    if (op === 0xF3) return { len: 1 + prefixLen, text: 'DI' };
    if (op === 0xF9) return { len: 1 + prefixLen, text: 'LD SP,HL' };
    if (op === 0xFB) return { len: 1 + prefixLen, text: 'EI' };
    if (op === 0xED) return decodeED(pc);
    if (op === 0xCB) return decodeCB(pc);
    if (op === 0xDD) return decodeIndex(pc, op, 'IX');
    if (op === 0xFD) return decodeIndex(pc, op, 'IY');
    if (op === 0xAF) return { len: 1 + prefixLen, text: 'XOR A' };
    if (op === 0xB7) return { len: 1 + prefixLen, text: 'OR A' };
    return { len: 1 + prefixLen, text: `${prefixNote ? `${prefixNote}; ` : ''}DB 0x${hex(op)} ; unknown/undecoded` };
}

function decode(pc) {
    return decodeBase(pc);
}

console.log(`=== Decoding ${fmt24(START)} (${LEN} bytes, through ${fmt24(END - 1)}) ===`);
console.log(`Known boundary hint: ${fmt24(SIGN_NORMALIZE)} is the nearby sign-normalization entry.`);

let pc = START;
while (pc < END) {
    for (const boundary of boundaries.filter((b) => b.addr === pc)) {
        console.log('');
        console.log(`--- ${boundary.label} ---`);
    }

    const startPc = pc;
    const ins = decode(pc);
    const bytes = [];
    for (let i = 0; i < ins.len && startPc + i < rom.length; i++) bytes.push(rom8(startPc + i));
    const hexStr = bytes.map((b) => hex(b)).join(' ');
    console.log(`${fmt24(startPc)}: ${hexStr.padEnd(20)} ${ins.text}`);

    if (ins.text === 'RET' || ins.text.startsWith('RET ') || ins.text.startsWith('JP ')) {
        console.log('--- potential function boundary after terminal/control-transfer instruction ---');
    }

    pc += Math.max(1, ins.len);
}

console.log('');
console.log('=== Summary: function boundary candidates ===');
for (const boundary of boundaries) {
    console.log(`${fmt24(boundary.addr)} ${boundary.label}`);
}
console.log('Look for terminal RET/JP markers above to distinguish the 0x07C9AF body from the 0x07C9E1 entry.');

console.log('');
console.log('=== Summary: CALL targets ===');
if (calls.length === 0) {
    console.log('(none decoded in range)');
} else {
    for (const call of calls) console.log(`${fmt24(call.from)} -> ${fmt24(call.target)}`);
}

console.log('');
console.log('=== Summary: branches/jumps ===');
if (branches.length === 0) {
    console.log('(none decoded in range)');
} else {
    for (const branch of branches) console.log(`${fmt24(branch.from)} ${branch.kind} -> ${fmt24(branch.target)}`);
}

console.log('');
console.log('=== Summary: absolute RAM/ROM references ===');
if (ramRefs.length === 0) {
    console.log('(none decoded in range)');
} else {
    for (const ref of ramRefs) console.log(`${fmt24(ref.from)} ${ref.access} ${fmt24(ref.target)}`);
}
