import { readFileSync } from 'fs';
const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function readByte(addr) { return rom[addr]; }
function readWord(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function read24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w = 2) { return '0x' + v.toString(16).toUpperCase().padStart(w, '0'); }
function signed8(v) { return v < 0x80 ? v : v - 0x100; }
function bytesAt(addr, len) {
    return Array.from({ length: len }, (_, i) => hex(readByte(addr + i))).join(' ');
}

const START = 0x07CFA7;
const END = START + 150;

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const knownTargets = new Map([
    [0x0686A8, 'type sub-dispatch caller'],
    [0x06868A, 'type validation dispatcher'],
    [0x07CFA7, 'type 0x20/0x21 handler entry'],
    [0x07CF1A, 'matrix type 0x1C sibling handler'],
    [0x07CE79, 'dimension check helper'],
    [0x07CE86, 'dimension check helper'],
    [0x07D27B, 'matrix/list FP statistics handler'],
]);

const targets = [];

function noteTarget(kind, from, to) {
    targets.push({ kind, from, to, known: knownTargets.get(to) });
}

function targetText(kind, from, to) {
    noteTarget(kind, from, to);
    const known = knownTargets.get(to);
    return `${hex(to, 6)}${known ? ` ; ${known}` : ''}`;
}

function decodeCB(pc, prefix = '') {
    const op = readByte(pc + 1);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const reg = prefix || r[z];
    if (x === 0) return { len: 2, text: `${rot[y]} ${reg}` };
    if (x === 1) return { len: 2, text: `BIT ${y},${reg}` };
    if (x === 2) return { len: 2, text: `RES ${y},${reg}` };
    return { len: 2, text: `SET ${y},${reg}` };
}

