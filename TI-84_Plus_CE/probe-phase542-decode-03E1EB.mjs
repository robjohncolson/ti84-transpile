import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const annotations = new Map([
    [0x03E1EB, 'A = 0x8C: RAM protection restore value. This differs from forward 0x88 by setting bit 2.'],
    [0x03E1ED, 'OUT0 (0x24),A: write 0x8C to RAM protection port 0x24.'],
    [0x03E1F0, 'CP 0x8C: verify the RAM protection write value still matches A.'],
    [0x03E1F2, 'JP NZ,0x000066: failure path if verification fails.'],
    [0x03E1F6, 'IN0 A,(0x06): read flash access/control port 0x06.'],
    [0x03E1F9, 'SET 2,A: restore/set flash access bit 2. Forward function clears this bit with RES 2,A.'],
    [0x03E1FB, 'OUT0 (0x06),A: write modified value back to flash access/control port 0x06.'],
    [0x03E1FE, 'A = 0x04: memory wait/mapping restore value for port 0x28.'],
    [0x03E200, 'OUT0 (0x28),A: restore memory wait/mapping/protection port 0x28 to 0x04.'],
    [0x03E203, 'IN0 A,(0x28): read port 0x28 back for verification.'],
    [0x03E206, 'BIT 2,A: verify bit 2 is set after restoring port 0x28. Forward function expects/uses the cleared state.'],
    [0x03E208, 'JP Z,0x000066: failure path if bit 2 did not restore.'],
    [0x03E20C, 'CALL 0x03D202: stack bounds check helper; decoded below.'],
    [0x03E210, 'POP AF: restore saved AF after protection setup.'],
    [0x03E211, 'EI: re-enable interrupts after restoring protected state.'],
    [0x03E212, 'RET: return to caller.'],

    [0x03E18B, 'A = 0x00: forward path starts by clearing A.'],
    [0x03E18C, 'DI: disable interrupts.'],
    [0x03E18D, 'DI: repeated interrupt disable.'],
    [0x03E18E, 'IM 1: set interrupt mode 1.'],
    [0x03E190, 'OUT0 (0x28),A: clear memory wait/mapping/protection port 0x28 with 0x00.'],
    [0x03E193, 'IN0 A,(0x28): read port 0x28 back.'],
    [0x03E196, 'BIT 2,A: inspect memory protection bit after clear.'],
    [0x03E198, 'IN0 A,(0x06): read flash access/control port 0x06.'],
    [0x03E19B, 'RES 2,A: clear flash access bit 2. Reverse function restores it with SET 2,A.'],
    [0x03E19D, 'OUT0 (0x06),A: write modified flash control value.'],
    [0x03E1A0, 'A = 0x88: RAM protection clear/forward value.'],
    [0x03E1A2, 'OUT0 (0x24),A: write 0x88 to RAM protection port 0x24.'],
    [0x03E1A5, 'CP 0x88: verify RAM protection write value.'],
    [0x03E1A7, 'JP NZ,0x000066: failure path if verification fails.'],
    [0x03E1AB, 'POP AF: restore AF.'],
    [0x03E1AC, 'RET: return with interrupts still disabled by this routine.'],

    [0x03D202, 'Stack bounds check entry called by reverse setup before returning.'],
]);

