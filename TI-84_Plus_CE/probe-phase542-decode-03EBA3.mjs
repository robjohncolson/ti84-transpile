import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x03EBA3;
const LENGTH = 240;

const hex = (value, width = 6) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;

function formatAsm(inst) {
    const h = (v) => hex(v);
    const tag = inst.tag;
    if (!tag) return `db ${hex(rom[inst.pc], 2)}`;

    // Common patterns by tag
    if (tag === 'nop') return 'NOP';
    if (tag === 'ret') return 'RET';
    if (tag === 'ret-cond') return `RET ${inst.condition}`;
    if (tag === 'halt') return 'HALT';
    if (tag === 'di') return 'DI';
    if (tag === 'ei') return 'EI';
    if (tag === 'exx') return 'EXX';
    if (tag === 'ex-af') return "EX AF, AF'";
    if (tag === 'ex-de-hl') return 'EX DE, HL';
    if (tag === 'ex-sp-hl') return 'EX (SP), HL';
    if (tag === 'ex-sp-ix') return 'EX (SP), IX';
    if (tag === 'ex-sp-iy') return 'EX (SP), IY';
    if (tag === 'push') return `PUSH ${inst.pair.toUpperCase()}`;
    if (tag === 'pop') return `POP ${inst.pair.toUpperCase()}`;
    if (tag === 'call') return `CALL ${h(inst.target)}`;
    if (tag === 'call-cond') return `CALL ${inst.condition}, ${h(inst.target)}`;
    if (tag === 'jp') return `JP ${h(inst.target)}`;
    if (tag === 'jp-cond') return `JP ${inst.condition}, ${h(inst.target)}`;
    if (tag === 'jp-hl') return 'JP (HL)';
    if (tag === 'jp-ix') return 'JP (IX)';
    if (tag === 'jp-iy') return 'JP (IY)';
    if (tag === 'jr') return `JR ${h(inst.target)}`;
    if (tag === 'jr-conditional') return `JR ${inst.condition}, ${h(inst.target)}`;
    if (tag === 'djnz') return `DJNZ ${h(inst.target)}`;
    if (tag === 'rst') return `RST ${h(inst.vector)}`;

    // Load instructions
    if (tag === 'ld-reg-reg') return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    if (tag === 'ld-reg-imm') return `LD ${(inst.dest || inst.reg).toUpperCase()}, ${h(inst.value)}`;
    if (tag === 'ld-pair-imm') return `LD ${inst.pair.toUpperCase()}, ${h(inst.value)}`;
    if (tag === 'ld-pair-mem') return `LD ${inst.pair.toUpperCase()}, (${h(inst.addr)})`;
    if (tag === 'ld-mem-pair') return `LD (${h(inst.addr)}), ${inst.pair.toUpperCase()}`;
    if (tag === 'ld-mem-a') return `LD (${h(inst.addr)}), A`;
    if (tag === 'ld-a-mem') return `LD A, (${h(inst.addr)})`;
    if (tag === 'ld-reg-ind') return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    if (tag === 'ld-ind-reg') return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    if (tag === 'ld-ind-imm') return `LD (HL), ${h(inst.value)}`;
    if (tag === 'ld-a-i') return 'LD A, I';
    if (tag === 'ld-i-a') return 'LD I, A';
    if (tag === 'ld-a-r') return 'LD A, R';
    if (tag === 'ld-r-a') return 'LD R, A';
    if (tag === 'ld-sp-hl') return 'LD SP, HL';
    if (tag === 'ld-sp-ix') return 'LD SP, IX';
    if (tag === 'ld-sp-iy') return 'LD SP, IY';
    if (tag === 'ld-a-bc') return 'LD A, (BC)';
    if (tag === 'ld-a-de') return 'LD A, (DE)';
    if (tag === 'ld-bc-a') return 'LD (BC), A';
    if (tag === 'ld-de-a') return 'LD (DE), A';

    // Indexed loads
    if (tag === 'ld-idx-reg') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement}), ${inst.reg.toUpperCase()}`;
    }
    if (tag === 'ld-reg-idx') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD ${inst.reg.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }
    if (tag === 'ld-idx-imm') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement}), ${h(inst.value)}`;
    }

    // ALU
    if (tag === 'alu-reg') return `${inst.op.toUpperCase()} A, ${inst.reg.toUpperCase()}`;
    if (tag === 'alu-imm') return `${inst.op.toUpperCase()} A, ${h(inst.value)}`;
    if (tag === 'alu-idx') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `${inst.op.toUpperCase()} A, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }

    // Inc/dec
    if (tag === 'inc-reg') return `INC ${inst.reg.toUpperCase()}`;
    if (tag === 'dec-reg') return `DEC ${inst.reg.toUpperCase()}`;
    if (tag === 'inc-pair') return `INC ${inst.pair.toUpperCase()}`;
    if (tag === 'dec-pair') return `DEC ${inst.pair.toUpperCase()}`;
    if (tag === 'inc-idx') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `INC (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }
    if (tag === 'dec-idx') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `DEC (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }

    // 16-bit ALU
    if (tag === 'add-hl-pair') return `ADD HL, ${inst.pair.toUpperCase()}`;
    if (tag === 'adc-hl-pair') return `ADC HL, ${inst.pair.toUpperCase()}`;
    if (tag === 'sbc-hl-pair') return `SBC HL, ${inst.pair.toUpperCase()}`;
    if (tag === 'add-ix-pair') return `ADD IX, ${inst.pair.toUpperCase()}`;
    if (tag === 'add-iy-pair') return `ADD IY, ${inst.pair.toUpperCase()}`;

    // Rotate/shift
    if (tag === 'rotate-reg') return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    if (tag === 'rotate-ind') return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    if (tag === 'rlca') return 'RLCA';
    if (tag === 'rrca') return 'RRCA';
    if (tag === 'rla') return 'RLA';
    if (tag === 'rra') return 'RRA';
    if (tag === 'rld') return 'RLD';
    if (tag === 'rrd') return 'RRD';

    // Bit ops
    if (tag === 'bit-test') return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    if (tag === 'bit-set') return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    if (tag === 'bit-res') return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    if (tag === 'bit-test-ind') return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    if (tag === 'bit-set-ind') return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    if (tag === 'bit-res-ind') return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;

    // Indexed bit ops
    if (tag === 'indexed-cb-bit') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }
    if (tag === 'indexed-cb-set') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }
    if (tag === 'indexed-cb-res') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }
    if (tag === 'indexed-cb-rotate') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
    }

    // Block transfers & search
    if (tag === 'ldi') return 'LDI';
    if (tag === 'ldir') return 'LDIR';
    if (tag === 'ldd') return 'LDD';
    if (tag === 'lddr') return 'LDDR';
    if (tag === 'cpi') return 'CPI';
    if (tag === 'cpir') return 'CPIR';
    if (tag === 'cpd') return 'CPD';
    if (tag === 'cpdr') return 'CPDR';

    // I/O
    if (tag === 'in-a-imm') return `IN A, (${h(inst.port)})`;
    if (tag === 'out-imm-a') return `OUT (${h(inst.port)}), A`;
    if (tag === 'in-reg-c') return `IN ${inst.reg.toUpperCase()}, (C)`;
    if (tag === 'out-c-reg') return `OUT (C), ${inst.reg.toUpperCase()}`;
    if (tag === 'in0') return `IN0 ${inst.reg.toUpperCase()}, (${h(inst.port)})`;
    if (tag === 'out0') return `OUT0 (${h(inst.port)}), ${inst.reg.toUpperCase()}`;
    if (tag === 'ini') return 'INI';
    if (tag === 'outi') return 'OUTI';
    if (tag === 'inir') return 'INIR';
    if (tag === 'otir') return 'OTIR';
    if (tag === 'ind') return 'IND';
    if (tag === 'outd') return 'OUTD';
    if (tag === 'indr') return 'INDR';
    if (tag === 'otdr') return 'OTDR';

    // Misc
    if (tag === 'im') return `IM ${inst.mode}`;
    if (tag === 'scf') return 'SCF';
    if (tag === 'ccf') return 'CCF';
    if (tag === 'cpl') return 'CPL';
    if (tag === 'neg') return 'NEG';
    if (tag === 'daa') return 'DAA';
    if (tag === 'reti') return 'RETI';
    if (tag === 'retn') return 'RETN';
    if (tag === 'tst-a') return `TST A, ${h(inst.value)}`;

    // eZ80 specific
    if (tag === 'stmix') return 'STMIX';
    if (tag === 'rsmix') return 'RSMIX';
    if (tag === 'lea') return `LEA ${inst.dest.toUpperCase()}, ${inst.indexRegister.toUpperCase()}+${inst.displacement}`;
    if (tag === 'pea') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `PEA ${inst.indexRegister.toUpperCase()}${sign}${inst.displacement}`;
    }
    if (tag === 'mlt') return `MLT ${inst.pair.toUpperCase()}`;

    // Fallback: show tag and all extra fields
    const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix']);
    const extras = Object.entries(inst).filter(([k]) => !skip.has(k));
    const detail = extras.map(([k, v]) => `${k}=${v}`).join(' ');
    return `${tag}${detail ? ' ' + detail : ''}`;
}

const ramAccesses = [];
const portAccesses = [];
const calls = [];
const flagOps = [];
const branches = [];

function noteAccess(pc, asm) {
    const absRefs = [...asm.matchAll(/\$?([CD][0-9A-F]{5})/gi)].map(match => match[1].toUpperCase());
    for (const addr of absRefs) {
        ramAccesses.push({ pc, addr, asm });
    }

    if (/\b(?:IN0|OUT0|IN|OUT)\b/i.test(asm)) {
        portAccesses.push({ pc, asm });
    }

    const call = asm.match(/^CALL\s+(?:0x|(?:\$)?)([0-9A-F]{6})/i);
    if (call) {
        calls.push({ pc, target: call[1].toUpperCase(), asm });
    }

    if (/\b(?:BIT|SET|RES)\b/i.test(asm) && /\(IY[+-]/i.test(asm)) {
        flagOps.push({ pc, asm });
    }

    if (/^(?:JP|JR|RET|DJNZ)\b/i.test(asm)) {
        branches.push({ pc, asm });
    }
}

console.log(`=== Decoding ${hex(START)}: error display init candidate ===`);
console.log(`Window: ${LENGTH} bytes (${hex(START)}-${hex(START + LENGTH - 1)})`);
console.log(`Raw bytes: ${Array.from(rom.slice(START, START + LENGTH)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log('');
console.log('Disassembly:');

let pc = START;
const end = START + LENGTH;
let boundary = null;

while (pc < end) {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr) {
        console.log(`  ${hex(pc)}: ??? (${rom[pc].toString(16).padStart(2, '0')})`);
        pc++;
        continue;
    }

    const asm = formatAsm(instr);
    console.log(`  ${hex(pc)}: ${asm}`);
    noteAccess(pc, asm);

    pc += instr.length;

    if (asm === 'RET' || (/^JP\s+/i.test(asm) && !asm.includes(','))) {
        boundary = { endPc: pc, terminatorPc: pc - instr.length, terminator: asm };
        break;
    }
}

console.log('');
console.log('=== Boundary ===');
if (boundary) {
    console.log(`Function appears to end at ${hex(boundary.endPc)} after ${boundary.terminator} at ${hex(boundary.terminatorPc)}.`);
    console.log(`Decoded size: ${boundary.endPc - START} bytes.`);
} else {
    console.log(`No unconditional RET/JP boundary found in ${LENGTH} bytes; increase LENGTH and re-run.`);
}

console.log('');
console.log('=== Calls ===');
if (calls.length) {
    for (const call of calls) {
        console.log(`  ${hex(call.pc)} -> ${hex(parseInt(call.target, 16))}: ${call.asm}`);
    }
} else {
    console.log('  none observed');
}

console.log('');
console.log('=== RAM references ===');
if (ramAccesses.length) {
    for (const access of ramAccesses) {
        console.log(`  ${hex(access.pc)} references ${access.addr}: ${access.asm}`);
    }
} else {
    console.log('  no absolute Cxxxxx/Dxxxxx RAM references observed in decoded window');
}

console.log('');
console.log('=== IY flag operations ===');
if (flagOps.length) {
    for (const op of flagOps) {
        console.log(`  ${hex(op.pc)}: ${op.asm}`);
    }
} else {
    console.log('  no BIT/SET/RES (IY+offset) operations observed');
}

console.log('');
console.log('=== Port I/O ===');
if (portAccesses.length) {
    for (const access of portAccesses) {
        console.log(`  ${hex(access.pc)}: ${access.asm}`);
    }
} else {
    console.log('  no IN/OUT/IN0/OUT0 operations observed');
}

console.log('');
console.log('=== Branches ===');
if (branches.length) {
    for (const branch of branches) {
        console.log(`  ${hex(branch.pc)}: ${branch.asm}`);
    }
} else {
    console.log('  none observed');
}
