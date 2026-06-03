import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rom = readFileSync(join(__dirname, 'ROM.rom'));

const TARGET_POPULATOR = 0x07D583;

function hex(n, width = 6) {
    return `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(n) {
    return n.toString(16).toUpperCase().padStart(2, '0');
}

function signed8(n) {
    return n > 127 ? n - 256 : n;
}

function read24(addr) {
    return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function read16(addr) {
    return rom[addr] | (rom[addr + 1] << 8);
}

function hexDump(addr, len) {
    const bytes = [];
    for (let i = 0; i < len; i++) {
        bytes.push(byteHex(rom[addr + i]));
    }
    return bytes;
}

function isRamAddress(addr) {
    return addr >= 0xD00000 && addr <= 0xD3FFFF;
}

function addMemRef(memRefs, type, addr, detail) {
    memRefs.push({ type, addr, detail, isRam: isRamAddress(addr) });
}

function addFlow(flow, type, addr, target, detail) {
    flow.push({ type, addr, target, detail });
}

function decodeCb(op2) {
    const bit = (op2 >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[op2 & 7];

    if ((op2 & 0xC0) === 0x40) return `BIT ${bit},${reg}`;
    if ((op2 & 0xC0) === 0x80) return `RES ${bit},${reg}`;
    if ((op2 & 0xC0) === 0xC0) return `SET ${bit},${reg}`;
    return `CB ${byteHex(op2)} (rotate/shift)`;
}

function decodeIndexed(prefixName, pc) {
    const op2 = rom[pc + 1];
    const reg = prefixName;

    if (op2 === 0x21) return { instr: `LD ${reg},${hex(read24(pc + 2))}`, len: 5 };
    if (op2 === 0x22) return { instr: `LD (${hex(read24(pc + 2))}),${reg}`, len: 5, mem: { type: 'write', addr: read24(pc + 2) } };
    if (op2 === 0x2A) return { instr: `LD ${reg},(${hex(read24(pc + 2))})`, len: 5, mem: { type: 'read', addr: read24(pc + 2) } };
    if (op2 === 0x23) return { instr: `INC ${reg}`, len: 2 };
    if (op2 === 0x2B) return { instr: `DEC ${reg}`, len: 2 };
    if (op2 === 0xE5) return { instr: `PUSH ${reg}`, len: 2 };
    if (op2 === 0xE1) return { instr: `POP ${reg}`, len: 2 };
    if (op2 === 0xE9) return { instr: `JP (${reg})`, len: 2, flow: { type: 'jp_indirect', target: null, detail: `JP (${reg})` } };
    if (op2 === 0x36) {
        const off = rom[pc + 2];
        return { instr: `LD (${reg}+${signed8(off)}),${hex(rom[pc + 3], 2)}`, len: 4 };
    }
    if (op2 === 0x7E) return { instr: `LD A,(${reg}+${signed8(rom[pc + 2])})`, len: 3 };
    if (op2 === 0x77) return { instr: `LD (${reg}+${signed8(rom[pc + 2])}),A`, len: 3 };
    if (op2 === 0xCB) {
        const off = rom[pc + 2];
        const op3 = rom[pc + 3];
        const bit = (op3 >> 3) & 7;
        if ((op3 & 0xC0) === 0x40) return { instr: `BIT ${bit},(${reg}+${signed8(off)})`, len: 4 };
        if ((op3 & 0xC0) === 0x80) return { instr: `RES ${bit},(${reg}+${signed8(off)})`, len: 4 };
        if ((op3 & 0xC0) === 0xC0) return { instr: `SET ${bit},(${reg}+${signed8(off)})`, len: 4 };
        return { instr: `${prefixName} CB ${byteHex(off)} ${byteHex(op3)} (indexed bit op)`, len: 4 };
    }

    return { instr: `${prefixName} ${byteHex(op2)} (indexed prefix)`, len: 2 };
}

function decodeSis(pc) {
    const nextOp = rom[pc + 1];
    if (nextOp === 0xCD) return { instr: `.SIS CALL ${hex(read16(pc + 2), 4)}`, len: 4, call: read16(pc + 2) };
    if (nextOp === 0xC3) return { instr: `.SIS JP ${hex(read16(pc + 2), 4)}`, len: 4, flow: { type: 'jp', target: read16(pc + 2), detail: 'JP' } };
    if (nextOp === 0x2A) {
        const addr = read16(pc + 2);
        return { instr: `.SIS LD HL,(${hex(addr, 4)})`, len: 4, mem: { type: 'read', addr } };
    }
    if (nextOp === 0x22) {
        const addr = read16(pc + 2);
        return { instr: `.SIS LD (${hex(addr, 4)}),HL`, len: 4, mem: { type: 'write', addr } };
    }
    if (nextOp === 0x3A) {
        const addr = read16(pc + 2);
        return { instr: `.SIS LD A,(${hex(addr, 4)})`, len: 4, mem: { type: 'read', addr } };
    }
    if (nextOp === 0x32) {
        const addr = read16(pc + 2);
        return { instr: `.SIS LD (${hex(addr, 4)}),A`, len: 4, mem: { type: 'write', addr } };
    }
    return { instr: `.SIS ${byteHex(nextOp)} (prefix 0x40)`, len: 2 };
}

function decodeInstruction(pc, calls, memRefs, flow) {
    const op = rom[pc];
    let instr = '';
    let len = 1;
    let callTarget = null;
    let mem = null;
    let flowEntry = null;

    const callOps = new Map([
        [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'], [0xD4, 'CALL NC'],
        [0xDC, 'CALL C'], [0xFC, 'CALL M'], [0xF4, 'CALL P'], [0xEC, 'CALL PE'], [0xE4, 'CALL PO'],
    ]);
    const jpOps = new Map([
        [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'], [0xD2, 'JP NC'],
        [0xDA, 'JP C'], [0xFA, 'JP M'], [0xF2, 'JP P'], [0xEA, 'JP PE'], [0xE2, 'JP PO'],
    ]);
    const jrOps = new Map([[0x18, 'JR'], [0x20, 'JR NZ'], [0x28, 'JR Z'], [0x30, 'JR NC'], [0x38, 'JR C']]);
    const retOps = new Map([[0xC9, 'RET'], [0xC0, 'RET NZ'], [0xC8, 'RET Z'], [0xD0, 'RET NC'], [0xD8, 'RET C'], [0xF8, 'RET M'], [0xF0, 'RET P'], [0xE8, 'RET PE'], [0xE0, 'RET PO']]);

    if (callOps.has(op)) {
        callTarget = read24(pc + 1);
        instr = `${callOps.get(op)} ${hex(callTarget)}`;
        len = 4;
    } else if (jpOps.has(op)) {
        const target = read24(pc + 1);
        instr = `${jpOps.get(op)} ${hex(target)}`;
        len = 4;
        flowEntry = { type: 'jp', target, detail: jpOps.get(op) };
    } else if (jrOps.has(op)) {
        const rel = signed8(rom[pc + 1]);
        const target = pc + 2 + rel;
        instr = `${jrOps.get(op)} ${hex(target)} (offset ${rel})`;
        len = 2;
        flowEntry = { type: 'jr', target, detail: jrOps.get(op) };
    } else if (retOps.has(op)) {
        instr = retOps.get(op);
        flowEntry = { type: 'ret', target: null, detail: retOps.get(op) };
    } else if (op === 0x3A) {
        mem = { type: 'read', addr: read24(pc + 1) };
        instr = `LD A,(${hex(mem.addr)})`;
        len = 4;
    } else if (op === 0x32) {
        mem = { type: 'write', addr: read24(pc + 1) };
        instr = `LD (${hex(mem.addr)}),A`;
        len = 4;
    } else if (op === 0x2A) {
        mem = { type: 'read', addr: read24(pc + 1) };
        instr = `LD HL,(${hex(mem.addr)})`;
        len = 4;
    } else if (op === 0x22) {
        mem = { type: 'write', addr: read24(pc + 1) };
        instr = `LD (${hex(mem.addr)}),HL`;
        len = 4;
    } else if (op === 0xED) {
        const op2 = rom[pc + 1];
        if (op2 === 0x4B) {
            mem = { type: 'read', addr: read24(pc + 2) };
            instr = `LD BC,(${hex(mem.addr)})`;
            len = 5;
        } else if (op2 === 0x43) {
            mem = { type: 'write', addr: read24(pc + 2) };
            instr = `LD (${hex(mem.addr)}),BC`;
            len = 5;
        } else if (op2 === 0x5B) {
            mem = { type: 'read', addr: read24(pc + 2) };
            instr = `LD DE,(${hex(mem.addr)})`;
            len = 5;
        } else if (op2 === 0x53) {
            mem = { type: 'write', addr: read24(pc + 2) };
            instr = `LD (${hex(mem.addr)}),DE`;
            len = 5;
        } else if (op2 === 0x7B) {
            mem = { type: 'read', addr: read24(pc + 2) };
            instr = `LD SP,(${hex(mem.addr)})`;
            len = 5;
        } else if (op2 === 0x73) {
            mem = { type: 'write', addr: read24(pc + 2) };
            instr = `LD (${hex(mem.addr)}),SP`;
            len = 5;
        } else {
            instr = `ED ${byteHex(op2)} (extended)`;
            len = 2;
        }
    } else if (op === 0xDD || op === 0xFD) {
        const decoded = decodeIndexed(op === 0xDD ? 'IX' : 'IY', pc);
        instr = decoded.instr;
        len = decoded.len;
        mem = decoded.mem ?? null;
        flowEntry = decoded.flow ?? null;
    } else if (op === 0x40) {
        const decoded = decodeSis(pc);
        instr = decoded.instr;
        len = decoded.len;
        mem = decoded.mem ?? null;
        callTarget = decoded.call ?? null;
        flowEntry = decoded.flow ?? null;
    } else if (op === 0xCB) {
        instr = decodeCb(rom[pc + 1]);
        len = 2;
    } else {
        const fixed = new Map([
            [0x00, ['NOP', 1]], [0x01, [`LD BC,${hex(read24(pc + 1))}`, 4]],
            [0x03, ['INC BC', 1]], [0x04, ['INC B', 1]], [0x05, ['DEC B', 1]],
            [0x06, [`LD B,${hex(rom[pc + 1], 2)}`, 2]], [0x09, ['ADD HL,BC', 1]],
            [0x0B, ['DEC BC', 1]], [0x0C, ['INC C', 1]], [0x0D, ['DEC C', 1]],
            [0x0E, [`LD C,${hex(rom[pc + 1], 2)}`, 2]], [0x11, [`LD DE,${hex(read24(pc + 1))}`, 4]],
            [0x13, ['INC DE', 1]], [0x16, [`LD D,${hex(rom[pc + 1], 2)}`, 2]],
            [0x18, ['', 2]], [0x19, ['ADD HL,DE', 1]], [0x1B, ['DEC DE', 1]],
            [0x1E, [`LD E,${hex(rom[pc + 1], 2)}`, 2]], [0x21, [`LD HL,${hex(read24(pc + 1))}`, 4]],
            [0x23, ['INC HL', 1]], [0x26, [`LD H,${hex(rom[pc + 1], 2)}`, 2]],
            [0x2B, ['DEC HL', 1]], [0x2E, [`LD L,${hex(rom[pc + 1], 2)}`, 2]],
            [0x31, [`LD SP,${hex(read24(pc + 1))}`, 4]], [0x36, [`LD (HL),${hex(rom[pc + 1], 2)}`, 2]],
            [0x3C, ['INC A', 1]], [0x3D, ['DEC A', 1]], [0x3E, [`LD A,${hex(rom[pc + 1], 2)}`, 2]],
            [0x47, ['LD B,A', 1]], [0x4F, ['LD C,A', 1]], [0x57, ['LD D,A', 1]], [0x5F, ['LD E,A', 1]],
            [0x67, ['LD H,A', 1]], [0x6F, ['LD L,A', 1]], [0x77, ['LD (HL),A', 1]],
            [0x78, ['LD A,B', 1]], [0x79, ['LD A,C', 1]], [0x7A, ['LD A,D', 1]], [0x7B, ['LD A,E', 1]],
            [0x7C, ['LD A,H', 1]], [0x7D, ['LD A,L', 1]], [0x7E, ['LD A,(HL)', 1]],
            [0xA6, ['AND (HL)', 1]], [0xA7, ['AND A', 1]], [0xAE, ['XOR (HL)', 1]], [0xAF, ['XOR A', 1]],
            [0xB6, ['OR (HL)', 1]], [0xB7, ['OR A', 1]], [0xBE, ['CP (HL)', 1]],
            [0xC1, ['POP BC', 1]], [0xC5, ['PUSH BC', 1]], [0xC6, [`ADD A,${hex(rom[pc + 1], 2)}`, 2]],
            [0xD1, ['POP DE', 1]], [0xD5, ['PUSH DE', 1]], [0xD6, [`SUB ${hex(rom[pc + 1], 2)}`, 2]],
            [0xE1, ['POP HL', 1]], [0xE5, ['PUSH HL', 1]], [0xE6, [`AND ${hex(rom[pc + 1], 2)}`, 2]],
            [0xE9, ['JP (HL)', 1]], [0xEB, ['EX DE,HL', 1]], [0xEE, [`XOR ${hex(rom[pc + 1], 2)}`, 2]],
            [0xF1, ['POP AF', 1]], [0xF5, ['PUSH AF', 1]], [0xF6, [`OR ${hex(rom[pc + 1], 2)}`, 2]],
            [0xFE, [`CP ${hex(rom[pc + 1], 2)}`, 2]],
        ]);
        if (fixed.has(op)) {
            [instr, len] = fixed.get(op);
            if (op === 0xE9) flowEntry = { type: 'jp_indirect', target: null, detail: 'JP (HL)' };
        } else {
            instr = `?? ${hex(op, 2)}`;
        }
    }

    if (callTarget !== null) {
        calls.push(callTarget);
    }
    if (mem) {
        addMemRef(memRefs, mem.type, mem.addr, instr);
    }
    if (flowEntry) {
        addFlow(flow, flowEntry.type, pc, flowEntry.target, flowEntry.detail);
    }

    return { instr, len };
}

function disassembleFunction(name, start, rawLen, maxLen, maxInstructions) {
    console.log(`=== DECODING ${name} ===`);
    console.log('Raw bytes:', hexDump(start, rawLen).join(' '));

    const calls = [];
    const memRefs = [];
    const flow = [];
    let pc = start;

    for (let i = 0; i < maxInstructions && pc < start + maxLen; i++) {
        const startPC = pc;
        const { instr, len } = decodeInstruction(pc, calls, memRefs, flow);
        const rawBytes = hexDump(startPC, len).join(' ');
        console.log(`  ${hex(startPC)}: ${rawBytes.padEnd(16)} ${instr}`);

        pc += len;
        if (instr === 'RET' || instr.startsWith('JP (')) {
            break;
        }
    }

    const uniqueCalls = [...new Set(calls)];
    console.log(`\nCALL targets from ${name}:`, uniqueCalls.map(c => hex(c)));
    console.log(`Memory refs from ${name}:`, memRefs.map(r => `${r.type}${r.isRam ? ' RAM' : ''} ${hex(r.addr)} (${r.detail})`));
    console.log(`Flow control from ${name}:`, flow.map(f => `${hex(f.addr)} ${f.detail}${f.target === null ? '' : ` -> ${hex(f.target)}`}`));
    console.log(`Contains ${hex(TARGET_POPULATOR)}?`, uniqueCalls.includes(TARGET_POPULATOR) ? 'YES' : 'NO');
    console.log('');

    return { calls: uniqueCalls, memRefs, flow };
}

const result9432 = disassembleFunction('0x0B9432', 0x0B9432, 80, 120, 50);
const result94FB = disassembleFunction('0x0B94FB', 0x0B94FB, 60, 100, 40);

const allCalls = [...new Set([...result9432.calls, ...result94FB.calls])];
const foundDirect =
    result9432.calls.includes(TARGET_POPULATOR) ||
    result94FB.calls.includes(TARGET_POPULATOR);

console.log('=== ALL UNIQUE CALL TARGETS ===');
allCalls.forEach(c => console.log(`  ${hex(c)}`));

console.log('\n=== SUMMARY ===');
if (foundDirect) {
    const sources = [];
    if (result9432.calls.includes(TARGET_POPULATOR)) sources.push('0x0B9432');
    if (result94FB.calls.includes(TARGET_POPULATOR)) sources.push('0x0B94FB');
    console.log(`FOUND: ${hex(TARGET_POPULATOR)} is directly called by ${sources.join(', ')}.`);
} else {
    console.log(`${hex(TARGET_POPULATOR)} is NOT directly called by either decoded function.`);
    console.log('Next candidates to check for a transitive path:');
    allCalls
        .filter(c => c !== 0x0B9432 && c !== 0x0B94FB)
        .forEach(c => console.log(`  ${hex(c)}`));
}
