import { readFileSync } from 'fs';
const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function readByte(addr) { return rom[addr]; }
function readWord(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function read24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w = 2) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function signed8(v) { return v & 0x80 ? v - 0x100 : v; }

const START = 0x07D183;
const END = START + 120;
const ENTRY_OP2 = 0x07D183;
const ENTRY_OP1 = 0x07D189;

const targets = [];
const decoded = [];

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];

function relTarget(pc, len) {
    return pc + len + signed8(readByte(pc + len - 1));
}

function noteTarget(kind, from, to) {
    targets.push({ kind, from, to });
}

function decodeCB(pc) {
    const op = readByte(pc + 1);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    if (x === 0) return { len: 2, mnemonic: `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${r[z]}` };
    if (x === 1) return { len: 2, mnemonic: `BIT ${y},${r[z]}` };
    if (x === 2) return { len: 2, mnemonic: `RES ${y},${r[z]}` };
    return { len: 2, mnemonic: `SET ${y},${r[z]}` };
}

function decodeED(pc) {
    const op = readByte(pc + 1);
    if (op === 0x67) return { len: 2, mnemonic: 'RRD' };
    if (op === 0x6F) return { len: 2, mnemonic: 'RLD' };
    if ((op & 0xC7) === 0x42) return { len: 2, mnemonic: `${['SBC HL,', 'ADC HL,'][(op >> 3) & 1]}${rp[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0x43) return { len: 4, mnemonic: `LD (${hex(readWord(pc + 2), 4)}),${rp[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0x4B) return { len: 4, mnemonic: `LD ${rp[(op >> 4) & 3]},(${hex(readWord(pc + 2), 4)})` };
    if ((op & 0xC7) === 0x44) return { len: 2, mnemonic: 'NEG' };
    if ((op & 0xC7) === 0x45) return { len: 2, mnemonic: 'RETN' };
    if ((op & 0xC7) === 0x46) return { len: 2, mnemonic: `IM ${[0, 0, 1, 2][(op >> 3) & 3]}` };
    const block = {
        0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
        0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
        0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
        0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
    };
    if (block[op]) return { len: 2, mnemonic: block[op] };
    return { len: 2, mnemonic: `ED ${hex(op)}` };
}

function decodeIndex(pc, prefix, name) {
    const op = readByte(pc + 1);
    const disp = signed8(readByte(pc + 2));
    const mem = `(${name}${disp < 0 ? '-' + hex(-disp) : '+' + hex(disp)})`;
    if (op === 0xCB) {
        const cb = readByte(pc + 3);
        const x = cb >> 6;
        const y = (cb >> 3) & 7;
        const z = cb & 7;
        const operand = z === 6 ? mem : `${mem},${r[z]}`;
        if (x === 0) return { len: 4, mnemonic: `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${operand}` };
        if (x === 1) return { len: 4, mnemonic: `BIT ${y},${mem}` };
        if (x === 2) return { len: 4, mnemonic: `RES ${y},${operand}` };
        return { len: 4, mnemonic: `SET ${y},${operand}` };
    }
    if (op === 0x21) return { len: 4, mnemonic: `LD ${name},${hex(readWord(pc + 2), 4)}` };
    if (op === 0x22) return { len: 4, mnemonic: `LD (${hex(readWord(pc + 2), 4)}),${name}` };
    if (op === 0x2A) return { len: 4, mnemonic: `LD ${name},(${hex(readWord(pc + 2), 4)})` };
    if (op === 0x23) return { len: 2, mnemonic: `INC ${name}` };
    if (op === 0x2B) return { len: 2, mnemonic: `DEC ${name}` };
    if (op === 0x34) return { len: 3, mnemonic: `INC ${mem}` };
    if (op === 0x35) return { len: 3, mnemonic: `DEC ${mem}` };
    if (op === 0x36) return { len: 4, mnemonic: `LD ${mem},${hex(readByte(pc + 3))}` };
    if (op === 0xE1) return { len: 2, mnemonic: `POP ${name}` };
    if (op === 0xE3) return { len: 2, mnemonic: `EX (SP),${name}` };
    if (op === 0xE5) return { len: 2, mnemonic: `PUSH ${name}` };
    if (op === 0xE9) return { len: 2, mnemonic: `JP (${name})`, terminates: true };
    if (op === 0xF9) return { len: 2, mnemonic: `LD SP,${name}` };
    if ((op & 0xC7) === 0x46) return { len: 3, mnemonic: `LD ${r[(op >> 3) & 7]},${mem}` };
    if ((op & 0xF8) === 0x70) return { len: 3, mnemonic: `LD ${mem},${r[op & 7]}` };
    if ((op & 0xC7) === 0x86) return { len: 3, mnemonic: `${alu[(op >> 3) & 7]} ${mem}` };
    return { len: 2, mnemonic: `${hex(prefix)} ${hex(op)}` };
}

function decode(pc) {
    const op = readByte(pc);
    if (op === 0xCB) return decodeCB(pc);
    if (op === 0xED) return decodeED(pc);
    if (op === 0xDD) return decodeIndex(pc, op, 'IX');
    if (op === 0xFD) return decodeIndex(pc, op, 'IY');

    if (op === 0x00) return { len: 1, mnemonic: 'NOP' };
    if (op === 0x08) return { len: 1, mnemonic: 'EX AF,AF\'' };
    if (op === 0x10) {
        const target = relTarget(pc, 2);
        noteTarget('DJNZ', pc, target);
        return { len: 2, mnemonic: `DJNZ ${hex(target, 6)}` };
    }
    if ((op & 0xE7) === 0x20) {
        const target = relTarget(pc, 2);
        noteTarget('JR', pc, target);
        return { len: 2, mnemonic: `JR ${cc[(op >> 3) & 3]},${hex(target, 6)}` };
    }
    if (op === 0x18) {
        const target = relTarget(pc, 2);
        noteTarget('JR', pc, target);
        return { len: 2, mnemonic: `JR ${hex(target, 6)}`, terminates: true };
    }
    if (op === 0x27) return { len: 1, mnemonic: 'DAA' };
    if (op === 0x2F) return { len: 1, mnemonic: 'CPL' };
    if (op === 0x37) return { len: 1, mnemonic: 'SCF' };
    if (op === 0x3F) return { len: 1, mnemonic: 'CCF' };
    if (op === 0x76) return { len: 1, mnemonic: 'HALT', terminates: true };
    if (op === 0xC3) {
        const target = read24(pc + 1);
        noteTarget('JP', pc, target);
        return { len: 4, mnemonic: `JP ${hex(target, 6)}`, terminates: true };
    }
    if (op === 0xCD) {
        const target = read24(pc + 1);
        noteTarget('CALL', pc, target);
        return { len: 4, mnemonic: `CALL ${hex(target, 6)}` };
    }
    if (op === 0xC9) return { len: 1, mnemonic: 'RET', terminates: true };
    if (op === 0xD9) return { len: 1, mnemonic: 'EXX' };
    if (op === 0xE9) return { len: 1, mnemonic: 'JP (HL)', terminates: true };
    if (op === 0xEB) return { len: 1, mnemonic: 'EX DE,HL' };
    if (op === 0xF3) return { len: 1, mnemonic: 'DI' };
    if (op === 0xFB) return { len: 1, mnemonic: 'EI' };

    if ((op & 0xCF) === 0x01) return { len: 3, mnemonic: `LD ${rp[(op >> 4) & 3]},${hex(readWord(pc + 1), 4)}` };
    if ((op & 0xCF) === 0x03) return { len: 1, mnemonic: `INC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x0B) return { len: 1, mnemonic: `DEC ${rp[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0x09) return { len: 1, mnemonic: `ADD HL,${rp[(op >> 4) & 3]}` };
    if ((op & 0xC7) === 0x04) return { len: 1, mnemonic: `INC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x05) return { len: 1, mnemonic: `DEC ${r[(op >> 3) & 7]}` };
    if ((op & 0xC7) === 0x06) return { len: 2, mnemonic: `LD ${r[(op >> 3) & 7]},${hex(readByte(pc + 1))}` };
    if ((op & 0xC0) === 0x40) return { len: 1, mnemonic: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
    if ((op & 0xC0) === 0x80) return { len: 1, mnemonic: `${alu[(op >> 3) & 7]} ${r[op & 7]}` };
    if ((op & 0xC7) === 0xC0) return { len: 1, mnemonic: `RET ${cc[(op >> 3) & 7]}`, terminates: false };
    if ((op & 0xC7) === 0xC2) {
        const target = read24(pc + 1);
        noteTarget('JP', pc, target);
        return { len: 4, mnemonic: `JP ${cc[(op >> 3) & 7]},${hex(target, 6)}` };
    }
    if ((op & 0xC7) === 0xC4) {
        const target = read24(pc + 1);
        noteTarget('CALL', pc, target);
        return { len: 4, mnemonic: `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}` };
    }
    if ((op & 0xC7) === 0xC6) return { len: 2, mnemonic: `${alu[(op >> 3) & 7]} ${hex(readByte(pc + 1))}` };
    if ((op & 0xC7) === 0xC7) return { len: 1, mnemonic: `RST ${hex(op & 0x38)}` };
    if ((op & 0xCF) === 0xC1) return { len: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };
    if ((op & 0xCF) === 0xC5) return { len: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };

    return { len: 1, mnemonic: `DB ${hex(op)}` };
}

console.log(`\n=== DISASSEMBLY: ${hex(START, 6)} - Matrix/List Sign Special Handlers ===\n`);
console.log(`Entry points: ${hex(ENTRY_OP2, 6)} (OP2 list sign), ${hex(ENTRY_OP1, 6)} (OP1 list sign)\n`);

let pc = START;
while (pc < END) {
    const startPC = pc;
    if (startPC === ENTRY_OP2) console.log(`--- ENTRY: ${hex(ENTRY_OP2, 6)} (OP2 list sign handler) ---`);
    if (startPC === ENTRY_OP1) console.log(`--- ENTRY: ${hex(ENTRY_OP1, 6)} (OP1 list sign handler) ---`);

    const info = decode(pc);
    const bytes = Array.from({ length: info.len }, (_, i) => hex(readByte(pc + i)).slice(2)).join(' ');
    decoded.push({ pc, ...info });
    console.log(`${hex(startPC, 6)}  ${bytes.padEnd(12)}  ${info.mnemonic}`);
    pc += info.len;
}

const firstTerminator = decoded.find((ins) => ins.pc >= ENTRY_OP2 && ins.pc < ENTRY_OP1 && ins.terminates);
console.log('\n=== CONTROL-FLOW NOTES ===');
if (firstTerminator) {
    console.log(`${hex(ENTRY_OP2, 6)} reaches a terminating instruction before ${hex(ENTRY_OP1, 6)} at ${hex(firstTerminator.pc, 6)} (${firstTerminator.mnemonic}); likely separate entry stubs or handlers.`);
} else {
    console.log(`${hex(ENTRY_OP2, 6)} has no unconditional terminator before ${hex(ENTRY_OP1, 6)}; OP2 appears to fall through into/share the OP1 handler tail unless a conditional branch exits first.`);
}

console.log('\n=== CALL/JP/JR TARGETS ===');
if (targets.length === 0) {
    console.log('(none decoded in range)');
} else {
    for (const t of targets) {
        console.log(`${hex(t.from, 6)}  ${t.kind.padEnd(4)} -> ${hex(t.to, 6)}`);
    }
}
