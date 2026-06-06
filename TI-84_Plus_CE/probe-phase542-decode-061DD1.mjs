import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const ramRefs = new Map();
const calls = [];

function hex(value, width = 6) {
    return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

// Convert a structured instruction object to a readable assembly string.
function formatInstr(inst) {
    const t = inst.tag;
    if (!t) return '???';

    // Simple no-operand instructions
    if (['nop', 'ret', 'reti', 'retn', 'halt', 'di', 'ei', 'exx', 'ex-af',
         'ex-de-hl', 'cpl', 'ccf', 'scf', 'daa', 'neg', 'rla', 'rra',
         'rlca', 'rrca', 'ldi', 'ldir', 'ldd', 'lddr', 'cpi', 'cpir',
         'cpd', 'cpdr', 'ini', 'inir', 'ind', 'indr', 'outi', 'otir',
         'outd', 'otdr', 'rld', 'rrd', 'slp'].includes(t)) {
        return t.toUpperCase().replace(/-/g, ' ');
    }

    // Conditional return
    if (t === 'ret-conditional') return `RET ${inst.condition}`;

    // Load register immediate
    if (t === 'ld-reg-imm') return `LD ${inst.dest}, ${hex(inst.value)}`;
    if (t === 'ld-pair-imm') return `LD ${inst.pair}, ${hex(inst.value)}`;
    if (t === 'ld-reg-reg') return `LD ${inst.dest}, ${inst.src}`;
    if (t === 'ld-reg-ind') return `LD ${inst.dest}, (${inst.src})`;
    if (t === 'ld-ind-reg') return `LD (${inst.dest}), ${inst.src}`;
    if (t === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${inst.src}`;
    if (t === 'ld-reg-mem') return `LD ${inst.dest}, (${hex(inst.addr)})`;
    if (t === 'ld-mem-pair') return `LD (${hex(inst.addr)}), ${inst.pair}`;
    if (t === 'ld-pair-mem') {
        if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair}`;
        return `LD ${inst.pair}, (${hex(inst.addr)})`;
    }
    if (t === 'ld-sp-pair') return `LD SP, ${inst.pair || inst.src}`;
    if (t === 'ld-sp-hl') return 'LD SP, HL';
    if (t === 'ld-ind-imm') return `LD (${inst.dest}), ${hex(inst.value)}`;

    // Indexed loads
    if (t === 'ld-indexed-reg') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
    }
    if (t === 'ld-reg-indexed') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'ld-indexed-imm') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LD (${inst.indexRegister}${sign}${inst.displacement}), ${hex(inst.value)}`;
    }

    // Stack
    if (t === 'push') return `PUSH ${inst.pair}`;
    if (t === 'pop') return `POP ${inst.pair}`;
    if (t === 'ex-sp-pair') return `EX (SP), ${inst.pair}`;
    if (t === 'ex-sp-hl') return 'EX (SP), HL';

    // Arithmetic/logic on registers
    if (t === 'alu-reg') return `${(inst.op || inst.operation || '??').toUpperCase()} ${inst.src}`;
    if (t === 'alu-imm') return `${(inst.op || inst.operation || '??').toUpperCase()} ${hex(inst.value)}`;
    if (t === 'alu-indexed') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `${(inst.op || inst.operation || '??').toUpperCase()} (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'alu-ind') return `${(inst.op || inst.operation || '??').toUpperCase()} (${inst.src})`;

    // 16-bit arithmetic
    if (t === 'add-pair') return `ADD ${inst.dest}, ${inst.src}`;
    if (t === 'adc-pair') return `ADC ${inst.dest || 'hl'}, ${inst.src}`;
    if (t === 'sbc-pair') return `SBC ${inst.dest || 'hl'}, ${inst.src}`;
    if (t === 'inc-pair') return `INC ${inst.pair}`;
    if (t === 'dec-pair') return `DEC ${inst.pair}`;
    if (t === 'inc-reg') return `INC ${inst.reg}`;
    if (t === 'dec-reg') return `DEC ${inst.reg}`;
    if (t === 'inc-ind') return `INC (${inst.target})`;
    if (t === 'dec-ind') return `DEC (${inst.target})`;
    if (t === 'inc-indexed') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `INC (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'dec-indexed') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `DEC (${inst.indexRegister}${sign}${inst.displacement})`;
    }

    // Jumps
    if (t === 'jp') return `JP ${hex(inst.target)}`;
    if (t === 'jp-conditional') return `JP ${inst.condition}, ${hex(inst.target)}`;
    if (t === 'jr') return `JR ${hex(inst.target)}`;
    if (t === 'jr-conditional') return `JR ${inst.condition}, ${hex(inst.target)}`;
    if (t === 'jp-ind') return `JP (${inst.target})`;
    if (t === 'jp-indirect') return `JP (${inst.indirectRegister})`;
    if (t === 'djnz') return `DJNZ ${hex(inst.target)}`;

    // Calls
    if (t === 'call') return `CALL ${hex(inst.target)}`;
    if (t === 'call-conditional') return `CALL ${inst.condition}, ${hex(inst.target)}`;
    if (t === 'rst') return `RST ${hex(inst.target)}`;

    // Bit manipulation
    if (t === 'bit-reg') return `BIT ${inst.bit}, ${inst.reg}`;
    if (t === 'set-reg') return `SET ${inst.bit}, ${inst.reg}`;
    if (t === 'res-reg') return `RES ${inst.bit}, ${inst.reg}`;
    if (t === 'bit-ind') return `BIT ${inst.bit}, (${inst.target})`;
    if (t === 'set-ind') return `SET ${inst.bit}, (${inst.target})`;
    if (t === 'res-ind') return `RES ${inst.bit}, (${inst.target})`;

    // Indexed bit ops
    if (t === 'indexed-cb-bit') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `BIT ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'indexed-cb-set') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `SET ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'indexed-cb-res') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `RES ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    if (t === 'indexed-cb-rotate') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `${(inst.operation || inst.op || '??').toUpperCase()} (${inst.indexRegister}${sign}${inst.displacement})`;
    }

    // Rotate/shift on register
    if (t === 'rotate-reg') return `${(inst.operation || inst.op || '??').toUpperCase()} ${inst.reg}`;
    if (t === 'rotate-ind') return `${(inst.operation || inst.op || '??').toUpperCase()} (${inst.target})`;

    // I/O
    if (t === 'in-reg-c') return `IN ${inst.reg}, (C)`;
    if (t === 'out-c-reg') return `OUT (C), ${inst.reg}`;
    if (t === 'in-a-imm') return `IN A, (${hex(inst.port)})`;
    if (t === 'out-imm-a') return `OUT (${hex(inst.port)}), A`;
    if (t === 'in0') return `IN0 ${inst.reg}, (${hex(inst.port)})`;
    if (t === 'out0') return `OUT0 (${hex(inst.port)}), ${inst.reg}`;

    // LD special (I, R, MB)
    if (t === 'ld-special') return `LD ${inst.dest}, ${inst.src}`;
    if (t === 'ld-i-a') return 'LD I, A';
    if (t === 'ld-a-i') return 'LD A, I';
    if (t === 'ld-r-a') return 'LD R, A';
    if (t === 'ld-a-r') return 'LD A, R';
    if (t === 'ld-mb-a') return 'LD MB, A';
    if (t === 'ld-a-mb') return 'LD A, MB';

    // IM
    if (t === 'im') return `IM ${inst.mode}`;

    // MLT
    if (t === 'mlt') return `MLT ${inst.pair}`;

    // TST
    if (t === 'tst-reg') return `TST ${inst.reg}`;
    if (t === 'tst-imm') return `TST ${hex(inst.value)}`;

    // LEA
    if (t === 'lea') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `LEA ${inst.dest}, ${inst.indexRegister}${sign}${inst.displacement}`;
    }

    // PEA
    if (t === 'pea') {
        const sign = inst.displacement >= 0 ? '+' : '';
        return `PEA ${inst.indexRegister}${sign}${inst.displacement}`;
    }

    // STMIX / RSMIX
    if (t === 'stmix') return 'STMIX';
    if (t === 'rsmix') return 'RSMIX';

    // Fallback: dump the tag and all non-standard properties
    const extra = Object.entries(inst)
        .filter(([k]) => !['tag', 'pc', 'length', 'nextPc', 'mode', 'modePrefix'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`)
        .join(', ');
    return extra ? `${t} [${extra}]` : t;
}

function noteRamRefs(pc, asmStr) {
    const matches = asmStr.matchAll(/0xD[0-9A-F]{5}/gi);
    for (const match of matches) {
        const addr = match[0].toUpperCase();
        const mode = /\bLD\s+\([^)]*\),/i.test(asmStr) || /\bPUSH\b/i.test(asmStr) ? 'write/stack' : 'read';
        if (!ramRefs.has(addr)) ramRefs.set(addr, []);
        ramRefs.get(addr).push(`${hex(pc)} ${mode}: ${asmStr}`);
    }
}

function noteCall(pc, asmStr) {
    if (!/^CALL\b/i.test(asmStr)) return;
    calls.push(`${hex(pc)}: ${asmStr}`);
}

function disasm(start, maxBytes, label) {
    console.log(`\n=== ${label} at ${hex(start)} ===`);
    const bytes = Array.from(rom.slice(start, start + maxBytes));
    console.log(`Raw: ${bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    let pc = start;
    const end = start + maxBytes;
    while (pc < end) {
        const instr = decodeInstruction(rom, pc, 'adl');
        if (!instr || !instr.tag) {
            console.log(`  ${hex(pc)}: ??? (0x${rom[pc].toString(16)})`);
            pc++;
            continue;
        }
        const instrBytes = Array.from(rom.slice(pc, pc + instr.length))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        const asmStr = formatInstr(instr);
        console.log(`  ${hex(pc)}: [${instrBytes}] ${asmStr}`);
        noteRamRefs(pc, asmStr);
        noteCall(pc, asmStr);
        pc += instr.length;
        if (instr.tag === 'ret' || instr.tag === 'jp' || instr.tag === 'jp-indirect') break;
    }
}

console.log('Probe phase 542: decode recovery handler address 0x061DD1');
console.log('Purpose: determine how the setjmp-pushed recovery handler relates to longjmp cleanup and shared error dispatch.');

// The shared handler at 0x061DB2 that all error code dispatchers jump to.
disasm(0x061DB2, 0x1F, 'Shared Error Handler (jumped to from 0x061D00-0x061DB0)');

// The recovery handler pushed by setjmp.
disasm(0x061DD1, 30, 'Recovery Handler (pushed by setjmp at 0x061DEF)');

// For context: gap between recovery handler and setjmp.
disasm(0x061DE0, 20, 'Gap between recovery handler and setjmp');

// Reference: setjmp entry.
disasm(0x061DEF, 50, 'Setjmp (reference, decoded session 541)');

console.log('\n=== Interpretation Checklist ===');
console.log('- 0x061DD1 is the recovery target that setjmp places below the cleanup handler on the synthetic stack frame.');
console.log('- On longjmp, 0x061E20 restores SP from D008E0 and RET first enters 0x061E27 cleanup.');
console.log('- Cleanup at 0x061E27 restores the previous jmp_buf/error-chain context and RET can then continue to 0x061DD1.');
console.log('- Inspect whether 0x061DD1 returns normally to the original caller, jumps into shared dispatch at 0x061DB2, clears D008DF, or re-enables interrupt state.');
console.log('- Shared handler output above provides the context for how error dispatch reaches the common path before the recovery target.');

console.log('\n=== RAM References Seen In Decoded Windows ===');
if (ramRefs.size === 0) {
    console.log('(none decoded)');
} else {
    for (const [addr, refs] of ramRefs) {
        console.log(`${addr}:`);
        for (const ref of refs) console.log(`  - ${ref}`);
    }
}

console.log('\n=== CALLs Seen In Decoded Windows ===');
if (calls.length === 0) {
    console.log('(none decoded)');
} else {
    for (const call of calls) console.log(`- ${call}`);
}