function hex(value, width = 6) {
    return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatInstruction(inst) {
    const h = (v, w) => hex(v, w);
    switch (inst.tag) {
        case 'nop': return 'NOP';
        case 'push': return `PUSH ${inst.pair?.toUpperCase() ?? 'AF'}`;
        case 'pop': return `POP ${inst.pair?.toUpperCase() ?? 'AF'}`;
        case 'di': return 'DI';
        case 'ei': return 'EI';
        case 'ret': return 'RET';
        case 'ret-conditional': return `RET ${inst.condition?.toUpperCase()}`;
        case 'call': return `CALL ${h(inst.target)}`;
        case 'call-conditional': return `CALL ${inst.condition?.toUpperCase()},${h(inst.target)}`;
        case 'jp': return `JP ${h(inst.target)}`;
        case 'jp-conditional': return `JP ${inst.condition?.toUpperCase()},${h(inst.target)}`;
        case 'jr': return `JR ${h(inst.target)}`;
        case 'jr-conditional': return `JR ${inst.condition?.toUpperCase()},${h(inst.target)}`;
        case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.reg)?.toUpperCase()},${h(inst.value, 2)}`;
        case 'ld-pair-imm': return `LD ${inst.pair?.toUpperCase()},${h(inst.value)}`;
        case 'ld-pair-mem': return `LD ${inst.pair?.toUpperCase()},(${h(inst.addr)})`;
        case 'ld-mem-pair': return `LD (${h(inst.addr)}),${inst.pair?.toUpperCase()}`;
        case 'ld-reg-reg': return `LD ${inst.dest?.toUpperCase()},${inst.src?.toUpperCase()}`;
        case 'ld-reg-ind': return `LD ${inst.dest?.toUpperCase()},(${inst.src?.toUpperCase()})`;
        case 'ld-ind-reg': return `LD (${inst.dest?.toUpperCase()}),${inst.src?.toUpperCase()}`;
        case 'ld-ind-imm': return `LD (${inst.dest?.toUpperCase()}),${h(inst.value, 2)}`;
        case 'ld-mem-a': return `LD (${h(inst.addr)}),A`;
        case 'ld-a-mem': return `LD A,(${h(inst.addr)})`;
        case 'cp-imm': return `CP ${h(inst.value, 2)}`;
        case 'cp-reg': return `CP ${inst.reg?.toUpperCase()}`;
        case 'and-imm': return `AND ${h(inst.value, 2)}`;
        case 'and-reg': return `AND ${inst.reg?.toUpperCase()}`;
        case 'or-imm': return `OR ${h(inst.value, 2)}`;
        case 'or-reg': return `OR ${inst.reg?.toUpperCase()}`;
        case 'xor-reg': return `XOR ${inst.reg?.toUpperCase()}`;
        case 'xor-imm': return `XOR ${h(inst.value, 2)}`;
        case 'add-reg': return `ADD A,${inst.reg?.toUpperCase()}`;
        case 'add-imm': return `ADD A,${h(inst.value, 2)}`;
        case 'sub-imm': return `SUB ${h(inst.value, 2)}`;
        case 'sub-reg': return `SUB ${inst.reg?.toUpperCase()}`;
        case 'inc-reg': return `INC ${inst.reg?.toUpperCase()}`;
        case 'dec-reg': return `DEC ${inst.reg?.toUpperCase()}`;
        case 'inc-pair': return `INC ${inst.pair?.toUpperCase()}`;
        case 'dec-pair': return `DEC ${inst.pair?.toUpperCase()}`;
        case 'add-pair': return `ADD HL,${inst.pair?.toUpperCase()}`;
        case 'sbc-pair': return `SBC HL,${inst.pair?.toUpperCase()}`;
        case 'adc-pair': return `ADC HL,${inst.pair?.toUpperCase()}`;
        case 'bit-test': return `BIT ${inst.bit},${inst.reg?.toUpperCase()}`;
        case 'bit-test-ind': return `BIT ${inst.bit},(HL)`;
        case 'bit-set': return `SET ${inst.bit},${inst.reg?.toUpperCase()}`;
        case 'bit-set-ind': return `SET ${inst.bit},(HL)`;
        case 'bit-res': return `RES ${inst.bit},${inst.reg?.toUpperCase()}`;
        case 'bit-res-ind': return `RES ${inst.bit},(HL)`;
        case 'im': return `IM ${inst.value ?? '?'}`;
        case 'out0': return `OUT0 (${h(inst.port, 2)}),${inst.reg?.toUpperCase() ?? 'A'}`;
        case 'in0': return `IN0 ${inst.reg?.toUpperCase() ?? 'A'},(${h(inst.port, 2)})`;
        case 'out-c': return `OUT (C),${inst.reg?.toUpperCase()}`;
        case 'in-c': return `IN ${inst.reg?.toUpperCase()},(C)`;
        case 'ex-de-hl': return 'EX DE,HL';
        case 'ex-af': return "EX AF,AF'";
        case 'exx': return 'EXX';
        case 'ex-sp-hl': return 'EX (SP),HL';
        case 'rlca': return 'RLCA';
        case 'rrca': return 'RRCA';
        case 'rla': return 'RLA';
        case 'rra': return 'RRA';
        case 'cpl': return 'CPL';
        case 'scf': return 'SCF';
        case 'ccf': return 'CCF';
        case 'daa': return 'DAA';
        case 'halt': return 'HALT';
        case 'rst': return `RST ${h(inst.target, 2)}`;
        case 'djnz': return `DJNZ ${h(inst.target)}`;
        case 'ldir': return 'LDIR';
        case 'lddr': return 'LDDR';
        case 'cpir': return 'CPIR';
        case 'cpdr': return 'CPDR';
        case 'ld-sp-hl': return 'LD SP,HL';
        case 'ld-i-a': return 'LD I,A';
        case 'ld-a-i': return 'LD A,I';
        case 'ld-r-a': return 'LD R,A';
        case 'ld-a-r': return 'LD A,R';
        case 'neg': return 'NEG';
        case 'reti': return 'RETI';
        case 'retn': return 'RETN';
        case 'rotate-reg': return `${inst.op?.toUpperCase()} ${inst.reg?.toUpperCase()}`;
        case 'rotate-ind': return `${inst.op?.toUpperCase()} (HL)`;
        case 'alu-reg': return `${inst.op?.toUpperCase()} A,${inst.src?.toUpperCase()}`;
        case 'alu-imm': return `${inst.op?.toUpperCase()} A,${h(inst.value, 2)}`;
        case 'alu-ind': return `${inst.op?.toUpperCase()} A,(HL)`;
        case 'stmix': return 'STMIX';
        case 'rsmix': return 'RSMIX';
        case 'ld-a-mb': return 'LD A,MB';
        case 'ld-mb-a': return 'LD MB,A';
        case 'slp': return 'SLP';
        default: return inst.tag ?? '???';
    }
}

function bytesAt(start, length) {
    return Array.from(rom.slice(start, start + length))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
}

function disasm(start, maxBytes, label, stopAfterRet = false) {
    console.log(`\n=== ${label} at ${hex(start)} ===`);
    console.log(`Raw: ${bytesAt(start, maxBytes)}`);

    let pc = start;
    const end = start + maxBytes;
    while (pc < end) {
        const instr = decodeInstruction(rom, pc, 'adl');
        const instrBytes = bytesAt(pc, instr.length);
        const asmText = formatInstruction(instr);
        const note = annotations.get(pc);
        console.log(`  ${hex(pc)}: [${instrBytes}] ${asmText}${note ? ` ; ${note}` : ''}`);

        pc += instr.length;
        if (stopAfterRet && instr.tag === 'ret' && pc >= start + 30) {
            break;
        }
    }
}

function printComparison() {
    console.log('\n=== Protection State Comparison ===');
    console.log('Forward 0x03E18B clears/transitions into the unprotected handler state:');
    console.log('  - port 0x28 memory wait/mapping/protection: OUT0 0x00, then read/inspect bit 2');
    console.log('  - port 0x06 flash access/control: read, RES 2,A, write back');
    console.log('  - port 0x24 RAM protection: write and verify 0x88');
    console.log('  - interrupts are disabled with DI/DI and IM 1 is selected');
    console.log('');
    console.log('Reverse 0x03E1EB restores/transitions back to the protected runtime state:');
    console.log('  - port 0x24 RAM protection: write and verify 0x8C');
    console.log('  - port 0x06 flash access/control: read, SET 2,A, write back');
    console.log('  - port 0x28 memory wait/mapping/protection: write 0x04, read back, require bit 2 set');
    console.log('  - CALL 0x03D202 performs the stack bounds check helper decoded below');
    console.log('  - POP AF, EI, RET restores AF and re-enables interrupts before returning');
    console.log('');
    console.log('Both routines use JP 0x000066 as the protection verification failure path.');
}

disasm(0x03E1EB, 50, 'Reverse Memory Protection Setup (companion to 0x03E18B)', true);
disasm(0x03D202, 30, 'Stack Bounds Check Helper Called From 0x03E1EB', false);
disasm(0x03E18B, 50, 'Forward Memory Protection Clear/Handler Setup Reference', true);
printComparison();

console.log('\nRun with: node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase542-decode-03E1EB.mjs');
