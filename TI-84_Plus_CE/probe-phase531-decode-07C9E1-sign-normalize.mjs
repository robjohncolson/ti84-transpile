import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(n, w = 2) {
    return n.toString(16).toUpperCase().padStart(w, '0');
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

function signed8(n) {
    return n & 0x80 ? n - 0x100 : n;
}

function relTarget(pc, disp) {
    return (pc + 2 + signed8(disp)) & 0xFFFFFF;
}

function addr24(a) {
    return `0x${hex(a, 6)}`;
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function readBytes(pc, len) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(rom8(pc + i));
    return bytes;
}

function decodeCB(pc) {
    const op = rom8(pc + 1);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    let mnemonic;

    if (x === 0) mnemonic = `${rot[y]} ${r[z]}`;
    else if (x === 1) mnemonic = `BIT ${y},${r[z]}`;
    else if (x === 2) mnemonic = `RES ${y},${r[z]}`;
    else mnemonic = `SET ${y},${r[z]}`;

    return { len: 2, mnemonic };
}

function decodeED(pc) {
    const op = rom8(pc + 1);
    const y = (op >> 3) & 7;
    const z = op & 7;
    const p = y >> 1;
    const q = y & 1;

    const fixed = {
        0x44: 'NEG',
        0x45: 'RETN',
        0x46: 'IM 0',
        0x47: 'LD I,A',
        0x4D: 'RETI',
        0x4F: 'LD R,A',
        0x56: 'IM 1',
        0x57: 'LD A,I',
        0x5E: 'IM 2',
        0x5F: 'LD A,R',
        0x67: 'RRD',
        0x6F: 'RLD',
        0xA0: 'LDI',
        0xA1: 'CPI',
        0xA2: 'INI',
        0xA3: 'OUTI',
        0xA8: 'LDD',
        0xA9: 'CPD',
        0xAA: 'IND',
        0xAB: 'OUTD',
        0xB0: 'LDIR',
        0xB1: 'CPIR',
        0xB2: 'INIR',
        0xB3: 'OTIR',
        0xB8: 'LDDR',
        0xB9: 'CPDR',
        0xBA: 'INDR',
        0xBB: 'OTDR',
    };

    if (fixed[op]) return { len: 2, mnemonic: fixed[op] };

    if ((op & 0xC7) === 0x40) return { len: 2, mnemonic: `IN ${r[y]},(C)` };
    if ((op & 0xC7) === 0x41) return { len: 2, mnemonic: `OUT (C),${r[y]}` };
    if ((op & 0xCF) === 0x42) return { len: 2, mnemonic: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
    if ((op & 0xCF) === 0x43) {
        const a = rom24(pc + 2);
        return { len: 5, mnemonic: `${q ? 'LD ' + rp[p] + ',(' : 'LD ('}${addr24(a)}${q ? ')' : '),' + rp[p]}` };
    }

    return { len: 2, mnemonic: `DB ED ${hex(op)} ; unknown ED opcode` };
}

function decodeIndexCB(pc, index) {
    const d = rom8(pc + 2);
    const op = rom8(pc + 3);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const mem = `(${index}${signed8(d) < 0 ? '-' : '+'}${hex(Math.abs(signed8(d)))})`;
    let mnemonic;

    if (x === 0) mnemonic = `${rot[y]} ${mem}${z !== 6 ? ` -> ${r[z]}` : ''}`;
    else if (x === 1) mnemonic = `BIT ${y},${mem}`;
    else if (x === 2) mnemonic = `RES ${y},${mem}${z !== 6 ? ` -> ${r[z]}` : ''}`;
    else mnemonic = `SET ${y},${mem}${z !== 6 ? ` -> ${r[z]}` : ''}`;

    return { len: 4, mnemonic };
}

function decodeIndex(pc, index) {
    const op = rom8(pc + 1);
    const hi = index === 'IX' ? 'IXH' : 'IYH';
    const lo = index === 'IX' ? 'IXL' : 'IYL';
    const regs = ['B', 'C', 'D', 'E', hi, lo, `(${index}+d)`, 'A'];
    const indexRP = ['BC', 'DE', index, 'SP'];
    const indexRP2 = ['BC', 'DE', index, 'AF'];
    const y = (op >> 3) & 7;
    const z = op & 7;
    const p = y >> 1;
    const q = y & 1;

    if (op === 0xCB) return decodeIndexCB(pc, index);
    if (op === 0x21) return { len: 4, mnemonic: `LD ${index},0x${hex(rom16(pc + 2), 4)}` };
    if (op === 0x22) return { len: 5, mnemonic: `LD (${addr24(rom24(pc + 2))}),${index}` };
    if (op === 0x2A) return { len: 5, mnemonic: `LD ${index},(${addr24(rom24(pc + 2))})` };
    if (op === 0x23) return { len: 2, mnemonic: `INC ${index}` };
    if (op === 0x2B) return { len: 2, mnemonic: `DEC ${index}` };
    if (op === 0x34) return { len: 3, mnemonic: `INC (${index}${signed8(rom8(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(rom8(pc + 2))))})` };
    if (op === 0x35) return { len: 3, mnemonic: `DEC (${index}${signed8(rom8(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(rom8(pc + 2))))})` };
    if (op === 0x36) return { len: 4, mnemonic: `LD (${index}${signed8(rom8(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(rom8(pc + 2))))}),0x${hex(rom8(pc + 3))}` };
    if (op === 0xE1) return { len: 2, mnemonic: `POP ${index}` };
    if (op === 0xE3) return { len: 2, mnemonic: `EX (SP),${index}` };
    if (op === 0xE5) return { len: 2, mnemonic: `PUSH ${index}` };
    if (op === 0xE9) return { len: 2, mnemonic: `JP (${index})` };
    if (op === 0xF9) return { len: 2, mnemonic: `LD SP,${index}` };
    if ((op & 0xCF) === 0x09) return { len: 2, mnemonic: `ADD ${index},${indexRP[p]}` };
    if ((op & 0xC0) === 0x40 && op !== 0x76) {
        const dst = regs[y];
        const src = regs[z];
        const usesDisp = dst.includes('+d') || src.includes('+d');
        const d = usesDisp ? rom8(pc + 2) : 0;
        const disp = usesDisp ? `${index}${signed8(d) < 0 ? '-' : '+'}${hex(Math.abs(signed8(d)))}` : '';
        return {
            len: usesDisp ? 3 : 2,
            mnemonic: `LD ${dst.replace(`${index}+d`, disp)},${src.replace(`${index}+d`, disp)}`,
        };
    }
    if ((op & 0xC7) === 0x04) return { len: 2, mnemonic: `INC ${regs[y]}` };
    if ((op & 0xC7) === 0x05) return { len: 2, mnemonic: `DEC ${regs[y]}` };
    if ((op & 0xC7) === 0x06) {
        const usesDisp = regs[y].includes('+d');
        const d = usesDisp ? rom8(pc + 2) : 0;
        const disp = usesDisp ? `${index}${signed8(d) < 0 ? '-' : '+'}${hex(Math.abs(signed8(d)))}` : '';
        return {
            len: usesDisp ? 4 : 3,
            mnemonic: `LD ${regs[y].replace(`${index}+d`, disp)},0x${hex(rom8(pc + (usesDisp ? 3 : 2)))}`,
        };
    }
    if ((op & 0xF8) === 0x80) return { len: regs[z].includes('+d') ? 3 : 2, mnemonic: `${alu[y]} ${regs[z].replace(`${index}+d`, `${index}${signed8(rom8(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(rom8(pc + 2))))}`)}` };
    if ((op & 0xCF) === 0xC1) return { len: 2, mnemonic: `POP ${indexRP2[p]}` };
    if ((op & 0xCF) === 0xC5) return { len: 2, mnemonic: `PUSH ${indexRP2[p]}` };

    return { len: 2, mnemonic: `DB ${hex(rom8(pc))} ${hex(op)} ; unknown ${index} opcode` };
}

function decode(pc) {
    const op = rom8(pc);
    const y = (op >> 3) & 7;
    const z = op & 7;
    const p = y >> 1;
    const q = y & 1;

    const fixed = {
        0x00: 'NOP',
        0x02: 'LD (BC),A',
        0x07: 'RLCA',
        0x08: 'EX AF,AF\'',
        0x0A: 'LD A,(BC)',
        0x0F: 'RRCA',
        0x10: `DJNZ ${addr24(relTarget(pc, rom8(pc + 1)))}`,
        0x12: 'LD (DE),A',
        0x17: 'RLA',
        0x1A: 'LD A,(DE)',
        0x1F: 'RRA',
        0x22: `LD (${addr24(rom24(pc + 1))}),HL`,
        0x27: 'DAA',
        0x2A: `LD HL,(${addr24(rom24(pc + 1))})`,
        0x2F: 'CPL',
        0x32: `LD (${addr24(rom24(pc + 1))}),A`,
        0x37: 'SCF',
        0x3A: `LD A,(${addr24(rom24(pc + 1))})`,
        0x3F: 'CCF',
        0x76: 'HALT',
        0xC3: `JP ${addr24(rom24(pc + 1))}`,
        0xC9: 'RET',
        0xCD: `CALL ${addr24(rom24(pc + 1))}`,
        0xD3: `OUT (0x${hex(rom8(pc + 1))}),A`,
        0xD9: 'EXX',
        0xDB: `IN A,(0x${hex(rom8(pc + 1))})`,
        0xE3: 'EX (SP),HL',
        0xE9: 'JP (HL)',
        0xEB: 'EX DE,HL',
        0xF3: 'DI',
        0xF9: 'LD SP,HL',
        0xFB: 'EI',
    };

    if (op === 0xCB) return decodeCB(pc);
    if (op === 0xDD) return decodeIndex(pc, 'IX');
    if (op === 0xED) return decodeED(pc);
    if (op === 0xFD) return decodeIndex(pc, 'IY');

    if (op in fixed) {
        const len = [0x10, 0xD3, 0xDB].includes(op) ? 2 : ([0x22, 0x2A, 0x32, 0x3A, 0xC3, 0xCD].includes(op) ? 4 : 1);
        return { len, mnemonic: fixed[op] };
    }

    if ((op & 0xCF) === 0x01) return { len: 3, mnemonic: `LD ${rp[p]},0x${hex(rom16(pc + 1), 4)}` };
    if ((op & 0xCF) === 0x03) return { len: 1, mnemonic: `INC ${rp[p]}` };
    if ((op & 0xCF) === 0x09) return { len: 1, mnemonic: `ADD HL,${rp[p]}` };
    if ((op & 0xCF) === 0x0B) return { len: 1, mnemonic: `DEC ${rp[p]}` };
    if ((op & 0xC7) === 0x04) return { len: 1, mnemonic: `INC ${r[y]}` };
    if ((op & 0xC7) === 0x05) return { len: 1, mnemonic: `DEC ${r[y]}` };
    if ((op & 0xC7) === 0x06) return { len: 2, mnemonic: `LD ${r[y]},0x${hex(rom8(pc + 1))}` };

    if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
        const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[op];
        return { len: 2, mnemonic: `JR ${cond}${addr24(relTarget(pc, rom8(pc + 1)))}` };
    }

    if ((op & 0xC0) === 0x40) return { len: 1, mnemonic: `LD ${r[y]},${r[z]}` };
    if ((op & 0xF8) === 0x80) return { len: 1, mnemonic: `${alu[y]} ${r[z]}` };
    if ((op & 0xC7) === 0xC0) return { len: 1, mnemonic: `RET ${cc[y]}` };
    if ((op & 0xC7) === 0xC2) return { len: 4, mnemonic: `JP ${cc[y]},${addr24(rom24(pc + 1))}` };
    if ((op & 0xC7) === 0xC4) return { len: 4, mnemonic: `CALL ${cc[y]},${addr24(rom24(pc + 1))}` };
    if ((op & 0xCF) === 0xC1) return { len: 1, mnemonic: `POP ${rp2[p]}` };
    if ((op & 0xCF) === 0xC5) return { len: 1, mnemonic: `PUSH ${rp2[p]}` };
    if ((op & 0xC7) === 0xC6) return { len: 2, mnemonic: `${alu[y]} 0x${hex(rom8(pc + 1))}` };
    if ((op & 0xC7) === 0xC7) return { len: 1, mnemonic: `RST 0x${hex(y * 8)}` };

    return { len: 1, mnemonic: `DB ${hex(op)} ; unknown opcode` };
}

const START = 0x07C9E1;
const END = START + 200;

console.log(`=== Decoding 0x${hex(START, 6)} - 0x${hex(END, 6)} ===`);
console.log();
console.log('Notes:');
console.log('- eZ80 ADL mode uses 24-bit absolute JP/CALL/LD addresses in this ROM.');
console.log('- Relative branch targets are resolved from the next instruction address.');
console.log('- IY displacement values are displayed as hexadecimal signed offsets.');
console.log();

let pc = START;
while (pc < END) {
    const startPc = pc;
    const { len, mnemonic } = decode(pc);
    const bytes = readBytes(pc, len);
    const hexBytes = bytes.map((b) => hex(b)).join(' ');

    console.log(`0x${hex(startPc, 6)}: ${hexBytes.padEnd(20)} ${mnemonic}`);

    pc += len;

    if ((rom8(startPc) === 0xC9 || rom8(startPc) === 0xC3 || rom8(startPc) === 0xE9 || (rom8(startPc) === 0xDD && rom8(startPc + 1) === 0xE9) || (rom8(startPc) === 0xFD && rom8(startPc + 1) === 0xE9)) && startPc > START + 10) {
        console.log('--- possible function exit; continuing scan for nearby fall-through/targets ---');
    }
}
