import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(n, w = 2) {
    return (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function signed8(n) {
    return n & 0x80 ? n - 0x100 : n;
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

function bytesAt(pc, len) {
    const out = [];
    for (let i = 0; i < len; i++) out.push(hex(rom8(pc + i)));
    return out.join(' ').padEnd(14, ' ');
}

const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const conditions = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
const returns = { 0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C', 0xC9: 'RET' };
const pushes = { 0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF' };
const pops = { 0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF' };
const loads8 = {
    0x02: 'LD (BC),A',
    0x0A: 'LD A,(BC)',
    0x12: 'LD (DE),A',
    0x1A: 'LD A,(DE)',
    0x77: 'LD (HL),A',
    0x7E: 'LD A,(HL)',
    0x47: 'LD B,A',
    0x4F: 'LD C,A',
    0x57: 'LD D,A',
    0x5F: 'LD E,A',
    0x67: 'LD H,A',
    0x6F: 'LD L,A',
    0x78: 'LD A,B',
    0x79: 'LD A,C',
    0x7A: 'LD A,D',
    0x7B: 'LD A,E',
    0x7C: 'LD A,H',
    0x7D: 'LD A,L',
};
const incDec16 = {
    0x03: 'INC BC',
    0x0B: 'DEC BC',
    0x13: 'INC DE',
    0x1B: 'DEC DE',
    0x23: 'INC HL',
    0x2B: 'DEC HL',
};
const incDec8 = {
    0x04: 'INC B',
    0x05: 'DEC B',
    0x0C: 'INC C',
    0x0D: 'DEC C',
    0x14: 'INC D',
    0x15: 'DEC D',
    0x1C: 'INC E',
    0x1D: 'DEC E',
    0x24: 'INC H',
    0x25: 'DEC H',
    0x2C: 'INC L',
    0x2D: 'DEC L',
    0x34: 'INC (HL)',
    0x35: 'DEC (HL)',
    0x3C: 'INC A',
    0x3D: 'DEC A',
};
const misc = {
    0x00: 'NOP',
    0x07: 'RLCA',
    0x0F: 'RRCA',
    0x17: 'RLA',
    0x1F: 'RRA',
    0x27: 'DAA',
    0x2F: 'CPL',
    0x37: 'SCF',
    0x3F: 'CCF',
    0x76: 'HALT',
    0xA7: 'AND A',
    0xAF: 'XOR A',
    0xB7: 'OR A',
    0xC7: 'RST 00h',
    0xCF: 'RST 08h',
    0xD7: 'RST 10h',
    0xDF: 'RST 18h',
    0xE7: 'RST 20h',
    0xEF: 'RST 28h',
    0xF7: 'RST 30h',
    0xFF: 'RST 38h',
};

function noteAddr(addr) {
    if (addr >= 0xD00000 && addr <= 0xD3FFFF) return ` ; RAM[0x${hex(addr, 6)}]`;
    if (addr >= 0x068500 && addr <= 0x0687FF) return ' ; nearby FP utility area';
    return '';
}

function decodeCB(pc) {
    const op = rom8(pc + 1);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const group = ['RLC', 'BIT', 'RES', 'SET'][x];
    if (x === 0) {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        return { len: 2, text: `${shifts[y]} ${regs[z]}` };
    }
    return { len: 2, text: `${group} ${y},${regs[z]}` };
}

function decodeED(pc) {
    const op = rom8(pc + 1);
    const map = {
        0x44: 'NEG',
        0x45: 'RETN',
        0x47: 'LD I,A',
        0x4D: 'RETI',
        0x4F: 'LD R,A',
        0x57: 'LD A,I',
        0x5F: 'LD A,R',
        0x67: 'RRD',
        0x6F: 'RLD',
        0xA0: 'LDI',
        0xA1: 'CPI',
        0xA8: 'LDD',
        0xB0: 'LDIR',
        0xB1: 'CPIR',
        0xB8: 'LDDR',
    };
    if (map[op]) return { len: 2, text: map[op] };
    return { len: 2, text: `ED ${hex(op)} ; unknown/undecoded ED opcode` };
}

function decodeIYBit(pc) {
    const disp = signed8(rom8(pc + 2));
    const op = rom8(pc + 3);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const group = ['rot', 'BIT', 'RES', 'SET'][x];
    const target = `(IY${disp < 0 ? '-' : '+'}0x${hex(Math.abs(disp))})`;
    const suffix = z === 6 ? '' : ` -> ${regs[z]}`;
    if (x === 0) {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        return { len: 4, text: `${shifts[y]} ${target}${suffix}` };
    }
    return { len: 4, text: `${group} ${y},${target}${suffix}` };
}

function decodeInstruction(pc) {
    const b0 = rom8(pc);

    if (b0 === 0xCB) return decodeCB(pc);
    if (b0 === 0xED) return decodeED(pc);
    if (b0 === 0xFD && rom8(pc + 1) === 0xCB) return decodeIYBit(pc);
    if (returns[b0]) return { len: 1, text: returns[b0], end: true };
    if (pushes[b0]) return { len: 1, text: pushes[b0] };
    if (pops[b0]) return { len: 1, text: pops[b0] };
    if (loads8[b0]) return { len: 1, text: loads8[b0] };
    if (incDec16[b0]) return { len: 1, text: incDec16[b0] };
    if (incDec8[b0]) return { len: 1, text: incDec8[b0] };
    if (misc[b0]) return { len: 1, text: misc[b0] };

    if (b0 === 0x01 || b0 === 0x11 || b0 === 0x21 || b0 === 0x31) {
        const rp = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' }[b0];
        const addr = rom24(pc + 1);
        return { len: 4, text: `LD ${rp},0x${hex(addr, 6)}${noteAddr(addr)}` };
    }
    if (b0 === 0x3A || b0 === 0x32) {
        const addr = rom24(pc + 1);
        const text = b0 === 0x3A ? `LD A,(0x${hex(addr, 6)})` : `LD (0x${hex(addr, 6)}),A`;
        return { len: 4, text: `${text}${noteAddr(addr)}` };
    }
    if (b0 === 0x22 || b0 === 0x2A) {
        const addr = rom24(pc + 1);
        const text = b0 === 0x22 ? `LD (0x${hex(addr, 6)}),HL` : `LD HL,(0x${hex(addr, 6)})`;
        return { len: 4, text: `${text}${noteAddr(addr)}` };
    }
    if (b0 === 0xCD || b0 === 0xC3) {
        const addr = rom24(pc + 1);
        const op = b0 === 0xCD ? 'CALL' : 'JP';
        return { len: 4, text: `${op} 0x${hex(addr, 6)}${noteAddr(addr)}`, branch: addr, end: b0 === 0xC3 };
    }
    if (b0 === 0x18 || conditions[b0]) {
        const disp = signed8(rom8(pc + 1));
        const target = pc + 2 + disp;
        const op = b0 === 0x18 ? 'JR' : `JR ${conditions[b0]}`;
        return { len: 2, text: `${op} 0x${hex(target, 6)} (${disp >= 0 ? '+' : ''}${disp})`, branch: target };
    }
    if (b0 === 0x10) {
        const disp = signed8(rom8(pc + 1));
        const target = pc + 2 + disp;
        return { len: 2, text: `DJNZ 0x${hex(target, 6)} (${disp >= 0 ? '+' : ''}${disp})`, branch: target };
    }
    if (b0 === 0xC2 || b0 === 0xCA || b0 === 0xD2 || b0 === 0xDA) {
        const cond = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C' }[b0];
        const addr = rom24(pc + 1);
        return { len: 4, text: `JP ${cond},0x${hex(addr, 6)}${noteAddr(addr)}`, branch: addr };
    }
    if (b0 === 0xC4 || b0 === 0xCC || b0 === 0xD4 || b0 === 0xDC) {
        const cond = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C' }[b0];
        const addr = rom24(pc + 1);
        return { len: 4, text: `CALL ${cond},0x${hex(addr, 6)}${noteAddr(addr)}`, branch: addr };
    }
    if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(b0)) {
        const dst = regs[(b0 >> 3) & 7];
        return { len: 2, text: `LD ${dst},0x${hex(rom8(pc + 1))}` };
    }
    if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(b0)) {
        const op = { 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' }[b0];
        return { len: 2, text: `${op} 0x${hex(rom8(pc + 1))}` };
    }
    if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
        const dst = regs[(b0 >> 3) & 7];
        const src = regs[b0 & 7];
        return { len: 1, text: `LD ${dst},${src}` };
    }
    if (b0 >= 0x80 && b0 <= 0xBF) {
        const op = alu[(b0 >> 3) & 7];
        return { len: 1, text: `${op} ${regs[b0 & 7]}` };
    }
    if (b0 === 0x08) return { len: 1, text: 'EX AF,AF\'' };
    if (b0 === 0x09) return { len: 1, text: 'ADD HL,BC' };
    if (b0 === 0x19) return { len: 1, text: 'ADD HL,DE' };
    if (b0 === 0x29) return { len: 1, text: 'ADD HL,HL' };
    if (b0 === 0x39) return { len: 1, text: 'ADD HL,SP' };
    if (b0 === 0xD9) return { len: 1, text: 'EXX' };
    if (b0 === 0xE3) return { len: 1, text: 'EX (SP),HL' };
    if (b0 === 0xE9) return { len: 1, text: 'JP (HL)', end: true };
    if (b0 === 0xEB) return { len: 1, text: 'EX DE,HL' };
    if (b0 === 0xF3) return { len: 1, text: 'DI' };
    if (b0 === 0xFB) return { len: 1, text: 'EI' };

    return { len: 1, text: `DB 0x${hex(b0)} ; unknown/undecoded opcode` };
}

function decodeRegion(start, len, label) {
    console.log(`\n=== ${label}: 0x${hex(start, 6)}..0x${hex(start + len - 1, 6)} ===`);
    let pc = start;
    const end = start + len;
    while (pc < end) {
        const decoded = decodeInstruction(pc);
        console.log(`0x${hex(pc, 6)}  ${bytesAt(pc, decoded.len)}  ${decoded.text}`);
        pc += decoded.len;
        if (decoded.end) {
            console.log(`; possible function end at 0x${hex(pc - 1, 6)}`);
        }
    }
}

decodeRegion(0x07FF59, 30, 'Calling context 0x07FF59');
decodeRegion(0x06868A, 200, 'Target function 0x06868A');
