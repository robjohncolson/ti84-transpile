import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function readByte(addr) { return rom[addr]; }
function readWord(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function read24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w = 2) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function signed8(v) { return v & 0x80 ? v - 0x100 : v; }
function rel8Target(pc, off) { return (pc + 2 + signed8(off)) & 0xFFFFFF; }
function bytesAt(addr, len) {
    return Array.from({ length: len }, (_, i) => hex(readByte(addr + i))).join(' ');
}

const START = 0x07CF1A;
const END = START + 150;
const KNOWN = new Map([
    [0x0686A8, 'type sub-dispatch caller: CP 0x1C -> JP Z,0x07CF1A'],
    [0x07CF1A, 'matrix type 0x1C handler entry'],
    [0x07CF24, 'nearby complex validation chain / possible fall-through sub-function'],
    [0x07CFA7, 'sibling type 0x20/0x21 handler'],
    [0x07CE79, 'dimension check helper'],
    [0x07CE86, 'dimension check helper'],
    [0x07D183, 'matrix/list sign special handler'],
    [0x07D189, 'matrix/list sign special handler'],
    [0x07D27B, 'matrix/list FP statistical computation'],
]);

const targets = [];
const boundaries = [];

function targetNote(addr) {
    const note = KNOWN.get(addr);
    return note ? ` ; ${note}` : '';
}

function emit(addr, len, mnemonic, meta = {}) {
    const marker = KNOWN.has(addr) ? '* ' : '  ';
    console.log(`${marker}${hex(addr, 6)}  ${bytesAt(addr, len).padEnd(20)} ${mnemonic}${targetNote(addr)}`);
    if (meta.target !== undefined) {
        targets.push({ from: addr, kind: meta.kind, target: meta.target });
    }
    if (meta.boundary) {
        boundaries.push({ at: addr, reason: meta.boundary });
    }
    return addr + len;
}

function decodeCB(op) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    if (op < 0x40) {
        const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][op >> 3];
        return `${rot} ${regs[op & 7]}`;
    }
    const group = ['BIT', 'RES', 'SET'][((op >> 6) - 1)];
    return `${group} ${(op >> 3) & 7},${regs[op & 7]}`;
}

