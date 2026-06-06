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

function s8(n) {
    return n < 0x80 ? n : n - 0x100;
}

function bytesAt(start, len) {
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(hex(rom8(start + i)));
    return bytes.join(' ').padEnd(14, ' ');
}

function iyBitOpText(disp, op) {
    const kind = op & 0xC0;
    const bit = (op >> 3) & 7;
    const signed = s8(disp);
    const off = signed < 0 ? `-${hex(-signed)}` : `+${hex(signed)}`;

    if (kind === 0x40) return `BIT ${bit},(IY${off})`;
    if (kind === 0x80) return `RES ${bit},(IY${off})`;
    if (kind === 0xC0) return `SET ${bit},(IY${off})`;
    return `IY-CB ${hex(disp)} ${hex(op)}`;
}

function cbText(op) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    if (x === 0) {
        const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        return `${rot[y]} ${regs[z]}`;
    }
    if (x === 1) return `BIT ${y},${regs[z]}`;
    if (x === 2) return `RES ${y},${regs[z]}`;
    return `SET ${y},${regs[z]}`;
}

function jrTarget(pc, disp) {
    return pc + 2 + s8(disp);
}

function decodeAt(pc) {
    const b0 = rom8(pc);
    let len = 1;
    let text = `DB $${hex(b0)}`;
    let note = '';

    switch (b0) {
        case 0x00: text = 'NOP'; break;
        case 0x01: len = 3; text = `LD BC,$${hex(rom16(pc + 1), 4)}`; break;
        case 0x03: text = 'INC BC'; break;
        case 0x04: text = 'INC B'; break;
        case 0x05: text = 'DEC B'; break;
        case 0x06: len = 2; text = `LD B,$${hex(rom8(pc + 1))}`; break;
        case 0x09: text = 'ADD HL,BC'; break;
        case 0x0A: text = 'LD A,(BC)'; break;
        case 0x0B: text = 'DEC BC'; break;
        case 0x0C: text = 'INC C'; break;
        case 0x0D: text = 'DEC C'; break;
        case 0x0E: len = 2; text = `LD C,$${hex(rom8(pc + 1))}`; break;
        case 0x11: len = 3; text = `LD DE,$${hex(rom16(pc + 1), 4)}`; break;
        case 0x13: text = 'INC DE'; break;
        case 0x14: text = 'INC D'; break;
        case 0x15: text = 'DEC D'; break;
        case 0x16: len = 2; text = `LD D,$${hex(rom8(pc + 1))}`; break;
        case 0x18:
            len = 2;
            text = `JR $${hex(jrTarget(pc, rom8(pc + 1)), 6)}`;
            note = 'branch';
            break;
        case 0x19: text = 'ADD HL,DE'; break;
        case 0x1A: text = 'LD A,(DE)'; break;
        case 0x1B: text = 'DEC DE'; break;
        case 0x1C: text = 'INC E'; break;
        case 0x1D: text = 'DEC E'; break;
        case 0x1E: len = 2; text = `LD E,$${hex(rom8(pc + 1))}`; break;
        case 0x20:
            len = 2;
            text = `JR NZ,$${hex(jrTarget(pc, rom8(pc + 1)), 6)}`;
            note = 'branch';
            break;
        case 0x21: len = 3; text = `LD HL,$${hex(rom16(pc + 1), 4)}`; break;
        case 0x22:
            len = 4;
            text = `LD ($${hex(rom24(pc + 1), 6)}),HL`;
            note = 'RAM/absolute write';
            break;
        case 0x23: text = 'INC HL'; break;
        case 0x24: text = 'INC H'; break;
        case 0x25: text = 'DEC H'; break;
        case 0x26: len = 2; text = `LD H,$${hex(rom8(pc + 1))}`; break;
        case 0x28:
            len = 2;
            text = `JR Z,$${hex(jrTarget(pc, rom8(pc + 1)), 6)}`;
            note = 'branch';
            break;
        case 0x29: text = 'ADD HL,HL'; break;
        case 0x2A:
            len = 4;
            text = `LD HL,($${hex(rom24(pc + 1), 6)})`;
            note = 'RAM/absolute read';
            break;
        case 0x2B: text = 'DEC HL'; break;
        case 0x2C: text = 'INC L'; break;
        case 0x2D: text = 'DEC L'; break;
        case 0x2E: len = 2; text = `LD L,$${hex(rom8(pc + 1))}`; break;
        case 0x30:
            len = 2;
            text = `JR NC,$${hex(jrTarget(pc, rom8(pc + 1)), 6)}`;
            note = 'branch';
            break;
        case 0x31: len = 3; text = `LD SP,$${hex(rom16(pc + 1), 4)}`; break;
        case 0x32:
            len = 4;
            text = `LD ($${hex(rom24(pc + 1), 6)}),A`;
            note = 'RAM/absolute write';
            break;
        case 0x33: text = 'INC SP'; break;
        case 0x34: text = 'INC (HL)'; break;
        case 0x35: text = 'DEC (HL)'; break;
        case 0x36: len = 2; text = `LD (HL),$${hex(rom8(pc + 1))}`; break;
        case 0x38:
            len = 2;
            text = `JR C,$${hex(jrTarget(pc, rom8(pc + 1)), 6)}`;
            note = 'branch';
            break;
        case 0x3A:
            len = 4;
            text = `LD A,($${hex(rom24(pc + 1), 6)})`;
            note = 'RAM/absolute read';
            break;
        case 0x3B: text = 'DEC SP'; break;
        case 0x3C: text = 'INC A'; break;
        case 0x3D: text = 'DEC A'; break;
        case 0x3E: len = 2; text = `LD A,$${hex(rom8(pc + 1))}`; break;
        case 0x76: text = 'HALT'; break;
        case 0x80: text = 'ADD A,B'; break;
        case 0x81: text = 'ADD A,C'; break;
        case 0x82: text = 'ADD A,D'; break;
        case 0x83: text = 'ADD A,E'; break;
        case 0x84: text = 'ADD A,H'; break;
        case 0x85: text = 'ADD A,L'; break;
        case 0x86: text = 'ADD A,(HL)'; break;
        case 0x87: text = 'ADD A,A'; break;
        case 0x90: text = 'SUB B'; break;
        case 0x91: text = 'SUB C'; break;
        case 0x92: text = 'SUB D'; break;
        case 0x93: text = 'SUB E'; break;
        case 0x94: text = 'SUB H'; break;
        case 0x95: text = 'SUB L'; break;
        case 0x96: text = 'SUB (HL)'; break;
        case 0x97: text = 'SUB A'; break;
        case 0xA0: text = 'AND B'; break;
        case 0xA1: text = 'AND C'; break;
        case 0xA2: text = 'AND D'; break;
        case 0xA3: text = 'AND E'; break;
        case 0xA4: text = 'AND H'; break;
        case 0xA5: text = 'AND L'; break;
        case 0xA6: text = 'AND (HL)'; break;
        case 0xA7: text = 'AND A'; break;
        case 0xA8: text = 'XOR B'; break;
        case 0xA9: text = 'XOR C'; break;
        case 0xAA: text = 'XOR D'; break;
        case 0xAB: text = 'XOR E'; break;
        case 0xAC: text = 'XOR H'; break;
        case 0xAD: text = 'XOR L'; break;
        case 0xAE: text = 'XOR (HL)'; break;
        case 0xAF: text = 'XOR A'; break;
        case 0xB0: text = 'OR B'; break;
        case 0xB1: text = 'OR C'; break;
        case 0xB2: text = 'OR D'; break;
        case 0xB3: text = 'OR E'; break;
        case 0xB4: text = 'OR H'; break;
        case 0xB5: text = 'OR L'; break;
        case 0xB6: text = 'OR (HL)'; break;
        case 0xB7: text = 'OR A'; break;
        case 0xB8: text = 'CP B'; break;
        case 0xB9: text = 'CP C'; break;
        case 0xBA: text = 'CP D'; break;
        case 0xBB: text = 'CP E'; break;
        case 0xBC: text = 'CP H'; break;
        case 0xBD: text = 'CP L'; break;
        case 0xBE: text = 'CP (HL)'; break;
        case 0xBF: text = 'CP A'; break;
        case 0xC0: text = 'RET NZ'; note = 'function boundary'; break;
        case 0xC1: text = 'POP BC'; break;
        case 0xC3:
            len = 4;
            text = `JP $${hex(rom24(pc + 1), 6)}`;
            note = 'branch/function boundary';
            break;
        case 0xC5: text = 'PUSH BC'; break;
        case 0xC6: len = 2; text = `ADD A,$${hex(rom8(pc + 1))}`; break;
        case 0xC8: text = 'RET Z'; note = 'function boundary'; break;
        case 0xC9: text = 'RET'; note = 'function boundary'; break;
        case 0xCA:
            len = 4;
            text = `JP Z,$${hex(rom24(pc + 1), 6)}`;
            note = 'branch';
            break;
        case 0xCB:
            len = 2;
            text = cbText(rom8(pc + 1));
            break;
        case 0xCD:
            len = 4;
            text = `CALL $${hex(rom24(pc + 1), 6)}`;
            note = 'call target';
            break;
        case 0xD0: text = 'RET NC'; note = 'function boundary'; break;
        case 0xD1: text = 'POP DE'; break;
        case 0xD5: text = 'PUSH DE'; break;
        case 0xD6: len = 2; text = `SUB $${hex(rom8(pc + 1))}`; break;
        case 0xD8: text = 'RET C'; note = 'function boundary'; break;
        case 0xDA:
            len = 4;
            text = `JP C,$${hex(rom24(pc + 1), 6)}`;
            note = 'branch';
            break;
        case 0xE1: text = 'POP HL'; break;
        case 0xE5: text = 'PUSH HL'; break;
        case 0xE6: len = 2; text = `AND $${hex(rom8(pc + 1))}`; break;
        case 0xE9: text = 'JP (HL)'; note = 'branch/function boundary'; break;
        case 0xEA:
            len = 4;
            text = `JP PE,$${hex(rom24(pc + 1), 6)}`;
            note = 'branch';
            break;
        case 0xEB: text = 'EX DE,HL'; break;
        case 0xED:
            if (rom8(pc + 1) === 0x67) {
                len = 2;
                text = 'RRD';
            } else if (rom8(pc + 1) === 0x6F) {
                len = 2;
                text = 'RLD';
            } else {
                len = 2;
                text = `ED $${hex(rom8(pc + 1))}`;
            }
            break;
        case 0xEE: len = 2; text = `XOR $${hex(rom8(pc + 1))}`; break;
        case 0xF1: text = 'POP AF'; break;
        case 0xF3: text = 'DI'; break;
        case 0xF5: text = 'PUSH AF'; break;
        case 0xF6: len = 2; text = `OR $${hex(rom8(pc + 1))}`; break;
        case 0xF9: text = 'LD SP,HL'; break;
        case 0xFA:
            len = 4;
            text = `JP M,$${hex(rom24(pc + 1), 6)}`;
            note = 'branch';
            break;
        case 0xFB: text = 'EI'; break;
        case 0xFD:
            if (rom8(pc + 1) === 0xCB) {
                len = 4;
                text = iyBitOpText(rom8(pc + 2), rom8(pc + 3));
                note = 'IY flag/RAM reference';
            } else if (rom8(pc + 1) === 0x21) {
                len = 4;
                text = `LD IY,$${hex(rom16(pc + 2), 4)}`;
            } else if (rom8(pc + 1) === 0x22) {
                len = 5;
                text = `LD ($${hex(rom24(pc + 2), 6)}),IY`;
                note = 'RAM/absolute write';
            } else if (rom8(pc + 1) === 0x2A) {
                len = 5;
                text = `LD IY,($${hex(rom24(pc + 2), 6)})`;
                note = 'RAM/absolute read';
            } else {
                len = 2;
                text = `FD $${hex(rom8(pc + 1))}`;
            }
            break;
        case 0xFE: len = 2; text = `CP $${hex(rom8(pc + 1))}`; break;
    }

    return { len, text, note };
}

function decodeRegion(start, len, label) {
    console.log(`\n=== ${label}: 0x${hex(start, 6)}..0x${hex(start + len - 1, 6)} ===`);
    let pc = start;
    const end = start + len;
    while (pc < end) {
        const { len: insLen, text, note } = decodeAt(pc);
        const shownLen = Math.min(insLen, end - pc);
        const suffix = note ? ` ; ${note}` : '';
        console.log(`${hex(pc, 6)}  ${bytesAt(pc, shownLen)}  ${text}${suffix}`);
        pc += insLen;
    }
}

console.log('FP conversion/formatting decode probe');
console.log('Known RAM context: IY base is typically $D00080; OP1 is $D005F8 type, $D005F9 exponent, $D005FA mantissa.');
console.log('Function notes: $07D306 and $07D310 are two entries that converge before CALL $07DD2F; $07DD2F clears IY+72 bit 3.');

decodeRegion(0x07D306, 100, 'Phase 3 entry at 0x07D306');
decodeRegion(0x07DD2F, 80, 'Sub-function 0x07DD2F');