function decodeED(pc) {
    const op = readByte(pc + 1);
    const y = (op >> 3) & 7;
    const p = (op >> 4) & 3;
    const q = (op >> 3) & 1;
    const z = op & 7;
    if ((op & 0xC7) === 0x43) return { len: 4, text: `LD (${hex(readWord(pc + 2), 4)}),${rp[p]}` };
    if ((op & 0xC7) === 0x4B) return { len: 4, text: `LD ${rp[p]},(${hex(readWord(pc + 2), 4)})` };
    if ((op & 0xCF) === 0x42) return { len: 2, text: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
    if ((op & 0xC7) === 0x40) return { len: 2, text: `IN ${r[y]},(C)` };
    if ((op & 0xC7) === 0x41) return { len: 2, text: `OUT (C),${r[y]}` };
    if (op === 0x44) return { len: 2, text: 'NEG' };
    if (op === 0x45) return { len: 2, text: 'RETN' };
    if (op === 0x47) return { len: 2, text: 'LD I,A' };
    if (op === 0x4F) return { len: 2, text: 'LD R,A' };
    if (op === 0x57) return { len: 2, text: 'LD A,I' };
    if (op === 0x5F) return { len: 2, text: 'LD A,R' };
    if (op === 0x67) return { len: 2, text: 'RRD' };
    if (op === 0x6F) return { len: 2, text: 'RLD' };
    const block = new Map([
        [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
        [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
        [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
        [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
    ]);
    return { len: 2, text: block.get(op) || `DB 0xED,${hex(op)}` };
}

function decodeIndexed(pc, ix) {
    const op = readByte(pc + 1);
    const reg = ix === 0xDD ? 'IX' : 'IY';
    const hi = ix === 0xDD ? 'IXH' : 'IYH';
    const lo = ix === 0xDD ? 'IXL' : 'IYL';
    const rr = ['B', 'C', 'D', 'E', hi, lo, `(${reg}+d)`, 'A'];
    const mem = () => `(${reg}${signed8(readByte(pc + 2)) >= 0 ? '+' : ''}${signed8(readByte(pc + 2))})`;
    if (op === 0x21) return { len: 4, text: `LD ${reg},${hex(read24(pc + 2), 6)}` };
    if (op === 0x22) return { len: 5, text: `LD (${hex(read24(pc + 2), 6)}),${reg}` };
    if (op === 0x2A) return { len: 5, text: `LD ${reg},(${hex(read24(pc + 2), 6)})` };
    if (op === 0x23) return { len: 2, text: `INC ${reg}` };
    if (op === 0x2B) return { len: 2, text: `DEC ${reg}` };
    if (op === 0x34) return { len: 3, text: `INC ${mem()}` };
    if (op === 0x35) return { len: 3, text: `DEC ${mem()}` };
    if (op === 0x36) return { len: 4, text: `LD ${mem()},${hex(readByte(pc + 3))}` };
    if (op === 0xCB) {
        const disp = signed8(readByte(pc + 2));
        const cb = readByte(pc + 3);
        const x = cb >> 6;
        const y = (cb >> 3) & 7;
        const z = cb & 7;
        const at = `(${reg}${disp >= 0 ? '+' : ''}${disp})`;
        const dst = z === 6 ? at : `${at},${r[z]}`;
        if (x === 0) return { len: 4, text: `${rot[y]} ${dst}` };
        if (x === 1) return { len: 4, text: `BIT ${y},${at}` };
        if (x === 2) return { len: 4, text: `RES ${y},${dst}` };
        return { len: 4, text: `SET ${y},${dst}` };
    }
    if (op === 0xE1) return { len: 2, text: `POP ${reg}` };
    if (op === 0xE3) return { len: 2, text: `EX (SP),${reg}` };
    if (op === 0xE5) return { len: 2, text: `PUSH ${reg}` };
    if (op === 0xE9) return { len: 2, text: `JP (${reg})` };
    if (op === 0xF9) return { len: 2, text: `LD SP,${reg}` };
    if ((op & 0xC0) === 0x40) {
        const y = (op >> 3) & 7;
        const z = op & 7;
        if (y === 6 || z === 6) return { len: 3, text: `LD ${rr[y] === `(${reg}+d)` ? mem() : rr[y]},${rr[z] === `(${reg}+d)` ? mem() : rr[z]}` };
    }
    if ((op & 0xF8) === 0x70) return { len: 3, text: `LD ${mem()},${r[op & 7]}` };
    if ((op & 0xC7) === 0x46) return { len: 3, text: `LD ${r[(op >> 3) & 7]},${mem()}` };
    if ((op & 0xC7) === 0x86) return { len: 3, text: `${alu[(op >> 3) & 7]} ${mem()}` };
    return { len: 1, text: `DB ${hex(ix)} ; undecoded indexed prefix` };
}

function decode(pc) {
    const op = readByte(pc);
    const y = (op >> 3) & 7;
    const z = op & 7;
    const p = (op >> 4) & 3;
    const q = (op >> 3) & 1;

    if (op === 0x00) return { len: 1, text: 'NOP' };
    if (op === 0x08) return { len: 1, text: 'EX AF,AF\'' };
    if (op === 0x10) {
        const to = pc + 2 + signed8(readByte(pc + 1));
        return { len: 2, text: `DJNZ ${targetText('DJNZ', pc, to)}` };
    }
    if ((op & 0xE7) === 0x20) {
        const to = pc + 2 + signed8(readByte(pc + 1));
        return { len: 2, text: `JR ${cc[(op >> 3) & 3]},${targetText('JR', pc, to)}` };
    }
    if (op === 0x18) {
        const to = pc + 2 + signed8(readByte(pc + 1));
        return { len: 2, text: `JR ${targetText('JR', pc, to)}`, boundary: true };
    }
    if ((op & 0xCF) === 0x01) return { len: 4, text: `LD ${rp[p]},${hex(read24(pc + 1), 6)}` };
    if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${rp[p]}` };
    if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${rp[p]}` };
    if ((op & 0xCF) === 0x09) return { len: 1, text: `ADD HL,${rp[p]}` };
    if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${r[y]}` };
    if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${r[y]}` };
    if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${r[y]},${hex(readByte(pc + 1))}` };
    if (op === 0x07) return { len: 1, text: 'RLCA' };
    if (op === 0x0F) return { len: 1, text: 'RRCA' };
    if (op === 0x17) return { len: 1, text: 'RLA' };
    if (op === 0x1F) return { len: 1, text: 'RRA' };
    if (op === 0x27) return { len: 1, text: 'DAA' };
    if (op === 0x2F) return { len: 1, text: 'CPL' };
    if (op === 0x37) return { len: 1, text: 'SCF' };
    if (op === 0x3F) return { len: 1, text: 'CCF' };
    if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
    if (op === 0x0A) return { len: 1, text: 'LD A,(BC)' };
    if (op === 0x12) return { len: 1, text: 'LD (DE),A' };
    if (op === 0x1A) return { len: 1, text: 'LD A,(DE)' };
    if (op === 0x22) return { len: 4, text: `LD (${hex(readWord(pc + 1), 4)}),HL` };
    if (op === 0x2A) return { len: 4, text: `LD HL,(${hex(readWord(pc + 1), 4)})` };
    if (op === 0x32) return { len: 4, text: `LD (${hex(readWord(pc + 1), 4)}),A` };
    if (op === 0x3A) return { len: 4, text: `LD A,(${hex(readWord(pc + 1), 4)})` };
    if ((op & 0xC0) === 0x40) return { len: 1, text: op === 0x76 ? 'HALT' : `LD ${r[y]},${r[z]}` };
    if ((op & 0xC0) === 0x80) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r[z]}` };
    if ((op & 0xC7) === 0xC0) return { len: 1, text: `RET ${cc[y]}` };
    if ((op & 0xC7) === 0xC2) {
        const to = read24(pc + 1);
        return { len: 4, text: `JP ${cc[y]},${targetText('JP', pc, to)}` };
    }
    if ((op & 0xC7) === 0xC4) {
        const to = read24(pc + 1);
        return { len: 4, text: `CALL ${cc[y]},${targetText('CALL', pc, to)}` };
    }
    if ((op & 0xC7) === 0xC7) return { len: 1, text: `RST ${hex(y * 8)}` };
    if ((op & 0xCF) === 0xC1) return { len: 1, text: `POP ${rp2[p]}` };
    if ((op & 0xCF) === 0xC5) return { len: 1, text: `PUSH ${rp2[p]}` };
    if ((op & 0xC7) === 0xC6) return { len: 2, text: `${alu[y]} ${hex(readByte(pc + 1))}` };
    if (op === 0xC3) {
        const to = read24(pc + 1);
        return { len: 4, text: `JP ${targetText('JP', pc, to)}`, boundary: true };
    }
    if (op === 0xC9) return { len: 1, text: 'RET', boundary: true };
    if (op === 0xCD) {
        const to = read24(pc + 1);
        return { len: 4, text: `CALL ${targetText('CALL', pc, to)}` };
    }
    if (op === 0xCB) return decodeCB(pc);
    if (op === 0xD3) return { len: 2, text: `OUT (${hex(readByte(pc + 1))}),A` };
    if (op === 0xDB) return { len: 2, text: `IN A,(${hex(readByte(pc + 1))})` };
    if (op === 0xDD || op === 0xFD) return decodeIndexed(pc, op);
    if (op === 0xE3) return { len: 1, text: 'EX (SP),HL' };
    if (op === 0xE9) return { len: 1, text: 'JP (HL)', boundary: true };
    if (op === 0xEB) return { len: 1, text: 'EX DE,HL' };
    if (op === 0xED) return decodeED(pc);
    if (op === 0xF3) return { len: 1, text: 'DI' };
    if (op === 0xF9) return { len: 1, text: 'LD SP,HL' };
    if (op === 0xFB) return { len: 1, text: 'EI' };
    return { len: 1, text: `DB ${hex(op)}` };
}

console.log(`\n=== DISASSEMBLY: ${hex(START, 6)} - Type 0x20/0x21 Handler ===\n`);
console.log('Caller context: 0x0686A8 dispatches TI-OS type 0x20 (equation) and 0x21 (string) here.');
console.log('Goal: decode until the first clear boundary, usually RET, JP nn, JR nn, or JP (HL/IX/IY).\n');

let pc = START;
let boundary = null;
while (pc < END) {
    const startPC = pc;
    const ins = decode(pc);
    const raw = bytesAt(startPC, ins.len).padEnd(18);
    console.log(`${hex(startPC, 6)}  ${raw}  ${ins.text}`);
    pc += ins.len;
    if (ins.boundary) {
        boundary = { at: startPC, text: ins.text };
        break;
    }
}

console.log('\n=== BRANCH/CALL TARGETS ===');
if (targets.length === 0) {
    console.log('(none decoded before boundary)');
} else {
    for (const t of targets) {
        console.log(`${hex(t.from, 6)}  ${t.kind.padEnd(5)} -> ${hex(t.to, 6)}${t.known ? `  (${t.known})` : ''}`);
    }
}

console.log('\n=== ANNOTATION NOTES ===');
console.log('- Entry is shared by TI-OS type 0x20 equation objects and type 0x21 string objects.');
console.log('- Treat loads/stores through HL/DE/IX/IY as candidate object-data pointer walks; these types commonly carry byte/string payloads rather than matrix dimensions.');
console.log('- Conditional branches before the boundary are likely validation or empty/length special cases; compare their targets with nearby decoded matrix/list handlers.');
console.log(boundary
    ? `- Function boundary identified at ${hex(boundary.at, 6)}: ${boundary.text}.`
    : `- No unconditional boundary found before ${hex(END, 6)}; extend END and re-run if this prints through live code.`);