function decodeED(addr) {
    const op = readByte(addr + 1);
    const fixed = new Map([
        [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'],
        [0x4D, 'RETI'], [0x4F, 'LD R,A'], [0x57, 'LD A,I'], [0x5F, 'LD A,R'],
        [0x67, 'RRD'], [0x6F, 'RLD'], [0xA0, 'LDI'], [0xA1, 'CPI'],
        [0xA2, 'INI'], [0xA3, 'OUTI'], [0xA8, 'LDD'], [0xA9, 'CPD'],
        [0xAA, 'IND'], [0xAB, 'OUTD'], [0xB0, 'LDIR'], [0xB1, 'CPIR'],
        [0xB2, 'INIR'], [0xB3, 'OTIR'], [0xB8, 'LDDR'], [0xB9, 'CPDR'],
        [0xBA, 'INDR'], [0xBB, 'OTDR'],
    ]);
    if (fixed.has(op)) return { len: 2, mnemonic: fixed.get(op) };

    const rp = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    if ((op & 0xC7) === 0x40) return { len: 2, mnemonic: `IN ${r},(C)` };
    if ((op & 0xC7) === 0x41) return { len: 2, mnemonic: `OUT (C),${r}` };
    if ((op & 0xCF) === 0x42) return { len: 2, mnemonic: `SBC HL,${rp}` };
    if ((op & 0xCF) === 0x4A) return { len: 2, mnemonic: `ADC HL,${rp}` };
    if ((op & 0xCF) === 0x43) {
        const target = read24(addr + 2);
        return { len: 5, mnemonic: `LD (${hex(target, 6)}),${rp}` };
    }
    if ((op & 0xCF) === 0x4B) {
        const target = read24(addr + 2);
        return { len: 5, mnemonic: `LD ${rp},(${hex(target, 6)})` };
    }
    return { len: 2, mnemonic: `DB ${hex(0xED)},${hex(op)} ; unknown ED-prefixed opcode` };
}

function decodeIXIY(addr, prefix, name) {
    const op = readByte(addr + 1);
    const h = `${name}H`;
    const l = `${name}L`;
    const regs = ['B', 'C', 'D', 'E', h, l, null, 'A'];
    const rp = ['BC', 'DE', name, 'SP'];

    if (op === 0xCB) {
        const disp = signed8(readByte(addr + 2));
        const cb = readByte(addr + 3);
        return { len: 4, mnemonic: decodeCB(cb).replace('(HL)', `(${name}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})`) };
    }
    if (op === 0x21) return { len: 4, mnemonic: `LD ${name},${hex(read24(addr + 2), 6)}` };
    if (op === 0x22) return { len: 5, mnemonic: `LD (${hex(read24(addr + 2), 6)}),${name}` };
    if (op === 0x2A) return { len: 5, mnemonic: `LD ${name},(${hex(read24(addr + 2), 6)})` };
    if (op === 0x36) return { len: 4, mnemonic: `LD (${name}${signed8(readByte(addr + 2))}),${hex(readByte(addr + 3))}` };
    if (op === 0x34 || op === 0x35) return { len: 3, mnemonic: `${op === 0x34 ? 'INC' : 'DEC'} (${name}${signed8(readByte(addr + 2))})` };
    if ((op & 0xC7) === 0x46) return { len: 3, mnemonic: `LD ${regs[(op >> 3) & 7]},(${name}${signed8(readByte(addr + 2))})` };
    if ((op & 0xF8) === 0x70) return { len: 3, mnemonic: `LD (${name}${signed8(readByte(addr + 2))}),${regs[op & 7] ?? '(HL)'}` };
    if ((op & 0xCF) === 0x09) return { len: 2, mnemonic: `ADD ${name},${rp[(op >> 4) & 3]}` };
    if (op === 0xE1) return { len: 2, mnemonic: `POP ${name}` };
    if (op === 0xE3) return { len: 2, mnemonic: `EX (SP),${name}` };
    if (op === 0xE5) return { len: 2, mnemonic: `PUSH ${name}` };
    if (op === 0xE9) return { len: 2, mnemonic: `JP (${name})`, boundary: 'indirect jump through index register' };
    if (op === 0xF9) return { len: 2, mnemonic: `LD SP,${name}` };
    return { len: 2, mnemonic: `DB ${hex(prefix)},${hex(op)} ; unhandled ${name}-prefixed opcode` };
}

function decode(addr) {
    const op = readByte(addr);
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const rp = ['BC', 'DE', 'HL', 'SP'];
    const rp2 = ['BC', 'DE', 'HL', 'AF'];
    const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
    const alu = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];

    if (op === 0xCB) return { len: 2, mnemonic: decodeCB(readByte(addr + 1)) };
    if (op === 0xED) return decodeED(addr);
    if (op === 0xDD) return decodeIXIY(addr, 0xDD, 'IX');
    if (op === 0xFD) return decodeIXIY(addr, 0xFD, 'IY');
    if (op === 0x00) return { len: 1, mnemonic: 'NOP' };
    if (op === 0x08) return { len: 1, mnemonic: "EX AF,AF'" };
    if (op === 0x10) {
        const target = rel8Target(addr, readByte(addr + 1));
        return { len: 2, mnemonic: `DJNZ ${hex(target, 6)}`, target, kind: 'DJNZ' };
    }
    if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
        const target = rel8Target(addr, readByte(addr + 1));
        const name = op === 0x18 ? 'JR' : `JR ${cc[(op >> 3) & 3]},`;
        return { len: 2, mnemonic: `${name} ${hex(target, 6)}`, target, kind: 'JR' };
    }
    if ((op & 0xCF) === 0x01) return { len: 4, mnemonic: `LD ${rp[(op >> 4) & 3]},${hex(read24(addr + 1), 6)}` };
    if ((op & 0xCF) === 0x09) return { len: 1, mnemonic: `ADD HL,${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x03) return { len: 1, mnemonic: `INC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x0B) return { len: 1, mnemonic: `DEC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0x04) return { len: 1, mnemonic: `INC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x05) return { len: 1, mnemonic: `DEC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x06) return { len: 2, mnemonic: `LD ${r[(op >> 3) & 7]},${hex(readByte(addr + 1))}` };
    if (op >= 0x40 && op <= 0x7F) {
        if (op === 0x76) return { len: 1, mnemonic: 'HALT', boundary: 'HALT encountered' };
        return { len: 1, mnemonic: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
    }
    if (op >= 0x80 && op <= 0xBF) return { len: 1, mnemonic: `${alu[(op >> 3) & 7]}${r[op & 7]}` };
    if ((op & 0xC7) === 0xC0) return { len: 1, mnemonic: `RET ${cc[(op >> 3) & 7]}`, boundary: 'conditional return' };
    if ((op & 0xC7) === 0xC2) {
        const target = read24(addr + 1);
        return { len: 4, mnemonic: `JP ${cc[(op >> 3) & 7]},${hex(target, 6)}`, target, kind: 'JP' };
    }
    if ((op & 0xC7) === 0xC4) {
        const target = read24(addr + 1);
        return { len: 4, mnemonic: `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}`, target, kind: 'CALL' };
    }
    if ((op & 0xCF) === 0xC1) return { len: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0xC5) return { len: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0xC7) return { len: 1, mnemonic: `RST ${hex(op & 0x38)}` };
    if ([0xC3, 0xCD].includes(op)) {
        const target = read24(addr + 1);
        return { len: 4, mnemonic: `${op === 0xC3 ? 'JP' : 'CALL'} ${hex(target, 6)}`, target, kind: op === 0xC3 ? 'JP' : 'CALL', boundary: op === 0xC3 ? 'absolute jump boundary' : undefined };
    }
    if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) {
        return { len: 2, mnemonic: `${alu[(op - 0xC6) >> 3]}${hex(readByte(addr + 1))}` };
    }

    const one = new Map([
        [0x02, 'LD (BC),A'], [0x07, 'RLCA'], [0x0A, 'LD A,(BC)'], [0x0F, 'RRCA'],
        [0x12, 'LD (DE),A'], [0x17, 'RLA'], [0x1A, 'LD A,(DE)'], [0x1F, 'RRA'],
        [0x22, `LD (${hex(read24(addr + 1), 6)}),HL`], [0x27, 'DAA'],
        [0x2A, `LD HL,(${hex(read24(addr + 1), 6)})`], [0x2F, 'CPL'],
        [0x32, `LD (${hex(read24(addr + 1), 6)}),A`], [0x37, 'SCF'],
        [0x3A, `LD A,(${hex(read24(addr + 1), 6)})`], [0x3F, 'CCF'],
        [0xC9, 'RET'], [0xD3, `OUT (${hex(readByte(addr + 1))}),A`],
        [0xD9, 'EXX'], [0xDB, `IN A,(${hex(readByte(addr + 1))})`],
        [0xE3, 'EX (SP),HL'], [0xE9, 'JP (HL)'], [0xEB, 'EX DE,HL'],
        [0xF3, 'DI'], [0xF9, 'LD SP,HL'], [0xFB, 'EI'],
    ]);
    if (op === 0x22 || op === 0x2A || op === 0x32 || op === 0x3A) return { len: 4, mnemonic: one.get(op) };
    if (op === 0xD3 || op === 0xDB) return { len: 2, mnemonic: one.get(op) };
    if (one.has(op)) return { len: 1, mnemonic: one.get(op), boundary: op === 0xC9 ? 'RET encountered' : undefined };
    return { len: 1, mnemonic: `DB ${hex(op)} ; unknown opcode` };
}

console.log(`\n=== DISASSEMBLY: ${hex(START, 6)} - Matrix Type 0x1C Handler ===\n`);
console.log('Legend: * = known/interesting address from phase context');
console.log('Goal: determine whether entry 0x07CF1A falls through into 0x07CF24 and list all branch targets.\n');

let pc = START;
while (pc < END) {
    const d = decode(pc);
    pc = emit(pc, d.len, d.mnemonic, d);
    if (d.boundary && pc > 0x07CF24) {
        console.log(`\n--- stopping at ${hex(pc, 6)} after ${d.boundary} ---`);
        break;
    }
}

console.log('\n=== BRANCH/CALL TARGETS ===');
if (targets.length === 0) {
    console.log('(none decoded in scanned range)');
} else {
    for (const t of targets) {
        const relation = t.target === 0x07CF24
            ? ' ; direct relationship to 0x07CF24'
            : t.target > START && t.target < END
                ? ' ; internal target in scanned window'
                : targetNote(t.target);
        console.log(`${hex(t.from, 6)}  ${t.kind.padEnd(5)} -> ${hex(t.target, 6)}${relation}`);
    }
}

console.log('\n=== ANNOTATION CHECKLIST ===');
console.log('- Entry 0x07CF1A is the matrix type 0x1C dispatch target from 0x0686A8.');
console.log('- Address 0x07CF24 is marked inline; if no RET/JP appears before it, the entry flows into the validation chain.');
console.log('- If an unconditional JP/RET appears before 0x07CF24, treat 0x07CF24 as a neighboring sub-function instead.');
console.log('- Conditional RET/JR/JP/CALL targets above identify validation exits and helper calls for manual annotation.');
